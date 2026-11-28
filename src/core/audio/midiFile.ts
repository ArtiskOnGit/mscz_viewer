// Minimal Standard MIDI File reader (formats 0 and 1): what score playback needs, nothing more.
// - Absolute times in ms are computed with the tempo map (FF 51 of any track, as format 1 requires them in track 0).
// - MIDI port meta events (FF 21) shift the channel by 16 × port, as MuseScore does past 16 channels.
// - Notes are normalized (normalizeNotes): exactly one note off per note on, at most one voice per channel and key.
// Pure code: unit-tested (midiFile.test.ts) and run by e2e/spikes in Node.

export interface MidiEvent {
  /** Time at the file's tempo, in ms. */
  ms: number;
  /** Rank of the track (MTrk chunk) in the file. */
  track: number;
  /** 0-based channel, + 16 × MIDI port. */
  channel: number;
  /** Status nibble: 0x80 note off, 0x90 note on, 0xa0, 0xb0 CC, 0xc0 program, 0xd0, 0xe0 pitch bend. */
  type: number;
  a: number;
  b: number;
}

export interface MidiTrackInfo {
  name?: string;
  /** Channels used by the track's channel events. */
  channels: number[];
}

export interface MidiFile {
  format: number;
  /** Ticks per quarter note. */
  division: number;
  tracks: MidiTrackInfo[];
  /**
   * All channel events of all tracks, sorted by time (note offs first, then file order at equal times). Notes are
   * normalized: every note on has exactly one later note off, and a key is never started twice on a channel without
   * a note off in between.
   */
  events: MidiEvent[];
  /** End of the last event, in ms. */
  durationMs: number;
}

export class MidiParseError extends Error {}

interface RawEvent {
  tick: number;
  order: number;
  track: number;
  kind: 'channel' | 'tempo' | 'port';
  channel?: number;
  type?: number;
  a?: number;
  b?: number;
  /** µs per quarter (tempo) or port number. */
  value?: number;
}

export function parseMidi(bytes: Uint8Array): MidiFile {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
  if (bytes.length < 14 || tag(0) !== 'MThd') throw new MidiParseError('not a MIDI file');
  const headerLen = view.getUint32(4);
  const format = view.getUint16(8);
  const trackCount = view.getUint16(10);
  const division = view.getUint16(12);
  if (division & 0x8000) throw new MidiParseError('SMPTE time division is not supported');

  const raw: RawEvent[] = [];
  const tracks: MidiTrackInfo[] = [];
  let pos = 8 + headerLen;
  let order = 0;
  for (let t = 0; t < trackCount && pos + 8 <= bytes.length; t++) {
    if (tag(pos) !== 'MTrk') throw new MidiParseError(`chunk ${t} is not a track`);
    const len = view.getUint32(pos + 4);
    let p = pos + 8;
    const end = Math.min(bytes.length, p + len);
    pos = p + len;
    const info: MidiTrackInfo = { channels: [] };
    tracks.push(info);
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
      else if (running) status = running; // running status
      else throw new MidiParseError(`track ${t}: data byte without status`);

      if (status === 0xff) {
        const metaType = bytes[p++]!;
        const len2 = readVar();
        const data = bytes.subarray(p, p + len2);
        p += len2;
        if (metaType === 0x51 && len2 === 3) raw.push({ tick, order: order++, track: t, kind: 'tempo', value: (data[0]! << 16) | (data[1]! << 8) | data[2]! });
        else if (metaType === 0x21 && len2 === 1) port = data[0]!;
        else if (metaType === 0x03 && info.name === undefined) info.name = new TextDecoder().decode(data).trim();
        else if (metaType === 0x2f) break;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        p += readVar(); // SysEx: skipped (GS/GM resets; the synth starts in a known state)
        continue;
      }
      running = status;
      const type = status & 0xf0;
      const channel = (status & 0x0f) + 16 * port;
      const a = bytes[p++]! & 0x7f;
      const b = type === 0xc0 || type === 0xd0 ? 0 : bytes[p++]! & 0x7f;
      raw.push({ tick, order: order++, track: t, kind: 'channel', channel, type, a, b });
      if (!info.channels.includes(channel)) info.channels.push(channel);
    }
  }

  const sorted = normalizeNotes(raw);
  // Tempo map → ms.
  let usPerQuarter = 500000;
  let lastTick = 0;
  let lastMs = 0;
  const events: MidiEvent[] = [];
  let durationMs = 0;
  for (const e of sorted) {
    const ms = lastMs + ((e.tick - lastTick) * usPerQuarter) / division / 1000;
    lastTick = e.tick;
    lastMs = ms;
    durationMs = Math.max(durationMs, ms);
    if (e.kind === 'tempo') usPerQuarter = e.value!;
    else if (e.kind === 'channel') {
      events.push({ ms, track: e.track, channel: e.channel!, type: e.type!, a: e.a!, b: e.b! });
    }
  }
  return { format, division, tracks, events, durationMs };
}

