// Extract locale dictionaries from Reasonix web assets.
import fs from 'node:fs';
import path from 'node:path';
import { webDir } from './appdir.mjs';

const APP = webDir(process.argv[2]);
const ASSETS = path.join(APP, 'assets');
const OUT = path.join(import.meta.dirname, '..', 'work');
fs.mkdirSync(OUT, { recursive: true });

function readF(n) { return fs.readFileSync(path.join(ASSETS, n), 'utf8'); }

// --- 1. base dict in i18n chunk -------------------------------------------------
const i18nName = fs.readdirSync(ASSETS).find((f) => /^i18n-.*\.js$/.test(f));
const i18nSrc = readF(i18nName);
const start = i18nSrc.indexOf(',r={') + 3;
const end = i18nSrc.indexOf('},a=s()');
const baseLiteral = i18nSrc.slice(start, end + 1);
const base = new Function('return (' + baseLiteral + ');')();
console.log('i18n file:', i18nName);
console.log('base keys:', Object.keys(base).length);

// --- 2. zh / zh-TW chunks ------------------------------------------------------
const zhName = fs.readdirSync(ASSETS).find((f) => /^zh-.*\.js$/.test(f));
const zhTwName = fs.readdirSync(ASSETS).find((f) => /^zh-TW-.*\.js$/.test(f));
function extractExport(src, exportName) {
  const seg = src.slice(src.lastIndexOf('export{'));
  const m = new RegExp(`([A-Za-z_$][\\w$]*) as ${exportName}\\b`).exec(seg);
  if (!m) throw new Error('export not found: ' + exportName + ' in ' + seg.slice(0, 200));
  const varName = m[1];
  const vStart = src.indexOf(`var ${varName}=`);
  let j = src.indexOf('{', vStart);
  let depth = 0, k = j, inStr = false, q = '', esc = false;
  for (; k < src.length; k++) {
    const c = src[k];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) inStr = false; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = true; q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  return new Function('return (' + src.slice(j, k + 1) + ');')();
}
const zh = extractExport(readF(zhName), 'zh');
const zhTW = extractExport(readF(zhTwName), 'zhTW');
console.log('zh file:', zhName, 'keys:', Object.keys(zh).length);
console.log('zhTW file:', zhTwName, 'keys:', Object.keys(zhTW).length);

const onlyBase = Object.keys(base).filter((k) => !(k in zh));
const onlyZh = Object.keys(zh).filter((k) => !(k in base));
console.log('keys in base but not zh:', onlyBase.length, onlyBase.slice(0, 20));
console.log('keys in zh but not base:', onlyZh.length, onlyZh.slice(0, 20));

fs.writeFileSync(path.join(OUT, 'base.en.json'), JSON.stringify(base, null, 2));
fs.writeFileSync(path.join(OUT, 'zh.json'), JSON.stringify(zh, null, 2));
fs.writeFileSync(path.join(OUT, 'zh-TW.json'), JSON.stringify(zhTW, null, 2));

// --- 3. inline dictionaries in other chunks -----------------------------------
const files = fs.readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
const report = [];
for (const f of files) {
  const src = readF(f);
  const hits = [];
  // ternary pattern "zh"===x?A:"zh-TW"===x?B:C
  const re = /"zh"===\w+\?([A-Za-z_$][\w$]*):"zh-TW"===\w+\?([A-Za-z_$][\w$]*):([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(src))) hits.push({ kind: 'ternary', zhVar: m[1], zhTwVar: m[2], enVar: m[3], at: m.index });
  if (hits.length) report.push({ file: f, hits: hits.length, sample: hits.slice(0, 6) });
}
console.log('\n=== files with inline locale ternaries ===');
for (const r of report) console.log(r.file, r.hits, JSON.stringify(r.sample));
fs.writeFileSync(path.join(OUT, 'inline-report.json'), JSON.stringify(report, null, 2));
