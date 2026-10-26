// ═══════════════════════════════════════════════
// 🏭 RAW MATERIALS MODULE (SQF & MLM)
// ═══════════════════════════════════════════════

let rawCurrentModule  = "MLM";
let rawLastData       = [];
let rawCurrentFilter  = "all";
let rawAlertDays      = parseInt(localStorage.getItem("rawAlertDays") || "7");
let rawSortKey        = "status";   // status | name | qty
let rawSortAsc        = true;

window.rawSetSort = function(key) {
  if (rawSortKey === key) { rawSortAsc = !rawSortAsc; }
  else { rawSortKey = key; rawSortAsc = key !== "qty"; }
  ["status","name","qty"].forEach(k => {
    const el = document.getElementById("rawSortIcon-" + k);
    if (!el) return;
    if (k === rawSortKey) { el.textContent = rawSortAsc ? "↑" : "↓"; el.style.opacity = "1";  el.style.color = "var(--sq-accent)"; }
    else                  { el.textContent = "↕";                    el.style.opacity = ".4"; el.style.color = ""; }
  });
  renderRawInventory(rawLastData);
};

// เมนู "⋯ เพิ่มเติม" — <details> ปกติไม่ปิดเองเวลากดที่อื่น เลยต้องสั่งปิดให้
document.addEventListener("click", function(e) {
  const menu = document.getElementById("rawMoreMenu");
  if (!menu || !menu.open) return;
  if (!menu.contains(e.target)) { menu.open = false; return; }
  // กดเลือกเมนูไหนก็ตาม → ปิดเมนูทิ้ง
  if (e.target.closest(".rm-more-menu button")) menu.open = false;
});

// ⏰ ไม่มีการอัปเดตสต๊อกเกินกำหนด — วันที่นับมาจากหลังบ้าน (IdleDays) หน้าจอแค่เทียบกับค่ากลาง
function rawIsStale(item) {
  const n = Number(window._rawStaleDays) || 0;
  if (!n || !item || item.IdleDays === undefined) return false;
  return item.IdleDays === null || Number(item.IdleDays) > n;
}
function rawUpdateStaleUi() {
  const n = Number(window._rawStaleDays) || 0;
  const inp = document.getElementById("rawStaleDaysInput");
  if (inp && document.activeElement !== inp) inp.value = n;
  const role = (localStorage.getItem("unified_stock_role") || "").toLowerCase();
  if (inp) { inp.disabled = !(role === "admin" || role === "manager"); inp.title = inp.disabled ? "หัวหน้า/แอดมินเป็นคนตั้งค่านี้" : ""; }
  const chip = document.getElementById("rawFilter-stale");
  if (chip) {
    const k = (rawLastData || []).filter(rawIsStale).length;
    chip.style.display = n ? "" : "none";
    chip.innerHTML = '<i class="ui-sg sg-must" aria-hidden="true"></i>ไม่อัปเดตเกิน ' + n + " วัน" + (k ? " (" + k + ")" : "");
    if (!n && rawCurrentFilter === "stale") setRawFilter("all");
  }
  rawUpdateLotUi();
}
// 🏷️ ล็อตค้างนาน — ตัวกรอง + ช่องตั้งจำนวนวัน (ค่ากลาง · หลังบ้านตัดสิน Old ให้แล้ว)
function rawUpdateLotUi() {
  const n = Number(window._rawLotAgeDays) || 0;
  const inp = document.getElementById("rawLotAgeInput");
  if (inp && document.activeElement !== inp) inp.value = n;
  const role = (localStorage.getItem("unified_stock_role") || "").toLowerCase();
  if (inp) { inp.disabled = !(role === "admin" || role === "manager"); inp.title = inp.disabled ? "หัวหน้า/แอดมินเป็นคนตั้งค่านี้" : ""; }
  const chip = document.getElementById("rawFilter-lotold");
  if (chip) {
    const k = (rawLastData || []).filter(i => i.LotOld > 0).length;
    chip.style.display = n ? "" : "none";
    chip.innerHTML = '<i class="ui-sg sg-warn" aria-hidden="true"></i>ล็อตค้างเกิน ' + n + " วัน" + (k ? " (" + k + ")" : "");
    if (!n && rawCurrentFilter === "lotold") setRawFilter("all");
  }
}
async function rawSetLotAgeDays(v) {
  const cur = Number(window._rawLotAgeDays) || 0;
  const inp = document.getElementById("rawLotAgeInput");
  const raw = String(v == null ? "" : v).trim();
  const n = /^\d+$/.test(raw) ? Math.min(3650, parseInt(raw, 10)) : NaN;
  if (isNaN(n)) { if (inp) inp.value = cur; showToast("ใส่จำนวนวันเป็นตัวเลข (0 = ปิดการเตือน) — ยังใช้ค่าเดิม " + (cur || "ปิด"), "warn"); return; }
  if (n === cur) return;
  if (n === 0 && !confirm("ปิดการเตือน \"ล็อตค้างนาน\" ของทุกคน?")) { if (inp) inp.value = cur; return; }
  try {
    const r = await rawFetch({ action: "PLANSET", lotAgeDays: n, user: currentUser });
    if (r.status !== "success") throw new Error(r.message || "บันทึกไม่สำเร็จ");
    window._rawLotAgeDays = r.settings.lotAgeDays;
    showToast(n ? "เตือนล็อตที่รับมาเกิน " + n + " วัน — ใช้กับทุกคนแล้ว" : "ปิดการเตือนล็อตค้างนานแล้ว", "success");
    rawLoadData(false, 0, { silent: true });
  } catch (e) { if (inp) inp.value = cur; showToast("บันทึกไม่สำเร็จ: " + (e.message || ""), "error"); }
  rawUpdateLotUi();
}
async function rawSetStaleDays(v) {
  // ค่าว่าง/พิมพ์ผิด → คืนค่าเดิม (เดิม parseInt||0 = บันทึก 0 = ปิดการเตือนของทุกคนทันทีโดยไม่ถาม · QA M14)
  const cur = Number(window._rawStaleDays) || 0;
  const inp = document.getElementById("rawStaleDaysInput");
  const raw = String(v == null ? "" : v).trim();
  const n = /^\d+$/.test(raw) ? Math.min(365, parseInt(raw, 10)) : NaN;
  if (isNaN(n)) { if (inp) inp.value = cur || ""; showToast("ใส่จำนวนวันเป็นตัวเลข (0 = ปิดการเตือน) — ยังใช้ค่าเดิม " + (cur || "ปิด"), "warn"); return; }
  if (n === cur) return;
  if (n === 0 && !confirm("ปิดการเตือน \"ไม่อัปเดตสต๊อก\" ของทุกคน?\n\nรายการที่ไม่มีใครนับนานจะไม่ถูกเตือนอีก จนกว่าจะตั้งจำนวนวันใหม่")) { if (inp) inp.value = cur || ""; return; }
  try {
    const r = await rawFetch({ action: "PLANSET", staleDays: n, user: currentUser });
    if (r.status !== "success") throw new Error(r.message || "บันทึกไม่สำเร็จ");
    window._rawStaleDays = r.settings.staleDays;
    showToast(n ? "เตือนเมื่อไม่มีการอัปเดตเกิน " + n + " วัน — ใช้กับทุกคนแล้ว " : "ปิดการเตือนไม่อัปเดตแล้ว", "success");
    rawLoadData(false, 0, { silent: true });   // ดึงใหม่ให้ตัวเลขทุกแถวตรงกับค่าใหม่
  } catch (e) { showToast("บันทึกไม่สำเร็จ: " + (e.message || ""), "error"); }
  rawUpdateStaleUi();
  renderRawInventory(rawLastData);
  renderRawStats(rawLastData, window._rawDiscontinued || []);
}

function rawSetAlertDays(v) {
  rawAlertDays = Math.max(1, Math.min(365, parseInt(v) || 7));
  localStorage.setItem("rawAlertDays", rawAlertDays);
  const inp = document.getElementById("rawAlertDaysInput");
  if (inp) inp.value = rawAlertDays;
  renderRawInventory(rawLastData);
}
let rawNextSku        = "";
let rawHtml5QrCode    = null;
let rawVerifyTarget   = "";
let rawCurrentQrSku   = "";
let rawCurrentQrName  = "";

const MODULE_META = {
  // subtitleClass = จุดสีหน้าชื่อโรงงาน (ส้ม = Suphan Q Foods, เขียว = แม่ละมาย ตามโลโก้)
  SQF: { title:"วัตถุดิบ SQF", subtitle:"สุพรรณคิวฟู้ดส์", subtitleClass:"is-sqf", headerBorder:"border-orange-500", skuPrefix:"SQF-" },
  MLM: { title:"วัตถุดิบ MLM",   subtitle:"แม่ละมาย",        subtitleClass:"is-mlm", headerBorder:"border-emerald-600", skuPrefix:"MLM-" }
};

function updateRawHeader(mod) {
  const m = MODULE_META[mod];
  document.getElementById("rawModuleTitle").innerHTML       = m.title;
  document.getElementById("rawModuleSubtitle").textContent  = m.subtitle;
  document.getElementById("rawModuleSubtitle").className    = `rm-factory ${m.subtitleClass}`;
}

async function rawFetch(payload) {
  const res = await fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      module:     rawCurrentModule,
      deviceId:   currentDevice.id,
      deviceName: getDeviceInfo()
    })
  });
  const json = await res.json();
  if (handleTokenExpired(json)) return json;
  return json;
}

let _rawSearchAcInit = false;
let _rawInflight   = {};   // ข้อ 9: คำขออ่านคลังเดียวกันที่ซ้อนกัน (สลับหน้า/กลับแท็บ/หลังบันทึก) ให้รอตัวเดียว
let _rawWriteSeq   = 0;    // ข้อ 2: เพิ่มทุกครั้งที่บันทึกสำเร็จ — คำตอบอ่านที่เริ่มก่อนบันทึกห้ามทับยอดใหม่บนจอ
let _rawShownModule = "";  // คลังที่มีข้อมูลอยู่บนจอแล้ว
async function rawLoadData(startup = false, retry = 0, opts = {}) {
  const mod = rawCurrentModule;
  if (_rawInflight[mod]) return _rawInflight[mod];
  const p = _rawLoadDataRun(startup, retry, opts, mod).finally(() => { if (_rawInflight[mod] === p) delete _rawInflight[mod]; });
  _rawInflight[mod] = p;
  return p;
}
async function _rawLoadDataRun(startup, retry, opts, mod) {
  // ข้อ 8: จับคลังไว้ตั้งแต่เริ่ม — ผู้ใช้สลับคลังระหว่างรอ คำตอบเก่าต้องไม่ไปโผล่/ไปเก็บ cache ผิดคลัง
  const t0 = Date.now();
  const seq0 = _rawWriteSeq;
  // ข้อ 4: ไม่บังทั้งจอถ้ามีอะไรให้ดูอยู่แล้ว —
  //   · คลังนี้อยู่บนจอแล้ว (รีเฟรช) → คงรายการเดิม ขึ้นป้าย "กำลังตรวจข้อมูลล่าสุด"
  //   · เพิ่งเปิดคลังนี้แต่มีข้อมูลเดิมในเครื่อง → วาดของเดิมก่อนทันที แล้วค่อยแทนที่ (ไม่เด้งแจ้งเตือน/เทรนด์จากของเก่า)
  let quiet = !!opts.silent;
  if (!quiet && _rawShownModule === mod && rawLastData.length) { quiet = true; rawSetDataAge("refreshing", window._gasLastAt); }
  else if (!quiet && _rawShownModule !== mod) {
    const c = (() => { try { return JSON.parse(localStorage.getItem("cache_raw_" + mod) || "null"); } catch (e) { return null; } })();
    if (c && c.d && Array.isArray(c.d.materials) && c.d.materials.length) {
      _rawApplyData(c.d, false, "refreshing", c.t, { skipAlerts: true, skipTrends: true });
      quiet = true;
    }
  }
  try {
    if (!quiet) showLoading("กำลังโหลดข้อมูล...");
    const data = await (await fetch(`${GAS_URL}?module=${mod}`)).json();
    if (!quiet) hideLoading();
    window._gasLastMs = Date.now() - t0; window._gasLastAt = Date.now();
    if (mod !== rawCurrentModule) return;   // สลับไปคลังอื่นแล้ว ทิ้งคำตอบนี้
    if (data.status && data.status !== "success") {
      if (_rawShownModule !== mod) _rawShowLoadError(data.message || "โหลดข้อมูลไม่สำเร็จ");
      else showToast(data.message || "โหลดข้อมูลไม่สำเร็จ","error");
      return;
    }
    if (_rawWriteSeq !== seq0) {   // มีการบันทึกระหว่างรอ → คำตอบนี้เก่ากว่ายอดบนจอ ทิ้ง แล้วดึงใหม่เงียบๆ
      setTimeout(() => rawLoadData(false, 0, { silent: true }), 300);
      return;
    }
    cacheSet("raw_" + mod, data);   // เก็บ last-good ไว้ใช้ตอน offline / โชว์ก่อนครั้งหน้า
    _rawShownModule = mod;
    _rawApplyData(data, startup, "server");
  } catch(err) {
    if (!quiet) hideLoading();
    if (mod !== rawCurrentModule) return;
    // Google สะดุดชั่วคราว (ตอบเป็นหน้า HTML / ยิงไม่ออก) → ลองใหม่อีกครั้งเดียวก่อนถอยไปใช้ข้อมูลเก่า
    if (retry < 1 && navigator.onLine) {
      showToast("เซิร์ฟเวอร์ตอบไม่ปกติ กำลังลองใหม่...", "warn", 4000);
      await new Promise(r => setTimeout(r, 4000));
      if (mod !== rawCurrentModule) return;
      return _rawLoadDataRun(startup, retry + 1, { silent: quiet }, mod);
    }
    if (quiet && rawLastData.length) {
      // มีข้อมูลบนจออยู่แล้ว (ของเดิม/จากเครื่อง) → คงไว้ แค่บอกว่าตรวจไม่ได้ — ไม่วาดซ้ำ ไม่เด้งแจ้งเตือนซ้ำ
      rawSetDataAge("stale", window._rawDataAt);
      showToast(err.gasHtml ? "ตรวจข้อมูลล่าสุดไม่ได้ (เซิร์ฟเวอร์ตอบไม่ปกติ) — แสดงข้อมูลเดิมไว้ก่อน" : "ตรวจข้อมูลล่าสุดไม่ได้ (เชื่อมต่อไม่ได้) — แสดงข้อมูลเดิมไว้ก่อน", "warn", 5000);
      return;
    }
    // fetch fail → ลองใช้ข้อมูลเก่าจาก cache
    const cachedRaw = (() => { try { return JSON.parse(localStorage.getItem("cache_raw_" + mod) || "null"); } catch (e) { return null; } })();
    if (cachedRaw && cachedRaw.d) {
      _rawApplyData(cachedRaw.d, startup, "cache", cachedRaw.t);
      showToast(err.gasHtml ? "แสดงข้อมูลเก่า — เซิร์ฟเวอร์ตอบไม่ปกติ ลองรีเฟรชอีกสักครู่" : "แสดงข้อมูลเก่า (เชื่อมต่อไม่ได้)", "warn", 5000);
    } else if (_rawShownModule !== mod) {
      _rawShowLoadError(err.gasHtml ? err.message : "เชื่อมต่อไม่ได้ — ตรวจสัญญาณเน็ตแล้วกดลองใหม่");
    } else {
      showToast(err.gasHtml ? err.message : "เชื่อมต่อฐานข้อมูลล้มเหลว ", "error", 6000);
    }
  }
}

