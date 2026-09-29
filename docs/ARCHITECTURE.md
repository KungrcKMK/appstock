# AppStock — แผนที่ระบบ

> เอกสารนี้เขียนจากการอ่านโค้ดจริงทั้งหมด ทุกข้อมีอ้างอิง `ไฟล์:บรรทัด`
> ปรับปรุงล่าสุด: 2026-09-29 (ย้ายหลังบ้านไป Cloudflare Workers + D1) · ถ้าเลขบรรทัดคลาด ให้ยึดชื่อฟังก์ชัน/ข้อความ grep เอา

## ภาพรวม

```
ผู้ใช้ (มือถือหน้างาน / คอมในออฟฟิศ)
   │
   ├─ index.html + js/*.js     ← หน้าคอม (SPA สลับ module ด้วย switchModule)
   ├─ mobile.html               ← หน้ามือถือ (โค้ดจบในไฟล์เดียว)
   │        ทั้งคู่เสิร์ฟจาก GitHub Pages · sw.js cache ไว้ใช้ offline
   ▼
Cloudflare Worker "appstock-api" (cloudflare/appstock-api/src/ ~2,300 บรรทัด, deploy ด้วย wrangler)
   │   GET  ?module=SQF|MLM  = อ่านวัตถุดิบ
   │   POST {module, action, ...} = ทุกอย่างที่เหลือ (src/index.js แจกงานตาม module/action)
   │   cron ทุก 5 นาที = ส่ง Telegram ที่ค้าง · ทุก 15 นาทีสั่งสำเนาลงชีต · 08:00 แจ้งหมดอายุ + สำรองลง R2 + สรุปที่ต้องสั่ง · อาทิตย์ 02:00 เก็บล็อตเก่า
   ▼
D1 "appstock" (SQLite, 16 ตาราง — โครงใน cloudflare/appstock-api/schema.sql)
   │
   └─▶ Google Sheets เดิม = สำเนาอ่านอย่างเดียว (Worker สั่ง → gas_code.js ดึงข้อมูลมาเขียนลงชีต)
```

**สัญญา request/response เหมือนสมัย GAS ทุกตัวอักษร** (key ในคำตอบ = หัวคอลัมน์ชีตเดิม เช่น `SKU`, `Name`, `Qty`)
หน้าจอจึงไม่ต้องแก้ตอนย้าย — ตัวแปรที่อยู่หลังบ้านยังชื่อ `GAS_URL`

ไม่มี bundler — ไฟล์ JS ทุกตัวคือของจริงที่เสิร์ฟตรงๆ · มี 2 อย่างที่ต้องรู้ (เพิ่ม 2026-09-16):
- **CSS ของ Tailwind build ไว้ล่วงหน้า** → `npm run build:css` ออกเป็น `css/tw-desktop.css` + `css/tw-mobile.css`
  (config: `tailwind.desktop.config.js` / `tailwind.mobile.config.js`) — **เพิ่ม class ใหม่ใน HTML/JS ต้อง build ใหม่** ไม่งั้น class ไม่ติด
- **`npm test` = `scripts/check.js`** ตรวจก่อนเผยแพร่ (ไวยากรณ์ทุกไฟล์, STATIC_ASSETS มีจริง, GAS_URL ตรงกัน, คิวออฟไลน์ 7 เคส, CSS มี)
  GitHub Actions รันให้ก่อน deploy ทุกครั้ง — ไม่ผ่าน = ไม่ขึ้น Pages

ไลบรารีเก็บในแอปทั้งหมด (`js/vendor/`: chart.umd.min.js, html5-qrcode.min.js, qrcode.min.js) — เหลือแค่ฟอนต์ที่ยังมาจาก Google

## โมดูลฝั่งผู้ใช้ (หน้าคอม)

`switchModule(name)` ใน `js/app.js` โชว์/ซ่อน `<div id="module-XXX">` ใน index.html

