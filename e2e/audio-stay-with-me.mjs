// Score audio E2E on Stay With Me (owner's bug report of 2026-11-28; headless Chromium, Pixel 7). Skipped when
// test-scores/Stay_With_Me.mscz is absent (personal test file, not in git).
// The score has 19 MuseScore channels (brass with "open"/"mute" channels, instrument changes to "Voix" in the intro)
// and a 1-beat pickup. Checked from the messages sent to the synth (dev hook window.__pupitreAudio.log: channel,
// AudioContext time, bytes) and the synth output level:
//   0. count-in at the tempo of the piece (it was 4 clicks squeezed in the 536 ms pickup);
//   1. "the voice keeps going": in an instrumental passage no note is played on a "voice" (Choir Aahs, program 52)
//      channel, the baritone sax plays with its own program (it had the sousaphone's voice program), no hanging note;
//   2. glissandi: the trombone's pitch-bend glissando comes back to the centre, one voice per key (the sousaphone's
//      chromatic glissando left a ringing note per step), and pause leaves every channel's pitch bend centred;
//   3. solo trumpet: no channel of the sousaphone is audible, and silence where only the sousaphone plays.
// Usage: node e2e/audio-stay-with-me.mjs "$PWD" [screenshot-dir]
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';

const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const FILE = `${root}/test-scores/Stay_With_Me.mscz`;
if (!existsSync(FILE)) {
  console.log(`skip: ${FILE} absent`);
  process.exit(0);
}
const PORT = 5211;
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
const parts = page.locator('[data-testid=mixer-modal] [data-testid=mixer-part]');
const hook = (fn, arg) => page.evaluate(fn, arg);
const openMixer = async () => {
  await soundButton().click();
  await page.waitForSelector('[data-testid=mixer-modal] [data-testid=sound-toggle]', { state: 'visible' });
  await page.waitForTimeout(400);
};
const closeMixer = async () => {
  await page.locator('[data-testid=mixer-modal] ion-button', { hasText: 'Close' }).click();
  await page.waitForTimeout(500);
};
const goto = async (bar) => {
  await page.locator(`${visible} [data-testid=goto-button]`).click();
  await page.waitForSelector('ion-modal.show-modal [data-testid=goto-input]');
  await page.locator('[data-testid=goto-input] input').fill(String(bar));
  await page.locator('[data-testid=goto-submit]').click();
  await page.waitForTimeout(600);
};
/** Plays `ms` (count-in included) and pauses; returns the messages sent meanwhile. */
const play = async (ms) => {
  await hook(() => window.__pupitreAudio.clearLog());
  await page.getByRole('button', { name: /Play/ }).click();
  await page.waitForTimeout(ms);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForTimeout(400);
  return hook(() => window.__pupitreAudio.log());
};
const type = (m) => m.message[0] & 0xf0;
const isOn = (m) => type(m) === 0x90 && m.message[2] > 0;
const isOff = (m) => type(m) === 0x80 || (type(m) === 0x90 && m.message[2] === 0);
/** Notes of a log, paired per channel and key (first in, first out, as spessasynth releases them). */
const notesOf = (log) => {
  const open = new Map();
  const notes = [];
  let maxVoices = 0;
  const sorted = [...log].sort((a, b) => a.time - b.time);
  for (const m of sorted) {
    const k = `${m.channel}:${m.message[1]}`;
    if (isOn(m)) {
      const list = open.get(k) ?? [];
      list.push(m);
      open.set(k, list);
      maxVoices = Math.max(maxVoices, list.length);
    } else if (isOff(m)) {
      const on = open.get(k)?.shift();
      if (on) notes.push({ channel: m.channel, key: m.message[1], on: on.time, off: m.time });
    } else if (type(m) === 0xb0 && (m.message[1] === 123 || m.message[1] === 120)) {
      for (const [key, list] of open) if (key.startsWith(`${m.channel}:`) && list.length) for (const on of list.splice(0)) notes.push({ channel: m.channel, key: on.message[1], on: on.time, off: m.time });
    }
  }
  const hanging = [...open.values()].reduce((n, l) => n + l.length, 0);
  return { notes, maxVoices, hanging };
};

