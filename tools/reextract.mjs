// Re-extract every localizable dictionary from a Reasonix build into work/update/.
// Version-robust: anchors are found by content patterns, not by file names or offsets.
import fs from 'node:fs';
import path from 'node:path';

const APP = process.argv[2];
const OUT = path.resolve(process.argv[3] || 'work/update');
if (!APP) { console.error('usage: reextract.mjs <appDir> [outDir]'); process.exit(2); }
const assetsDir = path.join(APP, 'resources', 'app', 'assets');
const read = (f) => fs.readFileSync(path.join(assetsDir, f), 'utf8');
const files = () => fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
fs.mkdirSync(path.join(OUT, 'units'), { recursive: true });

function matchBrace(src, openIdx) {
  const open = src[openIdx];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, q = '', esc = false;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) inStr = false; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = true; q = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
  }
  return -1;
}
const evalLit = (t) => new Function('return (' + t + ');')();
const findOne = (pred, what) => {
  const hit = files().filter(pred);
  if (hit.length !== 1) throw new Error(`${what}: найдено файлов — ${hit.length} (${hit.join(', ')})`);
  return hit[0];
};

const units = [];
function addUnit(id, file, start, end, text, val, shape) {
  const rec = {
    id, shape, file, start, end,
    en: `units/${id}.en.json`,
    ru: `units/${id}.ru.json`,
  };
  if (Array.isArray(val)) fs.writeFileSync(path.join(OUT, 'units', id + '.en.json'), JSON.stringify(val, null, 1));
  else {
    const stringsOnly = shape === 'dict-partial';
    const source = Object.fromEntries(Object.entries(val).filter(([, v]) => (stringsOnly ? typeof v === 'string' : true)));
    if (stringsOnly) {
      rec.functions = Object.entries(val).filter(([, v]) => typeof v !== 'string').map(([k, v]) => ({ key: k, source: String(v) }));
    }
    fs.writeFileSync(path.join(OUT, 'units', id + '.en.json'), JSON.stringify(source, null, 1));
  }
  units.push(rec);
}

// ---------------------------------------------------------------- base dict ----
const i18nFile = findOne((f) => /^i18n-.*\.js$/.test(f), 'i18n chunk');
{
  const src = read(i18nFile);
  const s = src.indexOf(',r={') + 3;
  const e = src.indexOf('},a=s()');
  if (s < 3 || e < 0) throw new Error('base dictionary literal not found');
  const text = src.slice(s, e + 1);
  addUnit('base', i18nFile, s, e + 1, text, evalLit(text), 'dict');
}

// ------------------------------------------------- locale trios (en var refs) ---
// pattern:  en:NAME,zh:{...},"zh-TW":{...}   /   "zh"===x?ZH:"zh-TW"===x?TW:EN
function locateVarLiteral(src, name) {
  const re = new RegExp(`(?<![\\w$])${name}\\s*=\\s*[{[]`);
  const m = re.exec(src);
  if (!m) return null;
  const openIdx = m.index + m[0].length - 1;
  const end = matchBrace(src, openIdx);
  if (end < 0) return null;
  return { start: openIdx, end: end + 1, text: src.slice(openIdx, end + 1) };
}

