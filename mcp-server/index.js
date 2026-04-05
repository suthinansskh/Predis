#!/usr/bin/env node
/**
 * Predis MCP Server
 * MCP Server สำหรับ Predispensing Error Recorder
 * ให้ Claude อ่าน/เขียน Google Sheets โดยตรง
 */

import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
    readSheetWithHeaders,
    readSheetRaw,
    appendRow,
    writeRange,
    clearRange,
    listSheets,
    SPREADSHEET_ID,
    SHEET_NAMES
} from './google-sheets.js';

// ==========================================
// Validation
// ==========================================
if (!SPREADSHEET_ID) {
    console.error('❌ Error: SPREADSHEET_ID is not set in .env');
    process.exit(1);
}

// ==========================================
// MCP Server Setup
// ==========================================
const server = new McpServer({
    name: 'predis-sheets',
    version: '1.0.0',
    description: 'Predispensing Error Recorder — Google Sheets MCP Server'
});

// ==========================================
// Tool: list_sheets
// ==========================================
server.tool(
    'list_sheets',
    'แสดงรายชื่อ Sheets ทั้งหมดใน Spreadsheet',
    {},
    async () => {
        try {
            const sheets = await listSheets();
            const text = sheets.map(s =>
                `📄 ${s.name} (rows: ${s.rowCount ?? '?'}, cols: ${s.colCount ?? '?'})`
            ).join('\n');

            return {
                content: [{
                    type: 'text',
                    text: `🗂️ Sheets ใน Spreadsheet ID: ${SPREADSHEET_ID}\n\n${text}`
                }]
            };
        } catch (err) {
            return { content: [{ type: 'text', text: `❌ Error: ${err.message}` }], isError: true };
        }
    }
);

// ==========================================
// Tool: get_errors
// ==========================================
server.tool(
    'get_errors',
    'ดึงข้อมูล Predispensing Errors จาก Google Sheets พร้อม filter ตามช่วงวันที่, กระบวนการ, สาเหตุ หรือ reporter',
    {
        limit: z.number().optional().describe('จำนวนรายการสูงสุดที่ต้องการ (default: 50)'),
        dateFrom: z.string().optional().describe('วันที่เริ่มต้น เช่น 2025-01-01'),
        dateTo: z.string().optional().describe('วันที่สิ้นสุด เช่น 2025-12-31'),
        process: z.string().optional().describe('กระบวนการ เช่น จัดยา, ลงข้อมูล'),
        cause: z.string().optional().describe('สาเหตุ เช่น ชื่อยาคล้ายกัน'),
        reporter: z.string().optional().describe('ชื่อหรือ PS Code ของผู้รายงาน'),
        location: z.string().optional().describe('สถานที่เกิดเหตุ'),
        sheetName: z.string().optional().describe('ชื่อ sheet (default: Predispensing_Errors)')
    },
    async ({ limit = 50, dateFrom, dateTo, process, cause, reporter, location, sheetName }) => {
        try {
            const sheet = sheetName || SHEET_NAMES.errors;
            const { headers, rows } = await readSheetWithHeaders(sheet);

            if (rows.length === 0) {
                return { content: [{ type: 'text', text: `ℹ️ ไม่มีข้อมูลใน sheet "${sheet}"` }] };
            }

            // Apply filters
            let filtered = rows.filter(row => {
                const rowDate = row['วันที่เกิดเหตุการณ์'] || row['eventDate'] || row[headers[0]] || '';
                if (dateFrom && rowDate < dateFrom) return false;
                if (dateTo && rowDate > dateTo) return false;
                if (process && !matchField(row, ['กระบวนการ', 'process'], process)) return false;
                if (cause && !matchField(row, ['สาเหตุ', 'cause'], cause)) return false;
                if (reporter && !matchField(row, ['ผู้รายงาน', 'reporter'], reporter)) return false;
                if (location && !matchField(row, ['สถานที่', 'location'], location)) return false;
                return true;
            });

            const total = filtered.length;
            filtered = filtered.slice(-limit); // เอา N รายการล่าสุด

            const summary = filtered.map((row, i) => {
                const date = row[headers[0]] || '-';
                const reportId = row[headers[1]] || '-';
                const proc = row['กระบวนการ'] || row['process'] || row[headers[5]] || '-';
                const errDetail = row['ข้อผิดพลาด'] || row['errorDetail'] || row[headers[6]] || '-';
                const rep = row['ผู้รายงาน'] || row['reporter'] || row[headers[11]] || '-';
                return `${i + 1}. [${reportId}] ${date} | ${proc} | ${errDetail} | รายงานโดย: ${rep}`;
            }).join('\n');

            return {
                content: [{
                    type: 'text',
                    text: [
                        `📊 ผลลัพท์: ${filtered.length} รายการ (จากทั้งหมด ${total} รายการที่ตรงเงื่อนไข)`,
                        `🗂️ Sheet: ${sheet}`,
                        `📋 Headers: ${headers.join(' | ')}`,
                        '',
                        summary
                    ].join('\n')
                }]
            };
        } catch (err) {
            return { content: [{ type: 'text', text: `❌ Error: ${err.message}` }], isError: true };
        }
    }
);

