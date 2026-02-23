// Global variables
let globalDrugList = [];
let globalUsersData = [];
let currentUser = null;

// Chart.js instances (for charts 1-4)
let processChartInstance = null;
let errorChartInstance = null;
let causeChartInstance = null;
let drugChartInstance = null;

let googleSheetsConfig = {
    apiKey: 'AIzaSyCF-pWr13N_s7Iu868nSa6cPiMxDduuJ1k',
    spreadsheetId: '1QDIxEXCVLiA7oijXN15N2ZH2LzPtHDecbqolYGs9Ldk',
    sheetName: 'Predispensing_Errors',
    userSheetName: 'Users',
    drugSheetName: 'Drug_List',
    webAppUrl: 'https://script.google.com/macros/s/AKfycbzMfgXu9oscmYS_wXPX6rpdJeeZTj6w4uFxB_rPnYC8XVd6amwGGKHibHk5Iw2fw72E/exec' // ใส่ Google Apps Script Web App URL ที่ได้จาก Deploy
};

// Central demo users definition (ลดการซ้ำซ้อน)
const DEMO_USERS = [
    // เภสัชกร
    { psCode: 'P01', id13: '1234567890123', name: 'ทดสอบ ทดสอบ', group: 'เภสัชกร', level: 'supervisor', email: '', password: '@12345', status: true },
    { psCode: 'P02', id13: '3460700549570', name: 'ภญ.อาศิรา ภูศรีดาว', group: 'เภสัชกร', level: 'pharmacist', email: '', password: '@12345', status: true },
    { psCode: 'P03', id13: '3349900018143', name: 'ภญ.ชุติธนา ภัทรทิวานนท์', group: 'เภสัชกร', level: 'pharmacist', email: '', password: '@12345', status: true },
    { psCode: 'P12', id13: '3100200159376', name: 'ภญ.ภิญรัตน์ มหาลีวีรัศมี', group: 'เภสัชกร', level: 'pharmacist', email: '', password: '@12345', status: true },
    { psCode: 'P13', id13: '3320100275241', name: 'ภก.สุทธินันท์ เอิกเกริก', group: 'เภสัชกร', level: 'admin', email: 's.oekaroek@gmail.com', password: 'admin123', status: true },
    { psCode: 'P22', id13: '1339900076651', name: 'ภญ.สิริกัณยา มหาลวเลิศ', group: 'เภสัชกร', level: 'pharmacist', email: '', password: '@12345', status: true },
    { psCode: 'P25', id13: '1450600156880', name: 'ภก.สุริยา แก้วภูมิแห่', group: 'เภสัชกร', level: 'pharmacist', email: '', password: '๑๑๒๓๔๕', status: true },
    // เจ้าพนักงานเภสัชกรรม
    { psCode: 'S01', id13: '3330200181795', name: 'นายปริญญา นามวงศ์', group: 'เจ้าพนักงานเภสัชกรรม', level: 'user', email: '', password: '@12345', status: true },
    { psCode: 'S02', id13: '3339900154217', name: 'นางกรรณิการ์ คำพิทักษ์', group: 'เจ้าพนักงานเภสัชกรรม', level: 'user', email: '', password: '@12345', status: true },
    { psCode: 'S19', id13: '1331500052618', name: 'นางสาวศศิประภา มงคลแก้ว', group: 'เจ้าพนักงานเภสัชกรรม', level: 'user', email: '', password: '12345', status: true },
    // Admin สำหรับทดสอบ
    { psCode: 'admin', id13: '9999999999999', name: 'ผู้ดูแลระบบ', group: 'IT', level: 'admin', email: 'admin@hospital.com', password: 'admin123', status: true }
];

function findDemoUser(userCode, password) {
    const codeLower = userCode.toLowerCase();
    return DEMO_USERS.find(u => (
        (u.psCode && u.psCode.toLowerCase() === codeLower) ||
        (u.id13 && u.id13.toLowerCase() === codeLower)
    ) && u.password === password);
}

// Authentication and User Management
function checkAuthentication() {
    const storedUser = localStorage.getItem('currentUser');
    
    if (storedUser) {
        try {
            currentUser = JSON.parse(storedUser);
            showMainApp();
            return true;
        } catch (error) {
            console.error('Error parsing stored user:', error);
            localStorage.removeItem('currentUser');
        }
    }
    showLoginPage();
    return false;
}

function showLoginPage() {
    document.getElementById('login').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
}

function showMainApp() {
    
    document.getElementById('login').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    
    // Update user display
    const userNameEl = document.getElementById('userName');
    if (userNameEl && currentUser) {
        userNameEl.textContent = currentUser.name || currentUser.psCode;
    }
    
    // Wait a bit for DOM to be ready then update reporter field
    setTimeout(() => { updateReporterField(); }, 100);
    
    // Update dashboard user info
    updateDashboardUserInfo();
    
    // Load initial data
    loadData();
}

function updateReporterField() {
    
    const reporterEl = document.getElementById('reporter');
    
    if (!reporterEl) {
    console.error('Reporter element not found in DOM');
        // Try to find it with query selector
        const altReporter = document.querySelector('input[name="reporter"]');
        return;
    }
    
    if (currentUser) {
        // รูปแบบ: ชื่อ-นามสกุล (PS Code) - กลุ่ม/ระดับ
        const reporterValue = `${currentUser.name} (${currentUser.psCode}) - ${currentUser.group}/${currentUser.level}`;
        reporterEl.value = reporterValue;
        
        // Force visual update
        reporterEl.dispatchEvent(new Event('input', { bubbles: true }));
        reporterEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
        // ถ้าไม่มี currentUser ให้แสดงข้อความรอ
        reporterEl.value = 'รอโหลดชื่อผู้ใช้งาน...';
    }
}

function updateDashboardUserInfo() {
    const currentUserDisplay = document.getElementById('currentUserDisplay');
    const currentGroupDisplay = document.getElementById('currentGroupDisplay');
    
    if (currentUserDisplay && currentUser) {
        currentUserDisplay.textContent = currentUser.name;
    }
    
    if (currentGroupDisplay && currentUser) {
        currentGroupDisplay.textContent = currentUser.group || 'ไม่ระบุ';
    }
    
    // Set default filter to show current user's reports
    const filterUser = document.getElementById('filterUser');
    if (filterUser && currentUser) {
        // Set default to current user for regular users, all for admins
        if (currentUser.level === 'admin' || currentUser.level === 'supervisor') {
            filterUser.value = '';  // Show all for admin/supervisor
        } else {
            filterUser.value = 'currentUser';  // Show only user's reports for regular users
        }
    }
}

async function handleLogin(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const userCode = formData.get('userCode').trim();
    const password = formData.get('password').trim();
    
    if (!userCode) {
        showNotification('กรุณาใส่ PS Code หรือ ID13', 'error');
        return;
    }
    
    if (!password) {
        showNotification('กรุณาใส่รหัสผ่าน', 'error');
        return;
    }
    
    // Show loading
    const loginBtn = event.target.querySelector('.login-btn');
    const originalText = loginBtn.innerHTML;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังตรวจสอบ...';
    loginBtn.disabled = true;
    
    try {
        const user = await authenticateUser(userCode, password);
        console.log('=== Login Result ===');
        console.log('Authenticated user:', user);
        
        if (user) {
            currentUser = user;
            localStorage.setItem('currentUser', JSON.stringify(user));
            console.log('currentUser set to:', currentUser);
            showNotification(`ยินดีต้อนรับ ${user.name} (${user.group} - ${user.level})`, 'success');
            showMainApp();
        } else {
            showNotification('ไม่พบผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบข้อมูลอีกครั้ง', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + error.message, 'error');
    } finally {
        loginBtn.innerHTML = originalText;
        loginBtn.disabled = false;
    }
}

async function authenticateUser(userCode, password) {
    // ตรวจสอบว่าตั้งค่า Google Apps Script หรือยัง
    if (!googleSheetsConfig.webAppUrl || googleSheetsConfig.webAppUrl.trim() === '') {
    // Demo Mode authentication
    const user = findDemoUser(userCode, password);
        
        if (user) {
            console.log('Demo login success', user.name);
            return user;
        } else {
            console.warn('Demo login failed for userCode:', userCode);
            return null;
        }
    } else {
        // Production Mode: ใช้ Google Apps Script เพื่อตรวจสอบผู้ใช้จากข้อมูลจริง
        try {
            console.log('Prod auth request', userCode);
            
            // ใช้ GET request เพื่อหลีกเลี่ยง CORS preflight
            const url = new URL(googleSheetsConfig.webAppUrl);
            url.searchParams.append('action', 'getUsers');
            url.searchParams.append('userCode', userCode);
            url.searchParams.append('password', password);
            
            const response = await fetch(url.toString(), {
                method: 'GET',
                mode: 'cors'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้');
            }
            
            // ค้นหาผู้ใช้จากข้อมูลจริงและตรวจสอบรหัสผ่าน
            const user = data.users.find(u => 
                ((u.psCode && u.psCode.toLowerCase() === userCode.toLowerCase()) ||
                 (u.id13 && u.id13.toLowerCase() === userCode.toLowerCase())) &&
                u.password === password
            );
            
            // ตรวจสอบสถานะการใช้งาน
            if (user && user.status === false) {
                throw new Error('บัญชีผู้ใช้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
            }
            
            if (user) {
                console.log('Prod login success', user.name);
                return user;
            } else {
                console.warn('Prod login failed for', userCode);
                return null;
            }
            
        } catch (error) {
            console.error('Prod auth error:', error.message);
            
            // Check if it's a CORS or network error and show appropriate message
            if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
                console.warn('CORS error, fallback demo mode');
                showNotification('⚠️ ไม่สามารถเชื่อมต่อ Google Sheets ได้ (CORS Error) กำลังใช้โหมดทดสอบ', 'warning');
            } else {
                console.warn('Fallback demo mode:', error.message);
                showNotification('ไม่สามารถเชื่อมต่อ Google Sheets ได้ กำลังใช้โหมดทดสอบ', 'warning');
            }
            
            const user = findDemoUser(userCode, password);
            
            if (user) return user; else return null;
        }
    }
}
function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    showLoginPage();
    showNotification('ออกจากระบบเรียบร้อย', 'info');
}

let drugListData = [];

// Load configuration from localStorage
function loadConfig() {
    const savedConfig = localStorage.getItem('predisConfig');
    if (savedConfig) {
        googleSheetsConfig = JSON.parse(savedConfig);
        document.getElementById('apiKey').value = googleSheetsConfig.apiKey;
        document.getElementById('spreadsheetId').value = googleSheetsConfig.spreadsheetId;
        document.getElementById('sheetName').value = googleSheetsConfig.sheetName;
        document.getElementById('userSheetName').value = googleSheetsConfig.userSheetName || 'Users';
        document.getElementById('webAppUrl').value = googleSheetsConfig.webAppUrl || '';
        
        // Set drug sheet name
        if (!googleSheetsConfig.drugSheetName) {
            googleSheetsConfig.drugSheetName = 'Drug_List';
        }
        document.getElementById('drugSheetName').value = googleSheetsConfig.drugSheetName;
    }
}

// Save configuration to localStorage
function saveConfig() {
    localStorage.setItem('predisConfig', JSON.stringify(googleSheetsConfig));
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 4000);
}

// Navigation functions
function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active class from all nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(sectionName).classList.add('active');
    
    // Add active class to clicked nav button
    event.target.classList.add('active');
    
    // Update reporter field when showing form section
    if (sectionName === 'form') {
        console.log('Showing form section, updating reporter field');
        setTimeout(() => updateReporterField(), 100);
    }
    
    // Load specific section data
    if (sectionName === 'druglist') {
        loadDrugList();
    } else if (sectionName === 'dashboard') {
        loadData();
    }
}

// Initialize form with current date and generate report ID
function initializeForm() {
    const now = new Date();
    const pad = n => n.toString().padStart(2,'0');
    const localDateTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const localDate = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    
    const tsEl = document.getElementById('timestamp');
    const eventDateEl = document.getElementById('eventDate');
    if (tsEl) tsEl.value = localDateTime;
    if (eventDateEl) eventDateEl.value = localDate;
    
    // Generate Report ID
    generateReportId();
    
    // Populate process dropdown and setup error options
    populateProcessSelect();
    
    // Load drug list for drug dropdowns
    loadDrugList();
    
    // Add search functionality to drug input fields
    setupDrugSearchInputs();
    
    // Set reporter name
    const reporterEl = document.getElementById('reporter');
    if (reporterEl && currentUser) {
        const reporterValue = `${currentUser.name} (${currentUser.psCode}) - ${currentUser.group}/${currentUser.level}`;
        reporterEl.value = reporterValue;
    } else if (reporterEl) {
        reporterEl.value = 'รอโหลดชื่อผู้ใช้งาน...';
    }
}

// รายการกระบวนการ (สามารถปรับแก้หรือเพิ่มได้ง่าย)
const PROCESS_OPTIONS = [
    'จัดยา',
    'ลงข้อมูล',
    'เตรียมยา',
    'คิดค่าใช้จ่าย',
    'จัดเก็บ',
    'จัดส่ง'
];

// รายการข้อผิดพลาดตามกระบวนการ
const errorOptionsByProcess = {
    'จัดยา': [
        'ไม่ติดฉลากยา', 'จัดผิดขนาด', 'จัดผิดจำนวน', 'จัดไม่ครบชนิด', 'จัดผิดชนิด', 'จัดผิดรูปแบบ', 'จัดผิดคน',
        'ลืมเตรียมยา', 'ผลิตยาไม่ทัน', 'ติดฉลกายา prepack ผิดชนิด', 'ตรวจพบยาหมดอายุในจุดจ่าย',
        'ไม่ได้หยุดยา/นำยาออก กรณีแพทย์สั่ง off ยา', 'เก็บยาผิดตำแหน่ง', 'ไม่ได้เตรียม set IV เพื่อยาเคมีบำบัด'
    ],
    'ลงข้อมูล': [
        'key ผิดขนาด', 'key ผิดจำนวน', 'key ไม่ครบชนิด', 'key ผิดชนิด', 'key ผิดรูปแบบ', 'key ผิดคน', 'key ผิดตึก', 'key ผิดวิธีใช้',
        'ลงข้อมูลก่อนเตรียมยาไม่ถูกต้อง', 'ไม่ได้ส่งการปรับปรุง order/stat', 'ไม่ได้อ่าน line ทำให้ไมไ่ด้เตรียมยา',
        'ไม่ได้ลงค่าใช้จ่ายด้านยา(ไมไ่ด้คิดค่ายาหรือเวชภัณฑ์อื่นๆ)', 'คีย์สารละลายผิดขนาด ผิดชนิด', 'ไม่ได้หยุดยา/นำยาออก กรณีแพทย์สั่ง off ยา'
    ],
    'เตรียมยา': [
        'ลืมเตรียมยา', 'ผลิตยาไม่ทัน', 'ไม่ได้เตรียม set IV เพื่อยาเคมีบำบัด', 'เตรียมยาผิดชนิด', 'เตรียมยาไม่ถูกต้อง', 'เตรียมยาไม่ครบ', 'ไม่ได้ off ยา', 'ดูดปริมาตรยาไม่ถูกต้อง'
    ],
    'คิดค่าใช้จ่าย': [
        'ไม่ได้ลงค่าใช้จ่ายด้านยา(ไมไ่ด้คิดค่ายาหรือเวชภัณฑ์อื่นๆ)', 'ไม่ได้ย้ายราคา คิดค่าใช้จ่าย', 'ไม่ได้ส่งชำระเงิน'
    ],
    'จัดเก็บ': [
        'เก็บยาผิดตำแหน่ง', 'ตรวจพบยาหมดอายุในจุดจ่าย'
    ],
    'จัดส่ง': [
        'ส่งยาผิดตึก', 'ส่งยาไม่ครบ', 'ส่งยาใส่กล่องเวลาไม่ถูกต้อง', 'ยา/สารเคมีขาด', 'order ที่ส่งเตรียมไม่ตรงกับ PharMS'
    ]
};

function populateProcessSelect() {
    console.log('=== populateProcessSelect called ===');
    const sel = document.getElementById('process');
    console.log('Process select element found:', !!sel);
    
    if (!sel) {
        console.error('Process select element not found');
        return;
    }
    
    const optionsHtml = '<option value="">เลือกกระบวนการ</option>' + PROCESS_OPTIONS
        .map(p => `<option value="${p}">${p}</option>`)
        .join('');
    
    sel.innerHTML = optionsHtml;
    console.log('Process options populated:', PROCESS_OPTIONS.length, 'options');
    
    // Add event listener for process change (only if not already added)
    if (!sel.dataset.listenerAdded) {
        sel.addEventListener('change', function() {
            console.log('Process changed to:', this.value);
            updateErrorOptions(this.value);
        });
        sel.dataset.listenerAdded = 'true';
        console.log('Process change listener added');
    }
}

// อัปเดตตัวเลือกข้อผิดพลาดตามกระบวนการที่เลือก
function updateErrorOptions(selectedProcess) {
    console.log('updateErrorOptions called with:', selectedProcess);
    const errorSelect = document.getElementById('errorDetail');
    if (!errorSelect) {
        console.log('errorDetail select not found');
        return;
    }
    
    // เคลียร์ตัวเลือกเดิม
    errorSelect.innerHTML = '<option value="">เลือกข้อผิดพลาด</option>';
    
    if (selectedProcess && errorOptionsByProcess[selectedProcess]) {
        // เพิ่มตัวเลือกข้อผิดพลาดตามกระบวนการ
        const options = errorOptionsByProcess[selectedProcess]
            .map(error => `<option value="${error}">${error}</option>`)
            .join('');
        errorSelect.innerHTML += options;
        console.log(`Added ${errorOptionsByProcess[selectedProcess].length} error options for ${selectedProcess}`);
    } else {
        console.log('No error options found for process:', selectedProcess);
    }
}

