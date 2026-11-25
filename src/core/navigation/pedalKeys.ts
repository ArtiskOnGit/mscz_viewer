// Keyboard / Bluetooth pedal mapping (KeyboardEvent.code values). Most pedals send arrows, Page Up/Down, Space or Enter.

export type PedalAction = 'next' | 'prev' | 'playPause';
export type PedalKeys = Record<PedalAction, string[]>;

export const PEDAL_ACTIONS: PedalAction[] = ['next', 'prev', 'playPause'];

export const DEFAULT_PEDAL_KEYS: PedalKeys = {
  next: ['ArrowRight', 'ArrowDown', 'PageDown', 'Space', 'Enter', 'NumpadEnter'],
  prev: ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'],
  playPause: ['KeyP', 'MediaPlayPause'],
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

/** Stored value merged with the defaults (missing or invalid actions fall back to them). */
export function normalizePedalKeys(value: unknown): PedalKeys {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<PedalAction, unknown>>;
  const result = {} as PedalKeys;
  for (const a of PEDAL_ACTIONS) {
    const keys = v[a];
    result[a] = Array.isArray(keys) && keys.every((k) => typeof k === 'string') ? (keys as string[]) : DEFAULT_PEDAL_KEYS[a];
  }
  return result;
}
