const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// โหลด js/*.js ใน context เดียวกันเหมือน <script> หลายไฟล์ในเบราว์เซอร์
function loadClient(fetchImpl) {
    const storage = new Map();
    const calls = [];
    const context = {
        console: { log() {}, warn() {}, error() {} },
        URL, FormData, Date, JSON, Math, Promise, Set, Map,
        setTimeout: () => 0,
        document: {
            body: { dataset: { page: 'report' } },
            getElementById: () => null,
            querySelectorAll: () => [],
            addEventListener() {}
        },
        window: {},
        localStorage: {
            getItem: k => (storage.has(k) ? storage.get(k) : null),
            setItem: (k, v) => storage.set(k, String(v)),
            removeItem: k => storage.delete(k)
        },
        fetch: async (url, options) => {
            const fields = Object.fromEntries(options.body.entries());
            calls.push(fields);
            const body = await fetchImpl(fields);
            return { ok: true, json: async () => body };
        }
    };
    vm.createContext(context);
    for (const file of ['core', 'auth', 'app-shell', 'report-form']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', `${file}.js`), 'utf8'), context, { filename: `${file}.js` });
    }
    // ฟังก์ชัน UI ที่ไม่เกี่ยวกับการทดสอบ
    vm.runInContext('showLoginPage = () => { globalThis.loginShown = true; }; showNotification = () => {};', context);
    return { context, calls, storage, run: code => vm.runInContext(code, context) };
}

test('normalizeWebAppUrl ย้าย deployment เก่าไปยังปัจจุบัน แต่เคารพ URL อื่น', () => {
    const { run } = loadClient(() => ({}));
    const latest = run('LATEST_WEB_APP_URL');
    assert.equal(run("normalizeWebAppUrl('https://script.google.com/macros/s/AKfycbOLD_old-1/exec')"), latest);
    assert.equal(run("normalizeWebAppUrl('')"), latest);
    assert.equal(run("normalizeWebAppUrl('http://localhost:8080/api')"), 'http://localhost:8080/api');
});

test('session token หมดอายุแล้วถือว่าไม่มี', () => {
    const { run, storage } = loadClient(() => ({}));
    run("saveSession('a'.repeat(64), 60)");
    assert.equal(run('getSessionToken()'), 'a'.repeat(64));
    storage.set('predisSession', JSON.stringify({ token: 'b'.repeat(64), expiresAt: Date.now() - 1 }));
    assert.equal(run('getSessionToken()'), null);
});

test('apiPost แนบ token และ throw เมื่อ server ตอบ success:false', async () => {
    const { run, calls } = loadClient(() => ({ success: false, error: 'ไม่มีสิทธิ์' }));
    run("saveSession('c'.repeat(64), 60)");
    await assert.rejects(run("apiPost('getErrors')"), /ไม่มีสิทธิ์/);
    assert.equal(calls[0].token, 'c'.repeat(64));
    assert.equal(calls[0].action, 'getErrors');
});

test('apiPost ล้าง session และพากลับหน้า login เมื่อ authRequired', async () => {
    const { run, context, storage } = loadClient(() => ({ success: false, authRequired: true }));
    run("saveSession('d'.repeat(64), 60); localStorage.setItem('currentUser', '{}')");
    await assert.rejects(run("apiPost('getErrors')"));
    assert.equal(storage.has('predisSession'), false);
    assert.equal(storage.has('currentUser'), false);
    assert.equal(context.loginShown, true);
});

test('login ใช้ POST — รหัสผ่านไม่อยู่ใน URL', async () => {
    const { run, calls } = loadClient(() => ({ success: true, user: { name: 'x' }, token: 'e'.repeat(64) }));
    const result = await run("authenticateUser('U01', 'secret')");
    assert.equal(result.token, 'e'.repeat(64));
    assert.equal(calls[0].action, 'login');
    assert.equal(calls[0].password, 'secret');
});

// regression: เดิม error จาก server ถูก catch(jsonError) กลืนแล้วแจ้งว่า "บันทึกสำเร็จ"
test('appendToGoogleSheet throw เมื่อ server ปฏิเสธ (ไม่แจ้งสำเร็จหลอก)', async () => {
    const { run } = loadClient(() => ({ success: false, error: 'Sheet not found' }));
    await assert.rejects(run("appendToGoogleSheet({ eventDate: '2026-10-01', reportId: 'R1' })"), /Sheet not found/);
});

test('appendToGoogleSheet สร้าง Report ID ใหม่เมื่อซ้ำ แล้วส่งใหม่หนึ่งครั้ง', async () => {
    let n = 0;
    const { run, calls } = loadClient(() => (n++ === 0
        ? { success: false, duplicate: true, reportId: 'R1' }
        : { success: true }));
    const res = await run("appendToGoogleSheet({ eventDate: '2026-10-01', reportId: 'R1' })");
    assert.equal(calls.length, 2);
    assert.notEqual(calls[1].reportId, 'R1');
    assert.equal(res.newReportId, calls[1].reportId);
});

test('sanitizeForSheet และ escapeHtml', () => {
    const { run } = loadClient(() => ({}));
    assert.equal(run("sanitizeForSheet('=HYPERLINK(1)')"), "'=HYPERLINK(1)");
    assert.equal(run(`escapeHtml('<img src=x onerror=alert(1)>')`), '&lt;img src=x onerror=alert(1)&gt;');
});
