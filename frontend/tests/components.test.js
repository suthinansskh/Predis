import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import DrugPicker from '../src/components/DrugPicker.vue';
import PasswordFields from '../src/components/PasswordFields.vue';
import { drugStore } from '../src/composables/drugs.js';

describe('DrugPicker', () => {
    beforeEach(() => {
        drugStore.drugs = [
            { drugCode: 'MORPH10', drugName: 'Morphine 10 mg', had: 'High', status: 'Active' },
            { drugCode: 'PARA500', drugName: 'Paracetamol 500 mg', had: 'Regular', status: 'Active' },
            { drugCode: 'OLD1', drugName: 'Morphine old', had: 'High', status: 'Inactive' }
        ];
    });

    it('ค้นหา → เลือก → ส่ง {code, name, had}; ไม่แสดงยาที่ไม่ใช้งาน', async () => {
        const wrapper = mount(DrugPicker, { props: { id: 'd', label: 'ยา', modelValue: { code: '', name: '', had: false, text: '' } } });
        const input = wrapper.get('input');
        await input.setValue('morph');
        const options = wrapper.findAll('[role=option]');
        expect(options.map(o => o.text())).toEqual([expect.stringContaining('MORPH10')]);
        expect(input.attributes('aria-expanded')).toBe('true');
        await options[0].trigger('mousedown');
        const emitted = wrapper.emitted('update:modelValue').pop()[0];
        expect(emitted).toMatchObject({ code: 'MORPH10', name: 'Morphine 10 mg', had: true });
        await wrapper.setProps({ modelValue: emitted });
        expect(wrapper.text()).toContain('High Alert Drug');
    });

    it('คีย์บอร์ด: ลูกศรลง + Enter เลือกได้', async () => {
        const wrapper = mount(DrugPicker, { props: { id: 'd', label: 'ยา', modelValue: { code: '', name: '', had: false, text: '' } } });
        const input = wrapper.get('input');
        await input.setValue('para');
        await input.trigger('keydown', { key: 'ArrowDown' });
        await input.trigger('keydown', { key: 'Enter' });
        expect(wrapper.emitted('update:modelValue').pop()[0].code).toBe('PARA500');
    });

    it('ข้อความอิสระที่ไม่พบในรายการ → code ว่าง + เก็บข้อความ', async () => {
        const wrapper = mount(DrugPicker, { props: { id: 'd', label: 'ยา', modelValue: { code: '', name: '', had: false, text: '' } } });
        await wrapper.get('input').setValue('ไม่ได้พิมพ์ฉลากยา');
        expect(wrapper.emitted('update:modelValue').pop()[0]).toMatchObject({ code: '', text: 'ไม่ได้พิมพ์ฉลากยา' });
    });
});

describe('PasswordFields', () => {
    it('ตรวจความยาวและการยืนยัน', async () => {
        const wrapper = mount(PasswordFields, { props: { idPrefix: 'p', password: 'short', confirm: '' } });
        expect(wrapper.text()).toContain('อย่างน้อย 8');
        await wrapper.setProps({ password: 'LongEnough1', confirm: 'Different1' });
        await nextTick();
        expect(wrapper.text()).toContain('ไม่ตรงกัน');
        expect(wrapper.vm.valid).toBe(false);
        await wrapper.setProps({ confirm: 'LongEnough1' });
        expect(wrapper.vm.valid).toBe(true);
    });
});
