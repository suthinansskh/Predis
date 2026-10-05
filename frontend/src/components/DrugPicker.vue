<script setup>
// ช่องค้นหายา (combobox): พิมพ์ชื่อ/รหัส → เลือกจากรายการ; พิมพ์ข้อความอิสระได้ (server จับคู่ให้อีกครั้ง)
import { ref, computed, watch } from 'vue';
import { drugStore } from '../composables/drugs.js';
import { searchDrugs, drugLabel } from '../lib/util.js';

const props = defineProps({
    id: { type: String, required: true },
    label: { type: String, required: true },
    required: { type: Boolean, default: false }
});
/** {code, name, had, text} — code ว่าง = ข้อความอิสระ */
const model = defineModel({ type: Object, default: () => ({ code: '', name: '', had: false, text: '' }) });

const text = ref(model.value.text || '');
const open = ref(false);
const active = ref(-1);
const listId = `${props.id}-list`;

const activeDrugs = computed(() => drugStore.drugs.filter(d => d.status === 'Active'));
const results = computed(() => (open.value ? searchDrugs(activeDrugs.value, text.value, 30) : []));

watch(() => model.value.text, value => { if (value !== text.value) text.value = value || ''; });

function onInput() {
    open.value = true;
    active.value = -1;
    // ข้อความตรงกับยาในรายการพอดี → เลือกให้เลย
    const exact = activeDrugs.value.find(d => drugLabel(d.drugCode, d.drugName).toLowerCase() === text.value.trim().toLowerCase());
    model.value = exact
        ? { code: exact.drugCode, name: exact.drugName, had: exact.had === 'High', text: text.value }
        : { code: '', name: '', had: false, text: text.value };
}

function choose(drug) {
    text.value = drugLabel(drug.drugCode, drug.drugName);
    model.value = { code: drug.drugCode, name: drug.drugName, had: drug.had === 'High', text: text.value };
    open.value = false;
}

function onKeydown(e) {
    if (!open.value || !results.value.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active.value = (active.value + 1) % results.value.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = (active.value - 1 + results.value.length) % results.value.length; }
    else if (e.key === 'Enter' && active.value >= 0) { e.preventDefault(); choose(results.value[active.value]); }
    else if (e.key === 'Escape') { open.value = false; }
}

function onBlur() {
    // ให้คลิกในรายการทำงานก่อนปิด; ถ้ามีผลลัพธ์เดียวที่ตรง → เลือกอัตโนมัติ
    setTimeout(() => {
        if (open.value && !model.value.code && results.value.length === 1) choose(results.value[0]);
        open.value = false;
    }, 150);
}
</script>

<template>
    <div class="field combobox">
        <label :for="id">{{ label }}</label>
        <input :id="id" v-model="text" type="text" role="combobox" autocomplete="off" :required="required"
               :aria-expanded="open && results.length > 0" :aria-controls="listId" aria-autocomplete="list"
               :aria-activedescendant="active >= 0 ? `${listId}-${active}` : undefined"
               placeholder="พิมพ์ชื่อยาหรือรหัสยา" @input="onInput" @keydown="onKeydown" @focus="open = !!text" @blur="onBlur">
        <ul v-if="open && results.length" :id="listId" class="combo-list" role="listbox">
            <li v-for="(d, i) in results" :id="`${listId}-${i}`" :key="d.drugCode" role="option" :aria-selected="i === active"
                :class="{ active: i === active }" @mousedown.prevent="choose(d)">
                <span class="combo-name">{{ d.drugName }}</span>
                <span class="combo-code">{{ d.drugCode }}</span>
                <span v-if="d.had === 'High'" class="tag danger">HAD</span>
            </li>
        </ul>
        <p v-if="model.code" class="field-hint">✓ {{ model.code }}<span v-if="model.had" class="tag danger">High Alert Drug</span></p>
        <p v-else-if="text && !open" class="field-hint warn">ไม่พบในรายการยา — จะบันทึกเป็นข้อความ</p>
    </div>
</template>
