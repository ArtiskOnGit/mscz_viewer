// Continuous mode E2E: one vertical scroll (lazy pages), pedal / tap scroll by a screen, toolbars, zoom keeping the
// position, go to bar, auto-scroll at the reading line, parts, lock mode, persistence, back to pages
// (headless Chromium, Pixel 7). Exits with code 1 if a check fails.
// Usage: node e2e/continuous.mjs "$PWD" [screenshot-dir] [score-file-name]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';

const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const file = `${root}/test-scores/${process.argv[4] ?? 'Toccata_v2.mscz'}`;
const base = 'http://127.0.0.1:5197';
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port: 5197, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1 })).newPage();
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
const noModal = () => page.waitForFunction(() => !document.querySelector('ion-modal.show-modal'));
const scroller = '[data-testid=continuous-scroll]';
const waitContinuous = async () => {
  await page.waitForSelector(`${scroller} .continuous-page svg`, { timeout: 60000 });
  await page.waitForTimeout(600);
};
/** Scroll geometry and lazy rendering state. */
const state = () =>
  page.evaluate((sel) => {
    const sc = document.querySelector(sel);
    return {
      top: sc.scrollTop,
      height: sc.clientHeight,
      scrollHeight: sc.scrollHeight,
      rendered: sc.querySelectorAll('.continuous-page').length,
      placeholders: sc.querySelectorAll('.continuous-placeholder').length,
    };
  }, scroller);
/** Id and screen offset (fraction of the scroller height) of the first system's first measure on screen. */
const topMeasure = () =>
  page.evaluate((sel) => {
    const sc = document.querySelector(sel);
    const v = sc.getBoundingClientRect();
    const s = [...sc.querySelectorAll('g.system')].find((g) => g.getBoundingClientRect().top >= v.top - 4);
    const m = s?.querySelector('g.measure');
    return m ? { id: m.id, offset: (m.closest('g.system').getBoundingClientRect().top - v.top) / v.height } : undefined;
  }, scroller);
const offsetOf = (id) =>
  page.evaluate(([sel, id]) => {
    const sc = document.querySelector(sel);
    const v = sc.getBoundingClientRect();
    const el = sc.querySelector(`[id="${CSS.escape(id)}"]`);
    return el ? (el.getBoundingClientRect().top - v.top) / v.height : undefined;
  }, [scroller, id]);
const tap = async (fx) => {
  const box = await page.locator('[data-testid=score-stage]').boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height / 2);
  await page.waitForTimeout(800);
};

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

// --- switch to continuous ---
check('layout toggle in pages mode', (await page.locator('[data-testid=layout-toggle]').getAttribute('data-layout')) === 'pages');
await page.locator('[data-testid=layout-toggle]').click();
await waitContinuous();
let s = await state();
console.log('  continuous:', JSON.stringify(s), await indicator());
check('one vertical scroll, taller than the screen', s.scrollHeight > s.height * 3);
check('pages rendered lazily (placeholders elsewhere)', s.rendered >= 1 && s.rendered <= 8 && s.placeholders > 0, `${s.rendered} rendered, ${s.placeholders} placeholders`);
await page.screenshot({ path: `${shots}/continuous.png` });

// --- pedal / keys: scroll by about a screen ---
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(900);
let s2 = await state();
check('pedal "next" scrolls by about one screen', Math.abs(s2.top - s.top - 0.85 * s.height) < 0.1 * s.height, `${s.top} → ${s2.top}`);
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(900);
check('pedal "previous" scrolls back', Math.abs((await state()).top - s.top) < 0.1 * s.height, String((await state()).top));

// --- taps: sides scroll by a screen, centre toggles the toolbars ---
s = await state();
await tap(0.9);
s2 = await state();
check('right tap scrolls down a screen', s2.top - s.top > 0.7 * s.height, `${s.top} → ${s2.top}`);
await tap(0.1);
check('left tap scrolls back up', (await state()).top < s2.top - 0.7 * s.height);
await tap(0.5);
check('centre tap hides the toolbars', (await page.locator('ion-page.score-chrome-hidden, .ion-page.score-chrome-hidden').count()) === 1);
await tap(0.5);
check('centre tap shows them again', (await page.locator('.score-chrome-hidden').count()) === 0);

// --- scroll far: page indicator follows, rendering stays bounded, positions stay anchored ---
await page.evaluate((sel) => {
  const sc = document.querySelector(sel);
  sc.scrollTop = sc.scrollHeight * 0.5;
}, scroller);
await page.waitForTimeout(1500);
s = await state();
const mid = await pageNumber();
check('page indicator follows the scroll', mid > 3, await indicator());
check('rendered pages stay bounded', s.rendered <= 8, `${s.rendered} rendered`);
const before = await topMeasure();
await page.waitForTimeout(1200);
const after = await offsetOf(before.id);
check('rendering pages above does not move the reading position', after !== undefined && Math.abs(after - before.offset) < 0.02, `${before.offset.toFixed(3)} → ${after?.toFixed(3)}`);

// --- zoom: relayout keeping the first measure on screen ---
await page.waitForTimeout(400); // the view reports the first measure on screen once the scroll settles
const anchor = await topMeasure();
await page.getByRole('button', { name: 'Zoom in' }).click();
await page.waitForTimeout(2500);
await waitContinuous();
const zoomed = await offsetOf(anchor.id);
check('zoom keeps the position', zoomed !== undefined && zoomed > -0.05 && zoomed < 0.3, `measure ${anchor.id} at ${zoomed?.toFixed(3)} of the screen`);
await page.screenshot({ path: `${shots}/continuous-zoomed.png` });
await page.getByRole('button', { name: 'Automatic zoom' }).click();
await page.waitForTimeout(2500);
await waitContinuous();

