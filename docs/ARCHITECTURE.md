# AppStock — แผนที่ระบบ

> เอกสารนี้เขียนจากการอ่านโค้ดจริงทั้งหมด ทุกข้อมีอ้างอิง `ไฟล์:บรรทัด`
> ปรับปรุงล่าสุด: 2026-07-31 · ถ้าเลขบรรทัดคลาด ให้ยึดชื่อฟังก์ชัน/ข้อความ grep เอา

## ภาพรวม

```
ผู้ใช้ (มือถือหน้างาน / คอมในออฟฟิศ)
   │
   ├─ index.html + js/*.js     ← หน้าคอม (SPA สลับ module ด้วย switchModule)
   ├─ mobile.html               ← หน้ามือถือ (โค้ดจบในไฟล์เดียว)
   │        ทั้งคู่เสิร์ฟจาก GitHub Pages · sw.js cache ไว้ใช้ offline
   ▼
Google Apps Script (gas_code.js ~2,900 บรรทัด, deploy ด้วย clasp)
   │   doGet  = อ่านวัตถุดิบอย่างเดียว (gas_code.js:573)
   │   doPost = ทุกอย่างที่เหลือ route ตาม action/module (gas_code.js:592)
   ▼
Google Sheets 1 ไฟล์ = ฐานข้อมูล 12+ ชีต (โครงใน gas_code.js:60-72)
```

ไม่มี build ไม่มี bundler ไม่มี test — ทุกไฟล์คือของจริงที่เสิร์ฟตรงๆ
ไลบรารีทั้งหมดมาจาก CDN (Tailwind, Chart.js, QRCode.js, html5-qrcode)

## โมดูลฝั่งผู้ใช้ (หน้าคอม)

`switchModule(name)` ใน `js/app.js` โชว์/ซ่อน `<div id="module-XXX">` ใน index.html

| module | หน้า | ไฟล์ logic | prefix ฟังก์ชัน |
|---|---|---|---|
| SQF / MLM | วัตถุดิบ 2 โรงงาน (UI เดียวกัน สลับ `rawCurrentModule`) | js/raw.js | `raw*` |
| COLDROOM | ห้องเย็น 7 แท็บ (แดชบอร์ด/คงเหลือ/นับ/ใบสั่งผลิต/ส่ง/รับ/จัดการ) | js/coldroom.js | `cr*` |
| EXEC | ภาพรวมข้ามคลัง (role: viewer/manager/admin) | js/exec.js | `exec*` |
| BOMHEALTH | ตรวจสูตรผลิต (role: admin) | js/report.js | — |
| ROLES | อนุมัติ/จัดการผู้ใช้ (role: admin/manager) | js/admin.js | `admin*` |

ไฟล์เสริมที่เปิดเป็น modal จากหน้าวัตถุดิบ: `js/import.js` (นำเข้า CSV), `js/slip.js` (ใบเบิก canvas),
`js/docreport.js` (รายงานรายเดือน), `js/share.js` (แชร์ QR), `js/myhistory.js` (ประวัติของฉัน),
`js/alerts.js` (แจ้งเตือนสต๊อก), `js/auth.js` (login + ขอสิทธิ์)

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
3. `rawFetch({action:"UPDATE", sku, type:"OUT", qty, purpose})` — rawFetch แนบ module/deviceId อัตโนมัติ
4. GAS: `doPost` → `handleRawMaterial` (gas_code.js:2086) → `_withLock(rmUpdate)`
5. `rmUpdate` (gas_code.js:2547): ตรวจ type กับ `RM_TYPES` (gas_code.js:2490) → ปรับ Qty ในชีต Materials
   → ออกเลขที่เอกสาร `_nextDocNo` (gas_code.js:2508, ตัวนับอยู่ชีต Config key `docSeq_*`)
   → ต่อแถวชีต History → แจ้ง Telegram (`sendAlert`) → คืน `{status, docNo, slip:{...}}`
6. หน้าจอเอา `slip` ไปวาดใบเบิกทันที (`openWithdrawSlip` ใน js/slip.js) ไม่ต้องยิงถามซ้ำ

### กติกาสำคัญฝั่ง GAS
- เขียนแบบอ่านก่อนเขียนต้องห่อ `_withLock(fn)` — LockService กันชนกัน (ดู switch gas_code.js:2088-2096)
- **Date ห้ามส่งดิบ** — แปลงเป็น string โซนไทยก่อนเสมอ (บทเรียนใน CLAUDE.md ข้อ 5)
- `ensureColumns(sheet, cols)` เพิ่มคอลัมน์ที่ยังไม่มีและคืน header ล่าสุด —
  **ต้องรับค่าคืนไปใช้** อย่าอ่าน header เก่าซ้ำ (เคยมีบั๊กคอลัมน์ทับกันเพราะจุดนี้)

## ชีตทั้งหมด (โครงประกาศที่ gas_code.js:60-72)

