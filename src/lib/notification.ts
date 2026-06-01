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
 * KURUMSAL ANONS CHIME — TV haber bulteni / havaalani anons tarzi.
 * 5 notali bir "ding-dong-ding-dong-ding" patterni. Sinüs dalga, yumusak
 * attack/decay envelope. Dikkat cekici ama agresif degil.
 *
 * Notalar: E5 → C#6 → A5 → E5 → C#6 (zarif yukselen pattern)
 * ~1.8 saniye toplam.
 */
function playSiren(): Promise<void> {
  return new Promise((resolve) => {
    const ctx = getCtx();
    if (!ctx) return resolve();
    try {
      const now = ctx.currentTime;
      // Kurumsal anons jingle pattern
      const tones = [
        { freq: 659.25, start: 0.0, dur: 0.35 }, // E5
        { freq: 1108.73, start: 0.32, dur: 0.4 }, // C#6
        { freq: 880.0, start: 0.7, dur: 0.4 },   // A5
        { freq: 659.25, start: 1.05, dur: 0.4 }, // E5
        { freq: 1108.73, start: 1.4, dur: 0.55 }, // C#6 (uzun final)
      ];
      // Master gain — toplam volume kontrol
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.45;
      masterGain.connect(ctx.destination);

      for (const t of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        // Sinüs + ufak overtone hissi icin triangle karisim
        osc.type = 'sine';
        osc.frequency.value = t.freq;
        // ADSR-benzeri zarf: yumusak attack, biraz sustain, decay
        gain.gain.setValueAtTime(0, now + t.start);
        gain.gain.linearRampToValueAtTime(0.9, now + t.start + 0.04);
        gain.gain.linearRampToValueAtTime(0.7, now + t.start + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur);
        osc.connect(gain).connect(masterGain);
        osc.start(now + t.start);
        osc.stop(now + t.start + t.dur + 0.02);

        // 2. harmonik (oktav yukari) — daha zengin, profesyonel renk
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = t.freq * 2;
        gain2.gain.setValueAtTime(0, now + t.start);
        gain2.gain.linearRampToValueAtTime(0.15, now + t.start + 0.04);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur);
        osc2.connect(gain2).connect(masterGain);
        osc2.start(now + t.start);
        osc2.stop(now + t.start + t.dur + 0.02);
      }
      setTimeout(() => resolve(), 2000);
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
 * Turkce kurumsal/haber spikeri tonunda konusma sentezi.
 *
 * Voice tercih sirasi (kaliteli kadin sesini onceleyerek):
 *   1) Microsoft Aslı Online (Natural)   — en kaliteli, neural
 *   2) Microsoft Aslı                    — Windows 10/11 default kadin
 *   3) Microsoft Tolga                   — Windows default erkek
 *   4) Google Türkçe                     — Chrome/Edge yedek
 *   5) Herhangi bir tr-* voice
 *
 * Parametre tuning'i:
 *   - rate 0.88  — biraz yavas, anons tonu
 *   - pitch 0.95 — hafif tok ses, otoriter
 *   - volume 1.0 — full
 */
function pickTurkishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const ranked = [
    /microsoft aslı (online|natural)/i,
    /aslı.*natural/i,
    /microsoft aslı/i,
    /aslı/i,
    /microsoft tolga (online|natural)/i,
    /tolga.*natural/i,
    /microsoft tolga/i,
    /tolga/i,
    /google.*türk/i,
    /google.*turkish/i,
  ];
  for (const pat of ranked) {
    const v = voices.find((voice) => pat.test(voice.name));
    if (v) return v;
  }
  const anyTr = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('tr'));
  return anyTr || null;
}

let cachedTrVoice: SpeechSynthesisVoice | null = null;
function getTurkishVoice(): SpeechSynthesisVoice | null {
  if (cachedTrVoice) return cachedTrVoice;
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  cachedTrVoice = pickTurkishVoice(voices);
  return cachedTrVoice;
}

function speakTr(text: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (!('speechSynthesis' in window)) return resolve();
      const synth = window.speechSynthesis;
      synth.cancel();
      const speak = () => {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'tr-TR';
        // Haber spikeri tonu: yavasca anons gibi, hafif tok
        utter.rate = 0.88;
        utter.pitch = 0.95;
        utter.volume = 1.0;
        const v = getTurkishVoice();
        if (v) utter.voice = v;
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        synth.speak(utter);
        // Guvenlik: 8 saniye sonra zorla resolve (uzun cumle olabilir)
        setTimeout(() => resolve(), 8000);
      };
      const voices = synth.getVoices();
      if (voices.length === 0) {
        synth.onvoiceschanged = () => {
          cachedTrVoice = null;
          speak();
        };
        setTimeout(speak, 250);
      } else {
        speak();
      }
    } catch {
      resolve();
    }
  });
}

