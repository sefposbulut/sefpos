import { useEffect } from 'react';

const SITE_ORIGIN = 'https://www.sefpos.com.tr';

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  if (typeof document === 'undefined') return;
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string) {
  if (typeof document === 'undefined') return;
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

type SeoHeadProps = {
  title: string;
  description: string;
  path: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

export function SeoHead({ title, description, path, jsonLd }: SeoHeadProps) {
  const canonical = `${SITE_ORIGIN}${path === '/' ? '' : path}`;

  useEffect(() => {
    document.title = title;
    setMeta('description', description);
    setMeta('og:title', title, 'property');
    setMeta('og:description', description, 'property');
    setMeta('og:url', canonical, 'property');
    setCanonical(canonical);

    const scriptId = 'sefpos-jsonld';
    const prev = document.getElementById(scriptId);
    if (prev) prev.remove();

    if (jsonLd) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      document.getElementById(scriptId)?.remove();
    };
  }, [title, description, canonical, jsonLd]);

  return null;
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_ORIGIN}${item.path === '/' ? '' : item.path}`,
    })),
  };
}
