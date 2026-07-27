// ═════════════════════════════════════════════
// share.js — 🔗 แชร์แอปให้พนักงาน (ลิงก์ + QR Code)
//   ใช้ QRCode.js ที่โหลดอยู่แล้วใน index.html
// ═════════════════════════════════════════════

// ที่อยู่แอปบน production (2 ที่ สำรองกัน)
const SHARE_TARGETS = [
  { key: "netlify", label: "Netlify (แนะนำ)", url: "https://stock-sqfmlm.netlify.app/" },
  { key: "pages",   label: "GitHub Pages",     url: "https://kungrckmk.github.io/appstock/" }
];

let _shareUrl = "";

function _shareDefaultUrl() {
  // ถ้าเปิดจาก production อยู่แล้ว ใช้ที่อยู่นั้น — ไม่งั้นใช้ Netlify
  const here = location.origin + location.pathname.replace(/(index|mobile)\.html$/, "");
  if (/^https?:\/\/(localhost|127\.|192\.168\.|10\.)/.test(here)) return SHARE_TARGETS[0].url;
  return here;
}

function openShareApp() {
  _shareUrl = _shareDefaultUrl();
  const sel = document.getElementById("shareTargetSel");
  if (sel) {
    const opts = SHARE_TARGETS.slice();
    if (!opts.some(o => o.url === _shareUrl)) opts.unshift({ key: "current", label: "ลิงก์ที่ใช้อยู่ตอนนี้", url: _shareUrl });
    sel.innerHTML = opts.map(o => `<option value="${escapeAttr(o.url)}">${escapeHtml(o.label)}</option>`).join("");
    sel.value = _shareUrl;
  }
  document.getElementById("shareAppModal").classList.remove("hidden");
  shareRenderQr();
}

function closeShareApp() {
  document.getElementById("shareAppModal").classList.add("hidden");
}

function shareOnTargetChange() {
  _shareUrl = document.getElementById("shareTargetSel").value;
  shareRenderQr();
}

function shareRenderQr() {
  const box = document.getElementById("shareQrBox");
  if (!box) return;
  box.innerHTML = "";
  document.getElementById("shareUrlText").textContent = _shareUrl;
  try {
    new QRCode(box, { text: _shareUrl, width: 230, height: 230, correctLevel: QRCode.CorrectLevel.M });
  } catch (e) {
    box.innerHTML = '<p style="color:#dc2626;font-weight:700;">สร้าง QR ไม่สำเร็จ</p>';
  }
}

function _shareQrDataUrl() {
  const img = document.querySelector("#shareQrBox img");
  const cv  = document.querySelector("#shareQrBox canvas");
  return img ? img.src : (cv ? cv.toDataURL("image/png") : null);
}

async function shareCopyLink() {
  try {
    await navigator.clipboard.writeText(_shareUrl);
    showToast("คัดลอกลิงก์แล้ว ✅", "success");
  } catch (e) {
    // สำรอง: เลือกข้อความให้ผู้ใช้กด Ctrl+C เอง
    const r = document.createRange();
    r.selectNode(document.getElementById("shareUrlText"));
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    showToast("กด Ctrl+C เพื่อคัดลอก", "warn");
  }
}

async function shareNative() {
  const data = { title: "ระบบจัดการสต๊อก SQF & MLM", text: "เข้าใช้งานระบบสต๊อกได้ที่ลิงก์นี้", url: _shareUrl };
  if (navigator.share) {
    try { await navigator.share(data); } catch (e) { /* ผู้ใช้กดยกเลิก */ }
  } else {
    shareCopyLink();
  }
}

function shareDownloadQr() {
  const src = _shareQrDataUrl();
  if (!src) { showToast("ไม่พบ QR", "error"); return; }
  const a = document.createElement("a");
  a.href = src; a.download = "QR_เข้าใช้ระบบสต๊อก.png"; a.click();
  showToast("ดาวน์โหลด QR แล้ว", "success");
}

// พิมพ์ใบ QR สำหรับติดบอร์ด — มีวิธีติดตั้งลงหน้าจอโฮมด้วย
function sharePrintQr() {
  const src = _shareQrDataUrl();
  if (!src) { showToast("ไม่พบ QR", "error"); return; }
  const w = window.open("", "", "width=800,height=1000");
  if (!w) { showToast("เบราว์เซอร์บล็อกหน้าต่างใหม่", "warn"); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR เข้าใช้ระบบสต๊อก</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700;800&display=swap');
      body{font-family:Sarabun,sans-serif;text-align:center;padding:40px 30px;margin:0;}
      h1{font-size:34px;font-weight:800;margin:0 0 6px;color:#0f172a;}
      .sub{font-size:17px;color:#475569;font-weight:700;margin-bottom:26px;}
      img{width:340px;height:340px;border:10px solid #0f172a;border-radius:20px;}
      .url{font-family:monospace;font-size:15px;color:#334155;margin-top:18px;word-break:break-all;}
      .steps{margin:32px auto 0;max-width:520px;text-align:left;background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px 24px;}
      .steps h2{font-size:18px;margin:0 0 12px;color:#0f172a;}
      .steps ol{margin:0;padding-left:22px;font-size:15px;line-height:1.9;color:#1e293b;}
      .note{margin-top:18px;font-size:13px;color:#64748b;}
      @media print{ body{padding:20px;} .noprint{display:none;} }
    </style></head><body>
    <h1>📦 ระบบจัดการสต๊อก</h1>
    <div class="sub">สุพรรณคิวฟู้ดส์ | แม่ละมาย</div>
    <img src="${src}" alt="QR">
    <div class="url">${escapeHtml(_shareUrl)}</div>
    <div class="steps">
      <h2>วิธีเข้าใช้งาน</h2>
      <ol>
        <li>เปิดกล้องมือถือ แล้วสแกน QR ด้านบน</li>
        <li>กดลิงก์ที่ขึ้นมา ระบบจะเปิดในเบราว์เซอร์</li>
        <li>ใส่ชื่อพนักงานเพื่อเข้าใช้งาน (ถ้ายังไม่มีบัญชี กด "สมัครใช้งาน" แล้วรอหัวหน้าอนุมัติ)</li>
        <li><b>ติดตั้งลงหน้าจอโฮม</b> เพื่อเปิดง่ายครั้งต่อไป:<br>
            • Android: กดเมนู ⋮ → "เพิ่มลงในหน้าจอหลัก"<br>
            • iPhone: กดปุ่มแชร์ ⬆️ → "เพิ่มไปยังหน้าจอโฮม"</li>
      </ol>
    </div>
    <div class="note">พิมพ์แผ่นนี้ติดบอร์ดให้พนักงานสแกนได้เลย</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},400);}<\/script>
    </body></html>`);
  w.document.close();
}
