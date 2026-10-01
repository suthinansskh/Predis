// คิวรายงานที่ส่งไม่สำเร็จเพราะออฟไลน์ — เก็บใน localStorage แล้วส่งอัตโนมัติเมื่อกลับมาออนไลน์
// โหลดเป็น classic script ตามลำดับใน JS_FILES (ดู sw.js / *.html)
//
// - แต่ละรายการผูกกับ psCode ของผู้บันทึก: ส่งเฉพาะเมื่อผู้นั้น login อยู่ (server ใช้ชื่อผู้รายงานจาก session)
// - ส่งซ้ำได้อย่างปลอดภัย: submissionToken กันซ้ำ และ Report ID ซ้ำ = ถูกบันทึกไปแล้ว

const OUTBOX_KEY = 'predisOutbox';
const OUTBOX_RETRY_MS = 60 * 1000;
let outboxFlushing = false;
let outboxTimer = null;

function readOutbox() {
    try {
        const items = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
        return Array.isArray(items) ? items : [];
    } catch (_) {
        return [];
    }
}

function writeOutbox(items) {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
    updateOutboxBadge();
}

function myOutboxItems() {
    const psCode = currentUser && currentUser.psCode;
    return psCode ? readOutbox().filter(item => item.psCode === psCode) : [];
}

function queueReport(payload) {
    const items = readOutbox();
    if (!items.some(item => item.payload.submissionToken === payload.submissionToken)) {
        items.push({
            psCode: currentUser ? currentUser.psCode : '',
            payload,
            queuedAt: new Date().toISOString(),
            attempts: 0,
            lastError: ''
        });
    }
    writeOutbox(items);
    scheduleOutboxRetry();
}

function removeFromOutbox(submissionToken) {
    writeOutbox(readOutbox().filter(item => item.payload.submissionToken !== submissionToken));
}

/**
 * ส่งรายงานที่ค้างในคิวของผู้ใช้ปัจจุบัน
 * @returns {Promise<number>} จำนวนที่ส่งสำเร็จ
 */
async function flushOutbox() {
    if (outboxFlushing || !navigator.onLine || !getSessionToken()) return 0;
    const pending = myOutboxItems();
    if (pending.length === 0) return 0;

    outboxFlushing = true;
    let sent = 0;
    try {
        for (const item of pending) {
            try {
                await apiPost('append', item.payload);
                removeFromOutbox(item.payload.submissionToken);
                sent++;
            } catch (error) {
                if (error.network || error.authRequired) break;
                if (error.result && error.result.duplicate) {
                    // Report ID มีอยู่แล้ว = ครั้งก่อนส่งถึง server แล้วแต่ไม่ได้รับคำตอบ
                    removeFromOutbox(item.payload.submissionToken);
                    sent++;
                    continue;
                }
                // server ปฏิเสธด้วยเหตุผลอื่น — เก็บไว้ให้ผู้ใช้เห็น แล้วลองรายการถัดไป
                const items = readOutbox();
                const stored = items.find(i => i.payload.submissionToken === item.payload.submissionToken);
                if (stored) {
                    stored.attempts += 1;
                    stored.lastError = error.message;
                    writeOutbox(items);
                }
            }
        }
    } finally {
        outboxFlushing = false;
        updateOutboxBadge();
    }

    if (sent > 0) {
        showNotification(`ส่งรายงานที่ค้างอยู่สำเร็จ ${sent} รายการ`, 'success');
    }
    scheduleOutboxRetry();
    return sent;
}

function scheduleOutboxRetry() {
    clearTimeout(outboxTimer);
    if (myOutboxItems().length > 0) {
        outboxTimer = setTimeout(flushOutbox, OUTBOX_RETRY_MS);
    }
}

function updateOutboxBadge() {
    const headerRight = document.querySelector('.header-right');
    if (!headerRight) return;

    let badge = document.getElementById('outboxBadge');
    const items = myOutboxItems();
    if (items.length === 0) {
        if (badge) badge.remove();
        return;
    }
    if (!badge) {
        badge = document.createElement('button');
        badge.type = 'button';
        badge.id = 'outboxBadge';
        badge.className = 'outbox-badge';
        badge.addEventListener('click', async () => {
            if (!navigator.onLine) {
                showNotification('ยังออฟไลน์อยู่ — จะส่งอัตโนมัติเมื่อมีสัญญาณ', 'warning');
                return;
            }
            const sent = await flushOutbox();
            const left = myOutboxItems();
            if (sent === 0 && left.length > 0) {
                showNotification(left[0].lastError || 'ยังส่งไม่สำเร็จ จะลองใหม่อัตโนมัติ', 'warning');
            }
        });
        headerRight.prepend(badge);
    }
    const failed = items.filter(i => i.lastError).length;
    badge.classList.toggle('has-error', failed > 0);
    badge.innerHTML = `<i class="fas fa-cloud-upload-alt" aria-hidden="true"></i> รอส่ง ${items.length}`;
    badge.title = failed > 0
        ? `มี ${failed} รายการที่ server ปฏิเสธ — กดเพื่อลองใหม่`
        : 'รายงานที่บันทึกขณะออฟไลน์ — กดเพื่อส่งตอนนี้';
    badge.setAttribute('aria-label', `รายงานรอส่ง ${items.length} รายการ`);
}

window.addEventListener('online', () => {
    showNotification('กลับมาออนไลน์แล้ว', 'info');
    flushOutbox();
});
window.addEventListener('offline', () => {
    showNotification('ออฟไลน์ — รายงานที่บันทึกจะถูกเก็บไว้และส่งอัตโนมัติเมื่อมีสัญญาณ', 'warning');
});
