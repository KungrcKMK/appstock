// ═════════════════════════════════════════════
// rop.js — 📐 จุดสั่งซื้อแนะนำ คำนวณจากประวัติการเบิกจริง
//
// วิธีคิด (ปรับจากงานวางแผนสต๊อกมาตรฐาน ตัดส่วนค้าปลีกทิ้ง):
//   จุดสั่งซื้อ = ใช้เฉลี่ย/วัน × วันรอของ  +  สต๊อกกันของขาด
//   สต๊อกกันของขาด = Z × σ × √วันรอของ
//     σ  = ความผันผวนของยอดเบิกรายวัน (วันไม่เบิกนับเป็น 0 ด้วย)
//     Z  = ระดับความมั่นใจ 90%=1.28 · 95%=1.65 · 98%=2.05
//
// ฝั่ง GAS (rmRopStats) คืนสถิติดิบต่อ SKU — สูตรคิดที่นี่
// เพื่อให้ขยับ "วันรอของ" แล้วเห็นผลทันทีไม่ต้องยิงใหม่
//
// หลักการสำคัญ: แค่ "แนะนำ" — คนกดรับเองทีละตัว ระบบไม่แก้ให้เอง
// และข้อมูลยังน้อย (เบิก <5 ครั้ง หรือเห็นมา <14 วัน) จะไม่แนะนำเลย
// ═════════════════════════════════════════════

const ROP_MIN_TX   = 5;    // เบิกอย่างน้อยกี่ครั้งถึงจะกล้าแนะนำ
const ROP_MIN_DAYS = 14;   // เห็นข้อมูลมาอย่างน้อยกี่วัน

let _ropStats = null;      // ผลจาก GAS ล่าสุด { items:{sku:{...}}, windowDays }

async function openRopModal() {
  const m = document.getElementById("ropModal");
  m.classList.remove("hidden");
  document.getElementById("ropTarget").textContent =
    rawCurrentModule === "SQF" ? "สุพรรณคิวฟู้ดส์" : "แม่ละมาย";
  document.getElementById("ropBody").innerHTML =
    '<p class="sq-empty">⏳ กำลังอ่านประวัติการเบิกย้อนหลัง…</p>';
  try {
    const r = await rawFetch({ action: "ROPSTATS", user: currentUser });
    if (r.status !== "success") throw new Error(r.message || "โหลดไม่สำเร็จ");
    _ropStats = r;
    ropRender();
  } catch (e) {
    document.getElementById("ropBody").innerHTML =
      '<p class="sq-empty" style="color:var(--sq-crit);">โหลดไม่สำเร็จ: ' + escapeHtml(e.message || "") + "</p>";
  }
}

function closeRopModal() {
  document.getElementById("ropModal").classList.add("hidden");
}

function ropZ() {
  return Number(document.getElementById("ropServiceSel").value) || 1.65;
}
function ropLeadDays() {
  const v = Number(document.getElementById("ropLeadInput").value);
  return isFinite(v) && v >= 1 ? Math.min(60, v) : 7;
}

// สูตรหลัก — คืน null ถ้าข้อมูลไม่พอ
function ropSuggest(s) {
  if (!s || s.txCount < ROP_MIN_TX || s.days < ROP_MIN_DAYS) return null;
  const lt = ropLeadDays();
  const raw = s.avgDaily * lt + ropZ() * s.sigma * Math.sqrt(lt);
  return Math.max(1, Math.ceil(raw));
}

