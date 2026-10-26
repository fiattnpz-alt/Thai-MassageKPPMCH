// ==========================================
// การตั้งค่าระบบ (Configuration)
// ==========================================

const CONFIG = {
  // 1. นำ LIFF ID จาก LINE Developers (Channel: LINE Login > LIFF) มาใส่ที่นี่
  LIFF_ID: "2011816065-ZxPGoNdk",

  // 2. นำ Web App URL ที่ได้จากการ Deploy Google Apps Script มาใส่ที่นี่
  // ตัวอย่าง: "https://script.google.com/macros/s/AKfycb.../exec"
  API_URL: "https://script.google.com/macros/s/AKfycbyYo2wAsd6JkZR06g1Nk6Ghe1b8_Cd7IJG3DQn71UI9O7Ygd06tx7oqpThgGqu0IWsp/exec",

  // ชื่อร้าน
  SHOP_NAME: "คลินิกแพทย์แผนไทย & นวดเพื่อสุขภาพ",

  // ช่วงเวลานัดหมายล่วงหน้าสูงสุด (วัน)
  MAX_ADVANCE_DAYS: 30,

  // รหัส PIN สำหรับเข้าหน้าแอดมิน (admin.html) ค่าเริ่มต้น: 8888
  ADMIN_PIN: "8888"
};
