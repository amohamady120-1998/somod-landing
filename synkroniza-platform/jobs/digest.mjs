// Every working morning (Sun–Thu): each team member gets «خطتك النهارده» by email, and the manager gets
// yesterday's team report (on Sunday it covers Thursday to Saturday). Needs Microsoft 365 to send.
import { list, profiles, settings, jobStatus, sendMail, msReady, env, ksaDate, escHtml as e } from "./lib.mjs";

const ACT = { call: "مكالمة", email: "إيميل", linkedin: "LinkedIn", meeting: "اجتماع", whatsapp: "واتساب", visit: "زيارة", portal: "تسجيل مورد" };
const STAGE = { target: "مستهدف", contacted: "تم التواصل", meeting: "اجتماع", proposal: "عرض مقدّم", negotiation: "تفاوض", won: "فوز", lost: "خسارة" };
const wrap = (title, body) => `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:14px;color:#0B2338;max-width:640px"><h2 style="color:#D4561A;margin:0 0 4px">${e(title)}</h2>${body}<p style="color:#7A8A9B;font-size:12px;margin-top:24px">Synkroniza BD${env("APP_URL") ? ` · <a href="${e(env("APP_URL"))}">افتح المنصة</a>` : ""}</p></div>`;
const ul = (arr) => arr.length ? "<ul style=\"padding-right:18px;margin:6px 0\">" + arr.map((x) => `<li style="margin:3px 0">${x}</li>`).join("") + "</ul>" : '<p style="color:#7A8A9B;margin:6px 0">لا يوجد</p>';
const h3 = (t) => `<h3 style="margin:18px 0 4px;font-size:15px">${t}</h3>`;

