// แปลงแถวรายงานรูปแบบเดิม → Reports (v2) ด้วยฟังก์ชันชุดเดียวกับ backend/src/reports.js
// ใช้โดย tools/migrate-reports.js และ mcp-server (append_error) — ไม่มี dependency ภายนอก

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** โหลดฟังก์ชัน pure ของ backend (config/http/reports/stats) เข้า sandbox */
export function loadBackend() {
    const context = { console, JSON, Math, Date, String, Number, Array, Object, RegExp, parseInt, isNaN };
    vm.createContext(context);
    for (const file of ['config.js', 'http.js', 'reports.js', 'stats.js']) {
        const src = fs.readFileSync(path.join(__dirname, '..', 'backend', 'src', file), 'utf8');
        vm.runInContext(src, context, { filename: file });
    }
    const get = name => vm.runInContext(name, context);
    return {
        schema: get('SCHEMAS.Reports').slice(),
        buildDrugIndex: get('buildDrugIndex'),
        reportFromLegacyRow: get('reportFromLegacyRow')
    };
}

const codeKey = c => String(c ?? '').trim().replace(/^'/, '').toUpperCase();
const formatDate = d => d.toISOString().slice(0, 10);

/**
 * แปลงแถวเดิมทั้งหมด → รายงาน v2 (pure ยกเว้นการใช้ backend)
 * - เติม reporterPsCode จากชื่อใน Users เมื่อรูปแบบเดิมไม่มี (PS)
 */
export function convertRows(backend, { legacyRows, drugRows, overrideRows, userRows }) {
    const overrides = new Map(overrideRows.filter(r => r[0]).map(r => [codeKey(r[0]), r]));
    const drugs = drugRows.filter(r => r[0]).map(r => {
        const o = overrides.get(codeKey(r[0]));
        const had = o && (o[1] === 'High' || o[1] === 'Regular') ? o[1] : (String(r[3]) === '1' ? 'High' : 'Regular');
        return { drugCode: String(r[0]).trim(), drugName: r[1], had };
    });
    const index = backend.buildDrugIndex(drugs);
    const psByName = new Map();
    userRows.filter(r => r[0] && r[2]).forEach(r => psByName.set(String(r[2]).trim(), String(r[0]).trim()));

    const stats = { total: 0, skippedNoId: 0, duplicateRows: 0, renamedIds: 0, badDate: 0, dateFromId: 0, reporterFromUsers: 0,
        reporterUnknown: 0, drugUnmatched: 0, had: 0 };
    const unmatchedDrugs = {};
    const seen = new Map(); // id → [signature ของแถวที่ใช้ id นี้แล้ว]
    const reports = [];
    for (const row of legacyRows) {
        const baseId = String(row[1] || '').trim();
        if (!baseId) { stats.skippedNoId++; continue; }
        // ID ซ้ำ: เนื้อหาเหมือนกัน (ไม่นับวันที่/เวลาบันทึก) = ส่งซ้ำ → ข้าม
        //   (ทางสำรองเดิม submitViaForm ส่งรายงานเดิมซ้ำโดยไม่มีวันที่)
        //   เนื้อหาต่างกัน = คนละรายงานที่ ID ชนกัน → เก็บไว้ด้วย id-2, id-3 ...
        const signature = JSON.stringify(row.slice(1, 12));
        const prior = seen.get(baseId) || [];
        if (prior.includes(signature)) { stats.duplicateRows++; continue; }
        prior.push(signature);
        seen.set(baseId, prior);
        const id = prior.length === 1 ? baseId : `${baseId}-${prior.length}`;
        if (id !== baseId) stats.renamedIds++;
        const r = JSON.parse(JSON.stringify(backend.reportFromLegacyRow(row, index, formatDate)));
        r.id = id;
        if (!r.eventDate) {
            // แถวจาก submitViaForm ไม่มีวันที่ → ใช้วันที่ใน Report ID (PEyyMMddHHmmss)
            const m = baseId.match(/^PE(\d{2})(\d{2})(\d{2})/);
            if (m) { r.eventDate = `20${m[1]}-${m[2]}-${m[3]}`; stats.dateFromId++; }
        }
        if (!r.reporterPsCode) {
            const ps = psByName.get(r.reporterName);
            if (ps) { r.reporterPsCode = ps; stats.reporterFromUsers++; } else stats.reporterUnknown++;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.eventDate)) stats.badDate++;
        for (const [text, code] of [[row[7], r.correctDrugCode], [row[8], r.incorrectDrugCode]]) {
            if (text && !code) { stats.drugUnmatched++; unmatchedDrugs[text] = (unmatchedDrugs[text] || 0) + 1; }
        }
        if (r.isHad) stats.had++;
        r.source = 'migrated';
        reports.push(r);
        stats.total++;
    }
    return { reports, stats, unmatchedDrugs };
}