// เปิดคลังไม่สำเร็จและไม่มีข้อมูลของคลังนี้ในเครื่อง → ต้องล้างรายการของคลังก่อนหน้าออกจากจอ
// (เดิมหัวข้อเป็นคลังใหม่ แต่รายการยังเป็นของคลังเก่า → เบิกผิดโรงงานได้ · พบตอนตรวจ QA 2026-10-10)
function _rawShowLoadError(msg) {
  rawLastData = []; window._rawDiscontinued = []; window._rawFiltered = [];
  _rawShownModule = "";
  try { renderRawStats([], []); } catch (e) {}
  const list = document.getElementById("rawInventoryList");
  if (list) list.innerHTML = `<tr><td colspan="${RAW_TABLE_COLS}"><div class="rm-empty" role="alert">
      <b>โหลดรายการของคลังนี้ไม่สำเร็จ</b><br>${escapeHtml(msg || "")}<br>
      <button class="rm-mini solid" style="margin-top:10px;" onclick="rawLoadData()">↻ ลองใหม่</button></div></td></tr>`;
  const age = document.getElementById("rawDataAge");
  if (age) age.innerHTML = `<span style="color:var(--sq-crit);font-weight:800;">ยังไม่มีข้อมูลของคลังนี้ — กดลองใหม่</span>`;
}

// ข้อ 18: บอกอายุข้อมูลค้างไว้บนหน้า ไม่พึ่ง toast ที่หายใน 4 วิ
function rawSetDataAge(source, at) {
  const el = document.getElementById("rawDataAge");
  if (!el) return;
  const t = new Date(at || Date.now()).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const pend = (typeof offlineCount === "function") ? offlineCount() : 0;
  const pendTxt = pend ? ` · <span style="color:var(--sq-high);font-weight:800;">รอส่ง ${pend} รายการ (ยอดบนจอยังไม่รวม)</span>` : "";
  el.innerHTML = source === "cache"
    ? `<span style="color:var(--sq-high);font-weight:800;">ข้อมูลเก่าจาก ${t} (ออฟไลน์)</span>${pendTxt}`
    : source === "refreshing"
    ? `ข้อมูลเมื่อ ${t} · <span style="color:var(--sq-ink2);">กำลังตรวจข้อมูลล่าสุด…</span>${pendTxt}`
    : source === "stale"
    ? `ข้อมูลเมื่อ ${t} · <span style="color:var(--sq-high);font-weight:800;">ตรวจข้อมูลล่าสุดไม่ได้ — แสดงของเดิมไว้ก่อน</span>${pendTxt}`
    : `อัปเดตล่าสุด ${t}${pendTxt}`;
}

// นำข้อมูล (จาก server หรือ cache) มา render — ใช้ร่วมทั้ง 2 path
function _rawApplyData(data, startup, source, at, opts = {}) {
  rawLastData = Array.isArray(data.materials) ? data.materials : [];
  window._rawDiscontinued = data.discontinued || [];
  if (data.staleDays !== undefined) window._rawStaleDays = Number(data.staleDays) || 0;
  if (data.lotAgeDays !== undefined) window._rawLotAgeDays = Number(data.lotAgeDays) || 0;
  rawUpdateStaleUi();
  window._rawDataAt = at || Date.now();   // เวลาของข้อมูลที่อยู่บนจอ (ไว้ขึ้นป้ายเมื่อตรวจข้อมูลใหม่ไม่ได้)
  rawSetDataAge(source || "server", at);
  const inp = document.getElementById("rawAlertDaysInput");
  if (inp) inp.value = rawAlertDays;
  rawNextSku  = data.nextSku || MODULE_META[rawCurrentModule].skuPrefix + "0001";
  renderRawInventory(rawLastData);
  window._rawRecentHistory = data.recentHistory || [];
  renderRawHistory(window._rawRecentHistory);
  renderRawStats(rawLastData, data.discontinued || []);
  // ⚠️ ไม่วาดกราฟตรงนี้ — กราฟย้ายไปอยู่ในหน้าต่าง 📈 กราฟ ที่ต้องกดเปิด
  //    Chart.js วาดในกล่องที่ซ่อนอยู่ไม่ได้ (ความสูงเป็น 0) จึงวาดตอนเปิดหน้าต่างแทน
  if (!opts.skipAlerts) rawCheckCritical(rawLastData, rawCurrentModule);
  if (!opts.skipTrends) rawLoadTrends();   // เส้นเทรนด์เบิกตามมาทีหลัง — ไม่ถ่วงการโหลดหลัก
  // ป้าย "ต้องสั่ง N" บนปุ่มวางแผนสั่งซื้อ — ของเก่าจากเครื่องไม่มีตัวเลขนี้ ล้างไว้ก่อนกันเลขของคลังอื่นค้าง
  if (typeof planRefreshTile === "function") { if (opts.skipTrends) planUpdateTile(null); else planRefreshTile(); }

  // ── Autocomplete: rawSearch (ตั้งค่าครั้งเดียว) ──
  if (!_rawSearchAcInit) {
    _rawSearchAcInit = true;
    const searchEl = document.getElementById("rawSearch");
    buildAutocomplete(
      searchEl,
      () => (rawLastData || []).map(m => {
        const daysLeft = m.ExpiryDate ? (function() {
          const ed = rawParseDate(m.ExpiryDate);
          if (!ed) return null;
          const tod = new Date(); tod.setHours(0,0,0,0);
          return Math.round((ed - tod) / 86400000);
        })() : null;
        const expBadge = daysLeft !== null && daysLeft <= 7  ? "" + daysLeft + "วัน"
                       : daysLeft !== null && daysLeft <= 30 ? "" + daysLeft + "วัน" : "";
        return {
          label: m.Name || m.SKU,
          sub:   `${m.SKU} · คงเหลือ: ${m.Qty} ${m.Unit || ""}${m.Qty <= m.Min && m.Min > 0 ? " ต่ำ" : ""}`,
          badge: expBadge,
          value: m.SKU
        };
      }),
      (item) => {
        searchEl.value = "";
        renderRawInventory(rawLastData);
        openRawEdit(item.value);
      }
    );
  }
}

// ─────────────────────────────────────────────
// 📉 เส้นเทรนด์การเบิกรายตัว (sparkline ในช่องชื่อของแต่ละแถว)
//    โหลดแยกหลังตารางขึ้นแล้ว — ตารางเร็วเท่าเดิม เส้นค่อยตามมา
//    ตัวที่ไม่เคยเบิกใน 30 วัน = ไม่วาดอะไรเลย ไม่รกตา
// ─────────────────────────────────────────────
const RAW_TREND_TTL = 5 * 60 * 1000;
let _rawTrends = {};   // module → { at, days, series }

async function rawLoadTrends() {
  const mod = rawCurrentModule;
  const c = _rawTrends[mod];
  if (c && Date.now() - c.at < RAW_TREND_TTL) { rawApplyTrends(); return; }
  try {
    const r = await rawFetch({ action: "TRENDS", user: currentUser });
    if (r.status !== "success" || mod !== rawCurrentModule) return;
    _rawTrends[mod] = { at: Date.now(), days: r.days, series: r.series || {} };
    rawApplyTrends();
  } catch (e) { /* เส้นเทรนด์เป็นของเสริม โหลดไม่ได้ก็แค่ไม่โชว์ */ }
}

