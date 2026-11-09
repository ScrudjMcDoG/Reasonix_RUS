// Publish a GitHub Release with the ready-to-use rusifier archive.
//
//   $env:GH_TOKEN = "<token>"
//   node tools/publish-release.mjs --zip dist\Reasonix_RUS-v1.39.11.zip --tag v1.39.11
//
// Creates the release (or updates an existing one), replaces the asset of the same name
// and prints the public URL. Requires a token with `repo` scope.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const OWNER = arg('owner', 'ScrudjMcDoG');
const REPO = arg('repo', 'Reasonix_RUS');
const tag = arg('tag');
const zipPath = arg('zip');
const token = process.env.GH_TOKEN || process.env.GH_RU_TOKEN;
if (!tag || !zipPath) { console.error('usage: publish-release.mjs --tag vX.Y.Z --zip <path>'); process.exit(2); }
if (!token) { console.error('GH_TOKEN не задан'); process.exit(2); }

const root = path.join(import.meta.dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'ru', 'version.json'), 'utf8'));
const zip = path.resolve(root, zipPath);
if (!fs.existsSync(zip)) { console.error('нет файла ' + zip); process.exit(2); }
const buf = fs.readFileSync(zip);
const sha = crypto.createHash('sha256').update(buf).digest('hex');
const assetName = path.basename(zip);
const kb = (buf.length / 1024).toFixed(1);

const body = `Русификатор интерфейса **Reasonix ${version.appVersionDir}** — ${version.strings} строк
в ${version.files} файлах сборки.

## Скачать и установить

1. Скачайте \`${assetName}\` ниже и распакуйте в любую папку.
2. Полностью закройте Reasonix (включая значок в трее).
3. Запустите \`Применить русификатор.cmd\` (двойной клик). Скрипт сам найдёт активную
   версию Reasonix по \`current.json\`.
4. Запустите Reasonix — интерфейс на русском.

Нужен только **Node.js 18+** (https://nodejs.org). Администратор не требуется.

## Откат

\`Откатить русификатор.cmd\` возвращает все ${version.files} файлов к оригиналу — побайтово,
из резервной копии, которая создаётся при установке. Состояние показывает
\`Проверить состояние.cmd\`.

## Что внутри

- \`tools/russianize.mjs\` — патчер: apply / restore / check, резервные копии, проверка хэшей;
- \`ru/\` — данные локализации: ${version.units} словарей (en/ru), манифест,
  шаблоны точечных правок, контрольные хэши оригинальных файлов сборки;
- \`tools/reextract.mjs\`, \`tools/update-translations.mjs\`, \`tools/promote-update.mjs\` —
  перенос локализации на следующую версию Reasonix с переиспользованием переводов;
- \`README.md\` — подробности, ограничения и порядок переноса.

Исполняемых файлов Reasonix, \`app.asar\`, настроек и данных сессий в архиве нет:
меняются только текстовые JS-файлы веб-слоя и \`index.html\`.

## Как это работает

Reasonix поддерживает только \`en\`/\`zh\`/\`zh-TW\`, поэтому русский занимает слот английского:
режим «Авто» и пункт **«Русский»** в настройках дают русский интерфейс, китайская локализация
продолжает работать. CLI/TUI (\`reasonix-cli.exe\`) остаётся английским — его строки
вкомпилированы в бинарник.

## Проверка

\`\`\`
apply → verify (синтаксис модулей, целостность словарей, рантайм-i18n) → restore
\`\`\`

Контрольная сумма архива (SHA-256):

\`\`\`
${sha}
\`\`\`

Состав архива: ${kb} КБ, ${version.files} патчируемых файлов, ${version.strings} строк перевода.
`;

const api = async (method, apiPath, json) => {
  const res = await fetch('https://api.github.com' + apiPath, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'reasonix-rus-release',
      'Content-Type': 'application/json',
    },
    body: json ? JSON.stringify(json) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* empty */ }
  return { status: res.status, json: parsed };
};

let release = (await api('GET', `/repos/${OWNER}/${REPO}/releases/tags/${encodeURIComponent(tag)}`)).json;
if (release && release.id) {
  console.log('релиз уже существует:', release.html_url);
  const updated = await api('PATCH', `/repos/${OWNER}/${REPO}/releases/${release.id}`, {
    name: `Русификатор для Reasonix ${version.appVersionDir}`,
    body,
    draft: false,
    prerelease: false,
  });
  if (updated.status !== 200) { console.error('не удалось обновить релиз:', updated.status, updated.json?.message); process.exit(1); }
  release = updated.json;
} else {
  const created = await api('POST', `/repos/${OWNER}/${REPO}/releases`, {
    tag_name: tag,
    target_commitish: 'main',
    name: `Русификатор для Reasonix ${version.appVersionDir}`,
    body,
    draft: false,
    prerelease: false,
  });
  if (created.status !== 201) { console.error('не удалось создать релиз:', created.status, created.json?.message); process.exit(1); }
  release = created.json;
  console.log('релиз создан:', release.html_url);
}

// replace an asset with the same name
const assets = (await api('GET', `/repos/${OWNER}/${REPO}/releases/${release.id}/assets`)).json || [];
for (const a of assets.filter((x) => x.name === assetName)) {
  await api('DELETE', `/repos/${OWNER}/${REPO}/releases/assets/${a.id}`);
  console.log('старый ассет удалён:', a.name);
}

const upload = await fetch(
  `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/zip',
      'Content-Length': String(buf.length),
      'User-Agent': 'reasonix-rus-release',
    },
    body: buf,
  },
);
const uploaded = await upload.json().catch(() => null);
if (upload.status !== 201) {
  console.error('не удалось загрузить ассет:', upload.status, uploaded?.message);
  process.exit(1);
}
console.log(`ассет загружен: ${uploaded.name} (${(uploaded.size / 1024).toFixed(1)} КБ)`);
console.log('скачать:', uploaded.browser_download_url);
console.log('релиз:', release.html_url);
