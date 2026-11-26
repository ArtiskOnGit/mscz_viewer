// Spike S7 (suite) : pistes MIDI d'une partie à deux portées (piano) et d'une batterie, via un MusicXML minimal.
// Usage : node spikes/s7-midi/multistaff.mjs
Object.defineProperty(globalThis, 'navigator', { value: {}, writable: true, configurable: true });
const realFetch = globalThis.fetch;
globalThis.fetch = undefined;
const { default: WebMscore } = await import('webmscore');
const { parseMidi } = await import('../../src/core/audio/midiFile.ts');
await WebMscore.ready;
globalThis.fetch = realFetch;

const note = (step, octave, staff) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type>${staff ? `<staff>${staff}</staff>` : ''}</note>`;
const drum = `<note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>4</duration><instrument id="P3-I39"/><voice>1</voice><type>whole</type></note>`;
const attrs = (extra = '') => `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>${extra}</attributes>`;
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1"><part-list>
<score-part id="P1"><part-name>Flute</part-name><score-instrument id="P1-I1"><instrument-name>Flute</instrument-name></score-instrument><midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>74</midi-program></midi-instrument></score-part>
<score-part id="P2"><part-name>Piano</part-name><score-instrument id="P2-I1"><instrument-name>Piano</instrument-name></score-instrument><midi-instrument id="P2-I1"><midi-channel>2</midi-channel><midi-program>1</midi-program></midi-instrument></score-part>
<score-part id="P3"><part-name>Drumset</part-name><score-instrument id="P3-I39"><instrument-name>Acoustic Snare</instrument-name></score-instrument><midi-instrument id="P3-I39"><midi-channel>10</midi-channel><midi-program>1</midi-program><midi-unpitched>39</midi-unpitched></midi-instrument></score-part>
</part-list>
<part id="P1"><measure number="1">${attrs('<clef><sign>G</sign><line>2</line></clef>')}<sound tempo="120"/>${note('C', 5)}</measure><measure number="2">${note('D', 5)}</measure></part>
<part id="P2"><measure number="1">${attrs('<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>')}${note('E', 4, 1)}<backup><duration>4</duration></backup>${note('C', 3, 2)}</measure><measure number="2">${note('F', 4, 1)}<backup><duration>4</duration></backup>${note('D', 3, 2)}</measure></part>
<part id="P3"><measure number="1">${attrs('<clef><sign>percussion</sign></clef>')}${drum}</measure><measure number="2">${drum}</measure></part>
</score-partwise>`;

const s = await WebMscore.load('musicxml', new TextEncoder().encode(xml), [], true);
const meta = await s.metadata();
const m = parseMidi(await s.saveMidi(true, true));
s.destroy();
meta.parts.forEach((p, i) => console.log(`part ${i} ${p.name} [${p.instrumentId}] program ${p.program}`));
m.tracks.forEach((t, i) => {
  const notes = m.events.filter((e) => e.track === i && e.type === 0x90).map((e) => `${e.channel}:${e.a}@${Math.round(e.ms)}`);
  console.log(`track ${i} ${JSON.stringify(t.name)} channels [${t.channels}] notes ${notes.join(' ')}`);
});
process.exit(0);
