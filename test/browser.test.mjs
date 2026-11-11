// Runs the detector in a real Chromium (Playwright) on the same test pages, plus visibility, shadow DOM and frame
// cases that only a live page has. Skipped when Playwright is not installed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { CASES } from './cases.mjs';
import { check } from './check.mjs';

const require = createRequire(import.meta.url);
const SOURCE = readFileSync(new URL('../dist/captcha-detector.js', import.meta.url), 'utf8');
const { detectInPage } = require('../lib/page.cjs');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  try {
    ({ chromium } = require('playwright-core'));
  } catch (_) {
    chromium = null;
  }
}

let browser;
let context;
before(async () => {
  if (!chromium) return;
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
});
after(async () => browser && browser.close());

/** Open a page at `url` whose HTML is `html`; extra origins in `pages`; every other request is refused (offline). */
async function open(html, url = 'https://site.test/', pages = {}) {
  const page = await context.newPage();
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u === url) return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    if (pages[u]) return route.fulfill({ status: 200, contentType: 'text/html', body: pages[u] });
    return route.abort();
  });
  await page.goto(url, { waitUntil: 'load' });
  return page;
}

const run = (page, opts = {}) => page.evaluate(`(() => { const module = { exports: {} }; ${SOURCE}; const r = module.exports.detect(${JSON.stringify(opts)}); return JSON.parse(JSON.stringify(r)); })()`);
const skip = () => !chromium && 'Playwright not installed';

for (const c of CASES) {
  test(`dom: ${c.name}`, { skip: skip() }, async () => {
    const page = await open(c.html, (c.opts && c.opts.url) || 'https://site.test/');
    try {
      const { url, ...opts } = c.opts || {};
      check(await run(page, opts), c.expect, c.name);
    } finally {
      await page.close();
    }
  });
}

const ANCHOR = 'https://www.google.com/recaptcha/api2/anchor?ar=1&k=6Le&co=aHR0&hl=en&v=x&size=normal';
const ANCHOR_INV = 'https://www.google.com/recaptcha/api2/anchor?ar=1&k=6Le&co=aHR0&hl=en&v=x&size=invisible';
const BFRAME = 'https://www.google.com/recaptcha/api2/bframe?hl=en&v=x&k=6Le';

