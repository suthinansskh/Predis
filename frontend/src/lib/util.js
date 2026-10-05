// ฟังก์ชันทั่วไป (pure — ทดสอบได้)

export const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** วันนี้ตามเวลาไทย yyyy-MM-dd */
export function bangkokToday(now = Date.now()) {
    return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function shiftDate(dateText, days) {
    const d = new Date(dateText + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

export const PERIODS = [
    { value: 'month', label: 'เดือนนี้' },
    { value: '30d', label: '30 วันล่าสุด' },
    { value: '90d', label: '90 วันล่าสุด' },
    { value: '12m', label: '12 เดือนล่าสุด' },
    { value: 'fiscal', label: 'ปีงบประมาณนี้' },
    { value: 'lastFiscal', label: 'ปีงบประมาณที่แล้ว' },
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'custom', label: 'กำหนดเอง…' }
];

/** ช่วงวันที่ของตัวเลือกช่วงเวลา → {from, to} */
export function periodRange(period, today = bangkokToday(), custom = {}) {
    const year = parseInt(today.slice(0, 4), 10);
    const month = parseInt(today.slice(5, 7), 10);
    const fyStart = month >= 10 ? year : year - 1;
    switch (period) {
        case 'month': return { from: today.slice(0, 7) + '-01', to: today };
        case '30d': return { from: shiftDate(today, -29), to: today };
        case '90d': return { from: shiftDate(today, -89), to: today };
        case '12m': return { from: new Date(Date.UTC(year, month - 12, 1)).toISOString().slice(0, 10), to: today };
        case 'fiscal': return { from: `${fyStart}-10-01`, to: today };
        case 'lastFiscal': return { from: `${fyStart - 1}-10-01`, to: `${fyStart}-09-30` };
        case 'custom': return { from: custom.from || '', to: custom.to || today };
        default: return { from: '', to: '' };
    }
}

export function thaiMonthLabel(yyyyMm) {
    const [y, m] = yyyyMm.split('-').map(Number);
    return `${THAI_MONTHS[m - 1]} ${String((y + 543) % 100).padStart(2, '0')}`;
}

export function formatThaiDate(dateText) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(dateText || '')) return dateText || '-';
    const [y, m, d] = dateText.slice(0, 10).split('-').map(Number);
    return `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
}

export function percent(part, whole) {
    return whole ? (part / whole) * 100 : 0;
}

// ===== CSV =====

export function csvCell(value) {
    const s = String(value === undefined || value === null ? '' : value);
    const safe = /^[=+\-@]/.test(s) ? "'" + s : s; // กันสูตรเมื่อเปิดใน Excel
    return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(header, rows) {
    return '﻿' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
}

export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const REPORT_CSV_HEADER = ['วันที่เกิดเหตุ', 'เวร', 'Report ID', 'ประเภทผู้ป่วย', 'สถานที่', 'กระบวนการ', 'ข้อผิดพลาด',
    'รหัสยาที่ถูกต้อง', 'ยาที่ถูกต้อง', 'รหัสยาที่ผิด', 'ยาที่ผิด', 'ยา HAD', 'สาเหตุ', 'รายละเอียด', 'ผู้รายงาน'];

export function reportCsvRow(r) {
    return [r.eventDate, r.shift, r.id, r.patientType, r.substation || r.location, r.process, r.errorDetail,
        r.correctDrugCode, r.correctDrugName, r.incorrectDrugCode, r.incorrectDrugName, r.hadDrugCodes, r.cause, r.details, r.reporterName];
}

// ===== ค้นหายา =====

/**
 * ค้นหายาแบบให้คะแนน: รหัสตรง > รหัสขึ้นต้น > ชื่อขึ้นต้น > มีทุกคำ
 * @param {Array<{drugCode, drugName}>} drugs
 */
export function searchDrugs(drugs, query, limit = 30) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const tokens = q.split(/\s+/);
    const scored = [];
    for (const d of drugs) {
        const code = String(d.drugCode).toLowerCase();
        const name = String(d.drugName || '').toLowerCase();
        let score = 0;
        if (code === q) score = 100;
        else if (code.startsWith(q)) score = 80;
        else if (name.startsWith(q)) score = 70;
        else if (tokens.every(t => name.includes(t) || code.includes(t))) score = 50 - Math.min(name.indexOf(tokens[0]), 40) / 10;
        if (score > 0) scored.push({ d, score });
    }
    return scored.sort((a, b) => b.score - a.score || String(a.d.drugName).localeCompare(String(b.d.drugName)))
        .slice(0, limit).map(x => x.d);
}

export function drugLabel(code, name) {
    if (!name) return code || '';
    return code ? `${name} (${code})` : name;
}

// ===== localStorage อย่างปลอดภัย =====

export function readJson(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
}

export function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

export function removeKey(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export function randomToken() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
