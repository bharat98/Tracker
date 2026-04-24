import React, { useEffect, useState } from "react";
import { api, fmtRelative } from "../lib/api";
import { Pill, Spinner, EmptyState, Select } from "../components/primitives";
import CompanyDrawer from "../components/CompanyDrawer";
import { Check, Clock } from "lucide-react";

export default function Followups({ refreshToken, onChange }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);

    const load = async () => {
        setLoading(true);
        try { setRows(await api.followups()); } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [refreshToken]);

    const markReplied = async (m) => {
        await api.updateMessage(m.id, { replied: true });
        load(); onChange?.();
    };
    const snooze = async (m, days) => {
        await api.snoozeMessage(m.id, days);
        load(); onChange?.();
    };

    if (loading) return <Spinner />;
    if (rows.length === 0) return <EmptyState title="You're all caught up." hint="No overdue follow-ups. Nice." />;

    return (
        <div>
            <div className="label" style={{ marginBottom: "0.75rem" }}>
                {rows.length} overdue · {rows.filter((r) => r.contact?.role_type === "hm").length} with hiring managers
            </div>
            <div className="card" data-testid="followups-list">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                    <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                            <th style={th}>Contact</th>
                            <th style={th}>Company</th>
                            <th style={th}>Sent</th>
                            <th style={th}>Due</th>
                            <th style={th}>Summary</th>
                            <th style={th}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((m) => (
                            <tr key={m.id} className="row-hover" style={{ borderBottom: "1px solid var(--divider)" }} data-testid={`followup-row-${m.id}`}>
                                <td style={td}>
                                    <div style={{ fontWeight: 500 }}>{m.contact?.name || "—"}</div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{m.contact?.title || ""}</div>
                                </td>
                                <td style={td}>
                                    <button className="btn btn-ghost" onClick={() => setSelected(m.company?.id)} style={{ padding: 0, fontSize: "0.88rem" }} data-testid={`followup-open-company-${m.id}`}>{m.company?.name}</button>
                                </td>
                                <td style={td} className="label">{fmtRelative(m.sent_at)}</td>
                                <td style={td}><Pill kind="ongoing">{fmtRelative(m.next_followup_at)}</Pill></td>
                                <td style={{ ...td, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }}>{m.body_summary}</td>
                                <td style={td}>
                                    <div style={{ display: "flex", gap: "0.3rem", justifyContent: "flex-end" }}>
                                        <button className="btn btn-secondary" style={{ padding: "0.25rem 0.55rem", fontSize: "0.8rem" }} onClick={() => markReplied(m)} data-testid={`followup-replied-${m.id}`}><Check size={13}/> replied</button>
                                        <button className="btn btn-ghost" style={{ padding: "0.25rem 0.55rem", fontSize: "0.8rem" }} onClick={() => snooze(m, 3)} data-testid={`followup-snooze-3-${m.id}`}><Clock size={13}/> 3d</button>
                                        <button className="btn btn-ghost" style={{ padding: "0.25rem 0.55rem", fontSize: "0.8rem" }} onClick={() => snooze(m, 7)} data-testid={`followup-snooze-7-${m.id}`}>7d</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <CompanyDrawer companyId={selected} open={!!selected} onClose={() => setSelected(null)} onChange={load} />
        </div>
    );
}

const th = { textAlign: "left", padding: "0.65rem 0.9rem", fontWeight: 500, fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-secondary)" };
const td = { padding: "0.7rem 0.9rem", verticalAlign: "top" };
