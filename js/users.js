// ลงทะเบียน / ลืมรหัสผ่าน (หน้า login) และหน้าจัดการผู้ใช้ (admin)
// โหลดเป็น classic script ตามลำดับใน JS_FILES (ดู sw.js / *.html)

const USER_GROUP_OPTIONS = ['เภสัชกร', 'เจ้าพนักงานเภสัชกรรม', 'อื่นๆ'];
const USER_LEVEL_LABELS = {
    user: 'ผู้ใช้ทั่วไป',
    pharmacist: 'เภสัชกร',
    supervisor: 'หัวหน้า',
    admin: 'ผู้ดูแลระบบ'
};

// ===== หน้า login: ลิงก์ลงทะเบียน / ลืมรหัสผ่าน =====

function setupLoginLinks() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm || document.getElementById('loginLinks')) return;

    const links = document.createElement('div');
    links.id = 'loginLinks';
    links.className = 'login-links';
    links.innerHTML = `
        <button type="button" class="link-btn" data-action="forgot">ลืมรหัสผ่าน?</button>
        <button type="button" class="link-btn" data-action="register"><i class="fas fa-user-plus"></i> ลงทะเบียนผู้ใช้ใหม่</button>`;
    links.querySelector('[data-action="forgot"]').addEventListener('click', showForgotPasswordDialog);
    links.querySelector('[data-action="register"]').addEventListener('click', showRegisterDialog);
    loginForm.insertAdjacentElement('afterend', links);
}

function showRegisterDialog() {
    openFormDialog({
        id: 'registerDialog',
        title: '<i class="fas fa-user-plus"></i> ลงทะเบียนผู้ใช้ใหม่',
        note: 'บัญชีจะใช้งานได้หลังผู้ดูแลระบบอนุมัติ',
        submitLabel: 'ส่งคำขอลงทะเบียน',
        body: `
            <div class="form-group">
                <label for="regPsCode">PS Code</label>
                <input type="text" id="regPsCode" autocomplete="username" pattern="[A-Za-z0-9_-]{2,20}" maxlength="20" required>
            </div>
            <div class="form-group">
                <label for="regName">ชื่อ-นามสกุล</label>
                <input type="text" id="regName" autocomplete="name" maxlength="100" required>
            </div>
            <div class="form-group">
                <label for="regGroup">กลุ่มงาน</label>
                <select id="regGroup" required>
                    <option value="">-- เลือกกลุ่มงาน --</option>
                    ${USER_GROUP_OPTIONS.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="regEmail">อีเมล (ไม่บังคับ)</label>
                <input type="email" id="regEmail" autocomplete="email" maxlength="100">
            </div>
            ${passwordFieldsHtml('reg')}`,
        onSubmit: async (form) => {
            const psCode = form.querySelector('#regPsCode').value.trim();
            const name = form.querySelector('#regName').value.trim();
            const group = form.querySelector('#regGroup').value;
            const email = form.querySelector('#regEmail').value.trim();

            if (!/^[A-Za-z0-9_-]{2,20}$/.test(psCode)) {
                showNotification('PS Code ต้องเป็นตัวอักษรอังกฤษ/ตัวเลข 2-20 ตัว', 'error');
                return false;
            }
            if (!name || !group) {
                showNotification('กรุณากรอกชื่อ-นามสกุลและเลือกกลุ่มงาน', 'error');
                return false;
            }
            const password = readNewPassword(form, 'reg');
            if (!password) return false;

            const result = await apiPost('register', { psCode, name, group, email, password });
            showNotification(result.message || 'ส่งคำขอลงทะเบียนแล้ว', 'success');
        }
    });
}

function showForgotPasswordDialog() {
    const typed = (document.getElementById('userCode') || {}).value || '';
    const dialog = openFormDialog({
        id: 'forgotPasswordDialog',
        title: '<i class="fas fa-unlock-alt"></i> ลืมรหัสผ่าน',
        note: 'คำขอจะถูกส่งถึงผู้ดูแลระบบ ซึ่งจะออกรหัสผ่านชั่วคราวให้คุณโดยตรง (ติดต่อรับด้วยตนเอง)',
        submitLabel: 'ส่งคำขอ',
        body: `
            <div class="form-group">
                <label for="forgotUserCode">PS Code</label>
                <input type="text" id="forgotUserCode" autocomplete="username" maxlength="30" required>
            </div>`,
        onSubmit: async (form) => {
            const userCode = form.querySelector('#forgotUserCode').value.trim();
            if (!userCode) {
                showNotification('กรุณาระบุ PS Code', 'error');
                return false;
            }
            const result = await apiPost('requestPasswordReset', { userCode });
            showNotification(result.message, 'success');
        }
    });
    if (dialog && typed) dialog.querySelector('#forgotUserCode').value = typed.trim();
}

// ===== หน้าจัดการผู้ใช้ (admin) =====

let managedUsers = [];
let pendingResets = [];
let userFilter = 'pending';

