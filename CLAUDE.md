# AppStock — กฎพื้นฐานสำหรับ AI ที่มาทำงานต่อ

ระบบสต๊อก PWA ของโรงงานอาหาร 2 แห่ง (SQF=สุพรรณคิวฟู้ดส์, MLM=แม่ละมาย) + ห้องเย็น
ผู้ใช้จริงคือพนักงานหน้างาน — ภาษาไทยทั้งระบบ รวมถึง commit message และคอมเมนต์ในโค้ด

## สถาปัตยกรรมย่อ 1 บรรทัด

frontend (GitHub Pages, vanilla JS) → Cloudflare Worker (`cloudflare/appstock-api/`) → D1 (SQLite)
· Google Sheets เดิมเป็น **สำเนาอ่านอย่างเดียว** ที่ `gas_code.js` ดึงมาลงเป็นรอบ (ย้ายเมื่อ 2026-09-29)

## ⚠️ กับดัก 9 ข้อ — เคยพลาดมาแล้วทุกข้อ

1. **มี 2 frontend แยกกัน** — `index.html` (ใช้ `js/*.js`) และ `mobile.html` (โค้ดจบในไฟล์เดียว
   รวม util ที่ก๊อปมา เช่น `mathEval` อยู่ทั้ง `js/utils.js` และ `mobile.html`)
   **แก้ UI/ฟีเจอร์ที่ผู้ใช้เห็น ต้องทำสองที่เสมอ** พนักงานหน้างานใช้ mobile เป็นหลัก

2. **แก้ไฟล์ที่แอปโหลดแล้ว ต้องเลื่อนเลข `CACHE_NAME` ใน `sw.js:6`** (เช่น v44 → v45)
   ไม่งั้นผู้ใช้เห็นของเก่า และไฟล์ใหม่ต้องเพิ่มเข้า `STATIC_ASSETS` ด้วย —
   `cache.addAll` เป็น all-or-nothing ไฟล์เดียว 404 = ทั้งชุดไม่ติดตั้ง
   ไลบรารีอยู่ `js/vendor/` (chart, html5-qrcode, qrcode) — **ห้ามเพิ่ม `<script src="https://cdn...">` กลับมา**
   เน็ตโรงงานล่มแล้วแอปต้องเปิดได้ · `npm test` เช็ค STATIC_ASSETS ให้
   · sw.js ไม่ cache คำขอข้ามโดเมน (หลังบ้าน) เด็ดขาด — อย่าแก้กิ่งนั้นให้ cache

3. **แก้โค้ดหลังบ้านแล้วต้อง deploy เอง** — `git push` ขึ้นแค่หน้าจอ หลังบ้านยังเป็นรุ่นเก่าจนกว่าจะรัน
   `cd cloudflare/appstock-api && wrangler deploy`
   ที่อยู่หลังบ้านอยู่ใน `const GAS_URL` ของ `js/app.js` และ `mobile.html` (ชื่อตัวแปรคงเดิมเพราะอ้างทั้งแอป)
   — ห้ามให้สองไฟล์นี้ต่างกัน (`npm test` ตรวจให้)

4. **ห้ามใช้ `var(--sq-*)` ในหน้าต่างพิมพ์** (`window.open("")` + `document.write`)
   CSS variables ของหน้าแม่ไม่ติดไปด้วย ต้องใช้ hex ตรงๆ และรูปต้องเป็น URL เต็ม
   (`logoUrl()` ใน `js/utils.js` มีไว้เพื่อการนี้) ตัวอย่างที่ทำถูก: `sharePrintQr()` ใน `js/share.js`

5. **เวลาในหลังบ้านเป็น UTC เสมอ** — ไทยคือ UTC+7 เที่ยงคืนไทย = 17:00 เมื่อวาน
   วันที่จะคลาดไป 1 วันถ้าใช้ `new Date().toISOString()` ตรงๆ → ใช้ตัวช่วยใน `src/lib.js`
   (`fmtTH`, `dayTH`, `thaiMidnightMs`, `parseLocalDateMs`) และส่งวันที่ออกไปเป็น string ที่แปลงแล้วเสมอ

