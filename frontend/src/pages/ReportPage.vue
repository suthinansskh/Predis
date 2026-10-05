<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import DrugPicker from '../components/DrugPicker.vue';
import Icon from '../components/Icon.vue';
import { api, session, toast } from '../composables/session.js';
import { outbox } from '../composables/app.js';
import { drugStore, loadDrugs } from '../composables/drugs.js';
import { SHIFTS, PATIENT_TYPES, LOCATIONS, SUBSTATIONS, SUBSTATION_LOCATION, CAUSES, PROCESSES, ERRORS_BY_PROCESS } from '../constants.js';
import { bangkokToday, readJson, writeJson, removeKey, randomToken } from '../lib/util.js';

const PREFS_KEY = 'predis.v2.reportPrefs';
const draftKey = () => `predis.v2.draft:${session.user ? session.user.psCode : ''}`;
const emptyDrug = () => ({ code: '', name: '', had: false, text: '' });

function blankForm() {
    return {
        eventDate: bangkokToday(), shift: '', patientType: '', location: '', substation: '', process: '', errorDetail: '',
        correct: emptyDrug(), incorrect: emptyDrug(), cause: '', details: ''
    };
}

const form = reactive(blankForm());
const busy = ref(false);
const lastSaved = ref(null);
const draftRestoredAt = ref('');
const errors = ref({});
const today = bangkokToday();

const errorOptions = computed(() => ERRORS_BY_PROCESS[form.process] || []);
const hadDrugs = computed(() => [form.correct, form.incorrect].filter(d => d.had));

watch(() => form.process, (value, old) => {
    if (old && !errorOptions.value.includes(form.errorDetail)) form.errorDetail = '';
});
watch(() => form.location, value => { if (value !== SUBSTATION_LOCATION) form.substation = ''; });

// ----- ร่างอัตโนมัติ + จำค่าที่ใช้บ่อย -----
let draftTimer = null;
watch(form, () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
        const meaningful = form.process || form.errorDetail || form.correct.text || form.incorrect.text || form.cause || form.details;
        if (meaningful) writeJson(draftKey(), { savedAt: Date.now(), form: JSON.parse(JSON.stringify(form)) });
    }, 800);
}, { deep: true });

function applyPrefs() {
    const prefs = readJson(PREFS_KEY);
    if (prefs) {
        if (prefs.shift) form.shift = prefs.shift;
        if (prefs.location) form.location = prefs.location;
        if (prefs.substation) form.substation = prefs.substation;
    }
}

function resetForm({ keepDraft = false } = {}) {
    Object.assign(form, blankForm());
    applyPrefs();
    errors.value = {};
    if (!keepDraft) {
        removeKey(draftKey());
        draftRestoredAt.value = '';
    }
}

onMounted(() => {
    loadDrugs(api);
    applyPrefs();
    const draft = readJson(draftKey());
    if (draft && draft.form) {
        Object.assign(form, draft.form);
        draftRestoredAt.value = new Date(draft.savedAt).toLocaleString('th-TH');
    }
});

// ----- บันทึก -----
const REQUIRED = { eventDate: 'วันที่', shift: 'เวร', patientType: 'ประเภทผู้ป่วย', location: 'สถานที่', process: 'กระบวนการ', errorDetail: 'ข้อผิดพลาด', cause: 'สาเหตุ' };

function validate() {
    const e = {};
    Object.entries(REQUIRED).forEach(([k, label]) => { if (!form[k]) e[k] = `กรุณาเลือก${label}`; });
    if (form.location === SUBSTATION_LOCATION && !form.substation) e.substation = 'กรุณาเลือก รพ.สต.';
    if (form.eventDate > today) e.eventDate = 'วันที่ต้องไม่เกินวันนี้';
    errors.value = e;
    if (Object.keys(e).length) {
        const first = document.getElementById(`rf-${Object.keys(e)[0]}`);
        if (first) first.focus();
        toast(Object.values(e)[0], 'error');
        return false;
    }
    return true;
}

function buildPayload() {
    return {
        eventDate: form.eventDate, shift: form.shift, patientType: form.patientType, location: form.location,
        substation: form.substation, process: form.process, errorDetail: form.errorDetail,
        correctDrugCode: form.correct.code, correctDrugText: form.correct.text,
        incorrectDrugCode: form.incorrect.code, incorrectDrugText: form.incorrect.text,
        cause: form.cause, details: form.details.trim(), submissionToken: randomToken()
    };
}

async function submit() {
    if (busy.value || !validate()) return;
    const payload = buildPayload();
    busy.value = true;
    try {
        if (navigator.onLine === false) throw Object.assign(new Error('offline'), { network: true });
        const result = await api.call('reports.create', payload);
        lastSaved.value = { id: result.id, isHad: result.isHad, offline: false };
        toast(`บันทึกสำเร็จ — Report ID: ${result.id}`, 'success', 8000);
    } catch (error) {
        if (!error.network) {
            toast(error.message, 'error');
            busy.value = false;
            return;
        }
        // ออฟไลน์/Google ขัดข้อง → เก็บไว้ส่งทีหลัง (ไม่ต้องกรอกใหม่)
        outbox.queue(payload);
        lastSaved.value = { id: '', isHad: hadDrugs.value.length > 0, offline: true };
        toast('ไม่มีสัญญาณ — บันทึกไว้ในเครื่องแล้ว จะส่งอัตโนมัติเมื่อออนไลน์', 'warning', 8000);
    }
    writeJson(PREFS_KEY, { shift: form.shift, location: form.location, substation: form.substation });
    resetForm();
    busy.value = false;
}
</script>

