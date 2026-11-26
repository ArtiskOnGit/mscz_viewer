import { describe, expect, it } from 'vitest';
import type { Timeline } from '../model/types';
import { boxAtPoint, eventOfMeasureFrom, firstEventOfMeasure, halfPageSplit, measureIndexForBar, measureNumbers, nextPosition, pageOfMeasure, previousPosition, xmlMeasureOfId } from './navigation';
import { xmlToRenderedMeasure } from '../playback/measureMap';
import { DEFAULT_PEDAL_KEYS, assignPedalKey, normalizePedalKeys, pedalAction } from './pedalKeys';

describe('measureNumbers / measureIndexForBar', () => {
  const xml = `<score-partwise><part-list/>
    <part id="P1"><measure implicit="yes" number="0"/><measure number="1"><attributes><measure-style><multiple-rest>2</multiple-rest></measure-style></attributes><note/></measure><measure width="12" number="2"/><measure/></part>
    <part id="P2"><measure number="0"/><measure number="1"/><measure number="2"/><measure number="3"/><measure number="99"/></part>
  </score-partwise>`;

  it('reads the printed numbers of the first part only', () => {
    expect(measureNumbers(xml)).toEqual(['0', '1', '2', '4']);
    expect(measureNumbers('<score-partwise/>')).toEqual([]);
  });

  it('finds a bar by its printed number, then by rank', () => {
    const numbers = measureNumbers(xml);
    expect(measureIndexForBar('1', numbers, 4)).toBe(1); // pickup bar 0 shifts the ranks
    expect(measureIndexForBar(' 0 ', numbers, 4)).toBe(0);
    expect(measureIndexForBar('3', numbers, 4)).toBe(2); // not printed: 3rd measure
    expect(measureIndexForBar('5', numbers, 4)).toBeUndefined();
    expect(measureIndexForBar('', numbers, 4)).toBeUndefined();
    expect(measureIndexForBar('x', numbers, 4)).toBeUndefined();
    expect(measureIndexForBar('2', [], 4)).toBe(1);
  });
});

describe('pageOfMeasure', () => {
  it('goes through the multi-rest map', () => {
    expect(pageOfMeasure(3, [0, 1, 1, 1, 2], [1, 1, 2])).toBe(1);
    expect(pageOfMeasure(4, [0, 1, 1, 1, 2], [1, 1, 2])).toBe(2);
    expect(pageOfMeasure(9, [0], [1])).toBeUndefined();
    expect(pageOfMeasure(0, [0], [])).toBeUndefined();
  });
});

describe('firstEventOfMeasure', () => {
  const tl = (indexes: number[]): Timeline => ({
    source: 'webmscore',
    events: indexes.map((measureIndex, i) => ({ measureIndex, startMs: i * 1000, durationMs: 1000 })) as Timeline['events'],
    totalMs: indexes.length * 1000,
  });
  it('returns the first occurrence in playing order', () => {
    expect(firstEventOfMeasure(tl([0, 1, 2, 1, 2, 3]), 2)).toBe(2);
    expect(firstEventOfMeasure(tl([0, 1, 2, 1, 2, 3]), 3)).toBe(5);
  });
  it('falls back to the next measure played, or -1', () => {
    expect(firstEventOfMeasure(tl([0, 1, 4, 5]), 2)).toBe(2);
    expect(firstEventOfMeasure(tl([0, 1]), 5)).toBe(-1);
  });
});

describe('half-page turns', () => {
  it('without half pages, turns full pages within bounds', () => {
    expect(nextPosition({ page: 1, half: false }, 3, false)).toEqual({ page: 2, half: false });
    expect(nextPosition({ page: 3, half: false }, 3, false)).toEqual({ page: 3, half: false });
    expect(previousPosition({ page: 2, half: false }, false)).toEqual({ page: 1, half: false });
    expect(previousPosition({ page: 1, half: false }, false)).toEqual({ page: 1, half: false });
  });

  it('goes through the composite view, and back', () => {
    let pos = { page: 1, half: false };
    pos = nextPosition(pos, 2, true);
    expect(pos).toEqual({ page: 1, half: true });
    pos = nextPosition(pos, 2, true);
    expect(pos).toEqual({ page: 2, half: false });
    expect(nextPosition(pos, 2, true)).toEqual({ page: 2, half: false }); // last page: no composite
    pos = previousPosition(pos, true);
    expect(pos).toEqual({ page: 1, half: true });
    pos = previousPosition(pos, true);
    expect(pos).toEqual({ page: 1, half: false });
  });
});

