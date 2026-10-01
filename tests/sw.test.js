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
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8') + '\n;globalThis.__sw = { ASSETS, JS_FILES };', context);
    return context.__sw;
}

test('ไฟล์ทุกตัวใน ASSETS ของ Service Worker มีอยู่จริง (cache.addAll จะล้มทั้งชุดถ้าขาดไฟล์เดียว)', () => {
    const { ASSETS } = loadSw();
    for (const asset of ASSETS) {
        if (asset === './') continue;
        assert.ok(fs.existsSync(path.join(ROOT, asset)), `missing ${asset}`);
    }
});

test('js/ ทุกไฟล์ถูก cache และทุกหน้าโหลดสคริปต์ตามลำดับเดียวกับ sw.js', () => {
    const { JS_FILES } = loadSw();
    const onDisk = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => `./js/${f}`).sort();
    assert.deepEqual([...JS_FILES].sort(), onDisk);
    assert.equal(JS_FILES[JS_FILES.length - 1], './js/init.js', 'init.js ต้องโหลดเป็นไฟล์สุดท้าย');

    for (const page of PAGES) {
        const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
        const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => `./${m[1]}`);
        assert.deepEqual(scripts, [...JS_FILES], page);
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
