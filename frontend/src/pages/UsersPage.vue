<script setup>
import { ref, computed, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';
import StatTiles from '../components/StatTiles.vue';
import { api, toast, session } from '../composables/session.js';
import { refreshPendingCounts } from '../composables/app.js';
import { LEVEL_LABELS, USER_GROUPS } from '../constants.js';
import { slipsHtml, activationUrl } from '../lib/slips.js';

const users = ref([]);
const resets = ref([]);
const stats = ref(null);
const loading = ref(false);
const tab = ref('pending');
const q = ref('');
const codes = ref(null); // รหัสที่ออก (แสดงเมื่อเปิดหน้าต่างพิมพ์ไม่ได้)
const busyKey = ref('');

async function load() {
    loading.value = true;
    try {
        const [list, loginStats] = await Promise.all([api.call('users.list'), api.call('admin.loginStats', { days: 7 }).catch(() => null)]);
        users.value = list.users || [];
        resets.value = list.pendingResets || [];
        stats.value = loginStats;
        refreshPendingCounts();
        if (tab.value === 'pending' && !users.value.some(u => u.request === 'PENDING')) tab.value = 'all';
    } catch (e) {
        toast(e.message, 'error');
    } finally {
        loading.value = false;
    }
}
onMounted(load);

const isSelf = u => session.user && u.psCode === session.user.psCode;
const pendingUsers = computed(() => users.value.filter(u => u.request === 'PENDING'));
const filtered = computed(() => {
    let list = users.value;
    if (tab.value === 'pending') list = pendingUsers.value;
    else if (tab.value === 'disabled') list = list.filter(u => !u.active && u.request !== 'PENDING');
    else if (tab.value === 'nogroup') list = list.filter(u => !u.group && u.active);
    const term = q.value.trim().toLowerCase();
    if (term) list = list.filter(u => `${u.psCode} ${u.name}`.toLowerCase().includes(term));
    return list;
});

const tiles = computed(() => {
    if (!stats.value) return [];
    const a = stats.value.accounts;
    const week = stats.value.days.reduce((acc, d) => { Object.entries(d.counts).forEach(([k, v]) => { acc[k] = (acc[k] || 0) + v; }); return acc; }, {});
    return [
        { label: 'บัญชีที่ใช้งาน', value: a.active },
        { label: 'ยังใช้รหัสเริ่มต้น (เข้าระบบไม่ได้)', value: a.weakPassword, tone: a.weakPassword ? 'danger' : '' },
        { label: 'รหัสเปิดใช้งานที่ยังไม่ใช้', value: a.activationsPending },
        { label: 'ยังไม่ระบุกลุ่มงาน', value: a.missingGroup, tone: a.missingGroup ? 'warning' : '' },
        { label: 'login สำเร็จ 7 วัน', value: week.LOGIN_SUCCESS || 0, tone: 'success' },
        { label: 'ถูกบล็อก/ผิด 7 วัน', value: (week.LOGIN_BLOCKED_WEAK || 0) + (week.LOGIN_FAILED || 0) }
    ];
});

async function run(key, action, payload, message) {
    busyKey.value = key;
    try {
        const result = await api.call(action, payload);
        toast(message || (result && result.message) || 'บันทึกแล้ว', 'success');
        await load();
    } catch (e) {
        toast(e.message, 'error');
        await load();
    } finally {
        busyKey.value = '';
    }
}

const approve = (u, level) => run(`ap-${u.psCode}`, 'users.approve', { psCode: u.psCode, level });
const reject = u => confirm(`ปฏิเสธคำขอลงทะเบียนของ ${u.psCode} (${u.name})?`) && run(`rj-${u.psCode}`, 'users.reject', { psCode: u.psCode });
function setLevel(u, level) {
    if (!confirm(`เปลี่ยนระดับของ ${u.psCode} เป็น "${LEVEL_LABELS[level]}"? ผู้ใช้จะต้องเข้าสู่ระบบใหม่`)) return load();
    run(`lv-${u.psCode}`, 'users.update', { psCode: u.psCode, level });
}
const setGroup = (u, group) => run(`gr-${u.psCode}`, 'users.update', { psCode: u.psCode, group });
function toggleActive(u) {
    if (u.active && !confirm(`ปิดใช้งานบัญชี ${u.psCode} (${u.name})? ผู้ใช้จะถูกออกจากระบบทันที`)) return;
    run(`ac-${u.psCode}`, 'users.update', { psCode: u.psCode, active: !u.active });
}

async function issue(payload, label) {
    if (!confirm(`ออกรหัสเปิดใช้งานให้ ${label}?\nรหัสเปิดใช้งานเดิมที่ยังไม่ใช้จะถูกยกเลิก`)) return;
    // เปิดหน้าต่างก่อน await (กัน popup blocker)
    const win = window.open('', '_blank');
    busyKey.value = 'issue';
    try {
        const { items } = await api.call('users.issueActivations', payload);
        if (win) {
            win.document.write(slipsHtml(items, activationUrl()));
            win.document.close();
        } else {
            codes.value = items;
        }
        toast(`ออกรหัสเปิดใช้งานแล้ว ${items.length} คน`, 'success');
        await load();
    } catch (e) {
        if (win) win.close();
        toast(e.message, 'error');
    } finally {
        busyKey.value = '';
    }
}
</script>

<template>
    <section class="page">
        <header class="page-head with-actions">
            <div>
                <h1>จัดการผู้ใช้</h1>
                <p class="muted">อนุมัติผู้ใช้ใหม่ ออกรหัสเปิดใช้งาน และกำหนดระดับ/กลุ่มงาน</p>
            </div>
            <div class="actions">
                <button class="btn small" type="button" :disabled="loading" @click="load"><Icon name="refresh" :size="16" /> รีเฟรช</button>
            </div>
        </header>

        <StatTiles v-if="tiles.length" :tiles="tiles" />
        <div v-if="stats && stats.accounts.weakPassword" class="callout warning">
            <span>ผู้ใช้ {{ stats.accounts.weakPassword }} คนยังใช้รหัสเริ่มต้นซึ่งถูกปิดใช้งาน — ออกรหัสเปิดใช้งานแล้วพิมพ์ใบแจกตามกลุ่มงาน</span>
            <button class="btn primary small" type="button" :disabled="busyKey === 'issue'" @click="issue({ weakOnly: true }, `ผู้ใช้ที่ยังใช้รหัสเริ่มต้น ${stats.accounts.weakPassword} คน`)">
                <Icon name="print" :size="16" /> ออกรหัส + พิมพ์ใบแจก
            </button>
        </div>

        <div v-if="resets.length" class="panel wide">
            <h3>คำขอรีเซ็ตรหัสผ่าน ({{ resets.length }})</h3>
            <ul class="plain-list">
                <li v-for="r in resets" :key="r.psCode">
                    <span><strong>{{ r.psCode }}</strong> {{ r.name }} <small class="muted">{{ r.requestedAt }}</small></span>
                    <button class="btn small primary" type="button" :disabled="busyKey === 'issue'" @click="issue({ psCodes: [r.psCode] }, `${r.psCode} (${r.name})`)">
                        <Icon name="ticket" :size="16" /> ออกรหัสเปิดใช้งาน
                    </button>
                </li>
            </ul>
        </div>

        <div class="filters">
            <div class="tabs" role="tablist" aria-label="กรองผู้ใช้">
                <button v-for="[key, label] in [['pending', `รออนุมัติ (${pendingUsers.length})`], ['all', `ทั้งหมด (${users.length})`], ['nogroup', 'ยังไม่ระบุกลุ่ม'], ['disabled', 'ปิดใช้งาน']]"
                        :key="key" type="button" role="tab" class="tab" :aria-selected="tab === key" @click="tab = key">{{ label }}</button>
            </div>
            <label class="search grow">
                <Icon name="search" :size="16" />
                <input v-model="q" type="search" placeholder="ค้นหา PS Code / ชื่อ" aria-label="ค้นหาผู้ใช้">
            </label>
        </div>

        <div class="panel wide">
            <div class="table-wrap">
                <table class="table cards-on-mobile">
                    <thead><tr><th>PS Code</th><th>ชื่อ</th><th>กลุ่มงาน</th><th>ระดับ</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
                    <tbody>
                        <tr v-if="loading && !users.length"><td colspan="6" class="center muted">กำลังโหลด…</td></tr>
                        <tr v-else-if="!filtered.length"><td colspan="6" class="center muted">ไม่มีรายการ</td></tr>
                        <tr v-for="u in filtered" :key="u.psCode">
                            <td data-label="PS Code"><strong>{{ u.psCode }}</strong> <span v-if="u.mustChangePassword" class="tag info">รหัสชั่วคราว</span></td>
                            <td data-label="ชื่อ">{{ u.name }}<br v-if="u.email"><small v-if="u.email" class="muted">{{ u.email }}</small></td>
                            <td data-label="กลุ่มงาน">
                                <span v-if="isSelf(u)">{{ u.group }}</span>
                                <select v-else :value="u.group" :class="{ attention: !u.group }" :aria-label="`กลุ่มงานของ ${u.psCode}`" @change="setGroup(u, $event.target.value)">
                                    <option value="" disabled>-- ระบุกลุ่ม --</option>
                                    <option v-for="g in [...new Set([...USER_GROUPS, u.group].filter(Boolean))]" :key="g" :value="g">{{ g }}</option>
                                </select>
                            </td>
                            <td data-label="ระดับ">
                                <span v-if="isSelf(u)">{{ LEVEL_LABELS[u.level] || u.level }}</span>
                                <select v-else-if="u.request === 'PENDING'" :id="`lv-${u.psCode}`" :aria-label="`ระดับที่จะอนุมัติให้ ${u.psCode}`">
                                    <option v-for="(label, value) in LEVEL_LABELS" :key="value" :value="value" :selected="value === 'user'">{{ label }}</option>
                                </select>
                                <select v-else :value="u.level" :aria-label="`ระดับของ ${u.psCode}`" @change="setLevel(u, $event.target.value)">
                                    <option v-for="(label, value) in LEVEL_LABELS" :key="value" :value="value">{{ label }}</option>
                                </select>
                            </td>
                            <td data-label="สถานะ">
                                <span v-if="u.request === 'PENDING'" class="tag warning">รออนุมัติ</span>
                                <span v-else-if="u.request === 'REJECTED'" class="tag danger">ไม่อนุมัติ</span>
                                <span v-else-if="!u.active" class="tag neutral">ปิดใช้งาน</span>
                                <span v-else class="tag success">ใช้งาน</span>
                            </td>
                            <td data-label="จัดการ" class="row-actions">
                                <template v-if="u.request === 'PENDING'">
                                    <button class="btn small primary" type="button" :disabled="!!busyKey" @click="approve(u, $event.target.closest('tr').querySelector('select[id^=lv-]')?.value || 'user')"><Icon name="check" :size="16" /> อนุมัติ</button>
                                    <button class="btn small" type="button" :disabled="!!busyKey" @click="reject(u)"><Icon name="x" :size="16" /> ปฏิเสธ</button>
                                </template>
                                <template v-else>
                                    <button class="btn small" type="button" :disabled="!!busyKey || !u.active" @click="issue({ psCodes: [u.psCode] }, `${u.psCode} (${u.name})`)"><Icon name="ticket" :size="16" /> รหัสเปิดใช้งาน</button>
                                    <button v-if="!isSelf(u)" class="btn small" type="button" :disabled="!!busyKey" @click="toggleActive(u)">{{ u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน' }}</button>
                                </template>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <Modal v-if="codes" title="รหัสเปิดใช้งาน" note="เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — รหัสแสดงครั้งเดียว กรุณาจดหรือคัดลอกก่อนปิด" :closable="false" wide>
            <ul class="plain-list">
                <li v-for="c in codes" :key="c.psCode"><code class="big">{{ c.code }}</code> {{ c.psCode }} {{ c.name }}</li>
            </ul>
            <div class="actions"><button class="btn primary" type="button" @click="codes = null">ปิด</button></div>
        </Modal>
    </section>
</template>
