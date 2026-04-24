import React from "react";

export function Modal({ open, onClose, title, children, width = 560, testid }) {
    if (!open) return null;
    return (
        <div className="modal-overlay" onClick={onClose} data-testid={`${testid || "modal"}-overlay`}>
            <div
                className="card fade-in"
                onClick={(e) => e.stopPropagation()}
                style={{ width, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
                data-testid={`${testid || "modal"}-panel`}
            >
                <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div className="font-serif" style={{ fontSize: "1.5rem", fontWeight: 400 }}>{title}</div>
                    <button className="btn btn-ghost" onClick={onClose} data-testid={`${testid || "modal"}-close`} style={{ padding: "0.25rem 0.6rem" }}>×</button>
                </div>
                <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto" }}>
                    {children}
                </div>
            </div>
        </div>
    );
}

export function Drawer({ open, onClose, children, testid }) {
    if (!open) return null;
    return (
        <>
            <div className="drawer-overlay" onClick={onClose} data-testid={`${testid || "drawer"}-overlay`} />
            <div className="drawer-panel slide-in" data-testid={`${testid || "drawer"}-panel`}>
                {children}
            </div>
        </>
    );
}

export function Field({ label, children, testid }) {
    return (
        <div style={{ marginBottom: "1rem" }} data-testid={testid ? `${testid}-field` : undefined}>
            <div className="label" style={{ marginBottom: "0.35rem" }}>{label}</div>
            {children}
        </div>
    );
}

export function Pill({ kind, children, className = "", onClick, testid }) {
    return (
        <span
            className={`pill pill-${kind} ${className}`}
            onClick={onClick}
            data-testid={testid}
            style={onClick ? { cursor: "pointer" } : undefined}
        >
            {children}
        </span>
    );
}

export function Select({ value, onChange, options, testid, className = "" }) {
    return (
        <select
            className={`select ${className}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            data-testid={testid}
        >
            {options.map((o) => (
                <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
            ))}
        </select>
    );
}

export function Spinner({ size = 16 }) {
    return (
        <svg className="spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export function EmptyState({ title, hint, action }) {
    return (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-secondary)" }}>
            <div className="font-serif" style={{ fontSize: "1.4rem", color: "var(--text)", marginBottom: "0.35rem" }}>{title}</div>
            {hint && <div style={{ fontSize: "0.9rem" }}>{hint}</div>}
            {action && <div style={{ marginTop: "1rem" }}>{action}</div>}
        </div>
    );
}
