// Stay With Me bug report (2026-11-28): hanging notes in glissandi, parts sharing MIDI channels (solo / programs),
// stop that leaves pitch bend or sustain behind. Synthetic MIDI files shaped like webmscore's.
import { describe, expect, it } from 'vitest';
import { parseMidi, type MidiEvent } from './midiFile';
import { separatePartChannels } from './midiChannels';
import { channelsByPart, trackParts } from './partMapping';
import { chaseMessages, silenceMessages } from './midiSchedule';
import { channelGains, setPartMix } from './mixer';
import type { Part } from '../model/types';

const vlq = (n: number): number[] => {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
};
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
/** events: [deltaTicks, ...bytes] */
const track = (events: number[][]) => {
  const body = events.flatMap(([delta, ...bytes]) => [...vlq(delta!), ...bytes!]);
  body.push(0, 0xff, 0x2f, 0);
  return [...'MTrk'].map((c) => c.charCodeAt(0)).concat(u32(body.length), body);
};
const smf = (tracks: number[][][]) => new Uint8Array([...[...'MThd'].map((c) => c.charCodeAt(0)), ...u32(6), 0, 1, 0, tracks.length, 0x01, 0xe0, ...tracks.flatMap(track)]);
const name = (text: string) => [0, 0xff, 0x03, text.length, ...[...text].map((c) => c.charCodeAt(0))];
const port0 = [0, 0xff, 0x21, 1, 0]; // what MuseScore 4.0 writes after each channel's setup, whatever the channel

/**
 * Voices left by a synth that, like spessasynth, starts one voice per note on and releases the OLDEST unreleased
 * voice of the key per note off. Returns the most voices a channel/key had at once and the voices left at the end.
 */
function voices(events: readonly MidiEvent[]): { max: number; left: number } {
  const sounding = new Map<string, number>();
  let max = 0;
  for (const e of events) {
    const k = `${e.channel}:${e.a}`;
    if (e.type === 0x90) sounding.set(k, (sounding.get(k) ?? 0) + 1);
    else if (e.type === 0x80 && sounding.get(k)) sounding.set(k, sounding.get(k)! - 1);
    max = Math.max(max, sounding.get(k) ?? 0);
  }
  return { max, left: [...sounding.values()].reduce((a, b) => a + b, 0) };
}
const notes = (events: readonly MidiEvent[]) => events.filter((e) => e.type === 0x80 || e.type === 0x90).map((e) => [e.type === 0x90 ? 'on' : 'off', e.channel, e.a, Math.round(e.ms)]);

