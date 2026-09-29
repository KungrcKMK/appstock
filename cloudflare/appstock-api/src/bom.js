// ข้อมูลอ้างอิงการผลิต (BOM): รายการ · ของสินค้าเดียว · บันทึก/ลบ · คำนวณวัตถุดิบของใบสั่งผลิต · ตรวจความพร้อมของข้อมูล
import { all, stmt } from "./lib.js";

const bomRows = (c) => all(c, "SELECT * FROM bom ORDER BY id");
async function stockMapOf(c, factory) {
  const map = {};
  (await all(c, "SELECT sku, qty, daily_usage, unit FROM materials WHERE module = ?", String(factory)))
    .forEach((m) => { map[String(m.sku)] = { qty: Number(m.qty) || 0, dailyUsage: Number(m.daily_usage) || 0, unit: String(m.unit || "") }; });
  return map;
}

export async function bomGetList(c) {
  const map = {};
  for (const r of await bomRows(c)) {
    const bc = String(r.product_barcode);
    if (!map[bc]) map[bc] = { barcode: bc, name: String(r.product_name), factory: String(r.factory), materials: [] };
    map[bc].materials.push({ sku: String(r.material_sku), name: String(r.material_name), qtyPerUnit: Number(r.qty_per_unit) || 0, unit: String(r.unit) });
  }
  return { ok: true, boms: Object.values(map) };
}

export async function bomGetForProduct(c, barcode) {
  if (!barcode) return { ok: false, message: "ไม่ระบุ barcode" };
  const result = { barcode, name: "", factory: "", materials: [] };
  for (const r of await all(c, "SELECT * FROM bom WHERE product_barcode = ? ORDER BY id", String(barcode))) {
    if (!result.factory) { result.factory = String(r.factory); result.name = String(r.product_name); }
    result.materials.push({ sku: String(r.material_sku), name: String(r.material_name), qtyPerUnit: Number(r.qty_per_unit) || 0, unit: String(r.unit) });
  }
  if (result.factory && result.materials.length > 0) {
    const stockMap = await stockMapOf(c, result.factory);
    result.materials = result.materials.map((m) => {
      const s = stockMap[m.sku] || { qty: 0, dailyUsage: 0, unit: m.unit };
      return Object.assign({}, m, { currentQty: s.qty, dailyUsage: s.dailyUsage });
    });
  }
  return { ok: true, bom: result };
}

