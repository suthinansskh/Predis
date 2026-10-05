<script setup>
import StatsDashboard from '../components/StatsDashboard.vue';
import { session } from '../composables/session.js';
</script>

<template>
    <StatsDashboard mode="mine" title="รายงานของฉัน" :subtitle="`รายงานที่ ${session.user?.name || ''} เป็นผู้บันทึก`" />
</template>
