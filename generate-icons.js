// รัน: node generate-icons.js
// สร้างไอคอนแอป (PWA) จากโลโก้บริษัท
//
// ใช้ assets/logo-square.png เป็นหลัก (โลโก้แบบวางซ้อน เกือบจัตุรัส — ใส่ทั้งใบได้เลย)
// ถ้าไม่มีไฟล์นั้น จะถอยไปใช้ assets/logo.png (แบบแนวนอน 5:1)
//   แล้วตัดเอาเฉพาะ "ตัว Q สีส้ม" โดยหาขอบเขตสีส้มจากพิกเซลจริง
//   ไม่ได้กำหนดพิกัดตายตัว — เปลี่ยนไฟล์โลโก้ก็ยังหาเจอเอง

const { createCanvas, loadImage } = require("canvas");
const fs = require("fs");
const path = require("path");

const LOGO_SQUARE = path.join(__dirname, "assets", "logo-square.png");
const LOGO_WIDE   = path.join(__dirname, "assets", "logo.png");
const OUT_DIR     = path.join(__dirname, "icons");

// พื้นไอคอนต้องทึบ เพราะ iOS ไม่รองรับไอคอนพื้นโปร่งใส (จะกลายเป็นดำ)
const BG = "#ffffff";

/** เป็นสีส้มของโลโก้หรือไม่ (แดงสูง เขียวกลาง น้ำเงินต่ำ) */
function isOrange(r, g, b, a) {
  if (a < 128) return false;
  return r > 200 && g > 100 && g < 200 && b < 90;
}

function roundRectPath(ctx, size, r) {
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(size, 0, size, size, r);
  ctx.arcTo(size, size, 0, size, r);
  ctx.arcTo(0, size, 0, 0, r);
  ctx.arcTo(0, 0, size, 0, r);
  ctx.closePath();
}

async function main() {
  const useSquare = fs.existsSync(LOGO_SQUARE);
  const src = useSquare ? LOGO_SQUARE : LOGO_WIDE;
  if (!fs.existsSync(src)) {
    console.error("❌ ไม่พบไฟล์โลโก้ — วาง assets/logo-square.png หรือ assets/logo.png ก่อน");
    process.exit(1);
  }
  const img = await loadImage(src);
  const W = img.width, H = img.height;
  console.log("ใช้ไฟล์  : " + path.basename(src));
  console.log("ขนาดต้นฉบับ: " + W + " x " + H + "  (สัดส่วน " + (W / H).toFixed(2) + ":1)");

  let sx, sy, sw, sh, cleanGreen;

  if (useSquare) {
    // โลโก้แบบวางซ้อน เกือบจัตุรัสอยู่แล้ว → ใส่ทั้งใบ ไม่ต้องตัดอะไร
    sx = 0; sy = 0; sw = W; sh = H;
    cleanGreen = false;
    console.log("ใส่โลโก้ทั้งใบลงไอคอน (ไม่ต้องตัด)");
  } else {
    // โลโก้แนวนอน → ต้องตัดเอาเฉพาะตัว Q สีส้ม
    const scan = createCanvas(W, H);
    const sctx = scan.getContext("2d");
    sctx.drawImage(img, 0, 0);
    const px = sctx.getImageData(0, 0, W, H).data;

    let minX = W, minY = H, maxX = -1, maxY = -1, count = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (isOrange(px[i], px[i + 1], px[i + 2], px[i + 3])) {
          count++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (count < 500) {
      console.warn("⚠️ หาตัว Q สีส้มไม่เจอ — ใช้โลโก้เต็มใบย่อลงแทน");
      sx = 0; sy = 0; sw = W; sh = H; cleanGreen = false;
    } else {
      // ตัดพอดีขอบตัว Q เป๊ะๆ ไม่เผื่อขอบในภาพต้นฉบับ
      // เพราะขยายกรอบออกไปจะดูดตัวหนังสือเขียวที่อยู่ข้างๆ ติดเข้ามาด้วย
      // ระยะขอบสวยๆ ไปเว้นเอาตอนวางลงผืนผ้าใบแทน
      sx = minX; sy = minY;
      sw = maxX - minX + 1;
      sh = maxY - minY + 1;
      cleanGreen = true;
      console.log("พบตัว Q: x " + minX + "-" + maxX + ", y " + minY + "-" + maxY +
                  " (" + count.toLocaleString() + " พิกเซล)");
      console.log("ตัดกรอบพอดีตัว Q: " + sw + " x " + sh);
    }
  }

  // โลโก้ทั้งใบมีขอบขาวในตัวอยู่แล้ว เว้นน้อยหน่อยก็พอ / ตัว Q ต้องเว้นเยอะกว่า
  const PAD = useSquare ? 0.08 : 0.17;

  for (const size of [192, 512]) {
    const c = createCanvas(size, size);
    const ctx = c.getContext("2d");

    ctx.fillStyle = BG;
    roundRectPath(ctx, size, size * 0.22);
    ctx.fill();

    // วางตรงกลาง เว้นขอบ 17%
    const pad = size * 0.17;
    const box = size - pad * 2;
    const scale = Math.min(box / sw, box / sh);
    const dw = sw * scale, dh = sh * scale;
    const dx = (size - dw) / 2, dy = (size - dh) / 2;

    // วาดตัว Q ลงผืนผ้าใบชั่วคราวก่อน เพื่อลบสีเขียวออกให้หมด
    // (กรอบสี่เหลี่ยมของตัว Q คาบเกี่ยวกับตัวหนังสือเขียวที่อยู่ติดกัน
    //  ตัดยังไงก็ยังติดมานิดหน่อย จึงต้องลบด้วยสีอีกชั้น)
    const tmp = createCanvas(Math.ceil(dw), Math.ceil(dh));
    const tctx = tmp.getContext("2d");
    tctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
    const td = tctx.getImageData(0, 0, tmp.width, tmp.height);
    const d = td.data;
    for (let i = 0; i < d.length; i += 4) {
      // เขียวเด่นกว่าแดงและน้ำเงินชัดเจน = ตัวหนังสือ ไม่ใช่ตัว Q → ลบทิ้ง
      if (d[i + 3] > 0 && d[i + 1] > d[i] + 12 && d[i + 1] > d[i + 2] + 12) d[i + 3] = 0;
    }
    tctx.putImageData(td, 0, 0);
    ctx.drawImage(tmp, dx, dy);

    const out = path.join(OUT_DIR, "icon-" + size + ".png");
    fs.writeFileSync(out, c.toBuffer("image/png"));
    console.log("✅ " + out + "  (" + (fs.statSync(out).size / 1024).toFixed(0) + " KB)");
  }
}

main().catch(e => { console.error("❌ " + e.message); process.exit(1); });