| module | หน้า | ไฟล์ logic | prefix ฟังก์ชัน |
|---|---|---|---|
| HOME | หน้าแรกหลัง login — การ์ด 3 คลัง (ซ่อนแถบเมนูบน) | js/app.js | — |
| SQF / MLM | วัตถุดิบ 2 โรงงาน (UI เดียวกัน สลับ `rawCurrentModule`) | js/raw.js | `raw*` |
| COLDROOM | ห้องเย็น 7 แท็บ (แดชบอร์ด/คงเหลือ/นับ/ใบสั่งผลิต/ส่ง/รับ/จัดการ) | js/coldroom.js | `cr*` |
| EXEC | ภาพรวมข้ามคลัง (role: viewer/manager/admin) | js/exec.js | `exec*` |
| BOMHEALTH | "🔍 ตรวจข้อมูล" = ตรวจ BOM + การ์ด "🧾 ยอดตรงกับประวัติมั๊ย" (`LEDGERAUDIT`) (role: admin/manager · ในหน้าจอห้ามใช้คำว่า "สูตร") | js/report.js | — |
| ROLES | อนุมัติ/จัดการผู้ใช้ (role: admin/manager) | js/admin.js | `admin*` |

ไฟล์เสริมที่เปิดเป็น modal จากหน้าวัตถุดิบ: `js/import.js` (นำเข้า CSV), `js/slip.js` (ใบเบิก canvas),
`js/docreport.js` (รายงานรายเดือน), `js/share.js` (แชร์ QR), `js/myhistory.js` (ประวัติของฉัน),
`js/alerts.js` (แจ้งเตือนสต๊อก), `js/auth.js` (login + ขอสิทธิ์), `js/rop.js` (จุดสั่งซื้อแนะนำ `rop*`),
`js/crimport.js` (นำเข้าล็อตห้องเย็นจาก CSV), `js/plan.js` (📈 วางแผนสั่งซื้อ `plan*` — ดูหัวข้อด้านล่าง), `js/offline.js` (คิวออฟไลน์ `offline*` — **ไฟล์เดียวที่ mobile.html ใช้ร่วมกับหน้าคอม**)

การเห็นปุ่มตาม role ตัดสินใน `checkAuth` (`js/app.js:181-215`) — role เก็บใน
`localStorage.unified_stock_role` ฝั่ง UI เป็นแค่การซ่อนปุ่ม สิทธิ์จริงเช็คซ้ำที่หลังบ้าน

## เส้นทางข้อมูล

### อ่าน (หน้าวัตถุดิบ)
`loadRawData()` (js/raw.js) → `GET {GAS_URL}?module=SQF` → `getRawMaterials` (src/raw.js)
→ `SELECT` ตาราง `materials` ของโรงงานนั้น + `history` 30 แถวล่าสุด → JSON
→ `renderRawInventory` วาดตาราง · มี cache ฝั่ง client ไว้โชว์ตอน offline (js/app.js)

### เขียน (ตัวอย่าง: เบิกของ)
1. ผู้ใช้กด "รับ / เบิก" ในแถว → `openRawAction(sku,name,unit,qty)` (js/raw.js)
2. กรอกจำนวน + "ใช้กับงานอะไร" (บังคับเมื่อเบิกออก) → `rawSubmitAction`
3. `offlineSend({action:"UPDATE", sku, type:"OUT", qty, purpose, workOrderId}, label)` (js/offline.js) — แนบ `opId`
   (กันหักซ้ำ), `clientAt` (เวลาที่กดจริง), `deviceName` ให้เอง · `js/app.js` ดัก `fetch` แนบ `sessionToken` ให้ทุก POST
   ส่งไม่ออก / เซิร์ฟเวอร์ตอบ `retryable` → เข้าคิวใน localStorage ส่งเองเมื่อเน็ตกลับ (ดูหัวข้อ "ทำงานตอนเน็ตล่ม")
4. Worker: `authGate` (ตรวจบัตรผ่าน + role ขั้นต่ำตามตาราง `WRITE_MIN_ROLE` · ชื่อผู้ทำเอาจากบัตร ไม่เชื่อ body)
   → `handleRaw` → `rmUpdate` · opId ที่เคยเห็น → คืนผลเดิมจาก `kv` ไม่หักซ้ำ
