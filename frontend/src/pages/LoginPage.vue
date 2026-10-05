<script setup>
import { ref, computed, onBeforeUnmount, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';
import PasswordFields from '../components/PasswordFields.vue';
import { api, setSession, toast } from '../composables/session.js';
import { USER_GROUPS } from '../constants.js';

const router = useRouter();
const route = useRoute();
const userCode = ref('');
const password = ref('');
const busy = ref(false);
const help = ref(null); // {code, message, retryAfter}
const lockLeft = ref(0);
const dialog = ref(onMountedDialog());
let lockTimer = null;

function onMountedDialog() {
    return route.query.activate ? 'activate' : '';
}

const HELP = {
    DEFAULT_PASSWORD_BLOCKED: { tone: 'warning', extra: 'ถ้าได้รับใบ "รหัสเปิดใช้งาน" แล้ว กด "ใช้รหัสเปิดใช้งาน" — ถ้ายังไม่ได้รับ กด "ขอรหัสจากผู้ดูแล"', actions: [['activate', 'ใช้รหัสเปิดใช้งาน'], ['forgot', 'ขอรหัสจากผู้ดูแล']] },
    WRONG_CREDENTIALS: { tone: 'error', extra: 'ใช้ PS Code และรหัสผ่านที่ตั้งเอง (ไม่ใช่ 4 ตัวท้ายบัตรประชาชนแล้ว) — จำไม่ได้กด "ลืมรหัสผ่าน"', actions: [['forgot', 'ลืมรหัสผ่าน']] },
    LOCKED: { tone: 'error', actions: [['forgot', 'ลืมรหัสผ่าน']] },
    PENDING_APPROVAL: { tone: 'info', actions: [] },
    REJECTED: { tone: 'error', actions: [] },
    DISABLED: { tone: 'error', actions: [] }
};
const helpInfo = computed(() => help.value && (HELP[help.value.code] || { tone: 'error', actions: [] }));
const helpMessage = computed(() => help.value && help.value.code === 'LOCKED'
    ? (lockLeft.value > 0 ? `ใส่รหัสผ่านผิดหลายครั้ง ลองใหม่ได้ใน ${lockLeft.value} วินาที` : 'ลองเข้าสู่ระบบอีกครั้งได้แล้ว')
    : help.value && help.value.message);

function startLock(seconds) {
    clearInterval(lockTimer);
    lockLeft.value = seconds;
    lockTimer = setInterval(() => {
        lockLeft.value -= 1;
        if (lockLeft.value <= 0) clearInterval(lockTimer);
    }, 1000);
}
onBeforeUnmount(() => clearInterval(lockTimer));

function finishLogin(data) {
    setSession(data);
    toast(`ยินดีต้อนรับ ${data.user.name}`, 'success');
    router.replace(route.query.next && String(route.query.next).startsWith('/') ? String(route.query.next) : { name: 'report' });
}

async function login() {
    help.value = null;
    busy.value = true;
    try {
        finishLogin(await api.call('auth.login', { userCode: userCode.value.trim(), password: password.value }));
    } catch (error) {
        help.value = { code: error.code, message: error.message };
        if (error.code === 'LOCKED' && error.retryAfter) startLock(error.retryAfter);
    } finally {
        busy.value = false;
    }
}

// ----- dialogs -----
const reg = ref({ psCode: '', name: '', group: '', email: '', password: '', confirm: '' });
const regFields = ref(null);
const forgotCode = ref('');
const act = ref({ userCode: '', code: '', password: '', confirm: '' });
const actFields = ref(null);
const dialogBusy = ref(false);

function openDialog(name) {
    if (name === 'forgot') forgotCode.value = userCode.value.trim();
    if (name === 'activate') act.value.userCode = act.value.userCode || userCode.value.trim();
    dialog.value = name;
}

async function register() {
    if (!/^[A-Za-z0-9_-]{2,20}$/.test(reg.value.psCode)) return toast('PS Code ต้องเป็นตัวอักษรอังกฤษ/ตัวเลข 2-20 ตัว', 'error');
    if (!regFields.value.valid) return toast('กรุณาตรวจสอบรหัสผ่าน', 'error');
    dialogBusy.value = true;
    try {
        const { psCode, name, group, email, password: pw } = reg.value;
        const result = await api.call('auth.register', { psCode, name, group, email, password: pw });
        toast(result.message || 'ส่งคำขอลงทะเบียนแล้ว กรุณารอผู้ดูแลระบบอนุมัติ', 'success');
        dialog.value = '';
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        dialogBusy.value = false;
    }
}

async function requestReset() {
    dialogBusy.value = true;
    try {
        const result = await api.call('auth.requestReset', { userCode: forgotCode.value.trim() });
        toast(result.message, 'success', 8000);
        dialog.value = '';
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        dialogBusy.value = false;
    }
}

async function activate() {
    if (!actFields.value.valid) return toast('กรุณาตรวจสอบรหัสผ่านใหม่', 'error');
    dialogBusy.value = true;
    try {
        const data = await api.call('auth.activate', { userCode: act.value.userCode.trim(), code: act.value.code.trim(), newPassword: act.value.password });
        dialog.value = '';
        toast('เปิดใช้งานบัญชีสำเร็จ', 'success');
        finishLogin(data);
    } catch (error) {
        toast(error.retryAfter ? `${error.message}` : error.message, 'error');
    } finally {
        dialogBusy.value = false;
    }
}

onMounted(() => {
    if (route.query.activate) dialog.value = 'activate';
});
</script>

<template>
    <div class="login-page">
        <div class="login-card">
            <div class="login-brand">
                <Icon name="pill" :size="36" />
                <h1>Predispensing Error Recorder</h1>
                <p>เข้าสู่ระบบด้วย PS Code และรหัสผ่าน</p>
            </div>
            <form class="login-form" @submit.prevent="login">
                <div class="field">
                    <label for="login-user">PS Code หรือเลขบัตรประชาชน</label>
                    <input id="login-user" v-model="userCode" autocomplete="username" required autofocus>
                </div>
                <div class="field">
                    <label for="login-pass">รหัสผ่าน</label>
                    <input id="login-pass" v-model="password" type="password" autocomplete="current-password" required>
                </div>
                <button class="btn primary block" type="submit" :disabled="busy || lockLeft > 0">
                    {{ busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ' }}
                </button>
            </form>

            <div v-if="help" class="callout" :class="helpInfo.tone" role="alert">
                <p><strong>{{ helpMessage }}</strong></p>
                <p v-if="helpInfo.extra">{{ helpInfo.extra }}</p>
                <div v-if="helpInfo.actions.length" class="actions start">
                    <button v-for="[action, label] in helpInfo.actions" :key="action" class="btn small" type="button" @click="openDialog(action)">{{ label }}</button>
                </div>
            </div>

            <div class="login-links">
                <button type="button" class="link" @click="openDialog('activate')"><Icon name="ticket" :size="16" /> มีรหัสเปิดใช้งาน</button>
                <button type="button" class="link" @click="openDialog('forgot')">ลืมรหัสผ่าน?</button>
                <button type="button" class="link" @click="openDialog('register')">ลงทะเบียนผู้ใช้ใหม่</button>
            </div>
            <p class="muted small center">ผู้ใช้ใหม่กด "ลงทะเบียน" แล้วรอผู้ดูแลระบบอนุมัติ</p>
        </div>

        <Modal v-if="dialog === 'activate'" title="เปิดใช้งานบัญชี" note="กรอกรหัสเปิดใช้งาน 8 ตัวจากใบที่ได้รับ แล้วตั้งรหัสผ่านใหม่ของคุณเอง (รหัสใช้ได้ครั้งเดียว)" @close="dialog = ''">
            <form @submit.prevent="activate">
                <div class="field">
                    <label for="act-user">PS Code</label>
                    <input id="act-user" v-model="act.userCode" autocomplete="username" required>
                </div>
                <div class="field">
                    <label for="act-code">รหัสเปิดใช้งาน</label>
                    <input id="act-code" v-model="act.code" class="code-input" autocomplete="one-time-code" maxlength="12" required>
                </div>
                <PasswordFields ref="actFields" v-model:password="act.password" v-model:confirm="act.confirm" id-prefix="act" />
                <div class="actions">
                    <button type="button" class="btn" @click="dialog = ''">ยกเลิก</button>
                    <button type="submit" class="btn primary" :disabled="dialogBusy">ตั้งรหัสผ่านและเข้าสู่ระบบ</button>
                </div>
            </form>
        </Modal>

        <Modal v-if="dialog === 'forgot'" title="ลืมรหัสผ่าน" note='คำขอจะถูกส่งถึงผู้ดูแลระบบ ซึ่งจะออก "รหัสเปิดใช้งาน" ให้คุณ แล้วกด "มีรหัสเปิดใช้งาน" เพื่อตั้งรหัสผ่านใหม่เอง' @close="dialog = ''">
            <form @submit.prevent="requestReset">
                <div class="field">
                    <label for="forgot-user">PS Code</label>
                    <input id="forgot-user" v-model="forgotCode" autocomplete="username" required>
                </div>
                <div class="actions">
                    <button type="button" class="btn" @click="dialog = ''">ยกเลิก</button>
                    <button type="submit" class="btn primary" :disabled="dialogBusy">ส่งคำขอ</button>
                </div>
            </form>
        </Modal>

        <Modal v-if="dialog === 'register'" title="ลงทะเบียนผู้ใช้ใหม่" note="บัญชีจะใช้งานได้หลังผู้ดูแลระบบอนุมัติ" @close="dialog = ''">
            <form @submit.prevent="register">
                <div class="field">
                    <label for="reg-ps">PS Code</label>
                    <input id="reg-ps" v-model="reg.psCode" maxlength="20" autocomplete="username" required>
                </div>
                <div class="field">
                    <label for="reg-name">ชื่อ-นามสกุล</label>
                    <input id="reg-name" v-model="reg.name" maxlength="100" autocomplete="name" required>
                </div>
                <div class="field">
                    <label for="reg-group">กลุ่มงาน</label>
                    <select id="reg-group" v-model="reg.group" required>
                        <option value="" disabled>-- เลือกกลุ่มงาน --</option>
                        <option v-for="g in USER_GROUPS" :key="g" :value="g">{{ g }}</option>
                    </select>
                </div>
                <div class="field">
                    <label for="reg-email">อีเมล (ไม่บังคับ)</label>
                    <input id="reg-email" v-model="reg.email" type="email" autocomplete="email">
                </div>
                <PasswordFields ref="regFields" v-model:password="reg.password" v-model:confirm="reg.confirm" id-prefix="reg" />
                <div class="actions">
                    <button type="button" class="btn" @click="dialog = ''">ยกเลิก</button>
                    <button type="submit" class="btn primary" :disabled="dialogBusy">ส่งคำขอลงทะเบียน</button>
                </div>
            </form>
        </Modal>
    </div>
</template>
