// คิวรายงานที่ส่งไม่ได้ตอนออฟไลน์ — เก็บใน localStorage แล้วส่งเมื่อออนไลน์
// ส่งเฉพาะรายการของผู้ใช้ที่ login อยู่ (server ใช้ผู้รายงานจาก token) และส่งซ้ำได้ (submissionToken)
import { ref } from 'vue';
import { readJson, writeJson, removeKey } from '../lib/util.js';
import { SUBSTATION_LOCATION } from '../constants.js';

export const OUTBOX_KEY = 'predis.v2.outbox';
const LEGACY_OUTBOX_KEY = 'predisOutbox';

/** แปลงรายการค้างจากแอปเดิม (payload ของ action "append") → payload ของ reports.create */
export function convertLegacyOutboxItem(item) {
    const p = item.payload || {};
    const location = String(p.location || '');
    const isSubstation = location.startsWith(SUBSTATION_LOCATION) && location !== SUBSTATION_LOCATION;
    return {
        psCode: item.psCode,
        queuedAt: item.queuedAt,
        attempts: 0,
        lastError: '',
        payload: {
            eventDate: p.eventDate, shift: p.shift, patientType: p.errorType, process: p.process, errorDetail: p.errorDetail,
            location: isSubstation ? SUBSTATION_LOCATION : location, substation: isSubstation ? location : '',
            correctDrugText: p.correctItem || '', incorrectDrugText: p.incorrectItem || '',
            cause: p.cause, details: p.additionalDetails || '', submissionToken: p.submissionToken
        }
    };
}

function load() {
    const items = readJson(OUTBOX_KEY, []);
    const legacy = readJson(LEGACY_OUTBOX_KEY, []);
    if (Array.isArray(legacy) && legacy.length) {
        const tokens = new Set(items.map(i => i.payload.submissionToken));
        legacy.map(convertLegacyOutboxItem).forEach(i => { if (!tokens.has(i.payload.submissionToken)) items.push(i); });
        writeJson(OUTBOX_KEY, items);
        removeKey(LEGACY_OUTBOX_KEY);
    }
    return Array.isArray(items) ? items : [];
}

export function createOutbox({ call, currentPsCode, storage = { load, save: items => writeJson(OUTBOX_KEY, items) } }) {
    const items = ref(storage.load());
    let flushing = false;

    const save = () => storage.save(items.value);
    const mine = () => items.value.filter(i => i.psCode && i.psCode === currentPsCode());

    function queue(payload) {
        if (!items.value.some(i => i.payload.submissionToken === payload.submissionToken)) {
            items.value = [...items.value, { psCode: currentPsCode(), payload, queuedAt: new Date().toISOString(), attempts: 0, lastError: '' }];
            save();
        }
    }

    /** @returns {Promise<number>} จำนวนที่ส่งสำเร็จ */
    async function flush() {
        if (flushing || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 0;
        const pending = mine();
        if (!pending.length) return 0;
        flushing = true;
        let sent = 0;
        try {
            for (const item of pending) {
                try {
                    await call('reports.create', item.payload);
                    items.value = items.value.filter(i => i !== item);
                    sent++;
                } catch (error) {
                    if (error.network || error.code === 'AUTH_REQUIRED') break;
                    item.attempts += 1;
                    item.lastError = error.message;
                    items.value = [...items.value];
                }
                save();
            }
        } finally {
            flushing = false;
        }
        return sent;
    }

    return { items, mine, queue, flush };
}
