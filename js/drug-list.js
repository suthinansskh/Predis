// จัดการรายการยา: โหลด, ตาราง, ค้นหา, เพิ่มยา
// โหลดเป็น classic script ตามลำดับใน JS_FILES (ดู sw.js / *.html)

// Drug List Management Functions
async function loadDrugList() {
    try {
        let loadedFromSheet = false;

        // 1. Try loading from Google Sheets API first (Highest Priority)
        if (googleSheetsConfig.webAppUrl) {
            try {
                const drugUrl = googleSheetsConfig.webAppUrl + '?action=getDrugs';
                const response = await fetch(drugUrl, { redirect: 'follow' });
                const result = await response.json();

                if (result.success) {
                    drugListData = result.data || [];

                    // Map from getDrugs format to standard format
                    drugListData = drugListData.map(d => ({
                        drugCode: d.code || d.drugCode || '',
                        drugName: d.name || d.drugName || '',
                        group: d.group || '',
                        had: (d.had === 'High' || d.had === 1 || d.had === '1') ? 'High' : 'Regular',
                        status: d.status ? 'Active' : 'Inactive',
                        unit: d.unit || '',
                        strength: d.strength || '',
                        dosageForm: d.dosageForm || '',
                        tmtCode: d.tmtCode || '',
                        unitPrice: d.unitPrice || 0
                    }));

                    // ทำความสะอาดและอัปเดต globalDrugList
                    globalDrugList = cleanDrugData(drugListData);

                    renderDrugTable();
                    updateDrugStats();
                    setupSearchableDropdowns();
                    showNotification(`โหลดรายการยาจาก Google Sheets สำเร็จ (${result.count} รายการ)`, 'success');

                    // แสดงรายการ HAD จากฐานข้อมูล
                    displayHADListFromDatabase(globalDrugList);

                    loadedFromSheet = true;
                    return;
                } else {
                    console.warn('Web App returned error for getDrugs:', result.error);
                }
            } catch (webAppError) {
                console.log('Web App failed, trying fallback sources:', webAppError);
                
                // Try form submission fallback
                try {
                    const success = await loadDrugListViaForm();
                    if (success) {
                        showNotification('โหลดรายการยาเรียบร้อย (ผ่าน form)', 'success');
                        return;
                    }
                } catch (formError) {
                    console.log('Form submission also failed:', formError);
                }

                // If both methods fail, try Google Sheets API
                console.log('Form submission failed, trying Google Sheets API fallback');
                try {
                    return await loadDrugListFromAPI();
                } catch (apiError) {
                    console.log('API also failed', apiError);
                }
            }
        }

        // 2. Fallback: Try loading from local drug_list.json
        if (!loadedFromSheet) {
            try {
                const response = await fetch('drug_list.json');
                if (response.ok) {
                    const drugs = await response.json();
                    if (Array.isArray(drugs) && drugs.length > 0) {
                        drugListData = drugs;
                        globalDrugList = cleanDrugData(drugs);
                        setupDrugSearchInputs();
                        renderDrugTable();
                        updateDrugStats();
                        displayHADListFromDatabase(globalDrugList);
                        showNotification(`โหลดรายการยาจากไฟล์สำรองท้องถิ่น (${globalDrugList.length} รายการ)`, 'info');
                        console.log(`โหลดรายการยาจาก drug_list.json: ${globalDrugList.length} รายการ`);
                        return;
                    }
                }
            } catch (jsonError) {
                console.log('drug_list.json not available, trying other sources:', jsonError.message);
            }
        }

        // 3. Last Resort: Demo Mode
        if (!googleSheetsConfig.webAppUrl || !loadedFromSheet) {
            console.log('Demo Mode: ใช้ข้อมูลยาตัวอย่าง');
            createSampleDrugData();
            return drugListData;
        }

    } catch (error) {
        console.error('Error loading drug list:', error);
        showNotification('ไม่สามารถโหลดรายการยาได้ - ใช้ข้อมูลตัวอย่าง', 'warning');

        // Use sample data as final fallback
        createSampleDrugData();
    }
}

