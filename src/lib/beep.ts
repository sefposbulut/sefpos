// Web Audio API ile çok hafif "did" sesi — asset gerektirmez.
// AudioContext yalnizca notification.unlockAudio() sonrasi kullanilir.

import { getSharedAudioContext, isAudioUnlocked, unlockAudio } from './notification';

function tone(frequency: number, durationMs: number, gain = 0.18, type: OscillatorType = 'sine'): void {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
  } catch {
    /* noop */
  }
}

export function playScanSuccess(): void {
  if (!isAudioUnlocked()) return;
  tone(2000, 70, 0.22, 'square');
  try { (navigator as any)?.vibrate?.(35); } catch { /* noop */ }
}

export function playScanError(): void {
  if (!isAudioUnlocked()) return;
  tone(380, 90, 0.25, 'sawtooth');
  setTimeout(() => tone(280, 120, 0.22, 'sawtooth'), 90);
  try { (navigator as any)?.vibrate?.([50, 60, 50]); } catch { /* noop */ }
}

/** İlk kullanıcı etkileşiminde — App unlock ile aynı yol. */
export function primeAudio(): void {
  void unlockAudio();
}
