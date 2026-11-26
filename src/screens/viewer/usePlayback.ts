// Auto-scroll at the score tempo + metronome, driven by PlaybackEngine.
// "Metronome only" mode: the same engine clicks along the timeline from the first measure of the displayed page
// (tempo changes included), without count-in, highlight or page turns; pages are turned by hand meanwhile.
// Score audio (ADR-026): with the sound on, the engine plays the score's MIDI on the same clock (never in
// "metronome only" mode).
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Timeline } from '../../core/model/types';
import { PlaybackEngine } from '../../core/playback/playbackEngine';
import { eventOfMeasureFrom, firstEventOfMeasure } from '../../core/navigation/navigation';
import { autoScrollPage } from '../../core/navigation/pageTurn';
import type { AppSettings } from '../../core/settings';
import type { ContinuousHandle } from './ContinuousView';
import type { ScoreAudioSource } from '../../core/audio/midiPlayer';

export interface PlaybackAudio {
  on: boolean;
  source: ScoreAudioSource | undefined;
  /** Loads the sound (user gesture); resolves to the source, undefined if unavailable. */
  prepare(): Promise<ScoreAudioSource | undefined>;
}

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
  /** Continuous mode: the view follows the current measure (no page turns) and tells what is on screen. */
  continuous: RefObject<ContinuousHandle | null> | undefined;
  audio?: PlaybackAudio;
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
  const armed = useRef<number | undefined>(undefined); // bar picked by a long press: the next ▶ starts there
  const request = useRef(0); // incremented by each ▶ / pause: a ▶ waiting for the sound is cancelled by a pause
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
        // --- continuous mode: smooth scroll keeping the current system at the reading line ---
        const view = latest.current.continuous?.current;
        if (view) {
          const id = latest.current.measureIds[rendered];
          if (id) view.follow(id, progress);
          // Its page may have been rendered after the highlight was set.
          if (latest.current.settings.highlightMeasure && !latest.current.stageRef.current?.querySelector('g.measure.current')) highlight(rendered);
          return;
        }
        // --- end continuous mode ---
        // --- page turn lookahead (setting): turn before the end of the page; jumps back for repeats ---
        const pageOfEvent = (j: number) => {
          const r = renderedOfEvent(j);
          return r !== undefined ? renderedPages[r] : undefined;
        };
        const target = timeline ? autoScrollPage(pageOfEvent, i, progress, latest.current.settings.turnLookahead, renderedPages[rendered] ?? page) : page;
        if (target && target !== page) goTo(target);
        // --- end page turn lookahead ---
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
    const { timeline, renderedPages, page, measureIds } = latest.current;
    if (!timeline) return 0;
    // --- continuous mode: paused position if still on screen, else the first measure on screen ---
    const view = latest.current.continuous?.current;
    if (view) {
      const r = resume.current;
      const resumeId = r !== undefined ? measureIds[renderedOfEvent(r) ?? -1] : undefined;
      if (useResume && r !== undefined && resumeId && view.isVisible(resumeId)) return r;
      const top = view.firstVisible();
      const m = top ? measureIds.indexOf(top) : -1;
      if (m < 0) return 0;
      const exact = timeline.events.findIndex((_, idx) => renderedOfEvent(idx) === m);
      return Math.max(0, exact >= 0 ? exact : timeline.events.findIndex((_, idx) => (renderedOfEvent(idx) ?? -1) >= m));
    }
    // --- end continuous mode ---
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
    const { settings, tempoFactor, metronome, audio } = latest.current;
    if (mode.current === 'metronome') e.pause();
    mode.current = 'scroll';
    setMetronomeOnly(false);
    setPlaying(true);
    const picked = armed.current;
    armed.current = undefined;
    if (from === undefined && picked !== undefined) from = picked;
    const startEventIndex = from ?? startEvent();
    const req = ++request.current;
    // Sound on: the synth and SoundFont are loaded on the first ▶ (silent playback if they cannot be).
    const source = audio?.on ? (audio.source ?? (await audio.prepare())) : undefined;
    if (req !== request.current || mode.current !== 'scroll') {
      if (mode.current !== 'scroll') setPlaying(false);
      return; // paused / "metronome only" while the sound was loading
    }
    e.setAudio(source, !!source);
    await e.play({
      sound: !!source,
      startEventIndex,
      countInMeasures: settings.countInMeasures,
      countInSound: settings.countInSound,
      tempoFactor,
      metronome,
      volume: settings.metronomeVolume,
      accent: settings.metronomeAccent,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pause = useCallback(() => {
    const e = engine.current;
    request.current++;
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
    e.setAudio(latest.current.audio?.source, false);
    await e.play({
      sound: false,
      startEventIndex: startEvent(false),
      countInMeasures: 0,
      countInSound: false,
      tempoFactor,
      metronome: true,
      volume: settings.metronomeVolume,
      accent: settings.metronomeAccent,
    });
  }, [pause]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Next ▶ starts from this MusicXML measure (go to bar); restarts from it right away while scrolling. */
  const startFrom = useCallback(
    (measureIndex: number) => {
      const { timeline } = latest.current;
      const i = timeline ? firstEventOfMeasure(timeline, measureIndex) : -1;
      if (i < 0) return;
      armed.current = undefined; // replaces a bar picked by a long press
      if (mode.current === 'scroll' && engine.current?.playing) {
        engine.current.pause();
        void play(i);
      } else {
        resume.current = i;
      }
    },
    [play],
  );

  /**
   * Long press on a bar: the next ▶ starts from it (its first occurrence at or after the current position); restarts
   * from it right away while scrolling. Undefined clears the pick. Returns false if the bar is not in the timeline.
   */
  const pickMeasure = useCallback(
    (measureIndex: number | undefined): boolean => {
      const { timeline } = latest.current;
      if (measureIndex === undefined || !timeline) {
        armed.current = undefined;
        return false;
      }
      const scrolling = mode.current === 'scroll' && !!engine.current?.playing;
      const from = scrolling ? (resume.current ?? 0) : startEvent();
      const i = eventOfMeasureFrom(timeline, measureIndex, from);
      if (i < 0) return false;
      if (scrolling) {
        engine.current!.pause();
        void play(i);
      } else {
        armed.current = i;
      }
      return true;
    },
    [play], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => engine.current?.setTempoFactor(a.tempoFactor), [a.tempoFactor]);
  // Sound switched on/off (or loaded) while playing: starts/stops at the current position.
  const audioOn = !!a.audio?.on;
  const audioSource = a.audio?.source;
  useEffect(() => {
    engine.current?.setAudio(audioSource, audioOn && mode.current === 'scroll');
  }, [audioOn, audioSource, a.timeline]);
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

  return { playing, countingIn, beat, metronomeOnly, play, pause, toggle, toggleMetronomeOnly, startFrom, pickMeasure, available: !!a.timeline?.events.length };
}
