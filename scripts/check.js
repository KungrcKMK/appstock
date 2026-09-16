// ═══════════════════════════════════════════════════════════
// scripts/check.js — ตรวจก่อนเผยแพร่ (ข้อ 14 รายงานปรับปรุง)
//   รัน: npm test  (GitHub Actions รันให้ก่อน deploy ทุกครั้ง)
//   ไม่พึ่ง dependency ใดๆ — ใช้ได้ทั้งเครื่องเราและ CI โดยไม่ต้อง npm install
//
//   ตรวจ 5 อย่างที่เคยทำระบบพังหรือยอดผิดมาแล้ว:
//   1. ไวยากรณ์ JS ทุกไฟล์ (รวมสคริปต์ที่ฝังใน mobile.html และ gas_code.js)
//   2. ไฟล์ทุกตัวใน sw.js STATIC_ASSETS มีจริง — cache.addAll เป็น all-or-nothing ไฟล์เดียวหาย = ติดตั้งไม่ได้
//   3. GAS_URL ใน js/app.js กับ mobile.html ต้องตรงกัน
//   4. ตรรกะคิวออฟไลน์ (js/offline.js) 7 เคส — จำลอง localStorage/fetch ไม่แตะระบบจริง
//   5. ไฟล์ CSS ที่ build แล้วต้องมีอยู่และไม่ว่าง
// ═══════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const root = path.resolve(__dirname, "..");
let fails = 0, passes = 0;
const ok  = m => { passes++; console.log("  ✅", m); };
const bad = m => { fails++;  console.log("  ❌", m); };

// ── 1. ไวยากรณ์ ──
console.log("1) ไวยากรณ์ JS");
function checkSyntax(file, code) {
  const tmp = path.join(require("os").tmpdir(), "appstock_chk_" + path.basename(file).replace(/[^\w.]/g, "_") + ".js");
  fs.writeFileSync(tmp, code, "utf8");
  try { execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" }); ok(file); }
  catch (e) { bad(file + "\n" + String(e.stderr || e.message).split("\n").slice(0, 4).join("\n")); }
  finally { try { fs.unlinkSync(tmp); } catch (e) {} }
}
const jsFiles = ["sw.js", "gas_code.js", "generate-icons.js", ...fs.readdirSync(path.join(root, "js")).filter(f => f.endsWith(".js")).map(f => "js/" + f)];
for (const f of jsFiles) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  checkSyntax(f, fs.readFileSync(p, "utf8"));
}
// สคริปต์ที่ฝังใน mobile.html
{
  const html = fs.readFileSync(path.join(root, "mobile.html"), "utf8");
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const big = blocks.sort((a, b) => b.length - a.length)[0] || "";
  checkSyntax("mobile.html (inline script)", big.replace(/<\\\/script>/g, "</script>"));
}

// ── 2. STATIC_ASSETS ──
console.log("2) ไฟล์ใน sw.js STATIC_ASSETS");
{
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const m = sw.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
  const list = m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : [];
  if (!list.length) bad("อ่าน STATIC_ASSETS ไม่ได้");
  let missing = 0;
  for (const a of list) {
    if (a === "./") continue;
    if (!fs.existsSync(path.join(root, a))) { bad("ไม่มีไฟล์ " + a); missing++; }
  }
  if (!missing && list.length) ok(list.length + " ไฟล์มีครบ");
}

// ── 3. GAS_URL ตรงกัน ──
console.log("3) GAS_URL ตรงกันทั้งสองหน้าจอ");
{
  const a = (fs.readFileSync(path.join(root, "js/app.js"), "utf8").match(/const GAS_URL = "([^"]+)"/) || [])[1];
  const b = (fs.readFileSync(path.join(root, "mobile.html"), "utf8").match(/const GAS_URL = "([^"]+)"/) || [])[1];
  if (a && b && a === b) ok("ตรงกัน"); else bad("ไม่ตรงกัน / หาไม่เจอ\n     app.js: " + a + "\n     mobile: " + b);
}

