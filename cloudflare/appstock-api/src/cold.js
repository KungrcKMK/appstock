// ห้องเย็น: สินค้า · ล็อต (บาร์โค้ด+วันผลิต) · ภาพรวม · นับ/รับ/นำออก · นำเข้าไฟล์ · ใบสั่งผลิต · ส่งยอด/รับยอด · เก็บถาวร
// คำตอบทุกตัวคงรูปแบบเดิมของหลังบ้าน Apps Script
import { all, first, run, stmt, changed, kvGet, kvPut, uuid, getCfg, nowIso, fmtTH, eventTime, qtyStrict, validateQty, ddmmyyToIso, formatCellDate,
         parseLocalDateMs, todayThaiMidnightMs, numOrBlank, deviceTag, tgNotify, tgSettings, cfgSet, DAY_MS } from "./lib.js";
import { getTokenData, verifyApproverToken, verifyAdminToken } from "./auth.js";
import { idleDaysTH, staleDaysOf } from "./raw.js";

const CR_IMPORT_MAX_ROWS = 500;

// ───────────── รูปแบบคำตอบ (ชื่อคีย์ = หัวคอลัมน์ชีตเดิม) ─────────────
const numish = (v) => { if (v === null || v === undefined || v === "") return ""; const n = Number(v); return isFinite(n) && String(v).trim() !== "" ? n : v; };
export const prodOut = (r) => ({
  Barcode: r.barcode, ProductName: r.product_name, SKU: r.sku, DefaultUnit: r.default_unit,
  StandardShelfLifeDays: numOrBlank(r.shelf_life_days), WarningPercentage: numOrBlank(r.warning_pct), WarningDays: numish(r.warning_days),
  SetName: r.set_name, UnitsPerSet: numOrBlank(r.units_per_set), CreatedAt: r.created_at,
});
const stockOut = (r) => ({
  RowID: r.row_id, Barcode: r.barcode, ProductName: r.product_name, MFG: formatCellDate(r.mfg), EXP: formatCellDate(r.exp),
  Qty: r.qty, Note: r.note, EmployeeName: r.employee_name, DeviceInfo: r.device_info, UpdatedAt: r.updated_at,
});
const woOut = (r) => ({ OrderID: r.order_id, Date: r.date, Items: r.items, Note: r.note, CreatedBy: r.created_by, CreatedAt: r.created_at, Status: r.status });
const dnOut = (r) => ({ DeliveryID: r.delivery_id, WorkOrderID: r.work_order_id, Items: r.items, SubmittedBy: r.submitted_by, SubmittedAt: r.submitted_at,
                        ApprovedBy: r.approved_by, ApprovedAt: r.approved_at, Status: r.status, Note: r.note });
const siOut = (r) => ({ StockInID: r.stock_in_id, SubmittedBy: r.submitted_by, SubmittedAt: r.submitted_at, Items: r.items, Status: r.status,
                        Note: r.note, ReviewedBy: r.reviewed_by, ReviewedAt: r.reviewed_at });
const fmtShort = (v) => { const s = fmtTH(v, "dd/MM/yy HH:mm"); return s || String(v || ""); };

