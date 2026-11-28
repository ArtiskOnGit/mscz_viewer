// Performance E2E: opening time of big scores (first opening, then again with the render cache), cost of the display
// XML preparation and of Verovio (load, first page, relayout), workers left after leaving the viewer and a setlist
// (headless Chromium, Pixel 7). Prints a JSON summary; exits with code 1 if a check fails.
// Usage: node e2e/performance.mjs "$PWD" [screenshot-dir]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';

const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const scores = [
  { file: 'Toccata_v2.mscz', title: 'Toccata' },
  { file: 'onlyfuhnbrass_-_medley_Russ.mscz', title: 'medley' },
];
const port = 5188;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
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
const round = (x) => Math.round(x);

await page.goto(`http://127.0.0.1:${port}/library`);
let t0 = Date.now();
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-testid=fab-add]').click().then(() => page.locator('[data-testid=fab-import]').click())]);
await chooser.setFiles(scores.map((s) => `${root}/test-scores/${s.file}`));
await page.waitForFunction((n) => document.querySelectorAll('ion-item-sliding').length >= n, scores.length, { timeout: 180000 });
const importMs = Date.now() - t0;
await page.waitForTimeout(1500);
const workersAfterImport = page.workers().length;
check('no worker left after the import', workersAfterImport === 0, `${workersAfterImport} worker(s)`);

/** Opens a score from the library; time until its first page is drawn. */
async function open(title) {
  await page.waitForSelector(`${visible} ion-item-sliding`);
  const start = Date.now();
  await page.locator(`${visible} ion-item-sliding ion-item`, { hasText: title }).first().click();
  await page.waitForSelector(`${visible} .score-page svg g.measure`, { timeout: 120000 });
  return Date.now() - start;
}
async function back() {
  await page.locator(`${visible} ion-back-button`).last().click();
  await page.waitForFunction(() => location.pathname.startsWith('/library'));
  await page.waitForTimeout(800);
}

const opening = {};
for (const s of scores) {
  const first = await open(s.title);
  await page.screenshot({ path: `${shots}/perf-${s.title}.png` });
  await back();
  const workers = page.workers().length;
  check(`${s.title}: render worker terminated when leaving the viewer`, workers === 0, `${workers} worker(s)`);
  const again = await open(s.title);
  await back();
  opening[s.title] = { firstMs: first, againMs: again };
}

// Display XML preparation and Verovio, measured in the page (no render cache).
const bench = await page.evaluate(async (titles) => {
  const { libraryRepository } = await import('/src/core/services.ts');
  const { prepareDisplayXml } = await import('/src/core/musicxml/prepareDisplay.ts');
  const { RenderService, autoScale } = await import('/src/core/render/renderService.ts');
  const { defaultPartIds } = await import('/src/core/model/types.ts');
  const list = await libraryRepository.list();
  const out = {};
  const time = async (fn, runs = 5) => {
    const ts = [];
    let result;
    for (let i = 0; i < runs; i++) {
      const t = performance.now();
      result = await fn();
      ts.push(performance.now() - t);
    }
    return { ms: ts.sort((a, b) => a - b)[Math.floor(runs / 2)], result };
  };
  for (const title of titles) {
    const score = list.find((s) => s.title.includes(title));
    const xml = await libraryRepository.readMusicXml(score.id);
    const all = defaultPartIds(score.parts);
    const full = await time(() => prepareDisplayXml(xml, { selectedParts: all, multiRests: true, partNames: 'auto' }));
    const one = await time(() => prepareDisplayXml(xml, { selectedParts: [score.parts[1].musicXmlId], multiRests: true, partNames: 'auto' }));
    const viewport = { width: 412, height: 780, scale: autoScale(full.result.staves, 412), transpose: '', concertPitch: false };
    const rs = new RenderService(null); // no render cache: raw Verovio cost
    const init = await time(() => rs.warmUp(), 1); // worker + Verovio WASM
    const load = await time(() => rs.load(full.result.xml, viewport), 1);
    const page1 = await time(() => rs.page(1), 1);
    const relayout = await time(() => rs.relayout({ ...viewport, scale: Math.round(viewport.scale * 1.15) }), 1);
    rs.dispose();
    out[title] = {
      xmlKB: Math.round(xml.length / 1024),
      parts: score.parts.length,
      measures: score.measures,
      prepareFullMs: full.ms,
      preparePartMs: one.ms,
      verovioInitMs: init.ms,
      verovioLoadMs: load.ms,
      firstPageMs: page1.ms,
      relayoutMs: relayout.ms,
      pages: load.result.pageCount,
    };
  }
  return out;
}, scores.map((s) => s.title));
await page.waitForTimeout(300);
check('benchmark worker terminated', page.workers().length === 0, `${page.workers().length} worker(s)`);

