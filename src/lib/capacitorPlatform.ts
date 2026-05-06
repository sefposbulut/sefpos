import { Capacitor } from '@capacitor/core';

/** True when the bundle runs inside a Capacitor native shell (Android / iOS). */
export function isCapacitorNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
