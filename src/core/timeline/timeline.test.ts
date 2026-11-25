import { describe, expect, it } from 'vitest';
import { clicksPerMeasure, eventIndexAt, readTimeSignatures, timelineFromWebMscore } from './timeline';
import { parseXml } from '../../test/xmlEnv';

const FOUR_FOUR = { beats: 4, beatType: 4 };
const THREE_FOUR = { beats: 3, beatType: 4 };

describe('timelineFromWebMscore', () => {
  // Measures 0,1,2 with a repeat of 1-2, at 120 bpm (2000 ms per 4/4 measure).
  const positions = { events: [0, 1, 2, 1, 2].map((elid, i) => ({ elid, position: i * 2000 })) };

  it('keeps the playing order (unfolded repeats) and computes durations', () => {
    const tl = timelineFromWebMscore(positions, [FOUR_FOUR, FOUR_FOUR, FOUR_FOUR], 10_000);
    expect(tl.events.map((e) => e.measureIndex)).toEqual([0, 1, 2, 1, 2]);
    expect(tl.events.map((e) => e.durationMs)).toEqual([2000, 2000, 2000, 2000, 2000]);
    expect(tl.totalMs).toBe(10_000);
  });

  it('estimates the last measure from the previous tempo when the total is unknown', () => {
    const tl = timelineFromWebMscore({ events: [{ elid: 0, position: 0 }, { elid: 1, position: 2000 }] }, [FOUR_FOUR, THREE_FOUR]);
    expect(tl.events[1]?.durationMs).toBe(1500);
  });
});

describe('eventIndexAt', () => {
  const tl = timelineFromWebMscore({ events: [0, 1, 2].map((elid) => ({ elid, position: elid * 1000 })) }, [], 3000);
  it.each([
    [-1, -1],
    [0, 0],
    [999, 0],
    [1000, 1],
    [2999, 2],
    [50_000, 2],
  ])('at %i ms → event %i', (ms, expected) => {
    expect(eventIndexAt(tl, ms)).toBe(expected);
  });
});

describe('readTimeSignatures', () => {
  it('carries the time signature over measures and sums additive meters', () => {
    const doc = parseXml(`<score-partwise><part id="P1">
      <measure number="1"><attributes><time><beats>4</beats><beat-type>4</beat-type></time></attributes></measure>
      <measure number="2"/>
      <measure number="3"><attributes><time><beats>3+2</beats><beat-type>8</beat-type></time></attributes></measure>
    </part></score-partwise>`);
    expect(readTimeSignatures(doc)).toEqual([FOUR_FOUR, FOUR_FOUR, { beats: 5, beatType: 8 }]);
  });
});

describe('clicksPerMeasure', () => {
  it.each([
    [{ beats: 4, beatType: 4 }, 4],
    [{ beats: 3, beatType: 4 }, 3],
    [{ beats: 6, beatType: 8 }, 2],
    [{ beats: 12, beatType: 8 }, 4],
    [{ beats: 3, beatType: 8 }, 3],
    [{ beats: 5, beatType: 8 }, 5],
  ])('%o → %i clicks', (sig, n) => expect(clicksPerMeasure(sig)).toBe(n));
});
