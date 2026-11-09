// Find likely hardcoded UI strings (outside known dictionaries) in app assets.
import fs from 'node:fs';
import path from 'node:path';
import { webDir } from './appdir.mjs';

const APP = webDir(process.argv[2]);
const ASSETS = path.join(APP, 'assets');
const SKIP = /^(vendor-|chunk-|mermaid|cytoscape|c4Diagram|dagre|graphlib|rough|esm-|react-|rolldown|preload-helper|seti-)/;
// ranges of known dictionaries to ignore: file -> [[start,end),...]
const known = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'work', 'known-ranges.json'), 'utf8'));

const STR = /"((?:[^"\\]|\\.){4,200})"/g;
const results = [];
for (const f of fs.readdirSync(ASSETS).filter((x) => x.endsWith('.js') && !SKIP.test(x))) {
  const src = fs.readFileSync(path.join(ASSETS, f), 'utf8');
  const ranges = known[f] || [];
  const hits = new Map();
  let m;
  while ((m = STR.exec(src))) {
    const raw = m[1];
    const off = m.index;
    if (ranges.some(([s, e]) => off >= s && off < e)) continue;
    if (!/[A-Za-z]/.test(raw)) continue;
    if (!/\s/.test(raw)) continue;                        // require a space -> phrase
    if (/^[\w.-]+\.(js|css|json|ts|md|png|svg|webp|woff2?)$/.test(raw)) continue;
    if (/^https?:|^data:|^ws/.test(raw)) continue;
    if (/^[a-z-]+(__|--)[a-z-]+/.test(raw)) continue;     // BEM class list
    if (/^[a-z0-9:;#.,%()\s-]+$/.test(raw)) continue;      // css-ish
    if (/\bpx\b|\brgba?\(|var\(--/.test(raw)) continue;
    if (!/^[A-Z“(«"'А-ЯA-Z0-9$]/.test(raw)) continue;
    try { hits.set(raw, (hits.get(raw) || 0) + 1); } catch { /* */ }
  }
  if (hits.size) results.push({ file: f, count: hits.size, samples: [...hits.keys()] });
}
results.sort((a, b) => b.count - a.count);
let total = 0;
for (const r of results) {
  console.log(`\n### ${r.file}  (${r.count})`);
  for (const s of r.samples.slice(0, 40)) console.log('    ' + s);
  total += r.count;
}
console.log('\nfiles:', results.length, 'unique candidates:', total);
fs.writeFileSync(path.join(import.meta.dirname, '..', 'work', 'hardcoded-candidates.json'), JSON.stringify(results, null, 1));
