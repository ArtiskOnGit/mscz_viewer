// Score audio E2E (ADR-026): import a score, switch the sound on (synth + SoundFont loaded lazily), open the mixer,
// mute / solo parts and quick mixes, play a few seconds with the auto-scroll and check that the synth produces sound
// (dev hook window.__pupitreAudio: peak level of the synth output), that a fully muted mix is silent, that pausing
// silences, and that no JS error occurs (headless Chromium, Pixel 7). Exit code 1 on failure.
// Usage: node e2e/audio.mjs "$PWD" [screenshot-dir]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';

const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const PORT = 5203;
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
const audio = (expr) => page.evaluate(expr);
/** Highest output level over `ms` of playback. */
const peakOver = async (ms) => {
  await audio(() => window.__pupitreAudio.resetPeak());
  await page.waitForTimeout(ms);
  return audio(() => window.__pupitreAudio.peak());
};

// 1. "My instrument" = tenor saxophone, then import the medley (2 tenor saxes, 2 sousaphones, drums).
await page.goto(`http://127.0.0.1:${PORT}/settings`);
await page.waitForSelector('[data-testid=pick-tenorSax]');
await page.locator('[data-testid=pick-tenorSax]').click();
await page.waitForTimeout(300);
await page.goto(`http://127.0.0.1:${PORT}/library`);
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-testid=fab-add]').click().then(() => page.locator('[data-testid=fab-import]').click())]);
await chooser.setFiles(`${root}/test-scores/onlyfuhnbrass_-_medley_Russ.mscz`);
await page.waitForSelector('ion-item-sliding', { timeout: 120000 });
await page.waitForTimeout(500);
await page.locator('ion-item-sliding ion-item').first().click();
await page.waitForSelector('.score-page svg', { timeout: 60000 });
// Show all the parts (the profile preselected the saxophones).
check(await soundButton().count() === 1, 'sound button in the footer (score imported with its MIDI file)');
check(await soundButton().getAttribute('data-sound') === 'false', 'sound off by default');
check(await audio(() => !window.__pupitreAudio), 'nothing audio loaded before the sound is wanted');
const loadedBefore = await page.evaluate(() => performance.getEntriesByType('resource').some((r) => r.name.includes('.sf3')));
check(!loadedBefore, 'SoundFont not fetched before the sound is switched on');

// 2. Mixer: sound on → synth + SoundFont load.
await soundButton().click();
await page.waitForSelector('[data-testid=mixer-modal] [data-testid=sound-toggle]', { state: 'visible' });
await page.waitForTimeout(400);
const t0 = Date.now();
await page.locator('[data-testid=sound-toggle]').click();
await page.waitForFunction(() => document.querySelector('[data-testid=sound-button]')?.getAttribute('data-status') === 'ready', null, { timeout: 60000 });
console.log(`sound ready in ${Date.now() - t0} ms`);
check(await soundButton().getAttribute('data-sound') === 'true', 'sound on');
const parts = page.locator('[data-testid=mixer-modal] [data-testid=mixer-part]');
check(await parts.count() === 5, `one mixer row per part with sound (${await parts.count()})`);
await page.screenshot({ path: `${shots}/audio-mixer.png` });
// Accessibility of the sheet: axe-core (no serious violation) and 48 px targets.
await page.addScriptTag({ path: `${root}/node_modules/axe-core/axe.min.js` });
const violations = await page.evaluate(async () => {
  const r = await window.axe.run(document.querySelector('[data-testid=mixer-modal]'), {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    resultTypes: ['violations'],
  });
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
});
check(violations.length === 0, `mixer sheet: no serious axe violation (${violations.join('; ')})`);
const small = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid=mixer-modal] button.mixer-btn, [data-testid=mixer-modal] ion-toggle')]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && (r.width < 47.5 || r.height < 47.5)).length,
);
check(small === 0, `mixer sheet: touch targets ≥ 48 px (${small} too small)`);

// Quick mixes with "My instrument" (tenor saxes = parts 1 and 2).
await page.locator('[data-testid=mix-onlyMine]').click();
await page.waitForTimeout(300);
const silent = async () => parts.evaluateAll((els) => els.map((e) => e.getAttribute('data-silent')));
check(JSON.stringify(await silent()) === JSON.stringify(['false', 'false', 'true', 'true', 'true']), `"Only mine": the other parts are muted (${await silent()})`);
await page.locator('[data-testid=mix-withoutMine]').click();
await page.waitForTimeout(300);
check(JSON.stringify(await silent()) === JSON.stringify(['true', 'true', 'false', 'false', 'false']), `"Without mine": my parts are muted (${await silent()})`);
await page.locator('[data-testid=mix-all]').click();
await page.waitForTimeout(300);
check((await silent()).every((s) => s === 'false'), '"All": every part audible');
// Mute the first sousaphone, solo the first saxophone (it plays from the first bar).
await parts.nth(2).locator('[data-testid=mixer-mute]').click();
await parts.nth(0).locator('[data-testid=mixer-solo]').click();
await page.waitForTimeout(300);
check(JSON.stringify(await silent()) === JSON.stringify(['false', 'true', 'true', 'true', 'true']), `solo: only the first saxophone is heard (${await silent()})`);
const pressed = await parts.nth(0).locator('[data-testid=mixer-solo]').getAttribute('aria-pressed');
check(pressed === 'true', `solo button pressed (aria-pressed ${pressed})`);
await page.screenshot({ path: `${shots}/audio-mixer-solo.png` });
await page.locator('[data-testid=mixer-modal] ion-button', { hasText: 'Close' }).click();
await page.waitForTimeout(600);

