// ═══════════════════════════════════════════════════════════
// offline.js — 📴 ทำงานต่อได้ตอนเน็ตล่ม
//
//   ปัญหาที่แก้: พนักงานเบิกของหน้างาน เน็ตหลุด → กดยืนยันแล้วขึ้น error
//   งานที่ทำไปแล้วจริงๆ หายไปจากระบบ ต้องมาจำแล้วคีย์ใหม่ทีหลัง
//
//   วิธี: ยิงเน็ตก่อนเสมอ ถ้ายิงไม่ออก → เก็บใส่คิวในเครื่อง แล้วส่งเองเมื่อเน็ตกลับมา
//   (ไม่เช็ค navigator.onLine ก่อนยิง เพราะมันบอกแค่ว่า "ต่อ wifi อยู่"
//    ไม่ได้บอกว่าออกเน็ตได้จริง — wifi โรงงานที่ไม่มีอินเทอร์เน็ตจะหลอกได้)
//
//   ⚠️ หัวใจของความถูกต้อง: ทุกงานมี opId ติดตัว ฝั่งเซิร์ฟเวอร์ใช้กันบันทึกซ้ำ
//   เคสที่อันตรายคือเซิร์ฟเวอร์เขียนสำเร็จแล้วแต่คำตอบส่งกลับมาไม่ถึง
//   ถ้าไม่มี opId การส่งซ้ำจะหักสต๊อกสองรอบโดยไม่มีใครรู้
//
//   กติกาที่เพิ่มจากรายงานปรับปรุง (2026-09-16):
//   · ข้อ 2  เก็บลงเครื่องไม่สำเร็จต้องบอกตรงๆ ห้ามบอกว่า "เก็บแล้ว" (readback ยืนยันก่อน)
//   · ข้อ 6  ถ้ามีงานค้าง งานใหม่ต้องต่อท้าย ห้ามแซง — ยอดคงเหลือขึ้นกับลำดับ
//   · ข้อ 7  เลิกรอเมื่อเกิน 30 วิ · error ชั่วคราว (retryable/เน็ต) ลองใหม่ · เฉพาะที่เซิร์ฟเวอร์
//            ปฏิเสธจริงถึงย้ายไป "ส่งไม่ผ่าน" · บัตรผ่านหมดอายุ = หยุดรอ login ไม่ทิ้งงาน
//   · ข้อ 17 งานที่ส่งไม่ผ่านเก็บครบ (payload+opId) ส่งซ้ำได้หลังแก้ต้นเหตุ
//
//   ใช้ร่วมกันทั้ง index.html และ mobile.html — ห้ามพึ่ง global ของฝั่งใดฝั่งหนึ่ง
//   แต่ละหน้าจอผูก callback ของตัวเองผ่าน offlineConfig()
// ═══════════════════════════════════════════════════════════

const OFFLINE_QUEUE_KEY  = "appstock_queue_v1";
const OFFLINE_FAIL_KEY   = "appstock_queue_failed_v1";
const OFFLINE_LOCK_KEY   = "appstock_queue_lock";
const OFFLINE_MAX_TRIES  = 8;       // ยิงไม่ออกติดกันกี่ครั้งค่อยเตือน (ยังไม่ทิ้งงาน แค่บอกให้รู้)
const OFFLINE_RETRY_MS   = 45000;   // มีงานค้าง → ลองใหม่ทุก 45 วิ
const OFFLINE_TIMEOUT_MS = 30000;   // ข้อ 7: รอคำตอบเกินนี้ถือว่ายิงไม่ออก (เซิร์ฟเวอร์อาจยังทำอยู่ — opId กันซ้ำให้)

let _offCfg = {
  gasUrl: "",
  deviceName: () => "",
  token: () => "",                  // บัตรผ่านแนบตอน "ส่ง" ไม่ใช่ตอนเข้าคิว — เข้าระบบใหม่แล้วงานเก่าก็ส่งได้
  onToast: (msg, kind) => {},
  onChange: () => {},               // จำนวนงานค้างเปลี่ยน → อัปเดตหน้าจอ
  onSynced: () => {},               // ส่งสำเร็จอย่างน้อย 1 งาน → โหลดข้อมูลใหม่
  onNeedLogin: () => {}             // บัตรผ่านใช้ไม่ได้ → ให้หน้าจอพาไป login (งานยังอยู่ในคิว)
};
let _offSyncing = false;
let _offTimer   = null;
const _offTabId = Math.random().toString(36).slice(2, 10);

