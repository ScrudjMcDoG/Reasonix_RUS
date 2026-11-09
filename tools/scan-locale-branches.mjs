// Enumerate every locale-dependent branch site in the Reasonix app assets.
import fs from 'node:fs';
import path from 'node:path';
import { webDir } from './appdir.mjs';

const APP = webDir(process.argv[2]);
const ASSETS = path.join(APP, 'assets');
const SKIP = /^(vendor-|chunk-|mermaid|cytoscape|c4Diagram|dagre|graphlib|rough|esm-|react-|rolldown|preload-helper|seti-)/;
const RE = /"zh-TW"===|"zh"===|startsWith\("zh"\)|===\s*"zh"|"zh"\s*===/g;

let total = 0;
for (const f of fs.readdirSync(ASSETS).filter((x) => x.endsWith('.js') && !SKIP.test(x))) {
  const src = fs.readFileSync(path.join(ASSETS, f), 'utf8');
  const hits = [...src.matchAll(RE)];
  if (!hits.length) continue;
  console.log(`\n################ ${f}  hits=${hits.length}`);
  let i = 0;
  for (const h of hits) {
    const s = Math.max(0, h.index - 160);
    const e = Math.min(src.length, h.index + 320);
    console.log(`  [${i++}] @${h.index}: ...${src.slice(s, e).replace(/\n/g, '\\n')}...`);
  }
  total += hits.length;
}
console.log('\ntotal sites:', total);
