const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/apps-script-env');

const USERS_HEADER = ['PS Code', 'ID13', 'ชื่อ', 'กลุ่ม', 'ระดับ', 'อีเมล', 'รหัสผ่าน', 'status'];
const LEGACY_HEADER = ['วันที่เกิดเหตุ', 'ReportID', 'เวร', 'ประเภท', 'สถานที่', 'กระบวนการ', 'ข้อผิดพลาด',
    'รายการถูกต้อง', 'รายการผิด', 'สาเหตุ', 'รายละเอียดเพิ่มเติม', 'ผู้รายงาน', 'timestamp'];
const DRUG_HEADER = ['Drug Code', 'Drug Name', 'Group', 'HAD', 'Status', 'Unit', 'Strength', 'Dosage Form', 'TMT Code', 'Unit Price'];

// JSON round-trip: object จาก vm context → object ของ realm นี้ (deepEqual เทียบ prototype)
const plain = v => JSON.parse(JSON.stringify(v));

function setup(opts = {}) {
    const env = createEnv({
        ...opts,
        sheets: {
            Users: [USERS_HEADER],
            Predispensing_Errors: [LEGACY_HEADER],
            Drug_List: [DRUG_HEADER, ['010', 'BCG vaccine', 'ITEM_IN1', 0, 1], ['MORPH10', 'Morphine 10 mg', 'ITEM_IN1', 1, 1],
                ['PARA500', 'Paracetamol 500 mg', 'ITEM_IN1', 0, 1]],
            Audit_Log: [['Timestamp', 'Event', 'UserCode', 'Details', 'IP']],
            Password_Resets: [['วันที่ขอ', 'PS Code', 'ชื่อ', 'สถานะ', 'ดำเนินการโดย', 'วันที่ดำเนินการ']]
        }
    });
    const addUser = (psCode, level, password, { id13 = '', active = true, group = 'เภสัชกร' } = {}) => {
        const stored = password === null ? '' : (password.startsWith('PLAIN:') ? password.slice(6) : env.gs.hashPassword(password));
        env.sheets.Users.appendRow([psCode, id13, `ชื่อ ${psCode}`, group, level, '', stored, active]);
    };
    addUser('ADM', 'admin', 'AdminPass#99');
    addUser('P01', 'pharmacist', 'PharmPass#11');
    addUser('U01', 'user', 'UserPass#11', { id13: '9990000000101' });
    const tokenOf = (code, pw) => env.v2('auth.login', { userCode: code, password: pw }).data.token;
    return { env, addUser, tokenOf };
}

const REPORT = {
    eventDate: '2026-10-01', shift: 'เช้า', patientType: 'ผู้ป่วยนอก', location: 'ห้องจ่ายยาผู้ป่วยนอกชั้น1',
    process: 'จัดยา', errorDetail: 'จัดผิดชนิด', cause: 'ความเร่งรีบ',
    correctDrugText: 'Paracetamol 500 mg (PARA500)', incorrectDrugCode: 'MORPH10'
};

test('โหลดไฟล์ backend ได้ทุกลำดับ (ไม่มีการอ้างค่าคงที่ข้ามไฟล์ตอนโหลด)', () => {
    const env = createEnv({ fileOrder: 'reverse', sheets: { Users: [USERS_HEADER] } });
    assert.equal(typeof env.gs.handleV2, 'function');
    assert.equal(env.v2('nope.action').error.code, 'UNKNOWN_ACTION');
});

