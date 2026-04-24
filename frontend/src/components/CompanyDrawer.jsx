import React, { useEffect, useMemo, useState } from "react";
import { api, PIPELINES, STAGES, fmtRelative, fmtDate } from "../lib/api";
import { Drawer, Field, Select, Pill, Spinner, EmptyState } from "./primitives";
import { Plus, Star, Trash2, MessageSquarePlus, X, Linkedin, Mail } from "lucide-react";
import AddContactModal from "./AddContactModal";
import LogMessageModal from "./LogMessageModal";

export default function CompanyDrawer({ companyId, open, onClose, onChange }) {
    const [tab, setTab] = useState("contacts");
    const [company, setCompany] = useState(null);
    const [contacts, setContacts] = useState([]);
    const [messages, setMessages] = useState([]);
    const [events, setEvents] = useState([]);
    const [addContactOpen, setAddContactOpen] = useState(false);
    const [logMsgFor, setLogMsgFor] = useState(null); // contact for log modal
    const [loading, setLoading] = useState(false);

    const load = async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const [co, cs, ms, es] = await Promise.all([
                api.getCompany(companyId),
                api.listContacts(companyId),
                api.listMessages({ company_id: companyId }),
                api.listEvents(companyId),
            ]);
            setCompany(co);
            setContacts(cs || []);
            setMessages(ms || []);
            setEvents(es || []);
        } finally { setLoading(false); }
    };

    useEffect(() => {
        if (open && companyId) { load(); setTab("contacts"); }
    }, [open, companyId]);

    const update = async (patch) => {
        const updated = await api.updateCompany(companyId, patch);
        setCompany(updated);
        onChange?.();
    };

    const del = async () => {
        if (!window.confirm(`Delete ${company?.name}? This removes all contacts and messages.`)) return;
        await api.deleteCompany(companyId);
        onChange?.();
        onClose();
    };

    const byContact = useMemo(() => {
        const m = {};
        messages.forEach((msg) => { (m[msg.contact_id] = m[msg.contact_id] || []).push(msg); });
        return m;
    }, [messages]);

    const contactById = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c])), [contacts]);

    return (
        <Drawer open={open} onClose={onClose} testid="company-drawer">
            {!company ? (
                <div style={{ padding: "3rem", textAlign: "center" }}>
                    {loading ? <Spinner /> : "Not found"}
                </div>
            ) : (
                <>
                    <div style={{ padding: "1.5rem 1.75rem", borderBottom: "1px solid var(--divider)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ flex: 1 }}>
                                <div className="label">{company.location || "—"}</div>
                                <div
                                    className="font-serif"
                                    style={{ fontSize: "2rem", fontWeight: 400, lineHeight: 1.1, marginTop: "0.2rem" }}
                                    contentEditable
                                    suppressContentEditableWarning
                                    onBlur={(e) => { const v = e.currentTarget.textContent?.trim(); if (v && v !== company.name) update({ name: v }); }}
                                    data-testid="drawer-company-name"
                                >
                                    {company.name}
                                </div>
                                <div
                                    style={{ marginTop: "0.2rem", fontSize: "1rem", color: "var(--text-secondary)" }}
                                    contentEditable
                                    suppressContentEditableWarning
                                    onBlur={(e) => { const v = e.currentTarget.textContent?.trim(); if (v !== (company.role || "")) update({ role: v }); }}
                                    data-testid="drawer-company-role"
                                >
                                    {company.role || "Add role"}
                                </div>
                            </div>
                            <button className="btn btn-ghost" onClick={onClose} data-testid="drawer-close"><X size={16} /></button>
                        </div>

                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                            <Select
                                value={company.pipeline}
                                onChange={(v) => update({ pipeline: v })}
                                options={PIPELINES}
                                className="select"
                                testid="drawer-pipeline"
                            />
                            <Select
                                value={company.current_stage}
                                onChange={(v) => update({ current_stage: v })}
                                options={STAGES}
                                className="select"
                                testid="drawer-stage"
                            />
                            {company.job_url ? (
                                <a className="btn btn-ghost" href={company.job_url} target="_blank" rel="noreferrer" data-testid="drawer-job-link">job url ↗</a>
                            ) : null}
                            <div style={{ marginLeft: "auto" }}>
                                <button className="btn btn-danger" onClick={del} data-testid="drawer-delete">
                                    <Trash2 size={14} /> Delete
                                </button>
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: "0 1.75rem", borderBottom: "1px solid var(--divider)" }}>
                        <div style={{ display: "flex" }}>
                            {["contacts", "messages", "events", "notes"].map((t) => (
                                <button key={t} className={`tab ${tab === t ? "tab-active" : ""}`} onClick={() => setTab(t)} data-testid={`drawer-tab-${t}`}>
                                    {t[0].toUpperCase() + t.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ padding: "1.5rem 1.75rem", flex: 1, overflowY: "auto" }}>
                        {tab === "contacts" && (
                            <>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                                    <div className="label">{contacts.length} contact{contacts.length === 1 ? "" : "s"}</div>
                                    <button className="btn btn-secondary" onClick={() => setAddContactOpen(true)} data-testid="drawer-add-contact">
                                        <Plus size={14} /> Add contact
                                    </button>
                                </div>
                                {contacts.length === 0 ? (
                                    <EmptyState title="No contacts yet" hint="Add the HM, recruiter, or a friendly employee." />
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                        {contacts.map((c) => (
                                            <ContactRow
                                                key={c.id}
                                                contact={c}
                                                messages={byContact[c.id] || []}
                                                onLogMessage={() => setLogMsgFor(c)}
                                                onChanged={load}
                                            />
                                        ))}
                                    </div>
                                )}
                            </>
                        )}

                        {tab === "messages" && (
                            <MessagesTab
                                messages={messages}
                                contactById={contactById}
                                onChanged={load}
                            />
                        )}

                        {tab === "events" && (
                            <EventsTab
                                companyId={companyId}
                                events={events}
                                onChanged={load}
                            />
                        )}

                        {tab === "notes" && (
                            <NotesTab company={company} onSave={(notes) => update({ notes })} />
                        )}
                    </div>
                </>
            )}

            <AddContactModal
                open={addContactOpen}
                onClose={() => setAddContactOpen(false)}
                companyId={companyId}
                onCreated={() => { setAddContactOpen(false); load(); }}
            />

            <LogMessageModal
                open={!!logMsgFor}
                onClose={() => setLogMsgFor(null)}
                contact={logMsgFor}
                onSaved={() => { setLogMsgFor(null); load(); }}
            />
        </Drawer>
    );
}

function ContactRow({ contact, messages, onLogMessage, onChanged }) {
    const cycleConn = async () => {
        const order = ["none", "pending", "accepted", "declined"];
        const next = order[(order.indexOf(contact.connection_status) + 1) % order.length];
        await api.updateContact(contact.id, { connection_status: next });
        onChanged?.();
    };
    const setPrimary = async () => {
        await api.updateContact(contact.id, { is_primary: !contact.is_primary });
        onChanged?.();
    };
    const del = async () => {
        if (!window.confirm(`Delete ${contact.name}?`)) return;
        await api.deleteContact(contact.id);
        onChanged?.();
    };
    const lastMsg = messages[0];
    const overdue = messages.some((m) => m.direction === "outbound" && !m.replied && m.next_followup_at && m.next_followup_at <= new Date().toISOString());

    return (
        <div className="card" style={{ padding: "0.9rem 1rem" }} data-testid={`contact-row-${contact.id}`}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                <button className="btn btn-ghost" onClick={setPrimary} title="Primary" style={{ padding: "0.25rem", color: contact.is_primary ? "var(--accent)" : "var(--text-muted)" }} data-testid={`contact-primary-${contact.id}`}>
                    <Star size={16} fill={contact.is_primary ? "currentColor" : "none"} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 500 }}>{contact.name}</div>
                        <Pill kind={contact.role_type} testid={`contact-role-${contact.id}`}>{contact.role_type}</Pill>
                        <Pill kind="outline" onClick={cycleConn} testid={`contact-conn-${contact.id}`}>
                            {contact.connection_status}
                        </Pill>
                        {overdue && <Pill kind="ongoing">overdue</Pill>}
                    </div>
                    {contact.title && <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>{contact.title}</div>}
                    <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.35rem", fontSize: "0.8rem" }}>
                        {contact.linkedin_url && <a href={contact.linkedin_url} target="_blank" rel="noreferrer" style={{ color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><Linkedin size={12}/> LinkedIn</a>}
                        {contact.email && <a href={`mailto:${contact.email}`} style={{ color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><Mail size={12} /> {contact.email}</a>}
                    </div>
                    {lastMsg && (
                        <div style={{ marginTop: "0.5rem", padding: "0.4rem 0.5rem", background: "var(--surface-muted)", fontSize: "0.8rem" }}>
                            <span className="label" style={{ marginRight: "0.5rem" }}>{lastMsg.direction} · {lastMsg.channel} · {fmtRelative(lastMsg.sent_at)}</span>
                            {lastMsg.body_summary}
                        </div>
                    )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    <button className="btn btn-secondary" onClick={onLogMessage} style={{ padding: "0.3rem 0.65rem", fontSize: "0.8rem" }} data-testid={`contact-log-msg-${contact.id}`}>
                        <MessageSquarePlus size={13} /> Log
                    </button>
                    <button className="btn btn-ghost" onClick={del} style={{ padding: "0.3rem 0.65rem", fontSize: "0.8rem", color: "#991B1B" }} data-testid={`contact-delete-${contact.id}`}>
                        <Trash2 size={13} />
                    </button>
                </div>
            </div>
        </div>
    );
}

function MessagesTab({ messages, contactById, onChanged }) {
    const [loading, setLoading] = useState(false);
    const markReplied = async (m) => {
        setLoading(true);
        try { await api.updateMessage(m.id, { replied: true }); onChanged?.(); } finally { setLoading(false); }
    };
    const snooze = async (m, days) => { await api.snoozeMessage(m.id, days); onChanged?.(); };
    const del = async (m) => { if (window.confirm("Delete this message?")) { await api.deleteMessage(m.id); onChanged?.(); } };

    if (messages.length === 0) return <EmptyState title="No messages yet" hint="Log a cold email or LinkedIn DM from a contact." />;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {messages.map((m) => {
                const c = contactById[m.contact_id];
                const overdue = m.direction === "outbound" && !m.replied && m.next_followup_at && m.next_followup_at <= new Date().toISOString();
                return (
                    <div key={m.id} className="card" style={{ padding: "0.75rem 0.95rem" }} data-testid={`message-row-${m.id}`}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem", flexWrap: "wrap" }}>
                            <span className="label">{m.direction}</span>
                            <span className="label" style={{ color: "var(--accent)" }}>{m.channel}</span>
                            <span style={{ fontWeight: 500, fontSize: "0.9rem" }}>{c?.name || "—"}</span>
                            <span className="label">· {fmtRelative(m.sent_at)}</span>
                            {m.replied && <Pill kind="employee">replied</Pill>}
                            {overdue && <Pill kind="ongoing">overdue</Pill>}
                            <div style={{ marginLeft: "auto", display: "flex", gap: "0.25rem" }}>
                                {m.direction === "outbound" && !m.replied && (
                                    <>
                                        <button className="btn btn-ghost" style={{ padding: "0.2rem 0.45rem", fontSize: "0.75rem" }} onClick={() => markReplied(m)} data-testid={`msg-mark-replied-${m.id}`}>mark replied</button>
                                        <button className="btn btn-ghost" style={{ padding: "0.2rem 0.45rem", fontSize: "0.75rem" }} onClick={() => snooze(m, 3)} data-testid={`msg-snooze-${m.id}`}>snooze 3d</button>
                                    </>
                                )}
                                <button className="btn btn-ghost" style={{ padding: "0.2rem 0.45rem", fontSize: "0.75rem", color: "#991B1B" }} onClick={() => del(m)} data-testid={`msg-delete-${m.id}`}>×</button>
                            </div>
                        </div>
                        {m.subject && <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{m.subject}</div>}
                        <div style={{ fontSize: "0.88rem" }}>{m.body_summary}</div>
                        {m.full_body && <details style={{ marginTop: "0.4rem" }}><summary style={{ cursor: "pointer", fontSize: "0.75rem", color: "var(--text-secondary)" }}>full body</summary><div style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", marginTop: "0.3rem", color: "var(--text-secondary)" }}>{m.full_body}</div></details>}
                        {m.next_followup_at && <div className="label" style={{ marginTop: "0.3rem" }}>follow up {fmtRelative(m.next_followup_at)}</div>}
                    </div>
                );
            })}
        </div>
    );
}

function EventsTab({ companyId, events, onChanged }) {
    const [kind, setKind] = useState("note");
    const [notes, setNotes] = useState("");
    const kinds = ["applied", "responded", "scheduled", "interviewed", "advanced", "offer_received", "offer_accepted", "rejected", "ghosted", "withdrew", "note"];
    const add = async () => {
        await api.createEvent({ company_id: companyId, kind, notes });
        setKind("note"); setNotes(""); onChanged?.();
    };
    return (
        <div>
            <div className="card" style={{ padding: "0.75rem 1rem", marginBottom: "1rem" }}>
                <div className="label" style={{ marginBottom: "0.4rem" }}>Log milestone</div>
                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: "0.5rem" }}>
                    <Select value={kind} onChange={setKind} options={kinds} testid="event-kind" />
                    <input className="input" placeholder="notes" value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="event-notes" />
                    <button className="btn btn-primary" onClick={add} data-testid="event-add">Log</button>
                </div>
            </div>
            {events.length === 0 ? (
                <EmptyState title="No events yet" hint="Milestones like 'applied', 'interviewed', 'rejected' live here." />
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {events.map((e) => (
                        <div key={e.id} className="card" style={{ padding: "0.6rem 0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }} data-testid={`event-row-${e.id}`}>
                            <span className="label">{fmtDate(e.timestamp)}</span>
                            <Pill kind="outline">{e.kind}</Pill>
                            <span style={{ fontSize: "0.88rem" }}>{e.notes}</span>
                            <button className="btn btn-ghost" style={{ marginLeft: "auto", padding: "0.2rem", color: "#991B1B" }} onClick={async () => { await api.deleteEvent(e.id); onChanged?.(); }} data-testid={`event-delete-${e.id}`}>×</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function NotesTab({ company, onSave }) {
    const [v, setV] = useState(company.notes || "");
    useEffect(() => setV(company.notes || ""), [company.id]);
    return (
        <div>
            <textarea
                className="textarea"
                style={{ minHeight: "300px" }}
                value={v}
                onChange={(e) => setV(e.target.value)}
                onBlur={() => { if (v !== (company.notes || "")) onSave(v); }}
                placeholder="Context, leads, thoughts. Saves on blur."
                data-testid="notes-textarea"
            />
        </div>
    );
}
