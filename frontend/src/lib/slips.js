// ใบรหัสเปิดใช้งานสำหรับพิมพ์ (แยกตามกลุ่มงาน)

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function activationUrl(loc = window.location) {
    return `${loc.origin}${loc.pathname}#/login?activate=1`;
}

/** @param {Array<{psCode,name,group,code,expiresAt}>} items */
export function slipsHtml(items, url) {
    const byGroup = {};
    items.forEach(i => { (byGroup[i.group || 'ไม่ระบุกลุ่ม'] ||= []).push(i); });
    const groups = Object.entries(byGroup).sort(([a], [b]) => a.localeCompare(b)).map(([group, list]) => `
        <h2>${esc(group)} (${list.length} คน)</h2>
        <div class="slips">${list.sort((a, b) => a.psCode.localeCompare(b.psCode)).map(i => `
            <div class="slip">
                <div><strong>${esc(i.name)}</strong> — PS Code: <strong>${esc(i.psCode)}</strong></div>
                <div class="code">${esc(i.code.slice(0, 4))}-${esc(i.code.slice(4))}</div>
                <ol><li>เปิด ${esc(url)}</li><li>กด "มีรหัสเปิดใช้งาน" กรอก PS Code และรหัสด้านบน</li><li>ตั้งรหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</li></ol>
                <div class="exp">ใช้ได้ครั้งเดียว ภายใน ${esc(i.expiresAt)} — ห้ามให้ผู้อื่น</div>
            </div>`).join('')}</div>`).join('');
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>รหัสเปิดใช้งาน Predis</title>
<style>
body{font-family:'Sarabun',sans-serif;margin:16px;color:#000}h1{font-size:18px}h2{font-size:16px;margin:16px 0 8px}
.slips{display:grid;grid-template-columns:1fr 1fr;gap:8px}.slip{border:1px dashed #555;padding:10px;break-inside:avoid;font-size:13px}
.code{font-size:26px;font-weight:700;letter-spacing:4px;margin:6px 0;font-family:monospace}ol{margin:4px 0 4px 18px;padding:0}
.exp{font-size:12px;color:#444}@media print{.no-print{display:none}}
</style></head><body>
<div class="no-print"><button onclick="window.print()">พิมพ์</button>
<p>รหัสแสดงครั้งเดียว — พิมพ์หรือบันทึกเป็น PDF ก่อนปิดหน้านี้ แล้วตัดแจกเป็นรายบุคคล</p></div>
<h1>รหัสเปิดใช้งานบัญชี Predis (${items.length} คน)</h1>${groups}</body></html>`;
}