// Setlist: the next piece is preloaded in a second worker; leaving the setlist terminates both.
for (let i = 0; i < 10 && !(await page.locator('[data-testid=new-setlist]').count()); i++) {
  await page.locator('ion-segment-button', { hasText: 'Setlists' }).click();
  await page.waitForTimeout(500);
}
await page.locator('[data-testid=new-setlist]').click();
await page.locator('ion-alert input').fill('Perf');
await page.locator('ion-alert button', { hasText: 'Create' }).click();
await page.waitForURL(/\/setlist\//);
await page.locator('[data-testid=add-scores]').click();
for (const s of scores) await page.locator('ion-modal ion-checkbox', { hasText: s.title }).click();
await page.locator('ion-modal ion-footer ion-button').click();
await page.waitForFunction(() => document.querySelectorAll('ion-reorder-group ion-item-sliding').length === 2);
await page.getByRole('button', { name: 'Play' }).click();
await page.waitForSelector(`${visible} .score-page svg`, { timeout: 60000 });
await page.waitForTimeout(4000); // preload of the next piece
const workersInSetlist = page.workers().length;
await page.locator(`${visible} ion-back-button`).last().click();
await page.waitForURL(/\/setlist\//);
await page.waitForTimeout(1000);
const workersAfterSetlist = page.workers().length;
check('setlist: at most 2 render workers while playing', workersInSetlist <= 2, `${workersInSetlist}`);
check('setlist: no worker left after leaving the setlist', workersAfterSetlist === 0, `${workersAfterSetlist}`);

// Settings → Storage: space used by the render cache, which can be cleared.
await page.goto(`http://127.0.0.1:${port}/settings`);
const cacheSize = page.locator('[data-testid=storage-render-cache]');
await page.waitForFunction(() => document.querySelector('[data-testid=storage-render-cache]')?.textContent?.trim(), null, { timeout: 10000 });
const before = await cacheSize.innerText();
check('render cache size shown', /MB/.test(before) && !/^0\b/.test(before), before);
check('scores size shown', /MB/.test(await page.locator('[data-testid=storage-scores]').innerText()), await page.locator('[data-testid=storage-scores]').innerText());
await page.locator('[data-testid=clear-render-cache]').click();
await page.waitForFunction((b) => document.querySelector('[data-testid=storage-render-cache]')?.textContent !== b, before, { timeout: 10000 }).catch(() => undefined);
check('render cache cleared', /^0\s?kB$/.test((await cacheSize.innerText()).trim()), await cacheSize.innerText());
await page.screenshot({ path: `${shots}/perf-storage.png` });

const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.collectGarbage');
await cdp.send('Performance.enable');
const { metrics } = await cdp.send('Performance.getMetrics');
const heapMB = (metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0) / 1048576;

const summary = { importMs, opening, bench, workersInSetlist, workersAfterSetlist, mainHeapMB: Math.round(heapMB * 10) / 10 };
console.log(JSON.stringify(summary, (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? round(v) : v), 2));
check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