const vis = [
  {
    name: 'reCAPTCHA checkbox shown',
    html: `<div class="g-recaptcha"><div style="width:304px;height:78px"><iframe title="reCAPTCHA" src="${ANCHOR}" width="304" height="78"></iframe></div></div>`,
    expect: { visible: true, id: 'recaptcha' },
  },
  {
    name: 'reCAPTCHA checkbox inside a hidden modal',
    html: `<div style="display:none"><div class="g-recaptcha"><iframe title="reCAPTCHA" src="${ANCHOR}" width="304" height="78"></iframe></div></div>`,
    expect: { visible: false, captcha: true, id: 'recaptcha' },
  },
  {
    name: 'reCAPTCHA invisible badge only',
    html: `<div class="grecaptcha-badge" style="width:256px;height:60px;position:fixed;bottom:14px;right:-186px"><iframe title="reCAPTCHA" src="${ANCHOR_INV}" width="256" height="60"></iframe></div>
           <div style="visibility:hidden;position:absolute;top:-10000px"><iframe title="recaptcha challenge expires in two minutes" src="${BFRAME}" width="400" height="580"></iframe></div>`,
    expect: { visible: false, captcha: true, id: 'recaptcha', subtype: 'v2-invisible' },
  },
  {
    name: 'reCAPTCHA image challenge open',
    html: `<div class="grecaptcha-badge" style="width:256px;height:60px;position:fixed;bottom:14px;right:-186px"><iframe src="${ANCHOR_INV}" width="256" height="60"></iframe></div>
           <div style="visibility:visible;position:absolute;top:10px;left:10px"><iframe title="recaptcha challenge expires in two minutes" src="${BFRAME}" width="400" height="580"></iframe></div>`,
    expect: { visible: true, id: 'recaptcha', challengeOpen: true },
  },
  {
    name: 'Turnstile widget shown',
    html: '<div class="cf-turnstile" data-sitekey="x" style="width:300px;height:65px"><input type="hidden" name="cf-turnstile-response"></div>',
    expect: { visible: true, id: 'turnstile' },
  },
  {
    name: 'Turnstile in interaction-only mode (nothing shown)',
    html: '<div class="cf-turnstile" data-sitekey="x" data-appearance="interaction-only"><input type="hidden" name="cf-turnstile-response"></div>',
    expect: { visible: false, captcha: true, id: 'turnstile', subtype: 'interaction-only' },
  },
  {
    name: 'Turnstile inside an open shadow root',
    html: '<div id="host"></div><script>const r=document.getElementById("host").attachShadow({mode:"open"});r.innerHTML=\'<div class="cf-turnstile" style="width:300px;height:65px"></div>\';</script>',
    expect: { visible: true, id: 'turnstile' },
  },
  {
    name: 'hCaptcha inside a same-origin iframe',
    html: '<iframe width="400" height="200" srcdoc="<div class=&quot;h-captcha&quot; data-sitekey=&quot;x&quot; style=&quot;width:303px;height:78px&quot;></div>"></iframe>',
    wait: 300,
    expect: { visible: true, id: 'hcaptcha' },
  },
  {
    name: 'hCaptcha inside a hidden same-origin iframe',
    html: '<iframe style="display:none" srcdoc="<div class=&quot;h-captcha&quot; data-sitekey=&quot;x&quot; style=&quot;width:303px;height:78px&quot;></div>"></iframe>',
    wait: 300,
    expect: { visible: false, captcha: true, id: 'hcaptcha' },
  },
  {
    name: 'Image captcha pushed off-screen',
    html: '<form><img src="/captcha.png" id="captcha_img" width="120" height="40" style="position:absolute;left:-9999px"><input name="captcha" type="text"></form>',
    expect: { visible: false, captcha: true, id: 'generic-image-captcha' },
  },
  {
    name: 'Image captcha shown',
    html: '<form><img src="/captcha.png" id="captcha_img" width="120" height="40" style="background:#ccc"><input name="captcha" type="text"></form>',
    expect: { visible: true, id: 'generic-image-captcha' },
  },
  {
    name: 'Captcha added later by a script (window global + element)',
    html: '<div id="slot"></div><script>setTimeout(()=>{window.hcaptcha={render(){}};document.getElementById("slot").innerHTML=\'<div class="h-captcha" style="width:303px;height:78px"></div>\';},50)</script>',
    wait: 200,
    expect: { visible: true, id: 'hcaptcha', evidence: 'globals' },
  },
];

for (const v of vis) {
  test(`visibility: ${v.name}`, { skip: skip() }, async () => {
    const page = await open(`<!doctype html><html><head><title>t</title></head><body>${v.html}</body></html>`);
    try {
      if (v.wait) await page.waitForTimeout(v.wait);
      const r = await run(page);
      const d = r.detections.find((x) => x.id === v.expect.id);
      const msg = `${v.name}: ${JSON.stringify(r.detections)}`;
      assert.ok(d, `missing ${v.expect.id} — ${msg}`);
      assert.equal(d.visible, v.expect.visible, `visible — ${msg}`);
      assert.equal(r.visible, v.expect.visible, `result.visible — ${msg}`);
      if (v.expect.captcha !== undefined) assert.equal(r.captcha, v.expect.captcha);
      if (v.expect.subtype) assert.equal(d.subtype, v.expect.subtype, msg);
      if (v.expect.challengeOpen) assert.equal(d.details && d.details.challengeOpen, true, msg);
      if (v.expect.evidence) assert.ok(d.evidence.some((e) => e.type === v.expect.evidence), msg);
    } finally {
      await page.close();
    }
  });
}

test('detectInPage looks inside cross-origin frames', { skip: skip() }, async () => {
  const frameUrl = 'https://widget.other.test/frame.html';
  const page = await open(
    `<!doctype html><title>Shop</title><body><h1>Checkout</h1><iframe src="${frameUrl}" width="420" height="300"></iframe></body>`,
    'https://shop.test/',
    { [frameUrl]: '<!doctype html><body><div id="arkose" style="width:400px;height:280px"></div><input type="hidden" name="fc-token"><script>window.ArkoseEnforcement=function(){}</script></body>' },
  );
  try {
    const plain = await run(page);
    assert.equal(plain.captcha, false, 'the page script cannot see into the frame');
    const r = await detectInPage(page);
    const d = r.detections.find((x) => x.id === 'arkose');
    assert.ok(d, JSON.stringify(r));
    assert.equal(d.visible, true);
    assert.equal(d.frame, frameUrl);
    assert.equal(r.captcha, true);
  } finally {
    await page.close();
  }
});