5. `rmUpdate`: ตรวจ type + จำนวนแบบเข้มงวด (`qtyStrict`) + เบิกออกต้องมี purpose
   → **`env.DB.batch` 3 คำสั่งในธุรกรรมเดียว**: (ก) INSERT history โดยเช็ค `qty >= จำนวนที่เบิก` ใน SQL และออกเลขที่เอกสารในคำสั่งเดียวกัน
   (ข) เลื่อนตัวนับเอกสาร `config.docSeq_*` เฉพาะเมื่อแถว history เกิดจริง (ค) ปรับ `materials.qty` เฉพาะเมื่อแถว history เกิดจริง
   → ส่ง Telegram หลังตอบ (`tgNotify` + `ctx.waitUntil`) → คืน `{status, docNo, slip:{...}}`
6. หน้าจอเอา `slip` ไปวาดใบเบิกทันที (`openWithdrawSlip` ใน js/slip.js) ไม่ต้องยิงถามซ้ำ

### กติกาสำคัญฝั่งหลังบ้าน
- อ่านก่อนเขียน = ทำใน `batch` เดียว และ **ตรวจเงื่อนไขซ้ำใน SQL** — คำขอสองตัวที่มาพร้อมกันจะไม่ทำให้ยอดติดลบ/เลขเอกสารซ้ำ
- **เวลาห้ามส่งดิบ** — เก็บเป็น ms (UTC) แปลงเป็น string โซนไทยด้วย `fmtTH`/`dayTH` ก่อนส่ง (CLAUDE.md ข้อ 5)
- ดัชนี unique `(module, op_id)` ใน `history` คือด่านสุดท้ายกันหักซ้ำ — ห้ามถอด
- `reply()` ใน src/index.js เติม `serverMs` และพรางชื่อ super admin ให้ทุกคำตอบ

## ตารางทั้งหมด (cloudflare/appstock-api/schema.sql)

| ตาราง | ชีตเดิม | หมายเหตุ |
|---|---|---|
| materials | SQF_Materials / MLM_Materials | แยกโรงงานด้วยคอลัมน์ `module` · PK (module, sku) · min = จุดสั่งซื้อ · rop_start = วันเริ่มนับสถิติเบิก · lead_days/moq/pack_size = ค่าต่อรายการ (ว่าง = ใช้ค่ากลาง) |
| history | SQF_History / MLM_History | action = "เบิกออก"/"รับเข้า"/"คืนวัตถุดิบ"/"ตรวจนับ/ปรับยอด" · ts = เวลาที่กดจริง (`clientAt`) · balance_after = ยอดหลังทำรายการ · ack_by/ack_at = รับทราบ |
| users | AppUsers | role: user/viewer/manager/admin · password = `pbkdf2$<รอบ>$<เกลือ>$<hash>` (รูปแบบเก่าถูกแปลงเองตอน login) |
| pending_users | PendingUsers | คำขอสิทธิ์จากหน้า login |
| sessions | (เดิมอยู่ใน PropertiesService) | บัตรผ่าน 30 วัน · role/สถานะอ่านจาก users ทุกคำขอ → ลดสิทธิ์/ลบบัญชีมีผลทันที |
| config | Config | docSeq_*, superAdmin / aliasSuperAdmin, ตั้งค่า Telegram |
| kv | (เดิม CacheService) | ของชั่วคราวมีวันหมดอายุ: คำตอบของ opId (7 วัน), ตัวนับ login ผิด |
| cr_products / cr_stock / stock_in / work_orders / delivery_notes | ColdRoom_* | ห้องเย็นนับเป็น lot (barcode + mfg) · cr_stock.archived = 1 คือของเก่าที่เก็บแล้ว |
| cr_lot_history | ColdRoom_LotHistory | ประวัติล็อตทุกการนับ/ล้าง/นำเข้า |
| bom | BOM | ใช้โดย bomHealthReport (ในหน้าจอห้ามใช้คำว่า "สูตร") |
| tg_queue | Telegram_Queue | ข้อความที่ส่งไม่ผ่านรอบแรก — cron / `TGFLUSH` ส่งซ้ำ |
| system_log | System_Log | backup / telegram-error ฯลฯ — แท็บ "สถานะระบบ" (`SYSSTATUS`) อ่านจากนี่ |

