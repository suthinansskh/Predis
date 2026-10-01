// Login / logout / session / เปลี่ยนรหัสผ่าน
// โหลดเป็น classic script ตามลำดับใน JS_FILES (ดู sw.js / *.html)

// Authentication and User Management
function checkAuthentication() {
    const storedUser = localStorage.getItem('currentUser');

    if (storedUser && getSessionToken()) {
        try {
            currentUser = JSON.parse(storedUser);
            showMainApp();
            return true;
        } catch (error) {
            console.error('Error parsing stored user:', error);
        }
    }
    clearSession();
    showLoginPage();
    return false;
}

function showLoginPage() {
    document.getElementById('login').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
}

function showMainApp() {

    document.getElementById('login').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';

    // Update user display
    const userNameEl = document.getElementById('userName');
    if (userNameEl && currentUser) {
        userNameEl.textContent = currentUser.name || currentUser.psCode;
    }

    // RBAC: hide admin-only tabs (UX only — server enforces roles)
    ['settingsNavBtn', 'usersNavBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = hasRole('admin') ? '' : 'none';
    });

    // RBAC: hide add drug button for non-privileged users
    const addDrugBtn = document.getElementById('addDrugBtn');
    if (addDrugBtn) {
        addDrugBtn.style.display = hasRole('admin', 'supervisor', 'pharmacist') ? '' : 'none';
    }

    // Wait a bit for DOM to be ready then update reporter field
    setTimeout(() => { updateReporterField(); }, 100);

    // Update dashboard user info
    updateDashboardUserInfo();

    // Load initial data based on current page
    if (currentPage === 'dashboard' || currentPage === 'myreport') {
        loadData();
    }
}

function updateReporterField() {

    const reporterEl = document.getElementById('reporter');

    if (!reporterEl) {
        return;
    }

    if (currentUser) {
        // รูปแบบ: ชื่อ-นามสกุล (PS Code) - กลุ่ม/ระดับ
        const reporterValue = `${currentUser.name} (${currentUser.psCode}) - ${currentUser.group}/${currentUser.level}`;
        reporterEl.value = reporterValue;

        // Force visual update
        reporterEl.dispatchEvent(new Event('input', { bubbles: true }));
        reporterEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
        // ถ้าไม่มี currentUser ให้แสดงข้อความรอ
        reporterEl.value = 'รอโหลดชื่อผู้ใช้งาน...';
    }
}

