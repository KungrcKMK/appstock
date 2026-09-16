# AppStock — แผนที่ระบบ

> เอกสารนี้เขียนจากการอ่านโค้ดจริงทั้งหมด ทุกข้อมีอ้างอิง `ไฟล์:บรรทัด`
> ปรับปรุงล่าสุด: 2026-09-16 (รอบปรับปรุง 22 ข้อจาก docs/IMPROVEMENT_REVIEW.md) · ถ้าเลขบรรทัดคลาด ให้ยึดชื่อฟังก์ชัน/ข้อความ grep เอา

## ภาพรวม

```
ผู้ใช้ (มือถือหน้างาน / คอมในออฟฟิศ)
   │
   ├─ index.html + js/*.js     ← หน้าคอม (SPA สลับ module ด้วย switchModule)
   ├─ mobile.html               ← หน้ามือถือ (โค้ดจบในไฟล์เดียว)
   │        ทั้งคู่เสิร์ฟจาก GitHub Pages · sw.js cache ไว้ใช้ offline
   ▼
Google Apps Script (gas_code.js 2,745 บรรทัด, deploy ด้วย clasp)
   │   doGet  = อ่านวัตถุดิบอย่างเดียว (gas_code.js:573)
   │   doPost = ทุกอย่างที่เหลือ route ตาม action/module (gas_code.js:592)
   ▼
Google Sheets 1 ไฟล์ = ฐานข้อมูล 12+ ชีต (โครงใน gas_code.js:60-72)
```

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
`js/crimport.js` (นำเข้าล็อตห้องเย็นจาก CSV), `js/offline.js` (คิวออฟไลน์ `offline*` — **ไฟล์เดียวที่ mobile.html ใช้ร่วมกับหน้าคอม**)

การเห็นปุ่มตาม role ตัดสินใน `checkAuth` (`js/app.js:181-215`) — role เก็บใน
`localStorage.unified_stock_role` ฝั่ง UI เป็นแค่การซ่อนปุ่น สิทธิ์จริงเช็คซ้ำฝั่ง GAS

## เส้นทางข้อมูล

### อ่าน (หน้าวัตถุดิบ)
`loadRawData()` (js/raw.js) → `GET {GAS_URL}?module=SQF` → `getRawMaterials` (gas_code.js:2127)
→ อ่านชีต `{module}_Materials` ทั้งหมด + `{module}_History` 30 แถวท้าย → JSON
→ `renderRawInventory` วาดตาราง · มี cache ฝั่ง client ไว้โชว์ตอน offline (js/app.js)

### เขียน (ตัวอย่าง: เบิกของ)
1. ผู้ใช้กด "รับ / เบิก" ในแถว → `openRawAction(sku,name,unit,qty)` (js/raw.js:382)
2. กรอกจำนวน + "ใช้กับงานอะไร" (บังคับเมื่อเบิกออก) → `rawSubmitAction`
3. `offlineSend({action:"UPDATE", sku, type:"OUT", qty, purpose, workOrderId}, label)` (js/offline.js) — แนบ `opId`
   (กันหักซ้ำ), `clientAt` (เวลาที่กดจริง), `deviceName` ให้เอง · `js/app.js` ดัก `fetch` แนบ `sessionToken` ให้ทุก POST
   ส่งไม่ออก / เซิร์ฟเวอร์ตอบ `retryable` → เข้าคิวใน localStorage ส่งเองเมื่อเน็ตกลับ (ดูหัวข้อ "ทำงานตอนเน็ตล่ม")
4. GAS: `doPost` → `_authGate` (ตรวจบัตรผ่าน + role ขั้นต่ำตามตาราง `WRITE_MIN_ROLE` · ชื่อผู้ทำเอาจากบัตร ไม่เชื่อ body)
   → `handleRawMaterial` → `_withLock(rmUpdate)` · `_opSeen(opId)` เจอซ้ำ → คืนผลเดิม ไม่หักซ้ำ
5. `rmUpdate`: ตรวจ type กับ `RM_TYPES` + จำนวนแบบเข้มงวด (`_qtyStrict`) + เบิกออกต้องมี purpose (ตรวจฝั่งเซิร์ฟเวอร์ด้วย)
   → ออกเลขที่เอกสาร `_nextDocNo` (ตัวนับอยู่ชีต Config key `docSeq_*`)
   → **ต่อแถว History ก่อน** (Timestamp = `clientAt`, มี OpId / BalanceAfter / WorkOrder) แล้วค่อยปรับ Qty ใน Materials
   → แจ้ง Telegram (`sendAlert`) → คืน `{status, docNo, slip:{...}}`
