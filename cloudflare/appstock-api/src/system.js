// งานระบบ: สถานะ · ความเคลื่อนไหวข้ามคลัง · ประวัติของฉัน · แจ้งเตือนหมดอายุ · สำรองข้อมูล · ส่งออกไปชีต · งานตามเวลา
import { all, first, run, kvGet, kvPut, claim, nowIso, fmtTH, dayTH, formatCellDate, thaiMidnightMs, superAdminName, tgSettings, tgSendRaw,
         tgFlushQueue, tgPendingCount, sysLog, sysLast, TZ_MS, DAY_MS } from "./lib.js";
import { getTokenData, verifyAdminToken } from "./auth.js";
import { archiveOldStock } from "./cold.js";

// ───────────── สถานะระบบ (manager ขึ้นไป) ─────────────
export async function sysStatus(c) {
  const t0 = Date.now();
  const counts = {};
  const tables = { SQF_History: "SELECT COUNT(*) AS n FROM history WHERE module = 'SQF'", MLM_History: "SELECT COUNT(*) AS n FROM history WHERE module = 'MLM'",
                   ColdRoom_Stock: "SELECT COUNT(*) AS n FROM cr_stock WHERE archived = 0", ColdRoom_LotHistory: "SELECT COUNT(*) AS n FROM cr_lot_history",
                   AppUsers: "SELECT COUNT(*) AS n FROM users" };
  for (const k of Object.keys(tables)) { try { counts[k] = (await first(c, tables[k])).n; } catch (e) { counts[k] = null; } }
  let tg = null;
  try { const v = await kvGet(c, "tg_last"); if (v) tg = JSON.parse(v); } catch (e) {}
  return {
    ok: true, status: "success",
    backend: "cloudflare",
    // หน้าสถานะเดิมอ่านช่องเหล่านี้ — บน Cloudflare ฐานข้อมูลเร็วพอ ไม่ต้องมี cache ฝั่งเซิร์ฟเวอร์แล้ว
    rawCache: { SQF: { hot: true, meta: null }, MLM: { hot: true, meta: null } },
    crOverviewCached: true,
    tgPending: await tgPendingCount(c),
    serverTime: nowIso(),
    gasVersion: String(c.env.APP_VERSION || "cloudflare"),
    timeZone: "Asia/Bangkok",
    superAdminConfigured: !!(await superAdminName(c)),
    apiKeyEnabled: false,
    lastBackup: await sysLast(c, "backup"),
    lastTelegram: tg,
    lastTelegramError: await sysLast(c, "telegram-error"),
    lastCron: await kvGet(c, "cron_last"),
    rowCounts: counts,
    readMs: Date.now() - t0,
  };
}

// ───────────── ความเคลื่อนไหวข้ามคลัง (admin) ─────────────
export async function getActivityLog(c, payload) {
  if (!(await verifyAdminToken(c, payload.adminToken))) return { ok: false, message: "ไม่มีสิทธิ์ กรุณาเข้าสู่ระบบใหม่" };
  let list = [];
  const stamp = (v) => { const ms = v ? new Date(v).getTime() : NaN; return { ts: isNaN(ms) ? 0 : ms, txt: isNaN(ms) ? String(v || "") : fmtTH(ms, "dd/MM/yy HH:mm") }; };
  for (const r of await all(c, "SELECT * FROM cr_stock WHERE archived = 0 ORDER BY updated_at DESC LIMIT 150")) {
    const s = stamp(r.updated_at);
    list.push({ module: "COLDROOM", name: String(r.product_name || ""), action: "MFG: " + formatCellDate(r.mfg), qty: r.qty !== "" && r.qty !== null ? String(r.qty) : "",
                user: String(r.employee_name || ""), device: String(r.device_info || ""), note: String(r.note || ""), timestamp: s.txt, _ts: s.ts });
  }
  for (const mod of ["SQF", "MLM"]) {
    for (const r of await all(c, "SELECT ts, name, action, qty, user FROM history WHERE module = ? ORDER BY id DESC LIMIT 150", mod)) {
      const s = stamp(r.ts);
      list.push({ module: mod, name: String(r.name || ""), action: String(r.action || ""), qty: String(r.qty == null ? "" : r.qty), user: String(r.user || ""),
                  device: "", note: "", timestamp: s.txt, _ts: s.ts });
    }
  }
  list.sort((a, b) => b._ts - a._ts);
  list = list.slice(0, 200);
  list.forEach((x) => { delete x._ts; });
  return { ok: true, list };
}

