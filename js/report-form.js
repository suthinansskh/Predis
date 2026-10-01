// ฟอร์มบันทึก error: กระบวนการ, Report ID, ส่งข้อมูล, ค้นหายา, ตรวจ HAD
// โหลดเป็น classic script ตามลำดับใน JS_FILES (ดู sw.js / *.html)

// Initialize form with current date and generate report ID
function initializeForm() {
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const localDateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const localDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const tsEl = document.getElementById('timestamp');
    const eventDateEl = document.getElementById('eventDate');
    if (tsEl) tsEl.value = localDateTime;
    if (eventDateEl) eventDateEl.value = localDate;

    // Generate Report ID
    generateReportId();

    // Populate process dropdown and setup error options
    populateProcessSelect();

    // Load drug list for drug dropdowns
    loadDrugList();

    // Add search functionality to drug input fields
    setupDrugSearchInputs();

    // Set reporter name
    const reporterEl = document.getElementById('reporter');
    if (reporterEl && currentUser) {
        const reporterValue = `${currentUser.name} (${currentUser.psCode}) - ${currentUser.group}/${currentUser.level}`;
        reporterEl.value = reporterValue;
    } else if (reporterEl) {
        reporterEl.value = 'รอโหลดชื่อผู้ใช้งาน...';
    }

    // เติมค่าที่ใช้บ่อย + กู้ร่างที่ยังไม่บันทึก
    restoreReportFormState();
}

// รายการกระบวนการ (สามารถปรับแก้หรือเพิ่มได้ง่าย)
const PROCESS_OPTIONS = [
    'จัดยา',
    'ลงข้อมูล',
    'เตรียมยา',
    'คิดค่าใช้จ่าย',
    'จัดเก็บ',
    'จัดส่ง'
];

// รายการข้อผิดพลาดตามกระบวนการ
const errorOptionsByProcess = {
    'จัดยา': [
        'ไม่ติดฉลากยา', 'จัดผิดขนาด', 'จัดผิดจำนวน', 'จัดไม่ครบชนิด', 'จัดผิดชนิด', 'จัดผิดรูปแบบ', 'จัดผิดคน',
        'ลืมเตรียมยา', 'ผลิตยาไม่ทัน', 'ติดฉลกายา prepack ผิดชนิด', 'ตรวจพบยาหมดอายุในจุดจ่าย',
        'ไม่ได้หยุดยา/นำยาออก กรณีแพทย์สั่ง off ยา', 'เก็บยาผิดตำแหน่ง', 'ไม่ได้เตรียม set IV เพื่อยาเคมีบำบัด'
    ],
    'ลงข้อมูล': [
        'key ผิดขนาด', 'key ผิดจำนวน', 'key ไม่ครบชนิด', 'key ผิดชนิด', 'key ผิดรูปแบบ', 'key ผิดคน', 'key ผิดตึก', 'key ผิดวิธีใช้',
        'ลงข้อมูลก่อนเตรียมยาไม่ถูกต้อง', 'ไม่ได้ส่งการปรับปรุง order/stat', 'ไม่ได้อ่าน line ทำให้ไมไ่ด้เตรียมยา',
        'ไม่ได้ลงค่าใช้จ่ายด้านยา(ไมไ่ด้คิดค่ายาหรือเวชภัณฑ์อื่นๆ)', 'คีย์สารละลายผิดขนาด ผิดชนิด', 'ไม่ได้หยุดยา/นำยาออก กรณีแพทย์สั่ง off ยา'
    ],
    'เตรียมยา': [
        'ลืมเตรียมยา', 'ผลิตยาไม่ทัน', 'ไม่ได้เตรียม set IV เพื่อยาเคมีบำบัด', 'เตรียมยาผิดชนิด', 'เตรียมยาไม่ถูกต้อง', 'เตรียมยาไม่ครบ', 'ไม่ได้ off ยา', 'ดูดปริมาตรยาไม่ถูกต้อง'
    ],
    'คิดค่าใช้จ่าย': [
        'ไม่ได้ลงค่าใช้จ่ายด้านยา(ไมไ่ด้คิดค่ายาหรือเวชภัณฑ์อื่นๆ)', 'ไม่ได้ย้ายราคา คิดค่าใช้จ่าย', 'ไม่ได้ส่งชำระเงิน'
    ],
    'จัดเก็บ': [
        'เก็บยาผิดตำแหน่ง', 'ตรวจพบยาหมดอายุในจุดจ่าย'
    ],
    'จัดส่ง': [
        'ส่งยาผิดตึก', 'ส่งยาไม่ครบ', 'ส่งยาใส่กล่องเวลาไม่ถูกต้อง', 'ยา/สารเคมีขาด', 'order ที่ส่งเตรียมไม่ตรงกับ PharMS'
    ]
};

