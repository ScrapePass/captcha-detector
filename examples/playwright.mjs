// node examples/playwright.mjs https://www.google.com/recaptcha/api2/demo
import { chromium } from 'playwright';
import { detectInPage } from 'captcha-detector/page';

const url = process.argv[2] || 'https://www.google.com/recaptcha/api2/demo';
const browser = await chromium.launch();
const page = await browser.newPage();
const response = await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(2000); // let widgets render

const result = await detectInPage(page, { response });
console.log(result.summary);
for (const d of result.detections) console.log(`- ${d.name} (${d.kind}${d.subtype ? '/' + d.subtype : ''}) visible=${d.visible}`);
await browser.close();
