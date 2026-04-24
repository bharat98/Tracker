import React, { useEffect, useState } from "react";
import { api, fmtDate } from "../lib/api";
import { Modal, Field, Select, Spinner, EmptyState, Pill } from "../components/primitives";
import { Plus, Trash2, Edit2 } from "lucide-react";

export default function Templates({ refreshToken }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editOpen, setEditOpen] = useState(false);
    const [editing, setEditing] = useState(null);

    const load = async () => {
        setLoading(true);
        try { setRows(await api.listTemplates()); } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [refreshToken]);

    const startNew = () => {
        setEditing({ name: "", channel: "email", subject_template: "", body_template: "" });
        setEditOpen(true);
    };
    const startEdit = (t) => { setEditing({ ...t }); setEditOpen(true); };
    const save = async () => {
        if (!editing.name.trim() || !editing.body_template.trim()) return;
        if (editing.id) {
            await api.updateTemplate(editing.id, {
                name: editing.name, channel: editing.channel,
                subject_template: editing.subject_template,
                body_template: editing.body_template,
            });
        } else {
            await api.createTemplate({
                name: editing.name, channel: editing.channel,
                subject_template: editing.subject_template,
                body_template: editing.body_template,
            });
        }
        setEditOpen(false); setEditing(null); load();
    };
    const del = async (t) => {
        if (!window.confirm(`Delete template "${t.name}"?`)) return;
        await api.deleteTemplate(t.id); load();
    };

    if (loading) return <Spinner />;

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                <div className="label">{rows.length} template{rows.length === 1 ? "" : "s"}</div>
                <button className="btn btn-primary" onClick={startNew} data-testid="new-template-btn">
                    <Plus size={14} /> New template
                </button>
            </div>

            {rows.length === 0 ? (
                <EmptyState title="No templates yet" hint="Create reusable outreach templates. Use {{name}}, {{company}}, {{role}} as placeholders." action={<button className="btn btn-primary" onClick={startNew}><Plus size={14} /> New template</button>} />
            ) : (
                <div className="card" data-testid="templates-list">
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                        <thead>
                            <tr style={{ borderBottom: "1px solid var(--border)" }}>
                                <th style={th}>Name</th>
                                <th style={th}>Channel</th>
                                <th style={th}>Placeholders</th>
                                <th style={th}>Sent</th>
                                <th style={th}>Replies</th>
                                <th style={th}>Reply rate</th>
                                <th style={th}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((t) => (
                                <tr key={t.id} className="row-hover" style={{ borderBottom: "1px solid var(--divider)" }} data-testid={`template-row-${t.id}`}>
                                    <td style={td}>
                                        <div style={{ fontWeight: 500 }}>{t.name}</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{fmtDate(t.created_at)}</div>
                                    </td>
                                    <td style={td}><Pill kind="outline">{t.channel}</Pill></td>
                                    <td style={td}>
                                        {(t.placeholders || []).map((p) => <span key={p} className="pill pill-outline" style={{ marginRight: "0.3rem" }}>{`{{${p}}}`}</span>)}
                                    </td>
                                    <td style={td} className="num">{t.use_count}</td>
                                    <td style={td} className="num">{t.reply_count}</td>
                                    <td style={td} className="num" {...{ "data-testid": `template-reply-rate-${t.id}` }}>{t.reply_rate}%</td>
                                    <td style={td}>
                                        <div style={{ display: "flex", gap: "0.3rem", justifyContent: "flex-end" }}>
                                            <button className="btn btn-ghost" style={{ padding: "0.2rem 0.5rem" }} onClick={() => startEdit(t)} data-testid={`template-edit-${t.id}`}><Edit2 size={13} /></button>
                                            <button className="btn btn-ghost" style={{ padding: "0.2rem 0.5rem", color: "#991B1B" }} onClick={() => del(t)} data-testid={`template-delete-${t.id}`}><Trash2 size={13} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Modal open={editOpen} onClose={() => setEditOpen(false)} title={editing?.id ? "Edit template" : "New template"} width={640} testid="template-modal">
                {editing && (
                    <div>
                        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "0.75rem 1rem" }}>
                            <Field label="Name *"><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="template-name-input" autoFocus /></Field>
                            <Field label="Channel"><Select value={editing.channel} onChange={(v) => setEditing({ ...editing, channel: v })} options={["email", "linkedin"]} testid="template-channel-select" /></Field>
                        </div>
                        {editing.channel === "email" && (
                            <Field label="Subject (supports {{placeholders}})">
                                <input className="input" value={editing.subject_template || ""} onChange={(e) => setEditing({ ...editing, subject_template: e.target.value })} data-testid="template-subject-input" />
                            </Field>
                        )}
                        <Field label="Body * (supports {{name}}, {{company}}, {{role}})">
                            <textarea className="textarea" style={{ minHeight: 200 }} value={editing.body_template} onChange={(e) => setEditing({ ...editing, body_template: e.target.value })} data-testid="template-body-input" />
                        </Field>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                            <button className="btn btn-ghost" onClick={() => setEditOpen(false)} data-testid="template-cancel">Cancel</button>
                            <button className="btn btn-primary" onClick={save} disabled={!editing.name || !editing.body_template} data-testid="template-save">Save</button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

const th = { textAlign: "left", padding: "0.65rem 0.9rem", fontWeight: 500, fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-secondary)" };
const td = { padding: "0.7rem 0.9rem", verticalAlign: "top" };
