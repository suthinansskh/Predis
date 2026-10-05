import { createRouter, createWebHashHistory } from 'vue-router';
import { isLoggedIn, hasRole } from './composables/session.js';
import { DRUG_MANAGERS } from './constants.js';

// แบ่ง chunk ตามหน้า — หน้าบันทึกรายงานไม่ต้องโหลด Chart.js
const routes = [
    { path: '/login', name: 'login', component: () => import('./pages/LoginPage.vue'), meta: { public: true, title: 'เข้าสู่ระบบ' } },
    { path: '/report', name: 'report', component: () => import('./pages/ReportPage.vue'), meta: { title: 'บันทึกข้อผิดพลาด', icon: 'plus', nav: true } },
    { path: '/dashboard', name: 'dashboard', component: () => import('./pages/DashboardPage.vue'), meta: { title: 'แดชบอร์ด', icon: 'chart', nav: true } },
    { path: '/had', name: 'had', component: () => import('./pages/HadPage.vue'), meta: { title: 'HAD', icon: 'alert', nav: true } },
    { path: '/my', name: 'my', component: () => import('./pages/MyReportsPage.vue'), meta: { title: 'รายงานของฉัน', icon: 'user', nav: true } },
    { path: '/drugs', name: 'drugs', component: () => import('./pages/DrugsPage.vue'), meta: { title: 'รายการยา', icon: 'pill', nav: true } },
    { path: '/users', name: 'users', component: () => import('./pages/UsersPage.vue'), meta: { title: 'จัดการผู้ใช้', icon: 'users', nav: true, roles: ['admin'] } },
    { path: '/', redirect: '/report' },
    { path: '/:pathMatch(.*)*', redirect: '/report' }
];

export const router = createRouter({
    history: createWebHashHistory(),
    routes,
    scrollBehavior: () => ({ top: 0 })
});

router.beforeEach(to => {
    if (!to.meta.public && !isLoggedIn.value) {
        return { name: 'login', query: to.fullPath !== '/report' ? { next: to.fullPath } : {} };
    }
    if (to.name === 'login' && isLoggedIn.value && !to.query.activate) return { name: 'report' };
    if (to.meta.roles && !hasRole(...to.meta.roles)) return { name: 'report' };
    return true;
});

router.afterEach(to => {
    document.title = `${to.meta.title || 'Predis'} · Predispensing Error Recorder`;
});

export { DRUG_MANAGERS };
