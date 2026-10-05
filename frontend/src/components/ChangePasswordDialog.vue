<script setup>
import { ref } from 'vue';
import Modal from './Modal.vue';
import PasswordFields from './PasswordFields.vue';
import { api, toast, session, setSession } from '../composables/session.js';

const props = defineProps({ forced: { type: Boolean, default: false } });
const emit = defineEmits(['close']);
const current = ref('');
const password = ref('');
const confirm = ref('');
const fields = ref(null);
const busy = ref(false);

async function submit() {
    if (!fields.value.valid) {
        toast('กรุณาตรวจสอบรหัสผ่านใหม่', 'error');
        return;
    }
    busy.value = true;
    try {
        await api.call('auth.changePassword', { currentPassword: current.value, newPassword: password.value });
        toast('เปลี่ยนรหัสผ่านสำเร็จ', 'success');
        if (session.mustChangePassword) {
            setSession({ token: session.token, user: session.user, expiresIn: (session.expiresAt - Date.now()) / 1000, mustChangePassword: false });
        }
        emit('close');
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <Modal title="เปลี่ยนรหัสผ่าน" :closable="!props.forced"
           :note="props.forced ? 'รหัสผ่านปัจจุบันเป็นรหัสชั่วคราว กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งาน' : ''" @close="emit('close')">
        <form @submit.prevent="submit">
            <div class="field">
                <label for="cp-current">รหัสผ่านปัจจุบัน</label>
                <input id="cp-current" v-model="current" type="password" autocomplete="current-password" required>
            </div>
            <PasswordFields ref="fields" v-model:password="password" v-model:confirm="confirm" id-prefix="cp" />
            <div class="actions">
                <button v-if="!props.forced" type="button" class="btn" @click="emit('close')">ยกเลิก</button>
                <button type="submit" class="btn primary" :disabled="busy">บันทึก</button>
            </div>
        </form>
    </Modal>
</template>
