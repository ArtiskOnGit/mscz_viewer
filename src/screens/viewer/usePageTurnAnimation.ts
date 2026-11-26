// Page mode: short page-turn animation (setting), played when the SVG of another page is shown.
// The CSS animations (viewer.css) are disabled under "prefers-reduced-motion".
import { useState } from 'react';
import { turnDirection, type PageTurnAnimation } from '../../core/navigation/pageTurn';

interface TurnState {
  svg?: string;
  page?: number;
  dir?: 'next' | 'prev';
  /** Incremented at each animated turn: used as the React key, so the animation restarts. */
  n: number;
}

export function usePageTurnAnimation(svg: string | undefined, page: number, animation: PageTurnAnimation) {
  const [state, setState] = useState<TurnState>({ n: 0 });
  // The SVG is set once the page is rendered: `page` is then the page it belongs to. A new SVG of the same page
  // (zoom, rotation…) is not a page turn.
  if (svg !== state.svg) {
    const dir = svg && state.svg ? turnDirection(state.page, page, animation) : undefined;
    setState({ svg, page, dir, n: dir ? state.n + 1 : state.n });
  }
  return {
    key: state.n,
    className: state.dir ? ` turn-${animation} turn-${state.dir}` : '',
    dir: state.dir,
  };
}