### สำเนาลง Google Sheets (อ่านอย่างเดียว)
`gas_code.js` → `mirrorFromCloud()` เรียก action `EXPORT` ของ Worker ด้วยกุญแจ `MIRROR_KEY`
(Worker: `wrangler secret` · GAS: Script Properties — **ไม่มีในโค้ด**) แล้วเขียนทับทุกแท็บ
· ข้อมูลที่ส่งไปไม่มีรหัสผ่าน/ค่าลับ (`exportSheets(full=false)`) · ข้อความขึ้นต้น `= + - @` ถูกเติม `'` กันชีตตีความเป็นคำสั่ง
· **แก้ในชีตไม่มีผลกับระบบ** และถูกเขียนทับรอบถัดไป

**ใครเป็นคนสั่ง:** งานตามเวลาของ Worker (`ticks` → `mirrorPush` ใน src/system.js) ยิงไปที่สคริปต์ฝั่ง Google (`MIRROR_URL` ใน wrangler.toml, action `MIRRORNOW`)
ทุก 15 นาที — **ไม่ต้องตั้ง time trigger ใน Apps Script** (ตั้ง `mirrorFromCloud` ซ้อนไว้ก็ไม่เสียหาย มีล็อกกันชนกัน)
· ข้ามรอบเมื่อข้อมูลไม่เปลี่ยน (`mirrorSig` เทียบกับรอบก่อน) แต่อย่างช้าชั่วโมงละครั้งสั่งหนึ่งครั้ง
· ผลรอบล่าสุดเก็บใน `kv` key `mirror_last` → แท็บ "สถานะระบบ" แสดงเวลา/ผล และมีปุ่มอัปเดตเดี๋ยวนี้ (action `MIRRORPUSH`, manager ขึ้นไป)
· เครื่องทดสอบไม่มี `MIRROR_KEY` จึงไม่สั่ง — และสคริปต์ฝั่ง Google ดึงจากเซิร์ฟเวอร์จริงเสมอ ข้อมูลทดสอบไม่มีทางลงชีต

### สำรองข้อมูล
cron 08:00 (เวลาไทย) → `backupAll` เขียน JSON ทั้งฐานข้อมูลลง R2 `appstock-backups` · กดเองได้จากหน้า Admin (action `BACKUP`)

## 📈 วางแผนสั่งซื้อ (วิเคราะห์การเบิก กันของหมด / สั่งเข้าไม่ทัน)

**คิดที่หลังบ้านที่เดียว** (`cloudflare/appstock-api/src/plan.js`) — หน้าคอม (`js/plan.js`), มือถือ (แผ่น `#planSheet` ใน mobile.html)
และข้อความ Telegram ตอนเช้า ใช้ผลจาก `planCompute` ชุดเดียวกัน ตัวเลขจึงตรงกันเสมอ · หน้าจอมีหน้าที่แสดงผลอย่างเดียว

| action | สิทธิ์ | ทำอะไร |
|---|---|---|
| `USAGEPLAN` | ทุกคน (อ่าน) | คืน `items[]` เรียงตามความเร่งด่วน + `summary` + `settings` (ที่ใช้คิด) + `saved` (ค่ากลาง) · ส่ง `leadDays/safetyDays/coverDays` มา "ลองดู" ได้ ไม่บันทึก |
| `PLANSET` | manager ขึ้นไป | บันทึกค่ากลางลง `config`: `planLeadDays` (7) · `planSafetyDays` (3) · `planCoverDays` (30) · `planAlert` (on) |
| `PLANDIGEST` | manager ขึ้นไป | `send:false` = ดูตัวอย่างข้อความ · `send:true` = ส่งเข้า Telegram เดี๋ยวนั้น |

วิธีคิด (ต่อรายการ):
- **อัตราใช้ต่อวัน** = ค่าที่มากกว่าระหว่าง "เบิกจริง 30 วัน (เบิก − คืน)" กับ `daily_usage` ที่ตั้งไว้ — เป้าหมายคือกันของหมด จึงเผื่อทางปลอดภัย
  · เบิกจริงจะถูกเชื่อเมื่อเบิก ≥ 5 ครั้งใน 30 วัน และเห็นข้อมูลมา ≥ 14 วัน (เกณฑ์เดียวกับจุดสั่งซื้อแนะนำ) · 7 วันล่าสุดเร่งขึ้น > 25% ใช้ค่า 7 วัน
  · เคารพ `rop_start` (วันเริ่มนับรายตัว) เหมือน `ROPSTATS`
