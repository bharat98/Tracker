import React, { useEffect, useState } from "react";
import { api, fmtRelative } from "../lib/api";
import { Pill, Spinner, EmptyState } from "../components/primitives";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

export default function Dashboard({ refreshToken }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        setLoading(true);
        api.dashboard().then((d) => { if (active) setData(d); }).finally(() => active && setLoading(false));
        return () => { active = false; };
    }, [refreshToken]);

    if (loading) return <div style={{ padding: "2rem" }}><Spinner /></div>;
    if (!data) return <EmptyState title="No data" />;

    const s = data.stats;
    const statCards = [
        { label: "Total companies", value: s.total },
        { label: "Ongoing", value: s.ongoing, accent: true },
        { label: "Interviews this week", value: s.interviews_this_week },
        { label: "Overdue follow-ups", value: s.overdue_followups, danger: s.overdue_followups > 0 },
        { label: "Offers", value: s.offer },
        { label: "Rejected", value: s.rejected },
    ];

    return (
        <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
                {statCards.map((c) => (
                    <div key={c.label} className="card" style={{ padding: "1rem 1.1rem" }} data-testid={`stat-${c.label.toLowerCase().replace(/\s+/g, "-")}`}>
                        <div className="label">{c.label}</div>
                        <div className="num" style={{ fontSize: "1.9rem", marginTop: "0.25rem", color: c.danger ? "var(--accent)" : (c.accent ? "var(--accent-2)" : "var(--text)") }}>{c.value}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>
                <div className="card" style={{ padding: "1.25rem 1.5rem" }} data-testid="activity-heatmap">
                    <div className="label" style={{ marginBottom: "0.5rem" }}>Activity · last 24 weeks</div>
                    <Heatmap days={data.heatmap} />
                </div>
                <div className="card" style={{ padding: "1.25rem 1.5rem" }} data-testid="funnel-card">
                    <div className="label" style={{ marginBottom: "0.75rem" }}>Funnel</div>
                    <Funnel f={data.funnel} />
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1.5rem" }}>
                <div className="card" style={{ padding: "1.25rem 1.5rem" }} data-testid="channels-card">
                    <div className="label" style={{ marginBottom: "0.75rem" }}>Channel effectiveness</div>
                    {data.channels.length === 0 ? (
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>No outbound messages yet.</div>
                    ) : (
                        <div style={{ height: 220 }}>
                            <ResponsiveContainer>
                                <BarChart data={data.channels} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <XAxis dataKey="channel" tick={{ fontSize: 11, fill: "#78716C" }} axisLine={{ stroke: "#E5E2DC" }} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: "#78716C" }} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E5E2DC", borderRadius: 0, fontFamily: "IBM Plex Mono" }} />
                                    <Bar dataKey="sent" fill="#E5E2DC" name="sent" />
                                    <Bar dataKey="replied" fill="#D95A40" name="replied" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                    <div style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        {data.channels.map((c) => (
                            <span key={c.channel} style={{ marginRight: "1.5rem" }}>
                                <span className="label" style={{ color: "var(--text-secondary)" }}>{c.channel}</span>{" "}
                                <span className="num" style={{ color: "var(--text)" }}>{c.reply_rate}%</span>
                            </span>
                        ))}
                    </div>
                </div>

                <div className="card" style={{ padding: "1.25rem 1.5rem" }} data-testid="leaderboard-card">
                    <div className="label" style={{ marginBottom: "0.75rem" }}>Template leaderboard</div>
                    {data.template_leaderboard.length === 0 ? (
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Create templates to see stats.</div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            {data.template_leaderboard.map((t, i) => (
                                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.35rem 0", borderBottom: i === data.template_leaderboard.length - 1 ? "none" : "1px solid var(--divider)" }} data-testid={`leaderboard-row-${t.id}`}>
                                    <div className="num" style={{ width: 18, color: "var(--text-muted)" }}>{i + 1}</div>
                                    <div style={{ flex: 1, fontSize: "0.9rem" }}>
                                        <div>{t.name}</div>
                                        <div className="label">{t.channel} · {t.use_count} sent</div>
                                    </div>
                                    <div className="num" style={{ fontSize: "1.05rem", color: "var(--accent)" }}>{t.reply_rate}%</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Heatmap({ days }) {
    // group by weeks (7 cells vertical, N weeks horizontal)
    const weeks = [];
    let current = [];
    days.forEach((d, i) => {
        current.push(d);
        if (current.length === 7) { weeks.push(current); current = []; }
    });
    if (current.length) weeks.push(current);
    const max = Math.max(1, ...days.map((d) => d.count));
    const shade = (n) => {
        if (n === 0) return "#FFFFFF";
        const pct = Math.min(1, n / max);
        // blend #FDFBF7 → #D95A40
        const r = Math.round(253 + (217 - 253) * pct);
        const g = Math.round(251 + (90 - 251) * pct);
        const b = Math.round(247 + (64 - 247) * pct);
        return `rgb(${r},${g},${b})`;
    };

    return (
        <div style={{ display: "flex", gap: "2px", overflowX: "auto" }} className="thin-scroll">
            {weeks.map((w, wi) => (
                <div key={wi} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {w.map((d) => (
                        <div key={d.date} className="hm-cell" title={`${d.date}: ${d.count}`} style={{ background: shade(d.count) }} />
                    ))}
                </div>
            ))}
        </div>
    );
}

function Funnel({ f }) {
    const rows = [
        { label: "Applied", value: f.applied, tone: "neutral" },
        { label: "Responded", value: f.responded, tone: "neutral" },
        { label: "Interviewed", value: f.interviewed, tone: "accent" },
        { label: "Advanced", value: f.advanced, tone: "accent2" },
        { label: "Offer", value: f.offer, tone: "accent2" },
        { label: "Rejected / Ghosted", value: (f.rejected || 0) + (f.ghosted || 0), tone: "muted" },
    ];
    const max = Math.max(1, ...rows.map((r) => r.value));
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {rows.map((r) => (
                <div key={r.label} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }} data-testid={`funnel-row-${r.label.toLowerCase().replace(/ \/ /g, "-").replace(/\s+/g, "-")}`}>
                    <div style={{ width: 110, fontSize: "0.8rem", color: "var(--text-secondary)" }}>{r.label}</div>
                    <div style={{ flex: 1, height: 22, background: "var(--surface-muted)", position: "relative" }}>
                        <div style={{
                            height: "100%",
                            width: `${(r.value / max) * 100}%`,
                            background: r.tone === "accent" ? "var(--accent)" : (r.tone === "accent2" ? "var(--accent-2)" : (r.tone === "muted" ? "#D6D3CD" : "#C7C3BA")),
                            transition: "width 250ms ease",
                        }} />
                    </div>
                    <div className="num" style={{ width: 36, textAlign: "right" }}>{r.value}</div>
                </div>
            ))}
        </div>
    );
}
