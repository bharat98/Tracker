import React, { useEffect, useMemo, useState } from "react";
import { api, CHANNELS, applyPlaceholders } from "../lib/api";
import { Modal, Field, Select, Spinner } from "./primitives";

export default function LogMessageModal({ open, onClose, contact, onSaved }) {
    const [templates, setTemplates] = useState([]);
    const [form, setForm] = useState({
        direction: "outbound", channel: "linkedin", subject: "", body_summary: "", full_body: "",
        template_id: "", next_followup_days: 3,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;
        setForm({ direction: "outbound", channel: "linkedin", subject: "", body_summary: "", full_body: "",
            template_id: "", next_followup_days: 3 });
        setError("");
        api.listTemplates().then(setTemplates).catch(() => setTemplates([]));
    }, [open]);

    const filteredTemplates = useMemo(
        () => templates.filter((t) => form.direction === "outbound" && (form.channel === "linkedin" || form.channel === "email") && t.channel === form.channel),
        [templates, form.channel, form.direction]
    );

    const pickTemplate = (id) => {
        const t = templates.find((x) => x.id === id);
        if (!t) { setForm({ ...form, template_id: "" }); return; }
        const vals = {
            name: contact?.name || "",
            company: "",  // company name not loaded here; UI prompts user
            role: contact?.title || "",
        };
        setForm({
            ...form,
            template_id: id,
            subject: applyPlaceholders(t.subject_template || "", vals),
            full_body: applyPlaceholders(t.body_template || "", vals),
            body_summary: form.body_summary || (t.name + " — " + (t.channel || "")),
        });
    };

    const submit = async () => {
        if (!form.body_summary.trim()) { setError("Summary required"); return; }
        setLoading(true); setError("");
        try {
            const payload = {
                contact_id: contact.id,
                direction: form.direction,
                channel: form.channel,
                subject: form.subject,
                body_summary: form.body_summary,
                full_body: form.full_body,
                template_id: form.template_id || null,
            };
            if (form.direction === "outbound" && form.next_followup_days) {
                const d = new Date();
                d.setDate(d.getDate() + Number(form.next_followup_days));
                payload.next_followup_at = d.toISOString();
            }
            await api.createMessage(payload);
            onSaved?.();
        } catch (e) {
            setError(e?.response?.data?.detail || "Failed");
        } finally { setLoading(false); }
    };

    return (
        <Modal open={open} onClose={onClose} title={contact ? `Log message · ${contact.name}` : "Log message"} width={640} testid="log-message-modal">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem 1rem" }}>
                <Field label="Direction"><Select value={form.direction} onChange={(v) => setForm({ ...form, direction: v })} options={["outbound", "inbound"]} testid="msg-direction-select" /></Field>
                <Field label="Channel"><Select value={form.channel} onChange={(v) => setForm({ ...form, channel: v })} options={CHANNELS} testid="msg-channel-select" /></Field>
            </div>
            {form.direction === "outbound" && filteredTemplates.length > 0 && (
                <Field label="Template (optional)">
                    <select className="select" value={form.template_id} onChange={(e) => pickTemplate(e.target.value)} data-testid="msg-template-select">
                        <option value="">— none —</option>
                        {filteredTemplates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.channel}</option>)}
                    </select>
                </Field>
            )}
            {form.channel === "email" && (
                <Field label="Subject"><input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} data-testid="msg-subject-input" /></Field>
            )}
            <Field label="Summary * (short; what did you say)">
                <input className="input" value={form.body_summary} onChange={(e) => setForm({ ...form, body_summary: e.target.value })} maxLength={280} data-testid="msg-summary-input" />
            </Field>
            <Field label="Full body (optional — paste if you want)">
                <textarea className="textarea" value={form.full_body} onChange={(e) => setForm({ ...form, full_body: e.target.value })} data-testid="msg-body-input" />
            </Field>
            {form.direction === "outbound" && (
                <Field label="Follow up in (days)">
                    <input className="input" type="number" min="0" max="90" value={form.next_followup_days} onChange={(e) => setForm({ ...form, next_followup_days: e.target.value ? Number(e.target.value) : 0 })} data-testid="msg-followup-input" />
                </Field>
            )}
            {error && <div style={{ color: "#B91C1C", fontSize: "0.85rem", marginBottom: "0.5rem" }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button className="btn btn-ghost" onClick={onClose} data-testid="msg-cancel">Cancel</button>
                <button className="btn btn-primary" onClick={submit} disabled={loading} data-testid="msg-save">{loading && <Spinner />} Save</button>
            </div>
        </Modal>
    );
}