// --- go to bar ---
const goToMark = async (nth) => {
  await page.locator('[data-testid=goto-button]').click();
  await page.waitForSelector('ion-modal.show-modal [data-testid=goto-mark]');
  await page.waitForTimeout(300);
  const mark = page.locator('[data-testid=goto-mark]').nth(nth);
  const label = await mark.innerText();
  await mark.click();
  await noModal();
  await page.waitForTimeout(1200);
  return label;
};
const marks = await (async () => {
  await page.locator('[data-testid=goto-button]').click();
  await page.waitForSelector('ion-modal.show-modal [data-testid=goto-mark]');
  const n = await page.locator('[data-testid=goto-mark]').count();
  await page.locator('ion-modal.show-modal ion-header ion-button').click();
  await noModal();
  return n;
})();
const label = await goToMark(marks - 1);
const target = await topMeasure();
check('go to the last rehearsal mark scrolls there', (await pageNumber()) > mid && target && target.offset < 0.15, `mark ${label}, ${await indicator()}, top system at ${target?.offset.toFixed(3)}`);
await goToMark(0);
check('go to the first mark scrolls back up', (await pageNumber()) <= 2, await indicator());

// --- auto-scroll: smooth, current system at the reading line ---
await page.getByRole('button', { name: /^Play/ }).click();
await page.waitForTimeout(2500);
const samples = [];
for (let i = 0; i < 40; i++) {
  samples.push(await page.evaluate((sel) => document.querySelector(sel).scrollTop, scroller));
  await page.waitForTimeout(100);
}
const line = await page.evaluate((sel) => {
  const sc = document.querySelector(sel);
  const v = sc.getBoundingClientRect();
  const m = sc.querySelector('g.measure.current');
  const sys = m?.closest('g.system')?.getBoundingClientRect();
  return sys ? { top: (sys.top - v.top) / v.height, bottom: (sys.bottom - v.top) / v.height } : undefined;
}, scroller);
await page.getByRole('button', { name: 'Pause' }).click();
const steps = samples.slice(1).map((y, i) => y - samples[i]);
const moved = samples[samples.length - 1] - samples[0];
console.log(`  auto-scroll: moved ${moved.toFixed(0)} px in 4 s, steps ${Math.min(...steps).toFixed(1)}…${Math.max(...steps).toFixed(1)} px, current system ${JSON.stringify(line)}`);
check('auto-scroll scrolls down', moved > 20);
check('auto-scroll is smooth (no jump, no going back)', Math.max(...steps) < 0.15 * s.height && Math.min(...steps) > -2);
check('current system at the reading line (33 %)', line && line.top <= 0.36 && line.bottom >= 0.2, JSON.stringify(line));
await page.screenshot({ path: `${shots}/continuous-playing.png` });

// --- parts: still continuous after choosing a part ---
await page.getByRole('button', { name: 'Instruments' }).click();
await page.locator('ion-modal ion-checkbox').first().click();
await page.locator('ion-modal ion-checkbox').nth(2).click();
await page.locator('ion-modal ion-footer ion-button').click();
await noModal();
await page.waitForTimeout(2000);
await waitContinuous();
check('part selection keeps the continuous mode', (await page.locator(`${scroller} .continuous-page svg`).count()) > 0);

// --- lock mode: side taps still scroll, centre tap ignored ---
await page.locator('[data-testid=lock-button]').click();
await page.waitForTimeout(200);
s = await state();
await tap(0.9);
check('locked: side tap scrolls', (await state()).top > s.top + 0.5 * s.height);
await tap(0.5);
check('locked: centre tap keeps the toolbar', await page.locator('[data-testid=lock-button]').isVisible());
const box = await page.locator('[data-testid=lock-button]').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(950);
await page.mouse.up();
await page.waitForTimeout(300);

// --- persistence: reopen in continuous mode near the same place ---
const pageBefore = await pageNumber();
await page.waitForTimeout(800);
await page.goto(viewerUrl);
await waitContinuous();
check('layout remembered for the score', (await page.locator('[data-testid=layout-toggle]').getAttribute('data-layout')) === 'continuous');
check('reopened at the saved page', Math.abs((await pageNumber()) - pageBefore) <= 1, `${pageBefore} → ${await indicator()}`);

// --- back to pages ---
await page.locator('[data-testid=layout-toggle]').click();
await page.waitForSelector('.score-stage[data-layout=pages] .score-page svg', { timeout: 60000 });
await page.waitForTimeout(500);
check('back to pages mode', (await page.locator(scroller).count()) === 0 && (await page.locator('.score-page > svg').count()) === 1);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(300);
check('pages mode turns pages again', (await pageNumber()) >= 2, await indicator());

// --- settings ---
await page.goto(`${base}/settings`);
await page.waitForSelector('[data-testid=default-layout]');
check('settings: default layout and reading line', (await page.locator('[data-testid=default-layout]').count()) === 1 && (await page.locator('[data-testid=reading-line]').count()) === 1);

const realErrors = errors.filter((e) => !/Outdated Optimize Dep/.test(e));
check('no page errors', realErrors.length === 0, realErrors.join(' | '));
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
