import js from '@eslint/js';
import globals from 'globals';

export default [
    {
        ignores: ['**/node_modules/**', 'frontend/dist/**']
    },
    js.configs.recommended,
    {
        // Frontend v2 (Vue 3, ES modules) — ไฟล์ .vue ตรวจโดย vite build + vitest
        files: ['frontend/src/**/*.js', 'frontend/scripts/**/*.js', 'frontend/vite.config.js'],
        languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser, ...globals.node } }
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
