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
// คิดที่หลังบ้านที่เดียว — หน้าคอม มือถือ และข้อความสรุปเข้ากลุ่ม (Telegram / LINE) ใช้ผลชุดเดียวกัน ตัวเลขจึงตรงกันเสมอ
// หลักการ: แค่ "ชี้ให้เห็น" — ไม่สั่งซื้อเอง ไม่บล็อกการเบิก คนตัดสินใจเองทุกครั้ง
import { all, getCfg, cfgSet, kvGet, kvPut, nowIso, fmtTH, dayTH, thaiMidnightMs, todayThaiMidnightMs, tgSendRaw, sysLog, DAY_MS, TZ_MS, FACTORY_NAME } from "./lib.js";
import { lineConfig, lineSend, lineStatus } from "./line.js";
import { lastStockUpdate, idleDaysTH, staleDaysOf } from "./raw.js";
import { crGetStartupOverview } from "./cold.js";
import { notifySchedule, normSchedule, topicDue, describeSchedule, NOTIFY_TOPICS } from "./notify.js";

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
    staleDays: staleDaysOf(m),   // ⏰ เตือนเมื่อไม่มีการอัปเดตสต๊อกเกินกี่วัน (0 = ปิด)
  };
  const o = over || {};
  return {
    saved,
    use: {
      leadDays: clampNum(o.leadDays, 1, 180, saved.leadDays),
      safetyDays: clampNum(o.safetyDays, 0, 60, saved.safetyDays),
      coverDays: clampNum(o.coverDays, 1, 365, saved.coverDays),
      alert: saved.alert,
      staleDays: saved.staleDays,
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
    staleDays: clampNum(data.staleDays, 0, 365, cur.staleDays),
  };
  await cfgSet(c, "planLeadDays", next.leadDays);
  await cfgSet(c, "planSafetyDays", next.safetyDays);
  await cfgSet(c, "planCoverDays", next.coverDays);
  await cfgSet(c, "planAlert", next.alert ? "on" : "off");
  await cfgSet(c, "planStaleDays", next.staleDays);
  await sysLog(c, "plan-settings", "รอของ " + next.leadDays + " วัน · กันชน " + next.safetyDays + " วัน · สั่งให้พอ " + next.coverDays + " วัน · แจ้งเตือนเช้า " + (next.alert ? "เปิด" : "ปิด") +
    " · เตือนไม่อัปเดต " + (next.staleDays ? "เกิน " + next.staleDays + " วัน" : "ปิด"), data.user || c.user || "-", "ok");
  return { status: "success", ok: true, settings: next };
}

/** คำนวณแผนของโรงงานเดียว */
export async function planCompute(c, module, over) {
  const now = Date.now();
  const set = await planSettings(c, over);
  const S = set.use;
  const mats = await all(c, "SELECT sku, name, qty, unit, min, daily_usage, lead_days, moq, pack_size, rop_start, last_verified FROM materials WHERE module = ? AND discontinued = 0 ORDER BY seq, rowid", module);
  const lastUpd = await lastStockUpdate(c, module, mats);

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
  const summary = { late: 0, now: 0, soon: 0, ok: 0, nodata: 0, total: mats.length, stale: 0 };
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
    // ⏰ ไม่มีการอัปเดตสต๊อกเกินกำหนด — ยอดในระบบอาจไม่ตรงของจริง ตัวเลขข้างบนก็เชื่อได้น้อยลง
    const idleDays = idleDaysTH(lastUpd[sku], now);
    const stale = S.staleDays > 0 && (idleDays === null || idleDays > S.staleDays);
    if (stale) { summary.stale++; reasons.push(idleDays === null ? "ไม่เคยมีการบันทึกยอด — ช่วยนับยืนยัน" : "ไม่มีการอัปเดตสต๊อก " + idleDays + " วัน — ยอดอาจไม่ตรงของจริง ช่วยนับยืนยัน"); }
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
      lastUpdate: lastUpd[sku] ? dayTH(lastUpd[sku]) : "", idleDays, stale,
      topPurposes: s ? Object.keys(s.purposes).map((p) => ({ purpose: p, qty: r3(s.purposes[p]) })).sort((a, b) => b.qty - a.qty).slice(0, 3) : [],
    };
  });
  items.sort((a, b) => (STATUS_RANK[a.status] - STATUS_RANK[b.status]) ||
    ((a.daysCover === null ? 1e9 : a.daysCover) - (b.daysCover === null ? 1e9 : b.daysCover)) || a.name.localeCompare(b.name, "th"));
  return { status: "success", ok: true, module, today: dayTH(now), generatedAt: nowIso(), settings: S, saved: set.saved, summary, items };
}

