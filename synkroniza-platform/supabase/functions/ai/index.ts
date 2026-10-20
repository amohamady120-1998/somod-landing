// AI gateway with automatic fallback. Providers are tried in order until one answers:
//   AI_ORDER = anthropic,openai,gemini   (default — Claude first, then ChatGPT, then Gemini)
// A provider is skipped when its key is missing, and the next one is tried when it fails
// (credit exhausted, rate limit, outage, refusal). Keys and optional model overrides:
//   ANTHROPIC_API_KEY (+ CLAUDE_MODEL)   OPENAI_API_KEY (+ OPENAI_MODEL, OPENAI_BASE_URL)   GEMINI_API_KEY (+ GEMINI_MODEL)
// Request: { prompt | messages, tier: quick|default|complex, json?: boolean, images?: [{mediaType, data(base64)}] }
// Reply:   { text, provider, model, tried }  or  { error: {code, message, tried} }
import Anthropic from "npm:@anthropic-ai/sdk@0.135.0";
import { cors, reply, fail, env, caller } from "../_shared/common.ts";

type Msg = { role: "user" | "assistant"; content: string };
type Img = { mediaType: string; data: string };

const EFFORT: Record<string, string> = { quick: "low", default: "medium", complex: "high" };

const KEYS: Record<string, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" };
export function providerChain(): string[] {
  const order = (env("AI_ORDER") || env("AI_PROVIDER") || "anthropic,openai,gemini").split(",").map((x) => x.trim().toLowerCase()).filter((x) => KEYS[x]);
  for (const p of ["anthropic", "openai", "gemini"]) if (!order.includes(p)) order.push(p);
  return order.filter((p) => env(KEYS[p]));
}

const JSON_NOTE = "\n\nReply with the JSON value only — no prose, no code fences.";

async function viaAnthropic(msgs: Msg[], tier: string, images: Img[], json: boolean) {
  const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  const model = env("CLAUDE_MODEL") || "claude-opus-5-5";
  const content: unknown[] = msgs.map((m, i) => {
    const last = i === msgs.length - 1;
    if (!last || !images.length) return { role: m.role, content: last && json ? m.content + JSON_NOTE : m.content };
    return {
      role: "user",
      content: [
        ...images.map((im) => ({ type: "image" as const, source: { type: "base64" as const, media_type: im.mediaType, data: im.data } })),
        { type: "text" as const, text: json ? m.content + JSON_NOTE : m.content },
      ],
    };
  });
  const params: Record<string, unknown> = {
    model,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: EFFORT[tier] ?? "medium" },
    messages: content,
  };
  const msg = await client.beta.messages.stream(params as never).finalMessage();
  if (msg.stop_reason === "refusal") throw { code: "refused", message: "The model declined this request." };
  const text = msg.content.map((b: { type: string; text?: string }) => (b.type === "text" ? b.text ?? "" : "")).join("");
  return { text, model: msg.model, truncated: msg.stop_reason === "max_tokens" };
}

async function viaGemini(msgs: Msg[], _tier: string, images: Img[], json: boolean) {
  const model = env("GEMINI_MODEL") || "gemini-2.5-flash";
  const contents = msgs.map((m, i) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [
      ...(i === msgs.length - 1 ? images.map((im) => ({ inline_data: { mime_type: im.mediaType, data: im.data } })) : []),
      { text: m.content },
    ],
  }));
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env("GEMINI_API_KEY") },
    body: JSON.stringify({ contents, generationConfig: json ? { responseMimeType: "application/json" } : {} }),
  });
  const j = await r.json();
  if (!r.ok) throw { code: r.status === 429 ? "rate_limited" : "upstream_error", message: j?.error?.message ?? String(r.status) };
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  return { text, model, truncated: j.candidates?.[0]?.finishReason === "MAX_TOKENS" };
}

async function viaOpenAICompatible(msgs: Msg[], _tier: string, images: Img[], json: boolean) {
  const base = env("OPENAI_BASE_URL") || "https://api.openai.com/v1";
  const model = env("OPENAI_MODEL") || "gpt-4o-mini";
  const messages = msgs.map((m, i) =>
    i === msgs.length - 1 && images.length
      ? { role: m.role, content: [...images.map((im) => ({ type: "image_url", image_url: { url: `data:${im.mediaType};base64,${im.data}` } })), { type: "text", text: m.content }] }
      : { role: m.role, content: m.content });
  const r = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + env("OPENAI_API_KEY") },
    body: JSON.stringify({ model, messages, ...(json ? { response_format: { type: "json_object" } } : {}) }),
  });
  const j = await r.json();
  if (!r.ok) throw { code: r.status === 429 ? "rate_limited" : "upstream_error", message: j?.error?.message ?? String(r.status) };
  return { text: j.choices?.[0]?.message?.content ?? "", model, truncated: j.choices?.[0]?.finish_reason === "length" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const who = await caller(req);
  if (!who) return fail("not_granted", "Sign in with an approved account.", 401);
  const chain = providerChain();
  if (!chain.length) return fail("not_granted", "No AI provider is configured yet (add ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY).", 503);
  let body: { prompt?: string; messages?: Msg[]; tier?: string; json?: boolean; images?: Img[] };
  try { body = await req.json(); } catch { return fail("invalid_request", "Body must be JSON."); }
  const msgs: Msg[] = body.messages?.length ? body.messages : [{ role: "user", content: String(body.prompt ?? "") }];
  if (!msgs[msgs.length - 1]?.content) return fail("invalid_request", "Empty prompt.");
  const tier = body.tier ?? "default";
  const images = (body.images ?? []).slice(0, 8);
  const tried: { provider: string; error: string }[] = [];
  let lastCode = "upstream_error";
  for (const provider of chain) {
    try {
      const run = provider === "anthropic" ? viaAnthropic : provider === "openai" ? viaOpenAICompatible : viaGemini;
      const out = await run(msgs, tier, images, !!body.json);
      if (!String(out.text || "").trim()) throw { code: "empty", message: "empty reply" };
      return reply({ ...out, provider, tried });
    } catch (e) {
      const err = e as { code?: string; message?: string; status?: number };
      lastCode = err.code ?? (err.status === 429 ? "rate_limited" : "upstream_error");
      tried.push({ provider, error: String(err.message ?? lastCode).slice(0, 200) });
      console.warn(`AI provider ${provider} failed, trying next:`, err.message);
    }
  }
  return reply({ error: { code: lastCode, message: "All AI providers failed: " + tried.map((t) => t.provider + " (" + t.error + ")").join("; "), tried } }, 502);
});
