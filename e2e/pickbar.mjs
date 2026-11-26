// Start the auto-scroll from a bar picked by a long press (pages and continuous modes), normal taps unchanged; the
// score is opened a second time first so that its pages come from the render cache (ids must match the fresh
// Verovio worker) (headless Chromium, Pixel 7). Exits with code 1 if a check fails.
// Usage: node e2e/pickbar.mjs "$PWD" [screenshot-dir] [score-file-name]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';

const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const file = `${root}/test-scores/${process.argv[4] ?? 'unity_transpos_.mscz'}`;
const port = 5187;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port, host: '127.0.0.1' }, logLevel: 'error' });
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
const visible = '.ion-page:not(.ion-page-hidden)';
const stage = `${visible} [data-testid=score-stage]`;

await page.goto(`http://127.0.0.1:${port}/library`);
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('ion-fab-button').click()]);
await chooser.setFiles(file);
await page.waitForSelector('ion-item-sliding', { timeout: 60000 });
const openScore = async () => {
  await page.locator(`${visible} ion-item-sliding ion-item`).first().click();
  await page.waitForSelector(`${visible} .score-page svg g.measure`, { timeout: 60000 });
  await page.waitForTimeout(500);
};
await openScore();
await page.locator(`${visible} ion-back-button`).last().click();
await page.waitForFunction(() => location.pathname.startsWith('/library'));
await page.waitForTimeout(1500); // the render cache index is saved
await openScore(); // pages from the render cache now

/** Centre of the n-th measure (screen) inside `scope`, with its id. */
const measure = (n, scope = '.score-page') =>
  page.evaluate(
    ([sel, n]) => {
      const all = [...document.querySelectorAll(sel)].flatMap((p) => [...p.querySelectorAll('g.measure')]);
      const vh = window.innerHeight;
      const onScreen = all.filter((g) => {
        const r = g.getBoundingClientRect();
        const y = r.top + r.height / 2;
        return y > 80 && y < vh - 100 && r.width > 0;
      });
      const g = onScreen[Math.min(n, onScreen.length - 1)];
      if (!g) return undefined;
      const r = g.getBoundingClientRect();
      return { id: g.id, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    [`${visible} ${scope}`, n],
  );
const longPress = async ({ x, y }) => {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(200);
};
const picked = () => page.locator(stage).getAttribute('data-picked-measure');
const current = () => page.evaluate((s) => document.querySelector(`${s} g.measure.current`)?.id ?? null, stage);
const waitCurrent = (id, timeout = 15000) =>
  page.waitForFunction(([s, id]) => document.querySelector(`${s} g.measure.current`)?.id === id, [stage, id], { timeout }).then(
    () => true,
    () => false,
  );
/** Toasts are shown in the middle of the screen: wait until they are gone before tapping there. */
const noToast = () => page.waitForFunction(() => document.querySelectorAll('ion-toast').length === 0, null, { timeout: 8000 }).catch(() => undefined);
const toastText = () => page.evaluate(() => [...document.querySelectorAll('ion-toast')].map((t) => t.message ?? '').join(' | '));
const playButton = () => page.getByRole('button', { name: /^Play/ });
const pauseButton = () => page.getByRole('button', { name: 'Pause' });

// --- pages mode ---
const target = await measure(2);
check('a measure is on screen', !!target, JSON.stringify(target));
await longPress(target);
check('long press picks the bar', (await picked()) === target.id, `${await picked()} vs ${target.id}`);
check('feedback toast', (await toastText()).includes('will start at bar'), await toastText());
const color = await page.evaluate((id) => getComputedStyle(document.querySelector(`[id="${CSS.escape(id)}"]`)).color, target.id);
const otherColor = await page.evaluate((id) => getComputedStyle(document.querySelector(`[id="${CSS.escape(id)}"]`)).color, (await measure(0)).id);
check('the picked bar is marked', color !== otherColor, `${color} / ${otherColor}`);
await page.screenshot({ path: `${shots}/pickbar-pages.png` });
await noToast();

// A normal tap in the centre still shows / hides the toolbars.
const box = await page.locator(stage).boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(300);
check('tap in the centre hides the toolbars', (await page.locator(`${visible}.score-chrome-hidden`).count()) === 1);
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(300);
check('tap again shows them', (await page.locator(`${visible}.score-chrome-hidden`).count()) === 0);
check('taps keep the pick', (await picked()) === target.id);

await playButton().click();
check('▶ starts at the picked bar', await waitCurrent(target.id), `current ${await current()}`);
check('the pick is used up', (await picked()) === null);
// While playing: a long press on another bar restarts there.
const first = await measure(0);
await longPress(first);
check('long press while playing restarts at that bar', await waitCurrent(first.id), `current ${await current()}`);
await pauseButton().click();
await page.waitForTimeout(300);

// --- continuous mode ---
await page.locator(`${visible} [data-testid=layout-toggle]`).click();
await page.waitForSelector(`${visible} [data-testid=continuous-scroll] .continuous-page svg`, { timeout: 60000 });
await page.waitForTimeout(800);
const cont = await measure(1, '.continuous-page');
check('continuous: a measure is on screen', !!cont, JSON.stringify(cont));
await longPress(cont);
check('continuous: long press picks the bar', (await picked()) === cont.id, `${await picked()} vs ${cont.id}`);
await page.screenshot({ path: `${shots}/pickbar-continuous.png` });
await noToast();
// Long press on the same bar again: pick cleared.
await longPress(cont);
check('continuous: same bar again clears the pick', (await picked()) === null);
await noToast();
await longPress(cont);
await noToast();
await playButton().click();
check('continuous: ▶ starts at the picked bar', await waitCurrent(cont.id), `current ${await current()}`);
await pauseButton().click();

// Lock mode: a long press does nothing.
await page.locator(`${visible} [data-testid=lock-button]`).click();
await page.waitForTimeout(300);
await longPress(await measure(2, '.continuous-page'));
check('lock mode: no pick', (await picked()) === null);

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
