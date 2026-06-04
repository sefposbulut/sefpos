import React from 'react';
import { publicAsset } from '../lib/assetUrl';

export interface BrandSplashProps {
  hint?: string;
  /** Kısa oturum yenileme — küçük üst çubuk, tam ekran animasyon yok */
  compact?: boolean;
}

/**
 * Marka yükleme ekranı — index.html #boot-splash ile aynı animasyon dili.
 */
export const BrandSplash = React.memo(function BrandSplash({ hint, compact }: BrandSplashProps) {
  if (compact) {
    return (
      <div
        className="sefpos-brand-splash-compact fixed inset-0 z-[2147483646] flex flex-col bg-white"
        style={{
          color: '#0f172a',
          fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
        }}
      >
        <div className="h-1 w-full bg-slate-100 overflow-hidden shrink-0">
          <div className="sefpos-splash-bar h-full w-1/3 bg-gradient-to-r from-orange-500 to-red-500" />
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-sm font-medium text-slate-500">{hint || 'Yükleniyor…'}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="sefpos-brand-splash fixed inset-0 z-[2147483646] flex items-center justify-center"
      style={{
        background: '#ffffff',
        color: '#0f172a',
        fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
      }}
    >
      <div className="flex flex-col items-center gap-3 text-center px-6">
        <div className="sefpos-splash-logo-stage relative sefpos-splash-logo-stage--fast">
          <div className="sefpos-splash-glow sefpos-splash-glow--fast" aria-hidden />
          <img
            src={publicAsset('logo.png')}
            alt="ŞefPOS"
            className="sefpos-splash-logo relative z-10 w-24 h-24 rounded-full object-contain bg-white sefpos-splash-logo--fast"
            style={{ boxShadow: '0 12px 32px rgba(15, 23, 42, .1)', padding: 6 }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
        <div className="text-xl font-extrabold tracking-wide text-slate-900">ŞefPOS</div>
        <div className="text-sm font-medium text-slate-500 min-h-[1.25rem]">
          {hint || 'Yükleniyor…'}
        </div>
        <div className="sefpos-splash-spinner sefpos-splash-spinner--fast mt-0.5" aria-hidden />
      </div>
    </div>
  );
});
