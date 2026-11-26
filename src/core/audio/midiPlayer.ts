// Score audio on the playback clock (ADR-026): MIDI events are sent to the synth ahead of time with their exact
// AudioContext time, by the same lookahead scheduler as the metronome clicks (PlaybackEngine). MIDI time = timeline
// time (both from webmscore with repeats unfolded), so no separate sequencer clock can drift.
import type { MidiFile } from './midiFile';
import { chaseMessages, firstEventAt, messageOf, usedChannels } from './midiSchedule';
import type { SynthHandle } from './synth';

/** A note scheduled this late (main thread frozen) is dropped rather than played out of time. */
const LATE_NOTE_S = 0.06;

/** What PlaybackEngine needs from a sound source that follows the score. */
export interface ScoreAudioSource {
  /** Earliest AudioContext time at which a new start is heard (after the silence of the previous stop). */
  readonly readyAt: number;
  /** Prepares playback from a score position (channel state as at that position). */
  start(fromScoreMs: number): void;
  /** Sends every event before `untilScoreMs`, at the time `timeOf` gives (AudioContext seconds). */
  schedule(untilScoreMs: number, timeOf: (scoreMs: number) => number, now: number): void;
  /** Silences now (pause, seek, end). */
  stop(): void;
}

export class MidiPlayer implements ScoreAudioSource {
  private cursor = 0;
  private queuedUntil = 0;
  private ready = 0;
  private running = false;
  private readonly channels: number[];

  constructor(
    private readonly synth: SynthHandle,
    private readonly midi: MidiFile,
  ) {
    this.channels = usedChannels(midi.events);
  }

  get readyAt(): number {
    return this.ready;
  }

  start(fromScoreMs: number): void {
    if (this.running) this.stop();
    const now = this.synth.ctx.currentTime;
    for (const { channel, message } of chaseMessages(this.midi.events, fromScoreMs, this.channels)) this.synth.send(message, channel, now);
    this.cursor = firstEventAt(this.midi.events, fromScoreMs);
    this.synth.open(this.ready);
    this.running = true;
  }

  schedule(untilScoreMs: number, timeOf: (scoreMs: number) => number, now: number): void {
    if (!this.running) return;
    const events = this.midi.events;
    for (; this.cursor < events.length; this.cursor++) {
      const e = events[this.cursor]!;
      if (e.ms >= untilScoreMs) break;
      const t = timeOf(e.ms);
      if (e.type === 0x90 && t < now - LATE_NOTE_S) continue; // late: skip the note (its note off is harmless)
      const at = Math.max(t, now);
      this.synth.send(messageOf(e), e.channel, at);
      if (at > this.queuedUntil) this.queuedUntil = at;
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.ready = this.synth.silence(this.channels, this.queuedUntil);
  }
}
