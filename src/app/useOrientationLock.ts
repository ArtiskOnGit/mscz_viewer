import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import type { OrientationLock } from '../core/settings';

/** Orientation lock setting (Android); no-op in a browser. */
export function useOrientationLock(orientation: OrientationLock, loaded: boolean): void {
  useEffect(() => {
    if (!loaded || !Capacitor.isNativePlatform()) return;
    const run = orientation === 'device' ? ScreenOrientation.unlock() : ScreenOrientation.lock({ orientation });
    void run.catch((e: unknown) => console.warn('Screen orientation', e));
  }, [orientation, loaded]);
}
