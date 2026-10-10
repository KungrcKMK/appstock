// ══════════════════════════════════════════════
// 🚨 UNIFIED STOCK ALERT SYSTEM
// ══════════════════════════════════════════════

// สีประจำโรงงาน = token ชุดเดียวกับทุกหน้า (index.html :root --sq-fac-*) · ตัวขาวบนพื้นนี้ผ่าน contrast AA
const ALERT_META = {
  COLDROOM: { label:"❄️ คลังสินค้าห้องเย็น", color:"var(--sq-fac-cr)",  icon:"❄️" },
  SQF:      { label:"🏭 วัตถุดิบ SQF",       color:"var(--sq-fac-sqf)", icon:"🏭" },
  MLM:      { label:"🏭 วัตถุดิบ MLM",       color:"var(--sq-fac-mlm)", icon:"🏭" }
};

// ── ป๊อปอัปแจ้งเตือนสต๊อก (ปรับตามรายงาน QA M1 2026-10-10) ──
// เดิม: เข้าระบบแล้วเด้ง 3 ใบต่อกัน (ห้องเย็น → SQF → MLM) และเด้งซ้ำทุกครั้งที่เข้าคลัง · "รับทราบ" กับ "ปิดชั่วคราว" ทำเหมือนกัน
//       → คนกดปิดโดยไม่อ่าน และป๊อปอัปบังหน้าต่างเบิก
// ตอนนี้: · เข้าระบบ = ใบเดียวรวมทุกคลัง
//         · "รับทราบ" = ไม่เด้งซ้ำในรอบการใช้งานนี้ จนกว่าจะมีรายการใหม่ที่ยังไม่เคยเห็น
//         · "ปิดชั่วคราว" = ปิดเฉยๆ เปิดคลังนั้นอีกครั้งจะเด้งอีก
//         · ป้ายตัวเลขบนเมนู/การ์ดหน้าแรกอัปเดตเสมอ ไม่ขึ้นกับการรับทราบ
const _ALERT_ACK_KEY = "appstock_alert_ack";
let _alertSections = {};     // module → { module, expItems, lowItems, nearItems, soonItems } ที่อยู่บนป๊อปอัปตอนนี้
let _alertBatch = null;      // ระหว่างตรวจตอนเข้าระบบ: เก็บไว้ก่อน แล้วโชว์ทีเดียว

const _alertName = i => String(i.name || i.Name || i.ProductName || "");
function _alertKeys(sec) {
  return [...sec.expItems.map(i => "exp|" + _alertName(i)), ...sec.nearItems.map(i => "near|" + _alertName(i)),
          ...sec.lowItems.map(i => "low|" + _alertName(i)), ...(sec.soonItems || []).map(i => "soon|" + _alertName(i))];
}
function _alertAckGet() { try { return JSON.parse(sessionStorage.getItem(_ALERT_ACK_KEY) || "{}") || {}; } catch (e) { return {}; } }
function _alertAckSave(m) { try { sessionStorage.setItem(_ALERT_ACK_KEY, JSON.stringify(m)); } catch (e) {} }

// อัปเดต badge บน Nav
function updateNavBadge(module, count) {
  // ตั้งทั้งป้ายบนแถบเมนู และป้ายบนการ์ดหน้าแรก จากจุดเดียว
  ["badge-" + module, "homeBadge-" + module].forEach(id => {
    const badge = document.getElementById(id);
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : count;
      badge.style.display = "inline-flex";
    } else {
      badge.style.display = "none";
    }
  });
}

// แสดงแจ้งเตือนของคลังหนึ่ง (รวมเข้าป๊อปอัปเดียวกับคลังอื่นที่เปิดอยู่)
function showStockAlert(module, expItems = [], lowItems = [], nearItems = [], soonItems = []) {
  const sec = { module, expItems, lowItems, nearItems, soonItems };
  const total = expItems.length + lowItems.length + nearItems.length + soonItems.length;
  if (_alertBatch) { if (total) _alertBatch[module] = sec; return; }
  if (!total) {
    if (_alertSections[module]) { delete _alertSections[module]; _alertRender(); }
    return;
  }
  const acked = new Set(_alertAckGet()[module] || []);
  if (_alertKeys(sec).every(k => acked.has(k))) return;   // รับทราบครบทุกรายการแล้วในรอบนี้
  _alertSections[module] = sec;
  _alertRender();
}

