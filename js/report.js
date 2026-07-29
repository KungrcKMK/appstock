// ═════════════════════════════════════════════
// report.js — 📋 ตรวจสูตรการผลิต (BOM Health)
//   ตรวจว่าข้อมูลพร้อมเอาไปเทียบ "ควรใช้ vs ใช้จริง" หรือยัง
//   ทุกอย่างในหน้านี้ชี้ไปที่ "ข้อมูลที่ขาด" ไม่ใช่ตัวบุคคล
// ═════════════════════════════════════════════

let _bomHealth = null;

async function loadBomHealth() {
  const el = document.getElementById("bomHealthContent");
  if (!el) return;
  el.innerHTML = '<p class="sq-empty">⏳ กำลังตรวจข้อมูล...</p>';
  let res;
  try {
    res = await crCallServer("getBomHealth");
  } catch (e) {
    const cached = cacheGet("bom_health");
    if (cached) { _bomHealth = cached; renderBomHealth(cached); showToast("⏳ แสดงผลตรวจครั้งก่อน (เชื่อมต่อไม่ได้)", "warn", 4000); return; }
    el.innerHTML = `<p class="sq-empty" style="color:var(--sq-crit);font-weight:700;">❌ เชื่อมต่อไม่สำเร็จ</p>`;
    return;
  }
  if (!res || !res.ok) {
    el.innerHTML = `<p class="sq-empty" style="color:var(--sq-crit);font-weight:700;">❌ ${escapeHtml((res && res.message) || "โหลดไม่สำเร็จ")}</p>`;
    return;
  }
  _bomHealth = res;
  cacheSet("bom_health", res);
  renderBomHealth(res);
}

// ── ตารางย่อย: แสดงรายการที่ต้องแก้ หรือ ✅ ถ้าผ่าน ──
function _bhSection(icon, title, why, rows, cols, emptyMsg) {
  const n = rows.length;
  const align = c => c.align === "right" ? "n" : c.align === "center" ? "c" : "";
  const head = `
    <div class="sq-card-head">
      <span class="sq-card-title">${icon} ${escapeHtml(title)}</span>
      <span class="sq-chip ${n ? "crit" : "ok"}">${n ? "⚠️ " + n + " รายการ" : "✓ ผ่าน"}</span>
    </div>
    <div class="sq-card-body" style="padding-bottom:0;">
      <p class="sq-card-note" style="margin:0 0 10px;">${escapeHtml(why)}</p>
    </div>`;

  const body = n === 0
    ? `<div class="sq-card-body" style="padding-top:0;"><div class="sq-note">${escapeHtml(emptyMsg)}</div></div>`
    : `<div class="sq-tablewrap">
        <table class="sq-table">
          <thead><tr>
            ${cols.map(c => `<th class="${align(c)}">${escapeHtml(c.label)}</th>`).join("")}
          </tr></thead>
          <tbody>
            ${rows.slice(0, 50).map(r => `<tr>
              ${cols.map(c => `<td class="${align(c)}">${c.render(r)}</td>`).join("")}
            </tr>`).join("")}
          </tbody>
        </table>
        ${n > 50 ? `<p class="sq-card-note" style="padding:8px 12px;background:var(--sq-raised);margin:0;">…และอีก ${n - 50} รายการ</p>` : ""}
      </div>`;

  return `<div class="sq-card">${head}${body}</div>`;
}

