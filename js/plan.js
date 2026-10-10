// ═════════════════════════════════════════════
// plan.js — 📈 วางแผนสั่งซื้อ (วิเคราะห์การเบิก กันวัตถุดิบหมด / สั่งเข้าไม่ทัน)
//
// ตัวเลขทั้งหมดคิดที่หลังบ้าน (cloudflare/appstock-api/src/plan.js · action USAGEPLAN)
// ไฟล์นี้แค่ "แสดงผล" — หน้าคอม มือถือ และข้อความ Telegram ตอนเช้า จึงได้ตัวเลขชุดเดียวกันเสมอ
//
// หลักการ: ชี้ให้เห็นว่าตัวไหนต้องสั่งเมื่อไร — ไม่สั่งเอง ไม่บล็อกการเบิก คนตัดสินใจเองทุกครั้ง
// ทุกคนเปิดดูได้ (รวม viewer) · ตั้งค่ากลาง / ส่งเข้ากลุ่ม (Telegram + LINE) = manager ขึ้นไป
// ═════════════════════════════════════════════

let _planData = null;          // คำตอบล่าสุดจากหลังบ้าน
let _planFilter = "todo";      // todo = ต้องลงมือ (late+now+soon) | late | now | soon | ok | nodata | all
let _planReqSeq = 0;           // กันคำตอบเก่ามาทับ เมื่อพิมพ์ค่าลองดูเร็วๆ
const PLAN_SEV = { late: "crit", now: "high", soon: "warn", ok: "ok", nodata: "" };
const PLAN_SRC = {
  actual: ["เบิกจริง", "คิดจากยอดเบิกจริง 30 วันล่าสุด (มากกว่าค่าที่ตั้งไว้)"],
  plan:   ["ค่าที่ตั้งไว้", "ใช้ค่า \"ใช้ต่อวัน\" ที่ตั้งไว้ในรายการวัตถุดิบ — ประวัติเบิกยังน้อย หรือยอดเบิกจริงต่ำกว่าค่านี้"],
  thin:   ["เบิกจริง (ข้อมูลน้อย)", "ยังเบิกไม่ถึง 5 ครั้ง และไม่ได้ตั้ง \"ใช้ต่อวัน\" ไว้ — ตัวเลขอาจคลาดเคลื่อน"],
  none:   ["—", "ยังไม่เคยเบิก และไม่ได้ตั้ง \"ใช้ต่อวัน\" ไว้"]
};

