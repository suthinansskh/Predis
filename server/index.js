import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { google } from 'googleapis';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// Middleware
// ==========================================
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Too many requests' }
});
app.use('/api/', limiter);

// Serve static files (the frontend)
app.use(express.static(path.join(__dirname, '..')));

// ==========================================
// Google Sheets Setup
// ==========================================
let sheetsApi = null;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

async function getSheetsApi() {
    if (sheetsApi) return sheetsApi;

    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials.json';
    const auth = new google.auth.GoogleAuth({
        keyFile: path.resolve(__dirname, credPath),
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    sheetsApi = google.sheets({ version: 'v4', auth: await auth.getClient() });
    return sheetsApi;
}

// ==========================================
// API Routes
// ==========================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Errors ---

// GET /api/errors — Read errors from Google Sheets
app.get('/api/errors', async (req, res) => {
    try {
        const sheets = await getSheetsApi();
        const sheetName = req.query.sheet || 'Predispensing_Errors';
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:M`
        });
        const rows = response.data.values || [];
        res.json({ success: true, data: rows, count: rows.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Sanitize value to prevent formula injection in Google Sheets
function sanitizeForSheet(value) {
    if (value === null || value === undefined) return '';
    let str = String(value).trim();
    if (str.length > 0 && /^[=+\-@\t\r|\\]/.test(str)) {
        str = "'" + str;
    }
    str = str.replace(/\0/g, '');
    if (str.length > 5000) str = str.substring(0, 5000);
    return str;
}

// POST /api/errors — Append a new error
app.post('/api/errors', async (req, res) => {
    try {
        const data = req.body;
        if (!data.reportId || !data.eventDate) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Validate reportId format
        if (!/^PE\d{10,20}$/.test(data.reportId) && !/^DEMO-\d+$/.test(data.reportId)) {
            return res.status(400).json({ success: false, error: 'Invalid reportId format' });
        }

        // Validate eventDate format
        if (isNaN(new Date(data.eventDate).getTime())) {
            return res.status(400).json({ success: false, error: 'Invalid eventDate format' });
        }

        const sheets = await getSheetsApi();
        const sheetName = data.sheetName || 'Predispensing_Errors';
        const timestamp = new Date().toISOString();

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:M`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[
                    sanitizeForSheet(data.eventDate),
                    sanitizeForSheet(data.reportId),
                    sanitizeForSheet(data.shift || ''),
                    sanitizeForSheet(data.errorType || ''),
                    sanitizeForSheet(data.location || ''),
                    sanitizeForSheet(data.process || ''),
                    sanitizeForSheet(data.errorDetail || ''),
                    sanitizeForSheet(data.correctItem || ''),
                    sanitizeForSheet(data.incorrectItem || ''),
                    sanitizeForSheet(data.cause || ''),
                    sanitizeForSheet(data.additionalDetails || ''),
                    sanitizeForSheet(data.reporter || ''),
                    timestamp
                ]]
            }
        });

        res.json({ success: true, reportId: data.reportId, timestamp });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- Drug List ---

// GET /api/drugs — Read drug list (from local JSON or MySQL)
app.get('/api/drugs', async (req, res) => {
    try {
        const fs = await import('fs/promises');
        const drugPath = path.join(__dirname, '..', 'drug_list.json');
        const data = await fs.readFile(drugPath, 'utf-8');
        const drugs = JSON.parse(data);
        res.json({ success: true, data: drugs, count: drugs.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/drugs/sync — Sync drugs from MySQL
app.post('/api/drugs/sync', async (req, res) => {
    try {
        if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
            return res.status(500).json({ success: false, error: 'MySQL configuration not set. Set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE environment variables.' });
        }

        const connection = await mysql.createConnection({
            host: process.env.MYSQL_HOST,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE
        });

        const [rows] = await connection.execute(
            "SELECT * FROM `itemlist` WHERE `ItemType` IN ('ITEM_IN1', 'ITEM_IN2', 'ITEM_IN3') AND `no_use` LIKE '%0%'"
        );

        const transformed = rows.map(row => ({
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

        // Save to local JSON
        const fs = await import('fs/promises');
        await fs.writeFile(path.join(__dirname, '..', 'drug_list.json'), JSON.stringify(transformed, null, 2));

        await connection.end();
        res.json({ success: true, count: transformed.length, message: `Synced ${transformed.length} drugs from MySQL` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/drugs/sync-to-sheets — Sync drugs from MySQL → Google Sheets
app.post('/api/drugs/sync-to-sheets', async (req, res) => {
    try {
        if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
            return res.status(400).json({ success: false, error: 'MySQL not configured. Set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE in .env' });
        }
        if (!SPREADSHEET_ID) {
            return res.status(400).json({ success: false, error: 'SPREADSHEET_ID not configured in .env' });
        }

        // 1. Fetch from MySQL
        const connection = await mysql.createConnection({
            host: process.env.MYSQL_HOST,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE
        });

        const [rows] = await connection.execute(
            "SELECT * FROM `itemlist` WHERE `ItemType` IN ('ITEM_IN1', 'ITEM_IN2', 'ITEM_IN3') AND `no_use` LIKE '%0%'"
        );
        await connection.end();

        const transformed = rows.map(row => ({
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

        // 2. Save to local JSON
        const fs = await import('fs/promises');
        await fs.writeFile(path.join(__dirname, '..', 'drug_list.json'), JSON.stringify(transformed, null, 2));

        // 3. Write to Google Sheets Drug_List
        const sheets = await getSheetsApi();
        const drugSheetName = req.body.sheetName || 'Drug_List';

        // Ensure sheet exists — try reading first
        try {
            await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: `${drugSheetName}!A1`
            });
        } catch {
            // Sheet doesn't exist — create via batchUpdate
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                requestBody: {
                    requests: [{ addSheet: { properties: { title: drugSheetName } } }]
                }
            });
        }

        // Clear existing data (keep header)
        const existing = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${drugSheetName}!A:J`
        });
        const existingRows = (existing.data.values || []).length;
        if (existingRows > 1) {
            await sheets.spreadsheets.values.clear({
                spreadsheetId: SPREADSHEET_ID,
                range: `${drugSheetName}!A2:J${existingRows}`
            });
        }

        // Write header + data
        const header = ['Drug Code', 'Drug Name', 'Group', 'HAD', 'Status', 'Unit', 'Strength', 'Dosage Form', 'TMT Code', 'Unit Price'];
        const dataRows = transformed.map(d => [
            sanitizeForSheet(d.drugCode),
            sanitizeForSheet(d.drugName),
            sanitizeForSheet(d.group),
            d.had === 'High' ? 1 : 0,
            d.status === 'Active' ? 1 : 0,
            sanitizeForSheet(d.unit),
            sanitizeForSheet(d.strength),
            sanitizeForSheet(d.dosageForm),
            sanitizeForSheet(d.tmtCode),
            d.unitPrice || 0
        ]);

        const allValues = [header, ...dataRows];
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${drugSheetName}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: allValues }
        });

        res.json({
            success: true,
            count: transformed.length,
            message: `Synced ${transformed.length} drugs from MySQL → drug_list.json + Google Sheets (${drugSheetName})`
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- Users ---

// GET /api/users — Read users from Google Sheets
app.get('/api/users', async (req, res) => {
    try {
        const sheets = await getSheetsApi();
        const sheetName = req.query.sheet || 'Users';
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:H`
        });
        const rows = response.data.values || [];
        // Return WITHOUT password column for security
        const safeRows = rows.map(row => row.slice(0, 6));
        res.json({ success: true, data: safeRows, count: safeRows.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// Start Server
// ==========================================
app.listen(PORT, () => {
    console.log(`Predis API Server running on http://localhost:${PORT}`);
    console.log(`Spreadsheet ID: ${SPREADSHEET_ID || '(not set)'}`);
});
