// ══════════════════════════════════════════════════
// 📊 EXECUTIVE DASHBOARD
//    หน้าตาใช้ชุด class กลาง .sq-* (นิยามใน index.html)
//    ⚠️ สูตรคำนวณและเกณฑ์ตัดสินทุกอย่างเหมือนเดิมทุกบรรทัด
// ══════════════════════════════════════════════════
function openExecDashboard() { switchModule("EXEC"); }

// ── 📲 ติดตั้งลิงก์ผู้บริหารเป็นแอป (ชื่อ "ผู้บริหาร" · manifest-exec.json) ──
//    Chrome/Edge/Android: ปุ่มกดติดตั้งได้เลย · iPhone: ต้องกดแชร์ → เพิ่มไปยังหน้าจอโฮม (Safari ไม่มีปุ่มให้กดแทน)
let _execInstallEvt = null;
const _execStandalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
function _execShowInstall() {
  const b = document.getElementById("execInstallBtn");
  if (!b) return;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  b.style.display = window.APP_EXEC_ONLY && !_execStandalone() && (_execInstallEvt || ios) ? "" : "none";
}
window.addEventListener("beforeinstallprompt", e => {
  if (!window.APP_EXEC_ONLY) return;   // แอปหลักใช้ปุ่มของเบราว์เซอร์ตามเดิม
  e.preventDefault();
  _execInstallEvt = e;
  _execShowInstall();
});
window.addEventListener("appinstalled", () => { _execInstallEvt = null; _execShowInstall(); });
async function execInstallApp() {
  if (_execInstallEvt) {
    _execInstallEvt.prompt();
    try { await _execInstallEvt.userChoice; } catch (e) {}
    _execInstallEvt = null;
    _execShowInstall();
    return;
  }
  alert("ติดตั้งบน iPhone / iPad:\n1. เปิดหน้านี้ใน Safari\n2. กดปุ่มแชร์ ⬆️ ด้านล่าง\n3. เลือก \"เพิ่มไปยังหน้าจอโฮม\"\n\nจะได้ไอคอนชื่อ \"ผู้บริหาร\" เปิดเข้าหน้าภาพรวมได้ทันที");
}
document.addEventListener("DOMContentLoaded", _execShowInstall);

