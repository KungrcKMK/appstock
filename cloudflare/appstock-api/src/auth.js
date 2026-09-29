// ตัวตนและสิทธิ์: เข้าสู่ระบบ · บัตรผ่าน · ด่านตรวจคำสั่งเขียน · คำขอสิทธิ์ · จัดการผู้ใช้
import { all, first, run, stmt, changed, kvGet, kvPut, kvDel, uuid, hashPassword, verifyPassword, isSuperAdmin, fmtTH, nowIso, tgNotify, deviceTag, DAY_MS } from "./lib.js";

// ───────────── บัตรผ่าน (session) ─────────────
// อยู่ได้ 30 วัน — งานที่ค้างในคิวออฟไลน์ข้ามคืนต้องส่งได้ ไม่ใช่ถูกปฏิเสธเพราะบัตรหมดอายุ
export const SESSION_DAYS = 30;
export async function issueToken(c, username, role) {
  const token = uuid();
  await run(c, "INSERT INTO sessions (token, u, n, r, exp) VALUES (?, ?, ?, ?, ?)",
    token, String(username).toLowerCase(), String(username), String(role), Date.now() + SESSION_DAYS * DAY_MS);
  return token;
}
/**
 * อ่านบัตรผ่าน — role/สถานะอ่านจากตารางผู้ใช้ "ตอนนี้" ไม่ใช่ตอนออกบัตร
 * (เปลี่ยนสิทธิ์/ระงับ/ลบผู้ใช้ มีผลทันที ไม่ต้องรอบัตรหมดอายุ)
 */
export async function getTokenData(c, token) {
  if (!token) return null;
  const memo = c._tok || (c._tok = {});
  if (token in memo) return memo[token];
  const r = await first(c,
    "SELECT s.u, s.n, s.exp, u.role AS role, u.active AS active, u.username AS uname " +
    "FROM sessions s LEFT JOIN users u ON u.username = s.n WHERE s.token = ?", String(token));
  let out = null;
  if (r) {
    if (r.exp && Date.now() > r.exp) await run(c, "DELETE FROM sessions WHERE token = ?", String(token));
    else if (r.uname && Number(r.active) !== 0) out = { u: r.u, n: r.uname, r: String(r.role || "user"), exp: r.exp };
  }
  memo[token] = out;
  return out;
}
export async function verifyAdminToken(c, token) { const d = await getTokenData(c, token); return !!(d && d.r === "admin"); }
export async function verifyApproverToken(c, token) { const d = await getTokenData(c, token); return !!(d && (d.r === "admin" || d.r === "manager")); }
export async function getTokenUsername(c, token) { const d = await getTokenData(c, token); return d ? d.u : null; }
export async function callerIsSuperAdmin(c, token) { return await isSuperAdmin(c, await getTokenUsername(c, token)); }
export async function revokeToken(c, token) { if (token) await run(c, "DELETE FROM sessions WHERE token = ?", String(token)); }

// ───────────── ด่านตรวจตัวตนสำหรับคำสั่งที่เปลี่ยนข้อมูล ─────────────
// คำสั่งอ่านอย่างเดียวไม่ต้องผ่านด่าน · คำสั่งที่มีด่าน admin ของตัวเอง (จัดการผู้ใช้) ไม่อยู่ในตารางนี้
// ⚠️ เพิ่ม action เขียนใหม่ต้องใส่ในตารางนี้เสมอ ไม่งั้นไม่ถูกตรวจ
export const ROLE_RANK = { viewer: 0, user: 1, manager: 2, admin: 3 };
export const WRITE_MIN_ROLE = {
  UPDATE: "user", VERIFY: "user", CREATE: "user", EDIT: "user", DELETE: "user", IMPORT: "user",
  BACKUP: "manager", SETMIN: "user", SETROPSTART: "user", ACKDOC: "user",
  saveOrUpdateCount: "user", importLots: "user", saveNewProduct: "user", clearLotStock: "user",
  saveWorkOrder: "user", deleteWorkOrder: "user", updateProduct: "user", archiveOldStock: "manager",
  saveAlertSettings: "admin", saveBom: "manager", deleteBom: "manager",
  submitDelivery: "user", submitStockIn: "user", reviewStockIn: "user",
  SYSSTATUS: "manager", EXPORT: "admin",
  PLANSET: "manager", PLANDIGEST: "manager", MIRRORPUSH: "manager",
};
export async function authGate(c, action, data, payload) {
  const need = WRITE_MIN_ROLE[action];
  if (!need) return null;
  const token = data.sessionToken || (payload && payload.adminToken) || data.adminToken || "";
  const sess = await getTokenData(c, token);
  if (!sess) return { ok: false, status: "error", needLogin: true, message: "กรุณาเข้าสู่ระบบใหม่ (บัตรผ่านหมดอายุหรือยังไม่ได้เข้าระบบ)" };
  if ((ROLE_RANK[sess.r] || 0) < (ROLE_RANK[need] || 1))
    return { ok: false, status: "error", message: "สิทธิ์ของบัญชี (" + sess.r + ") ไม่พอสำหรับคำสั่งนี้" };
  // ชื่อผู้ทำรายการเอาจากบัตรผ่าน ไม่เชื่อชื่อที่หน้าจอส่งมา — ปิดช่องอ้างชื่อคนอื่น
  const who = sess.n || sess.u;
  c.user = who;
  data.user = who;
  if (payload) {
    payload.user = who;
    payload.employeeName = who;
    if (payload.createdBy !== undefined) payload.createdBy = who;
    if (payload.username !== undefined) payload.username = who;   // ผู้ส่งยอด/ผู้ตรวจ/ผู้ลบใบสั่งผลิต = เจ้าของบัตร
  }
  return null;
}

