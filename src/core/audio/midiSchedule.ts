// Pure scheduling helpers of the score audio (MIDI events → synth messages), unit-tested in audio.test.ts.
import type { MidiEvent } from './midiFile';

/** Raw MIDI message for a channel event (status channel = channel mod 16; the port offset is sent apart). */
export function messageOf(e: MidiEvent): number[] {
  const status = e.type | (e.channel & 0x0f);
  return e.type === 0xc0 || e.type === 0xd0 ? [status, e.a] : [status, e.a, e.b];
}

/** Index of the first event at or after `ms` (events sorted by time). */
export function firstEventAt(events: readonly MidiEvent[], ms: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid]!.ms < ms) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Controllers replayed in their original order (parameter number + data entry sequences, bank select).
const SEQUENCED_CCS = new Set([0, 32, 6, 38, 96, 97, 98, 99, 100, 101]);
const RESET_ALL_CONTROLLERS = 121;

/**
 * Messages that put every channel in the state it has at `ms` ("chase"), when starting in the middle of the score:
 * reset of the controllers, then for each channel bank/RPN sequences in order, the last value of the other
 * controllers, the last program and pitch bend before `ms`. Notes started before `ms` are not replayed.
 * Each message comes with its channel (port offset included).
 */
export function chaseMessages(events: readonly MidiEvent[], ms: number, channels: readonly number[]): { channel: number; message: number[] }[] {
  const end = firstEventAt(events, ms);
  const sequenced = new Map<number, MidiEvent[]>();
  const lastCc = new Map<number, Map<number, MidiEvent>>();
  const program = new Map<number, MidiEvent>();
  const bend = new Map<number, MidiEvent>();
  for (let i = 0; i < end; i++) {
    const e = events[i]!;
    if (e.type === 0xb0) {
      if (SEQUENCED_CCS.has(e.a)) {
        const list = sequenced.get(e.channel) ?? [];
        list.push(e);
        sequenced.set(e.channel, list);
      } else if (e.a !== RESET_ALL_CONTROLLERS && e.a < 120) {
        const m = lastCc.get(e.channel) ?? new Map<number, MidiEvent>();
        m.set(e.a, e);
        lastCc.set(e.channel, m);
      }
    } else if (e.type === 0xc0) program.set(e.channel, e);
    else if (e.type === 0xe0) bend.set(e.channel, e);
  }
  const out: { channel: number; message: number[] }[] = [];
  for (const channel of channels) {
    const push = (e: MidiEvent) => out.push({ channel, message: messageOf(e) });
    out.push({ channel, message: [0xb0 | (channel & 0x0f), RESET_ALL_CONTROLLERS, 0] });
    for (const e of sequenced.get(channel) ?? []) push(e);
    const p = program.get(channel);
    if (p) push(p);
    for (const e of lastCc.get(channel)?.values() ?? []) push(e);
    const b = bend.get(channel);
    if (b) push(b);
  }
  return out;
}

/** Channels used by a list of events, sorted. */
export function usedChannels(events: readonly MidiEvent[]): number[] {
  return [...new Set(events.map((e) => e.channel))].sort((a, b) => a - b);
}
