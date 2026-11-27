// What the platform offers: the Android app (Capacitor) or a browser / installed web app (PWA, ADR-027).
import { Capacitor } from '@capacitor/core';

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

/** iPhone / iPad (iPadOS presents itself as a Mac with a touch screen). */
export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Orientation lock: Android app only (iOS Safari and installed web apps cannot lock it). Shown on the dev server too,
 * where the Android screens are tested in a browser.
 */
export const canLockOrientation = (): boolean => isNativeApp() || import.meta.env.DEV;

/** Keep the screen on: Android app, or the Screen Wake Lock API (Chrome, Safari ≥ 16.4). */
export const canKeepAwake = (): boolean => isNativeApp() || (typeof navigator !== 'undefined' && 'wakeLock' in navigator);
