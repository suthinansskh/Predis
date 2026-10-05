// เพิ่ม CACHE_VERSION ทุกครั้งที่เปลี่ยนรายการ ASSETS (tests/sw.test.js ตรวจว่าไฟล์มีอยู่จริง)
const CACHE_VERSION = 9;
const CACHE_NAME = `predis-v${CACHE_VERSION}`;

// ลำดับการโหลดสคริปต์ (classic script แชร์ global) — init ต้องอยู่ท้ายสุด
const JS_ORDER = ['core', 'auth', 'app-shell', 'report-form', 'form-validation', 'drug-list', 'drug-sync', 'dashboard', 'analytics', 'export', 'outbox', 'users', 'init'];

// สคริปต์ที่แต่ละหน้าโหลด (ต้องตรงกับแท็ก <script> ใน HTML — tests/sw.test.js ตรวจให้)
// eslint-disable-next-line no-unused-vars -- เอกสาร/ทดสอบเท่านั้น (ไม่ใช้ใน runtime)
const PAGE_SCRIPTS = {
  index: ['core', 'auth', 'app-shell', 'report-form', 'drug-list', 'drug-sync', 'outbox', 'users', 'init'],
  report: ['core', 'auth', 'app-shell', 'report-form', 'form-validation', 'drug-list', 'outbox', 'users', 'init'],
  dashboard: ['core', 'auth', 'app-shell', 'dashboard', 'analytics', 'export', 'outbox', 'users', 'init'],
  myreport: ['core', 'auth', 'app-shell', 'dashboard', 'outbox', 'users', 'init']
};

const JS_FILES = JS_ORDER.map(name => `./js/${name}.js`);

const ASSETS = [
  './',
  './index.html',
  './report.html',
  './dashboard.html',
  './myreport.html',
  './styles.css',
  './manifest.json',
  './drug_list.json',
  ...JS_FILES
];

// ไลบรารีจาก CDN ระบุเวอร์ชันตายตัว → cache-first ได้อย่างปลอดภัย (ใช้งานออฟไลน์ได้)
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function putInCache(request, response) {
  if (response && (response.ok || response.type === 'opaque')) {
    const clone = response.clone(); // Clone synchronously
    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
  }
  return response;
}

self.addEventListener('fetch', event => {
  // ไม่ยุ่งกับ POST (API Apps Script) และ request อื่นที่ไม่ใช่ GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => putInCache(event.request, response))
      )
    );
    return;
  }

  // Same-origin: network-first → ผู้ใช้ได้โค้ดล่าสุดทันทีหลัง deploy, ใช้ cache เมื่อออฟไลน์
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(response => putInCache(event.request, response))
        .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
  }
});
