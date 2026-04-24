import React, { useEffect, useState } from "react";
import { NavLink, Route, Routes, BrowserRouter, useLocation } from "react-router-dom";
import { LayoutDashboard, Building2, FileText, Bell, Download, Plus, Sparkles } from "lucide-react";
import "@/App.css";
import Dashboard from "./pages/Dashboard";
import Companies from "./pages/Companies";
import Templates from "./pages/Templates";
import Followups from "./pages/Followups";
import QuickLogModal from "./components/QuickLogModal";
import AddCompanyModal from "./components/AddCompanyModal";
import { api } from "./lib/api";

function Sidebar() {
    return (
        <aside className="sidebar" data-testid="sidebar">
            <div style={{ paddingLeft: "0.25rem", marginBottom: "2rem" }}>
                <div className="font-serif" style={{ fontSize: "1.5rem", fontWeight: 500, lineHeight: 1, letterSpacing: "-0.01em" }}>
                    Campaign
                </div>
                <div className="label" style={{ marginTop: "0.35rem" }}>Job-Search CRM</div>
            </div>
            <nav style={{ display: "flex", flexDirection: "column" }}>
                <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} data-testid="nav-dashboard">
                    <LayoutDashboard size={16} /> Dashboard
                </NavLink>
                <NavLink to="/companies" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} data-testid="nav-companies">
                    <Building2 size={16} /> Companies
                </NavLink>
                <NavLink to="/followups" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} data-testid="nav-followups">
                    <Bell size={16} /> Follow-ups
                </NavLink>
                <NavLink to="/templates" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} data-testid="nav-templates">
                    <FileText size={16} /> Templates
                </NavLink>
            </nav>
            <div style={{ marginTop: "auto" }}>
                <a
                    className="btn btn-ghost"
                    href={api.exportZipUrl()}
                    style={{ width: "100%", justifyContent: "flex-start", fontSize: "0.85rem" }}
                    data-testid="export-zip-btn"
                >
                    <Download size={14} /> Export all (CSV .zip)
                </a>
                <div className="label" style={{ marginTop: "1rem", padding: "0 0.5rem" }}>v1.0 · local-first</div>
            </div>
        </aside>
    );
}

function TopBar({ onQuickLog, onAddCompany }) {
    const loc = useLocation();
    const titleMap = {
        "/": "Dashboard",
        "/companies": "Companies",
        "/templates": "Templates",
        "/followups": "Follow-ups",
    };
    const title = titleMap[loc.pathname] || (loc.pathname.startsWith("/companies") ? "Companies" : "Campaign");
    return (
        <div className="topbar">
            <div>
                <div className="label">Today · {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
                <div className="font-serif" style={{ fontSize: "1.75rem", fontWeight: 400, lineHeight: 1.1, marginTop: "0.2rem" }}>{title}</div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn-secondary" onClick={onAddCompany} data-testid="topbar-add-company">
                    <Plus size={14} /> Company
                </button>
                <button className="btn btn-primary" onClick={onQuickLog} data-testid="topbar-quick-log">
                    <Sparkles size={14} /> Quick Log
                </button>
            </div>
        </div>
    );
}

function Shell() {
    const [quickOpen, setQuickOpen] = useState(false);
    const [addCompanyOpen, setAddCompanyOpen] = useState(false);
    const [refreshToken, setRefreshToken] = useState(0);

    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setQuickOpen(true);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    const bump = () => setRefreshToken((n) => n + 1);

    return (
        <div className="shell">
            <Sidebar />
            <div className="main">
                <TopBar onQuickLog={() => setQuickOpen(true)} onAddCompany={() => setAddCompanyOpen(true)} />
                <div className="page">
                    <Routes>
                        <Route path="/" element={<Dashboard refreshToken={refreshToken} />} />
                        <Route path="/companies" element={<Companies refreshToken={refreshToken} onChange={bump} />} />
                        <Route path="/templates" element={<Templates refreshToken={refreshToken} />} />
                        <Route path="/followups" element={<Followups refreshToken={refreshToken} onChange={bump} />} />
                    </Routes>
                </div>
            </div>
            <QuickLogModal
                open={quickOpen}
                onClose={() => setQuickOpen(false)}
                onCommit={() => { bump(); setQuickOpen(false); }}
            />
            <AddCompanyModal
                open={addCompanyOpen}
                onClose={() => setAddCompanyOpen(false)}
                onCreated={() => { bump(); setAddCompanyOpen(false); }}
            />
        </div>
    );
}

export default function App() {
    return (
        <div className="App">
            <BrowserRouter>
                <Shell />
            </BrowserRouter>
        </div>
    );
}
