// Spike S7 : MIDI de webmscore (saveMidi(expandRepeats, exportRPNs)) contre la timeline (savePositions(false)).
// Usage (depuis la racine de l'application) : for f in test-scores/*.mscz; do node spikes/s7-midi/compare.mjs "$f"; done
// Affiche, par partition : pistes et canaux du MIDI, parties de webmscore, et l'écart maximal entre le début de chaque
// mesure de la timeline et la note MIDI la plus proche (seulement les mesures qui ont une note au premier temps).
Object.defineProperty(globalThis, 'navigator', { value: {}, writable: true, configurable: true });
const realFetch = globalThis.fetch;
globalThis.fetch = undefined;
const { default: WebMscore } = await import('webmscore');
const { parseMidi } = await import('../../src/core/audio/midiFile.ts');
const { readFile } = await import('node:fs/promises');
const { basename } = await import('node:path');
// Same input as the app: hidden parts made visible first (ADR-018).
const { unhideParts } = await import('../../src/core/import/unhideParts.ts');
const { DOMParser, XMLSerializer } = await import('@xmldom/xmldom');
await WebMscore.ready;
globalThis.fetch = realFetch;

// webmscore crashes when a second score is loaded in the same process: one file per run.
for (const f of process.argv.slice(2, 3)) {
  const format = f.endsWith('.mscx') ? 'mscx' : 'mscz';
  const { bytes: data, hiddenPartIndexes } = unhideParts(format, new Uint8Array(await readFile(f)), { DOMParser, XMLSerializer });
  if (hiddenPartIndexes.length) console.log(`  (hidden parts made visible: ${hiddenPartIndexes})`);
  const s = await WebMscore.load(format, data, [], true);
  const meta = await s.metadata();
  const pos = JSON.parse(await s.savePositions(false));
  const midi = await s.saveMidi(true, true);
  s.destroy();
  const m = parseMidi(midi);
  console.log(`== ${basename(f)}: format ${m.format}, ${m.tracks.length} tracks, ${meta.parts.length} parts, ${midi.length} bytes, MIDI ${m.durationMs.toFixed(0)} ms, metadata ${meta.duration * 1000} ms`);
  m.tracks.forEach((t, i) => {
    const notes = m.events.filter((e) => e.track === i && e.type === 0x90).length;
    const progs = [...new Set(m.events.filter((e) => e.track === i && e.type === 0xc0).map((e) => `${e.channel}:${e.a}`))];
    console.log(`  track ${i} ${JSON.stringify(t.name)} channels [${t.channels}] notes ${notes} programs ${progs.join(' ')}`);
  });
  meta.parts.forEach((p, i) => console.log(`  part ${i} ${p.name} [${p.instrumentId}] program ${p.program}`));

  const ons = m.events.filter((e) => e.type === 0x90).map((e) => e.ms).sort((a, b) => a - b);
  const evs = pos.events;
  let max = 0;
  let matched = 0;
  for (let i = 0; i < evs.length; i++) {
    const start = evs[i].position;
    const dur = (evs[i + 1]?.position ?? meta.duration * 1000) - start;
    let lo = 0;
    let hi = ons.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ons[mid] < start) lo = mid + 1;
      else hi = mid;
    }
    const near = [ons[lo], ons[lo - 1]].filter((x) => x !== undefined).reduce((a, b) => (Math.abs(b - start) < Math.abs(a - start) ? b : a), Infinity);
    const d = Math.abs(near - start);
    // A note within 30 ms: the downbeat is played (otherwise the measure starts with a rest, a tie or a syncopation,
    // and the nearest note is at least a 32nd away).
    if (d < Math.min(30, dur / 32)) {
      matched++;
      max = Math.max(max, d);
    }
  }
  console.log(`  ${evs.length} measures played, ${matched} with a note on the downbeat, max drift ${max.toFixed(3)} ms, last measure at ${evs.at(-1).position} ms`);
}
process.exit(0);
