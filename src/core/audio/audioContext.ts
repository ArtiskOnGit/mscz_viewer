// One AudioContext for the whole app: the metronome, the playback clock and the synth (its AudioWorklet and SoundFont
// are bound to a context) all use it, so they share the same clock. Suspended when no viewer uses it (battery).
let shared: AudioContext | undefined;
let users = 0;

export function acquireAudioContext(): AudioContext {
  if (!shared) {
    setPlaybackAudioSession();
    shared = new AudioContext({ latencyHint: 'interactive' });
    unlock(shared);
  }
  users++;
  return shared;
}

/**
 * iOS (Safari ≥ 16.4, ADR-027): web audio follows the ring/silent switch unless the page declares a "playback"
 * audio session, like a music player. Set before the AudioContext starts. No-op elsewhere.
 */
function setPlaybackAudioSession(): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (!session) return;
  try {
    session.type = 'playback';
  } catch {
    // read-only or unsupported value: keep the default
  }
}

/**
 * WebKit starts an AudioContext only from a user gesture: the context is created in one (play, sound on), and a
 * silent sample played right away unlocks the output for good, even if later sounds start outside a gesture.
 */
function unlock(ctx: AudioContext): void {
  try {
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    source.connect(ctx.destination);
    source.start();
    void ctx.resume().catch(() => undefined);
  } catch {
    // nothing to unlock (tests, old browsers)
  }
}

export function releaseAudioContext(): void {
  users = Math.max(0, users - 1);
  if (users === 0 && shared?.state === 'running') void shared.suspend().catch(() => undefined);
}

/** The context if it was already created (no creation outside a user gesture). */
export const existingAudioContext = (): AudioContext | undefined => shared;

/**
 * Delay between scheduling a sound at `t` and hearing it (s): the visual position is shifted by it so that what is
 * highlighted matches what is heard (Android output latencies are often 20–150 ms). Capped against odd values.
 */
export function outputLatencyOf(ctx: AudioContext): number {
  const l = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
  return Number.isFinite(l) ? Math.min(0.3, Math.max(0, l)) : 0;
}