async function loadUserManagement() {
    const container = document.getElementById('userManagementBody');
    if (!container) return;
    if (!hasRole('admin')) {
        container.innerHTML = '<p class="text-center">เฉพาะผู้ดูแลระบบเท่านั้น</p>';
        return;
    }
    container.innerHTML = '<p class="text-center"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</p>';
    try {
        const result = await apiPost('listUsers');
        managedUsers = result.users || [];
        pendingResets = result.pendingResets || [];
        renderUserManagement();
    } catch (error) {
        container.innerHTML = `<p class="text-center">${escapeHtml(error.message)}</p>`;
    }
}

function userStatusTag(user) {
    if (user.request === 'PENDING') return '<span class="tag tag-warning">รออนุมัติ</span>';
    if (user.request === 'REJECTED') return '<span class="tag tag-danger">ไม่อนุมัติ</span>';
    if (!user.active) return '<span class="tag tag-danger">ปิดใช้งาน</span>';
    return '<span class="tag tag-success">ใช้งาน</span>';
}

function levelSelectHtml(user) {
    const options = Object.entries(USER_LEVEL_LABELS)
        .map(([value, label]) => `<option value="${value}" ${user.level === value ? 'selected' : ''}>${label}</option>`)
        .join('');
    return `<select class="user-level-select" data-ps="${escapeHtml(user.psCode)}" aria-label="ระดับของ ${escapeHtml(user.psCode)}">${options}</select>`;
}

function userActionsHtml(user) {
    const ps = escapeHtml(user.psCode);
    const isSelf = currentUser && currentUser.psCode === user.psCode;
    if (user.request === 'PENDING') {
        return `
            <button class="btn btn-primary btn-sm" data-user-action="approve" data-ps="${ps}"><i class="fas fa-check"></i> อนุมัติ</button>
            <button class="btn btn-secondary btn-sm" data-user-action="reject" data-ps="${ps}"><i class="fas fa-times"></i> ปฏิเสธ</button>`;
    }
    return `
        <button class="btn btn-secondary btn-sm" data-user-action="reset" data-ps="${ps}" title="ออกรหัสผ่านชั่วคราว"><i class="fas fa-key"></i> รีเซ็ตรหัส</button>
        ${isSelf ? '' : `<button class="btn btn-secondary btn-sm" data-user-action="${user.active ? 'disable' : 'enable'}" data-ps="${ps}">
            ${user.active ? '<i class="fas fa-ban"></i> ปิดใช้งาน' : '<i class="fas fa-check"></i> เปิดใช้งาน'}</button>`}`;
}

