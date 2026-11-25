// Smoke test: the three screens render without JS errors (headless Chromium, Pixel 7).
// Usage: node e2e/smoke.mjs "$PWD"
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';
const root = process.argv[2];
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port: 5198, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1, locale: 'en-US' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://127.0.0.1:5198/');
await page.waitForSelector('ion-title');
console.log('url', page.url());
await page.screenshot({ path: '/tmp/pupitre-shots/library.png' });
await page.locator('ion-segment-button', { hasText: 'Setlists' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/pupitre-shots/setlists.png' });
await page.getByRole('link', { name: 'Settings' }).click();
await page.waitForTimeout(600);
console.log('url', page.url());
await page.screenshot({ path: '/tmp/pupitre-shots/settings.png' });
console.log('errors', errors);
await browser.close(); await server.close();
