// ══════════════════════════════════════════════
// 🚨 UNIFIED STOCK ALERT SYSTEM
// ══════════════════════════════════════════════

// สีประจำโรงงาน = token ชุดเดียวกับทุกหน้า (index.html :root --sq-fac-*) · ตัวขาวบนพื้นนี้ผ่าน contrast AA
const ALERT_META = {
  COLDROOM: { label:"❄️ คลังสินค้าห้องเย็น", color:"var(--sq-fac-cr)",  icon:"❄️" },
  SQF:      { label:"🏭 วัตถุดิบ SQF",       color:"var(--sq-fac-sqf)", icon:"🏭" },
  MLM:      { label:"🏭 วัตถุดิบ MLM",       color:"var(--sq-fac-mlm)", icon:"🏭" }
};

// ── แจ้งเตือนสต๊อก: แผง "ต้องจัดการ" บนหน้าแรก ไม่บังจอ (critique 2026-10-20 · เดิมปรับตาม QA M1 2026-10-10) ──
// เดิม: ป๊อปอัปเด้งเองตอนเข้าระบบและทุกครั้งที่เข้าคลัง (เจอ 4 ครั้งในรอบเดียว บังงาน ขัด "ทำก่อน รับทราบทีหลัง")
//       · ตัวเลขบนการ์ดหน้าแรกนับแค่ตอนเลือกโหมดหลังเข้าระบบ รีโหลดแล้วหาย
//       · "ใกล้หมด" คิดเองจาก ใช้ต่อวัน ไม่ตรงจอต้องสั่ง
// ตอนนี้: · ไม่เด้งเอง — หน้าแรกมีแผงสรุปต่อคลัง แตะเพื่อเข้าไปทำงาน · "ดูรายการทั้งหมด" เปิดหน้าต่างเดิมเมื่ออยากดู
//         · ตัวเลขบนเมนู/การ์ดนับทุกครั้งที่เปิดแอป (checkAuth) และทุกครั้งที่ข้อมูลคลังโหลด
//         · หมวดจากหลังบ้าน: หมดอายุ / ใกล้หมดอายุ (ExpStatus) · ต่ำกว่าจุดสั่งซื้อ · ต้องสั่ง (PlanStatus late/now) — ชุดเดียวกับจอต้องสั่งและมือถือ
let _alertSections = {};     // module → { module, expItems, lowItems, nearItems, soonItems } · soonItems = ต้องสั่ง

const _alertName = i => String(i.name || i.Name || i.ProductName || "");

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

// จดรายการที่ต้องจัดการของคลังหนึ่ง → วาดแผงหน้าแรกใหม่ (ไม่เปิดหน้าต่างเอง)
function showStockAlert(module, expItems = [], lowItems = [], nearItems = [], soonItems = []) {
  const total = expItems.length + lowItems.length + nearItems.length + soonItems.length;
  if (total) _alertSections[module] = { module, expItems, lowItems, nearItems, soonItems };
  else delete _alertSections[module];
  _alertRenderHome();
  const modal = document.getElementById("stockAlertModal");
  if (modal && !modal.classList.contains("hidden")) _alertRender();   // เปิดดูอยู่ → อัปเดตตาม
}
function openStockAlert() { _alertRender(); }

const _alertSecs = () => ["COLDROOM", "SQF", "MLM"].map(m => _alertSections[m]).filter(Boolean);
const _alertCount = s => s.expItems.length + s.lowItems.length + s.nearItems.length + (s.soonItems || []).length;

function _alertRenderHome() {
  const box = document.getElementById("homeTodo");
  if (!box) return;
  const secs = _alertSecs();
  if (!secs.length) { box.style.display = "none"; box.innerHTML = ""; return; }
  const total = secs.reduce((a, s) => a + _alertCount(s), 0);
  const part = (n, t) => n ? t + " " + n : "";
  box.innerHTML = `<div class="home-todo-head">⚠️ ต้องจัดการ <b>${total}</b> รายการ</div>` +
    secs.map(s => {
      const meta = ALERT_META[s.module] || ALERT_META.MLM;
      const bits = [part(s.expItems.length, "หมดอายุ"), part(s.nearItems.length, "ใกล้หมดอายุ"),
                    part(s.lowItems.length, "ต่ำกว่าจุดสั่งซื้อ"), part((s.soonItems || []).length, "ต้องสั่ง")].filter(Boolean).join(" · ");
      return `<button type="button" class="home-todo-row" onclick="switchModule('${s.module}')">
        <span class="home-todo-dot" style="background:${meta.color}"></span><b>${meta.label}</b><span class="home-todo-bits">${bits}</span><span class="home-todo-go" aria-hidden="true">›</span></button>`;
    }).join("") +
    `<button type="button" class="home-todo-all" onclick="openStockAlert()">ดูรายการทั้งหมด</button>`;
  box.style.display = "";
}