// ── 4. ตรรกะคิวออฟไลน์ ──
console.log("4) ตรรกะคิวออฟไลน์ (js/offline.js)");
(async () => {
  const store = {};
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  global.window = { addEventListener() {} };
  global.document = { addEventListener() {}, hidden: false };
  const src = fs.readFileSync(path.join(root, "js/offline.js"), "utf8");
  const fn = new Function("localStorage", "window", "document", "fetch_", src + "\nreturn { offlineConfig, offlineSend, offlineSync, offlineCount, offlineQueue, offlineFailures, offlineClearFailures, offlineResend, offlineSummary };");
  const O = fn(global.localStorage, global.window, global.document, null);
  const toasts = [];
  O.offlineConfig({ gasUrl: "https://x", deviceName: () => "t", token: () => "tok", onToast: (m, k) => toasts.push(k + "|" + m), onChange() {}, onSynced() {}, onNeedLogin() { toasts.push("needLogin"); } });
  const T = (name, cond) => cond ? ok(name) : bad(name);

  global.fetch = async () => { throw new TypeError("net"); };
  const r1 = await O.offlineSend({ action: "UPDATE", sku: "A" }, "เบิก A");
  await O.offlineSend({ action: "UPDATE", sku: "B" }, "เบิก B");
  T("เน็ตล่มแล้วเข้าคิว (readback ยืนยัน)", r1.queued === true && O.offlineCount() === 2);

  const sent = [];
  global.fetch = async (u, o) => { sent.push(JSON.parse(o.body)); return { json: async () => ({ status: "success" }) }; };
  await O.offlineSync();
  T("ส่งตามลำดับ + แนบ opId/clientAt/sessionToken", sent.map(x => x.sku).join(",") === "A,B" && sent.every(x => x.opId && x.clientAt && x.sessionToken === "tok") && O.offlineCount() === 0);

  global.fetch = async () => { throw new TypeError("net"); };
  await O.offlineSend({ action: "UPDATE", sku: "C" }, "เบิก C");
  global.fetch = async () => ({ json: async () => ({ status: "error", message: "สต๊อกไม่เพียงพอ" }) });
  await O.offlineSync();
  T("ถูกปฏิเสธ → เก็บครบพร้อม payload ไม่วนส่ง", O.offlineCount() === 0 && O.offlineFailures().length === 1 && (O.offlineFailures()[0] || {}).body?.sku === "C");
  // ส่งซ้ำ: ตั้ง stub ให้สำเร็จ "ก่อน" กดส่งซ้ำ (offlineResend ยิงส่งทันทีในพื้นหลัง)
  global.fetch = async () => ({ json: async () => ({ status: "success" }) });
  const failedC = O.offlineFailures()[0];
  const resent = failedC ? O.offlineResend(failedC.opId) : false;
  await O.offlineSync();
  T("ส่งซ้ำงานที่เคยไม่ผ่านได้ (opId เดิม) แล้วส่งสำเร็จ", resent === true && O.offlineCount() === 0 && O.offlineFailures().length === 0);

  global.fetch = async () => ({ json: async () => ({ status: "error", retryable: true, message: "ระบบไม่ว่าง" }) });
  const rr = await O.offlineSend({ action: "UPDATE", sku: "D" }, "เบิก D");
  T("เซิร์ฟเวอร์บอก retryable → เข้าคิว ไม่ใช่ล้มเหลว", rr.queued === true && O.offlineCount() === 1 && O.offlineFailures().length === 0);
  global.fetch = async () => ({ json: async () => ({ status: "success" }) }); await O.offlineSync();

  global.fetch = async () => { throw new TypeError("net"); };
  await O.offlineSend({ action: "UPDATE", sku: "E" }, "เบิก E");
  global.fetch = async () => ({ json: async () => ({ status: "success" }) });
  const r6 = await O.offlineSend({ action: "UPDATE", sku: "F" }, "เบิก F");
  T("มีงานค้าง → งานใหม่ต่อท้าย ไม่แซง", r6.queued === true);
  await new Promise(r => setTimeout(r, 50));

  global.fetch = async () => { throw new TypeError("net"); };
  await O.offlineSend({ action: "UPDATE", sku: "G" }, "เบิก G");
  global.fetch = async () => ({ json: async () => ({ needLogin: true, status: "error" }) });
  await O.offlineSync();
  T("บัตรผ่านหมดอายุ → งานยังอยู่ในคิว + แจ้ง login", O.offlineCount() === 1 && toasts.includes("needLogin"));

  // ── 5. CSS ที่ build แล้ว ──
  console.log("5) CSS ที่ build แล้ว");
  for (const f of ["css/tw-desktop.css", "css/tw-mobile.css"]) {
    const p = path.join(root, f);
    if (fs.existsSync(p) && fs.statSync(p).size > 5000) ok(f + " (" + Math.round(fs.statSync(p).size / 1024) + " KB)");
    else bad(f + " ไม่มีหรือว่าง — รัน npm run build:css");
  }

  console.log(`\nสรุป: ผ่าน ${passes} · ไม่ผ่าน ${fails}`);
  process.exit(fails ? 1 : 0);
})();
