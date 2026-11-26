// One AudioContext for the whole app: the metronome, the playback clock and the synth (its AudioWorklet and SoundFont
// are bound to a context) all use it, so they share the same clock. Suspended when no viewer uses it (battery).
let shared: AudioContext | undefined;
let users = 0;

export function acquireAudioContext(): AudioContext {
  shared ??= new AudioContext({ latencyHint: 'interactive' });
  users++;
  return shared;
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
