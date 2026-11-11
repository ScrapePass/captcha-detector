#!/usr/bin/env node
'use strict';
const { readFileSync, existsSync } = require('node:fs');
const CaptchaDetector = require('../dist/captcha-detector.js');

const HELP = `captcha-detector ${CaptchaDetector.VERSION} — does this page have a captcha?

Usage
  captcha-detector <url | file.html | ->  [options]

Options
  --browser        open the page in a real browser (needs: npm i playwright) and check the live page,
                   its frames and what its scripts added. Without it the raw HTML is fetched and checked.
  --headful        show the browser window (with --browser)
  --wait <ms>      wait after the page loads, with --browser (default 3000)
  --json           print the full result as JSON
  --fail           exit with code 1 when a captcha is found (for CI and shell scripts)
  --min <0..1>     minimum confidence (default 0.5)
  -h, --help       show this help

Examples
  captcha-detector https://www.google.com/recaptcha/api2/demo
  captcha-detector https://example.com --browser --json
  curl -s https://example.com | captcha-detector -
`;

function parseArgs(argv) {
  const a = { input: null, browser: false, headful: false, wait: 3000, json: false, fail: false, min: undefined };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '-h' || v === '--help') a.help = true;
    else if (v === '--browser') a.browser = true;
    else if (v === '--headful') a.headful = true;
    else if (v === '--json') a.json = true;
    else if (v === '--fail') a.fail = true;
    else if (v === '--wait') a.wait = Number(argv[++i]);
    else if (v === '--min') a.min = Number(argv[++i]);
    else if (!a.input) a.input = v;
    else throw new Error('Unexpected argument: ' + v);
  }
  return a;
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function fromUrl(url, a) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'en-US,en;q=0.9' },
  });
  const html = await res.text();
  return CaptchaDetector.detectHtml(html, { url: res.url, status: res.status, headers: res.headers, minConfidence: a.min });
}

async function fromBrowser(url, a) {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (_) {
    try {
      ({ chromium } = require('playwright-core'));
    } catch (_) {
      throw new Error('--browser needs Playwright: npm i -D playwright && npx playwright install chromium');
    }
  }
  const { detectInPage } = require('../lib/page.cjs');
  const browser = await chromium.launch({ headless: !a.headful });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
    if (a.wait > 0) await page.waitForTimeout(a.wait);
    return await detectInPage(page, { response, minConfidence: a.min });
  } finally {
    await browser.close();
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function print(r) {
  const tty = process.stdout.isTTY;
  const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
  const head = r.captcha ? c('33;1', '⚠ Captcha found') : r.blocked ? c('31;1', '⛔ Blocked') : c('32;1', '✓ No captcha found');
  console.log(`${head}${r.url ? '  ' + c('2', r.url) : ''}`);
  if (r.captcha) console.log(c('2', `  visible: ${r.visible === null ? 'unknown (static HTML)' : r.visible}   challenge page: ${r.challengePage}`));
  for (const d of r.detections) {
    const bits = [d.vendor, d.kind + (d.subtype ? `/${d.subtype}` : ''), d.visible === true ? 'visible' : d.visible === false ? 'not visible' : null, Math.round(d.confidence * 100) + '%'].filter(Boolean);
    console.log(`  • ${c('1', d.name)} ${c('2', '— ' + bits.join(' · '))}`);
    for (const e of d.evidence.slice(0, 4)) console.log(c('2', `      ${e.type}: ${e.value}${e.frame ? ' (in frame)' : ''}`));
  }
}

(async () => {
  let a;
  try {
    a = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message + '\n\n' + HELP);
    process.exit(2);
  }
  if (a.help || !a.input) {
    console.log(HELP);
    process.exit(a.help ? 0 : 2);
  }
  let result;
  try {
    if (a.input === '-') result = await CaptchaDetector.detectResponse(await readStdin(), { minConfidence: a.min });
    else if (/^https?:\/\//i.test(a.input)) result = a.browser ? await fromBrowser(a.input, a) : await fromUrl(a.input, a);
    else if (existsSync(a.input)) result = await CaptchaDetector.detectResponse(readFileSync(a.input, 'utf8'), { minConfidence: a.min });
    else if (/^[\w-]+(\.[\w-]+)+/.test(a.input)) {
      const url = 'https://' + a.input;
      result = a.browser ? await fromBrowser(url, a) : await fromUrl(url, a);
    } else throw new Error('Not a URL or a file: ' + a.input);
  } catch (e) {
    console.error('captcha-detector: ' + (e && e.message ? e.message : e));
    process.exit(2);
  }
  if (a.json) console.log(JSON.stringify(result, null, 2));
  else print(result);
  process.exit(a.fail && result.captcha ? 1 : 0);
})();
