// Metronome through the synth (ADR-026, sync fix of 2026-11-28): click stream, MIDI messages, MidiPlayer clicks and
// the engine's routing (synth with the sound on, Web Audio oscillators without).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Timeline } from '../model/types';
import { CLICK_LENGTH_S, METRONOME_KEYS, clickMessages, metronomeChannelFor, metronomeNotes, metronomeSetupMessages } from './metronome';
import { MidiPlayer, type ScoreAudioSource } from './midiPlayer';
import { parseMidi } from './midiFile';
import type { SynthHandle } from './synth';

const sig = (beats: number, beatType: number) => ({ beats, beatType });
// 4/4 at 120 (2 s), 3/4 at 120 (1.5 s), 6/8 at a slower tempo (2 s: dotted quarter = 1 s), then bar 1 again (repeat),
// at 60 (4 s: tempo change).
const TL: Timeline = {
  source: 'webmscore',
  totalMs: 9500,
  events: [
    { measureIndex: 0, startMs: 0, durationMs: 2000, timeSig: sig(4, 4) },
    { measureIndex: 1, startMs: 2000, durationMs: 1500, timeSig: sig(3, 4) },
    { measureIndex: 2, startMs: 3500, durationMs: 2000, timeSig: sig(6, 8) },
    { measureIndex: 0, startMs: 5500, durationMs: 4000, timeSig: sig(4, 4) },
  ],
};
const { accent: HI, beat: LO } = METRONOME_KEYS;

describe('metronomeNotes (the metronome track)', () => {
  it('clicks every beat in playing order: meters, compound meters, tempo changes, repeats, accent on beat 1', () => {
    const notes = [...metronomeNotes(TL, 0, 0)];
    expect(notes.map((n) => n.scoreMs)).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4500, 5500, 6500, 7500, 8500]);
    expect(notes.map((n) => n.key)).toEqual([HI, LO, LO, LO, HI, LO, LO, HI, LO, HI, LO, LO, LO]);
    expect(notes.every((n) => !n.countIn)).toBe(true);
    expect(notes[0]!.velocity).toBeGreaterThan(notes[1]!.velocity);
  });

  it('starts with a count-in in the meter and tempo of the first played bar', () => {
    const notes = [...metronomeNotes(TL, 1, 2)]; // from the 3/4 bar: 2 bars of 3 clicks before 2000 ms
    const countIn = notes.filter((n) => n.countIn);
    expect(countIn.map((n) => n.scoreMs)).toEqual([-1000, -500, 0, 500, 1000, 1500]);
    expect(countIn.map((n) => n.key)).toEqual([HI, LO, LO, HI, LO, LO]);
    expect(notes.find((n) => !n.countIn)?.scoreMs).toBe(2000);
  });

  it('restarts at a position (tempo change while playing), count-in included', () => {
    expect([...metronomeNotes(TL, 1, 1, { fromMs: 1000 })].map((n) => n.scoreMs).slice(0, 4)).toEqual([1000, 1500, 2000, 2500]);
    expect([...metronomeNotes(TL, 0, 0, { fromMs: 5600 })].map((n) => n.scoreMs)).toEqual([6500, 7500, 8500]);
  });

  it('without accent, every click sounds alike but the downbeat is still known (beat dot)', () => {
    const notes = [...metronomeNotes(TL, 0, 0, { accent: false })];
    expect(new Set(notes.map((n) => n.key))).toEqual(new Set([LO]));
    expect(notes.filter((n) => n.downbeat).map((n) => n.scoreMs)).toEqual([0, 2000, 3500, 5500]);
  });

  it('is empty for an unknown start', () => {
    expect([...metronomeNotes(TL, 9, 1)]).toEqual([]);
  });
});

describe('metronome MIDI messages', () => {
  it('uses a dedicated channel after the score channels, never the drum channel 10', () => {
    expect(metronomeChannelFor([])).toBe(16);
    expect(metronomeChannelFor([0, 1, 9])).toBe(16);
    expect(metronomeChannelFor([0, 9, 16, 20])).toBe(21);
  });
  it('builds note on / off with the channel mod 16 (the port offset is sent apart)', () => {
    expect(clickMessages(16, { key: HI, velocity: 127 })).toEqual({ on: [0x90, HI, 127], off: [0x80, HI, 0] });
    expect(clickMessages(21, { key: LO, velocity: 110 })).toEqual({ on: [0x95, LO, 110], off: [0x85, LO, 0] });
  });
  it('sets the channel up as a dry standard kit at full volume, without a controller reset', () => {
    const m = metronomeSetupMessages(16);
    expect(m).toContainEqual([0xc0, 0]);
    expect(m).toContainEqual([0xb0, 7, 127]);
    expect(m).toContainEqual([0xb0, 91, 0]);
    expect(m.some((x) => x[0] === 0xb0 && x[1] === 121)).toBe(false);
  });
});

