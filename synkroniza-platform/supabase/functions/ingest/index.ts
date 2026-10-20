// Inbound webhook for any outside tool (Manus, Zapier, Make, a script…) to push data in.
// POST https://<project>.supabase.co/functions/v1/ingest   header: x-ingest-key: <INGEST_KEY>
// Body: { "type": "accounts" | "contacts" | "leads" | "news", "source": "manus", "items": [ {...}, ... ] }
//   accounts: name, website, sector, city, notes
//   contacts: name, title, company, website, email, phone, linkedin
//   leads (tenders/opportunities): title, entity, ref, deadline (YYYY-MM-DD), url, sector, value
//   news: title, link, source, entity, summary, pubDate
import { cors, reply, fail, env, admin } from "../_shared/common.ts";

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const domainOf = (u: unknown) => { const s = String(u ?? "").trim(); if (!s) return ""; try { return new URL(/^https?:/i.test(s) ? s : "https://" + s).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const rid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20);
const now = () => new Date().toISOString();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!env("INGEST_KEY") || req.headers.get("x-ingest-key") !== env("INGEST_KEY")) return fail("not_granted", "Wrong or missing x-ingest-key.", 401);
  let b: { type?: string; source?: string; items?: Record<string, unknown>[] };
  try { b = await req.json(); } catch { return fail("invalid_request", "Body must be JSON."); }
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 500);
  const source = String(b.source ?? "webhook").slice(0, 40);
  const sb = admin();
  const { data: accRows } = await sb.from("docs").select("id,data").eq("collection", "accounts");
  const accounts = (accRows ?? []).map((r) => ({ id: r.id as string, name: norm(r.data?.name), domain: r.data?.domain || domainOf(r.data?.website) }));
  const rows: { collection: string; id: string; data: Record<string, unknown> }[] = [];
  let skipped = 0;
  const findAcc = (name: unknown, site: unknown) => { const d = domainOf(site); return accounts.find((a) => (d && a.domain === d) || (name && a.name === norm(name))); };
  const addAcc = (name: unknown, site: unknown, extra: Record<string, unknown> = {}) => {
    const d = domainOf(site); const id = rid();
    const a = { name: String(name || d), website: d ? "https://" + d : "", domain: d, status: "new", source, createdAt: now(), updatedAt: now(), ...extra };
    rows.push({ collection: "accounts", id, data: a }); accounts.push({ id, name: norm(a.name), domain: d }); return id;
  };
  for (const it of items) {
    if (b.type === "accounts") {
      if (!it.name || findAcc(it.name, it.website)) { skipped++; continue; }
      addAcc(it.name, it.website, { sector: it.sector ?? "", city: it.city ?? "", notes: it.notes ?? "" });
    } else if (b.type === "contacts") {
      if (!it.name || !(it.company || it.website)) { skipped++; continue; }
      const acc = findAcc(it.company, it.website)?.id ?? addAcc(it.company, it.website);
      rows.push({ collection: "contacts", id: rid(), data: { name: it.name, accountId: acc, title: it.title ?? "", email: it.email ?? "", phone: it.phone ?? "", linkedin: it.linkedin ?? "", role: "", notes: "من " + source, createdAt: now(), updatedAt: now() } });
    } else if (b.type === "leads") {
      if (!it.title) { skipped++; continue; }
      const id = it.ref ? "ref_" + String(it.ref).replace(/[^\w-]/g, "").slice(0, 60) : rid();
      rows.push({ collection: "leads", id, data: { title: it.title, entity: it.entity ?? "", ref: it.ref ?? "", deadline: it.deadline ?? null, url: it.url ?? "", sector: it.sector ?? "", value: it.value ?? null, source, foundAt: now() } });
    } else if (b.type === "news") {
      if (!it.title) { skipped++; continue; }
      const id = "n_" + (await sha(String(it.link || it.title))).slice(0, 24);
      rows.push({ collection: "news", id, data: { title: it.title, link: it.link ?? "", source: it.source ?? source, entity: it.entity ?? "", summary: it.summary ?? "", pubDate: it.pubDate ?? now().slice(0, 10), status: "new", foundAt: now() } });
    } else return fail("invalid_request", "type must be accounts, contacts, leads or news.");
  }
  if (rows.length) {
    const { error } = await sb.from("docs").upsert(rows, { onConflict: "collection,id", ignoreDuplicates: true });
    if (error) return fail("upstream_error", error.message, 500);
  }
  return reply({ received: items.length, saved: rows.length, skipped });
});

async function sha(s: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
