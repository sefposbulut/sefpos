/**
 * Türkiye 81 il + ilçe SEO verisi, sitemap.xml ve robots.txt üretir.
 * Kaynak: https://github.com/snrylmz/il-ilce-json (js/il-ilce.json)
 *
 * Çalıştır: node scripts/gen-turkey-seo.mjs
 */
import fs from 'fs';
import path from 'path';
import https from 'https';

const SOURCE_URL =
  'https://raw.githubusercontent.com/snrylmz/il-ilce-json/master/js/il-ilce.json';
const SITE_ORIGIN = 'https://www.sefpos.com.tr';

const STATIC_PATHS = [
  '/',
  '/ozellikler',
  '/entegrasyonlar',
  '/fiyatlar',
  '/indir',
  '/bayi',
  '/iletisim',
  '/bolge',
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

/** @param {string} text */
function slugifyTr(text) {
  let s = String(text || '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  const map = {
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

/** @param {string} text */
function displayNameTr(text) {
  const clean = String(text || '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  return clean
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1) : ''))
    .join(' ');
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function main() {
  const raw = await fetchJson(SOURCE_URL);
  const rows = raw.data ?? raw;
  if (!Array.isArray(rows) || rows.length < 81) {
    throw new Error('Beklenen il listesi alınamadı');
  }

  /** @type {{ n: string; s: string; p: number; b: string; d: { n: string; s: string; pop?: string }[] }[]} */
  const provinces = [];
  const slugToProvince = new Map();

  for (const row of rows) {
    const name = displayNameTr(row.il_adi);
    const slug = slugifyTr(name);
    if (!slug) continue;

    const districts = (row.ilceler || []).map((ic) => {
      const dName = displayNameTr(ic.ilce_adi);
      const dSlug = slugifyTr(dName);
      const pop = ic.nufus ? String(ic.nufus).replace(/\./g, '') : undefined;
      return { n: dName, s: dSlug, ...(pop ? { pop } : {}) };
    });

    // Aynı slug çakışması olmasın
    const uniqueDistricts = [];
    const seenD = new Set();
    for (const d of districts) {
      if (!d.s || seenD.has(d.s)) continue;
      seenD.add(d.s);
      uniqueDistricts.push(d);
    }

    uniqueDistricts.sort((a, b) => a.n.localeCompare(b.n, 'tr'));

    const plate = parseInt(String(row.plaka_kodu || '0'), 10) || 0;
    const region = String(row.bolge || '').trim();

    const prov = { n: name, s: slug, p: plate, b: region, d: uniqueDistricts };
    provinces.push(prov);
    slugToProvince.set(slug, prov);
  }

  provinces.sort((a, b) => a.n.localeCompare(b.n, 'tr'));

  let districtCount = 0;
  for (const p of provinces) districtCount += p.d.length;

  console.log(`İl: ${provinces.length}, ilçe: ${districtCount}`);

  const outTs = path.join(process.cwd(), 'src/components/landing/content/turkeyLocations.generated.ts');
  const ts = `/* eslint-disable */
/** Otomatik üretildi — scripts/gen-turkey-seo.mjs — elle düzenlemeyin */
export type DistrictLoc = { n: string; s: string; pop?: string };
export type ProvinceLoc = { n: string; s: string; p: number; b: string; d: DistrictLoc[] };

export const TURKEY_PROVINCES: ProvinceLoc[] = ${JSON.stringify(provinces, null, 2)} as ProvinceLoc[];

const _byProvinceSlug = new Map<string, ProvinceLoc>();
const _byDistrictKey = new Map<string, DistrictLoc>();

for (const prov of TURKEY_PROVINCES) {
  _byProvinceSlug.set(prov.s, prov);
  for (const dist of prov.d) {
    _byDistrictKey.set(\`\${prov.s}/\${dist.s}\`, dist);
  }
}

export function getProvinceBySlug(slug: string): ProvinceLoc | undefined {
  return _byProvinceSlug.get(slug);
}

export function getDistrictBySlugs(provinceSlug: string, districtSlug: string): { province: ProvinceLoc; district: DistrictLoc } | undefined {
  const province = _byProvinceSlug.get(provinceSlug);
  if (!province) return undefined;
  const district = province.d.find((d) => d.s === districtSlug);
  if (!district) return undefined;
  return { province, district };
}

export const TURKEY_STATS = {
  provinceCount: TURKEY_PROVINCES.length,
  districtCount: TURKEY_PROVINCES.reduce((sum, p) => sum + p.d.length, 0),
} as const;
`;

  fs.mkdirSync(path.dirname(outTs), { recursive: true });
  fs.writeFileSync(outTs, ts, 'utf8');
  console.log('wrote', outTs);

  const today = new Date().toISOString().slice(0, 10);
  const urls = [];

  for (const p of STATIC_PATHS) {
    urls.push({ loc: `${SITE_ORIGIN}${p === '/' ? '/' : p}`, priority: p === '/' ? '1.0' : '0.8' });
  }

  for (const prov of provinces) {
    urls.push({
      loc: `${SITE_ORIGIN}/bolge/${prov.s}`,
      priority: '0.7',
    });
    for (const dist of prov.d) {
      urls.push({
        loc: `${SITE_ORIGIN}/bolge/${prov.s}/${dist.s}`,
        priority: '0.6',
      });
    }
  }

  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n    <loc>${xmlEscape(u.loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
      )
      .join('\n') +
    `\n</urlset>\n`;

  const publicDir = path.join(process.cwd(), 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap, 'utf8');
  console.log('wrote public/sitemap.xml', urls.length, 'URL');

  const robots =
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
  fs.writeFileSync(path.join(publicDir, 'robots.txt'), robots, 'utf8');
  console.log('wrote public/robots.txt');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
