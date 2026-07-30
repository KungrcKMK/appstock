// ═══════════════════════════════════════════════════════════
// import.js — 📥 นำเข้าวัตถุดิบจากไฟล์ (CSV)
//
//   หลักการ: ต้องเห็นก่อนบันทึกเสมอ
//   อ่านไฟล์ → ตรวจทีละแถว → โชว์ตารางพรีวิว → ค่อยกดยืนยัน
//   ไม่มีทางที่กดปุ่มเดียวแล้วข้อมูลเข้าเลย
// ═══════════════════════════════════════════════════════════

let _impRows = [];      // แถวที่ผ่านการแปลงแล้ว พร้อมส่ง
let _impFileName = "";

// ── ชื่อหัวคอลัมน์ที่ยอมรับ (รองรับหลายแบบ เผื่อพิมพ์ไม่ตรงเป๊ะ) ──
const IMP_FIELDS = [
  { key:"sku",         label:"SKU",          aliases:["sku","รหัส","รหัสสินค้า","รหัสวัตถุดิบ"] },
  { key:"name",        label:"ชื่อวัตถุดิบ",  aliases:["name","ชื่อ","ชื่อวัตถุดิบ","ชื่อสินค้า","รายการ"], required:true },
  { key:"qty",         label:"คงเหลือ",      aliases:["qty","quantity","คงเหลือ","จำนวน","ยอดคงเหลือ","ยอด"] },
  { key:"unit",        label:"หน่วยนับ",     aliases:["unit","หน่วย","หน่วยนับ"] },
  { key:"min",         label:"จุดสั่งซื้อ",   aliases:["min","minimum","จุดสั่งซื้อ","ขั้นต่ำ","จุดสั่งซื้อเพิ่ม"] },
  { key:"dailyUsage",  label:"ใช้ต่อวัน",    aliases:["dailyusage","daily","ใช้ต่อวัน","ใช้/วัน","อัตราใช้ต่อวัน"] },
  { key:"expiryDate",  label:"วันหมดอายุ",   aliases:["expirydate","expiry","exp","วันหมดอายุ","หมดอายุ"] },
  { key:"alertDays",   label:"เตือนล่วงหน้า", aliases:["alertdays","alert","เตือนล่วงหน้า","เตือนก่อนกี่วัน"] }
];

// ─────────────────────────────────────────────
// เปิด / ปิด
// ─────────────────────────────────────────────
function openRawImport() {
  _impRows = []; _impFileName = "";
  document.getElementById("impFileInput").value = "";
  document.getElementById("impResult").innerHTML = "";
  document.getElementById("impPreviewWrap").style.display = "none";
  document.getElementById("impDropZone").style.display = "";
  document.getElementById("impModal").classList.remove("hidden");
  const t = document.getElementById("impTargetName");
  if (t) t.textContent = rawCurrentModule === "SQF" ? "วัตถุดิบ SQF (สุพรรณคิวฟู้ดส์)" : "วัตถุดิบ MLM (แม่ละมาย)";
}
function closeRawImport() {
  document.getElementById("impModal").classList.add("hidden");
}

// ─────────────────────────────────────────────
// ไฟล์ตัวอย่าง — ใส่ BOM ให้ Excel เปิดภาษาไทยไม่เพี้ยน
// ─────────────────────────────────────────────
function impDownloadTemplate() {
  const head = IMP_FIELDS.map(f => f.label).join(",");
  const rows = [
    ["", "น้ำตาลทราย", "1200", "กก.", "500", "20", "31/12/2569", "7"],
    ["", "ถุงสุญญากาศ 20x30", "24500", "ใบ", "8000", "300", "", ""]
  ].map(r => r.join(",")).join("\n");
  const csv = "﻿" + head + "\n" + rows + "\n";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  a.download = `ตัวอย่างไฟล์นำเข้าวัตถุดิบ_${rawCurrentModule}.csv`;
  a.click();
  showToast("ดาวน์โหลดไฟล์ตัวอย่างแล้ว — กรอกข้อมูลแล้วเซฟเป็น CSV UTF-8", "success", 4500);
}

// ─────────────────────────────────────────────
// แยกข้อมูล CSV — เขียนเองเพราะต้องรองรับฟิลด์ที่มีเครื่องหมายคำพูดและคอมมาข้างใน
// ─────────────────────────────────────────────
function impParseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);   // ตัด BOM
  const rows = [];
  let row = [], cell = "", inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuote = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"')                 { inQuote = true; continue; }
    if (ch === ",")                 { row.push(cell); cell = ""; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(c => String(c).trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some(c => String(c).trim() !== "")) rows.push(row);
  return rows;
}

