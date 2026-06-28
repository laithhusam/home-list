// ── قايمة البيت — Service Worker ──────────────────────────
// بيحفظ التطبيق للاستخدام بدون إنترنت

const CACHE_NAME = "beit-v2";

// الملفات اللي لازم تتحفظ عند أول تحميل
const STATIC_ASSETS = [
  "/",
  "/index.html",
];

// الـ CDN resources بتتحفظ بعد أول طلب (cache-first)
const CDN_ORIGINS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "unpkg.com",
];

// ── Install: حفظ الملفات الأساسية ─────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn("SW: بعض الملفات ما اتحفظت:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: مسح الـ caches القديمة ──────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: استراتيجية الخدمة ──────────────────────────────
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // Firebase — دايماً من الشبكة (لا تخزن بالكاش)
  if (url.hostname.includes("firebaseio.com")) {
    event.respondWith(fetch(request).catch(() => {
      return new Response(JSON.stringify(null), {
        headers: { "Content-Type": "application/json" }
      });
    }));
    return;
  }

  // CDN (React, Tesseract, Fonts) — حفظ بعد أول طلب
  if (CDN_ORIGINS.some(origin => url.hostname.includes(origin))) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached); // fallback للـ cache لو الشبكة فشلت
      })
    );
    return;
  }

  // الملفات الأساسية (HTML) — شبكة أولاً ثم cache كـ fallback
  if (request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cached => {
            return cached || caches.match("/index.html");
          });
        })
    );
    return;
  }

  // كل شيء ثاني — شبكة عادية
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