- **พอใช้อีก** = qty ÷ อัตราใช้ · **ต้องสั่งภายใน** = วันที่หมด − วันรอของ (`lead_days` รายตัว ชนะค่ากลาง) − กันชน
- **สถานะ**: `late` พอใช้ < วันรอของ · `now` ถึงเวลาสั่งแล้ว หรือต่ำกว่า `min` ที่คนตั้งเอง · `soon` ภายใน 7 วัน · `ok` · `nodata` ไม่รู้อัตราใช้ (ไม่เดาตัวเลข)
- **แนะนำสั่ง** = อัตราใช้ × (coverDays + กันชน) − ของที่จะเหลือตอนของมาถึง → ปัดขึ้นตาม `pack_size` → ไม่ต่ำกว่า `moq`

สรุปเช้า (`planDigest` เรียกจาก `ticks` ช่วง 08:00): ส่งเฉพาะเมื่อชุดรายการ late/now **เปลี่ยนไปจากที่เคยส่ง** (ลายเซ็นเก็บใน `kv` key `plan_sig_<module>`)
หรือเป็นวันจันทร์ — ไม่ส่งข้อความเดิมซ้ำทุกเช้าจนคนเลิกอ่าน

หลักการที่ห้ามเปลี่ยน: หน้านี้ **แค่ชี้ให้เห็น** — ไม่สั่งซื้อเอง ไม่บล็อกการเบิก ทุกคนเปิดดูได้ (รวม viewer)

## มือถือ: ขั้นตอนเบิก/รับ/นับ (ปรับ 2026-09-29)

- ช่องจำนวน `#aQtyIn` เป็น `inputmode="decimal"` (ของที่ชั่งเป็น กก. ต้องพิมพ์ทศนิยมได้) · อ่านค่าด้วย `numVal()` ซึ่งรับลูกน้ำและโจทย์คิดเลข (`16*48+5`)
  — **ห้ามกลับไปใช้ `Number(el.value)` ตรงๆ** · ปุ่ม 🧮 สลับเป็นแป้นพิมพ์เต็ม (`calcMode`)
- ปุ่มบวกเร็ว `renderQuick` ขนาดก้าวตามยอดของตัวนั้น (`quickSteps`) · `updateAfter` โชว์ "จะเหลือ ..." และข้อความบนปุ่มยืนยัน (`confirmLabel`) ก่อนกด
- ปุ่มเลือกงาน `renderPurposeChips`: ของเครื่องนี้ (`m_purposes_<mod>`) + ของคนอื่นในคลังจาก `recentHistory` (`m_purposes_srv_<mod>`, เฉพาะรายการ "เบิกออก")
- ตัวกรองรายการ `mListFilter`: all / low / freq (`m_freq_<mod>` นับเมื่อบันทึกสำเร็จหรือเข้าคิวออฟไลน์แล้ว)
- ตัวเลขบนจอผ่าน `fmtNum` (มีลูกน้ำ) · ข้อความจากข้อมูลผ่าน `escH` / ค่าใน onclick ผ่าน `escJA`
- หน้าคอมได้ของคู่กัน: `rawUpdateAfter` (ยอดหลังบันทึก) + `rawPurposeChips` ในหน้าต่างรับ/เบิก

## ระบบยืนยันตัวตน

- login ด้วยชื่อ (+ รหัสผ่านถ้าตั้งไว้) → `verifyUser` (src/auth.js) คืน role + `sessionToken` ทุก role
  · ใส่รหัสผิด 5 ครั้งใน 15 นาที = พักชั่วคราว (นับใน `kv`)
- บัตรผ่านอยู่ในตาราง `sessions` 30 วัน · ฝั่งเครื่องอยู่ใน `localStorage.appstock_session`
  — `js/app.js` ดัก `fetch` แนบ `sessionToken` ให้ทุก POST อัตโนมัติ, mobile.html แนบใน `gasPost`, คิวออฟไลน์แนบตอนส่งจริง
