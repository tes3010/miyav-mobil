// Basit çevrimdışı desteği: uygulama dosyaları önbelleğe alınır.
// Önce ağdan dener (güncel sürüm gelsin), ağ yoksa önbellekten açar.
const CACHE = 'abvoley-v1';
const SHELL = [
  './', 'index.html', 'css/styles.css', 'logo.jpg', 'icon-192.png', 'manifest.json',
  'js/app.js', 'js/config.js', 'js/db.js', 'js/store.js', 'js/util.js', 'js/attendance.js', 'js/import.js',
  'js/pages/home.js', 'js/pages/team.js', 'js/pages/player.js', 'js/pages/reports.js',
  'js/pages/scoreboard.js', 'js/pages/archive.js', 'js/pages/settings.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Veritabanı isteklerine dokunma
  if (url.hostname.endsWith('supabase.co')) return;
  const isCdn = /jsdelivr|googleapis|gstatic/.test(url.hostname);
  if (url.origin !== location.origin && !isCdn) return;

  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
