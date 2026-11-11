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

// Python package (github.com/ScrapePass/captcha-detector-python, cloned next to this repo, or CAPTCHA_DETECTOR_PYTHON):
// the same signature database as JSON, the browser build for the Selenium/Playwright helpers, and parity fixtures
// (every test page with the JS result) so the Python port is checked against this engine.
const pyRoot = process.env.CAPTCHA_DETECTOR_PYTHON || join(root, '../captcha-detector-python');
const py = join(pyRoot, 'src/captcha_detector');
if (existsSync(py)) {
  const { SIGNATURES } = await import(join(root, 'src/signatures.js') + `?t=${Date.now()}`);
  const re = (r) => ({ re: r.source, flags: r.flags });
  const entry = (type, e) => {
    if (type === 'globals') return undefined; // browser only: the Python engine checks HTML
    if (type === 'status') return e;
    if (type === 'headers') return { name: e[0], ...re(e[1]), w: e[2] };
    if (type === 'elements') {
      if (typeof e === 'string') return { sel: e };
      if (Array.isArray(e)) return { sel: e[0], w: e[1] };
      return { sel: e.sel, attr: e.attr, ...re(e.re), w: e.w };
    }
    if (type === 'cookies') {
      const [p, w] = Array.isArray(e) ? e : [e];
      return p instanceof RegExp ? { ...re(p), w } : { name: p, w };
    }
    const [p, w, any] = Array.isArray(e) ? e : [e];
    return { ...re(p), w, any: any === 'any' || undefined };
  };
  const types = ['scripts', 'frames', 'elements', 'inline', 'urls', 'title', 'text', 'cookies', 'headers', 'status'];
  const sigs = SIGNATURES.map((s) => {
    const o = { id: s.id, name: s.name, vendor: s.vendor || null, kind: s.kind, subtype: s.subtype || null, site: s.site || null, generic: !!s.generic, refine: !!s.refine };
    for (const t of types) if (s[t]) o[t] = s[t].map((e) => entry(t, e));
    return o;
  });
  writeFileSync(join(py, 'signatures.json'), JSON.stringify({ version: pkg.version, signatures: sigs }, null, 1) + '\n');
  writeFileSync(join(py, 'captcha-detector.js'), umd);

  const C = (await import(join(root, 'dist/captcha-detector.mjs') + `?t=${Date.now()}`)).default;
  const { CASES } = await import(join(root, 'test/cases.mjs'));
  const pages = CASES.map((c) => ({ name: c.name, html: c.html, opts: c.opts || {} }));
  const extra = [
    { name: 'min confidence', html: '<div class="captcha-wrap"></div><img src="/captcha.png">', opts: { minConfidence: 0.9 } },
    { name: 'base href and relative script', html: '<base href="https://cdn.example/a/"><script src="../recaptcha/x.js"></script><script src="//www.google.com/recaptcha/api.js"></script><div class="g-recaptcha"></div>', opts: { url: 'https://shop.example/p?q=1' } },
    { name: 'entities and comments', html: '<!-- <div class="h-captcha"></div> --><title>Just a moment&hellip;</title><p>Checking if the site connection is secure&#x2e; &amp; more&nbsp;text</p><div id="challenge-form"></div>', opts: {} },
    { name: 'cookies array', html: '<p>hi</p>', opts: { cookies: ['_px3=abc', { name: '_pxhd' }], headers: [['Set-Cookie', 'datadome=1; Path=/'], ['X-DataDome', 'protected']] } },
    { name: 'cookies object', html: '<p>hi</p>', opts: { cookies: { incap_ses_123: 'x', reese84: 'y' } } },
    { name: 'empty', html: '', opts: {} },
    { name: 'broken', html: '<div class="g-recaptcha', opts: {} },
    { name: 'attr selectors', html: '<iframe title="Widget containing ARKOSE challenge" src="/x"></iframe><input type="hidden" name="captcha_answer"><input name="captcha_answer2" placeholder="Captcha text">', opts: {} },
  ];
  const fixtures = pages.concat(extra).map((p) => ({ ...p, result: C.detectHtml(p.html, p.opts) }));
  const responses = [
    { name: 'json wrapped', input: { success: true, result: { status_code: 403, url: 'https://shop.example/p/1', content: CASES[0].html } }, opts: {} },
    { name: 'json string', input: JSON.stringify({ body: CASES[1].html }), opts: { url: 'https://a.example/' } },
    { name: 'html string', input: CASES[2].html, opts: {} },
    { name: 'plain json', input: { items: [1, 2, 3], next: null }, opts: {} },
    { name: 'axios-like', input: { data: { html: CASES[3].html }, status: 200, headers: { server: 'cloudflare' } }, opts: {} },
  ];
  for (const r of responses) r.result = await C.detectResponse(r.input, r.opts);
  mkdirSync(join(pyRoot, 'tests'), { recursive: true });
  writeFileSync(join(pyRoot, 'tests/fixtures.json'), JSON.stringify({ version: pkg.version, pages: fixtures, responses }) + '\n');
  console.log(`python (${pyRoot}): signatures.json (${sigs.length}), captcha-detector.js, tests/fixtures.json (${fixtures.length} pages)`);
}

console.log(`built dist/captcha-detector.js (${(umd.length / 1024).toFixed(1)} KB) and dist/captcha-detector.mjs`);
