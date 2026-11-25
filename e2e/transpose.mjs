// Transposition E2E (headless Chromium, Pixel 7). Usage: node e2e/transpose.mjs "$PWD" [screenshot-dir]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';
const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port: 5191, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://127.0.0.1:5191/library');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('ion-fab-button').click()]);
await chooser.setFiles(`${root}/test-scores/unity_transpos_.mscz`);
await page.waitForSelector('ion-item-sliding', { timeout: 60000 });
await page.locator('ion-item-sliding ion-item').first().click();
await page.waitForSelector('.score-page svg', { timeout: 60000 });
// Tenor sax only.
await page.getByRole('button', { name: 'Instruments' }).click();
await page.locator('ion-modal ion-checkbox').first().click();
await page.locator('ion-modal ion-checkbox').nth(2).click();
await page.locator('ion-modal ion-footer ion-button').click();
await page.waitForTimeout(1500);
// Verovio draws key signatures as <g class="keySig"> containing one <g class="keyAccid"> per accidental.
const accidentals = () => page.evaluate(() => document.querySelector('.score-page g.keySig')?.querySelectorAll('.keyAccid').length ?? 0);
console.log('before: key-signature glyphs', await accidentals());
await page.getByTestId('transpose-button').click();
await page.waitForSelector('ion-modal.show-modal');
console.log('key line:', await page.getByTestId('transpose-key').innerText().catch(() => '(none)'));
await page.locator('ion-modal ion-chip', { hasText: 'B♭ instrument' }).click();
console.log('after preset:', await page.getByTestId('transpose-semitones').innerText(), '|', await page.getByTestId('transpose-key').innerText().catch(() => '(none)'));
await page.locator('ion-modal ion-footer ion-button', { hasText: 'Apply' }).click();
await page.waitForTimeout(2000);
console.log('after: key-signature glyphs', await accidentals(), '| badge', await page.getByTestId('transpose-button').innerText());
await page.screenshot({ path: `${shots}/transposed.png` });
let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed = true;
};
check('B♭ preset → 2 sharps', (await accidentals()) === 2);

// Accidental preference: +1 semitone from C = D♭ (5♭) or C♯ (7♯).
const openModal = async () => {
  await page.getByTestId('transpose-button').click();
  await page.waitForSelector('ion-modal.show-modal');
  await page.waitForTimeout(300);
};
const apply = async () => {
  await page.locator('ion-modal ion-footer ion-button', { hasText: 'Apply' }).click();
  await page.waitForFunction(() => !document.querySelector('ion-modal.show-modal'));
  await page.waitForTimeout(2000);
};
await openModal();
check('no spelling choice for D major', (await page.getByTestId('accidental-preference').count()) === 0);
await page.locator('ion-modal ion-item', { has: page.getByTestId('transpose-semitones') }).locator('ion-button').first().click();
check('+1 → D♭ by default', (await page.getByTestId('transpose-key').innerText()).includes('D♭'), await page.getByTestId('transpose-key').innerText());
check('spelling choice offered', await page.getByTestId('accidental-preference').isVisible());
await page.getByTestId('accidentals-sharps').click();
await page.waitForTimeout(200);
check('sharps → C♯', (await page.getByTestId('transpose-key').innerText()).includes('C♯'), await page.getByTestId('transpose-key').innerText());
await apply();
check('C♯ major rendered (7 sharps)', (await accidentals()) === 7, String(await accidentals()));
await page.screenshot({ path: `${shots}/transposed-csharp.png` });
await openModal();
await page.getByTestId('accidentals-flats').click();
await apply();
check('D♭ major rendered (5 flats)', (await accidentals()) === 5, String(await accidentals()));

check('no page errors', errors.filter((e) => !/Outdated Optimize Dep/.test(e)).length === 0, errors.join(' | '));
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
