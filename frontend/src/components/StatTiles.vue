<script setup>
defineProps({
    /** [{label, value, sub?, tone?}] tone: danger | warning | info | success */
    tiles: { type: Array, required: true },
    loading: { type: Boolean, default: false }
});
</script>

<template>
    <div class="tiles">
        <div v-for="t in tiles" :key="t.label" class="tile" :class="t.tone">
            <span class="tile-label">{{ t.label }}</span>
            <span class="tile-value">
                <span v-if="loading" class="skeleton" aria-hidden="true"></span>
                <template v-else>{{ t.value }}</template>
            </span>
            <span v-if="t.sub && !loading" class="tile-sub">{{ t.sub }}</span>
        </div>
    </div>
</template>
