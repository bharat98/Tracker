import React, { useEffect, useMemo, useState } from "react";
import { api, PIPELINES, STAGES, fmtRelative } from "../lib/api";
import { Pill, Spinner, EmptyState } from "../components/primitives";
import CompanyDrawer from "../components/CompanyDrawer";
import { LayoutGrid, List as ListIcon, Search } from "lucide-react";

export default function Companies({ refreshToken, onChange }) {
    const [view, setView] = useState("kanban");
    const [pipeline, setPipeline] = useState("all");
    const [q, setQ] = useState("");
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(null);

    const load = async () => {
        setLoading(true);
        try { setRows(await api.listCompanies({ pipeline: pipeline === "all" ? undefined : pipeline, q: q || undefined })); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [refreshToken, pipeline, q]);

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", border: "1px solid var(--border)", padding: "0.35rem 0.6rem", background: "#fff", minWidth: 260 }}>
                    <Search size={14} style={{ color: "var(--text-secondary)" }} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies…" style={{ border: "none", outline: "none", background: "transparent", fontSize: "0.9rem", flex: 1 }} data-testid="companies-search" />
                </div>
                <div style={{ display: "flex", border: "1px solid var(--border)" }}>
                    {["all", ...PIPELINES].map((p) => (
                        <button
                            key={p}
                            onClick={() => setPipeline(p)}
                            className={`btn btn-ghost ${pipeline === p ? "" : ""}`}
                            style={{
                                padding: "0.4rem 0.85rem",
                                fontSize: "0.8rem",
                                background: pipeline === p ? "var(--text)" : "transparent",
                                color: pipeline === p ? "var(--bg)" : "var(--text-secondary)",
                                borderRadius: 0,
                            }}
                            data-testid={`filter-pipeline-${p}`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
                <div style={{ marginLeft: "auto", display: "flex", border: "1px solid var(--border)" }}>
                    <button className="btn btn-ghost" onClick={() => setView("kanban")} style={{ padding: "0.4rem 0.75rem", background: view === "kanban" ? "var(--surface-hover)" : "transparent", color: view === "kanban" ? "var(--text)" : "var(--text-secondary)" }} data-testid="view-kanban"><LayoutGrid size={14} /></button>
                    <button className="btn btn-ghost" onClick={() => setView("list")} style={{ padding: "0.4rem 0.75rem", background: view === "list" ? "var(--surface-hover)" : "transparent", color: view === "list" ? "var(--text)" : "var(--text-secondary)" }} data-testid="view-list"><ListIcon size={14} /></button>
                </div>
            </div>

            {loading && <div style={{ padding: "1rem" }}><Spinner /></div>}

            {!loading && rows.length === 0 && (
                <EmptyState title="No companies yet" hint='Hit "+ Company" or "Quick Log" to start.' />
            )}

            {!loading && rows.length > 0 && view === "kanban" && (
                <KanbanView rows={rows} onOpen={(id) => setSelected(id)} />
            )}

            {!loading && rows.length > 0 && view === "list" && (
                <ListView rows={rows} onOpen={(id) => setSelected(id)} />
            )}

            <CompanyDrawer
                companyId={selected}
                open={!!selected}
                onClose={() => setSelected(null)}
                onChange={() => { load(); onChange?.(); }}
            />
        </div>
    );
}

function KanbanView({ rows, onOpen }) {
    const grouped = useMemo(() => {
        const g = {};
        STAGES.forEach((s) => (g[s] = []));
        rows.forEach((r) => { (g[r.current_stage] || g.sourced).push(r); });
        return g;
    }, [rows]);

    return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, minmax(240px, 1fr))`, gap: 0, overflowX: "auto" }} className="thin-scroll" data-testid="kanban-board">
            {STAGES.map((s) => (
                <div key={s} style={{ padding: "0 0.5rem 1rem", borderRight: "1px solid var(--border)", minHeight: "70vh" }} data-testid={`kanban-column-${s}`}>
                    <div style={{ padding: "0.5rem 0.25rem 0.75rem", position: "sticky", top: 0, background: "var(--bg)" }}>
                        <div className="label">{s}</div>
                        <div className="num" style={{ fontSize: "1rem", color: "var(--text-secondary)" }}>{grouped[s].length}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {grouped[s].map((r) => <KanbanCard key={r.id} r={r} onOpen={onOpen} />)}
                    </div>
                </div>
            ))}
        </div>
    );
}

function KanbanCard({ r, onOpen }) {
    return (
        <button
            className="card card-interactive"
            onClick={() => onOpen(r.id)}
            style={{ textAlign: "left", padding: "0.75rem 0.85rem", cursor: "pointer", background: "#fff" }}
            data-testid={`kanban-card-${r.id}`}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem" }}>
                <div style={{ fontWeight: 500, fontSize: "0.95rem", lineHeight: 1.2 }}>{r.name}</div>
                {r.overdue_followups > 0 && <span className="num" style={{ fontSize: "0.7rem", background: "var(--accent)", color: "#fff", padding: "0.1rem 0.35rem" }}>{r.overdue_followups}</span>}
            </div>
            {r.role && <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>{r.role}</div>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.5rem", alignItems: "center" }}>
                <Pill kind={r.pipeline}>{r.pipeline}</Pill>
                {r.primary_contact && <Pill kind="outline">{r.primary_contact.name.split(" ")[0]}</Pill>}
            </div>
            {r.last_activity_at && <div className="label" style={{ marginTop: "0.5rem" }}>{fmtRelative(r.last_activity_at)}</div>}
        </button>
    );
}

function ListView({ rows, onOpen }) {
    return (
        <div className="card" data-testid="companies-list">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <Th>Company</Th><Th>Role</Th><Th>Stage</Th><Th>Pipeline</Th>
                        <Th>Primary</Th><Th>Contacts</Th><Th>Last activity</Th><Th>Overdue</Th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.id} className="row-hover" style={{ borderBottom: "1px solid var(--divider)", cursor: "pointer" }} onClick={() => onOpen(r.id)} data-testid={`list-row-${r.id}`}>
                            <Td><div style={{ fontWeight: 500 }}>{r.name}</div><div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{r.location}</div></Td>
                            <Td>{r.role}</Td>
                            <Td><span className="label">{r.current_stage}</span></Td>
                            <Td><Pill kind={r.pipeline}>{r.pipeline}</Pill></Td>
                            <Td>{r.primary_contact?.name || "—"}</Td>
                            <Td className="num">{r.contact_count}</Td>
                            <Td className="label">{fmtRelative(r.last_activity_at)}</Td>
                            <Td>{r.overdue_followups ? <Pill kind="ongoing">{r.overdue_followups}</Pill> : "—"}</Td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
const Th = ({ children }) => <th style={{ textAlign: "left", padding: "0.65rem 0.9rem", fontWeight: 500, fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-secondary)" }}>{children}</th>;
const Td = ({ children, className }) => <td style={{ padding: "0.7rem 0.9rem" }} className={className}>{children}</td>;