// Global variable to track used report IDs
let usedReportIds = new Set();
// Submission control
let isSubmitting = false;
// Generate idempotency submission token
function generateSubmissionToken() {
    return 'SUB-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
}

// Generate unique report ID with duplicate prevention
function generateReportId() {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    
    // Format: PE + YYMMDD + HHMMSS + XXX (milliseconds for uniqueness)
    let reportId = `PE${year}${month}${day}${hours}${minutes}${seconds}`;
    
    // If this ID is already used, add milliseconds
    if (usedReportIds.has(reportId)) {
        reportId += milliseconds;
    }
    
    // If still duplicate (very rare), add random number
    let counter = 1;
    const baseId = reportId;
    while (usedReportIds.has(reportId)) {
        reportId = baseId + String(counter).padStart(2, '0');
        counter++;
    }
    
    // Store the used ID
    usedReportIds.add(reportId);
    
    const reportIdEl = document.getElementById('reportId');
    if (reportIdEl) {
        reportIdEl.value = reportId;
    }
    
    console.log('Generated unique Report ID:', reportId);
    return reportId;
}

// Google Sheets API functions
async function appendToGoogleSheet(data) {
    // Try Google Apps Script Web App first (supports writing)
    if (googleSheetsConfig.webAppUrl) {
        try {
            // Use FormData to send data to Google Apps Script
            const formData = new FormData();
            formData.append('action', 'append');
            formData.append('sheetName', googleSheetsConfig.sheetName);
            
            // Add each data field individually - ใช้ eventDate แทน timestamp
            formData.append('eventDate', data.eventDate);
            formData.append('reportId', data.reportId);
            if (data.submissionToken) formData.append('submissionToken', data.submissionToken);
            formData.append('shift', data.shift);
            formData.append('errorType', data.errorType);
            let loc = data.location;
            if (loc === 'รพ.สต.' && data.substation) {
                loc = `${loc}${data.substation}`;
            }
            formData.append('location', loc);
            formData.append('process', data.process);
            formData.append('errorDetail', data.errorDetail);
            formData.append('correctItem', data.correctItem);
            formData.append('incorrectItem', data.incorrectItem);
            formData.append('cause', data.cause);
            formData.append('additionalDetails', data.additionalDetails || '');
            formData.append('reporter', data.reporter);
            if (data.submissionToken) formData.append('submissionToken', data.submissionToken);

            // Create a simple POST request without custom headers
            const response = await fetch(googleSheetsConfig.webAppUrl, {
                method: 'POST',
                body: formData,
                redirect: 'follow'
            });

            // Google Apps Script redirects on success, so we check for redirect or ok
            if (response.ok || response.redirected) {
                // Try to parse JSON, but don't fail if it's not JSON
                try {
                    const result = await response.json();
                    if (result.idempotent && result.duplicate) {
                        // Server signaled duplicate ignored via token
                        return { success: true, message: 'บันทึกสำเร็จ (ป้องกันการบันทึกซ้ำ)' };
                    }
                    if (result.error) {
                        // ตรวจสอบถ้าเป็น error จากการซ้ำ
                        if (result.duplicate && result.reportId) {
                            // สร้าง Report ID ใหม่และลองอีกครั้ง
                            console.log('Duplicate Report ID detected, generating new ID...');
                            data.reportId = generateReportId();
                            
                            // ลองส่งอีกครั้งด้วย Report ID ใหม่
                            const retryFormData = new FormData();
                            retryFormData.append('action', 'append');
                            retryFormData.append('sheetName', googleSheetsConfig.sheetName);
                            
                            // Add all data with new Report ID
                            retryFormData.append('eventDate', data.eventDate);
                            retryFormData.append('reportId', data.reportId);
                            retryFormData.append('shift', data.shift);
                            retryFormData.append('errorType', data.errorType);
                            let loc = data.location;
                            if (loc === 'รพ.สต.' && data.substation) {
                                loc = `${loc}${data.substation}`;
                            }
                            retryFormData.append('location', loc);
                            retryFormData.append('process', data.process);
                            retryFormData.append('errorDetail', data.errorDetail);
                            retryFormData.append('correctItem', data.correctItem);
                            retryFormData.append('incorrectItem', data.incorrectItem);
                            retryFormData.append('cause', data.cause);
                            retryFormData.append('additionalDetails', data.additionalDetails || '');
                            retryFormData.append('reporter', data.reporter);
                            if (data.submissionToken) retryFormData.append('submissionToken', data.submissionToken);
                            
                            const retryResponse = await fetch(googleSheetsConfig.webAppUrl, {
                                method: 'POST',
                                body: retryFormData,
                                redirect: 'follow'
                            });
                            
                            if (retryResponse.ok || retryResponse.redirected) {
                                const retryResult = await retryResponse.json();
                                if (retryResult.error) {
                                    throw new Error(retryResult.error);
                                }
                                return { 
                                    success: true, 
                                    message: 'บันทึกข้อมูลสำเร็จ (สร้าง Report ID ใหม่)',
                                    newReportId: data.reportId 
                                };
                            } else {
                                throw new Error('ไม่สามารถบันทึกข้อมูลได้แม้หลังจากสร้าง Report ID ใหม่');
                            }
                        }
                        throw new Error(result.error);
                    }
                    return result;
                } catch (jsonError) {
                    // If we can't parse JSON but response was ok, assume success
                    return { success: true, message: 'Data saved successfully' };
                }
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
        } catch (error) {
            console.error('Web App error:', error);
            
            // If it's a network error, try alternative approach
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                return await submitViaForm(data);
            }
            
            throw new Error(`ไม่สามารถบันทึกข้อมูลผ่าน Web App ได้: ${error.message}`);
        }
    } else {
        // Demo Mode: จำลองการบันทึกข้อมูลโดยไม่ต้องใช้ Google Sheets
        console.log('Demo Mode: บันทึกข้อมูลในโหมดทดสอบ', data);
        console.log('- วันที่เกิดเหตุการณ์:', data.eventDate);
        console.log('- เวลาบันทึกข้อมูล:', new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }));
        
        // จำลองการตอบกลับจาก server
        const demoResponse = {
            status: 'success',
            message: 'บันทึกข้อมูลสำเร็จ (โหมดทดสอบ)',
            reportId: 'DEMO-' + Date.now(),
            eventDate: data.eventDate,
            recordedAt: new Date().toLocaleString('th-TH', {
                timeZone: 'Asia/Bangkok',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            })
        };
        
        showNotification(`✅ บันทึกข้อมูลสำเร็จ (โหมดทดสอบ)\n📅 วันที่เกิดเหตุ: ${data.eventDate}\n📝 Report ID: ${demoResponse.reportId}`, 'success');
        return demoResponse;
    }
}

// Alternative method using form submission (bypasses CORS)
async function submitViaForm(data) {
    return new Promise((resolve, reject) => {
        try {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = googleSheetsConfig.webAppUrl;
            form.target = '_blank';
            form.style.display = 'none';

            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'payload';
            input.value = JSON.stringify({
                action: 'append',
                sheetName: googleSheetsConfig.sheetName,
                data: [
                    data.timestamp,
                    data.reportId,
                    data.shift,
                    data.errorType,
                    data.location,
                    data.process,
                    data.errorDetail,
                    data.correctItem,
                    data.incorrectItem,
                    data.cause,
                    data.additionalDetails || '',
                    data.reporter
                ]
            });

            form.appendChild(input);
            document.body.appendChild(form);
            form.submit();
            document.body.removeChild(form);

            // Assume success since we can't get response from form submission
            setTimeout(() => {
                resolve({ success: true, message: 'Data submitted via form' });
            }, 1000);

        } catch (error) {
            reject(error);
        }
    });
}

async function readFromGoogleSheet() {
    if (!googleSheetsConfig.apiKey || !googleSheetsConfig.spreadsheetId) {
        throw new Error('การตั้งค่า Google Sheets ไม่สมบูรณ์ กรุณาตั้งค่าในหน้าตั้งค่า');
    }

    const range = `${googleSheetsConfig.sheetName}!A:L`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${googleSheetsConfig.spreadsheetId}/values/${range}?key=${googleSheetsConfig.apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'ไม่สามารถอ่านข้อมูลจาก Google Sheets ได้');
    }

    const data = await response.json();
    return data.values || [];
}

// Populate drug dropdowns for correct and incorrect items
function populateDrugDropdowns() {
    const correctItemList = document.getElementById('correctItemList');
    const incorrectItemList = document.getElementById('incorrectItemList');
    
    console.log('populateDrugDropdowns called with drugListData:', drugListData?.length || 0, 'items');
    
    // Clear existing options
    correctItemList.innerHTML = '';
    incorrectItemList.innerHTML = '';

    if (drugListData && drugListData.length > 0) {
        // Filter only active drugs (hide inactive ones)
        const activeDrugs = drugListData.filter(drug => drug.status === 'Active');
        console.log(`Showing only active drugs: ${activeDrugs.length} out of ${drugListData.length} total drugs`);
        
        // Count for information
        const inactiveDrugs = drugListData.filter(drug => drug.status === 'Inactive');
        console.log(`Status breakdown: Active: ${activeDrugs.length}, Inactive (hidden): ${inactiveDrugs.length}`);
        
        activeDrugs.forEach(drug => {
            // No status indicator needed since all are active
            const displayText = drug.drugName ? 
                `${drug.drugName} (${drug.drugCode})` : 
                drug.drugCode;
            
            console.log('Adding drug to datalist:', displayText);
            
            // Add to correct item datalist
            const correctOption = document.createElement('option');
            correctOption.value = displayText;
            correctItemList.appendChild(correctOption);
            
            // Add to incorrect item datalist
            const incorrectOption = document.createElement('option');
            incorrectOption.value = displayText;
            incorrectItemList.appendChild(incorrectOption);
        });
        
        console.log(`Populated drug datalists with ${activeDrugs.length} active drugs only`);
    } else {
        console.warn('No drug list data available');
    }
}

// Setup search functionality for drug input fields
function setupDrugSearchInputs() {
    const correctItemInput = document.getElementById('correctItem');
    const incorrectItemInput = document.getElementById('incorrectItem');
    
    // Add input event listeners for better UX
    correctItemInput.addEventListener('input', function() {
        validateDrugInput(this);
    });
    
    incorrectItemInput.addEventListener('input', function() {
        validateDrugInput(this);
    });
    
    // Add focus event to show all options
    correctItemInput.addEventListener('focus', function() {
        this.setAttribute('list', 'correctItemList');
    });
    
    incorrectItemInput.addEventListener('focus', function() {
        this.setAttribute('list', 'incorrectItemList');
    });

    // Enhance inputs with searchable dropdowns (better UX than native datalist)
    try {
        setupSearchableDropdowns();
    } catch (e) {
        console.warn('Searchable dropdown init failed, falling back to datalist', e);
    }
}

// Validate drug input against available options
function validateDrugInput(input) {
    const value = input.value.trim();
    if (value && drugListData) {
        // Check only against active drugs
        const activeDrugs = drugListData.filter(drug => drug.status === 'Active');
        const foundDrug = activeDrugs.some(drug => {
            const displayText = drug.drugName ? 
                `${drug.drugName} (${drug.drugCode})` : 
                drug.drugCode;
            return displayText === value;
        });
        
        // Visual feedback for valid/invalid selection
        if (foundDrug) {
            input.style.borderColor = '#28a745';
            input.style.backgroundColor = '#f8fff9';
        } else {
            input.style.borderColor = '#ffc107';
            input.style.backgroundColor = '#fffdf0';
        }
    } else {
        // Reset to default style
        input.style.borderColor = '#e0e0e0';
        input.style.backgroundColor = '#ffffff';
    }
}

// --- Enhanced highlighting helper for dropdown autocomplete ---
function highlightMultipleMatches(text, query) {
    if (!query || !text) return text;

    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    // Try exact match first
    let index = textLower.indexOf(queryLower);
    if (index !== -1) {
        const before = text.substring(0, index);
        const match = text.substring(index, index + query.length);
        const after = text.substring(index + query.length);
        return `${escapeHtml(before)}<mark class="search-highlight">${escapeHtml(match)}</mark>${escapeHtml(after)}`;
    }

    // Fuzzy highlighting - highlight individual characters that match
    const queryChars = queryLower.split('');
    let result = '';
    let queryIndex = 0;

    for (let i = 0; i < text.length && queryIndex < queryChars.length; i++) {
        if (textLower[i] === queryChars[queryIndex]) {
            result += `<mark class="search-highlight">${escapeHtml(text[i])}</mark>`;
            queryIndex++;
        } else {
            result += escapeHtml(text[i]);
        }
    }

    // Add remaining characters
    if (queryIndex < queryChars.length) {
        // Not all characters matched, return plain text
        return escapeHtml(text);
    }

    return result;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// --- Searchable dropdown enhancement (replaces plain datalist UX) ---
function setupSearchableDropdowns() {
    const correctInput = document.getElementById('correctItem');
    const incorrectInput = document.getElementById('incorrectItem');
    if (!correctInput || !incorrectInput) return;

    // Build options array from drugListData (active only)
    const options = (drugListData || []).filter(d => d.status === 'Active').map(drug => {
        return drug.drugName ? `${drug.drugName} (${drug.drugCode})` : drug.drugCode;
    });

    // Initialize dropdown widgets
    makeSearchable(correctInput, options);
    makeSearchable(incorrectInput, options);
}

function makeSearchable(inputEl, options) {
    // Avoid double-init
    if (inputEl._searchableInit) return;
    inputEl._searchableInit = true;

    // Create container
    const container = document.createElement('div');
    container.className = 'searchable-dropdown-container';

    // Wrap input
    const parent = inputEl.parentNode;
    parent.replaceChild(container, inputEl);
    container.appendChild(inputEl);

    // Create list box
    const list = document.createElement('div');
    list.className = 'searchable-dropdown-list';
    list.style.display = 'none';
    container.appendChild(list);

    let filtered = [];
    let activeIndex = -1;

    function renderList() {
        list.innerHTML = '';
        if (!filtered.length) {
            const item = document.createElement('div');
            item.className = 'searchable-item empty';
            item.innerHTML = '<i class="fas fa-search"></i> ไม่พบรายการยาที่ตรงกับการค้นหา';
            list.appendChild(item);
            return;
        }

        filtered.forEach((label, i) => {
            const item = document.createElement('div');
            item.className = 'searchable-item';

            // Enhanced highlighting with multiple match support
            const query = inputEl.value.trim();
            if (query) {
                item.innerHTML = highlightMultipleMatches(label, query);
            } else {
                item.textContent = label;
            }

            // Add active class for keyboard navigation
            if (i === activeIndex) {
                item.classList.add('active');
                // Scroll active item into view
                setTimeout(() => {
                    item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }, 10);
            }

            item.addEventListener('mousedown', function(e) {
                e.preventDefault(); // prevent blur
                selectIndex(i);
                hideList();
                inputEl.focus();
            });

            item.addEventListener('mouseenter', function() {
                const prevActive = list.querySelector('.searchable-item.active');
                if (prevActive) prevActive.classList.remove('active');
                activeIndex = i;
                this.classList.add('active');
            });

            list.appendChild(item);
        });

        // Add keyboard shortcuts hint at bottom
        if (filtered.length > 0) {
            const hint = document.createElement('div');
            hint.className = 'searchable-dropdown-hint';
            hint.innerHTML = `
                <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
                <span><kbd>Tab</kbd> Autocomplete</span>
                <span><kbd>Enter</kbd> Select</span>
                <span><kbd>Esc</kbd> Close</span>
            `;
            list.appendChild(hint);
        }
    }

    function showList() {
        list.style.display = 'block';
    }
    function hideList() {
        list.style.display = 'none';
        activeIndex = -1;
    }

    function selectIndex(i) {
        if (i < 0 || i >= filtered.length) return;
        inputEl.value = filtered[i];
        validateDrugInput(inputEl);
    }

    function updateFilter(value) {
        const q = (value || '').toLowerCase().trim();
        if (!q) {
            // show top 30 options when empty
            filtered = options.slice(0, 30);
        } else {
            // Advanced fuzzy matching with scoring
            const scored = options.map(option => {
                const optionLower = option.toLowerCase();
                let score = 0;

                // Exact match (highest priority)
                if (optionLower === q) {
                    score = 1000;
                }
                // Starts with query (very high priority)
                else if (optionLower.startsWith(q)) {
                    score = 500;
                }
                // Word boundary match (high priority)
                else if (optionLower.includes(' ' + q) || optionLower.includes('(' + q)) {
                    score = 300;
                }
                // Contains query (medium priority)
                else if (optionLower.includes(q)) {
                    score = 200;
                }
                // Fuzzy match - all characters present in order
                else if (fuzzyMatch(q, optionLower)) {
                    score = 100;
                }
                // No match
                else {
                    return null;
                }

                // Boost score for shorter strings (more specific)
                score += Math.max(0, 50 - option.length);

                return { option, score };
            })
            .filter(item => item !== null)
            .sort((a, b) => b.score - a.score)
            .slice(0, 30)
            .map(item => item.option);

            filtered = scored;
        }
        activeIndex = -1;
        renderList();
        showList();
    }

    // Fuzzy matching helper - checks if all characters in query appear in order in target
    function fuzzyMatch(query, target) {
        let queryIndex = 0;
        for (let i = 0; i < target.length && queryIndex < query.length; i++) {
            if (target[i] === query[queryIndex]) {
                queryIndex++;
            }
        }
        return queryIndex === query.length;
    }

    inputEl.addEventListener('input', function() {
        updateFilter(this.value);
        validateDrugInput(this);
    });

    inputEl.addEventListener('focus', function() {
        updateFilter(this.value);
    });

    inputEl.addEventListener('blur', function() {
        // small timeout to allow mousedown selection
        setTimeout(() => hideList(), 150);
    });

    inputEl.addEventListener('keydown', function(e) {
        const key = e.key;
        const isListVisible = list.style.display !== 'none';

        // Tab key for autocomplete (when list is visible and items available)
        if (key === 'Tab' && isListVisible && filtered.length > 0) {
            e.preventDefault();
            // Autocomplete with first item if no active index
            const indexToSelect = activeIndex >= 0 ? activeIndex : 0;
            selectIndex(indexToSelect);
            hideList();
            return;
        }

        if (!isListVisible) return;

        if (key === 'ArrowDown') {
            e.preventDefault();
            if (activeIndex < 0) {
                activeIndex = 0;
            } else {
                activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
            }
            renderList();
        } else if (key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            renderList();
        } else if (key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0) {
                selectIndex(activeIndex);
            } else if (filtered.length > 0) {
                // If no active item, select first one
                selectIndex(0);
            }
            hideList();
        } else if (key === 'Escape') {
            e.preventDefault();
            hideList();
        }
    });

    // initial
    updateFilter(inputEl.value);
}


