// ═════════════════════════════════════════════
// notify.js — 🗓️ กำหนดการส่งสรุปเข้ากลุ่ม (อยู่ในหน้าต่าง ⚙️ ตั้งค่าการแจ้งเตือน · admin เท่านั้น)
//
// เจ้าของสั่ง: "การแจ้งเตือนสต๊อกทำให้ กำหนด วันและรูปแบบการเตือนได้" — ตั้ง Telegram กับ LINE แยกกัน
//   วันที่ส่ง · เวลา · หัวข้อ (ที่ต้องสั่ง / ต่ำกว่าจุดสั่งซื้อ / ไม่อัปเดต / ใกล้หมดอายุ)
//   แบบละเอียด-ย่อ · ส่งทุกครั้ง-เฉพาะเมื่อรายการเปลี่ยน · ดูตัวอย่างข้อความก่อนบันทึก
// หลังบ้าน: cloudflare/appstock-api/src/notify.js (NOTIFYGET / NOTIFYSET) + src/plan.js (NOTIFYPREVIEW)
// ═════════════════════════════════════════════

const NTF_TOPICS = [["plan", "📈 ที่ต้องสั่งซื้อ"], ["low", "🟠 ต่ำกว่าจุดสั่งซื้อ"], ["stale", "⏰ ไม่อัปเดตสต๊อกเกินกำหนด"], ["expiry", "⛔ ใกล้หมดอายุ / หมดอายุ"]];
const NTF_DAYS = [[1, "จ"], [2, "อ"], [3, "พ"], [4, "พฤ"], [5, "ศ"], [6, "ส"], [0, "อา"]];
const NTF_DAY_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสฯ", "ศุกร์", "เสาร์"];
const NTF_CH = {
  tg:   { name: "📲 Telegram", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
  line: { name: "💚 LINE กลุ่ม", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" }
};
let _ntf = null;

async function _ntfCall(body) {
  const r = await (await fetch(GAS_URL, {
    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ module: "SYSTEM" }, body))
  })).json();
  handleTokenExpired(r);
  return r;
}

async function ntfLoad() {
  const box = document.getElementById("ntfBox");
  if (!box) return;
  box.innerHTML = '<p class="text-xs text-slate-400 font-bold">⏳ กำลังโหลดกำหนดการ…</p>';
  try {
    const r = await _ntfCall({ action: "NOTIFYGET" });
    if (!r || r.status !== "success") throw new Error((r && r.message) || "ไม่ได้รับคำตอบ");
    _ntf = r.schedule;
    box.innerHTML = ["tg", "line"].map(ch => _ntfCard(ch, _ntf[ch])).join("");
    ntfUpdateHints();
  } catch (e) {
    _ntf = null;
    box.innerHTML = '<p class="text-xs font-black" style="color:var(--sq-crit);">โหลดกำหนดการไม่ได้: ' + escapeHtml(netErrorText(e)) + "</p>";
  }
}

function _ntfCard(ch, s) {
  const m = NTF_CH[ch];
  const days = NTF_DAYS.map(([d, t]) => `<label class="ntf-day" title="${NTF_DAY_FULL[d]}">
      <input type="checkbox" data-ntf="${ch}-day" value="${d}" ${s.days.includes(d) ? "checked" : ""} onchange="ntfUpdateHints()"><span>${t}</span></label>`).join("");
  const hours = Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === s.hour ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("");
  const topics = NTF_TOPICS.map(([k, t]) => `<label class="ntf-opt">
      <input type="checkbox" data-ntf="${ch}-topic" value="${k}" ${s.topics[k] ? "checked" : ""} onchange="ntfUpdateHints()"> ${t}</label>`).join("");
  const radio = (name, val, cur, label) => `<label class="ntf-opt"><input type="radio" name="ntf-${ch}-${name}" value="${val}" ${cur === val ? "checked" : ""} onchange="ntfUpdateHints()"> ${label}</label>`;
  return `<div class="ntf-card" style="background:${m.bg};border-color:${m.border};">
    <div class="ntf-head">
      <b style="color:${m.color};">${m.name}</b>
      <label class="ntf-opt" style="font-weight:900;"><input type="checkbox" id="ntf-${ch}-on" ${s.on ? "checked" : ""} onchange="ntfUpdateHints()"> เปิดส่งสรุป</label>
    </div>
    <div id="ntf-${ch}-body">
      <div class="ntf-lbl">วันที่ส่ง</div>
      <div class="ntf-days">${days}</div>
      <div class="ntf-quick">
        <button type="button" onclick="ntfQuickDays('${ch}','all')">ทุกวัน</button>
        <button type="button" onclick="ntfQuickDays('${ch}','wk')">จ–ศ</button>
        <button type="button" onclick="ntfQuickDays('${ch}','mon')">จันทร์อย่างเดียว</button>
      </div>
      <div class="ntf-lbl">เวลาส่ง</div>
      <select id="ntf-${ch}-hour" class="bg-white border-2 border-slate-200 p-2 rounded-2xl font-bold text-sm" onchange="ntfUpdateHints()">${hours}</select>
      <div class="ntf-lbl">หัวข้อที่ส่ง</div>
      <div class="ntf-col">${topics}</div>
      <div class="ntf-lbl">รูปแบบข้อความ</div>
      <div class="ntf-col">
        ${radio("detail", "full", s.detail, "ละเอียด — ทุกรายการพร้อมตัวเลข")}
        ${radio("detail", "short", s.detail, "ย่อ — จำนวน + 5 รายการแรก")}
      </div>
      <div class="ntf-lbl">ส่งเมื่อไร</div>
      <div class="ntf-col">
        ${radio("when", "change", s.when, `เฉพาะเมื่อรายการเปลี่ยนจากที่เคยแจ้ง <span id="ntf-${ch}-remind" class="ntf-dim"></span>`)}
        ${radio("when", "always", s.when, "ทุกครั้งตามวันที่เลือก (แม้รายการเดิม)")}
      </div>
    </div>
    <div id="ntf-${ch}-hint" class="ntf-hint"></div>
    <button type="button" class="ntf-btn" onclick="ntfPreview('${ch}', this)">👁️ ดูตัวอย่างข้อความ${ch === "line" ? " (ไม่ส่งจริง ไม่เสียโควตา)" : ""}</button>
    <div id="ntf-${ch}-preview"></div>
  </div>`;
}

