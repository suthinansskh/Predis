import { describe, it, expect, vi } from 'vitest';
import { createApi, ApiError } from '../src/api/client.js';
import { createOutbox, convertLegacyOutboxItem } from '../src/composables/outbox.js';
import { periodRange, searchDrugs, toCsv, csvCell, thaiMonthLabel, formatThaiDate, bangkokToday } from '../src/lib/util.js';
import { slipsHtml } from '../src/lib/slips.js';

const json = body => ({ ok: true, json: async () => body });

describe('api client', () => {
    const make = (responses, extra = {}) => {
        const calls = [];
        const fetchImpl = vi.fn(async (url, init) => {
            calls.push({ url, body: init.body instanceof FormData ? Object.fromEntries(init.body.entries()) : null });
            const next = responses.shift();
            if (next instanceof Error) throw next;
            return next;
        });
        const api = createApi({ url: 'https://api.test/exec', getToken: () => 'tok.sig', fetchImpl, sleep: async () => {}, ...extra });
        return { api, calls };
    };

    it('ส่ง action/token/payload และคืน data', async () => {
        const { api, calls } = make([json({ ok: true, data: { x: 1 } })]);
        await expect(api.call('reports.stats', { from: '2026-01-01' })).resolves.toEqual({ x: 1 });
        expect(calls[0].body).toEqual({ action: 'reports.stats', token: 'tok.sig', payload: '{"from":"2026-01-01"}' });
    });

    it('error จาก server → ApiError พร้อม code/retryAfter', async () => {
        const { api } = make([json({ ok: false, error: { code: 'LOCKED', message: 'รอ', retryAfter: 30 } })]);
        const error = await api.call('auth.login').catch(e => e);
        expect(error).toBeInstanceOf(ApiError);
        expect([error.code, error.retryAfter]).toEqual(['LOCKED', 30]);
    });

    it('ลองใหม่เมื่อ Google ขัดข้อง (TypeError / HTML / HTTP 404) แล้วสำเร็จ', async () => {
        const html = { ok: true, json: async () => { throw new SyntaxError('html'); } };
        const { api, calls } = make([new TypeError('Failed to fetch'), html, json({ ok: true, data: 'done' })]);
        await expect(api.call('reports.list')).resolves.toBe('done');
        expect(calls).toHaveLength(3);
    });

    it('ยอมแพ้หลังลองครบ และไม่ลองซ้ำ action ที่ใช้ครั้งเดียว', async () => {
        const { api, calls } = make([new TypeError('x'), new TypeError('x'), new TypeError('x'), new TypeError('x')]);
        const error = await api.call('auth.activate').catch(e => e);
        expect(error.network).toBe(true);
        expect(calls).toHaveLength(1);
        await api.call('reports.list').catch(() => {});
        expect(calls).toHaveLength(4);
    });

    it('AUTH_REQUIRED เรียก onAuthRequired', async () => {
        const onAuthRequired = vi.fn();
        const { api } = make([json({ ok: false, error: { code: 'AUTH_REQUIRED', message: 'login' } })], { onAuthRequired });
        await api.call('reports.list').catch(() => {});
        expect(onAuthRequired).toHaveBeenCalledOnce();
    });

    it('get() ส่ง action ใน query string', async () => {
        const { api, calls } = make([json({ ok: true, data: { drugs: [] } })]);
        await api.get('drugs.list');
        expect(calls[0].url).toBe('https://api.test/exec?action=drugs.list');
    });
});

