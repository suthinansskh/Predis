<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from './components/Icon.vue';
import ChangePasswordDialog from './components/ChangePasswordDialog.vue';
import { session, isLoggedIn, hasRole, clearSession, api, toast, toasts, theme, cycleTheme } from './composables/session.js';
import { outbox, flushOutbox, pendingCounts, refreshPendingCounts } from './composables/app.js';

const route = useRoute();
const router = useRouter();
const showChangePassword = ref(false);
const menuOpen = ref(false);

const navItems = computed(() => router.getRoutes()
    .filter(r => r.meta.nav && (!r.meta.roles || hasRole(...r.meta.roles)))
    .sort((a, b) => ['report', 'dashboard', 'had', 'my', 'drugs', 'users'].indexOf(a.name) - ['report', 'dashboard', 'had', 'my', 'drugs', 'users'].indexOf(b.name)));

const pendingTotal = computed(() => pendingCounts.value.registrations + pendingCounts.value.resets);
const myOutbox = computed(() => outbox.items.value.filter(i => session.user && i.psCode === session.user.psCode));
const themeLabel = computed(() => ({ auto: 'ตามระบบ', light: 'โหมดสว่าง', dark: 'โหมดมืด' })[theme.value]);

function logout() {
    const pending = myOutbox.value.length;
    // call() อ่าน token ทันที (ก่อน clearSession) — ไม่ต้องรอผล
    api.call('auth.logout').catch(() => {});
    clearSession();
    // ร่างรายงานบนเครื่องที่ใช้ร่วมกัน
    try { Object.keys(localStorage).filter(k => k.startsWith('predis.v2.draft:')).forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ }
    toast(pending ? `ออกจากระบบแล้ว — มีรายงานรอส่ง ${pending} รายการ จะส่งเมื่อคุณเข้าสู่ระบบอีกครั้ง` : 'ออกจากระบบเรียบร้อย', pending ? 'warning' : 'info');
    router.push({ name: 'login' });
}

watch(() => session.user && session.user.psCode, psCode => {
    if (!psCode) return;
    refreshPendingCounts();
    flushOutbox({ quiet: true });
    if (session.mustChangePassword) showChangePassword.value = true;
}, { immediate: true });

watch(() => route.fullPath, () => { menuOpen.value = false; });

onMounted(() => {
    if (isLoggedIn.value && session.mustChangePassword) showChangePassword.value = true;
});
</script>

<template>
    <a class="skip-link" href="#main">ข้ามไปเนื้อหา</a>
    <div v-if="route.meta.public" class="public-shell">
        <router-view />
    </div>
    <div v-else class="shell">
        <header class="topbar">
            <div class="brand">
                <Icon name="pill" :size="22" />
                <span>Predis</span>
            </div>
            <button class="icon-btn menu-btn" :aria-expanded="menuOpen" aria-controls="mainnav" aria-label="เมนู" @click="menuOpen = !menuOpen">
                <Icon name="menu" />
            </button>
            <nav id="mainnav" class="mainnav" :class="{ open: menuOpen }" aria-label="เมนูหลัก">
                <router-link v-for="item in navItems" :key="item.name" :to="{ name: item.name }" class="navlink">
                    <Icon :name="item.meta.icon" />
                    <span>{{ item.meta.title }}</span>
                    <span v-if="item.name === 'users' && pendingTotal" class="badge" :title="`รออนุมัติ ${pendingCounts.registrations} · ขอรีเซ็ตรหัส ${pendingCounts.resets}`">{{ pendingTotal }}</span>
                </router-link>
            </nav>
            <div class="topbar-actions">
                <button v-if="myOutbox.length" class="btn warn small" :title="'รายงานที่บันทึกขณะออฟไลน์ — กดเพื่อส่งตอนนี้'" @click="flushOutbox()">
                    <Icon name="upload" :size="16" /> รอส่ง {{ myOutbox.length }}
                </button>
                <span class="who" :title="`${session.user?.group || ''} · ${session.user?.level || ''}`">{{ session.user?.name }}</span>
                <button class="icon-btn" :aria-label="`ธีม: ${themeLabel} (กดเพื่อเปลี่ยน)`" :title="`ธีม: ${themeLabel}`" @click="cycleTheme">
                    <Icon :name="theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'auto'" />
                </button>
                <button class="icon-btn" aria-label="เปลี่ยนรหัสผ่าน" title="เปลี่ยนรหัสผ่าน" @click="showChangePassword = true"><Icon name="key" /></button>
                <button class="icon-btn" aria-label="ออกจากระบบ" title="ออกจากระบบ" @click="logout"><Icon name="logout" /></button>
            </div>
        </header>
        <main id="main" tabindex="-1">
            <router-view />
        </main>
    </div>

    <ChangePasswordDialog v-if="showChangePassword" :forced="session.mustChangePassword" @close="showChangePassword = false" />

    <div class="toasts" role="status" aria-live="polite">
        <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">{{ t.message }}</div>
    </div>
</template>
