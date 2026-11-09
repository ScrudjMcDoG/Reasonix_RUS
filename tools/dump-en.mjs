// Detect English translation dictionaries (and string arrays) in the Reasonix assets
// so they can be translated to Russian and replaced in place.
import fs from 'node:fs';
import path from 'node:path';
import { webDir } from './appdir.mjs';

const APP = webDir(process.argv[2]);
const ASSETS = path.join(APP, 'assets');
const OUT = path.join(import.meta.dirname, '..', 'work', 'en-candidates.json');

function matchBrace(src, openIdx) {
  const open = src[openIdx];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, q = '', esc = false;
  for (let i = openIdx; i < src.length; i++) {
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
  return -1;
}

const out = [];
for (const f of fs.readdirSync(ASSETS).filter((x) => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(ASSETS, f), 'utf8');
  const re = /([A-Za-z_$][\w$]*)\s*=\s*(?![=>])\s*([{[])/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    const openIdx = m.index + m[0].length - 1;
    const end = matchBrace(src, openIdx);
    if (end < 0) continue;
    const text = src.slice(openIdx, end + 1);
    if (text.length < 60) continue;
    let val;
    try { val = new Function('return (' + text + ');')(); } catch { continue; }
    if (Array.isArray(val)) {
      if (val.length < 3 || !val.every((v) => typeof v === 'string')) continue;
      if (val.some((v) => /\.js$|^\//.test(v))) continue; // module path lists
      const latin = val.filter((v) => /[A-Za-z]/.test(v) && !/[\u4e00-\u9fff\u0400-\u04ff]/.test(v)).length;
      const wordy = val.filter((v) => v.includes(' ') || v.length > 10).length;
      if (latin / val.length > 0.9 && wordy / val.length > 0.7) out.push({ file: f, name, start: openIdx, end: end + 1, keys: val.length, kind: 'array' });
      continue;
    }
    if (!val || typeof val !== 'object') continue;
    const keys = Object.keys(val);
    if (keys.length < 5) continue;
    const strVals = keys.filter((k) => typeof val[k] === 'string');
    if (strVals.length / keys.length < 0.8) continue;
    const dotted = keys.filter((k) => /^[a-z][\w]*\.[\w.]+$/.test(k)).length;
    const latin = strVals.filter((k) => /[A-Za-z]/.test(val[k]) && !/[\u4e00-\u9fff\u0400-\u04ff]/.test(val[k])).length;
    if (dotted / keys.length > 0.6 && latin / strVals.length > 0.9) {
      out.push({ file: f, name, start: openIdx, end: end + 1, keys: keys.length, kind: 'dict' });
    }
  }
}
out.sort((a, b) => b.keys - a.keys);
for (const o of out) console.log(`${o.file}  ${o.name}  keys=${o.keys}  [${o.start},${o.end})`);
console.log('candidates:', out.length);
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
