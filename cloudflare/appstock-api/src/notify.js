// 🗓️ กำหนดการส่งสรุปเข้ากลุ่ม — เลือกวัน / เวลา / หัวข้อ / แบบย่อ-ละเอียด / ส่งทุกครั้ง-เฉพาะตอนเปลี่ยน
// เจ้าของสั่ง (2026-10-06): "การแจ้งเตือนสต๊อกทำให้ กำหนด วันและรูปแบบการเตือนได้" และให้ตั้ง Telegram กับ LINE แยกกัน
//   (LINE นับโควตาตามจำนวนสมาชิกในกลุ่ม — มักอยากให้ส่งน้อยวันกว่า Telegram ที่ส่งฟรี)
//
// เก็บเป็น JSON ในตาราง config แถว notifySchedule = { tg: {...}, line: {...} }
//   on      ส่งสรุปเข้าช่องนี้ไหม (ทั้งตามเวลา และปุ่มส่งในหน้าวางแผนสั่งซื้อ)
//   days    วันที่ส่ง 0 = อาทิตย์ … 6 = เสาร์ (เวลาไทย) · ว่าง = ไม่ส่งตามเวลา (ยังกดส่งเองได้)
//   hour    ชั่วโมงที่ส่ง 0–23 เวลาไทย (cron ทุก 5 นาที → ส่งภายในชั่วโมงนั้น ครั้งเดียวต่อวัน)
//   topics  หัวข้อที่ส่ง { plan ที่ต้องสั่งซื้อ · low ต่ำกว่าจุดสั่งซื้อ · stale ไม่อัปเดตเกินกำหนด · expiry ใกล้หมดอายุ/หมดอายุ }
//   detail  full = ทุกรายการพร้อมตัวเลข (แบบเดิม) · short = จำนวน + 5 รายการแรก
//   when    change = เฉพาะเมื่อรายการเปลี่ยนจากที่เคยแจ้ง (ทวนซ้ำ "วันแรกของสัปดาห์ที่เลือก") · always = ทุกวันที่เลือก
// ยังไม่เคยบันทึก → ค่าเริ่มต้นเท่าพฤติกรรมเดิมก่อนมีหน้านี้ (08:00 ทุกวัน · เฉพาะตอนเปลี่ยน + ทวนวันจันทร์)
import { getCfg, cfgSet, sysLog } from "./lib.js";

export const NOTIFY_TOPICS = ["plan", "low", "stale", "expiry"];
export const TOPIC_TEXT = { plan: "ที่ต้องสั่งซื้อ", low: "ต่ำกว่าจุดสั่งซื้อ", stale: "ไม่อัปเดตเกินกำหนด", expiry: "ใกล้หมดอายุ" };
const DAY_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const DAY_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];   // นับสัปดาห์เริ่มวันจันทร์
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** ค่าเริ่มต้น = พฤติกรรมเดิม (อ่านค่าเก่า planAlert / lineDigestMode มาตั้งให้ ไม่ให้ใครเจอของเปลี่ยนเองหลังอัปเดต) */
function defaults(m) {
  const planOn = String(m.planAlert || "on").toLowerCase() !== "off";
  const lm = String(m.lineDigestMode || "change");
  return {
    tg: { on: true, days: ALL_DAYS.slice(), hour: 8, topics: { plan: planOn, low: false, stale: true, expiry: true }, detail: "full", when: "change" },
    line: { on: lm !== "off", days: lm === "monday" ? [1] : ALL_DAYS.slice(), hour: 8,
            topics: { plan: planOn, low: false, stale: true, expiry: false }, detail: "full", when: lm === "monday" ? "always" : "change" },
  };
}

