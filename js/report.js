// ═════════════════════════════════════════════
// report.js — 🩺 สุขภาพข้อมูลสูตรการผลิต (BOM Health)
//   ตรวจว่าข้อมูลพร้อมเอาไปเทียบ "ควรใช้ vs ใช้จริง" หรือยัง
//   ทุกอย่างในหน้านี้ชี้ไปที่ "ข้อมูลที่ขาด" ไม่ใช่ตัวบุคคล
// ═════════════════════════════════════════════

let _bomHealth = null;

async function loadBomHealth() {
  const el = document.getElementById("bomHealthContent");
  if (!el) return;
  el.innerHTML = '<p style="color:#64748b;text-align:center;font-weight:700;padding:60px 0;">⏳ กำลังตรวจข้อมูล...</p>';
  let res;
  try {
    res = await crCallServer("getBomHealth");
  } catch (e) {
    const cached = cacheGet("bom_health");
    if (cached) { _bomHealth = cached; renderBomHealth(cached); showToast("⏳ แสดงผลตรวจครั้งก่อน (เชื่อมต่อไม่ได้)", "warn", 4000); return; }
    el.innerHTML = `<p style="color:#dc2626;text-align:center;font-weight:700;padding:60px 0;">❌ เชื่อมต่อไม่สำเร็จ</p>`;
    return;
  }
  if (!res || !res.ok) {
    el.innerHTML = `<p style="color:#dc2626;text-align:center;font-weight:700;padding:60px 0;">❌ ${escapeHtml((res && res.message) || "โหลดไม่สำเร็จ")}</p>`;
    return;
  }
  _bomHealth = res;
  cacheSet("bom_health", res);
  renderBomHealth(res);
}

// ── ตารางย่อย: แสดงรายการที่ต้องแก้ หรือ ✅ ถ้าผ่าน ──
function _bhSection(icon, title, why, rows, cols, emptyMsg) {
  const n = rows.length;
  const head = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:6px;">
      <div style="font-size:15px;font-weight:900;color:#0f172a;">${icon} ${escapeHtml(title)}</div>
      <div style="font-size:12px;font-weight:800;color:${n ? "#dc2626" : "#059669"};">${n ? n + " รายการ" : "✅ ผ่าน"}</div>
    </div>
    <div style="font-size:12px;color:#64748b;font-weight:600;margin-bottom:10px;">${escapeHtml(why)}</div>`;

  const body = n === 0
    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px;color:#166534;font-weight:700;font-size:13px;">${escapeHtml(emptyMsg)}</div>`
    : `<div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:12px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;">
          <thead><tr style="background:#f8fafc;">
            ${cols.map(c => `<th style="text-align:${c.align || "left"};padding:9px 12px;font-size:11px;font-weight:800;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${escapeHtml(c.label)}</th>`).join("")}
          </tr></thead>
          <tbody>
            ${rows.slice(0, 50).map(r => `<tr style="border-bottom:1px solid #f1f5f9;">
              ${cols.map(c => `<td style="text-align:${c.align || "left"};padding:9px 12px;color:#1e293b;">${c.render(r)}</td>`).join("")}
            </tr>`).join("")}
          </tbody>
        </table>
        ${n > 50 ? `<div style="padding:8px 12px;font-size:12px;color:#94a3b8;font-weight:700;background:#f8fafc;">…และอีก ${n - 50} รายการ</div>` : ""}
      </div>`;

  return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;margin-bottom:16px;box-shadow:0 2px 6px rgba(0,0,0,.03);">${head}${body}</div>`;
}

