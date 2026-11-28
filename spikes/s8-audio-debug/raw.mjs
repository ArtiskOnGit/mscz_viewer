// Événements bruts d'une piste (ordre du fichier, ticks), entre deux ticks.
// Usage : node spikes/s8-audio-debug/raw.mjs <file.mid> <track> <fromTick> <toTick>
const { readFile } = await import('node:fs/promises');
const [file, track, from, to] = process.argv.slice(2);
const bytes = new Uint8Array(await readFile(file));
const v = new DataView(bytes.buffer);
let pos = 14;
for (let t = 0; pos < bytes.length; t++) {
  const len = v.getUint32(pos + 4);
  let p = pos + 8;
  const end = p + len;
  pos = end;
  if (t !== Number(track)) continue;
  let tick = 0;
  let running = 0;
  const rv = () => {
    let x = 0;
    for (;;) {
      const c = bytes[p++];
      x = (x << 7) | (c & 0x7f);
      if (!(c & 0x80)) return x;
    }
  };
  while (p < end) {
    tick += rv();
    let s = bytes[p];
    if (s & 0x80) p++;
    else s = running;
    let line;
    if (s === 0xff) {
      const ty = bytes[p++];
      const l = rv();
      line = `FF${ty.toString(16)} ${[...bytes.subarray(p, p + l)]}`;
      p += l;
    } else if (s === 0xf0 || s === 0xf7) {
      p += rv();
      line = 'sysex';
    } else {
      running = s;
      const ty = s & 0xf0;
      const a = bytes[p++];
      const b = ty === 0xc0 || ty === 0xd0 ? '' : bytes[p++];
      if (ty === 0xb0 && a === 2) continue;
      line = `${s.toString(16)} ${a} ${b}`;
    }
    if (tick >= Number(from) && tick <= Number(to)) console.log(tick, line);
  }
}