function _alertRender() {
  const modal = document.getElementById("stockAlertModal");
  const secs = ["COLDROOM", "SQF", "MLM"].map(m => _alertSections[m]).filter(Boolean);
  if (!secs.length) { modal.classList.add("hidden"); return; }
  const n = s => s.expItems.length + s.lowItems.length + s.nearItems.length + (s.soonItems || []).length;
  const total = secs.reduce((a, s) => a + n(s), 0);
  const one = secs.length === 1 ? (ALERT_META[secs[0].module] || ALERT_META.MLM) : null;

  const head = document.getElementById("alertModalHeader");
  head.className = "p-6 text-white";
  head.style.background = one ? one.color : "var(--sq-ink)";
  document.getElementById("alertModalIcon").textContent  = "🚨";
  document.getElementById("alertModalTitle").textContent = one ? "แจ้งเตือนสต๊อก — " + one.label : "แจ้งเตือนสต๊อก — " + secs.length + " คลัง";
  document.getElementById("alertModalSubtitle").textContent = `พบ ${total} รายการ • ${new Date().toLocaleString("th-TH")}`;

  const sum = k => secs.reduce((a, s) => a + (s[k] || []).length, 0);
  const chip = (txt, c) => `<span class="text-white text-xs font-black px-3 py-1 rounded-full" style="background:${c};">${txt}</span>`;
  const chips = [];
  if (sum("expItems"))  chips.push(chip("🔴 หมดอายุ " + sum("expItems"), "var(--sq-crit)"));
  if (sum("nearItems")) chips.push(chip("⏳ ใกล้หมดอายุ " + sum("nearItems"), "var(--sq-warn)"));
  if (sum("lowItems"))  chips.push(chip("🟠 ต่ำกว่าจุดสั่งซื้อ " + sum("lowItems"), "var(--sq-high)"));
  if (sum("soonItems")) chips.push(chip("📉 ใกล้หมด " + sum("soonItems"), "var(--sq-high)"));
  document.getElementById("alertModalChips").innerHTML = chips.join("");

  const group = (title, color, items, right) => !items.length ? "" :
    `<div class="font-black text-sm mb-2 mt-4" style="color:${color};">${title}</div>` +
    items.map(i => `<div class="alert-item"><span class="font-bold" style="color:var(--sq-ink);">📦 ${escapeHtml(_alertName(i))}</span>${right(i)}</div>`).join("");
  const label = i => `<span class="font-black text-sm shrink-0" style="color:inherit;">${escapeHtml(i.expLabel || "")}</span>`;
  let html = "";
  secs.forEach(s => {
    const meta = ALERT_META[s.module] || ALERT_META.MLM;
    if (!one) html += `<div class="font-black text-base mt-4 pb-1" style="color:${meta.color};border-bottom:2px solid ${meta.color};">${meta.label} · ${n(s)} รายการ</div>`;
    html += group("🔴 หมดอายุแล้ว", "var(--sq-crit)", s.expItems, i => `<span style="color:var(--sq-crit);">${label(i)}</span>`);
    html += group("⏳ ใกล้หมดอายุ", "var(--sq-warn)", s.nearItems, i => `<span style="color:var(--sq-warn);">${label(i)}</span>`);
    html += group("🟠 ต่ำกว่าจุดสั่งซื้อ", "var(--sq-high)", s.lowItems, i => `
        <div class="text-right shrink-0">
          <span class="font-black" style="color:var(--sq-high);">${Number(i.qty||i.Qty||0).toLocaleString()} ${escapeHtml(i.unit||i.Unit||"")}</span>
          <span class="text-xs block" style="color:var(--sq-muted);">จุดสั่งซื้อ ${Number(i.min||i.Min||0).toLocaleString()}</span>
        </div>`);
    html += group("📉 ใกล้หมด — ใช้ได้อีกไม่กี่วัน", "var(--sq-high)", s.soonItems || [], i => `
        <div class="text-right shrink-0">
          <span class="font-black" style="color:var(--sq-high);">${Number(i.qty||0).toLocaleString()} ${escapeHtml(i.unit||"")}</span>
          <span class="text-xs block" style="color:var(--sq-muted);">${escapeHtml(i.expLabel || "")}</span>
        </div>`);
  });
  document.getElementById("alertModalContent").innerHTML = html;

  const wasHidden = modal.classList.contains("hidden");
  modal.classList.remove("hidden");
  if (wasHidden && navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

// ack = "รับทราบ" → จำรายการที่เห็นแล้ว ไม่เด้งซ้ำในรอบนี้ · ไม่ ack = "ปิดชั่วคราว"
function closeStockAlert(ack = false) {
  if (ack) {
    const m = _alertAckGet();
    Object.values(_alertSections).forEach(s => { m[s.module] = Array.from(new Set([...(m[s.module] || []), ..._alertKeys(s)])); });
    _alertAckSave(m);
  }
  _alertSections = {};
  document.getElementById("stockAlertModal").classList.add("hidden");
}

// ── ตรวจทุกคลังทันทีหลังเข้าระบบ → ป๊อปอัปใบเดียว ──
let _suppressCrLoginAlert = false; // ป้องกัน crCheckCritical แสดง popup ซ้ำระหว่างนี้

async function checkRawAlertsOnLogin() {
  _suppressCrLoginAlert = true;
  _alertBatch = {};
  try {
    const [crRes, sqfRes, mlmRes] = await Promise.all([
      fetch(GAS_URL, { method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"},
        body: JSON.stringify({ module:"COLDROOM", action:"getStartupOverview" }) }).then(r => r.json()),
      fetch(GAS_URL + "?module=SQF").then(r => r.json()),
      fetch(GAS_URL + "?module=MLM").then(r => r.json())
    ]);
    if (crRes.ok) {
      const exp  = (crRes.expiredLots  || []).map(l => ({ name: l.ProductName, expLabel: `EXP ${isoToDdmmyy(l.EXP)}` }));
      const near = (crRes.expiringLots || []).map(l => ({ name: l.ProductName, expLabel: `เหลือ ${l.ExpireDays} วัน` }));
      updateNavBadge("COLDROOM", exp.length + near.length);
      showStockAlert("COLDROOM", exp, [], near);
    }
    if (sqfRes.status === "success") rawCheckCritical(sqfRes.materials || [], "SQF", true);
    if (mlmRes.status === "success") rawCheckCritical(mlmRes.materials || [], "MLM", true);
  } catch(e) { console.warn("checkRawAlertsOnLogin:", e); }
  finally {
    const batch = _alertBatch || {};
    _alertBatch = null;
    _suppressCrLoginAlert = false;
    Object.values(batch).forEach(s => showStockAlert(s.module, s.expItems, s.lowItems, s.nearItems, s.soonItems));
  }
}

// ── Raw Materials critical check (ใช้ unified) ──
function rawCheckCritical(items, module = rawCurrentModule, showPopup = true) {
  const today = new Date(); today.setHours(0,0,0,0);

  const exp  = items.filter(i => { const d=rawParseDate(i.ExpiryDate); return d && d < today; })
                    .map(i => ({ name: i.Name, expLabel: rawForceThaiDate(i.ExpiryDate) }));
  const near = items.filter(i => rawNearExpiry(i, Number(i.AlertDays) || rawAlertDays) && !exp.find(e => e.name===i.Name))
                    .map(i => ({ name: i.Name, expLabel: "หมดอายุ " + rawForceThaiDate(i.ExpiryDate) }));
  // ต่ำกว่าจุดสั่งซื้อ — เงื่อนไขเดียวกับตัวกรองและการ์ดสรุปในหน้าวัตถุดิบ (rawIsLow)
  const low  = items.filter(rawIsLow).map(i => ({ name: i.Name, qty: i.Qty, unit: i.Unit, min: i.Min }));
  // ใช้ได้อีกไม่เกิน rawAlertDays วัน (จาก "ใช้ต่อวัน") — แยกหัวข้อ ไม่ปนกับต่ำกว่าจุดสั่งซื้อ (เดิมขึ้น "min: 30" ทั้งที่ยังไม่ต่ำ)
  const soon = items.filter(i => {
    const daily = Number(i.DailyUsage||0);
    if (daily <= 0) return false;
    if (Math.floor(Number(i.Qty||0) / daily) > rawAlertDays) return false;
    return !exp.find(e => e.name === i.Name) && !low.find(e => e.name === i.Name);
  }).map(i => ({ name: i.Name, qty: i.Qty, unit: i.Unit, expLabel: `ใช้ได้อีก ${Math.floor(Number(i.Qty||0) / Number(i.DailyUsage||1))} วัน` }));

  const total = exp.length + near.length + low.length + soon.length;
  updateNavBadge(module, total);
  if (showPopup) showStockAlert(module, exp, low, near, soon);
}

// ── Cold Room critical check ──
function crCheckCritical(res) {
  if (!res || !res.ok) return;
  const exp  = (res.expiredLots  || []).map(l => ({ name: l.ProductName, expLabel: `EXP ${isoToDdmmyy(l.EXP)}` }));
  const near = (res.expiringLots || []).map(l => ({ name: l.ProductName, expLabel: `เหลือ ${l.ExpireDays} วัน` }));
  updateNavBadge("COLDROOM", exp.length + near.length);
  // ถ้า checkRawAlertsOnLogin กำลังจัดการ popup อยู่ → ไม่แสดงซ้ำ
  if (!_suppressCrLoginAlert) showStockAlert("COLDROOM", exp, [], near);
}

// backward compat
function closeRawAlert() { closeStockAlert(); }

// ══════════════════════════════════════════════
// ⚙️ UNIFIED TELEGRAM SETTINGS (ทุกโรงงาน)
// ══════════════════════════════════════════════
async function openUnifiedSettings() {
  showLoading("กำลังโหลดการตั้งค่า...");
  try {
    const r = await (await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({ module: "COLDROOM", action: "getAlertSettings", payload: {} })
    })).json();
    hideLoading();
    if (r.ok) {
      const s = r.settings;
      document.getElementById("uniTgBotName").value        = s.telegramBotName           || "";
      document.getElementById("uniTgToken").value          = s.telegramBotToken           || "";
      document.getElementById("uniTgChatIds").value        = s.telegramChatIds            || "";
      document.getElementById("uniTgEnable").value         = s.enableTelegramStockUpdate  || "true";
    }
  } catch(e) { hideLoading(); showToast("โหลดการตั้งค่าไม่สำเร็จ","error"); return; }
  document.getElementById("unifiedSettingsModal").classList.remove("hidden");
  if (typeof lineLoadStatus === "function") lineLoadStatus();   // ส่วน LINE โหลดสถานะเอง (js/line.js)
  if (typeof ntfLoad === "function") ntfLoad();                 // 🗓️ กำหนดการส่งสรุป (js/notify.js)
}

