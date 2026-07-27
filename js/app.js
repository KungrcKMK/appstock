// ─────────────────────────────────────────────
// ⚙️ CONFIG — แก้ URL ตรงนี้หลัง Deploy GAS
// ─────────────────────────────────────────────
const GAS_URL = "https://script.google.com/macros/s/AKfycbx72vWVvUgaOgZEnzAc8ltaV-a7Rfx_CL9DK1c-B5nAIOxtrlnbi8_b6bmfnDeAZ_xeaw/exec";

// 🔑 API key — เว้นว่าง = ปิด (fail-open) ระบบทำงานปกติ
// เปิดใช้ต้องทำ 2 ขั้นพร้อมกันเท่านั้น: (1) ใส่รหัสตรงนี้ (2) เพิ่มแถว apiKey ใน Config sheet ให้ค่าตรงกัน
// ทำแค่ขั้นเดียว → GAS ปฏิเสธทุก request → แอปใช้ไม่ได้
const API_KEY = "";

// ─────────────────────────────────────────────
// 🔒 FETCH INTERCEPTOR — แนบ API key ให้ทุก request ที่ยิงไป GAS (ที่เดียว)
//    เว้นว่าง API_KEY → pass-through (ไม่กระทบพฤติกรรมเดิม)
// ─────────────────────────────────────────────
(function() {
  const _origFetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    try {
      if (API_KEY) {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (url.indexOf(GAS_URL) === 0) {
          // GET ?module=... → แนบ &k=
          if (!init || !init.method || String(init.method).toUpperCase() === "GET") {
            const sep = url.indexOf("?") >= 0 ? "&" : "?";
            input = url + sep + "k=" + encodeURIComponent(API_KEY);
          }
          // POST JSON body → ใส่ apiKey ลงใน body
          else if (init && init.body && typeof init.body === "string") {
            try {
              const b = JSON.parse(init.body);
              b.apiKey = API_KEY;
              init = Object.assign({}, init, { body: JSON.stringify(b) });
            } catch (e) { /* body ไม่ใช่ JSON → ปล่อยผ่าน */ }
          }
        }
      }
    } catch (e) { /* interceptor พังก็ยัง fetch ปกติ */ }
    return _origFetch(input, init);
  };
})();

// ─────────────────────────────────────────────
// 💾 OFFLINE CACHE — เก็บ last-good data ใน localStorage
// ─────────────────────────────────────────────
function cacheSet(key, data) {
  try { localStorage.setItem("cache_" + key, JSON.stringify({ t: Date.now(), d: data })); } catch (e) {}
}
function cacheGet(key, maxAgeMs) {
  try {
    const raw = localStorage.getItem("cache_" + key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (maxAgeMs && Date.now() - obj.t > maxAgeMs) return null;
    return obj.d;
  } catch (e) { return null; }
}

// ─────────────────────────────────────────────
// 📶 ONLINE / OFFLINE INDICATOR
// ─────────────────────────────────────────────
function _updateOnlineStatus() {
  const banner = document.getElementById("offlineBanner");
  if (!banner) return;
  if (navigator.onLine) banner.classList.add("hide");
  else banner.classList.remove("hide");
}
window.addEventListener("online",  () => { _updateOnlineStatus(); showToast("กลับมาออนไลน์แล้ว ✅", "success"); });
window.addEventListener("offline", () => { _updateOnlineStatus(); showToast("เน็ตหลุด — แสดงข้อมูลเก่า ⏳", "warn", 4000); });

// ─────────────────────────────────────────────
// SHARED STATE
// ─────────────────────────────────────────────
let currentUser   = "";
let activeModule  = "";          // "COLDROOM" | "SQF" | "MLM"
let crInitDone    = false;

// ─────────────────────────────────────────────
// SHARED UI HELPERS
// ─────────────────────────────────────────────
function showLoading(text = "กำลังประมวลผล...") {
  document.getElementById("loadingText").innerText = text;
  document.getElementById("loadingOverlay").classList.add("active");
}
function hideLoading() {
  document.getElementById("loadingOverlay").classList.remove("active");
}

function showToast(msg, type = "info", timeout = 2800) {
  // normalize type aliases from Cold Room module
  const typeMap = { ok: "success", err: "error", warn: "warn" };
  const t = typeMap[type] || type;
  const el = document.createElement("div");
  el.className = `toast-item toast-${t}`;
  el.textContent = msg;
  document.getElementById("toastContainer").appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0"; el.style.transform = "translateX(20px)";
    setTimeout(() => el.remove(), 250);
  }, timeout);
}

// ── Token Expired Handler ──
function handleTokenExpired(res) {
  if (res && !res.ok && typeof res.message === "string" &&
      res.message.includes("ไม่มีสิทธิ์")) {
    showToast("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่", "error", 4000);
    setTimeout(() => location.reload(), 1500);
    return true;
  }
  return false;
}

