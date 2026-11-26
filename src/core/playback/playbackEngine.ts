// Auto-scroll clock + metronome, on the Web Audio clock (SPECIFICATIONS_TECHNIQUES §6).
// - Clicks are scheduled ~120 ms ahead with osc.start(t) ("lookahead scheduler"): never from setTimeout.
// - The UI reads the same clock in requestAnimationFrame (current measure, page turns, beat flashes).
import type { Timeline } from '../model/types';
import { eventIndexAt } from '../timeline/timeline';
import { PlaybackClock } from './clock';
import { clicksFrom, countInClicks, countInDurationMs, type Click } from './clicks';

const LOOKAHEAD_S = 0.12;
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
    this.ctx ??= new AudioContext({ latencyHint: 'interactive' });
    await this.ctx.resume();
    const ctx = this.ctx;
    const first = this.timeline.events[opts.startEventIndex];
    if (!first) return;
    this.startMs = first.startMs;
    this.clock = new PlaybackClock({ now: () => ctx.currentTime });
    this.clock.setTempoFactor(opts.tempoFactor);
    const leadIn = countInDurationMs(this.timeline, opts.startEventIndex, opts.countInMeasures);
    this.clock.start(this.startMs - leadIn, START_DELAY_S);
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

  dispose(): void {
    this.pause();
    void this.ctx?.close();
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
    while (this.flashes.length && this.flashes[0]!.t <= ctx.currentTime) {
      const f = this.flashes.shift()!;
      this.cb.onBeat(f.accent, f.countIn);
    }
    const ms = clock.scoreMs();
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
