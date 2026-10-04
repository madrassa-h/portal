/* ============================================================
   sw.js – UNIVERSAL (identische Kopie in jedem Portal-Ordner)
   Ordner wird automatisch erkannt -> eigener Cache, eigene Identität
   ============================================================ */
var MAP = { e: 'eltern', l: 'lehrer', a: 'admin', q: 'lern' };

var PARTS  = self.location.pathname.split('/').filter(Boolean);
var FOLDER = PARTS.length >= 2 ? PARTS[PARTS.length - 2] : 'x';
var PREFIX = 'madrassa-' + FOLDER + '-';
var CACHE  = PREFIX + 'v9';
var IDENTITY = 'identity:' + (MAP[FOLDER] || FOLDER);
var ASSETS = ['./logo.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(ASSETS.map(function (url) {
        return cache.add(url).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

/* löscht nur alte Caches DIESER App, nie die der anderen Portale */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = e.request.url;
  if (e.request.method !== 'GET') { return; }
  if (url.indexOf('firebase') !== -1 || url.indexOf('googleapis') !== -1 ||
      url.indexOf('firestore') !== -1 || url.indexOf('firebaseio') !== -1 ||
      url.indexOf('emailjs') !== -1) { return; }

  /* HTML-Navigation, sw.js und manifest: immer Netzwerk zuerst */
  var alwaysFresh = (e.request.mode === 'navigate') ||
                    /sw\.js(\?|#|$)/.test(url) ||
                    /manifest[^/]*\.json(\?|#|$)/.test(url);

  if (alwaysFresh) {
    e.respondWith(fetch(e.request).catch(function () { return caches.match(e.request); }));
    return;
  }

  /* sonstige Assets: Netzwerk zuerst, Cache als Offline-Fallback */
  e.respondWith(
    fetch(e.request).then(function (res) {
      var clone = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, clone).catch(function () {}); });
      return res;
    }).catch(function () { return caches.match(e.request); })
  );
});

/* ── Push anzeigen ── */
self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (x) {}
  var title = data.title || 'Madrassa Hannover';
  var options = {
    body: data.body || 'Neue Benachrichtigung',
    icon: data.icon || './logo.png',
    badge: data.badge || './logo.png',
    data: { url: data.url || './' },
    vibrate: [200, 100, 200]
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

/* ── Klick öffnet die App auf der Nachrichten-Seite ── */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var baseUrl = (e.notification.data && e.notification.data.url) || './';
  try {
    if (baseUrl.indexOf('http') !== 0) {
      baseUrl = new URL(baseUrl, self.registration.scope).href;
    }
  } catch (x) {}
  var targetUrl = baseUrl.indexOf('#') === -1 ? baseUrl + '#nachrichten' : baseUrl;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        try {
          if (c.url && targetUrl && c.url.split('#')[0] === targetUrl.split('#')[0] && 'focus' in c) {
            c.focus();
            c.postMessage({ type: 'OPEN_NACHRICHTEN' });
            return;
          }
        } catch (x) {}
      }
      for (var j = 0; j < list.length; j++) {
        if ('focus' in list[j]) {
          list[j].focus();
          list[j].postMessage({ type: 'OPEN_NACHRICHTEN' });
          return;
        }
      }
      if (clients.openWindow) { return clients.openWindow(targetUrl); }
    })
  );
});

/* ── Subscription verloren/erneuert -> automatisch neu anmelden ── */
function pushStateGet(key) {
  return new Promise(function (res, rej) {
    var r = indexedDB.open('madrassa-push-state', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
    r.onerror = function () { rej(r.error); };
    r.onsuccess = function () {
      var q = r.result.transaction('kv', 'readonly').objectStore('kv').get(key);
      q.onsuccess = function () { res(q.result || null); };
      q.onerror = function () { rej(q.error); };
    };
  });
}
function urlBase64ToUint8Array(b64) {
  var pad = '='.repeat((4 - b64.length % 4) % 4);
  var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  var out = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
self.addEventListener('pushsubscriptionchange', function (e) {
  e.waitUntil(
    pushStateGet(IDENTITY).then(function (id) {
      if (!id) { return; }
      return self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(id.vapid)
      }).then(function (sub) {
        return fetch(id.server + id.route, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ subscription: sub }, id.body))
        });
      });
    }).catch(function () {})
  );
});