// ───────────── จำกัดความถี่การ login (5 ครั้ง / 15 นาที ต่อชื่อ) ─────────────
async function isRateLimited(c, username) {
  const key = "rl_" + String(username).toLowerCase();
  const count = Number(await kvGet(c, key)) || 0;
  if (count >= 5) return true;
  await kvPut(c, key, String(count + 1), 900);
  return false;
}

// ───────────── เข้าสู่ระบบ ─────────────
export async function verifyUser(c, payload) {
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "").trim();
  if (!username) return { ok: false, message: "กรุณาระบุชื่อผู้ใช้" };
  if (await isRateLimited(c, username)) return { ok: false, message: "⛔ พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาที" };

  const total = await first(c, "SELECT COUNT(*) AS n FROM users");
  if (!total || !total.n) return { ok: false, message: "ยังไม่มีรายชื่อผู้ใช้ กรุณาให้ Admin เพิ่มก่อน" };

  const u = await first(c, "SELECT username, active, role, password FROM users WHERE username = ?", username);
  if (u) {
    if (Number(u.active) === 0) return { ok: false, message: "บัญชีนี้ถูกระงับ กรุณาติดต่อ Admin" };
    const storedPwd = String(u.password || "").trim();
    if (storedPwd) {
      if (!password) return { ok: false, requirePassword: true, message: "กรุณาระบุรหัสผ่าน" };
      const v = await verifyPassword(password, storedPwd);
      if (!v.ok) return { ok: false, message: "รหัสผ่านไม่ถูกต้อง ❌" };
      // รูปแบบเก่า (SHA-256 เปล่า / ข้อความธรรมดา) → แปลงเป็นรูปแบบใหม่เมื่อเข้าสู่ระบบสำเร็จ
      if (v.upgrade) await run(c, "UPDATE users SET password = ? WHERE username = ?", await hashPassword(password), u.username);
    }
    await kvDel(c, "rl_" + username.toLowerCase());
    const role = String(u.role || "user");
    const realName = String(u.username).trim();   // ชื่อในบัตรใช้ตัวสะกดจริงในฐานข้อมูล ไม่ใช่ที่ผู้ใช้พิมพ์
    const token = await issueToken(c, realName, role);
    return { ok: true, role, adminToken: token, sessionToken: token, username: realName };
  }
  const pend = await pendingStatusOf(c, username);
  if (pend === "PENDING") return { ok: false, pending: true, message: "คำขอของ \"" + username + "\" กำลังรอ Admin อนุมัติ" };
  if (pend === "REJECTED") return { ok: false, rejected: true, message: "คำขอของ \"" + username + "\" ถูกปฏิเสธ กรุณาติดต่อ Admin" };
  return { ok: false, notFound: true, message: "ยังไม่มีชื่อ \"" + username + "\" ในระบบ" };
}

async function pendingStatusOf(c, username) {
  try {
    const r = await first(c, "SELECT status FROM pending_users WHERE username = ? ORDER BY id DESC LIMIT 1", String(username).trim());
    return r ? String(r.status || "").toUpperCase() : "";
  } catch (e) { return ""; }
}

