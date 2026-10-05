// API client สำหรับ Apps Script v2: POST FormData {action, token, payload} → {ok, data | error}
// Apps Script ตอบผ่าน redirect ไป script.googleusercontent.com ซึ่งบางช่วงตอบช้า/404 (เบราว์เซอร์รายงานเป็น CORS)
// → timeout + ลองใหม่อัตโนมัติ เฉพาะ action ที่ส่งซ้ำแล้วผลไม่เปลี่ยน

export const RETRY_DELAYS_MS = [1500, 4000];
export const TIMEOUT_MS = 45000;

// ส่งซ้ำแล้วผลเปลี่ยน (รหัสใช้ครั้งเดียว / สร้างซ้ำ) — ไม่ลองซ้ำอัตโนมัติ
// reports.create ลองซ้ำได้เพราะมี submissionToken กันซ้ำฝั่ง server
export const NON_RETRYABLE = new Set([
    'auth.register', 'auth.changePassword', 'auth.activate', 'drugs.add', 'users.issueActivations'
]);

export class ApiError extends Error {
    constructor(message, info = {}) {
        super(message);
        this.name = 'ApiError';
        Object.assign(this, info);
    }
}

function unavailableError(cause) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return new ApiError(offline
        ? 'ไม่มีสัญญาณอินเทอร์เน็ต กรุณาตรวจสอบการเชื่อมต่อ'
        : 'Server ของ Google ตอบช้าหรือขัดข้องชั่วคราว กรุณาลองใหม่ในอีกสักครู่', { code: 'NETWORK', network: true, cause });
}

/**
 * @param {Object} opts
 * @param {string} opts.url
 * @param {() => string|null} opts.getToken
 * @param {(error: ApiError) => void} [opts.onAuthRequired]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {(ms: number) => Promise<void>} [opts.sleep]
 */
export function createApi({ url, getToken, onAuthRequired = () => {}, fetchImpl, sleep, retryDelays = RETRY_DELAYS_MS, timeoutMs = TIMEOUT_MS }) {
    const doFetch = (...args) => (fetchImpl || globalThis.fetch)(...args);
    const wait = sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));

    async function once(request) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            let response;
            try {
                response = await doFetch(request.url, { ...request.init, signal: controller.signal, redirect: 'follow' });
            } catch (error) {
                throw unavailableError(error);
            }
            if (!response.ok) throw unavailableError(new Error(`HTTP ${response.status}`));
            try {
                return await response.json();
            } catch (error) {
                throw unavailableError(error); // หน้า error HTML ของ Google แทน JSON
            }
        } finally {
            clearTimeout(timer);
        }
    }

    async function send(action, request) {
        const delays = NON_RETRYABLE.has(action) ? [] : retryDelays;
        let body;
        for (let attempt = 0; ; attempt++) {
            try {
                body = await once(request);
                break;
            } catch (error) {
                const online = typeof navigator === 'undefined' || navigator.onLine !== false;
                if (!(error.network && attempt < delays.length && online)) throw error;
                await wait(delays[attempt]);
            }
        }
        if (body && body.ok) return body.data;
        const info = (body && body.error) || {};
        const error = new ApiError(info.message || 'เกิดข้อผิดพลาดจาก Server', info);
        if (info.code === 'AUTH_REQUIRED') onAuthRequired(error);
        throw error;
    }

    return {
        /** POST action v2 */
        call(action, payload = {}) {
            const form = new FormData();
            form.append('action', action);
            const token = getToken();
            if (token) form.append('token', token);
            form.append('payload', JSON.stringify(payload));
            return send(action, { url, init: { method: 'POST', body: form } });
        },
        /** GET action สาธารณะ (เช่น drugs.list) — แคชได้ */
        get(action) {
            return send(action, { url: `${url}?action=${encodeURIComponent(action)}`, init: { method: 'GET' } });
        }
    };
}
