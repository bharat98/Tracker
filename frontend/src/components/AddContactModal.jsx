import React, { useEffect, useState } from "react";
import { api, ROLE_TYPES, CONN_STATUSES } from "../lib/api";
import { Modal, Field, Select, Spinner } from "./primitives";

export default function AddContactModal({ open, onClose, companyId, onCreated }) {
    const [form, setForm] = useState({
        name: "", title: "", email: "", linkedin_url: "",
        role_type: "cold_reach", connection_status: "none", is_primary: false, notes: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) {
            setForm({ name: "", title: "", email: "", linkedin_url: "", role_type: "cold_reach", connection_status: "none", is_primary: false, notes: "" });
            setError("");
        }
    }, [open]);

    const submit = async () => {
        if (!form.name.trim()) { setError("Name required"); return; }
        setLoading(true); setError("");
        try {
            await api.createContact({ company_id: companyId, ...form });
            onCreated?.();
        } catch (e) {
            setError(e?.response?.data?.detail || "Failed");
        } finally { setLoading(false); }
    };

    return (
        <Modal open={open} onClose={onClose} title="Add Contact" width={560} testid="add-contact-modal">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem 1rem" }}>
                <Field label="Name *"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="contact-name-input" autoFocus /></Field>
                <Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="contact-title-input" /></Field>
                <Field label="Email"><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="contact-email-input" /></Field>
                <Field label="LinkedIn URL"><input className="input" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} data-testid="contact-linkedin-input" /></Field>
                <Field label="Role type"><Select value={form.role_type} onChange={(v) => setForm({ ...form, role_type: v })} options={ROLE_TYPES} testid="contact-role-type-select" /></Field>
                <Field label="Connection status"><Select value={form.connection_status} onChange={(v) => setForm({ ...form, connection_status: v })} options={CONN_STATUSES} testid="contact-connection-select" /></Field>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", margin: "0.5rem 0 0.75rem" }}>
                <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} data-testid="contact-primary-check" />
                Mark as primary contact
            </label>
            <Field label="Notes"><textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="contact-notes-input" /></Field>

            {error && <div style={{ color: "#B91C1C", fontSize: "0.85rem", marginBottom: "0.5rem" }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button className="btn btn-ghost" onClick={onClose} data-testid="contact-cancel">Cancel</button>
                <button className="btn btn-primary" onClick={submit} disabled={loading} data-testid="contact-save">
                    {loading && <Spinner />} Save contact
                </button>
            </div>
        </Modal>
    );
}