// ───────────── คำขอสิทธิ์ ─────────────
const VALID_ROLES = ["admin", "manager", "viewer", "user"];
export async function registerUser(c, payload) {
  const username = String(payload.username || "").trim();
  if (!username) return { ok: false, message: "กรุณาระบุชื่อ" };
  if (await isSuperAdmin(c, username)) return { ok: false, message: "ไม่สามารถใช้ชื่อนี้ได้" };
  if (await first(c, "SELECT 1 AS x FROM users WHERE username = ?", username))
    return { ok: false, message: "ชื่อ \"" + username + "\" มีอยู่ในระบบแล้ว ลองเข้าสู่ระบบได้เลย" };
  const pend = await all(c, "SELECT status FROM pending_users WHERE username = ? ORDER BY id", username);
  for (const p of pend) {
    if (p.status === "PENDING") return { ok: false, message: "ส่งคำขอไปแล้ว กรุณารอการอนุมัติจากผู้ควบคุมระบบ" };
    if (p.status === "REJECTED") return { ok: false, message: "คำขอของ \"" + username + "\" ถูกปฏิเสธ กรุณาติดต่อผู้ควบคุมระบบ" };
  }
  const req = String(payload.requestedRole || "").toLowerCase();
  const requestedRole = VALID_ROLES.includes(req) ? req : "user";
  await run(c, "INSERT INTO pending_users (username, requested_at, status, requested_role) VALUES (?, ?, 'PENDING', ?)", username, nowIso(), requestedRole);
  tgNotify(c, "📝 คำขอสมัครใหม่\n👤 ชื่อ: " + username + "\n🔖 ขอ Role: " + requestedRole + "\nรอการอนุมัติจาก Admin" + deviceTag(c));
  return { ok: true, message: "ส่งคำขอเรียบร้อยแล้ว รอผู้ควบคุมระบบอนุมัติ" };
}

export async function getPendingUsers(c, payload) {
  if (!(await verifyApproverToken(c, payload.adminToken))) return { ok: false, message: "ไม่มีสิทธิ์ กรุณาเข้าสู่ระบบใหม่" };
  const rows = await all(c, "SELECT username, requested_at, requested_role FROM pending_users WHERE status = 'PENDING' ORDER BY id");
  return { ok: true, list: rows.map((r) => ({
    username: String(r.username),
    requestedAt: fmtTH(r.requested_at, "dd/MM/yyyy HH:mm") || String(r.requested_at || ""),
    requestedRole: String(r.requested_role || "user"),
  })) };
}

const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export async function approveUser(c, payload) {
  if (!(await verifyApproverToken(c, payload.adminToken))) return { ok: false, message: "ไม่มีสิทธิ์ กรุณาเข้าสู่ระบบใหม่" };
  const requester = capFirst((await getTokenUsername(c, payload.adminToken)) || "admin");
  const username = String(payload.username || "").trim();
  if (!username) return { ok: false, message: "ไม่ระบุชื่อ" };

  // ขั้นที่ 1: หาคำขอ + อ่าน role ที่ขอ (ยังไม่เขียนอะไร)
  const p = await first(c, "SELECT id, requested_role FROM pending_users WHERE username = ? AND status = 'PENDING' ORDER BY id LIMIT 1", username);
  if (!p) return { ok: false, message: "ไม่พบคำขอที่รอการอนุมัติ" };

  // ขั้นที่ 2: ตรวจสิทธิ์ให้จบก่อน แล้วค่อยเขียน (ไม่งั้นคำขอถูกกินทิ้งตอนปฏิเสธ)
  let approvedRole = String(p.requested_role || "user").toLowerCase();
  if (!VALID_ROLES.includes(approvedRole)) approvedRole = "user";
  // manager อนุมัติได้เฉพาะ user / viewer — ถ้าขอสิทธิ์สูงกว่านั้นต้องให้ admin ตัดสิน
  if (!(await verifyAdminToken(c, payload.adminToken)) && ["admin", "manager"].indexOf(approvedRole) >= 0)
    return { ok: false, message: "คำขอนี้ขอสิทธิ์ระดับ " + approvedRole + " — ต้องให้ผู้ดูแลระบบ (admin) อนุมัติ" };
  // 👑 ตั้ง admin ได้เฉพาะเจ้าของระบบ
  if (approvedRole === "admin" && !(await callerIsSuperAdmin(c, payload.adminToken))) approvedRole = "user";

  // ขั้นที่ 3: บันทึกพร้อมกันทั้งสองตาราง (สำเร็จหรือล้มเหลวด้วยกัน)
  const now = nowIso();
  await c.env.DB.batch([
    stmt(c, "UPDATE pending_users SET status = 'APPROVED', reviewed_at = ?, reviewed_by = ? WHERE id = ? AND status = 'PENDING'", now, requester, p.id),
    stmt(c, "INSERT OR IGNORE INTO users (username, active, role, password, created_at) VALUES (?, 1, ?, '', ?)", username, approvedRole, now),
  ]);
  tgNotify(c, "✅ อนุมัติผู้ใช้ใหม่\n👤 " + username + "\nโดย: " + requester);
  return { ok: true };
}

