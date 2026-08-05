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
//   ใช้ร่วมกันทั้ง index.html และ mobile.html — ห้ามพึ่ง global ของฝั่งใดฝั่งหนึ่ง
//   แต่ละหน้าจอผูก callback ของตัวเองผ่าน offlineConfig()
// ═══════════════════════════════════════════════════════════

const OFFLINE_QUEUE_KEY = "appstock_queue_v1";
const OFFLINE_MAX_TRIES = 5;      // ส่งไม่ผ่านเพราะเน็ตกี่ครั้งถึงจะพัก (กันวนไม่จบ)
const OFFLINE_RETRY_MS  = 45000;  // มีงานค้าง → ลองใหม่ทุก 45 วิ

let _offCfg = {
  gasUrl: "",
  deviceName: () => "",
  onToast: (msg, kind) => {},       // แจ้งผู้ใช้
  onChange: () => {},               // จำนวนงานค้างเปลี่ยน → อัปเดตหน้าจอ
  onSynced: () => {},               // ส่งสำเร็จอย่างน้อย 1 งาน → โหลดข้อมูลใหม่
};
let _offSyncing = false;
let _offTimer   = null;

function offlineConfig(cfg) { Object.assign(_offCfg, cfg || {}); }

// ── ที่เก็บคิว ──
function offlineQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]"); }
  catch (e) { return []; }
}
function _offSave(list) {
  try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(list)); } catch (e) {}
  try { _offCfg.onChange(list.length); } catch (e) {}
}
function offlineCount() { return offlineQueue().length; }