function renderBomHealth(res) {
  const s = res.summary;
  const tone = { "พร้อม":       { bg:"#052e16", bd:"#16a34a", fg:"#86efac", icon:"✅" },
                 "เกือบพร้อม":  { bg:"#451a03", bd:"#f59e0b", fg:"#fcd34d", icon:"⚠️" },
                 "ยังไม่พร้อม": { bg:"#450a0a", bd:"#dc2626", fg:"#fca5a5", icon:"🔴" },
                 "ยังไม่มีข้อมูล": { bg:"#1e293b", bd:"#64748b", fg:"#cbd5e1", icon:"📭" } }[s.readiness]
              || { bg:"#1e293b", bd:"#64748b", fg:"#cbd5e1", icon:"❔" };

  const kpi = (label, val, sub) => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;flex:1;min-width:130px;">
      <div style="font-size:11px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;">${escapeHtml(label)}</div>
      <div style="font-size:24px;font-weight:900;color:#0f172a;line-height:1.15;margin-top:3px;">${val}</div>
      ${sub ? `<div style="font-size:11px;color:#94a3b8;font-weight:600;margin-top:2px;">${escapeHtml(sub)}</div>` : ""}
    </div>`;

  const banner = `
    <div style="background:${tone.bg};border-left:5px solid ${tone.bd};border-radius:16px;padding:20px 22px;margin-bottom:18px;">
      <div style="font-size:22px;font-weight:900;color:${tone.fg};">${tone.icon} ${escapeHtml(s.readiness)}</div>
      <div style="font-size:13px;color:${tone.fg};opacity:.85;font-weight:600;margin-top:5px;">${escapeHtml(s.readinessNote)}</div>
      <div style="margin-top:14px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:800;color:${tone.fg};margin-bottom:5px;">
          <span>สินค้าที่ผลิตจริงและมีสูตรแล้ว</span><span>${s.producedWithBom}/${s.producedTotal} · ${s.coveragePct}%</span>
        </div>
        <div style="height:9px;background:rgba(255,255,255,.15);border-radius:9px;overflow:hidden;">
          <div style="height:100%;width:${s.coveragePct}%;background:${tone.bd};border-radius:9px;transition:width .4s;"></div>
        </div>
        <div style="font-size:11px;color:${tone.fg};opacity:.7;font-weight:600;margin-top:6px;">เกณฑ์ที่ควรถึงก่อนเริ่มเทียบยอดใช้จริง: 80%</div>
      </div>
    </div>`;

  const stats = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;">
      ${kpi("สินค้ามีสูตร", s.bomProductCount, `จากทะเบียน ${s.registeredTotal} ชนิด`)}
      ${kpi("วัตถุดิบในสูตร", s.bomMaterialCount, "ชนิดที่ถูกอ้างถึง")}
      ${kpi("จุดที่ต้องแก้", s.issueCount, s.issueCount ? "ดูรายละเอียดด้านล่าง" : "ไม่มี")}
    </div>`;

  const esc = v => escapeHtml(String(v ?? ""));

  const sections =
    _bhSection("🔴", "สินค้าที่ผลิตแล้ว แต่ยังไม่มีสูตร",
      "สำคัญที่สุด — ถ้าไม่มีสูตร ระบบไม่รู้ว่าควรใช้วัตถุดิบเท่าไร จึงเทียบไม่ได้เลย",
      res.missingBom,
      [ { label:"สินค้า", render:r => `<b>${esc(r.productName)}</b>` },
        { label:"บาร์โค้ด", render:r => `<span style="font-family:monospace;color:#64748b;">${esc(r.barcode)}</span>` },
        { label:"พบในใบสั่งผลิต", align:"right", render:r => `<b style="color:#dc2626;">${r.orderCount}</b> ครั้ง` } ],
      "สินค้าที่ผลิตทุกตัวมีสูตรครบแล้ว") +

    _bhSection("📏", "หน่วยในสูตรไม่ตรงกับหน่วยในคลัง",
      "ทำให้ตัวเลขผิดแบบเงียบๆ เช่น สูตรเขียน กก. แต่คลังนับเป็น กระสอบ",
      res.unitMismatch,
      [ { label:"วัตถุดิบ", render:r => `<b>${esc(r.materialName || r.materialSku)}</b>` },
        { label:"ในสูตรของ", render:r => esc(r.productName) },
        { label:"หน่วยในสูตร", align:"center", render:r => `<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:6px;font-weight:800;">${esc(r.bomUnit)}</span>` },
        { label:"หน่วยในคลัง", align:"center", render:r => `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:6px;font-weight:800;">${esc(r.stockUnit)}</span>` } ],
      "หน่วยตรงกันทั้งหมด") +

    _bhSection("❓", "สูตรอ้างวัตถุดิบที่ไม่มีในคลัง",
      "อาจลบวัตถุดิบไปแล้ว หรือพิมพ์ SKU ผิด — บรรทัดสูตรนี้จะคำนวณไม่ได้",
      res.orphanMaterial,
      [ { label:"SKU ในสูตร", render:r => `<span style="font-family:monospace;">${esc(r.materialSku)}</span>` },
        { label:"ชื่อในสูตร", render:r => esc(r.materialName) },
        { label:"ใช้ในสูตร", align:"right", render:r => `${r.usedIn} สินค้า` } ],
      "ทุก SKU ในสูตรมีอยู่จริงในคลัง") +

    _bhSection("⚠️", "บรรทัดสูตรที่จำนวนต่อหน่วยเป็น 0",
      "ตั้งค่าไว้ 0 = ระบบคิดว่าไม่ใช้วัตถุดิบตัวนี้เลย",
      res.badQtyPerUnit,
      [ { label:"สินค้า", render:r => esc(r.productName) },
        { label:"วัตถุดิบ", render:r => esc(r.materialName || r.materialSku) },
        { label:"ต่อหน่วย", align:"right", render:r => `<b style="color:#dc2626;">${r.qtyPerUnit}</b>` } ],
      "ทุกบรรทัดสูตรมีจำนวนต่อหน่วยแล้ว") +

    _bhSection("📦", "วัตถุดิบที่เบิกจริง แต่ไม่อยู่ในสูตรไหนเลย",
      "ไม่ได้แปลว่าผิด — อาจเป็นของใช้ทั่วไป (ถุงมือ น้ำยาล้าง) หรือสูตรยังไม่ได้ใส่",
      res.notInAnyBom,
      [ { label:"วัตถุดิบ", render:r => `<b>${esc(r.name)}</b>` },
        { label:"SKU", render:r => `<span style="font-family:monospace;color:#64748b;">${esc(r.sku)}</span>` },
        { label:"โรงงาน", align:"center", render:r => esc(r.module) },
        { label:"เบิก", align:"right", render:r => `${r.outCount} ครั้ง` },
        { label:"รวม", align:"right", render:r => `<b>${r.outQty}</b>` } ],
      "วัตถุดิบที่เบิกล่าสุดอยู่ในสูตรครบ") +

    _bhSection("🔗", "ประวัติการเบิกที่จับคู่กับวัตถุดิบไม่ได้",
      "ประวัติเก็บแค่ชื่อ ไม่มี SKU — ถ้าเปลี่ยนชื่อวัตถุดิบภายหลัง ประวัติเก่าจะอ้างกลับไม่ได้",
      res.unmatchedHistory || [],
      [ { label:"ชื่อในประวัติ", render:r => `<b>${esc(r.name)}</b>` },
        { label:"โรงงาน", align:"center", render:r => esc(r.module) },
        { label:"เบิก", align:"right", render:r => `${r.outCount} ครั้ง` },
        { label:"รวม", align:"right", render:r => `<b>${r.outQty}</b>` } ],
      "ประวัติล่าสุดจับคู่กับวัตถุดิบได้ครบ") +

    _bhSection("📅", "ยังไม่ได้ตั้งค่า \"ใช้ต่อวัน\"",
      "ไม่กระทบการเทียบสูตร แต่ทำให้คาดการณ์ของหมดไม่ได้",
      res.badDailyUsage,
      [ { label:"วัตถุดิบ", render:r => esc(r.name) },
        { label:"SKU", render:r => `<span style="font-family:monospace;color:#64748b;">${esc(r.sku)}</span>` },
        { label:"โรงงาน", align:"center", render:r => esc(r.module) } ],
      "ตั้งค่าใช้ต่อวันครบทุกรายการ");

  // ── ค้นหาย้อนกลับ: วัตถุดิบตัวนี้ใช้ในสินค้าอะไรบ้าง ──
  const whereUsed = `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;box-shadow:0 2px 6px rgba(0,0,0,.03);">
      <div style="font-size:15px;font-weight:900;color:#0f172a;margin-bottom:6px;">🔍 วัตถุดิบตัวนี้ใช้ในสินค้าอะไรบ้าง</div>
      <div style="font-size:12px;color:#64748b;font-weight:600;margin-bottom:10px;">พิมพ์ชื่อหรือ SKU เพื่อดูว่าอยู่ในสูตรของสินค้าใด</div>
      <input id="bhWhereInput" type="text" placeholder="เช่น น้ำตาล หรือ SQF-0001" oninput="bhRenderWhereUsed()"
        style="width:100%;padding:11px 14px;border:2px solid #e2e8f0;border-radius:12px;font-family:inherit;font-size:14px;font-weight:700;outline:none;box-sizing:border-box;">
      <div id="bhWhereResult" style="margin-top:12px;"></div>
    </div>`;

  document.getElementById("bomHealthContent").innerHTML = banner + stats + sections + whereUsed;
}

