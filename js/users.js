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
        <button type="button" class="link-btn" data-action="activate"><i class="fas fa-ticket-alt"></i> มีรหัสเปิดใช้งาน</button>
        <button type="button" class="link-btn" data-action="forgot">ลืมรหัสผ่าน?</button>
        <button type="button" class="link-btn" data-action="register"><i class="fas fa-user-plus"></i> ลงทะเบียนผู้ใช้ใหม่</button>`;
    links.querySelector('[data-action="activate"]').addEventListener('click', () => showActivateDialog());
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
        note: 'คำขอจะถูกส่งถึงผู้ดูแลระบบ ซึ่งจะออก "รหัสเปิดใช้งาน" ให้คุณ (รับจากหัวหน้าหรือผู้ดูแล) แล้วกด "มีรหัสเปิดใช้งาน" เพื่อตั้งรหัสผ่านใหม่เอง',
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
let accountStats = null;

async function loadUserManagement() {
    const container = document.getElementById('userManagementBody');
    if (!container) return;
    if (!hasRole('admin')) {
        container.innerHTML = '<p class="text-center">เฉพาะผู้ดูแลระบบเท่านั้น</p>';
        return;
    }
    container.innerHTML = '<p class="text-center"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</p>';
    try {
        const [result, stats] = await Promise.all([
            apiPost('listUsers'),
            apiV2('admin.loginStats', { days: 7 }).catch(() => null)
        ]);
        managedUsers = result.users || [];
        pendingResets = result.pendingResets || [];
        accountStats = stats;
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
        <button class="btn btn-secondary btn-sm" data-user-action="activation" data-ps="${ps}" title="ออกรหัสเปิดใช้งานให้ผู้ใช้ตั้งรหัสผ่านเอง"><i class="fas fa-ticket-alt"></i> ออกรหัสเปิดใช้งาน</button>
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
                        <button class="btn btn-primary btn-sm" data-user-action="activation" data-ps="${escapeHtml(r.psCode)}"><i class="fas fa-ticket-alt"></i> ออกรหัสเปิดใช้งาน</button>
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
                <td>${isSelf ? escapeHtml(u.group) : groupSelectHtml(u)}</td>
                <td>${isSelf ? escapeHtml(USER_LEVEL_LABELS[u.level] || u.level) : levelSelectHtml(u)}</td>
                <td>${userStatusTag(u)}${u.request === 'PENDING' && u.requestedAt ? `<br><small>${escapeHtml(u.requestedAt)}</small>` : ''}</td>
                <td class="user-actions">${userActionsHtml(u)}</td>
            </tr>`;
        }).join('');

    container.innerHTML = `
        ${accountSummaryHtml()}
        ${resetsHtml}
        <div class="user-tabs" role="group" aria-label="กรองผู้ใช้">${tabs}</div>
        <div class="data-table-container">
            <table class="data-table responsive-cards">
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
            case 'activation':
                if (confirm(`ออกรหัสเปิดใช้งานให้ ${label}? รหัสเปิดใช้งานเดิม (ถ้ามี) จะใช้ไม่ได้`)) {
                    await issueAndPrint({ psCodes: [psCode] });
                }
                break;
            case 'bulk-activation': {
                const n = accountStats ? accountStats.accounts.weakPassword : 0;
                if (confirm(`ออกรหัสเปิดใช้งานให้ผู้ใช้ที่ยังใช้รหัสเริ่มต้น ${n} คน และพิมพ์ใบแจก?\nรหัสเปิดใช้งานเดิมที่ยังไม่ใช้จะถูกยกเลิก`)) {
                    await issueAndPrint({ weakOnly: true });
                }
                break;
            }
        }
    } catch (error) {
        showNotification(error.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function handleUserLevelChange(event) {
    const groupSelect = event.target.closest('.user-group-select');
    if (groupSelect) {
        const user = managedUsers.find(u => u.psCode === groupSelect.dataset.ps);
        try {
            await runUserAction('updateUser', groupSelect.dataset.ps, { group: groupSelect.value });
        } catch (error) {
            if (user) groupSelect.value = user.group;
            showNotification(error.message, 'error');
        }
        return;
    }
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

    // ลิงก์ในใบรหัส: ?activate=1 เปิดหน้าต่างเปิดใช้งานทันที
    if (/[?&]activate=1/.test(window.location.search) && !getSessionToken()) {
        showActivateDialog();
    }
});

// ===== เปิดใช้งานบัญชีด้วยรหัสเปิดใช้งาน =====

function showActivateDialog() {
    const typed = (document.getElementById('userCode') || {}).value || '';
    const dialog = openFormDialog({
        id: 'activateDialog',
        title: '<i class="fas fa-ticket-alt"></i> เปิดใช้งานบัญชี',
        note: 'กรอกรหัสเปิดใช้งาน 8 ตัวจากใบที่ได้รับ แล้วตั้งรหัสผ่านใหม่ของคุณเอง (รหัสใช้ได้ครั้งเดียว)',
        submitLabel: 'ตั้งรหัสผ่านและเข้าสู่ระบบ',
        body: `
            <div class="form-group">
                <label for="actUserCode">PS Code</label>
                <input type="text" id="actUserCode" autocomplete="username" maxlength="30" required>
            </div>
            <div class="form-group">
                <label for="actCode">รหัสเปิดใช้งาน</label>
                <input type="text" id="actCode" autocomplete="one-time-code" maxlength="12" required
                       style="text-transform: uppercase; letter-spacing: 2px">
            </div>
            ${passwordFieldsHtml('act')}`,
        onSubmit: async (form) => {
            const userCode = form.querySelector('#actUserCode').value.trim();
            const code = form.querySelector('#actCode').value.trim();
            if (!userCode || !code) {
                showNotification('กรุณากรอก PS Code และรหัสเปิดใช้งาน', 'error');
                return false;
            }
            const newPassword = readNewPassword(form, 'act');
            if (!newPassword) return false;
            try {
                const result = await apiV2('auth.activate', { userCode, code, newPassword });
                currentUser = result.user;
                saveSession(result.token, result.expiresIn);
                localStorage.setItem('currentUser', JSON.stringify(result.user));
                showNotification(`เปิดใช้งานบัญชีสำเร็จ ยินดีต้อนรับ ${result.user.name}`, 'success');
                showMainApp();
                initializeApp();
            } catch (error) {
                const wait = error.retryAfter ? ` (รอ ${error.retryAfter} วินาที)` : '';
                showNotification(error.message + wait, 'error');
                return false;
            }
        }
    });
    if (dialog && typed) dialog.querySelector('#actUserCode').value = typed.trim();
}

// ===== คำแนะนำใต้ฟอร์ม login (ค้างไว้ ไม่หายเหมือน notification) =====

const LOGIN_HELP = {
    DEFAULT_PASSWORD_BLOCKED: {
        tone: 'warning',
        extra: 'ถ้าได้รับใบ "รหัสเปิดใช้งาน" แล้ว กด "ใช้รหัสเปิดใช้งาน" — ถ้ายังไม่ได้รับ กด "ขอรหัสจากผู้ดูแล"',
        actions: [['activate', 'ใช้รหัสเปิดใช้งาน'], ['forgot', 'ขอรหัสจากผู้ดูแล']]
    },
    WRONG_CREDENTIALS: {
        tone: 'error',
        extra: 'ใช้ PS Code และรหัสผ่านที่ตั้งเอง (ไม่ใช่ 4 ตัวท้ายบัตรประชาชนแล้ว) — จำไม่ได้กด "ลืมรหัสผ่าน"',
        actions: [['forgot', 'ลืมรหัสผ่าน']]
    },
    LOCKED: { tone: 'error', actions: [['forgot', 'ลืมรหัสผ่าน']] },
    PENDING_APPROVAL: { tone: 'info', actions: [] },
    REJECTED: { tone: 'error', actions: [] },
    DISABLED: { tone: 'error', actions: [] }
};

function hideLoginHelp() {
    const el = document.getElementById('loginHelp');
    if (el) el.remove();
}

function showLoginHelp(code, message, retryAfter) {
    const form = document.getElementById('loginForm');
    const help = LOGIN_HELP[code];
    if (!form || !help) {
        showNotification(message, 'error');
        return;
    }
    hideLoginHelp();
    const box = document.createElement('div');
    box.id = 'loginHelp';
    box.className = `login-help login-help-${help.tone}`;
    box.setAttribute('role', 'alert');
    box.innerHTML = `
        <p><strong>${escapeHtml(message)}</strong></p>
        ${help.extra ? `<p>${escapeHtml(help.extra)}</p>` : ''}
        ${help.actions.length ? `<div class="login-help-actions">${help.actions.map(([action, label]) =>
            `<button type="button" class="btn btn-secondary btn-sm" data-help-action="${action}">${label}</button>`).join('')}</div>` : ''}`;
    box.querySelectorAll('[data-help-action]').forEach(btn => btn.addEventListener('click', () => {
        if (btn.dataset.helpAction === 'activate') showActivateDialog();
        if (btn.dataset.helpAction === 'forgot') showForgotPasswordDialog();
    }));
    form.insertAdjacentElement('afterend', box);

    // นับถอยหลังเมื่อถูกหน่วงเวลา
    if (code === 'LOCKED' && retryAfter > 0) {
        const loginBtn = form.querySelector('.login-btn');
        let left = retryAfter;
        // หลัง finally ของ handleLogin (ซึ่งเปิดปุ่มกลับ)
        setTimeout(() => { if (loginBtn && left > 0) loginBtn.disabled = true; }, 0);
        const timer = setInterval(() => {
            left -= 1;
            const strong = box.querySelector('strong');
            if (strong) strong.textContent = `ใส่รหัสผ่านผิดหลายครั้ง ลองใหม่ได้ใน ${left} วินาที`;
            if (left <= 0 || !document.body.contains(box)) {
                clearInterval(timer);
                if (loginBtn) loginBtn.disabled = false;
                if (strong && left <= 0) strong.textContent = 'ลองเข้าสู่ระบบอีกครั้งได้แล้ว';
            }
        }, 1000);
    }
}

// ===== Admin: สรุปบัญชี, ออกรหัสเปิดใช้งาน, พิมพ์ใบ, badge =====

function groupSelectHtml(user) {
    const groups = [...new Set([...USER_GROUP_OPTIONS, user.group].filter(Boolean))];
    const options = [`<option value="" ${user.group ? '' : 'selected'} disabled>-- ระบุกลุ่ม --</option>`]
        .concat(groups.map(g => `<option value="${escapeHtml(g)}" ${user.group === g ? 'selected' : ''}>${escapeHtml(g)}</option>`))
        .join('');
    return `<select class="user-group-select${user.group ? '' : ' needs-value'}" data-ps="${escapeHtml(user.psCode)}" aria-label="กลุ่มงานของ ${escapeHtml(user.psCode)}">${options}</select>`;
}

function accountSummaryHtml() {
    if (!accountStats) return '';
    const a = accountStats.accounts;
    const week = accountStats.days.reduce((acc, d) => {
        Object.entries(d.counts).forEach(([k, v]) => { acc[k] = (acc[k] || 0) + v; });
        return acc;
    }, {});
    const tile = (label, value, tone = '') => `<div class="account-tile ${tone}"><span class="account-tile-value">${value}</span><span>${label}</span></div>`;
    return `
        <div class="account-summary">
            <div class="account-tiles">
                ${tile('บัญชีที่ใช้งาน', a.active)}
                ${tile('ยังใช้รหัสเริ่มต้น (เข้าระบบไม่ได้)', a.weakPassword, a.weakPassword ? 'tone-danger' : '')}
                ${tile('รหัสเปิดใช้งานที่ยังไม่ใช้', a.activationsPending)}
                ${tile('ยังไม่ระบุกลุ่มงาน', a.missingGroup, a.missingGroup ? 'tone-warning' : '')}
                ${tile('login สำเร็จ 7 วัน', week.LOGIN_SUCCESS || 0)}
                ${tile('ถูกบล็อก/ผิด 7 วัน', (week.LOGIN_BLOCKED_WEAK || 0) + (week.LOGIN_FAILED || 0))}
            </div>
            ${a.weakPassword ? `<button class="btn btn-primary" data-user-action="bulk-activation">
                <i class="fas fa-print"></i> ออกรหัสเปิดใช้งาน + พิมพ์ใบแจก (${a.weakPassword} คน)</button>` : ''}
        </div>`;
}

async function issueAndPrint(payload) {
    // เปิดหน้าต่างก่อน await (กัน popup blocker) แล้วค่อยเติมเนื้อหา
    const win = window.open('', '_blank');
    try {
        const { items } = await apiV2('users.issueActivations', payload);
        if (win) {
            printActivationSlips(win, items);
        } else {
            showActivationCodesDialog(items);
        }
        showNotification(`ออกรหัสเปิดใช้งานแล้ว ${items.length} คน`, 'success');
        await loadUserManagement();
    } catch (error) {
        if (win) win.close();
        throw error;
    }
}

function activationUrl() {
    return `${location.origin}${location.pathname.replace(/[^/]*$/, '')}report.html?activate=1`;
}

function printActivationSlips(win, items) {
    const byGroup = {};
    items.forEach(i => { (byGroup[i.group || 'ไม่ระบุกลุ่ม'] ||= []).push(i); });
    const url = activationUrl();
    const slips = Object.entries(byGroup).sort().map(([group, list]) => `
        <h2>${escapeHtml(group)} (${list.length} คน)</h2>
        <div class="slips">${list.sort((a, b) => a.psCode.localeCompare(b.psCode)).map(i => `
            <div class="slip">
                <div class="who"><strong>${escapeHtml(i.name)}</strong> — PS Code: <strong>${escapeHtml(i.psCode)}</strong></div>
                <div class="code">${escapeHtml(i.code.slice(0, 4))}-${escapeHtml(i.code.slice(4))}</div>
                <ol>
                    <li>เปิด ${escapeHtml(url)}</li>
                    <li>กด "มีรหัสเปิดใช้งาน" กรอก PS Code และรหัสด้านบน</li>
                    <li>ตั้งรหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</li>
                </ol>
                <div class="exp">ใช้ได้ครั้งเดียว ภายใน ${escapeHtml(i.expiresAt)} — ห้ามให้ผู้อื่น</div>
            </div>`).join('')}
        </div>`).join('');
    win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>รหัสเปิดใช้งาน Predis</title>
        <style>
            body { font-family: 'Sarabun', sans-serif; margin: 16px; color: #000; }
            h1 { font-size: 18px; } h2 { font-size: 16px; margin: 16px 0 8px; page-break-before: auto; }
            .slips { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            .slip { border: 1px dashed #555; padding: 10px; page-break-inside: avoid; font-size: 13px; }
            .code { font-size: 26px; font-weight: 700; letter-spacing: 4px; margin: 6px 0; font-family: monospace; }
            ol { margin: 4px 0 4px 18px; padding: 0; } .exp { font-size: 12px; color: #444; }
            @media print { .no-print { display: none; } }
        </style></head><body>
        <div class="no-print"><button onclick="window.print()">พิมพ์</button>
        <p>รหัสแสดงครั้งเดียว — พิมพ์หรือบันทึกเป็น PDF ก่อนปิดหน้านี้ ตัดแจกเป็นรายบุคคล</p></div>
        <h1>รหัสเปิดใช้งานบัญชี Predis (${items.length} คน)</h1>${slips}</body></html>`);
    win.document.close();
}