// HeartbeatPanel: {en:NAME,zh:{...},"zh-TW":{...}}
{
  const file = findOne((f) => /^HeartbeatPanel-.*\.js$/.test(f), 'HeartbeatPanel');
  const src = read(file);
  const m = /en:([A-Za-z_$][\w$]*)\s*,\s*zh\s*:/.exec(src);
  if (!m) throw new Error('HeartbeatPanel: en/zh trio not found');
  const loc = locateVarLiteral(src, m[1]);
  if (!loc) throw new Error('HeartbeatPanel: en literal not found');
  addUnit('heartbeat', file, loc.start, loc.end, loc.text, evalLit(loc.text), 'dict');
}
// SettingsPanelEntry: useProviderT ternary  ...:"zh-TW"===X?TW:EN)
for (const [id, fileRe, what] of [
  ['providerui', /^SettingsPanelEntry-.*\.js$/, 'SettingsPanelEntry'],
  ['browser', /^BrowserPanelEntry-.*\.js$/, 'BrowserPanelEntry'],
  ['inbox_queue', /^ComposerInboxQueue-.*\.js$/, 'ComposerInboxQueue'],
]) {
  const file = findOne((f) => fileRe.test(f), what);
  const src = read(file);
  // two known shapes:
  //   "zh"===x?ZH:"zh-TW"===x?TW:EN
  //   "zh-TW"===x?TW:x.startsWith("zh")?ZH:EN
  const candidates = [];
  for (const m of src.matchAll(/"zh"===\w+\?([A-Za-z_$][\w$]*):"zh-TW"===\w+\?([A-Za-z_$][\w$]*):([A-Za-z_$][\w$]*)/g)) candidates.push(m[3]);
  for (const m of src.matchAll(/"zh-TW"===\w+\?([A-Za-z_$][\w$]*):\w+\.startsWith\("zh"\)\?([A-Za-z_$][\w$]*):([A-Za-z_$][\w$]*)/g)) candidates.push(m[3]);
  let chosen = null;
  for (const name of candidates) {
    const loc = locateVarLiteral(src, name);
    if (!loc) continue;
    let val;
    try { val = evalLit(loc.text); } catch { continue; }
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    const keys = Object.keys(val);
    if (keys.length < 5) continue;
    const strings = keys.filter((k) => typeof val[k] === 'string');
    if (strings.length / keys.length < 0.8) continue;
    chosen = { loc, val };
    break;
  }
  if (!chosen) throw new Error(`${what}: locale dictionary not found`);
  addUnit(id, file, chosen.loc.start, chosen.loc.end, chosen.loc.text, chosen.val, 'dict-partial');
}

// ------------------------------------------------- inline {en:..,zh:..} dicts ---
{
  const KEY = /(?:^|[{,\[])\s*(?:"zh-TW"|zh|en)\s*:\s*[{[]/g;
  for (const f of files()) {
    const src = read(f);
    const keys = [...src.matchAll(KEY)].map((m) => {
      const lang = /(?:"zh-TW"|zh|en)/.exec(m[0])[0];
      const openIdx = m.index + m[0].length - 1;
      return { lang, openIdx, end: matchBrace(src, openIdx) + 1 };
    });
    if (!keys.length) continue;
    const groups = [];
    let cur = [keys[0]];
    for (let i = 1; i < keys.length; i++) {
      const gap = src.slice(cur[cur.length - 1].end, keys[i].openIdx);
      if (/^\s*,\s*(?:"zh-TW"|zh|en)\s*:\s*$/.test(gap)) cur.push(keys[i]);
      else { groups.push(cur); cur = [keys[i]]; }
    }
    groups.push(cur);
    let n = 0;
    for (const g of groups) {
      const langs = {};
      for (const k of g) langs[k.lang] = k;
      if (!langs.en || !langs.zh) continue;
      const text = src.slice(langs.en.openIdx, langs.en.end);
      let val;
      try { val = evalLit(text); } catch { continue; }
      const id = `${f.replace(/\.js$/, '').replace(/-[A-Za-z0-9_-]{8}$/, '')}__${n++}`;
      addUnit(id, f, langs.en.openIdx, langs.en.end, text, val, Array.isArray(val) ? 'array' : 'dict-partial');
    }
  }
}

// ------------------------------------------------------- management locale ------
{
  const file = findOne((f) => /^managementLocale-.*\.js$/.test(f), 'managementLocale');
  const src = read(file);
  const m = /([A-Za-z_$][\w$]*)\s*=\s*\{\s*[A-Za-z_$][\w$]*\s*:\s*\[/.exec(src);
  if (!m) throw new Error('managementLocale: dictionary not found');
  const openIdx = src.indexOf('{', m.index + m[0].indexOf('{'));
  const end = matchBrace(src, openIdx);
  const text = src.slice(openIdx, end + 1);
  addUnit('management', file, openIdx, end + 1, text, evalLit(text), 'management');
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ app: APP, units }, null, 1));
console.log(`units extracted: ${units.length}`);
for (const u of units) {
  const val = JSON.parse(fs.readFileSync(path.join(OUT, u.en), 'utf8'));
  const n = Array.isArray(val) ? val.length : Object.keys(val).length;
  console.log(`  ${u.id.padEnd(34)} ${u.shape.padEnd(13)} ${String(n).padStart(5)}  ${u.file}`);
}
