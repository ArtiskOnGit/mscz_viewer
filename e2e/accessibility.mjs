// Accessibility E2E (phase 3): axe-core (WCAG 2.1 A/AA) on the main screens in light and dark app themes — fails on
// serious or critical violations —, touch targets of at least 48 px, names of icon-only buttons, screen-reader text
// of the library items (headless Chromium, Pixel 7). Exits with code 1 on a failed check.
// Usage: node e2e/accessibility.mjs "$PWD" [screenshot-dir] [en|fr]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';

const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const lang = process.argv[4] ?? 'en';
const L = {
  en: { setlists: 'Setlists', create: 'Create', composer: 'Ludwig The King', instruments: 'instruments', minutes: /\d+\s+min/ },
  fr: { setlists: 'Setlists', create: 'Créer', composer: 'Ludwig The King', instruments: 'instruments', minutes: /\d+\s+min/ },
}[lang];
const base = 'http://127.0.0.1:5202';
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port: 5202, host: '127.0.0.1' }, logLevel: 'error' });
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
const visiblePage = '.ion-page:not(.ion-page-hidden)';
const setTheme = (appTheme) =>
  page.evaluate((t) => {
    const cur = JSON.parse(localStorage.getItem('CapacitorStorage.settings') ?? '{}');
    localStorage.setItem('CapacitorStorage.settings', JSON.stringify({ ...cur, appTheme: t }));
  }, appTheme);

/** axe-core on the visible page; serious and critical violations fail. */
const audit = async (name) => {
  await page.waitForTimeout(600); // Ionic transitions
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: `${root}/node_modules/axe-core/axe.min.js` });
  const violations = await page.evaluate(async (sel) => {
    const pages = [...document.querySelectorAll(sel)];
    const r = await window.axe.run(pages.at(-1) ?? document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      resultTypes: ['violations'],
    });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 4) }));
  }, visiblePage);
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of violations) console.log(`     ${v.impact} ${v.id}: ${v.nodes.join(' | ')}`);
  check(`${name}: no serious axe violation`, serious.length === 0, serious.map((v) => v.id).join(', '));
};

