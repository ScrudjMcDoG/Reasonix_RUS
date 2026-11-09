// Audit the tracked files for personal environment traces: absolute paths, the local
// user name, local addresses, tokens, mail addresses and file-scheme links.
//
//   git ls-files > filelist.txt
//   node tools/audit-env.mjs filelist.txt
//
// Exit code 1 means something personal leaked into the repository.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const listFile = process.argv[2];
if (!listFile) { console.error('usage: audit-env.mjs <filelist.txt>'); process.exit(2); }
const files = fs.readFileSync(listFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);

const user = (() => {
  try { return os.userInfo().username; } catch { return ''; }
})();
const home = (() => {
  const p = process.env.USERPROFILE || process.env.HOME || '';
  return p ? path.basename(p) : '';
})();

const checks = [
  ['windows-абсолютный-путь', /[A-Za-z]:\\\\(?:Users|Program|Windows|temp|tmp)\\\\/i],
  ['путь-в-профиль', /\\\\Users\\\\[^\\\s"']+/i],
  ['локальный-URL', /https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0|[0-9]{1,3}(?:\.[0-9]{1,3}){3})(?::\d+)?/i],
  ['приватная-сеть', /\b(?:192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)\b/],
  ['file-URL', /file:\/\//i],
  ['почта', /[\w.+-]+@(?!users\.noreply\.github\.com)[\w-]+\.[a-z]{2,}/i],
  ['токен', /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/],
  ['имя-машины', /\b(?:DESKTOP|LAPTOP)-[A-Z0-9]{5,}\b/],
  ['домашний-каталог-unix', /\/home\/[a-z][\w.-]*/i],
];
// имя локального пользователя проверяем отдельно: оно не должно встречаться нигде
if (user.length >= 4) checks.push(['имя-пользователя', new RegExp(`\\b${user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')]);
if (home.length >= 4 && home.toLowerCase() !== user.toLowerCase()) {
  checks.push(['имя-домашнего-каталога', new RegExp(`\\b${home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')]);
}

// Строки, пришедшие из самого приложения (примеры в интерфейсе), а не из окружения.
const allow = [
  { file: /^ru\/units\/base\.(en|ru)\.json$/, pattern: /\b192\.168\.1\.100\b/, why: 'пример IP из интерфейса Reasonix' },
];

const findings = [];
for (const f of files) {
  let text;
  try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
  if (text.includes('\u0000')) continue; // binary
  text.split('\n').forEach((line, i) => {
    for (const [name, re] of checks) {
      const m = re.exec(line);
      if (!m) continue;
      if (allow.some((a) => a.file.test(f) && a.pattern.test(m[0]))) continue;
      findings.push({ file: f, line: i + 1, kind: name, hit: m[0], ctx: line.trim().slice(0, 150) });
    }
  });
}

console.log(`проверено файлов: ${files.length}`);
if (!findings.length) {
  console.log('Следов домашнего окружения и локальных ссылок не найдено ✓');
  process.exit(0);
}
const byKind = {};
for (const f of findings) (byKind[f.kind] ||= []).push(f);
for (const [kind, list] of Object.entries(byKind)) {
  console.log(`\n### ${kind}: ${list.length}`);
  for (const f of list.slice(0, 40)) console.log(`  ${f.file}:${f.line}  ${f.hit}\n      ${f.ctx}`);
  if (list.length > 40) console.log(`  … ещё ${list.length - 40}`);
}
console.log(`\nвсего находок: ${findings.length}`);
process.exit(1);
