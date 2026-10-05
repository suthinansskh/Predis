<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';
import { api, toast, canManageDrugs } from '../composables/session.js';
import { drugStore, loadDrugs, patchDrug } from '../composables/drugs.js';
import { searchDrugs, toCsv, downloadText } from '../lib/util.js';

const PAGE = 50;
const q = ref('');
const had = ref('all');
const status = ref('Active');
const page = ref(1);
const editing = ref(null); // {drugCode, drugName, had, status}
const adding = ref(null);
const busy = ref(false);

onMounted(() => loadDrugs(api));

const filtered = computed(() => {
    let list = drugStore.drugs;
    if (status.value !== 'all') list = list.filter(d => d.status === status.value);
    if (had.value !== 'all') list = list.filter(d => d.had === had.value);
    if (q.value.trim()) return searchDrugs(list, q.value, 1000);
    return [...list].sort((a, b) => a.drugName.localeCompare(b.drugName));
});
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE)));
const visible = computed(() => filtered.value.slice((page.value - 1) * PAGE, page.value * PAGE));
const hadCount = computed(() => drugStore.drugs.filter(d => d.had === 'High' && d.status === 'Active').length);
watch([q, had, status], () => { page.value = 1; });

function startEdit(d) {
    editing.value = { drugCode: d.drugCode, drugName: d.drugName, had: d.had, status: d.status };
}

async function saveEdit() {
    busy.value = true;
    const { drugCode, had: newHad, status: newStatus } = editing.value;
    try {
        await api.call('drugs.update', { drugCode, had: newHad, status: newStatus });
        patchDrug(drugCode, { had: newHad, status: newStatus });
        toast(`บันทึก ${drugCode} แล้ว (HAD: ${newHad === 'High' ? 'High Alert' : 'ยาทั่วไป'})`, 'success');
        editing.value = null;
    } catch (e) {
        toast('แก้ไขไม่สำเร็จ: ' + e.message, 'error');
    } finally {
        busy.value = false;
    }
}

function startAdd() {
    adding.value = { drugCode: '', drugName: '', group: '', had: 'Regular', status: 'Active', unit: '', strength: '', dosageForm: '' };
}

async function saveAdd() {
    busy.value = true;
    try {
        await api.call('drugs.add', { ...adding.value });
        toast(`เพิ่มยา ${adding.value.drugCode} แล้ว`, 'success');
        adding.value = null;
        await loadDrugs(api, { force: true });
    } catch (e) {
        toast('เพิ่มยาไม่สำเร็จ: ' + e.message, 'error');
    } finally {
        busy.value = false;
    }
}

function exportCsv() {
    downloadText('drug-list.csv', toCsv(['รหัสยา', 'ชื่อยา', 'กลุ่ม', 'HAD', 'สถานะ', 'หน่วย'],
        filtered.value.map(d => [d.drugCode, d.drugName, d.group, d.had, d.status, d.unit])));
}
</script>

