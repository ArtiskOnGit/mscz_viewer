// Settings E2E: change score colors to dark, check the viewer applies it (headless Chromium, Pixel 7).
// Usage: node e2e/settings.mjs "$PWD" [screenshot-dir]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';
const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port: 5193, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1, locale: 'en-US' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://127.0.0.1:5193/settings');
await page.waitForSelector('ion-select');
await page.screenshot({ path: `${shots}/settings.png`, fullPage: true });
await page.locator('[data-testid=score-theme]').click();
await page.locator('ion-popover ion-item', { hasText: 'Dark' }).click();
await page.waitForTimeout(400);
await page.goto('http://127.0.0.1:5193/library');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-testid=fab-add]').click().then(() => page.locator('[data-testid=fab-import]').click())]);
await chooser.setFiles(`${root}/test-scores/unity_transpos_.mscz`);
await page.waitForSelector('ion-item-sliding', { timeout: 60000 });
await page.locator('ion-item-sliding ion-item').first().click();
await page.waitForSelector('.score-page svg', { timeout: 60000 });
await page.waitForTimeout(500);
const colors = await page.evaluate(() => {
  const stage = document.querySelector('.score-stage');
  const inner = document.querySelector('.score-page svg svg');
  return { theme: stage.dataset.scoreTheme, bg: getComputedStyle(stage).backgroundColor, ink: getComputedStyle(inner).color };
});
console.log(colors);
await page.screenshot({ path: `${shots}/viewer-dark.png` });
console.log('errors', errors);
if (colors.theme !== 'dark' || errors.length) process.exitCode = 1;
await browser.close();
await server.close();
