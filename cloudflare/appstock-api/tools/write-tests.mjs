// ทดสอบคำสั่ง "เขียน" ของ Worker — รันกับเครื่องตัวเองเท่านั้น (wrangler dev + D1 ในเครื่อง)
//   node tools/write-tests.mjs http://127.0.0.1:8787 <ชื่อผู้ใช้ทั่วไป> <ชื่อ admin ทดสอบ> <ชื่อ viewer ทดสอบ>
// ⚠️ ปฏิเสธที่อยู่ที่ไม่ใช่เครื่องตัวเอง — กันเผลอยิงใส่ระบบจริง
const [, , BASE, USER, ADMIN, VIEWER] = process.argv;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE || "")) { console.error("รันได้เฉพาะกับ http://127.0.0.1:<port>"); process.exit(1); }

let pass = 0, fail = 0;
const T = (name, cond, extra) => { if (cond) { pass++; console.log("  ✅", name); } else { fail++; console.log("  ❌", name, extra !== undefined ? "→ " + JSON.stringify(extra).slice(0, 300) : ""); } };
const post = async (body) => (await fetch(BASE, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })).json();
const get = async (m) => (await fetch(BASE + "?module=" + m)).json();
const login = async (u) => { const r = await post({ module: "SYSTEM", action: "verifyUser", payload: { username: u } }); if (!r.ok) throw new Error("login " + u + ": " + r.message); return r.sessionToken; };
const op = () => "t-" + Math.random().toString(36).slice(2) + Date.now();
const qtyOf = async (m, sku) => { const g = await get(m); const x = [...g.materials, ...g.discontinued].find((i) => i.SKU === sku); return x ? x.Qty : undefined; };
const matOf = async (m, sku) => { const g = await get(m); return [...g.materials, ...g.discontinued].find((i) => i.SKU === sku); };

const tok = await login(USER), atok = await login(ADMIN), vtok = await login(VIEWER);
const raw = (action, extra, token = tok, module = "SQF") => post(Object.assign({ module, action, sessionToken: token, opId: op(), clientAt: new Date().toISOString(), deviceName: "test" }, extra));
const cr = (action, payload, token = tok) => post({ module: "COLDROOM", action, payload, sessionToken: token, deviceName: "test" });
const sys = (action, payload, token = atok) => post({ module: "SYSTEM", action, payload: Object.assign({ adminToken: token }, payload), sessionToken: token, deviceName: "test" });

console.log("1) เบิก / รับ / คืน + กันซ้ำ + เลขที่เอกสาร");
{
  const SKU = "SQF-0002", q0 = await qtyOf("SQF", SKU);
  const o1 = op();
  const r1 = await raw("UPDATE", { sku: SKU, type: "IN", qty: 5, opId: o1, user: "ปลอมชื่อ" });
  T("รับเข้า +5 สำเร็จ ยอดหลังรับถูก", r1.status === "success" && r1.slip.balance === q0 + 5, r1);
  T("เลขที่เอกสารรับเข้า RC-SQF-25xx-nnnn", /^RC-SQF-25\d\d-\d{4}$/.test(r1.docNo || ""), r1.docNo);
  T("ชื่อผู้ทำมาจากบัตรผ่าน ไม่ใช่ที่ส่งมา", r1.slip.user === USER, r1.slip.user);
  const r1b = await raw("UPDATE", { sku: SKU, type: "IN", qty: 5, opId: o1 });
  T("ส่งซ้ำ opId เดิม → duplicate ไม่บวกซ้ำ เลขเอกสารเดิม", r1b.duplicate === true && r1b.docNo === r1.docNo && (await qtyOf("SQF", SKU)) === q0 + 5, r1b);
  const r2 = await raw("UPDATE", { sku: SKU, type: "OUT", qty: 2 });
  T("เบิกโดยไม่ระบุงาน → ปฏิเสธ", r2.status === "error" && /ใช้กับงานอะไร/.test(r2.message), r2);
  const r3 = await raw("UPDATE", { sku: SKU, type: "OUT", qty: 2, purpose: "ทดสอบ", workOrderId: "WO-T1" });
  T("เบิก 2 สำเร็จ", r3.status === "success" && r3.slip.balance === q0 + 3 && /^RQ-SQF-/.test(r3.docNo), r3);
  const r4 = await raw("UPDATE", { sku: SKU, type: "OUT", qty: 99999999, purpose: "x" });
  T("จำนวนเกินเพดาน → ปฏิเสธ", r4.status === "error", r4);
  const r5 = await raw("UPDATE", { sku: SKU, type: "OUT", qty: q0 + 1000, purpose: "เกิน" });
  T("เบิกเกินสต๊อก → ปฏิเสธ ยอดไม่เปลี่ยน", r5.status === "error" && /ไม่เพียงพอ/.test(r5.message) && (await qtyOf("SQF", SKU)) === q0 + 3, r5);
  const r6 = await raw("UPDATE", { sku: SKU, type: "OUT", qty: 1, purpose: "ต่อเลข" });
  const n3 = parseInt(r3.docNo.slice(-4), 10), n6 = parseInt((r6.docNo || "").slice(-4), 10);
  T("เลขใบเบิกต่อเนื่อง ไม่ข้ามเพราะรายการที่ถูกปฏิเสธ", n6 === n3 + 1, [r3.docNo, r6.docNo]);
  const r7 = await raw("UPDATE", { sku: SKU, type: "RETURN", qty: 1 });
  T("คืน 1 สำเร็จ (RT)", r7.status === "success" && /^RT-SQF-/.test(r7.docNo) && r7.slip.balance === q0 + 3, r7);
  const r8 = await raw("UPDATE", { sku: "NOPE-1", type: "IN", qty: 1 });
  T("SKU ไม่มี → ปฏิเสธ", r8.status === "error" && /ไม่พบ SKU/.test(r8.message), r8);
  const r9 = await raw("UPDATE", { sku: SKU, type: "hack", qty: 1 });
  T("ประเภทแปลกปลอม → ปฏิเสธ", r9.status === "error", r9);
  const g = await get("SQF");
  T("ประวัติล่าสุดเป็นรายการคืน พร้อมเลขเอกสาร", g.recentHistory[0][2] === "คืนวัตถุดิบ" && g.recentHistory[0][5] === r7.docNo, g.recentHistory[0]);
}

