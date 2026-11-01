// Busca as noticias dos feeds de feeds.json e grava news.json (o site publica esse arquivo).
// Uso: node scripts/fetch-news.mjs _site/news.json
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseFeed, mix, decode } from "./news-lib.mjs";

const outFile = process.argv[2] || "news.json";
const cfg = JSON.parse(await readFile(new URL("../feeds.json", import.meta.url), "utf8"));
const UA = "Mozilla/5.0 (compatible; HorizonTV-News/1.0)";

async function get(url, ms = 15000, maxBytes = 3_000_000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*" }, signal: ac.signal, redirect: "follow" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const buf = new Uint8Array(await r.arrayBuffer()).subarray(0, maxBytes);
    const ct = r.headers.get("content-type") || "";
    const head = new TextDecoder("utf-8").decode(buf.subarray(0, 300));
    const enc = (/charset=([\w-]+)/i.exec(ct) || /encoding=["']([\w-]+)/i.exec(head) || [])[1] || "utf-8";
    try { return new TextDecoder(enc).decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
  } finally { clearTimeout(t); }
}

const cats = [...new Set(cfg.feeds.map((f) => f.cat))];
const results = await Promise.all(cfg.feeds.map(async (f) => {
  try {
    const items = parseFeed(await get(f.url)).map((n) => {
      let t = n.t, src = f.src || n.src || "";
      if (f.gnews) { const m = / - ([^-]{2,40})$/.exec(t); if (m) { t = t.slice(0, m.index); src = n.src || m[1]; } }
      return { ...n, t, s: f.gnews ? "" : n.s, src, cat: f.cat, backup: !!f.backup };
    });
    console.log("ok  ", f.cat.padEnd(15), (f.src || "Google News").padEnd(14), items.length);
    return { f, items };
  } catch (e) {
    console.log("ERRO", f.cat.padEnd(15), (f.src || "Google News").padEnd(14), f.url, String(e.message || e));
    return { f, items: [] };
  }
}));

// 1) fontes principais
const now = Date.now(), MAXAGE = 4 * 24 * 3600 * 1000;
let all = [];
for (const { f, items } of results) {
  if (f.backup) continue;
  const fresh = items.filter((n) => !n.ts || now - n.ts < MAXAGE);
  all.push(...fresh.sort((a, b) => b.ts - a.ts).slice(0, f.max || 8));
}
// 2) reservas (Google News) so onde a categoria ficou com poucas materias
for (const c of cats) {
  const have = all.filter((n) => n.cat === c).length;
  if (have >= 5) continue;
  for (const { f, items } of results) if (f.backup && f.cat === c) all.push(...items.sort((a, b) => b.ts - a.ts).slice(0, Math.max(0, 8 - have)));
}
for (const n of all) if (!n.ts) n.ts = now;
// 3) sem repetidas
const seen = new Set();
all = all.filter((n) => { const k = n.t.toLowerCase().replace(/[^a-z0-9à-ú]+/g, " ").slice(0, 70); if (seen.has(k)) return false; seen.add(k); return true; });

// 4) foto: quem veio sem imagem tenta a imagem de capa (og:image) da propria materia
async function og(n) {
  try {
    const html = await get(n.url, 7000, 250_000);
    const m = /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i.exec(html)
      || /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i.exec(html);
    if (m && /^https?:/i.test(decode(m[1]))) n.img = decode(m[1]);
    if (!n.s) { const d = /<meta[^>]+(?:property|name)=["'](?:og:)?description["'][^>]*content=["']([^"']+)["']/i.exec(html); if (d) n.s = decode(d[1]).slice(0, 300); }
  } catch { /* sem foto: a TV usa o degradê da categoria */ }
}
const need = all.filter((n) => !n.img && !/news\.google\.com/.test(n.url)).slice(0, 40);
for (let i = 0; i < need.length; i += 8) await Promise.all(need.slice(i, i + 8).map(og));

// 5) monta e grava
const total = cfg.total || 48;
const items = mix(all, cats).slice(0, total).map((n) => ({ t: n.t, s: n.s || "", src: n.src || "", cat: n.cat, img: n.img || "", url: n.url, ts: n.ts }));
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify({ updated: Date.now(), items }));
console.log(`news.json: ${items.length} materias, ${items.filter((n) => n.img).length} com foto -> ${outFile}`);
