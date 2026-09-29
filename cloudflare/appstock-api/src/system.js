// งานระบบ: สถานะ · ความเคลื่อนไหวข้ามคลัง · ประวัติของฉัน · แจ้งเตือนหมดอายุ · สำรองข้อมูล · ส่งออกไปชีต · งานตามเวลา
// (วิเคราะห์การเบิก/วางแผนสั่งซื้ออยู่ที่ plan.js)
import { all, first, run, kvGet, kvPut, claim, nowIso, fmtTH, dayTH, formatCellDate, thaiMidnightMs, superAdminName, tgSettings, tgSendRaw,
         tgFlushQueue, tgPendingCount, sysLog, sysLast, TZ_MS, DAY_MS } from "./lib.js";
import { getTokenData, verifyAdminToken } from "./auth.js";
import { archiveOldStock } from "./cold.js";
import { planDigest } from "./plan.js";

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
// สำเนาในชีตใช้ "หัวคอลัมน์แบบเดิม" ทุกแท็บ — เจ้าของ/ออดิเตอร์เปิดดูได้เหมือนก่อนย้าย และถอยกลับไปหลังบ้านเดิมได้
// full = true → ข้อมูลดิบครบทุกช่องของทุกตาราง (ใช้กับไฟล์สำรองใน R2 เท่านั้น)
// full = false → สำหรับชีต: ไม่มีรหัสผ่าน ไม่มีโทเคนบอท
const b2 = (v) => Number(v) !== 0;
const nb = (v) => (v === null || v === undefined ? "" : v);
const MAT_COLS = [["SKU", "sku"], ["Name", "name"], ["Qty", "qty"], ["Unit", "unit"], ["Min", "min"], ["DailyUsage", "daily_usage"], ["ExpiryDate", "expiry_date"],
  ["LastVerified", "last_verified"], ["Discontinued", (r) => b2(r.discontinued)], ["AlertDays", "alert_days"], ["RopStart", "rop_start"], ["LeadDays", "lead_days"], ["Moq", "moq"], ["PackSize", "pack_size"]];
const HIST_COLS = [["Timestamp", "ts"], ["Name", "name"], ["Action", "action"], ["Qty", "qty"], ["User", "user"], ["DocNo", "doc_no"], ["SKU", "sku"], ["Unit", "unit"],
  ["Purpose", "purpose"], ["OpId", "op_id"], ["BalanceAfter", "balance_after"], ["WorkOrder", "work_order"], ["AckBy", "ack_by"], ["AckAt", "ack_at"]];
const STOCK_COLS = [["RowID", "row_id"], ["Barcode", "barcode"], ["ProductName", "product_name"], ["MFG", "mfg"], ["EXP", "exp"], ["Qty", "qty"], ["Note", "note"],
  ["EmployeeName", "employee_name"], ["DeviceInfo", "device_info"], ["UpdatedAt", "updated_at"]];
