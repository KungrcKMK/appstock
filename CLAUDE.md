# AppStock — กฎพื้นฐานสำหรับ AI ที่มาทำงานต่อ

ระบบสต๊อก PWA ของโรงงานอาหาร 2 แห่ง (SQF=สุพรรณคิวฟู้ดส์, MLM=แม่ละมาย) + ห้องเย็น
ผู้ใช้จริงคือพนักงานหน้างาน — ภาษาไทยทั้งระบบ รวมถึง commit message และคอมเมนต์ในโค้ด

## สถาปัตยกรรมย่อ 1 บรรทัด

frontend (GitHub Pages, vanilla JS) → Google Apps Script (`gas_code.js`) → Google Sheets (เป็น DB)

## ⚠️ กับดัก 6 ข้อ — เคยพลาดมาแล้วทุกข้อ

1. **มี 2 frontend แยกกัน** — `index.html` (ใช้ `js/*.js`) และ `mobile.html` (โค้ดจบในไฟล์เดียว
   รวม util ที่ก๊อปมา เช่น `mathEval` อยู่ทั้ง `js/utils.js:169` และ `mobile.html:550`)
   **แก้ UI/ฟีเจอร์ที่ผู้ใช้เห็น ต้องทำสองที่เสมอ** พนักงานหน้างานใช้ mobile เป็นหลัก

2. **แก้ไฟล์ที่แอปโหลดแล้ว ต้องเลื่อนเลข `CACHE_NAME` ใน `sw.js:6`** (เช่น v44 → v45)
   ไม่งั้นผู้ใช้เห็นของเก่า และไฟล์ใหม่ต้องเพิ่มเข้า `STATIC_ASSETS` ด้วย —
   `cache.addAll` เป็น all-or-nothing ไฟล์เดียว 404 = ทั้งชุดไม่ติดตั้ง

3. **deploy GAS ต้องผูก deployment ID เดิม** ไม่งั้น URL เปลี่ยนแล้วแอปทั้งระบบพัง:
   `clasp push -f && clasp deploy -i AKfycbx72vWVvUgaOgZEnzAc8ltaV-a7Rfx_CL9DK1c-B5nAIOxtrlnbi8_b6bmfnDeAZ_xeaw`
   (ID เดียวกับใน `js/app.js:4` และ `mobile.html:472` — ห้ามให้สองไฟล์นี้ต่างกัน)

4. **ห้ามใช้ `var(--sq-*)` ในหน้าต่างพิมพ์** (`window.open("")` + `document.write`)
   CSS variables ของหน้าแม่ไม่ติดไปด้วย ต้องใช้ hex ตรงๆ และรูปต้องเป็น URL เต็ม
   (`logoUrl()` ใน `js/utils.js` มีไว้เพื่อการนี้) ตัวอย่างที่ทำถูก: `sharePrintQr()` ใน `js/share.js`

5. **GAS ส่ง Date เป็น UTC ใน JSON** — ไทยคือ UTC+7 เที่ยงคืนไทย = 17:00 เมื่อวาน
   วันที่จะคลาดไป 1 วันถ้าอ่าน ISO string ตรงๆ ฝั่ง GAS ต้องแปลงเป็น string
   ด้วย `formatCellDate`/`Utilities.formatDate` ก่อนส่งเสมอ (timezone ตั้งใน `appsscript.json` = Asia/Bangkok)

6. **มี hook auto-commit** (`.claude/settings.local.json`) — ทุก Edit/Write ถูก commit ทันที
   ในชื่อ `auto: <ไฟล์>` และ push ตอนจบเทิร์น ถ้าจะเขียน commit message เอง
   ให้เขียนงานเสร็จเป็นชุดแล้วรีบ commit ก่อน hook แย่ง หรือยอมรับว่า message หลักไปอยู่ที่ commit ล่าสุดของชุด

## คำสั่งที่ใช้จริง (ตรวจแล้ว)

- ดูตัวอย่างในเครื่อง: preview server ที่ port 3000 (`.claude/launch.json` ชื่อ `appstock`) — ไม่มี build ไม่มี test ไม่มี lint (`package.json` scripts ว่าง)
- deploy frontend: `git push` เฉยๆ → GitHub Actions (`.github/workflows/deploy.yml`) ขึ้น GitHub Pages เอง (~30 วิ) · **Netlify ปิดอยู่** (`if: false` ใน workflow)
- deploy backend: คำสั่ง clasp ในกับดักข้อ 3 · ตรวจผล: `clasp deployments`
- ไอคอน: `node generate-icons.js` (อ่าน `assets/logo-square.png`)

## รูปแบบโค้ดของโปรเจกต์นี้

- ฟังก์ชัน frontend ขึ้นต้นด้วย prefix ประจำไฟล์: `raw*` (raw.js, 21 ตัว), `cr*` (coldroom.js, 74 ตัว), `dr*`, `imp*`, `slip*` — ฟังก์ชันใหม่ต้องตามนี้ เพราะทุกไฟล์แชร์ global scope เดียวกัน
- ฝั่ง GAS: `rm*` = วัตถุดิบ (รับ `(data, module)`), `cr*` = ห้องเย็น — เพิ่ม action ใหม่ที่ switch ใน `handleRawMaterial` (`gas_code.js:2086`) หรือ `handleColdroom` (`gas_code.js:648`)
- การเขียนที่อ่านก่อนเขียน (read-then-write) ต้องห่อ `_withLock(fn)` เสมอ — ดูตัวอย่างใน switch เดียวกัน
- สีใช้ token `--sq-*` ที่ประกาศใน `index.html` (มี `--sq-crit/high/warn` สำหรับสถานะ) · mobile ใช้ Tailwind CDN ที่ remap สีใน `tailwind.config`
- id ของ DOM ผูกกับโค้ดเยอะมาก (~263 id) — **เปลี่ยนชื่อ id/ฟังก์ชันเดิม = พังเงียบ** เช็คให้ทั่วก่อน
- escape ทุกอย่างที่มาจากผู้ใช้ด้วย `escapeHtml`/`escapeAttr`/`escapeJs` (`js/utils.js`)

## ข้อตกลงกับเจ้าของ (ห้ามฝ่าฝืน)

- **เป้าหมายระบบ**: ทุกคนร่วมบริหาร งาน Flow ไม่ให้ workload ตกที่คนเดียว — **ห้ามสร้างขั้นตอนอนุมัติที่บล็อกการทำงาน** (เช่น เบิกต้องรออนุมัติ) ให้ใช้แบบ "ทำก่อน รับทราบทีหลัง"
- **ห้ามเสนอซ้ำ**: ล็อกชีตประวัติ (ปฏิเสธแล้ว), เปิด API key (โค้ดพร้อมแต่สั่งพักไว้ — `_checkApiKey` เป็น fail-open)
- **การยืนยันว่า deploy สำเร็จ** ต้องทดสอบแบบไม่ล้าง cache อย่างน้อยหนึ่งครั้ง — เคยบอกว่าเสร็จแล้วแต่ผู้ใช้ยังเห็นของเก่า
- บัญชี `Kungrc1020` คือเจ้าของระบบ แตะต้องไม่ได้ (`SUPER_ADMIN` ใน gas_code.js)
- ก่อนทำงานเช็ค memory directory ของ session — มี backlog และการตัดสินใจเก่าบันทึกไว้

## แผนที่ระบบฉบับเต็ม

ดู `docs/ARCHITECTURE.md` — โครงชีตทั้ง 12, เส้นทางข้อมูล, ตัวอย่างการเพิ่มฟีเจอร์จริงทีละไฟล์
