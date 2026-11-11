# captcha-detector

**Does this web page have a captcha?** One call tells you, for <!-- count -->69<!-- /count --> named captcha and bot-check products plus catch-all rules for unknown ones.

- **Every kind:** checkbox widgets, invisible/score captchas, puzzles and sliders, proof-of-work, classic image captchas, math and text questions, full-page bot checks ("Just a moment…", "Press & Hold"), and access-denied pages.
- **Answers three questions:** is there a captcha (`captcha`), is it on screen right now (`visible`), and is the whole page a bot check (`challengePage`) or a block page (`blocked`)?
- **Runs anywhere:** in the browser, in Playwright, Puppeteer and Selenium (cross-origin frames included), in a browser extension, or on raw HTML in Node, Deno, Bun or a worker.
- **Checks scraper API results:** pass what a scraper API or HTTP client returned to `detectResponse()` and find out whether you got the real page or a captcha, bot check or block page.
- **Python too:** `pip install captcha-detector` for the same detector in Python (requests, httpx, aiohttp, Scrapy, Playwright, Selenium). See [captcha-detector-python](https://github.com/ScrapePass/captcha-detector-python).
- **Zero dependencies**, one ~80 KB file, MIT licensed.

```js
import { detect } from 'captcha-detector';

const result = detect();          // in the page
if (result.captcha) console.log(result.summary);
// → "Captcha found: reCAPTCHA (v2-checkbox) [visible]"
```

## Install

```bash
npm install captcha-detector
```

Or load it straight into a page:

```html
<script src="https://cdn.jsdelivr.net/npm/captcha-detector@1/dist/captcha-detector.js"></script>
<script>console.log(CaptchaDetector.detect())</script>
```

## Usage

### In the browser, a browser extension or a userscript

```js
import { detect } from 'captcha-detector';   // or window.CaptchaDetector from the <script> build

const r = detect();
r.captcha        // true: a captcha or bot check is on the page (shown, invisible, or not rendered yet)
r.visible        // true: one is on screen right now
r.challengePage  // true: the whole page is a bot check instead of the content
r.blocked        // true: an access-denied page
r.detections     // what was found, with evidence
```

`detect()` searches the page, its same-origin frames and open shadow roots. In an extension, put the script in your content scripts (with `"all_frames": true` to also run inside cross-origin frames, then combine results with `mergeResults`).

### Playwright or Puppeteer

The helper runs the detector in the page **and inside every frame** (cross-origin too, which page scripts cannot see into), checks the response status and headers, and merges everything:

```js
import { chromium } from 'playwright';            // or: import puppeteer from 'puppeteer'
import { detectInPage, waitForCaptcha } from 'captcha-detector/page';

const browser = await chromium.launch();
const page = await browser.newPage();
const response = await page.goto('https://www.google.com/recaptcha/api2/demo');

const r = await detectInPage(page, { response });
console.log(r.summary);   // Captcha found: reCAPTCHA (v2-checkbox) [visible]

// Or wait for one to show up (e.g. after submitting a form):
const later = await waitForCaptcha(page, { timeout: 10000, visible: true });
```

### Selenium (any language)

Run the browser build with `execute_script`. Example in Python:

```python
from pathlib import Path

DETECTOR = Path("node_modules/captcha-detector/dist/captcha-detector.js").read_text()
result = driver.execute_script("var module = {exports: {}};" + DETECTOR + "; return module.exports.detect();")
print(result["captcha"], result["summary"])
```

(No npm? Download `dist/captcha-detector.js` from the [releases](https://github.com/ScrapePass/captcha-detector/releases) or jsDelivr.)

### Raw HTML in Node (fetch, crawlers, HTTP clients)

```js
import { detectHtml } from 'captcha-detector';

const res = await fetch('https://example.com');
const r = detectHtml(await res.text(), { url: res.url, status: res.status, headers: res.headers });
if (r.challengePage) console.log('Blocked by a bot check:', r.detections[0].name);
```

Static HTML only shows what the server sent: widgets added later by scripts are missed and `visible` is `null`. Many bot-check pages are caught this way though, since the server sends them as is, and headers such as `cf-mitigated` or `x-amzn-waf-action` give them away.

### Results from scraper APIs and HTTP clients

Got a page from a scraper API, a proxy or an HTTP client? Check it before you parse it, pay for it or store it.
`detectResponse()` takes a fetch `Response`, an axios or got response, an HTML string, or the JSON a scraper API
sent. HTML wrapped in JSON (`{ "html": … }`, `{ "result": { "content": … } }` and the like) is found on its own,
along with the status code, headers and URL next to it.

```js
import { detectResponse } from 'captcha-detector';

const target = 'https://shop.example/product/42';
const res = await fetch(`https://scraper-api.example/v1?url=${encodeURIComponent(target)}&key=…`);
const r = await detectResponse(res, { url: target });

if (r.captcha || r.challengePage || r.blocked) {
  console.log('Not the real page:', r.summary); // e.g. "Challenge page: DataDome"
  // retry with another proxy or provider, and don't parse or store this one
} else {
  const html = await res.text(); // the body can still be read: detectResponse reads a copy
}
```

```js
// axios
const r = await detectResponse(await axios.get(apiUrl), { url: target });
// you already have the HTML or the JSON
const r = await detectResponse(json, { url: target });
```

Pass `url`, the page you asked the API to scrape, not the API's own address. Most scraper APIs answer
`200` whatever the site did; that's fine, the page itself is what gives a captcha away. If your API reports
the site's real status or headers somewhere else, pass them as `status` and `headers` and block pages are
caught more reliably. Raw HTML can't show whether a widget is on screen, so check `captcha`, `challengePage`
and `blocked` rather than `visible`.

### Python

```bash
pip install captcha-detector
```

```python
from captcha_detector import detect_response

r = detect_response(requests.get(url))   # or httpx, aiohttp, Scrapy, a scraper API's JSON, an HTML string
if r.captcha or r.challenge_page or r.blocked:
    print(r.summary)
```

Playwright (`detect_in_page`), Selenium (`detect_selenium`) and a CLI are included. The Python package shares this signature database, and its tests check it gives the same results as the JavaScript engine. See [captcha-detector-python](https://github.com/ScrapePass/captcha-detector-python).

### Command line

```bash
npx captcha-detector https://www.google.com/recaptcha/api2/demo
npx captcha-detector https://example.com --browser --json   # real browser (needs: npm i playwright)
curl -s https://example.com | npx captcha-detector -
curl -s "https://scraper-api.example/v1?url=…" | npx captcha-detector -   # HTML or a scraper API's JSON
```

```
⚠ Captcha found  https://www.google.com/recaptcha/api2/demo
  visible: true   challenge page: false
  • reCAPTCHA — Google · widget/v2-checkbox · visible · 99%
      scripts: https://www.google.com/recaptcha/api.js
      frames: https://www.google.com/recaptcha/api2/anchor?ar=1&k=6Le-wvkSAAAAAPBMRTvw0Q4…
```

Options: `--browser`, `--headful`, `--wait <ms>`, `--json`, `--fail` (exit code 1 when a captcha is found), `--min <0..1>`.

## The result

```jsonc
{
  "captcha": true,
  "visible": true,
  "challengePage": false,
  "blocked": false,
  "detections": [
    {
      "id": "recaptcha",
      "name": "reCAPTCHA",
      "vendor": "Google",
      "kind": "widget",
      "subtype": "v2-checkbox",
      "confidence": 0.99,
      "visible": true,
      "evidence": [
        { "type": "scripts", "value": "https://www.google.com/recaptcha/api.js" },
        { "type": "frames", "value": "https://www.google.com/recaptcha/api2/anchor?ar=1&k=…" },
        { "type": "elements", "value": ".g-recaptcha" }
      ],
      "site": "https://developers.google.com/recaptcha"
    }
  ],
  "summary": "Captcha found: reCAPTCHA (v2-checkbox) [visible]",
  "url": "https://www.google.com/recaptcha/api2/demo",
  "mode": "dom",
  "version": "1.0.0"
}
```

| `kind` | Meaning | Counts as `captcha` |
|---|---|---|
| `widget` | A captcha widget on the page: checkbox, puzzle, slider, image grid | yes |
| `invisible` | Runs in the background, challenges only when suspicious (reCAPTCHA v3, invisible v2) | yes |
| `image` | Classic image of distorted characters to type | yes |
| `question` | A text or math question | yes |
| `challenge-page` | The whole page is a bot check in front of the content | yes |
| `block-page` | Access denied, nothing to solve (`blocked: true`) | no |
| `protection` | A bot-protection service is loaded and may raise a captcha later | no |

`visible` on a detection means the user can see it now: a reCAPTCHA v2 checkbox on screen, an open image-challenge popup, a challenge page. A widget in a closed modal, an invisible reCAPTCHA's badge, or a captcha pushed off-screen is `visible: false`. When the image challenge of reCAPTCHA or hCaptcha is open, `details.challengeOpen` is `true`.

## Options

`detectResponse` takes the same options as `detectHtml`.

| Option | `detect` | `detectHtml` | `detectInPage` | |
|---|:-:|:-:|:-:|---|
| `minConfidence` | ✓ | ✓ | ✓ | 0..1, default 0.5 |
| `headers`, `status` | ✓ | ✓ | (from `response`) | Response headers and status code |
| `url` | | ✓ | | Resolves relative URLs; the URL is checked too |
| `cookies` | ✓ | ✓ | | Extra cookies (`document.cookie` is read in the browser; `Set-Cookie` headers too) |
| `deep` | ✓ | | ✓ | Search same-origin frames and open shadow roots (default true) |
| `elements` | ✓ | | | Attach the matched DOM elements to each detection as `elements` |
| `response` | | | ✓ | The `Response` from `page.goto()` |
| `frames` | | | ✓ | Look inside every frame (default true) |
| `signatures` | ✓ | ✓ | | Your own signature list |

## Supported captchas and bot checks

<!-- providers:start -->
| Product | Vendor | Kind (default) | id |
|---|---|---|---|
| [reCAPTCHA](https://developers.google.com/recaptcha) | Google | Widget | `recaptcha` |
| [hCaptcha](https://www.hcaptcha.com) | Intuition Machines | Widget | `hcaptcha` |
| [Turnstile](https://www.cloudflare.com/products/turnstile/) | Cloudflare | Widget | `turnstile` |
| [Arkose Labs (FunCaptcha)](https://www.arkoselabs.com) | Arkose Labs | Widget (puzzle) | `arkose` |
| [GeeTest](https://www.geetest.com) | GeeTest | Widget | `geetest` |
| [AWS WAF CAPTCHA](https://docs.aws.amazon.com/waf/latest/developerguide/waf-captcha-and-challenge.html) | Amazon Web Services | Widget | `aws-waf` |
| [Friendly Captcha](https://friendlycaptcha.com) | Friendly Captcha | Widget (proof-of-work) | `friendly-captcha` |
| [MTCaptcha](https://www.mtcaptcha.com) | MTCaptcha | Widget | `mtcaptcha` |
| [Yandex SmartCaptcha](https://yandex.cloud/en/services/smartcaptcha) | Yandex | Widget | `yandex-smartcaptcha` |
| [Tencent Captcha (TCaptcha)](https://cloud.tencent.com/product/captcha) | Tencent | Widget (slider) | `tencent-captcha` |
| [Alibaba Cloud Captcha](https://www.alibabacloud.com/product/captcha) | Alibaba | Widget (slider) | `aliyun-captcha` |
| [NetEase Yidun](https://dun.163.com) | NetEase | Widget (slider) | `netease-yidun` |
| [Dingxiang Captcha](https://www.dingxiang-inc.com) | Dingxiang | Widget (slider) | `dingxiang` |
| [Shumei Captcha](https://www.ishumei.com) | Shumei | Widget (slider) | `shumei` |
| [VAPTCHA](https://www.vaptcha.com) | VAPTCHA | Widget | `vaptcha` |
| [Luosimao Captcha](https://luosimao.com/service/captcha) | Luosimao | Widget | `luosimao` |
| [Lemin Captcha](https://www.leminnow.com) | Lemin | Widget (puzzle) | `lemin` |
| [CaptchaFox](https://captchafox.com) | CaptchaFox | Widget | `captchafox` |
| [Procaptcha](https://prosopo.io) | Prosopo | Widget | `procaptcha` |
| [KeyCAPTCHA](https://www.keycaptcha.com) | KeyCAPTCHA | Widget (puzzle) | `keycaptcha` |
| [Capy Puzzle CAPTCHA](https://www.capy.me) | Capy | Widget (puzzle) | `capy` |
| [Solve Media](https://www.solvemedia.com) | Solve Media | Image text | `solvemedia` |
| [Cutcaptcha](https://www.cutcaptcha.com) | Cutcaptcha | Widget (puzzle) | `cutcaptcha` |
| [CyberSiARA](https://www.cybersiara.com) | CyberSiARA | Widget (slider) | `cybersiara` |
| [atbCAPTCHA](https://www.aisecurius.com) | aisecurius | Widget | `atbcaptcha` |
| [mCaptcha](https://mcaptcha.org) | mCaptcha | Widget (proof-of-work) | `mcaptcha` |
| [ALTCHA](https://altcha.org) | ALTCHA | Widget (proof-of-work) | `altcha` |
| [Cap](https://capjs.js.org) | Cap (open source) | Widget (proof-of-work) | `cap` |
| [Private Captcha](https://privatecaptcha.com) | Private Captcha | Widget (proof-of-work) | `private-captcha` |
| [TrustCaptcha](https://www.trustcomponent.com) | TrustComponent | Widget | `trustcaptcha` |
| [mosparo](https://mosparo.io) | mosparo (open source) | Widget | `mosparo` |
| [Botpoison](https://botpoison.com) | Botpoison | Invisible (proof-of-work) | `botpoison` |
| [BotDetect CAPTCHA](https://captcha.com) | Captcha Inc. | Image text | `botdetect` |
| [Securimage / SI CAPTCHA](https://www.phpcaptcha.org) | Securimage | Image text | `securimage` |
| [Really Simple CAPTCHA (Contact Form 7)](https://wordpress.org/plugins/really-simple-captcha/) | Contact Form 7 | Image text | `wpcf7-captcha` |
| [Contact Form 7 Quiz](https://contactform7.com/quiz/) | Contact Form 7 | Question | `wpcf7-quiz` |
| [Cloudflare challenge page](https://developers.cloudflare.com/waf/reference/cloudflare-challenges/) | Cloudflare | Challenge page | `cloudflare-challenge` |
| [Cloudflare block page](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/) | Cloudflare | Block page | `cloudflare-block` |
| [Google unusual traffic page](https://support.google.com/websearch/answer/86640) | Google | Challenge page (recaptcha) | `google-sorry` |
| [Amazon robot check](https://www.amazon.com) | Amazon | Challenge page (text-image) | `amazon-captcha` |
| [DataDome](https://datadome.co) | DataDome | Bot protection | `datadome` |
| [DataDome captcha](https://datadome.co) | DataDome | Challenge page | `datadome-captcha` |
| [HUMAN (PerimeterX)](https://www.humansecurity.com) | HUMAN Security | Bot protection | `perimeterx` |
| [HUMAN (PerimeterX) press & hold](https://www.humansecurity.com) | HUMAN Security | Challenge page (press-and-hold) | `perimeterx-captcha` |
| [Akamai Bot Manager](https://www.akamai.com/products/bot-manager) | Akamai | Bot protection | `akamai-bot-manager` |
| [Akamai challenge page](https://www.akamai.com/products/bot-manager) | Akamai | Challenge page | `akamai-challenge` |
| [Akamai access denied](https://www.akamai.com) | Akamai | Block page | `akamai-block` |
| [Imperva (Incapsula)](https://www.imperva.com/products/advanced-bot-protection-management/) | Imperva | Bot protection | `imperva` |
| [Imperva (Incapsula) challenge page](https://www.imperva.com) | Imperva | Challenge page | `imperva-challenge` |
| [Imperva Advanced Bot Protection (Distil)](https://www.imperva.com/products/advanced-bot-protection-management/) | Imperva | Challenge page | `imperva-abp` |
| [Kasada](https://www.kasada.io) | Kasada | Bot protection | `kasada` |
| [F5 BIG-IP ASM](https://www.f5.com/products/big-ip-services/advanced-waf) | F5 | Block page | `f5-asm` |
| [Sucuri Website Firewall](https://sucuri.net/website-firewall/) | Sucuri | Bot protection | `sucuri` |
| [DDoS-Guard](https://ddos-guard.net) | DDoS-Guard | Bot protection | `ddos-guard` |
| [Qrator](https://qrator.net) | Qrator Labs | Bot protection | `qrator` |
| [StormWall](https://stormwall.network) | StormWall | Bot protection | `stormwall` |
| [Reblaze](https://www.reblaze.com) | Reblaze | Bot protection | `reblaze` |
| [Radware Bot Manager (ShieldSquare)](https://www.radware.com/products/bot-manager/) | Radware | Bot protection | `radware` |
| [Netacea](https://netacea.com) | Netacea | Bot protection | `netacea` |
| [Vercel Security Checkpoint](https://vercel.com/docs/vercel-firewall) | Vercel | Challenge page | `vercel-challenge` |
| [Anubis](https://anubis.techaro.lol) | Techaro (open source) | Challenge page (proof-of-work) | `anubis` |
| [SiteGround SG-Captcha](https://www.siteground.com) | SiteGround | Challenge page | `sg-captcha` |
| [LiteSpeed reCAPTCHA](https://docs.litespeedtech.com/lsws/cp/cpanel/antibot/) | LiteSpeed | Challenge page | `litespeed-recaptcha` |
| [Imunify360 bot protection](https://www.imunify360.com) | CloudLinux | Challenge page | `imunify360` |
| [BitNinja captcha](https://bitninja.com) | BitNinja | Challenge page | `bitninja` |
| [Wordfence block page](https://www.wordfence.com) | Defiant | Block page | `wordfence` |
| [Yandex robot check](https://yandex.com/support/captcha/) | Yandex | Challenge page | `yandex-showcaptcha` |
| [VK captcha](https://vk.com) | VK | Challenge page | `vk-captcha` |
| [Baidu security check](https://www.baidu.com) | Baidu | Widget (rotate) | `baidu-captcha` |
| Image captcha | any | Image text (text-image) | `generic-image-captcha` |
| Question / math captcha | any | Question | `generic-question` |
| Slider captcha | any | Widget (slider) | `generic-slider` |
| Captcha (unknown provider) | any | Widget | `generic-captcha` |
| Bot check page | any | Challenge page | `generic-challenge` |
| Access denied page | any | Block page | `generic-block` |
<!-- providers:end -->

The kind shown is the default; many products switch at run time (reCAPTCHA v3 and invisible v2 are `invisible`; DataDome inside a normal page is a `widget`; a bot-protection service that is currently challenging becomes a `challenge-page`).

## How it works

Each product is a **signature** in [`src/signatures.js`](src/signatures.js): the script and frame URLs it loads, the elements and globals it creates, its inline code, cookies, response headers, page titles and wording. Every hit adds evidence with a weight, and the weights add up to a confidence. A `refine()` step works out the variant (reCAPTCHA v2 checkbox vs invisible vs v3, GeeTest v3 vs v4…) and whether it is on screen.

- In a **live page** it also sees what scripts added later, every resource the page loaded (Resource Timing), `window` globals, same-origin frames and open shadow roots, and it measures what is actually visible.
- With **Playwright/Puppeteer** it runs inside every frame, cross-origin ones included, and folds a widget's own iframe into that widget.
- Wording ("verify you are human", "我不是机器人", "я не робот"… in 20+ languages) only counts on short pages, because bot-check pages are short and articles about captchas are not.
- **Catch-all rules** find captchas from unknown providers: images named like a captcha next to an answer field, slider and puzzle widgets, math questions, frames and widgets named `captcha`, bot-check and access-denied pages. They give way as soon as a named product is found.

## Limitations

- Static HTML (`detectHtml`) cannot see what scripts add later, and cannot tell what is visible.
- Page scripts cannot look into cross-origin frames or closed shadow roots (Turnstile uses one). The detector still sees the frame URLs and the resources they loaded; use `detectInPage` for full coverage.
- `HttpOnly` cookies are not visible to `detect()`; pass response headers for header and cookie signals.
- Detection, not solving: this library never solves or bypasses a captcha.

## Add a provider or fix a miss

1. Add or edit a signature in [`src/signatures.js`](src/signatures.js) (the comment at the top lists every field).
2. Add a test page to [`test/cases.mjs`](test/cases.mjs), including a page that must *not* match if the new rule could catch ordinary pages.
3. `npm test` (HTML mode in Node, and the same pages in a real Chromium when Playwright is installed). `npm run test:live` checks real demo pages and ordinary sites.
4. If the signature has a `refine()` step, port it to `src/captcha_detector/refine.py` in [captcha-detector-python](https://github.com/ScrapePass/captcha-detector-python) as well. With that repository cloned next to this one, `npm run test:python` exports the signatures and every test page, with the JavaScript result, to the Python package, and runs its tests, which check that both engines give the same answers.
5. Open a pull request. The provider table in this README is rebuilt by `npm run build`.

## License

[MIT](LICENSE) © ScrapePass
