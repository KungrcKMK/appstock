// ══════════════════════════════════════════════════
// 📊 EXECUTIVE DASHBOARD
//    หน้าตาใช้ชุด class กลาง .sq-* (นิยามใน index.html)
//    ⚠️ สูตรคำนวณและเกณฑ์ตัดสินทุกอย่างเหมือนเดิมทุกบรรทัด
// ══════════════════════════════════════════════════
function openExecDashboard() { switchModule("EXEC"); }

async function loadExecDashboard() {
  const el = document.getElementById("execDashContent");
  el.innerHTML = '<p class="sq-empty">⏳ กำลังโหลดข้อมูล...</p>';
  document.getElementById("execDashTimestamp").textContent = "กำลังดึงข้อมูล...";
  try {
    const [crRes, sqfRes, mlmRes] = await Promise.all([
      fetch(GAS_URL, { method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"},
        body: JSON.stringify({ module:"COLDROOM", action:"getStartupOverview" }) }).then(r=>r.json()),
      fetch(GAS_URL + "?module=SQF").then(r=>r.json()),
      fetch(GAS_URL + "?module=MLM").then(r=>r.json())
    ]);
    const now = new Date().toLocaleString("th-TH", { dateStyle:"medium", timeStyle:"short" });
    document.getElementById("execDashTimestamp").textContent = "อัปเดตล่าสุด " + now;

    const topProds = crRes.ok ? (crRes.totalByProduct||[]).sort((a,b)=>b.TotalQty-a.TotalQty) : [];
    const expiring = crRes.ok ? (crRes.expiringLots||[]) : [];
    const expired  = crRes.ok ? (crRes.expiredLots||[])  : [];
    const sqfMats  = sqfRes.status === "success" ? sqfRes.materials : [];
    const mlmMats  = mlmRes.status === "success" ? mlmRes.materials : [];

    // ── Global KPI ──
    const globalKpi = execBuildKpi([...sqfMats, ...mlmMats]);

    el.innerHTML =
      globalKpi +
      execStockSection("❄️", "คลังสินค้า", "rail-cold", topProds, expiring, expired) +
      execRawSection("🏭", "วัตถุดิบ SQF — สุพรรณคิวฟู้ดส์", "rail-sqf", sqfMats) +
      execRawSection("🏭", "วัตถุดิบ MLM — แม่ละมาย",       "rail-mlm", mlmMats);
  } catch(e) {
    document.getElementById("execDashTimestamp").textContent = "โหลดไม่สำเร็จ";
    el.innerHTML = `<div class="sq-card"><p class="sq-empty" style="color:var(--sq-crit);font-weight:700;">⚠️ โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(e.message)}</p></div>`;
  }
}

/** ─── แถบตัวเลขรวม (SQF+MLM) ─── */
function execBuildKpi(allMats) {
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
  </div>`;
}

/** ─── ส่วนคลังสินค้า ─── */
function execStockSection(icon, title, railClass, products, expiring, expired) {
  const warnCount = expiring.length + expired.length;
  const rows = products.map(p => `
    <tr>
      <td><span class="sq-name">${escapeHtml(p.ProductName)}</span></td>
      <td class="n"><span class="sq-num">${Number(p.TotalQty).toLocaleString()}</span><span class="sq-unit">${escapeHtml(p.Unit||"")}</span></td>
      <td class="n sq-dim"><span class="sq-num" style="font-weight:600;color:var(--sq-muted);">${p.LotCount}</span> lot</td>
    </tr>`).join("");

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
      <span class="sq-card-note">${products.length} ชนิด${warnCount>0?` · <span style="color:var(--sq-high);font-weight:700;">${warnCount} ต้องดู</span>`:""}</span>
    </div>
    ${products.length === 0
      ? '<p class="sq-empty">ยังไม่มีสต๊อก</p>'
      : `<div class="sq-tablewrap"><table class="sq-table">
          <thead><tr><th>สินค้า</th><th class="n">คงเหลือ</th><th class="n">จำนวน lot</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`}
    ${lotList(expiring, "warn", "⏳", "ใกล้หมดอายุ", false)}
    ${lotList(expired,  "crit", "⛔", "หมดอายุแล้ว", true)}
  </div>`;
}

/** ─── ส่วนวัตถุดิบ (SQF / MLM) ─── */
function execRawSection(icon, title, railClass, mats) {
  const today = new Date(); today.setHours(0,0,0,0);
  const active = mats.filter(m => !(m.Discontinued===true||String(m.Discontinued).toUpperCase()==="TRUE"));

  // คำนวณ metrics — เหมือนเดิมทุกบรรทัด
  const items = active.map(m => {
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

  const crisis  = items.filter(m=>m.urgency===0).length;
  const urgent2 = items.filter(m=>m.urgency===1).length;
  const warn2   = items.filter(m=>m.urgency===2).length;
  const ok2     = items.filter(m=>m.urgency===3||m.urgency===4).length;
  const lowCount = items.filter(m=>m.min>0&&m.qty<=m.min).length;

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
    </div>
    ${items.length === 0
      ? '<p class="sq-empty">ยังไม่มีรายการวัตถุดิบ</p>'
      : `<div class="sq-tablewrap">
          <table class="sq-table" style="min-width:860px;">
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
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`}
  </div>`;
}
