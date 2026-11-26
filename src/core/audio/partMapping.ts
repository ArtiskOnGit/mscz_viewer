// MIDI tracks/channels → MusicXML parts (spike S7, spikes/s7-midi/):
// webmscore's saveMidi writes a format 1 file with ONE TRACK PER STAFF, in score order, named after the part; all the
// staves of a part share its channels. A part has one channel per MuseScore instrument channel (e.g. trumpet "open" +
// "mute" = 2 channels), drums are on channel 10 (index 9), and past 16 channels MuseScore uses MIDI ports (channel
// index + 16 × port, see midiFile.ts).
import type { MidiFile } from './midiFile';

/** Number of staves of each part of a MusicXML document (`<staves>` of the part's first attributes, default 1). */
export function staffCounts(doc: Document): number[] {
  return Array.from(doc.getElementsByTagName('part')).map((part) => {
    const n = Number(part.getElementsByTagName('staves')[0]?.textContent ?? 1);
    return Number.isInteger(n) && n > 0 ? n : 1;
  });
}

/**
 * Channels of each part (index = part index).
 * Tracks are given to parts in order, `staffCounts[i]` tracks for part i. When the track count does not match the
 * staves (unknown staff count, or an engine that writes one track per part), a track goes to the part of the same
 * name, else to the part of the previous track if it has the same name (another staff), else to the next part.
 */
export function midiChannelsByPart(midi: MidiFile, staffCounts: readonly number[], partNames: readonly string[]): number[][] {
  const byPart: number[][] = staffCounts.map(() => []);
  const tracks = midi.tracks.filter((t) => t.channels.length > 0);
  const add = (part: number, channels: readonly number[]) => {
    const list = byPart[part];
    if (!list) return;
    for (const c of channels) if (!list.includes(c)) list.push(c);
  };
  const totalStaves = staffCounts.reduce((a, b) => a + b, 0);
  if (tracks.length === totalStaves) {
    let t = 0;
    staffCounts.forEach((n, part) => {
      for (let k = 0; k < n; k++) add(part, tracks[t++]!.channels);
    });
  } else {
    let last = -1; // part of the previous track: the next track belongs to it (same name) or to a later part
    let lastName: string | undefined;
    for (const track of tracks) {
      const named = track.name ? partNames.findIndex((n, i) => i >= Math.max(0, last) && n === track.name) : -1;
      const sameAsPrevious = last >= 0 && !!track.name && track.name === lastName; // another staff of that part
      const part = named >= 0 ? named : sameAsPrevious ? last : Math.min(last + 1, partNames.length - 1);
      add(part, track.channels);
      last = part;
      lastName = track.name;
    }
  }
  for (const list of byPart) list.sort((a, b) => a - b);
  return byPart;
}