describe('outbox', () => {
    const memory = () => {
        let saved = [];
        return { load: () => [], save: items => { saved = JSON.parse(JSON.stringify(items)); }, get saved() { return saved; } };
    };

    it('ส่งเฉพาะของผู้ใช้ปัจจุบัน, หยุดเมื่อเน็ตหลุด, เก็บรายการที่ server ปฏิเสธ', async () => {
        const storage = memory();
        let user = 'U01';
        const call = vi.fn(async (action, p) => {
            if (p.submissionToken === 'bad') throw Object.assign(new Error('VALIDATION'), { code: 'VALIDATION' });
            if (p.submissionToken === 'net') throw Object.assign(new Error('net'), { network: true });
            return { id: 'PE1' };
        });
        const ob = createOutbox({ call, currentPsCode: () => user, storage });
        ob.queue({ submissionToken: 'ok1' });
        ob.queue({ submissionToken: 'ok1' }); // ซ้ำ → ไม่เพิ่ม
        ob.queue({ submissionToken: 'bad' });
        user = 'P99';
        ob.queue({ submissionToken: 'other-user' });
        user = 'U01';
        expect(await ob.flush()).toBe(1);
        expect(call).toHaveBeenCalledTimes(2);
        expect(ob.items.value.map(i => i.payload.submissionToken)).toEqual(['bad', 'other-user']);
        expect(ob.items.value[0].lastError).toBe('VALIDATION');
        expect(storage.saved).toHaveLength(2);

        ob.queue({ submissionToken: 'net' });
        call.mockClear();
        await ob.flush();
        expect(ob.items.value.some(i => i.payload.submissionToken === 'net')).toBe(true);
    });

    it('แปลงรายการค้างจากแอปเดิม', () => {
        const item = convertLegacyOutboxItem({ psCode: 'U01', queuedAt: 't', payload: {
            eventDate: '2026-10-01', shift: 'เช้า', errorType: 'ผู้ป่วยนอก', location: 'รพ.สต.แทง', process: 'จัดยา', errorDetail: 'e',
            correctItem: 'BCG (010)', incorrectItem: '', cause: 'c', additionalDetails: 'd', submissionToken: 's'
        } });
        expect(item.payload).toMatchObject({ patientType: 'ผู้ป่วยนอก', location: 'รพ.สต.', substation: 'รพ.สต.แทง', correctDrugText: 'BCG (010)', details: 'd', submissionToken: 's' });
    });
});

describe('util', () => {
    it('periodRange', () => {
        expect(periodRange('month', '2026-10-05')).toEqual({ from: '2026-10-01', to: '2026-10-05' });
        expect(periodRange('12m', '2026-10-05')).toEqual({ from: '2025-11-01', to: '2026-10-05' });
        expect(periodRange('12m', '2026-01-15')).toEqual({ from: '2025-02-01', to: '2026-01-15' });
        expect(periodRange('fiscal', '2026-09-30')).toEqual({ from: '2025-10-01', to: '2026-09-30' });
        expect(periodRange('fiscal', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-01' });
        expect(periodRange('lastFiscal', '2026-10-05')).toEqual({ from: '2025-10-01', to: '2026-09-30' });
        expect(periodRange('30d', '2026-10-05').from).toBe('2026-09-06');
        expect(periodRange('all', '2026-10-05')).toEqual({ from: '', to: '' });
    });

    it('bangkokToday ใช้เวลาไทย', () => {
        expect(bangkokToday(Date.UTC(2026, 9, 4, 18, 0))).toBe('2026-10-05');
    });

    it('searchDrugs จัดลำดับ: รหัสตรง > รหัสขึ้นต้น > ชื่อขึ้นต้น > มีทุกคำ', () => {
        const drugs = [
            { drugCode: 'MPSFT1', drugName: 'MORPHINE SULFATE 10 MG' },
            { drugCode: 'PARA500', drugName: 'Paracetamol 500 mg' },
            { drugCode: 'MORPH10', drugName: 'Morphine inj 10 mg' },
            { drugCode: 'X1', drugName: 'Tab morphine syrup' }
        ];
        expect(searchDrugs(drugs, 'morph10').map(d => d.drugCode)).toEqual(['MORPH10']);
        expect(searchDrugs(drugs, 'morphine 10').map(d => d.drugCode)).toEqual(['MORPH10', 'MPSFT1']);
        expect(searchDrugs(drugs, 'morphine')[0].drugCode).not.toBe('X1');
        expect(searchDrugs(drugs, '')).toEqual([]);
    });

    it('CSV มี BOM และกันสูตร', () => {
        const csv = toCsv(['a'], [['=1+1'], ['say "hi"']]);
        expect(csv.charCodeAt(0)).toBe(0xfeff);
        expect(csvCell('=1+1')).toBe('"\'=1+1"');
        expect(csv).toContain('"say ""hi"""');
    });

    it('วันที่ไทย', () => {
        expect(thaiMonthLabel('2026-10')).toBe('ต.ค. 69');
        expect(formatThaiDate('2026-10-05')).toBe('5 ต.ค. 2569');
    });

    it('ใบรหัสเปิดใช้งาน: escape และจัดกลุ่ม', () => {
        const html = slipsHtml([
            { psCode: 'S02', name: '<b>x</b>', group: 'เภสัชกร', code: 'ABCD2345', expiresAt: 'e' },
            { psCode: 'S01', name: 'y', group: '', code: 'WXYZ6789', expiresAt: 'e' }
        ], 'https://x/#/login?activate=1');
        expect(html).toContain('ABCD-2345');
        expect(html).not.toContain('<b>x</b>');
        expect(html.match(/<h2>/g)).toHaveLength(2);
    });
});