function _alertRender() {
  const modal = document.getElementById("stockAlertModal");
  const secs = _alertSecs();
  if (!secs.length) { modal.classList.add("hidden"); return; }
  const total = secs.reduce((a, s) => a + _alertCount(s), 0);
  const one = secs.length === 1 ? (ALERT_META[secs[0].module] || ALERT_META.MLM) : null;

  const head = document.getElementById("alertModalHeader");
  head.className = "p-6 text-white";
  head.style.background = one ? one.color : "var(--sq-ink)";
  document.getElementById("alertModalIcon").textContent  = "⚠️";
  document.getElementById("alertModalTitle").textContent = one ? "ต้องจัดการ — " + one.label : "ต้องจัดการ — " + secs.length + " คลัง";
  document.getElementById("alertModalSubtitle").textContent = `พบ ${total} รายการ • ${new Date().toLocaleString("th-TH")}`;

  const sum = k => secs.reduce((a, s) => a + (s[k] || []).length, 0);
  const chip = (txt, c) => `<span class="text-white text-xs font-black px-3 py-1 rounded-full" style="background:${c};">${txt}</span>`;
  const chips = [];
  if (sum("expItems"))  chips.push(chip("⛔ หมดอายุ " + sum("expItems"), "var(--sq-crit)"));
  if (sum("nearItems")) chips.push(chip("⏳ ใกล้หมดอายุ " + sum("nearItems"), "var(--sq-warn)"));
  if (sum("lowItems"))  chips.push(chip("🟠 ต่ำกว่าจุดสั่งซื้อ " + sum("lowItems"), "var(--sq-high)"));
  if (sum("soonItems")) chips.push(chip("🛒 ต้องสั่ง " + sum("soonItems"), "var(--sq-high)"));
  document.getElementById("alertModalChips").innerHTML = chips.join("");

  const group = (title, color, items, right) => !items.length ? "" :
    `<div class="font-black text-sm mb-2 mt-4" style="color:${color};">${title}</div>` +
    items.map(i => `<div class="alert-item"><span class="font-bold" style="color:var(--sq-ink);">📦 ${escapeHtml(_alertName(i))}</span>${right(i)}</div>`).join("");
  const label = i => `<span class="font-black text-sm shrink-0" style="color:inherit;">${escapeHtml(i.expLabel || "")}</span>`;
  let html = "";
  secs.forEach(s => {
    const meta = ALERT_META[s.module] || ALERT_META.MLM;
    if (!one) html += `<div class="font-black text-base mt-4 pb-1" style="color:${meta.color};border-bottom:2px solid ${meta.color};">${meta.label} · ${_alertCount(s)} รายการ</div>`;
    html += group("⛔ หมดอายุแล้ว", "var(--sq-crit)", s.expItems, i => `<span style="color:var(--sq-crit);">${label(i)}</span>`);
    html += group("⏳ ใกล้หมดอายุ", "var(--sq-warn)", s.nearItems, i => `<span style="color:var(--sq-warn);">${label(i)}</span>`);
    html += group("🟠 ต่ำกว่าจุดสั่งซื้อ", "var(--sq-high)", s.lowItems, i => `
        <div class="text-right shrink-0">
          <span class="font-black" style="color:var(--sq-high);">${Number(i.qty||i.Qty||0).toLocaleString()} ${escapeHtml(i.unit||i.Unit||"")}</span>
          <span class="text-xs block" style="color:var(--sq-muted);">จุดสั่งซื้อ ${Number(i.min||i.Min||0).toLocaleString()}</span>
        </div>`);
    html += group("🛒 ต้องสั่ง — ตามจอวางแผนสั่งซื้อ", "var(--sq-high)", s.soonItems || [], i => `
        <div class="text-right shrink-0">
          <span class="font-black" style="color:var(--sq-high);">${Number(i.qty||0).toLocaleString()} ${escapeHtml(i.unit||"")}</span>
          <span class="text-xs block" style="color:var(--sq-muted);">${escapeHtml(i.expLabel || "")}</span>
        </div>`);
  });
  document.getElementById("alertModalContent").innerHTML = html;
  modal.classList.remove("hidden");
}

