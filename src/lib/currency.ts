import { useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

export type TenantCurrencyCode = 'TRY' | 'USD' | 'EUR';

export const TENANT_CURRENCY_OPTIONS: { code: TenantCurrencyCode; label: string }[] = [
  { code: 'TRY', label: 'Türk Lirası (₺)' },
  { code: 'USD', label: 'Amerikan Doları ($)' },
  { code: 'EUR', label: 'Euro (€)' },
];

let activeCurrencyCode: TenantCurrencyCode = 'TRY';

export function normalizeCurrencyCode(raw: unknown): TenantCurrencyCode {
  const s = String(raw || 'TRY').trim().toUpperCase();
  if (s === 'USD' || s === 'EUR') return s;
  return 'TRY';
}

export function syncTenantCurrencyCode(raw: unknown): TenantCurrencyCode {
  activeCurrencyCode = normalizeCurrencyCode(raw);
  return activeCurrencyCode;
}

export function getActiveCurrencyCode(): TenantCurrencyCode {
  return activeCurrencyCode;
}

export function getCurrencySymbol(code: TenantCurrencyCode = activeCurrencyCode): string {
  switch (code) {
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    default:
      return '₺';
  }
}

function localeFor(code: TenantCurrencyCode): string {
  switch (code) {
    case 'USD':
      return 'en-US';
    case 'EUR':
      return 'de-DE';
    default:
      return 'tr-TR';
  }
}

export interface FormatMoneyOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  /** false → sembol ekleme (sadece sayı) */
  withSymbol?: boolean;
}

export function formatMoney(
  amount: number,
  code: TenantCurrencyCode = activeCurrencyCode,
  opts: FormatMoneyOptions = {},
): string {
  const min = opts.minimumFractionDigits ?? 2;
  const max = opts.maximumFractionDigits ?? 2;
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  const formatted = safe.toLocaleString(localeFor(code), {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
  if (opts.withSymbol === false) return formatted;
  return `${formatted} ${getCurrencySymbol(code)}`;
}

export function formatMoneyInt(amount: number, code: TenantCurrencyCode = activeCurrencyCode): string {
  return formatMoney(amount, code, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Birim fiyat — 3,50 gibi ondalıkları korur; 4,00 → 4 ₺ */
export function formatPrice(amount: number, code: TenantCurrencyCode = activeCurrencyCode): string {
  const safe = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  const isWhole = Math.abs(safe - Math.round(safe)) < 0.001;
  return formatMoney(safe, code, {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  });
}

/** Fiş HTML — sembol bitişik (80mm) */
export function formatMoneyReceipt(amount: number, code: TenantCurrencyCode = activeCurrencyCode): string {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  const formatted = safe.toLocaleString(localeFor(code), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted}${getCurrencySymbol(code)}`;
}

export function useCurrency() {
  const { tenant } = useAuth();
  const code = normalizeCurrencyCode((tenant as any)?.currency_code);

  useEffect(() => {
    syncTenantCurrencyCode(code);
  }, [code]);

  return useMemo(
    () => ({
      code,
      symbol: getCurrencySymbol(code),
      format: (amount: number, opts?: FormatMoneyOptions) => formatMoney(amount, code, opts),
      formatInt: (amount: number) => formatMoneyInt(amount, code),
      formatPrice: (amount: number) => formatPrice(amount, code),
    }),
    [code],
  );
}