function offlineConfig(cfg) { Object.assign(_offCfg, cfg || {}); }

// ── ที่เก็บคิว ──
function offlineQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]"); }
  catch (e) { return []; }
}
// ข้อ 2: คืน true เฉพาะเมื่ออ่านกลับมาแล้วตรงกับที่เขียน — พื้นที่เต็ม/โหมดส่วนตัวจะได้ไม่หลอกว่าเก็บแล้ว
function _offSave(list) {
  let ok = false;
  try {
    const s = JSON.stringify(list);
    localStorage.setItem(OFFLINE_QUEUE_KEY, s);
    ok = localStorage.getItem(OFFLINE_QUEUE_KEY) === s;
  } catch (e) { ok = false; }
  try { _offCfg.onChange(list.length); } catch (e) {}
  return ok;
}
function offlineCount() { return offlineQueue().length; }

function _offId() {
  try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return "op-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function _offEnqueue(job) {
  const list = offlineQueue();
  list.push(job);
  if (!_offSave(list)) return false;
  // ยืนยันอีกชั้นว่างานอยู่ในคิวจริง
  return offlineQueue().some(j => j.opId === job.opId);
}

/**
 * ส่งงานขึ้นระบบ — ถ้าเน็ตไม่ได้จะเก็บเข้าคิวแล้วส่งให้เองทีหลัง
 * @returns {Promise<object>} ผลจากเซิร์ฟเวอร์ · { queued:true } ถ้าเข้าคิวไว้
 *          · { queued:false, storeFailed:true, job } ถ้าเน็ตล่มและเก็บลงเครื่องไม่ได้ (ข้อ 2)
 */
async function offlineSend(body, label) {
  const job = {
    opId:  _offId(),
    at:    new Date().toISOString(),   // เวลาที่พนักงานกดยืนยันจริง — เซิร์ฟเวอร์ใช้ตัวนี้เป็น Timestamp
    label: label || "รายการ",
    body:  body,
    tries: 0,
    error: ""
  };
  // ข้อ 6: มีงานค้างอยู่ = งานใหม่ต่อท้าย แล้วลองส่งทั้งคิวตามลำดับ
  if (offlineCount() > 0) {
    if (!_offEnqueue(job)) return { queued: false, storeFailed: true, job: job, status: "error",
                                    message: "เก็บลงเครื่องไม่ได้ (พื้นที่เต็มหรือเบราว์เซอร์ไม่อนุญาต)" };
    offlineSync();
    return { queued: true, opId: job.opId, status: "queued", behind: offlineCount() - 1 };
  }
  let r;
  try {
    r = await _offPost(job);
  } catch (e) {
    if (!_offEnqueue(job)) return { queued: false, storeFailed: true, job: job, status: "error",
                                    message: "เน็ตล่มและเก็บลงเครื่องไม่ได้ (พื้นที่เต็มหรือเบราว์เซอร์ไม่อนุญาต)" };
    _offSchedule();
    return { queued: true, opId: job.opId, status: "queued" };
  }
  // ข้อ 7: เซิร์ฟเวอร์บอกว่าลองใหม่ได้ (ล็อกชนกัน) — เก็บไว้ส่งเอง ไม่ให้พนักงานคีย์ใหม่
  if (r && r.retryable) {
    if (_offEnqueue(job)) { _offSchedule(); return { queued: true, opId: job.opId, status: "queued", retryable: true }; }
  }
  return r;
}

async function _offPost(job) {
  const ctrl = (typeof AbortController === "function") ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), OFFLINE_TIMEOUT_MS) : null;
  try {
    const res = await fetch(_offCfg.gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      signal: ctrl ? ctrl.signal : undefined,
      body: JSON.stringify(Object.assign({}, job.body, {
        opId: job.opId,
        clientAt: job.at,
        deviceName: _offCfg.deviceName(),
        sessionToken: (typeof _offCfg.token === "function" ? _offCfg.token() : "") || undefined
      }))
    });
    return await res.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── แก้ไขคิวแบบอ่านใหม่ทุกครั้งก่อนเขียน ──
// ห้ามถือ list ไว้ในหน่วยความจำข้ามจังหวะ await แล้วเขียนทับ — งานที่กดเพิ่มระหว่างส่งจะหายเงียบ
function _offRemoveById(opId) {
  _offSave(offlineQueue().filter(j => j.opId !== opId));
}
function _offPatchJob(opId, patch) {
  const list = offlineQueue();
  const j = list.find(x => x.opId === opId);
  if (j) Object.assign(j, patch);
  _offSave(list);
}