function renderBomHealth(res) {
  const s = res.summary;
  // สีตามความพร้อม — ใช้ token เดียวกับทั้งระบบ
  const tone = { "พร้อม":          { chip:"ok",   bar:"var(--sq-accent)", icon:"✅" },
                 "เกือบพร้อม":     { chip:"warn", bar:"var(--sq-warn)",   icon:"⚠️" },
                 "ยังไม่พร้อม":    { chip:"crit", bar:"var(--sq-crit)",   icon:"🔴" },
                 "ยังไม่มีข้อมูล": { chip:"",     bar:"var(--sq-muted)",  icon:"📭" } }[s.readiness]
              || { chip:"", bar:"var(--sq-muted)", icon:"❔" };

  const banner = `
    <div class="sq-card">
      <div class="sq-card-head">
        <span class="sq-card-title">${tone.icon} ${escapeHtml(s.readiness)}</span>
        <span class="sq-chip ${tone.chip}">${s.coveragePct}% ของที่ผลิตจริงมีสูตรแล้ว</span>
      </div>
      <div class="sq-card-body">
        <p style="margin:0 0 12px;font-size:13px;color:var(--sq-ink2);">${escapeHtml(s.readinessNote)}</p>
        <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;color:var(--sq-muted);margin-bottom:4px;">
          <span>สินค้าที่ผลิตจริงและมีสูตรแล้ว</span>
          <span style="font-family:var(--sq-mono);">${s.producedWithBom} / ${s.producedTotal}</span>
        </div>
        <div class="sq-meter" style="height:7px;"><i style="width:${s.coveragePct}%;background:${tone.bar};"></i></div>
        <div class="sq-meter-note">เกณฑ์ที่ควรถึงก่อนเริ่มเทียบยอดใช้จริง 80%</div>
      </div>
    </div>`;

  const tile = (label, val, sub) => `
    <div class="sq-tile">
      <div class="sq-tile-label"><span class="sq-dot"></span>${escapeHtml(label)}</div>
      <div class="sq-tile-num">${val}</div>
      ${sub ? `<div class="sq-tile-note">${escapeHtml(sub)}</div>` : ""}
    </div>`;

  const stats = `
    <div class="sq-tiles">
      ${tile("สินค้ามีสูตร", s.bomProductCount, `จากทะเบียน ${s.registeredTotal} ชนิด`)}
      ${tile("วัตถุดิบในสูตร", s.bomMaterialCount, "ชนิดที่ถูกอ้างถึง")}
      ${tile("จุดที่ต้องแก้", s.issueCount, s.issueCount ? "ดูรายละเอียดด้านล่าง" : "ไม่มี")}
    </div>`;

  const esc = v => escapeHtml(String(v ?? ""));

  const sections =
    _bhSection("🔴", "สินค้าที่ผลิตแล้ว แต่ยังไม่มีสูตร",
      "สำคัญที่สุด — ถ้าไม่มีสูตร ระบบไม่รู้ว่าควรใช้วัตถุดิบเท่าไร จึงเทียบไม่ได้เลย",
      res.missingBom,
      [ { label:"สินค้า", render:r => `<span class="sq-name">${esc(r.productName)}</span>` },
        { label:"บาร์โค้ด", render:r => `<span class="sq-meta">${esc(r.barcode)}</span>` },
        { label:"พบในใบสั่งผลิต", align:"right", render:r => `<span class="sq-num" style="color:var(--sq-crit)">${r.orderCount}</span> ครั้ง` } ],
      "สินค้าที่ผลิตทุกตัวมีสูตรครบแล้ว") +

    _bhSection("📏", "หน่วยในสูตรไม่ตรงกับหน่วยในคลัง",
      "ทำให้ตัวเลขผิดแบบเงียบๆ เช่น สูตรเขียน กก. แต่คลังนับเป็น กระสอบ",
      res.unitMismatch,
      [ { label:"วัตถุดิบ", render:r => `<span class="sq-name">${esc(r.materialName || r.materialSku)}</span>` },
        { label:"ในสูตรของ", render:r => esc(r.productName) },
        { label:"หน่วยในสูตร", align:"center", render:r => `<span class="sq-chip crit">${esc(r.bomUnit)}</span>` },
        { label:"หน่วยในคลัง", align:"center", render:r => `<span class="sq-chip ok">${esc(r.stockUnit)}</span>` } ],
      "หน่วยตรงกันทั้งหมด") +

    _bhSection("❓", "สูตรอ้างวัตถุดิบที่ไม่มีในคลัง",
      "อาจลบวัตถุดิบไปแล้ว หรือพิมพ์ SKU ผิด — บรรทัดสูตรนี้จะคำนวณไม่ได้",
      res.orphanMaterial,
      [ { label:"SKU ในสูตร", render:r => `<span class="sq-meta">${esc(r.materialSku)}</span>` },
        { label:"ชื่อในสูตร", render:r => esc(r.materialName) },
        { label:"ใช้ในสูตร", align:"right", render:r => `${r.usedIn} สินค้า` } ],
      "ทุก SKU ในสูตรมีอยู่จริงในคลัง") +

    _bhSection("⚠️", "บรรทัดสูตรที่จำนวนต่อหน่วยเป็น 0",
      "ตั้งค่าไว้ 0 = ระบบคิดว่าไม่ใช้วัตถุดิบตัวนี้เลย",
      res.badQtyPerUnit,
      [ { label:"สินค้า", render:r => esc(r.productName) },
        { label:"วัตถุดิบ", render:r => esc(r.materialName || r.materialSku) },
        { label:"ต่อหน่วย", align:"right", render:r => `<span class="sq-num" style="color:var(--sq-crit)">${r.qtyPerUnit}</span>` } ],
      "ทุกบรรทัดสูตรมีจำนวนต่อหน่วยแล้ว") +

    _bhSection("📦", "วัตถุดิบที่เบิกจริง แต่ไม่อยู่ในสูตรไหนเลย",
      "ไม่ได้แปลว่าผิด — อาจเป็นของใช้ทั่วไป (ถุงมือ น้ำยาล้าง) หรือสูตรยังไม่ได้ใส่",
      res.notInAnyBom,
      [ { label:"วัตถุดิบ", render:r => `<span class="sq-name">${esc(r.name)}</span>` },
        { label:"SKU", render:r => `<span class="sq-meta">${esc(r.sku)}</span>` },
        { label:"โรงงาน", align:"center", render:r => esc(r.module) },
        { label:"เบิก", align:"right", render:r => `${r.outCount} ครั้ง` },
        { label:"รวม", align:"right", render:r => `<span class="sq-num">${r.outQty}</span>` } ],
      "วัตถุดิบที่เบิกล่าสุดอยู่ในสูตรครบ") +

    _bhSection("🔗", "ประวัติการเบิกที่จับคู่กับวัตถุดิบไม่ได้",
      "ประวัติเก็บแค่ชื่อ ไม่มี SKU — ถ้าเปลี่ยนชื่อวัตถุดิบภายหลัง ประวัติเก่าจะอ้างกลับไม่ได้",
      res.unmatchedHistory || [],
      [ { label:"ชื่อในประวัติ", render:r => `<span class="sq-name">${esc(r.name)}</span>` },
        { label:"โรงงาน", align:"center", render:r => esc(r.module) },
        { label:"เบิก", align:"right", render:r => `${r.outCount} ครั้ง` },
        { label:"รวม", align:"right", render:r => `<span class="sq-num">${r.outQty}</span>` } ],
      "ประวัติล่าสุดจับคู่กับวัตถุดิบได้ครบ") +

    _bhSection("📅", "ยังไม่ได้ตั้งค่า \"ใช้ต่อวัน\"",
      "ไม่กระทบการเทียบสูตร แต่ทำให้คาดการณ์ของหมดไม่ได้",
      res.badDailyUsage,
      [ { label:"วัตถุดิบ", render:r => esc(r.name) },
        { label:"SKU", render:r => `<span class="sq-meta">${esc(r.sku)}</span>` },
        { label:"โรงงาน", align:"center", render:r => esc(r.module) } ],
      "ตั้งค่าใช้ต่อวันครบทุกรายการ");

  // ── ค้นหาย้อนกลับ: วัตถุดิบตัวนี้ใช้ในสินค้าอะไรบ้าง ──
  const whereUsed = `
    <div class="sq-card">
      <div class="sq-card-head">
        <span class="sq-card-title">🔍 วัตถุดิบตัวนี้ใช้ในสินค้าอะไรบ้าง</span>
        <span class="sq-card-note">พิมพ์ชื่อหรือ SKU เพื่อดูว่าอยู่ในสูตรของสินค้าใด</span>
      </div>
      <div class="sq-card-body">
        <input id="bhWhereInput" type="text" class="sq-input" style="width:100%;"
               placeholder="เช่น น้ำตาล หรือ SQF-0001" oninput="bhRenderWhereUsed()">
        <div id="bhWhereResult" style="margin-top:10px;"></div>
      </div>
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

  if (!hits.length) { out.innerHTML = '<p class="sq-empty" style="padding:16px;">ไม่พบวัตถุดิบนี้ในสูตรใดเลย</p>'; return; }

  out.innerHTML = hits.map(sku => {
    const nm = String(wu[sku][0].name || "").trim();
    const title = nm && nm !== sku ? nm : sku;
    const badge = (nm && nm !== sku) ? `<span class="sq-meta" style="display:inline;margin-left:6px;">${escapeHtml(sku)}</span>` : "";
    return `
    <div style="border:1px solid var(--sq-line);border-radius:9px;padding:10px 12px;margin-bottom:7px;">
      <div class="sq-name">${escapeHtml(title)}${badge}</div>
      <div class="sq-list" style="margin-top:5px;">
        ${wu[sku].map(u => `
          <div class="sq-list-row">
            <span class="sq-list-name">${escapeHtml(u.productName)}</span>
            <span class="sq-num" style="color:var(--sq-accent);font-size:12.5px;">${u.qtyPerUnit} ${escapeHtml(u.unit || "")}<span class="sq-unit"> / ชิ้น</span></span>
          </div>`).join("")}
      </div>
    </div>`;
  }).join("");
}
