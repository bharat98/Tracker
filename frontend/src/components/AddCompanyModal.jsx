import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Modal, Field, Select, Spinner } from "./primitives";
import { Link as LinkIcon, Loader2 } from "lucide-react";

export default function AddCompanyModal({ open, onClose, onCreated }) {
    const [tab, setTab] = useState("url");
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({
        name: "", role: "", location: "", job_url: "", source: "",
        pipeline: "ongoing", current_stage: "sourced", resume_version: "", notes: "",
    });
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) {
            setTab("url"); setUrl(""); setError("");
            setForm({ name: "", role: "", location: "", job_url: "", source: "",
                pipeline: "ongoing", current_stage: "sourced", resume_version: "", notes: "" });
        }
    }, [open]);

    const extract = async () => {
        setLoading(true); setError("");
        try {
            const data = await api.extractUrl(url);
            setForm((f) => ({
                ...f,
                name: data.company || f.name,
                role: data.role || f.role,
                location: data.location || f.location,
                job_url: url,
                source: "URL extract",
            }));
            setTab("manual");
        } catch (e) {
            setError(e?.response?.data?.detail || "AI extraction failed. Fill manually below.");
            setForm((f) => ({ ...f, job_url: url }));
            setTab("manual");
        } finally {
            setLoading(false);
        }
    };

    const submit = async () => {
        if (!form.name.trim()) { setError("Company name required"); return; }
        setLoading(true); setError("");
        try {
            const c = await api.createCompany(form);
            onCreated?.(c);
        } catch (e) {
            setError(e?.response?.data?.detail || "Failed to save");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="Add Company" width={640} testid="add-company-modal">
            <div style={{ display: "flex", gap: "1.5rem", borderBottom: "1px solid var(--divider)", marginBottom: "1rem" }}>
                <button className={`tab ${tab === "url" ? "tab-active" : ""}`} onClick={() => setTab("url")} data-testid="add-company-tab-url">
                    Paste URL
                </button>
                <button className={`tab ${tab === "manual" ? "tab-active" : ""}`} onClick={() => setTab("manual")} data-testid="add-company-tab-manual">
                    Manual entry
                </button>
            </div>

            {tab === "url" && (
                <div>
                    <Field label="Job listing URL" testid="url-input">
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            <LinkIcon size={16} style={{ color: "var(--text-secondary)" }} />
                            <input
                                className="input-line"
                                placeholder="https://company.com/careers/senior-engineer"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                data-testid="add-company-url"
                                autoFocus
                            />
                        </div>
                    </Field>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                        We'll fetch the page and have Claude extract the company, role, and location.
                        You can still edit everything on the next step.
                    </div>
                    {error && <div style={{ color: "#B91C1C", fontSize: "0.85rem", marginBottom: "0.75rem" }}>{error}</div>}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                        <button className="btn btn-ghost" onClick={() => setTab("manual")} data-testid="skip-url-btn">
                            Skip & enter manually
                        </button>
                        <button className="btn btn-primary" onClick={extract} disabled={!url || loading} data-testid="extract-url-btn">
                            {loading ? <Loader2 size={14} className="spin" /> : null}
                            {loading ? "Extracting…" : "Extract with AI"}
                        </button>
                    </div>
                </div>
            )}

            {tab === "manual" && (
                <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem 1rem" }}>
                        <Field label="Company *"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="company-name" /></Field>
                        <Field label="Role / title"><input className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="company-role" /></Field>
                        <Field label="Location"><input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} data-testid="company-location" /></Field>
                        <Field label="Source"><input className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="LinkedIn, referral…" data-testid="company-source" /></Field>
                        <Field label="Pipeline">
                            <Select value={form.pipeline} onChange={(v) => setForm({ ...form, pipeline: v })} options={["ongoing", "offer", "rejected", "withdrawn"]} testid="company-pipeline" />
                        </Field>
                        <Field label="Current stage">
                            <Select value={form.current_stage} onChange={(v) => setForm({ ...form, current_stage: v })} options={["sourced", "applied", "screen", "interview", "final", "offer", "closed"]} testid="company-stage" />
                        </Field>
                        <Field label="Job URL"><input className="input" value={form.job_url} onChange={(e) => setForm({ ...form, job_url: e.target.value })} data-testid="company-job-url" /></Field>
                        <Field label="Resume version"><input className="input" value={form.resume_version} onChange={(e) => setForm({ ...form, resume_version: e.target.value })} placeholder="v3-TAM-focus" data-testid="company-resume" /></Field>
                    </div>
                    <Field label="Notes">
                        <textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="company-notes" />
                    </Field>
                    {error && <div style={{ color: "#B91C1C", fontSize: "0.85rem", marginBottom: "0.75rem" }}>{error}</div>}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                        <button className="btn btn-ghost" onClick={onClose} data-testid="cancel-company-btn">Cancel</button>
                        <button className="btn btn-primary" onClick={submit} disabled={loading} data-testid="save-company-btn">
                            {loading ? <Spinner /> : null} Save company
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
