// Auto-scroll clock + metronome, on the Web Audio clock (SPECIFICATIONS_TECHNIQUES §6).
// - Clicks are scheduled ~120 ms ahead with osc.start(t) ("lookahead scheduler"): never from setTimeout.
// - The UI reads the same clock in requestAnimationFrame (current measure, page turns, beat flashes), shifted by the
//   output latency so that the highlight matches what is heard.
// - Score audio (ADR-026): an optional ScoreAudioSource (MidiPlayer) is fed by the same scheduler, on the same clock.
// - Sound on: the clicks are played BY THE SYNTH (ScoreAudioSource.click, dedicated drum channel), in the same message
//   queue as the notes, so that they cannot drift apart (owner's report of 2026-11-28). Sound off (silent auto-scroll,
//   "metronome only"): Web Audio oscillators. Both follow the same click stream (core/audio/metronome.ts) and the
//   beat dot flashes at the time each click is heard.
import type { Timeline } from '../model/types';
import { eventIndexAt } from '../timeline/timeline';
import { PlaybackClock } from './clock';
import { countInDurationMs } from './clicks';
import { metronomeNotes, type MetronomeNote } from '../audio/metronome';
import { acquireAudioContext, outputLatencyOf, releaseAudioContext } from '../audio/audioContext';
import type { ScoreAudioSource } from '../audio/midiPlayer';

const LOOKAHEAD_S = 0.12;
/** Notes are sent further ahead: they cross to the synth's AudioWorklet and may hold many events. */
const AUDIO_LOOKAHEAD_S = 0.2;
const SCHEDULER_INTERVAL_MS = 25;
const START_DELAY_S = 0.15;

export interface PlaybackCallbacks {
  /** Every frame: index of the current timeline event (-1 during the count-in) and progress in it (0..1). */
  onFrame(eventIndex: number, progress: number): void;
  onBeat(accent: boolean, countIn: boolean): void;
  onEnd(): void;
}

export interface PlayOptions {
  startEventIndex: number;
  countInMeasures: number;
  tempoFactor: number;
  metronome: boolean;
  /** Count-in clicks are audible even when the metronome is off. */
  countInSound: boolean;
  volume: number;
  /** Higher click on the first beat of each bar (default true). */
  accent?: boolean;
  /** Play the score audio (if an audio source is set). */
  sound?: boolean;
}