test('Table: สร้าง Sheet ตาม schema, เก็บรหัสเป็นข้อความ, update ตามชื่อคอลัมน์', () => {
    const { env } = setup();
    const table = env.gs.Table('Reports');
    const header = plain(env.sheets.Reports.rows[0]);
    assert.equal(header[0], 'id');
    assert.ok(['correctDrugCode', 'incorrectDrugCode', 'isHad', 'hadDrugCodes', 'reporterPsCode'].every(c => header.includes(c)));
    assert.deepEqual(plain(table.header), header);
    table.append({ id: 'R1', eventDate: '2026-10-01', correctDrugCode: '010', isHad: true, details: '=HACK()' });
    const row = env.gs.Table('Reports').findBy('id', 'R1');
    assert.equal(row.correctDrugCode, '010', 'ไม่กลายเป็นเลข 10');
    assert.equal(row.isHad, true);
    const detailsCol = plain(env.sheets.Reports.rows[0]).indexOf('details');
    assert.equal(env.sheets.Reports.rows[1][detailsCol], "'=HACK()", 'เก็บแบบข้อความ (ไม่ถูกตีความเป็นสูตร)');
    assert.equal(row.details, '=HACK()');
    env.gs.Table('Reports').update(row._row, { cause: 'เหนื่อย' });
    assert.equal(env.gs.Table('Reports').findBy('id', 'R1').cause, 'เหนื่อย');
    assert.throws(() => env.gs.Table('Reports').update(row._row, { nope: 1 }), /Unknown column/);
});

test('token: ลงลายเซ็น/ตรวจได้, แก้ payload ไม่ได้, หมดอายุ 12 ชม., logout ยกเลิก', () => {
    const { env, tokenOf } = setup({ now: '2026-10-05T08:00:00+07:00' });
    const token = tokenOf('U01', 'UserPass#11');
    assert.equal(env.v2('auth.me', {}, token).data.user.psCode, 'U01');

    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), l: 'admin' })).toString('base64url');
    assert.equal(env.v2('auth.me', {}, `${forged}.${sig}`).error.code, 'AUTH_REQUIRED', 'ปลอม level ไม่ได้');

    env.setNow('2026-10-05T19:59:00+07:00');
    assert.equal(env.v2('auth.me', {}, token).ok, true, 'ยังไม่ครบ 12 ชม.');
    env.setNow('2026-10-05T20:00:01+07:00');
    assert.equal(env.v2('auth.me', {}, token).error.code, 'AUTH_REQUIRED', 'หมดอายุ');

    env.setNow('2026-10-06T08:00:00+07:00');
    const fresh = tokenOf('U01', 'UserPass#11');
    env.setNow('2026-10-06T08:00:01+07:00');
    env.v2('auth.logout', {}, fresh);
    assert.equal(env.v2('auth.me', {}, fresh).error.code, 'AUTH_REQUIRED');
});

test('auth.login ตอบ error code ชัดเจน', () => {
    const { env, addUser } = setup();
    addUser('P99', 'pharmacist', 'PLAIN:@12345');
    addUser('OFF', 'user', 'OffPass#123', { active: false });
    assert.equal(env.v2('auth.login', { userCode: 'P99', password: '@12345' }).error.code, 'DEFAULT_PASSWORD_BLOCKED');
    assert.equal(env.v2('auth.login', { userCode: 'OFF', password: 'OffPass#123' }).error.code, 'DISABLED');
    assert.equal(env.v2('auth.login', { userCode: 'U01', password: 'nope' }).error.code, 'WRONG_CREDENTIALS');
    assert.equal(env.v2('auth.login', { userCode: '', password: '' }).error.code, 'MISSING_FIELDS');
    const ok = env.v2('auth.login', { userCode: '9990000000101', password: 'UserPass#11' });
    assert.equal(ok.data.user.psCode, 'U01', 'login ด้วย ID13 ได้');
    assert.equal(ok.data.expiresIn, 12 * 3600);
});

