// พฤติกรรมด้านความปลอดภัยของ API v2 (ย้ายมาจากชุดทดสอบของ API เดิม)
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/apps-script-env');

const USERS_HEADER = ['PS Code', 'ID13', 'ชื่อ', 'กลุ่ม', 'ระดับ', 'อีเมล', 'รหัสผ่าน', 'status'];
const LEGACY_HEADER = ['วันที่เกิดเหตุ', 'ReportID', 'เวร', 'ประเภท', 'สถานที่', 'กระบวนการ', 'ข้อผิดพลาด',
    'รายการถูกต้อง', 'รายการผิด', 'สาเหตุ', 'รายละเอียดเพิ่มเติม', 'ผู้รายงาน', 'timestamp'];
const plain = v => JSON.parse(JSON.stringify(v));

function setup() {
    const env = createEnv({
        sheets: {
            Users: [USERS_HEADER],
            Predispensing_Errors: [LEGACY_HEADER],
            Drug_List: [['Drug Code', 'Drug Name', 'Group', 'HAD', 'Status'], ['010', 'BCG vaccine', 'ITEM_IN1', 0, 1], ['MORPH10', 'Morphine 10 mg', 'ITEM_IN1', 0, 1]],
            Password_Resets: [['วันที่ขอ', 'PS Code', 'ชื่อ', 'สถานะ', 'ดำเนินการโดย', 'วันที่ดำเนินการ']]
        }
    });
    const addUser = (psCode, level, password, { id13 = '9990000000001', active = true } = {}) => {
        const stored = password === null ? '' : password.startsWith('PLAIN:') ? password.slice(6) : env.gs.hashPassword(password);
        env.sheets.Users.appendRow([psCode, id13, `ชื่อ ${psCode}`, 'เภสัชกร', level, '', stored, active]);
    };
    addUser('U01', 'user', 'StrongPass#1');
    addUser('P01', 'pharmacist', 'PharmPass#11', { id13: '9990000000002' });
    addUser('ADM', 'admin', 'AdminPass#99', { id13: '' });
    const login = (code, pw) => env.v2('auth.login', { userCode: code, password: pw });
    const tokenOf = (code, pw) => login(code, pw).data.token;
    const nextMs = () => { const t = Date.now(); while (Date.now() === t) { /* spin */ } };
    return { env, addUser, login, tokenOf, nextMs };
}

const REPORT = { eventDate: '2026-10-01', shift: 'เช้า', patientType: 'ผู้ป่วยนอก', location: 'OPD', process: 'จัดยา',
    errorDetail: 'จัดผิดชนิด', cause: 'c', incorrectDrugCode: 'MORPH10' };

test('crypto: sanitizeInput, verifyPassword (ใหม่/เก่า), isWeakPassword', () => {
    const { env } = setup();
    assert.equal(env.gs.sanitizeInput('=SUM(A1)'), "'=SUM(A1)");
    assert.equal(env.gs.sanitizeInput('x'.repeat(6000)).length, 5000);
    const hashed = env.gs.hashPassword('secret-123');
    assert.match(hashed, /^sha256i\$1000\$[0-9a-f]{16}\$[0-9a-f]{64}$/);
    assert.ok(env.gs.verifyPassword('secret-123', hashed));
    assert.ok(!env.gs.verifyPassword('secret-124', hashed));
    assert.ok(env.gs.verifyPassword('old-pass', 'sha256$abc$' + env.gs.sha256Hex('abc:old-pass')));
    assert.ok(env.gs.isWeakPassword('@12345', ''));
    assert.ok(env.gs.isWeakPassword('9990000000001', '9990000000001'));
    assert.ok(!env.gs.isWeakPassword('Long-enough-1', '9990000000001'));
});

test('API เดิม (action ไม่มีจุด) ถูกปิด → แจ้งให้รีโหลด; drugs.list ยังใช้ได้', () => {
    const { env } = setup();
    for (const action of ['login', 'append', 'getErrors', 'listUsers']) {
        const res = env.post({ action, userCode: 'U01', password: 'StrongPass#1' });
        assert.equal(res.code, 'APP_UPDATED', action);
        assert.equal(res.success, false);
    }
    assert.equal(env.get({ action: 'getDrugs' }).code, 'APP_UPDATED');
    assert.equal(env.get({ action: 'drugs.list' }).ok, true);
});

