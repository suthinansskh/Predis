// instance ร่วมทั้งแอป: outbox ของรายงาน, จำนวนงานค้างของ admin
import { ref } from 'vue';
import { api, session, hasRole, toast } from './session.js';
import { createOutbox } from './outbox.js';

export const outbox = createOutbox({
    call: (action, payload) => api.call(action, payload),
    currentPsCode: () => (session.user ? session.user.psCode : '')
});

export async function flushOutbox({ quiet = false } = {}) {
    const sent = await outbox.flush();
    if (sent > 0) toast(`ส่งรายงานที่ค้างอยู่สำเร็จ ${sent} รายการ`, 'success');
    else if (!quiet && outbox.mine().length) {
        const failed = outbox.mine().find(i => i.lastError);
        toast(failed ? failed.lastError : 'ยังส่งไม่สำเร็จ จะลองใหม่อัตโนมัติ', 'warning');
    }
    return sent;
}

export const pendingCounts = ref({ registrations: 0, resets: 0 });

export async function refreshPendingCounts() {
    if (!hasRole('admin')) return;
    try {
        const me = await api.call('auth.me');
        pendingCounts.value = me.pendingCounts || { registrations: 0, resets: 0 };
    } catch { /* ไม่ขัดการใช้งาน */ }
}

let timer = null;
export function startBackgroundSync() {
    clearInterval(timer);
    timer = setInterval(() => { if (outbox.mine().length) flushOutbox({ quiet: true }); }, 60 * 1000);
    window.addEventListener('online', () => {
        toast('กลับมาออนไลน์แล้ว', 'info');
        flushOutbox({ quiet: true });
    });
    window.addEventListener('offline', () => toast('ออฟไลน์ — รายงานที่บันทึกจะถูกเก็บไว้และส่งอัตโนมัติเมื่อมีสัญญาณ', 'warning'));
}
