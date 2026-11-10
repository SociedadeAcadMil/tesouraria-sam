// Deixa o app abrir sem internet. Só guarda os arquivos do próprio app: login,
// To Do e OneDrive nunca passam por este cache.
const CACHE = 'sam-tesouraria-v2';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/config.js', 'js/core.js', 'js/store.js', 'js/microsoft.js', 'js/sync.js', 'js/demo.js', 'js/ui.js', 'js/app.js',
  'js/views/inicio.js', 'js/views/fixos.js', 'js/views/projetos.js', 'js/views/orcamento.js', 'js/views/balancete.js', 'js/views/config.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Busca a versão nova na rede e usa o cache quando não há conexão.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
