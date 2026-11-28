// Mesures incomplètes (levée, mesure coupée par une reprise, dernière mesure courte) d'une sortie de export.mjs et
// clics du décompte / des premières mesures, comme l'application (readMeasureFills, measureBeats, countInClicks).
// Usage (depuis la racine) : node --import ./spikes/s8-audio-debug/ts-resolve.mjs spikes/s8-audio-debug/pickup.mjs spikes/s8-audio-debug/out/Stay_With_Me
const { readFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { DOMParser } = await import('@xmldom/xmldom');
const { readMeasureFills, readTimeSignatures, timelineFromWebMscore } = await import('../../src/core/timeline/timeline.ts');
const { clicksFrom, countInClicks } = await import('../../src/core/playback/clicks.ts');

const dir = process.argv[2];
const doc = new DOMParser().parseFromString(await readFile(join(dir, 'score.musicxml'), 'utf8'), 'application/xml');
const meta = JSON.parse(await readFile(join(dir, 'metadata.json'), 'utf8'));
const positions = JSON.parse(await readFile(join(dir, 'positions.json'), 'utf8'));
const fills = readMeasureFills(doc);
console.log('incomplete measures:', fills.map((f, i) => f && `${i}: ${f.fill.toFixed(3)}${f.fromEnd ? ' (from end)' : ''}`).filter(Boolean).join(', ') || 'none');
const tl = timelineFromWebMscore(positions, readTimeSignatures(doc), meta.duration * 1000, fills);
console.log('count-in (1 bar):', countInClicks(tl, 0, 1).map((c) => c.scoreMs.toFixed(0)).join(' '));
const first = [];
for (const c of clicksFrom(tl, 0)) {
  if (c.eventIndex > 2) break;
  first.push(`${c.scoreMs.toFixed(0)}${c.accent ? '!' : ''}(m${tl.events[c.eventIndex].measureIndex} b${c.beat + 1})`);
}
console.log('clicks of the first measures:', first.join(' '));