function populateProcessSelect() {
    const sel = document.getElementById('process');
    if (!sel) return;

    const optionsHtml = '<option value="">เลือกกระบวนการ</option>' + PROCESS_OPTIONS
        .map(p => `<option value="${p}">${p}</option>`)
        .join('');

    sel.innerHTML = optionsHtml;

    if (!sel.dataset.listenerAdded) {
        sel.addEventListener('change', function () {
            updateErrorOptions(this.value);
        });
        sel.dataset.listenerAdded = 'true';
    }
}

// อัปเดตตัวเลือกข้อผิดพลาดตามกระบวนการที่เลือก
function updateErrorOptions(selectedProcess) {
    const errorSelect = document.getElementById('errorDetail');
    if (!errorSelect) return;

    errorSelect.innerHTML = '<option value="">เลือกข้อผิดพลาด</option>';

    if (selectedProcess && errorOptionsByProcess[selectedProcess]) {
        const options = errorOptionsByProcess[selectedProcess]
            .map(error => `<option value="${error}">${error}</option>`)
            .join('');
        errorSelect.innerHTML += options;
    }
}

// Global variable to track used report IDs
// Submission control
let isSubmitting = false;
// Generate idempotency submission token
function generateSubmissionToken() {
    return 'SUB-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
}

// Generate unique report ID with duplicate prevention
function generateReportId() {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');

    // Format: PE + YYMMDD + HHMMSS + XXX (milliseconds for uniqueness)
    let reportId = `PE${year}${month}${day}${hours}${minutes}${seconds}`;

    // If this ID is already used, add milliseconds
    if (usedReportIds.has(reportId)) {
        reportId += milliseconds;
    }

    // If still duplicate (very rare), add random number
    let counter = 1;
    const baseId = reportId;
    while (usedReportIds.has(reportId)) {
        reportId = baseId + String(counter).padStart(2, '0');
        counter++;
    }

    // Store the used ID
    usedReportIds.add(reportId);

    const reportIdEl = document.getElementById('reportId');
    if (reportIdEl) {
        reportIdEl.value = reportId;
    }

    debugLog('Generated unique Report ID:', reportId);
    return reportId;
}

// Google Sheets API functions
function buildErrorPayload(data) {
    let loc = data.location;
    if (loc === 'รพ.สต.' && data.substation) {
        loc = `${loc}${data.substation}`;
    }
    return {
        sheetName: googleSheetsConfig.sheetName,
        eventDate: sanitizeForSheet(data.eventDate),
        reportId: sanitizeForSheet(data.reportId),
        submissionToken: data.submissionToken,
        shift: sanitizeForSheet(data.shift),
        errorType: sanitizeForSheet(data.errorType),
        location: sanitizeForSheet(loc),
        process: sanitizeForSheet(data.process),
        errorDetail: sanitizeForSheet(data.errorDetail),
        correctItem: sanitizeForSheet(data.correctItem),
        incorrectItem: sanitizeForSheet(data.incorrectItem),
        cause: sanitizeForSheet(data.cause),
        additionalDetails: sanitizeForSheet(data.additionalDetails || ''),
        // server ใช้ชื่อผู้รายงานจาก session — ส่งไปเพื่อความเข้ากันได้เท่านั้น
        reporter: sanitizeForSheet(data.reporter)
    };
}

// บันทึกรายงาน — throw เมื่อไม่สำเร็จ เพื่อให้ฟอร์มคงข้อมูลไว้ให้ผู้ใช้ลองใหม่
async function appendToGoogleSheet(data) {
    try {
        const result = await apiPost('append', buildErrorPayload(data));
        if (result.idempotent && result.duplicate) {
            return { success: true, message: 'บันทึกสำเร็จ (ป้องกันการบันทึกซ้ำ)' };
        }
        return result;
    } catch (error) {
        // Report ID ซ้ำ → สร้างใหม่แล้วลองอีกครั้งเดียว
        if (error.result && error.result.duplicate && error.result.reportId) {
            data.reportId = generateReportId();
            data.submissionToken = generateSubmissionToken();
            await apiPost('append', buildErrorPayload(data));
            return {
                success: true,
                message: 'บันทึกข้อมูลสำเร็จ (สร้าง Report ID ใหม่)',
                newReportId: data.reportId
            };
        }
        const wrapped = new Error(`ไม่สามารถบันทึกข้อมูลได้: ${error.message}`, { cause: error });
        wrapped.network = Boolean(error.network);
        throw wrapped;
    }
}