const SECRET_CONFIG = /token|apikey|secret/i;
const SHEETS = [
  ["SQF_Materials", "materials", "module = 'SQF'", "seq, rowid", MAT_COLS], ["MLM_Materials", "materials", "module = 'MLM'", "seq, rowid", MAT_COLS],
  ["SQF_History", "history", "module = 'SQF'", "id", HIST_COLS, true], ["MLM_History", "history", "module = 'MLM'", "id", HIST_COLS, true],
  ["ColdRoom_Products", "cr_products", "", "seq, rowid", [["Barcode", "barcode"], ["ProductName", "product_name"], ["SKU", "sku"], ["DefaultUnit", "default_unit"],
    ["StandardShelfLifeDays", "shelf_life_days"], ["WarningPercentage", "warning_pct"], ["WarningDays", "warning_days"], ["SetName", "set_name"], ["UnitsPerSet", "units_per_set"], ["CreatedAt", "created_at"]]],
  ["ColdRoom_Stock", "cr_stock", "archived = 0", "seq, rowid", STOCK_COLS], ["ColdRoom_Stock_Archive", "cr_stock", "archived = 1", "seq, rowid", STOCK_COLS],
  ["ColdRoom_LotHistory", "cr_lot_history", "", "id", [["Timestamp", "ts"], ["Barcode", "barcode"], ["ProductName", "product_name"], ["MFG", "mfg"], ["Action", "action"],
    ["QtyBefore", "qty_before"], ["QtyAfter", "qty_after"], ["Reason", "reason"], ["EmployeeName", "employee_name"], ["DeviceInfo", "device_info"], ["OpId", "op_id"]], true],
  ["ColdRoom_WorkOrders", "work_orders", "", "id", [["OrderID", "order_id"], ["Date", "date"], ["Items", "items"], ["Note", "note"], ["CreatedBy", "created_by"], ["CreatedAt", "created_at"], ["Status", "status"]]],
  ["ColdRoom_DeliveryNotes", "delivery_notes", "", "id", [["DeliveryID", "delivery_id"], ["WorkOrderID", "work_order_id"], ["Items", "items"], ["SubmittedBy", "submitted_by"],
    ["SubmittedAt", "submitted_at"], ["ApprovedBy", "approved_by"], ["ApprovedAt", "approved_at"], ["Status", "status"], ["Note", "note"]]],
  ["ColdRoom_StockIn", "stock_in", "", "id", [["StockInID", "stock_in_id"], ["SubmittedBy", "submitted_by"], ["SubmittedAt", "submitted_at"], ["Items", "items"], ["Status", "status"],
    ["Note", "note"], ["ReviewedBy", "reviewed_by"], ["ReviewedAt", "reviewed_at"]]],
  ["BOM", "bom", "", "id", [["BomID", "bom_id"], ["ProductBarcode", "product_barcode"], ["ProductName", "product_name"], ["Factory", "factory"], ["MaterialSKU", "material_sku"],
    ["MaterialName", "material_name"], ["QtyPerUnit", "qty_per_unit"], ["Unit", "unit"]]],
  ["AppUsers", "users", "", "rowid", [["Username", "username"], ["Active", (r) => b2(r.active)], ["Role", "role"], ["CreatedAt", "created_at"], ["HasPassword", (r) => (r.password ? "มี" : "")]]],
  ["PendingUsers", "pending_users", "", "id", [["Username", "username"], ["RequestedAt", "requested_at"], ["Status", "status"], ["ReviewedAt", "reviewed_at"], ["ReviewedBy", "reviewed_by"], ["RequestedRole", "requested_role"]]],
  ["Config", "config", "", "rowid", [["Key", "key"], ["Value", (r) => (SECRET_CONFIG.test(String(r.key)) ? (r.value ? "(ซ่อน — ดู/แก้ในแอป)" : "") : r.value)]]],
  ["System_Log", "system_log", "", "id", [["Timestamp", "ts"], ["Type", "type"], ["Detail", "detail"], ["User", "user"], ["Result", "result"]], true],
];
export async function exportSheets(c, full, maxHistory) {
  const out = {};
  for (const [sheet, table, where, order, cols, isLog] of SHEETS) {
    let rows = await all(c, "SELECT * FROM " + table + (where ? " WHERE " + where : "") + " ORDER BY " + order);
    if (full) {
      const head = rows.length ? Object.keys(rows[0]) : [];
      out[sheet] = [head].concat(rows.map((r) => head.map((k) => nb(r[k]))));
      continue;
    }
    if (isLog && maxHistory && rows.length > maxHistory) rows = rows.slice(-maxHistory);
    out[sheet] = [cols.map((x) => x[0])].concat(rows.map((r) => cols.map((x) => nb(typeof x[1] === "function" ? x[1](r) : r[x[1]]))));
  }
  return { ok: true, status: "success", generatedAt: nowIso(), generatedAtTH: fmtTH(Date.now(), "dd/MM/yyyy HH:mm"), sheets: out };
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

// ───────────── งานตามเวลา (Cron ทุก 5 นาที → แจกงานตามช่วงเวลาไทย) ─────────────
export async function ticks(c, via) {
  const th = new Date(Date.now() + TZ_MS);
  const day = th.toISOString().slice(0, 10), hh = th.getUTCHours(), dow = th.getUTCDay();
  await kvPut(c, "cron_last", fmtTH(Date.now(), "dd/MM/yyyy HH:mm") + " " + via, 7 * 86400);
  try { await tgFlushQueue(c); } catch (e) {}
  // 08:00–08:59: แจ้งเตือนวันหมดอายุ + สำรองข้อมูลประจำวัน + สรุปวัตถุดิบที่ต้องสั่ง (ครั้งเดียวต่อวัน)
  if (hh === 8 && await claim(c, "tick_morning_" + day, 2 * 86400)) {
    try { await checkExpiryAlerts(c); } catch (e) { await sysLog(c, "cron-error", "checkExpiryAlerts: " + e, "-", "error"); }
    try { await backupAll(c, "daily", "ระบบ"); } catch (e) {}
    try { await planDigest(c); } catch (e) { await sysLog(c, "cron-error", "planDigest: " + e, "-", "error"); }
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
