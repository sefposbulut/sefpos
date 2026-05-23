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

function showWipeOverlay(message: string): void {
  if (typeof document === 'undefined') return;
  const id = 'sefpos-wipe-overlay';
  if (document.getElementById(id)) return;
  const el = document.createElement('div');
  el.id = id;
  el.setAttribute(
    'style',
    'position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,0.85);display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;',
  );
  el.innerHTML = `<div style="background:#fff;border-radius:16px;padding:24px;max-width:360px;text-align:center;box-shadow:0 25px 50px rgba(0,0,0,0.25);">
    <div style="font-size:18px;font-weight:800;color:#0f172a;margin-bottom:8px;">Yerel veri temizleniyor</div>
    <div style="font-size:14px;color:#475569;line-height:1.5;">${message}</div>
  </div>`;
  document.body.appendChild(el);
}

/** Lisans panelinden gelen `wipe_local` bildirimi — kasa yerel verisini temizler. */
export async function processWipeLocalNotification(
  notif: {
    id: string;
    type?: string;
    tenant_id?: string | null;
  },
  opts?: { force?: boolean },
): Promise<boolean> {
  if (notif.type !== 'wipe_local') return false;
  if (!opts?.force && getHandledWipeIds().has(notif.id)) return false;

  const api = (window as any).electronAPI;
  const isElectron = !!api;

  if (isElectron && typeof api.wipeLocalData !== 'function') {
    window.alert(
      'Yerel veri temizleme bu sürümde desteklenmiyor.\n\n' +
        'Lütfen ŞefPOS 1.0.202 veya üzeri sürüme güncelleyin, ardından bildirimi tekrar gönderin.',
    );
    return false;
  }

  showWipeOverlay('Kasa önbelleği ve oturum dosyaları siliniyor. Uygulama yeniden başlayacak.');

  try {
    if (api?.wipeLocalData) {
      const res = await api.wipeLocalData();
      if (!res?.success) {
        throw new Error(res?.error || 'Electron yerel silme başarısız');
      }
    }

    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (
          k.startsWith('shefpos_') &&
          k !== 'shefpos_remembered_email' &&
          k !== 'shefpos_remembered_phone' &&
          k !== 'shefpos_remembered_username' &&
          k !== WIPE_HANDLED_KEY
        ) {
          localStorage.removeItem(k);
        }
      }
    } catch {
      /* */
    }

    markWipeHandled(notif.id);

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* */
    }

    window.location.reload();
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[wipe_local]', msg);
    document.getElementById('sefpos-wipe-overlay')?.remove();
    window.alert(`Yerel veri temizlenemedi: ${msg}`);
    return false;
  }
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
