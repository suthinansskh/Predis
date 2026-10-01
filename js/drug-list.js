// จัดการรายการยา: โหลด, ตาราง, ค้นหา, เพิ่มยา
// โหลดเป็น classic script ตามลำดับใน JS_FILES (ดู sw.js / *.html)

// Drug List Management Functions

let drugListLoadPromise = null;
let drugListLoaded = false;

function normalizeWebAppDrug(d) {
    return {
        drugCode: String(d.code || d.drugCode || ''),
        drugName: d.name || d.drugName || '',
        group: d.group || '',
        had: (d.had === 'High' || d.had === 1 || d.had === '1') ? 'High' : 'Regular',
        status: d.status ? 'Active' : 'Inactive',
        unit: d.unit || '',
        strength: d.strength || '',
        dosageForm: d.dosageForm || '',
        tmtCode: d.tmtCode || '',
        unitPrice: d.unitPrice || 0
    };
}

async function fetchDrugsFromWebApp() {
    const response = await fetch(googleSheetsConfig.webAppUrl + '?action=getDrugs', { redirect: 'follow' });
    const result = await response.json();
    if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
        throw new Error(result.error || 'ไม่มีข้อมูลยาใน Google Sheets');
    }
    return result.data.map(normalizeWebAppDrug);
}

// ไฟล์สำรองที่ deploy มากับเว็บ (ถูก cache ใน Service Worker → ใช้งานออฟไลน์ได้)
async function fetchDrugsFromLocalFile() {
    const response = await fetch('drug_list.json');
    if (!response.ok) throw new Error(`drug_list.json HTTP ${response.status}`);
    const drugs = await response.json();
    if (!Array.isArray(drugs) || drugs.length === 0) throw new Error('drug_list.json ว่างเปล่า');
    return drugs;
}

function applyLoadedDrugs(drugs) {
    drugListData = drugs;
    globalDrugList = cleanDrugData(drugs);
    drugListLoaded = true;
    hideDrugLoadError();
    renderDrugTable();
    updateDrugStats();
    setupSearchableDropdowns();
    displayHADListFromDatabase(globalDrugList);
}

/**
 * โหลดรายการยา: Google Sheets (ผ่าน Web App) → drug_list.json
 * ถ้าโหลดไม่ได้ทั้งคู่ จะแสดง error พร้อมปุ่มลองใหม่ — ไม่ใช้ข้อมูลยาตัวอย่าง
 * เพราะผู้ใช้อาจเลือกยาที่ไม่มีอยู่จริงไปบันทึกรายงาน
 * @param {{force?: boolean}} [options] force = โหลดใหม่แม้โหลดแล้ว
 */
function loadDrugList({ force = false } = {}) {
    if (drugListLoadPromise) return drugListLoadPromise;
    if (drugListLoaded && !force) return Promise.resolve(drugListData);

    drugListLoadPromise = (async () => {
        const errors = [];
        if (googleSheetsConfig.webAppUrl) {
            try {
                applyLoadedDrugs(await fetchDrugsFromWebApp());
                return drugListData;
            } catch (error) {
                errors.push(error.message);
                console.warn('Load drugs from Web App failed:', error);
            }
        }
        try {
            applyLoadedDrugs(await fetchDrugsFromLocalFile());
            showNotification(`ใช้รายการยาจากไฟล์สำรอง (${globalDrugList.length} รายการ) — อาจไม่เป็นปัจจุบัน`, 'warning');
            return drugListData;
        } catch (error) {
            errors.push(error.message);
            console.error('Load drugs from drug_list.json failed:', error);
        }
        showDrugLoadError(errors);
        return [];
    })().finally(() => { drugListLoadPromise = null; });

    return drugListLoadPromise;
}