// Populate drug dropdowns for correct and incorrect items
function populateDrugDropdowns() {
    const correctItemList = document.getElementById('correctItemList');
    const incorrectItemList = document.getElementById('incorrectItemList');
    if (!correctItemList || !incorrectItemList) return;

    debugLog('populateDrugDropdowns called with drugListData:', drugListData?.length || 0, 'items');

    // Clear existing options
    correctItemList.innerHTML = '';
    incorrectItemList.innerHTML = '';

    if (drugListData && drugListData.length > 0) {
        // Filter only active drugs (hide inactive ones)
        const activeDrugs = drugListData.filter(drug => drug.status === 'Active');
        debugLog(`Showing only active drugs: ${activeDrugs.length} out of ${drugListData.length} total drugs`);

        // Count for information
        const inactiveDrugs = drugListData.filter(drug => drug.status === 'Inactive');
        debugLog(`Status breakdown: Active: ${activeDrugs.length}, Inactive (hidden): ${inactiveDrugs.length}`);

        activeDrugs.forEach(drug => {
            // No status indicator needed since all are active
            const displayText = drug.drugName ?
                `${drug.drugName} (${drug.drugCode})` :
                drug.drugCode;

            debugLog('Adding drug to datalist:', displayText);

            // Add to correct item datalist
            const correctOption = document.createElement('option');
            correctOption.value = displayText;
            correctItemList.appendChild(correctOption);

            // Add to incorrect item datalist
            const incorrectOption = document.createElement('option');
            incorrectOption.value = displayText;
            incorrectItemList.appendChild(incorrectOption);
        });

        debugLog(`Populated drug datalists with ${activeDrugs.length} active drugs only`);
    } else {
        console.warn('No drug list data available');
    }
}

// Setup search functionality for drug input fields
function setupDrugSearchInputs() {
    const correctItemInput = document.getElementById('correctItem');
    const incorrectItemInput = document.getElementById('incorrectItem');
    if (!correctItemInput || !incorrectItemInput) return;

    // Prevent adding duplicate listeners
    if (!correctItemInput.dataset.searchListenerAdded) {
        correctItemInput.dataset.searchListenerAdded = 'true';

        // Add input event listeners for better UX
        correctItemInput.addEventListener('input', function () {
            validateDrugInput(this);
        });
    }

    if (!incorrectItemInput.dataset.searchListenerAdded) {
        incorrectItemInput.dataset.searchListenerAdded = 'true';

        incorrectItemInput.addEventListener('input', function () {
            validateDrugInput(this);
        });
    }

    // Enhance inputs with searchable dropdowns (better UX than native datalist)
    try {
        setupSearchableDropdowns();
    } catch (e) {
        console.warn('Searchable dropdown init failed, falling back to datalist', e);
    }
}

// Validate drug input against available options
function validateDrugInput(input) {
    const value = input.value.trim();
    if (value && drugListData) {
        // Check only against active drugs
        const activeDrugs = drugListData.filter(drug => drug.status === 'Active');
        const foundDrug = activeDrugs.some(drug => {
            const displayText = drug.drugName ?
                `${drug.drugName} (${drug.drugCode})` :
                drug.drugCode;
            return displayText === value;
        });

        // Visual feedback for valid/invalid selection
        if (foundDrug) {
            input.style.borderColor = '#059669';
            input.style.backgroundColor = '#ECFDF5';
        } else {
            input.style.borderColor = '#D97706';
            input.style.backgroundColor = '#FEF3C7';
        }
    } else {
        // Reset to default style
        input.style.borderColor = '#E5E7EB';
        input.style.backgroundColor = '#FFFFFF';
    }
}

// --- Enhanced highlighting helper for dropdown autocomplete ---
function highlightMultipleMatches(text, query) {
    if (!query || !text) return text;

    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    // Try exact match first
    let index = textLower.indexOf(queryLower);
    if (index !== -1) {
        const before = text.substring(0, index);
        const match = text.substring(index, index + query.length);
        const after = text.substring(index + query.length);
        return `${escapeHtml(before)}<mark class="search-highlight">${escapeHtml(match)}</mark>${escapeHtml(after)}`;
    }

    // Fuzzy highlighting - highlight individual characters that match
    const queryChars = queryLower.split('');
    let result = '';
    let queryIndex = 0;

    for (let i = 0; i < text.length && queryIndex < queryChars.length; i++) {
        if (textLower[i] === queryChars[queryIndex]) {
            result += `<mark class="search-highlight">${escapeHtml(text[i])}</mark>`;
            queryIndex++;
        } else {
            result += escapeHtml(text[i]);
        }
    }

    // Add remaining characters
    if (queryIndex < queryChars.length) {
        // Not all characters matched, return plain text
        return escapeHtml(text);
    }

    return result;
}

// Escape HTML to prevent XSS

// Sanitize input to prevent formula injection in Google Sheets

// --- Searchable dropdown enhancement (replaces plain datalist UX) ---
function setupSearchableDropdowns() {
    const correctInput = document.getElementById('correctItem');
    const incorrectInput = document.getElementById('incorrectItem');
    if (!correctInput || !incorrectInput) return;

    // Pass a getter function so options always reflect latest drugListData
    const getOptions = () => (drugListData || [])
        .filter(d => d.status === 'Active')
        .map(drug => drug.drugName ? `${drug.drugName} (${drug.drugCode})` : drug.drugCode);

    // Initialize dropdown widgets
    makeSearchable(correctInput, getOptions);
    makeSearchable(incorrectInput, getOptions);
}

