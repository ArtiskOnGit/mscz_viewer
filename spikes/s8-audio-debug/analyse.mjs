// Spike S8 (2026-11-28) : analyse d'un MIDI de webmscore (sortie de export.mjs) pour les bugs audio du téléphone :
// pistes / canaux / programmes, appariement note on / note off (notes pendantes, notes superposées de même hauteur
// sur un canal), pitch bend (et retour au centre), RPN, CC 64, autres CC.
// Usage (depuis la racine) : node spikes/s8-audio-debug/analyse.mjs spikes/s8-audio-debug/out/Stay_With_Me/score.mid [--bends] [--track=N]
const { readFile } = await import('node:fs/promises');
const { parseMidi } = await import('../../src/core/audio/midiFile.ts');

const file = process.argv[2];
const showBends = process.argv.includes('--bends');
const onlyTrack = Number(process.argv.find((a) => a.startsWith('--track='))?.slice(8) ?? NaN);
const m = parseMidi(new Uint8Array(await readFile(file)));
const fmt = (ms) => `${(ms / 1000).toFixed(3)}s`;
console.log(`format ${m.format}, division ${m.division}, ${m.tracks.length} tracks, ${m.events.length} channel events, ${fmt(m.durationMs)}`);

m.tracks.forEach((t, i) => {
  const ev = m.events.filter((e) => e.track === i);
  const count = (type) => ev.filter((e) => e.type === type).length;
  const progs = [...new Set(ev.filter((e) => e.type === 0xc0).map((e) => `ch${e.channel}:p${e.a}`))];
  const ccs = {};
  for (const e of ev.filter((e) => e.type === 0xb0)) ccs[e.a] = (ccs[e.a] ?? 0) + 1;
  console.log(`track ${i} ${JSON.stringify(t.name)} ch [${t.channels}] on ${count(0x90)} off ${count(0x80)} bend ${count(0xe0)} programs ${progs.join(' ')} CC ${JSON.stringify(ccs)}`);
});

// Note pairing per channel + key, in event order (= the order the synth receives them).
console.log('\n== note pairing (per channel/key, in playing order)');
const state = new Map(); // `${ch}:${key}` -> { depth, onMs, track }
const issues = { overlap: [], orphanOff: [] };
for (const e of m.events) {
  if (e.type !== 0x90 && e.type !== 0x80) continue;
  const k = `${e.channel}:${e.a}`;
  const s = state.get(k) ?? { depth: 0, ons: [] };
  if (e.type === 0x90) {
    if (s.depth > 0) issues.overlap.push({ ...e, prevOn: s.ons.at(-1) });
    s.depth++;
    s.ons.push(e);
  } else if (s.depth === 0) issues.orphanOff.push(e);
  else {
    s.depth--;
    s.ons.shift();
  }
  state.set(k, s);
}
const hanging = [...state.entries()].filter(([, s]) => s.depth > 0);
console.log(`overlapping note-ons (same channel+key, already sounding): ${issues.overlap.length}`);
const byTrack = {};
for (const o of issues.overlap) byTrack[o.track] = (byTrack[o.track] ?? 0) + 1;
console.log('  by track', JSON.stringify(byTrack));
for (const o of issues.overlap.filter((o) => Number.isNaN(onlyTrack) || o.track === onlyTrack).slice(0, 15))
  console.log(`  ${fmt(o.ms)} track ${o.track} ch${o.channel} key ${o.a} (previous on at ${fmt(o.prevOn.ms)} track ${o.prevOn.track})`);
console.log(`orphan note-offs: ${issues.orphanOff.length}`);
console.log(`notes never released at the end: ${hanging.length}`, hanging.slice(0, 10).map(([k, s]) => `${k} x${s.depth}`).join(' '));