/** ภาษาไทยเพี้ยนจากการเซฟผิด encoding — ดูจากรูปแบบตัวอักษรที่โผล่มาแทน */
function impLooksGarbled(text) {
  const bad = (text.match(/[ÃÂà][-¿]/g) || []).length;
  return bad > 5;
}

// ─────────────────────────────────────────────
// แปลงค่าให้เป็นรูปแบบที่ระบบใช้
// ─────────────────────────────────────────────
/** ตัวเลขที่ Excel ใส่คอมมามา → ตัวเลขจริง */
function impNum(v) {
  const s = String(v == null ? "" : v).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return isNaN(n) ? NaN : n;
}

/**
 * วันหมดอายุ — รับได้ 4 แบบ แปลงเป็น yyyy-mm-dd ทั้งหมด
 *   31/12/2569  (พ.ศ.)      → 2026-12-31
 *   31/12/2026  (ค.ศ.)      → 2026-12-31
 *   2026-12-31              → คงเดิม
 *   46022                   → เลขวันที่ของ Excel
 * คืน null ถ้าว่าง / undefined ถ้าอ่านไม่ออก
 */
function impDate(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    let y = +m[1];
    if (y > 2400) y -= 543;                       // เผื่อเขียน 2569-12-31
    return _impIso(y, +m[2], +m[3]);
  }
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    let y = +m[3];
    if (y > 2400) y -= 543;                       // พ.ศ. → ค.ศ.
    return _impIso(y, +m[2], +m[1]);
  }
  if (/^\d+$/.test(s)) {
    const serial = +s;
    if (serial > 20000 && serial < 80000) {       // เลขวันที่จาก Excel
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return _impIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }
  return undefined;                               // อ่านไม่ออก
}
function _impIso(y, mo, d) {
  if (!(y >= 1900 && y <= 2200) || !(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31)) return undefined;
  return y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

// ─────────────────────────────────────────────
// รับไฟล์
// ─────────────────────────────────────────────
function impOnFile(input) {
  const f = input.files && input.files[0];
  if (f) impReadFile(f);
}
function impOnDrop(e) {
  e.preventDefault();
  document.getElementById("impDropZone").classList.remove("drag");
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) impReadFile(f);
}
function impOnDragOver(e) { e.preventDefault(); document.getElementById("impDropZone").classList.add("drag"); }
function impOnDragLeave()  { document.getElementById("impDropZone").classList.remove("drag"); }

function impReadFile(file) {
  const nm = String(file.name || "").toLowerCase();
  if (/\.xlsx?$/.test(nm)) {
    impShowError(
      "ไฟล์นี้เป็น Excel (" + file.name + ") อ่านตรงๆ ไม่ได้",
      'ใน Excel กด <b>File → Save As</b> แล้วเลือกชนิดไฟล์เป็น <b>CSV UTF-8 (Comma delimited)</b> จากนั้นลากไฟล์ .csv มาวางอีกครั้ง'
    );
    return;
  }
  if (!/\.csv$/.test(nm) && file.type && file.type.indexOf("text") !== 0) {
    impShowError("รับได้เฉพาะไฟล์ .csv", "ถ้าเป็นไฟล์ Excel ให้ Save As เป็น CSV UTF-8 ก่อน");
    return;
  }
  _impFileName = file.name;
  const rd = new FileReader();
  rd.onload = () => impBuildPreview(String(rd.result || ""));
  rd.onerror = () => impShowError("อ่านไฟล์ไม่สำเร็จ", "ลองเซฟไฟล์ใหม่แล้วลากมาวางอีกครั้ง");
  rd.readAsText(file, "utf-8");
}

function impShowError(title, hint) {
  document.getElementById("impPreviewWrap").style.display = "none";
  document.getElementById("impDropZone").style.display = "";
  document.getElementById("impResult").innerHTML =
    `<div class="sq-note warn"><b>⚠️ ${escapeHtml(title)}</b><br>${hint || ""}</div>`;
}

