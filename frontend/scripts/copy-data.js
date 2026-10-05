// คัดลอก drug_list.json (สร้างโดย tools/sync-drugs.js ที่ root) เข้า public ก่อน build
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../../drug_list.json', import.meta.url));
const to = fileURLToPath(new URL('../public/drug_list.json', import.meta.url));
copyFileSync(from, to);
console.log('copied drug_list.json → public/');
