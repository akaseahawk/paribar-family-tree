/* sw.js — offline cache so the app opens with no signal.
   App files: network-first (always the newest version when online, cached copy when offline),
   installed with cache: 'reload' so a stale browser cache can't mix old and new files.
   Google Fonts: cached on first use. */
const CACHE = 'paribar-v2010';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
// The share inbox and caches are named per app, so other sites on the same origin (github.io) are left alone
const APP = ['./', 'index.html', 'css/styles.css', 'js/db.js', 'js/themes.js', 'js/cultures.js', 'js/kinship.js', 'js/demo.js', 'js/aiprompt.js', 'js/family.js', 'js/mindmap.js', 'js/io.js', 'js/speak.js', 'js/checks.js', 'js/visits.js', 'js/dates.js', 'js/treeimage.js', 'js/dupes.js', 'js/app.js',
  'vendor/d3.min.js', 'vendor/fflate.min.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('paribar-v') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  // Android share sheet → Paribar: stash the shared contact, then open the app's Add form
  if (e.request.method === 'POST' && new URL(e.request.url).pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const fd = await e.request.formData();
      const file = fd.get('contact');
      let text = [fd.get('title'), fd.get('text'), fd.get('url')].filter(Boolean).join('\n');
      if (file && file.size) text = await file.text();
      const box = await caches.open('paribar-share');
      await box.put(new URL('__share-inbox', self.registration.scope).href, new Response(JSON.stringify({ text }), { headers: { 'Content-Type': 'application/json' } }));
      return Response.redirect('./?share=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const save = (res) => { if ((res.ok || res.type === 'opaque') && (url.origin === location.origin || FONT_HOSTS.includes(url.host))) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return res; };
  // fonts never change: cache-first. App files: network-first, cache when offline.
  if (FONT_HOSTS.includes(url.host)) { e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then(save))); return; }
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(save)
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
