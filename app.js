// ==========================================================================
// แอปรองรับ LINE LIFF - ตรรกะฝั่งลูกค้า (Frontend Application Logic)
// ==========================================================================

let currentStep = 1;
let lineProfile = {
  userId: "U_TEST_USER_12345",
  displayName: "ลูกค้าทดสอบ",
  pictureUrl: "https://via.placeholder.com/40"
};

// ข้อมูลที่ลูกค้าเลือกในแต่ละขั้นตอน
let bookingState = {
  selectedService: null,
  selectedDoctor: "ANY", // หรือ doctor_id
  selectedDate: "",
  selectedSlot: null,
  customerName: "",
  customerPhone: "",
  customerNotes: ""
};

// Data Caches
let servicesData = [];
let doctorsData = [];
let activeSlots = [];
let monthlyRosterCache = {};

// ==========================================================================
// 1. เริ่มต้นระบบเมื่อเปิดหน้าเว็บ
// ==========================================================================
document.addEventListener("DOMContentLoaded", async () => {
  initDateLimits();
  await initLiff();
  await loadInitialData();
});

// กำหนดวันจองล่วงหน้า (ไม่ให้เลือกย้อนหลัง และเลือกได้สูงสุดตาม CONFIG)
function initDateLimits() {
  const dateInput = document.getElementById("bookingDateInput");
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const minDate = `${yyyy}-${mm}-${dd}`;

  const max = new Date();
  max.setDate(today.getDate() + (CONFIG.MAX_ADVANCE_DAYS || 30));
  const maxDate = `${max.getFullYear()}-${String(max.getMonth() + 1).padStart(2, '0')}-${String(max.getDate()).padStart(2, '0')}`;

  dateInput.min = minDate;
  dateInput.max = maxDate;
  dateInput.value = minDate;
  bookingState.selectedDate = minDate;
}

// ==========================================================================
// 2. ตรวจสอบและเชื่อมต่อ LINE LIFF SDK
// ==========================================================================
async function initLiff() {
  try {
    if (typeof liff === "undefined" || !CONFIG.LIFF_ID || CONFIG.LIFF_ID.startsWith("ใส่_")) {
      console.warn("LIFF ID ยังไม่ได้ตั้งค่า หรือรันใน Browser ธรรมดา (ใช้ Mock User สำหรับทดสอบ)");
      updateUserProfileUI();
      return;
    }

    await liff.init({ liffId: CONFIG.LIFF_ID });

    if (liff.isLoggedIn()) {
      const profile = await liff.getProfile();
      lineProfile.userId = profile.userId;
      lineProfile.displayName = profile.displayName;
      lineProfile.pictureUrl = profile.pictureUrl || "https://via.placeholder.com/40";
      updateUserProfileUI();
      // ดึงข้อมูลเดิมของลูกค้ามา Autofill
      fetchCustomerHistory();
    } else {
      liff.login();
    }
  } catch (err) {
    console.error("LIFF Init Error:", err);
    updateUserProfileUI();
  }
}

function updateUserProfileUI() {
  document.getElementById("userName").textContent = lineProfile.displayName;
  document.getElementById("userAvatar").src = lineProfile.pictureUrl;
}

// ==========================================================================
// 3. โหลดข้อมูลเริ่มต้น (Services & Doctors) จาก Google Apps Script
// ==========================================================================
async function loadInitialData() {
  showLoading("กำลังโหลดข้อมูลบริการและหมอ...");

  if (!CONFIG.API_URL || CONFIG.API_URL.startsWith("ใส่_")) {
    hideLoading();
    // ถ้ายังไม่ได้ใส่ API URL ใช้ข้อมูลตัวอย่างเพื่อให้เปิดดูดีไซน์ได้ทันที
    useMockData();
    renderServices();
    return;
  }

  try {
    const res = await fetch(`${CONFIG.API_URL}?action=init_data`);
    const data = await res.json();

    if (data.success) {
      servicesData = data.services || [];
      doctorsData = data.doctors || [];
      if (data.current_roster) Object.assign(monthlyRosterCache, data.current_roster);
      if (data.next_roster) Object.assign(monthlyRosterCache, data.next_roster);
      if (data.settings && data.settings.shop_name) {
        document.getElementById("shopTitle").textContent = data.settings.shop_name;
      }
      renderServices();
    } else {
      alert("เกิดข้อผิดพลาดในการโหลดข้อมูล: " + data.error);
    }
  } catch (err) {
    console.error("Fetch API Error:", err);
    useMockData();
    renderServices();
  } finally {
    hideLoading();
  }
}