test('detectInPage: challenge page inside a hidden frame is not visible', { skip: skip() }, async () => {
  const frameUrl = 'https://check.other.test/c.html';
  const page = await open(
    `<!doctype html><title>Home</title><body><p>Welcome</p><iframe src="${frameUrl}" style="display:none"></iframe></body>`,
    'https://home.test/',
    { [frameUrl]: '<!doctype html><title>Just a moment...</title><body><div id="challenge-running">Checking if the site connection is secure</div></body>' },
  );
  try {
    const r = await detectInPage(page);
    const d = r.detections.find((x) => x.id === 'cloudflare-challenge');
    assert.ok(d, JSON.stringify(r));
    assert.equal(d.kind, 'widget', 'a challenge page inside a frame counts as a widget');
    assert.equal(d.visible, false);
    assert.equal(r.challengePage, false);
  } finally {
    await page.close();
  }
});

test('detectInPage: a widget\'s own iframe content is folded into the widget', { skip: skip() }, async () => {
  const frameUrl = 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv0/0/abc/0x4AAA/auto/fbE/normal/auto/';
  const page = await open(
    `<!doctype html><title>Contact</title><body><form><div class="cf-turnstile" data-sitekey="x"><iframe src="${frameUrl}" width="300" height="65"></iframe><input type="hidden" name="cf-turnstile-response"></div></form></body>`,
    'https://contact.test/',
    { [frameUrl]: '<!doctype html><title>Just a moment...</title><script>window._cf_chl_opt={cType:"chl_api_m"}</script><body><div id="challenge-stage">Verify you are human</div></body>' },
  );
  try {
    const r = await detectInPage(page);
    const ids = r.detections.map((d) => d.id);
    assert.deepEqual(ids, ['turnstile'], JSON.stringify(r.detections));
    assert.equal(r.detections[0].visible, true);
    assert.equal(r.challengePage, false);
  } finally {
    await page.close();
  }
});

test('hCaptcha reCAPTCHA-compat shim is not reported as reCAPTCHA', { skip: skip() }, async () => {
  const page = await open('<div class="h-captcha" style="width:303px;height:78px"></div><textarea name="g-recaptcha-response" style="display:none"></textarea><textarea name="h-captcha-response" style="display:none"></textarea><script>window.hcaptcha={render(){}};window.grecaptcha=window.hcaptcha;</script>');
  try {
    const r = await run(page);
    assert.deepEqual(r.detections.map((d) => d.id), ['hcaptcha'], JSON.stringify(r.detections));
  } finally {
    await page.close();
  }
});

test('detectInPage passes response status and headers', { skip: skip() }, async () => {
  const page = await context.newPage();
  await page.route('**/*', (route) =>
    route.request().url() === 'https://blocked.test/'
      ? route.fulfill({ status: 403, headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge', server: 'cloudflare' }, body: '<title>Just a moment...</title><p>Checking</p>' })
      : route.abort(),
  );
  try {
    const response = await page.goto('https://blocked.test/');
    const r = await detectInPage(page, { response });
    const d = r.detections.find((x) => x.id === 'cloudflare-challenge');
    assert.ok(d && d.evidence.some((e) => e.type === 'headers' && /cf-mitigated/.test(e.value)), JSON.stringify(r));
  } finally {
    await page.close();
  }
});

test('detection does not leave a global behind', { skip: skip() }, async () => {
  const page = await open('<p>hi</p>');
  try {
    await detectInPage(page);
    assert.equal(await page.evaluate('typeof window.CaptchaDetector'), 'undefined');
  } finally {
    await page.close();
  }
});

test('elements option returns the matched DOM nodes', { skip: skip() }, async () => {
  const page = await open('<div class="g-recaptcha" style="width:304px;height:78px"></div>');
  try {
    const tag = await page.evaluate(`(() => { const module = { exports: {} }; ${SOURCE}; const r = module.exports.detect({ elements: true }); return r.detections[0].elements[0].className; })()`);
    assert.equal(tag, 'g-recaptcha');
  } finally {
    await page.close();
  }
});
