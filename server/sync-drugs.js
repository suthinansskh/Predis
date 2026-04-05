#!/usr/bin/env node
/**
 * Sync Drug List: MySQL → drug_list.json + Google Sheets
 *
 * Usage:
 *   node sync-drugs.js              # MySQL → drug_list.json only
 *   node sync-drugs.js --sheets     # MySQL → drug_list.json + Google Sheets
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

    return rows.map(row => ({
        drugCode: (row.itemcode || '').trim(),
        drugName: (row.Name || '').trim(),
        group: row.ItemType || '',
        had: row.high_alert_drug === 1 ? 'High' : 'Regular',
        status: String(row.no_use) === '0' ? 'Active' : 'Inactive',
        unit: (row.UnitName || '').trim(),
        strength: (row.strength || '').trim(),
        dosageForm: (row.dosage_form || '').trim(),
        tmtCode: (row.tmt_code || '').trim(),
        unitPrice: row.UnitPrice || 0
    }));
}

async function writeToGoogleSheets(drugs) {
    const spreadsheetId = process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
        throw new Error('SPREADSHEET_ID not set in .env');
    }

    const credPath = path.resolve(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials.json');
    const auth = new google.auth.GoogleAuth({
        keyFile: credPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
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
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [header, ...dataRows] }
    });

    console.log(`Google Sheets "${sheetName}" updated with ${drugs.length} drugs`);
}

async function main() {
    const drugs = await fetchFromMySQL();

    // Always save to local JSON
    await fs.writeFile(DRUG_LIST_PATH, JSON.stringify(drugs, null, 2));
    console.log(`Saved ${drugs.length} drugs to ${DRUG_LIST_PATH}`);

    // Optionally push to Google Sheets
    if (writeToSheets) {
        await writeToGoogleSheets(drugs);
    }

    console.log('Done!');
}

main().catch(err => {
    console.error('Sync failed:', err.message);
    process.exit(1);
});
