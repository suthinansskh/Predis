#!/usr/bin/env node
/**
 * Migrate รายงานจาก Sheet "Predispensing_Errors" (เดิม) → "Reports" (v2: มีรหัสยา + HAD ต่อรายงาน)
 *
 * ใช้ฟังก์ชันแปลงชุดเดียวกับ backend (backend/src/reports.js) — ผลลัพธ์ตรงกับที่ Apps Script ใช้
 * เป็นแบบเพิ่มอย่างเดียว (ไม่แก้/ลบ Sheet เดิม) และรันซ้ำได้: ข้ามรายงานที่มี id ใน Reports แล้ว
 *
 * Usage:
 *   node migrate-reports.js --dry-run               # แสดงสรุป ไม่เขียนอะไร
 *   node migrate-reports.js                         # เขียนรายงานที่ยังไม่มีลง Reports
 *   node migrate-reports.js --finalize              # เขียน + ตั้ง Meta.reportsMigrated=true แล้วรันซ้ำเก็บตก
 *   node migrate-reports.js --spreadsheet <id>      # ทำกับ Spreadsheet อื่น (เช่น สำเนาสำหรับทดสอบ)
 */

import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { loadBackend, convertRows } from './report-convert.js';

export { loadBackend, convertRows };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const finalize = args.includes('--finalize');
const spreadsheetId = args.includes('--spreadsheet') ? args[args.indexOf('--spreadsheet') + 1] : process.env.SPREADSHEET_ID;

const LEGACY_SHEET = 'Predispensing_Errors';
const REPORTS_SHEET = 'Reports';
const META_SHEET = 'Meta';
const BATCH = 1000;

function sheetsClient(readonly) {
    const credPath = path.resolve(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials.json');
    const auth = new google.auth.GoogleAuth({
        keyFile: credPath,
        scopes: [readonly ? 'https://www.googleapis.com/auth/spreadsheets.readonly' : 'https://www.googleapis.com/auth/spreadsheets']
    });
    return google.sheets({ version: 'v4', auth });
}

async function readRange(sheets, range) {
    try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range, valueRenderOption: 'FORMATTED_VALUE' });
        return res.data.values || [];
    } catch (error) {
        if (/Unable to parse range/.test(error.message)) return null; // ไม่มี Sheet นี้
        throw error;
    }
}

async function ensureSheet(sheets, title, header) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
    if (!meta.data.sheets.some(s => s.properties.title === title)) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title } } }] } });
    }
    const existing = await readRange(sheets, `${title}!1:1`);
    const current = (existing && existing[0]) || [];
    if (current.length === 0) {
        await sheets.spreadsheets.values.update({ spreadsheetId, range: `${title}!A1`, valueInputOption: 'RAW', requestBody: { values: [header] } });
        return header;
    }
    const missing = header.filter(h => !current.includes(h));
    if (missing.length) throw new Error(`Sheet ${title} ขาดคอลัมน์: ${missing.join(', ')}`);
    return current;
}

async function setMeta(sheets, key, value) {
    await ensureSheet(sheets, META_SHEET, ['key', 'value']);
    const rows = (await readRange(sheets, `${META_SHEET}!A2:B`)) || [];
    const idx = rows.findIndex(r => r[0] === key);
    if (idx === -1) {
        await sheets.spreadsheets.values.append({ spreadsheetId, range: `${META_SHEET}!A:B`, valueInputOption: 'RAW', requestBody: { values: [[key, value]] } });
    } else {
        await sheets.spreadsheets.values.update({ spreadsheetId, range: `${META_SHEET}!B${idx + 2}`, valueInputOption: 'RAW', requestBody: { values: [[value]] } });
    }
}