/** อ่านค่าจากฟอร์มของช่องหนึ่ง (รูปเดียวกับที่หลังบ้านเก็บ) */
function _ntfRead(ch) {
  const one = (sel) => document.querySelector(sel);
  return {
    on: !!(one(`#ntf-${ch}-on`) || {}).checked,
    days: [...document.querySelectorAll(`input[data-ntf="${ch}-day"]:checked`)].map(x => Number(x.value)),
    hour: Number((one(`#ntf-${ch}-hour`) || {}).value || 8),
    topics: Object.fromEntries(NTF_TOPICS.map(([k]) => [k, !!(one(`input[data-ntf="${ch}-topic"][value="${k}"]`) || {}).checked])),
    detail: (one(`input[name="ntf-${ch}-detail"]:checked`) || {}).value || "full",
    when: (one(`input[name="ntf-${ch}-when"]:checked`) || {}).value || "change"
  };
}

function ntfQuickDays(ch, kind) {
  const pick = kind === "all" ? [0, 1, 2, 3, 4, 5, 6] : kind === "wk" ? [1, 2, 3, 4, 5] : [1];
  document.querySelectorAll(`input[data-ntf="${ch}-day"]`).forEach(cb => { cb.checked = pick.includes(Number(cb.value)); });
  ntfUpdateHints();
}

// ข้อความช่วยตัดสินใจใต้แต่ละช่อง: วันทวนซ้ำ · คำเตือนตั้งไม่ครบ · โควตา LINE ที่จะใช้ต่อเดือน
function ntfUpdateHints() {
  ["tg", "line"].forEach(ch => {
    const hint = document.getElementById(`ntf-${ch}-hint`);
    if (!hint) return;
    const s = _ntfRead(ch);
    const body = document.getElementById(`ntf-${ch}-body`);
    if (body) body.style.opacity = s.on ? "1" : ".45";
    const rem = NTF_DAYS.map(x => x[0]).find(d => s.days.includes(d));
    const remEl = document.getElementById(`ntf-${ch}-remind`);
    if (remEl) remEl.textContent = rem === undefined ? "" : `(ทวนซ้ำทุกวัน${NTF_DAY_FULL[rem]} แม้รายการเดิม)`;
    const tCount = NTF_TOPICS.filter(([k]) => s.topics[k]).length;
    const rows = [];
    if (!s.on) rows.push("⏸️ ปิดอยู่ — ไม่ส่งสรุปเข้าช่องนี้ (รวมปุ่มส่งในหน้าวางแผนสั่งซื้อ)");
    else {
      if (!s.days.length) rows.push('<b style="color:#b45309;">ยังไม่ได้เลือกวัน</b> = ไม่ส่งอัตโนมัติ (ยังกดส่งเองในหน้าวางแผนสั่งซื้อได้)');
      if (!tCount) rows.push('<b style="color:#b45309;">ยังไม่ได้เลือกหัวข้อ</b> = ไม่มีอะไรส่งตามเวลา');
      if (s.days.length && tCount) rows.push(`ส่ง <b>${s.days.length === 7 ? "ทุกวัน" : s.days.length + " วัน/สัปดาห์"}</b> เวลา <b>${String(s.hour).padStart(2, "0")}:00</b> · ${tCount} หัวข้อ · ส่งเฉพาะหัวข้อที่มีรายการ`);
      if (ch === "line" && s.days.length && tCount) {
        const n = typeof _lineMembersOn === "function" ? _lineMembersOn() : 0;
        const perMonth = Math.round(s.days.length * 30 / 7);
        if (n) {
          const max = n * perMonth, over = max > 300;
          rows.push(`💰 โควตา: ส่ง 1 ครั้ง = ${n} ข้อความ (สมาชิก ${n} คน) · ${s.when === "always" ? "ประมาณ" : "สูงสุด"} <b${over ? ' style="color:#b91c1c;"' : ""}>${max.toLocaleString()}</b> ข้อความ/เดือน จากฟรี 300` +
            (s.when === "change" ? " (ส่งจริงน้อยกว่านี้ — เฉพาะวันที่รายการเปลี่ยน)" : "") + (over && s.when === "always" ? " — <b style=\"color:#b91c1c;\">เกินโควตาฟรี ลดวันลงหรือเลือก \"เฉพาะเมื่อรายการเปลี่ยน\"</b>" : ""));
        } else rows.push("💰 LINE นับโควตาตามจำนวนสมาชิกในกลุ่ม (ฟรี 300 ข้อความ/เดือน) — เชิญบอทเข้ากลุ่มแล้วจะคำนวณให้");
      }
    }
    hint.innerHTML = rows.map(r => `<div>${r}</div>`).join("");
  });
}

