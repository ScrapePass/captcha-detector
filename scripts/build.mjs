// Bundles src/ into dist/captcha-detector.js (UMD: <script>, require, page.evaluate) and dist/captcha-detector.mjs (ESM).
// No dependencies. Also refreshes the provider table in README.md from the signatures.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const strip = (src) =>
  src
    .replace(/^import [^\n]*;\n/gm, '')
    .replace(/^export \{[^}]*\};?\n/gm, '')
    .replace(/^export (async function|const|function|let|class) /gm, '$1 ');

const body = [readFileSync(join(root, 'src/signatures.js'), 'utf8'), readFileSync(join(root, 'src/engine.js'), 'utf8')].map(strip).join('\n');
if (!body.includes(`VERSION = '${pkg.version}'`)) throw new Error(`src/engine.js VERSION does not match package.json ${pkg.version}`);

const api = '{ VERSION, detect, detectHtml, detectResponse, analyze, mergeResults, snapshotFromDom, snapshotFromHtml, signatures: SIGNATURES }';
const banner = `/*! captcha-detector v${pkg.version} | MIT License | ${pkg.homepage} */\n`;

const umd = `${banner}(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.CaptchaDetector = factory();
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
'use strict';
${body}
return ${api};
});
`;

const esm = `${banner}${body}
const CaptchaDetector = ${api};
export { VERSION, detect, detectHtml, detectResponse, analyze, mergeResults, snapshotFromDom, snapshotFromHtml, SIGNATURES as signatures };
export default CaptchaDetector;
`;

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/captcha-detector.js'), umd);
writeFileSync(join(root, 'dist/captcha-detector.mjs'), esm);

// Provider table in the README.
const readme = join(root, 'README.md');
if (existsSync(readme)) {
  const { SIGNATURES } = await import(join(root, 'src/signatures.js') + `?t=${Date.now()}`);
  const kindLabel = {
    widget: 'Widget',
    invisible: 'Invisible',
    image: 'Image text',
    question: 'Question',
    'challenge-page': 'Challenge page',
    'block-page': 'Block page',
    protection: 'Bot protection',
  };
  const rows = SIGNATURES.filter((s) => !s.generic).map((s) => {
    const name = s.site ? `[${s.name}](${s.site})` : s.name;
    return `| ${name} | ${s.vendor || ''} | ${kindLabel[s.kind] || s.kind}${s.subtype ? ` (${s.subtype})` : ''} | \`${s.id}\` |`;
  });
  const generic = SIGNATURES.filter((s) => s.generic).map((s) => `| ${s.name} | any | ${kindLabel[s.kind]}${s.subtype ? ` (${s.subtype})` : ''} | \`${s.id}\` |`);
  const table = ['| Product | Vendor | Kind (default) | id |', '|---|---|---|---|', ...rows, ...generic].join('\n');
  const text = readFileSync(readme, 'utf8');
  const next = text.replace(/(<!-- providers:start -->)[\s\S]*?(<!-- providers:end -->)/, `$1\n${table}\n$2`).replace(/(<!-- count -->)\d+(<!-- \/count -->)/, `$1${rows.length}$2`);
  if (next !== text) writeFileSync(readme, next);
}

console.log(`built dist/captcha-detector.js (${(umd.length / 1024).toFixed(1)} KB) and dist/captcha-detector.mjs`);
