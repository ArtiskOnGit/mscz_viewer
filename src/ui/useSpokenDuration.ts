import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { splitDuration } from './format';

/** Duration for screen readers ("5 min 10 s" rather than "5:10"). */
export function useSpokenDuration(): (seconds: number | undefined) => string | undefined {
  const { t } = useTranslation('common');
  return useCallback(
    (seconds: number | undefined) => {
      const d = splitDuration(seconds);
      if (!d) return undefined;
      return d.h ? t('duration.hours', { h: d.h, m: d.m }) : t('duration.minutes', { m: d.m, s: d.s });
    },
    [t],
  );
}
