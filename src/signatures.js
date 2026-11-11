/**
 * Captcha / bot-check signatures.
 *
 * Each signature describes one captcha or bot-protection product. A page matches a signature when one or more of its
 * matchers hit; each hit adds evidence with a weight, and the weights are combined into a confidence (noisy-or).
 *
 * Fields
 *   id, name, vendor, site    who it is
 *   kind                      'widget'          a captcha widget on the page (checkbox, puzzle, slider, image grid…)
 *                             'invisible'       runs in the background, shows a challenge only when it is suspicious
 *                             'image'           a classic image of distorted characters to type
 *                             'question'        a text or math question to answer
 *                             'challenge-page'  the whole page is a bot check that stands in front of the content
 *                             'block-page'      access denied, nothing to solve
 *                             'protection'      a bot-protection service is loaded; it can raise a captcha later
 *   subtype                   free text: 'checkbox', 'slider', 'press-and-hold', 'proof-of-work', …
 *   generic                   true for the catch-all rules; they are dropped when a named product is found
 *
 * Matchers (all optional; a weight can be given as [pattern, weight])
 *   scripts   RegExp tested on script URLs (and, in the browser, on every resource the page loaded)
 *   frames    RegExp tested on iframe URLs
 *   elements  CSS selector (simple compound selectors only: tag, #id, .class, [attr op "value" i], :not(...)),
 *             or { sel, attr: [...names], re } to test attributes of the selected elements with a RegExp
 *   inline    RegExp tested on the text of inline scripts
 *   globals   window property path ('grecaptcha.enterprise') or a function (window) => boolean; browser only
 *   urls      RegExp tested on the page URL
 *   title     RegExp tested on the page title
 *   text      RegExp tested on the visible text, only on short pages (a bot-check page is short), unless the
 *             entry is [re, weight, 'any']
 *   cookies   cookie name: exact string, a prefix ending in '_' or '-', or a RegExp
 *   headers   [header-name, RegExp, weight?] tested on response headers (when you pass them)
 *   status    response status codes (supporting evidence only)
 *   refine    (detection, ctx) => detection | null, to work out the variant, the visibility, or to drop a weak match
 */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const CAPTCHA_IMG = /captch|kaptcha|check_?code|verif(?:y|ication)_?(?:code|img|image|pic)|valid(?:ate)?_?code|(?:^|[^a-z])v_?code|secur(?:e|ity)_?code_?img|auth_?code|image_?code|img_?code|pic_?code|rand_?code|(?:^|[^a-z])yzm(?:[^a-z]|$)|securimage/i;