function rawApplyTrends() {
  const t = _rawTrends[rawCurrentModule];
  if (!t) return;
  document.querySelectorAll("#rawInventoryList .rm-trend").forEach(el => {
    const arr = t.series[el.dataset.sku];
    if (!arr || !arr.some(v => v > 0)) { el.innerHTML = ""; return; }
    const w = 110, h = 20, max = Math.max(...arr);
    const step = w / (arr.length - 1);
    const pts = arr.map((v, i) =>
      `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
    const last = arr[arr.length - 1];
    // ตัวเลขมาจากหลังบ้าน (ชุดเดียวกับจอวางแผนสั่งซื้อ) · หลังบ้านคิดแผนไม่ได้ = ถอยไปเฉลี่ยจากเส้นกราฟแบบเดิม
    const it = rawItemOf(el.dataset.sku) || {};
    const fmt = n => Number(n).toLocaleString("th-TH", { maximumFractionDigits: n < 10 ? 1 : 0 });
    const avg = it.PlanActual30 !== undefined ? Number(it.PlanActual30) : arr.reduce((a, b) => a + b, 0) / arr.length;
    const avgTxt = fmt(avg);
    // หน้างานไม่ได้เบิกทุกวัน → บอกด้วยว่าวันที่เบิกจริงใช้เท่าไร (เจ้าของสั่ง 2026-10-26)
    const perUse = Number(it.PlanPerUse) > 0 && Number(it.PlanUseDays) < Number(it.PlanObsDays)
      ? `<span class="tr-avg">วันที่เบิก ~${fmt(Number(it.PlanPerUse))} (${it.PlanUseDays} จาก ${it.PlanObsDays} วัน)</span>` : "";
    el.innerHTML = `
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
        <polyline points="${pts}" fill="none" stroke="var(--sq-accent)" stroke-width="1.5"
                  stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>
        <circle cx="${w}" cy="${(h - 2 - (last / max) * (h - 4)).toFixed(1)}" r="2" fill="var(--sq-accent)"/>
      </svg>
      <span class="tr-avg">เบิกเฉลี่ย ${avgTxt}/วัน</span>${perUse}`;
    el.title = `ยอดเบิกสุทธิรายวันย้อนหลัง ${t.days} วัน (เบิก − คืน)`;
  });
}

// 📈 กราฟวิเคราะห์ย้ายไปหน้าภาพรวมทั้งระบบแล้ว (js/exec.js — เจ้าของสั่งย้าย 2026-08-02)

// ต่ำกว่าจุดสั่งซื้อ — นิยามเดียวทั้งระบบ = หลังบ้าน plan.js (belowMin) และ isLowItem ในมือถือ: ตั้งจุดสั่งซื้อไว้ (>0) และคงเหลือ ≤ จุดนั้น
// (เดิมตัวกรอง / การ์ดสรุป / ป๊อปอัป ใช้เงื่อนไขต่างกัน ตัวเลขไม่ตรงกัน — QA M11 2026-10-10)
function rawIsLow(i) { const min = Number(i.Min); return min > 0 && Number(i.Qty) <= min; }
// สถานะชุดเดียวกับมือถือและจอต้องสั่ง — หมดอายุ/ใกล้หมดอายุ (ExpStatus) · วันพอใช้/สถานะการสั่ง (DaysCover · PlanStatus) มาจากหลังบ้านทั้งหมด
// เดิมคิดเองจาก "ใช้ต่อวัน" ("วิกฤต/เร่งด่วน/ควรสั่ง") → ไม่ตรงจอต้องสั่งที่ใช้ยอดเบิกจริง และของใกล้หมดอายุถูกเรียก "ควรสั่ง" (critique 2026-10-20)
function rawStatusOf(item) {
  const ps = item.PlanStatus || "";
  // sg = รูปทรงป้าย (uiSign) ชุดเดียวกับมือถือ: หมด/หมดอายุ = ห้าม · ต้องสั่ง/ต่ำ/ใกล้หมดอายุ = เตือน · ปกติ = เขียว
  if (item.ExpStatus === "expired") return { pri: 0, bg: "crit", sg: "no",   bt: "หมดอายุ" };
  if (Number(item.Qty || 0) <= 0)   return { pri: 1, bg: "crit", sg: "no",   bt: "หมดแล้ว" };
  if (ps === "late")                return { pri: 2, bg: "crit", sg: "warn", bt: "สั่งวันนี้ก็ไม่ทัน" };
  if (ps === "now")                 return { pri: 3, bg: "high", sg: "warn", bt: "ต้องสั่งวันนี้" };
  if (rawIsLow(item))               return { pri: 4, bg: "high", sg: "warn", bt: "ต่ำกว่าจุดสั่งซื้อ" };
  if (item.ExpStatus === "near")    return { pri: 5, bg: "warn", sg: "warn", bt: "ใกล้หมดอายุ" };
  if (ps === "soon")                return { pri: 6, bg: "warn", sg: "warn", bt: "ใกล้ถึงเวลาสั่ง" };
  return { pri: 7, bg: "", sg: "ok", bt: "ปกติ" };
}
// วันพอใช้จากหลังบ้าน (ทศนิยม 1 ตำแหน่งเหมือนจอต้องสั่ง) · cls/hex = สีตามสถานะการสั่ง (hex ใช้ในหน้าต่างพิมพ์ — CSS var ไม่ติดไป)
const RAW_RUNOUT = { late: ["crit", "#c8102e"], now: ["high", "#c2410c"], soon: ["warn", "#8a5a00"] };
function rawRunout(item) {
  if (item.DaysCover === null || item.DaysCover === undefined || item.DaysCover === "") return null;
  const m = String(item.RunOutDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/), t = RAW_RUNOUT[item.PlanStatus] || ["", "#3d3d3d"];
  return { days: Number(item.DaysCover), date: m ? m[3] + "/" + m[2] + "/" + (Number(m[1]) + 543) : "", cls: t[0], hex: t[1] };
}

// ── Date helpers ──
// วันที่จากหลายแหล่ง → "วว/ดด/ปปปป" (พ.ศ.)
// ⚠️ อ่าน วว/ดด/ปปปป และ ปปปป-ดด-วว เอง ห้ามส่งให้ new Date — มันอ่านแบบอเมริกัน (เดือน/วัน):
//    "14/10/2026" ได้ปี 1483 → ขึ้น "หมดอายุแล้ว" ผิด · "12/10/2026" ได้ 10 ธ.ค. → ไม่เตือน (พบตอนตรวจ QA 2026-10-10)
//    ข้อมูลเก่าที่ย้ายมาจากชีตเก็บแบบ วว/ดด/ปปปป ได้ทั้ง ค.ศ. และ พ.ศ. (หลังบ้าน plan.js อ่านแบบเดียวกันนี้)
function rawForceThaiDate(str) {
  if (!str || ["","---","ยังไม่ระบุ"].includes(str)) return "ยังไม่ระบุ";
  const s = String(str).trim(), p2 = (n) => String(n).padStart(2, "0");
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) { let y = +m[3]; if (y < 2400) y += 543; return `${p2(m[1])}/${p2(m[2])}/${y}`; }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);   // วันที่ล้วน (ช่องเลือกวันที่) — ไม่ผ่าน new Date กันเลื่อนวันตามเขตเวลา
  if (m) { let y = +m[1]; if (y < 2400) y += 543; return `${p2(m[3])}/${p2(m[2])}/${y}`; }
  try {
    const d = new Date(s); if (isNaN(d.getTime())) return s;
    let y = d.getFullYear(); if (y < 2400) y+=543; while(y>2600)y-=543;
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${y}`;
  } catch(e) { return str; }
}
function rawParseDate(str) {
  const s = rawForceThaiDate(str);
  const p = s.split("/"); if (p.length!==3) return null;
  const d=parseInt(p[0]),m=parseInt(p[1]),y=parseInt(p[2]);
  if (isNaN(d)||isNaN(m)||isNaN(y)) return null;
  return new Date(y-543, m-1, d);
}
function rawNearExpiry(item, days) {
  const today=new Date(); today.setHours(0,0,0,0);
  const ed=rawParseDate(item.ExpiryDate); if(!ed) return false;
  const diff=Math.ceil((ed-today)/(1000*60*60*24));
  return diff>=0 && diff<=days;
}
function rawFormatDateInput(v) {
  if (!v||v==="ยังไม่ระบุ") return "";
  if (typeof v==="string"&&/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
    const [dd,mm,yyyy]=v.split("/"); const y=parseInt(yyyy)>2400?parseInt(yyyy)-543:parseInt(yyyy);
    return `${y}-${mm}-${dd}`;
  }
  const d=new Date(v); if(isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}


// ── Render inventory ──
function renderRawInventory(items) {
  const list   = document.getElementById("rawInventoryList");
  const search = (document.getElementById("rawSearch")?.value||"").toLowerCase();
  const today  = new Date(); today.setHours(0,0,0,0);

  const filtered = items.filter(item => {
    const name = (item.Name||"").toLowerCase(); const sku = (item.SKU||"").toLowerCase();
    if (!name.includes(search) && !sku.includes(search)) return false;
    if (rawCurrentFilter==="low"   && !rawIsLow(item))   return false;
    if (rawCurrentFilter==="exp"   && item.ExpStatus !== "expired") return false;
    if (rawCurrentFilter==="near"  && item.ExpStatus !== "near")    return false;
    if (rawCurrentFilter==="stale" && !rawIsStale(item)) return false;
    if (rawCurrentFilter==="lotold" && !(item.LotOld > 0)) return false;
    return true;
  });

  const _statusPri = item => rawStatusOf(item).pri;
  filtered.sort((a, b) => {
    let va, vb;
    if (rawSortKey === "name")     { va = (a.Name||"").toLowerCase(); vb = (b.Name||"").toLowerCase(); }
    else if (rawSortKey === "qty") { va = Number(a.Qty||0); vb = Number(b.Qty||0); }
    else                           { va = _statusPri(a); vb = _statusPri(b); }
    if (va < vb) return rawSortAsc ? -1 : 1;
    if (va > vb) return rawSortAsc ? 1 : -1;
    return 0;
  });

  window._rawFiltered = filtered;
  window._rawShown = 0;
  list.innerHTML = "";
  rawLoadMoreItems();
}

const RAW_ITEMS_PER_PAGE = 50;

function rawRenderItemRow(item) {
  const qty = Number(item.Qty||0);
  // bg = สีคำ · sg + bt = รูปทรงป้ายกับคำ (ไม่ได้ใช้สีอย่างเดียว) — คำชุดเดียวกับมือถือ/จอต้องสั่ง
  const { bg, sg, bt } = rawStatusOf(item), ro = rawRunout(item);

  return `<tr>
    <td><input type="checkbox" class="raw-checkbox" data-sku="${escapeAttr(item.SKU)}" aria-label="เลือก ${escapeAttr(item.Name||item.SKU)}"></td>
    <td data-label="สถานะ"><span class="badge-status ${bg}">${uiSign(sg, 20)}<span>${bt}</span></span></td>
    <td data-label="วัตถุดิบ">
      <div class="rm-name" title="${escapeAttr(item.Name||"-")}">${escapeHtml(item.Name||"-")}</div>
      <div class="rm-meta">
        <span>${escapeHtml(item.SKU||"-")}</span>
        <span>หมดอายุ ${rawForceThaiDate(item.ExpiryDate)}</span>
        <span>นับล่าสุด ${rawForceThaiDate(item.LastVerified)}</span>
        ${rawIsStale(item) ? `<span class="rm-stale" title="ไม่มีใครเบิก/รับ/คืน/นับ เกิน ${window._rawStaleDays} วัน — ยอดในระบบอาจไม่ตรงของจริง กด นับ เพื่อยืนยัน">${uiSign("must", 14)}${item.IdleDays == null ? "ไม่เคยบันทึกยอด" : "ไม่อัปเดต " + item.IdleDays + " วัน"}</span>` : ""}
        ${rawLotMeta(item)}
      </div>
      <div class="rm-trend" data-sku="${escapeAttr(item.SKU)}"></div>
    </td>
    <td class="n" data-label="คงเหลือ">
      <div class="rm-qty">${qty.toLocaleString()}<span class="rm-unit">${escapeHtml(item.Unit||"-")}</span></div>
      ${ro ? `<div class="rm-runout ${ro.cls}">พอใช้อีก ${ro.days.toLocaleString()} วัน${ro.date ? " (ถึง " + ro.date + ")" : ""}</div>` : ""}
    </td>
    <td class="n" data-label="จุดสั่งซื้อ"><span class="rm-min">${Number(item.Min||0).toLocaleString()}</span></td>
    <td class="n rm-actcell">
      ${window._appIsViewer ? `<span class="rm-meta" title="บัญชีนี้ดูได้อย่างเดียว — ขอสิทธิ์เพิ่มจากหัวหน้า">ดูอย่างเดียว</span>` : `<div class="rm-rowacts">
        <button onclick="openRawAction('${escapeJsAttr(item.SKU)}','${escapeJsAttr(item.Name)}','${escapeJsAttr(item.Unit)}',${Number(item.Qty)||0})" class="rm-mini solid">รับ / เบิก</button>
        <button onclick="openRawVerify('${escapeJsAttr(item.SKU)}','${escapeJsAttr(item.Name)}')" class="rm-mini">นับ</button>
        <button onclick="openRawEdit('${escapeJsAttr(item.SKU)}')" class="rm-mini">แก้ไข</button>
      </div>`}
    </td>
  </tr>`;
}

const RAW_TABLE_COLS = 6;   // จำนวนช่องในตาราง — ใช้กับ colspan ต้องตรงกับ thead

function rawLoadMoreItems() {
  const items = window._rawFiltered || [];
  const list = document.getElementById("rawInventoryList");
  if (!list) return;
  if (!items.length) {
    list.innerHTML = `<tr><td colspan="${RAW_TABLE_COLS}"><p class="rm-empty">ไม่พบรายการที่ตรงกับที่ค้นหาหรือตัวกรอง</p></td></tr>`;
    return;
  }

  const start = window._rawShown || 0;
  const end = Math.min(start + RAW_ITEMS_PER_PAGE, items.length);

  // ลบปุ่มเก่า
  const oldBtn = document.getElementById("rawLoadMoreRow");
  if (oldBtn) oldBtn.remove();

  let html = "";
  for (let i = start; i < end; i++) {
    html += rawRenderItemRow(items[i]);
  }
  list.insertAdjacentHTML("beforeend", html);
  window._rawShown = end;
  rawApplyTrends();   // แถวที่เพิ่งวาด (รวมตอนกรอง/เรียง/แสดงเพิ่ม) เติมเส้นเทรนด์จากที่โหลดไว้แล้ว

  if (end < items.length) {
    list.insertAdjacentHTML("beforeend", `
      <tr id="rawLoadMoreRow">
        <td colspan="${RAW_TABLE_COLS}" style="text-align:center;padding:12px;">
          <button onclick="rawLoadMoreItems()" class="rm-loadmore">แสดงเพิ่ม (${end} จาก ${items.length}) ▼</button>
        </td>
      </tr>`);
  }
}

// ─────────────────────────────────────────────
// 📜 หน้าต่างประวัติการใช้งานของคลังนี้
//    เนื้อหาถูกเติมไว้แล้วตอนโหลดข้อมูล เปิดมาจึงเห็นทันที
// ─────────────────────────────────────────────
function openRawHistory() {
  const m = document.getElementById("rawHistModal");
  if (!m) return;
  const sub = document.getElementById("rawHistSub");
  if (sub) {
    const n = document.querySelectorAll("#rawHistoryList .history-item").length;
    sub.textContent = (rawCurrentModule === "SQF" ? "วัตถุดิบ SQF" : "วัตถุดิบ MLM")
      + (n ? ` · ${n} รายการล่าสุด · ของทุกคนในคลังนี้` : "");
  }
  m.classList.remove("hidden");
}
function closeRawHistory() {
  const m = document.getElementById("rawHistModal");
  if (m) m.classList.add("hidden");
}

// ── Render history ──
function renderRawHistory(h) {
  const list = document.getElementById("rawHistoryList");
  if (!list) return;
  if (!(h||[]).length) { list.innerHTML = `<p class="rm-empty">ยังไม่มีความเคลื่อนไหว</p>`; return; }
  list.innerHTML = (h||[]).map(x => {
    const act=String(x[2]||"");
    // สี/ไอคอนตามงาน ชุดเดียวกับปุ่มเบิก(ส้ม) คืน(ฟ้า) รับ(เขียว) นับ(ฟ้าเขียว)
    let color="var(--sq-ink2)", ic="doc";
    if(act.includes("เบิก"))  {color="#c2410c"; ic="out";}
    else if(act.includes("รับ"))   {color="#047857"; ic="in";}
    else if(act.includes("คืน"))   {color="#0369a1"; ic="ret";}
    else if(act.includes("สร้าง")) {color="#6d28d9"; ic="new";}
    else if(act.includes("นับ")||act.includes("ตรวจ")){color="#0e7490"; ic="count";}
    else if(act.includes("ลบ")||act.includes("ยกเลิก")){color="var(--sq-crit)";ic="trash";}
    else if(act.includes("สำรอง")){color="var(--sq-ink2)";ic="cloud";}
    else if(act.includes("แก้ไข")){color="var(--sq-ink2)"; ic="edit";}
    // แถวที่เป็นการเบิก/รับ/คืน กดออกใบเอกสารซ้ำได้ (ออดิเตอร์ขอใบที่หาย)
    const canSlip = /เบิก|รับ|คืน/.test(act);
    const slipArg = canSlip ? encodeURIComponent(JSON.stringify({
      docNo: String(x[5]||""), sku: String(x[6]||""), name: String(x[1]||""),
      qty: Number(x[3])||0, unit: String(x[7]||""), purpose: String(x[8]||""),
      user: String(x[4]||""), at: x[0],
      type: act.includes("เบิก") ? "OUT" : act.includes("คืน") ? "RETURN" : "IN",
      module: rawCurrentModule
    })) : "";
    return `<div class="history-item">
      <div class="history-text-main"><i class="ic ic-${ic}" style="color:${color}" aria-hidden="true"></i> ${escapeHtml(x[1]||"-")}</div>
      <div class="history-text-act" style="color:${color}">${escapeHtml(act)}: ${escapeHtml(String(x[3]||"-"))}</div>
      ${x[8] ? `<div class="history-text-sub" style="color:var(--sq-ink2);">ใช้กับงาน: ${escapeHtml(String(x[8]))}</div>` : ""}
      <div class="history-text-sub">${rawForceThaiDate(x[0])} · โดย ${escapeHtml(personName(x[4]))}</div>
      ${canSlip ? `<button onclick="rawSlipFromHistory('${slipArg}')" class="rm-mini" style="margin-top:6px;">
        ออกใบ${x[5] ? " (" + escapeHtml(String(x[5])) + ")" : "ย้อนหลัง"}</button>` : ""}
    </div>`;
  }).join("");
}

// ── Render stats ──
function renderRawStats(items, discontinued) {
  const today=new Date(); today.setHours(0,0,0,0);
  const low = items.filter(i=>rawIsLow(i)).length;
  const exp = items.filter(i => i.ExpStatus === "expired").length;
  const stop = Array.isArray(discontinued) ? discontinued.length : 0;
  const tile = (sg, label, num, note, color) => `
    <div class="rm-tile">
      <div class="rm-tile-label">${uiSign(sg, 16)}${label}</div>
      <div class="rm-tile-num"${color ? ` style="color:${color}"` : ""}>${num.toLocaleString()}</div>
      <div class="rm-tile-note">${note}</div>
    </div>`;
  document.getElementById("rawStatCards").innerHTML =
      tile("",     "รายการทั้งหมด", items.length, "ในคลังนี้", "")
    + tile("warn", "ต่ำกว่าจุดสั่งซื้อ", low,  "ควรสั่งเพิ่ม",   low  ? "var(--sq-high)" : "")
    + tile("no",   "หมดอายุแล้ว",       exp,  "ต้องจัดการด่วน", exp  ? "var(--sq-crit)" : "")
    + (Number(window._rawStaleDays) ? tile("must", "ไม่อัปเดตเกิน " + window._rawStaleDays + " วัน", items.filter(rawIsStale).length, "ช่วยกันนับยืนยัน", items.some(rawIsStale) ? "var(--sq-must)" : "") : "")
    + tile("",     "ยกเลิกการใช้",      stop, "ไม่นับรวมข้างบน", "");
}

// ── Filter ──
function setRawFilter(t) {
  rawCurrentFilter = t;
  document.querySelectorAll('[id^="rawFilter-"]').forEach(b => b.classList.remove("filter-active"));
  const btn = document.getElementById("rawFilter-"+t);
  if (btn) btn.classList.add("filter-active");
  renderRawInventory(rawLastData);
}
function rawToggleAll() {
  const checked = document.getElementById("rawSelectAll").checked;
  document.querySelectorAll(".raw-checkbox").forEach(cb => cb.checked=checked);
}

// ── Export ──
function rawExportSelected() {
  const skus = Array.from(document.querySelectorAll(".raw-checkbox:checked")).map(cb=>cb.getAttribute("data-sku"));
  if (!skus.length) { showToast("กรุณาเลือกรายการ","warn"); return; }
  const data = rawLastData.filter(i=>skus.includes(String(i.SKU)));
  let csv = "\uFEFFSKU,ชื่อวัตถุดิบ,คงเหลือ,หน่วย,วันหมดอายุ,ตรวจนับล่าสุด\n";
  data.forEach(i=>{ csv+=`"${String(i.SKU||"").replace(/"/g,'""')}","${String(i.Name||"").replace(/"/g,'""')}","${i.Qty||""}","${String(i.Unit||"").replace(/"/g,'""')}","${rawForceThaiDate(i.ExpiryDate)}","${rawForceThaiDate(i.LastVerified)}"\n`; });
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
  a.download=`สต๊อก_${rawCurrentModule}_${new Date().toLocaleDateString("th-TH").replace(/\//g,"-")}.csv`; a.click();
  showToast("ส่งออกไฟล์สำเร็จ","success");
}

// ── Export PDF ──
function rawExportPdf() {
  const today = new Date(); today.setHours(0,0,0,0);
  const factoryName = rawCurrentModule === "SQF" ? "สุพรรณคิวฟู้ดส์ (SQF)" : "แม่ละมาย (MLM)";
  const dateStr = new Date().toLocaleDateString("th-TH",{year:"numeric",month:"long",day:"numeric"});
  const rows = rawLastData.map(item => {
    const isLow = rawIsLow(item);
    const ed = rawParseDate(item.ExpiryDate); const isExp = ed && ed < today;
    const nearAlert2 = rawNearExpiry(item, rawAlertDays);
    let rowStyle = "", statusText = "ปลอดภัย", statusColor = "#006b31";
    if(isExp)        { rowStyle="background:#fbe9ec;"; statusText="หมดอายุ";                        statusColor="#c8102e"; }
    else if(isLow)   { rowStyle="background:#fdf0e2;"; statusText="ต่ำ";                             statusColor="#a8560a"; }
    else if(nearAlert2){ rowStyle="background:#fff6cc;"; statusText=`ใกล้หมด(≤${rawAlertDays}ว)`; statusColor="#8a5a00"; }
    return `<tr style="${rowStyle}">
      <td style="padding:8px 12px;border:1px solid #d6d6d0;">${escapeHtml(item.SKU||"-")}</td>
      <td style="padding:8px 12px;border:1px solid #d6d6d0;font-weight:700;">${escapeHtml(item.Name||"-")}</td>
      <td style="padding:8px 12px;border:1px solid #d6d6d0;text-align:right;font-weight:700;">${Number(item.Qty||0).toLocaleString()}</td>
      <td style="padding:8px 12px;border:1px solid #d6d6d0;text-align:right;">${Number(item.Min||0).toLocaleString()}</td>
      <td style="padding:8px 12px;border:1px solid #d6d6d0;">${escapeHtml(item.Unit||"-")}</td>
      <td style="padding:8px 12px;border:1px solid #d6d6d0;">${rawForceThaiDate(item.ExpiryDate)||"-"}</td>
      <td style="padding:8px 12px;border:1px solid #d6d6d0;text-align:center;font-weight:700;color:${statusColor};">${statusText}</td>
    </tr>`;
  }).join("");
  const w = window.open("","","width=1000,height=700");
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
  <title>รายงานสต๊อกวัตถุดิบ — ${factoryName}</title>
  <style>@import url('${fontCssUrl()}');
    body{font-family:'Sarabun',sans-serif;font-size:13px;color:#111;padding:32px;}
    h1{font-size:22px;font-weight:900;margin-bottom:4px;}
    h2{font-size:15px;font-weight:700;color:#5c5c57;margin-bottom:24px;}
    table{width:100%;border-collapse:collapse;margin-top:16px;}
    thead tr{background:#f2f2ef;color:#111;border-bottom:2px solid #00843d;}
    th{padding:10px 12px;border:1px solid #3d3d3d;text-align:left;font-size:12px;font-weight:700;}
    td{font-size:12px;}
    .footer{margin-top:32px;font-size:11px;color:#5c5c57;text-align:right;}
    .doc-head{display:flex;align-items:center;gap:16px;border-bottom:3px solid #00843d;padding-bottom:12px;margin-bottom:16px;}
    @media print{body{padding:16px;}}
  </style></head><body>
  <div class="doc-head">
    ${logoImgTag(46)}
    <div>
      <h1 style="margin:0 0 2px;">รายงานสต๊อกวัตถุดิบ</h1>
      <h2 style="margin:0;">โรงงาน: ${factoryName} &nbsp;|&nbsp; วันที่พิมพ์: ${dateStr} &nbsp;|&nbsp; ผู้พิมพ์: ${personName(currentUser)}</h2>
    </div>
  </div>
  <table>
    <thead><tr><th>รหัส SKU</th><th>ชื่อวัตถุดิบ</th><th style="text-align:right">คงเหลือ</th><th style="text-align:right">ขั้นต่ำ</th><th>หน่วย</th><th>วันหมดอายุ</th><th style="text-align:center">สถานะ</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">รวมทั้งหมด ${rawLastData.length} รายการ &nbsp;|&nbsp; พิมพ์โดยระบบจัดการสต๊อก SQF & MLM</div>
  <script>window.onload=function(){window.print();}<\/script>
  </body></html>`);
  w.document.close();
}

// ── ใบขอซื้อ ──
function openPurchaseRequest() {
  const today = new Date(); today.setHours(0,0,0,0);
  const checkedSkus = Array.from(document.querySelectorAll(".raw-checkbox:checked")).map(cb=>cb.getAttribute("data-sku"));
  // ติ๊กไว้ = ใช้เฉพาะที่ติ๊ก · ไม่ติ๊ก = รายการ "ต้องลงมือ" ชุดเดียวกับจอวางแผนสั่งซื้อ (สั่งไม่ทัน/ต้องสั่งวันนี้/ใกล้ถึงเวลาสั่ง) + ของหมดอายุ
  //   หลังบ้านคิดแผนไม่ได้ (ไม่มี PlanStatus) → ถอยไปใช้ต่ำกว่าจุดสั่งซื้อแบบเดิม
  const lowItems = checkedSkus.length > 0
    ? rawLastData.filter(i => checkedSkus.includes(String(i.SKU)))
    : rawLastData.filter(item => {
        const ed = rawParseDate(item.ExpiryDate); const isExp = ed && ed < today;
        const ps = item.PlanStatus;
        return isExp || (ps ? (ps === "late" || ps === "now" || ps === "soon") : rawIsLow(item));
      });
  if (!lowItems.length) { showToast("ไม่มีรายการที่ต้องสั่งซื้อ ","success"); return; }

  const factoryName = rawCurrentModule === "SQF" ? "สุพรรณคิวฟู้ดส์ (SQF)" : "แม่ละมาย (MLM)";
  const dateStr = new Date().toLocaleDateString("th-TH",{year:"numeric",month:"long",day:"numeric"});
  const rows = lowItems.map((item,idx) => {
    const isLow = rawIsLow(item);
    const ed = rawParseDate(item.ExpiryDate); const isExp = ed && ed < today;
    // เหตุผล / อัตราใช้ / วันพอใช้ / จำนวนแนะนำ = จากหลังบ้านทั้งหมด (ชุดเดียวกับจอวางแผนสั่งซื้อ · คิดที่เดียว)
    let reason = [];
    if(isExp) reason.push("หมดอายุ");
    if(item.PlanStatus === "late" || item.PlanStatus === "now" || item.PlanStatus === "soon") reason.push(item.PlanStatusText);
    else if(isLow) reason.push("ต่ำกว่าจุดสั่งซื้อ");
    const qty       = Number(item.Qty||0);
    const daily     = Number(item.PlanRate||0);
    const ro        = rawRunout(item), daysLeft = ro ? ro.days : null;
    const suggestQty = Number(item.PlanSuggest||0);
    // พอใช้อีกกี่วันเมื่อรวมที่สั่ง = (คงเหลือ + สั่งจริง) ÷ ใช้/วัน (ปัดลง) — คนแก้จำนวนแล้วคิดใหม่ใน calcDaysAfter
    const daysAfterSuggest = daily > 0 && suggestQty > 0 ? Math.floor((qty + suggestQty) / daily) : null;
    const daysText   = daysLeft !== null ? `${daysLeft.toLocaleString()} วัน` : "-";
    return `<tr style="${isExp?"background:#fbe9ec":"background:#fdf0e2"}" data-qty="${qty}" data-daily="${daily}">
      <td style="padding:8px 12px;border:1px solid #d6d6d0;text-align:center;">${idx+1}</td>
      <td style="padding:8px 12px;border:1px solid #d6d6d0;font-size:11px;color:#5c5c57;">${escapeHtml(item.SKU||"-")}</td>
      <td style="padding:8px 12px;border:1px solid #d6d6d0;font-weight:700;">${escapeHtml(item.Name||"-")}</td>
      <td style="padding:8px 12px;border:1px solid #d6d6d0;text-align:right;">${qty.toLocaleString()}</td>
      <td style="padding:8px 12px;border:1px solid #d6d6d0;text-align:right;color:#5c5c57;">${daily > 0 ? planFmt(daily) : "-"}</td>
      <td style="padding:8px 12px;border:1px solid #d6d6d0;text-align:center;font-weight:700;color:${ro ? ro.hex : "#3d3d3d"};">${daysText}</td>
      <td style="padding:8px 12px;border:1px solid #d6d6d0;text-align:right;">
        <input type="number" class="order-input" aria-label="จำนวนที่จะสั่ง" value="${suggestQty > 0 ? suggestQty : ""}" min="0"
          style="width:80px;padding:4px 6px;border:2px solid #006b31;border-radius:8px;font-size:13px;font-weight:700;text-align:right;font-family:inherit;"
          oninput="calcDaysAfter(this)">
        <span class="order-input-print" style="display:none;font-weight:700;">${suggestQty > 0 ? suggestQty.toLocaleString() : "-"}</span>
      </td>
      <td style="padding:8px 12px;border:1px solid #d6d6d0;text-align:center;font-weight:700;">
        <span class="days-after" style="color:#006b31;">${daysAfterSuggest !== null ? daysAfterSuggest + " วัน" : "-"}</span>
      </td>
      <td style="padding:8px 12px;border:1px solid #d6d6d0;">${escapeHtml(item.Unit||"-")}</td>
      <td style="padding:8px 12px;border:1px solid #d6d6d0;color:#a8560a;font-weight:700;">${reason.join(", ")}</td>
    </tr>`;
  }).join("");

  const w = window.open("","","width=1050,height=750");
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
  <title>ใบขอซื้อวัตถุดิบ — ${factoryName}</title>
  <style>@import url('${fontCssUrl()}');
    body{font-family:'Sarabun',sans-serif;font-size:13px;color:#111;padding:32px 40px;}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #00843d;padding-bottom:16px;margin-bottom:16px;}
    h1{font-size:24px;font-weight:900;margin:0 0 4px;}
    .sub{font-size:13px;color:#3d3d3d;}
    .doc-no{text-align:right;font-size:12px;color:#5c5c57;line-height:1.8;}
    .formula-note{background:#e5eff8;border:1px solid #005a9c;border-radius:6px;padding:10px 16px;font-size:11px;color:#005a9c;margin-bottom:16px;line-height:1.8;}
    .print-btn{background:#006b31;color:#fff;border:none;padding:8px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;margin-bottom:12px;}
    table{width:100%;border-collapse:collapse;margin-top:8px;}
    thead tr{background:#f2f2ef;color:#111;border-bottom:2px solid #00843d;}
    th{padding:10px 12px;border:1px solid #3d3d3d;font-size:11px;font-weight:700;text-align:left;}
    td{font-size:12px;}
    .sign-section{margin-top:60px;display:flex;gap:60px;}
    .sign-box{flex:1;text-align:center;border-top:2px solid #8a8a84;padding-top:8px;font-size:12px;color:#5c5c57;}
    .footer{margin-top:24px;font-size:11px;color:#5c5c57;text-align:center;}
    @media print{
      .no-print{display:none!important;}
      .order-input{display:none!important;}
      .order-input-print{display:inline!important;}
      body{padding:16px 24px;}
    }
  </style></head><body>
  <div class="no-print" style="margin-bottom:12px;display:flex;gap:10px;align-items:center;">
    <button class="print-btn" onclick="window.print()">พิมพ์ใบขอซื้อ</button>
    <span style="font-size:12px;color:#5c5c57;">แก้ไขช่อง <b style="color:#006b31;">สั่งจริง</b> ได้ก่อนพิมพ์ — ระบบจะคำนวณ <b style="color:#006b31;">พอใช้อีกกี่วัน</b> ให้อัตโนมัติ</span>
  </div>
  <div class="header">
    <div style="display:flex;align-items:center;gap:14px;">
      ${logoImgTag(44)}
      <div>
        <h1>ใบขอซื้อวัตถุดิบ</h1>
        <div class="sub">โรงงาน: <b>${factoryName}</b></div>
      </div>
    </div>
    <div class="doc-no">
      <div>วันที่: <b>${dateStr}</b></div>
      <div>ผู้จัดทำ: <b>${personName(currentUser)}</b></div>
      <div>รายการทั้งหมด: <b>${lowItems.length} รายการ</b></div>
    </div>
  </div>
  <div class="formula-note no-print">
    <b>"สั่งจริง" ที่ใส่ไว้ให้ = จำนวนแนะนำจากจอวางแผนสั่งซื้อ</b> (ตัวเลขชุดเดียวกัน · คิดจากการเบิกจริง เวลารอของ กันชน และสั่งให้พอใช้ตามที่ตั้งไว้ · แก้ได้ก่อนพิมพ์)
    &nbsp;&nbsp;• <b>ใช้/วัน</b> และ <b>วันคงเหลือ</b> = ตัวเลขเดียวกับจอวางแผนสั่งซื้อ
    &nbsp;&nbsp;• <b>พอใช้อีกกี่วัน (รวมที่สั่ง)</b> = (คงเหลือ + สั่งจริง) ÷ ใช้/วัน (ปัดลง — ไม่นับวันที่ใช้ไม่เต็ม)
  </div>
  <table>
    <thead><tr>
      <th style="width:32px;text-align:center">ลำดับ</th>
      <th style="width:80px">รหัส SKU</th>
      <th>ชื่อวัตถุดิบ</th>
      <th style="text-align:right;width:75px">คงเหลือ</th>
      <th style="text-align:right;width:65px">ใช้/วัน</th>
      <th style="text-align:center;width:70px">วันคงเหลือ</th>
      <th style="text-align:right;width:90px">สั่งจริง </th>
      <th style="text-align:center;width:85px">พอใช้อีกกี่วัน<br>(รวมที่สั่ง)</th>
      <th style="width:50px">หน่วย</th>
      <th style="width:90px">เหตุผล</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="sign-section">
    <div class="sign-box">ผู้จัดทำ<br><br>( ${personName(currentUser)} )</div>
    <div class="sign-box">ผู้ตรวจสอบ<br><br>( .......................... )</div>
    <div class="sign-box">ผู้อนุมัติ<br><br>( .......................... )</div>
  </div>
  <div class="footer">พิมพ์โดยระบบจัดการสต๊อก SQF & MLM &nbsp;|&nbsp; ${new Date().toLocaleString("th-TH")}</div>
  <script>
    function calcDaysAfter(inputEl) {
      const tr    = inputEl.closest("tr");
      const qty   = Number(tr.dataset.qty) || 0;
      const daily = Number(tr.dataset.daily) || 0;
      const order = Number(inputEl.value) || 0;
      const printSpan = tr.querySelector(".order-input-print");
      if (printSpan) printSpan.textContent = order > 0 ? order.toLocaleString() : "-";
      const daysEl = tr.querySelector(".days-after");
      if (daily > 0 && order > 0) {
        const d = Math.floor((qty + order) / daily);
        daysEl.textContent = d + " วัน";
        daysEl.style.color = d <= 7 ? "#c8102e" : d <= 14 ? "#a8560a" : d <= 30 ? "#8a5a00" : "#006b31";
      } else {
        daysEl.textContent = "-";
      }
    }
  <\/script>
  </body></html>`);
  w.document.close();
}

// ── ใบรายงานสต๊อก ──
function openStockReport() {
  // ดึง SKU ที่ติ๊กถูก — ถ้าไม่เลือกเลยให้ใช้ทั้งหมด
  const checkedSkus = Array.from(document.querySelectorAll(".raw-checkbox:checked")).map(cb=>cb.getAttribute("data-sku"));
  const sourceData  = checkedSkus.length > 0
    ? rawLastData.filter(i => checkedSkus.includes(String(i.SKU)))
    : rawLastData;
  if (!sourceData.length) { showToast("ไม่มีข้อมูล","warn"); return; }

  const today = new Date(); today.setHours(0,0,0,0);
  const factoryName = rawCurrentModule === "SQF" ? "สุพรรณคิวฟู้ดส์ (SQF)" : "แม่ละมาย (MLM)";
  const dateStr = new Date().toLocaleDateString("th-TH",{year:"numeric",month:"long",day:"numeric"});
  const timeStr = new Date().toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"});
  const scopeLabel = checkedSkus.length > 0 ? `เฉพาะที่เลือก (${checkedSkus.length} รายการ)` : "ทั้งหมด";

  // แยกกลุ่มจาก sourceData
  const expItems   = sourceData.filter(i => { const d=rawParseDate(i.ExpiryDate); return d&&d<today; });
  const lowItems   = sourceData.filter(i => !expItems.includes(i) && rawIsLow(i));
  const near7      = sourceData.filter(i => !expItems.includes(i) && rawNearExpiry(i, rawAlertDays));
  const near30     = [];
  const okItems    = sourceData.filter(i => !expItems.includes(i) && !lowItems.includes(i) && !near7.includes(i));

  const total    = sourceData.length;

  function buildSection(title, color, bgColor, items, showDaily=false) {
    if(!items.length) return "";
    const rows = items.map((item,idx) => {
      const qty      = Number(item.Qty||0);
      const daily    = Number(item.DailyUsage||0);   // คอลัมน์ "ใช้ต่อวัน" (ค่าที่ตั้งไว้)
      const ro       = rawRunout(item);   // วันพอใช้จากหลังบ้าน (ชุดเดียวกับจอต้องสั่ง)
      const daysText = ro
        ? `<span style="font-weight:700;color:${ro.hex}">${ro.days.toLocaleString()} วัน</span>${ro.date?`<br><span style="font-size:11px;color:#5c5c57;font-weight:400;">(ถึง ${ro.date})</span>`:""}`
        : "-";
      return `<tr style="background:${idx%2===0?"#fff":bgColor}">
        <td style="padding:7px 10px;border:1px solid #d6d6d0;text-align:center;font-size:11px;">${idx+1}</td>
        <td style="padding:7px 10px;border:1px solid #d6d6d0;font-weight:700;">${escapeHtml(item.Name||"-")}</td>
        <td style="padding:7px 10px;border:1px solid #d6d6d0;text-align:right;font-weight:700;">${qty.toLocaleString()} <span style="font-size:10px;color:#5c5c57;font-weight:400;">${escapeHtml(item.Unit||"")}</span></td>
        <td style="padding:7px 10px;border:1px solid #d6d6d0;text-align:right;">${Number(item.Min||0).toLocaleString()}</td>
        <td style="padding:7px 10px;border:1px solid #d6d6d0;text-align:right;color:#005a9c;">${daily>0?daily.toLocaleString():"-"}</td>
        <td style="padding:7px 10px;border:1px solid #d6d6d0;text-align:center;line-height:1.6;">${daysText}</td>
        <td style="padding:7px 10px;border:1px solid #d6d6d0;">${rawForceThaiDate(item.ExpiryDate)||"-"}</td>
        <td style="padding:7px 10px;border:1px solid #d6d6d0;">${rawForceThaiDate(item.LastVerified)||"-"}</td>
      </tr>`;
    }).join("");
    return `<div style="margin-bottom:28px">
      <div style="background:${bgColor};border-bottom:2px solid ${color};padding:10px 16px;font-weight:900;font-size:13px;color:${color};letter-spacing:0.5px;">${title} (${items.length} รายการ)</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#f2f2ef;color:#111;border-bottom:2px solid #00843d;">
          <th style="padding:7px 10px;border:1px solid #3d3d3d;text-align:center;width:30px">ลำดับ</th>
          <th style="padding:7px 10px;border:1px solid #3d3d3d;">ชื่อวัตถุดิบ</th>
          <th style="padding:7px 10px;border:1px solid #3d3d3d;text-align:right;width:100px">คงเหลือ / หน่วย</th>
          <th style="padding:7px 10px;border:1px solid #3d3d3d;text-align:right;width:65px">ขั้นต่ำ</th>
          <th style="padding:7px 10px;border:1px solid #3d3d3d;text-align:right;width:65px">ใช้/วัน</th>
          <th style="padding:7px 10px;border:1px solid #3d3d3d;text-align:center;width:110px">วันคงเหลือ / ถึงวันที่</th>
          <th style="padding:7px 10px;border:1px solid #3d3d3d;width:90px">วันหมดอายุ</th>
          <th style="padding:7px 10px;border:1px solid #3d3d3d;width:100px">ตรวจนับล่าสุด</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  const w = window.open("","","width=1100,height=800");
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
  <title>ใบรายงานสต๊อกวัตถุดิบ — ${factoryName}</title>
  <style>@import url('${fontCssUrl()}');
    body{font-family:'Sarabun',sans-serif;font-size:13px;color:#111;padding:28px 36px;}
    .report-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;margin-bottom:20px;border-bottom:3px solid #00843d;}
    h1{font-size:22px;font-weight:900;margin:0 0 4px;}
    .sub{font-size:12px;color:#3d3d3d;}
    .summary{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;}
    .sum-card{flex:1;min-width:120px;background:#f7f7f4;border:2px solid #d6d6d0;border-radius:6px;padding:12px 16px;text-align:center;}
    .sum-card .num{font-size:26px;font-weight:900;line-height:1;}
    .sum-card .lbl{font-size:10px;font-weight:700;color:#5c5c57;margin-top:4px;text-transform:uppercase;}
    .sign-section{margin-top:48px;display:flex;gap:48px;}
    .sign-box{flex:1;text-align:center;border-top:2px solid #8a8a84;padding-top:8px;font-size:11px;color:#5c5c57;}
    .footer{margin-top:20px;font-size:11px;color:#5c5c57;text-align:center;border-top:1px solid #d6d6d0;padding-top:12px;}
    @media print{body{padding:12px 20px;} .no-print{display:none;}}
  </style></head><body>
  <div class="report-header">
    <div style="display:flex;align-items:center;gap:14px;">
      ${logoImgTag(46)}
      <div>
        <h1>ใบรายงานสต๊อกวัตถุดิบ</h1>
        <div class="sub">โรงงาน: <b>${factoryName}</b> &nbsp;|&nbsp; <b>${dateStr}</b> เวลา <b>${timeStr} น.</b></div>
        <div class="sub" style="margin-top:4px;">ผู้จัดทำ: <b>${personName(currentUser)}</b> &nbsp;|&nbsp; ขอบเขต: <b>${scopeLabel}</b></div>
      </div>
    </div>
    <div style="text-align:right;">
      <button class="no-print" onclick="window.print()" style="background:#00843d;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">พิมพ์</button>
    </div>
  </div>

  <div class="summary">
    <div class="sum-card"><div class="num" style="color:#111">${total}</div><div class="lbl">รายการทั้งหมด</div></div>
    <div class="sum-card"><div class="num" style="color:#c8102e">${expItems.length}</div><div class="lbl">หมดอายุ</div></div>
    <div class="sum-card"><div class="num" style="color:#a8560a">${lowItems.length}</div><div class="lbl">สต๊อกต่ำ</div></div>
    <div class="sum-card"><div class="num" style="color:#8a5a00">${near7.length}</div><div class="lbl">ใกล้หมด 7 วัน</div></div>
    <div class="sum-card"><div class="num" style="color:#005a9c">${near30.length}</div><div class="lbl">ใกล้หมด 30 วัน</div></div>
    <div class="sum-card"><div class="num" style="color:#006b31">${okItems.length}</div><div class="lbl">ปกติ</div></div>
  </div>

  ${buildSection("หมดอายุ — ต้องดำเนินการทันที","#c8102e","#fbe9ec",expItems)}
  ${buildSection("สต๊อกต่ำกว่าจุดสั่งซื้อ","#a8560a","#fdf0e2",lowItems)}
  ${buildSection(`ใกล้หมดอายุ ภายใน ${rawAlertDays} วัน`,"#8a5a00","#fff6cc",near7)}
  ${buildSection("สต๊อกปกติ","#006b31","#e3f1e8",okItems)}

  <div class="sign-section">
    <div class="sign-box">ผู้จัดทำรายงาน<br><br>( ${personName(currentUser)} )</div>
    <div class="sign-box">ผู้ตรวจสอบ<br><br>( .......................... )</div>
    <div class="sign-box">ผู้จัดการ / ผู้อนุมัติ<br><br>( .......................... )</div>
  </div>
  <div class="footer">พิมพ์โดยระบบจัดการสต๊อก SQF & MLM &nbsp;|&nbsp; ${new Date().toLocaleString("th-TH")} &nbsp;|&nbsp; รวมทั้งหมด ${total} รายการ</div>
  </body></html>`);
  w.document.close();
}

// ── Backup ──
async function rawRunBackup() {
  if (!confirm("สำรองข้อมูลทั้งระบบตอนนี้? \n\n(ระบบสำรองให้เองทุกเช้า 08:00 อยู่แล้ว — กดเมื่อต้องการสำรองเพิ่มก่อนแก้ข้อมูลจำนวนมาก)")) return;
  showLoading("กำลังสำรองข้อมูล...");
  const r = await rawFetch({ action:"BACKUP", user:currentUser });
  hideLoading();
  if (r.status==="success") { showToast("Backup สำเร็จ ","success"); rawLoadData(); }
  else showToast(r.message||"Backup ไม่สำเร็จ","error");
}

// ── Modals ──
function openRawCreate() {
  document.getElementById("rawNewSku").value        = rawNextSku;
  document.getElementById("rawNewName").value       = "";
  document.getElementById("rawNewQty").value        = "0";
  document.getElementById("rawNewUnit").value       = "";
  document.getElementById("rawNewMin").value        = "0";
  document.getElementById("rawNewDailyUsage").value = "0";
  document.getElementById("rawNewExpiry").value     = "";
  rawFieldErrorsClear("rawNewName", "rawNewUnit", "rawNewQty", "rawNewMin", "rawNewDailyUsage");
  document.getElementById("rawCreateModal").classList.remove("hidden");
  setTimeout(() => document.getElementById("rawNewName")?.focus(), 60);   // เริ่มพิมพ์ชื่อได้ทันที
}
function closeRawCreate() { document.getElementById("rawCreateModal").classList.add("hidden"); }

function openRawEdit(sku) {
  const item = rawLastData.find(i=>String(i.SKU)===String(sku));
  if (!item) { showToast("ไม่พบข้อมูล","error"); return; }
  document.getElementById("rawEditSku").value        = item.SKU||"";
  document.getElementById("rawEditName").value       = item.Name||"";
  document.getElementById("rawEditUnit").value       = item.Unit||"";
  document.getElementById("rawEditMin").value        = Number(item.Min||0);
  document.getElementById("rawEditDailyUsage").value = Number(item.DailyUsage||0);
  // ItemExpiry = ค่าที่ตั้งที่รายการเอง (ExpiryDate รวมวันหมดอายุของล็อตแล้ว — บันทึกกลับจะติดวันของล็อตไปเป็นของรายการ)
  document.getElementById("rawEditExpiry").value     = rawFormatDateInput(item.ItemExpiry !== undefined ? item.ItemExpiry : item.ExpiryDate);
  document.getElementById("rawEditAlertDays").value  = item.AlertDays ? Number(item.AlertDays) : rawAlertDays;
  // ข้อ 20: ค่าจัดซื้อรายตัว
  const _e = id => document.getElementById(id);
  if (_e("rawEditLeadDays")) _e("rawEditLeadDays").value = Number(item.LeadDays || 0) || "";
  if (_e("rawEditMoq"))      _e("rawEditMoq").value      = Number(item.Moq || 0) || "";
  if (_e("rawEditPackSize")) _e("rawEditPackSize").value = Number(item.PackSize || 0) || "";
  rawFieldErrorsClear("rawEditName", "rawEditUnit", "rawEditMin", "rawEditDailyUsage");
  document.getElementById("rawEditModal").classList.remove("hidden");
  setTimeout(() => document.getElementById("rawEditName")?.focus(), 60);
}
function closeRawEdit() { document.getElementById("rawEditModal").classList.add("hidden"); }

function openRawVerify(sku, name) {
  rawVerifyTarget = sku;
  document.getElementById("rawVerifyTitle").innerText = `${name} (${sku})`;
  document.getElementById("rawVerifyQty").value = "";
  rawFieldErrorsClear("rawVerifyQty");
  document.getElementById("rawVerifyModal").classList.remove("hidden");
  setTimeout(() => document.getElementById("rawVerifyQty")?.focus(), 60);
}
function closeRawVerify() { document.getElementById("rawVerifyModal").classList.add("hidden"); }

function openRawAction(sku, name, unit, currentQty) {
  const qty = Number(currentQty) || 0;
  document.getElementById("rawModalSkuVal").value      = sku;
  document.getElementById("rawModalSku").innerText     = `ID: ${sku}`;
  document.getElementById("rawModalUnit").innerText    = `หน่วยนับ: ${unit||"-"}`;
  document.getElementById("rawModalTitle").innerText   = name;
  document.getElementById("rawModalQty").value         = "1";
  document.getElementById("rawModalCurrentQty").value  = qty;
  document.getElementById("rawModalStock").textContent = qty + " " + (unit||"");
    // ล้างช่อง "ใช้กับงาน" ทุกครั้ง กันเผลอใช้ค่าเดิมของรายการก่อน
  const _pp = document.getElementById("rawModalPurpose");
  if (_pp) _pp.value = "";
  rawFieldErrorsClear("rawModalQty", "rawModalPurpose");
  // 🏷️ ข้อมูลล็อตตอนรับ — เริ่มใหม่ทุกครั้ง (วันที่รับ = วันนี้ · ที่เหลือว่าง · พับไว้)
  const _lw = document.getElementById("rawLotWrap");
  if (_lw) _lw.open = false;
  [["rawLotRecv", rawTodayYmd()], ["rawLotNo", ""], ["rawLotExp", ""]].forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.value = v; });
  rawFillPurposeList();
  rawFillWorkOrders();
  document.getElementById("rawModalStock").style.color =
    qty <= 0 ? "var(--sq-crit)" : qty < 10 ? "var(--sq-high)" : "var(--sq-accent)";
  document.getElementById("rawActionModal").classList.remove("hidden");
  setRawType("OUT");
  setTimeout(() => { const q = document.getElementById("rawModalQty"); if (q) { q.focus(); q.select && q.select(); } }, 60);
}

// ยอดหลังทำรายการ — ให้เห็นก่อนกดบันทึก (พิมพ์เกินหลัก/เลือกผิดประเภทจะเห็นทันที)
function rawUpdateAfter() {
  const el = document.getElementById("rawModalAfter");
  if (!el) return;
  const raw = String(document.getElementById("rawModalQty").value || "").trim();
  const cur = Number(document.getElementById("rawModalCurrentQty").value) || 0;
  const type = document.getElementById("rawModalType").value;
  const unit = (document.getElementById("rawModalUnit").innerText || "").replace(/^หน่วยนับ:\s*/, "").replace(/^-$/, "");
  const q = Number(raw.replace(/,/g, ""));
  const f = n => Number(n).toLocaleString("th-TH", { maximumFractionDigits: 3 });
  // ปุ่มบันทึกบอกประเภท + จำนวน ให้อ่านทวนก่อนกด (เหมือนมือถือ "📤 เบิก 500 ใบ")
  const btn = document.getElementById("rawBtnSubmit");
  const ok = raw && !/[+\-*\/()]/.test(raw) && !isNaN(q) && q > 0;
  const after = ok ? Math.round((type === "OUT" ? cur - q : cur + q) * 1000) / 1000 : 0;
  // เบิกเกินยอด → ปุ่มบอกเหตุผลและกดไม่ได้ (เดิมข้อความแดงขึ้นแต่ปุ่มยัง "เบิก 12 ขวด" พร้อมกด) · rawBusy = กำลังบันทึก ไม่ไปยุ่ง
  if (btn && !rawIsBusy("rawBtnSubmit")) {
    const over = ok && after < 0;
    btn.disabled = over;
    btn.textContent = over ? "เกินยอดที่มี" : ok ? ({ OUT: "เบิก", RETURN: "คืน", IN: "รับ" }[type] || "บันทึก") + " " + f(q) + " " + unit : "บันทึกรายการ";
  }
  // 🏷️ เบิก: ให้เห็นก่อนกดว่าระบบจะตัดล็อตไหน (หลังบ้านตัดจริงตามยอด ณ ตอนบันทึก)
  const lp = document.getElementById("rawModalLots");
  if (lp) {
    const h = type === "OUT" && ok && after >= 0 ? rawLotPreview(rawItemOf(document.getElementById("rawModalSkuVal").value), q) : "";
    lp.innerHTML = h; lp.hidden = !h;
  }
  if (!ok) { el.textContent = ""; return; }   // กำลังพิมพ์โจทย์คำนวณ — รอผลก่อน
  if (after < 0) {
    el.style.color = "var(--sq-crit)";
    el.textContent = "เกินยอดที่มี (" + f(cur) + " " + unit + ")";
  } else {
    el.style.color = after === 0 ? "var(--sq-high)" : "var(--sq-ink2)";
    el.textContent = "หลังบันทึก: คงเหลือ " + f(after) + " " + unit + (after === 0 ? " (หมดพอดี)" : "");
  }
}
function rawPickPurpose(btn) {
  const inp = document.getElementById("rawModalPurpose");
  if (inp) { inp.value = btn.getAttribute("data-p") || ""; inp.focus(); }
}
function closeRawAction() { document.getElementById("rawActionModal").classList.add("hidden"); }

// ═══ 🏷️ ล็อตวัตถุดิบ (วันที่รับเข้า) — หลังบ้านคิดทั้งหมด (src/lots.js · ลำดับตัด / ค้างนาน / ชื่อล็อต) หน้าจอแค่แสดงและส่งค่าที่คนกรอก ═══
const rawItemOf = sku => (rawLastData || []).find(m => String(m.SKU) === String(sku));
function rawTodayYmd() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function rawYmdThai(ymd) { const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${Number(m[1]) + 543}` : "–"; }
const rawLotNum = n => Number(n).toLocaleString("th-TH", { maximumFractionDigits: 3 });
// บรรทัดในแถวรายการ: "3 ล็อต · เก่าสุด รับ 02/10/2569" (กดเปิดรายการล็อต) + ป้ายล็อตค้างนาน
function rawLotMeta(item) {
  const L = item.Lots || [];
  if (!L.length) return "";
  const recv = L.filter(l => l.RecvDate).map(l => l.RecvDate).sort();
  const txt = L.length === 1 ? "ล็อต " + L[0].Label
    : L.length + " ล็อต · เก่าสุด " + (L.some(l => !l.RecvDate) ? "ยอดยกมา" : "รับ " + rawYmdThai(recv[0]));
  const old = L.filter(l => l.Old);
  return `<button type="button" class="rm-lotlink" onclick="openRawLots('${escapeJsAttr(item.SKU)}')" title="ดูล็อตทั้งหมด${window._appIsViewer ? "" : " / แก้ไข"}">${escapeHtml(txt)}</button>` +
    (old.length ? `<span class="rm-lotold" title="รับมาเกิน ${window._rawLotAgeDays} วันแล้วยังเหลือ — หยิบใช้ก่อน หรือตรวจว่าของยังอยู่จริง">${uiSign("warn", 14)}ล็อตค้าง ${Math.max(...old.map(l => l.AgeDays))} วัน</span>` : "");
}
// เบิก q → ล็อตที่จะถูกตัด (เดินตามลำดับที่หลังบ้านเรียงมาให้แล้ว)
function rawLotPreview(item, q) {
  const L = (item && item.Lots) || [];
  if (!L.length || !(q > 0)) return "";
  const out = [];
  let left = q;
  for (const l of L) {
    if (left <= 0) break;
    const t = Math.min(l.Qty, left);
    out.push(`<div class="rm-lotpv-row"><span>${escapeHtml(l.Label)}</span><span style="white-space:nowrap"><b>${rawLotNum(t)}</b> ${escapeHtml(item.Unit || "")}</span></div>`);
    left = Math.round((left - t) * 1000) / 1000;
  }
  return '<div class="rm-lotpv-head">จะตัดจากล็อตเก่าก่อน</div>' + out.join("");
}

let _rawLotSku = "", _rawLotEditId = null;
function openRawLots(sku) {
  _rawLotSku = String(sku);
  rawLotFormClose();
  rawRenderLots();
  document.getElementById("rawLotModal").classList.remove("hidden");
}
function closeRawLots() { rawLotFormClose(); document.getElementById("rawLotModal").classList.add("hidden"); }
function rawRenderLots() {
  const item = rawItemOf(_rawLotSku), box = document.getElementById("rawLotList");
  if (!box) return;
  if (!item) { box.innerHTML = '<p class="rm-lotnote">ไม่พบรายการนี้แล้ว</p>'; return; }
  const L = item.Lots || [], u = escapeHtml(item.Unit || ""), ro = !!window._appIsViewer;
  document.getElementById("rawLotTitle").textContent = item.Name || item.SKU;
  document.getElementById("rawLotSub").textContent = item.SKU + " · คงเหลือ " + rawLotNum(item.Qty) + " " + (item.Unit || "") +
    (L.length > 1 ? " · เบิกจะตัดจากบนลงล่าง" : "");
  if (!L.length) { box.innerHTML = '<p class="rm-lotnote" style="padding:12px 0;">ไม่มีล็อตที่ยังมีของ (คงเหลือ 0)</p>'; return; }
  const sum = L.reduce((a, l) => a + l.Qty, 0);
  box.innerHTML = L.map(l => `<div class="rm-lotrow">
      <div>
        <div class="l1">${escapeHtml(l.Label)}${l.Old ? `<span class="rm-lotold">${uiSign("warn", 14)}ค้าง ${l.AgeDays} วัน</span>` : ""}</div>
        <div class="l2">${l.RecvDate ? (l.AgeDays > 0 ? "รับมาแล้ว " + l.AgeDays + " วัน" : l.AgeDays === 0 ? "รับวันนี้" : "วันที่รับล่วงหน้า") + " · รับเข้า " + rawLotNum(l.QtyIn) : "ของเดิมก่อนมีระบบล็อต"}${l.ExpDate ? " · หมดอายุ " + rawYmdThai(l.ExpDate) : ""}</div>
      </div>
      <div class="q">${rawLotNum(l.Qty)}<small>${u}</small></div>
      ${ro ? "" : `<div class="acts"><button type="button" class="rm-lotbtn" onclick="rawLotFormOpen(${Number(l.Id)})">แก้ไข</button><button type="button" class="rm-lotbtn del" onclick="rawLotDelete(${Number(l.Id)})">ลบ</button></div>`}
    </div>`).join("") +
    `<div class="rm-lottotal"><span>รวมทุกล็อต</span><span><b>${rawLotNum(sum)}</b> ${u}${Math.abs(sum - Number(item.Qty)) < 0.0005 ? " = คงเหลือ" : ""}</span></div>`;
}
const _rawLotOf = id => ((rawItemOf(_rawLotSku) || {}).Lots || []).find(l => Number(l.Id) === Number(id));
function rawLotFormOpen(id) {
  const l = _rawLotOf(id), item = rawItemOf(_rawLotSku);
  if (!l || !item) return;
  _rawLotEditId = l.Id;
  document.getElementById("rawLotFormTitle").textContent = "แก้ไขล็อต " + l.Label;
  document.getElementById("rawLotEdRecv").value = l.RecvDate || "";
  document.getElementById("rawLotEdNo").value = l.LotNo || "";
  document.getElementById("rawLotEdExp").value = l.ExpDate || "";
  document.getElementById("rawLotEdQty").value = l.Qty;
  document.getElementById("rawLotEdUnit").textContent = "(" + (item.Unit || "") + ")";
  rawFieldErrorsClear("rawLotEdQty");
  const f = document.getElementById("rawLotForm");
  f.hidden = false;
  f.scrollIntoView({ block: "nearest" });
  setTimeout(() => document.getElementById("rawLotEdRecv")?.focus(), 30);
}
function rawLotFormClose() { _rawLotEditId = null; const f = document.getElementById("rawLotForm"); if (f) f.hidden = true; }
async function rawLotSend(body, label) {
  const r = await offlineSend(Object.assign({ module: rawCurrentModule, action: "LOTEDIT", sku: _rawLotSku, user: currentUser }, body), label);
  if (r.storeFailed) { alert("เน็ตล่ม และเก็บรายการไว้ในเครื่องไม่ได้ — ลองใหม่เมื่อเน็ตกลับมา"); return false; }
  if (r.needLogin) { handleTokenExpired(r); return false; }
  if (r.queued) { showToast("เน็ตล่ม — เก็บไว้ในเครื่องแล้ว จะส่งให้เองเมื่อเน็ตกลับมา", "warn", 6000); rawUpdateOfflineBadge(); closeRawLots(); return false; }
  if (r.status !== "success") { showToast(r.message || "บันทึกไม่สำเร็จ", "error", 6000); return false; }
  if (typeof tgFlushSoon === "function") tgFlushSoon();
  await rawLoadData(false, 0, { silent: true });   // ยอดคงเหลือ/ลำดับล็อตใหม่จากหลังบ้าน
  rawRenderLots();
  return true;
}
async function rawLotSave() {
  if (rawIsBusy("rawLotSaveBtn")) return;
  const l = _rawLotOf(_rawLotEditId), item = rawItemOf(_rawLotSku);
  if (!l || !item) return rawLotFormClose();
  const rd = document.getElementById("rawLotEdRecv").value || "";
  const ln = document.getElementById("rawLotEdNo").value.trim();
  const ex = document.getElementById("rawLotEdExp").value || "";
  const qs = String(document.getElementById("rawLotEdQty").value || "").replace(/,/g, "").trim();
  const q = Number(qs);
  if (qs === "" || isNaN(q) || q < 0) { rawFieldError("rawLotEdQty", "ใส่จำนวนที่เหลือจริงเป็นตัวเลข 0 ขึ้นไป"); return; }
  if (rd && rd > rawTodayYmd() && !confirm("วันที่รับเข้า " + rawYmdThai(rd) + " เป็นวันในอนาคต\n\nยืนยันบันทึกตามนี้?")) return;
  const diff = Math.round((q - l.Qty) * 1000) / 1000, u = item.Unit || "";
  if (!diff && rd === (l.RecvDate || "") && ln === (l.LotNo || "") && ex === (l.ExpDate || "")) { showToast("ยังไม่ได้แก้อะไร", "warn"); return; }
  if (diff && !confirm(`แก้จำนวนล็อต ${l.Label} จาก ${rawLotNum(l.Qty)} เป็น ${rawLotNum(q)} ${u}\n\nยอดคงเหลือของรายการจะ${diff > 0 ? "เพิ่ม" : "ลด"} ${rawLotNum(Math.abs(diff))} ${u} (ลงประวัติเป็น ตรวจนับ/ปรับยอด)\n\nยืนยัน?`)) return;
  setRawBusy("rawLotSaveBtn", true, "กำลังบันทึก...");
  const ok = await rawLotSend({ lotId: l.Id, recvDate: rd, lotNo: ln, expDate: ex, qty: q, seenQty: l.Qty }, `แก้ล็อต ${item.Name} ${l.Label}`);
  setRawBusy("rawLotSaveBtn", false);
  if (ok) { rawLotFormClose(); showToast("บันทึกล็อตแล้ว", "success"); }
}
async function rawLotDelete(id) {
  const l = _rawLotOf(id), item = rawItemOf(_rawLotSku);
  if (!l || !item) return;
  const u = item.Unit || "";
  if (!confirm(`ลบล็อต ${l.Label} (เหลือ ${rawLotNum(l.Qty)} ${u})?\n\nยอดคงเหลือของรายการจะลดลง ${rawLotNum(l.Qty)} ${u} — ใช้เมื่อล็อตนี้ไม่มีอยู่จริงหรือลงผิด\n(ของหมดตามปกติไม่ต้องลบ ระบบตัดให้เองตอนเบิก)`)) return;
  if (await rawLotSend({ lotId: l.Id, remove: true, seenQty: l.Qty }, `ลบล็อต ${item.Name} ${l.Label}`)) showToast("ลบล็อตแล้ว", "success");
}

// ข้อ 19: ใบสั่งผลิตที่ยังเปิดอยู่ ให้เลือกอ้างอิงตอนเบิก (ไม่บังคับ — ไม่มีก็เบิกได้)
let _rawWoCache = { at: 0, list: [] };
async function rawFillWorkOrders() {
  const sel = document.getElementById("rawModalWorkOrder");
  if (!sel) return;
  sel.innerHTML = '<option value="">— ไม่อ้างอิงใบสั่งผลิต —</option>';
  try {
    if (Date.now() - _rawWoCache.at > 5 * 60000) {
      const r = await (await fetch(GAS_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ module: "COLDROOM", action: "getWorkOrders" }) })).json();
      _rawWoCache = { at: Date.now(), list: (r && r.orders) || [] };
    }
    _rawWoCache.list
      .filter(o => String(o.Status || "") !== "เสร็จสิ้น" && String(o.Status || "") !== "ยกเลิก")
      .slice(0, 40)
      .forEach(o => {
        const opt = document.createElement("option");
        opt.value = String(o.OrderID || "");
        opt.textContent = `${o.OrderID} · ${String(o.Date || "").slice(0, 10)}${o.Note ? " · " + String(o.Note).slice(0, 30) : ""}`;
        sel.appendChild(opt);
      });
  } catch (e) { /* ออฟไลน์ก็ไม่เป็นไร เบิกได้โดยไม่อ้างอิง */ }
}

function setRawType(t) {
  document.getElementById("rawModalType").value = t;
  // ปุ่มที่เลือก = พื้นสีงาน ตัวขาว (เบิกส้ม คืนฟ้า รับเขียว — ชุดเดียวกับมือถือ) · ปุ่มยืนยันสีเดียวกัน มองปุ่มก็รู้ว่ากำลังเบิกหรือรับ
  const base = "flex-1 py-3 font-black text-base icb", tc = { OUT: "t-out", RETURN: "t-ret", IN: "t-in" };
  ["rawBtnOut", "rawBtnRet", "rawBtnIn"].forEach((id, i) => {
    const k = ["OUT", "RETURN", "IN"][i], el = document.getElementById(id);
    el.setAttribute("aria-pressed", String(t === k));
    el.className = base + (t === k ? " " + tc[k] : " ic-" + { OUT: "out", RETURN: "ret", IN: "in" }[k]);
  });
  const sb = document.getElementById("rawBtnSubmit");
  if (sb) sb.className = "ui-confirm icb w-full " + (tc[t] || "t-out");
  // เบิกออกบังคับกรอก "ใช้กับงาน" ส่วนรับ/คืน กรอกก็ได้ไม่กรอกก็ได้
  const _req = document.getElementById("rawPurposeReq");
  const _pin = document.getElementById("rawModalPurpose");
  if (_req) _req.style.display = (t === "OUT") ? "" : "none";
  if (_pin) _pin.placeholder = (t === "OUT")
    ? "เช่น ผลิตวุ้นมะพร้าว ล็อต 3"
    : "ระบุหรือไม่ก็ได้ เช่น รับจากซัพพลายเออร์ ก";
  const _lw = document.getElementById("rawLotWrap");
  if (_lw) _lw.hidden = t !== "IN";   // ข้อมูลล็อตมีเฉพาะตอนรับเข้า
  rawUpdateAfter();
}

function openRawQr() {
  if (!rawLastData.length) { showToast("ยังไม่มีข้อมูล","warn"); return; }
  openRawQrByItem(rawLastData[0].SKU, rawLastData[0].Name);
}
async function openRawQrByItem(sku, name) {
  rawCurrentQrSku = sku; rawCurrentQrName = name||sku;
  document.getElementById("rawQrTitle").innerText = `${rawCurrentQrName} (${sku})`;
  document.getElementById("rawQrcode").innerHTML  = "";
  document.getElementById("rawQrModal").classList.remove("hidden");
  const qrText = `RAWMAT|${rawCurrentModule}|${sku}`;
  try { await loadVendor("qrcode"); } catch (e) { showToast("โหลดตัวสร้าง QR ไม่ได้", "error"); return; }   // ข้อ 11
  new QRCode(document.getElementById("rawQrcode"), { text: qrText, width:220, height:220, correctLevel: QRCode.CorrectLevel.M });
}
function closeRawQr() { document.getElementById("rawQrModal").classList.add("hidden"); }

function downloadRawQr() {
  const img=document.querySelector("#rawQrcode img"), canvas=document.querySelector("#rawQrcode canvas");
  const src = img?img.src : canvas?canvas.toDataURL("image/png"):null;
  if (!src) { showToast("ไม่พบ QR","error"); return; }
  const a=document.createElement("a"); a.href=src; a.download=`QR_${rawCurrentQrSku||"item"}.png`; a.click();
  showToast("ดาวน์โหลด QR สำเร็จ","success");
}

function closeRawAlert() { document.getElementById("rawAlertModal").classList.add("hidden"); }

// ── พิมพ์ QR Code ทั้งหมดของวัตถุดิบ (ใช้ QRCode.js → data URL) ──
async function rawPrintQrAll() {
  try { await loadVendor("qrcode"); } catch (e) { showToast("โหลดตัวสร้าง QR ไม่ได้", "error"); return; }   // ข้อ 11
  const checkedSkus = Array.from(document.querySelectorAll(".raw-checkbox:checked")).map(cb => cb.getAttribute("data-sku"));
  const source = checkedSkus.length > 0
    ? rawLastData.filter(i => checkedSkus.includes(String(i.SKU)))
    : rawLastData;
  if (!source.length) { showToast("ยังไม่มีข้อมูล", "warn"); return; }

  const factory = rawCurrentModule;
  const factoryLabel = factory === "SQF" ? "สุพรรณคิวฟู้ดส์ (SQF)" : "แม่ละมาย (MLM)";
  const factoryColor = factory === "SQF" ? "#c2410c" : "#15803d";   // สีประจำโรงงาน (hex — หน้าต่างพิมพ์)
  const dateStr = new Date().toLocaleDateString("th-TH", { year:"numeric", month:"long", day:"numeric" });

  // Generate QR data URLs using QRCode.js (synchronous canvas)
  const tmpWrap = document.createElement("div");
  tmpWrap.style.cssText = "position:fixed;left:-9999px;top:0;visibility:hidden;";
  document.body.appendChild(tmpWrap);

  const qrDataUrls = {};
  source.forEach(item => {
    const el = document.createElement("div");
    tmpWrap.appendChild(el);
    new QRCode(el, { text: `RAWMAT|${factory}|${item.SKU}`, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });
    const canvas = el.querySelector("canvas");
    qrDataUrls[item.SKU] = canvas ? canvas.toDataURL("image/png") : "";
  });
  document.body.removeChild(tmpWrap);

  const cards = source.map(item => {
    const name = String(item.Name || "").replace(/&/g,"&amp;").replace(/</g,"&lt;");
    const sku  = String(item.SKU  || "").replace(/&/g,"&amp;");
    const src  = qrDataUrls[item.SKU] || "";
    return `
      <div class="qr-card">
        <div class="qr-factory" style="background:${factoryColor}">${factory}</div>
        ${src ? `<img src="${src}" alt="QR ${sku}">` : `<div style="width:160px;height:160px;margin:0 auto 8px;background:#f2f2ef;border-radius:8px;"></div>`}
        <div class="qr-sku">${sku}</div>
        <div class="qr-name">${name}</div>
      </div>`;
  }).join("");

  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head>
  <meta charset="utf-8">
  <title>QR วัตถุดิบ — ${factoryLabel}</title>
  <style>@import url('${fontCssUrl()}');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:Sarabun,sans-serif;background:#f7f7f4;padding:20px;}
    h1{text-align:center;font-size:18px;font-weight:900;margin-bottom:4px;color:#111;}
    .sub{text-align:center;font-size:12px;color:#5c5c57;margin-bottom:20px;}
    .grid{display:flex;flex-wrap:wrap;gap:12px;justify-content:flex-start;}
    .qr-card{
      width:200px;background:#fff;border-radius:6px;border:2px solid #d6d6d0;
      padding:12px 10px 14px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.08);
      page-break-inside:avoid;
    }
    .qr-factory{
      display:inline-block;color:#fff;font-size:10px;font-weight:900;
      padding:3px 10px;border-radius:999px;margin-bottom:8px;letter-spacing:1px;
    }
    .qr-card img{width:160px;height:160px;display:block;margin:0 auto 8px;}
    .qr-sku{font-size:11px;font-weight:900;color:#3d3d3d;letter-spacing:1px;margin-bottom:3px;}
    .qr-name{font-size:13px;font-weight:700;color:#111;line-height:1.3;}
    @media print{
      body{background:#fff;padding:10px;}
      .no-print{display:none!important;}
    }
  </style>
  </head><body>
  <div class="no-print" style="text-align:center;margin-bottom:16px;">
    <button onclick="window.print()" style="background:#00843d;color:#fff;border:none;padding:10px 28px;border-radius:6px;font-size:14px;font-weight:900;cursor:pointer;margin-right:8px;">พิมพ์</button>
    <button onclick="window.close()" style="background:#5c5c57;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:900;cursor:pointer;">✕ ปิด</button>
  </div>
  <div style="display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:6px;">
    ${logoImgTag(40)}
    <h1 style="margin:0;">QR Code วัตถุดิบ — ${factoryLabel}</h1>
  </div>
  <div class="sub">พิมพ์วันที่ ${dateStr} &nbsp;|&nbsp; ${source.length} รายการ</div>
  <div class="grid">${cards}</div>
  </body></html>`);
  win.document.close();
}

// ── Submit actions ──
async function rawSubmitNew() {
  if (rawIsBusy("rawBtnCreate")) return;   // กำลังส่งอยู่ — กันกดซ้ำ (Enter/Space/คลิกรัว)
  const sku=document.getElementById("rawNewSku").value.trim(), name=document.getElementById("rawNewName").value.trim(),
        unit=document.getElementById("rawNewUnit").value.trim(), qty=Number(document.getElementById("rawNewQty").value),
        min=Number(document.getElementById("rawNewMin").value),
        dailyUsage=Number(document.getElementById("rawNewDailyUsage").value||0),
        expiry=document.getElementById("rawNewExpiry").value;
  if (!sku)  return showToast("ไม่พบ SKU","error");
  if (!name) { rawFieldError("rawNewName", "กรุณาระบุชื่อ"); return; }
  if (!unit) { rawFieldError("rawNewUnit", "กรุณาระบุหน่วยนับ"); return; }
  // ยอด/จุดสั่งซื้อ/ใช้ต่อวัน ห้ามติดลบ (เดิมสร้างยอดเริ่มต้น -5 ได้ · QA M13) — หลังบ้านตรวจซ้ำอีกชั้น
  if (isNaN(qty) || qty < 0) { rawFieldError("rawNewQty", "ยอดเริ่มต้นต้องเป็นตัวเลข 0 ขึ้นไป"); return; }
  if (isNaN(min) || min < 0) { rawFieldError("rawNewMin", "จุดสั่งซื้อต้องเป็นตัวเลข 0 ขึ้นไป"); return; }
  if (isNaN(dailyUsage) || dailyUsage < 0) { rawFieldError("rawNewDailyUsage", "ใช้ต่อวันต้องเป็นตัวเลข 0 ขึ้นไป"); return; }
  setRawBusy("rawBtnCreate",true,"กำลังสร้าง...");
  showLoading("กำลังสร้างรายการ...");
  const alertDaysNew = Math.max(1, parseInt(document.getElementById("rawNewAlertDays").value||rawAlertDays));
  const r = await rawFetch({ action:"CREATE", sku, name, unit, qty, min, dailyUsage, expiryDate:expiry, alertDays:alertDaysNew, user:currentUser });
  hideLoading(); setRawBusy("rawBtnCreate",false);
  if (r.status==="success") {
    closeRawCreate();
    showToast("สร้างรายการสำเร็จ ","success");
    rawLoadData();
    // แสดง QR ทันที
    openRawQrByItem(sku, name);
  }
  else showToast(r.message||"ไม่สำเร็จ","error");
}

async function rawSubmitEdit() {
  if (rawIsBusy("rawBtnEdit")) return;   // กำลังส่งอยู่ — กันกดซ้ำ (Enter/Space/คลิกรัว)
  const sku=document.getElementById("rawEditSku").value.trim(), name=document.getElementById("rawEditName").value.trim(),
        unit=document.getElementById("rawEditUnit").value.trim(), min=Number(document.getElementById("rawEditMin").value),
        dailyUsage=Number(document.getElementById("rawEditDailyUsage").value||0),
        expiry=document.getElementById("rawEditExpiry").value;
  if (!sku)  return showToast("ไม่พบ SKU","error");
  if (!name) { rawFieldError("rawEditName", "กรุณาระบุชื่อ"); return; }
  if (!unit) { rawFieldError("rawEditUnit", "กรุณาระบุหน่วย"); return; }
  if (isNaN(min) || min < 0) { rawFieldError("rawEditMin", "จุดสั่งซื้อต้องเป็นตัวเลข 0 ขึ้นไป"); return; }
  if (isNaN(dailyUsage) || dailyUsage < 0) { rawFieldError("rawEditDailyUsage", "ใช้ต่อวันต้องเป็นตัวเลข 0 ขึ้นไป"); return; }
  setRawBusy("rawBtnEdit",true,"กำลังบันทึก...");
  showLoading("กำลังบันทึกการแก้ไข...");
  const alertDaysEdit = Math.max(1, parseInt(document.getElementById("rawEditAlertDays").value||rawAlertDays));
  const leadDays = Number(document.getElementById("rawEditLeadDays")?.value || 0);
  const moq      = Number(document.getElementById("rawEditMoq")?.value || 0);
  const packSize = Number(document.getElementById("rawEditPackSize")?.value || 0);
  const r = await rawFetch({ action:"EDIT", sku, name, unit, min, dailyUsage, expiryDate:expiry, alertDays:alertDaysEdit,
                             leadDays, moq, packSize, user:currentUser });
  hideLoading(); setRawBusy("rawBtnEdit",false);
  if (r.status==="success") { closeRawEdit(); showToast("แก้ไขเรียบร้อย ","success"); rawLoadData(); }
  else showToast(r.message||"ไม่สำเร็จ","error");
}

// ── ข้อ 2 PERFORMANCE_REVIEW: หลังบันทึกสำเร็จ ปรับเฉพาะแถวที่เปลี่ยนบนจอทันทีจากคำตอบของเซิร์ฟเวอร์ ──
// (ยอดยืนยันแล้วเท่านั้น — งานที่เข้าคิวออฟไลน์ไม่มาทางนี้) แล้วดึงคลังใหม่เบื้องหลังโดยไม่บังจอ ไม่กะพริบ
function rawApplyLocalWrite(sku, newQty, hist) {
  _rawWriteSeq++;
  const it = (rawLastData || []).find(m => String(m.SKU) === String(sku));
  if (it && newQty !== undefined && newQty !== null && !isNaN(Number(newQty))) {
    it.Qty = Number(newQty);
    it.IdleDays = 0;   // เพิ่งแตะยอด → ไม่ค้างแล้ว (หลังบ้านยืนยันอีกทีตอนดึงใหม่เบื้องหลัง)
    if (hist && hist.verified) it.LastVerified = hist.at;
  }
  if (hist) {
    window._rawRecentHistory = [[hist.at, hist.name, hist.action, hist.qty, hist.user, hist.docNo || "", String(sku), hist.unit || "", hist.purpose || ""],
                                ...(window._rawRecentHistory || [])].slice(0, 30);
    renderRawHistory(window._rawRecentHistory);
  }
  renderRawInventory(rawLastData);
  renderRawStats(rawLastData, window._rawDiscontinued || []);
  rawSetDataAge("server", Date.now());
  if (typeof tgFlushSoon === "function") tgFlushSoon();   // ข้อ 1: ให้เซิร์ฟเวอร์ส่ง Telegram ที่ต่อคิวไว้ (ไม่รอ)
  setTimeout(() => rawLoadData(false, 0, { silent: true }), 800);
}
async function rawSubmitAction() {
  if (rawIsBusy("rawBtnSubmit")) return;   // กำลังส่งอยู่ — กันกดซ้ำ (Enter/Space/คลิกรัว)
  const sku  = document.getElementById("rawModalSkuVal").value;
  const type = document.getElementById("rawModalType").value;
  const qty  = Number(document.getElementById("rawModalQty").value);
  const curQty = Number(document.getElementById("rawModalCurrentQty").value) || 0;
  if (!sku)               return showToast("ไม่พบ SKU","error");
  if (isNaN(qty)||qty<=0) { rawFieldError("rawModalQty", "ระบุจำนวนเป็นตัวเลขมากกว่า 0"); return; }
  // ✅ เช็คสต๊อกก่อนส่ง (เฉพาะ OUT)
  if (type === "OUT" && qty > curQty) { rawFieldError("rawModalQty", `สต๊อกไม่พอ — มีอยู่ ${curQty} เบิก ${qty} ไม่ได้`); return; }
  // ใช้กับงานอะไร — บังคับกรอกเฉพาะตอนเบิก เพราะเป็นข้อมูลที่ต้องขึ้นใบเบิกให้ออดิเตอร์ตรวจ
  const purpose = (document.getElementById("rawModalPurpose")?.value || "").trim();
  if (type === "OUT" && !purpose) { rawFieldError("rawModalPurpose", "กรุณาระบุว่าเบิกไปใช้กับงานอะไร"); return; }
  // 🏷️ รับเข้า: ข้อมูลล็อต (ไม่บังคับ) · วันที่รับในอนาคต = ถามยืนยัน ไม่ห้าม
  let lot = {};
  if (type === "IN") {
    const rd = document.getElementById("rawLotRecv")?.value || "";
    if (rd && rd > rawTodayYmd() && !confirm("วันที่รับเข้า " + rawYmdThai(rd) + " เป็นวันในอนาคต\n\nยืนยันบันทึกตามนี้?")) return;
    lot = { recvDate: rd, lotNo: (document.getElementById("rawLotNo")?.value || "").trim(), expDate: document.getElementById("rawLotExp")?.value || "" };
  }
  setRawBusy("rawBtnSubmit",true,"กำลังบันทึก...");
  const _busyText = { IN:"กำลังบันทึกรับเข้า...", RETURN:"กำลังบันทึกการคืน...", OUT:"กำลังบันทึกการเบิก..." };
  showLoading(_busyText[type] || "กำลังบันทึก...");
  const name = (rawLastData||[]).find(m => String(m.SKU) === String(sku))?.Name || sku;
  const LBL = { OUT:"เบิก", IN:"รับเข้า", RETURN:"↩️ คืน" };
  // ผ่านคิวออฟไลน์เสมอ — ออนไลน์อยู่ก็ยิงตรงเหมือนเดิม เน็ตล่มถึงจะเก็บไว้ส่งทีหลัง
  const workOrderId = (document.getElementById("rawModalWorkOrder")?.value || "").trim();   // ข้อ 19
  const r = await offlineSend(
    { module: rawCurrentModule, action:"UPDATE", sku, type, qty, purpose, workOrderId, user:currentUser, ...lot },
    `${LBL[type]||type} ${name} ${qty}`);
  hideLoading(); setRawBusy("rawBtnSubmit",false);
  if (r.storeFailed) {   // ข้อ 2: เน็ตล่มและเก็บลงเครื่องไม่ได้ — ต้องบอกตรงๆ ไม่ปิดหน้าต่าง
    alert("เน็ตล่ม และเก็บรายการไว้ในเครื่องไม่ได้\n(พื้นที่เต็มหรือเบราว์เซอร์ไม่อนุญาต)\n\nกรุณาจดไว้: " + `${LBL[type]||type} ${name} ${qty}` + "\nแล้วบันทึกใหม่เมื่อเน็ตกลับมา");
    return;
  }
  if (r.needLogin) { if (r.queued) { closeRawAction(); closeRawVerify(); } handleTokenExpired(r); return; }
  if (r.queued) {
    closeRawAction();
    showToast("เน็ตล่ม — บันทึกไว้ในเครื่องแล้ว จะส่งขึ้นระบบให้เองเมื่อเน็ตกลับมา", "warn", 6000);
    rawUpdateOfflineBadge();
    return;
  }
  if (r.status==="success") {
    closeRawAction();
    showToast("บันทึกสำเร็จ ","success");
    if (r.timing) window._gasLastWriteTiming = r.timing;
    const s = r.slip || {};
    rawApplyLocalWrite(sku, s.balance, { at: s.at || new Date().toISOString(), name: s.name || name, action: s.action || (LBL[type] || type),
      qty: s.qty != null ? s.qty : qty, user: s.user || currentUser, docNo: s.docNo || r.docNo || "", unit: s.unit || "", purpose: s.purpose || purpose });
    if (r.slip && typeof openWithdrawSlip === "function") openWithdrawSlip(r.slip);
  }
  else showToast(r.message||"ไม่สำเร็จ","error");
}

// ── ปุ่มงานค้าง (โผล่เฉพาะตอนมีของค้าง) ──
function rawUpdateOfflineBadge() {
  const el = document.getElementById("offlineQueueBtn");
  if (!el) return;
  const txt = typeof offlineSummary === "function" ? offlineSummary() : "";
  el.style.display = txt ? "" : "none";
  el.textContent = txt;
}

function rawShowOfflineDetail() {
  const m = document.getElementById("offlineModal");
  if (!m) { alert(offlineDetailText()); return; }
  rawRenderOfflinePanel();
  m.classList.remove("hidden");
}
function closeOfflinePanel() { document.getElementById("offlineModal")?.classList.add("hidden"); }
function rawRenderOfflinePanel() {
  const body = document.getElementById("offlineBody");
  if (!body) return;
  const t = d => { try { return new Date(d).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }); } catch (e) { return ""; } };
  const q = offlineQueue(), f = offlineFailures();
  const qRows = q.map(j => `<tr><td>${escapeHtml(j.label)}</td><td>${t(j.at)}</td>
      <td>${j.error ? `<span class="sq-chip warn">${escapeHtml(j.error)}</span>` : '<span class="sq-chip">รอส่ง</span>'}</td></tr>`).join("");
  const fRows = f.map(j => `<tr>
      <td>${escapeHtml(j.label)}<div class="sq-meter-note">${escapeHtml(j.body?.module || "")} · ${escapeHtml(j.body?.sku || "")}</div></td>
      <td>${t(j.at)}</td>
      <td><span class="sq-chip crit">${escapeHtml(j.error || "")}</span></td>
      <td style="white-space:nowrap;">
        <button class="rm-mini solid" onclick="if(offlineResend('${escapeJsAttr(j.opId)}')){showToast('ส่งซ้ำแล้ว','success');}rawRenderOfflinePanel();rawUpdateOfflineBadge();">ส่งซ้ำ</button>
        <button class="rm-mini danger" onclick="offlineDropFailure('${escapeJsAttr(j.opId)}');rawRenderOfflinePanel();rawUpdateOfflineBadge();">ลบ</button>
      </td></tr>`).join("");
  body.innerHTML = `
    <div class="sq-card-note" style="margin-bottom:8px;">รอส่งเมื่อเน็ตกลับมา — ${q.length} รายการ
      ${q.length ? `<button class="rm-mini" style="margin-left:8px;" onclick="offlineSync(true)">ลองส่งตอนนี้</button>` : ""}</div>
    ${q.length ? `<div class="sq-tablewrap"><table class="sq-table"><thead><tr><th>รายการ</th><th>เวลาที่ทำ</th><th>สถานะ</th></tr></thead><tbody>${qRows}</tbody></table></div>` : '<p class="sq-empty">ไม่มี</p>'}
    <div class="sq-card-note" style="margin:14px 0 8px;">ส่งไม่ผ่าน — เซิร์ฟเวอร์ปฏิเสธ (ยอดในระบบไม่ถูกแตะ) — ${f.length} รายการ</div>
    ${f.length ? `<div class="sq-tablewrap"><table class="sq-table"><thead><tr><th>รายการ</th><th>เวลาที่ทำ</th><th>เหตุผล</th><th></th></tr></thead><tbody>${fRows}</tbody></table></div>
      <p class="sq-note" style="margin-top:8px;">แก้ต้นเหตุก่อน (เช่น รับของเข้าแล้ว) ค่อยกด "ส่งซ้ำ" · ถ้าทำรายการใหม่ไปแล้วให้กด "ลบ" กันซ้ำ</p>` : '<p class="sq-empty">ไม่มี</p>'}`;
}

async function rawSubmitVerify() {
  if (rawIsBusy("rawBtnVerify")) return;   // กำลังส่งอยู่ — กันกดซ้ำ (Enter/Space/คลิกรัว)
  const qRaw = String(document.getElementById("rawVerifyQty").value || "").trim();
  const q=Number(qRaw);   // Number("") = 0 — ต้องเช็คช่องว่างก่อน ไม่งั้นกดบันทึกโดยไม่พิมพ์ = นับได้ 0
  if (!rawVerifyTarget) return showToast("ไม่พบ SKU","error");
  if (qRaw === "")      { rawFieldError("rawVerifyQty", "พิมพ์ยอดที่นับได้จริงก่อนบันทึก (ของหมดให้ใส่ 0)"); return; }
  if (isNaN(q)||q<0)    { rawFieldError("rawVerifyQty", "ระบุยอดที่นับได้ เป็นตัวเลข 0 ขึ้นไป"); return; }
  // Poka-Yoke: เตือนถ้าค่าใหม่ต่างจากค่าปัจจุบัน > 5 เท่า
  const curItem = (rawLastData || []).find(it => String(it.SKU) === String(rawVerifyTarget));
  const curQty = curItem ? Number(curItem.Qty || 0) : 0;
  if (curQty > 0 && (q > curQty * 5 || q < curQty / 5)) {
    if (!confirm(`ยอดใหม่ (${q}) ต่างจากยอดปัจจุบัน (${curQty}) มาก\n\nแน่ใจว่าถูกต้อง?`)) return;
  }
  setRawBusy("rawBtnVerify",true,"กำลังบันทึก...");
  showLoading("กำลังบันทึกยอดตรวจนับ...");
  const vName = (rawLastData||[]).find(m => String(m.SKU) === String(rawVerifyTarget))?.Name || rawVerifyTarget;
  const r = await offlineSend(
    { module: rawCurrentModule, action:"VERIFY", sku:rawVerifyTarget, qty:q, user:currentUser },
    `นับ ${vName} → ${q}`);
  hideLoading(); setRawBusy("rawBtnVerify",false);
  if (r.storeFailed) {
    alert("เน็ตล่ม และเก็บรายการไว้ในเครื่องไม่ได้\n\nกรุณาจดไว้: นับ " + vName + " → " + q + "\nแล้วบันทึกใหม่เมื่อเน็ตกลับมา");
    return;
  }
  if (r.needLogin) { if (r.queued) { closeRawAction(); closeRawVerify(); } handleTokenExpired(r); return; }
  if (r.queued) {
    closeRawVerify();
    showToast("เน็ตล่ม — บันทึกไว้ในเครื่องแล้ว จะส่งขึ้นระบบให้เองเมื่อเน็ตกลับมา", "warn", 6000);
    rawUpdateOfflineBadge();
    return;
  }
  if (r.status==="success") {
    closeRawVerify();
    // ข้อ 5: ถ้าเซิร์ฟเวอร์ปรับตามความเคลื่อนไหวหลังเวลานับ บอกให้รู้
    showToast(r.movementsAfter ? `บันทึกยอดแล้ว นับได้ ${r.counted} → ใช้ ${r.applied} (ปรับตาม ${r.movementsAfter} รายการที่เกิดหลังนับ)` : "บันทึกยอดจริงสำเร็จ ", "success", 6000);
    if (r.timing) window._gasLastWriteTiming = r.timing;
    rawApplyLocalWrite(rawVerifyTarget, r.applied, { at: new Date().toISOString(), name: vName, action: "ตรวจนับ/ปรับยอด", qty: r.applied,
      user: currentUser, unit: curItem ? curItem.Unit : "", verified: true });
  }
  else showToast(r.message||"ไม่สำเร็จ","error");
}

async function rawDelete(sku, name) {
  if (!confirm(`ยกเลิกการใช้ "${name}" ?\n\nรายการจะไม่แสดงในคลังและไม่นับรวมยอด (ข้อมูลเก่ายังอยู่)`)) return;
  showLoading("กำลังยกเลิกการใช้...");
  const r = await rawFetch({ action:"DELETE", sku, user:currentUser });
  hideLoading();
  if (r.status==="success") { closeRawEdit(); showToast("ยกเลิกการใช้แล้ว","success"); rawLoadData(); }
  else showToast(r.message||"ยกเลิกการใช้ไม่สำเร็จ","error");
}

// ── Scanner ──
async function openRawScanner() {
  document.getElementById("rawScannerModal").classList.remove("hidden");
  try {
    await loadVendor("qrscan");   // ข้อ 11: 375KB โหลดเฉพาะตอนกดสแกน
    rawHtml5QrCode = new Html5Qrcode("rawReader");
    await rawHtml5QrCode.start({ facingMode:"environment" }, { fps:10, qrbox:250 }, txt => {
      const val = String(txt||"").trim();
      const item = rawLastData.find(i=>String(i.SKU)===val);
      closeRawScanner();
      if (item) openRawAction(item.SKU, item.Name, item.Unit, item.Qty);
      else showToast("ไม่พบรหัสนี้ ","error");
    });
  } catch(err) { showToast("เปิดกล้องไม่สำเร็จ ","error"); closeRawScanner(true); }
}

async function closeRawScanner(forceHide=false) {
  if (forceHide) { document.getElementById("rawScannerModal").classList.add("hidden"); return; }
  try { if (rawHtml5QrCode?.isScanning) { await rawHtml5QrCode.stop(); await rawHtml5QrCode.clear(); } }
  catch(e) {} finally { rawHtml5QrCode=null; document.getElementById("rawScannerModal").classList.add("hidden"); }
}

// ── ข้อผิดพลาดของฟอร์ม: บอกใต้ช่องนั้น + ไฮไลต์ + ย้ายโฟกัสไปที่ช่อง ──
// (เดิมเป็น toast มุมขวาบนที่หายใน 2.8 วิ อยู่ไกลจากช่อง ไม่บอกว่าผิดที่ไหน · QA M12 2026-10-10)
function rawFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) { showToast(msg, "warn"); return; }
  let tip = document.getElementById(id + "__err");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = id + "__err"; tip.className = "rm-field-err"; tip.setAttribute("role", "alert");
    el.insertAdjacentElement("afterend", tip);
  }
  tip.textContent = "" + msg; tip.style.display = "";
  el.classList.add("rm-input-err"); el.setAttribute("aria-invalid", "true");
  try { el.focus(); if (el.select && el.type !== "date") el.select(); } catch (e) {}
  const clear = () => { tip.style.display = "none"; el.classList.remove("rm-input-err"); el.removeAttribute("aria-invalid"); el.removeEventListener("input", clear); };
  el.addEventListener("input", clear);
}
function rawFieldErrorsClear(...ids) {
  ids.forEach(id => {
    const tip = document.getElementById(id + "__err"); if (tip) tip.style.display = "none";
    const el = document.getElementById(id); if (el) { el.classList.remove("rm-input-err"); el.removeAttribute("aria-invalid"); }
  });
}

