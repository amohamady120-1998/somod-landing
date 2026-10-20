// Shared helpers for the daily jobs (Node 20+, no dependencies).
import { createHash } from "node:crypto";

export const SB_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const env = (k) => process.env[k] || "";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
export const norm = (s) => String(s || "").toLowerCase().replace(/[إأآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim();
export const lines = (s) => String(s || "").split(/\n|،|,/).map((x) => x.trim()).filter(Boolean);
export const nowISO = () => new Date().toISOString();
// Dates in Saudi time (UTC+3).
export const ksaDate = (offsetDays = 0) => new Date(Date.now() + 3 * 3600e3 + offsetDays * 864e5).toISOString().slice(0, 10);

if (!SB_URL || !KEY) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"); process.exit(1); }

async function rest(path, { method = "GET", body, headers = {} } = {}) {
  const r = await fetch(SB_URL + "/rest/v1/" + path, {
    method,
    headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

export async function list(col) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await rest(`docs?select=id,data&collection=eq.${encodeURIComponent(col)}&order=id&offset=${from}&limit=1000`);
    out.push(...rows.map((r) => ({ id: r.id, ...r.data })));
    if (rows.length < 1000) return out;
  }
}
export async function getDoc(col, id) {
  const rows = await rest(`docs?select=data&collection=eq.${encodeURIComponent(col)}&id=eq.${encodeURIComponent(id)}`);
  return rows[0] ? rows[0].data : null;
}
// rows: [{collection, id, data}] — existing ids are left untouched.
export async function insertNew(rows) {
  for (let i = 0; i < rows.length; i += 200)
    await rest("docs?on_conflict=collection,id", { method: "POST", body: rows.slice(i, i + 200), headers: { Prefer: "resolution=ignore-duplicates,return=minimal" } });
}
export async function putDoc(col, id, data) {
  await rest("docs?on_conflict=collection,id", { method: "POST", body: [{ collection: col, id, data, updated_at: nowISO() }], headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
}
export async function mergeDoc(col, id, patch) {
  const cur = (await getDoc(col, id)) || {};
  const merge = (a, b) => { if (!a || typeof a !== "object" || Array.isArray(a) || !b || typeof b !== "object" || Array.isArray(b)) return b; const o = { ...a }; for (const k of Object.keys(b)) o[k] = merge(a[k], b[k]); return o; };
  await putDoc(col, id, merge(cur, patch));
}
export async function profiles() { return rest("profiles?select=id,name,email,role"); }
export async function settings() { return (await getDoc("kb", "settings")) || {}; }
export async function companyProfile() { return (await getDoc("kb", "profile")) || {}; }
export async function jobStatus(name, ok, msg, extra = {}) {
  await mergeDoc("kb", "jobs", { kind: "jobs", [name]: { ok, msg, at: nowISO(), ...extra } });
  console.log(`[${name}] ${ok ? "ok" : "FAILED"} — ${msg}`);
}

// AI through the platform's own `ai` function (whatever provider is configured). Returns null when none is.
export async function ai(prompt, { json = false, tier = "default" } = {}) {
  const r = await fetch(SB_URL + "/functions/v1/ai", { method: "POST", headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" }, body: JSON.stringify({ prompt, json, tier }) });
  const j = await r.json().catch(() => ({}));
  if (j.error) { if (j.error.code === "not_granted") return null; throw new Error("AI: " + j.error.message); }
  if (!json) return j.text;
  const t = String(j.text || "").trim();
  try { return JSON.parse(t); } catch { /* tolerant parse below */ }
  const i = t.search(/[[{]/), k = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  return i >= 0 && k > i ? JSON.parse(t.slice(i, k + 1)) : null;
}

// Microsoft Graph (client credentials). Returns null when Microsoft 365 isn't configured.
let tok = null;
export const msReady = () => !!(env("MS_TENANT_ID") && env("MS_CLIENT_ID") && env("MS_CLIENT_SECRET"));
export async function graph(path, { method = "GET", body } = {}) {
  if (!msReady()) return null;
  if (!tok) {
    const r = await fetch(`https://login.microsoftonline.com/${env("MS_TENANT_ID")}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: env("MS_CLIENT_ID"), client_secret: env("MS_CLIENT_SECRET"), scope: "https://graph.microsoft.com/.default" }) });
    const j = await r.json(); if (!r.ok) throw new Error("Microsoft sign-in: " + (j.error_description || r.status)); tok = j.access_token;
  }
  const r = await fetch("https://graph.microsoft.com/v1.0" + path, { method, headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 202 || r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Graph " + path + ": " + (j.error?.message || r.status));
  return j;
}
export async function sendMail(to, subject, html) {
  const from = env("MS_SENDER");
  if (!msReady() || !from || !to.length) return false;
  await graph(`/users/${encodeURIComponent(from)}/sendMail`, { method: "POST", body: { message: { subject, body: { contentType: "HTML", content: html }, toRecipients: to.map((a) => ({ emailAddress: { address: a } })) }, saveToSentItems: true } });
  return true;
}
export const escHtml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
