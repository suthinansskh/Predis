<script setup>
// Dialog แบบ modal: โฟกัสช่องแรก, Esc ปิด (ถ้า closable), คืนโฟกัสเดิมเมื่อปิด
import { onMounted, onBeforeUnmount, ref } from 'vue';

const props = defineProps({
    title: { type: String, required: true },
    note: { type: String, default: '' },
    closable: { type: Boolean, default: true },
    wide: { type: Boolean, default: false }
});
const emit = defineEmits(['close']);
const panel = ref(null);
let previousFocus = null;

function onKey(e) {
    if (e.key === 'Escape' && props.closable) emit('close');
}

onMounted(() => {
    previousFocus = document.activeElement;
    document.addEventListener('keydown', onKey);
    const first = panel.value && panel.value.querySelector('input, select, textarea, button');
    if (first) first.focus();
});

onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey);
    if (previousFocus && previousFocus.focus) previousFocus.focus();
});

const titleId = `modal-${Math.random().toString(36).slice(2)}`;
</script>

<template>
    <div class="modal-overlay" @click.self="closable && emit('close')">
        <div ref="panel" class="modal" :class="{ wide }" role="dialog" aria-modal="true" :aria-labelledby="titleId">
            <h2 :id="titleId">{{ title }}</h2>
            <p v-if="note" class="note">{{ note }}</p>
            <slot />
        </div>
    </div>
</template>
