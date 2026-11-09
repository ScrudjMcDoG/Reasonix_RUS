// Extract one entry (or all) from an Electron asar archive.
import fs from 'node:fs';
import path from 'node:path';
const file = process.argv[2];
const list = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const outDir = process.argv[4];
const only = process.argv[5];
const fd = fs.openSync(file, 'r');
for (const e of list.entries) {
  if (only && !e.path.includes(only)) continue;
  const buf = Buffer.alloc(e.size);
  fs.readSync(fd, buf, 0, e.size, list.dataOffset + Number(e.offset));
  const dest = path.join(outDir, e.path.replace(/^\//, ''));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log('wrote', dest, e.size);
}
