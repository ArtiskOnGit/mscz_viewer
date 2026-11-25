// Keyboard / Bluetooth pedal mapping (KeyboardEvent.code values). Most pedals send arrows, Page Up/Down, Space or Enter.

// metronome = metronome on/off (as a tap on the metronome button); nextPiece / previousPiece = setlist mode only.
export type PedalAction = 'next' | 'prev' | 'playPause' | 'metronome' | 'nextPiece' | 'previousPiece';
export type PedalKeys = Record<PedalAction, string[]>;

export const PEDAL_ACTIONS: PedalAction[] = ['next', 'prev', 'playPause', 'metronome', 'nextPiece', 'previousPiece'];

export const DEFAULT_PEDAL_KEYS: PedalKeys = {
  next: ['ArrowRight', 'ArrowDown', 'PageDown', 'Space', 'Enter', 'NumpadEnter'],
  prev: ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'],
  playPause: ['KeyP', 'MediaPlayPause'],
  metronome: ['KeyM'],
  nextPiece: ['MediaTrackNext'],
  previousPiece: ['MediaTrackPrevious'],
};

/** Action bound to a key code, if any. */
export function pedalAction(code: string, keys: PedalKeys): PedalAction | undefined {
  return PEDAL_ACTIONS.find((a) => keys[a].includes(code));
}

/** Binds a key to an action (added to its keys or replacing them); the key is removed from the other actions. */
export function assignPedalKey(keys: PedalKeys, action: PedalAction, code: string, mode: 'add' | 'replace'): PedalKeys {
  const result = {} as PedalKeys;
  for (const a of PEDAL_ACTIONS) {
    const others = keys[a].filter((k) => k !== code);
    if (a !== action) result[a] = others;
    else result[a] = mode === 'replace' ? [code] : [...others, code];
  }
  return result;
}

/**
 * Stored value merged with the defaults (missing or invalid actions fall back to them). Default keys of a missing
 * action (e.g. an action added in a newer version) that the user already bound to another action are left out.
 */
export function normalizePedalKeys(value: unknown): PedalKeys {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<PedalAction, unknown>>;
  const valid = (keys: unknown): keys is string[] => Array.isArray(keys) && keys.every((k) => typeof k === 'string');
  const used = new Set(PEDAL_ACTIONS.flatMap((a) => { const keys = v[a]; return valid(keys) ? keys : []; }));
  const result = {} as PedalKeys;
  for (const a of PEDAL_ACTIONS) {
    const keys = v[a];
    result[a] = valid(keys) ? keys : DEFAULT_PEDAL_KEYS[a].filter((k) => !used.has(k));
  }
  return result;
}
