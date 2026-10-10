function escapeHtml(v) {
  return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function escapeAttr(v) { return escapeHtml(v); }
// ข้อ 9 รายงานปรับปรุง: ข้อความผู้ใช้ที่ต้องอยู่ "ใน JS string ใน HTML attribute" (เช่น onclick="f('...')")
// ต้อง escape สองชั้น: JS ก่อน แล้ว HTML attribute — escapeJs อย่างเดียว ชื่ออย่าง ถ้วย 8" จะทำ attribute ขาด
function escapeJsAttr(v) { return escapeAttr(escapeJs(v)); }

// ข้อความผิดพลาดเป็นภาษาคน — "Failed to fetch" ไม่บอกผู้ใช้ว่าต้องทำอะไรต่อ (QA M16 · คู่กับ mNetErr ใน mobile.html)
// ข้อความที่หลังบ้านตอบมาเอง (ภาษาไทยอยู่แล้ว) ผ่านไปตามเดิม
function netErrorText(e) {
  const m = String((e && e.message) || e || "");
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) return "เชื่อมต่อไม่ได้ — ตรวจสัญญาณเน็ตแล้วลองใหม่";
  if (/abort|timeout/i.test(m)) return "รอนานเกินไป — ลองใหม่อีกครั้ง";
  return m || "เกิดข้อผิดพลาด — ลองใหม่อีกครั้ง";
}

// ── อ่านคำตอบจาก GAS ให้ปลอดภัย ──
// บางจังหวะ Google ตอบเป็นหน้า HTML ("ไม่พบเพจ" 404 ที่ชั้น redirect / หน้าจำกัดการเรียก) แทน JSON
// ไม่ใช่ข้อมูลพัง มักหายเองในไม่กี่วินาที — แปลงเป็นข้อความที่คนอ่านรู้เรื่องแทน "Unexpected token '<'"
// (js/app.js ดัก fetch ให้ res.json() ของทุกคำขอไป GAS มาใช้ตัวนี้ — ทุกหน้าได้ประโยชน์โดยไม่ต้องแก้ทีละที่)
// ── ข้อ 11: โหลดไลบรารีหนักเมื่อจะใช้ (Chart.js 206KB, สแกน QR 375KB, QRCode) ไม่ถ่วงตอนเปิดแอป ──
// ไฟล์ยังอยู่ใน STATIC_ASSETS ของ sw.js → ออฟไลน์ก็โหลดได้จาก cache · เรียกซ้ำได้ คืน promise เดิม
const _vendorSrc = { chart: "js/vendor/chart.umd.min.js", qrscan: "js/vendor/html5-qrcode.min.js", qrcode: "js/vendor/qrcode.min.js" };
const _vendorLoaded = {};
function loadVendor(name) {
  if (_vendorLoaded[name]) return _vendorLoaded[name];
  _vendorLoaded[name] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = _vendorSrc[name]; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { delete _vendorLoaded[name]; reject(new Error("โหลดไลบรารี " + name + " ไม่ได้")); };
    document.head.appendChild(s);
  });
  return _vendorLoaded[name];
}

// ── ข้อ 1: บอกเซิร์ฟเวอร์ให้ส่งข้อความ Telegram ที่ต่อคิวไว้ — ยิงแล้วไม่รอ ไม่กระทบเวลารอของผู้ใช้ ──
// (เซิร์ฟเวอร์ต่อคิวตอนบันทึกแล้วตอบทันที ตัวส่งจริงวิ่งในคำขอนี้ซึ่งไม่มีใครรอ) · รวมหลายการบันทึกใน 1.5 วิเป็นครั้งเดียว
let _tgFlushTimer = null;
function tgFlushSoon() {
  if (_tgFlushTimer) return;
  _tgFlushTimer = setTimeout(() => {
    _tgFlushTimer = null;
    try {
      fetch(GAS_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ module: "SYSTEM", action: "TGFLUSH" }), keepalive: true }).catch(() => {});
    } catch (e) {}
  }, 1500);
}

async function gasJson(res) {
  const txt = await res.text();
  try { return JSON.parse(txt); }
  catch (e) {
    const err = new Error(/^\s*</.test(txt)
      ? "เซิร์ฟเวอร์ตอบไม่ปกติชั่วคราว — ลองใหม่อีกครั้งได้เลย"
      : "คำตอบจากเซิร์ฟเวอร์อ่านไม่ได้");
    err.gasHtml = true;
    throw err;
  }
}

