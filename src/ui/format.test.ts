import { describe, expect, it } from 'vitest';
import { formatDuration, splitDuration } from './format';

describe('durations', () => {
  it('formats and splits durations', () => {
    expect(formatDuration(310)).toBe('5:10');
    expect(splitDuration(310)).toEqual({ h: 0, m: 5, s: 10 });
    expect(splitDuration(3725.4)).toEqual({ h: 1, m: 2, s: 5 });
    expect(splitDuration(undefined)).toBeUndefined();
  });
});