async function loadExecDashboard() {
  const el = document.getElementById("execDashContent");
  const mobile = execIsMobile();   // 📱 จอแคบ → ใช้หน้าตาการ์ด (execMobileView) แทนตาราง
  document.getElementById("execDashTimestamp").textContent = "กำลังดึงข้อมูล...";
  // 📱 มือถือที่มีการ์ดอยู่แล้ว (กลับมาเปิดแอป / กดรีเฟรช) → คงของเดิมไว้จนของใหม่มา ไม่ล้างจอ ไม่เด้งกลับขึ้นบนสุด
  const keepOld = mobile && !!el.querySelector(".xm");
  if (keepOld) document.getElementById("execDashTimestamp").textContent = "⏳ กำลังตรวจข้อมูลล่าสุด...";
  // ข้อ 9: สามคลังโหลดพร้อมกัน แต่ละส่วนวาดทันทีที่มาถึง ไม่รอครบ · ตัวเลขรวม (KPI) รอจนครบสองโรงงานเท่านั้น
  if (!keepOld) el.innerHTML =
    '<div id="execKpiSlot"><p class="sq-empty">⏳ รอข้อมูลครบสองโรงงานสำหรับตัวเลขรวม...</p></div>' +
    '<div id="execChartSlot"></div>' +
    '<div id="execSlotCR"><p class="sq-empty">⏳ กำลังโหลดคลังสินค้า...</p></div>' +
    '<div id="execSlotSQF"><p class="sq-empty">⏳ กำลังโหลดวัตถุดิบ SQF...</p></div>' +
    '<div id="execSlotMLM"><p class="sq-empty">⏳ กำลังโหลดวัตถุดิบ MLM...</p></div>';
  _execChartData = { SQF: [], MLM: [], CR: {} };
  // มือถือ: ระหว่างรอไม่วาดตารางของหน้าคอม (จะเห็นตารางกว้างแวบหนึ่งก่อนเปลี่ยนเป็นการ์ด)
  const slot = id => (mobile && id !== "execKpiSlot") ? null : document.getElementById(id);
  const failBox = msg => `<div class="sq-card"><p class="sq-empty" style="color:var(--sq-crit);font-weight:700;">⚠️ ${escapeHtml(msg)}</p></div>`;
  const tasks = [
    fetch(GAS_URL, { method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"},
      body: JSON.stringify({ module:"COLDROOM", action:"getStartupOverview" }) }).then(r=>r.json()).then(crRes => {
        const topProds = crRes.ok ? (crRes.totalByProduct||[]).sort((a,b)=>b.TotalQty-a.TotalQty) : [];
        const expiring = crRes.ok ? (crRes.expiringLots||[]) : [];
        const expired  = crRes.ok ? (crRes.expiredLots||[])  : [];
        _execChartData.CR = { products: topProds, expiring: expiring, expired: expired, staleLots: crRes.ok ? (crRes.staleLots || []) : [] };
        if (crRes.ok && crRes.staleDays !== undefined) _execChartData.staleDays = Number(crRes.staleDays) || 0;
        if (slot("execSlotCR")) slot("execSlotCR").innerHTML = execStockSection("❄️", "คลังสินค้า", "rail-cold", topProds, expiring, expired,
          crRes.ok ? (crRes.staleLots || []) : [], crRes.ok ? Number(crRes.staleDays) || 0 : 0);
      }).catch(e => { if (slot("execSlotCR")) slot("execSlotCR").innerHTML = failBox("คลังสินค้าโหลดไม่สำเร็จ: " + e.message); throw e; }),
    fetch(GAS_URL + "?module=SQF").then(r=>r.json()).then(res => {
        const m = res.status === "success" ? res.materials : [];
        _execChartData.SQF = m;
        if (res.staleDays !== undefined) _execChartData.staleDays = Number(res.staleDays) || 0;
        if (slot("execSlotSQF")) slot("execSlotSQF").innerHTML = execRawSection("🏭", "วัตถุดิบ SQF — สุพรรณคิวฟู้ดส์", "rail-sqf", m, Number(res.staleDays) || 0);
      }).catch(e => { if (slot("execSlotSQF")) slot("execSlotSQF").innerHTML = failBox("วัตถุดิบ SQF โหลดไม่สำเร็จ: " + e.message); throw e; }),
    fetch(GAS_URL + "?module=MLM").then(r=>r.json()).then(res => {
        const m = res.status === "success" ? res.materials : [];
        _execChartData.MLM = m;
        if (res.staleDays !== undefined) _execChartData.staleDays = Number(res.staleDays) || 0;
        if (slot("execSlotMLM")) slot("execSlotMLM").innerHTML = execRawSection("🏭", "วัตถุดิบ MLM — แม่ละมาย", "rail-mlm", m, Number(res.staleDays) || 0);
      }).catch(e => { if (slot("execSlotMLM")) slot("execSlotMLM").innerHTML = failBox("วัตถุดิบ MLM โหลดไม่สำเร็จ: " + e.message); throw e; })
  ];
  const results = await Promise.allSettled(tasks);
  const failed = results.filter(r => r.status === "rejected");
  if (failed.length) {
    // Google สะดุดชั่วคราว (ตอบเป็นหน้า HTML) → ลองใหม่เองหนึ่งครั้ง ก่อนโชว์ข้อผิดพลาดพร้อมปุ่มลองใหม่
    if (!loadExecDashboard._retried && navigator.onLine) {
      loadExecDashboard._retried = true;
      document.getElementById("execDashTimestamp").textContent = "⏳ เซิร์ฟเวอร์ตอบไม่ปกติ กำลังลองใหม่...";
      setTimeout(loadExecDashboard, 4000);
      return;
    }
    document.getElementById("execDashTimestamp").textContent = "โหลดไม่ครบ";
    if (keepOld) {  // มือถือที่มีของเดิมบนจอ → คงไว้ บอกแค่ว่าตรวจล่าสุดไม่ได้
      document.getElementById("execDashTimestamp").textContent = "⚠️ ตรวจข้อมูลล่าสุดไม่ได้ — แสดงของเดิม (กดรีเฟรชอีกครั้ง)";
      return;
    }
    if (mobile) {   // มือถือ: บอกว่าไม่ครบ + ปุ่มลองใหม่ (ไม่โชว์ตัวเลขจากบางคลัง จะหลอกตา)
      el.innerHTML = `<div class="sq-card"><p class="sq-empty" style="color:var(--sq-crit);font-weight:700;">⚠️ ข้อมูลไม่ครบ (${failed.length} คลังโหลดไม่สำเร็จ)</p>
        <p style="text-align:center;margin:0 0 14px;"><button onclick="loadExecDashboard()" class="sq-btn sq-btn-primary">🔄 ลองใหม่</button></p></div>`;
      return;
    }
    if (slot("execKpiSlot")) slot("execKpiSlot").innerHTML =
      `<div class="sq-card"><p class="sq-empty" style="color:var(--sq-crit);font-weight:700;">⚠️ ข้อมูลไม่ครบ (${failed.length} คลังโหลดไม่สำเร็จ) — ตัวเลขรวมยังไม่แสดง เพราะรวมแค่บางคลังจะหลอกตา</p>
        <p style="text-align:center;margin-top:10px;"><button onclick="loadExecDashboard()" style="padding:9px 18px;border-radius:10px;border:1px solid var(--sq-line,#cfd8d2);background:#fff;font-weight:700;cursor:pointer;">🔄 ลองใหม่</button></p></div>`;
    return;
  }
  const now = new Date().toLocaleString("th-TH", { dateStyle:"medium", timeStyle:"short" });
  document.getElementById("execDashTimestamp").textContent = "อัปเดตล่าสุด " + now;
  if (mobile) { el.innerHTML = execMobileView(); loadExecDashboard._retried = false; return; }
  if (slot("execKpiSlot"))   slot("execKpiSlot").innerHTML   = execBuildKpi([...(_execChartData.SQF||[]), ...(_execChartData.MLM||[])], _execChartData.staleDays || 0);
  if (slot("execChartSlot")) slot("execChartSlot").innerHTML = execChartSection();
  // วาดหลังจาก canvas อยู่บนจอแล้ว (Chart.js วัดขนาดจากกล่องที่มองเห็น)
  void el.offsetHeight;
  execRenderCharts();
  loadExecDashboard._retried = false;
}

/** ─── 📈 กราฟวิเคราะห์ — โชว์ทั้ง 3 คลังพร้อมกัน ไม่มีแท็บ ไม่มีโดนัท (เจ้าของสั่ง 2026-08-02) ─── */
let _execChartData = { SQF: [], MLM: [], CR: { products: [], expiring: [], expired: [] }, staleDays: 0 };

