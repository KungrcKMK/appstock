// AppStock — หลังบ้านบน Cloudflare Workers + D1
// รูปแบบคำขอ/คำตอบ "เหมือนหลังบ้าน Apps Script เดิมทุกประการ" — หน้าจอทั้งสองแก้แค่ที่อยู่ (GAS_URL)
//   GET  ?module=SQF|MLM                         → ข้อมูลวัตถุดิบทั้งคลัง
//   POST {module, action, payload | ...ช่องอื่น}   → ตามตาราง action ด้านล่าง
import { sanitizeDeviceName, maskNames, tgFlushQueue } from "./lib.js";
import * as A from "./auth.js";
import * as R from "./raw.js";
import * as C from "./cold.js";
import * as B from "./bom.js";
import * as S from "./system.js";
import * as P from "./plan.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

async function reply(c, obj, status) {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    obj.serverMs = Date.now() - c.t0;
    if (c.timed) obj.timing = { totalMs: obj.serverMs, lockWaitMs: 0, tgMs: 0 };   // ไม่มีการรอล็อก/รอ Telegram บน Cloudflare
  }
  let body = JSON.stringify(obj);
  try { body = await maskNames(c, body); } catch (e) {}
  return new Response(body, { status: status || 200, headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, CORS) });
}

// คำสั่งระบบ (ไม่ขึ้นกับ module)
const SYSTEM = {
  verifyUser: (c, p) => A.verifyUser(c, p),
  registerUser: (c, p) => A.registerUser(c, p),
  logoutAdmin: async (c, p, d) => { await A.revokeToken(c, p.adminToken || d.sessionToken); return { ok: true }; },
  getPendingUsers: (c, p) => A.getPendingUsers(c, p),
  approveUser: (c, p) => A.approveUser(c, p),
  rejectUser: (c, p) => A.rejectUser(c, p),
  getUsers: (c, p) => A.getUsers(c, p),
  setUserRole: (c, p) => A.setUserRole(c, p),
  demoteOtherAdmins: (c, p) => A.demoteOtherAdmins(c, p),
  createUser: (c, p) => A.createUser(c, p),
  deleteUser: (c, p) => A.deleteUser(c, p),
  getActivityLog: (c, p) => S.getActivityLog(c, p),
  getMyHistory: (c, p, d) => S.getMyHistory(c, p, d),
  SYSSTATUS: (c) => S.sysStatus(c),
  MIRRORPUSH: (c, p, d) => S.mirrorPushNow(c, p, d),
  TGFLUSH: (c) => tgFlushQueue(c),
  EXPORT: (c, p) => S.exportSheets(c, false, Number(p.maxHistory) || 5000),
  submitDelivery: (c, p) => C.submitDelivery(c, p),
  getDeliveries: (c, p, d) => C.getDeliveries(c, p, d),
  submitStockIn: (c, p) => C.submitStockIn(c, p),
  getStockInList: (c, p) => C.getStockInList(c, p),
  reviewStockIn: (c, p) => C.reviewStockIn(c, p),
};

const COLDROOM = {
  getProductAndBalances: (c, p) => C.crGetProductAndBalances(c, p),
  getProductsAndBalancesBulk: (c, p) => C.crGetProductsAndBalancesBulk(c, p),
  saveOrUpdateCount: (c, p) => C.crSaveOrUpdateCount(c, p),
  importLots: (c, p) => C.crImportLots(c, p),
  saveNewProduct: (c, p) => C.crSaveNewProduct(c, p),
  getStartupOverview: (c, p) => C.crGetStartupOverview(c, p),
  clearLotStock: (c, p) => C.crClearLotStock(c, p),
  getLotHistory: (c, p) => C.crGetLotHistory(c, p),
  getAlertSettings: (c, p, d) => C.crGetAlertSettings(c, p, d),
  saveAlertSettings: (c, p) => C.crSaveAlertSettings(c, p),
  saveWorkOrder: (c, p) => C.crSaveWorkOrder(c, p),
  deleteWorkOrder: (c, p) => C.crDeleteWorkOrder(c, p),
  getWorkOrders: (c) => C.crGetWorkOrders(c),
  getColdRoomProducts: (c) => C.crGetColdRoomProducts(c),
  updateProduct: (c, p) => C.crUpdateProduct(c, p),
  getBomList: (c) => B.bomGetList(c),
  getBomHealth: (c) => B.bomHealthReport(c),
  getBomForProduct: (c, p) => B.bomGetForProduct(c, p.barcode),
  saveBom: (c, p) => B.bomSave(c, p),
  deleteBom: (c, p) => B.bomDelete(c, p.barcode),
  calcWorkOrderMaterials: (c, p) => B.bomCalcWorkOrder(c, p),
  archiveOldStock: (c, p) => C.archiveOldStock(c, p),
};

