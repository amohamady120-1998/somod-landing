// Builds web/index.html from web/app.html (the same app that runs inside Claude) and,
// when SUPABASE_URL / SUPABASE_ANON_KEY are set (e.g. on Cloudflare Pages), writes web/config.js.
// Usage: node tools/build-web.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "web/app.html"), "utf8");
const marker = "<script>\n(function(){";
if (!app.includes(marker)) throw new Error("app.html: app script marker not found");
const inject =
  '<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#0B2338">\n' +
  '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>\n' +
  '<script src="config.js"></script>\n<script src="platform.js"></script>\n';
const html = app.replace("<html>", '<html lang="ar" dir="rtl">').replace(marker, inject + marker);
writeFileSync(join(root, "web/index.html"), html);

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
if (url && key) {
  writeFileSync(join(root, "web/config.js"), "window.SKZ_CONFIG=" + JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key }) + ";\n");
  console.log("config.js written for", url);
}
console.log("web/index.html built (" + html.length + " bytes)");
