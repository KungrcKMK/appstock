// กู้ฐานข้อมูลจากไฟล์สำรองรายวัน (R2 appstock-backups/backups/Backup_*.json) → คำสั่ง SQL สำหรับฐานข้อมูลว่าง
//   1) wrangler r2 object get appstock-backups/backups/<ไฟล์>.json --remote --file <โฟลเดอร์นอก repo>/backup.json
//   2) node tools/restore-from-backup.mjs <backup.json> <out.sql>
//   3) ฐานข้อมูลว่าง: wrangler d1 execute appstock --local --persist-to <dir> --file schema.sql  แล้ว  --file <out.sql>
//   ขั้นตอนเต็ม + ผลซ้อม: docs/ARCHITECTURE.md หัวข้อ "สำรองข้อมูล"
// ⚠️ ไฟล์สำรองและ out.sql มีข้อมูลจริง (รหัสผ่านที่ hash แล้ว โทเคนบอท) — เก็บนอก repo เสมอ ห้าม commit
// ⚠️ out.sql เป็น INSERT ล้วน ใช้กับฐานข้อมูลว่างเท่านั้น — ยิงใส่ฐานจริงที่มีข้อมูลอยู่ = รหัสชนกัน/ข้อมูลซ้อน
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) { console.error("usage: node tools/restore-from-backup.mjs <backup.json> <out.sql>"); process.exit(1); }
const rel = path.relative(fileURLToPath(new URL("../../../", import.meta.url)), path.resolve(outFile));   // ใช้ได้ทั้ง Windows และ Linux (CI)
if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
  console.error("out.sql ต้องอยู่นอก repo (repo สาธารณะ และ hook commit ทุกไฟล์)"); process.exit(1);
}

// ชื่อแผ่นในไฟล์สำรอง → ตาราง (คู่กับ SHEETS ใน src/system.js — เพิ่มแผ่นใหม่ที่นั่นแล้วต้องเพิ่มที่นี่ ไม่งั้นเครื่องมือหยุดเอง)
const TABLE = {
  SQF_Materials: "materials", MLM_Materials: "materials", SQF_History: "history", MLM_History: "history",
  RM_Lots: "rm_lots", RM_LotMoves: "rm_lot_moves",
  ColdRoom_Products: "cr_products", ColdRoom_Stock: "cr_stock", ColdRoom_Stock_Archive: "cr_stock", ColdRoom_LotHistory: "cr_lot_history",
  ColdRoom_WorkOrders: "work_orders", ColdRoom_DeliveryNotes: "delivery_notes", ColdRoom_StockIn: "stock_in",
  BOM: "bom", AppUsers: "users", PendingUsers: "pending_users", Config: "config", System_Log: "system_log",
};
const SKIP = ["sessions", "kv", "tg_queue"];   // ไม่อยู่ในไฟล์สำรองโดยตั้งใจ: บัตรผ่าน (ทุกคนเข้าระบบใหม่) · ค่าชั่วคราว · คิว Telegram
const DROP = { rm_lots: ["name", "unit"] };    // RM_Lots ส่งออกพร้อมชื่อ/หน่วยจาก materials ไว้อ่านในชีต ไม่ใช่คอลัมน์ของตาราง

// ไฟล์สำรองเขียน NULL เป็น "" (exportSheets) → คืนเป็น NULL เฉพาะคอลัมน์ที่ schema ยอมให้ว่าง
const schema = fs.readFileSync(new URL("../schema.sql", import.meta.url), "utf8").replace(/--[^\n]*/g, "");
const NULLABLE = {}, ALL = [];
for (const m of schema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\);/g)) {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of m[2]) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && !depth) { parts.push(cur); cur = ""; } else cur += ch; }
  parts.push(cur);
  ALL.push(m[1]);
  NULLABLE[m[1]] = new Set(parts.map((p) => p.trim()).filter((p) => p && !/^(PRIMARY|UNIQUE|FOREIGN)/i.test(p) && !/NOT NULL|PRIMARY KEY/i.test(p)).map((p) => p.split(/\s+/)[0]));
}

const sheets = JSON.parse(fs.readFileSync(inFile, "utf8")).sheets || {};
const unknown = Object.keys(sheets).filter((s) => !TABLE[s]);
if (unknown.length) { console.error("ไฟล์สำรองมีแผ่นที่เครื่องมือไม่รู้จัก: " + unknown.join(", ") + " — เพิ่มใน TABLE ก่อน"); process.exit(1); }
const missing = ALL.filter((t) => !SKIP.includes(t) && !Object.values(TABLE).includes(t));
if (missing.length) { console.error("ตารางใน schema ที่ไม่มีในไฟล์สำรอง: " + missing.join(", ") + " — เพิ่มใน SHEETS (src/system.js) + TABLE"); process.exit(1); }

const q = (v) => (v === null ? "NULL" : typeof v === "number" ? String(v) : typeof v === "boolean" ? (v ? "1" : "0") : "'" + String(v).replace(/'/g, "''") + "'");
const out = ["-- กู้จาก " + inFile.split(/[\\/]/).pop()], count = {};
for (const [sheet, rows] of Object.entries(sheets)) {
  const table = TABLE[sheet];
  if (!rows || rows.length < 2) { count[table] = count[table] || 0; continue; }
  const head = rows[0], drop = DROP[table] || [], keep = head.map((h, i) => (drop.includes(h) ? -1 : i)).filter((i) => i >= 0);
  const nul = NULLABLE[table] || new Set();
  for (const r of rows.slice(1)) {
    out.push("INSERT INTO " + table + " (" + keep.map((i) => head[i]).join(", ") + ") VALUES (" +
      keep.map((i) => q(r[i] === "" && nul.has(head[i]) ? null : r[i])).join(", ") + ");");
  }
  count[table] = (count[table] || 0) + rows.length - 1;
}
fs.writeFileSync(outFile, out.join("\n") + "\n", "utf8");
console.log(JSON.stringify(count));   // จำนวนแถวที่ควรได้ต่อตาราง — ใช้เทียบหลังกู้
