// Spike S8 (2026-11-28) : exporte, comme l'import de l'application, le MIDI (saveMidi(true, true)), le MusicXML,
// les métadonnées et le .mscx (parties masquées rendues visibles) d'une partition, dans spikes/s8-audio-debug/out/<nom>/.
// Usage (depuis la racine de l'application) : node spikes/s8-audio-debug/export.mjs test-scores/Stay_With_Me.mscz
Object.defineProperty(globalThis, 'navigator', { value: {}, writable: true, configurable: true });
const realFetch = globalThis.fetch;
globalThis.fetch = undefined;
const { default: WebMscore } = await import('webmscore');
const { readFile, writeFile, mkdir } = await import('node:fs/promises');
const { basename, join } = await import('node:path');
const { unhideParts } = await import('../../src/core/import/unhideParts.ts');
const { DOMParser, XMLSerializer } = await import('@xmldom/xmldom');
const { unzipSync } = await import('fflate');
await WebMscore.ready;
globalThis.fetch = realFetch;

const f = process.argv[2];
const format = f.endsWith('.mscx') ? 'mscx' : 'mscz';
const { bytes: data } = unhideParts(format, new Uint8Array(await readFile(f)), { DOMParser, XMLSerializer });
const out = join(import.meta.dirname, 'out', basename(f).replace(/\.[^.]+$/, ''));
await mkdir(out, { recursive: true });
if (format === 'mscz') {
  const files = unzipSync(data);
  const main = Object.keys(files).find((n) => n.endsWith('.mscx') && !n.startsWith('Excerpts/'));
  await writeFile(join(out, 'score.mscx'), files[main]);
}
const s = await WebMscore.load(format, data, [], true);
await writeFile(join(out, 'metadata.json'), JSON.stringify(await s.metadata(), null, 1));
await writeFile(join(out, 'score.musicxml'), await s.saveXml());
await writeFile(join(out, 'positions.json'), await s.savePositions(false));
await writeFile(join(out, 'score.mid'), await s.saveMidi(true, true));
s.destroy();
console.log(`written to ${out}`);
process.exit(0);
