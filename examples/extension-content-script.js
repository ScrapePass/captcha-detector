// Chrome extension: list dist/captcha-detector.js and this file in manifest.json "content_scripts"
// ("js": ["captcha-detector.js", "content.js"], "run_at": "document_idle").
const check = () => {
  const r = CaptchaDetector.detect();
  if (r.captcha) chrome.runtime.sendMessage({ type: 'captcha', visible: r.visible, summary: r.summary });
};
check();
// Captchas often appear after an action: check again when the page changes.
let t;
new MutationObserver(() => {
  clearTimeout(t);
  t = setTimeout(check, 500);
}).observe(document.documentElement, { childList: true, subtree: true });
