// ══════════════════════════════════════════════════
// 📊 EXECUTIVE DASHBOARD
// ══════════════════════════════════════════════════
function openExecDashboard() { switchModule("EXEC"); }

async function loadExecDashboard() {
  const el = document.getElementById("execDashContent");
  el.innerHTML = '<p style="color:#475569;text-align:center;font-weight:700;padding:80px 0;font-size:15px;">⏳ กำลังโหลดข้อมูล...</p>';
  document.getElementById("execDashTimestamp").textContent = "กำลังดึงข้อมูล...";
  try {
    const [crRes, sqfRes, mlmRes] = await Promise.all([
      fetch(GAS_URL, { method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"},
        body: JSON.stringify({ module:"COLDROOM", action:"getStartupOverview" }) }).then(r=>r.json()),
      fetch(GAS_URL + "?module=SQF").then(r=>r.json()),
      fetch(GAS_URL + "?module=MLM").then(r=>r.json())
    ]);
    const now = new Date().toLocaleString("th-TH", { dateStyle:"medium", timeStyle:"short" });
    document.getElementById("execDashTimestamp").textContent = "อัปเดตล่าสุด: " + now;

    const topProds = crRes.ok ? (crRes.totalByProduct||[]).sort((a,b)=>b.TotalQty-a.TotalQty) : [];
    const expiring = crRes.ok ? (crRes.expiringLots||[]) : [];
    const expired  = crRes.ok ? (crRes.expiredLots||[])  : [];
    const sqfMats  = sqfRes.status === "success" ? sqfRes.materials : [];
    const mlmMats  = mlmRes.status === "success" ? mlmRes.materials : [];

    // ── Global KPI ──
    const globalKpi = execBuildKpi([...sqfMats, ...mlmMats]);

    el.innerHTML =
      globalKpi +
      execStockSection("❄️", "คลังสินค้า (COLDROOM)", "#0ea5e9", topProds, expiring, expired) +
      execRawSection("🏭", "วัตถุดิบ SQF", "#f59e0b", "#fffbeb", sqfMats) +
      execRawSection("🏭", "วัตถุดิบ MLM", "#10b981", "#f0fdf4", mlmMats);
  } catch(e) {
    document.getElementById("execDashTimestamp").textContent = "โหลดไม่สำเร็จ";
    el.innerHTML = `<p style="color:#ef4444;text-align:center;font-weight:700;padding:40px;">⚠️ โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(e.message)}</p>`;
  }
}

/** ─── Global KPI bar (รวม SQF+MLM) ─── */
function execBuildKpi(allMats) {
  const today = new Date(); today.setHours(0,0,0,0);
  const active = allMats.filter(m => !(m.Discontinued===true||String(m.Discontinued).toUpperCase()==="TRUE"));
  let crisis=0, urgent=0, warn=0, ok=0, totalDaily=0, totalMonthly=0, lowStock=0;
  active.forEach(m => {
    const qty   = Number(m.Qty||0);
    const daily = Number(m.DailyUsage||0);
    const min   = Number(m.Min||0);
    const days  = daily > 0 ? Math.floor(qty/daily) : null;
    if (daily > 0) { totalDaily += daily; totalMonthly += daily*30; }
    if (min > 0 && qty <= min) lowStock++;
    if      (days !== null && days <= 7)  crisis++;
    else if (days !== null && days <= 14) urgent++;
    else if (days !== null && days <= 30) warn++;
    else ok++;
  });
  const kpiCard = (icon, label, val, bg, fg, sub="") =>
    `<div style="background:${bg};border-radius:16px;padding:16px 20px;flex:1;min-width:130px;border:1px solid rgba(255,255,255,.06);">
      <div style="font-size:11px;font-weight:700;color:${fg};opacity:.7;letter-spacing:.8px;text-transform:uppercase;">${icon} ${label}</div>
      <div style="font-size:28px;font-weight:900;color:${fg};line-height:1.1;margin-top:4px;">${val}</div>
      ${sub?`<div style="font-size:10px;color:${fg};opacity:.6;margin-top:3px;font-weight:600;">${sub}</div>`:""}
    </div>`;
  return `
  <div style="margin-bottom:20px;">
    <div style="font-size:11px;font-weight:800;color:#475569;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;">📌 ภาพรวมวัตถุดิบทั้งหมด (SQF + MLM)</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      ${kpiCard("🔴","วิกฤต (≤7วัน)", crisis, "linear-gradient(135deg,#7f1d1d,#991b1b)", "#fca5a5", "ต้องสั่งทันที")}
      ${kpiCard("🟠","เร่งด่วน (≤14วัน)", urgent, "linear-gradient(135deg,#431407,#9a3412)", "#fdba74", "ควรสั่งภายในสัปดาห์")}
      ${kpiCard("⏳","ควรวางแผน (≤30วัน)", warn, "linear-gradient(135deg,#451a03,#92400e)", "#fcd34d", "วางแผนสั่งล่วงหน้า")}
      ${kpiCard("✅","ปกติ", ok, "linear-gradient(135deg,#052e16,#065f46)", "#6ee7b7", "สต๊อกเพียงพอ")}
      ${kpiCard("⚠️","สต๊อกต่ำกว่าขั้นต่ำ", lowStock, "linear-gradient(135deg,#1e1b4b,#312e81)", "#a5b4fc", "ต่ำกว่า Min")}
      ${kpiCard("⚡","ใช้รวม/วัน", totalDaily.toLocaleString("th-TH",{maximumFractionDigits:1}), "linear-gradient(135deg,#0c1445,#1e3a8a)", "#93c5fd", "หน่วยรวมทุกรายการ")}
      ${kpiCard("📦","ใช้รวม/เดือน", totalMonthly.toLocaleString("th-TH",{maximumFractionDigits:0}), "linear-gradient(135deg,#0d0d1a,#1e1b4b)", "#c4b5fd", "ประมาณการ 30 วัน")}
    </div>
  </div>`;
}

