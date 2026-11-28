import { describe, expect, it } from 'vitest';
import { xmlToRenderedMeasure } from './measureMap';
import { PlaybackClock } from './clock';
import { clicksFrom, countInClicks, countInDurationMs } from './clicks';
import type { Timeline } from '../model/types';
import { readMeasureFills } from '../timeline/timeline';
import { parseXml } from '../../test/xmlEnv';

describe('xmlToRenderedMeasure', () => {
  it('maps measures merged into a multi-measure rest to the same rendered measure', () => {
    // 8 measures, rests 2..4 (start 1, length 3) and 6..7 (start 5, length 2)
    expect(xmlToRenderedMeasure(8, [{ start: 1, length: 3 }, { start: 5, length: 2 }])).toEqual([0, 1, 1, 1, 2, 3, 3, 4]);
  });
  it('is the identity without groups', () => {
    expect(xmlToRenderedMeasure(3, [])).toEqual([0, 1, 2]);
  });
});

describe('PlaybackClock', () => {
  const fakeTime = () => {
    let t = 100;
    return { source: { now: () => t }, advance: (s: number) => (t += s) };
  };

  it('advances with time and the tempo factor, without jumping when the factor changes', () => {
    const { source, advance } = fakeTime();
    const clock = new PlaybackClock(source);
    clock.start(1000);
    advance(2);
    expect(clock.scoreMs()).toBe(3000);
    clock.setTempoFactor(0.5);
    expect(clock.scoreMs()).toBe(3000);
    advance(2);
    expect(clock.scoreMs()).toBe(4000);
    expect(clock.timeOf(5000)).toBeCloseTo(106); // 1000 ms of score at half speed = 2 s
  });

  it('supports a lead-in delay and stops at the current position', () => {
    const { source, advance } = fakeTime();
    const clock = new PlaybackClock(source);
    clock.start(0, 1);
    expect(clock.scoreMs()).toBe(-1000);
    advance(3);
    expect(clock.stop()).toBe(2000);
    advance(10);
    expect(clock.scoreMs()).toBe(2000);
    expect(clock.playing).toBe(false);
  });
});

const sig = (beats: number, beatType: number) => ({ beats, beatType });
const TL: Timeline = {
  source: 'webmscore',
  totalMs: 5000,
  events: [
    { measureIndex: 0, startMs: 0, durationMs: 2000, timeSig: sig(4, 4) },
    { measureIndex: 1, startMs: 2000, durationMs: 1500, timeSig: sig(3, 4) },
    { measureIndex: 0, startMs: 3500, durationMs: 1500, timeSig: sig(6, 8) }, // repeat
  ],
};

describe('clicks', () => {
  it('generates beats with accents on the first beat, following meters and repeats', () => {
    const all = [...clicksFrom(TL, 0)];
    expect(all.map((c) => c.scoreMs)).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4250]);
    expect(all.filter((c) => c.accent).map((c) => c.scoreMs)).toEqual([0, 2000, 3500]);
  });

  it('starts at the first click at or after a position', () => {
    expect([...clicksFrom(TL, 2400)].map((c) => c.scoreMs)).toEqual([2500, 3000, 3500, 4250]);
  });

  it('builds a count-in from the first played measure', () => {
    const ci = countInClicks(TL, 1, 1);
    expect(ci.map((c) => c.scoreMs)).toEqual([500, 1000, 1500]);
    expect(ci[0]?.accent).toBe(true);
    expect(countInDurationMs(TL, 1, 2)).toBe(3000);
    expect(countInClicks(TL, 1, 0)).toEqual([]);
  });
});

