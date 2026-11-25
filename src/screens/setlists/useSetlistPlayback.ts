// Viewer opened from a setlist (/viewer/:scoreId?setlist=…&item=…): item override, previous/next piece,
// "press again" on the last page before moving to the next piece (pedal-friendly, avoids accidents).
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useIonToast } from '@ionic/react';
import { routes } from '../../app/routes';
import type { SetlistItem } from '../../core/model/types';
import { useLibrary } from '../../state/libraryStore';
import { useSetlists } from '../../state/setlistStore';
import { transposeOverride, type TransposeSettings } from '../../core/setlists/effectiveView';

const CONFIRM_WINDOW_MS = 3000;

export interface SetlistPlayback {
  active: boolean;
  setlistName?: string;
  /** 1-based position of the current piece. */
  index: number;
  count: number;
  nextTitle?: string;
  hasPrev: boolean;
  hasNext: boolean;
  override?: SetlistItem['override'];
  /** Next playable piece (preloaded in the background). */
  nextItem?: SetlistItem;
  goPrev(): void;
  goNext(): void;
  /** "Next page" pressed on the last page: first press warns, second press (within 3 s) goes to the next piece. */
  nextAtEnd(): void;
  /** Instrument choice in setlist mode is stored in the item override. */
  setParts(selectedParts: string[]): void;
  /** Transposition in setlist mode is stored in the item override (cleared when equal to the score's own `base`). */
  setTranspose(value: TransposeSettings, base: TransposeSettings): void;
}

export function useSetlistPlayback(): SetlistPlayback {
  const { t } = useTranslation('setlists');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [toast] = useIonToast();
  const setlistId = params.get('setlist') ?? undefined;
  const itemId = params.get('item') ?? undefined;
  const { setlists, loaded, load, setOverride } = useSetlists();
  const { scores, loaded: libraryLoaded, load: loadLibrary } = useLibrary();
  const armedAt = useRef(0);

  useEffect(() => {
    if (setlistId && !loaded) void load();
  }, [setlistId, loaded, load]);
  useEffect(() => {
    if (setlistId && !libraryLoaded) void loadLibrary();
  }, [setlistId, libraryLoaded, loadLibrary]);

  const setlist = setlistId ? setlists.find((s) => s.id === setlistId) : undefined;
  // Only pieces whose score still exists can be played.
  const playable = useMemo(() => setlist?.items.filter((it) => scores.some((s) => s.id === it.scoreId)) ?? [], [setlist, scores]);
  const pos = playable.findIndex((it) => it.id === itemId);
  const current = pos >= 0 ? playable[pos] : undefined;
  const prev = pos > 0 ? playable[pos - 1] : undefined;
  const next = pos >= 0 ? playable[pos + 1] : undefined;

  const open = useCallback(
    (item: SetlistItem | undefined) => {
      if (setlist && item) navigate(routes.viewerInSetlist(item.scoreId, setlist.id, item.id), { replace: true });
    },
    [navigate, setlist],
  );

  const nextAtEnd = useCallback(() => {
    if (!next) return;
    const now = Date.now();
    if (now - armedAt.current < CONFIRM_WINDOW_MS) {
      armedAt.current = 0;
      open(next);
    } else {
      armedAt.current = now;
      void toast({ message: t('pressAgain'), duration: CONFIRM_WINDOW_MS, position: 'top' });
    }
  }, [next, open, toast, t]);

  return {
    active: !!current,
    setlistName: setlist?.name,
    index: pos + 1,
    count: playable.length,
    nextTitle: next ? scores.find((s) => s.id === next.scoreId)?.title : undefined,
    hasPrev: !!prev,
    hasNext: !!next,
    override: current?.override,
    nextItem: next,
    goPrev: () => open(prev),
    goNext: () => open(next),
    nextAtEnd,
    setParts: (selectedParts) => {
      if (setlist && current) void setOverride(setlist.id, current.id, { selectedParts: selectedParts.length ? selectedParts : undefined });
    },
    setTranspose: (value, base) => {
      if (setlist && current) void setOverride(setlist.id, current.id, transposeOverride(value, base));
    },
  };
}
