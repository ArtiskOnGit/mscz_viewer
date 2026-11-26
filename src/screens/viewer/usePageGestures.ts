// Tap zones (left/right third = previous/next page, centre = show/hide toolbars), horizontal swipe, pinch zoom.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

interface Handlers {
  onNext(): void;
  onPrev(): void;
  onToggleChrome(): void;
  /** Called with the final pinch ratio (> 1 = zoom in). */
  onPinchEnd(ratio: number): void;
  /** Left/right thirds turn pages (otherwise any tap toggles the toolbars). */
  tapZones: boolean;
  /** Width of each side tap zone, fraction of the stage width (setting, default 1/3). */
  tapZoneWidth?: number;
  swipe: boolean;
  /** Pinch zoom (off in lock mode: a two-finger touch is then ignored). */
  pinch: boolean;
  // --- long press on a bar (start the auto-scroll there) ---
  /** One finger held still ≥ LONG_PRESS_MS (client coordinates); the tap is then not handled. */
  onLongPress?(x: number, y: number): void;
  // --- end long press ---
}

const TAP_ZONE = 1 / 3; // default; see Handlers.tapZoneWidth
const SWIPE_MIN_PX = 60;
const TAP_MAX_MOVE_PX = 12;
export const LONG_PRESS_MS = 500;

export function usePageGestures(ref: RefObject<HTMLElement | null>, handlers: Handlers): number {
  const [pinchScale, setPinchScale] = useState(1);
  const h = useRef(handlers);
  useLayoutEffect(() => {
    h.current = handlers;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pointers = new Map<number, { x0: number; y0: number; x: number; y: number }>();
    let pinchStart = 0;
    let pinching = false;
    let ratio = 1;
    // --- long press ---
    let longTimer: ReturnType<typeof setTimeout> | undefined;
    let longFired = false;
    const cancelLong = () => clearTimeout(longTimer);
    // --- end long press ---

    const distance = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };

    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY });
      // --- long press ---
      cancelLong();
      if (pointers.size === 1) {
        longFired = false;
        const { clientX, clientY } = e;
        if (h.current.onLongPress) {
          longTimer = setTimeout(() => {
            longFired = true;
            h.current.onLongPress?.(clientX, clientY);
          }, LONG_PRESS_MS);
        }
      }
      // --- end long press ---
      if (pointers.size === 2) {
        pinching = true;
        pinchStart = distance();
        ratio = 1;
      }
    };
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (Math.abs(p.x - p.x0) >= TAP_MAX_MOVE_PX || Math.abs(p.y - p.y0) >= TAP_MAX_MOVE_PX) cancelLong(); // long press
      if (pinching && h.current.pinch && pointers.size === 2 && pinchStart > 0) {
        ratio = Math.min(3, Math.max(0.33, distance() / pinchStart));
        setPinchScale(ratio);
      }
    };
    const up = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      cancelLong(); // long press
      if (!p) return;
      if (longFired) return; // the long press already acted
      if (pinching) {
        if (pointers.size === 0) {
          pinching = false;
          setPinchScale(1);
          if (h.current.pinch && Math.abs(ratio - 1) > 0.05) h.current.onPinchEnd(ratio);
        }
        return;
      }
      const dx = p.x - p.x0;
      const dy = p.y - p.y0;
      if (h.current.swipe && Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) h.current.onNext();
        else h.current.onPrev();
      } else if (Math.abs(dx) < TAP_MAX_MOVE_PX && Math.abs(dy) < TAP_MAX_MOVE_PX) {
        const { left, width } = el.getBoundingClientRect();
        const x = (p.x - left) / width;
        const zone = h.current.tapZoneWidth ?? TAP_ZONE;
        if (h.current.tapZones && x < zone) h.current.onPrev();
        else if (h.current.tapZones && x > 1 - zone) h.current.onNext();
        else h.current.onToggleChrome();
      }
    };
    const cancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      cancelLong(); // long press
      if (pointers.size === 0 && pinching) {
        pinching = false;
        setPinchScale(1);
      }
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      cancelLong(); // long press
    };
  }, [ref]);

  return pinchScale;
}
