// Continuous mode: the Verovio pages (same width, height fitted to their content) stacked into one native vertical
// scroll. Pages are rendered lazily around the reading position; the others are placeholders with their measured
// (or estimated) height, and the scroll position is anchored so that a page rendered above the screen never moves
// what is being read. The auto-scroll follows the current measure with a critically damped spring.
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { followStep, lineTarget, renderWindow, SCREEN_SCROLL, type FollowState } from '../../core/navigation/continuous';

export interface ContinuousHandle {
  /** Scrolls by about one screen (minus an overlap). */
  scrollScreen(direction: 1 | -1): void;
  /** Scrolled to the very bottom of the score. */
  atEnd(): boolean;
  /** Brings a measure (SVG id) to the top of the screen (go to bar). */
  scrollToMeasure(id: string): void;
  /** Auto-scroll frame: keeps the system of this measure at the reading line. */
  follow(id: string, progress: number): void;
  /** The measure is (at least partly) on screen. */
  isVisible(id: string): boolean;
  /** First measure of the first system whose top is on screen. */
  firstVisible(): string | undefined;
}

interface Props {
  ref: Ref<ContinuousHandle>;
  pageCount: number;
  /** Page to start at (the parent remounts the view for every layout). */
  page: number;
  /** Measure to bring to the top at start (first measure on screen before a relayout), if on `page`. */
  getAnchor(): string | undefined;
  pageSvg(n: number): Promise<string>;
  pageOfId(id: string): number | undefined;
  /** Estimated height of a page not rendered yet (px). */
  estimate: number;
  readingLine: number;
  pinchScale: number;
  onVisible(page: number, topMeasureId: string | undefined): void;
}

const GOTO_MARGIN = 0.04; // go to bar: measure slightly below the top of the screen

