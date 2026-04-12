// ═══════════════════════════════════════════════
// 🏭 RAW MATERIALS MODULE (SQF & MLM)
// ═══════════════════════════════════════════════

let rawCurrentModule  = "MLM";
let rawLastData       = [];
let rawCurrentFilter  = "all";
let rawAlertDays      = parseInt(localStorage.getItem("rawAlertDays") || "7");
let rawSortKey        = "status";   // status | name | qty
let rawSortAsc        = true;

window.rawSetSort = function(key) {
  if (rawSortKey === key) { rawSortAsc = !rawSortAsc; }
  else { rawSortKey = key; rawSortAsc = key !== "qty"; }
  ["status","name","qty"].forEach(k => {
    const el = document.getElementById("rawSortIcon-" + k);
    if (!el) return;
    if (k === rawSortKey) { el.textContent = rawSortAsc ? "↑" : "↓"; el.classList.remove("opacity-40"); el.classList.add("opacity-100","text-blue-500"); }
    else                  { el.textContent = "↕"; el.classList.add("opacity-40"); el.classList.remove("opacity-100","text-blue-500"); }
  });
  renderRawInventory(rawLastData);
};

function rawSetAlertDays(v) {
  rawAlertDays = Math.max(1, Math.min(365, parseInt(v) || 7));
  localStorage.setItem("rawAlertDays", rawAlertDays);
  const inp = document.getElementById("rawAlertDaysInput");
  if (inp) inp.value = rawAlertDays;
  renderRawInventory(rawLastData);
}
let rawNextSku        = "";
let rawHtml5QrCode    = null;
let rawVerifyTarget   = "";
let rawBarChart       = null;
let rawDonutChart     = null;
let rawCurrentQrSku   = "";
let rawCurrentQrName  = "";

const MODULE_META = {
  SQF: { title:"วัตถุดิบ SQF", subtitle:"สุพรรณคิวฟู้ดส์", subtitleClass:"text-orange-600 bg-orange-100", headerBorder:"border-orange-500", skuPrefix:"SQF-" },
  MLM: { title:"วัตถุดิบ MLM",   subtitle:"แม่ละมาย",        subtitleClass:"text-blue-600 bg-blue-100",   headerBorder:"border-blue-500",   skuPrefix:"MLM-" }
};

function updateRawHeader(mod) {
  const m = MODULE_META[mod];
  document.getElementById("rawModuleTitle").innerHTML       = m.title;
  document.getElementById("rawModuleSubtitle").textContent  = m.subtitle;
  document.getElementById("rawModuleSubtitle").className    = `text-sm font-black inline-block px-3 py-1 rounded-lg uppercase ${m.subtitleClass}`;
}

async function rawFetch(payload) {
  const res = await fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      module:     rawCurrentModule,
      deviceId:   currentDevice.id,
      deviceName: getDeviceInfo()
    })
  });
  const json = await res.json();
  if (handleTokenExpired(json)) return json;
  return json;
}

let _rawSearchAcInit = false;
async function rawLoadData(startup = false) {
  try {
    showLoading("กำลังโหลดข้อมูล...");
    const data = await (await fetch(`${GAS_URL}?module=${rawCurrentModule}`)).json();
    hideLoading();
    if (data.status && data.status !== "success") { showToast(data.message || "โหลดข้อมูลไม่สำเร็จ","error"); return; }
    rawLastData = Array.isArray(data.materials) ? data.materials : [];
    const inp = document.getElementById("rawAlertDaysInput");
    if (inp) inp.value = rawAlertDays;
    rawNextSku  = data.nextSku || MODULE_META[rawCurrentModule].skuPrefix + "0001";
    renderRawInventory(rawLastData);
    renderRawHistory(data.recentHistory || []);
    renderRawStats(rawLastData, data.discontinued || []);
    renderRawCharts(rawLastData);
    rawCheckCritical(rawLastData, rawCurrentModule, startup);

    // ── Autocomplete: rawSearch (ค้นหาวัตถุดิบ SQF/MLM) — ตั้งค่าครั้งเดียว ──
    if (!_rawSearchAcInit) {
      _rawSearchAcInit = true;
      const searchEl = document.getElementById("rawSearch");
      buildAutocomplete(
        searchEl,
        () => (rawLastData || []).map(m => {
          const daysLeft = m.ExpiryDate ? (function() {
            const ed = rawParseDate(m.ExpiryDate);
            if (!ed) return null;
            const tod = new Date(); tod.setHours(0,0,0,0);
            return Math.round((ed - tod) / 86400000);
          })() : null;
          const expBadge = daysLeft !== null && daysLeft <= 7  ? "⚠️ " + daysLeft + "วัน"
                         : daysLeft !== null && daysLeft <= 30 ? "🗓️ " + daysLeft + "วัน" : "";
          return {
            label: m.Name || m.SKU,
            sub:   `${m.SKU} · คงเหลือ: ${m.Qty} ${m.Unit || ""}${m.Qty <= m.Min && m.Min > 0 ? " 🔴ต่ำ" : ""}`,
            badge: expBadge,
            value: m.SKU
          };
        }),
        (item) => {
          // เปิด edit modal ให้เลย
          searchEl.value = "";
          renderRawInventory(rawLastData);
          openRawEdit(item.value);
        }
      );
    }
  } catch(err) { hideLoading(); showToast("เชื่อมต่อฐานข้อมูลล้มเหลว ❌","error"); }
}

// ── Charts ──
function renderRawCharts(items) {
  // กราฟวันคงเหลือ — เฉพาะรายการที่มี DailyUsage > 0
  const withDaily = items.filter(i => Number(i.DailyUsage||0) > 0);
  const sorted = [...withDaily]
    .map(i => ({ ...i, daysLeft: Math.floor(Number(i.Qty||0) / Number(i.DailyUsage||1)) }))
    .sort((a,b) => a.daysLeft - b.daysLeft)  // เรียงน้อย→มาก (เร่งด่วนก่อน)
    .slice(0, 12);

  const labels = sorted.map(i => { const n = String(i.Name||"-"); return n.length>16?n.slice(0,16)+"…":n; });
  const values = sorted.map(i => i.daysLeft);
  const colors = sorted.map(i =>
    i.daysLeft <= 7  ? "rgba(220,38,38,0.75)"  :   // 🔴 วิกฤต
    i.daysLeft <= 14 ? "rgba(234,88,12,0.75)"  :   // 🟠 เร่งด่วน
    i.daysLeft <= 30 ? "rgba(245,158,11,0.75)" :   // 🟡 ควรสั่ง
                       "rgba(5,150,105,0.75)"       // 🟢 ปลอดภัย
  );
  const borders = sorted.map(i =>
    i.daysLeft <= 7  ? "rgb(220,38,38)"  :
    i.daysLeft <= 14 ? "rgb(234,88,12)"  :
    i.daysLeft <= 30 ? "rgb(245,158,11)" :
                       "rgb(5,150,105)"
  );

  const ctx1 = document.getElementById("rawBarChart").getContext("2d");
  if (rawBarChart) rawBarChart.destroy();
  rawBarChart = new Chart(ctx1, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "วันที่ใช้งานได้ (วัน)",
        data: values,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 2,
        borderRadius: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { font: { family:"Sarabun", weight:"bold" } } },
        tooltip: {
          titleFont: { family:"Sarabun", weight:"bold" },
          bodyFont:  { family:"Sarabun" },
          callbacks: {
            label: ctx => `${ctx.parsed.y} วัน`,
            afterLabel: ctx => {
              const d = ctx.parsed.y;
              return d <= 7  ? "⚠️ วิกฤต — ต้องสั่งด่วน!" :
                     d <= 14 ? "🟠 เร่งด่วน" :
                     d <= 30 ? "🟡 ควรวางแผนสั่ง" : "✅ ปลอดภัย";
            }
          }
        },
        annotation: {}
      },
      scales: {
        x: { ticks: { font: { family:"Sarabun", weight:"bold" } } },
        y: {
          beginAtZero: true,
          title: { display: true, text: "วัน", font: { family:"Sarabun", weight:"bold" } },
          ticks: {
            font: { family:"Sarabun", weight:"bold" },
            callback: v => v + " วัน"
          }
        }
      }
    }
  });

  const today = new Date(); today.setHours(0,0,0,0);
  let safe=0, low=0, exp=0;
  items.forEach(i => {
    const isLow = Number(i.Qty) <= Number(i.Min);
    const ed = rawParseDate(i.ExpiryDate);
    const isExp = ed && ed < today;
    if (isExp) exp++; else if (isLow) low++; else safe++;
  });
  const ctx2 = document.getElementById("rawDonutChart").getContext("2d");
  if (rawDonutChart) rawDonutChart.destroy();
  rawDonutChart = new Chart(ctx2, { type:"doughnut", data:{ labels:["ปลอดภัย","สต๊อกต่ำ","หมดอายุ"], datasets:[{ data:[safe,low,exp], borderWidth:2, hoverOffset:8 }] }, options:{ responsive:true, maintainAspectRatio:false, cutout:"62%", plugins:{ legend:{position:"bottom",labels:{font:{family:"Sarabun",weight:"bold"},padding:18}}, tooltip:{titleFont:{family:"Sarabun",weight:"bold"},bodyFont:{family:"Sarabun"}} } } });
}

