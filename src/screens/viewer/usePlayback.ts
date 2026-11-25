// Auto-scroll at the score tempo + metronome, driven by PlaybackEngine.
// "Metronome only" mode: the same engine clicks along the timeline from the first measure of the displayed page
// (tempo changes included), without count-in, highlight or page turns; pages are turned by hand meanwhile.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Timeline } from '../../core/model/types';
import { PlaybackEngine } from '../../core/playback/playbackEngine';
import { firstEventOfMeasure } from '../../core/navigation/navigation';
import type { AppSettings } from '../../core/settings';

interface Args {
  timeline: Timeline | undefined;
  xmlToRendered: number[];
  renderedPages: number[];
  measureIds: string[];
  page: number;
  goTo(page: number): void;
  stageRef: RefObject<HTMLElement | null>;
  svg: string | undefined;
  tempoFactor: number;
  metronome: boolean;
  settings: AppSettings;
}

export function usePlayback(a: Args) {
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState<'accent' | 'beat' | undefined>();
  const [countingIn, setCountingIn] = useState(false);
  const [metronomeOnly, setMetronomeOnly] = useState(false);
  const mode = useRef<'scroll' | 'metronome'>('scroll');
  const engine = useRef<PlaybackEngine>(undefined);
  const current = useRef<number>(-1); // rendered measure index currently highlighted
  const resume = useRef<number | undefined>(undefined); // timeline event to resume from
  const latest = useRef(a);
  useEffect(() => {
    latest.current = a;
  });

  const renderedOfEvent = (i: number) => {
    const { timeline, xmlToRendered } = latest.current;
    const ev = timeline?.events[i];
    return ev ? xmlToRendered[ev.measureIndex] : undefined;
  };

  const highlight = useCallback((rendered: number | undefined) => {
    const stage = latest.current.stageRef.current;
    stage?.querySelectorAll('g.measure.current').forEach((g) => g.classList.remove('current'));
    current.current = rendered ?? -1;
    if (rendered === undefined || !latest.current.settings.highlightMeasure) return;
    const id = latest.current.measureIds[rendered];
    if (id) stage?.querySelector(`[id="${CSS.escape(id)}"]`)?.classList.add('current');
  }, []);

  // Re-apply the highlight after a page is (re)rendered.
  useEffect(() => {
    if (playing) highlight(current.current >= 0 ? current.current : undefined);
  }, [a.svg, playing, highlight]);

  useEffect(() => {
    if (!a.timeline) return;
    const e = new PlaybackEngine(a.timeline, {
      onFrame(i, progress) {
        if (mode.current === 'metronome') return;
        setCountingIn(i < 0);
        if (i < 0) return;
        resume.current = i;
        const { renderedPages, page, goTo, timeline } = latest.current;
        const rendered = renderedOfEvent(i);
        if (rendered !== current.current) highlight(rendered);
        if (rendered === undefined) return;
        // Turn the page when half of the last measure of the page is played; jumps back for repeats.
        let target = renderedPages[rendered] ?? page;
        const nextRendered = renderedOfEvent(i + 1);
        const nextPage = nextRendered !== undefined ? renderedPages[nextRendered] : undefined;
        if (nextPage && nextPage !== target && progress > 0.5 && timeline) target = nextPage;
        if (target && target !== page) goTo(target);
      },
      onBeat(accent) {
        setBeat(accent ? 'accent' : 'beat');
        setTimeout(() => setBeat(undefined), 90);
      },
      onEnd() {
        if (mode.current === 'metronome') return setMetronomeOnly(false);
        setPlaying(false);
        setCountingIn(false);
        resume.current = undefined;
        highlight(undefined);
      },
    });
    engine.current = e;
    return () => {
      e.dispose();
      engine.current = undefined;
    };
  }, [a.timeline, highlight]);

  /** First playing-order event of the current page (or the paused position if still on that page). */
  const startEvent = (useResume = true): number => {
    const { timeline, renderedPages, page } = latest.current;
    if (!timeline) return 0;
    const r = resume.current;
    if (useResume && r !== undefined) {
      const rendered = renderedOfEvent(r);
      if (rendered !== undefined && renderedPages[rendered] === page) return r;
    }
    const i = timeline.events.findIndex((_, idx) => {
      const rendered = renderedOfEvent(idx);
      return rendered !== undefined && renderedPages[rendered] === page;
    });
    return Math.max(0, i);
  };

  const play = useCallback(async (from?: number) => {
    const e = engine.current;
    if (!e) return;
    const { settings, tempoFactor, metronome } = latest.current;
    if (mode.current === 'metronome') e.pause();
    mode.current = 'scroll';
    setMetronomeOnly(false);
    setPlaying(true);
    await e.play({
      startEventIndex: from ?? startEvent(),
      countInMeasures: settings.countInMeasures,
      countInSound: settings.countInSound,
      tempoFactor,
      metronome,
      volume: settings.metronomeVolume,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pause = useCallback(() => {
    const e = engine.current;
    if (!e) return;
    if (mode.current === 'metronome') {
      e.pause();
      setMetronomeOnly(false);
      mode.current = 'scroll';
      return;
    }
    resume.current = e.pause();
    setPlaying(false);
    setCountingIn(false);
  }, []);

  const toggle = useCallback(() => ((mode.current === 'scroll' && engine.current?.playing) || playing ? pause() : void play()), [play, pause, playing]);

  /** Starts / stops the metronome alone (no auto-scroll), from the first measure of the displayed page. */
  const toggleMetronomeOnly = useCallback(async () => {
    const e = engine.current;
    if (!e) return;
    if (mode.current === 'metronome') return pause();
    if (e.playing) pause();
    const { settings, tempoFactor } = latest.current;
    mode.current = 'metronome';
    setMetronomeOnly(true);
    await e.play({
      startEventIndex: startEvent(false),
      countInMeasures: 0,
      countInSound: false,
      tempoFactor,
      metronome: true,
      volume: settings.metronomeVolume,
    });
  }, [pause]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Next ▶ starts from this MusicXML measure (go to bar); restarts from it right away while scrolling. */
  const startFrom = useCallback(
    (measureIndex: number) => {
      const { timeline } = latest.current;
      const i = timeline ? firstEventOfMeasure(timeline, measureIndex) : -1;
      if (i < 0) return;
      if (mode.current === 'scroll' && engine.current?.playing) {
        engine.current.pause();
        void play(i);
      } else {
        resume.current = i;
      }
    },
    [play],
  );

  useEffect(() => engine.current?.setTempoFactor(a.tempoFactor), [a.tempoFactor]);
  useEffect(() => {
    // The metronome-only mode always clicks, whatever the metronome toggle of the auto-scroll.
    if (mode.current !== 'metronome') engine.current?.setMetronome(a.metronome, a.settings.metronomeVolume);
    else engine.current?.setMetronome(true, a.settings.metronomeVolume);
  }, [a.metronome, a.settings.metronomeVolume]);

  // Pause when the app goes to the background.
  useEffect(() => {
    const onHide = () => document.hidden && pause();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [pause]);

  return { playing, countingIn, beat, metronomeOnly, play, pause, toggle, toggleMetronomeOnly, startFrom, available: !!a.timeline?.events.length };
}