/** Note-on times (ms) of a parsed file, for comparisons with the timeline. */
export function noteOnTimes(midi: MidiFile): number[] {
  return midi.events.filter((e) => e.type === 0x90).map((e) => e.ms);
}

const isNoteOn = (e: RawEvent) => e.kind === 'channel' && e.type === 0x90 && e.b! > 0;
const isNoteOff = (e: RawEvent) => e.kind === 'channel' && (e.type === 0x80 || (e.type === 0x90 && e.b === 0));

/**
 * Notes made safe for a synthesizer (Stay With Me bug report, 2026-11-28), from the raw events in file order:
 * - note on / note off paired per track, channel and key in FILE order (first in, first out): MuseScore writes a
 *   glissando step as "on, off, on" at the same tick (a zero-length note, then the real one); these zero-length
 *   notes are dropped. (The previous parser sorted every note off first at a tick, which turned it into "off, on,
 *   on": two voices for one note off, the second one ringing for tens of seconds.) Note offs without a note on are
 *   dropped (MuseScore sends them on every channel of an instrument); a note never released ends with the file;
 * - per channel and key (several tracks share a channel: the staves of a piano), overlapping notes are merged: a new
 *   note on while the key sounds is preceded by a note off (re-struck), and the key is released when the last of
 *   the overlapping notes ends. spessasynth releases ONE voice per note off (oldest first): with balanced, never
 *   nested notes, no voice can hang.
 * Returns all the events sorted by tick, note offs first at a tick, then file order.
 */
function normalizeNotes(raw: readonly RawEvent[]): RawEvent[] {
  const out: RawEvent[] = [];
  interface Note { track: number; channel: number; key: number; velocity: number; start: number; end: number; order: number }
  const notes: Note[] = [];
  const open = new Map<string, RawEvent[]>();
  let lastTick = 0;
  for (const e of raw) {
    lastTick = Math.max(lastTick, e.tick);
    if (isNoteOn(e)) {
      const k = `${e.track}:${e.channel}:${e.a}`;
      const list = open.get(k);
      if (list) list.push(e);
      else open.set(k, [e]);
    } else if (isNoteOff(e)) {
      const on = open.get(`${e.track}:${e.channel}:${e.a}`)?.shift();
      if (on && e.tick > on.tick) notes.push({ track: on.track, channel: on.channel!, key: on.a!, velocity: on.b!, start: on.tick, end: e.tick, order: on.order });
    } else out.push(e);
  }
  for (const list of open.values())
    for (const on of list) if (lastTick > on.tick) notes.push({ track: on.track, channel: on.channel!, key: on.a!, velocity: on.b!, start: on.tick, end: lastTick, order: on.order });

  const byKey = new Map<string, Note[]>();
  for (const n of notes) {
    const k = `${n.channel}:${n.key}`;
    const list = byKey.get(k);
    if (list) list.push(n);
    else byKey.set(k, [n]);
  }
  const event = (n: Note, tick: number, on: boolean, order: number): RawEvent => ({ tick, order, track: n.track, kind: 'channel', channel: n.channel, type: on ? 0x90 : 0x80, a: n.key, b: on ? n.velocity : 0 });
  for (const list of byKey.values()) {
    list.sort((x, y) => x.start - y.start || x.order - y.order);
    let sounding: Note | undefined;
    let end = -Infinity;
    for (const n of list) {
      const overlaps = !!sounding && n.start < end;
      if (overlaps && n.start === sounding!.start) {
        end = Math.max(end, n.end); // same key started twice at the same tick (unison of two staves): one note
        continue;
      }
      if (sounding) out.push(event(sounding, overlaps ? n.start : end, false, n.order)); // re-struck, or released
      out.push(event(n, n.start, true, n.order));
      end = overlaps ? Math.max(end, n.end) : n.end;
      sounding = n;
    }
    if (sounding) out.push(event(sounding, end, false, sounding.order));
  }
  const off = (e: RawEvent) => (e.kind === 'channel' && e.type === 0x80 ? 0 : 1);
  return out.sort((x, y) => x.tick - y.tick || off(x) - off(y) || x.order - y.order);
}