const planFmt = n => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
function planThaiDate(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${Number(m[1]) + 543}` : "—";
}
function planCanManage() {
  const r = (localStorage.getItem("unified_stock_role") || "").toLowerCase();
  return r === "admin" || r === "manager";
}
function planFactoryName() { return rawCurrentModule === "SQF" ? "สุพรรณคิวฟู้ดส์" : "แม่ละมาย"; }

// ── เปิด/ปิด ──
async function openPlanModal() {
  const menu = document.getElementById("rawMoreMenu");
  if (menu) menu.removeAttribute("open");
  document.getElementById("planModal").classList.remove("hidden");
  document.getElementById("planTarget").textContent = planFactoryName();
  document.querySelectorAll(".plan-manage").forEach(el => { el.style.display = planCanManage() ? "" : "none"; });
  _planFilter = "todo";
  _planData = null;   // กันแผนของอีกโรงงานค้างบนจอระหว่างรอ
  ["planLead", "planSafety", "planCover"].forEach(id => { document.getElementById(id).value = ""; });
  if (planCanManage()) planLoadNtf();   // ไม่รอ — บรรทัดกำหนดการเติมเองเมื่อได้คำตอบ
  await planLoad(false);
}
function closePlanModal() { document.getElementById("planModal").classList.add("hidden"); }

function _planInputs() {
  const v = id => { const s = document.getElementById(id).value.trim(); return s === "" ? undefined : Number(s); };
  return { leadDays: v("planLead"), safetyDays: v("planSafety"), coverDays: v("planCover") };
}

// ดึงแผน — useInputs = ใช้ค่าที่พิมพ์ในช่องลองดู (ไม่บันทึก)
async function planLoad(useInputs) {
  const seq = ++_planReqSeq;
  const body = document.getElementById("planBody");
  if (!_planData) body.innerHTML = '<p class="sq-empty">⏳ กำลังอ่านประวัติการเบิก…</p>';
  try {
    const r = await rawFetch(Object.assign({ action: "USAGEPLAN", user: currentUser }, useInputs ? _planInputs() : {}));
    if (seq !== _planReqSeq) return;
    if (r.status !== "success") throw new Error(r.message || "โหลดไม่สำเร็จ");
    _planData = r;
    document.getElementById("planLead").value   = r.settings.leadDays;
    document.getElementById("planSafety").value = r.settings.safetyDays;
    document.getElementById("planCover").value  = r.settings.coverDays;
    planRender();
    planUpdateTile(r);
  } catch (e) {
    if (seq !== _planReqSeq) return;
    body.innerHTML = '<p class="sq-empty" style="color:var(--sq-crit);">โหลดไม่สำเร็จ: ' + escapeHtml(netErrorText(e)) +
      ' <button class="sq-btn sq-btn-sm" onclick="planLoad(false)">ลองใหม่</button></p>';
  }
}

let _planTypeTimer = null;
function planOnSettingInput() {
  clearTimeout(_planTypeTimer);
  _planTypeTimer = setTimeout(() => planLoad(true), 450);
}
function planResetSettings() {
  ["planLead", "planSafety", "planCover"].forEach(id => { document.getElementById(id).value = ""; });
  planLoad(false);
}
function _planDiffersFromSaved() {
  if (!_planData) return false;
  const a = _planData.settings, b = _planData.saved;
  return a.leadDays !== b.leadDays || a.safetyDays !== b.safetyDays || a.coverDays !== b.coverDays;
}

async function planSaveSettings(btn) {
  if (!_planData || !planCanManage()) return;
  const s = _planData.settings;
  if (!confirm(`ใช้ค่านี้กับทุกคน?\n\n• สั่งของแล้วรอ ${s.leadDays} วัน\n• กันชน ${s.safetyDays} วัน\n• สั่งแต่ละครั้งให้พอใช้ ${s.coverDays} วัน\n\nมีผลกับหน้าจอของทุกคน และข้อความสรุปตอนเช้า`)) return;
  if (btn) btn.disabled = true;
  try {
    const r = await rawFetch({ action: "PLANSET", leadDays: s.leadDays, safetyDays: s.safetyDays, coverDays: s.coverDays, user: currentUser });
    if (r.status !== "success") throw new Error(r.message || "บันทึกไม่สำเร็จ");
    showToast("บันทึกค่ากลางแล้ว — ทุกคนเห็นค่าเดียวกัน ✅", "success");
    await planLoad(false);
  } catch (e) { showToast("บันทึกไม่สำเร็จ: " + netErrorText(e), "error"); }
  finally { if (btn) btn.disabled = false; }
}

// 🗓️ สรุปเข้ากลุ่มส่งเมื่อไร — ตั้งที่ ⚙️ ตั้งค่าการแจ้งเตือน → กำหนดการส่งสรุป (js/notify.js) · หน้านี้แค่บอกให้รู้
let _planNtfText = null;
async function planLoadNtf() {
  try {
    const r = await (await fetch(GAS_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ module: "SYSTEM", action: "NOTIFYGET" }) })).json();
    if (r && r.status === "success") _planNtfText = r.text;
  } catch (e) {}
  const el = document.getElementById("planNtfNote");
  if (el) el.innerHTML = _planNtfHtml();
}
function _planNtfHtml() {
  if (!_planNtfText) return "🗓️ สรุปเข้ากลุ่ม Telegram / LINE: กำลังโหลดกำหนดการ…";
  const isAdmin = (localStorage.getItem("unified_stock_role") || "").toLowerCase() === "admin";
  return `🗓️ <b>สรุปเข้ากลุ่มอัตโนมัติ</b> · Telegram: ${escapeHtml(_planNtfText.tg)} · LINE: ${escapeHtml(_planNtfText.line)}` +
    (isAdmin ? ` <button class="sq-btn sq-btn-sm" onclick="openUnifiedSettings()">ตั้งวัน/เวลา/รูปแบบ</button>` : " (แอดมินตั้งได้ที่ ⚙️ ตั้งค่าการแจ้งเตือน)");
}

// ── กรอง ──
function planSetFilter(f) { _planFilter = f; planRender(); }
function _planFiltered() {
  const items = (_planData && _planData.items) || [];
  if (_planFilter === "all") return items;
  if (_planFilter === "todo") return items.filter(x => x.status === "late" || x.status === "now" || x.status === "soon");
  if (_planFilter === "stale") return items.filter(x => x.stale);
  return items.filter(x => x.status === _planFilter);
}
function _planOrderList() {
  return ((_planData && _planData.items) || []).filter(x => (x.status === "late" || x.status === "now") && x.suggestQty > 0);
}

// ── วาด ──
function _planWhen(x) {
  if (x.orderInDays === null || x.orderInDays === undefined) return '<span class="sq-dim">—</span>';
  if (x.status === "late") return `<b style="color:var(--sq-crit);">เลยกำหนดแล้ว</b><div class="sq-meter-note">ควรสั่งตั้งแต่ ${Math.abs(x.orderInDays)} วันก่อน</div>`;
  if (x.orderInDays <= 0) return '<b style="color:var(--sq-high);">วันนี้</b>';
  return `<b>${planThaiDate(x.orderByDate)}</b><div class="sq-meter-note">อีก ${x.orderInDays} วัน</div>`;
}
function _planCover(x) {
  if (x.daysCover === null || x.daysCover === undefined) return '<span class="sq-dim">ไม่ทราบ</span>';
  const need = x.leadDays + (_planData.settings.safetyDays || 0);
  const pct = Math.max(3, Math.min(100, Math.round(x.daysCover / Math.max(1, need * 2) * 100)));
  const col = x.status === "late" ? "var(--sq-crit)" : x.status === "now" ? "var(--sq-high)" : x.status === "soon" ? "var(--sq-warn)" : "var(--sq-accent)";
  return `<span class="sq-num sq-num-lg" style="color:${col};">${planFmt(x.daysCover)}</span><span class="sq-unit">วัน</span>
    <div class="sq-meter" title="เทียบกับเวลารอของ + กันชน (${need} วัน)"><i style="width:${pct}%;background:${col};"></i></div>
    <div class="sq-meter-note">${x.qty <= 0 ? "หมดแล้ว" : "หมดประมาณ " + planThaiDate(x.runOutDate)}</div>`;
}
function _planNotes(x) {
  const out = (x.reasons || []).map(t => `<div>• ${escapeHtml(t)}</div>`);
  if (x.trendPct !== null && x.trendPct !== undefined && Math.abs(x.trendPct) >= 20)
    out.push(`<div>• เบิก 30 วันล่าสุด ${x.trendPct > 0 ? "▲ เพิ่มขึ้น" : "▼ ลดลง"} ${Math.abs(x.trendPct)}% จาก 30 วันก่อนหน้า</div>`);
  if (x.topPurposes && x.topPurposes.length)
    out.push(`<div class="sq-dim">ใช้กับ: ${x.topPurposes.map(p => escapeHtml(p.purpose) + " (" + planFmt(p.qty) + ")").join(" · ")}</div>`);
  if (x.tx30) out.push(`<div class="sq-dim">เบิก ${x.tx30} ครั้ง / ${x.activeDays30} วัน ใน 30 วันล่าสุด${x.lastOut ? " · ล่าสุด " + planThaiDate(x.lastOut) : ""}</div>`);
  return out.join("") || '<span class="sq-dim">—</span>';
}

function planRender() {
  if (!_planData) return;
  const d = _planData, sum = d.summary, S = d.settings;
  const rows = _planFiltered();
  const todo = sum.late + sum.now + sum.soon;

  const tile = (key, dot, label, num, note) => `
    <button type="button" class="sq-tile plan-tile${_planFilter === key ? " is-on" : ""}" onclick="planSetFilter('${key}')">
      <div class="sq-tile-label"><span class="sq-dot" style="background:${dot}"></span>${label}</div>
      <div class="sq-tile-num"${num ? ` style="color:${dot}"` : ""}>${num}</div>
      <div class="sq-tile-note">${note}</div>
    </button>`;
  const tiles = `<div class="sq-tiles" style="margin-bottom:12px;">
      ${tile("late", "var(--sq-crit)", "🔴 สั่งวันนี้ก็ไม่ทัน", sum.late, "ของจะหมดก่อนของใหม่มาถึง")}
      ${tile("now",  "var(--sq-high)", "🟠 ต้องสั่งวันนี้",     sum.now,  "สั่งเลยถึงจะทัน")}
      ${tile("soon", "var(--sq-warn)", "🟡 ใกล้ถึงเวลาสั่ง",   sum.soon, "ภายใน 7 วัน")}
      ${tile("ok",   "var(--sq-accent)", "🟢 ยังพอ",            sum.ok,   "ยังไม่ต้องสั่ง")}
      ${tile("nodata", "var(--sq-muted)", "⚪ ยังไม่มีข้อมูล",   sum.nodata, "ไม่เคยเบิก / ไม่ได้ตั้งค่า")}
      ${S.staleDays ? tile("stale", "var(--sq-high)", "⏰ ไม่อัปเดตเกิน " + S.staleDays + " วัน", sum.stale || 0, "ยอดอาจไม่ตรง — ช่วยนับ") : ""}
    </div>`;

  const chips = [["todo", `ต้องลงมือ (${todo})`], ["all", `ทั้งหมด (${sum.total})`]].map(([k, t]) =>
    `<button type="button" class="sq-btn sq-btn-sm${_planFilter === k ? " sq-btn-primary" : ""}" onclick="planSetFilter('${k}')">${t}</button>`).join(" ");

  const whatIf = _planDiffersFromSaved()
    ? `<div class="sq-note warn" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
         <span style="flex:1;min-width:220px;">กำลัง<b>ลองดู</b>ด้วยค่า รอของ ${S.leadDays} วัน · กันชน ${S.safetyDays} วัน · สั่งให้พอ ${S.coverDays} วัน
           (ค่าที่ทุกคนใช้อยู่: ${d.saved.leadDays} / ${d.saved.safetyDays} / ${d.saved.coverDays}) — ยังไม่ได้บันทึก</span>
         <button class="sq-btn sq-btn-sm" onclick="planResetSettings()">↺ กลับไปค่าที่ใช้อยู่</button>
         ${planCanManage() ? '<button class="sq-btn sq-btn-sm sq-btn-primary" onclick="planSaveSettings(this)">💾 ใช้ค่านี้กับทุกคน</button>' : ""}
       </div>` : "";

  const body = rows.map(x => {
    const src = PLAN_SRC[x.rateSource] || PLAN_SRC.none;
    const sug = x.suggestQty > 0
      ? `<span class="sq-num sq-num-lg">${planFmt(x.suggestQty)}</span><span class="sq-unit">${escapeHtml(x.unit)}</span>
         <div class="sq-meter-note">${[x.packSize > 0 ? "ปัดตามแพ็ค " + planFmt(x.packSize) : "", x.moq > 0 ? "ขั้นต่ำ " + planFmt(x.moq) : ""].filter(Boolean).join(" · ")}</div>`
      : '<span class="sq-dim">—</span>';
    return `<tr class="sev-${PLAN_SEV[x.status] || "none"}">
      <td class="rail"></td>
      <td><span class="sq-chip ${PLAN_SEV[x.status] || ""}">${x.icon} ${escapeHtml(x.statusText)}</span></td>
      <td><div class="sq-name">${escapeHtml(x.name)}</div><div class="sq-meta"><span>${escapeHtml(x.sku)}</span><span>รอของ ${x.leadDays} วัน${x.leadOwn ? " (รายตัว)" : ""}</span></div></td>
      <td class="n" style="white-space:nowrap;"><span class="sq-num sq-num-lg">${planFmt(x.qty)}</span><span class="sq-unit">${escapeHtml(x.unit)}</span>
          ${x.min > 0 ? `<div class="sq-meter-note">จุดสั่งซื้อ ${planFmt(x.min)}</div>` : ""}</td>
      <td class="n" style="white-space:nowrap;">${x.rate > 0 ? `<span class="sq-num">${planFmt(x.rate)}</span><span class="sq-unit">/วัน</span>` : '<span class="sq-dim">—</span>'}
          <div class="sq-meter-note" title="${escapeAttr(src[1])}">${escapeHtml(src[0])}</div></td>
      <td class="n" style="min-width:120px;">${_planCover(x)}</td>
      <td style="white-space:nowrap;">${_planWhen(x)}</td>
      <td class="n" style="white-space:nowrap;">${sug}</td>
      <td style="font-size:12px;line-height:1.55;min-width:220px;">${_planNotes(x)}</td>
    </tr>`;
  }).join("");

  const empty = _planFilter === "todo"
    ? "✅ ไม่มีรายการที่ต้องสั่งในตอนนี้"
    : "ไม่มีรายการในกลุ่มนี้";

  const orderN = _planOrderList().length;
  document.getElementById("planBody").innerHTML = `
    ${tiles}
    ${whatIf}
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
      ${chips}
      <span style="flex:1;"></span>
      <button class="sq-btn sq-btn-sm" onclick="planCopyList()" ${orderN ? "" : "disabled"}>📋 คัดลอกรายการสั่ง (${orderN})</button>
      <button class="sq-btn sq-btn-sm" onclick="planPrint()">🖨️ พิมพ์</button>
      ${planCanManage() ? `<button class="sq-btn sq-btn-sm" onclick="planSendTelegram(this)" ${sum.late + sum.now ? "" : "disabled"}>📨 ส่งเข้ากลุ่มแชต</button>` : ""}
      ${planCanManage() && sum.stale ? `<button class="sq-btn sq-btn-sm" onclick="planSendTelegram(this, 'stale')" title="ส่งรายการที่ไม่มีการอัปเดตเข้ากลุ่ม ให้ช่วยกันนับ">⏰ ส่งเตือนให้ช่วยนับ (${sum.stale})</button>` : ""}
    </div>
    <div class="sq-card" style="margin-bottom:12px;"><div class="sq-tablewrap">
      ${rows.length ? `<table class="sq-table">
        <thead><tr><th style="width:3px;padding:0;"></th><th>สถานะ</th><th>วัตถุดิบ</th><th class="n">คงเหลือ</th><th class="n">ใช้ต่อวัน</th>
          <th class="n">พอใช้อีก</th><th>ต้องสั่งภายใน</th><th class="n">แนะนำสั่ง</th><th>ข้อสังเกต</th></tr></thead>
        <tbody>${body}</tbody></table>` : `<p class="sq-empty">${empty}</p>`}
    </div></div>
    ${planCanManage() ? `<p class="sq-note" id="planNtfNote">${_planNtfHtml()}</p>` : ""}
    <p class="sq-note">
      <b>อ่านยังไง</b> · <b>พอใช้อีก</b> = คงเหลือ ÷ ใช้ต่อวัน · <b>ต้องสั่งภายใน</b> = วันที่ของจะหมด − วันรอของ − วันกันชน ·
      <b>แนะนำสั่ง</b> = ให้พอใช้ ${S.coverDays} วันนับจากวันที่ของมาถึง (ปัดตามขนาดบรรจุ / ไม่ต่ำกว่าสั่งขั้นต่ำ)<br>
      <b>ใช้ต่อวัน</b> เลือกค่าที่มากกว่าระหว่าง ยอดเบิกจริง 30 วัน (เบิก − คืน · นับเมื่อเบิกครบ 5 ครั้งและมีข้อมูล 14 วันขึ้นไป) กับค่า "ใช้ต่อวัน" ที่ตั้งไว้ในรายการวัตถุดิบ — เผื่อไว้ทางปลอดภัยเพื่อกันของหมด ·
      วันรอของ / ขนาดบรรจุ / สั่งขั้นต่ำ ของแต่ละตัว แก้ได้ที่ปุ่ม <b>แก้ไข</b> ในตารางวัตถุดิบ<br>
      ระบบ<b>ไม่สั่งซื้อเองและไม่บล็อกการเบิก</b> — เป็นข้อมูลให้ทุกคนช่วยกันดูเท่านั้น
    </p>`;
}

// ── คัดลอกไปวางในแชต ──
function _planOrderText() {
  const list = _planOrderList();
  const head = `📈 รายการที่ต้องสั่งซื้อ — ${planFactoryName()} (${rawCurrentModule})\n${planThaiDate(_planData.today)}\n`;
  return head + list.map((x, i) =>
    `${i + 1}. ${x.name} — สั่ง ${planFmt(x.suggestQty)} ${x.unit}` +
    `\n    เหลือ ${planFmt(x.qty)} ${x.unit}${x.daysCover !== null ? " · พอใช้ " + planFmt(x.daysCover) + " วัน" : ""} · รอของ ${x.leadDays} วัน`).join("\n");
}
async function planCopyList() {
  if (!_planData || !_planOrderList().length) return;
  const txt = _planOrderText();
  try { await navigator.clipboard.writeText(txt); showToast("คัดลอกแล้ว — วางในแชตได้เลย ✅", "success"); }
  catch (e) {
    const ta = document.createElement("textarea");
    ta.value = txt; ta.style.cssText = "position:fixed;left:-9999px;top:0;";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e2) {}
    ta.remove();
    showToast(ok ? "คัดลอกแล้ว — วางในแชตได้เลย ✅" : "คัดลอกไม่สำเร็จ", ok ? "success" : "error");
  }
}

// ── ส่งเข้ากลุ่มแชต Telegram + LINE (คนกดเอง) — ดูตัวอย่างข้อความก่อนเสมอ ──
async function planSendTelegram(btn, what) {
  if (!planCanManage()) return;
  what = what === "stale" ? "stale" : "plan";
  if (btn) btn.disabled = true;
  try {
    const pv = await rawFetch({ action: "PLANDIGEST", what, send: false, user: currentUser });
    const msg = pv && pv.preview && pv.preview[rawCurrentModule];
    if (!msg) { showToast(what === "stale" ? "ไม่มีรายการที่ค้างการอัปเดต" : "ไม่มีรายการที่ต้องสั่งในตอนนี้", "info"); return; }
    // LINE นับโควตาตามจำนวนสมาชิก — บอกก่อนกดว่าจะใช้เท่าไร
    const ln = pv.preview.line, lineOn = pv.result && pv.result.line === "preview" && ln;
    const members = lineOn ? ln.groups.reduce((a, g) => a + (Number(g.members) || 0), 0) : 0;
    const lineTxt = lineOn ? "\n+ LINE: " + ln.groups.map(g => g.name).join(", ") + (members ? " (ใช้โควตา " + members + " ข้อความ" +
      (ln.quota && ln.quota.limited && ln.quota.used != null ? " · เดือนนี้ใช้ไป " + ln.quota.used + "/" + ln.quota.limit : "") + ")" : "") : "";
    if (!confirm("ส่งข้อความนี้เข้ากลุ่ม Telegram" + lineTxt + "?\n\n" + msg.slice(0, 900) + (msg.length > 900 ? "\n…" : ""))) return;
    const r = await rawFetch({ action: "PLANDIGEST", what, send: true, user: currentUser });
    const res = r && r.result && r.result[rawCurrentModule], lres = r && r.result && r.result.line;
    const TH = { "disabled": "ระบบปิดการส่งอยู่", "no token": "ยังไม่ได้ตั้งค่าโทเคนบอท", "no chatId": "ยังไม่ได้ตั้งค่ากลุ่มปลายทาง" };
    const tgOk = res === "sent", lineOk = lres === "sent";
    const parts = [tgOk ? "Telegram ✅" : "Telegram ❌ " + (TH[String(res || "").replace(/^not-sent:\s*/, "")] || String(res || (r && r.message) || "").replace(/^not-sent:\s*/, ""))];
    if (lineOn) parts.push(lineOk ? "LINE ✅" : "LINE ❌ " + String(lres || "").replace(/^(not-sent|partial):\s*/, ""));
    showToast(parts.join(" · "), (tgOk || lineOk) ? (tgOk && (!lineOn || lineOk) ? "success" : "warn") : "error", 6000);
  } catch (e) { showToast("ส่งไม่สำเร็จ: " + netErrorText(e), "error"); }
  finally { if (btn) btn.disabled = false; }
}

// ── พิมพ์ — หน้าต่างใหม่ไม่มี CSS ของหน้าแม่ ต้องใช้สี hex ตรงๆ (CLAUDE.md ข้อ 4) ──
function planPrint() {
  if (!_planData) return;
  const rows = _planFiltered();
  const S = _planData.settings;
  const COL = { late: "#c0362c", now: "#a8560a", soon: "#7d6407", ok: "#0e7a3f", nodata: "#6c8074" };
  const BG  = { late: "#fbeceb", now: "#fdf0e2", soon: "#faf3d9", ok: "#ffffff", nodata: "#ffffff" };
  const td = "padding:6px 9px;border:1px solid #dfe6e0;vertical-align:top;";
  const body = rows.map((x, i) => `<tr style="background:${BG[x.status]};">
      <td style="${td}text-align:center;">${i + 1}</td>
      <td style="${td}color:${COL[x.status]};font-weight:700;white-space:nowrap;">${escapeHtml(x.statusText)}</td>
      <td style="${td}"><b>${escapeHtml(x.name)}</b><br><span style="color:#6c8074;font-size:10px;">${escapeHtml(x.sku)}</span></td>
      <td style="${td}text-align:right;">${planFmt(x.qty)} ${escapeHtml(x.unit)}</td>
      <td style="${td}text-align:right;">${x.rate > 0 ? planFmt(x.rate) : "—"}</td>
      <td style="${td}text-align:right;">${x.daysCover === null ? "—" : planFmt(x.daysCover) + " วัน"}</td>
      <td style="${td}text-align:center;">${x.leadDays}</td>
      <td style="${td}white-space:nowrap;">${x.orderInDays === null ? "—" : x.orderInDays <= 0 ? "วันนี้" : planThaiDate(x.orderByDate)}</td>
      <td style="${td}text-align:right;font-weight:700;">${x.suggestQty > 0 ? planFmt(x.suggestQty) + " " + escapeHtml(x.unit) : "—"}</td>
      <td style="${td}width:90px;"></td>
    </tr>`).join("");
  const logo = typeof logoUrl === "function" ? logoUrl() : "";
  const w = window.open("", "_blank");
  if (!w) { showToast("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — อนุญาต pop-up ก่อน", "warn"); return; }
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>วางแผนสั่งซื้อ ${escapeHtml(rawCurrentModule)}</title>
    <style>body{font-family:'Sarabun','Segoe UI',Tahoma,sans-serif;color:#16241b;margin:18px;font-size:12px;}
      table{border-collapse:collapse;width:100%;}th{background:#0e7a3f;color:#fff;padding:7px 9px;border:1px solid #0e7a3f;font-size:11px;text-align:left;}
      @media print{.noprint{display:none}}</style></head><body>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
      ${logo ? `<img src="${escapeAttr(logo)}" alt="" style="height:44px;">` : ""}
      <div><div style="font-size:17px;font-weight:800;">วางแผนสั่งซื้อวัตถุดิบ — ${escapeHtml(planFactoryName())} (${escapeHtml(rawCurrentModule)})</div>
      <div style="color:#435349;">วันที่ ${planThaiDate(_planData.today)} · รอของ ${S.leadDays} วัน · กันชน ${S.safetyDays} วัน · สั่งให้พอใช้ ${S.coverDays} วัน · พิมพ์โดย ${escapeHtml(currentUser || "-")}</div></div>
      <button class="noprint" onclick="window.print()" style="margin-left:auto;padding:8px 16px;font-weight:700;">🖨️ พิมพ์</button>
    </div>
    <table><thead><tr><th>#</th><th>สถานะ</th><th>วัตถุดิบ</th><th>คงเหลือ</th><th>ใช้/วัน</th><th>พอใช้อีก</th><th>รอของ (วัน)</th><th>ต้องสั่งภายใน</th><th>แนะนำสั่ง</th><th>สั่งจริง</th></tr></thead>
    <tbody>${body || '<tr><td colspan="10" style="padding:20px;text-align:center;">ไม่มีรายการ</td></tr>'}</tbody></table>
    <p style="color:#6c8074;margin-top:10px;">ตัวเลขเป็นคำแนะนำจากประวัติการเบิก — ผู้สั่งซื้อปรับจำนวนได้ตามจริง</p>
    </body></html>`);
  w.document.close();
}

