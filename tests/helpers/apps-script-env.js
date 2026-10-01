// In-memory mock ของ Google Apps Script services สำหรับทดสอบ apps-script.js ด้วย node:test
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

function createEnv({ sheets = {}, now } = {}) {
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
            formatDate: d => d.toISOString()
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
            createTextOutput: text => ({ text, setMimeType() { return this; } })
        },
        HtmlService: { createHtmlOutput: html => ({ text: JSON.stringify({ html }) }) }
    };

    // Date ที่ควบคุมได้ (ใช้ทดสอบช่วง LEGACY_APPEND_UNTIL)
    const RealDate = Date;
    context.Date = now
        ? class extends RealDate {
            constructor(...args) { super(...(args.length ? args : [now])); }
            static now() { return new RealDate(now).getTime(); }
        }
        : RealDate;

    vm.createContext(context);
    const code = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script.js'), 'utf8');
    vm.runInContext(code, context, { filename: 'apps-script.js' });

    const parse = output => JSON.parse(output.text);
    return {
        gs: context,
        sheets: store,
        cache,
        props,
        post: data => parse(context.doPost({ parameter: data, postData: null })),
        get: params => parse(context.doGet({ parameter: params }))
    };
}

module.exports = { createEnv };
