// รัน: node generate-icons.js
// สร้างไอคอนแอป (PWA) จากโลโก้บริษัท assets/logo.png
//
// โลโก้เป็นแนวนอน ~5:1 แต่ไอคอนแอปต้องเป็นสี่เหลี่ยมจัตุรัส
// จึงตัดเอาเฉพาะ "ตัว Q สีส้ม" มาใช้ โดยหาขอบเขตสีส้มจากพิกเซลจริง
// ไม่ได้กำหนดพิกัดตายตัว — ถ้าเปลี่ยนไฟล์โลโก้ก็ยังหาเจอเอง

const { createCanvas, loadImage } = require("canvas");
const fs = require("fs");
const path = require("path");

const LOGO    = path.join(__dirname, "assets", "logo.png");
const OUT_DIR = path.join(__dirname, "icons");

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
  if (!fs.existsSync(LOGO)) {
    console.error("❌ ไม่พบ " + LOGO + " — วางไฟล์โลโก้ก่อน");
    process.exit(1);
  }
  const img = await loadImage(LOGO);
  const W = img.width, H = img.height;
  console.log("โลโก้ต้นฉบับ: " + W + " x " + H);

  // ── หาขอบเขตตัว Q สีส้ม ──
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

  let sx, sy, sw, sh;
  if (count < 500) {
    console.warn("⚠️ หาตัว Q สีส้มไม่เจอ — ใช้โลโก้เต็มใบย่อลงแทน");
    sx = 0; sy = 0; sw = W; sh = H;
  } else {
    // ตัดพอดีขอบตัว Q เป๊ะๆ ไม่เผื่อขอบในภาพต้นฉบับ
    // เพราะขยายกรอบออกไปจะดูดตัวหนังสือเขียวที่อยู่ข้างๆ ติดเข้ามาด้วย
    // ระยะขอบสวยๆ ไปเว้นเอาตอนวางลงผืนผ้าใบแทน
    sx = minX; sy = minY;
    sw = maxX - minX + 1;
    sh = maxY - minY + 1;
    console.log("พบตัว Q: x " + minX + "-" + maxX + ", y " + minY + "-" + maxY +
                " (" + count.toLocaleString() + " พิกเซล)");
    console.log("ตัดกรอบพอดีตัว Q: " + sw + " x " + sh);
  }

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
    ctx.drawImage(img, sx, sy, sw, sh, (size - dw) / 2, (size - dh) / 2, dw, dh);

    const out = path.join(OUT_DIR, "icon-" + size + ".png");
    fs.writeFileSync(out, c.toBuffer("image/png"));
    console.log("✅ " + out + "  (" + (fs.statSync(out).size / 1024).toFixed(0) + " KB)");
  }
}

main().catch(e => { console.error("❌ " + e.message); process.exit(1); });
