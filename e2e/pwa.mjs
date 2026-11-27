// PWA E2E (ADR-027): builds the web app (`vite build --mode pwa`), serves dist-pwa/ under /mscz_viewer/ like GitHub
// Pages (unknown paths → 404.html), then checks: manifest and iOS tags, deep link through 404.html, service worker
// registration and full offline download (Settings → Storage), then the server is STOPPED and the browser set
// offline: reload, deep link reload, import of a score, rendering, sound (synth + SoundFont from the cache, level
// measured through the window.__pupitreE2E hook); back online, a new deployment shows "New version available —
// Reload" and reloading switches to it. Runs in Chromium (Pixel 7) and, when Playwright's WebKit can be launched
// (`npx playwright install webkit`), in WebKit with the iPhone profile. Exit code 1 on failure.
// Usage: node e2e/pwa.mjs "$PWD" [screenshot-dir] [--no-build] [--chromium-only | --webkit-only]
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, stat, appendFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { chromium, webkit, devices } from 'playwright';

const root = process.argv[2];
const shots = process.argv[3]?.startsWith('--') ? '/tmp' : (process.argv[3] ?? '/tmp');
const flags = new Set(process.argv.slice(3).filter((a) => a.startsWith('--')));
const BASE = '/mscz_viewer/';
const PORT = 5210;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const APP = `${ORIGIN}${BASE}`;

if (!flags.has('--no-build')) execFileSync('npx', ['vite', 'build', '--mode', 'pwa', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
const site = await mkdtemp(join(tmpdir(), 'pupitre-pwa-'));
await cp(join(root, 'dist-pwa'), site, { recursive: true });

// --- a static server behaving like GitHub Pages ---
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.md': 'text/markdown', '.data': 'application/octet-stream', '.sf3': 'application/octet-stream',
};
let server;
async function startServer() {
  server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
    const send = async (file, status) => {
      res.writeHead(status, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'max-age=600' });
      res.end(await readFile(file));
    };
    if (!path.startsWith(BASE)) return void res.writeHead(404).end();
    const rel = normalize(path.slice(BASE.length) || 'index.html');
    if (rel.startsWith('..')) return void res.writeHead(400).end();
    const file = join(site, rel.endsWith('/') ? `${rel}index.html` : rel);
    const exists = await stat(file).then((s) => s.isFile(), () => false);
    await (exists ? send(file, 200) : send(join(site, '404.html'), 404));
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
}
const stopServer = () => new Promise((r) => (server.closeAllConnections(), server.close(r)));