// ── ข้อ 6 (หลายแท็บ): ให้แท็บเดียวเป็นคนส่ง — กันสองแท็บส่งงานเดียวกันพร้อมกัน ──
function _offTakeLock() {
  try {
    const raw = localStorage.getItem(OFFLINE_LOCK_KEY);
    if (raw) {
      const l = JSON.parse(raw);
      if (l.tab !== _offTabId && Date.now() - l.at < 90000) return false;
    }
    localStorage.setItem(OFFLINE_LOCK_KEY, JSON.stringify({ tab: _offTabId, at: Date.now() }));
    return true;
  } catch (e) { return true; }
}
function _offReleaseLock() {
  try {
    const raw = localStorage.getItem(OFFLINE_LOCK_KEY);
    if (raw && JSON.parse(raw).tab === _offTabId) localStorage.removeItem(OFFLINE_LOCK_KEY);
  } catch (e) {}
}

// ── ส่งคิวที่ค้าง — ทีละงานตามลำดับที่ทำจริง ──
// เรียกซ้อนกันได้: ถ้ากำลังส่งอยู่ คืน promise ของรอบที่กำลังวิ่ง (ผู้เรียก await รอรอบนั้นจบได้จริง
// แทนที่จะได้ค่าว่างกลับไปทันทีแล้วเข้าใจผิดว่าส่งเสร็จ)
let _offSyncPromise = null;
function offlineSync(manual) {
  if (_offSyncPromise) return _offSyncPromise;
  _offSyncPromise = _offSyncRun(manual).finally(() => { _offSyncPromise = null; });
  return _offSyncPromise;
}
async function _offSyncRun(manual) {
  if (!offlineCount()) { if (manual) _offCfg.onToast("ไม่มีงานค้าง", "success"); return; }
  if (!_offTakeLock()) { if (manual) _offCfg.onToast("อีกหน้าต่างหนึ่งกำลังส่งอยู่", "success"); return; }
  _offSyncing = true;
  let done = 0, failed = 0, needLogin = false;

  try {
    for (;;) {
      const list = offlineQueue();
      if (!list.length) break;
      const job = list[0];
      let r;
      try {
        r = await _offPost(job);
      } catch (e) {
        // เน็ตยังไม่กลับมา / หมดเวลารอ — หยุดทั้งชุด ไว้ลองใหม่รอบหน้า (ไม่ทิ้งงาน)
        const tries = (job.tries || 0) + 1;
        _offPatchJob(job.opId, { tries: tries, error: "ส่งไม่ออก (เน็ต)" });
        if (tries === OFFLINE_MAX_TRIES)
          _offCfg.onToast("งานค้างส่งไม่ออกหลายครั้งแล้ว — ตรวจสัญญาณเน็ต งานยังเก็บไว้ครบ", "error");
        break;
      }
      if (r && r.needLogin) {
        // บัตรผ่านใช้ไม่ได้ — งานยังอยู่ในคิว เข้าระบบใหม่แล้วจะส่งต่อเอง (บัตรแนบตอนส่ง)
        needLogin = true;
        _offPatchJob(job.opId, { error: "รอเข้าสู่ระบบใหม่" });
        break;
      }
      if (r && r.retryable) {
        _offPatchJob(job.opId, { tries: (job.tries || 0) + 1, error: r.message || "ระบบไม่ว่าง ลองใหม่" });
        break;
      }
      const ok = r && (r.status === "success" || r.ok === true || r.duplicate === true);
      if (!ok) {
        // เซิร์ฟเวอร์ตอบชัดว่าไม่ผ่าน (เช่น สต๊อกไม่พอ) — ส่งซ้ำก็ไม่ผ่าน เอาออกจากคิว เก็บไว้ให้คนดูครบทุกอย่าง
        _offRecordFailure(Object.assign({}, job, { error: (r && r.message) || "บันทึกไม่สำเร็จ" }));
        failed++;
      } else done++;
      _offRemoveById(job.opId);
    }
  } finally {
    _offSyncing = false;
    _offReleaseLock();
  }

  if (done) {
    _offCfg.onToast(`ส่งงานที่ค้างไว้สำเร็จ ${done} รายการ ✅`, "success");
    try { _offCfg.onSynced(); } catch (e) {}
  }
  if (failed) _offCfg.onToast(`มี ${failed} รายการส่งไม่ผ่าน — กดดูรายละเอียดที่ปุ่มงานค้าง`, "error");
  if (needLogin) { try { _offCfg.onNeedLogin(); } catch (e) {} }
  else if (offlineCount()) _offSchedule();
}

