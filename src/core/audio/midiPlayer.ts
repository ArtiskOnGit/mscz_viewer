// Score audio on the playback clock (ADR-026): MIDI events are sent to the synth ahead of time with their exact
// AudioContext time, by the same lookahead scheduler as the metronome clicks (PlaybackEngine). MIDI time = timeline
// time (both from webmscore with repeats unfolded), so no separate sequencer clock can drift.
// The metronome clicks go through the same synth when the sound is on (dedicated drum channel, core/audio/metronome.ts):
// a click and a note of the same beat are sent with the same time and start in the same render block.
import type { MidiFile } from './midiFile';
import { chaseMessages, firstEventAt, messageOf, usedChannels } from './midiSchedule';
import { CLICK_LENGTH_S, clickMessages, metronomeChannelFor, metronomeSetupMessages, metronomeVolumeMessage, type MetronomeNote } from './metronome';
import { faderGain } from './mixer';
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
  /**
   * Plays a metronome click at `t` (AudioContext seconds) on the same path and clock as the notes. `volume` 0..1
   * (slider position). Only between start() and stop().
   */
  click?(t: number, note: MetronomeNote, volume: number): void;
  /** The clicks already sent must not be heard (metronome switched off while playing). */
  cancelClicks?(): void;
}

/** Linear gain of the metronome channel at 100 %: the wood blocks are about as loud as the music at full volume. */
const CLICK_GAIN = 1;

export class MidiPlayer implements ScoreAudioSource {
  private cursor = 0;
  private queuedUntil = 0;
  private ready = 0;
  private running = false;
  private readonly channels: number[];
  /** Score channels + the metronome channel (silenced together). */
  private readonly allChannels: number[];
  readonly metronomeChannel: number;
  private clicksQueuedUntil = 0;
  private clickVolume: number | undefined;

  constructor(
    private readonly synth: SynthHandle,
    private readonly midi: MidiFile,
  ) {
    this.channels = usedChannels(midi.events);
    this.metronomeChannel = metronomeChannelFor(this.channels);
    this.allChannels = [...this.channels, this.metronomeChannel];
  }

  get readyAt(): number {
    return this.ready;
  }

  start(fromScoreMs: number): void {
    if (this.running) this.stop();
    // After the messages of the previous run still queued in the synth (they end before `ready`).
    const at = Math.max(this.synth.ctx.currentTime, this.ready - 0.005);
    for (const { channel, message } of chaseMessages(this.midi.events, fromScoreMs, this.channels)) this.synth.send(message, channel, at);
    this.synth.setDrums(this.metronomeChannel);
    for (const message of metronomeSetupMessages(this.metronomeChannel)) this.synth.send(message, this.metronomeChannel, at);
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

  click(t: number, note: MetronomeNote, volume: number): void {
    if (!this.running) return;
    if (volume !== this.clickVolume) {
      this.clickVolume = volume;
      this.synth.setChannelGain(this.metronomeChannel, faderGain(volume) * CLICK_GAIN);
    }
    const at = Math.max(t, this.synth.ctx.currentTime);
    const { on, off } = clickMessages(this.metronomeChannel, note);
    this.synth.send(on, this.metronomeChannel, at);
    this.synth.send(off, this.metronomeChannel, at + CLICK_LENGTH_S);
    this.clicksQueuedUntil = Math.max(this.clicksQueuedUntil, at + CLICK_LENGTH_S);
    this.queuedUntil = Math.max(this.queuedUntil, at + CLICK_LENGTH_S);
  }

  cancelClicks(): void {
    if (!this.running) return;
    // Queued messages cannot be removed from the synth: the channel is muted now, its sound cut once the last queued
    // click is over, then its volume restored (timed messages, in order) for the clicks to come.
    const ch = this.metronomeChannel;
    const now = this.synth.ctx.currentTime;
    const after = Math.max(now, this.clicksQueuedUntil) + 0.002;
    this.synth.send(metronomeVolumeMessage(ch, false), ch, now);
    this.synth.send([0xb0 | (ch & 0x0f), 120, 0], ch, after); // all sound off
    this.synth.send(metronomeVolumeMessage(ch, true), ch, after + 0.001);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.ready = this.synth.silence(this.allChannels, this.queuedUntil);
  }
}
