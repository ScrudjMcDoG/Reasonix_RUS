// Extract locale-conditional literal pairs  XXX ? "<chinese>" : "<english>"  from app assets.
import fs from 'node:fs';
import path from 'node:path';
import { webDir } from './appdir.mjs';

const APP = webDir(process.argv[2]);
const ASSETS = path.join(APP, 'assets');
const SKIP = /^(vendor-|chunk-|mermaid|cytoscape|c4Diagram|dagre|graphlib|rough|esm-|react-|rolldown|preload-helper|seti-)/;
const out = [];
for (const f of fs.readdirSync(ASSETS).filter((x) => x.endsWith('.js') && !SKIP.test(x))) {
  const src = fs.readFileSync(path.join(ASSETS, f), 'utf8');
  // Chinese literal followed by an English literal in the else branch
  const re = /(\?|:)\s*"([^"\\]*(?:\\.[^"\\]*)*[\u4e00-\u9fff][^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let m;
  let n = 0;
  while ((m = re.exec(src))) {
    out.push({ file: f, index: m.index, full: m[0], zh: m[2], en: m[3] });
    n++;
  }
  if (n) console.log(`${f}: ${n}`);
}
fs.writeFileSync(path.join(import.meta.dirname, '..', 'work', 'locale-pairs.json'), JSON.stringify(out, null, 1));
console.log('\ntotal pairs:', out.length);
for (const o of out) console.log(`${o.file} @${o.index}\n    zh: ${o.zh}\n    en: ${o.en}`);
