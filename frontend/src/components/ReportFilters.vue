<script setup>
// ตัวกรองร่วมของ dashboard: ช่วงเวลา + กระบวนการ + ประเภทผู้ป่วย → emit filter payload
import { reactive, watch, computed } from 'vue';
import { PERIODS, periodRange, bangkokToday, formatThaiDate } from '../lib/util.js';
import { PROCESSES, PATIENT_TYPES } from '../constants.js';

const props = defineProps({ defaultPeriod: { type: String, default: '12m' }, status: { type: String, default: '' } });
const emit = defineEmits(['change']);
const today = bangkokToday();
const state = reactive({ period: props.defaultPeriod, from: '', to: today, process: 'all', patientType: 'all' });

const filter = computed(() => {
    const range = periodRange(state.period, today, { from: state.from, to: state.to });
    return { ...range, process: state.process, patientType: state.patientType };
});
const rangeLabel = computed(() => filter.value.from
    ? `${formatThaiDate(filter.value.from)} – ${formatThaiDate(filter.value.to)}`
    : 'ทุกช่วงเวลา');

function emitChange() {
    if (state.period === 'custom' && !state.from) return;
    emit('change', { ...filter.value });
}
watch(() => [state.period, state.process, state.patientType], emitChange);
defineExpose({ filter, rangeLabel, emitChange });
</script>

<template>
    <div class="filters" role="group" aria-label="ตัวกรอง">
        <label>ช่วงเวลา
            <select v-model="state.period">
                <option v-for="p in PERIODS" :key="p.value" :value="p.value">{{ p.label }}</option>
            </select>
        </label>
        <template v-if="state.period === 'custom'">
            <label>จาก <input v-model="state.from" type="date" :max="today"></label>
            <label>ถึง <input v-model="state.to" type="date" :max="today"></label>
            <button class="btn small primary" type="button" :disabled="!state.from" @click="emitChange">ใช้</button>
        </template>
        <label>กระบวนการ
            <select v-model="state.process">
                <option value="all">ทั้งหมด</option>
                <option v-for="p in PROCESSES" :key="p" :value="p">{{ p }}</option>
            </select>
        </label>
        <label>ประเภทผู้ป่วย
            <select v-model="state.patientType">
                <option value="all">ทั้งหมด</option>
                <option v-for="p in PATIENT_TYPES" :key="p" :value="p">{{ p }}</option>
            </select>
        </label>
        <span class="filters-status" role="status">{{ status || rangeLabel }}</span>
    </div>
</template>
