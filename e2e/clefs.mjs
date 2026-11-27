// Clef choice E2E (headless Chromium, Pixel 7; WebKit iPhone with --webkit): trombone of Toccata switched to treble
// clef and back, kept after a reload, render cache never serves the other clef, brass-band "B♭ treble clef" preset.
// Usage: node e2e/clefs.mjs "$PWD" [screenshot-dir] [--webkit]
import { createServer } from 'vite';
import { chromium, devices, webkit } from 'playwright';

const root = process.argv[2];
const shots = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : '/tmp';
const useWebkit = process.argv.includes('--webkit');
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port: 5199, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await (useWebkit ? webkit : chromium).launch();
const device = useWebkit ? devices['iPhone 14'] : devices['Pixel 7'];
const page = await (await browser.newContext({ ...device, deviceScaleFactor: 1, locale: 'en-US' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed = true;
};

await page.goto('http://127.0.0.1:5199/library');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('ion-fab-button').click()]);
await chooser.setFiles(`${root}/test-scores/Toccata_v2.mscz`);
await page.waitForSelector('ion-item-sliding', { timeout: 60000 });
await page.locator('ion-item-sliding ion-item').first().click();
await page.waitForSelector('.score-page svg', { timeout: 60000 });

// Verovio draws a clef as <g class="clef"> with a <use> of the SMuFL glyph: E050 G clef, E052 G clef 8vb,
// E062 F clef, E05C C clef. Glyphs of the first clef of the page (one per staff).
const clefGlyphs = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.score-page g.clef use')).map((u) => (u.getAttribute('xlink:href') ?? u.getAttribute('href') ?? '').replace(/^#/, '').split('-')[0]),
  );
const firstClef = async () => (await clefGlyphs())[0];
const openParts = async () => {
  await page.getByTestId('parts-button').click();
  await page.waitForSelector('ion-modal.show-modal');
  await page.waitForTimeout(300);
};
const applyParts = async () => {
  await page.getByTestId('parts-apply').click();
  await page.waitForFunction(() => !document.querySelector('ion-modal.show-modal'));
  await page.waitForFunction(() => !!document.querySelector('.score-page g.clef'), undefined, { timeout: 60000 });
  await page.waitForTimeout(1500);
};
const chooseClef = async (partId, label) => {
  await page.getByTestId(`clef-${partId}`).click();
  await page.waitForSelector('ion-action-sheet', { state: 'visible' });
  await page.locator('ion-action-sheet button', { hasText: label }).first().click();
  await page.waitForFunction(() => !document.querySelector('ion-action-sheet'));
};

// Trombone only.
await openParts();
const parts = await page.evaluate(() =>
  Array.from(document.querySelectorAll('ion-modal [data-testid^=part-]')).map((el) => ({
    id: el.getAttribute('data-testid').slice(5),
    name: el.querySelector('ion-checkbox')?.textContent?.trim(),
    clef: el.querySelector('ion-select')?.getAttribute('data-clef') ?? null,
  })),
);
console.log('parts:', parts.map((p) => `${p.id} ${p.name} [${p.clef ?? '-'}]`).join(' | '));
const trombone = parts.find((p) => /trombone/i.test(p.name ?? ''));
check('trombone found with a clef menu', !!trombone && trombone.clef === 'original');
const drums = parts.filter((p) => /drum|percussion|batterie|snare|cymbal/i.test(p.name ?? ''));
check('no clef menu on percussion', drums.every((p) => p.clef === null), drums.map((p) => p.name).join(', ') || 'none in score');
// "All" → none (two clicks if the first one checked every part).
const allChecked = () => page.locator('ion-modal ion-checkbox').first().evaluate((el) => el.checked);
await page.locator('ion-modal ion-checkbox').first().click();
await page.waitForTimeout(300);
if (await allChecked()) {
  await page.locator('ion-modal ion-checkbox').first().click();
  await page.waitForTimeout(300);
}
await page.getByTestId(`part-${trombone.id}`).locator('ion-checkbox').click();
await page.screenshot({ path: `${shots}/clefs-modal.png` });
await applyParts();
const original = await firstClef();
check('trombone in bass clef (F clef glyph E062)', original === 'E062', String(original));

// → treble clef.
await openParts();
await chooseClef(trombone.id, 'Treble clef');
check('selector shows the choice', (await page.getByTestId(`clef-${trombone.id}`).getAttribute('data-clef')) === 'treble');
check('overridden indicator', (await page.getByTestId(`clef-${trombone.id}`).getAttribute('class')).includes('clef-overridden'));
await page.screenshot({ path: `${shots}/clefs-modal-treble.png` });
await applyParts();
check('treble clef drawn (E050)', (await firstClef()) === 'E050', String(await firstClef()));
await page.screenshot({ path: `${shots}/clefs-treble.png` });

// Reload: the choice is kept; the page comes from the render cache and has the treble clef.
await page.waitForTimeout(700); // debounced save
await page.reload();
await page.waitForSelector('.score-page svg', { timeout: 60000 });
await page.waitForTimeout(500);
check('after reload: still treble clef', (await firstClef()) === 'E050', String(await firstClef()));

// Treble 8vb.
await openParts();
check('modal remembers the choice', (await page.getByTestId(`clef-${trombone.id}`).getAttribute('data-clef')) === 'treble');
await chooseClef(trombone.id, 'Treble clef 8vb');
await applyParts();
const g8 = await firstClef();
check('treble 8vb clef drawn (E052)', g8 === 'E052', String(g8));

// Back to the original clef: bass again, never a stale cached treble page.
await openParts();
await chooseClef(trombone.id, 'Original');
check('indicator gone', !(await page.getByTestId(`clef-${trombone.id}`).getAttribute('class')).includes('clef-overridden'));
await applyParts();
check('back to bass clef (E062)', (await firstClef()) === 'E062', String(await firstClef()));
await page.waitForTimeout(700);
await page.reload();
await page.waitForSelector('.score-page svg', { timeout: 60000 });
await page.waitForTimeout(500);
check('after reload: bass clef (cache keyed by the clef)', (await firstClef()) === 'E062', String(await firstClef()));

// Brass-band preset: B♭ treble clef = treble clef + a major 9th up.
await page.getByTestId('transpose-button').click();
await page.waitForSelector('ion-modal.show-modal');
await page.waitForTimeout(300);
await page.getByTestId('preset-bb-treble').click();
check('preset: +2 semitones, +1 octave', (await page.getByTestId('transpose-semitones').innerText()) === '+2' && (await page.getByTestId('transpose-octave').innerText()) === '+1');
check('preset hint shown', await page.getByTestId('bb-treble-hint').isVisible());
await page.screenshot({ path: `${shots}/clefs-brass-preset.png` });
await page.locator('ion-modal ion-footer ion-button', { hasText: 'Apply' }).click();
await page.waitForFunction(() => !document.querySelector('ion-modal.show-modal'));
await page.waitForTimeout(2500);
check('brass preset: treble clef drawn', (await firstClef()) === 'E050', String(await firstClef()));
check('brass preset: badge +14', (await page.getByTestId('transpose-button').innerText()).includes('+14'), await page.getByTestId('transpose-button').innerText());
await page.screenshot({ path: `${shots}/clefs-brass.png` });
await openParts();
check('brass preset: trombone set to treble', (await page.getByTestId(`clef-${trombone.id}`).getAttribute('data-clef')) === 'treble');
await page.keyboard.press('Escape');

check('no page errors', errors.filter((e) => !/Outdated Optimize Dep/.test(e)).length === 0, errors.join(' | '));
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
