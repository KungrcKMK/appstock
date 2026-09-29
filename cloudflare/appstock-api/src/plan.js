// 📈 วางแผนสั่งซื้อ — วิเคราะห์การเบิกเพื่อกันวัตถุดิบหมด / สั่งเข้าไม่ทัน
//
// คำถามที่หน้านี้ตอบ: "ของแต่ละตัวพอใช้อีกกี่วัน · ต้องสั่งภายในวันไหนถึงจะมาทัน · ควรสั่งเท่าไร"
//   พอใช้อีก (วัน)   = คงเหลือ ÷ อัตราใช้ต่อวัน
//   ต้องสั่งภายใน    = วันที่ของจะหมด − วันรอของ − วันกันชน
//   แนะนำสั่ง         = ให้พอใช้ตามจำนวนวันที่ตั้ง นับจากวันที่ของมาถึง (ปัดตามขนาดบรรจุ / ไม่ต่ำกว่าสั่งขั้นต่ำ)
//
// อัตราใช้ต่อวัน — เป้าหมายคือ "กันของหมด" จึงเลือกค่าที่มากกว่าเมื่อมีสองแหล่ง:
//   · เบิกจริง 30 วัน (เบิก − คืน) — เชื่อได้เมื่อเบิกครบ 5 ครั้งและเห็นข้อมูลมา 14 วันขึ้นไป · ถ้า 7 วันล่าสุดเร่งขึ้นใช้ค่า 7 วัน
//   · "ใช้ต่อวัน" ที่คนตั้งไว้ในรายการวัตถุดิบ
//   เบิกจริงเชื่อได้และมากกว่าค่าที่ตั้ง → ใช้เบิกจริง · นอกนั้นใช้ค่าที่ตั้งไว้ (ช่วงที่ยังบันทึกเบิกไม่ครบ ยอดเบิกจริงจะต่ำเกินจริง)
//   ไม่ได้ตั้งค่าไว้และประวัติน้อย → ใช้เบิกจริงเท่าที่มี (ติดป้ายข้อมูลน้อย)
//   ต่างกันเกิน 30% จะบอกไว้ในข้อสังเกต ให้คนไปแก้ "ใช้ต่อวัน" ให้ตรงกับความจริง
//
// คิดที่หลังบ้านที่เดียว — หน้าคอม มือถือ และข้อความ Telegram ตอนเช้า ใช้ผลชุดเดียวกัน ตัวเลขจึงตรงกันเสมอ
// หลักการ: แค่ "ชี้ให้เห็น" — ไม่สั่งซื้อเอง ไม่บล็อกการเบิก คนตัดสินใจเองทุกครั้ง
import { all, getCfg, cfgSet, kvGet, kvPut, nowIso, fmtTH, dayTH, thaiMidnightMs, tgSendRaw, sysLog, DAY_MS, TZ_MS, FACTORY_NAME } from "./lib.js";

export const PLAN_DEFAULTS = { leadDays: 7, safetyDays: 3, coverDays: 30, alert: true };
const PLAN_MIN_TX = 5;      // เบิกอย่างน้อยกี่ครั้งใน 30 วัน ถึงจะเชื่ออัตราเบิกจริง (เกณฑ์เดียวกับจุดสั่งซื้อแนะนำ)
const PLAN_MIN_DAYS = 14;   // เห็นข้อมูลมาอย่างน้อยกี่วัน
const SOON_DAYS = 7;        // "ใกล้ถึงเวลาสั่ง" = ต้องสั่งภายในกี่วัน
const STATUS_RANK = { late: 0, now: 1, soon: 2, ok: 3, nodata: 4 };
const STATUS_TEXT = { late: "สั่งวันนี้ก็ไม่ทัน", now: "ต้องสั่งวันนี้", soon: "ใกล้ถึงเวลาสั่ง", ok: "ยังพอ", nodata: "ยังไม่มีข้อมูลการใช้" };
const STATUS_ICON = { late: "🔴", now: "🟠", soon: "🟡", ok: "🟢", nodata: "⚪" };

const r3 = (n) => Math.round(n * 1000) / 1000;
const r1 = (n) => Math.round(n * 10) / 10;
function clampNum(v, min, max, def) {
  const n = Number(v);
  if (v === "" || v === null || v === undefined || !isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}
const fmtN = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const isoToThai = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "/" + m[2] + "/" + (Number(m[1]) + 543) : ""; };

