// Config (localStorage), notification, การสลับ section, ค่าเริ่มต้นฟอร์ม
// โหลดเป็น classic script ตามลำดับใน JS_FILES (ดู sw.js / *.html)

let drugListData = [];
let drugSyncTimer = null;

// Load configuration from localStorage
function loadConfig() {
    const savedConfig = localStorage.getItem('predisConfig');
    if (savedConfig) {
        googleSheetsConfig = JSON.parse(savedConfig);
        googleSheetsConfig.webAppUrl = normalizeWebAppUrl(googleSheetsConfig.webAppUrl);
        googleSheetsConfig.sheetName = googleSheetsConfig.sheetName || 'Predispensing_Errors';
        googleSheetsConfig.userSheetName = googleSheetsConfig.userSheetName || 'Users';
        googleSheetsConfig.drugSheetName = googleSheetsConfig.drugSheetName || 'Drug_List';
        googleSheetsConfig.externalDrugSourceUrl = googleSheetsConfig.externalDrugSourceUrl || '';
        googleSheetsConfig.externalDrugSourceToken = googleSheetsConfig.externalDrugSourceToken || '';
        googleSheetsConfig.externalDrugSourceFormat = googleSheetsConfig.externalDrugSourceFormat || 'json';
        googleSheetsConfig.externalDrugDataPath = googleSheetsConfig.externalDrugDataPath || '';
        googleSheetsConfig.externalDrugAutoSyncMinutes = Number(googleSheetsConfig.externalDrugAutoSyncMinutes || 0);

        const setInputValue = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value;
        };

        setInputValue('apiKey', googleSheetsConfig.apiKey || '');
        setInputValue('spreadsheetId', googleSheetsConfig.spreadsheetId || '');
        setInputValue('sheetName', googleSheetsConfig.sheetName);
        setInputValue('userSheetName', googleSheetsConfig.userSheetName);
        setInputValue('drugSheetName', googleSheetsConfig.drugSheetName);
        setInputValue('webAppUrl', googleSheetsConfig.webAppUrl || '');
        setInputValue('externalDrugSourceUrl', googleSheetsConfig.externalDrugSourceUrl);
        setInputValue('externalDrugSourceToken', googleSheetsConfig.externalDrugSourceToken);
        setInputValue('externalDrugSourceFormat', googleSheetsConfig.externalDrugSourceFormat);
        setInputValue('externalDrugDataPath', googleSheetsConfig.externalDrugDataPath);
        setInputValue('externalDrugAutoSyncMinutes', googleSheetsConfig.externalDrugAutoSyncMinutes);

        saveConfig();
        updateExternalSyncStatus();
    } else {
        googleSheetsConfig.webAppUrl = LATEST_WEB_APP_URL;
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
    // If the section doesn't exist on this page, navigate to the correct page
    const targetSection = document.getElementById(sectionName);
    if (!targetSection) {
        navigateTo(null, sectionName);
        return;
    }

    document.querySelectorAll('.section').forEach(section =>
        section.classList.remove('active')
    );
    document.querySelectorAll('.nav-btn').forEach(btn =>
        btn.classList.remove('active')
    );

    if (targetSection) targetSection.classList.add('active');

    // เครื่องหมาย active หน้า nav ที่คลิก
    try { event.target.classList.add('active'); } catch (_) { }

    if (sectionName === 'form') {
        setTimeout(() => updateReporterField(), 100);
    } else if (sectionName === 'druglist') {
        loadDrugList();
    } else if (sectionName === 'dashboard') {
        loadData();
    } else if (sectionName === 'settings' || sectionName === 'users') {
        if (!hasRole('admin')) {
            showNotification('เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถเข้าถึงการตั้งค่า', 'warning');
            // Redirect to previous section
            const defaultSection = PAGE_SECTION_MAP[currentPage] || 'druglist';
            const defaultEl = document.getElementById(defaultSection);
            if (defaultEl) defaultEl.classList.add('active');
            return;
        }
        if (sectionName === 'users') {
            loadUserManagement();
            return;
        }
        // แสดง banner ถ้ายังไม่ได้ตั้งค่า webAppUrl
        const banner = document.getElementById('setupGuideBanner');
        if (banner) {
            banner.style.display = (!googleSheetsConfig.webAppUrl || !googleSheetsConfig.webAppUrl.trim()) ? 'block' : 'none';
        }
    }
}

// Initialize form with current date and generate report ID
function initializeForm() {
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const localDateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const localDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

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
