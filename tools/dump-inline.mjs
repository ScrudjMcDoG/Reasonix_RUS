// Extract every inline locale dictionary (en/zh/"zh-TW") from the Reasonix assets
// into work/inline/*.json so it can be translated and re-inserted.
import fs from 'node:fs';
import path from 'node:path';
import { webDir } from './appdir.mjs';

const APP = webDir(process.argv[2]);
const ASSETS = path.join(APP, 'assets');
const OUT = path.join(import.meta.dirname, '..', 'work', 'inline');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

function matchBrace(src, openIdx) {
  const open = src[openIdx];
  const close = open === '{' ? '}' : ']';
  let depth = 0, i = openIdx, inStr = false, q = '', esc = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === q) inStr = false;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = true; q = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
  }
  throw new Error('unbalanced');
}

const KEY = /(?:^|[{,\[])\s*(?:"zh-TW"|zh|en)\s*:\s*[{[]/g;
const summary = [];
for (const f of fs.readdirSync(ASSETS).filter((x) => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(ASSETS, f), 'utf8');
  const keys = [...src.matchAll(KEY)].map((m) => {
    const k = /(?:"zh-TW"|zh|en)/.exec(m[0])[0];
    const keyStart = m.index + m[0].indexOf(k);
    const openIdx = m.index + m[0].length - 1;
    return { lang: k, keyStart, openIdx, end: matchBrace(src, openIdx) + 1 };
  });
  if (!keys.length) continue;
  // group keys that belong to the same literal: only ",<key>:" may sit between them
  const groups = [];
  let cur = [keys[0]];
  for (let i = 1; i < keys.length; i++) {
    const gap = src.slice(cur[cur.length - 1].end, keys[i].keyStart);
    if (/^\s*,\s*$/.test(gap)) cur.push(keys[i]);
    else { groups.push(cur); cur = [keys[i]]; }
  }
  groups.push(cur);
  let n = 0;
  for (const g of groups) {
    if (g.length < 2) continue;
    const langs = {};
    for (const k of g) {
      langs[k.lang] = { start: k.openIdx, end: k.end, text: src.slice(k.openIdx, k.end) };
    }
    if (!langs.en || !langs.zh) continue;
    // locate enclosing statement start for the report
    const ctxStart = Math.max(0, g[0].keyStart - 120);
    const record = {
      file: f,
      site: n++,
      langs: Object.fromEntries(Object.entries(langs).map(([k, v]) => [k, { start: v.start, end: v.end, text: v.text }])),
      prefixVar: src.slice(ctxStart, g[0].keyStart).replace(/\s+/g, ' ').slice(-90),
    };
    const name = `${f.replace(/\.js$/, '')}__${record.site}.json`;
    fs.writeFileSync(path.join(OUT, name), JSON.stringify(record, null, 1));
    summary.push({ file: f, site: record.site, out: name, langs: Object.keys(langs).join('+'), enLen: langs.en.text.length, pref: record.prefixVar });
  }
}
for (const s of summary) console.log(`${s.out}  langs=${s.langs} enLen=${s.enLen}  pref=...${s.pref}`);
console.log('total sites:', summary.length);
