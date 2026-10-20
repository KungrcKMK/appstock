---
name: AppStock
description: ระบบสต๊อกหน้างานของโรงงานอาหาร SQF / MLM / ห้องเย็น — มือถือและหน้าคอมเป็นโลกเดียวกัน "ป้ายความปลอดภัยโรงงาน" ธีม เขียว-ส้ม-ขาว
colors:
  # ── มือถือ (mobile.html · :root --m-*) ──
  m-green: "#00843d"
  m-green-ink: "#006b31"
  m-band: "#f2951c"
  m-red: "#c8102e"
  m-blue: "#005a9c"
  m-warn-ink: "#8a5a00"
  m-ink: "#111111"
  m-ink2: "#3d3d3d"
  m-ground: "#f2f2ef"
  m-panel: "#ffffff"
  m-line: "#d6d6d0"
  m-line2: "#8a8a84"
  m-placeholder: "#6b6b66"
  # เหลืองป้ายเตือน — อยู่ในรูปทรงป้าย warn เท่านั้น (M_SIGN / UI_SIGN / .sg-warn)
  sign-yellow: "#ffd100"
  # สีประจำงาน (t-*) — ชุดเดียวกันทั้งสองหน้าจอ
  t-out: "#c2410c"
  t-ret: "#0369a1"
  t-in: "#047857"
  t-cnt: "#0e7490"
  t-new: "#6d28d9"
  # สีโรงงาน (fac-* มือถือ = --sq-fac-* หน้าคอม)
  fac-sqf: "#c2410c"
  fac-mlm: "#15803d"
  fac-cr: "#0e7490"
  # ── หน้าคอม (index.html · :root --sq-*) ──
  sq-green: "#00843d"
  sq-band: "#f2951c"
  sq-ground: "#f2f2ef"
  sq-surface: "#ffffff"
  sq-raised: "#f7f7f4"
  sq-line: "#d6d6d0"
  sq-line-soft: "#e6e6e1"
  sq-line2: "#8a8a84"
  sq-ink: "#111111"
  sq-ink2: "#3d3d3d"
  sq-muted: "#5c5c57"
  sq-accent: "#006b31"
  sq-accent-2: "#e3f1e8"
  sq-crit: "#c8102e"
  sq-crit-bg: "#fbe9ec"
  sq-high: "#a8560a"
  sq-high-bg: "#fdf0e2"
  sq-warn: "#8a5a00"
  sq-warn-bg: "#fff6cc"
  sq-must: "#005a9c"
  sq-must-bg: "#e5eff8"
  sq-none-bg: "#ecece8"
  sq-focus-halo: "#fde0bd"
typography:
  m-title:
    fontFamily: "Kanit, Sarabun, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.25
  m-qty-sheet:
    fontFamily: "Kanit, Sarabun, system-ui, sans-serif"
    fontSize: "48px"
    fontWeight: 700
    lineHeight: 1
  m-qty-list:
    fontFamily: "Kanit, Sarabun, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1
  m-confirm:
    fontFamily: "Kanit, Sarabun, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
  m-name:
    fontFamily: "Sarabun, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 800
    lineHeight: 1.25
  m-body:
    fontFamily: "Sarabun, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
  m-meta:
    fontFamily: "Sarabun, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.35
  m-label:
    fontFamily: "Sarabun, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 800
  m-sku:
    fontFamily: "ui-monospace, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 700
  sq-page-title:
    fontFamily: "Kanit, Sarabun, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.2
  sq-modal-title:
    fontFamily: "Kanit, Sarabun, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.3
  sq-tile-num:
    fontFamily: "Kanit, Sarabun, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
  sq-qty:
    fontFamily: "Kanit, Sarabun, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.2
  sq-nav-warehouse:
    fontFamily: "Kanit, Sarabun, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
  sq-body:
    fontFamily: "Sarabun, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
  sq-control:
    fontFamily: "Sarabun, sans-serif"
    fontSize: "13.5px"
    fontWeight: 800
  sq-label:
    fontFamily: "Sarabun, sans-serif"
    fontSize: "12.5px"
    fontWeight: 700
  sq-mono:
    fontFamily: "ui-monospace, Cascadia Mono, SF Mono, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  sign: "0px"
  plate: "6px"
  confirm: "8px"
  tag: "4px"
  badge: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  m-header:
    backgroundColor: "{colors.m-green}"
    textColor: "{colors.m-panel}"
    typography: "{typography.m-title}"
  m-row:
    backgroundColor: "{colors.m-panel}"
    textColor: "{colors.m-ink}"
    rounded: "{rounded.plate}"
    padding: "10px 12px"
  m-chip:
    backgroundColor: "{colors.m-panel}"
    textColor: "{colors.m-ink}"
    rounded: "{rounded.plate}"
    height: "40px"
  m-chip-on:
    backgroundColor: "{colors.m-green}"
    textColor: "{colors.m-panel}"
    rounded: "{rounded.plate}"
    height: "40px"
  m-field:
    backgroundColor: "{colors.m-panel}"
    textColor: "{colors.m-ink}"
    typography: "{typography.m-body}"
    rounded: "{rounded.plate}"
    height: "48px"
  m-btn:
    backgroundColor: "{colors.m-panel}"
    textColor: "{colors.m-ink}"
    rounded: "{rounded.plate}"
    height: "44px"
  m-btn-go:
    backgroundColor: "{colors.m-green}"
    textColor: "{colors.m-panel}"
    rounded: "{rounded.plate}"
    height: "48px"
  m-confirm-out:
    backgroundColor: "{colors.t-out}"
    textColor: "{colors.m-panel}"
    typography: "{typography.m-confirm}"
    rounded: "{rounded.confirm}"
    padding: "14px 12px"
    height: "60px"
  m-confirm-in:
    backgroundColor: "{colors.t-in}"
    textColor: "{colors.m-panel}"
    typography: "{typography.m-confirm}"
    rounded: "{rounded.confirm}"
    padding: "14px 12px"
    height: "60px"
  m-tab:
    backgroundColor: "{colors.m-panel}"
    textColor: "{colors.m-ink2}"
    typography: "{typography.m-label}"
    height: "62px"
  m-tab-on:
    backgroundColor: "{colors.m-panel}"
    textColor: "{colors.m-green-ink}"
    typography: "{typography.m-label}"
    height: "62px"
  m-toast-ok:
    backgroundColor: "{colors.m-green}"
    textColor: "{colors.m-panel}"
    rounded: "{rounded.plate}"
  m-toast-warn:
    backgroundColor: "{colors.m-band}"
    textColor: "{colors.m-ink}"
    rounded: "{rounded.plate}"
  m-toast-err:
    backgroundColor: "{colors.m-red}"
    textColor: "{colors.m-panel}"
    rounded: "{rounded.plate}"
  m-hazard:
    backgroundColor: "{colors.m-band}"
    textColor: "{colors.m-ink}"
    rounded: "{rounded.plate}"
    padding: "14px 12px"
  sq-nav:
    backgroundColor: "{colors.sq-green}"
    textColor: "{colors.sq-surface}"
    typography: "{typography.sq-nav-warehouse}"
  sq-nav-active:
    backgroundColor: "{colors.sq-surface}"
    textColor: "{colors.sq-ink}"
    rounded: "{rounded.plate}"
    height: "42px"
  sq-btn:
    backgroundColor: "{colors.sq-surface}"
    textColor: "{colors.sq-ink}"
    typography: "{typography.sq-control}"
    rounded: "{rounded.plate}"
    height: "38px"
  sq-btn-primary:
    backgroundColor: "{colors.sq-green}"
    textColor: "{colors.sq-surface}"
    typography: "{typography.sq-control}"
    rounded: "{rounded.plate}"
    height: "38px"
  sq-btn-primary-hover:
    backgroundColor: "{colors.sq-accent}"
    textColor: "{colors.sq-surface}"
  sq-row-action:
    backgroundColor: "{colors.sq-surface}"
    textColor: "{colors.sq-ink}"
    rounded: "{rounded.plate}"
    padding: "4px 11px"
    height: "34px"
  sq-row-action-solid:
    backgroundColor: "{colors.sq-green}"
    textColor: "{colors.sq-surface}"
    rounded: "{rounded.plate}"
    padding: "4px 11px"
    height: "34px"
  sq-chip:
    backgroundColor: "{colors.sq-surface}"
    textColor: "{colors.sq-ink}"
    rounded: "{rounded.plate}"
    padding: "4px 11px"
    height: "34px"
  sq-chip-on:
    backgroundColor: "{colors.sq-green}"
    textColor: "{colors.sq-surface}"
    rounded: "{rounded.plate}"
    height: "34px"
  sq-plate:
    backgroundColor: "{colors.sq-surface}"
    textColor: "{colors.sq-ink}"
    rounded: "{rounded.plate}"
  sq-field:
    backgroundColor: "{colors.sq-surface}"
    textColor: "{colors.sq-ink}"
    rounded: "{rounded.plate}"
  sq-modal:
    backgroundColor: "{colors.sq-surface}"
    textColor: "{colors.sq-ink}"
    typography: "{typography.sq-modal-title}"
    rounded: "{rounded.sign}"
  sq-confirm-out:
    backgroundColor: "{colors.t-out}"
    textColor: "{colors.sq-surface}"
    typography: "{typography.m-confirm}"
    rounded: "{rounded.confirm}"
    padding: "14px 12px"
    height: "60px"
  sq-toast-warn:
    backgroundColor: "{colors.sq-band}"
    textColor: "{colors.sq-ink}"
    rounded: "{rounded.plate}"
