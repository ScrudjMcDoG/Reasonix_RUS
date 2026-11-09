// Search a binary file for ASCII/UTF-16 occurrences of a needle and print context.
import fs from 'node:fs';
const [file, needle, ctxStr] = process.argv.slice(2);
const ctx = Number(ctxStr || 120);
const buf = fs.readFileSync(file);
const hits = [];
const nb = Buffer.from(needle, 'utf8');
const nu = Buffer.from(needle, 'utf16le');
for (const [pat, enc] of [[nb, 'utf8'], [nu, 'utf16le']]) {
  let i = 0;
  while ((i = buf.indexOf(pat, i)) !== -1) { hits.push({ off: i, enc }); i += pat.length; }
}
hits.sort((a, b) => a.off - b.off);
console.log('hits:', hits.length);
for (const h of hits.slice(0, 40)) {
  const s = Math.max(0, h.off - ctx), e = Math.min(buf.length, h.off + ctx);
  const slice = buf.slice(s, e);
  const text = h.enc === 'utf8'
    ? slice.toString('latin1').replace(/[^\x20-\x7e]/g, '.')
    : slice.toString('utf16le').replace(/[^\x20-\x7e\u0400-\u04ff]/g, '.');
  console.log(`@${h.off} [${h.enc}] ...${text}...`);
}
