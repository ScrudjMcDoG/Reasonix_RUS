// Classify residual English literals by how they are used (console vs user-visible).
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const targets = process.argv.slice(3);
for (const pat of targets) {
  const file = fs.readdirSync(dir).find((f) => f.startsWith(pat));
  const src = fs.readFileSync(path.join(dir, file), 'utf8');
  const ms = [...src.matchAll(/"([A-Z][a-z]+(?: [a-z][a-z]+){2,}[.!?]?)"/g)];
  const uniq = new Map();
  for (const m of ms) if (!uniq.has(m[1])) uniq.set(m[1], m.index);
  console.log(`\n######## ${file} (${uniq.size} unique)`);
  for (const [text, at] of uniq) {
    const pre = src.slice(Math.max(0, at - 90), at);
    const kind = /console\.(warn|error|log|info)\($/.test(pre) ? 'console'
      : /throw new Error\($/.test(pre) ? 'throw'
      : /new Error\($/.test(pre) ? 'error'
      : 'other';
    console.log(`  [${kind}] ${text}`);
    if (kind === 'other') console.log(`        ...${src.slice(Math.max(0, at - 120), at + text.length + 40).replace(/\s+/g, ' ')}`);
  }
}
