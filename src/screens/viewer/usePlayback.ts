// Auto-scroll at the score tempo + metronome, driven by PlaybackEngine.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Timeline } from '../../core/model/types';
import { PlaybackEngine } from '../../core/playback/playbackEngine';
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
  const startEvent = (): number => {
    const { timeline, renderedPages, page } = latest.current;
    if (!timeline) return 0;
    const r = resume.current;
    if (r !== undefined) {
      const rendered = renderedOfEvent(r);
      if (rendered !== undefined && renderedPages[rendered] === page) return r;
    }
    const i = timeline.events.findIndex((_, idx) => {
      const rendered = renderedOfEvent(idx);
      return rendered !== undefined && renderedPages[rendered] === page;
    });
    return Math.max(0, i);
  };

  const play = useCallback(async () => {
    const e = engine.current;
    if (!e) return;
    const { settings, tempoFactor, metronome } = latest.current;
    setPlaying(true);
    await e.play({
      startEventIndex: startEvent(),
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
    resume.current = e.pause();
    setPlaying(false);
    setCountingIn(false);
  }, []);

  const toggle = useCallback(() => (engine.current?.playing || playing ? pause() : void play()), [play, pause, playing]);

  useEffect(() => engine.current?.setTempoFactor(a.tempoFactor), [a.tempoFactor]);
  useEffect(() => engine.current?.setMetronome(a.metronome, a.settings.metronomeVolume), [a.metronome, a.settings.metronomeVolume]);

  // Pause when the app goes to the background.
  useEffect(() => {
    const onHide = () => document.hidden && pause();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [pause]);

  return { playing, countingIn, beat, play, pause, toggle, available: !!a.timeline?.events.length };
}
