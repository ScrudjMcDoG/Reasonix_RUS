// Show the code context of specific English literals so exact patches can be written.
import fs from 'node:fs';
import path from 'node:path';
import { webDir } from './appdir.mjs';

const APP = webDir(process.argv[2]);
const targets = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
for (const [filePat, strings] of Object.entries(targets)) {
  const dir = path.join(APP, 'assets');
  const file = fs.readdirSync(dir).find((f) => f.startsWith(filePat));
  const src = fs.readFileSync(path.join(dir, file), 'utf8');
  console.log(`\n######## ${file}`);
  for (const s of strings) {
    const i = src.indexOf(s);
    if (i < 0) { console.log(`  !! not found: ${s}`); continue; }
    const a = Math.max(0, i - 150);
    console.log(`  @${i} ...${src.slice(a, i + s.length + 120).replace(/\s+/g, ' ')}...`);
  }
}