function useMockData() {
  servicesData = [
    { service_id: "SRV-001", name: "นวดแผนไทยราชสำนัก (แก้อาการ)", duration_mins: 60, price: 500, description: "เน้นกดจุดสะบัก คอ บ่า ไหล่ บรรเทาอาการปวดตึงเรื้อรัง" },
    { service_id: "SRV-002", name: "นวดแผนไทยผ่อนคลายกล้ามเนื้อ", duration_mins: 90, price: 700, description: "นวดคลายเส้นทั่วเรือนร่าง เพิ่มการไหลเวียนโลหิต" },
    { service_id: "SRV-003", name: "ประคบสมุนไพรสด + นวดไทย", duration_mins: 120, price: 950, description: "นวดไทยพร้อมลูกประคบสมุนไพรร้อน ผ่อนคลายกล้ามเนื้อลึก" },
    { service_id: "SRV-004", name: "นวดน้ำมันหอมระเหยอโรมา", duration_mins: 60, price: 800, description: "นวดน้ำมันสมุนไพรกลิ่นอโรมา ลดความเครียดและบำรุงผิว" },
    { service_id: "SRV-005", name: "นวดฝ่าเท้าและจุดสะท้อนอวัยวะ", duration_mins: 60, price: 450, description: "กระตุ้นการทำงานของระบบอวัยวะภายในผ่านฝ่าเท้า" }
  ];

  doctorsData = [
    { doctor_id: "DOC-001", name: "สมศรี นวดดี", nickname: "หมอสมศรี", skills: "SRV-001,SRV-002,SRV-003", work_days: "0,1,2,3,4,5,6" },
    { doctor_id: "DOC-002", name: "บุญชู แสงทอง", nickname: "หมอบุญชู", skills: "SRV-001,SRV-002,SRV-005", work_days: "0,1,2,3,4,5,6" },
    { doctor_id: "DOC-003", name: "ดวงพร แก้วใส", nickname: "หมอดวง", skills: "SRV-002,SRV-004", work_days: "0,1,2,3,4,5,6" },
    { doctor_id: "DOC-004", name: "ประเสริฐ ชนะพล", nickname: "หมอเสริฐ", skills: "SRV-001,SRV-003", work_days: "0,1,2,3,4,5,6" }
  ];
}

// ==========================================================================
// 4. การแสดงผล Step 1: รายการบริการ
// ==========================================================================
function renderServices() {
  const container = document.getElementById("servicesList");
  container.innerHTML = "";

  servicesData.forEach(srv => {
    const card = document.createElement("div");
    card.className = `service-card ${bookingState.selectedService && bookingState.selectedService.service_id === srv.service_id ? 'selected' : ''}`;
    card.onclick = () => selectService(srv);

    card.innerHTML = `
      <div class="service-name">${srv.name}</div>
      <div class="service-desc">${srv.description || ""}</div>
      <div class="service-meta">
        <span class="service-duration">⏱️ ${srv.duration_mins} นาที</span>
        <span class="service-price">${Number(srv.price).toLocaleString()} บาท</span>
      </div>
    `;
    container.appendChild(card);
  });
}

function selectService(srv) {
  bookingState.selectedService = srv;
  renderServices();
  document.getElementById("btnNext").disabled = false;
}