// ── Date helpers ──
function rawForceThaiDate(str) {
  if (!str || ["","---","ยังไม่ระบุ"].includes(str)) return "ยังไม่ระบุ";
  try {
    const d = new Date(str); if (isNaN(d.getTime())) return str;
    let y = d.getFullYear(); if (y < 2400) y+=543; while(y>2600)y-=543;
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${y}`;
  } catch(e) { return str; }
}
function rawParseDate(str) {
  const s = rawForceThaiDate(str);
  const p = s.split("/"); if (p.length!==3) return null;
  const d=parseInt(p[0]),m=parseInt(p[1]),y=parseInt(p[2]);
  if (isNaN(d)||isNaN(m)||isNaN(y)) return null;
  return new Date(y-543, m-1, d);
}
function rawNearExpiry(item, days) {
  const today=new Date(); today.setHours(0,0,0,0);
  const ed=rawParseDate(item.ExpiryDate); if(!ed) return false;
  const diff=Math.ceil((ed-today)/(1000*60*60*24));
  return diff>=0 && diff<=days;
}
function rawFormatDateInput(v) {
  if (!v||v==="ยังไม่ระบุ") return "";
  if (typeof v==="string"&&/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
    const [dd,mm,yyyy]=v.split("/"); const y=parseInt(yyyy)>2400?parseInt(yyyy)-543:parseInt(yyyy);
    return `${y}-${mm}-${dd}`;
  }
  const d=new Date(v); if(isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}


// ── Render inventory ──
function renderRawInventory(items) {
  const list   = document.getElementById("rawInventoryList");
  const search = (document.getElementById("rawSearch")?.value||"").toLowerCase();
  const today  = new Date(); today.setHours(0,0,0,0);

  const filtered = items.filter(item => {
    const name = (item.Name||"").toLowerCase(); const sku = (item.SKU||"").toLowerCase();
    if (!name.includes(search) && !sku.includes(search)) return false;
    const isLow = Number(item.Qty)<=Number(item.Min);
    const ed=rawParseDate(item.ExpiryDate); const isExp=ed&&ed<today;
    if (rawCurrentFilter==="low"   && !isLow)            return false;
    if (rawCurrentFilter==="exp"   && !isExp)            return false;
    if (rawCurrentFilter==="near"  && !rawNearExpiry(item, rawAlertDays)) return false;
    return true;
  });

  const _statusPri = item => {
    const isLow = Number(item.Qty) <= Number(item.Min);
    const ed = rawParseDate(item.ExpiryDate); const isExp = ed && ed < today;
    const d = Number(item.DailyUsage||0); const q = Number(item.Qty||0);
    const days = d > 0 ? Math.floor(q/d) : null;
    const iad = Number(item.AlertDays) || rawAlertDays;
    if (days !== null && days <= 7) return 0;
    if (isExp)  return 1;
    if (isLow)  return 2;
    if (days !== null && days <= 14) return 3;
    if (rawNearExpiry(item, iad) || (days !== null && days <= 30)) return 4;
    return 5;
  };
  filtered.sort((a, b) => {
    let va, vb;
    if (rawSortKey === "name")     { va = (a.Name||"").toLowerCase(); vb = (b.Name||"").toLowerCase(); }
    else if (rawSortKey === "qty") { va = Number(a.Qty||0); vb = Number(b.Qty||0); }
    else                           { va = _statusPri(a); vb = _statusPri(b); }
    if (va < vb) return rawSortAsc ? -1 : 1;
    if (va > vb) return rawSortAsc ? 1 : -1;
    return 0;
  });

  window._rawFiltered = filtered;
  window._rawShown = 0;
  list.innerHTML = "";
  rawLoadMoreItems();
}

const RAW_ITEMS_PER_PAGE = 50;

function rawRenderItemRow(item) {
  const today = new Date(); today.setHours(0,0,0,0);
  const isLow=Number(item.Qty)<=Number(item.Min);
  const ed=rawParseDate(item.ExpiryDate); const isExp=ed&&ed<today;
  const itemAlertDays = Number(item.AlertDays) || rawAlertDays;
  const nearAlert=rawNearExpiry(item, itemAlertDays);
  const daily    = Number(item.DailyUsage||0);
  const qty      = Number(item.Qty||0);
  const daysLeft = daily > 0 ? Math.floor(qty / daily) : null;
  const outDate  = daysLeft !== null ? (() => { const d=new Date(today); d.setDate(d.getDate()+daysLeft); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()+543}`; })() : null;
  let bc="bg-emerald-600 text-white", bi="✅", bt="ปลอดภัย";
  let rowBg="", rowBorder="";
  if(isExp)                             {bc="bg-red-600 text-white";    bi="🔴"; bt="หมดอายุ";   rowBg="bg-red-50";    rowBorder="border-l-4 border-red-500";}
  else if(daysLeft!==null&&daysLeft<=7) {bc="bg-red-600 text-white";    bi="🔴"; bt="วิกฤต";    rowBg="bg-red-50";    rowBorder="border-l-4 border-red-500";}
  else if(isLow)                        {bc="bg-orange-500 text-white"; bi="🟠"; bt="ต่ำ";       rowBg="bg-orange-50"; rowBorder="border-l-4 border-orange-500";}
  else if(daysLeft!==null&&daysLeft<=14){bc="bg-orange-500 text-white"; bi="🟠"; bt="เร่งด่วน"; rowBg="bg-orange-50"; rowBorder="border-l-4 border-orange-500";}
  else if(nearAlert||daysLeft!==null&&daysLeft<=30){bc="bg-amber-500 text-white";bi="⏳"; bt="ควรสั่ง"; rowBg="bg-amber-50"; rowBorder="border-l-4 border-amber-400";}
  return `<tr class="border-b transition-colors ${rowBg} ${rowBorder} hover:brightness-95">
    <td class="p-8 text-center"><input type="checkbox" class="raw-checkbox" data-sku="${escapeAttr(item.SKU)}"></td>
    <td class="p-8"><span class="badge-status ${bc} uppercase"><span>${bi}</span><span>${bt}</span></span></td>
    <td class="p-8">
      <div class="font-black text-slate-800 text-base leading-snug" style="max-width:220px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;" title="${escapeAttr(item.Name||"-")}">${escapeHtml(item.Name||"-")}</div>
      <div class="text-[12px] text-slate-400 font-mono font-black mt-3">📦 ${escapeHtml(item.SKU||"-")} • 📅 Exp: ${rawForceThaiDate(item.ExpiryDate)}</div>
    </td>
    <td class="p-8 text-right">
      <div class="font-black text-4xl text-slate-900 tracking-tighter">${qty.toLocaleString()}</div>
      <div class="text-[11px] font-black text-emerald-600 uppercase mt-2 tracking-widest">${escapeHtml(item.Unit||"-")}</div>
      ${daysLeft !== null ? `<div class="text-[11px] font-black mt-1 ${daysLeft<=7?"text-red-500":daysLeft<=14?"text-orange-500":daysLeft<=30?"text-amber-500":"text-slate-400"}" style="white-space:nowrap;">⏱ เหลือ ${daysLeft} วัน <span class="font-normal opacity-75">(ถึงวันที่ ${outDate})</span></div>` : ""}
    </td>
    <td class="p-8 text-center">
      <div class="text-[11px] font-black text-slate-800 leading-none mb-2">นับจริง: ${rawForceThaiDate(item.LastVerified)}</div>
      ${window._appIsViewer ? "" : `<div class="grid grid-cols-2 gap-2">
        <button onclick="openRawAction('${escapeJs(item.SKU)}','${escapeJs(item.Name)}','${escapeJs(item.Unit)}',${Number(item.Qty)||0})" class="bg-blue-600 text-white px-3 py-3 rounded-2xl text-[10px] font-black hover:bg-black uppercase">📥 รับ/เบิก</button>
        <button onclick="openRawVerify('${escapeJs(item.SKU)}','${escapeJs(item.Name)}')"  class="bg-purple-600 text-white px-3 py-3 rounded-2xl text-[10px] font-black hover:bg-black uppercase">นับสต๊อก</button>
        <button onclick="openRawEdit('${escapeJs(item.SKU)}')"                             class="bg-sky-600    text-white px-3 py-3 rounded-2xl text-[10px] font-black hover:bg-black uppercase">แก้ไข</button>
        <button onclick="rawDelete('${escapeJs(item.SKU)}','${escapeJs(item.Name)}')"       class="bg-red-50 text-red-600 px-3 py-3 rounded-2xl text-[10px] font-black hover:bg-red-600 hover:text-white uppercase">ลบ</button>
      </div>`}
    </td>
  </tr>`;
}

