// วัตถุดิบ (SQF / MLM): อ่านคลัง · เบิก/รับ/คืน · ตรวจนับ · แก้ไข · นำเข้า · รายงานใบเบิก · จุดสั่งซื้อ · เทรนด์
// คำตอบทุกตัวคงรูปแบบเดิมของหลังบ้าน Apps Script — หน้าจอทั้งสองไม่ต้องแก้
import { all, first, run, stmt, changed, kvGet, kvPut, uuid, getCfg, nowIso, fmtTH, dayTH, thaiMidnightMs, eventTime, qtyStrict,
         numOrBlank, userWithDevice, deviceTag, sendAlert, stockSummaryLines, sysLog, expiryInfoTH, TZ_MS, DAY_MS } from "./lib.js";

// ประเภทรายการ — IN รับเข้าจากซัพพลายเออร์ / OUT เบิกไปใช้ / RETURN คืนของที่เบิกเกิน
// แยก RETURN ออกจาก IN เพื่อให้คำนวณยอดใช้จริงได้ถูก: ใช้จริง = เบิกออก − คืน
export const RM_TYPES = {
  IN:     { label: "รับเข้า",     emoji: "📥 รับเข้า",     sign: "+" },
  OUT:    { label: "เบิกออก",     emoji: "📤 เบิกออก",     sign: "-" },
  RETURN: { label: "คืนวัตถุดิบ", emoji: "↩️ คืนวัตถุดิบ", sign: "+" },
};
const TYPE_BY_LABEL = { "รับเข้า": "IN", "เบิกออก": "OUT", "คืนวัตถุดิบ": "RETURN" };
const DOC_PREFIX = { OUT: "RQ", IN: "RC", RETURN: "RT" };   // RQ-SQF-2569-0001
const COUNT_LABEL = "ตรวจนับ/ปรับยอด";
export const ROP_WINDOW_DAYS = 90;
export const TREND_DAYS = 30;
const RM_IMPORT_MAX_ROWS = 500;

const skuPrefix = (module) => (module === "SQF" ? "SQF-" : "MLM-");

// ───────────── ⏰ อัปเดตสต๊อกล่าสุด — ใช้เตือน "ไม่มีการอัปเดตเกิน N วัน" ─────────────
// นับเฉพาะรายการที่แตะยอดจริง (เบิก/รับ/คืน/นับ/สร้าง/นำเข้า) — แก้ชื่อ/ตั้งจุดสั่งซื้อ ไม่นับ
// ของที่ใช้นานๆ ครั้งก็ต้องมีคนนับยืนยันยอดเป็นระยะ ไม่งั้นตัวเลขในแผนสั่งซื้อจะเชื่อไม่ได้
export const STALE_DEFAULT_DAYS = 7;
export const STOCK_ACTION_SQL = "(action IN ('เบิกออก', 'รับเข้า', 'คืนวัตถุดิบ', '" + COUNT_LABEL + "', 'สร้างรายการ') OR action LIKE 'นำเข้าจากไฟล์%')";
export function staleDaysOf(cfg) {
  const v = cfg ? cfg.planStaleDays : undefined;
  if (v === undefined || v === null || String(v).trim() === "") return STALE_DEFAULT_DAYS;
  const n = Math.round(Number(v));
  return isFinite(n) ? Math.min(365, Math.max(0, n)) : STALE_DEFAULT_DAYS;
}
/** sku → เวลา (ms) ที่ยอดถูกแตะล่าสุด · ไม่เคยเลย = ไม่มีในแผนที่ */
export async function lastStockUpdate(c, module, mats) {
  const nameToSku = {}, out = {};
  (mats || []).forEach((m) => { nameToSku[String(m.name).trim()] = String(m.sku); });
  const put = (sku, t) => { if (sku && isFinite(t) && (!out[sku] || t > out[sku])) out[sku] = t; };
  for (const r of await all(c, "SELECT sku, name, MAX(ts) AS t FROM history WHERE module = ? AND " + STOCK_ACTION_SQL + " GROUP BY sku, name", module))
    put(String(r.sku || "").trim() || nameToSku[String(r.name || "").trim()] || "", r.t ? new Date(r.t).getTime() : NaN);
  (mats || []).forEach((m) => { if (/^\d{4}-\d{2}-\d{2}/.test(String(m.last_verified || ""))) put(String(m.sku), new Date(m.last_verified).getTime()); });
  return out;
}
/** ผ่านมากี่วัน (นับเป็นวันปฏิทินไทย) */
export function idleDaysTH(ms, now) {
  if (!ms) return null;
  const a = Date.parse(dayTH(ms) + "T00:00:00Z"), b = Date.parse(dayTH(now || Date.now()) + "T00:00:00Z");
  return Math.max(0, Math.round((b - a) / DAY_MS));
}
const blankIfNull = (v) => (v === null || v === undefined ? "" : v);

/** แถวตาราง materials → รูปแบบเดิม (ชื่อคีย์ = หัวคอลัมน์ชีต) */
export function matOut(r) {
  return {
    SKU: r.sku, Name: r.name, Qty: r.qty, Unit: r.unit, Min: r.min, DailyUsage: r.daily_usage,
    ExpiryDate: r.expiry_date, LastVerified: r.last_verified, Discontinued: Number(r.discontinued) !== 0,
    AlertDays: numOrBlank(r.alert_days), RopStart: r.rop_start,
    LeadDays: numOrBlank(r.lead_days), Moq: numOrBlank(r.moq), PackSize: numOrBlank(r.pack_size),
  };
}
const histArr = (h) => [h.ts, h.name, h.action, blankIfNull(h.qty), h.user, h.doc_no || "", h.sku || "", h.unit || "", h.purpose || ""];

