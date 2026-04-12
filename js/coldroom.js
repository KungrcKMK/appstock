// ══════════════════════════════════════════════════════
// 📖 BOM — สูตรการผลิต
// ══════════════════════════════════════════════════════
let _bomFactory        = "";
let _bomMatOptions     = [];
let _bomCurrentBarcode = null;
let _bomCurrentName    = null;
// _bomProductCache ถูกรวมเป็น crEditProductCache (โหลดครั้งเดียวตอน initColdroom)

// ① เลือกโรงงาน → โหลด material options + populate product dropdown
async function crBomSelectFactory(factory) {
  _bomFactory = factory;
  // highlight ปุ่ม
  ["SQF","MLM"].forEach(f => {
    const btn = document.getElementById("crBomBtn" + f);
    if (!btn) return;
    const active = f === factory;
    btn.style.background      = active ? (f==="SQF"?"#f59e0b":"#10b981") : "#f8fafc";
    btn.style.color           = active ? "#fff" : "#374151";
    btn.style.borderColor     = active ? (f==="SQF"?"#d97706":"#059669") : "#e2e8f0";
  });
  // โหลดวัตถุดิบของ factory นั้น
  showLoading("โหลดวัตถุดิบ " + factory + "...");
  const res = await fetch(GAS_URL + "?module=" + factory).then(r=>r.json()).finally(hideLoading);
  _bomMatOptions = res.status === "success" ? res.materials : [];
  // populate product dropdown — ใช้ crEditProductCache (โหลดครั้งเดียวตอน startup)
  if (!crEditProductCache.length) {
    const prodRes = await crCallServer("getColdRoomProducts");
    if (prodRes.ok) crEditProductCache = prodRes.products || [];
  }
  const sel = document.getElementById("crBomProductSel");
  sel.innerHTML = '<option value="">— เลือกสินค้า —</option>' +
    crEditProductCache.map(p => {
      const bc  = escapeHtml(String(p.Barcode     || p.barcode     || ""));
      const nm  = escapeHtml(String(p.ProductName || p.productName || p.name || ""));
      return `<option value="${bc}" data-name="${nm}">${nm} (${bc})</option>`;
    }).join("");
  sel.value = "";
  // reset section
  document.getElementById("crBomMatSection").style.display = "none";
  document.getElementById("crBomPlaceholder").style.display = "";
  document.getElementById("crBomMatBody").innerHTML = "";
  _bomCurrentBarcode = null;
  _bomCurrentName    = null;
}

// ② เลือกสินค้า → โหลด BOM ที่มีอยู่ (ถ้ามี)
async function crBomOnProductChange() {
  const sel = document.getElementById("crBomProductSel");
  const barcode = sel.value;
  if (!barcode) {
    document.getElementById("crBomMatSection").style.display = "none";
    document.getElementById("crBomPlaceholder").style.display = "";
    return;
  }
  if (!_bomFactory) { showToast("กรุณาเลือกโรงงานก่อน","warn"); sel.value = ""; return; }
  const name = sel.options[sel.selectedIndex]?.dataset?.name || barcode;
  _bomCurrentBarcode = barcode;
  _bomCurrentName    = name;
  document.getElementById("crBomPlaceholder").style.display = "none";
  document.getElementById("crBomMatSection").style.display  = "";
  document.getElementById("crBomMatBody").innerHTML = "";
  // โหลด BOM เดิม
  const res = await crCallServer("getBomForProduct", { barcode });
  const bom = res.ok ? res.bom : null;
  const badge = document.getElementById("crBomStatusBadge");
  if (bom && bom.materials && bom.materials.length > 0) {
    badge.textContent = "มี BOM อยู่แล้ว — กำลังแสดง";
    badge.style.background = "#dcfce7"; badge.style.color = "#166534";
    bom.materials.forEach(m => crBomAddRow(m));
  } else {
    badge.textContent = "ยังไม่มี BOM — เพิ่มวัตถุดิบได้เลย";
    badge.style.background = "#fef3c7"; badge.style.color = "#92400e";
  }
}

// ③ เพิ่ม row วัตถุดิบ
function crBomAddRow(preset = null) {
  const tbody = document.getElementById("crBomMatBody");
  const idx   = tbody.children.length + 1;
  const tr    = document.createElement("tr");
  tr.style.borderBottom = "1px dashed #e2e8f0";
  const opts  = _bomMatOptions.map(m =>
    `<option value="${escapeHtml(m.SKU)}" data-unit="${escapeHtml(m.Unit||"")}">${escapeHtml(m.Name)} (${escapeHtml(m.SKU)})</option>`
  ).join("");
  tr.innerHTML = `
    <td style="padding:8px 6px;color:#94a3b8;font-size:12px;font-weight:700;text-align:center;">${idx}</td>
    <td style="padding:8px;">
      <select class="bom-mat-select" onchange="crBomRowSyncUnit(this)"
        style="width:100%;padding:9px 8px;border-radius:8px;border:2px solid #e2e8f0;font-family:inherit;font-size:13px;">
        <option value="">— เลือกวัตถุดิบ —</option>${opts}
      </select>
    </td>
    <td style="padding:8px;">
      <input type="number" class="bom-qty-input" min="0" step="0.001" placeholder="0"
        style="width:100%;padding:9px 8px;border-radius:8px;border:2px solid #e2e8f0;text-align:right;font-weight:800;font-size:14px;box-sizing:border-box;">
    </td>
    <td style="padding:8px;">
      <input type="text" class="bom-unit-input" placeholder="หน่วย"
        style="width:100%;padding:9px 8px;border-radius:8px;border:2px solid #e2e8f0;font-size:12px;box-sizing:border-box;">
    </td>
    <td style="padding:8px;text-align:center;">
      <button onclick="this.closest('tr').remove()"
        style="background:#fee2e2;color:#dc2626;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:15px;line-height:1;">✕</button>
    </td>`;
  tbody.appendChild(tr);
  if (preset) {
    tr.querySelector(".bom-mat-select").value = preset.sku || "";
    tr.querySelector(".bom-qty-input").value  = preset.qtyPerUnit || "";
    tr.querySelector(".bom-unit-input").value = preset.unit || "";
  }
}

function crBomRowSyncUnit(sel) {
  const unit = sel.options[sel.selectedIndex]?.dataset?.unit || "";
  if (unit) sel.closest("tr").querySelector(".bom-unit-input").value = unit;
}

// บันทึก BOM
async function crSaveBom() {
  if (!_bomCurrentBarcode) return showToast("กรุณาเลือกสินค้า","warn");
  if (!_bomFactory)        return showToast("กรุณาเลือกโรงงาน","warn");
  const rows = document.querySelectorAll("#crBomMatBody tr");
  const materials = [];
  let hasError = false;
  rows.forEach(tr => {
    const sku  = tr.querySelector(".bom-mat-select").value;
    const qty  = parseFloat(tr.querySelector(".bom-qty-input").value);
    const unit = tr.querySelector(".bom-unit-input").value.trim();
    const selEl= tr.querySelector(".bom-mat-select");
    const name = selEl.options[selEl.selectedIndex]?.text?.split(" (")[0] || sku;
    if (!sku || isNaN(qty) || qty <= 0) { hasError = true; return; }
    materials.push({ sku, name, qtyPerUnit: qty, unit });
  });
  if (hasError) return showToast("กรุณากรอกวัตถุดิบและปริมาณให้ครบทุก row","warn");
  if (!materials.length) return showToast("กรุณาเพิ่มวัตถุดิบอย่างน้อย 1 รายการ","warn");
  const res = await crCallServer("saveBom", { barcode: _bomCurrentBarcode, name: _bomCurrentName, factory: _bomFactory, materials });
  if (res.ok) {
    showToast(`✅ บันทึก BOM สำเร็จ (${res.saved} รายการ)`, "success");
    const badge = document.getElementById("crBomStatusBadge");
    badge.textContent = `บันทึกแล้ว ${res.saved} รายการ`;
    badge.style.background = "#dcfce7"; badge.style.color = "#166534";
    crLoadBomList();
  } else {
    showToast(res.message || "บันทึกไม่สำเร็จ","error");
  }
}

// ลบ BOM
async function crDeleteBom() {
  if (!_bomCurrentBarcode) return showToast("ยังไม่ได้เลือกสินค้า","warn");
  if (!confirm(`ลบ BOM ทั้งหมดของ "${_bomCurrentName}"?`)) return;
  const res = await crCallServer("deleteBom", { barcode: _bomCurrentBarcode });
  if (res.ok) {
    showToast("ลบ BOM แล้ว","success");
    document.getElementById("crBomMatBody").innerHTML = "";
    const badge = document.getElementById("crBomStatusBadge");
    badge.textContent = "ยังไม่มี BOM"; badge.style.background = "#fef3c7"; badge.style.color = "#92400e";
    crLoadBomList();
  }
}

