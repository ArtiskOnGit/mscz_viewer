import { describe, expect, it } from 'vitest';
import { autoScrollPage, turnDirection } from './pageTurn';

// 8 bars played in order: bars 0-3 on page 1, 4-7 on page 2.
const linear = (j: number) => (j < 0 || j > 7 ? undefined : j < 4 ? 1 : 2);
// Repeat: bars 0-3 (p1), 4-5 (p2), then back to bar 2 (p1): events 0..9 → pages.
const repeatPages = [1, 1, 1, 1, 2, 2, 1, 1, 2, 2];
const repeat = (j: number) => repeatPages[j];

describe('autoScrollPage', () => {
  it('"half": turns halfway through the last bar of the page', () => {
    expect(autoScrollPage(linear, 3, 0.4, 'half', 1)).toBe(1);
    expect(autoScrollPage(linear, 3, 0.6, 'half', 1)).toBe(2);
    expect(autoScrollPage(linear, 2, 0.9, 'half', 1)).toBe(1);
  });

  it('0 bars: turns when the first bar of the next page starts', () => {
    expect(autoScrollPage(linear, 3, 0.99, 0, 1)).toBe(1);
    expect(autoScrollPage(linear, 4, 0, 0, 1)).toBe(2);
  });

  it('N bars: turns once the current bar is within N bars of the end of the page', () => {
    expect(autoScrollPage(linear, 3, 0, 1, 1)).toBe(2);
    expect(autoScrollPage(linear, 2, 0.9, 1, 1)).toBe(1);
    expect(autoScrollPage(linear, 2, 0, 2, 1)).toBe(2);
    expect(autoScrollPage(linear, 0, 0, 4, 1)).toBe(2);
    expect(autoScrollPage(linear, 7, 0.9, 4, 2)).toBe(2); // end of the score
  });

  it('never anticipates a repeat going back by more than half a bar', () => {
    expect(autoScrollPage(repeat, 4, 0.9, 3, 2)).toBe(2);
    expect(autoScrollPage(repeat, 5, 0.4, 3, 2)).toBe(2);
    expect(autoScrollPage(repeat, 5, 0.6, 3, 2)).toBe(1);
    expect(autoScrollPage(repeat, 5, 0.9, 0, 2)).toBe(2);
    expect(autoScrollPage(repeat, 6, 0, 0, 2)).toBe(1);
  });

  it('keeps the current page when the bar page is unknown', () => {
    expect(autoScrollPage(() => undefined, 0, 0.9, 2, 3)).toBe(3);
  });
});

describe('turnDirection', () => {
  it('gives the direction of a page change, none without animation or change', () => {
    expect(turnDirection(1, 2, 'slide')).toBe('next');
    expect(turnDirection(3, 2, 'fade')).toBe('prev');
    expect(turnDirection(2, 2, 'slide')).toBeUndefined();
    expect(turnDirection(undefined, 2, 'slide')).toBeUndefined();
    expect(turnDirection(1, 2, 'none')).toBeUndefined();
  });
});
