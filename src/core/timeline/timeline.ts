// Playing-order timeline (repeats unfolded), used by auto-scroll and the metronome. See ADR-008.
import type { TimeSignature, Timeline, TimelineEvent } from '../model/types';

/** Output of webmscore `savePositions(false)` (only the fields we use). */
export interface WebMscorePositions {
  events: { elid: number; position: number }[];
}

const DEFAULT_TIME_SIG: TimeSignature = { beats: 4, beatType: 4 };

/**
 * Build a timeline from MuseScore measure positions.
 * @param timeSigs time signature of each measure, by measure index (see readTimeSignatures)
 * @param totalMs total duration of the score (webmscore metadata `duration` × 1000), used for the last event
 */
export function timelineFromWebMscore(positions: WebMscorePositions, timeSigs: readonly TimeSignature[], totalMs?: number): Timeline {
  const raw = positions.events;
  const events: TimelineEvent[] = raw.map((e, i) => {
    const next = raw[i + 1];
    let durationMs: number;
    if (next && next.position > e.position) durationMs = next.position - e.position;
    else if (!next && totalMs !== undefined && totalMs > e.position) durationMs = totalMs - e.position;
    else durationMs = estimateFromPrevious(raw, i, timeSigs);
    return {
      measureIndex: e.elid,
      startMs: e.position,
      durationMs,
      timeSig: timeSigs[e.elid] ?? DEFAULT_TIME_SIG,
    };
  });
  const last = events.at(-1);
  return { source: 'webmscore', events, totalMs: last ? last.startMs + last.durationMs : 0 };
}

/** Same beat duration as the previous measure, scaled to this measure's time signature. */
function estimateFromPrevious(raw: WebMscorePositions['events'], i: number, timeSigs: readonly TimeSignature[]): number {
  const cur = raw[i];
  const prev = raw[i - 1];
  if (!cur || !prev || cur.position <= prev.position) return 2000;
  const prevSig = timeSigs[prev.elid] ?? DEFAULT_TIME_SIG;
  const curSig = timeSigs[cur.elid] ?? DEFAULT_TIME_SIG;
  const msPerWhole = (cur.position - prev.position) / (prevSig.beats / prevSig.beatType);
  return msPerWhole * (curSig.beats / curSig.beatType);
}

/** Index of the last event starting at or before `ms` (-1 before the start). */
export function eventIndexAt(timeline: Timeline, ms: number): number {
  const ev = timeline.events;
  let lo = 0;
  let hi = ev.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((ev[mid]?.startMs ?? Infinity) <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Time signature of every measure of the first part of a MusicXML document. */
export function readTimeSignatures(doc: Document): TimeSignature[] {
  const part = doc.getElementsByTagName('part')[0];
  if (!part) return [];
  let current = DEFAULT_TIME_SIG;
  return Array.from(part.childNodes)
    .filter((n): n is Element => n.nodeType === 1 && (n as Element).tagName === 'measure')
    .map((measure) => {
      const time = measure.getElementsByTagName('time')[0];
      if (time) {
        // Additive meters ("3+2") are summed.
        const beats = (time.getElementsByTagName('beats')[0]?.textContent ?? '4').split('+').reduce((a, b) => a + Number(b), 0);
        const beatType = Number(time.getElementsByTagName('beat-type')[0]?.textContent ?? 4);
        if (beats > 0 && beatType > 0) current = { beats, beatType };
      }
      return current;
    });
}

/** Metronome clicks per measure: compound meters (6/8, 9/8, 12/8) beat the dotted quarter. */
export function clicksPerMeasure(sig: TimeSignature): number {
  const compound = sig.beatType === 8 && sig.beats % 3 === 0 && sig.beats > 3;
  return compound ? sig.beats / 3 : sig.beats;
}