// ==========================================
// Tool: get_error_detail
// ==========================================
server.tool(
    'get_error_detail',
    'ดึงรายละเอียดเต็มของ Predispensing Error โดยใช้ Report ID',
    {
        reportId: z.string().describe('Report ID ที่ต้องการดู เช่น ERR-2501-001'),
        sheetName: z.string().optional().describe('ชื่อ sheet')
    },
    async ({ reportId, sheetName }) => {
        try {
            const sheet = sheetName || SHEET_NAMES.errors;
            const { headers, rows } = await readSheetWithHeaders(sheet);

            const found = rows.find(row => {
                const id = row[headers[1]] || row['reportId'] || '';
                return id.toString().toLowerCase() === reportId.toLowerCase();
            });

            if (!found) {
                return { content: [{ type: 'text', text: `ℹ️ ไม่พบ Report ID: ${reportId}` }] };
            }

            const detail = headers.map(h => `  ${h}: ${found[h] || '-'}`).join('\n');
            return {
                content: [{
                    type: 'text',
                    text: `📄 รายละเอียด Report ID: ${reportId}\n\n${detail}`
                }]
            };
        } catch (err) {
            return { content: [{ type: 'text', text: `❌ Error: ${err.message}` }], isError: true };
        }
    }
);

// ==========================================
// Tool: get_analytics_summary
// ==========================================
server.tool(
    'get_analytics_summary',
    'สรุปสถิติข้อมูล Predispensing Errors — กระบวนการ, สาเหตุ, สถานที่, เวร',
    {
        dateFrom: z.string().optional().describe('วันที่เริ่มต้น YYYY-MM-DD'),
        dateTo: z.string().optional().describe('วันที่สิ้นสุด YYYY-MM-DD'),
        sheetName: z.string().optional().describe('ชื่อ sheet')
    },
    async ({ dateFrom, dateTo, sheetName }) => {
        try {
            const sheet = sheetName || SHEET_NAMES.errors;
            const { headers, rows } = await readSheetWithHeaders(sheet);

            if (rows.length === 0) {
                return { content: [{ type: 'text', text: 'ℹ️ ไม่มีข้อมูล' }] };
            }

            // Filter by date
            const filtered = rows.filter(row => {
                const d = row[headers[0]] || '';
                if (dateFrom && d < dateFrom) return false;
                if (dateTo && d > dateTo) return false;
                return true;
            });

            const total = filtered.length;
            const processFreq = countFrequency(filtered, headers, ['กระบวนการ', 'process'], 5);
            const causeFreq = countFrequency(filtered, headers, ['สาเหตุ', 'cause'], 5);
            const locationFreq = countFrequency(filtered, headers, ['สถานที่', 'location'], 5);
            const shiftFreq = countFrequency(filtered, headers, ['เวร', 'shift'], 5);

            const sectionText = (title, freq) =>
                `${title}:\n${freq.map(([k, v]) => `  • ${k}: ${v} ครั้ง`).join('\n')}`;

            return {
                content: [{
                    type: 'text',
                    text: [
                        `📊 สรุปสถิติ Predispensing Errors`,
                        `📅 ช่วงเวลา: ${dateFrom || 'ทั้งหมด'} → ${dateTo || 'ทั้งหมด'}`,
                        `📝 จำนวนทั้งหมด: ${total} รายการ`,
                        '',
                        sectionText('🔧 กระบวนการ (Top 5)', processFreq),
                        '',
                        sectionText('🔍 สาเหตุ (Top 5)', causeFreq),
                        '',
                        sectionText('📍 สถานที่ (Top 5)', locationFreq),
                        '',
                        sectionText('🕐 เวร', shiftFreq)
                    ].join('\n')
                }]
            };
        } catch (err) {
            return { content: [{ type: 'text', text: `❌ Error: ${err.message}` }], isError: true };
        }
    }
);