function showDrugLoadError(errors = []) {
    const message = 'ไม่สามารถโหลดรายการยาได้ — การค้นหาและตรวจสอบยา HAD จะใช้ไม่ได้จนกว่าจะโหลดสำเร็จ';
    showNotification(message, 'error');

    const tbody = document.getElementById('drugTableBody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center">${escapeHtml(message)}</td></tr>`;
    }

    const host = document.getElementById('errorForm') || document.getElementById('druglist');
    if (!host || document.getElementById('drugLoadError')) return;
    const banner = document.createElement('div');
    banner.id = 'drugLoadError';
    banner.className = 'load-error-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
        <span><i class="fas fa-exclamation-triangle" aria-hidden="true"></i> ${escapeHtml(message)}</span>
        <button type="button" class="btn btn-secondary btn-sm"><i class="fas fa-redo" aria-hidden="true"></i> ลองใหม่</button>`;
    if (errors.length) banner.title = errors.join('\n');
    banner.querySelector('button').addEventListener('click', () => loadDrugList({ force: true }));
    host.prepend(banner);
}

function hideDrugLoadError() {
    const banner = document.getElementById('drugLoadError');
    if (banner) banner.remove();
}

// ฟังก์ชันแสดงรายการ HAD จากฐานข้อมูล
function displayHADListFromDatabase(drugList) {
    // กรองเฉพาะยา HAD
    const hadDrugs = drugList.filter(drug => drug.had === 'High' && drug.status === 'Active');

    if (hadDrugs.length === 0) {
        // อัปเดต global list เท่านั้น ไม่ต้องแจ้งเตือนใดๆ หากไม่มี HAD
        globalDrugList = drugList;
        return;
    }

    debugLog(`🎯 พบ High Alert Drugs จำนวน: ${hadDrugs.length} รายการ`);
    debugLog('');

    // จัดกลุ่มตาม group
    const groupedHAD = {};
    hadDrugs.forEach(drug => {
        if (!groupedHAD[drug.group]) {
            groupedHAD[drug.group] = [];
        }
        groupedHAD[drug.group].push(drug);
    });

    // แสดงรายการแยกตามกลุ่ม
    Object.keys(groupedHAD).forEach(group => {
        debugLog(`📂 กลุ่ม: ${group} (${groupedHAD[group].length} รายการ)`);
        groupedHAD[group].forEach((drug, index) => {
            debugLog(`   ${index + 1}. ${drug.drugCode} - ${drug.drugName}`);
        });
        debugLog('');
    });

    // แสดงสรุป
    debugLog('📊 สรุปรายการ HAD:');
    debugLog(`   - รวมทั้งหมด: ${hadDrugs.length} รายการ`);
    debugLog(`   - แยกเป็น: ${Object.keys(groupedHAD).length} กลุ่ม`);
    debugLog(`   - กลุ่มยา: ${Object.keys(groupedHAD).join(', ')}`);

    // แสดงการแจ้งเตือน
    showNotification(`🚨 พบ High Alert Drugs: ${hadDrugs.length} รายการ แยกเป็น ${Object.keys(groupedHAD).length} กลุ่ม`, 'warning');

    // อัปเดต global list สำหรับ HAD detection
    globalDrugList = drugList;

    return hadDrugs;
}

// ฟังก์ชันทำความสะอาดข้อมูลยา
function cleanDrugData(drugList) {
    if (!Array.isArray(drugList)) {
        console.warn('DrugList is not an array:', drugList);
        return [];
    }

    return drugList.map(drug => {
        // ตรวจสอบและแปลงข้อมูลให้เป็น string
        const cleanedDrug = {
            drugCode: drug.drugCode ? String(drug.drugCode).trim() : '',
            drugName: drug.drugName ? String(drug.drugName).trim() : '',
            group: drug.group ? String(drug.group).trim() : '',
            had: drug.had ? String(drug.had).trim() : 'Regular',
            status: drug.status ? String(drug.status).trim() : 'Active',
            unit: drug.unit ? String(drug.unit).trim() : '',
            strength: drug.strength ? String(drug.strength).trim() : '',
            dosageForm: drug.dosageForm ? String(drug.dosageForm).trim() : '',
            tmtCode: drug.tmtCode ? String(drug.tmtCode).trim() : '',
            unitPrice: drug.unitPrice || 0
        };

        // ตรวจสอบข้อมูลที่จำเป็น
        if (!cleanedDrug.drugCode && !cleanedDrug.drugName) {
            console.warn('Invalid drug data:', drug);
            return null;
        }

        return cleanedDrug;
    }).filter(drug => drug !== null); // ลบรายการที่ไม่ถูกต้อง
}

// ฟังก์ชันแสดงรายการ HAD สำหรับเรียกจากปุ่ม
function showHADList() {
    debugLog('🚨 === แสดงรายการ High Alert Drugs ===');

    // ใช้ข้อมูลจาก globalDrugList หรือ drugListData
    const drugList = globalDrugList.length > 0 ? globalDrugList :
        (window.drugListData && window.drugListData.length > 0 ? window.drugListData : []);

    if (drugList.length === 0) {
        debugLog('❌ ไม่มีข้อมูลยาในระบบ - กรุณาโหลดข้อมูลยาก่อน');
        showNotification('ไม่มีข้อมูลยาในระบบ กรุณาโหลดรายการยาก่อน', 'warning');
        return;
    }

    displayHADListFromDatabase(drugList);
}


function renderDrugTable() {
    const tbody = document.getElementById('drugTableBody');
    if (!tbody) return;

    if (drugListData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">ไม่มีรายการยา</td></tr>';
        return;
    }

    let filteredData = drugListData;

    // Apply filters
    const searchTerm = document.getElementById('searchDrug')?.value.toLowerCase() || '';
    const groupFilter = document.getElementById('filterGroup')?.value || '';
    const hadFilter = document.getElementById('filterHAD')?.value || '';

    if (searchTerm) {
        filteredData = filteredData.filter(drug =>
            drug.drugCode.toLowerCase().includes(searchTerm) ||
            drug.drugName.toLowerCase().includes(searchTerm)
        );
    }

    if (groupFilter) {
        filteredData = filteredData.filter(drug => drug.group === groupFilter);
    }

    if (hadFilter) {
        filteredData = filteredData.filter(drug => drug.had === hadFilter);
    }

    tbody.innerHTML = filteredData.map(drug => {
        const canManage = hasRole('admin', 'supervisor', 'pharmacist');
        const safeDrugCode = escapeHtml(drug.drugCode);
        return `
        <tr>
            <td><strong>${safeDrugCode}</strong></td>
            <td>${escapeHtml(drug.drugName)}</td>
            <td><span class="tag">${escapeHtml(drug.group)}</span></td>
            <td>
                <span class="tag ${drug.had === 'High' ? 'tag-danger' : 'tag-info'}">
                    ${escapeHtml(drug.had)}
                </span>
            </td>
            <td>
                <span class="tag ${getStatusTagClass(drug.status)}">
                    ${escapeHtml(drug.status)}
                </span>
            </td>
            <td>${escapeHtml(drug.strength || '-')}</td>
            <td>${escapeHtml(drug.dosageForm || '-')}</td>
            <td>${escapeHtml(drug.unit || '-')}</td>
            <td>
                ${canManage ? `
                <button class="btn btn-sm btn-secondary" onclick="editDrug('${safeDrugCode}')" title="แก้ไข HAD / สถานะ" aria-label="แก้ไขยา ${safeDrugCode}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteDrug('${safeDrugCode}')" title="ปิดใช้งาน" aria-label="ปิดใช้งานยา ${safeDrugCode}">
                    <i class="fas fa-ban"></i>
                </button>` : '<span class="text-muted">-</span>'}
            </td>
        </tr>
    `}).join('');

}

function getStatusTagClass(status) {
    switch (status) {
        case 'Active': return 'tag-success';
        case 'Inactive': return 'tag-warning';
        case 'Discontinued': return 'tag-danger';
        default: return 'tag-secondary';
    }
}

function updateDrugStats() {
    const total = drugListData.length;
    const hadDrugs = drugListData.filter(drug => drug.had === 'High').length;
    const activeDrugs = drugListData.filter(drug => drug.status === 'Active').length;
    const inactiveDrugs = drugListData.filter(drug => drug.status !== 'Active').length;

    const el = (id) => document.getElementById(id);
    if (el('totalDrugs')) el('totalDrugs').textContent = total;
    if (el('hadDrugs')) el('hadDrugs').textContent = hadDrugs;
    if (el('activeDrugs')) el('activeDrugs').textContent = activeDrugs;
    if (el('inactiveDrugs')) el('inactiveDrugs').textContent = inactiveDrugs;
}

function filterDrugs() {
    renderDrugTable();
}

// Modern fuzzy search with intelligent scoring
function filterDrugsModern() {
    const tbody = document.getElementById('drugTableBody');
    const searchTerm = document.getElementById('searchDrug')?.value.trim() || '';
    const groupFilter = document.getElementById('filterGroup')?.value || '';
    const hadFilter = document.getElementById('filterHAD')?.value || '';
    const statusFilter = document.getElementById('filterStatus')?.value || '';
    const clearBtn = document.getElementById('clearSearchBtn');
    const resetBtn = document.getElementById('resetFiltersBtn');

    // Show/hide clear button
    if (clearBtn) {
        clearBtn.style.display = searchTerm ? 'flex' : 'none';
    }

    // Check if any filters are active
    const hasActiveFilters = searchTerm || groupFilter || hadFilter || statusFilter;
    if (resetBtn) {
        resetBtn.style.display = hasActiveFilters ? 'inline-flex' : 'none';
    }

    if (drugListData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">ไม่มีรายการยา</td></tr>';
        updateResultCount(0);
        return;
    }

    let filteredData = drugListData;

    // Apply category filters first
    if (groupFilter) {
        filteredData = filteredData.filter(drug => drug.group === groupFilter);
    }
    if (hadFilter) {
        filteredData = filteredData.filter(drug => drug.had === hadFilter);
    }
    if (statusFilter) {
        filteredData = filteredData.filter(drug => drug.status === statusFilter);
    }

    // Apply fuzzy search if search term exists
    if (searchTerm) {
        const q = searchTerm.toLowerCase();

        const scored = filteredData.map(drug => {
            const codeLower = (drug.drugCode || '').toLowerCase();
            const nameLower = (drug.drugName || '').toLowerCase();
            const combinedText = `${codeLower} ${nameLower}`;
            let score = 0;

            // Exact match (highest priority)
            if (codeLower === q || nameLower === q) {
                score = 10000;
            }
            // Code starts with query
            else if (codeLower.startsWith(q)) {
                score = 5000;
            }
            // Name starts with query
            else if (nameLower.startsWith(q)) {
                score = 4500;
            }
            // Word boundary match in name
            else if (nameLower.includes(' ' + q) || nameLower.includes('(' + q)) {
                score = 3000;
            }
            // Contains in code
            else if (codeLower.includes(q)) {
                score = 2000;
            }
            // Contains in name
            else if (nameLower.includes(q)) {
                score = 1500;
            }
            // Fuzzy match
            else if (fuzzyMatchDrug(q, combinedText)) {
                score = 500;
            }
            // No match
            else {
                return null;
            }

            // Bonus for exact length match
            if (codeLower.length === q.length || nameLower.length === q.length) {
                score += 1000;
            }

            // Bonus for shorter results (more specific)
            score += Math.max(0, 100 - combinedText.length);

            return { drug, score };
        })
            .filter(item => item !== null)
            .sort((a, b) => b.score - a.score)
            .map(item => item.drug);

        filteredData = scored;
    }

    // Render results
    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding: 40px;"><i class="fas fa-search" style="font-size: 48px; color: #ddd; display: block; margin-bottom: 10px;"></i><div style="color: #999;">ไม่พบรายการยาที่ตรงกับการค้นหา</div></td></tr>';
    } else {
        tbody.innerHTML = filteredData.map(drug => {
            // Highlight search term in results
            let displayCode = drug.drugCode;
            let displayName = drug.drugName;

            if (searchTerm) {
                displayCode = highlightText(drug.drugCode, searchTerm);
                displayName = highlightText(drug.drugName, searchTerm);
            }

            const safeDrugCode = escapeHtml(drug.drugCode);
            return `
                <tr class="drug-row">
                    <td><strong>${displayCode}</strong></td>
                    <td>${displayName}</td>
                    <td><span class="tag">${escapeHtml(drug.group)}</span></td>
                    <td>
                        <span class="tag ${drug.had === 'High' ? 'tag-danger' : 'tag-info'}">
                            ${escapeHtml(drug.had)}
                        </span>
                    </td>
                    <td>
                        <span class="tag ${getStatusTagClass(drug.status)}">
                            ${escapeHtml(drug.status)}
                        </span>
                    </td>
                    <td>
                        ${hasRole('admin', 'supervisor', 'pharmacist') ? `
                        <button class="btn btn-sm btn-secondary" onclick="editDrug('${safeDrugCode}')" title="แก้ไข HAD / สถานะ" aria-label="แก้ไขยา ${safeDrugCode}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteDrug('${safeDrugCode}')" title="ปิดใช้งาน" aria-label="ปิดใช้งานยา ${safeDrugCode}">
                            <i class="fas fa-ban"></i>
                        </button>` : '<span class="text-muted">-</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    updateResultCount(filteredData.length);
}

// Fuzzy matching helper for drug search
function fuzzyMatchDrug(query, target) {
    let queryIndex = 0;
    for (let i = 0; i < target.length && queryIndex < query.length; i++) {
        if (target[i] === query[queryIndex]) {
            queryIndex++;
        }
    }
    return queryIndex === query.length;
}

// Highlight matching text
function highlightText(text, search) {
    if (!search || !text) return text;

    const regex = new RegExp(`(${escapeRegex(search)})`, 'gi');
    return text.replace(regex, '<mark class="search-highlight">$1</mark>');
}

// Escape special regex characters
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Update result count display
function updateResultCount(count) {
    const resultCountEl = document.getElementById('resultCount');
    if (resultCountEl) {
        resultCountEl.innerHTML = `<i class="fas fa-list"></i> แสดง <strong>${count}</strong> รายการจากทั้งหมด <strong>${drugListData.length}</strong> รายการ`;
    }
}

// Clear search input
function clearDrugSearch() {
    const searchInput = document.getElementById('searchDrug');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
        filterDrugsModern();
    }
}

