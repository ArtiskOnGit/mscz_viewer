// Render race E2E (blank page "37 / 52" on iPhone, Motorcrypt): a big score (7 parts, ~50 pages on a phone),
// page 37 asked while the layout goes A → B → A (zoom out and back, rotation) before B is laid out; the page shown
// must be page 37 of A, drawn (never Verovio's empty viewBox="0 0 0 0"), and the same after a reload (render cache
// not poisoned). Then: playback from a late page, continuous mode, and a page that fails to draw shows a message
// with Retry (never a blank stage). Runs in Chromium (Pixel 7) and in WebKit (iPhone 14) when available.
// Needs test-scores/Motorcrypt.mscz (not in git): skipped without it. Exit code 1 on failure.
// Usage: node e2e/render-race.mjs "$PWD" [screenshot-dir] [--chromium-only | --webkit-only]
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium, webkit, devices } from 'playwright';

const root = process.argv[2];
const shots = process.argv[3]?.startsWith('--') ? '/tmp' : (process.argv[3] ?? '/tmp');
const flags = new Set(process.argv.slice(3).filter((a) => a.startsWith('--')));
const file = `${root}/test-scores/Motorcrypt.mscz`;
if (!existsSync(file)) {
  console.log(`SKIPPED: ${file} not found (test-scores is not in git)`);
  process.exit(0);
}
const PORT = 5197;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port: PORT, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();

