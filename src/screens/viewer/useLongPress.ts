// Long press on a button (pointer held ≥ ms) with a distinct short-click action.
import { useEffect, useLayoutEffect, useRef, type MouseEvent } from 'react';

export function useLongPress(onLong: () => void, onClick: (() => void) | undefined, ms: number) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fired = useRef(false);
  const cb = useRef({ onLong, onClick });
  useLayoutEffect(() => {
    cb.current = { onLong, onClick };
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  const cancel = () => clearTimeout(timer.current);
  return {
    onPointerDown: () => {
      fired.current = false;
      cancel();
      timer.current = setTimeout(() => {
        fired.current = true;
        cb.current.onLong();
      }, ms);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onClick: () => {
      if (fired.current) fired.current = false; // the long press already acted
      else cb.current.onClick?.();
    },
    // Android shows a context menu on long press.
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  };
}