test('login: token + ไม่ส่ง id13/รหัสผ่านกลับ; token ปลอม/ไม่มี → AUTH_REQUIRED', () => {
    const { env, login } = setup();
    const res = login('U01', 'StrongPass#1').data;
    assert.match(res.token, /^[\w-]+\.[\w-]+$/);
    assert.equal(res.user.id13, undefined);
    assert.equal(JSON.stringify(res).includes('sha256'), false);
    for (const token of [undefined, 'not-a-token', 'abc.def', `${res.token}x`]) {
        assert.equal(env.v2('reports.list', {}, token).error.code, 'AUTH_REQUIRED', String(token));
    }
});

test('รหัสเริ่มต้น (plain/legacy hash) ถูกบล็อก, ไม่มีรหัส = login ไม่ได้ (4 ตัวท้ายบัตรใช้ไม่ได้)', () => {
    const { env, addUser, login } = setup();
    addUser('P02', 'pharmacist', 'PLAIN:@12345');
    env.sheets.Users.appendRow(['P03', '', 'x', 'g', 'user', '', 'sha256$s1$' + env.gs.sha256Hex('s1:@12345'), true]);
    addUser('P04', 'user', null, { id13: '1111111115678' });
    assert.equal(login('P02', '@12345').error.code, 'DEFAULT_PASSWORD_BLOCKED');
    assert.equal(login('P03', '@12345').error.code, 'DEFAULT_PASSWORD_BLOCKED');
    assert.equal(login('P04', '5678').error.code, 'WRONG_CREDENTIALS');
});

test('รหัสผิดติดกัน: หน่วงเวลา นับรวม PS Code และ ID13 ของบัญชีเดียวกัน', () => {
    const { login } = setup();
    assert.equal(login('U01', 'w1').error.code, 'WRONG_CREDENTIALS');
    assert.equal(login('9990000000001', 'w2').error.code, 'WRONG_CREDENTIALS');
    const third = login('u01', 'w3').error;
    assert.equal(third.code, 'LOCKED');
    assert.ok(third.retryAfter > 0 && third.retryAfter <= 30);
    assert.equal(login('U01', 'StrongPass#1').error.code, 'LOCKED', 'รหัสถูกก็ต้องรอ');
});

test('reports.create: ผู้รายงานมาจาก token (ปลอมไม่ได้)', () => {
    const { env, tokenOf } = setup();
    const res = env.v2('reports.create', { ...REPORT, reporterPsCode: 'ADM', reporterName: 'คนอื่น', reporter: 'ADM' }, tokenOf('U01', 'StrongPass#1'));
    assert.equal(res.ok, true);
    assert.equal(env.sheets.Predispensing_Errors.rows[1][11], 'ชื่อ U01 (U01) - เภสัชกร/user');
    const listed = env.v2('reports.list', {}, tokenOf('P01', 'PharmPass#11')).data.items[0];
    assert.deepEqual([listed.reporterPsCode, listed.reporterName], ['U01', 'ชื่อ U01']);
});

test('RBAC: user แก้ยา/จัดการผู้ใช้ไม่ได้, pharmacist แก้ยาได้แต่จัดการผู้ใช้ไม่ได้', () => {
    const { env, tokenOf } = setup();
    const user = tokenOf('U01', 'StrongPass#1');
    const pharm = tokenOf('P01', 'PharmPass#11');
    for (const [action, payload] of [['drugs.update', { drugCode: 'MORPH10', had: 'High' }], ['drugs.add', { drugCode: 'X', drugName: 'X' }],
        ['users.list', {}], ['users.approve', { psCode: 'U01' }], ['users.update', { psCode: 'P01', level: 'admin' }],
        ['users.issueActivations', { weakOnly: true }], ['admin.loginStats', {}]]) {
        assert.equal(env.v2(action, payload, user).error.code, 'FORBIDDEN', `user ${action}`);
    }
    assert.equal(env.v2('drugs.update', { drugCode: 'MORPH10', had: 'High' }, pharm).ok, true);
    assert.equal(env.v2('users.list', {}, pharm).error.code, 'FORBIDDEN');
});

test('drugs.update: override คงอยู่หลัง Drug_List ถูกเขียนทับ, ปิดใช้งานแล้วหายจากรายการที่ใช้งาน', () => {
    const { env, tokenOf } = setup();
    const pharm = tokenOf('P01', 'PharmPass#11');
    env.v2('drugs.update', { drugCode: 'MORPH10', had: 'High' }, pharm);
    env.sheets.Drug_List.rows[2] = ['MORPH10', 'Morphine 10 mg', 'ITEM_IN1', 0, 1]; // sync จาก HOSxP เขียนทับ
    const drugs = () => Object.fromEntries(env.get({ action: 'drugs.list' }).data.drugs.map(d => [String(d.drugCode), d]));
    assert.equal(drugs().MORPH10.had, 'High');
    env.v2('drugs.update', { drugCode: '010', status: 'Inactive' }, pharm);
    assert.equal(drugs()['010'].status, 'Inactive');
    assert.equal(env.v2('drugs.update', { drugCode: 'NOPE', had: 'High' }, pharm).ok, false);
});