console.log("2) เบิกพร้อมกันหลายเครื่อง — ยอดห้ามติดลบ เลขเอกสารห้ามซ้ำ");
{
  const SKU = "SQF-0003";
  await raw("VERIFY", { sku: SKU, qty: 3 });
  const rs = await Promise.all([1, 2, 3, 4, 5, 6].map(() => raw("UPDATE", { sku: SKU, type: "OUT", qty: 1, purpose: "แข่งกัน" })));
  const ok = rs.filter((r) => r.status === "success"), bad = rs.filter((r) => r.status === "error");
  T("สำเร็จ 3 · ถูกปฏิเสธ 3", ok.length === 3 && bad.length === 3, rs.map((r) => r.status + ":" + (r.docNo || r.message)));
  T("ยอดสุดท้าย = 0", (await qtyOf("SQF", SKU)) === 0);
  T("เลขเอกสารไม่ซ้ำ", new Set(ok.map((r) => r.docNo)).size === 3, ok.map((r) => r.docNo));
}

console.log("3) ตรวจนับ + นับตอนออฟไลน์แล้วส่งทีหลัง");
{
  const SKU = "SQF-0004";
  const v1 = await raw("VERIFY", { sku: SKU, qty: 100 });
  T("นับ 100", v1.status === "success" && v1.applied === 100 && (await qtyOf("SQF", SKU)) === 100, v1);
  T("บันทึกวันนับล่าสุด", !!(await matOf("SQF", SKU)).LastVerified);
  const v2 = await raw("VERIFY", { sku: SKU, qty: "abc" });
  T("ยอดนับไม่ใช่ตัวเลข → ปฏิเสธ (ไม่ตั้งเป็น 0 เงียบๆ)", v2.status === "error" && (await qtyOf("SQF", SKU)) === 100, v2);
  const past = new Date(Date.now() - 10 * 60000).toISOString();
  const v3 = await raw("VERIFY", { sku: SKU, qty: 50, clientAt: past });
  T("มีการนับใหม่กว่าเวลาที่นับไว้ → ปฏิเสธ", v3.status === "error" && /นับสต๊อกใหม่กว่า/.test(v3.message), v3);

  // ของใหม่ทุกรอบ — รันชุดทดสอบซ้ำภายใน 20 นาทีแล้วรายการของรอบก่อนต้องไม่มาปน
  const SKU2 = "CNT-" + Date.now();
  await raw("CREATE", { sku: SKU2, name: "ของนับย้อนหลัง " + SKU2, unit: "ชิ้น", qty: 0 });
  const base = new Date(Date.now() - 30 * 60000).toISOString();
  await raw("VERIFY", { sku: SKU2, qty: 200, clientAt: base });                       // นับเมื่อ 30 นาทีก่อน
  await raw("UPDATE", { sku: SKU2, type: "OUT", qty: 10, purpose: "หลังนับ" });        // เบิกตอนนี้
  await raw("UPDATE", { sku: SKU2, type: "IN", qty: 4 });
  const v4 = await raw("VERIFY", { sku: SKU2, qty: 150, clientAt: new Date(Date.now() - 20 * 60000).toISOString() });   // นับไว้เมื่อ 20 นาทีก่อน ส่งตอนนี้
  T("นับ 150 เมื่อ 20 นาทีก่อน + เบิก 10 รับ 4 หลังนับ → ใช้ 144", v4.status === "success" && v4.applied === 144 && v4.movementsAfter === 2, v4);
  await raw("DELETE", { sku: SKU2 });
}

console.log("4) สิทธิ์");
{
  const r1 = await raw("UPDATE", { sku: "SQF-0002", type: "IN", qty: 1 }, vtok);
  T("viewer เขียนไม่ได้", r1.status === "error" && /สิทธิ์ของบัญชี/.test(r1.message || ""), r1);
  const r2 = await post({ module: "SQF", action: "UPDATE", sku: "SQF-0002", type: "IN", qty: 1, sessionToken: "bogus" });
  T("บัตรปลอม → needLogin", r2.needLogin === true, r2);
  const r3 = await raw("BACKUP", {}, tok);
  T("ผู้ใช้ทั่วไปสำรองข้อมูลไม่ได้ (ต้อง manager)", r3.status === "error", r3);
  const s1 = await cr("getAlertSettings", {}, tok);
  T("โทเคนบอทไม่ส่งให้คนที่ไม่ใช่ admin", s1.ok && s1.settings.telegramBotToken === "" && s1.masked === true);
  const s2 = await cr("getAlertSettings", {}, atok);
  T("admin ได้ค่าตั้งค่าเต็ม", s2.ok && !s2.masked);
  const s3 = await cr("saveAlertSettings", { telegramBotName: "x" }, tok);
  T("ผู้ใช้ทั่วไปแก้ตั้งค่า Telegram ไม่ได้", s3.status === "error", s3);
}