let failures = 0;
async function run(name, browserType, device, launchArgs = {}) {
  console.log(`\n=== ${name} ===`);
  const browser = await browserType.launch(launchArgs);
  const context = await browser.newContext({ ...device, deviceScaleFactor: 1, locale: 'en-US', serviceWorkers: 'allow' });
  await context.addInitScript(() => (window.__pupitreE2E = true));
  const errors = [];
  const failed = [];
  let page;
  const openPage = async () => {
    page = await context.newPage();
    page.on('requestfailed', (r) => failed.push(r.url()));
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  };
  await openPage();
  const check = (cond, msg) => {
    if (!cond) {
      console.log('FAIL:', msg, '| errors:', errors);
      failures++;
    } else console.log('ok:', msg);
  };
  const visible = '.ion-page:not(.ion-page-hidden)';
  const peakOver = async (ms) => {
    await page.evaluate(() => window.__pupitreAudio.resetPeak());
    await page.waitForTimeout(ms);
    return page.evaluate(() => window.__pupitreAudio.peak());
  };

  try {
    await startServer();
    // 1. Deep link before any service worker: GitHub Pages answers 404.html (a copy of index.html), the router shows it.
    await page.goto(`${APP}settings`);
    await page.waitForSelector(`${visible} [data-testid=clear-render-cache]`, { timeout: 30000 });
    check(new URL(page.url()).pathname === `${BASE}settings`, `deep link through 404.html (${page.url()})`);

    // 2. Manifest and home screen tags.
    const head = await page.evaluate(() => ({
      manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'),
      apple: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'),
      capable: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.getAttribute('content'),
      viewport: document.querySelector('meta[name=viewport]')?.getAttribute('content'),
    }));
    check(head.manifest === `${BASE}manifest.webmanifest`, `manifest link (${head.manifest})`);
    check(head.apple === `${BASE}icons/apple-touch-icon.png` && head.capable === 'yes', 'iOS home screen tags');
    check(head.viewport?.includes('viewport-fit=cover'), 'viewport-fit=cover (safe areas)');
    const manifest = await page.evaluate(async (url) => (await fetch(url)).json(), head.manifest);
    check(manifest.name === 'Pupitre' && manifest.start_url === BASE && manifest.scope === BASE && manifest.display === 'standalone', 'manifest: name, start_url, scope, display');
    check(manifest.icons.some((i) => i.purpose === 'maskable') && manifest.icons.some((i) => i.sizes === '512x512'), 'manifest: 512 and maskable icons');
    for (const icon of manifest.icons) {
      const ok = await page.evaluate(async (src) => (await fetch(src)).ok, icon.src);
      check(ok, `icon served: ${icon.src}`);
    }

    // 3. Service worker: registered, controls the page, everything downloaded (Settings → Storage).
    const t0 = Date.now();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 120000 });
    check(true, 'service worker registered and controlling the page');
    await page.waitForFunction(() => document.querySelector('[data-testid=offline-status]')?.getAttribute('data-state') === 'ready', null, { timeout: 180000 });
    console.log(`offline download complete in ${Date.now() - t0} ms`);
    const note = await page.locator('[data-testid=offline-status] ion-note').first().innerText();
    check(/Ready/.test(note), `Settings → Storage: "${note}"`);
    const persisted = await page.locator('[data-testid=storage-persisted]').count();
    check(persisted === 1, 'persistent storage status shown');
    const sw = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const keys = await (await caches.open('pupitre-precache')).keys();
      return { scope: reg?.scope, cached: keys.length, sf3: keys.some((k) => k.url.includes('.sf3')), wasm: keys.some((k) => k.url.includes('webmscore.lib.wasm')) };
    });
    check(sw.scope === APP, `service worker scope ${sw.scope}`);
    check(sw.sf3 && sw.wasm, `SoundFont and webmscore precached (${sw.cached} files)`);
    await page.locator(`${visible} [data-testid=offline-status]`).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/pwa-${name}-storage.png` });

    // 4. OFFLINE: the server is stopped and the browser offline.
    await stopServer();
    await context.setOffline(true);
    failed.length = 0;
    const first = page;
    await openPage(); // the app opened again (from the home screen)
    await first.close();
    await page.goto(`${APP}library`);
    await page.waitForSelector(`${visible} ion-fab-button`, { timeout: 30000 });
    check(true, 'offline: the app starts');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator(`${visible} ion-fab-button`).click()]);
    await chooser.setFiles(`${root}/test-scores/onlyfuhnbrass_-_medley_Russ.mscz`);
    await page.waitForSelector('ion-item-sliding', { timeout: 120000 });
    check(true, 'offline: score imported (webmscore from the cache)');
    await page.waitForTimeout(500);
    await page.locator('ion-item-sliding ion-item').first().click();
    await page.waitForSelector(`${visible} .score-page svg`, { timeout: 90000 });
    check(true, 'offline: score rendered (Verovio worker from the cache)');
    const viewerUrl = page.url();

    // Sound: synth worklet + SoundFont from the cache.
    const soundButton = page.locator(`${visible} [data-testid=sound-button]`);
    await soundButton.click();
    await page.waitForSelector('[data-testid=mixer-modal] [data-testid=sound-toggle]', { state: 'visible' });
    await page.waitForTimeout(400);
    await page.locator('[data-testid=sound-toggle]').click();
    // No Playwright call while the synth loads: in headless WebKit, evaluating in the page while the AudioWorklet
    // module loads stalls the load (not seen in Chromium nor without the test driver).
    await page.waitForTimeout(3000);
    for (let i = 0; i < 60 && (await soundButton.getAttribute('data-status')) === 'loading'; i++) await page.waitForTimeout(1000);
    await page.waitForTimeout(300);
    const status = await soundButton.getAttribute('data-status');
    check(status === 'ready', `offline: sound ready (status ${status})`);
    await page.locator('[data-testid=mixer-modal] ion-button', { hasText: 'Close' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Play/ }).click();
    if (status === 'ready') {
      const level = await peakOver(4000);
      check(level > 0.01, `offline: the synth produces sound (peak ${level.toFixed(3)})`);
    }
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.screenshot({ path: `${shots}/pwa-${name}-offline-viewer.png` });

    // Deep link reloads offline.
    await page.reload();
    await page.waitForSelector(`${visible} .score-page svg`, { timeout: 60000 });
    check(page.url() === viewerUrl, 'offline: reload on a viewer URL');
    await page.goto(`${APP}settings`);
    await page.waitForSelector(`${visible} [data-testid=clear-render-cache]`, { timeout: 30000 });
    check(true, 'offline: deep link to /settings');
    const missed = failed.filter((u) => u.startsWith(ORIGIN));
    check(missed.length === 0, `offline: every request answered from the cache (${missed.join(', ')})`);

    // 5. Back online, a new version is deployed: "New version available — Reload".
    await context.setOffline(false);
    if (!server.listening) await startServer();
    await appendFile(join(site, 'sw.js'), '\n// new deployment\n');
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
    await page.waitForSelector('[data-testid=update-toast]', { state: 'visible', timeout: 60000 });
    const toast = await page.locator('[data-testid=update-toast]').evaluate((el) => el.shadowRoot?.textContent ?? el.textContent);
    check(/New version available/.test(toast), 'update toast shown');
    await page.screenshot({ path: `${shots}/pwa-${name}-update.png` });
    await Promise.all([
      page.waitForEvent('load', { timeout: 30000 }),
      page.locator('[data-testid=update-toast]').evaluate((el) => {
        const button = el.shadowRoot?.querySelector('.toast-button');
        button?.click();
      }),
    ]);
    await page.waitForSelector(`${visible} [data-testid=clear-render-cache]`, { timeout: 30000 });
    const reg = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return { waiting: !!r?.waiting, active: r?.active?.state, controlled: !!navigator.serviceWorker.controller };
    });
    check(!reg.waiting && reg.controlled, `reloaded on the new version (${JSON.stringify(reg)})`);
    check(!(await page.locator('[data-testid=update-toast]').isVisible()), 'no update toast after the reload');
    check(errors.filter((e) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(e)).length === 0, `no JS error (${errors.join(' | ')})`);
  } catch (e) {
    console.log('FAIL:', name, e.message.split('\n')[0], '| errors:', errors);
    await page.screenshot({ path: `${shots}/pwa-${name}-failure.png` }).catch(() => undefined);
    failures++;
  } finally {
    await browser.close();
    if (server.listening) await stopServer();
    await rm(site, { recursive: true, force: true }).catch(() => undefined);
    await cp(join(root, 'dist-pwa'), site, { recursive: true });
  }
}

if (!flags.has('--webkit-only')) await run('chromium', chromium, devices['Pixel 7'], { args: ['--autoplay-policy=no-user-gesture-required'] });
if (!flags.has('--chromium-only')) {
  const available = await webkit.launch().then((b) => (b.close(), true), (e) => (console.log(`\nWebKit not available, skipped (${e.message.split('\n')[0]})`), false));
  if (available) await run('webkit-iphone', webkit, devices['iPhone 14']);
}
await rm(site, { recursive: true, force: true });
console.log(failures ? `\n${failures} failure(s)` : '\nall PWA checks passed');
process.exitCode = failures ? 1 : 0;