/** ค่ากลางที่ทุกคนใช้ร่วมกัน (ตาราง config) — over = ค่าที่หน้าจอส่งมาลองดู (ไม่บันทึก) */
export async function planSettings(c, over) {
  const m = await getCfg(c);
  const saved = {
    leadDays: clampNum(m.planLeadDays, 1, 180, PLAN_DEFAULTS.leadDays),
    safetyDays: clampNum(m.planSafetyDays, 0, 60, PLAN_DEFAULTS.safetyDays),
    coverDays: clampNum(m.planCoverDays, 1, 365, PLAN_DEFAULTS.coverDays),
    alert: String(m.planAlert || "on").toLowerCase() !== "off",
  };
  const o = over || {};
  return {
    saved,
    use: {
      leadDays: clampNum(o.leadDays, 1, 180, saved.leadDays),
      safetyDays: clampNum(o.safetyDays, 0, 60, saved.safetyDays),
      coverDays: clampNum(o.coverDays, 1, 365, saved.coverDays),
      alert: saved.alert,
    },
  };
}

/** บันทึกค่ากลาง (manager ขึ้นไป — ตรวจที่ด่าน WRITE_MIN_ROLE) */
export async function planSet(c, data) {
  const cur = (await planSettings(c)).saved;
  const next = {
    leadDays: clampNum(data.leadDays, 1, 180, cur.leadDays),
    safetyDays: clampNum(data.safetyDays, 0, 60, cur.safetyDays),
    coverDays: clampNum(data.coverDays, 1, 365, cur.coverDays),
    alert: data.alert === undefined ? cur.alert : !(data.alert === false || String(data.alert).toLowerCase() === "off" || String(data.alert) === "false"),
  };
  await cfgSet(c, "planLeadDays", next.leadDays);
  await cfgSet(c, "planSafetyDays", next.safetyDays);
  await cfgSet(c, "planCoverDays", next.coverDays);
  await cfgSet(c, "planAlert", next.alert ? "on" : "off");
  await sysLog(c, "plan-settings", "รอของ " + next.leadDays + " วัน · กันชน " + next.safetyDays + " วัน · สั่งให้พอ " + next.coverDays + " วัน · แจ้งเตือนเช้า " + (next.alert ? "เปิด" : "ปิด"), data.user || c.user || "-", "ok");
  return { status: "success", ok: true, settings: next };
}

