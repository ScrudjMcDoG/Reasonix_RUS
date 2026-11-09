// Guard: refuse to translate literals that are also used in string comparisons.
import fs from 'node:fs';
import path from 'node:path';

const APP = process.argv[2];
const dir = path.join(APP, 'assets');
const candidates = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
const sources = files.map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]);

for (const s of candidates) {
  const hits = [];
  for (const [f, src] of sources) {
    let i = 0;
    while ((i = src.indexOf(JSON.stringify(s), i)) !== -1) {
      const pre = src.slice(Math.max(0, i - 40), i);
      const cmp = /(includes|startsWith|endsWith|test|match)\(\s*$|(===|!==)\s*$/.test(pre);
      hits.push({ f, cmp });
      i += s.length;
    }
  }
  const cmp = hits.filter((h) => h.cmp);
  console.log(`${cmp.length ? 'COMPARED ' : 'safe     '} ${s}  (${hits.length} occurrence(s))`);
  for (const c of cmp) console.log(`    ${c.f}`);
}
