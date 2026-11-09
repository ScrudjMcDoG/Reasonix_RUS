// Verify a patched Reasonix web build: syntax, dictionary integrity and i18n output.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { appDir as resolveApp } from './appdir.mjs';

const appRoot = resolveApp(process.argv[2]);
const webDir = path.join(appRoot, 'resources', 'app');
const assetsDir = path.join(webDir, 'assets');
const dataDir = path.resolve(process.argv[3] || 'ru');

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fail++; };

const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'units', 'manifest.json'), 'utf8'));
const backupDirs = path.join(dataDir, 'backup');
let patchedFiles = [...new Set(manifest.units.map((u) => u.file))];
if (fs.existsSync(backupDirs)) {
  for (const d of fs.readdirSync(backupDirs)) {
    const metaPath = path.join(backupDirs, d, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (path.resolve(meta.appDir) !== appRoot) continue;
    patchedFiles = meta.files.map((f) => path.basename(f.rel));
  }
}
const files = patchedFiles;
console.log(`patched files to check: ${files.length}`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reasonix-verify-'));

console.log('1) syntax of patched modules');
for (const f of files.filter((x) => x.endsWith('.js'))) {
  const src = path.join(assetsDir, f);
  if (!fs.existsSync(src)) { ok(false, `${f} missing`); continue; }
  const copy = path.join(tmp, f.replace(/\.js$/, '.mjs'));
  fs.copyFileSync(src, copy);
  try {
    execFileSync(process.execPath, ['--check', copy], { stdio: 'ignore' });
    ok(true, f);
  } catch (e) {
    ok(false, `${f}: syntax error (exit ${e.status})`);
  }
}

console.log('2) base dictionary integrity');
const i18nFile = fs.readdirSync(assetsDir).find((f) => /^i18n-.*\.js$/.test(f));
const i18nSrc = fs.readFileSync(path.join(assetsDir, i18nFile), 'utf8');
const start = i18nSrc.indexOf(',r={') + 3;
const end = i18nSrc.indexOf('},a=s()');
const base = new Function('return (' + i18nSrc.slice(start, end + 1) + ');')();
const baseUnit = manifest.units.find((u) => u.id === 'base');
const en = JSON.parse(fs.readFileSync(path.join(dataDir, baseUnit.en), 'utf8'));
ok(Object.keys(base).length === Object.keys(en).length, `base keys = ${Object.keys(base).length} (expected ${Object.keys(en).length})`);
const ALLOW_CJK = new Set(['settings.reasoningLanguage.zh', 'notice.completionUncertainBody']);
const cjk = Object.entries(base).filter(([k, v]) => /[\u4e00-\u9fff]/.test(v) && !ALLOW_CJK.has(k));
ok(cjk.length === 0, `no unexpected Chinese left in base dict (${cjk.length}${cjk.length ? ': ' + cjk.map(([k]) => k).join(', ') : ''})`);
const latin = Object.entries(base).filter(([, v]) => /^[A-Za-z][A-Za-z ,.'’\-—:;()/!?]*$/.test(v) && v.split(' ').length > 3);
ok(latin.length === 0, `no long English sentences left (${latin.length}${latin.length ? ': ' + latin.slice(0, 3).map(([k]) => k).join(', ') : ''})`);
ok(base['error.unknown'].startsWith('Произошла') || !/^An error/.test(base['error.unknown']), `error.unknown = ${base['error.unknown'].slice(0, 40)}`);
ok(base['common.none'] === 'нет', `common.none = ${base['common.none']}`);
ok(base['settings.themeDark'] === 'Тёмная', `settings.themeDark = ${base['settings.themeDark']}`);

console.log('3) i18n runtime');
try {
  const mod = await import(pathToFileURL(path.join(assetsDir, i18nFile)).href);
  const t = mod.s;
  ok(typeof t === 'function', 'module loads and exports t()');
  const sample = t('error.unknown');
  ok(/[А-Яа-яЁё]/.test(sample), `t("error.unknown") → ${sample.slice(0, 60)}`);
  const withParam = t('tool.fileOther', { n: 3 });
  ok(withParam.includes('3') && /[А-Яа-яЁё]/.test(withParam), `t("tool.fileOther",{n:3}) → ${withParam}`);
  ok(t('common.none') === 'нет', 't("common.none")');
} catch (e) {
  ok(false, 'i18n import: ' + e.message);
}

console.log('4) inline dictionaries');
for (const u of manifest.units.filter((x) => x.shape !== 'array')) {
  const f = path.join(assetsDir, u.file);
  const src = fs.readFileSync(f, 'utf8');
  const ru = JSON.parse(fs.readFileSync(path.join(dataDir, u.ru), 'utf8'));
  const key = Object.keys(ru)[0];
  const at = src.indexOf('"' + key + '"');
  const alt = src.indexOf(key + ':');
  ok(at >= 0 || alt >= 0, `${u.id}: key ${key} present in patched file`);
}
console.log('5) index.html');
ok(fs.readFileSync(path.join(webDir, 'index.html'), 'utf8').includes('lang="ru"'), 'html lang="ru"');

console.log(fail ? `\nFAILED: ${fail}` : '\nALL CHECKS PASSED');
process.exitCode = fail ? 1 : 0;
