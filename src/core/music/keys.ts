// Key signatures and transposition arithmetic (circle of fifths).

/** Fifths of the first key signature of the first displayed part (MusicXML <key><fifths>). */
export function firstKeyFifths(doc: Document): { fifths: number; mode: 'major' | 'minor' } | undefined {
  const part = doc.getElementsByTagName('part')[0];
  const key = part?.getElementsByTagName('key')[0];
  const fifths = key?.getElementsByTagName('fifths')[0]?.textContent;
  if (fifths == null) return undefined;
  const mode = key?.getElementsByTagName('mode')[0]?.textContent?.trim() === 'minor' ? 'minor' : 'major';
  return { fifths: Number(fifths), mode };
}

/** Key signature after transposing by `semitones` (enharmonic choice: fewest accidentals, flats on a tie). */
export function transposeFifths(fifths: number, semitones: number): number {
  // One semitone up = +7 fifths (mod 12).
  const raw = (((fifths + 7 * semitones) % 12) + 12) % 12; // 0..11
  return raw > 6 ? raw - 12 : raw === 6 ? -6 : raw; // -6..5 (G♭ rather than F♯)
}

const MAJOR = ['C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'];
const MINOR = ['A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯'];

/** Tonic name in English notation ("B♭"), or undefined for out-of-range values. */
export function keyName(fifths: number, mode: 'major' | 'minor'): string | undefined {
  return (mode === 'minor' ? MINOR : MAJOR)[fifths + 7];
}

/** Common presets for transposing instruments reading a concert-pitch part. */
export const TRANSPOSE_PRESETS = [
  { id: 'c', semitones: 0 },
  { id: 'bb', semitones: 2 }, // B♭ clarinet, trumpet, tenor sax: written a major 2nd higher
  { id: 'eb', semitones: -3 }, // E♭ alto/baritone sax: written a major 6th higher = minor 3rd lower (octave apart)
  { id: 'f', semitones: 7 }, // F horn: written a perfect 5th higher
] as const;
