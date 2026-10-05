// In-memory mock ของ Google Apps Script services สำหรับทดสอบ backend/src/*.js ด้วย node:test
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const toSigned = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));

class MockSheet {
    constructor(name, rows = []) {
        this.name = name;
        this.rows = rows.map(r => r.slice());
    }
    getDataRange() { return this.getRange(1, 1, Math.max(this.rows.length, 1), this.width()); }
    width() { return Math.max(1, ...this.rows.map(r => r.length)); }
    getLastRow() { return this.rows.length; }
    getLastColumn() { return this.rows.length ? this.width() : 0; }
    appendRow(row) { this.rows.push(row.slice()); }
    insertRow() {}
    getRange(row, col, numRows = 1, numCols = 1) {
        const sheet = this;
        return {
            getValues() {
                const out = [];
                for (let r = 0; r < numRows; r++) {
                    const src = sheet.rows[row - 1 + r] || [];
                    const line = [];
                    for (let c = 0; c < numCols; c++) line.push(src[col - 1 + c] ?? '');
                    out.push(line);
                }
                return out;
            },
            setValues(values) {
                values.forEach((line, r) => {
                    const idx = row - 1 + r;
                    sheet.rows[idx] = sheet.rows[idx] || [];
                    line.forEach((v, c) => { sheet.rows[idx][col - 1 + c] = v; });
                });
                return this;
            },
            setValue(v) { return this.setValues([[v]]); },
            clearContent() {
                for (let r = 0; r < numRows; r++) {
                    const line = sheet.rows[row - 1 + r];
                    if (line) for (let c = 0; c < numCols; c++) line[col - 1 + c] = '';
                }
                return this;
            },
            setFontWeight() { return this; },
            setBackground() { return this; }
        };
    }
    clear() { this.rows = []; }
}

function createEnv({ sheets = {}, now, fileOrder = 'sorted' } = {}) {
    const store = {};
    Object.entries(sheets).forEach(([name, rows]) => { store[name] = new MockSheet(name, rows); });

    const cache = new Map();
    const props = new Map();
    const spreadsheet = {
        getSheetByName: name => store[name] || null,
        insertSheet: name => (store[name] = new MockSheet(name))
    };

    const context = {
        console: { log() {}, error() {} },
        JSON, Math, String, Number, Array, Object, parseInt, RegExp, decodeURIComponent,
        Utilities: {
            DigestAlgorithm: { SHA_256: 'sha256' },
            Charset: { UTF_8: 'utf8' },
            computeDigest(alg, value) {
                const input = Array.isArray(value) ? Buffer.from(value.map(b => b & 0xff)) : Buffer.from(String(value), 'utf8');
                return toSigned(crypto.createHash('sha256').update(input).digest());
            },
            getUuid: () => crypto.randomUUID(),
            sleep(ms) { const end = Date.now() + ms; while (Date.now() < end) { /* busy wait */ } },
            computeHmacSha256Signature(value, key) {
                return toSigned(crypto.createHmac('sha256', Buffer.from(String(key), 'utf8')).update(String(value), 'utf8').digest());
            },
            base64EncodeWebSafe(data, charset) {
                // เหมือน Apps Script: string ที่ไม่ระบุ charset → อักษรนอก ASCII กลายเป็น "?"
                const text = String(data);
                const buf = Array.isArray(data) ? Buffer.from(data.map(b => b & 0xff))
                    : charset === 'utf8' ? Buffer.from(text, 'utf8') : Buffer.from(text.replace(/[^\t\n\r -~]/g, '?'), 'latin1');
                return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
            },
            base64DecodeWebSafe(text) {
                return toSigned(Buffer.from(String(text).replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
            },
            newBlob(bytes) {
                return { getDataAsString: () => Buffer.from(bytes.map(b => b & 0xff)).toString('utf8') };
            },
            // รองรับ pattern yyyy MM dd HH mm ss ตาม timezone ที่ระบุ (ใช้แค่ Asia/Bangkok = UTC+7)
            formatDate(d, tz, pattern) {
                const t = new Date(d.getTime() + (tz === 'Asia/Bangkok' ? 7 * 3600e3 : 0));
                const pad = n => String(n).padStart(2, '0');
                return String(pattern || "yyyy-MM-dd'T'HH:mm:ss").replace(/'T'/g, 'T')
                    .replace('yyyy', t.getUTCFullYear()).replace('yy', String(t.getUTCFullYear()).slice(2))
                    .replace('MM', pad(t.getUTCMonth() + 1)).replace('dd', pad(t.getUTCDate()))
                    .replace('HH', pad(t.getUTCHours())).replace('mm', pad(t.getUTCMinutes())).replace('ss', pad(t.getUTCSeconds()));
            }
        },
        CacheService: {
            getScriptCache: () => ({
                get: k => (cache.has(k) ? cache.get(k) : null),
                put: (k, v) => cache.set(k, String(v)),
                remove: k => cache.delete(k)
            })
        },
        PropertiesService: {
            getScriptProperties: () => ({
                getProperty: k => (props.has(k) ? props.get(k) : null),
                setProperty: (k, v) => props.set(k, String(v)),
                deleteProperty: k => props.delete(k)
            })
        },
        LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
        SpreadsheetApp: { openById: () => spreadsheet },
        ContentService: {
            MimeType: { JSON: 'json', TEXT: 'text' },
            createTextOutput: text => ({ text, getContent() { return text; }, setMimeType() { return this; } })
        },
        HtmlService: { createHtmlOutput: html => ({ text: JSON.stringify({ html }) }) }
    };

    // Date ที่ควบคุมได้ (ใช้ทดสอบช่วง LEGACY_APPEND_UNTIL)
    // เวลาควบคุมได้: createEnv({now}) หรือ env.setNow() ระหว่างเทส (เช่น ทดสอบ token หมดอายุ)
    const RealDate = Date;
    let fixedNow = now ? new RealDate(now).getTime() : null;
    context.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [fixedNow === null ? RealDate.now() : fixedNow])); }
        static now() { return fixedNow === null ? RealDate.now() : fixedNow; }
    };

    vm.createContext(context);
    // Apps Script โหลดทุกไฟล์ในโปรเจกต์เข้า global scope เดียวกัน
    const srcDir = path.join(__dirname, '..', '..', 'backend', 'src');
    const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js')).sort();
    if (fileOrder === 'reverse') files.reverse();
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(srcDir, file), 'utf8'), context, { filename: file });
    }

    const parse = output => JSON.parse(output.text);
    return {
        gs: context,
        sheets: store,
        cache,
        props,
        post: data => parse(context.doPost({ parameter: data, postData: null })),
        v2: (action, payload = {}, token) => parse(context.doPost({
            parameter: { action, payload: JSON.stringify(payload), ...(token ? { token } : {}) }, postData: null
        })),
        setNow: value => { fixedNow = value === null ? null : new RealDate(value).getTime(); },
        get: params => parse(context.doGet({ parameter: params }))
    };
}

module.exports = { createEnv };
