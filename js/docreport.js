// ═══════════════════════════════════════════════════════════
// docreport.js — 📋 รายงานใบเบิกรายเดือน
//
//   ใช้เทียบกับแฟ้มกระดาษเดือนละครั้ง จะได้รู้ว่าใบไหนขาดภายใน 30 วัน
//   ไม่ต้องรอออดิเตอร์มาปีละครั้งถึงจะรู้
//
//   ปุ่ม "รับทราบ" = หัวหน้าเข้ามากดว่าเห็นแล้ว
//   ระบบบันทึกชื่อคนกดและเวลาไว้ กดครั้งแรกเท่านั้นที่นับ
// ═══════════════════════════════════════════════════════════

let _drRows  = [];
let _drMonth = "";

const DR_MONTH_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

/** "2026-07" → "กรกฎาคม 2569" */
function _drMonthLabel(ym) {
  const full = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
                "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const p = String(ym || "").split("-");
  if (p.length < 2) return ym || "-";
  return full[Number(p[1]) - 1] + " " + (Number(p[0]) + 543);
}

/** เวลาที่เก็บเป็น ISO → "30 ก.ค. 2569 11:53" ตามเวลาเครื่อง */
function _drTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.getDate() + " " + DR_MONTH_TH[d.getMonth()] + " " + (d.getFullYear() + 543) +
         " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

// ─────────────────────────────────────────────
// เปิด / ปิด
// ─────────────────────────────────────────────
async function openDocReport() {
  const m = document.getElementById("drModal");
  if (!m) return;
  m.classList.remove("hidden");
  document.getElementById("drTarget").textContent =
    rawCurrentModule === "SQF" ? "วัตถุดิบ SQF (สุพรรณคิวฟู้ดส์)" : "วัตถุดิบ MLM (แม่ละมาย)";
  await drLoad("");            // ครั้งแรกไม่ระบุเดือน เพื่อดึงรายชื่อเดือนที่มีข้อมูล
}
function closeDocReport() {
  document.getElementById("drModal")?.classList.add("hidden");
}

// ─────────────────────────────────────────────
// โหลดข้อมูล
// ─────────────────────────────────────────────
async function drLoad(month) {
  const body = document.getElementById("drBody");
  body.innerHTML = '<p class="sq-empty">กำลังโหลด...</p>';
  try {
    const res = await rawFetch({ action: "DOCREPORT", month: month || "" });
    if (!res || res.status !== "success") {
      body.innerHTML = `<p class="sq-empty" style="color:var(--sq-crit);font-weight:700;">${escapeHtml((res && res.message) || "โหลดไม่สำเร็จ")}</p>`;
      return;
    }
    // ยังไม่ได้เลือกเดือน → ใช้เดือนล่าสุดที่มีข้อมูล
    if (!month && res.months && res.months.length) {
      _drMonth = res.months[0];
      drFillMonths(res.months, _drMonth);
      return drLoad(_drMonth);
    }
    _drMonth = month || "";
    if (res.months && res.months.length) drFillMonths(res.months, _drMonth);
    _drRows = res.rows || [];
    drRender();
  } catch (e) {
    body.innerHTML = `<p class="sq-empty" style="color:var(--sq-crit);font-weight:700;">เชื่อมต่อไม่สำเร็จ: ${escapeHtml(e.message)}</p>`;
  }
}

function drFillMonths(months, cur) {
  const sel = document.getElementById("drMonthSel");
  if (!sel) return;
  sel.innerHTML = months.map(m =>
    `<option value="${escapeAttr(m)}"${m === cur ? " selected" : ""}>${escapeHtml(_drMonthLabel(m))}</option>`).join("");
}
function drOnMonthChange() {
  drLoad(document.getElementById("drMonthSel").value);
}

