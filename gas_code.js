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
    // Seed admin account เมื่อสร้าง AppUsers ครั้งแรก
    if (name === "AppUsers") {
      sheet.appendRow(["Kungrc1020", true, "admin", new Date()]);
    }
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// SECURITY HELPERS
// ============================================================

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

// ============================================================
// SYSTEM — verifyUser
// ============================================================

// ── Generalized Token (CacheService — TTL 30 นาที) ──
function _issueToken(username, role) {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put("tk_" + token, JSON.stringify({ u: username.toLowerCase(), r: role }), 1800);
  return token;
}
function _issueAdminToken(username) { return _issueToken(username, "admin"); }

function _getTokenData(token) {
  if (!token) return null;
  var cached = CacheService.getScriptCache().get("tk_" + token);
  if (cached) { try { return JSON.parse(cached); } catch(e) { return null; } }
  // compat: เก่าเก็บด้วย at_ prefix
  var old = CacheService.getScriptCache().get("at_" + token);
  if (old) return { u: old, r: "admin" };
  return null;
}
function verifyAdminToken(token) { var d = _getTokenData(token); return !!(d && d.r === "admin"); }
function verifyApproverToken(token) { var d = _getTokenData(token); return !!(d && (d.r === "admin" || d.r === "approver")); }
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
      // ออก token ให้ admin/approver/manager ทุกคนที่ผ่าน login
      const needsToken = (role === "admin" || role === "approver" || role === "manager");
      const adminToken = needsToken ? _issueToken(username, role) : null;

      return { ok: true, role, adminToken };
    }
  }
  return { ok: false, message: "ไม่พบชื่อ \"" + username + "\" กรุณาส่งคำขอสมัครใช้งาน" };
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

  var validRoles = ["admin","approver","manager","ceo","viewer","user"];
  var requestedRole = validRoles.includes(String(payload.requestedRole || "").toLowerCase()) ? String(payload.requestedRole).toLowerCase() : "user";
  pendSheet.appendRow([username, new Date(), "PENDING", "", "", requestedRole]);
  crSendTelegramGeneric("📝 คำขอสมัครใหม่\n👤 ชื่อ: " + username + "\n🔖 ขอ Role: " + requestedRole + "\nรอการอนุมัติจาก Admin" + deviceTag());
  return { ok: true, message: "ส่งคำขอเรียบร้อยแล้ว รอผู้ควบคุมระบบอนุมัติ" };
}

function getPendingUsers(payload) {
  if (!verifyAdminToken(payload.adminToken)) return { ok: false, message: "ไม่มีสิทธิ์ กรุณาเข้าสู่ระบบใหม่" };

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
  if (!verifyAdminToken(payload.adminToken)) return { ok: false, message: "ไม่มีสิทธิ์ กรุณาเข้าสู่ระบบใหม่" };
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
  var found = false;
  var approvedRole = "user";
  for (var i = 1; i < pendData.length; i++) {
    if (String(pendData[i][uCol]).trim().toLowerCase() === username.toLowerCase() && String(pendData[i][sCol]) === "PENDING") {
      approvedRole = rrCol >= 0 ? String(pendData[i][rrCol] || "user") : "user";
      pendSheet.getRange(i + 1, sCol  + 1).setValue("APPROVED");
      pendSheet.getRange(i + 1, raCol + 1).setValue(new Date());
      pendSheet.getRange(i + 1, rbCol + 1).setValue(requester);
      found = true;
      break;
    }
  }
  if (!found) return { ok: false, message: "ไม่พบคำขอที่รอการอนุมัติ" };

  // เพิ่มเข้า AppUsers
  const appSheet = getSheet("AppUsers");
  appSheet.appendRow([username, true, approvedRole, new Date()]);

  crSendTelegramGeneric("✅ อนุมัติผู้ใช้ใหม่\n👤 " + username + "\nโดย: " + requester);
  return { ok: true };
}

function rejectUser(payload) {
  if (!verifyAdminToken(payload.adminToken)) return { ok: false, message: "ไม่มีสิทธิ์ กรุณาเข้าสู่ระบบใหม่" };
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

function doGet(e) {
  try {
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
    if (action === "submitDelivery")  return jsonResponse(submitDelivery(payload));
    if (action === "getDeliveries")   return jsonResponse(getDeliveries(payload));
    if (action === "submitStockIn")   return jsonResponse(submitStockIn(payload));
    if (action === "getStockInList")  return jsonResponse(getStockInList(payload));
    if (action === "reviewStockIn")   return jsonResponse(reviewStockIn(payload));

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
    case "saveOrUpdateCount":     return crSaveOrUpdateCount(payload);
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
    case "getBomForProduct":      return bomGetForProduct(payload.barcode);
    case "saveBom":               return bomSave(payload);
    case "deleteBom":             return bomDelete(payload.barcode);
    case "calcWorkOrderMaterials": return bomCalcWorkOrder(payload);
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

  const sheet = getSheet("ColdRoom_Products");
  crEnsureProductCols(sheet); // เพิ่มคอลัมน์ที่หายไปก่อนทุกครั้ง

  // อ่าน headers หลัง ensureColumns เสมอ
  const h = sheet.getDataRange().getValues()[0];
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][h.indexOf("Barcode")]) === String(barcode)) {
      return { ok: false, message: "บาร์โค้ดนี้มีในระบบแล้ว" };
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
      hasPassword: String(data[i][h.indexOf("Password")]||"").trim() !== ""
    });
  }
  return { ok: true, users: users };
}

