/* HLUBINA service worker — precache všeho, cache-first.
   Zásada: instalace NIKDY nespadne celá kvůli jednomu souboru, a navigace
   offline VŽDYCKY dostane index.html (jinak Chrome ukáže "není připojení"). */

const CACHE = 'hlubina-v20';

const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './packs/manifest.json',
];

/* addAll je všechno-nebo-nic: jeden pádek na mizerné síti zabije celý
   precache a uživatel to zjistí až offline. Proto po jednom. */
async function cacheEach(cache, urls) {
  const vysledky = await Promise.allSettled(urls.map(u => cache.add(u)));
  return vysledky.filter(v => v.status === 'fulfilled').length;
}

async function precache() {
  const cache = await caches.open(CACHE);
  await cacheEach(cache, CORE);
  // balíčky dle manifestu — nové packy se precachnou bez změny SW
  try {
    const res = await cache.match('./packs/manifest.json');
    if (!res) return;
    const manifest = await res.json();
    await cacheEach(cache, manifest.map(p => './packs/' + p.file));
  } catch (err) { /* co nedojelo, dotáhne appka na vyžádání */ }
}

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(precache());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k !== CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const hit = await caches.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(e.request);
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const cache = await caches.open(CACHE);
        cache.put(e.request, res.clone());
      }
      return res;
    } catch (err) {
      // Navigace offline musí dostat appku, ne chybovku — jinak Chrome
      // ukáže "není připojení" a Hlubina vůbec nenaběhne.
      if (e.request.mode === 'navigate') {
        const shell = await caches.match('./index.html', { ignoreSearch: true });
        if (shell) return shell;
      }
      return new Response('offline', { status: 503 });
    }
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') return self.skipWaiting();
  // Odpovídá se na MessagePort, který poslal klient (ne clientu samotnému).
  const port = e.ports && e.ports[0];
  if (!port || !e.data) return;

  // Ruční dotažení chybějících souborů (tlačítko "Připravit na offline").
  if (e.data.cmd === 'precache') {
    e.waitUntil((async () => {
      await precache();
      port.postMessage({ cmd: 'precache-hotovo' });
    })());
  }

  // Kolik souborů appky a balíčků reálně leží v cache.
  if (e.data.cmd === 'stav') {
    e.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      const chybi = [];
      for (const u of e.data.urls) {
        if (!(await cache.match(u, { ignoreSearch: true }))) chybi.push(u);
      }
      port.postMessage({ cmd: 'stav-odpoved', celkem: e.data.urls.length, chybi });
    })());
  }
});