// ─────────────────────────────────────────────
// วาดตาราง
// ─────────────────────────────────────────────
function drRender() {
  const body = document.getElementById("drBody");
  if (!_drRows.length) {
    body.innerHTML = '<p class="sq-empty">ไม่มีเอกสารในเดือนนี้</p>';
    document.getElementById("drAckAllBtn").style.display = "none";
    return;
  }
  const waiting = _drRows.filter(r => !r.ackBy).length;
  document.getElementById("drAckAllBtn").style.display = waiting ? "" : "none";
  document.getElementById("drAckAllBtn").textContent = "รับทราบทั้งหมด (" + waiting + " ใบ)";

  const rows = _drRows.map(r => {
    const acked = !!r.ackBy;
    return `
    <tr class="${acked ? "" : "sev-warn"}">
      <td class="rail"></td>
      <td><span class="sq-num" style="font-size:12px;">${escapeHtml(r.docNo)}</span>
          <div class="sq-meta"><span>${escapeHtml(_drTime(r.at))}</span></div></td>
      <td><span class="sq-name">${escapeHtml(r.name)}</span>
          <div class="sq-meta"><span>${escapeHtml(r.sku || "-")}</span><span>${escapeHtml(r.action)}</span></div></td>
      <td class="n"><span class="sq-num">${Number(r.qty || 0).toLocaleString()}</span><span class="sq-unit">${escapeHtml(r.unit || "")}</span></td>
      <td>${r.purpose ? escapeHtml(r.purpose) : '<span class="sq-dim">—</span>'}</td>
      <td>${escapeHtml(personName(r.user))}</td>
      <td>${acked
            ? `<span class="sq-chip ok">✓ รับทราบ</span>
               <div class="sq-meta"><span>${escapeHtml(personName(r.ackBy))}</span><span>${escapeHtml(_drTime(r.ackAt))}</span></div>`
            : `<button onclick="drAck('${escapeJsAttr(r.docNo)}', event)" class="sq-btn sq-btn-sm">รับทราบ</button>`}</td>
      <td class="c"><button onclick="drSlip('${escapeJsAttr(r.docNo)}')" class="sq-btn sq-btn-sm">ดูใบ</button></td>
    </tr>`;
  }).join("");

  body.innerHTML = `
    <div class="sq-tiles" style="margin-bottom:10px;">
      <div class="sq-tile">
        <div class="sq-tile-label"><span class="sq-dot"></span>เอกสารทั้งเดือน</div>
        <div class="sq-tile-num">${_drRows.length}</div>
      </div>
      <div class="sq-tile">
        <div class="sq-tile-label"><span class="sq-dot" style="background:var(--sq-accent)"></span>รับทราบแล้ว</div>
        <div class="sq-tile-num" style="color:var(--sq-accent)">${_drRows.length - waiting}</div>
      </div>
      <div class="sq-tile">
        <div class="sq-tile-label"><span class="sq-dot" style="background:var(--sq-warn)"></span>ยังไม่รับทราบ</div>
        <div class="sq-tile-num"${waiting ? ' style="color:var(--sq-warn)"' : ""}>${waiting}</div>
      </div>
    </div>
    <div class="sq-card">
      <div class="sq-tablewrap" style="max-height:52vh;overflow-y:auto;">
        <table class="sq-table" style="min-width:900px;">
          <thead><tr>
            <th class="rail"></th><th>เลขที่ / เวลา</th><th>รายการ</th>
            <th class="n">จำนวน</th><th>ใช้กับงาน</th><th>ผู้ทำรายการ</th><th>สถานะรับทราบ</th><th class="c">ใบ</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────
// รับทราบ
// ─────────────────────────────────────────────
async function drAck(docNo, evt) {
  await guardedClick(evt && evt.currentTarget, async () => {
    const res = await rawFetch({ action: "ACKDOC", docNos: [docNo], user: currentUser });
    if (!res || res.status !== "success") { showToast((res && res.message) || "ไม่สำเร็จ", "error"); return; }
    const r = (res.results || [])[0];
    if (r && r.status === "already") showToast("ใบนี้ " + personName(r.ackBy) + " รับทราบไปแล้ว", "warn", 4000);
    else showToast("รับทราบ " + docNo + " แล้ว ", "success");
    await drLoad(_drMonth);
  });
}

async function drAckAll(evt) {
  const waiting = _drRows.filter(r => !r.ackBy).map(r => r.docNo);
  if (!waiting.length) return;
  if (!confirm(`รับทราบเอกสาร ${waiting.length} ใบของเดือน ${_drMonthLabel(_drMonth)}?\n\nระบบจะบันทึกชื่อ "${currentUser}" และเวลาไว้กับทุกใบ`)) return;
  await guardedClick(evt && evt.currentTarget, async () => {
    showLoading("กำลังบันทึกการรับทราบ...");
    const res = await rawFetch({ action: "ACKDOC", docNos: waiting, user: currentUser });
    hideLoading();
    if (!res || res.status !== "success") { showToast((res && res.message) || "ไม่สำเร็จ", "error"); return; }
    showToast(`รับทราบ ${res.acked} ใบแล้ว` + (res.already ? ` (อีก ${res.already} ใบมีคนรับทราบไปก่อนแล้ว)` : ""), "success", 5000);
    await drLoad(_drMonth);
  });
}

/** เปิดใบเอกสารของแถวนั้น */
function drSlip(docNo) {
  const r = _drRows.find(x => x.docNo === docNo);
  if (!r) return;
  if (typeof openWithdrawSlip !== "function") { showToast("เปิดใบไม่ได้", "error"); return; }
  openWithdrawSlip({
    docNo: r.docNo, sku: r.sku, name: r.name, qty: r.qty, unit: r.unit,
    purpose: r.purpose, user: r.user, at: r.at, module: rawCurrentModule,
    balance: null,   // openWithdrawSlip ขอยอดหลังทำรายการ + ล็อตจากหลังบ้านให้ (SLIPINFO)
    type: r.action.includes("เบิก") ? "OUT" : r.action.includes("คืน") ? "RETURN" : "IN"
  });
}

// ─────────────────────────────────────────────
// พิมพ์รายงาน — เอาไปเทียบกับแฟ้มกระดาษ
// ─────────────────────────────────────────────
function drPrint() {
  if (!_drRows.length) { showToast("ไม่มีข้อมูลให้พิมพ์", "warn"); return; }
  const factory = rawCurrentModule === "SQF" ? "สุพรรณคิวฟู้ดส์ (SQF)" : "แม่ละมาย (MLM)";
  const waiting = _drRows.filter(r => !r.ackBy).length;

  const rows = _drRows.map(r => `
    <tr${r.ackBy ? "" : ' style="background:#fff6cc;"'}>
      <td style="text-align:center;font-size:16px;"></td>
      <td style="font-family:monospace;">${escapeHtml(r.docNo)}</td>
      <td>${escapeHtml(_drTime(r.at))}</td>
      <td>${escapeHtml(r.name)}</td>
      <td style="text-align:right;">${Number(r.qty||0).toLocaleString()} ${escapeHtml(r.unit||"")}</td>
      <td>${escapeHtml(r.purpose || "-")}</td>
      <td>${escapeHtml(personName(r.user))}</td>
      <td>${r.ackBy ? escapeHtml(personName(r.ackBy)) : "<b>ยังไม่รับทราบ</b>"}</td>
    </tr>`).join("");

  const w = window.open("", "", "width=1100,height=800");
  if (!w) { showToast("เบราว์เซอร์บล็อกหน้าต่างใหม่", "warn"); return; }
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
  <title>รายงานใบเบิก ${escapeHtml(_drMonthLabel(_drMonth))}</title>
  <style>@import url('${fontCssUrl()}');
    body{font-family:'Sarabun','Leelawadee UI',sans-serif;font-size:12px;color:#111;padding:26px;}
    .hd{display:flex;align-items:center;gap:14px;border-bottom:3px solid #00843d;padding-bottom:10px;margin-bottom:14px;}
    h1{font-size:19px;margin:0;}
    .sub{font-size:12px;color:#5c5c57;margin-top:3px;}
    table{width:100%;border-collapse:collapse;margin-top:10px;}
    th{background:#f2f2ef;padding:7px 8px;border:1px solid #d6d6d0;border-bottom:2px solid #00843d;font-size:11px;text-align:left;}
    td{padding:6px 8px;border:1px solid #d6d6d0;font-size:11.5px;}
    .foot{margin-top:22px;font-size:11px;color:#5c5c57;display:flex;justify-content:space-between;}
    .sign{margin-top:40px;display:flex;gap:50px;}
    .sign div{flex:1;text-align:center;border-top:1px solid #111;padding-top:7px;font-size:11px;color:#5c5c57;}
    @media print{body{padding:12px;} .noprint{display:none;}}
  </style></head><body>
  <div class="noprint" style="margin-bottom:12px;">
    <button onclick="window.print()" style="background:#006b31;color:#fff;border:none;padding:9px 22px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">พิมพ์</button>
  </div>
  <div class="hd">
    <img src="${logoUrl()}" alt="" onerror="this.style.display='none'" style="height:44px;">
    <div>
      <h1>รายงานใบเบิกวัตถุดิบ — ${escapeHtml(_drMonthLabel(_drMonth))}</h1>
      <div class="sub">โรงงาน ${factory} &nbsp;|&nbsp; ทั้งหมด ${_drRows.length} ใบ &nbsp;|&nbsp; ยังไม่รับทราบ ${waiting} ใบ</div>
    </div>
  </div>
  <table>
    <thead><tr>
      <th style="width:34px;text-align:center;">✓</th><th>เลขที่เอกสาร</th><th>วันเวลา</th><th>รายการ</th>
      <th style="text-align:right;">จำนวน</th><th>ใช้กับงาน</th><th>ผู้ทำรายการ</th><th>รับทราบโดย</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="sign">
    <div>ผู้ตรวจสอบแฟ้มเอกสาร<br><br>( ....................... )<br>วันที่ ......../......../........</div>
    <div>ผู้อนุมัติ<br><br>( ....................... )<br>วันที่ ......../......../........</div>
  </div>
  <div class="foot">
    <span>ช่อง ✓ ใช้ติ๊กเทียบกับใบจริงในแฟ้ม</span>
    <span>พิมพ์เมื่อ ${escapeHtml(_drTime(new Date().toISOString()))} โดย ${escapeHtml(personName(currentUser))}</span>
  </div>
  </body></html>`);
  w.document.close();
}

