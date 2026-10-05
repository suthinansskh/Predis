import js from '@eslint/js';
import globals from 'globals';

export default [
    {
        ignores: ['**/node_modules/**']
    },
    js.configs.recommended,
    {
        // Frontend: classic scripts ที่แชร์ global ข้ามไฟล์ และถูกเรียกจาก onclick ใน HTML
        // จึงปิด no-undef / no-unused-vars (จะผิดพลาดทั้งหมดในโครงสร้างแบบนี้)
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: { ...globals.browser, Chart: 'readonly' }
        },
        rules: {
            'no-undef': 'off',
            'no-unused-vars': 'off',
            'no-redeclare': 'off',
            'no-empty': ['error', { allowEmptyCatch: true }],
            // โค้ดเดิมใช้รูปแบบ `let score = 0;` แล้วกำหนดค่าใหม่ — ไม่ใช่บั๊ก
            'no-useless-assignment': 'off'
        }
    },
    {
        files: ['sw.js'],
        languageOptions: { sourceType: 'script', globals: globals.serviceworker }
    },
    {
        // Google Apps Script (V8) — ทุกไฟล์แชร์ global scope เดียวกัน
        files: ['backend/src/**/*.js'],
        languageOptions: {
            sourceType: 'script',
            globals: {
                SpreadsheetApp: 'readonly', ContentService: 'readonly', HtmlService: 'readonly',
                Utilities: 'readonly', CacheService: 'readonly', LockService: 'readonly',
                PropertiesService: 'readonly', console: 'readonly'
            }
        },
        rules: {
            // ฟังก์ชันระดับบนถูกเรียกจาก runtime (doGet/doPost) หรือรันเองใน editor
            'no-unused-vars': ['error', { vars: 'local', caughtErrors: 'none' }],
            // ฟังก์ชัน/ค่าคงที่ประกาศในไฟล์อื่นของโปรเจกต์เดียวกัน
            'no-undef': 'off'
        }
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: { sourceType: 'commonjs', globals: globals.node }
    },
    {
        files: ['tools/**/*.js', 'mcp-server/**/*.js', 'tests/**/*.mjs', 'eslint.config.mjs'],
        languageOptions: { sourceType: 'module', globals: globals.node }
    }
];