- **ทุก action ที่เขียนต้องผ่าน `authGate`** (ตาราง `WRITE_MIN_ROLE` ใน src/auth.js) — ไม่มีบัตร/หมดอายุ → `{needLogin:true}`
  → UI พาไปหน้า login พร้อมเติมชื่อเดิม (`_forceRelogin` / `mNeedLogin`) **งานในคิวออฟไลน์ไม่หาย** ส่งต่อหลัง login
  · action ที่ไม่อยู่ในตาราง = ไม่ตรวจ (ถือว่าอ่านอย่างเดียว) — **เพิ่ม action เขียนใหม่ต้องใส่ในตารางเสมอ**
  · ชื่อผู้ทำรายการเอาจากบัตร ไม่เชื่อ `user`/`payload.username` ใน body
- super admin: ชื่อบัญชีอ่านจาก `config` แถว `superAdmin` — ลดสิทธิ์/ลบไม่ได้
  **ห้ามเขียนชื่อจริงในโค้ด/เอกสาร** (repo สาธารณะ) · ทุกคำตอบและข้อความ Telegram พรางชื่อเป็น "ผู้ดูแลระบบ"
  (`maskNames` ใน src/lib.js · เปลี่ยนชื่อพราง: `config` แถว `aliasSuperAdmin`)
- API key: เจ้าของสั่งพักไว้ — หลังบ้านใหม่ไม่ได้ย้ายมาด้วย อย่าเสนอซ้ำ
- ลืมรหัส super admin: แก้ในชีตไม่ได้แล้ว → `wrangler d1 execute appstock --remote --command "UPDATE users SET password='' WHERE username='...'"`
  จากเครื่องเจ้าของ แล้วตั้งรหัสใหม่ในแอป

## PWA / อัปเดตแอป

- `sw.js` — เปลี่ยนอะไรในไฟล์ที่ cache ต้องเลื่อน `CACHE_NAME` (sw.js:6) เสมอ
- อัปเดตอัตโนมัติ: `controllerchange` + เช็คทุก 10 นาที + ตอนสลับแท็บกลับมา (js/app.js)
  มี `_appIsBusy()` กันรีโหลดตอน modal เปิดหรือกำลังพิมพ์
- ปุ่ม "🔄 อัปเดต" = `forceRefresh()` ล้าง cache ทั้งหมดแล้วโหลดใหม่

## ทำงานตอนเน็ตล่ม (js/offline.js — ไฟล์เดียว ใช้ร่วมทั้งคอมและมือถือ)

- ทุกการเขียนจากหน้างาน (เบิก/รับ/คืน/นับ วัตถุดิบ + นับล็อตห้องเย็น) ผ่าน `offlineSend(body, label)` ไม่ยิง fetch ตรง
- ส่งไม่ออก (เน็ตล่ม / หมดเวลารอ 30 วิ / เซิร์ฟเวอร์ตอบ `retryable`) → เก็บ `localStorage.appstock_queue_v1`
  ส่งตามลำดับเมื่อเน็ตกลับ (`online`, กลับมาเปิดแท็บ, หรือทุก 45 วิ) · มีงานค้าง = งานใหม่ต่อท้ายไม่แซง
- `opId` = กุญแจกันซ้ำ (คำตอบเดิมเก็บใน `kv` 7 วัน + ดัชนี unique ใน `history`) · `clientAt` = เวลาที่ทำจริง ใช้เป็น Timestamp
- เซิร์ฟเวอร์ตอบ error ชัดเจน (เช่น สต๊อกไม่พอ) → ออกจากคิวไปอยู่ "รายการที่ส่งไม่ผ่าน" (`appstock_failed_v1`)
  เก็บ payload ครบ กดส่งซ้ำ (opId เดิม) หรือลบได้จากปุ่มงานค้าง
- `needLogin` → หยุดส่งอัตโนมัติจนกว่าบัตรผ่านจะเปลี่ยน (`_offLoginBlockedToken` — กันวนลูป reload) · หลายแท็บใช้ล็อก `appstock_queue_lock`
- ตรวจนับ (VERIFY) ที่ส่งช้า: `rmVerify` ดูรายการที่เกิดหลัง `clientAt` แล้วปรับยอดที่นับให้ (replay) — ถ้ามีการนับใหม่กว่า จะปฏิเสธ
- ทดสอบตรรกะนี้ได้โดยไม่แตะระบบจริง: `npm test` (จำลอง localStorage/fetch 7 เคส)

