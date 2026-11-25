// Playback E2E: auto-scroll at the score tempo with metronome (headless Chromium, Pixel 7).
// Usage: node e2e/playback.mjs "$PWD" [screenshot-dir] [score-file]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';
const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const file = process.argv[4] ?? 'unity_transpos_.mscz';
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port: 5192, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://127.0.0.1:5192/library');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('ion-fab-button').click()]);
await chooser.setFiles(`${root}/test-scores/${file}`);
await page.waitForSelector('ion-item-sliding', { timeout: 60000 });
await page.locator('ion-item-sliding ion-item').first().click();
await page.waitForSelector('.score-page svg', { timeout: 60000 });
const indicator = () => page.locator('[data-testid=page-indicator]').innerText();
// Count beats seen by the UI.
await page.evaluate(() => {
  window.__beats = { beat: 0, accent: 0 };
  new MutationObserver(() => {
    const c = document.querySelector('.beat-dot')?.className ?? '';
    if (c.includes('accent')) window.__beats.accent++;
    else if (c.includes('beat')) window.__beats.beat++;
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
});
await page.getByRole('button', { name: 'Faster' }).click(); // 105 %
for (let i = 0; i < 9; i++) await page.getByRole('button', { name: 'Faster' }).click(); // 150 %
console.log('tempo', await page.locator('[data-testid=tempo]').innerText());
await page.getByRole('button', { name: 'Metronome off' }).click();
await page.getByRole('button', { name: /Play/ }).click();
const samples = [];
for (let s = 0; s < 12; s++) {
  await page.waitForTimeout(1000);
  samples.push(`${s + 1}s:${await indicator()}:${await page.locator('.score-page g.measure.current').count()}`);
  if (s === 5) await page.screenshot({ path: `${shots}/playing.png` });
}
console.log(samples.join('  '));
await page.getByRole('button', { name: 'Pause' }).click();
console.log('beats seen', await page.evaluate(() => window.__beats), 'errors', errors);
await browser.close();
await server.close();
