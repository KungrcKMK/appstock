// ══════════════════════════════════════════════
// 🚨 UNIFIED STOCK ALERT SYSTEM
// ══════════════════════════════════════════════

const ALERT_META = {
  COLDROOM: { label:"❄️ คลังสินค้า SQF",  headerBg:"bg-indigo-700",  icon:"❄️" },
  SQF:      { label:"🏭 วัตถุดิบ SQF",    headerBg:"bg-orange-600",  icon:"🏭" },
  MLM:      { label:"🏭 วัตถุดิบ MLM",    headerBg:"bg-blue-700",    icon:"🏭" }
};

let _alertQueue = [];

// อัปเดต badge บน Nav
function updateNavBadge(module, count) {
  const badge = document.getElementById("badge-" + module);
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.style.display = "inline-flex";
  } else {
    badge.style.display = "none";
  }
}

// แสดง Alert popup
function showStockAlert(module, expItems = [], lowItems = [], nearItems = []) {
  const total = expItems.length + lowItems.length + nearItems.length;
  if (total === 0) return;
  // ถ้า modal กำลังแสดงอยู่ → เข้า queue รอ
  if (!document.getElementById("stockAlertModal").classList.contains("hidden")) {
    _alertQueue.push({ module, expItems, lowItems, nearItems });
    return;
  }

  const meta = ALERT_META[module] || ALERT_META.MLM;

  // Header
  document.getElementById("alertModalHeader").className = `p-6 text-white ${meta.headerBg}`;
  document.getElementById("alertModalIcon").textContent  = total > 0 ? "🚨" : "✅";
  document.getElementById("alertModalTitle").textContent = "แจ้งเตือนสต๊อก — " + meta.label;
  document.getElementById("alertModalSubtitle").textContent =
    `พบปัญหา ${total} รายการ • ${new Date().toLocaleString("th-TH")}`;

  // Chips summary
  const chips = [];
  if (expItems.length)  chips.push(`<span class="bg-red-600    text-white text-xs font-black px-3 py-1 rounded-full">🔴 หมดอายุ ${expItems.length}</span>`);
  if (lowItems.length)  chips.push(`<span class="bg-orange-500 text-white text-xs font-black px-3 py-1 rounded-full">🟠 สต๊อกต่ำ ${lowItems.length}</span>`);
  if (nearItems.length) chips.push(`<span class="bg-amber-500  text-white text-xs font-black px-3 py-1 rounded-full">⏳ ใกล้หมดอายุ ${nearItems.length}</span>`);
  document.getElementById("alertModalChips").innerHTML = chips.join("");

  // Content
  let html = "";
  if (expItems.length) {
    html += `<div class="font-black text-red-600 text-sm uppercase tracking-widest mb-3 pt-2">🔴 หมดอายุแล้ว</div>`;
    html += expItems.map(i => `
      <div class="alert-item">
        <span class="font-bold text-slate-700">📦 ${escapeHtml(i.name||i.Name||i.ProductName)}</span>
        <span class="text-red-500 font-black text-sm shrink-0">${i.expLabel || ""}</span>
      </div>`).join("");
  }
  if (nearItems.length) {
    html += `<div class="font-black text-amber-600 text-sm uppercase tracking-widest mb-3 mt-5">⏳ ใกล้หมดอายุ</div>`;
    html += nearItems.map(i => `
      <div class="alert-item">
        <span class="font-bold text-slate-700">📦 ${escapeHtml(i.name||i.Name||i.ProductName)}</span>
        <span class="text-amber-500 font-black text-sm shrink-0">เหลือ ${i.expLabel || ""}</span>
      </div>`).join("");
  }
  if (lowItems.length) {
    html += `<div class="font-black text-orange-600 text-sm uppercase tracking-widest mb-3 mt-5">🟠 สต๊อกต่ำกว่าจุดสั่งซื้อ</div>`;
    html += lowItems.map(i => `
      <div class="alert-item">
        <span class="font-bold text-slate-700">📦 ${escapeHtml(i.name||i.Name)}</span>
        <div class="text-right shrink-0">
          <span class="text-orange-500 font-black">${Number(i.qty||i.Qty||0).toLocaleString()} ${escapeHtml(i.unit||i.Unit||"")}</span>
          <span class="text-slate-400 text-xs block">min: ${Number(i.min||i.Min||0).toLocaleString()}</span>
        </div>
      </div>`).join("");
  }
  document.getElementById("alertModalContent").innerHTML = html;

  // Vibrate
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

  document.getElementById("stockAlertModal").classList.remove("hidden");
  updateNavBadge(module, total);
}

function closeStockAlert(suppress = false) {
  document.getElementById("stockAlertModal").classList.add("hidden");
  // แสดง alert ถัดไปใน queue (ถ้ามี)
  if (_alertQueue.length > 0) {
    const next = _alertQueue.shift();
    setTimeout(() => showStockAlert(next.module, next.expItems, next.lowItems, next.nearItems), 350);
  }
}

// ── ตรวจสอบทุกโมดูลทันทีหลัง Login (COLDROOM → SQF → MLM ตามลำดับ) ──
let _suppressCrLoginAlert = false; // ป้องกัน crCheckCritical แสดง popup ซ้ำ