## ความเร็ว

**หลังบ้าน (วัด 29 ก.ย. 2569 จากคอมเจ้าของ):** อ่านวัตถุดิบ ~170 ms · คำขออื่น 130–360 ms · login มีรหัสผ่าน ~270 ms
(สมัย GAS: 1.5–10 วิ และค้าง 25–60 วิแบบสุ่ม) — cache ฝั่งเซิร์ฟเวอร์สมัย GAS ถูกถอดหมดแล้ว เพราะอ่าน D1 ตรงๆ เร็วพอ

**หน้าจอ — ยังใช้อยู่ทั้งหมด:**

| เรื่อง | ที่อยู่ | กติกา |
|---|---|---|
| หลังบันทึกอัปเดตเฉพาะแถว | `rawApplyLocalWrite` (js/raw.js) · `confirmAction` (mobile.html) | ใช้ยอดจากคำตอบเซิร์ฟเวอร์เท่านั้น (`slip.balance` / `applied`) แล้วดึงคลังใหม่เบื้องหลัง · `_rawWriteSeq` กันคำตอบอ่านที่เริ่มก่อนบันทึกมาทับ |
| โชว์ข้อมูลเดิมก่อน (stale-while-revalidate) | `_rawLoadDataRun` · `crLoadOverview` · mobile `loadData` | เปิดคลังที่เคยเปิด = วาดจาก localStorage ทันที ป้าย "กำลังตรวจข้อมูลล่าสุด" ไม่บังจอ · ของเก่าไม่เด้งแจ้งเตือน/ไม่คำนวณเทรนด์ |
| รวมคำขอซ้อน / วาดทีละส่วน | `_rawInflight` (js/raw.js) · `loadExecDashboard` (js/exec.js) | อ่านคลังเดียวกันที่ซ้อนกันรอตัวเดียว · ภาพรวมทั้งระบบวาดแต่ละคลังทันทีที่มา |
| มือถือทีละ 50 + หน่วงค้นหา | `renderList` · `filterList` (mobile.html) | แสดง 50 แรก ปุ่ม "แสดงเพิ่ม" · พิมพ์ค้นหาหน่วง 180 ms |
| ไลบรารีหนักโหลดตอนใช้ | `loadVendor()` (js/utils.js) | เรียก `await loadVendor("chart"\|"qrscan"\|"qrcode")` ก่อนใช้ · ยัง precache ใน sw.js |
| ทนคำตอบผิดรูป | `gasJson` (js/utils.js + mobile.html) | คำตอบที่ไม่ใช่ JSON → ลองใหม่เอง 1 ครั้ง แล้วแจ้งเป็นภาษาคน |
| วัดเวลา | `serverMs` ในทุกคำตอบ · แท็บสถานะระบบ | โชว์ "ตอบใน / เซิร์ฟเวอร์ใช้" — ต่างกันมาก = ช้าที่เน็ตของเครื่องนั้น |

## Deploy

| ส่วน | วิธี | ตรวจ |
|---|---|---|
| frontend | `npm test` ให้ผ่านก่อน → `git push` → GitHub Actions (รัน `node scripts/check.js` อีกรอบ ไม่ผ่าน = ไม่ขึ้น) → GitHub Pages (~30 วิ) | `curl https://kungrckmk.github.io/appstock/sw.js` ดูเลข cache |
| backend | `cd cloudflare/appstock-api && wrangler deploy` (**push ไม่ได้ deploy ให้**) | แท็บสถานะระบบ · `wrangler tail` ดู log สด |
| ตัวดึงสำเนาลงชีต | `clasp push -f && clasp deploy -i AKfycbx72vWVvUgaOgZEnzAc8ltaV...` (ID เต็มใน CLAUDE.md) | `clasp deployments` |
| Netlify | **ปิดอยู่** (`if: false` ใน .github/workflows/deploy.yml) | — |

มี hook auto-commit + auto-push ใน `.claude/settings.local.json` — ดู CLAUDE.md ข้อ 6 และข้อ 9 (เคยทำข้อมูลหลุด)

