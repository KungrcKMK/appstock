// ═════════════════════════════════════════════
// crimport.js — 📥 นำเข้าล็อตห้องเย็นจากไฟล์ CSV
//
//   คู่แฝดของ js/import.js (วัตถุดิบ) แต่ห้องเย็นนับเป็นล็อต:
//   หนึ่งแถวในไฟล์ = หนึ่งล็อต (สินค้า + วันผลิต + วันหมดอายุ + จำนวน)
//
//   จุดต่างจากฝั่งวัตถุดิบ: พรีวิวไม่ได้ตรวจเองในเบราว์เซอร์ —
//   ส่งให้เซิร์ฟเวอร์ "ซ้อมนำเข้า" (dryRun) แล้วเอาผลจริงมาโชว์
//   ตรรกะจับคู่สินค้า/เช็คล็อตซ้ำจึงมีที่เดียว ไม่มีวันพรีวิวกับของจริงไม่ตรงกัน
//   ใช้ตัวช่วยอ่านไฟล์ร่วมกับ import.js: impParseCsv / impNum / impDate / impLooksGarbled
// ═════════════════════════════════════════════

let _criRows = null;      // แถวที่แปลงแล้ว (ส่งให้เซิร์ฟเวอร์)
let _criFileName = "";

function criOpen() {
  _criRows = null; _criFileName = "";
  document.getElementById("criFile").value = "";
  document.getElementById("criPreviewWrap").style.display = "none";
  document.getElementById("criConfirmBtn").disabled = true;
  document.getElementById("criModal").classList.remove("hidden");
}

function criClose() {
  document.getElementById("criModal").classList.add("hidden");
}

