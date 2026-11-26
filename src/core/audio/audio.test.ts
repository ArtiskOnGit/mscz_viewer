import { describe, expect, it } from 'vitest';
import { MidiParseError, parseMidi, type MidiFile } from './midiFile';
import { midiChannelsByPart, staffCounts } from './partMapping';
import { chaseMessages, firstEventAt, messageOf, usedChannels } from './midiSchedule';
import { applyPreset, channelGains, currentPreset, faderGain, partGains, partMix, setPartMix } from './mixer';
import { MidiPlayer } from './midiPlayer';
import type { SynthHandle } from './synth';
import type { Part } from '../model/types';
import { PlaybackClock } from '../playback/clock';
import { parseXml } from '../../test/xmlEnv';

// --- tiny Standard MIDI File writer for the tests ---
const vlq = (n: number): number[] => {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
};
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];
/** events: [deltaTicks, ...bytes] */
const track = (events: number[][]) => {
  const body = events.flatMap(([delta, ...bytes]) => [...vlq(delta!), ...bytes!]);
  body.push(0, 0xff, 0x2f, 0);
  return [...'MTrk'].map((c) => c.charCodeAt(0)).concat(u32(body.length), body);
};
const smf = (tracks: number[][][], division = 480, format = 1) =>
  new Uint8Array([...[...'MThd'].map((c) => c.charCodeAt(0)), ...u32(6), ...u16(format), ...u16(tracks.length), ...u16(division), ...tracks.flatMap(track)]);
const name = (text: string) => [0, 0xff, 0x03, text.length, ...[...text].map((c) => c.charCodeAt(0))];
const tempo = (bpm: number, delta = 0) => {
  const us = Math.round(60_000_000 / bpm);
  return [delta, 0xff, 0x51, 3, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff];
};

describe('parseMidi', () => {
  const file = smf([
    [name('Conductor'), tempo(120), tempo(60, 960)], // 120 BPM for 2 beats (1 s), then 60 BPM
    [name('Trumpet'), [0, 0xc0, 56], [0, 0x90, 60, 100], [480, 60, 0], /* running status, velocity 0 = off */ [0, 0x80, 62, 0], [480, 0x90, 64, 90], [480, 0x80, 64, 0]],
    [name('Drums'), [0, 0xff, 0x21, 1, 1] /* port 1 */, [960, 0x99, 38, 120], [480, 0x89, 38, 0]],
  ]);
  const midi = parseMidi(file);

  it('reads tracks, names and channels (MIDI port → +16)', () => {
    expect(midi.format).toBe(1);
    expect(midi.tracks.map((t) => t.name)).toEqual(['Conductor', 'Trumpet', 'Drums']);
    expect(midi.tracks.map((t) => t.channels)).toEqual([[], [0], [25]]);
  });

  it('computes times with the tempo map, turns note on velocity 0 into note off', () => {
    const notes = midi.events.filter((e) => e.type !== 0xc0).map((e) => [e.type.toString(16), e.channel, e.a, Math.round(e.ms)]);
    expect(notes).toEqual([
      ['90', 0, 60, 0],
      ['80', 0, 60, 500], // running status 0x90 with velocity 0
      ['80', 0, 62, 500],
      ['90', 0, 64, 1000], // 960 ticks at 120 BPM
      ['90', 25, 38, 1000],
      ['80', 0, 64, 2000], // then 480 ticks at 60 BPM = 1 s
      ['80', 25, 38, 2000],
    ]);
    expect(midi.durationMs).toBeCloseTo(2000);
  });

  it('rejects other files', () => {
    expect(() => parseMidi(new Uint8Array([1, 2, 3]))).toThrow(MidiParseError);
  });
});

const part = (index: number, id: string, partName: string, extra: Partial<Part> = {}): Part => ({ index, musicXmlId: id, name: partName, ...extra });

describe('MIDI tracks → parts', () => {
  const midiWith = (tracks: { name?: string; channels: number[] }[]): MidiFile => ({ format: 1, division: 480, tracks, events: [], durationMs: 0 });

  it('reads the staves of each part', () => {
    const doc = parseXml('<score-partwise><part id="P1"><measure><attributes><staves>2</staves></attributes></measure></part><part id="P2"><measure/></part></score-partwise>');
    expect(staffCounts(doc)).toEqual([2, 1]);
  });

  it('gives one track per staff to each part, in order (webmscore)', () => {
    const midi = midiWith([{ name: 'Flute', channels: [0] }, { name: 'Piano', channels: [1] }, { name: 'Piano', channels: [1] }, { name: 'Trumpet', channels: [2, 3] }, { name: 'Drumset', channels: [9] }]);
    expect(midiChannelsByPart(midi, [1, 2, 1, 1], ['Flute', 'Piano', 'Trumpet', 'Drumset'])).toEqual([[0], [1], [2, 3], [9]]);
  });

  it('ignores tracks without channel events (conductor track)', () => {
    const midi = midiWith([{ name: 'Conductor', channels: [] }, { name: 'A', channels: [0] }, { name: 'B', channels: [1] }]);
    expect(midiChannelsByPart(midi, [1, 1], ['A', 'B'])).toEqual([[0], [1]]);
  });

  it('falls back on names, then order, when the tracks do not match the staves', () => {
    const midi = midiWith([{ name: 'Piano', channels: [0] }, { name: 'Bass', channels: [1] }, { name: 'Bass', channels: [2] }]);
    expect(midiChannelsByPart(midi, [1, 1], ['Piano', 'Bass'])).toEqual([[0], [1, 2]]); // 3 tracks for 2 staves
  });
});

