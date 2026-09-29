// แปลงไฟล์ส่งออกจากชีต (export_all.json) → คำสั่ง SQL สำหรับ D1
//   node tools/export-to-sql.mjs <export_all.json> <out.sql>
// ⚠️ ไฟล์ทั้งสองมีข้อมูลจริง (รวมรหัสผ่านที่ hash แล้ว และโทเคนบอท) — เก็บนอก repo เสมอ ห้าม commit
// จับคู่คอลัมน์ด้วย "ชื่อหัวตาราง" ไม่ใช่ลำดับ เพราะชีตจริงเพิ่มคอลัมน์ทีหลังจนลำดับไม่เหมือนกันทุกแท็บ
import fs from "node:fs";
import crypto from "node:crypto";

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) { console.error("usage: node tools/export-to-sql.mjs <export.json> <out.sql>"); process.exit(1); }
const sheets = JSON.parse(fs.readFileSync(inFile, "utf8")).sheets;

const isDate = (v) => v && typeof v === "object" && v.__date;
const iso = (v) => (isDate(v) ? v.__date : (v === null || v === undefined ? "" : String(v).trim()));          // เวลาเต็ม (UTC)
const dayOnly = (v) => {                                                                                        // วันที่ตามเวลาไทย yyyy-MM-dd
  if (isDate(v)) return String(v.th).slice(0, 10);
  const s = v === null || v === undefined ? "" : String(v).trim();
  if (s.length > 10 && /^\d{4}-\d{2}-\d{2}T/.test(s)) { const ms = Date.parse(s); if (!isNaN(ms)) return new Date(ms + 7 * 3600000).toISOString().slice(0, 10); }
  return s;
};
const isoTime = (v) => {                                                                                        // เวลารายการ → ISO เดียวกันทุกแถว
  if (isDate(v)) return v.__date;
  const s = v === null || v === undefined ? "" : String(v).trim();
  if (!s) return "";
  const ms = Date.parse(s);
  return isNaN(ms) ? s : new Date(ms).toISOString();
};
const str = (v) => (isDate(v) ? v.__date : (v === null || v === undefined ? "" : String(v)));
const numOrNull = (v) => { if (v === "" || v === null || v === undefined || isDate(v)) return null; const n = Number(v); return isFinite(n) ? n : null; };
const num = (v, d = 0) => { const n = numOrNull(v); return n === null ? d : n; };
const bool = (v) => (v === true || String(v).toUpperCase() === "TRUE" ? 1 : 0);
const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");

function table(name) {
  const vals = sheets[name];
  if (!vals || vals.length < 2) return [];
  const head = vals[0].map((h) => String(h || "").trim());
  return vals.slice(1).filter((r) => r.some((v) => v !== "" && v !== null)).map((r) => {
    const o = { _row: r };
    head.forEach((h, i) => { if (h) o[h] = r[i]; });
    return o;
  });
}

const out = [];
const counts = {};
const ins = (tbl, cols, values) => { out.push(`INSERT INTO ${tbl} (${cols.join(", ")}) VALUES (${values.map(q).join(", ")});`); counts[tbl] = (counts[tbl] || 0) + 1; };

[
  "materials", "history", "users", "pending_users", "sessions", "config", "kv", "cr_products", "cr_stock", "cr_lot_history",
  "work_orders", "delivery_notes", "stock_in", "bom", "system_log", "tg_queue",
].forEach((t) => out.push(`DELETE FROM ${t};`));
out.push("DELETE FROM sqlite_sequence;");