6. **มี hook auto-commit** (`.claude/settings.local.json`) — ทุก Edit/Write ถูก `git add -A` + commit ทันที
   ในชื่อ `auto: <ไฟล์>` และ push ตอนจบเทิร์น (= ขึ้นระบบจริง) ถ้าจะเขียน commit message เอง
   ให้เขียนงานเสร็จเป็นชุดแล้วรีบ commit ก่อน hook แย่ง หรือยอมรับว่า message หลักไปอยู่ที่ commit ล่าสุดของชุด

7. **ทุก action ที่เขียนข้อมูลต้องมีบัตรผ่าน** — `authGate` ตรวจตาราง `WRITE_MIN_ROLE` (`src/auth.js`) ก่อน
   action ใหม่ที่เขียนข้อมูล **ต้องใส่ในตารางนี้** ไม่งั้นไม่ถูกตรวจ (ใครก็ยิงได้) · ฝั่ง client แนบ token ให้เองแล้ว
   (`js/app.js` ดัก fetch, `gasPost` ใน mobile, `offlineSend`) · การเขียนจากหน้างานให้ผ่าน `offlineSend`
   ไม่ยิง fetch ตรง — เพื่อให้ "เน็ตล่มก็ทำงานได้" และมี `opId` กันหักซ้ำ

8. **Telegram ไม่ส่งในคำขอที่ผู้ใช้รอ** — หลังบ้านส่งหลังตอบแล้ว (`tgNotify` → `ctx.waitUntil`) ส่งไม่ผ่านจะลงตาราง `tg_queue`
   แล้ว cron ทุก 5 นาที / action `TGFLUSH` ส่งซ้ำให้ · หน้าจอยังเรียก `tgFlushSoon()` หลังบันทึกสำเร็จ — จุดบันทึกใหม่เรียกด้วย
   · ไลบรารีหนัก (Chart.js / สแกน QR / QRCode) ไม่โหลดตอนเปิดแอป — ใช้ `await loadVendor("chart"|"qrscan"|"qrcode")` ก่อนเรียก

9. **repo นี้เป็นสาธารณะ และ hook commit ทุกไฟล์ที่เห็น** — เคยทำฐานข้อมูลทดสอบในเครื่อง (ข้อมูลจริง) หลุดขึ้น GitHub มาแล้ว (2026-09-29)
   · เครื่องมือใดที่สร้างไฟล์/โฟลเดอร์สถานะ (`.wrangler/`, export, dump) **ต้องเพิ่ม `.gitignore` ก่อนรันครั้งแรก** แล้วเช็ค `git status`
   · ไฟล์ข้อมูลจริง / กุญแจ / SQL นำเข้า ให้อยู่นอก repo เท่านั้น · ความลับของ Worker ใช้ `wrangler secret put`
   · ทดสอบในเครื่องต้องมี `cloudflare/appstock-api/.dev.vars` ที่มี `TG_DISABLED="1"` — ไม่งั้นข้อความทดสอบเข้ากลุ่ม Telegram จริง

## คำสั่งที่ใช้จริง (ตรวจแล้ว)

- ดูตัวอย่างในเครื่อง: preview server ที่ port 3000 (`.claude/launch.json` ชื่อ `appstock`) — เปิดที่ `http://localhost:3000/` และ `/mobile`
  (ไม่ใช่ `/index.html` — server ตอบ 301) · **หน้าจอในเครื่องชี้ไปหลังบ้านตัวจริง** → ดูได้ อย่ากดบันทึกทดสอบ