// ==========================================================================
// 5. การแสดงผล Step 2: เลือกวันที่ & หมอนวดที่เข้าเวรในวันนั้น
// ==========================================================================
function formatThaiDateWithDay(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dayNames = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
  const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const dayName = dayNames[dt.getDay()];
  const thaiYear = y + 543;
  return `วัน${dayName}ที่ ${d} ${thaiMonths[m - 1]} ${thaiYear}`;
}

async function onDateChanged() {
  const dateVal = document.getElementById("bookingDateInput").value;
  if (!dateVal) return;
  bookingState.selectedDate = dateVal;
  bookingState.selectedSlot = null;

  const monthStr = dateVal.slice(0, 7);
  if (!monthlyRosterCache.hasOwnProperty(dateVal) && CONFIG.API_URL && !CONFIG.API_URL.startsWith("ใส่_")) {
    try {
      const res = await fetch(`${CONFIG.API_URL}?action=get_monthly_roster&month=${monthStr}`);
      const data = await res.json();
      if (data.success && data.roster) {
        Object.assign(monthlyRosterCache, data.roster);
      }
    } catch (e) {}
  }

  renderDoctorsForSelectedDate();
}

function renderDoctorsForSelectedDate() {
  const grid = document.getElementById("doctorsGrid");
  const dateDisplay = document.getElementById("dateDisplayLabel");
  const badge = document.getElementById("onDutyCountBadge");
  grid.innerHTML = "";

  if (dateDisplay) {
    dateDisplay.textContent = `📅 ${formatThaiDateWithDay(bookingState.selectedDate)}`;
  }

  const serviceId = bookingState.selectedService ? bookingState.selectedService.service_id : "";
  const [y, m, d] = bookingState.selectedDate.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayOfWeek = dateObj.getDay();

  // ตรวจสอบตารางเวรรายเดือน (ถ้ามีจัดเวรไว้ให้ยึดตามเวรรายเดือน หากไม่มีให้ fallback ไปที่วันประจำสัปดาห์)
  const rosterDutyDocIds = monthlyRosterCache[bookingState.selectedDate];

  // กรองหมอที่:
  // 1. มีสถานะพร้อมทำงาน (is_active !== false)
  // 2. อยู่เวรในวันที่เลือก (ตามเวรรายเดือน หรือวันประจำสัปดาห์)
  // 3. มีทักษะบริการที่เลือก (skills includes serviceId)
  const qualifiedDocs = doctorsData.filter(doc => {
    if (doc.is_active === false || String(doc.is_active).toUpperCase() === "FALSE") return false;
    let worksOnDay = false;
    if (rosterDutyDocIds !== undefined) {
      worksOnDay = rosterDutyDocIds.includes(doc.doctor_id);
    } else {
      worksOnDay = String(doc.work_days).split(",").map(s => parseInt(String(s).trim(), 10)).includes(dayOfWeek);
    }
    const hasSkill = String(doc.skills).split(",").map(s => String(s).trim()).includes(serviceId);
    return worksOnDay && hasSkill;
  });

  if (badge) {
    badge.textContent = `เข้าเวร ${qualifiedDocs.length} ท่าน`;
  }

  // หากหมอเดิมที่เคยเลือกไว้ไม่ได้เข้าเวรในวันนี้ ให้ปรับเป็น ANY อัตโนมัติ
  if (bookingState.selectedDoctor !== "ANY") {
    const isStillOnDuty = qualifiedDocs.some(d => d.doctor_id === bookingState.selectedDoctor);
    if (!isStillOnDuty) {
      bookingState.selectedDoctor = "ANY";
    }
  }

  if (qualifiedDocs.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; background: #fffbeb; border: 1px solid #fef3c7; color: #b45309; padding: 18px; border-radius: 8px; text-align: center; font-size: 13px; line-height: 1.6;">
        ⚠️ <b>ไม่มีหมอนวดเข้าเวรสำหรับบริการนี้ในวันที่เลือก</b><br>
        กรุณาเปลี่ยนวันที่นัดหมายด้านบน เพื่อดูหมอนวดในวันอื่นครับ
      </div>
    `;
    document.getElementById("btnNext").disabled = true;
    return;
  }

  // 1. การ์ดตัวเลือก "ใครก็ได้"
  const anyCard = document.createElement("div");
  anyCard.className = `doctor-card ${bookingState.selectedDoctor === 'ANY' ? 'selected' : ''}`;
  anyCard.onclick = () => selectDoctor('ANY');
  anyCard.innerHTML = `
    <div class="doctor-avatar-circle">✨</div>
    <div class="doctor-name-display">ใครก็ได้</div>
    <div class="doctor-subtext">ระบบเลือกหมอว่างให้</div>
  `;
  grid.appendChild(anyCard);

  // 2. การ์ดหมอแต่ละท่านที่เข้าเวรในวันนี้
  qualifiedDocs.forEach(doc => {
    const card = document.createElement("div");
    card.className = `doctor-card ${bookingState.selectedDoctor === doc.doctor_id ? 'selected' : ''}`;
    card.onclick = () => selectDoctor(doc.doctor_id);
    card.innerHTML = `
      <div class="doctor-avatar-circle">💆</div>
      <div class="doctor-name-display">${doc.nickname || doc.name}</div>
      <div class="doctor-subtext">เข้าเวร ${doc.work_start_time || '10:00'} - ${doc.work_end_time || '20:00'}</div>
    `;
    grid.appendChild(card);
  });

  document.getElementById("btnNext").disabled = false;
}

function selectDoctor(doctorId) {
  bookingState.selectedDoctor = doctorId;
  renderDoctorsForSelectedDate();
}

// ==========================================================================
// 6. การแสดงผล Step 3: เลือกรอบเวลาว่าง (Time Slots)
// ==========================================================================
async function loadAvailableSlots() {
  const container = document.getElementById("slotsGrid");
  const subtext = document.getElementById("slotStepSubtext");

  let docName = "ใครก็ได้ (ระบบจัดหมอว่างให้)";
  if (bookingState.selectedDoctor !== "ANY") {
    const doc = doctorsData.find(d => d.doctor_id === bookingState.selectedDoctor);
    if (doc) docName = doc.nickname || doc.name;
  }

  if (subtext) {
    subtext.innerHTML = `📅 <b>วันที่:</b> ${formatThaiDateWithDay(bookingState.selectedDate)} &nbsp;|&nbsp; 💆‍♂️ <b>หมอนวด:</b> ${docName}`;
  }

  container.innerHTML = `<div style="grid-column: span 3; text-align: center; padding: 20px; color: var(--text-muted);">กำลังตรวจสอบรอบเวลาว่าง...</div>`;

  if (!CONFIG.API_URL || CONFIG.API_URL.startsWith("ใส่_")) {
    renderMockSlots();
    return;
  }

  try {
    const url = `${CONFIG.API_URL}?action=get_slots&date=${bookingState.selectedDate}&service_id=${bookingState.selectedService.service_id}&doctor_id=${bookingState.selectedDoctor}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.success && data.slots && data.slots.length > 0) {
      activeSlots = data.slots;
      renderSlots(activeSlots);
    } else {
      container.innerHTML = `<div style="grid-column: span 3; text-align: center; padding: 24px; color: #c5221f;">ขออภัย ไม่มีรอบเวลาว่างในวันนี้ กรุณากดย้อนกลับเพื่อเลือกวันอื่นครับ</div>`;
    }
  } catch (err) {
    console.error("Slots Error:", err);
    renderMockSlots();
  }
}

