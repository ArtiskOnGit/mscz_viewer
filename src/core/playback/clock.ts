// Playback clock: score time (ms at the original tempo) from a monotonic time source, with a tempo factor
// that can change while playing without jumps. The metronome and the auto-scroll read the SAME clock.

export interface TimeSource {
  /** Seconds, monotonic (AudioContext.currentTime or performance.now()/1000). */
  now(): number;
}

export class PlaybackClock {
  private anchorTime = 0;
  private anchorScoreMs = 0;
  private factor = 1;
  private running = false;

  constructor(private readonly source: TimeSource) {}

  get playing(): boolean {
    return this.running;
  }

  get tempoFactor(): number {
    return this.factor;
  }

  /** Start (or restart) at a score position. `delaySec` leaves room before the first event (scheduling, count-in). */
  start(scoreMs: number, delaySec = 0): void {
    this.anchorScoreMs = scoreMs;
    this.anchorTime = this.source.now() + delaySec;
    this.running = true;
  }

  stop(): number {
    const pos = this.scoreMs();
    this.running = false;
    this.anchorScoreMs = pos;
    return pos;
  }

  setTempoFactor(factor: number): void {
    if (this.running) {
      this.anchorScoreMs = this.scoreMs();
      this.anchorTime = Math.max(this.anchorTime, this.source.now());
    }
    this.factor = factor;
  }

  /** Current score position in ms (may be negative during the lead-in). */
  scoreMs(): number {
    if (!this.running) return this.anchorScoreMs;
    return this.anchorScoreMs + (this.source.now() - this.anchorTime) * 1000 * this.factor;
  }

  /** Time-source time (s) at which a score position will be reached. */
  timeOf(scoreMs: number): number {
    return this.anchorTime + (scoreMs - this.anchorScoreMs) / 1000 / this.factor;
  }
}
