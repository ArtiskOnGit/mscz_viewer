// SoundFont synthesizer of the score audio (ADR-026): spessasynth_lib (Apache-2.0) in an AudioWorklet, loaded LAZILY
// (dynamic import + worklet module + SoundFont fetched only when sound is first needed), on the shared AudioContext.
// Only this file knows spessasynth: the rest of the app talks to `SynthHandle`.
//
// Swapping the SoundFont: change SOUND_BANK (any SF2/SF3/DLS file served from public/, e.g. a bigger General MIDI
// bank such as GeneralUser GS or MuseScore_General.sf3) and scripts/fetch-soundfont.mjs; nothing else depends on it.
// Its licence must allow redistribution in a GPL app, and goes into src/app/thirdPartyLicenses.ts.

export const SOUND_BANK = {
  url: 'soundfonts/FluidR3Mono_GM.sf3',
  id: 'fluidr3mono',
};

/** Decoded (float) sample data kept by the synth; past it, the least recently played samples are decoded again. */
const DECODED_SAMPLE_BUDGET = 96 * 1024 * 1024;
const FADE_S = 0.02;

export interface SynthHandle {
  readonly ctx: AudioContext;
  /** Output before the master volume (connect analysers here in tests). */
  readonly output: AudioNode;
  /** Schedules a raw channel message at `time` (AudioContext seconds; in the past = now). */
  send(message: number[], channel: number, time: number): void;
  /** Linear gain of a MIDI channel (mixer). */
  setChannelGain(channel: number, gain: number): void;
  setMaster(gain: number): void;
  /** Makes sure channels up to `channel` exist (MIDI ports) and channel 10 of every port plays drums. */
  ensureChannels(maxChannel: number): Promise<void>;
  /**
   * Silences everything now, including the messages already queued up to `queuedUntil` (they cannot be cancelled:
   * the output is faded out, reverb tail included, and an "all sound off" follows them). The output stays closed
   * until `open`. Returns the time from which it can be opened again.
   */
  silence(channels: readonly number[], queuedUntil: number): number;
  /** Opens the output (faded in) at `time`. */
  open(time: number): void;
  /** Decodes the samples a MIDI file needs before playing it (no glitch on the first notes). */
  preload(midi: Uint8Array): Promise<void>;
  /** Notes being synthesized (tests, e2e hook). */
  readonly voiceCount: number;
  destroy(): void;
}

let loading: Promise<SynthHandle> | undefined;
let loadedFor: AudioContext | undefined;

/** The synth of this AudioContext, created (and the SoundFont loaded) on the first call. */
export function loadSynth(ctx: AudioContext): Promise<SynthHandle> {
  if (loading && loadedFor === ctx) return loading;
  loadedFor = ctx;
  loading = createSynth(ctx).catch((e: unknown) => {
    loading = undefined;
    throw e;
  });
  return loading;
}

let holders = 0;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;
/** Kept this long after the last viewer closes (setlists open the next piece in a new viewer). */
const KEEP_AFTER_CLOSE_MS = 60_000;

/** A viewer uses the synth: keeps it loaded. Returns the function to call when done. */
export function holdSynth(): () => void {
  holders++;
  clearTimeout(releaseTimer);
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    holders--;
    if (holders === 0) releaseTimer = setTimeout(() => void releaseSynth(), KEEP_AFTER_CLOSE_MS);
  };
}

/** Frees the synth and its SoundFont (memory). The next loadSynth() loads them again. */
export async function releaseSynth(): Promise<void> {
  const current = loading;
  loading = undefined;
  loadedFor = undefined;
  (await current?.catch(() => undefined))?.destroy();
}

async function createSynth(ctx: AudioContext): Promise<SynthHandle> {
  const [{ WorkletSynthesizer, Sequencer }, { default: processorUrl }, bank] = await Promise.all([
    import('spessasynth_lib'),
    import('spessasynth_lib/dist/spessasynth_processor.min.js?url'),
    fetchBank(),
  ]);
  await ctx.audioWorklet.addModule(processorUrl);
  const synth = new WorkletSynthesizer(ctx, { decodedSampleBudget: DECODED_SAMPLE_BUDGET, eventsEnabled: false });
  await synth.isReady;
  await synth.soundBankManager.addSoundBank(bank, SOUND_BANK.id);

  const fade = ctx.createGain();
  const master = ctx.createGain();
  synth.connect(fade);
  fade.connect(master).connect(ctx.destination);

  let sequencer: InstanceType<typeof Sequencer> | undefined;
  let closed = false; // output faded out by silence() until open()

  const handle: SynthHandle = {
    ctx,
    output: fade,
    send(message, channel, time) {
      synth.sendMessage(message, channel - (channel & 0x0f), { time });
    },
    setChannelGain(channel, gain) {
      synth.midiChannels[channel]?.setSystemParameter('gain', gain);
    },
    setMaster(gain) {
      master.gain.setTargetAtTime(gain, ctx.currentTime, 0.015);
    },
    async ensureChannels(maxChannel) {
      for (let tries = 0; synth.midiChannels.length <= maxChannel && tries < 100; tries++) {
        synth.addNewChannel();
        await new Promise((r) => setTimeout(r, 10)); // the channel appears once the worklet confirms it
      }
      for (let c = 25; c < synth.midiChannels.length; c += 16) synth.midiChannels[c]?.setDrums(true);
    },
    silence(channels, queuedUntil) {
      closed = true;
      const now = ctx.currentTime;
      fade.gain.cancelScheduledValues(now);
      fade.gain.setValueAtTime(fade.gain.value, now);
      fade.gain.linearRampToValueAtTime(0, now + FADE_S);
      synth.stopAll(true);
      // Messages already queued in the worklet still play up to `queuedUntil`: cut them right after (stays closed).
      const kill = Math.max(now + FADE_S, queuedUntil + 0.002);
      for (const c of channels) {
        const status = 0xb0 | (c & 0x0f);
        handle.send([status, 123, 0], c, kill); // all notes off
        handle.send([status, 120, 0], c, kill); // all sound off
      }
      return kill + 0.01;
    },
    open(time) {
      if (!closed) return;
      closed = false;
      const at = Math.max(time, ctx.currentTime + FADE_S);
      fade.gain.cancelScheduledValues(at);
      fade.gain.setValueAtTime(0, at);
      fade.gain.linearRampToValueAtTime(1, at + FADE_S);
    },
    async preload(midi) {
      // The library's sequencer decodes the samples of the programs and keys a file uses when it loads it; it is
      // only used for that (never played: notes are sent by MidiPlayer on the shared clock).
      sequencer ??= new Sequencer(synth, { skipToFirstNoteOn: false });
      sequencer.pause();
      const seq = sequencer;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 15000);
        seq.eventHandler.addEvent('songChange', 'pupitre-preload', () => {
          clearTimeout(timer);
          resolve();
        });
        seq.loadNewSongList([{ binary: midi.slice().buffer }]);
      });
      seq.eventHandler.removeEvent('songChange', 'pupitre-preload');
      seq.pause();
      synth.stopAll(true);
    },
    get voiceCount() {
      return synth.voiceCount;
    },
    destroy() {
      sequencer?.pause();
      synth.stopAll(true);
      synth.disconnect(fade);
      fade.disconnect();
      master.disconnect();
      synth.destroy();
    },
  };
  return handle;
}

async function fetchBank(): Promise<ArrayBuffer> {
  const res = await fetch(`${import.meta.env.BASE_URL}${SOUND_BANK.url}`);
  if (!res.ok) throw new Error(`SoundFont ${SOUND_BANK.url}: HTTP ${res.status}`);
  return res.arrayBuffer();
}