// Fallback: Load drug list using Google Sheets API
async function loadDrugListFromAPI() {
    try {
        if (!googleSheetsConfig.apiKey || !googleSheetsConfig.spreadsheetId) {
            showNotification('กรุณาตั้งค่า API Key และ Spreadsheet ID ก่อน', 'error');
            return;
        }

        console.log('Loading drug list from API with drugSheetName:', googleSheetsConfig.drugSheetName);
        const range = `${googleSheetsConfig.drugSheetName}!A:J`;
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${googleSheetsConfig.spreadsheetId}/values/${range}?key=${googleSheetsConfig.apiKey}`;

        console.log('API URL:', url);
        const response = await fetch(url);
        const data = await response.json();

        console.log('API Response:', data);

        if (data.error) {
            console.error('API Error:', data.error);
            // If sheet doesn't exist, create empty drug list
            drugListData = [];
            renderDrugTable();
            updateDrugStats();
            showNotification(`ไม่พบ sheet "${googleSheetsConfig.drugSheetName}" หรือเกิดข้อผิดพลาด: ${data.error.message}`, 'error');
            return;
        }

        if (data.values && data.values.length > 1) {
            // Skip header row and convert data format to match your sheet structure
            drugListData = data.values.slice(1).map((row, index) => {
                const drug = {
                    drugCode: row[0] || '',
                    drugName: row[1] || '',
                    group: row[2] || '',
                    had: row[3] == 1 || row[3] === 'High' || row[3] === 'HIGH' || row[3] === 'H' ? 'High' : 'Regular',
                    // More flexible status checking - default to Active if empty or unclear
                    status: (row[4] === '' || row[4] === null || row[4] === undefined ||
                        row[4] == 1 || row[4] === 'Active' || row[4] === 'ACTIVE' ||
                        row[4] === 'A' || row[4] === 'YES' || row[4] === 'Y' ||
                        row[4] === true || row[4] === 'TRUE') ? 'Active' : 'Inactive',
                    unit: row[5] || '',
                    strength: row[6] || '',
                    dosageForm: row[7] || '',
                    tmtCode: row[8] || '',
                    unitPrice: row[9] || 0
                };

                // Debug log first few drugs
                if (index < 3) {
                    console.log(`Drug ${index + 1}:`, drug, 'Raw row:', row);
                }

                return drug;
            });

            console.log(`Loaded ${drugListData.length} drugs from API`);
            console.log('Sample drugs:', drugListData.slice(0, 3));

            // Count active drugs for debugging
            const activeDrugs = drugListData.filter(drug => drug.status === 'Active');
            console.log(`Active drugs found: ${activeDrugs.length}`);
            console.log('Active drugs sample:', activeDrugs.slice(0, 3));

            // If no active drugs found, mark first 10 as active for demo
            if (activeDrugs.length === 0 && drugListData.length > 0) {
                console.log('No active drugs found, marking first 10 as Active for demo');
                drugListData.slice(0, 10).forEach(drug => {
                    drug.status = 'Active';
                });
                const newActiveDrugs = drugListData.filter(drug => drug.status === 'Active');
                console.log(`Updated: ${newActiveDrugs.length} drugs marked as Active`);
            }
        } else {
            drugListData = [];
            console.log('No drug data found in sheet');
        }

        // ทำความสะอาดและอัปเดต globalDrugList
        globalDrugList = cleanDrugData(drugListData);

        renderDrugTable();
        updateDrugStats();
        setupSearchableDropdowns();

        // แสดงรายการ HAD จากฐานข้อมูล
        displayHADListFromDatabase(globalDrugList);

        showNotification(`โหลดรายการยาเรียบร้อย (ผ่าน API) - ${drugListData.length} รายการ`, 'success');

    } catch (error) {
        console.error('Error loading drug list from API:', error);
        showNotification('เกิดข้อผิดพลาดในการโหลดรายการยาจาก API: ' + error.message, 'error');

        // Create sample drug data as fallback
        createSampleDrugData();
    }
}

// Create sample drug data when API fails
function createSampleDrugData() {
    console.log('Creating sample drug data...');
    drugListData = [
        { drugCode: 'PARA500', drugName: 'Paracetamol 500mg', group: 'Analgesic', had: 'Regular', status: 'Active' },
        { drugCode: 'AMOX250', drugName: 'Amoxicillin 250mg', group: 'Antibiotic', had: 'Regular', status: 'Active' },
        { drugCode: 'METRO400', drugName: 'Metronidazole 400mg', group: 'Antibiotic', had: 'Regular', status: 'Active' },
        { drugCode: 'PRED5', drugName: 'Prednisolone 5mg', group: 'Steroid', had: 'High', status: 'Active' },
        { drugCode: 'DEXA4', drugName: 'Dexamethasone 4mg', group: 'Steroid', had: 'High', status: 'Active' },
        { drugCode: 'INSU100', drugName: 'Insulin 100IU/ml', group: 'Hormone', had: 'High', status: 'Active' },
        { drugCode: 'MORPH10', drugName: 'Morphine 10mg', group: 'Narcotic', had: 'High', status: 'Active' },
        { drugCode: 'METRO200', drugName: 'Metronidazole 200mg', group: 'Antibiotic', had: 'Regular', status: 'Inactive' }
    ];

    console.log('Sample drug data created:', drugListData.length, 'items');

    // ทำความสะอาดและอัปเดต globalDrugList
    globalDrugList = cleanDrugData(drugListData);

    renderDrugTable();
    updateDrugStats();
    setupSearchableDropdowns();

    // แสดงรายการ HAD จากข้อมูลตัวอย่าง
    displayHADListFromDatabase(globalDrugList);

    showNotification('ใช้ข้อมูลตัวอย่าง - กรุณาตั้งค่า API หรือ Apps Script ให้ถูกต้อง', 'info');
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

    console.log(`🎯 พบ High Alert Drugs จำนวน: ${hadDrugs.length} รายการ`);
    console.log('');

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
        console.log(`📂 กลุ่ม: ${group} (${groupedHAD[group].length} รายการ)`);
        groupedHAD[group].forEach((drug, index) => {
            console.log(`   ${index + 1}. ${drug.drugCode} - ${drug.drugName}`);
        });
        console.log('');
    });

    // แสดงสรุป
    console.log('📊 สรุปรายการ HAD:');
    console.log(`   - รวมทั้งหมด: ${hadDrugs.length} รายการ`);
    console.log(`   - แยกเป็น: ${Object.keys(groupedHAD).length} กลุ่ม`);
    console.log(`   - กลุ่มยา: ${Object.keys(groupedHAD).join(', ')}`);

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
    console.log('🚨 === แสดงรายการ High Alert Drugs ===');

    // ใช้ข้อมูลจาก globalDrugList หรือ drugListData
    const drugList = globalDrugList.length > 0 ? globalDrugList :
        (window.drugListData && window.drugListData.length > 0 ? window.drugListData : []);

    if (drugList.length === 0) {
        console.log('❌ ไม่มีข้อมูลยาในระบบ - กรุณาโหลดข้อมูลยาก่อน');
        showNotification('ไม่มีข้อมูลยาในระบบ กรุณาโหลดรายการยาก่อน', 'warning');
        return;
    }

    displayHADListFromDatabase(drugList);
}

// Form submission fallback for loading drug list
async function loadDrugListViaForm() {
    // This approach is unreliable and has security concerns with popups
    // Return false to fall through to API method
    return false;
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
                <button class="btn btn-sm btn-secondary" onclick="editDrug('${safeDrugCode}')" title="แก้ไข">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteDrug('${safeDrugCode}')" title="ลบ">
                    <i class="fas fa-trash"></i>
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
                        <button class="btn btn-sm btn-secondary" onclick="editDrug('${safeDrugCode}')" title="แก้ไข">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteDrug('${safeDrugCode}')" title="ลบ">
                            <i class="fas fa-trash"></i>
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

function showAddDrugForm() {
    if (!hasRole('admin', 'supervisor', 'pharmacist')) {
        showNotification('คุณไม่มีสิทธิ์เพิ่มรายการยา (ต้องเป็นเภสัชกรขึ้นไป)', 'warning');
        return;
    }
    document.getElementById('addDrugForm').style.display = 'block';
    document.getElementById('drugCode').focus();
}

function hideAddDrugForm() {
    document.getElementById('addDrugForm').style.display = 'none';
    document.getElementById('drugForm').reset();
}

async function handleDrugFormSubmit(event) {
    event.preventDefault();

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
            console.log('Demo Mode: เพิ่มยาใหม่', drugData);

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
    const drug = drugListData.find(d => d.drugCode === drugCode);
    if (drug) {
        // Populate form with existing data
        document.getElementById('drugCode').value = drug.drugCode;
        document.getElementById('drugName').value = drug.drugName;
        document.getElementById('drugGroup').value = drug.group;
        document.getElementById('hadStatus').value = drug.had;
        document.getElementById('drugStatus').value = drug.status;

        // Make drug code readonly for editing
        document.getElementById('drugCode').readOnly = true;

        showAddDrugForm();

        // Change form title and button text
        document.querySelector('#addDrugForm h3').textContent = 'แก้ไขรายการยา';
        document.querySelector('#drugForm button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> อัปเดตยา';

        showNotification('กรุณาแก้ไขข้อมูลและบันทึก', 'info');
    }
}

function deleteDrug(drugCode) {
    if (confirm('คุณต้องการลบรายการยา ' + drugCode + ' หรือไม่?')) {
        // Remove from local data
        drugListData = drugListData.filter(drug => drug.drugCode !== drugCode);
        renderDrugTable();
        updateDrugStats();
        showNotification('ลบรายการยาเรียบร้อย', 'success');

        // Note: Real deletion would require updating Google Sheets
        // For now, we only remove from local display
    }
}