// ==========================================
// Tool: get_users
// ==========================================
server.tool(
    'get_users',
    'ดึงรายชื่อผู้ใช้งานระบบทั้งหมด (ไม่รวม password)',
    {
        activeOnly: z.boolean().optional().describe('แสดงเฉพาะ user ที่ active (default: true)'),
        level: z.string().optional().describe('กรองตาม level เช่น admin, pharmacist, user')
    },
    async ({ activeOnly = true, level }) => {
        try {
            const { headers, rows } = await readSheetWithHeaders(SHEET_NAMES.users);

            let users = rows;
            if (activeOnly) {
                users = users.filter(u => {
                    const status = u['status'] || u[headers[7]] || '';
                    return status.toString().toLowerCase() === 'true' || status === '1';
                });
            }
            if (level) {
                users = users.filter(u => {
                    const userLevel = u['level'] || u[headers[4]] || '';
                    return userLevel.toLowerCase().includes(level.toLowerCase());
                });
            }

            const lines = users.map((u, i) => {
                const psCode = u['psCode'] || u[headers[0]] || '-';
                const name = u['name'] || u[headers[2]] || '-';
                const group = u['group'] || u[headers[3]] || '-';
                const lv = u['level'] || u[headers[4]] || '-';
                // ❌ ไม่แสดง id13 และ password
                return `${i + 1}. [${psCode}] ${name} | ${group} | level: ${lv}`;
            });

            return {
                content: [{
                    type: 'text',
                    text: [
                        `👥 ผู้ใช้งาน: ${users.length} คน`,
                        `🔒 หมายเหตุ: ข้อมูล ID13 และ Password ถูกซ่อนไว้`,
                        '',
                        ...lines
                    ].join('\n')
                }]
            };
        } catch (err) {
            return { content: [{ type: 'text', text: `❌ Error: ${err.message}` }], isError: true };
        }
    }
);

// ==========================================
// Tool: get_drugs
// ==========================================
server.tool(
    'get_drugs',
    'ดึงรายการยาทั้งหมด พร้อม filter HAD, status, และ text search',
    {
        hadOnly: z.boolean().optional().describe('แสดงเฉพาะ High Alert Drugs'),
        activeOnly: z.boolean().optional().describe('แสดงเฉพาะยาที่ active (default: true)'),
        search: z.string().optional().describe('ค้นหาชื่อยาหรือรหัสยา'),
        limit: z.number().optional().describe('จำนวนรายการสูงสุด (default: 100)')
    },
    async ({ hadOnly = false, activeOnly = true, search, limit = 100 }) => {
        try {
            const { headers, rows } = await readSheetWithHeaders(SHEET_NAMES.drugs);

            let drugs = rows;

            if (activeOnly) {
                drugs = drugs.filter(d => {
                    const s = d['status'] || d[headers[4]] || '';
                    return s.toString() === '1' || s.toLowerCase() === 'active' || s.toLowerCase() === 'true';
                });
            }
            if (hadOnly) {
                drugs = drugs.filter(d => {
                    const h = d['had'] || d[headers[3]] || '';
                    return h.toString() === '1' || h.toLowerCase() === 'high';
                });
            }
            if (search) {
                const q = search.toLowerCase();
                drugs = drugs.filter(d => {
                    const code = (d['drugCode'] || d[headers[0]] || '').toLowerCase();
                    const name = (d['drugName'] || d[headers[1]] || '').toLowerCase();
                    return code.includes(q) || name.includes(q);
                });
            }

            drugs = drugs.slice(0, limit);

            const lines = drugs.map((d, i) => {
                const code = d['drugCode'] || d[headers[0]] || '-';
                const name = d['drugName'] || d[headers[1]] || '-';
                const grp = d['group'] || d[headers[2]] || '-';
                const had = d['had'] || d[headers[3]] || '0';
                const isHAD = had === '1' || had.toLowerCase() === 'high';
                return `${i + 1}. [${code}] ${name} | ${grp}${isHAD ? ' ⚠️ HAD' : ''}`;
            });

            return {
                content: [{
                    type: 'text',
                    text: [
                        `💊 รายการยา: ${drugs.length} รายการ`,
                        search ? `🔍 ค้นหา: "${search}"` : '',
                        hadOnly ? '⚠️ แสดงเฉพาะ High Alert Drugs' : '',
                        '',
                        ...lines
                    ].filter(Boolean).join('\n')
                }]
            };
        } catch (err) {
            return { content: [{ type: 'text', text: `❌ Error: ${err.message}` }], isError: true };
        }
    }
);

