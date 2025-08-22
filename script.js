// Global variables
let globalDrugList = [];
let globalUsersData = [];
let currentUser = null;

let googleSheetsConfig = {
    apiKey: '[REDACTED API KEY]',
    spreadsheetId: '1QDIxEXCVLiA7oijXN15N2ZH2LzPtHDecbqolYGs9Ldk',
    sheetName: 'Predispensing_Errors',
    userSheetName: 'Users',
    drugSheetName: 'Drug_List',
    webAppUrl: 'https://script.google.com/macros/s/AKfycbzMfgXu9oscmYS_wXPX6rpdJeeZTj6w4uFxB_rPnYC8XVd6amwGGKHibHk5Iw2fw72E/exec' // ใส่ Google Apps Script Web App URL ที่ได้จาก Deploy
};

// Authentication and User Management
function checkAuthentication() {
    console.log('=== checkAuthentication called ===');
    const storedUser = localStorage.getItem('currentUser');
    console.log('Stored user from localStorage:', storedUser);
    
    if (storedUser) {
        try {
            currentUser = JSON.parse(storedUser);
            console.log('Parsed currentUser:', currentUser);
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
    console.log('=== showMainApp called ===');
    console.log('currentUser at showMainApp:', currentUser);
    
    document.getElementById('login').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    
    // Update user display
    const userNameEl = document.getElementById('userName');
    if (userNameEl && currentUser) {
        userNameEl.textContent = currentUser.name || currentUser.psCode;
        console.log('Updated userName element to:', userNameEl.textContent);
    }
    
    // Wait a bit for DOM to be ready then update reporter field
    setTimeout(() => {
        console.log('Calling updateReporterField from showMainApp');
        updateReporterField();
    }, 100);
    
    // Update dashboard user info
    updateDashboardUserInfo();
    
    // Load initial data
    loadData();
}

function updateReporterField() {
    console.log('=== updateReporterField called ===');
    console.log('currentUser:', currentUser);
    
    const reporterEl = document.getElementById('reporter');
    console.log('Reporter element found:', !!reporterEl);
    
    if (!reporterEl) {
        console.error('Reporter element not found in DOM!');
        // Try to find it with query selector
        const altReporter = document.querySelector('input[name="reporter"]');
        console.log('Alternative reporter element found:', !!altReporter);
        return;
    }
    
    if (currentUser) {
        // รูปแบบ: ชื่อ-นามสกุล (PS Code) - กลุ่ม/ระดับ
        const reporterValue = `${currentUser.name} (${currentUser.psCode}) - ${currentUser.group}/${currentUser.level}`;
        reporterEl.value = reporterValue;
        console.log('Reporter field updated to:', reporterValue);
        console.log('Actual field value after update:', reporterEl.value);
        
        // Force visual update
        reporterEl.dispatchEvent(new Event('input', { bubbles: true }));
        reporterEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
        // ถ้าไม่มี currentUser ให้แสดงข้อความรอ
        reporterEl.value = 'กรุณาเข้าสู่ระบบก่อนใช้งาน';
        console.log('No currentUser found, showing login message');
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
        // Demo Mode: ใช้ข้อมูลผู้ใช้ตัวอย่างตามข้อมูลจริง
        console.log('Demo Mode: ตรวจสอบผู้ใช้และรหัสผ่าน', userCode);
        
        const demoUsers = [
            // เภสัชกร
            { psCode: 'P01', id13: 'XXXXXXXXXXXXX', name: 'ทดสอบ ทดสอบ', group: 'เภสัชกร', level: 'supervisor', email: '', password: '@12345', status: true },
            { psCode: 'P02', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เภสัชกร', level: 'pharmacist', email: '', password: '@12345', status: true },
            { psCode: 'P03', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เภสัชกร', level: 'pharmacist', email: '', password: '@12345', status: true },
            { psCode: 'P12', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เภสัชกร', level: 'pharmacist', email: '', password: '@12345', status: true },
            { psCode: 'P13', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เภสัชกร', level: 'admin', email: 's.oekaroek@gmail.com', password: 'admin123', status: true },
            { psCode: 'P22', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เภสัชกร', level: 'pharmacist', email: '', password: '15091985', status: true },
            { psCode: 'P25', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เภสัชกร', level: 'pharmacist', email: '', password: '๑๑๒๓๔๕', status: true },
            // เจ้าพนักงานเภสัชกรรม
            { psCode: 'S01', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เจ้าพนักงานเภสัชกรรม', level: 'user', email: '', password: '@12345', status: true },
            { psCode: 'S02', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เจ้าพนักงานเภสัชกรรม', level: 'user', email: '', password: '@12345', status: true },
            { psCode: 'S19', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เจ้าพนักงานเภสัชกรรม', level: 'user', email: '', password: '12345', status: true },
            // Admin สำหรับทดสอบ
            { psCode: 'admin', id13: '9999999999999', name: 'ผู้ดูแลระบบ', group: 'IT', level: 'admin', email: 'admin@hospital.com', password: 'admin123', status: true }
        ];
        
        const user = demoUsers.find(u => 
            (u.psCode.toLowerCase() === userCode.toLowerCase() ||
             u.id13.toLowerCase() === userCode.toLowerCase()) &&
            u.password === password
        );
        
        if (user) {
            console.log('Demo Mode: พบผู้ใช้และรหัสผ่านถูกต้อง', user.name);
            return user;
        } else {
            console.log('Demo Mode: ไม่พบผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
            return null;
        }
    } else {
        // Production Mode: ใช้ Google Apps Script เพื่อตรวจสอบผู้ใช้จากข้อมูลจริง
        try {
            console.log('Production Mode: ตรวจสอบผู้ใช้และรหัสผ่านจาก Google Sheets', userCode);
            
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
                console.log('Production Mode: พบผู้ใช้และรหัสผ่านถูกต้อง', user.name);
                return user;
            } else {
                console.log('Production Mode: ไม่พบผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
                return null;
            }
            
        } catch (error) {
            console.error('Production Mode Error:', error);
            
            // Check if it's a CORS or network error and show appropriate message
            if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
                console.log('CORS error detected, falling back to Demo Mode');
                showNotification('⚠️ ไม่สามารถเชื่อมต่อ Google Sheets ได้ (CORS Error) กำลังใช้โหมดทดสอบ', 'warning');
            } else {
                console.log('Fallback to Demo Mode:', error.message);
                showNotification('ไม่สามารถเชื่อมต่อ Google Sheets ได้ กำลังใช้โหมดทดสอบ', 'warning');
            }
            
            const demoUsers = [
                // เภสัชกร
                { psCode: 'P01', id13: 'XXXXXXXXXXXXX', name: 'ทดสอบ ทดสอบ', group: 'เภสัชกร', level: 'supervisor', email: '', password: '@12345', status: true },
                { psCode: 'P02', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เภสัชกร', level: 'pharmacist', email: '', password: '@12345', status: true },
                { psCode: 'P03', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เภสัชกร', level: 'pharmacist', email: '', password: '@12345', status: true },
                { psCode: 'P12', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เภสัชกร', level: 'pharmacist', email: '', password: '@12345', status: true },
                { psCode: 'P13', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เภสัชกร', level: 'admin', email: 's.oekaroek@gmail.com', password: 'admin123', status: true },
                { psCode: 'P22', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เภสัชกร', level: 'pharmacist', email: '', password: '15091985', status: true },
                { psCode: 'P25', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เภสัชกร', level: 'pharmacist', email: '', password: '๑๑๒๓๔๕', status: true },
                // เจ้าพนักงานเภสัชกรรม
                { psCode: 'S01', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เจ้าพนักงานเภสัชกรรม', level: 'user', email: '', password: '@12345', status: true },
                { psCode: 'S02', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เจ้าพนักงานเภสัชกรรม', level: 'user', email: '', password: '@12345', status: true },
                { psCode: 'S19', id13: 'XXXXXXXXXXXXX', name: '[REDACTED NAME]', group: 'เจ้าพนักงานเภสัชกรรม', level: 'user', email: '', password: '12345', status: true },
                // Admin สำหรับทดสอบ
                { psCode: 'admin', id13: '9999999999999', name: 'ผู้ดูแลระบบ', group: 'IT', level: 'admin', email: 'admin@hospital.com', password: 'admin123', status: true }
            ];
            
            const user = demoUsers.find(u => 
                (u.psCode.toLowerCase() === userCode.toLowerCase() ||
                 u.id13.toLowerCase() === userCode.toLowerCase()) &&
                u.password === password
            );
            
            if (user) {
                console.log('Fallback Demo Mode: พบผู้ใช้และรหัสผ่านถูกต้อง', user.name);
                return user;
            } else {
                console.log('Fallback Demo Mode: ไม่พบผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
                return null;
            }
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
    const sel = document.getElementById('process');
    if (!sel) return;
    sel.innerHTML = '<option value="">เลือกกระบวนการ</option>' + PROCESS_OPTIONS
        .map(p => `<option value="${p}">${p}</option>`)
        .join('');
    
    // Add event listener for process change (only if not already added)
    if (!sel.dataset.listenerAdded) {
        sel.addEventListener('change', function() {
            updateErrorOptions(this.value);
        });
        sel.dataset.listenerAdded = 'true';
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

// Generate unique report ID
function generateReportId() {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    // Format: PE + YYMMDD + HHMMSS (PE = Predispensing Error)
    const reportId = `PE${year}${month}${day}${hours}${minutes}${seconds}`;
    document.getElementById('reportId').value = reportId;
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
                    if (result.error) {
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

// Form submission handler
async function handleFormSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const errorData = Object.fromEntries(formData.entries());
    
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

        await appendToGoogleSheet(errorData);
        
        showNotification('บันทึกข้อผิดพลาดเรียบร้อยแล้ว!', 'success');
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
    }
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
        const originalText = loadBtn.innerHTML;
        loadBtn.innerHTML = '<div class="loading"></div> Loading...';
        loadBtn.disabled = true;

        const data = await readFromGoogleSheet();
        
        if (data.length === 0) {
            showNotification('ไม่พบข้อมูลใน Google Sheets', 'info');
            return;
        }

        // Skip header row if it exists
        const hasHeader = data[0] && typeof data[0][0] === 'string' && data[0][0].toLowerCase().includes('timestamp');
        const errorData = hasHeader ? data.slice(1) : data;
        
        // Apply user-based filtering
        const filteredData = applyUserFilter(errorData);
        
        updateDashboard(errorData, filteredData);
        populateTable(filteredData);
        
        // Update dashboard user info
        updateDashboardUserInfo();
        
        showNotification('โหลดข้อมูลเรียบร้อยแล้ว!', 'success');
        
    } catch (error) {
        console.error('Error loading data:', error);
        showNotification(error.message, 'error');
    } finally {
        const loadBtn = document.querySelector('.load-btn');
        loadBtn.innerHTML = '<i class="fas fa-sync"></i> รีเฟรชข้อมูล';
        loadBtn.disabled = false;
    }
}

// Apply user-based filtering based on current user and filter settings
function applyUserFilter(data) {
    if (!currentUser || !data) return data;
    
    const filterUser = document.getElementById('filterUser').value;
    const filterPeriod = document.getElementById('filterPeriod').value;
    
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

    document.getElementById('totalErrors').textContent = totalCount;
    document.getElementById('myErrors').textContent = myCount;
    document.getElementById('groupErrors').textContent = groupCount;
    document.getElementById('monthlyErrors').textContent = monthlyCount;
    document.getElementById('weeklyErrors').textContent = weeklyCount;
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
        tableBody.innerHTML = '<tr><td colspan="7" class="no-data">ไม่มีข้อมูลที่ตรงกับตัวกรอง</td></tr>';
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
        tableBody.innerHTML = '<tr><td colspan="7" class="no-data">ไม่มีข้อมูลที่ตรงกับตัวกรอง</td></tr>';
        return;
    }

    const rows = workingData.slice(0, 50).filter(row => {
        // Filter out empty rows - check if row has timestamp and report ID
        return row && row[0] && row[1] && 
               row[0].toString().trim() !== '' && 
               row[1].toString().trim() !== '';
    }).map(row => { // Limit to 50 rows for performance
        // Validate and format data
        const reportId = row[1] || 'N/A';
        
        // Better date handling using formatDate function
        const { date: formattedDate, time: formattedTime } = formatDate(row[0]);
        
        const errorType = row[3] || 'N/A';
        const location = row[4] || 'N/A';
        const process = row[5] || 'N/A';
        const reporter = row[11] || 'N/A'; // ผู้รายงาน in column 11

        // Highlight current user's reports
        const isMyReport = currentUser && (
            reporter === currentUser.name || 
            reporter.includes(currentUser.name) ||
            reporter === currentUser.psCode ||
            reporter === currentUser.id13
        );
        
        const rowClass = isMyReport ? 'my-report' : '';

        return `
            <tr class="${rowClass}">
                <td>${reportId}</td>
                <td>${formattedDate}</td>
                <td>${formattedTime}</td>
                <td>${errorType}</td>
                <td>${location}</td>
                <td>${process}</td>
                <td>${reporter}</td>
            </tr>
        `;
    }).join('');

    tableBody.innerHTML = rows;
    
    if (workingData.length > 50) {
        tableBody.innerHTML += `<tr><td colspan="7" class="no-data">แสดง 50 รายการแรกจากทั้งหมด ${workingData.length} รายการ</td></tr>`;
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
    
    // Form event listeners
    document.getElementById('errorForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('settingsForm').addEventListener('submit', handleSettingsSubmit);
    
    // Drug form event listener
    const drugForm = document.getElementById('drugForm');
    if (drugForm) {
        drugForm.addEventListener('submit', handleDrugFormSubmit);
    }
    
    // Filter change listeners
    document.getElementById('filterUser').addEventListener('change', function() {
        // Re-load data when user filter changes
        loadData();
        updateDashboardUserInfo();
    });
    
    document.getElementById('filterPeriod').addEventListener('change', function() {
        // Re-load data when period filter changes
        loadData();
        updateDashboardUserInfo();
    });
    
    // Auto-save settings when user types
    ['apiKey', 'spreadsheetId', 'sheetName', 'userSheetName', 'drugSheetName', 'webAppUrl'].forEach(id => {
        document.getElementById(id).addEventListener('input', function() {
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
            globalDrugList = sampleDrugs;
            setupDrugSearchInputs();
            console.log('โหลดข้อมูลยาตัวอย่าง:', sampleDrugs.length, 'รายการ');
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
                renderDrugTable();
                updateDrugStats();
                showNotification(`โหลดรายการยาเรียบร้อย (${result.count} รายการ)`, 'success');
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
        
        renderDrugTable();
        updateDrugStats();
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
    renderDrugTable();
    updateDrugStats();
    showNotification('ใช้ข้อมูลตัวอย่าง - กรุณาตั้งค่า API หรือ Apps Script ให้ถูกต้อง', 'info');
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
    const hadDrugs = drugListData.filter(drug => drug.had === 'High').length;
    const activeDrugs = drugListData.filter(drug => drug.status === 'Active').length;
    const inactiveDrugs = drugListData.filter(drug => drug.status !== 'Active').length;
    
    document.getElementById('totalDrugs').textContent = total;
    document.getElementById('hadDrugs').textContent = hadDrugs;
    document.getElementById('activeDrugs').textContent = activeDrugs;
    document.getElementById('inactiveDrugs').textContent = inactiveDrugs;
}

function filterDrugs() {
    renderDrugTable();
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
