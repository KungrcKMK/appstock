// ล็อตวัตถุดิบ (2026-10-20) — 1 ครั้งรับเข้า = 1 ล็อต (วันที่รับเข้า + เลขล็อตผู้ขาย + วันหมดอายุ ถ้ามี)
//   ยอดหลักยังเป็น materials.qty (จอวางแผน/ใบขอซื้อ/สรุปเข้ากลุ่มไม่เปลี่ยน) · ล็อต = ยอดเดียวกันแยกตามวันที่รับ
//   ผลรวม qty_left ของแต่ละ SKU = materials.qty เสมอ — ทุกการเขียนที่แตะยอดต่อท้าย batch ด้วย lotSync (+ งานตามเวลาทุก 5 นาทีกันพลาด)
//     ล็อตรวมมากกว่ายอด → ตัดออกจากล็อตเก่าก่อน (เบิก / นับได้น้อยกว่า)
//     ยอดมากกว่าล็อตรวม → เติมเข้าล็อตใหม่สุด (นับได้มากกว่า) · ไม่มีล็อตเลย = สร้างล็อต "ยอดยกมา" (ของเดิมก่อนมีระบบล็อต)
//   ลำดับตัด: ยอดยกมา → ล็อตที่มีวันหมดอายุ (ใกล้หมดก่อน) → ล็อตที่ไม่มีวันหมดอายุ (รับก่อนตัดก่อน)
import { all, first, stmt, nowIso, dayTH, isRealDate, expiryInfoTH, DAY_MS } from "./lib.js";

const FIFO = "(recv_date <> ''), (exp_date = ''), exp_date, recv_date, id";
const NEWEST = "recv_date DESC, id DESC";
export const LOT_AGE_DEFAULT = 30;

/** เตือน "ล็อตค้างนาน" เมื่อรับเข้ามาเกินกี่วัน (ค่ากลาง config.lotAgeDays · 0 = ปิด) */
export function lotAgeDaysOf(cfg) {
  const v = cfg ? cfg.lotAgeDays : undefined;
  if (v === undefined || v === null || String(v).trim() === "") return LOT_AGE_DEFAULT;
  const n = Math.round(Number(v));
  return isFinite(n) ? Math.min(3650, Math.max(0, n)) : LOT_AGE_DEFAULT;
}

/** "yyyy-MM-dd" ที่เป็นวันจริง → ค่านั้น · ว่าง → "" · รูปแบบผิด → null */
export function lotYmd(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m && +m[1] >= 2000 && +m[1] <= 2200 && isRealDate(+m[1], +m[2], +m[3]) ? s : null;
}

/** รับมาแล้วกี่วัน (วันปฏิทินไทย) · ยอดยกมา = null */
export function lotAge(recvDate, now) {
  const a = Date.parse(String(recvDate || "") + "T00:00:00Z");
  if (!recvDate || isNaN(a)) return null;
  return Math.round((Date.parse(dayTH(now || Date.now()) + "T00:00:00Z") - a) / DAY_MS);
}

