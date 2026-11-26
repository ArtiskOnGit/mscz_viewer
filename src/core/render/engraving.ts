// Engraving settings (music font, bar numbers, title) → Verovio options (SPECIFICATIONS_FONCTIONNELLES §3.4).
// The three SMuFL fonts ship inside the Verovio WASM build: no extra file to load.

export const MUSIC_FONTS = ['Leipzig', 'Bravura', 'Leland'] as const;
export type MusicFont = (typeof MUSIC_FONTS)[number];

/** none / start of each system (Verovio default) / every bar / every 5 bars. */
export const BAR_NUMBERS = ['none', 'system', 'every', 'every5'] as const;
export type BarNumbers = (typeof BAR_NUMBERS)[number];

export interface EngravingSettings {
  musicFont: MusicFont;
  barNumbers: BarNumbers;
  /** Title, composer… above the first system of the first page. */
  showHeader: boolean;
}

export const DEFAULT_ENGRAVING: EngravingSettings = { musicFont: 'Leipzig', barNumbers: 'system', showHeader: true };

const MNUM_INTERVAL: Record<BarNumbers, number> = { none: 0, system: 0, every: 1, every5: 5 };

/**
 * Verovio options. Every option is always set: the toolkit keeps options from one setOptions() to the next.
 * "none" keeps Verovio's numbers and hides them with CSS (`g.mNum`, see viewer.css): no reload needed.
 */
export function engravingOptions(e: EngravingSettings = DEFAULT_ENGRAVING): Record<string, unknown> {
  return {
    font: MUSIC_FONTS.includes(e.musicFont) ? e.musicFont : 'Leipzig',
    mnumInterval: MNUM_INTERVAL[e.barNumbers] ?? 0,
    header: e.showHeader ? 'auto' : 'none',
  };
}

/** Part of the renderer content key: Verovio reloads the score when it changes. */
export function engravingKey(e: EngravingSettings = DEFAULT_ENGRAVING): string {
  const o = engravingOptions(e);
  return `${String(o.font)}|${String(o.mnumInterval)}|${String(o.header)}`;
}

export function engravingOf(s: EngravingSettings): EngravingSettings {
  return { musicFont: s.musicFont, barNumbers: s.barNumbers, showHeader: s.showHeader };
}
