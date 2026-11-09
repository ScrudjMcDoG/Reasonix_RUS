// List entries inside an Electron asar archive.
import fs from 'node:fs';
const file = process.argv[2];
const fd = fs.openSync(file, 'r');
const size = fs.fstatSync(fd).size;
// header: pickle
const head = Buffer.alloc(32);
fs.readSync(fd, head, 0, 32, 0);
const headerSize = head.readUInt32LE(4); // payload size of header pickle
const jsonLen = head.readUInt32LE(12);
const jsonStart = 16;
const json = Buffer.alloc(jsonLen);
fs.readSync(fd, json, 0, jsonLen, jsonStart);
const dataOffset = 8 + headerSize;
const tree = JSON.parse(json.toString('utf8'));
const out = [];
(function walk(node, prefix) {
  for (const [name, v] of Object.entries(node.files || {})) {
    const p = prefix + '/' + name;
    if (v.files) walk(v, p);
    else out.push({ path: p, size: v.size, offset: v.offset });
  }
})(tree, '');
out.sort((a, b) => b.size - a.size);
console.log('total files:', out.length, 'headerSize:', headerSize);
for (const e of out.slice(0, 80)) console.log(String(e.size).padStart(9), e.path);
fs.writeFileSync(process.argv[3] || 'asar-list.json', JSON.stringify({ dataOffset, headerSize, jsonLen, entries: out }, null, 1));
