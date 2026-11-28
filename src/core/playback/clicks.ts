// Metronome click positions (score ms), derived from the playing-order timeline (repeats unfolded).
import type { Timeline, TimelineEvent } from '../model/types';
import { beatMs, clicksPerMeasure } from '../timeline/timeline';

export interface Click {
  scoreMs: number;
  /** First beat of the measure. */
  accent: boolean;
  eventIndex: number;
  beat: number;
}

/**
 * Beats of a measure, as offsets from its start (ms) with their beat number (0 = first beat of the bar). A full
 * measure: every beat. An incomplete one (TimelineEvent.fill): the beats it contains at the tempo's beat length,
 * counted from its end for a pickup (a 1-beat pickup in 4/4 clicks once, on beat 4, a beat before the next bar),
 * from its start otherwise (short last bar, first half of a split bar).
 */
export function measureBeats(ev: TimelineEvent): { offsetMs: number; beat: number }[] {
  const n = clicksPerMeasure(ev.timeSig);
  if (ev.fill === undefined) return Array.from({ length: n }, (_, b) => ({ offsetMs: (b * ev.durationMs) / n, beat: b }));
  const beat = beatMs(ev);
  const eps = beat * 0.02;
  const out: { offsetMs: number; beat: number }[] = [];
  if (ev.fromEnd) {
    for (let k = 1; ev.durationMs - k * beat > -eps && k <= n; k++) out.unshift({ offsetMs: Math.max(0, ev.durationMs - k * beat), beat: n - k });
  } else {
    for (let b = 0; b * beat < ev.durationMs - eps && b < n; b++) out.push({ offsetMs: b * beat, beat: b });
  }
  return out;
}

/** Clicks starting at the first click >= fromMs (lazy: playback reads them as it goes). */
export function* clicksFrom(timeline: Timeline, fromMs: number): Generator<Click> {
  const events = timeline.events;
  for (let e = 0; e < events.length; e++) {
    const ev = events[e]!;
    if (ev.startMs + ev.durationMs <= fromMs) continue;
    for (const { offsetMs, beat } of measureBeats(ev)) {
      const scoreMs = ev.startMs + offsetMs;
      if (scoreMs + 1e-6 < fromMs) continue;
      yield { scoreMs, accent: beat === 0, eventIndex: e, beat };
    }
  }
}

/**
 * Start of the count-in (score ms, before the start measure): `measures` full bars of the start measure's meter at
 * the tempo's beat (beatMs: a pickup does not squeeze them), ending where the start measure's bar would begin if it
 * were complete. Starting on a pickup, the count-in therefore also beats the missing beats of the pickup bar, on
 * the same grid: a 1-beat pickup in 4/4 with one bar of count-in is "1 2 3 4 | 1 2 3", then the pickup on 4.
 */
function countInStartMs(ev: TimelineEvent, measures: number): number {
  const n = clicksPerMeasure(ev.timeSig);
  const beat = beatMs(ev);
  const barStart = ev.fill !== undefined && ev.fromEnd ? ev.startMs + ev.durationMs - n * beat : ev.startMs;
  return barStart - measures * n * beat;
}

/** Count-in clicks before the start measure (see countInStartMs); accent on the first beat of each bar. */
export function countInClicks(timeline: Timeline, startEventIndex: number, measures: number): Click[] {
  const ev = timeline.events[startEventIndex];
  if (!ev || measures <= 0) return [];
  const n = clicksPerMeasure(ev.timeSig);
  const beat = beatMs(ev);
  const from = countInStartMs(ev, measures);
  const out: Click[] = [];
  for (let i = 0; from + i * beat < ev.startMs - beat * 0.02; i++) out.push({ scoreMs: from + i * beat, accent: i % n === 0, eventIndex: -1, beat: i % n });
  return out;
}

/** Duration of the count-in in score ms. */
export function countInDurationMs(timeline: Timeline, startEventIndex: number, measures: number): number {
  const ev = timeline.events[startEventIndex];
  return ev && measures > 0 ? ev.startMs - countInStartMs(ev, measures) : 0;
}