---

# Design System: AppStock

ค่าทั้งหมดอิงของที่ใช้อยู่จริงในโค้ด · ผู้ใช้หลักคือพนักงานหน้างานโรงงานอาหาร ใช้มือถือกลางแดด/ในห้องเย็น/ใส่ถุงมือ
และหัวหน้า/แอดมินที่ใช้คอม: **อ่านง่ายและกดง่ายมาก่อนสวย**

AppStock มี **2 หน้าจอ โลกเดียว** ใช้หลังบ้านเดียวกัน:

- **มือถือ** (`mobile.html` ไฟล์เดียว · token `--m-*`): แบบป้ายความปลอดภัยโรงงาน ทำใหม่ 2026-10-19 ·
  ส่วน **Overview → Do's and Don'ts** ด้านล่างเป็นกติกาของโลกนี้ ยกตัวอย่างจากมือถือเป็นหลัก
- **หน้าคอม** (`index.html` + `js/*.js` · token `--sq-*`): ย้ายเข้าโลกเดียวกัน 2026-10-20 (บรีฟ `.impeccable/surfaces/index-html.md`) ·
  รายละเอียดเฉพาะหน้าคอมอยู่ในส่วน **หน้าคอม (index.html)** ท้ายไฟล์
- **ธีม เขียว-ส้ม-ขาว** ตามสีประจำโรงงาน (เจ้าของสั่ง 2026-10-20) ใช้ทั้งสองหน้าจอ
- กติกาที่ใช้ร่วมกัน (คำที่ใช้ · สีประจำงาน · สีโรงงาน · ตรวจก่อนรวม) อยู่ท้ายสุด

## Overview

**Creative North Star: "ป้ายความปลอดภัยในโรงงาน" (ISO 7010)**

แอปพูดภาษาเดียวกับป้ายที่ติดอยู่ทั่วโรงงาน: ผนังเทาอ่อน แผ่นป้ายขาวขอบบาง หัวเขียวเซฟตี้มีแถบส้มสัญญาณขอบล่าง
สถานะของแต่ละรายการบอกด้วย **รูปทรงป้าย** (วงกลมขีดแดง / สามเหลี่ยมเหลือง / วงกลมน้ำเงิน / สี่เหลี่ยมเขียว) ไม่ใช่สีอย่างเดียว
คนตาบอดสีหรือจอโดนแดดก็ยังแยกออก เปิดคลังมาแล้วป้ายแดงและเหลืองขึ้นก่อน พนักงานรู้ทันทีว่าตัวไหนต้องจัดการ

สีมี 2 หน้าที่แยกกันชัด: **เขียว-ส้ม-ขาว คือตัวแบรนด์** (หัวจอ กรอบแผ่นป้าย ปุ่มหลัก ชิปที่เลือก แถบสัญญาณ)
ส่วน **แดง เหลือง น้ำเงิน เขียว ในรูปทรงป้ายคือความหมาย** ตาม ISO และไม่เปลี่ยนตามธีม

ความหนาแน่นปานกลางบนมือถือ (ตัวเลขใหญ่) และหนาแน่นแบบคอมบนหน้าคอม (ตารางหลายคอลัมน์) · หัวข้อและตัวเลขใช้ Kanit หนา เนื้อหาใช้ Sarabun ·
มุมเกือบเหลี่ยม เส้นขอบชัด เงาน้อยมาก ความลึกมาจากกรอบเขียวและแถบส้ม ไม่ใช่จากเงา ·
ปฏิเสธรูปแบบตั้งต้นของแอปสต๊อก (รายการพื้นมืด + สีเน้นสีเดียว) และหน้าแอดมินสำเร็จรูป (แถบกรมท่า ปุ่มเม็ดยาว emoji แทนไอคอน ป๊อปอัปสีม่วง) ที่เคยเป็น

**Key Characteristics:**
- พื้นเทาผนังโรงงาน + แผ่นป้ายขาวขอบบาง
- หัวจอ/แถบเมนูเขียวเซฟตี้เต็มกว้าง แถบส้ม 6px ขอบล่าง
- สถานะ = รูปทรงป้าย ISO 7010 + คำพูดเสมอ
- ปุ่มยืนยันเป็นแผ่นป้ายสีตามงาน อ่านทวน "เบิก 500 ใบ" ก่อนกด
- ไอคอนเส้นชุดเดียวทั้งแอป ไม่มี emoji บนส่วนควบคุม

## Colors

ธีม เขียว-ส้ม-ขาว บนพื้นเทาอ่อน · เขียว = แบรนด์และไปต่อ · ส้ม = แถบสัญญาณ (ตกแต่ง) · แดง/เหลือง/น้ำเงินอยู่ในป้ายสถานะ

### Primary
- **เขียวเซฟตี้** (`--m-green` / `--sq-green`): หัวจอและแถบเมนู · กรอบแผ่นป้ายที่เน้น (`.m-card` `.m-fac` `.m-tile.on`, หน้าต่างหน้าคอม) ·
  ขอบปุ่มรอง `.m-btn` · ปุ่มหลัก/ปุ่มไปต่อ (`.m-btn-go` `.m-btn-ink` `.sq-btn-primary`) · ชิปที่เลือก · ขอบบนเมนูล่าง · toast สำเร็จ · ป้ายสี่เหลี่ยม "พอ"
  ตัวขาวบนพื้นนี้ 4.8:1 · **ห้ามใช้เป็นสีตัวหนังสือบนพื้นอ่อน** (บนพื้นเทาได้แค่ 4.3:1)
- **เขียวตัวหนังสือ** (`--m-green-ink` = `--sq-accent`): ตัวหนังสือเขียวทุกที่บนพื้นเทา/ขาว (`.m-go`, แท็บที่เลือก) · สีปุ่มหลักตอนชี้ (hover) บนหน้าคอม · 5.9:1 บนพื้นเทา

### Secondary
- **ส้มประจำโรงงาน** (`--m-band` / `--sq-band`): แถบล่างของหัวจอ/แถบเมนู · แถบบนของแผ่นเลื่อน การ์ดลอย หน้าต่าง · แถบเตือน `.m-warnbar` ·
  เทปกั้นคิวออฟไลน์ (ลายทแยงส้ม-ดำ) · toast เตือน · กรอบเล็งกล้อง · วงโฟกัสในจอสแกน
  **เป็นสีตกแต่ง/พื้นเท่านั้น** ตัวหนังสือบนส้มเป็นหมึกดำ · ห้ามเป็นตัวหนังสือบนขาว (2.3:1) · ห้ามวางตัวขาวบนส้ม
