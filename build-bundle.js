/* Monta o "bundle" (pacote de atualizacao) a partir dos arquivos do launcher.
   Usado pelo painel do site (no navegador) e pelo Node (aqui). */
(function (root) {
  function buildBundle(f) {                     // f = { html, css, js, appinfo }
    var info = typeof f.appinfo === "string" ? JSON.parse(f.appinfo) : f.appinfo;
    var m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(f.html);
    if (!m) throw new Error("index.html sem <body>");
    var body = m[1].replace(/<script[\s\S]*?<\/script>/gi, "").replace(/^\s+|\s+$/g, "");
    if (!info.version || !/^\d+\.\d+\.\d+$/.test(info.version)) throw new Error("appinfo.json sem versao x.y.z");
    if (body.indexOf('id="grid"') < 0) throw new Error("index.html nao parece o do Horizon");
    if (f.js.length < 20000) throw new Error("app.js pequeno demais");
    if (f.js.indexOf("HZOTA") < 0) throw new Error("app.js sem suporte a atualizacao (versao antiga)");
    return { version: info.version, build: new Date().toISOString(), notes: f.notes || "", body: body, css: f.css, js: f.js };
  }
  if (typeof module !== "undefined") module.exports = { buildBundle: buildBundle }; else root.buildBundle = buildBundle;
})(this);
