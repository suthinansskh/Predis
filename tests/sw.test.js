const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const PAGES = ['index.html', 'report.html', 'dashboard.html', 'myreport.html'];

function loadSw() {
    const context = { self: { addEventListener() {}, location: { origin: 'https://example.test' } } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8') +
        '\n;globalThis.__sw = { ASSETS, JS_FILES, JS_ORDER, PAGE_SCRIPTS };', context);
    // แปลงเป็น object ของ realm นี้ (deepEqual เทียบ prototype ด้วย)
    return JSON.parse(JSON.stringify(context.__sw));
}

test('ไฟล์ทุกตัวใน ASSETS ของ Service Worker มีอยู่จริง (cache.addAll จะล้มทั้งชุดถ้าขาดไฟล์เดียว)', () => {
    const { ASSETS } = loadSw();
    for (const asset of ASSETS) {
        if (asset === './') continue;
        assert.ok(fs.existsSync(path.join(ROOT, asset)), `missing ${asset}`);
    }
});

test('js/ ทุกไฟล์ถูก cache และแต่ละหน้าโหลดสคริปต์ตาม PAGE_SCRIPTS', () => {
    const { JS_FILES, JS_ORDER, PAGE_SCRIPTS } = loadSw();
    const onDisk = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => `./js/${f}`).sort();
    assert.deepEqual([...JS_FILES].sort(), onDisk);

    for (const page of PAGES) {
        const name = page.replace('.html', '');
        const expected = PAGE_SCRIPTS[name];
        assert.ok(expected, `PAGE_SCRIPTS.${name} missing`);
        assert.deepEqual(expected, JS_ORDER.filter(f => expected.includes(f)), `${name}: ต้องเรียงตาม JS_ORDER`);
        for (const common of ['core', 'auth', 'app-shell', 'outbox', 'users', 'init']) {
            assert.ok(expected.includes(common), `${name} ต้องโหลด ${common}`);
        }
        assert.equal(expected[expected.length - 1], 'init', 'init.js ต้องโหลดเป็นไฟล์สุดท้าย');

        const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
        const scripts = [...html.matchAll(/<script src="js\/([^"]+)\.js"/g)].map(m => m[1]);
        assert.deepEqual(scripts, expected, page);
    }
});

test('ฟังก์ชันที่ HTML เรียก (onclick/onchange/inline script) ถูกนิยามในสคริปต์ที่หน้านั้นโหลด', () => {
    const { PAGE_SCRIPTS } = loadSw();
    const definedIn = {};
    for (const file of fs.readdirSync(path.join(ROOT, 'js'))) {
        const src = fs.readFileSync(path.join(ROOT, 'js', file), 'utf8');
        for (const m of src.matchAll(/^(?:async\s+)?function\s+([\w$]+)/gm)) definedIn[m[1]] = file.replace('.js', '');
    }
    for (const page of PAGES) {
        const loaded = new Set(PAGE_SCRIPTS[page.replace('.html', '')]);
        const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
        const handlers = [...html.matchAll(/\son\w+="([^"]+)"/g)].map(m => m[1]);
        const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
        for (const code of [...handlers, ...inline]) {
            for (const m of code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
                const file = definedIn[m[1]];
                if (file) assert.ok(loaded.has(file), `${page} เรียก ${m[1]}() จาก js/${file}.js แต่ไม่ได้โหลด`);
            }
        }
    }
});

test('สคริปต์/สไตล์จาก CDN มี Subresource Integrity', () => {
    for (const page of PAGES) {
        const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
        const external = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="https:\/\/[^"]+"[^>]*>/g)].map(m => m[0])
            .filter(tag => !/rel="preconnect"|fonts.googleapis.com/.test(tag));
        for (const tag of external) {
            assert.match(tag, /integrity="sha384-/, `${page}: ${tag}`);
        }
    }
});
