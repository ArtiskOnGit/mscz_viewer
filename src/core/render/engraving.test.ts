import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGRAVING, engravingKey, engravingOptions } from './engraving';
import { verovioOptions } from './renderService';

describe('engraving options', () => {
  it('defaults: Leipzig, numbers at the start of systems, title shown', () => {
    expect(engravingOptions()).toEqual({ font: 'Leipzig', mnumInterval: 0, header: 'auto' });
  });

  it('maps the settings to Verovio options', () => {
    expect(engravingOptions({ musicFont: 'Bravura', barNumbers: 'every', showHeader: false })).toEqual({ font: 'Bravura', mnumInterval: 1, header: 'none' });
    expect(engravingOptions({ ...DEFAULT_ENGRAVING, barNumbers: 'every5' }).mnumInterval).toBe(5);
    expect(engravingOptions({ ...DEFAULT_ENGRAVING, musicFont: 'Comic' as never }).font).toBe('Leipzig');
  });

  it('"none" bar numbers are hidden with CSS: same Verovio content as "system"', () => {
    expect(engravingKey({ ...DEFAULT_ENGRAVING, barNumbers: 'none' })).toBe(engravingKey(DEFAULT_ENGRAVING));
    expect(engravingKey({ ...DEFAULT_ENGRAVING, musicFont: 'Leland' })).not.toBe(engravingKey(DEFAULT_ENGRAVING));
  });

  it('is part of the Verovio options of a viewport', () => {
    const o = verovioOptions({ width: 400, height: 800, scale: 40, transpose: '', concertPitch: false, engraving: { musicFont: 'Leland', barNumbers: 'every', showHeader: false } });
    expect(o).toMatchObject({ font: 'Leland', mnumInterval: 1, header: 'none' });
  });
});
