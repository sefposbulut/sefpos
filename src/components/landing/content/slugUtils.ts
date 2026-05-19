/** URL slug — Türkçe karakterler ASCII'ye */
export function slugifyTr(text: string): string {
  let s = String(text || '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  const map: Record<string, string> = {
    ç: 'c',
    ğ: 'g',
    ı: 'i',
    ö: 'o',
    ş: 's',
    ü: 'u',
    İ: 'i',
    I: 'i',
  };
  s = s
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('');
  return s
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
