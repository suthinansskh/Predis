// รายการยา: แสดงทันทีจาก cache ในเครื่อง หรือ drug_list.json ที่มากับเว็บ (+ HAD/สถานะที่ห้องยาแก้ในแอป)
// แล้วค่อยรีเฟรชรายการเต็มจาก server เบื้องหลังเมื่อ cache เก่า (ไม่มีข้อมูลยาตัวอย่าง)
import { reactive } from 'vue';
import { readJson, writeJson } from '../lib/util.js';

const CACHE_KEY = 'predis.v2.drugs';

export const drugStore = reactive({
    drugs: [],
    loaded: false,
    loading: false,
    error: '',
    source: '', // server | cache | bundled
    offline: false, // โหลดข้อมูลล่าสุดไม่ได้ → ใช้ข้อมูลในเครื่อง (อาจไม่เป็นปัจจุบัน)
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

function apply(drugs, source, updatedAt, offline = false) {
    drugStore.drugs = drugs.map(normalize).filter(d => d.drugCode);
    drugStore.source = source;
    drugStore.updatedAt = updatedAt || new Date().toISOString();
    drugStore.loaded = true;
    drugStore.offline = offline;
    drugStore.error = '';
}

const SERVER_REFRESH_MS = 6 * 60 * 60 * 1000;

function saveCache(source) {
    writeJson(CACHE_KEY, { savedAt: drugStore.updatedAt, source, drugs: drugStore.drugs });
}

async function fetchBundled() {
    const res = await fetch('./drug_list.json');
    if (!res.ok) throw new Error(`drug_list.json HTTP ${res.status}`, { cause: res });
    return res.json();
}

/** drug_list.json + ค่าที่แก้ในแอป (drugs.overrides — เล็กและเร็ว) */
export function mergeOverrides(drugs, overrides) {
    const byCode = new Map((overrides || []).map(o => [String(o.drugCode).toUpperCase(), o]));
    return drugs.map(d => {
        const o = byCode.get(String(d.drugCode || d.code || '').toUpperCase());
        if (!o) return d;
        return { ...d, ...(o.had ? { had: o.had } : {}), ...(o.status ? { status: o.status } : {}) };
    });
}

async function loadFromServer(api) {
    const data = await api.get('drugs.list');
    if (!data.drugs || !data.drugs.length) throw new Error('ไม่มีข้อมูลยาใน Google Sheets');
    apply(data.drugs, 'server');
    saveCache('server');
}

async function loadQuick(api) {
    const [bundled, overrides] = await Promise.allSettled([fetchBundled(), api.get('drugs.overrides')]);
    if (bundled.status !== 'fulfilled' || !bundled.value.length) throw new Error('no bundled list');
    if (overrides.status !== 'fulfilled') throw new Error('no overrides'); // HAD อาจไม่ตรง → ใช้ทางอื่น
    apply(mergeOverrides(bundled.value, overrides.value.overrides), 'bundled');
    saveCache('bundled');
}

/**
 * @param {{get: Function}} api
 * @param {{force?: boolean}} opts force = โหลดรายการเต็มจาก server (หน้ารายการยา)
 */
export function loadDrugs(api, { force = false } = {}) {
    if (inflight) return inflight;
    if (drugStore.loaded && !force) return Promise.resolve(drugStore.drugs);

    const cached = readJson(CACHE_KEY);
    const hasCache = !!(cached && cached.drugs && cached.drugs.length);
    if (hasCache && !drugStore.loaded) apply(cached.drugs, 'cache', cached.savedAt); // ใช้ได้ทันที
    const stale = !hasCache || cached.source !== 'server' || Date.now() - new Date(cached.savedAt).getTime() > SERVER_REFRESH_MS;

    drugStore.loading = true;
    inflight = (async () => {
        try {
            if (force) {
                await loadFromServer(api);
            } else {
                if (!hasCache) {
                    try { await loadQuick(api); } catch { /* ใช้รายการเต็มจาก server แทน */ }
                }
                if (stale) {
                    await loadFromServer(api).catch(e => {
                        if (!drugStore.loaded) throw e;
                        if (drugStore.source === 'cache') drugStore.offline = true;
                    });
                }
            }
        } catch {
            // server ใช้ไม่ได้ → ข้อมูลที่แสดงอยู่ (cache) → ไฟล์ที่มากับเว็บ
            if (drugStore.loaded) {
                drugStore.offline = drugStore.source !== 'server';
            } else {
                try {
                    apply(await fetchBundled(), 'bundled', undefined, true);
                } catch {
                    drugStore.error = 'ไม่สามารถโหลดรายการยาได้ — การค้นหาและตรวจสอบยา HAD จะใช้ไม่ได้จนกว่าจะโหลดสำเร็จ';
                }
            }
        } finally {
            drugStore.loading = false;
        }
        return drugStore.drugs;
    })().finally(() => { inflight = null; }); // หลัง assign เสมอ (body อาจจบแบบ synchronous)
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
    saveCache(drugStore.source);
}
