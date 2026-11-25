// "My instrument" profile (SPECIFICATIONS_FONCTIONNELLES §3.2.1, §3.4): the parts to preselect on the first opening of a score.
import type { Part, ScoreViewState } from '../model/types';

export interface MyInstrumentProfile {
  /** Free-text names, any language or abbreviation ("Trumpet", "Trompette en Si♭", "Tpt"). */
  names: string[];
  /** MuseScore instrument ids ("bb-trumpet", "brass.trumpet.bflat") or id fragments ("trumpet"). */
  instrumentIds: string[];
}

/** Quick picks offered in the settings. `names` are matching data (several languages), not UI text. */
export const COMMON_INSTRUMENTS = [
  { id: 'trumpet', names: ['Trumpet', 'Trompette', 'Tpt'], instrumentIds: ['trumpet'] },
  { id: 'cornet', names: ['Cornet'], instrumentIds: ['cornet'] },
  { id: 'clarinet', names: ['Clarinet', 'Clarinette', 'Cl'], instrumentIds: ['clarinet'] },
  { id: 'flute', names: ['Flute', 'Flûte', 'Fl'], instrumentIds: ['flute'] },
  { id: 'altoSax', names: ['Alto Sax', 'Saxophone Alto', 'A. Sax'], instrumentIds: ['alto-saxophone'] },
  { id: 'tenorSax', names: ['Tenor Sax', 'Saxophone Ténor', 'T. Sax'], instrumentIds: ['tenor-saxophone'] },
  { id: 'baritoneSax', names: ['Baritone Sax', 'Saxophone Baryton', 'Bari Sax'], instrumentIds: ['baritone-saxophone'] },
  { id: 'horn', names: ['Horn', 'Cor en Fa', 'Hn'], instrumentIds: ['horn'] },
  { id: 'trombone', names: ['Trombone', 'Tbn'], instrumentIds: ['trombone'] },
  { id: 'euphonium', names: ['Euphonium', 'Baritone Horn', 'Euph'], instrumentIds: ['euphonium'] },
  { id: 'tuba', names: ['Tuba', 'Sousaphone', 'Soubassophone'], instrumentIds: ['tuba', 'sousaphone'] },
  { id: 'violin', names: ['Violin', 'Violon', 'Vln'], instrumentIds: ['violin'] },
  { id: 'cello', names: ['Cello', 'Violoncelle', 'Vc'], instrumentIds: ['violoncello', 'cello'] },
  { id: 'piano', names: ['Piano', 'Pno'], instrumentIds: ['piano'] },
  { id: 'guitar', names: ['Guitar', 'Guitare', 'Gtr'], instrumentIds: ['guitar'] },
  { id: 'drums', names: ['Drum Kit', 'Drums', 'Batterie', 'Drumset'], instrumentIds: ['drumset', 'drum-group-set'] },
] as const;

export type CommonInstrumentId = (typeof COMMON_INSTRUMENTS)[number]['id'];

// Words that carry no meaning for matching ("Trumpet in B♭", "Trompette en Si♭").
const STOP_WORDS = new Set(['in', 'en', 'de', 'di', 'du', 'des', 'the', 'la', 'le', 'el', 'im', 'and', 'et']);

/** Lower case, no accents, ♭ → b, ♯ → #, split into words. */
export function tokenize(text: string): string[] {
  const normalized = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/♭/g, 'b').replace(/♯/g, '#');
  return (normalized.match(/[\p{L}\p{N}#]+/gu) ?? []).filter((w) => !STOP_WORDS.has(w));
}

const isNumber = (w: string) => /^\d+$/.test(w);

/** A profile word matches a part word if equal, or a prefix of it (3 letters or more: "sax" → "saxophone", "tpt"). */
const wordMatches = (p: string, q: string) => q === p || (!isNumber(p) && p.length >= 3 && q.startsWith(p));

/** Every word of the profile entry (in any order) matches a word of the part name. Numbers must match exactly. */
function nameMatches(profileName: string, partName: string): boolean {
  const wanted = tokenize(profileName);
  if (!wanted.length) return false;
  const words = tokenize(partName);
  return wanted.every((p) => words.some((q) => wordMatches(p, q)));
}

const idWords = (id: string) => id.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Every word of the profile id appears in the part id: "trumpet" ⊂ "bb-trumpet", "alto-saxophone" ⊂ "wind.reed.saxophone.alto". */
function idMatches(profileId: string, partId: string): boolean {
  const wanted = idWords(profileId);
  const words = idWords(partId);
  return wanted.length > 0 && wanted.every((w) => words.includes(w));
}

/** musicXmlIds of the parts matching the profile, in score order. */
export function matchMyInstrument(parts: readonly Part[], profile: MyInstrumentProfile): string[] {
  return parts
    .filter(
      (part) =>
        profile.names.some((n) => nameMatches(n, part.name)) ||
        (!!part.instrumentId && profile.instrumentIds.some((id) => idMatches(id, part.instrumentId!))),
    )
    .map((p) => p.musicXmlId);
}

/** "Trumpet, Trompette ,, Tpt" → ["Trumpet", "Trompette", "Tpt"] (no duplicates, case-insensitive). */
export function parseNames(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
}

export interface ProfileSettings {
  myInstrument: MyInstrumentProfile;
  defaultTranspose: number;
}

/**
 * View state of a score opened for the first time (no saved view state): the parts of "my instrument" instead of the
 * default parts, and the default transposition. Saved view states are returned unchanged (explicit user choices win).
 */
export function initialViewState(
  view: ScoreViewState,
  hasSavedState: boolean,
  parts: readonly Part[],
  profile: ProfileSettings,
): { view: ScoreViewState; matchedParts: string[] } {
  if (hasSavedState || view.selectedParts.length) return { view, matchedParts: [] };
  const matchedParts = matchMyInstrument(parts, profile.myInstrument);
  const next = { ...view };
  if (matchedParts.length) next.selectedParts = matchedParts;
  if (profile.defaultTranspose && !view.transposeSemitones && !view.transposeOctave) next.transposeSemitones = profile.defaultTranspose;
  return { view: next, matchedParts };
}
