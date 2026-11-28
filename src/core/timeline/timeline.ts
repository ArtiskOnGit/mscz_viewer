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
 * @param fills incomplete measures, by measure index (see readMeasureFills)
 */
export function timelineFromWebMscore(positions: WebMscorePositions, timeSigs: readonly TimeSignature[], totalMs?: number, fills: readonly (MeasureFill | undefined)[] = []): Timeline {
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
      ...fills[e.elid],
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

export interface MeasureFill {
  fill: number;
  fromEnd: boolean;
}

/**
 * Incomplete measures of a MusicXML document, by measure index (undefined for a full measure): actual length (the
 * longest voice of any part: notes, <backup>, <forward>; grace notes take no time) over the length of the time
 * signature. A pickup (first measure) and the second half of a bar split in two (previous measure incomplete too,
 * together one bar) count their beats from their end; other incomplete measures (first half of a split bar, short
 * last bar) from their start.
 */
export function readMeasureFills(doc: Document): (MeasureFill | undefined)[] {
  const sigs = readTimeSignatures(doc);
  const actual: number[] = []; // in quarter notes, max over the parts
  for (const part of Array.from(doc.getElementsByTagName('part'))) {
    let divisions = 1;
    const measures = Array.from(part.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).tagName === 'measure');
    measures.forEach((measure, index) => {
      let pos = 0;
      let lastStart = 0;
      let max = 0;
      for (const el of Array.from(measure.childNodes)) {
        if (el.nodeType !== 1) continue;
        const e = el as Element;
        const duration = () => Number(childText(e, 'duration') ?? 0) || 0;
        if (e.tagName === 'attributes') {
          const d = Number(childText(e, 'divisions'));
          if (d > 0) divisions = d;
        } else if (e.tagName === 'note') {
          if (hasChild(e, 'grace')) continue;
          if (hasChild(e, 'chord')) max = Math.max(max, lastStart + duration());
          else {
            lastStart = pos;
            pos += duration();
          }
        } else if (e.tagName === 'backup') pos -= duration();
        else if (e.tagName === 'forward') pos += duration();
        max = Math.max(max, pos);
      }
      actual[index] = Math.max(actual[index] ?? 0, max / divisions);
    });
  }
  const fills = actual.map((quarters, i) => {
    const sig = sigs[i] ?? DEFAULT_TIME_SIG;
    const nominal = (4 * sig.beats) / sig.beatType;
    const fill = quarters / nominal;
    return quarters > 0 && fill < 0.999 ? fill : undefined;
  });
  return fills.map((fill, i) => {
    if (fill === undefined) return undefined;
    const prev = fills[i - 1];
    const secondHalf = i > 0 && prev !== undefined && Math.abs(prev + fill - 1) < 0.001 && !(i - 1 === 0); // not after a pickup
    return { fill, fromEnd: i === 0 || secondHalf };
  });
}

const childOf = (el: Element, tag: string) => Array.from(el.childNodes).find((n): n is Element => n.nodeType === 1 && (n as Element).tagName === tag);
const childText = (el: Element, tag: string) => childOf(el, tag)?.textContent ?? undefined;
const hasChild = (el: Element, tag: string) => !!childOf(el, tag);

/**
 * Duration of one metronome beat in a measure (ms at the original tempo): its duration over the beats it would have
 * if complete, so that a pickup or a short bar gives the beat of the tempo, not a squeezed one.
 */
export function beatMs(ev: TimelineEvent): number {
  return ev.durationMs / (clicksPerMeasure(ev.timeSig) * (ev.fill ?? 1));
}

/** Metronome clicks per measure: compound meters (6/8, 9/8, 12/8) beat the dotted quarter. */
export function clicksPerMeasure(sig: TimeSignature): number {
  const compound = sig.beatType === 8 && sig.beats % 3 === 0 && sig.beats > 3;
  return compound ? sig.beats / 3 : sig.beats;
}