// ── Button busy ──
// ⚠️ ต้องปิดปุ่มจริง (disabled) + จำสถานะไว้ — แค่ใส่ class กันเมาส์ได้ แต่ Enter/Space ยังกดซ้ำได้
//    เคยส่ง 3 คำขอจากการบันทึกครั้งเดียว (คนละ opId → รับ/เบิกซ้ำจริง · พบตอนตรวจ QA 2026-10-10)
const _rawBusyIds = {};
function rawIsBusy(id) { return !!_rawBusyIds[id]; }
function setRawBusy(id, busy, txt="กำลังบันทึก...") {
  _rawBusyIds[id] = !!busy;
  const btn=document.getElementById(id); if (!btn) return;
  if (busy && !btn.disabled) btn.dataset.orig = btn.innerHTML;   // จำข้อความ ณ ตอนกด — ปุ่มบันทึกรับ/เบิกเปลี่ยนข้อความตามจำนวน
  btn.classList.toggle("btn-disabled", busy);
  btn.disabled = !!busy;
  btn.innerHTML = busy ? txt : btn.dataset.orig;
}



/** เติมตัวเลือก "ใช้กับงาน" จากที่เคยพิมพ์ไว้ในประวัติ — ครั้งหน้าจะได้เลือกแทนพิมพ์ */
function rawFillPurposeList() {
  const dl = document.getElementById("rawPurposeList");
  if (!dl) return;
  const seen = [];
  (window._rawRecentHistory || []).forEach(x => {
    const p = String(x[8] || "").trim();
    if (p && seen.indexOf(p) < 0) seen.push(p);
  });
  dl.innerHTML = seen.slice(0, 15).map(p => '<option value="' + escapeAttr(p) + '">').join("");
  // ปุ่มลัด: เฉพาะงานที่เคย "เบิกออก" จริง (ช่องเดียวกันของรายการนับ/รับ เป็นหมายเหตุ ไม่ใช่ชื่องาน)
  const used = [];
  (window._rawRecentHistory || []).forEach(x => {
    const p = String(x[8] || "").trim();
    if (p && String(x[2] || "") === "เบิกออก" && used.indexOf(p) < 0) used.push(p);
  });
  const chips = document.getElementById("rawPurposeChips");
  if (chips) chips.innerHTML = used.slice(0, 6).map(p =>
    '<button type="button" class="sq-btn sq-btn-sm" data-p="' + escapeAttr(p) + '" onclick="rawPickPurpose(this)" title="' + escapeAttr(p) + '">' +
    escapeHtml(p.length > 28 ? p.slice(0, 27) + "…" : p) + "</button>").join("");
}


/** กดออกใบเอกสารซ้ำจากรายการในประวัติ */
function rawSlipFromHistory(payload) {
  try {
    const s = JSON.parse(decodeURIComponent(payload));
    // ยอดหลังทำรายการ + ล็อต: openWithdrawSlip ขอจากหลังบ้านตามเลขที่เอกสาร (SLIPINFO)
    s.balance = null;
    if (typeof openWithdrawSlip === "function") openWithdrawSlip(s);
  } catch (e) { showToast("เปิดใบไม่สำเร็จ", "error"); }
}