/** ─── Cold Room section ─── */
function execStockSection(icon, title, color, products, expiring, expired) {
  const warnCount = expiring.length + expired.length;
  const rows = products.map(p => `
    <tr style="border-bottom:1px solid rgba(255,255,255,.05);">
      <td style="padding:9px 12px;font-weight:700;color:#e2e8f0;">${escapeHtml(p.ProductName)}</td>
      <td style="padding:9px 12px;text-align:right;font-weight:900;color:${color};">${Number(p.TotalQty).toLocaleString()} <span style="font-size:11px;font-weight:500;color:#64748b;">${escapeHtml(p.Unit||"")}</span></td>
      <td style="padding:9px 12px;text-align:right;color:#475569;font-size:12px;">${p.LotCount} lot</td>
    </tr>`).join("");
  const expWarnHtml = expiring.length > 0 ? `
    <div style="margin-top:14px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);border-radius:12px;padding:12px 14px;">
      <div style="font-size:12px;font-weight:800;color:#fbbf24;margin-bottom:8px;">⚠️ ใกล้หมดอายุ (${expiring.length} รายการ)</div>
      ${expiring.slice(0,8).map(x=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(251,191,36,.1);font-size:12px;">
          <span style="font-weight:700;color:#cbd5e1;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:8px;">${escapeHtml(x.ProductName)}</span>
          <span style="white-space:nowrap;"><span style="background:#f59e0b;color:#fff;border-radius:999px;padding:2px 8px;font-weight:800;font-size:11px;">${x.ExpireDays} วัน</span></span>
        </div>`).join("")}
      ${expiring.length > 8 ? `<p style="font-size:11px;color:#fbbf24;margin-top:6px;text-align:center;opacity:.7;">...และอีก ${expiring.length-8} รายการ</p>` : ""}
    </div>` : "";
  const expiredHtml = expired.length > 0 ? `
    <div style="margin-top:10px;background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.2);border-radius:12px;padding:12px 14px;">
      <div style="font-size:12px;font-weight:800;color:#f87171;margin-bottom:8px;">❌ หมดอายุแล้ว (${expired.length} รายการ)</div>
      ${expired.slice(0,8).map(x=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(220,38,38,.1);font-size:12px;">
          <span style="font-weight:700;color:#cbd5e1;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:8px;">${escapeHtml(x.ProductName)}</span>
          <span style="background:#dc2626;color:#fff;border-radius:999px;padding:2px 8px;font-weight:800;font-size:11px;">${Math.abs(x.ExpireDays)} วัน</span>
        </div>`).join("")}
    </div>` : "";
  return `
  <div style="background:rgba(255,255,255,.04);backdrop-filter:blur(8px);border-radius:20px;padding:20px;border:1px solid rgba(255,255,255,.08);border-left:4px solid ${color};margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:6px;">
      <h3 style="margin:0;font-size:16px;font-weight:900;color:#f1f5f9;">${icon} ${title}</h3>
      <span style="font-size:12px;font-weight:700;color:#64748b;">${products.length} ชนิด${warnCount>0?` &nbsp;·&nbsp; <span style="color:#f59e0b;">${warnCount} แจ้งเตือน</span>`:""}</span>
    </div>
    ${products.length === 0
      ? '<p style="color:#475569;text-align:center;font-size:13px;padding:20px 0;font-weight:700;">ยังไม่มีสต๊อก</p>'
      : `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="border-bottom:1px solid rgba(255,255,255,.08);color:#64748b;font-size:11px;font-weight:800;">
            <th style="text-align:left;padding:6px 12px;">สินค้า</th>
            <th style="text-align:right;padding:6px 12px;">คงเหลือ</th>
            <th style="text-align:right;padding:6px 12px;">Lot</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`}
    ${expWarnHtml}${expiredHtml}
  </div>`;
}

/** ─── Raw materials section (SQF / MLM) ─── */
function execRawSection(icon, title, accentColor, bgTint, mats) {
  const today = new Date(); today.setHours(0,0,0,0);
  const active = mats.filter(m => !(m.Discontinued===true||String(m.Discontinued).toUpperCase()==="TRUE"));

  // คำนวณ metrics
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

  // Mini KPI สำหรับ section นี้
  const crisis  = items.filter(m=>m.urgency===0).length;
  const urgent2 = items.filter(m=>m.urgency===1).length;
  const warn2   = items.filter(m=>m.urgency===2).length;
  const ok2     = items.filter(m=>m.urgency===3||m.urgency===4).length;
  const secDaily = items.reduce((s,m)=>s+(m.daily||0),0);
  const secMonthly = secDaily*30;
  const lowCount = items.filter(m=>m.min>0&&m.qty<=m.min).length;

  const miniKpi = (label, val, fg, bg) =>
    `<div style="background:${bg};border-radius:10px;padding:8px 14px;text-align:center;min-width:80px;">
      <div style="font-size:20px;font-weight:900;color:${fg};">${val}</div>
      <div style="font-size:10px;font-weight:700;color:${fg};opacity:.75;margin-top:1px;">${label}</div>
    </div>`;

  const maxQty = Math.max(...items.map(m=>m.qty), 1);

  const rows = items.map((m,idx) => {
    const isLow  = m.min>0 && m.qty<=m.min;
    const rowBg  = idx%2===0?"rgba(255,255,255,.03)":"rgba(255,255,255,.015)";

    // urgency row color
    const urgencyBorder = m.urgency===0 ? "border-left:3px solid #dc2626;" :
                          m.urgency===1 ? "border-left:3px solid #ea580c;" :
                          m.urgency===2 ? "border-left:3px solid #f59e0b;" : "";

    // days badge
    const daysBg = m.days===null ? "" : m.days<=7?"#dc2626":m.days<=14?"#ea580c":m.days<=30?"#f59e0b":"#059669";
    const daysBadge = m.days===null
      ? `<span style="color:#475569;font-size:11px;">—</span>`
      : `<div><span style="background:${daysBg};color:#fff;border-radius:999px;padding:2px 9px;font-weight:800;font-size:11px;white-space:nowrap;">${m.days} วัน</span>
         <div style="font-size:10px;color:#64748b;margin-top:3px;white-space:nowrap;">${m.outDate||""}</div></div>`;

    // expiry badge
    const expBadge = m.expDays===null ? `<span style="color:#334155;font-size:11px;">—</span>` :
      m.expDays < 0  ? `<span style="background:#dc2626;color:#fff;border-radius:999px;padding:2px 7px;font-weight:800;font-size:10px;">หมดแล้ว</span>` :
      m.expDays <= 30? `<span style="background:#f59e0b;color:#fff;border-radius:999px;padding:2px 7px;font-weight:800;font-size:10px;">${m.expDays} วัน</span>` :
                       `<span style="color:#475569;font-size:11px;">${isoToDdmmyy(String(m.ExpiryDate))}</span>`;

    // progress bar (stock vs safety stock)
    const pct    = m.min>0 ? Math.min(100, Math.round((m.qty/m.min)*100)) : null;
    const pctBar = pct===null ? "" : `
      <div style="margin-top:4px;height:4px;background:rgba(255,255,255,.08);border-radius:4px;overflow:hidden;width:100%;">
        <div style="height:100%;width:${pct}%;background:${pct<50?"#dc2626":pct<100?"#f59e0b":"#10b981"};border-radius:4px;transition:width .4s;"></div>
      </div>
      <div style="font-size:9px;color:#475569;margin-top:2px;">vs ขั้นต่ำ ${m.min.toLocaleString()} = ${pct}%</div>`;

    const monthly = m.daily>0 ? (m.daily*30).toLocaleString("th-TH",{maximumFractionDigits:0}) : "—";

    return `<tr style="background:${rowBg};${urgencyBorder}">
      <td style="padding:10px 12px;font-weight:700;color:#e2e8f0;max-width:180px;">
        ${escapeHtml(String(m.Name))}
        ${isLow?`<span style="font-size:10px;background:#dc2626;color:#fff;border-radius:6px;padding:1px 5px;margin-left:4px;font-weight:800;">ต่ำ</span>`:""}
      </td>
      <td style="padding:10px 12px;text-align:right;">
        <span style="font-weight:900;color:${isLow?"#f87171":accentColor};font-size:14px;">${m.qty.toLocaleString()}</span>
        <span style="font-size:10px;color:#475569;margin-left:3px;">${escapeHtml(String(m.Unit||""))}</span>
        ${pctBar}
      </td>
      <td style="padding:10px 12px;text-align:right;color:#94a3b8;font-size:12px;">${m.min>0?m.min.toLocaleString():"—"}</td>
      <td style="padding:10px 12px;text-align:right;color:#60a5fa;font-size:12px;font-weight:700;">${m.daily>0?m.daily.toLocaleString("th-TH",{maximumFractionDigits:2}):"—"}</td>
      <td style="padding:10px 12px;text-align:right;color:#818cf8;font-size:12px;font-weight:700;">${monthly}</td>
      <td style="padding:10px 12px;text-align:center;">${daysBadge}</td>
      <td style="padding:10px 12px;text-align:center;">${expBadge}</td>
    </tr>`;
  }).join("");

  return `
  <div style="background:rgba(255,255,255,.04);backdrop-filter:blur(8px);border-radius:20px;padding:20px;border:1px solid rgba(255,255,255,.08);border-left:4px solid ${accentColor};margin-bottom:16px;">
    <!-- Section header -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
      <h3 style="margin:0;font-size:16px;font-weight:900;color:#f1f5f9;">${icon} ${title}</h3>
      <span style="font-size:12px;font-weight:700;color:#64748b;">${active.length} รายการ${lowCount>0?` · <span style="color:#f87171;">${lowCount} ต่ำกว่าขั้นต่ำ</span>`:""}</span>
    </div>
    <!-- Mini KPI row -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
      ${miniKpi("🔴 วิกฤต", crisis, "#fca5a5", "rgba(127,29,29,.5)")}
      ${miniKpi("🟠 เร่งด่วน", urgent2, "#fdba74", "rgba(67,20,7,.5)")}
      ${miniKpi("⏳ ควรสั่ง", warn2, "#fcd34d", "rgba(69,26,3,.5)")}
      ${miniKpi("✅ ปกติ", ok2, "#6ee7b7", "rgba(5,46,22,.5)")}
      <div style="flex:1;min-width:120px;"></div>
      ${miniKpi("⚡ ใช้/วัน", secDaily.toLocaleString("th-TH",{maximumFractionDigits:1}), "#93c5fd", "rgba(12,20,69,.5)")}
      ${miniKpi("📦 ใช้/เดือน", secMonthly.toLocaleString("th-TH",{maximumFractionDigits:0}), "#c4b5fd", "rgba(13,13,26,.5)")}
    </div>
    <!-- Table -->
    ${items.length === 0
      ? '<p style="color:#475569;text-align:center;font-size:13px;padding:20px 0;font-weight:700;">ยังไม่มีรายการวัตถุดิบ</p>'
      : `<div style="overflow-x:auto;border-radius:12px;border:1px solid rgba(255,255,255,.06);">
          <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:700px;">
            <thead>
              <tr style="background:rgba(255,255,255,.05);">
                <th style="padding:10px 12px;text-align:left;color:#64748b;font-size:11px;font-weight:800;border-bottom:1px solid rgba(255,255,255,.06);">วัตถุดิบ</th>
                <th style="padding:10px 12px;text-align:right;color:#64748b;font-size:11px;font-weight:800;border-bottom:1px solid rgba(255,255,255,.06);">คงเหลือ / หน่วย</th>
                <th style="padding:10px 12px;text-align:right;color:#64748b;font-size:11px;font-weight:800;border-bottom:1px solid rgba(255,255,255,.06);">ขั้นต่ำ</th>
                <th style="padding:10px 12px;text-align:right;color:#60a5fa;font-size:11px;font-weight:800;border-bottom:1px solid rgba(255,255,255,.06);">ใช้/วัน</th>
                <th style="padding:10px 12px;text-align:right;color:#818cf8;font-size:11px;font-weight:800;border-bottom:1px solid rgba(255,255,255,.06);">ใช้/เดือน</th>
                <th style="padding:10px 12px;text-align:center;color:#64748b;font-size:11px;font-weight:800;border-bottom:1px solid rgba(255,255,255,.06);">วันคงเหลือ / ถึงวันที่</th>
                <th style="padding:10px 12px;text-align:center;color:#64748b;font-size:11px;font-weight:800;border-bottom:1px solid rgba(255,255,255,.06);">หมดอายุ</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`}
  </div>`;
}