- **ตัวหนังสือเตือน** (`--m-warn-ink` = `--sq-warn`): คำเตือนบนพื้นอ่อน ("ต่ำกว่าจุดสั่งซื้อ", ใกล้หมดอายุ) · 5.3:1 บนพื้นเทา

### Tertiary (สีความหมายของป้าย ISO: ไม่เปลี่ยนตามธีม)
- **แดงห้าม** (`--m-red` = `--sq-crit`): หมด / หมดอายุ / ส่งไม่สำเร็จ / ปุ่มออกจากระบบ / ป้ายตัวเลข · 5.9:1 บนขาว (ใช้เป็นทั้งตัวหนังสือและพื้นตัวขาว)
- **เหลืองป้ายเตือน** (`sign-yellow`): **อยู่ในรูปทรงสามเหลี่ยมเตือนเท่านั้น** (`M_SIGN.warn` / `UI_SIGN.warn` / `.sg-warn`) คู่ขอบและ "!" สีหมึก
- **น้ำเงินบังคับ** (`--m-blue` = `--sq-must`): ป้ายวงกลม "ต้องนับ" และคำว่า "ไม่อัปเดต" · toast ข้อมูลบนหน้าคอม · 7.1:1 บนขาว

### Neutral
- **ผนังโรงงาน** (`--m-ground` = `--sq-ground`): พื้นหลังทุกหน้า · พื้นช่องรอง `.m-well`
- **แผ่นป้าย** (`#fff`): แถว การ์ด ช่องกรอก ปุ่มรอง เมนูล่าง หัวหน้าต่าง
- **หมึกดำ** (`--m-ink` = `--sq-ink`): ตัวหนังสือหลัก · ขอบช่องกรอกบนมือถือ (`.m-field` 2px) · ตัวหนังสือบนส้ม · วงโฟกัสบนมือถือ
- **หมึกรอง** (`--m-ink2`): บรรทัดรอง หน่วย ป้ายช่องกรอก (9.7:1 บนพื้นเทา)
- **เส้นบาง** (`--m-line`): ขอบแผ่นป้าย/แถว 1.5px · **เส้นกลาง** (`--m-line2`): ขอบชิป ปุ่มเลือกงานที่ยังไม่เลือก และปุ่ม/ช่องกรอกบนหน้าคอม
- **ตัวอย่างในช่อง** (`#6b6b66`): placeholder (5.4:1) ตั้งที่ `body input::placeholder` ให้ชนะ preflight ของ Tailwind (ทั้งสองหน้าจอ)

### สีประจำงานและสีโรงงาน
- **สีประจำงาน** (`.t-out` `.t-ret` `.t-in` `.t-cnt` `.t-new`) ชุดเดียวกันทั้งสองหน้าจอ: เบิกส้มอิฐ คืนฟ้า รับเขียว นับฟ้าเขียว ใหม่ม่วง ·
  ตัวขาวบนทุกสีผ่าน 5.1:1 ขึ้นไป · ใช้กับปุ่มเลือกงานที่เลือกแล้ว ปุ่มยืนยัน และไอคอนในประวัติของฉัน (`MYHIST_STYLE`)
- **สีโรงงาน** (`fac-*` = `--sq-fac-*`): SQF ส้มอิฐ · MLM เขียว (เจ้าของเลือก 2026-10-10) · ห้องเย็นฟ้าเขียว ·
  มือถือใช้เฉพาะช่องไอคอนของแผ่นป้ายคลัง · หน้าคอมใช้กับแถบบนของการ์ดคลัง จุดหน้าชื่อโรงงาน และไอคอนคลัง
- **สีวันที่ใช้ได้** (`daysColor`): ≤7 วัน แดง · ≤14 ส้ม `#c2410c` · ≤30 `--m-warn-ink` · มากกว่านั้น `--m-green-ink`

### Named Rules
**The Orange-Is-A-Band Rule.** ส้มเป็นแถบและพื้นเท่านั้น ตัวหนังสือบนส้มเป็นหมึกดำ ไม่มีตัวขาวบนส้ม ไม่มีตัวส้มบนพื้นอ่อน

**The Sign-Colors-Mean-Something Rule.** แดง เหลือง น้ำเงิน ในรูปทรงป้ายคือความหมาย ISO ไม่ใช่สีตกแต่ง · เหลือง `#ffd100` อยู่ในสามเหลี่ยมเตือนเท่านั้น

**The Ink-Variant Rule.** สีที่เป็นพื้น (`--m-green`, ส้ม) กับสีที่เป็นตัวหนังสือ (`--m-green-ink`, `--m-warn-ink`) เป็นคนละ token ตัวหนังสือสีบนพื้นอ่อนใช้ตัว `-ink` เท่านั้น

## Typography

**Display Font:** Kanit 700 (เก็บในแอป `fonts/kanit.css` · thai + latin · มีน้ำหนักเดียว) ผ่าน `--m-head` / `--sq-head` = `'Kanit','Sarabun',system-ui,sans-serif`
**Body Font:** Sarabun 400/600/800 (เก็บในแอป `fonts/sarabun.css`)
**Label/Mono Font:** `ui-monospace, Consolas, monospace` 700 สำหรับรหัสสินค้า (`.m-sku`) · หน้าคอมใช้ `--sq-mono` กับรหัส เวลา และตัวเลขในตารางหลายคอลัมน์

**Character:** Kanit หนาแบบตัวพิมพ์บนป้ายสำหรับหัวข้อและตัวเลขที่ต้องอ่านไกล · Sarabun อ่านง่ายสำหรับเนื้อหาภาษาไทย

### Hierarchy
- **Display** (Kanit 700, 48px `text-5xl`, 1): ยอดคงเหลือ/วันที่ใช้ได้บนแผ่นเบิก (มือถือ)
- **Headline** (Kanit 700, 24px, 1.25): ชื่อคลัง/ชื่อหน้าบนหัวจอมือถือ · หน้าคอม: หัวหน้า 26px · หัวหน้าต่าง 22px
- **Title** (Kanit 700, 26px, 1): ตัวเลขจำนวนในแถวมือถือ · (Kanit 700, 20px): ข้อความบนปุ่มยืนยันทั้งสองหน้าจอ · หน้าคอม: ตัวเลขการ์ดสรุป 28px · ยอดในตาราง 19px · ปุ่มคลังบนแถบเมนู 16px
- **Body** (Sarabun 800, 16px, 1.25): ชื่อสินค้าในแถวมือถือ · (Sarabun, ≥16px): ทุกช่องกรอกบนมือถือ · หน้าคอม: เนื้อหา 13–14px · ปุ่ม 13.5px/800
- **Label** (Sarabun 600–800, 13px): บรรทัดสถานะใต้ชื่อ (`.m-meta`) ชิป · (12px): หน่วยใต้ตัวเลข ชื่อแท็บ หัวกลุ่มเมนู หัวตารางหน้าคอม 12.5px · **12px คือขั้นต่ำ**

### Named Rules
**The Kanit-For-Signs Rule.** Kanit ใช้กับหัวข้อ ตัวเลขเดี่ยว และปุ่มยืนยันเท่านั้น (`.m-k` / `.ui-k` หรือ `var(--m-head)` / `var(--sq-head)`) เนื้อหาและป้ายช่องกรอกเป็น Sarabun

**The 16px Input Rule.** ช่องกรอกทุกช่องบนมือถือ ≥ 16px (`font-size:max(16px,1em)`) ไม่งั้น iPhone ซูมหน้าเอง · **ห้ามใส่ `text-sm` ที่ช่องกรอก** (คลาสชนะกฎนี้)

- ห้ามตัวเอียงและห้าม uppercase กับภาษาไทย · ตัวเลขทุกตัวผ่าน `fmtNum()` (มีลูกน้ำคั่นหลักพัน)

## Layout

