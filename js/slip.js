// ═══════════════════════════════════════════════════════════
// slip.js — 🧾 ใบเบิกวัตถุดิบ
//
//   วาดใบลง canvas ด้วย Canvas 2D ตรงๆ ไม่พึ่ง library ภายนอก
//   แล้วใช้ "รูปเดียวกัน" ทั้งดูบนจอ / พิมพ์ / ดาวน์โหลด
//   → สิ่งที่เห็นบนจอ = สิ่งที่พิมพ์ออกมา = ไฟล์ที่โหลดไป เหมือนกันแน่นอน
//
//   ขนาด A5 แนวตั้งที่ 200dpi (1165 x 1654) พิมพ์แล้วคมพอสำหรับเก็บเข้าแฟ้ม
// ═══════════════════════════════════════════════════════════

const SLIP_W = 1165, SLIP_H = 1654;
let _slipDataUrl = "";
let _slipDocNo   = "";

/** โหลดโลโก้ไว้ล่วงหน้า ถ้าไม่มีไฟล์ก็วาดใบได้ตามปกติ */
let _slipLogo = null, _slipLogoTried = false;
function _slipLoadLogo() {
  return new Promise(resolve => {
    if (_slipLogoTried) return resolve(_slipLogo);
    _slipLogoTried = true;
    const img = new Image();
    img.onload  = () => { _slipLogo = img; resolve(img); };
    img.onerror = () => { _slipLogo = null; resolve(null); };
    img.src = (typeof logoUrl === "function") ? logoUrl() : "assets/logo.png";
  });
}

function _slipThaiDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return "-";
  const mm = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  return d.getDate() + " " + mm[d.getMonth()] + " " + (d.getFullYear() + 543) +
         "  เวลา " + String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0") + " น.";
}

/**
 * วาดใบเบิก
 * @param {{docNo,sku,name,qty,unit,balance,user,module,at}} s
 * @returns {Promise<HTMLCanvasElement>}
 */
async function slipDraw(s) {
  const logo = await _slipLoadLogo();
  const c = document.createElement("canvas");
  c.width = SLIP_W; c.height = SLIP_H;
  const x = c.getContext("2d");
  const F = '"Leelawadee UI","Noto Sans Thai","Sarabun",system-ui,sans-serif';
  const M = 90;                       // ระยะขอบกระดาษ
  const INK = "#16241b", MUTED = "#6c8074", LINE = "#c9d4cc", GREEN = "#0e7a3f";

  x.fillStyle = "#ffffff"; x.fillRect(0, 0, SLIP_W, SLIP_H);

  let y = M;

  // ── หัวกระดาษ ──
  if (logo) {
    const lw = 380, lh = lw * (logo.height / logo.width);
    x.drawImage(logo, M, y, lw, lh);
    y += lh + 26;
  } else {
    x.fillStyle = INK; x.font = "bold 40px " + F;
    x.fillText("สุพรรณคิวฟู้ดส์ · แม่ละมาย", M, y + 40); y += 76;
  }

  x.fillStyle = INK; x.font = "bold 52px " + F;
  x.fillText("ใบเบิกวัตถุดิบ", M, y + 44);

  // กล่องเลขที่เอกสาร มุมขวาบน
  const bw = 400, bh = 108, bx = SLIP_W - M - bw, by = M;
  x.strokeStyle = GREEN; x.lineWidth = 3;
  x.strokeRect(bx, by, bw, bh);
  x.fillStyle = MUTED; x.font = "24px " + F;
  x.fillText("เลขที่เอกสาร", bx + 18, by + 34);
  x.fillStyle = GREEN; x.font = "bold 38px " + F;
  x.fillText(s.docNo || "-", bx + 18, by + 80);

  y += 78;
  x.strokeStyle = INK; x.lineWidth = 4;
  x.beginPath(); x.moveTo(M, y); x.lineTo(SLIP_W - M, y); x.stroke();
  y += 44;

  // ── ข้อมูลหัวเรื่อง ──
  const factory = s.module === "SQF" ? "สุพรรณคิวฟู้ดส์ (SQF)" : "แม่ละมาย (MLM)";
  const info = [
    ["โรงงาน", factory],
    ["วันที่เบิก", _slipThaiDate(s.at)],
    ["ผู้เบิก", (typeof personName === "function" ? personName(s.user) : s.user) || "-"]
  ];
  x.font = "28px " + F;
  info.forEach(([k, v]) => {
    x.fillStyle = MUTED; x.fillText(k, M, y);
    x.fillStyle = INK;   x.font = "bold 28px " + F; x.fillText(String(v), M + 200, y);
    x.font = "28px " + F;
    y += 46;
  });

  y += 26;

  // ── ตารางรายการ ──
  const cols = [
    { t:"รหัส",    w:230, a:"left"  },
    { t:"รายการ",  w:415, a:"left"  },
    { t:"จำนวน",   w:180, a:"right" },
    { t:"หน่วย",   w:160, a:"left"  }
  ];
  const tW = cols.reduce((a, b) => a + b.w, 0);
  const rowH = 76;

  x.fillStyle = "#eef3ef"; x.fillRect(M, y, tW, 58);
  x.strokeStyle = LINE; x.lineWidth = 2; x.strokeRect(M, y, tW, 58);
  x.fillStyle = MUTED; x.font = "bold 24px " + F;
  let cx = M;
  cols.forEach(col => {
    if (col.a === "right") { x.textAlign = "right"; x.fillText(col.t, cx + col.w - 16, y + 38); }
    else                   { x.textAlign = "left";  x.fillText(col.t, cx + 16, y + 38); }
    cx += col.w;
  });
  x.textAlign = "left";
  y += 58;

  x.strokeStyle = LINE; x.strokeRect(M, y, tW, rowH);
  const cell = [String(s.sku || "-"), String(s.name || "-"),
                Number(s.qty || 0).toLocaleString(), String(s.unit || "")];
  cx = M;
  cols.forEach((col, i) => {
    x.fillStyle = INK;
    x.font = (i === 2 ? "bold 34px " : "28px ") + F;
    let txt = cell[i];
    // ชื่อยาวเกินช่อง ตัดแล้วใส่จุด
    if (i === 1) {
      while (x.measureText(txt).width > col.w - 32 && txt.length > 4) txt = txt.slice(0, -2);
      if (txt !== cell[i]) txt += "…";
    }
    if (col.a === "right") { x.textAlign = "right"; x.fillText(txt, cx + col.w - 16, y + 50); }
    else                   { x.textAlign = "left";  x.fillText(txt, cx + 16, y + 50); }
    cx += col.w;
  });
  x.textAlign = "left";
  y += rowH + 30;

  // ── ยอดคงเหลือหลังเบิก ──
  x.fillStyle = "#f4f7f4"; x.fillRect(M, y, tW, 74);
  x.strokeStyle = LINE; x.strokeRect(M, y, tW, 74);
  x.fillStyle = MUTED; x.font = "26px " + F;
  x.fillText("ยอดคงเหลือหลังเบิก", M + 20, y + 46);
  x.fillStyle = INK; x.font = "bold 34px " + F;
  x.textAlign = "right";
  x.fillText(Number(s.balance || 0).toLocaleString() + " " + (s.unit || ""), M + tW - 20, y + 47);
  x.textAlign = "left";
  y += 74 + 90;

  // ── ช่องเซ็น 3 ช่อง ──
  const roles = ["ผู้เบิก", "ผู้ตรวจสอบ", "ผู้อนุมัติ"];
  const sw = tW / 3, sy = y + 90;
  roles.forEach((r, i) => {
    const sx = M + sw * i;
    x.strokeStyle = INK; x.lineWidth = 2;
    x.beginPath(); x.moveTo(sx + 24, sy); x.lineTo(sx + sw - 24, sy); x.stroke();
    x.fillStyle = MUTED; x.font = "26px " + F; x.textAlign = "center";
    x.fillText(r, sx + sw / 2, sy + 42);
    x.fillStyle = INK; x.font = "24px " + F;
    x.fillText(i === 0 ? "( " + ((typeof personName === "function" ? personName(s.user) : s.user) || "-") + " )"
                       : "( ....................... )", sx + sw / 2, sy + 80);
    x.fillStyle = MUTED; x.font = "22px " + F;
    x.fillText("วันที่ ......../......../........", sx + sw / 2, sy + 118);
  });
  x.textAlign = "left";

  // ── ท้ายกระดาษ ──
  x.fillStyle = MUTED; x.font = "22px " + F;
  x.fillText("เอกสารนี้ออกโดยระบบจัดการสต๊อกอัตโนมัติ — เก็บไว้เพื่อการตรวจสอบประจำปี",
             M, SLIP_H - M - 34);
  x.fillText("พิมพ์เมื่อ " + _slipThaiDate(new Date().toISOString()), M, SLIP_H - M);

  return c;
}