| ชีต | คอลัมน์ | หมายเหตุ |
|---|---|---|
| SQF_Materials / MLM_Materials | SKU, Name, Qty, Unit, Min, DailyUsage, ExpiryDate, LastVerified, Discontinued, AlertDays | Min = จุดสั่งซื้อ |
| SQF_History / MLM_History | Timestamp, Name, Action, Qty, User (+ DocNo, SKU, Unit, Purpose, AckBy, AckAt ที่ ensureColumns เติมทีหลัง) | Action = "เบิกออก"/"รับเข้า"/"คืนวัตถุดิบ"/"ตรวจนับ/ปรับยอด" |
| AppUsers | Username, Active, Role, Password, CreatedAt | role: user/viewer/manager/admin |
| PendingUsers | Username, RequestedAt, Status, ReviewedAt, ReviewedBy | คำขอสิทธิ์จากหน้า login |
| Config | Key, Value | docSeq_*, apiKey (พักไว้), telegram settings |
| ColdRoom_Products / _Stock / _StockIn / _WorkOrders / _DeliveryNotes | ดู gas_code.js:67-72 | ห้องเย็นนับเป็น lot มี MFG/EXP แยก |
| BOM | สูตรผลิต | ใช้โดย bomHealthReport |

## ระบบยืนยันตัวตน

- login ด้วยชื่อ (+ รหัสผ่านถ้าตั้งไว้) → `verifyUser` (GAS) คืน role + `adminToken` ถ้าเป็น admin/manager
- token เก็บ CacheService TTL 6 ชม. (`TOKEN_TTL_SEC` gas_code.js:169) — หมดแล้ว UI เด้ง login ใหม่
  พร้อมเติมชื่อเดิม (`appstock_prefill_user`)
- `SUPER_ADMIN = "kungrc1020"` (gas_code.js:101) ลดสิทธิ์/ลบไม่ได้
- API key: โครงพร้อมแต่ **fail-open โดยตั้งใจ** (`_checkApiKey` gas_code.js:567) — เจ้าของสั่งพักไว้

## PWA / อัปเดตแอป

- `sw.js` — เปลี่ยนอะไรในไฟล์ที่ cache ต้องเลื่อน `CACHE_NAME` (sw.js:6) เสมอ
- อัปเดตอัตโนมัติ: `controllerchange` + เช็คทุก 10 นาที + ตอนสลับแท็บกลับมา (js/app.js)
  มี `_appIsBusy()` กันรีโหลดตอน modal เปิดหรือกำลังพิมพ์
- ปุ่ม "🔄 อัปเดต" = `forceRefresh()` ล้าง cache ทั้งหมดแล้วโหลดใหม่

## Deploy

| ส่วน | วิธี | ตรวจ |
|---|---|---|
| frontend | `git push` → GitHub Actions → GitHub Pages (~30 วิ) | `curl https://kungrckmk.github.io/appstock/sw.js` ดูเลข cache |
| backend | `clasp push -f && clasp deploy -i AKfycbx72vWVvUgaOgZEnzAc8ltaV...` (ID เต็มใน CLAUDE.md) | `clasp deployments` |
| Netlify | **ปิดอยู่** (`if: false` ใน .github/workflows/deploy.yml) token หมดอายุ | — |

มี hook auto-commit + auto-push ใน `.claude/settings.local.json` — ดู CLAUDE.md ข้อ 6

## ตัวอย่างจริง: เพิ่มฟีเจอร์ "รายงานใบเบิกรายเดือน" แตะไฟล์ไหนบ้าง

ฟีเจอร์ล่าสุดที่เพิ่ม (ก.ค. 2569) ใช้เป็นแบบเวลาเพิ่มฟีเจอร์ใหม่:

1. **gas_code.js** — เขียน `rmDocReport` + `rmAckDocs` แล้วเพิ่ม
   `case "DOCREPORT"` / `case "ACKDOC"` ใน `handleRawMaterial` (gas_code.js:2095-2096)
2. **js/docreport.js** (ไฟล์ใหม่) — ฟังก์ชัน prefix `dr*`: `openDocReport` → `rawFetch({action:"DOCREPORT"})` → `drRender`
3. **index.html** — เพิ่ม `#drModal` + ปุ่มในเมนู `⋯ เพิ่มเติม` (index.html:1565) + `<script src="js/docreport.js">`
4. **sw.js** — เพิ่ม `./js/docreport.js` เข้า STATIC_ASSETS + เลื่อน CACHE_NAME
5. deploy ทั้งสองฝั่ง (clasp + git push) แล้ว**ทดสอบกับข้อมูลจริงผ่าน preview** ก่อนบอกว่าเสร็จ

ข้อควรจำ: ฟีเจอร์นี้ยังไม่มีใน mobile.html — ถ้าฟีเจอร์ไหนพนักงานหน้างานต้องใช้ ต้องทำฝั่ง mobile ด้วย (ดู CLAUDE.md ข้อ 1)

## จุดที่รู้ว่าแปลกแต่ตั้งใจ (อย่า "แก้" โดยไม่ถาม)

- `_checkApiKey` fail-open — เจ้าของสั่งพักเรื่อง API key ไว้
- ชีตประวัติแก้ย้อนหลังได้ — เจ้าของปฏิเสธการล็อก อย่าเสนอซ้ำ
- ปุ่ม "ความเคลื่อนไหว" ข้ามคลังถูกถอดจากเมนูแล้ว แต่โค้ด `openActivityPanel` (js/admin.js) ยังอยู่ — เผื่ออนาคตย้ายไปหน้า Admin
- `migrate.html` — เครื่องมือย้ายข้อมูลครั้งแรก ไม่ได้ลิงก์จากที่ไหน เก็บไว้เฉยๆ
- เลขที่เอกสาร 0001-0003 ของปี 2569 ถูกรีเซ็ตทิ้งตอนทดสอบ (30 ก.ค. 2569) ก่อนเปิดใช้จริง — ห้ามรีเซ็ตอีก
