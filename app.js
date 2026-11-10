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
let doctorLeavesData = [];

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
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const minDate = `${yyyy}-${mm}-${dd}`;
  bookingState.selectedDate = minDate;
  calViewingMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const dateInput = document.getElementById("bookingDateInput");
  if (dateInput) {
    const max = new Date();
    max.setDate(today.getDate() + (CONFIG.MAX_ADVANCE_DAYS || 30));
    const maxDate = `${max.getFullYear()}-${String(max.getMonth() + 1).padStart(2, "0")}-${String(max.getDate()).padStart(2, "0")}`;
    dateInput.min = minDate;
    dateInput.max = maxDate;
    dateInput.value = minDate;
  }
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
    useMockData();
    hideLoading();
    renderCalendar();
    loadAvailableSlots();
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

      // ดึงตารางเวรที่จัดไว้ใน LocalStorage มารวมด้วยทันที
      try {
        const stored = JSON.parse(localStorage.getItem("CLINIC_MONTHLY_ROSTERS") || "{}");
        for (const m in stored) {
          Object.assign(monthlyRosterCache, stored[m]);
        }
      } catch (e) {}

      // ดึงข้อมูลวันลาของหมอนวดจาก Server และ LocalStorage
      if (data.leaves && Array.isArray(data.leaves)) {
        doctorLeavesData = data.leaves;
        try {
          localStorage.setItem("CLINIC_DOCTOR_LEAVES", JSON.stringify(data.leaves));
        } catch (e) {}
      } else {
        try {
          doctorLeavesData = JSON.parse(localStorage.getItem("CLINIC_DOCTOR_LEAVES") || "[]");
        } catch (e) {}
      }

      if (data.settings && data.settings.shop_name) {
        document.getElementById("shopTitle").textContent = data.settings.shop_name;
      }
      renderCalendar();
      loadAvailableSlots();
    } else {
      alert("เกิดข้อผิดพลาดในการโหลดข้อมูล: " + data.error);
      useMockData();
      renderCalendar();
      loadAvailableSlots();
    }
  } catch (err) {
    console.error("Fetch API Error:", err);
    useMockData();
    renderCalendar();
    loadAvailableSlots();
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
    { doctor_id: "DOC-004", name: "ประเสริฐ ชนะพล", nickname: "หมอเสริฐ", skills: "SRV-001,SRV-003", work_days: "0,1,2,3,4,5,6" },
    { doctor_id: "DOC-005", name: "มณฑิรา แก้วมณี", nickname: "หมอมด", skills: "SRV-001,SRV-002,SRV-003,SRV-004,SRV-005", work_days: "1,2,3,4,5" }
  ];
}

