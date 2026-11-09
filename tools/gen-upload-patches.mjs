// Add literal patches discovered during the v1.39.11 sweep.
import fs from 'node:fs';

const file = 'ru/manual-patches.json';
const patches = JSON.parse(fs.readFileSync(file, 'utf8'));
const extra = [
  ['attachmentSubmit-*.js', 'new Error("File upload returned no attachment path")', 'new Error("Загрузка файла не вернула путь к вложению")'],
  ['attachmentSubmit-*.js', 'throw new Error(`File upload failed (${o.status})`)', 'throw new Error(`Не удалось загрузить файл (${o.status})`)'],
];
let added = 0;
for (const [pattern, find, replace] of extra) {
  if (patches.some((p) => p.file === pattern && p.find === find)) continue;
  patches.push({ file: pattern, find, replace, note: 'residual literal (v1.39.11 sweep)' });
  added++;
}
fs.writeFileSync(file, JSON.stringify(patches, null, 1) + '\n');
console.log('добавлено патчей:', added, '| всего:', patches.length);