// ═══════════════════════════════════════════════════════════
// FM-PD-07 บันทึกการรับ-เบิกวัตถุดิบ (แบบ Rev.01 · A4 แนวนอน · วัตถุดิบละหน้า)
//   ตัวเลขทุกช่องคิดที่หลังบ้าน (action PD07) — ที่นี่แค่จัดหน้าพิมพ์
//   1 แถว = 1 ใบรับ/ใบเบิก · ตรวจนับที่ยอดเปลี่ยน = แถวปรับยอด · ผู้อนุมัติเว้นเซ็นมือ
// ═══════════════════════════════════════════════════════════
let _pd07 = null;
async function openPd07() {
  const m = document.getElementById("pd07Modal");
  if (!m) return;
  document.getElementById("pd07Target").textContent =
    rawCurrentModule === "SQF" ? "วัตถุดิบ SQF (สุพรรณคิวฟู้ดส์)" : "วัตถุดิบ MLM (แม่ละมาย)";
  const role = (localStorage.getItem("unified_stock_role") || "").toLowerCase();
  const canRev = role === "admin" || role === "manager";
  document.getElementById("pd07Rev").disabled = !canRev;
  document.getElementById("pd07RevBtn").disabled = !canRev;
  document.getElementById("pd07Rev").title = canRev ? "" : "หัวหน้า/แอดมินเป็นคนแก้หัวกระดาษ";
  m.classList.remove("hidden");
  await drPd07Load("");
}
function closePd07() { document.getElementById("pd07Modal")?.classList.add("hidden"); }

async function drPd07Load(month) {
  const sum = document.getElementById("pd07Sum"), btn = document.getElementById("pd07PrintBtn");
  sum.textContent = "กำลังโหลด...";
  btn.disabled = true;
  try {
    const r = await rawFetch({ action: "PD07", month: month || "" });
    if (month && document.getElementById("pd07Month").value !== month) return;   // เปลี่ยนเดือนระหว่างรอ — คำตอบเก่ามาทีหลัง ไม่เอามาทับ
    if (!r || r.status !== "success") { sum.textContent = (r && r.message) || "โหลดไม่สำเร็จ"; return; }
    if (!month) {   // ครั้งแรก: เติมรายชื่อเดือน แล้วโหลดเดือนล่าสุด
      if (!r.months.length) { sum.textContent = "ยังไม่มีรายการรับ-เบิก"; return; }
      document.getElementById("pd07Month").innerHTML = r.months.map(m =>
        `<option value="${escapeAttr(m)}">${escapeHtml(_drMonthLabel(m))}</option>`).join("");
      return drPd07Load(r.months[0]);
    }
    _pd07 = r;
    document.getElementById("pd07Item").innerHTML = '<option value="">ทุกวัตถุดิบ (วัตถุดิบละหน้า)</option>' +
      r.items.map(i => `<option value="${escapeAttr(i.sku)}">${escapeHtml(i.name)}</option>`).join("");
    const inp = document.getElementById("pd07Rev");
    if (document.activeElement !== inp) inp.value = r.rev || "";
    const n = r.items.reduce((a, i) => a + i.rows.length, 0);
    sum.textContent = r.items.length + " วัตถุดิบ · " + n.toLocaleString() + " แถว";
    btn.disabled = !r.items.length;
  } catch (e) { sum.textContent = "เชื่อมต่อไม่สำเร็จ: " + e.message; }
}

