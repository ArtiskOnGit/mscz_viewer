// Metronome click positions (score ms), derived from the playing-order timeline (repeats unfolded).
import type { Timeline } from '../model/types';
import { clicksPerMeasure } from '../timeline/timeline';

export interface Click {
  scoreMs: number;
  /** First beat of the measure. */
  accent: boolean;
  eventIndex: number;
  beat: number;
}

/** Clicks starting at the first click >= fromMs (lazy: playback reads them as it goes). */
export function* clicksFrom(timeline: Timeline, fromMs: number): Generator<Click> {
  const events = timeline.events;
  for (let e = 0; e < events.length; e++) {
    const ev = events[e]!;
    if (ev.startMs + ev.durationMs <= fromMs) continue;
    const n = clicksPerMeasure(ev.timeSig);
    for (let b = 0; b < n; b++) {
      const scoreMs = ev.startMs + (b * ev.durationMs) / n;
      if (scoreMs + 1e-6 < fromMs) continue;
      yield { scoreMs, accent: b === 0, eventIndex: e, beat: b };
    }
  }
}

/** Count-in clicks before `startMs`: `measures` measures with the first measure's meter and duration. */
export function countInClicks(timeline: Timeline, startEventIndex: number, measures: number): Click[] {
  const ev = timeline.events[startEventIndex];
  if (!ev || measures <= 0) return [];
  const n = clicksPerMeasure(ev.timeSig);
  const beatMs = ev.durationMs / n;
  const total = n * measures;
  return Array.from({ length: total }, (_, i) => ({
    scoreMs: ev.startMs - (total - i) * beatMs,
    accent: i % n === 0,
    eventIndex: -1,
    beat: i % n,
  }));
}

/** Duration of the count-in in score ms. */
export function countInDurationMs(timeline: Timeline, startEventIndex: number, measures: number): number {
  const ev = timeline.events[startEventIndex];
  return ev && measures > 0 ? ev.durationMs * measures : 0;
}
