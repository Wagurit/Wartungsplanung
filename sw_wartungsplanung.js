// sw_wartungsplanung.js — Service Worker für die Wartungs Planung
// Aufbau wie bei der Familienbank: Network-First mit Cache als Rückfall,
// Supabase wird nie zwischengespeichert, Update meldet sich beim Client.
//
// WICHTIG: Bei jedem Deploy die Zahl hochzählen. Nur dann merken die
// Geräte, dass es etwas Neues gibt, und zeigen das Update-Banner.
const CACHE = 'wartungsplanung-v9';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Barlow+Condensed:wght@400;600;700;800&family=Barlow:wght@400;500;600&display=swap'
];

// ── INSTALL: Dateien in den Cache legen ──────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // Einzeln, damit eine fehlende Datei nicht die ganze Installation kippt
      .then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {}))))
  );
  // kein skipWaiting hier: der neue Worker wartet, bis der Nutzer zustimmt
});

// ── ACTIVATE: alte Caches wegräumen ──────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Supabase niemals cachen — sonst sieht man veraltete Planungen
  if (url.includes('supabase.co')) return;
  if (e.request.method !== 'GET') return;

  // Network-First für die App selbst, damit Änderungen sofort ankommen
  if (e.request.mode === 'navigate' || url.endsWith('index.html') || url.endsWith('/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.status === 200) {
            const kopie = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, kopie));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then(t => t || caches.match('./index.html')))
    );
    return;
  }

  // Cache-First für Schriften und Bilder, im Hintergrund auffrischen
  e.respondWith(
    caches.match(e.request).then(cached => {
      const netz = fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const kopie = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, kopie));
        }
        return res;
      }).catch(() => cached);
      return cached || netz;
    })
  );
});

// ── MESSAGE: der Client bittet um die Übernahme ──────────────────
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
