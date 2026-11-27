// Кэш шрифтов библиотеки: веб-версии шрифтов (web/**/*.woff2) не меняются,
// поэтому после первого скачивания берём их из браузера, без сети.
// Страницу и данные не кэшируем — они всегда свежие с сервера.
const CACHE = 'pada-fonts-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('pada-fonts-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin || !/^\/web\/.+\.woff2$/.test(u.pathname)) return;
  e.respondWith(caches.open(CACHE).then(c => c.match(r).then(hit => hit || fetch(r).then(res => {
    if (res.ok) c.put(r, res.clone());
    return res;
  }))));
});
