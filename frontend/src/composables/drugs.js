// รายการยา: server → cache ในเครื่อง → drug_list.json ที่มากับเว็บ (ไม่มีข้อมูลยาตัวอย่าง)
import { reactive } from 'vue';
import { readJson, writeJson } from '../lib/util.js';

const CACHE_KEY = 'predis.v2.drugs';

export const drugStore = reactive({
    drugs: [],
    loaded: false,
    loading: false,
    error: '',
    source: '', // server | cache | bundled
    updatedAt: ''
});

let inflight = null;

function normalize(d) {
    return {
        drugCode: String(d.drugCode || d.code || '').trim(),
        drugName: String(d.drugName || d.name || '').trim(),
        group: d.group || '',
        had: d.had === 'High' ? 'High' : 'Regular',
        status: d.status === 'Inactive' || d.status === false ? 'Inactive' : 'Active',
        unit: d.unit || '',
        strength: d.strength || '',
        dosageForm: d.dosageForm || '',
        tmtCode: d.tmtCode || '',
        unitPrice: d.unitPrice || 0
    };
}

function apply(drugs, source, updatedAt) {
    drugStore.drugs = drugs.map(normalize).filter(d => d.drugCode);
    drugStore.source = source;
    drugStore.updatedAt = updatedAt || new Date().toISOString();
    drugStore.loaded = true;
    drugStore.error = '';
}

/** @param {{get: Function}} api */
export function loadDrugs(api, { force = false } = {}) {
    if (inflight) return inflight;
    if (drugStore.loaded && !force) return Promise.resolve(drugStore.drugs);
    drugStore.loading = true;
    inflight = (async () => {
        try {
            const data = await api.get('drugs.list');
            if (!data.drugs || !data.drugs.length) throw new Error('ไม่มีข้อมูลยาใน Google Sheets');
            apply(data.drugs, 'server');
            writeJson(CACHE_KEY, { savedAt: drugStore.updatedAt, drugs: drugStore.drugs });
        } catch {
            // server ใช้ไม่ได้ → cache ในเครื่อง → ไฟล์ที่มากับเว็บ
            const cached = readJson(CACHE_KEY);
            if (cached && cached.drugs && cached.drugs.length) {
                apply(cached.drugs, 'cache', cached.savedAt);
            } else {
                try {
                    const res = await fetch('./drug_list.json');
                    if (!res.ok) throw new Error(`drug_list.json HTTP ${res.status}`, { cause: res });
                    apply(await res.json(), 'bundled');
                } catch {
                    drugStore.error = 'ไม่สามารถโหลดรายการยาได้ — การค้นหาและตรวจสอบยา HAD จะใช้ไม่ได้จนกว่าจะโหลดสำเร็จ';
                }
            }
        } finally {
            drugStore.loading = false;
            inflight = null;
        }
        return drugStore.drugs;
    })();
    return inflight;
}

export function findDrug(code) {
    const key = String(code || '').toUpperCase();
    return drugStore.drugs.find(d => d.drugCode.toUpperCase() === key) || null;
}

/** อัปเดตยาในรายการที่โหลดไว้ (หลังแก้ HAD/สถานะ) */
export function patchDrug(code, changes) {
    const drug = findDrug(code);
    if (drug) Object.assign(drug, changes);
    writeJson(CACHE_KEY, { savedAt: drugStore.updatedAt, drugs: drugStore.drugs });
}
