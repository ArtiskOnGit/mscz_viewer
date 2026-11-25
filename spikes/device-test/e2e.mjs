// Automated run of the test bench in headless Chromium (Pixel 7 emulation).
// Usage : node device-test/e2e.mjs <file.mscz> [...]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const OUT = new URL('./out/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });
const server = await createServer({
  configFile: new URL('../vite.config.mjs', import.meta.url).pathname,
  server: { port: 5199, host: '127.0.0.1' },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
await page.goto('http://127.0.0.1:5199/');

async function readStats() {
  await page.evaluate(() => document.getElementById('stats').classList.remove('open'));
  await page.click('#statsBtn');
  const s = JSON.parse(await page.textContent('#stats'));
  await page.click('#statsBtn');
  return s;
}
const statusIsReady = () => {
  const s = document.getElementById('status').textContent;
  return /^page \d+\//.test(s) || s.startsWith('❌');
};

for (const f of process.argv.slice(2)) {
  const name = basename(f).replace(/\.\w+$/, '');
  await page.setInputFiles('#file', resolve(f));
  await page.waitForFunction(statusIsReady, null, { timeout: 120000 });
  console.log(name, '→', await page.textContent('#status'));
  await page.screenshot({ path: `${OUT}${name}-p1.png` });
  // Pedal emulation: keyboard keys.
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.press('PageDown');
  // Keep only the 2nd part and transpose +2.
  const boxes = await page.$$('#parts input');
  if (boxes.length > 1) for (let i = 0; i < boxes.length; i++) if (i !== 1) await boxes[i].uncheck();
  await page.selectOption('#transpose', '+2');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}${name}-part2-plus2.png` });
  await page.click('#zoomIn');
  await page.click('#zoomIn');
  // 4 s of playback at 150 % with metronome.
  await page.fill('#tempo', '150');
  await page.dispatchEvent('#tempo', 'change');
  await page.check('#metro');
  await page.click('#play');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}${name}-playing.png` });
  const statusWhilePlaying = await page.textContent('#status');
  await page.click('#play');
  const s = await readStats();
  console.log(JSON.stringify({
    score: s.score, timings: s.timings,
    render: { pages: s.render.pages, moved: s.render.movedSystemDirections, lastRenderToSvgMs: s.render.lastRenderToSvgMs, heapMB: s.render.heapMB },
    metronome: s.metronome, wakeLock: s.wakeLock, keys: s.keys.map((k) => k.code), errors: s.errors, statusWhilePlaying,
  }, null, 1));
  await page.uncheck('#metro');
  await page.fill('#tempo', '100');
  await page.dispatchEvent('#tempo', 'change');
  await page.selectOption('#transpose', '');
}
await browser.close();
await server.close();