<template>
    <section class="page">
        <header class="page-head with-actions">
            <div>
                <h1>รายการยา</h1>
                <p class="muted">
                    {{ drugStore.drugs.length }} รายการ · HAD {{ hadCount }} รายการ
                    <template v-if="drugStore.source && drugStore.source !== 'server'"> · ข้อมูลในเครื่อง (อาจไม่เป็นปัจจุบัน)</template>
                </p>
            </div>
            <div class="actions">
                <button class="btn small" type="button" :disabled="drugStore.loading" @click="loadDrugs(api, { force: true })"><Icon name="refresh" :size="16" /> รีเฟรช</button>
                <button class="btn small" type="button" @click="exportCsv"><Icon name="download" :size="16" /> CSV</button>
                <button v-if="canManageDrugs" class="btn small primary" type="button" @click="startAdd"><Icon name="plus" :size="16" /> เพิ่มยา</button>
            </div>
        </header>

        <div v-if="drugStore.error" class="callout error" role="alert">{{ drugStore.error }}</div>
        <div class="callout info small">
            สถานะ HAD กำหนดโดยห้องยาในหน้านี้เท่านั้น (ไม่ใช้ธงจาก HOSxP) — ค่าที่แก้จะคงอยู่แม้ sync รายการยาใหม่
        </div>

        <div class="filters">
            <label class="search grow">
                <Icon name="search" :size="16" />
                <input v-model="q" type="search" placeholder="ค้นหาชื่อยาหรือรหัสยา" aria-label="ค้นหายา">
            </label>
            <label>HAD
                <select v-model="had">
                    <option value="all">ทั้งหมด</option>
                    <option value="High">High Alert</option>
                    <option value="Regular">ยาทั่วไป</option>
                </select>
            </label>
            <label>สถานะ
                <select v-model="status">
                    <option value="all">ทั้งหมด</option>
                    <option value="Active">ใช้งาน</option>
                    <option value="Inactive">ไม่ใช้งาน</option>
                </select>
            </label>
            <span class="filters-status">พบ {{ filtered.length }} รายการ</span>
        </div>

        <div class="panel wide">
            <div class="table-wrap">
                <table class="table cards-on-mobile">
                    <thead><tr><th>รหัสยา</th><th>ชื่อยา</th><th>หน่วย</th><th>HAD</th><th>สถานะ</th><th v-if="canManageDrugs">จัดการ</th></tr></thead>
                    <tbody>
                        <tr v-if="drugStore.loading && !drugStore.drugs.length"><td colspan="6" class="center muted">กำลังโหลด…</td></tr>
                        <tr v-else-if="!visible.length"><td colspan="6" class="center muted">ไม่พบยา</td></tr>
                        <tr v-for="d in visible" :key="d.drugCode">
                            <td data-label="รหัสยา"><code>{{ d.drugCode }}</code></td>
                            <td data-label="ชื่อยา">{{ d.drugName }}</td>
                            <td data-label="หน่วย">{{ d.unit || '-' }}</td>
                            <td data-label="HAD"><span class="tag" :class="d.had === 'High' ? 'danger' : 'neutral'">{{ d.had === 'High' ? 'High Alert' : 'ทั่วไป' }}</span></td>
                            <td data-label="สถานะ"><span class="tag" :class="d.status === 'Active' ? 'success' : 'neutral'">{{ d.status === 'Active' ? 'ใช้งาน' : 'ไม่ใช้งาน' }}</span></td>
                            <td v-if="canManageDrugs" data-label="จัดการ">
                                <button class="btn small" type="button" :aria-label="`แก้ไข HAD/สถานะ ${d.drugCode}`" @click="startEdit(d)"><Icon name="edit" :size="16" /> แก้ไข</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="pager">
                <button class="btn small" type="button" :disabled="page <= 1" @click="page--"><Icon name="chevronLeft" :size="16" /> ก่อนหน้า</button>
                <span>หน้า {{ page }}/{{ pages }}</span>
                <button class="btn small" type="button" :disabled="page >= pages" @click="page++">ถัดไป <Icon name="chevronRight" :size="16" /></button>
            </div>
        </div>

        <Modal v-if="editing" :title="`แก้ไข HAD / สถานะ — ${editing.drugCode}`" :note="editing.drugName" @close="editing = null">
            <form @submit.prevent="saveEdit">
                <div class="field">
                    <label for="ed-had">สถานะ HAD</label>
                    <select id="ed-had" v-model="editing.had">
                        <option value="High">High Alert Drug</option>
                        <option value="Regular">ยาทั่วไป</option>
                    </select>
                </div>
                <div class="field">
                    <label for="ed-status">สถานะการใช้งาน</label>
                    <select id="ed-status" v-model="editing.status">
                        <option value="Active">ใช้งาน</option>
                        <option value="Inactive">ไม่ใช้งาน (ไม่แสดงในฟอร์มบันทึก)</option>
                    </select>
                </div>
                <div class="actions">
                    <button type="button" class="btn" @click="editing = null">ยกเลิก</button>
                    <button type="submit" class="btn primary" :disabled="busy">บันทึก</button>
                </div>
            </form>
        </Modal>

        <Modal v-if="adding" title="เพิ่มรายการยา" note="ใช้สำหรับยาที่ยังไม่มีใน HOSxP — ยาจาก HOSxP จะถูก sync เข้ามาเอง" @close="adding = null">
            <form @submit.prevent="saveAdd">
                <div class="field"><label for="ad-code">รหัสยา</label><input id="ad-code" v-model="adding.drugCode" required maxlength="30"></div>
                <div class="field"><label for="ad-name">ชื่อยา</label><input id="ad-name" v-model="adding.drugName" required maxlength="200"></div>
                <div class="field"><label for="ad-unit">หน่วย</label><input id="ad-unit" v-model="adding.unit" maxlength="30"></div>
                <div class="field">
                    <label for="ad-had">สถานะ HAD</label>
                    <select id="ad-had" v-model="adding.had"><option value="Regular">ยาทั่วไป</option><option value="High">High Alert Drug</option></select>
                </div>
                <div class="actions">
                    <button type="button" class="btn" @click="adding = null">ยกเลิก</button>
                    <button type="submit" class="btn primary" :disabled="busy">เพิ่มยา</button>
                </div>
            </form>
        </Modal>
    </section>
</template>