// Stay With Me bug report (2026-11-28): the piece starts with a 1-beat pickup; the count-in (4 clicks in the
// pickup's 536 ms) was 4 times too fast. Beats come from the tempo (TimelineEvent.fill), pickups count from their end.
describe('pickups and incomplete measures', () => {
  const pickupTl = (pickupMs: number, timeSig = sig(4, 4), fill: number, barMs = 2000): Timeline => ({
    source: 'webmscore',
    totalMs: pickupMs + 2 * barMs,
    events: [
      { measureIndex: 0, startMs: 0, durationMs: pickupMs, timeSig, fill, fromEnd: true },
      { measureIndex: 1, startMs: pickupMs, durationMs: barMs, timeSig },
      { measureIndex: 2, startMs: pickupMs + barMs, durationMs: barMs, timeSig },
    ],
  });

  it('1-beat pickup in 4/4: count-in of full bars at the tempo + the missing beats, one click on beat 4', () => {
    const tl = pickupTl(500, sig(4, 4), 0.25);
    const ci = countInClicks(tl, 0, 1);
    expect(ci.map((c) => c.scoreMs)).toEqual([-3500, -3000, -2500, -2000, -1500, -1000, -500]); // 1 2 3 4 | 1 2 3
    expect(ci.map((c) => c.beat)).toEqual([0, 1, 2, 3, 0, 1, 2]);
    expect(countInDurationMs(tl, 0, 1)).toBe(3500);
    expect(countInDurationMs(tl, 0, 2)).toBe(5500);
    const clicks = [...clicksFrom(tl, 0)].slice(0, 6);
    expect(clicks.map((c) => [c.scoreMs, c.beat, c.accent])).toEqual([
      [0, 3, false], // the pickup is beat 4
      [500, 0, true],
      [1000, 1, false],
      [1500, 2, false],
      [2000, 3, false],
      [2500, 0, true],
    ]);
  });

  it('2-beat pickup in 4/4: beats 3 and 4', () => {
    const tl = pickupTl(1000, sig(4, 4), 0.5);
    expect(countInClicks(tl, 0, 1).map((c) => c.scoreMs)).toEqual([-3000, -2500, -2000, -1500, -1000, -500]);
    expect([...clicksFrom(tl, 0)].slice(0, 3).map((c) => [c.scoreMs, c.beat])).toEqual([[0, 2], [500, 3], [1000, 0]]);
  });

  it('6/8 pickup of one dotted quarter: the dotted-quarter beat of the tempo, beat 2', () => {
    const tl = pickupTl(750, sig(6, 8), 0.5, 1500);
    expect(countInClicks(tl, 0, 2).map((c) => [c.scoreMs, c.beat])).toEqual([[-3750, 0], [-3000, 1], [-2250, 0], [-1500, 1], [-750, 0]]);
    expect([...clicksFrom(tl, 0)].slice(0, 3).map((c) => [c.scoreMs, c.beat, c.accent])).toEqual([[0, 1, false], [750, 0, true], [1500, 1, false]]);
  });

  it('8th-note pickup (half a beat): the click falls on the bar line, not inside the pickup', () => {
    const tl = pickupTl(250, sig(4, 4), 0.125);
    expect([...clicksFrom(tl, 0)].slice(0, 2).map((c) => c.scoreMs)).toEqual([250, 750]);
    expect(countInClicks(tl, 0, 1).map((c) => c.scoreMs)).toEqual([-3750, -3250, -2750, -2250, -1750, -1250, -750, -250]);
  });

  it('a short bar counted from its start (3 beats in 4/4, first half of a split bar), and a start from it', () => {
    const tl: Timeline = {
      source: 'webmscore',
      totalMs: 3500,
      events: [
        { measureIndex: 0, startMs: 0, durationMs: 2000, timeSig: sig(4, 4) },
        { measureIndex: 1, startMs: 2000, durationMs: 1500, timeSig: sig(4, 4), fill: 0.75 },
      ],
    };
    expect([...clicksFrom(tl, 1900)].map((c) => [c.scoreMs, c.beat])).toEqual([[2000, 0], [2500, 1], [3000, 2]]);
    expect(countInClicks(tl, 1, 1).map((c) => c.scoreMs)).toEqual([0, 500, 1000, 1500]);
  });
});

describe('readMeasureFills (MusicXML)', () => {
  const measure = (n: number, body: string, attrs = '') => `<measure number="${n}">${attrs}${body}</measure>`;
  const note = (d: number, extra = '') => `<note>${extra}<pitch><step>C</step><octave>4</octave></pitch><duration>${d}</duration></note>`;
  const doc = (p1: string, p2 = '') => parseXml(`<score-partwise><part id="P1">${p1}</part>${p2 ? `<part id="P2">${p2}</part>` : ''}</score-partwise>`);
  const attrs = '<attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>';

  it('finds a pickup (from its end), ignores grace notes and chord notes, follows backup/forward and all parts', () => {
    const fills = readMeasureFills(
      doc(
        measure(0, note(2) + note(1, '<grace/>') + note(2, '<chord/>'), attrs) + measure(1, note(8)) + measure(2, note(4) + '<backup><duration>4</duration></backup>' + note(2)) + measure(3, note(2)) + measure(4, note(6)),
        measure(0, note(2), attrs) + measure(1, note(8)) + measure(2, note(4) + '<forward><duration>4</duration></forward>') + measure(3, note(2)) + measure(4, note(6)),
      ),
    );
    expect(fills).toEqual([{ fill: 0.25, fromEnd: true }, undefined, undefined, { fill: 0.25, fromEnd: false }, { fill: 0.75, fromEnd: true }]);
  });
});