- คอลัมน์เดียวเต็มกว้าง (มือถือ): หัวจอ → ปุ่มสแกน → dropdown → ช่องค้นหา → ตารางชิป 3 ช่อง (ไม่เลื่อนข้าง) → รายการ (เลื่อนในตัว) → เมนูล่าง fixed
- ระยะขอบข้าง 12px (`px-3`) ในเนื้อหา · 16px (`px-4`) ในหัวจอ · ระยะระหว่างแถว 6px (`space-y-1.5`) · ระยะขั้น 4 / 8 / 12 / 16 / 24
- รายการเว้นล่าง `pb-24` กันโดนเมนูล่างบัง · แสดงทีละ 50 แถว แล้วมีปุ่ม "แสดงเพิ่ม"
- หัวจอเว้นใต้แถบสถานะ iPhone ด้วย `.m-safe-top` (`env(safe-area-inset-top)` + 12px) **คู่กับ `pt-3`** เป็นค่าสำรอง · ด้านล่างใช้ `.pb-safe`
- ตัวอักษรใหญ่จนส่วนหัวสูงเกินครึ่งจอ → `mFitHeader` ใส่ `.m-scroll-all` ให้เลื่อนทั้งหน้ารวมกัน
- **แท็บเล็ต ≥ 700px**: เนื้อหา (`.m-wrap`) และแผ่นเลื่อน (`.m-sheet`) กว้างไม่เกิน 640px กลางจอ · หัวจอและเมนูล่างยังเต็มกว้าง ·
  หน้าใหม่ต้องใส่ `m-wrap` ที่ส่วนเนื้อหา
- **ไม่มีแถวที่ต้องเลื่อนซ้าย-ขวา** ทั้งสองหน้าจอ (เจ้าของสั่ง 2026-10-20): แถวปุ่ม ชิป แท็บ ใช้ตาราง หรือ `flex-wrap` ขึ้นบรรทัดใหม่
- **สมมาตร**: ปุ่มในกลุ่มเดียวกันกว้างเท่ากันหรือเรียงบรรทัดเดียว (รายละเอียดหน้าคอมอยู่ท้ายไฟล์)

## Elevation & Depth

แบนเป็นหลัก ความลึกมาจาก **กรอบเขียว + แถบส้ม + ขอบเส้น** ไม่ใช่เงา (`--sq-shadow:none`) · เงามีแค่ของที่ลอยทับหน้าอื่นจริง

### Shadow Vocabulary
- **แผ่นเลื่อนขึ้น** (`box-shadow: 0 -8px 30px rgba(0,0,0,.3)`): `.m-sheet` แผ่นเบิก/รับ/คืน/นับ
- **toast** (`box-shadow: 0 8px 24px rgba(0,0,0,.25)` มือถือ · `0 8px 20px rgba(0,0,0,.2)` หน้าคอม)
- **หน้าต่างหน้าคอม** (`box-shadow: 0 18px 44px rgba(0,0,0,.35)`): `.ui-modal > div` · **เมนูเพิ่มเติม** (`0 10px 24px rgba(0,0,0,.18)`)
- **ขอบในปุ่มยืนยัน** (`box-shadow: inset 0 0 0 3px #fff`): เส้นขาวด้านในแบบแผ่นป้าย (`.m-confirm` / `.ui-confirm`)
- **เส้นสถานะด้านใน**: แท็บที่เลือก `inset 0 4px 0 var(--m-green)` · ไทล์ต้องสั่งที่เลือก `inset 0 -4px 0 var(--m-green)`

### Named Rules
**The Border-Not-Shadow Rule.** แผ่นป้ายบนพื้นแยกด้วยขอบ 1.5–2px ไม่ใช่เงา เงาสงวนไว้ให้แผ่นเลื่อน toast หน้าต่าง และเมนูที่ลอย

## Shapes

- มุมเกือบเหลี่ยม **6px** ทุกแผ่น/ปุ่ม/ชิป/ช่องกรอก · ปุ่มยืนยัน 8px · ป้ายข้อความเล็ก (`.ui-tag`, ป้ายสถานะ) 4px
- **แผ่นที่มีแถบหนาบน (ส้ม 6px หรือสีโรงงาน 6–8px) มุม 0**: `.m-sheet` `.m-card` หน้าต่างหน้าคอม การ์ดคลังหน้าแรก การ์ดที่มีแถบสีคลัง (แถบหนาบนมุมมนดูบิด)
- ขอบ: แผ่นป้าย/แถว 1.5px `--m-line` · ช่องกรอกมือถือ 2px หมึก · ปุ่มรองมือถือ ชิปที่เน้น แผ่นป้ายคลัง 2px เขียว · ชิปปกติ 1.5px `--m-line2` · เมนูล่างขอบบน 3px เขียว
- รูปทรงป้ายสถานะ (SVG viewBox 34): วงกลมขีด · สามเหลี่ยม · วงกลมทึบ · สี่เหลี่ยมมุม 4 · ห้ามคิดรูปทรงใหม่
- วงกลมเต็มมีแค่ป้ายตัวเลข (`.m-badge`, `.nav-badge`, `.home-badge`) และขีดจับของแผ่นเลื่อน
- Tailwind หน้าคอม remap `rounded-lg/xl` = 6px · `rounded-2xl/3xl` = 8px (`tailwind.desktop.config.js`)

## Components

### Buttons
- **Shape:** มุม 6px (ปุ่มยืนยัน 8px) · สูง ≥ 44px (`.m-btn`) · ≥ 48px (`.m-btn-ink`, `.m-btn-go`) · ปุ่ม +/− 48×48
- **รอง (`.m-btn`):** ขาว ขอบเขียว 2px ตัวหมึก 800: ปิด / คิดเลข / คัดลอก / ปุ่มเครื่องมือหน้าเลือกคลัง (`.m-tool` สูง 64 ไอคอนบน ชื่อล่าง)
- **เขียว (`.m-btn-go`, `.m-btn-ink`):** ปุ่มไปต่อ/ลองใหม่/ส่งต่อ และปุ่มสแกนเต็มกว้าง (`.m-btn-ink` เดิมดำ ตอนนี้ค่าเดียวกับ `.m-btn-go`) · 1 ปุ่มหลักต่อส่วน
- **บนหัวจอ (`.m-btn-line`):** ขอบขาว 2px ตัวขาว: "‹ คลัง", โหลดใหม่, ปิด
- **กด:** `.btn-tap:active` จาง .75 ย่อ .97 · กดไม่ได้: จาง .5 ลดสี · โฟกัสคีย์บอร์ด: เส้นหมึก 3px ห่าง 2px (ในจอสแกน = ส้ม)

### ปุ่มเลือกงาน + ปุ่มยืนยัน (ลายเซ็นของแอป)
- **ปุ่มเลือกงาน (`.m-type`):** สูง 52 ขาว ขอบ `--m-line2` · เลือกแล้ว = `.m-type.on` + `t-*` พื้นสีงาน ตัวขาว ขอบ `rgba(0,0,0,.3)` (`setType`)
- **ปุ่มยืนยัน (`.m-confirm`):** แผ่นป้ายสีตามงานที่เลือก ขอบ `rgba(0,0,0,.3)` 2px + เส้นขาวด้านใน 3px · Kanit 20px · สูง ≥ 60 ·
  ข้อความอ่านทวน "เบิก 500 ใบ" / "รับเข้า 3 กระสอบ" / "บันทึกยอดนับ 40 ม้วน" จาก `confirmLabel()` · ไอคอนจาก `.icb` + `--i` ของ `t-*`
- ตั้งใจต่างจากสัญญาทิศทาง ("ปุ่มเขียวแบบป้ายทางออก"): สีตามงานกันกดผิดประเภท (หลัก "กันกดผิดก่อนสวย")

### Chips
- **Style (`.m-chip`):** ขาว ขอบ 1.5px `--m-line2` มุม 6 ตัว 13px/800 สูง 40 · `.hot` = ขอบเขียว 2px (มีป้ายรูปทรงนำหน้า) · `.on` = พื้นเขียว ตัวขาว
- **ตัวกรองรายการ (`renderChips`):** key `all` ทั้งหมด · `no` หมด/หมดอายุ · `warn` ต้องสั่ง/ใกล้หมดอายุ · `must` ไม่อัปเดต · `freq` ใช้บ่อย (ไอคอนดาว) ·
  ใช้ป้ายรูปทรงเดียวกับในแถว (`mSign(k, 18)`) · ชิปขึ้นเฉพาะกลุ่มที่มีรายการ ยกเว้น **"ทั้งหมด" ขึ้นเสมอ (= ทางกลับ)** · มี `aria-pressed`
  · วางเป็นตาราง `grid-cols-3 grid-flow-row-dense` · "ต้องสั่ง/ใกล้หมดอายุ" กว้าง 2 ช่อง · คำยาวตัดหลัง "/" เท่านั้น (ห่อคำด้วย `whitespace-nowrap` กันตัด "หมด|อายุ")
