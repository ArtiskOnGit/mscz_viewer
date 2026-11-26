// Auto-scroll clock + metronome, on the Web Audio clock (SPECIFICATIONS_TECHNIQUES §6).
// - Clicks are scheduled ~120 ms ahead with osc.start(t) ("lookahead scheduler"): never from setTimeout.
// - The UI reads the same clock in requestAnimationFrame (current measure, page turns, beat flashes), shifted by the
//   output latency so that the highlight matches what is heard.
// - Score audio (ADR-026): an optional ScoreAudioSource (MidiPlayer) is fed by the same scheduler, on the same clock.
import type { Timeline } from '../model/types';
import { eventIndexAt } from '../timeline/timeline';
import { PlaybackClock } from './clock';
import { clicksFrom, countInClicks, countInDurationMs, type Click } from './clicks';
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
  private clicks: Iterator<Click> | undefined;
  private nextClick: Click | undefined;
  private countIn: Click[] = [];
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
    this.countIn = countInClicks(this.timeline, opts.startEventIndex, opts.countInMeasures);
    this.resetClicks(this.startMs);
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
    if (this.clock.playing) {
      // Clicks already scheduled were computed with the old tempo.
      this.cancelScheduled();
      const now = this.clock.scoreMs();
      this.countIn = this.countIn.filter((c) => c.scoreMs >= now);
      this.resetClicks(Math.max(now, this.startMs));
    }
  }

  setMetronome(on: boolean, volume?: number): void {
    if (!this.opts) return;
    this.opts.metronome = on;
    if (volume !== undefined) this.opts.volume = volume;
    if (!on) this.cancelScheduled((s) => s.t > (this.ctx?.currentTime ?? 0));
  }

  /**
   * Score audio source (undefined = none). Changing it or `on` while playing starts/stops the sound at the current
   * position.
   */
  setAudio(source: ScoreAudioSource | undefined, on: boolean): void {
    const wasOn = !!(this.opts?.sound && this.audio);
    const changed = this.audio !== source;
    if (this.audio && changed) this.audio.stop();
    this.audio = source;
    if (this.opts) this.opts.sound = on;
    const clock = this.clock;
    if (!clock?.playing) return;
    if (on && source && (!wasOn || changed)) source.start(Math.max(this.startMs, clock.scoreMs()));
    else if (!on) source?.stop();
  }

  dispose(): void {
    this.pause();
    if (this.ctx) releaseAudioContext();
    this.ctx = undefined;
  }

  private resetClicks(fromMs: number) {
    this.clicks = clicksFrom(this.timeline, fromMs);
    this.nextClick = this.clicks.next().value ?? undefined;
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
    for (;;) {
      const isCountIn = this.countIn.length > 0;
      const click = isCountIn ? this.countIn[0] : this.nextClick;
      if (!click) return;
      const t = clock.timeOf(click.scoreMs);
      if (t > horizon) return;
      if (isCountIn) this.countIn.shift();
      else this.nextClick = this.clicks?.next().value ?? undefined;
      if (t < ctx.currentTime - 0.01) continue; // late (tab was frozen): skip, never play a burst
      if (opts.metronome || (isCountIn && opts.countInSound)) this.playClick(t, click.accent && opts.accent !== false, opts.volume);
      this.flashes.push({ t, accent: click.accent, countIn: isCountIn });
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
