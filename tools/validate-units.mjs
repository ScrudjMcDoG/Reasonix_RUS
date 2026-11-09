// Validate translated units against their English sources.
import fs from 'node:fs';
import path from 'node:path';

const work = path.join(import.meta.dirname, '..', 'work');
const manifest = JSON.parse(fs.readFileSync(path.join(work, 'units', 'manifest.json'), 'utf8'));
const placeholders = (s) => (String(s).match(/\{(\w+)\}/g) || []).sort().join(',');
let errors = 0;
let total = 0;
let unchanged = [];
for (const u of manifest.units) {
  if (!fs.existsSync(u.ru)) { console.log(`MISSING ${u.id}: ${u.ru}`); errors++; continue; }
  const en = JSON.parse(fs.readFileSync(u.en, 'utf8'));
  const ru = JSON.parse(fs.readFileSync(u.ru, 'utf8'));
  const enIsArr = Array.isArray(en);
  const ruIsArr = Array.isArray(ru);
  if (enIsArr !== ruIsArr) { console.log(`SHAPE MISMATCH ${u.id}`); errors++; continue; }
  const enKeys = enIsArr ? en.map((_, i) => i) : Object.keys(en);
  const ruKeys = ruIsArr ? ru.map((_, i) => i) : Object.keys(ru);
  if (enKeys.length !== ruKeys.length) { console.log(`COUNT MISMATCH ${u.id}: en=${enKeys.length} ru=${ruKeys.length}`); errors++; continue; }
  total += enKeys.length;
  for (let i = 0; i < enKeys.length; i++) {
    const k = enKeys[i];
    const ev = en[k];
    const rv = ru[ruKeys[i]];
    if (typeof rv !== 'string' || (!rv.trim() && String(ev).trim())) { console.log(`EMPTY ${u.id} ${k}`); errors++; continue; }
    if (placeholders(ev) !== placeholders(rv)) { console.log(`PLACEHOLDER ${u.id} ${k}\n   en: ${ev}\n   ru: ${rv}`); errors++; }
    if (/[\u4e00-\u9fff]/.test(rv)) { console.log(`CJK LEFT ${u.id} ${k}: ${rv}`); errors++; }
    if (ev === rv && /\s/.test(ev) && /[a-z]{3}/.test(ev)) unchanged.push(`${u.id} ${k}: ${ev}`);
  }
}
console.log(`\nunits=${manifest.units.length} strings=${total} errors=${errors} identical=${unchanged.length}`);
if (unchanged.length) {
  console.log('\n--- identical to English (review these) ---');
  for (const s of unchanged) console.log('  ' + s);
}
process.exitCode = errors ? 1 : 0;