let failures = 0;
async function run(name, browserType, device) {
  console.log(`\n=== ${name} ===`);
  const browser = await browserType.launch();
  const context = await browser.newContext({ ...device, deviceScaleFactor: 1, locale: 'en-US' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const check = (cond, msg) => {
    if (!cond) {
      console.log('FAIL:', msg);
      failures++;
    } else console.log('ok:', msg);
  };
  const shown = () =>
    page.evaluate(() => {
      const svg = document.querySelector('.score-page svg');
      return {
        indicator: document.querySelector('[data-testid=page-indicator]')?.textContent ?? '',
        viewBox: svg?.getAttribute('viewBox') ?? null,
        measures: document.querySelectorAll('.score-page g.measure').length,
        first: document.querySelector('.score-page g.measure')?.id ?? null,
        error: !!document.querySelector('[data-testid=render-error]'),
      };
    });
  const drawn = (s) => s.measures > 0 && s.viewBox !== '0 0 0 0';
  const goToPage = async (n) => {
    for (let i = 0; i < 80; i++) {
      const p = Number((await shown()).indicator.split('/')[0]);
      if (p === n) return;
      await page.keyboard.press(p < n ? 'ArrowRight' : 'ArrowLeft');
      await page.waitForTimeout(120);
    }
  };

  try {
    await page.goto(`http://127.0.0.1:${PORT}/library`);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-testid=fab-add]').click().then(() => page.locator('[data-testid=fab-import]').click())]);
    await chooser.setFiles(file);
    await page.waitForSelector('ion-item-sliding', { timeout: 120000 });
    await page.locator('ion-item-sliding ion-item').first().click();
    await page.waitForSelector('.score-page svg', { timeout: 120000 });
    const start = await shown();
    const count = Number(start.indicator.split('/')[1]);
    // Page 37 of 52 on the iPhone 14 profile (the bug report); the Pixel 7 profile has fewer pages.
    const target = Math.min(37, count - 1);
    check(drawn(start) && count >= 20, `score drawn (${start.indicator})`);
    await page.waitForTimeout(2000); // layout on disk

    // 1. Page 37 asked, then zoom out ×5 and back to automatic zoom before the zoomed-out layout is done (A → B → A).
    await goToPage(target);
    await page.locator('[data-testid=zoom-button]').click();
    await page.waitForSelector('[data-testid=zoom-auto]');
    await page.waitForTimeout(800);
    await page.evaluate(async () => {
      for (let i = 0; i < 5; i++) {
        document.querySelector('[data-testid=zoom-out]').click();
        await new Promise((r) => setTimeout(r, 0));
      }
      await new Promise((r) => setTimeout(r, 30));
      document.querySelector('[data-testid=zoom-auto]').click();
    });
    await page.waitForTimeout(4000);
    const aba = await shown();
    check(drawn(aba), `A → B → A zoom: page drawn (${aba.indicator}, viewBox ${aba.viewBox}, ${aba.measures} measures)`);
    check(aba.indicator.trim() === `${target} / ${count}`, `still page ${target} of ${count} (${aba.indicator})`);
    await page.screenshot({ path: `${shots}/render-race-${name}-aba.png` });
    await page.keyboard.press('Escape');

    // 2. Viewport A → B → A (rotation and back) faster than a relayout.
    const A = page.viewportSize();
    await page.setViewportSize({ width: A.height, height: A.width });
    await page.waitForTimeout(260); // past the resize debounce: the landscape layout starts
    await page.setViewportSize(A);
    await page.waitForTimeout(5000);
    const rot = await shown();
    check(drawn(rot), `rotation and back: page drawn (${rot.indicator}, ${rot.measures} measures)`);

    // 3. Reload: the page comes back the same (render cache not poisoned by another layout).
    await page.waitForTimeout(1500); // render cache index saved
    await page.reload();
    await page.waitForSelector('.score-page svg', { timeout: 120000 });
    await page.waitForTimeout(1000);
    const again = await shown();
    check(drawn(again) && again.indicator === rot.indicator && again.first === rot.first, `after reload: same page, same content (${again.indicator}, ${again.first} / ${rot.first})`);

    // 4. Playback from this late page: the score stays drawn while pages turn.
    await page.getByRole('button', { name: 'Play' }).click();
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(1000);
      const s = await shown();
      if (!drawn(s)) check(false, `playback: blank page at ${s.indicator}`);
    }
    await page.getByRole('button', { name: 'Pause' }).click();
    check(drawn(await shown()), 'playback: score drawn throughout');

    // 5. Continuous mode: pages drawn, no error.
    await page.locator('[data-testid=layout-toggle]').click();
    await page.waitForSelector('[data-page][data-rendered=true] svg', { timeout: 60000 });
    const cont = await page.evaluate(() => ({ rendered: document.querySelectorAll('[data-rendered=true] g.measure').length, error: !!document.querySelector('[data-testid=render-error]') }));
    check(cont.rendered > 0 && !cont.error, `continuous mode drawn (${cont.rendered} measures)`);
    await page.locator('[data-testid=layout-toggle]').click();
    await page.waitForSelector('[data-testid=score-stage][data-layout=pages] .score-page svg', { timeout: 60000 });
    await page.waitForTimeout(800); // view state saved

    // 6. A page that cannot be drawn: message + Retry, never a blank stage (worker patched to fail on page 3).
    await page.route('**/render.worker.ts*', async (route) => {
      const response = await route.fetch();
      const text = await response.text();
      const body = text.replace(/async renderPage\(page\) \{/, "$& if (page === 3) throw new Error('e2e: drawing failure');");
      if (body === text) console.log('WARNING: render worker not patched');
      await route.fulfill({ status: 200, contentType: 'text/javascript', body });
    });
    // A fresh render cache (Settings → Storage), so that page 3 is drawn by the patched worker.
    await page.goto(`http://127.0.0.1:${PORT}/settings`);
    await page.locator('.ion-page:not(.ion-page-hidden) [data-testid=clear-render-cache]').click();
    await page.waitForTimeout(500);
    await page.goto(`http://127.0.0.1:${PORT}/library`);
    await page.locator('ion-item-sliding ion-item').first().click();
    await page.waitForSelector('.score-page svg', { timeout: 120000 });
    await page.waitForSelector('[data-testid=score-stage][data-layout=pages]');
    await goToPage(3);
    await page.waitForSelector('[data-testid=render-error]', { timeout: 30000 });
    const failed = await shown();
    const retry = await page.locator('[data-testid=render-retry]').count();
    check(failed.error && retry === 1 && failed.measures === 0 && failed.indicator.startsWith('3 /'), `page 3 fails: message and Retry shown (${failed.indicator})`);
    await page.screenshot({ path: `${shots}/render-race-${name}-error.png` });
    await page.locator('[data-testid=render-retry]').click();
    await page.waitForTimeout(3000);
    // New worker: still failing (message kept) or drawn (WebKit may load the worker from its cache, unpatched).
    const retried = await shown();
    check(retried.error || drawn(retried), `Retry: message kept or page drawn, never blank (${retried.error ? 'message' : 'drawn'})`);
    await page.keyboard.press('ArrowRight');
    await page.waitForSelector('.score-page svg', { timeout: 30000 });
    const next = await shown();
    check(drawn(next) && !next.error, `next page drawn after the failure (${next.indicator})`);
    const unexpected = errors.filter((e) => !/e2e: drawing failure|could not be drawn|Failed to load resource/.test(e));
    check(unexpected.length === 0, `no unexpected error (${unexpected.join(' | ').slice(0, 500)})`);
  } catch (e) {
    console.log('FAIL:', name, e.message.split('\n')[0], '| errors:', errors.slice(0, 5));
    await page.screenshot({ path: `${shots}/render-race-${name}-failure.png` }).catch(() => undefined);
    failures++;
  } finally {
    await browser.close();
  }
}

if (!flags.has('--webkit-only')) await run('chromium', chromium, devices['Pixel 7']);
if (!flags.has('--chromium-only')) {
  const available = await webkit.launch().then((b) => (b.close(), true), (e) => (console.log(`\nWebKit not available, skipped (${e.message.split('\n')[0]})`), false));
  if (available) await run('webkit-iphone', webkit, devices['iPhone 14']);
}
await server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall render race checks passed');
process.exitCode = failures ? 1 : 0;