// ==========================================================================
// 4. การแสดงผล Step 3: รายการบริการ
// ==========================================================================
function renderServices() {
  const container = document.getElementById("servicesList");
  const subtext = document.getElementById("serviceStepSubtext");
  if (!container) return;
  container.innerHTML = "";

  if (subtext) {
    let docName = "ใครก็ได้ (ระบบจัดหมอว่างให้)";
    if (bookingState.selectedDoctor && bookingState.selectedDoctor !== "ANY") {
      const doc = doctorsData.find(d => d.doctor_id === bookingState.selectedDoctor);
      if (doc) docName = doc.nickname || doc.name;
    }
    const slotStr = bookingState.selectedSlot ? (bookingState.selectedSlot.start_time + ' - ' + (bookingState.selectedSlot.end_time || '') + ' น.') : '-';
    subtext.innerHTML = `📅 <b>วันที่:</b> ${formatThaiDateWithDay(bookingState.selectedDate)} &nbsp;|&nbsp; ⏰ <b>รอบ:</b> ${slotStr} &nbsp;|&nbsp; 💆‍♂️ <b>หมอนวด:</b> ${docName}`;
  }

  // หากเจาะจงหมอ ให้ดูทักษะของหมอท่านนั้น
  let selectedDocSkills = null;
  if (bookingState.selectedDoctor && bookingState.selectedDoctor !== "ANY") {
    const doc = doctorsData.find(d => d.doctor_id === bookingState.selectedDoctor);
    if (doc && doc.skills) {
      selectedDocSkills = String(doc.skills).split(",").map(s => String(s).trim());
    }
  }

  servicesData.forEach(srv => {
    const isSkillSupported = !selectedDocSkills || selectedDocSkills.includes(srv.service_id);
    const card = document.createElement("div");
    const isSelected = bookingState.selectedService && bookingState.selectedService.service_id === srv.service_id;
    card.className = `service-card ${isSelected ? 'selected' : ''} ${!isSkillSupported ? 'disabled' : ''}`;

    if (!isSkillSupported) {
      card.style.opacity = "0.6";
      card.style.cursor = "not-allowed";
      card.onclick = () => alert(`⚠️ ขออภัยครับ หมอนวดที่เลือกไม่ได้รับบริการ ${srv.name}`);
    } else {
      card.onclick = () => selectService(srv);
    }

    card.innerHTML = `
      <div class="service-name">${srv.name} ${!isSkillSupported ? '<span style="font-size:11px; color:#ef4444; font-weight:normal;">(หมอที่เลือกไม่ได้รับบริการนี้)</span>' : ''}</div>
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
// 5. ปฏิทินเลือกวัน (1-30 วัน) & 4 รอบเวลาคงที่ (Fixed 4 Rounds)
// ==========================================================================
let calViewingMonth = new Date(); // เดือนที่กำลังเปิดดูในปฏิทิน

const FIXED_4_ROUNDS = [
  { start_time: "09:00", end_time: "10:15", title: "รอบที่ 1", time_label: "09:00 - 10:15 น." },
  { start_time: "10:30", end_time: "11:45", title: "รอบที่ 2", time_label: "10:30 - 11:45 น." },
  { start_time: "13:00", end_time: "14:15", title: "รอบที่ 3", time_label: "13:00 - 14:15 น." },
  { start_time: "14:30", end_time: "15:45", title: "รอบที่ 4", time_label: "14:30 - 15:45 น." }
];

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

function changeCalMonth(direction) {
  calViewingMonth.setMonth(calViewingMonth.getMonth() + direction);
  renderCalendar();
}

function renderCalendar() {
  const grid = document.getElementById("calDaysGrid");
  const monthTitle = document.getElementById("calMonthTitle");
  if (!grid || !monthTitle) return;

  const y = calViewingMonth.getFullYear();
  const m = calViewingMonth.getMonth(); // 0-11
  const thaiMonthsFull = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  monthTitle.textContent = `${thaiMonthsFull[m]} ${y + 543}`;

  grid.innerHTML = "";

  const firstDayOfWeek = new Date(y, m, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  // เซลล์ว่างก่อนวันแรกของเดือน
  for (let i = 0; i < firstDayOfWeek; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-day-cell empty";
    grid.appendChild(empty);
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const maxAdvance = CONFIG.MAX_ADVANCE_DAYS || 30;
  const maxDateObj = new Date();
  maxDateObj.setDate(maxDateObj.getDate() + maxAdvance);
  const maxDateStr = maxDateObj.toISOString().split("T")[0];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cell = document.createElement("div");
    cell.className = "cal-day-cell";
    cell.textContent = day;

    const isPast = dayStr < todayStr;
    const isTooFar = dayStr > maxDateStr;

    if (isPast || isTooFar) {
      cell.classList.add("disabled");
    } else {
      if (dayStr === todayStr) cell.classList.add("today");
      if (dayStr === bookingState.selectedDate) cell.classList.add("selected");
      cell.onclick = () => selectCalendarDate(dayStr);
    }

    grid.appendChild(cell);
  }
}

async function selectCalendarDate(dateVal) {
  bookingState.selectedDate = dateVal;
  bookingState.selectedSlot = null;
  bookingState.selectedDoctor = "ANY";

  // Re-render calendar เพื่ออัปเดตสีวันที่ถูกเลือก
  renderCalendar();

  const dateDisplay = document.getElementById("dateDisplayLabel");
  if (dateDisplay) {
    dateDisplay.innerHTML = `📅 <b>วันที่เลือก:</b> ${formatThaiDateWithDay(dateVal)}`;
  }

  // โหลดรอบเวลา
  await loadAvailableSlots();
}

async function loadAvailableSlots() {
  const container = document.getElementById("slotsGrid");
  const dateDisplay = document.getElementById("dateDisplayLabel");

  if (dateDisplay) {
    dateDisplay.innerHTML = `📅 <b>วันที่เลือก:</b> ${formatThaiDateWithDay(bookingState.selectedDate)}`;
  }

  if (!container) return;
  container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: var(--text-muted);">กำลังตรวจสอบรอบเวลา...</div>`;

  const dateVal = bookingState.selectedDate;
  const monthStr = dateVal.slice(0, 7);

  // 1. ตรวจสอบตารางเวร และ วันลา จาก LocalStorage ก่อนเป็นอันดับแรก
  try {
    const storedRosters = JSON.parse(localStorage.getItem("CLINIC_MONTHLY_ROSTERS") || "{}");
    if (storedRosters[monthStr]) {
      Object.assign(monthlyRosterCache, storedRosters[monthStr]);
    }
    const storedLeaves = JSON.parse(localStorage.getItem("CLINIC_DOCTOR_LEAVES") || "[]");
    if (storedLeaves && storedLeaves.length > 0) {
      doctorLeavesData = storedLeaves;
    }
  } catch (e) {}

  // 2. ดึงข้อมูลตารางเวรและรอบเวลาจาก API
  let fetchedSlots = [];
  if (CONFIG.API_URL && !CONFIG.API_URL.startsWith("ใส่_")) {
    try {
      const srvParam = (servicesData && servicesData[0]) ? servicesData[0].service_id : "";
      const [resSlots, resRoster] = await Promise.all([
        fetch(`${CONFIG.API_URL}?action=get_slots&date=${dateVal}&service_id=${srvParam}&doctor_id=ANY`).then(r => r.json()).catch(() => null),
        fetch(`${CONFIG.API_URL}?action=get_monthly_roster&month=${monthStr}`).then(r => r.json()).catch(() => null)
      ]);

      if (resRoster && resRoster.success && resRoster.roster) {
        Object.assign(monthlyRosterCache, resRoster.roster);
      }
      if (resSlots && resSlots.success && Array.isArray(resSlots.slots)) {
        fetchedSlots = resSlots.slots;
      }
    } catch (e) {
      console.warn("Slots fetch warning:", e);
    }
  }

  // รวม 4 รอบเวลาคงที่เข้ากับข้อมูลแพทย์ที่ว่าง
  activeSlots = FIXED_4_ROUNDS.map(round => {
    const match = fetchedSlots.find(s => s.start_time === round.start_time);
    if (match) {
      return {
        ...round,
        available_doctors: match.available_doctors || []
      };
    } else {
      // Mock / Local calculation
      const [y, m, d] = dateVal.split("-").map(Number);
      const dayOfWeek = new Date(y, m - 1, d).getDay();
      const dutyDocIds = monthlyRosterCache[dateVal] || null;
      const freeDocs = doctorsData.filter(doc => {
        if (doc.is_active === false || String(doc.is_active).toUpperCase() === "FALSE") return false;
        // เช็ควันลา
        const onLeave = doctorLeavesData.some(l => l.doctor_id === doc.doctor_id && String(l.leave_date || "").startsWith(dateVal));
        if (onLeave) return false;
        // เช็คตารางเวร
        if (dutyDocIds !== null) {
          return dutyDocIds.includes(doc.doctor_id);
        } else {
          return String(doc.work_days || "").split(",").map(s => parseInt(String(s).trim(), 10)).includes(dayOfWeek);
        }
      });

      return {
        ...round,
        available_doctors: freeDocs.map(d => ({ id: d.doctor_id, name: d.nickname || d.name }))
      };
    }
  });

  renderFixedRounds(activeSlots);
}

function renderFixedRounds(slots) {
  const container = document.getElementById("slotsGrid");
  container.innerHTML = "";

  slots.forEach(slot => {
    const docCount = slot.available_doctors ? slot.available_doctors.length : 0;
    const isAvailable = docCount > 0;
    const isSelected = bookingState.selectedSlot && bookingState.selectedSlot.start_time === slot.start_time;

    const card = document.createElement("div");
    card.className = `round-slot-card ${isSelected ? 'selected' : ''} ${!isAvailable ? 'disabled' : ''}`;

    if (!isAvailable) {
      card.onclick = () => alert(`⚠️ ขออภัยครับ รอบเวลา ${slot.time_label} ไม่มีหมอนวดว่างในวันที่เลือกครับ`);
    } else {
      card.onclick = () => selectRoundSlot(slot);
    }

    card.innerHTML = `
      <div style="font-size: 11px; color: var(--text-muted); font-weight: 600; margin-bottom: 2px;">${slot.title}</div>
      <div class="round-slot-time">${slot.time_label}</div>
      <span class="round-slot-badge ${isAvailable ? 'available' : 'full'}">
        ${isAvailable ? `🟢 ว่าง (${docCount} ท่าน)` : '⛔ เต็มทุกคิว'}
      </span>
    `;
    container.appendChild(card);
  });
}

function selectRoundSlot(slot) {
  bookingState.selectedSlot = slot;
  renderFixedRounds(activeSlots);
  document.getElementById("btnNext").disabled = false;
}

// ==========================================================================
// 6. การแสดงผล Step 2: เลือกหมอนวดในรอบเวลาที่เลือก
// ==========================================================================
function renderDoctorsForSelectedDate() {
  const grid = document.getElementById("doctorsGrid");
  const subtext = document.getElementById("doctorStepSubtext");
  const badge = document.getElementById("onDutyCountBadge");
  grid.innerHTML = "";

  if (subtext) {
    const slotStr = bookingState.selectedSlot ? (bookingState.selectedSlot.start_time + ' - ' + (bookingState.selectedSlot.end_time || '') + ' น.') : '-';
    subtext.innerHTML = `📅 <b>วันที่:</b> ${formatThaiDateWithDay(bookingState.selectedDate)} &nbsp;|&nbsp; ⏰ <b>รอบเวลา:</b> ${slotStr}`;
  }

  const [y, m, d] = bookingState.selectedDate.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayOfWeek = dateObj.getDay();
  const monthStr = bookingState.selectedDate.slice(0, 7);

  // ตรวจสอบว่าเดือนนี้มีการจัดตารางเวรไว้ในระบบหรือไม่
  let isMonthScheduled = false;
  for (const k in monthlyRosterCache) {
    if (k.startsWith(monthStr) && Array.isArray(monthlyRosterCache[k])) {
      isMonthScheduled = true;
      break;
    }
  }

  const dutyDocIds = isMonthScheduled ? (monthlyRosterCache[bookingState.selectedDate] || []) : null;

  // คัดกรองหมอที่เปิดใช้งาน
  const activeDocs = doctorsData.filter(doc => doc.is_active !== false && String(doc.is_active).toUpperCase() !== "FALSE");

  // รายชื่อหมอที่ว่างจริงในรอบเวลานี้ (จาก available_doctors ใน slot)
  const slotDocIds = (bookingState.selectedSlot && Array.isArray(bookingState.selectedSlot.available_doctors))
    ? bookingState.selectedSlot.available_doctors.map(d => d.id || d.doctor_id)
    : [];

  // แยกกลุ่มหมอ: ว่างในรอบนี้ vs ไม่พร้อมให้บริการ/ติดคิว
  const onDutyDocs = [];
  const offDutyDocs = [];

  activeDocs.forEach(doc => {
    let worksOnDay = false;
    if (dutyDocIds !== null) {
      worksOnDay = dutyDocIds.includes(doc.doctor_id);
    } else {
      worksOnDay = String(doc.work_days || "").split(",").map(s => parseInt(String(s).trim(), 10)).includes(dayOfWeek);
    }

    // ตรวจสอบวันลาของหมอในวันนี้
    const leaveRecord = doctorLeavesData.find(l => {
      const lDate = String(l.leave_date || "").slice(0, 10);
      return l.doctor_id === doc.doctor_id && lDate === bookingState.selectedDate;
    });

    const isSlotAvailable = slotDocIds.includes(doc.doctor_id);

    if (leaveRecord) {
      offDutyDocs.push({
        doc,
        worksOnDay: false,
        isSlotAvailable: false,
        isOnLeave: true,
        leaveReason: leaveRecord.reason || "ลางาน"
      });
    } else if (worksOnDay && isSlotAvailable) {
      onDutyDocs.push(doc);
    } else {
      offDutyDocs.push({
        doc,
        worksOnDay,
        isSlotAvailable,
        isOnLeave: false
      });
    }
  });

  if (badge) {
    badge.textContent = `พร้อมให้บริการ ${onDutyDocs.length} ท่าน`;
  }

  // หากหมอเดิมที่เคยเลือกไว้ ไม่ได้ว่างในรอบนี้ ให้ปรับเป็น ANY อัตโนมัติ
  if (bookingState.selectedDoctor !== "ANY") {
    const isStillAvailable = onDutyDocs.some(d => d.doctor_id === bookingState.selectedDoctor);
    if (!isStillAvailable) {
      const prevDoc = activeDocs.find(d => d.doctor_id === bookingState.selectedDoctor);
      const prevDocName = prevDoc ? (prevDoc.nickname || prevDoc.name) : "หมอที่เลือกไว้";
      bookingState.selectedDoctor = "ANY";
      const noticeBox = document.createElement("div");
      noticeBox.style.cssText = "grid-column: 1 / -1; background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px 14px; border-radius: 8px; font-size: 12px; margin-bottom: 8px;";
      noticeBox.innerHTML = `ℹ️ <b>${prevDocName}</b> ไม่ว่างในรอบเวลานี้ ระบบจึงปรับเป็น <b>"ใครก็ได้"</b> ให้อัตโนมัติครับ`;
      grid.appendChild(noticeBox);
    }
  }

  if (onDutyDocs.length === 0) {
    grid.innerHTML += `
      <div style="grid-column: 1 / -1; background: #fffbeb; border: 1px solid #fef3c7; color: #b45309; padding: 18px; border-radius: 8px; text-align: center; font-size: 13px; line-height: 1.6;">
        ⚠️ <b>ไม่มีหมอนวดว่างในรอบเวลานี้</b><br>
        กรุณากดย้อนกลับเพื่อเปลี่ยนรอบเวลา หรือเปลี่ยนวันนัดหมายครับ
      </div>
    `;
    if (offDutyDocs.length > 0) {
      renderOffDutyCards(grid, offDutyDocs);
    }
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
    <div class="doctor-subtext">ระบบจัดหมอว่างในรอบนี้ให้</div>
    <span class="doctor-duty-badge on">สุ่มหมอว่าง</span>
  `;
  grid.appendChild(anyCard);

  // 2. การ์ดหมอแต่ละท่านที่ "ว่างในรอบนี้"
  onDutyDocs.forEach(doc => {
    const card = document.createElement("div");
    card.className = `doctor-card ${bookingState.selectedDoctor === doc.doctor_id ? 'selected' : ''}`;
    card.onclick = () => selectDoctor(doc.doctor_id);
    card.innerHTML = `
      <div class="doctor-avatar-circle">💆</div>
      <div class="doctor-name-display">${doc.nickname || doc.name}</div>
      <div class="doctor-subtext">เวลา ${doc.work_start_time || '10:00'} - ${doc.work_end_time || '20:00'}</div>
      <span class="doctor-duty-badge on">🟢 ว่างในรอบนี้</span>
    `;
    grid.appendChild(card);
  });

  // 3. การ์ดหมอที่ไม่ว่างในรอบนี้ หรือไม่เข้าเวร/ลางาน
  if (offDutyDocs.length > 0) {
    renderOffDutyCards(grid, offDutyDocs);
  }

  document.getElementById("btnNext").disabled = false;
}

function renderOffDutyCards(container, offDutyDocs) {
  const divider = document.createElement("div");
  divider.style.cssText = "grid-column: 1 / -1; margin-top: 14px; margin-bottom: 4px; padding-top: 10px; border-top: 1px dashed var(--border); font-size: 12px; font-weight: 600; color: var(--text-muted); display: flex; align-items: center; justify-content: space-between;";
  divider.innerHTML = `<span>หมอนวดที่ไม่ว่างในรอบนี้:</span> <span style="font-size: 11px; font-weight: normal; color: #94a3b8;">(เลือกไม่ได้)</span>`;
  container.appendChild(divider);

  offDutyDocs.forEach(({ doc, worksOnDay, isSlotAvailable, isOnLeave, leaveReason }) => {
    const card = document.createElement("div");
    card.className = "doctor-card disabled";
    
    let reasonText = "⛔ ไม่ว่างในรอบนี้";
    let badgeClass = "off";
    let alertMsg = "";

    if (isOnLeave) {
      reasonText = `🏖️ ลางาน (${leaveReason || 'ลางาน'})`;
      badgeClass = "off";
      alertMsg = `⚠️ ขออภัยครับ หมอ${doc.nickname || doc.name} ลางานในวันที่ ${formatThaiDateWithDay(bookingState.selectedDate)} (${leaveReason || 'ลางาน'})`;
    } else if (!worksOnDay) {
      reasonText = "⛔ ไม่เข้าเวรวันนี้";
      badgeClass = "off";
      alertMsg = `⚠️ ขออภัยครับ หมอ${doc.nickname || doc.name} ไม่ได้เข้าเวรในวันที่ ${formatThaiDateWithDay(bookingState.selectedDate)}`;
    } else if (!isSlotAvailable) {
      reasonText = "⏳ ติดคิวในรอบนี้";
      badgeClass = "off";
      alertMsg = `⚠️ ขออภัยครับ หมอ${doc.nickname || doc.name} ติดคิวนัดหมายอื่นในรอบเวลานี้ กรุณาเลือกหมอท่านอื่นที่ว่าง หรือเปลี่ยนรอบเวลาครับ`;
    }

    card.onclick = () => alert(alertMsg);

    card.innerHTML = `
      <div class="doctor-avatar-circle" style="background: #e2e8f0; color: #94a3b8;">${isOnLeave ? '🏖️' : '💆'}</div>
      <div class="doctor-name-display" style="color: #64748b;">${doc.nickname || doc.name}</div>
      <div class="doctor-subtext">${reasonText}</div>
      <span class="doctor-duty-badge ${badgeClass}">${reasonText}</span>
    `;
    container.appendChild(card);
  });
}

function selectDoctor(doctorId) {
  if (doctorId !== "ANY") {
    const doc = doctorsData.find(d => d.doctor_id === doctorId);
    if (!doc) return;

    // 1. ตรวจสอบวันลา
    const leaveRecord = doctorLeavesData.find(l => {
      const lDate = String(l.leave_date || "").slice(0, 10);
      return l.doctor_id === doc.doctor_id && lDate === bookingState.selectedDate;
    });
    if (leaveRecord) {
      alert(`⚠️ ขออภัยครับ หมอ${doc.nickname || doc.name} ลางานในวันที่ ${formatThaiDateWithDay(bookingState.selectedDate)} (${leaveRecord.reason || 'ลางาน'})`);
      return;
    }

    // 2. ตรวจสอบตารางเวร
    const monthStr = bookingState.selectedDate.slice(0, 7);
    let isMonthScheduled = false;
    for (const k in monthlyRosterCache) {
      if (k.startsWith(monthStr) && Array.isArray(monthlyRosterCache[k])) {
        isMonthScheduled = true;
        break;
      }
    }

    const dutyDocIds = isMonthScheduled ? (monthlyRosterCache[bookingState.selectedDate] || []) : null;
    const [y, m, d] = bookingState.selectedDate.split("-").map(Number);
    const dayOfWeek = new Date(y, m - 1, d).getDay();

    let worksOnDay = false;
    if (dutyDocIds !== null) {
      worksOnDay = dutyDocIds.includes(doc.doctor_id);
    } else {
      worksOnDay = String(doc.work_days || "").split(",").map(s => parseInt(String(s).trim(), 10)).includes(dayOfWeek);
    }

    if (!worksOnDay) {
      alert(`⚠️ ขออภัยครับ หมอ${doc.nickname || doc.name} ไม่ได้เข้าเวรในวันที่ ${formatThaiDateWithDay(bookingState.selectedDate)}`);
      return;
    }

    // 3. ตรวจสอบว่าว่างในรอบเวลานี้หรือไม่
    const slotDocIds = (bookingState.selectedSlot && Array.isArray(bookingState.selectedSlot.available_doctors))
      ? bookingState.selectedSlot.available_doctors.map(d => d.id || d.doctor_id)
      : [];
    if (!slotDocIds.includes(doc.doctor_id)) {
      alert(`⚠️ ขออภัยครับ หมอ${doc.nickname || doc.name} ติดคิวนัดหมายอื่นในรอบเวลานี้ครับ`);
      return;
    }
  }

  bookingState.selectedDoctor = doctorId;
  renderDoctorsForSelectedDate();
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
    if (currentStep === 1) btnNext.disabled = !bookingState.selectedSlot;
    if (currentStep === 2) btnNext.disabled = !bookingState.selectedDoctor;
    if (currentStep === 3) btnNext.disabled = !bookingState.selectedService;
  }
}

function nextStep() {
  if (currentStep === 1) {
    if (!bookingState.selectedSlot) {
      alert("กรุณาเลือกรอบเวลาที่ต้องการนัดหมาย");
      return;
    }
    currentStep = 2;
    renderDoctorsForSelectedDate();
  } else if (currentStep === 2) {
    if (!bookingState.selectedDoctor) {
      alert("กรุณาเลือกหมอนวด หรือเลือกใครก็ได้");
      return;
    }
    currentStep = 3;
    renderServices();
  } else if (currentStep === 3) {
    if (!bookingState.selectedService) {
      alert("กรุณาเลือกบริการที่ต้องการ");
      return;
    }
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
  bookingState.selectedDoctor = "ANY";
  bookingState.selectedService = null;
  bookingState.selectedSlot = null;
  updateStepUI();
  loadAvailableSlots();
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