6. หน้าจอเอา `slip` ไปวาดใบเบิกทันที (`openWithdrawSlip` ใน js/slip.js) ไม่ต้องยิงถามซ้ำ

### กติกาสำคัญฝั่ง GAS
- เขียนแบบอ่านก่อนเขียนต้องห่อ `_withLock(fn)` — LockService กันชนกัน (ดู switch gas_code.js:2088-2096)
- **Date ห้ามส่งดิบ** — แปลงเป็น string โซนไทยก่อนเสมอ (บทเรียนใน CLAUDE.md ข้อ 5)
- `ensureColumns(sheet, cols)` เพิ่มคอลัมน์ที่ยังไม่มีและคืน header ล่าสุด —
  **ต้องรับค่าคืนไปใช้** อย่าอ่าน header เก่าซ้ำ (เคยมีบั๊กคอลัมน์ทับกันเพราะจุดนี้)

## ชีตทั้งหมด (โครงประกาศที่ gas_code.js:60-72)

| ชีต | คอลัมน์ | หมายเหตุ |
|---|---|---|
| SQF_Materials / MLM_Materials | SKU, Name, Qty, Unit, Min, DailyUsage, ExpiryDate, LastVerified, Discontinued, AlertDays, RopStart, LeadDays, Moq, PackSize | Min = จุดสั่งซื้อ · RopStart = วันเริ่มนับสถิติเบิก · LeadDays/Moq/PackSize = ค่าต่อรายการสำหรับจุดสั่งซื้อแนะนำ (ว่าง = ใช้ค่ากลาง) |
| SQF_History / MLM_History | Timestamp, Name, Action, Qty, User (+ DocNo, SKU, Unit, Purpose, OpId, BalanceAfter, WorkOrder, AckBy, AckAt ที่ ensureColumns เติมทีหลัง) | Action = "เบิกออก"/"รับเข้า"/"คืนวัตถุดิบ"/"ตรวจนับ/ปรับยอด" · Timestamp = เวลาที่กดจริง (`clientAt`) · BalanceAfter = ยอดหลังทำรายการ (การ์ด "ยอดตรงกับประวัติมั๊ย" เทียบกับ Qty ปัจจุบัน — มีค่าเฉพาะรายการที่ทำหลัง 2026-09-16) |
| AppUsers | Username, Active, Role, Password, CreatedAt | role: user/viewer/manager/admin |
| PendingUsers | Username, RequestedAt, Status, ReviewedAt, ReviewedBy | คำขอสิทธิ์จากหน้า login |
| Config | Key, Value | docSeq_*, superAdmin / aliasSuperAdmin, apiKey (พักไว้), telegram settings · อ่านผ่าน `_cfgCached` (cache 10 นาที) |
| ColdRoom_Products / _Stock / _StockIn / _WorkOrders / _DeliveryNotes | ดู gas_code.js:67-72 | ห้องเย็นนับเป็น lot มี MFG/EXP แยก |
| BOM | สูตรผลิต | ใช้โดย bomHealthReport |
| ColdRoom_LotHistory | Timestamp, Barcode, ProductName, MFG, Action, QtyBefore, QtyAfter, Reason, EmployeeName, DeviceInfo, OpId | ประวัติล็อตห้องเย็นทุกการนับ/ล้าง/นำเข้า — ปุ่ม "📜 ประวัติล็อต" ในแท็บคงเหลือ (`getLotHistory`) |
| Telegram_Queue | Timestamp, Message, Status, Tries, SentAt, Error | คิวข้อความ Telegram (pending/sent/failed) — ตอนบันทึกแค่ต่อแถว ตัวส่งจริง `tgFlushQueue` (action `TGFLUSH`) |
| System_Log | Timestamp, Type, Detail, User, Result | backup / telegram-error / ฯลฯ — หน้า Admin แท็บ "สถานะระบบ" (`SYSSTATUS`, manager ขึ้นไป) อ่านจากนี่ |

## ระบบยืนยันตัวตน

- login ด้วยชื่อ (+ รหัสผ่านถ้าตั้งไว้) → `verifyUser` (GAS) คืน role + `sessionToken` **ทุก role** (ตั้งแต่ 2026-09-16)
- บัตรผ่านเก็บ 2 ชั้น: CacheService 6 ชม. (`TOKEN_TTL_SEC`) + PropertiesService 30 วัน (`SESSION_DAYS`, key `sess_<token>`)
  ฝั่งเครื่องอยู่ใน `localStorage.appstock_session` — `js/app.js` ดัก `fetch` แนบ `sessionToken` ให้ทุก POST อัตโนมัติ,
  mobile.html แนบใน `gasPost`, คิวออฟไลน์แนบตอนส่งจริง (`_offCfg.token()`)
