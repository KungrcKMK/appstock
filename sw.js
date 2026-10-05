// =====================================================
// Service Worker — AppStock PWA
// Cache static assets สำหรับใช้งาน offline บางส่วน
// =====================================================

const CACHE_NAME = "appstock-v78";

// ไฟล์ที่ cache ไว้ใช้ offline
// ⚠️ addAll เป็น all-or-nothing — ไฟล์เดียวโหลดไม่ได้ = ติดตั้งไม่สำเร็จทั้งชุด
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./mobile.html",
  "./manual.html",
  "./js/vendor/qrcode.min.js",
  "./js/vendor/html5-qrcode.min.js",
  "./js/vendor/chart.umd.min.js",
  "./css/tw-desktop.css",
  "./css/tw-mobile.css",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./js/offline.js",
  "./js/utils.js",
  "./js/app.js",
  "./js/auth.js",
  "./js/admin.js",
  "./js/exec.js",
  "./js/coldroom.js",
  "./js/raw.js",
  "./js/alerts.js",
  "./js/report.js",
  "./js/share.js",
  "./js/myhistory.js",
  "./js/import.js",
  "./js/crimport.js",
  "./js/slip.js",
  "./js/docreport.js",
  "./js/rop.js",
  "./js/plan.js",
  "./js/line.js"
];

// CDN ที่ยังใช้: เหลือแค่ฟอนต์ (ข้อ 12 — library ทั้งหมดย้ายมาเก็บในแอปแล้ว)
// ฟอนต์ตอบแบบ opaque (res.ok=false) จึงไม่ถูกเก็บ ออฟไลน์จะใช้ฟอนต์สำรองของเครื่อง — ยอมรับได้
const CDN_CACHE = "appstock-cdn-v2";
const CDN_URLS = [
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com"
];

// ──────────────────────────────────────────────────
// Install: cache static files
// ──────────────────────────────────────────────────
self.addEventListener("install", e => {
  // ⚠️ ต้องดึงจากเซิร์ฟเวอร์จริง (cache: "reload") — GitHub Pages ส่ง max-age=600 มา
  //    ถ้าใช้ค่าปกติ เครื่องที่เพิ่งเปิดแอปภายใน 10 นาทีก่อน deploy จะเอาไฟล์รุ่นเก่าจาก cache ของเบราว์เซอร์
  //    มาใส่ในชุดรุ่นใหม่ แล้วค้างของเก่าไปจนกว่าจะเลื่อนเลขรุ่นอีกรอบ (เจอจริง 2026-10-05: v77 มีไฟล์ของ v76)
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS.map(u => new Request(u, { cache: "reload" }))))
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

  // หลังบ้าน (Cloudflare Worker) และทุกคำขอข้ามโดเมนที่ไม่ใช่ฟอนต์ — ไม่ cache เด็ดขาด ต้องได้ข้อมูลจริงเสมอ
  // ⚠️ ถ้าปล่อยให้ตกไปถึงกิ่ง "Static files" คำตอบ GET ของหลังบ้านจะถูกเก็บแล้วเสิร์ฟของเก่าตลอดไป
  const sameOrigin = url.startsWith(self.location.origin);
  if (!sameOrigin && !CDN_URLS.some(cdn => url.startsWith(cdn))) {
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
