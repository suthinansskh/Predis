// Session, API singleton, toast, theme — state ร่วมทั้งแอป
import { reactive, computed, ref } from 'vue';
import { createApi } from '../api/client.js';
import { API_URL, DRUG_MANAGERS, FULL_REPORT_ACCESS } from '../constants.js';
import { readJson, writeJson, removeKey } from '../lib/util.js';

const SESSION_KEY = 'predis.v2.session';

const state = reactive({ token: null, expiresAt: 0, user: null, mustChangePassword: false });

function restore() {
    const saved = readJson(SESSION_KEY);
    if (saved && saved.token && saved.expiresAt > Date.now() && saved.user) {
        Object.assign(state, saved);
        return;
    }
    // รับ session จากแอปเวอร์ชันเดิม (token แบบ HMAC ใช้ร่วมกันได้) — ผู้ใช้ไม่ต้อง login ใหม่ตอนเปลี่ยนเวอร์ชัน
    const legacy = readJson('predisSession');
    const legacyUser = readJson('currentUser');
    if (legacy && legacyUser && String(legacy.token || '').includes('.') && legacy.expiresAt > Date.now()) {
        Object.assign(state, { token: legacy.token, expiresAt: legacy.expiresAt, user: legacyUser });
        writeJson(SESSION_KEY, { ...state });
    }
}
restore();

export const session = state;
export const isLoggedIn = computed(() => Boolean(state.token && state.user && state.expiresAt > Date.now()));
export const hasRole = (...roles) => Boolean(state.user && roles.includes(state.user.level));
export const canManageDrugs = computed(() => hasRole(...DRUG_MANAGERS));
export const hasFullReportAccess = computed(() => hasRole(...FULL_REPORT_ACCESS));

export function setSession({ token, expiresIn, user, mustChangePassword = false }) {
    Object.assign(state, { token, user, mustChangePassword, expiresAt: Date.now() + (expiresIn || 12 * 3600) * 1000 });
    writeJson(SESSION_KEY, { token, user, expiresAt: state.expiresAt, mustChangePassword });
}

export function clearSession() {
    Object.assign(state, { token: null, expiresAt: 0, user: null, mustChangePassword: false });
    removeKey(SESSION_KEY);
    removeKey('predisSession');
    removeKey('currentUser');
}

// ===== API =====

let authRequiredHandler = () => {};
export function onAuthRequired(handler) {
    authRequiredHandler = handler;
}

export const api = createApi({
    url: API_URL,
    getToken: () => state.token,
    onAuthRequired: error => {
        clearSession();
        authRequiredHandler(error);
    }
});

// ===== Toasts =====

export const toasts = ref([]);
let toastId = 0;

export function toast(message, type = 'info', ms = 5000) {
    const id = ++toastId;
    toasts.value.push({ id, message, type });
    setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, ms);
}

// ===== Theme (ระบบ / สว่าง / มืด) =====

const THEME_KEY = 'predisTheme';
export const theme = ref(readTheme());

function readTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch { return 'auto'; }
}

export function applyTheme(value) {
    theme.value = value;
    if (value === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', value);
    try { localStorage.setItem(THEME_KEY, value); } catch { /* ignore */ }
}

export function cycleTheme() {
    const order = ['auto', 'light', 'dark'];
    applyTheme(order[(order.indexOf(theme.value) + 1) % order.length]);
}

export const isDark = () => {
    if (theme.value === 'dark') return true;
    if (theme.value === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
};
