// Tailwind สำหรับหน้ามือถือ (mobile.html) — build ด้วย `npm run build:css` → css/tw-mobile.css
// สี slate/indigo ถูก remap เป็นโทนเขียวของแบรนด์ (ย้ายมาจาก tailwind.config ที่เคย inline ใน mobile.html)
// ⚠️ เพิ่ม class ใหม่ใน mobile.html ต้อง build ใหม่
module.exports = {
  content: ["./mobile.html", "./js/offline.js"],
  theme: {
    extend: {
      colors: {
        slate: {
          50:"#f4f7f4", 100:"#e8f0ea", 200:"#d5e0d9", 300:"#b6c8bc", 400:"#8fa39a",
          500:"#6c8074", 600:"#3a4a40", 700:"#26342b", 800:"#18231c", 900:"#0d1410", 950:"#080d0a"
        },
        indigo: {
          100:"#d8ede0", 300:"#7fcf9d", 400:"#4fb87b", 500:"#17a052",
          600:"#0e7a3f", 700:"#0b5c30", 800:"#084424", 900:"#062f19"
        }
      }
    }
  }
};