/** action USAGEPLAN — หน้าจอส่ง leadDays/safetyDays/coverDays มาลองดูได้ (ไม่บันทึก) */
export const usagePlan = (c, data, module) => planCompute(c, module, data);

// ───────────── สรุปเข้ากลุ่ม Telegram + LINE ─────────────
// วัน / เวลา / หัวข้อ / แบบย่อ-ละเอียด / ส่งทุกครั้ง-เฉพาะตอนเปลี่ยน ตั้งแยกต่อช่องในหน้า ⚙️ ตั้งค่าการแจ้งเตือน (notify.js)
// โหมด "เฉพาะตอนเปลี่ยน" = จำ "ลายเซ็น" ของรายการที่ส่งล่าสุด แยกต่อหัวข้อ/โรงงาน/ช่อง — ไม่ส่งข้อความเดิมซ้ำทุกเช้าจนคนเลิกอ่าน
const LIST_MAX = { full: 20, short: 5 };   // แบบละเอียดแสดงได้ถึง 20 รายการ (ที่ต้องสั่ง 15 — บรรทัดยาวกว่า) · แบบย่อ 5 รายการแรก
const stamp = () => fmtTH(Date.now(), "dd/MM/yyyy HH:mm");
const more = (total, shown, unit) => total > shown ? "\n… และอีก " + (total - shown) + " " + (unit || "รายการ") : "";
const thShort = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "/" + m[2] + "/" + String(Number(m[1]) + 543).slice(2) : "-"; };

function planMessage(module, p, detail) {
  const urgent = p.items.filter((x) => x.status === "late" || x.status === "now");
  const head = "📈 วัตถุดิบที่ต้องสั่งซื้อ — " + (FACTORY_NAME[module] || module) + "\n" + stamp() + "\n" +
    "🔴 สั่งวันนี้ก็ไม่ทัน " + p.summary.late + "  •  🟠 ต้องสั่งวันนี้ " + p.summary.now + (p.summary.soon ? "  •  🟡 ใกล้ถึงเวลาสั่ง " + p.summary.soon : "");
  if (detail === "short") {
    const n = LIST_MAX.short;
    return head + "\n\n" + urgent.slice(0, n).map((x) => x.icon + " " + x.name + (x.suggestQty > 0 ? " — สั่ง " + fmtN(x.suggestQty) + " " + x.unit : "")).join("\n") + more(urgent.length, n);
  }
  const lines = urgent.slice(0, 15).map((x) => {
    const cover = x.daysCover === null ? "" : " · พอใช้ " + fmtN(x.daysCover) + " วัน";
    const sug = x.suggestQty > 0 ? "\n     → แนะนำสั่ง " + fmtN(x.suggestQty) + " " + x.unit : "";
    return x.icon + " " + x.name + " — เหลือ " + fmtN(x.qty) + " " + x.unit + cover + " (รอของ " + x.leadDays + " วัน)" + sug;
  });
  return head + "\n\n" + lines.join("\n") + more(urgent.length, 15) + "\n\nดูรายละเอียดและจำนวนที่แนะนำ: เปิดแอป → 📈 วางแผนสั่งซื้อ";
}

// ต่ำกว่าจุดสั่งซื้อ (Min) ที่คนตั้งไว้เอง — เรียงจากเหลือน้อยเทียบจุดสั่งซื้อมากสุดก่อน
function lowMessage(module, p, detail) {
  const low = p.items.filter((x) => x.belowMin).sort((a, b) => a.qty / a.min - b.qty / b.min);
  const n = LIST_MAX[detail] || LIST_MAX.full;
  const lines = low.slice(0, n).map((x) => "• " + x.name + " — เหลือ " + fmtN(x.qty) + " " + x.unit + (detail === "short" ? "" : " (จุดสั่งซื้อ " + fmtN(x.min) + ")"));
  let msg = "🟠 ต่ำกว่าจุดสั่งซื้อ — " + (FACTORY_NAME[module] || module) + "\n" + stamp() + " · " + low.length + " รายการ\n\n" + lines.join("\n") + more(low.length, n);
  if (detail !== "short") msg += "\n\nดูทั้งหมด: เปิดแอป → คลังวัตถุดิบ → กรอง 🟠 ต่ำกว่าจุดสั่งซื้อ";
  return msg;
}