// รายการ BOM ทั้งหมด (card ล่าง)
async function crLoadBomList() {
  const listEl = document.getElementById("crBomProductList");
  listEl.innerHTML = '<p style="color:#94a3b8;text-align:center;font-weight:700;padding:20px 0;">⏳ กำลังโหลด...</p>';
  const res = await crCallServer("getBomList");
  const boms = res.ok ? (res.boms || []) : [];
  if (!boms.length) {
    listEl.innerHTML = '<p style="color:#94a3b8;text-align:center;font-weight:700;padding:20px 0;">ยังไม่มี BOM ที่กำหนดไว้</p>';
    return;
  }
  listEl.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;">` +
    boms.map(b => {
      const fc = b.factory === "SQF" ? "#f59e0b" : "#10b981";
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border:2px solid #e2e8f0;border-left:4px solid ${fc};border-radius:12px;background:#f8fafc;flex-wrap:wrap;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:800;font-size:14px;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(b.name)}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">${escapeHtml(b.barcode)} &nbsp;·&nbsp; ${b.materials.length} วัตถุดิบ</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <span style="background:${fc};color:#fff;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:800;">${escapeHtml(b.factory)}</span>
          <button class="cr-btn btn-light" onclick="crBomQuickLoad('${escapeHtml(b.barcode)}','${escapeHtml(b.factory)}','${escapeHtml(b.name.replace(/'/g,"\\'"))}')"
            style="padding:5px 12px;font-size:12px;">✏️ แก้ไข</button>
        </div>
      </div>`;
    }).join("") + `</div>`;
}

// คลิก "แก้ไข" จาก BOM list → switch factory + product แล้ว load
async function crBomQuickLoad(barcode, factory, name) {
  await crBomSelectFactory(factory);
  const sel = document.getElementById("crBomProductSel");
  sel.value = barcode;
  await crBomOnProductChange();
  document.querySelector("#cr-tab-bom .card").scrollIntoView({ behavior:"smooth", block:"start" });
}


// ═══════════════════════════════════════════════
// ❄️ COLD ROOM MODULE
// ═══════════════════════════════════════════════

let crCurrentProduct    = null;
let crScannerStream     = null;
let crScannerRunning    = false;
let crScannerLoopHandle = null;
let crBarcodeDetector   = null;
let crScannerMode       = "stock";
window.crAllLotsData    = [];

function $$cr(id) { return document.getElementById(id); }

function isoToDdmmyy(iso) {
  if (!iso) return "";
  const s = String(iso).trim();
  // ISO format: yyyy-MM-dd หรือ yyyy-MM-ddTHH:mm:ss...
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const p = s.split("-");
    return p[2].substring(0,2) + p[1] + p[0].substring(2,4);
  }
  // Full Date string จาก GAS / JS (มี space หรือ GMT)
  if (s.includes(" ") || s.includes("GMT") || s.includes("T")) {
    const d = new Date(s);
    if (!isNaN(d)) {
      const dd = String(d.getDate()).padStart(2,"0");
      const mm = String(d.getMonth()+1).padStart(2,"0");
      const yy = String(d.getFullYear()).slice(2);
      return dd + mm + yy;
    }
  }
  // DDMMYYYY (8 หลัก) → ตัดเหลือ DDMMYY
  if (/^\d{8}$/.test(s)) {
    return s.slice(0,2) + s.slice(2,4) + s.slice(6,8);
  }
  // DDMMYY (6 หลัก) → คงเดิม
  if (/^\d{6}$/.test(s)) return s;
  return s;
}

async function crCallServer(action, payload = {}) {
  showLoading("กำลังทำงาน...");
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        module: "COLDROOM", action, payload,
        deviceId:   currentDevice.id,
        deviceName: getDeviceInfo()
      })
    });
    return await res.json();
  } catch (e) {
    showToast("พบข้อผิดพลาด: " + e.message, "err");
    throw e;
  } finally {
    hideLoading();
  }
}

function crSwitchTab(tab) {
  // newproduct / editproduct / bom → เปลี่ยนไป manage แล้วเปิด sub-tab
  const manageMap = { newproduct: true, editproduct: true, bom: true };
  if (manageMap[tab]) { crSwitchTab("manage"); crManageSubTab(tab); return; }

  ["stock","balance","manage","workorder","submit","receive","report","settings"].forEach(n => {
    $$cr("cr-tab-" + n)?.classList.toggle("active", n === tab);
    $$cr("crTabBtn-" + n)?.classList.toggle("active", n === tab);
  });
  crStopScanner(false);
  if (tab === "workorder") crInitWorkOrder();
  if (tab === "submit")    crSiInitSubmit();
  if (tab === "receive")   crSiInitReceive();
}

function crManageSubTab(sub) {
  ["newproduct","editproduct","bom"].forEach(n => {
    const sec = document.getElementById("crMngSub-" + n);
    const btn = document.getElementById("crMngBtn-" + n);
    if (sec) sec.style.display = n === sub ? "" : "none";
    if (btn) {
      btn.style.background = n === sub ? "#6366f1" : "#f8fafc";
      btn.style.color      = n === sub ? "#fff"    : "#64748b";
    }
  });
  if (sub === "editproduct" && crEditProductCache.length === 0) crLoadEditProductList();
  if (sub === "bom") crLoadBomList();
}

// ══════════════════════════════════════
// 📋 ใบสั่งผลิต (Work Order) — Multi-SKU
// ══════════════════════════════════════
let crWoProducts = [];   // products list from GAS
let crWoRowIdx   = 0;    // row counter

function ddmmyyToIsoWo(str) {
  if (!str || str.length !== 6) return "";
  const dd=str.slice(0,2), mm=str.slice(2,4), yy=str.slice(4,6);
  return `${2000+parseInt(yy,10)}-${mm}-${dd}`;
}

async function crInitWorkOrder() {
  crWoLockButtons(); // ต้องตรวจสอบวัตถุดิบก่อนถึงจะบันทึก/พิมพ์ได้
  const today = new Date().toISOString().slice(0,10);
  $$cr("crWoDate").value      = today;
  $$cr("crWoCreatedBy").value = currentUser;
  const seq = String(Math.floor(Math.random()*900)+100);
  $$cr("crWoOrderId").value   = "WO-" + today.replace(/-/g,"") + "-" + seq;
  $$cr("crWoNote").value      = "";
  // โหลด products ถ้ายังไม่มี
  if (!crWoProducts.length) await crWoLoadProducts();
  // เพิ่มแถวแรกอัตโนมัติ
  $$cr("crWoItemsBody").innerHTML = "";
  crWoRowIdx = 0;
  crWoAddRow();
}

async function crWoLoadProducts() {
  // ใช้ cache จาก edit tab ถ้ามีแล้ว ไม่ต้องเรียก GAS ซ้ำ
  if (crEditProductCache.length > 0) { crWoProducts = crEditProductCache; return; }
  const res = await crCallServer("getColdRoomProducts", {});
  crWoProducts = (res.products || []);
  crEditProductCache = crWoProducts; // แชร์ cache
}

function crWoAddRow() {
  const idx = crWoRowIdx++;
  const options = crWoProducts.map(p => {
    // ใช้ unitsPerSet จริงจาก DB — ถ้าว่างหรือ 0 ให้เก็บเป็น 0 ไว้แยก "ยังไม่ตั้งค่า" ออกจาก "ตั้งค่า=1"
    const ups = p.UnitsPerSet ? Number(p.UnitsPerSet) : 0;
    return `<option value="${escapeAttr(p.Barcode)}" data-name="${escapeAttr(p.ProductName)}" data-unit="${escapeAttr(p.DefaultUnit||"")}" data-shelf="${escapeAttr(p.StandardShelfLifeDays||10)}" data-setname="${escapeAttr(p.SetName||"")}" data-ups="${ups}">${escapeHtml(p.ProductName)}</option>`;
  }).join("");
  const row = document.createElement("tr");
  row.id = `crWoRow-${idx}`;
  row.style.cssText = "border-bottom:1px solid #e2e8f0;";
  row.innerHTML = `
    <td style="padding:8px;text-align:center;font-size:12px;color:#94a3b8;font-weight:700;">${idx+1}</td>
    <td style="padding:6px 8px;overflow:hidden;">
      <select id="crWoSel-${idx}" onchange="crWoOnSelectProduct(${idx}); crWoLockButtons()"
        style="width:100%;padding:7px 8px;border:2px solid #e2e8f0;border-radius:8px;font-family:inherit;font-size:13px;font-weight:700;outline:none;background:#fff;overflow:hidden;text-overflow:ellipsis;">
        <option value="">— เลือกสินค้า —</option>
        ${options}
      </select>
    </td>
    <td style="padding:8px;">
      <input type="text" id="crWoMfg-${idx}" maxlength="6" inputmode="numeric" placeholder="DDMMYY"
        oninput="crWoCalcExpRow(${idx})"
        style="width:100%;padding:8px;border:2px solid #e2e8f0;border-radius:8px;text-align:center;font-size:14px;font-weight:900;font-family:monospace;outline:none;">
    </td>
    <td style="padding:8px;">
      <input type="text" id="crWoExp-${idx}" readonly
        style="width:100%;padding:8px;border:2px solid #f0fdf4;border-radius:8px;text-align:center;font-size:13px;font-weight:900;color:#059669;background:#f0fdf4;font-family:monospace;">
    </td>
    <td id="crWoQtyTd-${idx}" style="padding:6px 8px;">
      <div style="color:#94a3b8;font-size:12px;text-align:center;">← เลือกสินค้าก่อน</div>
    </td>
    <td style="padding:6px 8px;">
      <input type="text" id="crWoUnit-${idx}" readonly
        style="width:100%;padding:7px;border:2px solid #f1f5f9;border-radius:8px;font-size:13px;background:#f8fafc;color:#64748b;font-weight:700;">
    </td>
    <td style="padding:8px;text-align:center;">
      <button onclick="crWoRemoveRow(${idx})" style="background:#fee2e2;border:none;color:#dc2626;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:14px;font-weight:900;">✕</button>
    </td>`;
  $$cr("crWoItemsBody").appendChild(row);
}

function crWoRemoveRow(idx) {
  const row = document.getElementById(`crWoRow-${idx}`);
  if (row) row.remove();
}

function crWoOnSelectProduct(idx) {
  const sel     = document.getElementById(`crWoSel-${idx}`);
  const opt     = sel.options[sel.selectedIndex];
  const barcode = opt.value;
  const unit    = opt.getAttribute("data-unit")    || "";
  const setName = opt.getAttribute("data-setname") || "";
  const ups     = Number(opt.getAttribute("data-ups") || 0); // 0 = ยังไม่ตั้งค่า

  document.getElementById(`crWoUnit-${idx}`).value = unit;
  crWoCalcExpRow(idx);

  const td = document.getElementById(`crWoQtyTd-${idx}`);
  if (!td) return;

  if (!barcode) {
    td.innerHTML = `<div style="color:#94a3b8;font-size:12px;text-align:center;">← เลือกสินค้าก่อน</div>`;
    return;
  }

  if (ups > 1 || (ups === 1 && setName)) {
    // ✅ มีการตั้งค่า SetName/UPS ครบ → แสดงสมการชัดเจน
    const label = setName || "ชุด";
    td.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:4px;">
        <div style="display:flex;gap:4px;align-items:center;">
          <input type="number" id="crWoSets-${idx}" min="0" step="0.5" placeholder="${label}"
            oninput="crWoCalcQtyFromSets(${idx}); crWoLockButtons()"
            style="width:60px;padding:6px 8px;border:2px solid #c7d2fe;border-radius:8px;text-align:right;font-size:14px;font-weight:900;outline:none;background:#eff6ff;">
          <span style="font-size:11px;color:#6366f1;font-weight:700;white-space:nowrap;">${label}</span>
          <span style="font-size:12px;color:#94a3b8;">×</span>
          <span style="font-size:12px;color:#4338ca;font-weight:800;white-space:nowrap;">${ups}</span>
          <span style="font-size:11px;color:#64748b;">=</span>
          <input type="number" id="crWoQty-${idx}" min="0" placeholder="จำนวน"
            style="width:90px;padding:6px 8px;border:2px solid #bbf7d0;border-radius:8px;text-align:right;font-size:14px;font-weight:900;outline:none;background:#f0fdf4;color:#15803d;">
        </div>
        <div style="font-size:10px;color:#64748b;padding:0 2px;">1 ${label} = ${ups} ${unit}</div>
      </div>`;
  } else {
    // ⚠️ UPS = 0 หรือ 1 โดยไม่มี SetName = ยังไม่ตั้งค่า
    td.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:6px;">
        <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:5px 9px;font-size:11px;color:#92400e;display:flex;align-items:center;gap:6px;">
          <span>⚠️ ยังไม่ตั้งค่า ชุด/UPS</span>
          <button onclick="crSwitchTab('editproduct');crOpenEditProduct('${escapeJs(barcode)}')"
            style="background:#f59e0b;color:#fff;border:none;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:800;cursor:pointer;">แก้ไข</button>
        </div>
        <div style="display:flex;gap:4px;align-items:center;">
          <input type="number" id="crWoQty-${idx}" min="1" placeholder="จำนวน${unit ? ' ('+unit+')' : ''}"
            style="width:100%;padding:8px;border:2px solid #fcd34d;border-radius:8px;text-align:right;font-size:14px;font-weight:900;outline:none;background:#fffbeb;">
        </div>
      </div>`;
  }
}

function crWoCalcQtyFromSets(idx) {
  const sel  = document.getElementById(`crWoSel-${idx}`);
  const opt  = sel?.options[sel.selectedIndex];
  const ups  = Number(opt?.getAttribute("data-ups") || 0);
  const sets = Number(document.getElementById(`crWoSets-${idx}`)?.value || 0);
  const qtyEl = document.getElementById(`crWoQty-${idx}`);
  if (!qtyEl || ups <= 0 || sets <= 0) return;
  // คำนวณ: ชุด × UPS — ไม่ round ถ้าผลเป็นทศนิยมที่สมเหตุสมผล (เช่น 20.5 ชุด × 10 = 205)
  const result = sets * ups;
  qtyEl.value = Number.isInteger(result) ? result : result.toFixed(2);
  // แสดงสูตรใต้ช่อง
  const unit    = opt?.getAttribute("data-unit")    || "";
  const setName = opt?.getAttribute("data-setname") || "ชุด";
  const infEl = document.getElementById(`crWoCalcInfo-${idx}`);
  if (infEl) infEl.textContent = `${sets} ${setName} × ${ups} = ${qtyEl.value} ${unit}`;
}

function crWoCalcExpRow(idx) {
  const sel   = document.getElementById(`crWoSel-${idx}`);
  const opt   = sel?.options[sel.selectedIndex];
  const shelf = Number(opt?.getAttribute("data-shelf") || 10);
  const mfg   = (document.getElementById(`crWoMfg-${idx}`)?.value || "").trim();
  const expEl = document.getElementById(`crWoExp-${idx}`);
  if (mfg.length !== 6) { if(expEl) expEl.value=""; return; }
  const mfgIso  = ddmmyyToIsoWo(mfg); if(!mfgIso) return;
  const expDate = new Date(mfgIso);
  expDate.setDate(expDate.getDate() + shelf);
  const dd=String(expDate.getDate()).padStart(2,"0");
  const mm=String(expDate.getMonth()+1).padStart(2,"0");
  const yy=String(expDate.getFullYear()).slice(2);
  if(expEl) expEl.value = dd+mm+yy;
}

function crWoGetItems() {
  const items = [];
  document.querySelectorAll("[id^='crWoRow-']").forEach(row => {
    const idx  = row.id.replace("crWoRow-","");
    const sel  = document.getElementById(`crWoSel-${idx}`);
    const opt  = sel?.options[sel.selectedIndex];
    const barcode = sel?.value || "";
    const name    = opt?.getAttribute("data-name") || "";
    const unit    = document.getElementById(`crWoUnit-${idx}`)?.value || "";
    const mfg     = (document.getElementById(`crWoMfg-${idx}`)?.value || "").trim();
    const exp     = document.getElementById(`crWoExp-${idx}`)?.value || "";
    const qty     = Number(document.getElementById(`crWoQty-${idx}`)?.value || 0);
    const sets    = Number(document.getElementById(`crWoSets-${idx}`)?.value || 0);  // อาจไม่มีถ้า UPS ไม่ได้ตั้งค่า
    const ups     = Number(opt?.getAttribute("data-ups") || 0);
    const setName = opt?.getAttribute("data-setname") || "";
    // validation: qty ต้องมี, mfg 6 หลัก, มีชื่อสินค้า
    if (name && mfg.length===6 && qty>0) {
      // ตรวจสอบ: ถ้า UPS ตั้งค่าแล้ว แต่ qty ≠ sets×ups → อาจมีการแก้มือ → ยอมรับค่า qty ที่ user กรอก
      items.push({ barcode, name, unit, mfg, exp, qty, sets: sets||0, unitsPerSet: ups||1, setName });
    }
  });
  return items;
}

function crClearWorkOrder() {
  crInitWorkOrder();
}

function crWoParseItems(raw) {
  if (!raw) return [];
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch(e) { return []; }
}

function crPrintWorkOrder() {
  const orderId = $$cr("crWoOrderId").value;
  const date    = $$cr("crWoDate").value;
  const note    = $$cr("crWoNote").value;
  const items   = crWoGetItems();
  crOpenWorkOrderPrint({ OrderID:orderId, Date:date, Items:items, Note:note, CreatedBy:currentUser });
}

async function crPrintActualReport(o) {
  const items = crWoParseItems(o.Items);
  if (!items.length) { showToast("ไม่พบรายการสินค้าในใบสั่งผลิตนี้","warn"); return; }
  showLoading("กำลังโหลดยอดจริง...");
  // ดึงยอดจริงแต่ละ SKU
  const rows = [];
  for (const item of items) {
    const res = await crCallServer("getProductAndBalances", { barcode: item.barcode || item.name });
    const mfgIso  = ddmmyyToIsoWo(item.mfg) || item.mfg || "";
    let actual = 0;
    if (res.found && res.balances) {
      const lot = res.balances.find(b => (b.MFG||"").startsWith(mfgIso.slice(0,10)));
      actual = lot ? Number(lot.Qty||0) : 0;
    }
    rows.push({ ...item, actual });
  }
  hideLoading();
  const dateStr   = o.Date ? new Date(o.Date).toLocaleDateString("th-TH",{year:"numeric",month:"long",day:"numeric"}) : "-";
  const printDate = new Date().toLocaleDateString("th-TH",{year:"numeric",month:"long",day:"numeric"});
  const totalPlan   = rows.reduce((s,r)=>s+Number(r.qty||0),0);
  const totalActual = rows.reduce((s,r)=>s+r.actual,0);
  const totalDiff   = totalActual - totalPlan;

  const tableRows = rows.map((r,i) => {
    const planned = Number(r.qty||0);
    const actual  = r.actual;
    const diff    = actual - planned;
    const diffSign = diff>=0?"+":"";
    const diffColor = diff>=0?"#059669":"#dc2626";
    const mfgFmt  = isoToDdmmyy(ddmmyyToIsoWo(r.mfg)||r.mfg)||r.mfg||"-";
    const expFmt  = isoToDdmmyy(ddmmyyToIsoWo(r.exp)||r.exp)||r.exp||"-";
    const status  = diff>=0
      ? `<span style="color:#059669;font-weight:700;">✅ ตามแผน</span>`
      : `<span style="color:#dc2626;font-weight:700;">⚠️ ขาด ${Math.abs(diff).toLocaleString()}</span>`;
    return `<tr style="background:${i%2===0?"#fff":"#f8fafc"}">
      <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;">${i+1}</td>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;font-weight:700;">${escapeHtml(r.name||"-")}</td>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:center;font-weight:900;color:#6366f1;">${mfgFmt}</td>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:center;color:#059669;">${expFmt}</td>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;font-weight:900;font-size:16px;color:#3b82f6;">${planned.toLocaleString()}</td>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;font-weight:900;font-size:16px;color:#16a34a;">${actual.toLocaleString()}</td>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;font-weight:900;font-size:16px;color:${diffColor};">${diffSign}${diff.toLocaleString()}</td>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;">${escapeHtml(r.unit||"-")}</td>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:center;">${status}</td>
    </tr>`;
  }).join("");

  const overallDiffColor = totalDiff>=0?"#059669":"#dc2626";
  const w = window.open("","","width=1050,height=720");
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
  <title>รายงานยอดผลิตจริง ${o.OrderID}</title>
  <style>
    body{font-family:'Sarabun',sans-serif;color:#1e293b;padding:32px 40px;font-size:14px;}
    .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e293b;padding-bottom:14px;margin-bottom:22px;}
    h1{font-size:24px;font-weight:900;margin:0 0 4px;} .sub{font-size:12px;color:#64748b;}
    .summary{display:flex;gap:16px;margin-bottom:22px;}
    .sum-card{flex:1;border-radius:10px;padding:16px 20px;text-align:center;}
    .sum-card .n{font-size:32px;font-weight:900;line-height:1;}
    .sum-card .l{font-size:11px;font-weight:700;text-transform:uppercase;margin-top:5px;opacity:.7;}
    .plan-c{background:#eff6ff;border:2px solid #3b82f6;} .plan-c .n{color:#3b82f6;}
    .act-c{background:#f0fdf4;border:2px solid #22c55e;} .act-c .n{color:#16a34a;}
    .dif-c{background:#f8fafc;border:2px solid #64748b;} .dif-c .n{color:${overallDiffColor};}
    .status-bar{padding:12px 18px;border-radius:8px;font-weight:900;font-size:14px;text-align:center;margin-bottom:20px;}
    .sign{display:flex;gap:40px;margin-top:40px;}
    .sign-box{flex:1;text-align:center;border-top:2px solid #94a3b8;padding-top:8px;font-size:11px;color:#64748b;}
    .footer{margin-top:18px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:10px;}
    @media print{body{padding:14px 22px;} .no-print{display:none;}}
  </style></head><body>
  <div class="hd">
    <div><h1>📊 รายงานยอดผลิตจริง</h1>
      <div class="sub">อ้างอิงใบสั่งผลิต: <b>${escapeHtml(o.OrderID||"-")}</b> &nbsp;|&nbsp; ❄️ คลังสินค้า SQF</div>
      <div class="sub">วันที่สั่งผลิต: <b>${dateStr}</b> &nbsp;|&nbsp; ผู้สั่ง: <b>${escapeHtml(o.CreatedBy||"-")}</b></div>
    </div>
    <div style="text-align:right;">
      <div class="sub">วันที่พิมพ์: <b>${printDate}</b> &nbsp;|&nbsp; ผู้พิมพ์: <b>${currentUser}</b></div>
      <button class="no-print" onclick="window.print()" style="margin-top:8px;background:#0f766e;color:#fff;border:none;padding:8px 20px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">🖨️ พิมพ์</button>
    </div>
  </div>
  <div class="summary">
    <div class="sum-card plan-c"><div class="n">${totalPlan.toLocaleString()}</div><div class="l">📋 สั่งผลิต (แผน)</div></div>
    <div class="sum-card act-c"><div class="n">${totalActual.toLocaleString()}</div><div class="l">✅ ผลิตได้จริง</div></div>
    <div class="sum-card dif-c"><div class="n" style="color:${overallDiffColor};">${totalDiff>=0?"+":""}${totalDiff.toLocaleString()}</div><div class="l">📐 ผลต่าง (จำนวน)</div></div>
  </div>
  <div class="status-bar" style="background:${totalDiff>=0?"#f0fdf4":"#fef2f2"};border:2px solid ${totalDiff>=0?"#22c55e":"#ef4444"};color:${totalDiff>=0?"#16a34a":"#dc2626"};">
    ${totalDiff>=0?"✅ ผลิตได้ตามเป้าหมายโดยรวม":"⚠️ ผลิตได้ต่ำกว่าแผนโดยรวม — ตรวจสอบสาเหตุ"}
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead><tr style="background:#1e293b;color:#fff;font-size:11px;">
      <th style="padding:9px 12px;text-align:center;width:30px">#</th>
      <th style="padding:9px 12px;text-align:left;">ชื่อสินค้า</th>
      <th style="padding:9px 12px;text-align:center;width:80px">MFG</th>
      <th style="padding:9px 12px;text-align:center;width:80px">EXP</th>
      <th style="padding:9px 12px;text-align:right;width:90px">📋 สั่งผลิต</th>
      <th style="padding:9px 12px;text-align:right;width:90px">✅ ผลิตจริง</th>
      <th style="padding:9px 12px;text-align:right;width:90px">📐 ผลต่าง</th>
      <th style="padding:9px 12px;text-align:left;width:55px">หน่วย</th>
      <th style="padding:9px 12px;text-align:center;width:100px">สถานะ</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
    <tfoot><tr style="background:#f1f5f9;font-weight:900;font-size:14px;">
      <td colspan="4" style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;">รวม</td>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;color:#3b82f6;">${totalPlan.toLocaleString()}</td>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;color:#16a34a;">${totalActual.toLocaleString()}</td>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;color:${overallDiffColor};">${totalDiff>=0?"+":""}${totalDiff.toLocaleString()}</td>
      <td colspan="2" style="padding:10px 12px;border:1px solid #e2e8f0;"></td>
    </tfoot>
  </table>
  ${o.Note ? `<div style="background:#fef9c3;border-left:5px solid #eab308;padding:10px 14px;border-radius:6px;margin:16px 0;font-size:12px;">💬 <b>หมายเหตุ:</b> ${escapeHtml(o.Note)}</div>` : ""}
  <div class="sign">
    <div class="sign-box">ผู้จัดทำรายงาน<br><br>( ${currentUser} )</div>
    <div class="sign-box">ผู้ควบคุมการผลิต<br><br>( .......................... )</div>
    <div class="sign-box">QC / ผู้อนุมัติ<br><br>( .......................... )</div>
  </div>
  <div class="footer">พิมพ์โดยระบบจัดการสต๊อก SQF & MLM &nbsp;|&nbsp; ${new Date().toLocaleString("th-TH")}</div>
  </body></html>`);
  w.document.close();
}