// 1. Import, open, sound on.
await page.goto(`http://127.0.0.1:${PORT}/library`);
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-testid=fab-add]').click().then(() => page.locator('[data-testid=fab-import]').click())]);
await chooser.setFiles(FILE);
await page.waitForSelector('ion-item-sliding', { timeout: 180000 });
await page.waitForTimeout(500);
await page.locator('ion-item-sliding ion-item').first().click();
await page.waitForSelector('.score-page svg', { timeout: 90000 });
await openMixer();
await page.locator('[data-testid=sound-toggle]').click();
await page.waitForFunction(() => document.querySelector('[data-testid=sound-button]')?.getAttribute('data-status') === 'ready', null, { timeout: 60000 });
await closeMixer();

const tracks = await hook(() => window.__pupitreAudio.tracks());
const channelsOf = (name) => tracks.filter((t) => t.name?.startsWith(name)).flatMap((t) => t.channels);
const byChannel = new Map();
for (const t of tracks) for (const c of t.channels) byChannel.set(c, [...new Set([...(byChannel.get(c) ?? []), t.name])]);
const shared = [...byChannel].filter(([, names]) => names.length > 1);
check(shared.length === 0, `each part has its own MIDI channels (shared: ${JSON.stringify(shared)})`);
const trumpet = channelsOf('Tromp');
const sousaphone = channelsOf('Sousaphone');
const bari = channelsOf('Saxophone Baryton');
console.log('channels: trumpet', trumpet, 'sousaphone', sousaphone, 'baritone sax', bari);

// 0. Count-in from the start (1 bar by default): clicks one beat apart (536 ms at 112), then the pickup on beat 4.
{
  const log = await play(4500);
  const metronome = await hook(() => window.__pupitreAudio.metronomeChannel());
  const firstNote = Math.min(...log.filter((m) => isOn(m) && m.channel !== metronome).map((m) => m.time));
  const clicks = log.filter((m) => isOn(m) && m.channel === metronome && m.time < firstNote - 0.01).map((m) => m.time);
  const gaps = clicks.slice(1).map((t, i) => t - clicks[i]);
  console.log('count-in gaps (s)', gaps.map((g) => g.toFixed(3)).join(' '), '→ first note', (firstNote - clicks.at(-1)).toFixed(3));
  check(clicks.length === 7, `count-in: 1 bar + the 3 missing beats of the pickup bar (${clicks.length} clicks)`);
  check(gaps.length > 0 && gaps.every((g) => Math.abs(g - 0.5357) < 0.01), 'count-in clicks at the tempo of the piece (536 ms)');
  // The pickup (beat 4) starts one beat after the last click; its first note is an eighth later (eighth rest).
  check(Math.abs(firstNote - clicks.at(-1) - 0.5357 - 0.2679) < 0.01, 'the pickup comes on beat 4, one beat after the last count-in click');
}

// 1. Instrumental passage (bar 28, 57 s; the voices sing only in the intro, before 20 s).
{
  await goto(28);
  const log = await play(6500);
  const program = new Map();
  for (const m of log) if (type(m) === 0xc0) program.set(m.channel, m.message[1]);
  const voiceChannels = [...program].filter(([, p]) => p === 52).map(([c]) => c);
  const voiceNotes = log.filter((m) => isOn(m) && voiceChannels.includes(m.channel));
  check(voiceChannels.length > 0 && voiceNotes.length === 0, `no note on the "voice" channels ${voiceChannels} in an instrumental passage (${voiceNotes.length})`);
  check(bari.every((c) => program.get(c) === 67), `the baritone sax plays with its own program (${bari.map((c) => program.get(c))})`);
  const bariNotes = log.filter((m) => isOn(m) && bari.includes(m.channel)).length;
  check(bariNotes > 0, `the baritone sax plays in the passage (${bariNotes} notes)`);
  const { notes, maxVoices, hanging } = notesOf(log);
  const longest = Math.max(...notes.map((n) => n.off - n.on));
  check(maxVoices === 1 && hanging === 0 && longest < 6, `no hanging note (voices per key ${maxVoices}, left ${hanging}, longest ${longest.toFixed(2)} s)`);
  await page.waitForTimeout(300);
  check((await hook(() => window.__pupitreAudio.voices())) === 0, 'no voice left after pause');
}

