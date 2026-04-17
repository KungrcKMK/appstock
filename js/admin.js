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
  listEl.innerHTML = '<p class="text-slate-400 text-center text-sm font-bold py-8">กำลังโหลด...</p>';
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ module: "SYSTEM", action: "getPendingUsers",
        payload: { adminToken: _adminToken } })
    }).then(r => r.json());

    if (!res.ok) { listEl.innerHTML = `<p class="text-red-500 text-center text-sm font-bold py-8">❌ ${res.message}</p>`; return; }
    if (!res.list || res.list.length === 0) {
      listEl.innerHTML = '<p style="color:#94a3b8;text-align:center;font-weight:700;padding:40px 0;">✅ ไม่มีคำขอรอการอนุมัติ</p>';
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
      <div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:16px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;box-shadow:0 2px 6px rgba(0,0,0,.04);">
        <div>
          <p style="margin:0;font-weight:900;font-size:15px;color:#0f172a;">👤 ${escapeHtml(u.username||"")}</p>
          <p style="margin:3px 0 0;font-size:12px;font-weight:700;color:#94a3b8;">📅 ${escapeHtml(u.requestedAt||"")}</p>
          <p style="margin:4px 0 0;font-size:12px;font-weight:800;color:#6366f1;">🔖 ขอ Role: ${escapeHtml(roleLabel)}</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button onclick="adminApprove('${safeU}', event)"
            style="background:#059669;color:#fff;border:none;padding:9px 18px;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;">✅ อนุมัติ</button>
          <button onclick="adminReject('${safeU}', event)"
            style="background:#dc2626;color:#fff;border:none;padding:9px 18px;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;">❌ ปฏิเสธ</button>
        </div>
      </div>`;
    }).join("");
  } catch(e) {
    listEl.innerHTML = `<p class="text-red-500 text-center text-sm font-bold py-8">เกิดข้อผิดพลาด: ${e.message}</p>`;
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
  ["pending","roles"].forEach(t => {
    const btn  = document.getElementById("adminTab-" + t);
    const pane = document.getElementById("adminTabContent-" + t);
    const isActive = t === tab;
    if (btn)  { btn.style.background = isActive ? "#f59e0b" : "transparent"; btn.style.color = isActive ? "#1e293b" : "#94a3b8"; }
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
    const roleColors = { admin: "#f59e0b", approver: "#0ea5e9", user: "#64748b" };
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
            <option value="approver" ${u.role==="approver"?"selected":""}>✅ approver — อนุมัติ</option>
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
  listEl.innerHTML = '<p style="color:#94a3b8;text-align:center;font-weight:700;padding:40px 0;">⏳ กำลังโหลด...</p>';
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ module: "SYSTEM", action: "getUsers", payload: { adminToken: _adminToken } })
    }).then(r => r.json());
    if (!res.ok) { listEl.innerHTML = `<p style="color:#dc2626;text-align:center;font-weight:700;padding:40px 0;">❌ ${escapeHtml(res.message||"")}</p>`; return; }
    const roleColors  = { admin:"#f59e0b", approver:"#0ea5e9", manager:"#8b5cf6", viewer:"#10b981", user:"#94a3b8" };
    const roleLabels  = { admin:"🔧 admin", approver:"✅ approver", manager:"📋 manager", viewer:"👁️ viewer", user:"👤 user" };
    listEl.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">` +
      res.users.map(u => {
        const safeU  = escapeJs(u.username||"");
        const safeId = escapeAttr(u.username||"");
        const rc = roleColors[u.role] || "#94a3b8";
        return `
        <div style="background:#fff;border-radius:16px;padding:16px 20px;border:1.5px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;box-shadow:0 2px 6px rgba(0,0,0,.04);">
          <div style="flex:1;min-width:0;">
            <p style="margin:0;font-weight:900;font-size:15px;color:#0f172a;">👤 ${escapeHtml(u.username||"")}</p>
            <p style="margin:4px 0 0;font-size:12px;font-weight:700;">
              <span style="background:${rc}22;color:${rc};padding:2px 10px;border-radius:999px;font-size:12px;font-weight:800;">${escapeHtml(roleLabels[u.role]||u.role||"")}</span>
              ${u.hasPassword ? "&nbsp;🔒 มีรหัสผ่าน" : "&nbsp;🔓 ไม่มีรหัสผ่าน"}
            </p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <select id="rpRoleSelect-${safeId}" style="padding:8px 10px;border-radius:10px;border:2px solid #e2e8f0;font-size:13px;font-weight:800;font-family:inherit;outline:none;cursor:pointer;">
              <option value="user"     ${u.role==="user"    ?"selected":""}>👤 user</option>
              <option value="viewer"   ${u.role==="viewer"  ?"selected":""}>👁️ viewer</option>
              <option value="approver" ${u.role==="approver"?"selected":""}>✅ approver</option>
              <option value="manager"  ${u.role==="manager" ?"selected":""}>📋 manager</option>
              <option value="admin"    ${u.role==="admin"   ?"selected":""}>🔧 admin</option>
            </select>
            <button onclick="saveRolePageUser('${safeU}')"
              style="background:#6366f1;color:#fff;border:none;padding:8px 18px;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;">
              💾 บันทึก
            </button>
          </div>
        </div>`;
      }).join("") + `</div>`;
  } catch(e) {
    listEl.innerHTML = `<p style="color:#dc2626;text-align:center;font-weight:700;padding:40px 0;">เกิดข้อผิดพลาด: ${escapeHtml(e.message||"")}</p>`;
  }
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
