// French translation E2E (headless Chromium, Pixel 7, device in French): language detection and setting, note
// naming, key texts of every screen, no label overflowing the screen width. Exit code 1 on failure.
// Usage: node e2e/i18n-fr.mjs "$PWD" [screenshot-dir]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';
const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const base = 'http://127.0.0.1:5199';
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port: 5199, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1, locale: 'fr-FR' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed = true;
};
const NBSP = ' ';
const visible = '.ion-page:not(.ion-page-hidden)';
// textContent, not innerText: Ionic upper-cases buttons and tabs with CSS.
const text = (sel) => page.locator(sel).allTextContents().then((t) => t.join(' | '));
const noModal = () => page.waitForFunction(() => !document.querySelector('ion-modal.show-modal'), null, { timeout: 5000 }).catch(() => undefined);
const settle = () => page.waitForTimeout(500);

/**
 * Elements of the visible page / open modal / popover whose box leaves the screen, or whose text is clipped
 * (scrollWidth > clientWidth, ellipsis included), Ionic control labels too. Score drawings and titles are ignored.
 */
const overflows = () =>
  page.evaluate(() => {
    // An open overlay covers the page: only check the overlay.
    const overlays = [...document.querySelectorAll('ion-modal.show-modal, ion-popover, ion-alert')];
    const scopes = overlays.length
      ? overlays
      : [...document.querySelectorAll('.ion-page:not(.ion-page-hidden) ion-header, .ion-page:not(.ion-page-hidden) ion-footer, .ion-page:not(.ion-page-hidden) ion-content > *:not(.score-stage)')];
    const out = [];
    const width = window.innerWidth;
    const canvas = document.createElement('canvas').getContext('2d');
    // Text clipped by its box (with or without an ellipsis), or a box leaving the screen.
    const inspect = (el, name) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const style = getComputedStyle(el);
      const clipped = el.scrollWidth > el.clientWidth + 1 && style.overflowX !== 'visible';
      if (r.right > width + 1 || r.left < -1 || clipped) out.push(`${name} "${el.textContent.trim().slice(0, 40)}" ${Math.round(r.left)}–${Math.round(r.right)}`);
    };
    for (const scope of scopes) {
      for (const el of scope.querySelectorAll('*')) {
        if (el.closest('svg, .score-stage, ion-title')) continue; // score drawing; titles (score names) may be cut by design
        if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) inspect(el, el.tagName.toLowerCase());
        // Labels and values drawn in the shadow DOM of Ionic controls.
        for (const inner of el.shadowRoot?.querySelectorAll('.label-text-wrapper, .label-text, .select-text, [part~="label"]') ?? []) {
          if (inner.textContent.trim()) inspect(inner, `${el.tagName.toLowerCase()}::label`);
        }
        // Placeholders longer than their field.
        if (el.tagName === 'INPUT' && el.placeholder && !el.value) {
          const style = getComputedStyle(el);
          canvas.font = `${style.fontSize} ${style.fontFamily}`;
          const room = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          if (room > 0 && canvas.measureText(el.placeholder).width > room + 1) out.push(`placeholder "${el.placeholder}" (${Math.round(canvas.measureText(el.placeholder).width)} > ${Math.round(room)} px)`);
        }
      }
    }
    return [...new Set(out)];
  });
const checkLayout = async (label) => {
  const bad = await overflows();
  check(`${label}: no overflowing label`, bad.length === 0, bad.join('; '));
};

// --- Library: French from the device language ---
await page.goto(`${base}/library`);
await page.waitForSelector('ion-segment-button');
check('html lang = fr (device language)', (await page.evaluate(() => document.documentElement.lang)) === 'fr');
check('library title', (await text(`${visible} ion-header ion-title`)).includes('Bibliothèque'));
check('tabs', (await text('ion-segment-button')).toLowerCase().includes('partitions'), await text('ion-segment-button'));
check('empty library', (await text(`${visible} ion-content`)).includes('Aucune partition'));
await page.screenshot({ path: `${shots}/fr-library-empty.png` });

const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('ion-fab-button').click()]);
await chooser.setFiles([`${root}/test-scores/unity_transpos_.mscz`, `${root}/test-scores/Toccata_v2.mscz`]);
await page.waitForFunction(() => document.querySelectorAll('ion-item-sliding').length >= 2, null, { timeout: 120000 });
await page.waitForTimeout(1500);
check('score card in French', /\d instruments?/.test(await text('ion-item-sliding')), await text('ion-item-sliding'));
await page.screenshot({ path: `${shots}/fr-library.png` });
await checkLayout('library');

// Score info modal (dates formatted in French).
await page.locator('ion-item-sliding').first().evaluate((el) => el.open('end'));
await page.waitForTimeout(400);
const infoButton = page.locator('ion-item-option', { hasText: 'Infos' });
if (await infoButton.count()) {
  await infoButton.first().click();
  await page.waitForSelector('ion-modal.show-modal');
  await settle();
  const info = await text('ion-modal.show-modal');
  check('info modal', ['Compositeur', 'Créée avec', 'Mesures', 'Durée', 'Tempo initial', 'Importée le'].every((w) => info.includes(w)), info.slice(0, 120));
  check('dates in French', /\d{1,2} (janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)/.test(info), info.match(/Importée le[^|]*/)?.[0] ?? '');
  await page.screenshot({ path: `${shots}/fr-info.png` });
  await checkLayout('info modal');
  await page.locator('ion-modal.show-modal ion-header ion-button').last().click();
  await noModal();
} else check('info option in the sliding item', false, await text('ion-item-options'));

