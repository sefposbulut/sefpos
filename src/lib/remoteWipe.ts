import { supabase } from './supabase';

const WIPE_HANDLED_KEY = 'shefpos_wipe_handled_ids';

function getHandledWipeIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(WIPE_HANDLED_KEY) || '[]') as string[]);
  } catch {
    return new Set();
  }
}

function markWipeHandled(id: string): void {
  const set = getHandledWipeIds();
  set.add(id);
  localStorage.setItem(WIPE_HANDLED_KEY, JSON.stringify(Array.from(set).slice(-200)));
}

/** Lisans panelinden gelen `wipe_local` bildirimi — kasa yerel verisini temizler. */
export async function processWipeLocalNotification(notif: {
  id: string;
  type?: string;
  tenant_id?: string | null;
}): Promise<boolean> {
  if (notif.type !== 'wipe_local') return false;
  if (getHandledWipeIds().has(notif.id)) return false;

  markWipeHandled(notif.id);

  try {
    const api = (window as any).electronAPI;
    if (api?.wipeLocalData) {
      await api.wipeLocalData();
    }
  } catch {
    /* web */
  }

  try {
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (
        k.startsWith('shefpos_') &&
        k !== 'shefpos_remembered_email' &&
        k !== 'shefpos_remembered_phone' &&
        k !== 'shefpos_remembered_username'
      ) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    /* */
  }

  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    /* */
  }

  window.location.reload();
  return true;
}

export async function sendWipeLocalCommand(tenantId: string, title?: string): Promise<string | null> {
  const { error } = await supabase.from('support_notifications').insert({
    tenant_id: tenantId,
    title: title || 'Yerel veri temizleme',
    message:
      'Yönetici bu kasanın yerel önbelleğini ve oturum dosyalarını silmenizi istedi. Uygulama yeniden başlayacak; bulut verileriniz korunur.',
    type: 'wipe_local',
  });
  return error?.message || null;
}
