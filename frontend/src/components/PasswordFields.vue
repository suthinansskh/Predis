<script setup>
// รหัสผ่านใหม่ + ยืนยัน (ตรวจเบื้องต้นฝั่ง client — server ตรวจซ้ำเสมอ)
import { computed } from 'vue';

const password = defineModel('password', { type: String, default: '' });
const confirm = defineModel('confirm', { type: String, default: '' });
const props = defineProps({ idPrefix: { type: String, required: true } });

const error = computed(() => {
    if (!password.value) return '';
    if (password.value.length < 8) return 'อย่างน้อย 8 ตัวอักษร';
    if (confirm.value && confirm.value !== password.value) return 'รหัสผ่านไม่ตรงกัน';
    return '';
});
defineExpose({ valid: computed(() => password.value.length >= 8 && password.value === confirm.value) });
</script>

<template>
    <div class="field">
        <label :for="`${props.idPrefix}-new`">รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</label>
        <input :id="`${props.idPrefix}-new`" v-model="password" type="password" autocomplete="new-password" minlength="8" required>
    </div>
    <div class="field">
        <label :for="`${props.idPrefix}-confirm`">ยืนยันรหัสผ่านใหม่</label>
        <input :id="`${props.idPrefix}-confirm`" v-model="confirm" type="password" autocomplete="new-password" required
               :aria-invalid="Boolean(error)" :aria-describedby="error ? `${props.idPrefix}-err` : undefined">
        <p v-if="error" :id="`${props.idPrefix}-err`" class="field-error">{{ error }}</p>
    </div>
</template>