- `npm test` = `scripts/check.js` ตรวจก่อนเผยแพร่ (ไวยากรณ์ทุกไฟล์รวมสคริปต์ใน mobile.html และโค้ด Worker, STATIC_ASSETS มีจริง,
  GAS_URL ตรงกัน, คิวออฟไลน์ 7 เคส, CSS มี) — **GitHub Actions รันให้ก่อน deploy ไม่ผ่าน = ไม่ขึ้น Pages** รันเองก่อน push เสมอ
- `npm run build:css` build Tailwind → `css/tw-desktop.css` + `css/tw-mobile.css` (ต้อง `npm install` ครั้งแรก) —
  **เพิ่ม class Tailwind ใหม่ใน index.html / mobile.html / js แล้วต้องรัน** ไม่งั้น class ไม่ติด (ไม่ใช้ CDN แล้ว)
- deploy frontend: `git push` เฉยๆ → GitHub Actions (`.github/workflows/deploy.yml`) ขึ้น GitHub Pages เอง (~30 วิ) · **Netlify ปิดอยู่** (`if: false` ใน workflow)
- deploy backend: `cd cloudflare/appstock-api && wrangler deploy` · ดู log สด: `wrangler tail`
- หลังบ้านในเครื่อง: `wrangler dev --port 8791 --local` (ฐานข้อมูลจำลองอยู่ใน `.wrangler/` — ไม่เข้า git)
  แล้วทดสอบการเขียน 97 เคส: `node tools/write-tests.mjs http://127.0.0.1:8791 ...` (สคริปต์ปฏิเสธ URL ที่ไม่ใช่เครื่องตัวเอง)
- แก้โครงตาราง: เพิ่มใน `schema.sql` แล้วรัน `wrangler d1 execute appstock --remote --command "ALTER TABLE ..."` (D1 ไม่มี migration อัตโนมัติในโปรเจกต์นี้)
- สำเนาลงชีต (GAS): `clasp push -f && clasp deploy -i AKfycbx72vWVvUgaOgZEnzAc8ltaV-a7Rfx_CL9DK1c-B5nAIOxtrlnbi8_b6bmfnDeAZ_xeaw`
  — แตะเฉพาะตอนแก้ตัวดึงสำเนา (`mirrorFromCloud`) · ถอยกลับไป GAS: ตั้ง `MIGRATED_TO_CLOUDFLARE = false` แล้ว deploy
- ไอคอน: `node generate-icons.js` (อ่าน `assets/logo-square.png`)

## รูปแบบโค้ดของโปรเจกต์นี้

- ฟังก์ชัน frontend ขึ้นต้นด้วย prefix ประจำไฟล์: `raw*` (raw.js), `cr*` (coldroom.js), `dr*`, `imp*`, `slip*`, `plan*` (plan.js) — ฟังก์ชันใหม่ต้องตามนี้ เพราะทุกไฟล์แชร์ global scope เดียวกัน
- ฝั่งหลังบ้าน (`cloudflare/appstock-api/src/`): `raw.js` = วัตถุดิบ (`rm*`), `cold.js` = ห้องเย็น (`cr*`), `bom.js`, `auth.js`, `system.js`, `lib.js` (ตัวช่วยกลาง)
  เพิ่ม action ใหม่ที่ switch ใน `handleRaw` (`src/raw.js`) หรือตาราง handler ใน `src/index.js`