// ─────────────────────────────────────────────
// POKA-YOKE: Double-submit guard
// ใช้ครอบฟังก์ชัน async ที่ผูกกับปุ่ม เพื่อกันกดซ้ำ
// ─────────────────────────────────────────────
async function guardedClick(btn, fn) {
  if (!btn || btn.disabled) return;
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.style.opacity = "0.6";
  btn.style.cursor = "wait";
  try { return await fn(); }
  finally {
    btn.disabled = false;
    btn.style.opacity = "";
    btn.style.cursor = "";
    btn.innerHTML = orig;
  }
}

// ─────────────────────────────────────────────
// AUTOCOMPLETE UTILITY (ใช้ร่วมทุก module)
// getItems() → [{label, sub?, badge?, value}]
// onSelect(item, inputEl)
// ─────────────────────────────────────────────
function buildAutocomplete(inputEl, getItems, onSelect) {
  if (!inputEl) return null;
  const drop = document.createElement("div");
  drop.className = "ac-dropdown";
  document.body.appendChild(drop);
  let _items = [], _active = -1;

  function reposition() {
    const r = inputEl.getBoundingClientRect();
    drop.style.top   = (r.bottom + 4) + "px";
    drop.style.left  = r.left + "px";
    drop.style.width = Math.max(r.width, 240) + "px";
  }
  function close() { drop.classList.remove("show"); _active = -1; }
  function setActive(i) {
    _active = Math.max(-1, Math.min(i, _items.length - 1));
    drop.querySelectorAll(".ac-item").forEach((el, j) => el.classList.toggle("ac-hover", j === _active));
  }
  function render(q) {
    const all = getItems();
    const ql = q.toLowerCase();
    _items = q ? all.filter(it =>
      it.label.toLowerCase().includes(ql) ||
      (it.sub   && it.sub.toLowerCase().includes(ql))  ||
      (it.value && String(it.value).toLowerCase().includes(ql))
    ).slice(0, 18) : [];
    _active = -1;
    if (!_items.length) { drop.classList.remove("show"); return; }
    drop.innerHTML = _items.map((it, i) => `
      <div class="ac-item" data-i="${i}">
        <div class="ac-main">${escapeHtml(it.label)}${it.badge ? `<span class="ac-badge">${escapeHtml(it.badge)}</span>` : ""}</div>
        ${it.sub ? `<div class="ac-sub">${escapeHtml(it.sub)}</div>` : ""}
      </div>`).join("");
    drop.querySelectorAll(".ac-item").forEach(el => {
      el.addEventListener("mousedown", e => { e.preventDefault(); onSelect(_items[+el.dataset.i], inputEl); close(); });
      el.addEventListener("mouseover", () => setActive(+el.dataset.i));
    });
    reposition();
    drop.classList.add("show");
  }

  inputEl.addEventListener("input",   () => render(inputEl.value.trim()));
  inputEl.addEventListener("blur",    () => setTimeout(close, 180));
  inputEl.addEventListener("keydown", e => {
    if (!drop.classList.contains("show")) return;
    if      (e.key === "ArrowDown")  { e.preventDefault(); setActive(_active + 1); }
    else if (e.key === "ArrowUp")    { e.preventDefault(); setActive(_active - 1); }
    else if (e.key === "Enter" && _active >= 0) { e.preventDefault(); onSelect(_items[_active], inputEl); close(); }
    else if (e.key === "Escape")     { e.preventDefault(); close(); }   // preventDefault = ปิดแค่รายการแนะนำ ไม่ปิดหน้าต่างทั้งใบ (uiTopModal)
  });
  window.addEventListener("resize", close);
  window.addEventListener("scroll", () => { if (drop.classList.contains("show")) reposition(); }, true);
  return drop;
}
function escapeJs(v) {
  return String(v ?? "").replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/"/g,'\\"').replace(/\n/g,"\\n").replace(/\r/g,"");
}

// ─────────────────────────────────────────────
// DEVICE MANAGEMENT
// ─────────────────────────────────────────────
let currentDevice = { id: "", name: "" };

function generateDeviceId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "dev-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
}

function loadDevice() {
  let id = localStorage.getItem("appstock_device_id");
  if (!id) { id = generateDeviceId(); localStorage.setItem("appstock_device_id", id); }
  const name = localStorage.getItem("appstock_device_name") || "";
  currentDevice = { id, name };
  return currentDevice;
}

