// เทียบคำตอบ "หลังบ้านเดิม (Apps Script)" กับ "Worker" ทีละคำสั่ง — เฉพาะคำสั่งอ่าน ไม่เขียนข้อมูล
//   node tools/parity.mjs <GAS_URL> <WORKER_URL> [username]
// ผ่าน = โครงสร้างและค่าตรงกัน (ยกเว้นช่องเวลา/สถิติการทำงานที่ต่างกันโดยธรรมชาติ)
const [, , GAS, WORKER, USERNAME = ""] = process.argv;
if (!GAS || !WORKER) { console.error("usage: node tools/parity.mjs <GAS_URL> <WORKER_URL> [username]"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IGNORE = new Set(["serverMs", "timing", "readMs", "cached", "_ms", "generatedAt"]);

async function call(base, method, body, query) {
  for (let i = 1; i <= 6; i++) {
    try {
      const r = method === "GET"
        ? await fetch(base + (query || ""))
        : await fetch(base, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
      const t = await r.text();
      try { return JSON.parse(t); } catch (e) { await sleep(5000); }
    } catch (e) { await sleep(3000); }
  }
  return { __failed: true };
}

// ทำให้ค่าที่ "หมายถึงสิ่งเดียวกัน" เทียบกันได้: เวลา ISO → ms, ตัวเลขในรูปข้อความ → ตัวเลข
function norm(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(s)) return "T" + Date.parse(s);
    if (s !== "" && !isNaN(Number(s)) && /^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return s;
  }
  if (typeof v === "number") return Math.round(v * 1000) / 1000;
  return v;
}
function diff(a, b, path, out) {
  if (out.length > 12) return;
  const ta = Array.isArray(a) ? "array" : typeof a, tb = Array.isArray(b) ? "array" : typeof b;
  if (ta === "object" && a && tb === "object" && b) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (IGNORE.has(k)) continue;
      diff(a[k], b[k], path + "." + k, out);
    }
    return;
  }
  if (ta === "array" && tb === "array") {
    if (a.length !== b.length) { out.push(`${path}: จำนวนรายการต่างกัน เดิม ${a.length} / ใหม่ ${b.length}`); return; }
    for (let i = 0; i < a.length; i++) diff(a[i], b[i], path + "[" + i + "]", out);
    return;
  }
  const na = norm(a), nb = norm(b);
  if (na !== nb && !(na === "" && nb === false) && !(na === false && nb === ""))
    out.push(`${path}: เดิม ${JSON.stringify(a)} / ใหม่ ${JSON.stringify(b)}`.slice(0, 200));
}

const tests = [];
const add = (name, method, body, query) => tests.push({ name, method, body, query });
for (const m of ["SQF", "MLM"]) {
  add("GET " + m, "GET", null, "?module=" + m);
  for (const a of ["TRENDS", "ROPSTATS", "LEDGERAUDIT", "DOCREPORT"]) add(m + " " + a, "POST", { module: m, action: a });
}
for (const a of ["getStartupOverview", "getColdRoomProducts", "getWorkOrders", "getLotHistory", "getBomList", "getBomHealth"])
  add("COLDROOM " + a, "POST", { module: "COLDROOM", action: a, payload: {} });
add("COLDROOM getStartupOverview lite", "POST", { module: "COLDROOM", action: "getStartupOverview", payload: { lite: true } });
add("SYSTEM getStockInList", "POST", { module: "SYSTEM", action: "getStockInList", payload: {} });
add("SYSTEM getMyHistory", "POST", { module: "SYSTEM", action: "getMyHistory", payload: { username: USERNAME, limit: 60 } });
add("SYSTEM verifyUser (ไม่มีชื่อนี้)", "POST", { module: "SYSTEM", action: "verifyUser", payload: { username: "__parity_no_such_user__" } });
add("SQF UPDATE ไม่มีบัตรผ่าน (ต้องถูกปฏิเสธ)", "POST", { module: "SQF", action: "UPDATE", sku: "SQF-0001", type: "OUT", qty: 1, purpose: "parity" });

let pass = 0, fail = 0;
const dyn = [];
for (const t of tests) {
  const [g, w] = await Promise.all([call(GAS, t.method, t.body, t.query), call(WORKER, t.method, t.body, t.query)]);
  if (g.__failed || w.__failed) { console.log("⚠️ ", t.name, "— เรียกไม่สำเร็จ", g.__failed ? "(เดิม)" : "", w.__failed ? "(ใหม่)" : ""); fail++; continue; }
  const out = [];
  diff(g, w, "", out);
  if (out.length) { fail++; console.log("❌", t.name); out.forEach((l) => console.log("     " + l)); }
  else { pass++; console.log("✅", t.name); }
  if (t.name === "COLDROOM getBomList" && g.boms && g.boms.length) dyn.push(g.boms[0]);
  if (t.name === "COLDROOM getColdRoomProducts" && g.products && g.products.length) dyn.push({ product: g.products[0] });
}
// คำสั่งที่ต้องใช้ค่าจากข้อมูลจริง
const extra = [];
for (const d of dyn) {
  if (d.barcode) {
    extra.push({ name: "COLDROOM getBomForProduct", body: { module: "COLDROOM", action: "getBomForProduct", payload: { barcode: d.barcode } } });
    extra.push({ name: "COLDROOM calcWorkOrderMaterials", body: { module: "COLDROOM", action: "calcWorkOrderMaterials", payload: { items: [{ barcode: d.barcode, produceQty: 10 }] } } });
  }
  if (d.product) {
    extra.push({ name: "COLDROOM getProductAndBalances", body: { module: "COLDROOM", action: "getProductAndBalances", payload: { barcode: d.product.Barcode } } });
    extra.push({ name: "COLDROOM getProductsAndBalancesBulk", body: { module: "COLDROOM", action: "getProductsAndBalancesBulk", payload: { barcodes: [d.product.Barcode, "__none__"] } } });
  }
}
for (const t of extra) {
  const [g, w] = await Promise.all([call(GAS, "POST", t.body), call(WORKER, "POST", t.body)]);
  const out = [];
  if (g.__failed || w.__failed) out.push("เรียกไม่สำเร็จ");
  else diff(g, w, "", out);
  if (out.length) { fail++; console.log("❌", t.name); out.forEach((l) => console.log("     " + l)); }
  else { pass++; console.log("✅", t.name); }
}
console.log(`\nสรุป: ตรงกัน ${pass} · ต่างกัน ${fail}`);
process.exit(fail ? 1 : 0);