function staleMessage(module, p, detail) {
  const list = p.items.filter((x) => x.stale).sort((a, b) => (b.idleDays === null ? 1e9 : b.idleDays) - (a.idleDays === null ? 1e9 : a.idleDays));
  const n = LIST_MAX[detail] || LIST_MAX.full;
  const lines = list.slice(0, n).map((x) => "• " + x.name + " — " + (x.idleDays === null ? "ไม่เคยมีการบันทึก" :
    detail === "short" ? x.idleDays + " วัน" : "ไม่อัปเดต " + x.idleDays + " วัน (ล่าสุด " + isoToThai(x.lastUpdate) + ")") +
    (detail === "short" ? "" : " · ในระบบ " + fmtN(x.qty) + " " + x.unit));
  let msg = "⏰ วัตถุดิบที่ไม่มีการอัปเดตสต๊อกเกิน " + p.settings.staleDays + " วัน — " + (FACTORY_NAME[module] || module) + "\n" +
    stamp() + " · " + list.length + " รายการ\n\n" + lines.join("\n") + more(list.length, n);
  if (detail !== "short") msg += "\n\nช่วยกันนับยืนยันยอด: เปิดแอป → เลือกรายการ → 📊 นับ (ยอดตรงอยู่แล้วก็กดบันทึกได้เลย)";
  return msg;
}

// ห้องเย็นนับเป็นล็อต (บาร์โค้ด + วันผลิต) — แต่ละล็อตต้องมีคนนับยืนยันเป็นระยะเหมือนวัตถุดิบ
function crStaleMessage(ov, detail) {
  const list = ov.staleLots || [];
  const n = LIST_MAX[detail] || LIST_MAX.full;
  const lines = list.slice(0, n).map((x) => "• " + x.ProductName + " (MFG " + thShort(x.MFG) + ") — " +
    (x.IdleDays === null ? "ไม่เคยมีการบันทึก" : (detail === "short" ? "" : "ไม่อัปเดต ") + x.IdleDays + " วัน") +
    (detail === "short" ? "" : " · เหลือ " + fmtN(x.Qty) + " " + (x.Unit || "")));
  let msg = "⏰ ล็อตที่ไม่มีการอัปเดตสต๊อกเกิน " + ov.staleDays + " วัน — " + FACTORY_NAME.COLDROOM + "\n" +
    stamp() + " · " + list.length + " ล็อต\n\n" + lines.join("\n") + more(list.length, n, "ล็อต");
  if (detail !== "short") msg += "\n\nช่วยกันนับยืนยันยอด: เปิดแอป → คลังสินค้าห้องเย็น → เลือกสินค้า → 📊 นับ ที่ล็อตนั้น";
  return msg;
}

