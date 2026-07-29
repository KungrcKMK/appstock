// ─────────────────────────────────────────────
// ADMIN PANEL
// ─────────────────────────────────────────────
function openAdminPanel() {
  switchModule("ROLES");
  adminSwitchTab("pending");
}
function closeAdminPanel() { /* no-op — merged into module-ROLES */ }

async function loadPendingUsers() {
  const listEl = document.getElementById("adminPendingList");
  listEl.innerHTML = '<p class="sq-empty">กำลังโหลด...</p>';
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ module: "SYSTEM", action: "getPendingUsers",
        payload: { adminToken: _adminToken } })
    }).then(r => r.json());

    if (!res.ok) { listEl.innerHTML = `<p class="sq-empty" style="color:var(--sq-crit);font-weight:700;">❌ ${escapeHtml(res.message||"")}</p>`; return; }
    if (!res.list || res.list.length === 0) {
      listEl.innerHTML = '<p class="sq-empty">✅ ไม่มีคำขอรอการอนุมัติ</p>';
      const badge = document.getElementById("adminNavBadge");
      const tabBadge = document.getElementById("adminPendingTabBadge");
      if (badge) badge.style.display = "none";
      if (tabBadge) tabBadge.style.display = "none";
      return;
    }

    // Update badge count
    const badge = document.getElementById("adminNavBadge");
    const tabBadge = document.getElementById("adminPendingTabBadge");
    if (badge) { badge.style.display = ""; badge.textContent = res.list.length; }
    if (tabBadge) { tabBadge.style.display = ""; tabBadge.textContent = res.list.length; }

    listEl.innerHTML = res.list.map(u => {
      const safeU = escapeJs(u.username||"");
      const roleLabel = u.requestedRole || "user";
      return `
      <div class="sq-row">
        <div class="sq-row-id">
          <p class="sq-row-name">👤 ${escapeHtml(u.username||"")}</p>
          <p class="sq-row-meta">
            <span class="sq-chip">ขอสิทธิ์ ${escapeHtml(roleLabel)}</span>
            <span>ส่งคำขอ ${escapeHtml(u.requestedAt||"")}</span>
          </p>
        </div>
        <div class="sq-row-acts">
          <button onclick="adminApprove('${safeU}', event)" class="sq-btn sq-btn-primary">✅ อนุมัติ</button>
          <button onclick="adminReject('${safeU}', event)" class="sq-btn">❌ ปฏิเสธ</button>
        </div>
      </div>`;
    }).join("");
  } catch(e) {
    listEl.innerHTML = `<p class="sq-empty" style="color:var(--sq-crit);font-weight:700;">เกิดข้อผิดพลาด: ${escapeHtml(e.message||"")}</p>`;
  }
}

async function adminApprove(username, evt) {
  if (!confirm(`อนุมัติ "${username}" เข้าใช้ระบบ?`)) return;
  const btn = evt?.currentTarget;
  await guardedClick(btn, async () => {
    try {
      const res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ module: "SYSTEM", action: "approveUser",
          payload: { adminToken: _adminToken, username } })
      }).then(r => r.json());
      if (res.ok) { showToast("✅ อนุมัติ " + username + " แล้ว"); loadPendingUsers(); }
      else alert("❌ " + res.message);
    } catch(e) { alert("เกิดข้อผิดพลาด: " + e.message); }
  });
}

async function adminReject(username, evt) {
  if (!confirm(`ปฏิเสธคำขอของ "${username}"?`)) return;
  const btn = evt?.currentTarget;
  await guardedClick(btn, async () => {
    try {
      const res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ module: "SYSTEM", action: "rejectUser",
          payload: { adminToken: _adminToken, username } })
      }).then(r => r.json());
      if (res.ok) { showToast("🚫 ปฏิเสธ " + username + " แล้ว"); loadPendingUsers(); }
      else alert("❌ " + res.message);
    } catch(e) { alert("เกิดข้อผิดพลาด: " + e.message); }
  });
}

