#!/usr/bin/env node
/**
 * Russianizer for Reasonix desktop UI.
 *
 *   node russianize.mjs check   --target <appDir> [--data <dataDir>]
 *   node russianize.mjs apply   --target <appDir> [--data <dataDir>] [--dry-run]
 *   node russianize.mjs restore --target <appDir> [--data <dataDir>]
 *
 * <appDir> is the directory that contains `resources/app` (for example
 * ...\AppData\Local\Programs\Reasonix\versions\v1.39.1\app).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { appDir as resolveApp } from './appdir.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : def;
};
const flag = (name) => argv.includes('--' + name);

const dataDir = path.resolve(arg('data', path.join(HERE, '..', 'ru')));
let target = arg('target');
const dryRun = flag('dry-run');

if (!cmd || !['check', 'apply', 'restore'].includes(cmd)) {
  console.error('Использование: russianize.mjs check|apply|restore [--target <appDir>] [--data <dataDir>] [--dry-run]');
  process.exit(2);
}

/** Resolve the active Reasonix app directory (shared helper, no user paths inside). */
function autoTarget() {
  return resolveApp();
}
if (!target || target === 'auto') {
  try { target = autoTarget(); } catch (e) { console.error(e.message); process.exit(2); }
}
const appDir = path.resolve(target);
const webDir = path.join(appDir, 'resources', 'app');
const assetsDir = path.join(webDir, 'assets');
if (!fs.existsSync(assetsDir)) {
  console.error(`Not found: ${assetsDir}`);
  process.exit(2);
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** True when the build already carries Russian UI text. */
function alreadyPatched() {
  try {
    const f = fs.readdirSync(assetsDir).find((x) => /^i18n-.*\.js$/.test(x));
    const src = fs.readFileSync(path.join(assetsDir, f), 'utf8');
    const s = src.indexOf(',r={') + 3;
    const e = src.indexOf('},a=s()');
    return /[\u0400-\u04ff]/.test(src.slice(s, e));
  } catch { return false; }
}
if (cmd === 'apply' && alreadyPatched() && !flag('force')) {
  console.log('Приложение уже русифицировано — изменения не вносились.');
  console.log('Сначала верните оригинал: node tools/russianize.mjs restore');
  process.exit(0);
}
if (cmd === 'check') {
  const hashesFile = path.join(dataDir, 'expected-hashes.json');
  const expected = fs.existsSync(hashesFile) ? JSON.parse(fs.readFileSync(hashesFile, 'utf8')) : {};
  console.log(`Папка приложения: ${appDir}`);
  if (alreadyPatched()) console.log('Состояние: русификатор установлен.');
  else console.log('Состояние: интерфейс на языке оригинала.');
  let n = 0;
  for (const name of Object.keys(expected).sort()) {
    const file = name === 'index.html' ? path.join(webDir, name) : path.join(assetsDir, name);
    if (!fs.existsSync(file)) { console.log(`  нет файла  ${name}`); continue; }
    const same = sha256(fs.readFileSync(file)) === expected[name];
    if (!same) n++;
    console.log(`  ${same ? 'оригинал' : 'изменён '}  ${name}`);
  }
  console.log(`Файлов изменено: ${n} из ${Object.keys(expected).length}`);
  process.exit(0);
}
if (cmd === 'restore') {
  const backupRoot = path.join(dataDir, 'backup', sha256(appDir).slice(0, 12));
  const metaPath = path.join(backupRoot, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    console.error(`Резервная копия для ${appDir} не найдена (${backupRoot}).`);
    process.exit(1);
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  let n = 0;
  for (const f of meta.files) {
    const from = path.join(backupRoot, f.rel);
    if (!fs.existsSync(from)) continue;
    fs.copyFileSync(from, path.join(appDir, f.rel));
    n++;
  }
  console.log(`Восстановлено файлов: ${n} (из ${backupRoot})`);
  process.exit(0);
}

// ---------------------------------------------------------------- helpers ----

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
const evalLiteral = (text) => new Function('return (' + text + ');')();
const quoteJs = (s) => JSON.stringify(s);

/** Replace the values of a JS object literal, keeping key order and untouched entries. */
function rewriteObjectValues(text, map) {
  let out = '';
  let i = 0;
  const n = text.length;
  out += text[i++];
  while (i < n) {
    while (i < n && /[\s,]/.test(text[i])) out += text[i++];
    if (i >= n || text[i] === '}') break;
    const keyStart = i;
    let key;
    if (text[i] === '"' || text[i] === "'") {
      const q = text[i];
      let j = i + 1, raw = '', esc = false;
      while (j < n) { const c = text[j]; if (esc) { raw += c; esc = false; j++; continue; } if (c === '\\') { esc = true; raw += c; j++; continue; } if (c === q) break; raw += c; j++; }
      key = evalLiteral(q + raw + q);
      out += text.slice(keyStart, j + 1);
      i = j + 1;
    } else {
      let j = i;
      while (j < n && text[j] !== ':') j++;
      key = text.slice(i, j).trim();
      out += text.slice(i, j);
      i = j;
    }
    while (i < n && /\s/.test(text[i])) out += text[i++];
    if (text[i] === ':') out += text[i++];
    while (i < n && /\s/.test(text[i])) out += text[i++];
    const c = text[i];
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1, raw = '', esc = false;
      while (j < n) { const ch = text[j]; if (esc) { raw += ch; esc = false; j++; continue; } if (ch === '\\') { esc = true; raw += ch; j++; continue; } if (ch === q) break; raw += ch; j++; }
      if (Object.prototype.hasOwnProperty.call(map, key)) out += quoteJs(map[key]);
      else out += text.slice(i, j + 1);
      i = j + 1;
    } else {
      let depth = 0, j = i, inStr = false, q2 = '', esc2 = false;
      for (; j < n; j++) {
        const ch = text[j];
        if (inStr) { if (esc2) esc2 = false; else if (ch === '\\') esc2 = true; else if (ch === q2) inStr = false; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { inStr = true; q2 = ch; continue; }
        if (ch === '{' || ch === '[' || ch === '(') depth++;
        else if (ch === '}' || ch === ']' || ch === ')') { if (depth === 0) break; depth--; }
        else if (ch === ',' && depth === 0) break;
      }
      out += text.slice(i, j);
      i = j;
    }
  }
  out += text.slice(i);
  return out;
}

/** Replace string elements of a JS array literal by index. */
function rewriteArrayValues(text, list) {
  let out = text[0];
  let i = 1;
  const n = text.length;
  let idx = 0;
  while (i < n) {
    while (i < n && /[\s,]/.test(text[i])) out += text[i++];
    if (i >= n || text[i] === ']') break;
    const c = text[i];
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1, raw = '', esc = false;
      while (j < n) { const ch = text[j]; if (esc) { raw += ch; esc = false; j++; continue; } if (ch === '\\') { esc = true; raw += ch; j++; continue; } if (ch === q) break; raw += ch; j++; }
      out += idx < list.length ? quoteJs(list[idx]) : text.slice(i, j + 1);
      idx++;
      i = j + 1;
    } else {
      let depth = 0, j = i, inStr = false, q2 = '', esc2 = false;
      for (; j < n; j++) {
        const ch = text[j];
        if (inStr) { if (esc2) esc2 = false; else if (ch === '\\') esc2 = true; else if (ch === q2) inStr = false; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { inStr = true; q2 = ch; continue; }
        if (ch === '{' || ch === '[' || ch === '(') depth++;
        else if (ch === '}' || ch === ']' || ch === ')') { if (depth === 0) break; depth--; }
        else if (ch === ',' && depth === 0) break;
      }
      out += text.slice(i, j);
      i = j;
    }
  }
  out += text.slice(i);
  return out;
}

/** {key: [zh, zhTW, en]} -> replace the English element of each array. */
function rewriteManagementLiteralPlaceholder() { /* implemented below */ }

// ------------------------------------------------------------- load data ----
const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'units', 'manifest.json'), 'utf8'));
const manualPatches = JSON.parse(fs.readFileSync(path.join(dataDir, 'manual-patches.json'), 'utf8'));
const hashesPath = path.join(dataDir, 'expected-hashes.json');
const expectedHashes = fs.existsSync(hashesPath) ? JSON.parse(fs.readFileSync(hashesPath, 'utf8')) : {};

