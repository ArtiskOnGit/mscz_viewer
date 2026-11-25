// DOMParser / XMLSerializer for unit tests running in Node.
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { XmlEnv } from '../core/musicxml/filterParts';

export const xmlEnv = { DOMParser, XMLSerializer } as unknown as XmlEnv;
export const parseXml = (xml: string): Document => new xmlEnv.DOMParser().parseFromString(xml, 'application/xml');