function adminSwitchTab(tab) {
  // manager เข้าได้เฉพาะแท็บ "คำขอ" — แท็บจัดการ Role สงวนไว้ให้ admin
  const isAdmin = window._appIsAdmin !== false;
  const rolesTabBtn = document.getElementById("adminTab-roles");
  if (rolesTabBtn) rolesTabBtn.style.display = isAdmin ? "" : "none";
  if (!isAdmin) tab = "pending";

  ["pending","roles"].forEach(t => {
    const btn  = document.getElementById("adminTab-" + t);
    const pane = document.getElementById("adminTabContent-" + t);
    const isActive = t === tab;
    if (btn)  btn.classList.toggle("is-on", isActive);
    if (pane) pane.style.display = isActive ? "" : "none";
  });
  if (tab === "pending") loadPendingUsers();
  if (tab === "roles")   loadRolesPage();
}

async function loadUsers() {
  const listEl = document.getElementById("adminUserList");
  listEl.innerHTML = '<p class="text-slate-400 text-center text-sm font-bold py-4">กำลังโหลด...</p>';
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ module: "SYSTEM", action: "getUsers", payload: { adminToken: _adminToken } })
    }).then(r => r.json());
    if (!res.ok) { listEl.innerHTML = `<p class="text-red-500 text-center text-sm font-bold py-4">❌ ${escapeHtml(res.message||"")}</p>`; return; }
    const roleColors = { admin: "#f59e0b", manager: "#8b5cf6", user: "#64748b" };
    listEl.innerHTML = res.users.map(u => {
      const safeU = escapeJs(u.username||""); // ป้องกัน onclick injection
      const safeId = escapeAttr(u.username||""); // ป้องกัน HTML injection ใน id attribute
      return `
      <div class="flex items-center justify-between bg-slate-50 rounded-2xl p-3 border border-slate-200 gap-3 flex-wrap">
        <div>
          <p class="font-black text-slate-800 text-sm">👤 ${escapeHtml(u.username||"")}</p>
          <p class="text-xs text-slate-400 font-bold">
            <span style="color:${roleColors[u.role]||"#64748b"};font-weight:900;">${escapeHtml(u.role||"")}</span>
            ${u.hasPassword ? " &nbsp;🔒 มีรหัสผ่าน" : " &nbsp;🔓 ไม่มีรหัสผ่าน"}
          </p>
        </div>
        <div class="flex gap-2 items-center flex-wrap">
          <select id="roleSelect-${safeId}" style="padding:5px 8px;border-radius:8px;border:2px solid #e2e8f0;font-size:12px;font-weight:800;">
            <option value="user"     ${u.role==="user"    ?"selected":""}>👤 user — พนักงานทั่วไป</option>
            <option value="viewer"   ${u.role==="viewer"  ?"selected":""}>👁️ viewer — ดูข้อมูล + ภาพรวม</option>
            <option value="manager"  ${u.role==="manager" ?"selected":""}>📋 manager — ผู้จัดการ</option>
            <option value="admin"    ${u.role==="admin"   ?"selected":""}>🔧 admin — ผู้ดูแลระบบ</option>
          </select>
          <input type="password" id="pwdInput-${safeId}" placeholder="รหัสผ่านใหม่ (ถ้าต้องการตั้ง)" style="padding:5px 8px;border-radius:8px;border:2px solid #e2e8f0;font-size:12px;width:130px;">
          <button onclick="saveUserRole('${safeU}')" class="bg-indigo-500 text-white px-3 py-1.5 rounded-xl font-black text-xs hover:bg-indigo-600 transition-all">💾 บันทึก</button>
        </div>
      </div>`;
    }).join("");
  } catch(e) {
    listEl.innerHTML = `<p class="text-red-500 text-center text-sm font-bold py-4">เกิดข้อผิดพลาด: ${escapeHtml(e.message||"")}</p>`;
  }
}

