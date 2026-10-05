import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBackend, convertRows } from '../tools/migrate-reports.js';

const row = (id, date, extra = {}) => {
    const r = [date, id, 'เช้า', 'ผู้ป่วยนอก', 'OPD', 'จัดยา', 'จัดผิดชนิด', 'BCG vaccine (010)', 'Morphine 10 mg', 'c', '', 'ชื่อ หนึ่ง (U01) - เภสัชกร/user', date + ' 09:00:00'];
    Object.entries(extra).forEach(([i, v]) => { r[i] = v; });
    return r;
};

test('convertRows: แปลงแถวเดิม, จัดการ ID ซ้ำ, เติมผู้รายงานจาก Users, คำนวณ HAD', () => {
    const backend = loadBackend();
    const { reports, stats } = convertRows(backend, {
        legacyRows: [
            row('PE1', '2026-10-01'),
            row('PE1', '2026-10-01', { 12: '2026-10-01 09:05:00' }),       // ส่งซ้ำ (ต่างแค่เวลาบันทึก)
            row('PE1', '2026-10-01', { 6: 'จัดผิดขนาด' }),                   // คนละรายงาน ID ชน
            row('PE2', '2026-10-02', { 11: 'ชื่อ สอง', 4: 'รพ.สต.แทง' }),    // ผู้รายงานแบบเก่า (ไม่มี PS)
            row('', '2026-10-03'),
            row('PE260611105050', '2026-06-11'),
            row('PE260611105050', '', { 12: '' }),                          // submitViaForm: ส่งซ้ำไม่มีวันที่
            row('PE260612090000', '', { 6: 'อื่น', 12: '' })                 // ไม่มีวันที่ ไม่ซ้ำ
        ],
        drugRows: [['010', 'BCG vaccine', 'ITEM_IN1', 0, 1], ['MORPH10', 'Morphine 10 mg', 'ITEM_IN1', 0, 1]],
        overrideRows: [["'MORPH10", 'High', 'Active']],
        userRows: [['U02', '', 'ชื่อ สอง']]
    });
    assert.deepEqual(reports.map(r => r.id), ['PE1', 'PE1-2', 'PE2', 'PE260611105050', 'PE260612090000']);
    assert.deepEqual([stats.duplicateRows, stats.renamedIds, stats.skippedNoId], [2, 1, 1]);
    assert.equal(reports[4].eventDate, '2026-06-12', 'วันที่จาก Report ID');
    assert.equal(stats.badDate, 0);
    assert.equal(reports[0].correctDrugCode, '010');
    assert.equal(reports[0].incorrectDrugCode, 'MORPH10');
    assert.equal(reports[0].isHad, true, 'HAD จาก override ของห้องยา');
    assert.equal(reports[2].reporterPsCode, 'U02', 'เติมจากชื่อใน Users');
    assert.deepEqual([reports[2].location, reports[2].substation], ['รพ.สต.', 'รพ.สต.แทง']);
    assert.ok(reports.every(r => r.source === 'migrated'));
});
