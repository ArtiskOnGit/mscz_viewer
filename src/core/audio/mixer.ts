// Per-part mixer of the score audio (ADR-026): volume, mute, solo per part + master volume. Pure, unit-tested.
// Remembered per score (ScoreViewState.mixer) and optionally per setlist item (override).
import type { MixerState, Part, PartMix } from '../model/types';

export type { MixerState, PartMix };

export const DEFAULT_PART_MIX: PartMix = { volume: 1, muted: false, solo: false };

export const emptyMixer = (): MixerState => ({ parts: {} });

export function partMix(state: MixerState | undefined, partId: string): PartMix {
  return { ...DEFAULT_PART_MIX, ...state?.parts[partId] };
}

export function setPartMix(state: MixerState | undefined, partId: string, patch: Partial<PartMix>): MixerState {
  const base = state ?? emptyMixer();
  return { ...base, parts: { ...base.parts, [partId]: { ...partMix(base, partId), ...patch } } };
}

/** Gain of each part (0..1): solo parts only when one is soloed, muted parts silent, else their volume. */
export function partGains(parts: readonly Part[], state: MixerState | undefined): Map<string, number> {
  const anySolo = parts.some((p) => partMix(state, p.musicXmlId).solo);
  return new Map(
    parts.map((p) => {
      const m = partMix(state, p.musicXmlId);
      const audible = !m.muted && (!anySolo || m.solo);
      return [p.musicXmlId, audible ? clamp01(m.volume) : 0];
    }),
  );
}

/**
 * Linear gain of each MIDI channel (fader curve applied); a channel shared by several parts (not expected) takes the
 * loudest.
 */
export function channelGains(parts: readonly Part[], state: MixerState | undefined): Map<number, number> {
  const gains = partGains(parts, state);
  const out = new Map<number, number>();
  for (const p of parts) for (const c of p.midiChannels ?? []) out.set(c, Math.max(out.get(c) ?? 0, faderGain(gains.get(p.musicXmlId) ?? 0)));
  return out;
}

/** Slider position (0..1) → linear gain: square curve (50 % ≈ −12 dB), closer to the perceived loudness. */
export const faderGain = (v: number): number => clamp01(v) ** 2;

export type MixPreset = 'all' | 'onlyMine' | 'withoutMine';

/**
 * Quick actions, shortcuts that set the mute/solo flags (volumes are kept):
 * all parts; only "my instrument"; everything but "my instrument" (play along).
 */
export function applyPreset(parts: readonly Part[], state: MixerState | undefined, preset: MixPreset, mine: readonly string[]): MixerState {
  const base = state ?? emptyMixer();
  const next: MixerState = { ...base, parts: { ...base.parts } };
  for (const p of parts) {
    const isMine = mine.includes(p.musicXmlId);
    const muted = preset === 'onlyMine' ? !isMine : preset === 'withoutMine' ? isMine : false;
    next.parts[p.musicXmlId] = { ...partMix(base, p.musicXmlId), muted, solo: false };
  }
  return next;
}

/** The preset the state corresponds to, if any (to show it as selected). */
export function currentPreset(parts: readonly Part[], state: MixerState | undefined, mine: readonly string[]): MixPreset | undefined {
  const presets: MixPreset[] = mine.length ? ['all', 'onlyMine', 'withoutMine'] : ['all'];
  return presets.find((preset) => {
    const target = applyPreset(parts, state, preset, mine);
    return parts.every((p) => {
      const a = partMix(state, p.musicXmlId);
      const b = partMix(target, p.musicXmlId);
      return a.muted === b.muted && a.solo === b.solo;
    });
  });
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