async function loadRolesPage() {
  const listEl = document.getElementById("rolesPageList");
  if (!listEl) return;
  listEl.innerHTML = '<p class="sq-empty">⏳ กำลังโหลด...</p>';
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ module: "SYSTEM", action: "getUsers", payload: { adminToken: _adminToken } })
    }).then(r => r.json());
    if (!res.ok) { listEl.innerHTML = `<p class="sq-empty" style="color:var(--sq-crit);font-weight:700;">❌ ${escapeHtml(res.message||"")}</p>`; return; }
    // สีป้าย role — ใช้ class กลาง ไม่ใช่สีดิบ
    const roleChip    = { admin:"warn", manager:"ok", viewer:"", user:"" };
    const roleLabels  = { admin:"🔧 admin", manager:"📋 manager", viewer:"👁️ viewer", user:"👤 user" };
    const KNOWN = ["user","viewer","manager","admin"];
    const isSuperViewer = !!res.callerIsSuper;
    const otherAdmins = res.users.filter(u => !u.isSuper && String(u.role).toLowerCase() === "admin");

    // 👑 แถบเจ้าของระบบ + ปุ่มลด admin คนอื่น (เห็นเฉพาะเจ้าของระบบ)
    let banner = "";
    if (isSuperViewer && otherAdmins.length) {
      banner = `
      <div style="background:#fffbeb;border:2px solid #fcd34d;border-radius:16px;padding:14px 18px;margin-bottom:12px;">
        <p style="margin:0;font-weight:900;color:#92400e;font-size:14px;">👑 มี admin คนอื่นอยู่ ${otherAdmins.length} คน</p>
        <p style="margin:4px 0 10px;font-size:12px;color:#92400e;font-weight:600;">${escapeHtml(otherAdmins.map(u=>u.username).join(", "))}</p>
        <button onclick="demoteOtherAdmins(event)"
          style="background:#b45309;color:#fff;border:none;padding:10px 18px;border-radius:12px;font-weight:900;font-size:13px;cursor:pointer;font-family:inherit;">
          ⬇️ ลดทุกคนเป็น user (เหลือเจ้าของระบบคนเดียว)
        </button>
      </div>`;
    }

    // ➕ ฟอร์มเพิ่มผู้ใช้ใหม่โดยตรง (ไม่ต้องรอเขาส่งคำขอ)
    const createForm = `
      <div style="background:#fff;border:2px solid #c7d2fe;border-radius:16px;padding:16px 18px;margin-bottom:12px;">
        <p style="margin:0 0 10px;font-weight:900;color:#3730a3;font-size:14px;">➕ เพิ่มผู้ใช้ใหม่</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <input id="newUserName" type="text" placeholder="ชื่อพนักงาน"
            onkeydown="if(event.key==='Enter') createNewUser(event)"
            style="flex:1;min-width:150px;padding:9px 12px;border:2px solid #e2e8f0;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;outline:none;">
          <select id="newUserRole" style="padding:9px 10px;border:2px solid #e2e8f0;border-radius:10px;font-size:13px;font-weight:800;font-family:inherit;cursor:pointer;">
            <option value="user">👤 user</option>
            <option value="viewer">👁️ viewer</option>
            <option value="manager">📋 manager</option>
            ${isSuperViewer ? '<option value="admin">🔧 admin</option>' : ''}
          </select>
          <input id="newUserPwd" type="password" placeholder="รหัสผ่าน (ไม่ใส่ก็ได้)"
            style="width:180px;padding:9px 12px;border:2px solid #e2e8f0;border-radius:10px;font-family:inherit;font-size:13px;outline:none;">
          <button onclick="createNewUser(event)"
            style="background:#059669;color:#fff;border:none;padding:10px 22px;border-radius:10px;font-weight:900;font-size:13px;cursor:pointer;font-family:inherit;">➕ เพิ่ม</button>
        </div>
      </div>`;

    listEl.innerHTML = createForm + banner + `<div style="display:flex;flex-direction:column;gap:10px;">` +
      res.users.map(u => {
        const safeU  = escapeJs(u.username||"");
        const safeId = escapeAttr(u.username||"");
        const rc = roleColors[u.role] || "#94a3b8";
        const unknownRole = !KNOWN.includes(String(u.role).toLowerCase());

        // 👑 เจ้าของระบบ — ล็อกไว้ ไม่ให้แก้จากหน้าจอ
        if (u.isSuper) {
          return `
          <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border-radius:16px;padding:16px 20px;border:2px solid #f59e0b;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div style="flex:1;min-width:0;">
              <p style="margin:0;font-weight:900;font-size:15px;color:#78350f;">👑 ${escapeHtml(u.username||"")}</p>
              <p style="margin:4px 0 0;font-size:12px;font-weight:800;color:#92400e;">
                เจ้าของระบบ (Admin สูงสุด)${u.hasPassword ? " &nbsp;🔒 มีรหัสผ่าน" : " &nbsp;🔓 ไม่มีรหัสผ่าน"}
              </p>
            </div>
            <span style="font-size:12px;font-weight:800;color:#92400e;background:#fde68a;padding:8px 14px;border-radius:10px;">🔒 แก้ไขไม่ได้</span>
          </div>`;
        }

        return `
        <div style="background:#fff;border-radius:16px;padding:16px 20px;border:1.5px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;box-shadow:0 2px 6px rgba(0,0,0,.04);">
          <div style="flex:1;min-width:0;">
            <p style="margin:0;font-weight:900;font-size:15px;color:#0f172a;">👤 ${escapeHtml(u.username||"")}</p>
            <p style="margin:4px 0 0;font-size:12px;font-weight:700;">
              <span style="background:${rc}22;color:${rc};padding:2px 10px;border-radius:999px;font-size:12px;font-weight:800;">${escapeHtml(roleLabels[u.role]||u.role||"")}</span>
              ${unknownRole ? `<span style="color:#dc2626;font-weight:800;">&nbsp;⚠️ role เก่า (${escapeHtml(u.role||"")}) — กดบันทึกเพื่อปรับเป็น user</span>` : ""}
              ${u.hasPassword ? "&nbsp;🔒 มีรหัสผ่าน" : "&nbsp;🔓 ไม่มีรหัสผ่าน"}
            </p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <select id="rpRoleSelect-${safeId}" style="padding:8px 10px;border-radius:10px;border:2px solid #e2e8f0;font-size:13px;font-weight:800;font-family:inherit;outline:none;cursor:pointer;">
              <option value="user"     ${u.role==="user"    ?"selected":""}>👤 user</option>
              <option value="viewer"   ${u.role==="viewer"  ?"selected":""}>👁️ viewer</option>
              <option value="manager"  ${u.role==="manager" ?"selected":""}>📋 manager</option>
              <option value="admin"    ${u.role==="admin"   ?"selected":""} ${isSuperViewer ? "" : "disabled"}>🔧 admin${isSuperViewer ? "" : " (เฉพาะเจ้าของระบบ)"}</option>
            </select>
            <button onclick="saveRolePageUser('${safeU}')"
              style="background:#6366f1;color:#fff;border:none;padding:8px 18px;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;">
              💾 บันทึก
            </button>
            <button onclick="deleteUserRow('${safeU}', event)" title="ลบผู้ใช้ออกจากระบบ"
              style="background:#fee2e2;color:#dc2626;border:none;padding:8px 14px;border-radius:10px;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit;">
              🗑️
            </button>
          </div>
        </div>`;
      }).join("") + `</div>`;
  } catch(e) {
    listEl.innerHTML = `<p style="color:#dc2626;text-align:center;font-weight:700;padding:40px 0;">เกิดข้อผิดพลาด: ${escapeHtml(e.message||"")}</p>`;
  }
}

