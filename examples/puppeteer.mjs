// node examples/puppeteer.mjs https://2captcha.com/demo/geetest
import puppeteer from 'puppeteer';
import { detectInPage } from 'captcha-detector/page';

const url = process.argv[2] || 'https://2captcha.com/demo/geetest';
const browser = await puppeteer.launch();
const page = await browser.newPage();
const response = await page.goto(url, { waitUntil: 'networkidle2' });

const result = await detectInPage(page, { response });
console.log(JSON.stringify(result, null, 2));
await browser.close();
