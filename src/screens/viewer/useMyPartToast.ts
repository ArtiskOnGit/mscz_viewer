// "Showing your part: Trumpet in B♭ 1" once, when the "My instrument" profile preselected parts on first opening.
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useIonToast } from '@ionic/react';
import type { Part } from '../../core/model/types';

export function useMyPartToast(matchedParts: string[], parts: readonly Part[], ready: boolean, overridden: boolean): void {
  const { t } = useTranslation('viewer');
  const [toast] = useIonToast();
  const shown = useRef(false);
  useEffect(() => {
    // In a setlist, an instrument choice of the piece wins over the profile: nothing to announce.
    if (!ready || !matchedParts.length || overridden || shown.current) return;
    shown.current = true;
    const names = parts.filter((p) => matchedParts.includes(p.musicXmlId)).map((p) => p.name).join(', ');
    void toast({ message: t('myPart', { names }), duration: 2500, position: 'top', cssClass: 'my-part-toast' });
  }, [ready, matchedParts, parts, overridden, toast, t]);
}