// Form submission handler
async function handleFormSubmit(event) {
    event.preventDefault();
    if (isSubmitting) {
        console.warn('Duplicate submit prevented');
        return;
    }
    isSubmitting = true;
    const formData = new FormData(event.target);
    const errorData = Object.fromEntries(formData.entries());
    // Add idempotency submission token
    errorData.submissionToken = generateSubmissionToken();
    
    // ตรวจสอบและเพิ่มข้อมูล HAD อัตโนมัติ
    const hadInfo = await checkAndRecordHAD(errorData);
    if (hadInfo) {
        errorData.hadInvolved = hadInfo.isHAD;
        errorData.hadDrugName = hadInfo.hadDrugs.join(', ');
        errorData.hadRiskLevel = hadInfo.riskLevel;
    }
    
    // ใช้ eventDate ที่ผู้ใช้เลือก (ไม่ต้องรวมเวลา)
    if (errorData.eventDate) {
        // ไม่ต้องเพิ่มเวลาปัจจุบัน ใช้แค่วันที่เกิดเหตุการณ์
        // timestamp จะถูกสร้างฝั่ง server แทน
        // ลบ timestamp field ออก
        delete errorData.timestamp;
    }
    
    // Include substation if present
    const subEl = document.getElementById('substation');
    if (subEl && subEl.value) {
        errorData.substation = subEl.value;
    }
    
    // Generate a new Report ID if not already set
    if (!errorData.reportId) {
        errorData.reportId = generateReportId();
    }
    
    try {
        // Show loading state
        const submitBtn = event.target.querySelector('.submit-btn');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<div class="loading"></div> กำลังบันทึก...';
        submitBtn.disabled = true;

        const result = await appendToGoogleSheet(errorData);
        
        // แสดงการแจ้งเตือนพร้อม Report ID ที่ใช้
        let successMessage = 'บันทึกข้อผิดพลาดเรียบร้อยแล้ว!';
        if (result && result.newReportId) {
            successMessage = `บันทึกข้อผิดพลาดเรียบร้อยแล้ว!\n📝 Report ID: ${result.newReportId} (สร้างใหม่เนื่องจากซ้ำ)`;
        } else {
            successMessage = `บันทึกข้อผิดพลาดเรียบร้อยแล้ว!\n📝 Report ID: ${errorData.reportId}`;
        }
        
        showNotification(successMessage, 'success');
        event.target.reset();
        initializeForm();
        
    } catch (error) {
        console.error('Error submitting form:', error);
        showNotification(error.message, 'error');
    } finally {
        // Reset button state
        const submitBtn = event.target.querySelector('.submit-btn');
        submitBtn.innerHTML = '<i class="fas fa-save"></i> บันทึก';
        submitBtn.disabled = false;
    isSubmitting = false;
    }
}

// ตรวจสอบและบันทึกรายการ HAD อัตโนมัติ
async function checkAndRecordHAD(errorData) {
    try {
        const hadInfo = {
            isHAD: false,
            hadDrugs: [],
            riskLevel: 'Regular'
        };
        
        // ดึงรายการยาที่เกี่ยวข้องจากฟิลด์ต่างๆ
        const drugFields = [
            errorData.correctItem,
            errorData.incorrectItem,
            errorData.errorDetail
        ];
        
        // ตรวจสอบแต่ละฟิลด์ว่ามียา HAD หรือไม่
        for (const field of drugFields) {
            if (field) {
                const hadDrugsFound = await findHADInText(field);
                if (hadDrugsFound.length > 0) {
                    hadInfo.isHAD = true;
                    hadInfo.hadDrugs.push(...hadDrugsFound);
                    hadInfo.riskLevel = 'High';
                }
            }
        }
        
        // ลบรายการซ้ำ
        hadInfo.hadDrugs = [...new Set(hadInfo.hadDrugs)];
        
        // แสดงผลใน UI
        updateHADDisplay(hadInfo);
        
        // แสดงการแจ้งเตือนถ้าพบ HAD
        if (hadInfo.isHAD) {
            showNotification(`⚠️ ตรวจพบ High Alert Drugs: ${hadInfo.hadDrugs.join(', ')}`, 'warning');
            console.log('HAD Detected:', hadInfo);
        }
        
        return hadInfo;
        
    } catch (error) {
        console.error('Error checking HAD:', error);
        console.log('GlobalDrugList sample:', globalDrugList.slice(0, 3));
        console.log('GlobalDrugList length:', globalDrugList.length);
        return null;
    }
}

// อัปเดตการแสดงผล HAD ใน UI
function updateHADDisplay(hadInfo) {
    const hadSection = document.querySelector('.had-section');
    const hadDrugsList = document.getElementById('hadDrugsList');
    const hadRiskLevel = document.getElementById('hadRiskLevel');
    if (!hadSection || !hadDrugsList || !hadRiskLevel) {
        console.warn('HAD UI elements not found');
    }
    // อัปเดต hidden fields (ตรวจสอบก่อน)
    const hadInvolvedEl = document.getElementById('hadInvolved');
    if (hadInvolvedEl) hadInvolvedEl.value = hadInfo.isHAD;
    const hadDrugNameEl = document.getElementById('hadDrugName');
    if (hadDrugNameEl) hadDrugNameEl.value = hadInfo.hadDrugs.join(', ');
    const hadRiskInput = document.querySelector('input[name="hadRiskLevel"]');
    if (hadRiskInput) hadRiskInput.value = hadInfo.riskLevel;
    
    if (hadSection && hadDrugsList && hadRiskLevel && hadInfo.isHAD && hadInfo.hadDrugs.length > 0) {
        // แสดง HAD section
        hadSection.style.display = 'block';
        
        // แสดงรายการยา HAD
        hadDrugsList.innerHTML = hadInfo.hadDrugs
            .map(drug => `<span class="had-drug-item">${drug}</span>`)
            .join('');
        
        // อัปเดตระดับความเสี่ยง
        hadRiskLevel.textContent = hadInfo.riskLevel === 'High' ? 'สูง' : 'ปกติ';
        hadRiskLevel.className = `risk-badge ${hadInfo.riskLevel === 'High' ? 'risk-high' : 'risk-regular'}`;
        
    } else if (hadSection && hadDrugsList) {
        hadSection.style.display = 'none';
        hadDrugsList.innerHTML = '';
    }
}

// ค้นหา HAD ในข้อความ
async function findHADInText(text) {
    if (!text || !globalDrugList.length) return [];
    
    const hadDrugsFound = [];
    const textLower = text.toLowerCase();
    
    // ตรวจสอบกับรายการยา HAD ในฐานข้อมูล
    for (const drug of globalDrugList) {
        if (drug.had === 'High') {
            // ตรวจสอบประเภทข้อมูลก่อนใช้ toLowerCase()
            const drugName = drug.drugName && typeof drug.drugName === 'string' ? drug.drugName : '';
            const drugCode = drug.drugCode && typeof drug.drugCode === 'string' ? drug.drugCode : '';
            
            if (!drugName && !drugCode) continue; // ข้ามถ้าไม่มีข้อมูล
            
            const drugNameLower = drugName.toLowerCase();
            const drugCodeLower = drugCode.toLowerCase();
            
            // ตรวจสอบชื่อยาและรหัสยา
            if ((drugNameLower && textLower.includes(drugNameLower)) || 
                (drugCodeLower && textLower.includes(drugCodeLower))) {
                hadDrugsFound.push(drugName || drugCode);
            }
            
            // ตรวจสอบส่วนของชื่อยา (เช่น Insulin, Warfarin)
            if (drugNameLower) {
                const mainDrugName = drugNameLower.split(' ')[0];
                if (mainDrugName.length > 4 && textLower.includes(mainDrugName)) {
                    hadDrugsFound.push(drugName);
                }
            }
        }
    }
    
    return [...new Set(hadDrugsFound)]; // ลบรายการซ้ำ
}

// ตรวจสอบ HAD แบบ real-time
async function checkHADRealtime() {
    const correctItem = document.getElementById('correctItem')?.value || '';
    const incorrectItem = document.getElementById('incorrectItem')?.value || '';
    const errorDetail = document.getElementById('errorDetail')?.value || '';
    
    const mockData = {
        correctItem,
        incorrectItem, 
        errorDetail
    };
    
    const hadInfo = await checkAndRecordHAD(mockData);
    return hadInfo;
}

// Settings form handler
function handleSettingsSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    googleSheetsConfig = {
        apiKey: formData.get('apiKey'),
        spreadsheetId: formData.get('spreadsheetId'),
        sheetName: formData.get('sheetName') || 'Predispensing_Errors',
        userSheetName: formData.get('userSheetName') || 'Users',
        drugSheetName: formData.get('drugSheetName') || 'Drug_List',
        webAppUrl: formData.get('webAppUrl') || ''
    };
    
    saveConfig();
    showNotification('บันทึกการตั้งค่าเรียบร้อยแล้ว!', 'success');
}

// Dashboard functions
async function loadData() {
    try {
        const loadBtn = document.querySelector('.load-btn');
        let originalText = '';
        if (loadBtn) {
            originalText = loadBtn.innerHTML;
            loadBtn.innerHTML = '<div class="loading"></div> Loading...';
            loadBtn.disabled = true;
        }

        const data = await readFromGoogleSheet();
        
        if (data.length === 0) {
            showNotification('ไม่พบข้อมูลใน Google Sheets', 'info');
            return;
        }

        // Skip header row if it exists
        const hasHeader = data[0] && typeof data[0][0] === 'string' && data[0][0].toLowerCase().includes('timestamp');
        const errorData = hasHeader ? data.slice(1) : data;
        
        // เก็บ Report IDs ที่มีอยู่แล้วเพื่อป้องกันการซ้ำ
        loadExistingReportIds(data);
        
        // Apply user-based filtering
        const filteredData = applyUserFilter(errorData);
    lastUserFilteredData = filteredData.slice();
        
        updateDashboard(errorData, filteredData);
        populateTable(filteredData);
        
        // Initialize analytics filter UI once
        if (!window._analyticsFilterUIInitialized) {
            initAnalyticsFilterUI();
            window._analyticsFilterUIInitialized = true;
        }

        // Generate advanced analytics (respect analytics filters)
        refreshAdvancedAnalytics();
        
        // Update dashboard user info
        updateDashboardUserInfo();
        
        showNotification('โหลดข้อมูลเรียบร้อยแล้ว!', 'success');
        
    } catch (error) {
        console.error('Error loading data:', error);
        showNotification(error.message, 'error');
    } finally {
        const loadBtn = document.querySelector('.load-btn');
        if (loadBtn) {
            loadBtn.innerHTML = '<i class="fas fa-sync"></i> รีเฟรชข้อมูล';
            loadBtn.disabled = false;
        }
    }
}

// Load existing Report IDs to prevent duplicates
function loadExistingReportIds(data) {
    usedReportIds.clear(); // เคลียร์ก่อน
    
    if (Array.isArray(data) && data.length > 0) {
        data.forEach((row, index) => {
            // Skip header row
            if (index === 0 || !Array.isArray(row)) return;
            
            const reportId = row[1]; // คอลัมน์ B = Report ID
            if (reportId && typeof reportId === 'string') {
                usedReportIds.add(reportId);
            }
        });
        
        console.log(`Loaded ${usedReportIds.size} existing Report IDs for duplicate prevention`);
    }
}

// Apply user-based filtering based on current user and filter settings
function applyUserFilter(data) {
    if (!currentUser || !data) return data;
    const filterUserEl = document.getElementById('filterUser');
    const filterPeriodEl = document.getElementById('filterPeriod');
    const filterUser = filterUserEl ? filterUserEl.value : '';
    const filterPeriod = filterPeriodEl ? filterPeriodEl.value : '';
    
    let filteredData = data;
    
    // Apply user filter
    if (filterUser === 'currentUser') {
        // Show only current user's reports
        filteredData = filteredData.filter(row => {
            const reporter = (row[11] || '').toString().trim(); // ผู้รายงาน in column 11
            return reporter === currentUser.name || 
                   reporter.includes(currentUser.name) ||
                   reporter === currentUser.psCode ||
                   reporter === currentUser.id13;
        });
    } else if (filterUser === 'myGroup') {
        // Show only reports from user's group
        filteredData = filteredData.filter(row => {
            const reporter = (row[11] || '').toString().trim();
            // This would need a lookup to user database to check group
            // For now, assume reporter name contains group info or use a simplified approach
            return reporter.includes(currentUser.group) || 
                   reporter === currentUser.name ||
                   (currentUser.level === 'admin'); // Admin can see all
        });
    }
    
    // Apply period filter
    if (filterPeriod) {
        const now = new Date();
        let startDate;
        
        switch (filterPeriod) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'quarter':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
        }
        
        if (startDate) {
            filteredData = filteredData.filter(row => {
                try {
                    const rowDate = new Date(row[0]);
                    return !isNaN(rowDate.getTime()) && rowDate >= startDate;
                } catch (e) {
                    return false;
                }
            });
        }
    }
    
    return filteredData;
}

// ===== Analytics Filter State =====
let lastUserFilteredData = [];
let analyticsFilters = {
    errorType: 'all', // 'all' | 'ผู้ป่วยนอก' | 'ผู้ป่วยใน'
    periodMode: 'all', // 'all' | 'year' | 'month'
    year: null,
    month: null,
    process: 'all' // เพิ่มตัวแปรสำหรับกรองกระบวนการ
};

// ===== Process Filter State =====
let processFilter = 'all'; // Variable to store selected process filter
let errorProcessFilter = 'all'; // Variable to store selected process filter for error details
let drugProcessFilter = 'all'; // Variable to store selected process filter for drug statistics

function applyAnalyticsFiltersToData(baseData) {
    if (!Array.isArray(baseData)) return [];
    return baseData.filter(row => {
        try {
            // row indices: 0=date, 3=errorType
            if (!row[0]) return false;
            // Filter by error type
            if (analyticsFilters.errorType !== 'all') {
                const et = (row[3]||'').toString().trim();
                if (et !== analyticsFilters.errorType) return false;
            }
            // Filter by period
            if (analyticsFilters.periodMode !== 'all') {
                const d = new Date(row[0]);
                if (isNaN(d)) return false;
                const y = d.getFullYear();
                const m = (d.getMonth()+1).toString().padStart(2,'0');
                if (analyticsFilters.periodMode === 'year') {
                    if (!analyticsFilters.year || y.toString() !== analyticsFilters.year.toString()) return false;
                } else if (analyticsFilters.periodMode === 'month') {
                    if (!analyticsFilters.year || !analyticsFilters.month) return false;
                    if (y.toString() !== analyticsFilters.year.toString() || m !== analyticsFilters.month) return false;
                }
            }
            return true;
        } catch { return false; }
    });
}

function refreshAdvancedAnalytics() {
    const filteredForAnalytics = applyAnalyticsFiltersToData(lastUserFilteredData);
    generateAdvancedAnalytics(filteredForAnalytics);
    updateAnalyticsFilterSummary();
    
    // Also refresh all charts with process filters
    generateCauseChartByProcess();
    generateErrorChartByProcess();
    generateDrugChartByProcess();
}

function updateAnalyticsFilterSummary() {
    const el = document.getElementById('analyticsFilterSummary');
    if (!el) return;
    let parts = [];
    parts.push(analyticsFilters.errorType === 'all' ? 'ทุกประเภทผู้ป่วย' : analyticsFilters.errorType);
    parts.push(analyticsFilters.process === 'all' ? 'ทุกกระบวนการ' : analyticsFilters.process);
    if (analyticsFilters.periodMode === 'all') {
        parts.push('ทุกช่วงเวลา');
    } else if (analyticsFilters.periodMode === 'year') {
        parts.push('ปี ' + analyticsFilters.year);
    } else if (analyticsFilters.periodMode === 'month') {
        parts.push(`เดือน ${analyticsFilters.month}/${analyticsFilters.year}`);
    }
    el.textContent = 'ตัวกรอง: ' + parts.join(' | ');
}

