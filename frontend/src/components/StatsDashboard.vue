<script setup>
// หน้าสถิติร่วม: ภาพรวม / HAD / รายงานของฉัน — ใช้ reports.stats + reports.list ฝั่ง server
import { ref, computed, onMounted } from 'vue';
import ReportFilters from './ReportFilters.vue';
import StatTiles from './StatTiles.vue';
import TrendChart from './TrendChart.vue';
import BarList from './BarList.vue';
import HBarChart from './HBarChart.vue';
import ReportsTable from './ReportsTable.vue';
import Icon from './Icon.vue';
import { api, toast } from '../composables/session.js';
import { percent } from '../lib/util.js';

const props = defineProps({
    mode: { type: String, default: 'all' }, // all | had | mine
    title: { type: String, required: true },
    subtitle: { type: String, default: '' }
});

const stats = ref(null);
const loading = ref(false);
const filter = ref(null);
const updatedAt = ref('');
const filters = ref(null);

onMounted(() => load({ ...filters.value.filter }));

function printPage() {
    window.print();
}

const extra = computed(() => (props.mode === 'had' ? { hadOnly: true } : props.mode === 'mine' ? { mine: true } : {}));
const tableFilter = computed(() => filter.value && { ...filter.value, ...extra.value });

async function load(f) {
    if (f) filter.value = f;
    if (!filter.value) return;
    loading.value = true;
    try {
        stats.value = await api.call('reports.stats', { ...filter.value, ...extra.value });
        updatedAt.value = new Date(stats.value.generatedAt).toLocaleTimeString('th-TH');
    } catch (e) {
        toast('โหลดสถิติไม่สำเร็จ: ' + e.message, 'error');
    } finally {
        loading.value = false;
    }
}

const tiles = computed(() => {
    const s = stats.value;
    if (!s) return placeholderTiles();
    const t = s.totals;
    if (props.mode === 'had') {
        const all = s.comparison ? s.comparison.allInRange : 0;
        return [
            { label: 'เหตุการณ์ HAD (ช่วงที่เลือก)', value: t.all, tone: 'danger' },
            { label: 'สัดส่วนของเหตุการณ์ทั้งหมด', value: `${percent(t.all, all).toFixed(1)}%`, sub: `${t.all} จาก ${all}`, tone: 'warning' },
            { label: 'เดือนนี้', value: t.month, tone: 'info' },
            { label: '7 วันล่าสุด', value: t.last7, tone: 'info' },
            { label: 'รายการยา HAD ที่เกี่ยวข้อง', value: s.topHadDrugs.length }
        ];
    }
    return [
        { label: 'รายงาน (ช่วงที่เลือก)', value: t.all, tone: 'info' },
        { label: 'ปีงบประมาณนี้', value: t.fiscalYear },
        { label: 'เดือนนี้', value: t.month },
        { label: '7 วันล่าสุด', value: t.last7 },
        { label: 'วันนี้', value: t.today, tone: 'success' },
        { label: 'เกี่ยวข้องกับยา HAD', value: t.had, sub: `${percent(t.had, t.all).toFixed(1)}%`, tone: 'danger' }
    ];
});

function placeholderTiles() {
    const labels = props.mode === 'had'
        ? ['เหตุการณ์ HAD (ช่วงที่เลือก)', 'สัดส่วนของเหตุการณ์ทั้งหมด', 'เดือนนี้', '7 วันล่าสุด', 'รายการยา HAD ที่เกี่ยวข้อง']
        : ['รายงาน (ช่วงที่เลือก)', 'ปีงบประมาณนี้', 'เดือนนี้', '7 วันล่าสุด', 'วันนี้', 'เกี่ยวข้องกับยา HAD'];
    return labels.map(label => ({ label, value: '-' }));
}

const tone = computed(() => (props.mode === 'had' ? 'danger' : 'accent'));
</script>

<template>
    <section class="page">
        <header class="page-head with-actions">
            <div>
                <h1>{{ title }}</h1>
                <p v-if="subtitle" class="muted">{{ subtitle }}</p>
            </div>
            <div class="actions">
                <button class="btn small" type="button" :disabled="loading" @click="load()"><Icon name="refresh" :size="16" /> รีเฟรช</button>
                <button class="btn small" type="button" @click="printPage"><Icon name="print" :size="16" /> พิมพ์</button>
            </div>
        </header>

        <ReportFilters ref="filters" :status="updatedAt ? `อัปเดต ${updatedAt}` : ''" @change="load" />

        <StatTiles :tiles="tiles" :loading="loading && !stats" />

        <div class="grid">
            <TrendChart v-if="stats" :title="mode === 'had' ? 'แนวโน้มเหตุการณ์ HAD 12 เดือน' : 'แนวโน้ม 12 เดือน'"
                        :monthly="stats.monthly" :compare-to="mode === 'had' && stats.comparison ? stats.comparison.monthlyAll : null"
                        :bar-label="mode === 'had' ? 'เหตุการณ์ HAD' : 'จำนวนรายงาน'" :tone="tone" />
            <HBarChart v-if="stats && mode === 'had'" title="ยา HAD ที่เกิดเหตุการณ์บ่อย" :entries="stats.topHadDrugs" tone="danger"
                       empty="ไม่มีเหตุการณ์ที่เกี่ยวข้องกับยา HAD ในช่วงนี้" />
            <HBarChart v-if="stats && mode !== 'had'" title="ยาที่เกิดข้อผิดพลาดบ่อย" :entries="stats.topDrugs" />
            <template v-if="stats">
                <BarList title="ตามกระบวนการ" :entries="stats.byProcess" :total="stats.totals.all" :tone="tone" />
                <BarList title="ข้อผิดพลาดที่พบบ่อย" :entries="stats.byErrorDetail" :total="stats.totals.all" :tone="tone" />
                <BarList title="สาเหตุ" :entries="stats.byCause" :total="stats.totals.all" :tone="tone" />
                <BarList title="เวร" :entries="stats.byShift" :total="stats.totals.all" :tone="tone" />
                <BarList title="สถานที่" :entries="stats.byLocation" :total="stats.totals.all" :tone="tone" />
                <BarList title="ประเภทผู้ป่วย" :entries="stats.byPatientType" :total="stats.totals.all" :tone="tone" />
                <HBarChart v-if="mode !== 'had' && stats.topHadDrugs.length" title="ยา HAD ที่เกี่ยวข้อง" :entries="stats.topHadDrugs" tone="danger" />
                <BarList v-if="stats.byReporter && mode !== 'mine'" title="ผู้รายงาน" :entries="stats.byReporter" :total="stats.totals.all" :limit="15" />
            </template>
        </div>

        <ReportsTable v-if="tableFilter" :filter="tableFilter" :title="mode === 'had' ? 'รายการเหตุการณ์ HAD' : 'รายการรายงาน'"
                      :filename-prefix="mode === 'had' ? 'HAD-events' : mode === 'mine' ? 'my-reports' : 'reports'" />

        <p v-if="mode === 'had'" class="muted small">
            ยา HAD ตามรายการที่ห้องยากำหนดในหน้า "รายการยา" — เหตุการณ์ย้อนหลังคำนวณจากรายการ HAD ปัจจุบัน
        </p>
    </section>
</template>
