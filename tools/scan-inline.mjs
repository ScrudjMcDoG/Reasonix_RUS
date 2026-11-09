// Inventory of inline localization sites (en/zh/"zh-TW" maps, arrays and ternaries).
import fs from 'node:fs';
import path from 'node:path';
import { webDir } from './appdir.mjs';

const APP = webDir(process.argv[2]);
const ASSETS = path.join(APP, 'assets');
const files = fs.readdirSync(ASSETS).filter((f) => f.endsWith('.js'));

const rows = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(ASSETS, f), 'utf8');
  const sites = [];
  // object/array locale keys
  const reKey = /(?:^|[{,\[])\s*(?:"zh-TW"|zh|en)\s*:\s*[{[]/g;
  let m;
  const keyHits = [];
  while ((m = reKey.exec(src))) keyHits.push(m.index);
  // group consecutive hits belonging to the same literal (within 4000 chars)
  let group = [];
  for (const idx of keyHits) {
    if (group.length && idx - group[group.length - 1] > 200000) { sites.push(group); group = []; }
    group.push(idx);
  }
  if (group.length) sites.push(group);
  const ternaries = [...src.matchAll(/"zh-TW"===/g)].map((x) => x.index);
  const arrLocale = [...src.matchAll(/\["en","zh","zh-TW"\]|en:\[|zh:\[/g)].map((x) => x.index);
  if (keyHits.length || ternaries.length) {
    rows.push({
      file: f,
      localeKeys: keyHits.length,
      keyGroups: sites.map((g) => ({ count: g.length, first: g[0] })),
      zhTwTernaries: ternaries.length,
      ternaryOffsets: ternaries.slice(0, 10),
      size: src.length,
    });
  }
}
rows.sort((a, b) => b.localeKeys - a.localeKeys);
for (const r of rows) {
  console.log(`${r.file}  localeKeys=${r.localeKeys} groups=${r.keyGroups.length} (${r.keyGroups.map((g) => g.count).join(',')})  zhTW-ternary=${r.zhTwTernaries}`);
}
fs.writeFileSync(path.join(import.meta.dirname, '..', 'work', 'inline-sites.json'), JSON.stringify(rows, null, 1));
console.log('\nfiles with sites:', rows.length);