const intIn = (v, lo, hi) => {
  if (v === "" || v === null || v === undefined || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

/** ทำให้ค่าที่หน้าจอส่งมา (หรือที่เก็บไว้) อยู่ในรูปที่ถูกต้องเสมอ — ช่องที่ผิดใช้ค่าของ def แทน */
export function normSchedule(raw, def) {
  const r = raw && typeof raw === "object" ? raw : {};
  const days = Array.isArray(r.days)
    ? [...new Set(r.days.map((d) => intIn(d, 0, 6)).filter((d) => d !== null))].sort((a, b) => a - b)
    : def.days.slice();
  const h = intIn(r.hour, 0, 23);
  const topics = {};
  for (const t of NOTIFY_TOPICS) topics[t] = r.topics && typeof r.topics[t] === "boolean" ? r.topics[t] : !!def.topics[t];
  return {
    on: typeof r.on === "boolean" ? r.on : def.on, days, hour: h === null ? def.hour : h, topics,
    detail: r.detail === "short" || r.detail === "full" ? r.detail : def.detail,
    when: r.when === "always" || r.when === "change" ? r.when : def.when,
  };
}

export async function notifySchedule(c) {
  const m = await getCfg(c);
  const def = defaults(m);
  let saved = null;
  try { saved = JSON.parse(m.notifySchedule || "null"); } catch (e) { saved = null; }
  if (!saved || typeof saved !== "object") saved = null;
  return { tg: normSchedule(saved && saved.tg, def.tg), line: normSchedule(saved && saved.line, def.line), saved: !!saved };
}

/** วันทวนซ้ำของโหมด "เฉพาะตอนเปลี่ยน" = วันแรกของสัปดาห์ที่เลือก (ทุกวัน → จันทร์ เหมือนเดิม) */
export function reminderDow(s) {
  const d = WEEK_ORDER.find((x) => s.days.indexOf(x) >= 0);
  return d === undefined ? 1 : d;
}

/** หัวข้อหนึ่งถึงรอบส่งไหม — force = คนกดส่งเอง (ส่งเสมอ) */
export function topicDue(s, force, lastSig, sig, dow) {
  if (force) return true;
  if (s.when === "always") return true;
  return lastSig !== sig || dow === reminderDow(s);
}

/** ช่องไหนถึงเวลาส่งตามกำหนด (งานตามเวลาเรียกทุก 5 นาที) */
export function channelsDue(sch, dow, hh) {
  return ["tg", "line"].filter((ch) => sch[ch] && sch[ch].on && sch[ch].days.indexOf(dow) >= 0 && sch[ch].hour === hh);
}

export function daysText(days) {
  const k = days.join(",");
  if (days.length === 7) return "ทุกวัน";
  if (!days.length) return "ไม่ส่งตามเวลา";
  if (k === "1,2,3,4,5") return "จ–ศ";
  if (k === "1,2,3,4,5,6") return "จ–ส";
  if (k === "0,6") return "ส–อา";
  return WEEK_ORDER.filter((d) => days.indexOf(d) >= 0).map((d) => DAY_TH[d]).join(" ");
}
export const hourText = (h) => String(h).padStart(2, "0") + ":00";

/** อธิบายเป็นภาษาคน — ใช้ในข้อความตอบตอนบอทเข้ากลุ่ม / บันทึกระบบ / หน้าวางแผนสั่งซื้อ */
export function describeSchedule(s) {
  if (!s.on) return "ปิดอยู่";
  const tp = NOTIFY_TOPICS.filter((t) => s.topics[t]).map((t) => TOPIC_TEXT[t]);
  if (!s.days.length) return "ไม่ส่งตามเวลา (กดส่งเองในหน้าวางแผนสั่งซื้อ)";
  return daysText(s.days) + " " + hourText(s.hour) + " · " + (tp.length ? tp.join(" / ") : "ยังไม่ได้เลือกหัวข้อ") + " · " +
    (s.when === "always" ? "ส่งทุกครั้ง" : "เฉพาะเมื่อรายการเปลี่ยน (ทวนทุกวัน" + DAY_FULL[reminderDow(s)] + ")") + " · " + (s.detail === "short" ? "แบบย่อ" : "แบบละเอียด");
}

/** action NOTIFYGET — ค่าปัจจุบัน + คำอธิบาย (หน้าตั้งค่า / หน้าวางแผนสั่งซื้อ) */
export async function notifyGet(c) {
  const s = await notifySchedule(c);
  return { ok: true, status: "success", schedule: { tg: s.tg, line: s.line }, saved: s.saved,
           text: { tg: describeSchedule(s.tg), line: describeSchedule(s.line) } };
}

/** action NOTIFYSET (admin) — ส่งมาช่องเดียวหรือทั้งสองช่องก็ได้ ช่องที่ไม่ได้ส่งมาคงค่าเดิม */
export async function notifySet(c, p) {
  if (!p || (typeof p.tg !== "object" && typeof p.line !== "object"))
    return { ok: false, status: "error", message: "ไม่มีค่าที่จะบันทึก (tg / line)" };
  const cur = await notifySchedule(c);
  const next = {
    tg: p.tg && typeof p.tg === "object" ? normSchedule(p.tg, cur.tg) : cur.tg,
    line: p.line && typeof p.line === "object" ? normSchedule(p.line, cur.line) : cur.line,
  };
  await cfgSet(c, "notifySchedule", JSON.stringify(next));
  await sysLog(c, "notify-settings", "Telegram: " + describeSchedule(next.tg) + " | LINE: " + describeSchedule(next.line), p.user || c.user || "-", "ok");
  return { ok: true, status: "success", schedule: next, text: { tg: describeSchedule(next.tg), line: describeSchedule(next.line) } };
}
