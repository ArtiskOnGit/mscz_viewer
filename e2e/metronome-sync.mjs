// Metronome / score sound alignment E2E (ADR-026, sync fix of 2026-11-28; headless Chromium, Pixel 7).
// With the sound on, the metronome clicks are notes of the synth (dedicated drum channel), on the same clock as the
// score's notes. This test records the synth output (dev hook window.__pupitreAudio: AudioContext, synth output, and
// the note-ons sent with their AudioContext times) in an AudioWorklet, sample by sample with the context time, and
// measures for each isolated onset the delay between the time a note was scheduled and the time it is heard:
//   A. metronome alone (every part muted): count-in + beat clicks → click delay;
//   B. drums alone from bar 13 (metronome off; they start in bar 12, eighth notes): drum notes → note delay;
//   offset = note delay − click delay (median), target < 5 ms. Both delays must also stay small in absolute terms:
//   the beat dot and the highlight are drawn at the scheduled time (+ output latency), so a late synth would show.
// Before the fix (Web Audio oscillator clicks + synth clock behind the context clock): clicks +1.6 ms, notes ≈ +260 ms.
// Also checks the mixer's metronome row (volume, mute = metronome off, not silenced by a solo).
// Usage: node e2e/metronome-sync.mjs "$PWD" [screenshot-dir]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';

const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const PORT = 5207;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port: PORT, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1, locale: 'en-US' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => {
  if (!cond) {
    console.log('FAIL:', msg, '| errors:', errors);
    process.exitCode = 1;
  } else console.log('ok:', msg);
};
const visible = '.ion-page:not(.ion-page-hidden)';
const soundButton = () => page.locator(`${visible} [data-testid=sound-button]`);
const metronomeButton = () => page.locator(`${visible} [data-testid=metronome-button]`);
const parts = page.locator('[data-testid=mixer-modal] [data-testid=mixer-part]');
const metronomeRow = page.locator('[data-testid=mixer-modal] [data-testid=mixer-metronome]');
const openMixer = async () => {
  await soundButton().click();
  await page.waitForSelector('[data-testid=mixer-modal] [data-testid=sound-toggle]', { state: 'visible' });
  await page.waitForTimeout(400);
};
const closeMixer = async () => {
  await page.locator('[data-testid=mixer-modal] ion-button', { hasText: 'Close' }).click();
  await page.waitForTimeout(500);
};

// 1. Import the medley (2 tenor saxes, 2 sousaphones, drums), open it, sound on.
await page.goto(`http://127.0.0.1:${PORT}/library`);
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-testid=fab-add]').click().then(() => page.locator('[data-testid=fab-import]').click())]);
await chooser.setFiles(`${root}/test-scores/onlyfuhnbrass_-_medley_Russ.mscz`);
await page.waitForSelector('ion-item-sliding', { timeout: 120000 });
await page.waitForTimeout(500);
await page.locator('ion-item-sliding ion-item').first().click();
await page.waitForSelector('.score-page svg', { timeout: 60000 });
await openMixer();
await page.locator('[data-testid=sound-toggle]').click();
await page.waitForFunction(() => document.querySelector('[data-testid=sound-button]')?.getAttribute('data-status') === 'ready', null, { timeout: 60000 });
check(await metronomeRow.count() === 1, 'mixer: a metronome row');
check(await parts.count() === 5, `mixer: one row per part, the metronome apart (${await parts.count()})`);

// Recorder: the synth output, sample by sample, with the AudioContext time of each sample.
await page.evaluate(async () => {
  const a = window.__pupitreAudio;
  const code = `class Rec extends AudioWorkletProcessor {
    constructor() { super(); this.on = false; this.chunks = []; this.port.onmessage = (e) => {
      if (e.data === 'start') { this.on = true; this.chunks = []; }
      else { this.on = false; this.port.postMessage(this.chunks); this.chunks = []; } }; }
    process(inputs) { const ch = inputs[0] && inputs[0][0]; if (this.on && ch) this.chunks.push([currentTime, ch.slice()]); return true; }
  }
  registerProcessor('pupitre-rec', Rec);`;
  await a.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  const rec = new AudioWorkletNode(a.ctx, 'pupitre-rec');
  a.output.connect(rec);
  rec.connect(a.ctx.destination); // pulled by the graph (silent: it outputs nothing)
  window.__rec = {
    start: () => rec.port.postMessage('start'),
    stop: () =>
      new Promise((resolve) => {
        rec.port.onmessage = (e) => resolve(e.data);
        rec.port.postMessage('stop');
      }),
  };
});

/**
 * Records `ms` of playback and returns, for the note-ons sent on `channels` during it that are isolated (no other
 * note-on on these channels in the 150 ms before), the delay between the scheduled time and the onset heard (ms).
 */