test('รหัสเปิดใช้งาน: admin ออกให้ทุกคนที่ใช้รหัสอ่อน → ผู้ใช้ตั้งรหัสเอง → ใช้ซ้ำไม่ได้', () => {
    const { env, addUser, tokenOf } = setup();
    addUser('S01', 'user', 'PLAIN:@12345');
    addUser('S02', 'user', null);
    env.sheets.Password_Resets.appendRow(['2026-10-04', 'S01', 'ชื่อ S01', 'PENDING', '', '']);
    const admin = tokenOf('ADM', 'AdminPass#99');

    assert.equal(env.v2('users.issueActivations', { weakOnly: true }, tokenOf('P01', 'PharmPass#11')).error.code, 'FORBIDDEN');
    const issued = env.v2('users.issueActivations', { weakOnly: true }, admin);
    assert.equal(issued.ok, true);
    const items = issued.data.items;
    assert.deepEqual(items.map(i => i.psCode).sort(), ['S01', 'S02']);
    assert.match(items[0].code, /^[A-HJ-NP-Z2-9]{8}$/);
    assert.equal(env.sheets.Password_Resets.rows[1][3], 'DONE', 'ปิดคำขอรีเซ็ตที่ค้าง');
    assert.ok(!JSON.stringify(env.sheets.Activations.rows).includes(items[0].code), 'เก็บเฉพาะ hash');

    const s01 = items.find(i => i.psCode === 'S01');
    assert.equal(env.v2('auth.activate', { userCode: 'S01', code: 'WRONGCOD', newPassword: 'MyNewPass#1' }).error.code, 'ACTIVATION_INVALID');
    assert.equal(env.v2('auth.activate', { userCode: 'S01', code: s01.code, newPassword: '@12345' }).error.code, 'WEAK_PASSWORD');

    const activated = env.v2('auth.activate', { userCode: 's01', code: s01.code.toLowerCase().replace(/(.{4})/, '$1-'), newPassword: 'MyNewPass#1' });
    assert.equal(activated.ok, true, 'ไม่สนตัวพิมพ์/ขีด');
    assert.equal(env.v2('auth.me', {}, activated.data.token).data.user.psCode, 'S01', 'เข้าระบบได้ทันที');
    assert.equal(env.v2('auth.login', { userCode: 'S01', password: 'MyNewPass#1' }).ok, true);
    assert.equal(env.v2('auth.activate', { userCode: 'S01', code: s01.code, newPassword: 'Another#Pass1' }).error.code, 'ACTIVATION_INVALID', 'ใช้ครั้งเดียว');
});

test('รหัสเปิดใช้งาน: หมดอายุหลัง 14 วัน และออกใหม่แทนรหัสเก่า', () => {
    const { env, addUser } = setup({ now: '2026-10-05T08:00:00+07:00' });
    addUser('S01', 'user', 'PLAIN:@12345');
    const admin = env.v2('auth.login', { userCode: 'ADM', password: 'AdminPass#99' }).data.token;
    const first = env.v2('users.issueActivations', { psCodes: ['S01'] }, admin).data.items[0];
    const second = env.v2('users.issueActivations', { psCodes: JSON.stringify(['S01']) }, admin).data.items[0];
    assert.equal(env.v2('auth.activate', { userCode: 'S01', code: first.code, newPassword: 'MyNewPass#1' }).error.code, 'ACTIVATION_INVALID', 'รหัสเก่าถูกแทนที่');

    env.setNow('2026-10-19T08:00:01+07:00');
    assert.equal(env.v2('auth.activate', { userCode: 'S01', code: second.code, newPassword: 'MyNewPass#1' }).error.code, 'ACTIVATION_INVALID', 'หมดอายุ');
});