export async function rejectUser(c, payload) {
  if (!(await verifyApproverToken(c, payload.adminToken))) return { ok: false, message: "ไม่มีสิทธิ์ กรุณาเข้าสู่ระบบใหม่" };
  const requester = capFirst((await getTokenUsername(c, payload.adminToken)) || "admin");
  const username = String(payload.username || "").trim();
  if (!username) return { ok: false, message: "ไม่ระบุชื่อ" };
  const p = await first(c, "SELECT id FROM pending_users WHERE username = ? AND status = 'PENDING' ORDER BY id LIMIT 1", username);
  if (!p) return { ok: false, message: "ไม่พบคำขอที่รอการอนุมัติ" };
  await run(c, "UPDATE pending_users SET status = 'REJECTED', reviewed_at = ?, reviewed_by = ? WHERE id = ?", nowIso(), requester, p.id);
  return { ok: true };
}

// ───────────── จัดการผู้ใช้ (admin) ─────────────
export async function getUsers(c, payload) {
  if (!(await verifyAdminToken(c, payload.adminToken))) return { ok: false, message: "ไม่มีสิทธิ์" };
  const rows = await all(c, "SELECT username, role, active, password FROM users ORDER BY rowid");
  const users = [];
  for (const r of rows) {
    const uname = String(r.username || "");
    if (!uname) continue;
    users.push({
      username: uname,
      role: String(r.role || "user"),
      active: Number(r.active) !== 0,
      hasPassword: String(r.password || "").trim() !== "",
      isSuper: await isSuperAdmin(c, uname),
    });
  }
  return { ok: true, users, callerIsSuper: await callerIsSuperAdmin(c, payload.adminToken) };
}

export async function createUser(c, payload) {
  if (!(await verifyAdminToken(c, payload.adminToken))) return { ok: false, message: "ไม่มีสิทธิ์" };
  const username = String(payload.username || "").trim();
  const role = String(payload.role || "user").trim().toLowerCase();
  const password = payload.password !== undefined ? String(payload.password || "").trim() : "";
  if (!username) return { ok: false, message: "กรุณาระบุชื่อผู้ใช้" };
  if (!VALID_ROLES.includes(role)) return { ok: false, message: "Role ไม่ถูกต้อง" };
  if (await isSuperAdmin(c, username)) return { ok: false, message: "ชื่อนี้สงวนไว้สำหรับเจ้าของระบบ" };
  if (role === "admin" && !(await callerIsSuperAdmin(c, payload.adminToken)))
    return { ok: false, message: "เฉพาะเจ้าของระบบเท่านั้นที่ตั้ง admin ได้" };
  const r = await run(c, "INSERT OR IGNORE INTO users (username, active, role, password, created_at) VALUES (?, 1, ?, ?, ?)",
    username, role, password ? await hashPassword(password) : "", nowIso());
  if (!changed(r)) return { ok: false, message: "ชื่อ \"" + username + "\" มีอยู่ในระบบแล้ว" };
  tgNotify(c, "➕ เพิ่มผู้ใช้ใหม่\n👤 " + username + "\n🔖 " + role + "\nโดย: " + ((await getTokenUsername(c, payload.adminToken)) || "-") + deviceTag(c));
  return { ok: true };
}