**ถอยกลับไป GAS** (กรณีฉุกเฉิน): `gas_code.js` ตั้ง `MIGRATED_TO_CLOUDFLARE = false` → clasp deploy → แก้ `GAS_URL` ทั้งสองหน้าจอกลับเป็น URL ของ GAS + เลื่อน CACHE_NAME
⚠️ ข้อมูลที่บันทึกหลังย้ายอยู่ใน D1 — ชีตเป็นแค่สำเนา ต้องตรวจว่าสำเนาล่าสุดก่อนถอย

## ตัวอย่างจริง: เพิ่มฟีเจอร์ "รายงานใบเบิกรายเดือน" แตะไฟล์ไหนบ้าง

ใช้เป็นแบบเวลาเพิ่มฟีเจอร์ใหม่:

0. **ก่อนเริ่ม**: ฟีเจอร์ที่มีการคำนวณ ให้คิดที่หลังบ้านที่เดียวแล้วหน้าจอแค่แสดงผล (ดู `src/plan.js`) — มี 2 หน้าจอ คิดสองที่ = ตัวเลขไม่ตรงกันสักวัน
1. **cloudflare/appstock-api/src/raw.js** — เขียน `rmDocReport` + `rmAckDocs` แล้วเพิ่ม
   `case "DOCREPORT"` / `case "ACKDOC"` ใน `handleRaw` · action ที่เขียน (`ACKDOC`) เพิ่มใน `WRITE_MIN_ROLE` (src/auth.js)
2. **js/docreport.js** (ไฟล์ใหม่) — ฟังก์ชัน prefix `dr*`: `openDocReport` → `rawFetch({action:"DOCREPORT"})` → `drRender`
3. **index.html** — เพิ่ม `#drModal` + ปุ่มในเมนู `⋯ เพิ่มเติม` + `<script src="js/docreport.js">`
4. **sw.js** — เพิ่ม `./js/docreport.js` เข้า STATIC_ASSETS + เลื่อน CACHE_NAME
5. `npm test` → ทดสอบกับหลังบ้านในเครื่อง (`wrangler dev`) → deploy ทั้งสองฝั่ง (wrangler + git push)
   แล้ว**ตรวจผ่าน preview แบบอ่านอย่างเดียว** ก่อนบอกว่าเสร็จ

ข้อควรจำ: ฟีเจอร์ไหนพนักงานหน้างานต้องใช้ ต้องทำฝั่ง mobile ด้วย (ดู CLAUDE.md ข้อ 1)

## จุดที่รู้ว่าแปลกแต่ตั้งใจ (อย่า "แก้" โดยไม่ถาม)

- ตัวแปรที่อยู่หลังบ้านชื่อ `GAS_URL` ทั้งที่ชี้ไป Cloudflare — อ้างถึงทั่วแอป เปลี่ยนชื่อ = เสี่ยงพังเงียบ
- `gas_code.js` ยังมีโค้ดหลังบ้านเดิมครบ ~2,700 บรรทัด — เก็บไว้ถอยกลับ ไม่ได้ทำงาน (`MIGRATED_TO_CLOUDFLARE = true`)
- ประวัติแก้ย้อนหลังได้ (ตอนนี้ต้องแก้ใน D1) — เจ้าของปฏิเสธการล็อก อย่าเสนอซ้ำ
- ปุ่ม "ความเคลื่อนไหว" ข้ามคลัง (`openActivityPanel` js/admin.js) อยู่ที่หัวหน้า Admin เห็นเฉพาะ admin
- `authGate` ไม่ตรวจ action ที่ไม่อยู่ใน `WRITE_MIN_ROLE` (ตั้งใจให้ action อ่านผ่านได้) — เพิ่ม action เขียนต้องลงตารางเสมอ
- `migrate.html` — เครื่องมือย้ายข้อมูลครั้งแรก ไม่ได้ลิงก์จากที่ไหน เก็บไว้เฉยๆ
- เลขที่เอกสาร 0001-0003 ของปี 2569 ถูกรีเซ็ตทิ้งตอนทดสอบ (30 ก.ค. 2569) ก่อนเปิดใช้จริง — ห้ามรีเซ็ตอีก
- ใบสั่งผลิตรูปแบบเก่า (12 คอลัมน์) ในชีตไม่ได้ย้ายมา — โครงเดิมใช้ไม่ได้อยู่แล้วตั้งแต่ก่อนย้าย
