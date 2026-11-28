// Événements d'un canal dans une fenêtre de temps (parsés comme l'application, ordre d'envoi au synthétiseur).
// Usage : node spikes/s8-audio-debug/window.mjs <file.mid> <channel> <fromS> <toS>
const { readFile } = await import('node:fs/promises');
const { parseMidi } = await import('../../src/core/audio/midiFile.ts');
const [file, ch, from, to] = process.argv.slice(2);
const m = parseMidi(new Uint8Array(await readFile(file)));
const names = { 128: 'off', 144: 'on ', 176: 'cc ', 192: 'pc ', 224: 'pb ' };
for (const e of m.events) {
  if (e.channel !== Number(ch) || e.ms < from * 1000 || e.ms > to * 1000) continue;
  if (e.type === 176 && e.a === 2) continue; // breath (dynamics), noisy
  console.log(`${(e.ms / 1000).toFixed(4)} t${e.track} ${names[e.type] ?? e.type.toString(16)} ${e.a} ${e.type === 224 ? (e.b << 7) | e.a : e.b}`);
}