export async function deleteUser(c, payload) {
  if (!(await verifyAdminToken(c, payload.adminToken))) return { ok: false, message: "ไม่มีสิทธิ์" };
  const username = String(payload.username || "").trim();
  if (!username) return { ok: false, message: "ไม่ระบุชื่อผู้ใช้" };
  const caller = String((await getTokenUsername(c, payload.adminToken)) || "").trim();
  // 👑 กันลบเจ้าของระบบ และกันลบตัวเอง (กันล็อกตัวเองออก)
  if (await isSuperAdmin(c, username)) return { ok: false, message: "บัญชีเจ้าของระบบ ลบไม่ได้" };
  if (caller.toLowerCase() === username.toLowerCase()) return { ok: false, message: "ลบบัญชีตัวเองไม่ได้" };
  const u = await first(c, "SELECT username, role FROM users WHERE username = ?", username);
  if (!u) return { ok: false, message: "ไม่พบผู้ใช้" };
  const targetRole = String(u.role || "").toLowerCase();
  if (targetRole === "admin" && !(await callerIsSuperAdmin(c, payload.adminToken)))
    return { ok: false, message: "เฉพาะเจ้าของระบบเท่านั้นที่ลบ admin ได้" };
  await c.env.DB.batch([
    stmt(c, "DELETE FROM users WHERE username = ?", u.username),
    stmt(c, "DELETE FROM sessions WHERE n = ?", u.username),
  ]);
  tgNotify(c, "🗑️ ลบผู้ใช้\n👤 " + username + " (" + targetRole + ")\nโดย: " + (caller || "-") + deviceTag(c));
  return { ok: true };
}

export async function demoteOtherAdmins(c, payload) {
  if (!(await verifyAdminToken(c, payload.adminToken))) return { ok: false, message: "ไม่มีสิทธิ์" };
  if (!(await callerIsSuperAdmin(c, payload.adminToken))) return { ok: false, message: "เฉพาะเจ้าของระบบเท่านั้นที่ทำได้" };
  const rows = await all(c, "SELECT username FROM users WHERE lower(role) = 'admin' ORDER BY rowid");
  const demoted = [];
  for (const r of rows) {
    const uname = String(r.username || "").trim();
    if (!uname || (await isSuperAdmin(c, uname))) continue;
    await run(c, "UPDATE users SET role = 'user' WHERE username = ?", uname);
    demoted.push(uname);
  }
  if (demoted.length) tgNotify(c, "👑 ปรับสิทธิ์: ลด admin " + demoted.length + " คนเป็น user\n" + demoted.join(", ") + deviceTag(c));
  return { ok: true, demoted, count: demoted.length };
}

export async function setUserRole(c, payload) {
  if (!(await verifyAdminToken(c, payload.adminToken))) return { ok: false, message: "ไม่มีสิทธิ์" };
  const username = String(payload.username || "").trim();
  const newRole = String(payload.role || "user").trim();
  const newPassword = payload.password !== undefined ? String(payload.password || "").trim() : undefined;
  if (!username) return { ok: false, message: "ไม่ระบุชื่อผู้ใช้" };
  if (!VALID_ROLES.includes(newRole)) return { ok: false, message: "Role ไม่ถูกต้อง" };

  // 👑 บัญชีเจ้าของระบบ — ห้ามใครแตะ ยกเว้นตัวเอง (และเปลี่ยนได้แค่รหัสผ่าน)
  const targetIsSuper = await isSuperAdmin(c, username);
  const callerSuper = await callerIsSuperAdmin(c, payload.adminToken);
  if (targetIsSuper) {
    if (!callerSuper) return { ok: false, message: "บัญชีเจ้าของระบบ แก้ไขไม่ได้" };
    if (newRole !== "admin") return { ok: false, message: "บัญชีเจ้าของระบบต้องเป็น admin เสมอ" };
  }
  if (newRole === "admin" && !targetIsSuper && !callerSuper) return { ok: false, message: "เฉพาะเจ้าของระบบเท่านั้นที่ตั้ง admin ได้" };

  const u = await first(c, "SELECT username, role FROM users WHERE username = ?", username);
  if (!u) return { ok: false, message: "ไม่พบผู้ใช้" };
  if (String(u.role || "").toLowerCase() === "admin" && newRole !== "admin") {
    const n = await first(c, "SELECT COUNT(*) AS n FROM users WHERE lower(role) = 'admin' AND active <> 0");
    if (!n || n.n <= 1) return { ok: false, message: "ไม่สามารถเปลี่ยน role ของ admin คนสุดท้ายได้" };
  }
  if (newPassword !== undefined)
    await run(c, "UPDATE users SET role = ?, password = ? WHERE username = ?", newRole, newPassword ? await hashPassword(newPassword) : "", u.username);
  else
    await run(c, "UPDATE users SET role = ? WHERE username = ?", newRole, u.username);
  return { ok: true };
}