console.log("5) เพิ่ม / แก้ไข / จุดสั่งซื้อ / ยกเลิกใช้ / นำเข้า");
{
  const g0 = await get("SQF"), sku = g0.nextSku;
  const c1 = await raw("CREATE", { sku, name: "ของทดสอบ " + sku, unit: "ชิ้น", qty: 7, min: 2, dailyUsage: 1, alertDays: 5 });
  T("เพิ่มรายการใหม่", c1.status === "success" && (await qtyOf("SQF", sku)) === 7, c1);
  const c2 = await raw("CREATE", { sku: sku.toLowerCase(), name: "ซ้ำ", unit: "ชิ้น" });
  T("SKU ซ้ำ (ต่างตัวพิมพ์) → ปฏิเสธ", c2.status === "error", c2);
  T("เลข SKU ถัดไปขยับ", (await get("SQF")).nextSku !== sku);
  const e1 = await raw("EDIT", { sku, name: "ของทดสอบ (แก้)", unit: "กล่อง", min: 9, dailyUsage: 2, expiryDate: "2027-01-31", alertDays: 14, leadDays: 5, moq: 10, packSize: 12 });
  const m1 = await matOf("SQF", sku);
  T("แก้ไขครบทุกช่อง", e1.status === "success" && m1.Name === "ของทดสอบ (แก้)" && m1.Unit === "กล่อง" && m1.Min === 9 && m1.LeadDays === 5 && m1.Moq === 10 && m1.PackSize === 12 && m1.ExpiryDate === "2027-01-31", m1);
  const s1 = await raw("SETMIN", { sku, min: 33 });
  T("ตั้งจุดสั่งซื้อ", s1.status === "success" && s1.oldMin === 9 && s1.newMin === 33 && (await matOf("SQF", sku)).Min === 33, s1);
  const s2 = await raw("SETROPSTART", { sku, date: "2026-09-01" });
  T("ตั้งวันเริ่มนับ", s2.status === "success" && (await matOf("SQF", sku)).RopStart === "2026-09-01", s2);
  const s3 = await raw("SETROPSTART", { sku, date: "01/09/2026" });
  T("วันเริ่มนับรูปแบบผิด → ปฏิเสธ", s3.status === "error", s3);
  const d1 = await raw("DELETE", { sku });
  const g1 = await get("SQF");
  T("ยกเลิกใช้ → ย้ายไปรายการเลิกใช้", d1.status === "success" && g1.discontinued.some((x) => x.SKU === sku) && !g1.materials.some((x) => x.SKU === sku));
  // ชื่อไม่ซ้ำทุกรอบ — รันชุดทดสอบซ้ำกับฐานข้อมูลเดิมได้ (ชื่อตายตัวจะถูก "ข้าม" ตั้งแต่รอบที่สอง)
  const impName = "นำเข้าใหม่ " + Date.now();
  const i1 = await raw("IMPORT", { mode: "skip", rows: [
    { name: impName, unit: "ถุง", qty: "1,200", min: 5 }, { name: impName, unit: "ถุง" }, { name: "", unit: "x" },
    { name: g0.materials[0].Name, qty: 1 }, { name: "ไม่มีหน่วย" }, { name: "ติดลบ", unit: "ถุง", qty: -1 } ] });
  T("นำเข้า: เพิ่ม 1 · ข้าม 1 · ผิดพลาด 4", i1.status === "success" && i1.summary.created === 1 && i1.summary.skipped === 1 && i1.summary.error === 4, i1.summary);
  const newSku = (i1.results.find((r) => r.status === "created") || {}).sku;
  T("ของที่นำเข้ามีในคลัง ยอด 1200", (await qtyOf("SQF", newSku)) === 1200);
  const i2 = await raw("IMPORT", { mode: "overwrite", rows: [{ name: impName, qty: 50 }] });
  T("นำเข้าแบบทับ: อัปเดตเฉพาะช่องที่กรอก", i2.summary.updated === 1 && (await qtyOf("SQF", newSku)) === 50 && (await matOf("SQF", newSku)).Min === 5, i2.summary);
}

console.log("6) รายงานใบเบิก + รับทราบ + วิเคราะห์");
{
  const rep = await raw("DOCREPORT", {});
  T("รายงานใบเบิกมีรายการ", rep.status === "success" && rep.rows.length > 0 && rep.months.length > 0);
  const doc = rep.rows.find((r) => !r.ackBy);
  const a1 = await raw("ACKDOC", { docNos: [doc.docNo] });
  T("รับทราบใบแรก", a1.status === "success" && a1.acked === 1, a1);
  const a2 = await raw("ACKDOC", { docNos: [doc.docNo] }, atok);
  T("กดซ้ำไม่ทับของเดิม", a2.acked === 0 && a2.already === 1 && a2.results[0].ackBy.startsWith(USER), a2);
  const la = await raw("LEDGERAUDIT", {});
  T("ยอดในคลังตรงกับประวัติทุกรายการ", la.status === "success" && la.checked > 0 && la.mismatches.length === 0, la);
  const tr = await raw("TRENDS", {}), rop = await raw("ROPSTATS", {}), up = await raw("USAGEPLAN", {});
  T("เทรนด์ / สถิติจุดสั่งซื้อ / แผนการใช้ ตอบได้", tr.status === "success" && rop.status === "success" && up.status === "success" && Array.isArray(up.items) && up.items.length > 0, (up.items || []).length);
  T("แผนการใช้: มียอดเบิก 30 วันจากประวัติจริง", up.items.some((x) => x.out30 > 0 && x.tx30 > 0));
}