// --- Setlists ---
for (let i = 0; i < 10 && !(await page.locator('[data-testid=new-setlist]').count()); i++) {
  await page.locator('ion-segment-button', { hasText: 'Setlists' }).click();
  await page.waitForTimeout(500);
}
await page.screenshot({ path: `${shots}/fr-setlists-empty.png` });
check('setlists tab', (await text(visible)).includes('Aucune setlist'), (await text(visible)).slice(0, 80));
await page.locator('[data-testid=new-setlist]').click();
await page.waitForSelector('ion-alert');
check('new setlist alert', (await text('ion-alert')).includes('Nouvelle setlist') && (await text('ion-alert')).includes('Créer'), await text('ion-alert'));
await page.locator('ion-alert input').fill('Concert de printemps');
await page.locator('ion-alert button', { hasText: 'Créer' }).click();
await page.waitForURL(/\/setlist\//);
await page.waitForSelector('[data-testid=add-scores]');
await page.locator('[data-testid=add-scores]').click();
await page.waitForSelector('ion-modal.show-modal ion-checkbox');
await page.locator('ion-modal.show-modal ion-checkbox').first().click();
await page.locator('ion-modal.show-modal ion-checkbox').nth(1).click();
await page.waitForFunction(() => document.querySelector('ion-modal.show-modal ion-footer')?.textContent?.includes('2 partitions'), null, { timeout: 5000 }).catch(() => undefined);
check('add scores button', (await text('ion-modal.show-modal ion-footer')).includes('Ajouter 2 partitions'), await text('ion-modal.show-modal ion-footer'));
await page.screenshot({ path: `${shots}/fr-setlist-add.png` });
await checkLayout('add scores modal');
await page.locator('ion-modal.show-modal ion-footer ion-button').click();
await page.waitForFunction(() => document.querySelectorAll('ion-reorder-group ion-item-sliding').length === 2);
await settle();
check('setlist detail', (await text(visible)).includes('Jouer') && (await text(visible)).includes('2 morceaux'), (await text(visible)).slice(0, 80));
await page.screenshot({ path: `${shots}/fr-setlist-detail.png` });
await checkLayout('setlist detail');
await page.getByRole('button', { name: 'Jouer' }).click();
await page.waitForSelector(`${visible} .score-page svg`, { timeout: 60000 });
await page.waitForTimeout(800);
const bar = await text(`${visible} [data-testid=setlist-bar]`);
check('setlist bar', bar.includes('1/2') && bar.includes(`Suivant${NBSP}:`), bar);
await page.screenshot({ path: `${shots}/fr-setlist-play.png` });
await checkLayout('setlist play (toolbars)');

// --- Viewer ---
await page.goto(`${base}/library`);
await page.waitForSelector('ion-item-sliding');
await page.locator('ion-item-sliding ion-item', { hasText: 'unity' }).first().click();
await page.waitForSelector(`${visible} .score-page svg`, { timeout: 60000 });
await page.waitForTimeout(800);
check('tempo with a non-breaking space', (await page.locator(`${visible} [data-testid=tempo]`).innerText()) === `100${NBSP}%`, await page.locator(`${visible} [data-testid=tempo]`).innerText());
await page.screenshot({ path: `${shots}/fr-viewer.png` });
await checkLayout('viewer toolbars');

// Parts modal.
await page.locator(`${visible} [data-testid=parts-button]`).click();
await page.waitForSelector('ion-modal.show-modal ion-checkbox');
await settle();
const parts = await text('ion-modal.show-modal');
check('parts modal', parts.includes('Instruments à afficher') && parts.includes('Tous (conducteur)'), parts.slice(0, 80));
await page.screenshot({ path: `${shots}/fr-parts.png` });
await checkLayout('parts modal');
await page.locator('ion-modal.show-modal ion-header ion-button').last().click();
await noModal();

// Transpose modal: Latin note names, French mode words.
const openTranspose = async () => {
  await page.locator(`${visible} [data-testid=transpose-button]`).click();
  await page.waitForSelector('ion-modal.show-modal [data-testid=transpose-semitones]');
  await settle();
};
await openTranspose();
const chips = await text('ion-modal.show-modal ion-chip');
check('presets in Latin naming', chips.includes('Instrument en Si♭') && chips.includes('Instrument en Mi♭') && chips.includes('Do (aucune)'), chips);
await page.locator('ion-modal.show-modal ion-chip', { hasText: 'Instrument en Si♭' }).click();
const keyLine = await page.getByTestId('transpose-key').innerText().catch(() => '');
check('key line in French (Latin names, majeur/mineur)', /^(Do|Ré|Mi|Fa|Sol|La|Si)[♭♯]? (majeur|mineur) → (Do|Ré|Mi|Fa|Sol|La|Si)[♭♯]? (majeur|mineur)$/.test(keyLine), keyLine);
check('concert pitch', (await text('ion-modal.show-modal')).includes('Son réel (ut)'));
await page.screenshot({ path: `${shots}/fr-transpose.png` });
await checkLayout('transpose modal');
await page.locator('ion-modal.show-modal ion-header ion-button').last().click();
await noModal();

// Go-to modal.
await page.locator(`${visible} [data-testid=goto-button]`).click();
await page.waitForSelector('ion-modal.show-modal [data-testid=goto-input]');
await settle();
const goto = await text('ion-modal.show-modal');
check('go-to modal', goto.includes('Aller à') && goto.includes('Repères'), goto.slice(0, 80));
await page.screenshot({ path: `${shots}/fr-goto.png` });
await checkLayout('go-to modal');
await page.locator('ion-modal.show-modal ion-header ion-button').last().click();
await noModal();

// --- Settings ---
await page.goto(`${base}/settings`);
await page.waitForSelector('[data-testid=language]');
await settle();
const settingsText = await text(`${visible} ion-content`);
const sections = ['Affichage', 'Tourne-page', 'Défilement et métronome', 'Pédalier / clavier', 'Mon instrument', 'À propos'];
check('settings sections', sections.every((w) => settingsText.includes(w)), `missing: ${sections.filter((w) => !settingsText.includes(w)).join(', ')}`);
const selectLabels = await page.locator('ion-select').evaluateAll((els) => els.map((el) => el.label));
check('settings select labels', ['Langue', 'Noms des notes', 'Thème de l’appli', 'Décompte'].every((w) => selectLabels.includes(w)), selectLabels.join(' | '));
const rangeLabels = await page.locator('ion-range').evaluateAll((els) => els.map((el) => el.label));
check('settings percent typography', rangeLabels.includes(`Zoom par défaut${NBSP}: 100${NBSP}%`), rangeLabels.join(' | '));
await page.screenshot({ path: `${shots}/fr-settings.png` });
await checkLayout('settings');
for (let i = 1; i <= 4; i++) {
  await page.locator(`${visible} ion-content`).evaluate((c, y) => c.scrollToPoint(0, y), i * 700);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/fr-settings-${i}.png` });
}
await page.locator(`${visible} ion-content`).evaluate((c) => c.scrollToTop());

// Pedal capture modal.
await page.locator('[data-testid=pedal-set-next]').click();
await page.waitForSelector('ion-modal.show-modal [data-testid=pedal-capture]');
await settle();
check('pedal capture', (await text('ion-modal.show-modal')).includes('Appuyez sur votre pédale'), await text('ion-modal.show-modal'));
await page.screenshot({ path: `${shots}/fr-pedal-capture.png` });
await checkLayout('pedal capture modal');
await page.keyboard.press('Escape');
await noModal();

// Note naming: English, then German, in the French interface.
const choose = async (testId, label) => {
  await page.locator(`[data-testid=${testId}]`).click();
  await page.waitForSelector('ion-popover ion-item');
  await page.waitForTimeout(300);
  await page.locator('ion-popover ion-item', { hasText: label }).first().click();
  await page.waitForFunction(() => !document.querySelector('ion-popover'), null, { timeout: 5000 }).catch(() => undefined);
  await settle();
};
await choose('note-naming', 'C D E F G A B');
await page.locator('[data-testid=default-transpose]').click();
await page.waitForSelector('ion-popover ion-item');
await page.waitForTimeout(300);
check('English naming in French: "Instrument en B♭"', (await text('ion-popover')).includes('Instrument en B♭'), await text('ion-popover'));
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('ion-popover'), null, { timeout: 5000 }).catch(() => undefined);
await choose('note-naming', 'C D E F G A H');
await page.locator('[data-testid=default-transpose]').click();
await page.waitForSelector('ion-popover ion-item');
await page.waitForTimeout(300);
check('German naming: B♭ instrument is "B"', (await text('ion-popover')).includes('Instrument en B') && !(await text('ion-popover')).includes('Si♭'), await text('ion-popover'));
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('ion-popover'), null, { timeout: 5000 }).catch(() => undefined);
await choose('note-naming', 'Auto (selon la langue)');

// Language: English at runtime, then remembered after a reload, then back to French.
await choose('language', 'English');
check('switched to English at runtime', (await text(`${visible} ion-header ion-title`)).includes('Settings'), await text(`${visible} ion-header ion-title`));
check('html lang = en', (await page.evaluate(() => document.documentElement.lang)) === 'en');
await page.reload();
await page.waitForSelector('[data-testid=language]');
await page.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 5000 }).catch(() => undefined);
await settle();
check('English kept after a restart', (await text(`${visible} ion-content`)).includes('Display'));
await choose('language', 'Français');
check('back to French', (await text(`${visible} ion-header ion-title`)).includes('Paramètres'));
check('html lang = fr', (await page.evaluate(() => document.documentElement.lang)) === 'fr');

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
