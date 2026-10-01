const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/apps-script-env');

const USERS_HEADER = ['PS Code', 'ID13', 'ชื่อ', 'กลุ่ม', 'ระดับ', 'อีเมล', 'รหัสผ่าน', 'status'];

function setup() {
    const env = createEnv({ sheets: { Users: [USERS_HEADER] } });
    env.sheets.Users.appendRow(['ADM', '', 'ผู้ดูแล', 'IT', 'admin', '', env.gs.hashPassword('AdminPass#99'), true]);
    env.sheets.Users.appendRow(['U01', '9990000000002', 'ผู้ใช้ หนึ่ง', 'เภสัชกร', 'user', '', env.gs.hashPassword('UserPass#11'), true]);
    const login = (userCode, password) => env.post({ action: 'login', userCode, password });
    const admin = login('ADM', 'AdminPass#99').token;
    return { env, login, admin };
}

// รอให้ Date.now() เปลี่ยน — session ที่ออกหลังการ revoke ต้องอยู่คนละ millisecond
function nextMillisecond() {
    const t = Date.now();
    while (Date.now() === t) { /* spin */ }
}

const REGISTRATION = { action: 'register', psCode: 'N01', name: 'สมาชิก ใหม่', group: 'เภสัชกร', password: 'NewMember#2026' };

test('ลงทะเบียน → รออนุมัติ: login ไม่ได้จนกว่า admin อนุมัติ', () => {
    const { env, login, admin } = setup();
    const reg = env.post(REGISTRATION);
    assert.equal(reg.success, true);

    const row = env.sheets.Users.rows.find(r => r[0] === 'N01');
    assert.equal(row[4], 'user');
    assert.equal(row[7], false);
    assert.equal(row[8], 'PENDING');
    assert.match(row[6], /^sha256i\$/, 'เก็บรหัสผ่านแบบ hash');
    assert.equal(env.sheets.Users.rows[0][8], 'สถานะคำขอ', 'เพิ่ม header คอลัมน์ใหม่');

    const pending = login('N01', 'NewMember#2026');
    assert.equal(pending.success, false);
    assert.match(pending.error, /รอผู้ดูแลระบบอนุมัติ/);

    // รหัสผิด → ข้อความทั่วไป (ไม่บอกว่าบัญชีรออนุมัติ)
    assert.doesNotMatch(login('N01', 'wrong-password').error, /อนุมัติ/);

    assert.equal(env.post({ action: 'approveUser', token: admin, psCode: 'N01', level: 'pharmacist' }).success, true);
    const ok = login('N01', 'NewMember#2026');
    assert.equal(ok.success, true);
    assert.equal(ok.user.level, 'pharmacist');
});

test('ลงทะเบียน: ตรวจข้อมูลและกัน PS Code ซ้ำ', () => {
    const { env } = setup();
    assert.equal(env.post({ ...REGISTRATION, psCode: 'U01' }).success, false, 'ซ้ำกับผู้ใช้เดิม');
    assert.equal(env.post({ ...REGISTRATION, psCode: 'u01' }).success, false, 'ไม่สนตัวพิมพ์');
    assert.equal(env.post({ ...REGISTRATION, password: '@12345' }).success, false, 'รหัสอ่อน');
    assert.equal(env.post({ ...REGISTRATION, psCode: '=CMD()' }).success, false, 'formula injection');
    assert.equal(env.post({ ...REGISTRATION, group: 'admin' }).success, false, 'กลุ่มนอกรายการ');
    assert.equal(env.post({ ...REGISTRATION, email: 'not-an-email' }).success, false);
    assert.equal(env.post({ ...REGISTRATION, level: 'admin' }).success, true, 'ส่ง level มาเองก็ไม่มีผล');
    assert.equal(env.sheets.Users.rows.find(r => r[0] === 'N01')[4], 'user');
});

test('ปฏิเสธคำขอลงทะเบียน', () => {
    const { env, login, admin } = setup();
    env.post(REGISTRATION);
    assert.equal(env.post({ action: 'rejectUser', token: admin, psCode: 'N01' }).success, true);
    assert.match(login('N01', 'NewMember#2026').error, /ไม่ได้รับการอนุมัติ/);
    assert.equal(env.post({ action: 'approveUser', token: admin, psCode: 'N01' }).success, false, 'อนุมัติได้เฉพาะ PENDING');
});