async function migrateOnce(sheets, backend) {
    const [legacyRows, drugRows, overrideRows, userRows, reportIds] = await Promise.all([
        readRange(sheets, `${LEGACY_SHEET}!A2:M`),
        readRange(sheets, 'Drug_List!A2:E'),
        readRange(sheets, 'Drug_Overrides!A2:C'),
        readRange(sheets, 'Users!A2:C'),
        readRange(sheets, `${REPORTS_SHEET}!A2:A`)
    ]);
    const { reports, stats, unmatchedDrugs } = convertRows(backend, {
        legacyRows: legacyRows || [], drugRows: drugRows || [], overrideRows: overrideRows || [], userRows: userRows || []
    });
    const existing = new Set((reportIds || []).map(r => String(r[0]).trim()));
    const toWrite = reports.filter(r => !existing.has(r.id));

    console.log(`Legacy rows: ${(legacyRows || []).length} → reports: ${stats.total} (no id: ${stats.skippedNoId}, ` +
        `duplicate submissions skipped: ${stats.duplicateRows}, colliding ids renamed: ${stats.renamedIds})`);
    console.log(`Already in Reports: ${existing.size}, to write: ${toWrite.length}`);
    console.log(`HAD reports: ${stats.had} | eventDate from ID: ${stats.dateFromId}, still bad: ${stats.badDate} | reporter from Users: ${stats.reporterFromUsers}, unknown: ${stats.reporterUnknown}`);
    console.log(`Drug texts without code: ${stats.drugUnmatched}; top:`,
        Object.entries(unmatchedDrugs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => `${t} ×${n}`).join(' | '));

    if (dryRun || toWrite.length === 0) return { written: 0, total: stats.total };

    const header = await ensureSheet(sheets, REPORTS_SHEET, backend.schema);
    for (let i = 0; i < toWrite.length; i += BATCH) {
        const values = toWrite.slice(i, i + BATCH).map(r => header.map(h => (r[h] === undefined || r[h] === null ? '' : r[h])));
        // RAW: เก็บค่าตามจริง ("010" เป็นข้อความ, วันที่เป็นข้อความ yyyy-MM-dd)
        await sheets.spreadsheets.values.append({
            spreadsheetId, range: `${REPORTS_SHEET}!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
            requestBody: { values }
        });
        console.log(`  wrote ${Math.min(i + BATCH, toWrite.length)}/${toWrite.length}`);
    }
    return { written: toWrite.length, total: stats.total };
}

async function verify(sheets) {
    const [legacy, reports] = await Promise.all([readRange(sheets, `${LEGACY_SHEET}!B2:B`), readRange(sheets, `${REPORTS_SHEET}!A2:A`)]);
    const legacyIds = new Set((legacy || []).map(r => String(r[0] || '').trim()).filter(Boolean));
    const reportIds = (reports || []).map(r => String(r[0] || '').trim()).filter(Boolean);
    const reportSet = new Set(reportIds);
    const missing = [...legacyIds].filter(id => !reportSet.has(id));
    console.log(`Verify: legacy ids ${legacyIds.size}, Reports rows ${reportIds.length} (unique ${reportSet.size}), missing ${missing.length}`);
    return missing.length === 0 && reportSet.size === reportIds.length;
}

async function main() {
    if (!spreadsheetId) throw new Error('SPREADSHEET_ID not set');
    console.log(`Spreadsheet: ${spreadsheetId}${dryRun ? ' (dry run)' : ''}`);
    const sheets = sheetsClient(dryRun);
    const backend = loadBackend();

    await migrateOnce(sheets, backend);
    if (dryRun) return;
    if (finalize) {
        // ตั้ง flag ก่อน แล้วรันซ้ำเก็บรายงานที่เข้ามาระหว่างนั้น (หลัง flag backend เขียนลง Reports เอง)
        await setMeta(sheets, 'reportsMigrated', 'true');
        await setMeta(sheets, 'reportsVersion', String(Date.now()));
        console.log('Meta.reportsMigrated = true');
        await migrateOnce(sheets, backend);
    }
    if (!(await verify(sheets))) {
        throw new Error('Verify failed — มีรายงานที่ยังไม่ถูกย้าย หรือ id ซ้ำใน Reports');
    }
    console.log('Done!');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(err => {
        console.error('Migration failed:', err.message);
        process.exit(1);
    });
}