async function addHistory(c, module, row) {
  await run(c, "INSERT INTO history (module, ts, name, action, qty, user, sku, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    module, row.ts || nowIso(), String(row.name || ""), row.action, row.qty === undefined ? "-" : row.qty, row.user || "", String(row.sku || ""), String(row.unit || ""));
}

// ───────────── อ่านคลัง (GET ?module=) ─────────────
export async function getRawMaterials(c, module) {
  const rows = await all(c, "SELECT * FROM materials WHERE module = ? ORDER BY seq, rowid", module);
  const materials = [], discontinued = [];
  // ⏰ อัปเดตสต๊อกล่าสุด — หน้าจอแค่แสดง/กรอง ตัวเลขคิดที่นี่ที่เดียว
  const last = await lastStockUpdate(c, module, rows), now = Date.now();
  rows.forEach((r) => {
    const o = matOut(r);
    o.LastUpdate = last[r.sku] ? new Date(last[r.sku]).toISOString() : "";
    o.IdleDays = idleDaysTH(last[r.sku], now);
    // ⛔ หมดอายุ — คิดที่นี่ที่เดียว (มือถือเดิมไม่มีเลย · หน้าคอมเคยอ่าน วว/ดด/ปปปป ผิด) · QA M2 2026-10-10
    const ex = expiryInfoTH(r.expiry_date);
    o.ExpDays = ex ? ex.days : null;
    o.ExpStatus = !ex ? "" : ex.days < 0 ? "expired" : ex.days <= (Number(r.alert_days) || 7) ? "near" : "";
    (Number(r.discontinued) !== 0 ? discontinued : materials).push(o);
  });
  const hist = await all(c, "SELECT ts, name, action, qty, user, doc_no, sku, unit, purpose FROM history WHERE module = ? ORDER BY id DESC LIMIT 30", module);
  const prefix = skuPrefix(module);
  const nums = rows.map((r) => String(r.sku)).filter((s) => s.startsWith(prefix)).map((s) => parseInt(s.replace(prefix, ""), 10)).filter((n) => !isNaN(n));
  const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
  return { status: "success", materials, discontinued, recentHistory: hist.map(histArr), nextSku: prefix + String(nextNum).padStart(4, "0"),
           staleDays: staleDaysOf(await getCfg(c)) };
}

// ───────────── เพิ่มรายการใหม่ ─────────────
export async function rmCreate(c, data, module) {
  const { sku, name, unit, qty, min, dailyUsage, expiryDate, alertDays, user } = data;
  if (!sku || !name) return { status: "error", message: "ข้อมูลไม่ครบ" };
  if (Number(min) < 0) return { status: "error", message: "ขั้นต่ำต้องไม่เป็นค่าลบ" };
  if (Number(dailyUsage) < 0) return { status: "error", message: "ใช้ต่อวันต้องไม่เป็นค่าลบ" };
  if (!unit || !String(unit).trim()) return { status: "error", message: "กรุณาระบุหน่วย" };
  if (await first(c, "SELECT 1 AS x FROM materials WHERE module = ? AND lower(trim(sku)) = lower(trim(?))", module, String(sku)))
    return { status: "error", message: "SKU นี้มีอยู่แล้ว" };
  const r = await run(c,
    "INSERT OR IGNORE INTO materials (module, sku, name, qty, unit, min, daily_usage, expiry_date, alert_days, seq) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM materials WHERE module = ?))",
    module, String(sku), String(name), Number(qty) || 0, String(unit || ""), Number(min) || 0, Number(dailyUsage) || 0,
    String(expiryDate || ""), Number(alertDays) || 7, module);
  if (!changed(r)) return { status: "error", message: "SKU นี้มีอยู่แล้ว" };
  await addHistory(c, module, { name, action: "สร้างรายการ", qty: Number(qty) || 0, user: userWithDevice(c, user), sku, unit });
  sendAlert(c, `🆕 เพิ่มวัตถุดิบใหม่\n📦 ${name} (${sku})\n🔢 ยอดเริ่มต้น: ${Number(qty) || 0} ${unit}\n👤 ${user || "-"}${deviceTag(c)}`, module);
  return { status: "success" };
}

// ───────────── กันบันทึกซ้ำ ─────────────
// opId = รหัสที่หน้าจอสร้างตอนพนักงานกดยืนยัน ติดไปกับรายการตลอดชีวิต
// เน็ตขาดตอนเซิร์ฟเวอร์เขียนเสร็จแล้วแต่คำตอบส่งกลับไม่ถึง → หน้าจอส่งซ้ำ → ต้องไม่หักสต๊อกสองรอบ
// ชั้นแรก: unique index (module, op_id) ในตาราง history = ฐานข้อมูลเองไม่ยอมให้เข้าซ้ำ
// ชั้นสอง: จำคำตอบเต็มไว้ 7 วัน เพื่อตอบกลับเหมือนครั้งแรกทุกประการ
async function opRemember(c, opId, result) {
  if (!opId) return;
  try { await kvPut(c, "op_" + opId, JSON.stringify(Object.assign({}, result, { duplicate: true })), 7 * 86400); } catch (e) {}
}
async function opReplay(c, module, opId) {
  if (!opId) return null;
  try { const hit = await kvGet(c, "op_" + opId); if (hit) return JSON.parse(hit); } catch (e) {}
  const h = await first(c, "SELECT * FROM history WHERE module = ? AND op_id = ?", module, opId);
  if (!h) return null;
  const type = TYPE_BY_LABEL[h.action];
  if (type) return { status: "success", duplicate: true, docNo: h.doc_no, slip: slipFrom(h, type, module) };
  if (h.action === COUNT_LABEL) return { status: "success", duplicate: true, counted: Number(h.qty), applied: Number(h.qty), adjusted: 0, movementsAfter: 0 };
  return { status: "success", duplicate: true };
}
function slipFrom(h, type, module) {
  return {
    docNo: h.doc_no, type, action: h.action, sku: String(h.sku), name: String(h.name), qty: Number(h.qty),
    unit: String(h.unit), balance: h.balance_after, user: String(h.user || "-").split(" (📱")[0],
    purpose: h.purpose || "", workOrderId: h.work_order || "", module, at: h.ts,
  };
}

// ───────────── เบิก / รับ / คืน ─────────────
export async function rmUpdate(c, data, module) {
  const sku = String(data.sku == null ? "" : data.sku), user = data.user;
  const opId = String(data.opId || "");
  const seen = await opReplay(c, module, opId);
  if (seen) return seen;
  const eventAt = eventTime(data.clientAt);
  const purpose = String(data.purpose == null ? "" : data.purpose).trim().slice(0, 120);
  const type = String(data.type || "").toUpperCase();
  const meta = RM_TYPES[type];
  if (!meta) return { status: "error", message: "ประเภทรายการไม่ถูกต้อง" };
  const q = qtyStrict(data.qty, true);
  if (isNaN(q)) return { status: "error", message: "จำนวนไม่ถูกต้อง (ต้องเป็นตัวเลข 0-9,999,999)" };
  if (q <= 0) return { status: "error", message: "จำนวนต้องมากกว่า 0" };
  // เบิกออกต้องบอกว่าเอาไปใช้กับงานอะไร — บังคับที่เซิร์ฟเวอร์ด้วย (ออดิเตอร์ถามหา)
  if (type === "OUT" && !purpose) return { status: "error", message: "กรุณาระบุว่าเบิกไปใช้กับงานอะไร" };
  const workOrderId = String(data.workOrderId || "").trim().slice(0, 40);

  const m = await first(c, "SELECT * FROM materials WHERE module = ? AND sku = ?", module, sku);
  if (!m) return { status: "error", message: "ไม่พบ SKU" };
  const insufficient = (cur) => ({ status: "error", message: "⚠️ สต๊อกไม่เพียงพอ — มีอยู่ " + cur + " " + (m.unit || "") + " ไม่สามารถเบิก " + q + " " + (m.unit || "") + " ได้" });
  if (type === "OUT" && q > Number(m.qty || 0)) return insufficient(Number(m.qty || 0));

  // เลขที่เอกสาร: ตัวนับแยกตามประเภท/โรงงาน/ปี พ.ศ. — ถ้ายังไม่มีตัวนับของปีนี้ เริ่มต่อจากเลขสูงสุดในประวัติ
  const pf = DOC_PREFIX[type] || "RQ";
  const year = new Date(Date.now() + TZ_MS).getUTCFullYear() + 543;
  const seqKey = "docSeq_" + pf + "_" + module + "_" + year;
  const docPrefix = pf + "-" + module + "-" + year + "-";
  let base = 0;
  if (!(await first(c, "SELECT 1 AS x FROM config WHERE key = ?", seqKey))) {
    const mx = await first(c, "SELECT MAX(CAST(substr(doc_no, ?) AS INTEGER)) AS n FROM history WHERE module = ? AND doc_no LIKE ?", docPrefix.length + 1, module, docPrefix + "%");
    base = (mx && mx.n) || 0;
  }

  // ทั้งหมดนี้สำเร็จหรือล้มเหลวด้วยกัน (transaction เดียว):
  //   1) ประวัติ — เงื่อนไขสต๊อกตรวจซ้ำ "ในฐานข้อมูล" ณ วินาทีที่เขียน (สองเครื่องเบิกพร้อมกันไม่ทำให้ยอดติดลบ)
  //   2) ตัวนับเลขที่เอกสาร — ขยับเฉพาะเมื่อข้อ 1 เขียนสำเร็จ (ไม่มีเลขข้าม)
  //   3) ยอดคงเหลือ — เปลี่ยนเฉพาะเมื่อข้อ 1 เขียนสำเร็จ
  // opId ซ้ำ → ข้อ 1 ชน unique index → ยกเลิกทั้งชุด ไม่หักซ้ำ
  const op = opId || "srv-" + uuid();
  const delta = type === "OUT" ? -q : q;
  try {
    await c.env.DB.batch([
      stmt(c,
        "INSERT INTO history (module, ts, name, action, qty, user, doc_no, sku, unit, purpose, op_id, balance_after, work_order) " +
        "SELECT ?, ?, m.name, ?, ?, ?, ? || printf('%04d', COALESCE((SELECT CAST(value AS INTEGER) FROM config WHERE key = ?), ?) + 1), " +
        "m.sku, m.unit, ?, ?, ROUND(m.qty + ?, 3), ? FROM materials m WHERE m.module = ? AND m.sku = ? AND (? >= 0 OR m.qty >= ?)",
        module, eventAt, meta.label, q, userWithDevice(c, user), docPrefix, seqKey, base, purpose, op, delta, workOrderId, module, sku, delta, q),
      stmt(c,
        "INSERT INTO config (key, value) SELECT ?, CAST(? + 1 AS TEXT) WHERE EXISTS (SELECT 1 FROM history WHERE module = ? AND op_id = ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(config.value AS INTEGER) + 1 AS TEXT)",
        seqKey, base, module, op),
      stmt(c,
        "UPDATE materials SET qty = ROUND(qty + ?, 3) WHERE module = ? AND sku = ? AND EXISTS (SELECT 1 FROM history WHERE module = ? AND op_id = ?)",
        delta, module, sku, module, op),
    ]);
  } catch (e) {
    const again = await opReplay(c, module, opId);   // ชน unique = คำขอเดียวกันมาถึงซ้อนกัน
    if (again) return again;
    throw e;
  }
  const h = await first(c, "SELECT * FROM history WHERE module = ? AND op_id = ?", module, op);
  if (!h) {   // เงื่อนไขสต๊อกไม่ผ่าน ณ วินาทีที่เขียน (มีคนเบิกตัดหน้า)
    const m2 = await first(c, "SELECT qty FROM materials WHERE module = ? AND sku = ?", module, sku);
    if (!m2) return { status: "error", message: "ไม่พบ SKU" };
    return insufficient(Number(m2.qty || 0));
  }
  const newQty = Number(h.balance_after);
  sendAlert(c, meta.emoji + "\n📦 " + m.name + " (" + sku + ")" +
    "\n🔢 " + meta.sign + q + " " + (m.unit || "") + "  →  คงเหลือ: " + newQty + " " + (m.unit || "") +
    stockSummaryLines(newQty, m.unit || "", Number(m.min || 0), Number(m.daily_usage || 0)) +
    "\n👤 " + (user || "-") + deviceTag(c), module);
  const res = {
    status: "success", docNo: h.doc_no,
    slip: { docNo: h.doc_no, type, action: meta.label, sku: String(sku), name: String(m.name), qty: q, unit: String(m.unit || ""),
            balance: newQty, user: String(user || "-"), purpose, workOrderId, module, at: eventAt },
  };
  await opRemember(c, opId, res);
  return res;
}

// ───────────── ตรวจนับ / ปรับยอด ─────────────
export async function rmVerify(c, data, module) {
  const sku = String(data.sku == null ? "" : data.sku), user = data.user;
  const opId = String(data.opId || "");
  const seen = await opReplay(c, module, opId);
  if (seen) return seen;
  const eventAt = eventTime(data.clientAt);
  const m = await first(c, "SELECT * FROM materials WHERE module = ? AND sku = ?", module, sku);
  if (!m) return { status: "error", message: "ไม่พบ SKU" };
  const counted = qtyStrict(data.qty, true);
  if (isNaN(counted)) return { status: "error", message: "ยอดที่นับไม่ถูกต้อง (ต้องเป็นตัวเลข 0-9,999,999)" };
  const cur = Number(m.qty || 0), unit_ = m.unit || "";

  // นับตอนออฟไลน์แล้วส่งทีหลัง ห้ามทับความเคลื่อนไหวที่เกิดหลังเวลานับ
  // นับได้ 100 ตอน 10 โมง · คนอื่นเบิก 10 ตอน 11 โมง · ส่งได้เที่ยง → ต้องได้ 90 ไม่ใช่ 100
  let adj = 0, movesAfter = 0, replayNote = "";
  const ctMs = new Date(eventAt).getTime();
  if (data.clientAt && Date.now() - ctMs > 5000) {
    const rows = await all(c,
      "SELECT ts, action, qty FROM history WHERE module = ? AND ts > ? AND (sku = ? OR (sku = '' AND name = ?)) ORDER BY id",
      module, eventAt, sku, String(m.name));
    for (const r of rows) {
      const ts = new Date(r.ts).getTime();
      if (isNaN(ts) || ts <= ctMs) continue;
      if (r.action === COUNT_LABEL)
        return { status: "error", message: "มีการนับสต๊อกใหม่กว่าเวลาที่นับไว้ (ยอดล่าสุด " + cur + " " + unit_ + ") — รายการนับนี้เก่ากว่า จึงไม่นำมาใช้" };
      const t = TYPE_BY_LABEL[r.action];
      if (t) { adj += (t === "OUT" ? -1 : 1) * Number(r.qty || 0); movesAfter++; }
    }
    if (movesAfter) replayNote = "นับได้ " + counted + " · ปรับตามความเคลื่อนไหวหลังเวลานับ " + (adj > 0 ? "+" : "") + adj + " (" + movesAfter + " รายการ)";
  }
  const newQty = Math.max(0, Math.round((counted + adj) * 1000) / 1000);
  const op = opId || "srv-" + uuid();
  try {
    await c.env.DB.batch([
      stmt(c,
        "INSERT INTO history (module, ts, name, action, qty, user, sku, unit, purpose, op_id, balance_after) " +
        "SELECT ?, ?, m.name, ?, ?, ?, m.sku, m.unit, ?, ?, ? FROM materials m WHERE m.module = ? AND m.sku = ?",
        module, eventAt, COUNT_LABEL, newQty, userWithDevice(c, user), replayNote, op, newQty, module, sku),
      stmt(c,
        "UPDATE materials SET qty = ?, last_verified = ? WHERE module = ? AND sku = ? AND EXISTS (SELECT 1 FROM history WHERE module = ? AND op_id = ?)",
        newQty, eventAt, module, sku, module, op),
    ]);
  } catch (e) {
    const again = await opReplay(c, module, opId);
    if (again) return again;
    throw e;
  }
  sendAlert(c, "⚖️ ตรวจนับ/ปรับยอด\n📦 " + m.name + " (" + sku + ")" + "\n🔢 ยอดจริง: " + newQty + " " + unit_ +
    stockSummaryLines(newQty, unit_, Number(m.min || 0), Number(m.daily_usage || 0)) +
    "\n👤 " + (user || "-") + deviceTag(c) + (replayNote ? "\n⏱️ " + replayNote : ""), module);
  const vres = { status: "success", counted, applied: newQty, adjusted: adj, movementsAfter: movesAfter };
  await opRemember(c, opId, vres);
  return vres;
}

// ───────────── แก้ไข / ยกเลิกใช้ ─────────────
export async function rmEdit(c, data, module) {
  const { sku, name, unit, min, dailyUsage, expiryDate, alertDays, user } = data;
  const m = await first(c, "SELECT * FROM materials WHERE module = ? AND sku = ?", module, String(sku));
  if (!m) return { status: "error", message: "ไม่พบ SKU" };
  const sets = ["min = ?", "daily_usage = ?", "expiry_date = ?"], args = [Number(min) || 0, Number(dailyUsage) || 0, String(expiryDate || "")];
  if (name) { sets.push("name = ?"); args.push(String(name)); }
  if (unit) { sets.push("unit = ?"); args.push(String(unit)); }
  if (alertDays !== undefined) { sets.push("alert_days = ?"); args.push(Number(alertDays) || 7); }
  // วันรอของ / สั่งขั้นต่ำ / ขนาดบรรจุ รายตัว — ไม่ส่งมา = ไม่แตะ
  [["leadDays", "lead_days"], ["moq", "moq"], ["packSize", "pack_size"]].forEach(([k, col]) => {
    if (data[k] !== undefined) { sets.push(col + " = ?"); args.push(Math.max(0, Number(data[k]) || 0)); }
  });
  await run(c, "UPDATE materials SET " + sets.join(", ") + " WHERE module = ? AND sku = ?", ...args, module, String(sku));
  await addHistory(c, module, { name: name || m.name, action: "แก้ไขข้อมูล", user: userWithDevice(c, user), sku, unit: unit || m.unit });
  sendAlert(c, `✏️ แก้ไขข้อมูล\n📦 ${name || m.name} (${sku})\n👤 ${user || "-"}${deviceTag(c)}`, module);
  return { status: "success" };
}

export async function rmDelete(c, data, module) {
  const { sku, user } = data;
  const m = await first(c, "SELECT name, unit FROM materials WHERE module = ? AND sku = ?", module, String(sku));
  if (!m) return { status: "error", message: "ไม่พบ SKU" };
  await run(c, "UPDATE materials SET discontinued = 1 WHERE module = ? AND sku = ?", module, String(sku));
  await addHistory(c, module, { name: m.name, action: "ลบ/ยกเลิก", user: userWithDevice(c, user), sku, unit: m.unit });
  sendAlert(c, `🗑️ ลบ/ยกเลิกรายการ\n📦 ${m.name} (${sku})\n👤 ${user || "-"}${deviceTag(c)}`, module);
  return { status: "success" };
}

// ───────────── จุดสั่งซื้อ ─────────────
export async function rmSetMin(c, data, module) {
  const sku = String(data.sku || ""), min = Number(data.min);
  if (!sku || !isFinite(min) || min < 0) return { status: "error", message: "ข้อมูลไม่ถูกต้อง" };
  const m = await first(c, "SELECT name, unit, min FROM materials WHERE module = ? AND sku = ?", module, sku);
  if (!m) return { status: "error", message: "ไม่พบ SKU" };
  const oldMin = Number(m.min || 0);
  await run(c, "UPDATE materials SET min = ? WHERE module = ? AND sku = ?", min, module, sku);
  await addHistory(c, module, { name: m.name, action: "ปรับจุดสั่งซื้อ " + oldMin + "→" + min, user: userWithDevice(c, data.user), sku, unit: m.unit });
  sendAlert(c, "📐 ปรับจุดสั่งซื้อ (จากคำแนะนำ)\n📦 " + m.name + " (" + sku + ")\n🔢 " + oldMin + " → " + min + "\n👤 " + (data.user || "-") + deviceTag(c), module);
  return { status: "success", oldMin, newMin: min };
}

export async function rmSetRopStart(c, data, module) {
  const sku = String(data.sku || ""), raw = String(data.date || "").trim();   // "" = ล้าง กลับไปนับทั้งช่วง
  if (!sku) return { status: "error", message: "ไม่ระบุ SKU" };
  if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { status: "error", message: "รูปแบบวันที่ไม่ถูกต้อง" };
  const m = await first(c, "SELECT name, unit FROM materials WHERE module = ? AND sku = ?", module, sku);
  if (!m) return { status: "error", message: "ไม่พบ SKU" };
  await run(c, "UPDATE materials SET rop_start = ? WHERE module = ? AND sku = ?", raw, module, sku);
  await addHistory(c, module, { name: m.name, action: raw ? "ตั้งวันเริ่มนับจุดสั่งซื้อ " + raw : "ล้างวันเริ่มนับจุดสั่งซื้อ", user: userWithDevice(c, data.user), sku, unit: m.unit });
  return { status: "success", sku, date: raw };
}

/** "yyyy-MM-dd" → ms เที่ยงคืนไทย · ค่าอื่น → null */
function ropStartMs(v) {
  const m = String(v || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? thaiMidnightMs(+m[1], +m[2], +m[3]) : null;
}
async function skuMaps(c, module) {
  const mats = await all(c, "SELECT sku, name, rop_start FROM materials WHERE module = ? ORDER BY seq, rowid", module);
  const nameToSku = {}, ropStart = {}, startsOut = {};
  mats.forEach((r) => {
    nameToSku[String(r.name).trim()] = String(r.sku);
    const ms = ropStartMs(r.rop_start);
    if (ms !== null) { ropStart[r.sku] = ms; startsOut[r.sku] = fmtTH(ms, "yyyy-MM-dd"); }
  });
  return { nameToSku, ropStart, startsOut };
}

// 📉 เทรนด์การเบิกรายตัว: ยอดเบิกสุทธิรายวัน (เบิก−คืน) ย้อนหลัง 30 วัน · เคารพวันเริ่มนับรายตัว
export async function rmTrends(c, data, module) {
  const now = Date.now(), winStart = now - TREND_DAYS * DAY_MS;
  const { nameToSku, ropStart } = await skuMaps(c, module);
  const rows = await all(c,
    "SELECT ts, name, action, qty, sku FROM history WHERE module = ? AND ts >= ? AND action IN ('เบิกออก', 'คืนวัตถุดิบ')",
    module, new Date(winStart).toISOString());
  const daily = {};
  for (const r of rows) {
    const ts = new Date(r.ts).getTime();
    if (isNaN(ts) || ts < winStart) continue;
    let sku = String(r.sku || "").trim();
    if (!sku) sku = nameToSku[String(r.name || "").trim()] || "";
    if (!sku) continue;
    if (ropStart[sku] && ts < ropStart[sku]) continue;
    const q = Number(r.qty);
    if (!isFinite(q) || q <= 0) continue;
    const delta = r.action === "เบิกออก" ? q : -q;
    const day = dayTH(ts);
    if (!daily[sku]) daily[sku] = {};
    daily[sku][day] = (daily[sku][day] || 0) + delta;
  }
  const dayKeys = [];
  for (let d = TREND_DAYS - 1; d >= 0; d--) dayKeys.push(dayTH(now - d * DAY_MS));
  const series = {};
  Object.keys(daily).forEach((sku) => {
    const arr = dayKeys.map((k) => Math.max(0, daily[sku][k] || 0));
    if (arr.some((v) => v > 0)) series[sku] = arr;
  });
  return { status: "success", days: TREND_DAYS, series };
}

// 📐 สถิติดิบต่อ SKU สำหรับจุดสั่งซื้อแนะนำ (สูตรจุดสั่งซื้อคิดที่หน้าจอ เพราะผู้ใช้ปรับ "รอของกี่วัน" ได้สดๆ)
export async function rmRopStats(c, data, module) {
  const now = Date.now(), winStart = now - ROP_WINDOW_DAYS * DAY_MS;
  const n = await first(c, "SELECT COUNT(*) AS n FROM history WHERE module = ?", module);
  if (!n || !n.n) return { status: "success", windowDays: ROP_WINDOW_DAYS, items: {} };
  const { nameToSku, ropStart, startsOut } = await skuMaps(c, module);
  const rows = await all(c, "SELECT ts, name, action, qty, sku FROM history WHERE module = ? ORDER BY id", module);

  const daily = {}, firstSeen = {}, txCount = {}, lastOut = {};
  for (const r of rows) {
    const ts = r.ts ? new Date(r.ts).getTime() : NaN;
    if (isNaN(ts)) continue;
    let sku = String(r.sku || "").trim();
    if (!sku) sku = nameToSku[String(r.name || "").trim()] || "";
    if (!sku) continue;
    if (ropStart[sku] && ts < ropStart[sku]) continue;   // ก่อนวันเริ่มนับ = มองไม่เห็น
    if (!firstSeen[sku] || ts < firstSeen[sku]) firstSeen[sku] = ts;
    if (ts < winStart) continue;
    const q = Number(r.qty);
    if (!isFinite(q) || q <= 0) continue;
    let delta = 0;
    if (r.action === "เบิกออก") { delta = q; txCount[sku] = (txCount[sku] || 0) + 1; if (!lastOut[sku] || ts > lastOut[sku]) lastOut[sku] = ts; }
    else if (r.action === "คืนวัตถุดิบ") delta = -q;
    else continue;
    const day = dayTH(ts);
    if (!daily[sku]) daily[sku] = {};
    daily[sku][day] = (daily[sku][day] || 0) + delta;
  }
  // วันที่ไม่มีการเบิกนับเป็น 0 ด้วย ไม่งั้น σ ต่ำเกินจริง
  const items = {};
  Object.keys(daily).forEach((sku) => {
    const baseStart = ropStart[sku] || firstSeen[sku];
    const obsStart = baseStart > winStart ? baseStart : winStart;
    const days = Math.max(1, Math.ceil((now - obsStart) / DAY_MS));
    const buckets = daily[sku];
    let total = 0;
    Object.keys(buckets).forEach((d) => { total += Math.max(0, buckets[d]); });
    const avg = total / days;
    let ss = 0;
    for (let dOff = 0; dOff < days; dOff++) {
      const v = Math.max(0, buckets[dayTH(now - dOff * DAY_MS)] || 0);
      ss += (v - avg) * (v - avg);
    }
    items[sku] = {
      avgDaily: Math.round(avg * 1000) / 1000,
      sigma: Math.round(Math.sqrt(ss / days) * 1000) / 1000,
      days,
      txCount: txCount[sku] || 0,
      lastOut: lastOut[sku] ? dayTH(lastOut[sku]) : "",
    };
  });
  return { status: "success", windowDays: ROP_WINDOW_DAYS, items, starts: startsOut };
}

// ───────────── ยอดในคลังตรงกับยอดหลังรายการล่าสุดในประวัติมั๊ย ─────────────
export async function rmLedgerAudit(c, data, module) {
  const mats = await all(c, "SELECT sku, name, qty FROM materials WHERE module = ? ORDER BY seq, rowid", module);
  const hist = await all(c, "SELECT sku, name, balance_after, ts FROM history WHERE module = ? AND balance_after IS NOT NULL ORDER BY id DESC LIMIT 5000", module);
  const mismatches = [];
  if (!hist.length) return { status: "success", checked: 0, mismatches };
  const latest = {};
  for (const h of hist) {
    const key = h.sku ? String(h.sku) : "name:" + String(h.name || "");
    if (!latest[key]) latest[key] = { bal: Number(h.balance_after), at: String(h.ts || "") };
  }
  let checked = 0;
  for (const m of mats) {
    const L = latest[String(m.sku)] || latest["name:" + String(m.name || "")];
    if (!L) continue;
    checked++;
    const qty = Number(m.qty || 0);
    if (Math.abs(qty - L.bal) > 0.0005) mismatches.push({ sku: String(m.sku), name: String(m.name || ""), qty, ledger: L.bal, at: L.at });
  }
  return { status: "success", checked, mismatches };
}

// ───────────── รายงานใบเบิกรายเดือน + รับทราบ ─────────────
export async function rmDocReport(c, data, module) {
  const ym = String(data.month || "").trim();          // "2026-07" (ค.ศ.)
  const rows = await all(c, "SELECT * FROM history WHERE module = ? AND doc_no <> '' ORDER BY id", module);
  const out = [], monthSet = {};
  for (const r of rows) {
    // ⚠️ ห้ามตัดสตริง ISO ตรงๆ — ISO เป็นเวลา UTC รายการตอนตี 6 ของวันที่ 1 จะกลายเป็นเดือนก่อน
    const m = fmtTH(r.ts, "yyyy-MM");
    if (m) monthSet[m] = true;
    if (ym && m !== ym) continue;
    out.push({
      docNo: String(r.doc_no).trim(), at: String(r.ts || ""), action: String(r.action || ""), name: String(r.name || ""),
      sku: String(r.sku || ""), qty: blankIfNull(r.qty), unit: String(r.unit || ""), purpose: String(r.purpose || ""),
      user: String(r.user || ""), ackBy: String(r.ack_by || ""), ackAt: String(r.ack_at || ""),
    });
  }
  out.sort((a, b) => (a.docNo < b.docNo ? 1 : a.docNo > b.docNo ? -1 : 0));
  return { status: "success", rows: out, months: Object.keys(monthSet).sort().reverse() };
}

// "รับทราบ" = หัวหน้าเข้ามากดว่าเห็นแล้ว · ใครกดก็ได้ แต่บันทึกชื่อไว้เสมอ · กดครั้งแรกเท่านั้นที่นับ
export async function rmAckDocs(c, data, module) {
  const list = Array.isArray(data.docNos) ? data.docNos : (data.docNo ? [data.docNo] : []);
  const user = String(data.user || "-").trim();
  if (!list.length) return { status: "error", message: "ไม่ได้ระบุเลขที่เอกสาร" };
  if (list.length > 300) return { status: "error", message: "รับทราบได้ครั้งละไม่เกิน 300 ใบ" };
  const want = {};
  list.forEach((d) => { want[String(d).trim()] = true; });
  const who = userWithDevice(c, user), nowStr = nowIso();
  const rows = await all(c, "SELECT id, doc_no, ack_by, ack_at FROM history WHERE module = ? AND doc_no <> '' ORDER BY id", module);
  let done = 0, already = 0;
  const results = [], stmts = [];
  for (const r of rows) {
    const doc = String(r.doc_no || "").trim();
    if (!doc || !want[doc]) continue;
    const prev = String(r.ack_by || "").trim();
    if (prev) { already++; results.push({ docNo: doc, status: "already", ackBy: prev, ackAt: String(r.ack_at || "") }); continue; }
    stmts.push(stmt(c, "UPDATE history SET ack_by = ?, ack_at = ? WHERE id = ? AND ack_by = ''", who, nowStr, r.id));
    done++;
    results.push({ docNo: doc, status: "ok", ackBy: who, ackAt: nowStr });
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return { status: "success", acked: done, already, results };
}

// ───────────── นำเข้าวัตถุดิบเป็นชุดจากไฟล์ ─────────────
//   data.rows = [{ sku, name, qty, unit, min, dailyUsage, expiryDate, alertDays }]
//   data.mode = "skip" (ของที่มีอยู่แล้วข้าม — ค่าเริ่มต้น) | "overwrite" (อัปเดตทับเฉพาะช่องที่กรอกมา)
//   ฝั่งหน้าจอตรวจมาแล้วชั้นหนึ่ง แต่ที่นี่ตรวจซ้ำทั้งหมด — ห้ามเชื่อข้อมูลจากเบราว์เซอร์
export async function rmImport(c, data, module) {
  const mode = data.mode === "overwrite" ? "overwrite" : "skip";
  const user = data.user || "-";
  const inRows = Array.isArray(data.rows) ? data.rows : [];
  if (!inRows.length) return { status: "error", message: "ไม่มีข้อมูลให้นำเข้า" };
  if (inRows.length > RM_IMPORT_MAX_ROWS)
    return { status: "error", message: "นำเข้าได้ครั้งละไม่เกิน " + RM_IMPORT_MAX_ROWS + " รายการ (ส่งมา " + inRows.length + ")" };

  const existing = await all(c, "SELECT * FROM materials WHERE module = ? ORDER BY seq, rowid", module);
  const bySku = {}, byName = {};
  const prefix = skuPrefix(module);
  let maxNum = 0, maxSeq = 0;
  existing.forEach((r, i) => {
    const sk = String(r.sku || "").trim(), nm = String(r.name || "").trim();
    if (sk) bySku[sk.toLowerCase()] = i;
    if (nm) byName[nm.toLowerCase()] = i;
    if (sk.indexOf(prefix) === 0) { const n = parseInt(sk.replace(prefix, ""), 10); if (!isNaN(n) && n > maxNum) maxNum = n; }
    if (Number(r.seq) > maxSeq) maxSeq = Number(r.seq);
  });
  const num = (v) => {
    const s = String(v == null ? "" : v).replace(/,/g, "").trim();
    if (s === "") return null;
    const f = Number(s);
    return isNaN(f) ? NaN : f;
  };

  const results = [], stmts = [];
  let nCreated = 0, nUpdated = 0, nSkipped = 0, nError = 0;
  const nowStr = nowIso(), who = userWithDevice(c, user), seenInFile = {};
  const err = (line, name, message) => { results.push({ line, name, status: "error", message }); nError++; };
  const histStmt = (name, action, qty, sku, unit) =>
    stmt(c, "INSERT INTO history (module, ts, name, action, qty, user, sku, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", module, nowStr, name, action, qty, who, sku, unit);

  for (let r = 0; r < inRows.length; r++) {
    const src = inRows[r] || {}, line = r + 1;
    const name = String(src.name == null ? "" : src.name).trim();
    const sku = String(src.sku == null ? "" : src.sku).trim();
    const unit = String(src.unit == null ? "" : src.unit).trim();
    if (!name) { err(line, "", "ไม่ได้กรอกชื่อวัตถุดิบ"); continue; }
    const qty = num(src.qty), min = num(src.min), daily = num(src.dailyUsage), alert = num(src.alertDays);
    if (qty !== null && isNaN(qty)) { err(line, name, "จำนวนคงเหลือไม่ใช่ตัวเลข"); continue; }
    if (min !== null && isNaN(min)) { err(line, name, "จุดสั่งซื้อไม่ใช่ตัวเลข"); continue; }
    if (daily !== null && isNaN(daily)) { err(line, name, "ใช้ต่อวันไม่ใช่ตัวเลข"); continue; }
    if (qty !== null && qty < 0) { err(line, name, "จำนวนคงเหลือติดลบ"); continue; }
    if (min !== null && min < 0) { err(line, name, "จุดสั่งซื้อติดลบ"); continue; }
    if (daily !== null && daily < 0) { err(line, name, "ใช้ต่อวันติดลบ"); continue; }

    const nameKey = name.toLowerCase();
    if (seenInFile[nameKey]) { err(line, name, "ชื่อซ้ำกับบรรทัดที่ " + seenInFile[nameKey] + " ในไฟล์เดียวกัน"); continue; }
    seenInFile[nameKey] = line;

    let hit = -1;
    if (sku && bySku[sku.toLowerCase()] !== undefined) hit = bySku[sku.toLowerCase()];
    else if (byName[nameKey] !== undefined) hit = byName[nameKey];

    if (hit >= 0) {
      const cur = existing[hit];
      if (mode === "skip") { results.push({ line, name, sku: String(cur.sku || ""), status: "skipped", message: "มีอยู่แล้วในระบบ" }); nSkipped++; continue; }
      // อัปเดตทับ — เฉพาะช่องที่กรอกมาในไฟล์ ช่องว่างไว้ = คงค่าเดิม
      const changedCols = [], sets = [], args = [];
      if (qty !== null) { sets.push("qty = ?"); args.push(qty); changedCols.push("คงเหลือ"); }
      if (unit !== "") { sets.push("unit = ?"); args.push(unit); changedCols.push("หน่วย"); }
      if (min !== null) { sets.push("min = ?"); args.push(min); changedCols.push("จุดสั่งซื้อ"); }
      if (daily !== null) { sets.push("daily_usage = ?"); args.push(daily); changedCols.push("ใช้ต่อวัน"); }
      if (src.expiryDate) { sets.push("expiry_date = ?"); args.push(String(src.expiryDate)); changedCols.push("วันหมดอายุ"); }
      if (alert !== null && !isNaN(alert)) { sets.push("alert_days = ?"); args.push(alert); changedCols.push("เตือนล่วงหน้า"); }
      if (!changedCols.length) { results.push({ line, name, sku: String(cur.sku || ""), status: "skipped", message: "ไม่มีช่องไหนให้อัปเดต" }); nSkipped++; continue; }
      stmts.push(stmt(c, "UPDATE materials SET " + sets.join(", ") + " WHERE module = ? AND sku = ?", ...args, module, cur.sku));
      stmts.push(histStmt(name, "นำเข้าจากไฟล์ (อัปเดต)", qty === null ? "" : qty, String(cur.sku || ""), unit || cur.unit));
      results.push({ line, name, sku: String(cur.sku || ""), status: "updated", message: "อัปเดต: " + changedCols.join(", ") });
      nUpdated++; continue;
    }

    // เพิ่มใหม่
    if (!unit) { err(line, name, "ไม่ได้กรอกหน่วยนับ"); continue; }
    let newSku = sku;
    if (!newSku) { maxNum++; newSku = prefix + String(maxNum).padStart(4, "0"); }
    else if (bySku[newSku.toLowerCase()] !== undefined) { err(line, name, "SKU " + newSku + " ถูกใช้ไปแล้ว"); continue; }
    maxSeq++;
    stmts.push(stmt(c,
      "INSERT INTO materials (module, sku, name, qty, unit, min, daily_usage, expiry_date, alert_days, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      module, newSku, name, qty === null ? 0 : qty, unit, min === null ? 0 : min, daily === null ? 0 : daily,
      String(src.expiryDate || ""), (alert === null || isNaN(alert)) ? 7 : alert, maxSeq));
    stmts.push(histStmt(name, "นำเข้าจากไฟล์ (เพิ่มใหม่)", qty === null ? 0 : qty, newSku, unit));
    bySku[newSku.toLowerCase()] = -1;   // จองไว้ กันซ้ำในไฟล์เดียวกัน
    byName[nameKey] = -1;
    results.push({ line, name, sku: newSku, status: "created", message: "เพิ่มใหม่ " + (qty === null ? 0 : qty) + " " + unit });
    nCreated++;
  }

  // เขียนทั้งชุดใน transaction เดียว — นำเข้าครึ่งไฟล์แล้วล้มกลางทางไม่ได้
  for (let i = 0; i < stmts.length; i += 80) await c.env.DB.batch(stmts.slice(i, i + 80));

  if (nCreated || nUpdated)
    sendAlert(c, "📥 นำเข้าวัตถุดิบจากไฟล์\n➕ เพิ่มใหม่ " + nCreated + " รายการ\n🔄 อัปเดต " + nUpdated + " รายการ\n⏭️ ข้าม " + nSkipped +
      "\n⚠️ ผิดพลาด " + nError + "\n👤 " + user + deviceTag(c), module);
  return { status: "success", summary: { created: nCreated, updated: nUpdated, skipped: nSkipped, error: nError, total: inRows.length }, results };
}

// ───────────── ตัวกระจายคำสั่ง ─────────────
export async function handleRaw(c, action, data, module, extra) {
  switch (action) {
    case "CREATE": return rmCreate(c, data, module);
    case "UPDATE": return rmUpdate(c, data, module);
    case "VERIFY": return rmVerify(c, data, module);
    case "EDIT": return rmEdit(c, data, module);
    case "DELETE": return rmDelete(c, data, module);
    case "BACKUP": return extra.backup(c, data, module);
    case "IMPORT": return rmImport(c, data, module);
    case "TRENDS": return rmTrends(c, data, module);
    case "LEDGERAUDIT": return rmLedgerAudit(c, data, module);
    case "DOCREPORT": return rmDocReport(c, data, module);
    case "ACKDOC": return rmAckDocs(c, data, module);
    case "ROPSTATS": return rmRopStats(c, data, module);
    case "SETMIN": return rmSetMin(c, data, module);
    case "SETROPSTART": return rmSetRopStart(c, data, module);
    case "USAGEPLAN": return extra.usagePlan(c, data, module);
    case "PLANSET": return extra.planSet(c, data);
    case "PLANDIGEST": return extra.planDigestNow(c, data, module);
    default: return { status: "error", message: "Unknown action: " + action };
  }
}