// ==========================================
// Tool: append_error
// ==========================================
server.tool(
    'append_error',
    'บันทึก Predispensing Error ใหม่เข้า Google Sheets',
    {
        eventDate: z.string().describe('วันที่เกิดเหตุ YYYY-MM-DD'),
        reportId: z.string().describe('Report ID เช่น ERR-2503-001'),
        shift: z.enum(['เช้า', 'บ่าย', 'ดึก']).describe('เวร'),
        errorType: z.enum(['ผู้ป่วยนอก', 'ผู้ป่วยใน']).describe('ประเภทผู้ป่วย'),
        location: z.string().describe('สถานที่เกิดเหตุ'),
        process: z.enum(['จัดยา', 'ลงข้อมูล', 'เตรียมยา', 'คิดค่าใช้จ่าย', 'จัดเก็บ', 'จัดส่ง']).describe('กระบวนการ'),
        errorDetail: z.string().describe('รายละเอียดข้อผิดพลาด'),
        correctItem: z.string().describe('รายการที่ถูกต้อง'),
        incorrectItem: z.string().optional().describe('รายการที่ผิด'),
        cause: z.string().describe('สาเหตุ'),
        additionalDetails: z.string().optional().describe('รายละเอียดเพิ่มเติม'),
        reporter: z.string().describe('ชื่อผู้รายงาน')
    },
    async (data) => {
        try {
            const now = new Date();
            const timestamp = now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

            // Sanitize: ป้องกัน formula injection
            const sanitize = (val = '') => {
                const s = val.toString().trim();
                return ['=', '+', '-', '@'].includes(s[0]) ? `'${s}` : s;
            };

            const row = [
                sanitize(data.eventDate),
                sanitize(data.reportId),
                sanitize(data.shift),
                sanitize(data.errorType),
                sanitize(data.location),
                sanitize(data.process),
                sanitize(data.errorDetail),
                sanitize(data.correctItem),
                sanitize(data.incorrectItem || ''),
                sanitize(data.cause),
                sanitize(data.additionalDetails || ''),
                sanitize(data.reporter),
                timestamp
            ];

            await appendRow(SHEET_NAMES.errors, row);

            return {
                content: [{
                    type: 'text',
                    text: [
                        `✅ บันทึก Error เรียบร้อยแล้ว`,
                        `📝 Report ID: ${data.reportId}`,
                        `📅 วันที่: ${data.eventDate}`,
                        `🔧 กระบวนการ: ${data.process}`,
                        `👤 รายงานโดย: ${data.reporter}`,
                        `⏰ Timestamp: ${timestamp}`
                    ].join('\n')
                }]
            };
        } catch (err) {
            return { content: [{ type: 'text', text: `❌ Error: ${err.message}` }], isError: true };
        }
    }
);