test('reports.create: เติมรหัสยา/HAD ฝั่ง server, เขียน Sheet เดิมเสมอ และ Reports เมื่อ migrate แล้ว', () => {
    const { env, tokenOf } = setup();
    const token = tokenOf('U01', 'UserPass#11');

    const missing = env.v2('reports.create', { eventDate: '2026-10-01' }, token);
    assert.equal(missing.error.code, 'VALIDATION');
    assert.ok(missing.error.fields.includes('process'));
    assert.equal(env.v2('reports.create', { ...REPORT, eventDate: '2099-01-01' }, token).error.code, 'VALIDATION', 'วันที่ในอนาคต');

    const created = env.v2('reports.create', { ...REPORT, submissionToken: 'tok-1' }, token);
    assert.equal(created.ok, true);
    assert.match(created.data.id, /^PE\d{14}$/);
    assert.equal(created.data.isHad, true);
    assert.deepEqual(plain(created.data.hadDrugCodes), ['MORPH10']);
    assert.equal(env.v2('reports.create', { ...REPORT, submissionToken: 'tok-1' }, token).data.duplicate, true, 'idempotent');

    const legacy = env.sheets.Predispensing_Errors.rows;
    assert.equal(legacy.length, 2);
    assert.equal(legacy[1][7], 'Paracetamol 500 mg (PARA500)');
    assert.equal(legacy[1][8], 'Morphine 10 mg (MORPH10)');
    assert.equal(legacy[1][11], 'ชื่อ U01 (U01) - เภสัชกร/user');
    assert.equal(env.sheets.Reports, undefined, 'ยังไม่ migrate → ยังไม่เขียน Reports');

    env.gs.setMeta('reportsMigrated', 'true');
    env.v2('reports.create', { ...REPORT, location: 'รพ.สต.', substation: 'รพ.สต.แทง' }, token);
    const reports = env.gs.Table('Reports').all();
    assert.equal(reports.length, 1);
    assert.equal(reports[0].incorrectDrugCode, 'MORPH10');
    assert.equal(reports[0].substation, 'รพ.สต.แทง');
    assert.equal(env.sheets.Predispensing_Errors.rows[2][4], 'รพ.สต.แทง', 'Sheet เดิมเก็บแบบเดิม');
});

test('compat append (frontend เดิม) เขียนลง Reports ด้วยเมื่อ migrate แล้ว', () => {
    const { env } = setup();
    env.gs.setMeta('reportsMigrated', 'true');
    const token = env.post({ action: 'login', userCode: 'U01', password: 'UserPass#11' }).token;
    const res = env.post({ action: 'append', token, eventDate: '2026-10-02', reportId: 'PE-OLD-1', shift: 'บ่าย',
        errorType: 'ผู้ป่วยใน', location: 'รพ.สต.แทง', process: 'จัดยา', errorDetail: 'x', correctItem: 'BCG vaccine (010)',
        incorrectItem: 'Morphine 10 mg', cause: 'y', submissionToken: 's1' });
    assert.equal(res.success, true);
    const r = env.gs.Table('Reports').findBy('id', 'PE-OLD-1');
    assert.equal(r.correctDrugCode, '010');
    assert.equal(r.incorrectDrugCode, 'MORPH10', 'จับคู่จากชื่อยา');
    assert.equal(r.isHad, true);
    assert.equal(r.reporterPsCode, 'U01');
    assert.deepEqual([r.location, r.substation], ['รพ.สต.', 'รพ.สต.แทง']);
});

