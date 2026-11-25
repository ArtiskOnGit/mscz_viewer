import { describe, expect, it } from 'vitest';
import { xmlToRenderedMeasure } from './measureMap';
import { PlaybackClock } from './clock';
import { clicksFrom, countInClicks, countInDurationMs } from './clicks';
import type { Timeline } from '../model/types';

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