/** คำนวณแผนของโรงงานเดียว */
export async function planCompute(c, module, over) {
  const now = Date.now();
  const set = await planSettings(c, over);
  const S = set.use;
  const mats = await all(c, "SELECT sku, name, qty, unit, min, daily_usage, lead_days, moq, pack_size, rop_start FROM materials WHERE module = ? AND discontinued = 0 ORDER BY seq, rowid", module);

  const nameToSku = {}, ropStart = {};
  mats.forEach((m) => {
    nameToSku[String(m.name).trim()] = String(m.sku);
    const mm = String(m.rop_start || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (mm) ropStart[m.sku] = thaiMidnightMs(+mm[1], +mm[2], +mm[3]);
  });
  const skuOf = (r) => { const s = String(r.sku || "").trim(); return s || nameToSku[String(r.name || "").trim()] || ""; };

  // วันแรกที่เห็นแต่ละตัวในประวัติ (ทุกประเภทรายการ) — ของที่เพิ่งเข้าระบบ 10 วัน ห้ามหารด้วย 30
  const firstSeen = {};
  (await all(c, "SELECT sku, name, MIN(ts) AS t FROM history WHERE module = ? GROUP BY sku, name", module)).forEach((r) => {
    const sku = skuOf(r), t = r.t ? new Date(r.t).getTime() : NaN;
    if (!sku || isNaN(t)) return;
    if (!firstSeen[sku] || t < firstSeen[sku]) firstSeen[sku] = t;
  });

  // เบิก/คืน ย้อนหลัง 90 วัน (เวลาทั้งหมดเก็บเป็น ISO UTC จึงเทียบเป็นข้อความได้)
  const since = new Date(now - 90 * DAY_MS).toISOString();
  const rows = await all(c, "SELECT ts, name, action, qty, sku, purpose FROM history WHERE module = ? AND ts >= ? AND action IN ('เบิกออก', 'คืนวัตถุดิบ') ORDER BY id", module, since);
  const st = {};
  const get = (sku) => st[sku] || (st[sku] = { n7: 0, n30: 0, n90: 0, prev30: 0, tx30: 0, tx7: 0, days30: {}, lastOut: 0, purposes: {} });
  for (const r of rows) {
    const ts = new Date(r.ts).getTime();
    const sku = skuOf(r);
    if (!sku || isNaN(ts)) continue;
    if (ropStart[sku] && ts < ropStart[sku]) continue;   // ก่อนวันเริ่มนับของตัวนั้น = มองไม่เห็น
    const q = Number(r.qty);
    if (!isFinite(q) || q <= 0) continue;
    const out = r.action === "เบิกออก";
    const delta = out ? q : -q;
    const age = now - ts;
    const s = get(sku);
    if (age <= 7 * DAY_MS) s.n7 += delta;
    if (age <= 30 * DAY_MS) s.n30 += delta;
    s.n90 += delta;
    if (age > 30 * DAY_MS && age <= 60 * DAY_MS) s.prev30 += delta;
    if (out) {
      if (ts > s.lastOut) s.lastOut = ts;
      if (age <= 7 * DAY_MS) s.tx7++;
      if (age <= 30 * DAY_MS) {
        s.tx30++;
        const day = dayTH(ts);
        s.days30[day] = (s.days30[day] || 0) + q;
        const p = String(r.purpose || "").trim() || "(ไม่ระบุ)";
        s.purposes[p] = (s.purposes[p] || 0) + q;
      }
    }
  }

  const todayMs = now + TZ_MS;   // ใช้คิด "อีกกี่วัน" เป็นวันปฏิทินไทย
  const dateAfter = (days) => new Date(todayMs + days * DAY_MS).toISOString().slice(0, 10);
  const summary = { late: 0, now: 0, soon: 0, ok: 0, nodata: 0, total: mats.length };
  const items = mats.map((m) => {
    const sku = String(m.sku), qty = Number(m.qty) || 0, min = Number(m.min) || 0, plan = Math.max(0, Number(m.daily_usage) || 0);
    const s = st[sku] || null;
    const base = ropStart[sku] || firstSeen[sku] || 0;
    const obsDays = base ? Math.max(1, Math.ceil((now - base) / DAY_MS)) : 0;
    const obs = (w) => Math.max(1, Math.min(w, obsDays || w));
    const actual7 = s ? Math.max(0, s.n7) / obs(7) : 0;
    const actual30 = s ? Math.max(0, s.n30) / obs(30) : 0;
    const actual90 = s ? Math.max(0, s.n90) / obs(90) : 0;
    const tx30 = s ? s.tx30 : 0;
    const enough = tx30 >= PLAN_MIN_TX && obsDays >= PLAN_MIN_DAYS && actual30 > 0;
    const accel = enough && s.tx7 >= 2 && actual7 > actual30 * 1.25;

    const actualRate = enough ? (accel ? actual7 : actual30) : 0;
    let rate = 0, rateSource = "none";
    if (enough && actualRate >= plan) { rate = actualRate; rateSource = "actual"; }
    else if (plan > 0) { rate = plan; rateSource = "plan"; }
    else if (actual90 > 0) { rate = actual90; rateSource = "thin"; }

    const own = Number(m.lead_days) || 0;
    const leadDays = own > 0 ? Math.min(365, Math.round(own)) : S.leadDays;
    const pack = Math.max(0, Number(m.pack_size) || 0), moq = Math.max(0, Number(m.moq) || 0);
    const belowMin = min > 0 && qty <= min;

    let status = "nodata", daysCover = null, runOutDate = "", orderInDays = null, orderByDate = "", need = 0;
    const reasons = [];
    if (rate > 0) {
      daysCover = Math.max(0, qty / rate);
      const whole = Math.floor(daysCover + 1e-9);
      runOutDate = dateAfter(whole);
      orderInDays = Math.floor(daysCover - leadDays - S.safetyDays + 1e-9);
      orderByDate = dateAfter(Math.max(0, orderInDays));
      if (daysCover < leadDays) status = "late";
      else if (orderInDays <= 0) status = "now";
      else if (orderInDays <= SOON_DAYS) status = "soon";
      else status = "ok";
      if (status === "late") reasons.push(qty <= 0 ? "ของหมดแล้ว" : "พอใช้อีก " + r1(daysCover) + " วัน แต่รอของ " + leadDays + " วัน");
      else if (status === "now") reasons.push("พอใช้อีก " + r1(daysCover) + " วัน · รอของ " + leadDays + " วัน" + (S.safetyDays ? " + กันชน " + S.safetyDays + " วัน" : "") + " — ถึงเวลาสั่งแล้ว");
      else if (status === "soon") reasons.push("ต้องสั่งภายใน " + orderInDays + " วัน");
      // ของที่จะเหลือตอนของใหม่มาถึง → สั่งให้พอใช้ต่ออีก coverDays (+กันชน)
      const leftAtArrival = Math.max(0, qty - rate * leadDays);
      need = rate * (S.coverDays + S.safetyDays) - leftAtArrival;
    } else if (belowMin) {
      need = min * 2 - qty;   // ไม่รู้อัตราใช้ → เติมให้เป็นสองเท่าของจุดสั่งซื้อ (คนปรับเองได้)
    }
    // ต่ำกว่าจุดสั่งซื้อที่คนตั้งไว้เอง = ถึงเวลาสั่งตามกติกาของเขา แม้ตัวเลขการใช้จะบอกว่ายังพอ
    if (belowMin && (STATUS_RANK[status] > STATUS_RANK.now)) { status = "now"; reasons.push("ต่ำกว่าจุดสั่งซื้อที่ตั้งไว้ (" + fmtN(min) + ")"); }
    else if (belowMin) reasons.push("ต่ำกว่าจุดสั่งซื้อที่ตั้งไว้ (" + fmtN(min) + ")");

    let suggestQty = 0;
    if (status !== "ok" && status !== "nodata" && need > 0) {
      suggestQty = Math.ceil(need - 1e-9);
      if (pack > 0) suggestQty = Math.ceil(suggestQty / pack - 1e-9) * pack;
      if (moq > 0 && suggestQty < moq) suggestQty = moq;
    }
    if (accel && rateSource === "actual") reasons.push("7 วันล่าสุดใช้เร็วขึ้น (" + fmtN(r1(actual7)) + "/วัน จากเดิม " + fmtN(r1(actual30)) + ")");
    // เบิกจริงต่างจากค่าที่ตั้งไว้มาก → ชวนให้ไปแก้ "ใช้ต่อวัน" ให้ตรง
    let gapPct = null;
    if (enough && plan > 0) {
      gapPct = Math.round((actual30 - plan) / plan * 100);
      if (gapPct >= 30) reasons.push("เบิกจริง (" + fmtN(r1(actual30)) + "/วัน) มากกว่าค่าที่ตั้งไว้ " + gapPct + "% — คำนวณด้วยยอดเบิกจริง");
      else if (gapPct <= -30) reasons.push("เบิกจริง (" + fmtN(r1(actual30)) + "/วัน) น้อยกว่าค่าที่ตั้งไว้ " + Math.min(99, Math.abs(gapPct)) + "% — ยังคำนวณด้วยค่าที่ตั้งไว้ ถ้าค่านั้นสูงไปให้แก้ \"ใช้ต่อวัน\"");
    }
    const prev30 = s ? Math.max(0, s.prev30) : 0, out30 = s ? Math.max(0, s.n30) : 0;
    const dayVals = s ? Object.values(s.days30) : [];
    summary[status]++;
    return {
      sku, name: String(m.name || ""), unit: String(m.unit || ""), qty, min,
      status, statusText: STATUS_TEXT[status], icon: STATUS_ICON[status], reasons,
      rate: r3(rate), rateSource, actual7: r3(actual7), actual30: r3(actual30), plan: r3(plan), gapPct, accel,
      daysCover: daysCover === null ? null : r1(daysCover), runOutDate, orderInDays, orderByDate,
      leadDays, leadOwn: own > 0, moq, packSize: pack, suggestQty, belowMin,
      out30: r3(out30), prev30: r3(prev30), trendPct: prev30 > 0 ? Math.round((out30 - prev30) / prev30 * 100) : null,
      peakDay30: dayVals.length ? r3(Math.max.apply(null, dayVals)) : 0, activeDays30: dayVals.length, tx30, obsDays,
      lastOut: s && s.lastOut ? dayTH(s.lastOut) : "",
      topPurposes: s ? Object.keys(s.purposes).map((p) => ({ purpose: p, qty: r3(s.purposes[p]) })).sort((a, b) => b.qty - a.qty).slice(0, 3) : [],
    };
  });
  items.sort((a, b) => (STATUS_RANK[a.status] - STATUS_RANK[b.status]) ||
    ((a.daysCover === null ? 1e9 : a.daysCover) - (b.daysCover === null ? 1e9 : b.daysCover)) || a.name.localeCompare(b.name, "th"));
  return { status: "success", ok: true, module, today: dayTH(now), generatedAt: nowIso(), settings: S, saved: set.saved, summary, items };
}

/** action USAGEPLAN — หน้าจอส่ง leadDays/safetyDays/coverDays มาลองดูได้ (ไม่บันทึก) */
export const usagePlan = (c, data, module) => planCompute(c, module, data);

// ───────────── สรุปเช้าเข้า Telegram ─────────────
// ส่งเมื่อ "รายการที่ต้องสั่งเปลี่ยนไปจากที่เคยแจ้ง" หรือเป็นวันจันทร์ (ทวนทั้งสัปดาห์) — ไม่ส่งซ้ำข้อความเดิมทุกเช้าจนคนเลิกอ่าน
function planMessage(module, p) {
  const urgent = p.items.filter((x) => x.status === "late" || x.status === "now");
  const lines = urgent.slice(0, 15).map((x) => {
    const cover = x.daysCover === null ? "" : " · พอใช้ " + fmtN(x.daysCover) + " วัน";
    const sug = x.suggestQty > 0 ? "\n     → แนะนำสั่ง " + fmtN(x.suggestQty) + " " + x.unit : "";
    return x.icon + " " + x.name + " — เหลือ " + fmtN(x.qty) + " " + x.unit + cover + " (รอของ " + x.leadDays + " วัน)" + sug;
  });
  let msg = "📈 วัตถุดิบที่ต้องสั่งซื้อ — " + (FACTORY_NAME[module] || module) + "\n" + fmtTH(Date.now(), "dd/MM/yyyy HH:mm") + "\n" +
    "🔴 สั่งวันนี้ก็ไม่ทัน " + p.summary.late + "  •  🟠 ต้องสั่งวันนี้ " + p.summary.now + (p.summary.soon ? "  •  🟡 ใกล้ถึงเวลาสั่ง " + p.summary.soon : "") + "\n\n" + lines.join("\n");
  if (urgent.length > 15) msg += "\n… และอีก " + (urgent.length - 15) + " รายการ";
  msg += "\n\nดูรายละเอียดและจำนวนที่แนะนำ: เปิดแอป → 📈 วางแผนสั่งซื้อ";
  return msg;
}
export async function planDigest(c, opts) {
  const o = opts || {};
  const set = await planSettings(c);
  if (!set.saved.alert && !o.force) return { ok: true, skipped: "off" };
  const monday = new Date(Date.now() + TZ_MS).getUTCDay() === 1;
  const out = {}, preview = {};
  for (const module of (o.modules || ["SQF", "MLM"])) {
    const p = await planCompute(c, module);
    const urgent = p.items.filter((x) => x.status === "late" || x.status === "now");
    const sig = urgent.map((x) => x.sku + ":" + x.status).sort().join("|");
    const key = "plan_sig_" + module;
    const last = await kvGet(c, key);
    if (!urgent.length) { if (last) await kvPut(c, key, "", 60 * 86400); out[module] = "none"; continue; }
    if (!o.force && last === sig && !monday) { out[module] = "same"; continue; }
    if (o.dry) { preview[module] = planMessage(module, p); out[module] = "preview"; continue; }
    const r = await tgSendRaw(c, planMessage(module, p), true);
    if (r && r.sent) await kvPut(c, key, sig, 60 * 86400);
    else if (r && r.reason !== "disabled") await sysLog(c, "telegram-error", "plan digest: " + (r && r.reason), "-", "failed");
    out[module] = r && r.sent ? "sent" : "not-sent: " + ((r && r.reason) || "");
  }
  return o.dry ? { ok: true, status: "success", result: out, preview } : { ok: true, status: "success", result: out };
}
/** action PLANDIGEST — คนกดส่งรายการที่ต้องสั่งเข้ากลุ่มเอง (manager ขึ้นไป) · send ไม่ใช่ true = ดูตัวอย่างข้อความ */
export async function planDigestNow(c, data, module) {
  const mods = (module === "SQF" || module === "MLM") ? [module] : ["SQF", "MLM"];
  const r = await planDigest(c, { force: true, modules: mods, dry: data.send !== true });
  if (data.send === true) await sysLog(c, "plan-digest", mods.join(",") + " → " + JSON.stringify(r.result), data.user || c.user || "-", "ok");
  return r;
}

export { STATUS_TEXT, STATUS_ICON, isoToThai };
