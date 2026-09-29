// ตัวช่วยพื้นฐาน: เวลาไทย · ตรวจค่า · ตั้งค่ากลาง · kv · พรางชื่อ · Telegram · บันทึกงานระบบ
// ทุกฟังก์ชันรับ c = บริบทของคำขอ { env, ctx, t0, cfg, deviceId, deviceName, user }

export const TZ_MS = 7 * 3600 * 1000;          // Asia/Bangkok ไม่มี DST
export const DAY_MS = 86400000;

// ───────────── เวลา (แทน Utilities.formatDate / Session.getScriptTimeZone ของ GAS) ─────────────
const p2 = (n) => String(n).padStart(2, "0");
export function nowIso() { return new Date().toISOString(); }
function toMs(d) { return d instanceof Date ? d.getTime() : (typeof d === "number" ? d : new Date(d).getTime()); }
/** จัดรูปแบบเวลาตามเขตเวลาไทย — รองรับ yyyy MM dd HH mm ss yy */
export function fmtTH(d, pattern) {
  const ms = toMs(d);
  if (isNaN(ms)) return "";
  const t = new Date(ms + TZ_MS);
  const y = t.getUTCFullYear();
  return pattern
    .replace("yyyy", String(y))
    .replace("yy", p2(y % 100))
    .replace("MM", p2(t.getUTCMonth() + 1))
    .replace("dd", p2(t.getUTCDate()))
    .replace("HH", p2(t.getUTCHours()))
    .replace("mm", p2(t.getUTCMinutes()))
    .replace("ss", p2(t.getUTCSeconds()));
}
export const dayTH = (d) => fmtTH(d == null ? Date.now() : d, "yyyy-MM-dd");
/** เที่ยงคืนเวลาไทยของวันที่ y-m-d เป็น ms (เทียบเท่า new Date(y, m-1, d) ในเขตเวลาไทย) */
export function thaiMidnightMs(y, m, d) { return Date.UTC(y, m - 1, d) - TZ_MS; }
export function todayThaiMidnightMs() {
  const t = new Date(Date.now() + TZ_MS);
  return thaiMidnightMs(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
/** "yyyy-MM-dd" → ms เที่ยงคืนไทย (ห้าม new Date("yyyy-MM-dd") ตรงๆ — ได้เที่ยงคืน UTC วันจะเพี้ยน) */
export function parseLocalDateMs(isoStr) {
  if (!isoStr) return NaN;
  const m = String(isoStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return thaiMidnightMs(+m[1], +m[2], +m[3]);
  return new Date(isoStr).getTime();
}
/** ค่าวันที่ในฐานข้อมูล → "yyyy-MM-dd" ตามเวลาไทย */
export function formatCellDate(value) {
  if (!value) return "";
  if (value instanceof Date) return fmtTH(value, "yyyy-MM-dd");
  const s = String(value).trim();
  if (s.length > 10 && !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const ms = new Date(s).getTime();
    if (!isNaN(ms)) return fmtTH(ms, "yyyy-MM-dd");
  }
  return s;
}
export function isRealDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
export function ddmmyyToIso(str) {
  if (!str || typeof str !== "string") return String(str || "");
  if (str.includes("-")) {
    const m1 = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m1) return "";
    return isRealDate(+m1[1], +m1[2], +m1[3]) ? m1[0] : "";
  }
  if (!/^\d{6}$/.test(str)) return "";
  const dd = parseInt(str.substring(0, 2), 10), mm = parseInt(str.substring(2, 4), 10), yy = parseInt(str.substring(4, 6), 10);
  if (!isRealDate(2000 + yy, mm, dd)) return "";
  return `${2000 + yy}-${p2(mm)}-${p2(dd)}`;
}
/**
 * เวลาที่เกิดรายการจริง — ตอนออฟไลน์ใช้เวลาที่พนักงานกดยืนยันหน้างาน ไม่ใช่เวลาที่ส่งขึ้นระบบ
 * นาฬิกาเครื่องเพี้ยนเกินขอบเขต (อนาคต > 5 นาที หรือเก่า > 14 วัน) ใช้เวลาเซิร์ฟเวอร์แทน
 */
export function eventTime(clientAt) {
  const now = Date.now();
  if (!clientAt) return new Date(now).toISOString();
  const d = new Date(clientAt).getTime();
  if (isNaN(d)) return new Date(now).toISOString();
  const diff = now - d;
  if (diff < -5 * 60000) return new Date(now).toISOString();
  if (diff > 14 * DAY_MS) return new Date(now).toISOString();
  return new Date(d).toISOString();
}

// ───────────── ตรวจค่า ─────────────
export function validateQty(v, allowDecimal) {
  const n = Number(v);
  if (isNaN(n) || !isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 9999999) return 9999999;
  return allowDecimal ? Math.round(n * 1000) / 1000 : Math.floor(n);
}
/** แบบเข้มงวด: ค่าผิด/ติดลบ/เกินเพดาน → NaN ให้ผู้เรียกปฏิเสธพร้อมเหตุผล (ไม่แก้เป็น 0 เงียบๆ) */
export function qtyStrict(v, allowDecimal) {
  if (v === "" || v === null || v === undefined) return NaN;
  const n = Number(String(v).replace(/,/g, ""));
  if (isNaN(n) || !isFinite(n) || n < 0 || n > 9999999) return NaN;
  return allowDecimal ? Math.round(n * 1000) / 1000 : Math.floor(n);
}
export function sanitizeDeviceName(name) {
  return String(name || "ไม่ระบุ").slice(0, 50).replace(/[*_[\]()~`\\]/g, "");
}
export const uuid = () => crypto.randomUUID();
export async function hashPwd(pwd) {
  if (!pwd) return "";
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(pwd)));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const isHashed = (s) => /^[0-9a-f]{64}$/.test(s);
/** ค่าตัวเลขที่อาจว่าง: NULL ในฐานข้อมูล → "" ในคำตอบ (เหมือนช่องว่างในชีตเดิม) */
export const numOrBlank = (v) => (v === null || v === undefined ? "" : v);
export const userWithDevice = (c, user) => (c.deviceName ? (user || "-") + " (📱 " + c.deviceName + ")" : (user || "-"));
export const deviceTag = (c) => (c.deviceName ? "\n🖥️ " + c.deviceName : "");

// ───────────── ฐานข้อมูล ─────────────
export const db = (c) => c.env.DB;
export async function all(c, sql, ...args) {
  const r = await c.env.DB.prepare(sql).bind(...args).all();
  return r.results || [];
}
export async function first(c, sql, ...args) { return await c.env.DB.prepare(sql).bind(...args).first(); }
export async function run(c, sql, ...args) { return await c.env.DB.prepare(sql).bind(...args).run(); }
export const stmt = (c, sql, ...args) => c.env.DB.prepare(sql).bind(...args);
export const changed = (r) => (r && r.meta && r.meta.changes) || 0;

// ───────────── kv (ค่าชั่วคราวมีวันหมดอายุ) ─────────────
export async function kvGet(c, k) {
  const r = await first(c, "SELECT v, exp FROM kv WHERE k = ?", k);
  if (!r) return null;
  if (r.exp && r.exp < Date.now()) return null;
  return r.v;
}
export async function kvPut(c, k, v, ttlSec) {
  await run(c, "INSERT INTO kv (k, v, exp) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, exp = excluded.exp",
    k, String(v == null ? "" : v), ttlSec ? Date.now() + ttlSec * 1000 : 0);
}
export async function kvDel(c, k) { await run(c, "DELETE FROM kv WHERE k = ?", k); }
/** จองงาน: ใครจองได้ก่อนทำ (อะตอมมิก) — กันงานตามเวลาทำซ้ำ */
export async function claim(c, k, ttlSec) {
  await run(c, "DELETE FROM kv WHERE k = ? AND exp > 0 AND exp < ?", k, Date.now());
  const r = await run(c, "INSERT OR IGNORE INTO kv (k, v, exp) VALUES (?, ?, ?)", k, nowIso(), Date.now() + ttlSec * 1000);
  return changed(r) > 0;
}

// ───────────── ตั้งค่ากลาง (ตาราง config) ─────────────
export async function getCfg(c) {
  if (c.cfg) return c.cfg;
  const rows = await all(c, "SELECT key, value FROM config");
  const o = {};
  rows.forEach((r) => { o[String(r.key)] = r.value == null ? "" : String(r.value); });
  c.cfg = o;
  return o;
}
export async function cfgGet(c, key) { return String((await getCfg(c))[key] || "").trim(); }
export async function cfgSet(c, key, value) {
  const v = value == null ? "" : String(value);
  await run(c, "INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, v);
  if (c.cfg) c.cfg[key] = v;
}

// ───────────── เจ้าของระบบ + พรางชื่อ ─────────────
// ชื่อบัญชีเจ้าของระบบอยู่ในตาราง config (key superAdmin) — ไม่เก็บในโค้ด เพราะ repo เป็นสาธารณะ
export async function superAdminName(c) { return (await cfgGet(c, "superAdmin")).toLowerCase(); }
export async function isSuperAdmin(c, username) {
  const sa = await superAdminName(c);
  if (!sa) return false;      // ไม่มีค่า = ไม่มี super admin (ห้ามให้ "" เทียบเจอ "")
  return String(username || "").trim().toLowerCase() === sa;
}
export async function superAdminAlias(c) {
  const alias = (await cfgGet(c, "aliasSuperAdmin")) || "ผู้ดูแลระบบ";
  return alias.replace(/[\\"]/g, "").slice(0, 40) || "ผู้ดูแลระบบ";
}
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** พรางชื่อ login ของเจ้าของระบบในทุกอย่างที่ออกจากเซิร์ฟเวอร์ (คำตอบ JSON + Telegram) */
export async function maskNames(c, s) {
  const sa = await superAdminName(c);
  if (!sa || s.toLowerCase().indexOf(sa) < 0) return s;
  return s.replace(new RegExp(reEsc(sa), "gi"), await superAdminAlias(c));
}

// ───────────── บันทึกงานระบบ ─────────────
export async function sysLog(c, type, detail, user, result) {
  try { await run(c, "INSERT INTO system_log (ts, type, detail, user, result) VALUES (?, ?, ?, ?, ?)", nowIso(), type, String(detail || ""), String(user || "-"), String(result || "")); } catch (e) {}
}
export async function sysLogOnce(c, type, detail, ttlSec) {
  if (!(await claim(c, "once_" + type, ttlSec || 3600))) return;
  await sysLog(c, type, detail, "-", "warn");
}
export async function sysLast(c, type) {
  try {
    const r = await first(c, "SELECT ts, detail, user, result FROM system_log WHERE type = ? ORDER BY id DESC LIMIT 1", type);
    return r ? { at: r.ts, detail: r.detail, user: r.user, result: r.result } : null;
  } catch (e) { return null; }
}

// ───────────── Telegram ─────────────
export const FACTORY_NAME = { COLDROOM: "❄️ คลังสินค้า SQF", SQF: "🏭 วัตถุดิบ SQF", MLM: "🏭 วัตถุดิบ MLM" };
export async function tgSettings(c) {
  const m = await getCfg(c);
  return {
    telegramBotName: m.telegramBotName || "",
    telegramBotToken: m.telegramBotToken || "",
    telegramChatIds: m.telegramChatIds || "",
    enableTelegramStockUpdate: m.enableTelegramStockUpdate || "true",
  };
}
const TG_CFG_PROBLEMS = ["disabled", "no token", "no chatId"];
export const tgCfgProblem = (r) => !!(r && TG_CFG_PROBLEMS.indexOf(r.reason) >= 0);
/** ส่งจริงไปทุก chat — คืน { sent, reason } · force = ส่งแม้ปิดแจ้งเตือนสต๊อก (ใช้กับแจ้งเตือนหมดอายุ) */
export async function tgSendRaw(c, message, force) {
  try {
    message = await maskNames(c, String(message));
    const s = await tgSettings(c);
    const enabled = String(s.enableTelegramStockUpdate).toLowerCase();
    if (!force && (enabled === "false" || enabled === "")) return { sent: false, reason: "disabled" };
    const token = String(s.telegramBotToken || "").trim();
    const chatIds = String(s.telegramChatIds || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (!token) return { sent: false, reason: "no token" };
    if (!chatIds.length) return { sent: false, reason: "no chatId" };
    const errors = [];
    await Promise.all(chatIds.map(async (chatId) => {
      try {
        const resp = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: message }),
        });
        const result = await resp.json();
        if (!result.ok) errors.push(chatId + ": " + result.description);
      } catch (ex) { errors.push(chatId + ": " + String(ex)); }
    }));
    if (errors.length) return { sent: false, reason: errors.join(", ") };
    return { sent: true };
  } catch (e) { return { sent: false, reason: String(e) }; }
}
async function tgAfter(c, message, r) {
  try { await kvPut(c, "tg_last", JSON.stringify({ at: nowIso(), sent: !!(r && r.sent), reason: (r && r.reason) || "" }), 30 * 86400); } catch (e) {}
  if (r && !r.sent && !tgCfgProblem(r)) {
    // ส่งไม่ผ่านเพราะปลายทาง/เครือข่าย → เก็บไว้ให้งานตามเวลาส่งซ้ำ
    try { await run(c, "INSERT INTO tg_queue (ts, message, status, tries, error) VALUES (?, ?, 'pending', 1, ?)", nowIso(), await maskNames(c, String(message)), String(r.reason || "")); } catch (e) {}
    await sysLog(c, "telegram-error", r.reason, c.user || "-", "failed");
  }
}
/**
 * แจ้ง Telegram แบบ "ไม่อยู่ในเวลารอของผู้ใช้" — ตอบผู้ใช้ก่อน แล้วค่อยส่ง (ctx.waitUntil)
 * คืนรูปแบบเดียวกับหลังบ้านเดิม { sent, queued } เพื่อให้หน้าจอไม่ต้องแก้
 */
export function tgNotify(c, message) {
  const job = (async () => { const r = await tgSendRaw(c, message); await tgAfter(c, message, r); })();
  if (c.ctx && c.ctx.waitUntil) c.ctx.waitUntil(job.catch(() => {}));
  return { sent: true, queued: true };
}
export function sendAlert(c, message, module) {
  return tgNotify(c, "[" + (FACTORY_NAME[module] || module) + "]\n" + message);
}
/** ส่งข้อความที่เคยส่งไม่ผ่าน (เรียกจากงานตามเวลา และ action TGFLUSH ที่หน้าจอยิงหลังบันทึก) */
export async function tgFlushQueue(c) {
  if (!(await claim(c, "tg_flushing", 60))) return { ok: true, skipped: true };
  let sent = 0, failed = 0;
  try {
    const rows = await all(c, "SELECT id, message, tries FROM tg_queue WHERE status = 'pending' ORDER BY id LIMIT 40");
    for (const row of rows) {
      const r = await tgSendRaw(c, row.message);
      const tries = Number(row.tries || 0) + 1;
      const ok = !!(r && r.sent);
      const status = ok ? "sent" : ((tries >= 5 || tgCfgProblem(r)) ? "failed" : "pending");
      await run(c, "UPDATE tg_queue SET status = ?, tries = ?, sent_at = ?, error = ? WHERE id = ?",
        status, tries, ok ? nowIso() : "", ok ? "" : String((r && r.reason) || ""), row.id);
      if (ok) sent++; else failed++;
      try { await kvPut(c, "tg_last", JSON.stringify({ at: nowIso(), sent: ok, reason: (r && r.reason) || "" }), 30 * 86400); } catch (e) {}
    }
    await run(c, "DELETE FROM tg_queue WHERE status <> 'pending' AND id < (SELECT COALESCE(MAX(id), 0) - 1000 FROM tg_queue)");
  } catch (e) {
    return { ok: false, message: String(e), sent, failed };
  } finally { await kvDel(c, "tg_flushing"); }
  return { ok: true, sent, failed };
}
export async function tgPendingCount(c) {
  try { const r = await first(c, "SELECT COUNT(*) AS n FROM tg_queue WHERE status = 'pending'"); return r ? r.n : 0; } catch (e) { return null; }
}

// ── สร้างบรรทัดสรุปยอด + เตือนสต๊อกต่ำ + วันที่ใช้ได้ (ข้อความ Telegram) ──
export function stockSummaryLines(newQty, unit_, minQty, dailyUsage) {
  const lines = [];
  if (dailyUsage > 0) {
    const days = Math.floor(newQty / dailyUsage);
    const dayIcon = days === 0 ? "🔴" : days <= 7 ? "🔴" : days <= 14 ? "🟠" : days <= 30 ? "🟡" : "🟢";
    lines.push(dayIcon + " ใช้ได้อีกประมาณ " + days + " วัน  (ใช้/วัน: " + dailyUsage + " " + unit_ + ")");
  }
  if (minQty > 0 && newQty <= minQty) lines.push("⚠️ สต๊อกต่ำกว่าขั้นต่ำ!  (ขั้นต่ำ: " + minQty + " " + unit_ + ")");
  return lines.length ? "\n" + lines.join("\n") : "";
}