function showActivationCodesDialog(items) {
    openFormDialog({
        id: 'activationCodesDialog',
        title: '<i class="fas fa-ticket-alt"></i> รหัสเปิดใช้งาน',
        note: 'เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — รหัสแสดงครั้งเดียว กรุณาจดหรือคัดลอกก่อนปิด',
        submitLabel: 'ปิด',
        cancellable: false,
        body: `<div class="temp-password" style="display:block; max-height: 50vh; overflow:auto">${items.map(i =>
            `<div><code>${escapeHtml(i.code)}</code> ${escapeHtml(i.psCode)} ${escapeHtml(i.name)}</div>`).join('')}</div>`,
        onSubmit: async () => {}
    });
}

/** admin: แสดงจำนวนคำขอค้างที่เมนู "จัดการผู้ใช้" */
async function refreshAdminBadge() {
    if (!hasRole('admin')) return;
    try {
        const me = await apiV2('auth.me');
        const counts = me.pendingCounts || { registrations: 0, resets: 0 };
        const total = counts.registrations + counts.resets;
        document.querySelectorAll('#usersNavBtn').forEach(btn => {
            let badge = btn.querySelector('.nav-badge');
            if (!total) {
                if (badge) badge.remove();
                return;
            }
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'nav-badge';
                btn.appendChild(badge);
            }
            badge.textContent = total;
            badge.title = `รออนุมัติ ${counts.registrations} · ขอรีเซ็ตรหัส ${counts.resets}`;
        });
        if (total) {
            showNotification(`มีงานรอดำเนินการ: สมัครใหม่ ${counts.registrations} · ขอรีเซ็ตรหัส ${counts.resets}`, 'info');
        }
    } catch (_) { /* ไม่ขัดการใช้งาน */ }
}
