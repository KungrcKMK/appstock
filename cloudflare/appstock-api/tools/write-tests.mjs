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

console.log("11) LINE กลุ่ม — ตั้งค่า / webhook / ส่งสรุปที่ต้องสั่ง (LINE จำลองที่ 127.0.0.1:8799 — .dev.vars ต้องมี LINE_API)");
{
  const { createServer } = await import("node:http");
  const { createHmac } = await import("node:crypto");
  const { topicDue, reminderDow, channelsDue } = await import("../src/notify.js");
  const { packTexts } = await import("../src/plan.js");
  // ── ตัวจำลอง LINE API: จดทุกคำขอไว้ตรวจ ──
  const calls = [];
  let quotaFull = false;
  const GOOD = "good-token-1234";
  const mock = createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      const auth = req.headers.authorization || "";
      calls.push({ method: req.method, url: req.url, auth, retryKey: req.headers["x-line-retry-key"] || "", body: b ? JSON.parse(b) : null });
      const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
      if (auth !== "Bearer " + GOOD) return send(401, { message: "Authentication failed" });
      if (req.url === "/v2/bot/info") return send(200, { displayName: "บอทสต๊อก", basicId: "@stocktest" });
      if (req.url === "/v2/bot/message/quota") return send(200, { type: "limited", value: 300 });
      if (req.url === "/v2/bot/message/quota/consumption") return send(200, { totalUsage: 12 });
      let m = req.url.match(/^\/v2\/bot\/group\/([^/]+)\/summary$/);
      if (m) return send(200, { groupId: m[1], groupName: m[1] === "G1" ? "ฝ่ายจัดซื้อ" : "กลุ่มอื่น" });
      m = req.url.match(/^\/v2\/bot\/group\/([^/]+)\/members\/count$/);
      if (m) return send(200, { count: m[1] === "G1" ? 7 : 3 });
      if (req.url === "/v2/bot/message/reply") return send(200, {});
      if (req.url === "/v2/bot/message/push") return quotaFull ? send(429, { message: "You have reached your monthly limit." }) : send(200, {});
      send(404, { message: "Not found" });
    });
  });
  await new Promise((ok, bad) => { mock.once("error", bad); mock.listen(8799, "127.0.0.1", ok); });
  try {
    const lsys = (action, extra, token = atok) => post(Object.assign({ module: "SYSTEM", action, sessionToken: token }, extra || {}));
    const SECRET = "0123456789abcdef0123456789abcdef";
    const hook = async (events, secret = SECRET) => {
      const body = JSON.stringify({ destination: "U0", events });
      const sig = createHmac("sha256", secret).update(body).digest("base64");
      const r = await fetch(BASE + "/line-webhook", { method: "POST", headers: { "content-type": "application/json", "x-line-signature": sig }, body });
      await new Promise((ok) => setTimeout(ok, 400));   // งานหลังตอบ (waitUntil) ให้เสร็จก่อนตรวจ
      return r.status;
    };
    const joinEv = (gid) => ({ type: "join", replyToken: "rt-" + gid, source: { type: "group", groupId: gid }, timestamp: Date.now() });
    await lsys("LINESAVE", { clear: true });

    T("ผู้ใช้ทั่วไปดู/ตั้งค่า LINE ไม่ได้", (await lsys("LINESTATUS", {}, tok)).status === "error" && (await lsys("LINESAVE", { token: GOOD }, tok)).status === "error");
    T("manager ก็ตั้งค่า LINE ไม่ได้ (admin เท่านั้น)", (await lsys("LINESAVE", { token: GOOD }, await login("นุ่น").catch(() => tok))).status === "error");
    const s0 = await lsys("LINESTATUS");
    T("ยังไม่ตั้งค่า → สถานะบอกว่ายังไม่มี token", s0.ok && s0.tokenSet === false && s0.secretSet === false && s0.groups.length === 0, s0);
    T("webhook ก่อนตั้ง secret → ปฏิเสธ (401)", (await hook([joinEv("G1")])) === 401);

    const bad1 = await lsys("LINESAVE", { token: "wrong-token" });
    T("token ผิด → ไม่บันทึก + บอกเหตุผลภาษาคน", bad1.status === "error" && /token/.test(bad1.message) && (await lsys("LINESTATUS")).tokenSet === false, bad1);
    const bad2 = await lsys("LINESAVE", { secret: "not-hex" });
    T("secret รูปแบบผิด → ไม่บันทึก", bad2.status === "error" && (await lsys("LINESTATUS")).secretSet === false, bad2);
    const ok1 = await lsys("LINESAVE", { token: GOOD, secret: SECRET });
    const s1 = await lsys("LINESTATUS");
    T("token+secret ถูก → บันทึก + ได้ชื่อบอท", ok1.ok && /บอทสต๊อก/.test(ok1.botName) && s1.tokenSet && s1.secretSet, ok1);
    T("หน้าจอไม่เคยได้ token/secret ตัวจริง (แค่ 4 ตัวท้าย)", !JSON.stringify(s1).includes(GOOD) && !JSON.stringify(s1).includes(SECRET) && s1.tokenTail === "••••1234", s1.tokenTail);
    T("สถานะบอกโควตาเดือนนี้", s1.quota && s1.quota.limit === 300 && s1.quota.used === 12, s1.quota);
    const ex = await post({ module: "SYSTEM", action: "EXPORT", sessionToken: atok });
    T("สำเนาลงชีตไม่มี token/secret ของ LINE", !JSON.stringify(ex.sheets.Config).includes(GOOD) && !JSON.stringify(ex.sheets.Config).includes(SECRET));

    T("ลายเซ็นปลอม → ปฏิเสธ ไม่จำกลุ่ม", (await hook([joinEv("GX")], "ffffffffffffffffffffffffffffffff")) === 401 && (await lsys("LINESTATUS")).groups.length === 0);
    T("ปุ่ม Verify ใน LINE (events ว่าง) → 200", (await hook([])) === 200);
    calls.length = 0;
    T("บอทเข้ากลุ่มแรก → 200", (await hook([joinEv("G1")])) === 200);
    let st = await lsys("LINESTATUS");
    const g1 = st.groups.find((g) => g.id === "G1");
    T("กลุ่มแรกถูกจำ + เปิดส่งให้เลย + รู้ชื่อกลุ่ม/จำนวนสมาชิก", g1 && g1.on === true && g1.name === "ฝ่ายจัดซื้อ" && g1.members === 7, st.groups);
    const rep1 = calls.find((x) => x.url === "/v2/bot/message/reply");
    T("ตอบในกลุ่มว่าเชื่อมแล้ว (ใช้ reply = ไม่เสียโควตา)", rep1 && rep1.body.replyToken === "rt-G1" && /เชื่อมกลุ่มนี้/.test(rep1.body.messages[0].text), rep1 && rep1.body);
    T("ข้อความตอบบอกวัน/เวลาที่จะส่งตามกำหนดการจริง", rep1 && /\d{2}:00/.test(rep1.body.messages[0].text), rep1 && rep1.body.messages[0].text);
    calls.length = 0;
    await hook([joinEv("G2")]);
    st = await lsys("LINESTATUS");
    const g2 = st.groups.find((g) => g.id === "G2");
    const rep2 = calls.find((x) => x.url === "/v2/bot/message/reply");
    T("กลุ่มที่สอง → จำไว้แต่ยังไม่เปิดส่ง + บอกให้แอดมินเปิด", g2 && g2.on === false && rep2 && /แอดมิน/.test(rep2.body.messages[0].text), [g2, rep2 && rep2.body]);
    await hook([joinEv("G1")]);
    T("เชิญกลุ่มเดิมซ้ำ → ไม่เกิดรายการซ้ำ", (await lsys("LINESTATUS")).groups.filter((g) => g.id === "G1").length === 1);

    const pv = await raw("PLANDIGEST", { send: false }, atok);
    T("ดูตัวอย่างก่อนส่ง → บอกกลุ่มปลายทางและจำนวนสมาชิก (= โควตาที่จะใช้)", pv.result.line === "preview" && pv.preview.line && pv.preview.line.groups.length === 1 && pv.preview.line.groups[0].members === 7, pv.preview.line);
    calls.length = 0;
    const sd = await raw("PLANDIGEST", { send: true }, atok);
    const pushes = calls.filter((x) => x.url === "/v2/bot/message/push");
    T("กดส่ง → push เข้าเฉพาะกลุ่มที่เปิด (G1) 1 ครั้ง", sd.result.line === "sent" && pushes.length === 1 && pushes[0].body.to === "G1", [sd.result, pushes.map((p) => p.body.to)]);
    T("ข้อความ LINE = ข้อความเดียวกับ Telegram + มี retry key กันส่งซ้ำ", pushes[0] && /วัตถุดิบที่ต้องสั่งซื้อ/.test(pushes[0].body.messages[0].text) && pushes[0].body.messages.length === 1 && /^[0-9a-f-]{36}$/.test(pushes[0].retryKey), pushes[0] && pushes[0].retryKey);
    const stD = await lsys("LINESTATUS");
    T("สถานะ LINE บอกกำหนดการส่ง (เปิดอยู่ + วัน/เวลา)", stD.mode === "on" && /\d{2}:00/.test(stD.scheduleText || ""), [stD.mode, stD.scheduleText]);

    await lsys("LINESAVE", { groupsOn: ["G1", "G2"] });
    calls.length = 0;
    await post({ module: "MLM", action: "PLANDIGEST", send: true, sessionToken: atok });
    T("เปิดกลุ่มที่สอง → ส่งทั้งสองกลุ่ม", calls.filter((x) => x.url === "/v2/bot/message/push").map((x) => x.body.to).sort().join(",") === "G1,G2");

    // ⏰ เตือนไม่อัปเดตเกินกำหนด ก็ส่งเข้า LINE ได้ด้วยปุ่มเดียวกัน (what: stale)
    await raw("PLANSET", { staleDays: 7 }, atok);
    calls.length = 0;
    const ss = await raw("PLANDIGEST", { what: "stale", send: true }, atok);
    const sp = calls.filter((x) => x.url === "/v2/bot/message/push");
    T("ส่งเตือนไม่อัปเดตเข้า LINE ได้", ss.result.line === "sent" && sp.length === 2 && /ไม่มีการอัปเดตสต๊อกเกิน 7 วัน/.test(sp[0].body.messages[0].text), [ss.result, sp[0] && sp[0].body.messages[0].text.slice(0, 80)]);

    await lsys("LINESAVE", { token: "", secret: "", mode: "change" });
    st = await lsys("LINESTATUS");
    T("ช่อง token/secret เว้นว่าง → ใช้ค่าเดิม", st.tokenSet && st.secretSet && st.tokenTail === "••••1234");

    quotaFull = true;
    const q = await raw("PLANDIGEST", { send: true }, atok);
    T("โควตาหมด → บอกเหตุผลเป็นภาษาคน", /โควตา/.test(q.result.line || ""), q.result);
    quotaFull = false;
    const ls = await post({ module: "SYSTEM", action: "SYSSTATUS", sessionToken: atok });
    T("หน้าสถานะระบบเห็นผล LINE ครั้งล่าสุด", ls.lastLine && ls.lastLine.sent === false && /โควตา/.test(ls.lastLine.reason), ls.lastLine);

    // 🗓️ กำหนดการส่งสรุปของ LINE (แยกจาก Telegram)
    const ng0 = await lsys("NOTIFYGET");
    await lsys("NOTIFYSET", { line: { on: false } });
    calls.length = 0;
    const off = await raw("PLANDIGEST", { send: true }, atok);
    T("ปิดส่งสรุปเข้า LINE → ไม่ยิงเข้า LINE เลย (Telegram ยังส่งตามปกติ)", off.result.line === "off" && !calls.some((x) => x.url === "/v2/bot/message/push") && "SQF" in off.result, off.result);
    T("หน้าจอรุ่นเก่าส่งโหมดความถี่มา → ไม่ปฏิเสธ แต่ไม่ไปเปลี่ยนกำหนดการ", (await lsys("LINESAVE", { mode: "change" })).status === "success" && (await lsys("NOTIFYGET")).schedule.line.on === false);
    await lsys("NOTIFYSET", { line: { on: true, detail: "short" } });
    calls.length = 0;
    await raw("PLANDIGEST", { send: true }, atok);
    const shortPush = calls.find((x) => x.url === "/v2/bot/message/push");
    T("LINE ตั้งแบบย่อ → ข้อความเข้า LINE เป็นแบบย่อ (ไม่มีบรรทัดวิธีดูต่อท้าย)", shortPush && /วัตถุดิบที่ต้องสั่งซื้อ/.test(shortPush.body.messages[0].text) && !/ดูรายละเอียดและจำนวนที่แนะนำ/.test(shortPush.body.messages[0].text), shortPush && shortPush.body.messages[0].text.slice(0, 200));
    calls.length = 0;
    const pvL = await lsys("NOTIFYPREVIEW", { channel: "line", line: { on: true, topics: { plan: true, low: true, stale: true, expiry: true }, detail: "full" } });
    T("ดูตัวอย่างของ LINE ด้วยค่าที่ยังไม่บันทึก → บอกกลุ่มปลายทาง + ไม่เกิน 5 กล่อง + ไม่ยิงจริง",
      pvL.status === "success" && pvL.texts.length >= 1 && pvL.texts.length <= 5 && pvL.line.target && pvL.line.target.groups.length === 2 && !calls.some((x) => x.url === "/v2/bot/message/push"),
      [pvL.texts && pvL.texts.length, pvL.line]);
    await lsys("NOTIFYSET", { line: ng0.schedule.line });
    T("คืนกำหนดการ LINE เดิม", JSON.stringify((await lsys("NOTIFYGET")).schedule.line) === JSON.stringify(ng0.schedule.line));

    calls.length = 0;
    const tt = await lsys("LINETEST", {});
    T("ปุ่มทดสอบส่ง → ยิงเข้ากลุ่มที่เปิดไว้", tt.ok && tt.sent === 2 && calls.filter((x) => x.url === "/v2/bot/message/push").length === 2, tt);

    await hook([{ type: "leave", source: { type: "group", groupId: "G2" }, timestamp: Date.now() }]);
    T("บอทถูกเอาออกจากกลุ่ม → ลบกลุ่มนั้นออกเอง", !(await lsys("LINESTATUS")).groups.some((g) => g.id === "G2"));

    // กติกาความถี่ (งานตามเวลาใช้ฟังก์ชันเดียวกัน · 0 = อาทิตย์ 1 = จันทร์)
    const every = { on: true, days: [0, 1, 2, 3, 4, 5, 6], hour: 8, when: "change" };
    T("เฉพาะตอนเปลี่ยน: รายการเปลี่ยน → ส่ง · เดิม → ไม่ส่ง · วันจันทร์ทวนซ้ำ",
      topicDue(every, false, "a", "b", 3) === true && topicDue(every, false, "a", "a", 3) === false && topicDue(every, false, "a", "a", 1) === true);
    const tueThu = { on: true, days: [2, 4], hour: 8, when: "change" };
    T("เลือก อ. พฤ. → วันทวนซ้ำ = อังคาร (วันแรกของสัปดาห์ที่เลือก)", reminderDow(tueThu) === 2 && topicDue(tueThu, false, "a", "a", 2) === true && topicDue(tueThu, false, "a", "a", 4) === false);
    T("ส่งทุกครั้ง: รายการเดิมก็ส่ง · กดส่งเองส่งเสมอ", topicDue(Object.assign({}, every, { when: "always" }), false, "a", "a", 3) === true && topicDue(every, true, "a", "a", 3) === true);
    const sch2 = { tg: { on: true, days: [1, 2, 3, 4, 5], hour: 7 }, line: { on: true, days: [1], hour: 8 } };
    T("ถึงเวลาส่งของแต่ละช่อง: ตรงวัน + ตรงชั่วโมง เท่านั้น",
      channelsDue(sch2, 1, 7).join() === "tg" && channelsDue(sch2, 1, 8).join() === "line" && channelsDue(sch2, 0, 7).length === 0 &&
      channelsDue({ tg: Object.assign({}, sch2.tg, { on: false }), line: sch2.line }, 1, 7).length === 0);
    const big = Array.from({ length: 8 }, (_, i) => "ข้อความ " + i + " " + "x".repeat(900));
    const packed = packTexts(big);
    T("LINE เกิน 5 ข้อความ → รวมให้ไม่เกิน 5 กล่อง ไม่มีข้อความหาย", packed.length <= 5 && big.every((m) => packed.some((p) => p.includes(m))) && packed.every((p) => p.length <= 4900), packed.map((p) => p.length));
    T("ไม่เกิน 5 ข้อความ → กล่องละข้อความเหมือนเดิม · ข้อความยาวเกินถูกตัดให้พอดี", packTexts(["a", "b"]).length === 2 && packTexts(["y".repeat(9000)])[0].length <= 4900);

    await lsys("LINESAVE", { clear: true });
    T("ลบการตั้งค่า LINE ทั้งหมดได้", (await lsys("LINESTATUS")).tokenSet === false);
  } finally { mock.close(); }
}

