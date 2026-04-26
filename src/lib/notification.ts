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

export function playNotificationSound() {
  const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjGJ0fPTgjMGHm7A7+OZUQ0MVqzn77BdGAg+l9r0x3ApBit9y/DajkAKElyx6OmrWBEKSKHh8bllHgU2jNLz1YMzBiByv+3mnFQNCk+q5e+yYBoGP5fY88+AMQUZX7Xn6axaFQlDnN/zuWoeBS+Fz/PYhzcIGmm79+mhUxELS6bo8rJjGgU7k9X0z3suBydzzfHaizsKFl2x5+qsXRkJRp/e8L1rIAU0iPDz2Ic3CRlptP7urFoWCkef3vC9ayAFNIjw89iHNwkZabT+7qxaFgpHn97wvWsgBTSI8PPYhzcJGWm0/u6sWhYKR5/e8L1rIAU0iPDz2Ic3CRlptP7urFoWCkef3vC9ayAFNIjw89iHNwkZabT+7qxaFgpHn97wvWsgBTSI8PPYhzcJGWm0/u6sWhYKR5/e8L1rIAU0iPDz2Ic3CRlptP7urFoWCkef3vC9ayAFNIjw89iHNwkZabT+7qxaFgpHn97wvWsgBTSI8PPYhzcJGWm0/u6sWhYKR5/e8L1rIAU0iPDz2Ic3CRlptP7urFoWCkef3vC9ayAFNIjw89iHNwkZabT+7qxaFgpHn97wvWsgBTSI8PPYhzcJGWm0/u6sWhYKR5/e8L1rIAU0iPDz2Ic3CRlptP7urFoWCkef3vC9ayAFNIjw89iHNwkZabT+7qxaFgpHn97wvWsgBTSI8PPYhzcJGWm0/u6sWhYKR5/e8L1rIAU0iPDz2Ic3CRlptP7urFoWCkef3vC9ayAFNIjw89iHNwkZabT+7qxaFgpHn97wvWsgBTSI8PPYhzcJGWm0/u6sWhYKR5/e8L1rIAU0iPDz2Ic3CRlptP7urFoWCkef3vC9ayAFNIjw89iHNwkZabT+7qxaFgo=');
  audio.volume = 0.5;
  audio.play().catch(e => console.log('Notification sound failed:', e));
}
