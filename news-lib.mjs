// Leitor de RSS/Atom sem dependencias (roda no Node 20 do GitHub).
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’" };

export function decode(s) {
  return String(s || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return ""; } }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const unCdata = (s) => String(s || "").replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
export function plain(html) {
  return decode(decode(unCdata(html)).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}
function tag(block, name) {
  const re = new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i");
  const m = re.exec(block);
  return m ? unCdata(m[1]).trim() : "";
}
function attr(block, tagName, attrName, filter) {
  const re = new RegExp("<" + tagName + "\\b([^>]*)>", "gi");
  let m;
  while ((m = re.exec(block))) {
    if (filter && !filter.test(m[1])) continue;
    const a = new RegExp(attrName + "\\s*=\\s*[\"']([^\"']+)[\"']", "i").exec(m[1]);
    if (a) return decode(a[1]);
  }
  return "";
}
const okImg = (u) => /^https?:\/\//i.test(u) && !/(pixel|tracking|1x1|spacer|blank|\.gif(\?|$)|\.svg(\?|$)|avatar|logo)/i.test(u);

export function parseFeed(xml) {
  const out = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const b of blocks) {
    let title = plain(tag(b, "title"));
    let link = decode(tag(b, "link")) || attr(b, "link", "href", /rel\s*=\s*["']alternate["']/i) || attr(b, "link", "href");
    link = link.trim();
    const rawDesc = tag(b, "content:encoded") || tag(b, "description") || tag(b, "summary") || tag(b, "content");
    const desc = decode(unCdata(rawDesc));
    const date = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date");
    let ts = Date.parse(date);
    if (!Number.isFinite(ts)) ts = 0;
    let img = attr(b, "media:content", "url", /medium\s*=\s*["']image["']|type\s*=\s*["']image/i)
      || attr(b, "media:thumbnail", "url")
      || attr(b, "enclosure", "url", /type\s*=\s*["']image/i)
      || attr(b, "media:content", "url", /\.(jpe?g|png|webp)/i);
    if (!okImg(img)) {
      img = "";
      const re = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi; let m;
      while ((m = re.exec(desc))) { if (okImg(decode(m[1]))) { img = decode(m[1]); break; } }
    }
    const src = plain(tag(b, "source"));
    let summary = plain(desc).replace(/\s*(Leia mais|Continue lendo|O post .* apareceu primeiro.*|The post .* appeared first.*)$/i, "").trim();
    if (summary.toLowerCase() === title.toLowerCase() || summary.length < 25) summary = "";
    if (summary.length > 300) summary = summary.slice(0, 297).replace(/\s+\S*$/, "") + "…";
    if (title && link) out.push({ t: title, s: summary, url: link, img: okImg(img) ? img : "", ts, src });
  }
  return out;
}

export function mix(items, order) {
  const by = new Map();
  for (const c of order) by.set(c, []);
  for (const n of items) { if (!by.has(n.cat)) by.set(n.cat, []); by.get(n.cat).push(n); }
  for (const l of by.values()) l.sort((a, b) => b.ts - a.ts);
  const out = []; let more = true;
  for (let i = 0; more; i++) { more = false; for (const l of by.values()) if (l[i]) { out.push(l[i]); more = true; } }
  return out;
}