// ==========================================
// Tool: add_drug
// ==========================================
server.tool(
    'add_drug',
    'เพิ่มรายการยาใหม่เข้า Drug_List sheet',
    {
        drugCode: z.string().describe('รหัสยา เช่น AMX500'),
        drugName: z.string().describe('ชื่อยา'),
        group: z.string().optional().describe('กลุ่มยา'),
        had: z.boolean().optional().describe('High Alert Drug หรือไม่'),
        active: z.boolean().optional().describe('ใช้งานหรือไม่ (default: true)')
    },
    async ({ drugCode, drugName, group = '', had = false, active = true }) => {
        try {
            // ตรวจสอบว่ารหัสยาซ้ำหรือไม่
            const { rows } = await readSheetWithHeaders(SHEET_NAMES.drugs);
            const exists = rows.some(r =>
                (r['drugCode'] || '').toString().toLowerCase() === drugCode.toLowerCase()
            );

            if (exists) {
                return {
                    content: [{
                        type: 'text',
                        text: `⚠️ รหัสยา "${drugCode}" มีอยู่ในระบบแล้ว`
                    }],
                    isError: true
                };
            }

            const row = [
                drugCode.trim(),
                drugName.trim(),
                group.trim(),
                had ? '1' : '0',
                active ? '1' : '0'
            ];

            await appendRow(SHEET_NAMES.drugs, row);

            return {
                content: [{
                    type: 'text',
                    text: [
                        `✅ เพิ่มรายการยาเรียบร้อยแล้ว`,
                        `💊 รหัส: ${drugCode}`,
                        `📛 ชื่อ: ${drugName}`,
                        `🏷️ กลุ่ม: ${group || '-'}`,
                        `⚠️ HAD: ${had ? 'ใช่' : 'ไม่ใช่'}`,
                        `✔️ สถานะ: ${active ? 'Active' : 'Inactive'}`
                    ].join('\n')
                }]
            };
        } catch (err) {
            return { content: [{ type: 'text', text: `❌ Error: ${err.message}` }], isError: true };
        }
    }
);

// ==========================================
// Tool: read_sheet_raw
// ==========================================
server.tool(
    'read_sheet_raw',
    'อ่านข้อมูลดิบจาก Sheet ใดก็ได้ใน Spreadsheet',
    {
        sheetName: z.string().describe('ชื่อ sheet'),
        range: z.string().optional().describe('Range เช่น A1:D10 (default: อ่านทั้ง sheet)'),
        limit: z.number().optional().describe('จำนวนแถวสูงสุด (default: 100)')
    },
    async ({ sheetName, range, limit = 100 }) => {
        try {
            const values = await readSheetRaw(sheetName, range);
            const limited = values.slice(0, limit + 1); // +1 สำหรับ header

            const formatted = limited.map((row, i) =>
                `Row ${i + 1}: ${row.join(' | ')}`
            ).join('\n');

            return {
                content: [{
                    type: 'text',
                    text: [
                        `📄 Sheet: "${sheetName}"${range ? ` Range: ${range}` : ''}`,
                        `📊 แสดง ${limited.length} แถว (จาก ${values.length} แถวทั้งหมด)`,
                        '',
                        formatted
                    ].join('\n')
                }]
            };
        } catch (err) {
            return { content: [{ type: 'text', text: `❌ Error: ${err.message}` }], isError: true };
        }
    }
);

// ==========================================
// Utility: Frequency Counter
// ==========================================
function countFrequency(rows, headers, fieldAliases, topN = 5) {
    const freq = {};
    rows.forEach(row => {
        let val = '';
        for (const alias of fieldAliases) {
            if (row[alias]) { val = row[alias]; break; }
            // ลองหาจาก header index
            const idx = headers.findIndex(h => h.toLowerCase().includes(alias.toLowerCase()));
            if (idx >= 0 && row[headers[idx]]) { val = row[headers[idx]]; break; }
        }
        if (val) freq[val] = (freq[val] || 0) + 1;
    });

    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN);
}

function matchField(row, aliases, query) {
    const q = query.toLowerCase();
    return aliases.some(alias => {
        const val = (row[alias] || '').toString().toLowerCase();
        return val.includes(q);
    });
}

// ==========================================
// Start Server
// ==========================================
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('🚀 Predis MCP Server started (stdio)');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