/**
 * Platform adina gore kurumsal anons metni uret. "Sipariş alındı" tarzi,
 * haber spikeri tonu.
 */
function buildAnnouncement(platformLabel: string): string {
  const platform = (platformLabel || 'Online').trim();
  // Yaygin platform adlarini Turkce telaffuza uygun normalize et
  const norm = platform
    .replace(/^getir.*yemek$/i, 'Getir Yemek')
    .replace(/^getir$/i, 'Getir Yemek')
    .replace(/^yemek.?sepeti$/i, 'Yemeksepeti')
    .replace(/^trendyol.*go.*yemek$/i, 'Trendyol Go Yemek')
    .replace(/^trendyol.*yemek$/i, 'Trendyol Yemek')
    .replace(/^trendyol$/i, 'Trendyol Yemek')
    .replace(/^migros.*yemek$/i, 'Migros Yemek')
    .replace(/^migros$/i, 'Migros Yemek');
  // Anonsta ufak duraksamalar TTS'in daha "haber" gibi okumasini saglar.
  return `Dikkat. ${norm} üzerinden yeni sipariş alındı. Lütfen onayınız bekleniyor.`;
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
      ? `Dikkat. ${count} yeni online sipariş alındı. Lütfen onayınız bekleniyor.`
      : buildAnnouncement(platformLabel);
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
  running: boolean;
  pauseTimerId?: ReturnType<typeof setTimeout>;
}

/** Aynı anda çok bekleyen online siparişte TTS/siren döngüsü PC'yi kilitlemesin */
const MAX_CONCURRENT_ALARMS = 4;

const activeAlarms = new Map<string, ActiveAlarm>();

/**
 * Yeni siparis icin surekli alarm baslat. Aynı orderId ile tekrar
 * cagrilirsa mevcut alarm korunur. localStorage'da sound disabled ise
 * hic baslamaz.
 *
 * Akis: chime (~2sn) + TTS anons (~3sn) + ~1.5sn sessizlik → tekrar.
 * Boylece chime ve anons hic ust uste binmez, profesyonel ve net.
 *
 * Anons her zaman calar — kullanici onaylayana kadar her dongude
 * dikkat cekici ama agresif olmayan haber chime'i + kurumsal anons.
 */
export function startContinuousAlert(
  orderId: string,
  platformLabel: string = 'Online',
  pauseBetweenMs: number = 1500,
): void {
  const enabled = localStorage.getItem('notification_sound_enabled');
  if (enabled === 'false') return;
  if (activeAlarms.has(orderId)) return;

  unlockAudio();

  const announcement = buildAnnouncement(platformLabel);
  const entry: ActiveAlarm = { orderId, platformLabel, running: true };
  activeAlarms.set(orderId, entry);

  const loop = async () => {
    while (entry.running && activeAlarms.has(orderId)) {
      // 1) Haber bulteni chime
      await playSiren();
      if (!entry.running || !activeAlarms.has(orderId)) break;
      // 2) Kurumsal TTS anons
      await speakTr(announcement);
      if (!entry.running || !activeAlarms.has(orderId)) break;
      // 3) Kisa sessizlik (tek timer — 200 ms döngüsü uzun vadede binlerce zamanlayıcı biriktiriyordu)
      await new Promise<void>((r) => {
        const id = window.setTimeout(() => r(), pauseBetweenMs);
        entry.pauseTimerId = id;
      });
    }
  };

  void loop();

  console.log(
    `[notification] Kurumsal anons alarmi baslatildi: ${platformLabel} #${orderId}`,
  );
}

/** Belirli bir siparis icin alarmi durdurur. */
export function stopContinuousAlert(orderId: string): void {
  const a = activeAlarms.get(orderId);
  if (!a) return;
  a.running = false;
  if (a.pauseTimerId != null) window.clearTimeout(a.pauseTimerId);
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
    a.running = false;
    if (a.pauseTimerId != null) window.clearTimeout(a.pauseTimerId);
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
