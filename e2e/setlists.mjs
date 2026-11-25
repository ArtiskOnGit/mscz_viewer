// Setlists E2E: import 2 scores, create a setlist, add both, play, go to the next piece (headless Chromium, Pixel 7).
// Usage: node e2e/setlists.mjs "$PWD" [screenshot-dir]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';

const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const files = ['unity_transpos_.mscz', 'Toccata_v2.mscz'].map((f) => `${root}/test-scores/${f}`);
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port: 5192, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => {
  if (!cond) {
    console.log('FAIL:', msg, '| errors:', errors);
    process.exitCode = 1;
  } else console.log('ok:', msg);
};
const title = () => page.locator('.ion-page:not(.ion-page-hidden) ion-header ion-title').last().innerText();
/** Wait until the visible (last) page title contains `text`. */
const waitTitle = (text) =>
  page
    .waitForFunction(
      (t) => [...document.querySelectorAll('.ion-page:not(.ion-page-hidden) ion-header ion-title')].at(-1)?.textContent?.includes(t),
      text,
      { timeout: 30000 },
    )
    .catch(() => undefined);

await page.goto('http://127.0.0.1:5192/library');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('ion-fab-button').click()]);
await chooser.setFiles(files);
await page.waitForFunction(() => document.querySelectorAll('ion-item-sliding').length >= 2, null, { timeout: 120000 });

