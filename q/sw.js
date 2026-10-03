/* Service Worker – Lern-App (Ordner q) */
const PREFIX = 'madrassa-q-';
const CACHE = PREFIX + 'v5';
const ASSETS = ['logo.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(
        ASSETS.map(function (url) {
          return cache.add(url).catch(function () {});
        })
      );
    }).then(function () { return self.skipWaiting(); })
  );
});

/* Löscht nur alte Caches der Lern-App, nicht die von Eltern-/Admin-Portal */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE; }).map(function (k) {
          return caches.delete(k);
        })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (
    e.request.method !== 'GET' ||
    e.request.url.indexOf('firebase') !== -1 ||
    e.request.url.indexOf('googleapis') !== -1 ||
    e.request.url.indexOf('firestore') !== -1 ||
    e.request.url.indexOf('firebaseio') !== -1 ||
    e.request.url.indexOf('emailjs') !== -1
  ) {
    return;
  }

  var url = e.request.url;
  // HTML, SW und Manifest nie aus dem Cache bevorzugen → Updates kommen immer an
  var isHtml = /\.html(\?|$)/i.test(url) || /\/sw\.js(\?|$)/i.test(url) || /manifest[^/]*\.json(\?|$)/i.test(url) || /\/q\/(\?|$)/.test(url);
  if (isHtml) {
    e.respondWith(
      fetch(e.request).catch(function () {
        return caches.match(e.request);
      })
    );
    return;
  }

  e.respondWith(
    fetch(e.request).then(function (res) {
      var clone = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, clone).catch(function () {}); });
      return res;
    }).catch(function () {
      return caches.match(e.request);
    })
  );
});
