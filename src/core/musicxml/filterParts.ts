// Keep only some parts of a MusicXML score.
//
// MuseScore exports "system" directions (tempo, metronome marks, rehearsal marks, jumps) in the FIRST part
// only. When that part is removed, they are copied to the first kept part at the same rhythmic position,
// otherwise tempo (display and timeline) and rehearsal marks are lost. See ADR-012 and phase 0 results.

export interface XmlEnv {
  DOMParser: typeof DOMParser;
  XMLSerializer: typeof XMLSerializer;
}

export interface FilterResult {
  xml: string;
  /** Number of system directions copied to the first kept part. */
  copiedDirections: number;
}

const SYSTEM_SOUND_ATTRIBUTES = ['tempo', 'dacapo', 'segno', 'dalsegno', 'coda', 'tocoda', 'fine'];

export function filterParts(xml: string, keepIds: readonly string[], env: XmlEnv = globalThis): FilterResult {
  const doc = new env.DOMParser().parseFromString(xml, 'application/xml');
  const keep = new Set(keepIds);
  const parts = elementsByTag(doc, 'part');
  const kept = parts.filter((p) => keep.has(p.getAttribute('id') ?? ''));
  if (kept.length === 0) throw new Error('filterParts: none of the requested parts exist');

  let copiedDirections = 0;
  const source = parts[0];
  const target = kept[0];
  if (source && target && source !== target) {
    copiedDirections = copySystemDirections(source, target);
  }

  for (const p of parts) if (!keep.has(p.getAttribute('id') ?? '')) p.parentNode?.removeChild(p);
  for (const sp of elementsByTag(doc, 'score-part')) if (!keep.has(sp.getAttribute('id') ?? '')) sp.parentNode?.removeChild(sp);
  removeEmptyPartGroups(doc);

  return { xml: new env.XMLSerializer().serializeToString(doc), copiedDirections };
}

function copySystemDirections(source: Element, target: Element): number {
  const srcMeasures = childElements(source, 'measure');
  const dstMeasures = childElements(target, 'measure');
  let srcDivisions = 1;
  let dstDivisions = 1;
  let copied = 0;
  srcMeasures.forEach((measure, i) => {
    srcDivisions = divisionsOf(measure) ?? srcDivisions;
    const dst = dstMeasures[i];
    if (!dst) return;
    dstDivisions = divisionsOf(dst) ?? dstDivisions;
    let time = 0;
    for (const el of childElements(measure)) {
      if ((el.tagName === 'direction' && isSystemDirection(el)) || (el.tagName === 'sound' && hasSystemSound(el))) {
        insertAtTime(dst, el.cloneNode(true) as Element, (time / srcDivisions) * dstDivisions);
        copied++;
      }
      time = advance(el, time);
    }
  });
  return copied;
}

function isSystemDirection(direction: Element): boolean {
  const sound = first(direction, 'sound');
  return Boolean(
    first(direction, 'metronome') || first(direction, 'rehearsal') || first(direction, 'segno') || first(direction, 'coda') ||
      (sound && hasSystemSound(sound)),
  );
}

function hasSystemSound(sound: Element): boolean {
  return SYSTEM_SOUND_ATTRIBUTES.some((a) => sound.hasAttribute(a));
}

/** Advance the time cursor (in divisions) past an element of a <measure>. */
function advance(el: Element, time: number): number {
  const duration = () => Number(first(el, 'duration')?.textContent ?? 0);
  switch (el.tagName) {
    case 'note':
      return first(el, 'chord') ? time : time + duration();
    case 'backup':
      return time - duration();
    case 'forward':
      return time + duration();
    default:
      return time;
  }
}

/** Insert before the first note of the first voice starting at or after `position`. */
function insertAtTime(measure: Element, node: Element, position: number): void {
  let time = 0;
  for (const el of childElements(measure)) {
    if (el.tagName === 'backup') break;
    if (el.tagName === 'note' && !first(el, 'chord') && time >= position - 1e-9) {
      measure.insertBefore(node, el);
      return;
    }
    time = advance(el, time);
  }
  const backup = childElements(measure, 'backup')[0];
  if (backup) measure.insertBefore(node, backup);
  else measure.appendChild(node);
}

/** Remove part-group start/stop pairs that no longer contain any score-part. */
function removeEmptyPartGroups(doc: Document): void {
  const partList = elementsByTag(doc, 'part-list')[0];
  if (!partList) return;
  const open = new Map<string, { start: Element; parts: number }>();
  for (const el of childElements(partList)) {
    const number = el.getAttribute('number') ?? '1';
    if (el.tagName === 'part-group' && el.getAttribute('type') === 'start') {
      open.set(number, { start: el, parts: 0 });
    } else if (el.tagName === 'score-part') {
      for (const g of open.values()) g.parts++;
    } else if (el.tagName === 'part-group' && el.getAttribute('type') === 'stop') {
      const g = open.get(number);
      if (g && g.parts === 0) {
        partList.removeChild(g.start);
        partList.removeChild(el);
      }
      open.delete(number);
    }
  }
}

function divisionsOf(measure: Element): number | undefined {
  const d = first(measure, 'divisions');
  return d ? Number(d.textContent) : undefined;
}

const first = (el: Element, tag: string): Element | undefined => el.getElementsByTagName(tag)[0] ?? undefined;
const elementsByTag = (doc: Document, tag: string): Element[] => Array.from(doc.getElementsByTagName(tag));
const childElements = (el: Element, tag?: string): Element[] =>
  Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (!tag || (n as Element).tagName === tag));
