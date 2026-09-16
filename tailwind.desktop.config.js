// Tailwind สำหรับหน้าคอม (index.html + js/) — build ด้วย `npm run build:css` → css/tw-desktop.css
// ข้อ 12 รายงานปรับปรุง: เลิกพึ่ง cdn.tailwindcss.com เพื่อให้เปิดแอปตอนไม่มีเน็ตแล้วยังมีสไตล์ครบ
// ⚠️ เพิ่ม class ใหม่ในไฟล์เหล่านี้ต้อง build ใหม่ ไม่งั้น class จะไม่มีผล (ไม่มี JIT ตอนรันแล้ว)
module.exports = {
  content: ["./index.html", "./js/**/*.js"],
  theme: { extend: {} },
  corePlugins: { preflight: true }
};