// ───────────── ประวัติของฉัน — พนักงานดูรายการที่ "ตัวเองทำ" เท่านั้น ─────────────
//   ตั้งใจไม่ส่ง: ยอดคงเหลือ, ขั้นต่ำ, อัตราใช้/วัน, รายการของคนอื่น
export async function getMyHistory(c, payload, data) {
  // มีบัตรผ่าน → ใช้ชื่อจากบัตร (ดูของคนอื่นด้วยการส่งชื่อมาเองไม่ได้)
  const sess = await getTokenData(c, (data && data.sessionToken) || payload.adminToken || "");
  const username = String((sess && sess.n) || payload.username || "").trim();
  if (!username) return { ok: false, message: "ไม่ระบุชื่อผู้ใช้" };
  const uLower = username.toLowerCase();
  const limit = Math.min(Number(payload.limit) || 60, 100);
  let rows = [];
  for (const mod of ["SQF", "MLM"]) {
    for (const d of await all(c, "SELECT ts, name, action, qty, user FROM history WHERE module = ? ORDER BY id DESC LIMIT 400", mod)) {
      // user เก็บเป็น "ชื่อ (📱 อุปกรณ์)" → ตัดส่วนอุปกรณ์ออกก่อนเทียบ
      const who = String(d.user || "").split(" (")[0].trim().toLowerCase();
      if (who !== uLower) continue;
      const ms = d.ts ? new Date(d.ts).getTime() : NaN;
      rows.push({ when: isNaN(ms) ? "" : fmtTH(ms, "dd/MM/yy HH:mm"), _ts: isNaN(ms) ? 0 : ms, module: mod, name: String(d.name || ""),
                  action: String(d.action || ""), qty: d.qty !== "" && d.qty !== null ? String(d.qty) : "" });
    }
  }
  rows.sort((a, b) => b._ts - a._ts);
  rows = rows.slice(0, limit);
  rows.forEach((r) => { delete r._ts; });
  const count = {};
  rows.forEach((r) => { const k = r.action || "อื่นๆ"; count[k] = (count[k] || 0) + 1; });
  return { ok: true, username, rows, summary: count };
}