// Reset all filters
function resetDrugFilters() {
    document.getElementById('searchDrug').value = '';
    document.getElementById('filterGroup').value = '';
    document.getElementById('filterHAD').value = '';
    document.getElementById('filterStatus').value = '';
    filterDrugsModern();
}

// ช่องที่มาจาก HOSxP — แก้ในแอปไม่ได้ (จะถูก sync ทับ) ในโหมดแก้ไขจึงปิดไว้
const DRUG_SOURCE_FIELDS = ['drugName', 'drugGroup', 'drugUnit', 'drugStrength', 'drugDosageForm', 'drugTmtCode', 'drugUnitPrice'];

function setDrugFormMode(mode) {
    const form = document.getElementById('drugForm');
    if (!form) return;
    const editing = mode === 'edit';
    form.dataset.mode = mode;

    document.getElementById('drugCode').readOnly = editing;
    DRUG_SOURCE_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = editing;
    });

    document.querySelector('#addDrugForm h3').textContent = editing ? 'แก้ไข HAD / สถานะยา' : 'เพิ่มรายการยาใหม่';
    document.querySelector('#drugForm button[type="submit"]').innerHTML = editing
        ? '<i class="fas fa-save"></i> บันทึกการแก้ไข'
        : '<i class="fas fa-plus"></i> เพิ่มยา';

    let note = document.getElementById('drugEditNote');
    if (editing && !note) {
        note = document.createElement('p');
        note.id = 'drugEditNote';
        note.className = 'password-dialog-note';
        note.textContent = 'แก้ได้เฉพาะสถานะ HAD และสถานะการใช้งาน — ข้อมูลอื่นมาจาก HOSxP ค่าที่แก้จะคงอยู่แม้ sync รายการยาใหม่';
        form.prepend(note);
    } else if (!editing && note) {
        note.remove();
    }
}

