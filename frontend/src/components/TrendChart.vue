<script setup>
// แนวโน้มรายเดือน: แท่ง = จำนวน, เส้น (ถ้ามี) = % เทียบกับยอดรวม
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import '../lib/chart.js';
import { thaiMonthLabel, percent } from '../lib/util.js';
import { theme } from '../composables/session.js';

const props = defineProps({
    title: { type: String, default: 'แนวโน้ม 12 เดือน' },
    monthly: { type: Array, default: () => [] },
    compareTo: { type: Array, default: null },
    barLabel: { type: String, default: 'จำนวนรายงาน' },
    tone: { type: String, default: 'accent' }
});

function css(name, fallback) {
    // อ่านหลังเปลี่ยนธีม (theme.value อยู่ใน computed → คำนวณใหม่)
    void theme.value;
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const data = computed(() => {
    const datasets = [{
        type: 'bar', label: props.barLabel, data: props.monthly.map(m => m.count), yAxisID: 'y',
        backgroundColor: props.tone === 'danger' ? css('--danger', '#ef4444') : css('--accent', '#3b82f6'), borderRadius: 4
    }];
    if (props.compareTo) {
        datasets.push({
            type: 'line', label: '% ของรายงานทั้งหมด', yAxisID: 'y1', tension: 0.3,
            data: props.monthly.map((m, i) => +percent(m.count, props.compareTo[i] ? props.compareTo[i].count : 0).toFixed(1)),
            borderColor: css('--warning', '#f59e0b'), backgroundColor: css('--warning', '#f59e0b')
        });
    }
    return { labels: props.monthly.map(m => thaiMonthLabel(m.month)), datasets };
});

const options = computed(() => {
    const text = css('--text-2', '#64748b');
    const grid = css('--border', '#e2e8f0');
    const scales = {
        x: { ticks: { color: text }, grid: { color: grid } },
        y: { beginAtZero: true, ticks: { precision: 0, color: text }, grid: { color: grid } }
    };
    if (props.compareTo) scales.y1 = { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: text, callback: v => v + '%' } };
    return {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: text } } }, scales
    };
});
const summary = computed(() => props.monthly.map(m => `${thaiMonthLabel(m.month)} ${m.count}`).join(', '));
</script>

<template>
    <div class="panel wide">
        <h3>{{ title }}</h3>
        <div class="chart-box">
            <Bar :data="data" :options="options" :aria-label="`${title}: ${summary}`" role="img" />
        </div>
    </div>
</template>