- **ไทล์ต้องสั่ง (`.m-tile`):** ตาราง 4 ช่อง · ป้ายเล็กอยู่ข้างตัวเลข ชื่ออยู่ใต้ตัวเลข · เลือกแล้วขอบเขียว 2px + เส้นเขียวด้านล่าง
- **ช่องสรุปของฉัน:** แผ่นขาวขึ้นบรรทัดใหม่เอง (`flex-wrap`) ชื่อยาวตัดบรรทัดในแผ่น

### Cards / Containers
- **แถวรายการ (`.m-row`):** grid `34px | 1fr | auto`: ป้ายรูปทรงซ้าย · ชื่อ (16/800) + บรรทัดสถานะ (13) กลาง · จำนวน Kanit 26 + หน่วย 12 ขวา ·
  ขาว ขอบ 1.5px มุม 6 padding 10/12 · ยอด ≤ 0 ตัวเลขแดง · บรรทัดสถานะเป็นคำเสมอ (`หมดแล้ว` แดง · `ต่ำกว่าจุดสั่งซื้อ` warn-ink · `ไม่อัปเดต N วัน` น้ำเงิน · `พอ N วัน` ตาม `daysColor`)
- **แผ่นป้าย (`.m-panel`):** ขาว ขอบ 1.5px · **ช่องรอง (`.m-well`):** พื้นเทา ขอบ 1.5px
- **แผ่นเลื่อน (`.m-sheet`):** ขาว แถบส้ม 6px บน มุม 0 เงาขึ้นบน สูงไม่เกิน 85dvh · **การ์ดลอย (`.m-card`):** ขาว กรอบเขียว 2px แถบส้มบน 6px มุม 0 (แชร์แอป, กำลังโหลด)
- **แผ่นป้ายคลัง (`.m-fac`):** ขาว กรอบเขียว 2px สูง ≥ 76 ช่องไอคอนสีโรงงานกว้าง 60 ซ้าย ชื่อคลัง Kanit + บรรทัดรอง + "›"

### Inputs / Fields
- **Style (`.m-field`):** ขาว ขอบหมึก 2px มุม 6 สูงจากตัว `py-3` · ตัว ≥ 16px · ทุกช่องมี `<label for>` หรือ `aria-label`
- **Focus:** เส้นหมึก 3px ห่าง 2px (`:focus-visible`)
- **ช่องจำนวน:** ตัวเลขใหญ่กลางระหว่างปุ่ม −/+ · รับโจทย์คิดเลข (`numVal`) · placeholder ของช่องจำนวน 20px ให้เล็กกว่าตัวเลขจริง ·
  ตอนนับช่องว่างให้พิมพ์ยอดจริง · ใต้ช่องบอกยอดหลังบันทึก (`updateAfter`) เกินยอด = แดง

### Navigation
- **หัวจอ (`.m-head` + `.m-safe-top` + `pt-3`):** เขียวเต็มกว้าง แถบส้ม 6px ล่าง · ซ้าย ปุ่มขอบขาว · กลาง ชื่อ Kanit 24 + บรรทัดรอง 12 · ขวา ปุ่มไอคอน 44
- **เมนูล่าง (`.m-nav` / `.m-tab`):** ขาว ขอบบนเขียว 3px · แท็บสูง 62 ไอคอน 26 + ชื่อ 12/800 สีหมึกรอง ·
  เลือกอยู่ (`.m-tab.on` + `aria-current`) = ตัวเขียว `--m-green-ink` + แถบเขียว 4px บน · ป้ายตัวเลข `.m-badge` แดงตัวขาว

### Status Signs (มือถือ `mSign` · `M_SIGN` · `mSignOf` · `M_RANK` / หน้าคอม `uiSign` · `UI_SIGN` · `.ui-sg .sg-*`)
| key | รูปทรง | ความหมาย | ลำดับ |
|---|---|---|---|
| `no` | วงกลมขีดแดง | หมด / หมดอายุ | 0 |
| `warn` | สามเหลี่ยมเหลือง ขอบหมึก "!" | ต่ำกว่าจุดสั่งซื้อ / ใกล้หมดอายุ | 1 |
| `must` | วงกลมน้ำเงิน "!" ขาว | ไม่อัปเดต ต้องนับ | 2 |
| `ok` | สี่เหลี่ยมเขียว ✓ ขาว | พอ | 3 |

- `mSign(key, px)` / `uiSign(key, px)` คืน SVG `aria-hidden` (สีเป็น hex ใช้ในหน้าต่างพิมพ์ได้) · **คำบรรยายต้องอยู่ข้างป้ายเสมอ**
- ใน HTML นิ่ง (ชิปกรองหน้าคอม) ใช้ `<i class="ui-sg sg-warn" aria-hidden="true"></i>` 16px รูปเดียวกัน
- ตัวกรอง "ทั้งหมด" บนมือถือเรียงตาม `M_RANK` (แดง → เหลือง → น้ำเงิน → เขียว) คงลำดับชื่อในกลุ่มเดียวกัน
- หน้าต้องสั่งใช้ `PLAN_TONE`: เลยกำหนด `no`+แดง · สั่งวันนี้ `warn`+`text-orange-700` · ใกล้ถึงเวลา `warn`+warn-ink · พอ `ok`+green-ink · ไม่มีข้อมูล ไม่มีป้าย

### Icons (`.ic` / `.icb`)
- ไอคอนเส้นชุดเดียว: SVG viewBox 24 · `stroke-width 2.5` · ปลายมน/มุมมน · ไม่มีพื้น · ใส่เป็น CSS mask สีตาม `currentColor`
- ใช้: `<i class="ic ic-out"></i>` (1.25em) · ปุ่มที่ JS เปลี่ยน `textContent` ใช้ `class="icb ic-out"` (ไอคอนอยู่ใน `::before`) · ขนาดใหญ่ `.ic-lg` 26px (มือถือ)
- **เพิ่มไอคอนใหม่:** วาด SVG ตามสเปกข้างบน → encode เป็น data URI ใส่ `--ic-ชื่อ` ในบล็อก `:root` ของไอคอน → เพิ่ม `.ic-ชื่อ{--i:var(--ic-ชื่อ)}` ในบรรทัดคลาสไอคอน
  (ตัวสร้าง `make-icons.mjs` ที่คอมเมนต์อ้างถึงไม่ได้อยู่ใน repo) · สองหน้าจอมีบล็อกไอคอนของตัวเอง เพิ่มที่ไหนต้องเพิ่มอีกที่ถ้าใช้ทั้งคู่
- มือถือมี: stock scan order mine out in ret count factory snow share book desktop refresh logout calc copy send doc new search star list
- หน้าคอมมีเพิ่ม: phone bell chart trend users plus edit trash more print clock qr check cloud x home offline