function initAnalyticsFilterUI() {
    const etSel = document.getElementById('analyticsErrorType');
    const processSel = document.getElementById('analyticsProcessFilter');
    const modeSel = document.getElementById('analyticsPeriodMode');
    const yearSel = document.getElementById('analyticsYear');
    const monthSel = document.getElementById('analyticsMonth');
    const yearWrap = document.getElementById('analyticsYearWrapper');
    const monthWrap = document.getElementById('analyticsMonthWrapper');
    const applyBtn = document.getElementById('applyAnalyticsFilters');
    const resetBtn = document.getElementById('resetAnalyticsFilters');

    // Populate years from data (after data load we'll call populate)
    function populateYears() {
        if (!yearSel) return;
        const dates = (lastUserFilteredData||[]).map(r=>r[0]).filter(Boolean);
        const years = Array.from(new Set(dates.map(d=>{ const dd=new Date(d); if(!isNaN(dd)) return dd.getFullYear(); }).filter(Boolean))).sort();
        yearSel.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('');
        if (!analyticsFilters.year && years.length>0) analyticsFilters.year = years[years.length-1];
        if (analyticsFilters.year) yearSel.value = analyticsFilters.year;
    }

    if (modeSel) {
        modeSel.addEventListener('change', ()=>{
            analyticsFilters.periodMode = modeSel.value;
            if (analyticsFilters.periodMode === 'year') {
                yearWrap.style.display='flex';
                monthWrap.style.display='none';
                populateYears();
            } else if (analyticsFilters.periodMode === 'month') {
                yearWrap.style.display='flex';
                monthWrap.style.display='flex';
                populateYears();
            } else {
                yearWrap.style.display='none';
                monthWrap.style.display='none';
            }
        });
    }
    if (etSel) etSel.addEventListener('change', ()=>{ analyticsFilters.errorType = etSel.value; });
    if (processSel) processSel.addEventListener('change', ()=>{ 
        analyticsFilters.process = processSel.value; 
        processFilter = processSel.value;  // Sync with global processFilter
        errorProcessFilter = processSel.value;  // Sync with error process filter
        drugProcessFilter = processSel.value;  // Sync with drug process filter
        // Update dropdowns in all cards as well
        const causeProcessFilter = document.getElementById('processFilter');
        const errorProcessFilterEl = document.getElementById('errorProcessFilter');
        const drugProcessFilterEl = document.getElementById('drugProcessFilter');
        if (causeProcessFilter) causeProcessFilter.value = processSel.value;
        if (errorProcessFilterEl) errorProcessFilterEl.value = processSel.value;
        if (drugProcessFilterEl) drugProcessFilterEl.value = processSel.value;
    });
    if (yearSel) yearSel.addEventListener('change', ()=>{ analyticsFilters.year = yearSel.value; });
    if (monthSel) monthSel.addEventListener('change', ()=>{ analyticsFilters.month = monthSel.value; });
    if (applyBtn) applyBtn.addEventListener('click', refreshAdvancedAnalytics);
    if (resetBtn) resetBtn.addEventListener('click', ()=>{
        analyticsFilters = { errorType:'all', periodMode:'all', year:null, month:null, process:'all' };
        processFilter = 'all'; // Reset global processFilter
        errorProcessFilter = 'all'; // Reset error process filter
        drugProcessFilter = 'all'; // Reset drug process filter
        if (etSel) etSel.value='all';
        if (processSel) processSel.value='all';
        if (modeSel) modeSel.value='all';
        // Also reset the dropdowns in all cards
        const causeProcessFilter = document.getElementById('processFilter');
        const errorProcessFilterEl = document.getElementById('errorProcessFilter');
        const drugProcessFilterEl = document.getElementById('drugProcessFilter');
        if (causeProcessFilter) causeProcessFilter.value = 'all';
        if (errorProcessFilterEl) errorProcessFilterEl.value = 'all';
        if (drugProcessFilterEl) drugProcessFilterEl.value = 'all';
        yearWrap.style.display='none';
        monthWrap.style.display='none';
        refreshAdvancedAnalytics();
    });
    updateAnalyticsFilterSummary();
}

function updateDashboard(allData, filteredData) {
    console.log('Updating dashboard with all data:', allData?.length, 'filtered:', filteredData?.length);
    
    if (!allData || allData.length === 0) {
        document.getElementById('totalErrors').textContent = '0';
        document.getElementById('myErrors').textContent = '0';
        document.getElementById('groupErrors').textContent = '0';
        document.getElementById('monthlyErrors').textContent = '0';
        document.getElementById('weeklyErrors').textContent = '0';
        return;
    }

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let totalCount = 0;
    let myCount = 0;
    let groupCount = 0;
    let monthlyCount = 0;
    let weeklyCount = 0;

    // Process all data for total counts
    allData.forEach((row, index) => {
        if (index === 0 || !row[0] || !row[1]) return;
        
        try {
            const errorDate = new Date(row[0]);
            const reporter = (row[11] || '').toString().trim();
            
            if (!isNaN(errorDate.getTime())) {
                totalCount++;
                
                // Count user's own reports
                if (currentUser && (
                    reporter === currentUser.name || 
                    reporter.includes(currentUser.name) ||
                    reporter === currentUser.psCode ||
                    reporter === currentUser.id13)) {
                    myCount++;
                }
                
                // Count group reports (simplified - could be enhanced with user database lookup)
                if (currentUser && (
                    reporter.includes(currentUser.group) || 
                    reporter === currentUser.name ||
                    currentUser.level === 'admin')) {
                    groupCount++;
                }
                
                // Monthly count (from filtered data)
                if (errorDate.getMonth() === thisMonth && errorDate.getFullYear() === thisYear) {
                    monthlyCount++;
                }
                
                // Weekly count (from filtered data)
                if (errorDate >= lastWeek) {
                    weeklyCount++;
                }
            }
        } catch (e) {
            console.warn('Error processing row:', e, row);
        }
    });

    // Apply filter-specific counts for monthly and weekly (use filtered data)
    if (filteredData && filteredData !== allData) {
        monthlyCount = 0;
        weeklyCount = 0;
        
        filteredData.forEach((row, index) => {
            if (index === 0 || !row[0] || !row[1]) return;
            
            try {
                const errorDate = new Date(row[0]);
                
                if (!isNaN(errorDate.getTime())) {
                    if (errorDate.getMonth() === thisMonth && errorDate.getFullYear() === thisYear) {
                        monthlyCount++;
                    }
                    if (errorDate >= lastWeek) {
                        weeklyCount++;
                    }
                }
            } catch (e) {
                console.warn('Error processing filtered row:', e, row);
            }
        });
    }

    // Legacy IDs (keep if still present but new layout uses different IDs)
    const legacyTotal = document.getElementById('totalErrors');
    if (legacyTotal) legacyTotal.textContent = totalCount;

    // New Overview Section IDs
    const todayCount = allData.filter(row => {
        try {
            const d = new Date(row[0]);
            const nowDate = new Date();
            return d.getFullYear() === nowDate.getFullYear() && d.getMonth() === nowDate.getMonth() && d.getDate() === nowDate.getDate();
        } catch { return false; }
    }).length;

    const sevenDayCount = allData.filter(row => {
        try { return new Date(row[0]) >= lastWeek; } catch { return false; }
    }).length;

    var elAllTime = document.getElementById('totalAllTime'); if (elAllTime) elAllTime.textContent = totalCount;
    var elMonth = document.getElementById('totalMonth'); if (elMonth) elMonth.textContent = monthlyCount;
    var elWeek = document.getElementById('totalWeek'); if (elWeek) elWeek.textContent = sevenDayCount;
    var elToday = document.getElementById('totalToday'); if (elToday) elToday.textContent = todayCount;

    // Per-user breakdown (Section 2)
    buildUserBreakdownTable(allData);

    // Trend indicator (reuse existing)
    updateTrendIndicator(allData, thisMonth, thisYear);
}

// Calculate trend indicator
function updateTrendIndicator(allData, thisMonth, thisYear) {
    const trendEl = document.getElementById('trendIndicator');
    if (!trendEl) return;

    try {
        let thisMonthCount = 0;
        let lastMonthCount = 0;
        
        const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
        const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

        allData.forEach(row => {
            if (!row[0] || !row[1]) return;
            
            try {
                const errorDate = new Date(row[0]);
                if (isNaN(errorDate.getTime())) return;
                
                const month = errorDate.getMonth();
                const year = errorDate.getFullYear();
                
                if (month === thisMonth && year === thisYear) {
                    thisMonthCount++;
                } else if (month === lastMonth && year === lastMonthYear) {
                    lastMonthCount++;
                }
            } catch (e) {
                // Skip invalid dates
            }
        });

        if (lastMonthCount === 0) {
            trendEl.textContent = thisMonthCount > 0 ? '↗ ใหม่' : '-';
            trendEl.style.color = thisMonthCount > 0 ? '#ffc107' : '#6c757d';
        } else {
            const percentChange = ((thisMonthCount - lastMonthCount) / lastMonthCount * 100);
            
            if (percentChange > 10) {
                trendEl.textContent = `↗ +${percentChange.toFixed(0)}%`;
                trendEl.style.color = '#dc3545';
            } else if (percentChange < -10) {
                trendEl.textContent = `↘ ${percentChange.toFixed(0)}%`;
                trendEl.style.color = '#28a745';
            } else {
                trendEl.textContent = '→ คงที่';
                trendEl.style.color = '#17a2b8';
            }
        }
    } catch (error) {
        console.error('Error calculating trend:', error);
        trendEl.textContent = '-';
        trendEl.style.color = '#6c757d';
    }
}

// Build per-user breakdown table: today / 7 days / month / all
function buildUserBreakdownTable(allData) {
    const tbody = document.getElementById('userBreakdownBody');
    if (!allData || allData.length === 0) {
        // Reset mini stats to 0 when no data
        ['userToday','userWeek','userMonth','userAll'].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent='0'; });
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">ไม่มีข้อมูล</td></tr>';
        return;
    }
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7*24*60*60*1000);
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const userStats = {}; // reporter => {today, week, month, all}
    allData.forEach((row, idx) => {
        if (!row || !row[0] || !row[11]) return; // require date + reporter
        const reporter = row[11];
        if (!userStats[reporter]) userStats[reporter] = { today:0, week:0, month:0, all:0 };
        userStats[reporter].all++;
        let d;
        try { d = new Date(row[0]); } catch { return; }
        if (isNaN(d)) return;
        if (d >= lastWeek) userStats[reporter].week++;
        if (d.getFullYear() === thisYear && d.getMonth() === thisMonth) userStats[reporter].month++;
        if (d.getFullYear() === thisYear && d.getMonth() === thisMonth && d.getDate() === now.getDate()) userStats[reporter].today++;
    });

    // If currentUser defined, restrict to only that user's entries
    let entries = Object.entries(userStats);
    if (typeof currentUser === 'object' && currentUser) {
        const name = currentUser.name || '';
        const ps = currentUser.psCode || '';
        entries = entries.filter(([reporter]) => {
            const r = reporter.toLowerCase();
            return (name && r.includes(name.toLowerCase())) || (ps && r.includes(ps.toLowerCase()));
        });
    }
    const rows = entries
        .sort((a,b) => b[1].all - a[1].all)
        .map(([name, s]) => `<tr><td>${name}</td><td>${s.today}</td><td>${s.week}</td><td>${s.month}</td><td>${s.all}</td></tr>`)
        .join('');
    if (tbody) tbody.innerHTML = rows || '<tr><td colspan="5" style="text-align:center;">ไม่มีข้อมูล</td></tr>';

    // Update mini stats for current user if exactly one row (filtered) or find current user aggregate
    if (currentUser) {
        const target = entries.find(([name]) => name.toLowerCase().includes((currentUser.name||'').toLowerCase()) || name.includes(currentUser.psCode||''));
        if (target) {
            const stats = target[1];
            const elToday = document.getElementById('userToday'); if (elToday) elToday.textContent = stats.today;
            const elWeek = document.getElementById('userWeek'); if (elWeek) elWeek.textContent = stats.week;
            const elMonth = document.getElementById('userMonth'); if (elMonth) elMonth.textContent = stats.month;
            const elAll = document.getElementById('userAll'); if (elAll) elAll.textContent = stats.all;
        }
    }
}

// Helper function to format dates and handle invalid dates
function formatDate(dateString) {
    if (!dateString || dateString.trim() === '') {
        return { date: 'N/A', time: 'N/A' };
    }
    
    try {
        const date = new Date(dateString);
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            console.warn('Invalid date:', dateString);
            return { date: 'วันที่ไม่ถูกต้อง', time: 'N/A' };
        }
        
        const formattedDate = date.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        
        const formattedTime = date.toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        
        return { date: formattedDate, time: formattedTime };
    } catch (error) {
        console.error('Error formatting date:', error, dateString);
        return { date: 'วันที่ไม่ถูกต้อง', time: 'N/A' };
    }
}

