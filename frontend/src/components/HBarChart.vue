<script setup>
// แท่งแนวนอน (เช่น ยาที่เกิดเหตุการณ์บ่อย)
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import '../lib/chart.js';
import { theme } from '../composables/session.js';

const props = defineProps({
    title: { type: String, required: true },
    entries: { type: Array, default: () => [] },
    limit: { type: Number, default: 10 },
    tone: { type: String, default: 'accent' },
    empty: { type: String, default: 'ไม่มีข้อมูล' }
});

function css(name, fallback) {
    void theme.value;
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const top = computed(() => props.entries.slice(0, props.limit));
const data = computed(() => ({
    labels: top.value.map(e => (e.label.length > 34 ? e.label.slice(0, 33) + '…' : e.label)),
    datasets: [{ label: 'จำนวน', data: top.value.map(e => e.count), borderRadius: 4,
        backgroundColor: props.tone === 'danger' ? css('--danger', '#ef4444') : css('--accent', '#3b82f6') }]
}));
const options = computed(() => {
    const text = css('--text-2', '#64748b');
    return {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => top.value[items[0].dataIndex].label } } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0, color: text }, grid: { color: css('--border', '#e2e8f0') } }, y: { ticks: { color: text } } }
    };
});
const summary = computed(() => top.value.map(e => `${e.label} ${e.count}`).join(', '));
</script>

<template>
    <div class="panel wide">
        <h3>{{ title }}</h3>
        <p v-if="!top.length" class="muted center">{{ empty }}</p>
        <div v-else class="chart-box" :style="{ height: Math.max(180, top.length * 30 + 40) + 'px' }">
            <Bar :data="data" :options="options" :aria-label="`${title}: ${summary}`" role="img" />
        </div>
    </div>
</template>