function _offId() {
  // ต้องไม่ซ้ำข้ามเครื่องและข้ามเวลา — crypto ถ้ามี ไม่มีก็ประกอบเอง
  try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return "op-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

/**
 * ส่งงานขึ้นระบบ — ถ้าเน็ตไม่ได้จะเก็บเข้าคิวแล้วส่งให้เองทีหลัง
 * @param {object} body  payload ที่จะส่งไป GAS (ไม่ต้องใส่ opId/clientAt เอง)
 * @param {string} label ข้อความสั้นๆ ให้ผู้ใช้รู้ว่าเป็นงานอะไร เช่น "📤 เบิก น้ำตาล 5 กระสอบ"
 * @returns {Promise<object>} ผลจากเซิร์ฟเวอร์ หรือ { queued:true } ถ้าเข้าคิวไว้
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
  try {
    return await _offPost(job);
  } catch (e) {
    // ยิงไม่ออก = เน็ตมีปัญหา (error ของเซิร์ฟเวอร์จะไม่ตกมาตรงนี้ มันตอบ JSON กลับมาปกติ)
    const list = offlineQueue();
    list.push(job);
    _offSave(list);
    _offSchedule();
    return { queued: true, opId: job.opId, status: "queued" };
  }
}

async function _offPost(job) {
  const res = await fetch(_offCfg.gasUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({}, job.body, {
      opId: job.opId,
      clientAt: job.at,
      deviceName: _offCfg.deviceName()
    }))
  });
  return await res.json();
}

// ── แก้ไขคิวแบบอ่านใหม่ทุกครั้งก่อนเขียน ──
// ⚠️ ห้ามถือ list ไว้ในหน่วยความจำข้ามจังหวะ await แล้วเขียนทับ
// เพราะระหว่างที่กำลังส่งงานอยู่ พนักงานอาจกดเบิกเพิ่ม (เข้าคิวใหม่)
// ถ้าเขียนทับด้วยสำเนาเก่า งานที่เพิ่งกดจะหายเงียบ — ผิดวัตถุประสงค์ทั้งฟีเจอร์
function _offRemoveById(opId) {
  _offSave(offlineQueue().filter(j => j.opId !== opId));
}
function _offPatchJob(opId, patch) {
  const list = offlineQueue();
  const j = list.find(x => x.opId === opId);
  if (j) Object.assign(j, patch);
  _offSave(list);
}

// ── ส่งคิวที่ค้าง ──
// ส่งทีละงานตามลำดับที่ทำจริง — สำคัญมาก เพราะยอดคงเหลือขึ้นกับลำดับ
// (เบิก 5 แล้วคืน 2 กับ คืน 2 แล้วเบิก 5 ผลต่างกันเมื่อของมีจำกัด)
async function offlineSync(manual) {
  if (_offSyncing) return;
  if (!offlineCount()) { if (manual) _offCfg.onToast("ไม่มีงานค้าง", "success"); return; }
  _offSyncing = true;
  let done = 0, failed = 0;

  try {
    for (;;) {
      const list = offlineQueue();     // อ่านใหม่ทุกรอบ
      if (!list.length) break;
      const job = list[0];
      let r;
      try {
        r = await _offPost(job);
      } catch (e) {
        // เน็ตยังไม่กลับมา — หยุดทั้งชุด ไว้ลองใหม่รอบหน้า (ไม่ทิ้งงาน)
        _offPatchJob(job.opId, { tries: (job.tries || 0) + 1, error: "ส่งไม่ออก (เน็ต)" });
        break;
      }
      const ok = r && (r.status === "success" || r.ok === true || r.duplicate === true);
      if (!ok) {
        // เซิร์ฟเวอร์ตอบกลับมาแล้วว่าไม่ผ่าน (เช่น สต๊อกไม่พอ) — ส่งซ้ำไปก็ไม่ผ่าน
        // เอาออกจากคิวแล้วบอกผู้ใช้ให้ชัด อย่าเก็บไว้วนส่งจนตกค้างบังงานอื่น
        _offRecordFailure(Object.assign({}, job, { error: (r && r.message) || "บันทึกไม่สำเร็จ" }));
        failed++;
      } else done++;
      _offRemoveById(job.opId);        // เอาออกทีละงานด้วย opId ไม่ใช่เขียนทับทั้งคิว
    }
  } finally {
    _offSyncing = false;
  }

  if (done) {
    _offCfg.onToast(`ส่งงานที่ค้างไว้สำเร็จ ${done} รายการ ✅`, "success");
    try { _offCfg.onSynced(); } catch (e) {}
  }
  if (failed) {
    _offCfg.onToast(`มี ${failed} รายการส่งไม่ผ่าน — กดดูรายละเอียดที่ปุ่มงานค้าง`, "error");
  }
  if (offlineCount()) _offSchedule();
}

// ── งานที่เซิร์ฟเวอร์ปฏิเสธ เก็บไว้ให้คนดู ไม่ทิ้งเงียบ ──
const OFFLINE_FAIL_KEY = "appstock_queue_failed_v1";
function _offRecordFailure(job) {
  try {
    const f = JSON.parse(localStorage.getItem(OFFLINE_FAIL_KEY) || "[]");
    f.unshift({ at: job.at, label: job.label, error: job.error });
    localStorage.setItem(OFFLINE_FAIL_KEY, JSON.stringify(f.slice(0, 20)));
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

function _offSchedule() {
  if (_offTimer) return;
  _offTimer = setTimeout(() => { _offTimer = null; offlineSync(); }, OFFLINE_RETRY_MS);
}

// ── ตัวกระตุ้นให้ส่ง ──
window.addEventListener("online", () => setTimeout(() => offlineSync(), 1200));
document.addEventListener("visibilitychange", () => { if (!document.hidden) offlineSync(); });
window.addEventListener("load", () => setTimeout(() => offlineSync(), 2500));

/** ข้อความสรุปสำหรับปุ่ม/แถบแสดงงานค้าง */
function offlineSummary() {
  const n = offlineCount(), f = offlineFailures().length;
  if (!n && !f) return "";
  if (n && f)  return `⏳ ค้าง ${n} · ⚠️ ไม่ผ่าน ${f}`;
  if (n)       return `⏳ รอส่ง ${n} รายการ`;
  return `⚠️ ส่งไม่ผ่าน ${f} รายการ`;
}

/** รายละเอียดงานค้าง+งานที่ไม่ผ่าน เป็นข้อความล้วน ใช้โชว์ใน alert/แผง */
function offlineDetailText() {
  const q = offlineQueue(), f = offlineFailures();
  const t = d => { try { return new Date(d).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }); } catch (e) { return ""; } };
  let s = "";
  if (q.length) s += "⏳ รอส่งเมื่อเน็ตกลับมา\n" + q.map(j => `  • ${j.label}  (${t(j.at)})`).join("\n") + "\n\n";
  if (f.length) s += "⚠️ ส่งไม่ผ่าน — ต้องทำใหม่เอง\n" + f.map(j => `  • ${j.label}  (${t(j.at)})\n    เหตุผล: ${j.error}`).join("\n");
  return s || "ไม่มีงานค้าง";
}