- **การคำนวณอยู่ที่หลังบ้านที่เดียว หน้าจอแค่แสดงผล** — มี 2 หน้าจอ ถ้าคิดสองที่ตัวเลขจะไม่ตรงกันสักวัน (ตัวอย่าง: `src/plan.js` → `js/plan.js` + แผ่น `#planSheet` ใน mobile.html)
- มือถือ: อ่านตัวเลขจากช่องกรอกด้วย `numVal()` แสดงด้วย `fmtNum()` — ห้ามใช้ `Number(el.value)` ตรงๆ (ลูกน้ำ/ทศนิยม/โจทย์คิดเลขจะพัง)
- **คำตอบต้องใช้ชื่อ key แบบเดิม** (หัวคอลัมน์ชีต: `SKU`, `Name`, `Qty`, ...) — หน้าจอทั้งสองอ่านชื่อพวกนี้อยู่
- การเขียนที่อ่านก่อนเขียน (read-then-write) ต้องทำใน `env.DB.batch([...])` เดียว และ **ตรวจเงื่อนไขซ้ำใน SQL**
  (เช่น `WHERE qty >= ?`) ไม่ใช่เชื่อค่าที่อ่านมาก่อน — ดูตัวอย่าง `rmUpdate` ใน `src/raw.js`
- สีใช้ token `--sq-*` ที่ประกาศใน `index.html` (มี `--sq-crit/high/warn` สำหรับสถานะ) · mobile ใช้ Tailwind ที่ build ไว้ (`tailwind.mobile.config.js` remap สี slate/indigo เป็นโทนเขียว)
- id ของ DOM ผูกกับโค้ดเยอะมาก (285 id ใน index.html) — **เปลี่ยนชื่อ id/ฟังก์ชันเดิม = พังเงียบ** เช็คให้ทั่วก่อน
- escape ทุกอย่างที่มาจากผู้ใช้ด้วย `escapeHtml`/`escapeAttr`/`escapeJs` (`js/utils.js`)
  · ค่าที่ไปอยู่ใน `onclick="fn('...')"` ต้องใช้ `escapeJsAttr` (escapeJs แล้ว escapeAttr ซ้อน) ไม่ใช่ escapeJs อย่างเดียว

## ข้อตกลงกับเจ้าของ (ห้ามฝ่าฝืน)

- **เป้าหมายระบบ**: ทุกคนร่วมบริหาร งาน Flow ไม่ให้ workload ตกที่คนเดียว — **ห้ามสร้างขั้นตอนอนุมัติที่บล็อกการทำงาน** (เช่น เบิกต้องรออนุมัติ) ให้ใช้แบบ "ทำก่อน รับทราบทีหลัง"
- **ห้ามเสนอซ้ำ**: ล็อกชีตประวัติ (ปฏิเสธแล้ว), เปิด API key (สั่งพักไว้)
- **การยืนยันว่า deploy สำเร็จ** ต้องทดสอบแบบไม่ล้าง cache อย่างน้อยหนึ่งครั้ง — เคยบอกว่าเสร็จแล้วแต่ผู้ใช้ยังเห็นของเก่า
- **ห้ามทดสอบแบบเดาค่าลงข้อมูลจริง** — อ่านค่าปัจจุบันก่อนเสมอ และระวังคิวออฟไลน์ auto-sync ยิงงานทดสอบเอง
  (เคยทำยอดเพี้ยน +5,000) · ตรรกะคิวทดสอบด้วย `npm test` · การเขียนทดสอบกับหลังบ้านในเครื่องเท่านั้น
- บัญชีเจ้าของระบบ (super admin) แตะต้องไม่ได้ — **ชื่อบัญชีอ่านจากตาราง `config` แถว `superAdmin`
  ห้ามเขียนชื่อจริงลงในโค้ดหรือเอกสารใดๆ ใน repo นี้** (repo เป็นสาธารณะ
  กันพนักงานเห็นชื่อ login แล้วลองสุ่มรหัสผ่าน) ชื่อที่แสดงผลถูกพรางเป็น "ผู้ดูแลระบบ" ที่ `maskNames` (`src/lib.js`)
- ก่อนทำงานเช็ค memory directory ของ session — มี backlog และการตัดสินใจเก่าบันทึกไว้

## แผนที่ระบบฉบับเต็ม

ดู `docs/ARCHITECTURE.md` — ตารางทั้งหมด, เส้นทางข้อมูล, ตัวอย่างการเพิ่มฟีเจอร์จริงทีละไฟล์
