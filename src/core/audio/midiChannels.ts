// One set of MIDI channels per part, rewritten at import (Stay With Me bug report, 2026-11-28; ADR-026 complement).
//
// MuseScore gives every instrument channel of the score its own MIDI channel (trumpet "open" + "mute" = 2, and one
// more per mid-score instrument change, e.g. a trumpet that sings: "Voix", Choir Aahs). Past 16, MuseScore 4.0
// (webmscore's engine) writes the MIDI port meta event FF 21 as 0 every time and the channel modulo 16: channel 16 is
// written as 0, 17 as 1… so two parts can end up on the same channel. Seen on Stay With Me (19 channels): the
// sousaphone's notes on the trumpet's channel (solo trumpet → sousaphone heard), and the sousaphone's "voice" program
// set on the baritone saxophone's channel (the saxophone sang "aah" for the whole piece).
//
// The file is rewritten so that no channel is used by two parts: the first part to use a channel keeps it, the
// others get free channels past 16 (MIDI ports, FF 21, read by midiFile.ts; spessasynth adds the channels). Drum
// channels stay drum channels (10 of a port, index 9 + 16 × port) and melodic channels never land on one. Pure.
// (No runtime import: also run by the Node spikes, spikes/s8-audio-debug/.)

const isDrumChannel = (c: number) => c % 16 === 9;

/**
 * Rewrites a Standard MIDI File so that each part has its own channels.
 * `trackParts[t]`: part of MIDI track t (−1: none, the track is then its own owner); `drumParts[p]`: part p is a
 * drum kit (unknown: channel 10 is taken as drums). Returns undefined when no channel has to change.
 */
export function separatePartChannels(bytes: Uint8Array, trackParts: readonly number[], drumParts: readonly (boolean | undefined)[]): Uint8Array | undefined {
  const file = readChunks(bytes);
  // (owner, source channel) pairs in order of appearance.
  const uses: { key: string; channel: number; drums: boolean }[] = [];
  const seen = new Set<string>();
  file.tracks.forEach((track, t) => {
    const part = trackParts[t] ?? -1;
    const owner = part >= 0 ? `p${part}` : `t${t}`;
    for (const e of track) {
      if (e.channel === undefined) continue;
      e.key = `${owner}:${e.channel}`;
      if (seen.has(e.key)) continue;
      seen.add(e.key);
      uses.push({ key: e.key, channel: e.channel, drums: isDrumChannel(e.channel) && (part < 0 || drumParts[part] !== false) });
    }
  });
  // First pass: every channel keeps its number when it is the first owner's (and of the right kind); second pass:
  // the others take the first free channels of their kind (past the score's: only the moved ones change).
  const mapping = new Map<string, number>();
  const taken = new Set<number>();
  for (const u of uses) {
    if (taken.has(u.channel) || isDrumChannel(u.channel) !== u.drums) continue;
    mapping.set(u.key, u.channel);
    taken.add(u.channel);
  }
  const moved = uses.filter((u) => !mapping.has(u.key));
  if (moved.length === 0) return undefined;
  for (const u of moved) {
    let c = u.drums ? 9 : 0;
    while (taken.has(c) || isDrumChannel(c) !== u.drums) c++;
    mapping.set(u.key, c);
    taken.add(c);
  }
  for (const track of file.tracks) for (const e of track) if (e.key !== undefined) e.to = mapping.get(e.key);
  return writeChunks(file);
}

interface RawTrackEvent {
  tick: number;
  /** Bytes of the event without its delta time (status byte always present). */
  data: number[];
  /** Source channel (+ 16 × port) of a channel event. */
  channel?: number;
  /** Owner (part or track) and source channel. */
  key?: string;
  /** Channel it is moved to. */
  to?: number;
  /** MIDI port meta event: dropped, written again where needed. */
  port?: boolean;
}

function readChunks(bytes: Uint8Array): { header: Uint8Array; tracks: RawTrackEvent[][]; extra: Uint8Array[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
  if (bytes.length < 14 || tag(0) !== 'MThd') throw new Error('not a MIDI file');
  let pos = 8 + view.getUint32(4);
  const header = bytes.slice(0, pos);
  const tracks: RawTrackEvent[][] = [];
  const extra: Uint8Array[] = [];
  while (pos + 8 <= bytes.length) {
    const len = view.getUint32(pos + 4);
    const end = Math.min(bytes.length, pos + 8 + len);
    if (tag(pos) !== 'MTrk') {
      extra.push(bytes.slice(pos, end)); // unknown chunk: kept as is, after the tracks
      pos = end;
      continue;
    }
    let p = pos + 8;
    pos = end;
    const events: RawTrackEvent[] = [];
    tracks.push(events);
    let tick = 0;
    let running = 0;
    let port = 0;
    const readVar = () => {
      let v = 0;
      for (let i = 0; i < 4 && p < end; i++) {
        const c = bytes[p++]!;
        v = (v << 7) | (c & 0x7f);
        if (!(c & 0x80)) break;
      }
      return v;
    };
    while (p < end) {
      tick += readVar();
      let status = bytes[p]!;
      if (status & 0x80) p++;
      else if (running) status = running;
      else throw new Error('data byte without status');
      if (status === 0xff) {
        const start = p;
        const type = bytes[p++]!;
        const len2 = readVar();
        p += len2;
        const data = [0xff, ...bytes.subarray(start, p)];
        if (type === 0x21 && len2 === 1) {
          port = bytes[p - 1]!;
          events.push({ tick, data, port: true });
        } else events.push({ tick, data });
        if (type === 0x2f) break;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        const start = p;
        p += readVar();
        events.push({ tick, data: [status, ...bytes.subarray(start, p)] });
        continue;
      }
      running = status;
      const type = status & 0xf0;
      const size = type === 0xc0 || type === 0xd0 ? 1 : 2;
      const data = [status, ...bytes.subarray(p, p + size)];
      p += size;
      events.push({ tick, data, channel: (status & 0x0f) + 16 * port });
    }
  }
  return { header, tracks, extra };
}

function writeChunks(file: { header: Uint8Array; tracks: RawTrackEvent[][]; extra: Uint8Array[] }): Uint8Array {
  const out: number[] = [...file.header];
  const vlq = (n: number): number[] => {
    const v = [n & 0x7f];
    while ((n >>>= 7)) v.unshift((n & 0x7f) | 0x80);
    return v;
  };
  for (const track of file.tracks) {
    const body: number[] = [];
    let last = 0;
    let port = 0;
    const put = (tick: number, data: readonly number[]) => {
      body.push(...vlq(tick - last), ...data);
      last = tick;
    };
    let ended = false;
    for (const e of track) {
      if (e.port) continue;
      if (e.to !== undefined) {
        const p = e.to >> 4;
        if (p !== port) put(e.tick, [0xff, 0x21, 1, p]);
        port = p;
        put(e.tick, [(e.data[0]! & 0xf0) | (e.to & 0x0f), ...e.data.slice(1)]);
        continue;
      }
      put(e.tick, e.data);
      if (e.data[0] === 0xff && e.data[1] === 0x2f) ended = true;
    }
    if (!ended) put(last, [0xff, 0x2f, 0]);
    out.push(0x4d, 0x54, 0x72, 0x6b, (body.length >>> 24) & 0xff, (body.length >>> 16) & 0xff, (body.length >>> 8) & 0xff, body.length & 0xff, ...body);
  }
  for (const chunk of file.extra) out.push(...chunk);
  return new Uint8Array(out);
}
