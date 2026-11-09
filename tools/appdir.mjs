// Resolve the Reasonix installation directory without hardcoding user paths.
//
//   node tools/<tool>.mjs                      -> активная версия из current.json
//   node tools/<tool>.mjs "...\versions\vX.Y.Z\app"
//   node tools/<tool>.mjs "...\versions\vX.Y.Z\app\resources\app"
import fs from 'node:fs';
import path from 'node:path';

const LAUNCHER = () => path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Reasonix');

/** Version directory: the one that contains `resources/app` (…\versions\vX.Y.Z\app). */
export function appDir(arg) {
  if (arg) {
    const abs = path.resolve(arg);
    if (fs.existsSync(path.join(abs, 'resources', 'app', 'assets'))) return abs;
    const up = path.dirname(path.dirname(abs));
    if (fs.existsSync(path.join(up, 'resources', 'app', 'assets'))) return up;
    throw new Error(
      `${abs}: не найдены resources/app/assets.\n` +
      'Укажите папку версии Reasonix, например "...\\versions\\vX.Y.Z\\app".',
    );
  }
  const base = LAUNCHER();
  const current = path.join(base, 'current.json');
  if (fs.existsSync(current)) {
    const info = JSON.parse(fs.readFileSync(current, 'utf8'));
    for (const candidate of [path.join(base, info.activeDir, 'app'), path.join(base, info.activeDir)]) {
      if (fs.existsSync(path.join(candidate, 'resources', 'app', 'assets'))) return candidate;
    }
  }
  throw new Error(
    'Не найдена установленная версия Reasonix.\n' +
    'Передайте путь: node tools/<tool>.mjs "...\\versions\\vX.Y.Z\\app"',
  );
}

/** Web application directory (…\resources\app) with assets/ and index.html. */
export function webDir(arg) {
  return path.join(appDir(arg), 'resources', 'app');
}
