// ค่าเริ่มต้นและการตรวจสอบความถูกต้องของฟอร์ม
// โหลดเป็น classic script ตามลำดับใน JS_FILES (ดู sw.js / *.html)

function setCurrentDate() {
    const eventDateInput = document.getElementById('eventDate');
    if (eventDateInput) {
        // Get current date in YYYY-MM-DD format
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const currentDate = `${year}-${month}-${day}`;

        eventDateInput.value = currentDate;
        console.log('Set current date:', currentDate);
    }
}

// Enhanced form initialization
function initializeFormDefaults() {
    // Set current date
    setCurrentDate();

    // Setup enhanced form with validation
    setupFormEnhanced();

    // Reset form to initial state
    const form = document.getElementById('errorForm');
    if (form) {
        form.reset();

        // Set current date again after reset
        setTimeout(() => {
            setCurrentDate();
        }, 100);
    }

    // Clear any previous error messages
    clearFormErrors();

    // Focus on first input
    const firstInput = document.getElementById('shift');
    if (firstInput) {
        firstInput.focus();
    }
}

// Clear form validation errors
function clearFormErrors() {
    const formGroups = document.querySelectorAll('.form-group');
    formGroups.forEach(group => {
        group.classList.remove('has-error');
        const errorMsg = group.querySelector('.error-message');
        if (errorMsg) {
            errorMsg.remove();
        }
    });
}

// Enhanced form validation
function validateForm() {
    let isValid = true;
    const errors = [];

    // Clear previous errors
    clearFormErrors();

    // Required fields validation
    const requiredFields = [
        { id: 'eventDate', name: 'วันที่เกิดเหตุการณ์' },
        { id: 'shift', name: 'เวร' },
        { id: 'errorType', name: 'ประเภท' },
        { id: 'location', name: 'สถานที่เกิดเหตุการณ์' },
        { id: 'process', name: 'กระบวนการ' },
        { id: 'errorDetail', name: 'ข้อผิดพลาด' },
        { id: 'correctItem', name: 'รายการที่ถูกต้อง' },
        { id: 'cause', name: 'สาเหตุ' }
    ];

    requiredFields.forEach(field => {
        const element = document.getElementById(field.id);
        if (element && (!element.value || element.value.trim() === '')) {
            isValid = false;
            errors.push(field.name);

            // Add visual error indication
            const formGroup = element.closest('.form-group');
            if (formGroup) {
                formGroup.classList.add('has-error');

                // Add error message
                const errorMsg = document.createElement('div');
                errorMsg.className = 'error-message';
                errorMsg.textContent = `กรุณากรอก${field.name}`;
                formGroup.appendChild(errorMsg);
            }
        }
    });

    // Date validation (not in future)
    const eventDate = document.getElementById('eventDate');
    if (eventDate && eventDate.value) {
        const selectedDate = new Date(eventDate.value);
        const today = new Date();
        today.setHours(23, 59, 59, 999); // End of today

        if (selectedDate > today) {
            isValid = false;
            errors.push('วันที่เกิดเหตุการณ์ไม่สามารถเป็นวันในอนาคตได้');

            const formGroup = eventDate.closest('.form-group');
            if (formGroup) {
                formGroup.classList.add('has-error');
                const errorMsg = document.createElement('div');
                errorMsg.className = 'error-message';
                errorMsg.textContent = 'วันที่เกิดเหตุการณ์ไม่สามารถเป็นวันในอนาคตได้';
                formGroup.appendChild(errorMsg);
            }
        }
    }

    // Show summary of errors
    if (!isValid) {
        const errorSummary = `กรุณาตรวจสอบข้อมูลต่อไปนี้:\n• ${errors.join('\n• ')}`;
        showNotification(errorSummary, 'error');

        // Scroll to first error
        const firstError = document.querySelector('.form-group.has-error');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    return isValid;
}

// Real-time form validation
function setupFormValidation() {
    const form = document.getElementById('errorForm');
    if (!form) return;

    // Add event listeners for real-time validation
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        input.addEventListener('blur', function () {
            validateField(this);

            // ตรวจสอบ HAD เมื่อพิมพ์ข้อมูลในฟิลด์ยา
            if (['correctItem', 'incorrectItem', 'errorDetail'].includes(this.id)) {
                checkHADRealtime();
            }
        });

        input.addEventListener('input', function () {
            // Clear error state on input
            const formGroup = this.closest('.form-group');
            if (formGroup && formGroup.classList.contains('has-error')) {
                formGroup.classList.remove('has-error');
                const errorMsg = formGroup.querySelector('.error-message');
                if (errorMsg) {
                    errorMsg.remove();
                }
            }

            // ตรวจสอบ HAD แบบ real-time สำหรับฟิลด์ยา
            if (['correctItem', 'incorrectItem', 'errorDetail'].includes(this.id)) {
                clearTimeout(this.hadCheckTimeout);
                this.hadCheckTimeout = setTimeout(() => {
                    checkHADRealtime();
                }, 500); // Debounce 500ms
            }
        });
    });

    // Special handling for date input
    const eventDate = document.getElementById('eventDate');
    if (eventDate) {
        eventDate.addEventListener('change', function () {
            validateField(this);
        });
    }
}

// Validate individual field
function validateField(field) {
    const formGroup = field.closest('.form-group');
    if (!formGroup) return;

    let isValid = true;
    let errorMessage = '';

    // Clear previous error
    formGroup.classList.remove('has-error', 'has-success');
    const existingError = formGroup.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }

    // Check if field is required
    const requiredFields = ['eventDate', 'shift', 'errorType', 'location', 'process', 'errorDetail', 'correctItem', 'cause'];
    const isRequired = requiredFields.includes(field.id);

    if (isRequired && (!field.value || field.value.trim() === '')) {
        isValid = false;
        const prevLabel = field.previousElementSibling && field.previousElementSibling.textContent ? field.previousElementSibling.textContent : 'ข้อมูล';
        errorMessage = `กรุณากรอก${prevLabel}`;
    }

    // Date validation
    if (field.id === 'eventDate' && field.value) {
        const selectedDate = new Date(field.value);
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        if (selectedDate > today) {
            isValid = false;
            errorMessage = 'วันที่เกิดเหตุการณ์ไม่สามารถเป็นวันในอนาคตได้';
        }
    }

    // Apply validation state
    if (!isValid) {
        formGroup.classList.add('has-error');

        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = errorMessage;
        formGroup.appendChild(errorDiv);
    } else if (field.value && field.value.trim() !== '') {
        formGroup.classList.add('has-success');
    }

    return isValid;
}

// Enhanced form setup
function setupFormEnhanced() {
    setupFormValidation();

    // Add form submit handler with validation
    const form = document.getElementById('errorForm');
    if (form) {
        // Ensure we don't attach multiple listeners
        if (!form.dataset.listenerAttached) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                if (validateForm()) {
                    handleFormSubmit(e);
                }
            });
            form.dataset.listenerAttached = 'true';
        }
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
        // Ctrl+Enter or Cmd+Enter to submit current form
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const activeSection = document.querySelector('.section.active');
            if (activeSection && activeSection.id === 'form') {
                e.preventDefault();
                const errorForm = document.getElementById('errorForm');
                if (errorForm && validateForm()) {
                    handleFormSubmit(new Event('submit', { cancelable: true }));
                }
            }
        }
        // Ctrl+D to switch to dashboard
        if ((e.ctrlKey || e.metaKey) && e.key === 'd' && !e.shiftKey) {
            e.preventDefault();
            navigateTo(null, 'dashboard');
        }
    });
}

// Event listeners
