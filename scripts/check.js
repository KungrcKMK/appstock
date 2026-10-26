// ═══════════════════════════════════════════════════════════
// scripts/check.js — ตรวจก่อนเผยแพร่ (ข้อ 14 รายงานปรับปรุง)
//   รัน: npm test  (GitHub Actions รันให้ก่อน deploy ทุกครั้ง)
//   ไม่พึ่ง dependency ใดๆ — ใช้ได้ทั้งเครื่องเราและ CI โดยไม่ต้อง npm install
//
//   ตรวจ 5 อย่างที่เคยทำระบบพังหรือยอดผิดมาแล้ว:
//   1. ไวยากรณ์ JS ทุกไฟล์ (รวมสคริปต์ที่ฝังใน mobile.html และ gas_code.js)
//   2. ไฟล์ทุกตัวใน sw.js STATIC_ASSETS มีจริง — cache.addAll เป็น all-or-nothing ไฟล์เดียวหาย = ติดตั้งไม่ได้
//      + ฟอนต์ Sarabun ในแอปอยู่ในชุด offline ครบ และไม่มีลิงก์ฟอนต์ Google กลับมา
//   3. GAS_URL ใน js/app.js กับ mobile.html ต้องตรงกัน
//   4. ตรรกะคิวออฟไลน์ (js/offline.js) 8 เคส — จำลอง localStorage/fetch ไม่แตะระบบจริง
//      + ออกจากระบบล้างข้อมูลสต๊อกในเครื่อง แต่ห้ามลบคิวงานออฟไลน์ (หน้าคอม + มือถือ)
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
// โค้ดหลังบ้าน (Cloudflare Worker) — เป็น ES module ตรวจในโฟลเดอร์ของมันเอง (package.json ระบุ type: module)
{
  const wdir = path.join(root, "cloudflare/appstock-api/src");
  if (fs.existsSync(wdir)) for (const f of fs.readdirSync(wdir).filter(x => x.endsWith(".js"))) {
    try { execFileSync(process.execPath, ["--check", path.join(wdir, f)], { stdio: "pipe" }); ok("cloudflare/appstock-api/src/" + f); }
    catch (e) { bad("cloudflare/appstock-api/src/" + f + "\n" + String(e.stderr || e.message).split("\n").slice(0, 4).join("\n")); }
  }
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
  // ตอนติดตั้งต้องดึงไฟล์ใหม่จากเซิร์ฟเวอร์จริง — เคยเอาไฟล์รุ่นเก่าจาก cache ของเบราว์เซอร์มาใส่ชุดรุ่นใหม่ (2026-10-05)
  if (/cache\.addAll\(\s*STATIC_ASSETS\.map\([^)]*cache:\s*"reload"/.test(sw)) ok("ติดตั้งด้วย cache: \"reload\" (ไม่หยิบไฟล์เก่าจาก cache ของเบราว์เซอร์)");
  else bad("sw.js install ต้องใช้ cache.addAll(STATIC_ASSETS.map(u => new Request(u, { cache: \"reload\" })))");

  // ฟอนต์เก็บในแอป (Sarabun 2026-10-10 · Kanit หน้ามือถือ 2026-10-19) — ไฟล์ฟอนต์ทุกตัวต้องอยู่ในชุด offline และห้ามมีลิงก์ฟอนต์ Google กลับมา
  for (const css of ["sarabun.css", "kanit.css"]) {
    const fontCss = path.join(root, "fonts", css);
    const fontFiles = fs.existsSync(fontCss) ? [...fs.readFileSync(fontCss, "utf8").matchAll(/url\(([^)]+)\)/g)].map(m => "./fonts/" + m[1].replace(/['"]/g, "")) : [];
    if (fontFiles.length && fontFiles.every(f => list.includes(f) && fs.existsSync(path.join(root, f))) && list.includes("./fonts/" + css)) ok("ฟอนต์ " + css + " " + fontFiles.length + " ไฟล์อยู่ในชุด offline");
    else bad("fonts/" + css + " หรือไฟล์ฟอนต์ที่อ้างถึงไม่อยู่ใน STATIC_ASSETS");
  }
  const shipped = ["index.html", "mobile.html", "manual.html", "404.html", "sw.js", ...fs.readdirSync(path.join(root, "js")).filter(f => f.endsWith(".js")).map(f => "js/" + f)];
  const cdnFont = shipped.filter(f => fs.existsSync(path.join(root, f)) && /https?:\/\/fonts\.(googleapis|gstatic)\.com/.test(fs.readFileSync(path.join(root, f), "utf8")));
  if (!cdnFont.length) ok("ไม่มีลิงก์ฟอนต์ Google (ใช้ fonts/sarabun.css · หน้าต่างพิมพ์ใช้ fontCssUrl())");
  else bad("ยังมีลิงก์ฟอนต์ Google ใน: " + cdnFont.join(", "));

  // เจ้าของห้ามคำว่า "สูตร" ในหน้าจอ (กลัวข้อมูลการผลิตหลุด · 2026-08-01 · ย้ำ 2026-10-19) — ใช้ "ข้อมูลอ้างอิง" · คอมเมนต์ไม่นับ
  const wdir = path.join(root, "cloudflare/appstock-api/src");
  const uiFiles = [...shipped.filter((f) => f !== "sw.js"), ...(fs.existsSync(wdir) ? fs.readdirSync(wdir).filter((f) => f.endsWith(".js")).map((f) => "cloudflare/appstock-api/src/" + f) : [])];
  const sutra = [];
  for (const f of uiFiles) {
    if (!fs.existsSync(path.join(root, f))) continue;
    fs.readFileSync(path.join(root, f), "utf8").split("\n").forEach((l, i) => {
      if (l.includes("สูตร") && !/^\s*(\/\/|\*|<!--|\/\*)/.test(l) && !/(\/\/|<!--|\/\*)[^"'`]*สูตร/.test(l)) sutra.push(f + ":" + (i + 1));
    });
  }
  if (!sutra.length) ok("ไม่มีคำว่า \"สูตร\" ในข้อความที่ผู้ใช้เห็น");
  else bad("มีคำว่า \"สูตร\" ในหน้าจอ (เจ้าของห้าม — ใช้ \"ข้อมูลอ้างอิง\"): " + sutra.join(", "));

  // ธีม เขียว-ส้ม-ขาว (เจ้าของสั่ง 2026-10-20): สี hex ในหน้าจอ/หน้าต่างพิมพ์ต้องมาจากชุดนี้ — กันสีชุดเก่า (เทาอมฟ้า Tailwind / เขียวเก่า / คราม) กลับมา
  //   เพิ่มสีใหม่ได้ แต่ต้องใส่ในรายการนี้ด้วย (และ DESIGN.md) · คอมเมนต์ไม่นับ
  const THEME_HEX = new Set(["#111", "#111111", "#fff", "#ffffff", "#000", "#000000",
    "#00843d", "#006b31", "#f2951c", "#fde0bd",                                   // เขียวเซฟตี้ / เขียวตัวหนังสือ / ส้มแถบ / ส้มอ่อนโฟกัส
    "#f2f2ef", "#f7f7f4", "#ecece8", "#e6e6e1", "#d6d6d0", "#8a8a84", "#6b6b66", "#5c5c57", "#4f4f4b", "#3d3d3d", "#262624", "#0a0a0a",   // เทาหมึก
    "#c8102e", "#fbe9ec", "#a8560a", "#fdf0e2", "#8a5a00", "#fff6cc", "#005a9c", "#e5eff8", "#e3f1e8", "#ffd100",   // สถานะ + พื้นอ่อน + เหลืองในป้ายเตือน
    "#c2410c", "#15803d", "#0e7490",                                               // สีประจำโรงงาน SQF / MLM / ห้องเย็น
    "#0369a1", "#047857", "#6d28d9"]);                                             // สีงาน คืน / รับ / ใหม่ (เบิก = #c2410c · นับ = #0e7490)
  const COMMENT = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?<![:"'`\\])\/\/[^\n]*/g;
  const offTheme = [];
  for (const f of [...new Set([...shipped.filter((x) => /\.(html|js)$/.test(x) && x !== "sw.js" && !x.startsWith("js/vendor/")), "404.html", "manual.html"])]) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    const code = fs.readFileSync(p, "utf8").replace(COMMENT, "");
    const odd = [...new Set((code.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []).map((h) => h.toLowerCase()).filter((h) => !THEME_HEX.has(h)))];
    if (odd.length) offTheme.push(f + " (" + odd.join(" ") + ")");
  }
  // หน้าต่างพิมพ์ (window.open + document.write) ไม่ได้ CSS/ฟอนต์ของหน้าแม่ — ต้อง @import fontCssUrl() เอง ไม่งั้นเครื่องที่ไม่มี Sarabun พิมพ์ฟอนต์อื่น (กับดักข้อ 4)
  const noFont = [];
  for (const f of fs.readdirSync(path.join(root, "js")).filter((x) => x.endsWith(".js"))) {
    const s = fs.readFileSync(path.join(root, "js", f), "utf8"), re = /\.document\.write\(`/g;
    let m;
    while ((m = re.exec(s))) { const st = s.indexOf("<style>", m.index); if (st > 0 && st - m.index < 800 && !/fontCssUrl\(\)/.test(s.slice(m.index, st + 300))) noFont.push("js/" + f + ":" + s.slice(0, m.index).split("\n").length); }
  }
  if (!noFont.length) ok("หน้าต่างพิมพ์ทุกใบโหลดฟอนต์ของแอป (fontCssUrl)");
  else bad("หน้าต่างพิมพ์ไม่โหลดฟอนต์ — ใส่ @import url('${fontCssUrl()}') ต้น <style>: " + noFont.join(", "));
  if (!offTheme.length) ok("สีทุกหน้าจอ/หน้าต่างพิมพ์อยู่ในชุด เขียว-ส้ม-ขาว");
  else bad("มีสีนอกธีม (ใช้ token --sq-*/--m-* หรือ hex ในชุด · ดู DESIGN.md): " + offTheme.join(", "));
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

  // QA S4 (2026-10-10): บัตรผ่านหมดอายุ "ตอนกดบันทึก" (ไม่มีงานค้างมาก่อน) — เดิมคืน needLogin เฉยๆ รายการหายเงียบ
  store["appstock_queue_v1"] = "[]";
  global.fetch = async () => ({ json: async () => ({ needLogin: true, status: "error" }) });
  const rn = await O.offlineSend({ action: "UPDATE", sku: "H" }, "เบิก H");
  T("บัตรหมดอายุตอนกดบันทึก → รายการเข้าคิว ไม่หาย (queued + needLogin)", rn.queued === true && rn.needLogin === true && O.offlineCount() === 1 && O.offlineQueue()[0].body.sku === "H");

  // ── ออกจากระบบล้างข้อมูลในเครื่อง (2026-10-10) — ต้องล้างข้อมูลสต๊อก แต่ห้ามแตะคิวงานออฟไลน์ ──
  {
    const pick = (file, name) => {
      const src = fs.readFileSync(path.join(root, file), "utf8");
      const m = src.match(new RegExp("function " + name + "\\(\\)\\s*\\{[\\s\\S]*?\\n\\}"));
      return m ? m[0] : null;
    };
    for (const [file, name] of [["js/auth.js", "authClearUserCache"], ["mobile.html", "mClearUserCache"]]) {
      const code = pick(file, name);
      if (!code) { bad(file + ": หา " + name + "() ไม่เจอ"); continue; }
      const ls = {
        "appstock_queue_v1": "[1]", "appstock_queue_failed_v1": "[2]", "appstock_queue_lock": "{}",
        "appstock_device_id": "d", "rawAlertDays": "7", "appstock_rop_lead": "5", "m_staledays_SQF": "7",
        "cache_raw_SQF": "x", "cache_cr_overview": "x", "m_cache_SQF": "x", "m_freq_MLM": "x",
        "m_purposes_SQF": "x", "m_purposes_srv_SQF": "x", "appstock_last_mod": "SQF"
      };
      const ss = { appstock_alert_ack: "x", appstock_prefill_user: "x", appstock_mode_session: "mobile" };
      const mk = o => ({ get length() { return Object.keys(o).length; }, key: i => Object.keys(o)[i] ?? null, removeItem: k => { delete o[k]; } });
      new Function("localStorage", "sessionStorage", code + "\n" + name + "();")(mk(ls), mk(ss));
      const kept = ["appstock_queue_v1", "appstock_queue_failed_v1", "appstock_queue_lock", "appstock_device_id", "rawAlertDays", "appstock_rop_lead", "m_staledays_SQF"];
      const gone = ["cache_raw_SQF", "cache_cr_overview", "m_cache_SQF", "m_freq_MLM", "m_purposes_SQF", "m_purposes_srv_SQF", "appstock_last_mod"];
      T(file + ": ออกจากระบบล้างข้อมูลสต๊อก แต่คิวงานออฟไลน์ + ค่าตั้งเครื่องยังอยู่",
        kept.every(k => k in ls) && gone.every(k => !(k in ls)) && !("appstock_alert_ack" in ss) && ss.appstock_mode_session === "mobile");
    }
  }

  // ── 5. CSS ที่ build แล้ว ──
  console.log("5) CSS ที่ build แล้ว");
  for (const f of ["css/tw-desktop.css", "css/tw-mobile.css"]) {
    const p = path.join(root, f);
    if (fs.existsSync(p) && fs.statSync(p).size > 5000) ok(f + " (" + Math.round(fs.statSync(p).size / 1024) + " KB)");
    else bad(f + " ไม่มีหรือว่าง — รัน npm run build:css");
  }

  // ── 6. เครื่องมือกู้คืนจากไฟล์สำรอง (ไฟล์สำรองปลอมใน temp — ไม่มีข้อมูลจริง) ──
  console.log("6) เครื่องมือกู้คืน (cloudflare/appstock-api/tools/restore-from-backup.mjs)");
  {
    const os = require("os"), tool = path.join(root, "cloudflare/appstock-api/tools/restore-from-backup.mjs");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "appstock_restore_"));
    const run = (sheets, out) => {
      fs.writeFileSync(path.join(dir, "b.json"), JSON.stringify({ sheets }));
      try { return { code: 0, out: execFileSync(process.execPath, [tool, path.join(dir, "b.json"), out], { stdio: "pipe" }).toString() }; }
      catch (e) { return { code: e.status, out: String(e.stderr || "") }; }
    };
    const sheets = {
      SQF_Materials: [["module", "sku", "name", "qty", "lead_days", "expiry_date"], ["SQF", "A'1", "แป้ง", 5, "", ""]],
      RM_Lots: [["id", "module", "sku", "recv_date", "qty_left", "name", "unit"], [1, "SQF", "A'1", "", 5, "แป้ง", "กก."]],
    };
    const sql = path.join(dir, "r.sql"), r = run(sheets, sql), txt = r.code === 0 ? fs.readFileSync(sql, "utf8") : "";
    T("แปลงได้ · ช่องที่ว่างได้กลับเป็น NULL · ช่องข้อความว่างยังเป็น '' · escape ' ในข้อความ",
      r.code === 0 && txt.includes("VALUES ('SQF', 'A''1', 'แป้ง', 5, NULL, '')") && /"materials":1/.test(r.out));
    T("ตัดคอลัมน์ที่ไม่ใช่ของตาราง (ชื่อ/หน่วยใน RM_Lots)", /INSERT INTO rm_lots \(id, module, sku, recv_date, qty_left\) VALUES/.test(txt));
    T("ไฟล์สำรองมีแผ่นที่ไม่รู้จัก → หยุด", run({ Mystery: [["a"], [1]] }, sql).code === 1);
    T("ห้ามเขียน SQL ลงใน repo", run(sheets, path.join(root, "restore-test.sql")).code === 1 && !fs.existsSync(path.join(root, "restore-test.sql")));
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\nสรุป: ผ่าน ${passes} · ไม่ผ่าน ${fails}`);
  process.exit(fails ? 1 : 0);
})();
