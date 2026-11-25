import { describe, expect, it } from 'vitest';
import { autoScale, firstMeasureId, transposeOption, verovioOptions } from './renderService';

describe('renderService helpers', () => {
  it('autoScale shrinks with the number of staves and grows with the width', () => {
    expect(autoScale(1, 412)).toBeGreaterThan(autoScale(4, 412));
    expect(autoScale(4, 412)).toBeGreaterThan(autoScale(12, 412));
    expect(autoScale(1, 800)).toBeGreaterThan(autoScale(1, 412));
  });

  it('converts the viewport to Verovio units', () => {
    const o = verovioOptions({ width: 400, height: 800, scale: 40, transpose: '', concertPitch: false });
    expect(o).toMatchObject({ pageWidth: 1000, pageHeight: 2000, scale: 40, breaks: 'auto' });
  });

  it('finds the first measure id of an SVG page', () => {
    expect(firstMeasureId('<svg><g id="sys" class="system"><g id="m1x" class="measure"><g id="m2" class="measure">')).toBe('m1x');
    expect(firstMeasureId('<svg><g class="measure" id="abc">')).toBe('abc');
    expect(firstMeasureId('<svg></svg>')).toBeUndefined();
  });

  it.each([
    [0, 0, ''],
    [2, 0, '+2'],
    [-3, 0, '-3'],
    [2, -1, '-10'],
  ])('transposeOption(%i, %i) = %s', (s, o, expected) => expect(transposeOption(s, o)).toBe(expected));
});
