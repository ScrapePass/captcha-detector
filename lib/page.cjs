'use strict';
// Playwright / Puppeteer helper: runs the detector inside the page and inside every frame (cross-origin frames
// included, which page scripts cannot see into), then merges the results.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const CaptchaDetector = require('../dist/captcha-detector.js');

const SOURCE = readFileSync(join(__dirname, '../dist/captcha-detector.js'), 'utf8');

/** Expression that runs the detector in a page without leaving globals behind. */
function expression(opts) {
  return `(() => { const module = { exports: {} }; ${SOURCE}
;const r = module.exports.detect(${JSON.stringify(opts || {})}); return JSON.parse(JSON.stringify(r)); })()`;
}

async function responseInfo(response) {
  if (!response) return {};
  try {
    const status = typeof response.status === 'function' ? response.status() : response.status;
    let headers = {};
    if (typeof response.allHeaders === 'function') headers = await response.allHeaders();
    else if (typeof response.headers === 'function') headers = response.headers();
    else if (response.headers) headers = response.headers;
    return { status, headers };
  } catch (_) {
    return {};
  }
}

async function frameVisible(frame) {
  try {
    const el = await frame.frameElement();
    if (!el) return null;
    const shown = await el.evaluate((e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      if (r.width < 10 || r.height < 10 || cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
      if (e.checkVisibility && !e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
      return r.right + scrollX > 0 && r.bottom + scrollY > 0;
    });
    if (!shown) return false;
    const parent = frame.parentFrame();
    if (parent && parent.parentFrame()) return frameVisible(parent);
    return true;
  } catch (_) {
    return null;
  }
}

/**
 * Detect captchas on a Playwright or Puppeteer page.
 * @param page      Playwright Page or Puppeteer Page
 * @param options   { response, frames: true, minConfidence, deep }
 *                  response: the Response from page.goto(), so status and headers are checked too
 *                  frames:   also look inside every frame (default true)
 */
async function detectInPage(page, options = {}) {
  const { response, frames = true, ...rest } = options;
  const info = await responseInfo(response);
  const mainFrame = page.mainFrame();
  const main = await mainFrame.evaluate(expression({ ...rest, ...info }));
  if (!frames) return main;
  const children = page.frames().filter((f) => f !== mainFrame).slice(0, 40);
  const results = await Promise.all(
    children.map(async (frame) => {
      const url = frame.url();
      if (!url || url === 'about:blank' || url.startsWith('about:srcdoc')) return null;
      try {
        const [result, visible] = await Promise.all([frame.evaluate(expression(rest)), frameVisible(frame)]);
        return { url, visible, result };
      } catch (_) {
        return null; // detached or not ready
      }
    }),
  );
  return CaptchaDetector.mergeResults(main, results.filter(Boolean), rest);
}

/**
 * Wait until a captcha shows up (or the timeout passes). Resolves with the last result.
 * options: { timeout: 10000, interval: 500, visible: false } — visible: wait for a captcha the user can see.
 */
async function waitForCaptcha(page, options = {}) {
  const { timeout = 10000, interval = 500, visible = false, ...rest } = options;
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    last = await detectInPage(page, rest);
    if (last.captcha && (!visible || last.visible)) return last;
    if (Date.now() >= end) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
}

/** Source of the browser build, e.g. for page.addInitScript / driver.execute_script. */
const browserScript = SOURCE;

module.exports = { detectInPage, waitForCaptcha, browserScript, expression };