// ── ป้ายบนหน้าวัตถุดิบ: "ต้องสั่ง N รายการ" — ดึงเบื้องหลังหลังโหลดคลัง ไม่บังงาน ──
let _planTileSeq = 0;
function planUpdateTile(r) {
  const el = document.getElementById("rawPlanBtn");
  if (!el) return;
  const n = r && r.summary ? r.summary.late + r.summary.now : 0;
  const soon = r && r.summary ? r.summary.soon : 0;
  el.innerHTML = "📈 วางแผนสั่งซื้อ" + (n ? ` <span class="sq-tab-badge">${n}</span>` :
    soon ? ` <span class="sq-tab-badge" style="background:var(--sq-warn);">${soon}</span>` : "");
  el.title = r && r.summary ? `สั่งวันนี้ก็ไม่ทัน ${r.summary.late} · ต้องสั่งวันนี้ ${r.summary.now} · ใกล้ถึงเวลาสั่ง ${r.summary.soon}` : "";
}
async function planRefreshTile() {
  const mod = rawCurrentModule, seq = ++_planTileSeq;
  try {
    const r = await rawFetch({ action: "USAGEPLAN", user: currentUser });
    if (seq !== _planTileSeq || mod !== rawCurrentModule || r.status !== "success") return;
    planUpdateTile(r);
  } catch (e) { /* ออฟไลน์ — ป้ายคงค่าเดิม */ }
}