async function checkRawAlertsOnLogin() {
  _suppressCrLoginAlert = true; // ปิด crCheckCritical popup ระหว่างนี้
  try {
    const [crRes, sqfRes, mlmRes] = await Promise.all([
      fetch(GAS_URL, { method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"},
        body: JSON.stringify({ module:"COLDROOM", action:"getStartupOverview" }) }).then(r => r.json()),
      fetch(GAS_URL + "?module=SQF").then(r => r.json()),
      fetch(GAS_URL + "?module=MLM").then(r => r.json())
    ]);

    // COLDROOM
    if (crRes.ok) {
      const exp  = (crRes.expiredLots  || []).map(l => ({ name: l.ProductName, expLabel: `EXP ${isoToDdmmyy(l.EXP)}` }));
      const near = (crRes.expiringLots || []).map(l => ({ name: l.ProductName, expLabel: `${l.ExpireDays} วัน` }));
      updateNavBadge("COLDROOM", exp.length + near.length);
      if (exp.length + near.length > 0) showStockAlert("COLDROOM", exp, [], near);
    }
    // SQF
    if (sqfRes.status === "success") {
      const items = sqfRes.materials || [];
      rawCheckCritical(items, "SQF", true);
    }
    // MLM
    if (mlmRes.status === "success") {
      const items = mlmRes.materials || [];
      rawCheckCritical(items, "MLM", true);
    }
  } catch(e) { console.warn("checkRawAlertsOnLogin:", e); }
  finally    { _suppressCrLoginAlert = false; }
}

// ── Raw Materials critical check (ใช้ unified) ──
function rawCheckCritical(items, module = rawCurrentModule, showPopup = true) {
  const today = new Date(); today.setHours(0,0,0,0);

  const exp  = items.filter(i => { const d=rawParseDate(i.ExpiryDate); return d && d < today; })
                    .map(i => ({ name: i.Name, expLabel: rawForceThaiDate(i.ExpiryDate) }));
  const near = items.filter(i => rawNearExpiry(i, rawAlertDays) && !exp.find(e => e.name===i.Name))
                    .map(i => ({ name: i.Name, expLabel: rawForceThaiDate(i.ExpiryDate) }));
  const low  = items.filter(i => Number(i.Qty) <= Number(i.Min) && Number(i.Qty) >= 0)
                    .map(i => ({ name: i.Name, qty: i.Qty, unit: i.Unit, min: i.Min }));
  // วันคงเหลือจาก DailyUsage ≤ rawAlertDays (เฉพาะที่ยังไม่นับใน exp/near/low)
  const lowDays = items.filter(i => {
    const daily = Number(i.DailyUsage||0);
    if (daily <= 0) return false;
    const daysLeft = Math.floor(Number(i.Qty||0) / daily);
    if (daysLeft > rawAlertDays) return false;
    // ไม่นับซ้ำกับ exp หรือ low
    if (exp.find(e => e.name === i.Name)) return false;
    if (low.find(e => e.name === i.Name)) return false;
    return true;
  }).map(i => {
    const daysLeft = Math.floor(Number(i.Qty||0) / Number(i.DailyUsage||1));
    return { name: i.Name, qty: i.Qty, unit: i.Unit, min: i.Min, expLabel: `เหลือใช้ได้ ${daysLeft} วัน` };
  });

  const total = exp.length + near.length + low.length + lowDays.length;
  updateNavBadge(module, total);
  if (showPopup && total > 0) showStockAlert(module, exp, [...low, ...lowDays], near);
}

// ── Cold Room critical check ──
function crCheckCritical(res) {
  if (!res || !res.ok) return;

  const exp  = (res.expiredLots  || []).map(l => ({ name: l.ProductName, expLabel: `EXP ${isoToDdmmyy(l.EXP)}` }));
  const near = (res.expiringLots || []).map(l => ({ name: l.ProductName, expLabel: `${l.ExpireDays} วัน` }));

  const total = exp.length + near.length;
  updateNavBadge("COLDROOM", total);
  // ถ้า checkRawAlertsOnLogin กำลังจัดการ popup อยู่ → ไม่แสดงซ้ำ
  if (total > 0 && !_suppressCrLoginAlert) showStockAlert("COLDROOM", exp, [], near);
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
      showToast("บันทึกการตั้งค่าสำเร็จ ✅  ใช้กับทุกโรงงานแล้ว", "success");
      closeUnifiedSettings();
      // sync ไปที่ Cold Room tab ด้วย (ถ้ามีอยู่)
      ["crTgBotName","crTgToken","crTgChatIds","crTgEnable"].forEach((id, i) => {
        const srcIds = ["uniTgBotName","uniTgToken","uniTgChatIds","uniTgEnable"];
        const el = document.getElementById(id);
        if (el) el.value = document.getElementById(srcIds[i]).value;
      });
    } else { showToast("บันทึกไม่สำเร็จ","error"); }
  } catch(e) { hideLoading(); showToast("เกิดข้อผิดพลาด: "+e.message,"error"); }
  btn.disabled = false; btn.textContent = "💾 บันทึกการตั้งค่า";
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