// ── วัตถุดิบ + ประวัติ ──
for (const mod of ["SQF", "MLM"]) {
  table(mod + "_Materials").forEach((r, i) => {
    if (!String(r.SKU || "").trim()) return;
    ins("materials",
      ["module", "sku", "name", "qty", "unit", "min", "daily_usage", "expiry_date", "last_verified", "discontinued", "alert_days", "rop_start", "lead_days", "moq", "pack_size", "seq"],
      [mod, String(r.SKU).trim(), str(r.Name), num(r.Qty), str(r.Unit), num(r.Min), num(r.DailyUsage), dayOnly(r.ExpiryDate), isoTime(r.LastVerified), bool(r.Discontinued),
       numOrNull(r.AlertDays), dayOnly(r.RopStart), numOrNull(r.LeadDays), numOrNull(r.Moq), numOrNull(r.PackSize), i + 1]);
  });
  const seenOp = {};
  table(mod + "_History").forEach((r) => {
    let op = str(r.OpId).trim();
    if (op && seenOp[op]) op = "";            // opId ซ้ำในชีต (ไม่ควรมี) → เก็บแถวไว้แต่ไม่ให้ชน unique index
    if (op) seenOp[op] = true;
    const qty = r.Qty === "" || r.Qty === null || r.Qty === undefined ? null : (numOrNull(r.Qty) !== null ? numOrNull(r.Qty) : str(r.Qty));
    ins("history",
      ["module", "ts", "name", "action", "qty", "user", "doc_no", "sku", "unit", "purpose", "op_id", "balance_after", "work_order", "ack_by", "ack_at"],
      [mod, isoTime(r.Timestamp), str(r.Name), str(r.Action), qty, str(r.User), str(r.DocNo).trim(), str(r.SKU).trim(), str(r.Unit), str(r.Purpose), op,
       numOrNull(r.BalanceAfter), str(r.WorkOrder), str(r.AckBy), isoTime(r.AckAt)]);
  });
}

// ── ผู้ใช้ ──
const seenUser = {};
table("AppUsers").forEach((r) => {
  const u = String(r.Username || "").trim();
  if (!u || seenUser[u.toLowerCase()]) return;
  seenUser[u.toLowerCase()] = true;
  ins("users", ["username", "active", "role", "password", "created_at"],
    [u, r.Active === "" || r.Active === undefined ? 1 : bool(r.Active), String(r.Role || "user").trim().toLowerCase() || "user", str(r.Password).trim(), isoTime(r.CreatedAt)]);
});
table("PendingUsers").forEach((r) => {
  const u = String(r.Username || "").trim();
  if (!u) return;
  const role = String(r.RequestedRole !== undefined ? r.RequestedRole : (r._row[5] || "")).trim().toLowerCase();   // คอลัมน์ที่ 6 ไม่มีหัวตารางในชีตจริง
  ins("pending_users", ["username", "requested_at", "status", "reviewed_at", "reviewed_by", "requested_role"],
    [u, isoTime(r.RequestedAt), String(r.Status || "PENDING").trim().toUpperCase(), isoTime(r.ReviewedAt), str(r.ReviewedBy), role || "user"]);
});

// ── ตั้งค่า ──
const seenKey = {};
table("Config").forEach((r) => {
  const k = String(r.Key || "").trim();
  if (!k || seenKey[k] || k === "apiKey") return;   // apiKey: พักไว้ตามข้อตกลง ไม่ย้าย
  seenKey[k] = true;
  ins("config", ["key", "value"], [k, typeof r.Value === "boolean" ? String(r.Value) : str(r.Value).trim()]);
});

