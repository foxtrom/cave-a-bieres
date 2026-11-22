// Service worker : garde une copie de l'appli sur le téléphone pour qu'elle
// fonctionne sans réseau (à la cave). Les données, elles, sont dans IndexedDB.
//
// IMPORTANT : changer VERSION à chaque mise en ligne d'une modification,
// sinon l'iPhone continuera d'utiliser l'ancienne copie.

const VERSION = '1.26.0';
const CACHE = `ensen-${VERSION}`;

const FICHIERS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './css/systeme.css',
  './js/app.js',
  './js/beerxml.js',
  './js/brassins.js',
  './js/capsules.js',
  './js/embouteillage.js',
  './js/composants.js',
  './js/dates.js',
  './js/db.js',
  './js/donnees.js',
  './js/etiquettes.js',
  './js/fermentation.js',
  './js/inventaire.js',
  './js/naouri.js',
  './js/outils.js',
  './js/pdf.js',
  './js/polices.js',
  './js/recettes.js',
  './js/refermentation.js',
  './js/ui.js',
  './fonts/JosefinSans-Light.ttf',
  './fonts/JosefinSans-LightItalic.ttf',
  './fonts/JosefinSans-Bold.ttf',
  './fonts/Courgette-Regular.ttf',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    // cache: 'reload' contourne le cache HTTP de GitHub Pages (10 min) pour prendre les fichiers neufs.
    caches.open(CACHE).then((cache) => cache.addAll(FICHIERS.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches
      .keys()
      .then((noms) => Promise.all(noms.filter((nom) => nom.startsWith('ensen-') && nom !== CACHE).map((nom) => caches.delete(nom))))
      .then(() => self.clients.claim()),
  );
});

// Notifications envoyées par le relais RAPT (fermentation stable, Pill, bière prête à boire).
self.addEventListener('push', (evenement) => {
  let message = {};
  try {
    message = evenement.data ? evenement.data.json() : {};
  } catch {
    message = { texte: evenement.data?.text() ?? '' };
  }
  evenement.waitUntil(
    self.registration.showNotification(message.titre || 'Brasserie Ensen', {
      body: message.texte || '',
      tag: message.tag || undefined,
      icon: './icons/icon-192.png',
      data: { url: message.url || '#/' },
    }),
  );
});

// Notification touchée : l'appli s'ouvre sur la fiche du brassin concerné.
self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close();
  const cible = new URL(evenement.notification.data?.url || '#/', self.registration.scope).href;
  evenement.waitUntil(
    (async () => {
      const [fenetre] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (!fenetre) return self.clients.openWindow(cible);
      await fenetre.focus();
      return 'navigate' in fenetre ? fenetre.navigate(cible) : null;
    })(),
  );
});

// L'appli demande l'activation quand on touche « Mettre à jour ».
self.addEventListener('message', (evenement) => {
  if (evenement.data === 'activer') self.skipWaiting();
});

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  if (requete.method !== 'GET' || new URL(requete.url).origin !== self.location.origin) return;
  evenement.respondWith(
    caches.match(requete, { ignoreSearch: true }).then(
      (enCache) =>
        enCache ??
        fetch(requete).catch(() =>
          requete.mode === 'navigate' ? caches.match('./index.html') : Response.error(),
        ),
    ),
  );
});