- **ทุก action ที่เขียนต้องผ่าน `_authGate`** (ตาราง `WRITE_MIN_ROLE` ใน gas_code.js) — ไม่มีบัตร/หมดอายุ → `{needLogin:true}`
  → UI พาไปหน้า login พร้อมเติมชื่อเดิม (`_forceRelogin` / `mNeedLogin`) **งานในคิวออฟไลน์ไม่หาย** ส่งต่อหลัง login
  · action ที่ไม่อยู่ในตาราง = ไม่ตรวจ (ถือว่าอ่านอย่างเดียว) — **เพิ่ม action เขียนใหม่ต้องใส่ในตารางเสมอ**
  · ชื่อผู้ทำรายการเซิร์ฟเวอร์เอาจากบัตร ไม่เชื่อ `user` ใน body
- super admin: ชื่อบัญชีอ่านจากชีต Config แถว `superAdmin` ผ่าน `_superAdminName()` — ลดสิทธิ์/ลบไม่ได้
  **ห้ามเขียนชื่อจริงในโค้ด/เอกสาร** (repo สาธารณะ) · ทุก output พรางชื่อเป็น "ผู้ดูแลระบบ"
  ที่ `_maskNames` ใน `jsonResponse` + `crSendTelegram` (เปลี่ยนชื่อพราง: Config แถว `aliasSuperAdmin`)
- API key: โครงพร้อมแต่ **fail-open โดยตั้งใจ** (`_checkApiKey` gas_code.js:567) — เจ้าของสั่งพักไว้

## PWA / อัปเดตแอป

- `sw.js` — เปลี่ยนอะไรในไฟล์ที่ cache ต้องเลื่อน `CACHE_NAME` (sw.js:6) เสมอ
- อัปเดตอัตโนมัติ: `controllerchange` + เช็คทุก 10 นาที + ตอนสลับแท็บกลับมา (js/app.js)
  มี `_appIsBusy()` กันรีโหลดตอน modal เปิดหรือกำลังพิมพ์
- ปุ่ม "🔄 อัปเดต" = `forceRefresh()` ล้าง cache ทั้งหมดแล้วโหลดใหม่

## ทำงานตอนเน็ตล่ม (js/offline.js — ไฟล์เดียว ใช้ร่วมทั้งคอมและมือถือ)

- ทุกการเขียนจากหน้างาน (เบิก/รับ/คืน/นับ วัตถุดิบ + นับล็อตห้องเย็น) ผ่าน `offlineSend(body, label)` ไม่ยิง fetch ตรง
- ส่งไม่ออก (เน็ตล่ม / หมดเวลารอ 30 วิ / เซิร์ฟเวอร์ตอบ `retryable`) → เก็บ `localStorage.appstock_queue_v1`
  ส่งตามลำดับเมื่อเน็ตกลับ (`online`, กลับมาเปิดแท็บ, หรือทุก 45 วิ) · มีงานค้าง = งานใหม่ต่อท้ายไม่แซง
- `opId` = กุญแจกันซ้ำ (GAS จำใน CacheService 6 ชม. + สแกน History 3000 แถวท้าย) · `clientAt` = เวลาที่ทำจริง ใช้เป็น Timestamp
- เซิร์ฟเวอร์ตอบ error ชัดเจน (เช่น สต๊อกไม่พอ) → ออกจากคิวไปอยู่ "รายการที่ส่งไม่ผ่าน" (`appstock_failed_v1`)
  เก็บ payload ครบ กดส่งซ้ำ (opId เดิม) หรือลบได้จากปุ่มงานค้าง
- `needLogin` → หยุดส่งอัตโนมัติจนกว่าบัตรผ่านจะเปลี่ยน (`_offLoginBlockedToken` — กันวนลูป reload) · หลายแท็บใช้ล็อก `appstock_queue_lock`
- ตรวจนับ (VERIFY) ที่ส่งช้า: `rmVerify` ดูรายการที่เกิดหลัง `clientAt` แล้วปรับยอดที่นับให้ (replay) — ถ้ามีการนับใหม่กว่า จะปฏิเสธ
- ทดสอบตรรกะนี้ได้โดยไม่แตะระบบจริง: `npm test` (จำลอง localStorage/fetch 7 เคส)

## ความเร็ว — สิ่งที่ทำไว้แล้ว (รอบ PERFORMANCE_REVIEW 2026-09-16)

