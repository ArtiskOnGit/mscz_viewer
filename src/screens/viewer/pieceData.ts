// Steps shared by the viewer and the setlist preloader: read a score, decide what to display, Verovio options.
import { defaultPartIds, type Score, type ScoreViewState, type Timeline } from '../../core/model/types';
import { libraryRepository, viewStateRepository } from '../../core/services';
import { prepareDisplayXml, type DisplayXml } from '../../core/musicxml/prepareDisplay';
import { initialViewState, type ProfileSettings } from '../../core/profile/myInstrument';
import type { AppSettings } from '../../core/settings';
import { baseKey } from '../../core/music/keys';
import { autoScale, transposeOption, type ViewportOptions } from '../../core/render/renderService';

export interface PieceData {
  score?: Score;
  view: ScoreViewState;
  xml?: string;
  timeline?: Timeline;
  /** Parts preselected from the "My instrument" profile (first opening only). */
  matchedParts: string[];
}

export async function loadPiece(scoreId: string, profile: ProfileSettings): Promise<PieceData> {
  const [score, saved, hasSaved, xml, timeline] = await Promise.all([
    libraryRepository.get(scoreId),
    viewStateRepository.get(scoreId),
    viewStateRepository.has(scoreId),
    libraryRepository.readMusicXml(scoreId),
    libraryRepository.readTimeline(scoreId),
  ]);
  const { view, matchedParts } = score ? initialViewState(saved, hasSaved, score.parts, profile) : { view: saved, matchedParts: [] };
  return { score, view, xml, timeline, matchedParts };
}

/** Parts to display, as a key ("P1,P3"). Empty selection = default parts (those visible in MuseScore). */
export function partsKeyOf(shown: ScoreViewState, score: Score): string {
  return (shown.selectedParts.length ? shown.selectedParts : defaultPartIds(score.parts)).join(',');
}

export type DisplaySettings = Pick<AppSettings, 'multiRests' | 'partNames'>;

export function prepareDisplay(xml: string, partsKey: string, s: DisplaySettings): DisplayXml {
  return prepareDisplayXml(xml, { selectedParts: partsKey ? partsKey.split(',') : [], multiRests: s.multiRests, partNames: s.partNames });
}

export function viewportOf(
  display: DisplayXml,
  shown: ScoreViewState,
  size: { width: number; height: number } | undefined,
  defaultZoom: number,
): ViewportOptions | undefined {
  if (!size || size.width < 50 || size.height < 50) return undefined;
  const factor = typeof shown.zoom === 'number' ? shown.zoom : defaultZoom;
  return {
    width: size.width,
    height: size.height,
    scale: Math.round(autoScale(display.staves, size.width) * factor),
    transpose: transposeOption(shown.transposeSemitones, shown.transposeOctave, display.key && baseKey(display.key, shown.concertPitch), shown.accidentalPreference),
    concertPitch: shown.concertPitch,
  };
}

/** What Verovio must reload for (as opposed to a relayout for a new geometry). */
export function contentKeyOf(partsKey: string, viewport: ViewportOptions, s: DisplaySettings): string {
  return `${partsKey}|${viewport.transpose}|${viewport.concertPitch}|${s.multiRests}|${s.partNames}`;
}

export const sameViewport = (a: ViewportOptions | undefined, b: ViewportOptions) =>
  !!a && a.width === b.width && a.height === b.height && a.scale === b.scale && a.transpose === b.transpose && a.concertPitch === b.concertPitch;