function bhRenderWhereUsed() {
  const out = document.getElementById("bhWhereResult");
  const q = (document.getElementById("bhWhereInput")?.value || "").trim().toLowerCase();
  if (!q) { out.innerHTML = ""; return; }
  const wu = (_bomHealth && _bomHealth.whereUsed) || {};
  const hits = Object.keys(wu).filter(sku => {
    if (sku.toLowerCase().includes(q)) return true;
    return (wu[sku][0] && String(wu[sku][0].name || "").toLowerCase().includes(q));
  }).slice(0, 8);

  if (!hits.length) { out.innerHTML = '<p style="color:#94a3b8;font-weight:700;font-size:13px;">ไม่พบวัตถุดิบนี้ในสูตรใดเลย</p>'; return; }

  out.innerHTML = hits.map(sku => {
    const nm = String(wu[sku][0].name || "").trim();
    const title = nm && nm !== sku ? nm : sku;
    const badge = (nm && nm !== sku) ? `<span style="font-family:monospace;font-size:11px;color:#94a3b8;font-weight:700;margin-left:6px;">${escapeHtml(sku)}</span>` : "";
    return `
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin-bottom:8px;">
      <div style="font-weight:900;color:#0f172a;font-size:14px;">${escapeHtml(title)}${badge}</div>
      <div style="margin-top:7px;display:flex;flex-direction:column;gap:4px;">
        ${wu[sku].map(u => `
          <div style="display:flex;justify-content:space-between;gap:10px;font-size:13px;border-bottom:1px dashed #f1f5f9;padding-bottom:3px;">
            <span style="color:#334155;font-weight:700;">${escapeHtml(u.productName)}</span>
            <span style="color:#0ea5e9;font-weight:800;white-space:nowrap;">${u.qtyPerUnit} ${escapeHtml(u.unit || "")}<span style="color:#94a3b8;font-weight:600;"> / ชิ้น</span></span>
          </div>`).join("")}
      </div>
    </div>`).join("");
}