// 2. Glissandi of bar 43-44: trombone (pitch bend, 103.1 s), sousaphone (chromatic, 106.3 s).
{
  await goto(43);
  const log = await play(7500);
  const bends = log.filter((m) => type(m) === 0xe0);
  const value = (m) => (m.message[2] << 7) | m.message[1];
  const trombone = channelsOf('Trombone');
  const glissando = bends.filter((m) => trombone.includes(m.channel) && value(m) !== 8192);
  check(glissando.length > 5, `trombone glissando played with pitch bends (${glissando.length})`);
  const lastGliss = glissando.at(-1)?.time ?? 0;
  const back = bends.find((m) => trombone.includes(m.channel) && m.time >= lastGliss && value(m) === 8192 && m.time < lastGliss + 0.1);
  check(!!back, 'the pitch bend comes back to the centre right after the glissando');
  const { notes, maxVoices, hanging } = notesOf(log);
  const longest = Math.max(...notes.map((n) => n.off - n.on));
  check(maxVoices === 1 && hanging === 0 && longest < 6, `glissandi: one voice per key, none left ringing (voices per key ${maxVoices}, left ${hanging}, longest ${longest.toFixed(2)} s)`);
  const sousaGliss = notes.filter((n) => sousaphone.includes(n.channel) && n.off - n.on < 0.05).length;
  check(sousaGliss >= 10, `sousaphone chromatic glissando: short single notes (${sousaGliss})`);
  // Pause: every channel's pitch bend centred and sustain released, after the last message.
  const used = [...new Set(log.map((m) => m.channel))];
  const lastBend = new Map();
  const sustainOff = new Set();
  for (const m of [...log].sort((a, b) => a.time - b.time)) {
    if (type(m) === 0xe0) lastBend.set(m.channel, value(m));
    if (type(m) === 0xb0 && m.message[1] === 64 && m.message[2] === 0) sustainOff.add(m.channel);
  }
  check(used.every((c) => lastBend.get(c) === 8192 && sustainOff.has(c)), 'pause: pitch bend centred and sustain released on every channel');
}

// 3. Solo trumpet: bar 16 (32.7 s), the trumpet rests 4 s while the sousaphone plays.
{
  await openMixer();
  const names = await parts.evaluateAll((els) => els.map((e) => e.textContent ?? ''));
  const row = names.findIndex((n) => n.includes('Tromp'));
  await parts.nth(row).locator('[data-testid=mixer-solo]').click();
  await page.waitForTimeout(300);
  await closeMixer();
  const gains = await hook(() => window.__pupitreAudio.gains());
  check(sousaphone.every((c) => gains[c] === 0) && trumpet.some((c) => gains[c] > 0), `solo trumpet: sousaphone channels silent (${sousaphone.map((c) => gains[c])}), trumpet's on (${trumpet.map((c) => gains[c])})`);
  await goto(16);
  await hook(() => window.__pupitreAudio.clearLog());
  await page.getByRole('button', { name: /Play/ }).click();
  await page.waitForTimeout(2600); // count-in (wood blocks, not muted by a solo)
  await hook(() => window.__pupitreAudio.resetPeak());
  await page.waitForTimeout(3000);
  const peak = await hook(() => window.__pupitreAudio.peak());
  await page.getByRole('button', { name: 'Pause' }).click();
  const log = await hook(() => window.__pupitreAudio.log());
  const sousaNotes = log.filter((m) => isOn(m) && sousaphone.includes(m.channel)).length;
  const audible = log.filter((m) => isOn(m) && (gains[m.channel] ?? 1) > 0 && !trumpet.includes(m.channel));
  const metronome = await hook(() => window.__pupitreAudio.metronomeChannel());
  check(sousaNotes > 0, `the sousaphone plays in this passage (${sousaNotes} notes sent)`);
  check(audible.every((m) => m.channel === metronome), `solo trumpet: only the trumpet's (and metronome's) notes are audible (${audible.filter((m) => m.channel !== metronome).length} others)`);
  check(peak < 0.002, `solo trumpet where only the sousaphone plays: silence (peak ${peak.toFixed(4)})`);
  await page.screenshot({ path: `${shots}/audio-stay-with-me.png` });
}

check(errors.length === 0, `no JS error (${errors.join(' | ')})`);
await browser.close();
await server.close();