describe('scheduling helpers', () => {
  const ev = (ms: number, type: number, channel: number, a: number, b = 0) => ({ ms, track: 0, channel, type, a, b });
  const events = [
    ev(0, 0xb0, 0, 101, 0), ev(0, 0xb0, 0, 100, 0), ev(0, 0xb0, 0, 6, 12), // pitch bend range RPN
    ev(0, 0xb0, 0, 0, 0), ev(0, 0xc0, 0, 56), ev(0, 0xb0, 0, 7, 100), ev(0, 0xb0, 0, 10, 64),
    ev(0, 0x90, 0, 60, 90), ev(400, 0x80, 0, 60), ev(500, 0xb0, 0, 7, 80), ev(600, 0xe0, 0, 0, 70),
    ev(700, 0xc0, 0, 57), ev(800, 0x90, 0, 62, 90), ev(900, 0xb0, 0, 7, 50),
    ev(0, 0xc0, 25, 0), ev(1000, 0x99 & 0xf0, 25, 38, 100),
  ].sort((x, y) => x.ms - y.ms);

  it('builds raw messages (channel mod 16)', () => {
    expect(messageOf(ev(0, 0x90, 25, 38, 100))).toEqual([0x99, 38, 100]);
    expect(messageOf(ev(0, 0xc0, 2, 40))).toEqual([0xc2, 40]);
  });

  it('finds the first event at a time', () => {
    expect(firstEventAt(events, 0)).toBe(0);
    expect(events[firstEventAt(events, 750)]!.ms).toBe(800);
    expect(firstEventAt(events, 5000)).toBe(events.length);
  });

  it('chases the channel state at a position: reset, RPN and bank in order, program, last controllers, bend', () => {
    const msgs = chaseMessages(events, 750, [0, 25]).map((m) => [m.channel, ...m.message]);
    expect(msgs).toEqual([
      [0, 0xb0, 121, 0],
      [0, 0xb0, 101, 0], [0, 0xb0, 100, 0], [0, 0xb0, 6, 12], [0, 0xb0, 0, 0],
      [0, 0xc0, 57], // last program
      [0, 0xb0, 7, 80], [0, 0xb0, 10, 64], // last volume, pan
      [0, 0xe0, 0, 70],
      [25, 0xb9, 121, 0],
      [25, 0xc9, 0],
    ]);
  });

  it('lists the channels used', () => {
    expect(usedChannels(events)).toEqual([0, 25]);
  });
});

describe('mixer', () => {
  const parts = [part(0, 'P1', 'Trumpet', { midiChannels: [0, 1] }), part(1, 'P2', 'Sax', { midiChannels: [2] }), part(2, 'P3', 'Drums', { midiChannels: [9] })];

  it('defaults to every part at 100 %', () => {
    expect([...partGains(parts, undefined).values()]).toEqual([1, 1, 1]);
    expect(partMix(undefined, 'P1')).toEqual({ volume: 1, muted: false, solo: false });
  });

  it('applies volume, mute and solo', () => {
    let m = setPartMix(undefined, 'P1', { volume: 0.5 });
    m = setPartMix(m, 'P3', { muted: true });
    expect([...partGains(parts, m).values()]).toEqual([0.5, 1, 0]);
    m = setPartMix(m, 'P2', { solo: true });
    expect([...partGains(parts, m).values()]).toEqual([0, 1, 0]);
    m = setPartMix(m, 'P1', { solo: true }); // two solos
    expect([...partGains(parts, m).values()]).toEqual([0.5, 1, 0]);
    m = setPartMix(m, 'P2', { muted: true }); // muted wins over solo
    expect([...partGains(parts, m).values()]).toEqual([0.5, 0, 0]);
  });

  it('gives each channel of a part its gain, on a fader curve', () => {
    const m = setPartMix(undefined, 'P1', { volume: 0.5 });
    expect(Object.fromEntries(channelGains(parts, m))).toEqual({ 0: 0.25, 1: 0.25, 2: 1, 9: 1 });
    expect(faderGain(0)).toBe(0);
    expect(faderGain(1)).toBe(1);
    expect(faderGain(2)).toBe(1);
  });

  it('quick mixes set mute flags with "My instrument", keep the volumes and clear the solos', () => {
    const base = setPartMix(setPartMix(undefined, 'P2', { volume: 0.3, solo: true }), 'P3', { muted: true });
    const only = applyPreset(parts, base, 'onlyMine', ['P1']);
    expect([...partGains(parts, only).values()]).toEqual([1, 0, 0]);
    expect(partMix(only, 'P2').volume).toBe(0.3);
    const without = applyPreset(parts, base, 'withoutMine', ['P1']);
    expect([...partGains(parts, without).values()]).toEqual([0, 0.3, 1]);
    const all = applyPreset(parts, base, 'all', ['P1']);
    expect([...partGains(parts, all).values()]).toEqual([1, 0.3, 1]);
    expect(currentPreset(parts, only, ['P1'])).toBe('onlyMine');
    expect(currentPreset(parts, without, ['P1'])).toBe('withoutMine');
    expect(currentPreset(parts, all, ['P1'])).toBe('all');
    expect(currentPreset(parts, base, ['P1'])).toBeUndefined();
    expect(currentPreset(parts, undefined, [])).toBe('all');
  });
});

