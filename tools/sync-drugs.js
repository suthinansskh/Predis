#!/usr/bin/env node
/**
 * Sync Drug List: MySQL → drug_list.json + Google Sheets
 *
 * Usage:
 *   node sync-drugs.js              # MySQL → drug_list.json only
 *   node sync-drugs.js --sheets     # MySQL → drug_list.json + Google Sheets
 *   node sync-drugs.js --dry-run    # แสดงความเปลี่ยนแปลงโดยไม่เขียนไฟล์
 *
 * Environment variables (via .env):
 *   MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
 *   SPREADSHEET_ID, GOOGLE_APPLICATION_CREDENTIALS (for --sheets)
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRUG_LIST_PATH = path.join(__dirname, '..', 'drug_list.json');
const writeToSheets = process.argv.includes('--sheets');
const dryRun = process.argv.includes('--dry-run');

async function fetchFromMySQL() {
    const { MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE } = process.env;
    if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_PASSWORD || !MYSQL_DATABASE) {
        throw new Error('MySQL not configured. Set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE in .env');
    }

    console.log(`Connecting to MySQL ${MYSQL_HOST}/${MYSQL_DATABASE}...`);
    const connection = await mysql.createConnection({
        host: MYSQL_HOST,
        user: MYSQL_USER,
        password: MYSQL_PASSWORD,
        database: MYSQL_DATABASE
    });

    const [rows] = await connection.execute(
        "SELECT * FROM `itemlist` WHERE `ItemType` IN ('ITEM_IN1', 'ITEM_IN2', 'ITEM_IN3') AND `no_use` LIKE '%0%'"
    );
    await connection.end();

    console.log(`Fetched ${rows.length} drugs from MySQL`);

    return rows.map(toDrug).sort((a, b) => a.drugCode.localeCompare(b.drugCode));
}

// Collapse embedded newlines / repeated spaces from HOSxP free-text fields
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function toDrug(row) {
    return ({
        drugCode: clean(row.itemcode),
        drugName: clean(row.Name),
        group: row.ItemType || '',
        had: row.high_alert_drug === 1 ? 'High' : 'Regular',
        status: String(row.no_use) === '0' ? 'Active' : 'Inactive',
        unit: clean(row.UnitName),
        strength: clean(row.strength),
        dosageForm: clean(row.dosage_form),
        tmtCode: (row.tmt_code || '').trim(),
        unitPrice: row.UnitPrice || 0
    });
}

async function readCurrentDrugs() {
    try {
        return JSON.parse(await fs.readFile(DRUG_LIST_PATH, 'utf8'));
    } catch {
        return [];
    }
}

export function diffDrugs(before, after) {
    const oldByCode = new Map(before.map(d => [d.drugCode, d]));
    const newByCode = new Map(after.map(d => [d.drugCode, d]));
    const added = after.filter(d => !oldByCode.has(d.drugCode));
    const removed = before.filter(d => !newByCode.has(d.drugCode));
    const changed = after.filter(d => oldByCode.has(d.drugCode) &&
        JSON.stringify(oldByCode.get(d.drugCode)) !== JSON.stringify(d));
    return { added, removed, changed };
}

function getSheetsClient() {
    const spreadsheetId = process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
        throw new Error('SPREADSHEET_ID not set in .env');
    }
    const credPath = path.resolve(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials.json');
    const auth = new google.auth.GoogleAuth({
        keyFile: credPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    return { sheets: google.sheets({ version: 'v4', auth }), spreadsheetId };
}

const codeKey = code => String(code ?? '').trim().replace(/^'/, '').toUpperCase();

// HAD/สถานะที่เภสัชกรแก้ในแอป (Sheet Drug_Overrides) — ต้องไม่ถูก HOSxP เขียนทับ
async function readDrugOverrides() {
    const { sheets, spreadsheetId } = getSheetsClient();
    try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Drug_Overrides!A2:C' });
        return new Map((res.data.values || []).filter(r => r[0]).map(r => [codeKey(r[0]), { had: r[1] || '', status: r[2] || '' }]));
    } catch {
        return new Map(); // ยังไม่มี Sheet นี้
    }
}

export function applyOverrides(drugs, overrides) {
    let applied = 0;
    const result = drugs.map(d => {
        const o = overrides.get(codeKey(d.drugCode));
        if (!o) return d;
        applied++;
        return {
            ...d,
            had: o.had === 'High' || o.had === 'Regular' ? o.had : d.had,
            status: o.status === 'Active' || o.status === 'Inactive' ? o.status : d.status
        };
    });
    return { drugs: result, applied };
}

async function writeToGoogleSheets(drugs) {
    const { sheets, spreadsheetId } = getSheetsClient();
    const sheetName = process.env.SHEET_DRUGS || 'Drug_List';

    console.log(`Writing ${drugs.length} drugs to Google Sheets "${sheetName}"...`);

    // Ensure sheet exists
    try {
        await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A1` });
    } catch {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] }
        });
    }

    // Clear existing data
    const existing = await sheets.spreadsheets.values.get({
        spreadsheetId, range: `${sheetName}!A:J`
    });
    const existingRows = (existing.data.values || []).length;
    if (existingRows > 1) {
        await sheets.spreadsheets.values.clear({
            spreadsheetId, range: `${sheetName}!A2:J${existingRows}`
        });
    }

    // Write header + data
    const header = ['Drug Code', 'Drug Name', 'Group', 'HAD', 'Status', 'Unit', 'Strength', 'Dosage Form', 'TMT Code', 'Unit Price'];
    const dataRows = drugs.map(d => [
        d.drugCode, d.drugName, d.group,
        d.had === 'High' ? 1 : 0,
        d.status === 'Active' ? 1 : 0,
        d.unit, d.strength, d.dosageForm, d.tmtCode, d.unitPrice || 0
    ]);

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        // RAW: รหัสยาอย่าง "010" ต้องคงเป็นข้อความ (USER_ENTERED แปลงเป็นเลข 10)
        valueInputOption: 'RAW',
        requestBody: { values: [header, ...dataRows] }
    });

    console.log(`Google Sheets "${sheetName}" updated with ${drugs.length} drugs`);
}

async function main() {
    let drugs = await fetchFromMySQL();

    if (writeToSheets) {
        const result = applyOverrides(drugs, await readDrugOverrides());
        drugs = result.drugs;
        console.log(`Applied ${result.applied} HAD/status overrides from Drug_Overrides`);
    }

    const { added, removed, changed } = diffDrugs(await readCurrentDrugs(), drugs);
    console.log(`Changes: +${added.length} added, -${removed.length} removed, ~${changed.length} changed`);
    added.forEach(d => console.log(`  + ${d.drugCode} ${d.drugName}`));
    removed.forEach(d => console.log(`  - ${d.drugCode} ${d.drugName}`));
    changed.forEach(d => console.log(`  ~ ${d.drugCode} ${d.drugName}`));

    if (dryRun) {
        console.log('Dry run: no files written');
        return;
    }

    // Compact JSON (one drug per line) keeps the file small but diff-friendly
    const json = '[\n' + drugs.map(d => JSON.stringify(d)).join(',\n') + '\n]\n';
    await fs.writeFile(DRUG_LIST_PATH, json);
    console.log(`Saved ${drugs.length} drugs to ${DRUG_LIST_PATH}`);

    // Optionally push to Google Sheets
    if (writeToSheets) {
        await writeToGoogleSheets(drugs);
    }

    console.log('Done!');
}

// Run only when executed directly (allows importing toDrug in tests)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(err => {
        console.error('Sync failed:', err.message);
        process.exit(1);
    });
}