// ── ข้อ 17: งานที่เซิร์ฟเวอร์ปฏิเสธ เก็บครบ (payload + opId) ส่งซ้ำได้หลังแก้ต้นเหตุ ──
function _offRecordFailure(job) {
  try {
    const f = offlineFailures();
    f.unshift({ opId: job.opId, at: job.at, label: job.label, body: job.body, error: job.error, failedAt: new Date().toISOString() });
    localStorage.setItem(OFFLINE_FAIL_KEY, JSON.stringify(f.slice(0, 50)));
  } catch (e) {}
}
function offlineFailures() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_FAIL_KEY) || "[]"); }
  catch (e) { return []; }
}
function offlineClearFailures() {
  try { localStorage.removeItem(OFFLINE_FAIL_KEY); } catch (e) {}
  try { _offCfg.onChange(offlineCount()); } catch (e) {}
}
/** เอางานที่เคยส่งไม่ผ่านกลับเข้าคิว (opId เดิม — เซิร์ฟเวอร์ไม่เคยรับ จึงไม่ซ้ำ) */
function offlineResend(opId) {
  const f = offlineFailures();
  const j = f.find(x => x.opId === opId);
  if (!j) return false;
  const job = { opId: j.opId, at: j.at, label: j.label, body: j.body, tries: 0, error: "" };
  if (!_offEnqueue(job)) return false;
  try { localStorage.setItem(OFFLINE_FAIL_KEY, JSON.stringify(f.filter(x => x.opId !== opId))); } catch (e) {}
  offlineSync();
  return true;
}
function offlineDropFailure(opId) {
  try { localStorage.setItem(OFFLINE_FAIL_KEY, JSON.stringify(offlineFailures().filter(x => x.opId !== opId))); } catch (e) {}
  try { _offCfg.onChange(offlineCount()); } catch (e) {}
}

function _offSchedule() {
  if (_offTimer) return;
  _offTimer = setTimeout(() => { _offTimer = null; offlineSync(); }, OFFLINE_RETRY_MS);
}

// ── ตัวกระตุ้นให้ส่ง ──
window.addEventListener("online", () => setTimeout(() => offlineSync(), 1200));
document.addEventListener("visibilitychange", () => { if (!document.hidden) offlineSync(); });
window.addEventListener("load", () => setTimeout(() => offlineSync(), 2500));
// อีกแท็บเปลี่ยนคิว → อัปเดตตัวเลขบนหน้าจอนี้ด้วย
window.addEventListener("storage", e => {
  if (e.key === OFFLINE_QUEUE_KEY || e.key === OFFLINE_FAIL_KEY) { try { _offCfg.onChange(offlineCount()); } catch (x) {} }
});

/** ข้อความสรุปสำหรับปุ่ม/แถบแสดงงานค้าง */
function offlineSummary() {
  const n = offlineCount(), f = offlineFailures().length;
  const waitLogin = offlineQueue().some(j => j.error === "รอเข้าสู่ระบบใหม่");
  if (!n && !f) return "";
  if (waitLogin) return `🔑 เข้าสู่ระบบใหม่เพื่อส่งงานค้าง ${n} รายการ`;
  if (n && f)  return `⏳ ค้าง ${n} · ⚠️ ไม่ผ่าน ${f}`;
  if (n)       return `⏳ รอส่ง ${n} รายการ`;
  return `⚠️ ส่งไม่ผ่าน ${f} รายการ`;
}

/** รายละเอียดงานค้าง+งานที่ไม่ผ่าน เป็นข้อความล้วน (ใช้ใน alert/มือถือ) */
function offlineDetailText() {
  const q = offlineQueue(), f = offlineFailures();
  const t = d => { try { return new Date(d).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }); } catch (e) { return ""; } };
  let s = "";
  if (q.length) s += "⏳ รอส่งเมื่อเน็ตกลับมา\n" + q.map(j => `  • ${j.label}  (${t(j.at)})${j.error ? "  — " + j.error : ""}`).join("\n") + "\n\n";
  if (f.length) s += "⚠️ ส่งไม่ผ่าน — ต้องตรวจแล้วส่งซ้ำหรือทำใหม่\n" + f.map(j => `  • ${j.label}  (${t(j.at)})\n    เหตุผล: ${j.error}`).join("\n");
  return s || "ไม่มีงานค้าง";
}