// ───────────── ⏰ แจ้งเตือนวันหมดอายุวัตถุดิบ (งานตามเวลา วันละครั้งช่วงเช้า) ─────────────
export async function checkExpiryAlerts(c) {
  const s = await tgSettings(c);
  if (!String(s.telegramBotToken || "").trim() || !String(s.telegramChatIds || "").trim()) return { ok: true, skipped: "no telegram" };
  const now = Date.now(), todayKey = fmtTH(now, "yyyyMMdd");
  const expired = [], warning = [];
  for (const mod of ["SQF", "MLM"]) {
    for (const m of await all(c, "SELECT sku, name, expiry_date, alert_days FROM materials WHERE module = ? AND discontinued = 0 ORDER BY seq, rowid", mod)) {
      const expRaw = String(m.expiry_date || "").trim();
      if (!expRaw) continue;
      const name_ = String(m.name || "").trim(), sku_ = String(m.sku || "").trim();
      const alertDays_ = Number(m.alert_days) || 7;
      // รองรับ dd/mm/yyyy และ yyyy-mm-dd → เที่ยงคืนเวลาไทยของวันนั้น
      let y, mo, d;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(expRaw)) { const p = expRaw.split("/"); d = +p[0]; mo = +p[1]; y = +p[2]; }
      else if (/^\d{4}-\d{2}-\d{2}/.test(expRaw)) { const p2 = expRaw.slice(0, 10).split("-"); y = +p2[0]; mo = +p2[1]; d = +p2[2]; }
      else continue;
      if (y > 2400) y -= 543;                       // ปี พ.ศ. ที่พิมพ์มาตรงๆ
      const expMs = thaiMidnightMs(y, mo, d);
      if (isNaN(expMs)) continue;
      const daysLeft = Math.round((expMs - now) / DAY_MS);
      if (daysLeft > alertDays_ || daysLeft < -30) continue;
      // กันแจ้งซ้ำรายวัน
      const safeId = (sku_ || name_).replace(/[^A-Za-z0-9฀-๿]/g, "_").slice(0, 40);
      if (!(await claim(c, "expd_" + todayKey + "_" + mod + "_" + safeId, 2 * 86400))) continue;
      const expThai = String(d).padStart(2, "0") + "/" + String(mo).padStart(2, "0") + "/" + (y + 543);
      const entry = (mod === "SQF" ? "🏭SQF" : "🏭MLM") + " " + name_ + (sku_ ? " (" + sku_ + ")" : "") + "  •  หมดอายุ " + expThai;
      if (daysLeft < 0) expired.push("❌ " + entry + "  (เกินมาแล้ว " + Math.abs(daysLeft) + " วัน)");
      else warning.push("⚠️ " + entry + "  (เหลือ " + daysLeft + " วัน)");
    }
  }
  if (!expired.length && !warning.length) return { ok: true, sent: 0 };
  const total = expired.length + warning.length;
  let summary = "พบ " + total + " รายการ";
  if (expired.length) summary += "  •  ❌ หมดอายุแล้ว " + expired.length + " รายการ";
  if (warning.length) summary += "  •  ⚠️ ใกล้หมด " + warning.length + " รายการ";
  let msg = "⏰ แจ้งเตือนวันหมดอายุวัตถุดิบ\n" + fmtTH(now, "dd/MM/yyyy HH:mm") + "\n" + summary + "\n";
  if (expired.length) msg += "\n" + expired.join("\n");
  if (warning.length) msg += "\n" + warning.join("\n");
  msg += "\n\nกรุณาตรวจสอบและจัดการโดยด่วน";
  const r = await tgSendRaw(c, msg, true);
  return { ok: true, sent: total, telegram: r };
}

// ───────────── ส่งออก: สำเนาไปชีต (อ่านอย่างเดียว) และสำรองข้อมูลเต็ม ─────────────
// full = true → ข้อมูลครบทุกช่อง (ใช้กับไฟล์สำรองใน R2 เท่านั้น)
// full = false → สำหรับสำเนาในชีต: ไม่มีรหัสผ่าน ไม่มีโทเคนบอท
const SHEETS = [
  ["SQF_Materials", "materials", "module = 'SQF'"], ["MLM_Materials", "materials", "module = 'MLM'"],
  ["SQF_History", "history", "module = 'SQF'"], ["MLM_History", "history", "module = 'MLM'"],
  ["ColdRoom_Products", "cr_products", ""], ["ColdRoom_Stock", "cr_stock", "archived = 0"], ["ColdRoom_Stock_Archive", "cr_stock", "archived = 1"],
  ["ColdRoom_LotHistory", "cr_lot_history", ""], ["ColdRoom_WorkOrders", "work_orders", ""], ["ColdRoom_DeliveryNotes", "delivery_notes", ""],
  ["ColdRoom_StockIn", "stock_in", ""], ["BOM", "bom", ""], ["AppUsers", "users", ""], ["PendingUsers", "pending_users", ""],
  ["Config", "config", ""], ["System_Log", "system_log", ""],
];
const SECRET_CONFIG = /token|apikey|secret/i;
export async function exportSheets(c, full, maxHistory) {
  const out = {};
  for (const [sheet, table, where] of SHEETS) {
    const order = table === "materials" || table === "cr_products" || table === "cr_stock" ? "seq, rowid" : "rowid";
    let rows = await all(c, "SELECT * FROM " + table + (where ? " WHERE " + where : "") + " ORDER BY " + order);
    if (!full) {
      if (table === "users") rows = rows.map((r) => ({ username: r.username, active: r.active, role: r.role, has_password: r.password ? "yes" : "", created_at: r.created_at }));
      if (table === "config") rows = rows.map((r) => ({ key: r.key, value: SECRET_CONFIG.test(String(r.key)) ? (r.value ? "(ซ่อน)" : "") : r.value }));
      if (maxHistory && (table === "history" || table === "system_log" || table === "cr_lot_history") && rows.length > maxHistory) rows = rows.slice(-maxHistory);
    }
    const head = rows.length ? Object.keys(rows[0]) : [];
    out[sheet] = [head].concat(rows.map((r) => head.map((k) => (r[k] === null || r[k] === undefined ? "" : r[k]))));
  }
  return { ok: true, status: "success", generatedAt: nowIso(), sheets: out };
}

