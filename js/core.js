// Globals, navigation, config และ API client (apiPost)
// โหลดเป็น classic script ตามลำดับใน JS_FILES (ดู sw.js / *.html)

// Global variables
let globalDrugList = [];
let globalUsersData = [];
let currentUser = null;

// Multi-page detection: 'index' (druglist/settings), 'report', 'dashboard'
const currentPage = (document.body && document.body.dataset.page) || 'main';

// Page-to-section mapping for multi-page navigation
const PAGE_SECTION_MAP = {
    'report': 'form',
    'dashboard': 'dashboard',
    'myreport': 'myreport',
    'index': 'druglist'
};

// Navigate to a section — cross-page if needed
function navigateTo(event, sectionName) {
    // If the section exists on the current page, show it directly
    const targetSection = document.getElementById(sectionName);
    if (targetSection) {
        if (event) event.preventDefault();
        showSection(sectionName);
        return;
    }
    // Otherwise, navigate to the correct page
    const pageMap = {
        'form': 'report.html',
        'dashboard': 'dashboard.html',
        'myreport': 'myreport.html',
        'druglist': 'index.html#druglist',
        'settings': 'index.html#settings',
        'users': 'index.html#users'
    };
    const targetUrl = pageMap[sectionName];
    if (targetUrl) {
        if (event) event.preventDefault();
        window.location.href = targetUrl;
    }
}

// RBAC helper — checks if current user has one of the allowed levels
function hasRole(...roles) {
    return currentUser && roles.includes(currentUser.level);
}

// Chart.js instances (for charts 1-4)
let processChartInstance = null;
let errorChartInstance = null;
let causeChartInstance = null;
let drugChartInstance = null;
let trendChartInstance = null;

// ⚠️ ห้าม hardcode credentials ใน source code
// ค่าเหล่านี้ต้องตั้งผ่านหน้า Settings และจะถูกเก็บใน localStorage
let googleSheetsConfig = {
    apiKey: '',           // กรอกใน Settings
    spreadsheetId: '',    // กรอกใน Settings
    sheetName: 'Predispensing_Errors',
    userSheetName: 'Users',
    drugSheetName: 'Drug_List',
    webAppUrl: 'https://script.google.com/macros/s/AKfycbyKiaS7Y2l63sh0jfa56ZK4Ambw96VGo4bFxt1BNIbaIC5Btc7NEK3dpL-FkDQsWi7O/exec',
    externalDrugSourceUrl: '',
    externalDrugSourceToken: '',
    externalDrugSourceFormat: 'json',
    externalDrugDataPath: '',
    externalDrugAutoSyncMinutes: 0
};

const LATEST_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyKiaS7Y2l63sh0jfa56ZK4Ambw96VGo4bFxt1BNIbaIC5Btc7NEK3dpL-FkDQsWi7O/exec';
const APPS_SCRIPT_URL_PATTERN = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;

// URL ของ deployment เก่าที่ค้างอยู่ใน localStorage → ย้ายไป deployment ปัจจุบัน
function normalizeWebAppUrl(url) {
    const trimmedUrl = (url || '').trim();
    if (!trimmedUrl || APPS_SCRIPT_URL_PATTERN.test(trimmedUrl)) {
        return LATEST_WEB_APP_URL;
    }
    return trimmedUrl;
}

// ===== Shared utilities =====

// เปิด log สำหรับ debug: localStorage.setItem('predisDebug', '1') แล้วรีโหลด
const DEBUG = (() => {
    try { return localStorage.getItem('predisDebug') === '1'; } catch (_) { return false; }
})();

function debugLog(...args) {
    if (DEBUG) console.log(...args);
}

// Report IDs ที่มีอยู่แล้ว (โหลดจาก dashboard) — ใช้กันสร้าง ID ซ้ำ
let usedReportIds = new Set();

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const str = String(text);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function sanitizeForSheet(value) {
    if (value === null || value === undefined) return '';
    let str = String(value).trim();
    // Remove characters that could trigger formula injection
    if (str.length > 0 && /^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
    }
    // Remove null bytes
    str = str.replace(/\0/g, '');
    return str;
}

// ===== Session & API =====
const SESSION_STORAGE_KEY = 'predisSession';

function getSessionToken() {
    try {
        const session = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || 'null');
        if (session && session.token && session.expiresAt > Date.now()) {
            return session.token;
        }
    } catch (_) { /* corrupted storage */ }
    return null;
}

function saveSession(token, expiresInSeconds) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        token,
        expiresAt: Date.now() + (expiresInSeconds || 6 * 3600) * 1000
    }));
}

function clearSession() {
    currentUser = null;
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem('currentUser');
}

/**
 * เรียก Apps Script ผ่าน POST (FormData = ไม่มี CORS preflight)
 * แนบ session token อัตโนมัติ; ถ้า server ตอบ authRequired จะพากลับหน้า login
 * @returns {Promise<Object>} JSON ที่ server ตอบ (throw ถ้า success !== true)
 */
async function apiPost(action, fields = {}) {
    if (!googleSheetsConfig.webAppUrl) {
        throw new Error('ยังไม่ได้ตั้งค่า Web App URL');
    }
    const formData = new FormData();
    formData.append('action', action);
    const token = getSessionToken();
    if (token) formData.append('token', token);
    Object.entries(fields).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    });

    let response;
    try {
        response = await fetch(googleSheetsConfig.webAppUrl, { method: 'POST', body: formData, redirect: 'follow' });
    } catch (networkError) {
        const error = new Error('ไม่สามารถเชื่อมต่อ Server ได้ กรุณาตรวจสอบเน็ตเวิร์ค แล้วลองใหม่', { cause: networkError });
        error.network = true;
        throw error;
    }
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    let result;
    try {
        result = await response.json();
    } catch (parseError) {
        throw new Error('Server ตอบกลับข้อมูลผิดรูปแบบ กรุณาลองใหม่', { cause: parseError });
    }

    if (result.authRequired) {
        clearSession();
        showLoginPage();
        const error = new Error(result.error || 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
        error.authRequired = true;
        throw error;
    }
    if (!result.success) {
        const error = new Error(result.error || 'เกิดข้อผิดพลาดจาก Server');
        error.result = result;
        throw error;
    }
    return result;
}
