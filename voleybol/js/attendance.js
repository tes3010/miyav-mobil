// Yoklama durumları ve hesaplamalar (sayfalar arasında ortak)

export const STATUSES = [
  { key: 'geldi',   label: 'Geldi',   short: '✓', cls: 's-geldi' },
  { key: 'gelmedi', label: 'Gelmedi', short: '✗', cls: 's-gelmedi' },
  { key: 'izinli',  label: 'İzinli',  short: 'İ', cls: 's-izinli' },
  { key: 'sakat',   label: 'Sakat/Hasta', short: 'S', cls: 's-sakat' },
  { key: 'gec',     label: 'Geç',     short: 'G', cls: 's-gec' },
];
export const STATUS = Object.fromEntries(STATUSES.map(s => [s.key, s]));

// Katılım oranı: (geldi + geç) / toplam kayıt.
// İzinli ve sakat günler ayrıca gösterilir; oranı düşürür ama "mazeretli" sayılır.
export function summarize(rows) {
  const c = { geldi: 0, gelmedi: 0, izinli: 0, sakat: 0, gec: 0, total: 0 };
  for (const r of rows) { c[r.status] = (c[r.status] || 0) + 1; c.total++; }
  c.present = c.geldi + c.gec;
  c.rate = c.total ? Math.round((c.present / c.total) * 100) : null;
  return c;
}

export const rateClass = (r) => (r == null ? '' : r >= 85 ? 'good' : r >= 65 ? 'mid' : 'low');
