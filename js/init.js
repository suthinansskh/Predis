// จุดเริ่มต้นของแอป (DOMContentLoaded) — โหลดเป็นไฟล์สุดท้าย
// โหลดเป็น classic script ตามลำดับใน JS_FILES (ดู sw.js / *.html)

document.addEventListener('DOMContentLoaded', function () {
    debugLog('DOM fully loaded — page:', currentPage);

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

// เริ่มต้นแอปหลัง login — แต่ละหน้าโหลดเฉพาะสคริปต์ที่ใช้ (ดู PAGE_SCRIPTS ใน sw.js)
// จึงต้องเรียกเฉพาะฟังก์ชันของหน้านั้น
function initializeApp() {
    loadConfig();
    updateDashboardUserInfo();

    if (currentPage === 'report') {
        initializeReportPage();
    } else if (currentPage === 'index') {
        initializeIndexPage();
    }

    updateOutboxBadge();
    flushOutbox();
}

function initializeReportPage() {
    initializeFormDefaults();
    initializeForm();
    setTimeout(() => { updateReporterField(); }, 200);

    // Location change listener for substation toggle
    const locSelect = document.getElementById('location');
    const subGroup = document.getElementById('substationGroup');
    if (locSelect && subGroup && !locSelect.dataset.substationListener) {
        locSelect.dataset.substationListener = 'true';
        const toggleSubstation = () => {
            if (locSelect.value === 'รพ.สต.') {
                subGroup.style.display = '';
            } else {
                subGroup.style.display = 'none';
                const subSel = document.getElementById('substation');
                if (subSel) subSel.value = '';
            }
        };
        locSelect.addEventListener('change', toggleSubstation);
        toggleSubstation();
    }

    // Form event listeners (single enhanced listener with validation)
    setupFormEnhanced();
}

const SETTINGS_FIELDS = {
    apiKey: v => v,
    spreadsheetId: v => v,
    sheetName: v => v,
    userSheetName: v => v,
    drugSheetName: v => v,
    webAppUrl: v => v,
    externalDrugSourceUrl: v => v,
    externalDrugSourceToken: v => v,
    externalDrugSourceFormat: v => v || 'json',
    externalDrugDataPath: v => v,
    externalDrugAutoSyncMinutes: v => Number(v || 0)
};

function initializeIndexPage() {
    if (document.body.dataset.indexInitialized) return;
    document.body.dataset.indexInitialized = 'true';

    loadDrugList();

    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) settingsForm.addEventListener('submit', handleSettingsSubmit);

    const drugForm = document.getElementById('drugForm');
    if (drugForm) drugForm.addEventListener('submit', handleDrugFormSubmit);

    // Auto-save settings when user types
    Object.entries(SETTINGS_FIELDS).forEach(([id, parse]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', function () {
            googleSheetsConfig[id] = parse(this.value);
            saveConfig();
            if (id === 'externalDrugAutoSyncMinutes') setupExternalDrugSyncTimer();
            updateExternalSyncStatus();
        });
    });

    const externalSyncBtn = document.getElementById('syncExternalDrugListBtn');
    if (externalSyncBtn) externalSyncBtn.addEventListener('click', handleSyncDrugListFromExternal);
    const testExternalBtn = document.getElementById('testExternalDrugConnectionBtn');
    if (testExternalBtn) testExternalBtn.addEventListener('click', handleTestExternalDrugConnection);

    setupExternalDrugSyncTimer();
    updateExternalSyncStatus();
}