export function ContinuousView({ ref, ...p }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [initial] = useState(() => {
    const id = p.getAnchor();
    return { page: p.page, id: id && p.pageOfId(id) === p.page ? id : undefined, margin: 0 };
  });
  const [center, setCenter] = useState(initial.page);
  // SVG of the pages rendered so far (the renderer caches them anyway); only those near `center` are in the DOM.
  const [svgs, setSvgs] = useState<Record<number, string>>({});
  const heights = useRef(new Map<number, number>());
  // Scroll anchor: page under the top of the screen and offset into it (kept when heights above it change).
  const anchor = useRef<{ page: number; offset: number }>({ page: initial.page, offset: 0 });
  // Position to reach once its page is rendered (start position, go to bar).
  const pending = useRef<{ page: number; id?: string; margin: number } | undefined>(initial);
  const follower = useRef<FollowState & { t: number; set: number }>({ pos: 0, vel: 0, t: 0, set: 0 });
  const userHold = useRef(0);
  const latest = useRef(p);
  useLayoutEffect(() => {
    latest.current = p;
  });

  const pageDiv = (n: number) => content.current?.querySelector<HTMLElement>(`[data-page="${n}"]`) ?? null;
  /** Top of an element in content coordinates (= scrollTop units). */
  const topOf = (el: Element) => el.getBoundingClientRect().top - content.current!.getBoundingClientRect().top;
  const find = (id: string) => content.current?.querySelector(`[id="${CSS.escape(id)}"]`) ?? null;

  const updateAnchor = useCallback(() => {
    const sc = scroller.current;
    if (!sc) return;
    const top = sc.scrollTop;
    const div = [...(content.current?.querySelectorAll<HTMLElement>('[data-page]') ?? [])].find((d) => d.offsetTop + d.offsetHeight > top);
    if (div) anchor.current = { page: Number(div.dataset.page), offset: top - div.offsetTop };
  }, []);

  const setScroll = useCallback(
    (y: number) => {
      const sc = scroller.current!;
      sc.scrollTop = Math.max(0, Math.min(y, sc.scrollHeight - sc.clientHeight));
      updateAnchor();
    },
    [updateAnchor],
  );

  // Render the pages around the reading position.
  const { keep } = renderWindow(center, p.pageCount);
  useEffect(() => {
    let cancelled = false;
    for (const n of renderWindow(center, latest.current.pageCount).render) {
      void latest.current
        .pageSvg(n)
        .then((svg) => {
          if (!cancelled) setSvgs((s) => (s[n] === svg ? s : { ...s, [n]: svg }));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [center]);
  const shown = (n: number) => !!svgs[n] && keep.includes(n);

  // After rendering: size the placeholders (measured height, else the average), then reach the pending position or
  // restore the anchor.
  const shownKey = keep.filter((n) => svgs[n]).join(',');
  useLayoutEffect(() => {
    const sc = scroller.current;
    const root = content.current;
    if (!sc || !root) return;
    const divs = [...root.querySelectorAll<HTMLElement>('[data-page]')];
    for (const d of divs) if (d.dataset.rendered === 'true') heights.current.set(Number(d.dataset.page), d.offsetHeight);
    const known = [...heights.current.values()];
    const estimate = known.length ? known.reduce((a, b) => a + b, 0) / known.length : latest.current.estimate;
    for (const d of divs) d.style.height = d.dataset.rendered === 'true' ? '' : `${heights.current.get(Number(d.dataset.page)) ?? estimate}px`;
    const byPage = (n: number) => divs.find((d) => d.dataset.page === String(n));
    const target = pending.current;
    const div = target && byPage(target.page);
    if (target && div) {
      const el = target.id ? root.querySelector(`[id="${CSS.escape(target.id)}"]`) : null;
      const system = el?.closest('g.system') ?? el;
      const top = system ? system.getBoundingClientRect().top - root.getBoundingClientRect().top : div.offsetTop;
      setScroll(top - target.margin * sc.clientHeight);
      if (div.dataset.rendered === 'true') pending.current = undefined;
      return;
    }
    const a = anchor.current;
    const ad = byPage(a.page);
    if (ad && Math.abs(ad.offsetTop + a.offset - sc.scrollTop) > 1) sc.scrollTop = ad.offsetTop + a.offset;
  }, [shownKey, setScroll]);

  const viewport = () => {
    const r = scroller.current!.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  };

  /**
   * Height (content px) that should be at the reading line: top of the measure's system, moving on towards the next
   * system as the measures of the system are played (so the scroll is continuous, not a jump per system).
   */
  const lineY = (id: string, progress: number): number | undefined => {
    const el = find(id);
    if (!el) {
      // Page not rendered yet (e.g. a repeat jumps far back): go to its placeholder, it renders on the way.
      const div = pageDiv(latest.current.pageOfId(id) ?? 0);
      return div ? div.offsetTop : undefined;
    }
    const system = el.closest('g.system');
    if (!system) return topOf(el);
    const measures = [...system.querySelectorAll('g.measure')];
    const index = Math.max(0, measures.indexOf(el));
    const top = topOf(system);
    let next: Element | null = system.nextElementSibling;
    while (next && !next.classList.contains('system')) next = next.nextElementSibling;
    if (!next) {
      const page = Number(el.closest<HTMLElement>('[data-page]')?.dataset.page ?? 0);
      next = pageDiv(page + 1)?.querySelector('g.system') ?? null;
    }
    const nextTop = next ? topOf(next) : top + system.getBoundingClientRect().height;
    return top + (nextTop - top) * Math.min(1, (index + progress) / Math.max(1, measures.length));
  };

  const handle: ContinuousHandle = {
    scrollScreen(direction) {
      const sc = scroller.current;
      if (sc) sc.scrollBy({ top: direction * SCREEN_SCROLL * sc.clientHeight, behavior: 'smooth' });
    },
    atEnd() {
      const sc = scroller.current;
      return !!sc && center >= p.pageCount && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2;
    },
    scrollToMeasure(id) {
      const sc = scroller.current;
      const page = latest.current.pageOfId(id);
      if (!sc || !page) return;
      const el = find(id);
      const div = pageDiv(page);
      pending.current = el ? undefined : { page, id, margin: GOTO_MARGIN };
      if (el || div) setScroll((el ? topOf(el.closest('g.system') ?? el) : div!.offsetTop) - GOTO_MARGIN * sc.clientHeight);
      setCenter(page);
    },
    follow(id, progress) {
      const sc = scroller.current;
      if (!sc) return;
      const f = follower.current;
      const now = performance.now();
      // Resumed, scrolled by hand or anchored: start again from the actual position.
      if (now - f.t > 250 || Math.abs(sc.scrollTop - f.set) > 2) Object.assign(f, { pos: sc.scrollTop, vel: 0 });
      const dt = Math.min(0.05, Math.max(0, (now - f.t) / 1000));
      f.t = now;
      if (now < userHold.current) {
        Object.assign(f, { pos: sc.scrollTop, vel: 0, set: sc.scrollTop });
        return;
      }
      const y = lineY(id, progress);
      if (y === undefined) return;
      const target = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, lineTarget(y, latest.current.readingLine, sc.clientHeight)));
      Object.assign(f, followStep(f, target, dt, sc.clientHeight));
      sc.scrollTop = f.pos;
      f.set = sc.scrollTop;
    },
    isVisible(id) {
      const el = find(id);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const v = viewport();
      return r.bottom > v.top && r.top < v.bottom;
    },
    firstVisible() {
      const v = viewport();
      const systems = [...(content.current?.querySelectorAll('g.system') ?? [])].map((s) => ({ s, r: s.getBoundingClientRect() }));
      const onScreen = systems.find(({ r }) => r.top >= v.top - 4 && r.top < v.bottom) ?? systems.find(({ r }) => r.bottom > v.top && r.top < v.bottom);
      return onScreen?.s.querySelector('g.measure')?.id || undefined;
    },
  };
  useImperativeHandle(ref, () => handle);
  const latestHandle = useRef(handle);
  useLayoutEffect(() => {
    latestHandle.current = handle;
  });

  // Scroll: reading position (page rendering window, page indicator), anchor, first measure on screen.
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    let frame = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const pageAt = (y: number) => {
      const divs = [...(content.current?.querySelectorAll<HTMLElement>('[data-page]') ?? [])];
      return Number((divs.find((d) => d.offsetTop + d.offsetHeight > y) ?? divs[divs.length - 1])?.dataset.page ?? 1);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateAnchor();
        const reading = pageAt(sc.scrollTop + latest.current.readingLine * sc.clientHeight);
        setCenter(reading);
        clearTimeout(settle);
        settle = setTimeout(() => latest.current.onVisible(reading, latestHandle.current.firstVisible()), 150);
      });
    };
    // The user scrolls by hand: the auto-scroll lets go for a moment.
    const hold = () => (userHold.current = performance.now() + 1500);
    sc.addEventListener('scroll', onScroll, { passive: true });
    sc.addEventListener('wheel', hold, { passive: true });
    sc.addEventListener('touchmove', hold, { passive: true });
    return () => {
      sc.removeEventListener('scroll', onScroll);
      sc.removeEventListener('wheel', hold);
      sc.removeEventListener('touchmove', hold);
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [updateAnchor]);

  return (
    <div ref={scroller} className="score-scroll" data-testid="continuous-scroll">
      <div ref={content} className="score-continuous" style={p.pinchScale !== 1 ? { transform: `scale(${p.pinchScale})` } : undefined}>
        {Array.from({ length: p.pageCount }, (_, i) => i + 1).map((n) =>
          shown(n) ? (
            <div key={`p${n}`} data-page={n} data-rendered="true" className="score-page continuous-page" dangerouslySetInnerHTML={{ __html: svgs[n]! }} />
          ) : (
            // Placeholder: its height is set from the DOM (measured height of the page, or an estimate).
            <div key={`e${n}`} data-page={n} data-rendered="false" className="continuous-placeholder" />
          ),
        )}
      </div>
    </div>
  );
}