// ─────────────────────────────────────────────
// สร้างตารางพรีวิว
// ─────────────────────────────────────────────
function impBuildPreview(text) {
  document.getElementById("impResult").innerHTML = "";

  if (impLooksGarbled(text)) {
    impShowError("ภาษาไทยในไฟล์เพี้ยน — เซฟไฟล์ผิดรูปแบบ",
      'ตอนเซฟใน Excel ต้องเลือก <b>CSV UTF-8 (Comma delimited)</b> ไม่ใช่ <b>CSV (Comma delimited)</b> เฉยๆ');
    return;
  }

  const table = impParseCsv(text);
  if (table.length < 2) {
    impShowError("ไฟล์ไม่มีข้อมูล", "ต้องมีบรรทัดหัวคอลัมน์ 1 บรรทัด และข้อมูลอย่างน้อย 1 บรรทัด");
    return;
  }

  // ── จับคู่หัวคอลัมน์ ──
  const norm = s => String(s || "").replace(/﻿/g, "").trim().toLowerCase().replace(/\s+/g, "");
  const head = table[0].map(norm);
  const idx = {};
  IMP_FIELDS.forEach(f => {
    let at = -1;
    for (let i = 0; i < head.length && at < 0; i++) {
      if (f.aliases.some(a => norm(a) === head[i])) at = i;
    }
    idx[f.key] = at;
  });

  if (idx.name < 0) {
    impShowError("หาคอลัมน์ \"ชื่อวัตถุดิบ\" ไม่เจอ",
      "หัวคอลัมน์ในไฟล์: <b>" + escapeHtml(table[0].join(" | ")) + "</b><br>" +
      "แนะนำให้กดดาวน์โหลดไฟล์ตัวอย่างแล้วกรอกทับ จะไม่พลาดเรื่องชื่อคอลัมน์");
    return;
  }

  const unmatched = head.filter((hh, i) =>
    hh && !IMP_FIELDS.some(f => idx[f.key] === i));

  // ── แปลง + ตรวจทีละแถว ──
  _impRows = [];
  const view = [];
  const seen = {};
  for (let r = 1; r < table.length; r++) {
    const get = k => idx[k] >= 0 ? String(table[r][idx[k]] == null ? "" : table[r][idx[k]]).trim() : "";
    const name = get("name");
    const unit = get("unit");
    const sku  = get("sku");
    const line = r + 1;                     // เลขบรรทัดในไฟล์จริง (นับหัวคอลัมน์ด้วย)
    const errs = [];

    if (!name) errs.push("ไม่ได้กรอกชื่อ");
    const key = name.toLowerCase();
    if (name && seen[key]) errs.push("ชื่อซ้ำกับบรรทัด " + seen[key]);
    else if (name) seen[key] = line;

    const qty   = impNum(get("qty"));
    const min   = impNum(get("min"));
    const daily = impNum(get("dailyUsage"));
    const alert = impNum(get("alertDays"));
    if (isNaN(qty))   errs.push("คงเหลือไม่ใช่ตัวเลข");
    if (isNaN(min))   errs.push("จุดสั่งซื้อไม่ใช่ตัวเลข");
    if (isNaN(daily)) errs.push("ใช้ต่อวันไม่ใช่ตัวเลข");
    if (isNaN(alert)) errs.push("เตือนล่วงหน้าไม่ใช่ตัวเลข");
    if (qty   !== null && !isNaN(qty)   && qty   < 0) errs.push("คงเหลือติดลบ");
    if (min   !== null && !isNaN(min)   && min   < 0) errs.push("จุดสั่งซื้อติดลบ");
    if (daily !== null && !isNaN(daily) && daily < 0) errs.push("ใช้ต่อวันติดลบ");

    const rawExp = get("expiryDate");
    const exp = impDate(rawExp);
    if (exp === undefined) errs.push("วันหมดอายุอ่านไม่ออก (" + rawExp + ")");

    const ok = errs.length === 0;
    view.push({ line, sku, name, qty, unit, min, daily, exp, rawExp, ok, errs });
    if (ok) {
      _impRows.push({
        sku: sku, name: name, unit: unit,
        qty: qty, min: min, dailyUsage: daily, alertDays: alert,
        expiryDate: exp || ""
      });
    }
  }

  const nOk  = view.filter(v => v.ok).length;
  const nBad = view.length - nOk;

  // ── วาดตาราง ──
  const fmt = v => v === null || v === undefined ? '<span class="sq-dim">—</span>'
                  : `<span class="sq-num" style="font-size:12.5px;">${Number(v).toLocaleString()}</span>`;
  const body = view.map(v => `
    <tr class="${v.ok ? "" : "sev-crit"}">
      <td class="rail"></td>
      <td class="c sq-dim" style="font-family:var(--sq-mono);font-size:11.5px;">${v.line}</td>
      <td>${v.ok ? '<span class="sq-chip ok">✓ พร้อม</span>'
                 : `<span class="sq-chip crit">⚠️ ${escapeHtml(v.errs[0])}</span>`}</td>
      <td><span class="sq-name">${escapeHtml(v.name || "—")}</span>
          ${v.sku ? `<div class="sq-meta"><span>${escapeHtml(v.sku)}</span></div>` : ""}</td>
      <td class="n">${fmt(v.qty)}<span class="sq-unit">${escapeHtml(v.unit || "")}</span></td>
      <td class="n">${fmt(v.min)}</td>
      <td class="n">${fmt(v.daily)}</td>
      <td class="c sq-dim" style="font-family:var(--sq-mono);font-size:11.5px;">${v.exp ? escapeHtml(v.exp) : "—"}</td>
    </tr>`).join("");

  document.getElementById("impDropZone").style.display = "none";
  document.getElementById("impPreviewWrap").style.display = "";
  document.getElementById("impPreviewWrap").innerHTML = `
    <div class="sq-card" style="margin-bottom:10px;">
      <div class="sq-card-head">
        <span class="sq-card-title">📄 ${escapeHtml(_impFileName)}</span>
        <span class="sq-card-note">${view.length} บรรทัด</span>
      </div>
      <div class="sq-tiles" style="margin:0;border:0;border-radius:0;box-shadow:none;border-top:1px solid var(--sq-line);">
        <div class="sq-tile">
          <div class="sq-tile-label"><span class="sq-dot" style="background:var(--sq-accent)"></span>พร้อมนำเข้า</div>
          <div class="sq-tile-num" style="color:var(--sq-accent)">${nOk}</div>
        </div>
        <div class="sq-tile">
          <div class="sq-tile-label"><span class="sq-dot" style="background:var(--sq-crit)"></span>ต้องแก้ก่อน</div>
          <div class="sq-tile-num"${nBad ? ' style="color:var(--sq-crit)"' : ""}>${nBad}</div>
          <div class="sq-tile-note">${nBad ? "บรรทัดพวกนี้จะไม่ถูกนำเข้า" : "ไม่มีปัญหา"}</div>
        </div>
      </div>
    </div>

    ${unmatched.length ? `<div class="sq-note warn">คอลัมน์ที่ระบบไม่รู้จักและจะไม่นำเข้า: <b>${escapeHtml(unmatched.join(", "))}</b></div>` : ""}

    <div class="sq-card">
      <div class="sq-tablewrap" style="max-height:340px;overflow-y:auto;">
        <table class="sq-table" style="min-width:720px;">
          <thead><tr>
            <th class="rail"></th><th class="c">บรรทัด</th><th>สถานะ</th><th>ชื่อวัตถุดิบ</th>
            <th class="n">คงเหลือ</th><th class="n">จุดสั่งซื้อ</th><th class="n">ใช้/วัน</th><th class="c">หมดอายุ</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>

    <div class="sq-note">
      <b>ของที่มีอยู่ในระบบแล้ว จะทำอย่างไร</b>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:7px;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:700;">
          <input type="radio" name="impMode" value="skip" checked> ข้ามไป ไม่แตะของเดิม
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:700;">
          <input type="radio" name="impMode" value="overwrite"> อัปเดตทับ (เฉพาะช่องที่กรอกมาในไฟล์)
        </label>
      </div>
    </div>

    <div style="display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end;margin-top:4px;">
      <button onclick="openRawImport()" class="sq-btn">เลือกไฟล์อื่น</button>
      <button onclick="impConfirm(event)" id="impConfirmBtn" class="sq-btn sq-btn-primary"
              ${nOk ? "" : "disabled style=\"opacity:.5;cursor:not-allowed\""}>
        ✅ ยืนยันนำเข้า ${nOk} รายการ
      </button>
    </div>`;
}

