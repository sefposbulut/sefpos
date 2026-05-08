// Web Audio API ile çok hafif "did" sesi — asset gerektirmez, anında çalar.
// Tarayıcı autoplay politikasına uymak için ilk kullanıcı etkileşiminde
// AudioContext'i resume etmek üzere lazy oluşturulur.

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (_ctx) {
      // Bazı tarayıcılarda kullanıcı etkileşimi öncesi `suspended` kalır.
      if (_ctx.state === 'suspended') {
        _ctx.resume().catch(() => { /* noop */ });
      }
      return _ctx;
    }
    const Ctor =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    _ctx = new Ctor() as AudioContext;
    return _ctx;
  } catch {
    return null;
  }
}

function tone(frequency: number, durationMs: number, gain = 0.18, type: OscillatorType = 'sine'): void {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    // Yumuşak attack/release için hafif zarflama — "did" hissi
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

/** Başarılı tarama: kısa ve net "did" sesi. */
export function playScanSuccess(): void {
  tone(2000, 70, 0.22, 'square');
  // Kısa hafif titreşim (mobil)
  try { (navigator as any)?.vibrate?.(35); } catch { /* noop */ }
}

/** Başarısız / bilinmeyen barkod: alçak çift "buzz". */
export function playScanError(): void {
  tone(380, 90, 0.25, 'sawtooth');
  setTimeout(() => tone(280, 120, 0.22, 'sawtooth'), 90);
  try { (navigator as any)?.vibrate?.([50, 60, 50]); } catch { /* noop */ }
}

/** İlk kullanıcı etkileşiminde AudioContext'i resume etmek için. */
export function primeAudio(): void {
  const ctx = getCtx();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => { /* noop */ });
  }
}
