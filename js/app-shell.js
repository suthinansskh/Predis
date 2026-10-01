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


// ===== Theme (ระบบ / สว่าง / มืด) =====

const THEME_KEY = 'predisTheme';
const THEME_CYCLE = ['auto', 'light', 'dark'];
const THEME_LABELS = { auto: 'ตามระบบ', light: 'โหมดสว่าง', dark: 'โหมดมืด' };
const THEME_ICONS = { auto: 'fa-circle-half-stroke', light: 'fa-sun', dark: 'fa-moon' };

function getThemePreference() {
    try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (_) { return 'auto'; }
}

function applyTheme(theme) {
    if (theme === 'auto') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
    applyChartTheme();
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
        btn.innerHTML = `<i class="fas ${THEME_ICONS[theme]}" aria-hidden="true"></i>`;
        btn.title = `ธีม: ${THEME_LABELS[theme]} (กดเพื่อเปลี่ยน)`;
        btn.setAttribute('aria-label', btn.title);
    }
}

function setupThemeToggle() {
    const anchor = document.getElementById('changePasswordBtn');
    if (!anchor || document.getElementById('themeToggleBtn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'themeToggleBtn';
    btn.className = 'logout-btn';
    btn.addEventListener('click', () => {
        const next = THEME_CYCLE[(THEME_CYCLE.indexOf(getThemePreference()) + 1) % THEME_CYCLE.length];
        try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* ignore */ }
        applyTheme(next);
        // กราฟต้องวาดใหม่เพื่อใช้สีของธีมใหม่
        if (typeof renderDashboard === 'function') renderDashboard();
    });
    anchor.before(btn);
    applyTheme(getThemePreference());
}

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Chart.js ใช้สีตายตัว — ตั้งให้ตามธีม (หน้าที่ไม่มีกราฟข้ามไป)
function applyChartTheme() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = cssVar('--color-text-secondary');
    Chart.defaults.borderColor = cssVar('--color-border');
}

// ===== ตาราง → การ์ดบนมือถือ: เติม data-label จากหัวตาราง =====

function labelResponsiveTable(table) {
    const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
    table.querySelectorAll('tbody tr').forEach(tr => {
        [...tr.children].forEach((td, i) => {
            if (headers[i] && !td.hasAttribute('colspan')) td.setAttribute('data-label', headers[i]);
        });
    });
}

function watchResponsiveTables() {
    document.querySelectorAll('table.responsive-cards').forEach(labelResponsiveTable);
    new MutationObserver(mutations => {
        const tables = new Set();
        mutations.forEach(m => {
            const table = m.target.closest && m.target.closest('table.responsive-cards');
            if (table) tables.add(table);
            m.addedNodes.forEach(node => {
                if (node.nodeType === 1 && node.querySelectorAll) {
                    node.querySelectorAll('table.responsive-cards').forEach(t => tables.add(t));
                }
            });
        });
        tables.forEach(labelResponsiveTable);
    }).observe(document.body, { childList: true, subtree: true });
}

applyTheme(getThemePreference());
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(getThemePreference()));
document.addEventListener('DOMContentLoaded', () => {
    setupThemeToggle();
    watchResponsiveTables();
});