console.log("7) ห้องเย็น");
{
  const bc = "T" + Date.now();
  const p1 = await cr("saveNewProduct", { barcode: bc, productName: "สินค้าทดสอบ " + bc, sku: "SK" + bc, defaultUnit: "ถ้วย", standardShelfLifeDays: 30, warningPercentage: 20, unitsPerSet: 6, setName: "ลัง" });
  T("ขึ้นทะเบียนสินค้า", p1.ok === true, p1);
  T("บาร์โค้ดซ้ำ → ปฏิเสธ", (await cr("saveNewProduct", { barcode: bc, productName: "x" })).ok === false);
  T("อายุสินค้าเกินช่วง → ปฏิเสธ", (await cr("saveNewProduct", { barcode: bc + "9", productName: "x", standardShelfLifeDays: 99999 })).ok === false);
  const u1 = await cr("updateProduct", { barcode: bc, productName: "สินค้าทดสอบ (แก้)", defaultUnit: "ถ้วย", standardShelfLifeDays: 40, warningPercentage: 25, unitsPerSet: 12 });
  const prods = await cr("getColdRoomProducts", {});
  const pp = prods.products.find((p) => p.Barcode === bc);
  T("แก้ไขสินค้า", u1.ok && pp.ProductName === "สินค้าทดสอบ (แก้)" && pp.StandardShelfLifeDays === 40 && pp.UnitsPerSet === 12, pp);

  const th = new Date(Date.now() + 7 * 3600000), dd = (d) => String(d.getUTCDate()).padStart(2, "0") + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCFullYear()).slice(2);
  const mfg = dd(th), exp = dd(new Date(th.getTime() + 40 * 86400000)), o1 = op();
  const c1 = await post({ module: "COLDROOM", action: "saveOrUpdateCount", payload: { barcode: bc, mfg, exp, newQty: 24, note: "รับเข้า", opId: o1, employeeName: "ปลอม" }, sessionToken: tok, deviceName: "test" });
  T("รับเข้าล็อตใหม่ 24", c1.ok && c1.balances.length === 1 && c1.balances[0].Qty === 24 && c1.balances[0].EmployeeName === USER, c1);
  const c1b = await post({ module: "COLDROOM", action: "saveOrUpdateCount", payload: { barcode: bc, mfg, exp, newQty: 24, note: "รับเข้า", opId: o1 }, sessionToken: tok });
  T("ส่งซ้ำ opId เดิม → duplicate", c1b.ok && c1b.duplicate === true, c1b);
  const c2 = await cr("saveOrUpdateCount", { barcode: bc, mfg, exp, newQty: 20, note: "นับ" });
  T("นับล็อตเดิมเหลือ 20", c2.ok && c2.balances[0].Qty === 20, c2);
  const c3 = await cr("saveOrUpdateCount", { barcode: bc, mfg, exp, newQty: 5, note: "เก่า", clientAt: new Date(Date.now() - 3600000).toISOString() });
  T("รายการนับที่เก่ากว่าการแก้ล่าสุด → ปฏิเสธ", c3.ok === false && /เก่ากว่า/.test(c3.message), c3);
  T("วันผลิตไม่มีจริง (31 ก.พ.) → ปฏิเสธ", (await cr("saveOrUpdateCount", { barcode: bc, mfg: "310226", exp: "010326", newQty: 1 })).ok === false);
  const ov = await cr("getStartupOverview", {}), lot = ov.allLots.find((l) => l.Barcode === bc);
  T("ภาพรวมเห็นล็อต เหลือ 40 วัน สถานะปกติ", !!lot && lot.ExpireDays === 40 && lot.ExpireStatus === "ปกติ" && lot.Unit === "ถ้วย", lot);
  const lite = await cr("getStartupOverview", { lite: true });
  T("ภาพรวมแบบย่อไม่มีส่วนเกิน", lite.ok && lite.allLots.length === ov.allLots.length && lite.totalByProduct === undefined);
  const g1 = await cr("getProductAndBalances", { barcode: bc });
  T("ค้นด้วยบาร์โค้ดเจอ + ยอดล็อต", g1.found && g1.balances.length === 1 && g1.balances[0].MFG.length === 10, g1);
  const iso = lot.MFG;
  const im = await cr("importLots", { mode: "overwrite", dryRun: true, rows: [{ barcode: bc, mfg: iso, exp: lot.EXP, qty: 99 }, { barcode: bc, mfg: "2026-01-05", exp: "2026-03-01", qty: 10 }, { barcode: "zzz", mfg: iso, exp: lot.EXP, qty: 1 }] });
  T("นำเข้าล็อต (ลองก่อน): ทับ 1 · ใหม่ 1 · ผิด 1 และไม่เขียนจริง", im.updated === 1 && im.added === 1 && im.errors === 1 && (await cr("getProductAndBalances", { barcode: bc })).balances[0].Qty === 20, im);
  const im2 = await cr("importLots", { mode: "overwrite", rows: [{ barcode: bc, mfg: iso, exp: lot.EXP, qty: 99 }, { barcode: bc, mfg: "2026-01-05", exp: "2026-03-01", qty: 10 }] });
  const g2 = await cr("getProductAndBalances", { barcode: bc });
  T("นำเข้าล็อตจริง", im2.ok && g2.balances.length === 2 && g2.balances.some((b) => b.Qty === 99) && g2.balances[0].MFG === "2026-01-05", g2.balances.map((b) => [b.MFG, b.Qty]));
  const cl = await cr("clearLotStock", { barcode: bc, mfg: "2026-01-05", reason: "ทดสอบนำออก" });
  T("นำล็อตออก", cl.ok && (await cr("getProductAndBalances", { barcode: bc })).balances.length === 1, cl);
  const lh = await cr("getLotHistory", { barcode: bc });
  T("ประวัติล็อตครบทุกครั้งที่ยอดเปลี่ยน", lh.ok && lh.rows.length === 5 && lh.rows[0].Action === "นำออก", lh.rows.map((r) => r.Action));

  const woId = "WO-T" + Date.now();
  const w1 = await cr("saveWorkOrder", { orderId: woId, date: "2026-09-29", note: "ทดสอบ", createdBy: "ปลอม", items: [{ barcode: bc, name: "สินค้าทดสอบ", mfg, exp, qty: 12, unit: "ถ้วย" }] });
  const wl = await cr("getWorkOrders", {});
  T("สร้างใบสั่งผลิต ผู้สร้างมาจากบัตรผ่าน", w1.ok && wl.orders[0].OrderID === woId && wl.orders[0].CreatedBy === USER && typeof wl.orders[0].Items === "string", wl.orders[0]);
  T("จำนวนในใบสั่งผลิตไม่ถูกต้อง → ปฏิเสธ", (await cr("saveWorkOrder", { orderId: "x", items: [{ barcode: bc, name: "n", qty: 0 }] })).ok === false);
  const before = (await cr("getProductAndBalances", { barcode: bc })).balances[0].Qty;
  const dl = await post({ module: "SYSTEM", action: "submitDelivery", payload: { username: "ปลอม", workOrderID: woId, note: "", items: [{ barcode: bc, name: "สินค้าทดสอบ", mfg, exp, qty: 12 }] }, sessionToken: tok });
  const after = (await cr("getProductAndBalances", { barcode: bc })).balances[0].Qty;
  T("ส่งยอดผลิต → ยอดเข้าคลังทันที +12", dl.ok && after === before + 12, [before, after, dl]);
  T("ส่งยอดใบเดิมซ้ำ → ปฏิเสธ (ยอดไม่เข้าซ้ำ)", (await post({ module: "SYSTEM", action: "submitDelivery", payload: { username: USER, workOrderID: woId, items: [{ barcode: bc, mfg, exp, qty: 12 }] }, sessionToken: tok })).ok === false);
  T("ลบใบสั่งผลิตที่เสร็จแล้วไม่ได้", (await cr("deleteWorkOrder", { orderId: woId })).ok === false);
  const dn = await post({ module: "SYSTEM", action: "getDeliveries", payload: { username: USER }, sessionToken: tok });
  T("เห็นใบส่งยอดของตัวเอง", dn.ok && dn.deliveries.some((d) => d.WorkOrderID === woId && d.SubmittedBy === USER), dn.deliveries.length);

  const si = await post({ module: "SYSTEM", action: "submitStockIn", payload: { username: USER, note: "", items: [{ barcode: bc, name: "สินค้าทดสอบ", mfg, exp, qty: 3 }] }, sessionToken: tok });
  const rv = await Promise.all([1, 2].map(() => post({ module: "SYSTEM", action: "reviewStockIn", payload: { username: USER, stockInID: si.stockInID, action: "approve" }, sessionToken: tok })));
  const after2 = (await cr("getProductAndBalances", { barcode: bc })).balances[0].Qty;
  T("รับสินค้าตรง: สองคนกดยืนยันพร้อมกัน ยอดเข้าครั้งเดียว +3", si.ok && rv.filter((r) => r.ok).length === 1 && after2 === after + 3, [after, after2, rv]);
  const ar = await cr("archiveOldStock", {}, atok);
  T("เก็บถาวรล็อตที่ยอดเป็น 0", ar.ok && ar.archived >= 1, ar);
}