export class PlaybackEngine {
  private ctx: AudioContext | undefined;
  private clock: PlaybackClock | undefined;
  private clicks: Iterator<MetronomeNote> | undefined;
  private nextClick: MetronomeNote | undefined;
  private startEventIndex = 0;
  private scheduled: { osc: OscillatorNode; t: number }[] = [];
  private flashes: { t: number; accent: boolean; countIn: boolean }[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private raf = 0;
  private opts: PlayOptions | undefined;
  private startMs = 0;
  private audio: ScoreAudioSource | undefined;
  private latency = 0;

  constructor(
    private readonly timeline: Timeline,
    private readonly cb: PlaybackCallbacks,
  ) {}

  get playing(): boolean {
    return !!this.clock?.playing;
  }

  /** Must be called from a user gesture (audio unlock). */
  async play(opts: PlayOptions): Promise<void> {
    this.stopTimers();
    this.opts = { ...opts };
    this.ctx ??= acquireAudioContext();
    await this.ctx.resume();
    const ctx = this.ctx;
    this.latency = outputLatencyOf(ctx);
    const first = this.timeline.events[opts.startEventIndex];
    if (!first) return;
    this.startMs = first.startMs;
    this.clock = new PlaybackClock({ now: () => ctx.currentTime });
    this.clock.setTempoFactor(opts.tempoFactor);
    const leadIn = countInDurationMs(this.timeline, opts.startEventIndex, opts.countInMeasures);
    // After a stop, the audio of the previous run is still being silenced for a few ms.
    const audio = opts.sound ? this.audio : undefined;
    this.clock.start(this.startMs - leadIn, Math.max(START_DELAY_S, (audio?.readyAt ?? 0) - ctx.currentTime + 0.01));
    audio?.start(this.startMs);
    this.startEventIndex = opts.startEventIndex;
    this.resetClicks(-Infinity);
    this.timer = setInterval(() => this.schedule(), SCHEDULER_INTERVAL_MS);
    this.schedule();
    const frame = () => {
      this.frame();
      if (this.clock?.playing) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Stops and returns the timeline event reached. */
  pause(): number {
    const pos = this.clock?.stop() ?? 0;
    this.stopTimers();
    this.cancelScheduled();
    this.audio?.stop();
    this.flashes = [];
    return Math.max(0, eventIndexAt(this.timeline, pos));
  }

  setTempoFactor(factor: number): void {
    if (this.opts) this.opts.tempoFactor = factor;
    if (!this.clock) return;
    this.clock.setTempoFactor(factor);
    // Oscillator clicks already scheduled were computed with the old tempo: scheduled again. Clicks sent to the synth
    // cannot be taken back: they are kept, like the notes sent with them (same times), and the next ones follow.
    if (this.clock.playing && !this.clicksViaSynth()) this.rescheduleClicks();
  }

  setMetronome(on: boolean, volume?: number): void {
    if (!this.opts) return;
    this.opts.metronome = on;
    if (volume !== undefined) this.opts.volume = volume;
    if (!on) {
      this.cancelScheduled((s) => s.t > (this.ctx?.currentTime ?? 0));
      if (this.clicksViaSynth()) this.audio?.cancelClicks?.();
    }
  }

  /**
   * Score audio source (undefined = none). Changing it or `on` while playing starts/stops the sound at the current
   * position.
   */
  setAudio(source: ScoreAudioSource | undefined, on: boolean): void {
    const wasOn = !!(this.opts?.sound && this.audio);
    const viaSynthBefore = this.clicksViaSynth();
    const changed = this.audio !== source;
    if (this.audio && changed) this.audio.stop();
    this.audio = source;
    if (this.opts) this.opts.sound = on;
    const clock = this.clock;
    if (!clock?.playing) return;
    if (on && source && (!wasOn || changed)) source.start(Math.max(this.startMs, clock.scoreMs()));
    else if (!on) source?.stop();
    // The clicks change path: the ones already scheduled on the other path (cut by stop(), or oscillators) are
    // scheduled again on the new one from now.
    if (viaSynthBefore !== this.clicksViaSynth() || changed) this.rescheduleClicks();
  }

  dispose(): void {
    this.pause();
    if (this.ctx) releaseAudioContext();
    this.ctx = undefined;
  }

  private resetClicks(fromMs: number) {
    this.clicks = metronomeNotes(this.timeline, this.startEventIndex, this.opts?.countInMeasures ?? 0, { accent: this.opts?.accent, fromMs });
    this.nextClick = this.clicks.next().value ?? undefined;
  }

  /** Sound on with a source that plays clicks: the metronome goes through the synth. */
  private clicksViaSynth(): boolean {
    return !!(this.opts?.sound && this.audio?.click);
  }

  /** Cancels the oscillator clicks not heard yet and restarts the click stream at the current position. */
  private rescheduleClicks() {
    const ctx = this.ctx;
    const clock = this.clock;
    if (!ctx || !clock?.playing) return;
    this.cancelScheduled((s) => s.t > ctx.currentTime);
    this.flashes = this.flashes.filter((f) => f.t <= ctx.currentTime);
    this.resetClicks(clock.scoreMs());
  }

  private schedule() {
    const ctx = this.ctx;
    const clock = this.clock;
    const opts = this.opts;
    if (!ctx || !clock?.playing || !opts) return;
    if (opts.sound && this.audio) {
      const until = clock.scoreMsAt(ctx.currentTime + AUDIO_LOOKAHEAD_S);
      this.audio.schedule(until, (ms) => clock.timeOf(ms), ctx.currentTime);
    }
    const horizon = ctx.currentTime + LOOKAHEAD_S;
    const viaSynth = this.clicksViaSynth();
    for (;;) {
      const click = this.nextClick;
      if (!click) return;
      const t = clock.timeOf(click.scoreMs);
      if (t > horizon) return;
      this.nextClick = this.clicks?.next().value ?? undefined;
      if (t < ctx.currentTime - 0.01) continue; // late (tab was frozen): skip, never play a burst
      if (opts.metronome || (click.countIn && opts.countInSound)) {
        if (viaSynth) this.audio!.click!(t, click, opts.volume);
        else this.playClick(t, click.accent, opts.volume);
      }
      this.flashes.push({ t, accent: click.downbeat, countIn: click.countIn });
    }
  }

  private playClick(t: number, accent: boolean, volume: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1760 : 1175;
    const peak = Math.max(0.0002, Math.min(1, volume));
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
    this.scheduled.push({ osc, t });
    osc.onended = () => {
      this.scheduled = this.scheduled.filter((s) => s.osc !== osc);
    };
  }

  private cancelScheduled(filter: (s: { osc: OscillatorNode; t: number }) => boolean = () => true) {
    for (const s of this.scheduled.filter(filter)) {
      try {
        s.osc.stop();
      } catch {
        /* already stopped */
      }
    }
    this.scheduled = this.scheduled.filter((s) => !filter(s));
  }

  private frame() {
    const ctx = this.ctx;
    const clock = this.clock;
    if (!ctx || !clock) return;
    // What is heard now was scheduled `latency` ago.
    const heard = ctx.currentTime - this.latency;
    while (this.flashes.length && this.flashes[0]!.t <= heard) {
      const f = this.flashes.shift()!;
      this.cb.onBeat(f.accent, f.countIn);
    }
    const ms = clock.scoreMsAt(heard);
    if (ms < this.startMs) {
      this.cb.onFrame(-1, 0);
      return;
    }
    const i = eventIndexAt(this.timeline, ms);
    const ev = this.timeline.events[i];
    if (!ev || ms >= this.timeline.totalMs + 300) {
      this.pause();
      this.cb.onEnd();
      return;
    }
    this.cb.onFrame(i, Math.min(1, (ms - ev.startMs) / ev.durationMs));
  }

  private stopTimers() {
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.timer = undefined;
  }
}
