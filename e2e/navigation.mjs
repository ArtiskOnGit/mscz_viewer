// Navigation E2E: go to bar / rehearsal mark (+ start of the auto-scroll there), lock mode, configurable pedal keys,
// half-page turns, metronome only (headless Chromium, Pixel 7). Exits with code 1 on the first failed check.
// Usage: node e2e/navigation.mjs "$PWD" [screenshot-dir] [score-file-name]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';

const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const file = `${root}/test-scores/${process.argv[4] ?? 'Toccata_v2.mscz'}`;
const base = 'http://127.0.0.1:5196';
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port: 5196, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1, locale: 'en-US' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed = true;
};
const indicator = () => page.locator('[data-testid=page-indicator]').innerText();
const pageNumber = async () => Number((await indicator()).split(/[ ½/]/)[0]);
const pageCount = async () => Number((await indicator()).split('/')[1]);
const key = async (code) => {
  await page.keyboard.press(code);
  await page.waitForTimeout(250);
};
const openViewer = async (url) => {
  await page.goto(url);
  await page.waitForSelector('.score-page svg', { timeout: 60000 });
  await page.waitForTimeout(400);
};
const noModal = () => page.waitForFunction(() => !document.querySelector('ion-modal.show-modal'));
const longPress = async (selector, ms) => {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
  await page.waitForTimeout(200);
};

// No count-in: the auto-scroll starts at once.
await page.addInitScript(() => {
  if (!localStorage.getItem('CapacitorStorage.settings')) localStorage.setItem('CapacitorStorage.settings', JSON.stringify({ countInMeasures: 0 }));
});
await page.goto(`${base}/library`);
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('ion-fab-button').click()]);
await chooser.setFiles(file);
await page.waitForSelector('ion-item-sliding', { timeout: 60000 });
await page.locator('ion-item-sliding ion-item').first().click();
await page.waitForSelector('.score-page svg', { timeout: 60000 });
const viewerUrl = page.url();
const count = await pageCount();
console.log('pages', count);

// --- go to bar / rehearsal mark ---
const openGoTo = async () => {
  await page.locator('[data-testid=goto-button]').click();
  await page.waitForSelector('ion-modal.show-modal [data-testid=goto-input]');
  await page.waitForTimeout(300);
};
const goToBar = async (bar) => {
  await openGoTo();
  await page.locator('[data-testid=goto-input] input').fill(String(bar));
  await page.locator('[data-testid=goto-submit]').click();
  await noModal();
  await page.waitForTimeout(400);
};
await openGoTo();
const marks = await page.locator('[data-testid=goto-mark]').count();
check('rehearsal marks listed', marks > 0, `${marks} marks`);
await page.locator('[data-testid=goto-input] input').fill('99999');
await page.locator('[data-testid=goto-submit]').click();
check('unknown bar refused', await page.locator('[data-testid=goto-invalid]').isVisible());
await page.locator('ion-modal.show-modal ion-header ion-button').click();
await noModal();

let startedMidPage = false;
for (const nth of [Math.floor(marks / 2), marks - 1, 1]) {
  await openGoTo();
  const mark = page.locator('[data-testid=goto-mark]').nth(nth);
  const label = await mark.innerText();
  await mark.click();
  await noModal();
  await page.waitForTimeout(500);
  const p = await pageNumber();
  // ▶ must start from the mark's bar, not from the top of the page.
  await page.getByRole('button', { name: /^Play/ }).click();
  await page.waitForTimeout(700);
  const rank = await page.evaluate(() => [...document.querySelectorAll('.score-page g.measure')].findIndex((g) => g.classList.contains('current')));
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForTimeout(200);
  console.log(`  mark ${label} → page ${p}, playing from bar #${rank} of the page`);
  if (rank > 0) startedMidPage = true;
}
check('go to mark changes the page', (await pageNumber()) >= 1);
check('auto-scroll starts from the chosen bar', startedMidPage);
await goToBar(1);
check('go to bar 1 → page 1', (await pageNumber()) === 1, await indicator());

// --- lock mode ---
await page.locator('[data-testid=lock-button]').click();
await page.waitForTimeout(200);
check('locked', (await page.locator('[data-testid=lock-button]').getAttribute('data-locked')) === 'true');
check('toolbar buttons hidden', (await page.locator('[data-testid=zoom-button]').count()) === 0 && (await page.locator('[data-testid=goto-button]').count()) === 0);
const stage = await page.locator('[data-testid=score-stage]').boundingBox();
await page.mouse.click(stage.x + stage.width / 2, stage.y + stage.height / 2);
await page.waitForTimeout(200);
check('centre tap keeps the toolbar', await page.locator('[data-testid=lock-button]').isVisible());
await page.mouse.click(stage.x + stage.width * 0.9, stage.y + stage.height / 2);
await page.waitForTimeout(250);
check('tap zone turns the page when locked', (await pageNumber()) === 2, await indicator());
await key('ArrowLeft');
check('pedal key turns the page when locked', (await pageNumber()) === 1, await indicator());
await page.screenshot({ path: `${shots}/nav-locked.png` });
await page.locator('[data-testid=lock-button]').click(); // short press: stays locked
await page.waitForTimeout(200);
check('short press does not unlock', (await page.locator('[data-testid=lock-button]').getAttribute('data-locked')) === 'true');
await longPress('[data-testid=lock-button]', 950);
check('long press unlocks', (await page.locator('[data-testid=lock-button]').getAttribute('data-locked')) === 'false');
check('toolbar buttons back', (await page.locator('[data-testid=zoom-button]').count()) === 1);

