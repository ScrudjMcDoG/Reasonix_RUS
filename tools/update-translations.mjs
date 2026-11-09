// Carry existing Russian translations over to the re-extracted units of a new build.
// New units are matched to the shipped ones by content, so ids stay stable across versions.
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const oldDir = path.join(root, 'ru', 'units');
const outDir = path.resolve(process.argv[2] || path.join(root, 'work', 'update'));
const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));

// ---- load the shipped translations ------------------------------------------
const old = []; // {id, en, ru}
{
  const byId = new Map();
  for (const f of fs.readdirSync(oldDir)) {
    const m = /^(.*)\.(en|ru)\.json$/.exec(f);
    if (!m) continue;
    // the shipped base dictionary is split into batches; treat it as one unit
    const id = /^base\d+$/.test(m[1]) ? 'base' : m[1];
    if (!byId.has(id)) byId.set(id, { id, batches: [] });
    const rec = byId.get(id);
    if (rec[m[2]] === undefined) rec[m[2]] = JSON.parse(fs.readFileSync(path.join(oldDir, f), 'utf8'));
    else if (typeof rec[m[2]] === 'object' && !Array.isArray(rec[m[2]])) Object.assign(rec[m[2]], JSON.parse(fs.readFileSync(path.join(oldDir, f), 'utf8')));
  }
  for (const rec of byId.values()) if (rec.en !== undefined && rec.ru !== undefined) old.push(rec);
}

// English text of an entry, whatever shape the shipped data used:
// management dictionaries are stored either as [zh, zhTW, en] or as the plain en string.
const enText = (v) => (Array.isArray(v) ? v[2] : v);
function score(newEn, newShape, rec) {
  const a = newEn, b = rec.en;
  if (Array.isArray(a) !== Array.isArray(b)) return 0;
  if (Array.isArray(a)) {
    let s = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) s++;
    return s;
  }
  let s = 0;
  for (const [k, v] of Object.entries(a)) {
    const bv = b[k];
    if (bv === undefined) continue;
    const av = enText(v);
    const bvv = enText(bv);
    if (typeof av === 'string' && av === bvv) s++;
  }
  return s;
}

// global fallback memory: english text -> russian text
const tm = new Map();
for (const rec of old) {
  if (Array.isArray(rec.en)) {
    rec.en.forEach((t, i) => { if (typeof t === 'string' && typeof rec.ru[i] === 'string') tm.set(t, rec.ru[i]); });
  } else {
    for (const [k, v] of Object.entries(rec.en)) {
      const ru = rec.ru[k];
      const text = enText(v);
      if (typeof text === 'string' && typeof ru === 'string' && text !== ru) tm.set(text, ru);
    }
  }
}

// ---- merge ------------------------------------------------------------------
const todo = [];
let reused = 0, fromMemory = 0, changed = 0, fresh = 0;
const renamed = new Map();
for (const u of manifest.units) {
  const en = JSON.parse(fs.readFileSync(path.join(outDir, u.en), 'utf8'));
  let best = null, bestScore = 0;
  for (const rec of old) {
    const s = score(en, u.shape, rec);
    if (s > bestScore) { bestScore = s; best = rec; }
  }
  const total = Array.isArray(en) ? en.length : Object.keys(en).length;
  const matched = best && bestScore >= Math.max(2, Math.floor(total * 0.3));
  const prev = matched ? best : null;
  if (matched && best.id !== u.id) renamed.set(u.id, best.id);

  const lookup = (key, text) => {
    const prevRuVal = prev && prev.ru[key];
    const prevEnVal = prev ? enText(prev.en[key]) : undefined;
    if (prevEnVal === text && typeof prevRuVal === 'string') { reused++; return prevRuVal; }
    if (tm.has(text)) { fromMemory++; return tm.get(text); }
    if (prevEnVal !== undefined || tm.size === 0) changed++; else fresh++;
    todo.push({ unit: u.id, key, en: text });
    return text;
  };

  if (Array.isArray(en)) {
    fs.writeFileSync(path.join(outDir, u.ru), JSON.stringify(en.map((t, i) => lookup(i, t)), null, 1));
    continue;
  }
  const ru = {};
  for (const [k, v] of Object.entries(en)) {
    if (u.shape === 'management') { ru[k] = lookup(k, v[2]); continue; }
    if (typeof v !== 'string') { ru[k] = v; continue; } // function-valued entries: handled by literal patches
    ru[k] = lookup(k, v);
  }
  fs.writeFileSync(path.join(outDir, u.ru), JSON.stringify(ru, null, 1) + '\n');
}
fs.writeFileSync(path.join(outDir, 'todo.json'), JSON.stringify(todo, null, 1));
fs.writeFileSync(path.join(outDir, 'renames.json'), JSON.stringify(Object.fromEntries(renamed), null, 1));
console.log(`reused (same unit): ${reused}, reused (translation memory): ${fromMemory}, changed: ${changed}, new: ${fresh}`);
console.log(`units matched to shipped ids: ${renamed.size}`);
for (const [a, b] of renamed) console.log(`  ${a} -> ${b}`);
console.log(`needs translation: ${todo.length}`);
for (const t of todo) console.log(`  [${t.unit}] ${t.key}: ${JSON.stringify(t.en)}`);
