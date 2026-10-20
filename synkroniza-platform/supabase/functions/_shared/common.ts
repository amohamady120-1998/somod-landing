// Shared helpers for the edge functions: CORS, JSON replies, and caller checks.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

export function fail(code: string, message: string, status = 400): Response {
  return reply({ error: { code, message } }, status);
}

export const env = (k: string) => Deno.env.get(k) ?? "";

export function admin() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

// Allows the scheduled jobs (service key) or a signed-in, approved team member.
export async function caller(req: Request): Promise<{ kind: "service" | "user"; id?: string; role?: string; email?: string } | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  if (token === env("SUPABASE_SERVICE_ROLE_KEY")) return { kind: "service" };
  const sb = admin();
  const { data } = await sb.auth.getUser(token);
  if (!data?.user) return null;
  const { data: p } = await sb.from("profiles").select("role,email").eq("id", data.user.id).single();
  if (!p || !["viewer", "bd", "manager", "admin"].includes(p.role)) return null;
  return { kind: "user", id: data.user.id, role: p.role, email: p.email ?? data.user.email };
}