describe('pedal keys', () => {
  it('maps codes to actions', () => {
    expect(pedalAction('PageDown', DEFAULT_PEDAL_KEYS)).toBe('next');
    expect(pedalAction('ArrowUp', DEFAULT_PEDAL_KEYS)).toBe('prev');
    expect(pedalAction('KeyP', DEFAULT_PEDAL_KEYS)).toBe('playPause');
    expect(pedalAction('KeyM', DEFAULT_PEDAL_KEYS)).toBe('metronome');
    expect(pedalAction('MediaTrackNext', DEFAULT_PEDAL_KEYS)).toBe('nextPiece');
    expect(pedalAction('MediaTrackPrevious', DEFAULT_PEDAL_KEYS)).toBe('previousPiece');
    expect(pedalAction('KeyZ', DEFAULT_PEDAL_KEYS)).toBeUndefined();
  });

  it('adds or replaces a key and removes it from the other actions', () => {
    const added = assignPedalKey(DEFAULT_PEDAL_KEYS, 'playPause', 'Space', 'add');
    expect(added.playPause).toEqual(['KeyP', 'MediaPlayPause', 'Space']);
    expect(added.next).not.toContain('Space');
    const replaced = assignPedalKey(DEFAULT_PEDAL_KEYS, 'prev', 'KeyB', 'replace');
    expect(replaced.prev).toEqual(['KeyB']);
    expect(replaced.next).toEqual(DEFAULT_PEDAL_KEYS.next);
    expect(assignPedalKey(DEFAULT_PEDAL_KEYS, 'next', 'Space', 'add').next.filter((k) => k === 'Space')).toHaveLength(1);
  });

  it('normalizes stored values', () => {
    expect(normalizePedalKeys(undefined)).toEqual(DEFAULT_PEDAL_KEYS);
    expect(normalizePedalKeys({ next: ['KeyN'], prev: 'oops' })).toEqual({ ...DEFAULT_PEDAL_KEYS, next: ['KeyN'] });
    // Settings saved before the metronome / piece actions existed: KeyM already bound to "next" stays there.
    const old = normalizePedalKeys({ next: ['KeyM'], prev: ['ArrowLeft'], playPause: ['KeyP'] });
    expect(old.metronome).toEqual([]);
    expect(old.nextPiece).toEqual(['MediaTrackNext']);
    expect(pedalAction('KeyM', old)).toBe('next');
  });
});

describe('halfPageSplit', () => {
  const band = (top: number, bottom: number) => ({ top, bottom });
  it('splits between systems, closest to the middle', () => {
    const current = [band(50, 350), band(390, 700), band(720, 790)];
    const next = [band(50, 375), band(400, 700)];
    expect(halfPageSplit(current, next, 800)).toEqual({ topEnd: 375, bottomStart: 390 });
  });
  it('falls back to the middle when no next system fits', () => {
    expect(halfPageSplit([band(10, 300), band(320, 600)], [band(10, 700)], 800)).toEqual({ topEnd: 400, bottomStart: 400 });
    expect(halfPageSplit([band(10, 700)], [band(10, 300)], 800)).toEqual({ topEnd: 400, bottomStart: 400 });
  });
});

describe('start from a picked bar (long press)', () => {
  // 8 measures; measures 3-5 (ranks 2..4) are one merged multi-measure rest.
  const xmlToRendered = xmlToRenderedMeasure(8, [{ start: 2, length: 3 }]);
  const measureIds = ['m0', 'm1', 'm2', 'm5', 'm6', 'm7'];

  it('maps a rendered measure id to its (first) MusicXML measure', () => {
    expect(xmlToRendered).toEqual([0, 1, 2, 2, 2, 3, 4, 5]);
    expect(xmlMeasureOfId('m0', measureIds, xmlToRendered)).toBe(0);
    expect(xmlMeasureOfId('m2', measureIds, xmlToRendered)).toBe(2); // the multi-rest starts at rank 2
    expect(xmlMeasureOfId('m5', measureIds, xmlToRendered)).toBe(5);
    expect(xmlMeasureOfId('m7', measureIds, xmlToRendered)).toBe(7);
    expect(xmlMeasureOfId('nope', measureIds, xmlToRendered)).toBeUndefined();
  });

  // Measures 0-3 repeated, then 4-5: playing order 0 1 2 3 0 1 2 3 4 5.
  const order = [0, 1, 2, 3, 0, 1, 2, 3, 4, 5];
  const timeline: Timeline = {
    source: 'webmscore',
    totalMs: order.length * 1000,
    events: order.map((measureIndex, i) => ({ measureIndex, startMs: i * 1000, durationMs: 1000, timeSig: { beats: 4, beatType: 4 } })),
  };

  it('picks the first occurrence at or after the current position', () => {
    expect(eventOfMeasureFrom(timeline, 1, 0)).toBe(1);
    expect(eventOfMeasureFrom(timeline, 1, 2)).toBe(5); // second time through the repeat
    expect(eventOfMeasureFrom(timeline, 1, 5)).toBe(5);
    expect(eventOfMeasureFrom(timeline, 5, 3)).toBe(9);
  });

  it('falls back to the last occurrence before, then to a later measure', () => {
    expect(eventOfMeasureFrom(timeline, 1, 8)).toBe(5);
    expect(eventOfMeasureFrom(timeline, 0, 99)).toBe(4);
    const withGap: Timeline = { ...timeline, events: timeline.events.filter((e) => e.measureIndex !== 4) };
    expect(eventOfMeasureFrom(withGap, 4, 0)).toBe(8); // measure 4 not played: next one
    expect(eventOfMeasureFrom(withGap, 9, 0)).toBe(-1);
  });

  it('finds the measure box under a point', () => {
    const boxes = [
      { left: 0, top: 0, right: 100, bottom: 50 },
      { left: 100, top: 0, right: 200, bottom: 50 },
      { left: 0, top: 80, right: 200, bottom: 130 },
      { left: 20, top: 85, right: 60, bottom: 120 }, // nested (smaller wins)
    ];
    expect(boxAtPoint(boxes, 50, 25)).toBe(0);
    expect(boxAtPoint(boxes, 150, 25)).toBe(1);
    expect(boxAtPoint(boxes, 150, 100)).toBe(2);
    expect(boxAtPoint(boxes, 30, 100)).toBe(3);
    expect(boxAtPoint(boxes, 210, 25)).toBe(1); // right margin of the system
    expect(boxAtPoint(boxes, 300, 25)).toBe(-1);
    expect(boxAtPoint(boxes, 50, 65)).toBe(-1); // between two systems
  });
});