// ➕ เพิ่มผู้ใช้ใหม่โดยตรง
async function createNewUser(evt) {
  const nameEl = document.getElementById("newUserName");
  const roleEl = document.getElementById("newUserRole");
  const pwdEl  = document.getElementById("newUserPwd");
  const username = (nameEl?.value || "").trim();
  if (!username) { showToast("กรุณาระบุชื่อพนักงาน", "warn"); nameEl?.focus(); return; }
  const payload = { adminToken: _adminToken, username, role: roleEl?.value || "user" };
  const pwd = (pwdEl?.value || "").trim();
  if (pwd) payload.password = pwd;

  await guardedClick(evt?.currentTarget, async () => {
    try {
      const res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ module: "SYSTEM", action: "createUser", payload })
      }).then(r => r.json());
      if (res.ok) { showToast(`➕ เพิ่ม "${username}" แล้ว`, "success"); loadRolesPage(); }
      else showToast(res.message || "เพิ่มไม่สำเร็จ", "error");
    } catch (e) { showToast("เชื่อมต่อไม่สำเร็จ: " + e.message, "error"); }
  });
}

// 🗑️ ลบผู้ใช้ (ถาวร)
async function deleteUserRow(username, evt) {
  if (!confirm(`ลบผู้ใช้ "${username}" ออกจากระบบ?\n\n⚠️ ลบแล้วเข้าใช้งานไม่ได้ทันที และย้อนกลับไม่ได้\n(ประวัติการเบิก/รับ เดิมยังอยู่ครบ)`)) return;
  await guardedClick(evt?.currentTarget, async () => {
    try {
      const res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ module: "SYSTEM", action: "deleteUser", payload: { adminToken: _adminToken, username } })
      }).then(r => r.json());
      if (res.ok) { showToast(`🗑️ ลบ "${username}" แล้ว`, "warn"); loadRolesPage(); }
      else showToast(res.message || "ลบไม่สำเร็จ", "error");
    } catch (e) { showToast("เชื่อมต่อไม่สำเร็จ: " + e.message, "error"); }
  });
}

