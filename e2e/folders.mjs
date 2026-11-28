// Folders E2E (ADR-029): create, rename, import inside, move scores (menu and multi-selection), nested folders, move
// a folder (cycles refused), back navigation (header and history / Android back), search with paths, delete (contents
// move up), reload persistence (headless Chromium, Pixel 7). Exits with code 1 on a failed check.
// Usage: node e2e/folders.mjs "$PWD" [screenshot-dir] [en|fr]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';
import { readFileSync } from 'node:fs';

const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const lang = process.argv[4] ?? 'en';
const L = JSON.parse(readFileSync(`${root}/src/i18n/locales/${lang}/library.json`, 'utf8'));
const C = JSON.parse(readFileSync(`${root}/src/i18n/locales/${lang}/common.json`, 'utf8'));
const port = lang === 'fr' ? 5209 : 5208;
const base = `http://127.0.0.1:${port}`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1, locale: lang === 'fr' ? 'fr-FR' : 'en-US' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed = true;
};

const V = '.ion-page:not(.ion-page-hidden)';
const visible = () => page.locator(V).last();
const settle = () => page.waitForTimeout(600); // Ionic transitions and overlays
const title = () => visible().locator('ion-header ion-title').first().innerText();
const waitTitle = (text) =>
  page
    .waitForFunction(
      ([sel, t]) => [...document.querySelectorAll(`${sel} ion-header ion-title`)].at(-1)?.textContent?.trim() === t,
      [V, text],
      { timeout: 15000 },
    )
    .catch(() => undefined)
    .then(settle);
const folderItem = (name) => visible().locator(`[data-testid=folder-open][data-folder="${name}"]`);
const scoreTitles = () => visible().locator('.score-item ion-label h2').allInnerTexts();
const folderNames = () => visible().locator('[data-testid=folder-open]').evaluateAll((els) => els.map((e) => e.dataset.folder));
const folderCount = async (name) => (await folderItem(name).locator('p').first().innerText()).trim();
const items = (n) => L.folders[n === 1 ? 'items_one' : 'items_other'].replace('{{count}}', n);

/** Fill the name prompt (alert) and confirm. */
const answerPrompt = async (name, button) => {
  await page.locator('ion-alert input').fill(name);
  await page.locator('ion-alert button', { hasText: button }).click();
  await page.waitForSelector('ion-alert', { state: 'detached' });
  await settle();
};
const newFolder = async (name) => {
  await visible().locator('[data-testid=fab-add]').click();
  await visible().locator('[data-testid=fab-new-folder]').click();
  await answerPrompt(name, L.folders.create);
};
const actionSheet = async (text) => {
  await page.locator('ion-action-sheet button', { hasText: text }).click();
  await page.waitForSelector('ion-action-sheet', { state: 'detached' });
};
const pick = async (target) => {
  await page.waitForSelector('ion-modal[data-testid=folder-picker] ion-item', { state: 'visible' });
  await page.waitForTimeout(400);
  const item = target ? page.locator(`ion-modal [data-testid=picker-folder][data-folder="${target}"]`) : page.locator('ion-modal [data-testid=picker-root]');
  await item.click();
  await page.locator('ion-modal[data-testid=folder-picker]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
  await settle();
};
const importFiles = async (files) => {
  const before = (await scoreTitles()).length;
  await visible().locator('[data-testid=fab-add]').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), visible().locator('[data-testid=fab-import]').click()]);
  await chooser.setFiles(files.map((f) => `${root}/test-scores/${f}`));
  await page.waitForFunction(
    ([sel, n]) => [...document.querySelectorAll(sel)].at(-1)?.querySelectorAll('.score-item').length >= n,
    [V, before + files.length],
    { timeout: 180000 },
  );
  // The import progress overlay closes (dismissed Ionic overlays stay in the DOM with .overlay-hidden).
  await page.waitForFunction(() => [...document.querySelectorAll('ion-loading')].every((l) => l.classList.contains('overlay-hidden')), null, { timeout: 30000 }).catch(() => undefined);
  await settle();
};

await page.goto(`${base}/library`);
await page.waitForSelector('[data-testid=fab-add]');

