// ═════════════════════════════════════════════
// myhistory.js — 📜 ประวัติของฉัน
//   พนักงานทุก role ดูได้ แต่เห็น "เฉพาะรายการที่ตัวเองทำ"
//   ตั้งใจไม่แสดง: ยอดคงเหลือ, ขั้นต่ำ, อัตราใช้/วัน, รายการของคนอื่น
//   (กันข้อมูลทางการค้ารั่ว — แสดงเฉพาะสิ่งที่เจ้าตัวทำเอง ซึ่งเขารู้อยู่แล้ว)
// ═════════════════════════════════════════════

const MYHIST_META = {
  "เบิกออก":         { icon:"📤", fg:"var(--sq-high)", bg:"var(--sq-high-bg)" },
  "รับเข้า":         { icon:"📥", fg:"var(--sq-accent)", bg:"var(--sq-accent-2)" },
  "คืนวัตถุดิบ":     { icon:"↩️", fg:"var(--sq-accent)", bg:"var(--sq-accent-2)" },
  "ตรวจนับ/ปรับยอด": { icon:"📊", fg:"#0891b2", bg:"var(--sq-accent-2)" },
  "สร้างรายการ":     { icon:"🆕", fg:"#7c3aed", bg:"var(--sq-accent-2)" }
};
const _mhMeta = a => MYHIST_META[a] || { icon:"•", fg:"var(--sq-muted)", bg:"var(--sq-raised)" };

async function openMyHistory() {
  document.getElementById("myHistModal").classList.remove("hidden");
  document.getElementById("myHistWhoDesk").textContent = currentUser || "";
  document.getElementById("myHistSummaryDesk").innerHTML = "";
  document.getElementById("myHistListDesk").innerHTML =
    '<p style="color:var(--sq-muted);text-align:center;font-weight:700;padding:40px 0;">⏳ กำลังโหลด...</p>';

  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ module: "SYSTEM", action: "getMyHistory",
        payload: { username: currentUser }, deviceName: getDeviceInfo() })
    }).then(r => r.json());

    if (!res.ok) {
      document.getElementById("myHistListDesk").innerHTML =
        `<p style="color:var(--sq-crit);text-align:center;font-weight:700;padding:40px 0;">❌ ${escapeHtml(res.message || "โหลดไม่สำเร็จ")}</p>`;
      return;
    }

    // สรุปจำนวนครั้งแต่ละประเภท
    const sum = res.summary || {};
    document.getElementById("myHistSummaryDesk").innerHTML = Object.keys(sum).map(k => {
      const m = _mhMeta(k);
      return `<div style="background:${m.bg};border:1px solid ${m.fg}33;border-radius:14px;padding:10px 16px;text-align:center;min-width:96px;">
        <div style="font-size:22px;font-weight:900;color:${m.fg};line-height:1.1;">${sum[k]}</div>
        <div style="font-size:11px;font-weight:800;color:${m.fg};opacity:.8;margin-top:2px;">${m.icon} ${escapeHtml(k)}</div>
      </div>`;
    }).join("");

    const rows = res.rows || [];
    document.getElementById("myHistListDesk").innerHTML = rows.length
      ? `<div style="display:flex;flex-direction:column;gap:8px;">` + rows.map(x => {
          const m = _mhMeta(x.action);
          return `<div style="display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--sq-line);border-radius:14px;padding:11px 14px;">
            <div style="background:${m.bg};color:${m.fg};width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0;">${m.icon}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:900;color:var(--sq-ink);font-size:14px;">${escapeHtml(x.name)}</div>
              <div style="font-size:11px;color:var(--sq-muted);font-weight:700;">${escapeHtml(x.action)} · ${escapeHtml(x.module)}</div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-weight:900;color:${m.fg};font-size:16px;">${escapeHtml(x.qty)}</div>
              <div style="font-size:10px;color:var(--sq-muted);font-weight:700;">${escapeHtml(x.when)}</div>
            </div>
          </div>`;
        }).join("") + `</div>`
      : '<p style="color:var(--sq-muted);text-align:center;font-weight:700;padding:40px 0;">ยังไม่มีรายการของคุณ</p>';
  } catch (e) {
    document.getElementById("myHistListDesk").innerHTML =
      `<p style="color:var(--sq-crit);text-align:center;font-weight:700;padding:40px 0;">เชื่อมต่อไม่สำเร็จ</p>`;
  }
}

function closeMyHistory() {
  document.getElementById("myHistModal").classList.add("hidden");
}