function updateDashboardUserInfo() {
    const currentUserDisplay = document.getElementById('currentUserDisplay');
    const currentGroupDisplay = document.getElementById('currentGroupDisplay');

    if (currentUserDisplay && currentUser) {
        currentUserDisplay.textContent = currentUser.name;
    }

    if (currentGroupDisplay && currentUser) {
        currentGroupDisplay.textContent = currentUser.group || 'ไม่ระบุ';
    }

    // Set default filter to show current user's reports
    const filterUser = document.getElementById('filterUser');
    if (filterUser && currentUser) {
        // Set default to current user for regular users, all for admins
        if (currentUser.level === 'admin' || currentUser.level === 'supervisor') {
            filterUser.value = '';  // Show all for admin/supervisor
        } else {
            filterUser.value = 'currentUser';  // Show only user's reports for regular users
        }
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const userCode = formData.get('userCode').trim();
    const password = formData.get('password').trim();

    if (!userCode) {
        showNotification('กรุณาใส่ PS Code หรือ ID13', 'error');
        return;
    }

    if (!password) {
        showNotification('กรุณาใส่รหัสผ่าน', 'error');
        return;
    }

    // Show loading
    const loginBtn = event.target.querySelector('.login-btn');
    const originalText = loginBtn.innerHTML;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังตรวจสอบ...';
    loginBtn.disabled = true;

    try {
        const result = await authenticateUser(userCode, password);

        if (result) {
            const user = result.user;
            currentUser = user;
            saveSession(result.token, result.expiresIn);
            localStorage.setItem('currentUser', JSON.stringify(user));
            showNotification(`ยินดีต้อนรับ ${user.name} (${user.group} - ${user.level})`, 'success');
            showMainApp();
            initializeApp();
            if (result.mustChangePassword) {
                showChangePasswordDialog({ forced: true });
            }
        } else {
            showNotification('ไม่พบผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบข้อมูลอีกครั้ง', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + error.message, 'error');
    } finally {
        loginBtn.innerHTML = originalText;
        loginBtn.disabled = false;
    }
}

// ตรวจสอบฝั่ง Server เสมอ (POST — รหัสผ่านไม่อยู่ใน URL/log)
async function authenticateUser(userCode, password) {
    return apiPost('login', { userCode, password });
}

function logout() {
    const token = getSessionToken();
    clearSession();
    showLoginPage();
    showNotification('ออกจากระบบเรียบร้อย', 'info');
    if (token) {
        // แจ้ง server ให้ยกเลิก token (ไม่ต้องรอผล)
        const formData = new FormData();
        formData.append('action', 'logout');
        formData.append('token', token);
        fetch(googleSheetsConfig.webAppUrl, { method: 'POST', body: formData }).catch(() => {});
    }
}

// ===== Form Dialog (ใช้ร่วมกัน: เปลี่ยนรหัส / ลงทะเบียน / ลืมรหัส) =====

/**
 * เปิด dialog ที่มีฟอร์ม
 * @param {Object} opts
 * @param {string} opts.id - id ของ overlay (เปิดซ้ำไม่ได้)
 * @param {string} opts.title - หัวข้อ (HTML ที่ปลอดภัย)
 * @param {string} [opts.note] - ข้อความแจ้งเตือนด้านบน (HTML ที่ปลอดภัย)
 * @param {string} opts.body - ช่องกรอกในฟอร์ม (HTML ที่ปลอดภัย)
 * @param {string} [opts.submitLabel]
 * @param {boolean} [opts.cancellable=true]
 * @param {(form: HTMLFormElement) => Promise<boolean|void>} opts.onSubmit - คืน false เพื่อคง dialog ไว้
 */
function openFormDialog({ id, title, note = '', body, submitLabel = 'บันทึก', cancellable = true, onSubmit }) {
    if (document.getElementById(id)) return null;

    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'password-dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', `${id}Title`);
    overlay.innerHTML = `
        <form class="password-dialog" novalidate>
            <h3 id="${id}Title">${title}</h3>
            ${note ? `<p class="password-dialog-note">${note}</p>` : ''}
            ${body}
            <div class="password-dialog-actions">
                ${cancellable ? '<button type="button" class="btn btn-secondary" data-action="cancel">ยกเลิก</button>' : ''}
                <button type="submit" class="btn btn-primary">${submitLabel}</button>
            </div>
        </form>`;
    document.body.appendChild(overlay);

    const form = overlay.querySelector('form');
    const close = () => overlay.remove();
    const cancelBtn = overlay.querySelector('[data-action="cancel"]');
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    if (cancellable) {
        overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    }
    const firstInput = form.querySelector('input, select');
    if (firstInput) firstInput.focus();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        try {
            const keepOpen = (await onSubmit(form)) === false;
            if (!keepOpen) close();
        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            submitBtn.disabled = false;
        }
    });
    return overlay;
}

function passwordFieldsHtml(prefix) {
    return `
        <div class="form-group">
            <label for="${prefix}New">รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</label>
            <input type="password" id="${prefix}New" autocomplete="new-password" minlength="8" required>
        </div>
        <div class="form-group">
            <label for="${prefix}Confirm">ยืนยันรหัสผ่านใหม่</label>
            <input type="password" id="${prefix}Confirm" autocomplete="new-password" minlength="8" required>
        </div>`;
}

// ตรวจรหัสผ่านใหม่ฝั่ง client (server ตรวจซ้ำเสมอ) — คืนรหัสผ่าน หรือ null ถ้าไม่ผ่าน
function readNewPassword(form, prefix) {
    const password = form.querySelector(`#${prefix}New`).value;
    const confirm = form.querySelector(`#${prefix}Confirm`).value;
    if (password.length < 8) {
        showNotification('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร', 'error');
        return null;
    }
    if (password !== confirm) {
        showNotification('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน', 'error');
        return null;
    }
    return password;
}

// ===== Change Password Dialog =====
function showChangePasswordDialog({ forced = false } = {}) {
    openFormDialog({
        id: 'changePasswordDialog',
        title: '<i class="fas fa-key"></i> เปลี่ยนรหัสผ่าน',
        note: forced ? 'รหัสผ่านปัจจุบันเป็นรหัสชั่วคราว กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งาน' : '',
        cancellable: !forced,
        body: `
            <div class="form-group">
                <label for="cpCurrent">รหัสผ่านปัจจุบัน</label>
                <input type="password" id="cpCurrent" autocomplete="current-password" required>
            </div>
            ${passwordFieldsHtml('cp')}`,
        onSubmit: async (form) => {
            const newPassword = readNewPassword(form, 'cp');
            if (!newPassword) return false;
            const currentPassword = form.querySelector('#cpCurrent').value;
            await apiPost('changePassword', { currentPassword, newPassword });
            showNotification('เปลี่ยนรหัสผ่านสำเร็จ', 'success');
        }
    });
}
