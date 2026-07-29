// ─────────────────────────────────────────────
// REGISTER VIEW TOGGLE
// ─────────────────────────────────────────────
function showRegisterView() {
  document.getElementById("loginPanel").style.display    = "none";
  document.getElementById("registerPanel").style.display = "";
  document.getElementById("registerNameInput").value     = "";
  document.getElementById("registerNameInput").focus();
}
function showLoginView() {
  document.getElementById("registerPanel").style.display = "none";
  document.getElementById("loginPanel").style.display    = "";
  // reset two-step login state
  _loginNeedsPassword = false;
  document.getElementById("passwordSection").style.display = "none";
  document.getElementById("usernameInput").readOnly = false;
  _setLoginBtn("เข้าสู่ระบบ 🚀", false);
}

async function submitRegister() {
  const name = (document.getElementById("registerNameInput")?.value || "").trim();
  if (!name) { alert("กรุณาระบุชื่อของคุณ"); return; }

  const btn = document.querySelector("#registerPanel button");
  if (btn) { btn.disabled = true; btn.textContent = "กำลังส่ง..."; }

  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ module: "SYSTEM", action: "registerUser",
        payload: { username: name, requestedRole: document.getElementById("registerRoleSelect")?.value || "user" }, deviceName: getDeviceInfo() })
    }).then(r => r.json());

    if (res.ok) {
      alert("✅ " + res.message + "\n\nชื่อ: " + name + "\nกรุณารอผู้ควบคุมระบบอนุมัติ แล้วกลับมาเข้าสู่ระบบใหม่");
      showLoginView();
      document.getElementById("usernameInput").value = name;
    } else {
      alert("❌ " + (res.message || "เกิดข้อผิดพลาด"));
    }
  } catch(e) {
    alert("เกิดข้อผิดพลาด: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "ส่งคำขอ 📨"; }
  }
}

// ─────────────────────────────────────────────
// LOGIN / LOGOUT
// ─────────────────────────────────────────────
let _loginNeedsPassword = false;
let _adminToken = null; // อยู่ใน memory เท่านั้น — reload หาย (by design)

function _setLoginBtn(text, disabled) {
  const btn = document.getElementById("loginBtn");
  if (btn) { btn.disabled = disabled; btn.textContent = text; }
}

async function login() {
  const user = (document.getElementById("usernameInput")?.value || "").trim();
  if (!user) { alert("กรุณาระบุชื่อผู้ใช้"); return; }

  // ถ้าช่อง password แสดงอยู่แล้ว → ส่งพร้อม password
  if (_loginNeedsPassword) { await loginWithPassword(); return; }

  _hideAccessBox();   // ลองชื่อใหม่ → ล้างผลครั้งก่อน

  _setLoginBtn("กำลังตรวจสอบ...", true);
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ module: "SYSTEM", action: "verifyUser", payload: { username: user } })
    }).then(r => r.json());

    if (res.requirePassword) {
      // แสดงช่องรหัสผ่าน
      _loginNeedsPassword = true;
      document.getElementById("passwordSection").style.display = "";
      document.getElementById("passwordInput").value = "";
      document.getElementById("passwordInput").focus();
      _setLoginBtn("เข้าสู่ระบบ 🔑", false);
      document.getElementById("usernameInput").readOnly = true;
      return;
    }
    if (!res.ok) {
      // ไม่พบชื่อ / รออนุมัติ / ถูกปฏิเสธ → แสดงกล่องขอสิทธิ์แทน alert
      if (res.notFound) { _showAccessBox("notfound", res.message, user); return; }
      if (res.pending)  { _showAccessBox("pending",  res.message, user); return; }
      if (res.rejected) { _showAccessBox("rejected", res.message, user); return; }
      alert("❌ " + (res.message || "เข้าสู่ระบบไม่สำเร็จ"));
      return;
    }
    _hideAccessBox();
    _loginSuccess(user, res.role, res.adminToken);
  } catch(e) {
    alert("เกิดข้อผิดพลาด: " + e.message);
  } finally {
    if (!_loginNeedsPassword) _setLoginBtn("เข้าสู่ระบบ 🚀", false);
  }
}