// Create a setlist.
// The import overlay may still be closing: retry the tab switch until the setlists tab is shown.
for (let i = 0; i < 10 && !(await page.locator('[data-testid=new-setlist]').count()); i++) {
  await page.locator('ion-segment-button', { hasText: 'Setlists' }).click();
  await page.waitForTimeout(500);
}
await page.locator('[data-testid=new-setlist]').click();
await page.locator('ion-alert input').fill('Concert');
await page.locator('ion-alert button', { hasText: 'Create' }).click();
await page.waitForURL(/\/setlist\//);
await waitTitle('Concert');
check((await title()) === 'Concert', 'setlist created and opened');

// Add both scores (Toccata first, then unity).
await page.locator('[data-testid=add-scores]').click();
await page.locator('ion-modal ion-checkbox', { hasText: 'Toccata' }).click();
await page.locator('ion-modal ion-checkbox', { hasText: 'unity' }).click();
await page.locator('ion-modal ion-footer ion-button').click();
await page.waitForFunction(() => document.querySelectorAll('ion-reorder-group ion-item-sliding').length === 2);
const names = await page.locator('ion-reorder-group ion-label h2').allInnerTexts();
check(names.join('|') === 'Toccata|unity transpos', `items in order: ${names.join(' | ')}`);
await page.screenshot({ path: `${shots}/setlist-detail.png` });

// Play from the first piece.
await page.getByRole('button', { name: 'Play' }).click();
await page.waitForSelector('.ion-page:not(.ion-page-hidden) .score-page svg', { timeout: 60000 });
check((await title()) === 'Toccata', 'first piece opened');
const bar = () => page.locator('.ion-page:not(.ion-page-hidden) [data-testid=setlist-bar]').innerText();
check((await bar()).includes('1/2') && (await bar()).includes('Next: unity transpos'), `setlist bar: ${await bar()}`);
await page.screenshot({ path: `${shots}/setlist-play.png` });

// Pedal on the last page: first press warns, second press goes to the next piece.
const indicator = page.locator('.ion-page:not(.ion-page-hidden) [data-testid=page-indicator]');
const pages = Number((await indicator.innerText()).split('/')[1]);
for (let i = 1; i < pages; i++) await page.keyboard.press('PageDown');
await page.waitForTimeout(300);
check((await indicator.innerText()).startsWith(`${pages} /`), `on last page ${await indicator.innerText()}`);
await page.keyboard.press('PageDown');
await page.waitForSelector('ion-toast', { timeout: 5000 });
check((await title()) === 'Toccata', 'first press on last page only warns');
await page.keyboard.press('PageDown');
await page.waitForFunction(() => [...document.querySelectorAll('.ion-page:not(.ion-page-hidden) ion-header ion-title')].some((e) => e.textContent?.includes('unity')), null, { timeout: 30000 });
await page.waitForSelector('.ion-page:not(.ion-page-hidden) .score-page svg', { timeout: 60000 });
check((await title()) === 'unity transpos', 'second press opened the next piece');
check((await bar()).includes('2/2') && (await bar()).includes('Last piece'), `setlist bar: ${await bar()}`);

// Previous piece button.
await page.locator('.ion-page:not(.ion-page-hidden) [data-testid=previous-piece]').last().click();
await page.waitForFunction(() => [...document.querySelectorAll('.ion-page:not(.ion-page-hidden) ion-header ion-title')].some((e) => e.textContent?.includes('Toccata')), null, { timeout: 30000 });
check(true, 'previous piece');
await page.waitForSelector('.ion-page:not(.ion-page-hidden) .score-page svg', { timeout: 60000 });

// --- Per-piece transposition: applied in play mode, stored in the setlist item, not in the score. ---
const visible = '.ion-page:not(.ion-page-hidden)';
const badge = () => page.locator(`${visible} [data-testid=transpose-button]`).last().innerText();
const applyTranspose = async (preset) => {
  await page.waitForSelector('ion-modal.show-modal');
  await page.locator('ion-modal.show-modal ion-chip', { hasText: preset }).click();
  await page.locator('ion-modal.show-modal ion-footer ion-button', { hasText: 'Apply' }).click();
  await page.waitForFunction(() => !document.querySelector('ion-modal.show-modal'));
};
await page.locator(`${visible} [data-testid=transpose-button]`).last().click();
await applyTranspose('B♭ instrument');
await page.waitForFunction(() => [...document.querySelectorAll('.ion-page:not(.ion-page-hidden) [data-testid=transpose-button]')].at(-1)?.textContent?.includes('+2'), null, { timeout: 10000 }).catch(() => undefined);
check((await badge()).includes('+2'), `setlist piece transposed: ${await badge()}`);

// Back to the setlist: the item shows its override badge; edit the 2nd piece's transposition there.
await page.locator(`${visible} ion-back-button`).last().click();
await waitTitle('Concert');
await page.waitForSelector(`${visible} [data-testid=override-badge]`, { timeout: 10000 }).catch(() => undefined);
const badges = await page.locator(`${visible} ion-reorder-group ion-item-sliding`).evaluateAll((els) => els.map((el) => el.querySelector('[data-testid=override-badge]')?.textContent ?? ''));
check(badges[0]?.includes('+2') && badges[1] === '', `override badges: ${JSON.stringify(badges)}`);
const setlistItem = (i) => page.locator(`${visible} ion-reorder-group ion-item-sliding`).nth(i);
await setlistItem(1).evaluate((el) => el.open('end'));
await page.waitForTimeout(400);
await setlistItem(1).locator('[data-testid=item-transpose]').click();
await applyTranspose('E♭ instrument');
await page.waitForFunction(() => [...document.querySelectorAll('.ion-page:not(.ion-page-hidden) ion-reorder-group ion-item-sliding')][1]?.querySelector('[data-testid=override-badge]')?.textContent?.includes('-3'), null, { timeout: 10000 }).catch(() => undefined);
const badges2 = await page.locator(`${visible} ion-reorder-group ion-item-sliding`).evaluateAll((els) => els.map((el) => el.querySelector('[data-testid=override-badge]')?.textContent ?? ''));
check(badges2[1]?.includes('-3'), `2nd piece transposition edited in the setlist: ${JSON.stringify(badges2)}`);
await page.screenshot({ path: `${shots}/setlist-overrides.png` });
await setlistItem(1).evaluate((el) => el.close());
await page.waitForTimeout(300);
await setlistItem(1).locator('ion-item').click();
await page.waitForFunction(() => [...document.querySelectorAll('.ion-page:not(.ion-page-hidden) ion-header ion-title')].some((e) => e.textContent?.includes('unity')), null, { timeout: 30000 });
await page.waitForSelector(`${visible} .score-page svg`, { timeout: 60000 });
check((await badge()).includes('-3'), `override applied when playing the 2nd piece: ${await badge()}`);

// The score itself is not transposed outside the setlist.
await page.goto('http://127.0.0.1:5192/library');
await page.waitForSelector('ion-item-sliding', { timeout: 30000 });
await page.locator('ion-item-sliding ion-item', { hasText: 'Toccata' }).first().click();
await page.waitForSelector(`${visible} .score-page svg`, { timeout: 60000 });
check(!(await badge()).includes('+2'), `score view state untouched: ${await badge()}`);

// --- Preloading of the next piece: open "unity" (2nd piece) right away (no preload yet) vs after the preload. ---
const timeNext = async (waitMs) => {
  await page.locator(`${visible} [data-testid=previous-piece]`).last().click();
  await page.waitForFunction(() => [...document.querySelectorAll('.ion-page:not(.ion-page-hidden) ion-header ion-title')].some((e) => e.textContent?.includes('Toccata')), null, { timeout: 30000 });
  await page.waitForSelector(`${visible} .score-page svg`, { timeout: 60000 });
  await page.waitForTimeout(waitMs);
  const t0 = Date.now();
  await page.locator(`${visible} [data-testid=next-piece]`).last().click();
  await page.waitForFunction(
    () => [...document.querySelectorAll('.ion-page:not(.ion-page-hidden)')].some((p) => p.querySelector('ion-title')?.textContent?.includes('unity') && p.querySelector('.score-page svg')),
    null,
    { timeout: 60000 },
  );
  return Date.now() - t0;
};
// Back into the setlist, on the 2nd piece.
await page.goBack();
await page.goBack();
await page.waitForFunction(() => [...document.querySelectorAll('.ion-page:not(.ion-page-hidden) ion-header ion-title')].some((e) => e.textContent?.includes('unity')), null, { timeout: 30000 });
await page.waitForSelector(`${visible} .score-page svg`, { timeout: 60000 });
const cold = [];
const warm = [];
for (let i = 0; i < 3; i++) {
  cold.push(await timeNext(0));
  warm.push(await timeNext(5000));
}
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`next piece opening: without preload ${cold.join('/')} ms (median ${median(cold)}), preloaded ${warm.join('/')} ms (median ${median(warm)})`);
check(median(warm) < median(cold), 'preloaded next piece opens faster');
check(errors.length === 0, `no JS errors ${JSON.stringify(errors)}`);
await browser.close();
await server.close();