// ปิดหน้าต่าง (ไม่มี "รับทราบ" แล้ว — ไม่เด้งเองจึงไม่ต้องจำว่าเห็นแล้ว) · ack คงไว้ให้โค้ดเดิมที่ส่งมา
function closeStockAlert(ack = false) {
  document.getElementById("stockAlertModal").classList.add("hidden");
}

// ── นับทุกคลังตอนเปิดแอป (checkAuth) → ตัวเลขบนเมนู/การ์ด + แผงหน้าแรก ──
async function checkRawAlertsOnLogin() {
  try {
    const [crRes, sqfRes, mlmRes] = await Promise.all([
      fetch(GAS_URL, { method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"},
        body: JSON.stringify({ module:"COLDROOM", action:"getStartupOverview" }) }).then(r => r.json()),
      fetch(GAS_URL + "?module=SQF").then(r => r.json()),
      fetch(GAS_URL + "?module=MLM").then(r => r.json())
    ]);
    crCheckCritical(crRes);
    if (sqfRes.status === "success") rawCheckCritical(sqfRes.materials || [], "SQF");
    if (mlmRes.status === "success") rawCheckCritical(mlmRes.materials || [], "MLM");
  } catch(e) { console.warn("checkRawAlertsOnLogin:", e); }
}

// ── วัตถุดิบ: หมวดมาจากหลังบ้านทั้งหมด (ตรงกับตาราง จอต้องสั่ง และมือถือ) ──
function rawCheckCritical(items, module = rawCurrentModule) {
  const exp  = items.filter(i => i.ExpStatus === "expired").map(i => ({ name: i.Name, expLabel: rawForceThaiDate(i.ExpiryDate) }));
  const near = items.filter(i => i.ExpStatus === "near")
                    .map(i => ({ name: i.Name, expLabel: Number(i.ExpDays) === 0 ? "หมดอายุวันนี้" : "หมดอายุใน " + i.ExpDays + " วัน" }));
  // ต่ำกว่าจุดสั่งซื้อ — เงื่อนไขเดียวกับตัวกรองและการ์ดสรุปในหน้าวัตถุดิบ (rawIsLow)
  const low  = items.filter(rawIsLow).map(i => ({ name: i.Name, qty: i.Qty, unit: i.Unit, min: i.Min }));
  // ต้องสั่ง = จอต้องสั่งบอก "สั่งวันนี้ก็ไม่ทัน / ต้องสั่งวันนี้" (ไม่ซ้ำกับต่ำกว่าจุดสั่งซื้อ/หมดอายุ)
  const order = items.filter(i => (i.PlanStatus === "late" || i.PlanStatus === "now") && !rawIsLow(i) && i.ExpStatus !== "expired")
                     .map(i => ({ name: i.Name, qty: i.Qty, unit: i.Unit,
                                  expLabel: (i.PlanStatusText || "") + (i.DaysCover != null ? " · พอ " + Number(i.DaysCover).toLocaleString() + " วัน" : "") }));
  updateNavBadge(module, exp.length + near.length + low.length + order.length);
  showStockAlert(module, exp, low, near, order);
}

// ── Cold Room critical check ──
function crCheckCritical(res) {
  if (!res || !res.ok) return;
  const exp  = (res.expiredLots  || []).map(l => ({ name: l.ProductName, expLabel: `EXP ${isoToDdmmyy(l.EXP)}` }));
  const near = (res.expiringLots || []).map(l => ({ name: l.ProductName, expLabel: `เหลือ ${l.ExpireDays} วัน` }));
  updateNavBadge("COLDROOM", exp.length + near.length);
  showStockAlert("COLDROOM", exp, [], near);
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