### Feedback & States
- **toast (`toast(msg, type)`):** แผ่นป้ายบนสุดใต้แถบสถานะ · `ok` เขียวตัวขาว · `warn` ส้มตัวหมึก · `err` แดงตัวขาว · หาย 3 วิ · `role=status`
- **คิวออฟไลน์ (`#mOfflineBar` `.m-hazard`):** แถบส้มเต็มกว้าง มีเทปกั้นลายทแยงหมึก-ส้มบน-ล่าง 7px ขอบหมึก แตะเพื่อดู/ส่งใหม่ (ตั้งใจให้เด่นแบบเทปกั้นพื้นที่)
- **แถบเตือนบนแผ่นเบิก (`.m-warnbar`):** ส้ม ขอบหมึก ตัว 14/800 + สามเหลี่ยมเตือน
- **จอว่าง (`mEmptyHtml`):** ข้อความขึ้นต้น "✅ " = เรียบร้อย → แปลงเป็นป้ายเขียว 36px + ข้อความหมึกรอง · อื่นๆ ข้อความหมึกรองกลางจอ
- **จอผิดพลาด:** สามเหลี่ยมเตือน 40px + "โหลดไม่สำเร็จ" + เหตุผลจาก `mNetErr()` + ปุ่มเขียว "ลองใหม่" · `role=alert`
- **กำลังโหลด:** การ์ดลอย `.m-card` Kanit บนพื้นดำโปร่ง 50%
- **จอสแกน:** พื้นดำ หัวมีแถบส้ม 6px · กรอบเล็งมุมส้ม (`.m-corner`) · เส้นเล็งส้มกวาดขึ้นลง 2.4 วิ (หยุดเมื่อเครื่องตั้งลดการเคลื่อนไหว)

## Do's and Don'ts

### Do:
- **Do** เริ่มหน้าใหม่ด้วยหัว `.m-head m-safe-top pt-3` + เนื้อหาใน `.m-wrap` บนพื้น `--m-ground` (มือถือ) · หน้าคอมใช้ `.sq-page` + `.sq-wrap`
- **Do** บอกสถานะด้วย `mSign()` / `uiSign()` + คำพูดคู่กันเสมอ และเรียงรายการตาม `M_RANK`
- **Do** ใช้ `--m-green-ink` / `--m-warn-ink` (`--sq-accent` / `--sq-warn`) เมื่อเป็นตัวหนังสือสีบนพื้นอ่อน
- **Do** ใช้ส้มเป็นแถบ 6px หรือพื้นที่มีตัวหมึกเท่านั้น
- **Do** ให้ปุ่มยืนยันใช้ `.m-confirm` / `.ui-confirm` + `t-*` ของงาน และอ่านทวนประเภท + จำนวน + หน่วย
- **Do** ใช้ไอคอนจากชุด `.ic` / `.icb` ถ้าไม่มีก็วาดเพิ่มตามสเปก (viewBox 24, stroke 2.5, ปลายมน)
- **Do** เป้าแตะ ≥ 44px (ชิปมือถือ 40 · ปุ่มในแถวหน้าคอม 34 บนจอกว้าง 44 ในโหมดการ์ด) · contrast ≥ 4.5:1 บนพื้นจริง · ช่องกรอกทุกช่องมีชื่อ
- **Do** ใช้ตาราง/ขึ้นบรรทัดใหม่แทนแถวเลื่อนข้าง และตรวจที่จอ 320px ว่าไม่มีอะไรล้น
- **Do** ใช้ emoji ได้เฉพาะข้อความชั่วคราว (`alert`/`confirm`, ข้อความที่คัดลอกไปแชต) และใน `<option>` ของระบบ · toast/หัวกล่องยืนยันหน้าคอมตัด emoji นำหน้าด้วย `uiNoEmoji()`
- **Do** เพิ่ม class Tailwind ใหม่แล้วรัน `npm run build:css` (Tailwind ใช้จัดวางเท่านั้น สีมาจาก `--m-*` / `--sq-*`)

### Don't:
- **Don't** ทำแถวปุ่ม/การ์ด/ชิป/แท็บที่ต้องเลื่อนซ้าย-ขวา (เจ้าของสั่ง 2026-10-20)
- **Don't** ตั้ง `display` ในคลาส `m-*` ที่ใช้กับของที่ `show()`/`hide()` ซ่อน เพราะชนกับคลาส `hidden` (ข้อยกเว้นเดียว: `.m-row` เป็น grid เพราะแถวสร้างใหม่ทั้งชุด ไม่เคยถูกซ่อน)
- **Don't** วางตัวขาวบนส้ม ใช้ส้มเป็นสีตัวหนังสือ หรือใช้ `#00843d` เป็นสีตัวหนังสือบนพื้นเทา (4.3:1)
- **Don't** ใช้เหลือง `#ffd100` นอกรูปทรงป้ายเตือน
- **Don't** ใช้สีพื้นมืด / `bg-slate-900` / สีกรมท่า ม่วงคราม ไล่สีจากธีมเก่า (`tailwind.mobile.config.js` ยังมีอยู่แต่ไม่ใช่แหล่งสีแล้ว)
- **Don't** ใส่ emoji บนปุ่ม หัวจอ แท็บ หรือป้ายสถานะ
- **Don't** ใส่มุมมนกับแผ่นที่มีแถบหนาบน หรือใช้มุมมนเกิน 8px
- **Don't** ใส่ `text-sm` ที่ช่องกรอกมือถือ หรือใช้ตัวหนังสือเล็กกว่า 12px
- **Don't** โหลดฟอนต์/สคริปต์จาก CDN หรือ Google เพราะฟอนต์อยู่ใน `fonts/`
- **Don't** เปลี่ยนชื่อ id ของ DOM หรือชื่อฟังก์ชันเดิม

## หน้าคอม (index.html)

โลกเดียวกับมือถือ ย้ายเข้ามา 2026-10-20 · token ชุดเดียว `:root` ใน `<style>` ของ `index.html` (บล็อก "ป้ายความปลอดภัยโรงงาน (ISO 7010) — โลกเดียวกับมือถือ" · ค่าอยู่ใน frontmatter `sq-*`) ·
ชั้นหน้าตาสุดท้ายอยู่ท้าย `<style>` หัว "ชั้นแผ่นป้าย (P2 2026-10-20)" ซึ่งวางท้ายสุดเพื่อชนะกฎเดิม · ความหนาแน่นแบบคอม (ตารางหลายคอลัมน์) ไม่ใช่แผ่นป้ายใหญ่แบบมือถือ

### สี

| บทบาท | token | ใช้กับ |
|---|---|---|
| เขียวเซฟตี้ | `--sq-green` | แถบเมนู · ปุ่มหลัก (`.sq-btn-primary` `.rm-btn-primary` `.rm-mini.solid` `.btn-primary`) · ชิปที่เลือก · กรอบหน้าต่าง/เมนูเพิ่มเติม · เส้นใต้หัวตาราง 2px · เส้นใต้แท็บที่เลือก 3px · ขอบตอนชี้ |
| ส้มสัญญาณ | `--sq-band` (= `--sq-orange`) | แถบล่างแถบเมนู 6px · แถบบนหน้าต่าง/กล่องโหลด/แผง "ต้องจัดการ"/การ์ดเข้าระบบ · toast เตือน (ตัวหมึก) |
| เขียวตัวหนังสือ | `--sq-accent` / `--sq-accent-2` | ตัวหนังสือเขียว แท็บที่เลือก ลิงก์ ปุ่มหลักตอนชี้ · พื้นอ่อนของสถานะ "ปกติ" |
| พื้น / แผ่น / ยก | `--sq-ground` / `--sq-surface` / `--sq-raised` | พื้นหน้า / แผ่นป้าย / พื้นตอนชี้และหัวตารางห้องเย็น |
| เส้น | `--sq-line` / `--sq-line-soft` / `--sq-line2` | ขอบแผ่นป้าย / เส้นคั่นในการ์ดสรุป / ขอบปุ่ม ชิป ช่องกรอก |
| หมึก | `--sq-ink` / `--sq-ink2` / `--sq-muted` | เนื้อหา / ป้ายช่องกรอก หัวตาราง / เวลา รหัส หมายเหตุ (5.9:1 บนพื้นเทา) |
| วิกฤต | `--sq-crit` / `--sq-crit-bg` | หมดอายุ · ของหมด · บันทึกไม่สำเร็จ · ป้ายตัวเลข · ลิงก์ยกเลิกการใช้ |
| เร่งด่วน | `--sq-high` / `--sq-high-bg` | ต่ำกว่าจุดสั่งซื้อ · ต้องสั่งวันนี้ |
| ควรดู | `--sq-warn` / `--sq-warn-bg` | ใกล้หมดอายุ · ใกล้ถึงเวลาสั่ง |
| บังคับ | `--sq-must` / `--sq-must-bg` | ไม่อัปเดต ต้องนับ · toast ข้อมูล |
| โฟกัส | `#fde0bd` (`sq-focus-halo`) | วงรอบช่องกรอกตอนโฟกัส (`.ui-field`, ช่องในหน้าต่าง) และสีเลือกข้อความ |
| โรงงาน | `--sq-fac-sqf/mlm/cr` | แถบบนการ์ดคลังหน้าแรก · แถบบนการ์ดที่มี `rail-*` · จุดหน้าชื่อโรงงาน · ไอคอนคลัง |