async function drPd07SaveRev() {
  const text = document.getElementById("pd07Rev").value.trim();
  const r = await rawFetch({ action: "DOCREVSET", code: "FM-PD-07", text, user: currentUser });
  if (r && r.status === "success") { if (_pd07) _pd07.rev = r.text; showToast("บันทึกหัวกระดาษแล้ว", "success"); }
  else showToast((r && r.message) || "บันทึกไม่สำเร็จ", "error");
}

function drPd07Print() {
  if (!_pd07 || !_pd07.items.length) { showToast("ไม่มีข้อมูลให้พิมพ์", "warn"); return; }
  const sku = document.getElementById("pd07Item").value;
  const items = _pd07.items.filter(i => !sku || i.sku === sku);
  const company = rawCurrentModule === "SQF" ? "บริษัท สุพรรณคิวฟู้ดส์ จำกัด" : "หจก.แม่ละมาย";
  const p = String(_pd07.month).split("-");
  const monthName = _drMonthLabel(_pd07.month).split(" ")[0], yearBE = Number(p[0]) + 543;
  const num = n => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 3 });
  const cell = n => (Number(n) ? num(n) : "");
  const pages = items.map(it => {
    const rows = it.rows.length ? it.rows : [{ date: "", open: it.open, in: 0, out: 0, bal: it.open, recv: "", wd: "", note: "ไม่มีรับ-เบิกในเดือนนี้" }];
    return `<section class="pg">
      <table>
        <colgroup><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:9%">
          <col style="width:10%"><col style="width:10%"><col style="width:9%"><col></colgroup>
        <thead>
          <tr class="hd"><th colspan="9"><div class="top">
            <div>${escapeHtml(company)}</div>
            <div class="ttl">บันทึกการรับ - เบิก วัตถุดิบ <u>${escapeHtml(it.name)}</u> <span class="u">(หน่วย: ${escapeHtml(it.unit || "-")})</span></div>
            <div class="code"><b>FM-PD-07</b><br>${escapeHtml(_pd07.rev || "")}</div>
          </div>
          <div class="mon">ประจำเดือน <u>${escapeHtml(monthName)}</u> ปี <u>${yearBE}</u></div></th></tr>
          <tr><th rowspan="2">วัน/เดือน/ปี</th><th colspan="4">จำนวน</th><th rowspan="2">ผู้รับ</th><th rowspan="2">ผู้เบิก</th><th rowspan="2">ผู้อนุมัติ</th><th rowspan="2">หมายเหตุ</th></tr>
          <tr><th>ยอดยกมา</th><th>รับเข้า</th><th>เบิกใช้</th><th>คงเหลือ</th></tr>
        </thead>
        <tbody>${rows.map(r => `<tr>
          <td class="c">${escapeHtml(r.date)}</td><td class="n">${num(r.open)}</td><td class="n">${cell(r.in)}</td><td class="n">${cell(r.out)}</td><td class="n"><b>${num(r.bal)}</b></td>
          <td>${escapeHtml(r.recv ? personName(r.recv) : "")}</td><td>${escapeHtml(r.wd ? personName(r.wd) : "")}</td><td></td><td class="nt">${escapeHtml(r.note || "")}</td></tr>`).join("")}</tbody>
      </table>
      <div class="ft">พิมพ์จากระบบสต๊อก (AppStock) เมื่อ ${escapeHtml(_drTime(new Date().toISOString()))} · ยอดยกมา + รับเข้า − เบิกใช้ = คงเหลือ ทุกแถว</div>
    </section>`;
  }).join("");
  const w = window.open("", "", "width=1200,height=820");
  if (!w) { showToast("เบราว์เซอร์บล็อกหน้าต่างใหม่", "warn"); return; }
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
  <title>FM-PD-07 ${escapeHtml(_drMonthLabel(_pd07.month))}</title>
  <style>@import url('${fontCssUrl()}');
    @page{size:A4 landscape;margin:10mm;}
    body{font-family:'Sarabun','Leelawadee UI',sans-serif;font-size:13px;color:#111;margin:0;padding:16px;}
    .pg{page-break-after:always;} .pg:last-child{page-break-after:auto;}
    .top{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:12px;}
    .ttl{font-size:17px;font-weight:700;text-align:center;} .u{font-size:12px;font-weight:400;}
    .code{justify-self:end;border:1px solid #111;padding:3px 10px;text-align:center;font-size:12px;line-height:1.35;}
    .mon{text-align:center;margin:6px 0 8px;}
    table{width:100%;border-collapse:collapse;table-layout:fixed;}
    thead{display:table-header-group;} tr{page-break-inside:avoid;}
    th,td{border:1px solid #111;padding:3px 5px;vertical-align:top;}
    th{font-weight:700;text-align:center;background:#f2f2ef;}
    tr.hd th{border:none;background:none;padding:0 0 2px;font-weight:400;text-align:left;}   /* หัวกระดาษอยู่ใน thead = ขึ้นซ้ำทุกหน้าที่ตารางล้น */
    td.n{text-align:right;font-variant-numeric:tabular-nums;} td.c{text-align:center;white-space:nowrap;} td.nt{font-size:11.5px;word-break:break-word;}
    .ft{margin-top:6px;font-size:10.5px;color:#5c5c57;}
    @media print{body{padding:0;} .noprint{display:none;}}
  </style></head><body>
  <div class="noprint" style="margin-bottom:12px;">
    <button onclick="window.print()" style="background:#006b31;color:#fff;border:none;padding:9px 22px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">พิมพ์ / บันทึกเป็น PDF</button>
    <span style="margin-left:10px;color:#5c5c57;">${items.length} หน้า (วัตถุดิบละหน้า) · ตั้งกระดาษ A4 แนวนอน</span>
  </div>
  ${pages}
  </body></html>`);
  w.document.close();
}

// ทะเบียนรับวัตถุดิบ (ผู้ขาย) — ทุกใบรับของเดือนที่เลือก ตามวันที่รับจริง ไว้เทียบกับ FM-PD-03 กระดาษ · ตัวเลข/ป้าย นอก AVL คิดที่หลังบ้าน (RECVREG)
//   เปิดหน้าต่างก่อนรอข้อมูล — เปิดหลัง await แล้วเบราว์เซอร์อาจบล็อกว่าไม่ได้มาจากการกด
async function drRecvRegPrint() {
  const month = document.getElementById("pd07Month").value, sku = document.getElementById("pd07Item").value;
  if (!month) { showToast("เลือกเดือนก่อน", "warn"); return; }
  const w = window.open("", "", "width=1200,height=820");
  if (!w) { showToast("เบราว์เซอร์บล็อกหน้าต่างใหม่", "warn"); return; }
  w.document.write('<p style="font-family:sans-serif;padding:20px;">กำลังโหลดทะเบียนรับ...</p>');
  let r;
  try { r = await rawFetch({ action: "RECVREG", month }); } catch (e) { r = { message: "เชื่อมต่อไม่สำเร็จ: " + e.message }; }
  if (!r || r.status !== "success") { w.close(); showToast((r && r.message) || "โหลดไม่สำเร็จ", "error"); return; }
  const rows = r.rows.filter(x => !sku || x.sku === sku);
  const company = rawCurrentModule === "SQF" ? "บริษัท สุพรรณคิวฟู้ดส์ จำกัด" : "หจก.แม่ละมาย";
  const p = String(month).split("-"), monthName = _drMonthLabel(month).split(" ")[0], yearBE = Number(p[0]) + 543;
  const itemName = sku ? ((rows[0] || {}).name || (rawItemOf(sku) || {}).Name || sku) : "";
  const num = n => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 3 });
  const nOut = rows.filter(x => x.flag === "นอก AVL").length, nNone = rows.filter(x => x.flag === "ไม่ระบุผู้ขาย").length;
  const body = rows.length ? rows.map((x, i) => `<tr${x.flag ? ' class="fl"' : ""}>
      <td class="c">${i + 1}</td><td class="c">${escapeHtml(x.date)}</td><td class="c">${escapeHtml(x.docNo)}</td><td>${escapeHtml(x.name)}</td>
      <td>${escapeHtml(x.supplier || "-")}</td><td class="n">${num(x.qty)}</td><td class="c">${escapeHtml(x.unit)}</td>
      <td>${escapeHtml(x.lotNo)}</td><td class="c">${escapeHtml(x.exp)}</td><td>${escapeHtml(personName(x.user))}</td><td>${escapeHtml(x.flag)}</td></tr>`).join("")
    : '<tr><td colspan="11" class="c">ไม่มีการรับวัตถุดิบในเดือนนี้</td></tr>';
  w.document.open();
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
  <title>ทะเบียนรับวัตถุดิบ ${escapeHtml(_drMonthLabel(month))}</title>
  <style>@import url('${fontCssUrl()}');
    @page{size:A4 landscape;margin:10mm;}
    body{font-family:'Sarabun','Leelawadee UI',sans-serif;font-size:13px;color:#111;margin:0;padding:16px;}
    table{width:100%;border-collapse:collapse;table-layout:fixed;}
    thead{display:table-header-group;} tr{page-break-inside:avoid;}
    th,td{border:1px solid #111;padding:3px 5px;vertical-align:top;word-break:break-word;}
    th{font-weight:700;text-align:center;background:#f2f2ef;}
    tr.hd th{border:none;background:none;padding:0 0 6px;font-weight:400;}
    .top{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:12px;text-align:left;}
    .ttl{font-size:17px;font-weight:700;text-align:center;} .mon{text-align:center;margin-top:4px;}
    td.n{text-align:right;font-variant-numeric:tabular-nums;} td.c{text-align:center;}
    tr.fl td:last-child{font-weight:700;}   /* ตัวหนาเฉพาะหมายเหตุ — เดือนก่อนมีช่องผู้ขาย ทุกแถวเป็น "ไม่ระบุผู้ขาย" */
    .ft{margin-top:6px;font-size:10.5px;color:#5c5c57;}
    @media print{body{padding:0;} .noprint{display:none;}}
  </style></head><body>
  <div class="noprint" style="margin-bottom:12px;">
    <button onclick="window.print()" style="background:#006b31;color:#fff;border:none;padding:9px 22px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">พิมพ์ / บันทึกเป็น PDF</button>
    <span style="margin-left:10px;color:#5c5c57;">ตั้งกระดาษ A4 แนวนอน</span>
  </div>
  <table>
    <colgroup><col style="width:4%"><col style="width:7%"><col style="width:11%"><col style="width:14%"><col style="width:16%">
      <col style="width:7%"><col style="width:5%"><col style="width:9%"><col style="width:7%"><col style="width:9%"><col></colgroup>
    <thead>
      <tr class="hd"><th colspan="11"><div class="top"><div>${escapeHtml(company)}</div>
        <div class="ttl">ทะเบียนรับวัตถุดิบ${itemName ? " " + escapeHtml(itemName) : ""}</div><div></div></div>
        <div class="mon">ประจำเดือน <u>${escapeHtml(monthName)}</u> ปี <u>${yearBE}</u></div></th></tr>
      <tr><th>ที่</th><th>วันที่รับ</th><th>เลขที่ใบรับ</th><th>วัตถุดิบ</th><th>ผู้ขาย</th><th>จำนวน</th><th>หน่วย</th><th>เลขล็อตผู้ขาย</th><th>วันหมดอายุ</th><th>ผู้ตรวจรับ</th><th>หมายเหตุ</th></tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
  <div class="ft">รับ ${rows.length} ครั้ง${nOut ? " · นอก AVL " + nOut + " ครั้ง" : ""}${nNone ? " · ไม่ระบุผู้ขาย " + nNone + " ครั้ง" : ""}${r.avlCount ? "" : " · โรงงานนี้ยังไม่มีรายชื่อผู้ขาย (AVL) ในระบบ"} · ใช้เทียบกับ FM-PD-03 การตรวจรับวัตถุดิบ · พิมพ์จากระบบสต๊อก (AppStock) เมื่อ ${escapeHtml(_drTime(new Date().toISOString()))}</div>
  </body></html>`);
  w.document.close();
}

// ═══════════════════════════════════════════════════════════
// 🔎 สืบย้อนกลับ (QP-QC-17) → ใบแนบ FM-QC-07 ข้อ 5.4 ข้อมูลวัตถุดิบ — หลังบ้าน TRACE คิดทั้งหมด ที่นี่แค่แสดง/จัดหน้าพิมพ์
//   ส่วนอื่นของ FM-QC-07 (ร้องเรียน ลูกค้า FM-QC-10 บันทึกผลิต สรุป %) ยังกรอกฟอร์มเดิม
// ═══════════════════════════════════════════════════════════
let _tr = null;
const _trCompany = () => rawCurrentModule === "SQF" ? "บริษัท สุพรรณคิวฟู้ดส์ จำกัด" : "หจก.แม่ละมาย";
async function drTraceOpen() {
  document.getElementById("trTarget").textContent = rawCurrentModule === "SQF" ? "วัตถุดิบ SQF (สุพรรณคิวฟู้ดส์)" : "วัตถุดิบ MLM (แม่ละมาย)";
  document.getElementById("trMode").value = "back";
  document.getElementById("trDate").value = rawTodayYmd();
  document.getElementById("trPrev").checked = false;
  const mats = [...(rawLastData || []), ...(window._rawDiscontinued || [])].sort((a, b) => String(a.Name).localeCompare(String(b.Name), "th"));
  document.getElementById("trSku").innerHTML = '<option value="">— เลือกวัตถุดิบ —</option>' +
    mats.map(m => `<option value="${escapeAttr(m.SKU)}">${escapeHtml(m.Name)} (${escapeHtml(m.SKU)})</option>`).join("");
  document.getElementById("trLot").innerHTML = "";
  drTraceMode();
  document.getElementById("trModal").classList.remove("hidden");
  const sel = document.getElementById("trProduct");
  sel.innerHTML = '<option value="">กำลังโหลด...</option>';
  try {
    const r = await rawFetch({ action: "TRACE" });
    if (!r || r.status !== "success") { sel.innerHTML = '<option value="">โหลดไม่สำเร็จ</option>'; return; }
    sel.innerHTML = '<option value="">— เลือกผลิตภัณฑ์ —</option>' + r.products.map(p =>
      `<option value="${escapeAttr(p.label)}">${escapeHtml(p.label)}${p.variants.length > 1 ? " (รวม " + escapeHtml(p.variants.join(", ")) + ")" : ""} · เบิก ${p.n} ครั้ง</option>`).join("");
  } catch (e) { sel.innerHTML = '<option value="">เชื่อมต่อไม่สำเร็จ</option>'; }
}
function drTraceClose() { document.getElementById("trModal")?.classList.add("hidden"); }
function drTraceMode() {
  const fwd = document.getElementById("trMode").value === "fwd";
  document.getElementById("trBack").style.display = fwd ? "none" : "grid";
  document.getElementById("trFwd").style.display = fwd ? "grid" : "none";
  _tr = null;
  document.getElementById("trResult").innerHTML = "";
  document.getElementById("trPrintBtn").disabled = true;
}
async function drTraceLots() {
  const sku = document.getElementById("trSku").value, sel = document.getElementById("trLot");
  _tr = null; document.getElementById("trPrintBtn").disabled = true; document.getElementById("trResult").innerHTML = "";
  if (!sku) { sel.innerHTML = ""; return; }
  sel.innerHTML = '<option value="">กำลังโหลด...</option>';
  const r = await rawFetch({ action: "TRACE", mode: "fwd", sku });
  if (document.getElementById("trSku").value !== sku) return;   // เปลี่ยนวัตถุดิบระหว่างรอ
  if (!r || r.status !== "success") { sel.innerHTML = '<option value="">' + escapeHtml((r && r.message) || "โหลดไม่สำเร็จ") + "</option>"; return; }
  sel.innerHTML = r.lots.length ? r.lots.map(l => `<option value="${Number(l.Id)}">${escapeHtml(l.Label)} · รับ ${rawLotNum(l.QtyIn)} · เหลือ ${rawLotNum(l.Qty)}</option>`).join("")
    : '<option value="">วัตถุดิบนี้ยังไม่มีล็อต (ระบบล็อตเริ่ม 20/10/69)</option>';
}
async function drTraceRun() {
  if (rawIsBusy("trRunBtn")) return;
  const fwd = document.getElementById("trMode").value === "fwd", out = document.getElementById("trResult");
  const q = fwd ? { action: "TRACE", mode: "fwd", sku: document.getElementById("trSku").value, lotId: document.getElementById("trLot").value }
                : { action: "TRACE", product: document.getElementById("trProduct").value, date: document.getElementById("trDate").value, prevDays: document.getElementById("trPrev").checked ? 1 : 0 };
  if (fwd && (!q.sku || !q.lotId)) { out.textContent = "เลือกวัตถุดิบและล็อตก่อน"; return; }
  if (!fwd && (!q.product || !q.date)) { out.textContent = "เลือกผลิตภัณฑ์และวันผลิตก่อน"; return; }
  setRawBusy("trRunBtn", true, "กำลังค้นหา...");
  let r;
  try { r = await rawFetch(q); } catch (e) { r = { message: "เชื่อมต่อไม่สำเร็จ: " + e.message }; }
  setRawBusy("trRunBtn", false);
  if (!r || r.status !== "success") { _tr = null; out.textContent = (r && r.message) || "ค้นหาไม่สำเร็จ"; document.getElementById("trPrintBtn").disabled = true; return; }
  _tr = r;
  const n = v => rawLotNum(v);
  if (fwd) {
    out.innerHTML = `<b>${escapeHtml(r.name)} · ${escapeHtml(r.lot.Label)}</b><br>ใช้ไป ${r.uses.length} ใบเบิก` +
      (r.uses.length ? " — " + escapeHtml([...new Set(r.uses.map(u => u.product || "ไม่ระบุงาน"))].join(", ")) +
        " · วันผลิต " + escapeHtml([...new Set(r.uses.map(u => u.date))].join(", ")) : "") +
      ` · รับเข้า ${n(r.lot.QtyIn)} เหลือ ${n(r.lot.Qty)} ${escapeHtml(r.unit)}`;
  } else {
    const noLot = r.items.filter(i => i.noLot || i.old).length;
    out.innerHTML = `<b>${escapeHtml(r.product)} · Lot ผลิต ${escapeHtml(r.lotCode)}</b><br>วัตถุดิบ ${r.items.length} รายการ/ล็อต` +
      (noLot ? ` · ${noLot} รายการเป็นของก่อนระบบล็อต (ดูสมุดกระดาษ)` : "") +
      (r.others.length ? ` · ใบเบิกวันเดียวกันที่ระบุงานอื่น ${r.others.length} ใบ (แยกไว้ท้ายใบแนบ)` : "") +
      (r.items.length ? "" : " — ไม่พบใบเบิกของผลิตภัณฑ์นี้ในวันนั้น ลองติ๊กรวมวันก่อนหน้า");
  }
  document.getElementById("trPrintBtn").disabled = false;
}
function drTracePrint() {
  if (!_tr) return;
  const r = _tr, n = v => Number(v || 0).toLocaleString("th-TH", { maximumFractionDigits: 3 }), e = escapeHtml;
  let title, info, body;
  if (r.mode === "fwd") {
    const L = r.lot;
    title = "ใบแนบ FM-QC-07 ข้อ 5.4 ข้อมูลวัตถุดิบ — สืบไปข้างหน้า (Forword)";
    info = `<table class="kv"><tr><th>วัตถุดิบ</th><td>${e(r.name)} (${e(r.sku)})</td><th>ชื่อผู้ขาย/บริษัท</th><td>${e(L.Supplier || "-")}</td></tr>
      <tr><th>Lot วัตถุดิบ (วันที่รับ)</th><td>${L.Recv ? e(L.Recv) : L.receipts.length ? "ไม่ระบุวันรับ (ดูใบรับ)" : "ยอดยกมา (ก่อนระบบล็อต)"}${L.LotNo ? " · เลขล็อตผู้ขาย " + e(L.LotNo) : ""}${L.Exp ? " · หมดอายุ " + e(L.Exp) : ""}</td>
        <th>รับเข้า / คงเหลือ</th><td>${n(L.QtyIn)} / ${n(L.Qty)} ${e(r.unit)}</td></tr>
      <tr><th>ใบรับ · ผู้ตรวจรับ</th><td colspan="3">${e(L.receipts.map(x => x.docNo + " · " + personName(x.user)).join(", ") || "-")}</td></tr></table>`;
    body = `<h3>ผลิตภัณฑ์ที่ใช้วัตถุดิบล็อตนี้</h3><table><thead><tr><th style="width:5%">ที่</th><th style="width:16%">วันที่เบิก (Lot ผลิต)</th><th>ผลิตภัณฑ์ (ใช้กับงาน)</th>
      <th style="width:13%">จำนวน</th><th style="width:20%">เลขที่ใบเบิก</th><th style="width:16%">ผู้เบิก</th></tr></thead><tbody>${r.uses.length ? r.uses.map((u, i) =>
        `<tr><td class="c">${i + 1}</td><td class="c">${e(u.date)}</td><td>${e(u.product || "ไม่ระบุงาน")}</td><td class="n">${n(u.qty)} ${e(r.unit)}</td><td class="c">${e(u.docNo)}</td><td>${e(personName(u.user))}</td></tr>`).join("")
        : '<tr><td colspan="6" class="c">ยังไม่มีการเบิกจากล็อตนี้</td></tr>'}</tbody></table>` +
      (r.other.length ? `<h3>ความเคลื่อนไหวอื่นของล็อตนี้ (คืน / ตรวจนับ / แก้ล็อต)</h3><table><thead><tr><th style="width:16%">วันที่</th><th>รายการ</th><th style="width:13%">จำนวน</th><th style="width:16%">ผู้บันทึก</th></tr></thead><tbody>` +
        r.other.map(o => `<tr><td class="c">${e(o.date)}</td><td>${e(o.action)}${o.product ? " · " + e(o.product) : ""}</td><td class="n">${e(o.sign)}${n(o.qty)}</td><td>${e(personName(o.user))}</td></tr>`).join("") + "</tbody></table>" : "");
  } else {
    title = "ใบแนบ FM-QC-07 ข้อ 5.4 ข้อมูลวัตถุดิบ — สืบย้อนกลับ (Back Word)";
    info = `<table class="kv"><tr><th>ผลิตภัณฑ์</th><td>${e(r.product)}${r.variants.length > 1 ? " (รวมคำที่สะกดต่าง: " + e(r.variants.join(", ")) + ")" : ""}</td>
      <th>ผลิตวันที่ / Lot การผลิต</th><td>${e(r.lotCode)}${r.prevDays ? " (รวมใบเบิกวันก่อนหน้า 1 วัน)" : ""}</td></tr></table>`;
    const lotTxt = i => i.noLot ? "ไม่มีข้อมูลล็อต (ก่อนระบบล็อต)" : i.old ? "ยอดยกมา (ก่อนระบบล็อต)" : (i.recv ? "รับ " + e(i.recv) : "ไม่ระบุวันรับ (ดูใบรับ)") + (i.lotNo ? " · " + e(i.lotNo) : "") + (i.exp ? "<br>หมดอายุ " + e(i.exp) : "");
    body = `<table><thead><tr><th style="width:4%">ที่</th><th style="width:14%">ชื่อวัตถุดิบ</th><th style="width:14%">Lot วัตถุดิบ</th><th style="width:14%">ชื่อผู้ขาย/บริษัท</th>
      <th style="width:9%">จำนวนที่ใช้</th><th style="width:13%">เลขที่ใบเบิก</th><th style="width:16%">ใบรับ · ผู้ตรวจรับ</th><th style="width:16%">ผลการตรวจรับ<br><small>(เทียบ FM-PD-03)</small></th></tr></thead><tbody>${r.items.length ? r.items.map((i, k) =>
        `<tr><td class="c">${k + 1}</td><td>${e(i.name)}</td><td>${lotTxt(i)}</td><td>${e(i.supplier || "-")}</td><td class="n">${n(i.qty)} ${e(i.unit)}</td>
         <td>${e(i.outDocs.join(", "))}</td><td>${e(i.receipts.map(x => x.docNo + " · " + personName(x.user)).join(", ") || "-")}</td><td></td></tr>`).join("")
        : '<tr><td colspan="8" class="c">ไม่พบใบเบิกของผลิตภัณฑ์นี้ในวันที่เลือก</td></tr>'}</tbody></table>` +
      (r.others.length ? `<h3>ใบเบิกวันเดียวกันที่ระบุงานอื่น / ไม่ระบุงาน — ตรวจว่าเกี่ยวข้องกับ Lot นี้หรือไม่</h3><table><thead><tr><th style="width:11%">วันที่</th><th style="width:20%">วัตถุดิบ</th>
        <th style="width:16%">ใช้กับงาน</th><th style="width:11%">จำนวน</th><th style="width:16%">เลขที่ใบเบิก</th><th>Lot</th></tr></thead><tbody>` +
        r.others.map(o => `<tr><td class="c">${e(o.date)}</td><td>${e(o.name)}</td><td>${e(o.product || "ไม่ระบุงาน")}</td><td class="n">${n(o.qty)} ${e(o.unit)}</td><td class="c">${e(o.docNo)}</td><td>${e(o.lot)}</td></tr>`).join("") + "</tbody></table>" : "");
  }
  const w = window.open("", "", "width=1200,height=820");
  if (!w) { showToast("เบราว์เซอร์บล็อกหน้าต่างใหม่", "warn"); return; }
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
  <title>${e(title)}</title>
  <style>@import url('${fontCssUrl()}');
    @page{size:A4 landscape;margin:10mm;}
    body{font-family:'Sarabun','Leelawadee UI',sans-serif;font-size:13px;color:#111;margin:0;padding:16px;}
    .top{display:grid;grid-template-columns:auto 1fr auto;align-items:end;gap:12px;margin-bottom:8px;} .top > div:first-child{white-space:nowrap;}
    .ttl{font-size:16px;font-weight:700;text-align:center;}
    .code{justify-self:end;border:1px solid #111;padding:3px 10px;text-align:center;font-size:12px;line-height:1.35;white-space:nowrap;}
    h3{font-size:14px;margin:14px 0 6px;}
    table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:6px;}
    thead{display:table-header-group;} tr{page-break-inside:avoid;}
    th,td{border:1px solid #111;padding:3px 5px;vertical-align:top;word-break:break-word;}
    th{font-weight:700;text-align:center;background:#f2f2ef;}
    table.kv th{text-align:left;width:16%;} table.kv td{width:34%;}
    td.n{text-align:right;font-variant-numeric:tabular-nums;} td.c{text-align:center;}
    .sign{margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px;font-size:13px;}
    .ft{margin-top:8px;font-size:10.5px;color:#5c5c57;}
    @media print{body{padding:0;} .noprint{display:none;}}
  </style></head><body>
  <div class="noprint" style="margin-bottom:12px;">
    <button onclick="window.print()" style="background:#006b31;color:#fff;border:none;padding:9px 22px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">พิมพ์ / บันทึกเป็น PDF</button>
    <span style="margin-left:10px;color:#5c5c57;">ตั้งกระดาษ A4 แนวนอน · แนบกับ FM-QC-07</span>
  </div>
  <div class="top"><div>${e(_trCompany())}</div><div class="ttl">${e(title)}</div><div class="code"><b>ใบแนบ FM-QC-07</b><br>อ้างอิง QP-QC-17</div></div>
  ${info}
  ${body}
  <div class="sign"><div>ผู้สืบค้น ____________________________</div><div>เริ่ม ______:______ น.</div><div>เสร็จ ______:______ น.</div></div>
  <div class="ft">Lot วัตถุดิบ = วันที่รับเข้า (QP-QC-17 ข้อ 5.1.1) · "ยอดยกมา / ไม่มีข้อมูลล็อต" = ของที่มีก่อนเริ่มระบบล็อต 20/10/69 สืบต่อจากสมุด FM-PD-07 และ FM-PD-03 กระดาษ · พิมพ์จากระบบสต๊อก (AppStock) เมื่อ ${e(_drTime(new Date().toISOString()))}</div>
  </body></html>`);
  w.document.close();
}