// 3. Play: sound after the count-in, together with the auto-scroll.
await page.getByRole('button', { name: /Play/ }).click();
const level = await peakOver(4000);
const measures = await page.locator('.score-page g.measure.current').count();
console.log('peak level (saxophone solo)', level.toFixed(3), 'voices', await audio(() => window.__pupitreAudio.voices()));
check(level > 0.01, `the synth produces sound (peak ${level.toFixed(3)})`);
check(measures === 1, 'auto-scroll highlights the current measure while the sound plays');

// 4. Everything muted while playing: silence.
await soundButton().click();
await page.waitForSelector('[data-testid=mixer-modal] [data-testid=sound-toggle]', { state: 'visible' });
await page.waitForTimeout(400);
await parts.nth(0).locator('[data-testid=mixer-mute]').click(); // the soloed part muted: nothing left
await page.waitForTimeout(500);
const mutedLevel = await peakOver(1500);
check(mutedLevel < 0.002, `muted mix is silent (peak ${mutedLevel.toFixed(4)})`);
await page.locator('[data-testid=mix-all]').click(); // all parts again (mute and solo cleared)
await page.waitForTimeout(300);
check((await silent()).every((s) => s === 'false'), 'all parts audible again');
await parts.nth(2).locator('[data-testid=mixer-mute]').click(); // first sousaphone muted (checked after reopening)
const allLevel = await peakOver(2000);
check(allLevel > 0.01, `full mix plays (peak ${allLevel.toFixed(3)})`);
await page.locator('[data-testid=mixer-modal] ion-button', { hasText: 'Close' }).click();
await page.waitForTimeout(500);

// 5. Pause: silence right away (the notes already sent to the synth are cut).
await page.getByRole('button', { name: 'Pause' }).click();
await page.waitForTimeout(300);
const pausedLevel = await peakOver(1000);
check(pausedLevel < 0.002, `pause silences (peak ${pausedLevel.toFixed(4)})`);

// 6. Tempo 150 % + metronome together with the sound; then sound off: silent auto-scroll.
await page.locator(`${visible} [data-testid=tempo-button]`).click(); // tempo popover (phone in portrait)
await page.waitForTimeout(400);
for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Faster' }).click();
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check(await page.locator(`${visible} [data-testid=tempo]`).innerText() === '150 %', 'tempo 150 % from the tempo popover');
await page.getByRole('button', { name: 'Metronome off' }).click();
await page.getByRole('button', { name: /Play/ }).click();
check((await peakOver(2500)) > 0.01, 'sound at 150 % with the metronome');
// Long press on the sound button: sound off while playing.
const box = await soundButton().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(900);
await page.mouse.up();
await page.waitForTimeout(400);
check(await soundButton().getAttribute('data-sound') === 'false', 'long press switches the sound off');
check((await peakOver(1000)) < 0.002, 'sound off while playing: silent');
check(await page.locator('.score-page g.measure.current').count() === 1, 'auto-scroll goes on without sound');
// Long press again: the sound comes back in the middle of the score (channel state restored at that point).
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(900);
await page.mouse.up();
check(await soundButton().getAttribute('data-sound') === 'true', 'long press switches the sound on again');
check((await peakOver(2000)) > 0.01, 'sound resumes at the current position while playing');
// Go to bar 40 while playing: playback restarts there, with sound.
await page.locator(`${visible} [data-testid=goto-button]`).click();
await page.waitForSelector('ion-modal.show-modal [data-testid=goto-input]');
await page.locator('[data-testid=goto-input] input').fill('40');
await page.locator('[data-testid=goto-submit]').click();
await page.waitForTimeout(500);
check((await peakOver(2500)) > 0.01, 'sound after "go to bar 40" while playing');
const bar = await page.evaluate(() => document.querySelector('.score-page g.measure.current')?.id ?? '');
check(bar !== '', 'auto-scroll highlights a measure after the jump');
await page.getByRole('button', { name: 'Pause' }).click();
await soundButton().click(); // switch the sound off for step 7, from the sheet
await page.waitForSelector('[data-testid=mixer-modal] [data-testid=sound-toggle]', { state: 'visible' });
await page.waitForTimeout(400);
await page.locator('[data-testid=sound-toggle]').click();
await page.waitForTimeout(300);
await page.locator('[data-testid=mixer-modal] ion-button', { hasText: 'Close' }).click();
await page.waitForTimeout(500);

// 7. The mixer is remembered for the score.
await page.goBack();
await page.waitForTimeout(800);
await page.locator('ion-item-sliding ion-item').first().click();
await page.waitForSelector('.score-page svg', { timeout: 60000 });
await soundButton().click();
await page.waitForSelector('[data-testid=mixer-modal] [data-testid=mixer-part]', { state: 'visible' });
await page.waitForTimeout(400);
check(await parts.nth(2).getAttribute('data-silent') === 'true', 'mixer remembered per score (sousaphone still muted)');
check(await soundButton().getAttribute('data-sound') === 'false', 'sound off remembered per score');

check(errors.length === 0, `no JS error (${errors.join(' | ')})`);
await browser.close();
await server.close();
