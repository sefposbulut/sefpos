// src/lib/notification.ts
//
// Online sipariş için sürekli alarm sistemi. Yemeksepeti / Getir tarzi:
// yeni siparişten sonra zil sürekli çalar, kullanici siparişi onaylayana
// veya manuel olarak susturana kadar durmaz.
//
// Browser autoplay policy: AudioContext yalnizca kullanici etkilesimi
// sonrasi resume edilebilir. Bu yuzden `unlockAudio()` ilk kullanici
// tiklamasinda otomatik cagrilir (App.tsx / OnlineOrders.tsx).

export class NotificationSound {
  private audio: HTMLAudioElement | null = null;
  private isEnabled: boolean = true;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.audio = new Audio('./notification.mp3');
        this.audio.volume = 0.7;
      } catch {
        this.audio = null;
      }
      const savedPreference = localStorage.getItem('notification_sound_enabled');
      if (savedPreference !== null) {
        this.isEnabled = savedPreference === 'true';
      }
    }
  }

  async play() {
    if (!this.isEnabled || !this.audio) return;
    try {
      this.audio.currentTime = 0;
      await this.audio.play();
    } catch (error) {
      console.error('Notification sound error:', error);
    }
  }

  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    localStorage.setItem('notification_sound_enabled', enabled.toString());
  }

  isNotificationEnabled(): boolean {
    return this.isEnabled;
  }
}

export const notificationSound = new NotificationSound();

// ============================================================================
// GLOBAL AUDIO CONTEXT — tek instance, hicbir zaman kapatilmaz
// ============================================================================

let globalAudioCtx: AudioContext | null = null;
let audioUnlocked = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!globalAudioCtx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    try {
      globalAudioCtx = new AC();
    } catch {
      return null;
    }
  }
  if (globalAudioCtx.state === 'suspended') {
    void globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

/**
 * Tarayicinin autoplay politikasini asmak icin AudioContext'i "unlock"
 * eder. Ilk kullanici tiklamasinda otomatik cagrilmali. Sessiz 1 frame
 * calar — kullanici fark etmez ama tarayici izin verir.
 */
export function unlockAudio(): void {
  if (audioUnlocked) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
    audioUnlocked = true;
  } catch {
    /* ignore */
  }
}

/**
 * Sayfa bir kere yuklendiginde ilk kullanici etkilesiminde
 * (click/keydown/touch) audio'yu unlock et. App.tsx'te bir kere
 * cagrilmali.
 */
export function installAudioUnlockOnInteraction(): void {
  if (typeof window === 'undefined') return;
  const handler = () => {
    unlockAudio();
    window.removeEventListener('click', handler, true);
    window.removeEventListener('keydown', handler, true);
    window.removeEventListener('touchstart', handler, true);
  };
  window.addEventListener('click', handler, true);
  window.addEventListener('keydown', handler, true);
  window.addEventListener('touchstart', handler, true);
}

// ============================================================================
// GUCLU ALARM TONU — siren benzeri, alternating frekans
// ============================================================================

/**
 * Polis sireni benzeri, dikkat cekici alarm. ~1.8 saniye surer.
 * 2 alternating frekans (yukse-alcak), square dalga karisik → uyandirici.
 */
function playSiren(): Promise<void> {
  return new Promise((resolve) => {
    const ctx = getCtx();
    if (!ctx) return resolve();
    try {
      const now = ctx.currentTime;
      // 4 alternating tone (high-low-high-low), her biri 0.4sn
      const tones = [
        { freq: 1200, start: 0.0, dur: 0.4, type: 'square' as OscillatorType },
        { freq: 800, start: 0.4, dur: 0.4, type: 'square' as OscillatorType },
        { freq: 1200, start: 0.8, dur: 0.4, type: 'square' as OscillatorType },
        { freq: 800, start: 1.2, dur: 0.4, type: 'square' as OscillatorType },
      ];
      for (const t of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = t.type;
        osc.frequency.value = t.freq;
        gain.gain.setValueAtTime(0, now + t.start);
        gain.gain.linearRampToValueAtTime(0.35, now + t.start + 0.02);
        gain.gain.setValueAtTime(0.35, now + t.start + t.dur - 0.03);
        gain.gain.linearRampToValueAtTime(0, now + t.start + t.dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + t.start);
        osc.stop(now + t.start + t.dur + 0.02);
      }
      setTimeout(() => resolve(), 1700);
    } catch {
      resolve();
    }
  });
}

/**
 * Yumusak 3-nota ring (sirin, ofiste rahatsiz etmez). Yedek olarak
 * tutuluyor — su an siren kullaniyoruz cunku gercek mutfak/restoran
 * gurultusunde duyulmasi gerekiyor.
 */