/** Visible interactive elements of the visible page smaller than 48 × 48 px. */
const smallTargets = (scope = visiblePage) =>
  page.evaluate((sel) => {
    const root = [...document.querySelectorAll(sel)].at(-1);
    const targets = root.querySelectorAll('ion-button, ion-back-button, ion-fab-button, ion-segment-button, ion-item[button], ion-item[href], ion-toggle, ion-select, ion-chip, ion-reorder, button.score-open, button.setlist-open');
    return [...targets]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && (r.width < 47.5 || r.height < 47.5);
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ''}:${Math.round(r.width)}x${Math.round(r.height)}`;
      });
  }, scope);
const targets = async (name) => {
  const small = await smallTargets();
  check(`${name}: touch targets ≥ 48 px`, small.length === 0, small.join(', '));
};

/** Every button of the visible page has an accessible name (icon-only buttons included). */
const unnamedButtons = async (name) => {
  const snapshot = await page.locator(visiblePage).last().ariaSnapshot();
  const unnamed = snapshot.split('\n').filter((l) => /- button(\s*\[[^\]]*\])?:?\s*$/.test(l.trim()) || /- button\s*""/.test(l));
  check(`${name}: every button is named`, unnamed.length === 0, unnamed.join(' / '));
  return snapshot;
};

const screens = async (theme) => {
  await setTheme(theme);
  await page.goto(`${base}/library`);
  await page.waitForSelector('ion-item-sliding', { timeout: 60000 });
  await page.waitForTimeout(300);
  check(`${theme}: palette applied`, (await page.evaluate(() => document.documentElement.classList.contains('ion-palette-dark'))) === (theme === 'dark'));

  // Library
  const snap = await unnamedButtons(`${theme} library`);
  if (theme === 'light') {
    const item = snap.split('\n').find((l) => l.includes('Toccata'));
    check('library item announces title, composer, instruments and duration', !!item && item.includes(L.composer) && item.includes(L.instruments) && L.minutes.test(item), item);
    check('library item has a "more actions" button', /button "[^"]*Toccata[^"]*"/.test(snap.split('\n').filter((l) => !l.includes(L.composer)).join('\n')));
  }
  await targets(`${theme} library`);
  await audit(`${theme} library`);
  await page.screenshot({ path: `${shots}/a11y-${theme}-library.png` });

  // Setlists tab
  for (let i = 0; i < 10 && !(await page.locator('[data-testid=new-setlist]').count()); i++) {
    await page.locator('ion-segment-button', { hasText: L.setlists }).click();
    await page.waitForTimeout(400);
  }
  await unnamedButtons(`${theme} setlists`);
  await targets(`${theme} setlists`);
  await audit(`${theme} setlists`);

  // Setlist detail
  await page.locator(`${visiblePage} ion-item-sliding ion-item`).first().click();
  await page.waitForURL(/\/setlist\//);
  await page.waitForSelector(`${visiblePage} ion-reorder-group ion-item-sliding`);
  await unnamedButtons(`${theme} setlist detail`);
  await targets(`${theme} setlist detail`);
  await audit(`${theme} setlist detail`);
  await page.screenshot({ path: `${shots}/a11y-${theme}-setlist.png` });

  // Settings
  await page.goto(`${base}/settings`);
  await page.waitForSelector('ion-select');
  await unnamedButtons(`${theme} settings`);
  await targets(`${theme} settings`);
  await audit(`${theme} settings`);
  await page.screenshot({ path: `${shots}/a11y-${theme}-settings.png`, fullPage: true });

  // Viewer
  await page.goto(`${base}/library`);
  await page.waitForSelector('ion-item-sliding', { timeout: 60000 });
  await page.locator('ion-item-sliding ion-item').first().click();
  await page.waitForSelector('.score-page svg', { timeout: 60000 });
  await unnamedButtons(`${theme} viewer`);
  await targets(`${theme} viewer`);
  // 48 px targets must still fit the phone width: no overlap between the footer controls.
  const overlaps = await page.evaluate((sel) => {
    const footer = [...document.querySelectorAll(`${sel} ion-footer ion-toolbar`)].at(-1);
    const els = [...footer.querySelectorAll('ion-button, .tempo-value, .page-indicator')].map((el) => ({ el, r: el.getBoundingClientRect() }));
    const out = [];
    for (let i = 0; i < els.length; i++)
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i].r;
        const b = els[j].r;
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`${els[i].el.className.split(' ')[0]}/${els[j].el.className.split(' ')[0]}`);
      }
    const right = Math.max(...els.map((e) => e.r.right));
    return { out, fits: right <= window.innerWidth + 1 };
  }, visiblePage);
  check(`${theme} viewer: footer controls fit without overlapping`, overlaps.out.length === 0 && overlaps.fits, overlaps.out.join(', '));
  await audit(`${theme} viewer`);
  await page.screenshot({ path: `${shots}/a11y-${theme}-viewer.png` });
};

// One score in the library and a setlist containing it.
await page.goto(`${base}/library`);
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('ion-fab-button').click()]);
await chooser.setFiles(`${root}/test-scores/Toccata_v2.mscz`);
await page.waitForSelector('ion-item-sliding', { timeout: 60000 });
for (let i = 0; i < 10 && !(await page.locator('[data-testid=new-setlist]').count()); i++) {
  await page.locator('ion-segment-button', { hasText: L.setlists }).click();
  await page.waitForTimeout(500);
}
await page.locator('[data-testid=new-setlist]').click();
await page.locator('ion-alert input').fill('Concert');
await page.locator('ion-alert button', { hasText: L.create }).click();
await page.waitForURL(/\/setlist\//);
await page.locator('[data-testid=add-scores]').click();
await page.locator('ion-modal ion-checkbox', { hasText: 'Toccata' }).click();
await page.locator('ion-modal ion-footer ion-button').click();
await page.waitForFunction(() => document.querySelectorAll('ion-reorder-group ion-item-sliding').length === 1);

await screens('light');
await screens('dark');

check('no console errors', errors.length === 0, errors.join(' | '));
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
