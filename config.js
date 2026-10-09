// ==========================================
// การตั้งค่าระบบ (Configuration)
// ==========================================

const CONFIG = {
  // 1. นำ LIFF ID จาก LINE Developers (Channel: LINE Login > LIFF) มาใส่ที่นี่
  LIFF_ID: "2011816065-ZxPGoNdk",

  // 2. นำ Web App URL ที่ได้จากการ Deploy Google Apps Script มาใส่ที่นี่
  // ตัวอย่าง: "https://script.google.com/macros/s/AKfycb.../exec"
  API_URL: "https://script.google.com/macros/s/AKfycbwJAjo49UN7n2mPxUUZXhtkKpJEHBdsB3cx6O8R1_AgQ_ubsIccZKtKUd2-F7INVj_k/exec",

  // ชื่อร้าน
  SHOP_NAME: "คลินิกแพทย์แผนไทย & นวดเพื่อสุขภาพ",

  // ช่วงเวลานัดหมายล่วงหน้าสูงสุด (วัน)
  MAX_ADVANCE_DAYS: 30,

  // รหัส PIN สำหรับเข้าหน้าแอดมิน (admin.html) ค่าเริ่มต้น: 8888
  ADMIN_PIN: "8888"
};
