import { describe, expect, it } from 'vitest';
import { firstKeyFifths, keyName, noteName, resolveNoteNaming, transposeFifths } from './keys';
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

  it.each([
    ['C', 'Do', 'C'], ['D', 'Ré', 'D'], ['E♭', 'Mi♭', 'E♭'], ['F♯', 'Fa♯', 'F♯'], ['G', 'Sol', 'G'], ['A♭', 'La♭', 'A♭'],
    ['B', 'Si', 'H'], ['B♭', 'Si♭', 'B'], ['C♭', 'Do♭', 'C♭'],
  ])('names %s in Latin (%s) and German (%s) notation', (english, latin, german) => {
    expect(noteName(english, 'english')).toBe(english);
    expect(noteName(english, 'latin')).toBe(latin);
    expect(noteName(english, 'german')).toBe(german);
  });

  it('names keys in every notation', () => {
    expect(keyName(-2, 'major', 'latin')).toBe('Si♭');
    expect(keyName(-2, 'major', 'german')).toBe('B');
    expect(keyName(5, 'major', 'german')).toBe('H');
    expect(keyName(0, 'minor', 'latin')).toBe('La');
    expect(keyName(7, 'major', 'latin')).toBe('Do♯');
    expect(keyName(-8, 'major', 'latin')).toBeUndefined();
  });

  it('resolves the automatic note naming from the language', () => {
    expect(resolveNoteNaming('auto', 'fr')).toBe('latin');
    expect(resolveNoteNaming('auto', 'fr-CA')).toBe('latin');
    expect(resolveNoteNaming('auto', 'en')).toBe('english');
    expect(resolveNoteNaming('auto', 'de-DE')).toBe('german');
    expect(resolveNoteNaming('english', 'fr')).toBe('english');
    expect(resolveNoteNaming('german', 'en')).toBe('german');
  });

  it('reads the first key signature', () => {
    const doc = parseXml('<score-partwise><part id="P1"><measure><attributes><key><fifths>-1</fifths><mode>minor</mode></key></attributes></measure></part></score-partwise>');
    expect(firstKeyFifths(doc)).toEqual({ fifths: -1, mode: 'minor' });
    expect(firstKeyFifths(parseXml('<score-partwise><part id="P1"/></score-partwise>'))).toBeUndefined();
  });
});
