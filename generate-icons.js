// รัน: node generate-icons.js
// สร้าง PWA icons (ต้องการครั้งเดียว แล้วลบไฟล์นี้ได้)
const { createCanvas } = require("canvas");
const fs = require("fs");

function makeIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#4f46e5");
  grad.addColorStop(1, "#0f172a");
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, size, size, size * 0.2);
  ctx.fill();

  // Icon text
  const emoji = "❄️";
  ctx.font = `${size * 0.4}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size * 0.42);

  // App name
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${size * 0.14}px sans-serif`;
  ctx.fillText("AppStock", size / 2, size * 0.78);

  return canvas.toBuffer("image/png");
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

try {
  fs.writeFileSync("icons/icon-192.png", makeIcon(192));
  fs.writeFileSync("icons/icon-512.png", makeIcon(512));
  console.log("✅ สร้าง icons สำเร็จ: icons/icon-192.png, icons/icon-512.png");
} catch (e) {
  console.log("⚠️ ต้องติดตั้ง: npm install canvas");
  console.log("หรือใช้ icon ที่สร้างจาก https://favicon.io แทน");
}