// ─────────────────────────────────────────────
// ยืนยัน → ส่งขึ้นเซิร์ฟเวอร์
// ─────────────────────────────────────────────
async function impConfirm(evt) {
  if (!_impRows.length) { showToast("ไม่มีรายการที่พร้อมนำเข้า", "warn"); return; }
  const modeEl = document.querySelector('input[name="impMode"]:checked');
  const mode = modeEl ? modeEl.value : "skip";
  const label = rawCurrentModule === "SQF" ? "วัตถุดิบ SQF" : "วัตถุดิบ MLM";
  const warn = mode === "overwrite"
    ? "\n\n⚠️ โหมดอัปเดตทับ: ยอดของรายการที่มีอยู่แล้วจะถูกเขียนใหม่ตามไฟล์"
    : "";
  if (!confirm(`นำเข้า ${_impRows.length} รายการ เข้า ${label}?${warn}`)) return;

  await guardedClick(evt && evt.currentTarget, async () => {
    showLoading("กำลังนำเข้า " + _impRows.length + " รายการ...");
    try {
      const res = await rawFetch({ action: "IMPORT", rows: _impRows, mode: mode, user: currentUser });
      hideLoading();
      if (!res || res.status !== "success") {
        showToast((res && res.message) || "นำเข้าไม่สำเร็จ", "error", 5000);
        return;
      }
      impShowServerResult(res);
      rawLoadData();                       // โหลดตารางหลักใหม่ให้เห็นของที่เพิ่งเข้า
    } catch (e) {
      hideLoading();
      showToast("เชื่อมต่อไม่สำเร็จ: " + e.message, "error", 5000);
    }
  });
}