// ใกล้หมดอายุ/หมดอายุ — วัตถุดิบ (ตามวันเตือนของแต่ละตัว) + ล็อตห้องเย็น (ตามเกณฑ์ของสินค้า) · หมดเกิน 30 วันแล้วไม่เตือนต่อ
async function expiryList(c, modules, crOv) {
  // นับเป็นวันปฏิทินไทย (expiryInfoTH ใน lib.js — ตัวเดียวกับสถานะที่ส่งให้หน้าจอ) ส่งตอนเช้าหรือตอนเย็นก็ได้ตัวเลขเดียวกัน
  const out = [];
  for (const mod of modules.filter((m) => m === "SQF" || m === "MLM")) {
    for (const m of await all(c, "SELECT sku, name, expiry_date, alert_days FROM materials WHERE module = ? AND discontinued = 0 ORDER BY seq, rowid", mod)) {
      const ex = expiryInfoTH(m.expiry_date);
      if (!ex) continue;
      const { days, y, mo, d } = ex;
      if (days > (Number(m.alert_days) || 7) || days < -30) continue;
      const name = String(m.name || "").trim(), sku = String(m.sku || "").trim();
      out.push({ mod, key: mod + ":" + (sku || name), name, sku, days,
                 exp: String(d).padStart(2, "0") + "/" + String(mo).padStart(2, "0") + "/" + (y + 543) });
    }
  }
  if (modules.indexOf("COLDROOM") >= 0) {
    const ov = await crOv();
    for (const l of (ov.expiredLots || []).concat(ov.expiringLots || [])) {
      if (l.ExpireDays < -30) continue;
      out.push({ mod: "COLDROOM", key: "CR:" + l.Barcode + "|" + l.MFG, name: l.ProductName + " (MFG " + thShort(l.MFG) + ")", sku: "", days: l.ExpireDays, exp: thShort(l.EXP) });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}
function expiryMessage(list, detail) {
  const n = LIST_MAX[detail] || LIST_MAX.full;
  const tag = { SQF: "🏭SQF", MLM: "🏭MLM", COLDROOM: "❄️" };
  const expired = list.filter((x) => x.days < 0).length, near = list.length - expired;
  const lines = list.slice(0, n).map((x) => (x.days < 0 ? "❌ " : "⚠️ ") + tag[x.mod] + " " + x.name +
    (detail === "short" ? "" : (x.sku ? " (" + x.sku + ")" : "") + "  •  หมดอายุ " + x.exp) +
    "  (" + (x.days < 0 ? "เกินมาแล้ว " + -x.days + " วัน" : x.days === 0 ? "หมดวันนี้" : "เหลือ " + x.days + " วัน") + ")");
  let msg = "⏰ แจ้งเตือนวันหมดอายุ\n" + stamp() + "\nพบ " + list.length + " รายการ" +
    (expired ? "  •  ❌ หมดอายุแล้ว " + expired : "") + (near ? "  •  ⚠️ ใกล้หมด " + near : "") + "\n\n" + lines.join("\n") + more(list.length, n);
  if (detail !== "short") msg += "\n\nกรุณาตรวจสอบและจัดการโดยด่วน";
  return msg;
}

/**
 * LINE ส่งได้ครั้งละไม่เกิน 5 กล่อง (กล่องละ ≤ 5,000 ตัวอักษร) และโควตานับ "ครั้งละ 1 ต่อสมาชิก" ไม่ว่ากี่กล่อง
 * → ไม่เกิน 5 ข้อความ = กล่องละข้อความ (แบบเดิม) · เกิน = รวมข้อความต่อกันในกล่องเดียวกันจนเต็ม
 */
export function packTexts(msgs, max, limit) {
  max = max || 5; limit = limit || 4900;
  const NOTE = "\n… (ข้อความยาวเกิน ตัดไว้แค่นี้)";
  const cut = (t) => t.length > limit ? t.slice(0, limit - NOTE.length) + NOTE : t;
  if (msgs.length <= max) return msgs.map(cut);
  const SEP = "\n\n━━━━━━━━━━\n\n", out = [];
  for (const m of msgs.map(cut)) {
    const i = out.length - 1;
    if (i >= 0 && out[i].length + SEP.length + m.length <= limit) out[i] += SEP + m;
    else out.push(m);
  }
  if (out.length > max) out.splice(max - 1, out.length, cut(out.slice(max - 1).join(SEP)));
  return out;
}

const SIG_PREFIX = { plan: "plan_sig_", low: "low_sig_", stale: "stale_sig_", expiry: "exp_sig_" };
const sigKey = (topic, module, ch) => SIG_PREFIX[topic] + (ch === "line" ? "line_" : "") + module;   // คีย์ plan_/stale_ เดิมใช้ต่อได้

/**
 * ส่งสรุปเข้ากลุ่ม (Telegram + LINE)
 *   งานตามเวลา: channels = ช่องที่ถึงเวลา · ส่งหัวข้อที่ตั้งไว้ของช่องนั้น ตามรูปแบบที่ตั้งไว้
 *   ปุ่มในหน้าจอ: what = "plan" | "stale" (ส่งเรื่องเดียวทุกช่องที่เปิด) + force = ไม่สนว่าเคยส่งรายการเดิมไปแล้ว
 *   dry = ดูตัวอย่างข้อความ ไม่ส่ง · schedule = ใช้ค่าที่หน้าตั้งค่ากำลังแก้ (ยังไม่บันทึก) มาลองดู
 */
export async function planDigest(c, opts) {
  const o = opts || {};
  const manual = o.what === "plan" || o.what === "stale";
  const set = await planSettings(c);
  const sch = o.schedule || await notifySchedule(c);
  const channels = (o.channels || ["tg", "line"]).filter((ch) => sch[ch]);
  const dow = new Date(Date.now() + TZ_MS).getUTCDay();
  const topicsFor = (ch) => manual ? [o.what] : NOTIFY_TOPICS.filter((t) => sch[ch].topics[t]);
  const want = new Set();
  for (const ch of channels) if (sch[ch].on || o.dry) topicsFor(ch).forEach((t) => want.add(t));
  if (set.saved.staleDays <= 0) want.delete("stale");   // ตั้ง 0 วัน = ปิดเรื่องไม่อัปเดตทั้งระบบ
  const modules = o.modules || ["SQF", "MLM", "COLDROOM"];

  // คิดข้อมูลครั้งเดียวต่อโรงงาน ใช้ร่วมทุกช่อง (ข้อความสร้างตอนส่ง เพราะแต่ละช่องเลือกย่อ/ละเอียดต่างกันได้)
  const plans = {};
  const planOf = async (m) => plans[m] || (plans[m] = await planCompute(c, m));
  let ov = null;
  const crOv = async () => ov || (ov = await crGetStartupOverview(c, {}));
  const entries = [];
  for (const topic of NOTIFY_TOPICS) {
    if (!want.has(topic)) continue;
    if (topic === "expiry") {
      const list = await expiryList(c, modules, crOv);
      entries.push({ topic, module: "ALL", has: list.length > 0, sig: list.map((x) => x.key + ":" + x.days).sort().join("|"), msg: (d) => expiryMessage(list, d) });
      continue;
    }
    for (const module of modules) {
      if (module === "COLDROOM") {   // ห้องเย็นไม่มีแผนสั่งซื้อ / จุดสั่งซื้อ — มีแค่เรื่องไม่อัปเดต
        if (topic !== "stale") continue;
        const v = await crOv(), sl = v.staleLots || [];
        entries.push({ topic, module, has: sl.length > 0, sig: sl.map((x) => x.Barcode + "|" + x.MFG).sort().join("|"), msg: (d) => crStaleMessage(v, d) });
        continue;
      }
      const p = await planOf(module);
      if (topic === "plan") {
        const u = p.items.filter((x) => x.status === "late" || x.status === "now");
        entries.push({ topic, module, has: u.length > 0, sig: u.map((x) => x.sku + ":" + x.status).sort().join("|"), msg: (d) => planMessage(module, p, d) });
      } else if (topic === "low") {
        const l = p.items.filter((x) => x.belowMin);
        entries.push({ topic, module, has: l.length > 0, sig: l.map((x) => x.sku).sort().join("|"), msg: (d) => lowMessage(module, p, d) });
      } else if (topic === "stale") {
        const s = p.items.filter((x) => x.stale);
        entries.push({ topic, module, has: s.length > 0, sig: s.map((x) => x.sku).sort().join("|"), msg: (d) => staleMessage(module, p, d) });
      }
    }
  }

  // ผลของ Telegram ใช้คีย์ = ชื่อโรงงาน (หน้าจอเดิมอ่านแบบนี้) · งานตามเวลาที่มีหลายหัวข้อ ใช้ <โรงงาน>_<หัวข้อ> / expiry
  const keyOf = (e) => manual || e.topic === "plan" ? e.module : e.topic === "expiry" ? "expiry" : e.module + "_" + e.topic;
  const L = await lineConfig(c);
  const lineReady = !!L.token && L.groups.some((g) => g.on);
  const out = {}, preview = {}, previewBy = {};
  for (const ch of channels) {
    const s = sch[ch], mine = topicsFor(ch);
    const lineMsgs = [], lineSigs = [];
    previewBy[ch] = [];
    for (const e of entries) {
      if (mine.indexOf(e.topic) < 0) continue;
      const k = keyOf(e), sk = sigKey(e.topic, e.module, ch);
      if (!e.has) {   // ไม่มีรายการแล้ว → ลืมลายเซ็น รอบหน้าที่มีรายการจะได้ส่งทันที
        if (!o.dry && await kvGet(c, sk)) await kvPut(c, sk, "", 60 * 86400);
        if (ch === "tg") out[k] = "none";
        continue;
      }
      const msg = e.msg(s.detail);
      if (o.dry) { previewBy[ch].push(msg); if (ch === "tg") { preview[k] = msg; out[k] = "preview"; } continue; }
      if (!s.on) { if (ch === "tg") out[k] = "off"; continue; }
      if (!topicDue(s, o.force, await kvGet(c, sk), e.sig, dow)) { if (ch === "tg") out[k] = "same"; continue; }
      if (ch === "tg") {
        const r = await tgSendRaw(c, msg, true);
        if (r && r.sent) await kvPut(c, sk, e.sig, 60 * 86400);
        else if (r && r.reason !== "disabled") await sysLog(c, "telegram-error", e.topic + " digest: " + (r && r.reason), "-", "failed");
        out[k] = r && r.sent ? "sent" : "not-sent: " + ((r && r.reason) || "");
      } else { lineMsgs.push(msg); lineSigs.push([sk, e.sig]); }
    }
    if (ch !== "line") continue;
    // LINE: ทุกข้อความรวมเป็นคำขอเดียว — โควตานับครั้งเดียวต่อสมาชิก ไม่ว่ากี่กล่อง
    if (o.dry) {
      out.line = !L.token ? "not-configured" : !lineReady ? "no-group" : !s.on ? "off" : "preview";
      previewBy.line = packTexts(previewBy.line);
      const st = lineReady && previewBy.line.length ? await lineStatus(c) : null;
      preview.line = st ? { groups: st.groups.filter((g) => g.on).map((g) => ({ name: g.name, members: g.members })), quota: st.quota } : null;
    } else if (!L.token) out.line = "not-configured";
    else if (!lineReady) out.line = "no-group";
    else if (!s.on) out.line = "off";
    else if (!lineMsgs.length) out.line = "same";
    else {
      const r = await lineSend(c, packTexts(lineMsgs), { what: manual ? o.what : "schedule" });
      if (r.sent) for (const [k, sg] of lineSigs) await kvPut(c, k, sg, 60 * 86400);
      out.line = r.sent ? (r.reason ? "partial: " + r.reason : "sent") : "not-sent: " + (r.reason || "");
    }
  }
  return o.dry ? { ok: true, status: "success", result: out, preview, previewBy } : { ok: true, status: "success", result: out };
}
/** action PLANDIGEST — คนกดส่งรายการที่ต้องสั่งเข้ากลุ่มเอง (Telegram + LINE · manager ขึ้นไป) · send ไม่ใช่ true = ดูตัวอย่างข้อความ */
export async function planDigestNow(c, data, module) {
  const mods = (module === "SQF" || module === "MLM") ? [module] : ["SQF", "MLM"];
  const what = data.what === "stale" ? "stale" : "plan";   // ปุ่มในหน้าจอส่งทีละเรื่อง
  const r = await planDigest(c, { force: true, modules: mods, dry: data.send !== true, what });
  if (data.send === true) await sysLog(c, what === "stale" ? "stale-digest" : "plan-digest", mods.join(",") + " → " + JSON.stringify(r.result), data.user || c.user || "-", "ok");
  return r;
}
/** action NOTIFYPREVIEW (admin) — ตัวอย่างข้อความของช่องเดียว ด้วยค่าที่หน้าตั้งค่ากำลังแก้ (ยังไม่บันทึก) */
export async function notifyPreview(c, p) {
  const ch = p && p.channel === "line" ? "line" : "tg";
  const cur = await notifySchedule(c);
  const sch = { tg: cur.tg, line: cur.line };
  if (p && p[ch] && typeof p[ch] === "object") sch[ch] = normSchedule(p[ch], cur[ch]);
  const r = await planDigest(c, { dry: true, channels: [ch], schedule: sch });
  return { ok: true, status: "success", channel: ch, texts: r.previewBy[ch] || [], line: ch === "line" ? { state: r.result.line, target: r.preview.line } : null,
           text: describeSchedule(sch[ch]) };
}

export { STATUS_TEXT, STATUS_ICON, isoToThai };