function showAddDrugForm() {
    if (!hasRole('admin', 'supervisor', 'pharmacist')) {
        showNotification('คุณไม่มีสิทธิ์จัดการรายการยา (ต้องเป็นเภสัชกรขึ้นไป)', 'warning');
        return;
    }
    if (document.getElementById('drugForm').dataset.mode !== 'edit') setDrugFormMode('add');
    document.getElementById('addDrugForm').style.display = 'block';
    document.getElementById('addDrugForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const first = document.getElementById('drugForm').dataset.mode === 'edit' ? 'hadStatus' : 'drugCode';
    document.getElementById(first).focus();
}

function hideAddDrugForm() {
    document.getElementById('addDrugForm').style.display = 'none';
    document.getElementById('drugForm').reset();
    setDrugFormMode('add');
}

// อัปเดตยาในข้อมูลที่โหลดไว้ แล้ววาดตาราง/สถิติ/รายการ HAD ใหม่
function applyLocalDrugChange(drugCode, changes) {
    [drugListData, globalDrugList].forEach(list => {
        const drug = (list || []).find(d => String(d.drugCode) === String(drugCode));
        if (drug) Object.assign(drug, changes);
    });
    renderDrugTable();
    updateDrugStats();
    displayHADListFromDatabase(globalDrugList);
}

async function submitDrugUpdate(drugCode, changes) {
    await apiPost('updateDrug', { drugCode, ...changes });
    applyLocalDrugChange(drugCode, changes);
}

async function handleDrugFormSubmit(event) {
    event.preventDefault();

    if (event.target.dataset.mode === 'edit') {
        const drugCode = document.getElementById('drugCode').value;
        const had = document.getElementById('hadStatus').value;
        // ฟอร์มมี "ยกเลิก (Discontinued)" — ฝั่ง server เก็บเป็น Inactive
        const status = document.getElementById('drugStatus').value === 'Active' ? 'Active' : 'Inactive';
        try {
            await submitDrugUpdate(drugCode, { had, status });
            showNotification(`บันทึกการแก้ไขยา ${drugCode} แล้ว (HAD: ${had === 'High' ? 'High Alert' : 'ยาทั่วไป'})`, 'success');
            hideAddDrugForm();
        } catch (error) {
            showNotification('แก้ไขยาไม่สำเร็จ: ' + error.message, 'error');
        }
        return;
    }

    const formData = new FormData(event.target);
    const drugData = {
        action: 'addDrug',
        drugCode: formData.get('drugCode'),
        drugName: formData.get('drugName'),
        group: formData.get('drugGroup'),
        had: formData.get('hadStatus'),
        status: formData.get('drugStatus'),
        unit: formData.get('drugUnit') || '',
        strength: formData.get('drugStrength') || '',
        dosageForm: formData.get('drugDosageForm') || '',
        tmtCode: formData.get('drugTmtCode') || '',
        unitPrice: parseFloat(formData.get('drugUnitPrice')) || 0
    };

    try {
        if (!googleSheetsConfig.webAppUrl) {
            // Demo Mode: จำลองการเพิ่มยาใหม่
            debugLog('Demo Mode: เพิ่มยาใหม่', drugData);

            // Check for duplicate in demo data
            if (globalDrugList.some(drug => drug.drugCode === drugData.drugCode)) {
                showNotification('รหัสยาซ้ำ: ' + drugData.drugCode + ' มีอยู่ในระบบแล้ว (โหมดทดสอบ)', 'error');
                return;
            }

            // Add to demo data
            globalDrugList.push({
                drugCode: drugData.drugCode,
                drugName: drugData.drugName,
                group: drugData.group,
                had: drugData.had,
                status: drugData.status,
                unit: drugData.unit,
                strength: drugData.strength,
                dosageForm: drugData.dosageForm,
                tmtCode: drugData.tmtCode,
                unitPrice: drugData.unitPrice
            });

            showNotification('✅ เพิ่มรายการยาเรียบร้อย (โหมดทดสอบ)', 'success');
            hideAddDrugForm();
            setupDrugSearchInputs(); // Refresh drug search
            return;
        }

        // Check for duplicate drug code locally first
        if (drugListData.some(drug => drug.drugCode === drugData.drugCode)) {
            showNotification('รหัสยาซ้ำ: ' + drugData.drugCode + ' มีอยู่ในระบบแล้ว', 'error');
            return;
        }

        const { action, ...fields } = drugData;
        await apiPost(action, fields);

        showNotification('เพิ่มรายการยาเรียบร้อย', 'success');
        hideAddDrugForm();
        drugListData.push(fields);
        renderDrugTable();
        updateDrugStats();

    } catch (error) {
        console.error('Error adding drug:', error);
        showNotification('เกิดข้อผิดพลาดในการเพิ่มรายการยา: ' + error.message, 'error');
    }
}

function editDrug(drugCode) {
    const drug = drugListData.find(d => String(d.drugCode) === String(drugCode));
    if (!drug) return;

    setDrugFormMode('edit');
    document.getElementById('drugCode').value = drug.drugCode;
    document.getElementById('drugName').value = drug.drugName;
    document.getElementById('hadStatus').value = drug.had === 'High' ? 'High' : 'Regular';
    document.getElementById('drugStatus').value = drug.status === 'Active' ? 'Active' : 'Inactive';
    showAddDrugForm();
}

// ลบยาจริงไม่ได้ (รายการมาจาก HOSxP) — ปิดใช้งานแทน ซึ่งบันทึกที่ server และคงอยู่หลัง sync
async function deleteDrug(drugCode) {
    if (!hasRole('admin', 'supervisor', 'pharmacist')) return;
    const drug = drugListData.find(d => String(d.drugCode) === String(drugCode));
    const label = drug ? `${drug.drugName} (${drugCode})` : drugCode;
    if (!confirm(`ปิดใช้งานยา ${label}?\nยาจะไม่แสดงในฟอร์มบันทึกรายงาน (เปิดใช้งานคืนได้จากปุ่มแก้ไข)`)) return;
    try {
        await submitDrugUpdate(drugCode, { status: 'Inactive' });
        showNotification(`ปิดใช้งานยา ${drugCode} แล้ว`, 'success');
    } catch (error) {
        showNotification('ปิดใช้งานยาไม่สำเร็จ: ' + error.message, 'error');
    }
}
