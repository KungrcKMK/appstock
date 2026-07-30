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

// ─────────────────────────────────────────────
// 📏 NAV HEIGHT — แถบเมนูเป็น 2 แถว ความสูงเปลี่ยนตามความกว้างจอ/จำนวนปุ่มตาม role
//    วัดจริงแล้วเขียนลง --nav-h ให้ทุกโมดูลเว้นระยะบนได้พอดี ไม่โดนเมนูทับ
// ─────────────────────────────────────────────
function _syncNavHeight() {
  const nav = document.getElementById("mainNav");
  if (!nav) return;
  const h = Math.ceil(nav.getBoundingClientRect().height);
  if (h > 0) document.documentElement.style.setProperty("--nav-h", h + "px");
}
let _navWatchOn = false;
function _watchNavHeight() {
  const nav = document.getElementById("mainNav");
  if (!nav) return;
  _syncNavHeight();
  if (_navWatchOn) return;          // checkAuth ถูกเรียกได้หลายรอบ — ผูก listener ครั้งเดียวพอ
  _navWatchOn = true;
  window.addEventListener("resize", _syncNavHeight);
  if (window.ResizeObserver) new ResizeObserver(_syncNavHeight).observe(nav);
}

function checkAuth() {
  loadDevice();
  // ถูกส่งกลับมาเข้าสู่ระบบใหม่เพราะบัตรผ่านหมดอายุ → เติมชื่อไว้ให้เลย ไม่ต้องพิมพ์ซ้ำ
  try {
    const pre = sessionStorage.getItem("appstock_prefill_user");
    if (pre) {
      sessionStorage.removeItem("appstock_prefill_user");
      const inp = document.getElementById("usernameInput");
      if (inp) { inp.value = pre; setTimeout(() => inp.focus(), 100); }
    }
  } catch (e) {}
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
    // 👑 Admin เห็นทุกแท็บ · manager เห็นเฉพาะแท็บ "คำขอ" (อนุมัติ user/viewer ได้)
    const isManager = roleLower === "manager";
    window._appIsAdmin = isAdmin;
    const rolesBtn = document.getElementById("navBtn-ROLES");
    if (rolesBtn) {
      rolesBtn.style.display = (isAdmin || isManager) ? "" : "none";
      // ตั้งป้ายให้ชัดทุกกรณี (ไม่ใช่แค่ตอน manager ไม่งั้นค้างจากรอบก่อน)
      const label = isAdmin ? "👑 Admin" : "✅ อนุมัติผู้ใช้";
      rolesBtn.innerHTML = label + '<span id="adminNavBadge" class="nav-badge" style="display:none;background:var(--sq-high);"></span>';
    }
    // ตรวจสูตรการผลิต — ตอนนี้เปิดให้ admin เท่านั้น
    // (จะเปิดให้ manager ทีหลัง — เปลี่ยนเป็น isExecDash เมื่อพร้อม)
    const canSeeBomHealth = isAdmin;
    const bomHealthBtn = document.getElementById("navBtn-BOMHEALTH");
    if (bomHealthBtn) bomHealthBtn.style.display = canSeeBomHealth ? "" : "none";
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
    _watchNavHeight();   // ปุ่มถูกซ่อน/แสดงตาม role ครบแล้ว ค่อยวัดความสูงเมนู
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
    // ผ่าน adminSwitchTab เพื่อให้ตรรกะซ่อนแท็บตาม role ทำงานด้วย
    adminSwitchTab("pending");
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

// ═══════════════════════════════════════════════════════════
// PWA — ตัวจัดการอัปเดตแอป
//
//   ของเดิมมีปัญหา 3 อย่าง ทำให้ผู้ใช้ค้างอยู่กับเวอร์ชันเก่าโดยไม่รู้ตัว:
//     1. เด้ง confirm() ถามว่าจะอัปเดตไหม — กดยกเลิกทีเดียวคือค้างเวอร์ชันเก่าตลอด
//     2. สั่ง location.reload() ทันทีหลัง postMessage โดยไม่รอ SW ตัวใหม่เข้าคุม
//        โหลดใหม่ก็ยังได้ไฟล์เก่าจาก SW ตัวเดิมอยู่ดี
//     3. ส่ง postMessage SKIP_WAITING ไปทั้งที่ sw.js ไม่มีตัวรับข้อความเลย (ไม่มีผล)
//
//   ของใหม่: sw.js เรียก skipWaiting() ตั้งแต่ตอนติดตั้งอยู่แล้ว
//   จึงรอสัญญาณ controllerchange = SW ตัวใหม่เข้าคุมเรียบร้อย ค่อยโหลดหน้าใหม่
//   ถ้ากำลังกรอกข้อมูลหรือเปิดหน้าต่างอยู่ จะไม่รีเฟรชทับ แต่ขึ้นแถบให้กดเอง
// ═══════════════════════════════════════════════════════════
if ("serviceWorker" in navigator) {

  /**
   * กำลังทำอะไรค้างอยู่มั๊ย — ถ้าใช่ ห้ามรีเฟรชทับ เดี๋ยวของที่กรอกหาย
   *
   * ⚠️ เคยเขียนกว้างเกินไป: เช็คว่ามีช่องกรอกไหนมีค่าอยู่บ้างหรือเปล่า
   *    แต่หน้าวัตถุดิบมีช่อง "เตือนล่วงหน้า" ที่มีค่า 7 ติดมาตลอด
   *    เลยนับว่ายุ่งตลอดเวลา อัปเดตอัตโนมัติไม่มีวันทำงานเลย
   *
   * เกณฑ์ที่ถูก: ยุ่ง = มีหน้าต่างเปิดค้าง หรือ กำลังพิมพ์อยู่จริงๆ
   */
  function _appIsBusy() {
    const openBox = [...document.querySelectorAll('[id$="Modal"],[id$="Overlay"],[id$="Sheet"]')]
      .some(el => el.id !== "loadingOverlay" && el.offsetParent !== null);
    if (openBox) return true;
    const a = document.activeElement;
    return !!(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") && a.type !== "search");
  }

  function _showUpdateBar() {
    if (document.getElementById("swUpdateBar")) return;
    const bar = document.createElement("div");
    bar.id = "swUpdateBar";
    bar.style.cssText =
      "position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;display:flex;align-items:center;" +
      "gap:12px;flex-wrap:wrap;justify-content:center;background:#0e7a3f;color:#fff;" +
      "padding:12px 16px;border-radius:10px;font-weight:700;font-size:13px;" +
      "box-shadow:0 8px 24px rgba(0,0,0,.25);font-family:inherit;";
    bar.innerHTML =
      '<span>🔄 มีเวอร์ชันใหม่พร้อมใช้งานแล้ว</span>' +
      '<button onclick="location.reload()" style="background:#fff;color:#0e7a3f;border:none;' +
      'padding:7px 16px;border-radius:7px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;">' +
      'โหลดเลย</button>';
    document.body.appendChild(bar);
  }

  // SW ตัวใหม่เข้าคุมเมื่อไหร่ = ไฟล์ชุดใหม่พร้อมแล้ว
  let _reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (_reloadingForUpdate) return;                  // กันสั่งโหลดซ้ำซ้อน
    // ⚠️ กรณีกำลังทำงานค้างอยู่ ห้ามตั้งธง — ไม่งั้นรอบต่อไปจะไม่อัปเดตให้อีกเลย
    //    (เคยพลาดตรงนี้: ตั้งธงก่อนเช็ค พอผู้ใช้ยุ่งครั้งเดียวก็ค้างเวอร์ชันเก่าทั้งวัน)
    if (_appIsBusy()) { _showUpdateBar(); return; }
    _reloadingForUpdate = true;
    location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then(reg => {
        // เปิดแอปค้างไว้ทั้งวันก็ยังได้ของใหม่ — เช็คทุก 10 นาที
        setInterval(() => { reg.update().catch(() => {}); }, 10 * 60 * 1000);
        // กลับมาที่แท็บนี้เมื่อไหร่ก็เช็คด้วย
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) reg.update().catch(() => {});
        });
      })
      .catch(err => console.warn("SW register failed:", err));
  });
}