test('เปลี่ยนรหัสผ่าน: ตรวจรหัสเดิม, ห้ามรหัสอ่อน, รหัสจาก admin บังคับเปลี่ยน', () => {
    const { env, login } = setup();
    env.gs.setUserPasswordHashed('U01', 'TempPass-777');
    const first = login('U01', 'TempPass-777').data;
    assert.equal(first.mustChangePassword, true);
    assert.equal(env.v2('auth.changePassword', { currentPassword: 'nope', newPassword: 'NewStrong-2026' }, first.token).ok, false);
    assert.equal(env.v2('auth.changePassword', { currentPassword: 'TempPass-777', newPassword: '@12345' }, first.token).ok, false);
    assert.equal(env.v2('auth.changePassword', { currentPassword: 'TempPass-777', newPassword: 'NewStrong-2026' }, first.token).ok, true);
    assert.equal(login('U01', 'NewStrong-2026').data.mustChangePassword, false);
});

test('ลงทะเบียน → รออนุมัติ → อนุมัติ; ปฏิเสธ; ข้อมูลไม่ถูกต้องถูกปฏิเสธ', () => {
    const { env, login, tokenOf } = setup();
    const reg = { psCode: 'N01', name: 'สมาชิก ใหม่', group: 'เภสัชกร', password: 'NewMember#2026' };
    assert.equal(env.v2('auth.register', reg).ok, true);
    assert.equal(env.v2('auth.register', { ...reg, psCode: 'u01' }).ok, false, 'PS Code ซ้ำ');
    assert.equal(env.v2('auth.register', { ...reg, psCode: 'N02', password: '@12345' }).ok, false, 'รหัสอ่อน');
    assert.equal(env.v2('auth.register', { ...reg, psCode: '=CMD()' }).ok, false);
    assert.equal(login('N01', 'NewMember#2026').error.code, 'PENDING_APPROVAL');
    assert.equal(login('N01', 'wrong').error.code, 'WRONG_CREDENTIALS', 'ไม่เปิดเผยสถานะเมื่อรหัสผิด');
    const admin = tokenOf('ADM', 'AdminPass#99');
    assert.equal(env.v2('users.approve', { psCode: 'N01', level: 'pharmacist' }, admin).ok, true);
    assert.equal(login('N01', 'NewMember#2026').data.user.level, 'pharmacist');

    env.v2('auth.register', { ...reg, psCode: 'N03' });
    env.v2('users.reject', { psCode: 'N03' }, admin);
    assert.equal(login('N03', 'NewMember#2026').error.code, 'REJECTED');
});

test('ลืมรหัสผ่าน: ตอบเหมือนกันเสมอ, บันทึกเฉพาะผู้ใช้จริงและไม่ซ้ำ', () => {
    const { env } = setup();
    const real = env.v2('auth.requestReset', { userCode: 'U01' });
    const fake = env.v2('auth.requestReset', { userCode: 'NOBODY' });
    assert.equal(real.data.message, fake.data.message);
    env.v2('auth.requestReset', { userCode: '9990000000001' });
    assert.deepEqual(plain(env.sheets.Password_Resets.rows.slice(1).map(r => [r[1], r[3]])), [['U01', 'PENDING']]);
});

test('users.list ไม่ส่ง hash และปิดเลขบัตร; users.update ยกเลิก session และแก้ตัวเองไม่ได้', () => {
    const { env, tokenOf, login, nextMs } = setup();
    const admin = tokenOf('ADM', 'AdminPass#99');
    const list = env.v2('users.list', {}, admin).data;
    assert.doesNotMatch(JSON.stringify(list), /sha256|9990000000001/);
    assert.equal(list.users.find(u => u.psCode === 'U01').id13, '*********0001');

    const userToken = tokenOf('U01', 'StrongPass#1');
    nextMs();
    assert.equal(env.v2('users.update', { psCode: 'ADM', active: false }, admin).ok, false, 'แก้ตัวเองไม่ได้');
    assert.equal(env.v2('users.update', { psCode: 'U01', level: 'root' }, admin).ok, false);
    assert.equal(env.v2('users.update', { psCode: 'U01', active: false }, admin).ok, true);
    assert.equal(env.v2('reports.list', {}, userToken).error.code, 'AUTH_REQUIRED', 'session ถูกยกเลิก');
    assert.equal(login('U01', 'StrongPass#1').error.code, 'DISABLED');
});
