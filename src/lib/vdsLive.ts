import { getVdsApiOrigin, isVdsBackend } from './sqlDb';

/**
 * VDS canlı olay akışı. Masa ekranı bunu dinler; koparsa 20 sn yedek tarama sürer.
 * EventSource Authorization taşıyamadığı için fetch + SSE okuyucusu kullanılır.
 */
export function subscribeVdsLive(onChange: () => void): () => void {
  if (!isVdsBackend() || typeof window === 'undefined') return () => {};
  const origin = getVdsApiOrigin();
  let stopped = false;
  let timer = 0;
  const ac = new AbortController();

  const loop = async () => {
    while (!stopped) {
      try {
        const raw = localStorage.getItem('shefpos_sql_session');
        const token = raw ? JSON.parse(raw)?.access_token : '';
        if (!token) {
          await new Promise((r) => {
            timer = window.setTimeout(r, 5000);
          });
          continue;
        }
        const res = await fetch(`${origin}/vds-api/events`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          await new Promise((r) => {
            timer = window.setTimeout(r, 8000);
          });
          continue;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx = buf.indexOf('\n\n');
          while (idx >= 0) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            if (frame.startsWith('data:')) onChange();
            idx = buf.indexOf('\n\n');
          }
        }
      } catch {
        if (stopped) return;
        await new Promise((r) => {
          timer = window.setTimeout(r, 8000);
        });
      }
    }
  };

  void loop();
  return () => {
    stopped = true;
    ac.abort();
    if (timer) window.clearTimeout(timer);
  };
}