function makeSearchable(inputEl, optionsOrGetter) {
    // Track if already initialized on this element
    if (inputEl._searchableInit) {
        // If already initialized, just ensure we update the filter to reflect any new data
        if (typeof inputEl._updateFilter === 'function') {
            inputEl._updateFilter(inputEl.value);
        }
        return;
    }
    inputEl._searchableInit = true;

    // Support both static array and getter function
    const getOptions = typeof optionsOrGetter === 'function' ? optionsOrGetter : () => optionsOrGetter;

    // Remove native datalist binding to prevent double dropdown
    inputEl.removeAttribute('list');

    // Create container
    const container = document.createElement('div');
    container.className = 'searchable-dropdown-container';

    // Wrap input
    const parent = inputEl.parentNode;
    parent.replaceChild(container, inputEl);
    container.appendChild(inputEl);

    // Create list box
    const list = document.createElement('div');
    list.className = 'searchable-dropdown-list';
    list.style.display = 'none';
    container.appendChild(list);

    let filtered = [];
    let activeIndex = -1;

    function renderList() {
        list.innerHTML = '';
        if (!filtered.length) {
            const item = document.createElement('div');
            item.className = 'searchable-item empty';
            
            // Helpful message if no data exists versus no match
            const totalOptions = getOptions().length;
            if (totalOptions === 0) {
                item.innerHTML = '<i class="fas fa-sync fa-spin"></i> กำลังโหลดรายการยา หรือยังไม่มีข้อมูล...';
            } else {
                item.innerHTML = '<i class="fas fa-search"></i> ไม่พบรายการยาที่ตรงกับการค้นหา';
            }
            list.appendChild(item);
            return;
        }

        filtered.forEach((label, i) => {
            const item = document.createElement('div');
            item.className = 'searchable-item';

            // Enhanced highlighting with multiple match support
            const query = inputEl.value.trim();
            if (query) {
                item.innerHTML = highlightMultipleMatches(label, query);
            } else {
                item.textContent = label;
            }

            // Add active class for keyboard navigation
            if (i === activeIndex) {
                item.classList.add('active');
                // Scroll active item into view
                setTimeout(() => {
                    item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }, 10);
            }

            const handleSelect = function(e) {
                e.preventDefault(); // prevent blur
                selectIndex(i);
                hideList();
            };
            item.addEventListener('mousedown', handleSelect);
            item.addEventListener('touchstart', handleSelect, { passive: false });

            // Update active index on mouse enter
            item.addEventListener('mouseenter', function () {
                activeIndex = i;
                renderList();
            });

            list.appendChild(item);
        });

        // Add keyboard shortcuts hint at bottom
        if (filtered.length > 0) {
            const hint = document.createElement('div');
            hint.className = 'searchable-dropdown-hint';
            hint.innerHTML = `
                <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
                <span><kbd>Tab</kbd> Autocomplete</span>
                <span><kbd>Enter</kbd> Select</span>
                <span><kbd>Esc</kbd> Close</span>
            `;
            list.appendChild(hint);
        }
    }

    function showList() {
        list.style.display = 'block';
    }
    function hideList() {
        list.style.display = 'none';
        activeIndex = -1;
    }

    function selectIndex(i) {
        if (i < 0 || i >= filtered.length) return;
        inputEl.value = filtered[i];
        
        // Let the rest of the application know the value changed
        inputEl.dispatchEvent(new CustomEvent('input', { bubbles: true, detail: { fromMenu: true } }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        
        validateDrugInput(inputEl);
        inputEl._justSelected = true; // Prevent immediate re-opening on focus
    }

    function updateFilter(value) {
        const options = getOptions();
        const q = (value || '').toLowerCase().trim();
        
        // If the exact value is already selected and matches perfectly, don't show the list again
        if (inputEl._justSelected) {
            inputEl._justSelected = false; // Reset the flag
            hideList();
            return;
        }

        if (!q) {
            // show top 30 options when empty
            filtered = options.slice(0, 30);
        } else {
            // Advanced fuzzy matching with scoring
            const scored = options.map(option => {
                const optionLower = option.toLowerCase();
                let score = 0;

                // Extract drug code from "DrugName (DrugCode)" format
                const codeMatch = option.match(/\(([^)]+)\)$/);
                const drugCode = codeMatch ? codeMatch[1].toLowerCase() : '';

                // Exact match (highest priority)
                if (optionLower === q) {
                    score = 1000;
                }
                // Drug code exact match
                else if (drugCode === q) {
                    score = 900;
                }
                // Starts with query (very high priority)
                else if (optionLower.startsWith(q)) {
                    score = 500;
                }
                // Drug code starts with query
                else if (drugCode.startsWith(q)) {
                    score = 450;
                }
                // Word boundary match (high priority)
                else if (optionLower.includes(' ' + q) || optionLower.includes('(' + q)) {
                    score = 300;
                }
                // Contains query (medium priority)
                else if (optionLower.includes(q)) {
                    score = 200;
                }
                // Fuzzy match - all characters present in order
                else if (fuzzyMatch(q, optionLower)) {
                    score = 100;
                }
                // No match
                else {
                    return null;
                }

                // Boost score for shorter strings (more specific)
                score += Math.max(0, 50 - option.length);

                return { option, score };
            })
                .filter(item => item !== null)
                .sort((a, b) => b.score - a.score)
                .slice(0, 30)
                .map(item => item.option);

            filtered = scored;
        }
        activeIndex = -1;
        renderList();
        showList();
    }
    
    // Store update function on element for external triggers
    inputEl._updateFilter = updateFilter;

    // Fuzzy matching helper - checks if all characters in query appear in order in target
    function fuzzyMatch(query, target) {
        let queryIndex = 0;
        for (let i = 0; i < target.length && queryIndex < query.length; i++) {
            if (target[i] === query[queryIndex]) {
                queryIndex++;
            }
        }
        return queryIndex === query.length;
    }

    // Debounce timer for search performance
    let debounceTimer = null;

    inputEl.addEventListener('input', function (e) {
        if (e.detail && e.detail.fromMenu) return; // Skip if triggered from menu selection
        clearTimeout(debounceTimer);
        const self = this;
        debounceTimer = setTimeout(() => {
            updateFilter(self.value);
            validateDrugInput(self);
        }, 150);
    });

    inputEl.addEventListener('focus', function () {
        updateFilter(this.value);
    });

    inputEl.addEventListener('blur', function () {
        const val = this.value.trim().toLowerCase();
        const options = getOptions();
        const isFullMatch = options.some(opt => opt.toLowerCase() === val);
        
        // Auto-complete to the best match if they leave the field without selecting (e.g., clicking Submit)
        if (val && !isFullMatch && filtered.length > 0) {
            const indexToSelect = activeIndex >= 0 ? activeIndex : 0;
            this.value = filtered[indexToSelect];
            
            // Dispatch events so validation and HAD checks trigger properly
            this.dispatchEvent(new CustomEvent('input', { bubbles: true, detail: { fromMenu: true } }));
            this.dispatchEvent(new Event('change', { bubbles: true }));
            
            validateDrugInput(this);
            this._justSelected = true;
        }

        // small timeout to allow mousedown selection
        setTimeout(() => hideList(), 150);
    });

    inputEl.addEventListener('keydown', function (e) {
        const key = e.key;
        const isListVisible = list.style.display !== 'none';

        // Tab key for autocomplete (when list is visible and items available)
        if (key === 'Tab' && isListVisible && filtered.length > 0) {
            e.preventDefault();
            // Autocomplete with first item if no active index
            const indexToSelect = activeIndex >= 0 ? activeIndex : 0;
            selectIndex(indexToSelect);
            hideList();
            return;
        }

        if (!isListVisible) return;

        if (key === 'ArrowDown') {
            e.preventDefault();
            if (activeIndex < 0) {
                activeIndex = 0;
            } else {
                activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
            }
            renderList();
        } else if (key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            renderList();
        } else if (key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0) {
                selectIndex(activeIndex);
            } else if (filtered.length > 0) {
                // If no active item, select first one
                selectIndex(0);
            }
            hideList();
        } else if (key === 'Escape') {
            e.preventDefault();
            hideList();
        }
    });

    // initial
    updateFilter(inputEl.value);
}


