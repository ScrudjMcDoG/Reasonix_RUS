// Assemble the distributable localization data folder (ru/) from work artifacts.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { appDir } from './appdir.mjs';

const root = path.join(import.meta.dirname, '..');
const work = path.join(root, 'work');
const out = path.join(root, 'ru');
const APP = appDir(process.argv[2]);

// Bootstrap the units from work/ only when the shipped data does not exist yet.
// Updates go through tools/promote-update.mjs, which owns ru/units.
fs.mkdirSync(path.join(out, 'units'), { recursive: true });
fs.mkdirSync(path.join(out), { recursive: true });
if (!fs.existsSync(path.join(out, 'units', 'manifest.json'))) {
  for (const f of fs.readdirSync(path.join(work, 'units'))) {
    if (/\.(en|ru)\.json$/.test(f)) fs.copyFileSync(path.join(work, 'units', f), path.join(out, 'units', f));
  }
  fs.copyFileSync(path.join(work, 'units', 'manifest.json'), path.join(out, 'units', 'manifest.json'));
}
if (!fs.existsSync(path.join(out, 'manual-patches.json'))) {
  fs.copyFileSync(path.join(work, 'manual-patches.json'), path.join(out, 'manual-patches.json'));
}

// record hashes of every file the patch touches, as shipped in this app version
const assets = path.join(APP, 'resources', 'app', 'assets');
const web = path.join(APP, 'resources', 'app');
const manifest = JSON.parse(fs.readFileSync(path.join(out, 'units', 'manifest.json'), 'utf8'));
// make unit paths relative so the data folder is portable
for (const u of manifest.units) {
  u.en = `units/${u.id}.en.json`;
  u.ru = `units/${u.id}.ru.json`;
}
fs.writeFileSync(path.join(out, 'units', 'manifest.json'), JSON.stringify(manifest, null, 1));
const patches = JSON.parse(fs.readFileSync(path.join(out, 'manual-patches.json'), 'utf8'));
const hashes = {};
const errors = [];
function resolve(dir, pattern) {
  const hit = fs.readdirSync(dir).filter((f) => {
    if (!pattern.includes('*')) return f === pattern;
    const re = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return re.test(f);
  });
  if (hit.length !== 1) errors.push(`${pattern}: ${hit.length} matches`);
  return hit.length === 1 ? path.join(dir, hit[0]) : null;
}
const names = new Set();
for (const u of manifest.units) {
  const p = resolve(assets, u.file);
  if (p) names.add(p);
}
for (const p of patches) {
  const p2 = ('subdir' in p) ? path.join(web, p.subdir, p.file) : resolve(assets, p.file);
  if (p2 && fs.existsSync(p2)) names.add(p2);
}
for (const p of names) hashes[path.basename(p)] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.writeFileSync(path.join(out, 'expected-hashes.json'), JSON.stringify(hashes, null, 1));
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({
  appVersionDir: path.basename(APP) === 'app' ? path.basename(path.dirname(APP)) : path.basename(APP),
  strings: manifest.units.reduce((a, u) => a + (Array.isArray(JSON.parse(fs.readFileSync(path.join(out, u.en), 'utf8'))) ? JSON.parse(fs.readFileSync(path.join(out, u.en), 'utf8')).length : Object.keys(JSON.parse(fs.readFileSync(path.join(out, u.en), 'utf8'))).length), 0),
  units: manifest.units.length,
  files: Object.keys(hashes).length,
}, null, 1));
console.log('files hashed:', Object.keys(hashes).length);
if (errors.length) { console.log('resolve errors:'); for (const e of errors) console.log('  ' + e); }

