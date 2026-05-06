import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
