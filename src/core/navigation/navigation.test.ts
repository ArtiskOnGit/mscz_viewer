import { describe, expect, it } from 'vitest';
import type { Timeline } from '../model/types';
import { firstEventOfMeasure, halfPageSplit, measureIndexForBar, measureNumbers, nextPosition, pageOfMeasure, previousPosition } from './navigation';
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