function ropRender() {
  if (!_ropStats) return;
  const items = _ropStats.items || {};
  // rawLastData คือ array ของวัตถุดิบตรงๆ (ดู rawLoadData ใน js/raw.js)
  const mats = Array.isArray(rawLastData) ? rawLastData : [];
  const lt = ropLeadDays();

  let ready = 0, thin = 0, noData = 0;
  const rows = mats.map(mat => {
    const s = items[mat.SKU];
    const cur = Number(mat.Min) || 0;
    if (!s) { noData++; return { mat, s: null, cur, sug: null }; }
    const sug = ropSuggest(s);
    if (sug === null) thin++; else ready++;
    return { mat, s, cur, sug };
  });

  // เรียง: มีคำแนะนำและต่างจากของเดิมมากสุดขึ้นก่อน → ข้อมูลน้อย → ไม่เคยเบิก
  rows.sort((a, b) => {
    const da = a.sug === null ? -1 : Math.abs(a.sug - a.cur);
    const db = b.sug === null ? -1 : Math.abs(b.sug - b.cur);
    return db - da;
  });

  const fmt = n => Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 });

  const body = rows.map(r => {
    const name = `<b>${escapeHtml(r.mat.Name)}</b><br><span style="color:var(--sq-muted);font-size:11px;">${escapeHtml(r.mat.SKU)}</span>`;
    if (!r.s) {
      return `<tr style="opacity:.55;"><td>${name}</td>
        <td colspan="3" style="color:var(--sq-muted);">ยังไม่เคยมีการเบิกใน ${_ropStats.windowDays} วัน</td>
        <td class="n">${fmt(r.cur)}</td><td>—</td><td></td></tr>`;
    }
    const stat = `${fmt(r.s.avgDaily)} ${escapeHtml(r.mat.Unit||"")}/วัน
        <br><span style="color:var(--sq-muted);font-size:11px;">±σ ${fmt(r.s.sigma)} · เบิก ${r.s.txCount} ครั้ง/${r.s.days} วัน</span>`;
    if (r.sug === null) {
      return `<tr><td>${name}</td><td>${stat}</td>
        <td colspan="2"><span class="sq-chip" style="background:var(--sq-warn-bg);color:var(--sq-warn);">ข้อมูลยังน้อย — รอเบิกครบ ${ROP_MIN_TX} ครั้ง</span></td>
        <td class="n">${fmt(r.cur)}</td><td>—</td><td></td></tr>`;
    }
    const diff = r.sug - r.cur;
    const diffTxt = diff === 0
      ? '<span style="color:var(--sq-muted);">เท่าเดิม</span>'
      : diff > 0
        ? `<span style="color:var(--sq-high);font-weight:800;">▲ ควรเพิ่ม ${fmt(diff)}</span>`
        : `<span style="color:var(--sq-muted);">▼ ลดได้ ${fmt(-diff)}</span>`;
    const btn = diff === 0 ? "" :
      `<button class="rm-mini solid" onclick="ropAccept('${escapeJs(r.mat.SKU)}',${r.sug},this)">รับค่านี้</button>`;
    return `<tr><td>${name}</td><td>${stat}</td>
      <td class="n" style="font-size:16px;font-weight:800;">${fmt(r.sug)}</td>
      <td>${diffTxt}</td>
      <td class="n">${fmt(r.cur)}</td>
      <td style="color:var(--sq-muted);font-size:11px;">ใช้ ${fmt(r.s.avgDaily)}×${lt}วัน + กันขาด ${fmt(Math.ceil(ropZ()*r.s.sigma*Math.sqrt(lt)))}</td>
      <td>${btn}</td></tr>`;
  }).join("");

  document.getElementById("ropBody").innerHTML = `
    <div class="sq-tiles" style="margin-bottom:12px;">
      <div class="sq-tile"><div class="sq-tile-num">${ready}</div><div class="sq-tile-label">มีคำแนะนำ</div></div>
      <div class="sq-tile"><div class="sq-tile-num">${thin}</div><div class="sq-tile-label">ข้อมูลยังน้อย</div></div>
      <div class="sq-tile"><div class="sq-tile-num">${noData}</div><div class="sq-tile-label">ยังไม่เคยเบิก</div></div>
    </div>
    <div class="sq-tablewrap"><table class="sq-table">
      <thead><tr><th>วัตถุดิบ</th><th>ใช้จริงเฉลี่ย</th><th class="n">แนะนำ</th><th>เทียบของเดิม</th>
      <th class="n">ตั้งไว้ตอนนี้</th><th>ที่มาตัวเลข</th><th></th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    <p class="sq-note" style="margin-top:10px;">
      คิดจากประวัติเบิกจริงย้อนหลัง ${_ropStats.windowDays} วัน (เบิก − คืน, วันไม่เบิกนับเป็น 0) ·
      สูตร: ใช้เฉลี่ย/วัน × วันรอของ + Z×σ×√วันรอของ ·
      ระบบ<b>ไม่แก้ให้เอง</b> — กด "รับค่านี้" ทีละตัวเมื่อเห็นด้วยเท่านั้น</p>`;
}

async function ropAccept(sku, min, btn) {
  if (btn) { btn.disabled = true; btn.textContent = "⏳"; }
  try {
    const r = await rawFetch({ action: "SETMIN", sku, min, user: currentUser });
    if (r.status !== "success") throw new Error(r.message || "ไม่สำเร็จ");
    showToast(`ปรับจุดสั่งซื้อเป็น ${min} แล้ว ✅`, "success");
    // อัปเดตค่าในตารางหลักที่ค้างในหน่วยความจำ แล้ววาดใหม่ทั้งคู่
    const mat = (rawLastData.materials || []).find(m => String(m.SKU) === String(sku));
    if (mat) mat.Min = min;
    renderRawInventory(rawLastData);
    renderRawStats(rawLastData);
    ropRender();
  } catch (e) {
    showToast("ปรับไม่สำเร็จ: " + (e.message || ""), "error");
    if (btn) { btn.disabled = false; btn.textContent = "รับค่านี้"; }
  }
}