// 👑 ลด admin คนอื่นทั้งหมดเป็น user (เฉพาะเจ้าของระบบ)
async function demoteOtherAdmins(evt) {
  if (!confirm("ลด admin คนอื่นทั้งหมดเป็น user?\n\nจะเหลือเจ้าของระบบเป็น admin คนเดียว\nเปลี่ยนกลับได้ภายหลังจากหน้านี้")) return;
  await guardedClick(evt?.currentTarget, async () => {
    try {
      const res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ module: "SYSTEM", action: "demoteOtherAdmins", payload: { adminToken: _adminToken } })
      }).then(r => r.json());
      if (res.ok) {
        showToast(res.count ? `⬇️ ลด ${res.count} คนเป็น user แล้ว` : "ไม่มี admin คนอื่นให้ลด", "success");
        loadRolesPage();
      } else {
        showToast(res.message || "ไม่สำเร็จ", "error");
      }
    } catch (e) { showToast("เชื่อมต่อไม่สำเร็จ: " + e.message, "error"); }
  });
}

async function saveRolePageUser(username) {
  const roleEl = document.getElementById("rpRoleSelect-" + username);
  if (!roleEl) return;
  const newRole = roleEl.value;
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ module: "SYSTEM", action: "setUserRole",
        payload: { adminToken: _adminToken, username, role: newRole } })
    }).then(r => r.json());
    if (res.ok) { showToast(`✅ ${username} → ${newRole}`); loadRolesPage(); }
    else alert("❌ " + res.message);
  } catch(e) { alert("เกิดข้อผิดพลาด: " + e.message); }
}

async function saveUserRole(username) {
  const roleEl = document.getElementById("roleSelect-" + username);
  const pwdEl  = document.getElementById("pwdInput-" + username);
  if (!roleEl) return;
  const newRole = roleEl.value;
  const newPwd  = pwdEl ? pwdEl.value.trim() : "";
  const payload = { adminToken: _adminToken, username, role: newRole };
  if (newPwd) payload.password = newPwd;
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ module: "SYSTEM", action: "setUserRole", payload })
    }).then(r => r.json());
    if (res.ok) { showToast(`✅ บันทึก ${username} → ${newRole}${newPwd?" + รหัสผ่านใหม่":""}`); if(pwdEl) pwdEl.value=""; }
    else alert("❌ " + res.message);
  } catch(e) { alert("เกิดข้อผิดพลาด: " + e.message); }
}

