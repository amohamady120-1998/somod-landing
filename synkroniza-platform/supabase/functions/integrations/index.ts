// Integrations gateway: Apollo (companies & decision makers) and Microsoft 365 (email drafts / send).
// Every integration is optional — when its secrets are missing the call answers {error:{code:"not_configured"}}.
//   APOLLO_API_KEY
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_SENDER (shared mailbox or a team member), MS_DOMAIN (e.g. synkroniza.com)
import { cors, reply, fail, env, caller } from "../_shared/common.ts";

const APOLLO = "https://api.apollo.io/api/v1";
const SIZE_RANGES: Record<string, string> = {
  "11-50": "11,50", "51-200": "51,200", "201-500": "201,500", "501-1,000": "501,1000",
  "1,001-5,000": "1001,5000", "5,001-10,000": "5001,10000", "10,001+": "10001,1000000",
};
const DECISION_TITLES = ["Chief Information Officer", "CIO", "CTO", "CISO", "IT Director", "Head of IT", "Digital Transformation", "Head of Procurement", "Procurement Manager", "Vendor Management"];

function bucket(n?: number): string {
  if (!n) return "";
  if (n <= 50) return "11-50"; if (n <= 200) return "51-200"; if (n <= 500) return "201-500";
  if (n <= 1000) return "501-1,000"; if (n <= 5000) return "1,001-5,000"; if (n <= 10000) return "5,001-10,000";
  return "10,001+";
}

