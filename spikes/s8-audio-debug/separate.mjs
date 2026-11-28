// Applique à une sortie de export.mjs la séparation des canaux de l'import (src/core/audio/midiChannels.ts) et
// écrit out/<nom>/separated.mid ; affiche les canaux de chaque partie avant / après et les canaux partagés.
// Usage (depuis la racine) : node spikes/s8-audio-debug/separate.mjs spikes/s8-audio-debug/out/Stay_With_Me
const { readFile, writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { DOMParser } = await import('@xmldom/xmldom');
const { parseMidi } = await import('../../src/core/audio/midiFile.ts');
const { trackParts, channelsByPart, staffCounts } = await import('../../src/core/audio/partMapping.ts');
const { separatePartChannels } = await import('../../src/core/audio/midiChannels.ts');

const dir = process.argv[2];
const bytes = new Uint8Array(await readFile(join(dir, 'score.mid')));
const doc = new DOMParser().parseFromString(await readFile(join(dir, 'score.musicxml'), 'utf8'), 'application/xml');
const meta = JSON.parse(await readFile(join(dir, 'metadata.json'), 'utf8'));
const names = meta.parts.map((p) => p.name);
const drums = meta.parts.map((p) => p.hasDrumStaff === 'true');
const before = parseMidi(bytes);
const owners = trackParts(before, staffCounts(doc), names);
const show = (midi, label) => {
  const byPart = channelsByPart(midi, owners, names.length);
  console.log(label);
  byPart.forEach((chs, i) => {
    const progs = chs.map((c) => `${c}:p${midi.events.find((e) => e.channel === c && e.type === 0xc0 && owners[e.track] === i)?.a}`);
    console.log(`  ${names[i]}: ${progs.join(' ')}`);
  });
  const seen = new Map();
  byPart.forEach((chs, i) => chs.forEach((c) => seen.set(c, [...(seen.get(c) ?? []), names[i]])));
  const shared = [...seen].filter(([, ps]) => ps.length > 1);
  console.log(`  shared channels: ${shared.map(([c, ps]) => `${c} (${ps.join(' + ')})`).join(', ') || 'none'}`);
};
show(before, 'before (webmscore):');
const out = separatePartChannels(bytes, owners, drums);
if (!out) console.log('nothing to change');
else {
  await writeFile(join(dir, 'separated.mid'), out);
  const after = parseMidi(out);
  show(after, 'after (import):');
  console.log(`events ${before.events.length} → ${after.events.length}, duration ${before.durationMs.toFixed(0)} → ${after.durationMs.toFixed(0)} ms`);
}
