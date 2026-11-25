// Accidental preference: choice of the enharmonic key and the interval passed to Verovio (checked with real Verovio).
import { beforeAll, describe, expect, it } from 'vitest';
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { enharmonicKeys, targetFifths, transposeInterval } from './keys';
import { transposeOption } from '../render/renderService';

describe('enharmonic key choice', () => {
  it('lists the enharmonic spellings of the target key', () => {
    expect(enharmonicKeys(0, 1)).toEqual([-5, 7]); // D♭ / C♯
    expect(enharmonicKeys(0, 6)).toEqual([-6, 6]); // G♭ / F♯
    expect(enharmonicKeys(0, -1)).toEqual([-7, 5]); // C♭ / B
    expect(enharmonicKeys(0, 2)).toEqual([2]); // D only
    expect(enharmonicKeys(-2, 3)).toEqual([-5, 7]); // B♭ + 3 = D♭ / C♯
  });

  it.each([
    [0, 1, 'auto', -5],
    [0, 1, 'sharps', 7],
    [0, 1, 'flats', -5],
    [0, 6, 'auto', -6],
    [0, 6, 'sharps', 6],
    [0, -1, 'auto', 5],
    [0, -1, 'flats', -7],
    [0, 2, 'flats', 2], // no alternative: preference ignored
    [7, 0, 'auto', 7], // no transposition: written key kept
    [7, 0, 'flats', -5], // C♯ respelled D♭
    [5, 12, 'auto', 5],
  ] as const)('targetFifths(%i, %i, %s) = %i', (from, semis, pref, expected) => {
    expect(targetFifths(from, semis, pref)).toBe(expected);
  });

  it.each([
    [0, -5, 1, 'm2'],
    [0, 7, 1, 'A1'],
    [0, 7, 13, 'A8'],
    [0, -5, 13, 'm9'],
    [0, 5, -1, '-m2'],
    [0, -7, -1, '-A1'],
    [0, -5, -11, '-M7'],
    [0, 2, 2, 'M2'],
    [0, 0, 12, 'P8'],
    [0, 6, 6, 'A4'],
    [0, -6, 6, 'd5'],
    [0, -6, -6, '-A4'],
    [7, -5, 0, 'd2'],
    [-5, 7, 0, '-d2'],
    [0, -7, 11, 'd8'],
  ] as const)('transposeInterval(%i → %i, %i) = %s', (from, to, semis, expected) => {
    expect(transposeInterval(from, to, semis)).toBe(expected);
  });

  it('transposeOption uses an interval when the key is known', () => {
    expect(transposeOption(1, 0)).toBe('+1');
    expect(transposeOption(1, 0, { fifths: 0 }, 'sharps')).toBe('A1');
    expect(transposeOption(1, -1, { fifths: 0 }, 'flats')).toBe('-M7');
    expect(transposeOption(0, 0, { fifths: 0 })).toBe('');
    expect(transposeOption(0, 1, { fifths: 0 })).toBe('P8');
    expect(transposeOption(0, 0, { fifths: 7 }, 'flats')).toBe('d2');
  });
});

describe('Verovio follows the chosen key', () => {
  let vrv: VerovioToolkit;
  beforeAll(async () => {
    vrv = new VerovioToolkit(await createVerovioModule());
  }, 30000);

  const score = (fifths: number) =>
    `<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>A</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>${fifths}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>`;

  /** Key signature (fifths) and first note (pname + octave) after transposition. */
  const render = (fifths: number, transpose: string) => {
    vrv.setOptions({ transpose });
    vrv.loadData(score(fifths));
    const mei = vrv.getMEI();
    const sig = /\bsig="(\d+)([sf])"/.exec(mei);
    const note = /<note\b[^>]*>/.exec(mei)?.[0] ?? '';
    return {
      fifths: sig ? Number(sig[1]) * (sig[2] === 's' ? 1 : -1) : 0,
      note: `${/pname="(\w)"/.exec(note)?.[1]}${/oct="(\d)"/.exec(note)?.[1]}`,
    };
  };

  it.each([
    [0, 1, 0, 'auto'],
    [0, 1, 0, 'sharps'],
    [0, 6, 0, 'sharps'],
    [0, 6, 0, 'flats'],
    [0, -1, 0, 'flats'],
    [0, 1, -1, 'sharps'],
    [-2, 3, 0, 'sharps'],
    [5, 6, 0, 'auto'],
    [7, 0, 0, 'flats'],
  ] as const)('key %i transposed %i semitones %i octave(s), %s', (from, semis, oct, pref) => {
    const expected = targetFifths(from, semis + 12 * oct, pref);
    const r = render(from, transposeOption(semis, oct, { fifths: from }, pref));
    expect(r.fifths).toBe(expected);
  });

  it('keeps the octave direction', () => {
    expect(render(0, transposeOption(1, 0, { fifths: 0 }, 'sharps')).note).toBe('c4'); // C♯4
    expect(render(0, transposeOption(1, -1, { fifths: 0 }, 'sharps')).note).toBe('c3'); // C♯3
    expect(render(0, transposeOption(-1, 0, { fifths: 0 }, 'flats')).note).toBe('c4'); // C♭4 (= B3)
    expect(render(0, transposeOption(0, 1, { fifths: 0 })).note).toBe('c5');
  });
});