- Tailwind หน้าคอม (`tailwind.desktop.config.js`) remap `slate-*` เป็นเทาหมึกชุดเดียวกับ `--sq-*` (400 ขึ้นไปเป็นตัวหนังสือได้ ≥ 4.5:1) และ `indigo-*` เป็นเขียวเซฟตี้ ·
  class เก่าที่ยังเขียน `slate`/`indigo` จึงได้สีโลกนี้ ห้ามเพิ่มสี Tailwind อื่นเป็นสีแบรนด์
- **ห้ามใช้ `amber-500` / `orange-500` / `red-500` เป็นสีตัวหนังสือ** (contrast 2.2–3.8) · สีสถานะใช้ token เท่านั้น
- สีโรงงานไม่ใช่สีปุ่ม (ปุ่มหลักเป็นเขียวเซฟตี้เสมอ)
- **หน้าต่างพิมพ์** (`window.open` + `document.write`) ใช้ hex ตรงๆ ห้าม `var(--sq-*)` เพราะ CSS variable ไม่ติดไป (กับดักข้อ 4 ใน CLAUDE.md) · `uiSign()` ใช้ได้เพราะสีใน SVG เป็น hex

### ตัวอักษร
- Kanit 700 ผ่าน `--sq-head` หรือ `.ui-k`: หัวหน้า (`.sq-h1`, `.rm-title`) 26px · หัวหน้าต่าง 22px · ตัวเลขการ์ดสรุป 28px · ยอดในตาราง 19px · ปุ่มคลังบนแถบเมนู 16px · ปุ่มยืนยัน 20px · ป้ายตัวเลข
- Sarabun: เนื้อหา 13–14px · ปุ่ม 13.5px/800 · หัวตาราง 12.5px/700 สีหมึกรอง ไม่มี letter-spacing · ป้ายในการ์ดสรุป 13px/700
- `--sq-mono` เฉพาะรหัส เวลา และตัวเลขในตารางหลายคอลัมน์ (หลักตรงกัน) · ตัวเลขเดี่ยวตัวใหญ่ใช้ Kanit
- **12px ขั้นต่ำ** · ห้ามตัวเอียงและห้าม uppercase กับภาษาไทย

### Layout
- กรอบเนื้อหา `.sq-wrap` / `.rm-wrap` กว้างไม่เกิน 1400px (`.sq-wrap-narrow` 1040px) ระยะขอบ 18/16 · หน้าแรก 900px กลางจอ การ์ดคลัง `auto-fit minmax(220px,1fr)`
- **แถบเมนู (`#mainNav`)** 2 แถว (`--nav-h:100px`): แถวบน = ปุ่มคลัง 3 ปุ่ม + ผู้ใช้ + ออก · แถวล่าง = เครื่องมือตัวเล็ก · `.nav-row` ใช้ `flex-wrap` ขึ้นบรรทัดใหม่ ไม่เลื่อนข้าง
- **ปุ่มในแถวตาราง (สมมาตร · เจ้าของสั่ง 2026-10-20):** 3 ปุ่มเสมอ "รับ / เบิก" (เขียวทึบ) · "นับ" · "แก้ไข" (เส้น)
  - จอ ≥ 901px: บรรทัดเดียว ชิดขวา (`grid-template-columns:repeat(3,auto)`) ช่องจัดการกว้างพอดีปุ่ม
  - จอ ≤ 900px: ตารางกลายเป็นการ์ด ปุ่มเป็นตาราง 3 ช่องกว้างเท่ากัน สูง 44
  - **"ยกเลิกการใช้" ไม่อยู่ในแถว** อยู่ท้ายหน้าต่างแก้ไขเป็นลิงก์แดง (`.ui-danger-link`)
- **แถบเครื่องมือคลังวัตถุดิบ:** แถวบน = ช่องค้นหา (ยืด) + ค่าเตือนวัน · แถวล่าง = ชิปกรองเต็มแถว (`flex:1 1 100%`)
- **เมนู "เพิ่มเติม" (`#rawMoreMenu`):** จัดกลุ่มด้วยหัวกลุ่ม `.rm-more-h` (12px/800 เส้นคั่นบน): **ส่งออก** · **เอกสาร / พิมพ์** · **ข้อมูล** · ปุ่มในกลุ่มชิดซ้าย เต็มกว้าง
- ตารางวัตถุดิบกว้าง 880px → เป็นการ์ดเมื่อจอ ≤ 900px · แท็บห้องเย็น/ภาพรวมขึ้นบรรทัดใหม่แทนเลื่อนข้าง

### ส่วนประกอบ
- **แถบเมนู:** พื้นเขียว แถบส้ม 6px ล่าง · ปุ่ม `.nav-btn` ตัวขาวพื้นโปร่ง มุม 6 · ชี้ = พื้นมืดลง 18% · **หน้าที่เปิดอยู่ = แผ่นขาวตัวหมึก** · ปุ่มออกขอบขาว ชี้แล้วแดง · ป้ายตัวเลข `.nav-badge` แดง ขอบขาว 2px
- **ปุ่ม:** `.sq-btn` / `.rm-btn` ขาว ขอบ 1.5px `--sq-line2` มุม 6 สูง ≥ 38 ตัว 13.5/800 ไอคอน `.ic` นำหน้า · ชี้ = ขอบเขียว พื้นยก ·
  หลัก `.sq-btn-primary` / `.rm-btn-primary` พื้นเขียว ตัวขาว ชี้ = `--sq-accent` · 1 ปุ่มหลักต่อส่วน · ปุ่มในแถว `.rm-mini` สูง 34 (`.solid` = เขียว)
- **ชิปกรอง:** `.rm-chip` ขาว ขอบ 1.5px `--sq-line2` มุม 6 สูง 34 ป้ายรูปทรง `.ui-sg` นำหน้า · เลือกอยู่ `.filter-active` = พื้นเขียว ตัวขาว ·
  ชิปตัวกรองความเคลื่อนไหว (`.act-filter-btn`) และวันในกำหนดการส่งสรุป (`.ntf-day`) ใช้แบบเดียวกัน
- **แผ่นป้าย:** การ์ด/ช่องสรุป/แถว (`.sq-card` `.rm-card` `.sq-tiles` `.sq-row` ห้องเย็น `.card`, ภาพรวม `.xm-*`) ขอบ 1.5px `--sq-line` มุม 6 ไม่มีเงา ·
  การ์ดที่บอกคลัง (`rail-cold/sqf/mlm`) = แถบสีโรงงาน 6px บน มุม 0 · การ์ดคลังหน้าแรก = กรอบเขียว 2px แถบสีโรงงาน 8px บน มุม 0 ไอคอน 46px สีโรงงาน ·
  แผง "ต้องจัดการ" หน้าแรก = กรอบเขียว แถบส้มบน แถวละคลัง สูง ≥ 48