// ── ไฟล์ตัวอย่าง: หัวคอลัมน์ + รายชื่อสินค้าที่มีจริง ให้เติมแค่ตัวเลขกับวันที่ ──
async function criTemplate() {
  const res = await crCallServer("getColdRoomProducts");
  const products = (res && res.products) || [];
  if (!products.length) { showToast("ยังไม่มีสินค้าในระบบ — สร้างที่แท็บจัดการสินค้าก่อน", "warn"); return; }
  const rows = [["บาร์โค้ด", "ชื่อสินค้า", "จำนวน", "วันผลิต", "วันหมดอายุ"]];
  products.forEach(p => rows.push([String(p.Barcode || ""), String(p.ProductName || ""), "", "", ""]));
  // ﻿ (BOM) ให้ Excel เปิดภาษาไทยไม่เพี้ยน
  const csv = "﻿" + rows.map(r => r.map(c => /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "นำเข้าห้องเย็น_ตัวอย่าง.csv";
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("ดาวน์โหลดไฟล์ตัวอย่างแล้ว — วันที่ใส่ได้ทั้ง พ.ศ./ค.ศ. เช่น 15/01/2569", "success");
}

// ── อ่านไฟล์ → แปลงคอลัมน์ → ส่งซ้อมนำเข้า ──
async function criFilePicked(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  _criFileName = file.name;
  const text = await file.text();
  if (typeof impLooksGarbled === "function" && impLooksGarbled(text)) {
    showToast("ภาษาไทยในไฟล์เพี้ยน — ใน Excel ให้บันทึกเป็น CSV UTF-8 แล้วลองใหม่", "error");
    input.value = "";
    return;
  }
  const table = impParseCsv(text);
  if (!table.length || table.length < 2) { showToast("ไฟล์ว่าง หรือไม่มีแถวข้อมูล", "error"); return; }

  // จับคู่หัวคอลัมน์แบบยืดหยุ่น — พิมพ์ต่างกันนิดหน่อยก็เข้าใจ
  const heads = table[0].map(h => String(h).trim().toLowerCase());
  const col = names => heads.findIndex(h => names.some(n => h === n || h.includes(n)));
  const cBc  = col(["บาร์โค้ด", "barcode"]);
  const cNm  = col(["ชื่อสินค้า", "ชื่อ", "name", "product"]);
  const cQty = col(["จำนวน", "qty", "quantity"]);
  const cMfg = col(["วันผลิต", "ผลิต", "mfg"]);
  const cExp = col(["วันหมดอายุ", "หมดอายุ", "exp"]);
  if ((cBc < 0 && cNm < 0) || cQty < 0 || cMfg < 0 || cExp < 0) {
    showToast("หัวคอลัมน์ไม่ครบ — ต้องมี บาร์โค้ด/ชื่อสินค้า, จำนวน, วันผลิต, วันหมดอายุ", "error");
    return;
  }

  _criRows = table.slice(1)
    .filter(r => r.some(c => String(c).trim() !== ""))
    .map(r => ({
      barcode: cBc >= 0 ? String(r[cBc] || "").trim() : "",
      name:    cNm >= 0 ? String(r[cNm] || "").trim() : "",
      qty:     impNum(r[cQty]),
      mfg:     impDate(r[cMfg]) || String(r[cMfg] || "").trim(),
      exp:     impDate(r[cExp]) || String(r[cExp] || "").trim()
    }));
  if (!_criRows.length) { showToast("ไม่มีแถวข้อมูลในไฟล์", "error"); return; }

  await criPreview();
}

function criMode() {
  return document.querySelector('input[name="criMode"]:checked')?.value === "overwrite" ? "overwrite" : "skip";
}

// ── พรีวิว = ผลซ้อมนำเข้าจากเซิร์ฟเวอร์ ──
async function criPreview() {
  if (!_criRows) return;
  const res = await crCallServer("importLots",
    { rows: _criRows, mode: criMode(), dryRun: true, employeeName: currentUser });
  if (!res || !res.ok) { showToast("ตรวจไฟล์ไม่สำเร็จ: " + ((res && res.message) || ""), "error"); return; }

  const ST = {
    added:   { chip: '<span class="sq-chip ok">➕ ล็อตใหม่</span>' },
    updated: { chip: '<span class="sq-chip high">✏️ ทับล็อตเดิม</span>' },
    skipped: { chip: '<span class="sq-chip">⏭ ข้าม (มีล็อตนี้แล้ว)</span>' },
    error:   { chip: '<span class="sq-chip crit">✕ ผิด</span>' }
  };
  const body = res.results.map(x => {
    const src = _criRows[x.i] || {};
    return `<tr${x.status === "error" ? ' style="background:var(--sq-crit-bg);"' : ""}>
      <td>${x.i + 2}</td>
      <td>${escapeHtml(x.name || src.name || src.barcode || "-")}</td>
      <td class="n">${escapeHtml(String(src.qty ?? ""))}</td>
      <td>${escapeHtml(String(src.mfg || ""))}</td>
      <td>${escapeHtml(String(src.exp || ""))}</td>
      <td>${ST[x.status].chip}${x.message ? `<div class="sq-meter-note" style="color:var(--sq-crit);">${escapeHtml(x.message)}</div>` : ""}</td>
    </tr>`;
  }).join("");

  const wrap = document.getElementById("criPreviewWrap");
  wrap.style.display = "";
  wrap.innerHTML = `
    <div class="sq-card-note" style="margin-bottom:8px;">
      📄 ${escapeHtml(_criFileName)} · ${res.results.length} แถว —
      ➕ ใหม่ ${res.added} · ✏️ ทับ ${res.updated} · ⏭ ข้าม ${res.skipped} ·
      <span style="color:${res.errors ? "var(--sq-crit)" : "var(--sq-muted)"};font-weight:800;">✕ ผิด ${res.errors}</span>
      ${res.errors ? "<br>แถวที่ผิดจะถูกข้าม ไม่ถูกนำเข้า" : ""}
    </div>
    <div class="sq-tablewrap" style="max-height:320px;overflow-y:auto;"><table class="sq-table">
      <thead><tr><th>แถวในไฟล์</th><th>สินค้า</th><th class="n">จำนวน</th><th>วันผลิต</th><th>วันหมดอายุ</th><th>ผลตรวจ</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;

  const importable = res.added + res.updated;
  const btn = document.getElementById("criConfirmBtn");
  btn.disabled = importable === 0;
  btn.textContent = importable ? `✅ ยืนยันนำเข้า ${importable} ล็อต` : "ไม่มีแถวที่นำเข้าได้";
}

// ── ยืนยัน = เซิร์ฟเวอร์ทำซ้ำแบบไม่ dry (ตรวจใหม่อีกรอบก่อนเขียนเสมอ) ──
async function criConfirm() {
  if (!_criRows) return;
  const btn = document.getElementById("criConfirmBtn");
  btn.disabled = true;
  const res = await crCallServer("importLots",
    { rows: _criRows, mode: criMode(), dryRun: false, employeeName: currentUser });
  if (!res || !res.ok) {
    showToast("นำเข้าไม่สำเร็จ: " + ((res && res.message) || ""), "error");
    btn.disabled = false;
    return;
  }
  showToast(`นำเข้าแล้ว ➕ ${res.added} ล็อตใหม่ · ✏️ ทับ ${res.updated}` +
            (res.errors ? ` · ข้ามแถวผิด ${res.errors}` : ""), "success");
  criClose();
  // ดึงยอดใหม่ให้เห็นทันที
  if (typeof crRefreshIfStale === "function") crRefreshIfStale(true);
}