function renderUserManagement() {
    const container = document.getElementById('userManagementBody');
    if (!container) return;

    const pendingCount = managedUsers.filter(u => u.request === 'PENDING').length;
    const filtered = managedUsers.filter(u => {
        if (userFilter === 'pending') return u.request === 'PENDING';
        if (userFilter === 'disabled') return !u.active && u.request !== 'PENDING';
        return true;
    });

    const resetsHtml = pendingResets.length === 0 ? '' : `
        <div class="user-resets">
            <h3><i class="fas fa-unlock-alt"></i> คำขอรีเซ็ตรหัสผ่าน (${pendingResets.length})</h3>
            <ul>
                ${pendingResets.map(r => `
                    <li>
                        <span><strong>${escapeHtml(r.psCode)}</strong> ${escapeHtml(r.name)} <small>${escapeHtml(r.requestedAt)}</small></span>
                        <button class="btn btn-primary btn-sm" data-user-action="reset" data-ps="${escapeHtml(r.psCode)}"><i class="fas fa-key"></i> ออกรหัสชั่วคราว</button>
                    </li>`).join('')}
            </ul>
        </div>`;

    const tabs = [
        ['pending', `รออนุมัติ (${pendingCount})`],
        ['all', `ทั้งหมด (${managedUsers.length})`],
        ['disabled', 'ปิดใช้งาน']
    ].map(([key, label]) =>
        `<button class="user-tab ${userFilter === key ? 'active' : ''}" data-user-filter="${key}" aria-pressed="${userFilter === key}">${label}</button>`
    ).join('');

    const rows = filtered.length === 0
        ? '<tr><td colspan="6" class="text-center">ไม่มีรายการ</td></tr>'
        : filtered.map(u => {
            const isSelf = currentUser && currentUser.psCode === u.psCode;
            return `
            <tr>
                <td><strong>${escapeHtml(u.psCode)}</strong>${u.mustChangePassword ? ' <span class="tag tag-info" title="ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบ">รหัสชั่วคราว</span>' : ''}</td>
                <td>${escapeHtml(u.name)}${u.email ? `<br><small>${escapeHtml(u.email)}</small>` : ''}</td>
                <td>${escapeHtml(u.group)}</td>
                <td>${isSelf ? escapeHtml(USER_LEVEL_LABELS[u.level] || u.level) : levelSelectHtml(u)}</td>
                <td>${userStatusTag(u)}${u.request === 'PENDING' && u.requestedAt ? `<br><small>${escapeHtml(u.requestedAt)}</small>` : ''}</td>
                <td class="user-actions">${userActionsHtml(u)}</td>
            </tr>`;
        }).join('');

    container.innerHTML = `
        ${resetsHtml}
        <div class="user-tabs" role="group" aria-label="กรองผู้ใช้">${tabs}</div>
        <div class="data-table-container">
            <table class="data-table">
                <thead><tr><th>PS Code</th><th>ชื่อ</th><th>กลุ่ม</th><th>ระดับ</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

async function runUserAction(action, psCode, extra = {}) {
    const result = await apiPost(action, { psCode, ...extra });
    if (result.message) showNotification(result.message, 'success');
    await loadUserManagement();
    return result;
}

function showTempPasswordDialog(result) {
    openFormDialog({
        id: 'tempPasswordDialog',
        title: '<i class="fas fa-key"></i> รหัสผ่านชั่วคราว',
        note: 'รหัสนี้แสดงครั้งเดียว — แจ้งผู้ใช้ด้วยตนเองหรือทางช่องทางส่วนตัว ผู้ใช้จะถูกบังคับให้ตั้งรหัสใหม่เมื่อเข้าสู่ระบบ',
        submitLabel: 'ปิด',
        cancellable: false,
        body: `
            <p>${escapeHtml(result.name)} (${escapeHtml(result.psCode)})</p>
            <div class="temp-password">
                <code id="tempPasswordValue">${escapeHtml(result.tempPassword)}</code>
                <button type="button" class="btn btn-secondary btn-sm" id="copyTempPassword"><i class="fas fa-copy"></i> คัดลอก</button>
            </div>`,
        onSubmit: async () => {}
    });
    const copyBtn = document.getElementById('copyTempPassword');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(result.tempPassword);
                showNotification('คัดลอกแล้ว', 'success');
            } catch (_) {
                showNotification('คัดลอกไม่ได้ กรุณาจดรหัสด้วยตนเอง', 'warning');
            }
        });
    }
}

async function handleUserManagementClick(event) {
    const filterBtn = event.target.closest('[data-user-filter]');
    if (filterBtn) {
        userFilter = filterBtn.dataset.userFilter;
        renderUserManagement();
        return;
    }

    const btn = event.target.closest('[data-user-action]');
    if (!btn) return;
    const psCode = btn.dataset.ps;
    const user = managedUsers.find(u => u.psCode === psCode) || { psCode, name: '' };
    const label = `${psCode}${user.name ? ` (${user.name})` : ''}`;

    btn.disabled = true;
    try {
        switch (btn.dataset.userAction) {
            case 'approve': {
                const select = document.querySelector(`.user-level-select[data-ps="${CSS.escape(psCode)}"]`);
                await runUserAction('approveUser', psCode, { level: select ? select.value : 'user' });
                break;
            }
            case 'reject':
                if (confirm(`ปฏิเสธคำขอลงทะเบียนของ ${label}?`)) await runUserAction('rejectUser', psCode);
                break;
            case 'disable':
                if (confirm(`ปิดใช้งานบัญชี ${label}? ผู้ใช้จะถูกออกจากระบบทันที`)) {
                    await runUserAction('updateUser', psCode, { active: false });
                }
                break;
            case 'enable':
                await runUserAction('updateUser', psCode, { active: true });
                break;
            case 'reset':
                if (confirm(`ออกรหัสผ่านชั่วคราวให้ ${label}? รหัสเดิมจะใช้ไม่ได้ทันที`)) {
                    const result = await apiPost('adminResetPassword', { psCode });
                    showTempPasswordDialog(result);
                    await loadUserManagement();
                }
                break;
        }
    } catch (error) {
        showNotification(error.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function handleUserLevelChange(event) {
    const select = event.target.closest('.user-level-select');
    if (!select) return;
    const user = managedUsers.find(u => u.psCode === select.dataset.ps);
    // คำขอที่รออนุมัติ: ระดับจะถูกใช้ตอนกดอนุมัติ
    if (!user || user.request === 'PENDING') return;

    const label = USER_LEVEL_LABELS[select.value];
    if (!confirm(`เปลี่ยนระดับของ ${user.psCode} เป็น "${label}"? ผู้ใช้จะต้องเข้าสู่ระบบใหม่`)) {
        select.value = user.level;
        return;
    }
    try {
        await runUserAction('updateUser', user.psCode, { level: select.value });
    } catch (error) {
        select.value = user.level;
        showNotification(error.message, 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupLoginLinks();

    const container = document.getElementById('userManagementBody');
    if (container) {
        container.addEventListener('click', handleUserManagementClick);
        container.addEventListener('change', handleUserLevelChange);
    }
    const refreshBtn = document.getElementById('refreshUsersBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadUserManagement);
});