test('ลืมรหัสผ่าน: ตอบเหมือนกันเสมอ และบันทึกคำขอเฉพาะผู้ใช้จริง ไม่ซ้ำ', () => {
    const { env } = setup();
    const real = env.post({ action: 'requestPasswordReset', userCode: 'U01' });
    const fake = env.post({ action: 'requestPasswordReset', userCode: 'NOBODY' });
    assert.equal(real.success, true);
    assert.equal(real.message, fake.message, 'ไม่เปิดเผยว่ามีผู้ใช้หรือไม่');

    env.post({ action: 'requestPasswordReset', userCode: 'U01' }); // ซ้ำภายใน cooldown
    env.post({ action: 'requestPasswordReset', userCode: '9990000000002' }); // ด้วย ID13
    const requests = env.sheets.Password_Resets.rows.slice(1);
    assert.equal(requests.length, 1);
    assert.deepEqual([requests[0][1], requests[0][3]], ['U01', 'PENDING']);
});

test('admin ออกรหัสชั่วคราว: คำขอเสร็จสิ้น, session เดิมถูกยกเลิก, บังคับเปลี่ยนรหัส', () => {
    const { env, login, admin } = setup();
    const oldSession = login('U01', 'UserPass#11').token;
    env.post({ action: 'requestPasswordReset', userCode: 'U01' });
    nextMillisecond();

    const res = env.post({ action: 'adminResetPassword', token: admin, psCode: 'U01' });
    assert.equal(res.success, true);
    assert.match(res.tempPassword, /^[A-Za-z0-9]{10}$/);

    assert.equal(env.sheets.Password_Resets.rows[1][3], 'DONE');
    assert.equal(env.sheets.Password_Resets.rows[1][4], 'ADM');
    assert.equal(env.post({ action: 'getErrors', token: oldSession }).authRequired, true, 'session เดิมใช้ไม่ได้');
    assert.equal(login('U01', 'UserPass#11').success, false, 'รหัสเดิมใช้ไม่ได้');

    nextMillisecond();
    const fresh = login('U01', res.tempPassword);
    assert.equal(fresh.success, true);
    assert.equal(fresh.mustChangePassword, true);
});

test('listUsers: ไม่ส่ง hash รหัสผ่าน และปิดบังเลขบัตรประชาชน', () => {
    const { env, admin } = setup();
    env.post(REGISTRATION);
    env.post({ action: 'requestPasswordReset', userCode: 'U01' });
    const res = env.post({ action: 'listUsers', token: admin });
    assert.equal(res.success, true);
    const json = JSON.stringify(res);
    assert.doesNotMatch(json, /sha256/);
    assert.doesNotMatch(json, /9990000000002/);
    const u01 = res.users.find(u => u.psCode === 'U01');
    assert.equal(u01.id13, '*********0002');
    assert.equal(res.users.find(u => u.psCode === 'N01').request, 'PENDING');
    assert.deepEqual(res.pendingResets.map(r => r.psCode), ['U01']);
});

test('updateUser: ปิดบัญชีแล้ว session ถูกยกเลิก, แก้ตัวเองไม่ได้, ระดับต้องถูกต้อง', () => {
    const { env, login, admin } = setup();
    const userSession = login('U01', 'UserPass#11').token;
    nextMillisecond();

    assert.equal(env.post({ action: 'updateUser', token: admin, psCode: 'ADM', active: 'false' }).success, false);
    assert.equal(env.post({ action: 'updateUser', token: admin, psCode: 'U01', level: 'root' }).success, false);

    assert.equal(env.post({ action: 'updateUser', token: admin, psCode: 'U01', active: 'false' }).success, true);
    assert.equal(env.post({ action: 'getErrors', token: userSession }).authRequired, true);
    assert.match(login('U01', 'UserPass#11').error, /ถูกปิดใช้งาน/);

    assert.equal(env.post({ action: 'updateUser', token: admin, psCode: 'U01', active: 'true', level: 'supervisor' }).success, true);
    nextMillisecond();
    assert.equal(login('U01', 'UserPass#11').user.level, 'supervisor');
});

test('การจัดการผู้ใช้ทำได้เฉพาะ admin', () => {
    const { env, login } = setup();
    const user = login('U01', 'UserPass#11').token;
    for (const action of ['listUsers', 'approveUser', 'rejectUser', 'updateUser', 'adminResetPassword']) {
        const res = env.post({ action, token: user, psCode: 'ADM', level: 'user' });
        assert.equal(res.success, false, action);
        assert.match(res.error, /ไม่มีสิทธิ์/, action);
    }
});