// What a synth does with overlaps: one voice per note-on, a note-off releases ALL voices of the key (spessasynth,
// FluidSynth) → no hanging. But a note on while the same key is still on, then a note off for the FIRST one, cuts
// the second one early. Durations of notes per track:
console.log('\n== durations per track (from note on to matching note off, FIFO)');
const open = new Map();
const durs = new Map();
for (const e of m.events) {
  const k = `${e.channel}:${e.a}`;
  if (e.type === 0x90) (open.get(k) ?? open.set(k, []).get(k)).push(e);
  else if (e.type === 0x80) {
    const on = open.get(k)?.shift();
    if (on) (durs.get(on.track) ?? durs.set(on.track, []).get(on.track)).push({ on, d: e.ms - on.ms });
  }
}
for (const [t, list] of [...durs].sort((a, b) => a[0] - b[0])) {
  const ds = list.map((x) => x.d).sort((a, b) => a - b);
  const long = list.filter((x) => x.d > 4000);
  console.log(`track ${t}: ${ds.length} notes, median ${ds[ds.length >> 1].toFixed(0)} ms, max ${ds.at(-1).toFixed(0)} ms, > 4 s: ${long.length}`, long.slice(0, 5).map((x) => `${fmt(x.on.ms)} key ${x.on.a} ${x.d.toFixed(0)}ms`).join(', '));
}

// Pitch bends: ranges and whether each channel comes back to centre (8192) after a bend sequence.
console.log('\n== pitch bend');
const bendsByCh = new Map();
for (const e of m.events.filter((e) => e.type === 0xe0)) (bendsByCh.get(e.channel) ?? bendsByCh.set(e.channel, []).get(e.channel)).push(e);
for (const [ch, list] of bendsByCh) {
  const values = list.map((e) => (e.b << 7) | e.a);
  const last = list.at(-1);
  // Notes played while the bend is not centred.
  let bent = 0;
  let cur = 8192;
  let iBend = 0;
  const notes = m.events.filter((e) => e.channel === ch && e.type === 0x90);
  const bentNotes = [];
  for (const n of notes) {
    while (iBend < list.length && list[iBend].ms <= n.ms) cur = values[iBend++];
    if (cur !== 8192) {
      bent++;
      bentNotes.push(`${fmt(n.ms)} key ${n.a} bend ${cur}`);
    }
  }
  console.log(`ch${ch} (tracks ${[...new Set(list.map((e) => e.track))]}): ${list.length} bends, min ${Math.min(...values)} max ${Math.max(...values)}, last ${values.at(-1)} at ${fmt(last.ms)}, note-ons while bent: ${bent}`);
  if (showBends) {
    for (const n of bentNotes.slice(0, 20)) console.log('   ', n);
    // Bend sequences: groups of bends separated by > 50 ms.
    let start = 0;
    for (let i = 1; i <= list.length; i++) {
      if (i === list.length || list[i].ms - list[i - 1].ms > 50) {
        console.log(`    seq ${fmt(list[start].ms)}..${fmt(list[i - 1].ms)} n=${i - start} ${values[start]}→${values[i - 1]} (min ${Math.min(...values.slice(start, i))} max ${Math.max(...values.slice(start, i))})`);
        start = i;
      }
    }
  }
}

// RPNs: (101,100) then data entry 6/38, per channel.
console.log('\n== RPN / data entry, sustain (CC 64), other CCs');
for (const ch of [...new Set(m.events.map((e) => e.channel))].sort((a, b) => a - b)) {
  const cc = m.events.filter((e) => e.channel === ch && e.type === 0xb0);
  const seq = cc.filter((e) => [101, 100, 6, 38, 98, 99].includes(e.a)).map((e) => `${e.a}=${e.b}@${fmt(e.ms)}`);
  const sus = cc.filter((e) => e.a === 64).map((e) => `${e.b}@${fmt(e.ms)}`);
  const other = {};
  for (const e of cc.filter((e) => ![101, 100, 6, 38, 98, 99, 64].includes(e.a))) other[e.a] = [...new Set([...(other[e.a] ?? []), e.b])];
  console.log(`ch${ch}: RPN ${seq.slice(0, 8).join(' ')}${seq.length > 8 ? ` … (${seq.length})` : ''} | CC64 ${sus.slice(0, 6).join(' ') || '-'}${sus.length > 6 ? ` … (${sus.length})` : ''} | ${JSON.stringify(other)}`);
}