function closeUnifiedSettings() {
  document.getElementById("unifiedSettingsModal").classList.add("hidden");
}

async function saveUnifiedSettings() {
  const payload = {
    telegramBotName:           document.getElementById("uniTgBotName").value.trim(),
    telegramBotToken:          document.getElementById("uniTgToken").value.trim(),
    telegramChatIds:           document.getElementById("uniTgChatIds").value.trim(),
    enableTelegramStockUpdate: document.getElementById("uniTgEnable").value
  };
  const btn = document.getElementById("uniBtnSave");
  btn.disabled = true; btn.textContent = "กำลังบันทึก...";
  showLoading("กำลังบันทึก...");
  try {
    const r = await (await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({ module: "COLDROOM", action: "saveAlertSettings", payload })
    })).json();
    hideLoading();
    if (r.ok) {
      showToast("บันทึกการตั้งค่า Telegram แล้ว ✅  ใช้กับทุกโรงงาน", "success");
      // sync ไปที่ Cold Room tab ด้วย (ถ้ามีอยู่)
      ["crTgBotName","crTgToken","crTgChatIds","crTgEnable"].forEach((id, i) => {
        const srcIds = ["uniTgBotName","uniTgToken","uniTgChatIds","uniTgEnable"];
        const el = document.getElementById(id);
        if (el) el.value = document.getElementById(srcIds[i]).value;
      });
    } else { showToast("บันทึกไม่สำเร็จ","error"); }
  } catch(e) { hideLoading(); showToast("เกิดข้อผิดพลาด: "+e.message,"error"); }
  btn.disabled = false; btn.textContent = "💾 บันทึก Telegram";
}