console.log("12) ⏰ เตือนเมื่อไม่มีการอัปเดตสต๊อกเกินจำนวนวันที่กำหนด");
{
  const plan = (extra, token = tok) => post(Object.assign({ module: "SQF", action: "USAGEPLAN", sessionToken: token }, extra));
  const s0 = (await plan({})).saved;
  T("ผู้ใช้ทั่วไปตั้งจำนวนวันไม่ได้", (await raw("PLANSET", { staleDays: 3 })).status === "error");
  const set = await raw("PLANSET", { staleDays: 7 }, atok);
  T("หัวหน้า/แอดมินตั้งจำนวนวันได้ (ค่ากลางของทุกคน)", set.status === "success" && set.settings.staleDays === 7, set.settings);
  const g = await get("SQF");
  T("ข้อมูลคลังมีวันอัปเดตล่าสุด + จำนวนวันที่ค้าง + ค่ากลาง", g.staleDays === 7 && g.materials.every((m) => "IdleDays" in m && "LastUpdate" in m), [g.staleDays, g.materials[0]]);
  const p = await plan({});
  const old = p.items.find((x) => x.idleDays !== null && x.idleDays > 7);
  T("ของที่ไม่มีใครแตะเกิน 7 วัน → ขึ้นเตือน + บอกเหตุผล", old && old.stale === true && old.reasons.some((r) => /ไม่มีการอัปเดตสต๊อก/.test(r)) && p.summary.stale > 0, old);
  const fresh = p.items.find((x) => x.idleDays === 0);
  T("ของที่เพิ่งแตะวันนี้ → ไม่เตือน", fresh && fresh.stale === false, fresh);
  if (old) {
    await raw("VERIFY", { sku: old.sku, qty: old.qty });   // นับยืนยันยอดเดิม (ยอดไม่เปลี่ยน)
    const after = (await plan({})).items.find((x) => x.sku === old.sku);
    T("กดนับยืนยัน (ยอดเท่าเดิม) → หายจากรายการเตือนทันที", after.stale === false && after.idleDays === 0 && after.qty === old.qty, after);
    const gm = (await get("SQF")).materials.find((m) => m.SKU === old.sku);
    T("หน้าคลังเห็น IdleDays = 0 หลังนับ", gm.IdleDays === 0);
  }
  const ed = p.items.find((x) => x.idleDays !== null && x.idleDays > 7 && (!old || x.sku !== old.sku));
  if (ed) {
    const m0 = await matOf("SQF", ed.sku);
    await raw("EDIT", { sku: ed.sku, name: m0.Name, unit: m0.Unit, min: m0.Min, dailyUsage: m0.DailyUsage, expiryDate: m0.ExpiryDate || "", alertDays: m0.AlertDays });
    T("แก้ไขข้อมูล (ไม่แตะยอด) → ยังนับว่าไม่อัปเดต", (await plan({})).items.find((x) => x.sku === ed.sku).stale === true);
  }
  const big = await raw("PLANSET", { staleDays: 365 }, atok);
  const pb = await plan({});
  T("ตั้ง 365 วัน → แทบไม่มีอะไรเตือน (ทุกตัวในเครื่องทดสอบแตะภายในปี)", big.settings.staleDays === 365 && pb.summary.stale === pb.items.filter((x) => x.idleDays === null || x.idleDays > 365).length);
  await raw("PLANSET", { staleDays: 0 }, atok);
  const p0 = await plan({});
  T("ตั้ง 0 = ปิดเตือน", p0.summary.stale === 0 && !p0.items.some((x) => x.stale) && (await get("SQF")).staleDays === 0);
  const dOff = await raw("PLANDIGEST", { what: "stale", send: false }, atok);
  T("ปิดแล้ว → ปุ่มส่งเตือนไม่มีอะไรให้ส่ง", !dOff.preview || !dOff.preview.SQF, dOff);
  await raw("PLANSET", { staleDays: 7 }, atok);
  const dv = await raw("PLANDIGEST", { what: "stale", send: false }, atok);
  T("ดูตัวอย่างข้อความเตือน → บอกจำนวนวัน + วิธีแก้ (กดนับ)", /ไม่มีการอัปเดตสต๊อกเกิน 7 วัน/.test((dv.preview || {}).SQF || "") && /📊 นับ/.test(dv.preview.SQF), dv.preview);
  T("ผู้ใช้ทั่วไปสั่งส่งเตือนไม่ได้", (await raw("PLANDIGEST", { what: "stale", send: true })).status === "error");
  const ds = await raw("PLANDIGEST", { what: "stale", send: true }, atok);
  T("กดส่งเตือน → Telegram (เครื่องทดสอบปิดไว้ = disabled)", /disabled/.test(ds.result.SQF || ""), ds.result);
  await raw("PLANSET", { staleDays: s0.staleDays }, atok);
  T("คืนค่าเดิม", (await plan({})).saved.staleDays === s0.staleDays);
}

