// 💚 LINE กลุ่ม — ส่งสรุปวัตถุดิบที่ต้องสั่งซื้อเข้ากลุ่ม LINE (คู่กับ Telegram)
//
// ⚠️ LINE Notify ปิดบริการไปแล้ว (31 มี.ค. 2568) — ต้องใช้ LINE Official Account + Messaging API แทน
//   · เจ้าของสร้าง OA เอง แล้วเอา Channel access token + Channel secret มาใส่ในแอป (เก็บในตาราง config — ไม่อยู่ในโค้ด)
//   · ตั้ง Webhook URL ของ OA เป็น <ที่อยู่ Worker>/line-webhook แล้วเชิญบอทเข้ากลุ่ม
//     → LINE ส่งเหตุการณ์ "join" มา เราจำรหัสกลุ่มไว้ให้เอง (ไม่ต้องหารหัสกลุ่มด้วยมือ) และตอบกลับในกลุ่ม (ตอบกลับไม่เสียโควตา)
//
// 💰 โควตา: LINE นับ "ต่อสมาชิกในกลุ่ม" — ส่ง 1 ครั้งเข้ากลุ่ม 10 คน = ใช้ 10 ข้อความ (แพ็กเกจฟรีไทย 300 ข้อความ/เดือน)
//   จึงส่งเข้า LINE เฉพาะสรุปที่ต้องสั่ง (ไม่ส่งทุกการเบิก/รับ) และรวม SQF + MLM ไว้ในคำขอเดียว (หลายกล่องข้อความนับเป็นครั้งเดียว)
//
// ความปลอดภัย
//   · ทุกคำขอจาก LINE ตรวจลายเซ็น (HMAC-SHA256 ด้วย Channel secret) — ปลอมไม่ได้
//   · กลุ่มแรกที่เชิญบอทเปิดส่งให้เลย · กลุ่มถัดไปต้องให้แอดมินติ๊กเปิดในแอป (กันคนนอกที่รู้ ID บอทดึงข้อมูลสต๊อกไปกลุ่มตัวเอง)
//   · token/secret ไม่ถูกส่งกลับไปที่หน้าจอเลย — หน้าจอเห็นแค่ "ตั้งไว้แล้ว ••••ท้าย 4 ตัว"
import { getCfg, cfgGet, cfgSet, kvGet, kvPut, nowIso, maskNames, sysLog, uuid } from "./lib.js";

const LINE_MODES = ["change", "monday", "off"];   // ทุกครั้งที่รายการเปลี่ยน / เฉพาะวันจันทร์ / ไม่ส่ง
const apiBase = (c) => String(c.env.LINE_API || "https://api.line.me").replace(/\/+$/, "");
// เครื่องทดสอบ (มี TG_DISABLED) ห้ามยิงหา LINE จริง — ต้องชี้ LINE_API ไปที่ตัวจำลองเท่านั้น
const lineBlocked = (c) => !!(c.env.TG_DISABLED && !c.env.LINE_API);
const tail4 = (s) => (s ? "••••" + String(s).slice(-4) : "");

export async function lineConfig(c) {
  const m = await getCfg(c);
  let groups = [];
  try { groups = JSON.parse(m.lineGroups || "[]"); } catch (e) { groups = []; }
  if (!Array.isArray(groups)) groups = [];
  const mode = LINE_MODES.indexOf(m.lineDigestMode) >= 0 ? m.lineDigestMode : "change";
  return { token: String(m.lineChannelToken || "").trim(), secret: String(m.lineChannelSecret || "").trim(),
           botName: String(m.lineBotName || ""), groups, mode };
}
async function saveGroups(c, groups) { await cfgSet(c, "lineGroups", JSON.stringify(groups)); }

