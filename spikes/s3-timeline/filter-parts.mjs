// Prototype CLI : filtrer les parties d'un MusicXML (voir shared/filter-parts.mjs).
// Usage : node s3-timeline/filter-parts.mjs <score.musicxml> <P2,P3> <sortie.musicxml>
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { readFile, writeFile } from 'node:fs/promises';
import { filterParts } from '../shared/filter-parts.mjs';

const [src, ids, out] = process.argv.slice(2);
const { xml, moved } = filterParts(await readFile(src, 'utf8'), ids.split(','), { DOMParser, XMLSerializer });
await writeFile(out, xml);
console.log(`kept ${ids}, moved ${moved} system directions -> ${out}`);
