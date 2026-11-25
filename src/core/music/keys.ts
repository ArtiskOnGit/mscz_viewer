// Key signatures and transposition arithmetic (circle of fifths).

export interface KeySig {
  fifths: number;
  mode: 'major' | 'minor';
  /** Transposing instrument: semitones from written to sounding pitch (MusicXML <transpose><chromatic>). */
  chromatic?: number;
}

/** Fifths of the first key signature of the first displayed part (MusicXML <key><fifths>). */
export function firstKeyFifths(doc: Document): KeySig | undefined {
  const part = doc.getElementsByTagName('part')[0];
  const key = part?.getElementsByTagName('key')[0];
  const fifths = key?.getElementsByTagName('fifths')[0]?.textContent;
  if (fifths == null) return undefined;
  const mode = key?.getElementsByTagName('mode')[0]?.textContent?.trim() === 'minor' ? 'minor' : 'major';
  const chromatic = Number(part?.getElementsByTagName('transpose')[0]?.getElementsByTagName('chromatic')[0]?.textContent ?? 0) || 0;
  return chromatic ? { fifths: Number(fifths), mode, chromatic } : { fifths: Number(fifths), mode };
}

/** Key actually displayed before the user's transposition: written key, or sounding key in concert pitch. */
export function baseKey(key: KeySig, concertPitch: boolean): KeySig {
  return concertPitch && key.chromatic ? { ...key, fifths: targetFifths(key.fifths, key.chromatic, 'auto'), chromatic: 0 } : key;
}

/** Key signature after transposing by `semitones` (enharmonic choice: fewest accidentals, flats on a tie). */
export function transposeFifths(fifths: number, semitones: number): number {
  // One semitone up = +7 fifths (mod 12).
  const raw = (((fifths + 7 * semitones) % 12) + 12) % 12; // 0..11
  return raw > 6 ? raw - 12 : raw === 6 ? -6 : raw; // -6..5 (G♭ rather than F♯)
}

export type AccidentalPreference = 'auto' | 'sharps' | 'flats';

const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * Key signatures (fifths, -7..7, flats first) spelling the key reached by transposing `fifths` by `semitones`.
 * Two values when the key has an enharmonic alternative (D♭/C♯, G♭/F♯, B/C♭, …), otherwise one.
 */
export function enharmonicKeys(fifths: number, semitones: number): number[] {
  const pc = mod(fifths + 7 * semitones, 12);
  return [pc - 12, pc, pc + 12].filter((f) => f >= -7 && f <= 7);
}

/**
 * Key signature after transposition, according to the accidental preference:
 * sharps / flats pick that spelling when there is a choice; auto keeps the written key when the transposition is
 * a whole number of octaves, otherwise picks the fewest accidentals (flats on a tie: G♭ rather than F♯).
 */
export function targetFifths(fifths: number, semitones: number, preference: AccidentalPreference): number {
  const keys = enharmonicKeys(fifths, semitones);
  if (preference === 'flats') return keys[0]!;
  if (preference === 'sharps') return keys[keys.length - 1]!;
  if (mod(semitones, 12) === 0 && keys.includes(fifths)) return fifths;
  return keys.reduce((best, f) => (Math.abs(f) < Math.abs(best) ? f : best));
}

// Semitones of the major / perfect simple intervals (unison … seventh).
const REFERENCE = [0, 2, 4, 5, 7, 9, 11];
const PERFECT = new Set([0, 3, 4]);

/**
 * Interval name understood by Verovio's "transpose" option ("m2", "-A1", "M9", "-d2"…) that moves a key of
 * `fromFifths` to `toFifths` over `semitones` (signed; octaves included). The spelling of the interval decides the
 * enharmonic spelling of the result. Undefined if no simple quality (d/m/P/M/A) matches.
 */
export function transposeInterval(fromFifths: number, toFifths: number, semitones: number): string | undefined {
  const d = toFifths - fromFifths;
  // Direction: the sign of the transposition; same pitch (respelling only): up for flatter keys (C♯ → D♭ = d2).
  const down = semitones < 0 || (semitones === 0 && d > 0);
  const step = mod(down ? -4 * d : 4 * d, 7); // a fifth up = 4 diatonic steps up
  const n = Math.abs(semitones);
  const octaves = Math.max(0, Math.round((n - REFERENCE[step]!) / 12));
  const diff = n - REFERENCE[step]! - 12 * octaves;
  const quality = PERFECT.has(step)
    ? ({ [-1]: 'd', 0: 'P', 1: 'A' } as Record<number, string>)[diff]
    : ({ [-2]: 'd', [-1]: 'm', 0: 'M', 1: 'A' } as Record<number, string>)[diff];
  if (!quality || (quality === 'd' && step === 0 && octaves === 0)) return undefined;
  return `${down ? '-' : ''}${quality}${step + 1 + 7 * octaves}`;
}

const MAJOR = ['C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'];
const MINOR = ['A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯'];

/** Note naming convention (ADR-009): English C D E F G A B, Latin Do Ré Mi Fa Sol La Si, German C D E F G A H (B = B♭). */
export type NoteNaming = 'english' | 'latin' | 'german';
/** User setting: "auto" follows the interface language (Latin for French, English otherwise). */
export type NoteNamingSetting = 'auto' | NoteNaming;

const LATIN: Record<string, string> = { C: 'Do', D: 'Ré', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
/** Languages whose musicians name notes Do Ré Mi (only French is translated today). */
const LATIN_LANGUAGES = new Set(['fr', 'it', 'es', 'pt', 'ro']);
const GERMAN_LANGUAGES = new Set(['de']);

export function resolveNoteNaming(setting: NoteNamingSetting, language: string): NoteNaming {
  if (setting !== 'auto') return setting;
  const base = language.toLowerCase().split('-')[0] ?? '';
  return LATIN_LANGUAGES.has(base) ? 'latin' : GERMAN_LANGUAGES.has(base) ? 'german' : 'english';
}

/** Converts an English note name ("B♭", "F♯", "C") to the given naming ("Si♭", "Fa♯"; German "B" for B♭, "H" for B). */
export function noteName(english: string, naming: NoteNaming): string {
  const letter = english[0] ?? '';
  const accidental = english.slice(1);
  if (naming === 'latin') return (LATIN[letter] ?? letter) + accidental;
  if (naming === 'german' && letter === 'B') return accidental === '♭' ? 'B' : `H${accidental}`;
  return english;
}

/** Tonic name ("B♭" in English, "Si♭" in Latin, "B" in German), or undefined for out-of-range values. */
export function keyName(fifths: number, mode: 'major' | 'minor', naming: NoteNaming = 'english'): string | undefined {
  const english = (mode === 'minor' ? MINOR : MAJOR)[fifths + 7];
  return english && noteName(english, naming);
}

/** Common presets for transposing instruments reading a concert-pitch part. */
/** `note`: English name of the instrument's key, shown with the user's note naming. */
export const TRANSPOSE_PRESETS = [
  { id: 'c', semitones: 0, note: 'C' },
  { id: 'bb', semitones: 2, note: 'B♭' }, // B♭ clarinet, trumpet, tenor sax: written a major 2nd higher
  { id: 'eb', semitones: -3, note: 'E♭' }, // E♭ alto/baritone sax: written a major 6th higher = minor 3rd lower (octave apart)
  { id: 'f', semitones: 7, note: 'F' }, // F horn: written a perfect 5th higher
] as const;