// 1. The "+" button opens two buttons, both named and 48 px.
await visible().locator('[data-testid=fab-add]').click();
await settle();
const fabs = await visible().locator('ion-fab-list ion-fab-button').evaluateAll((els) =>
  els.map((e) => ({ label: e.getAttribute('aria-label') ?? e.shadowRoot?.querySelector('button')?.getAttribute('aria-label'), w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })),
);
check('"+" opens Import and New folder', fabs.map((f) => f.label).join('|') === `${L.import.button}|${L.folders.new}`, JSON.stringify(fabs));
check('"+" menu buttons are ≥ 48 px', fabs.every((f) => f.w >= 47.5 && f.h >= 47.5));
await page.screenshot({ path: `${shots}/folders-fab-${lang}.png` });
await visible().locator('[data-testid=fab-add]').click(); // closes the menu
await settle();

// 2. Create and rename a folder.
await newFolder('Concerts');
check('folder created at the root', (await folderItem('Concerts').count()) === 1);
await folderItem('Concerts').locator('xpath=ancestor::ion-item').locator('[data-testid=folder-more]').click();
await actionSheet(C.actions.rename);
await answerPrompt('Gigs', C.actions.rename);
check('folder renamed', (await folderItem('Gigs').count()) === 1 && (await folderItem('Concerts').count()) === 0);