// --- MidiPlayer clicks ---
const fakeSynth = () => {
  const sent: { message: number[]; channel: number; time: number }[] = [];
  const synth = {
    ctx: { currentTime: 10 } as AudioContext,
    sent,
    silenced: [] as number[][],
    drums: [] as number[],
    gains: new Map<number, number>(),
    send: (message: number[], channel: number, time: number) => void sent.push({ message, channel, time }),
    silence(channels: readonly number[], queuedUntil: number) {
      this.silenced.push([...channels]);
      return queuedUntil + 0.05;
    },
    open: () => undefined,
    setDrums(channel: number) {
      this.drums.push(channel);
    },
    setChannelGain(channel: number, gain: number) {
      this.gains.set(channel, gain);
    },
  };
  return synth as unknown as SynthHandle & typeof synth;
};
// One track on channels 1 and 10 (index 0 and 9).
const MIDI = parseMidi(
  new Uint8Array([
    ...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0],
    ...[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 16],
    ...[0, 0x90, 60, 100, 0, 0x99, 36, 100, 0x83, 0x60, 0x80, 60, 0, 0, 0xff, 0x2f, 0].slice(0, 16),
  ]),
);

describe('MidiPlayer metronome clicks', () => {
  const note = { scoreMs: 0, downbeat: true, accent: true, countIn: false, key: HI, velocity: 127 };

  it('sets the metronome channel up at each start, and plays clicks on it at their exact time', () => {
    const synth = fakeSynth();
    const player = new MidiPlayer(synth, MIDI);
    expect(player.metronomeChannel).toBe(16);
    player.click(10.5, note, 1); // not started: ignored
    expect(synth.sent).toEqual([]);
    player.start(0);
    expect(synth.drums).toEqual([16]);
    expect(synth.sent.filter((s) => s.channel === 16).map((s) => s.message)).toEqual(metronomeSetupMessages(16));
    synth.sent.length = 0;
    player.click(10.5, note, 0.5);
    expect(synth.sent).toEqual([
      { message: [0x90, HI, 127], channel: 16, time: 10.5 },
      { message: [0x80, HI, 0], channel: 16, time: 10.5 + CLICK_LENGTH_S },
    ]);
    expect(synth.gains.get(16)).toBeCloseTo(0.25); // fader curve
    player.click(9, note, 0.5); // late: played now rather than dropped
    expect(synth.sent.at(-2)?.time).toBe(10);
  });

  it('switched off while playing: mutes the queued clicks, then restores the volume after the last one', () => {
    const synth = fakeSynth();
    const player = new MidiPlayer(synth, MIDI);
    player.start(0);
    player.click(10.1, note, 1);
    synth.sent.length = 0;
    player.cancelClicks();
    const [mute, cut, restore] = synth.sent;
    expect(mute).toEqual({ message: [0xb0, 7, 0], channel: 16, time: 10 });
    expect(cut?.message).toEqual([0xb0, 120, 0]);
    expect(cut!.time).toBeGreaterThan(10.1 + CLICK_LENGTH_S);
    expect(restore?.message).toEqual([0xb0, 7, 127]);
    expect(restore!.time).toBeGreaterThan(cut!.time);
  });

  it('stop silences the metronome channel with the score channels, its clicks included', () => {
    const synth = fakeSynth();
    const player = new MidiPlayer(synth, MIDI);
    player.start(0);
    player.click(11, note, 1);
    player.stop();
    expect(synth.silenced).toEqual([[0, 9, 16]]);
    expect(player.readyAt).toBeCloseTo(11 + CLICK_LENGTH_S + 0.05);
  });
});

// --- PlaybackEngine routing ---
const ctx = {
  currentTime: 100,
  outputLatency: 0,
  baseLatency: 0,
  destination: {},
  resume: () => Promise.resolve(),
  oscillators: [] as { t: number; f: number }[],
  createOscillator() {
    const osc = { frequency: { value: 0 }, connect: (n: unknown) => n, start: (t: number) => this.oscillators.push({ t, f: osc.frequency.value }), stop: () => undefined, onended: null };
    return osc;
  },
  createGain: () => ({ gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined }, connect: (n: unknown) => n }),
};
vi.mock('./audioContext', () => ({
  acquireAudioContext: () => ctx,
  releaseAudioContext: () => undefined,
  outputLatencyOf: () => 0,
}));
const { PlaybackEngine } = await import('../playback/playbackEngine');