// Same shape the app already reads from Clay, so the screens work unchanged.
function toCompany(o: Record<string, unknown>) {
  const dom = String(o.primary_domain ?? o.domain ?? "").toLowerCase() ||
    String(o.website_url ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return {
    name: o.name ?? "", domain: dom, country: o.country ?? "", industry: o.industry ?? "",
    size: bucket(Number(o.estimated_num_employees) || 0), type: "", locality: [o.city, o.state].filter(Boolean).join(", "),
    url: o.linkedin_url ?? "", website: o.website_url ?? (dom ? "https://" + dom : ""),
    employee_count: o.estimated_num_employees ?? null, annual_revenue: o.annual_revenue_printed ?? "",
    description: o.short_description ?? (Array.isArray(o.keywords) ? (o.keywords as string[]).slice(0, 25).join(", ") : ""),
  };
}

async function apollo(path: string, body: unknown, method = "POST") {
  const key = env("APOLLO_API_KEY");
  if (!key) throw { code: "not_configured", message: "Apollo is not connected (APOLLO_API_KEY)." };
  const r = await fetch(APOLLO + path, {
    method,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": key },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw { code: r.status === 429 ? "rate_limited" : r.status === 401 || r.status === 403 ? "needs_reauth" : "tool_error", message: j?.error ?? j?.message ?? "Apollo " + r.status };
  return j;
}

let msToken = { value: "", exp: 0 };
async function graphToken() {
  if (!env("MS_TENANT_ID") || !env("MS_CLIENT_ID") || !env("MS_CLIENT_SECRET")) throw { code: "not_configured", message: "Microsoft 365 is not connected." };
  if (msToken.value && Date.now() < msToken.exp - 60000) return msToken.value;
  const r = await fetch(`https://login.microsoftonline.com/${env("MS_TENANT_ID")}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: env("MS_CLIENT_ID"), client_secret: env("MS_CLIENT_SECRET"), scope: "https://graph.microsoft.com/.default" }),
  });
  const j = await r.json();
  if (!r.ok) throw { code: "needs_reauth", message: j.error_description ?? "Microsoft sign-in failed" };
  msToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return msToken.value;
}
function senderFor(email?: string) {
  const dom = env("MS_DOMAIN").toLowerCase();
  if (email && dom && email.toLowerCase().endsWith("@" + dom)) return email;
  return env("MS_SENDER");
}
function mailBody(input: { to?: string[]; subject?: string; body?: string; html?: string }) {
  return {
    subject: input.subject ?? "",
    body: input.html ? { contentType: "HTML", content: input.html } : { contentType: "Text", content: input.body ?? "" },
    toRecipients: (input.to ?? []).filter(Boolean).map((a) => ({ emailAddress: { address: a } })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const who = await caller(req);
  if (!who) return fail("not_granted", "Sign in with an approved account.", 401);
  let b: Record<string, any>;
  try { b = await req.json(); } catch { return fail("invalid_request", "Body must be JSON."); }
  try {
    switch (b.action) {
      case "status":
        return reply({
          ai: !!(env("ANTHROPIC_API_KEY") || env("GEMINI_API_KEY") || env("OPENAI_API_KEY")),
          aiProvider: env("AI_PROVIDER") || (env("ANTHROPIC_API_KEY") ? "anthropic" : env("GEMINI_API_KEY") ? "gemini" : env("OPENAI_API_KEY") ? "openai" : ""),
          apollo: !!env("APOLLO_API_KEY"),
          microsoft: !!(env("MS_TENANT_ID") && env("MS_CLIENT_ID") && env("MS_CLIENT_SECRET")),
          sender: env("MS_SENDER"),
          ingest: !!env("INGEST_KEY"),
        });
      case "apollo.companies": {
        const ranges = (b.sizes ?? []).map((s: string) => SIZE_RANGES[s]).filter(Boolean);
        const j = await apollo("/mixed_companies/search", {
          q_organization_keyword_tags: (b.keys ?? []).slice(0, 8),
          organization_locations: b.sa === false ? ["Saudi Arabia", "United Arab Emirates", "Qatar", "Kuwait", "Bahrain", "Oman"] : ["Saudi Arabia"],
          organization_num_employees_ranges: ranges,
          page: 1, per_page: 50,
        });
        const orgs = [...(j.organizations ?? []), ...(j.accounts ?? [])];
        const companies: Record<string, unknown> = {};
        orgs.forEach((o: Record<string, unknown>, i: number) => { companies[String(o.id ?? i)] = toCompany(o); });
        return reply({ companies });
      }
      case "apollo.company": {
        const j = await apollo("/organizations/enrich?domain=" + encodeURIComponent(String(b.domain ?? "")), null, "GET");
        return reply({ companies: j.organization ? { [String(j.organization.id ?? "0")]: toCompany(j.organization) } : {} });
      }
      case "apollo.people": {
        const q = { q_organization_domains_list: [String(b.domain ?? "")], person_titles: DECISION_TITLES, per_page: 10 };
        let j: Record<string, any>;
        try { j = await apollo("/mixed_people/api_search", q); } catch { j = await apollo("/mixed_people/search", q); }
        const contacts = (j.people ?? j.contacts ?? []).map((p: Record<string, any>) => ({
          name: p.name ?? [p.first_name, p.last_name_obfuscated ?? p.last_name].filter(Boolean).join(" "),
          latest_experience_title: p.title ?? "", url: p.linkedin_url ?? "",
          location_name: [p.city, p.country].filter(Boolean).join(", "), email: p.email ?? "",
        }));
        return reply({ contacts });
      }
      case "mail.draft": {
        const from = senderFor(who.email);
        if (!from) return fail("not_configured", "Set MS_SENDER.");
        const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/messages`, {
          method: "POST", headers: { Authorization: "Bearer " + await graphToken(), "Content-Type": "application/json" }, body: JSON.stringify(mailBody(b)),
        });
        const j = await r.json();
        if (!r.ok) return fail("tool_error", j?.error?.message ?? "Graph " + r.status, 502);
        return reply({ id: j.id, viewUrl: j.webLink, from });
      }
      case "mail.send": {
        const from = senderFor(who.email);
        if (!from) return fail("not_configured", "Set MS_SENDER.");
        const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
          method: "POST", headers: { Authorization: "Bearer " + await graphToken(), "Content-Type": "application/json" },
          body: JSON.stringify({ message: mailBody(b), saveToSentItems: true }),
        });
        if (!r.ok) { const j = await r.json().catch(() => ({})); return fail("tool_error", j?.error?.message ?? "Graph " + r.status, 502); }
        return reply({ sent: true, from });
      }
      default:
        return fail("invalid_request", "Unknown action.");
    }
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return fail(err.code ?? "upstream_error", err.message ?? "Integration failed", err.code === "not_configured" ? 503 : 502);
  }
});
