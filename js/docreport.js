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
      <div class="top">
        <div>${escapeHtml(company)}</div>
        <div class="ttl">บันทึกการรับ - เบิก วัตถุดิบ <u>${escapeHtml(it.name)}</u> <span class="u">(หน่วย: ${escapeHtml(it.unit || "-")})</span></div>
        <div class="code"><b>FM-PD-07</b><br>${escapeHtml(_pd07.rev || "")}</div>
      </div>
      <div class="mon">ประจำเดือน <u>${escapeHtml(monthName)}</u> ปี <u>${yearBE}</u></div>
      <table>
        <colgroup><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:9%">
          <col style="width:10%"><col style="width:10%"><col style="width:9%"><col></colgroup>
        <thead>
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
