// ═════════════════════════════════════════════
// line.js — 💚 ตั้งค่า LINE กลุ่ม (อยู่ในหน้าต่าง ⚙️ ตั้งค่าการแจ้งเตือน · admin เท่านั้น)
//
// ส่งเข้า LINE เฉพาะ "สรุปวัตถุดิบที่ต้องสั่งซื้อ" — LINE นับโควตาตามจำนวนสมาชิกในกลุ่ม
// (แพ็กเกจฟรีไทย 300 ข้อความ/เดือน) จึงไม่ส่งทุกการเบิก/รับเหมือน Telegram
// หลังบ้าน: cloudflare/appstock-api/src/line.js (LINESTATUS / LINESAVE / LINETEST + /line-webhook)
// token / secret ไม่ถูกส่งกลับมาที่หน้าจอ — เห็นแค่ 4 ตัวท้าย · ช่องเว้นว่าง = ใช้ค่าเดิม
// ═════════════════════════════════════════════

let _lineSt = null;

async function _lineCall(body) {
  const r = await (await fetch(GAS_URL, {
    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ module: "SYSTEM" }, body))
  })).json();
  handleTokenExpired(r);
  return r;
}

function lineWebhookUrl() { return GAS_URL.replace(/\/+$/, "") + "/line-webhook"; }

async function lineLoadStatus() {
  const info = document.getElementById("lineInfo");
  if (!info) return;
  document.getElementById("lineWebhookUrl").value = lineWebhookUrl();
  document.getElementById("lineTokenIn").value = "";
  document.getElementById("lineSecretIn").value = "";
  info.innerHTML = '<p class="text-xs text-slate-400 font-bold">⏳ กำลังตรวจสถานะ LINE…</p>';
  try {
    const r = await _lineCall({ action: "LINESTATUS" });
    if (!r || r.status !== "success") throw new Error((r && r.message) || "ไม่ได้รับคำตอบ");
    _lineSt = r;
    lineRender();
  } catch (e) {
    _lineSt = null;
    info.innerHTML = '<p class="text-xs font-black" style="color:var(--sq-crit);">ตรวจสถานะ LINE ไม่ได้: ' + escapeHtml(e.message || "") + "</p>";
  }
}

function _lineMembersOn() {
  return ((_lineSt && _lineSt.groups) || []).filter(g => g.on).reduce((a, g) => a + (Number(g.members) || 0), 0);
}

function lineRender() {
  const s = _lineSt, info = document.getElementById("lineInfo"), badge = document.getElementById("lineBadge");
  if (!s || !info) return;
  document.getElementById("lineTokenIn").placeholder = s.tokenSet ? "ตั้งไว้แล้ว " + s.tokenTail + " — เว้นว่าง = ใช้ค่าเดิม" : "วางจากแท็บ Messaging API";
  document.getElementById("lineSecretIn").placeholder = s.secretSet ? "ตั้งไว้แล้ว " + s.secretTail + " — เว้นว่าง = ใช้ค่าเดิม" : "วางจากแท็บ Basic settings (32 ตัว)";
  document.getElementById("lineModeSel").value = s.mode || "change";

  const groupsOn = (s.groups || []).filter(g => g.on);
  const ready = s.tokenSet && s.secretSet && groupsOn.length && s.mode !== "off" && !s.tokenProblem;
  badge.textContent = ready ? "✅ พร้อมส่ง" : !s.tokenSet ? "ยังไม่ได้ตั้งค่า" : s.tokenProblem ? "⚠️ token มีปัญหา" : !groupsOn.length ? "รอเชิญบอทเข้ากลุ่ม" : s.mode === "off" ? "ปิดการส่ง" : "ตั้งค่าไม่ครบ";
  badge.className = "text-xs font-black px-3 py-1 rounded-full " + (ready ? "bg-green-600 text-white" : "bg-amber-100 text-amber-800");

  const rows = [];
  if (s.botName) rows.push(`<div>🤖 บอท: <b>${escapeHtml(s.botName)}</b></div>`);
  if (s.tokenProblem) rows.push(`<div class="font-black" style="color:var(--sq-crit);">⚠️ ${escapeHtml(s.tokenProblem)}</div>`);
  if (s.quota) {
    const lim = s.quota.limited ? s.quota.limit.toLocaleString() : "ไม่จำกัด";
    const used = s.quota.used == null ? "?" : s.quota.used.toLocaleString();
    const near = s.quota.limited && s.quota.used != null && s.quota.used >= s.quota.limit * 0.8;
    rows.push(`<div${near ? ' class="font-black" style="color:var(--sq-high);"' : ""}>📊 โควตาเดือนนี้: ใช้ไป <b>${used}</b> / ${lim} ข้อความ</div>`);
  }
  if ((s.groups || []).length) {
    rows.push('<div class="font-black text-slate-500 text-xs mt-2">กลุ่มที่บอทอยู่ — ติ๊กกลุ่มที่ให้ส่ง แล้วกดบันทึก</div>');
    s.groups.forEach(g => rows.push(`<label class="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-green-200 cursor-pointer">
        <input type="checkbox" class="line-group-cb" value="${escapeAttr(g.id)}" ${g.on ? "checked" : ""} style="width:17px;height:17px;">
        <span class="flex-1 font-bold">${escapeHtml(g.name || "กลุ่ม LINE")}</span>
        <span class="text-xs text-slate-500">${g.members == null ? "" : g.members + " คน"}</span></label>`));
    const n = _lineMembersOn();
    if (n) rows.push(`<div class="text-xs text-slate-500 mt-1">ส่ง 1 ครั้ง = ใช้ <b>${n}</b> ข้อความ (นับตามสมาชิก) ·
      สัปดาห์ละครั้ง ≈ ${(n * 5).toLocaleString()}/เดือน · ทุกวัน ≈ ${(n * 30).toLocaleString()}/เดือน</div>`);
  } else if (s.tokenSet) {
    rows.push('<div class="text-xs font-bold text-slate-500">ยังไม่มีกลุ่ม — เชิญบอทเข้ากลุ่ม LINE แล้วกด ↻ ตรวจใหม่</div>');
  }
  if (s.last) {
    const t = (() => { try { return new Date(s.last.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }); } catch (e) { return ""; } })();
    rows.push(`<div class="text-xs mt-1">${s.last.sent ? "✅" : "⚠️"} ส่งล่าสุด ${escapeHtml(t)}${s.last.sent ? ` · ${s.last.groups}/${s.last.of} กลุ่ม` : ""}${s.last.reason ? " · " + escapeHtml(s.last.reason) : ""}</div>`);
  }
  info.innerHTML = rows.join("") + '<button type="button" onclick="lineLoadStatus()" class="text-xs font-black text-green-800 mt-2">↻ ตรวจใหม่</button>';
}

