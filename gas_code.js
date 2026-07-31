// ╔══════════════════════════════════════════════════════════╗
// ║  ⚠️  ขั้นตอนแรก: ตั้งค่า appsscript.json ใน GAS Editor  ║
// ║  1. กด ⚙️ Project Settings (ซ้ายล่าง)                   ║
// ║  2. ✅ เปิด "Show appsscript.json manifest in editor"    ║
// ║  3. คลิกไฟล์ appsscript.json แล้ว วางโค้ดนี้:           ║
// ║                                                          ║
// ║  {                                                       ║
// ║    "timeZone": "Asia/Bangkok",                           ║
// ║    "dependencies": {},                                   ║
// ║    "exceptionLogging": "STACKDRIVER",                    ║
// ║    "runtimeVersion": "V8",                               ║
// ║    "oauthScopes": [                                      ║
// ║      "https://www.googleapis.com/auth/spreadsheets",     ║
// ║      "https://www.googleapis.com/auth/script.external_request"  ║
// ║    ]                                                     ║
// ║  }                                                       ║
// ║                                                          ║
// ║  4. Save → Run ฟังก์ชันใดก็ได้ → Allow                                ║
// ║  5. Deploy → New version                                 ║
// ╚══════════════════════════════════════════════════════════╝

// ============================================================
// UNIFIED STOCK MANAGEMENT — Google Apps Script
// โรงงาน SQF (สุพรรณคิวฟู้ดส์) + MLM (แม่ละมาย)
// 3 Modules: COLDROOM | SQF | MLM
//
// อัปเดตล่าสุด: 2026-04-12 (v8)
// แก้ไข: ensureColumns ColdRoom_Products (SetName/UnitsPerSet ไม่บันทึก),
//         crSaveNewProduct ใช้ header-map แทน fixed array,
//         updateProduct / getColdRoomProducts เรียก ensureColumns ก่อนทุกครั้ง
//
// วิธีใช้:
// 1. เปิด Google Sheets ใหม่
// 2. ไปที่ Extensions → Apps Script
// 3. ลบโค้ดเดิม แล้ว paste โค้ดนี้ทั้งหมด
// 4. กด Deploy → New deployment → Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 5. Copy URL ไปใส่ใน index.html ที่ตัวแปร GAS_URL
// ============================================================

// ============================================================
// SHEET HELPERS
// ============================================================

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    initSheet(sheet, name);
  }
  return sheet;
}

function initSheet(sheet, name) {
  const HEADERS = {
    "ColdRoom_Products": ["Barcode","ProductName","SKU","DefaultUnit","StandardShelfLifeDays","WarningPercentage","WarningDays","SetName","UnitsPerSet","CreatedAt"],
    "ColdRoom_Stock":    ["RowID","Barcode","ProductName","MFG","EXP","Qty","Note","EmployeeName","DeviceInfo","UpdatedAt"],
    "AppUsers":          ["Username","Active","Role","Password","CreatedAt"],
    "PendingUsers":      ["Username","RequestedAt","Status","ReviewedAt","ReviewedBy"],
    "SQF_Materials":     ["SKU","Name","Qty","Unit","Min","DailyUsage","ExpiryDate","LastVerified","Discontinued","AlertDays"],
    "SQF_History":       ["Timestamp","Name","Action","Qty","User"],
    "MLM_Materials":     ["SKU","Name","Qty","Unit","Min","DailyUsage","ExpiryDate","LastVerified","Discontinued","AlertDays"],
    "MLM_History":       ["Timestamp","Name","Action","Qty","User"],
    "Config":            ["Key","Value"],
    "ColdRoom_WorkOrders": ["OrderID","Date","Items","Note","CreatedBy","CreatedAt","Status"],
    "ColdRoom_DeliveryNotes": ["DeliveryID","WorkOrderID","Items","SubmittedBy","SubmittedAt","ApprovedBy","ApprovedAt","Status","Note"],
    "BOM": ["BomID","ProductBarcode","ProductName","Factory","MaterialSKU","MaterialName","QtyPerUnit","Unit"],
    "ColdRoom_StockIn": ["StockInID","SubmittedBy","SubmittedAt","Items","Status","Note","ReviewedBy","ReviewedAt"]
  };
  if (HEADERS[name]) {
    sheet.appendRow(HEADERS[name]);
    sheet.getRange(1, 1, 1, HEADERS[name].length)
      .setFontWeight("bold")
      .setBackground("#1e293b")
      .setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    // Seed admin account เมื่อสร้าง AppUsers ครั้งแรก — ใช้ชื่อจากชีต Config
    // (ถ้ายังไม่มีแถว superAdmin ใน Config ให้เพิ่มบัญชีแรกในชีตเองมือ)
    if (name === "AppUsers") {
      var sa = _superAdminName();
      if (sa) sheet.appendRow([sa, true, "admin", new Date()]);
    }
  }
}

// ── พรางชื่อ login ของเจ้าของระบบในทุกอย่างที่ออกจากเซิร์ฟเวอร์ ──
// กันพนักงานเห็นชื่อบัญชีในประวัติแล้วเอาไปลองสุ่มรหัสผ่าน
// ปิดที่ทางออกจุดเดียว (jsonResponse + Telegram) ชีตยังเก็บชื่อจริงไว้ตรวจสอบได้
// เปลี่ยนชื่อที่แสดง: เพิ่มแถว aliasSuperAdmin ในชีต Config
var _aliasCache = null;
function _superAdminAlias() {
  if (_aliasCache !== null) return _aliasCache;
  var alias = "ผู้ดูแลระบบ";
  try {
    var rows = getSheet("Config").getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === "aliasSuperAdmin" && String(rows[i][1]).trim()) {
        alias = String(rows[i][1]).trim();
        break;
      }
    }
  } catch (e) { /* ใช้ค่าเริ่มต้น */ }
  // กัน JSON พัง ถ้าใครใส่เครื่องหมายคำพูดมาในชื่อ
  _aliasCache = alias.replace(/[\\"]/g, "").slice(0, 40) || "ผู้ดูแลระบบ";
  return _aliasCache;
}

function _maskNames(s) {
  var sa = _superAdminName();
  if (!sa || s.toLowerCase().indexOf(sa) < 0) return s;   // เร็ว: ส่วนใหญ่ไม่เจอ
  return s.replace(new RegExp(sa, "gi"), _superAdminAlias());
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(_maskNames(JSON.stringify(data)))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// SECURITY HELPERS
// ============================================================

// ══════════════════════════════════════════
// 👑 SUPER ADMIN — เจ้าของระบบ มีคนเดียว
//   • ห้ามใครเปลี่ยน role หรือรหัสผ่านของบัญชีนี้ (กันโดนล็อกออกจากระบบตัวเอง)
//   • เป็นคนเดียวที่ตั้งคนอื่นเป็น admin ได้
// ══════════════════════════════════════════
// ชื่อบัญชีเจ้าของระบบอ่านจากชีต Config (แถว superAdmin) — ไม่เก็บในโค้ด
// เพราะ repo นี้เป็นสาธารณะ ใครก็เปิดอ่านได้ (ย้ายออกเมื่อ 2026-07-31)
// ⚠️ ถ้าแถวนี้หายไป เกราะกันแก้ไข super admin จะปิดเงียบๆ — อย่าลบแถวนี้ในชีต
var _superAdminCache = null;
function _superAdminName() {
  if (_superAdminCache !== null) return _superAdminCache;
  var name = "";
  try {
    var rows = getSheet("Config").getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === "superAdmin") {
        name = String(rows[i][1]).trim().toLowerCase();
        break;
      }
    }
  } catch (e) { /* ไม่มีชีต → ไม่มี super admin */ }
  _superAdminCache = name;
  return name;
}

function _isSuperAdmin(username) {
  var sa = _superAdminName();
  if (!sa) return false;   // ไม่มีแถวในชีต = ไม่มี super admin (ห้ามให้ "" ไปเทียบเจอ "" แล้วกลายเป็นจริง)
  return String(username || "").trim().toLowerCase() === sa;
}

// ผู้เรียก API คนนี้เป็น super admin หรือไม่ (ดูจาก token)
function _callerIsSuperAdmin(token) {
  return _isSuperAdmin(_getTokenUsername(token));
}

// ── Password Hashing (SHA-256) ──
function _hashPwd(pwd) {
  if (!pwd) return "";
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pwd), Utilities.Charset.UTF_8);
  return raw.map(function(b){ return ("0" + (b < 0 ? b + 256 : b).toString(16)).slice(-2); }).join("");
}

// ── ตรวจว่าเป็น hash (64 hex chars) หรือ plaintext ──
function _isHashed(s) { return /^[0-9a-f]{64}$/.test(s); }

// ── Rate Limiting (max 5 ครั้ง / 15 นาที ต่อ username) ──
function _isRateLimited(username) {
  var key = "rl_" + username.toLowerCase();
  var val = CacheService.getScriptCache().get(key);
  var count = val ? Number(val) : 0;
  if (count >= 5) return true;
  CacheService.getScriptCache().put(key, String(count + 1), 900);
  return false;
}
function _clearRateLimit(username) {
  CacheService.getScriptCache().remove("rl_" + username.toLowerCase());
}