test('reports.list: กรอง/แบ่งหน้า/redaction ตาม role (อ่านจาก Sheet เดิมก่อน migrate)', () => {
    const { env, tokenOf } = setup();
    const legacy = env.sheets.Predispensing_Errors;
    for (let i = 1; i <= 5; i++) {
        legacy.appendRow([`2026-09-0${i}`, `R${i}`, 'เช้า', 'ผู้ป่วยนอก', 'OPD', i % 2 ? 'จัดยา' : 'คีย์ยา', 'e', 'BCG vaccine (010)', '',
            'c', `ลับ ${i}`, i === 1 ? 'ชื่อ U01 (U01) - เภสัชกร/user' : 'ชื่อ P01 (P01) - เภสัชกร/pharmacist', 't']);
    }
    const user = tokenOf('U01', 'UserPass#11');
    const page1 = env.v2('reports.list', { pageSize: 2 }, user).data;
    assert.equal(page1.total, 5);
    assert.deepEqual(page1.items.map(r => r.id), ['R5', 'R4'], 'ใหม่ก่อน');
    assert.equal(page1.items[0].reporterName, '(ผู้รายงานอื่น)');
    assert.equal(page1.items[0].details, '');
    assert.equal(page1.items[0].correctDrugCode, '010');

    const mine = env.v2('reports.list', { mine: true }, user).data;
    assert.deepEqual(mine.items.map(r => [r.id, r.details]), [['R1', 'ลับ 1']]);
    assert.equal(env.v2('reports.list', { process: 'คีย์ยา', from: '2026-09-03' }, user).data.total, 1);

    const pharm = env.v2('reports.list', {}, tokenOf('P01', 'PharmPass#11')).data;
    assert.equal(pharm.items.find(r => r.id === 'R1').reporterName, 'ชื่อ U01');
});

test('computeStats: ยอดตามช่วงเวลา/ปีงบ/HAD/แนวโน้ม ตรงกับการนับมือ', () => {
    const { env } = setup();
    const r = (eventDate, extra = {}) => ({ eventDate, process: 'จัดยา', cause: 'c', shift: 'เช้า', location: 'OPD', isHad: false, ...extra });
    const stats = plain(env.gs.computeStats([
        r('2026-10-05', { isHad: true, hadDrugCodes: 'MORPH10', incorrectDrugCode: 'MORPH10', incorrectDrugName: 'Morphine' }),
        r('2026-10-04', { process: 'คีย์ยา' }),
        r('2026-09-30'),               // ปีงบที่แล้ว (เริ่ม 1 ต.ค.)
        r('2026-09-29'),               // 7 วันล่าสุด: 29 ก.ย. – 5 ต.ค.
        r('2025-11-01', { reporterPsCode: 'P01', reporterName: 'P' }),
        r('bad-date')
    ], { today: '2026-10-05', includeReporters: true }));
    assert.deepEqual(stats.totals, { all: 5, fiscalYear: 2, month: 2, last7: 4, today: 1, had: 1 });
    assert.equal(stats.monthly.length, 12);
    assert.deepEqual(stats.monthly[0], { month: '2025-11', count: 1 });
    assert.deepEqual(stats.monthly[11], { month: '2026-10', count: 2 });
    assert.deepEqual(stats.byProcess.map(e => [e.key, e.count]), [['จัดยา', 4], ['คีย์ยา', 1]]);
    assert.deepEqual(stats.topHadDrugs, [{ key: 'MORPH10', label: 'Morphine', count: 1 }]);
    assert.deepEqual(stats.byReporter.map(e => e.key), ['P01']);
});

test('reports.stats: user ไม่เห็นรายชื่อผู้รายงาน, cache ถูกล้างเมื่อมีรายงานใหม่', () => {
    const { env, tokenOf } = setup();
    const user = tokenOf('U01', 'UserPass#11');
    const before = env.v2('reports.stats', {}, user).data;
    assert.equal(before.totals.all, 0);
    assert.equal(before.byReporter, undefined);
    env.v2('reports.create', REPORT, user);
    assert.equal(env.v2('reports.stats', {}, user).data.totals.all, 1, 'ไม่ได้ค่าจาก cache เก่า');
    assert.ok(Array.isArray(env.v2('reports.stats', {}, tokenOf('P01', 'PharmPass#11')).data.byReporter));
});