// --- metronome only ---
await longPress('[data-testid=metronome-button]', 750);
check('metronome only running', (await page.locator('[data-testid=metronome-button]').getAttribute('data-metronome-only')) === 'true');
await page.waitForTimeout(1500);
check('metronome only: beat indicator, no highlight, no page turn',
  (await page.locator('.beat-dot').isVisible()) && (await page.locator('.score-page g.measure.current').count()) === 0 && (await pageNumber()) === 1,
  await indicator());
await key('ArrowRight');
check('manual page turn while the metronome clicks', (await pageNumber()) === 2);
await page.locator('[data-testid=metronome-button]').click();
await page.waitForTimeout(200);
check('metronome only stopped', (await page.locator('[data-testid=metronome-button]').getAttribute('data-metronome-only')) === 'false' && !(await page.locator('.beat-dot').isVisible()));
// Pedal action "metronome" (default key M): toggles the metronome of the auto-scroll.
const metronomePressed = () => page.locator('[data-testid=metronome-button]').getAttribute('data-metronome');
const before = await metronomePressed();
await key('KeyM');
check('pedal "metronome" toggles the metronome', (await metronomePressed()) !== before, `${before} → ${await metronomePressed()}`);
await key('KeyM');
check('pedal "metronome" again restores it', (await metronomePressed()) === before);
await key('ArrowLeft');
await page.waitForTimeout(600); // debounced save of the last page

// --- configurable pedal keys + half-page setting ---
await page.goto(`${base}/settings`);
await page.waitForSelector('[data-testid=pedal-set-next]');
await page.locator('[data-testid=pedal-set-next]').click();
await page.waitForSelector('ion-modal.show-modal [data-testid=pedal-capture]');
await page.waitForTimeout(300);
await page.keyboard.press('KeyN');
await page.locator('[data-testid=pedal-replace]').click();
await noModal();
check('next key replaced', (await page.locator('[data-testid=pedal-keys-next]').innerText()) === 'KeyN');
await page.locator('[data-testid=pedal-set-prev]').click();
await page.waitForSelector('ion-modal.show-modal [data-testid=pedal-capture]');
await page.waitForTimeout(300);
await page.keyboard.press('ArrowRight'); // pedals often send arrows: added to "previous" for this test
await page.locator('[data-testid=pedal-add]').click();
await noModal();
check('prev key added', (await page.locator('[data-testid=pedal-keys-prev]').innerText()).endsWith('ArrowRight'));
check('key removed from the other action', !(await page.locator('[data-testid=pedal-keys-next]').innerText()).includes('ArrowRight'));
await page.locator('[data-testid=half-page-toggle]').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${shots}/nav-settings.png`, fullPage: true });

await openViewer(viewerUrl);
check('back on page 1', (await pageNumber()) === 1, await indicator());
await key('KeyN');
check('custom next key → composite half page', (await page.locator('[data-testid=half-page]').count()) === 1 && (await indicator()).startsWith('1½'), await indicator());
const halves = await page.evaluate(() => [...document.querySelectorAll('[data-testid=half-page] .half-layer')].map((l) => l.innerHTML.length));
check('half page = two page layers', halves.length === 2 && halves.every((n) => n > 1000));
await page.screenshot({ path: `${shots}/nav-half.png` });
await key('KeyN');
check('second next → full next page', (await page.locator('[data-testid=half-page]').count()) === 0 && (await indicator()).startsWith('2 '), await indicator());
await key('ArrowRight'); // now bound to "previous"
check('custom prev key → back to the half page', (await indicator()).startsWith('1½'), await indicator());
await key('ArrowLeft');
check('prev again → page 1', (await indicator()).startsWith('1 '), await indicator());
await key('PageDown');
check('removed default key does nothing', (await indicator()).startsWith('1 '), await indicator());

// Restore the defaults.
await page.goto(`${base}/settings`);
await page.waitForSelector('[data-testid=pedal-reset]');
await page.locator('[data-testid=pedal-reset]').click();
await page.waitForTimeout(300);
check('pedal keys reset', (await page.locator('[data-testid=pedal-keys-next]').innerText()).startsWith('ArrowRight'));
check('dedicated actions listed (metronome, next / previous piece)',
  (await page.locator('[data-testid=pedal-keys-metronome]').innerText()) === 'KeyM' &&
  (await page.locator('[data-testid=pedal-keys-nextPiece]').innerText()) === 'MediaTrackNext' &&
  (await page.locator('[data-testid=pedal-set-previousPiece]').count()) === 1);

const realErrors = errors.filter((e) => !/Outdated Optimize Dep/.test(e));
check('no page errors', realErrors.length === 0, realErrors.join(' | '));
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
