// Report value shapes of every English dictionary/array we plan to translate.
import fs from 'node:fs';
import path from 'node:path';
import { webDir } from './appdir.mjs';

const work = path.join(import.meta.dirname, '..', 'work');
const APP = webDir(process.argv[2]);
const read = (f) => fs.readFileSync(path.join(APP, 'assets', f), 'utf8');
const evalLit = (t) => new Function('return (' + t + ');')();

const targets = [];
// dump-inline sites
for (const f of fs.readdirSync(path.join(work, 'inline'))) {
  const rec = JSON.parse(fs.readFileSync(path.join(work, 'inline', f), 'utf8'));
  targets.push({ id: f.replace(/\.json$/, ''), file: rec.file, start: rec.langs.en.start, end: rec.langs.en.end, text: rec.langs.en.text });
}
// named dicts
const named = [
  ['i18n-CfZ8vzkv.js', 171, 210106, 'base'],
  ['HeartbeatPanel-D_trDttU.js', 4099, 7796, 'heartbeat'],
  ['SettingsPanelEntry-BT61Rr8L.js', 14552, 18449, 'providerui'],
  ['ComposerInboxQueue-zzRcIe0s.js', 51006, 51006, 'inbox_queue'],
  ['BrowserPanelEntry-BO9fyLpE.js', 1727, 1727, 'browser'],
  ['managementLocale-CiZ66ajx.js', 152, 4436, 'management'],
];
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
for (const [file, start, end, id] of named) {
  const src = read(file);
  const openIdx = src.indexOf('{', start);
  const e = end > start ? end : matchBrace(src, openIdx) + 1;
  targets.push({ id, file, start: openIdx, end: e, text: src.slice(openIdx, e) });
}

for (const t of targets) {
  if (t.id === 'management') {
    const src = read(t.file);
    t.start = src.indexOf('{', 150);
    t.end = src.indexOf('};function useManagementT') + 1;
    t.text = src.slice(t.start, t.end);
  }
  fs.writeFileSync(path.join(work, 'units', 'raw', t.id + '.en.json'), JSON.stringify({ id: t.id, file: t.file, start: t.start, end: t.end, text: t.text }, null, 1));
  let val;
  try { val = evalLit(t.text); } catch (e) { console.log(`${t.id}: EVAL FAIL ${e.message}`); continue; }
  if (Array.isArray(val)) {
    console.log(`${t.id}: array(${val.length}) allStrings=${val.every((x) => typeof x === 'string')}`);
  } else {
    const keys = Object.keys(val);
    const fn = keys.filter((k) => { try { return typeof val[k] === 'function'; } catch { return false; } });
    console.log(`${t.id}: dict(${keys.length}) functions=${fn.length} ${fn.slice(0, 5).join(',')}`);
  }
}

