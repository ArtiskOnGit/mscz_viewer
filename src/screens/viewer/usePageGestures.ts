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
  swipe: boolean;
}

const TAP_ZONE = 1 / 3;
const SWIPE_MIN_PX = 60;
const TAP_MAX_MOVE_PX = 12;

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

    const distance = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };

    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY });
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
      if (pinching && pointers.size === 2 && pinchStart > 0) {
        ratio = Math.min(3, Math.max(0.33, distance() / pinchStart));
        setPinchScale(ratio);
      }
    };
    const up = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (!p) return;
      if (pinching) {
        if (pointers.size === 0) {
          pinching = false;
          setPinchScale(1);
          if (Math.abs(ratio - 1) > 0.05) h.current.onPinchEnd(ratio);
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
        if (h.current.tapZones && x < TAP_ZONE) h.current.onPrev();
        else if (h.current.tapZones && x > 1 - TAP_ZONE) h.current.onNext();
        else h.current.onToggleChrome();
      }
    };
    const cancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
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
    };
  }, [ref]);

  return pinchScale;
}