/**
 * เอาชื่อเครื่องที่ระบบต่อท้ายชื่อคนออก ให้เหลือแค่ชื่อพนักงาน
 *   "สมชาย (📱 Win11/10/Chrome 33c4ed35)"  →  "สมชาย"
 * ใช้ตอนแสดงผลเท่านั้น — ในชีตยังเก็บชื่อเครื่องไว้ครบสำหรับตรวจย้อนหลัง
 * (หน้า 📈 ความเคลื่อนไหว ของ admin ยังเห็นชื่อเครื่องแยกช่องอยู่)
 */
function personName(v) {
  return String(v == null ? "" : v).replace(/\s*\(\s*📱[\s\S]*$/, "").trim() || "-";
}

// ─────────────────────────────────────────────
// 🏷️ โลโก้บริษัท — assets/logo.png
// ─────────────────────────────────────────────
/**
 * ที่อยู่เต็มของไฟล์โลโก้
 * ⚠️ ต้องเป็นที่อยู่เต็ม (https://...) ไม่ใช่ "assets/logo.png"
 *    เพราะหน้าพิมพ์เปิดด้วย window.open("") ซึ่งเป็นหน้าเปล่า
 *    ที่อยู่แบบย่อจะหาไฟล์ไม่เจอ โลโก้จะไม่ขึ้นบนกระดาษ
 */
function logoUrl() {
  try { return new URL("assets/logo.png", location.href).href; }
  catch (e) { return "assets/logo.png"; }
}

/**
 * แท็กรูปโลโก้สำหรับใส่หัวใบพิมพ์
 * ถ้าไม่มีไฟล์ → ซ่อนตัวเอง (onerror) เอกสารยังพิมพ์ได้ปกติ ไม่มีรูปแตก
 * @param {number} h ความสูงเป็น px บนกระดาษ
 */
function logoImgTag(h) {
  return `<img src="${logoUrl()}" alt="" style="height:${h || 46}px;width:auto;display:block;"
          onerror="this.style.display='none'">`;
}

function getDeviceInfo() {
  const ua = navigator.userAgent;
  let os = "Unknown";
  if (/Windows NT 10/.test(ua)) os = "Win11/10";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Android/.test(ua)) {
    const m = ua.match(/Android ([\d.]+)/);
    os = "Android" + (m ? " " + m[1] : "");
  }
  else if (/iPhone/.test(ua)) os = "iPhone";
  else if (/iPad/.test(ua)) os = "iPad";
  else if (/Macintosh/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";

  let browser = "Unknown";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  return `${os}/${browser} [${currentDevice.id.slice(0,8)}]`;
}

// ─────────────────────────────────────────────
// MATH INPUT — คำนวณในช่องตัวเลข เช่น 16*48+5
// ─────────────────────────────────────────────
(function(){
  /** ประเมินนิพจน์คณิตศาสตร์อย่างปลอดภัย */
  function mathEval(expr){
    const s = String(expr).replace(/,/g,"").trim();
    if(!s) return NaN;
    if(!/^[\d\s\+\-\*\/\(\)\.]+$/.test(s)) return NaN;
    try{
      const r = Function('"use strict";return('+s+')')();
      return (typeof r==="number"&&isFinite(r)) ? Math.round(r*1e6)/1e6 : NaN;
    }catch(e){return NaN;}
  }

  /** สร้าง/อัปเดต preview div ใต้ input */
  function getPreview(el){
    if(el._mathPreview) return el._mathPreview;
    const d = document.createElement("div");
    d.style.cssText="font-size:11px;font-weight:800;color:var(--sq-accent);margin-top:3px;min-height:14px;letter-spacing:.5px;";
    d.setAttribute("data-math-preview","1");
    el.parentNode.insertBefore(d, el.nextSibling);
    el._mathPreview = d;
    return d;
  }
  function clearPreview(el){ if(el._mathPreview) el._mathPreview.textContent=""; }

  // focus: เปลี่ยน type="number" → text เพื่อให้พิมพ์ * + / ได้
  document.addEventListener("focus", function(e){
    const el=e.target;
    if(el.tagName!=="INPUT"||el.type!=="number") return;
    el._mathWasNum=true;
    el._mathMin=el.min; el._mathMax=el.max; el._mathStep=el.step;
    el.type="text";
    el.inputMode="decimal";
  }, true);

  // input: แสดง preview ขณะพิมพ์
  document.addEventListener("input", function(e){
    const el=e.target;
    if(el.tagName!=="INPUT"||!el._mathWasNum) return;
    const val=el.value.trim();
    if(/[\+\-\*\/\(\)]/.test(val)){
      const r=mathEval(val);
      getPreview(el).textContent = isNaN(r) ? "" : "= "+r.toLocaleString("th-TH",{maximumFractionDigits:6});
    } else { clearPreview(el); }
  }, false);

  // blur: ประเมินผลและใส่ค่า
  document.addEventListener("blur", function(e){
    const el=e.target;
    if(el.tagName!=="INPUT") return;
    const wasMath=el._mathWasNum;
    const val=el.value.trim();
    if(val && /[\+\-\*\/\(\)]/.test(val)){
      const r=mathEval(val);
      if(!isNaN(r)){
        el.value=r;
        el.dispatchEvent(new Event("input",{bubbles:true}));
        el.dispatchEvent(new Event("change",{bubbles:true}));
      }
    }
    clearPreview(el);
    if(wasMath){
      el._mathWasNum=false;
      el.type="number";
      if(el._mathMin!==undefined) el.min=el._mathMin;
      if(el._mathMax!==undefined) el.max=el._mathMax;
      if(el._mathStep!==undefined) el.step=el._mathStep;
    }
  }, true);
})();

// ══════════════════════════════════════════════════════════════════════
// หน้าต่าง (modal) ทั้งหน้าคอม — ตัวช่วยกลาง (QA M7 2026-10-10)
// เดิม: ไม่มีหน้าต่างไหนปิดด้วย Esc · คลิกพื้นหลังปิดไม่ได้ · โฟกัสไม่ย้ายเข้า/ไม่คืนกลับ ·
//       กด Tab แล้วโฟกัสหลุดไปปุ่มข้างหลังหน้าต่าง (หลังบันทึกเบิกต้องกด Tab 48 ครั้งถึงปุ่มปิด)
// วิธี: ดูการเปิด-ปิดจาก class "hidden" ของหน้าต่างเอง — ไม่ต้องแก้ฟังก์ชันเปิดทีละที่
//   · เปิด → role="dialog" + aria-modal · จำปุ่มที่กดเปิด · ย้ายโฟกัสเข้าหน้าต่าง (ถ้าตัวเปิดยังไม่ได้ย้ายเอง)
//   · Esc → ปิดหน้าต่างบนสุดด้วยฟังก์ชันปิดของมันเอง (บางตัวมีงานเก็บกวาด เช่น ปิดกล้อง)
//   · คลิกพื้นหลัง → ปิด เฉพาะหน้าต่างดูข้อมูล (backdrop:true) — หน้าต่างกรอกข้อมูลไม่ปิด กันตัวเลขที่พิมพ์หาย
//   · Tab วนอยู่ในหน้าต่าง · ปิดแล้วโฟกัสกลับไปปุ่มที่กดเปิด
// หน้าต่างใหม่: เพิ่มชื่อเข้า UI_MODALS พร้อมฟังก์ชันปิด
// ══════════════════════════════════════════════════════════════════════
const UI_MODALS = {
  stockAlertModal:      { close: () => closeStockAlert(false), backdrop: true },   // Esc/พื้นหลัง = ปิดชั่วคราว (ไม่นับว่ารับทราบ)
  planModal:            { close: "closePlanModal", backdrop: true },
  unifiedSettingsModal: { close: "closeUnifiedSettings" },
  rawActionModal:       { close: "closeRawAction" },
  rawVerifyModal:       { close: "closeRawVerify" },
  rawEditModal:         { close: "closeRawEdit" },
  rawCreateModal:       { close: "closeRawCreate" },
  rawQrModal:           { close: "closeRawQr", backdrop: true },
  rawSettingsModal:     { close: "closeRawSettings" },
  rawScannerModal:      { close: "closeRawScanner" },
  activityPanelModal:   { close: "closeActivityPanel", backdrop: true },
  myHistModal:          { close: "closeMyHistory", backdrop: true },
  ropModal:             { close: "closeRopModal", backdrop: true },
  drModal:              { close: "closeDocReport", backdrop: true },
  slipModal:            { close: "closeWithdrawSlip", backdrop: true },
  rawHistModal:         { close: "closeRawHistory", backdrop: true },
  impModal:             { close: "closeRawImport" },
  criModal:             { close: "criClose" },
  offlineModal:         { close: "closeOfflinePanel", backdrop: true },
  crLotHistModal:       { close: "crCloseLotHistory", backdrop: true },
  shareAppModal:        { close: "closeShareApp", backdrop: true },
};
const _UI_FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const _uiReturnTo = {};
function _uiIsOpen(el) {
  if (!el) return false;
  if (el.id === "crModal") return el.classList.contains("show");
  return !el.classList.contains("hidden") && getComputedStyle(el).display !== "none";
}
function _uiFocusables(el) {
  return [...el.querySelectorAll(_UI_FOCUSABLE)].filter(x => x.offsetParent !== null || x === document.activeElement);
}
/** หน้าต่างที่เปิดอยู่บนสุด (z-index สูงสุด) — กล่องยืนยันห้องเย็นอยู่บนสุดเสมอ */
function uiTopModal() {
  const cr = document.getElementById("crModal");
  if (_uiIsOpen(cr)) return cr;
  let top = null, topZ = -1;
  for (const id of Object.keys(UI_MODALS)) {
    const el = document.getElementById(id);
    if (!_uiIsOpen(el)) continue;
    const z = parseInt(getComputedStyle(el).zIndex, 10) || 0;
    if (z >= topZ) { top = el; topZ = z; }
  }
  return top;
}
function uiCloseModal(el) {
  if (!el) return;
  if (el.id === "crModal") {   // กล่องยืนยัน/แจ้งเตือนของห้องเย็น: Esc = ยกเลิก (ถ้ามี) ไม่งั้น = ตกลง
    const c = document.getElementById("crModalCancel"), ok = document.getElementById("crModalConfirm");
    (c && c.style.display !== "none" ? c : ok)?.click();
    return;
  }
  const cfg = UI_MODALS[el.id];
  const fn = cfg && (typeof cfg.close === "function" ? cfg.close : window[cfg.close]);
  if (typeof fn === "function") fn(); else el.classList.add("hidden");
}
function _uiOnOpen(el) {
  _uiReturnTo[el.id] = document.activeElement;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  const h = el.querySelector("h1,h2,h3");
  if (h) { if (!h.id) h.id = el.id + "__title"; el.setAttribute("aria-labelledby", h.id); }
  // ให้ตัวเปิดย้ายโฟกัสเองก่อน (เช่น ช่องจำนวน) — ถ้าไม่ได้ย้าย ค่อยพาเข้าช่อง/ปุ่มแรก
  setTimeout(() => {
    if (!_uiIsOpen(el) || el.contains(document.activeElement)) return;
    const f = _uiFocusables(el);
    (f.find(x => /^(INPUT|SELECT|TEXTAREA)$/.test(x.tagName)) || f[0] || el).focus?.();
  }, 120);
}
function _uiOnClose(el) {
  const back = _uiReturnTo[el.id];
  delete _uiReturnTo[el.id];
  if (back && document.contains(back) && back.offsetParent !== null && !uiTopModal()) { try { back.focus(); } catch (e) {} }
}
(function _uiModalWatch() {
  const start = () => {
    const ids = [...Object.keys(UI_MODALS), "crModal"];
    const was = {};
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      was[id] = _uiIsOpen(el);
      new MutationObserver(() => {
        const now = _uiIsOpen(el);
        if (now === was[id]) return;
        was[id] = now;
        now ? _uiOnOpen(el) : _uiOnClose(el);
      }).observe(el, { attributes: true, attributeFilter: ["class", "style"] });
      // คลิกพื้นหลัง (กด-ปล่อยที่พื้นหลังจริง ไม่ใช่ลากจากในหน้าต่าง) — เฉพาะหน้าต่างดูข้อมูล
      if (UI_MODALS[id] && UI_MODALS[id].backdrop) {
        let downOnBackdrop = false;
        el.addEventListener("mousedown", e => { downOnBackdrop = e.target === el; });
        el.addEventListener("click", e => { if (downOnBackdrop && e.target === el) uiCloseModal(el); downOnBackdrop = false; });
      }
    });
    document.addEventListener("keydown", e => {
      const top = uiTopModal();
      if (!top) return;
      if (e.key === "Escape" && !e.isComposing) {
        // dropdown/รายการแนะนำที่เปิดอยู่ปิดก่อน (ตัวช่วยเดิมจัดการเอง)
        if (e.defaultPrevented) return;
        e.preventDefault();
        uiCloseModal(top);
        return;
      }
      if (e.key !== "Tab") return;
      const f = _uiFocusables(top);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (!top.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

// Esc ปิดเมนู "⋯ เพิ่มเติม" (details) ที่เปิดค้าง — เดิมปิดได้แค่คลิกข้างนอก (QA ข้อ 14)
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || e.defaultPrevented || (typeof uiTopModal === "function" && uiTopModal())) return;
  const m = document.querySelector("details[open]#rawMoreMenu, details[open].sq-more");
  if (m) { m.removeAttribute("open"); m.querySelector("summary")?.focus(); }
});