function renderMockSlots() {
  activeSlots = [
    { start_time: "09:00", end_time: "10:15", available_doctors: [{ id: "DOC-001", name: "หมอสมศรี" }] },
    { start_time: "10:30", end_time: "11:45", available_doctors: [{ id: "DOC-001", name: "หมอสมศรี" }, { id: "DOC-002", name: "หมอบุญชู" }] },
    { start_time: "13:00", end_time: "14:15", available_doctors: [{ id: "DOC-002", name: "หมอบุญชู" }] },
    { start_time: "14:30", end_time: "15:45", available_doctors: [{ id: "DOC-001", name: "หมอสมศรี" }] }
  ];
  renderSlots(activeSlots);
}

function renderSlots(slots) {
  const container = document.getElementById("slotsGrid");
  container.innerHTML = "";

  slots.forEach(slot => {
    const item = document.createElement("div");
    const isSelected = bookingState.selectedSlot && bookingState.selectedSlot.start_time === slot.start_time;
    item.className = `slot-item ${isSelected ? 'selected' : ''}`;
    item.onclick = () => selectSlot(slot);

    item.innerHTML = `
      <div class="slot-time">${slot.start_time} - ${slot.end_time || ''}</div>
      <div class="slot-doc-count">${slot.available_doctors.length} ท่านว่าง</div>
    `;
    container.appendChild(item);
  });
}