const NOT_CAPTCHA_IMG = /logo|icon|badge|sprite|avatar|banner|screenshot|thumb|favicon/i;
/** Images that look like a captcha to solve (not a logo, an icon or an illustration of one). */
const captchaImages = (x) =>
  x
    .query('img')
    .concat(x.query('canvas'))
    .filter((n) => {
      const a = [n.attr('src'), n.attr('id'), n.attr('class'), n.attr('alt'), n.attr('name'), n.attr('title')].join(' ');
      const src = n.attr('src') || '';
      return CAPTCHA_IMG.test(a) && !NOT_CAPTCHA_IMG.test(a) && !/\.svg(?:[?#]|$)/i.test(src);
    });

export const SIGNATURES = [
  // ───────────────────────────── Major captcha widgets ─────────────────────────────
  {
    id: 'recaptcha',
    name: 'reCAPTCHA',
    vendor: 'Google',
    kind: 'widget',
    site: 'https://developers.google.com/recaptcha',
    scripts: [
      /\b(?:google\.com|recaptcha\.net)\/recaptcha\/(?:api|enterprise)\.js/i,
      /\bgstatic\.(?:com|cn)\/recaptcha\//i,
      [/\b(?:google\.com|recaptcha\.net)\/recaptcha\/(?:api2|enterprise)\/(?:reload|userverify|clr|webworker)/i, 0.8],
    ],
    frames: [/\b(?:google\.com|recaptcha\.net)\/recaptcha\/(?:api2|enterprise)\/(?:anchor|bframe)/i],
    elements: [
      '.g-recaptcha',
      '#g-recaptcha',
      '.grecaptcha-badge',
      ['textarea[name="g-recaptcha-response"]', 0.7],
      ['iframe[title="reCAPTCHA"]', 0.9],
    ],
    inline: [[/\bgrecaptcha\.(?:execute|render|ready|enterprise)\b/, 0.75]],
    globals: ['grecaptcha', '___grecaptcha_cfg'],
    refine(d, x) {
      // hCaptcha's reCAPTCHA compatibility mode adds a g-recaptcha-response textarea and window.grecaptcha.
      if (x.has('hcaptcha') && !d.evidence.some((e) => e.type === 'scripts' || e.type === 'frames' || e.type === 'inline' || /\.g-recaptcha|grecaptcha-badge/.test(e.value))) return null;
      const anchors = x.frames(/\/recaptcha\/(?:api2|enterprise)\/anchor/i);
      const bframes = x.frames(/\/recaptcha\/(?:api2|enterprise)\/bframe/i);
      const checkbox = anchors.filter((f) => !/[?&]size=invisible/i.test(f.src));
      const invisibleAnchor = anchors.some((f) => /[?&]size=invisible/i.test(f.src));
      const widgets = x.query('.g-recaptcha');
      const invisibleWidget = widgets.some((n) => /invisible/i.test(n.attr('data-size') || ''));
      const v3 = x.script(/\/recaptcha\/(?:api|enterprise)\.js\?(?:[^#]*&)?render=(?!explicit\b|onload\b)[\w-]{20,}/i);
      const enterprise = x.script(/\/recaptcha\/enterprise/i) || anchors.some((f) => /\/enterprise\//.test(f.src)) || x.global('grecaptcha.enterprise');
      d.name = enterprise ? 'reCAPTCHA Enterprise' : 'reCAPTCHA';
      if (checkbox.length) {
        d.subtype = 'v2-checkbox';
        d.visible = x.anyVisible(checkbox);
      } else if (invisibleWidget || (invisibleAnchor && !v3)) {
        d.subtype = 'v2-invisible';
        d.kind = 'invisible';
        d.visible = x.dom ? false : null;
      } else if (v3 || invisibleAnchor) {
        d.subtype = 'v3';
        d.kind = 'invisible';
        d.visible = x.dom ? false : null;
      } else if (widgets.length) {
        d.subtype = 'v2-checkbox';
        d.visible = x.anyVisible(widgets);
      } else {
        d.subtype = 'v2';
        d.visible = x.dom ? false : null;
      }
      if (bframes.length && x.anyVisible(bframes)) {
        d.visible = true;
        d.details = { ...d.details, challengeOpen: true };
      }
      return d;
    },
  },
  {
    id: 'hcaptcha',
    name: 'hCaptcha',
    vendor: 'Intuition Machines',
    kind: 'widget',
    site: 'https://www.hcaptcha.com',
    scripts: [/\b(?:js|api|api2|newassets|assets|imgs\d*)\.hcaptcha\.com\//i, /\/\/hcaptcha\.com\/1\/(?:secure-)?api\.js/i],
    frames: [/\bhcaptcha\.com\/captcha\/v1\//i, /\b(?:new)?assets\.hcaptcha\.com\//i],
    elements: ['.h-captcha', 'textarea[name="h-captcha-response"]', '[data-hcaptcha-widget-id]', ['iframe[title*="hCaptcha" i]', 0.9]],
    inline: [[/\bhcaptcha\.(?:execute|render)\s*\(/, 0.75]],
    globals: ['hcaptcha'],
    refine(d, x) {
      const checkbox = x.frames(/[#&]frame=checkbox(?:&|$)|hcaptcha-checkbox\.html/i);
      const invisibleFrame = x.frames(/[#&]frame=checkbox-invisible/i);
      const challenge = x.frames(/[#&]frame=challenge|hcaptcha-challenge\.html/i);
      const widgets = x.query('.h-captcha');
      const invisible = invisibleFrame.length > 0 || widgets.some((n) => /invisible/i.test(n.attr('data-size') || ''));
      if (invisible && !checkbox.length) {
        d.kind = 'invisible';
        d.subtype = 'invisible';
        d.visible = x.dom ? false : null;
      } else {
        d.subtype = 'checkbox';
        if (checkbox.length) d.visible = x.anyVisible(checkbox);
        else if (widgets.length) d.visible = x.anyVisible(widgets);
      }
      if (challenge.length && x.anyVisible(challenge)) {
        d.visible = true;
        d.details = { ...d.details, challengeOpen: true };
      }
      return d;
    },
  },
  {
    id: 'turnstile',
    name: 'Turnstile',
    vendor: 'Cloudflare',
    kind: 'widget',
    site: 'https://www.cloudflare.com/products/turnstile/',
    scripts: [/\bchallenges\.cloudflare\.com\/turnstile\//i],
    frames: [/\bchallenges\.cloudflare\.com\/cdn-cgi\/challenge-platform\/[^?#]*turnstile/i],
    elements: ['.cf-turnstile', 'input[name="cf-turnstile-response"]', ['[id^="cf-chl-widget-"]', 0.9]],
    inline: [[/\bturnstile\.(?:render|execute)\s*\(/, 0.75]],
    globals: ['turnstile'],
    refine(d, x) {
      const boxes = x.query('.cf-turnstile');
      const inputs = x.query('input[name="cf-turnstile-response"]');
      const frames = x.frames(/challenges\.cloudflare\.com/i).filter((f) => f.el);
      if (frames.length) d.visible = x.anyVisible(frames);
      else if (boxes.length) d.visible = x.anyVisible(boxes);
      else if (inputs.length && x.dom) d.visible = inputs.some((n) => x.visibleEl(n.el && n.el.parentElement));
      if (boxes.some((n) => /interaction-only|execute/i.test(n.attr('data-appearance') || '') || /invisible/i.test(n.attr('data-size') || ''))) {
        d.subtype = 'interaction-only';
      } else d.subtype = 'managed';
      return d;
    },
  },
  {
    id: 'arkose',
    name: 'Arkose Labs (FunCaptcha)',
    vendor: 'Arkose Labs',
    kind: 'widget',
    site: 'https://www.arkoselabs.com',
    scripts: [/\barkoselabs\.[a-z0-9.-]+\//i, /\bfuncaptcha\.com\//i, [/\/fc\/(?:api|gc|gt2|gfct|ca)\//i, 0.7], [new RegExp(`/v2/${UUID}/api\\.js`, 'i'), 0.6]],
    frames: [/\barkoselabs\.[a-z0-9.-]+\//i, /\bfuncaptcha\.com\//i, [/\/fc\/(?:gc|assets)\//i, 0.75]],
    elements: [
      '#FunCaptcha',
      '#funcaptcha',
      '#arkose',
      '#arkoseFrame',
      '#arkose-iframe',
      '#enforcementFrame',
      'iframe[data-e2e="enforcement-frame"]',
      'input[name="fc-token"]',
      '#fc-token',
      ['iframe[title*="arkose" i]', 0.9],
      ['[data-pkey]', 0.6],
    ],
    inline: [[/\bArkoseEnforcement\b|\bsetupEnforcement\b|\barkoseLabsClientApi/, 0.75]],
    globals: ['ArkoseEnforcement', [(w) => Object.keys(w).some((k) => /^arkoseLabsClientApi/i.test(k)), 0.85]],
    subtype: 'puzzle',
  },
  {
    id: 'geetest',
    name: 'GeeTest',
    vendor: 'GeeTest',
    kind: 'widget',
    site: 'https://www.geetest.com',
    scripts: [/\b(?:static|api|apiv6|gcaptcha4|monitor)\.geetest\.com\//i, /\bgeetest\.com\/(?:static|v4)\//i, /\bgeevisit\.com\//i, [/\bgt4?(?:\.min)?\.js\b/i, 0.4]],
    frames: [/\bgeetest\.com\//i],
    elements: [
      '.geetest_holder',
      '.geetest_panel',
      '.geetest_widget',
      '.geetest_radar',
      '.geetest_btn',
      '.geetest_box',
      '.geetest_captcha',
      '.geetest_popup_wrap',
      'input[name="geetest_challenge"]',
      'input[name="geetest_validate"]',
      'input[name="geetest_seccode"]',
      ['[class*="geetest_"]', 0.8],
    ],
    inline: [/\binitGeetest4?\s*\(/],
    globals: ['initGeetest', 'initGeetest4'],
    refine(d, x) {
      const v4 = x.script(/gcaptcha4|\/v4\/|gt4/i) || x.query('.geetest_box').length > 0 || x.global('initGeetest4') || /initGeetest4/.test(x.inline);
      d.subtype = v4 ? 'v4' : 'v3';
      return d;
    },
  },
  {
    id: 'aws-waf',
    name: 'AWS WAF CAPTCHA',
    vendor: 'Amazon Web Services',
    kind: 'widget',
    site: 'https://docs.aws.amazon.com/waf/latest/developerguide/waf-captcha-and-challenge.html',
    scripts: [/\.(?:token|captcha|edge\.sdk|edge\.captcha-sdk)\.awswaf\.com\//i, [/\bawswaf\.com\//i, 0.85]],
    frames: [/\bawswaf\.com\//i],
    elements: ['awswaf-captcha', ['#captcha-container', 0.35], ['#amzn-captcha-verify-button', 0.8]],
    inline: [[/\bgokuProps\b/, 0.85], [/AwsWafCaptcha\.renderCaptcha/, 0.95], [/\bAwsWafIntegration\b/, 0.6]],
    globals: [['AwsWafCaptcha', 0.9], ['gokuProps', 0.85], ['AwsWafIntegration', 0.7]],
    headers: [['x-amzn-waf-action', /captcha|challenge/i, 0.95]],
    text: [/let(?:'|’)s confirm you are human/i, [/to continue,? please confirm you(?:'|’)re a human/i, 0.7]],
    refine(d, x) {
      const captcha =
        x.script(/captcha(?:-sdk)?\.awswaf\.com|\.captcha\.awswaf/i) ||
        x.query('awswaf-captcha').length > 0 ||
        x.global('AwsWafCaptcha') ||
        /AwsWafCaptcha/.test(x.inline) ||
        /captcha/i.test(x.header('x-amzn-waf-action'));
      const challenge = /\bgokuProps\b/.test(x.inline) || x.global('gokuProps') || /challenge/i.test(x.header('x-amzn-waf-action'));
      if (captcha) {
        d.kind = x.short && challenge ? 'challenge-page' : 'widget';
        d.subtype = 'image-grid';
        if (d.kind === 'challenge-page') d.visible = true;
      } else if (challenge) {
        d.name = 'AWS WAF Challenge';
        d.kind = 'challenge-page';
        d.subtype = 'silent-challenge';
        d.visible = true;
      } else {
        d.name = 'AWS WAF Bot Control';
        d.kind = 'protection';
      }
      return d;
    },
  },
  {
    id: 'friendly-captcha',
    name: 'Friendly Captcha',
    vendor: 'Friendly Captcha',
    kind: 'widget',
    subtype: 'proof-of-work',
    site: 'https://friendlycaptcha.com',
    scripts: [/\bfriendly-challenge\b/i, /@friendlycaptcha\//i, /\b(?:api|eu-api|global\.frcapi)\.friendlycaptcha\.(?:com|eu)\//i, /\bfrcapi\.com\//i],
    elements: ['.frc-captcha', 'input[name="frc-captcha-solution"]', 'input[name="frc-captcha-response"]', 'frc-captcha'],
    globals: ['friendlyChallenge', 'frcaptcha'],
  },
  {
    id: 'mtcaptcha',
    name: 'MTCaptcha',
    vendor: 'MTCaptcha',
    kind: 'widget',
    site: 'https://www.mtcaptcha.com',
    scripts: [/\bservice2?\.mtcaptcha\.com\//i],
    frames: [/\bservice2?\.mtcaptcha\.com\//i],
    elements: ['.mtcaptcha', 'input[name="mtcaptcha-verifiedtoken"]', ['[id^="mtcaptcha"]', 0.8]],
    globals: ['mtcaptchaConfig', ['mtcaptcha', 0.8]],
    inline: [[/\bmtcaptchaConfig\b/, 0.9]],
  },
  {
    id: 'yandex-smartcaptcha',
    name: 'Yandex SmartCaptcha',
    vendor: 'Yandex',
    kind: 'widget',
    site: 'https://yandex.cloud/en/services/smartcaptcha',
    scripts: [/\bsmartcaptcha\.(?:yandexcloud\.net|cloud\.yandex\.(?:ru|net|com))\//i],
    frames: [/\bsmartcaptcha\.(?:yandexcloud\.net|cloud\.yandex\.(?:ru|net|com))\//i],
    elements: ['.smart-captcha', 'input[name="smart-token"]'],
    globals: ['smartCaptcha'],
  },
  {
    id: 'tencent-captcha',
    name: 'Tencent Captcha (TCaptcha)',
    vendor: 'Tencent',
    kind: 'widget',
    subtype: 'slider',
    site: 'https://cloud.tencent.com/product/captcha',
    scripts: [/\b(?:ssl\.|t\.)?captcha\.qq\.com\//i, /\bturing\.captcha\.(?:qcloud|gtimg)\.com\//i, /\bcaptcha\.gtimg\.com\//i, [/\bTCaptcha(?:-global)?\.js/i, 0.9]],
    frames: [/\bcaptcha\.qq\.com\//i, /\bturing\.captcha\.(?:qcloud|gtimg)\.com\//i],
    elements: ['#tcaptcha_transform', '#tcaptcha_iframe', '#tcaptcha_iframe_dy', ['[id^="tcaptcha"]', 0.85], '.tcaptcha-transform'],
    globals: ['TencentCaptcha'],
  },
  {
    id: 'aliyun-captcha',
    name: 'Alibaba Cloud Captcha',
    vendor: 'Alibaba',
    kind: 'widget',
    subtype: 'slider',
    site: 'https://www.alibabacloud.com/product/captcha',
    scripts: [
      /aliyunCaptcha\/AliyunCaptcha\.js/i,
      /\bcaptcha-open(?:-[a-z]+)?\.aliyuncs\.com/i,
      /\bcf\.aliyun\.com\/nocaptcha/i,
      [/\bg\.alicdn\.com\/AWSC\//i, 0.7],
      [/\b[a-z]\.alicdn\.com\/captcha-frontend\//i, 0.9],
    ],
    elements: [
      '#nc_1_wrapper',
      '.nc-container',
      '.nc_wrapper',
      '.nc_scale',
      '#aliyunCaptcha-window-popup',
      '#aliyunCaptcha-sliding-wrapper',
      ['[id^="aliyunCaptcha"]', 0.9],
      ['#nocaptcha', 0.75],
    ],
    globals: ['initAliyunCaptcha', ['noCaptcha', 0.7], ['AWSC', 0.6]],
    urls: [[/\/_____tmd_____\/punish/i, 0.95]],
    text: [[/请按住滑块，?拖动到最右边|please slide to verify/i, 0.8, 'any']],
    refine(d, x) {
      if (/_____tmd_____\/punish/i.test(x.url)) {
        d.kind = 'challenge-page';
        d.visible = true;
      }
      return d;
    },
  },
  {
    id: 'netease-yidun',
    name: 'NetEase Yidun',
    vendor: 'NetEase',
    kind: 'widget',
    subtype: 'slider',
    site: 'https://dun.163.com',
    scripts: [/\bcstaticdun\.126\.net\//i, /\b(?:c|cstatic|webzjcaptcha)\.dun\.163(?:yun)?\.com\//i],
    elements: ['.yidun_slider', '.yidun_panel', '.yidun_popup', ['.yidun', 0.85]],
    globals: ['initNECaptcha', 'initNECaptchaWithFallback'],
  },
  {
    id: 'dingxiang',
    name: 'Dingxiang Captcha',
    vendor: 'Dingxiang',
    kind: 'widget',
    subtype: 'slider',
    site: 'https://www.dingxiang-inc.com',
    scripts: [/\bdingxiang-inc\.com\//i],
    elements: ['.dx_captcha', ['[class*="dx_captcha"]', 0.85]],
    globals: [['_dx', 0.6]],
  },
  {
    id: 'shumei',
    name: 'Shumei Captcha',
    vendor: 'Shumei',
    kind: 'widget',
    subtype: 'slider',
    site: 'https://www.ishumei.com',
    scripts: [/\bcastatic\.fengkongcloud\.(?:com|cn)\//i, [/\bsmcp(?:\.min)?\.js/i, 0.85], [/\bfengkongcloud\.(?:com|cn)\//i, 0.6]],
    elements: ['.shumei_captcha_wrapper', ['[class*="shumei_captcha"]', 0.9]],
    globals: ['initSMCaptcha'],
  },
  {
    id: 'vaptcha',
    name: 'VAPTCHA',
    vendor: 'VAPTCHA',
    kind: 'widget',
    site: 'https://www.vaptcha.com',
    scripts: [/\bvaptcha\.(?:com|net)\//i],
    elements: ['.vaptcha-container', '#vaptchaContainer', '[data-vaptcha]'],
    globals: [['vaptcha', 0.8]],
  },
  {
    id: 'luosimao',
    name: 'Luosimao Captcha',
    vendor: 'Luosimao',
    kind: 'widget',
    site: 'https://luosimao.com/service/captcha',
    scripts: [/\bcaptcha\.luosimao\.com\//i],
    frames: [/\bcaptcha\.luosimao\.com\//i],
    elements: ['.l-captcha', 'input[name="luotest_response"]'],
  },
  {
    id: 'lemin',
    name: 'Lemin Captcha',
    vendor: 'Lemin',
    kind: 'widget',
    subtype: 'puzzle',
    site: 'https://www.leminnow.com',
    scripts: [/\b(?:api\.)?leminnow\.com\//i],
    elements: ['#lemin-cropped-captcha', ['[id^="lemin-cropped-captcha"]', 0.9], 'input[name="lemin_challenge_id"]', 'input[name="lemin_answer"]'],
  },
  {
    id: 'captchafox',
    name: 'CaptchaFox',
    vendor: 'CaptchaFox',
    kind: 'widget',
    site: 'https://captchafox.com',
    scripts: [/\b(?:cdn|api|s)\.captchafox\.com\//i, /@captchafox\//i],
    frames: [/\bcaptchafox\.com\//i],
    elements: ['.captchafox', ['[data-captchafox-sitekey]', 0.9]],
    globals: [['captchafox', 0.85]],
  },
  {
    id: 'procaptcha',
    name: 'Procaptcha',
    vendor: 'Prosopo',
    kind: 'widget',
    site: 'https://prosopo.io',
    scripts: [/\bjs\.prosopo\.io\//i, /@prosopo\//i, [/\bprocaptcha(?:\.bundle)?\.js/i, 0.9]],
    elements: ['.procaptcha', 'input[name="procaptcha-response"]'],
    globals: [['procaptcha', 0.8]],
  },
  {
    id: 'keycaptcha',
    name: 'KeyCAPTCHA',
    vendor: 'KeyCAPTCHA',
    kind: 'widget',
    subtype: 'puzzle',
    site: 'https://www.keycaptcha.com',
    scripts: [/\bkeycaptcha\.com\//i],
    elements: ['#div_for_keycaptcha', ['[id*="keycaptcha" i]', 0.8]],
    inline: [/\bs_s_c_(?:user_id|session_id|web_server_sign)\b/],
    globals: ['s_s_c_user_id'],
  },
  {
    id: 'capy',
    name: 'Capy Puzzle CAPTCHA',
    vendor: 'Capy',
    kind: 'widget',
    subtype: 'puzzle',
    site: 'https://www.capy.me',
    scripts: [/\bcapy\.me\//i],
    frames: [/\bcapy\.me\//i],
    elements: ['.capy-captcha', 'input[name="capy_captchakey"]', 'input[name="capy_challengekey"]', 'input[name="capy_answer"]'],
  },
  {
    id: 'solvemedia',
    name: 'Solve Media',
    vendor: 'Solve Media',
    kind: 'image',
    site: 'https://www.solvemedia.com',
    scripts: [/\bsolvemedia\.com\//i],
    frames: [/\bsolvemedia\.com\//i],
    elements: ['#adcopy-outer', 'input[name="adcopy_response"]', '#adcopy_response', 'input[name="adcopy_challenge"]'],
    globals: ['ACPuzzle'],
  },
  {
    id: 'cutcaptcha',
    name: 'Cutcaptcha',
    vendor: 'Cutcaptcha',
    kind: 'widget',
    subtype: 'puzzle',
    site: 'https://www.cutcaptcha.com',
    scripts: [/\bcutcaptcha\.(?:net|com)\//i],
    frames: [/\bcutcaptcha\.(?:net|com)\//i],
    elements: [['#puzzle-captcha', 0.7], ['input[name="cap_token"]', 0.5]],
    inline: [/\bCUTCAPTCHA_MISERY_KEY\b/],
    globals: ['CUTCAPTCHA_MISERY_KEY'],
  },
  {
    id: 'cybersiara',
    name: 'CyberSiARA',
    vendor: 'CyberSiARA',
    kind: 'widget',
    subtype: 'slider',
    site: 'https://www.cybersiara.com',
    scripts: [/\b(?:embed\.)?mycybersiara\.com\//i, /\bcybersiara\.com\//i],
    elements: [['.SiaraShield', 0.85], ['[class*="SiaraShield"]', 0.8]],
    inline: [[/\bSiaraShield\b|\bCyberSiara\b/i, 0.4]],
  },
  {
    id: 'atbcaptcha',
    name: 'atbCAPTCHA',
    vendor: 'aisecurius',
    kind: 'widget',
    site: 'https://www.aisecurius.com',
    scripts: [/\baisecurius\.com\//i],
    inline: [[/\batbCaptcha\b|\batb-captcha\b/i, 0.4]],
  },
  {
    id: 'mcaptcha',
    name: 'mCaptcha',
    vendor: 'mCaptcha',
    kind: 'widget',
    subtype: 'proof-of-work',
    site: 'https://mcaptcha.org',
    scripts: [/@mcaptcha\//i, [/\bmcaptcha\b/i, 0.7]],
    frames: [[/\bmcaptcha\b/i, 0.75], [/\/widget\/?\?sitekey=/i, 0.6]],
    elements: ['#mcaptcha__widget-container', ['[id^="mcaptcha"]', 0.85], ['.mcaptcha', 0.8]],
  },
  {
    id: 'altcha',
    name: 'ALTCHA',
    vendor: 'ALTCHA',
    kind: 'widget',
    subtype: 'proof-of-work',
    site: 'https://altcha.org',
    scripts: [/altcha-org\/altcha/i, /\baltcha(?:\.min)?\.(?:js|umd\.cjs)/i, [/\baltcha\b/i, 0.6]],
    elements: ['altcha-widget', ['input[name="altcha"]', 0.8]],
  },
  {
    id: 'cap',
    name: 'Cap',
    vendor: 'Cap (open source)',
    kind: 'widget',
    subtype: 'proof-of-work',
    site: 'https://capjs.js.org',
    scripts: [/@cap\.js\/widget/i, [/\bcap(?:\.min)?\.js\b/i, 0.3]],
    elements: ['cap-widget', ['input[name="cap-token"]', 0.8]],
  },
  {
    id: 'private-captcha',
    name: 'Private Captcha',
    vendor: 'Private Captcha',
    kind: 'widget',
    subtype: 'proof-of-work',
    site: 'https://privatecaptcha.com',
    scripts: [/\bprivatecaptcha\.com\//i],
    elements: [['.private-captcha', 0.85], ['input[name="private-captcha-solution"]', 0.9]],
  },
  {
    id: 'trustcaptcha',
    name: 'TrustCaptcha',
    vendor: 'TrustComponent',
    kind: 'widget',
    site: 'https://www.trustcomponent.com',
    scripts: [/\btrustcomponent\.com\//i, /@trustcomponent\//i],
    elements: ['trustcaptcha-component'],
  },
  {
    id: 'mosparo',
    name: 'mosparo',
    vendor: 'mosparo (open source)',
    kind: 'widget',
    site: 'https://mosparo.io',
    scripts: [/mosparo-frontend(?:\.min)?\.js/i, [/\bmosparo\b/i, 0.6]],
    elements: ['.mosparo__container', ['[id^="mosparo-box"]', 0.9], ['[class*="mosparo__"]', 0.85]],
    globals: [['mosparo', 0.7]],
  },
  {
    id: 'botpoison',
    name: 'Botpoison',
    vendor: 'Botpoison',
    kind: 'invisible',
    subtype: 'proof-of-work',
    site: 'https://botpoison.com',
    scripts: [/@botpoison\//i, /\bbotpoison\.com\//i],
    elements: [['[data-botpoison-public-key]', 0.9]],
    globals: [['Botpoison', 0.8]],
  },
  {
    id: 'botdetect',
    name: 'BotDetect CAPTCHA',
    vendor: 'Captcha Inc.',
    kind: 'image',
    site: 'https://captcha.com',
    scripts: [[/botdetect/i, 0.8]],
    elements: [
      '.BDC_CaptchaDiv',
      '.BDC_CaptchaImageDiv',
      ['[class*="BDC_Captcha"]', 0.9],
      { sel: 'img', attr: ['src'], re: /botdetectcaptcha|simple-captcha-endpoint/i, w: 0.95 },
    ],
    globals: [['BotDetect', 0.8]],
  },
  {
    id: 'securimage',
    name: 'Securimage / SI CAPTCHA',
    vendor: 'Securimage',
    kind: 'image',
    site: 'https://www.phpcaptcha.org',
    elements: [{ sel: 'img', attr: ['src', 'id'], re: /securimage|si_image/i, w: 0.95 }, ['input[name="captcha_code"]', 0.45]],
  },
  {
    id: 'wpcf7-captcha',
    name: 'Really Simple CAPTCHA (Contact Form 7)',
    vendor: 'Contact Form 7',
    kind: 'image',
    site: 'https://wordpress.org/plugins/really-simple-captcha/',
    elements: ['.wpcf7-captchac', ['.wpcf7-captchar', 0.9], { sel: 'img', attr: ['src'], re: /wpcf7_captcha/i, w: 0.95 }],
  },
  {
    id: 'wpcf7-quiz',
    name: 'Contact Form 7 Quiz',
    vendor: 'Contact Form 7',
    kind: 'question',
    site: 'https://contactform7.com/quiz/',
    elements: ['.wpcf7-quiz', ['input[name="_wpcf7_quiz_answer_your-quiz"]', 0.9], ['.wpcf7-quiz-label', 0.9]],
  },

  // ───────────────────────────── Bot-check and challenge pages ─────────────────────────────
  {
    id: 'cloudflare-challenge',
    name: 'Cloudflare challenge page',
    vendor: 'Cloudflare',
    kind: 'challenge-page',
    site: 'https://developers.cloudflare.com/waf/reference/cloudflare-challenges/',
    // "Attention Required! | Cloudflare" is used by both the old captcha page and the block page: the text decides.
    title: [[/^just a moment\.{0,3}$/i, 0.8], [/^one more step!? \| cloudflare$/i, 0.6]],
    inline: [[/\bwindow\._cf_chl_opt\b|\b_cf_chl_opt\s*=/, 0.95], [/\bcf_chl_(?:prog|jschl_tk|captcha_tk|managed_tk|rc_[im]|f_tk)\b/, 0.9], [/\bjschl_(?:vc|answer)\b/, 0.9]],
    scripts: [[/\/cdn-cgi\/challenge-platform\/(?:h\/[a-z]\/)?orchestrate\/(?:chl_page|jsch|captcha|managed|chl_api)\//i, 0.95]],
    elements: [
      '#challenge-form',
      '#challenge-running',
      '#challenge-stage',
      '#challenge-body-text',
      '#challenge-error-text',
      '#cf-challenge-running',
      '#cf-please-wait',
      '.cf-browser-verification',
      '#trk_jschal_js',
      { sel: 'form', attr: ['action'], re: /__cf_chl_(?:f|jschl|captcha|managed|rt)_tk/i, w: 0.95 },
    ],
    urls: [[/[?&]__cf_chl_(?:rt|f|jschl|captcha|managed|tk)_tk=/i, 0.9]],
    headers: [['cf-mitigated', /challenge/i, 0.95], ['server', /cloudflare/i, 0.15]],
    status: [403, 503, 429],
    text: [
      [/checking if the site connection is secure/i, 0.85],
      [/needs to review the security of your connection before proceeding/i, 0.85],
      [/verify you are human by completing the action below/i, 0.85],
      [/checking your browser before accessing/i, 0.7],
      [/ddos protection by cloudflare/i, 0.8],
      [/please complete the security check to access/i, 0.75],
      [/enable javascript and cookies to continue/i, 0.6],
      [/performance (?:&|and) security by cloudflare/i, 0.35],
    ],
    refine(d, x) {
      // 'Performance & security by Cloudflare' and the server header alone are on every Cloudflare error page.
      if (d.confidence < 0.6) return null;
      d.subtype = x.has('turnstile') ? 'turnstile' : 'js-challenge';
      return d;
    },
  },
  {
    id: 'cloudflare-block',
    name: 'Cloudflare block page',
    vendor: 'Cloudflare',
    kind: 'block-page',
    site: 'https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/',
    title: [[/attention required! \| cloudflare/i, 0.5], [/access denied \| .* used cloudflare to restrict access/i, 0.9]],
    elements: ['#cf-error-details', '.cf-error-details', '[data-translate="blocked_why_headline"]', ['#cf-wrapper', 0.7]],
    text: [[/sorry, you have been blocked/i, 0.75], [/you are unable to access/i, 0.55], [/cloudflare ray id/i, 0.4]],
    refine(d, x) {
      if (x.has('cloudflare-challenge') || d.confidence < 0.6) return null;
      return d;
    },
  },
  {
    id: 'google-sorry',
    name: 'Google unusual traffic page',
    vendor: 'Google',
    kind: 'challenge-page',
    subtype: 'recaptcha',
    site: 'https://support.google.com/websearch/answer/86640',
    urls: [[/\bgoogle\.[a-z.]+\/sorry\//i, 0.95]],
    elements: [['form#captcha-form', 0.7], { sel: 'form', attr: ['action'], re: /\/sorry\/index/i, w: 0.9 }],
    text: [[/our systems have detected unusual traffic from your computer network/i, 0.95]],
  },
  {
    id: 'amazon-captcha',
    name: 'Amazon robot check',
    vendor: 'Amazon',
    kind: 'challenge-page',
    subtype: 'text-image',
    site: 'https://www.amazon.com',
    elements: [{ sel: 'form', attr: ['action'], re: /\/errors\/validateCaptcha/i, w: 0.95 }, { sel: 'img', attr: ['src'], re: /ssl-images-amazon\.com\/captcha\//i, w: 0.9 }],
    text: [[/enter the characters you see below/i, 0.75], [/type the characters you see in this image/i, 0.7], [/sorry, we just need to make sure you(?:'|’)re not a robot/i, 0.85]],
  },
  {
    id: 'datadome',
    name: 'DataDome',
    vendor: 'DataDome',
    kind: 'protection',
    site: 'https://datadome.co',
    scripts: [/\bjs\.datadome\.co\//i, [/\bdatadome\.co\//i, 0.8], [/\btags\.js\?.*datadome/i, 0.8]],
    inline: [[/\bddjskey\b|\bddoptions\b/, 0.8]],
    cookies: [['datadome', 0.7]],
    headers: [['x-datadome', /./, 0.85], ['x-dd-b', /./, 0.7], ['x-datadome-cid', /./, 0.85]],
    refine(d, x) {
      return x.has('datadome-captcha') ? null : d;
    },
  },
  {
    id: 'datadome-captcha',
    name: 'DataDome captcha',
    vendor: 'DataDome',
    kind: 'challenge-page',
    site: 'https://datadome.co',
    frames: [/\bgeo\.captcha-delivery\.com\/(?:captcha|interstitial)\//i, [/\bcaptcha-delivery\.com\//i, 0.9]],
    scripts: [/\bct\.captcha-delivery\.com\//i, [/\bcaptcha-delivery\.com\//i, 0.85]],
    inline: [[/\bvar dd\s*=\s*\{[^}]*['"]?(?:rt|cid|hsh)['"]?\s*:/, 0.9]],
    globals: [[(w) => !!(w.dd && typeof w.dd === 'object' && !w.dd.nodeType && (w.dd.cid || w.dd.hsh) && w.dd.rt), 0.9]],
    elements: [['iframe[title*="DataDome" i]', 0.9]],
    refine(d, x) {
      const interstitial = x.frames(/\/interstitial\//i).length > 0 || /['"]?rt['"]?\s*:\s*['"]i['"]/.test(x.inline) || x.global('dd.rt') === 'i';
      d.subtype = interstitial ? 'interstitial' : 'slider';
      if (!x.short && !interstitial) {
        // A captcha frame inside a normal page: the overlay variant.
        d.kind = 'widget';
        d.visible = x.anyVisible(x.frames(/captcha-delivery\.com/i));
      } else d.visible = true;
      return d;
    },
  },
  {
    id: 'perimeterx',
    name: 'HUMAN (PerimeterX)',
    vendor: 'HUMAN Security',
    kind: 'protection',
    site: 'https://www.humansecurity.com',
    scripts: [/\bclient\.(?:perimeterx\.net|px-cdn\.net|px-cloud\.net)\//i, /\b(?:collector-)?px[a-z0-9]*\.(?:perimeterx\.net|px-cdn\.net|px-cloud\.net)\//i, [/\/px[a-z0-9]{6,10}\/init\.js/i, 0.85], [/\bperimeterx\.net\//i, 0.85]],
    inline: [[/\bwindow\._pxAppId\s*=|\b_pxAppId\s*=/, 0.85]],
    globals: [['_pxAppId', 0.85]],
    cookies: [['_px3', 0.65], ['_pxhd', 0.6], ['_pxvid', 0.6], ['pxcts', 0.5], ['_pxff_', 0.5]],
    refine(d, x) {
      return x.has('perimeterx-captcha') ? null : d;
    },
  },
  {
    id: 'perimeterx-captcha',
    name: 'HUMAN (PerimeterX) press & hold',
    vendor: 'HUMAN Security',
    kind: 'challenge-page',
    subtype: 'press-and-hold',
    site: 'https://www.humansecurity.com',
    elements: ['#px-captcha', '#px-captcha-wrapper', '.px-captcha-container', ['[id^="px-captcha"]', 0.9]],
    scripts: [/\bcaptcha\.(?:px-cdn|px-cloud)\.net\//i, [/\/captcha\/captcha\.js\?a=c/i, 0.85]],
    frames: [[/\bcaptcha\.(?:px-cdn|px-cloud)\.net\//i, 0.9]],
    inline: [[/\b_pxCaptcha|\bwindow\._pxBlockedUrl\b|\b_pxUuid\s*=/, 0.8]],
    title: [[/^access to this page has been denied\.?$/i, 0.7]],
    text: [[/press (?:&|and) hold to confirm you are(?: a)? human/i, 0.9], [/press (?:&|and) hold/i, 0.5]],
    refine(d, x) {
      if (x.short || d.kind !== 'challenge-page') d.visible = true;
      if (!x.short) {
        d.kind = 'widget';
        d.visible = x.anyVisible(x.query('#px-captcha'));
      }
      return d;
    },
  },
  {
    id: 'akamai-bot-manager',
    name: 'Akamai Bot Manager',
    vendor: 'Akamai',
    kind: 'protection',
    site: 'https://www.akamai.com/products/bot-manager',
    scripts: [[/\/akam\/\d+\/[a-z0-9]+/i, 0.8]],
    inline: [[/\bbmak\.(?:js_post|sensor_data|startTracking)\b/, 0.8]],
    globals: [['bmak', 0.8]],
    cookies: [['_abck', 0.7], ['bm_sz', 0.65], ['ak_bmsc', 0.6], ['bm_sv', 0.5], ['bm_mi', 0.5]],
    refine(d, x) {
      return x.has('akamai-challenge') ? null : d;
    },
  },
  {
    id: 'akamai-challenge',
    name: 'Akamai challenge page',
    vendor: 'Akamai',
    kind: 'challenge-page',
    site: 'https://www.akamai.com/products/bot-manager',
    elements: ['#sec-if-cpt-container', '#sec-cpt-if', ['#sec-text-container', 0.8], ['#sec-container', 0.6]],
    scripts: [/\/_sec\/cp_challenge\//i],
    frames: [/\/_sec\/cp_challenge\//i],
    inline: [[/\/_sec\/(?:cp_challenge|verify)/i, 0.85], [/\bsec-if-cpt\b|\bsec_cpt\b/i, 0.8]],
    text: [[/powered and protected by akamai/i, 0.6]],
  },
  {
    id: 'akamai-block',
    name: 'Akamai access denied',
    vendor: 'Akamai',
    kind: 'block-page',
    site: 'https://www.akamai.com',
    title: [[/^access denied$/i, 0.45]],
    text: [[/you don(?:'|’)t have permission to access/i, 0.6], [/reference\s*#\s*\d+\.[0-9a-f]+\.\d+\.[0-9a-f]+/i, 0.9], [/errors\.edgesuite\.net/i, 0.9, 'any']],
    elements: [{ sel: 'a', attr: ['href'], re: /errors\.edgesuite\.net/i, w: 0.9 }],
    headers: [['server', /akamaighost/i, 0.35]],
    refine(d, x) {
      return d.confidence < 0.6 ? null : d;
    },
  },
  {
    id: 'imperva',
    name: 'Imperva (Incapsula)',
    vendor: 'Imperva',
    kind: 'protection',
    site: 'https://www.imperva.com/products/advanced-bot-protection-management/',
    scripts: [[/\/_Incapsula_Resource\?/i, 0.85]],
    cookies: [['incap_ses_', 0.65], ['visid_incap_', 0.65], ['nlbi_', 0.4], ['reese84', 0.7]],
    headers: [['x-iinfo', /./, 0.7], ['x-cdn', /imperva|incapsula/i, 0.8]],
    refine(d, x) {
      return x.has('imperva-challenge') || x.has('imperva-abp') ? null : d;
    },
  },
  {
    id: 'imperva-challenge',
    name: 'Imperva (Incapsula) challenge page',
    vendor: 'Imperva',
    kind: 'challenge-page',
    site: 'https://www.imperva.com',
    frames: [[/\/_Incapsula_Resource\?/i, 0.9]],
    elements: [{ sel: 'iframe', attr: ['src'], re: /_Incapsula_Resource/i, w: 0.9 }],
    text: [[/request unsuccessful\.? incapsula incident id/i, 0.9], [/incapsula incident id/i, 0.85], [/additional security check is required/i, 0.6]],
    inline: [[/_Incapsula_Resource\?SWUDNSAI/i, 0.85]],
  },
  {
    id: 'imperva-abp',
    name: 'Imperva Advanced Bot Protection (Distil)',
    vendor: 'Imperva',
    kind: 'challenge-page',
    site: 'https://www.imperva.com/products/advanced-bot-protection-management/',
    title: [[/^pardon our interruption\.{0,3}$/i, 0.85]],
    text: [[/something about your browser made us think you were a bot/i, 0.9]],
    inline: [[/\bdistil_(?:r_captcha|r_blocked|identify_cookie)\b/i, 0.8]],
    cookies: [[/^D_(?:IID|UID|ZID|ZUID|HID|SID)$/, 0.45]],
  },
  {
    id: 'kasada',
    name: 'Kasada',
    vendor: 'Kasada',
    kind: 'protection',
    site: 'https://www.kasada.io',
    scripts: [[new RegExp(`/${UUID}/${UUID}/(?:ips|p)\\.js`, 'i'), 0.9]],
    inline: [[/\bKPSDK\b/, 0.85]],
    globals: [['KPSDK', 0.9]],
    headers: [['x-kpsdk-ct', /./, 0.8], ['x-kpsdk-cd', /./, 0.7], ['x-kpsdk-v', /./, 0.7], ['x-kpsdk-r', /./, 0.7]],
    cookies: [['KP_UIDz', 0.6], ['KP_UIDz-ssn', 0.6]],
    refine(d, x) {
      if (x.status === 429 || (x.dom === false && x.textLength < 200 && /ips\.js/.test(d.evidence.map((e) => e.value).join(' ')))) {
        d.kind = 'challenge-page';
        d.subtype = 'silent-challenge';
        d.visible = true;
      }
      return d;
    },
  },
  {
    id: 'f5-asm',
    name: 'F5 BIG-IP ASM',
    vendor: 'F5',
    kind: 'block-page',
    site: 'https://www.f5.com/products/big-ip-services/advanced-waf',
    text: [[/the requested url was rejected\.? please consult with your administrator/i, 0.95], [/your support id is:?\s*\d+/i, 0.6], [/what code is in the image\??/i, 0.8]],
    cookies: [[/^TS[0-9a-f]{6,8}(?:_\d+)?$/, 0.35]],
    refine(d, x) {
      if (/what code is in the image/i.test(x.text)) {
        d.name = 'F5 BIG-IP ASM CAPTCHA';
        d.kind = 'challenge-page';
        d.subtype = 'text-image';
        d.visible = true;
      } else if (d.confidence < 0.6) {
        d.kind = 'protection';
      }
      return d;
    },
  },
  {
    id: 'sucuri',
    name: 'Sucuri Website Firewall',
    vendor: 'Sucuri',
    kind: 'protection',
    site: 'https://sucuri.net/website-firewall/',
    title: [[/sucuri website firewall/i, 0.9]],
    text: [[/sucuri website firewall/i, 0.8]],
    inline: [[/\bsucuri_cloudproxy_js\b/, 0.95]],
    headers: [['x-sucuri-id', /./, 0.7], ['x-sucuri-cache', /./, 0.5], ['server', /sucuri|cloudproxy/i, 0.6]],
    cookies: [['sucuri_cloudproxy_uuid_', 0.5]],
    refine(d, x) {
      if (/sucuri_cloudproxy_js/.test(x.inline)) {
        d.kind = 'challenge-page';
        d.subtype = 'js-challenge';
        d.visible = true;
      } else if (/access denied/i.test(x.title + ' ' + x.text) && x.short) {
        d.kind = 'block-page';
      }
      return d;
    },
  },
  {
    id: 'ddos-guard',
    name: 'DDoS-Guard',
    vendor: 'DDoS-Guard',
    kind: 'protection',
    site: 'https://ddos-guard.net',
    scripts: [[/\bcheck\.ddos-guard\.net\//i, 0.95], [/\/\.well-known\/ddos-guard\//i, 0.9]],
    title: [[/^ddos-guard$/i, 0.85]],
    elements: [['#ddg-captcha', 0.85], ['[id^="ddg-"]', 0.5]],
    headers: [['server', /ddos-guard/i, 0.6]],
    cookies: [['__ddg1_', 0.55], ['__ddg2_', 0.55], ['__ddgid_', 0.55], ['__ddgmark_', 0.55], ['__ddg_', 0.5]],
    refine(d, x) {
      if (d.evidence.some((e) => e.type === 'title' || e.type === 'elements' || /check\.ddos-guard|well-known\/ddos-guard/i.test(e.value))) {
        d.kind = 'challenge-page';
        d.visible = true;
      }
      return d;
    },
  },
  {
    id: 'qrator',
    name: 'Qrator',
    vendor: 'Qrator Labs',
    kind: 'protection',
    site: 'https://qrator.net',
    scripts: [[/\/__qrator\//i, 0.9]],
    headers: [['server', /qrator/i, 0.7]],
    refine(d, x) {
      if (x.short && d.evidence.some((e) => e.type === 'scripts')) {
        d.kind = 'challenge-page';
        d.visible = true;
      }
      return d;
    },
  },
  {
    id: 'stormwall',
    name: 'StormWall',
    vendor: 'StormWall',
    kind: 'protection',
    site: 'https://stormwall.network',
    scripts: [[/\bstormwall\.pro\//i, 0.9]],
    title: [[/stormwall/i, 0.7]],
    inline: [[/\bstormwall\b/i, 0.6]],
    cookies: [['swp_token', 0.6]],
    refine(d, x) {
      if (x.short && d.confidence > 0.7) {
        d.kind = 'challenge-page';
        d.visible = true;
      }
      return d;
    },
  },
  {
    id: 'reblaze',
    name: 'Reblaze',
    vendor: 'Reblaze',
    kind: 'protection',
    site: 'https://www.reblaze.com',
    cookies: [['rbzid', 0.7], ['rbzsessionid', 0.6]],
    headers: [['server', /reblaze/i, 0.8]],
    inline: [[/\brbzns\b/, 0.75]],
    refine(d, x) {
      if (x.short && /\brbzns\b/.test(x.inline)) {
        d.kind = 'challenge-page';
        d.visible = true;
      }
      return d;
    },
  },
  {
    id: 'radware',
    name: 'Radware Bot Manager (ShieldSquare)',
    vendor: 'Radware',
    kind: 'protection',
    site: 'https://www.radware.com/products/bot-manager/',
    scripts: [[/\b(?:cdn|validate)\.perfdrive\.com\//i, 0.9]],
    urls: [[/\bvalidate\.perfdrive\.com\//i, 0.95]],
    title: [[/radware bot manager captcha/i, 0.95]],
    text: [[/radware bot manager/i, 0.7]],
    cookies: [['__uzma', 0.5], ['__uzmb', 0.5], ['__uzmc', 0.5], ['__uzmd', 0.5], ['__ssds', 0.45]],
    refine(d, x) {
      if (/validate\.perfdrive\.com/i.test(x.url) || /radware bot manager/i.test(x.title) || (x.short && /radware bot manager/i.test(x.text))) {
        d.kind = 'challenge-page';
        d.visible = true;
      }
      return d;
    },
  },
  {
    id: 'netacea',
    name: 'Netacea',
    vendor: 'Netacea',
    kind: 'protection',
    site: 'https://netacea.com',
    cookies: [[/^_mitata/, 0.6]],
    scripts: [[/\bnetacea\.com\//i, 0.8]],
  },
  {
    id: 'vercel-challenge',
    name: 'Vercel Security Checkpoint',
    vendor: 'Vercel',
    kind: 'challenge-page',
    site: 'https://vercel.com/docs/vercel-firewall',
    title: [[/vercel security checkpoint/i, 0.95]],
    scripts: [[/\/\.well-known\/vercel\/security\//i, 0.95]],
    headers: [['x-vercel-mitigated', /challenge/i, 0.95]],
    text: [[/we(?:'|’)re verifying your browser/i, 0.7]],
  },
  {
    id: 'anubis',
    name: 'Anubis',
    vendor: 'Techaro (open source)',
    kind: 'challenge-page',
    subtype: 'proof-of-work',
    site: 'https://anubis.techaro.lol',
    title: [[/making sure you(?:'|’)re not a bot!?/i, 0.9]],
    elements: ['#anubis_challenge', '#anubis_version', ['[id^="anubis_"]', 0.8]],
    scripts: [/\/\.within\.website\/x\/cmd\/anubis\//i],
    text: [[/protected by anubis/i, 0.7]],
    cookies: [[/anubis-auth/i, 0.6]],
  },
  {
    id: 'sg-captcha',
    name: 'SiteGround SG-Captcha',
    vendor: 'SiteGround',
    kind: 'challenge-page',
    site: 'https://www.siteground.com',
    urls: [[/\/\.well-known\/sgcaptcha\//i, 0.95]],
    scripts: [[/\/\.well-known\/sgcaptcha\//i, 0.95]],
    frames: [[/\/\.well-known\/sgcaptcha\//i, 0.95]],
    inline: [[/\.well-known\/sgcaptcha/i, 0.9]],
    title: [[/robot challenge screen/i, 0.7]],
  },
  {
    id: 'litespeed-recaptcha',
    name: 'LiteSpeed reCAPTCHA',
    vendor: 'LiteSpeed',
    kind: 'challenge-page',
    site: 'https://docs.litespeedtech.com/lsws/cp/cpanel/antibot/',
    urls: [[/\/\.lsrecap\//i, 0.95]],
    inline: [[/\/\.lsrecap\/recaptcha/i, 0.95]],
    elements: [{ sel: 'form', attr: ['action'], re: /\.lsrecap/i, w: 0.95 }],
  },
  {
    id: 'imunify360',
    name: 'Imunify360 bot protection',
    vendor: 'CloudLinux',
    kind: 'challenge-page',
    site: 'https://www.imunify360.com',
    text: [[/access denied by imunify360 bot-protection/i, 0.95], [/imunify360/i, 0.7]],
    title: [[/imunify360/i, 0.8]],
    scripts: [[/imunify360/i, 0.8]],
  },
  {
    id: 'bitninja',
    name: 'BitNinja captcha',
    vendor: 'BitNinja',
    kind: 'challenge-page',
    site: 'https://bitninja.com',
    text: [[/security check by bitninja/i, 0.95], [/bitninja/i, 0.65]],
    title: [[/bitninja/i, 0.75]],
  },
  {
    id: 'wordfence',
    name: 'Wordfence block page',
    vendor: 'Defiant',
    kind: 'block-page',
    site: 'https://www.wordfence.com',
    text: [[/your access to this site has been limited by the site owner/i, 0.9], [/generated by wordfence/i, 0.8]],
  },
  {
    id: 'yandex-showcaptcha',
    name: 'Yandex robot check',
    vendor: 'Yandex',
    kind: 'challenge-page',
    site: 'https://yandex.com/support/captcha/',
    urls: [[/\/(?:showcaptcha|checkcaptcha)\b/i, 0.8]],
    elements: ['.CheckboxCaptcha', '.AdvancedCaptcha', '#checkbox-captcha-form', { sel: 'form', attr: ['action'], re: /\/checkcaptcha/i, w: 0.9 }],
    text: [[/подтвердите,? что запросы отправляли вы,? а не робот/i, 0.9], [/please confirm that you and not a robot are sending requests/i, 0.9]],
  },
  {
    id: 'vk-captcha',
    name: 'VK captcha',
    vendor: 'VK',
    kind: 'challenge-page',
    site: 'https://vk.com',
    urls: [[/\bid\.vk\.com\/not_robot_captcha|\/not_robot_captcha\b/i, 0.9]],
    elements: [{ sel: 'img', attr: ['src'], re: /\bvk\.com\/captcha\.php|\/captcha\.php\?sid=/i, w: 0.85 }],
    refine(d, x) {
      if (!/not_robot_captcha/i.test(x.url)) {
        d.kind = 'image';
        d.visible = x.anyVisible(x.query('img'), (n) => /captcha\.php/i.test(n.attr('src') || ''));
      }
      return d;
    },
  },
  {
    id: 'baidu-captcha',
    name: 'Baidu security check',
    vendor: 'Baidu',
    kind: 'widget',
    subtype: 'rotate',
    site: 'https://www.baidu.com',
    urls: [[/\bwappass\.baidu\.com\/static\/captcha\//i, 0.95]],
    scripts: [[/\bwappass\.baidu\.com\/static\/captcha/i, 0.9], [/\bppui-static-(?:pc|wap)\.cdn\.bcebos\.com\/.*captcha/i, 0.85]],
    elements: ['.passMod_spin-wrap', ['.vcode-spin', 0.85], ['[class*="vcode-spin"]', 0.8]],
    text: [[/百度安全验证/, 0.9]],
    refine(d, x) {
      if (/wappass\.baidu\.com\/static\/captcha/i.test(x.url) || x.short) {
        d.kind = 'challenge-page';
        d.visible = true;
      }
      return d;
    },
  },

  // ───────────────────────────── Catch-all rules ─────────────────────────────
  {
    id: 'generic-image-captcha',
    name: 'Image captcha',
    vendor: null,
    kind: 'image',
    subtype: 'text-image',
    generic: true,
    elements: [
      {
        sel: 'img',
        attr: ['src', 'id', 'class', 'alt', 'name', 'title'],
        re: CAPTCHA_IMG,
        w: 0.75,
      },
      { sel: 'canvas', attr: ['id', 'class'], re: /captch|verif(?:y|ication)_?code|check_?code/i, w: 0.7 },
      {
        sel: 'input:not([type="hidden"])',
        attr: ['name', 'id', 'placeholder', 'aria-label', 'class'],
        re: /captch|kaptcha|check_?code|verif(?:y|ication)_?code|valid(?:ate)?_?code|(?:^|[^a-z])v_?code|image_?code|img_?code|pic_?code|auth_?code|(?:^|[^a-z])yzm(?:[^a-z]|$)|验证码|驗證碼|認証コード|画像認証|보안 ?문자|자동입력/i,
        w: 0.45,
      },
    ],
    text: [[/(?:enter|type) the (?:characters|code|text|letters|numbers|word)s? (?:you see|shown|displayed|in the (?:image|picture|box))|图形验证码|图片验证码|看不清[，,]?换一张|画像に表示されている文字/i, 0.6, 'any']],
    refine(d, x) {
      const imgs = captchaImages(x);
      const other = d.evidence.some((e) => e.type === 'text' || (e.type === 'elements' && /^input/.test(e.value)));
      if (!(imgs.length && other)) return null;
      d.visible = x.anyVisible(imgs);
      return d;
    },
  },
  {
    id: 'generic-question',
    name: 'Question / math captcha',
    vendor: null,
    kind: 'question',
    generic: true,
    elements: [
      { sel: 'input:not([type="hidden"])', attr: ['name', 'id', 'class', 'placeholder', 'aria-label'], re: /captch|quiz|math|(?:^|[^a-z])sum(?:[^a-z]|$)|security_?(?:question|answer)|antispam|anti-spam|human/i, w: 0.5 },
      { sel: 'input:not([type="hidden"])', attr: ['name', 'id'], re: /text_?captcha|captcha_?(?:answer|question|text)|question_?captcha/i, w: 0.6 },
    ],
    text: [
      [/(?:what is|what's|solve|calculate|how much is|wie viel ist|cuánto es|combien font)\s*:?\s*\d{1,3}\s*(?:\+|plus|-|minus|−|×|x|\*|times)\s*\d{1,3}\s*(?:=\s*)?\??/i, 0.6, 'any'],
      [/\b\d{1,3}\s*(?:\+|−|-|×|x|\*)\s*\d{1,3}\s*=\s*(?:\?|_{2,})/i, 0.55, 'any'],
    ],
    refine(d, x) {
      const input = d.evidence.some((e) => e.type === 'elements');
      const text = d.evidence.some((e) => e.type === 'text');
      // An answer field named like a text captcha, with no captcha image next to it.
      const named = d.evidence.some((e) => e.type === 'elements' && /text_?captcha|captcha_?(?:answer|question|text)|question_?captcha/i.test(e.value));
      const image = captchaImages(x).length > 0;
      if (!(input && text) && !(named && !image)) return null;
      const inputs = x.query('input').filter((n) => /captch|quiz|math|answer/i.test([n.attr('name'), n.attr('id')].join(' ')));
      d.visible = x.anyVisible(inputs);
      return d;
    },
  },
  {
    id: 'generic-slider',
    name: 'Slider captcha',
    vendor: null,
    kind: 'widget',
    subtype: 'slider',
    generic: true,
    elements: [
      { sel: 'div', attr: ['class', 'id'], re: /slider[-_]?captcha|captcha[-_]?slider|slide[-_]?verify|verify[-_]?slide|slide[-_]?captcha|drag[-_]?verify|puzzle[-_]?captcha/i, w: 0.8 },
    ],
    text: [
      [/slide to (?:verify|complete|unlock)|drag the slider|drag the (?:puzzle )?piece|拖动(?:下方)?滑块|向右(?:拖动|滑动)|完成拼图|スライドして認証/i, 0.55, 'any'],
      [/select all (?:images|squares|pictures) with|rotate the (?:image|picture|object) (?:to|until)|click (?:on )?the (?:images?|objects?|icons?) in (?:the )?(?:following|this) order/i, 0.45, 'any'],
    ],
    refine(d, x) {
      d.visible = x.anyVisible(x.query('div'), (n) => /slider[-_]?captcha|captcha[-_]?slider|slide[-_]?verify|verify[-_]?slide|slide[-_]?captcha|drag[-_]?verify|puzzle[-_]?captcha/i.test((n.attr('class') || '') + ' ' + (n.attr('id') || '')));
      return d;
    },
  },
  {
    id: 'generic-captcha',
    name: 'Captcha (unknown provider)',
    vendor: null,
    kind: 'widget',
    generic: true,
    // Needs two signals (or a captcha frame): a page that only talks about captchas has headings and images named so.
    scripts: [[/captcha/i, 0.4]],
    frames: [[/captcha/i, 0.7]],
    elements: [
      ['iframe[title*="captcha" i]', 0.7],
      { sel: 'div', attr: ['id', 'class'], re: /captcha/i, w: 0.4 },
      { sel: 'form', attr: ['id', 'class', 'name', 'action'], re: /captcha/i, w: 0.45 },
      { sel: 'input:not([type="hidden"])', attr: ['name', 'id'], re: /captcha/i, w: 0.45 },
      { sel: 'img', attr: ['src', 'id', 'class'], re: /captcha/i, w: 0.4 },
      { sel: 'canvas', attr: ['id', 'class'], re: /captcha/i, w: 0.45 },
    ],
    refine(d, x) {
      const re = /captcha/i;
      const nodes = ['div', 'form', 'img', 'canvas', 'iframe'].flatMap((t) => x.query(t)).filter((n) => re.test([n.attr('id'), n.attr('class'), n.attr('title'), n.attr('src')].join(' ')));
      d.visible = x.anyVisible(nodes.concat(x.frames(re)));
      return d;
    },
  },
  {
    id: 'generic-challenge',
    name: 'Bot check page',
    vendor: null,
    kind: 'challenge-page',
    generic: true,
    title: [
      [
        /^(?:security check|security verification|bot check|bot verification|human verification|verify(?:ing)? (?:you are |that you are )?(?:a )?human|are you (?:a )?(?:human|robot)\??|captcha|robot check|access check|client challenge|checking your browser|ddos protection|安全验证|安全驗證|人机验证|人機驗證|验证码|驗證碼|проверка|robot challenge screen)\b/i,
        0.55,
      ],
    ],
    text: [
      [
        /\b(?:verify(?:ing)? (?:that )?you(?:'|’)?re? (?:a )?human|verify you are (?:a )?human|are you (?:a )?(?:human|robot)\b|i(?:'|’)?m not a robot|i am not a robot|confirm (?:that )?you(?:'|’)?re? (?:a )?human|confirm you are (?:a )?human|prove (?:that )?you(?:'|’)?re? (?:a )?human|human verification|bot (?:check|verification)|making sure you(?:'|’)re not a bot|checking (?:your|the) browser|please (?:complete|solve) the (?:security )?(?:check|captcha|challenge|puzzle)|complete the security check|press (?:&|and) hold|unusual traffic|automated (?:queries|requests))/i,
        0.6,
      ],
      [
        /no soy un robot|verifica(?:r)? que (?:eres|es) (?:un )?humano|comprobando (?:su|tu) navegador|je ne suis pas un robot|v[ée]rifi(?:ez|er|cation) que vous [êe]tes (?:un )?humain|ich bin kein roboter|best[äa]tigen sie,? dass sie ein mensch sind|n[ãa]o sou um rob[ôo]|confirme que (?:voc[êe] )?[ée] humano|non sono un robot|я не робот|подтвердите,? что (?:вы )?(?:не робот|человек)|проверка (?:браузера|безопасности)|我不是机器人|我不是機器人|人机验证|人機驗證|请完成(?:安全)?验证|請完成(?:安全)?驗證|ロボットではありません|로봇이 아닙니다|tôi không phải là người máy|xác minh (?:rằng )?bạn là (?:con )?người|ben robot değilim|nie jestem robotem|ik ben geen robot|saya bukan robot|أنا لست روبوت|मैं रोबोट नहीं हूं/i,
        0.6,
      ],
    ],
    refine(d, x) {
      return x.short ? d : null;
    },
  },
  {
    id: 'generic-block',
    name: 'Access denied page',
    vendor: null,
    kind: 'block-page',
    generic: true,
    title: [[/^(?:access denied|403 forbidden|forbidden|blocked|request rejected|you have been blocked|error 10(?:0[0-9]|1[0-9]|20))\b/i, 0.55]],
    text: [
      [
        /\b(?:access (?:to this (?:page|site|resource|website) )?(?:has been |is )?denied|you(?: have|(?:'|’)ve) been blocked|your (?:ip|ip address|request|access|connection) (?:has been|was|is) (?:blocked|denied|restricted)|request (?:blocked|rejected)|this request was blocked)\b/i,
        0.55,
      ],
    ],
    status: [403, 429],
    refine(d, x) {
      return x.short ? d : null;
    },
  },
];
