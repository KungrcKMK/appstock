// =====================================================
// Service Worker — AppStock PWA
// Cache static assets สำหรับใช้งาน offline บางส่วน
// =====================================================

const CACHE_NAME = "appstock-v5";

// ไฟล์ที่ cache ไว้ใช้ offline
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// CDN ที่ cache ด้วย (fonts, charts, qrcode)
const CDN_CACHE = "appstock-cdn-v1";
const CDN_URLS = [
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
  "https://cdn.jsdelivr.net",
  "https://cdnjs.cloudflare.com"
];

// ──────────────────────────────────────────────────
// Install: cache static files
// ──────────────────────────────────────────────────
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ──────────────────────────────────────────────────
// Activate: ลบ cache เก่า
// ──────────────────────────────────────────────────
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== CDN_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ──────────────────────────────────────────────────
// Fetch: Strategy
//   - GAS API → Network only (ต้องการข้อมูลจริงเสมอ)
//   - CDN fonts/libs → Cache first, fallback network
//   - Static files → Cache first, fallback network
// ──────────────────────────────────────────────────
self.addEventListener("fetch", e => {
  const url = e.request.url;

  // GAS API — ไม่ cache เด็ดขาด
  if (url.includes("script.google.com")) {
    return; // ให้ browser จัดการเอง (network only)
  }

  // CDN assets — Cache first
  if (CDN_URLS.some(cdn => url.startsWith(cdn))) {
    e.respondWith(
      caches.open(CDN_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // Static files — Cache first, fallback network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.method === "GET") {
          caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => {
        // Offline fallback
        if (e.request.destination === "document") {
          return caches.match("./index.html");
        }
      });
    })
  );
});
