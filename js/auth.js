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

    // RBAC: hide settings tab for non-admin users
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        if (btn.textContent.includes('ตั้งค่า')) {
            btn.style.display = hasRole('admin') ? '' : 'none';
        }
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

// ===== Change Password Dialog =====
function showChangePasswordDialog({ forced = false } = {}) {
    if (document.getElementById('changePasswordDialog')) return;

    const overlay = document.createElement('div');
    overlay.id = 'changePasswordDialog';
    overlay.className = 'password-dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'changePasswordTitle');
    overlay.innerHTML = `
        <form class="password-dialog" novalidate>
            <h3 id="changePasswordTitle"><i class="fas fa-key"></i> เปลี่ยนรหัสผ่าน</h3>
            ${forced ? '<p class="password-dialog-note">รหัสผ่านปัจจุบันเป็นรหัสชั่วคราว กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งาน</p>' : ''}
            <div class="form-group">
                <label for="cpCurrent">รหัสผ่านปัจจุบัน</label>
                <input type="password" id="cpCurrent" autocomplete="current-password" required>
            </div>
            <div class="form-group">
                <label for="cpNew">รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</label>
                <input type="password" id="cpNew" autocomplete="new-password" minlength="8" required>
            </div>
            <div class="form-group">
                <label for="cpConfirm">ยืนยันรหัสผ่านใหม่</label>
                <input type="password" id="cpConfirm" autocomplete="new-password" minlength="8" required>
            </div>
            <div class="password-dialog-actions">
                ${forced ? '' : '<button type="button" class="btn btn-secondary" data-action="cancel">ยกเลิก</button>'}
                <button type="submit" class="btn btn-primary">บันทึก</button>
            </div>
        </form>`;
    document.body.appendChild(overlay);

    const form = overlay.querySelector('form');
    const close = () => overlay.remove();
    const cancelBtn = overlay.querySelector('[data-action="cancel"]');
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    overlay.querySelector('#cpCurrent').focus();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = form.querySelector('#cpCurrent').value;
        const newPassword = form.querySelector('#cpNew').value;
        const confirmPassword = form.querySelector('#cpConfirm').value;

        if (newPassword.length < 8) {
            showNotification('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            showNotification('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน', 'error');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        try {
            await apiPost('changePassword', { currentPassword, newPassword });
            showNotification('เปลี่ยนรหัสผ่านสำเร็จ', 'success');
            close();
        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            submitBtn.disabled = false;
        }
    });
}
