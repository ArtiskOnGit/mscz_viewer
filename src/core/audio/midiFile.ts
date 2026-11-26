// Minimal Standard MIDI File reader (formats 0 and 1): what score playback needs, nothing more.
// - Absolute times in ms are computed with the tempo map (FF 51 of any track, as format 1 requires them in track 0).
// - MIDI port meta events (FF 21) shift the channel by 16 × port, as MuseScore does past 16 channels.
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
  /** All channel events of all tracks, sorted by time (note offs first, then file order at equal times). */
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

  // At the same tick, note offs first: a note repeated on a channel shared by two staves (piano) is not cut.
  const isOff = (e: RawEvent) => (e.kind === 'channel' && (e.type === 0x80 || (e.type === 0x90 && e.b === 0)) ? 0 : 1);
  raw.sort((x, y) => x.tick - y.tick || isOff(x) - isOff(y) || x.order - y.order);
  // Tempo map → ms.
  let usPerQuarter = 500000;
  let lastTick = 0;
  let lastMs = 0;
  const events: MidiEvent[] = [];
  let durationMs = 0;
  for (const e of raw) {
    const ms = lastMs + ((e.tick - lastTick) * usPerQuarter) / division / 1000;
    lastTick = e.tick;
    lastMs = ms;
    durationMs = Math.max(durationMs, ms);
    if (e.kind === 'tempo') usPerQuarter = e.value!;
    else if (e.kind === 'channel') {
      // Note on with velocity 0 is a note off.
      const type = e.type === 0x90 && e.b === 0 ? 0x80 : e.type!;
      events.push({ ms, track: e.track, channel: e.channel!, type, a: e.a!, b: e.b! });
    }
  }
  return { format, division, tracks, events, durationMs };
}

/** Note-on times (ms) of a parsed file, for comparisons with the timeline. */
export function noteOnTimes(midi: MidiFile): number[] {
  return midi.events.filter((e) => e.type === 0x90).map((e) => e.ms);
}