const newCtx = (env, ctx) => ({ env, ctx, t0: Date.now(), cfg: null, deviceId: "", deviceName: "", user: "", timed: false });

export default {
  async fetch(request, env, ctx) {
    const c = newCtx(env, ctx);
    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      if (request.method === "GET") {
        const url = new URL(request.url);
        if (url.searchParams.has("ping")) return reply(c, { ok: true, status: "success", backend: "cloudflare", version: String(env.APP_VERSION || "") });
        const module = String(url.searchParams.get("module") || "MLM").toUpperCase();
        if (module === "SQF" || module === "MLM") return reply(c, await R.getRawMaterials(c, module));
        return reply(c, { status: "error", message: "GET ไม่รองรับ module นี้" });
      }
      if (request.method !== "POST") return reply(c, { ok: false, status: "error", message: "method" }, 405);

      let data;
      try { data = JSON.parse(await request.text()); } catch (e) { return reply(c, { ok: false, status: "error", message: "รูปแบบคำขอไม่ถูกต้อง" }); }
      if (!data || typeof data !== "object") return reply(c, { ok: false, status: "error", message: "รูปแบบคำขอไม่ถูกต้อง" });
      const module = String(data.module || "MLM").toUpperCase();
      const action = String(data.action || "");
      const payload = (data.payload && typeof data.payload === "object") ? data.payload : data;
      c.deviceId = String(data.deviceId || "").slice(0, 50);
      c.deviceName = sanitizeDeviceName(data.deviceName);

      // สำเนาไปชีต: สคริปต์ฝั่ง Google ดึงด้วยกุญแจเฉพาะ (ไม่ใช่บัตรผ่านของคน)
      const mirror = action === "EXPORT" && env.MIRROR_KEY && String(data.mirrorKey || "") === String(env.MIRROR_KEY);
      if (!mirror) {
        // ด่านตรวจตัวตน: คำสั่งเปลี่ยนข้อมูลต้องมีบัตรผ่านที่ยังใช้ได้
        const gate = await A.authGate(c, action, data, payload);
        if (gate) return reply(c, gate);
        c.timed = !!A.WRITE_MIN_ROLE[action] && action !== "SYSSTATUS" && action !== "EXPORT";
      }

      if (SYSTEM[action]) return reply(c, await SYSTEM[action](c, payload, data));
      if (module === "COLDROOM") {
        const h = COLDROOM[action];
        return reply(c, h ? await h(c, payload, data) : { ok: false, message: "Unknown action: " + action });
      }
      if (module === "SQF" || module === "MLM")
        return reply(c, await R.handleRaw(c, action, data, module, { backup: S.rmBackup, usagePlan: P.usagePlan, planSet: P.planSet, planDigestNow: P.planDigestNow }));
      return reply(c, { status: "error", message: "ไม่รู้จัก module: " + module });
    } catch (err) {
      return reply(c, { ok: false, status: "error", message: String(err && err.message || err) });
    }
  },

  async scheduled(event, env, ctx) {
    const c = newCtx(env, ctx);
    ctx.waitUntil(S.ticks(c, "cron").catch(() => {}));
  },
};
