"""Job-Search CRM backend — FastAPI + MongoDB.

Single-user outbound CRM. Every entity is flat and indexable so an
LLM can later answer "what's working?" The app layer enforces enums
(Mongo is schemaless); keep Literal types honest.
"""

from fastapi import FastAPI, APIRouter, HTTPException, Query, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import io
import csv
import json
import zipfile
import logging
import uuid
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Dict, Any

import requests
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field, ConfigDict

from emergentintegrations.llm.chat import LlmChat, UserMessage


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Job-Search CRM")
api = APIRouter(prefix="/api")

logger = logging.getLogger("crm")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


# ---------------------------------------------------------------------------
# Enums (as Literal) — enforced at pydantic boundary
# ---------------------------------------------------------------------------

PipelineT = Literal["ongoing", "rejected", "withdrawn", "offer"]
StageT = Literal["sourced", "applied", "screen", "interview", "final", "offer", "closed"]
RoleTypeT = Literal["hm", "recruiter", "referral", "cold_reach", "employee"]
ConnStatusT = Literal["none", "pending", "accepted", "declined"]
DirectionT = Literal["outbound", "inbound"]
ChannelT = Literal["linkedin", "email", "phone", "in_person", "other", "portal", "video"]
TemplateChannelT = Literal["linkedin", "email"]
EventKindT = Literal[
    "applied", "responded", "scheduled", "interviewed", "advanced",
    "offer_received", "offer_accepted", "rejected", "ghosted", "withdrew", "note",
]
ActorT = Literal["me", "them"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    return dt.isoformat()


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    if isinstance(s, datetime):
        return s
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _serialize(doc: dict) -> dict:
    """Strip _id and stringify datetimes for JSON transport."""
    if not doc:
        return doc
    doc.pop("_id", None)
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class Company(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    role: Optional[str] = ""
    location: Optional[str] = ""
    job_url: Optional[str] = ""
    source: Optional[str] = ""
    pipeline: PipelineT = "ongoing"
    current_stage: StageT = "sourced"
    resume_version: Optional[str] = ""
    notes: Optional[str] = ""
    created_at: datetime = Field(default_factory=_now)


class CompanyCreate(BaseModel):
    name: str
    role: Optional[str] = ""
    location: Optional[str] = ""
    job_url: Optional[str] = ""
    source: Optional[str] = ""
    pipeline: PipelineT = "ongoing"
    current_stage: StageT = "sourced"
    resume_version: Optional[str] = ""
    notes: Optional[str] = ""


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    location: Optional[str] = None
    job_url: Optional[str] = None
    source: Optional[str] = None
    pipeline: Optional[PipelineT] = None
    current_stage: Optional[StageT] = None
    resume_version: Optional[str] = None
    notes: Optional[str] = None


class Contact(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    name: str
    title: Optional[str] = ""
    email: Optional[str] = ""
    linkedin_url: Optional[str] = ""
    role_type: RoleTypeT = "cold_reach"
    connection_status: ConnStatusT = "none"
    is_primary: bool = False
    notes: Optional[str] = ""
    created_at: datetime = Field(default_factory=_now)


class ContactCreate(BaseModel):
    company_id: str
    name: str
    title: Optional[str] = ""
    email: Optional[str] = ""
    linkedin_url: Optional[str] = ""
    role_type: RoleTypeT = "cold_reach"
    connection_status: ConnStatusT = "none"
    is_primary: bool = False
    notes: Optional[str] = ""


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    linkedin_url: Optional[str] = None
    role_type: Optional[RoleTypeT] = None
    connection_status: Optional[ConnStatusT] = None
    is_primary: Optional[bool] = None
    notes: Optional[str] = None


class Message(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    contact_id: str
    direction: DirectionT = "outbound"
    channel: ChannelT = "linkedin"
    subject: Optional[str] = ""
    body_summary: str
    full_body: Optional[str] = ""
    template_id: Optional[str] = None
    sent_at: datetime = Field(default_factory=_now)
    next_followup_at: Optional[datetime] = None
    replied: bool = False


class MessageCreate(BaseModel):
    contact_id: str
    direction: DirectionT = "outbound"
    channel: ChannelT = "linkedin"
    subject: Optional[str] = ""
    body_summary: str
    full_body: Optional[str] = ""
    template_id: Optional[str] = None
    sent_at: Optional[str] = None  # iso
    next_followup_at: Optional[str] = None


class MessageUpdate(BaseModel):
    body_summary: Optional[str] = None
    full_body: Optional[str] = None
    subject: Optional[str] = None
    channel: Optional[ChannelT] = None
    next_followup_at: Optional[str] = None
    replied: Optional[bool] = None


class Template(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    channel: TemplateChannelT = "email"
    subject_template: Optional[str] = ""
    body_template: str
    placeholders: List[str] = []
    use_count: int = 0
    reply_count: int = 0
    created_at: datetime = Field(default_factory=_now)


class TemplateCreate(BaseModel):
    name: str
    channel: TemplateChannelT = "email"
    subject_template: Optional[str] = ""
    body_template: str


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    channel: Optional[TemplateChannelT] = None
    subject_template: Optional[str] = None
    body_template: Optional[str] = None


class Event(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    kind: EventKindT = "note"
    actor: ActorT = "me"
    channel: ChannelT = "other"
    timestamp: datetime = Field(default_factory=_now)
    notes: Optional[str] = ""


class EventCreate(BaseModel):
    company_id: str
    kind: EventKindT = "note"
    actor: ActorT = "me"
    channel: ChannelT = "other"
    timestamp: Optional[str] = None
    notes: Optional[str] = ""


# ---------------------------------------------------------------------------
# Template placeholder detection
# ---------------------------------------------------------------------------

PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")


def detect_placeholders(*parts: str) -> List[str]:
    seen: List[str] = []
    for p in parts:
        if not p:
            continue
        for m in PLACEHOLDER_RE.findall(p):
            if m not in seen:
                seen.append(m)
    return seen


# ---------------------------------------------------------------------------
# Companies
# ---------------------------------------------------------------------------

@api.get("/companies")
async def list_companies(pipeline: Optional[str] = None, q: Optional[str] = None):
    query: Dict[str, Any] = {}
    if pipeline and pipeline != "all":
        query["pipeline"] = pipeline
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"role": {"$regex": q, "$options": "i"}},
        ]
    rows = await db.companies.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)

    # attach primary contact + last activity + overdue count for list view
    company_ids = [r["id"] for r in rows]
    contacts = await db.contacts.find({"company_id": {"$in": company_ids}}, {"_id": 0}).to_list(5000)
    by_company: Dict[str, List[dict]] = {}
    for c in contacts:
        by_company.setdefault(c["company_id"], []).append(c)

    contact_ids_all = [c["id"] for c in contacts]
    msgs = await db.messages.find({"contact_id": {"$in": contact_ids_all}}, {"_id": 0}).to_list(20000)
    msgs_by_contact: Dict[str, List[dict]] = {}
    for m in msgs:
        msgs_by_contact.setdefault(m["contact_id"], []).append(m)

    now_iso = _now().isoformat()
    out = []
    for r in rows:
        cs = by_company.get(r["id"], [])
        primary = next((c for c in cs if c.get("is_primary")), (cs[0] if cs else None))
        last_activity = None
        overdue = 0
        for c in cs:
            for m in msgs_by_contact.get(c["id"], []):
                ts = m.get("sent_at") or m.get("next_followup_at")
                if ts and (not last_activity or ts > last_activity):
                    last_activity = ts
                if (
                    m.get("direction") == "outbound"
                    and not m.get("replied")
                    and m.get("next_followup_at")
                    and m["next_followup_at"] <= now_iso
                ):
                    overdue += 1
        out.append({
            **r,
            "contact_count": len(cs),
            "primary_contact": primary,
            "last_activity_at": last_activity,
            "overdue_followups": overdue,
        })
    return out


@api.get("/companies/{company_id}")
async def get_company(company_id: str):
    doc = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Company not found")
    return doc


@api.post("/companies")
async def create_company(payload: CompanyCreate):
    obj = Company(**payload.model_dump())
    doc = obj.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.companies.insert_one(doc)
    return obj.model_dump(mode="json")


@api.patch("/companies/{company_id}")
async def update_company(company_id: str, payload: CompanyUpdate):
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not updates:
        doc = await db.companies.find_one({"id": company_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404)
        return doc
    res = await db.companies.update_one({"id": company_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404)

    # auto-emit pipeline events
    if "pipeline" in updates:
        kind_map = {"rejected": "rejected", "withdrawn": "withdrew", "offer": "offer_received"}
        k = kind_map.get(updates["pipeline"])
        if k:
            ev = Event(company_id=company_id, kind=k, actor="them" if k != "withdrew" else "me")
            doc = ev.model_dump()
            doc["timestamp"] = doc["timestamp"].isoformat()
            await db.events.insert_one(doc)

    return await db.companies.find_one({"id": company_id}, {"_id": 0})


@api.delete("/companies/{company_id}")
async def delete_company(company_id: str):
    contacts = await db.contacts.find({"company_id": company_id}, {"_id": 0, "id": 1}).to_list(1000)
    cids = [c["id"] for c in contacts]
    await db.messages.delete_many({"contact_id": {"$in": cids}})
    await db.contacts.delete_many({"company_id": company_id})
    await db.events.delete_many({"company_id": company_id})
    res = await db.companies.delete_one({"id": company_id})
    if res.deleted_count == 0:
        raise HTTPException(404)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------

@api.get("/contacts")
async def list_contacts(company_id: Optional[str] = None):
    q = {}
    if company_id:
        q["company_id"] = company_id
    rows = await db.contacts.find(q, {"_id": 0}).sort("created_at", 1).to_list(5000)
    return rows


@api.post("/contacts")
async def create_contact(payload: ContactCreate):
    # make sure company exists
    company = await db.companies.find_one({"id": payload.company_id}, {"_id": 0})
    if not company:
        raise HTTPException(404, "Company not found")
    obj = Contact(**payload.model_dump())
    if obj.is_primary:
        await db.contacts.update_many({"company_id": obj.company_id}, {"$set": {"is_primary": False}})
    doc = obj.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.contacts.insert_one(doc)
    return obj.model_dump(mode="json")


@api.patch("/contacts/{contact_id}")
async def update_contact(contact_id: str, payload: ContactUpdate):
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    existing = await db.contacts.find_one({"id": contact_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404)
    if updates.get("is_primary"):
        await db.contacts.update_many(
            {"company_id": existing["company_id"]}, {"$set": {"is_primary": False}}
        )
    if updates:
        await db.contacts.update_one({"id": contact_id}, {"$set": updates})
    return await db.contacts.find_one({"id": contact_id}, {"_id": 0})


@api.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str):
    await db.messages.delete_many({"contact_id": contact_id})
    res = await db.contacts.delete_one({"id": contact_id})
    if res.deleted_count == 0:
        raise HTTPException(404)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

@api.get("/messages")
async def list_messages(contact_id: Optional[str] = None, company_id: Optional[str] = None):
    if company_id and not contact_id:
        cs = await db.contacts.find({"company_id": company_id}, {"_id": 0, "id": 1}).to_list(5000)
        cids = [c["id"] for c in cs]
        rows = await db.messages.find({"contact_id": {"$in": cids}}, {"_id": 0}).sort("sent_at", -1).to_list(5000)
        return rows
    q = {}
    if contact_id:
        q["contact_id"] = contact_id
    rows = await db.messages.find(q, {"_id": 0}).sort("sent_at", -1).to_list(5000)
    return rows


@api.post("/messages")
async def create_message(payload: MessageCreate):
    contact = await db.contacts.find_one({"id": payload.contact_id}, {"_id": 0})
    if not contact:
        raise HTTPException(404, "Contact not found")
    data = payload.model_dump()
    sent_at = _parse_iso(data.pop("sent_at", None)) or _now()
    nf = _parse_iso(data.pop("next_followup_at", None))
    data["sent_at"] = sent_at
    data["next_followup_at"] = nf
    obj = Message(**data)
    doc = obj.model_dump()
    doc["sent_at"] = doc["sent_at"].isoformat()
    doc["next_followup_at"] = _iso(doc.get("next_followup_at"))

    await db.messages.insert_one(doc)

    # If inbound, flip outbound siblings since last inbound → replied=true.
    if obj.direction == "inbound":
        outs = await db.messages.find(
            {"contact_id": obj.contact_id, "direction": "outbound", "replied": False, "sent_at": {"$lt": doc["sent_at"]}},
            {"_id": 0},
        ).to_list(1000)
        if outs:
            await db.messages.update_many(
                {"id": {"$in": [m["id"] for m in outs]}}, {"$set": {"replied": True}},
            )
            # bump template reply_count per unique template
            tmpl_ids = {m.get("template_id") for m in outs if m.get("template_id")}
            for t in tmpl_ids:
                await db.templates.update_one({"id": t}, {"$inc": {"reply_count": 1}})

    # bump template use_count
    if obj.template_id and obj.direction == "outbound":
        await db.templates.update_one({"id": obj.template_id}, {"$inc": {"use_count": 1}})

    return obj.model_dump(mode="json")


@api.patch("/messages/{message_id}")
async def update_message(message_id: str, payload: MessageUpdate):
    existing = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404)
    updates: Dict[str, Any] = {}
    for k, v in payload.model_dump(exclude_none=True).items():
        if k == "next_followup_at":
            updates[k] = _iso(_parse_iso(v))
        else:
            updates[k] = v
    if updates:
        await db.messages.update_one({"id": message_id}, {"$set": updates})

        # mark replied bumps template reply_count once
        if updates.get("replied") and existing.get("template_id") and not existing.get("replied"):
            await db.templates.update_one({"id": existing["template_id"]}, {"$inc": {"reply_count": 1}})
    return await db.messages.find_one({"id": message_id}, {"_id": 0})


@api.delete("/messages/{message_id}")
async def delete_message(message_id: str):
    res = await db.messages.delete_one({"id": message_id})
    if res.deleted_count == 0:
        raise HTTPException(404)
    return {"ok": True}


@api.post("/messages/{message_id}/snooze")
async def snooze(message_id: str, days: int = Query(3, ge=1, le=90)):
    existing = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404)
    new_dt = _now() + timedelta(days=days)
    await db.messages.update_one({"id": message_id}, {"$set": {"next_followup_at": new_dt.isoformat()}})
    return {"ok": True, "next_followup_at": new_dt.isoformat()}


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

@api.get("/templates")
async def list_templates():
    rows = await db.templates.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for r in rows:
        uc = r.get("use_count", 0) or 0
        rc = r.get("reply_count", 0) or 0
        r["reply_rate"] = round((rc / uc) * 100, 1) if uc else 0.0
    return rows


@api.post("/templates")
async def create_template(payload: TemplateCreate):
    placeholders = detect_placeholders(payload.subject_template or "", payload.body_template)
    obj = Template(**payload.model_dump(), placeholders=placeholders)
    doc = obj.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.templates.insert_one(doc)
    return obj.model_dump(mode="json")


@api.patch("/templates/{template_id}")
async def update_template(template_id: str, payload: TemplateUpdate):
    existing = await db.templates.find_one({"id": template_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404)
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if "body_template" in updates or "subject_template" in updates:
        s = updates.get("subject_template", existing.get("subject_template", ""))
        b = updates.get("body_template", existing.get("body_template", ""))
        updates["placeholders"] = detect_placeholders(s or "", b or "")
    if updates:
        await db.templates.update_one({"id": template_id}, {"$set": updates})
    return await db.templates.find_one({"id": template_id}, {"_id": 0})


@api.delete("/templates/{template_id}")
async def delete_template(template_id: str):
    res = await db.templates.delete_one({"id": template_id})
    if res.deleted_count == 0:
        raise HTTPException(404)
    return {"ok": True}


@api.get("/templates/{template_id}/usage")
async def template_usage(template_id: str):
    msgs = await db.messages.find({"template_id": template_id}, {"_id": 0}).sort("sent_at", -1).to_list(1000)
    cids = list({m["contact_id"] for m in msgs})
    contacts = await db.contacts.find({"id": {"$in": cids}}, {"_id": 0}).to_list(1000)
    cmap = {c["id"]: c for c in contacts}
    company_ids = list({c["company_id"] for c in contacts})
    companies = await db.companies.find({"id": {"$in": company_ids}}, {"_id": 0}).to_list(1000)
    cmp = {c["id"]: c for c in companies}
    for m in msgs:
        c = cmap.get(m["contact_id"])
        m["contact"] = c
        m["company"] = cmp.get(c["company_id"]) if c else None
    return msgs


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

@api.get("/events")
async def list_events(company_id: Optional[str] = None):
    q = {}
    if company_id:
        q["company_id"] = company_id
    rows = await db.events.find(q, {"_id": 0}).sort("timestamp", -1).to_list(5000)
    return rows


@api.post("/events")
async def create_event(payload: EventCreate):
    data = payload.model_dump()
    ts = _parse_iso(data.pop("timestamp", None)) or _now()
    data["timestamp"] = ts
    obj = Event(**data)
    doc = obj.model_dump()
    doc["timestamp"] = doc["timestamp"].isoformat()
    await db.events.insert_one(doc)
    return obj.model_dump(mode="json")


@api.delete("/events/{event_id}")
async def delete_event(event_id: str):
    res = await db.events.delete_one({"id": event_id})
    if res.deleted_count == 0:
        raise HTTPException(404)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Follow-ups (today view)
# ---------------------------------------------------------------------------

@api.get("/followups")
async def followups():
    now_iso = _now().isoformat()
    msgs = await db.messages.find(
        {
            "direction": "outbound",
            "replied": False,
            "next_followup_at": {"$ne": None, "$lte": now_iso},
        },
        {"_id": 0},
    ).sort("next_followup_at", 1).to_list(2000)

    cids = list({m["contact_id"] for m in msgs})
    contacts = await db.contacts.find({"id": {"$in": cids}}, {"_id": 0}).to_list(2000)
    cmap = {c["id"]: c for c in contacts}
    cmp_ids = list({c["company_id"] for c in contacts})
    cmp_list = await db.companies.find({"id": {"$in": cmp_ids}}, {"_id": 0}).to_list(2000)
    cmp = {c["id"]: c for c in cmp_list}

    out = []
    for m in msgs:
        c = cmap.get(m["contact_id"])
        out.append({
            **m,
            "contact": c,
            "company": cmp.get(c["company_id"]) if c else None,
        })
    return out


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@api.get("/dashboard")
async def dashboard():
    companies = await db.companies.find({}, {"_id": 0}).to_list(5000)
    total = len(companies)
    ongoing = sum(1 for c in companies if c.get("pipeline") == "ongoing")
    rejected = sum(1 for c in companies if c.get("pipeline") == "rejected")
    withdrawn = sum(1 for c in companies if c.get("pipeline") == "withdrawn")
    offer = sum(1 for c in companies if c.get("pipeline") == "offer")

    events = await db.events.find({}, {"_id": 0}).to_list(20000)

    now = _now()
    week_ago = now - timedelta(days=7)
    interviews_this_week = sum(
        1 for e in events
        if e.get("kind") == "interviewed" and _parse_iso(e.get("timestamp")) and _parse_iso(e["timestamp"]) >= week_ago
    )

    # overdue followups
    now_iso = now.isoformat()
    overdue_count = await db.messages.count_documents({
        "direction": "outbound", "replied": False,
        "next_followup_at": {"$ne": None, "$lte": now_iso},
    })

    # 24-week heatmap. Bucket by day. Counts = messages + events.
    msgs = await db.messages.find({}, {"_id": 0, "sent_at": 1}).to_list(20000)
    days: Dict[str, int] = {}
    start_day = (now - timedelta(weeks=24)).replace(hour=0, minute=0, second=0, microsecond=0)
    for m in msgs:
        dt = _parse_iso(m.get("sent_at"))
        if dt and dt >= start_day:
            key = dt.date().isoformat()
            days[key] = days.get(key, 0) + 1
    for e in events:
        dt = _parse_iso(e.get("timestamp"))
        if dt and dt >= start_day:
            key = dt.date().isoformat()
            days[key] = days.get(key, 0) + 1

    heatmap = []
    d = start_day.date()
    end = now.date()
    while d <= end:
        iso = d.isoformat()
        heatmap.append({"date": iso, "count": days.get(iso, 0)})
        d = d + timedelta(days=1)

    # Funnel (from events)
    kinds = {}
    for e in events:
        kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
    funnel = {
        "applied": kinds.get("applied", 0),
        "responded": kinds.get("responded", 0),
        "interviewed": kinds.get("interviewed", 0),
        "advanced": kinds.get("advanced", 0),
        "offer": kinds.get("offer_received", 0),
        "rejected": kinds.get("rejected", 0),
        "ghosted": kinds.get("ghosted", 0),
    }

    # Channel effectiveness: outbound per channel, with reply rate
    out_msgs = await db.messages.find({"direction": "outbound"}, {"_id": 0}).to_list(20000)
    by_ch: Dict[str, Dict[str, int]] = {}
    for m in out_msgs:
        ch = m.get("channel") or "other"
        d2 = by_ch.setdefault(ch, {"sent": 0, "replied": 0})
        d2["sent"] += 1
        if m.get("replied"):
            d2["replied"] += 1
    channels = [
        {
            "channel": ch,
            "sent": v["sent"],
            "replied": v["replied"],
            "reply_rate": round(v["replied"] / v["sent"] * 100, 1) if v["sent"] else 0.0,
        }
        for ch, v in by_ch.items()
    ]
    channels.sort(key=lambda x: -x["sent"])

    # Template leaderboard
    tmpls = await db.templates.find({}, {"_id": 0}).to_list(500)
    for t in tmpls:
        uc = t.get("use_count", 0) or 0
        rc = t.get("reply_count", 0) or 0
        t["reply_rate"] = round((rc / uc) * 100, 1) if uc else 0.0
    leaderboard = sorted(tmpls, key=lambda t: (-(t.get("use_count", 0) or 0), -(t.get("reply_rate", 0))))[:5]

    return {
        "stats": {
            "total": total,
            "ongoing": ongoing,
            "rejected": rejected,
            "withdrawn": withdrawn,
            "offer": offer,
            "interviews_this_week": interviews_this_week,
            "overdue_followups": overdue_count,
        },
        "heatmap": heatmap,
        "funnel": funnel,
        "channels": channels,
        "template_leaderboard": leaderboard,
    }


# ---------------------------------------------------------------------------
# AI endpoints
# ---------------------------------------------------------------------------

def _llm() -> LlmChat:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY not configured")
    return LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"crm-{uuid.uuid4()}",
        system_message=(
            "You are a precise data-extraction assistant for a job-search CRM. "
            "You always output valid JSON only — no prose, no markdown fences."
        ),
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")


def _extract_json(s: str) -> dict:
    """Best-effort JSON extraction; strips ```json fences if present."""
    if not s:
        return {}
    s = s.strip()
    if s.startswith("```"):
        s = s.strip("`")
        if s.lower().startswith("json"):
            s = s[4:]
        s = s.strip()
    # Find outermost braces
    start = s.find("{")
    end = s.rfind("}")
    if start != -1 and end != -1 and end > start:
        s = s[start:end + 1]
    try:
        return json.loads(s)
    except Exception as e:
        logger.warning("JSON parse failed: %s; raw=%s", e, s[:200])
        return {}


class UrlExtractRequest(BaseModel):
    url: str


@api.post("/ai/extract-url")
async def ai_extract_url(req: UrlExtractRequest):
    url = req.url.strip()
    if not url:
        raise HTTPException(400, "URL required")

    # Fast path: try OG tags
    html = ""
    try:
        r = requests.get(
            url, timeout=8,
            headers={"User-Agent": "Mozilla/5.0 (JobSearchCRM)"},
        )
        html = r.text or ""
    except Exception as e:
        logger.warning("URL fetch failed %s: %s", url, e)

    og = {}
    if html:
        try:
            soup = BeautifulSoup(html, "html.parser")
            for tag in soup.find_all("meta"):
                prop = tag.get("property") or tag.get("name")
                if prop and prop.lower().startswith("og:"):
                    og[prop.lower()] = tag.get("content") or ""
            if soup.title and soup.title.string:
                og["__title"] = soup.title.string.strip()
        except Exception:
            pass

    # Build snippet for LLM
    text_snippet = ""
    if html:
        try:
            soup = BeautifulSoup(html, "html.parser")
            for t in soup(["script", "style", "noscript"]):
                t.decompose()
            text_snippet = re.sub(r"\s+", " ", soup.get_text(" "))[:6000]
        except Exception:
            text_snippet = html[:6000]

    prompt = (
        "From this job listing, extract company, role (job title), and location. "
        "Return ONLY JSON: {\"company\": string, \"role\": string, \"location\": string}. "
        "Use empty string if unknown.\n\n"
        f"URL: {url}\n"
        f"OG tags: {json.dumps(og)[:1000]}\n"
        f"Page text (truncated):\n{text_snippet}"
    )
    try:
        chat = _llm()
        resp = await chat.send_message(UserMessage(text=prompt))
        parsed = _extract_json(resp)
    except Exception as e:
        logger.exception("AI url extract failed")
        raise HTTPException(502, f"LLM error: {e}")

    return {
        "url": url,
        "company": parsed.get("company", ""),
        "role": parsed.get("role", ""),
        "location": parsed.get("location", ""),
    }


class NlLogRequest(BaseModel):
    text: str


@api.post("/ai/nl-log")
async def ai_nl_log(req: NlLogRequest):
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(400, "text required")

    # Provide context of templates/companies so the LLM can match
    tmpls = await db.templates.find({}, {"_id": 0, "id": 1, "name": 1, "channel": 1}).to_list(200)
    companies = await db.companies.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)

    prompt = (
        "Parse this single-sentence job-search log into structured JSON. "
        "Return ONLY JSON with this shape:\n"
        "{\n"
        '  "company": {"name": string, "role": string?, "location": string?},\n'
        '  "contact": {"name": string, "title": string?, "role_type": '
        '"hm|recruiter|referral|cold_reach|employee"},\n'
        '  "message": {"direction": "outbound|inbound", '
        '"channel": "linkedin|email|phone|in_person|other", '
        '"body_summary": string, "template_hint": string?, "next_followup_days": number?, "subject": string?},\n'
        '  "event": {"kind": "applied|responded|scheduled|interviewed|advanced|offer_received|offer_accepted|rejected|ghosted|withdrew|note"}?\n'
        "}\n"
        "- Use empty string for unknown strings; omit keys you truly can't infer.\n"
        "- If the user mentions 'applied' or 'submitted application', set message to null and include an event.\n"
        f"Known templates: {json.dumps(tmpls)}\n"
        f"Known companies: {json.dumps(companies)}\n"
        f"Input: {text}"
    )

    try:
        chat = _llm()
        resp = await chat.send_message(UserMessage(text=prompt))
        parsed = _extract_json(resp)
    except Exception as e:
        logger.exception("AI nl log failed")
        raise HTTPException(502, f"LLM error: {e}")
    return {"parsed": parsed, "raw": resp if isinstance(resp, str) else str(resp)}


class NlLogCommit(BaseModel):
    parsed: Dict[str, Any]


@api.post("/ai/nl-log/commit")
async def ai_nl_log_commit(req: NlLogCommit):
    p = req.parsed or {}
    cname = (p.get("company") or {}).get("name")
    if not cname:
        raise HTTPException(400, "company.name required")

    # find or create company (case-insensitive name match)
    company = await db.companies.find_one({"name": {"$regex": f"^{re.escape(cname)}$", "$options": "i"}}, {"_id": 0})
    created_company = False
    if not company:
        c = Company(
            name=cname,
            role=(p.get("company") or {}).get("role", "") or "",
            location=(p.get("company") or {}).get("location", "") or "",
        )
        doc = c.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        await db.companies.insert_one(doc)
        company = doc
        created_company = True

    contact = None
    created_contact = False
    cdata = p.get("contact") or {}
    if cdata.get("name"):
        contact = await db.contacts.find_one(
            {"company_id": company["id"], "name": {"$regex": f"^{re.escape(cdata['name'])}$", "$options": "i"}},
            {"_id": 0},
        )
        if not contact:
            ctc = Contact(
                company_id=company["id"],
                name=cdata["name"],
                title=cdata.get("title", "") or "",
                role_type=cdata.get("role_type", "cold_reach") or "cold_reach",
            )
            d = ctc.model_dump()
            d["created_at"] = d["created_at"].isoformat()
            await db.contacts.insert_one(d)
            contact = d
            created_contact = True

    message = None
    mdata = p.get("message")
    if mdata and contact:
        tmpl_id = None
        if mdata.get("template_hint"):
            t = await db.templates.find_one(
                {"name": {"$regex": re.escape(mdata["template_hint"]), "$options": "i"}},
                {"_id": 0, "id": 1},
            )
            if t:
                tmpl_id = t["id"]

        nf_days = mdata.get("next_followup_days")
        nf = None
        if isinstance(nf_days, (int, float)) and nf_days > 0:
            nf = _now() + timedelta(days=float(nf_days))

        msg = Message(
            contact_id=contact["id"],
            direction=mdata.get("direction", "outbound"),
            channel=mdata.get("channel", "linkedin"),
            subject=mdata.get("subject", "") or "",
            body_summary=mdata.get("body_summary", "") or text_fallback(p),
            template_id=tmpl_id,
            next_followup_at=nf,
        )
        d = msg.model_dump()
        d["sent_at"] = d["sent_at"].isoformat()
        d["next_followup_at"] = _iso(d.get("next_followup_at"))
        await db.messages.insert_one(d)
        message = d
        if tmpl_id and msg.direction == "outbound":
            await db.templates.update_one({"id": tmpl_id}, {"$inc": {"use_count": 1}})

    event = None
    edata = p.get("event") or None
    if edata and edata.get("kind"):
        ev = Event(company_id=company["id"], kind=edata["kind"], actor=edata.get("actor", "me"))
        d = ev.model_dump()
        d["timestamp"] = d["timestamp"].isoformat()
        await db.events.insert_one(d)
        event = d

    return {
        "company": _serialize(company),
        "created_company": created_company,
        "contact": _serialize(contact) if contact else None,
        "created_contact": created_contact,
        "message": _serialize(message) if message else None,
        "event": _serialize(event) if event else None,
    }


def text_fallback(parsed: dict) -> str:
    m = parsed.get("message") or {}
    ch = m.get("channel", "message")
    return f"{ch.capitalize()} outreach"


# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------

async def _csv(collection: str, cols: List[str]) -> bytes:
    rows = await db[collection].find({}, {"_id": 0}).to_list(50000)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        for c in cols:
            if isinstance(r.get(c), (list, dict)):
                r[c] = json.dumps(r[c])
        w.writerow(r)
    return buf.getvalue().encode("utf-8")


@api.get("/export/zip")
async def export_zip():
    cols = {
        "companies": ["id", "name", "role", "location", "job_url", "source",
                      "pipeline", "current_stage", "resume_version", "notes", "created_at"],
        "contacts": ["id", "company_id", "name", "title", "email", "linkedin_url",
                     "role_type", "connection_status", "is_primary", "notes", "created_at"],
        "messages": ["id", "contact_id", "direction", "channel", "subject", "body_summary",
                     "full_body", "template_id", "sent_at", "next_followup_at", "replied"],
        "templates": ["id", "name", "channel", "subject_template", "body_template",
                      "placeholders", "use_count", "reply_count", "created_at"],
        "events": ["id", "company_id", "kind", "actor", "channel", "timestamp", "notes"],
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for coll, c in cols.items():
            z.writestr(f"{coll}.csv", await _csv(coll, c))
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="crm-export.zip"'},
    )


# ---------------------------------------------------------------------------
# Root + wiring
# ---------------------------------------------------------------------------

@api.get("/")
async def root():
    return {"service": "job-search-crm", "version": "1.0.0"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
