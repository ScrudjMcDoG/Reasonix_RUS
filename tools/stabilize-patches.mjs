// Make a few literal patches independent of minified variable names, so they keep
// matching after bundler renames (found by the v1.39.11 update: `Z(` became `Y(`).
import fs from 'node:fs';

const file = 'ru/manual-patches.json';
const patches = JSON.parse(fs.readFileSync(file, 'utf8'));

const renames = [
  ['Z(i.idempotent?"Already applied":"Task updated")', 'i.idempotent?"Already applied":"Task updated"', 'i.idempotent?"Уже применено":"Задача обновлена"'],
  ['"aria-label":R?"Collapse tasks":"Expand tasks"', '?"Collapse tasks":"Expand tasks"', '?"Свернуть задачи":"Развернуть задачи"'],
  ['F[a]??"Browser"', '??"Browser"', '??"Браузер"'],
];

let changed = 0;
for (const [oldFind, newFind, newReplace] of renames) {
  const p = patches.find((x) => x.find === oldFind);
  if (!p) { console.log('не найден патч:', oldFind); continue; }
  p.find = newFind;
  p.replace = newReplace;
  p.note = (p.note || '') + ' (без служебных имён)';
  changed++;
}
fs.writeFileSync(file, JSON.stringify(patches, null, 1) + '\n');
console.log('обновлено патчей:', changed);