function selectSlot(slot) {
  bookingState.selectedSlot = slot;
  renderSlots(activeSlots);
  document.getElementById("btnNext").disabled = false;
}

// ==========================================
// 7. การควบคุมขั้นตอน (Wizard Navigation)
// ==========================================
function updateStepUI() {
  document.getElementById("step1View").style.display = currentStep === 1 ? "block" : "none";
  document.getElementById("step2View").style.display = currentStep === 2 ? "block" : "none";
  document.getElementById("step3View").style.display = currentStep === 3 ? "block" : "none";
  document.getElementById("step4View").style.display = currentStep === 4 ? "block" : "none";

  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`stepIndicator${i}`);
    if (i <= currentStep) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  }

  document.getElementById("btnBack").style.display = currentStep > 1 ? "block" : "none";

  const btnNext = document.getElementById("btnNext");
  if (currentStep === 4) {
    btnNext.textContent = "✓ ยืนยันการจองคิว";
    btnNext.disabled = false;
  } else {
    btnNext.textContent = "ถัดไป ➔";
    if (currentStep === 1) btnNext.disabled = !bookingState.selectedService;
    if (currentStep === 2) btnNext.disabled = !bookingState.selectedDoctor;
    if (currentStep === 3) btnNext.disabled = !bookingState.selectedSlot;
  }
}

function nextStep() {
  if (currentStep === 1) {
    currentStep = 2;
    renderDoctorsForSelectedDate();
  } else if (currentStep === 2) {
    currentStep = 3;
    bookingState.selectedSlot = null;
    loadAvailableSlots();
  } else if (currentStep === 3) {
    currentStep = 4;
    renderSummary();
  } else if (currentStep === 4) {
    submitBooking();
  }
  updateStepUI();
}

function prevStep() {
  if (currentStep > 1) {
    currentStep--;
    updateStepUI();
  }
}

// ==========================================
// 8. Step 4: สรุปและส่งข้อมูลการจอง
// ==========================================
function renderSummary() {
  const srv = bookingState.selectedService;
  const slot = bookingState.selectedSlot;

  document.getElementById("summaryService").textContent = `${srv.name} (${srv.duration_mins} นาที)`;

  let docText = "ใครก็ได้ (ระบบจัดสรรหมอว่าง)";
  if (bookingState.selectedDoctor !== "ANY") {
    const doc = doctorsData.find(d => d.doctor_id === bookingState.selectedDoctor);
    if (doc) docText = doc.nickname || doc.name;
  }
  document.getElementById("summaryDoctor").textContent = docText;
  document.getElementById("summaryDate").textContent = formatThaiDateWithDay(bookingState.selectedDate);
  document.getElementById("summaryTime").textContent = `${slot.start_time} - ${slot.end_time || ''} น.`;
  document.getElementById("summaryPrice").textContent = `${Number(srv.price).toLocaleString()} บาท`;

  if (!document.getElementById("custNameInput").value && lineProfile.displayName) {
    document.getElementById("custNameInput").value = lineProfile.displayName;
  }
}

