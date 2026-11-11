import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { CASES } from './cases.mjs';
import { check } from './check.mjs';
import ESM, { detectHtml as detectHtmlEsm } from '../dist/captcha-detector.mjs';

const require = createRequire(import.meta.url);
const CaptchaDetector = require('../dist/captcha-detector.js');


for (const c of CASES) {
  test(`html: ${c.name}`, () => check(CaptchaDetector.detectHtml(c.html, c.opts || {}), c.expect, c.name));
}

test('ESM build gives the same answer', () => {
  const html = CASES[0].html;
  assert.equal(detectHtmlEsm(html).summary, CaptchaDetector.detectHtml(html).summary);
  assert.equal(typeof ESM.detect, 'function');
});

test('result shape', () => {
  const r = CaptchaDetector.detectHtml(CASES[0].html, { url: 'https://example.com/' });
  assert.equal(r.mode, 'html');
  assert.equal(r.visible, null, 'static HTML cannot know visibility');
  assert.equal(r.url, 'https://example.com/');
  assert.equal(typeof r.summary, 'string');
  const d = r.detections[0];
  for (const k of ['id', 'name', 'vendor', 'kind', 'subtype', 'confidence', 'visible', 'evidence']) assert.ok(k in d, k);
  assert.ok(d.confidence > 0 && d.confidence < 1);
  assert.doesNotThrow(() => JSON.stringify(r));
});

test('Headers object (fetch) and set-cookie are read', () => {
  const headers = new Headers({ 'x-datadome': 'protected', 'set-cookie': 'datadome=abc; Path=/' });
  const r = CaptchaDetector.detectHtml('<html><body>' + 'x '.repeat(5000) + '</body></html>', { headers });
  assert.ok(r.detections.some((d) => d.id === 'datadome'));
});

test('minConfidence filters weak matches', () => {
  const html = '<div class="captcha-wrap"></div><img src="/captcha.png">';
  assert.equal(CaptchaDetector.detectHtml(html).captcha, true);
  assert.equal(CaptchaDetector.detectHtml(html, { minConfidence: 0.9 }).captcha, false);
});

test('every signature has the required fields and unique id', () => {
  const seen = new Set();
  const kinds = ['widget', 'invisible', 'image', 'question', 'challenge-page', 'block-page', 'protection'];
  for (const s of CaptchaDetector.signatures) {
    assert.ok(s.id && s.name && s.kind, JSON.stringify(s.id));
    assert.ok(kinds.includes(s.kind), `${s.id} kind ${s.kind}`);
    assert.ok(!seen.has(s.id), `duplicate ${s.id}`);
    seen.add(s.id);
    for (const t of ['scripts', 'frames', 'inline', 'urls', 'title', 'text']) {
      for (const e of s[t] || []) {
        const re = Array.isArray(e) ? e[0] : e;
        assert.ok(re instanceof RegExp, `${s.id}.${t} must be RegExp`);
        assert.ok(!re.global && !re.sticky, `${s.id}.${t} ${re} must not be /g or /y`);
      }
    }
  }
});

test('broken HTML does not throw', () => {
  for (const html of ['', null, undefined, '<', '<div class="g-recaptcha', '<<<>>>', '<script>', '<img src=captcha.png'.repeat(1000)]) {
    assert.doesNotThrow(() => CaptchaDetector.detectHtml(html));
  }
});

test('large page is fast', () => {
  const big = '<html><body>' + '<div class="row"><a href="/x">link</a><img src="/a.png"><span>text text text</span></div>'.repeat(20000) + '</body></html>';
  const t = Date.now();
  CaptchaDetector.detectHtml(big);
  assert.ok(Date.now() - t < 3000, `took ${Date.now() - t} ms`);
});

test('detectResponse: fetch Response, JSON-wrapped HTML, axios/got shapes, strings', async () => {
  const page = '<html><head><title>Sign up</title><script src="https://www.google.com/recaptcha/api.js"></script></head><body><div class="g-recaptcha" data-sitekey="x"></div></body></html>';
  const ddPage = '<html><head><title>example.com</title></head><body><script>var dd={"cid":"AHrlqAAAAAMA","hsh":"A55FBF4311ED6F1BF9911EB71931D5","t":"fe","host":"geo.captcha-delivery.com"}</script><script src="https://ct.captcha-delivery.com/c.js"></script></body></html>';
  const ok = '<html><head><title>Shoes</title></head><body><h1>Running shoes</h1><p>' + 'Great shoes. '.repeat(50) + '</p></body></html>';

  // fetch Response with HTML; the body can still be read afterwards
  const res = new Response(page, { status: 200, headers: { 'content-type': 'text/html' } });
  const r1 = await CaptchaDetector.detectResponse(res, { url: 'https://shop.example/signup' });
  assert.equal(r1.captcha, true);
  assert.equal(r1.detections[0].id, 'recaptcha');
  assert.equal(r1.url, 'https://shop.example/signup');
  assert.ok((await res.text()).includes('g-recaptcha'));

  // scraper API JSON wrapping, nested, with the target's status next to the HTML
  const wrapped = new Response(JSON.stringify({ success: true, result: { status_code: 403, url: 'https://shop.example/p/1', content: ddPage } }), { status: 200, headers: { 'content-type': 'application/json' } });
  const r2 = await CaptchaDetector.detectResponse(wrapped);
  assert.equal(r2.challengePage, true, r2.summary);
  assert.equal(r2.url, 'https://shop.example/p/1');

  // already-parsed JSON object, plain HTML string, JSON string
  assert.equal((await CaptchaDetector.detectResponse({ html: page })).captcha, true);
  assert.equal((await CaptchaDetector.detectResponse(page)).captcha, true);
  assert.equal((await CaptchaDetector.detectResponse(JSON.stringify({ body: page }))).captcha, true);

  // axios-like and got-like
  assert.equal((await CaptchaDetector.detectResponse({ data: { html: ddPage }, status: 200, headers: {} })).challengePage, true);
  assert.equal((await CaptchaDetector.detectResponse({ body: page, statusCode: 200, headers: { 'content-type': 'text/html' } })).captcha, true);

  // clean pages and non-HTML JSON
  assert.equal((await CaptchaDetector.detectResponse(new Response(ok))).captcha, false);
  assert.equal((await CaptchaDetector.detectResponse({ data: { items: [1, 2, 3], next: null }, status: 200, headers: {} })).captcha, false);
  assert.equal((await CaptchaDetector.detectResponse('')).captcha, false);
  assert.equal((await CaptchaDetector.detectResponse(null)).captcha, false);
});

test('detectResponse: options override the response', async () => {
  const blocked = new Response('<html><head><title>Access Denied</title></head><body>You don\'t have permission to access this resource. Reference #18.2f1a</body></html>');
  const r = await CaptchaDetector.detectResponse(blocked, { status: 403, headers: { server: 'AkamaiGHost' }, url: 'https://shop.example/' });
  assert.equal(r.blocked, true, r.summary);
});