// ── ห้องเย็น ──
const seenBc = {};
table("ColdRoom_Products").forEach((r, i) => {
  const bc = String(r.Barcode || "").trim();
  if (!bc || seenBc[bc]) return;
  seenBc[bc] = true;
  ins("cr_products", ["barcode", "product_name", "sku", "default_unit", "shelf_life_days", "warning_pct", "warning_days", "set_name", "units_per_set", "created_at", "seq"],
    [bc, str(r.ProductName), str(r.SKU), str(r.DefaultUnit), numOrNull(r.StandardShelfLifeDays), numOrNull(r.WarningPercentage), str(r.WarningDays), str(r.SetName),
     numOrNull(r.UnitsPerSet), isoTime(r.CreatedAt), i + 1]);
});
let seq = 0;
const lotSeen = {}, rowSeen = {};
const stockRow = (r, archived) => {
  const bc = String(r.Barcode || "").trim();
  if (!bc) return;
  let archivedFlag = archived;
  const mfg = dayOnly(r.MFG), key = bc + "|" + mfg;
  if (!archivedFlag) { if (lotSeen[key]) { console.error("ล็อตซ้ำในชีต (เก็บแถวหลังเป็นประวัติ): " + key); archivedFlag = 1; } else lotSeen[key] = true; }
  let id = String(r.RowID || "").trim();
  if (!id || rowSeen[id]) id = crypto.randomUUID();
  rowSeen[id] = true;
  ins("cr_stock", ["row_id", "barcode", "product_name", "mfg", "exp", "qty", "note", "employee_name", "device_info", "updated_at", "archived", "seq"],
    [id, bc, str(r.ProductName), mfg, dayOnly(r.EXP), num(r.Qty), str(r.Note), str(r.EmployeeName), str(r.DeviceInfo), isoTime(r.UpdatedAt), archivedFlag, ++seq]);
};
table("ColdRoom_Stock_Archive").forEach((r) => stockRow(r, 1));
table("ColdRoom_Stock").forEach((r) => stockRow(r, 0));
const lotOp = {};
table("ColdRoom_LotHistory").forEach((r) => {
  let op = str(r.OpId).trim();
  if (op && lotOp[op]) op = "";
  if (op) lotOp[op] = true;
  ins("cr_lot_history", ["ts", "barcode", "product_name", "mfg", "action", "qty_before", "qty_after", "reason", "employee_name", "device_info", "op_id"],
    [isoTime(r.Timestamp), str(r.Barcode), str(r.ProductName), dayOnly(r.MFG), str(r.Action), numOrNull(r.QtyBefore), numOrNull(r.QtyAfter), str(r.Reason), str(r.EmployeeName), str(r.DeviceInfo), op]);
});
table("ColdRoom_WorkOrders").forEach((r) => {
  if (r.Items === undefined || !String(r.OrderID || "").trim()) return;   // ชีตรูปแบบเก่า (ไม่มีคอลัมน์ Items) ย้ายไม่ได้ — โครงไม่ตรงกับโค้ดปัจจุบันอยู่แล้ว
  ins("work_orders", ["order_id", "date", "items", "note", "created_by", "created_at", "status"],
    [String(r.OrderID).trim(), dayOnly(r.Date), typeof r.Items === "string" ? r.Items : JSON.stringify(r.Items || []), str(r.Note), str(r.CreatedBy), isoTime(r.CreatedAt), str(r.Status) || "รอดำเนินการ"]);
});
table("ColdRoom_DeliveryNotes").forEach((r) => {
  if (!String(r.DeliveryID || "").trim()) return;
  ins("delivery_notes", ["delivery_id", "work_order_id", "items", "submitted_by", "submitted_at", "approved_by", "approved_at", "status", "note"],
    [String(r.DeliveryID).trim(), str(r.WorkOrderID), str(r.Items), str(r.SubmittedBy), isoTime(r.SubmittedAt), str(r.ApprovedBy), isoTime(r.ApprovedAt), str(r.Status), str(r.Note)]);
});
table("ColdRoom_StockIn").forEach((r) => {
  if (!String(r.StockInID || "").trim()) return;
  ins("stock_in", ["stock_in_id", "submitted_by", "submitted_at", "items", "status", "note", "reviewed_by", "reviewed_at"],
    [String(r.StockInID).trim(), str(r.SubmittedBy), isoTime(r.SubmittedAt), str(r.Items), str(r.Status), str(r.Note), str(r.ReviewedBy), isoTime(r.ReviewedAt)]);
});
table("BOM").forEach((r) => {
  if (!String(r.ProductBarcode || "").trim()) return;
  ins("bom", ["bom_id", "product_barcode", "product_name", "factory", "material_sku", "material_name", "qty_per_unit", "unit"],
    [str(r.BomID), String(r.ProductBarcode).trim(), str(r.ProductName), str(r.Factory), str(r.MaterialSKU).trim(), str(r.MaterialName), num(r.QtyPerUnit), str(r.Unit)]);
});
table("System_Log").forEach((r) => {
  ins("system_log", ["ts", "type", "detail", "user", "result"], [isoTime(r.Timestamp), str(r.Type), str(r.Detail), str(r.User) || "-", str(r.Result)]);
});

fs.writeFileSync(outFile, out.join("\n") + "\n");
console.log("เขียน SQL แล้ว:", Object.keys(counts).map((k) => k + "=" + counts[k]).join(" · "));
