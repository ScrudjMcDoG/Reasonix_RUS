// Promote the re-extracted units of a new build into the shipped ru/ data folder:
// apply the few new translations, rename units back to their stable ids, refresh the
// manifest and the expected hashes of the target build.
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const up = path.join(root, 'work', 'update');
const ruDir = path.join(root, 'ru');
const APP = process.argv[2];
if (!APP) { console.error('usage: promote-update.mjs <appDir>'); process.exit(2); }

const manifest = JSON.parse(fs.readFileSync(path.join(up, 'manifest.json'), 'utf8'));
const renames = JSON.parse(fs.readFileSync(path.join(up, 'renames.json'), 'utf8'));
const fresh = JSON.parse(fs.readFileSync(path.join(up, 'new-translations.json'), 'utf8'));

// 1. apply the new translations into the ru files
let applied = 0;
for (const u of manifest.units) {
  const table = fresh[u.id];
  if (!table) continue;
  const file = path.join(up, u.ru);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [k, v] of Object.entries(table)) {
    if (Array.isArray(json)) json[Number(k)] = v;
    else json[k] = v;
    applied++;
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 1));
}
console.log('new strings translated:', applied);

// 2. rename units to their stable ids and rename the files on disk
const outUnits = path.join(ruDir, 'units');
fs.rmSync(outUnits, { recursive: true, force: true });
fs.mkdirSync(outUnits, { recursive: true });
const finalManifest = { app: APP, units: [] };
for (const u of manifest.units) {
  const id = renames[u.id] || u.id;
  const rec = { ...u, id, en: `units/${id}.en.json`, ru: `units/${id}.ru.json` };
  // management dictionaries: keep the shipped en data as plain English strings
  // (the raw form is {key: [zh, zhTW, en]}), so future diffs stay simple.
  const en = JSON.parse(fs.readFileSync(path.join(up, u.en), 'utf8'));
  if (u.shape === 'management') {
    const flat = {};
    for (const [k, v] of Object.entries(en)) flat[k] = Array.isArray(v) ? v[2] : v;
    fs.writeFileSync(path.join(outUnits, id + '.en.json'), JSON.stringify(flat, null, 1));
  } else {
    fs.copyFileSync(path.join(up, u.en), path.join(outUnits, id + '.en.json'));
  }
  fs.copyFileSync(path.join(up, u.ru), path.join(outUnits, id + '.ru.json'));
  finalManifest.units.push(rec);
}
fs.writeFileSync(path.join(outUnits, 'manifest.json'), JSON.stringify(finalManifest, null, 1));
console.log('units promoted:', finalManifest.units.length);
for (const u of finalManifest.units) console.log(`  ${u.id.padEnd(14)} ${u.file}`);
