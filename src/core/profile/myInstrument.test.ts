import { describe, expect, it } from 'vitest';
import type { Part } from '../model/types';
import { defaultViewState } from '../storage/viewStateRepository';
import { COMMON_INSTRUMENTS, initialViewState, matchMyInstrument, parseNames, tokenize } from './myInstrument';

const parts = (...specs: [string, string?][]): Part[] =>
  specs.map(([name, instrumentId], index) => ({ index, musicXmlId: `P${index + 1}`, name, instrumentId }));

const band = parts(
  ['Trumpet in B♭ 1', 'bb-trumpet'],
  ['Trumpet in B♭ 2', 'bb-trumpet'],
  ['Trompette en Si♭', 'brass.trumpet.bflat'],
  ['Alto Saxophone', 'wind.reed.saxophone.alto'],
  ['Tenor Saxophone', 'tenor-saxophone'],
  ['Tpt. 3'],
  ['Trombone', 'trombone'],
  ['Drum Kit', 'drumset'],
);
const profile = (names: string[], instrumentIds: string[] = []) => ({ names, instrumentIds });

describe('tokenize', () => {
  it('ignores case, accents, punctuation and filler words; ♭ → b', () => {
    expect(tokenize('Trompette en Si♭')).toEqual(['trompette', 'sib']);
    expect(tokenize('TRUMPET in Bb, 1')).toEqual(['trumpet', 'bb', '1']);
    expect(tokenize('Flûte')).toEqual(['flute']);
  });
});

describe('matchMyInstrument', () => {
  it('matches part names by word, case- and accent-insensitively, with numbering', () => {
    expect(matchMyInstrument(band, profile(['trumpet']))).toEqual(['P1', 'P2']);
    expect(matchMyInstrument(band, profile(['TROMPETTE']))).toEqual(['P3']);
    expect(matchMyInstrument(band, profile(['Trompette en Sib']))).toEqual(['P3']);
    expect(matchMyInstrument(band, profile(['Bb Trumpet']))).toEqual(['P1', 'P2']);
  });

  it('accepts word prefixes of 3 letters or more and abbreviations', () => {
    expect(matchMyInstrument(band, profile(['Alto Sax']))).toEqual(['P4']);
    expect(matchMyInstrument(band, profile(['sax']))).toEqual(['P4', 'P5']);
    expect(matchMyInstrument(band, profile(['Tpt']))).toEqual(['P6']);
    expect(matchMyInstrument(band, profile(['T']))).toEqual([]); // too short to be a prefix
    expect(matchMyInstrument(band, profile(['Trumpets']))).toEqual([]);
  });

  it('requires numbers of the profile to match exactly', () => {
    expect(matchMyInstrument(band, profile(['Trumpet 2']))).toEqual(['P2']);
    expect(matchMyInstrument(band, profile(['Trumpet 1']))).toEqual(['P1']);
  });

  it('matches MuseScore instrument ids, whole or by words', () => {
    expect(matchMyInstrument(band, profile([], ['bb-trumpet']))).toEqual(['P1', 'P2']);
    expect(matchMyInstrument(band, profile([], ['trumpet']))).toEqual(['P1', 'P2', 'P3']);
    expect(matchMyInstrument(band, profile([], ['alto-saxophone']))).toEqual(['P4']);
    expect(matchMyInstrument(band, profile([], ['BB-TRUMPET']))).toEqual(['P1', 'P2']);
  });

  it('combines several names and returns parts in score order', () => {
    expect(matchMyInstrument(band, profile(['Trombone', 'Trompette']))).toEqual(['P3', 'P7']);
  });

  it('returns nothing for an empty profile or blank names', () => {
    expect(matchMyInstrument(band, profile([]))).toEqual([]);
    expect(matchMyInstrument(band, profile(['  ', 'in']))).toEqual([]);
  });

  it('quick picks match the usual names', () => {
    const pick = (id: string) => COMMON_INSTRUMENTS.find((c) => c.id === id)!;
    const p = (id: string) => ({ names: [...pick(id).names], instrumentIds: [...pick(id).instrumentIds] });
    expect(matchMyInstrument(band, p('trumpet'))).toEqual(['P1', 'P2', 'P3', 'P6']);
    expect(matchMyInstrument(band, p('altoSax'))).toEqual(['P4']);
    expect(matchMyInstrument(band, p('drums'))).toEqual(['P8']);
    expect(matchMyInstrument(parts(['Saxophone Ténor']), p('tenorSax'))).toEqual(['P1']);
  });
});

describe('parseNames', () => {
  it('splits on commas, trims, drops blanks and duplicates', () => {
    expect(parseNames(' Trumpet, Trompette ,, Tpt, trumpet ')).toEqual(['Trumpet', 'Trompette', 'Tpt']);
    expect(parseNames('')).toEqual([]);
  });
});

describe('initialViewState', () => {
  const settings = { myInstrument: profile(['Trombone']), defaultTranspose: 2 };

  it('preselects my parts and applies the default transposition on first opening', () => {
    const r = initialViewState(defaultViewState('s'), false, band, settings);
    expect(r.matchedParts).toEqual(['P7']);
    expect(r.view.selectedParts).toEqual(['P7']);
    expect(r.view.transposeSemitones).toBe(2);
  });

  it('keeps the default parts when nothing matches, still applying the transposition', () => {
    const r = initialViewState(defaultViewState('s'), false, band, { ...settings, myInstrument: profile(['Oboe']) });
    expect(r.matchedParts).toEqual([]);
    expect(r.view.selectedParts).toEqual([]);
    expect(r.view.transposeSemitones).toBe(2);
  });

  it('applies the default layout mode on first opening only', () => {
    expect(initialViewState(defaultViewState('s'), false, band, { ...settings, defaultLayoutMode: 'continuous' }).view.layoutMode).toBe('continuous');
    expect(initialViewState(defaultViewState('s'), true, band, { ...settings, defaultLayoutMode: 'continuous' }).view.layoutMode).toBe('pages');
  });

  it('turns the metronome on for new scores when the setting asks for it', () => {
    expect(initialViewState(defaultViewState('s'), false, band, settings).view.metronomeEnabled).toBe(false);
    expect(initialViewState(defaultViewState('s'), false, band, { ...settings, metronomeDefault: true }).view.metronomeEnabled).toBe(true);
    expect(initialViewState(defaultViewState('s'), true, band, { ...settings, metronomeDefault: true }).view.metronomeEnabled).toBe(false);
  });

  it('never overrides a saved view state', () => {
    const saved = { ...defaultViewState('s'), selectedParts: [] };
    const r = initialViewState(saved, true, band, settings);
    expect(r.view).toBe(saved);
    expect(r.matchedParts).toEqual([]);
  });
});
