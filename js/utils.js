function escapeHtml(v) {
  return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function escapeAttr(v) { return escapeHtml(v); }

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
    else if (e.key === "Escape")     { close(); }
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
    d.style.cssText="font-size:11px;font-weight:800;color:#6366f1;margin-top:3px;min-height:14px;letter-spacing:.5px;";
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