// ─────────────────────────────────────────────
// 🙋 ขอสิทธิ์เข้าใช้งาน — แสดงตรงหน้า login เลย ไม่ต้องพิมพ์ชื่อซ้ำ
// ─────────────────────────────────────────────
let _accessReqUser = "";

function _hideAccessBox() {
  const box = document.getElementById("accessBox");
  if (box) box.style.display = "none";
}

// kind: notfound | pending | rejected | sent
function _showAccessBox(kind, msg, username) {
  const box  = document.getElementById("accessBox");
  const msgP = document.getElementById("accessMsg");
  const btn  = document.getElementById("accessBtn");
  const hint = document.getElementById("accessHint");
  if (!box) { alert(msg || ""); return; }
  _accessReqUser = username || "";

  const tone = {
    notfound: { bg:"var(--sq-warn-bg)", bd:"var(--sq-warn)", fg:"var(--sq-high)", icon:"❓",
                hint:"กดปุ่มด้านล่างเพื่อส่งคำขอ แล้วรอหัวหน้าเปิดสิทธิ์ให้", showBtn:true },
    pending:  { bg:"var(--sq-accent-2)", bd:"#93c5fd", fg:"#1e40af", icon:"⏳",
                hint:"หัวหน้าได้รับคำขอแล้ว เมื่ออนุมัติจะเข้าใช้งานได้ทันที", showBtn:false },
    rejected: { bg:"var(--sq-crit-bg)", bd:"var(--sq-crit)", fg:"var(--sq-crit)", icon:"🚫",
                hint:"กรุณาติดต่อหัวหน้างานโดยตรง", showBtn:false },
    sent:     { bg:"var(--sq-accent-2)", bd:"#86efac", fg:"var(--sq-accent)", icon:"✅",
                hint:"หัวหน้าจะได้รับแจ้งเตือน เมื่ออนุมัติแล้วลองเข้าสู่ระบบอีกครั้ง", showBtn:false }
  }[kind] || { bg:"var(--sq-raised)", bd:"var(--sq-line)", fg:"var(--sq-ink2)", icon:"ℹ️", hint:"", showBtn:false };

  box.style.background  = tone.bg;
  box.style.border      = "2px solid " + tone.bd;
  box.style.display     = "";
  msgP.style.color      = tone.fg;
  msgP.textContent      = tone.icon + " " + (msg || "");
  hint.style.color      = tone.fg;
  hint.textContent      = tone.hint;
  btn.style.display     = tone.showBtn ? "" : "none";
  btn.disabled          = false;
  btn.textContent       = "🙋 ขอสิทธิ์เข้าใช้งานจาก Admin";
}

async function submitAccessRequest() {
  const user = _accessReqUser || (document.getElementById("usernameInput")?.value || "").trim();
  if (!user) { alert("กรุณาระบุชื่อก่อน"); return; }
  const btn = document.getElementById("accessBtn");
  await guardedClick(btn, async () => {
    try {
      const res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          module: "SYSTEM", action: "registerUser",
          payload: { username: user, requestedRole: "user" },
          deviceName: getDeviceInfo()
        })
      }).then(r => r.json());

      if (res.ok) {
        _showAccessBox("sent", "ส่งคำขอสำหรับ \"" + user + "\" เรียบร้อยแล้ว", user);
      } else if (/รอการอนุมัติ/.test(res.message || "")) {
        _showAccessBox("pending", res.message, user);
      } else if (/ปฏิเสธ/.test(res.message || "")) {
        _showAccessBox("rejected", res.message, user);
      } else {
        _showAccessBox("notfound", res.message || "ส่งคำขอไม่สำเร็จ", user);
      }
    } catch (e) {
      alert("เชื่อมต่อไม่สำเร็จ: " + e.message);
    }
  });
}