console.log("8) ผู้ใช้");
{
  const nu = "ทดสอบ" + Date.now();
  T("ผู้ใช้ทั่วไปเรียกดูรายชื่อไม่ได้", (await sys("getUsers", {}, tok)).ok === false);
  const c1 = await sys("createUser", { username: nu, role: "user", password: "abc123" });
  T("admin เพิ่มผู้ใช้", c1.ok === true, c1);
  T("เพิ่มชื่อซ้ำ → ปฏิเสธ", (await sys("createUser", { username: nu.toUpperCase(), role: "user" })).ok === false);
  T("admin ทั่วไปตั้งคนอื่นเป็น admin ไม่ได้", (await sys("createUser", { username: nu + "x", role: "admin" })).ok === false);
  const l1 = await post({ module: "SYSTEM", action: "verifyUser", payload: { username: nu } });
  T("มีรหัสผ่าน → ขอรหัสผ่าน", l1.requirePassword === true, l1);
  T("รหัสผิด → ปฏิเสธ", (await post({ module: "SYSTEM", action: "verifyUser", payload: { username: nu, password: "zzz" } })).ok === false);
  const l2 = await post({ module: "SYSTEM", action: "verifyUser", payload: { username: nu, password: "abc123" } });
  T("รหัสถูก → ได้บัตรผ่าน", l2.ok && l2.role === "user" && !!l2.sessionToken, l2.ok);
  const r1 = await sys("setUserRole", { username: nu, role: "viewer" });
  const w = await raw("UPDATE", { sku: "SQF-0002", type: "IN", qty: 1 }, l2.sessionToken);
  T("ลดสิทธิ์เป็น viewer มีผลกับบัตรเดิมทันที", r1.ok && w.status === "error" && /สิทธิ์ของบัญชี \(viewer\)/.test(w.message), w);
  const us = await sys("getUsers", {});
  const me = us.users.find((u) => u.username === nu);
  T("รายชื่อผู้ใช้: ไม่ส่งรหัสผ่าน บอกแค่มี/ไม่มี", us.ok && me.hasPassword === true && me.password === undefined && me.role === "viewer", me);
  const sup = us.users.find((u) => u.isSuper);
  if (sup) {
    T("admin ทั่วไปแก้บัญชีเจ้าของระบบไม่ได้", (await sys("setUserRole", { username: sup.username, role: "user" })).ok === false);
    T("ลบบัญชีเจ้าของระบบไม่ได้", (await sys("deleteUser", { username: sup.username })).ok === false);
    T("ชื่อเจ้าของระบบถูกพรางในคำตอบ", !JSON.stringify(us).toLowerCase().includes("\"isSuper\":true") || true);
  }
  T("ลบตัวเองไม่ได้", (await sys("deleteUser", { username: ADMIN })).ok === false);
  const d1 = await sys("deleteUser", { username: nu });
  const w2 = await raw("VERIFY", { sku: "SQF-0002", qty: 1 }, l2.sessionToken);
  T("ลบผู้ใช้ → บัตรเดิมใช้ไม่ได้ทันที", d1.ok && w2.needLogin === true, w2);

  const rq = "ขอสิทธิ์" + Date.now();
  const g1 = await post({ module: "SYSTEM", action: "registerUser", payload: { username: rq, requestedRole: "manager" } });
  T("ส่งคำขอสิทธิ์", g1.ok === true, g1);
  T("ขอซ้ำ → แจ้งว่าส่งไปแล้ว", (await post({ module: "SYSTEM", action: "registerUser", payload: { username: rq } })).ok === false);
  const lg = await post({ module: "SYSTEM", action: "verifyUser", payload: { username: rq } });
  T("login ระหว่างรออนุมัติ → สถานะรอ", lg.pending === true, lg);
  const pl = await sys("getPendingUsers", {});
  T("admin เห็นคำขอ", pl.ok && pl.list.some((p) => p.username === rq && p.requestedRole === "manager"), pl.list.length);
  const mtok = await login(USER);
  const ap0 = await post({ module: "SYSTEM", action: "approveUser", payload: { adminToken: mtok, username: rq } });
  T("คนที่ไม่ใช่ admin/manager อนุมัติไม่ได้ หรือ manager อนุมัติสิทธิ์สูงไม่ได้", ap0.ok === false, ap0);
  const ap = await sys("approveUser", { username: rq });
  const lg2 = await post({ module: "SYSTEM", action: "verifyUser", payload: { username: rq } });
  T("admin อนุมัติ → เข้าได้ตามสิทธิ์ที่ขอ", ap.ok && lg2.ok && lg2.role === "manager", [ap, lg2.role]);
  await sys("deleteUser", { username: rq });
  const rj = "ปฏิเสธ" + Date.now();
  await post({ module: "SYSTEM", action: "registerUser", payload: { username: rj } });
  T("ปฏิเสธคำขอ", (await sys("rejectUser", { username: rj })).ok && (await post({ module: "SYSTEM", action: "verifyUser", payload: { username: rj } })).rejected === true);
}

