// Display & page-turn settings E2E (phase 3): music font, bar numbers, title, tap zone width, page-turn animation
// (and reduced motion), metronome on for new scores (headless Chromium, Pixel 7). Exits with code 1 on a failed check.
// Usage: node e2e/display-settings.mjs "$PWD" [screenshot-dir]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';

const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const base = 'http://127.0.0.1:5201';
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port: 5201, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1, locale: 'en-US' });
const page = await context.newPage();
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
const setSettings = (patch) =>
  page.evaluate((p) => {
    const cur = JSON.parse(localStorage.getItem('CapacitorStorage.settings') ?? '{}');
    localStorage.setItem('CapacitorStorage.settings', JSON.stringify({ ...cur, ...p }));
  }, patch);
const svgInfo = () =>
  page.evaluate(() => {
    const svg = document.querySelector('.score-page svg');
    const mnums = [...document.querySelectorAll('.score-page g.mNum')];
    return {
      header: !!svg?.querySelector('g.pgHead'),
      mnum: mnums.length,
      mnumShown: mnums.filter((g) => getComputedStyle(g).display !== 'none').length,
      // The music font shows in the glyph definitions (<defs>): their shapes differ from one font to another.
      defs: svg?.querySelector('defs')?.innerHTML.length ?? 0,
    };
  });
let viewerUrl = '';
const reopen = async () => {
  await page.goto(viewerUrl);
  await page.waitForSelector('.score-page svg', { timeout: 60000 });
  await page.waitForTimeout(500);
};

await page.goto(`${base}/library`);
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('ion-fab-button').click()]);
await chooser.setFiles(`${root}/test-scores/Toccata_v2.mscz`);
await page.waitForSelector('ion-item-sliding', { timeout: 60000 });
// Metronome on for new scores: set before the first opening.
await setSettings({ metronomeDefault: true });
await page.reload();
await page.waitForSelector('ion-item-sliding', { timeout: 60000 });
await page.locator('ion-item-sliding ion-item').first().click();
await page.waitForSelector('.score-page svg', { timeout: 60000 });
await page.waitForTimeout(500);
viewerUrl = page.url();
check('metronome on for a new score', (await page.locator('[data-testid=metronome-button]').getAttribute('data-metronome')) === 'true');

// --- defaults: title on the first page, bar numbers at the start of systems, Leipzig ---
const def = await svgInfo();
check('title shown on the first page by default', def.header);
check('bar numbers at the start of systems by default', def.mnum > 0 && def.mnumShown === def.mnum, `${def.mnum}`);
await page.screenshot({ path: `${shots}/display-default.png` });

// --- bar numbers "every bar", chosen in the settings screen ---
await page.goto(`${base}/settings`);
await page.locator('[data-testid=bar-numbers]').click();
await page.locator('ion-popover ion-item', { hasText: 'Every bar' }).click();
await page.waitForTimeout(400);
await reopen();
const every = await svgInfo();
check('bar numbers on every bar', every.mnum > def.mnum, `${def.mnum} → ${every.mnum}`);

// --- every 5 bars, no title, Bravura ---
await setSettings({ barNumbers: 'every5', showHeader: false, musicFont: 'Bravura' });
await reopen();
const five = await svgInfo();
check('bar numbers every 5 bars', five.mnum > 0 && five.mnum < every.mnum, `${five.mnum}`);
check('title hidden', !five.header);
check('Bravura glyphs differ from Leipzig', five.defs !== def.defs, `${def.defs} vs ${five.defs}`);
await page.screenshot({ path: `${shots}/display-bravura.png` });
await setSettings({ musicFont: 'Leland' });
await reopen();
check('Leland glyphs differ from Bravura', (await svgInfo()).defs !== five.defs);

// --- bar numbers hidden ---
await setSettings({ barNumbers: 'none', musicFont: 'Leipzig' });
await reopen();
const none = await svgInfo();
check('no bar number visible', none.mnumShown === 0, `${none.mnum} laid out, ${none.mnumShown} shown`);

// --- tap zone width: 20 % ---
await setSettings({ tapZoneWidth: 0.2 });
await reopen();
const stage = await page.locator('[data-testid=score-stage]').boundingBox();
const tapAt = async (fx) => {
  await page.mouse.click(stage.x + stage.width * fx, stage.y + stage.height / 2);
  await page.waitForTimeout(350);
};
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(350);
const p2 = await pageNumber();
await tapAt(0.27); // inside the default third, outside 20 %: toggles the toolbars
check('tap at 27 % does not turn the page with 20 % zones', (await pageNumber()) === p2);
await tapAt(0.27); // toolbars back
await tapAt(0.1);
check('tap at 10 % turns back', (await pageNumber()) === p2 - 1);
// The previous page must be displayed (rendered) before the next turn, else nothing changes on screen.
await page.waitForSelector('.score-page[data-turn=prev]', { timeout: 3000 }).catch(() => undefined);
await page.waitForTimeout(200);

// --- page-turn animation (slide by default), none under reduced motion ---
await page.keyboard.press('ArrowRight');
await page.waitForSelector('.score-page[data-turn=next]', { timeout: 3000 }).catch(() => undefined);
const anim = await page.evaluate(() => {
  const el = document.querySelector('.score-page');
  return { turn: el?.getAttribute('data-turn'), name: el ? getComputedStyle(el).animationName : '', ms: el ? parseFloat(getComputedStyle(el).animationDuration) * 1000 : 0 };
});
check('slide animation on page turn', anim.turn === 'next' && anim.name === 'pupitre-turn-next' && anim.ms <= 150, JSON.stringify(anim));
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.keyboard.press('ArrowLeft');
await page.waitForSelector('.score-page[data-turn=prev]', { timeout: 3000 }).catch(() => undefined);
const reduced = await page.evaluate(() => getComputedStyle(document.querySelector('.score-page')).animationName);
check('no animation with reduced motion', reduced === 'none', reduced);
await page.emulateMedia({ reducedMotion: 'no-preference' });
await setSettings({ pageTurnAnimation: 'fade' });
await reopen();
await page.keyboard.press('ArrowRight');
await page.waitForSelector('.score-page[data-turn=next]', { timeout: 3000 }).catch(() => undefined);
check('fade animation', (await page.evaluate(() => getComputedStyle(document.querySelector('.score-page')).animationName)) === 'pupitre-turn-fade');

// --- settings screen: the new settings are listed ---
await page.goto(`${base}/settings`);
await page.waitForSelector('[data-testid=orientation]');
for (const id of ['music-font', 'bar-numbers', 'show-header', 'tap-zone-width', 'page-turn-animation', 'turn-lookahead', 'metronome-default', 'metronome-accent', 'orientation']) {
  check(`setting ${id} shown`, (await page.locator(`[data-testid=${id}]`).count()) === 1);
}
await page.screenshot({ path: `${shots}/settings-phase3.png`, fullPage: true });

check('no console errors', errors.length === 0, errors.join(' | '));
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
