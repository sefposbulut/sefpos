/** index.html inline boot splash — React mount sonrası veya zaman aşımında kapat */
export function hideBootSplash(): void {
  try {
    const el = document.getElementById('boot-splash');
    if (el) el.setAttribute('data-force-hide', '1');
  } catch {
    /* ignore */
  }
}
