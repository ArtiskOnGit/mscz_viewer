// Imports the scores of test-scores/ through the Library screen (headless Chromium, Pixel 7).
// Usage: node e2e/library.mjs "$PWD" [screenshot-dir]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';
import { readdirSync } from 'node:fs';

const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const files = readdirSync(`${root}/test-scores`).filter((f) => /\.(mscz|mscx|mxl|musicxml)$/.test(f)).map((f) => `${root}/test-scores/${f}`);
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port: 5197, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1, locale: 'en-US' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://127.0.0.1:5197/library');
await page.waitForSelector('[data-testid=fab-add]');

const t0 = Date.now();
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-testid=fab-add]').click().then(() => page.locator('[data-testid=fab-import]').click())]);
await chooser.setFiles(files);
await page.waitForFunction((n) => document.querySelectorAll('ion-item-sliding').length >= n, files.length, { timeout: 180000 });
console.log(`imported ${files.length} files in ${Date.now() - t0} ms`);
console.log((await page.locator('ion-item-sliding ion-label').allInnerTexts()).map((s) => s.replace(/\n/g, ' | ')));
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/library-list.png` });

// Re-import the same files: all duplicates.
const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-testid=fab-add]').click().then(() => page.locator('[data-testid=fab-import]').click())]);
await chooser2.setFiles(files.slice(0, 1));
await page.waitForSelector('ion-toast', { timeout: 30000 });
console.log('toast:', await page.locator('ion-toast').evaluate((el) => el.message));

// Persistence across reload.
await page.reload();
await page.waitForFunction((n) => document.querySelectorAll('ion-item-sliding').length >= n, files.length, { timeout: 30000 });
console.log('after reload:', await page.locator('ion-item-sliding').count(), 'scores');
console.log('errors', errors);
await browser.close();
await server.close();
