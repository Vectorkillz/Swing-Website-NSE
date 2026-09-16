// Builds a single self-contained demo.html: the real site bundle plus an embedded snapshot of the
// committed data for the latest runs, served through a fetch() shim. Used for sharing a preview
// without a server. Output: web/dist-demo/demo.html (not committed).
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, "..");
const root = resolve(web, "..");
const data = resolve(root, "data");
const out = resolve(web, "dist-demo");

await build({
  root: web,
  configFile: false,
  plugins: [react()],
  base: "./",
  logLevel: "warn",
  build: { outDir: out, emptyOutDir: true, sourcemap: false, cssCodeSplit: false, rollupOptions: { output: { inlineDynamicImports: true, manualChunks: undefined, entryFileNames: "app.js", assetFileNames: "app.[ext]" } } },
});

const js = readFileSync(resolve(out, "app.js"), "utf8");
const css = readFileSync(resolve(out, "app.css"), "utf8");

const files = {};
const add = (rel) => { const p = resolve(data, rel); if (existsSync(p)) files[rel.replace(/\\/g, "/")] = readFileSync(p, "utf8"); };

add("runs/latest.json"); add("runs/index.json");
const latest = JSON.parse(files["runs/latest.json"]).run_id;
const index = JSON.parse(files["runs/index.json"]).runs;
const symbols = new Set();
for (const r of index) {
  add(`runs/${r.run_id}/run.json`); add(`runs/${r.run_id}/candidates.json`);
  const c = files[`runs/${r.run_id}/candidates.json`];
  if (c) for (const x of JSON.parse(c).candidates) symbols.add(x.symbol);
}
add(`runs/${latest}/universe.json`);
for (const s of symbols) add(`charts/${s}.json`);
// Price history: setup symbols plus every F&O name (so Optionable drawers work), trimmed to the last
// 320 sessions to stay well under the 16 MB page limit.
const fnoSymbols = JSON.parse(files[`runs/${latest}/universe.json`]).rows.filter((r) => r.fno_eligible).map((r) => r.symbol);
for (const s of new Set([...symbols, ...fnoSymbols])) {
  const p = resolve(data, `ohlcv/daily/${s}.csv`);
  if (!existsSync(p)) continue;
  const lines = readFileSync(p, "utf8").split("\n").filter((l) => l.trim());
  files[`ohlcv/daily/${s}.csv`] = [lines[0], ...lines.slice(1).slice(-320)].join("\n") + "\n";
}
for (const f of ["config/active.json", "config/schema.json", "config/profiles/index.json", "universe/status.json", "universe/equity_status.json", "universe/index_membership.json", "jobs/index.json"]) add(f);
for (const f of readdirSync(resolve(data, "config/profiles"))) add(`config/profiles/${f}`);

const payload = JSON.stringify(files).replace(/</g, "\\u003c");
const safeJs = js.replace(/<\/script/gi, "<\\/script");
const html = `<title>NSE Swing Scanner Demo</title>
<style>${css}
#demo-banner{position:fixed;left:0;right:0;bottom:0;z-index:60;background:#17171D;color:#8E93A3;font:12px Inter,system-ui,sans-serif;text-align:center;padding:4px 8px;border-top:1px solid rgba(255,255,255,.06)}
@media (max-width:767px){#demo-banner{display:none}}
body{background:#0F0F12}
</style>
<div id="root"></div>
<div id="demo-banner">Demo snapshot · embedded data from runs ${index.map((r) => r.session_date).join(", ")} · Refresh re-reads the embedded snapshot · charts and price history only for setup symbols</div>
<script>
(function(){
  var FILES=${payload};
  var real=window.fetch.bind(window);
  window.fetch=function(input,init){
    var url=typeof input==="string"?input:(input&&input.url)||"";
    var i=url.indexOf("data/");
    if(i>=0){
      var key=url.slice(i+5).split("?")[0];
      if(Object.prototype.hasOwnProperty.call(FILES,key)){
        var type=key.endsWith(".json")?"application/json":"text/csv";
        return new Promise(function(res){setTimeout(function(){res(new Response(FILES[key],{status:200,headers:{"Content-Type":type}}));},120);});
      }
      return Promise.resolve(new Response("not in demo snapshot",{status:404}));
    }
    return real(input,init);
  };
})();
</script>
<script type="module">${safeJs}</script>
`;
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, "demo.html"), html);
console.log(`demo.html ${(html.length / 1048576).toFixed(1)} MB · ${Object.keys(files).length} data files · ${symbols.size} symbols`);