async function loginWithPassword() {
  const user = (document.getElementById("usernameInput")?.value || "").trim();
  const pass = (document.getElementById("passwordInput")?.value || "").trim();
  if (!pass) { alert("กรุณาระบุรหัสผ่าน"); return; }
  _setLoginBtn("กำลังตรวจสอบ...", true);
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ module: "SYSTEM", action: "verifyUser", payload: { username: user, password: pass } })
    }).then(r => r.json());
    if (!res.ok) {
      alert("❌ " + (res.message || "รหัสผ่านไม่ถูกต้อง"));
      document.getElementById("passwordInput").value = "";
      document.getElementById("passwordInput").focus();
      _setLoginBtn("เข้าสู่ระบบ 🔑", false);
      return;
    }
    _loginSuccess(user, res.role, res.adminToken);
  } catch(e) {
    alert("เกิดข้อผิดพลาด: " + e.message);
    _setLoginBtn("เข้าสู่ระบบ 🔑", false);
  }
}

function _loginSuccess(user, role, adminToken) {
  _loginNeedsPassword = false;
  _adminToken = adminToken || null;
  if (_adminToken) sessionStorage.setItem("appstock_admin_token", _adminToken);
  else sessionStorage.removeItem("appstock_admin_token");
  document.getElementById("passwordSection").style.display = "none";
  document.getElementById("usernameInput").readOnly = false;
  _setLoginBtn("เข้าสู่ระบบ 🚀", false);
  localStorage.setItem("unified_stock_user", user);
  localStorage.setItem("unified_stock_role", role || "user");
  loadDevice();
  // แสดงหน้าเลือกอุปกรณ์ทุกครั้งที่ Login (ไม่ข้ามแม้จะมี pref บันทึกไว้)
  showModePicker(user);
}

function showModePicker(user) {
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 768;
  document.getElementById("modePicker").style.display = "flex";
  document.getElementById("modePickerUser").textContent = user || currentUser ||
    localStorage.getItem("unified_stock_user") || "";
  // Highlight recommended option
  document.getElementById("modeBtnMobile").classList.toggle("ring-4", isMobile);
  document.getElementById("modeBtnMobile").classList.toggle("ring-indigo-400", isMobile);
  document.getElementById("modeBtnDesktop").classList.toggle("ring-4", !isMobile);
  document.getElementById("modeBtnDesktop").classList.toggle("ring-indigo-400", !isMobile);
  if (isMobile) {
    document.getElementById("modeRecommend").textContent = "แนะนำสำหรับอุปกรณ์นี้";
    document.getElementById("modeRecommendEl").style.display = "block";
  } else {
    document.getElementById("modeRecommendEl").style.display = "none";
  }
}

function selectMode(mode, remember) {
  if (remember) localStorage.setItem("appstock_mode_pref", mode);
  sessionStorage.setItem("appstock_mode_session", mode); // จดจำสำหรับ session นี้เสมอ
  document.getElementById("modePicker").style.display = "none";
  if (mode === "mobile") { window.location.href = "mobile.html"; }
  else                   { checkAuth(); checkRawAlertsOnLogin(); }
}

function switchToMobile() {
  localStorage.setItem("appstock_mode_pref", "mobile");
  window.location.href = "mobile.html";
}

function logout() {
  // Revoke admin token ฝั่ง server
  if (_adminToken) {
    fetch(GAS_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ module: "SYSTEM", action: "logoutAdmin", payload: { adminToken: _adminToken } })
    }).catch(() => {});
  }
  // ล้าง memory + session token
  _adminToken = null;
  sessionStorage.removeItem("appstock_admin_token");
  _loginNeedsPassword = false;
  // ล้าง localStorage ทุก key
  ["unified_stock_user","unified_stock_role","appstock_device_name"].forEach(k => localStorage.removeItem(k));
  // ล้าง sensitive input fields
  ["passwordInput","usernameInput","uniTgToken"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  // หมายเหตุ: เก็บ appstock_device_id ไว้ เพื่อ device fingerprint ยังคงเดิม
  location.reload();
}
