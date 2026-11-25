// Filtrage des parties d'un MusicXML en conservant les indications « système »
// (tempo, métronome, repères, sauts) que MuseScore n'exporte que dans la première partie.
// Fonctionne dans le navigateur (DOMParser natif) et sous Node (passer @xmldom/xmldom).
export function filterParts(xml, keepIds, { DOMParser, XMLSerializer } = globalThis) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const keep = new Set(keepIds);
  const parts = [...doc.getElementsByTagName('part')];
  const kept = parts.filter(p => keep.has(p.getAttribute('id')));
  if (!kept.length) throw new Error('no part kept');
  const source = parts[0];
  const target = kept[0];
  let moved = 0;
  if (source !== target) {
    const srcMeasures = children(source, 'measure');
    const dstMeasures = children(target, 'measure');
    let srcDiv = 1, dstDiv = 1;
    srcMeasures.forEach((m, i) => {
      srcDiv = divisionsOf(m) ?? srcDiv;
      const dm = dstMeasures[i];
      if (!dm) return;
      dstDiv = divisionsOf(dm) ?? dstDiv;
      let time = 0;
      for (const el of [...m.childNodes].filter(n => n.nodeType === 1)) {
        if (el.tagName === 'direction' && isSystemDirection(el)) {
          insertAt(dm, el.cloneNode(true), (time / srcDiv) * dstDiv);
          moved++;
        } else if (el.tagName === 'sound' && hasSystemSound(el)) {
          insertAt(dm, el.cloneNode(true), (time / srcDiv) * dstDiv);
          moved++;
        }
        time = advance(el, time);
      }
    });
  }
  // Supprimer les parties non conservées et leur déclaration.
  for (const p of parts) if (!keep.has(p.getAttribute('id'))) p.parentNode.removeChild(p);
  for (const sp of [...doc.getElementsByTagName('score-part')]) if (!keep.has(sp.getAttribute('id'))) sp.parentNode.removeChild(sp);
  for (const pg of [...doc.getElementsByTagName('part-group')]) pg.parentNode.removeChild(pg); // simplification du prototype
  return { xml: new XMLSerializer().serializeToString(doc), moved };
}

const children = (el, tag) => [...el.childNodes].filter(n => n.nodeType === 1 && n.tagName === tag);
const first = (el, tag) => el.getElementsByTagName(tag)[0];
function divisionsOf(measure) { const d = first(measure, 'divisions'); return d ? +d.textContent : undefined; }
function isSystemDirection(dir) {
  const sound = first(dir, 'sound');
  return !!(first(dir, 'metronome') || first(dir, 'rehearsal') || first(dir, 'segno') || first(dir, 'coda')
    || (sound && hasSystemSound(sound)));
}
function hasSystemSound(s) {
  return ['tempo', 'dacapo', 'segno', 'dalsegno', 'coda', 'tocoda', 'fine'].some(a => s.hasAttribute(a));
}
function advance(el, time) {
  const dur = () => +(first(el, 'duration')?.textContent ?? 0);
  if (el.tagName === 'note') return first(el, 'chord') ? time : time + dur();
  if (el.tagName === 'backup') return time - dur();
  if (el.tagName === 'forward') return time + dur();
  return time;
}
// Insère l'élément dans la mesure cible avant la première note (voix 1) qui commence à `pos` ou après.
function insertAt(measure, node, pos) {
  let time = 0;
  for (const el of [...measure.childNodes].filter(n => n.nodeType === 1)) {
    if (el.tagName === 'backup') break;
    if (el.tagName === 'note' && !first(el, 'chord') && time >= pos - 1e-9) { measure.insertBefore(node, el); return; }
    time = advance(el, time);
  }
  const backup = children(measure, 'backup')[0];
  backup ? measure.insertBefore(node, backup) : measure.appendChild(node);
}

