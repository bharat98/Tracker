"""End-to-end backend tests for Job-Search CRM.

Covers: companies/contacts/messages/templates/events CRUD + side effects,
follow-ups, dashboard, AI endpoints (extract-url, nl-log, commit), CSV export.
"""
import os
import io
import zipfile
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # fallback read frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
                break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

TIMEOUT = 60


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def seeded(client):
    """Seed a company/contact for most tests; cleaned at session end."""
    suffix = uuid.uuid4().hex[:6]
    r = client.post(f"{API}/companies", json={"name": f"TEST_Acme_{suffix}", "role": "Staff Engineer", "location": "Remote"}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    company = r.json()
    r = client.post(f"{API}/contacts", json={"company_id": company["id"], "name": f"TEST_Jane_{suffix}", "title": "Head of Eng", "role_type": "hm"}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    contact = r.json()
    yield {"company": company, "contact": contact, "suffix": suffix}
    # teardown
    try:
        client.delete(f"{API}/companies/{company['id']}", timeout=TIMEOUT)
    except Exception:
        pass


class TestRoot:
    def test_root(self, client):
        r = client.get(f"{API}/", timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert d.get("service") == "job-search-crm"
        assert "version" in d


# -----------------------------
# Companies
# -----------------------------
class TestCompanies:
    def test_create_list_get(self, client):
        name = f"TEST_Co_{uuid.uuid4().hex[:6]}"
        r = client.post(f"{API}/companies", json={"name": name, "role": "SWE"}, timeout=TIMEOUT)
        assert r.status_code == 200
        c = r.json()
        assert c["name"] == name
        assert c["pipeline"] == "ongoing"
        assert c["current_stage"] == "sourced"
        cid = c["id"]

        # get
        r = client.get(f"{API}/companies/{cid}", timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json()["id"] == cid

        # list with search q
        r = client.get(f"{API}/companies?q={name}", timeout=TIMEOUT)
        assert r.status_code == 200
        ids = [row["id"] for row in r.json()]
        assert cid in ids

        # list filter by pipeline
        r = client.get(f"{API}/companies?pipeline=ongoing", timeout=TIMEOUT)
        assert r.status_code == 200
        for row in r.json():
            assert row["pipeline"] == "ongoing"
            assert "contact_count" in row
            assert "overdue_followups" in row

        # cleanup
        client.delete(f"{API}/companies/{cid}", timeout=TIMEOUT)

    def test_patch_pipeline_emits_event(self, client):
        r = client.post(f"{API}/companies", json={"name": f"TEST_Rej_{uuid.uuid4().hex[:6]}"}, timeout=TIMEOUT)
        cid = r.json()["id"]
        r = client.patch(f"{API}/companies/{cid}", json={"pipeline": "rejected"}, timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json()["pipeline"] == "rejected"
        # Verify event emitted
        r = client.get(f"{API}/events?company_id={cid}", timeout=TIMEOUT)
        assert r.status_code == 200
        kinds = [e["kind"] for e in r.json()]
        assert "rejected" in kinds
        client.delete(f"{API}/companies/{cid}", timeout=TIMEOUT)

    def test_delete_cascades(self, client):
        r = client.post(f"{API}/companies", json={"name": f"TEST_Casc_{uuid.uuid4().hex[:6]}"}, timeout=TIMEOUT)
        cid = r.json()["id"]
        r = client.post(f"{API}/contacts", json={"company_id": cid, "name": "TEST_Bob"}, timeout=TIMEOUT)
        ctid = r.json()["id"]
        r = client.post(f"{API}/messages", json={"contact_id": ctid, "body_summary": "hi"}, timeout=TIMEOUT)
        assert r.status_code == 200
        r = client.delete(f"{API}/companies/{cid}", timeout=TIMEOUT)
        assert r.status_code == 200
        # Verify gone
        r = client.get(f"{API}/companies/{cid}", timeout=TIMEOUT)
        assert r.status_code == 404
        r = client.get(f"{API}/contacts?company_id={cid}", timeout=TIMEOUT)
        assert r.json() == []


# -----------------------------
# Contacts
# -----------------------------
class TestContacts:
    def test_contact_crud_and_primary_uniqueness(self, client, seeded):
        company_id = seeded["company"]["id"]
        # add two contacts
        r1 = client.post(f"{API}/contacts", json={"company_id": company_id, "name": "TEST_A", "is_primary": True}, timeout=TIMEOUT)
        r2 = client.post(f"{API}/contacts", json={"company_id": company_id, "name": "TEST_B", "is_primary": True}, timeout=TIMEOUT)
        assert r1.status_code == 200 and r2.status_code == 200
        c1, c2 = r1.json(), r2.json()
        # Adding c2 as primary should unset c1's is_primary
        r = client.get(f"{API}/contacts?company_id={company_id}", timeout=TIMEOUT)
        data = {c["id"]: c for c in r.json()}
        assert data[c2["id"]]["is_primary"] is True
        assert data[c1["id"]]["is_primary"] is False

        # PATCH set c1 primary again
        r = client.patch(f"{API}/contacts/{c1['id']}", json={"is_primary": True}, timeout=TIMEOUT)
        assert r.status_code == 200
        r = client.get(f"{API}/contacts?company_id={company_id}", timeout=TIMEOUT)
        data = {c["id"]: c for c in r.json()}
        assert data[c1["id"]]["is_primary"] is True
        assert data[c2["id"]]["is_primary"] is False

        # DELETE c1 cascades messages
        client.post(f"{API}/messages", json={"contact_id": c1["id"], "body_summary": "x"}, timeout=TIMEOUT)
        r = client.delete(f"{API}/contacts/{c1['id']}", timeout=TIMEOUT)
        assert r.status_code == 200
        r = client.get(f"{API}/messages?contact_id={c1['id']}", timeout=TIMEOUT)
        assert r.json() == []

    def test_contact_requires_valid_company(self, client):
        r = client.post(f"{API}/contacts", json={"company_id": "does-not-exist", "name": "X"}, timeout=TIMEOUT)
        assert r.status_code == 404


# -----------------------------
# Templates
# -----------------------------
class TestTemplates:
    def test_create_detects_placeholders_double_braces(self, client):
        r = client.post(f"{API}/templates", json={
            "name": f"TEST_tmpl_{uuid.uuid4().hex[:6]}",
            "channel": "linkedin",
            "subject_template": "Hi {{name}}",
            "body_template": "Loved {{company}} work on {{role}}",
        }, timeout=TIMEOUT)
        assert r.status_code == 200
        t = r.json()
        assert set(t["placeholders"]) == {"name", "company", "role"}
        tid = t["id"]

        # PATCH recomputes placeholders
        r = client.patch(f"{API}/templates/{tid}", json={"body_template": "Hi {{name}}"}, timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json()["placeholders"] == ["name"]

        # list includes reply_rate
        r = client.get(f"{API}/templates", timeout=TIMEOUT)
        assert r.status_code == 200
        found = [x for x in r.json() if x["id"] == tid][0]
        assert "reply_rate" in found
        assert found["reply_rate"] == 0.0

        # usage empty
        r = client.get(f"{API}/templates/{tid}/usage", timeout=TIMEOUT)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

        client.delete(f"{API}/templates/{tid}", timeout=TIMEOUT)


# -----------------------------
# Messages (side effects)
# -----------------------------
class TestMessages:
    def test_outbound_with_template_bumps_use_count(self, client, seeded):
        tr = client.post(f"{API}/templates", json={
            "name": f"TEST_tm_{uuid.uuid4().hex[:6]}",
            "channel": "email",
            "body_template": "hello {{name}}",
        }, timeout=TIMEOUT)
        tid = tr.json()["id"]
        mr = client.post(f"{API}/messages", json={
            "contact_id": seeded["contact"]["id"],
            "direction": "outbound",
            "channel": "email",
            "body_summary": "hi",
            "template_id": tid,
        }, timeout=TIMEOUT)
        assert mr.status_code == 200
        r = client.get(f"{API}/templates", timeout=TIMEOUT)
        t = [x for x in r.json() if x["id"] == tid][0]
        assert t["use_count"] == 1
        client.delete(f"{API}/messages/{mr.json()['id']}", timeout=TIMEOUT)
        client.delete(f"{API}/templates/{tid}", timeout=TIMEOUT)

    def test_inbound_flips_outbound_and_bumps_reply_count(self, client, seeded):
        tr = client.post(f"{API}/templates", json={"name": f"TEST_tr_{uuid.uuid4().hex[:6]}", "body_template": "a"}, timeout=TIMEOUT)
        tid = tr.json()["id"]
        # outbound at t0 with template
        t0 = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        ob = client.post(f"{API}/messages", json={
            "contact_id": seeded["contact"]["id"], "direction": "outbound",
            "body_summary": "out", "template_id": tid, "sent_at": t0,
        }, timeout=TIMEOUT).json()
        # inbound now
        ib = client.post(f"{API}/messages", json={
            "contact_id": seeded["contact"]["id"], "direction": "inbound",
            "body_summary": "in",
        }, timeout=TIMEOUT).json()
        # verify outbound now replied=true
        r = client.get(f"{API}/messages?contact_id={seeded['contact']['id']}", timeout=TIMEOUT)
        items = {m["id"]: m for m in r.json()}
        assert items[ob["id"]]["replied"] is True
        # template reply_count bumped
        t = [x for x in client.get(f"{API}/templates", timeout=TIMEOUT).json() if x["id"] == tid][0]
        assert t["reply_count"] >= 1

        for mid in (ob["id"], ib["id"]):
            client.delete(f"{API}/messages/{mid}", timeout=TIMEOUT)
        client.delete(f"{API}/templates/{tid}", timeout=TIMEOUT)

    def test_patch_replied_bumps_reply_count(self, client, seeded):
        tr = client.post(f"{API}/templates", json={"name": f"TEST_p_{uuid.uuid4().hex[:6]}", "body_template": "a"}, timeout=TIMEOUT)
        tid = tr.json()["id"]
        ob = client.post(f"{API}/messages", json={
            "contact_id": seeded["contact"]["id"], "direction": "outbound",
            "body_summary": "o", "template_id": tid,
        }, timeout=TIMEOUT).json()
        before = [x for x in client.get(f"{API}/templates", timeout=TIMEOUT).json() if x["id"] == tid][0]["reply_count"]
        r = client.patch(f"{API}/messages/{ob['id']}", json={"replied": True}, timeout=TIMEOUT)
        assert r.status_code == 200
        after = [x for x in client.get(f"{API}/templates", timeout=TIMEOUT).json() if x["id"] == tid][0]["reply_count"]
        assert after == before + 1
        client.delete(f"{API}/messages/{ob['id']}", timeout=TIMEOUT)
        client.delete(f"{API}/templates/{tid}", timeout=TIMEOUT)

    def test_snooze_updates_next_followup(self, client, seeded):
        ob = client.post(f"{API}/messages", json={
            "contact_id": seeded["contact"]["id"], "body_summary": "s",
        }, timeout=TIMEOUT).json()
        r = client.post(f"{API}/messages/{ob['id']}/snooze?days=3", timeout=TIMEOUT)
        assert r.status_code == 200
        nfa = r.json()["next_followup_at"]
        # should be ~3 days from now
        dt = datetime.fromisoformat(nfa.replace("Z", "+00:00"))
        delta = dt - datetime.now(timezone.utc)
        assert 2.5 < delta.total_seconds() / 86400 < 3.5
        client.delete(f"{API}/messages/{ob['id']}", timeout=TIMEOUT)


# -----------------------------
# Events
# -----------------------------
class TestEvents:
    def test_events_crud(self, client, seeded):
        r = client.post(f"{API}/events", json={
            "company_id": seeded["company"]["id"], "kind": "applied", "actor": "me",
        }, timeout=TIMEOUT)
        assert r.status_code == 200
        eid = r.json()["id"]
        r = client.get(f"{API}/events?company_id={seeded['company']['id']}", timeout=TIMEOUT)
        assert r.status_code == 200
        assert any(e["id"] == eid for e in r.json())
        r = client.delete(f"{API}/events/{eid}", timeout=TIMEOUT)
        assert r.status_code == 200


# -----------------------------
# Followups
# -----------------------------
class TestFollowups:
    def test_followups_lists_overdue(self, client, seeded):
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        ob = client.post(f"{API}/messages", json={
            "contact_id": seeded["contact"]["id"], "direction": "outbound",
            "body_summary": "f", "next_followup_at": past,
        }, timeout=TIMEOUT).json()
        r = client.get(f"{API}/followups", timeout=TIMEOUT)
        assert r.status_code == 200
        ids = [m["id"] for m in r.json()]
        assert ob["id"] in ids
        # enriched with contact/company
        mine = [m for m in r.json() if m["id"] == ob["id"]][0]
        assert mine.get("contact") and mine.get("company")
        client.delete(f"{API}/messages/{ob['id']}", timeout=TIMEOUT)


# -----------------------------
# Dashboard
# -----------------------------
class TestDashboard:
    def test_dashboard_shape(self, client):
        r = client.get(f"{API}/dashboard", timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        for k in ("stats", "heatmap", "funnel", "channels", "template_leaderboard"):
            assert k in d
        assert "total" in d["stats"]
        # 24 weeks = ~168 days of buckets
        assert len(d["heatmap"]) >= 160
        for k in ("applied", "responded", "interviewed", "advanced", "offer", "rejected", "ghosted"):
            assert k in d["funnel"]


# -----------------------------
# CSV export
# -----------------------------
class TestExport:
    def test_zip_download(self, client):
        r = client.get(f"{API}/export/zip", timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/zip")
        z = zipfile.ZipFile(io.BytesIO(r.content))
        names = set(z.namelist())
        assert {"companies.csv", "contacts.csv", "messages.csv", "templates.csv", "events.csv"} == names


# -----------------------------
# AI endpoints
# -----------------------------
class TestAI:
    def test_extract_url_simple(self, client):
        r = client.post(f"{API}/ai/extract-url", json={"url": "https://example.com"}, timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert "company" in d and "role" in d and "location" in d

    def test_extract_url_unreachable(self, client):
        # Unreachable URL should not 5xx — LLM fallback should return empty strings
        r = client.post(f"{API}/ai/extract-url", json={"url": "https://this-domain-definitely-does-not-exist-xyz-123abc.example"}, timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert "company" in d

    def test_extract_url_empty_400(self, client):
        r = client.post(f"{API}/ai/extract-url", json={"url": ""}, timeout=TIMEOUT)
        assert r.status_code == 400

    def test_nl_log_and_commit(self, client):
        txt = "Sent a LinkedIn message to TEST_JaneAI_" + uuid.uuid4().hex[:4] + " at TEST_AcmeAI_" + uuid.uuid4().hex[:4] + " using my intro template, follow up in 3 days"
        r = client.post(f"{API}/ai/nl-log", json={"text": txt}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        parsed = r.json().get("parsed")
        assert isinstance(parsed, dict)
        assert (parsed.get("company") or {}).get("name")

        # commit
        r = client.post(f"{API}/ai/nl-log/commit", json={"parsed": parsed}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["company"]["id"]
        cid = d["company"]["id"]
        # verify it's searchable
        rr = client.get(f"{API}/companies/{cid}", timeout=TIMEOUT)
        assert rr.status_code == 200
        # cleanup
        client.delete(f"{API}/companies/{cid}", timeout=TIMEOUT)
