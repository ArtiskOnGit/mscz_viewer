// Passages utiles aux tests e2e : mesures (4 s) où la trompette se tait et le sousaphone joue, et où aucune partie
// ne chante (programme 52, « Voix »). Usage : node spikes/s8-audio-debug/passages.mjs spikes/s8-audio-debug/out/Stay_With_Me
const { readFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { parseMidi } = await import('../../src/core/audio/midiFile.ts');

const dir = process.argv[2];
const m = parseMidi(new Uint8Array(await readFile(join(dir, 'separated.mid'))));
const pos = JSON.parse(await readFile(join(dir, 'positions.json'), 'utf8')).events;
const voiceChannels = new Set(m.events.filter((e) => e.type === 0xc0 && e.a === 52).map((e) => e.channel));
const iv = {};
const open = {};
for (const e of m.events) {
  const k = `${e.track}:${e.channel}:${e.a}`;
  if (e.type === 0x90) open[k] = e.ms;
  else if (e.type === 0x80 && open[k] !== undefined) {
    (iv[e.track] ??= []).push([open[k], e.ms + 800, e.channel]); // + release
    delete open[k];
  }
}
const busy = (t, a, b, only = () => true) => (iv[t] ?? []).some(([s, e, c]) => s < b && e > a && only(c));
const voice = (a, b) => Object.keys(iv).some((t) => busy(t, a, b, (c) => voiceChannels.has(c)));
for (let i = 0; i < pos.length; i++) {
  const a = pos[i].position;
  const b = a + 4000;
  const flags = [];
  if (!busy(2, a, b) && busy(5, a, b)) flags.push('trumpet silent, sousaphone plays');
  if (voice(a, b)) flags.push('VOICE');
  if (flags.length) console.log(`event ${i} measure index ${pos[i].elid} at ${a} ms: ${flags.join(', ')}`);
}
