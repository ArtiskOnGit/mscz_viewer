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
        const player = new MidiPlayer(synth, midi.file);
        // Score channels + the metronome's dedicated drum channel (core/audio/metronome.ts).
        await synth.ensureChannels(player.metronomeChannel);
        await synth.preload(midi.bytes);
        synthRef.current = synth;
        midiRef.current = midi;
        exposeForTests(synth, midi.file, player.metronomeChannel);
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

/**
 * e2e hook (dev server, or a page where the test set `window.__pupitreE2E`, e.g. the PWA build in e2e/pwa.mjs): level
 * of the synth output and voices, to check that sound is produced; the AudioContext, the synth output and the note-ons
 * sent with their times (e2e/metronome-sync.mjs records the output and measures the click / note alignment).
 */
function exposeForTests(synth: SynthHandle, midi: MidiFile, metronomeChannel: number) {
  if (!import.meta.env.DEV && !(window as { __pupitreE2E?: boolean }).__pupitreE2E) return;
  const analyser = synth.ctx.createAnalyser();
  analyser.fftSize = 2048;
  synth.output.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let peak = 0;
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
  }, 20);
  // Note-ons sent to the synth (channel, AudioContext time), the last 2000. The handle is shared: wrapped once.
  const sent: { channel: number; time: number; key: number }[] = [];
  const tapped = synth as SynthHandle & { __send?: SynthHandle['send']; __setChannelGain?: SynthHandle['setChannelGain'] };
  tapped.__send ??= synth.send.bind(synth);
  const send = tapped.__send;
  // Every message sent (channel, AudioContext time, bytes), the last 50000 (e2e/audio-stay-with-me.mjs rebuilds the
  // program, sounding notes and pitch bend of each channel); the channel gains set by the mixer.
  const log: { channel: number; time: number; message: number[] }[] = [];
  const gains = new Map<number, number>();
  synth.send = (message, channel, time) => {
    if ((message[0]! & 0xf0) === 0x90 && message[2]) {
      sent.push({ channel, time, key: message[1]! });
      if (sent.length > 2000) sent.shift();
    }
    log.push({ channel, time, message: message.slice() });
    if (log.length > 50000) log.splice(0, 10000);
    send(message, channel, time);
  };
  tapped.__setChannelGain ??= synth.setChannelGain.bind(synth);
  const setGain = tapped.__setChannelGain;
  synth.setChannelGain = (channel, gain) => {
    gains.set(channel, gain);
    setGain(channel, gain);
  };
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
      metronomeChannel: () => metronomeChannel,
      ctx: synth.ctx,
      output: synth.output,
      sent: () => sent.slice(),
      log: () => log.slice(),
      clearLog: () => (log.length = 0),
      gains: () => Object.fromEntries(gains),
      /** MIDI tracks (named after the parts) and their channels. */
      tracks: () => midi.tracks.map((t) => ({ name: t.name, channels: t.channels })),
    },
  } as { stop(): void };
}
