import { describe, expect, it } from 'vitest';
import { firstKeyFifths, keyName, transposeFifths } from './keys';
import { parseXml } from '../../test/xmlEnv';

describe('keys', () => {
  it.each([
    [0, 2, 2], // C up a major 2nd → D (2♯)
    [-1, 2, 1], // F → G
    [0, -3, 3], // C down a minor 3rd → A (3♯)
    [-2, -3, 1], // B♭ → G
  ])('transposeFifths(%i, %i) = %i', (fifths, semis, expected) => {
    expect(transposeFifths(fifths, semis)).toBe(expected);
  });

  it('prefers the spelling with fewer accidentals, flats on F♯/G♭', () => {
    expect(transposeFifths(0, 1)).toBe(-5); // D♭ (5♭) rather than C♯ (7♯)
    expect(transposeFifths(0, 6)).toBe(-6); // G♭
    expect(transposeFifths(-2, 0)).toBe(-2);
    expect(transposeFifths(0, 12)).toBe(0);
  });

  it('names keys', () => {
    expect(keyName(-2, 'major')).toBe('B♭');
    expect(keyName(3, 'minor')).toBe('F♯');
    expect(keyName(9, 'major')).toBeUndefined();
  });

  it('reads the first key signature', () => {
    const doc = parseXml('<score-partwise><part id="P1"><measure><attributes><key><fifths>-1</fifths><mode>minor</mode></key></attributes></measure></part></score-partwise>');
    expect(firstKeyFifths(doc)).toEqual({ fifths: -1, mode: 'minor' });
    expect(firstKeyFifths(parseXml('<score-partwise><part id="P1"/></score-partwise>'))).toBeUndefined();
  });
});