describe('MidiPlayer scheduling on the playback clock', () => {
  const fake = () => {
    const sent: { message: number[]; channel: number; time: number }[] = [];
    const ctx = { currentTime: 10 } as AudioContext;
    const synth = {
      ctx,
      sent,
      opened: [] as number[],
      send(message: number[], channel: number, time: number) {
        sent.push({ message, channel, time });
      },
      silence: (_channels: readonly number[], queuedUntil: number) => queuedUntil + 0.05,
      open(time: number) {
        this.opened.push(time);
      },
    };
    return synth as unknown as SynthHandle & { sent: typeof sent; opened: number[] };
  };
  const midi = parseMidi(smf([[tempo(120), [0, 0xc0, 56], [0, 0x90, 60, 100], [480, 0x80, 60, 0], [0, 0x90, 62, 100], [480, 0x80, 62, 0], [0, 0x90, 64, 100], [480, 0x80, 64, 0]]]));

  it('sends the events at the time of the clock, tempo factor included, only up to the horizon', () => {
    const synth = fake();
    const player = new MidiPlayer(synth, midi);
    const clock = new PlaybackClock({ now: () => synth.ctx.currentTime });
    clock.setTempoFactor(0.5);
    clock.start(0, 0.15);
    player.start(0);
    expect(synth.sent.map((s) => s.message)).toEqual([[0xb0, 121, 0]]); // chase at 0: reset only
    synth.sent.length = 0;
    player.schedule(clock.scoreMsAt(10.2 + 1), (ms) => clock.timeOf(ms), 10); // horizon: score ms ≤ 525
    expect(synth.sent.map((s) => [s.message[1], s.time])).toEqual([
      [56, 10.15], // program
      [60, 10.15], // note on at score 0
      [60, 11.15], // note off at score 500 ms = 1 s at 50 %
      [62, 11.15],
    ]);
    synth.sent.length = 0;
    player.schedule(Infinity, (ms) => clock.timeOf(ms), 10);
    expect(synth.sent.map((s) => s.time)).toEqual([12.15, 12.15, 13.15]);
  });

  it('drops notes that are too late but keeps their note offs; stop silences what is queued', () => {
    const synth = fake();
    const player = new MidiPlayer(synth, midi);
    player.start(0);
    synth.sent.length = 0;
    player.schedule(Infinity, (ms) => 9 + ms / 1000, 10); // the clock is 1 s behind: note ons at 9, 9.5 are late
    const ons = synth.sent.filter((s) => (s.message[0]! & 0xf0) === 0x90);
    expect(ons.map((s) => s.message[1])).toEqual([64]); // 10.0: on time
    expect(synth.sent.every((s) => s.time >= 10)).toBe(true);
    player.stop();
    expect(player.readyAt).toBeCloseTo(10.5 + 0.05);
    player.start(500);
    expect(synth.opened.at(-1)).toBeCloseTo(10.55);
  });
});

describe('PlaybackClock.scoreMsAt', () => {
  it('gives the score position at any time (used for the latency and the audio horizon)', () => {
    let t = 5;
    const clock = new PlaybackClock({ now: () => t });
    clock.setTempoFactor(1.5);
    clock.start(1000, 0.5);
    expect(clock.scoreMsAt(5.5)).toBe(1000);
    expect(clock.scoreMsAt(6.5)).toBe(2500);
    t = 6.5;
    expect(clock.scoreMs()).toBe(2500);
    expect(clock.timeOf(clock.scoreMsAt(7.25))).toBeCloseTo(7.25);
  });
});