function crOpenWorkOrderPrint(o) {
  const items   = crWoParseItems(o.Items);
  const dateStr = o.Date ? new Date(o.Date).toLocaleDateString("th-TH",{year:"numeric",month:"long",day:"numeric"}) : "-";

  // ตรวจว่ามีรายการที่ใช้ ชุด/UPS บ้างมั้ย
  const hasSetItems = items.some(it => Number(it.sets||0) > 0 && it.setName);

  const itemRows = items.map((item,i) => {
    const mfgFmt = isoToDdmmyy(ddmmyyToIsoWo(item.mfg)||item.mfg) || item.mfg || "-";
    const expFmt = isoToDdmmyy(ddmmyyToIsoWo(item.exp)||item.exp) || item.exp || "-";
    const qty    = Number(item.qty || 0);
    const sets   = Number(item.sets || 0);
    const ups    = Number(item.unitsPerSet || 1);
    const sName  = item.setName || "";
    const unit   = item.unit || "";

    // แสดงจำนวน: ถ้ามีชุด → แสดงทั้ง 2 บรรทัด; ถ้าไม่มี → แสดงแค่ qty
    const qtyCell = (sets > 0 && sName)
      ? `<div style="font-size:15px;font-weight:900;color:#6366f1;">${sets.toLocaleString()} ${escapeHtml(sName)}</div>
         <div style="font-size:11px;color:#94a3b8;margin:2px 0;">× ${ups} ${escapeHtml(unit)}/ชุด</div>
         <div style="font-size:18px;font-weight:900;color:#1e293b;border-top:1px dashed #e2e8f0;margin-top:4px;padding-top:4px;">= ${qty.toLocaleString()} <span style="font-size:12px;font-weight:400;color:#64748b;">${escapeHtml(unit)}</span></div>`
      : `<div style="font-size:18px;font-weight:900;">${qty.toLocaleString()} <span style="font-size:12px;font-weight:400;color:#64748b;">${escapeHtml(unit)}</span></div>`;

    return `<tr style="background:${i%2===0?"#fff":"#f8fafc"}">
      <td style="padding:10px 14px;border:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;">${i+1}</td>
      <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:700;font-size:14px;">${escapeHtml(item.name||"-")}</td>
      <td style="padding:10px 14px;border:1px solid #e2e8f0;text-align:center;font-weight:900;font-size:16px;color:#6366f1;letter-spacing:1px;">${mfgFmt}</td>
      <td style="padding:10px 14px;border:1px solid #e2e8f0;text-align:center;font-weight:900;font-size:16px;color:#059669;letter-spacing:1px;">${expFmt}</td>
      <td style="padding:10px 14px;border:1px solid #e2e8f0;text-align:right;vertical-align:middle;">${qtyCell}</td>
      <td style="padding:10px 14px;border:1px solid #e2e8f0;"></td>
    </tr>`;
  }).join("");

  const totalQty  = items.reduce((s,i)=>s+Number(i.qty||0),0);
  // สรุปชุดแยกตาม setName (เพราะแต่ละสินค้าอาจมี setName ต่างกัน)
  const setsMap = {};
  items.forEach(it => {
    const sets = Number(it.sets||0); const sn = it.setName||"";
    if (sets>0 && sn) setsMap[sn] = (setsMap[sn]||0) + sets;
  });
  const setsSummary = Object.entries(setsMap).map(([n,v])=>`${v.toLocaleString()} ${n}`).join(" + ");

  const w = window.open("","","width=1000,height=700");
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
  <title>ใบสั่งผลิต ${o.OrderID}</title>
  <style>
    body{font-family:'Sarabun',sans-serif;color:#1e293b;padding:36px 48px;font-size:14px;}
    .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e293b;padding-bottom:16px;margin-bottom:24px;}
    h1{font-size:26px;font-weight:900;margin:0 0 4px;}
    .sub{font-size:12px;color:#64748b;}
    .note-box{background:#fef9c3;border-left:5px solid #eab308;padding:12px 16px;border-radius:6px;margin:16px 0;font-size:13px;}
    .total-bar{display:flex;gap:16px;margin:12px 0;flex-wrap:wrap;}
    .total-card{padding:10px 18px;border-radius:10px;border:2px solid;}
    .tc-sets{border-color:#c7d2fe;background:#eff6ff;color:#4338ca;}
    .tc-qty {border-color:#bbf7d0;background:#f0fdf4;color:#15803d;}
    .tc-label{font-size:10px;font-weight:700;text-transform:uppercase;opacity:.8;margin-bottom:4px;}
    .tc-value{font-size:20px;font-weight:900;}
    .sign{display:flex;gap:48px;margin-top:48px;}
    .sign-box{flex:1;text-align:center;border-top:2px solid #94a3b8;padding-top:8px;font-size:11px;color:#64748b;}
    .footer{margin-top:20px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:10px;}
    @media print{body{padding:16px 24px;} .no-print{display:none;}}
  </style></head><body>
  <div class="hd">
    <div>
      <h1>📋 ใบสั่งผลิต</h1>
      <div class="sub">❄️ คลังสินค้า SQF — สุพรรณคิวฟู้ดส์</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:22px;font-weight:900;color:#6366f1;">${escapeHtml(o.OrderID||"-")}</div>
      <div class="sub">วันที่: <b>${dateStr}</b> &nbsp;|&nbsp; ผู้สั่ง: <b>${escapeHtml(o.CreatedBy||"-")}</b></div>
      <button class="no-print" onclick="window.print()" style="margin-top:8px;background:#1e293b;color:#fff;border:none;padding:8px 20px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">🖨️ พิมพ์</button>
    </div>
  </div>
  ${setsSummary ? `<div class="total-bar">
    <div class="total-card tc-sets"><div class="tc-label">📦 สั่งผลิต (ชุด)</div><div class="tc-value">${setsSummary}</div></div>
    <div class="total-card tc-qty" ><div class="tc-label">🔢 รวมทั้งหมด (หน่วย)</div><div class="tc-value">${totalQty.toLocaleString()}</div></div>
  </div>` : ""}
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <thead><tr style="background:#1e293b;color:#fff;font-size:12px;">
      <th style="padding:10px 14px;text-align:center;width:32px">#</th>
      <th style="padding:10px 14px;text-align:left;">ชื่อสินค้า</th>
      <th style="padding:10px 14px;text-align:center;width:90px">MFG</th>
      <th style="padding:10px 14px;text-align:center;width:90px">EXP</th>
      <th style="padding:10px 14px;text-align:right;width:150px">จำนวน (ชุด → หน่วย)</th>
      <th style="padding:10px 14px;text-align:left;width:120px">หมายเหตุ</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
    <tfoot><tr style="background:#f1f5f9;font-weight:900;">
      <td colspan="4" style="padding:10px 14px;border:1px solid #e2e8f0;text-align:right;">รวมทั้งหมด</td>
      <td style="padding:10px 14px;border:1px solid #e2e8f0;text-align:right;">
        ${setsSummary ? `<div style="font-size:14px;color:#6366f1;font-weight:700;">${setsSummary}</div>` : ""}
        <div style="font-size:20px;color:#15803d;">${totalQty.toLocaleString()}</div>
      </td>
      <td style="padding:10px 14px;border:1px solid #e2e8f0;"></td>
    </tr></tfoot>
  </table>
  ${o.Note ? `<div class="note-box">💬 <b>หมายเหตุ:</b> ${escapeHtml(o.Note)}</div>` : ""}
  <div class="sign">
    <div class="sign-box">ผู้สั่งผลิต<br><br>( ${escapeHtml(o.CreatedBy||"...")} )</div>
    <div class="sign-box">ผู้ควบคุมการผลิต<br><br>( .......................... )</div>
    <div class="sign-box">QC ตรวจรับ<br><br>( .......................... )</div>
  </div>
  <div class="footer">พิมพ์โดยระบบจัดการสต๊อก SQF & MLM &nbsp;|&nbsp; ${new Date().toLocaleString("th-TH")}</div>
  </body></html>`);
  w.document.close();
}

function crWoUnlockButtons() {
  const wrap = document.getElementById("crWoActionBtns");
  if (wrap) wrap.style.display = "flex";
}
function crWoLockButtons() {
  const wrap = document.getElementById("crWoActionBtns");
  if (wrap) wrap.style.display = "none";
}

async function crCheckBomMaterials() {
  const resultEl = document.getElementById("crWoBomResult");
  const rows = document.querySelectorAll("#crWoItemsBody tr");
  const items = [];
  rows.forEach(tr => {
    const sel     = tr.querySelector("select");
    const barcode = sel?.value || "";
    const inputs  = tr.querySelectorAll("input[type='number']");
    const qty     = inputs.length >= 2 ? parseFloat(inputs[1].value) || 0 : 0;
    if (barcode && qty > 0) items.push({ barcode, produceQty: qty });
  });
  if (!items.length) {
    resultEl.style.display = "";
    resultEl.innerHTML = `<div style="background:#fff3cd;border:2px solid #fde68a;border-radius:12px;padding:12px 16px;font-size:13px;font-weight:700;color:#92400e;">⚠️ กรุณาเพิ่มสินค้าและระบุจำนวนก่อน</div>`;
    crWoLockButtons();
    return;
  }
  resultEl.style.display = "";
  resultEl.innerHTML = `<div style="background:#f1f5f9;border-radius:12px;padding:14px;font-size:13px;color:#64748b;font-weight:700;text-align:center;">⏳ กำลังคำนวณวัตถุดิบ...</div>`;
  const res = await crCallServer("calcWorkOrderMaterials", { items });
  if (!res.ok) {
    resultEl.innerHTML = `<div style="background:#fee2e2;border:2px solid #fca5a5;border-radius:12px;padding:12px 16px;font-size:13px;font-weight:700;color:#991b1b;">❌ ${escapeHtml(res.message||"เกิดข้อผิดพลาด")}</div>`;
    return;
  }
  const matsByFactory = res.materials || {};
  const noBom = res.noBom || [];
  const hasShortage = Object.values(matsByFactory).some(mats => mats.some(m => !m.sufficient));

  let html = `<div style="border:2px solid ${hasShortage?"#fca5a5":"#86efac"};border-radius:16px;overflow:hidden;">
    <div style="background:${hasShortage?"#fee2e2":"#dcfce7"};padding:12px 16px;font-size:14px;font-weight:900;color:${hasShortage?"#991b1b":"#166534"};">
      ${hasShortage?"⚠️ มีวัตถุดิบไม่เพียงพอ — ตรวจสอบด้านล่าง":"✅ วัตถุดิบเพียงพอทั้งหมด"}
    </div>`;

  Object.entries(matsByFactory).forEach(([fact, mats]) => {
    html += `<div style="padding:14px 16px;background:#fff;">
      <div style="font-size:12px;font-weight:800;color:#475569;margin-bottom:10px;">🏭 ${escapeHtml(fact)}</div>
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:480px;">
        <thead><tr style="background:#f1f5f9;color:#475569;font-size:11px;font-weight:800;">
          <th style="padding:8px 10px;text-align:left;">วัตถุดิบ</th>
          <th style="padding:8px 10px;text-align:right;">ต้องใช้</th>
          <th style="padding:8px 10px;text-align:right;">มีอยู่</th>
          <th style="padding:8px 10px;text-align:right;">คงเหลือ</th>
          <th style="padding:8px 10px;text-align:center;">ใช้ได้อีก</th>
          <th style="padding:8px 10px;text-align:center;">สถานะ</th>
        </tr></thead>
        <tbody>${mats.map(m => {
          const ok  = m.sufficient;
          const dc  = m.daysAfter===null?"#94a3b8":m.daysAfter<=7?"#dc2626":m.daysAfter<=14?"#ea580c":m.daysAfter<=30?"#f59e0b":"#059669";
          const dayBadge = m.daysAfter===null ? `<span style="color:#94a3b8;">—</span>`
            : `<span style="background:${dc};color:#fff;border-radius:999px;padding:2px 8px;font-weight:800;">${m.daysAfter} วัน</span>`;
          return `<tr style="border-top:1px dashed #f1f5f9;background:${ok?"#fff":"#fff5f5"};">
            <td style="padding:8px 10px;font-weight:700;color:#334155;">${escapeHtml(m.name)}</td>
            <td style="padding:8px 10px;text-align:right;font-weight:700;color:#6366f1;">${m.needed.toLocaleString()} ${escapeHtml(m.unit)}</td>
            <td style="padding:8px 10px;text-align:right;color:#334155;">${m.currentQty.toLocaleString()} ${escapeHtml(m.unit)}</td>
            <td style="padding:8px 10px;text-align:right;font-weight:900;color:${ok?"#059669":"#dc2626"};">${m.remaining.toLocaleString()} ${escapeHtml(m.unit)}</td>
            <td style="padding:8px 10px;text-align:center;">${dayBadge}</td>
            <td style="padding:8px 10px;text-align:center;">${ok
              ? `<span style="background:#dcfce7;color:#166534;border-radius:999px;padding:2px 9px;font-weight:800;font-size:11px;">✅ พอ</span>`
              : `<span style="background:#fee2e2;color:#991b1b;border-radius:999px;padding:2px 9px;font-weight:800;font-size:11px;">❌ ขาด ${Math.abs(m.remaining).toLocaleString()}</span>`}
            </td>
          </tr>`;
        }).join("")}</tbody>
      </table></div></div>`;
  });

  if (noBom.length > 0) {
    html += `<div style="background:#fff7ed;padding:10px 16px;font-size:12px;font-weight:700;color:#92400e;border-top:1px solid #fed7aa;">
      📋 ไม่พบ BOM: ${noBom.map(b=>escapeHtml(b)).join(", ")} — กรุณากำหนดที่แท็บ 📖 สูตร BOM
    </div>`;
  }
  if (!Object.keys(matsByFactory).length && !noBom.length) {
    html += `<div style="padding:16px;text-align:center;font-size:13px;color:#94a3b8;font-weight:700;">ไม่พบ BOM สำหรับสินค้าที่เลือก</div>`;
  }
  html += `</div>`;
  resultEl.innerHTML = html;
  // unlock ปุ่ม บันทึก + พิมพ์ หลังตรวจสอบสำเร็จ
  crWoUnlockButtons();
}

// ══════════════════════════════════════
// 📥 รับสินค้าตรง (Direct Stock In)
// ══════════════════════════════════════
// crEditProductCache ถูกรวมเป็น crEditProductCache (โหลดครั้งเดียวตอน startup)
let _siRowIdx = 0;

async function crSiInitSubmit() {
  if (!crEditProductCache.length) {
    const res = await crCallServer("getColdRoomProducts", {});
    if (res.ok) crEditProductCache = res.products || [];
  }
  if (!document.querySelector(".cr-si-row")) crSiAddRow();
}

async function crSiInitReceive() {
  crSiLoadReviewList("รอตรวจยอด");
}

function crSiAddRow() {
  const idx = _siRowIdx++;
  const opts = crEditProductCache.map(p => {
    const bc = escapeHtml(String(p.Barcode || ""));
    const nm = escapeHtml(String(p.ProductName || ""));
    return `<option value="${bc}" data-name="${nm}" data-unit="${escapeHtml(String(p.DefaultUnit||""))}">${nm}</option>`;
  }).join("");

  const row = document.createElement("div");
  row.className = "cr-si-row";
  row.dataset.idx = idx;
  row.innerHTML = `
    <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:14px;padding:14px;position:relative;">
      <button onclick="this.closest('.cr-si-row').remove()" style="position:absolute;top:10px;right:10px;background:none;border:none;font-size:18px;cursor:pointer;color:#94a3b8;line-height:1;">✕</button>

      <div style="margin-bottom:10px;">
        <label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">📦 สินค้า</label>
        <select class="cr-si-product" onchange="crSiOnProductChange(this)"
          style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;background:#fff;box-sizing:border-box;">
          <option value="">— เลือกสินค้า —</option>
          ${opts}
        </select>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div>
          <label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">📅 MFG <span style="font-weight:400;opacity:.7;">(DDMMYY)</span></label>
          <input class="cr-si-mfg" type="text" maxlength="6" inputmode="numeric" placeholder="100426"
            oninput="this.value=this.value.replace(/\D/g,''); crSiAutoExp(this)"
            style="width:100%;padding:12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:20px;font-weight:900;text-align:center;letter-spacing:3px;box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#ea580c;display:block;margin-bottom:4px;">⚠️ EXP <span style="font-weight:400;opacity:.7;">(คำนวณอัตโนมัติ)</span></label>
          <input class="cr-si-exp" type="text" maxlength="6" inputmode="numeric" placeholder="—" readonly
            style="width:100%;padding:12px;border:1.5px solid #fed7aa;border-radius:10px;font-size:20px;font-weight:900;text-align:center;letter-spacing:3px;background:#fff7ed;color:#c2410c;box-sizing:border-box;">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;">
        <div>
          <label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">🔢 จำนวน (ประมาณ)</label>
          <input class="cr-si-qty" type="number" min="0" value="" inputmode="numeric"
            style="width:100%;padding:12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:20px;font-weight:900;text-align:center;box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">หน่วย</label>
          <div class="cr-si-unit-label" style="padding:12px 8px;font-size:14px;font-weight:700;color:#1e293b;text-align:center;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;">—</div>
        </div>
      </div>
    </div>`;
  document.getElementById("crSiRows").appendChild(row);
}

function crSiOnProductChange(sel) {
  const opt  = sel.options[sel.selectedIndex];
  const unit = opt.dataset.unit || "—";
  const row  = sel.closest(".cr-si-row");
  row.querySelector(".cr-si-unit-label").textContent = unit;

  // MFG = วันนี้ใน DDMMYY ถ้ายังไม่ได้กรอก
  const mfgEl = row.querySelector(".cr-si-mfg");
  if (!mfgEl.value) {
    mfgEl.value = isoToDdmmyy(new Date().toISOString().slice(0,10));
  }

  // EXP คำนวณจาก shelf life ของสินค้า
  const bc   = opt.value;
  const prod = crEditProductCache.find(p => String(p.Barcode||"") === bc);
  const days = prod ? Number(prod.StandardShelfLifeDays||0) : 0;
  _crSiCalcExp(row, mfgEl.value, days);

  // เก็บ shelf life ไว้ใน row สำหรับ auto-recalc ตอนพิมพ์ MFG
  row.dataset.shelfLife = days;
}

function crSiAutoExp(mfgInput) {
  const row   = mfgInput.closest(".cr-si-row");
  const days  = Number(row.dataset.shelfLife || 0);
  if (mfgInput.value.length === 6) _crSiCalcExp(row, mfgInput.value, days);
  else row.querySelector(".cr-si-exp").value = "";
}

function _crSiCalcExp(row, mfgDdmmyy, shelfDays) {
  const expEl = row.querySelector(".cr-si-exp");
  if (!mfgDdmmyy || mfgDdmmyy.length !== 6) { expEl.value = ""; return; }
  const mfgIso = ddmmyyToIsoWo(mfgDdmmyy);
  if (!mfgIso) { expEl.value = ""; return; }
  if (shelfDays > 0) {
    const expDate = new Date(mfgIso);
    expDate.setDate(expDate.getDate() + shelfDays);
    expEl.value = isoToDdmmyy(expDate.toISOString().slice(0,10));
  } else {
    expEl.value = mfgDdmmyy; // ถ้าไม่มี shelf life ให้ใส่ = MFG ให้แก้เอง
  }
}

async function crSiSubmit() {
  const rows = document.querySelectorAll(".cr-si-row");
  if (!rows.length) { showToast("กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ","warn"); return; }
  const items = [];
  let valid = true;
  rows.forEach(row => {
    const sel  = row.querySelector(".cr-si-product");
    const bc   = sel.value;
    const nm   = sel.options[sel.selectedIndex]?.dataset.name || "";
    const unit = sel.options[sel.selectedIndex]?.dataset.unit || "";
    const mfgRaw = row.querySelector(".cr-si-mfg").value.trim();
    const expRaw = row.querySelector(".cr-si-exp").value.trim();
    const qty    = Number(row.querySelector(".cr-si-qty").value || 0);
    if (!bc || mfgRaw.length !== 6 || expRaw.length !== 6) { valid = false; return; }
    // แปลง DDMMYY → ISO สำหรับเก็บใน GAS
    const mfg = ddmmyyToIsoWo(mfgRaw) || mfgRaw;
    const exp = ddmmyyToIsoWo(expRaw) || expRaw;
    items.push({ barcode: bc, name: nm, unit, mfg, exp, qty });
  });
  if (!valid) { showToast("กรุณาเลือกสินค้าและระบุ MFG/EXP (6 หลัก) ให้ครบ","warn"); return; }

  crSetStatus("crSiFormStatus","กำลังส่งรายการ...","");
  const res = await crCallServer("submitStockIn", { username: currentUser, items, note: document.getElementById("crSiNote").value.trim() });
  if (res.ok) {
    crSetStatus("crSiFormStatus","✅ ส่งรายการแล้ว รอคนสั่งผลิตตรวจยอด ("+res.stockInID+")","ok");
    showToast("📤 ส่งรายการแล้ว รหัส: "+res.stockInID);
    document.getElementById("crSiRows").innerHTML = "";
    document.getElementById("crSiNote").value = "";
    _siRowIdx = 0;
    crSiAddRow();
  } else {
    crSetStatus("crSiFormStatus","❌ " + (res.message||"เกิดข้อผิดพลาด"),"err");
  }
}

async function crSiLoadReviewList(filterStatus) {
  const listEl = document.getElementById("crSiReviewList");
  const statusEl = document.getElementById("crSiReviewStatus");
  if (!listEl) return;
  listEl.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px;">กำลังโหลด...</p>';
  crSetStatus("crSiReviewStatus","","");
  const res = await crCallServer("getStockInList", { filterStatus: filterStatus || "" });
  if (!res.ok) { listEl.innerHTML = `<p style="color:#dc2626;text-align:center;padding:20px;">❌ ${escapeHtml(res.message||"")}</p>`; return; }
  const list = res.list || [];
  if (!list.length) {
    listEl.innerHTML = `<p style="text-align:center;color:#059669;padding:20px;font-weight:900;">${filterStatus==="รอตรวจยอด" ? "✅ ไม่มีรายการรอตรวจ" : "ยังไม่มีรายการ"}</p>`;
    return;
  }
  const statusBg = { "รอตรวจยอด":"#f59e0b","เข้าคลังแล้ว":"#059669","ยกเลิก":"#94a3b8" };
  listEl.innerHTML = list.map(si => {
    const items = (() => { try { return JSON.parse(String(si.Items||"[]")); } catch(e){ return []; } })();
    const isPending = si.Status === "รอตรวจยอด";
    const itemRows = items.map((it,i) => `
      <tr style="background:${i%2===0?"#fff":"#f8fafc"}">
        <td style="padding:8px 10px;border:1px solid #e2e8f0;font-size:13px;font-weight:700;">${escapeHtml(it.name||"-")}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center;font-size:12px;color:#6366f1;">${escapeHtml(it.mfg||"-")}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center;font-size:12px;color:#059669;">${escapeHtml(it.exp||"-")}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:right;">
          ${isPending
            ? `<input type="number" min="0" value="${Number(it.qty||0)}" inputmode="numeric"
                 data-si="${escapeHtml(si.StockInID)}" data-row="${i}"
                 class="cr-si-review-qty"
                 style="width:80px;padding:6px 8px;border:2px solid #6366f1;border-radius:8px;font-size:16px;font-weight:900;text-align:center;">`
            : `<span style="font-weight:900;font-size:14px;">${Number(it.qty||0).toLocaleString()}</span>`
          }
          <span style="font-size:11px;color:#64748b;margin-left:4px;">${escapeHtml(it.unit||"")}</span>
        </td>
      </tr>`).join("");

    return `<div style="border:2px solid ${isPending?"#f59e0b":"#e2e8f0"};border-radius:14px;padding:16px;margin-bottom:16px;"
                 id="cr-si-card-${escapeHtml(si.StockInID)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
        <div>
          <div style="font-size:15px;font-weight:900;color:#1e293b;">${escapeHtml(si.StockInID)}</div>
          <div style="font-size:11px;color:#94a3b8;">ส่งโดย: <b style="color:#1e293b;">${escapeHtml(si.SubmittedBy)}</b> &nbsp;|&nbsp; 🕐 ${si.SubmittedAtFmt||"-"}
            ${si.ReviewedBy ? `&nbsp;|&nbsp; ตรวจโดย: <b>${escapeHtml(si.ReviewedBy)}</b>` : ""}
          </div>
        </div>
        <span style="background:${statusBg[si.Status]||"#94a3b8"};color:#fff;border-radius:999px;padding:3px 12px;font-size:11px;font-weight:900;">${escapeHtml(si.Status)}</span>
      </div>
      ${si.Note ? `<div style="background:#fef9c3;padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:10px;">💬 ${escapeHtml(si.Note)}</div>` : ""}
      <div class="table-wrap" style="overflow-x:auto;margin-bottom:${isPending?"12px":"0"};">
        <table style="width:100%;border-collapse:collapse;min-width:320px;">
          <thead><tr style="background:#1e293b;color:#fff;font-size:11px;">
            <th style="padding:7px 10px;text-align:left;">สินค้า</th>
            <th style="padding:7px 10px;text-align:center;">MFG</th>
            <th style="padding:7px 10px;text-align:center;">EXP</th>
            <th style="padding:7px 10px;text-align:right;">จำนวน</th>
          </tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>
      ${isPending ? `
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="cr-btn btn-primary" style="flex:1;min-width:140px;padding:12px;font-size:14px;font-weight:900;background:#059669;"
          onclick="crSiApprove('${escapeJs(si.StockInID)}')">✅ ยืนยันเข้าคลัง</button>
        <button class="cr-btn btn-light" style="flex:1;min-width:100px;padding:12px;font-size:13px;color:#dc2626;border:2px solid #dc2626;"
          onclick="crSiCancel('${escapeJs(si.StockInID)}')">❌ ยกเลิก</button>
      </div>` : ""}
    </div>`;
  }).join("");
}

async function crSiApprove(siId) {
  if (!await crShowModal("confirm","✅ ยืนยันเข้าคลัง",`ตรวจยอดจริงและยืนยันให้ยอดเข้าคลังห้องเย็น?`)) return;
  // เก็บ qty ที่แก้ไขจาก input
  const card = document.getElementById("cr-si-card-" + siId);
  const qtyInputs = card ? card.querySelectorAll(".cr-si-review-qty") : [];
  // ดึง items จาก DOM ผ่าน inputs
  let reviewedItems = null;
  if (qtyInputs.length) {
    // ต้องการ items ต้นฉบับ — โหลดจาก server list ที่มีอยู่ใน DOM
    const res0 = await crCallServer("getStockInList", { filterStatus: "รอตรวจยอด" });
    const si = (res0.list||[]).find(x => x.StockInID === siId);
    if (si) {
      try {
        reviewedItems = JSON.parse(String(si.Items||"[]"));
        qtyInputs.forEach(inp => {
          const rowIdx = Number(inp.dataset.row);
          if (reviewedItems[rowIdx] !== undefined) reviewedItems[rowIdx].qty = Number(inp.value||0);
        });
      } catch(e){}
    }
  }
  crSetStatus("crSiReviewStatus","กำลังยืนยัน...","");
  const res = await crCallServer("reviewStockIn", { username: currentUser, stockInID: siId, action:"approve", items: reviewedItems });
  if (res.ok) {
    showToast("✅ ยืนยันเข้าคลังเรียบร้อย");
    if (res.warnings?.length) showToast("⚠️ " + res.warnings.join(", "),"warn");
    crSiLoadReviewList("รอตรวจยอด");
  } else {
    crSetStatus("crSiReviewStatus","❌ " + (res.message||"เกิดข้อผิดพลาด"),"err");
  }
}

async function crSiCancel(siId) {
  if (!await crShowModal("confirm","❌ ยกเลิกรายการ",`ยกเลิกรายการ ${siId}?`)) return;
  const res = await crCallServer("reviewStockIn", { username: currentUser, stockInID: siId, action:"cancel" });
  if (res.ok) { showToast("ยกเลิกรายการแล้ว","warn"); crSiLoadReviewList("รอตรวจยอด"); }
  else crSetStatus("crSiReviewStatus","❌ " + (res.message||""),"err");
}

// ── Modal ──
function crShowModal(type, title, msg) {
  return new Promise(resolve => {
    const overlay = $$cr("crModal");
    $$cr("crModalTitle").innerText = title;
    $$cr("crModalMessage").innerHTML = msg.replace(/\n/g,"<br>");
    const input = $$cr("crModalInput");
    if (type === "prompt") { input.style.display = "block"; input.value = ""; setTimeout(() => input.focus(), 100); }
    else { input.style.display = "none"; }
    $$cr("crModalCancel").style.display = (type === "alert") ? "none" : "block";
    overlay.classList.add("show");
    $$cr("crModalCancel").onclick  = () => { overlay.classList.remove("show"); resolve(null); };
    $$cr("crModalConfirm").onclick = () => { overlay.classList.remove("show"); resolve(type === "prompt" ? input.value : true); };
  });
}

// ── Status ──
function crSetStatus(id, msg, type = "ok") {
  const el = $$cr(id); if (!el) return;
  const icon = type === "warn" ? "⚠️" : type === "err" ? "❌" : "✅";
  el.innerHTML = `<div>${icon}</div><div>${msg}</div>`;
  el.className = "cr-status " + type;
}
function crClearStatus(id) { const el = $$cr(id); if (el) { el.innerHTML = ""; el.className = "cr-status"; } }

// ── Lot Breakdown ──
function crRenderLotBreakdown(rows) {
  const unit = $$cr("crMasterUnit").textContent;
  if (!rows || !rows.length) { $$cr("crTotalQty").textContent = "0"; $$cr("crLotBreakdown").style.display = "none"; return; }
  const total = rows.reduce((s, r) => s + r.Qty, 0);
  $$cr("crTotalQty").textContent = total;
  let html = `<div style="margin-bottom:6px;font-weight:700;border-bottom:1px solid rgba(255,255,255,.2);padding-bottom:4px;">แยกตามรอบวันที่ผลิต:</div>`;
  html += rows.map(r => `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
      <span>🔸 MFG ${isoToDdmmyy(r.MFG)} (EXP ${isoToDdmmyy(r.EXP)})</span>
      <div><span style="margin-right:8px;"><b>${r.Qty}</b> ${unit}</span>
        <button class="cr-btn btn-primary" style="padding:4px 8px;font-size:10px;border-radius:4px;" onclick="crSelectLot('${escapeJs(String(r.MFG||""))}','${escapeJs(String(r.EXP||""))}',${Number(r.Qty)||0})">เลือก</button>
      </div>
    </div>`).join("");
  $$cr("crLotBreakdown").innerHTML = html;
  $$cr("crLotBreakdown").style.display = "block";
}

function crSelectLot(mfgIso, expIso, qty) {
  $$cr("crMfg").value = isoToDdmmyy(mfgIso);
  $$cr("crExp").value = isoToDdmmyy(expIso);
  $$cr("crNewQty").focus();
  showToast(`เลือกรอบผลิต ${isoToDdmmyy(mfgIso)} แล้ว!`);
}

// ── Lookup ──
async function crLookupBarcode() {
  const term = $$cr("crBarcode").value.trim();
  if (!term) return;
  const res = await crCallServer("getProductAndBalances", { barcode: term });
  if (!res.found) {
    if (/^\d+$/.test(term.replace(/\s+/g,""))) $$cr("crNewBarcode").value = term.replace(/\s+/g,"");
    crSwitchTab("newproduct");
    crSetStatus("crNewProductStatus","ไม่พบสินค้าในระบบ กรุณาขึ้นทะเบียนใหม่ 👇","warn");
    return;
  }
  crCurrentProduct = res.product;
  $$cr("crBarcode").value     = res.product.Barcode;
  $$cr("crProductName").value = res.product.ProductName;
  $$cr("crMasterUnit").textContent = res.product.DefaultUnit;
  // sync dropdown ให้แสดงสินค้าที่ถูกเลือก
  const dd = $$cr("crProductDropdown");
  if (dd && res.product.Barcode) dd.value = res.product.Barcode;
  crRenderLotBreakdown(res.balances);
  crSetStatus("crMainStatus", res.balances.length ? "พบข้อมูลสต๊อก กรุณาเลือกรอบผลิตเพื่ออัปเดตยอด" : "ไม่มียอดคงเหลือ กรุณาระบุรายละเอียดเพื่อรับเข้า", "ok");
  const editBtn = document.getElementById("crBtnEditProductInline");
  if (editBtn) editBtn.style.display = "inline-flex";
  // ถ้าช่อง MFG มี 6 หลักอยู่แล้ว → คำนวณ EXP ทันที
  const mfgVal = ($$cr("crMfg")?.value || "").trim();
  if (mfgVal.length === 6) crAutoExp(mfgVal);
}

// ── Overview ──
async function crLoadOverview() {
  const res = await crCallServer("getStartupOverview");
  if (!res.ok) return;
  window.crAllLotsData = res.allLots;
  $$cr("crSumProducts").textContent = res.summary.totalProducts;
  $$cr("crSumLots").textContent     = res.summary.totalLots;
  $$cr("crSumExpiring").textContent = res.summary.expiringLots;
  $$cr("crSumExpired").textContent  = res.summary.expiredLots;

  $$cr("crTotalBody").innerHTML = res.totalByProduct.map(x =>
    `<tr><td data-label="ชื่อสินค้า">${escapeHtml(x.ProductName)}</td><td data-label="ยอดรวม"><b>${x.TotalQty}</b></td><td data-label="หน่วย">${escapeHtml(x.Unit)}</td><td data-label="รอบผลิต">${x.LotCount}</td></tr>`).join("");

  $$cr("crExpiringBody").innerHTML = res.expiringLots.map(x =>
    `<tr><td data-label="ชื่อ">${escapeHtml(x.ProductName)}</td><td data-label="MFG"><b>${isoToDdmmyy(x.MFG)}</b></td><td data-label="EXP">${isoToDdmmyy(x.EXP)}</td><td data-label="เหลือ(วัน)" style="color:var(--warn)">${x.ExpireDays}</td><td data-label="จำนวน"><b>${x.Qty}</b></td></tr>`).join("");

  $$cr("crExpiredBody").innerHTML = res.expiredLots.map(x =>
    `<tr><td data-label="ชื่อ">${escapeHtml(x.ProductName)}</td><td data-label="MFG"><b>${isoToDdmmyy(x.MFG)}</b></td><td data-label="EXP">${isoToDdmmyy(x.EXP)}</td><td data-label="เลย(วัน)" style="color:var(--danger)">${Math.abs(x.ExpireDays)} วัน</td><td data-label="จำนวน"><b>${x.Qty}</b></td></tr>`).join("");

  const b = $$cr("crBalanceBody");
  crSelectedRows.clear();
  crUpdateSelectionUI();
  if (!res.allLots || !res.allLots.length) {
    b.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;">ไม่มีข้อมูลสต๊อก</td></tr>';
  } else {
    const sortedLots = res.allLots.slice().sort((a, b) => (a.ExpireDays ?? 9999) - (b.ExpireDays ?? 9999));
    window._crSortedLots = sortedLots;
    window._crLotsShown = 0;
    b.innerHTML = "";
    crLoadMoreLots();
  }

  // 🚨 แจ้งเตือน Cold Room
  crCheckCritical(res);
}

// ─── Checkbox Selection ───────────────────────
const crSelectedRows = new Set();

function crUpdateSelectionUI() {
  const count   = crSelectedRows.size;
  const total   = window.crAllLotsData?.length || 0;
  const countEl = document.getElementById("crSelectedCount");
  const editBtn = document.getElementById("crBtnBulkEdit");
  const remBtn  = document.getElementById("crBtnBulkRemove");
  const allChk  = document.getElementById("crSelectAllChk");

  if (countEl) countEl.textContent = count > 0 ? `เลือก ${count} รายการ` : "เลือกทั้งหมด";
  if (editBtn) editBtn.style.display = count > 0 ? "" : "none";
  if (remBtn)  remBtn.style.display  = count > 0 ? "" : "none";
  if (allChk)  {
    allChk.checked       = total > 0 && count === total;
    allChk.indeterminate = count > 0 && count < total;
  }
  // highlight selected rows
  document.querySelectorAll("#crBalanceBody tr").forEach(tr => {
    const chk = tr.querySelector(".cr-row-chk");
    if (chk) tr.style.background = chk.checked ? "rgba(79,70,229,0.06)" : "";
  });
}

function crToggleRow(i, checked) {
  if (checked) crSelectedRows.add(i); else crSelectedRows.delete(i);
  crUpdateSelectionUI();
}

function crToggleSelectAll(checked) {
  const total = window.crAllLotsData?.length || 0;
  crSelectedRows.clear();
  if (checked) for (let i = 0; i < total; i++) crSelectedRows.add(i);
  document.querySelectorAll(".cr-row-chk").forEach((chk, i) => { chk.checked = checked; });
  crUpdateSelectionUI();
}

// คลิกแถว → toggle checkbox (ยกเว้นคลิก checkbox โดยตรง)
function crRowClick(event, i) {
  const chk = document.querySelector(`.cr-row-chk[data-idx="${i}"]`);
  if (!chk) return;
  chk.checked = !chk.checked;
  crToggleRow(i, chk.checked);
}

function crBulkEdit() {
  if (crSelectedRows.size === 0) { alert("กรุณาเลือกสินค้าก่อน"); return; }
  if (crSelectedRows.size > 1)  { alert("แก้ไขได้ครั้งละ 1 รายการ\nกรุณาเลือกเพียง 1 รายการ"); return; }
  const i = [...crSelectedRows][0];
  const r = window.crAllLotsData?.[i];
  if (r) crOpenEditProduct(r.Barcode);
}

async function crBulkRemove() {
  if (crSelectedRows.size === 0) { alert("กรุณาเลือกสินค้าก่อน"); return; }
  const indices = [...crSelectedRows].sort((a,b) => b - a); // ลบจากหลังไปหน้า
  const names   = indices.map(i => `• ${window.crAllLotsData[i]?.ProductName} (MFG: ${isoToDdmmyy(window.crAllLotsData[i]?.MFG)})`).join("\n");
  const reason  = window.prompt(`🗑️ นำสินค้าออก ${indices.length} รายการ\n\n${names}\n\nกรุณาระบุเหตุผล:`);
  if (!reason || !reason.trim()) return;
  const conf = window.confirm(`ยืนยันนำออก ${indices.length} รายการ?\nเหตุผล: ${reason}\n\n⚠️ ยอดจะถูกตั้งเป็น 0 ทั้งหมด`);
  if (!conf) return;
  const emp = ($$cr("crEmployee")?.value?.trim()) || currentUser;
  let ok = 0, fail = 0;
  for (const i of indices) {
    const row = window.crAllLotsData[i];
    if (!row) { fail++; continue; }
    try {
      const res = await crCallServer("clearLotStock", { barcode: row.Barcode, mfg: row.MFG, reason: reason.trim(), employeeName: emp });
      if (res?.ok) { ok++; if (res.tgSent === false && res.tgError) Logger.warn?.("Telegram: " + res.tgError); } else fail++;
    } catch(e) { fail++; }
  }
  if (navigator.vibrate) navigator.vibrate([100,50,100]);
  showToast(fail === 0 ? `✅ นำออก ${ok} รายการเรียบร้อย` : `✅ ${ok} รายการ / ❌ ${fail} รายการผิดพลาด`);
  crSelectedRows.clear();
  crLoadOverview();
}

async function crSelectGlobal(i) {
  const r = window.crAllLotsData[i]; if (!r) return;
  crSwitchTab("stock"); $$cr("crBarcode").value = r.Barcode; await crLookupBarcode();
  $$cr("crMfg").value = isoToDdmmyy(r.MFG); $$cr("crExp").value = isoToDdmmyy(r.EXP);
  $$cr("crNewQty").focus(); showToast(`เลือกรอบผลิต ${isoToDdmmyy(r.MFG)} เรียบร้อย!`);
}

async function crAskClearGlobal(i) {
  try {
    const row = window.crAllLotsData?.[i];
    if (!row) {
      alert("ไม่พบข้อมูล lot นี้\nกรุณากดโหลดข้อมูลใหม่ก่อน");
      return;
    }
    const emp = ($$cr("crEmployee")?.value?.trim()) || currentUser;
    if (!emp) {
      alert("ไม่พบข้อมูลพนักงาน\nกรุณาเข้าสู่ระบบก่อนใช้งาน");
      return;
    }
    // ใช้ native prompt/confirm ที่ทำงานได้ทุกเบราว์เซอร์
    const reason = window.prompt(
      `🗑️ นำสินค้าออก\nสินค้า: ${row.ProductName}\nMFG: ${isoToDdmmyy(row.MFG)}\n\nกรุณาระบุเหตุผล:`
    );
    if (!reason || !reason.trim()) return;
    const conf = window.confirm(
      `ยืนยันการนำออก?\n\nสินค้า: ${row.ProductName}\nMFG: ${isoToDdmmyy(row.MFG)}\nเหตุผล: ${reason}\n\n⚠️ ยอดคงเหลือจะถูกตั้งเป็น 0`
    );
    if (conf) {
      const res = await crCallServer("clearLotStock",{ barcode:row.Barcode, mfg:row.MFG, reason: reason.trim(), employeeName:emp });
      if (res?.ok) {
        if (navigator.vibrate) navigator.vibrate([100,50,100]);
        if (res.tgSent === false && res.tgError) {
          showToast("✅ นำออกแล้ว ⚠️ Telegram: " + res.tgError, "warn");
        } else {
          showToast("✅ นำสินค้าออกเรียบร้อย");
        }
        crLoadOverview();
      } else {
        alert("เกิดข้อผิดพลาด: " + (res?.message || res?.error || "ไม่ทราบสาเหตุ"));
      }
    }
  } catch(e) {
    alert("เกิดข้อผิดพลาด: " + e.message);
    console.error("crAskClearGlobal error:", e);
  }
}

// ── Auto EXP ──
function crAutoExp(mfgStr) {
  if (!/^\d{6}$/.test(mfgStr)) { crSetStatus("crMainStatus","❌ วันผลิตต้องเป็นตัวเลข 6 หลัก","err"); $$cr("crExp").value = ""; return; }
  const dd = parseInt(mfgStr.slice(0,2)), mm = parseInt(mfgStr.slice(2,4)), yy = parseInt(mfgStr.slice(4,6)), yyyy = 2000+yy;
  const d = new Date(yyyy, mm-1, dd);
  if (isNaN(d.getTime())) { crSetStatus("crMainStatus","❌ วันที่ไม่ถูกต้อง","err"); $$cr("crExp").value=""; return; }
  if (!crCurrentProduct) {
    crSetStatus("crMainStatus","⚠️ กรุณาเลือกสินค้าก่อน จึงจะคำนวณ EXP อัตโนมัติได้","warn");
    return;
  }
  const sl = parseInt(crCurrentProduct.StandardShelfLifeDays);
  if (!sl || sl <= 0) { crSetStatus("crMainStatus","⚠️ สินค้านี้ไม่ได้ตั้งอายุมาตรฐาน กรุณาระบุ EXP เอง","warn"); return; }
  d.setDate(d.getDate() + sl);
  $$cr("crExp").value = String(d.getDate()).padStart(2,"0") + String(d.getMonth()+1).padStart(2,"0") + String(d.getFullYear()).slice(2);
  crSetStatus("crMainStatus",`✅ คำนวณ EXP อัตโนมัติ (+${sl} วัน)`,"ok");
}

function crEvalExpr(el) {
  let v = String(el.value).trim().replace(/x/gi,"*");
  if (/^[0-9+\-*/().\s]+$/.test(v)) { try { el.value = Math.round(new Function("return "+v)()*100)/100; } catch(e){} }
}

// ── Save Count ──
async function crSaveCount() {
  crEvalExpr($$cr("crNewQty"));
  const pl = {
    barcode:      $$cr("crBarcode").value.trim(),
    employeeName: $$cr("crEmployee").value.trim(),
    mfg:          $$cr("crMfg").value.trim(),
    exp:          $$cr("crExp").value.trim(),
    newQty:       $$cr("crNewQty").value.trim(),
    note:         $$cr("crNote").value.trim()
  };
  if (!pl.employeeName || !pl.mfg || !pl.exp || pl.newQty === "" || isNaN(pl.newQty)) {
    await crShowModal("alert","ข้อมูลไม่ครบ","กรุณาระบุ: ชื่อพนักงาน, วันผลิต, วันหมดอายุ, จำนวน"); return;
  }
  if (!pl.note) {
    await crShowModal("alert","กรุณาระบุหมายเหตุ","ต้องระบุหมายเหตุทุกครั้งก่อนบันทึก");
    $$cr("crNote").focus(); return;
  }
  const qty = Number(pl.newQty);
  const res = await crCallServer("saveOrUpdateCount", pl);
  if (res.ok) {
    if (navigator.vibrate) navigator.vibrate([100,50,100]);
    showToast(qty === 0 ? "ปรับยอดเป็น 0 เรียบร้อย" : "บันทึกเข้าสต๊อกเรียบร้อย!");
    const bc = $$cr("crBarcode").value.trim();
    crClearAll(); $$cr("crBarcode").value = bc; crLookupBarcode(); crLoadOverview();
  }
}

async function crSaveNewProduct() {
  const pl = {
    barcode:             $$cr("crNewBarcode").value.trim(),
    productName:         $$cr("crNewName").value.trim(),
    sku:                 $$cr("crNewSku").value.trim(),
    defaultUnit:         $$cr("crNewUnit").value,
    standardShelfLifeDays: $$cr("crNewShelfLife").value,
    warningPercentage:   20,
    warningDays:         $$cr("crNewWarnDays").value,
    setName:             $$cr("crNewSetName").value.trim(),
    unitsPerSet:         Number($$cr("crNewUnitsPerSet").value) || 1
  };
  const res = await crCallServer("saveNewProduct", pl);
  if (res.ok) { showToast("ขึ้นทะเบียนสำเร็จ!"); $$cr("crBarcode").value = pl.barcode; crSwitchTab("stock"); crLookupBarcode(); }
  else showToast(res.message || "เกิดข้อผิดพลาด","err");
}

// ── Edit Product Tab ──
let crEditProductCache = []; // cache รายการสินค้าทั้งหมด

async function crLoadEditProductList() {
  crSetStatus("crEditProductStatus","⏳ กำลังโหลดรายการสินค้า...","");
  const res = await crCallServer("getColdRoomProducts", {});
  if (!res.ok) { crSetStatus("crEditProductStatus","❌ โหลดไม่ได้ กรุณาลองใหม่","err"); return; }
  crEditProductCache = res.products || [];
  const sel = document.getElementById("crEditProductSelect");
  sel.innerHTML = `<option value="">-- เลือกสินค้า (${crEditProductCache.length} รายการ) --</option>`;
  const sorted = [...crEditProductCache].sort((a,b)=>String(a.ProductName||"").localeCompare(String(b.ProductName||""),"th"));
  sorted.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = String(p.Barcode || "");
    opt.textContent = `${p.ProductName}  [${p.Barcode}]`;
    sel.appendChild(opt);
  });
  crClearStatus("crEditProductStatus");
  if (crEditProductCache.length === 0) crSetStatus("crEditProductStatus","⚠️ ยังไม่มีสินค้าในระบบ","warn");
}

function crSelectEditProduct() {
  try {
  const barcode = document.getElementById("crEditProductSelect").value;
  const fields = document.getElementById("crEditProductFields");
  if (!barcode) { fields.style.display = "none"; return; }
  const prod = crEditProductCache.find(p => String(p.Barcode) === String(barcode));
  if (!prod) {
    crSetStatus("crEditProductStatus","❌ ไม่พบข้อมูลสินค้า กรุณากด 'โหลดรายการ' ใหม่","err");
    return;
  }

  document.getElementById("crEditBarcode").value                    = prod.Barcode || "";
  document.getElementById("crEditBarcodeDisplay").textContent       = prod.Barcode || "";
  document.getElementById("crEditName").value                       = prod.ProductName || "";
  document.getElementById("crEditSku").value                        = prod.SKU || "";
  document.getElementById("crEditShelfLife").value                  = prod.StandardShelfLifeDays || "";
  document.getElementById("crEditWarnDays").value                   = prod.WarningDays || "";
  document.getElementById("crEditSetName").value                    = prod.SetName || "";
  document.getElementById("crEditUnitsPerSet").value                = prod.UnitsPerSet || "";
  document.getElementById("crEditSetNamePreview").textContent       = prod.DefaultUnit || "หน่วยนับ";

  const sel = document.getElementById("crEditUnit");
  const unitVal = prod.DefaultUnit || "";
  let found = false;
  for (let opt of sel.options) { if (opt.value === unitVal) { sel.value = unitVal; found = true; break; } }
  if (!found && unitVal) { const o = new Option(unitVal, unitVal); sel.add(o); sel.value = unitVal; }

  fields.style.display = "block";
  crClearStatus("crEditProductStatus");
  } catch(e) {
    crSetStatus("crEditProductStatus","❌ เกิดข้อผิดพลาด: " + e.message,"err");
  }
}

// เรียกจากปุ่ม ✏️แก้ไข ในตาราง คงเหลือ — สวิตช์ไปยัง tab แก้ไขสินค้า แล้วเลือกสินค้าทันที
async function crOpenEditProduct(barcode) {
  crSwitchTab("editproduct");
  if (crEditProductCache.length === 0) await crLoadEditProductList();
  const prod = crEditProductCache.find(p => String(p.Barcode) === String(barcode));
  if (!prod) { crSetStatus("crEditProductStatus","❌ ไม่พบสินค้านี้ในรายการ","err"); return; }
  const sel = document.getElementById("crEditProductSelect");
  sel.value = String(barcode);
  crSelectEditProduct();
}

function crOpenEditProductFromCurrent() {
  if (!crCurrentProduct) return;
  crOpenEditProduct(crCurrentProduct.Barcode);
}

function crResetEditProductForm() {
  document.getElementById("crEditProductSelect").value = "";
  document.getElementById("crEditProductFields").style.display = "none";
  document.getElementById("crEditBarcode").value = "";
  crClearStatus("crEditProductStatus");
}

async function crSubmitEditProduct() {
  const pl = {
    barcode:               document.getElementById("crEditBarcode").value.trim(),
    productName:           document.getElementById("crEditName").value.trim(),
    sku:                   document.getElementById("crEditSku").value.trim(),
    defaultUnit:           document.getElementById("crEditUnit").value,
    standardShelfLifeDays: document.getElementById("crEditShelfLife").value,
    warningPercentage:     20,
    warningDays:           document.getElementById("crEditWarnDays").value,
    setName:               document.getElementById("crEditSetName").value.trim(),
    unitsPerSet:           Number(document.getElementById("crEditUnitsPerSet").value) || 1
  };
  if (!pl.barcode || !pl.productName) { crSetStatus("crEditProductStatus","❌ กรุณากรอกชื่อสินค้า","err"); return; }
  crSetStatus("crEditProductStatus","⏳ กำลังบันทึก...","");
  const res = await crCallServer("updateProduct", pl);
  if (res.ok) {
    showToast("✅ แก้ไขข้อมูลสินค้าเรียบร้อย");
    crClearStatus("crEditProductStatus");
    // อัปเดต cache ด้วย
    const idx = crEditProductCache.findIndex(p => String(p.Barcode) === String(pl.barcode));
    if (idx >= 0) {
      Object.assign(crEditProductCache[idx], { ProductName: pl.productName, SKU: pl.sku, DefaultUnit: pl.defaultUnit,
        StandardShelfLifeDays: pl.standardShelfLifeDays, WarningPercentage: pl.warningPercentage,
        WarningDays: pl.warningDays, SetName: pl.setName, UnitsPerSet: pl.unitsPerSet });
      // อัปเดตชื่อใน dropdown ด้วย
      const sel = document.getElementById("crEditProductSelect");
      if (sel.options[idx+1]) sel.options[idx+1].textContent = `${pl.productName}  [${pl.barcode}]`;
    }
    // อัปเดต crCurrentProduct ถ้าตรงกัน
    if (crCurrentProduct && String(crCurrentProduct.Barcode) === String(pl.barcode)) {
      Object.assign(crCurrentProduct, { ProductName: pl.productName, DefaultUnit: pl.defaultUnit,
        StandardShelfLifeDays: pl.standardShelfLifeDays, WarningPercentage: pl.warningPercentage,
        WarningDays: pl.warningDays, SetName: pl.setName, UnitsPerSet: pl.unitsPerSet });
      $$cr("crProductName").value = pl.productName;
    }
    crLoadOverview();
  } else {
    crSetStatus("crEditProductStatus","❌ "+(res.message||"เกิดข้อผิดพลาด"),"err");
  }
}

async function crSaveSettings() {
  const pl = { telegramBotName:$$cr("crTgBotName").value, telegramBotToken:$$cr("crTgToken").value, telegramChatIds:$$cr("crTgChatIds").value, enableTelegramStockUpdate:$$cr("crTgEnable").value };
  const res = await crCallServer("saveAlertSettings", pl);
  if (res.ok) showToast("บันทึกการตั้งค่าสำเร็จ");
}

// ── Clear ──
function crClearLotOnly() {
  ["crMfg","crExp","crNewQty","crNote"].forEach(id => { if ($$cr(id)) $$cr(id).value = ""; });
  showToast("ล้างฟอร์มอัปเดตยอดเรียบร้อย");
}
function crClearAll() {
  ["crBarcode","crMfg","crExp","crNewQty","crNote","crProductName","crNewBarcode","crNewName","crNewSku"].forEach(id => { if($$cr(id)) $$cr(id).value=""; });
  const dd = $$cr("crProductDropdown"); if (dd) dd.value = "";
  $$cr("crTotalQty").textContent = "0"; $$cr("crMasterUnit").textContent = "-";
  $$cr("crLotBreakdown").style.display = "none"; $$cr("crLotBreakdown").innerHTML = "";
  crCurrentProduct = null; crClearStatus("crMainStatus"); $$cr("crBarcode").focus();
  const editBtn = document.getElementById("crBtnEditProductInline");
  if (editBtn) editBtn.style.display = "none";
}

// ── Product Dropdown (stock tab) ──
async function crLoadProductDropdown() {
  const sel = $$cr("crProductDropdown");
  if (!sel) return;
  // ใช้ cache ของ editProduct ถ้ามีแล้ว, ไม่งั้นโหลดใหม่
  let products = crEditProductCache.length ? crEditProductCache : null;
  if (!products) {
    const res = await crCallServer("getColdRoomProducts", {});
    if (res.ok && res.products) { products = res.products; crEditProductCache = products; }
  }
  if (!products) return;
  const sorted = [...products].sort((a, b) => String(a.ProductName||"").localeCompare(String(b.ProductName||""), "th"));
  sel.innerHTML = '<option value="">🔍 หรือเลือกจากรายการสินค้าทั้งหมด...</option>' +
    sorted.map(p => `<option value="${escapeAttr(String(p.Barcode||""))}">${escapeHtml(String(p.ProductName||""))}</option>`).join("");
}

function crSelectProductFromDropdown(barcode) {
  if (!barcode) return;
  const barcodeEl = $$cr("crBarcode");
  if (barcodeEl) { barcodeEl.value = barcode; crLookupBarcode(); }
}

// ── Export ──
function crExport(format) {
  if (!window.crAllLotsData || !window.crAllLotsData.length) { showToast("ไม่พบข้อมูลสำหรับส่งออก","warn"); return; }
  const sorted = [...window.crAllLotsData].sort((a,b) => new Date(b.MFG)-new Date(a.MFG));
  if (format === "csv") {
    let csv = "\uFEFFบาร์โค้ด,ชื่อสินค้า,วันที่ผลิต(MFG),วันหมดอายุ(EXP),จำนวน,หน่วย,เหลือ(วัน),สถานะ\n";
    sorted.forEach(r => { csv += `="${r.Barcode}","${r.ProductName}",${isoToDdmmyy(r.MFG)},${isoToDdmmyy(r.EXP)},${r.Qty},${r.Unit},${r.ExpireDays},${r.ExpireStatus}\n`; });
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
    a.download = `ColdRoom_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    showToast("ดาวน์โหลด CSV เรียบร้อย");
  } else {
    const w = window.open("","","width=900,height=600");
    w.document.write(`<!DOCTYPE html><html><head><title>รายงาน</title><style>@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700');body{font-family:Sarabun,sans-serif;padding:20px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}th{background:#f1f5f9;font-weight:700}</style></head><body><h2>รายงานสต๊อกคงเหลือ ❄️ SQF</h2><p>อัปเดต: ${new Date().toLocaleString("th-TH")}</p><table><thead><tr><th>ชื่อสินค้า</th><th>MFG</th><th>จำนวน</th><th>เหลือ(วัน)</th><th>สถานะ</th><th>QC</th></tr></thead><tbody>${sorted.map(r=>`<tr><td>${escapeHtml(r.ProductName)}</td><td>${isoToDdmmyy(r.MFG)}</td><td>${r.Qty} ${escapeHtml(r.Unit)}</td><td>${r.ExpireDays}</td><td>${r.ExpireStatus}</td><td>${r.QcShelfLifeStatus}</td></tr>`).join("")}</tbody></table></body></html>`);
    w.document.close(); setTimeout(()=>{ w.focus(); w.print(); },500);
  }
}

// ── Scanner ──
function crStopScanner() {
  crScannerRunning = false;
  if (crScannerLoopHandle) clearTimeout(crScannerLoopHandle);
  if (crScannerStream) { crScannerStream.getTracks().forEach(t=>t.stop()); crScannerStream=null; }
  $$cr("crScannerBoxStock")?.classList.add("hide");
  $$cr("crScannerBoxNew")?.classList.add("hide");
}

async function crStartScanner(mode) {
  crScannerMode = mode;
  const box = mode==="stock"?"crScannerBoxStock":"crScannerBoxNew";
  const vid = mode==="stock"?"crVideoStock":"crVideoNew";
  if (!("BarcodeDetector" in window)) { await crShowModal("alert","แจ้งเตือน","เบราว์เซอร์ไม่รองรับสแกนผ่านกล้อง"); return; }
  try {
    crStopScanner();
    crBarcodeDetector = new BarcodeDetector({ formats:["ean_13","ean_8","upc_a","code_128","code_39","itf"] });
    crScannerStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" },audio:false });
    $$cr(vid).srcObject = crScannerStream; $$cr(box).classList.remove("hide"); await $$cr(vid).play();
    crScannerRunning = true; crScanLoop();
  } catch(e) { await crShowModal("alert","ข้อผิดพลาด","ไม่สามารถเปิดกล้อง: "+e.message); }
}

async function crScanLoop() {
  if (!crScannerRunning) return;
  const vid = crScannerMode==="stock"?"crVideoStock":"crVideoNew";
  try {
    const bc = await crBarcodeDetector.detect($$cr(vid));
    if (bc && bc.length) {
      if (navigator.vibrate) navigator.vibrate([50,50,50]);
      crStopScanner();
      if (crScannerMode==="stock") { $$cr("crBarcode").value=bc[0].rawValue; crLookupBarcode(); }
      else $$cr("crNewBarcode").value=bc[0].rawValue;
      return;
    }
  } catch(e) {}
  crScannerLoopHandle = setTimeout(crScanLoop, 250);
}

// ── Init ──
function initColdroom() {
  crInitDone = true;
  // โหลด product list ครั้งเดียว เก็บไว้ใน crEditProductCache ใช้ได้ทุก dropdown
  if (!crEditProductCache.length) {
    crCallServer("getColdRoomProducts").then(res => {
      if (res.ok && res.products?.length) crEditProductCache = res.products;
    });
  }
  crCallServer("getAlertSettings").then(res => {
    if (res.ok) {
      const s = res.settings;
      $$cr("crTgBotName").value = s.telegramBotName;
      $$cr("crTgToken").value   = s.telegramBotToken;
      $$cr("crTgChatIds").value = s.telegramChatIds;
      $$cr("crTgEnable").value  = s.enableTelegramStockUpdate;
    }
  });
  crLoadOverview();
  crLoadProductDropdown(); // โหลดรายการสินค้าใส่ dropdown
  // pre-fill employee name
  if ($$cr("crEmployee") && currentUser) $$cr("crEmployee").value = currentUser;
  $$cr("crBarcode").focus();

  $$cr("crMfg").addEventListener("input", function() {
    this.value = this.value.replace(/\D/g,"");
    if (this.value.length === 6) crAutoExp(this.value); else $$cr("crExp").value = "";
  });
  $$cr("crNewQty").addEventListener("blur",  function() { crEvalExpr(this); });
  $$cr("crNewQty").addEventListener("keypress", function(e) { if (e.key==="Enter") { crEvalExpr(this); this.blur(); } });

  // ── Autocomplete: crBarcode (ค้นหาสินค้า Cold Room) ──
  const barcodeEl = $$cr("crBarcode");
  buildAutocomplete(
    barcodeEl,
    () => crEditProductCache.map(p => ({
      label: p.ProductName,
      sub:   `บาร์โค้ด: ${p.Barcode}${p.SKU ? " · SKU: " + p.SKU : ""}${p.SetName ? " · " + p.SetName : ""}`,
      badge: p.DefaultUnit || "",
      value: p.Barcode
    })),
    async (item) => {
      barcodeEl.value = item.value;
      await crLookupBarcode();
    }
  );
  // โหลด product cache ครั้งแรกเมื่อ focus (lazy load)
  barcodeEl.addEventListener("focus", function handler() {
    barcodeEl.removeEventListener("focus", handler);
    if (crEditProductCache.length === 0) crLoadEditProductList();
  });

  // ── Autocomplete: crNewBarcode (ขึ้นทะเบียนสินค้าใหม่ — แจ้งถ้ามีอยู่แล้ว) ──
  const newBarcodeEl = $$cr("crNewBarcode");
  buildAutocomplete(
    newBarcodeEl,
    () => crEditProductCache.map(p => ({
      label: p.ProductName,
      sub:   `บาร์โค้ด: ${p.Barcode} — มีในระบบแล้ว คลิกเพื่อแก้ไข`,
      badge: "มีแล้ว",
      value: p.Barcode
    })),
    (item) => {
      newBarcodeEl.value = item.value;
      $$cr("crNewName").value = "";
      showToast(`⚠️ "${item.label}" มีในระบบแล้ว — ไปที่แก้ไขสินค้าแทน`,"warn");
      crSwitchTab("editproduct");
      crOpenEditProduct(item.value);
    }
  );
  newBarcodeEl.addEventListener("focus", function handler() {
    newBarcodeEl.removeEventListener("focus", handler);
    if (crEditProductCache.length === 0) crLoadEditProductList();
  });
}