- **ตาราง:** หัวตารางพื้นขาว ตัวหมึกรอง เส้นใต้เขียว 2px · แถวคั่นเส้น `--sq-line` · ชี้แถว = พื้นยก · **ไม่มีแถบสีข้างแถว** สถานะอยู่ในคอลัมน์สถานะเป็น `uiSign` + คำ (`.badge-status` / `.sq-chip` ไม่มีพื้น ตัวสีตามระดับ)
- **แท็บ:** `.sq-tab` / ห้องเย็น `.cr-tab-btn` ตัวหมึกรอง · เลือกอยู่ = ตัว `--sq-accent` เส้นใต้เขียว 3px
- **หน้าต่าง (modal):** ตัวห่อ `.ui-modal` พื้นหมึกโปร่ง 60% ไม่เบลอ · ตัวการ์ดกรอบเขียว 2px แถบส้ม 6px บน **มุม 0** เงา `0 18px 44px` ·
  หัว `.ui-plate-head` พื้นขาว ตัวหมึก เส้นใต้ ชื่อ Kanit 22 · ปุ่มในหัว (รวมปิด) ขาว ขอบเส้น 44×44 · ปุ่มปิดแบบไอคอน `.ui-x` 44×44 ·
  เลื่อนได้เมื่อสูงเกินจอ (`overflow-y-auto` + การ์ด `my-auto`) · ลงทะเบียนชื่อหน้าต่างและฟังก์ชันปิดใน `UI_MODALS` (`js/utils.js`) → Esc ปิด, คืนโฟกัส, Tab วนในหน้าต่าง ·
  คลิกพื้นหลังปิดได้เฉพาะหน้าต่างดูข้อมูล (หน้าต่างกรอกข้อมูลไม่ปิด กันตัวเลขที่พิมพ์หาย) · กล่องยืนยันห้องเย็น (`.cr-modal-box`) แบบเดียวกัน ·
  ส่วนย่อยในหน้าต่างตั้งค่าเป็นหัวข้อคั่นเส้นเขียว ไม่ซ้อนกล่องในกล่อง
- **ปุ่มยืนยันในหน้าต่าง (`.ui-confirm`):** ชุดเดียวกับ `.m-confirm` ของมือถือ: สีตามงาน (`t-out/t-ret/t-in/t-cnt`, `setRawType` สลับ) ขอบ `rgba(0,0,0,.3)` 2px + เส้นขาวด้านใน 3px ·
  Kanit 20 สูง ≥ 60 มุม 8 · อ่านทวนประเภท + จำนวน · ปุ่มบันทึกที่ไม่ใช่งานเคลื่อนไหวของ (แก้ไข ลงทะเบียน ตั้งค่า) ใช้ `.ui-confirm` พื้นเขียวเซฟตี้ ·
  ใต้ปุ่ม: ยกเลิก `.ui-cancel` (ลิงก์หมึกรอง สูง 44) · ยกเลิกการใช้ `.ui-danger-link` (ลิงก์แดง ขีดเส้นใต้) อยู่ล่างสุดเท่านั้น
- **ปุ่มเลือกงานในหน้าต่างรับ/เบิก (`#rawActionModal [role=group]`):** ขาว ขอบ 2px `--sq-line2` · เลือกแล้ว = พื้นสีงาน ตัวขาว
- **ช่องกรอก:** `.ui-field` / `.sq-input` / ช่องในหน้าต่าง: ขาว ขอบ `--sq-line2` (1.5–2px) มุม 6 · โฟกัส = ขอบเขียว + วงส้มอ่อน `#fde0bd` 3px · ช่องอ่านอย่างเดียวตัวหมึกรอง ·
  ทุกช่องผูก `<label for>` หรือมี `aria-label` · ช่องในหน้าต่างเดียวกันสูง/ขอบ/ตัวอักษรเท่ากัน
- **ข้อผิดพลาดของฟอร์ม:** แสดงใต้ช่องที่ผิด + ไฮไลต์ + ย้ายโฟกัส (`rawFieldError` ใน `js/raw.js`) ไม่ใช้ toast มุมจอ
- **toast:** แผ่นป้ายมุม 6 · สำเร็จ เขียว `--sq-accent` · เตือน ส้มตัวหมึก · ผิดพลาด แดง · ข้อมูล น้ำเงิน `--sq-must` · ตัด emoji นำหน้าด้วย `uiNoEmoji()`
- **กำลังโหลด:** แผ่นป้ายกรอบเขียว แถบส้มบน บนพื้นหมึกโปร่ง 55% · วงหมุนหมึก
- **หน้าเข้าระบบ/เลือกโหมด:** พื้นเทาผนัง · การ์ด `.ui-login` กรอบเขียว แถบเขียว 10px บน + แถบส้มใต้ (หัวจอแอปย่อส่วน) · ปุ่มเข้าระบบเขียว Kanit สูง 56 ·
  ปุ่มเลือกโหมด `.ui-mode-btn` ขาว ขอบ 2px ไอคอนเขียว 44 · โหมดแนะนำมีแถบส้มบน
- **ปุ่มระหว่างบันทึก:** ปิดปุ่มจริง (`disabled`) + กันส่งซ้ำในโค้ด · กดไม่ได้ = จาง .55 ลดสี
- **ข้อความผิดพลาดจากเน็ต:** ผ่าน `netErrorText()` (คอม) / `mNetErr()` (มือถือ) ห้ามโชว์ "Failed to fetch"

## คำที่ใช้ (ให้ตรงกันทั้งสองหน้าจอ)
- **ต่ำกว่าจุดสั่งซื้อ** = ตั้งจุดสั่งซื้อไว้ (> 0) และคงเหลือ ≤ จุดนั้น ไม่ใช้ "ต่ำกว่าขั้นต่ำ" / "ใกล้หมด"
- **หมดอายุ / ใกล้หมดอายุ**: สถานะคิดที่หลังบ้าน (`ExpDays` / `ExpStatus`) หน้าจอแค่แสดง
- **ไม่อัปเดต** = ไม่มีใครเบิก/รับ/คืน/นับ เกินจำนวนวันที่ตั้ง
- **ยกเลิกการใช้** (ไม่ใช่ "ลบ") สำหรับวัตถุดิบที่เลิกใช้
- **ห้ามคำว่า "สูตร" ในข้อความที่ผู้ใช้เห็น** ใช้ "ข้อมูลอ้างอิง" (คอมเมนต์ในโค้ดไม่นับ · `npm test` ตรวจ)

## ตรวจก่อนรวม
- contrast ≥ 4.5:1 (ตัวใหญ่ ≥ 3:1) บนพื้นจริง รวมในหน้าต่าง (modal) ด้วย (audit 2026-10-19 เจอปัญหาส่วนใหญ่ในหน้าต่าง ไม่ใช่หน้าหลัก)
- ช่องกรอกใหม่ผูกป้ายทุกช่อง · ตารางหน้าคอมเป็นการ์ดเมื่อจอ ≤ 900px · ไม่มีแถวเลื่อนข้าง
- เพิ่ม class Tailwind ใหม่ → `npm run build:css` (ไม่งั้น class ไม่ติด เคยทำพื้นหน้าเลือกโหมดโปร่ง)
- แก้หน้าจอที่ผู้ใช้เห็นต้องทำทั้ง `index.html` และ `mobile.html` · เลื่อน `CACHE_NAME` ใน `sw.js`

## ยังไม่ได้ทำ / ของค้าง (ไม่ใช่แบบอย่าง ห้ามลอกไปใช้)
- ป้ายเล็ก "เปิดล่าสุด" เหนือชื่อคลังในแถบทางลัดหน้าเลือกคลัง (มือถือ) มีมาก่อนงานนี้
- แท็บเล็ต (มือถือ): เนื้อหาหน้าแคบ 640px แต่ของในหัวจอยังกางเต็มกว้าง ไม่ตรงคอลัมน์
- ข้อความแถบงานค้างมาจาก `offlineSummary()` ใน `js/offline.js` (ใช้ร่วมกับหน้าคอม) ยังขึ้นต้นด้วย emoji
- หน้าคอมยังมีค่าธีมเก่าที่ชั้นแผ่นป้ายไม่ได้ทับ: กำหนดการส่งสรุป `.ntf-*` (hex slate `#cbd5e1` `#475569` `#334155`, มุม 12–24px บางส่วน) ·
  dropdown เติมคำ `.ac-dropdown` (มุม 14px) · กรอบ QR `.qr-box` (มุม 1.5rem) · ตารางห้องเย็นโหมดการ์ด ≤600px (มุม 16px) ·
  เงาโฟกัส `.rm-purpose-in` / `.rm-input-err` ยังเป็น rgba ของเขียว/แดงชุดเก่า
- มือถือ `.m-btn-ink` กับ `.m-btn-go` ตอนนี้ค่าเหมือนกัน (เขียว) ชื่อ "ink" ค้างจากตอนเป็นปุ่มดำ
