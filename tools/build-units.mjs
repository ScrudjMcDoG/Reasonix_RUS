// Build translatable unit files (English source) for the Russian localization.
import fs from 'node:fs';
import path from 'node:path';
import { webDir } from './appdir.mjs';

const work = path.join(import.meta.dirname, '..', 'work');
const APP = webDir(process.argv[2]);
const read = (f) => fs.readFileSync(path.join(APP, 'assets', f), 'utf8');
const evalLit = (t) => new Function('return (' + t + ');')();
const unitsDir = path.join(work, 'units');
fs.mkdirSync(unitsDir, { recursive: true });
const rawDir = path.join(unitsDir, 'raw');

// raw captures written by report-shapes.mjs (fix management end offset)
const raw = {};
for (const f of fs.readdirSync(rawDir)) {
  const rec = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8'));
  if (rec.id === 'management') {
    const src = read(rec.file);
    rec.start = src.indexOf('{', 150);
    rec.end = src.indexOf('};function useManagementT') + 1;
    rec.text = src.slice(rec.start, rec.end);
  }
  let val;
  try { val = evalLit(rec.text); } catch (e) { throw new Error(rec.id + ': ' + e.message); }
  raw[rec.id] = { ...rec, val };
}

const manifest = { units: [] };
function addUnit(id, source, shape, files, extra = {}) {
  const file = path.join(unitsDir, id + '.en.json');
  fs.writeFileSync(file, JSON.stringify(source, null, 1));
  manifest.units.push({ id, shape, en: file, ru: path.join(unitsDir, id + '.ru.json'), ...files, ...extra });
}

// --- 1. base dictionary, split into batches -----------------------------------
const base = raw.base.val;
const baseKeys = Object.keys(base);
const BATCH = 300;
const batches = [];
for (let i = 0; i < baseKeys.length; i += BATCH) batches.push(baseKeys.slice(i, i + BATCH));
batches.forEach((keys, i) => {
  const id = 'base' + String(i).padStart(2, '0');
  const src = {};
  for (const k of keys) src[k] = base[k];
  addUnit(id, src, 'dict', { file: raw.base.file, start: raw.base.start, end: raw.base.end, part: i, parts: batches.length });
});

// --- 2. small dictionaries -----------------------------------------------------
addUnit('heartbeat', raw.heartbeat.val, 'dict', { file: raw.heartbeat.file, start: raw.heartbeat.start, end: raw.heartbeat.end });
addUnit('providerui', raw.providerui.val, 'dict', { file: raw.providerui.file, start: raw.providerui.start, end: raw.providerui.end });
addUnit('usage', raw['UsageStatsPanel-CLgcfSCB__0'].val, 'dict', { file: raw['UsageStatsPanel-CLgcfSCB__0'].file, start: raw['UsageStatsPanel-CLgcfSCB__0'].start, end: raw['UsageStatsPanel-CLgcfSCB__0'].end });
addUnit('inbox_queue', raw.inbox_queue.val, 'dict', { file: raw.inbox_queue.file, start: raw.inbox_queue.start, end: raw.inbox_queue.end });

const diag = raw['DiagnosticsSettingsPage-ptYUzFys__0'];
const diagStrings = Object.fromEntries(Object.entries(diag.val).filter(([, v]) => typeof v === 'string'));
addUnit('diag0', diagStrings, 'dict-partial', { file: diag.file, start: diag.start, end: diag.end, functions: Object.entries(diag.val).filter(([, v]) => typeof v !== 'string').map(([k, v]) => ({ key: k, source: String(v) })) });
addUnit('diag1', raw['DiagnosticsSettingsPage-ptYUzFys__1'].val, 'dict', { file: raw['DiagnosticsSettingsPage-ptYUzFys__1'].file, start: raw['DiagnosticsSettingsPage-ptYUzFys__1'].start, end: raw['DiagnosticsSettingsPage-ptYUzFys__1'].end });
addUnit('diag2', raw['DiagnosticsSettingsPage-ptYUzFys__2'].val, 'dict', { file: raw['DiagnosticsSettingsPage-ptYUzFys__2'].file, start: raw['DiagnosticsSettingsPage-ptYUzFys__2'].start, end: raw['DiagnosticsSettingsPage-ptYUzFys__2'].end });
addUnit('auth', raw['AuthenticationRecoveryActions-ywIvpzVl__0'].val, 'dict', { file: raw['AuthenticationRecoveryActions-ywIvpzVl__0'].file, start: raw['AuthenticationRecoveryActions-ywIvpzVl__0'].start, end: raw['AuthenticationRecoveryActions-ywIvpzVl__0'].end });

const browser = raw.browser;
const browserStrings = Object.fromEntries(Object.entries(browser.val).filter(([, v]) => typeof v === 'string'));
addUnit('browser', browserStrings, 'dict-partial', { file: browser.file, start: browser.start, end: browser.end, functions: Object.entries(browser.val).filter(([, v]) => typeof v !== 'string').map(([k, v]) => ({ key: k, source: String(v) })) });

// arrays
addUnit('guidance', raw['ComposerGuidanceShelf-BGcs3UGN__0'].val, 'array', { file: raw['ComposerGuidanceShelf-BGcs3UGN__0'].file, start: raw['ComposerGuidanceShelf-BGcs3UGN__0'].start, end: raw['ComposerGuidanceShelf-BGcs3UGN__0'].end });
addUnit('inbox_index', raw['index-u16fniqY__0'].val, 'array', { file: raw['index-u16fniqY__0'].file, start: raw['index-u16fniqY__0'].start, end: raw['index-u16fniqY__0'].end });

// management: {key:[zh, zhTW, en]} -> translate index 2
const mgmt = {};
for (const [k, v] of Object.entries(raw.management.val)) mgmt[k] = v[2];
addUnit('management', mgmt, 'management', { file: raw.management.file, start: raw.management.start, end: raw.management.end });

fs.writeFileSync(path.join(unitsDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
const counts = manifest.units.map((u) => `${u.id}=${u.shape === 'array' ? u.part ?? '' : ''}${Array.isArray(JSON.parse(fs.readFileSync(u.en, 'utf8'))) ? JSON.parse(fs.readFileSync(u.en, 'utf8')).length : Object.keys(JSON.parse(fs.readFileSync(u.en, 'utf8'))).length}`);
console.log('units:', manifest.units.length);
console.log(counts.join('  '));