function setUserRole(payload) {
  if (!verifyAdminToken(payload.adminToken)) return { ok: false, message: "ไม่มีสิทธิ์" };
  var username    = String(payload.username||"").trim();
  var newRole     = String(payload.role||"user").trim();
  var newPassword = payload.password !== undefined ? String(payload.password||"").trim() : undefined;
  if (!username) return { ok: false, message: "ไม่ระบุชื่อผู้ใช้" };
  if (!["admin","approver","manager","ceo","viewer","user"].includes(newRole)) return { ok: false, message: "Role ไม่ถูกต้อง" };
  var sheet = getSheet("AppUsers");
  ensureColumns(sheet, ["Password"]);
  var data = sheet.getDataRange().getValues(); var h = data[0];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][h.indexOf("Username")]).trim().toLowerCase() === username.toLowerCase()) {
      sheet.getRange(i+1, h.indexOf("Role")+1).setValue(newRole);
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
    case "CREATE": return rmCreate(data, module);
    case "UPDATE": return rmUpdate(data, module);
    case "VERIFY": return rmVerify(data, module);
    case "EDIT":   return rmEdit(data, module);
    case "DELETE": return rmDelete(data, module);
    case "BACKUP": return rmBackup(data, module);
    default: return { status: "error", message: "Unknown action: " + action };
  }
}

// ตรวจสอบและเพิ่มคอลัมน์ที่หายไปใน sheet เก่า
function ensureColumns(sheet, requiredHeaders) {
  const data = sheet.getDataRange().getValues();
  const h = data[0] || [];
  requiredHeaders.forEach(col => {
    if (!h.includes(col)) {
      const newColIdx = h.length + 1;
      sheet.getRange(1, newColIdx).setValue(col);
      sheet.getRange(1, newColIdx).setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
    }
  });
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

  const histData = histSheet.getDataRange().getValues();
  const hh = histData[0];
  const recentHistory = histData.slice(1)
    .map(row => { const o = {}; hh.forEach((k, i) => { o[k] = row[i]; }); return o; })
    .reverse().slice(0, 30)
    .map(x => [x.Timestamp, x.Name, x.Action, x.Qty, x.User]);

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

  const sheet = getSheet(module + "_Materials");
  ensureColumns(sheet, ["DailyUsage"]);
  const rows = sheet.getDataRange().getValues();
  const h    = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(sku)) return { status: "error", message: "SKU นี้มีอยู่แล้ว" };
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

function rmUpdate(data, module) {
  const { sku, type, qty, user } = data;
  const sheet = getSheet(module + "_Materials");
  const rows  = sheet.getDataRange().getValues();
  const h = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(sku)) {
      const cur    = Number(rows[i][h.indexOf("Qty")] || 0);
      const q      = _validateQty(qty, true);
      const name   = rows[i][h.indexOf("Name")];
      const unit_  = rows[i][h.indexOf("Unit")] || "";
      const minQty = Number(rows[i][h.indexOf("Min")] || 0);
      // ✅ ป้องกันเบิกเกินสต๊อก
      if (type === "OUT" && q > cur) {
        return { status: "error", message: "⚠️ สต๊อกไม่เพียงพอ — มีอยู่ " + cur + " " + unit_ + " ไม่สามารถเบิก " + q + " " + unit_ + " ได้" };
      }
      const newQty     = type === "IN" ? cur + q : cur - q;
      const dailyUsage = Number(rows[i][h.indexOf("DailyUsage")] || 0);
      sheet.getRange(i + 1, h.indexOf("Qty") + 1).setValue(newQty);
      const userWithDevice1 = _reqDeviceName ? (user||"-") + " (📱 " + _reqDeviceName + ")" : (user||"-");
      getSheet(module + "_History").appendRow([new Date().toISOString(), name, type === "IN" ? "รับเข้า" : "เบิกออก", q, userWithDevice1]);
      var emoji   = type === "IN" ? "📥 รับเข้า" : "📤 เบิกออก";
      var summary = _stockSummaryLines(newQty, unit_, minQty, dailyUsage);
      var msg = emoji + "\n📦 " + name + " (" + sku + ")" +
                "\n🔢 " + (type === "IN" ? "+" : "-") + q + " " + unit_ +
                "  →  คงเหลือ: " + newQty + " " + unit_ +
                summary +
                "\n👤 " + (user||"-") + deviceTag();
      sendAlert(msg, module);
      return { status: "success" };
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
      const newQty     = Number(qty);
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
  if (str.length !== 6) return str;
  const dd = str.substring(0, 2);
  const mm = str.substring(2, 4);
  const yy = str.substring(4, 6);
  return `${2000 + parseInt(yy, 10)}-${mm}-${dd}`;
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
