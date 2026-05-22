/** UI'da "null" / "undefined" metin olarak gorunmesin */
export function displayMetaText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null;
  return s;
}

export function hasDisplayMetaText(value: unknown): boolean {
  return displayMetaText(value) != null;
}