function rawLoadMoreItems() {
  const items = window._rawFiltered || [];
  const list = document.getElementById("rawInventoryList");
  if (!list || !items.length) return;

  const start = window._rawShown || 0;
  const end = Math.min(start + RAW_ITEMS_PER_PAGE, items.length);

  // ลบปุ่มเก่า
  const oldBtn = document.getElementById("rawLoadMoreRow");
  if (oldBtn) oldBtn.remove();

  let html = "";
  for (let i = start; i < end; i++) {
    html += rawRenderItemRow(items[i]);
  }
  list.insertAdjacentHTML("beforeend", html);
  window._rawShown = end;

  if (end < items.length) {
    list.insertAdjacentHTML("beforeend", `
      <tr id="rawLoadMoreRow">
        <td colspan="5" style="text-align:center;padding:16px;">
          <button onclick="rawLoadMoreItems()" class="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all" style="font-family:inherit;">
            โหลดเพิ่ม (${end}/${items.length}) ▼
          </button>
        </td>
      </tr>`);
  }
}

// ── Render history ──
function renderRawHistory(h) {
  const list = document.getElementById("rawHistoryList");
  list.innerHTML = (h||[]).map(x => {
    const act=String(x[2]||"");
    let color="bg-slate-800 border-slate-900 text-white",emj="ℹ️";
    if(act.includes("เบิก"))  {color="bg-orange-500 border-orange-700 text-white";  emj="📤";}
    else if(act.includes("รับ"))   {color="bg-emerald-600 border-emerald-800 text-white";emj="📥";}
    else if(act.includes("สร้าง")) {color="bg-blue-600 border-blue-800 text-white";    emj="🆕";}
    else if(act.includes("นับ")||act.includes("ตรวจ")){color="bg-purple-600 border-purple-800 text-white";emj="⚖️";}
    else if(act.includes("ลบ")||act.includes("ยกเลิก")){color="bg-red-600 border-red-800 text-white";emj="🗑️";}
    else if(act.includes("สำรอง")){color="bg-cyan-600 border-cyan-800 text-white";emj="☁️";}
    else if(act.includes("แก้ไข")){color="bg-sky-600 border-sky-800 text-white";  emj="✏️";}
    return `<div class="history-item border-l-[10px] ${color} shadow-lg">
      <div class="history-text-main">${emj} ${escapeHtml(x[1]||"-")}</div>
      <div class="font-black text-xl mt-1 leading-none">${escapeHtml(act)}: ${escapeHtml(String(x[3]||"-"))}</div>
      <div class="history-text-sub">${rawForceThaiDate(x[0])} • โดย: ${escapeHtml(x[4]||"-")}</div>
    </div>`;
  }).join("");
}

// ── Render stats ──
function renderRawStats(items, discontinued) {
  const today=new Date(); today.setHours(0,0,0,0);
  const low = items.filter(i=>Number(i.Qty)<=Number(i.Min)&&Number(i.Qty)>0).length;
  const exp = items.filter(i=>{ const d=rawParseDate(i.ExpiryDate); return d&&d<today; }).length;
  document.getElementById("rawStatCards").innerHTML = `
    <div class="bg-white p-8 rounded-[3.5rem] text-center shadow-lg border-b-8 border-blue-500"><p class="text-[11px] font-black text-slate-400 mb-2">📦 รายการทั้งหมด</p><p class="text-5xl font-black text-slate-800">${items.length}</p></div>
    <div class="bg-white p-8 rounded-[3.5rem] text-center shadow-lg border-b-8 border-orange-500"><p class="text-[11px] font-black text-slate-400 mb-2">🟠 สต๊อกต่ำ</p><p class="text-5xl font-black text-orange-600">${low}</p></div>
    <div class="bg-white p-8 rounded-[3.5rem] text-center shadow-lg border-b-8 border-red-500"><p class="text-[11px] font-black text-slate-400 mb-2">🔴 หมดอายุ</p><p class="text-5xl font-black text-red-600">${exp}</p></div>
    <div class="bg-white p-8 rounded-[3.5rem] text-center shadow-lg border-b-8 border-slate-900"><p class="text-[11px] font-black text-slate-400 mb-2">🗑️ ยกเลิก</p><p class="text-5xl font-black text-slate-800">${Array.isArray(discontinued)?discontinued.length:0}</p></div>`;
}

// ── Filter ──
function setRawFilter(t) {
  rawCurrentFilter = t;
  document.querySelectorAll('[id^="rawFilter-"]').forEach(b => b.classList.remove("filter-active"));
  const btn = document.getElementById("rawFilter-"+t);
  if (btn) btn.classList.add("filter-active");
  renderRawInventory(rawLastData);
}
function rawToggleAll() {
  const checked = document.getElementById("rawSelectAll").checked;
  document.querySelectorAll(".raw-checkbox").forEach(cb => cb.checked=checked);
}