// Client-side rate limiting for form submissions
let lastSubmissionTime = 0;
const MIN_SUBMISSION_INTERVAL_MS = 5000; // 5 seconds between submissions

// Form submission handler
async function handleFormSubmit(event) {
    event.preventDefault();
    if (isSubmitting) {
        console.warn('Duplicate submit prevented');
        return;
    }

    // Rate limit check
    const now = Date.now();
    if (now - lastSubmissionTime < MIN_SUBMISSION_INTERVAL_MS) {
        showNotification('กรุณารอสักครู่ก่อนส่งข้อมูลอีกครั้ง', 'warning');
        return;
    }

    isSubmitting = true;
    lastSubmissionTime = now;
    const formData = new FormData(event.target);
    const errorData = Object.fromEntries(formData.entries());

    // Validate correctItem against drug list
    if (errorData.correctItem && drugListData && drugListData.length > 0) {
        const activeDrugs = drugListData.filter(d => d.status === 'Active');
        const isValid = activeDrugs.some(drug => {
            const displayText = (drug.drugName ? `${drug.drugName} (${drug.drugCode})` : drug.drugCode).trim();
            // Case-insensitive comparison and trim whitespace
            return displayText.toLowerCase() === errorData.correctItem.trim().toLowerCase();
        });

        if (!isValid) {
            // Check if it's a perfect manual match that just needs selection
            const query = errorData.correctItem.trim().toLowerCase();
            const closest = activeDrugs.find(drug => {
                const text = (drug.drugName ? `${drug.drugName} (${drug.drugCode})` : drug.drugCode).trim().toLowerCase();
                return text === query || drug.drugCode.toLowerCase() === query;
            });

            if (closest) {
                // Auto-fix if it's a clear match
                const fixedValue = closest.drugName ? `${closest.drugName} (${closest.drugCode})` : closest.drugCode;
                document.getElementById('correctItem').value = fixedValue;
                errorData.correctItem = fixedValue;
            } else {
                showNotification('กรุณาเลือกรายการยาที่มีอยู่ในระบบเท่านั้น', 'warning');
                const correctInput = document.getElementById('correctItem');
                if (correctInput) {
                    correctInput.focus();
                    correctInput.classList.add('invalid-shake');
                    correctInput.style.borderColor = '#DC2626';
                    setTimeout(() => correctInput.classList.remove('invalid-shake'), 500);
                }
                isSubmitting = false;
                return;
            }
        }
    } else if (errorData.correctItem && (!drugListData || drugListData.length === 0)) {
        // Option fallback: Allow submission if list failed to load but data was typed
        // Or show a warning depending on business rules
        console.warn('Submitting with typed drug while list is empty');
        showNotification('คำเตือน: บันทึกโดยที่ยังไม่ได้โหลดรายการยา ข้อมูลอาจไม่สมบูรณ์', 'warning');
    }

    // Add idempotency submission token
    errorData.submissionToken = generateSubmissionToken();

    // ตรวจสอบและเพิ่มข้อมูล HAD อัตโนมัติ
    const hadInfo = await checkAndRecordHAD(errorData);
    if (hadInfo) {
        errorData.hadInvolved = hadInfo.isHAD;
        errorData.hadDrugName = hadInfo.hadDrugs.join(', ');
        errorData.hadRiskLevel = hadInfo.riskLevel;
    }

    // ใช้ eventDate ที่ผู้ใช้เลือก (ไม่ต้องรวมเวลา)
    if (errorData.eventDate) {
        // ไม่ต้องเพิ่มเวลาปัจจุบัน ใช้แค่วันที่เกิดเหตุการณ์
        // timestamp จะถูกสร้างฝั่ง server แทน
        // ลบ timestamp field ออก
        delete errorData.timestamp;
    }

    // Include substation if present
    const subEl = document.getElementById('substation');
    if (subEl && subEl.value) {
        errorData.substation = subEl.value;
    }

    // Generate a new Report ID if not already set
    if (!errorData.reportId) {
        errorData.reportId = generateReportId();
    }

    try {
        // Show loading state
        const submitBtn = event.target.querySelector('.submit-btn');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<div class="loading"></div> กำลังบันทึก...';
        submitBtn.disabled = true;

        let result;
        try {
            if (!navigator.onLine) {
                const offline = new Error('offline');
                offline.network = true;
                throw offline;
            }
            result = await appendToGoogleSheet(errorData);
        } catch (error) {
            if (!error.network) throw error;
            // ออฟไลน์/เน็ตหลุด → เก็บไว้ในเครื่องแล้วส่งอัตโนมัติ (ไม่ให้ผู้ใช้ต้องกรอกใหม่)
            queueReport(buildErrorPayload(errorData));
            saveReportPrefs(errorData);
            clearReportDraft();
            showNotification(`ไม่มีสัญญาณ — บันทึกไว้ในเครื่องแล้ว จะส่งอัตโนมัติเมื่อออนไลน์\n📝 Report ID: ${errorData.reportId}`, 'warning');
            event.target.reset();
            initializeForm();
            return;
        }

        // แสดงการแจ้งเตือนพร้อม Report ID ที่ใช้
        let successMessage = 'บันทึกข้อผิดพลาดเรียบร้อยแล้ว!';
        if (result && result.newReportId) {
            successMessage = `บันทึกข้อผิดพลาดเรียบร้อยแล้ว!\n📝 Report ID: ${result.newReportId} (สร้างใหม่เนื่องจากซ้ำ)`;
        } else {
            successMessage = `บันทึกข้อผิดพลาดเรียบร้อยแล้ว!\n📝 Report ID: ${errorData.reportId}`;
        }

        showNotification(successMessage, 'success');
        saveReportPrefs(errorData);
        clearReportDraft();
        event.target.reset();
        initializeForm();

    } catch (error) {
        console.error('Error submitting form:', error);
        showNotification(error.message, 'error');
    } finally {
        // Reset button state
        const submitBtn = event.target.querySelector('.submit-btn');
        submitBtn.innerHTML = '<i class="fas fa-save"></i> บันทึก';
        submitBtn.disabled = false;
        isSubmitting = false;
    }
}

