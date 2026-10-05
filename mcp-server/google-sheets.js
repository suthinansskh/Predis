import { google } from 'googleapis';
import { resolve } from 'path';

// ==========================================
// Google Sheets Authentication
// ==========================================

function getAuth() {
    // วิธีที่ 1: ใช้ JSON content จาก environment variable
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        return new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
    }

    // วิธีที่ 2: ใช้ credentials file path
    const credPath = resolve(
        process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials.json'
    );
    return new google.auth.GoogleAuth({
        keyFile: credPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
}

// ==========================================
// Sheets Client
// ==========================================

export function getSheetsClient() {
    const auth = getAuth();
    return google.sheets({ version: 'v4', auth });
}

export const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';

export const SHEET_NAMES = {
    errors: process.env.SHEET_ERRORS || 'Predispensing_Errors',
    users: process.env.SHEET_USERS || 'Users',
    drugs: process.env.SHEET_DRUGS || 'Drug_List'
};

// ==========================================
// Utility Helpers
// ==========================================

/**
 * อ่านข้อมูลทั้งหมดจาก sheet พร้อม header row
 * @returns {{ headers: string[], rows: Object[] }}
 */
export async function readSheetWithHeaders(sheetName, range = null) {
    const sheets = getSheetsClient();
    const readRange = range ? `${sheetName}!${range}` : sheetName;

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: readRange
    });

    const values = response.data.values || [];
    if (values.length === 0) return { headers: [], rows: [] };

    const headers = values[0].map(h => h.toString().trim());
    const rows = values.slice(1).map(row => {
        const obj = {};
        headers.forEach((header, i) => {
            obj[header] = row[i] !== undefined ? row[i].toString() : '';
        });
        return obj;
    });

    return { headers, rows };
}

/**
 * อ่านข้อมูลดิบเป็น 2D array
 */
export async function readSheetRaw(sheetName, range = null) {
    const sheets = getSheetsClient();
    const readRange = range ? `${sheetName}!${range}` : sheetName;

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: readRange
    });

    return response.data.values || [];
}

/**
 * Append row ต่อท้าย sheet
 */
export async function appendRow(sheetName, values) {
    const sheets = getSheetsClient();

    await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: sheetName,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
            values: [values]
        }
    });
}

/**
 * เขียนข้อมูล bulk (แทนที่ทั้ง range)
 */
export async function writeRange(sheetName, startCell, values) {
    const sheets = getSheetsClient();

    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!${startCell}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values }
    });
}

/**
 * ล้างข้อมูลใน range
 */
export async function clearRange(sheetName, range) {
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!${range}`
    });
}

/**
 * รายชื่อ sheets ทั้งหมดใน spreadsheet
 */
export async function listSheets() {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        fields: 'sheets.properties'
    });

    return (response.data.sheets || []).map(s => ({
        name: s.properties.title,
        id: s.properties.sheetId,
        rowCount: s.properties.gridProperties?.rowCount,
        colCount: s.properties.gridProperties?.columnCount
    }));
}

export const REPORTS_SHEET = 'Reports';

/** append แบบ RAW (ไม่แปลงชนิด: "010" คงเป็นข้อความ) */
export async function appendRowRaw(sheetName, values) {
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [values] }
    });
}

/** ตั้งค่าใน Sheet Meta (key/value) — เช่น reportsVersion เพื่อล้าง cache สถิติของแอป */
export async function setMetaValue(key, value) {
    const sheets = getSheetsClient();
    const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Meta!A2:B' })).data.values || [];
    const index = rows.findIndex(r => r[0] === key);
    if (index === -1) {
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID, range: 'Meta!A:B', valueInputOption: 'RAW', requestBody: { values: [[key, value]] }
        });
    } else {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID, range: `Meta!B${index + 2}`, valueInputOption: 'RAW', requestBody: { values: [[value]] }
        });
    }
}