| เรื่อง | ที่อยู่ | กติกา |
|---|---|---|
| Telegram ไม่อยู่ในเวลารอ | `_tgEnqueue` / `tgFlushQueue` (gas_code.js) · `tgFlushSoon()` (js/utils.js + mobile.html) | บันทึก = ต่อแถว Telegram_Queue (~0.1–0.2 วิ) · หน้าจอยิง `TGFLUSH` แบบไม่รอหลังบันทึกสำเร็จ / หลังคิวออฟไลน์ส่งเสร็จ / ท้าย `checkExpiryAlerts` · จะเพิ่ม time trigger รายนาทีเรียก `tgFlushQueue` ก็ได้ (ไม่บังคับ) |
| หลังบันทึกอัปเดตเฉพาะแถว | `rawApplyLocalWrite` (js/raw.js) · `confirmAction` (mobile.html) | ใช้ยอดจากคำตอบเซิร์ฟเวอร์เท่านั้น (`slip.balance` / `applied`) แล้วดึงคลังใหม่เบื้องหลัง · `_rawWriteSeq` กันคำตอบอ่านที่เริ่มก่อนบันทึกมาทับ |
| โชว์ข้อมูลเดิมก่อน (stale-while-revalidate) | `_rawLoadDataRun` · `crLoadOverview` · mobile `loadData` | เปิดคลังที่เคยเปิด = วาดจาก localStorage ทันที ป้าย "กำลังตรวจข้อมูลล่าสุด" ไม่บังจอ · ของเก่าไม่เด้งแจ้งเตือน/ไม่คำนวณเทรนด์ |
| cache ห้องเย็น | `crGetStartupOverviewCached` · `_crCacheBust` · `CR_WRITE_ACTIONS` | 2 นาที key มีวันที่ไทย · `lite:true` = เฉพาะ allLots (มือถือ) · ล้างอัตโนมัติหลัง action เขียนทุกตัวใน `_handleColdroomInner` (เพิ่ม action เขียนใหม่ต้องใส่ `CR_WRITE_ACTIONS`) |
| รายงานหลายสินค้า | `getProductsAndBalancesBulk` · `crPrintActualReport` | อ่านชีตครั้งเดียว คืนทุกบาร์โค้ด (สำรอง: ยิงทีละตัวถ้าเซิร์ฟเวอร์ตอบไม่ได้) |
| cache วัตถุดิบวัดเป็นไบต์ | `doGet` · `rawmeta_*` · `_sysLogOnce` | เกิน 95,000 ไบต์ = ไม่ cache + จด System_Log ชั่วโมงละครั้ง · หน้าสถานะระบบโชว์ขนาด/สถานะ |
| อ่านประวัติเฉพาะที่ใช้ | `_histRead` · `rmTrends` · `_rmRopStatsCompute` (+cache `rawrop_` 10 นาที) | อ่านคอลัมน์ Timestamp/Name/Action/Qty/SKU เท่านั้น · เทรนด์อ่านเฉพาะช่วง +500 แถวเผื่อรายการย้อนหลัง · ROP อ่านทุกแถว (ต้องรู้วันแรกที่เห็น SKU) |
| ลดรอบอ่าน/เขียนชีต | `_crWriteLotCells` · `ensureColumns` memo ต่อคำขอ | เขียน Qty..UpdatedAt แถวเดียวด้วย setValues ครั้งเดียว · หัวตารางอ่านครั้งเดียวต่อคำขอ (ไม่ข้ามคำขอ — กันหัวตารางค้างเมื่อมีคนแทรกคอลัมน์) |
| รวมคำขอซ้อน / วาดทีละส่วน | `_rawInflight` (js/raw.js) · `loadExecDashboard` (js/exec.js) | อ่านคลังเดียวกันที่ซ้อนกันรอตัวเดียว · ภาพรวมทั้งระบบวาดแต่ละคลังทันทีที่มา KPI รอครบสองโรงงาน (ไม่รวมบางส่วนแล้วโชว์เป็นยอดรวม) |
| มือถือทีละ 50 + หน่วงค้นหา | `renderList` · `filterList` (mobile.html) | แสดง 50 แรก ปุ่ม "แสดงเพิ่ม" · พิมพ์ค้นหาหน่วง 180 ms |
| ไลบรารีหนักโหลดตอนใช้ | `loadVendor()` (js/utils.js) | Chart.js / html5-qrcode / qrcode ไม่อยู่ใน `<head>` ของ index.html แล้ว — เรียก `await loadVendor("chart"\|"qrscan"\|"qrcode")` ก่อนใช้ · ยัง precache ใน sw.js · mobile ใช้ `defer` |
| วัดเวลาแยกส่วน | `_reqTiming` / `timing` ในคำตอบ · แท็บสถานะระบบ | `serverMs` ทุกคำตอบ + `timing.lockWaitMs/tgMs` ในคำตอบการเขียน · หน้าสถานะโชว์ "ตอบใน / เซิร์ฟเวอร์ใช้" และการบันทึกล่าสุดแยกส่วน |

