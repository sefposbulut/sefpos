export class NotificationSound {
  private audio: HTMLAudioElement | null = null;
  private isEnabled: boolean = true;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audio = new Audio('/notification.mp3');
      this.audio.volume = 0.7;

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

/**
 * Kisa, dikkat cekici alarm tonu (Web Audio API). ~1.1 sn. Tarayicinin
 * autoplay politikasi gerektirdigi icin bir kullanici etkilesimi
 * sonrasi calistirilmali (ilk acilista sessiz olabilir).
 */
function playAlarmTone(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const AudioCtx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return resolve();
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const tones = [
        { freq: 880, start: 0.0, dur: 0.22 },
        { freq: 660, start: 0.25, dur: 0.22 },
        { freq: 880, start: 0.55, dur: 0.22 },
        { freq: 660, start: 0.8, dur: 0.22 },
      ];
      for (const t of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = t.freq;
        gain.gain.setValueAtTime(0, now + t.start);
        gain.gain.linearRampToValueAtTime(0.45, now + t.start + 0.02);
        gain.gain.linearRampToValueAtTime(0, now + t.start + t.dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + t.start);
        osc.stop(now + t.start + t.dur + 0.05);
      }
      setTimeout(() => {
        try {
          ctx.close();
        } catch {
          /* ignore */
        }
        resolve();
      }, 1200);
    } catch {
      resolve();
    }
  });
}

/**
 * Turkce konusma sentezi (SpeechSynthesisUtterance). Windows 10/11'de
 * Microsoft Tolga (tr-TR) voice'u varsayilan olarak yuklu gelir; bulamazsa
 * default voice ile okur.
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
 * Beep + Turkce sesli uyari. Online sipariş geldiğinde çağrılır.
 *  - platformLabel: "Getir", "Yemeksepeti", "Trendyol", "Migros Yemek" vb.
 *  - count: birden fazla sipariş geldiyse "3 yeni Getir siparişi" der.
 *
 * localStorage.notification_sound_enabled = "false" ise sessizdir.
 */
export async function playOnlineOrderAlert(
  platformLabel: string = 'Online',
  count: number = 1,
): Promise<void> {
  const enabled = localStorage.getItem('notification_sound_enabled');
  if (enabled === 'false') return;
  await playAlarmTone();
  const phrase =
    count > 1
      ? `${count} yeni ${platformLabel} siparişi var!`
      : `Yeni ${platformLabel} siparişi var!`;
  await speakTr(phrase);
}

/**
 * Geriye uyumluluk: eski playNotificationSound cagrilari artik
 * yeni alarm tonunu calar.
 */
export function playNotificationSound() {
  void playAlarmTone();
}