export async function run() {
  if (!msReady() || !env("MS_SENDER")) return jobStatus("digest", true, "Microsoft 365 مش متوصّل — الإيميلات اليومية متوقفة (التقارير متاحة جوه المنصة)");
  const day = new Date(Date.now() + 3 * 3600e3).getUTCDay(); // 0=Sunday (KSA)
  if (day === 5 || day === 6) return jobStatus("digest", true, "إجازة نهاية الأسبوع — مفيش إيميلات");
  const today = ksaDate(0), from = ksaDate(day === 0 ? -3 : -1), to = ksaDate(-1);
  const inR = (d) => { d = String(d || "").slice(0, 10); return d >= from && d <= to; };
  const [people, st, tasks, acts, opps, tenders, leads, news, accounts] = await Promise.all([profiles(), settings(), list("tasks"), list("acts"), list("opps"), list("tenders"), list("leads"), list("news"), list("accounts")]);
  const accName = (id) => (accounts.find((a) => a.id === id) || {}).name || "";
  const team = people.filter((p) => ["bd", "manager", "admin"].includes(p.role) && p.email);
  const soonT = tenders.filter((t) => t.deadline && t.deadline >= today && t.deadline <= ksaDate(7) && ["watch", "go", "prep", undefined].includes(t.status)).sort((a, b) => (a.deadline < b.deadline ? -1 : 1));
  const newLeads = leads.filter((l) => String(l.foundAt || "").slice(0, 10) >= from);
  const hotNews = news.filter((n) => (n.status || "new") === "new" && (n.score == null || n.score >= 60)).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 6);
  let sent = 0;

  for (const p of team) {
    const mine = tasks.filter((t) => (!t.owner || t.owner === p.id) && t.status !== "done" && t.status !== "skipped" && (t.due || today) <= today);
    const fu = [...acts.filter((a) => a.by === p.id && a.nextDate && !a.nextDone && a.nextDate <= today).map((a) => `${e(a.nextAction || "متابعة")} — ${e(accName(a.accountId))}`),
      ...opps.filter((o) => o.owner === p.id && o.nextDate && !o.nextDone && o.nextDate <= today && !["won", "lost"].includes(o.stage)).map((o) => `${e(o.nextStep || "متابعة فرصة")} — ${e(o.title)}`)];
    const body =
      h3("مهامك (" + mine.length + ")") + ul(mine.slice(0, 12).map((t) => e(t.title) + (t.due < today ? ' <span style="color:#B53A33">(متأخرة)</span>' : ""))) +
      (mine.some((t) => t.source === "plan" && t.planDate === today) ? "" : '<p style="color:#7A8A9B">افتح «مهامي وخطة اليوم» في المنصة وخطة النهارده هتتولّد تلقائي.</p>') +
      h3("متابعات مستحقة (" + fu.length + ")") + ul(fu.slice(0, 10)) +
      h3("مناقصات قربت (7 أيام)") + ul(soonT.slice(0, 6).map((t) => `${e(t.title)} — ${e(t.entity || "")} (${e(t.deadline)})`)) +
      h3("جديد من الرصد") + ul([...newLeads.slice(0, 5).map((l) => "منافسة: " + e(l.title)), ...hotNews.map((n) => "خبر: " + e(n.title) + (n.action ? " — " + e(n.action) : ""))]);
    if (await sendMail([p.email], "خطتك النهارده — " + today, wrap("صباح الخير " + (p.name || ""), body))) sent++;
  }

  const managers = (st.digestTo ? [st.digestTo] : people.filter((p) => ["manager", "admin"].includes(p.role) && p.email).map((p) => p.email));
  const rows = team.map((p) => {
    const a = acts.filter((x) => x.by === p.id && inR(x.date));
    const d = tasks.filter((x) => (x.doneBy || x.owner) === p.id && x.status === "done" && inR(x.doneDate));
    const planned = tasks.filter((x) => x.owner === p.id && x.source === "plan" && inR(x.planDate));
    return { p, a, d, rate: planned.length ? Math.round((planned.filter((x) => x.status === "done").length / planned.length) * 100) + "%" : "—" };
  });
  const moves = []; opps.forEach((o) => (o.stageHist || []).forEach((h) => { if (inR(h.at)) moves.push(`${e(o.title)} ← ${e(STAGE[h.s] || h.s)} (${e((people.find((x) => x.id === h.by) || {}).name || "")})`); }));
  const won = opps.filter((o) => o.stage === "won" && inR(o.wonAt));
  const table = '<table style="border-collapse:collapse;width:100%;margin:8px 0"><tr style="background:#EBF0F5"><th style="padding:6px;border:1px solid #DAE2EA;text-align:right">الشخص</th><th style="padding:6px;border:1px solid #DAE2EA">أنشطة</th><th style="padding:6px;border:1px solid #DAE2EA">مهام منفّذة</th><th style="padding:6px;border:1px solid #DAE2EA">الالتزام بالخطة</th></tr>' +
    rows.map((r) => `<tr><td style="padding:6px;border:1px solid #DAE2EA">${e(r.p.name || r.p.email)}</td><td style="padding:6px;border:1px solid #DAE2EA;text-align:center">${r.a.length}</td><td style="padding:6px;border:1px solid #DAE2EA;text-align:center">${r.d.length}</td><td style="padding:6px;border:1px solid #DAE2EA;text-align:center">${r.rate}</td></tr>`).join("") + "</table>";
  const detail = rows.map((r) => r.a.length || r.d.length ? `<p style="margin:10px 0 2px"><b>${e(r.p.name || r.p.email)}</b></p>` + ul([...r.a.map((x) => `${e(ACT[x.type] || "نشاط")} — ${e(accName(x.accountId))}${x.summary ? ": " + e(x.summary) : ""}`), ...r.d.map((x) => "مهمة: " + e(x.title) + (x.result ? " — " + e(x.result) : ""))]) : "").join("");
  const report = h3("ملخص الفريق") + table + h3("حركة الفرص") + ul(moves) + (won.length ? h3("فوز 🎉") + ul(won.map((o) => `${e(o.title)} — ${Number(o.value || 0).toLocaleString("en-US")} ر.س`)) : "") + h3("التفاصيل") + (detail || '<p style="color:#7A8A9B">مفيش نشاط مسجّل.</p>');
  if (managers.length && await sendMail(managers, `تقرير فريق تطوير الأعمال — ${from === to ? from : from + " إلى " + to}`, wrap("تقرير الفريق", report))) sent++;
  await jobStatus("digest", true, `اتبعت ${sent} إيميل (${team.length} خطة يومية + تقرير المدير)`);
}
if (import.meta.url === `file://${process.argv[1]}`) run().catch(async (e) => { await jobStatus("digest", false, e.message); process.exit(1); });