describe('note normalization (no hanging notes)', () => {
  it('a glissando step written "on, off, on" at one tick is one note, released once (MuseScore 4)', () => {
    // Sousaphone glissando of Stay With Me: per step, note offs on the other channels of the instrument, then
    // on/off/on on the playing channel, the note off 18 ticks later.
    const midi = parseMidi(smf([[
      [0, 0x92, 44, 64], [240, 0x92, 44, 0], // previous note
      [0, 0x87, 44, 0], [0, 0x81, 44, 0], [0, 0x92, 44, 64], [0, 0x92, 44, 0], [0, 0x92, 44, 64], [18, 0x92, 44, 0],
      [1, 0x87, 43, 0], [0, 0x92, 43, 64], [0, 0x92, 43, 0], [0, 0x92, 43, 64], [18, 0x92, 43, 0],
    ]]));
    expect(notes(midi.events)).toEqual([
      ['on', 2, 44, 0], ['off', 2, 44, 250], ['on', 2, 44, 250], ['off', 2, 44, 269],
      ['on', 2, 43, 270], ['off', 2, 43, 289],
    ]);
    expect(voices(midi.events)).toEqual({ max: 1, left: 0 });
  });

  it('a trombone glissando (pitch bend) keeps its bends in order, with one voice', () => {
    const midi = parseMidi(smf([[
      [0, 0x9d, 53, 80], [0, 0x9d, 53, 0], [0, 0x9d, 53, 80], [0, 0xed, 0, 64],
      [100, 0xed, 0, 72], [100, 0xed, 0, 80], [0, 0x9d, 53, 0], [0, 0xed, 0, 64], [1, 0x9d, 56, 80], [100, 0x9d, 56, 0],
    ]]));
    expect(voices(midi.events)).toEqual({ max: 1, left: 0 });
    const order = midi.events.map((e) => (e.type === 0xe0 ? `bend${e.b}` : `${e.type === 0x90 ? 'on' : 'off'}${e.a}`));
    expect(order).toEqual(['on53', 'bend64', 'bend72', 'off53', 'bend80', 'bend64', 'on56', 'off56']);
    expect(midi.events.filter((e) => e.type === 0xe0).at(-1)!.b).toBe(64); // back to centre before the next note
  });

  it('two staves sharing a channel: a repeated key is re-struck, released when the last note ends', () => {
    const midi = parseMidi(smf([
      [name('Piano'), [0, 0x90, 60, 90], [960, 0x80, 60, 0]],
      [name('Piano'), [240, 0x90, 60, 70], [240, 0x80, 60, 0], [0, 0x90, 64, 70], [0, 0x90, 64, 70] /* unison */, [240, 0x80, 64, 0], [0, 0x80, 64, 0]],
    ]));
    expect(notes(midi.events)).toEqual([['on', 0, 60, 0], ['off', 0, 60, 250], ['on', 0, 60, 250], ['on', 0, 64, 500], ['off', 0, 64, 750], ['off', 0, 60, 1000]]);
    expect(voices(midi.events)).toEqual({ max: 1, left: 0 });
  });

  it('drops note offs without a note on, ends notes never released with the file', () => {
    const midi = parseMidi(smf([[[0, 0x80, 50, 0], [0, 0x90, 60, 90], [480, 0x90, 62, 90], [480, 0x80, 62, 0]]]));
    expect(notes(midi.events)).toEqual([['on', 0, 60, 0], ['on', 0, 62, 500], ['off', 0, 60, 1000], ['off', 0, 62, 1000]]);
    expect(voices(midi.events).left).toBe(0);
  });
});