export async function backupAll(c, label, user) {
  const name = "Backup_" + label + "_" + dayTH() + "_" + fmtTH(Date.now(), "HHmm");
  try {
    if (!c.env.BACKUPS) throw new Error("ยังไม่ได้ผูกที่เก็บไฟล์สำรอง (R2)");
    const dump = await exportSheets(c, true);
    const body = JSON.stringify(dump);
    const key = "backups/" + name + ".json";
    await c.env.BACKUPS.put(key, body, { httpMetadata: { contentType: "application/json" } });
    await sysLog(c, "backup", name + " | " + key + " | " + Math.round(body.length / 1024) + " KB", user, "success");
    return { status: "success", ok: true, message: "สำรองเรียบร้อย: " + name, fileId: key, url: "" };
  } catch (e) {
    await sysLog(c, "backup", name, user, "error: " + e);
    return { status: "error", ok: false, message: "สำรองไม่สำเร็จ: " + e };
  }
}
export const rmBackup = (c, data, module) => backupAll(c, module, data.user);

// ───────────── 📊 วิเคราะห์การเบิก — วัตถุดิบตัวไหนจะหมดก่อนของมาถึง ─────────────
// คืนสถิติดิบต่อ SKU (เบิกสุทธิ = เบิก − คืน) หน้าจอเอาไปคิด "พอใช้อีกกี่วัน / ต้องสั่งภายในวันไหน"
// ร่วมกับวันรอของรายตัว เพราะผู้ใช้ปรับค่าได้สดๆ โดยไม่ต้องยิงถามใหม่
export async function usagePlan(c, data, module) {
  const now = Date.now(), W = [7, 30, 90];
  const mats = await all(c, "SELECT sku, name, rop_start FROM materials WHERE module = ? AND discontinued = 0 ORDER BY seq, rowid", module);
  const nameToSku = {}, ropStart = {};
  mats.forEach((m) => {
    nameToSku[String(m.name).trim()] = String(m.sku);
    const mm = String(m.rop_start || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (mm) ropStart[m.sku] = thaiMidnightMs(+mm[1], +mm[2], +mm[3]);
  });
  const rows = await all(c, "SELECT ts, name, action, qty, sku, purpose FROM history WHERE module = ? ORDER BY id", module);
  const st = {};
  const get = (sku) => st[sku] || (st[sku] = { net: { 7: 0, 30: 0, 90: 0 }, tx30: 0, days30: {}, first: 0, lastOut: 0, purposes: {}, prev30: 0 });
  for (const r of rows) {
    const ts = r.ts ? new Date(r.ts).getTime() : NaN;
    if (isNaN(ts)) continue;
    let sku = String(r.sku || "").trim();
    if (!sku) sku = nameToSku[String(r.name || "").trim()] || "";
    if (!sku) continue;
    if (ropStart[sku] && ts < ropStart[sku]) continue;
    const s = get(sku);
    if (!s.first || ts < s.first) s.first = ts;
    const q = Number(r.qty);
    if (!isFinite(q) || q <= 0) continue;
    const delta = r.action === "เบิกออก" ? q : r.action === "คืนวัตถุดิบ" ? -q : 0;
    if (!delta) continue;
    const age = now - ts;
    W.forEach((w) => { if (age <= w * DAY_MS) s.net[w] += delta; });
    if (age > 30 * DAY_MS && age <= 60 * DAY_MS) s.prev30 += delta;
    if (r.action === "เบิกออก") {
      if (ts > s.lastOut) s.lastOut = ts;
      if (age <= 30 * DAY_MS) {
        s.tx30++;
        const day = dayTH(ts);
        s.days30[day] = (s.days30[day] || 0) + q;
        const p = String(r.purpose || "").trim() || "(ไม่ระบุ)";
        s.purposes[p] = (s.purposes[p] || 0) + q;
      }
    }
  }
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const items = {};
  mats.forEach((m) => {
    const s = st[m.sku];
    if (!s) return;
    const base = ropStart[m.sku] || s.first || now;
    // ของที่เพิ่งเข้าระบบ 10 วัน ห้ามหารด้วย 30 — ค่าเฉลี่ยจะเจือจางเกินจริง
    const obs = (w) => Math.max(1, Math.min(w, Math.ceil((now - base) / DAY_MS)));
    const dayVals = Object.values(s.days30);
    items[m.sku] = {
      avg7: r3(Math.max(0, s.net[7]) / obs(7)), avg30: r3(Math.max(0, s.net[30]) / obs(30)), avg90: r3(Math.max(0, s.net[90]) / obs(90)),
      out30: r3(Math.max(0, s.net[30])), prev30: r3(Math.max(0, s.prev30)),
      peakDay30: dayVals.length ? r3(Math.max.apply(null, dayVals)) : 0,
      activeDays30: dayVals.length, tx30: s.tx30, obsDays: Math.ceil((now - base) / DAY_MS),
      lastOut: s.lastOut ? dayTH(s.lastOut) : "",
      topPurposes: Object.keys(s.purposes).map((p) => ({ purpose: p, qty: r3(s.purposes[p]) })).sort((a, b) => b.qty - a.qty).slice(0, 3),
    };
  });
  return { status: "success", generatedAt: nowIso(), today: dayTH(now), items };
}

// ───────────── งานตามเวลา (Cron ทุก 5 นาที → แจกงานตามช่วงเวลาไทย) ─────────────
export async function ticks(c, via) {
  const th = new Date(Date.now() + TZ_MS);
  const day = th.toISOString().slice(0, 10), hh = th.getUTCHours(), dow = th.getUTCDay();
  await kvPut(c, "cron_last", fmtTH(Date.now(), "dd/MM/yyyy HH:mm") + " " + via, 7 * 86400);
  try { await tgFlushQueue(c); } catch (e) {}
  // 08:00–08:59: แจ้งเตือนวันหมดอายุ + สำรองข้อมูลประจำวัน (ครั้งเดียวต่อวัน)
  if (hh === 8 && await claim(c, "tick_morning_" + day, 2 * 86400)) {
    try { await checkExpiryAlerts(c); } catch (e) { await sysLog(c, "cron-error", "checkExpiryAlerts: " + e, "-", "error"); }
    try { await backupAll(c, "daily", "ระบบ"); } catch (e) {}
  }
  // อาทิตย์ 02:00–02:59: เก็บถาวรล็อตที่หมดแล้ว
  if (dow === 0 && hh === 2 && await claim(c, "tick_archive_" + day, 2 * 86400)) {
    try { await archiveOldStock(c, {}); } catch (e) { await sysLog(c, "cron-error", "archiveOldStock: " + e, "-", "error"); }
  }
  // ชั่วโมงละครั้ง: ล้างของหมดอายุ
  if (await claim(c, "tick_purge_" + day + "_" + hh, 7200)) {
    try {
      await run(c, "DELETE FROM kv WHERE exp > 0 AND exp < ?", Date.now());
      await run(c, "DELETE FROM sessions WHERE exp < ?", Date.now());
    } catch (e) {}
  }
}