test('auth.me แสดงงานค้างให้ admin, admin.loginStats สรุปบัญชี', () => {
    const { env, addUser, tokenOf } = setup();
    addUser('S01', 'user', 'PLAIN:@12345', { group: '' });
    env.v2('auth.register', { psCode: 'N01', name: 'สมาชิก ใหม่', group: 'เภสัชกร', password: 'NewMember#2026' });
    env.v2('auth.requestReset', { userCode: 'U01' });
    env.v2('auth.login', { userCode: 'S01', password: '@12345' });

    const admin = tokenOf('ADM', 'AdminPass#99');
    assert.deepEqual(plain(env.v2('auth.me', {}, admin).data.pendingCounts), { registrations: 1, resets: 1 });
    assert.equal(env.v2('auth.me', {}, tokenOf('U01', 'UserPass#11')).data.pendingCounts, undefined);

    const stats = env.v2('admin.loginStats', { days: 7 }, admin).data;
    assert.equal(stats.accounts.weakPassword, 1);
    assert.equal(stats.accounts.missingGroup, 1);
    const totals = stats.days.reduce((acc, d) => { Object.entries(d.counts).forEach(([k, v]) => { acc[k] = (acc[k] || 0) + v; }); return acc; }, {});
    assert.equal(totals.LOGIN_BLOCKED_WEAK, 1);
    assert.equal(totals.RESET_REQUESTED, 1);
});

test('users.update แก้กลุ่มงานได้ และ drugs.list เป็น public', () => {
    const { env, tokenOf } = setup();
    const admin = tokenOf('ADM', 'AdminPass#99');
    assert.equal(env.v2('users.update', { psCode: 'U01', group: 'เจ้าพนักงานเภสัชกรรม' }, admin).ok, true);
    assert.equal(env.sheets.Users.rows.find(r => r[0] === 'U01')[3], 'เจ้าพนักงานเภสัชกรรม');
    const drugs = env.get({ action: 'drugs.list' }).data.drugs;
    assert.equal(drugs.find(d => d.drugCode === 'MORPH10').had, 'High');
});

test('reports.stats hadOnly: แนวโน้ม 12 เดือนไม่ขึ้นกับช่วงวันที่ และมียอดรวมทุกเหตุการณ์ไว้คำนวณสัดส่วน', () => {
    const { env, tokenOf } = setup({ now: '2026-10-05T10:00:00+07:00' });
    const token = tokenOf('P01', 'PharmPass#11');
    env.v2('reports.create', { ...REPORT, eventDate: '2026-10-02' }, token);                         // HAD
    env.v2('reports.create', { ...REPORT, eventDate: '2026-08-15' }, token);                         // HAD (นอกช่วง)
    env.v2('reports.create', { ...REPORT, eventDate: '2026-10-03', incorrectDrugCode: 'PARA500' }, token); // ไม่ใช่ HAD

    const s = env.v2('reports.stats', { hadOnly: true, from: '2026-10-01', to: '2026-10-31' }, token).data;
    assert.equal(s.totals.all, 1, 'HAD ในช่วง ต.ค.');
    assert.equal(s.comparison.allInRange, 2, 'ทุกเหตุการณ์ในช่วงเดียวกัน');
    const month = (list, m) => list.find(x => x.month === m).count;
    assert.equal(month(s.monthly, '2026-08'), 1, 'แนวโน้มรวมเดือนนอกช่วงที่เลือก');
    assert.equal(month(s.comparison.monthlyAll, '2026-10'), 2);
    assert.deepEqual(plain(s.topHadDrugs.map(d => [d.key, d.count])), [['MORPH10', 1]]);
});

test('resolveDrug: หารหัสในวงเล็บได้แม้มีข้อความต่อท้าย', () => {
    const { env } = setup();
    const index = env.gs.buildDrugIndex([{ drugCode: 'TMDHC1', drugName: 'TRAMADOL HCL CAP 50 MG', had: 'Regular' }]);
    const r = plain(env.gs.resolveDrug(index, 'TRAMADOL HCL CAP 50 MG (TMDHC1) จำนวน 30 เม็ด'));
    assert.deepEqual([r.code, r.matched], ['TMDHC1', true]);
    assert.equal(plain(env.gs.resolveDrug(index, 'ไม่ได้พิมพ์ฉลากยา')).matched, false);
});