export async function bomSave(c, payload) {
  const barcode = payload.barcode, name = payload.name, factory = payload.factory, materials = payload.materials || [];
  if (!barcode || !factory) return { ok: false, message: "ข้อมูลไม่ครบ (barcode/factory)" };
  // ลบของเดิมแล้วใส่ชุดใหม่ใน transaction เดียว — ล้มกลางทางแล้วข้อมูลเดิมไม่หาย
  const stmts = [stmt(c, "DELETE FROM bom WHERE product_barcode = ?", String(barcode))];
  materials.forEach((m, idx) => {
    const bomId = "BOM-" + String(barcode).replace(/[^a-zA-Z0-9]/g, "").substring(0, 8) + "-" + String(idx + 1).padStart(3, "0");
    stmts.push(stmt(c,
      "INSERT INTO bom (bom_id, product_barcode, product_name, factory, material_sku, material_name, qty_per_unit, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      bomId, String(barcode), String(name || ""), String(factory), String(m.sku || ""), String(m.name || ""), Number(m.qtyPerUnit) || 0, String(m.unit || "")));
  });
  await c.env.DB.batch(stmts);
  return { ok: true, saved: materials.length };
}

export async function bomDelete(c, barcode) {
  if (!barcode) return { ok: false, message: "ไม่ระบุ barcode" };
  await c.env.DB.prepare("DELETE FROM bom WHERE product_barcode = ?").bind(String(barcode)).run();
  return { ok: true };
}

export async function bomCalcWorkOrder(c, payload) {
  const items = payload.items || [];   // [{barcode, produceQty}]
  if (!items.length) return { ok: false, message: "ไม่มีรายการสินค้า" };
  const bomMap = {};
  for (const r of await bomRows(c)) {
    const bc = String(r.product_barcode), sku = String(r.material_sku);
    if (!bomMap[bc]) bomMap[bc] = { factory: String(r.factory), skus: {} };
    if (!bomMap[bc].skus[sku]) bomMap[bc].skus[sku] = { name: String(r.material_name), totalNeeded: 0, unit: String(r.unit) };
    bomMap[bc].skus[sku].totalNeeded += Number(r.qty_per_unit) || 0;
  }
  const neededByFactory = {}, noBom = [];
  items.forEach((item) => {
    const bom = bomMap[item.barcode];
    if (!bom) { noBom.push(item.barcode); return; }
    if (!neededByFactory[bom.factory]) neededByFactory[bom.factory] = {};
    Object.entries(bom.skus).forEach(([sku, mat]) => {
      if (!neededByFactory[bom.factory][sku]) neededByFactory[bom.factory][sku] = { name: mat.name, needed: 0, unit: mat.unit };
      neededByFactory[bom.factory][sku].needed += mat.totalNeeded * Number(item.produceQty);
    });
  });
  const result = {};
  for (const factory of Object.keys(neededByFactory)) {
    const stockMap = await stockMapOf(c, factory);
    result[factory] = Object.entries(neededByFactory[factory]).map(([sku, mat]) => {
      const s = stockMap[sku] || { qty: 0, dailyUsage: 0 };
      const remaining = s.qty - mat.needed;
      return {
        sku, name: mat.name, needed: mat.needed, unit: mat.unit, currentQty: s.qty, remaining, dailyUsage: s.dailyUsage,
        daysBefore: s.dailyUsage > 0 ? Math.floor(s.qty / s.dailyUsage) : null,
        daysAfter: s.dailyUsage > 0 ? Math.floor(remaining / s.dailyUsage) : null,
        sufficient: remaining >= 0,
      };
    });
  }
  return { ok: true, materials: result, noBom };
}

// 🩺 ตรวจว่าข้อมูลอ้างอิงพร้อมพอจะเอาไปเทียบยอดใช้จริงหรือยัง — ชี้ที่ข้อมูลที่ขาด ไม่ได้ชี้ที่ตัวบุคคล
export async function bomHealthReport(c) {
  // 1) ข้อมูลอ้างอิงทั้งหมด
  const bomByProduct = {}, whereUsed = {}, badQtyPerUnit = [];
  for (const r of await bomRows(c)) {
    const bc = String(r.product_barcode || "").trim();
    if (!bc) continue;
    const sku = String(r.material_sku || "").trim(), qpu = Number(r.qty_per_unit) || 0, un = String(r.unit || "").trim();
    const pn = String(r.product_name || ""), mn = String(r.material_name || "");
    if (!bomByProduct[bc]) bomByProduct[bc] = { name: pn, factory: String(r.factory || ""), materials: [] };
    bomByProduct[bc].materials.push({ sku, name: mn, qtyPerUnit: qpu, unit: un });
    if (qpu <= 0) badQtyPerUnit.push({ barcode: bc, productName: pn, materialSku: sku, materialName: mn, qtyPerUnit: qpu });
    if (sku) { if (!whereUsed[sku]) whereUsed[sku] = []; whereUsed[sku].push({ barcode: bc, productName: pn, qtyPerUnit: qpu, unit: un }); }
  }
  // 2) สินค้าที่ขึ้นทะเบียนไว้
  const products = {};
  (await all(c, "SELECT barcode, product_name FROM cr_products ORDER BY seq, rowid")).forEach((p) => {
    const bc = String(p.barcode || "").trim();
    if (bc) products[bc] = String(p.product_name || "");
  });
  // 3) สินค้าที่ "ผลิตจริง" จากใบสั่งผลิต 200 ใบล่าสุด
  const producedCount = {};
  for (const w of await all(c, "SELECT items FROM work_orders ORDER BY id DESC LIMIT 200")) {
    try {
      for (const it of JSON.parse(w.items || "[]")) {
        const ibc = String(it.barcode || "").trim();
        if (ibc) producedCount[ibc] = (producedCount[ibc] || 0) + 1;
      }
    } catch (e) { /* ใบที่ JSON เสีย ข้ามไป */ }
  }
  // 4) วัตถุดิบในคลัง (ทั้ง 2 โรงงาน) · 5) วัตถุดิบที่ถูกเบิกจริง (300 รายการล่าสุดต่อโรงงาน)
  const matBySku = {}, matByName = { SQF: {}, MLM: {} }, withdrawn = {};
  for (const mod of ["SQF", "MLM"]) {
    for (const m of await all(c, "SELECT sku, name, unit, daily_usage, discontinued FROM materials WHERE module = ? ORDER BY seq, rowid", mod)) {
      const sk = String(m.sku || "").trim();
      if (!sk) continue;
      const nm = String(m.name || "").trim();
      matBySku[sk] = { name: nm, unit: String(m.unit || "").trim(), dailyUsage: Number(m.daily_usage) || 0, discontinued: Number(m.discontinued) !== 0, module: mod };
      if (nm) matByName[mod][nm] = sk;
    }
    for (const h of await all(c, "SELECT name, action, qty FROM history WHERE module = ? ORDER BY id DESC LIMIT 300", mod)) {
      if (String(h.action || "") !== "เบิกออก") continue;
      const nm = String(h.name || "").trim();
      if (!nm) continue;
      const key = mod + " " + nm;
      if (!withdrawn[key]) withdrawn[key] = { module: mod, name: nm, count: 0, qty: 0 };
      withdrawn[key].count++;
      withdrawn[key].qty += Number(h.qty) || 0;
    }
  }

  // ══ ตรวจ ══
  const bomSkuSet = {};
  Object.keys(whereUsed).forEach((sk) => { bomSkuSet[sk] = true; });
  const producedBarcodes = Object.keys(producedCount);
  const missingBom = [];
  producedBarcodes.forEach((bc) => {
    if (!bomByProduct[bc]) missingBom.push({ barcode: bc, productName: products[bc] || "(ไม่พบในทะเบียนสินค้า)", orderCount: producedCount[bc] });
  });
  missingBom.sort((a, b) => b.orderCount - a.orderCount);
  const allBarcodes = Object.keys(products);
  const registeredWithBom = allBarcodes.filter((bc) => !!bomByProduct[bc]).length;

  const unitMismatch = [], orphanMaterial = [];
  Object.keys(whereUsed).forEach((sk) => {
    const mat = matBySku[sk];
    if (!mat) { orphanMaterial.push({ materialSku: sk, materialName: whereUsed[sk][0].name || "", usedIn: whereUsed[sk].length }); return; }
    if (!mat.unit) return;
    whereUsed[sk].forEach((u) => {
      if (u.unit && u.unit !== mat.unit)
        unitMismatch.push({ materialSku: sk, materialName: mat.name, bomUnit: u.unit, stockUnit: mat.unit, productName: u.productName, barcode: u.barcode });
    });
  });

  const notInAnyBom = [], unmatchedHistory = [];
  Object.keys(withdrawn).forEach((key) => {
    const w = withdrawn[key], sk = matByName[w.module][w.name], qty = Math.round(w.qty * 1000) / 1000;
    if (!sk) { unmatchedHistory.push({ name: w.name, module: w.module, outCount: w.count, outQty: qty }); return; }
    if (bomSkuSet[sk]) return;
    const mat = matBySku[sk];
    if (mat && mat.discontinued) return;
    notInAnyBom.push({ sku: sk, name: w.name, module: w.module, outCount: w.count, outQty: qty });
  });
  notInAnyBom.sort((a, b) => b.outCount - a.outCount);
  unmatchedHistory.sort((a, b) => b.outCount - a.outCount);

  const badDailyUsage = [];
  Object.keys(matBySku).forEach((sk) => {
    const m = matBySku[sk];
    if (m.discontinued) return;
    if (!(m.dailyUsage > 0)) badDailyUsage.push({ sku: sk, name: m.name, module: m.module, dailyUsage: m.dailyUsage });
  });

  const producedTotal = producedBarcodes.length, producedWithBom = producedTotal - missingBom.length;
  const coveragePct = producedTotal > 0 ? Math.round((producedWithBom / producedTotal) * 100) : 0;
  let readiness, readinessNote;
  if (producedTotal === 0) { readiness = "ยังไม่มีข้อมูล"; readinessNote = "ยังไม่มีใบสั่งผลิตให้ตรวจ — สร้างใบสั่งผลิตก่อน"; }
  else if (coveragePct >= 80 && unitMismatch.length === 0) { readiness = "พร้อม"; readinessNote = "ข้อมูลสูตรครอบคลุมพอที่จะเทียบยอดใช้จริงได้"; }
  else if (coveragePct >= 50) { readiness = "เกือบพร้อม"; readinessNote = "ยังขาดสูตรบางส่วน ตัวเลขเทียบจะไม่ครบทุกรายการ"; }
  else { readiness = "ยังไม่พร้อม"; readinessNote = "สูตรครอบคลุมน้อยเกินไป ถ้าเทียบตอนนี้ตัวเลขจะเพี้ยน"; }

  return {
    ok: true,
    summary: {
      readiness, readinessNote, coveragePct, producedTotal, producedWithBom,
      registeredTotal: allBarcodes.length, registeredWithBom,
      bomProductCount: Object.keys(bomByProduct).length, bomMaterialCount: Object.keys(whereUsed).length,
      issueCount: missingBom.length + unitMismatch.length + orphanMaterial.length + badQtyPerUnit.length,
    },
    missingBom, unitMismatch, orphanMaterial, badQtyPerUnit, notInAnyBom, unmatchedHistory, badDailyUsage, whereUsed,
  };
}
