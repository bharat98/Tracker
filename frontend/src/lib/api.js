import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API, timeout: 60000 });

export const api = {
    // companies
    listCompanies: (params = {}) => client.get("/companies", { params }).then(r => r.data),
    getCompany: (id) => client.get(`/companies/${id}`).then(r => r.data),
    createCompany: (data) => client.post("/companies", data).then(r => r.data),
    updateCompany: (id, data) => client.patch(`/companies/${id}`, data).then(r => r.data),
    deleteCompany: (id) => client.delete(`/companies/${id}`).then(r => r.data),

    // contacts
    listContacts: (company_id) => client.get("/contacts", { params: { company_id } }).then(r => r.data),
    createContact: (data) => client.post("/contacts", data).then(r => r.data),
    updateContact: (id, data) => client.patch(`/contacts/${id}`, data).then(r => r.data),
    deleteContact: (id) => client.delete(`/contacts/${id}`).then(r => r.data),

    // messages
    listMessages: (params) => client.get("/messages", { params }).then(r => r.data),
    createMessage: (data) => client.post("/messages", data).then(r => r.data),
    updateMessage: (id, data) => client.patch(`/messages/${id}`, data).then(r => r.data),
    deleteMessage: (id) => client.delete(`/messages/${id}`).then(r => r.data),
    snoozeMessage: (id, days) => client.post(`/messages/${id}/snooze`, null, { params: { days } }).then(r => r.data),

    // templates
    listTemplates: () => client.get("/templates").then(r => r.data),
    createTemplate: (data) => client.post("/templates", data).then(r => r.data),
    updateTemplate: (id, data) => client.patch(`/templates/${id}`, data).then(r => r.data),
    deleteTemplate: (id) => client.delete(`/templates/${id}`).then(r => r.data),
    templateUsage: (id) => client.get(`/templates/${id}/usage`).then(r => r.data),

    // events
    listEvents: (company_id) => client.get("/events", { params: { company_id } }).then(r => r.data),
    createEvent: (data) => client.post("/events", data).then(r => r.data),
    deleteEvent: (id) => client.delete(`/events/${id}`).then(r => r.data),

    // followups, dashboard
    followups: () => client.get("/followups").then(r => r.data),
    dashboard: () => client.get("/dashboard").then(r => r.data),

    // ai
    extractUrl: (url) => client.post("/ai/extract-url", { url }).then(r => r.data),
    nlLog: (text) => client.post("/ai/nl-log", { text }).then(r => r.data),
    nlLogCommit: (parsed) => client.post("/ai/nl-log/commit", { parsed }).then(r => r.data),

    // export
    exportZipUrl: () => `${API}/export/zip`,
};

export const STAGES = ["sourced", "applied", "screen", "interview", "final", "offer", "closed"];
export const PIPELINES = ["ongoing", "offer", "rejected", "withdrawn"];
export const ROLE_TYPES = ["hm", "recruiter", "referral", "cold_reach", "employee"];
export const CONN_STATUSES = ["none", "pending", "accepted", "declined"];
export const CHANNELS = ["linkedin", "email", "phone", "in_person", "other"];

export function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function fmtRelative(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.round((now - d) / (1000 * 60 * 60 * 24));
    if (diff === 0) return "today";
    if (diff === 1) return "yesterday";
    if (diff > 0 && diff < 30) return `${diff}d ago`;
    if (diff < 0 && diff > -30) return `in ${-diff}d`;
    return fmtDate(iso);
}

export function applyPlaceholders(template, values) {
    return (template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => values[key] ?? `{{${key}}}`);
}
