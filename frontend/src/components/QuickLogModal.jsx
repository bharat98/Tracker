import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Modal, Field, Spinner } from "./primitives";
import { Sparkles, Loader2, Check, X } from "lucide-react";

export default function QuickLogModal({ open, onClose, onCommit }) {
    const [text, setText] = useState("");
    const [parsed, setParsed] = useState(null);
    const [loading, setLoading] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) {
            setText(""); setParsed(null); setError(""); setLoading(false); setCommitting(false);
        }
    }, [open]);

    const parse = async () => {
        if (!text.trim()) return;
        setLoading(true); setError("");
        try {
            const data = await api.nlLog(text);
            setParsed(data.parsed || {});
        } catch (e) {
            setError(e?.response?.data?.detail || "Failed to parse. Try rephrasing.");
        } finally { setLoading(false); }
    };

    const commit = async () => {
        setCommitting(true); setError("");
        try {
            await api.nlLogCommit(parsed);
            onCommit?.();
        } catch (e) {
            setError(e?.response?.data?.detail || "Commit failed.");
        } finally { setCommitting(false); }
    };

    const company = parsed?.company || {};
    const contact = parsed?.contact || {};
    const message = parsed?.message || null;
    const event = parsed?.event || null;

    const updateCompany = (patch) => setParsed({ ...parsed, company: { ...company, ...patch } });
    const updateContact = (patch) => setParsed({ ...parsed, contact: { ...contact, ...patch } });
    const updateMessage = (patch) => setParsed({ ...parsed, message: { ...(message || {}), ...patch } });

    return (
        <Modal open={open} onClose={onClose} title="Quick Log" width={680} testid="quick-log-modal">
            <div style={{ marginBottom: "1rem" }}>
                <div className="label" style={{ marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <Sparkles size={12} /> Describe today's move in one sentence
                </div>
                <textarea
                    className="editorial-mono"
                    style={{ width: "100%", minHeight: "110px", resize: "vertical" }}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={'e.g. "Sent a LinkedIn InMail to Sarah Chen at ChurnZero using my v2-intro template, follow up in 3 days if no reply"'}
                    data-testid="quick-log-text"
                    autoFocus
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.75rem", gap: "0.5rem" }}>
                    <button className="btn btn-ghost" onClick={onClose} data-testid="quick-log-cancel">Cancel</button>
                    <button className="btn btn-primary" onClick={parse} disabled={!text.trim() || loading} data-testid="quick-log-parse">
                        {loading ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                        {loading ? "Parsing…" : "Parse with AI"}
                    </button>
                </div>
            </div>

            {error && <div style={{ color: "#B91C1C", fontSize: "0.85rem", marginBottom: "0.75rem" }} data-testid="quick-log-error">{error}</div>}

            {parsed && (
                <div className="fade-in" style={{ borderTop: "1px solid var(--divider)", paddingTop: "1rem" }}>
                    <div className="label" style={{ marginBottom: "0.75rem" }}>Preview · edit chips before committing</div>

                    <div style={{ display: "grid", gap: "0.75rem" }}>
                        <div className="card" style={{ padding: "0.9rem 1rem" }}>
                            <div className="label" style={{ marginBottom: "0.4rem" }}>Company</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                                <input className="input-line" placeholder="name" value={company.name || ""} onChange={(e) => updateCompany({ name: e.target.value })} data-testid="chip-company-name" />
                                <input className="input-line" placeholder="role" value={company.role || ""} onChange={(e) => updateCompany({ role: e.target.value })} data-testid="chip-company-role" />
                                <input className="input-line" placeholder="location" value={company.location || ""} onChange={(e) => updateCompany({ location: e.target.value })} data-testid="chip-company-location" />
                            </div>
                        </div>

                        {contact.name !== undefined && (
                            <div className="card" style={{ padding: "0.9rem 1rem" }}>
                                <div className="label" style={{ marginBottom: "0.4rem" }}>Contact</div>
                                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 0.8fr", gap: "0.5rem" }}>
                                    <input className="input-line" placeholder="name" value={contact.name || ""} onChange={(e) => updateContact({ name: e.target.value })} data-testid="chip-contact-name" />
                                    <input className="input-line" placeholder="title" value={contact.title || ""} onChange={(e) => updateContact({ title: e.target.value })} data-testid="chip-contact-title" />
                                    <select className="select" value={contact.role_type || "cold_reach"} onChange={(e) => updateContact({ role_type: e.target.value })} data-testid="chip-contact-role-type">
                                        {["hm", "recruiter", "referral", "cold_reach", "employee"].map((x) => <option key={x}>{x}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}

                        {message && (
                            <div className="card" style={{ padding: "0.9rem 1rem" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                                    <div className="label">Message</div>
                                    <button className="btn btn-ghost" style={{ padding: "0.15rem 0.4rem", fontSize: "0.8rem" }} onClick={() => setParsed({ ...parsed, message: null })} data-testid="chip-message-remove">
                                        <X size={12} /> remove
                                    </button>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "0.8fr 0.8fr 0.7fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
                                    <select className="select" value={message.direction || "outbound"} onChange={(e) => updateMessage({ direction: e.target.value })} data-testid="chip-message-direction">
                                        {["outbound", "inbound"].map((x) => <option key={x}>{x}</option>)}
                                    </select>
                                    <select className="select" value={message.channel || "linkedin"} onChange={(e) => updateMessage({ channel: e.target.value })} data-testid="chip-message-channel">
                                        {["linkedin", "email", "phone", "in_person", "other"].map((x) => <option key={x}>{x}</option>)}
                                    </select>
                                    <input
                                        className="input"
                                        placeholder="follow up in … days"
                                        type="number"
                                        min="0"
                                        value={message.next_followup_days ?? ""}
                                        onChange={(e) => updateMessage({ next_followup_days: e.target.value ? Number(e.target.value) : null })}
                                        data-testid="chip-message-followup"
                                    />
                                </div>
                                <input className="input-line" placeholder="summary" value={message.body_summary || ""} onChange={(e) => updateMessage({ body_summary: e.target.value })} data-testid="chip-message-summary" />
                                {message.template_hint ? (
                                    <div style={{ marginTop: "0.4rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                                        Template hint: <span className="font-mono">{message.template_hint}</span>
                                    </div>
                                ) : null}
                            </div>
                        )}

                        {event?.kind && (
                            <div className="card" style={{ padding: "0.9rem 1rem" }}>
                                <div className="label">Event</div>
                                <div style={{ fontSize: "0.9rem", marginTop: "0.2rem" }}>
                                    <span className="font-mono">{event.kind}</span>
                                </div>
                            </div>
                        )}

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
                            <button className="btn btn-secondary" onClick={() => setParsed(null)} data-testid="chip-reparse">Edit prompt</button>
                            <button className="btn btn-primary" onClick={commit} disabled={committing || !company.name} data-testid="chip-commit">
                                {committing ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Commit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
}