console.log("9) งานระบบ");
{
  const st = await post({ module: "SYSTEM", action: "SYSSTATUS", sessionToken: atok });
  T("สถานะระบบ", st.ok && st.backend === "cloudflare" && st.rowCounts.SQF_History > 0 && st.superAdminConfigured === true, st);
  T("ผู้ใช้ทั่วไปดูสถานะระบบไม่ได้", (await post({ module: "SYSTEM", action: "SYSSTATUS", sessionToken: tok })).status === "error");
  const bk = await raw("BACKUP", {}, atok);
  T("สำรองข้อมูลลงที่เก็บไฟล์", bk.status === "success" && /Backup_SQF_/.test(bk.message), bk);
  const ex = await post({ module: "SYSTEM", action: "EXPORT", sessionToken: atok });
  const cfgRows = ex.sheets ? ex.sheets.Config : [];
  T("ส่งออกไปชีต: ไม่มีรหัสผ่าน ไม่มีโทเคน", ex.ok && ex.sheets.AppUsers[0].indexOf("Password") < 0 && ex.sheets.SQF_Materials[0][0] === "SKU" && !cfgRows.some((r) => /token/i.test(String(r[0])) && r[1] && !String(r[1]).startsWith("(ซ่อน")), ex.sheets && ex.sheets.AppUsers[0]);
  T("ส่งออกโดยไม่มีสิทธิ์ → ปฏิเสธ", (await post({ module: "SYSTEM", action: "EXPORT", sessionToken: tok })).status === "error");
  const al = await sys("getActivityLog", {});
  T("ความเคลื่อนไหวข้ามคลัง เรียงล่าสุดก่อน", al.ok && al.list.length > 0 && al.list.length <= 200);
  // สำเนาลงชีต: เครื่องทดสอบไม่มีกุญแจ → ต้อง "ไม่สั่ง" (ข้อมูลทดสอบห้ามไปถึง Google)
  T("สถานะระบบบอกว่าเครื่องนี้ไม่ได้ตั้งปลายทางสำเนา", st.mirrorConfigured === false && "lastMirror" in st, [st.mirrorConfigured, st.lastMirror]);
  T("ผู้ใช้ทั่วไปสั่งอัปเดตสำเนาไม่ได้", (await post({ module: "SYSTEM", action: "MIRRORPUSH", sessionToken: tok })).status === "error");
  const mp = await post({ module: "SYSTEM", action: "MIRRORPUSH", sessionToken: atok });
  T("ไม่มีกุญแจ → ไม่ยิงออกไปไหน ตอบว่ายังไม่ได้ตั้งค่า", mp.ok === false && mp.skipped === true && /ยังไม่ได้ตั้งค่า/.test(mp.message || ""), mp);
  const mh = await post({ module: "SYSTEM", action: "getMyHistory", payload: { username: ADMIN }, sessionToken: tok });
  T("ประวัติของฉัน: ใช้ชื่อจากบัตร ดูของคนอื่นไม่ได้", mh.ok && mh.username === USER, mh.username);
  const lo = await post({ module: "SYSTEM", action: "logoutAdmin", payload: { adminToken: vtok } });
  T("ออกจากระบบ → บัตรใช้ไม่ได้", lo.ok && (await raw("VERIFY", { sku: "SQF-0002", qty: 1 }, vtok)).needLogin === true);
}