async function submitBooking() {
  const name = document.getElementById("custNameInput").value.trim();
  const idCard = (document.getElementById("custIdCardInput") ? document.getElementById("custIdCardInput").value.trim() : "");
  const phone = document.getElementById("custPhoneInput").value.trim();
  const notes = document.getElementById("custNotesInput").value.trim();

  if (!name) {
    alert("กรุณากรอกชื่อ-นามสกุล");
    document.getElementById("custNameInput").focus();
    return;
  }
  if (!idCard || idCard.length !== 13 || !/^\d{13}$/.test(idCard)) {
    alert("กรุณากรอกเลขประจำตัวประชาชนให้ครบ 13 หลัก (ตัวเลขล้วน)");
    if (document.getElementById("custIdCardInput")) document.getElementById("custIdCardInput").focus();
    return;
  }
  if (!phone || phone.length < 9) {
    alert("กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง");
    document.getElementById("custPhoneInput").focus();
    return;
  }

  showLoading("กำลังส่งข้อมูลการจองและออกตั๋ว...");

  const payload = {
    action: "create_booking",
    line_user_id: lineProfile.userId,
    customer_name: name,
    id_card: idCard,
    customer_phone: phone,
    doctor_id: bookingState.selectedDoctor,
    service_id: bookingState.selectedService.service_id,
    booking_date: bookingState.selectedDate,
    start_time: bookingState.selectedSlot.start_time,
    notes: notes
  };

  if (!CONFIG.API_URL || CONFIG.API_URL.startsWith("ใส่_")) {
    setTimeout(() => {
      hideLoading();
      showSuccessModal("BK-" + Date.now().toString().slice(-6));
    }, 1000);
    return;
  }

  try {
    const res = await fetch(CONFIG.API_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.success) {
      showSuccessModal(result.booking_id);
    } else {
      alert("ไม่สามารถจองได้: " + (result.error || "กรุณาลองใหม่อีกครั้ง"));
    }
  } catch (err) {
    console.error("Booking Error:", err);
    alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
  } finally {
    hideLoading();
  }
}

function showSuccessModal(bookingId) {
  document.getElementById("successBookingId").textContent = bookingId;
  document.getElementById("successModal").style.display = "flex";
}

function closeSuccessAndGoHistory() {
  document.getElementById("successModal").style.display = "none";
  // Reset form
  currentStep = 1;
  bookingState.selectedService = null;
  bookingState.selectedSlot = null;
  updateStepUI();
  renderServices();
  // สลับไปแท็บประวัติ
  switchMainTab('history');
}

// ==========================================
// 9. แท็บคิวของฉัน (My Bookings)
// ==========================================
async function switchMainTab(tab) {
  const tabBooking = document.getElementById("tabBooking");
  const tabHistory = document.getElementById("tabHistory");
  const bookingFlow = document.getElementById("bookingFlowContainer");
  const historyView = document.getElementById("historyViewContainer");

  if (tab === "booking") {
    tabBooking.classList.add("active");
    tabHistory.classList.remove("active");
    bookingFlow.style.display = "block";
    historyView.style.display = "none";
  } else {
    tabBooking.classList.remove("active");
    tabHistory.classList.add("active");
    bookingFlow.style.display = "none";
    historyView.style.display = "block";
    await loadCustomerBookings();
  }
}

