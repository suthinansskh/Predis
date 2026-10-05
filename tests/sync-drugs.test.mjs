import test from 'node:test';
import assert from 'node:assert/strict';
import { toDrug, diffDrugs } from '../tools/sync-drugs.js';

test('toDrug แปลงแถว HOSxP, รวมบรรทัดใหม่ในชื่อยา และไม่ใช้ธง HAD ของ HOSxP', () => {
    const drug = toDrug({
        itemcode: ' FCNS1 ', Name: 'Flecainide syrup(ยาผลิต,\r\nอายุ 7 วัน)', ItemType: 'ITEM_IN1',
        high_alert_drug: 1, no_use: 0, UnitName: 'ขวด', strength: null, dosage_form: undefined,
        tmt_code: '123', UnitPrice: 85
    });
    assert.deepEqual(drug, {
        drugCode: 'FCNS1', drugName: 'Flecainide syrup(ยาผลิต, อายุ 7 วัน)', group: 'ITEM_IN1',
        had: 'Regular', status: 'Active', unit: 'ขวด', strength: '', dosageForm: '', tmtCode: '123', unitPrice: 85
    });
});

test('diffDrugs แยกรายการเพิ่ม/ลบ/เปลี่ยน', () => {
    const a = { drugCode: 'A', drugName: 'a' };
    const b = { drugCode: 'B', drugName: 'b' };
    const c = { drugCode: 'C', drugName: 'c' };
    const { added, removed, changed } = diffDrugs([a, b], [{ ...b, drugName: 'b2' }, c]);
    assert.deepEqual(added.map(d => d.drugCode), ['C']);
    assert.deepEqual(removed.map(d => d.drugCode), ['A']);
    assert.deepEqual(changed.map(d => d.drugCode), ['B']);
});

test('applyOverrides ใช้ค่า HAD/สถานะที่แก้ในแอปแทนค่าจาก HOSxP', async () => {
    const { applyOverrides } = await import('../tools/sync-drugs.js');
    const drugs = [
        { drugCode: '010', had: 'Regular', status: 'Active' },
        { drugCode: 'MORPH10', had: 'Regular', status: 'Active' }
    ];
    const overrides = new Map([['010', { had: '', status: 'Inactive' }], ['MORPH10', { had: 'High', status: '' }]]);
    const { drugs: out, applied } = applyOverrides(drugs, overrides);
    assert.equal(applied, 2);
    assert.deepEqual(out.map(d => [d.had, d.status]), [['Regular', 'Inactive'], ['High', 'Active']]);
});