async function testTelegram() {
  const token   = document.getElementById("uniTgToken").value.trim();
  const chatIds = document.getElementById("uniTgChatIds").value.trim().split(",").map(s=>s.trim()).filter(Boolean);
  if (!token || !chatIds.length) { showToast("กรุณาใส่ Token และ Chat ID ก่อน","warn"); return; }
  showLoading("กำลังส่งข้อความทดสอบ...");
  try {
    const ts  = new Date().toLocaleString("th-TH");
    const msg = `✅ ทดสอบการแจ้งเตือน\n\n❄️ Cold Room SQF\n🏭 วัตถุดิบ SQF\n🏭 วัตถุดิบ MLM\n\n🕐 ${ts}\n👤 ${currentUser}`;
    let ok = 0;
    for (const chatId of chatIds) {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ chat_id: chatId, text: msg })
      });
      const data = await res.json();
      if (data.ok) ok++;
    }
    hideLoading();
    showToast(`ส่งสำเร็จ ${ok}/${chatIds.length} Chat ID`, ok>0?"success":"error");
  } catch(e) { hideLoading(); showToast("ส่งไม่สำเร็จ: "+e.message,"error"); }
}

// ── Raw Settings (legacy — ใช้ unified แทน) ──────
async function openRawSettings() { openUnifiedSettings(); }
function closeRawSettings()      { closeUnifiedSettings(); }
async function saveRawSettings() { await saveUnifiedSettings(); }