<template>
    <section class="page">
        <header class="page-head">
            <h1>บันทึกข้อผิดพลาด</h1>
            <p class="muted">ผู้รายงาน: {{ session.user?.name }} ({{ session.user?.psCode }})</p>
        </header>

        <div v-if="drugStore.error" class="callout error" role="alert">
            <p>{{ drugStore.error }}</p>
            <button class="btn small" type="button" @click="loadDrugs(api, { force: true })"><Icon name="refresh" :size="16" /> ลองใหม่</button>
        </div>
        <div v-else-if="drugStore.offline" class="callout info">
            ใช้รายการยาที่เก็บไว้ในเครื่อง ({{ drugStore.drugs.length }} รายการ) — อาจไม่เป็นปัจจุบัน
        </div>

        <div v-if="draftRestoredAt" class="callout info">
            <span><Icon name="history" :size="16" /> กู้คืนร่างที่ยังไม่ได้บันทึก ({{ draftRestoredAt }})</span>
            <button class="btn small" type="button" @click="resetForm()">ล้างร่าง</button>
        </div>

        <div v-if="lastSaved" class="callout" :class="lastSaved.offline ? 'warning' : 'success'" role="status">
            <template v-if="lastSaved.offline">เก็บรายงานไว้ในเครื่องแล้ว จะส่งอัตโนมัติเมื่อออนไลน์</template>
            <template v-else>บันทึกรายงานล่าสุดแล้ว — Report ID <strong>{{ lastSaved.id }}</strong></template>
            <span v-if="lastSaved.isHad" class="tag danger">เกี่ยวข้องกับยา HAD</span>
        </div>

        <form class="card form-grid" novalidate @submit.prevent="submit">
            <div class="field">
                <label for="rf-eventDate">วันที่เกิดเหตุการณ์</label>
                <input id="rf-eventDate" v-model="form.eventDate" type="date" :max="today" required :aria-invalid="!!errors.eventDate">
            </div>
            <div class="field">
                <label for="rf-shift">เวร</label>
                <select id="rf-shift" v-model="form.shift" required :aria-invalid="!!errors.shift">
                    <option value="" disabled>เลือกเวร</option>
                    <option v-for="s in SHIFTS" :key="s.value" :value="s.value">{{ s.label }}</option>
                </select>
            </div>
            <div class="field">
                <label for="rf-patientType">ประเภทผู้ป่วย</label>
                <select id="rf-patientType" v-model="form.patientType" required :aria-invalid="!!errors.patientType">
                    <option value="" disabled>เลือกประเภท</option>
                    <option v-for="p in PATIENT_TYPES" :key="p" :value="p">{{ p }}</option>
                </select>
            </div>
            <div class="field">
                <label for="rf-location">สถานที่เกิดเหตุการณ์</label>
                <select id="rf-location" v-model="form.location" required :aria-invalid="!!errors.location">
                    <option value="" disabled>เลือกสถานที่</option>
                    <option v-for="l in LOCATIONS" :key="l" :value="l">{{ l === 'อื่นๆ' ? 'อื่นๆ (ระบุในรายละเอียด)' : l }}</option>
                </select>
            </div>
            <div v-if="form.location === SUBSTATION_LOCATION" class="field">
                <label for="rf-substation">รพ.สต.</label>
                <select id="rf-substation" v-model="form.substation" required :aria-invalid="!!errors.substation">
                    <option value="" disabled>เลือก รพ.สต.</option>
                    <option v-for="s in SUBSTATIONS" :key="s" :value="s">{{ s }}</option>
                </select>
            </div>
            <div class="field">
                <label for="rf-process">กระบวนการ</label>
                <select id="rf-process" v-model="form.process" required :aria-invalid="!!errors.process">
                    <option value="" disabled>เลือกกระบวนการ</option>
                    <option v-for="p in PROCESSES" :key="p" :value="p">{{ p }}</option>
                </select>
            </div>
            <div class="field">
                <label for="rf-errorDetail">ข้อผิดพลาด</label>
                <select id="rf-errorDetail" v-model="form.errorDetail" required :disabled="!form.process" :aria-invalid="!!errors.errorDetail">
                    <option value="" disabled>{{ form.process ? 'เลือกข้อผิดพลาด' : 'เลือกกระบวนการก่อน' }}</option>
                    <option v-for="e in errorOptions" :key="e" :value="e">{{ e }}</option>
                </select>
            </div>
            <DrugPicker id="rf-correct" v-model="form.correct" label="รายการที่ถูกต้อง" class="span-2" />
            <DrugPicker id="rf-incorrect" v-model="form.incorrect" label="รายการที่ผิด" class="span-2" />

            <div v-if="hadDrugs.length" class="callout danger span-2" role="alert">
                <strong>⚠ เกี่ยวข้องกับยา High Alert:</strong>
                {{ hadDrugs.map(d => d.name || d.code).join(', ') }} — ตรวจสอบและแจ้งเภสัชกรตามแนวทางยา HAD
            </div>

            <div class="field">
                <label for="rf-cause">สาเหตุ</label>
                <select id="rf-cause" v-model="form.cause" required :aria-invalid="!!errors.cause">
                    <option value="" disabled>เลือกสาเหตุ</option>
                    <option v-for="c in CAUSES" :key="c" :value="c">{{ c }}</option>
                </select>
            </div>
            <div class="field span-2">
                <label for="rf-details">รายละเอียดเพิ่มเติม</label>
                <textarea id="rf-details" v-model="form.details" rows="3" maxlength="2000"></textarea>
            </div>
            <div class="actions span-2">
                <button type="button" class="btn" @click="resetForm()">ล้างฟอร์ม</button>
                <button type="submit" class="btn primary" :disabled="busy">{{ busy ? 'กำลังบันทึก…' : 'บันทึก' }}</button>
            </div>
        </form>
    </section>
</template>