// ─────────────────────────────────────────────
// ACTIVITY PANEL
// ─────────────────────────────────────────────
let _activityData = [];
let _activityFilter = "ALL";

function openActivityPanel() {
  document.getElementById("activityPanelModal").classList.remove("hidden");
  loadActivityLog();
}
function closeActivityPanel() {
  document.getElementById("activityPanelModal").classList.add("hidden");
}

function filterActivity(mod) {
  _activityFilter = mod;
  document.querySelectorAll(".act-filter-btn").forEach(b => b.classList.remove("active"));
  const btn = document.getElementById("actFilter-" + mod);
  if (btn) btn.classList.add("active");
  renderActivityList();
}

function renderActivityList() {
  const listEl = document.getElementById("activityList");
  const items = _activityFilter === "ALL" ? _activityData : _activityData.filter(a => a.module === _activityFilter);
  if (!items.length) {
    listEl.innerHTML = '<p class="text-slate-400 text-center text-sm font-bold py-8">ไม่มีข้อมูลในช่วงนี้</p>';
    return;
  }
  const moduleColor = { COLDROOM: "bg-indigo-100 text-indigo-700", SQF: "bg-orange-100 text-orange-700", MLM: "bg-blue-100 text-blue-700" };
  const moduleIcon  = { COLDROOM: "❄️", SQF: "🏭", MLM: "🏭" };
  listEl.innerHTML = items.map(a => `
    <div class="flex gap-3 items-start bg-slate-50 rounded-2xl p-3 border border-slate-100">
      <span class="shrink-0 text-xl mt-0.5">${moduleIcon[a.module] || "📋"}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs font-black px-2 py-0.5 rounded-full ${moduleColor[a.module] || "bg-slate-100 text-slate-600"}">${escapeHtml(a.module||"")}</span>
          <span class="text-xs font-black text-slate-700 truncate">${escapeHtml(a.name||"")}</span>
          ${a.action ? `<span class="text-xs text-slate-500 font-bold">${escapeHtml(a.action)}</span>` : ""}
          ${a.qty !== undefined && a.qty !== "" ? `<span class="text-xs font-black text-emerald-600">× ${escapeHtml(String(a.qty))}</span>` : ""}
        </div>
        <div class="flex gap-3 mt-1 flex-wrap">
          <span class="text-xs text-slate-400">👤 ${escapeHtml(a.user||"-")}</span>
          ${a.device ? `<span class="text-xs text-slate-300">🖥️ ${escapeHtml(a.device)}</span>` : ""}
          <span class="text-xs text-slate-400 ml-auto shrink-0">🕐 ${escapeHtml(a.timestamp||"")}</span>
        </div>
        ${a.note ? `<p class="text-xs text-slate-400 mt-0.5 italic">💬 ${escapeHtml(a.note)}</p>` : ""}
      </div>
    </div>`).join("");
}

async function loadActivityLog() {
  const listEl = document.getElementById("activityList");
  listEl.innerHTML = '<p class="text-slate-400 text-center text-sm font-bold py-8">กำลังโหลด...</p>';
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ module: "SYSTEM", action: "getActivityLog",
        payload: { adminToken: _adminToken } })
    }).then(r => r.json());
    if (!res.ok) { listEl.innerHTML = `<p class="text-red-500 text-center text-sm font-bold py-8">❌ ${res.message}</p>`; return; }
    _activityData = res.list || [];
    renderActivityList();
  } catch(e) {
    listEl.innerHTML = `<p class="text-red-500 text-center text-sm font-bold py-8">เกิดข้อผิดพลาด: ${e.message}</p>`;
  }
}
