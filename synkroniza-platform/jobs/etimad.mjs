// Daily: new Etimad tenders that match the keywords in «ملف الشركة ← إعدادات الرصد» → «توليد الليدز ← رصد المنافسات».
import { list, insertNew, settings, jobStatus, lines, norm, nowISO, sleep } from "./lib.mjs";

const DEFAULT_KW = "تقنية المعلومات\nأمن سيبراني\nالأمن السيبراني\nتشغيل وصيانة\nتطوير أنظمة\nتكامل الأنظمة\nكوادر\nتعهيد\nمركز عمليات\nتحول رقمي\nبرمجيات\nشبكات\nسحابة";
const BASE = "https://tenders.etimad.sa/Tender/AllSupplierTendersForVisitorAsync";
const pick = (o, ...ks) => { for (const k of ks) if (o[k] != null && o[k] !== "") return o[k]; return ""; };

export async function run() {
  const st = await settings();
  const kw = lines(st.tenderKeywords || DEFAULT_KW).map(norm);
  const seen = new Set([...(await list("leads")).map((l) => l.ref), ...(await list("tenders")).map((t) => t.ref)].filter(Boolean));
  const found = [];
  let fetched = 0;
  for (let page = 1; page <= 8; page++) {
    const r = await fetch(`${BASE}?PageSize=24&PageNumber=${page}`, { headers: { Accept: "application/json, text/javascript, */*", "X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept-Language": "ar,en;q=0.8" } });
    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch { throw new Error(`اعتماد رجّع رد مش JSON (HTTP ${r.status}) — غالباً حماية الموقع منعت السيرفر. الحل: تنبيهات اعتماد على الإيميل + صندوق Leads.`); }
    const arr = j.data || j.Data || j.items || [];
    if (!arr.length) break;
    fetched += arr.length;
    for (const t of arr) {
      const title = String(pick(t, "tenderName", "TenderName", "name"));
      const ref = String(pick(t, "referenceNumber", "ReferenceNumber", "tenderNumber"));
      const activity = String(pick(t, "tenderActivityName", "TenderActivityName", "activityName"));
      const hay = norm(title + " " + activity);
      if (!title || !ref || seen.has(ref) || !kw.some((k) => hay.includes(k))) continue;
      seen.add(ref);
      const sid = pick(t, "tenderIdString", "TenderIdString");
      const deadline = String(pick(t, "lastOfferPresentationDate", "LastOfferPresentationDate", "offersOpeningDate")).slice(0, 10);
      found.push({ collection: "leads", id: "etimad_" + ref.replace(/[^\w-]/g, "").slice(0, 60), data: {
        title, ref, entity: String(pick(t, "agencyName", "AgencyName", "branchName")), sector: activity,
        deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : null,
        url: sid ? "https://tenders.etimad.sa/Tender/DetailsForVisitor?STenderId=" + encodeURIComponent(sid) : "https://tenders.etimad.sa/Tender/AllTendersForVisitor",
        value: Number(pick(t, "condetionalBookletPrice", "bookletPrice")) || null, source: "اعتماد", foundAt: nowISO() } });
    }
    await sleep(1200);
  }
  await insertNew(found);
  await jobStatus("etimad", true, `راجعت ${fetched} منافسة — ${found.length} جديدة مطابقة للكلمات`, { count: found.length });
}
if (import.meta.url === `file://${process.argv[1]}`) run().catch(async (e) => { await jobStatus("etimad", false, e.message); process.exit(1); });
