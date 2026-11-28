// Metronome played BY THE SYNTH when the score sound is on (ADR-026, sync fix of 2026-11-28): the clicks are MIDI
// notes on a dedicated drum channel, sent with the score's notes, through the same message queue and on the same
// clock, so that a click and the note played on the same beat start in the same render block of the synth.
// Pure (unit-tested in audio.test.ts); MidiPlayer sends the messages, PlaybackEngine decides when.
import type { Click } from '../playback/clicks';
import type { Timeline } from '../model/types';
import { clicksFrom, countInClicks } from '../playback/clicks';

/**
 * General MIDI drum keys of the clicks: High / Low Wood Block (FluidR3Mono's Standard kit, bank 128 program 0, has
 * them, like any GM bank; dry and short, they cut through a brass band). The Standard kit also has 33/34 "Metronome
 * Click / Bell", but they are GS additions, missing from many GM banks (ADR-026: any GM bank can replace FluidR3Mono).
 */
export const METRONOME_KEYS = { accent: 76, beat: 77 } as const;
const VELOCITY = { accent: 127, beat: 110 } as const;
/** Note length of a click (s): longer than the wood block sample's decay, short enough at any tempo. */
export const CLICK_LENGTH_S = 0.08;

/**
 * Dedicated MIDI channel of the metronome: the first one after the score's channels and after the 16 of the first
 * port, never the score's drum channel 10. Its offset (port) is sent apart, like the score's channels past 16.
 */
export function metronomeChannelFor(scoreChannels: readonly number[]): number {
  return Math.max(15, ...scoreChannels) + 1;
}

/**
 * Channel setup sent before each start, after the drum flag is set (SynthHandle.setDrums; no bank select and no
 * "reset all controllers", which could clear it): standard kit, full volume and expression, centred, dry (no
 * reverb or chorus send: a clear, precise click).
 */
export function metronomeSetupMessages(channel: number): number[][] {
  const cc = 0xb0 | (channel & 0x0f);
  return [
    [0xc0 | (channel & 0x0f), 0], // Standard kit
    [cc, 7, 127], // volume
    [cc, 11, 127], // expression
    [cc, 10, 64], // pan
    [cc, 91, 0], // reverb send
    [cc, 93, 0], // chorus send
  ];
}

/** Channel volume message: 0 mutes the clicks already queued (metronome switched off), 127 restores. */
export const metronomeVolumeMessage = (channel: number, on: boolean): number[] => [0xb0 | (channel & 0x0f), 7, on ? 127 : 0];

export interface MetronomeNote {
  /** Score time (ms at the original tempo; before the start position for the count-in). */
  scoreMs: number;
  /** First beat of the bar (the beat dot flashes it, whatever the accent setting). */
  downbeat: boolean;
  /** Accented click (first beat of the bar, accent enabled). */
  accent: boolean;
  countIn: boolean;
  key: number;
  velocity: number;
}

/** Note on / note off of a click on the metronome channel (status channel = channel mod 16). */
export function clickMessages(channel: number, note: Pick<MetronomeNote, 'key' | 'velocity'>): { on: number[]; off: number[] } {
  const c = channel & 0x0f;
  return { on: [0x90 | c, note.key, note.velocity], off: [0x80 | c, note.key, 0] };
}

/**
 * The metronome "track" of a playback from a timeline event: the count-in clicks (first measure's meter and
 * duration), then a click on every beat in playing order (meter changes, dotted-quarter beats in compound meters,
 * tempo changes through the measure durations, repeats unfolded), accent on beat 1 (unless `accent` is false).
 * Starts at the first click at or after `fromMs` (restart after a tempo change). Lazy: playback reads it as it goes.
 * The engine sends the same clicks to the synth (sound on) or to the Web Audio oscillator (sound off).
 */
export function* metronomeNotes(
  timeline: Timeline,
  startEventIndex: number,
  countInMeasures: number,
  opts: { accent?: boolean; fromMs?: number } = {},
): Generator<MetronomeNote> {
  const start = timeline.events[startEventIndex];
  if (!start) return;
  const fromMs = opts.fromMs ?? -Infinity;
  const note = (c: Click, countIn: boolean): MetronomeNote => {
    const accent = opts.accent !== false && c.accent;
    return { scoreMs: c.scoreMs, downbeat: c.accent, accent, countIn, key: accent ? METRONOME_KEYS.accent : METRONOME_KEYS.beat, velocity: accent ? VELOCITY.accent : VELOCITY.beat };
  };
  for (const c of countInClicks(timeline, startEventIndex, countInMeasures)) if (c.scoreMs + 1e-6 >= fromMs) yield note(c, true);
  for (const c of clicksFrom(timeline, Math.max(start.startMs, fromMs))) yield note(c, false);
}