// ⏰ อัปเดตล่าสุด — "กี่วันก่อน" มาจากหลังบ้าน (IdleDays = นับเป็นวันปฏิทินไทย) หน้านี้แค่แสดง
//    เกินจำนวนวันที่ตั้ง (ช่อง "⏰ เตือนไม่อัปเดตเกิน" หน้าวัตถุดิบ) → ป้ายสีส้ม = ยอดอาจไม่ตรงของจริง
const execIsStale = (idle, staleDays) => staleDays > 0 && idle !== undefined && (idle === null || idle > staleDays);
function execIdleCell(idle, iso, staleDays) {
  if (idle === undefined) return '<span class="sq-dim">—</span>';
  const txt = idle === null ? "ไม่เคยบันทึก" : idle === 0 ? "วันนี้" : idle === 1 ? "เมื่อวาน" : idle + " วันก่อน";
  let d = "";
  try { d = iso ? new Date(iso).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" }) : ""; } catch (e) {}
  const main = execIsStale(idle, staleDays)
    ? `<span class="sq-chip high" title="ไม่มีใครเบิก/รับ/คืน/นับ เกิน ${staleDays} วัน — ยอดอาจไม่ตรงของจริง">⏰ ${txt}</span>`
    : `<span style="font-weight:700;color:var(--sq-ink2);white-space:nowrap;">${txt}</span>`;
  return main + (d && idle ? `<div class="sq-meter-note">${d}</div>` : "");
}
let _execCharts = {};   // canvasId → Chart instance (ไว้ destroy ก่อนวาดซ้ำ)

function execChartSection() {
  const block = (id, icon, title, note) => `
    <div>
      <div style="font-weight:800;font-size:13.5px;color:var(--sq-ink);margin-bottom:2px;">${icon} ${title}</div>
      <div class="sq-card-note" id="${id}Note" style="margin-bottom:6px;">${note}</div>
      <div style="height:280px;position:relative;"><canvas id="${id}"></canvas></div>
    </div>`;
  return `
  <div class="sq-card">
    <div class="sq-card-head">
      <span class="sq-card-title">📈 กราฟวิเคราะห์</span>
      <span class="sq-card-note">ทุกคลังในจอเดียว</span>
    </div>
    <div class="sq-card-body" style="display:flex;flex-direction:column;gap:22px;">
      ${block("execBarSQF", "🏭", "วัตถุดิบสุพรรณคิวฟู้ดส์ — วันที่ใช้งานได้คงเหลือ", "เฉพาะรายการที่กรอกอัตราใช้ต่อวันไว้")}
      ${block("execBarMLM", "🏭", "วัตถุดิบแม่ละมาย — วันที่ใช้งานได้คงเหลือ", "เฉพาะรายการที่กรอกอัตราใช้ต่อวันไว้")}
      ${block("execBarCR",  "❄️", "คลังสินค้าห้องเย็น — คงเหลือต่อสินค้า", "สีของแท่งบอกความเร่งด่วนของวันหมดอายุ")}
    </div>
  </div>`;
}

const _execFont = { family: "Sarabun", weight: "bold" };

function _execDestroy(id) {
  if (_execCharts[id]) { _execCharts[id].destroy(); delete _execCharts[id]; }
}

// กราฟวันคงเหลือของวัตถุดิบ — ตรรกะเดิมจาก raw.js ทุกบรรทัด
function _execDaysBar(id, items) {
  const el = document.getElementById(id);
  if (!el) return;
  const sorted = items.filter(i => Number(i.DailyUsage||0) > 0)
    .map(i => ({ ...i, daysLeft: Math.floor(Number(i.Qty||0) / Number(i.DailyUsage||1)) }))
    .sort((a,b) => a.daysLeft - b.daysLeft)
    .slice(0, 12);
  const note = document.getElementById(id + "Note");
  if (note) note.textContent = sorted.length
    ? `เรียงจากเร่งด่วนสุด ${sorted.length} อันดับแรก (จากทั้งหมด ${items.length} รายการ)`
    : "ยังไม่มีรายการที่กรอกอัตราใช้ต่อวัน";
  const color = d => d <= 7 ? "220,38,38" : d <= 14 ? "234,88,12" : d <= 30 ? "245,158,11" : "5,150,105";
  _execDestroy(id);
  _execCharts[id] = new Chart(el.getContext("2d"), {
    type: "bar",
    data: {
      labels: sorted.map(i => { const n = String(i.Name||"-"); return n.length>16?n.slice(0,16)+"…":n; }),
      datasets: [{ label: "วันที่ใช้งานได้ (วัน)",
        data: sorted.map(i => i.daysLeft),
        backgroundColor: sorted.map(i => `rgba(${color(i.daysLeft)},0.75)`),
        borderColor:     sorted.map(i => `rgb(${color(i.daysLeft)})`),
        borderWidth: 2, borderRadius: 10 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          titleFont: _execFont, bodyFont: { family: "Sarabun" },
          callbacks: {
            label: ctx => `${ctx.parsed.y} วัน`,
            afterLabel: ctx => {
              const d = ctx.parsed.y;
              return d <= 7 ? "⚠️ วิกฤต — ต้องสั่งด่วน!" : d <= 14 ? "🟠 เร่งด่วน" :
                     d <= 30 ? "🟡 ควรวางแผนสั่ง" : "✅ ปลอดภัย";
            }
          }
        }
      },
      scales: {
        x: { ticks: { font: _execFont } },
        y: { beginAtZero: true,
             title: { display: true, text: "วัน", font: _execFont },
             ticks: { font: _execFont, callback: v => v + " วัน" } }
      }
    }
  });
}

// กราฟห้องเย็น — คงเหลือรวมต่อสินค้า สีตามความเร่งด่วนของวันหมดอายุในล็อตของสินค้านั้น
function _execCrBar(id, cr) {
  const el = document.getElementById(id);
  if (!el) return;
  const prods = (cr.products || []).slice(0, 12);
  const note = document.getElementById(id + "Note");
  if (note) note.textContent = prods.length
    ? `${prods.length} สินค้า · 🔴 มีล็อตหมดอายุ · 🟠 มีล็อตใกล้หมดอายุ · 🔵 ปกติ`
    : "ยังไม่มีสต๊อกในห้องเย็น";
  const expNames  = new Set((cr.expired  || []).map(x => x.ProductName));
  const nearNames = new Set((cr.expiring || []).map(x => x.ProductName));
  const color = n => expNames.has(n) ? "220,38,38" : nearNames.has(n) ? "234,88,12" : "14,116,144";
  _execDestroy(id);
  _execCharts[id] = new Chart(el.getContext("2d"), {
    type: "bar",
    data: {
      labels: prods.map(p => { const n = String(p.ProductName||"-"); return n.length>16?n.slice(0,16)+"…":n; }),
      datasets: [{ label: "คงเหลือ",
        data: prods.map(p => Number(p.TotalQty||0)),
        backgroundColor: prods.map(p => `rgba(${color(p.ProductName)},0.75)`),
        borderColor:     prods.map(p => `rgb(${color(p.ProductName)})`),
        borderWidth: 2, borderRadius: 10 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          titleFont: _execFont, bodyFont: { family: "Sarabun" },
          callbacks: {
            label: ctx => {
              const p = prods[ctx.dataIndex];
              return `${Number(p.TotalQty).toLocaleString()} ${p.Unit || ""} · ${p.LotCount} lot`;
            },
            afterLabel: ctx => {
              const n = prods[ctx.dataIndex].ProductName;
              return expNames.has(n) ? "⛔ มีล็อตหมดอายุ — เอาออกด่วน" :
                     nearNames.has(n) ? "⏳ มีล็อตใกล้หมดอายุ" : "✅ ปกติ";
            }
          }
        }
      },
      scales: {
        x: { ticks: { font: _execFont } },
        y: { beginAtZero: true,
             title: { display: true, text: "จำนวน (หน่วยตามสินค้า)", font: _execFont },
             ticks: { font: _execFont } }
      }
    }
  });
}

async function execRenderCharts() {
  try { await loadVendor("chart"); } catch (e) { return; }   // ข้อ 11: Chart.js โหลดเฉพาะตอนเปิดหน้านี้
  if (!document.getElementById("execBarSQF")) return;         // ผู้ใช้ออกจากหน้าไปแล้วระหว่างรอ
  _execDaysBar("execBarSQF", _execChartData.SQF || []);
  _execDaysBar("execBarMLM", _execChartData.MLM || []);
  _execCrBar("execBarCR", _execChartData.CR || {});
}

/** ─── แถบตัวเลขรวม (SQF+MLM) ─── */
function execBuildKpi(allMats, staleDays) {
  const today = new Date(); today.setHours(0,0,0,0);
  const active = allMats.filter(m => !(m.Discontinued===true||String(m.Discontinued).toUpperCase()==="TRUE"));
  let crisis=0, urgent=0, warn=0, ok=0, lowStock=0;
  active.forEach(m => {
    const qty   = Number(m.Qty||0);
    const daily = Number(m.DailyUsage||0);
    const min   = Number(m.Min||0);
    const days  = daily > 0 ? Math.floor(qty/daily) : null;
    if (min > 0 && qty <= min) lowStock++;
    if      (days !== null && days <= 7)  crisis++;
    else if (days !== null && days <= 14) urgent++;
    else if (days !== null && days <= 30) warn++;
    else ok++;
  });
  const tile = (dot, label, val, note, color) =>
    `<div class="sq-tile">
      <div class="sq-tile-label"><span class="sq-dot" style="background:${dot}"></span>${label}</div>
      <div class="sq-tile-num"${color?` style="color:${color}"`:""}>${val.toLocaleString()}</div>
      <div class="sq-tile-note">${note}</div>
    </div>`;
  return `
  <div class="sq-card-note" style="margin:0 0 7px 2px;">ภาพรวมวัตถุดิบทั้งหมด (SQF + MLM)</div>
  <div class="sq-tiles">
    ${tile("var(--sq-crit)",  "วิกฤต ≤7 วัน",     crisis,   "ต้องสั่งทันที",        crisis   ? "var(--sq-crit)" : "")}
    ${tile("var(--sq-high)",  "เร่งด่วน ≤14 วัน", urgent,   "ควรสั่งภายในสัปดาห์",  urgent   ? "var(--sq-high)" : "")}
    ${tile("var(--sq-warn)",  "ควรวางแผน ≤30 วัน", warn,    "วางแผนสั่งล่วงหน้า",   warn     ? "var(--sq-warn)" : "")}
    ${tile("var(--sq-muted)", "ปกติ",              ok,       "สต๊อกเพียงพอ",         "")}
    ${tile("var(--sq-high)",  "ต่ำกว่าจุดสั่งซื้อ", lowStock, "ยอดต่ำกว่าที่ตั้งไว้", lowStock ? "var(--sq-high)" : "")}
    ${staleDays ? (() => { const n = active.filter(m => execIsStale(m.IdleDays, staleDays)).length;
        return tile("var(--sq-high)", "⏰ ไม่อัปเดตเกิน " + staleDays + " วัน", n, "ยอดอาจไม่ตรง — ควรนับ", n ? "var(--sq-high)" : ""); })() : ""}
  </div>`;
}

/** ─── ส่วนคลังสินค้า ─── */
function execStockSection(icon, title, railClass, products, expiring, expired, staleLots, staleDays) {
  const warnCount = expiring.length + expired.length;
  staleLots = staleLots || [];
  const rows = products.map(p => `
    <tr>
      <td><span class="sq-name">${escapeHtml(p.ProductName)}</span></td>
      <td class="n"><span class="sq-num">${Number(p.TotalQty).toLocaleString()}</span><span class="sq-unit">${escapeHtml(p.Unit||"")}</span></td>
      <td class="n sq-dim"><span class="sq-num" style="font-weight:600;color:var(--sq-muted);">${p.LotCount}</span> lot</td>
      <td class="c">${execIdleCell(p.IdleDays, p.LastUpdate, staleDays)}</td>
    </tr>`).join("");
  const staleList = !staleDays || !staleLots.length ? "" : `
    <div class="sq-card-body" style="border-top:1px solid var(--sq-line-soft);">
      <div class="sq-chip high" style="margin-bottom:7px;">⏰ ไม่อัปเดตเกิน ${staleDays} วัน ${staleLots.length} ล็อต</div>
      <div class="sq-list">
        ${staleLots.slice(0,8).map(x => `
          <div class="sq-list-row">
            <span class="sq-list-name">${escapeHtml(x.ProductName)} <span class="sq-dim" style="font-size:11px;">MFG ${isoToDdmmyy(String(x.MFG))}</span></span>
            <span class="sq-chip high">${x.IdleDays == null ? "ไม่เคยบันทึก" : x.IdleDays + " วัน"}</span>
          </div>`).join("")}
      </div>
      ${staleLots.length > 8 ? `<p class="sq-meter-note" style="text-align:center;margin-top:6px;">…และอีก ${staleLots.length-8} ล็อต</p>` : ""}
    </div>`;

  const lotList = (items, cls, icon2, label, showAbs) => items.length === 0 ? "" : `
    <div class="sq-card-body" style="border-top:1px solid var(--sq-line-soft);">
      <div class="sq-chip ${cls}" style="margin-bottom:7px;">${icon2} ${label} ${items.length} รายการ</div>
      <div class="sq-list">
        ${items.slice(0,8).map(x=>`
          <div class="sq-list-row">
            <span class="sq-list-name">${escapeHtml(x.ProductName)}</span>
            <span class="sq-chip ${cls}">${showAbs ? Math.abs(x.ExpireDays) : x.ExpireDays} วัน</span>
          </div>`).join("")}
      </div>
      ${items.length > 8 ? `<p class="sq-meter-note" style="text-align:center;margin-top:6px;">…และอีก ${items.length-8} รายการ</p>` : ""}
    </div>`;

  return `
  <div class="sq-card ${railClass}">
    <div class="sq-card-head">
      <span class="sq-card-title">${icon} ${title}</span>
      <span class="sq-card-note">${products.length} ชนิด${warnCount>0?` · <span style="color:var(--sq-high);font-weight:700;">${warnCount} ต้องดู</span>`:""}${staleDays && staleLots.length ? ` · <span style="color:var(--sq-high);font-weight:700;">⏰ ${staleLots.length} ไม่อัปเดต</span>` : ""}</span>
    </div>
    ${products.length === 0
      ? '<p class="sq-empty">ยังไม่มีสต๊อก</p>'
      : `<div class="sq-tablewrap"><table class="sq-table">
          <thead><tr><th>สินค้า</th><th class="n">คงเหลือ</th><th class="n">จำนวน lot</th><th class="c">อัปเดตล่าสุด</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`}
    ${lotList(expiring, "warn", "⏳", "ใกล้หมดอายุ", false)}
    ${lotList(expired,  "crit", "⛔", "หมดอายุแล้ว", true)}
    ${staleList}
  </div>`;
}

/** ─── ส่วนวัตถุดิบ (SQF / MLM) ─── */
// คำนวณ metrics ของวัตถุดิบ — ใช้ร่วมกันทั้งตารางหน้าคอมและการ์ดมือถือ (เกณฑ์เหมือนเดิมทุกบรรทัด)
function execRawItems(mats) {
  const today = new Date(); today.setHours(0,0,0,0);
  const active = (mats || []).filter(m => !(m.Discontinued===true||String(m.Discontinued).toUpperCase()==="TRUE"));
  return active.map(m => {
    const qty   = Number(m.Qty||0);
    const daily = Number(m.DailyUsage||0);
    const min   = Number(m.Min||0);
    const days  = daily > 0 ? Math.floor(qty/daily) : null;
    let expDays = null;
    if (m.ExpiryDate) { const d=new Date(m.ExpiryDate); if(!isNaN(d)) expDays=Math.round((d-today)/86400000); }
    const outDate = days !== null ? (() => {
      const d=new Date(today); d.setDate(d.getDate()+days);
      return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()+543}`;
    })() : null;
    let urgency = days===null ? 4 : days<=7 ? 0 : days<=14 ? 1 : days<=30 ? 2 : 3;
    if (urgency===4 && min>0 && qty<=min) urgency=1; // stock low → เร่งด่วน
    return { ...m, qty, daily, min, days, expDays, outDate, urgency };
  }).sort((a,b) => a.urgency - b.urgency || (a.days??9999) - (b.days??9999));
}

function execRawSection(icon, title, railClass, mats, staleDays) {
  const active = mats.filter(m => !(m.Discontinued===true||String(m.Discontinued).toUpperCase()==="TRUE"));
  const items = execRawItems(mats);

  const crisis  = items.filter(m=>m.urgency===0).length;
  const urgent2 = items.filter(m=>m.urgency===1).length;
  const warn2   = items.filter(m=>m.urgency===2).length;
  const ok2     = items.filter(m=>m.urgency===3||m.urgency===4).length;
  const lowCount = items.filter(m=>m.min>0&&m.qty<=m.min).length;
  const staleCount = items.filter(m => execIsStale(m.IdleDays, staleDays)).length;

  const miniKpi = (cls, icon2, label, val) =>
    `<span class="sq-chip ${cls}">${icon2} ${label} ${val}</span>`;

  const rows = items.map(m => {
    const isLow = m.min>0 && m.qty<=m.min;
    const sev = m.urgency===0 ? "sev-crit" : m.urgency===1 ? "sev-high" : m.urgency===2 ? "sev-warn" : "";

    // วันคงเหลือ
    const daysCls = m.days===null ? "" : m.days<=7?"crit":m.days<=14?"high":m.days<=30?"warn":"ok";
    const daysCell = m.days===null
      ? `<span class="sq-dim">—</span>`
      : `<span class="sq-chip ${daysCls}">${m.days} วัน</span>
         <div class="sq-meter-note">ถึง ${m.outDate||""}</div>`;

    // วันหมดอายุ
    const expCell = m.expDays===null ? `<span class="sq-dim">—</span>` :
      m.expDays < 0   ? `<span class="sq-chip crit">⛔ หมดแล้ว</span>` :
      m.expDays <= 30 ? `<span class="sq-chip warn">⏳ ${m.expDays} วัน</span>` :
                        `<span class="sq-dim" style="font-family:var(--sq-mono);font-size:11.5px;">${isoToDdmmyy(String(m.ExpiryDate))}</span>`;

    // หลอดเทียบยอดกับจุดสั่งซื้อ
    const pct = m.min>0 ? Math.min(100, Math.round((m.qty/m.min)*100)) : null;
    const pctBar = pct===null ? "" : `
      <div class="sq-meter"><i style="width:${pct}%;background:${pct<50?"var(--sq-crit)":pct<100?"var(--sq-high)":"var(--sq-accent)"};"></i></div>
      <div class="sq-meter-note">เทียบจุดสั่งซื้อ ${m.min.toLocaleString()} = ${pct}%</div>`;

    const monthly = m.daily>0 ? (m.daily*30).toLocaleString("th-TH",{maximumFractionDigits:0}) : "—";

    return `<tr class="${sev}">
      <td class="rail"></td>
      <td>
        <span class="sq-name">${escapeHtml(String(m.Name))}</span>
        ${isLow?` <span class="sq-chip high">ต่ำ</span>`:""}
      </td>
      <td class="n">
        <span class="sq-num"${isLow?' style="color:var(--sq-crit)"':""}>${m.qty.toLocaleString()}</span><span class="sq-unit">${escapeHtml(String(m.Unit||""))}</span>
        ${pctBar}
      </td>
      <td class="n"><span class="sq-num sq-dim" style="font-weight:600;">${m.min>0?m.min.toLocaleString():"—"}</span></td>
      <td class="n"><span class="sq-num" style="font-weight:600;">${m.daily>0?m.daily.toLocaleString("th-TH",{maximumFractionDigits:2}):"—"}</span></td>
      <td class="n"><span class="sq-num" style="font-weight:600;">${monthly}</span></td>
      <td class="c">${daysCell}</td>
      <td class="c">${expCell}</td>
      <td class="c">${execIdleCell(m.IdleDays, m.LastUpdate, staleDays)}</td>
    </tr>`;
  }).join("");

  return `
  <div class="sq-card ${railClass}">
    <div class="sq-card-head">
      <span class="sq-card-title">${icon} ${title}</span>
      <span class="sq-card-note">${active.length} รายการ${lowCount>0?` · <span style="color:var(--sq-high);font-weight:700;">${lowCount} ต่ำกว่าจุดสั่งซื้อ</span>`:""}</span>
    </div>
    <div class="sq-card-body" style="display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--sq-line-soft);">
      ${miniKpi("crit","🔴","วิกฤต",crisis)}
      ${miniKpi("high","🟠","เร่งด่วน",urgent2)}
      ${miniKpi("warn","⏳","ควรสั่ง",warn2)}
      ${miniKpi("","✓","ปกติ",ok2)}
      ${staleDays ? miniKpi(staleCount ? "high" : "", "⏰", "ไม่อัปเดตเกิน " + staleDays + " วัน", staleCount) : ""}
    </div>
    ${items.length === 0
      ? '<p class="sq-empty">ยังไม่มีรายการวัตถุดิบ</p>'
      : `<div class="sq-tablewrap">
          <table class="sq-table" style="min-width:960px;">
            <thead>
              <tr>
                <th class="rail" aria-hidden="true"></th>
                <th>วัตถุดิบ</th>
                <th class="n">คงเหลือ</th>
                <th class="n">จุดสั่งซื้อ</th>
                <th class="n">ใช้/วัน</th>
                <th class="n">ใช้/เดือน</th>
                <th class="c">วันคงเหลือ</th>
                <th class="c">หมดอายุ</th>
                <th class="c">อัปเดตล่าสุด</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`}
  </div>`;
}

// ══════════════════════════════════════════════════
// 📱 ภาพรวมผู้บริหารบนมือถือ (จอกว้างไม่เกิน 700px — ลิงก์ผู้บริหารและหน้า 📊 บนมือถือ)
//    ตารางกว้างของหน้าคอมต้องเลื่อนซ้าย-ขวาบนมือถือ → เปลี่ยนเป็นการ์ดทีละรายการ อ่านด้วยนิ้วโป้งเดียว
//    ตัวเลขทุกตัวมาจากชุดเดียวกับหน้าคอม (execRawItems / ข้อมูลจากหลังบ้าน) — ต่างกันแค่หน้าตา
// ══════════════════════════════════════════════════
const EXEC_MOBILE_MQ = window.matchMedia ? matchMedia("(max-width: 700px)") : null;
const execIsMobile = () => !!(EXEC_MOBILE_MQ && EXEC_MOBILE_MQ.matches);
let _xmTab = "";   // แท็บที่เลือกค้างไว้ระหว่างรีเฟรช: todo | SQF | MLM | CR
// หมุนจอ / ย่อหน้าต่างข้ามขนาด → วาดใหม่ด้วยหน้าตาที่เหมาะกับจอ
if (EXEC_MOBILE_MQ && EXEC_MOBILE_MQ.addEventListener)
  EXEC_MOBILE_MQ.addEventListener("change", () => { if (typeof activeModule !== "undefined" && activeModule === "EXEC") loadExecDashboard(); });

const _xmNum = n => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const _xmSev = u => u === 0 ? "crit" : u === 1 ? "high" : u === 2 ? "warn" : "";
const _xmIdleTxt = idle => idle === null ? "ไม่เคยบันทึก" : idle === 0 ? "วันนี้" : idle === 1 ? "เมื่อวาน" : idle + " วันก่อน";

// การ์ดวัตถุดิบหนึ่งรายการ
function _xmRawCard(m, factory, staleDays) {
  const sev = _xmSev(m.urgency);
  const isLow = m.min > 0 && m.qty <= m.min;
  const stale = execIsStale(m.IdleDays, staleDays);
  const days = m.days === null
    ? '<span class="xm-days">—</span>'
    : `<span class="xm-days ${sev || "ok"}">${m.days}<small>วัน</small></span>`;
  const pct = m.min > 0 ? Math.min(100, Math.round((m.qty / m.min) * 100)) : null;
  const tags = [];
  if (isLow) tags.push('<span class="sq-chip high">ต่ำกว่าจุดสั่งซื้อ</span>');
  if (m.expDays !== null && m.expDays < 0) tags.push('<span class="sq-chip crit">⛔ หมดอายุแล้ว</span>');
  else if (m.expDays !== null && m.expDays <= 30) tags.push(`<span class="sq-chip warn">⏳ หมดอายุใน ${m.expDays} วัน</span>`);
  if (stale) tags.push(`<span class="sq-chip high">⏰ ไม่อัปเดต ${m.IdleDays === null ? "(ไม่เคยบันทึก)" : m.IdleDays + " วัน"}</span>`);
  return `<div class="xm-card ${sev ? "sev-" + sev : ""}">
    <div class="xm-top">
      <div class="xm-name">${escapeHtml(String(m.Name || "-"))}${factory ? ` <span class="xm-fac">${factory}</span>` : ""}</div>
      ${days}
    </div>
    <div class="xm-line">เหลือ <b>${_xmNum(m.qty)}</b> ${escapeHtml(String(m.Unit || ""))}${m.daily > 0 ? ` · ใช้ ${_xmNum(m.daily)}/วัน` : ""}${m.outDate ? ` · หมด ${m.outDate}` : ""}</div>
    ${pct === null ? "" : `<div class="sq-meter"><i style="width:${pct}%;background:${pct < 50 ? "var(--sq-crit)" : pct < 100 ? "var(--sq-high)" : "var(--sq-accent)"};"></i></div>
    <div class="xm-sub">จุดสั่งซื้อ ${_xmNum(m.min)} · มีอยู่ ${pct}%</div>`}
    <div class="xm-sub">อัปเดตล่าสุด ${m.IdleDays === undefined ? "—" : _xmIdleTxt(m.IdleDays)}</div>
    ${tags.length ? `<div class="xm-tags">${tags.join("")}</div>` : ""}
  </div>`;
}

// การ์ดล็อตห้องเย็น (หมดอายุ / ใกล้หมด / ไม่อัปเดต)
function _xmLotCard(x, kind, staleDays) {
  const cls = kind === "expired" ? "crit" : "high";
  const right = kind === "expired" ? `<span class="xm-days crit">${Math.abs(x.ExpireDays)}<small>วันแล้ว</small></span>`
    : kind === "expiring" ? `<span class="xm-days high">${x.ExpireDays}<small>วัน</small></span>`
    : `<span class="xm-days high">${x.IdleDays === null ? "—" : x.IdleDays}<small>วัน</small></span>`;
  const label = kind === "expired" ? "⛔ หมดอายุแล้ว" : kind === "expiring" ? "⏳ ใกล้หมดอายุ" : "⏰ ไม่อัปเดตเกิน " + staleDays + " วัน";
  return `<div class="xm-card sev-${cls}">
    <div class="xm-top"><div class="xm-name">${escapeHtml(String(x.ProductName || "-"))} <span class="xm-fac">ห้องเย็น</span></div>${right}</div>
    <div class="xm-line">ล็อต MFG ${isoToDdmmyy(String(x.MFG || ""))}${x.EXP ? " · EXP " + isoToDdmmyy(String(x.EXP)) : ""} · เหลือ <b>${_xmNum(x.Qty)}</b> ${escapeHtml(String(x.Unit || ""))}</div>
    <div class="xm-tags"><span class="sq-chip ${cls}">${label}</span></div>
  </div>`;
}

function execMobileView() {
  const D = _execChartData, sd = Number(D.staleDays) || 0;
  const sqf = execRawItems(D.SQF || []), mlm = execRawItems(D.MLM || []);
  const all = [...sqf.map(m => ({ m, f: "SQF" })), ...mlm.map(m => ({ m, f: "MLM" }))];
  const cr = D.CR || {}, prods = cr.products || [], exp = cr.expired || [], near = cr.expiring || [], staleLots = cr.staleLots || [];
  // ต้องดู = วิกฤต/เร่งด่วน/ต่ำกว่าจุดสั่งซื้อ/หมดอายุ/ไม่อัปเดต ของวัตถุดิบ + ล็อตห้องเย็นที่มีปัญหา
  const needs = all.filter(({ m }) => m.urgency <= 1 || (m.min > 0 && m.qty <= m.min) || (m.expDays !== null && m.expDays <= 30) || execIsStale(m.IdleDays, sd))
    .sort((a, b) => a.m.urgency - b.m.urgency || (a.m.days ?? 9999) - (b.m.days ?? 9999));
  const crNeeds = exp.length + near.length + (sd ? staleLots.length : 0);
  const todoCount = needs.length + crNeeds;
  if (!_xmTab) _xmTab = todoCount ? "todo" : "SQF";

  const k = (n, label, cls) => `<div class="xm-kpi"><div class="xm-kpi-n ${n ? cls : ""}">${_xmNum(n)}</div><div class="xm-kpi-l">${label}</div></div>`;
  const cnt = f => all.filter(f).length;
  const kpis = `<div class="xm-kpis">
    ${k(cnt(({ m }) => m.urgency === 0), "🔴 วิกฤต ≤7 วัน", "crit")}
    ${k(cnt(({ m }) => m.urgency === 1), "🟠 เร่งด่วน ≤14", "high")}
    ${k(cnt(({ m }) => m.urgency === 2), "🟡 ควรวางแผน ≤30", "warn")}
    ${k(cnt(({ m }) => m.min > 0 && m.qty <= m.min), "ต่ำกว่าจุดสั่งซื้อ", "high")}
    ${sd ? k(cnt(({ m }) => execIsStale(m.IdleDays, sd)), "⏰ ไม่อัปเดต >" + sd + " วัน", "high") : k(cnt(({ m }) => m.urgency >= 3), "✓ ปกติ", "")}
    ${k(crNeeds, "❄️ ห้องเย็นต้องดู", "high")}
  </div>`;

  const tab = (key, label, n) => `<button type="button" class="xm-tab${_xmTab === key ? " on" : ""}" onclick="execMobileTab('${key}')">${label}${n !== undefined ? ` <span class="xm-tab-n">${n}</span>` : ""}</button>`;
  const tabs = `<div class="xm-tabs" role="tablist">
    ${tab("todo", "🚨 ต้องดู", todoCount)}${tab("chart", "📈 กราฟ")}${tab("SQF", "SQF", sqf.length)}${tab("MLM", "MLM", mlm.length)}${tab("CR", "❄️ ห้องเย็น", prods.length)}
  </div>`;

  let list = "";
  if (_xmTab === "chart") {
    // 📈 กราฟทุกคลังในหน้าเดียว — แท่งแนวนอน อ่านชื่อได้เต็มบนจอแคบ ตัวเลขเขียนไว้ปลายแท่ง ไม่ต้องแตะดู
    list = _xmChartCard("status") + _xmChartCard("SQF") + _xmChartCard("MLM") + _xmChartCard("CR");
  } else if (_xmTab === "todo") {
    list = _xmChartCard("status") + needs.map(({ m, f }) => _xmRawCard(m, f, sd)).join("") +
      exp.map(x => _xmLotCard(x, "expired", sd)).join("") +
      near.map(x => _xmLotCard(x, "expiring", sd)).join("") +
      (sd ? staleLots.map(x => _xmLotCard(x, "stale", sd)).join("") : "");
    if (!needs.length && !crNeeds) list += '<p class="sq-empty">✅ ไม่มีรายการที่ต้องดูตอนนี้</p>';
  } else if (_xmTab === "SQF" || _xmTab === "MLM") {
    const items = _xmTab === "SQF" ? sqf : mlm;
    list = items.length ? _xmChartCard(_xmTab) + items.map(m => _xmRawCard(m, "", sd)).join("") : '<p class="sq-empty">ยังไม่มีรายการ</p>';
  } else {
    list = prods.length ? _xmChartCard("CR") + prods.map(p => {
      const stale = execIsStale(p.IdleDays, sd);
      return `<div class="xm-card">
        <div class="xm-top"><div class="xm-name">${escapeHtml(String(p.ProductName || "-"))}</div>
          <span class="xm-days ok" style="font-size:18px;">${_xmNum(p.TotalQty)}<small>${escapeHtml(String(p.Unit || ""))}</small></span></div>
        <div class="xm-sub">${p.LotCount} ล็อต · อัปเดตล่าสุด ${p.IdleDays === undefined ? "—" : _xmIdleTxt(p.IdleDays)}</div>
        ${stale ? `<div class="xm-tags"><span class="sq-chip high">⏰ ไม่อัปเดต ${p.IdleDays === null ? "(ไม่เคยบันทึก)" : p.IdleDays + " วัน"}</span></div>` : ""}
      </div>`;
    }).join("") + exp.map(x => _xmLotCard(x, "expired", sd)).join("") + near.map(x => _xmLotCard(x, "expiring", sd)).join("")
      : '<p class="sq-empty">ยังไม่มีสต๊อกในห้องเย็น</p>';
  }
  return `<div class="xm">${kpis}${tabs}<div class="xm-list">${list}</div>
    <p class="xm-foot">ดูอย่างเดียว · ตัวเลขดึงใหม่เองทุกครั้งที่กลับมาเปิดแอป · ⏰ = ไม่มีใครเบิก/รับ/นับ เกิน ${sd || "-"} วัน</p></div>`;
}
function execMobileTab(t) {
  _xmTab = t;
  const el = document.getElementById("execDashContent");
  if (el) el.innerHTML = execMobileView();
}