const products = (c) => all(c, "SELECT * FROM cr_products ORDER BY seq, rowid");
async function balancesOf(c, barcode) {
  const rows = await all(c, "SELECT * FROM cr_stock WHERE archived = 0 AND barcode = ? AND qty > 0", String(barcode));
  return rows.map(stockOut).sort((a, b) => new Date(a.MFG) - new Date(b.MFG));
}
function lotLogStmt(c, barcode, name, mfgIso, action, before, after, reason, who, opId) {
  return stmt(c,
    "INSERT INTO cr_lot_history (ts, barcode, product_name, mfg, action, qty_before, qty_after, reason, employee_name, device_info, op_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    nowIso(), String(barcode), String(name || ""), mfgIso, action, Number(before) || 0, Number(after) || 0, String(reason || ""), String(who || "-"), c.deviceName || "", String(opId || ""));
}
function findProduct(list, search) {
  for (const p of list) {
    const bc = String(p.barcode || "").toLowerCase(), name = String(p.product_name || "").toLowerCase();
    if (bc === search || name.includes(search)) return p;
  }
  return null;
}

// ───────────── ค้นหาสินค้า + ยอดล็อต ─────────────
export async function crGetProductAndBalances(c, payload) {
  const search = String(payload.barcode || "").trim().toLowerCase();
  const list = await products(c);
  if (!list.length) return { found: false };
  const p = findProduct(list, search);
  if (!p) return { found: false };
  return { found: true, product: prodOut(p), balances: await balancesOf(c, p.barcode) };
}
// รายงานหลายสินค้า — อ่านตารางครั้งเดียว คืนทุกตัวที่ขอ
export async function crGetProductsAndBalancesBulk(c, payload) {
  const keys = ((payload && payload.barcodes) || []).map((b) => String(b || "").trim().toLowerCase()).filter(Boolean).slice(0, 200);
  const list = await products(c);
  const stock = (await all(c, "SELECT * FROM cr_stock WHERE archived = 0 AND qty > 0")).map(stockOut);
  const results = {};
  keys.forEach((k) => {
    const p = findProduct(list, k);
    results[k] = p
      ? { found: true, product: prodOut(p), balances: stock.filter((s) => String(s.Barcode) === String(p.barcode)).sort((a, b) => new Date(a.MFG) - new Date(b.MFG)) }
      : { found: false };
  });
  return { ok: true, results };
}

// ───────────── นับ / รับเข้า (ตั้งยอดล็อต) ─────────────
async function crOpReplay(c, opId) {
  if (!opId) return null;
  try { const hit = await kvGet(c, "op_" + opId); if (hit) return JSON.parse(hit); } catch (e) {}
  const h = await first(c, "SELECT barcode, product_name FROM cr_lot_history WHERE op_id = ?", opId);
  if (!h) return null;
  return { ok: true, duplicate: true, productName: h.product_name, balances: await balancesOf(c, h.barcode) };
}
async function crOpRemember(c, opId, result) {
  if (!opId) return;
  try { await kvPut(c, "op_" + opId, JSON.stringify(Object.assign({}, result, { duplicate: true })), 7 * 86400); } catch (e) {}
}
export async function crSaveOrUpdateCount(c, payload) {
  const { barcode, employeeName, mfg, exp, note } = payload;
  const opId = String(payload.opId || "");
  const seen = await crOpReplay(c, opId);
  if (seen) return seen;
  const newQty = qtyStrict(payload.newQty, true);
  if (isNaN(newQty)) return { ok: false, message: "จำนวนไม่ถูกต้อง (ต้องเป็นตัวเลข 0-9,999,999)" };
  if (!barcode) return { ok: false, message: "ไม่ระบุบาร์โค้ด" };
  const crEventAt = eventTime(payload.clientAt);
  if (!mfg || !exp) return { ok: false, message: "กรุณาระบุวันผลิตและวันหมดอายุ" };
  const mfgIso = ddmmyyToIso(mfg), expIso = ddmmyyToIso(exp);
  if (!mfgIso || !expIso) return { ok: false, message: "รูปแบบวันที่ไม่ถูกต้อง (DDMMYY)" };
  if (expIso <= mfgIso) return { ok: false, message: "วันหมดอายุต้องมากกว่าวันผลิต" };

  const prod = await first(c, "SELECT product_name FROM cr_products WHERE barcode = ?", String(barcode));
  const productName = prod ? prod.product_name : "";
  const lot = await first(c, "SELECT * FROM cr_stock WHERE archived = 0 AND barcode = ? AND mfg = ?", String(barcode), mfgIso);
  const nowStr = nowIso();
  try {
    if (lot) {
      // นับตอนออฟไลน์แล้วส่งทีหลัง ถ้าล็อตถูกแก้หลังเวลานับ = รายการนี้เก่า ไม่ทับ
      const prevQty = Number(lot.qty || 0);
      const updMs = lot.updated_at ? new Date(lot.updated_at).getTime() : NaN;
      if (payload.clientAt && !isNaN(updMs) && updMs > new Date(crEventAt).getTime() + 5000)
        return { ok: false, message: "ล็อตนี้ถูกแก้หลังเวลาที่นับไว้ (ยอดล่าสุด " + prevQty + ") — รายการนับนี้เก่ากว่า ไม่นำมาใช้" };
      await c.env.DB.batch([
        lotLogStmt(c, barcode, productName, mfgIso, "นับ/ปรับยอด", prevQty, newQty, note, employeeName, opId),
        stmt(c, "UPDATE cr_stock SET qty = ?, note = ?, employee_name = ?, device_info = ?, updated_at = ? WHERE row_id = ?",
          Number(newQty), note || "", employeeName || "", c.deviceName || "", nowStr, lot.row_id),
      ]);
      tgNotify(c, `✅ อัปเดตสต๊อก ❄️\n📦 ${productName}\n📅 MFG: ${mfg} | EXP: ${exp}\n🔢 จำนวน: ${newQty}\n👤 ${employeeName}${deviceTag(c)}${note ? "\n💬 " + note : ""}`);
    } else {
      // ไม่พบล็อตเดิม → สร้างใหม่ (สองเครื่องสร้างล็อตเดียวกันพร้อมกัน = แถวเดียว ยอดของคนหลัง)
      await c.env.DB.batch([
        lotLogStmt(c, barcode, productName, mfgIso, "รับเข้า (ล็อตใหม่)", 0, newQty, note, employeeName, opId),
        stmt(c,
          "INSERT INTO cr_stock (row_id, barcode, product_name, mfg, exp, qty, note, employee_name, device_info, updated_at, seq) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM cr_stock)) " +
          "ON CONFLICT(barcode, mfg) WHERE archived = 0 DO UPDATE SET qty = excluded.qty, note = excluded.note, " +
          "employee_name = excluded.employee_name, device_info = excluded.device_info, updated_at = excluded.updated_at",
          uuid(), String(barcode), productName, mfgIso, expIso, Number(newQty), note || "", employeeName || "", c.deviceName || "", nowStr),
      ]);
      tgNotify(c, `✅ รับเข้าสต๊อก ❄️\n📦 ${productName}\n📅 MFG: ${mfg} | EXP: ${exp}\n🔢 จำนวน: ${newQty}\n👤 ${employeeName}${deviceTag(c)}${note ? "\n💬 " + note : ""}`);
    }
  } catch (e) {
    const again = await crOpReplay(c, opId);   // opId ซ้ำ (คำขอเดียวกันมาถึงซ้อนกัน)
    if (again) return again;
    throw e;
  }
  const res = { ok: true, productName, balances: await balancesOf(c, barcode) };
  await crOpRemember(c, opId, res);
  return res;
}

export async function crClearLotStock(c, payload) {
  const { barcode, mfg, reason, employeeName } = payload;
  const mfgIso = (typeof mfg === "string" && mfg.includes("-")) ? mfg : ddmmyyToIso(mfg);
  const lot = await first(c, "SELECT * FROM cr_stock WHERE archived = 0 AND barcode = ? AND mfg = ?", String(barcode), String(mfgIso).slice(0, 10));
  if (!lot) return { ok: false, message: "ไม่พบรายการ" };
  await c.env.DB.batch([
    lotLogStmt(c, barcode, lot.product_name, lot.mfg, "นำออก", Number(lot.qty || 0), 0, reason, employeeName, ""),
    stmt(c, "UPDATE cr_stock SET qty = 0, note = ?, employee_name = ?, device_info = ?, updated_at = ? WHERE row_id = ?",
      "นำออก: " + reason, employeeName || "", c.deviceName || "", nowIso(), lot.row_id),
  ]);
  const tg = tgNotify(c, "🗑️ นำสินค้าออกสต๊อก ❄️\n📦 " + lot.product_name + "\n📅 MFG: " + mfg + "\n💬 " + (reason || "-") + "\n👤 " + (employeeName || "-") + deviceTag(c));
  return { ok: true, tgSent: tg ? tg.sent : false, tgError: null };
}

// ───────────── นำเข้าล็อตจากไฟล์ ─────────────
//   ล็อตระบุตัวด้วย บาร์โค้ด+วันผลิต · จับคู่สินค้าจากบาร์โค้ดก่อน ไม่เจอค่อยลองชื่อ
//   ไม่สร้างสินค้าใหม่ให้ · dryRun: ตรวจทุกอย่างเหมือนจริงแต่ไม่เขียน (หน้าจอใช้ทำตารางพรีวิว)
export async function crImportLots(c, payload) {
  const mode = payload.mode === "overwrite" ? "overwrite" : "skip";
  const dry = payload.dryRun === true;
  const who = String(payload.employeeName || "-");
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!rows.length) return { ok: false, message: "ไม่มีข้อมูลในไฟล์" };
  if (rows.length > CR_IMPORT_MAX_ROWS) return { ok: false, message: "นำเข้าได้ครั้งละไม่เกิน " + CR_IMPORT_MAX_ROWS + " แถว" };

  const byBarcode = {}, byName = {};
  (await products(c)).forEach((p) => {
    const bc = String(p.barcode).trim(), nm = String(p.product_name).trim();
    if (bc) byBarcode[bc] = { barcode: bc, name: nm };
    if (nm) byName[nm] = { barcode: bc, name: nm };
  });
  const lotAt = {};
  (await all(c, "SELECT row_id, barcode, mfg, qty FROM cr_stock WHERE archived = 0")).forEach((s) => { lotAt[String(s.barcode) + "|" + formatCellDate(s.mfg)] = s; });

  const results = [], seen = {}, stmts = [];
  let added = 0, updated = 0, skipped = 0, errors = 0, seq = 0;
  const nowStr = nowIso();
  const mx = await first(c, "SELECT COALESCE(MAX(seq), 0) AS n FROM cr_stock");
  seq = (mx && mx.n) || 0;

  rows.forEach((row, idx) => {
    const out = { i: idx };
    const fail = (msg) => { out.status = "error"; out.message = msg; errors++; results.push(out); };
    const bc = String(row.barcode || "").trim(), nm = String(row.name || "").trim();
    const prod = (bc && byBarcode[bc]) || (nm && byName[nm]) || null;
    if (!prod) return fail(bc || nm ? "ไม่พบสินค้านี้ในระบบ — สร้างที่แท็บจัดการสินค้าก่อน" : "ไม่ระบุบาร์โค้ด/ชื่อสินค้า");
    out.name = prod.name;
    const qty = Number(row.qty);
    if (!isFinite(qty) || qty <= 0) return fail("จำนวนต้องเป็นตัวเลขมากกว่า 0");
    const mfg = String(row.mfg || "").trim(), exp = String(row.exp || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(mfg)) return fail("วันผลิตไม่ถูกต้อง");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return fail("วันหมดอายุไม่ถูกต้อง");
    if (exp <= mfg) return fail("วันหมดอายุต้องอยู่หลังวันผลิต");
    const key = prod.barcode + "|" + mfg;
    if (seen[key]) return fail("ซ้ำกับแถวก่อนหน้าในไฟล์ (สินค้า+วันผลิตเดียวกัน)");
    seen[key] = true;

    if (lotAt[key]) {
      if (mode === "skip") { out.status = "skipped"; skipped++; }
      else {
        out.status = "updated"; updated++;
        if (!dry) {
          stmts.push(lotLogStmt(c, prod.barcode, prod.name, mfg, "นำเข้าจากไฟล์ (ทับ)", Number(lotAt[key].qty || 0), qty, "", who, ""));
          stmts.push(stmt(c, "UPDATE cr_stock SET qty = ?, exp = ?, note = ?, employee_name = ?, device_info = ?, updated_at = ? WHERE row_id = ?",
            qty, exp, "นำเข้าจากไฟล์ (ทับ)", who, c.deviceName || "", nowStr, lotAt[key].row_id));
        }
      }
    } else {
      out.status = "added"; added++;
      if (!dry) {
        seq++;
        stmts.push(lotLogStmt(c, prod.barcode, prod.name, mfg, "นำเข้าจากไฟล์ (ใหม่)", 0, qty, "", who, ""));
        stmts.push(stmt(c,
          "INSERT INTO cr_stock (row_id, barcode, product_name, mfg, exp, qty, note, employee_name, device_info, updated_at, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          uuid(), prod.barcode, prod.name, mfg, exp, qty, "นำเข้าจากไฟล์", who, c.deviceName || "", nowStr, seq));
      }
    }
    results.push(out);
  });

  for (let i = 0; i < stmts.length; i += 80) await c.env.DB.batch(stmts.slice(i, i + 80));
  if (!dry && (added || updated))
    tgNotify(c, "📥 นำเข้าห้องเย็นจากไฟล์ ❄️\n➕ ล็อตใหม่ " + added + " · ✏️ เขียนทับ " + updated + (skipped ? " · ข้าม " + skipped : "") + "\n👤 " + who + deviceTag(c));
  return { ok: true, dryRun: dry, added, updated, skipped, errors, results };
}

// ───────────── สินค้า ─────────────
export async function crSaveNewProduct(c, payload) {
  const { barcode, productName, sku, defaultUnit, standardShelfLifeDays, warningPercentage, warningDays, setName, unitsPerSet } = payload;
  if (!barcode || !productName) return { ok: false, message: "ข้อมูลไม่ครบ" };
  if (standardShelfLifeDays !== "" && standardShelfLifeDays !== undefined) {
    const shelfVal = Number(standardShelfLifeDays);
    if (isNaN(shelfVal) || shelfVal <= 0 || shelfVal > 3650) return { ok: false, message: "อายุสินค้า (shelf life) ต้องอยู่ระหว่าง 1-3650 วัน" };
  }
  if (await first(c, "SELECT 1 AS x FROM cr_products WHERE trim(barcode) = trim(?)", String(barcode))) return { ok: false, message: "บาร์โค้ดนี้มีในระบบแล้ว" };
  if (sku && await first(c, "SELECT 1 AS x FROM cr_products WHERE lower(trim(sku)) = lower(trim(?))", String(sku))) return { ok: false, message: "SKU นี้มีในระบบแล้ว" };
  const r = await run(c,
    "INSERT OR IGNORE INTO cr_products (barcode, product_name, sku, default_unit, shelf_life_days, warning_pct, warning_days, set_name, units_per_set, created_at, seq) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM cr_products))",
    String(barcode), String(productName), String(sku || ""), String(defaultUnit || ""), Number(standardShelfLifeDays) || 10,
    Number(warningPercentage) || 20, String(warningDays == null ? "" : warningDays), String(setName || ""), Number(unitsPerSet) || 1, nowIso());
  if (!changed(r)) return { ok: false, message: "บาร์โค้ดนี้มีในระบบแล้ว" };
  return { ok: true };
}
export async function crUpdateProduct(c, payload) {
  const { barcode, productName, sku, defaultUnit, standardShelfLifeDays, warningPercentage, warningDays, setName, unitsPerSet } = payload;
  if (!barcode || !productName) return { ok: false, message: "ข้อมูลไม่ครบ" };
  const r = await run(c,
    "UPDATE cr_products SET product_name = ?, sku = ?, default_unit = ?, shelf_life_days = ?, warning_pct = ?, warning_days = ?, set_name = ?, units_per_set = ? WHERE barcode = ?",
    String(productName), String(sku || ""), String(defaultUnit || ""), Number(standardShelfLifeDays) || 10, Number(warningPercentage) || 20,
    String(warningDays == null ? "" : warningDays), String(setName || ""), Number(unitsPerSet) || 1, String(barcode));
  if (!changed(r)) return { ok: false, message: "ไม่พบสินค้าในระบบ (barcode: " + barcode + ")" };
  return { ok: true };
}
export async function crGetColdRoomProducts(c) {
  return { ok: true, products: (await products(c)).map(prodOut) };
}

// ───────────── ภาพรวมห้องเย็น ─────────────
// ───────────── ⏰ ล็อตที่ไม่มีการอัปเดตเกินกำหนด ─────────────
// "อัปเดต" ของล็อต = มีคนนับ/เบิก/รับเข้า/นำเข้า (ทุกอย่างลง cr_lot_history และแตะ updated_at)
// updated_at ของแถวเก่าจากชีตบางแถวเพี้ยน (เป็นชื่อเครื่องแทนเวลา) → เชื่อเฉพาะค่าที่เป็นเวลาจริง แล้วเทียบกับประวัติล็อต
async function crLotLastUpdate(c, stock) {
  const out = {};
  const put = (k, t) => { if (isFinite(t) && (!out[k] || t > out[k])) out[k] = t; };
  for (const r of await all(c, "SELECT barcode, mfg, MAX(ts) AS t FROM cr_lot_history GROUP BY barcode, mfg"))
    put(String(r.barcode) + "|" + String(r.mfg).slice(0, 10), r.t ? new Date(r.t).getTime() : NaN);
  for (const r of stock)
    if (/^\d{4}-\d{2}-\d{2}T/.test(String(r.updated_at || ""))) put(String(r.barcode) + "|" + String(r.mfg).slice(0, 10), new Date(r.updated_at).getTime());
  return out;
}

export async function crGetStartupOverview(c, payload) {
  const lite = !!(payload && payload.lite);
  const stock = await all(c, "SELECT * FROM cr_stock WHERE archived = 0 AND qty > 0 ORDER BY seq, rowid");
  const staleDays = staleDaysOf(await getCfg(c)), lastUpd = await crLotLastUpdate(c, stock), nowMs = Date.now();
  let staleCount = 0;
  const today = todayThaiMidnightMs();
  const warnMap = {}, unitMap = {};
  (await products(c)).forEach((p) => {
    const bc = String(p.barcode);
    warnMap[bc] = { shelfLife: Number(p.shelf_life_days) || 10, warnPct: Number(p.warning_pct) || 20, warnDays: p.warning_days };
    unitMap[bc] = p.default_unit || "";
  });
  const allLots = [], productTotals = {};
  let expiringCount = 0, expiredCount = 0;
  for (const row of stock) {
    const qty = Number(row.qty || 0);
    const barcode = String(row.barcode || ""), productName = String(row.product_name || "");
    const mfg = formatCellDate(row.mfg), exp = formatCellDate(row.exp), unit = unitMap[barcode] || "";
    const expireDays = Math.round((parseLocalDateMs(exp) - today) / DAY_MS);
    const warn = warnMap[barcode] || { shelfLife: 10, warnPct: 20, warnDays: "" };
    const threshold = warn.warnDays ? Number(warn.warnDays) : Math.ceil(warn.shelfLife * warn.warnPct / 100);
    let expireStatus = "ปกติ", qcStatus = "✅ ผ่าน";
    if (expireDays < 0) { expireStatus = "หมดอายุ"; qcStatus = "❌ หมดอายุ"; expiredCount++; }
    else if (expireDays <= threshold) { expireStatus = "ใกล้หมดอายุ"; qcStatus = "⚠️ ใกล้หมด"; expiringCount++; }
    const lu = lastUpd[barcode + "|" + String(row.mfg).slice(0, 10)];
    const idle = idleDaysTH(lu, nowMs);
    const isStale = staleDays > 0 && (idle === null || idle > staleDays);
    if (isStale) staleCount++;
    allLots.push({ Barcode: barcode, ProductName: productName, MFG: mfg, EXP: exp, Qty: qty, Unit: unit, ExpireDays: expireDays, ExpireStatus: expireStatus, QcShelfLifeStatus: qcStatus,
                   LastUpdate: lu ? new Date(lu).toISOString() : "", IdleDays: idle, Stale: isStale });
    if (!productTotals[barcode]) productTotals[barcode] = { ProductName: productName, TotalQty: 0, Unit: unit, LotCount: 0 };
    productTotals[barcode].TotalQty += qty;
    productTotals[barcode].LotCount++;
  }
  const summary = { totalProducts: Object.keys(productTotals).length, totalLots: allLots.length, expiringLots: expiringCount, expiredLots: expiredCount, staleLots: staleCount };
  if (lite) return { ok: true, allLots, summary, staleDays };   // มือถือใช้แค่นี้
  return {
    ok: true, allLots, summary, staleDays,
    staleLots: allLots.filter((l) => l.Stale).sort((a, b) => (b.IdleDays === null ? 1e9 : b.IdleDays) - (a.IdleDays === null ? 1e9 : a.IdleDays)),
    totalByProduct: Object.values(productTotals),
    expiringLots: allLots.filter((l) => l.ExpireStatus === "ใกล้หมดอายุ").sort((a, b) => a.ExpireDays - b.ExpireDays),
    expiredLots: allLots.filter((l) => l.ExpireStatus === "หมดอายุ").sort((a, b) => a.ExpireDays - b.ExpireDays),
  };
}

export async function crGetLotHistory(c, payload) {
  const bc = String((payload && payload.barcode) || "");
  const rows = await all(c, "SELECT * FROM cr_lot_history ORDER BY id DESC LIMIT 400");
  const out = [];
  for (const r of rows) {
    if (bc && String(r.barcode) !== bc) continue;
    out.push({ Timestamp: r.ts, Barcode: r.barcode, ProductName: r.product_name, MFG: r.mfg, Action: r.action, QtyBefore: r.qty_before,
               QtyAfter: r.qty_after, Reason: r.reason, EmployeeName: r.employee_name, DeviceInfo: r.device_info, OpId: r.op_id });
    if (out.length >= 200) break;
  }
  return { ok: true, rows: out };
}

// ───────────── ตั้งค่าแจ้งเตือน Telegram ─────────────
// โทเคนบอทเป็นความลับ — ส่งให้เฉพาะ admin ที่มีบัตรผ่าน (ของเดิมใครเรียกก็ได้โทเคนไป)
export async function crGetAlertSettings(c, payload, data) {
  const s = await tgSettings(c);
  const sess = await getTokenData(c, (data && data.sessionToken) || (payload && payload.adminToken) || "");
  if (!sess || sess.r !== "admin") return { ok: true, settings: { telegramBotName: s.telegramBotName, telegramBotToken: "", telegramChatIds: "", enableTelegramStockUpdate: s.enableTelegramStockUpdate }, masked: true };
  return { ok: true, settings: s };
}
export async function crSaveAlertSettings(c, payload) {
  for (const key of ["telegramBotName", "telegramBotToken", "telegramChatIds", "enableTelegramStockUpdate"])
    await cfgSet(c, key, payload[key] !== undefined ? payload[key] : "");
  return { ok: true };
}

// ───────────── ใบสั่งผลิต ─────────────
export async function crSaveWorkOrder(c, payload) {
  const { orderId, date, note, createdBy } = payload;
  const items = payload.items;
  if (!orderId || !Array.isArray(items) || !items.length) return { ok: false, message: "ข้อมูลไม่ครบ" };
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (!it.barcode || !it.name) return { ok: false, message: "รายการสินค้าไม่ครบ (ข้อ " + (k + 1) + ")" };
    const qv = qtyStrict(it.qty, true);
    if (isNaN(qv) || qv <= 0) return { ok: false, message: "จำนวนต้องเป็นตัวเลขมากกว่า 0 (ข้อ " + (k + 1) + ")" };
  }
  const summary = items.map((i) => `${i.name} (${i.mfg}) x${i.qty}`).join(", ");
  await run(c, "INSERT INTO work_orders (order_id, date, items, note, created_by, created_at, status) VALUES (?, ?, ?, ?, ?, ?, 'รอดำเนินการ')",
    String(orderId), String(date || nowIso().slice(0, 10)), JSON.stringify(items), String(note || ""), String(createdBy || ""), nowIso());
  tgNotify(c, `📋 ใบสั่งผลิตใหม่\n🔖 ${orderId}\n${summary}\n👤 ${createdBy}${deviceTag(c)}`);
  return { ok: true };
}
export async function crDeleteWorkOrder(c, payload) {
  const orderId = String(payload.orderId || "").trim(), username = String(payload.username || payload.user || "").trim();
  if (!orderId) return { ok: false, message: "ไม่ระบุรหัสใบสั่งผลิต" };
  const wo = await first(c, "SELECT id, status FROM work_orders WHERE order_id = ? ORDER BY id LIMIT 1", orderId);
  if (!wo) return { ok: false, message: "ไม่พบใบสั่งผลิต " + orderId };
  if (String(wo.status || "รอดำเนินการ") === "เสร็จสิ้น") return { ok: false, message: "ไม่สามารถลบได้ — ใบสั่งผลิตเสร็จสิ้นแล้ว" };
  await run(c, "DELETE FROM work_orders WHERE id = ?", wo.id);
  tgNotify(c, "🗑️ ลบใบสั่งผลิต\n🔖 " + orderId + "\n👤 " + username + deviceTag(c));
  return { ok: true };
}
export async function crGetWorkOrders(c) {
  const rows = await all(c, "SELECT * FROM work_orders ORDER BY id DESC LIMIT 50");
  return { ok: true, orders: rows.map(woOut) };
}

// ───────────── ส่งยอดผลิตเข้าห้องเย็น ─────────────
async function addDeliveryToStock(c, item, submittedBy, approvedBy) {
  const barcode = String(item.barcode || "").trim();
  const mfg = String(item.mfg || "").trim(), exp = String(item.exp || "").trim();
  const qty = validateQty(item.qty, true);
  if (!barcode || qty <= 0) return;
  const note = "ส่งยอดโดย: " + submittedBy + " | อนุมัติ: " + approvedBy;
  const mfgIso = mfg.includes("-") ? mfg.slice(0, 10) : ddmmyyToIso(mfg);
  const expIso = exp.includes("-") ? exp.slice(0, 10) : ddmmyyToIso(exp);
  const prod = await first(c, "SELECT product_name FROM cr_products WHERE barcode = ?", barcode);
  const productName = (prod && String(prod.product_name)) || String(item.name || "");
  const lot = await first(c, "SELECT qty FROM cr_stock WHERE archived = 0 AND barcode = ? AND mfg = ?", barcode, mfgIso);
  const before = lot ? Number(lot.qty || 0) : 0;
  await c.env.DB.batch([
    lotLogStmt(c, barcode, productName, mfgIso, "ส่งยอดผลิตเข้าคลัง", before, before + qty, note, submittedBy, ""),
    stmt(c,
      "INSERT INTO cr_stock (row_id, barcode, product_name, mfg, exp, qty, note, employee_name, device_info, updated_at, seq) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DeliveryApproval', ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM cr_stock)) " +
      "ON CONFLICT(barcode, mfg) WHERE archived = 0 DO UPDATE SET qty = cr_stock.qty + excluded.qty, note = excluded.note, " +
      "employee_name = excluded.employee_name, device_info = 'DeliveryApproval', updated_at = excluded.updated_at",
      uuid(), barcode, productName, mfgIso, expIso, qty, note, submittedBy, nowIso()),
  ]);
}

export async function submitDelivery(c, payload) {
  const username = String(payload.username || "").trim(), woId = String(payload.workOrderID || "").trim();
  const items = payload.items || [], note = String(payload.note || "").trim();
  if (!username || !woId || !items.length) return { ok: false, message: "ข้อมูลไม่ครบ" };
  const wo = await first(c, "SELECT id, status FROM work_orders WHERE order_id = ? ORDER BY id LIMIT 1", woId);
  if (!wo) return { ok: false, message: "ไม่พบใบสั่งผลิต " + woId };
  if (String(wo.status || "รอดำเนินการ") === "เสร็จสิ้น") return { ok: false, message: "ใบสั่งผลิตนี้อนุมัติแล้ว ไม่สามารถแก้ไขได้" };
  const dn = await first(c, "SELECT id, delivery_id, status FROM delivery_notes WHERE work_order_id = ? ORDER BY id LIMIT 1", woId);
  if (dn && String(dn.status) === "อนุมัติแล้ว") return { ok: false, message: "ใบส่งยอดนี้อนุมัติแล้ว ไม่สามารถแก้ไขได้" };

  // จองใบสั่งผลิตก่อน (อะตอมมิก) — สองคนกดส่งยอดใบเดียวกันพร้อมกัน ยอดเข้าคลังครั้งเดียว
  const lockWo = await run(c, "UPDATE work_orders SET status = 'เสร็จสิ้น' WHERE id = ? AND status <> 'เสร็จสิ้น'", wo.id);
  if (!changed(lockWo)) return { ok: false, message: "ใบสั่งผลิตนี้อนุมัติแล้ว ไม่สามารถแก้ไขได้" };

  const now = nowIso(), itemsJson = JSON.stringify(items);
  let dnId;
  if (dn) {
    dnId = String(dn.delivery_id);
    await run(c, "UPDATE delivery_notes SET items = ?, submitted_by = ?, submitted_at = ?, status = 'อนุมัติแล้ว', note = ?, approved_by = ?, approved_at = ? WHERE id = ?",
      itemsJson, username, now, note, username, now, dn.id);
  } else {
    dnId = "DN-" + uuid().slice(0, 8).toUpperCase();
    await run(c, "INSERT INTO delivery_notes (delivery_id, work_order_id, items, submitted_by, submitted_at, approved_by, approved_at, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, 'อนุมัติแล้ว', ?)",
      dnId, woId, itemsJson, username, now, username, now, note);
  }
  // เพิ่มยอดเข้าคลังห้องเย็นทันที (ไม่มีขั้นรออนุมัติ — งานต้อง Flow)
  const stockErrors = [];
  for (const item of items) {
    try { await addDeliveryToStock(c, item, username, username); } catch (e) { stockErrors.push(String(item.name || "") + ": " + String(e)); }
  }
  tgNotify(c, "📦 ส่งยอดเข้าห้องเย็น\n🔖 " + woId + "\n👤 " + username + "\nยอดเข้าคลังอัตโนมัติ" + deviceTag(c));
  return stockErrors.length ? { ok: true, dnId, warnings: stockErrors } : { ok: true, dnId };
}

export async function getDeliveries(c, payload, data) {
  const filterStatus = payload.filterStatus || "";
  const token = (data && data.sessionToken) || payload.adminToken || "";
  const sess = await getTokenData(c, token);
  const username = String((sess && sess.n) || payload.username || "").trim();
  const isApprover = await verifyApproverToken(c, token);
  const rows = await all(c, "SELECT * FROM delivery_notes ORDER BY id");
  let deliveries = [];
  for (const r of rows) {
    const status = String(r.status || ""), submitter = String(r.submitted_by || "");
    if (!isApprover && submitter.toLowerCase() !== username.toLowerCase()) continue;
    if (filterStatus && status !== filterStatus) continue;
    const dn = dnOut(r);
    dn.SubmittedAtFmt = fmtShort(dn.SubmittedAt);
    if (dn.ApprovedAt) dn.ApprovedAtFmt = fmtShort(dn.ApprovedAt);
    deliveries.push(dn);
  }
  deliveries.sort((a, b) => new Date(b.SubmittedAt) - new Date(a.SubmittedAt));
  return { ok: true, deliveries: deliveries.slice(0, 100) };
}

// ───────────── รับสินค้าตรงจากฝ่ายผลิต ─────────────
export async function submitStockIn(c, payload) {
  const username = String(payload.username || "").trim(), items = payload.items || [], note = String(payload.note || "").trim();
  if (!username || !items.length) return { ok: false, message: "ข้อมูลไม่ครบ" };
  const id = "SI-" + uuid().slice(0, 8).toUpperCase();
  await run(c, "INSERT INTO stock_in (stock_in_id, submitted_by, submitted_at, items, status, note) VALUES (?, ?, ?, ?, 'รอตรวจยอด', ?)",
    id, username, nowIso(), JSON.stringify(items), note);
  tgNotify(c, "📥 รายการรับสินค้าใหม่\n🔖 " + id + "\n👤 " + username + "\nรายการ " + items.length + " รายการ รอตรวจยอด" + deviceTag(c));
  return { ok: true, stockInID: id };
}
export async function getStockInList(c, payload) {
  const filterStatus = String(payload.filterStatus || "");
  const rows = await all(c, "SELECT * FROM stock_in ORDER BY id");
  let list = [];
  for (const r of rows) {
    const rec = siOut(r);
    if (filterStatus && rec.Status !== filterStatus) continue;
    rec.SubmittedAtFmt = fmtShort(rec.SubmittedAt);
    if (rec.ReviewedAt) rec.ReviewedAtFmt = fmtShort(rec.ReviewedAt);
    list.push(rec);
  }
  list.sort((a, b) => new Date(b.SubmittedAt) - new Date(a.SubmittedAt));
  return { ok: true, list: list.slice(0, 100) };
}
export async function reviewStockIn(c, payload) {
  const username = String(payload.username || "").trim(), siId = String(payload.stockInID || "").trim();
  const action = String(payload.action || "approve");
  const items = payload.items || null;
  if (!username || !siId) return { ok: false, message: "ข้อมูลไม่ครบ" };
  const si = await first(c, "SELECT * FROM stock_in WHERE stock_in_id = ?", siId);
  if (!si) return { ok: false, message: "ไม่พบรายการ " + siId };
  if (String(si.status) !== "รอตรวจยอด") return { ok: false, message: "รายการนี้ดำเนินการแล้ว" };
  const now = nowIso();
  if (action === "cancel") {
    const r = await run(c, "UPDATE stock_in SET status = 'ยกเลิก', reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'รอตรวจยอด'", username, now, si.id);
    if (!changed(r)) return { ok: false, message: "รายการนี้ดำเนินการแล้ว" };
    tgNotify(c, "❌ ยกเลิกรายการรับสินค้า\n🔖 " + siId + "\n👤 โดย: " + username + deviceTag(c));
    return { ok: true };
  }
  let origItems; try { origItems = JSON.parse(String(si.items || "[]")); } catch (e) { origItems = []; }
  const finalItems = items || origItems;
  // จองรายการก่อน (อะตอมมิก) — สองคนกดยืนยันพร้อมกัน ยอดเข้าคลังครั้งเดียว
  const r = await run(c, "UPDATE stock_in SET items = ?, status = 'เข้าคลังแล้ว', reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'รอตรวจยอด'",
    JSON.stringify(finalItems), username, now, si.id);
  if (!changed(r)) return { ok: false, message: "รายการนี้ดำเนินการแล้ว" };
  const stockErrors = [];
  for (const item of finalItems) {
    try { await addDeliveryToStock(c, item, String(si.submitted_by || ""), username); } catch (e) { stockErrors.push(String(item.name || "") + ": " + String(e)); }
  }
  tgNotify(c, "✅ ยืนยันเข้าคลัง\n🔖 " + siId + "\n👤 ตรวจโดย: " + username + "\nยอดเข้าคลังห้องเย็นแล้ว" + deviceTag(c));
  return stockErrors.length ? { ok: true, warnings: stockErrors } : { ok: true };
}

// ───────────── เก็บถาวร: ล็อตที่ยอดเป็น 0 หรือหมดอายุเกิน 6 เดือน ─────────────
export async function archiveOldStock(c, payload) {
  if (payload && payload.adminToken && !(await verifyAdminToken(c, payload.adminToken))) return { ok: false, message: "ไม่มีสิทธิ์" };
  const t = new Date(todayThaiMidnightMs() + 7 * 3600000);   // วันนี้ตามเวลาไทย (อ่านด้วย getUTC*)
  const six = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 6, t.getUTCDate()));
  const cutoff = six.toISOString().slice(0, 10);
  const r = await run(c, "UPDATE cr_stock SET archived = 1 WHERE archived = 0 AND (qty <= 0 OR (exp <> '' AND substr(exp, 1, 10) < ?))", cutoff);
  const n = changed(r);
  if (!n && !(await first(c, "SELECT 1 AS x FROM cr_stock WHERE archived = 0"))) return { ok: true, archived: 0, message: "ไม่มีข้อมูล" };
  return { ok: true, archived: n, message: "ย้าย " + n + " รายการไป Archive แล้ว" };
}