/** เรียก LINE API — คืน { ok, status, json } ไม่โยน error */
async function lineApi(c, token, method, path, body, extraHeaders) {
  if (lineBlocked(c)) return { ok: false, status: 0, json: { message: "disabled" } };
  try {
    const resp = await fetch(apiBase(c) + path, {
      method, headers: Object.assign({ authorization: "Bearer " + token }, body ? { "content-type": "application/json" } : {}, extraHeaders || {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = {};
    try { json = await resp.json(); } catch (e) {}
    return { ok: resp.ok, status: resp.status, json };
  } catch (e) { return { ok: false, status: 0, json: { message: String((e && e.message) || e) } }; }
}
function reasonTH(r) {
  if (!r) return "ไม่ได้รับคำตอบ";
  const m = String((r.json && r.json.message) || "");
  if (m === "disabled") return "disabled";
  if (r.status === 401) return "Channel access token ใช้ไม่ได้ (หมดอายุหรือถูกยกเลิก)";
  if (r.status === 429) return "โควตา LINE เดือนนี้หมดแล้ว (แพ็กเกจฟรี 300 ข้อความ/เดือน นับตามจำนวนสมาชิกในกลุ่ม)";
  if (r.status === 400 && /not found|invalid/i.test(m)) return "ส่งเข้ากลุ่มไม่ได้ — บอทอาจถูกเอาออกจากกลุ่มแล้ว";
  if (r.status === 403) return "บัญชี LINE ไม่มีสิทธิ์ส่งแบบนี้ (ตรวจแพ็กเกจของ Official Account)";
  return (r.status ? "HTTP " + r.status + " " : "") + m;
}

/** ส่งข้อความ (สูงสุด 5 กล่อง) เข้าทุกกลุ่มที่เปิดไว้ — นับโควตาครั้งเดียวต่อสมาชิก ไม่ว่ากี่กล่อง */
export async function lineSend(c, texts, opts) {
  const o = opts || {};
  const L = await lineConfig(c);
  const targets = L.groups.filter((g) => g.on);
  if (!L.token) return { sent: 0, reason: "not-configured" };
  if (!targets.length) return { sent: 0, reason: "no-group" };
  const messages = [];
  for (const t of texts.slice(0, 5)) messages.push({ type: "text", text: (await maskNames(c, String(t))).slice(0, 4900) });
  let sent = 0;
  const errors = [];
  for (const g of targets) {
    const r = await lineApi(c, L.token, "POST", "/v2/bot/message/push", { to: g.id, messages }, { "x-line-retry-key": uuid() });
    if (r.ok) sent++; else errors.push((g.name || g.id) + ": " + reasonTH(r));
  }
  const rec = { at: nowIso(), sent: sent > 0, groups: sent, of: targets.length, reason: errors.join(" · "), what: o.what || "" };
  try { await kvPut(c, "line_last", JSON.stringify(rec), 30 * 86400); } catch (e) {}
  if (errors.length && !/^disabled$/.test(errors[0].split(": ").pop())) await sysLog(c, "line-error", errors.join(" · "), c.user || "-", "failed");
  return { sent, of: targets.length, reason: errors.join(" · ") };
}

// ───────────── Webhook (LINE → เรา) ─────────────
async function hmacB64(secret, bytes) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes));
  let s = "";
  for (let i = 0; i < mac.length; i++) s += String.fromCharCode(mac[i]);
  return btoa(s);
}
function sameText(a, b) {
  a = String(a || ""); b = String(b || "");
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function groupInfo(c, token, src) {
  if (src.type === "group") {
    const s = await lineApi(c, token, "GET", "/v2/bot/group/" + encodeURIComponent(src.groupId) + "/summary");
    return { id: src.groupId, type: "group", name: (s.ok && s.json.groupName) || "กลุ่ม LINE" };
  }
  return { id: src.roomId, type: "room", name: "แชทหลายคน" };
}
async function reply(c, token, replyToken, text) {
  if (!replyToken) return;
  await lineApi(c, token, "POST", "/v2/bot/message/reply", { replyToken, messages: [{ type: "text", text }] });
}

/** POST /line-webhook — คืน Response เอง (ไม่ใช่รูปแบบ JSON ของแอป) */
export async function lineWebhook(c, request) {
  const L = await lineConfig(c);
  const buf = await request.arrayBuffer();
  if (!L.secret) return new Response("LINE ยังไม่ได้ตั้ง Channel secret ในแอป", { status: 401 });
  const ok = sameText(await hmacB64(L.secret, buf), request.headers.get("x-line-signature"));
  if (!ok) return new Response("bad signature", { status: 401 });
  let body = {};
  try { body = JSON.parse(new TextDecoder().decode(buf)); } catch (e) { return new Response("bad json", { status: 400 }); }
  const job = (async () => {
    for (const ev of (Array.isArray(body.events) ? body.events : [])) {
      const src = ev.source || {};
      if (src.type !== "group" && src.type !== "room") continue;
      const id = src.groupId || src.roomId;
      if (!id) continue;
      const cur = await lineConfig(c);   // อ่านใหม่ทุกเหตุการณ์ — กันเขียนทับกันเมื่อมีหลายเหตุการณ์ในคำขอเดียว
      if (ev.type === "join") {
        const info = await groupInfo(c, cur.token, src);
        const firstOn = !cur.groups.some((g) => g.on);
        const exists = cur.groups.find((g) => g.id === id);
        if (exists) { exists.name = info.name; exists.left = false; }
        else cur.groups.push({ id, type: info.type, name: info.name, on: firstOn, at: nowIso() });
        await saveGroups(c, cur.groups);
        const on = exists ? exists.on : firstOn;
        await sysLog(c, "line-join", info.name + (on ? " (เปิดส่งแล้ว)" : " (รอแอดมินเปิด)"), "-", "ok");
        await reply(c, cur.token, ev.replyToken, on
          ? "✅ เชื่อมกลุ่มนี้กับระบบสต๊อกแล้ว\nทุกเช้า 08:00 จะส่งสรุปวัตถุดิบที่ต้องสั่งซื้อ และรายการที่ไม่มีการอัปเดตสต๊อกเกินกำหนด (เฉพาะวันที่รายการเปลี่ยน และทุกวันจันทร์)"
          : "👋 บอทเข้ากลุ่มแล้ว แต่ยังไม่ได้เปิดส่งข้อความ\nให้แอดมินเปิดในแอป: ⚙️ ตั้งค่าการแจ้งเตือน → LINE → ติ๊กกลุ่มนี้");
      } else if (ev.type === "leave") {
        const left = cur.groups.filter((g) => g.id !== id);
        if (left.length !== cur.groups.length) {
          await saveGroups(c, left);
          await sysLog(c, "line-leave", id, "-", "ok");
        }
      }
    }
  })();
  if (c.ctx && c.ctx.waitUntil) c.ctx.waitUntil(job.catch(() => {})); else await job;
  return new Response("ok", { status: 200 });
}

// ───────────── หน้าตั้งค่า (admin) ─────────────
/** action LINESTATUS — สถานะทั้งหมดสำหรับหน้าตั้งค่า (ไม่มี token/secret ตัวจริง) */
export async function lineStatus(c) {
  const L = await lineConfig(c);
  const out = { ok: true, status: "success", tokenSet: !!L.token, tokenTail: tail4(L.token), secretSet: !!L.secret, secretTail: tail4(L.secret),
                botName: L.botName, mode: L.mode, groups: [], quota: null, last: null, webhookPath: "/line-webhook" };
  try { const v = await kvGet(c, "line_last"); if (v) out.last = JSON.parse(v); } catch (e) {}
  if (!L.token) { out.groups = L.groups.map((g) => ({ id: g.id, name: g.name, on: !!g.on, members: null })); return out; }
  const [q, used] = await Promise.all([
    lineApi(c, L.token, "GET", "/v2/bot/message/quota"),
    lineApi(c, L.token, "GET", "/v2/bot/message/quota/consumption"),
  ]);
  if (q.ok) out.quota = { limited: q.json.type === "limited", limit: Number(q.json.value) || 0, used: used.ok ? Number(used.json.totalUsage) || 0 : null };
  else out.tokenProblem = reasonTH(q);
  out.groups = await Promise.all(L.groups.map(async (g) => {
    const r = await lineApi(c, L.token, "GET", "/v2/bot/" + (g.type === "room" ? "room/" : "group/") + encodeURIComponent(g.id) + "/members/count");
    return { id: g.id, name: g.name, on: !!g.on, members: r.ok ? Number(r.json.count) || 0 : null };
  }));
  return out;
}

/** action LINESAVE — ช่อง token/secret เว้นว่าง = ใช้ค่าเดิม · clear: true = ลบการตั้งค่า LINE ทั้งหมด */
export async function lineSave(c, p) {
  if (p.clear === true) {
    for (const k of ["lineChannelToken", "lineChannelSecret", "lineBotName", "lineGroups", "lineDigestMode"]) await cfgSet(c, k, "");
    await kvPut(c, "line_last", "", 1);
    await sysLog(c, "line-settings", "ลบการตั้งค่า LINE", p.user || c.user || "-", "ok");
    return { ok: true, status: "success" };
  }
  const L = await lineConfig(c);
  const token = String(p.token || "").trim(), secret = String(p.secret || "").trim();
  if (token) {
    if (lineBlocked(c)) return { ok: false, status: "error", message: "เครื่องทดสอบ: ตั้ง LINE_API ไปที่ตัวจำลองก่อน" };
    const me = await lineApi(c, token, "GET", "/v2/bot/info");
    if (!me.ok) return { ok: false, status: "error", message: "ตรวจ Channel access token ไม่ผ่าน: " + reasonTH(me) };
    await cfgSet(c, "lineChannelToken", token);
    await cfgSet(c, "lineBotName", String(me.json.displayName || "") + (me.json.basicId ? " (" + me.json.basicId + ")" : ""));
  }
  if (secret) {
    if (!/^[0-9a-f]{32}$/i.test(secret)) return { ok: false, status: "error", message: "Channel secret ต้องเป็นตัวอักษร 0-9 a-f ยาว 32 ตัว — คัดลอกจากแท็บ Basic settings" };
    await cfgSet(c, "lineChannelSecret", secret);
  }
  if (p.mode !== undefined) {
    if (LINE_MODES.indexOf(p.mode) < 0) return { ok: false, status: "error", message: "รูปแบบการส่งไม่ถูกต้อง" };
    await cfgSet(c, "lineDigestMode", p.mode);
  }
  if (Array.isArray(p.groupsOn)) {
    const on = p.groupsOn.map(String);
    await saveGroups(c, L.groups.map((g) => Object.assign({}, g, { on: on.indexOf(g.id) >= 0 })));
  }
  await sysLog(c, "line-settings", [token ? "token ใหม่" : "", secret ? "secret ใหม่" : "", p.mode ? "ส่ง: " + p.mode : "",
    Array.isArray(p.groupsOn) ? "เปิด " + p.groupsOn.length + " กลุ่ม" : ""].filter(Boolean).join(" · "), p.user || c.user || "-", "ok");
  return { ok: true, status: "success", botName: await cfgGet(c, "lineBotName") };
}

/** action LINETEST — ส่งข้อความทดสอบเข้ากลุ่มที่เปิดไว้ (ใช้โควตาเท่าจำนวนสมาชิก) */
export async function lineTest(c, p) {
  const r = await lineSend(c, ["✅ ทดสอบส่งจากระบบสต๊อก\nถ้าเห็นข้อความนี้ = สรุปวัตถุดิบที่ต้องสั่งซื้อจะเข้ากลุ่มนี้ได้\n👤 " + (p.user || c.user || "-")], { what: "test" });
  if (r.reason === "not-configured") return { ok: false, status: "error", message: "ยังไม่ได้ใส่ Channel access token" };
  if (r.reason === "no-group") return { ok: false, status: "error", message: "ยังไม่มีกลุ่มที่เปิดส่ง — เชิญบอทเข้ากลุ่มก่อน" };
  return r.sent ? { ok: true, status: "success", sent: r.sent, of: r.of, message: r.reason } : { ok: false, status: "error", message: r.reason || "ส่งไม่สำเร็จ" };
}