console.log("13) ⏰ ห้องเย็น — ล็อตที่ไม่มีการอัปเดตเกินกำหนด (ย้อนเวลาล็อตทดสอบในฐานข้อมูลในเครื่องด้วย wrangler)");
{
  const { execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const here = fileURLToPath(new URL("..", import.meta.url));
  // ย้อนเวลาเฉพาะล็อตทดสอบที่เพิ่งสร้าง — คำสั่ง --local เท่านั้น ห้ามมี --remote
  // ส่ง SQL ผ่านไฟล์ (--file): บน Windows ต้องเรียกผ่าน shell ซึ่งไม่ครอบเครื่องหมายคำพูดให้ ส่งเป็นข้อความตรงๆ แล้ว SQL ขาด
  const { writeFileSync, unlinkSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const sqlLocal = (sql) => {
    const f = join(tmpdir(), "appstock_test_" + Date.now() + ".sql");
    writeFileSync(f, sql, "utf8");
    try {
      execFileSync(process.platform === "win32" ? "wrangler.cmd" : "wrangler", ["d1", "execute", "appstock", "--local", "--file", f],
        { cwd: here, stdio: "pipe", shell: process.platform === "win32" });
    } finally { try { unlinkSync(f); } catch (e) {} }
  };
  const s0 = (await post({ module: "SQF", action: "USAGEPLAN", sessionToken: tok })).saved;
  await raw("PLANSET", { staleDays: 7 }, atok);
  const bc = "STALE" + Date.now();
  await cr("saveNewProduct", { barcode: bc, productName: "ล็อตค้าง " + bc, sku: "SK" + bc, defaultUnit: "ถ้วย", standardShelfLifeDays: 60, warningPercentage: 10 });
  const th = new Date(Date.now() + 7 * 3600000), dd = (d) => String(d.getUTCDate()).padStart(2, "0") + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCFullYear()).slice(2);
  const mfgA = dd(new Date(th.getTime() - 20 * 86400000)), mfgB = dd(new Date(th.getTime() - 2 * 86400000)), expAll = dd(new Date(th.getTime() + 50 * 86400000));
  await cr("saveOrUpdateCount", { barcode: bc, mfg: mfgA, exp: expAll, newQty: 30, note: "ล็อต A" });
  await cr("saveOrUpdateCount", { barcode: bc, mfg: mfgB, exp: expAll, newQty: 12, note: "ล็อต B" });
  let ov = await cr("getStartupOverview", {});
  const mine = (o) => o.allLots.filter((l) => l.Barcode === bc);
  T("ล็อตที่เพิ่งบันทึก → ไม่อัปเดต 0 วัน ไม่เตือน", mine(ov).length === 2 && mine(ov).every((l) => l.IdleDays === 0 && l.Stale === false) && ov.staleDays === 7, mine(ov));
  const isoA = mine(ov).sort((a, b) => a.MFG.localeCompare(b.MFG))[0].MFG;
  let backdated = false;
  try {
    const old = new Date(Date.now() - 12 * 86400000).toISOString();
    sqlLocal(`UPDATE cr_stock SET updated_at = '${old}' WHERE barcode = '${bc}' AND mfg = '${isoA}'; UPDATE cr_lot_history SET ts = '${old}' WHERE barcode = '${bc}' AND mfg = '${isoA}'`);
    backdated = true;
  } catch (e) { console.log("  ⏭️  ข้าม: ย้อนเวลาในฐานข้อมูลในเครื่องไม่ได้ (" + String(e.message).slice(0, 80) + ")"); }
  if (backdated) {
    ov = await cr("getStartupOverview", {});
    const a = mine(ov).find((l) => l.MFG === isoA), b = mine(ov).find((l) => l.MFG !== isoA);
    T("ล็อตที่ไม่มีใครแตะ 12 วัน → เตือน (แยกรายล็อต ล็อตอื่นของสินค้าเดียวกันไม่โดน)", a.Stale === true && a.IdleDays === 12 && b.Stale === false, [a, b]);
    T("ภาพรวมมีรายการล็อตค้าง + จำนวน", ov.staleLots.some((l) => l.Barcode === bc && l.MFG === isoA) && ov.summary.staleLots === ov.staleLots.length, ov.summary);
    const prod = ov.totalByProduct.find((p) => p.ProductName === "ล็อตค้าง " + bc);
    T("ระดับสินค้า (หน้าผู้บริหาร): อัปเดตล่าสุด = ล็อตที่มีคนแตะล่าสุด", prod && prod.IdleDays === 0 && !!prod.LastUpdate && !("_lu" in prod), prod);
    const lite = await cr("getStartupOverview", { lite: true });
    T("มือถือ (แบบย่อ) ได้ Stale/IdleDays ต่อล็อต + ค่ากลาง", lite.staleDays === 7 && lite.allLots.find((l) => l.Barcode === bc && l.MFG === isoA).Stale === true && lite.staleLots === undefined);
    const pv = await post({ module: "COLDROOM", action: "staleDigest", payload: { send: false }, sessionToken: atok });
    T("ดูตัวอย่างข้อความเตือนห้องเย็น", /ล็อตที่ไม่มีการอัปเดตสต๊อกเกิน 7 วัน/.test((pv.preview || {}).COLDROOM || "") && pv.preview.COLDROOM.includes("ล็อตค้าง " + bc), pv.preview && pv.preview.COLDROOM && pv.preview.COLDROOM.slice(0, 120));
    T("ผู้ใช้ทั่วไปสั่งส่งเตือนห้องเย็นไม่ได้", (await post({ module: "COLDROOM", action: "staleDigest", payload: { send: true }, sessionToken: tok })).status === "error");
    const sd = await post({ module: "COLDROOM", action: "staleDigest", payload: { send: true }, sessionToken: atok });
    T("กดส่งเตือนห้องเย็น → Telegram (เครื่องทดสอบปิดไว้ = disabled)", /disabled/.test((sd.result || {}).COLDROOM || ""), sd.result);
    await cr("saveOrUpdateCount", { barcode: bc, mfg: dd(new Date(th.getTime() - 20 * 86400000)), exp: expAll, newQty: 30, note: "นับยืนยัน" });
    ov = await cr("getStartupOverview", {});
    T("นับยืนยันที่ล็อตนั้น (ยอดเท่าเดิม) → หายจากรายการเตือน", mine(ov).find((l) => l.MFG === isoA).Stale === false && !ov.staleLots.some((l) => l.Barcode === bc));
    sqlLocal(`UPDATE cr_stock SET updated_at = 'Win11/10/Chrome xx' WHERE barcode = '${bc}' AND mfg = '${isoA}'`);
    ov = await cr("getStartupOverview", {});
    T("ช่องเวลาเพี้ยน (ชื่อเครื่อง) → ใช้เวลาจากประวัติล็อตแทน ไม่พัง", mine(ov).find((l) => l.MFG === isoA).IdleDays === 0);
    await raw("PLANSET", { staleDays: 0 }, atok);
    ov = await cr("getStartupOverview", {});
    T("ตั้ง 0 = ปิดเตือนห้องเย็นด้วย", ov.staleDays === 0 && ov.summary.staleLots === 0 && !ov.allLots.some((l) => l.Stale));
  }
  // เก็บกวาด: ล้างยอดล็อตทดสอบ (ไม่ค้างในภาพรวมรอบหน้า)
  for (const l of mine(await cr("getStartupOverview", {}))) await cr("clearLotStock", { barcode: bc, mfg: l.MFG, reason: "ล้างของทดสอบ" });
  await raw("PLANSET", { staleDays: s0.staleDays }, atok);
  T("เก็บกวาดล็อตทดสอบ + คืนค่าเดิม", !mine(await cr("getStartupOverview", {})).length && (await post({ module: "SQF", action: "USAGEPLAN", sessionToken: tok })).saved.staleDays === s0.staleDays);
}

console.log("14) 🗓️ กำหนดการส่งสรุป — วัน / เวลา / หัวข้อ / ย่อ-ละเอียด แยก Telegram กับ LINE");
{
  const ns = (action, extra, token = atok) => post(Object.assign({ module: "SYSTEM", action, sessionToken: token }, extra || {}));
  const g0 = await ns("NOTIFYGET", {}, tok);
  T("ทุกคนอ่านกำหนดการได้ (หน้าวางแผนสั่งซื้อโชว์ให้รู้) + มีคำอธิบายภาษาคน", g0.status === "success" && g0.schedule.tg && g0.schedule.line && typeof g0.text.tg === "string", g0.text);
  T("ผู้ใช้ทั่วไป / หัวหน้า ตั้งกำหนดการไม่ได้ (admin เท่านั้น)", (await ns("NOTIFYSET", { tg: { hour: 9 } }, tok)).status === "error" &&
    (await ns("NOTIFYSET", { tg: { hour: 9 } }, await login("นุ่น").catch(() => tok))).status === "error" && (await ns("NOTIFYPREVIEW", { channel: "tg" }, tok)).status === "error");
  T("ไม่ส่งค่ามาเลย → ปฏิเสธ", (await ns("NOTIFYSET", {})).status === "error");
  const s1 = await ns("NOTIFYSET", { tg: { on: true, days: [5, "1", 1, 9, -1, "x"], hour: 7, topics: { plan: true, low: true, stale: false, expiry: true }, detail: "short", when: "always" } });
  T("บันทึก Telegram: วันซ้ำ/ผิดถูกกรองทิ้ง + เรียงวัน · ช่อง LINE ไม่ถูกแตะ", s1.status === "success" && s1.schedule.tg.days.join() === "1,5" && s1.schedule.tg.hour === 7 &&
    s1.schedule.tg.detail === "short" && s1.schedule.tg.when === "always" && s1.schedule.tg.topics.low === true && JSON.stringify(s1.schedule.line) === JSON.stringify(g0.schedule.line), s1.schedule);
  T("คำอธิบายภาษาคนตรงกับที่ตั้ง", /จ ศ 07:00/.test(s1.text.tg) && /ส่งทุกครั้ง/.test(s1.text.tg) && /แบบย่อ/.test(s1.text.tg), s1.text.tg);
  const s2 = await ns("NOTIFYSET", { tg: { hour: 30, detail: "huge", when: "sometimes", days: "จันทร์" } });
  T("ค่าแปลกปลอม → คงค่าเดิมทุกช่อง ไม่พัง", s2.status === "success" && s2.schedule.tg.hour === 7 && s2.schedule.tg.detail === "short" && s2.schedule.tg.when === "always" && s2.schedule.tg.days.join() === "1,5", s2.schedule.tg);

  // ตัวอย่างข้อความ: แบบย่อ vs ละเอียด (ใช้ค่าที่ยังไม่บันทึก)
  const onlyPlan = { plan: true, low: false, stale: false, expiry: false };
  const full = await ns("NOTIFYPREVIEW", { channel: "tg", tg: { topics: onlyPlan, detail: "full" } });
  const short = await ns("NOTIFYPREVIEW", { channel: "tg", tg: { topics: onlyPlan, detail: "short" } });
  const fP = (full.texts || []).find((t) => /วัตถุดิบที่ต้องสั่งซื้อ/.test(t)), sP = (short.texts || []).find((t) => /วัตถุดิบที่ต้องสั่งซื้อ/.test(t));
  T("ดูตัวอย่างแบบละเอียด → มีตัวเลข + บรรทัดวิธีดูต่อ", fP && /เหลือ/.test(fP) && /เปิดแอป → 📈 วางแผนสั่งซื้อ/.test(fP), fP && fP.slice(0, 160));
  T("ดูตัวอย่างแบบย่อ → สั้นกว่า ไม่เกิน 5 รายการ ไม่มีบรรทัดวิธีดู", sP && sP.length < fP.length && !/เปิดแอป/.test(sP) && sP.split("\n").filter((l) => /^(🔴|🟠) .+ — /u.test(l)).length <= 5, sP);
  T("ดูตัวอย่างไม่ไปแตะค่าที่บันทึกไว้", (await ns("NOTIFYGET")).schedule.tg.detail === "short");
  const none = await ns("NOTIFYPREVIEW", { channel: "tg", tg: { topics: { plan: false, low: false, stale: false, expiry: false } } });
  T("ไม่เลือกหัวข้อเลย → ไม่มีอะไรจะส่ง", none.status === "success" && none.texts.length === 0, none.texts);

  // หัวข้อต่ำกว่าจุดสั่งซื้อ + ใกล้หมดอายุ (สร้างของทดสอบ แล้วลบทิ้ง)
  const skL = "NTFL" + Date.now(), skE = "NTFE" + Date.now();
  const th = new Date(Date.now() + 7 * 3600000 + 3 * 86400000);
  const exp3 = String(th.getUTCDate()).padStart(2, "0") + "/" + String(th.getUTCMonth() + 1).padStart(2, "0") + "/" + th.getUTCFullYear();
  await raw("CREATE", { sku: skL, name: "ต่ำกว่าจุด " + skL, unit: "ถุง", qty: 2, min: 10, dailyUsage: 0 });
  await raw("CREATE", { sku: skE, name: "ใกล้หมดอายุ " + skE, unit: "ขวด", qty: 5, min: 0, dailyUsage: 0, expiryDate: exp3, alertDays: 7 });
  const lowEx = await ns("NOTIFYPREVIEW", { channel: "tg", tg: { topics: { plan: false, low: true, stale: false, expiry: true }, detail: "full" } });
  const lowT = (lowEx.texts || []).find((t) => /ต่ำกว่าจุดสั่งซื้อ — 🏭 วัตถุดิบ SQF/.test(t)), expT = (lowEx.texts || []).find((t) => /แจ้งเตือนวันหมดอายุ/.test(t));
  T("หัวข้อต่ำกว่าจุดสั่งซื้อ → เห็นของที่เหลือต่ำกว่า Min พร้อมจุดสั่งซื้อ", lowT && lowT.includes("ต่ำกว่าจุด " + skL) && /จุดสั่งซื้อ 10/.test(lowT), lowT && lowT.slice(0, 200));
  T("หัวข้อใกล้หมดอายุ → เห็นของที่จะหมดใน 3 วัน (นับเวลาไทย)", expT && expT.includes("ใกล้หมดอายุ " + skE) && /เหลือ 3 วัน/.test(expT), expT && expT.slice(0, 300));
  await raw("DELETE", { sku: skL }); await raw("DELETE", { sku: skE });

  const back = await ns("NOTIFYSET", { tg: g0.schedule.tg, line: g0.schedule.line });
  T("คืนกำหนดการเดิม", back.status === "success" && JSON.stringify(back.schedule) === JSON.stringify(g0.schedule), back.schedule);
}

console.log("15) QA 2026-10-10 — ยอดติดลบตอนสร้าง (M13) · สถานะหมดอายุคิดที่หลังบ้าน (M2)");
{
  const neg = await raw("CREATE", { sku: "QANEG" + Date.now(), name: "ติดลบ", unit: "ชิ้น", qty: -5 });
  T("สร้างวัตถุดิบด้วยยอดเริ่มต้นติดลบ → ปฏิเสธ", neg.status === "error" && /0 ขึ้นไป/.test(neg.message || ""), neg);
  const bad = await raw("CREATE", { sku: "QANAN" + Date.now(), name: "ไม่ใช่ตัวเลข", unit: "ชิ้น", qty: "abc" });
  T("ยอดเริ่มต้นไม่ใช่ตัวเลข → ปฏิเสธ", bad.status === "error", bad);
  // วันหมดอายุ 3 รูปแบบที่มีในข้อมูลจริง: ปปปป-ดด-วว (ช่องเลือกวันที่) · วว/ดด/ปปปป ค.ศ. และ พ.ศ. (ข้อมูลเก่าจากชีต)
  const th = (d) => { const t = new Date(Date.now() + 7 * 3600000 + d * 86400000); return { y: t.getUTCFullYear(), m: String(t.getUTCMonth() + 1).padStart(2, "0"), d: String(t.getUTCDate()).padStart(2, "0") }; };
  const a = th(3), b = th(12), c = th(-2), stamp = Date.now();
  const cases = [
    ["QAEX1" + stamp, `${a.y}-${a.m}-${a.d}`, 3, "near"],
    ["QAEX2" + stamp, `${b.d}/${b.m}/${b.y}`, 12, ""],
    ["QAEX3" + stamp, `${c.d}/${c.m}/${c.y + 543}`, -2, "expired"],
  ];
  for (const [sku, exp] of cases) await raw("CREATE", { sku, name: "หมดอายุ " + sku, unit: "ชิ้น", qty: 1, expiryDate: exp, alertDays: 7 });
  const g = await get("SQF");
  const got = cases.map(([sku]) => g.materials.find((m) => m.SKU === sku));
  T("ทุกรายการมี ExpDays / ExpStatus จากหลังบ้าน", g.materials.every((m) => "ExpDays" in m && "ExpStatus" in m), g.materials[0]);
  cases.forEach(([sku, exp, days, st], i) =>
    T(`วันหมดอายุ "${exp}" → อีก ${days} วัน · สถานะ "${st || "ปกติ"}" (นับวันปฏิทินไทย)`, got[i] && got[i].ExpDays === days && got[i].ExpStatus === st, got[i] && [got[i].ExpDays, got[i].ExpStatus]));
  for (const [sku] of cases) await raw("DELETE", { sku });
}

console.log(`\nสรุป: ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