async function lineSaveSettings(btn) {
  const payload = { action: "LINESAVE", mode: document.getElementById("lineModeSel").value };
  const token = document.getElementById("lineTokenIn").value.trim();
  const secret = document.getElementById("lineSecretIn").value.trim();
  if (token) payload.token = token;
  if (secret) payload.secret = secret;
  if (_lineSt && (_lineSt.groups || []).length)
    payload.groupsOn = [...document.querySelectorAll(".line-group-cb:checked")].map(cb => cb.value);
  if (btn) { btn.disabled = true; btn.textContent = "กำลังตรวจ…"; }
  try {
    const r = await _lineCall(payload);
    if (!r || r.status !== "success") throw new Error((r && r.message) || "บันทึกไม่สำเร็จ");
    showToast("บันทึกการตั้งค่า LINE แล้ว ✅" + (r.botName ? " · " + r.botName : ""), "success");
    await lineLoadStatus();
  } catch (e) { showToast(e.message || "บันทึกไม่สำเร็จ", "error", 6000); }
  finally { if (btn) { btn.disabled = false; btn.textContent = "💾 บันทึก LINE"; } }
}

async function lineTestSend(btn) {
  const n = _lineMembersOn();
  if (!_lineSt || !_lineSt.tokenSet) { showToast("ใส่ Channel access token แล้วกดบันทึกก่อน", "warn"); return; }
  if (!confirm("ส่งข้อความทดสอบเข้ากลุ่ม LINE ที่ติ๊กไว้?" + (n ? "\n\nใช้โควตา " + n + " ข้อความ (นับตามจำนวนสมาชิก)" : ""))) return;
  if (btn) btn.disabled = true;
  try {
    const r = await _lineCall({ action: "LINETEST" });
    if (r && r.status === "success") showToast(`ส่งทดสอบเข้า LINE แล้ว ${r.sent}/${r.of} กลุ่ม ✅`, "success");
    else showToast("ส่งไม่สำเร็จ: " + ((r && r.message) || ""), "error", 6000);
    lineLoadStatus();
  } catch (e) { showToast("ส่งไม่สำเร็จ: " + (e.message || ""), "error"); }
  finally { if (btn) btn.disabled = false; }
}

async function lineCopyWebhook() {
  const url = lineWebhookUrl();
  try { await navigator.clipboard.writeText(url); showToast("คัดลอก Webhook URL แล้ว", "success"); }
  catch (e) { const el = document.getElementById("lineWebhookUrl"); el.select(); showToast("กด Ctrl+C เพื่อคัดลอก", "info"); }
}
