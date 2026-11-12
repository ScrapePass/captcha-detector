// Test pages, modelled on the markup each product really puts on a page.
// expect.ids: detections that must be present (others may appear unless `only` is true).
const page = (head, body, title = 'Test page') => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>${body}</body></html>`;
const filler = '<article>' + '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>'.repeat(40) + '</article>';

export const CASES = [
  // ───── reCAPTCHA ─────
  {
    name: 'reCAPTCHA v2 checkbox',
    html: page('<script src="https://www.google.com/recaptcha/api.js" async defer></script>', '<form><div class="g-recaptcha" data-sitekey="6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"></div><button>Send</button></form>'),
    expect: { captcha: true, ids: ['recaptcha'], subtype: { recaptcha: 'v2-checkbox' }, only: true },
  },
  {
    name: 'reCAPTCHA v2 invisible',
    html: page('<script src="https://www.google.com/recaptcha/api.js"></script>', '<form><button class="g-recaptcha" data-sitekey="6Lc" data-size="invisible" data-callback="onSubmit">Submit</button></form>'),
    expect: { captcha: true, ids: ['recaptcha'], subtype: { recaptcha: 'v2-invisible' }, kind: { recaptcha: 'invisible' } },
  },
  {
    name: 'reCAPTCHA v3',
    html: page('<script src="https://www.google.com/recaptcha/api.js?render=6LdKlZEpAAAAAAOQjzC2v_d36tWxCl6dWsozdSy9"></script><script>grecaptcha.ready(function(){grecaptcha.execute("6LdKlZEpAAAAAAOQjzC2v_d36tWxCl6dWsozdSy9",{action:"submit"})})</script>', '<form><input name="email"></form>'),
    expect: { captcha: true, ids: ['recaptcha'], subtype: { recaptcha: 'v3' }, kind: { recaptcha: 'invisible' } },
  },
  {
    name: 'reCAPTCHA Enterprise via recaptcha.net',
    html: page('<script src="https://www.recaptcha.net/recaptcha/enterprise.js?render=explicit"></script>', '<div class="g-recaptcha" data-sitekey="6Lf"></div>'),
    expect: { captcha: true, ids: ['recaptcha'], name: { recaptcha: 'reCAPTCHA Enterprise' } },
  },
  {
    name: 'reCAPTCHA anchor iframe only',
    html: page('', '<iframe title="reCAPTCHA" src="https://www.google.com/recaptcha/api2/anchor?ar=1&k=6Le&co=aHR0&hl=en&v=abc&size=normal" width="304" height="78"></iframe>'),
    expect: { captcha: true, ids: ['recaptcha'], subtype: { recaptcha: 'v2-checkbox' } },
  },
  // ───── hCaptcha ─────
  {
    name: 'hCaptcha checkbox',
    html: page('<script src="https://js.hcaptcha.com/1/api.js" async defer></script>', '<form><div class="h-captcha" data-sitekey="10000000-ffff-ffff-ffff-000000000001"></div><textarea name="h-captcha-response"></textarea><textarea name="g-recaptcha-response"></textarea></form>'),
    expect: { captcha: true, ids: ['hcaptcha'], absent: ['recaptcha'], subtype: { hcaptcha: 'checkbox' } },
  },
  {
    name: 'hCaptcha invisible',
    html: page('<script src="https://hcaptcha.com/1/api.js"></script>', '<div class="h-captcha" data-sitekey="x" data-size="invisible"></div>'),
    expect: { captcha: true, ids: ['hcaptcha'], kind: { hcaptcha: 'invisible' } },
  },
  // ───── Turnstile & Cloudflare ─────
  {
    name: 'Cloudflare Turnstile widget',
    html: page('<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>', '<form><div class="cf-turnstile" data-sitekey="1x00000000000000000000AA"></div></form>'),
    expect: { captcha: true, ids: ['turnstile'], only: true },
  },
  {
    name: 'Cloudflare managed challenge page',
    html: page(
      '<meta name="robots" content="noindex,nofollow"><script>(function(){window._cf_chl_opt={cvId:"3",cZone:"example.com",cType:"managed",cRay:"8d1",cH:"x",cUPMDTk:"/?__cf_chl_tk=abc"};var a=document.createElement("script");a.src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1?ray=8d1";document.getElementsByTagName("head")[0].appendChild(a);}());</script>',
      '<div class="main-wrapper" role="main"><div class="main-content"><h1 class="zone-name-title h1">example.com</h1><h2 id="challenge-running" class="h2">Verifying you are human. This may take a few seconds.</h2><div id="challenge-stage"></div><div id="challenge-body-text" class="core-msg spacer">example.com needs to review the security of your connection before proceeding.</div></div></div><div class="footer">Ray ID: 8d1 · Performance &amp; security by Cloudflare</div><noscript><div>Enable JavaScript and cookies to continue</div></noscript>',
      'Just a moment...',
    ),
    opts: { status: 403, headers: { server: 'cloudflare', 'cf-mitigated': 'challenge' } },
    expect: { captcha: true, challengePage: true, ids: ['cloudflare-challenge'], absent: ['generic-challenge', 'generic-block'] },
  },
  {
    name: 'Cloudflare legacy "Checking your browser" page',
    html: page('', '<div id="cf-content"><h1>Checking your browser before accessing example.com.</h1><p>This process is automatic. Your browser will redirect to your requested content shortly.</p><form id="challenge-form" action="/cdn-cgi/l/chk_jschl?__cf_chl_jschl_tk__=abc" method="get"><input type="hidden" name="jschl_vc" value="1"><input type="hidden" name="jschl_answer"></form></div><p>DDoS protection by Cloudflare</p>', 'Just a moment...'),
    expect: { captcha: true, challengePage: true, ids: ['cloudflare-challenge'] },
  },
  {
    name: 'Cloudflare block page (1020)',
    html: page('', '<div id="cf-wrapper"><div id="cf-error-details" class="cf-error-details-wrapper"><h1 data-translate="block_headline">Sorry, you have been blocked</h1><h2>You are unable to access example.com</h2><p>Cloudflare Ray ID: 8d1abc</p></div></div>', 'Attention Required! | Cloudflare'),
    opts: { status: 403, headers: { server: 'cloudflare' } },
    expect: { captcha: false, blocked: true, ids: ['cloudflare-block'], absent: ['generic-challenge'] },
  },
  // ───── Arkose / GeeTest / AWS ─────
  {
    name: 'Arkose Labs FunCaptcha',
    html: page('<script src="https://client-api.arkoselabs.com/v2/11111111-1111-1111-1111-111111111111/api.js" data-callback="setupEnforcement" async defer></script>', '<div id="arkose"></div><input type="hidden" name="fc-token" value="">'),
    expect: { captcha: true, ids: ['arkose'] },
  },
  {
    name: 'GeeTest v3',
    html: page('<script src="https://static.geetest.com/static/tools/gt.js"></script>', '<div id="captcha"><div class="geetest_holder geetest_wind"><div class="geetest_btn"><div class="geetest_radar_btn"></div></div></div></div><input type="hidden" name="geetest_challenge">'),
    expect: { captcha: true, ids: ['geetest'], subtype: { geetest: 'v3' }, absent: ['generic-captcha'] },
  },
  {
    name: 'GeeTest v4',
    html: page('<script src="https://static.geetest.com/v4/gt4.js"></script><script>initGeetest4({captchaId:"647f5ed2ed8acb4be36784e01556bb71"},function(c){c.appendTo("#box")})</script>', '<div id="box"></div>'),
    expect: { captcha: true, ids: ['geetest'], subtype: { geetest: 'v4' } },
  },
  {
    name: 'AWS WAF CAPTCHA page',
    html: page('<script type="text/javascript" src="https://ab12cd34ef56.us-east-1.captcha.awswaf.com/ab12cd34ef56/jsapi.js"></script><script>window.gokuProps={"key":"AQIDAHj","iv":"CgAH","context":"x"};</script>', '<div id="captcha-container"></div><script>AwsWafCaptcha.renderCaptcha(document.getElementById("captcha-container"),{apiKey:"x"});</script>'),
    opts: { status: 405, headers: { 'x-amzn-waf-action': 'captcha' } },
    expect: { captcha: true, ids: ['aws-waf'] },
  },
  {
    name: 'AWS WAF Bot Control token script only (protection)',
    html: page('<script src="https://ab12cd34ef56.edge.sdk.awswaf.com/ab12cd34ef56/abcdef/challenge.js" defer></script>', filler),
    expect: { captcha: false, ids: ['aws-waf'], kind: { 'aws-waf': 'protection' } },
  },
  // ───── Bot-protection vendors ─────
  {
    name: 'DataDome captcha page',
    html: page('<script>var dd={\'rt\':\'c\',\'cid\':\'AHrlqAAAAAMA\',\'hsh\':\'2211F522B61E269B869FA6EAFFB5E1\',\'t\':\'fe\',\'s\':17434,\'e\':\'x\',\'host\':\'geo.captcha-delivery.com\'}</script><script src="https://ct.captcha-delivery.com/c.js"></script>', '<p style="font-size:0">Please enable JS and disable any ad blocker</p>', 'example.com'),
    opts: { status: 403, headers: { 'x-datadome': 'protected', 'set-cookie': 'datadome=abc; Max-Age=31536000; Path=/' } },
    expect: { captcha: true, challengePage: true, ids: ['datadome-captcha'], absent: ['datadome'], subtype: { 'datadome-captcha': 'slider' } },
  },
  {
    name: 'DataDome tag only (protection)',
    html: page('<script>window.ddjskey="ABC";window.ddoptions={};</script><script src="https://js.datadome.co/tags.js" async></script>', filler),
    expect: { captcha: false, ids: ['datadome'], kind: { datadome: 'protection' } },
  },
  {
    name: 'PerimeterX press & hold',
    html: page('<script>window._pxAppId="PXabc12345";window._pxJsClientSrc="/abc12345/init.js";window._pxHostUrl="/abc12345/xhr";window._pxUuid="1234"</script><script src="https://captcha.px-cdn.net/PXabc12345/captcha.js?a=c&u=1234&v=&m=0"></script>', '<div class="px-captcha-container"><div class="px-captcha-header">Before we continue...</div><div class="px-captcha-message">Press &amp; Hold to confirm you are a human (and not a bot).</div><div id="px-captcha"></div></div>', 'Access to this page has been denied.'),
    expect: { captcha: true, challengePage: true, ids: ['perimeterx-captcha'], absent: ['perimeterx'] },
  },
  {
    name: 'PerimeterX sensor only (protection)',
    html: page('<script>(function(){window._pxAppId="PXabc12345";var p=document.getElementsByTagName("script")[0],s=document.createElement("script");s.async=1;s.src="//client.perimeterx.net/PXabc12345/main.min.js";p.parentNode.insertBefore(s,p);}());</script>', filler),
    expect: { captcha: false, ids: ['perimeterx'] },
  },
  {
    name: 'Akamai access denied',
    html: page('', '<h1>Access Denied</h1>You don\'t have permission to access "http://www.example.com/" on this server.<p>Reference #18.4a3c2117.1700000000.1b2c3d4</p><p>https://errors.edgesuite.net/18.4a3c2117.1700000000.1b2c3d4</p>', 'Access Denied'),
    opts: { status: 403, headers: { server: 'AkamaiGHost' } },
    expect: { captcha: false, blocked: true, ids: ['akamai-block'] },
  },
  {
    name: 'Akamai sec-cpt challenge',
    html: page('<script src="/_sec/cp_challenge/ak-challenge-4-3.js"></script>', '<div id="sec-container"><div id="sec-text-container"><h1>Checking your browser…</h1></div><div id="sec-if-cpt-container"><iframe id="sec-cpt-if" src="/_sec/cp_challenge/verify"></iframe></div></div>'),
    expect: { captcha: true, challengePage: true, ids: ['akamai-challenge'] },
  },
  {
    name: 'Imperva Incapsula block',
    html: page('<meta name="ROBOTS" content="NOINDEX, NOFOLLOW">', '<iframe id="main-iframe" src="/_Incapsula_Resource?SWUDNSAI=31&xinfo=10-1-0&incident_id=123-456&edet=15&cinfo=04000000" frameborder=0 width="100%" height="100%">Request unsuccessful. Incapsula incident ID: 123-456</iframe>', ''),
    opts: { headers: { 'x-iinfo': '10-1-0 0NNN RT(1 2) q(0 -1 -1 -1) r(0 -1)', 'x-cdn': 'Imperva' } },
    expect: { captcha: true, challengePage: true, ids: ['imperva-challenge'], absent: ['imperva'] },
  },
  {
    name: 'Imperva ABP "Pardon Our Interruption"',
    html: page('', '<h1>Pardon Our Interruption</h1><p>As you were browsing something about your browser made us think you were a bot. There are a few reasons this might happen.</p>', 'Pardon Our Interruption'),
    expect: { captcha: true, challengePage: true, ids: ['imperva-abp'] },
  },
  {
    name: 'Kasada 429',
    html: page('', '<script src="/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/ips.js?tkrm_alpekz_s1.3=abc"></script>', ''),
    opts: { status: 429, headers: { 'x-kpsdk-ct': 'abc' } },
    expect: { captcha: true, challengePage: true, ids: ['kasada'] },
  },
  {
    name: 'Vercel Security Checkpoint',
    html: page('<script src="/.well-known/vercel/security/static/challenge.v2.min.js" async></script>', '<main><h1>We\'re verifying your browser</h1><p>Website owner? Click here to fix</p></main>', 'Vercel Security Checkpoint'),
    opts: { status: 429, headers: { 'x-vercel-mitigated': 'challenge' } },
    expect: { captcha: true, challengePage: true, ids: ['vercel-challenge'] },
  },
  {
    name: 'Anubis proof-of-work',
    html: page('<script id="anubis_version" type="application/json">"v1.17.0"</script><script id="anubis_challenge" type="application/json">{"challenge":"abc","rules":{"difficulty":4}}</script><script async type="module" src="/.within.website/x/cmd/anubis/static/js/main.mjs?cacheBuster=v1.17.0"></script>', '<main><h1 id="title">Making sure you&#39;re not a bot!</h1><p id="status">Loading...</p><p>Protected by Anubis from Techaro.</p></main>', 'Making sure you&#39;re not a bot!'),
    expect: { captcha: true, challengePage: true, ids: ['anubis'] },
  },
  {
    name: 'DDoS-Guard check page',
    html: page('<script src="https://check.ddos-guard.net/check.js"></script>', '<p>Checking your browser before accessing example.com</p>', 'DDoS-Guard'),
    opts: { headers: { server: 'ddos-guard' } },
    expect: { captcha: true, challengePage: true, ids: ['ddos-guard'] },
  },
  {
    name: 'Sucuri JS challenge',
    html: page('', "<script>var s={},u,c,U,r,i,l=0,a,e=eval,w=String.fromCharCode,sucuri_cloudproxy_js='',S='YT0nNCcgKyAnMycg';L=S.length;</script>", 'You are being redirected...'),
    opts: { headers: { server: 'Sucuri/Cloudproxy', 'x-sucuri-id': '11005' } },
    expect: { captcha: true, challengePage: true, ids: ['sucuri'] },
  },
  {
    name: 'Radware ShieldSquare captcha',
    html: page('<script src="https://cdn.perfdrive.com/aperture/aperture.js"></script>', '<h1>Radware Bot Manager Captcha</h1><p>We apologize for the inconvenience...</p><div class="g-recaptcha" data-sitekey="x"></div>', 'Radware Bot Manager Captcha'),
    opts: { url: 'https://validate.perfdrive.com/abc/captcha?ssa=1' },
    expect: { captcha: true, challengePage: true, ids: ['radware', 'recaptcha'] },
  },
  {
    name: 'F5 ASM rejected',
    html: page('', 'The requested URL was rejected. Please consult with your administrator.<br><br>Your support ID is: 1234567890123456789', 'Request Rejected'),
    expect: { captcha: false, blocked: true, ids: ['f5-asm'] },
  },
  {
    name: 'Google unusual traffic',
    html: page('<script src="https://www.google.com/recaptcha/api.js" async defer></script>', '<div style="max-width:400px;"><form id="captcha-form" action="index" method="post"><div id="recaptcha" class="g-recaptcha" data-sitekey="6LfwuyUTAAAAAOAmoS0fdqijC2PbbdH4kjq62Y1b" data-s="abc"></div><input type="hidden" name="q" value="EgQ"><input type="hidden" name="continue" value="https://www.google.com/search?q=test"></form><hr noshade size="1" style="color:#ccc; background-color:#ccc;"><div style="font-size:13px;"><b>About this page</b><br><br>Our systems have detected unusual traffic from your computer network.</div></div>', 'https://www.google.com/search?q=test'),
    opts: { url: 'https://www.google.com/sorry/index?continue=https://www.google.com/search%3Fq%3Dtest&q=EgQ' },
    expect: { captcha: true, challengePage: true, ids: ['google-sorry', 'recaptcha'] },
  },
  {
    name: 'Amazon robot check',
    html: page('', '<div class="a-container"><h4>Enter the characters you see below</h4><p class="a-last">Sorry, we just need to make sure you\'re not a robot. For best results, please make sure your browser is accepting cookies.</p><form method="get" action="/errors/validateCaptcha" name=""><div class="a-row a-text-center"><img src="https://images-na.ssl-images-amazon.com/captcha/twrrsdjt/Captcha_kzvxgeelsu.jpg"></div><input autocomplete="off" spellcheck="false" placeholder="Type characters" id="captchacharacters" name="field-keywords" class="a-span12" autocapitalize="off" autocorrect="off" type="text"></form></div>', 'Amazon.com'),
    expect: { captcha: true, challengePage: true, ids: ['amazon-captcha'], absent: ['generic-image-captcha'] },
  },
  {
    name: 'Amazon continue-shopping check (2025)',
    html: page('', '<div class="a-container a-padding-double-large"><div class="a-row a-spacing-double-large"><h4>Click the button below to continue shopping</h4><form method="get" action="/errors_page/validateCaptcha" name=""><input type=hidden name="amzn" value="abc123"><input type=hidden name="amzn-r" value="/dp/B0EXAMPLE"><input type=hidden name="field-keywords" value="XYZW"><span class="a-button a-button-primary"><button type="submit" class="a-button-text">Continue shopping</button></span></form></div><div class="a-divider-inner"></div><div class="a-text-center a-size-mini"><a href="/gp/help/customer/display.html">Conditions of Use</a> <a href="/privacy">Privacy Policy</a> &copy; 1996-2025, Amazon.com, Inc. or its affiliates</div></div>', 'Amazon.com'),
    opts: { url: 'https://www.amazon.com/dp/B0EXAMPLE' },
    expect: { captcha: true, challengePage: true, ids: ['amazon-captcha'] },
  },
  {
    name: 'Amazon continue-shopping check, wording only (no form)',
    html: page('', '<div class="a-container"><h4>Click the button below to continue shopping</h4><button class="a-button-text">Continue shopping</button><p>&copy; 1996-2025, Amazon.com, Inc. or its affiliates</p></div>', 'Amazon.com'),
    opts: { url: 'https://www.amazon.com/dp/B0EXAMPLE' },
    expect: { captcha: true, challengePage: true, ids: ['amazon-captcha'] },
  },
  {
    name: 'Yandex showcaptcha',
    html: page('', '<div class="CheckboxCaptcha"><form id="checkbox-captcha-form" action="/checkcaptcha?key=abc" method="POST"><p>Please confirm that you and not a robot are sending requests</p><input type="submit" value="I\'m not a robot"></form></div>', 'Are you not a robot?'),
    opts: { url: 'https://yandex.com/showcaptcha?cc=1&retpath=x' },
    expect: { captcha: true, challengePage: true, ids: ['yandex-showcaptcha'] },
  },
  // ───── Other widgets ─────
  { name: 'Friendly Captcha', html: page('<script type="module" src="https://cdn.jsdelivr.net/npm/friendly-challenge@0.9.12/widget.module.min.js" async defer></script>', '<form><div class="frc-captcha" data-sitekey="FCMGEMUD2KTDSQ5H"></div></form>'), expect: { captcha: true, ids: ['friendly-captcha'], only: true } },
  { name: 'MTCaptcha', html: page('<script>var mtcaptchaConfig={"sitekey":"MTPublic-tqNCRE0GS"};(function(){var mt_service=document.createElement("script");mt_service.async=true;mt_service.src="https://service.mtcaptcha.com/mtcv1/client/mtcaptcha.min.js";(document.getElementsByTagName("head")[0]).appendChild(mt_service);})();</script>', '<div class="mtcaptcha"></div>'), expect: { captcha: true, ids: ['mtcaptcha'] } },
  { name: 'Yandex SmartCaptcha', html: page('<script src="https://smartcaptcha.yandexcloud.net/captcha.js" defer></script>', '<div id="captcha-container" class="smart-captcha" data-sitekey="ysc1_abc"></div>'), expect: { captcha: true, ids: ['yandex-smartcaptcha'] } },
  { name: 'Tencent Captcha', html: page('<script src="https://turing.captcha.qcloud.com/TCaptcha.js"></script>', '<button id="TencentCaptcha" data-appid="2046626881" data-cbfn="callback">验证</button>'), expect: { captcha: true, ids: ['tencent-captcha'] } },
  { name: 'Alibaba noCaptcha slider', html: page('<script src="https://g.alicdn.com/AWSC/AWSC/awsc.js"></script>', '<div id="nc"><div id="nc_1_wrapper" class="nc_wrapper"><div id="nc_1__scale_text" class="nc_scale"><span>请按住滑块，拖动到最右边</span></div></div></div>'), expect: { captcha: true, ids: ['aliyun-captcha'] } },
  { name: 'NetEase Yidun', html: page('<script src="https://cstaticdun.126.net/load.min.js"></script>', '<div class="yidun yidun-custom"><div class="yidun_slider"></div></div>'), expect: { captcha: true, ids: ['netease-yidun'] } },
  { name: 'Lemin', html: page('<script src="https://api.leminnow.com/captcha/v1/cropped/CROPPED_3dfdd5c_d1872b526b794d83ba3b365eb15a200b/js"></script>', '<div id="lemin-cropped-captcha"></div>'), expect: { captcha: true, ids: ['lemin'] } },
  { name: 'KeyCAPTCHA', html: page("<script>var s_s_c_user_id='184015';var s_s_c_session_id='0917788cad24ad3a69813c4fcd556061';var s_s_c_captcha_field_id='capcode';var s_s_c_submit_button_id='sbutton';var s_s_c_web_server_sign='abc';</script><script src='https://backs.keycaptcha.com/swfs/cap.js'></script>", '<div id="div_for_keycaptcha"></div>'), expect: { captcha: true, ids: ['keycaptcha'] } },
  { name: 'Capy puzzle', html: page('<script src="https://jp.api.capy.me/puzzle/get_js/?k=PUZZLE_Cme4hZLjuZRMYC3uh14C52D3uNms5w"></script>', '<form><div class="capy-captcha"></div><input type="hidden" name="capy_captchakey" value="PUZZLE_x"></form>'), expect: { captcha: true, ids: ['capy'] } },
  { name: 'Cutcaptcha', html: page('<script>var CUTCAPTCHA_MISERY_KEY="a1488b66da00bf332a1488993a5443c79047e752";</script><script src="https://cdn.cutcaptcha.net/captcha/SAs61IAI.js"></script>', '<div id="puzzle-captcha" aria-style="mini"></div>'), expect: { captcha: true, ids: ['cutcaptcha'] } },
  { name: 'Procaptcha', html: page('<script type="module" src="https://js.prosopo.io/js/procaptcha.bundle.js" async defer></script>', '<div class="procaptcha" data-sitekey="5C4hrfjw9DjXZTzV3MwzrrAr9P1MJhSrvWGWqi1eSuyUpnhM"></div>'), expect: { captcha: true, ids: ['procaptcha'] } },
  { name: 'CaptchaFox', html: page('<script src="https://cdn.captchafox.com/api.js" async defer></script>', '<div class="captchafox" data-sitekey="sk_11111111000000001111111100000000"></div>'), expect: { captcha: true, ids: ['captchafox'] } },
  { name: 'ALTCHA', html: page('<script async defer src="https://cdn.jsdelivr.net/gh/altcha-org/altcha/dist/altcha.min.js" type="module"></script>', '<form><altcha-widget challengeurl="/altcha"></altcha-widget></form>'), expect: { captcha: true, ids: ['altcha'] } },
  { name: 'Cap', html: page('<script src="https://cdn.jsdelivr.net/npm/@cap.js/widget@0.1.25"></script>', '<cap-widget id="cap" data-cap-api-endpoint="/api/"></cap-widget>'), expect: { captcha: true, ids: ['cap'] } },
  { name: 'mCaptcha', html: page('', '<div id="mcaptcha__widget-container"></div><script src="https://unpkg.com/@mcaptcha/vanilla-glue@0.1.0-alpha-3/dist/index.js"></script>'), expect: { captcha: true, ids: ['mcaptcha'] } },
  { name: 'Solve Media', html: page('<script src="https://api-secure.solvemedia.com/papi/challenge.script?k=abc"></script>', '<div id="adcopy-outer"><input type="text" name="adcopy_response" id="adcopy_response"></div>'), expect: { captcha: true, ids: ['solvemedia'] } },
  { name: 'BotDetect', html: page('', '<div class="BDC_CaptchaDiv" id="ExampleCaptcha_CaptchaDiv"><div class="BDC_CaptchaImageDiv"><img class="BDC_CaptchaImage" src="BotDetectCaptcha.ashx?get=image&c=ExampleCaptcha&t=abc" alt="Retype the CAPTCHA code from the image"></div></div><input name="CaptchaCode" id="CaptchaCode" type="text">'), expect: { captcha: true, ids: ['botdetect'], absent: ['generic-image-captcha'] } },
  { name: 'Securimage', html: page('', '<img id="captcha" src="/securimage/securimage_show.php" alt="CAPTCHA Image"><input type="text" name="captcha_code" size="10" maxlength="6">'), expect: { captcha: true, ids: ['securimage'] } },
  { name: 'Contact Form 7 Really Simple CAPTCHA', html: page('', '<form class="wpcf7-form"><img class="wpcf7-form-control wpcf7-captchac wpcf7-captcha-captcha-1" src="https://example.com/wp-content/uploads/wpcf7_captcha/123.png" width="72" height="24"><input type="text" name="captcha-1" class="wpcf7-captchar"></form>'), expect: { captcha: true, ids: ['wpcf7-captcha'] } },
  // ───── Generic rules ─────
  {
    name: 'Generic image captcha (Chinese site)',
    html: page('', '<form action="/login"><input name="username"><input type="password" name="pwd"><input type="text" name="yzm" placeholder="请输入验证码"><img src="/servlet/ValidateCode?t=123" id="codeImg" onclick="this.src=this.src+1"><a>看不清，换一张</a></form>' + filler, '登录'),
    expect: { captcha: true, ids: ['generic-image-captcha'] },
  },
  {
    name: 'Generic Kaptcha (Java)',
    html: page('', '<form><input type="text" name="kaptcha" id="kaptcha"><img src="/kaptcha.jpg" alt="captcha"></form>'),
    expect: { captcha: true, ids: ['generic-image-captcha'] },
  },
  {
    name: 'Generic math captcha',
    html: page('', '<form><label for="sum">What is 3 + 4?</label><input type="text" name="math_captcha" id="sum"><button>Send</button></form>' + filler),
    expect: { captcha: true, ids: ['generic-question'] },
  },
  {
    name: 'Generic slider captcha',
    html: page('', '<div class="slide-verify"><div class="slide-verify-slider"><span>Slide to verify</span></div></div>'),
    expect: { captcha: true, ids: ['generic-slider'] },
  },
  {
    name: 'Generic bot check in Spanish',
    html: page('', '<h1>Un momento</h1><p>Por favor, verifica que eres humano para continuar.</p><label><input type="checkbox"> No soy un robot</label>', 'Verificación'),
    expect: { captcha: true, challengePage: true, ids: ['generic-challenge'] },
  },
  {
    name: 'Generic access denied',
    html: page('', '<h1>Access Denied</h1><p>Your IP address has been blocked.</p>', 'Access Denied'),
    opts: { status: 403 },
    expect: { captcha: false, blocked: true, ids: ['generic-block'] },
  },
  {
    name: 'Generic rotate captcha (unknown provider)',
    html: page('', '<form><div class="_captchaWidget_12mm0_11"><button type="button">Rotate right</button><div class="_captchaImage_12mm0_5"><img src="/assets/captcha-DE_Zeycb.png" width="118" height="118"></div></div><button>Check</button></form>' + filler),
    expect: { captcha: true, ids: ['generic-captcha'] },
  },
  {
    name: 'Generic text captcha (question with a captcha-named field)',
    html: page('', '<form><label for="q">If tomorrow is Saturday, what day is today?</label><input type="text" id="text-captcha-field" name="textCaptcha"><button>Check</button></form>' + filler),
    expect: { captcha: true, ids: ['generic-question'] },
  },
  // ───── Negatives: must find nothing ─────
  { name: 'Plain page', html: page('', '<h1>Hello</h1><p>Welcome to my site.</p>'), expect: { captcha: false, blocked: false, ids: [], only: true } },
  {
    name: 'Article about CAPTCHAs',
    html: page('', '<h1>What is a CAPTCHA?</h1><p>A CAPTCHA ("Completely Automated Public Turing test to tell Computers and Humans Apart") asks you to verify you are human. reCAPTCHA, hCaptcha and Cloudflare Turnstile are popular. You may see "I\'m not a robot" or be asked to select all images with traffic lights.</p><img src="/images/recaptcha-example.png" alt="Example of a reCAPTCHA checkbox">' + filler, 'What is a CAPTCHA? A complete guide'),
    expect: { captcha: false, ids: [], only: true },
  },
  {
    name: 'Login form without captcha',
    html: page('', '<form><input name="email" placeholder="Email"><input type="password" name="password"><input name="verification_code" placeholder="SMS verification code"><button>Sign in</button></form>' + filler, 'Sign in'),
    expect: { captcha: false, ids: [], only: true },
  },
  {
    name: 'Checkout with security code (CVV)',
    html: page('', '<form><input name="card" placeholder="Card number"><input name="security_code" placeholder="Security code"><img src="/img/cvv-help.png" alt="Where is the security code?"></form>'),
    expect: { captcha: false, ids: [], only: true },
  },
  {
    name: 'Math tutorial (no input)',
    html: page('', '<h1>Addition</h1><p>What is 3 + 4? The answer is 7.</p>'),
    expect: { captcha: false, ids: [], only: true },
  },
  {
    name: 'Cloudflare site with only jsd script (protection, no captcha)',
    html: page('<script>(function(){function c(){var b=a.contentDocument||a.contentWindow.document;if(b){var d=b.createElement("script");d.innerHTML="window.__CF$cv$params={r:\'8d1\',t:\'MTcz\'};var a=document.createElement(\'script\');a.nonce=\'\';a.src=\'/cdn-cgi/challenge-platform/scripts/jsd/main.js\';document.getElementsByTagName(\'head\')[0].appendChild(a);";b.getElementsByTagName("head")[0].appendChild(d)}}}())</script>', filler),
    opts: { headers: { server: 'cloudflare' } },
    expect: { captcha: false, ids: [], absent: ['cloudflare-challenge'] },
  },
  {
    name: 'Wiki article with captcha headings, TOC ids and screenshots',
    html: page('', '<ul><li id="toc-Alternative_CAPTCHAs" class="vector-toc-list-item"><a href="#Alternative_CAPTCHAs">Alternative CAPTCHAs</a></li></ul><h2 id="Alternative_CAPTCHAs">Alternative CAPTCHAs</h2><span class="anchor" id="ReCAPTCHA_v1"></span><figure><img src="//upload.wikimedia.org/thumb/FancyCaptcha_screenshot.png/330px-FancyCaptcha_screenshot.png" class="mw-file-element"></figure><form id="searchform"><input name="search" placeholder="Search Wikipedia"></form>' + filler, 'CAPTCHA - Wikipedia'),
    expect: { captcha: false, ids: [], only: true },
  },
  {
    name: 'Cloudflare block page with the "Attention Required" title only matched by text',
    html: page('', '<h1 data-translate="block_headline">Sorry, you have been blocked</h1><h2 class="cf-subheadline"><span data-translate="unable_to_access">You are unable to access</span> example.com</h2>', 'Attention Required! | Cloudflare'),
    opts: { status: 403, headers: { server: 'cloudflare' } },
    expect: { captcha: false, blocked: true, ids: ['cloudflare-block'], absent: ['generic-challenge', 'cloudflare-challenge'] },
  },
  {
    name: 'Element with id "turnstile" is not the Turnstile global',
    html: page('', '<section id="turnstile"><h2>Our turnstile products</h2></section>' + filler),
    expect: { captcha: false, ids: [], only: true },
  },
];
