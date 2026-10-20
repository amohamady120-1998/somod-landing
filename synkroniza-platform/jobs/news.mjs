// Daily: news about target accounts, vendor-portal companies and market keywords (Google News RSS, free),
// scored by AI when one is configured → «الأخبار والإشارات».
import { list, insertNew, settings, companyProfile, jobStatus, lines, norm, sha, nowISO, sleep, ai } from "./lib.mjs";

const DEFAULT_TOPICS = "ترسية مشروع تحول رقمي السعودية\nمنافسة أمن سيبراني السعودية\nتعيين رئيس تنفيذي للتقنية السعودية\nمشروع تقنية معلومات جديد السعودية";
const decode = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]+>/g, "").trim();
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? decode(m[1]) : ""; };

export function parseRss(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => ({ title: tag(m[1], "title"), link: tag(m[1], "link"), pubDate: tag(m[1], "pubDate"), source: tag(m[1], "source") }));
}
async function rss(q) {
  const url = "https://news.google.com/rss/search?q=" + encodeURIComponent(q) + "&hl=ar&gl=SA&ceid=SA:ar";
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) return [];
  return parseRss(await r.text());
}

export async function run() {
  const st = await settings();
  const mode = st.watchMode || "smart";
  const accounts = await list("accounts");
  const kb = await list("kb");
  const watch = [];
  if (mode === "smart") accounts.filter((a) => a.fit === "high" || Number(a.score) >= 70 || ["contacting", "engaged", "vendor", "client"].includes(a.status)).slice(0, 30).forEach((a) => watch.push({ name: a.name, accountId: a.id }));
  if (mode !== "off") {
    kb.filter((x) => x.kind === "portal").forEach((p) => watch.push({ name: p.name }));
    lines(st.extraWatch).forEach((n) => watch.push({ name: n }));
  }
  const seenNames = new Set(); const targets = watch.filter((w) => w.name && !seenNames.has(norm(w.name)) && seenNames.add(norm(w.name))).slice(0, 45);
  const topics = lines(st.newsKeywords || DEFAULT_TOPICS).slice(0, 10);
  const existing = new Set((await list("news")).map((n) => n.id));
  const fresh = [];
  const cutoff = Date.now() - 3 * 864e5;
  const add = (it, entity, accountId) => {
    const id = "n_" + sha(it.link || it.title).slice(0, 24);
    const when = Date.parse(it.pubDate);
    if (existing.has(id) || (when && when < cutoff)) return;
    existing.add(id);
    fresh.push({ id, title: it.title, link: it.link, source: it.source || "Google News", pubDate: when ? new Date(when).toISOString().slice(0, 10) : "", entity, accountId: accountId || null });
  };
  for (const w of targets) { (await rss(`"${w.name}" when:2d`)).slice(0, 5).forEach((it) => add(it, w.name, w.accountId)); await sleep(700); }
  for (const t of topics) { (await rss(`${t} when:2d`)).slice(0, 6).forEach((it) => add(it, "", null)); await sleep(700); }

  let scored = 0;
  if (fresh.length) {
    const prof = await companyProfile();
    for (let i = 0; i < fresh.length; i += 40) {
      const batch = fresh.slice(i, i + 40);
      try {
        const res = await ai(
          "أنت محلل تطوير أعمال لشركة " + (prof.companyName || "Synkroniza") + " (" + (prof.tagline || prof.about || "خدمات تقنية وكوادر متخصصة وتكامل أنظمة وأمن سيبراني في السعودية").slice(0, 400) + "). " +
          "قيّم كل خبر من 0 إلى 100 حسب أهميته لنا كفرصة بيع أو إشارة شراء (مشروع جديد، ترسية، ميزانية، تعيين قيادي تقني، توسع، شراكة)، واكتب ملخص سطر بالعربي واقتراح إجراء عملي قصير. " +
          'أعد JSON فقط: [{"i":0,"score":0,"summary":"","action":"","tags":["ترسية"]}]\n\n' +
          JSON.stringify(batch.map((n, k) => ({ i: k, title: n.title, about: n.entity, source: n.source }))),
          { json: true, tier: "quick" });
        if (Array.isArray(res)) res.forEach((r) => { const n = batch[r.i]; if (n) { n.score = Math.max(0, Math.min(100, Number(r.score) || 0)); n.summary = r.summary || ""; n.action = r.action || ""; n.tags = Array.isArray(r.tags) ? r.tags.slice(0, 4) : []; scored++; } });
      } catch (e) { console.warn("AI scoring skipped:", e.message); }
    }
  }
  const keep = fresh.filter((n) => n.score == null || n.score >= 25);
  await insertNew(keep.map((n) => ({ collection: "news", id: n.id, data: { ...n, status: "new", foundAt: nowISO() } })));
  await jobStatus("news", true, `تابعت ${targets.length} جهة و${topics.length} موضوع — ${keep.length} خبر جديد${scored ? " (مقيّمة بالذكاء)" : ""}`, { count: keep.length });
}
if (import.meta.url === `file://${process.argv[1]}`) run().catch(async (e) => { await jobStatus("news", false, e.message); process.exit(1); });