async function ntfSave(btn) {
  if (!_ntf) { showToast("ยังโหลดกำหนดการไม่สำเร็จ", "warn"); return; }
  const payload = { action: "NOTIFYSET", tg: _ntfRead("tg"), line: _ntfRead("line"), user: currentUser };
  if (btn) { btn.disabled = true; btn.textContent = "กำลังบันทึก…"; }
  try {
    const r = await _ntfCall(payload);
    if (!r || r.status !== "success") throw new Error((r && r.message) || "บันทึกไม่สำเร็จ");
    _ntf = r.schedule;
    showToast("บันทึกกำหนดการส่งสรุปแล้ว ✅", "success");
    if (typeof lineLoadStatus === "function") lineLoadStatus();   // ป้ายสถานะ LINE อ่านค่าเปิด/ปิดจากกำหนดการ
  } catch (e) { showToast("บันทึกไม่สำเร็จ: " + netErrorText(e), "error", 6000); }
  finally { if (btn) { btn.disabled = false; btn.textContent = "💾 บันทึกกำหนดการส่งสรุป"; } }
}

async function ntfPreview(ch, btn) {
  const out = document.getElementById(`ntf-${ch}-preview`);
  if (!out) return;
  if (btn) btn.disabled = true;
  out.innerHTML = '<p class="ntf-dim" style="margin-top:8px;">⏳ กำลังสร้างตัวอย่าง…</p>';
  try {
    const r = await _ntfCall({ action: "NOTIFYPREVIEW", channel: ch, [ch]: _ntfRead(ch) });
    if (!r || r.status !== "success") throw new Error((r && r.message) || "ไม่ได้รับคำตอบ");
    const head = [];
    if (ch === "line" && r.line) {
      const t = r.line.target;
      if (t && t.groups && t.groups.length) head.push("จะส่งเข้า: " + t.groups.map(g => escapeHtml(g.name || "กลุ่ม LINE") + (g.members == null ? "" : ` (${g.members} คน)`)).join(", "));
      else if (r.line.state === "not-configured") head.push("ยังไม่ได้ใส่ Channel access token");
      else if (r.line.state === "no-group") head.push("ยังไม่มีกลุ่ม — เชิญบอทเข้ากลุ่ม LINE ก่อน");
    }
    const texts = r.texts || [];
    out.innerHTML = `<div class="ntf-dim" style="margin-top:8px;">${head.join(" · ")}${head.length ? "<br>" : ""}ถ้าส่งตอนนี้: ${texts.length ? texts.length + (ch === "line" ? " กล่องข้อความ (นับโควตาครั้งเดียว)" : " ข้อความ") : "ไม่มีรายการให้ส่งในหัวข้อที่เลือก"}</div>` +
      texts.map((t, i) => `<pre class="ntf-pre">${texts.length > 1 ? `<b>— ${ch === "line" ? "กล่อง" : "ข้อความ"}ที่ ${i + 1} —</b>\n` : ""}${escapeHtml(t)}</pre>`).join("");
  } catch (e) { out.innerHTML = '<p class="text-xs font-black" style="color:var(--sq-crit);margin-top:8px;">ดูตัวอย่างไม่ได้: ' + escapeHtml(netErrorText(e)) + "</p>"; }
  finally { if (btn) btn.disabled = false; }
}