describe('parts sharing MIDI channels past 16 (webmscore writes port 0 and the channel modulo 16)', () => {
  const setup = (channel: number, program: number) => [[0, 0xb0 | channel, 121, 0], [0, 0xc0 | channel, program], [0, 0xb0 | channel, 7, 100], port0];
  // Stay With Me in small: the sousaphone's channels 16, 17 written as 0 (trumpet) and 1 (baritone sax), a melodic
  // channel 25 written as 9 (drums).
  const file = smf([
    [name('Trumpet'), ...setup(0, 56), [0, 0x90, 70, 90], [480, 0x80, 70, 0]],
    [name('Bari'), ...setup(1, 67), [0, 0x91, 40, 90], [480, 0x81, 40, 0]],
    [name('Sousaphone'), ...setup(7, 58), ...setup(1, 52), ...setup(0, 58), ...setup(9, 60), [0, 0x90, 34, 90], [0, 0x99, 50, 90], [480, 0x80, 34, 0], [0, 0x89, 50, 0]],
    [name('Drums'), ...setup(9, 0), [0, 0x99, 38, 100], [480, 0x89, 38, 0]],
  ]);
  const before = parseMidi(file);
  const owners = trackParts(before, [1, 1, 1, 1], ['Trumpet', 'Bari', 'Sousaphone', 'Drums']);
  const separated = separatePartChannels(file, owners, [false, false, false, true])!;
  const after = parseMidi(separated);
  const byPart = channelsByPart(after, owners, 4);

  it('the engine file shares channels between parts (the bug)', () => {
    const shared = channelsByPart(before, owners, 4);
    expect(shared).toEqual([[0], [1], [0, 1, 7, 9], [9]]);
  });

  it('gives each part its own channels: first owners keep theirs, the others take free ones', () => {
    expect(byPart).toEqual([[0], [1], [2, 3, 4, 7], [9]]);
    const all = byPart.flat();
    expect(new Set(all).size).toBe(all.length);
    // Programs: the baritone saxophone keeps its own (it sang "aah" with the sousaphone's voice program).
    const program = (c: number) => after.events.filter((e) => e.channel === c && e.type === 0xc0).map((e) => e.a);
    expect(program(1)).toEqual([67]);
    expect(program(0)).toEqual([56]);
    expect(program(2)).toEqual([52]);
    // The sousaphone's notes moved with it; its melodic channel 10 is not a drum channel any more.
    expect(after.events.filter((e) => e.type === 0x90 && e.track === 2).map((e) => [e.channel % 16 === 9 ? 'drum' : 'melodic', e.channel, e.a])).toEqual([
      ['melodic', 3, 34],
      ['melodic', 4, 50],
    ]);
    expect(after.events.filter((e) => e.type === 0x90 && e.track === 3).map((e) => e.channel)).toEqual([9]);
    expect(after.durationMs).toBeCloseTo(before.durationMs);
  });

  it('solo trumpet: every channel that plays a sousaphone note is silent', () => {
    const parts: Part[] = ['Trumpet', 'Bari', 'Sousaphone', 'Drums'].map((n, i) => ({ index: i, musicXmlId: `P${i + 1}`, name: n, midiChannels: byPart[i] }));
    const gains = channelGains(parts, setPartMix(undefined, 'P1', { solo: true }));
    const sousaphoneNotes = after.events.filter((e) => e.type === 0x90 && e.track === 2);
    expect(sousaphoneNotes.every((e) => gains.get(e.channel) === 0)).toBe(true);
    expect(gains.get(0)).toBe(1);
    // Before the fix, the trumpet's channel 0 also carried the sousaphone's notes.
    const oldParts = parts.map((p, i) => ({ ...p, midiChannels: channelsByPart(before, owners, 4)[i] }));
    const oldGains = channelGains(oldParts, setPartMix(undefined, 'P1', { solo: true }));
    expect(before.events.some((e) => e.type === 0x90 && e.track === 2 && oldGains.get(e.channel)! > 0)).toBe(true);
  });

  it('leaves files without shared channels alone (piano staves of one part share theirs)', () => {
    const piano = smf([[name('Piano'), ...setup(0, 0), [0, 0x90, 60, 90], [480, 0x80, 60, 0]], [name('Piano'), [0, 0x90, 48, 90], [480, 0x80, 48, 0]], [name('Drums'), ...setup(9, 0)]]);
    const m = parseMidi(piano);
    expect(separatePartChannels(piano, trackParts(m, [2, 1], ['Piano', 'Drums']), [false, true])).toBeUndefined();
  });

  it('without drum information, channel 10 stays a drum channel', () => {
    const own = separatePartChannels(file, owners, [])!;
    expect(channelsByPart(parseMidi(own), owners, 4)).toEqual([[0], [1], [2, 3, 7, 9], [25]]);
  });
});

describe('stop / seek leave the channels neutral', () => {
  it('releases sustain, notes and sound, resets the controllers and centres the pitch bend on every channel', () => {
    const msgs = silenceMessages([2, 18]).map((m) => [m.channel, ...m.message]);
    expect(msgs).toEqual([
      [2, 0xb2, 64, 0], [2, 0xb2, 123, 0], [2, 0xb2, 120, 0], [2, 0xb2, 121, 0], [2, 0xe2, 0, 64],
      [18, 0xb2, 64, 0], [18, 0xb2, 123, 0], [18, 0xb2, 120, 0], [18, 0xb2, 121, 0], [18, 0xe2, 0, 64],
    ]);
  });

  it('a start after a glissando restores the centred pitch bend, a start in the middle restores the bend', () => {
    const midi = parseMidi(smf([[[0, 0x90, 53, 80], [0, 0xe0, 0, 64], [100, 0xe0, 0, 80], [100, 0x80, 53, 0], [0, 0xe0, 0, 64], [100, 0x90, 56, 80], [100, 0x80, 56, 0]]]));
    const bendAt = (ms: number) => chaseMessages(midi.events, ms, [0]).filter((m) => (m.message[0]! & 0xf0) === 0xe0).map((m) => m.message[2]);
    expect(bendAt(150)).toEqual([80]);
    expect(bendAt(300)).toEqual([64]);
  });
});
