/* Synkroniza BD — standalone platform layer.
   Gives the app the same `window.claude.use(name)` interface it has inside Claude, backed by Supabase:
   db (live documents), user (team & roles), sample (AI through the `ai` edge function),
   mcp (Apollo + Microsoft 365 through the `integrations` edge function), assets (Storage), downloads.
   Must load after config.js and supabase.js, and before the app script. */
(function () {
  "use strict";
  const CFG = window.SKZ_CONFIG || {};
  if (!CFG.supabaseUrl || !CFG.supabaseAnonKey || !window.supabase) {
    document.addEventListener("DOMContentLoaded", () => {
      document.body.innerHTML = '<div dir="rtl" style="font-family:sans-serif;padding:40px;max-width:640px;margin:auto"><h2>المنصة مش متظبطة لسه</h2><p>ملف <code>config.js</code> ناقصه رابط Supabase والمفتاح العام. راجع خطوة «الاستضافة» في دليل الإعداد.</p></div>';
    });
    return;
  }
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  window.SKZ_SB = sb;
  window.SKZ_LEAD_NAME = "Apollo";
  window.SKZ_MAIL_NAME = "Outlook";

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/-/g, "").slice(0, 20);
  const WRITERS = ["bd", "manager", "admin"];
  const ROLE_T = { pending: "مستني موافقة", viewer: "عرض فقط", bd: "تطوير أعمال", manager: "مدير", admin: "مسؤول النظام" };

  /* ---------- sign-in gate ---------- */
  let uid = null, profile = null, status = null;
  function overlay(html) {
    let o = document.getElementById("skz-gate");
    if (!o) {
      o = document.createElement("div");
      o.id = "skz-gate";
      o.setAttribute("dir", "rtl");
      o.style.cssText = "position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:16px;background:var(--bg,#F3F6F9);font-family:var(--f-ui,sans-serif);color:var(--ink,#0B2338)";
      (document.body || document.documentElement).appendChild(o);
    }
    o.innerHTML = '<div style="width:min(420px,100%);background:var(--surface,#fff);border:1px solid var(--line,#DAE2EA);border-radius:14px;padding:26px 24px;box-shadow:var(--shadow)"><div style="display:flex;align-items:center;gap:10px;margin-bottom:18px"><svg width="34" height="34" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="8" fill="#F26A21"/><path d="M21.5 10.5c-1.2-1.3-3-2-5.2-2-3.3 0-5.6 1.7-5.6 4.3 0 2.5 1.9 3.5 5 4.2 2.4.5 3.3 1 3.3 2.1 0 1.2-1.2 2-3.1 2-2 0-3.6-.8-4.8-2.2" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg><div><b style="font-size:17px">Synkroniza</b><div style="font-size:11px;letter-spacing:.08em;color:var(--ink-3,#7A8A9B)">BUSINESS DEVELOPMENT</div></div></div>' + html + "</div>";
    return o;
  }
  function closeGate() { const o = document.getElementById("skz-gate"); if (o) o.remove(); }
  const fieldCss = "width:100%;padding:10px 12px;border:1px solid var(--line-2,#C9D4DF);border-radius:8px;background:var(--surface,#fff);color:inherit;font:inherit;margin-top:4px";
  const btnCss = "width:100%;padding:10px 14px;border-radius:8px;border:1px solid var(--accent,#D4561A);background:var(--accent,#D4561A);color:#fff;font:inherit;font-weight:700;cursor:pointer;margin-top:14px";
  const linkCss = "background:none;border:0;color:var(--info,#2A659F);cursor:pointer;font:inherit;padding:4px 0";

  function loginForm(mode, msg) {
    const signup = mode === "signup", reset = mode === "reset";
    const o = overlay(
      '<form id="skz-login"><h2 style="margin:0 0 6px;font-size:19px">' + (signup ? "حساب جديد" : reset ? "استرجاع كلمة السر" : "تسجيل الدخول") + "</h2>" +
      (msg ? '<div style="font-size:13px;padding:8px 10px;border-radius:8px;background:var(--warn-soft,#FBF0D9);margin:8px 0">' + esc(msg) + "</div>" : "") +
      (signup ? '<label style="display:block;margin-top:10px;font-size:13px">الاسم<input name="name" required style="' + fieldCss + '"></label>' : "") +
      '<label style="display:block;margin-top:10px;font-size:13px">الإيميل<input name="email" type="email" required autocomplete="email" style="' + fieldCss + '"></label>' +
      (reset ? "" : '<label style="display:block;margin-top:10px;font-size:13px">كلمة السر<input name="password" type="password" required minlength="8" autocomplete="' + (signup ? "new-password" : "current-password") + '" style="' + fieldCss + '"></label>') +
      '<button type="submit" style="' + btnCss + '">' + (signup ? "أنشئ الحساب" : reset ? "ابعت رابط الاسترجاع" : "دخول") + "</button>" +
      '<div style="display:flex;justify-content:space-between;margin-top:10px;font-size:13px">' +
      (signup || reset ? '<button type="button" data-m="login" style="' + linkCss + '">عندي حساب</button>' : '<button type="button" data-m="signup" style="' + linkCss + '">حساب جديد</button><button type="button" data-m="reset" style="' + linkCss + '">نسيت كلمة السر</button>') +
      "</div></form>");
    o.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => loginForm(b.dataset.m)));
    o.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target), email = String(f.get("email")).trim(), pw = String(f.get("password") || "");
      const btn = e.target.querySelector("[type=submit]"); btn.disabled = true;
      let r;
      if (signup) r = await sb.auth.signUp({ email, password: pw, options: { data: { name: String(f.get("name")).trim() }, emailRedirectTo: location.origin + location.pathname } });
      else if (reset) r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      else r = await sb.auth.signInWithPassword({ email, password: pw });
      btn.disabled = false;
      if (r.error) return loginForm(mode, r.error.message === "Invalid login credentials" ? "الإيميل أو كلمة السر غلط." : r.error.message);
      if (reset) return loginForm("login", "لو الإيميل مسجّل هيوصلك رابط لتغيير كلمة السر.");
      if (signup && !r.data.session) return loginForm("login", "اتعمل الحساب. افتح الإيميل وأكّد التسجيل، وبعدها ادخل.");
    });
  }
  function pendingScreen() {
    const o = overlay('<h2 style="margin:0 0 8px;font-size:19px">حسابك مستني الموافقة</h2><p style="margin:0;color:var(--ink-2,#465A6E)">اتسجّلت بنجاح. مسؤول النظام لازم يفعّل حسابك ويحدد صلاحيتك من «الفريق والصلاحيات». اطلب منه، وبعدها اضغط تحديث.</p><button id="skz-re" style="' + btnCss + '">تحديث</button><button id="skz-out" style="' + linkCss + ';margin-top:10px">تسجيل خروج</button>');
    o.querySelector("#skz-re").addEventListener("click", () => location.reload());
    o.querySelector("#skz-out").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });
  }
  async function loadProfile() {
    const { data } = await sb.from("profiles").select("id,name,email,role").eq("id", uid).maybeSingle();
    return data;
  }
  const ready = new Promise((resolve) => {
    let done = false;
    async function check(session) {
      if (done) return;
      if (!session) { if (document.body) loginForm("login"); else document.addEventListener("DOMContentLoaded", () => loginForm("login")); return; }
      uid = session.user.id;
      profile = await loadProfile();
      if (!profile || profile.role === "pending") { pendingScreen(); return; }
      done = true;
      closeGate();
      try { const r = await sb.functions.invoke("integrations", { body: { action: "status" } }); status = r.data && !r.data.error ? r.data : {}; } catch (e) { status = {}; }
      resolve();
    }
    sb.auth.onAuthStateChange((ev, session) => { if (ev === "SIGNED_IN" || ev === "INITIAL_SESSION") check(session); if (ev === "SIGNED_OUT") location.reload(); if (ev === "PASSWORD_RECOVERY") recoverForm(); });
  });
  function recoverForm() {
    const o = overlay('<form><h2 style="margin:0 0 6px;font-size:19px">كلمة سر جديدة</h2><label style="display:block;margin-top:10px;font-size:13px">كلمة السر<input name="pw" type="password" minlength="8" required style="' + fieldCss + '"></label><button type="submit" style="' + btnCss + '">احفظ</button></form>');
    o.querySelector("form").addEventListener("submit", async (e) => { e.preventDefault(); const r = await sb.auth.updateUser({ password: new FormData(e.target).get("pw") }); if (r.error) alert(r.error.message); else location.reload(); });
  }

  /* ---------- db ---------- */
  function dbError(error) {
    if (!error) return { code: "unavailable" };
    if (error.code === "42501" || /row-level security/i.test(error.message || "")) return { code: "invalid_argument", message: error.message };
    if (error.code === "P0002" || /not_found/.test(error.message || "")) return { code: "not_found", message: error.message };
    return { code: "unavailable", message: error.message };
  }
  const L = {};
  const timers = {};
  function emit(col) {
    clearTimeout(timers[col]);
    timers[col] = setTimeout(() => {
      const c = L[col]; if (!c) return;
      const docs = [...c.map.entries()].map(([id, d]) => ({ id, data: () => d }));
      c.cbs.forEach((cb) => { try { cb({ docs }); } catch (e) { console.error(e); } });
    }, 40);
  }
  async function fetchAll(col) {
    const out = []; let from = 0;
    for (;;) {
      const { data, error } = await sb.from("docs").select("id,data").eq("collection", col).range(from, from + 999);
      if (error) throw dbError(error);
      out.push(...data); if (data.length < 1000) break; from += 1000;
    }
    return out;
  }
  let chan = null, wasDown = false;
  function ensureChannel() {
    if (chan) return;
    chan = sb.channel("docs-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "docs" }, (p) => {
        const row = p.eventType === "DELETE" ? p.old : p.new;
        const c = row && L[row.collection]; if (!c) return;
        if (p.eventType === "DELETE") c.map.delete(row.id); else c.map.set(row.id, p.new.data);
        emit(row.collection);
      })
      .subscribe((st) => {
        if (st === "SUBSCRIBED" && wasDown) { wasDown = false; Object.keys(L).forEach(refresh); }
        if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") wasDown = true;
      });
  }
  async function refresh(col) {
    const c = L[col];
    try { const rows = await fetchAll(col); c.map = new Map(rows.map((r) => [r.id, r.data])); c.loaded = true; emit(col); }
    catch (e) { c.errs.forEach((f) => f(e)); }
  }
  function merge(a, b) {
    if (!a || typeof a !== "object" || Array.isArray(a) || !b || typeof b !== "object" || Array.isArray(b)) return b;
    const o = Object.assign({}, a);
    Object.keys(b).forEach((k) => { o[k] = merge(a[k], b[k]); });
    return o;
  }
  function local(col) { return L[col]; }
  const db = {
    collection(col) {
      return {
        doc(id) {
          id = id || rid();
          return {
            id,
            async set(data) {
              const { error } = await sb.from("docs").upsert({ collection: col, id, data, updated_at: new Date().toISOString() }, { onConflict: "collection,id" });
              if (error) throw dbError(error);
              const c = local(col); if (c) { c.map.set(id, data); emit(col); }
            },
            async update(patch) {
              const { error } = await sb.rpc("doc_merge", { c: col, i: id, patch });
              if (error) throw dbError(error);
              const c = local(col); if (c && c.map.has(id)) { c.map.set(id, merge(c.map.get(id), patch)); emit(col); }
            },
            async delete() {
              const { error } = await sb.from("docs").delete().eq("collection", col).eq("id", id);
              if (error) throw dbError(error);
              const c = local(col); if (c) { c.map.delete(id); emit(col); }
            },
            async get() {
              const { data, error } = await sb.from("docs").select("data").eq("collection", col).eq("id", id).maybeSingle();
              if (error) throw dbError(error);
              return { exists: !!data, data: () => (data ? data.data : undefined) };
            },
          };
        },
        onSnapshot(cb, errCb) {
          let c = L[col];
          if (!c) { c = L[col] = { map: new Map(), cbs: [], errs: [], loaded: false }; ensureChannel(); refresh(col); }
          else if (c.loaded) setTimeout(() => cb({ docs: [...c.map.entries()].map(([i, d]) => ({ id: i, data: () => d })) }), 0);
          c.cbs.push(cb); if (errCb) c.errs.push(errCb);
          return () => { c.cbs = c.cbs.filter((x) => x !== cb); };
        },
      };
    },
  };

  /* ---------- user ---------- */
  const user = {
    async me() { return { id: uid, name: (profile && profile.name) || "", avatarUrl: "" }; },
    async id() { return uid; },
    async can(name) { return name === "data.write" ? WRITERS.includes(profile.role) : null; },
    isOwner() { return profile.role === "admin"; },
    canEdit() { return profile.role === "admin" || profile.role === "manager"; },
    async profiles(ids) {
      const { data } = await sb.from("profiles").select("id,name").in("id", ids || []);
      const o = {}; (data || []).forEach((p) => { o[p.id] = { name: p.name || "", avatarUrl: "" }; }); return o;
    },
  };

  /* ---------- AI ---------- */
  async function invoke(fn, body) {
    const { data, error } = await sb.functions.invoke(fn, { body });
    if (error) {
      let e = { code: "upstream_error", message: error.message };
      try { const j = await error.context.json(); if (j && j.error) e = j.error; } catch (x) { /* keep generic */ }
      throw e;
    }
    if (data && data.error) throw data.error;
    return data;
  }
  function blobToB64(b) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(b); });
  }
  async function aiCall(input, opts, json) {
    opts = opts || {};
    const body = { tier: opts.modelTier || "default", json };
    if (typeof input === "string") body.prompt = input; else body.messages = input;
    if (opts.images) body.images = await Promise.all([...opts.images].map(async (b) => ({ mediaType: b.type || "image/jpeg", data: await blobToB64(b) })));
    return invoke("ai", body);
  }
  function tolerant(t) {
    t = String(t || "").trim();
    try { return JSON.parse(t); } catch (e) { /* next */ }
    const f = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) { try { return JSON.parse(f[1]); } catch (e) { /* next */ } }
    const i = t.search(/[[{]/), j = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch (e) { /* fallthrough */ } }
    return undefined;
  }
  const sample = async function (input, opts) {
    const r = await aiCall(input, opts, false);
    if (opts && opts.onText) opts.onText({ text: r.text, delta: r.text });
    return { text: r.text, truncated: !!r.truncated };
  };
  sample.json = async function (input, opts) {
    const r = await aiCall(input, opts, true);
    const v = tolerant(r.text);
    if (v === undefined) throw { code: "invalid_json", text: r.text };
    return v;
  };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 5e6, mediaTypes: ["image/jpeg", "image/png", "image/webp"] } });

  /* ---------- integrations (the app speaks "Clay"/"Gmail"; this maps them to Apollo/Microsoft) ---------- */
  const memo = { k: "", v: null, t: 0 };
  const mcp = {
    async callTool(server, tool, input) {
      input = input || {};
      let body;
      if (server === "Clay" && tool === "search-companies") {
        const q = String(input.dslQuery || "");
        const dom = q.match(/domain = "([^"]+)"/);
        if (dom) body = { action: "apollo.company", domain: dom[1] };
        else {
          const list = (re) => { const m = q.match(re); return m ? [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]) : []; };
          body = { action: "apollo.companies", keys: list(/is_similar_to \(([^)]*)\)/), sizes: list(/company_size in \(([^)]*)\)/), sa: true };
        }
      } else if (server === "Clay" && tool === "search-contacts") body = { action: "apollo.people", domain: (input.companyIdentifiers || [])[0] };
      else if (server === "Enrich" && tool === "contact") body = Object.assign({ action: "contact.enrich" }, input);
      else if (server === "Gmail" && tool === "create_draft") body = { action: "mail.draft", to: input.to, subject: input.subject, body: input.body };
      else throw { code: "not_in_manifest", message: server + "/" + tool };
      const memoKey = body.action === "apollo.companies" ? JSON.stringify([body.keys, body.sizes]) : "";
      if (memoKey && memo.k === memoKey && Date.now() - memo.t < 120000) return { payload: memo.v };
      try { const v = await invoke("integrations", body); if (memoKey) Object.assign(memo, { k: memoKey, v, t: Date.now() }); return { payload: v }; }
      catch (e) { if (e.code === "not_configured") throw { code: "server_not_connected", server, message: e.message }; throw e; }
    },
  };

  /* ---------- files ---------- */
  const assets = {
    async upload(file) {
      const safe = String(file.name || "file").replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = uid + "/" + Date.now() + "-" + safe;
      const { error } = await sb.storage.from("files").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (error) throw { code: /size|large/i.test(error.message) ? "too_large" : "upstream_error", message: error.message };
      return { id: path, url: "/_blob/" + encodeURIComponent(path), sizeBytes: file.size, contentType: file.type };
    },
    async delete(ref) { await sb.storage.from("files").remove([String(ref).replace(/^\/_blob\//, "")]); return { deleted: true }; },
    async list() { return { assets: [], usage: {} }; },
  };
  document.addEventListener("click", async (e) => {
    const a = e.target.closest && e.target.closest('a[href^="/_blob/"]'); if (!a) return;
    e.preventDefault();
    const path = decodeURIComponent(a.getAttribute("href").slice(7));
    const { data } = await sb.storage.from("files").createSignedUrl(path, 600);
    if (data && data.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }, true);

  const downloads = {
    async save({ filename, data }) {
      const type = /\.json$/.test(filename) ? "application/json" : /\.csv$/.test(filename) ? "text/csv" : /\.doc$/.test(filename) ? "application/msword" : "text/plain";
      const blob = data instanceof Blob ? data : new Blob([data], { type: type + ";charset=utf-8" });
      const u = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
      return { saved: true };
    },
  };

  window.claude = {
    use(name) {
      return ready.then(() => {
        if (name === "db") return db;
        if (name === "user") return user;
        if (name === "sample") return status && status.ai ? sample : null;
        if (name === "mcp") return mcp;
        if (name === "assets") return WRITERS.includes(profile.role) ? assets : null;
        if (name === "downloads") return downloads;
        return null;
      });
    },
  };

  /* ---------- platform-only screens ---------- */
  let team = null, jobs = null;
  async function loadTeam() {
    const { data } = await sb.from("profiles").select("id,name,email,role,created_at").order("created_at");
    team = data || [];
    const A = window.SKZ_APP; if (A) A.render();
  }
  async function loadJobs() {
    try { const d = await db.collection("kb").doc("jobs").get(); jobs = d.exists ? d.data() : {}; } catch (e) { jobs = {}; }
    const A = window.SKZ_APP; if (A) A.render();
  }
  function vTeam() {
    const A = window.SKZ_APP; if (team === null) { loadTeam(); return A.busyHtml("بحمّل الفريق…"); }
    const isAdmin = profile.role === "admin";
    let h = '<div class="hero"><div><h2>إضافة عضو جديد</h2><p>ابعتله رابط المنصة، يعمل «حساب جديد» بإيميل الشركة، وبعدها يظهر هنا وتحدد صلاحيته. الأول اللي اتسجّل في النظام هو المسؤول.</p></div><div class="btns"><button class="btn" data-p="copyLink">نسخ رابط المنصة</button><button class="btn btn-ghost" data-p="logout">تسجيل خروج</button></div></div>';
    h += '<div class="list"><div class="lrow head c5"><span>الاسم</span><span>الإيميل</span><span>الصلاحية</span><span>من</span><span></span></div>' + team.map((p) =>
      '<div class="lrow c5" style="cursor:default"><span class="cell"><span class="nm">' + esc(p.name || "—") + (p.id === uid ? ' <span class="chip">أنت</span>' : "") + '</span></span><span class="cell"><span class="sm">' + esc(p.email || "") + '</span></span><span class="cell">' +
      (isAdmin && p.id !== uid ? '<select class="f" data-p-role="' + esc(p.id) + '">' + Object.entries(ROLE_T).map(([k, t]) => '<option value="' + k + '"' + (p.role === k ? " selected" : "") + ">" + t + "</option>").join("") + "</select>" : A.pill(ROLE_T[p.role] || p.role, p.role === "pending" ? "w" : p.role === "admin" ? "a" : "g")) +
      '</span><span class="cell hide-sm"><span class="sm">' + esc(A.dLabel(p.created_at)) + '</span></span><span class="cell"></span></div>').join("") + "</div>";
    h += '<div class="panel"><div class="panel-b hint">الصلاحيات: <b>مسؤول النظام</b> كل حاجة + إدارة الفريق · <b>مدير</b> كل البيانات والتقارير والتعديل · <b>تطوير أعمال</b> إضافة وتعديل · <b>عرض فقط</b> يشوف من غير ما يعدّل.</div></div>';
    return h;
  }
  function row(ok, title, text, extra) {
    return '<div class="alert-row ' + (ok ? "good" : "warn") + '"><span class="ico">' + (ok ? "✓" : "!") + '</span><div><b>' + title + "</b><div class=\"hint\">" + text + "</div></div><div>" + (extra || "") + "</div></div>";
  }
  function vIntegrations() {
    const A = window.SKZ_APP; const s = status || {};
    if (jobs === null) loadJobs();
    const J = jobs || {};
    const jobRow = (k, t) => { const j = J[k]; return '<div class="fu-item ' + (j && j.ok === false ? "over" : "") + '"><span class="stripe"' + (j && j.ok ? ' style="background:var(--good)"' : "") + '></span><div><div class="t">' + t + '</div><div class="s">' + (j ? esc(j.msg || "") : "لسه مااشتغلتش") + '</div></div><span class="d">' + (j && j.at ? esc(new Date(j.at).toLocaleString("ar-SA")) : "") + "</span></div>"; };
    let h = '<section class="panel"><div class="panel-h"><h2>حالة الربط</h2><span class="meta">المفاتيح بتتحط كـ Secrets في GitHub — راجع دليل الإعداد</span></div>';
    const AIN = { anthropic: "Claude", openai: "ChatGPT", gemini: "Gemini" };
    const chain = (s.aiChain || []).map((k) => AIN[k] || k);
    h += row(s.ai, "الذكاء الاصطناعي" + (chain.length ? " — " + esc(chain.join(" ← ")) : ""), s.ai ? "شغّال. لو الأول وقف أو رصيده خلص، المنصة بتنقل للي بعده تلقائي." : "مش متوصّل. الترتيب: Claude ← ChatGPT ← Gemini. حط أي مفتاح منهم (ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY) — Gemini له خطة مجانية.", s.ai ? '<button class="btn btn-sm" data-p="testAI">جرّب</button>' : "");
    const EN = { lusha: "Lusha", apollo: "Apollo", hunter: "Hunter" };
    const en = (s.enrich || []).map((k) => EN[k] || k);
    h += row(en.length, "كشف الإيميلات والموبايلات" + (en.length ? " — " + esc(en.join(" ← ")) : ""), en.length ? "زرار «اكشف الإيميل/الموبايل» ظاهر جنب كل جهة اتصال ناقصة. بيجرّب المصادر بالترتيب لحد ما يلاقي." : "حط LUSHA_API_KEY و/أو HUNTER_API_KEY (Hunter عنده خطة مجانية) — Apollo بيتستخدم كمان لو مفتاحه موجود.", "");
    h += row(s.apollo, "Apollo — شركات وصناع قرار", s.apollo ? "متوصّل. «توليد الليدز» بيستخدمه." : "حط APOLLO_API_KEY (من Apollo ← Settings ← Integrations ← API). لو الخطة المجانية مش بتسمح بالـ API، استخدم «استيراد» بملف CSV.", s.apollo ? '<button class="btn btn-sm" data-p="testApollo">جرّب</button>' : "");
    h += row(s.microsoft, "Microsoft 365 — إيميل الشركة", s.microsoft ? "متوصّل. المسودات والتقارير بتتبعت من " + esc(s.sender || "") + "." : "سجّل تطبيق في Microsoft Entra واملأ MS_TENANT_ID و MS_CLIENT_ID و MS_CLIENT_SECRET و MS_SENDER.", s.microsoft ? '<button class="btn btn-sm" data-p="testMail">ابعتلي إيميل تجريبي</button>' : "");
    h += row(s.ingest, "استقبال من Manus أو أي أداة", s.ingest ? "شغّال على الرابط:<br><code style=\"user-select:all\">" + esc(CFG.supabaseUrl) + "/functions/v1/ingest</code> مع الهيدر <code>x-ingest-key</code>." : "حط INGEST_KEY (أي كلمة سر طويلة) عشان Manus يقدر يبعت ليدز مباشرة.", "");
    h += "</section>";
    h += '<section class="panel"><div class="panel-h"><h2>المهام اليومية الأوتوماتيك</h2><span class="meta">بتشتغل كل يوم 6:30 الصبح من GitHub</span><button class="btn btn-ghost btn-sm" data-p="reloadJobs">تحديث</button></div><div class="fu">' + jobRow("etimad", "رصد منافسات اعتماد") + jobRow("news", "رصد الأخبار والإشارات") + jobRow("inbox", "قراءة صندوق Leads في الإيميل") + jobRow("digest", "إيميل الخطة اليومية وتقرير المدير") + "</div></section>";
    return h;
  }
  window.SKZ_PLATFORM = {
    views: [
      { k: "team", t: "الفريق والصلاحيات", ic: "users", g: "الإعدادات", sub: "مين يدخل وبأي صلاحية", render: vTeam },
      { k: "integrations", t: "الربط والإعدادات", ic: "refresh", sub: "حالة الذكاء الاصطناعي وApollo وإيميل الشركة والمهام اليومية", render: vIntegrations },
    ],
  };
  document.addEventListener("click", async (e) => {
    const t = e.target.closest && e.target.closest("[data-p]"); if (!t) return;
    const A = window.SKZ_APP, k = t.dataset.p;
    if (k === "logout") { await sb.auth.signOut(); location.reload(); }
    else if (k === "copyLink") { try { await navigator.clipboard.writeText(location.origin + location.pathname); A.toast("اتنسخ الرابط"); } catch (x) { A.toast(location.origin); } }
    else if (k === "reloadJobs") { jobs = null; A.render(); }
    else if (k === "testAI") { t.disabled = true; try { const r = await aiCall("قل «تمام» بس.", { modelTier: "quick" }, false); A.toast("رد من " + (r.provider || "") + (r.tried && r.tried.length ? " (بعد ما " + r.tried.map((x) => x.provider).join(" و") + " وقف)" : "") + ": " + String(r.text).slice(0, 30)); } catch (x) { A.toast("خطأ: " + (x.message || x.code)); } t.disabled = false; }
    else if (k === "testApollo") { t.disabled = true; try { const r = await invoke("integrations", { action: "apollo.company", domain: "stc.com.sa" }); A.toast(Object.keys(r.companies || {}).length ? "Apollo شغّال ✓" : "Apollo رد بس من غير نتايج"); } catch (x) { A.toast("Apollo: " + (x.message || x.code)); } t.disabled = false; }
    else if (k === "testMail") { t.disabled = true; try { await invoke("integrations", { action: "mail.send", to: [profile.email], subject: "تجربة من منصة Synkroniza", body: "لو وصلك الإيميل ده يبقى الربط مع Microsoft 365 شغّال." }); A.toast("اتبعت — شوف إيميلك"); } catch (x) { A.toast("Microsoft: " + (x.message || x.code)); } t.disabled = false; }
  });
  document.addEventListener("change", async (e) => {
    const el = e.target; if (!el.dataset || !el.dataset.pRole) return;
    const { error } = await sb.from("profiles").update({ role: el.value }).eq("id", el.dataset.pRole);
    const A = window.SKZ_APP; if (error) A.toast("ماتحفظش: " + error.message); else { A.toast("اتغيرت الصلاحية"); loadTeam(); }
  });
})();
