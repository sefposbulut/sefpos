import React from 'react';
import { publicAsset } from '../lib/assetUrl';

export interface BrandSplashProps {
  hint?: string;
}

/**
 * Marka yükleme ekranı — index.html #boot-splash ile aynı animasyon dili.
 */
export const BrandSplash = React.memo(function BrandSplash({ hint }: BrandSplashProps) {
  return (
    <div
      className="sefpos-brand-splash fixed inset-0 z-[2147483646] flex items-center justify-center"
      style={{
        background: '#ffffff',
        color: '#0f172a',
        fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
      }}
    >
      <div className="flex flex-col items-center gap-4 text-center px-6">
        <div className="sefpos-splash-logo-stage relative">
          <div className="sefpos-splash-glow" aria-hidden />
          <div className="sefpos-splash-orbit" aria-hidden>
            <span className="sefpos-splash-orbit-dot" />
          </div>
          <img
            src={publicAsset('logo.png')}
            alt="ŞefPOS"
            className="sefpos-splash-logo relative z-10 w-28 h-28 rounded-full object-contain bg-white"
            style={{ boxShadow: '0 12px 32px rgba(15, 23, 42, .1)', padding: 6 }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
        <div className="text-2xl font-extrabold tracking-wide text-slate-900">ŞefPOS</div>
        <div className="text-sm font-medium text-slate-500 min-h-[1.25rem]">
          {hint || 'Ortam yükleniyor…'}
        </div>
        <div className="sefpos-splash-spinner mt-1" aria-hidden />
      </div>
    </div>
  );
});
