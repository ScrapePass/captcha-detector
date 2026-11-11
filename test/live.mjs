// Live check against real captcha demo pages and ordinary sites (needs network and Playwright).
//   npm run test:live            all
//   node test/live.mjs recaptcha  only URLs/ids containing "recaptcha"
// Results depend on the sites: a demo can change, and a normal site can start showing a bot check to a headless browser.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { detectInPage } = require('../lib/page.cjs');
const CaptchaDetector = require('../dist/captcha-detector.js');

// [url, expected id | null for "no captcha", note]
const SITES = [
  ['https://www.google.com/recaptcha/api2/demo', 'recaptcha'],
  ['https://2captcha.com/demo/recaptcha-v2', 'recaptcha'],
  ['https://2captcha.com/demo/recaptcha-v2-invisible', 'recaptcha'],
  ['https://2captcha.com/demo/recaptcha-v2-enterprise', 'recaptcha'],
  ['https://2captcha.com/demo/recaptcha-v3', 'recaptcha'],
  ['https://2captcha.com/demo/recaptcha-v3-enterprise', 'recaptcha'],
  ['https://democaptcha.com/demo-form-eng/hcaptcha.html', 'hcaptcha'],
  ['https://democaptcha.com/demo-form-eng/recaptcha-2.html', 'recaptcha'],
  ['https://democaptcha.com/demo-form-eng/turnstile.html', 'turnstile'],
  ['https://democaptcha.com/demo-form-eng/turnstile-invisible.html', 'turnstile'],
  ['https://democaptcha.com/demo-form-eng/image.html', '*'],
  ['https://democaptcha.com/demo-form-eng/math-image.html', '*'],
  ['https://2captcha.com/demo/cloudflare-turnstile', 'turnstile'],
  ['https://2captcha.com/demo/geetest', 'geetest'],
  ['https://2captcha.com/demo/geetest-v4', 'geetest'],
  ['https://2captcha.com/demo/keycaptcha', 'keycaptcha'],
  ['https://2captcha.com/demo/lemin', 'lemin'],
  ['https://2captcha.com/demo/mtcaptcha', 'mtcaptcha'],
  ['https://2captcha.com/demo/solvemedia', 'solvemedia'],
  ['https://2captcha.com/demo/normal', 'generic-image-captcha'],
  ['https://2captcha.com/demo/rotatecaptcha', '*'],
  ['https://2captcha.com/demo/clickcaptcha', '*'],
  ['https://2captcha.com/demo/text', 'generic-question'],
  ['https://2captcha.com/demo/normal', '!generic-question'],
  // Ordinary pages: no captcha expected.
  ['https://example.com/', null],
  ['https://en.wikipedia.org/wiki/CAPTCHA', null, 'an article about captchas, with captcha images'],
  ['https://en.wikipedia.org/wiki/ReCAPTCHA', null],
  ['https://developer.mozilla.org/en-US/', null],
  ['https://news.ycombinator.com/', null],
  ['https://github.com/', null],
  ['https://www.python.org/', null],
  ['https://www.bbc.com/', null],
];

const filter = process.argv[2];
const list = SITES.filter(([u, id]) => !filter || u.includes(filter) || (id && id.includes(filter)));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
let pass = 0;
let fail = 0;
for (const [url, want, note] of list) {
  const page = await context.newPage();
  let line;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3500);
    const r = await detectInPage(page, { response });
    const html = CaptchaDetector.detectHtml(await response.text().catch(() => ''), { url, status: response.status(), headers: await response.allHeaders() });
    const ids = r.detections.filter((d) => d.kind !== 'protection').map((d) => d.id);
    const ok = want === null ? !r.captcha : want === '*' ? r.captcha : want[0] === '!' ? r.captcha && !ids.includes(want.slice(1)) : ids.includes(want);
    ok ? pass++ : fail++;
    line = `${ok ? '✓' : '✗'} ${url}\n    browser: ${r.summary}\n    html:    ${html.summary}${note ? `\n    (${note})` : ''}`;
  } catch (e) {
    fail++;
    line = `✗ ${url}\n    error: ${e.message.split('\n')[0]}`;
  }
  console.log(line);
  await page.close();
}
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