async function loadCustomerBookings() {
  const container = document.getElementById("myBookingsList");
  container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">กำลังโหลดประวัติการจอง...</div>`;

  if (!CONFIG.API_URL || CONFIG.API_URL.startsWith("ใส่_")) {
    container.innerHTML = `
      <div class="my-booking-card">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="font-weight: 700; color: var(--primary);">BK-DEMO-001</span>
          <span class="badge badge-confirmed">ยืนยันแล้ว</span>
        </div>
        <div style="font-weight: 600; margin-bottom: 4px;">นวดแผนไทยราชสำนัก (แก้อาการ)</div>
        <div style="font-size: 13px; color: var(--text-muted);">หมอนวด: หมอสมศรี</div>
        <div style="font-size: 13px; color: var(--text-muted);">📅 วันนี้ เวลา 14:00 - 15:00 น.</div>
      </div>
    `;
    return;
  }

  try {
    const res = await fetch(`${CONFIG.API_URL}?action=my_bookings&user_id=${lineProfile.userId}`);
    const data = await res.json();

    if (data.success && data.bookings && data.bookings.length > 0) {
      container.innerHTML = "";
      data.bookings.forEach(b => {
        const card = document.createElement("div");
        card.className = "my-booking-card";

        const isConfirmed = b.status === "CONFIRMED";
        const badgeClass = isConfirmed ? "badge-confirmed" : "badge-cancelled";
        const statusText = isConfirmed ? "ยืนยันแล้ว" : (b.status === "CANCELLED" ? "ยกเลิกแล้ว" : b.status);

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-weight: 700; color: var(--primary);">${b.booking_id}</span>
            <span class="badge ${badgeClass}">${statusText}</span>
          </div>
          <div style="font-weight: 600; margin-bottom: 4px;">${b.service_name}</div>
          <div style="font-size: 13px; color: var(--text-muted);">หมอนวด: ${b.doctor_name}</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">
            📅 ${formatDateThai(b.date)} | ⏰ ${b.start_time} - ${b.end_time} น.
          </div>
          ${isConfirmed ? `
            <button class="btn btn-secondary" style="width: 100%; font-size: 13px; padding: 8px; color: #c5221f;" onclick="cancelBookingClick('${b.booking_id}')">
              ยกเลิกการนัดหมาย
            </button>
          ` : ''}
        `;
        container.appendChild(card);
      });
    } else {
      container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">คุณยังไม่มีประวัติการนัดหมาย</div>`;
    }
  } catch (err) {
    console.error("History Error:", err);
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #c5221f;">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>`;
  }
}

async function cancelBookingClick(bookingId) {
  if (!confirm(`คุณต้องการยกเลิกการนัดหมายรหัส ${bookingId} ใช่หรือไม่?`)) return;

  showLoading("กำลังทำรายการยกเลิก...");
  try {
    const res = await fetch(CONFIG.API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "cancel_booking",
        booking_id: bookingId,
        user_id: lineProfile.userId
      })
    });
    const result = await res.json();
    if (result.success) {
      alert("ยกเลิกการนัดหมายเรียบร้อยแล้ว");
      loadCustomerBookings();
    } else {
      alert("ไม่สามารถยกเลิกได้: " + (result.error || "เกิดข้อผิดพลาด"));
    }
  } catch (e) {
    alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
  } finally {
    hideLoading();
  }
}

// Autofill ประวัติลูกค้า
async function fetchCustomerHistory() {
  if (!CONFIG.API_URL || CONFIG.API_URL.startsWith("ใส่_")) return;
  try {
    const res = await fetch(`${CONFIG.API_URL}?action=get_customer&user_id=${lineProfile.userId}`);
    const data = await res.json();
    if (data.success && data.customer) {
      if (data.customer.name) document.getElementById("custNameInput").value = data.customer.name;
      if (data.customer.id_card && data.customer.id_card !== "-" && document.getElementById("custIdCardInput")) {
        document.getElementById("custIdCardInput").value = data.customer.id_card;
      }
      if (data.customer.phone) document.getElementById("custPhoneInput").value = data.customer.phone;
    }
  } catch (e) {
    console.warn("Autofill profile error:", e);
  }
}

// Helpers
function formatDateThai(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const thaiYear = parseInt(y, 10) + 543;
  return `${parseInt(d, 10)} ${thaiMonths[parseInt(m, 10) - 1]} ${thaiYear}`;
}

function showLoading(text) {
  document.getElementById("loadingText").textContent = text || "กำลังประมวลผล...";
  document.getElementById("loadingOverlay").style.display = "flex";
}

function hideLoading() {
  document.getElementById("loadingOverlay").style.display = "none";
}