// ── Sanitize device name (ป้องกัน Telegram injection) ──
function _sanitizeDeviceName(name) {
  return String(name || "ไม่ระบุ").slice(0, 50).replace(/[*_[\]()~`\\]/g, "");
}

// ── Validate quantity (ป้องกัน negative / overflow) ──
function _validateQty(v, allowDecimal) {
  var n = Number(v);
  if (isNaN(n) || !isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 9999999) return 9999999;
  return allowDecimal ? Math.round(n * 1000) / 1000 : Math.floor(n);
}

// Poka-Yoke: ครอบฟังก์ชัน read-then-write ด้วย DocumentLock กัน race condition
function _withLock(fn) {
  var lock = LockService.getDocumentLock();
  try { lock.waitLock(10000); } catch(e) { return { ok: false, status: "error", message: "ระบบกำลังประมวลผลคำขออื่น กรุณาลองใหม่" }; }
  try { return fn(); }
  finally { try { lock.releaseLock(); } catch(e) {} }
}

// ============================================================
// SYSTEM — verifyUser
// ============================================================

// ── Generalized Token (CacheService) ──
// อายุ 6 ชั่วโมง = ค่าสูงสุดที่ CacheService ของ GAS เก็บได้
//
// เดิมตั้งไว้ 30 นาที แล้วเจอปัญหาจริง: admin ทำงานหน้าวัตถุดิบ/คลังสินค้า
// ซึ่งไม่ได้ส่ง token ไปด้วย บัตรจึงไม่ถูกต่ออายุ พอกลับมาหน้าผู้ใช้งาน
// ขึ้น "ไม่มีสิทธิ์" ทั้งที่ยังล็อกอินอยู่ และไม่มีอะไรบอกว่าต้องทำยังไงต่อ
//
// 6 ชม. = เข้าสู่ระบบตอนเช้าครั้งเดียว ใช้ได้ทั้งวันทำงาน
var TOKEN_TTL_SEC = 21600;
function _issueToken(username, role) {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put("tk_" + token, JSON.stringify({ u: username.toLowerCase(), r: role }), TOKEN_TTL_SEC);
  return token;
}
function _issueAdminToken(username) { return _issueToken(username, "admin"); }

function _getTokenData(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var cached = cache.get("tk_" + token);
  if (cached) {
    try {
      var data = JSON.parse(cached);
      // ต่ออายุบัตรทุกครั้งที่ใช้งาน
      cache.put("tk_" + token, cached, TOKEN_TTL_SEC);
      return data;
    } catch(e) { return null; }
  }
  // compat: เก่าเก็บด้วย at_ prefix
  var old = cache.get("at_" + token);
  if (old) {
    // upgrade เป็นรูปแบบใหม่ + ต่ออายุ
    var upgraded = JSON.stringify({ u: old, r: "admin" });
    cache.put("tk_" + token, upgraded, TOKEN_TTL_SEC);
    cache.remove("at_" + token);
    return { u: old, r: "admin" };
  }
  return null;
}
function verifyAdminToken(token) { var d = _getTokenData(token); return !!(d && d.r === "admin"); }
function verifyApproverToken(token) { var d = _getTokenData(token); return !!(d && (d.r === "admin" || d.r === "manager")); }
function _getTokenUsername(token) { var d = _getTokenData(token); return d ? d.u : null; }
function revokeAdminToken(token) {
  if (token) {
    CacheService.getScriptCache().remove("tk_" + token);
    CacheService.getScriptCache().remove("at_" + token);
  }
}

function verifyUser(payload) {
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "").trim();
  if (!username) return { ok: false, message: "กรุณาระบุชื่อผู้ใช้" };

  // Rate limiting — ป้องกัน brute force
  if (_isRateLimited(username)) {
    return { ok: false, message: "⛔ พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาที" };
  }

  const sheet = getSheet("AppUsers");
  ensureColumns(sheet, ["Password"]);
  const data  = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: false, message: "ยังไม่มีรายชื่อผู้ใช้ กรุณาให้ Admin เพิ่มก่อน" };

  const h = data[0];
  const userCol     = h.indexOf("Username");
  const activeCol   = h.indexOf("Active");
  const passwordCol = h.indexOf("Password");

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][userCol]).trim().toLowerCase() === username.toLowerCase()) {
      const active = data[i][activeCol];
      if (active === false || String(active).toUpperCase() === "FALSE") {
        return { ok: false, message: "บัญชีนี้ถูกระงับ กรุณาติดต่อ Admin" };
      }

      // ตรวจสอบรหัสผ่าน (รองรับทั้ง hash และ plaintext เพื่อ migration)
      const storedPwd = passwordCol >= 0 ? String(data[i][passwordCol] || "").trim() : "";
      if (storedPwd) {
        if (!password) return { ok: false, requirePassword: true, message: "กรุณาระบุรหัสผ่าน" };
        const inputHash = _hashPwd(password);
        const pwdOk = _isHashed(storedPwd) ? (inputHash === storedPwd) : (password === storedPwd);
        if (!pwdOk) return { ok: false, message: "รหัสผ่านไม่ถูกต้อง ❌" };
        // Auto-upgrade plaintext → hash เมื่อล็อกอินสำเร็จ
        if (!_isHashed(storedPwd)) {
          sheet.getRange(i+1, passwordCol+1).setValue(inputHash);
        }
      }

      _clearRateLimit(username); // reset นับหลังล็อกอินสำเร็จ
      const role = String(data[i][h.indexOf("Role")] || "user");
      // ออก token ให้ admin/manager ทุกคนที่ผ่าน login (manager = อนุมัติได้)
      const needsToken = (role === "admin" || role === "manager");
      const adminToken = needsToken ? _issueToken(username, role) : null;

      return { ok: true, role, adminToken };
    }
  }
  // ไม่พบใน AppUsers → เช็คว่าเคยส่งคำขอไว้ไหม เพื่อให้หน้าจอบอกสถานะได้ถูก
  var pend = _pendingStatusOf(username);
  if (pend === "PENDING")  return { ok: false, pending: true,  message: "คำขอของ \"" + username + "\" กำลังรอ Admin อนุมัติ" };
  if (pend === "REJECTED") return { ok: false, rejected: true, message: "คำขอของ \"" + username + "\" ถูกปฏิเสธ กรุณาติดต่อ Admin" };
  return { ok: false, notFound: true, message: "ยังไม่มีชื่อ \"" + username + "\" ในระบบ" };
}

// สถานะคำขอล่าสุดของชื่อนี้ใน PendingUsers ("PENDING" / "REJECTED" / "")
function _pendingStatusOf(username) {
  try {
    var sheet = getSheet("PendingUsers");
    var data  = sheet.getDataRange().getValues();
    if (data.length < 2) return "";
    var h = data[0];
    var uCol = h.indexOf("Username"), sCol = h.indexOf("Status");
    var found = "";
    for (var i = 1; i < data.length; i++) {   // ไล่จากบนลงล่าง เอาแถวท้ายสุด = ล่าสุด
      if (String(data[i][uCol]).trim().toLowerCase() === String(username).trim().toLowerCase()) {
        found = String(data[i][sCol] || "").toUpperCase();
      }
    }
    return found;
  } catch (e) { return ""; }
}

// ============================================================
// SYSTEM — registerUser / getPendingUsers / approveUser / rejectUser
// ============================================================

function registerUser(payload) {
  const username = String(payload.username || "").trim();
  if (!username) return { ok: false, message: "กรุณาระบุชื่อ" };

  // ห้ามใช้ชื่อ admin
  if (username.toLowerCase() === "kungrc1020") {
    return { ok: false, message: "ไม่สามารถใช้ชื่อนี้ได้" };
  }

  // ตรวจสอบ AppUsers — มีชื่อนี้แล้วหรือเปล่า
  const appSheet = getSheet("AppUsers");
  const appData  = appSheet.getDataRange().getValues();
  const appH     = appData[0];
  const appUserCol = appH.indexOf("Username");
  for (var i = 1; i < appData.length; i++) {
    if (String(appData[i][appUserCol]).trim().toLowerCase() === username.toLowerCase()) {
      return { ok: false, message: "ชื่อ \"" + username + "\" มีอยู่ในระบบแล้ว ลองเข้าสู่ระบบได้เลย" };
    }
  }

  // ตรวจสอบ PendingUsers — ส่งคำขอไปแล้วหรือเปล่า
  const pendSheet = getSheet("PendingUsers");
  const pendData  = pendSheet.getDataRange().getValues();
  if (pendData.length > 1) {
    var ph = pendData[0];
    var pUserCol   = ph.indexOf("Username");
    var pStatusCol = ph.indexOf("Status");
    for (var j = 1; j < pendData.length; j++) {
      if (String(pendData[j][pUserCol]).trim().toLowerCase() === username.toLowerCase()) {
        var st = String(pendData[j][pStatusCol]);
        if (st === "PENDING")  return { ok: false, message: "ส่งคำขอไปแล้ว กรุณารอการอนุมัติจากผู้ควบคุมระบบ" };
        if (st === "REJECTED") return { ok: false, message: "คำขอของ \"" + username + "\" ถูกปฏิเสธ กรุณาติดต่อผู้ควบคุมระบบ" };
      }
    }
  }

  var validRoles = ["admin","manager","viewer","user"];
  var requestedRole = validRoles.includes(String(payload.requestedRole || "").toLowerCase()) ? String(payload.requestedRole).toLowerCase() : "user";
  pendSheet.appendRow([username, new Date(), "PENDING", "", "", requestedRole]);
  crSendTelegramGeneric("📝 คำขอสมัครใหม่\n👤 ชื่อ: " + username + "\n🔖 ขอ Role: " + requestedRole + "\nรอการอนุมัติจาก Admin" + deviceTag());
  return { ok: true, message: "ส่งคำขอเรียบร้อยแล้ว รอผู้ควบคุมระบบอนุมัติ" };
}

function getPendingUsers(payload) {
  if (!verifyApproverToken(payload.adminToken)) return { ok: false, message: "ไม่มีสิทธิ์ กรุณาเข้าสู่ระบบใหม่" };

  const pendSheet = getSheet("PendingUsers");
  const data = pendSheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true, list: [] };

  const h = data[0];
  var uCol  = h.indexOf("Username");
  var dCol  = h.indexOf("RequestedAt");
  var sCol  = h.indexOf("Status");
  var rrCol = h.indexOf("RequestedRole");

  var list = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][sCol]) === "PENDING") {
      var dt = data[i][dCol];
      list.push({
        username:      String(data[i][uCol]),
        requestedAt:   dt instanceof Date ? Utilities.formatDate(dt, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm") : String(dt),
        requestedRole: rrCol >= 0 ? String(data[i][rrCol] || "user") : "user"
      });
    }
  }
  return { ok: true, list: list };
}

function approveUser(payload) {
  if (!verifyApproverToken(payload.adminToken)) return { ok: false, message: "ไม่มีสิทธิ์ กรุณาเข้าสู่ระบบใหม่" };
  var requesterRaw = _getTokenUsername(payload.adminToken) || "admin";
  var requester = requesterRaw.charAt(0).toUpperCase() + requesterRaw.slice(1);
  var username = String(payload.username || "").trim();
  if (!username) return { ok: false, message: "ไม่ระบุชื่อ" };

  const pendSheet = getSheet("PendingUsers");
  const pendData  = pendSheet.getDataRange().getValues();
  const ph = pendData[0];
  var uCol  = ph.indexOf("Username");
  var sCol  = ph.indexOf("Status");
  var raCol = ph.indexOf("ReviewedAt");
  var rbCol = ph.indexOf("ReviewedBy");

  var rrCol = ph.indexOf("RequestedRole");

  // ── ขั้นที่ 1: หาแถวคำขอ + อ่าน role ที่ขอ (ยังไม่เขียนอะไร) ──
  var rowIdx = -1;
  var approvedRole = "user";
  for (var i = 1; i < pendData.length; i++) {
    if (String(pendData[i][uCol]).trim().toLowerCase() === username.toLowerCase() && String(pendData[i][sCol]) === "PENDING") {
      approvedRole = rrCol >= 0 ? String(pendData[i][rrCol] || "user") : "user";
      rowIdx = i;
      break;
    }
  }
  if (rowIdx < 0) return { ok: false, message: "ไม่พบคำขอที่รอการอนุมัติ" };

  // ── ขั้นที่ 2: ตรวจสิทธิ์ให้จบก่อน แล้วค่อยเขียน (ไม่งั้นคำขอถูกกินทิ้งตอนปฏิเสธ) ──
  approvedRole = String(approvedRole || "user").toLowerCase();
  if (!["admin","manager","viewer","user"].includes(approvedRole)) {
    approvedRole = "user";   // role เก่าที่เลิกใช้ (เช่น ceo/approver) → ปรับเป็น user
  }
  // manager อนุมัติได้เฉพาะ user / viewer — ถ้า "ขอ" สิทธิ์สูงกว่านั้น ต้องให้ admin ตัดสิน
  // (เช็คจาก role ที่ขอมาจริง ก่อนจะลดระดับใดๆ — คำขอยังค้างไว้ ไม่ถูกกินทิ้ง)
  if (!verifyAdminToken(payload.adminToken) && ["admin","manager"].indexOf(approvedRole) >= 0) {
    return { ok: false, message: "คำขอนี้ขอสิทธิ์ระดับ " + approvedRole + " — ต้องให้ผู้ดูแลระบบ (admin) อนุมัติ" };
  }
  // 👑 ตั้ง admin ได้เฉพาะเจ้าของระบบ (admin คนอื่นอนุมัติให้ได้แค่ user)
  if (approvedRole === "admin" && !_callerIsSuperAdmin(payload.adminToken)) {
    approvedRole = "user";
  }

  // ── ขั้นที่ 3: ผ่านทุกด่านแล้วค่อยบันทึก ──
  pendSheet.getRange(rowIdx + 1, sCol  + 1).setValue("APPROVED");
  pendSheet.getRange(rowIdx + 1, raCol + 1).setValue(new Date());
  pendSheet.getRange(rowIdx + 1, rbCol + 1).setValue(requester);

  // เพิ่มเข้า AppUsers
  const appSheet = getSheet("AppUsers");
  appSheet.appendRow([username, true, approvedRole, new Date()]);

  crSendTelegramGeneric("✅ อนุมัติผู้ใช้ใหม่\n👤 " + username + "\nโดย: " + requester);
  return { ok: true };
}

function rejectUser(payload) {
  if (!verifyApproverToken(payload.adminToken)) return { ok: false, message: "ไม่มีสิทธิ์ กรุณาเข้าสู่ระบบใหม่" };
  var requesterRaw = _getTokenUsername(payload.adminToken) || "admin";
  var requester = requesterRaw.charAt(0).toUpperCase() + requesterRaw.slice(1);
  var username = String(payload.username || "").trim();
  if (!username) return { ok: false, message: "ไม่ระบุชื่อ" };

  const pendSheet = getSheet("PendingUsers");
  const pendData  = pendSheet.getDataRange().getValues();
  const ph = pendData[0];
  var uCol  = ph.indexOf("Username");
  var sCol  = ph.indexOf("Status");
  var raCol = ph.indexOf("ReviewedAt");
  var rbCol = ph.indexOf("ReviewedBy");

  for (var i = 1; i < pendData.length; i++) {
    if (String(pendData[i][uCol]).trim().toLowerCase() === username.toLowerCase() && String(pendData[i][sCol]) === "PENDING") {
      pendSheet.getRange(i + 1, sCol  + 1).setValue("REJECTED");
      pendSheet.getRange(i + 1, raCol + 1).setValue(new Date());
      pendSheet.getRange(i + 1, rbCol + 1).setValue(requester);
      return { ok: true };
    }
  }
  return { ok: false, message: "ไม่พบคำขอที่รอการอนุมัติ" };
}

// ============================================================
// SYSTEM — getActivityLog
// ============================================================

function getActivityLog(payload) {
  if (!verifyAdminToken(payload.adminToken)) return { ok: false, message: "ไม่มีสิทธิ์ กรุณาเข้าสู่ระบบใหม่" };

  var list = [];

  // ── ColdRoom_Stock (อ่านเฉพาะ 150 แถวสุดท้าย) ──
  try {
    var crSheet = getSheet("ColdRoom_Stock");
    var crLastRow = crSheet.getLastRow();
    if (crLastRow > 1) {
      var ch = crSheet.getRange(1, 1, 1, crSheet.getLastColumn()).getValues()[0];
      var numRows = Math.min(150, crLastRow - 1);
      var crData = crSheet.getRange(crLastRow - numRows + 1, 1, numRows, ch.length).getValues();
      var cName  = ch.indexOf("ProductName");
      var cQty   = ch.indexOf("Qty");
      var cEmp   = ch.indexOf("EmployeeName");
      var cDev   = ch.indexOf("DeviceInfo");
      var cNote  = ch.indexOf("Note");
      var cUpd   = ch.indexOf("UpdatedAt");
      var cMfg   = ch.indexOf("MFG");
      for (var i = crData.length - 1; i >= 0; i--) {
        var ts = crData[i][cUpd];
        var dt = ts ? new Date(ts) : null;
        list.push({
          module:    "COLDROOM",
          name:      String(crData[i][cName] || ""),
          action:    cMfg >= 0 ? "MFG: " + formatCellDate(crData[i][cMfg]) : "",
          qty:       crData[i][cQty] !== "" ? String(crData[i][cQty]) : "",
          user:      String(crData[i][cEmp] || ""),
          device:    String(crData[i][cDev] || ""),
          note:      String(crData[i][cNote] || ""),
          timestamp: dt ? Utilities.formatDate(dt, Session.getScriptTimeZone(), "dd/MM/yy HH:mm") : String(ts),
          _ts:       dt ? dt.getTime() : 0
        });
      }
    }
  } catch(e) { Logger.log("ColdRoom activity error: " + e); }

  // ── SQF_History (อ่านเฉพาะ 150 แถวสุดท้าย) ──
  try {
    var sqfSheet = getSheet("SQF_History");
    var sqfLastRow = sqfSheet.getLastRow();
    if (sqfLastRow > 1) {
      var sh = sqfSheet.getRange(1, 1, 1, sqfSheet.getLastColumn()).getValues()[0];
      var sqfNum = Math.min(150, sqfLastRow - 1);
      var sqfData = sqfSheet.getRange(sqfLastRow - sqfNum + 1, 1, sqfNum, sh.length).getValues();
      var sTs  = sh.indexOf("Timestamp");
      var sNm  = sh.indexOf("Name");
      var sAct = sh.indexOf("Action");
      var sQty = sh.indexOf("Qty");
      var sUsr = sh.indexOf("User");
      for (var j = sqfData.length - 1; j >= 0; j--) {
        var sqfDt = sqfData[j][sTs] ? new Date(sqfData[j][sTs]) : null;
        list.push({
          module:    "SQF",
          name:      String(sqfData[j][sNm] || ""),
          action:    String(sqfData[j][sAct] || ""),
          qty:       String(sqfData[j][sQty] || ""),
          user:      String(sqfData[j][sUsr] || ""),
          device:    "",
          note:      "",
          timestamp: sqfDt ? Utilities.formatDate(sqfDt, Session.getScriptTimeZone(), "dd/MM/yy HH:mm") : String(sqfData[j][sTs]),
          _ts:       sqfDt ? sqfDt.getTime() : 0
        });
      }
    }
  } catch(e) { Logger.log("SQF activity error: " + e); }

  // ── MLM_History (อ่านเฉพาะ 150 แถวสุดท้าย) ──
  try {
    var mlmSheet = getSheet("MLM_History");
    var mlmLastRow = mlmSheet.getLastRow();
    if (mlmLastRow > 1) {
      var mh = mlmSheet.getRange(1, 1, 1, mlmSheet.getLastColumn()).getValues()[0];
      var mlmNum = Math.min(150, mlmLastRow - 1);
      var mlmData = mlmSheet.getRange(mlmLastRow - mlmNum + 1, 1, mlmNum, mh.length).getValues();
      var mTs  = mh.indexOf("Timestamp");
      var mNm  = mh.indexOf("Name");
      var mAct = mh.indexOf("Action");
      var mQty = mh.indexOf("Qty");
      var mUsr = mh.indexOf("User");
      for (var k = mlmData.length - 1; k >= 0; k--) {
        var mlmDt = mlmData[k][mTs] ? new Date(mlmData[k][mTs]) : null;
        list.push({
          module:    "MLM",
          name:      String(mlmData[k][mNm] || ""),
          action:    String(mlmData[k][mAct] || ""),
          qty:       String(mlmData[k][mQty] || ""),
          user:      String(mlmData[k][mUsr] || ""),
          device:    "",
          note:      "",
          timestamp: mlmDt ? Utilities.formatDate(mlmDt, Session.getScriptTimeZone(), "dd/MM/yy HH:mm") : String(mlmData[k][mTs]),
          _ts:       mlmDt ? mlmDt.getTime() : 0
        });
      }
    }
  } catch(e) { Logger.log("MLM activity error: " + e); }

  // เรียงล่าสุดก่อน ตัด top 200
  list.sort(function(a, b) { return b._ts - a._ts; });
  list = list.slice(0, 200);
  list.forEach(function(item) { delete item._ts; });

  return { ok: true, list: list };
}

// ============================================================
// ROUTER — doGet / doPost
// ============================================================

// อ่าน API key ที่ตั้งไว้ใน Config sheet (ว่าง = ปิดการตรวจ = fail-open)
function _getApiKey() {
  try {
    var data = getSheet("Config").getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === "apiKey") return String(data[i][1] || "").trim();
    }
  } catch (e) {}
  return "";
}

// ตรวจ key — ผ่านเสมอถ้ายังไม่ตั้ง apiKey ใน Config (backward compatible)
function _checkApiKey(incoming) {
  var expected = _getApiKey();
  if (!expected) return true;              // ยังไม่เปิดใช้ → ผ่าน
  return String(incoming || "") === expected;
}

function doGet(e) {
  try {
    if (!_checkApiKey(e.parameter && e.parameter.k)) {
      return jsonResponse({ status: "error", message: "unauthorized" });
    }
    const module = ((e.parameter && e.parameter.module) || "MLM").toUpperCase();
    if (module === "SQF" || module === "MLM") {
      return jsonResponse(getRawMaterials(module));
    }
    return jsonResponse({ status: "error", message: "GET ไม่รองรับ module นี้" });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

// Global request context (device info per request, GAS is single-threaded)
var _reqDeviceId   = "";
var _reqDeviceName = "";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const module = (data.module || "MLM").toUpperCase();
    const action = data.action || "";
    const payload = data.payload || data;

    // ตรวจ API key (fail-open ถ้ายังไม่ตั้งใน Config)
    if (!_checkApiKey(data.apiKey)) {
      return jsonResponse({ ok: false, status: "error", message: "unauthorized" });
    }

    // บันทึก device info สำหรับใช้ใน Telegram/log
    _reqDeviceId   = String(data.deviceId   || "").slice(0, 50);
    _reqDeviceName = _sanitizeDeviceName(data.deviceName);

    // SYSTEM actions (ไม่ขึ้นกับ module)
    if (action === "verifyUser")      return jsonResponse(verifyUser(payload));
    if (action === "registerUser")    return jsonResponse(registerUser(payload));
    if (action === "logoutAdmin")     { revokeAdminToken(payload.adminToken); return jsonResponse({ ok: true }); }
    if (action === "getPendingUsers") return jsonResponse(getPendingUsers(payload));
    if (action === "approveUser")     return jsonResponse(approveUser(payload));
    if (action === "rejectUser")      return jsonResponse(rejectUser(payload));
    if (action === "getActivityLog")  return jsonResponse(getActivityLog(payload));
    if (action === "getUsers")        return jsonResponse(getUsers(payload));
    if (action === "setUserRole")     return jsonResponse(setUserRole(payload));
    if (action === "demoteOtherAdmins") return jsonResponse(demoteOtherAdmins(payload));
    if (action === "getMyHistory")    return jsonResponse(getMyHistory(payload));
    if (action === "createUser")      return jsonResponse(_withLock(function(){ return createUser(payload); }));
    if (action === "deleteUser")      return jsonResponse(_withLock(function(){ return deleteUser(payload); }));
    if (action === "submitDelivery")  return jsonResponse(_withLock(function(){ return submitDelivery(payload); }));
    if (action === "getDeliveries")   return jsonResponse(getDeliveries(payload));
    if (action === "submitStockIn")   return jsonResponse(submitStockIn(payload));
    if (action === "getStockInList")  return jsonResponse(getStockInList(payload));
    if (action === "reviewStockIn")   return jsonResponse(_withLock(function(){ return reviewStockIn(payload); }));

    if (module === "COLDROOM") {
      return jsonResponse(handleColdroom(action, payload));
    } else if (module === "SQF" || module === "MLM") {
      return jsonResponse(handleRawMaterial(action, data, module));
    }
    return jsonResponse({ status: "error", message: "ไม่รู้จัก module: " + module });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

// Helper: สร้าง device tag สำหรับ Telegram
function deviceTag() {
  return _reqDeviceName ? `\n🖥️ ${_reqDeviceName}` : "";
}

// ============================================================
// ❄️ COLD ROOM MODULE
// ============================================================

function handleColdroom(action, payload) {
  switch (action) {
    case "getProductAndBalances": return crGetProductAndBalances(payload);
    case "saveOrUpdateCount":     return _withLock(function(){ return crSaveOrUpdateCount(payload); });
    case "saveNewProduct":        return crSaveNewProduct(payload);
    case "getStartupOverview":    return crGetStartupOverview();
    case "clearLotStock":         return crClearLotStock(payload);
    case "getAlertSettings":      return crGetAlertSettings();
    case "saveAlertSettings":     return crSaveAlertSettings(payload);
    case "saveWorkOrder":         return crSaveWorkOrder(payload);
    case "deleteWorkOrder":       return crDeleteWorkOrder(payload);
    case "getWorkOrders":         return crGetWorkOrders();
    case "getColdRoomProducts":   return crGetColdRoomProducts();
    case "updateProduct":         return crUpdateProduct(payload);
    case "getBomList":            return bomGetList();
    case "getBomHealth":          return bomHealthReport();
    case "getBomForProduct":      return bomGetForProduct(payload.barcode);
    case "saveBom":               return bomSave(payload);
    case "deleteBom":             return bomDelete(payload.barcode);
    case "calcWorkOrderMaterials": return bomCalcWorkOrder(payload);
    case "archiveOldStock":        return archiveOldStock(payload);
    default: return { ok: false, message: "Unknown action: " + action };
  }
}

function crGetProductAndBalances(payload) {
  const search = String(payload.barcode || "").trim().toLowerCase();
  const prodSheet = getSheet("ColdRoom_Products");
  const data = prodSheet.getDataRange().getValues();
  if (data.length < 2) return { found: false };

  const h = data[0];
  const barcodeIdx = h.indexOf("Barcode");
  const nameIdx    = h.indexOf("ProductName");

  let product = null;
  for (let i = 1; i < data.length; i++) {
    const bc   = String(data[i][barcodeIdx] || "").toLowerCase();
    const name = String(data[i][nameIdx]    || "").toLowerCase();
    if (bc === search || name.includes(search)) {
      product = {};
      h.forEach((key, idx) => { product[key] = data[i][idx]; });
      break;
    }
  }
  if (!product) return { found: false };

  const stockSheet = getSheet("ColdRoom_Stock");
  const stockData  = stockSheet.getDataRange().getValues();
  const sh = stockData[0];
  const balances = [];

  for (let i = 1; i < stockData.length; i++) {
    const row = stockData[i];
    if (String(row[sh.indexOf("Barcode")]) === String(product.Barcode) && Number(row[sh.indexOf("Qty")]) > 0) {
      const b = {};
      sh.forEach((key, idx) => { b[key] = row[idx]; });
      // ⚠️ ห้ามส่ง Date object ดิบๆ ออกไป
      //    ตอนแปลงเป็น JSON มันจะกลายเป็นเวลา UTC (เที่ยงคืนวันที่ 28 เวลาไทย = 17:00 ของวันที่ 27 UTC)
      //    หน้าจอจึงแสดง MFG/EXP ผิดไป 1 วัน และจับคู่ล็อตไม่เจอเวลากดเลือก
      //    ต้องแปลงเป็น yyyy-MM-dd ตามเขตเวลาของสคริปต์ก่อน เหมือนที่ getStartupOverview ทำ
      b.MFG = formatCellDate(row[sh.indexOf("MFG")]);
      b.EXP = formatCellDate(row[sh.indexOf("EXP")]);
      balances.push(b);
    }
  }
  balances.sort((a, b) => new Date(a.MFG) - new Date(b.MFG));
  return { found: true, product, balances };
}

function crSaveOrUpdateCount(payload) {
  const { barcode, employeeName, mfg, exp, note } = payload;
  const newQty = _validateQty(payload.newQty, true); // ป้องกัน negative/overflow
  if (!barcode) return { ok: false, message: "ไม่ระบุบาร์โค้ด" };
  if (!mfg || !exp) return { ok: false, message: "กรุณาระบุวันผลิตและวันหมดอายุ" };
  const mfgIso = ddmmyyToIso(mfg);
  const expIso = ddmmyyToIso(exp);
  // Poka-Yoke: ตรวจรูปแบบและความสมเหตุผลของวันที่
  if (!mfgIso || !expIso) return { ok: false, message: "รูปแบบวันที่ไม่ถูกต้อง (DDMMYY)" };
  if (expIso <= mfgIso)   return { ok: false, message: "วันหมดอายุต้องมากกว่าวันผลิต" };

  const prodSheet = getSheet("ColdRoom_Products");
  const prodData  = prodSheet.getDataRange().getValues();
  const ph = prodData[0];
  let productName = "";
  for (let i = 1; i < prodData.length; i++) {
    if (String(prodData[i][ph.indexOf("Barcode")]) === String(barcode)) {
      productName = prodData[i][ph.indexOf("ProductName")];
      break;
    }
  }

  const stockSheet = getSheet("ColdRoom_Stock");
  ensureColumns(stockSheet, ["Note", "EmployeeName", "DeviceInfo", "UpdatedAt"]);
  const stockData  = stockSheet.getDataRange().getValues();
  const sh = stockData[0];

  for (let i = 1; i < stockData.length; i++) {
    if (String(stockData[i][sh.indexOf("Barcode")])          === String(barcode) &&
        formatCellDate(stockData[i][sh.indexOf("MFG")])      === mfgIso) {
      stockSheet.getRange(i + 1, sh.indexOf("Qty")          + 1).setValue(Number(newQty));
      stockSheet.getRange(i + 1, sh.indexOf("Note")         + 1).setValue(note || "");
      stockSheet.getRange(i + 1, sh.indexOf("EmployeeName") + 1).setValue(employeeName);
      stockSheet.getRange(i + 1, sh.indexOf("DeviceInfo")   + 1).setValue(_reqDeviceName || "");
      stockSheet.getRange(i + 1, sh.indexOf("UpdatedAt")    + 1).setValue(new Date().toISOString());
      crSendTelegram(`✅ อัปเดตสต๊อก ❄️\n📦 ${productName}\n📅 MFG: ${mfg} | EXP: ${exp}\n🔢 จำนวน: ${newQty}\n👤 ${employeeName}${deviceTag()}${note ? "\n💬 " + note : ""}`);
      return { ok: true };
    }
  }

  // ไม่พบ lot เดิม → สร้างใหม่
  stockSheet.appendRow([
    Utilities.getUuid(), barcode, productName,
    mfgIso, expIso, Number(newQty), note || "", employeeName, _reqDeviceName || "", new Date().toISOString()
  ]);
  crSendTelegram(`✅ รับเข้าสต๊อก ❄️\n📦 ${productName}\n📅 MFG: ${mfg} | EXP: ${exp}\n🔢 จำนวน: ${newQty}\n👤 ${employeeName}${deviceTag()}${note ? "\n💬 " + note : ""}`);
  return { ok: true };
}

// คอลัมน์ที่ต้องมีใน ColdRoom_Products (รองรับ sheet เก่าที่ยังไม่มี)
var CR_PRODUCT_REQUIRED_COLS = ["Barcode","ProductName","SKU","DefaultUnit","StandardShelfLifeDays","WarningPercentage","WarningDays","SetName","UnitsPerSet","CreatedAt"];

function crEnsureProductCols(sheet) {
  ensureColumns(sheet, CR_PRODUCT_REQUIRED_COLS);
}

function crSaveNewProduct(payload) {
  const { barcode, productName, sku, defaultUnit, standardShelfLifeDays, warningPercentage, warningDays, setName, unitsPerSet } = payload;
  if (!barcode || !productName) return { ok: false, message: "ข้อมูลไม่ครบ" };
  // Poka-Yoke: ตรวจ Shelf life อยู่ใน range ที่สมเหตุสมผล (1-3650 วัน = 10 ปี)
  const shelfVal = Number(standardShelfLifeDays);
  if (standardShelfLifeDays !== "" && standardShelfLifeDays !== undefined) {
    if (isNaN(shelfVal) || shelfVal <= 0 || shelfVal > 3650) {
      return { ok: false, message: "อายุสินค้า (shelf life) ต้องอยู่ระหว่าง 1-3650 วัน" };
    }
  }

  const sheet = getSheet("ColdRoom_Products");
  crEnsureProductCols(sheet); // เพิ่มคอลัมน์ที่หายไปก่อนทุกครั้ง

  // อ่าน headers หลัง ensureColumns เสมอ
  const h = sheet.getDataRange().getValues()[0];
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][h.indexOf("Barcode")]).trim() === String(barcode).trim()) {
      return { ok: false, message: "บาร์โค้ดนี้มีในระบบแล้ว" };
    }
    // Poka-Yoke: ตรวจ SKU ซ้ำ (ถ้าระบุ)
    if (sku && String(data[i][h.indexOf("SKU")]).trim().toLowerCase() === String(sku).trim().toLowerCase()) {
      return { ok: false, message: "SKU นี้มีในระบบแล้ว" };
    }
  }

  // ใช้ header-map แทน fixed array → ไม่ขึ้นกับลำดับคอลัมน์
  const newRow = new Array(h.length).fill("");
  const setCol = (k, v) => { const i = h.indexOf(k); if (i >= 0) newRow[i] = v; };
  setCol("Barcode",               barcode);
  setCol("ProductName",           productName);
  setCol("SKU",                   sku || "");
  setCol("DefaultUnit",           defaultUnit || "");
  setCol("StandardShelfLifeDays", Number(standardShelfLifeDays) || 10);
  setCol("WarningPercentage",     Number(warningPercentage) || 20);
  setCol("WarningDays",           warningDays || "");
  setCol("SetName",               setName || "");
  setCol("UnitsPerSet",           Number(unitsPerSet) || 1);
  setCol("CreatedAt",             new Date().toISOString());
  sheet.appendRow(newRow);
  return { ok: true };
}

function crUpdateProduct(payload) {
  const { barcode, productName, sku, defaultUnit, standardShelfLifeDays, warningPercentage, warningDays, setName, unitsPerSet } = payload;
  if (!barcode || !productName) return { ok: false, message: "ข้อมูลไม่ครบ" };

  const sheet = getSheet("ColdRoom_Products");
  crEnsureProductCols(sheet); // ✅ เพิ่มคอลัมน์ที่หายไปก่อน — สำคัญมาก!

  // อ่าน headers ใหม่หลัง ensureColumns
  const data  = sheet.getDataRange().getValues();
  const h = data[0];
  const bIdx = h.indexOf("Barcode");

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][bIdx]) === String(barcode)) {
      const row = i + 1; // 1-based
      const setVal = (k, v) => {
        const col = h.indexOf(k);
        if (col >= 0) sheet.getRange(row, col + 1).setValue(v);
      };
      setVal("ProductName",           productName);
      setVal("SKU",                   sku || "");
      setVal("DefaultUnit",           defaultUnit || "");
      setVal("StandardShelfLifeDays", Number(standardShelfLifeDays) || 10);
      setVal("WarningPercentage",     Number(warningPercentage) || 20);
      setVal("WarningDays",           warningDays || "");
      setVal("SetName",               setName || "");
      setVal("UnitsPerSet",           Number(unitsPerSet) || 1);
      return { ok: true };
    }
  }
  return { ok: false, message: "ไม่พบสินค้าในระบบ (barcode: " + barcode + ")" };
}

function crGetStartupOverview() {
  const stockSheet = getSheet("ColdRoom_Stock");
  const prodSheet  = getSheet("ColdRoom_Products");
  const stockData  = stockSheet.getDataRange().getValues();
  const prodData   = prodSheet.getDataRange().getValues();
  const sh = stockData[0];
  const ph = prodData[0];

  const today = new Date(); today.setHours(0, 0, 0, 0);

  // สร้าง map ข้อมูลสินค้า
  const warnMap  = {};
  const unitMap  = {};
  for (let i = 1; i < prodData.length; i++) {
    const bc = String(prodData[i][ph.indexOf("Barcode")]);
    warnMap[bc] = {
      shelfLife: Number(prodData[i][ph.indexOf("StandardShelfLifeDays")]) || 10,
      warnPct:   Number(prodData[i][ph.indexOf("WarningPercentage")])     || 20,
      warnDays:  prodData[i][ph.indexOf("WarningDays")]
    };
    unitMap[bc] = prodData[i][ph.indexOf("DefaultUnit")] || "";
  }

  const allLots       = [];
  const productTotals = {};
  let expiringCount   = 0;
  let expiredCount    = 0;

  for (let i = 1; i < stockData.length; i++) {
    const row = stockData[i];
    const qty = Number(row[sh.indexOf("Qty")] || 0);
    if (qty <= 0) continue;

    const barcode     = String(row[sh.indexOf("Barcode")]     || "");
    const productName = String(row[sh.indexOf("ProductName")] || "");
    const mfg         = formatCellDate(row[sh.indexOf("MFG")]);
    const exp         = formatCellDate(row[sh.indexOf("EXP")]);
    const unit        = unitMap[barcode] || "";

    const expDate    = parseLocalDate(exp);   // ใช้ local date ไม่ใช่ UTC
    const expireDays = Math.round((expDate - today) / (1000 * 60 * 60 * 24));

    const warn      = warnMap[barcode] || { shelfLife: 10, warnPct: 20, warnDays: "" };
    const threshold = warn.warnDays ? Number(warn.warnDays) : Math.ceil(warn.shelfLife * warn.warnPct / 100);

    let expireStatus    = "ปกติ";
    let qcStatus        = "✅ ผ่าน";
    if (expireDays < 0) {
      expireStatus = "หมดอายุ"; qcStatus = "❌ หมดอายุ"; expiredCount++;
    } else if (expireDays <= threshold) {
      expireStatus = "ใกล้หมดอายุ"; qcStatus = "⚠️ ใกล้หมด"; expiringCount++;
    }

    allLots.push({ Barcode: barcode, ProductName: productName, MFG: mfg, EXP: exp, Qty: qty, Unit: unit, ExpireDays: expireDays, ExpireStatus: expireStatus, QcShelfLifeStatus: qcStatus });

    if (!productTotals[barcode]) {
      productTotals[barcode] = { ProductName: productName, TotalQty: 0, Unit: unit, LotCount: 0 };
    }
    productTotals[barcode].TotalQty += qty;
    productTotals[barcode].LotCount++;
  }

  return {
    ok: true,
    allLots,
    summary: { totalProducts: Object.keys(productTotals).length, totalLots: allLots.length, expiringLots: expiringCount, expiredLots: expiredCount },
    totalByProduct: Object.values(productTotals),
    expiringLots:   allLots.filter(l => l.ExpireStatus === "ใกล้หมดอายุ").sort((a, b) => a.ExpireDays - b.ExpireDays),
    expiredLots:    allLots.filter(l => l.ExpireStatus === "หมดอายุ").sort((a, b) => a.ExpireDays - b.ExpireDays)
  };
}

// ══════════════════════════════════════════
// 📖 BOM — Bill of Materials (สูตรการผลิต)
// ══════════════════════════════════════════

function bomGetList() {
  const sheet = getSheet("BOM");
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, boms: [] };
  const h = data[0];
  const map = {};
  for (var i = 1; i < data.length; i++) {
    var row = {};
    h.forEach(function(k, idx) { row[k] = data[i][idx]; });
    var bc = String(row.ProductBarcode);
    if (!map[bc]) map[bc] = { barcode: bc, name: String(row.ProductName), factory: String(row.Factory), materials: [] };
    map[bc].materials.push({ sku: String(row.MaterialSKU), name: String(row.MaterialName), qtyPerUnit: Number(row.QtyPerUnit)||0, unit: String(row.Unit) });
  }
  return { ok: true, boms: Object.values(map) };
}

// ══════════════════════════════════════════
// 🩺 สุขภาพข้อมูล BOM
// ตรวจว่า "สูตรการผลิต" พร้อมพอที่จะเอาไปเทียบยอดใช้จริงหรือยัง
// ชี้ไปที่ข้อมูลที่ขาด ไม่ได้ชี้ไปที่ตัวบุคคล
// ══════════════════════════════════════════

function bomHealthReport() {
  // ── 1) สูตรทั้งหมด ──
  var bomSheet = getSheet("BOM");
  var bomData  = bomSheet.getDataRange().getValues();
  var bomByProduct = {};   // barcode -> { name, factory, materials:[] }
  var whereUsed    = {};   // materialSKU -> [{barcode, productName, qtyPerUnit, unit}]
  var badQtyPerUnit = [];  // บรรทัดสูตรที่จำนวนต่อหน่วยเป็น 0/ติดลบ
  if (bomData.length > 1) {
    var bh = bomData[0];
    var iBc = bh.indexOf("ProductBarcode"), iPn = bh.indexOf("ProductName"),
        iFc = bh.indexOf("Factory"), iSku = bh.indexOf("MaterialSKU"),
        iMn = bh.indexOf("MaterialName"), iQpu = bh.indexOf("QtyPerUnit"), iU = bh.indexOf("Unit");
    for (var i = 1; i < bomData.length; i++) {
      var bc  = String(bomData[i][iBc] || "").trim();
      if (!bc) continue;
      var sku = String(bomData[i][iSku] || "").trim();
      var qpu = Number(bomData[i][iQpu]) || 0;
      var un  = String(bomData[i][iU] || "").trim();
      var pn  = String(bomData[i][iPn] || "");
      var mn  = String(bomData[i][iMn] || "");
      if (!bomByProduct[bc]) bomByProduct[bc] = { name: pn, factory: String(bomData[i][iFc] || ""), materials: [] };
      bomByProduct[bc].materials.push({ sku: sku, name: mn, qtyPerUnit: qpu, unit: un });
      if (qpu <= 0) badQtyPerUnit.push({ barcode: bc, productName: pn, materialSku: sku, materialName: mn, qtyPerUnit: qpu });
      if (sku) {
        if (!whereUsed[sku]) whereUsed[sku] = [];
        whereUsed[sku].push({ barcode: bc, productName: pn, qtyPerUnit: qpu, unit: un });
      }
    }
  }

  // ── 2) สินค้าที่ขึ้นทะเบียนไว้ ──
  var prodSheet = getSheet("ColdRoom_Products");
  var prodData  = prodSheet.getDataRange().getValues();
  var products  = {};  // barcode -> name
  if (prodData.length > 1) {
    var ph = prodData[0];
    var pBc = ph.indexOf("Barcode"), pNm = ph.indexOf("ProductName");
    for (var p = 1; p < prodData.length; p++) {
      var pbc = String(prodData[p][pBc] || "").trim();
      if (pbc) products[pbc] = String(prodData[p][pNm] || "");
    }
  }

  // ── 3) สินค้าที่ "ผลิตจริง" จากใบสั่งผลิต (อ่าน 200 ใบล่าสุด) ──
  var woSheet = getSheet("ColdRoom_WorkOrders");
  var woLast  = woSheet.getLastRow();
  var producedCount = {};   // barcode -> จำนวนครั้งที่ปรากฏในใบสั่งผลิต
  if (woLast > 1) {
    var wh  = woSheet.getRange(1, 1, 1, woSheet.getLastColumn()).getValues()[0];
    var wN  = Math.min(200, woLast - 1);
    var wd  = woSheet.getRange(woLast - wN + 1, 1, wN, wh.length).getValues();
    var wIt = wh.indexOf("Items");
    for (var w = 0; w < wd.length; w++) {
      try {
        var its = JSON.parse(wd[w][wIt] || "[]");
        for (var t = 0; t < its.length; t++) {
          var ibc = String(its[t].barcode || "").trim();
          if (ibc) producedCount[ibc] = (producedCount[ibc] || 0) + 1;
        }
      } catch (e) { /* ใบที่ JSON เสีย ข้ามไป */ }
    }
  }

  // ── 4) วัตถุดิบในคลัง (ทั้ง 2 โรงงาน) ──
  var matBySku = {};                        // sku -> { name, unit, dailyUsage, discontinued, module }
  var matByName = { SQF: {}, MLM: {} };     // แยกตามโรงงาน — ชื่อซ้ำข้ามโรงงานได้ (เช่น "น้ำตาล")
  ["SQF", "MLM"].forEach(function(mod) {
    var s = getSheet(mod + "_Materials");
    var d = s.getDataRange().getValues();
    if (d.length <= 1) return;
    var mh = d[0];
    var cS = mh.indexOf("SKU"), cN = mh.indexOf("Name"), cU = mh.indexOf("Unit"),
        cD = mh.indexOf("DailyUsage"), cX = mh.indexOf("Discontinued");
    for (var m = 1; m < d.length; m++) {
      var sk = String(d[m][cS] || "").trim();
      if (!sk) continue;
      var disc = d[m][cX] === true || String(d[m][cX]).toUpperCase() === "TRUE";
      var nm = String(d[m][cN] || "").trim();
      matBySku[sk] = { name: nm, unit: String(d[m][cU] || "").trim(), dailyUsage: Number(d[m][cD]) || 0, discontinued: disc, module: mod };
      if (nm) matByName[mod][nm] = sk;
    }
  });

  // ── 5) วัตถุดิบที่ถูกเบิกจริง (อ่านประวัติ 300 แถวล่าสุดต่อโรงงาน) ──
  // ประวัติเก็บแค่ "ชื่อ" ไม่มี SKU จึงต้องจับคู่ชื่อ "ภายในโรงงานเดียวกัน" เท่านั้น
  var withdrawn = {};   // key "MOD ชื่อ" -> { module, name, count, qty }
  ["SQF", "MLM"].forEach(function(mod) {
    var s = getSheet(mod + "_History");
    var last = s.getLastRow();
    if (last <= 1) return;
    var hh = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
    var n  = Math.min(300, last - 1);
    var d  = s.getRange(last - n + 1, 1, n, hh.length).getValues();
    var cN = hh.indexOf("Name"), cA = hh.indexOf("Action"), cQ = hh.indexOf("Qty");
    for (var r = 0; r < d.length; r++) {
      if (String(d[r][cA] || "") !== "เบิกออก") continue;
      var nm = String(d[r][cN] || "").trim();
      if (!nm) continue;
      var key = mod + " " + nm;
      if (!withdrawn[key]) withdrawn[key] = { module: mod, name: nm, count: 0, qty: 0 };
      withdrawn[key].count++;
      withdrawn[key].qty += Number(d[r][cQ]) || 0;
    }
  });

  // ══ ตรวจสุขภาพ ══
  var bomSkuSet = {};
  Object.keys(whereUsed).forEach(function(sk) { bomSkuSet[sk] = true; });

  // A) สินค้าที่ผลิตจริง แต่ยังไม่มีสูตร  ← ตัวชี้วัดสำคัญที่สุด
  var producedBarcodes = Object.keys(producedCount);
  var missingBom = [];
  producedBarcodes.forEach(function(bc) {
    if (!bomByProduct[bc]) {
      missingBom.push({ barcode: bc, productName: products[bc] || "(ไม่พบในทะเบียนสินค้า)", orderCount: producedCount[bc] });
    }
  });
  missingBom.sort(function(a, b) { return b.orderCount - a.orderCount; });

  // B) สินค้าในทะเบียนที่ยังไม่มีสูตร (ภาพรวม)
  var allBarcodes = Object.keys(products);
  var registeredWithBom = allBarcodes.filter(function(bc) { return !!bomByProduct[bc]; }).length;

  // C) หน่วยในสูตรไม่ตรงกับหน่วยในคลัง
  var unitMismatch = [];
  Object.keys(whereUsed).forEach(function(sk) {
    var mat = matBySku[sk];
    if (!mat || !mat.unit) return;
    whereUsed[sk].forEach(function(u) {
      if (u.unit && u.unit !== mat.unit) {
        unitMismatch.push({ materialSku: sk, materialName: mat.name, bomUnit: u.unit, stockUnit: mat.unit, productName: u.productName, barcode: u.barcode });
      }
    });
  });

  // D) สูตรอ้างวัตถุดิบที่ไม่มีในคลัง
  var orphanMaterial = [];
  Object.keys(whereUsed).forEach(function(sk) {
    if (!matBySku[sk]) {
      orphanMaterial.push({ materialSku: sk, materialName: whereUsed[sk][0].name || "", usedIn: whereUsed[sk].length });
    }
  });

  // E) วัตถุดิบที่ถูกเบิกจริง แต่ไม่อยู่ในสูตรไหนเลย
  //    + F2) ชื่อในประวัติที่จับคู่กับวัตถุดิบในคลังไม่ได้ (มักเกิดจากเปลี่ยนชื่อภายหลัง)
  var notInAnyBom = [];
  var unmatchedHistory = [];
  Object.keys(withdrawn).forEach(function(key) {
    var w  = withdrawn[key];
    var sk = matByName[w.module][w.name];
    var qty = Math.round(w.qty * 1000) / 1000;
    if (!sk) {                             // จับคู่ชื่อไม่ได้ → ประวัติอ้างกลับไม่ได้
      unmatchedHistory.push({ name: w.name, module: w.module, outCount: w.count, outQty: qty });
      return;
    }
    if (bomSkuSet[sk]) return;             // อยู่ในสูตรแล้ว
    var mat = matBySku[sk];
    if (mat && mat.discontinued) return;   // ยกเลิกใช้แล้ว ไม่ต้องเตือน
    notInAnyBom.push({ sku: sk, name: w.name, module: w.module, outCount: w.count, outQty: qty });
  });
  notInAnyBom.sort(function(a, b) { return b.outCount - a.outCount; });
  unmatchedHistory.sort(function(a, b) { return b.outCount - a.outCount; });

  // F) ค่าใช้ต่อวันที่ยังไม่ได้ตั้ง (ใช้เป็น baseline ไม่ได้)
  var badDailyUsage = [];
  Object.keys(matBySku).forEach(function(sk) {
    var m = matBySku[sk];
    if (m.discontinued) return;
    if (!(m.dailyUsage > 0)) badDailyUsage.push({ sku: sk, name: m.name, module: m.module, dailyUsage: m.dailyUsage });
  });

  // ══ สรุปความพร้อม ══
  var producedTotal   = producedBarcodes.length;
  var producedWithBom = producedTotal - missingBom.length;
  var coveragePct     = producedTotal > 0 ? Math.round((producedWithBom / producedTotal) * 100) : 0;
  var readiness, readinessNote;
  if (producedTotal === 0) {
    readiness = "ยังไม่มีข้อมูล";
    readinessNote = "ยังไม่มีใบสั่งผลิตให้ตรวจ — สร้างใบสั่งผลิตก่อน";
  } else if (coveragePct >= 80 && unitMismatch.length === 0) {
    readiness = "พร้อม";
    readinessNote = "ข้อมูลสูตรครอบคลุมพอที่จะเทียบยอดใช้จริงได้";
  } else if (coveragePct >= 50) {
    readiness = "เกือบพร้อม";
    readinessNote = "ยังขาดสูตรบางส่วน ตัวเลขเทียบจะไม่ครบทุกรายการ";
  } else {
    readiness = "ยังไม่พร้อม";
    readinessNote = "สูตรครอบคลุมน้อยเกินไป ถ้าเทียบตอนนี้ตัวเลขจะเพี้ยน";
  }

  return {
    ok: true,
    summary: {
      readiness: readiness,
      readinessNote: readinessNote,
      coveragePct: coveragePct,
      producedTotal: producedTotal,
      producedWithBom: producedWithBom,
      registeredTotal: allBarcodes.length,
      registeredWithBom: registeredWithBom,
      bomProductCount: Object.keys(bomByProduct).length,
      bomMaterialCount: Object.keys(whereUsed).length,
      issueCount: missingBom.length + unitMismatch.length + orphanMaterial.length + badQtyPerUnit.length
    },
    missingBom: missingBom,
    unitMismatch: unitMismatch,
    orphanMaterial: orphanMaterial,
    badQtyPerUnit: badQtyPerUnit,
    notInAnyBom: notInAnyBom,
    unmatchedHistory: unmatchedHistory,
    badDailyUsage: badDailyUsage,
    whereUsed: whereUsed
  };
}

function bomGetForProduct(barcode) {
  if (!barcode) return { ok: false, message: "ไม่ระบุ barcode" };
  const sheet = getSheet("BOM");
  const data  = sheet.getDataRange().getValues();
  const h = data[0];
  const result = { barcode: barcode, name: "", factory: "", materials: [] };
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][h.indexOf("ProductBarcode")]) !== String(barcode)) continue;
    var row = {};
    h.forEach(function(k, idx) { row[k] = data[i][idx]; });
    if (!result.factory) { result.factory = String(row.Factory); result.name = String(row.ProductName); }
    result.materials.push({ sku: String(row.MaterialSKU), name: String(row.MaterialName), qtyPerUnit: Number(row.QtyPerUnit)||0, unit: String(row.Unit) });
  }
  // แนบ stock ปัจจุบันจาก factory sheet
  if (result.factory && result.materials.length > 0) {
    var matSheet = getSheet(result.factory + "_Materials");
    var matData  = matSheet.getDataRange().getValues();
    var mh = matData[0];
    var stockMap = {};
    for (var j = 1; j < matData.length; j++) {
      var sku = String(matData[j][mh.indexOf("SKU")]);
      stockMap[sku] = { qty: Number(matData[j][mh.indexOf("Qty")])||0, dailyUsage: Number(matData[j][mh.indexOf("DailyUsage")])||0, unit: String(matData[j][mh.indexOf("Unit")]||"") };
    }
    result.materials = result.materials.map(function(m) {
      var s = stockMap[m.sku] || { qty: 0, dailyUsage: 0, unit: m.unit };
      return Object.assign({}, m, { currentQty: s.qty, dailyUsage: s.dailyUsage });
    });
  }
  return { ok: true, bom: result };
}

function bomSave(payload) {
  var barcode = payload.barcode, name = payload.name, factory = payload.factory, materials = payload.materials || [];
  if (!barcode || !factory) return { ok: false, message: "ข้อมูลไม่ครบ (barcode/factory)" };
  var sheet = getSheet("BOM");
  ensureColumns(sheet, ["BomID","ProductBarcode","ProductName","Factory","MaterialSKU","MaterialName","QtyPerUnit","Unit"]);
  // ลบ BOM เดิมของสินค้านี้
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]) === String(barcode)) sheet.deleteRow(i + 1);
  }
  // เพิ่ม BOM ใหม่
  materials.forEach(function(m, idx) {
    var bomId = "BOM-" + String(barcode).replace(/[^a-zA-Z0-9]/g,"").substring(0,8) + "-" + String(idx+1).padStart(3,"0");
    sheet.appendRow([bomId, barcode, name, factory, m.sku, m.name, Number(m.qtyPerUnit)||0, m.unit]);
  });
  return { ok: true, saved: materials.length };
}

function bomDelete(barcode) {
  if (!barcode) return { ok: false, message: "ไม่ระบุ barcode" };
  var sheet = getSheet("BOM");
  var data  = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]) === String(barcode)) sheet.deleteRow(i + 1);
  }
  return { ok: true };
}

function bomCalcWorkOrder(payload) {
  // payload.items = [{barcode, produceQty}]
  var items = payload.items || [];
  if (!items.length) return { ok: false, message: "ไม่มีรายการสินค้า" };

  // โหลด BOM ทั้งหมด
  var bomSheet = getSheet("BOM");
  var bomData  = bomSheet.getDataRange().getValues();
  var bomH = bomData[0];
  var bomMap = {};
  for (var i = 1; i < bomData.length; i++) {
    var bc = String(bomData[i][bomH.indexOf("ProductBarcode")]);
    var factory = String(bomData[i][bomH.indexOf("Factory")]);
    var sku  = String(bomData[i][bomH.indexOf("MaterialSKU")]);
    var matName = String(bomData[i][bomH.indexOf("MaterialName")]);
    var qpu  = Number(bomData[i][bomH.indexOf("QtyPerUnit")])||0;
    var unit = String(bomData[i][bomH.indexOf("Unit")]);
    if (!bomMap[bc]) bomMap[bc] = { factory: factory, skus: {} };
    if (!bomMap[bc].skus[sku]) bomMap[bc].skus[sku] = { name: matName, totalNeeded: 0, unit: unit };
    bomMap[bc].skus[sku].totalNeeded += qpu; // base per unit
  }

  // รวม material ที่ต้องการทั้งหมด แยกตาม factory
  var neededByFactory = {}; // { factory: { sku: { name, needed, unit } } }
  var noBom = [];
  items.forEach(function(item) {
    var bom = bomMap[item.barcode];
    if (!bom) { noBom.push(item.barcode); return; }
    var factory = bom.factory;
    if (!neededByFactory[factory]) neededByFactory[factory] = {};
    Object.entries(bom.skus).forEach(function(pair) {
      var sku = pair[0], mat = pair[1];
      if (!neededByFactory[factory][sku]) neededByFactory[factory][sku] = { name: mat.name, needed: 0, unit: mat.unit };
      neededByFactory[factory][sku].needed += mat.totalNeeded * Number(item.produceQty);
    });
  });

  // แนบ stock ปัจจุบัน
  var result = {};
  Object.keys(neededByFactory).forEach(function(factory) {
    var matSheet = getSheet(factory + "_Materials");
    var matData  = matSheet.getDataRange().getValues();
    var mh = matData[0];
    var stockMap = {};
    for (var j = 1; j < matData.length; j++) {
      stockMap[String(matData[j][mh.indexOf("SKU")])] = {
        qty: Number(matData[j][mh.indexOf("Qty")])||0,
        dailyUsage: Number(matData[j][mh.indexOf("DailyUsage")])||0
      };
    }
    result[factory] = Object.entries(neededByFactory[factory]).map(function(pair) {
      var sku = pair[0], mat = pair[1];
      var s = stockMap[sku] || { qty: 0, dailyUsage: 0 };
      var remaining = s.qty - mat.needed;
      var daysAfter = s.dailyUsage > 0 ? Math.floor(remaining / s.dailyUsage) : null;
      var daysBefore = s.dailyUsage > 0 ? Math.floor(s.qty / s.dailyUsage) : null;
      return { sku: sku, name: mat.name, needed: mat.needed, unit: mat.unit, currentQty: s.qty, remaining: remaining, dailyUsage: s.dailyUsage, daysBefore: daysBefore, daysAfter: daysAfter, sufficient: remaining >= 0 };
    });
  });
  return { ok: true, materials: result, noBom: noBom };
}

function crClearLotStock(payload) {
  const { barcode, mfg, reason, employeeName } = payload;
  const mfgIso = (typeof mfg === "string" && mfg.includes("-")) ? mfg : ddmmyyToIso(mfg);

  const sheet = getSheet("ColdRoom_Stock");
  ensureColumns(sheet, ["Note", "EmployeeName", "DeviceInfo", "UpdatedAt"]);
  const data  = sheet.getDataRange().getValues();
  const h = data[0];

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][h.indexOf("Barcode")])     === String(barcode) &&
        formatCellDate(data[i][h.indexOf("MFG")]) === mfgIso) {
      const name = String(data[i][h.indexOf("ProductName")]);
      sheet.getRange(i + 1, h.indexOf("Qty")          + 1).setValue(0);
      sheet.getRange(i + 1, h.indexOf("Note")         + 1).setValue("นำออก: " + reason);
      sheet.getRange(i + 1, h.indexOf("EmployeeName") + 1).setValue(employeeName);
      sheet.getRange(i + 1, h.indexOf("DeviceInfo")   + 1).setValue(_reqDeviceName || "");
      sheet.getRange(i + 1, h.indexOf("UpdatedAt")    + 1).setValue(new Date().toISOString());
      var tg = crSendTelegram("🗑️ นำสินค้าออกสต๊อก ❄️\n📦 " + name + "\n📅 MFG: " + mfg + "\n💬 " + (reason||"-") + "\n👤 " + (employeeName||"-") + deviceTag());
      return { ok: true, tgSent: tg ? tg.sent : false, tgError: (tg && !tg.sent) ? tg.reason : null };
    }
  }
  return { ok: false, message: "ไม่พบรายการ" };
}

// ══════════════════════════════════════════
// 📋 ใบสั่งผลิต (Work Order)
// ══════════════════════════════════════════

function crSaveWorkOrder(payload) {
  const { orderId, date, note, createdBy } = payload;
  const items = payload.items;
  if (!orderId || !Array.isArray(items) || !items.length) return { ok: false, message: "ข้อมูลไม่ครบ" };
  // Validate items
  for (var k = 0; k < items.length; k++) {
    var it = items[k];
    if (!it.barcode || !it.name) return { ok: false, message: "รายการสินค้าไม่ครบ (ข้อ " + (k+1) + ")" };
    if (_validateQty(it.qty, true) <= 0) return { ok: false, message: "จำนวนต้องมากกว่า 0 (ข้อ " + (k+1) + ")" };
  }
  const sheet    = getSheet("ColdRoom_WorkOrders");
  ensureColumns(sheet, ["Status"]);
  const itemsJson = JSON.stringify(items);
  const summary  = items.map(i => `${i.name} (${i.mfg}) x${i.qty}`).join(", ");
  sheet.appendRow([orderId, date || new Date().toISOString().slice(0,10), itemsJson, note||"", createdBy||"", new Date().toISOString(), "รอดำเนินการ"]);
  crSendTelegram(`📋 ใบสั่งผลิตใหม่\n🔖 ${orderId}\n${summary}\n👤 ${createdBy}${deviceTag()}`);
  return { ok: true };
}

function crDeleteWorkOrder(payload) {
  var orderId  = String(payload.orderId  || "").trim();
  var username = String(payload.username || "").trim();
  if (!orderId) return { ok: false, message: "ไม่ระบุรหัสใบสั่งผลิต" };
  var sheet = getSheet("ColdRoom_WorkOrders");
  ensureColumns(sheet, ["Status"]);
  var data = sheet.getDataRange().getValues();
  var h = data[0];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][h.indexOf("OrderID")]) === orderId) {
      var status = String(data[i][h.indexOf("Status")] || "รอดำเนินการ");
      if (status === "เสร็จสิ้น") {
        return { ok: false, message: "ไม่สามารถลบได้ — ใบสั่งผลิตเสร็จสิ้นแล้ว" };
      }
      sheet.deleteRow(i + 1);
      crSendTelegramGeneric("🗑️ ลบใบสั่งผลิต\n🔖 " + orderId + "\n👤 " + username + deviceTag());
      return { ok: true };
    }
  }
  return { ok: false, message: "ไม่พบใบสั่งผลิต " + orderId };
}

function crGetWorkOrders() {
  const sheet = getSheet("ColdRoom_WorkOrders");
  ensureColumns(sheet, ["Status"]);
  const data  = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true, orders: [] };
  const h = data[0];
  const orders = data.slice(1).reverse().slice(0,50).map(row => {
    const o = {};
    h.forEach((k, i) => {
      var v = row[i];
      // Date object จาก Google Sheets → แปลงเป็น ISO string
      if (v instanceof Date) {
        o[k] = v.toISOString().slice(0, 10);
      } else {
        o[k] = v;
      }
    });
    // Items ต้องเป็น string JSON เสมอ
    if (o.Items !== undefined && typeof o.Items !== "string") {
      o.Items = o.Items ? JSON.stringify(o.Items) : "";
    }
    return o;
  });
  return { ok: true, orders };
}

function crGetColdRoomProducts() {
  const sheet = getSheet("ColdRoom_Products");
  crEnsureProductCols(sheet); // ✅ ตรวจสอบคอลัมน์ก่อนอ่าน
  const data  = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true, products: [] };
  const h = data[0];
  const products = data.slice(1).map(row => {
    const p = {}; h.forEach((k,i) => { p[k] = row[i]; }); return p;
  });
  return { ok: true, products };
}

function crGetAlertSettings() {
  const sheet = getSheet("Config");
  const data  = sheet.getDataRange().getValues();
  const map   = {};
  for (let i = 1; i < data.length; i++) { map[data[i][0]] = data[i][1]; }
  return { ok: true, settings: {
    telegramBotName:           map.telegramBotName           || "",
    telegramBotToken:          map.telegramBotToken          || "",
    telegramChatIds:           map.telegramChatIds           || "",
    enableTelegramStockUpdate: map.enableTelegramStockUpdate || "true"
  }};
}

function crSaveAlertSettings(payload) {
  const keys = [
    "telegramBotName","telegramBotToken","telegramChatIds","enableTelegramStockUpdate"
  ];
  const sheet = getSheet("Config");
  const data  = sheet.getDataRange().getValues();

  keys.forEach(key => {
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === key) {
        sheet.getRange(i + 1, 2).setValue(payload[key] !== undefined ? payload[key] : "");
        found = true; break;
      }
    }
    if (!found) sheet.appendRow([key, payload[key] !== undefined ? payload[key] : ""]);
  });
  return { ok: true };
}


function crSendTelegram(message) {
  try {
    message = _maskNames(String(message));   // พรางชื่อเจ้าของระบบในแชทด้วย (คนในกลุ่มอาจไม่ใช่แอดมินทุกคน)
    const s = crGetAlertSettings().settings;
    // รองรับทั้ง string "true" และ boolean true จาก Google Sheets
    const enabled = String(s.enableTelegramStockUpdate).toLowerCase();
    if (enabled === "false" || enabled === "") return { sent: false, reason: "disabled" };
    const token   = String(s.telegramBotToken || "").trim();
    const chatIds = String(s.telegramChatIds  || "").split(",").map(c => c.trim()).filter(Boolean);
    if (!token)           return { sent: false, reason: "no token" };
    if (!chatIds.length)  return { sent: false, reason: "no chatId" };
    var errors = [];
    chatIds.forEach(function(chatId) {
      try {
        var resp = UrlFetchApp.fetch(
          "https://api.telegram.org/bot" + token + "/sendMessage",
          { method: "post", contentType: "application/json",
            payload: JSON.stringify({ chat_id: chatId, text: message }),
            muteHttpExceptions: true }
        );
        var result = JSON.parse(resp.getContentText());
        if (!result.ok) errors.push(chatId + ": " + result.description);
      } catch (ex) { errors.push(chatId + ": " + ex.toString()); }
    });
    if (errors.length) { Logger.log("Telegram errors: " + errors.join(" | ")); return { sent: false, reason: errors.join(", ") }; }
    return { sent: true };
  } catch (e) {
    Logger.log("crSendTelegram fatal: " + e.toString());
    return { sent: false, reason: e.toString() };
  }
}

// ============================================================
// 🗄️ ARCHIVE — ย้ายสต๊อกเก่าไป Archive sheet
// ตั้ง Time Trigger: ทุกวันอาทิตย์ หรือเรียกผ่าน action "archiveOldStock"
// ============================================================

function archiveOldStock(payload) {
  if (payload && payload.adminToken && !verifyAdminToken(payload.adminToken)) {
    return { ok: false, message: "ไม่มีสิทธิ์" };
  }

  var stockSheet = getSheet("ColdRoom_Stock");
  var data = stockSheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true, archived: 0, message: "ไม่มีข้อมูล" };

  var h = data[0];
  var qtyIdx = h.indexOf("Qty");
  var expIdx = h.indexOf("EXP");

  // Archive sheet — สร้างถ้ายังไม่มี
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var archiveSheet = ss.getSheetByName("ColdRoom_Stock_Archive");
  if (!archiveSheet) {
    archiveSheet = ss.insertSheet("ColdRoom_Stock_Archive");
    archiveSheet.appendRow(h);
    archiveSheet.getRange(1, 1, 1, h.length).setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
    archiveSheet.setFrozenRows(1);
  }

  var today = new Date(); today.setHours(0, 0, 0, 0);
  var sixMonthsAgo = new Date(today); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  var rowsToArchive = []; // เก็บ row index (1-based) ที่จะลบ (เรียงจากมากไปน้อย)

  for (var i = data.length - 1; i >= 1; i--) {
    var qty = Number(data[i][qtyIdx] || 0);
    var expVal = data[i][expIdx];
    var expDate = expVal ? new Date(formatCellDate(expVal)) : null;

    var shouldArchive = false;
    if (qty <= 0) shouldArchive = true;
    if (expDate && !isNaN(expDate) && expDate < sixMonthsAgo) shouldArchive = true;

    if (shouldArchive) {
      archiveSheet.appendRow(data[i]);
      rowsToArchive.push(i + 1); // +1 for 1-based sheet row
    }
  }

  // ลบจาก sheet หลัก (จากล่างขึ้นบนเพื่อไม่ให้ index เลื่อน)
  for (var j = 0; j < rowsToArchive.length; j++) {
    stockSheet.deleteRow(rowsToArchive[j]);
  }

  return { ok: true, archived: rowsToArchive.length, message: "ย้าย " + rowsToArchive.length + " รายการไป Archive แล้ว" };
}

// ============================================================
// ⏰ EXPIRY ALERT — แจ้งเตือนวันหมดอายุผ่าน Telegram
// ตั้ง Time Trigger: GAS Editor → Triggers → Add Trigger
//   Function: checkExpiryAlerts | Time-driven | Day timer | 8am–9am
// ============================================================

function checkExpiryAlerts() {
  try {
    var s = crGetAlertSettings().settings;
    var token   = String(s.telegramBotToken || "").trim();
    var chatIds = String(s.telegramChatIds  || "").split(",").map(function(c){ return c.trim(); }).filter(Boolean);
    if (!token || !chatIds.length) return;

    var tz       = "Asia/Bangkok";
    var todayKey = Utilities.formatDate(new Date(), tz, "yyyyMMdd");
    var sp       = PropertiesService.getScriptProperties();
    var props    = sp.getProperties();
    var now      = new Date();
    var expired  = [];
    var warning  = [];

    ["SQF", "MLM"].forEach(function(mod) {
      try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(mod + "_Materials");
        if (!sheet) return;
        var data = sheet.getDataRange().getValues();
        if (data.length < 2) return;
        var h       = data[0];
        var iSku    = h.indexOf("SKU");
        var iName   = h.indexOf("Name");
        var iExp    = h.indexOf("ExpiryDate");
        var iAlert  = h.indexOf("AlertDays");
        var iDis    = h.indexOf("Discontinued");
        if (iName < 0 || iExp < 0) return;

        for (var i = 1; i < data.length; i++) {
          if (iDis >= 0 && (data[i][iDis] === true || String(data[i][iDis]).toUpperCase() === "TRUE")) continue;
          var expRaw = String(data[i][iExp] || "").trim();
          if (!expRaw) continue;
          var name_      = String(data[i][iName]  || "").trim();
          var sku_       = iSku   >= 0 ? String(data[i][iSku]  || "").trim() : "";
          var alertDays_ = iAlert >= 0 ? (Number(data[i][iAlert]) || 7) : 7;

          // แปลง ExpiryDate → Date (รองรับ dd/mm/yyyy และ yyyy-mm-dd)
          var expDate = null;
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(expRaw)) {
            var p = expRaw.split("/");
            expDate = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
          } else if (/^\d{4}-\d{2}-\d{2}/.test(expRaw)) {
            var p2 = expRaw.slice(0, 10).split("-");
            expDate = new Date(Number(p2[0]), Number(p2[1]) - 1, Number(p2[2]));
          }
          if (!expDate || isNaN(expDate)) continue;

          var daysLeft = Math.round((expDate - now) / 86400000);
          if (daysLeft > alertDays_ || daysLeft < -30) continue;

          // dedup รายวัน
          var safeId   = (sku_ || name_).replace(/[^A-Za-z0-9\u0E00-\u0E7F]/g, "_").slice(0, 40);
          var dedupKey = "expd_" + todayKey + "_" + mod + "_" + safeId;
          if (props[dedupKey]) continue;

          var label  = mod === "SQF" ? "🏭SQF" : "🏭MLM";
          var expThai = String(expDate.getDate()).padStart(2,"0") + "/" +
                        String(expDate.getMonth()+1).padStart(2,"0") + "/" +
                        (expDate.getFullYear()+543);
          var entry = label + " " + name_ + (sku_ ? " ("+sku_+")" : "") +
                      "  •  หมดอายุ " + expThai;
          if (daysLeft < 0) {
            expired.push("❌ " + entry + "  (เกินมาแล้ว " + Math.abs(daysLeft) + " วัน)");
          } else {
            warning.push("⚠️ " + entry + "  (เหลือ " + daysLeft + " วัน)");
          }

          var toSet = {}; toSet[dedupKey] = "1"; sp.setProperties(toSet);
        }
      } catch(e) { Logger.log("checkExpiryAlerts err " + mod + ": " + e); }
    });

    if (!expired.length && !warning.length) return;

    var ts      = Utilities.formatDate(now, tz, "dd/MM/yyyy HH:mm");
    var total   = expired.length + warning.length;
    var summary = "พบ " + total + " รายการ";
    if (expired.length) summary += "  •  ❌ หมดอายุแล้ว " + expired.length + " รายการ";
    if (warning.length) summary += "  •  ⚠️ ใกล้หมด " + warning.length + " รายการ";
    var msg = "⏰ แจ้งเตือนวันหมดอายุวัตถุดิบ\n" + ts + "\n" + summary + "\n";
    if (expired.length) msg += "\n" + expired.join("\n");
    if (warning.length) msg += "\n" + warning.join("\n");
    msg += "\n\nกรุณาตรวจสอบและจัดการโดยด่วน";

    chatIds.forEach(function(chatId) {
      try {
        UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
          method: "post", contentType: "application/json",
          payload: JSON.stringify({ chat_id: chatId, text: msg }),
          muteHttpExceptions: true
        });
      } catch(e) { Logger.log("checkExpiryAlerts Telegram err: " + e); }
    });

    // ลบ dedup keys เก่า
    var allProps = sp.getProperties();
    Object.keys(allProps).forEach(function(k) {
      if (k.startsWith("expd_") && !k.startsWith("expd_" + todayKey)) sp.deleteProperty(k);
    });
  } catch(e) { Logger.log("checkExpiryAlerts fatal: " + e.toString()); }
}

// ============================================================
// 📦 DELIVERY NOTES — ส่งยอดเข้าห้องเย็น + อนุมัติ
// ============================================================

function submitDelivery(payload) {
  var username = String(payload.username || "").trim();
  var woId     = String(payload.workOrderID || "").trim();
  var items    = payload.items || [];
  var note     = String(payload.note || "").trim();
  if (!username || !woId || !items.length) return { ok: false, message: "ข้อมูลไม่ครบ" };

  var woSheet = getSheet("ColdRoom_WorkOrders");
  ensureColumns(woSheet, ["Status"]);
  var woData = woSheet.getDataRange().getValues();
  var wh = woData[0]; var woRow = -1;
  for (var i = 1; i < woData.length; i++) {
    if (String(woData[i][wh.indexOf("OrderID")]) === woId) { woRow = i; break; }
  }
  if (woRow < 0) return { ok: false, message: "ไม่พบใบสั่งผลิต " + woId };
  var woStatus = String(woData[woRow][wh.indexOf("Status")] || "รอดำเนินการ");
  if (woStatus === "เสร็จสิ้น") return { ok: false, message: "ใบสั่งผลิตนี้อนุมัติแล้ว ไม่สามารถแก้ไขได้" };

  var dnSheet = getSheet("ColdRoom_DeliveryNotes");
  var dnData  = dnSheet.getDataRange().getValues();
  var dh = dnData[0]; var dnRow = -1;
  if (dnData.length > 1) {
    for (var j = 1; j < dnData.length; j++) {
      if (String(dnData[j][dh.indexOf("WorkOrderID")]) === woId) {
        if (String(dnData[j][dh.indexOf("Status")]) === "อนุมัติแล้ว") return { ok: false, message: "ใบส่งยอดนี้อนุมัติแล้ว ไม่สามารถแก้ไขได้" };
        dnRow = j; break;
      }
    }
  }

  var now = new Date().toISOString();
  var itemsJson = JSON.stringify(items);
  var dnId;
  if (dnRow >= 0) {
    dnId = String(dnData[dnRow][dh.indexOf("DeliveryID")]);
    dnSheet.getRange(dnRow+1, dh.indexOf("Items")+1).setValue(itemsJson);
    dnSheet.getRange(dnRow+1, dh.indexOf("SubmittedBy")+1).setValue(username);
    dnSheet.getRange(dnRow+1, dh.indexOf("SubmittedAt")+1).setValue(now);
    dnSheet.getRange(dnRow+1, dh.indexOf("Status")+1).setValue("อนุมัติแล้ว");
    dnSheet.getRange(dnRow+1, dh.indexOf("Note")+1).setValue(note);
    dnSheet.getRange(dnRow+1, dh.indexOf("ApprovedBy")+1).setValue(username);
    dnSheet.getRange(dnRow+1, dh.indexOf("ApprovedAt")+1).setValue(now);
  } else {
    dnId = "DN-" + Utilities.getUuid().slice(0,8).toUpperCase();
    var newRow = new Array(dh.length).fill("");
    var sc = function(k,v){ var idx=dh.indexOf(k); if(idx>=0) newRow[idx]=v; };
    sc("DeliveryID",dnId); sc("WorkOrderID",woId); sc("Items",itemsJson);
    sc("SubmittedBy",username); sc("SubmittedAt",now); sc("Status","อนุมัติแล้ว");
    sc("ApprovedBy",username); sc("ApprovedAt",now); sc("Note",note);
    dnSheet.appendRow(newRow);
  }
  // เพิ่มยอดเข้าคลังห้องเย็นทันที (auto-approve)
  var stockErrors = [];
  items.forEach(function(item){ try{ _addDeliveryToStock(item, username, username); }catch(e){ stockErrors.push(String(item.name||"")+": "+e.toString()); } });
  woSheet.getRange(woRow+1, wh.indexOf("Status")+1).setValue("เสร็จสิ้น");
  crSendTelegramGeneric("📦 ส่งยอดเข้าห้องเย็น\n🔖 "+woId+"\n👤 "+username+"\nยอดเข้าคลังอัตโนมัติ"+deviceTag());
  return stockErrors.length ? { ok: true, dnId: dnId, warnings: stockErrors } : { ok: true, dnId: dnId };
}

function getDeliveries(payload) {
  var username   = String(payload.username || "").trim();
  var filterStatus = payload.filterStatus || "";
  var isApprover = verifyApproverToken(payload.adminToken);

  var dnSheet = getSheet("ColdRoom_DeliveryNotes");
  var dnData  = dnSheet.getDataRange().getValues();
  if (dnData.length < 2) return { ok: true, deliveries: [] };
  var dh = dnData[0]; var deliveries = [];

  for (var i = 1; i < dnData.length; i++) {
    var row = dnData[i];
    var status    = String(row[dh.indexOf("Status")] || "");
    var submitter = String(row[dh.indexOf("SubmittedBy")] || "");
    if (!isApprover && submitter.toLowerCase() !== username.toLowerCase()) continue;
    if (filterStatus && status !== filterStatus) continue;
    var dn = {}; dh.forEach(function(k,idx){ dn[k]=row[idx]; });
    var sat = dn.SubmittedAt ? new Date(dn.SubmittedAt) : null;
    dn.SubmittedAtFmt = sat && !isNaN(sat) ? Utilities.formatDate(sat, Session.getScriptTimeZone(), "dd/MM/yy HH:mm") : String(dn.SubmittedAt||"");
    if (dn.ApprovedAt) { var aat=new Date(dn.ApprovedAt); dn.ApprovedAtFmt = !isNaN(aat) ? Utilities.formatDate(aat, Session.getScriptTimeZone(), "dd/MM/yy HH:mm") : String(dn.ApprovedAt); }
    deliveries.push(dn);
  }
  deliveries.sort(function(a,b){ return new Date(b.SubmittedAt)-new Date(a.SubmittedAt); });
  deliveries = deliveries.slice(0, 100); // จำกัด 100 ล่าสุด
  return { ok: true, deliveries: deliveries };
}

function _addDeliveryToStock(item, submittedBy, approvedBy) {
  var barcode = String(item.barcode || "").trim();
  var mfg = String(item.mfg || "").trim();
  var exp = String(item.exp || "").trim();
  var qty = _validateQty(item.qty, true);
  if (!barcode || qty <= 0) return;
  var note = "ส่งยอดโดย: " + submittedBy + " | อนุมัติ: " + approvedBy;
  var mfgIso = mfg.includes("-") ? mfg : ddmmyyToIso(mfg);
  var expIso = exp.includes("-") ? exp : ddmmyyToIso(exp);
  var productName = String(item.name || "");
  if (barcode) {
    var prodSheet = getSheet("ColdRoom_Products");
    var prodData = prodSheet.getDataRange().getValues(); var ph = prodData[0];
    for (var i = 1; i < prodData.length; i++) {
      if (String(prodData[i][ph.indexOf("Barcode")]) === barcode) {
        productName = String(prodData[i][ph.indexOf("ProductName")]) || productName; break;
      }
    }
  }
  var stockSheet = getSheet("ColdRoom_Stock");
  ensureColumns(stockSheet, ["Note","EmployeeName","DeviceInfo","UpdatedAt"]);
  var stockData = stockSheet.getDataRange().getValues(); var sh = stockData[0];
  for (var j = 1; j < stockData.length; j++) {
    if (String(stockData[j][sh.indexOf("Barcode")]||"") === barcode &&
        formatCellDate(stockData[j][sh.indexOf("MFG")]) === mfgIso) {
      var existing = Number(stockData[j][sh.indexOf("Qty")]||0);
      stockSheet.getRange(j+1, sh.indexOf("Qty")+1).setValue(existing+qty);
      stockSheet.getRange(j+1, sh.indexOf("Note")+1).setValue(note);
      stockSheet.getRange(j+1, sh.indexOf("EmployeeName")+1).setValue(submittedBy);
      stockSheet.getRange(j+1, sh.indexOf("DeviceInfo")+1).setValue("DeliveryApproval");
      stockSheet.getRange(j+1, sh.indexOf("UpdatedAt")+1).setValue(new Date().toISOString());
      return;
    }
  }
  stockSheet.appendRow([Utilities.getUuid(), barcode, productName, mfgIso, expIso, qty, note, submittedBy, "DeliveryApproval", new Date().toISOString()]);
}

// ============================================================
// 📥 DIRECT STOCK IN — รับสินค้าตรงจากฝ่ายผลิต
// ============================================================

function submitStockIn(payload) {
  var username = String(payload.username || "").trim();
  var items    = payload.items || [];
  var note     = String(payload.note || "").trim();
  if (!username || !items.length) return { ok: false, message: "ข้อมูลไม่ครบ" };

  var sheet = getSheet("ColdRoom_StockIn");
  var id    = "SI-" + Utilities.getUuid().slice(0,8).toUpperCase();
  var now   = new Date().toISOString();
  var h     = sheet.getDataRange().getValues()[0];
  var newRow = new Array(h.length).fill("");
  var sc = function(k,v){ var idx=h.indexOf(k); if(idx>=0) newRow[idx]=v; };
  sc("StockInID", id);
  sc("SubmittedBy", username);
  sc("SubmittedAt", now);
  sc("Items", JSON.stringify(items));
  sc("Status", "รอตรวจยอด");
  sc("Note", note);
  sheet.appendRow(newRow);
  crSendTelegramGeneric("📥 รายการรับสินค้าใหม่\n🔖 "+id+"\n👤 "+username+"\nรายการ "+items.length+" รายการ รอตรวจยอด"+deviceTag());
  return { ok: true, stockInID: id };
}

function getStockInList(payload) {
  var filterStatus = String(payload.filterStatus || "");
  var sheet = getSheet("ColdRoom_StockIn");
  var data  = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true, list: [] };
  var h = data[0]; var list = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rec = {}; h.forEach(function(k,idx){ rec[k] = row[idx]; });
    if (filterStatus && rec.Status !== filterStatus) continue;
    var sat = rec.SubmittedAt ? new Date(rec.SubmittedAt) : null;
    rec.SubmittedAtFmt = sat && !isNaN(sat) ? Utilities.formatDate(sat, Session.getScriptTimeZone(), "dd/MM/yy HH:mm") : String(rec.SubmittedAt||"");
    if (rec.ReviewedAt) { var rat = new Date(rec.ReviewedAt); rec.ReviewedAtFmt = !isNaN(rat) ? Utilities.formatDate(rat, Session.getScriptTimeZone(), "dd/MM/yy HH:mm") : String(rec.ReviewedAt); }
    list.push(rec);
  }
  list.sort(function(a,b){ return new Date(b.SubmittedAt)-new Date(a.SubmittedAt); });
  list = list.slice(0, 100); // จำกัด 100 ล่าสุด
  return { ok: true, list: list };
}

function reviewStockIn(payload) {
  var username  = String(payload.username || "").trim();
  var siId      = String(payload.stockInID || "").trim();
  var action    = String(payload.action || "approve"); // "approve" | "cancel"
  var items     = payload.items || null; // reviewed items with final qty
  if (!username || !siId) return { ok: false, message: "ข้อมูลไม่ครบ" };

  var sheet = getSheet("ColdRoom_StockIn");
  var data  = sheet.getDataRange().getValues();
  var h = data[0]; var siRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][h.indexOf("StockInID")]) === siId) { siRow = i; break; }
  }
  if (siRow < 0) return { ok: false, message: "ไม่พบรายการ " + siId };
  if (String(data[siRow][h.indexOf("Status")]) !== "รอตรวจยอด") return { ok: false, message: "รายการนี้ดำเนินการแล้ว" };

  var now = new Date().toISOString();
  if (action === "cancel") {
    sheet.getRange(siRow+1, h.indexOf("Status")+1).setValue("ยกเลิก");
    sheet.getRange(siRow+1, h.indexOf("ReviewedBy")+1).setValue(username);
    sheet.getRange(siRow+1, h.indexOf("ReviewedAt")+1).setValue(now);
    crSendTelegramGeneric("❌ ยกเลิกรายการรับสินค้า\n🔖 "+siId+"\n👤 โดย: "+username+deviceTag());
    return { ok: true };
  }

  // approve — use reviewed items if provided, else original
  var origItemsStr = String(data[siRow][h.indexOf("Items")]||"[]");
  var origItems; try { origItems = JSON.parse(origItemsStr); } catch(e){ origItems=[]; }
  var finalItems = items || origItems;

  // update items with reviewed qty
  sheet.getRange(siRow+1, h.indexOf("Items")+1).setValue(JSON.stringify(finalItems));
  sheet.getRange(siRow+1, h.indexOf("Status")+1).setValue("เข้าคลังแล้ว");
  sheet.getRange(siRow+1, h.indexOf("ReviewedBy")+1).setValue(username);
  sheet.getRange(siRow+1, h.indexOf("ReviewedAt")+1).setValue(now);

  var stockErrors = [];
  finalItems.forEach(function(item){
    try { _addDeliveryToStock(item, String(data[siRow][h.indexOf("SubmittedBy")]||""), username); }
    catch(e){ stockErrors.push(String(item.name||"")+": "+e.toString()); }
  });
  crSendTelegramGeneric("✅ ยืนยันเข้าคลัง\n🔖 "+siId+"\n👤 ตรวจโดย: "+username+"\nยอดเข้าคลังห้องเย็นแล้ว"+deviceTag());
  return stockErrors.length ? { ok: true, warnings: stockErrors } : { ok: true };
}

function getUsers(payload) {
  if (!verifyAdminToken(payload.adminToken)) return { ok: false, message: "ไม่มีสิทธิ์" };
  var sheet = getSheet("AppUsers");
  ensureColumns(sheet, ["Password"]);
  var data = sheet.getDataRange().getValues(); var h = data[0];
  var users = [];
  for (var i = 1; i < data.length; i++) {
    var uname = String(data[i][h.indexOf("Username")]||"");
    if (!uname) continue;
    users.push({
      username:    uname,
      role:        String(data[i][h.indexOf("Role")]||"user"),
      active:      data[i][h.indexOf("Active")],
      hasPassword: String(data[i][h.indexOf("Password")]||"").trim() !== "",
      isSuper:     _isSuperAdmin(uname)
    });
  }
  // บอกหน้าจอด้วยว่าคนที่กำลังดูอยู่เป็นเจ้าของระบบหรือไม่ (ใช้ตัดสินว่าจะโชว์ปุ่มไหน)
  return { ok: true, users: users, callerIsSuper: _callerIsSuperAdmin(payload.adminToken) };
}

// ══════════════════════════════════════════
// 📜 ประวัติของฉัน — พนักงานดูรายการที่ "ตัวเองทำ" เท่านั้น
//   ตั้งใจไม่ส่ง: ยอดคงเหลือ, ขั้นต่ำ, อัตราใช้/วัน, รายการของคนอื่น
//   (กันข้อมูลทางการค้ารั่ว — ส่งเฉพาะสิ่งที่เจ้าตัวทำเอง ซึ่งเขารู้อยู่แล้ว)
// ══════════════════════════════════════════
function getMyHistory(payload) {
  var username = String(payload.username || "").trim();
  if (!username) return { ok: false, message: "ไม่ระบุชื่อผู้ใช้" };
  var uLower = username.toLowerCase();
  var limit  = Math.min(Number(payload.limit) || 60, 100);

  var rows = [];
  ["SQF", "MLM"].forEach(function(mod) {
    var s = getSheet(mod + "_History");
    var last = s.getLastRow();
    if (last <= 1) return;
    var h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
    var n = Math.min(400, last - 1);                 // ดูย้อนหลังพอประมาณแล้วค่อยกรอง
    var d = s.getRange(last - n + 1, 1, n, h.length).getValues();
    var cT = h.indexOf("Timestamp"), cN = h.indexOf("Name"),
        cA = h.indexOf("Action"), cQ = h.indexOf("Qty"), cU = h.indexOf("User");
    for (var i = d.length - 1; i >= 0; i--) {
      // User เก็บเป็น "ชื่อ (📱 อุปกรณ์)" → ตัดส่วนอุปกรณ์ออกก่อนเทียบ
      var raw = String(d[i][cU] || "");
      var who = raw.split(" (")[0].trim().toLowerCase();
      if (who !== uLower) continue;
      var ts = d[i][cT] ? new Date(d[i][cT]) : null;
      rows.push({
        when:   ts && !isNaN(ts) ? Utilities.formatDate(ts, Session.getScriptTimeZone(), "dd/MM/yy HH:mm") : "",
        _ts:    ts && !isNaN(ts) ? ts.getTime() : 0,
        module: mod,
        name:   String(d[i][cN] || ""),
        action: String(d[i][cA] || ""),
        qty:    d[i][cQ] !== "" ? String(d[i][cQ]) : ""
      });
    }
  });

  rows.sort(function(a, b) { return b._ts - a._ts; });
  rows = rows.slice(0, limit);
  rows.forEach(function(r) { delete r._ts; });

  // สรุปสั้นๆ ให้เจ้าตัวเห็นภาพงานตัวเอง (นับจำนวนครั้งของทุกประเภทที่พบจริง ไม่ใช่ยอดสต๊อก)
  var count = {};
  rows.forEach(function(r) {
    var k = r.action || "อื่นๆ";
    count[k] = (count[k] || 0) + 1;
  });

  return { ok: true, username: username, rows: rows, summary: count };
}

// ➕ เพิ่มผู้ใช้โดยตรง (ไม่ต้องรอเขาส่งคำขอ)
function createUser(payload) {
  if (!verifyAdminToken(payload.adminToken)) return { ok: false, message: "ไม่มีสิทธิ์" };
  var username = String(payload.username || "").trim();
  var role     = String(payload.role || "user").trim().toLowerCase();
  var password = payload.password !== undefined ? String(payload.password || "").trim() : "";
  if (!username) return { ok: false, message: "กรุณาระบุชื่อผู้ใช้" };
  if (!["admin","manager","viewer","user"].includes(role)) return { ok: false, message: "Role ไม่ถูกต้อง" };
  if (_isSuperAdmin(username)) return { ok: false, message: "ชื่อนี้สงวนไว้สำหรับเจ้าของระบบ" };
  if (role === "admin" && !_callerIsSuperAdmin(payload.adminToken)) {
    return { ok: false, message: "เฉพาะเจ้าของระบบเท่านั้นที่ตั้ง admin ได้" };
  }

  var sheet = getSheet("AppUsers");
  ensureColumns(sheet, ["Password"]);
  var data = sheet.getDataRange().getValues();
  var h = data[0];
  var uIdx = h.indexOf("Username");
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][uIdx]).trim().toLowerCase() === username.toLowerCase()) {
      return { ok: false, message: "ชื่อ \"" + username + "\" มีอยู่ในระบบแล้ว" };
    }
  }

  var row = new Array(h.length).fill("");
  var set = function(k, v) { var idx = h.indexOf(k); if (idx >= 0) row[idx] = v; };
  set("Username", username);
  set("Active", true);
  set("Role", role);
  set("Password", password ? _hashPwd(password) : "");
  set("CreatedAt", new Date());
  sheet.appendRow(row);
  crSendTelegramGeneric("➕ เพิ่มผู้ใช้ใหม่\n👤 " + username + "\n🔖 " + role + "\nโดย: " + (_getTokenUsername(payload.adminToken) || "-") + deviceTag());
  return { ok: true };
}

// 🗑️ ลบผู้ใช้ออกจากระบบ (ลบถาวร — ประวัติการทำงานเดิมยังอยู่ เพราะเก็บเป็นชื่อข้อความ)
function deleteUser(payload) {
  if (!verifyAdminToken(payload.adminToken)) return { ok: false, message: "ไม่มีสิทธิ์" };
  var username = String(payload.username || "").trim();
  if (!username) return { ok: false, message: "ไม่ระบุชื่อผู้ใช้" };
  var caller = String(_getTokenUsername(payload.adminToken) || "").trim();

  // 👑 กันลบเจ้าของระบบ และกันลบตัวเอง (กันล็อกตัวเองออก)
  if (_isSuperAdmin(username)) return { ok: false, message: "บัญชีเจ้าของระบบ ลบไม่ได้" };
  if (caller.toLowerCase() === username.toLowerCase()) return { ok: false, message: "ลบบัญชีตัวเองไม่ได้" };

  var sheet = getSheet("AppUsers");
  var data = sheet.getDataRange().getValues();
  var h = data[0];
  var uIdx = h.indexOf("Username"), rIdx = h.indexOf("Role");
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][uIdx]).trim().toLowerCase() === username.toLowerCase()) {
      var targetRole = String(data[i][rIdx] || "").toLowerCase();
      if (targetRole === "admin" && !_callerIsSuperAdmin(payload.adminToken)) {
        return { ok: false, message: "เฉพาะเจ้าของระบบเท่านั้นที่ลบ admin ได้" };
      }
      sheet.deleteRow(i + 1);
      crSendTelegramGeneric("🗑️ ลบผู้ใช้\n👤 " + username + " (" + targetRole + ")\nโดย: " + (caller || "-") + deviceTag());
      return { ok: true };
    }
  }
  return { ok: false, message: "ไม่พบผู้ใช้" };
}

// 👑 ลด admin คนอื่นทั้งหมดเป็น user — เหลือเจ้าของระบบคนเดียว (เฉพาะเจ้าของระบบกดได้)
function demoteOtherAdmins(payload) {
  if (!verifyAdminToken(payload.adminToken)) return { ok: false, message: "ไม่มีสิทธิ์" };
  if (!_callerIsSuperAdmin(payload.adminToken)) {
    return { ok: false, message: "เฉพาะเจ้าของระบบเท่านั้นที่ทำได้" };
  }
  var sheet = getSheet("AppUsers");
  var data  = sheet.getDataRange().getValues();
  var h = data[0];
  var uIdx = h.indexOf("Username"), rIdx = h.indexOf("Role");
  var demoted = [];
  for (var i = 1; i < data.length; i++) {
    var uname = String(data[i][uIdx] || "").trim();
    if (!uname || _isSuperAdmin(uname)) continue;
    if (String(data[i][rIdx] || "").toLowerCase() !== "admin") continue;
    sheet.getRange(i + 1, rIdx + 1).setValue("user");
    demoted.push(uname);
  }
  if (demoted.length) {
    crSendTelegramGeneric("👑 ปรับสิทธิ์: ลด admin " + demoted.length + " คนเป็น user\n" + demoted.join(", ") + deviceTag());
  }
  return { ok: true, demoted: demoted, count: demoted.length };
}

function setUserRole(payload) {
  if (!verifyAdminToken(payload.adminToken)) return { ok: false, message: "ไม่มีสิทธิ์" };
  var username    = String(payload.username||"").trim();
  var newRole     = String(payload.role||"user").trim();
  var newPassword = payload.password !== undefined ? String(payload.password||"").trim() : undefined;
  if (!username) return { ok: false, message: "ไม่ระบุชื่อผู้ใช้" };
  if (!["admin","manager","viewer","user"].includes(newRole)) return { ok: false, message: "Role ไม่ถูกต้อง" };

  // 👑 ป้องกันบัญชีเจ้าของระบบ — ห้ามใครแตะ ยกเว้นตัวเอง (และเปลี่ยนได้แค่รหัสผ่าน)
  if (_isSuperAdmin(username)) {
    if (!_callerIsSuperAdmin(payload.adminToken)) {
      return { ok: false, message: "บัญชีเจ้าของระบบ แก้ไขไม่ได้" };
    }
    if (newRole !== "admin") {
      return { ok: false, message: "บัญชีเจ้าของระบบต้องเป็น admin เสมอ" };
    }
  }

  // 👑 ตั้งคนอื่นเป็น admin ได้เฉพาะเจ้าของระบบ
  if (newRole === "admin" && !_isSuperAdmin(username) && !_callerIsSuperAdmin(payload.adminToken)) {
    return { ok: false, message: "เฉพาะเจ้าของระบบเท่านั้นที่ตั้ง admin ได้" };
  }

  var sheet = getSheet("AppUsers");
  ensureColumns(sheet, ["Password"]);
  var data = sheet.getDataRange().getValues(); var h = data[0];
  var roleIdx = h.indexOf("Role");
  var activeIdx = h.indexOf("Active");
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][h.indexOf("Username")]).trim().toLowerCase() === username.toLowerCase()) {
      var currentRole = String(data[i][roleIdx]||"").toLowerCase();
      // Poka-Yoke: ป้องกัน demote admin คนสุดท้าย
      if (currentRole === "admin" && newRole !== "admin") {
        var adminCount = 0;
        for (var j = 1; j < data.length; j++) {
          var r = String(data[j][roleIdx]||"").toLowerCase();
          var a = activeIdx >= 0 ? String(data[j][activeIdx]||"").toUpperCase() : "TRUE";
          if (r === "admin" && a !== "FALSE") adminCount++;
        }
        if (adminCount <= 1) return { ok: false, message: "ไม่สามารถเปลี่ยน role ของ admin คนสุดท้ายได้" };
      }
      sheet.getRange(i+1, roleIdx+1).setValue(newRole);
      if (newPassword !== undefined) {
        var hashed = newPassword ? _hashPwd(newPassword) : "";
        sheet.getRange(i+1, h.indexOf("Password")+1).setValue(hashed);
      }
      return { ok: true };
    }
  }
  return { ok: false, message: "ไม่พบผู้ใช้" };
}

// ── Shared Telegram สำหรับทุก Module ──
const FACTORY_NAME = { COLDROOM: "❄️ คลังสินค้า SQF", SQF: "🏭 วัตถุดิบ SQF", MLM: "🏭 วัตถุดิบ MLM" };
function sendAlert(message, module) {
  crSendTelegram("[" + (FACTORY_NAME[module] || module) + "]\n" + message);
}

// ── สร้างบรรทัดสรุปยอด + เตือนสต๊อกต่ำ + วันที่ใช้ได้ ──
function _stockSummaryLines(newQty, unit_, minQty, dailyUsage) {
  var lines = [];
  if (dailyUsage > 0) {
    var days = Math.floor(newQty / dailyUsage);
    var dayIcon = days === 0 ? "🔴" : days <= 7 ? "🔴" : days <= 14 ? "🟠" : days <= 30 ? "🟡" : "🟢";
    lines.push(dayIcon + " ใช้ได้อีกประมาณ " + days + " วัน  (ใช้/วัน: " + dailyUsage + " " + unit_ + ")");
  }
  if (minQty > 0 && newQty <= minQty) {
    lines.push("⚠️ สต๊อกต่ำกว่าขั้นต่ำ!  (ขั้นต่ำ: " + minQty + " " + unit_ + ")");
  }
  return lines.length ? "\n" + lines.join("\n") : "";
}

// ── Generic Telegram (ใช้ config เดียวกับ ColdRoom) ──
function crSendTelegramGeneric(message) {
  crSendTelegram(message);
}

// ============================================================
// 🏭 RAW MATERIALS MODULE (SQF & MLM ใช้ร่วมกัน)
// ============================================================

function handleRawMaterial(action, data, module) {
  switch (action) {
    case "CREATE": return _withLock(function(){ return rmCreate(data, module); });
    case "UPDATE": return _withLock(function(){ return rmUpdate(data, module); });
    case "VERIFY": return _withLock(function(){ return rmVerify(data, module); });
    case "EDIT":   return rmEdit(data, module);
    case "DELETE": return rmDelete(data, module);
    case "BACKUP": return rmBackup(data, module);
    case "IMPORT": return _withLock(function(){ return rmImport(data, module); });
    case "DOCREPORT": return rmDocReport(data, module);
    case "ACKDOC":    return _withLock(function(){ return rmAckDocs(data, module); });
    case "ROPSTATS":  return rmRopStats(data, module);
    case "SETMIN":    return _withLock(function(){ return rmSetMin(data, module); });
    default: return { status: "error", message: "Unknown action: " + action };
  }
}

// ตรวจสอบและเพิ่มคอลัมน์ที่หายไปใน sheet เก่า
/**
 * เพิ่มคอลัมน์ที่ยังไม่มีต่อท้ายชีต แล้วคืนหัวตารางชุดใหม่กลับไป
 *
 * ⚠️ บั๊กเดิม: อ่านหัวตารางมาครั้งเดียวแล้วไม่อัปเดตตอนเพิ่มคอลัมน์
 *    เวลาต้องเพิ่มหลายคอลัมน์พร้อมกัน h.length ไม่ขยับ
 *    ทุกคอลัมน์จึงถูกเขียนทับกันที่ตำแหน่งเดียว เหลือรอดแค่ตัวสุดท้าย
 *    (ทำให้ DocNo กับ SKU หายไปจากชีตประวัติ ทั้งที่โค้ดสั่งเขียนแล้ว)
 *
 * และคืนหัวตารางกลับไปด้วย เพื่อไม่ต้อง getLastColumn() ซ้ำ
 * ซึ่งอาจได้ค่าเก่าเพราะการเขียนยังไม่ถูก flush
 */
function ensureColumns(sheet, requiredHeaders) {
  const data = sheet.getDataRange().getValues();
  const h = (data[0] || []).slice();
  requiredHeaders.forEach(col => {
    if (h.indexOf(col) < 0) {
      const newColIdx = h.length + 1;
      sheet.getRange(1, newColIdx).setValue(col);
      sheet.getRange(1, newColIdx).setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
      h.push(col);                 // ← ที่ขาดไป ทำให้คอลัมน์ถัดไปทับตำแหน่งเดิม
    }
  });
  return h;
}

function getRawMaterials(module) {
  const matSheet  = getSheet(module + "_Materials");
  const histSheet = getSheet(module + "_History");

  // เพิ่มคอลัมน์ใหม่ถ้า sheet เก่ายังไม่มี
  ensureColumns(matSheet, ["DailyUsage","AlertDays"]);

  const matData = matSheet.getDataRange().getValues();
  const h = matData[0];
  const materials    = [];
  const discontinued = [];

  for (let i = 1; i < matData.length; i++) {
    const item = {};
    h.forEach((key, idx) => { item[key] = matData[i][idx]; });
    if (item.Discontinued === true || String(item.Discontinued).toUpperCase() === "TRUE") {
      discontinued.push(item);
    } else {
      materials.push(item);
    }
  }

  // อ่านเฉพาะ 30 แถวสุดท้ายของ History (ไม่โหลดทั้ง sheet)
  const histLastRow = histSheet.getLastRow();
  let recentHistory = [];
  if (histLastRow > 1) {
    const hh = histSheet.getRange(1, 1, 1, histSheet.getLastColumn()).getValues()[0];
    const histNum = Math.min(30, histLastRow - 1);
    const histData = histSheet.getRange(histLastRow - histNum + 1, 1, histNum, hh.length).getValues();
    recentHistory = histData.reverse().map(row => {
      const o = {}; hh.forEach((k, i) => { o[k] = row[i]; });
      // ช่องที่ 6 เป็นต้นไปเพิ่มทีหลัง — หน้าจอเดิมอ่านแค่ 0-4 จึงไม่กระทบ
      // ใส่มาเพื่อให้กดพิมพ์ใบเบิกซ้ำจากหน้าประวัติได้ (ออดิเตอร์ขอใบที่หาย)
      return [o.Timestamp, o.Name, o.Action, o.Qty, o.User,
              o.DocNo || "", o.SKU || "", o.Unit || "", o.Purpose || ""];
    });
  }

  const prefix     = module === "SQF" ? "SQF-" : "MLM-";
  const existingNums = matData.slice(1)
    .map(r => String(r[0])).filter(s => s.startsWith(prefix))
    .map(s => parseInt(s.replace(prefix, ""), 10)).filter(n => !isNaN(n));
  const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
  const nextSku = prefix + String(nextNum).padStart(4, "0");

  return { status: "success", materials, discontinued, recentHistory, nextSku };
}

function rmCreate(data, module) {
  const { sku, name, unit, qty, min, dailyUsage, expiryDate, alertDays, user } = data;
  if (!sku || !name) return { status: "error", message: "ข้อมูลไม่ครบ" };
  // Poka-Yoke: ตรวจค่าที่ต้องไม่เป็นลบ
  if (Number(min) < 0)        return { status: "error", message: "ขั้นต่ำต้องไม่เป็นค่าลบ" };
  if (Number(dailyUsage) < 0) return { status: "error", message: "ใช้ต่อวันต้องไม่เป็นค่าลบ" };
  if (!unit || !String(unit).trim()) return { status: "error", message: "กรุณาระบุหน่วย" };

  const sheet = getSheet(module + "_Materials");
  ensureColumns(sheet, ["DailyUsage"]);
  const rows = sheet.getDataRange().getValues();
  const h    = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === String(sku).trim().toLowerCase()) {
      return { status: "error", message: "SKU นี้มีอยู่แล้ว" };
    }
  }

  // สร้าง row ตาม header จริงของ sheet (รองรับทั้ง sheet เก่าและใหม่)
  const newRow = h.map(col => {
    if (col === "SKU")          return sku;
    if (col === "Name")         return name;
    if (col === "Qty")          return Number(qty) || 0;
    if (col === "Unit")         return unit || "";
    if (col === "Min")          return Number(min) || 0;
    if (col === "DailyUsage")   return Number(dailyUsage) || 0;
    if (col === "ExpiryDate")   return expiryDate || "";
    if (col === "AlertDays")    return Number(alertDays) || 7;
    if (col === "LastVerified") return "";
    if (col === "Discontinued") return false;
    return "";
  });
  sheet.appendRow(newRow);
  const userWithDevice0 = _reqDeviceName ? `${user||"-"} (📱 ${_reqDeviceName})` : (user||"");
  getSheet(module + "_History").appendRow([new Date().toISOString(), name, "สร้างรายการ", Number(qty) || 0, userWithDevice0]);
  sendAlert(`🆕 เพิ่มวัตถุดิบใหม่\n📦 ${name} (${sku})\n🔢 ยอดเริ่มต้น: ${Number(qty)||0} ${unit}\n👤 ${user||"-"}${deviceTag()}`, module);
  return { status: "success" };
}

// ============================================================
// 📥 นำเข้าวัตถุดิบเป็นชุดจากไฟล์
//
//   data.rows = [{ sku, name, qty, unit, min, dailyUsage, expiryDate, alertDays }]
//   data.mode = "skip"      → ของที่มีอยู่แล้วให้ข้ามไป (ค่าเริ่มต้น ปลอดภัยสุด)
//               "overwrite" → อัปเดตทับ เฉพาะช่องที่กรอกมาในไฟล์
//
//   ฝั่งหน้าจอตรวจข้อมูลมาแล้วชั้นหนึ่ง แต่ที่นี่ตรวจซ้ำทั้งหมด
//   เพราะห้ามเชื่อข้อมูลที่ส่งมาจากเบราว์เซอร์
// ============================================================
var RM_IMPORT_MAX_ROWS = 500;   // กัน GAS ทำงานเกิน 6 นาทีแล้วถูกตัด

function rmImport(data, module) {
  var mode = data.mode === "overwrite" ? "overwrite" : "skip";
  var user = data.user || "-";
  var inRows = Array.isArray(data.rows) ? data.rows : [];

  if (!inRows.length) return { status: "error", message: "ไม่มีข้อมูลให้นำเข้า" };
  if (inRows.length > RM_IMPORT_MAX_ROWS) {
    return { status: "error",
             message: "นำเข้าได้ครั้งละไม่เกิน " + RM_IMPORT_MAX_ROWS + " รายการ (ส่งมา " + inRows.length + ")" };
  }

  var sheet = getSheet(module + "_Materials");
  ensureColumns(sheet, ["DailyUsage", "AlertDays"]);
  var sheetRows = sheet.getDataRange().getValues();
  var h = sheetRows[0];
  var col = {};
  for (var c = 0; c < h.length; c++) col[h[c]] = c;

  // ── ทำดัชนีของที่มีอยู่แล้ว เทียบทั้ง SKU และชื่อ ──
  var bySku = {}, byName = {};
  var prefix = module === "SQF" ? "SQF-" : "MLM-";
  var maxNum = 0;
  for (var i = 1; i < sheetRows.length; i++) {
    var sk = String(sheetRows[i][col["SKU"]] || "").trim();
    var nm = String(sheetRows[i][col["Name"]] || "").trim();
    if (sk) bySku[sk.toLowerCase()] = i;
    if (nm) byName[nm.toLowerCase()] = i;
    if (sk.indexOf(prefix) === 0) {
      var n = parseInt(sk.replace(prefix, ""), 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  }

  var num = function (v) {
    var s = String(v == null ? "" : v).replace(/,/g, "").trim();
    if (s === "") return null;
    var f = Number(s);
    return isNaN(f) ? NaN : f;
  };

  var results = [], newRows = [], histRows = [];
  var nCreated = 0, nUpdated = 0, nSkipped = 0, nError = 0;
  var nowIso = new Date().toISOString();
  var userWithDevice = _reqDeviceName ? (user + " (📱 " + _reqDeviceName + ")") : user;
  var seenInFile = {};   // กันไฟล์เดียวกันมีชื่อซ้ำกันเอง

  for (var r = 0; r < inRows.length; r++) {
    var src  = inRows[r] || {};
    var line = r + 1;
    var name = String(src.name == null ? "" : src.name).trim();
    var sku  = String(src.sku  == null ? "" : src.sku ).trim();
    var unit = String(src.unit == null ? "" : src.unit).trim();

    // ── ตรวจข้อมูล ──
    if (!name) { results.push({ line: line, name: "", status: "error", message: "ไม่ได้กรอกชื่อวัตถุดิบ" }); nError++; continue; }

    var qty   = num(src.qty);
    var min   = num(src.min);
    var daily = num(src.dailyUsage);
    var alert = num(src.alertDays);

    if (qty !== null && isNaN(qty))     { results.push({ line: line, name: name, status: "error", message: "จำนวนคงเหลือไม่ใช่ตัวเลข" }); nError++; continue; }
    if (min !== null && isNaN(min))     { results.push({ line: line, name: name, status: "error", message: "จุดสั่งซื้อไม่ใช่ตัวเลข" }); nError++; continue; }
    if (daily !== null && isNaN(daily)) { results.push({ line: line, name: name, status: "error", message: "ใช้ต่อวันไม่ใช่ตัวเลข" }); nError++; continue; }
    if (qty !== null && qty < 0)        { results.push({ line: line, name: name, status: "error", message: "จำนวนคงเหลือติดลบ" }); nError++; continue; }
    if (min !== null && min < 0)        { results.push({ line: line, name: name, status: "error", message: "จุดสั่งซื้อติดลบ" }); nError++; continue; }
    if (daily !== null && daily < 0)    { results.push({ line: line, name: name, status: "error", message: "ใช้ต่อวันติดลบ" }); nError++; continue; }

    var nameKey = name.toLowerCase();
    if (seenInFile[nameKey]) {
      results.push({ line: line, name: name, status: "error",
                     message: "ชื่อซ้ำกับบรรทัดที่ " + seenInFile[nameKey] + " ในไฟล์เดียวกัน" });
      nError++; continue;
    }
    seenInFile[nameKey] = line;

    // ── ของนี้มีอยู่แล้วหรือยัง ──
    var hit = -1;
    if (sku && bySku[sku.toLowerCase()] !== undefined)   hit = bySku[sku.toLowerCase()];
    else if (byName[nameKey] !== undefined)              hit = byName[nameKey];

    if (hit >= 0) {
      if (mode === "skip") {
        results.push({ line: line, name: name, sku: String(sheetRows[hit][col["SKU"]] || ""),
                       status: "skipped", message: "มีอยู่แล้วในระบบ" });
        nSkipped++; continue;
      }
      // อัปเดตทับ — เฉพาะช่องที่กรอกมาในไฟล์ ช่องว่างไว้ = คงค่าเดิม
      var changed = [];
      if (qty   !== null && col["Qty"]         !== undefined) { sheetRows[hit][col["Qty"]] = qty;          changed.push("คงเหลือ"); }
      if (unit  !== ""   && col["Unit"]        !== undefined) { sheetRows[hit][col["Unit"]] = unit;        changed.push("หน่วย"); }
      if (min   !== null && col["Min"]         !== undefined) { sheetRows[hit][col["Min"]] = min;          changed.push("จุดสั่งซื้อ"); }
      if (daily !== null && col["DailyUsage"]  !== undefined) { sheetRows[hit][col["DailyUsage"]] = daily; changed.push("ใช้ต่อวัน"); }
      if (src.expiryDate && col["ExpiryDate"]  !== undefined) { sheetRows[hit][col["ExpiryDate"]] = src.expiryDate; changed.push("วันหมดอายุ"); }
      if (alert !== null && !isNaN(alert) && col["AlertDays"] !== undefined) { sheetRows[hit][col["AlertDays"]] = alert; changed.push("เตือนล่วงหน้า"); }

      if (!changed.length) {
        results.push({ line: line, name: name, sku: String(sheetRows[hit][col["SKU"]] || ""),
                       status: "skipped", message: "ไม่มีช่องไหนให้อัปเดต" });
        nSkipped++; continue;
      }
      results.push({ line: line, name: name, sku: String(sheetRows[hit][col["SKU"]] || ""),
                     status: "updated", message: "อัปเดต: " + changed.join(", ") });
      histRows.push([nowIso, name, "นำเข้าจากไฟล์ (อัปเดต)", qty === null ? "" : qty, userWithDevice]);
      nUpdated++; continue;
    }

    // ── เพิ่มใหม่ ──
    if (!unit) { results.push({ line: line, name: name, status: "error", message: "ไม่ได้กรอกหน่วยนับ" }); nError++; continue; }

    var newSku = sku;
    if (!newSku) { maxNum++; newSku = prefix + String(maxNum).padStart(4, "0"); }
    else if (bySku[newSku.toLowerCase()] !== undefined) {
      results.push({ line: line, name: name, status: "error", message: "SKU " + newSku + " ถูกใช้ไปแล้ว" });
      nError++; continue;
    }

    var row = h.map(function (cname) {
      if (cname === "SKU")          return newSku;
      if (cname === "Name")         return name;
      if (cname === "Qty")          return qty === null ? 0 : qty;
      if (cname === "Unit")         return unit;
      if (cname === "Min")          return min === null ? 0 : min;
      if (cname === "DailyUsage")   return daily === null ? 0 : daily;
      if (cname === "ExpiryDate")   return src.expiryDate || "";
      if (cname === "AlertDays")    return (alert === null || isNaN(alert)) ? 7 : alert;
      if (cname === "LastVerified") return "";
      if (cname === "Discontinued") return false;
      return "";
    });
    newRows.push(row);
    bySku[newSku.toLowerCase()] = -1;   // จองไว้ กันซ้ำในไฟล์เดียวกัน
    byName[nameKey] = -1;
    results.push({ line: line, name: name, sku: newSku, status: "created",
                   message: "เพิ่มใหม่ " + (qty === null ? 0 : qty) + " " + unit });
    histRows.push([nowIso, name, "นำเข้าจากไฟล์ (เพิ่มใหม่)", qty === null ? 0 : qty, userWithDevice]);
    nCreated++;
  }

  // ── เขียนลงชีตทีเดียว (appendRow ทีละแถวช้ามากใน GAS) ──
  if (nUpdated > 0) {
    sheet.getRange(1, 1, sheetRows.length, h.length).setValues(sheetRows);
  }
  if (newRows.length > 0) {
    sheet.getRange(sheetRows.length + 1, 1, newRows.length, h.length).setValues(newRows);
  }
  if (histRows.length > 0) {
    var hs = getSheet(module + "_History");
    hs.getRange(hs.getLastRow() + 1, 1, histRows.length, 5).setValues(histRows);
  }

  if (nCreated || nUpdated) {
    sendAlert("📥 นำเข้าวัตถุดิบจากไฟล์\n➕ เพิ่มใหม่ " + nCreated + " รายการ\n🔄 อัปเดต " + nUpdated +
              " รายการ\n⏭️ ข้าม " + nSkipped + "\n⚠️ ผิดพลาด " + nError + "\n👤 " + user + deviceTag(), module);
  }

  return {
    status: "success",
    summary: { created: nCreated, updated: nUpdated, skipped: nSkipped, error: nError, total: inRows.length },
    results: results
  };
}

// ============================================================
// 📋 รายงานใบเบิกรายเดือน + การรับทราบ
//
//   ใช้เทียบกับแฟ้มกระดาษเดือนละครั้ง จะได้รู้ว่าใบไหนขาดภายใน 30 วัน
//   ไม่ต้องรอออดิเตอร์มาปีละครั้งถึงจะรู้
//
//   "รับทราบ" = หัวหน้าเข้ามากดว่าเห็นแล้ว ระบบบันทึกว่าใครกดและกดเมื่อไหร่
//   ใครกดก็ได้ (ไม่ล็อกสิทธิ์) แต่บันทึกชื่อไว้เสมอ
//   กดครั้งแรกเท่านั้นที่นับ — กดซ้ำไม่ทับของเดิม เพื่อไม่ให้หลักฐานเดิมหาย
// ============================================================

/** แปลงเวลาที่เก็บไว้ให้เป็น "ปี-เดือน" ตามเขตเวลาไทย */
function _docYearMonth(ts) {
  if (!ts) return "";
  var d = (ts instanceof Date) ? ts : new Date(String(ts));
  if (isNaN(d.getTime())) return "";
  // ⚠️ ห้ามตัดสตริง ISO ตรงๆ — ISO เป็นเวลา UTC
  //    รายการตอนตี 6 ของวันที่ 1 จะกลายเป็นวันสุดท้ายของเดือนก่อน
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM");
}

function rmDocReport(data, module) {
  var ym = String(data.month || "").trim();          // รูปแบบ "2026-07" (ค.ศ.)
  var sheet = getSheet(module + "_History");
  ensureColumns(sheet, ["DocNo", "SKU", "Unit", "Purpose", "AckBy", "AckAt"]);
  if (sheet.getLastRow() < 2) return { status: "success", rows: [], months: [] };

  var rows = sheet.getDataRange().getValues();
  var h = rows[0];
  var ix = {};
  h.forEach(function (c, i) { ix[c] = i; });

  var out = [], monthSet = {};
  for (var i = 1; i < rows.length; i++) {
    var doc = String(rows[i][ix["DocNo"]] || "").trim();
    if (!doc) continue;                               // เอาเฉพาะรายการที่มีเลขที่เอกสาร
    var m = _docYearMonth(rows[i][ix["Timestamp"]]);
    if (m) monthSet[m] = true;
    if (ym && m !== ym) continue;
    out.push({
      docNo:   doc,
      at:      String(rows[i][ix["Timestamp"]] || ""),
      action:  String(rows[i][ix["Action"]]  || ""),
      name:    String(rows[i][ix["Name"]]    || ""),
      sku:     String(rows[i][ix["SKU"]]     || ""),
      qty:     rows[i][ix["Qty"]],
      unit:    String(rows[i][ix["Unit"]]    || ""),
      purpose: String(rows[i][ix["Purpose"]] || ""),
      user:    String(rows[i][ix["User"]]    || ""),
      ackBy:   String(rows[i][ix["AckBy"]]   || ""),
      ackAt:   String(rows[i][ix["AckAt"]]   || "")
    });
  }
  out.sort(function (a, b) { return a.docNo < b.docNo ? 1 : a.docNo > b.docNo ? -1 : 0; });

  var months = Object.keys(monthSet).sort().reverse();
  return { status: "success", rows: out, months: months };
}

function rmAckDocs(data, module) {
  var list = Array.isArray(data.docNos) ? data.docNos : (data.docNo ? [data.docNo] : []);
  var user = String(data.user || "-").trim();
  if (!list.length) return { status: "error", message: "ไม่ได้ระบุเลขที่เอกสาร" };
  if (list.length > 300) return { status: "error", message: "รับทราบได้ครั้งละไม่เกิน 300 ใบ" };

  var sheet = getSheet(module + "_History");
  ensureColumns(sheet, ["DocNo", "SKU", "Unit", "Purpose", "AckBy", "AckAt"]);
  var rows = sheet.getDataRange().getValues();
  var h = rows[0];
  var cDoc = h.indexOf("DocNo"), cBy = h.indexOf("AckBy"), cAt = h.indexOf("AckAt");
  if (cDoc < 0 || cBy < 0 || cAt < 0) return { status: "error", message: "ชีตประวัติไม่มีคอลัมน์ที่ต้องใช้" };

  var want = {};
  list.forEach(function (d) { want[String(d).trim()] = true; });

  var userWithDevice = _reqDeviceName ? (user + " (📱 " + _reqDeviceName + ")") : user;
  var nowIso = new Date().toISOString();
  var done = 0, already = 0, results = [];

  for (var i = 1; i < rows.length; i++) {
    var doc = String(rows[i][cDoc] || "").trim();
    if (!doc || !want[doc]) continue;
    var prev = String(rows[i][cBy] || "").trim();
    if (prev) {
      already++;
      results.push({ docNo: doc, status: "already", ackBy: prev, ackAt: String(rows[i][cAt] || "") });
      continue;                                       // รับทราบไปแล้ว ไม่ทับของเดิม
    }
    rows[i][cBy] = userWithDevice;
    rows[i][cAt] = nowIso;
    done++;
    results.push({ docNo: doc, status: "ok", ackBy: userWithDevice, ackAt: nowIso });
  }

  if (done > 0) sheet.getRange(1, 1, rows.length, h.length).setValues(rows);

  return { status: "success", acked: done, already: already, results: results };
}

// ประเภทรายการที่รองรับ — IN รับเข้าจากซัพพลายเออร์ / OUT เบิกไปใช้ / RETURN คืนของที่เบิกเกิน
// แยก RETURN ออกจาก IN เพื่อให้คำนวณยอดใช้จริงได้ถูก: ใช้จริง = เบิกออก − คืน
var RM_TYPES = {
  IN:     { label: "รับเข้า",      emoji: "📥 รับเข้า",     sign: "+" },
  OUT:    { label: "เบิกออก",      emoji: "📤 เบิกออก",     sign: "-" },
  RETURN: { label: "คืนวัตถุดิบ",  emoji: "↩️ คืนวัตถุดิบ", sign: "+" }
};

// ═══════════════════════════════════════════════════════════
// 🧾 เลขที่ใบเบิก — RQ-SQF-2569-0001
//
//   ออกให้เฉพาะรายการ "เบิกออก" เพื่อใช้เป็นเลขอ้างอิงกับใบที่พิมพ์ไปเซ็น
//   ออดิเตอร์ถือใบมาถามเลขไหน เปิดหาในระบบได้ทันที
//
//   ตัวนับเก็บใน Config sheet แยกตามโรงงานและปี พ.ศ. (ขึ้นปีใหม่เริ่ม 0001)
//   เรียกจากใน _withLock อยู่แล้ว จึงไม่มีทางออกเลขซ้ำกัน
// ═══════════════════════════════════════════════════════════
// อักษรนำหน้าเลขที่ แยกตามประเภทรายการ จะได้ดูออกทันทีว่าเป็นเอกสารอะไร
var DOC_PREFIX = { OUT: "RQ", IN: "RC", RETURN: "RT" };

function _nextDocNo(module, type) {
  var pf = DOC_PREFIX[type] || "RQ";
  var y = new Date().getFullYear() + 543;                 // ปี พ.ศ.
  var key = "docSeq_" + pf + "_" + module + "_" + y;
  var sheet = getSheet("Config");
  var data = sheet.getDataRange().getValues();

  var rowAt = -1, cur = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) { rowAt = i; cur = parseInt(data[i][1], 10) || 0; break; }
  }

  // ยังไม่เคยมีตัวนับของปีนี้ → ไล่ดูในประวัติก่อน เผื่อเคยออกเลขไปแล้วแต่ตัวนับหาย
  if (rowAt < 0) {
    try {
      var hs = getSheet(module + "_History");
      var hh = hs.getRange(1, 1, 1, hs.getLastColumn()).getValues()[0];
      var dc = hh.indexOf("DocNo");
      if (dc >= 0 && hs.getLastRow() > 1) {
        var col = hs.getRange(2, dc + 1, hs.getLastRow() - 1, 1).getValues();
        var prefix = pf + "-" + module + "-" + y + "-";
        for (var j = 0; j < col.length; j++) {
          var v = String(col[j][0] || "");
          if (v.indexOf(prefix) === 0) {
            var n = parseInt(v.substring(prefix.length), 10);
            if (!isNaN(n) && n > cur) cur = n;
          }
        }
      }
    } catch (e) { /* ไม่มีคอลัมน์/ชีต ก็เริ่มที่ 0 */ }
  }

  var next = cur + 1;
  if (rowAt >= 0) sheet.getRange(rowAt + 1, 2).setValue(next);
  else            sheet.appendRow([key, next]);

  return pf + "-" + module + "-" + y + "-" + String(next).padStart(4, "0");
}

// ═══════════════════════════════════════════════════════════
// 📐 จุดสั่งซื้อแนะนำ — คำนวณจากประวัติการเบิกจริง
//
// ฝั่งนี้คืนแค่สถิติดิบต่อ SKU (ใช้เฉลี่ยวันละเท่าไหร่ + ผันผวนแค่ไหน)
// สูตรจุดสั่งซื้อไปคิดที่หน้าจอ เพราะผู้ใช้ปรับ "รอของกี่วัน" ได้สดๆ
// จะได้ไม่ต้องยิงมาคำนวณใหม่ทุกครั้งที่ขยับตัวเลข
// ═══════════════════════════════════════════════════════════

var ROP_WINDOW_DAYS = 90;   // มองย้อนหลังกี่วัน

function rmRopStats(data, module) {
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const winStart = new Date(now.getTime() - ROP_WINDOW_DAYS * 86400000);

  const hs = getSheet(module + "_History");
  if (hs.getLastRow() < 2) return { status: "success", windowDays: ROP_WINDOW_DAYS, items: {} };
  const rows = hs.getDataRange().getValues();
  const h = rows[0];
  const cT = h.indexOf("Timestamp"), cN = h.indexOf("Name"), cA = h.indexOf("Action"),
        cQ = h.indexOf("Qty"), cS = h.indexOf("SKU");

  // ชื่อ→SKU สำหรับแถวเก่าที่ยังไม่มีคอลัมน์ SKU (คอลัมน์นี้เพิ่งเพิ่ม ก.ค. 69)
  const ms = getSheet(module + "_Materials");
  const mRows = ms.getDataRange().getValues();
  const mh = mRows[0];
  const nameToSku = {};
  for (var i = 1; i < mRows.length; i++) {
    nameToSku[String(mRows[i][mh.indexOf("Name")]).trim()] = String(mRows[i][0]);
  }

  // เก็บยอดเบิกสุทธิรายวันต่อ SKU (เบิก = +, คืน = -)
  // และวันที่เห็น SKU ครั้งแรกในประวัติ (ทุก action) ไว้กำหนดช่วงสังเกต —
  // ของที่เพิ่งเข้าระบบ 10 วัน ห้ามหารด้วย 90 ไม่งั้นค่าเฉลี่ยเจือจางเกินจริง
  const daily = {};      // sku → { "yyyy-MM-dd": qty }
  const firstSeen = {};  // sku → Date แรกที่โผล่ในประวัติ
  const txCount = {};    // sku → จำนวนครั้งที่เบิกในช่วง
  const lastOut = {};    // sku → วันที่เบิกล่าสุด

  for (var r = 1; r < rows.length; r++) {
    const ts = rows[r][cT] ? new Date(rows[r][cT]) : null;
    if (!ts || isNaN(ts)) continue;
    var sku = cS >= 0 ? String(rows[r][cS] || "").trim() : "";
    if (!sku) sku = nameToSku[String(rows[r][cN] || "").trim()] || "";
    if (!sku) continue;

    if (!firstSeen[sku] || ts < firstSeen[sku]) firstSeen[sku] = ts;
    if (ts < winStart) continue;

    const act = String(rows[r][cA] || "");
    const q = Number(rows[r][cQ]);
    if (!isFinite(q) || q <= 0) continue;

    var delta = 0;
    if (act === "เบิกออก") { delta = q; txCount[sku] = (txCount[sku] || 0) + 1;
                             if (!lastOut[sku] || ts > lastOut[sku]) lastOut[sku] = ts; }
    else if (act === "คืนวัตถุดิบ") delta = -q;   // คืน = ไม่ได้ใช้จริง หักออก
    else continue;

    const day = Utilities.formatDate(ts, tz, "yyyy-MM-dd");
    if (!daily[sku]) daily[sku] = {};
    daily[sku][day] = (daily[sku][day] || 0) + delta;
  }

  // สรุปสถิติต่อ SKU — วันที่ไม่มีการเบิกนับเป็น 0 ด้วย ไม่งั้น σ ต่ำเกินจริง
  const items = {};
  Object.keys(daily).forEach(function (sku) {
    const obsStart = firstSeen[sku] > winStart ? firstSeen[sku] : winStart;
    const days = Math.max(1, Math.ceil((now - obsStart) / 86400000));
    const buckets = daily[sku];
    var total = 0;
    Object.keys(buckets).forEach(function (d) { total += Math.max(0, buckets[d]); });
    const avg = total / days;
    var ss = 0;
    // วนตามปฏิทินจริงของช่วงสังเกต (รวมวันที่เป็น 0)
    for (var dOff = 0; dOff < days; dOff++) {
      const dKey = Utilities.formatDate(new Date(now.getTime() - dOff * 86400000), tz, "yyyy-MM-dd");
      const v = Math.max(0, buckets[dKey] || 0);
      ss += (v - avg) * (v - avg);
    }
    const sigma = Math.sqrt(ss / days);
    items[sku] = {
      avgDaily: Math.round(avg * 1000) / 1000,
      sigma:    Math.round(sigma * 1000) / 1000,
      days:     days,
      txCount:  txCount[sku] || 0,
      lastOut:  lastOut[sku] ? Utilities.formatDate(lastOut[sku], tz, "yyyy-MM-dd") : ""
    };
  });

  return { status: "success", windowDays: ROP_WINDOW_DAYS, items: items };
}

// รับค่าจุดสั่งซื้อแนะนำ — แก้ Min อย่างเดียว
// ตั้งใจไม่ใช้ rmEdit เพราะมันเขียนทับ ExpiryDate/DailyUsage ด้วยเสมอ
function rmSetMin(data, module) {
  const sku = String(data.sku || "");
  const min = Number(data.min);
  if (!sku || !isFinite(min) || min < 0) return { status: "error", message: "ข้อมูลไม่ถูกต้อง" };

  const sheet = getSheet(module + "_Materials");
  const rows  = sheet.getDataRange().getValues();
  const h = rows[0];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === sku) {
      const oldMin = Number(rows[i][h.indexOf("Min")] || 0);
      const name   = rows[i][h.indexOf("Name")];
      sheet.getRange(i + 1, h.indexOf("Min") + 1).setValue(min);
      const who = _reqDeviceName ? (data.user || "-") + " (📱 " + _reqDeviceName + ")" : (data.user || "-");
      getSheet(module + "_History").appendRow(
        [new Date().toISOString(), name, "ปรับจุดสั่งซื้อ " + oldMin + "→" + min, "-", who]);
      sendAlert("📐 ปรับจุดสั่งซื้อ (จากคำแนะนำ)\n📦 " + name + " (" + sku + ")\n🔢 " +
                oldMin + " → " + min + "\n👤 " + (data.user || "-") + deviceTag(), module);
      return { status: "success", oldMin: oldMin, newMin: min };
    }
  }
  return { status: "error", message: "ไม่พบ SKU" };
}

function rmUpdate(data, module) {
  const { sku, user } = data;
  // ใช้กับงานอะไร — บังคับกรอกเฉพาะตอนเบิกออก เพราะเป็นข้อมูลที่ออดิเตอร์ถามหา
  const purpose = String(data.purpose == null ? "" : data.purpose).trim().slice(0, 120);
  // Poka-Yoke: รับเฉพาะประเภทที่รู้จัก (กันค่าตัวพิมพ์เล็ก/ค่าแปลกปลอมข้ามด่านเช็คสต๊อก)
  const type = String(data.type || "").toUpperCase();
  const meta = RM_TYPES[type];
  if (!meta) return { status: "error", message: "ประเภทรายการไม่ถูกต้อง" };

  // Poka-Yoke: จำนวนต้องมากกว่า 0 (กันรายการขยะที่ทำให้สถิติเพี้ยน)
  const q = _validateQty(data.qty, true);
  if (q <= 0) return { status: "error", message: "จำนวนต้องมากกว่า 0" };

  const sheet = getSheet(module + "_Materials");
  const rows  = sheet.getDataRange().getValues();
  const h = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(sku)) {
      const cur    = Number(rows[i][h.indexOf("Qty")] || 0);
      const name   = rows[i][h.indexOf("Name")];
      const unit_  = rows[i][h.indexOf("Unit")] || "";
      const minQty = Number(rows[i][h.indexOf("Min")] || 0);
      // ✅ ป้องกันเบิกเกินสต๊อก (เฉพาะ OUT — IN/RETURN บวกเข้าเสมอ)
      if (type === "OUT" && q > cur) {
        return { status: "error", message: "⚠️ สต๊อกไม่เพียงพอ — มีอยู่ " + cur + " " + unit_ + " ไม่สามารถเบิก " + q + " " + unit_ + " ได้" };
      }
      const newQty     = type === "OUT" ? cur - q : cur + q;
      const dailyUsage = Number(rows[i][h.indexOf("DailyUsage")] || 0);
      sheet.getRange(i + 1, h.indexOf("Qty") + 1).setValue(newQty);
      const userWithDevice1 = _reqDeviceName ? (user||"-") + " (📱 " + _reqDeviceName + ")" : (user||"-");

      // ── บันทึกประวัติ ──
      // คอลัมน์ DocNo/SKU/Unit ต่อท้ายของเดิม ไม่แทรกกลาง
      // เพราะ getMyHistory / bomHealthReport / getActivityLog อ่านด้วยลำดับคอลัมน์เดิมอยู่
      const hist = getSheet(module + "_History");
      const hHead = ensureColumns(hist, ["DocNo", "SKU", "Unit", "Purpose"]);
      const docNo = _nextDocNo(module, type);   // ออกเลขให้ทุกประเภท เบิก/รับ/คืน
      const histRow = hHead.map(function (c) {
        if (c === "Timestamp") return new Date().toISOString();
        if (c === "Name")      return name;
        if (c === "Action")    return meta.label;
        if (c === "Qty")       return q;
        if (c === "User")      return userWithDevice1;
        if (c === "DocNo")     return docNo;
        if (c === "SKU")       return sku;
        if (c === "Unit")      return unit_;
        if (c === "Purpose")   return purpose;
        return "";
      });
      hist.appendRow(histRow);
      var summary = _stockSummaryLines(newQty, unit_, minQty, dailyUsage);
      var msg = meta.emoji + "\n📦 " + name + " (" + sku + ")" +
                "\n🔢 " + meta.sign + q + " " + unit_ +
                "  →  คงเหลือ: " + newQty + " " + unit_ +
                summary +
                "\n👤 " + (user||"-") + deviceTag();
      sendAlert(msg, module);
      // ส่งข้อมูลกลับให้หน้าจอเอาไปออกใบเบิกได้เลย โดยไม่ต้องยิงถามใหม่
      return {
        status: "success",
        docNo: docNo,
        slip: {
          docNo: docNo, type: type, action: meta.label,
          sku: String(sku), name: String(name), qty: q,
          unit: String(unit_), balance: newQty, user: String(user || "-"),
          purpose: purpose, module: module, at: new Date().toISOString()
        }
      };
    }
  }
  return { status: "error", message: "ไม่พบ SKU" };
}

function rmVerify(data, module) {
  const { sku, qty, user } = data;
  const sheet = getSheet(module + "_Materials");
  const rows  = sheet.getDataRange().getValues();
  const h = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(sku)) {
      const name       = rows[i][h.indexOf("Name")];
      const unit_      = rows[i][h.indexOf("Unit")] || "";
      const minQty     = Number(rows[i][h.indexOf("Min")] || 0);
      const dailyUsage = Number(rows[i][h.indexOf("DailyUsage")] || 0);
      const newQty     = _validateQty(qty, true); // Poka-Yoke: กัน negative/overflow
      sheet.getRange(i + 1, h.indexOf("Qty")          + 1).setValue(newQty);
      sheet.getRange(i + 1, h.indexOf("LastVerified") + 1).setValue(new Date().toISOString());
      const userWithDevice2 = _reqDeviceName ? (user||"-") + " (📱 " + _reqDeviceName + ")" : (user||"-");
      getSheet(module + "_History").appendRow([new Date().toISOString(), name, "ตรวจนับ/ปรับยอด", newQty, userWithDevice2]);
      var summary2 = _stockSummaryLines(newQty, unit_, minQty, dailyUsage);
      var msg2 = "⚖️ ตรวจนับ/ปรับยอด\n📦 " + name + " (" + sku + ")" +
                 "\n🔢 ยอดจริง: " + newQty + " " + unit_ +
                 summary2 +
                 "\n👤 " + (user||"-") + deviceTag();
      sendAlert(msg2, module);
      return { status: "success" };
    }
  }
  return { status: "error", message: "ไม่พบ SKU" };
}

function rmEdit(data, module) {
  const { sku, name, unit, min, dailyUsage, expiryDate, alertDays, user } = data;
  const sheet = getSheet(module + "_Materials");
  const rows  = sheet.getDataRange().getValues();
  const h = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(sku)) {
      const oldName = rows[i][h.indexOf("Name")];
      if (name) sheet.getRange(i + 1, h.indexOf("Name") + 1).setValue(name);
      if (unit) sheet.getRange(i + 1, h.indexOf("Unit") + 1).setValue(unit);
      sheet.getRange(i + 1, h.indexOf("Min")        + 1).setValue(Number(min) || 0);
      if (h.indexOf("DailyUsage") >= 0)
        sheet.getRange(i + 1, h.indexOf("DailyUsage") + 1).setValue(Number(dailyUsage) || 0);
      sheet.getRange(i + 1, h.indexOf("ExpiryDate") + 1).setValue(expiryDate || "");
      if (h.indexOf("AlertDays") >= 0 && alertDays !== undefined)
        sheet.getRange(i + 1, h.indexOf("AlertDays") + 1).setValue(Number(alertDays) || 7);
      const userWithDevice3 = _reqDeviceName ? `${user||"-"} (📱 ${_reqDeviceName})` : (user||"");
      getSheet(module + "_History").appendRow([new Date().toISOString(), name || oldName, "แก้ไขข้อมูล", "-", userWithDevice3]);
      sendAlert(`✏️ แก้ไขข้อมูล\n📦 ${name||oldName} (${sku})\n👤 ${user||"-"}${deviceTag()}`, module);
      return { status: "success" };
    }
  }
  return { status: "error", message: "ไม่พบ SKU" };
}

function rmDelete(data, module) {
  const { sku, user } = data;
  const sheet = getSheet(module + "_Materials");
  const rows  = sheet.getDataRange().getValues();
  const h = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(sku)) {
      const name = rows[i][h.indexOf("Name")];
      sheet.getRange(i + 1, h.indexOf("Discontinued") + 1).setValue(true);
      const userWithDevice4 = _reqDeviceName ? `${user||"-"} (📱 ${_reqDeviceName})` : (user||"");
      getSheet(module + "_History").appendRow([new Date().toISOString(), name, "ลบ/ยกเลิก", "-", userWithDevice4]);
      sendAlert(`🗑️ ลบ/ยกเลิกรายการ\n📦 ${name} (${sku})\n👤 ${user||"-"}${deviceTag()}`, module);
      return { status: "success" };
    }
  }
  return { status: "error", message: "ไม่พบ SKU" };
}

function rmBackup(data, module) {
  const { user } = data;
  const backupName = `Backup_${module}_${new Date().toISOString().slice(0, 10)}`;
  SpreadsheetApp.getActiveSpreadsheet().copy(backupName);
  getSheet(module + "_History").appendRow([new Date().toISOString(), "SYSTEM", "สำรองข้อมูล", backupName, user || ""]);
  return { status: "success", message: "สำรองเรียบร้อย: " + backupName };
}

// ============================================================
// UTILITY
// ============================================================

function ddmmyyToIso(str) {
  if (!str || typeof str !== "string") return String(str || "");
  if (str.includes("-")) return str;
  if (!/^\d{6}$/.test(str)) return "";    // Poka-Yoke: รับเฉพาะ 6 หลักตัวเลข
  const dd = parseInt(str.substring(0, 2), 10);
  const mm = parseInt(str.substring(2, 4), 10);
  const yy = parseInt(str.substring(4, 6), 10);
  // Poka-Yoke: ตรวจ range ของ dd/mm
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return "";
  return `${2000 + yy}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;
}

// แปลง ISO string "yyyy-MM-dd" → Date object ใน timezone ท้องถิ่น (ไม่ใช่ UTC)
// แก้ปัญหา new Date("2026-04-18") parse เป็น UTC midnight ทำให้ expireDays เกิน 1 วัน
function parseLocalDate(isoStr) {
  if (!isoStr) return new Date(NaN);
  const parts = String(isoStr).split("-");
  if (parts.length === 3) {
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  return new Date(isoStr);
}

// แปลง Date object จาก Google Sheets → ISO string "yyyy-MM-dd"
function formatCellDate(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const s = String(value).trim();
  // ถ้าเป็น Date string ให้แปลงผ่าน Date object
  if (s.length > 10 && !s.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
  }
  return s;
}