/** ชื่อล็อตที่คนอ่าน: "รับ 02/10/69 · L2409" · "ยอดยกมา" */
export function lotLabel(r) {
  const m = String(r.recv_date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return (m ? "รับ " + m[3] + "/" + m[2] + "/" + String(Number(m[1]) + 543).slice(-2) : "ยอดยกมา") + (r.lot_no ? " · " + r.lot_no : "");
}

// ── ทำให้ล็อตรวม = ยอดคงเหลือ ──
// need.n > 0 = ล็อตเกินยอด (ต้องตัด) · < 0 = ยอดเกินล็อต (ต้องเติม)
// MATERIALIZED = คิดครั้งเดียวก่อนเริ่มแก้แถว (กันอ่านค่าที่แก้ไปแล้วครึ่งทาง)
const NEED = "need AS MATERIALIZED (SELECT m.sku AS sku, ROUND(COALESCE((SELECT SUM(l.qty_left) FROM rm_lots l WHERE l.module = ?1 AND l.sku = m.sku), 0) - m.qty, 3) AS n " +
  "FROM materials m WHERE m.module = ?1 AND (?2 = '' OR m.sku = ?2))";
const TAKE = "o AS MATERIALIZED (SELECT id, sku, qty_left, SUM(qty_left) OVER (PARTITION BY sku ORDER BY " + FIFO + " ROWS UNBOUNDED PRECEDING) - qty_left AS before " +
  "FROM rm_lots WHERE module = ?1 AND (?2 = '' OR sku = ?2) AND qty_left > 0)";
const TAKE_AMT = "MIN(o.qty_left, need.n - o.before)";
const TAKE_WHERE = "need.n > 0 AND ROUND(need.n - o.before, 3) > 0";
const ADD = "t AS MATERIALIZED (SELECT need.sku AS sku, -need.n AS add_, (SELECT l.id FROM rm_lots l WHERE l.module = ?1 AND l.sku = need.sku ORDER BY " + NEWEST + " LIMIT 1) AS lid " +
  "FROM need WHERE need.n < 0)";

/**
 * คำสั่งชุดที่ทำให้ล็อตรวมตรงกับ materials.qty — ใส่ท้าย batch เดียวกับที่แก้ยอด
 *   sku "" = ทั้งโรงงาน · op = รหัสรายการในประวัติ (มี = จดว่าล็อตไหนเปลี่ยนเท่าไร ไว้แสดงบนใบเบิก)
 */
export function lotSync(c, module, sku, op) {
  sku = String(sku || ""); op = String(op || "");
  const s = [];
  if (op) s.push(stmt(c, "WITH " + NEED + ", " + TAKE + " INSERT INTO rm_lot_moves (module, op_id, lot_id, qty) " +
    "SELECT ?1, ?3, o.id, -ROUND(" + TAKE_AMT + ", 3) FROM o JOIN need ON need.sku = o.sku WHERE " + TAKE_WHERE + " ORDER BY o.sku, o.before", module, sku, op));
  s.push(stmt(c, "WITH " + NEED + ", " + TAKE + " UPDATE rm_lots SET qty_left = ROUND(rm_lots.qty_left - " + TAKE_AMT + ", 3) " +
    "FROM o JOIN need ON need.sku = o.sku WHERE rm_lots.id = o.id AND " + TAKE_WHERE, module, sku));
  s.push(stmt(c, "INSERT INTO rm_lots (module, sku, qty_in, qty_left, created_at, op_id) SELECT ?1, m.sku, ROUND(m.qty, 3), 0, ?3, ?4 FROM materials m " +
    "WHERE m.module = ?1 AND (?2 = '' OR m.sku = ?2) AND m.qty > 0 AND NOT EXISTS (SELECT 1 FROM rm_lots l WHERE l.module = ?1 AND l.sku = m.sku)",
    module, sku, nowIso(), op));
  if (op) s.push(stmt(c, "WITH " + NEED + ", " + ADD + " INSERT INTO rm_lot_moves (module, op_id, lot_id, qty) " +
    "SELECT ?1, ?3, t.lid, ROUND(t.add_, 3) FROM t WHERE t.lid IS NOT NULL AND ROUND(t.add_, 3) > 0", module, sku, op));
  s.push(stmt(c, "WITH " + NEED + ", " + ADD + " UPDATE rm_lots SET qty_left = ROUND(rm_lots.qty_left + t.add_, 3) " +
    "FROM t WHERE rm_lots.id = t.lid AND ROUND(t.add_, 3) > 0", module, sku));
  return s;
}

const GATE = "EXISTS (SELECT 1 FROM history WHERE module = ?1 AND op_id = ?3)";   // ทำเฉพาะเมื่อแถวประวัติของรายการนี้เขียนสำเร็จ

/** รับเข้า → ล็อตตามวันที่รับ (วัน+เลขล็อต+วันหมดอายุ ตรงกับล็อตที่มี = บวกเข้าล็อตนั้น) */
export function lotReceive(c, module, sku, op, q, recv, lotNo, exp) {
  return [
    stmt(c, "INSERT INTO rm_lots (module, sku, recv_date, lot_no, exp_date, qty_in, qty_left, created_at, op_id) " +
      "SELECT ?1, ?2, ?4, ?5, ?6, ?7, ?7, ?8, ?3 WHERE " + GATE +
      " ON CONFLICT(module, sku, recv_date, lot_no, exp_date) DO UPDATE SET qty_in = ROUND(qty_in + excluded.qty_in, 3), qty_left = ROUND(qty_left + excluded.qty_left, 3)",
      module, sku, op, recv, lotNo, exp, q, nowIso()),
    stmt(c, "INSERT INTO rm_lot_moves (module, op_id, lot_id, qty) SELECT ?1, ?3, id, ?7 FROM rm_lots " +
      "WHERE module = ?1 AND sku = ?2 AND recv_date = ?4 AND lot_no = ?5 AND exp_date = ?6 AND " + GATE, module, sku, op, recv, lotNo, exp, q),
  ];
}

/** คืน → กลับเข้าล็อตที่การเบิกครั้งล่าสุดตัดไปเป็นตัวสุดท้าย · ไม่เคยเบิกผ่านระบบล็อต = lotSync เติมเข้าล็อตใหม่สุดให้ */
export function lotReturn(c, module, sku, op, q) {
  return [
    stmt(c, "INSERT INTO rm_lot_moves (module, op_id, lot_id, qty) SELECT ?1, ?3, x.lid, ?4 FROM (SELECT mv.lot_id AS lid FROM rm_lot_moves mv " +
      "JOIN rm_lots l ON l.id = mv.lot_id JOIN history h ON h.module = mv.module AND h.op_id = mv.op_id " +
      "WHERE mv.module = ?1 AND l.sku = ?2 AND mv.qty < 0 AND h.action = 'เบิกออก' ORDER BY mv.id DESC LIMIT 1) x WHERE " + GATE, module, sku, op, q),
    stmt(c, "UPDATE rm_lots SET qty_left = ROUND(qty_left + ?4, 3) WHERE module = ?1 AND sku = ?2 AND id = " +
      "(SELECT lot_id FROM rm_lot_moves WHERE module = ?1 AND op_id = ?3 AND qty > 0 ORDER BY id DESC LIMIT 1)", module, sku, op, q),
  ];
}

/** ล็อตที่รายการนี้แตะ (เรียงตามลำดับที่ตัด) — ใบเบิก / ข้อความแจ้งเตือน */
export async function lotMovesOf(c, module, op) {
  if (!op) return [];
  const rows = await all(c, "SELECT l.id, l.recv_date, l.lot_no, l.exp_date, mv.qty FROM rm_lot_moves mv JOIN rm_lots l ON l.id = mv.lot_id " +
    "WHERE mv.module = ? AND mv.op_id = ? ORDER BY mv.id", module, op);
  return rows.map((r) => ({ id: r.id, label: lotLabel(r), recvDate: r.recv_date, lotNo: r.lot_no, expDate: r.exp_date, qty: Math.abs(Number(r.qty)), sign: Number(r.qty) < 0 ? "-" : "+" }));
}
/** "ยอดยกมา 30 · รับ 02/10/69 20" */
export const lotMovesText = (moves) => (moves || []).map((m) => m.label + " " + Number(m.qty).toLocaleString("en-US", { maximumFractionDigits: 3 })).join(" · ");

/** ล็อตที่ยังมีของ แยกตาม SKU (เรียงตามลำดับที่จะถูกตัด) */
export async function lotOpenMap(c, module) {
  const map = {};
  for (const r of await all(c, "SELECT id, sku, recv_date, lot_no, exp_date, qty_in, qty_left FROM rm_lots WHERE module = ? AND qty_left > 0 ORDER BY sku, " + FIFO, module))
    (map[r.sku] || (map[r.sku] = [])).push(r);
  return map;
}
/** แถวล็อต → คำตอบ (ชื่อคีย์ตัวใหญ่แบบเดียวกับรายการวัตถุดิบ) */
export function lotOut(r, ageLimit, now) {
  const age = lotAge(r.recv_date, now);
  return { Id: r.id, RecvDate: r.recv_date, LotNo: r.lot_no, ExpDate: r.exp_date, QtyIn: Number(r.qty_in), Qty: Number(r.qty_left),
           Label: lotLabel(r), AgeDays: age, Old: ageLimit > 0 && age !== null && age > ageLimit };
}

/** วันหมดอายุของรายการ = ตัวที่ใกล้ที่สุด ระหว่างค่าที่ตั้งไว้ที่รายการ กับล็อตที่ยังมีของ */
export function lotEarliestExp(itemExp, lots) {
  let best = String(itemExp || ""), info = expiryInfoTH(best), bd = info ? info.days : Infinity;
  (lots || []).forEach((l) => {
    const e = expiryInfoTH(l.exp_date);
    if (e && e.days < bd) { best = l.exp_date; bd = e.days; }
  });
  return best;
}

/** ล็อตที่รับมาเกิน days วันแล้วยังเหลือ (ยอดยกมาไม่นับ — ไม่รู้วันรับ) — เก่าสุดก่อน */
export async function lotOldList(c, module, days) {
  if (!(days > 0)) return [];
  const now = Date.now();
  return (await all(c, "SELECT l.id, l.sku, l.recv_date, l.lot_no, l.exp_date, l.qty_left, m.name, m.unit FROM rm_lots l " +
    "JOIN materials m ON m.module = l.module AND m.sku = l.sku WHERE l.module = ? AND l.qty_left > 0 AND l.recv_date <> '' AND m.discontinued = 0 " +
    "ORDER BY l.recv_date, l.id", module))
    .map((r) => Object.assign(r, { age: lotAge(r.recv_date, now) }))
    .filter((r) => r.age !== null && r.age > days);
}

/** ล็อตเดียว (ตรวจว่าเป็นของ SKU นี้) */
export const lotGet = (c, module, sku, id) => first(c, "SELECT * FROM rm_lots WHERE id = ? AND module = ? AND sku = ?", Number(id), module, String(sku));
