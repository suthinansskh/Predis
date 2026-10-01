// จุดเริ่มต้นของแอป (DOMContentLoaded) — โหลดเป็นไฟล์สุดท้าย
// โหลดเป็น classic script ตามลำดับใน JS_FILES (ดู sw.js / *.html)

document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM fully loaded — page:', currentPage);

    // Check authentication first
    if (checkAuthentication()) {
        // User is already logged in, initialize the app
        initializeApp();

        // Handle hash-based navigation for index.html (e.g., index.html#druglist)
        if ((currentPage === 'main' || currentPage === 'index') && window.location.hash) {
            const hashSection = window.location.hash.replace('#', '');
            if (hashSection && document.getElementById(hashSection)) {
                showSection(hashSection);
            }
        }
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
    // Load saved configuration
    loadConfig();

    // Initialize form defaults (including current date and validation)
    initializeFormDefaults();

    // Initialize form
    initializeForm();

    // Update reporter field with current user - delay to ensure DOM is ready
    setTimeout(() => { updateReporterField(); }, 200);

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
    }

    // Drug form event listener
    const drugForm = document.getElementById('drugForm');
    if (drugForm) {
        drugForm.addEventListener('submit', handleDrugFormSubmit);
    }

    // Filter change listeners
    const filterUserEl = document.getElementById('filterUser');
    if (filterUserEl) {
        filterUserEl.addEventListener('change', function () {
            loadData();
            updateDashboardUserInfo();
        });
    }

    const filterPeriodEl = document.getElementById('filterPeriod');
    if (filterPeriodEl) {
        filterPeriodEl.addEventListener('change', function () {
            loadData();
            updateDashboardUserInfo();
        });
    }

    // Auto-save settings when user types
    ['apiKey', 'spreadsheetId', 'sheetName', 'userSheetName', 'drugSheetName', 'webAppUrl', 'externalDrugSourceUrl', 'externalDrugSourceToken', 'externalDrugSourceFormat', 'externalDrugDataPath', 'externalDrugAutoSyncMinutes'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', function () {
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
            } else if (id === 'externalDrugSourceUrl') {
                googleSheetsConfig.externalDrugSourceUrl = this.value;
            } else if (id === 'externalDrugSourceToken') {
                googleSheetsConfig.externalDrugSourceToken = this.value;
            } else if (id === 'externalDrugSourceFormat') {
                googleSheetsConfig.externalDrugSourceFormat = this.value || 'json';
            } else if (id === 'externalDrugDataPath') {
                googleSheetsConfig.externalDrugDataPath = this.value;
            } else if (id === 'externalDrugAutoSyncMinutes') {
                googleSheetsConfig.externalDrugAutoSyncMinutes = Number(this.value || 0);
            }
            saveConfig();
            if (id === 'externalDrugAutoSyncMinutes') {
                setupExternalDrugSyncTimer();
            }
            updateExternalSyncStatus();
        });
    });

    const externalSyncBtn = document.getElementById('syncExternalDrugListBtn');
    if (externalSyncBtn) {
        externalSyncBtn.addEventListener('click', handleSyncDrugListFromExternal);
    }
    const testExternalBtn = document.getElementById('testExternalDrugConnectionBtn');
    if (testExternalBtn) {
        testExternalBtn.addEventListener('click', handleTestExternalDrugConnection);
    }

    setupExternalDrugSyncTimer();
    updateExternalSyncStatus();
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
