// Daily: reads the «Leads» folder of the company mailbox (Microsoft 365). Any alert you forward or route there —
// Tender Alerts, Furas, Etimad notifications, vendor-portal emails, Manus results — becomes leads/news.
import { insertNew, jobStatus, graph, msReady, env, ai, sha, nowISO } from "./lib.mjs";

const strip = (h) => String(h || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export async function run() {
  const box = env("MS_INBOX") || env("MS_SENDER");
  if (!msReady() || !box) return jobStatus("inbox", true, "Microsoft 365 مش متوصّل — المهمة متوقفة لحد ما يتظبط");
  const folderName = env("MS_INBOX_FOLDER") || "Leads";
  const f = await graph(`/users/${encodeURIComponent(box)}/mailFolders?$filter=displayName eq '${folderName}'&$top=1`);
  const folder = f.value && f.value[0];
  if (!folder) return jobStatus("inbox", true, `مفيش فولدر اسمه «${folderName}» في ${box} — اعمله واعمل Rule تحوّل له التنبيهات`);
  const msgs = (await graph(`/users/${encodeURIComponent(box)}/mailFolders/${folder.id}/messages?$filter=isRead eq false&$top=25&$select=id,subject,from,receivedDateTime,body,bodyPreview`)).value || [];
  const rows = [];
  for (const m of msgs) {
    const text = strip(m.body && m.body.content).slice(0, 15000);
    const from = m.from && m.from.emailAddress ? m.from.emailAddress.name || m.from.emailAddress.address : "";
    let items = null;
    try {
      items = await ai("ده إيميل وصل لصندوق الليدز في شركة تقنية سعودية (تنبيه مناقصات، فرص، أخبار، أو نتائج بحث عن شركات). استخرج كل عنصر مفيد. أعد JSON فقط: {\"tenders\":[{\"title\":\"\",\"entity\":\"\",\"ref\":\"\",\"deadline\":\"YYYY-MM-DD أو فاضي\",\"url\":\"\"}],\"news\":[{\"title\":\"\",\"summary\":\"\",\"url\":\"\"}],\"companies\":[{\"name\":\"\",\"website\":\"\",\"why\":\"\"}]}\n\nالموضوع: " + m.subject + "\nمن: " + from + "\n\n" + text, { json: true, tier: "quick" });
    } catch (e) { console.warn("AI extract skipped:", e.message); }
    const before = rows.length;
    if (items && typeof items === "object") {
      (items.tenders || []).filter((t) => t && t.title).forEach((t) => rows.push({ collection: "leads", id: t.ref ? "mail_" + String(t.ref).replace(/[^\w-]/g, "").slice(0, 60) : "mail_" + sha(t.title).slice(0, 20), data: { title: t.title, entity: t.entity || "", ref: t.ref || "", deadline: /^\d{4}-\d{2}-\d{2}$/.test(t.deadline || "") ? t.deadline : null, url: t.url || "", source: "إيميل: " + from, foundAt: nowISO() } }));
      (items.news || []).filter((n) => n && n.title).forEach((n) => rows.push({ collection: "news", id: "n_" + sha(n.url || n.title).slice(0, 24), data: { title: n.title, summary: n.summary || "", link: n.url || "", source: from, entity: "", status: "new", pubDate: String(m.receivedDateTime).slice(0, 10), foundAt: nowISO() } }));
      (items.companies || []).filter((c) => c && c.name).forEach((c) => rows.push({ collection: "news", id: "n_" + sha("co" + c.name).slice(0, 24), data: { title: "شركة مقترحة: " + c.name, summary: c.why || "", link: c.website || "", source: from, entity: c.name, tags: ["ليد"], status: "new", pubDate: String(m.receivedDateTime).slice(0, 10), foundAt: nowISO() } }));
    }
    if (rows.length === before) {
      rows.push({ collection: "news", id: "n_" + sha(m.id).slice(0, 24), data: { title: m.subject || "(بدون عنوان)", summary: String(m.bodyPreview || "").slice(0, 400), link: "", source: "إيميل: " + from, entity: "", status: "new", pubDate: String(m.receivedDateTime).slice(0, 10), foundAt: nowISO() } });
    }
    await graph(`/users/${encodeURIComponent(box)}/messages/${m.id}`, { method: "PATCH", body: { isRead: true } });
  }
  await insertNew(rows);
  await jobStatus("inbox", true, `قريت ${msgs.length} إيميل من «${folderName}» — ${rows.length} عنصر جديد`, { count: rows.length });
}
if (import.meta.url === `file://${process.argv[1]}`) run().catch(async (e) => { await jobStatus("inbox", false, e.message); process.exit(1); });
