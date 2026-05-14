import { StrictMode, Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { PublicMenu } from './components/PublicMenu';

/**
 * Üst seviye Error Boundary. Tek bir alt component runtime hatası verirse
 * tüm React ağacını çökertip beyaz ekran / inline boot splash'e dönmek
 * yerine kullanıcıya açıklayıcı bir kart gösterir (yenile / oturumu kapat).
 * Geliştirme sırasında stack trace'i de görünür kılar.
 */
type ErrorBoundaryState = { error: Error | null };
class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      console.error('[ŞefPOS] Üst seviye hata:', error, info?.componentStack);
    } catch {}
  }
  private reset = () => {
    this.setState({ error: null });
  };
  private reload = () => {
    try { window.location.reload(); } catch {}
  };
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#ffffff',
          color: '#0f172a',
          fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          zIndex: 2147483646,
        }}
      >
        <div
          style={{
            maxWidth: 520,
            width: '100%',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            boxShadow: '0 12px 32px rgba(15, 23, 42, .08)',
            padding: 24,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
            ŞefPOS — Beklenmedik hata
          </div>
          <div style={{ fontSize: 14, color: '#475569', marginBottom: 16 }}>
            Ekran çizilirken bir sorun oluştu. Lütfen sayfayı yenileyin. Sorun devam
            ederse ayarlardan dil/yazıcı seçimini değiştirip tekrar deneyin veya
            destekle iletişime geçin.
          </div>
          <pre
            style={{
              fontSize: 12,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: 12,
              maxHeight: 160,
              overflow: 'auto',
              color: '#0f172a',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              onClick={this.reload}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                background: '#f97316',
                color: '#fff',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Sayfayı yenile
            </button>
            <button
              onClick={this.reset}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                background: '#fff',
                color: '#0f172a',
                fontWeight: 700,
                border: '1px solid #cbd5e1',
                cursor: 'pointer',
              }}
            >
              Tekrar dene
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/** Dev: eski SW önbelleği (üretim HTML / hash'li chunk) localhost'ta beyaz sayfa yapabiliyor */
if (import.meta.env.DEV && typeof navigator !== 'undefined' && navigator.serviceWorker) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const r of regs) void r.unregister();
  });
}

/** Prod: PWA kaydı (index.html inline script Vite build'de kaybolabiliyor) */
if (import.meta.env.PROD && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL || '/';
    const swPath = `${base}sw.js`.replace(/\/{2,}/g, '/');
    navigator.serviceWorker.register(swPath).catch(() => {});
  });
}

/**
 * Public QR menü modu — `?menu=BRANCH_UUID` ve isteğe bağlı `masa=` / `table=`.
 * Login/Auth bypass: AuthProvider yok; doğrudan PublicMenu render edilir.
 * RLS anon policy'leri sayesinde sadece aktif + menüde görünür kayıtlar gelir.
 */
const params = new URLSearchParams(window.location.search);
const menuBranchId = params.get('menu');
/** QR'da sabit masa / bölüm etiketi (?masa= veya ?table=) */
const qrTableHint = (params.get('masa') || params.get('table') || '').trim();

const root = createRoot(document.getElementById('root')!);

if (menuBranchId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(menuBranchId)) {
  root.render(
    <StrictMode>
      <AppErrorBoundary>
        <PublicMenu branchId={menuBranchId} qrTableHint={qrTableHint} />
      </AppErrorBoundary>
    </StrictMode>
  );
} else {
  root.render(
    <StrictMode>
      <AppErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AppErrorBoundary>
    </StrictMode>
  );
}