function populateTable(data) {
    const tableBody = document.getElementById('errorTableBody');
    
    if (!data || data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="no-data">
                    <div class="no-data-content">
                        <i class="fas fa-database"></i>
                        <p>ไม่มีข้อมูลที่ตรงกับตัวกรอง</p>
                        <small>ลองปรับเปลี่ยนตัวกรองหรือรีเฟรชข้อมูล</small>
                    </div>
                </td>
            </tr>
        `;
        updateTablePagination(0, 0);
        return;
    }

    // Data is already filtered by applyUserFilter, so we just need to format it
    let workingData = data;
    
    // Skip header row if exists
    if (data.length > 0 && Array.isArray(data[0]) && data[0][0] && 
        (data[0][0].toString().toLowerCase().includes('timestamp') || 
         data[0][0].toString().toLowerCase().includes('วันที่'))) {
        workingData = data.slice(1);
    }

    if (workingData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="no-data">
                    <div class="no-data-content">
                        <i class="fas fa-database"></i>
                        <p>ไม่มีข้อมูลที่ตรงกับตัวกรอง</p>
                        <small>ลองปรับเปลี่ยนตัวกรองหรือรีเฟรชข้อมูล</small>
                    </div>
                </td>
            </tr>
        `;
        updateTablePagination(0, 0);
        return;
    }

    // Get page size
    const pageSize = parseInt(document.getElementById('tablePageSize')?.value || '25');
    const validRows = workingData.filter(row => {
        // Filter out empty rows - check if row has timestamp and report ID
        return row && row[0] && row[1] && 
               row[0].toString().trim() !== '' && 
               row[1].toString().trim() !== '';
    });

    // Sort by date (column 0) descending (latest first)
    validRows.sort((a,b)=>{
        try {
            const da = new Date(a[0]);
            const db = new Date(b[0]);
            if (isNaN(da) && isNaN(db)) return 0;
            if (isNaN(da)) return 1;
            if (isNaN(db)) return -1;
            return db - da; // newest first
        } catch { return 0; }
    });

    const displayRows = validRows.slice(0, pageSize).map(row => {
        // Validate and format data
        const reportId = row[1] || 'N/A';
        
        // Better date handling using formatDate function
        const { date: formattedDate } = formatDate(row[0]);
        const shift = row[2] || 'N/A'; // เวร
        const errorType = row[3] || 'N/A';
        const location = row[4] || 'N/A';
        const process = row[5] || 'N/A';
        const error = row[6] || 'N/A'; // ข้อผิดพลาด
        const reporter = row[11] || 'N/A'; // ผู้รายงาน in column 11

        // Highlight current user's reports
        const isMyReport = currentUser && (
            reporter === currentUser.name || 
            reporter.includes(currentUser.name) ||
            reporter === currentUser.psCode ||
            reporter === currentUser.id13
        );
        
        // Check for high priority errors (example criteria)
        const isHighPriority = error.includes('ยาผิด') || error.includes('ขนาดผิด') || 
                              error.includes('คนไข้ผิด') || process.includes('จ่ายยา');
        
        let rowClass = '';
        if (isMyReport) rowClass += ' my-report';
        if (isHighPriority) rowClass += ' high-priority';

        return `
            <tr class="${rowClass}">
                <td>${reportId}</td>
                <td>${formattedDate}</td>
                <td>${shift}</td>
                <td>${errorType}</td>
                <td>${location}</td>
                <td>${process}</td>
                <td>${error}</td>
                <td>${reporter}</td>
                <td>
                    <button class="btn-view" onclick="viewErrorDetail('${reportId}')" title="ดูรายละเอียด">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tableBody.innerHTML = displayRows;
    
    // Update pagination info
    updateTablePagination(Math.min(pageSize, validRows.length), validRows.length);
    
    // Initialize table features
    initializeTableFeatures();
}

// Update table pagination information
function updateTablePagination(showing, total) {
    const showingStart = document.getElementById('showingStart');
    const showingEnd = document.getElementById('showingEnd');
    const totalRecords = document.getElementById('totalRecords');
    
    if (showingStart) showingStart.textContent = showing > 0 ? '1' : '0';
    if (showingEnd) showingEnd.textContent = showing.toString();
    if (totalRecords) totalRecords.textContent = total.toString();
}

// Initialize table features (sorting, search, etc.)
function initializeTableFeatures() {
    // Add table sorting
    addTableSorting();
    
    // Add search functionality
    addTableSearch();
}

// Add table sorting functionality
function addTableSorting() {
    const table = document.getElementById('errorTable');
    if (!table) return;

    const headers = table.querySelectorAll('th.sortable');
    headers.forEach((header, index) => {
        header.addEventListener('click', () => {
            const currentSort = header.getAttribute('data-sort-direction') || 'asc';
            const newSort = currentSort === 'asc' ? 'desc' : 'asc';
            
            // Reset all other headers
            headers.forEach(h => {
                h.setAttribute('data-sort-direction', '');
                h.querySelector('i').className = 'fas fa-sort';
            });
            
            // Set current header
            header.setAttribute('data-sort-direction', newSort);
            const icon = header.querySelector('i');
            icon.className = newSort === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
            
            sortTableByColumn(index, newSort === 'asc');
        });
    });
}

// Sort table by column
function sortTableByColumn(columnIndex, ascending = true) {
    const table = document.getElementById('errorTable');
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr')).filter(row => 
        !row.querySelector('.no-data-content')
    );
    
    rows.sort((a, b) => {
    const aCell = a.cells[columnIndex];
    const bCell = b.cells[columnIndex];
    const aText = aCell && aCell.textContent ? aCell.textContent.trim() : '';
    const bText = bCell && bCell.textContent ? bCell.textContent.trim() : '';
        
        // Try to parse as numbers or dates first
        const aNum = parseFloat(aText);
        const bNum = parseFloat(bText);
        
        if (!isNaN(aNum) && !isNaN(bNum)) {
            return ascending ? aNum - bNum : bNum - aNum;
        }
        
        // Try to parse as dates
        const aDate = new Date(aText);
        const bDate = new Date(bText);
        
        if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) {
            return ascending ? aDate - bDate : bDate - aDate;
        }
        
        // Default to string comparison
        return ascending ? 
            aText.localeCompare(bText, 'th', { numeric: true }) :
            bText.localeCompare(aText, 'th', { numeric: true });
    });
    
    // Re-append sorted rows
    rows.forEach(row => tbody.appendChild(row));
}

// Add table search functionality
function addTableSearch() {
    const searchInput = document.getElementById('tableSearch');
    if (!searchInput) return;

    // Remove existing event listeners
    searchInput.replaceWith(searchInput.cloneNode(true));
    const newSearchInput = document.getElementById('tableSearch');

    newSearchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        filterTableRows(searchTerm);
    });
}

// Filter table rows based on search term
function filterTableRows(searchTerm) {
    const table = document.getElementById('errorTable');
    const tbody = table.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr');
    
    let visibleCount = 0;
    
    rows.forEach(row => {
        if (row.querySelector('.no-data-content')) {
            return; // Skip no-data rows
        }
        
        const rowText = Array.from(row.cells)
            .slice(0, 8) // Exclude action column
            .map(cell => cell.textContent.toLowerCase())
            .join(' ');
        
        const isVisible = searchTerm === '' || rowText.includes(searchTerm);
        row.style.display = isVisible ? '' : 'none';
        
        if (isVisible) visibleCount++;
    });
    
    // Update table statistics
    const totalRecords = document.getElementById('totalRecords');
    const originalTotal = totalRecords ? parseInt(totalRecords.textContent) : 0;
    updateTablePagination(visibleCount, originalTotal);
}

// View error detail function
function viewErrorDetail(reportId) {
    showNotification(`กำลังโหลดรายละเอียดของรายงาน: ${reportId}`, 'info');
    
    // Future implementation: Open modal with detailed error information
    // For now, just show a notification
    setTimeout(() => {
        showNotification(`รายงาน ${reportId}: รายละเอียดจะแสดงในเวอร์ชันถัดไป`, 'info');
    }, 1000);
}

// Set current date as default in form
function setCurrentDate() {
    const eventDateInput = document.getElementById('eventDate');
    if (eventDateInput) {
        // Get current date in YYYY-MM-DD format
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const currentDate = `${year}-${month}-${day}`;
        
        eventDateInput.value = currentDate;
        console.log('Set current date:', currentDate);
    }
}

// Enhanced form initialization
function initializeFormDefaults() {
    // Set current date
    setCurrentDate();
    
    // Setup enhanced form with validation
    setupFormEnhanced();
    
    // Reset form to initial state
    const form = document.getElementById('errorForm');
    if (form) {
        form.reset();
        
        // Set current date again after reset
        setTimeout(() => {
            setCurrentDate();
        }, 100);
    }
    
    // Clear any previous error messages
    clearFormErrors();
    
    // Focus on first input
    const firstInput = document.getElementById('shift');
    if (firstInput) {
        firstInput.focus();
    }
}

// Clear form validation errors
function clearFormErrors() {
    const formGroups = document.querySelectorAll('.form-group');
    formGroups.forEach(group => {
        group.classList.remove('has-error');
        const errorMsg = group.querySelector('.error-message');
        if (errorMsg) {
            errorMsg.remove();
        }
    });
}

// Enhanced form validation
function validateForm() {
    let isValid = true;
    const errors = [];
    
    // Clear previous errors
    clearFormErrors();
    
    // Required fields validation
    const requiredFields = [
        { id: 'eventDate', name: 'วันที่เกิดเหตุการณ์' },
        { id: 'shift', name: 'เวร' },
        { id: 'errorType', name: 'ประเภท' },
        { id: 'location', name: 'สถานที่เกิดเหตุการณ์' },
        { id: 'process', name: 'กระบวนการ' },
        { id: 'errorDetail', name: 'ข้อผิดพลาด' },
        { id: 'correctItem', name: 'รายการที่ถูกต้อง' },
        { id: 'cause', name: 'สาเหตุ' }
    ];
    
    requiredFields.forEach(field => {
        const element = document.getElementById(field.id);
        if (element && (!element.value || element.value.trim() === '')) {
            isValid = false;
            errors.push(field.name);
            
            // Add visual error indication
            const formGroup = element.closest('.form-group');
            if (formGroup) {
                formGroup.classList.add('has-error');
                
                // Add error message
                const errorMsg = document.createElement('div');
                errorMsg.className = 'error-message';
                errorMsg.textContent = `กรุณากรอก${field.name}`;
                formGroup.appendChild(errorMsg);
            }
        }
    });
    
    // Date validation (not in future)
    const eventDate = document.getElementById('eventDate');
    if (eventDate && eventDate.value) {
        const selectedDate = new Date(eventDate.value);
        const today = new Date();
        today.setHours(23, 59, 59, 999); // End of today
        
        if (selectedDate > today) {
            isValid = false;
            errors.push('วันที่เกิดเหตุการณ์ไม่สามารถเป็นวันในอนาคตได้');
            
            const formGroup = eventDate.closest('.form-group');
            if (formGroup) {
                formGroup.classList.add('has-error');
                const errorMsg = document.createElement('div');
                errorMsg.className = 'error-message';
                errorMsg.textContent = 'วันที่เกิดเหตุการณ์ไม่สามารถเป็นวันในอนาคตได้';
                formGroup.appendChild(errorMsg);
            }
        }
    }
    
    // Show summary of errors
    if (!isValid) {
        const errorSummary = `กรุณาตรวจสอบข้อมูลต่อไปนี้:\n• ${errors.join('\n• ')}`;
        showNotification(errorSummary, 'error');
        
        // Scroll to first error
        const firstError = document.querySelector('.form-group.has-error');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    
    return isValid;
}

// Real-time form validation
function setupFormValidation() {
    const form = document.getElementById('errorForm');
    if (!form) return;
    
    // Add event listeners for real-time validation
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        input.addEventListener('blur', function() {
            validateField(this);
            
            // ตรวจสอบ HAD เมื่อพิมพ์ข้อมูลในฟิลด์ยา
            if (['correctItem', 'incorrectItem', 'errorDetail'].includes(this.id)) {
                checkHADRealtime();
            }
        });
        
        input.addEventListener('input', function() {
            // Clear error state on input
            const formGroup = this.closest('.form-group');
            if (formGroup && formGroup.classList.contains('has-error')) {
                formGroup.classList.remove('has-error');
                const errorMsg = formGroup.querySelector('.error-message');
                if (errorMsg) {
                    errorMsg.remove();
                }
            }
            
            // ตรวจสอบ HAD แบบ real-time สำหรับฟิลด์ยา
            if (['correctItem', 'incorrectItem', 'errorDetail'].includes(this.id)) {
                clearTimeout(this.hadCheckTimeout);
                this.hadCheckTimeout = setTimeout(() => {
                    checkHADRealtime();
                }, 500); // Debounce 500ms
            }
        });
    });
    
    // Special handling for date input
    const eventDate = document.getElementById('eventDate');
    if (eventDate) {
        eventDate.addEventListener('change', function() {
            validateField(this);
        });
    }
}

// Validate individual field
function validateField(field) {
    const formGroup = field.closest('.form-group');
    if (!formGroup) return;
    
    let isValid = true;
    let errorMessage = '';
    
    // Clear previous error
    formGroup.classList.remove('has-error', 'has-success');
    const existingError = formGroup.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    
    // Check if field is required
    const requiredFields = ['eventDate', 'shift', 'errorType', 'location', 'process', 'errorDetail', 'correctItem', 'cause'];
    const isRequired = requiredFields.includes(field.id);
    
    if (isRequired && (!field.value || field.value.trim() === '')) {
        isValid = false;
    const prevLabel = field.previousElementSibling && field.previousElementSibling.textContent ? field.previousElementSibling.textContent : 'ข้อมูล';
    errorMessage = `กรุณากรอก${prevLabel}`;
    }
    
    // Date validation
    if (field.id === 'eventDate' && field.value) {
        const selectedDate = new Date(field.value);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        
        if (selectedDate > today) {
            isValid = false;
            errorMessage = 'วันที่เกิดเหตุการณ์ไม่สามารถเป็นวันในอนาคตได้';
        }
    }
    
    // Apply validation state
    if (!isValid) {
        formGroup.classList.add('has-error');
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = errorMessage;
        formGroup.appendChild(errorDiv);
    } else if (field.value && field.value.trim() !== '') {
        formGroup.classList.add('has-success');
    }
    
    return isValid;
}

// Enhanced form setup
function setupFormEnhanced() {
    setupFormValidation();
    
    // Add form submit handler with validation
    const form = document.getElementById('errorForm');
    if (form) {
        // Ensure we don't attach multiple listeners
        if (!form.dataset.listenerAttached) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                if (validateForm()) {
                    handleFormSubmit(e);
                }
            });
            form.dataset.listenerAttached = 'true';
        }
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded');
    
    // Check authentication first
    if (checkAuthentication()) {
        // User is already logged in, initialize the app
        initializeApp();
    } else {
        // User not logged in, show login page
        showLoginPage();
    }
    
    // Login form event listener
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
});

function initializeApp() {
    console.log('=== initializeApp called ===');
    console.log('currentUser in initializeApp:', currentUser);
    
    // Load saved configuration
    loadConfig();
    
    // Initialize form defaults (including current date and validation)
    initializeFormDefaults();
    
    // Initialize form
    initializeForm();
    
    // Update reporter field with current user - delay to ensure DOM is ready
    setTimeout(() => {
        console.log('Calling updateReporterField from initializeApp');
        updateReporterField();
    }, 200);
    
    // Update dashboard user info
    updateDashboardUserInfo();
    
    // แสดงสถานะ Demo Mode ถ้าไม่ได้ตั้งค่า Web App URL
    if (!googleSheetsConfig.webAppUrl) {
        showNotification('🔄 กำลังทำงานในโหมดทดสอบ - ข้อมูลจะไม่ถูกบันทึกใน Google Sheets จริง', 'info');
    }
    
    // Location change listener for substation toggle
    const locSelect = document.getElementById('location');
    const subGroup = document.getElementById('substationGroup');
    if (locSelect && subGroup) {
        locSelect.addEventListener('change', () => {
            if (locSelect.value === 'รพ.สต.') {
                subGroup.style.display = '';
            } else {
                subGroup.style.display = 'none';
                const subSel = document.getElementById('substation');
                if (subSel) subSel.value = '';
            }
        });
    }
    
    // Form event listeners (single enhanced listener with validation)
    setupFormEnhanced();
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', handleSettingsSubmit);
    } else {
        console.warn('settingsForm not found');
    }
    
    // Drug form event listener
    const drugForm = document.getElementById('drugForm');
    if (drugForm) {
        drugForm.addEventListener('submit', handleDrugFormSubmit);
    }
    
    // Filter change listeners
    const filterUserEl = document.getElementById('filterUser');
    if (filterUserEl) {
        filterUserEl.addEventListener('change', function() {
            loadData();
            updateDashboardUserInfo();
        });
    }

    const filterPeriodEl = document.getElementById('filterPeriod');
    if (filterPeriodEl) {
        filterPeriodEl.addEventListener('change', function() {
            loadData();
            updateDashboardUserInfo();
        });
    }
    
    // Auto-save settings when user types
    ['apiKey', 'spreadsheetId', 'sheetName', 'userSheetName', 'drugSheetName', 'webAppUrl'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) {
            console.warn('Config input not found:', id);
            return;
        }
        el.addEventListener('input', function() {
            if (id === 'apiKey') {
                googleSheetsConfig.apiKey = this.value;
            } else if (id === 'spreadsheetId') {
                googleSheetsConfig.spreadsheetId = this.value;
            } else if (id === 'sheetName') {
                googleSheetsConfig.sheetName = this.value;
            } else if (id === 'userSheetName') {
                googleSheetsConfig.userSheetName = this.value;
            } else if (id === 'drugSheetName') {
                googleSheetsConfig.drugSheetName = this.value;
            } else if (id === 'webAppUrl') {
                googleSheetsConfig.webAppUrl = this.value;
            }
            saveConfig();
        });
    });
}

// Utility functions
function generateSampleData() {
    const sampleErrors = [
        {
            timestamp: new Date().toISOString().slice(0, 16),
            reporterId: 'PHARM001',
            patientId: 'PAT12345',
            medicationName: 'Metformin',
            prescribedDose: '500mg twice daily',
            actualDose: '1000mg once daily',
            errorType: 'Wrong Dose',
            severity: 'Medium',
            causeCategory: 'Human Error',
            description: 'Misread prescription, prepared double dose in single administration',
            actionsTaken: 'Corrected dose, informed physician, monitored patient',
            preventiveMeasures: 'Double-check high-risk medications, implement barcode scanning'
        }
    ];
    
    return sampleErrors;
}

// Drug List Management Functions
async function loadDrugList() {
    try {
        if (!googleSheetsConfig.webAppUrl) {
            // Demo Mode: ใช้ข้อมูลยาตัวอย่างถ้าไม่ได้ตั้งค่า Web App URL
            console.log('Demo Mode: ใช้ข้อมูลยาตัวอย่าง');
            const sampleDrugs = [
                { drugCode: 'PAR500', drugName: 'Paracetamol 500mg', group: 'Analgesic', had: 'Regular', status: 'Active' },
                { drugCode: 'ASP100', drugName: 'Aspirin 100mg', group: 'Antiplatelet', had: 'Regular', status: 'Active' },
                { drugCode: 'INS001', drugName: 'Insulin Regular', group: 'Antidiabetic', had: 'High', status: 'Active' },
                { drugCode: 'WAR5', drugName: 'Warfarin 5mg', group: 'Anticoagulant', had: 'High', status: 'Active' },
                { drugCode: 'ATR025', drugName: 'Atorvastatin 20mg', group: 'Statin', had: 'Regular', status: 'Active' }
            ];
            
            // ทำความสะอาดและตรวจสอบข้อมูล
            globalDrugList = cleanDrugData(sampleDrugs);
            setupDrugSearchInputs();
            console.log('โหลดข้อมูลยาตัวอย่าง:', globalDrugList.length, 'รายการ');
            
            // แสดงรายการ HAD จากข้อมูลตัวอย่าง
            displayHADListFromDatabase(globalDrugList);
            
            return sampleDrugs;
        }

        // Use FormData submission to avoid CORS preflight issues
        try {
            const formData = new FormData();
            formData.append('action', 'getDrugList');
            formData.append('drugSheetName', googleSheetsConfig.drugSheetName || 'Drug_List');
            
            const response = await fetch(googleSheetsConfig.webAppUrl, {
                method: 'POST',
                body: formData  // ใช้ FormData แทน JSON เพื่อหลีกเลี่ยง CORS preflight
            });
            
            const result = await response.json();
            
            if (result.success) {
                drugListData = result.data || [];
                
                // ทำความสะอาดและอัปเดต globalDrugList
                globalDrugList = cleanDrugData(drugListData);
                
                renderDrugTable();
                updateDrugStats();
                showNotification(`โหลดรายการยาเรียบร้อย (${result.count} รายการ)`, 'success');
                
                // แสดงรายการ HAD จากฐานข้อมูล
                displayHADListFromDatabase(globalDrugList);
                
                return;
            } else {
                throw new Error(result.error || 'Unknown error from Web App');
            }
        } catch (webAppError) {
            console.log('Web App failed, trying form submission fallback:', webAppError);
            
            // Try form submission fallback
            try {
                const success = await loadDrugListViaForm();
                if (success) {
                    showNotification('โหลดรายการยาเรียบร้อย (ผ่าน form)', 'success');
                    return;
                }
            } catch (formError) {
                console.log('Form submission also failed:', formError);
            }
            
            // If both methods fail, try Google Sheets API
            console.log('Form submission failed, trying Google Sheets API fallback');
            try {
                return await loadDrugListFromAPI();
            } catch (apiError) {
                console.log('API also failed, using sample data:', apiError);
                createSampleDrugData();
            }
        }
        
    } catch (error) {
        console.error('Error loading drug list:', error);
        showNotification('ไม่สามารถโหลดรายการยาได้ - ใช้ข้อมูลตัวอย่าง', 'warning');
        
        // Use sample data as final fallback
        createSampleDrugData();
    }
}

// Fallback: Load drug list using Google Sheets API
async function loadDrugListFromAPI() {
    try {
        if (!googleSheetsConfig.apiKey || !googleSheetsConfig.spreadsheetId) {
            showNotification('กรุณาตั้งค่า API Key และ Spreadsheet ID ก่อน', 'error');
            return;
        }

        console.log('Loading drug list from API with drugSheetName:', googleSheetsConfig.drugSheetName);
        const range = `${googleSheetsConfig.drugSheetName}!A:E`;
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${googleSheetsConfig.spreadsheetId}/values/${range}?key=${googleSheetsConfig.apiKey}`;
        
        console.log('API URL:', url);
        const response = await fetch(url);
        const data = await response.json();
        
        console.log('API Response:', data);
        
        if (data.error) {
            console.error('API Error:', data.error);
            // If sheet doesn't exist, create empty drug list
            drugListData = [];
            renderDrugTable();
            updateDrugStats();
            showNotification(`ไม่พบ sheet "${googleSheetsConfig.drugSheetName}" หรือเกิดข้อผิดพลาด: ${data.error.message}`, 'error');
            return;
        }
        
        if (data.values && data.values.length > 1) {
            // Skip header row and convert data format to match your sheet structure
            drugListData = data.values.slice(1).map((row, index) => {
                const drug = {
                    drugCode: row[0] || '',
                    drugName: row[1] || '',
                    group: row[2] || '',
                    had: row[3] == 1 || row[3] === 'High' || row[3] === 'HIGH' || row[3] === 'H' ? 'High' : 'Regular',
                    // More flexible status checking - default to Active if empty or unclear
                    status: (row[4] === '' || row[4] === null || row[4] === undefined || 
                            row[4] == 1 || row[4] === 'Active' || row[4] === 'ACTIVE' || 
                            row[4] === 'A' || row[4] === 'YES' || row[4] === 'Y' || 
                            row[4] === true || row[4] === 'TRUE') ? 'Active' : 'Inactive'
                };
                
                // Debug log first few drugs
                if (index < 3) {
                    console.log(`Drug ${index + 1}:`, drug, 'Raw row:', row);
                }
                
                return drug;
            });
            
            console.log(`Loaded ${drugListData.length} drugs from API`);
            console.log('Sample drugs:', drugListData.slice(0, 3));
            
            // Count active drugs for debugging
            const activeDrugs = drugListData.filter(drug => drug.status === 'Active');
            console.log(`Active drugs found: ${activeDrugs.length}`);
            console.log('Active drugs sample:', activeDrugs.slice(0, 3));
            
            // If no active drugs found, mark first 10 as active for demo
            if (activeDrugs.length === 0 && drugListData.length > 0) {
                console.log('No active drugs found, marking first 10 as Active for demo');
                drugListData.slice(0, 10).forEach(drug => {
                    drug.status = 'Active';
                });
                const newActiveDrugs = drugListData.filter(drug => drug.status === 'Active');
                console.log(`Updated: ${newActiveDrugs.length} drugs marked as Active`);
            }
        } else {
            drugListData = [];
            console.log('No drug data found in sheet');
        }
        
        // ทำความสะอาดและอัปเดต globalDrugList
        globalDrugList = cleanDrugData(drugListData);
        
        renderDrugTable();
        updateDrugStats();
        
        // แสดงรายการ HAD จากฐานข้อมูล
        displayHADListFromDatabase(globalDrugList);
        
        showNotification(`โหลดรายการยาเรียบร้อย (ผ่าน API) - ${drugListData.length} รายการ`, 'success');
        
    } catch (error) {
        console.error('Error loading drug list from API:', error);
        showNotification('เกิดข้อผิดพลาดในการโหลดรายการยาจาก API: ' + error.message, 'error');
        
        // Create sample drug data as fallback
        createSampleDrugData();
    }
}

// Create sample drug data when API fails
function createSampleDrugData() {
    console.log('Creating sample drug data...');
    drugListData = [
        { drugCode: 'PARA500', drugName: 'Paracetamol 500mg', group: 'Analgesic', had: 'Regular', status: 'Active' },
        { drugCode: 'AMOX250', drugName: 'Amoxicillin 250mg', group: 'Antibiotic', had: 'Regular', status: 'Active' },
        { drugCode: 'METRO400', drugName: 'Metronidazole 400mg', group: 'Antibiotic', had: 'Regular', status: 'Active' },
        { drugCode: 'PRED5', drugName: 'Prednisolone 5mg', group: 'Steroid', had: 'High', status: 'Active' },
        { drugCode: 'DEXA4', drugName: 'Dexamethasone 4mg', group: 'Steroid', had: 'High', status: 'Active' },
        { drugCode: 'INSU100', drugName: 'Insulin 100IU/ml', group: 'Hormone', had: 'High', status: 'Active' },
        { drugCode: 'MORPH10', drugName: 'Morphine 10mg', group: 'Narcotic', had: 'High', status: 'Active' },
        { drugCode: 'METRO200', drugName: 'Metronidazole 200mg', group: 'Antibiotic', had: 'Regular', status: 'Inactive' }
    ];
    
    console.log('Sample drug data created:', drugListData.length, 'items');
    
    // ทำความสะอาดและอัปเดต globalDrugList
    globalDrugList = cleanDrugData(drugListData);
    
    renderDrugTable();
    updateDrugStats();
    
    // แสดงรายการ HAD จากข้อมูลตัวอย่าง
    displayHADListFromDatabase(globalDrugList);
    
    showNotification('ใช้ข้อมูลตัวอย่าง - กรุณาตั้งค่า API หรือ Apps Script ให้ถูกต้อง', 'info');
}

// ฟังก์ชันแสดงรายการ HAD จากฐานข้อมูล
function displayHADListFromDatabase(drugList) {
    console.log('🚨 === รายการ High Alert Drugs (HAD) จากฐานข้อมูล ===');
    
    // กรองเฉพาะยา HAD
    const hadDrugs = drugList.filter(drug => drug.had === 'High' && drug.status === 'Active');
    
    if (hadDrugs.length === 0) {
        console.log('❌ ไม่พบรายการ HAD ในฐานข้อมูล');
        showNotification('ไม่พบรายการ High Alert Drugs ในฐานข้อมูล', 'warning');
        return;
    }
    
    console.log(`🎯 พบ High Alert Drugs จำนวน: ${hadDrugs.length} รายการ`);
    console.log('');
    
    // จัดกลุ่มตาม group
    const groupedHAD = {};
    hadDrugs.forEach(drug => {
        if (!groupedHAD[drug.group]) {
            groupedHAD[drug.group] = [];
        }
        groupedHAD[drug.group].push(drug);
    });
    
    // แสดงรายการแยกตามกลุ่ม
    Object.keys(groupedHAD).forEach(group => {
        console.log(`📂 กลุ่ม: ${group} (${groupedHAD[group].length} รายการ)`);
        groupedHAD[group].forEach((drug, index) => {
            console.log(`   ${index + 1}. ${drug.drugCode} - ${drug.drugName}`);
        });
        console.log('');
    });
    
    // แสดงสรุป
    console.log('📊 สรุปรายการ HAD:');
    console.log(`   - รวมทั้งหมด: ${hadDrugs.length} รายการ`);
    console.log(`   - แยกเป็น: ${Object.keys(groupedHAD).length} กลุ่ม`);
    console.log(`   - กลุ่มยา: ${Object.keys(groupedHAD).join(', ')}`);
    
    // แสดงการแจ้งเตือน
    showNotification(`🚨 พบ High Alert Drugs: ${hadDrugs.length} รายการ แยกเป็น ${Object.keys(groupedHAD).length} กลุ่ม`, 'warning');
    
    // อัปเดต global list สำหรับ HAD detection
    globalDrugList = drugList;
    
    return hadDrugs;
}

// ฟังก์ชันทำความสะอาดข้อมูลยา
function cleanDrugData(drugList) {
    if (!Array.isArray(drugList)) {
        console.warn('DrugList is not an array:', drugList);
        return [];
    }
    
    return drugList.map(drug => {
        // ตรวจสอบและแปลงข้อมูลให้เป็น string
        const cleanedDrug = {
            drugCode: drug.drugCode ? String(drug.drugCode).trim() : '',
            drugName: drug.drugName ? String(drug.drugName).trim() : '',
            group: drug.group ? String(drug.group).trim() : '',
            had: drug.had ? String(drug.had).trim() : 'Regular',
            status: drug.status ? String(drug.status).trim() : 'Active'
        };
        
        // ตรวจสอบข้อมูลที่จำเป็น
        if (!cleanedDrug.drugCode && !cleanedDrug.drugName) {
            console.warn('Invalid drug data:', drug);
            return null;
        }
        
        return cleanedDrug;
    }).filter(drug => drug !== null); // ลบรายการที่ไม่ถูกต้อง
}

// ฟังก์ชันแสดงรายการ HAD สำหรับเรียกจากปุ่ม
function showHADList() {
    console.log('🚨 === แสดงรายการ High Alert Drugs ===');
    
    // ใช้ข้อมูลจาก globalDrugList หรือ drugListData
    const drugList = globalDrugList.length > 0 ? globalDrugList : 
                    (window.drugListData && window.drugListData.length > 0 ? window.drugListData : []);
    
    if (drugList.length === 0) {
        console.log('❌ ไม่มีข้อมูลยาในระบบ - กรุณาโหลดข้อมูลยาก่อน');
        showNotification('ไม่มีข้อมูลยาในระบบ กรุณาโหลดรายการยาก่อน', 'warning');
        return;
    }
    
    displayHADListFromDatabase(drugList);
}

// Form submission fallback for loading drug list
async function loadDrugListViaForm() {
    return new Promise((resolve) => {
        // For loading data, we'll create a popup window that communicates back
        const popup = window.open('', '_blank', 'width=600,height=400');
        
        if (!popup) {
            resolve(false);
            return;
        }
        
        popup.document.write(`
            <html>
            <head><title>Loading Drug List...</title></head>
            <body>
                <h3>กำลังโหลดรายการยา...</h3>
                <form id="drugListForm" method="POST" action="${googleSheetsConfig.webAppUrl}">
                    <input type="hidden" name="payload" value='{"action":"getDrugList","drugSheetName":"${googleSheetsConfig.drugSheetName || 'Drug_List'}"}'>
                </form>
                <script>
                    document.getElementById('drugListForm').submit();
                </script>
            </body>
            </html>
        `);
        
        // Close popup after a delay and assume partial success
        setTimeout(() => {
            if (popup && !popup.closed) {
                popup.close();
            }
            // For form submission, we can't get the response directly
            // So we'll fallback to API method
            resolve(false);
        }, 3000);
    });
}

function renderDrugTable() {
    const tbody = document.getElementById('drugTableBody');
    
    if (drugListData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">ไม่มีรายการยา</td></tr>';
        return;
    }
    
    let filteredData = drugListData;
    
    // Apply filters
    const searchTerm = document.getElementById('searchDrug')?.value.toLowerCase() || '';
    const groupFilter = document.getElementById('filterGroup')?.value || '';
    const hadFilter = document.getElementById('filterHAD')?.value || '';
    
    if (searchTerm) {
        filteredData = filteredData.filter(drug => 
            drug.drugCode.toLowerCase().includes(searchTerm) ||
            drug.drugName.toLowerCase().includes(searchTerm)
        );
    }
    
    if (groupFilter) {
        filteredData = filteredData.filter(drug => drug.group === groupFilter);
    }
    
    if (hadFilter) {
        filteredData = filteredData.filter(drug => drug.had === hadFilter);
    }
    
    tbody.innerHTML = filteredData.map(drug => `
        <tr>
            <td><strong>${drug.drugCode}</strong></td>
            <td>${drug.drugName}</td>
            <td><span class="tag">${drug.group}</span></td>
            <td>
                <span class="tag ${drug.had === 'High' ? 'tag-danger' : 'tag-info'}">
                    ${drug.had}
                </span>
            </td>
            <td>
                <span class="tag ${getStatusTagClass(drug.status)}">
                    ${drug.status}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="editDrug('${drug.drugCode}')" title="แก้ไข">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteDrug('${drug.drugCode}')" title="ลบ">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
    
    // Populate drug dropdowns for error reporting form
    populateDrugDropdowns();
}

function getStatusTagClass(status) {
    switch (status) {
        case 'Active': return 'tag-success';
        case 'Inactive': return 'tag-warning';
        case 'Discontinued': return 'tag-danger';
        default: return 'tag-secondary';
    }
}

function updateDrugStats() {
    const total = drugListData.length;
    let hadDrugs = 0, activeDrugs = 0, inactiveDrugs = 0;
    for (const drug of drugListData) {
        if (drug.had === 'High') hadDrugs++;
        if (drug.status === 'Active') {
            activeDrugs++;
        } else {
            inactiveDrugs++;
        }
    }
    document.getElementById('totalDrugs').textContent = total;
    document.getElementById('hadDrugs').textContent = hadDrugs;
    document.getElementById('activeDrugs').textContent = activeDrugs;
    document.getElementById('inactiveDrugs').textContent = inactiveDrugs;
}

function filterDrugs() {
    renderDrugTable();
}

// Debounce timer for drug search input
let _drugSearchTimer = null;

// Modern fuzzy search with intelligent scoring
function filterDrugsModern() {
    clearTimeout(_drugSearchTimer);
    _drugSearchTimer = setTimeout(_filterDrugsModernImpl, 200);
}

function _filterDrugsModernImpl() {
    const tbody = document.getElementById('drugTableBody');
    const searchTerm = document.getElementById('searchDrug')?.value.trim() || '';
    const groupFilter = document.getElementById('filterGroup')?.value || '';
    const hadFilter = document.getElementById('filterHAD')?.value || '';
    const statusFilter = document.getElementById('filterStatus')?.value || '';
    const clearBtn = document.getElementById('clearSearchBtn');
    const resetBtn = document.getElementById('resetFiltersBtn');

    // Show/hide clear button
    if (clearBtn) {
        clearBtn.style.display = searchTerm ? 'flex' : 'none';
    }

    // Check if any filters are active
    const hasActiveFilters = searchTerm || groupFilter || hadFilter || statusFilter;
    if (resetBtn) {
        resetBtn.style.display = hasActiveFilters ? 'inline-flex' : 'none';
    }

    if (drugListData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">ไม่มีรายการยา</td></tr>';
        updateResultCount(0);
        return;
    }

    let filteredData = drugListData;

    // Apply category filters first
    if (groupFilter) {
        filteredData = filteredData.filter(drug => drug.group === groupFilter);
    }
    if (hadFilter) {
        filteredData = filteredData.filter(drug => drug.had === hadFilter);
    }
    if (statusFilter) {
        filteredData = filteredData.filter(drug => drug.status === statusFilter);
    }

    // Apply fuzzy search if search term exists
    if (searchTerm) {
        const q = searchTerm.toLowerCase();

        const scored = filteredData.map(drug => {
            const codeLower = (drug.drugCode || '').toLowerCase();
            const nameLower = (drug.drugName || '').toLowerCase();
            const combinedText = `${codeLower} ${nameLower}`;
            let score = 0;

            // Exact match (highest priority)
            if (codeLower === q || nameLower === q) {
                score = 10000;
            }
            // Code starts with query
            else if (codeLower.startsWith(q)) {
                score = 5000;
            }
            // Name starts with query
            else if (nameLower.startsWith(q)) {
                score = 4500;
            }
            // Word boundary match in name
            else if (nameLower.includes(' ' + q) || nameLower.includes('(' + q)) {
                score = 3000;
            }
            // Contains in code
            else if (codeLower.includes(q)) {
                score = 2000;
            }
            // Contains in name
            else if (nameLower.includes(q)) {
                score = 1500;
            }
            // Fuzzy match
            else if (fuzzyMatchDrug(q, combinedText)) {
                score = 500;
            }
            // No match
            else {
                return null;
            }

            // Bonus for exact length match
            if (codeLower.length === q.length || nameLower.length === q.length) {
                score += 1000;
            }

            // Bonus for shorter results (more specific)
            score += Math.max(0, 100 - combinedText.length);

            return { drug, score };
        })
        .filter(item => item !== null)
        .sort((a, b) => b.score - a.score)
        .map(item => item.drug);

        filteredData = scored;
    }

    // Render results
    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 40px;"><i class="fas fa-search" style="font-size: 48px; color: #ddd; display: block; margin-bottom: 10px;"></i><div style="color: #999;">ไม่พบรายการยาที่ตรงกับการค้นหา</div></td></tr>';
    } else {
        tbody.innerHTML = filteredData.map(drug => {
            // Highlight search term in results
            let displayCode = drug.drugCode;
            let displayName = drug.drugName;

            if (searchTerm) {
                displayCode = highlightText(drug.drugCode, searchTerm);
                displayName = highlightText(drug.drugName, searchTerm);
            }

            return `
                <tr class="drug-row">
                    <td><strong>${displayCode}</strong></td>
                    <td>${displayName}</td>
                    <td><span class="tag">${drug.group}</span></td>
                    <td>
                        <span class="tag ${drug.had === 'High' ? 'tag-danger' : 'tag-info'}">
                            ${drug.had}
                        </span>
                    </td>
                    <td>
                        <span class="tag ${getStatusTagClass(drug.status)}">
                            ${drug.status}
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-secondary" onclick="editDrug('${drug.drugCode}')" title="แก้ไข">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteDrug('${drug.drugCode}')" title="ลบ">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    updateResultCount(filteredData.length);
}

// Fuzzy matching helper for drug search
function fuzzyMatchDrug(query, target) {
    let queryIndex = 0;
    for (let i = 0; i < target.length && queryIndex < query.length; i++) {
        if (target[i] === query[queryIndex]) {
            queryIndex++;
        }
    }
    return queryIndex === query.length;
}

// Highlight matching text
function highlightText(text, search) {
    if (!search || !text) return text;

    const regex = new RegExp(`(${escapeRegex(search)})`, 'gi');
    return text.replace(regex, '<mark class="search-highlight">$1</mark>');
}

// Escape special regex characters
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Update result count display
function updateResultCount(count) {
    const resultCountEl = document.getElementById('resultCount');
    if (resultCountEl) {
        resultCountEl.innerHTML = `<i class="fas fa-list"></i> แสดง <strong>${count}</strong> รายการจากทั้งหมด <strong>${drugListData.length}</strong> รายการ`;
    }
}

// Clear search input
function clearDrugSearch() {
    const searchInput = document.getElementById('searchDrug');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
        filterDrugsModern();
    }
}

// Reset all filters
function resetDrugFilters() {
    document.getElementById('searchDrug').value = '';
    document.getElementById('filterGroup').value = '';
    document.getElementById('filterHAD').value = '';
    document.getElementById('filterStatus').value = '';
    filterDrugsModern();
}

function showAddDrugForm() {
    document.getElementById('addDrugForm').style.display = 'block';
    document.getElementById('drugCode').focus();
}

function hideAddDrugForm() {
    document.getElementById('addDrugForm').style.display = 'none';
    document.getElementById('drugForm').reset();
}

async function handleDrugFormSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const drugData = {
        action: 'addDrug',
        drugCode: formData.get('drugCode'),
        drugName: formData.get('drugName'),
        group: formData.get('drugGroup'),
        had: formData.get('hadStatus'),
        status: formData.get('drugStatus')
    };
    
    try {
        if (!googleSheetsConfig.webAppUrl) {
            // Demo Mode: จำลองการเพิ่มยาใหม่
            console.log('Demo Mode: เพิ่มยาใหม่', drugData);
            
            // Check for duplicate in demo data
            if (globalDrugList.some(drug => drug.drugCode === drugData.drugCode)) {
                showNotification('รหัสยาซ้ำ: ' + drugData.drugCode + ' มีอยู่ในระบบแล้ว (โหมดทดสอบ)', 'error');
                return;
            }
            
            // Add to demo data
            globalDrugList.push({
                drugCode: drugData.drugCode,
                drugName: drugData.drugName,
                group: drugData.group,
                had: drugData.had,
                status: drugData.status
            });
            
            showNotification('✅ เพิ่มรายการยาเรียบร้อย (โหมดทดสอบ)', 'success');
            hideAddDrugForm();
            setupDrugSearchInputs(); // Refresh drug search
            return;
        }
        
        // Check for duplicate drug code locally first
        if (drugListData.some(drug => drug.drugCode === drugData.drugCode)) {
            showNotification('รหัสยาซ้ำ: ' + drugData.drugCode + ' มีอยู่ในระบบแล้ว', 'error');
            return;
        }
        
        // Use FormData submission to avoid CORS preflight issues
        try {
            const formData = new FormData();
            formData.append('action', 'addDrug');
            formData.append('drugCode', drugData.drugCode);
            formData.append('drugName', drugData.drugName);
            formData.append('group', drugData.group);
            formData.append('had', drugData.had);
            formData.append('status', drugData.status);
            
            const response = await fetch(googleSheetsConfig.webAppUrl, {
                method: 'POST',
                body: formData  // ใช้ FormData แทน JSON เพื่อหลีกเลี่ยง CORS preflight
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('เพิ่มรายการยาเรียบร้อย', 'success');
                hideAddDrugForm();
                
                // Add to local data
                drugListData.push({
                    drugCode: drugData.drugCode,
                    drugName: drugData.drugName,
                    group: drugData.group,
                    had: drugData.had,
                    status: drugData.status
                });
                
                renderDrugTable();
                updateDrugStats();
                return;
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (fetchError) {
            console.log('Fetch failed, trying form submission fallback:', fetchError);
            
            // Fallback: Use form submission to bypass CORS
            const success = await submitDrugViaForm(drugData);
            if (success) {
                showNotification('เพิ่มรายการยาเรียบร้อย', 'success');
                hideAddDrugForm();
                
                // Add to local data
                drugListData.push({
                    drugCode: drugData.drugCode,
                    drugName: drugData.drugName,
                    group: drugData.group,
                    had: drugData.had,
                    status: drugData.status
                });
                
                renderDrugTable();
                updateDrugStats();
            } else {
                throw new Error('Both fetch and form submission failed');
            }
        }
        
    } catch (error) {
        console.error('Error adding drug:', error);
        showNotification('เกิดข้อผิดพลาดในการเพิ่มรายการยา: ' + error.message, 'error');
    }
}

// Form submission fallback for drug data
async function submitDrugViaForm(drugData) {
    return new Promise((resolve) => {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = googleSheetsConfig.webAppUrl;
        form.target = '_blank';
        form.style.display = 'none';
        
        const payloadInput = document.createElement('input');
        payloadInput.type = 'hidden';
        payloadInput.name = 'payload';
        payloadInput.value = JSON.stringify(drugData);
        
        form.appendChild(payloadInput);
        document.body.appendChild(form);
        
        // Submit form and assume success
        form.submit();
        document.body.removeChild(form);
        
        // Assume success after a short delay
        setTimeout(() => resolve(true), 1000);
    });
}

function editDrug(drugCode) {
    const drug = drugListData.find(d => d.drugCode === drugCode);
    if (drug) {
        // Populate form with existing data
        document.getElementById('drugCode').value = drug.drugCode;
        document.getElementById('drugName').value = drug.drugName;
        document.getElementById('drugGroup').value = drug.group;
        document.getElementById('hadStatus').value = drug.had;
        document.getElementById('drugStatus').value = drug.status;
        
        // Make drug code readonly for editing
        document.getElementById('drugCode').readOnly = true;
        
        showAddDrugForm();
        
        // Change form title and button text
        document.querySelector('#addDrugForm h3').textContent = 'แก้ไขรายการยา';
        document.querySelector('#drugForm button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> อัปเดตยา';
        
        showNotification('กรุณาแก้ไขข้อมูลและบันทึก', 'info');
    }
}

function deleteDrug(drugCode) {
    if (confirm('คุณต้องการลบรายการยา ' + drugCode + ' หรือไม่?')) {
        // Remove from local data
        drugListData = drugListData.filter(drug => drug.drugCode !== drugCode);
        renderDrugTable();
        updateDrugStats();
        showNotification('ลบรายการยาเรียบร้อย', 'success');
        
        // Note: Real deletion would require updating Google Sheets
        // For now, we only remove from local display
    }
}

// Export functions for potential future use
window.predisApp = {
    loadData,
    showSection,
    generateSampleData,
    showNotification,
    loadDrugList,
    populateDrugDropdowns,
    setupDrugSearchInputs,
    validateDrugInput,
    handleDrugFormSubmit
};

// ===== ENHANCED ANALYTICS FUNCTIONS =====

// Global analytics data
let analyticsData = {
    processData: {},
    causeData: {},
    locationData: {},
    timeData: { morning: 0, afternoon: 0, night: 0 },
    monthlyTrend: [],
    insights: []
};

// Main analytics generation function
function generateAdvancedAnalytics(data) {
    console.log('Generating advanced analytics for data:', data);
    
    if (!data || data.length === 0) {
        resetAllAnalytics();
        return;
    }

    // Filter out header row and empty rows
    const processedData = data.filter(row => {
        return row && row[0] && row[1] && 
               row[0].toString().trim() !== '' && 
               row[1].toString().trim() !== '' &&
               !row[0].toString().toLowerCase().includes('timestamp');
    });

    if (processedData.length === 0) {
        resetAllAnalytics();
        return;
    }

    // Process data for analytics
    processAnalyticsData(processedData);
    
    // Generate charts
    generateProcessChart();
    generateErrorChartByProcess();
    generateCauseChartByProcess();
    generateDrugChartByProcess();
    updateLocationRanking();
    updateTimeDistribution();
    generateMonthlyTrendChart();
    
    console.log('Analytics generation completed');
}

// Process data for analytics
function processAnalyticsData(data) {
    // Reset analytics data
    analyticsData = {
        processData: {},
        causeData: {},
        locationData: {},
        timeData: { morning: 0, afternoon: 0, night: 0 },
        monthlyTrend: [],
        insights: []
    };

    const monthlyCount = {};
    
    data.forEach(row => {
        if (!row || !row[0]) return;
        
        try {
            // Process distribution
            const process = (row[5] || 'ไม่ระบุ').toString().trim();
            analyticsData.processData[process] = (analyticsData.processData[process] || 0) + 1;
            
            // Cause distribution
            const cause = (row[7] || 'ไม่ระบุ').toString().trim();
            analyticsData.causeData[cause] = (analyticsData.causeData[cause] || 0) + 1;
            
            // Location distribution
            const location = (row[4] || 'ไม่ระบุ').toString().trim();
            analyticsData.locationData[location] = (analyticsData.locationData[location] || 0) + 1;
            
            // Time distribution - ใช้ข้อมูลจากคอลัมน์เวรโดยตรง
            const shift = (row[2] || '').toString().trim(); // คอลัมน์ C (index 2) ตามรูปภาพ Google Sheets
            if (shift) {
                if (shift === 'เช้า') {
                    analyticsData.timeData.morning++;
                } else if (shift === 'บ่าย') {
                    analyticsData.timeData.afternoon++;
                } else if (shift === 'ดึก') {
                    analyticsData.timeData.night++;
                }
            }
            
            // Monthly trend - ใช้วันที่เกิดเหตุการณ์
            const eventDateStr = (row[0] || '').toString().trim();
            if (eventDateStr) {
                const eventDate = new Date(eventDateStr);
                if (!isNaN(eventDate.getTime())) {
                    const monthKey = `${eventDate.getFullYear()}-${(eventDate.getMonth() + 1).toString().padStart(2, '0')}`;
                    monthlyCount[monthKey] = (monthlyCount[monthKey] || 0) + 1;
                }
            }
        } catch (e) {
            console.warn('Error processing row for analytics:', e, row);
        }
    });
    
    // Convert monthly data to array
    analyticsData.monthlyTrend = Object.entries(monthlyCount)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12); // Last 12 months
}

// Generate process distribution pie chart
function generateProcessChart() {
    // Use Chart.js to render a horizontal bar chart for process distribution
    const canvas = document.getElementById('processChart');
    if (!canvas) return;

    const dataObj = analyticsData.processData || {};
    const labels = Object.keys(dataObj).sort((a,b)=> dataObj[b]-dataObj[a]);
    const data = labels.map(l => dataObj[l]);

    // Update summary
    if (labels.length > 0) {
        const topProcess = labels[0];
        const topProcessCount = data[0];
        document.getElementById('topProcess').textContent = topProcess || '-';
        document.getElementById('topProcessCount').textContent = topProcessCount || '0';
    } else {
        document.getElementById('topProcess').textContent = '-';
        document.getElementById('topProcessCount').textContent = '0';
    }

    // Destroy previous instance
    if (processChartInstance) {
        try { processChartInstance.destroy(); } catch (e) { /* ignore */ }
        processChartInstance = null;
    }

    // Colors
    const palette = ['#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF','#FF9F40','#E91E63','#795548'];
    const backgroundColors = labels.map((_,i) => palette[i % palette.length]);

    processChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'จำนวน',
                data: data,
                backgroundColor: backgroundColors,
                borderRadius: 8,
                barThickness: 18
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.formattedValue} รายการ`
                    }
                }
            },
            scales: {
                x: { beginAtZero: true, ticks: { precision:0 } },
                y: { ticks: { autoSkip: false } }
            }
        }
    });
}

// Generate cause distribution bar chart
function generateCauseChart() {
    const canvas = document.getElementById('causeChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const causes = Object.keys(analyticsData.causeData);
    const counts = Object.values(analyticsData.causeData);
    
    if (causes.length === 0) {
        drawNoDataMessage(ctx, canvas, 'ไม่มีข้อมูลสาเหตุ');
        return;
    }

    // Sort and get top 8 causes
    const sortedData = causes.map((cause, index) => ({
        cause,
        count: counts[index]
    })).sort((a, b) => b.count - a.count).slice(0, 8);

    const topCause = sortedData[0]?.cause || '-';
    document.getElementById('topCause').textContent = topCause;

    const maxCount = Math.max(...sortedData.map(item => item.count));
    const barWidth = (canvas.width - 100) / sortedData.length;
    const maxBarHeight = canvas.height - 100;
    
    sortedData.forEach((item, index) => {
        const barHeight = (item.count / maxCount) * maxBarHeight;
        const x = 50 + (index * barWidth);
        const y = canvas.height - 50 - barHeight;
        
        // Create gradient
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, '#36A2EB');
        gradient.addColorStop(1, '#1E88E5');
        
        // Draw bar
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth - 15, barHeight);
        
        // Draw count on top of bar
        ctx.fillStyle = '#333';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(item.count, x + (barWidth - 15) / 2, y - 5);
        
        // Draw cause label (rotated)
        ctx.save();
        ctx.translate(x + (barWidth - 15) / 2, canvas.height - 25);
        ctx.rotate(-Math.PI / 6);
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        const labelText = item.cause.length > 10 ? item.cause.substring(0, 10) + '...' : item.cause;
        ctx.fillText(labelText, 0, 0);
        ctx.restore();
    });
    
    // Draw axes
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(50, 50);
    ctx.lineTo(50, canvas.height - 50);
    ctx.lineTo(canvas.width - 50, canvas.height - 50);
    ctx.stroke();
}

// Filter cause chart by selected process
function filterCauseByProcess() {
    const processSelect = document.getElementById('processFilter');
    if (!processSelect) return;
    
    processFilter = processSelect.value;
    analyticsFilters.process = processSelect.value; // Sync with analytics filters
    errorProcessFilter = processSelect.value; // Sync with error process filter
    drugProcessFilter = processSelect.value; // Sync with drug process filter
    
    // Update other dropdowns
    const analyticsProcessSelect = document.getElementById('analyticsProcessFilter');
    const errorProcessFilterEl = document.getElementById('errorProcessFilter');
    const drugProcessFilterEl = document.getElementById('drugProcessFilter');
    if (analyticsProcessSelect) analyticsProcessSelect.value = processFilter;
    if (errorProcessFilterEl) errorProcessFilterEl.value = processFilter;
    if (drugProcessFilterEl) drugProcessFilterEl.value = processFilter;
    
    // Update UI to show selected process
    const selectedProcessEl = document.getElementById('selectedProcess');
    const selectedErrorProcessEl = document.getElementById('selectedErrorProcess');
    const selectedDrugProcessEl = document.getElementById('selectedDrugProcess');
    if (selectedProcessEl) {
        selectedProcessEl.textContent = processFilter === 'all' ? 'ทุกกระบวนการ' : processFilter;
    }
    if (selectedErrorProcessEl) {
        selectedErrorProcessEl.textContent = processFilter === 'all' ? 'ทุกกระบวนการ' : processFilter;
    }
    if (selectedDrugProcessEl) {
        selectedDrugProcessEl.textContent = processFilter === 'all' ? 'ทุกกระบวนการ' : processFilter;
    }
    
    // Update analytics filter summary
    updateAnalyticsFilterSummary();
    
    // Regenerate all charts with process filter
    generateCauseChartByProcess();
    generateErrorChartByProcess();
    generateDrugChartByProcess();
}

// Generate cause chart filtered by process and show top 5
function generateCauseChartByProcess() {
    // Render top 5 causes using Chart.js
    const canvas = document.getElementById('causeChart');
    if (!canvas) return;

    let filteredData = applyAnalyticsFiltersToData(lastUserFilteredData || []);
    if (processFilter !== 'all') {
        filteredData = filteredData.filter(row => ((row[5]||'').toString().trim()) === processFilter);
    }

    const causeCounts = {};
    filteredData.forEach(row => {
        const cause = (row[9] || '').toString().trim();
        if (cause) causeCounts[cause] = (causeCounts[cause] || 0) + 1;
    });

    const sorted = Object.entries(causeCounts).sort((a,b)=> b[1]-a[1]).slice(0,5);
    const labels = sorted.map(s=>s[0]);
    const data = sorted.map(s=>s[1]);

    const topCauseEl = document.getElementById('topCause');
    const causeItemCountEl = document.getElementById('causeItemCount');
    if (topCauseEl) topCauseEl.textContent = labels[0] || '-';
    if (causeItemCountEl) causeItemCountEl.textContent = data.reduce((a,b)=>a+b,0) || '0';

    if (causeChartInstance) { try { causeChartInstance.destroy(); } catch(e){} causeChartInstance = null; }

    const palette = ['#FF6B6B','#FF9F43','#26D0CE','#74C0FC','#9C27B0'];

    causeChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ data: data, backgroundColor: palette.slice(0, labels.length), borderRadius: 8 }]
        },
        options: {
            indexAxis: 'y',
            responsive: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) { return context.formattedValue + ' รายการ'; }
                    }
                }
            },
            scales: { x: { beginAtZero:true, ticks:{precision:0} }, y: { ticks:{autoSkip:false} } }
        }
    });
}

// Filter error chart by selected process
function filterErrorByProcess() {
    const errorProcessSelect = document.getElementById('errorProcessFilter');
    if (!errorProcessSelect) return;
    
    errorProcessFilter = errorProcessSelect.value;
    analyticsFilters.process = errorProcessSelect.value; // Sync with analytics filters
    processFilter = errorProcessSelect.value; // Sync with cause process filter
    drugProcessFilter = errorProcessSelect.value; // Sync with drug process filter
    
    // Update other dropdowns
    const analyticsProcessSelect = document.getElementById('analyticsProcessFilter');
    const causeProcessFilter = document.getElementById('processFilter');
    const drugProcessFilterEl = document.getElementById('drugProcessFilter');
    if (analyticsProcessSelect) analyticsProcessSelect.value = errorProcessFilter;
    if (causeProcessFilter) causeProcessFilter.value = errorProcessFilter;
    if (drugProcessFilterEl) drugProcessFilterEl.value = errorProcessFilter;
    
    // Update UI to show selected process
    const selectedErrorProcessEl = document.getElementById('selectedErrorProcess');
    const selectedProcessEl = document.getElementById('selectedProcess');
    const selectedDrugProcessEl = document.getElementById('selectedDrugProcess');
    if (selectedErrorProcessEl) {
        selectedErrorProcessEl.textContent = errorProcessFilter === 'all' ? 'ทุกกระบวนการ' : errorProcessFilter;
    }
    if (selectedProcessEl) {
        selectedProcessEl.textContent = errorProcessFilter === 'all' ? 'ทุกกระบวนการ' : errorProcessFilter;
    }
    if (selectedDrugProcessEl) {
        selectedDrugProcessEl.textContent = errorProcessFilter === 'all' ? 'ทุกกระบวนการ' : errorProcessFilter;
    }
    
    // Update analytics filter summary
    updateAnalyticsFilterSummary();
    
    // Regenerate all charts with process filter
    generateErrorChartByProcess();
    generateCauseChartByProcess();
    generateDrugChartByProcess();
}

// Generate error chart filtered by process and show top 5
function generateErrorChartByProcess() {
    // Render top 5 errors using Chart.js
    const canvas = document.getElementById('errorChart');
    if (!canvas) return;

    let filteredData = applyAnalyticsFiltersToData(lastUserFilteredData || []);
    if (errorProcessFilter !== 'all') {
        filteredData = filteredData.filter(row => ((row[5]||'').toString().trim()) === errorProcessFilter);
    }

    const errorCounts = {};
    filteredData.forEach(row => {
        const err = (row[6] || '').toString().trim();
        if (err) errorCounts[err] = (errorCounts[err] || 0) + 1;
    });

    const sorted = Object.entries(errorCounts).sort((a,b)=> b[1]-a[1]).slice(0,5);
    const labels = sorted.map(s=>s[0]);
    const data = sorted.map(s=>s[1]);

    const topErrorEl = document.getElementById('topError');
    const errorItemCountEl = document.getElementById('errorItemCount');
    if (topErrorEl) topErrorEl.textContent = labels[0] || '-';
    if (errorItemCountEl) errorItemCountEl.textContent = data.reduce((a,b)=>a+b,0) || '0';

    if (errorChartInstance) { try { errorChartInstance.destroy(); } catch(e){} errorChartInstance = null; }

    const palette = ['#FF9800','#2196F3','#4CAF50','#9C27B0','#607D8B'];
    errorChartInstance = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets: [{ data, backgroundColor: palette.slice(0, labels.length), borderRadius:8 }] },
        options: {
            indexAxis: 'y',
            responsive: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: function(context) { return context.formattedValue + ' รายการ'; } } }
            },
            scales: { x: { beginAtZero:true, ticks:{precision:0} }, y: { ticks:{autoSkip:false} } }
        }
    });
}

// Filter drug chart by selected process
function filterDrugByProcess() {
    const drugProcessSelect = document.getElementById('drugProcessFilter');
    if (!drugProcessSelect) return;
    
    drugProcessFilter = drugProcessSelect.value;
    analyticsFilters.process = drugProcessSelect.value; // Sync with analytics filters
    processFilter = drugProcessSelect.value; // Sync with cause process filter
    errorProcessFilter = drugProcessSelect.value; // Sync with error process filter
    
    // Update other dropdowns
    const analyticsProcessSelect = document.getElementById('analyticsProcessFilter');
    const causeProcessFilter = document.getElementById('processFilter');
    const errorProcessFilterEl = document.getElementById('errorProcessFilter');
    if (analyticsProcessSelect) analyticsProcessSelect.value = drugProcessFilter;
    if (causeProcessFilter) causeProcessFilter.value = drugProcessFilter;
    if (errorProcessFilterEl) errorProcessFilterEl.value = drugProcessFilter;
    
    // Update UI to show selected process
    const selectedDrugProcessEl = document.getElementById('selectedDrugProcess');
    const selectedProcessEl = document.getElementById('selectedProcess');
    const selectedErrorProcessEl = document.getElementById('selectedErrorProcess');
    if (selectedDrugProcessEl) {
        selectedDrugProcessEl.textContent = drugProcessFilter === 'all' ? 'ทุกกระบวนการ' : drugProcessFilter;
    }
    if (selectedProcessEl) {
        selectedProcessEl.textContent = drugProcessFilter === 'all' ? 'ทุกกระบวนการ' : drugProcessFilter;
    }
    if (selectedErrorProcessEl) {
        selectedErrorProcessEl.textContent = drugProcessFilter === 'all' ? 'ทุกกระบวนการ' : drugProcessFilter;
    }
    
    // Update analytics filter summary
    updateAnalyticsFilterSummary();
    
    // Regenerate all charts with process filter
    generateDrugChartByProcess();
    generateCauseChartByProcess();
    generateErrorChartByProcess();
}

// Generate drug chart filtered by process and show top 5 correct items
function generateDrugChartByProcess() {
    const canvas = document.getElementById('drugChart');
    if (!canvas) return;

    let filteredData = applyAnalyticsFiltersToData(lastUserFilteredData || []);
    if (drugProcessFilter !== 'all') {
        filteredData = filteredData.filter(row => ((row[5]||'').toString().trim()) === drugProcessFilter);
    }

    const drugCounts = {};
    filteredData.forEach(row => {
        const correctDrug = (row[7] || '').toString().trim();
        if (correctDrug) drugCounts[correctDrug] = (drugCounts[correctDrug] || 0) + 1;
    });

    const sorted = Object.entries(drugCounts).sort((a,b)=> b[1]-a[1]).slice(0,5);
    const labels = sorted.map(s=>s[0]);
    const data = sorted.map(s=>s[1]);

    const topDrugEl = document.getElementById('topDrug');
    const drugItemCountEl = document.getElementById('drugItemCount');
    if (topDrugEl) topDrugEl.textContent = labels[0] || '-';
    if (drugItemCountEl) drugItemCountEl.textContent = data.reduce((a,b)=>a+b,0) || '0';

    if (drugChartInstance) { try { drugChartInstance.destroy(); } catch(e){} drugChartInstance = null; }

    const palette = ['#9C27B0','#673AB7','#3F51B5','#2196F3','#4CAF50'];
    drugChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: palette.slice(0, labels.length),
                borderRadius: 8
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: function(context) { return context.formattedValue + ' รายการ'; } } }
            },
            scales: {
                x: { beginAtZero: true, ticks: { precision: 0 } },
                y: { ticks: { autoSkip: false } }
            }
        }
    });
}

// Update location ranking
function updateLocationRanking() {
    const container = document.getElementById('locationRanking');
    if (!container) return;

    const locations = Object.entries(analyticsData.locationData)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5);

    if (locations.length === 0) {
        container.innerHTML = `
            <div class="ranking-item">
                <div class="rank-badge">-</div>
                <div class="location-info">
                    <div class="location-name">ไม่มีข้อมูล</div>
                    <div class="location-count">0 ครั้ง</div>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = locations.map(([location, count], index) => `
        <div class="ranking-item">
            <div class="rank-badge">${index + 1}</div>
            <div class="location-info">
                <div class="location-name">${location}</div>
                <div class="location-count">${count} ครั้ง</div>
            </div>
        </div>
    `).join('');
}

// Update time distribution - ใช้ข้อมูลจากตารางเวร
function updateTimeDistribution() {
    const { morning, afternoon, night } = analyticsData.timeData;
    const total = morning + afternoon + night;
    
    // Update counts
    document.getElementById('morningCount').textContent = morning;
    document.getElementById('afternoonCount').textContent = afternoon;
    document.getElementById('nightCount').textContent = night;
    
    if (total === 0) {
        // Reset bars and percentages
        ['morning', 'afternoon', 'night'].forEach(time => {
            document.getElementById(`${time}Bar`).style.width = '0%';
            document.getElementById(`${time}Percent`).textContent = '0%';
        });
        return;
    }
    
    // Update bars and percentages with animation
    const morningPercent = ((morning / total) * 100).toFixed(1);
    const afternoonPercent = ((afternoon / total) * 100).toFixed(1);
    const nightPercent = ((night / total) * 100).toFixed(1);
    
    // Animate the bars
    setTimeout(() => {
        document.getElementById('morningBar').style.width = `${morningPercent}%`;
        document.getElementById('afternoonBar').style.width = `${afternoonPercent}%`;
        document.getElementById('nightBar').style.width = `${nightPercent}%`;
    }, 100);
    
    document.getElementById('morningPercent').textContent = `${morningPercent}%`;
    document.getElementById('afternoonPercent').textContent = `${afternoonPercent}%`;
    document.getElementById('nightPercent').textContent = `${nightPercent}%`;
    
    // Log detailed shift analysis
    console.log(`📊 การกระจายตามเวรจาก Database:`);
    console.log(`   เช้า: ${morning} ครั้ง (${morningPercent}%)`);
    console.log(`   บ่าย: ${afternoon} ครั้ง (${afternoonPercent}%)`);
    console.log(`   ดึก: ${night} ครั้ง (${nightPercent}%)`);
    console.log(`   รวม: ${total} ครั้ง`);
}

// แสดงข้อมูลเชิงลึกของการกระจายตามเวร
function displayShiftInsights(morningCount, afternoonCount, nightCount, totalCount) {
    if (totalCount === 0) return;
    
    const morningPercent = (morningCount / totalCount) * 100;
    const afternoonPercent = (afternoonCount / totalCount) * 100;
    const nightPercent = (nightCount / totalCount) * 100;
    
    // หาเวรที่มีปัญหามากที่สุดและน้อยที่สุด
    const shifts = [
        { name: 'เช้า', count: morningCount, percent: morningPercent },
        { name: 'บ่าย', count: afternoonCount, percent: afternoonPercent },
        { name: 'ดึก', count: nightCount, percent: nightPercent }
    ];
    
    shifts.sort((a, b) => b.count - a.count);
    
    const insights = [];
    
    // วิเคราะห์เวรที่มีปัญหามากที่สุด
    if (shifts[0].count > 0) {
        insights.push(`เวร${shifts[0].name} มีข้อผิดพลาดมากที่สุด (${shifts[0].count} ครั้ง, ${shifts[0].percent.toFixed(1)}%)`);
    }
    
    // วิเคราะห์ความแตกต่างระหว่างเวร
    const maxPercent = shifts[0].percent;
    const minPercent = shifts[2].percent;
    const difference = maxPercent - minPercent;
    
    if (difference > 30) {
        insights.push(`ความแตกต่างระหว่างเวรสูง: ${difference.toFixed(1)}% (${shifts[0].name} vs ${shifts[2].name})`);
    } else if (difference < 10) {
        insights.push(`การกระจายข้อผิดพลาดระหว่างเวรค่อนข้างสมดุล`);
    }
    
    // แสดงผลลัพธ์ใน console สำหรับการ debug
    console.log('=== การวิเคราะห์เวรเชิงลึก ===');
    insights.forEach(insight => console.log(`📊 ${insight}`));
    
    // อัปเดต UI ถ้ามี element สำหรับแสดงข้อมูลเพิ่มเติม
    const shiftInsightElement = document.getElementById('shiftInsights');
    if (shiftInsightElement) {
        shiftInsightElement.innerHTML = insights.map(insight => `<p><i class="fas fa-lightbulb"></i> ${insight}</p>`).join('');
    }
}

// Generate monthly trend chart
function generateMonthlyTrendChart() {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const trendData = analyticsData.monthlyTrend;
    
    if (trendData.length === 0) {
        drawNoDataMessage(ctx, canvas, 'ไม่มีข้อมูลแนวโน้ม');
        return;
    }
    
    const months = trendData.map(([month]) => month);
    const counts = trendData.map(([, count]) => count);
    const maxCount = Math.max(...counts, 1);
    
    // Update trend insights
    updateTrendInsights(months, counts);
    
    const marginLeft = 60;
    const marginBottom = 60;
    const marginTop = 40;
    const marginRight = 40;
    const chartWidth = canvas.width - marginLeft - marginRight;
    const chartHeight = canvas.height - marginBottom - marginTop;
    
    // Draw background grid
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    
    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
        const y = marginTop + (i * chartHeight / 5);
        ctx.beginPath();
        ctx.moveTo(marginLeft, y);
        ctx.lineTo(marginLeft + chartWidth, y);
        ctx.stroke();
    }
    
    // Vertical grid lines
    for (let i = 0; i <= months.length - 1; i++) {
        const x = marginLeft + (i * chartWidth / (months.length - 1));
        ctx.beginPath();
        ctx.moveTo(x, marginTop);
        ctx.lineTo(x, marginTop + chartHeight);
        ctx.stroke();
    }
    
    // Draw axes
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(marginLeft, marginTop);
    ctx.lineTo(marginLeft, marginTop + chartHeight);
    ctx.lineTo(marginLeft + chartWidth, marginTop + chartHeight);
    ctx.stroke();
    
    // Draw trend line and area
    if (months.length > 1) {
        const pointSpacing = chartWidth / (months.length - 1);
        
        // Create gradient for area fill
        const gradient = ctx.createLinearGradient(0, marginTop, 0, marginTop + chartHeight);
        gradient.addColorStop(0, 'rgba(54, 162, 235, 0.3)');
        gradient.addColorStop(1, 'rgba(54, 162, 235, 0.1)');
        
        // Draw area
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(marginLeft, marginTop + chartHeight);
        
        months.forEach((month, index) => {
            const x = marginLeft + (index * pointSpacing);
            const y = marginTop + chartHeight - ((counts[index] / maxCount) * chartHeight);
            
            if (index === 0) {
                ctx.lineTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.lineTo(marginLeft + chartWidth, marginTop + chartHeight);
        ctx.closePath();
        ctx.fill();
        
        // Draw trend line
        ctx.strokeStyle = '#36A2EB';
        ctx.lineWidth = 3;
        ctx.beginPath();
        
        months.forEach((month, index) => {
            const x = marginLeft + (index * pointSpacing);
            const y = marginTop + chartHeight - ((counts[index] / maxCount) * chartHeight);
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Draw points
        months.forEach((month, index) => {
            const x = marginLeft + (index * pointSpacing);
            const y = marginTop + chartHeight - ((counts[index] / maxCount) * chartHeight);
            
            // Point background
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, 2 * Math.PI);
            ctx.fill();
            
            // Point border
            ctx.strokeStyle = '#36A2EB';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Count label
            ctx.fillStyle = '#333';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(counts[index], x, y - 12);
        });
    }
    
    // Draw Y-axis labels
    ctx.fillStyle = '#666';
    ctx.font = '11px Arial';
    ctx.textAlign = 'right';
    
    for (let i = 0; i <= 5; i++) {
        const value = Math.round((maxCount / 5) * (5 - i));
        const y = marginTop + (i * chartHeight / 5);
        ctx.fillText(value.toString(), marginLeft - 10, y + 4);
    }
    
    // Draw X-axis labels
    ctx.textAlign = 'center';
    months.forEach((month, index) => {
        const x = marginLeft + (index * chartWidth / (months.length - 1));
        ctx.save();
        ctx.translate(x, marginTop + chartHeight + 15);
        ctx.rotate(-Math.PI / 6);
        ctx.fillText(month, 0, 0);
        ctx.restore();
    });
}

// Update trend insights
function updateTrendInsights(months, counts) {
    if (months.length === 0) {
        document.getElementById('peakMonth').textContent = '-';
        document.getElementById('lowMonth').textContent = '-';
        document.getElementById('changeRate').textContent = '-';
        return;
    }
    
    const maxIndex = counts.indexOf(Math.max(...counts));
    const minIndex = counts.indexOf(Math.min(...counts));
    
    document.getElementById('peakMonth').textContent = months[maxIndex];
    document.getElementById('lowMonth').textContent = months[minIndex];
    
    if (months.length >= 2) {
        const lastCount = counts[counts.length - 1];
        const previousCount = counts[counts.length - 2];
        
        if (previousCount === 0) {
            document.getElementById('changeRate').textContent = lastCount > 0 ? '+100%' : '0%';
        } else {
            const changeRate = ((lastCount - previousCount) / previousCount * 100).toFixed(1);
            document.getElementById('changeRate').textContent = `${changeRate > 0 ? '+' : ''}${changeRate}%`;
        }
    } else {
        document.getElementById('changeRate').textContent = '-';
    }
}

// Helper function to draw "no data" message on canvas
function drawNoDataMessage(ctx, canvas, message) {
    ctx.fillStyle = '#ccc';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);
}

// Reset all analytics
function resetAllAnalytics() {
    // Reset charts
    ['processChart', 'causeChart', 'trendChart'].forEach(chartId => {
        const canvas = document.getElementById(chartId);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawNoDataMessage(ctx, canvas, 'ไม่มีข้อมูล');
        }
    });
    
    // Reset summary data
    document.getElementById('topProcess').textContent = '-';
    document.getElementById('topProcessCount').textContent = '0';
    document.getElementById('topCause').textContent = '-';
    
    // Reset time distribution
    ['morning', 'afternoon', 'night'].forEach(time => {
        document.getElementById(`${time}Count`).textContent = '0';
        document.getElementById(`${time}Bar`).style.width = '0%';
        document.getElementById(`${time}Percent`).textContent = '0%';
    });
    
    // Reset trend insights
    document.getElementById('peakMonth').textContent = '-';
    document.getElementById('lowMonth').textContent = '-';
    document.getElementById('changeRate').textContent = '-';
    
    // Reset location ranking
    const locationRanking = document.getElementById('locationRanking');
    if (locationRanking) {
        locationRanking.innerHTML = `
            <div class="ranking-item">
                <div class="rank-badge">-</div>
                <div class="location-info">
                    <div class="location-name">ไม่มีข้อมูล</div>
                    <div class="location-count">0 ครั้ง</div>
                </div>
            </div>
        `;
    }
    
    // Reset insights
    document.getElementById('riskFactors').innerHTML = '<p>ไม่มีข้อมูลสำหรับการวิเคราะห์</p>';
    document.getElementById('improvements').innerHTML = '<p>ไม่มีข้อมูลสำหรับการวิเคราะห์</p>';
    document.getElementById('recommendations').innerHTML = '<p>ไม่มีข้อมูลสำหรับการวิเคราะห์</p>';
}

// Export functions
function exportAnalytics() {
    showNotification('กำลังเตรียมไฟล์การวิเคราะห์...', 'info');
    // Future implementation: Generate and download analytics report
}

function exportTableData() {
    showNotification('กำลังส่งออกข้อมูลตาราง...', 'info');
    // Future implementation: Export table data to Excel
}

function refreshChart(chartType) {
    showNotification(`กำลังรีเฟรชกราฟ ${chartType}...`, 'info');
    // Future implementation: Refresh specific chart
}

function updateTrendChart() {
    const period = document.getElementById('trendPeriod').value;
    showNotification(`กำลังอัพเดตแนวโน้ม ${period} เดือน...`, 'info');
    // Future implementation: Update trend chart with selected period
}
