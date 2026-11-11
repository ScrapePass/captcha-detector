// node examples/fetch.mjs https://example.com — checks the raw HTML the server sends (no browser)
import { detectHtml } from 'captcha-detector';

const url = process.argv[2] || 'https://example.com';
const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' } });
const result = detectHtml(await res.text(), { url: res.url, status: res.status, headers: res.headers });
console.log(result.summary);
if (result.challengePage) console.log('The server answered with a bot check instead of the page.');
