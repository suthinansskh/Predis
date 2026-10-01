const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/apps-script-env');

const USERS_HEADER = ['PS Code', 'ID13', 'ชื่อ', 'กลุ่ม', 'ระดับ', 'อีเมล', 'รหัสผ่าน', 'status'];
const ERRORS_HEADER = ['วันที่', 'ReportID', 'เวร', 'ประเภท', 'สถานที่', 'กระบวนการ', 'ข้อผิดพลาด',
    'ถูก', 'ผิด', 'สาเหตุ', 'เพิ่มเติม', 'ผู้รายงาน', 'บันทึกเมื่อ'];

// สร้าง env ที่มีผู้ใช้ตามระดับต่างๆ (รหัสผ่านถูก hash ด้วย hashPassword ของ apps-script เอง)
function setup({ now } = {}) {
    const env = createEnv({
        now,
        sheets: {
            Users: [USERS_HEADER],
            Predispensing_Errors: [ERRORS_HEADER],
            Drug_List: [['Drug Code', 'Drug Name', 'Group', 'HAD', 'Status']]
        }
    });
    const addUser = (psCode, level, password, id13 = '9990000000001') => {
        const stored = password === null ? '' : env.gs.hashPassword(password);
        env.sheets.Users.appendRow([psCode, id13, `ชื่อ ${psCode}`, 'เภสัชกร', level, '', stored, true]);
    };
    addUser('U01', 'user', 'StrongPass#1');
    addUser('ADM', 'admin', 'AdminPass#99');
    return { env, addUser };
}

function login(env, userCode, password) {
    return env.post({ action: 'login', userCode, password });
}

test('sanitizeInput ป้องกัน formula injection และตัดความยาว', () => {
    const { env } = setup();
    assert.equal(env.gs.sanitizeInput('=SUM(A1)'), "'=SUM(A1)");
    assert.equal(env.gs.sanitizeInput('+1'), "'+1");
    assert.equal(env.gs.sanitizeInput('ปกติ'), 'ปกติ');
    assert.equal(env.gs.sanitizeInput('x'.repeat(6000)).length, 5000);
    assert.equal(env.gs.sanitizeInput(null), '');
});

test('verifyPassword รองรับ hash ใหม่ (วนหลายรอบ) และ hash เก่า (sha256$)', () => {
    const { env } = setup();
    const hashed = env.gs.hashPassword('secret-123');
    assert.match(hashed, /^sha256i\$1000\$[0-9a-f]{16}\$[0-9a-f]{64}$/);
    assert.ok(env.gs.verifyPassword('secret-123', hashed));
    assert.ok(!env.gs.verifyPassword('secret-124', hashed));

    const legacy = 'sha256$abc$' + env.gs.sha256Hex('abc:old-pass');
    assert.ok(env.gs.verifyPassword('old-pass', legacy));
    assert.ok(env.gs.needsRehash(legacy));
    assert.ok(!env.gs.needsRehash(hashed));
});

test('isWeakPassword จับรหัสเริ่มต้น / สั้น / เลขบัตรประชาชน', () => {
    const { env } = setup();
    assert.ok(env.gs.isWeakPassword('@12345', ''));
    assert.ok(env.gs.isWeakPassword('short', ''));
    assert.ok(env.gs.isWeakPassword('9990000000001', '9990000000001'));
    assert.ok(!env.gs.isWeakPassword('Long-enough-1', '9990000000001'));
});

test('GET: login และ getErrors ถูกปิด, getDrugs ยังใช้ได้', () => {
    const { env } = setup();
    assert.equal(env.get({ action: 'login', userCode: 'U01', password: 'StrongPass#1' }).success, false);
    const errors = env.get({ action: 'getErrors' });
    assert.equal(errors.success, false);
    assert.equal(errors.data, undefined);
    assert.equal(env.get({ action: 'getDrugs' }).success, true);
});

test('login สำเร็จได้ token และไม่ส่ง id13/password กลับ', () => {
    const { env } = setup();
    const res = login(env, 'U01', 'StrongPass#1');
    assert.equal(res.success, true);
    assert.match(res.token, /^[0-9a-f]{64}$/);
    assert.equal(res.user.level, 'user');
    assert.equal(res.user.id13, undefined);
    assert.equal(res.user.password, undefined);
    assert.equal(res.mustChangePassword, false);
});

test('action ที่ต้อง login ปฏิเสธเมื่อไม่มี token หรือ token ปลอม', () => {
    const { env } = setup();
    for (const token of [undefined, 'f'.repeat(64), 'not-a-token']) {
        const res = env.post({ action: 'getErrors', token });
        assert.equal(res.success, false);
        assert.equal(res.authRequired, true);
    }
});

test('getErrors คืนข้อมูลเมื่อมี token ที่ถูกต้อง และ logout ทำให้ token ใช้ไม่ได้', () => {
    const { env } = setup();
    const { token } = login(env, 'U01', 'StrongPass#1');
    const res = env.post({ action: 'getErrors', token });
    assert.equal(res.success, true);
    assert.deepEqual(res.data[0], ERRORS_HEADER);

    env.post({ action: 'logout', token });
    assert.equal(env.post({ action: 'getErrors', token }).authRequired, true);
});

test('append ใช้ชื่อผู้รายงานจาก session (ปลอมไม่ได้) และกัน Report ID ซ้ำ', () => {
    const { env } = setup();
    const { token } = login(env, 'U01', 'StrongPass#1');
    const report = { action: 'append', token, eventDate: '2026-10-01', reportId: 'R-1', reporter: 'คนอื่น (ADM)' };

    assert.equal(env.post(report).success, true);
    const row = env.sheets.Predispensing_Errors.rows[1];
    assert.equal(row[1], 'R-1');
    assert.equal(row[11], 'ชื่อ U01 (U01) - เภสัชกร/user');

    const dup = env.post({ ...report, submissionToken: 'other' });
    assert.equal(dup.success, false);
    assert.equal(dup.duplicate, true);
});