// ===== จำค่าที่ใช้บ่อย + ร่างอัตโนมัติ =====

const REPORT_PREFS_KEY = 'predisReportPrefs';
const REPORT_DRAFT_PREFIX = 'predisReportDraft:';
const DRAFT_FIELDS = ['eventDate', 'shift', 'errorType', 'location', 'substation', 'process', 'errorDetail',
    'correctItem', 'incorrectItem', 'cause', 'additionalDetails'];
const PREF_FIELDS = ['shift', 'location', 'substation'];
let draftSaveTimer = null;

function reportDraftKey() {
    return REPORT_DRAFT_PREFIX + (currentUser ? currentUser.psCode : '');
}

function readJsonStorage(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
}

function saveReportPrefs(data) {
    const prefs = {};
    PREF_FIELDS.forEach(f => { if (data[f]) prefs[f] = data[f]; });
    try { localStorage.setItem(REPORT_PREFS_KEY, JSON.stringify(prefs)); } catch (_) { /* storage full/blocked */ }
}

function clearReportDraft() {
    clearTimeout(draftSaveTimer);
    try { localStorage.removeItem(reportDraftKey()); } catch (_) { /* ignore */ }
    const banner = document.getElementById('draftBanner');
    if (banner) banner.remove();
}


function setFieldValue(id, value) {
    const el = document.getElementById(id);
    if (!el || value === undefined || value === null || value === '') return;
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

function applyFormValues(values) {
    // process ต้องมาก่อน errorDetail (ตัวเลือกของ errorDetail ขึ้นกับ process)
    ['process', 'location'].forEach(id => setFieldValue(id, values[id]));
    Object.entries(values).forEach(([id, value]) => {
        if (id !== 'process' && id !== 'location') setFieldValue(id, value);
    });
}

function saveReportDraftSoon() {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => {
        const draft = {};
        DRAFT_FIELDS.forEach(id => {
            const el = document.getElementById(id);
            if (el && el.value) draft[id] = el.value;
        });
        // ร่างที่มีแค่ค่าเริ่มต้น (วันที่ + ค่าที่จำไว้) ไม่ต้องเก็บ
        const meaningful = Object.keys(draft).some(k => !['eventDate', ...PREF_FIELDS].includes(k));
        try {
            if (meaningful) localStorage.setItem(reportDraftKey(), JSON.stringify({ savedAt: Date.now(), values: draft }));
        } catch (_) { /* ignore */ }
    }, 800);
}

