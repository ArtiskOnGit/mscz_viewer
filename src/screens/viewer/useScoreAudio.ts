// Score audio of the viewer (ADR-026): MIDI file of the score + lazily loaded synth → a MidiPlayer for PlaybackEngine,
// and the mixer applied to the synth channels. Nothing audio is loaded until the sound is wanted (switched on, or ▶
// with the sound on): then the synth module, its AudioWorklet and the SoundFont are loaded once for the app.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MixerState, Score } from '../../core/model/types';
import { libraryRepository } from '../../core/services';
import { parseMidi, type MidiFile } from '../../core/audio/midiFile';
import { usedChannels } from '../../core/audio/midiSchedule';
import { MidiPlayer, type ScoreAudioSource } from '../../core/audio/midiPlayer';
import { channelGains, faderGain } from '../../core/audio/mixer';
import { holdSynth, loadSynth, type SynthHandle } from '../../core/audio/synth';
import { acquireAudioContext, existingAudioContext, releaseAudioContext } from '../../core/audio/audioContext';

export type ScoreAudioStatus = 'idle' | 'loading' | 'ready' | 'error';

interface Args {
  score: Score | undefined;
  mixer: MixerState | undefined;
  /** Master volume of the settings, used when the mixer has none. */
  defaultMaster: number;
}

export interface ScoreAudio {
  /** The score has a MIDI file (imported with audio support). */
  available: boolean;
  status: ScoreAudioStatus;
  source: ScoreAudioSource | undefined;
  /** Loads what the sound needs (call from a user gesture). Resolves to the source, undefined if unavailable. */
  prepare(): Promise<ScoreAudioSource | undefined>;
}

export function useScoreAudio({ score, mixer, defaultMaster }: Args): ScoreAudio {
  const [status, setStatus] = useState<ScoreAudioStatus>('idle');
  const [source, setSource] = useState<MidiPlayer>();
  const synthRef = useRef<SynthHandle>(undefined);
  const midiRef = useRef<{ bytes: Uint8Array; file: MidiFile }>(undefined);
  const pending = useRef<Promise<ScoreAudioSource | undefined>>(undefined);
  const release = useRef<{ ctx?: () => void; synth?: () => void }>({});
  const scoreId = score?.id;
  const available = !!score?.hasMidi;

  useEffect(
    () => () => {
      release.current.synth?.();
      release.current.ctx?.();
      release.current = {};
    },
    [],
  );

  const prepare = useCallback((): Promise<ScoreAudioSource | undefined> => {
    if (!scoreId || !available) return Promise.resolve(undefined);
    if (!release.current.ctx) {
      acquireAudioContext();
      release.current.ctx = releaseAudioContext;
    }
    const ctx = existingAudioContext()!;
    void ctx.resume().catch(() => undefined); // in the user gesture
    pending.current ??= (async () => {
      setStatus('loading');
      try {
        release.current.synth ??= holdSynth();
        const [synth, midi] = await Promise.all([loadSynth(ctx), readMidi(scoreId)]);
        if (!midi) throw new Error('no MIDI file');
        await synth.ensureChannels(Math.max(15, ...usedChannels(midi.file.events)));
        await synth.preload(midi.bytes);
        synthRef.current = synth;
        midiRef.current = midi;
        const player = new MidiPlayer(synth, midi.file);
        exposeForTests(synth, midi.file);
        setSource(player);
        setStatus('ready');
        return player;
      } catch (e) {
        console.error('score audio unavailable', e);
        pending.current = undefined;
        setStatus('error');
        return undefined;
      }
    })();
    return pending.current;
  }, [scoreId, available]);

  // Mixer → synth channel gains and master volume.
  const parts = score?.parts;
  useEffect(() => {
    const synth = synthRef.current;
    const midi = midiRef.current;
    if (!synth || !midi || !parts || !source) return;
    const gains = channelGains(parts, mixer);
    for (const c of usedChannels(midi.file.events)) synth.setChannelGain(c, gains.get(c) ?? 1);
    synth.setMaster(faderGain(mixer?.master ?? defaultMaster));
  }, [source, parts, mixer, defaultMaster]);

  return { available, status, source, prepare };
}

async function readMidi(scoreId: string): Promise<{ bytes: Uint8Array; file: MidiFile } | undefined> {
  const bytes = await libraryRepository.readMidi(scoreId);
  return bytes ? { bytes, file: parseMidi(bytes) } : undefined;
}

/** e2e hook (dev server only): level of the synth output and voices, to check that sound is produced. */
function exposeForTests(synth: SynthHandle, midi: MidiFile) {
  if (!import.meta.env.DEV) return;
  const analyser = synth.ctx.createAnalyser();
  analyser.fftSize = 2048;
  synth.output.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let peak = 0;
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
  }, 20);
  const w = window as unknown as { __pupitreAudio?: { stop(): void } };
  w.__pupitreAudio?.stop();
  w.__pupitreAudio = {
    stop: () => clearInterval(timer),
    ...{
      /** Highest absolute sample seen since the last reset. */
      peak: () => peak,
      resetPeak: () => (peak = 0),
      voices: () => synth.voiceCount,
      channels: () => usedChannels(midi.events),
    },
  } as { stop(): void };
}
