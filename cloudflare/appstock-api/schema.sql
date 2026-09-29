-- AppStock — โครงฐานข้อมูล D1 (เทียบกับแท็บชีตเดิมทีละแท็บ)
-- ชื่อคีย์ในคำตอบ JSON ยังเป็นชื่อหัวคอลัมน์ชีตเดิม (SKU, Name, Qty ...) — แปลงในโค้ด ไม่ใช่ที่นี่

CREATE TABLE IF NOT EXISTS materials (              -- SQF_Materials + MLM_Materials
  module TEXT NOT NULL,                             -- SQF | MLM
  sku TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  qty REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '',
  min REAL NOT NULL DEFAULT 0,                      -- จุดสั่งซื้อ
  daily_usage REAL NOT NULL DEFAULT 0,
  expiry_date TEXT NOT NULL DEFAULT '',
  last_verified TEXT NOT NULL DEFAULT '',
  discontinued INTEGER NOT NULL DEFAULT 0,
  alert_days REAL,
  rop_start TEXT NOT NULL DEFAULT '',               -- yyyy-MM-dd วันเริ่มนับสถิติเบิก
  lead_days REAL, moq REAL, pack_size REAL,         -- ค่าต่อรายการสำหรับจุดสั่งซื้อแนะนำ (NULL = ใช้ค่ากลาง)
  seq INTEGER,                                      -- ลำดับแถวเดิมในชีต (คงลำดับการแสดงผล)
  PRIMARY KEY (module, sku)
);

CREATE TABLE IF NOT EXISTS history (                -- SQF_History + MLM_History
  id INTEGER PRIMARY KEY AUTOINCREMENT,             -- ลำดับที่บันทึก (= ลำดับแถวชีตเดิม)
  module TEXT NOT NULL,
  ts TEXT NOT NULL,                                 -- เวลาที่เกิดรายการจริง (ISO UTC)
  name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  qty NUMERIC,                                      -- ตัวเลข หรือ "-" สำหรับรายการที่ไม่มีจำนวน
  user TEXT NOT NULL DEFAULT '',
  doc_no TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  op_id TEXT NOT NULL DEFAULT '',
  balance_after REAL,
  work_order TEXT NOT NULL DEFAULT '',
  ack_by TEXT NOT NULL DEFAULT '',
  ack_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_hist_mod ON history(module, id);
CREATE INDEX IF NOT EXISTS idx_hist_ts ON history(module, ts);
CREATE INDEX IF NOT EXISTS idx_hist_doc ON history(module, doc_no) WHERE doc_no <> '';
-- กันบันทึกซ้ำแบบถาวร: opId เดียวกันเข้าได้ครั้งเดียว (แทนการสแกนประวัติ 3,000 แถวของเดิม)
CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_op ON history(module, op_id) WHERE op_id <> '';

CREATE TABLE IF NOT EXISTS users (                  -- AppUsers
  username TEXT PRIMARY KEY COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1,
  role TEXT NOT NULL DEFAULT 'user',
  password TEXT NOT NULL DEFAULT '',                -- SHA-256 hex (หรือข้อความธรรมดาที่รอแปลงตอน login ครั้งถัดไป)
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS pending_users (          -- PendingUsers
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL COLLATE NOCASE,
  requested_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING',
  reviewed_at TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT NOT NULL DEFAULT '',
  requested_role TEXT NOT NULL DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS sessions (               -- บัตรผ่าน (แทน CacheService + ScriptProperties)
  token TEXT PRIMARY KEY,
  u TEXT NOT NULL, n TEXT NOT NULL, r TEXT NOT NULL,
  exp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS config (                 -- Config (superAdmin, aliasSuperAdmin, telegram*, docSeq_*)
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS kv (                     -- ค่าชั่วคราวมีวันหมดอายุ (จำกัดความถี่ login, กันแจ้งเตือนซ้ำ, งานตามเวลา)
  k TEXT PRIMARY KEY, v TEXT, exp INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cr_products (            -- ColdRoom_Products
  barcode TEXT PRIMARY KEY,
  product_name TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  default_unit TEXT NOT NULL DEFAULT '',
  shelf_life_days REAL,
  warning_pct REAL,
  warning_days TEXT NOT NULL DEFAULT '',
  set_name TEXT NOT NULL DEFAULT '',
  units_per_set REAL,
  created_at TEXT NOT NULL DEFAULT '',
  seq INTEGER
);

CREATE TABLE IF NOT EXISTS cr_stock (               -- ColdRoom_Stock (+ Archive ด้วยธง archived)
  row_id TEXT PRIMARY KEY,
  barcode TEXT NOT NULL,
  product_name TEXT NOT NULL DEFAULT '',
  mfg TEXT NOT NULL DEFAULT '',                     -- yyyy-MM-dd
  exp TEXT NOT NULL DEFAULT '',
  qty REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  employee_name TEXT NOT NULL DEFAULT '',
  device_info TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  seq INTEGER
);
-- ล็อต = บาร์โค้ด + วันผลิต มีได้แถวเดียว (กันสองเครื่องสร้างล็อตเดียวกันพร้อมกัน)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_lot ON cr_stock(barcode, mfg) WHERE archived = 0;

CREATE TABLE IF NOT EXISTS cr_lot_history (         -- ColdRoom_LotHistory
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL, barcode TEXT NOT NULL, product_name TEXT NOT NULL DEFAULT '', mfg TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '', qty_before REAL, qty_after REAL, reason TEXT NOT NULL DEFAULT '',
  employee_name TEXT NOT NULL DEFAULT '', device_info TEXT NOT NULL DEFAULT '', op_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_lot_bc ON cr_lot_history(barcode, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lot_op ON cr_lot_history(op_id) WHERE op_id <> '';

CREATE TABLE IF NOT EXISTS work_orders (            -- ColdRoom_WorkOrders
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL DEFAULT '', items TEXT NOT NULL DEFAULT '[]', note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'รอดำเนินการ'
);

CREATE TABLE IF NOT EXISTS delivery_notes (         -- ColdRoom_DeliveryNotes
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT NOT NULL UNIQUE,
  work_order_id TEXT NOT NULL DEFAULT '', items TEXT NOT NULL DEFAULT '[]',
  submitted_by TEXT NOT NULL DEFAULT '', submitted_at TEXT NOT NULL DEFAULT '',
  approved_by TEXT NOT NULL DEFAULT '', approved_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS stock_in (               -- ColdRoom_StockIn
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_in_id TEXT NOT NULL UNIQUE,
  submitted_by TEXT NOT NULL DEFAULT '', submitted_at TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT NOT NULL DEFAULT '', reviewed_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS bom (                    -- BOM
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bom_id TEXT NOT NULL DEFAULT '', product_barcode TEXT NOT NULL, product_name TEXT NOT NULL DEFAULT '',
  factory TEXT NOT NULL DEFAULT '', material_sku TEXT NOT NULL DEFAULT '', material_name TEXT NOT NULL DEFAULT '',
  qty_per_unit REAL NOT NULL DEFAULT 0, unit TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_bom_product ON bom(product_barcode);

CREATE TABLE IF NOT EXISTS system_log (             -- System_Log
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL, type TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', user TEXT NOT NULL DEFAULT '-', result TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_syslog_type ON system_log(type, id);

CREATE TABLE IF NOT EXISTS tg_queue (               -- ข้อความ Telegram ที่ส่งไม่ผ่าน รอส่งซ้ำ (ปกติส่งทันทีหลังตอบผู้ใช้ ไม่ผ่านตารางนี้)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  tries INTEGER NOT NULL DEFAULT 0, sent_at TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT ''
);