// ── Export ──
function rawExportSelected() {
  const skus = Array.from(document.querySelectorAll(".raw-checkbox:checked")).map(cb=>cb.getAttribute("data-sku"));
  if (!skus.length) { showToast("กรุณาเลือกรายการ","warn"); return; }
  const data = rawLastData.filter(i=>skus.includes(String(i.SKU)));
  let csv = "\uFEFFSKU,ชื่อวัตถุดิบ,คงเหลือ,หน่วย,วันหมดอายุ,ตรวจนับล่าสุด\n";
  data.forEach(i=>{ csv+=`"${String(i.SKU||"").replace(/"/g,'""')}","${String(i.Name||"").replace(/"/g,'""')}","${i.Qty||""}","${String(i.Unit||"").replace(/"/g,'""')}","${rawForceThaiDate(i.ExpiryDate)}","${rawForceThaiDate(i.LastVerified)}"\n`; });
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
  a.download=`สต๊อก_${rawCurrentModule}_${new Date().toLocaleDateString("th-TH").replace(/\//g,"-")}.csv`; a.click();
  showToast("ส่งออกไฟล์สำเร็จ","success");
}

// ── Export PDF ──
function rawExportPdf() {
  const today = new Date(); today.setHours(0,0,0,0);
  const factoryName = rawCurrentModule === "SQF" ? "สุพรรณคิวฟู้ดส์ (SQF)" : "แม่ละมาย (MLM)";
  const dateStr = new Date().toLocaleDateString("th-TH",{year:"numeric",month:"long",day:"numeric"});
  const rows = rawLastData.map(item => {
    const isLow = Number(item.Qty) <= Number(item.Min);
    const ed = rawParseDate(item.ExpiryDate); const isExp = ed && ed < today;
    const nearAlert2 = rawNearExpiry(item, rawAlertDays);
    let rowStyle = "", statusText = "ปลอดภัย", statusColor = "#059669";
    if(isExp)        { rowStyle="background:#fee2e2;"; statusText="หมดอายุ";                        statusColor="#dc2626"; }
    else if(isLow)   { rowStyle="background:#ffedd5;"; statusText="ต่ำ";                             statusColor="#ea580c"; }
    else if(nearAlert2){ rowStyle="background:#fef9c3;"; statusText=`ใกล้หมด(≤${rawAlertDays}ว)`; statusColor="#d97706"; }
    return `<tr style="${rowStyle}">
      <td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(item.SKU||"-")}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:700;">${escapeHtml(item.Name||"-")}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:right;font-weight:700;">${Number(item.Qty||0).toLocaleString()}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:right;">${Number(item.Min||0).toLocaleString()}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(item.Unit||"-")}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;">${rawForceThaiDate(item.ExpiryDate)||"-"}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:${statusColor};">${statusText}</td>
    </tr>`;
  }).join("");
  const w = window.open("","","width=1000,height=700");
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
  <title>รายงานสต๊อกวัตถุดิบ — ${factoryName}</title>
  <style>
    body{font-family:'Sarabun',sans-serif;font-size:13px;color:#1e293b;padding:32px;}
    h1{font-size:22px;font-weight:900;margin-bottom:4px;}
    h2{font-size:15px;font-weight:700;color:#64748b;margin-bottom:24px;}
    table{width:100%;border-collapse:collapse;margin-top:16px;}
    thead tr{background:#1e293b;color:#fff;}
    th{padding:10px 12px;border:1px solid #334155;text-align:left;font-size:12px;font-weight:700;}
    td{font-size:12px;}
    .footer{margin-top:32px;font-size:11px;color:#94a3b8;text-align:right;}
    @media print{body{padding:16px;}}
  </style></head><body>
  <h1>📦 รายงานสต๊อกวัตถุดิบ</h1>
  <h2>🏭 โรงงาน: ${factoryName} &nbsp;|&nbsp; 📅 วันที่พิมพ์: ${dateStr} &nbsp;|&nbsp; 👤 ผู้พิมพ์: ${currentUser}</h2>
  <table>
    <thead><tr><th>รหัส SKU</th><th>ชื่อวัตถุดิบ</th><th style="text-align:right">คงเหลือ</th><th style="text-align:right">ขั้นต่ำ</th><th>หน่วย</th><th>วันหมดอายุ</th><th style="text-align:center">สถานะ</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">รวมทั้งหมด ${rawLastData.length} รายการ &nbsp;|&nbsp; พิมพ์โดยระบบจัดการสต๊อก SQF & MLM</div>
  <script>window.onload=function(){window.print();}<\/script>
  </body></html>`);
  w.document.close();
}

// ── ใบขอซื้อ ──
function openPurchaseRequest() {
  const today = new Date(); today.setHours(0,0,0,0);
  const checkedSkus = Array.from(document.querySelectorAll(".raw-checkbox:checked")).map(cb=>cb.getAttribute("data-sku"));
  // ถ้าเลือกไว้ใช้เฉพาะที่เลือก, ถ้าไม่เลือกกรองเฉพาะที่สต๊อกต่ำ/หมดอายุ
  const lowItems = checkedSkus.length > 0
    ? rawLastData.filter(i => checkedSkus.includes(String(i.SKU)))
    : rawLastData.filter(item => {
        const isLow = Number(item.Qty) <= Number(item.Min);
        const ed = rawParseDate(item.ExpiryDate); const isExp = ed && ed < today;
        return isLow || isExp;
      });
  if (!lowItems.length) { showToast("ไม่มีรายการที่ต้องสั่งซื้อ ✅","success"); return; }

  const factoryName = rawCurrentModule === "SQF" ? "สุพรรณคิวฟู้ดส์ (SQF)" : "แม่ละมาย (MLM)";
  const dateStr = new Date().toLocaleDateString("th-TH",{year:"numeric",month:"long",day:"numeric"});
  const rows = lowItems.map((item,idx) => {
    const isLow = Number(item.Qty) <= Number(item.Min);
    const ed = rawParseDate(item.ExpiryDate); const isExp = ed && ed < today;
    let reason = [];
    if(isExp) reason.push("หมดอายุ");
    if(isLow) reason.push(`สต๊อกต่ำ`);
    const qty       = Number(item.Qty||0);
    const minQty    = Number(item.Min||0);
    const daily     = Number(item.DailyUsage||0);
    // วันคงเหลือ = qty / daily
    const daysLeft  = (daily > 0) ? Math.floor(qty / daily) : null;
    // แนะนำสั่ง: ถ้ามี daily → 30 วัน, ถ้าไม่มี → Min - Qty
    const suggestQty = daily > 0 ? Math.ceil(daily * 30) : (Math.max(0, minQty - qty) || 0);
    // ใช้ได้กี่วันหลังสั่ง = สั่งจริง ÷ ใช้/วัน (ปัดลง)
    const daysAfterSuggest = daily > 0 ? Math.floor(suggestQty / daily) : null;
    const daysText   = daysLeft !== null ? `${daysLeft} วัน` : "-";
    return `<tr style="${isExp?"background:#fee2e2":"background:#ffedd5"}" data-qty="${qty}" data-daily="${daily}">
      <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center;">${idx+1}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:11px;color:#64748b;">${escapeHtml(item.SKU||"-")}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:700;">${escapeHtml(item.Name||"-")}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:right;">${qty.toLocaleString()}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:right;color:#64748b;">${daily > 0 ? daily.toLocaleString() : "-"}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:${daysLeft!==null&&daysLeft<=7?"#dc2626":daysLeft!==null&&daysLeft<=14?"#ea580c":"#475569"};">${daysText}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:right;">
        <input type="number" class="order-input" value="${suggestQty > 0 ? suggestQty : ""}" min="0"
          style="width:80px;padding:4px 6px;border:2px solid #6366f1;border-radius:8px;font-size:13px;font-weight:700;text-align:right;font-family:inherit;"
          oninput="calcDaysAfter(this)">
        <span class="order-input-print" style="display:none;font-weight:700;">${suggestQty > 0 ? suggestQty.toLocaleString() : "-"}</span>
      </td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center;font-weight:700;">
        <span class="days-after" style="color:#059669;">${daysAfterSuggest !== null ? daysAfterSuggest + " วัน" : "-"}</span>
      </td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(item.Unit||"-")}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#ea580c;font-weight:700;">${reason.join(", ")}</td>
    </tr>`;
  }).join("");

  const w = window.open("","","width=1050,height=750");
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
  <title>ใบขอซื้อวัตถุดิบ — ${factoryName}</title>
  <style>
    body{font-family:'Sarabun',sans-serif;font-size:13px;color:#1e293b;padding:32px 40px;}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e293b;padding-bottom:16px;margin-bottom:16px;}
    h1{font-size:24px;font-weight:900;margin:0 0 4px;}
    .sub{font-size:13px;color:#475569;}
    .doc-no{text-align:right;font-size:12px;color:#64748b;line-height:1.8;}
    .formula-note{background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px 16px;font-size:11px;color:#1d4ed8;margin-bottom:16px;line-height:1.8;}
    .print-btn{background:#6366f1;color:#fff;border:none;padding:8px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;margin-bottom:12px;}
    table{width:100%;border-collapse:collapse;margin-top:8px;}
    thead tr{background:#1e293b;color:#fff;}
    th{padding:10px 12px;border:1px solid #334155;font-size:11px;font-weight:700;text-align:left;}
    td{font-size:12px;}
    .sign-section{margin-top:60px;display:flex;gap:60px;}
    .sign-box{flex:1;text-align:center;border-top:2px solid #94a3b8;padding-top:8px;font-size:12px;color:#64748b;}
    .footer{margin-top:24px;font-size:11px;color:#94a3b8;text-align:center;}
    @media print{
      .no-print{display:none!important;}
      .order-input{display:none!important;}
      .order-input-print{display:inline!important;}
      body{padding:16px 24px;}
    }
  </style></head><body>
  <div class="no-print" style="margin-bottom:12px;display:flex;gap:10px;align-items:center;">
    <button class="print-btn" onclick="window.print()">🖨️ พิมพ์ใบขอซื้อ</button>
    <span style="font-size:12px;color:#64748b;">✏️ แก้ไขช่อง <b style="color:#6366f1;">สั่งจริง</b> ได้ก่อนพิมพ์ — ระบบจะคำนวณ <b style="color:#059669;">ใช้ได้กี่วัน</b> ให้อัตโนมัติ</span>
  </div>
  <div class="header">
    <div>
      <h1>📋 ใบขอซื้อวัตถุดิบ</h1>
      <div class="sub">🏭 โรงงาน: <b>${factoryName}</b></div>
    </div>
    <div class="doc-no">
      <div>วันที่: <b>${dateStr}</b></div>
      <div>ผู้จัดทำ: <b>${currentUser}</b></div>
      <div>รายการทั้งหมด: <b>${lowItems.length} รายการ</b></div>
    </div>
  </div>
  <div class="formula-note no-print">
    💡 <b>วิธีคำนวณ "สั่งจริง" ที่ pre-fill ให้:</b>
    &nbsp;&nbsp;• ถ้ามีข้อมูล <b>ใช้/วัน</b> → สั่งจริง (เริ่มต้น) = <b>ใช้/วัน × 30 วัน</b>
    &nbsp;&nbsp;• ถ้าไม่มีข้อมูลใช้/วัน → สั่งจริง (เริ่มต้น) = <b>Stock ขั้นต่ำ − คงเหลือ</b>
    &nbsp;&nbsp;• <b>ใช้ได้กี่วัน (หลังสั่ง)</b> = สั่งจริง ÷ ใช้/วัน (ปัดลง — ไม่นับวันที่ใช้ไม่เต็ม)
  </div>
  <table>
    <thead><tr>
      <th style="width:32px;text-align:center">ลำดับ</th>
      <th style="width:80px">รหัส SKU</th>
      <th>ชื่อวัตถุดิบ</th>
      <th style="text-align:right;width:75px">คงเหลือ</th>
      <th style="text-align:right;width:65px">ใช้/วัน</th>
      <th style="text-align:center;width:70px">วันคงเหลือ</th>
      <th style="text-align:right;width:90px">สั่งจริง ✏️</th>
      <th style="text-align:center;width:85px">ใช้ได้กี่วัน<br>(หลังสั่ง)</th>
      <th style="width:50px">หน่วย</th>
      <th style="width:90px">เหตุผล</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="sign-section">
    <div class="sign-box">ผู้จัดทำ<br><br>( ${currentUser} )</div>
    <div class="sign-box">ผู้ตรวจสอบ<br><br>( .......................... )</div>
    <div class="sign-box">ผู้อนุมัติ<br><br>( .......................... )</div>
  </div>
  <div class="footer">พิมพ์โดยระบบจัดการสต๊อก SQF & MLM &nbsp;|&nbsp; ${new Date().toLocaleString("th-TH")}</div>
  <script>
    function calcDaysAfter(inputEl) {
      const tr    = inputEl.closest("tr");
      const qty   = Number(tr.dataset.qty) || 0;
      const daily = Number(tr.dataset.daily) || 0;
      const order = Number(inputEl.value) || 0;
      const printSpan = tr.querySelector(".order-input-print");
      if (printSpan) printSpan.textContent = order > 0 ? order.toLocaleString() : "-";
      const daysEl = tr.querySelector(".days-after");
      if (daily > 0) {
        const d = Math.floor(order / daily);
        daysEl.textContent = d + " วัน";
        daysEl.style.color = d <= 7 ? "#dc2626" : d <= 14 ? "#ea580c" : d <= 30 ? "#f59e0b" : "#059669";
      } else {
        daysEl.textContent = "-";
      }
    }
  <\/script>
  </body></html>`);
  w.document.close();
}

// ── ใบรายงานสต๊อก ──
function openStockReport() {
  // ดึง SKU ที่ติ๊กถูก — ถ้าไม่เลือกเลยให้ใช้ทั้งหมด
  const checkedSkus = Array.from(document.querySelectorAll(".raw-checkbox:checked")).map(cb=>cb.getAttribute("data-sku"));
  const sourceData  = checkedSkus.length > 0
    ? rawLastData.filter(i => checkedSkus.includes(String(i.SKU)))
    : rawLastData;
  if (!sourceData.length) { showToast("ไม่มีข้อมูล","warn"); return; }

  const today = new Date(); today.setHours(0,0,0,0);
  const factoryName = rawCurrentModule === "SQF" ? "สุพรรณคิวฟู้ดส์ (SQF)" : "แม่ละมาย (MLM)";
  const dateStr = new Date().toLocaleDateString("th-TH",{year:"numeric",month:"long",day:"numeric"});
  const timeStr = new Date().toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"});
  const scopeLabel = checkedSkus.length > 0 ? `เฉพาะที่เลือก (${checkedSkus.length} รายการ)` : "ทั้งหมด";

  // แยกกลุ่มจาก sourceData
  const expItems   = sourceData.filter(i => { const d=rawParseDate(i.ExpiryDate); return d&&d<today; });
  const lowItems   = sourceData.filter(i => !expItems.includes(i) && Number(i.Qty)<=Number(i.Min));
  const near7      = sourceData.filter(i => !expItems.includes(i) && rawNearExpiry(i, rawAlertDays));
  const near30     = [];
  const okItems    = sourceData.filter(i => !expItems.includes(i) && !lowItems.includes(i) && !near7.includes(i));

  const total    = sourceData.length;

  function buildSection(title, color, bgColor, items, showDaily=false) {
    if(!items.length) return "";
    const rows = items.map((item,idx) => {
      const qty      = Number(item.Qty||0);
      const daily    = Number(item.DailyUsage||0);
      const daysLeft = daily > 0 ? Math.floor(qty/daily) : null;
      const outDate  = daysLeft !== null ? (() => { const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+daysLeft); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()+543}`; })() : null;
      const daysText = daysLeft !== null
        ? `<span style="font-weight:700;color:${daysLeft<=7?"#dc2626":daysLeft<=14?"#ea580c":"#475569"}">${daysLeft} วัน</span>${outDate?`<br><span style="font-size:10px;color:#94a3b8;font-weight:400;">(ถึง ${outDate})</span>`:""}`
        : "-";
      return `<tr style="background:${idx%2===0?"#fff":bgColor}">
        <td style="padding:7px 10px;border:1px solid #e2e8f0;text-align:center;font-size:11px;">${idx+1}</td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;font-weight:700;">${escapeHtml(item.Name||"-")}</td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;text-align:right;font-weight:700;">${qty.toLocaleString()} <span style="font-size:10px;color:#64748b;font-weight:400;">${escapeHtml(item.Unit||"")}</span></td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;text-align:right;">${Number(item.Min||0).toLocaleString()}</td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;text-align:right;color:#0284c7;">${daily>0?daily.toLocaleString():"-"}</td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;text-align:center;line-height:1.6;">${daysText}</td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;">${rawForceThaiDate(item.ExpiryDate)||"-"}</td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;">${rawForceThaiDate(item.LastVerified)||"-"}</td>
      </tr>`;
    }).join("");
    return `<div style="margin-bottom:28px">
      <div style="background:${bgColor};border-left:6px solid ${color};padding:10px 16px;border-radius:6px 6px 0 0;font-weight:900;font-size:13px;color:${color};letter-spacing:0.5px;">${title} (${items.length} รายการ)</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#1e293b;color:#fff;">
          <th style="padding:7px 10px;border:1px solid #334155;text-align:center;width:30px">ลำดับ</th>
          <th style="padding:7px 10px;border:1px solid #334155;">ชื่อวัตถุดิบ</th>
          <th style="padding:7px 10px;border:1px solid #334155;text-align:right;width:100px">คงเหลือ / หน่วย</th>
          <th style="padding:7px 10px;border:1px solid #334155;text-align:right;width:65px">ขั้นต่ำ</th>
          <th style="padding:7px 10px;border:1px solid #334155;text-align:right;width:65px">ใช้/วัน</th>
          <th style="padding:7px 10px;border:1px solid #334155;text-align:center;width:110px">วันคงเหลือ / ถึงวันที่</th>
          <th style="padding:7px 10px;border:1px solid #334155;width:90px">วันหมดอายุ</th>
          <th style="padding:7px 10px;border:1px solid #334155;width:100px">ตรวจนับล่าสุด</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  const w = window.open("","","width=1100,height=800");
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
  <title>ใบรายงานสต๊อกวัตถุดิบ — ${factoryName}</title>
  <style>
    body{font-family:'Sarabun',sans-serif;font-size:13px;color:#1e293b;padding:28px 36px;}
    .report-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;margin-bottom:20px;border-bottom:3px solid #1e293b;}
    h1{font-size:22px;font-weight:900;margin:0 0 4px;}
    .sub{font-size:12px;color:#475569;}
    .summary{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;}
    .sum-card{flex:1;min-width:120px;background:#f8fafc;border:2px solid #e2e8f0;border-radius:10px;padding:12px 16px;text-align:center;}
    .sum-card .num{font-size:26px;font-weight:900;line-height:1;}
    .sum-card .lbl{font-size:10px;font-weight:700;color:#94a3b8;margin-top:4px;text-transform:uppercase;}
    .sign-section{margin-top:48px;display:flex;gap:48px;}
    .sign-box{flex:1;text-align:center;border-top:2px solid #94a3b8;padding-top:8px;font-size:11px;color:#64748b;}
    .footer{margin-top:20px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:12px;}
    @media print{body{padding:12px 20px;} .no-print{display:none;}}
  </style></head><body>
  <div class="report-header">
    <div>
      <h1>📑 ใบรายงานสต๊อกวัตถุดิบ</h1>
      <div class="sub">🏭 โรงงาน: <b>${factoryName}</b> &nbsp;|&nbsp; 📅 <b>${dateStr}</b> เวลา <b>${timeStr} น.</b></div>
      <div class="sub" style="margin-top:4px;">👤 ผู้จัดทำ: <b>${currentUser}</b> &nbsp;|&nbsp; 📋 ขอบเขต: <b>${scopeLabel}</b></div>
    </div>
    <div style="text-align:right;">
      <button class="no-print" onclick="window.print()" style="background:#1e293b;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">🖨️ พิมพ์</button>
    </div>
  </div>

  <div class="summary">
    <div class="sum-card"><div class="num" style="color:#1e293b">${total}</div><div class="lbl">รายการทั้งหมด</div></div>
    <div class="sum-card"><div class="num" style="color:#dc2626">${expItems.length}</div><div class="lbl">🔴 หมดอายุ</div></div>
    <div class="sum-card"><div class="num" style="color:#ea580c">${lowItems.length}</div><div class="lbl">🟠 สต๊อกต่ำ</div></div>
    <div class="sum-card"><div class="num" style="color:#d97706">${near7.length}</div><div class="lbl">⏳ ใกล้หมด 7 วัน</div></div>
    <div class="sum-card"><div class="num" style="color:#0284c7">${near30.length}</div><div class="lbl">🗓️ ใกล้หมด 30 วัน</div></div>
    <div class="sum-card"><div class="num" style="color:#059669">${okItems.length}</div><div class="lbl">✅ ปกติ</div></div>
  </div>

  ${buildSection("🔴 หมดอายุ — ต้องดำเนินการทันที","#dc2626","#fee2e2",expItems)}
  ${buildSection("🟠 สต๊อกต่ำกว่าจุดสั่งซื้อ","#ea580c","#fff7ed",lowItems)}
  ${buildSection(`⏳ ใกล้หมดอายุ ภายใน ${rawAlertDays} วัน`,"#d97706","#fefce8",near7)}
  ${buildSection("✅ สต๊อกปกติ","#059669","#f0fdf4",okItems)}

  <div class="sign-section">
    <div class="sign-box">ผู้จัดทำรายงาน<br><br>( ${currentUser} )</div>
    <div class="sign-box">ผู้ตรวจสอบ<br><br>( .......................... )</div>
    <div class="sign-box">ผู้จัดการ / ผู้อนุมัติ<br><br>( .......................... )</div>
  </div>
  <div class="footer">พิมพ์โดยระบบจัดการสต๊อก SQF & MLM &nbsp;|&nbsp; ${new Date().toLocaleString("th-TH")} &nbsp;|&nbsp; รวมทั้งหมด ${total} รายการ</div>
  </body></html>`);
  w.document.close();
}

// ── Backup ──
async function rawRunBackup() {
  if (!confirm("สำรองข้อมูลลง Drive? ☁️")) return;
  showLoading("กำลังสำรองข้อมูล...");
  const r = await rawFetch({ action:"BACKUP", user:currentUser });
  hideLoading();
  if (r.status==="success") { showToast("Backup สำเร็จ ☁️","success"); rawLoadData(); }
  else showToast(r.message||"Backup ไม่สำเร็จ","error");
}

// ── Modals ──
function openRawCreate() {
  document.getElementById("rawNewSku").value        = rawNextSku;
  document.getElementById("rawNewName").value       = "";
  document.getElementById("rawNewQty").value        = "0";
  document.getElementById("rawNewUnit").value       = "";
  document.getElementById("rawNewMin").value        = "0";
  document.getElementById("rawNewDailyUsage").value = "0";
  document.getElementById("rawNewExpiry").value     = "";
  document.getElementById("rawCreateModal").classList.remove("hidden");
}
function closeRawCreate() { document.getElementById("rawCreateModal").classList.add("hidden"); }

function openRawEdit(sku) {
  const item = rawLastData.find(i=>String(i.SKU)===String(sku));
  if (!item) { showToast("ไม่พบข้อมูล","error"); return; }
  document.getElementById("rawEditSku").value        = item.SKU||"";
  document.getElementById("rawEditName").value       = item.Name||"";
  document.getElementById("rawEditUnit").value       = item.Unit||"";
  document.getElementById("rawEditMin").value        = Number(item.Min||0);
  document.getElementById("rawEditDailyUsage").value = Number(item.DailyUsage||0);
  document.getElementById("rawEditExpiry").value     = rawFormatDateInput(item.ExpiryDate);
  document.getElementById("rawEditAlertDays").value  = item.AlertDays ? Number(item.AlertDays) : rawAlertDays;
  document.getElementById("rawEditModal").classList.remove("hidden");
}
function closeRawEdit() { document.getElementById("rawEditModal").classList.add("hidden"); }

function openRawVerify(sku, name) {
  rawVerifyTarget = sku;
  document.getElementById("rawVerifyTitle").innerText = `${name} (${sku})`;
  document.getElementById("rawVerifyQty").value = "";
  document.getElementById("rawVerifyModal").classList.remove("hidden");
}
function closeRawVerify() { document.getElementById("rawVerifyModal").classList.add("hidden"); }

function openRawAction(sku, name, unit, currentQty) {
  const qty = Number(currentQty) || 0;
  document.getElementById("rawModalSkuVal").value      = sku;
  document.getElementById("rawModalSku").innerText     = `ID: ${sku}`;
  document.getElementById("rawModalUnit").innerText    = `หน่วยนับ: ${unit||"-"}`;
  document.getElementById("rawModalTitle").innerText   = name;
  document.getElementById("rawModalQty").value         = "1";
  document.getElementById("rawModalCurrentQty").value  = qty;
  document.getElementById("rawModalStock").textContent = qty + " " + (unit||"");
  document.getElementById("rawModalStock").style.color = qty <= 0 ? "#dc2626" : qty < 10 ? "#ea580c" : "#1d4ed8";
  document.getElementById("rawActionModal").classList.remove("hidden");
  setRawType("OUT");
}
function closeRawAction() { document.getElementById("rawActionModal").classList.add("hidden"); }

function setRawType(t) {
  document.getElementById("rawModalType").value = t;
  document.getElementById("rawBtnOut").className = t==="OUT"
    ? "flex-1 py-5 rounded-[2.5rem] font-black text-lg bg-white shadow-xl text-orange-600 uppercase"
    : "flex-1 py-5 rounded-[2.5rem] font-black text-lg text-slate-400 uppercase";
  document.getElementById("rawBtnIn").className = t==="IN"
    ? "flex-1 py-5 rounded-[2.5rem] font-black text-lg bg-white shadow-xl text-emerald-600 uppercase"
    : "flex-1 py-5 rounded-[2.5rem] font-black text-lg text-slate-400 uppercase";
}

function openRawQr() {
  if (!rawLastData.length) { showToast("ยังไม่มีข้อมูล","warn"); return; }
  openRawQrByItem(rawLastData[0].SKU, rawLastData[0].Name);
}
function openRawQrByItem(sku, name) {
  rawCurrentQrSku = sku; rawCurrentQrName = name||sku;
  document.getElementById("rawQrTitle").innerText = `${rawCurrentQrName} (${sku})`;
  document.getElementById("rawQrcode").innerHTML  = "";
  document.getElementById("rawQrModal").classList.remove("hidden");
  const qrText = `RAWMAT|${rawCurrentModule}|${sku}`;
  new QRCode(document.getElementById("rawQrcode"), { text: qrText, width:220, height:220, correctLevel: QRCode.CorrectLevel.M });
}
function closeRawQr() { document.getElementById("rawQrModal").classList.add("hidden"); }

function downloadRawQr() {
  const img=document.querySelector("#rawQrcode img"), canvas=document.querySelector("#rawQrcode canvas");
  const src = img?img.src : canvas?canvas.toDataURL("image/png"):null;
  if (!src) { showToast("ไม่พบ QR","error"); return; }
  const a=document.createElement("a"); a.href=src; a.download=`QR_${rawCurrentQrSku||"item"}.png`; a.click();
  showToast("ดาวน์โหลด QR สำเร็จ","success");
}

function closeRawAlert() { document.getElementById("rawAlertModal").classList.add("hidden"); }

// ── พิมพ์ QR Code ทั้งหมดของวัตถุดิบ (ใช้ QRCode.js → data URL) ──
function rawPrintQrAll() {
  const checkedSkus = Array.from(document.querySelectorAll(".raw-checkbox:checked")).map(cb => cb.getAttribute("data-sku"));
  const source = checkedSkus.length > 0
    ? rawLastData.filter(i => checkedSkus.includes(String(i.SKU)))
    : rawLastData;
  if (!source.length) { showToast("ยังไม่มีข้อมูล", "warn"); return; }

  const factory = rawCurrentModule;
  const factoryLabel = factory === "SQF" ? "สุพรรณคิวฟู้ดส์ (SQF)" : "แม่ละมาย (MLM)";
  const factoryColor = factory === "SQF" ? "#2563eb" : "#16a34a";
  const dateStr = new Date().toLocaleDateString("th-TH", { year:"numeric", month:"long", day:"numeric" });

  // Generate QR data URLs using QRCode.js (synchronous canvas)
  const tmpWrap = document.createElement("div");
  tmpWrap.style.cssText = "position:fixed;left:-9999px;top:0;visibility:hidden;";
  document.body.appendChild(tmpWrap);

  const qrDataUrls = {};
  source.forEach(item => {
    const el = document.createElement("div");
    tmpWrap.appendChild(el);
    new QRCode(el, { text: `RAWMAT|${factory}|${item.SKU}`, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });
    const canvas = el.querySelector("canvas");
    qrDataUrls[item.SKU] = canvas ? canvas.toDataURL("image/png") : "";
  });
  document.body.removeChild(tmpWrap);

  const cards = source.map(item => {
    const name = String(item.Name || "").replace(/&/g,"&amp;").replace(/</g,"&lt;");
    const sku  = String(item.SKU  || "").replace(/&/g,"&amp;");
    const src  = qrDataUrls[item.SKU] || "";
    return `
      <div class="qr-card">
        <div class="qr-factory" style="background:${factoryColor}">${factory}</div>
        ${src ? `<img src="${src}" alt="QR ${sku}">` : `<div style="width:160px;height:160px;margin:0 auto 8px;background:#f1f5f9;border-radius:8px;"></div>`}
        <div class="qr-sku">${sku}</div>
        <div class="qr-name">${name}</div>
      </div>`;
  }).join("");

  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head>
  <meta charset="utf-8">
  <title>QR วัตถุดิบ — ${factoryLabel}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:Sarabun,sans-serif;background:#f8fafc;padding:20px;}
    h1{text-align:center;font-size:18px;font-weight:900;margin-bottom:4px;color:#1e293b;}
    .sub{text-align:center;font-size:12px;color:#64748b;margin-bottom:20px;}
    .grid{display:flex;flex-wrap:wrap;gap:12px;justify-content:flex-start;}
    .qr-card{
      width:200px;background:#fff;border-radius:16px;border:2px solid #e2e8f0;
      padding:12px 10px 14px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.08);
      page-break-inside:avoid;
    }
    .qr-factory{
      display:inline-block;color:#fff;font-size:10px;font-weight:900;
      padding:3px 10px;border-radius:999px;margin-bottom:8px;letter-spacing:1px;
    }
    .qr-card img{width:160px;height:160px;display:block;margin:0 auto 8px;}
    .qr-sku{font-size:11px;font-weight:900;color:#475569;letter-spacing:1px;margin-bottom:3px;}
    .qr-name{font-size:13px;font-weight:700;color:#1e293b;line-height:1.3;}
    @media print{
      body{background:#fff;padding:10px;}
      .no-print{display:none!important;}
    }
  </style>
  </head><body>
  <div class="no-print" style="text-align:center;margin-bottom:16px;">
    <button onclick="window.print()" style="background:#1e293b;color:#fff;border:none;padding:10px 28px;border-radius:10px;font-size:14px;font-weight:900;cursor:pointer;margin-right:8px;">🖨️ พิมพ์</button>
    <button onclick="window.close()" style="background:#64748b;color:#fff;border:none;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:900;cursor:pointer;">✕ ปิด</button>
  </div>
  <h1>🔲 QR Code วัตถุดิบ — ${factoryLabel}</h1>
  <div class="sub">พิมพ์วันที่ ${dateStr} &nbsp;|&nbsp; ${source.length} รายการ</div>
  <div class="grid">${cards}</div>
  </body></html>`);
  win.document.close();
}

// ── Submit actions ──
async function rawSubmitNew() {
  const sku=document.getElementById("rawNewSku").value.trim(), name=document.getElementById("rawNewName").value.trim(),
        unit=document.getElementById("rawNewUnit").value.trim(), qty=Number(document.getElementById("rawNewQty").value),
        min=Number(document.getElementById("rawNewMin").value),
        dailyUsage=Number(document.getElementById("rawNewDailyUsage").value||0),
        expiry=document.getElementById("rawNewExpiry").value;
  if (!sku)  return showToast("ไม่พบ SKU","error");
  if (!name) return showToast("กรุณาระบุชื่อ","warn");
  if (!unit) return showToast("กรุณาระบุหน่วยนับ","warn");
  setRawBusy("rawBtnCreate",true,"กำลังสร้าง...");
  showLoading("กำลังสร้างรายการ...");
  const alertDaysNew = Math.max(1, parseInt(document.getElementById("rawNewAlertDays").value||rawAlertDays));
  const r = await rawFetch({ action:"CREATE", sku, name, unit, qty, min, dailyUsage, expiryDate:expiry, alertDays:alertDaysNew, user:currentUser });
  hideLoading(); setRawBusy("rawBtnCreate",false);
  if (r.status==="success") {
    closeRawCreate();
    showToast("สร้างรายการสำเร็จ ✅","success");
    rawLoadData();
    // แสดง QR ทันที
    openRawQrByItem(sku, name);
  }
  else showToast(r.message||"ไม่สำเร็จ","error");
}

async function rawSubmitEdit() {
  const sku=document.getElementById("rawEditSku").value.trim(), name=document.getElementById("rawEditName").value.trim(),
        unit=document.getElementById("rawEditUnit").value.trim(), min=Number(document.getElementById("rawEditMin").value),
        dailyUsage=Number(document.getElementById("rawEditDailyUsage").value||0),
        expiry=document.getElementById("rawEditExpiry").value;
  if (!sku)  return showToast("ไม่พบ SKU","error");
  if (!name) return showToast("กรุณาระบุชื่อ","warn");
  if (!unit) return showToast("กรุณาระบุหน่วย","warn");
  setRawBusy("rawBtnEdit",true,"กำลังบันทึก...");
  showLoading("กำลังบันทึกการแก้ไข...");
  const alertDaysEdit = Math.max(1, parseInt(document.getElementById("rawEditAlertDays").value||rawAlertDays));
  const r = await rawFetch({ action:"EDIT", sku, name, unit, min, dailyUsage, expiryDate:expiry, alertDays:alertDaysEdit, user:currentUser });
  hideLoading(); setRawBusy("rawBtnEdit",false);
  if (r.status==="success") { closeRawEdit(); showToast("แก้ไขเรียบร้อย ✏️","success"); rawLoadData(); }
  else showToast(r.message||"ไม่สำเร็จ","error");
}

async function rawSubmitAction() {
  const sku  = document.getElementById("rawModalSkuVal").value;
  const type = document.getElementById("rawModalType").value;
  const qty  = Number(document.getElementById("rawModalQty").value);
  const curQty = Number(document.getElementById("rawModalCurrentQty").value) || 0;
  if (!sku)               return showToast("ไม่พบ SKU","error");
  if (isNaN(qty)||qty<=0) return showToast("ระบุจำนวนให้ถูกต้อง","warn");
  // ✅ เช็คสต๊อกก่อนส่ง (เฉพาะ OUT)
  if (type === "OUT" && qty > curQty) {
    return showToast(`⚠️ สต๊อกไม่เพียงพอ — มีอยู่ ${curQty} ไม่สามารถเบิก ${qty} ได้`, "error");
  }
  setRawBusy("rawBtnSubmit",true,"กำลังบันทึก...");
  showLoading(type==="IN"?"กำลังบันทึกรับเข้า...":"กำลังบันทึกการเบิก...");
  const r = await rawFetch({ action:"UPDATE", sku, type, qty, user:currentUser });
  hideLoading(); setRawBusy("rawBtnSubmit",false);
  if (r.status==="success") { closeRawAction(); showToast("บันทึกสำเร็จ ✔️","success"); rawLoadData(); }
  else showToast(r.message||"ไม่สำเร็จ","error");
}

async function rawSubmitVerify() {
  const q=Number(document.getElementById("rawVerifyQty").value);
  if (!rawVerifyTarget) return showToast("ไม่พบ SKU","error");
  if (isNaN(q)||q<0)    return showToast("ระบุยอดให้ถูกต้อง","warn");
  setRawBusy("rawBtnVerify",true,"กำลังบันทึก...");
  showLoading("กำลังบันทึกยอดตรวจนับ...");
  const r = await rawFetch({ action:"VERIFY", sku:rawVerifyTarget, qty:q, user:currentUser });
  hideLoading(); setRawBusy("rawBtnVerify",false);
  if (r.status==="success") { closeRawVerify(); showToast("บันทึกยอดจริงสำเร็จ ✅","success"); rawLoadData(); }
  else showToast(r.message||"ไม่สำเร็จ","error");
}

async function rawDelete(sku, name) {
  if (!confirm(`ยกเลิกการใช้ "${name}" ?`)) return;
  showLoading("กำลังลบ...");
  const r = await rawFetch({ action:"DELETE", sku, user:currentUser });
  hideLoading();
  if (r.status==="success") { showToast("ลบสำเร็จ 🗑️","success"); rawLoadData(); }
  else showToast(r.message||"ลบไม่สำเร็จ","error");
}

// ── Scanner ──
async function openRawScanner() {
  document.getElementById("rawScannerModal").classList.remove("hidden");
  try {
    rawHtml5QrCode = new Html5Qrcode("rawReader");
    await rawHtml5QrCode.start({ facingMode:"environment" }, { fps:10, qrbox:250 }, txt => {
      const val = String(txt||"").trim();
      const item = rawLastData.find(i=>String(i.SKU)===val);
      closeRawScanner();
      if (item) openRawAction(item.SKU, item.Name, item.Unit, item.Qty);
      else showToast("ไม่พบรหัสนี้ ❌","error");
    });
  } catch(err) { showToast("เปิดกล้องไม่สำเร็จ ❌","error"); closeRawScanner(true); }
}

async function closeRawScanner(forceHide=false) {
  if (forceHide) { document.getElementById("rawScannerModal").classList.add("hidden"); return; }
  try { if (rawHtml5QrCode?.isScanning) { await rawHtml5QrCode.stop(); await rawHtml5QrCode.clear(); } }
  catch(e) {} finally { rawHtml5QrCode=null; document.getElementById("rawScannerModal").classList.add("hidden"); }
}

// ── Button busy ──
function setRawBusy(id, busy, txt="กำลังบันทึก...") {
  const btn=document.getElementById(id); if (!btn) return;
  if (!btn.dataset.orig) btn.dataset.orig = btn.innerHTML;
  btn.classList.toggle("btn-disabled", busy);
  btn.innerHTML = busy ? txt : btn.dataset.orig;
}