function showDraftBanner(savedAt) {
    const form = document.getElementById('errorForm');
    if (!form || document.getElementById('draftBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'draftBanner';
    banner.className = 'draft-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = `
        <span><i class="fas fa-history" aria-hidden="true"></i> กู้คืนร่างที่ยังไม่ได้บันทึก (${escapeHtml(new Date(savedAt).toLocaleString('th-TH'))})</span>
        <button type="button" class="btn btn-secondary btn-sm">ล้างร่าง</button>`;
    banner.querySelector('button').addEventListener('click', () => {
        clearReportDraft();
        form.reset();
        initializeForm();
    });
    form.prepend(banner);
}

// เรียกจาก initializeForm (หน้า report): เติมค่าที่จำไว้ แล้วกู้ร่างถ้ามี
function restoreReportFormState() {
    const form = document.getElementById('errorForm');
    if (!form) return;

    const prefs = readJsonStorage(REPORT_PREFS_KEY);
    if (prefs) applyFormValues(prefs);

    const draft = readJsonStorage(reportDraftKey());
    if (draft && draft.values) {
        applyFormValues(draft.values);
        showDraftBanner(draft.savedAt);
    }

    if (!form.dataset.draftListener) {
        form.dataset.draftListener = 'true';
        form.addEventListener('input', saveReportDraftSoon);
        form.addEventListener('change', saveReportDraftSoon);
    }
}

// ตรวจสอบและบันทึกรายการ HAD อัตโนมัติ
async function checkAndRecordHAD(errorData) {
    try {
        const hadInfo = {
            isHAD: false,
            hadDrugs: [],
            riskLevel: 'Regular'
        };

        // ดึงรายการยาที่เกี่ยวข้องจากฟิลด์ต่างๆ
        const drugFields = [
            errorData.correctItem,
            errorData.incorrectItem,
            errorData.errorDetail
        ];

        // ตรวจสอบแต่ละฟิลด์ว่ามียา HAD หรือไม่
        for (const field of drugFields) {
            if (field) {
                const hadDrugsFound = await findHADInText(field);
                if (hadDrugsFound.length > 0) {
                    hadInfo.isHAD = true;
                    hadInfo.hadDrugs.push(...hadDrugsFound);
                    hadInfo.riskLevel = 'High';
                }
            }
        }

        // ลบรายการซ้ำ
        hadInfo.hadDrugs = [...new Set(hadInfo.hadDrugs)];

        // แสดงผลใน UI
        updateHADDisplay(hadInfo);

        // แสดงการแจ้งเตือนถ้าพบ HAD
        if (hadInfo.isHAD) {
            showNotification(`⚠️ ตรวจพบ High Alert Drugs: ${hadInfo.hadDrugs.join(', ')}`, 'warning');
            debugLog('HAD Detected:', hadInfo);
        }

        return hadInfo;

    } catch (error) {
        console.error('Error checking HAD:', error);
        debugLog('GlobalDrugList sample:', globalDrugList.slice(0, 3));
        debugLog('GlobalDrugList length:', globalDrugList.length);
        return null;
    }
}

// อัปเดตการแสดงผล HAD ใน UI
function updateHADDisplay(hadInfo) {
    const hadSection = document.querySelector('.had-section');
    const hadDrugsList = document.getElementById('hadDrugsList');
    const hadRiskDisplay = document.getElementById('hadRiskLevelDisplay');
    if (!hadSection || !hadDrugsList || !hadRiskDisplay) {
        console.warn('HAD UI elements not found');
    }
    // อัปเดต hidden fields (ตรวจสอบก่อน)
    const hadInvolvedEl = document.getElementById('hadInvolved');
    if (hadInvolvedEl) hadInvolvedEl.value = hadInfo.isHAD;
    const hadDrugNameEl = document.getElementById('hadDrugName');
    if (hadDrugNameEl) hadDrugNameEl.value = hadInfo.hadDrugs.join(', ');
    const hadRiskInput = document.querySelector('input[name="hadRiskLevel"]');
    if (hadRiskInput) hadRiskInput.value = hadInfo.riskLevel;

    if (hadSection && hadDrugsList && hadRiskDisplay && hadInfo.isHAD && hadInfo.hadDrugs.length > 0) {
        // แสดง HAD section
        hadSection.style.display = 'block';

        // แสดงรายการยา HAD
        hadDrugsList.innerHTML = hadInfo.hadDrugs
            .map(drug => `<span class="had-drug-item">${escapeHtml(drug)}</span>`)
            .join('');

        // อัปเดตระดับความเสี่ยง
        hadRiskDisplay.textContent = hadInfo.riskLevel === 'High' ? 'สูง' : 'ปกติ';
        hadRiskDisplay.className = `risk-badge ${hadInfo.riskLevel === 'High' ? 'risk-high' : 'risk-regular'}`;

    } else if (hadSection && hadDrugsList) {
        hadSection.style.display = 'none';
        hadDrugsList.innerHTML = '';
    }
}

// ค้นหา HAD ในข้อความ
async function findHADInText(text) {
    if (!text || !globalDrugList.length) return [];

    const hadDrugsFound = [];
    const textLower = text.toLowerCase();

    // ตรวจสอบกับรายการยา HAD ในฐานข้อมูล
    for (const drug of globalDrugList) {
        if (drug.had === 'High') {
            // ตรวจสอบประเภทข้อมูลก่อนใช้ toLowerCase()
            const drugName = drug.drugName && typeof drug.drugName === 'string' ? drug.drugName : '';
            const drugCode = drug.drugCode && typeof drug.drugCode === 'string' ? drug.drugCode : '';

            if (!drugName && !drugCode) continue; // ข้ามถ้าไม่มีข้อมูล

            const drugNameLower = drugName.toLowerCase();
            const drugCodeLower = drugCode.toLowerCase();

            // ตรวจสอบชื่อยาและรหัสยา
            if ((drugNameLower && textLower.includes(drugNameLower)) ||
                (drugCodeLower && textLower.includes(drugCodeLower))) {
                hadDrugsFound.push(drugName || drugCode);
            }

            // ตรวจสอบส่วนของชื่อยา (เช่น Insulin, Warfarin)
            if (drugNameLower) {
                const mainDrugName = drugNameLower.split(' ')[0];
                if (mainDrugName.length > 4 && textLower.includes(mainDrugName)) {
                    hadDrugsFound.push(drugName);
                }
            }
        }
    }

    return [...new Set(hadDrugsFound)]; // ลบรายการซ้ำ
}

// ตรวจสอบ HAD แบบ real-time
async function checkHADRealtime() {
    const correctItem = document.getElementById('correctItem')?.value || '';
    const incorrectItem = document.getElementById('incorrectItem')?.value || '';
    const errorDetail = document.getElementById('errorDetail')?.value || '';

    const mockData = {
        correctItem,
        incorrectItem,
        errorDetail
    };

    const hadInfo = await checkAndRecordHAD(mockData);
    return hadInfo;
}

// Settings form handler
function handleSettingsSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    googleSheetsConfig = {
        apiKey: formData.get('apiKey'),
        spreadsheetId: formData.get('spreadsheetId'),
        sheetName: formData.get('sheetName') || 'Predispensing_Errors',
        userSheetName: formData.get('userSheetName') || 'Users',
        drugSheetName: formData.get('drugSheetName') || 'Drug_List',
        webAppUrl: formData.get('webAppUrl') || '',
        externalDrugSourceUrl: formData.get('externalDrugSourceUrl') || '',
        externalDrugSourceToken: formData.get('externalDrugSourceToken') || '',
        externalDrugSourceFormat: formData.get('externalDrugSourceFormat') || 'json',
        externalDrugDataPath: formData.get('externalDrugDataPath') || '',
        externalDrugAutoSyncMinutes: Number(formData.get('externalDrugAutoSyncMinutes') || 0)
    };

    saveConfig();
    setupExternalDrugSyncTimer();
    updateExternalSyncStatus();
    showNotification('บันทึกการตั้งค่าเรียบร้อยแล้ว!', 'success');
}
