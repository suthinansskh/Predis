<script setup>
// ตารางรายงาน (แบ่งหน้าฝั่ง server) + ค้นหา + ส่งออก CSV
import { ref, watch } from 'vue';
import Icon from './Icon.vue';
import { api, toast } from '../composables/session.js';
import { formatThaiDate, toCsv, downloadText, REPORT_CSV_HEADER, reportCsvRow, bangkokToday } from '../lib/util.js';

const props = defineProps({
    title: { type: String, default: 'รายการรายงาน' },
    filter: { type: Object, required: true },
    pageSize: { type: Number, default: 20 },
    filenamePrefix: { type: String, default: 'reports' }
});

const items = ref([]);
const total = ref(0);
const page = ref(1);
const q = ref('');
const loading = ref(false);
const error = ref('');
const exporting = ref(false);
let searchTimer = null;

async function load(p = 1) {
    page.value = p;
    loading.value = true;
    error.value = '';
    try {
        const result = await api.call('reports.list', { ...props.filter, q: q.value.trim(), page: p, pageSize: props.pageSize });
        items.value = result.items;
        total.value = result.total;
    } catch (e) {
        error.value = e.message;
    } finally {
        loading.value = false;
    }
}

watch(() => JSON.stringify(props.filter), () => load(1), { immediate: true });
watch(q, () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => load(1), 400); });

const pages = () => Math.max(1, Math.ceil(total.value / props.pageSize));

async function exportCsv() {
    exporting.value = true;
    try {
        const rows = [];
        for (let p = 1; p <= 100; p++) {
            const result = await api.call('reports.list', { ...props.filter, q: q.value.trim(), page: p, pageSize: 200 });
            rows.push(...result.items);
            if (rows.length >= result.total) break;
        }
        downloadText(`${props.filenamePrefix}_${props.filter.from || 'all'}_${props.filter.to || bangkokToday()}.csv`,
            toCsv(REPORT_CSV_HEADER, rows.map(reportCsvRow)));
        toast(`ส่งออก ${rows.length} รายการแล้ว`, 'success');
    } catch (e) {
        toast('ส่งออกไม่สำเร็จ: ' + e.message, 'error');
    } finally {
        exporting.value = false;
    }
}

function hadCodes(r) {
    return String(r.hadDrugCodes || '').split(',').filter(Boolean);
}
defineExpose({ reload: () => load(page.value) });
</script>

<template>
    <div class="panel wide">
        <div class="panel-head">
            <h3>{{ title }}</h3>
            <div class="panel-tools">
                <label class="search">
                    <Icon name="search" :size="16" />
                    <input v-model="q" type="search" placeholder="ค้นหา ID / ยา / ข้อผิดพลาด" aria-label="ค้นหารายงาน">
                </label>
                <button class="btn small" type="button" :disabled="exporting || !total" @click="exportCsv">
                    <Icon name="download" :size="16" /> {{ exporting ? 'กำลังส่งออก…' : 'CSV' }}
                </button>
            </div>
        </div>
        <div class="table-wrap">
            <table class="table cards-on-mobile">
                <thead>
                    <tr><th>วันที่</th><th>Report ID</th><th>กระบวนการ</th><th>ข้อผิดพลาด</th><th>ยาที่ถูกต้อง</th><th>ยาที่ผิด</th><th>สาเหตุ</th><th>ผู้รายงาน</th></tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="8" class="center muted">กำลังโหลด…</td></tr>
                    <tr v-else-if="error"><td colspan="8" class="center">{{ error }}</td></tr>
                    <tr v-else-if="!items.length"><td colspan="8" class="center muted">ไม่พบรายงาน</td></tr>
                    <template v-else>
                    <tr v-for="r in items" :key="r.id">
                        <td data-label="วันที่">{{ formatThaiDate(r.eventDate) }}<br><small class="muted">{{ r.shift }}</small></td>
                        <td data-label="Report ID"><code>{{ r.id }}</code></td>
                        <td data-label="กระบวนการ">{{ r.process }}</td>
                        <td data-label="ข้อผิดพลาด">{{ r.errorDetail }}</td>
                        <td data-label="ยาที่ถูกต้อง">
                            <span v-if="hadCodes(r).includes(r.correctDrugCode)" class="tag danger">HAD</span>
                            {{ r.correctDrugName || '-' }} <small v-if="r.correctDrugCode" class="muted">({{ r.correctDrugCode }})</small>
                        </td>
                        <td data-label="ยาที่ผิด">
                            <span v-if="hadCodes(r).includes(r.incorrectDrugCode)" class="tag danger">HAD</span>
                            {{ r.incorrectDrugName || '-' }} <small v-if="r.incorrectDrugCode" class="muted">({{ r.incorrectDrugCode }})</small>
                        </td>
                        <td data-label="สาเหตุ">{{ r.cause }}</td>
                        <td data-label="ผู้รายงาน">{{ r.reporterName || '-' }}</td>
                    </tr>
                    </template>
                </tbody>
            </table>
        </div>
        <div class="pager">
            <button class="btn small" type="button" :disabled="page <= 1 || loading" @click="load(page - 1)"><Icon name="chevronLeft" :size="16" /> ก่อนหน้า</button>
            <span>ทั้งหมด {{ total }} รายการ · หน้า {{ page }}/{{ pages() }}</span>
            <button class="btn small" type="button" :disabled="page >= pages() || loading" @click="load(page + 1)">ถัดไป <Icon name="chevronRight" :size="16" /></button>
        </div>
    </div>
</template>