test('append แบบไม่มี token: ยอมรับเฉพาะช่วงเปลี่ยนผ่าน (legacy client)', () => {
    const before = setup({ now: '2026-10-02T00:00:00+07:00' }).env;
    assert.equal(before.post({ action: 'append', eventDate: '2026-10-01', reportId: 'L-1' }).success, true);

    const after = setup({ now: '2026-10-09T00:00:00+07:00' }).env;
    const res = after.post({ action: 'append', eventDate: '2026-10-01', reportId: 'L-2' });
    assert.equal(res.authRequired, true);
    assert.equal(after.sheets.Predispensing_Errors.rows.length, 1);
});

test('RBAC ฝั่ง server: user เพิ่มยา/แทนที่รายการยาไม่ได้, admin ทำได้', () => {
    const { env } = setup();
    const user = login(env, 'U01', 'StrongPass#1').token;
    const admin = login(env, 'ADM', 'AdminPass#99').token;

    assert.equal(env.post({ action: 'addDrug', token: user, drugCode: 'X1', drugName: 'Drug X' }).success, false);
    assert.equal(env.post({ action: 'replaceDrugList', token: user, drugs: '[{"drugCode":"A"}]' }).success, false);

    assert.equal(env.post({ action: 'addDrug', token: admin, drugCode: 'X1', drugName: 'Drug X', had: 'High', status: 'Active' }).success, true);
    assert.equal(env.post({ action: 'addDrug', token: admin, drugCode: 'X1', drugName: 'Drug X' }).success, false, 'duplicate code');

    const drugs = env.get({ action: 'getDrugs' }).data;
    assert.equal(drugs.length, 1);
    assert.equal(drugs[0].had, 'High', 'HAD ต้องเป็น "High" ไม่ใช่ 1');
});

test('login ด้วยรหัสเริ่มต้น (หลุดสู่สาธารณะ) ถูกปฏิเสธ — ทั้ง plain text และ hash', () => {
    const { env, addUser } = setup();
    addUser('P01', 'pharmacist', '@12345');
    env.sheets.Users.appendRow(['P02', '9999999999999', 'ชื่อ P02', 'เภสัชกร', 'pharmacist', '', '@12345', true]);

    for (const code of ['P01', 'P02']) {
        const res = login(env, code, '@12345');
        assert.equal(res.success, false, code);
        assert.equal(res.token, undefined);
    }
});

test('ไม่มีรหัสผ่าน: 4 ตัวท้ายเลขบัตรประชาชน login ไม่ได้อีกต่อไป', () => {
    const { env, addUser } = setup();
    addUser('P03', 'pharmacist', null, '1111111115678');
    assert.equal(login(env, 'P03', '5678').success, false);
});

test('ล็อกบัญชีหลังใส่รหัสผิด 5 ครั้ง แม้รหัสถูกในครั้งที่ 6', () => {
    const { env } = setup();
    for (let i = 0; i < 5; i++) login(env, 'U01', 'wrong-pass');
    const res = login(env, 'U01', 'StrongPass#1');
    assert.equal(res.success, false);
    assert.match(res.error, /15 นาที/);
});

test('รหัสชั่วคราวจาก admin บังคับเปลี่ยน และ changePassword ตรวจรหัสอ่อน', () => {
    const { env } = setup();
    env.gs.setUserPasswordHashed('U01', 'TempPass-777');

    const first = login(env, 'U01', 'TempPass-777');
    assert.equal(first.success, true);
    assert.equal(first.mustChangePassword, true);

    const weak = env.post({ action: 'changePassword', token: first.token, currentPassword: 'TempPass-777', newPassword: '@12345' });
    assert.equal(weak.success, false);

    const wrong = env.post({ action: 'changePassword', token: first.token, currentPassword: 'nope', newPassword: 'NewStrong-2026' });
    assert.equal(wrong.success, false);

    const ok = env.post({ action: 'changePassword', token: first.token, currentPassword: 'TempPass-777', newPassword: 'NewStrong-2026' });
    assert.equal(ok.success, true);

    const again = login(env, 'U01', 'NewStrong-2026');
    assert.equal(again.success, true);
    assert.equal(again.mustChangePassword, false);
});

test('forceResetWeakPasswords ออกรหัสชั่วคราวให้เฉพาะผู้ที่ใช้รหัสอ่อน', () => {
    const { env } = setup();
    // plain text ที่ยังไม่เคย login (ข้อมูลจริงจาก sample_users.csv)
    env.sheets.Users.appendRow(['P01', '3333333333333', 'ชื่อ P01', 'เภสัชกร', 'pharmacist', '', '@12345', true]);
    // legacy single-round hash ของรหัสเริ่มต้น
    env.sheets.Users.appendRow(['P04', '2222222222222', 'ชื่อ P04', 'เภสัชกร', 'pharmacist', '',
        'sha256$s1$' + env.gs.sha256Hex('s1:@12345'), true]);

    const count = env.gs.forceResetWeakPasswords();
    assert.equal(count, 2);
    const issued = env.sheets.Temp_Passwords.rows.slice(1);
    assert.deepEqual(issued.map(r => r[0]).sort(), ['P01', 'P04']);

    const temp = issued.find(r => r[0] === 'P04')[2];
    const res = login(env, 'P04', temp);
    assert.equal(res.success, true);
    assert.equal(res.mustChangePassword, true);
    assert.equal(login(env, 'U01', 'StrongPass#1').mustChangePassword, false);
});
