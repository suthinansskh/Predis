import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.js';
import { onAuthRequired, toast, applyTheme, theme } from './composables/session.js';
import { startBackgroundSync } from './composables/app.js';
import './styles/main.css';

applyTheme(theme.value);

onAuthRequired(() => {
    toast('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', 'warning');
    const current = router.currentRoute.value;
    if (current.name !== 'login') router.push({ name: 'login', query: { next: current.fullPath } });
});

startBackgroundSync();

// ล้าง cache ของ Service Worker เวอร์ชันเดิม (predis-v1..v10)
if ('caches' in window) {
    caches.keys().then(keys => keys.filter(k => /^predis-v\d+$/.test(k)).forEach(k => caches.delete(k))).catch(() => {});
}
createApp(App).use(router).mount('#app');