// ── Raw Settings (ใช้ร่วมกันทุก Module) ──────
async function openRawSettings_OLD() {
  showLoading("กำลังโหลดการตั้งค่า...");
  try {
    const r = await (await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({ module: "COLDROOM", action: "getAlertSettings", payload: {} })
    })).json();
    hideLoading();
    if (r.ok) {
      const s = r.settings;
      document.getElementById("rawTgBotName").value  = s.telegramBotName  || "";
      document.getElementById("rawTgToken").value    = s.telegramBotToken  || "";
      document.getElementById("rawTgChatIds").value  = s.telegramChatIds   || "";
      document.getElementById("rawTgEnable").value   = s.enableTelegramStockUpdate || "true";
    }
  } catch(e) { hideLoading(); showToast("โหลดการตั้งค่าไม่สำเร็จ","error"); return; }
  document.getElementById("rawSettingsModal").classList.remove("hidden");
}

function closeRawSettings() {
  document.getElementById("rawSettingsModal").classList.add("hidden");
}

async function saveRawSettings() {
  setRawBusy("rawBtnSaveSettings", true, "กำลังบันทึก...");
  showLoading("กำลังบันทึกการตั้งค่า...");
  try {
    const r = await (await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({
        module: "COLDROOM", action: "saveAlertSettings",
        payload: {
          telegramBotName:           document.getElementById("rawTgBotName").value,
          telegramBotToken:          document.getElementById("rawTgToken").value,
          telegramChatIds:           document.getElementById("rawTgChatIds").value,
          enableTelegramStockUpdate: document.getElementById("rawTgEnable").value
        }
      })
    })).json();
    hideLoading();
    if (r.ok) {
      showToast("บันทึกการตั้งค่าสำเร็จ ✅","success");
      closeRawSettings();
      // sync to Cold Room tab ด้วย
      if (document.getElementById("crTgBotName")) {
        document.getElementById("crTgBotName").value  = document.getElementById("rawTgBotName").value;
        document.getElementById("crTgToken").value    = document.getElementById("rawTgToken").value;
        document.getElementById("crTgChatIds").value  = document.getElementById("rawTgChatIds").value;
        document.getElementById("crTgEnable").value   = document.getElementById("rawTgEnable").value;
      }
    } else { showToast("บันทึกไม่สำเร็จ","error"); }
  } catch(e) { hideLoading(); showToast("เกิดข้อผิดพลาด: "+e.message,"error"); }
  setRawBusy("rawBtnSaveSettings", false);
}
