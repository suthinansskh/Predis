<script setup>
import { percent } from '../lib/util.js';

defineProps({
    title: { type: String, required: true },
    entries: { type: Array, default: () => [] },
    total: { type: Number, default: 0 },
    limit: { type: Number, default: 8 },
    tone: { type: String, default: 'accent' }
});
</script>

<template>
    <div class="panel">
        <h3>{{ title }}</h3>
        <p v-if="!entries.length" class="muted center">ไม่มีข้อมูล</p>
        <ul v-else class="bar-list">
            <li v-for="e in entries.slice(0, limit)" :key="e.key">
                <div class="bar-row">
                    <span class="bar-label" :title="e.label">{{ e.label }}</span>
                    <span>{{ e.count }} <small>({{ percent(e.count, total).toFixed(0) }}%)</small></span>
                </div>
                <div class="bar-track"><div class="bar-fill" :class="tone" :style="{ width: Math.min(100, Math.max(percent(e.count, total), 2)) + '%' }"></div></div>
            </li>
        </ul>
    </div>
</template>