const measure = (ms, channels) =>
  page.evaluate(
    async ({ ms, channels }) => {
      const a = window.__pupitreAudio;
      const sr = a.ctx.sampleRate;
      window.__rec.start();
      await new Promise((r) => setTimeout(r, ms));
      const chunks = await window.__rec.stop();
      const t0 = chunks[0][0];
      const len = chunks.reduce((n, [, c]) => n + c.length, 0);
      const buf = new Float32Array(len);
      for (const [t, c] of chunks) buf.set(c, Math.round((t - t0) * sr));
      const at = (t) => Math.round((t - t0) * sr);
      // The other channels are muted (silent): only the measured ones are heard.
      const all = a.sent().filter((s) => channels.includes(s.channel) && s.time > t0 + 0.2 && s.time < t0 + len / sr - 0.2);
      const delays = [];
      for (const s of all) {
        if (all.some((o) => o !== s && o.time < s.time - 1e-4 && o.time > s.time - 0.15)) continue; // not isolated
        let base = 0;
        for (let i = at(s.time - 0.04); i < at(s.time - 0.012); i++) base = Math.max(base, Math.abs(buf[i]));
        let peak = 0;
        for (let i = at(s.time - 0.012); i < at(s.time + 0.06); i++) peak = Math.max(peak, Math.abs(buf[i]));
        if (peak < 0.003 || peak < 3 * base) continue; // nothing clear to measure
        const threshold = base + 0.2 * (peak - base);
        for (let i = at(s.time - 0.012); i < at(s.time + 0.06); i++)
          if (Math.abs(buf[i]) > threshold) {
            delays.push(((t0 + i / sr - s.time) * 1000));
            break;
          }
      }
      return delays;
    },
    { ms, channels },
  );
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;
const fmt = (xs) => `median ${median(xs).toFixed(2)} ms, min ${Math.min(...xs).toFixed(2)}, max ${Math.max(...xs).toFixed(2)}, n ${xs.length}`;

// 2. A: metronome alone (every part muted), from the start, count-in included.
for (let i = 0; i < 5; i++) await parts.nth(i).locator('[data-testid=mixer-mute]').click();
await page.waitForTimeout(300);
check(await metronomeRow.getAttribute('data-silent') === 'true', 'mixer: metronome row muted while the metronome is off');
await metronomeRow.locator('[data-testid=mixer-mute]').click(); // un-mute = metronome on
await page.waitForTimeout(300);
check(await metronomeButton().getAttribute('data-metronome') === 'true', 'mixer: un-muting the metronome row switches the metronome on');
await page.screenshot({ path: `${shots}/metronome-mixer.png` });
await closeMixer();
const metronomeChannel = await page.evaluate(() => window.__pupitreAudio.metronomeChannel());
const scoreChannels = await page.evaluate(() => window.__pupitreAudio.channels());
check(!scoreChannels.includes(metronomeChannel) && metronomeChannel !== 9, `dedicated metronome channel ${metronomeChannel} (score: ${scoreChannels})`);
await page.getByRole('button', { name: /Play/ }).click();
const clickDelays = await measure(6000, [metronomeChannel]);
const sent = await page.evaluate(() => window.__pupitreAudio.sent());
await page.getByRole('button', { name: 'Pause' }).click();
const firstNote = sent.find((s) => s.channel !== metronomeChannel)?.time ?? Infinity;
const countIn = sent.filter((s) => s.channel === metronomeChannel && s.time < firstNote - 0.01);
check(countIn.length === 4, `count-in clicks played by the synth before the music (${countIn.length})`);
console.log('click delay (synth):', fmt(clickDelays));
check(clickDelays.length >= 8, `clicks measured (${clickDelays.length})`);
check(Math.abs(median(clickDelays)) < 5 && Math.max(...clickDelays.map(Math.abs)) < 10, `clicks heard at their scheduled time (${fmt(clickDelays)})`);

// 3. B: drums alone from bar 13 (the saxophones' legato notes have no clear onset), metronome off.
await openMixer();
await parts.nth(4).locator('[data-testid=mixer-mute]').click(); // drums back
await metronomeRow.locator('[data-testid=mixer-mute]').click(); // metronome off
await page.waitForTimeout(300);
check(await metronomeButton().getAttribute('data-metronome') === 'false', 'mixer: muting the metronome row switches the metronome off');
await closeMixer();
await page.locator(`${visible} [data-testid=goto-button]`).click();
await page.waitForSelector('ion-modal.show-modal [data-testid=goto-input]');
await page.locator('[data-testid=goto-input] input').fill('13');
await page.locator('[data-testid=goto-submit]').click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: /Play/ }).click();
await page.waitForTimeout(2000); // count-in
const noteDelays = await measure(6000, scoreChannels.filter((c) => c % 16 === 9));
console.log('note delay (synth, drums):', fmt(noteDelays));
check(noteDelays.length >= 8, `drum notes measured (${noteDelays.length})`);
check(Math.abs(median(noteDelays)) < 10, `notes heard at their scheduled time: the synth clock follows the context clock (${fmt(noteDelays)})`);
const offset = median(noteDelays) - median(clickDelays);
console.log(`click / note offset: ${offset.toFixed(2)} ms`);
check(Math.abs(offset) < 5, `metronome and notes aligned (offset ${offset.toFixed(2)} ms < 5 ms)`);

// 4. Solo-safe: soloing a part does not silence the metronome; metronome volume per score.
await openMixer();
await metronomeRow.locator('[data-testid=mixer-mute]').click(); // metronome on
await parts.nth(4).locator('[data-testid=mixer-solo]').click();
await page.waitForTimeout(300);
check(await metronomeRow.getAttribute('data-silent') === 'false', 'solo of a part: the metronome stays audible');
const clicksBefore = (await page.evaluate(() => window.__pupitreAudio.sent())).filter((s) => s.channel === metronomeChannel).length;
await page.waitForTimeout(1500);
const clicksAfter = (await page.evaluate(() => window.__pupitreAudio.sent())).filter((s) => s.channel === metronomeChannel).length;
check(clicksAfter > clicksBefore, `metronome switched on live while playing, solo on (${clicksAfter - clicksBefore} clicks)`);
await closeMixer();
await page.getByRole('button', { name: 'Pause' }).click();

check(errors.length === 0, `no JS error (${errors.join(' | ')})`);
await browser.close();
await server.close();