ตัวเลขที่วัดตอนทำ (16 ก.ย. 2569, curl จากคอมเจ้าของ): ตรวจนับ 1 รายการ เซิร์ฟเวอร์ใช้ 2.1 วิ (รอล็อก 0.09 · ต่อคิว Telegram 0.14) จากเดิม ~10 วิ ที่รวมส่ง Telegram · ภาพรวมห้องเย็นแบบย่อ 1.39 วิ → 0.11 วิ เมื่อติด cache

## Deploy

| ส่วน | วิธี | ตรวจ |
|---|---|---|
| frontend | `npm test` ให้ผ่านก่อน → `git push` → GitHub Actions (รัน `node scripts/check.js` อีกรอบ ไม่ผ่าน = ไม่ขึ้น) → GitHub Pages (~30 วิ) | `curl https://kungrckmk.github.io/appstock/sw.js` ดูเลข cache |
| backend | `clasp push -f && clasp deploy -i AKfycbx72vWVvUgaOgZEnzAc8ltaV...` (ID เต็มใน CLAUDE.md) | `clasp deployments` |
| Netlify | **ปิดอยู่** (`if: false` ใน .github/workflows/deploy.yml) token หมดอายุ | — |

มี hook auto-commit + auto-push ใน `.claude/settings.local.json` — ดู CLAUDE.md ข้อ 6

## ตัวอย่างจริง: เพิ่มฟีเจอร์ "รายงานใบเบิกรายเดือน" แตะไฟล์ไหนบ้าง

ฟีเจอร์ล่าสุดที่เพิ่ม (ก.ค. 2569) ใช้เป็นแบบเวลาเพิ่มฟีเจอร์ใหม่:

1. **gas_code.js** — เขียน `rmDocReport` + `rmAckDocs` แล้วเพิ่ม
   `case "DOCREPORT"` / `case "ACKDOC"` ใน `handleRawMaterial` (gas_code.js:2095-2096)
2. **js/docreport.js** (ไฟล์ใหม่) — ฟังก์ชัน prefix `dr*`: `openDocReport` → `rawFetch({action:"DOCREPORT"})` → `drRender`
3. **index.html** — เพิ่ม `#drModal` + ปุ่มในเมนู `⋯ เพิ่มเติม` (index.html:1566) + `<script src="js/docreport.js">`
4. **sw.js** — เพิ่ม `./js/docreport.js` เข้า STATIC_ASSETS + เลื่อน CACHE_NAME
5. `npm test` → deploy ทั้งสองฝั่ง (clasp + git push) แล้ว**ทดสอบผ่าน preview แบบอ่านอย่างเดียว หรือของทดสอบที่ระบุชัด** ก่อนบอกว่าเสร็จ

ข้อควรจำ: ฟีเจอร์นี้ยังไม่มีใน mobile.html — ถ้าฟีเจอร์ไหนพนักงานหน้างานต้องใช้ ต้องทำฝั่ง mobile ด้วย (ดู CLAUDE.md ข้อ 1)

## จุดที่รู้ว่าแปลกแต่ตั้งใจ (อย่า "แก้" โดยไม่ถาม)

- `_checkApiKey` fail-open — เจ้าของสั่งพักเรื่อง API key ไว้
- ชีตประวัติแก้ย้อนหลังได้ — เจ้าของปฏิเสธการล็อก อย่าเสนอซ้ำ
- ปุ่ม "ความเคลื่อนไหว" ข้ามคลัง (`openActivityPanel` js/admin.js) อยู่ที่หัวหน้า Admin เห็นเฉพาะ admin — ย้ายมาแล้ว 2026-08-03
- `_authGate` ไม่ตรวจ action ที่ไม่อยู่ใน `WRITE_MIN_ROLE` (ตั้งใจให้ action อ่านผ่านได้) — เพิ่ม action เขียนต้องลงตารางเสมอ
- `migrate.html` — เครื่องมือย้ายข้อมูลครั้งแรก ไม่ได้ลิงก์จากที่ไหน เก็บไว้เฉยๆ
- เลขที่เอกสาร 0001-0003 ของปี 2569 ถูกรีเซ็ตทิ้งตอนทดสอบ (30 ก.ค. 2569) ก่อนเปิดใช้จริง — ห้ามรีเซ็ตอีก