// ── Force Refresh — ล้าง SW cache + reload ──
async function forceRefresh() {
  if (!confirm("🔄 อัปเดตแอปใหม่?\n\nจะล้าง cache ทั้งหมดและโหลดหน้าใหม่\n(ข้อมูลที่กรอกไว้จะหาย)")) return;
  try {
    // ยกเลิก Service Worker ทุกตัว
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    // ลบ Cache Storage ทุก cache
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch(e) { /* ถ้า browser ไม่รองรับบางอย่างก็ reload ต่อได้เลย */ }
  // Reload แบบ bypass cache
  location.reload(true);
}

function checkAuth() {
  loadDevice();
  const saved = localStorage.getItem("unified_stock_user");
  if (saved) {
    // session ยังอยู่ → ตรวจ mode session (ไม่ใช้ pref เพื่อป้องกัน auto-redirect)
    const sessionMode = sessionStorage.getItem("appstock_mode_session");
    if (!sessionMode) {
      // ไม่มี session mode → แสดง mode picker ทุกครั้ง (ไม่ auto-redirect)
      showModePicker(saved); return;
    }
    if (sessionMode === "mobile") { window.location.href = "mobile.html"; return; }
    currentUser = saved;
    // คืน adminToken จาก sessionStorage (ถ้ามี — ยังไม่หมดอายุใน GAS cache 30 นาที)
    if (!_adminToken) _adminToken = sessionStorage.getItem("appstock_admin_token") || null;
    document.getElementById("loginOverlay").style.display = "none";
    document.getElementById("mainNav").style.display      = "block";
    document.getElementById("navUser").innerText          = currentUser;
    document.getElementById("navDevice").innerText        = "";
    document.getElementById("rawCurrentUser").innerText   = currentUser;
    // แสดงปุ่มตาม Role
    const currentRole = localStorage.getItem("unified_stock_role") || "user";
    const roleLower  = currentRole.toLowerCase();
    const isAdmin    = roleLower === "admin";
    const isViewer   = roleLower === "viewer";
    const isApprover = roleLower === "admin" || roleLower === "manager";
    const isExecDash = roleLower === "admin" || roleLower === "viewer" || roleLower === "manager";
    const execBtn = document.getElementById("navBtn-EXEC");
    if (execBtn) execBtn.style.display = isExecDash ? "" : "none";
    const rolesBtn = document.getElementById("navBtn-ROLES");
    if (rolesBtn) rolesBtn.style.display = isAdmin ? "" : "none";
    // ตรวจสูตรการผลิต — ระดับหัวหน้าขึ้นไป (ชี้ไปที่ข้อมูล ไม่ใช่ตัวบุคคล)
    const bomHealthBtn = document.getElementById("navBtn-BOMHEALTH");
    if (bomHealthBtn) bomHealthBtn.style.display = isExecDash ? "" : "none";
    const actBtn = document.getElementById("activityNavBtn");
    if (actBtn) actBtn.style.display = isAdmin ? "" : "none";
    const tgBtn = document.getElementById("telegramNavBtn");
    if (tgBtn) tgBtn.style.display = isAdmin ? "" : "none";
    // viewer — ซ่อน tabs ที่แก้ไขข้อมูลใน Cold Room
    if (isViewer) {
      ["stock","workorder","submit","receive","manage"].forEach(t => {
        const btn = document.getElementById("crTabBtn-" + t);
        if (btn) btn.style.display = "none";
      });
    }
    window._appIsViewer = isViewer;
    if (isViewer) document.querySelectorAll(".viewer-hide").forEach(el => el.style.display = "none");
    switchModule(isViewer ? "EXEC" : "COLDROOM");
  }
}

// ─────────────────────────────────────────────
// MODULE SWITCHER
// ─────────────────────────────────────────────
function switchModule(mod) {
  activeModule = mod;

  // hide all
  document.querySelectorAll(".module-section").forEach(el => el.classList.add("hide"));

  // update nav buttons
  ["COLDROOM","SQF","MLM","EXEC","ROLES","BOMHEALTH"].forEach(m => {
    const btn = document.getElementById("navBtn-" + m);
    if (btn) btn.classList.toggle("active", m === mod);
  });

  if (mod === "EXEC") {
    document.getElementById("module-EXEC").classList.remove("hide");
    loadExecDashboard();
  } else if (mod === "BOMHEALTH") {
    document.getElementById("module-BOMHEALTH").classList.remove("hide");
    loadBomHealth();
  } else if (mod === "ROLES") {
    document.getElementById("module-ROLES").classList.remove("hide");
    loadPendingUsers();
  } else if (mod === "COLDROOM") {
    document.getElementById("module-COLDROOM").classList.remove("hide");
    if (!crInitDone) initColdroom();
  } else {
    document.getElementById("module-RAW").classList.remove("hide");
    rawCurrentModule = mod;
    updateRawHeader(mod);
    rawLoadData(true);
  }
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
window.onload = function() { checkAuth(); _updateOnlineStatus(); };

// ─────────────────────────────────────────────
// PWA — Service Worker Registration
// ─────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then(reg => {
        // เช็คอัปเดตใหม่
        reg.addEventListener("updatefound", () => {
          const newSW = reg.installing;
          newSW.addEventListener("statechange", () => {
            if (newSW.state === "installed" && navigator.serviceWorker.controller) {
              // มี version ใหม่ → แจ้ง user
              if (confirm("🔄 มีอัปเดตใหม่! กด OK เพื่อโหลด version ล่าสุด")) {
                newSW.postMessage({ type: "SKIP_WAITING" });
                location.reload();
              }
            }
          });
        });
      })
      .catch(err => console.warn("SW register failed:", err));
  });
}