function playRingTone(): Promise<void> {
  return new Promise((resolve) => {
    const ctx = getCtx();
    if (!ctx) return resolve();
    try {
      const now = ctx.currentTime;
      const tones = [
        { freq: 784.0, start: 0.0, dur: 0.18 },
        { freq: 1046.5, start: 0.18, dur: 0.18 },
        { freq: 1318.5, start: 0.36, dur: 0.32 },
      ];
      for (const t of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = t.freq;
        gain.gain.setValueAtTime(0, now + t.start);
        gain.gain.linearRampToValueAtTime(0.5, now + t.start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + t.start);
        osc.stop(now + t.start + t.dur + 0.05);
      }
      setTimeout(() => resolve(), 700);
    } catch {
      resolve();
    }
  });
}

/**
 * Turkce konusma sentezi. Windows'ta Microsoft Tolga (tr-TR) varsayilan.
 */
function speakTr(text: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (!('speechSynthesis' in window)) return resolve();
      const synth = window.speechSynthesis;
      synth.cancel();
      const speak = () => {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'tr-TR';
        utter.rate = 0.95;
        utter.pitch = 1.0;
        utter.volume = 1.0;
        const voices = synth.getVoices();
        const trVoice = voices.find(
          (v) => v.lang && v.lang.toLowerCase().startsWith('tr'),
        );
        if (trVoice) utter.voice = trVoice;
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        synth.speak(utter);
        setTimeout(() => resolve(), 6000);
      };
      const voices = synth.getVoices();
      if (voices.length === 0) {
        synth.onvoiceschanged = () => speak();
        setTimeout(speak, 200);
      } else {
        speak();
      }
    } catch {
      resolve();
    }
  });
}

/**
 * Tek seferlik beep + TTS. Geriye uyumluluk icin.
 */
export async function playOnlineOrderAlert(
  platformLabel: string = 'Online',
  count: number = 1,
): Promise<void> {
  const enabled = localStorage.getItem('notification_sound_enabled');
  if (enabled === 'false') return;
  unlockAudio();
  await playSiren();
  const phrase =
    count > 1
      ? `${count} yeni ${platformLabel} siparişi var!`
      : `Yeni ${platformLabel} siparişi var!`;
  await speakTr(phrase);
}

/** Geriye uyumluluk. */
export function playNotificationSound() {
  unlockAudio();
  void playSiren();
}

// ============================================================================
// SUREKLI ALARM — siparis onaylanana kadar siren tekrar tekrar calar
// ============================================================================

interface ActiveAlarm {
  orderId: string;
  platformLabel: string;
  timer: number;
}

const activeAlarms = new Map<string, ActiveAlarm>();

/**
 * Yeni siparis icin surekli alarm baslat. Aynı orderId ile tekrar
 * cagrilirsa mevcut alarm korunur. localStorage'da sound disabled ise
 * hic baslamaz.
 *
 * Loop: ~2 saniye siren + 1 saniye sessizlik + tekrar.
 * Her 4. siren'de bir TTS soyler ("Yeni Getir siparisi var!").
 */
export function startContinuousAlert(
  orderId: string,
  platformLabel: string = 'Online',
  intervalMs: number = 3000,
): void {
  const enabled = localStorage.getItem('notification_sound_enabled');
  if (enabled === 'false') return;
  if (activeAlarms.has(orderId)) return;

  unlockAudio();

  let tick = 0;
  const ring = async () => {
    if (!activeAlarms.has(orderId)) return;
    await playSiren();
    tick++;
    // Ilk seferde + her 4. seferde TTS — fazla tekrarlanip rahatsiz etmesin
    if (tick === 1 || tick % 4 === 0) {
      void speakTr(`Yeni ${platformLabel} siparişi var. Lütfen onaylayın.`);
    }
  };

  void ring();
  const timer = window.setInterval(ring, intervalMs);
  activeAlarms.set(orderId, { orderId, platformLabel, timer });

  console.log(
    `[notification] Surekli alarm baslatildi: ${platformLabel} #${orderId} (interval ${intervalMs}ms)`,
  );
}

/** Belirli bir siparis icin alarmi durdurur. */
export function stopContinuousAlert(orderId: string): void {
  const a = activeAlarms.get(orderId);
  if (!a) return;
  clearInterval(a.timer);
  activeAlarms.delete(orderId);
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
  console.log(`[notification] Alarm durduruldu: #${orderId}`);
}

/** Tum aktif alarmlari durdurur (kullanici "sustur" butonuna basinca). */
export function stopAllAlerts(): void {
  for (const a of activeAlarms.values()) {
    clearInterval(a.timer);
  }
  activeAlarms.clear();
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

/** Aktif alarmi olan siparis ID'lerini dondurur. */
export function getActiveAlertOrderIds(): string[] {
  return Array.from(activeAlarms.keys());
}

/** Audio context durumunu disaridan kontrol etmek icin. */
export function getAudioState(): {
  hasContext: boolean;
  state: AudioContextState | 'no-context';
  unlocked: boolean;
} {
  return {
    hasContext: !!globalAudioCtx,
    state: globalAudioCtx?.state ?? 'no-context',
    unlocked: audioUnlocked,
  };
}
