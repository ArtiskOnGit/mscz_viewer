// Viewer E2E: import a score, open it, turn pages, choose a part, zoom, reload (headless Chromium, Pixel 7).
// Usage: node e2e/viewer.mjs "$PWD" [screenshot-dir] [score-file-name]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';

const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const file = `${root}/test-scores/${process.argv[4] ?? 'Toccata_v2.mscz'}`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port: 5195, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const indicator = () => page.locator('[data-testid=page-indicator]').innerText();
const waitRendered = () => page.waitForSelector('.score-page svg', { timeout: 60000 });
const step = async (label, fn) => {
  const t = Date.now();
  await fn();
  console.log(`${label.padEnd(28)} ${String(Date.now() - t).padStart(5)} ms  page ${await indicator()}`);
};

await page.goto('http://127.0.0.1:5195/library');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('ion-fab-button').click()]);
await chooser.setFiles(file);
await page.waitForSelector('ion-item-sliding', { timeout: 60000 });

await step('open score', async () => {
  await page.locator('ion-item-sliding ion-item').first().click();
  await waitRendered();
});
await page.screenshot({ path: `${shots}/viewer-full.png` });
await step('key ArrowRight', async () => {
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
});
await step('tap right third', async () => {
  const box = await page.locator('[data-testid=score-stage]').boundingBox();
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
  await page.waitForTimeout(150);
});
await step('tap left third', async () => {
  const box = await page.locator('[data-testid=score-stage]').boundingBox();
  await page.mouse.click(box.x + box.width * 0.1, box.y + box.height / 2);
  await page.waitForTimeout(150);
});
await step('select 2nd part only', async () => {
  await page.getByRole('button', { name: 'Instruments' }).click();
  await page.locator('ion-modal ion-checkbox').first().click(); // uncheck all
  await page.locator('ion-modal ion-checkbox').nth(2).click(); // 2nd part
  await page.locator('ion-modal ion-footer ion-button').click();
  await page.waitForFunction(() => !document.querySelector('ion-modal.show-modal'));
  await page.waitForTimeout(1500);
});
await page.screenshot({ path: `${shots}/viewer-part.png` });
await step('zoom in ×2', async () => {
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.waitForTimeout(1500);
});
await page.screenshot({ path: `${shots}/viewer-part-zoom.png` });
await step('next page', async () => {
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(200);
});
const before = await indicator();
await page.waitForTimeout(600); // debounced save
await step('reload (restore state)', async () => {
  await page.reload();
  await waitRendered();
  await page.waitForTimeout(300);
});
console.log('restored page', before, '→', await indicator(), '| multi-rests:', await page.locator('.score-page g.multiRest').count());
await page.screenshot({ path: `${shots}/viewer-restored.png` });
console.log('errors', errors);
await browser.close();
await server.close();