function impShowServerResult(res) {
  const s = res.summary || {};
  const chip = { created:"ok", updated:"warn", skipped:"", error:"crit" };
  const word = { created:"เพิ่มใหม่", updated:"อัปเดต", skipped:"ข้าม", error:"ผิดพลาด" };
  const rows = (res.results || []).map(x => `
    <tr>
      <td class="c sq-dim" style="font-family:var(--sq-mono);font-size:11.5px;">${x.line}</td>
      <td><span class="sq-chip ${chip[x.status] || ""}">${word[x.status] || x.status}</span></td>
      <td><span class="sq-name">${escapeHtml(x.name || "—")}</span>
          ${x.sku ? `<div class="sq-meta"><span>${escapeHtml(x.sku)}</span></div>` : ""}</td>
      <td class="sq-dim" style="font-size:12px;">${escapeHtml(x.message || "")}</td>
    </tr>`).join("");

  document.getElementById("impPreviewWrap").innerHTML = `
    <div class="sq-card" style="margin-bottom:10px;">
      <div class="sq-card-head"><span class="sq-card-title">✅ นำเข้าเสร็จแล้ว</span></div>
      <div class="sq-tiles" style="margin:0;border:0;border-radius:0;box-shadow:none;border-top:1px solid var(--sq-line);">
        <div class="sq-tile"><div class="sq-tile-label"><span class="sq-dot" style="background:var(--sq-accent)"></span>เพิ่มใหม่</div>
          <div class="sq-tile-num" style="color:var(--sq-accent)">${s.created || 0}</div></div>
        <div class="sq-tile"><div class="sq-tile-label"><span class="sq-dot" style="background:var(--sq-warn)"></span>อัปเดต</div>
          <div class="sq-tile-num">${s.updated || 0}</div></div>
        <div class="sq-tile"><div class="sq-tile-label"><span class="sq-dot"></span>ข้าม</div>
          <div class="sq-tile-num">${s.skipped || 0}</div></div>
        <div class="sq-tile"><div class="sq-tile-label"><span class="sq-dot" style="background:var(--sq-crit)"></span>ผิดพลาด</div>
          <div class="sq-tile-num"${s.error ? ' style="color:var(--sq-crit)"' : ""}>${s.error || 0}</div></div>
      </div>
    </div>
    <div class="sq-card">
      <div class="sq-tablewrap" style="max-height:320px;overflow-y:auto;">
        <table class="sq-table">
          <thead><tr><th class="c">บรรทัด</th><th>ผล</th><th>ชื่อวัตถุดิบ</th><th>รายละเอียด</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <div style="display:flex;gap:7px;justify-content:flex-end;margin-top:4px;">
      <button onclick="openRawImport()" class="sq-btn">นำเข้าไฟล์อื่น</button>
      <button onclick="closeRawImport()" class="sq-btn sq-btn-primary">เสร็จสิ้น</button>
    </div>`;
  showToast(`นำเข้าสำเร็จ — เพิ่มใหม่ ${s.created || 0} · อัปเดต ${s.updated || 0}`, "success", 5000);
}
