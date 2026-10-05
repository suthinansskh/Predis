import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const BUNDLED = [
    { drugCode: '010', drugName: 'BCG vaccine', had: 'Regular', status: 'Active' },
    { drugCode: 'MORPH10', drugName: 'Morphine 10 mg', had: 'Regular', status: 'Active' }
];
const SERVER = [...BUNDLED, { drugCode: 'NEW1', drugName: 'New drug', had: 'Regular', status: 'Active' }];

// drugStore เป็น state ระดับ module → import ใหม่ทุกเทส
async function setup({ overrides = [], serverFails = false } = {}) {
    vi.resetModules();
    const mod = await import('../src/composables/drugs.js');
    const calls = [];
    const api = {
        get: vi.fn(async action => {
            calls.push(action);
            if (action === 'drugs.overrides') return { overrides };
            if (serverFails) throw new Error('timeout');
            return { drugs: SERVER };
        })
    };
    return { ...mod, api, calls };
}

describe('loadDrugs', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => BUNDLED })));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('ครั้งแรก: drug_list.json + HAD ที่แก้ในแอป แล้วรีเฟรชรายการเต็มจาก server', async () => {
        const { loadDrugs, drugStore } = await setup();
        let finishServer;
        const api = {
            get: async action => (action === 'drugs.overrides'
                ? { overrides: [{ drugCode: 'morph10', had: 'High', status: '' }] }
                : new Promise(resolve => { finishServer = () => resolve({ drugs: SERVER }); }))
        };
        const done = loadDrugs(api);
        await vi.waitFor(() => expect(drugStore.source).toBe('bundled'));
        expect(drugStore.drugs.find(d => d.drugCode === 'MORPH10').had).toBe('High', 'ใช้ได้ก่อน server ตอบ');
        expect(drugStore.offline).toBe(false);
        finishServer();
        await done;
        expect(drugStore.source).toBe('server');
    });

    it('มี cache จาก server ที่ยังใหม่ → ใช้ทันที ไม่เรียก server', async () => {
        localStorage.setItem('predis.v2.drugs', JSON.stringify({ savedAt: new Date().toISOString(), source: 'server', drugs: SERVER }));
        const { loadDrugs, drugStore, api } = await setup();
        const p = loadDrugs(api);
        expect(drugStore.loaded).toBe(true); // ก่อน await
        expect(drugStore.drugs).toHaveLength(3);
        await p;
        expect(api.get).not.toHaveBeenCalled();
    });

    it('cache เก่า + server ล่ม → ใช้ cache และแจ้งว่าอาจไม่เป็นปัจจุบัน', async () => {
        const old = new Date(Date.now() - 7 * 3600e3).toISOString();
        localStorage.setItem('predis.v2.drugs', JSON.stringify({ savedAt: old, source: 'server', drugs: SERVER }));
        const { loadDrugs, drugStore, api } = await setup({ serverFails: true });
        await loadDrugs(api);
        expect(drugStore.drugs).toHaveLength(3);
        expect(drugStore.offline).toBe(true);
        expect(drugStore.error).toBe('');
    });

    it('cache เก่า → รีเฟรชจาก server เบื้องหลัง ได้ยาที่เพิ่มใหม่', async () => {
        const old = new Date(Date.now() - 7 * 3600e3).toISOString();
        localStorage.setItem('predis.v2.drugs', JSON.stringify({ savedAt: old, source: 'server', drugs: BUNDLED }));
        const { loadDrugs, drugStore, api } = await setup();
        await loadDrugs(api);
        expect(drugStore.source).toBe('server');
        expect(drugStore.drugs.map(d => d.drugCode)).toContain('NEW1');
        expect(JSON.parse(localStorage.getItem('predis.v2.drugs')).source).toBe('server');
    });

    it('force (หน้ารายการยา) → โหลดรายการเต็มจาก server เสมอ', async () => {
        localStorage.setItem('predis.v2.drugs', JSON.stringify({ savedAt: new Date().toISOString(), source: 'server', drugs: BUNDLED }));
        const { loadDrugs, drugStore, api } = await setup();
        await loadDrugs(api);
        await loadDrugs(api, { force: true });
        expect(api.get).toHaveBeenCalledWith('drugs.list');
        expect(drugStore.drugs).toHaveLength(3);
    });

    it('mergeOverrides: เปลี่ยนเฉพาะค่าที่ระบุ', async () => {
        const { mergeOverrides } = await setup();
        const merged = mergeOverrides(BUNDLED, [{ drugCode: '010', had: '', status: 'Inactive' }]);
        expect(merged[0]).toMatchObject({ had: 'Regular', status: 'Inactive' });
        expect(merged[1]).toBe(BUNDLED[1]);
    });
});