// ─────────────────────────────────────────────
// เปิดหน้าต่างใบเบิก
// ─────────────────────────────────────────────
async function openWithdrawSlip(s) {
  if (!s || !s.docNo) { showToast("รายการนี้ไม่มีเลขที่ใบเบิก", "warn"); return; }
  _slipDocNo = s.docNo;
  const modal = document.getElementById("slipModal");
  const box   = document.getElementById("slipPreview");
  if (!modal || !box) return;

  box.innerHTML = '<p class="sq-empty">⏳ กำลังสร้างใบเบิก...</p>';
  modal.classList.remove("hidden");
  document.getElementById("slipDocNo").textContent = s.docNo;

  const canvas = await slipDraw(s);
  _slipDataUrl = canvas.toDataURL("image/png");
  box.innerHTML = "";
  const img = document.createElement("img");
  img.src = _slipDataUrl;
  img.alt = "ใบเบิก " + s.docNo;
  img.style.cssText = "width:100%;height:auto;display:block;border:1px solid var(--sq-line);border-radius:8px;";
  box.appendChild(img);
}

function closeWithdrawSlip() {
  const m = document.getElementById("slipModal");
  if (m) m.classList.add("hidden");
}

function slipDownload() {
  if (!_slipDataUrl) return;
  const a = document.createElement("a");
  a.href = _slipDataUrl;
  a.download = "ใบเบิก_" + (_slipDocNo || "slip") + ".png";
  a.click();
  showToast("บันทึกรูปใบเบิกแล้ว — นำไปพิมพ์และเซ็นได้", "success", 4500);
}

function slipPrint() {
  if (!_slipDataUrl) return;
  const w = window.open("", "", "width=900,height=1200");
  if (!w) { showToast("เบราว์เซอร์บล็อกหน้าต่างใหม่", "warn"); return; }
  w.document.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>ใบเบิก ' + _slipDocNo + '</title>' +
    '<style>@page{size:A5 portrait;margin:0}' +
    'body{margin:0;display:flex;justify-content:center;background:#fff}' +
    'img{width:100%;max-width:760px;height:auto}' +
    '@media print{img{width:100%;max-width:none}}</style></head><body>' +
    '<img src="' + _slipDataUrl + '" onload="setTimeout(function(){window.print();},250)">' +
    '</body></html>');
  w.document.close();
}