describe('PlaybackEngine: metronome through the synth with the sound on', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    ctx.currentTime = 100;
    ctx.oscillators = [];
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const source = () => {
    const s = {
      readyAt: 0,
      clicks: [] as { t: number; key: number; countIn: boolean }[],
      noteTimes: [] as number[],
      cancelled: 0,
      started: [] as number[],
      start(ms: number) {
        this.started.push(ms);
      },
      // The notes of the score: one per beat of 500 ms, at the time the engine gives.
      schedule(until: number, timeOf: (ms: number) => number) {
        for (let ms = this.noteTimes.length * 500; ms < until; ms += 500) this.noteTimes.push(timeOf(ms));
      },
      stop: () => undefined,
      click(t: number, n: { key: number; countIn: boolean }) {
        this.clicks.push({ t, key: n.key, countIn: n.countIn });
      },
      cancelClicks() {
        this.cancelled++;
      },
    };
    return s as typeof s & ScoreAudioSource;
  };
  const opts = { startEventIndex: 0, countInMeasures: 1, tempoFactor: 0.8, metronome: true, countInSound: true, volume: 0.7, sound: true };
  /** Time goes by in steps of the scheduler interval (25 ms). */
  const advance = (s: number) => {
    for (let i = 0; i < Math.round(s / 0.025); i++) {
      ctx.currentTime += 0.025;
      vi.advanceTimersByTime(25);
    }
  };

  it('sends count-in and beat clicks to the synth, at the same times as the notes of the same beats', async () => {
    const engine = new PlaybackEngine(TL, { onFrame: () => undefined, onBeat: () => undefined, onEnd: () => undefined });
    const audio = source();
    engine.setAudio(audio, true);
    await engine.play(opts);
    advance(6);
    expect(ctx.oscillators).toEqual([]); // no Web Audio click
    const countIn = audio.clicks.filter((c) => c.countIn);
    expect(countIn.map((c) => c.key)).toEqual([HI, LO, LO, LO]);
    const beats = audio.clicks.filter((c) => !c.countIn);
    expect(beats.length).toBeGreaterThan(3);
    // Same time base: each beat click has the time of the note of that beat, to the µs.
    beats.forEach((c, i) => expect(c.t).toBeCloseTo(audio.noteTimes[i]!, 6));
    // Count-in clicks, 500 ms of score apart at 80 %: 0.625 s, the last one a beat before the music.
    expect(countIn[1]!.t - countIn[0]!.t).toBeCloseTo(0.625, 6);
    expect(beats[0]!.t - countIn[3]!.t).toBeCloseTo(0.625, 6);
    engine.dispose();
  });

  it('metronome off while playing: the queued synth clicks are cancelled and no more are sent', async () => {
    const engine = new PlaybackEngine(TL, { onFrame: () => undefined, onBeat: () => undefined, onEnd: () => undefined });
    const audio = source();
    engine.setAudio(audio, true);
    await engine.play({ ...opts, countInMeasures: 0 });
    advance(1);
    const n = audio.clicks.length;
    engine.setMetronome(false);
    expect(audio.cancelled).toBe(1);
    advance(2);
    expect(audio.clicks.length).toBe(n);
    engine.dispose();
  });

  it('sound off: Web Audio clicks; sound switched on while playing: the clicks move to the synth', async () => {
    const engine = new PlaybackEngine(TL, { onFrame: () => undefined, onBeat: () => undefined, onEnd: () => undefined });
    const audio = source();
    engine.setAudio(audio, false);
    await engine.play({ ...opts, countInMeasures: 0, sound: false });
    advance(1);
    expect(ctx.oscillators.length).toBeGreaterThan(0);
    expect(audio.clicks).toEqual([]);
    const oscillators = ctx.oscillators.length;
    engine.setAudio(audio, true);
    advance(2);
    expect(audio.clicks.length).toBeGreaterThan(2);
    expect(ctx.oscillators.length).toBe(oscillators);
    // No click twice: the synth clicks start after the last oscillator click heard.
    const lastOsc = ctx.oscillators.at(-1)!.t;
    expect(audio.clicks[0]!.t).toBeGreaterThan(lastOsc);
    engine.dispose();
  });
});