// 3. Open it, import inside: the score lands in the folder.
await folderItem('Gigs').click();
await waitTitle('Gigs');
check('folder page opened', (await title()) === 'Gigs' && /\/library\/folder\//.test(page.url()), page.url());
check('breadcrumb', (await visible().locator('[data-testid=folder-breadcrumb]').innerText()) === `${L.folders.root} › Gigs`);
check('empty folder message', (await visible().locator('[data-testid=folder-empty]').count()) === 1);
await importFiles(['Toccata_v2.mscz']);
check('imported into the folder', (await scoreTitles()).join('|') === 'Toccata', (await scoreTitles()).join('|'));
const gigsUrl = page.url();
await visible().locator('[data-testid=folder-back]').click();
await waitTitle(L.title);
check('header back: up to the root', (await title()) === L.title && page.url().endsWith('/library'), page.url());
check('root has no score, folder counts 1 item', (await scoreTitles()).length === 0 && (await folderCount('Gigs')) === items(1), await folderCount('Gigs'));

// 4. Import at the root, move into the folder (⋮ → Move to…).
await importFiles(['Motorcrypt.mscz']);
check('imported at the root', (await scoreTitles()).join('|') === 'Motorcrypt');
await visible().locator('.score-item', { hasText: 'Motorcrypt' }).locator('[data-testid=score-more]').click();
await actionSheet(L.folders.move);
await pick('Gigs');
check('score moved into the folder', (await scoreTitles()).length === 0 && (await folderCount('Gigs')) === items(2), await folderCount('Gigs'));

// 5. Back to the root with the multi-selection (long press).
await folderItem('Gigs').click();
await waitTitle('Gigs');
const motor = visible().locator('.score-item', { hasText: 'Motorcrypt' }).locator('[data-testid=score-open]');
const box = await motor.boundingBox();
await page.mouse.move(box.x + 40, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(800);
await page.mouse.up();
await settle();
const count1 = L.select.count_one.replace('{{count}}', 1);
check('long press starts the selection', (await visible().locator('[data-testid=selection-count]').innerText()).trim() === count1);
check('a tap during the selection does not open the score', !(await (async () => { await visible().locator('.score-item', { hasText: 'Toccata' }).locator('[data-testid=score-open]').click(); await settle(); return /viewer/.test(page.url()); })()));
check('two selected', (await visible().locator('[data-testid=selection-count]').innerText()).trim() === L.select.count_other.replace('{{count}}', 2));
await visible().locator('.score-item', { hasText: 'Toccata' }).locator('[data-testid=score-open]').click(); // unselect
await page.screenshot({ path: `${shots}/folders-selection-${lang}.png` });
await visible().locator('[data-testid=selection-move]').click();
await pick(undefined);
check('selection moved to the root', (await scoreTitles()).join('|') === 'Toccata' && (await visible().locator('[data-testid=selection-count]').count()) === 0);

// 6. Nested folder, move Toccata into it.
await newFolder('2026');
check('sub-folders listed before scores', (await visible().locator('ion-list > *').first().getAttribute('class'))?.includes('folder-sliding'));
await visible().locator('.score-item', { hasText: 'Toccata' }).locator('[data-testid=score-more]').click();
await actionSheet(L.folders.move);
await pick('2026');
await folderItem('2026').click();
await waitTitle('2026');
check('nested folder: breadcrumb', (await visible().locator('[data-testid=folder-breadcrumb]').innerText()) === `${L.folders.root} › Gigs › 2026`);
check('nested folder holds the score', (await scoreTitles()).join('|') === 'Toccata');
await page.screenshot({ path: `${shots}/folders-nested-${lang}.png` });

// 7. History back (the Android back button goes back the same way), then header back.
await page.goBack();
await waitTitle('Gigs');
check('history back: up one level', (await title()) === 'Gigs', await title());
await visible().locator('[data-testid=folder-back]').click();
await waitTitle(L.title);
check('header back: root', (await title()) === L.title);

// 8. Moving a folder: itself and its sub-folders cannot be chosen.
await folderItem('Gigs').locator('xpath=ancestor::ion-item').locator('[data-testid=folder-more]').click();
await actionSheet(L.folders.move);
await page.waitForSelector('ion-modal[data-testid=folder-picker] ion-item', { state: 'visible' });
const disabled = await page.locator('ion-modal [data-testid=picker-folder]').evaluateAll((els) => els.filter((e) => e.hasAttribute('disabled') && e.getAttribute('disabled') !== 'false').map((e) => e.dataset.folder));
check('picker: the folder and its sub-folders are disabled', disabled.sort().join('|') === '2026|Gigs', disabled.join('|'));
await page.screenshot({ path: `${shots}/folders-picker-${lang}.png` });
await page.locator('ion-modal ion-header ion-button', { hasText: C.actions.cancel }).click();
await page.locator('ion-modal[data-testid=folder-picker]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
await settle();
// Move 2026 up to the root, then back into Gigs, via the picker's "New folder" for a third folder.
await folderItem('Gigs').click();
await waitTitle('Gigs');
await folderItem('2026').locator('xpath=ancestor::ion-item').locator('[data-testid=folder-more]').click();
await actionSheet(L.folders.move);
await page.waitForSelector('ion-modal [data-testid=picker-new-folder]', { state: 'visible' });
await page.waitForTimeout(400);
await page.locator('ion-modal [data-testid=picker-new-folder]').click();
await answerPrompt('Season', L.folders.create);
await page.locator('ion-modal[data-testid=folder-picker]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
const toast = await page.locator('ion-toast').last().evaluate((el) => el.message).catch(() => '');
check('move toast names the new folder', toast.includes('Season'), toast);
check('picker "New folder": created here, folder moved into it', (await folderNames()).join('|') === 'Season' && (await folderCount('Season')) === items(1), (await folderNames()).join('|'));

// 9. Search: the whole library, with the folder path.
await visible().locator('[data-testid=folder-back]').click();
await waitTitle(L.title);
await visible().locator('ion-searchbar input').fill('tocc');
await settle();
const paths = await visible().locator('[data-testid=score-path]').allInnerTexts();
check('search finds a score in a sub-sub-folder and shows its path', paths.join('|') === L.folders.inFolder.replace('{{path}}', `${L.folders.root} › Gigs › Season › 2026`), paths.join('|'));
await page.screenshot({ path: `${shots}/folders-search-${lang}.png` });
await visible().locator('ion-searchbar input').fill('');
await settle();

// 10. Delete a folder: its contents move up, no score is deleted.
await folderItem('Gigs').locator('xpath=ancestor::ion-item').locator('[data-testid=folder-more]').click();
await actionSheet(C.actions.delete);
await page.locator('ion-alert button', { hasText: C.actions.delete }).click();
await page.waitForSelector('ion-alert', { state: 'detached' });
await settle();
check('deleted folder: its sub-folder moved to the root', (await folderNames()).join('|') === 'Season', (await folderNames()).join('|'));
check('scores kept', (await scoreTitles()).join('|') === 'Motorcrypt');

// 11. Reload: folders and scores are persisted; a folder URL opens the folder, its back button goes up.
await page.reload();
await page.waitForSelector('[data-testid=folder-open]');
await settle();
check('after reload: folders and scores', (await folderNames()).join('|') === 'Season' && (await scoreTitles()).join('|') === 'Motorcrypt');
await folderItem('Season').click();
await waitTitle('Season');
await folderItem('2026').click();
await waitTitle('2026');
const deepUrl = page.url();
await page.goto(deepUrl);
await waitTitle('2026');
check('deep link to a folder', (await title()) === '2026' && (await scoreTitles()).join('|') === 'Toccata');
await visible().locator('[data-testid=folder-back]').click();
await waitTitle('Season');
check('back from a deep link: the parent folder', (await title()) === 'Season', await title());
await page.goto(gigsUrl); // deleted folder
await page.waitForTimeout(1500);
check('deleted folder URL: message', (await visible().locator('ion-content').innerText()).includes(L.folders.notFound));

check('no console errors', errors.length === 0, errors.join(' / '));
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