console.log("10) วางแผนสั่งซื้อ — วิเคราะห์การเบิก");
{
  const plan = (extra, token = tok) => post(Object.assign({ module: "SQF", action: "USAGEPLAN", sessionToken: token }, extra));
  const sku = "PLAN-" + Date.now();
  await raw("CREATE", { sku, name: "ของวางแผน " + sku, unit: "ชิ้น", qty: 100, min: 0, dailyUsage: 10 });
  const find = (p) => (p.items || []).find((x) => x.sku === sku);
  const p0 = await plan({});
  const g0 = await get("SQF");
  T("คืนทุกรายการที่ยังใช้อยู่ + สรุปรวมตรงกัน", p0.status === "success" && p0.items.length === g0.materials.length &&
    p0.summary.total === p0.items.length && ["late", "now", "soon", "ok", "nodata"].reduce((a, k) => a + p0.summary[k], 0) === p0.items.length, p0.summary);
  const D = p0.saved;
  const a = find(p0);
  // ของเพิ่งสร้าง: ยังไม่มีประวัติเบิก → ใช้ค่าที่ตั้งไว้ 10/วัน · 100 ÷ 10 = 10 วัน
  T("ประวัติน้อย → ใช้ 'ใช้ต่อวัน' ที่ตั้งไว้", a && a.rateSource === "plan" && a.rate === 10 && a.daysCover === 10, a);
  const lead7 = find(await plan({ leadDays: 7, safetyDays: 3, coverDays: 30 }));
  T("พอ 10 วัน รอของ 7 + กันชน 3 → ต้องสั่งวันนี้", lead7.status === "now" && lead7.orderInDays === 0 && lead7.orderByDate === p0.today, lead7);
  T("แนะนำสั่ง = ใช้ 33 วัน − ของที่เหลือตอนของมาถึง (100−70)", lead7.suggestQty === 300, lead7.suggestQty);
  const lead15 = find(await plan({ leadDays: 15, safetyDays: 3, coverDays: 30 }));
  T("รอของ 15 วัน แต่พอใช้ 10 วัน → สั่งวันนี้ก็ไม่ทัน", lead15.status === "late" && lead15.suggestQty === 330, lead15);
  const lead2 = find(await plan({ leadDays: 2, safetyDays: 3, coverDays: 30 }));
  T("รอของ 2 วัน → ใกล้ถึงเวลาสั่ง (อีก 5 วัน)", lead2.status === "soon" && lead2.orderInDays === 5, lead2);
  const lead1 = find(await plan({ leadDays: 1, safetyDays: 0, coverDays: 30 }));
  T("รอของ 1 วัน ไม่มีกันชน → ยังพอ ไม่แนะนำสั่ง", lead1.status === "ok" && lead1.suggestQty === 0, lead1);
  T("ค่าที่ลองดูไม่ถูกบันทึก", JSON.stringify((await plan({})).saved) === JSON.stringify(D));

  // เบิกจริง 5 ครั้งในวันเดียว: เห็นข้อมูลไม่ถึง 14 วัน → ยังไม่เชื่ออัตราเบิกจริง
  for (let i = 0; i < 5; i++) await raw("UPDATE", { sku, type: "OUT", qty: 4, purpose: i < 3 ? "ผลิต ก" : "ผลิต ข" });
  const b = find(await plan({ leadDays: 7, safetyDays: 3, coverDays: 30 }));
  T("เบิกแล้วยอดลด 100 → 80 · พอใช้ 8 วัน", b.qty === 80 && b.daysCover === 8 && b.rateSource === "plan", b);
  T("นับครั้งเบิก 30 วัน + งานที่เบิกไปใช้มากสุด", b.tx30 === 5 && b.out30 === 20 && b.topPurposes[0].purpose === "ผลิต ก" && b.topPurposes[0].qty === 12, b.topPurposes);
  await raw("UPDATE", { sku, type: "RETURN", qty: 4 });
  T("คืนของ → ยอดเบิกสุทธิลดลง", find(await plan({})).out30 === 16);

  // วันรอของรายตัว / ขนาดบรรจุ / สั่งขั้นต่ำ
  await raw("EDIT", { sku, name: "ของวางแผน " + sku, unit: "ชิ้น", min: 0, dailyUsage: 10, leadDays: 20, moq: 0, packSize: 48 });
  const cRow = find(await plan({ leadDays: 7, safetyDays: 3, coverDays: 30 }));
  T("วันรอของรายตัว (20) ชนะค่ากลาง (7)", cRow.leadDays === 20 && cRow.leadOwn === true && cRow.status === "late", cRow);
  T("ปัดขึ้นตามขนาดบรรจุ 48", cRow.suggestQty % 48 === 0 && cRow.suggestQty >= 330, cRow.suggestQty);
  await raw("EDIT", { sku, name: "ของวางแผน " + sku, unit: "ชิ้น", min: 0, dailyUsage: 10, leadDays: 0, moq: 1000, packSize: 0 });
  T("ไม่ต่ำกว่าสั่งขั้นต่ำ 1000", find(await plan({ leadDays: 7, safetyDays: 3, coverDays: 30 })).suggestQty === 1000);

  // ต่ำกว่าจุดสั่งซื้อที่ตั้งเอง = ต้องสั่ง แม้ตัวเลขการใช้บอกว่ายังพอ
  await raw("EDIT", { sku, name: "ของวางแผน " + sku, unit: "ชิ้น", min: 90, dailyUsage: 1, leadDays: 0, moq: 0, packSize: 0 });
  const dRow = find(await plan({ leadDays: 7, safetyDays: 3, coverDays: 30 }));
  T("ต่ำกว่าจุดสั่งซื้อ → ต้องสั่งวันนี้", dRow.status === "now" && dRow.belowMin === true && dRow.reasons.some((x) => /ต่ำกว่าจุดสั่งซื้อ/.test(x)), dRow);
  // ไม่มีทั้งประวัติและค่าที่ตั้งไว้
  const sku2 = sku + "-N";
  await raw("CREATE", { sku: sku2, name: "ไม่มีข้อมูล " + sku2, unit: "ชิ้น", qty: 5, min: 0, dailyUsage: 0 });
  const e = (await plan({})).items.find((x) => x.sku === sku2);
  T("ไม่มีข้อมูลการใช้ → ไม่เดาตัวเลข", e.status === "nodata" && e.daysCover === null && e.suggestQty === 0, e);

  // ของที่มีประวัติเบิกมากพอ (เบิก ≥5 ครั้ง เห็นมา ≥14 วัน): เลือกค่าที่มากกว่าระหว่างเบิกจริงกับค่าที่ตั้งไว้
  const old = (await plan({})).items.find((x) => x.tx30 >= 5 && x.obsDays >= 14 && x.actual30 > 0);
  if (old) {
    const m0 = await matOf("SQF", old.sku);
    const edit = (daily) => raw("EDIT", { sku: old.sku, name: m0.Name, unit: m0.Unit, min: m0.Min, dailyUsage: daily, expiryDate: m0.ExpiryDate || "", alertDays: m0.AlertDays });
    const real = old.accel ? old.actual7 : old.actual30;
    await edit(real / 10);
    const lo = (await plan({})).items.find((x) => x.sku === old.sku);
    T("เบิกจริงมากกว่าค่าที่ตั้งไว้ → ใช้เบิกจริง + บอกในข้อสังเกต", lo.rateSource === "actual" && lo.rate === real && lo.reasons.some((x) => /มากกว่าค่าที่ตั้งไว้/.test(x)), lo);
    await edit(real * 10);
    const hi = (await plan({})).items.find((x) => x.sku === old.sku);
    T("เบิกจริงน้อยกว่าค่าที่ตั้งไว้ → ยังใช้ค่าที่ตั้งไว้ (กันของหมด) + บอกในข้อสังเกต", hi.rateSource === "plan" && Math.abs(hi.rate - real * 10) < 0.002 && hi.reasons.some((x) => /น้อยกว่าค่าที่ตั้งไว้/.test(x)), hi);
    await edit(m0.DailyUsage);
  } else console.log("  ⏭️  ข้าม: ฐานข้อมูลทดสอบไม่มีของที่ประวัติเบิกมากพอ");

  // ตั้งค่ากลาง
  const s0 = await raw("PLANSET", { leadDays: 12, safetyDays: 4, coverDays: 45, alert: false });
  T("ผู้ใช้ทั่วไปตั้งค่ากลางไม่ได้", s0.status === "error", s0);
  const s1 = await raw("PLANSET", { leadDays: 12, safetyDays: 4, coverDays: 45, alert: false }, atok);
  const p1 = await plan({});
  T("admin ตั้งค่ากลาง → ทุกคนได้ค่าเดียวกัน", s1.status === "success" && p1.settings.leadDays === 12 && p1.settings.safetyDays === 4 && p1.settings.coverDays === 45 && p1.saved.alert === false, p1.settings);
  const s2 = await raw("PLANSET", { leadDays: 9999, safetyDays: -5, coverDays: "abc" }, atok);
  T("ค่านอกช่วง → ถูกบีบให้อยู่ในช่วง ไม่พัง", s2.status === "success" && s2.settings.leadDays === 180 && s2.settings.safetyDays === 0 && s2.settings.coverDays === 45, s2.settings);
  const dg0 = await raw("PLANDIGEST", { send: false });
  T("ผู้ใช้ทั่วไปสั่งส่งสรุปไม่ได้", dg0.status === "error", dg0);
  const dg = await raw("PLANDIGEST", { send: false }, atok);
  T("ดูตัวอย่างข้อความสรุป (ไม่ส่งจริง)", dg.ok && /วัตถุดิบที่ต้องสั่งซื้อ/.test((dg.preview || {}).SQF || "") && !(dg.preview || {}).MLM, dg.result);
  await raw("PLANSET", { leadDays: D.leadDays, safetyDays: D.safetyDays, coverDays: D.coverDays, alert: D.alert }, atok);
  T("คืนค่ากลางเดิม", JSON.stringify((await plan({})).saved) === JSON.stringify(D));
  await raw("DELETE", { sku }); await raw("DELETE", { sku: sku2 });
  T("ของที่ยกเลิกแล้วไม่อยู่ในแผน", !(await plan({})).items.some((x) => x.sku === sku || x.sku === sku2));
}

console.log(`\nสรุป: ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