const findFile = (pattern, subdir = assetsDir) => {
  const all = fs.readdirSync(subdir);
  const glob = (pat) => {
    const re = new RegExp('^' + pat.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return all.filter((f) => re.test(f));
  };
  let hit = glob(pattern);
  if (hit.length === 0 && !pattern.includes('*')) {
    // survive app updates: drop the content hash from the file name
    const m = /^(.*?)-[A-Za-z0-9_-]{8}(\.[a-z]+)$/.exec(pattern);
    if (m) hit = glob(`${m[1]}-*${m[2]}`);
  }
  if (hit.length !== 1) throw new Error(`шаблон ${pattern}: найдено файлов — ${hit.length}`);
  return path.join(subdir, hit[0]);
};

// group units by target file+range so several batches can share one literal
const groups = new Map();
for (const u of manifest.units) {
  const ru = JSON.parse(fs.readFileSync(path.join(dataDir, u.ru), 'utf8'));
  const en = JSON.parse(fs.readFileSync(path.join(dataDir, u.en), 'utf8'));
  const key = `${u.file}|${u.start}|${u.end}`;
  if (!groups.has(key)) groups.set(key, { file: u.file, start: u.start, end: u.end, shape: u.shape, map: null, list: null, parts: [] });
  const g = groups.get(key);
  g.parts.push(u.id);
  if (Array.isArray(en)) {
    // offsets of each array unit are identical; merge by index (single unit per array)
    g.list = ru;
    g.shape = 'array';
  } else if (u.shape === 'management') {
    g.map = Object.assign(g.map || {}, ru);
    g.shape = 'management';
  } else {
    g.map = Object.assign(g.map || {}, ru);
    if (u.shape !== 'dict-partial' && g.shape !== 'dict-partial') g.shape = 'dict';
    else g.shape = 'dict-partial';
  }
}

// --------------------------------------------------------------- patching ----
function rewriteManagementLiteral(text, map) {
  // text: {key:[zh, zhTW, en], ...}. Replace the 3rd element of every array.
  let out = text[0];
  let i = 1;
  const n = text.length;
  while (i < n) {
    while (i < n && /[\s,]/.test(text[i])) out += text[i++];
    if (i >= n || text[i] === '}') break;
    // key
    let key;
    if (text[i] === '"' || text[i] === "'") {
      const q = text[i];
      let j = i + 1, raw = '', esc = false;
      while (j < n) { const ch = text[j]; if (esc) { raw += ch; esc = false; j++; continue; } if (ch === '\\') { esc = true; raw += ch; j++; continue; } if (ch === q) break; raw += ch; j++; }
      key = evalLiteral(q + raw + q);
      out += text.slice(i, j + 1);
      i = j + 1;
    } else {
      let j = i;
      while (j < n && text[j] !== ':') j++;
      key = text.slice(i, j).trim();
      out += text.slice(i, j);
      i = j;
    }
    while (i < n && /\s/.test(text[i])) out += text[i++];
    if (text[i] === ':') out += text[i++];
    while (i < n && /\s/.test(text[i])) out += text[i++];
    if (text[i] !== '[') { // unexpected shape: copy verbatim
      let depth = 0, k = i;
      for (; k < n; k++) { if (text[k] === '[' || text[k] === '{') depth++; else if (text[k] === ']' || text[k] === '}') { if (!depth) break; depth--; } else if (text[k] === ',' && !depth) break; }
      out += text.slice(i, k);
      i = k;
      continue;
    }
    // array of values
    let k = i + 1;
    let idx = 0;
    out += '[';
    while (k < n) {
      while (k < n && /[\s,]/.test(text[k])) out += text[k++];
      if (k >= n || text[k] === ']') break;
      if (text[k] === '"' || text[k] === "'") {
        const q = text[k];
        let e = k + 1, raw = '', esc = false;
        while (e < n) { const ch = text[e]; if (esc) { raw += ch; esc = false; e++; continue; } if (ch === '\\') { esc = true; raw += ch; e++; continue; } if (ch === q) break; raw += ch; e++; }
        if (idx === 2 && Object.prototype.hasOwnProperty.call(map, key)) out += quoteJs(map[key]);
        else out += text.slice(k, e + 1);
        idx++;
        k = e + 1;
      } else {
        let depth = 0, e = k, inStr = false, q2 = '', esc2 = false;
        for (; e < n; e++) {
          const ch = text[e];
          if (inStr) { if (esc2) esc2 = false; else if (ch === '\\') esc2 = true; else if (ch === q2) inStr = false; continue; }
          if (ch === '"' || ch === "'" || ch === '`') { inStr = true; q2 = ch; continue; }
          if (ch === '{' || ch === '[' || ch === '(') depth++;
          else if (ch === '}' || ch === ']' || ch === ')') { if (!depth) break; depth--; }
          else if (ch === ',' && !depth) break;
        }
        out += text.slice(k, e);
        idx++;
        k = e;
      }
    }
    if (k < n && text[k] === ']') { out += ']'; k++; }
    i = k;
  }
  out += text.slice(i);
  return out;
}

const modified = new Map(); // absolute path -> new content
const unitEdits = new Map(); // absolute path -> [{start, end, text}]
const report = { units: 0, unitStrings: 0, literals: 0, skipped: [] };

function loadTarget(rel) {
  return modified.has(rel) ? modified.get(rel) : fs.readFileSync(rel, 'utf8');
}
function setTarget(rel, content) {
  modified.set(rel, content);
}
function addEdit(rel, start, end, text) {
  if (!unitEdits.has(rel)) unitEdits.set(rel, []);
  unitEdits.get(rel).push({ start, end, text });
}

for (const g of groups.values()) {
  const file = findFile(g.file);
  const src = loadTarget(file);
  let start = g.start, end = g.end;
  let text = src.slice(start, end);
  const firstKey = Array.isArray(g.list) ? null : Object.keys(g.map)[0];
  let anchorOk = false;
  try {
    const val = evalLiteral(text);
    if (g.shape === 'array') anchorOk = Array.isArray(val);
    else if (g.shape === 'management') anchorOk = firstKey && val && typeof val === 'object' && firstKey in val;
    else anchorOk = firstKey && val && typeof val === 'object' && firstKey in val;
  } catch { anchorOk = false; }
  if (!anchorOk) {
    // relocate by anchor (file changed after an app update)
    let probe = firstKey ? `"${firstKey}":` : JSON.stringify(Array.isArray(g.list) ? g.list[0] : '');
    let at = -1;
    if (firstKey) at = src.indexOf(probe);
    else {
      // array: locate the unit by its first english element
      const enFirst = JSON.parse(fs.readFileSync(path.join(dataDir, 'units', g.parts[0] + '.en.json'), 'utf8'))[0];
      at = src.indexOf(JSON.stringify(enFirst));
    }
    let relocated = false;
    for (let back = 0; at > 0 && back < 400000; back += 1) {
      const cand = at - back;
      const ch = src[cand];
      if (ch === '{' || ch === '[') {
        const e2 = matchBrace(src, cand);
        if (e2 > at) {
          try {
            const v = evalLiteral(src.slice(cand, e2 + 1));
            const ok = Array.isArray(v) ? Array.isArray(g.list) : (firstKey ? firstKey in v : false);
            if (ok) { start = cand; end = e2 + 1; text = src.slice(start, end); relocated = true; break; }
          } catch { /* keep looking */ }
        }
      }
    }
    if (!relocated) {
      report.skipped.push(`${g.file}: literal not found (app version changed?)`);
      continue;
    }
  }
  let next;
  if (g.shape === 'array') next = rewriteArrayValues(text, g.list);
  else if (g.shape === 'management') next = rewriteManagementLiteral(text, g.map);
  else next = rewriteObjectValues(text, g.map);
  // sanity: the rewritten literal must parse and keep the same keys
  const before = evalLiteral(text);
  const after = evalLiteral(next);
  const bk = Array.isArray(before) ? before.map((_, i) => i) : Object.keys(before);
  const ak = Array.isArray(after) ? after.map((_, i) => i) : Object.keys(after);
  if (bk.length !== ak.length || bk.some((k, i) => k !== ak[i])) {
    report.skipped.push(`${g.file}: sanity check failed`);
    continue;
  }
  addEdit(file, start, end, next);
  report.units++;
  report.unitStrings += Array.isArray(g.list) ? g.list.length : Object.keys(g.map).length;
}

// apply every unit edit of a file from the end backwards so offsets stay valid
for (const [file, list] of unitEdits) {
  let src = fs.readFileSync(file, 'utf8');
  list.sort((a, b) => b.start - a.start);
  for (const e of list) src = src.slice(0, e.start) + e.text + src.slice(e.end);
  modified.set(file, src);
}

for (const p of manualPatches) {
  const file = 'subdir' in p ? path.join(webDir, p.subdir, p.file) : findFile(p.file);
  if (!fs.existsSync(file)) { report.skipped.push(`${p.file}: no such file`); continue; }
  const src = loadTarget(file);
  const count = src.split(p.find).length - 1;
  if (count === 0) { report.skipped.push(`${p.file}: pattern not found (${p.note || ''})`); continue; }
  if (count > 1 && p.mode !== 'all') { report.skipped.push(`${p.file}: pattern is not unique (${count}) — ${p.note || ''}`); continue; }
  setTarget(file, src.split(p.find).join(p.replace));
  report.literals += count;
}

// ------------------------------------------------------------------ output ---
const files = [...modified.keys()];
if (dryRun) {
  console.log(`[пробный запуск] будет изменено файлов: ${files.length}`);
  for (const f of files) console.log('  ' + f);
} else if (cmd === 'apply') {
  const backupRoot = path.join(dataDir, 'backup', sha256(appDir).slice(0, 12));
  fs.mkdirSync(backupRoot, { recursive: true });
  const meta = { appDir, when: new Date().toISOString(), files: [] };
  for (const f of files) {
    const rel = path.relative(appDir, f);
    const dest = path.join(backupRoot, rel);
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(f, dest);
    }
    const oldHash = sha256(fs.readFileSync(dest));
    meta.files.push({ rel, hash: oldHash });
    fs.writeFileSync(f, modified.get(f));
  }
  fs.writeFileSync(path.join(backupRoot, 'meta.json'), JSON.stringify(meta, null, 1));
  console.log(`Готово: изменено файлов — ${files.length}. Резервная копия: ${backupRoot}`);
} else if (cmd === 'check') {
  console.log(`Папка приложения: ${appDir}`);
  for (const f of files) {
    const rel = path.relative(appDir, f);
    const cur = fs.readFileSync(f);
    const exp = expectedHashes[path.basename(f)];
    const state = !exp ? 'неизвестно' : (sha256(cur) === exp ? 'оригинал' : 'изменён');
    console.log(`  ${state.padEnd(9)} ${rel}`);
  }
}

if (cmd !== 'restore') {
  console.log(`Словарей заменено: ${report.units}, строк переведено: ${report.unitStrings}, точечных правок: ${report.literals}`);
  if (report.skipped.length) {
    console.log('Пропущено:');
    for (const s of report.skipped) console.log('  - ' + s);
  }
}

