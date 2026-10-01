// Sync รายการยาจากฐานข้อมูลภายนอก
// โหลดเป็น classic script ตามลำดับใน JS_FILES (ดู sw.js / *.html)

// Utility functions
function generateSampleData() {
    const sampleErrors = [
        {
            timestamp: new Date().toISOString().slice(0, 16),
            reporterId: 'PHARM001',
            patientId: 'PAT12345',
            medicationName: 'Metformin',
            prescribedDose: '500mg twice daily',
            actualDose: '1000mg once daily',
            errorType: 'Wrong Dose',
            severity: 'Medium',
            causeCategory: 'Human Error',
            description: 'Misread prescription, prepared double dose in single administration',
            actionsTaken: 'Corrected dose, informed physician, monitored patient',
            preventiveMeasures: 'Double-check high-risk medications, implement barcode scanning'
        }
    ];

    return sampleErrors;
}

function getNestedValue(obj, path) {
    if (!path || !obj || typeof obj !== 'object') return obj;
    return path.split('.').reduce((acc, part) => {
        if (acc && typeof acc === 'object' && part in acc) {
            return acc[part];
        }
        return undefined;
    }, obj);
}

function toDrugHadValue(value) {
    const normalized = String(value == null ? '' : value).trim().toLowerCase();
    if (!normalized) return 'Regular';
    return ['1', 'high', 'h', 'had', 'yes', 'true', 'y'].includes(normalized) ? 'High' : 'Regular';
}

function toDrugStatusValue(value) {
    const normalized = String(value == null ? '' : value).trim().toLowerCase();
    if (!normalized) return 'Active';
    if (['0', 'inactive', 'i', 'false', 'no', 'n', 'discontinued'].includes(normalized)) {
        return normalized === 'discontinued' ? 'Discontinued' : 'Inactive';
    }
    return 'Active';
}

function normalizeExternalDrugItem(item) {
    if (!item || typeof item !== 'object') return null;
    const drugCode = String(item.drugCode || item.code || item.drug_code || item.itemCode || '').trim();
    const drugName = String(item.drugName || item.name || item.drug_name || item.itemName || '').trim();
    if (!drugCode && !drugName) return null;

    return {
        drugCode,
        drugName,
        group: String(item.group || item.drugGroup || item.category || item.type || 'Other').trim(),
        had: toDrugHadValue(item.had || item.isHad || item.highAlert),
        status: toDrugStatusValue(item.status || item.active)
    };
}

function parseCsvExternalDrugData(csvText) {
    const text = String(csvText || '').replace(/^\uFEFF/, '');
    if (!text.trim()) return [];

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];

        if (inQuotes) {
            if (ch === '"' && next === '"') {
                field += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                field += ch;
            }
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && next === '\n') i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += ch;
        }
    }

    row.push(field);
    rows.push(row);

    const nonEmptyRows = rows.filter(r => r.some(cell => String(cell || '').trim() !== ''));
    if (nonEmptyRows.length < 2) return [];

    const headers = nonEmptyRows[0].map(h => String(h || '').trim());
    return nonEmptyRows.slice(1).map(cells => {
        const obj = {};
        headers.forEach((header, idx) => {
            obj[header] = String(cells[idx] || '').trim();
        });
        return obj;
    });
}

async function fetchExternalDrugRows() {
    const sourceUrl = (googleSheetsConfig.externalDrugSourceUrl || '').trim();
    const sourceFormat = (googleSheetsConfig.externalDrugSourceFormat || 'json').toLowerCase();
    const dataPath = (googleSheetsConfig.externalDrugDataPath || '').trim();
    const token = (googleSheetsConfig.externalDrugSourceToken || '').trim();

    if (!sourceUrl) {
        throw new Error('กรุณาตั้งค่า External Drug Source URL');
    }

    const headers = {};
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(sourceUrl, { method: 'GET', headers });
    if (!response.ok) {
        throw new Error(`ไม่สามารถเชื่อมต่อฐานข้อมูลภายนอกได้ (HTTP ${response.status})`);
    }

    let rows = [];
    if (sourceFormat === 'csv') {
        const csvText = await response.text();
        rows = parseCsvExternalDrugData(csvText);
    } else {
        const payload = await response.json();
        const extracted = dataPath ? getNestedValue(payload, dataPath) : (payload.data || payload.items || payload.drugs || payload);
        if (!Array.isArray(extracted)) {
            throw new Error('รูปแบบข้อมูลภายนอกไม่ถูกต้อง: ควรเป็น array');
        }
        rows = extracted;
    }

    const normalizedDrugs = rows.map(normalizeExternalDrugItem).filter(Boolean);
    if (normalizedDrugs.length === 0) {
        throw new Error('ไม่พบข้อมูลยาที่ถูกต้องจากฐานข้อมูลภายนอก');
    }
    return normalizedDrugs;
}

function applyDrugListUpdate(newDrugList, sourceName) {
    const cleaned = cleanDrugData(newDrugList || []);
    drugListData = cleaned;
    globalDrugList = cleaned;
    renderDrugTable();
    updateDrugStats();
    populateDrugDropdowns();
    setupSearchableDropdowns();
    displayHADListFromDatabase(globalDrugList);
    showNotification(`อัปเดตรายการยาจาก ${sourceName} สำเร็จ (${cleaned.length} รายการ)`, 'success');

    const syncAtEl = document.getElementById('externalSyncLastUpdated');
    if (syncAtEl) {
        syncAtEl.textContent = new Date().toLocaleString('th-TH');
    }
}

function setExternalSyncButtonLoading(isLoading) {
    const btn = document.getElementById('syncExternalDrugListBtn');
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังอัปเดต';
    } else {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.originalText || '<i class="fas fa-sync-alt"></i> อัปเดตรายการยาจากฐานข้อมูลภายนอก';
    }
}

function updateExternalSyncStatus() {
    const statusEl = document.getElementById('externalSyncStatus');
    if (!statusEl) return;

    if (!googleSheetsConfig.externalDrugSourceUrl) {
        statusEl.textContent = 'ยังไม่ตั้งค่า';
        return;
    }

    const every = Number(googleSheetsConfig.externalDrugAutoSyncMinutes || 0);
    if (every > 0) {
        statusEl.textContent = `พร้อมใช้งาน (ทุก ${every} นาที)`;
    } else {
        statusEl.textContent = 'พร้อมใช้งาน (manual)';
    }
}

async function saveExternalDrugListToWebApp(drugs) {
    if (!googleSheetsConfig.webAppUrl || !Array.isArray(drugs) || drugs.length === 0) {
        return false;
    }

    try {
        await apiPost('replaceDrugList', { drugs });
        return true;
    } catch (error) {
        console.warn('Failed to save external drug list to Web App:', error);
        return false;
    }
}

async function syncDrugListFromExternalDatabase(options = {}) {
    const normalizedDrugs = await fetchExternalDrugRows();

    applyDrugListUpdate(normalizedDrugs, 'External Database');
    const persisted = await saveExternalDrugListToWebApp(normalizedDrugs);
    if (persisted && !options.silent) {
        showNotification('บันทึกรายการยาลงฐานข้อมูลหลักเรียบร้อยแล้ว', 'success');
    }

    return normalizedDrugs;
}

async function handleSyncDrugListFromExternal() {
    setExternalSyncButtonLoading(true);
    try {
        await syncDrugListFromExternalDatabase();
    } catch (error) {
        console.error('External drug sync failed:', error);
        showNotification(error.message || 'อัปเดตรายการยาจากฐานข้อมูลภายนอกไม่สำเร็จ', 'error');
    } finally {
        setExternalSyncButtonLoading(false);
    }
}

async function handleTestExternalDrugConnection() {
    const btn = document.getElementById('testExternalDrugConnectionBtn');
    const resultEl = document.getElementById('externalDrugTestResult');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังทดสอบ';
    }
    try {
        const rows = await fetchExternalDrugRows();
        const sample = rows[0];
        const sampleText = sample ? `${sample.drugCode || '-'} ${sample.drugName || ''}`.trim() : '-';
        if (resultEl) {
            resultEl.textContent = `เชื่อมต่อสำเร็จ พบ ${rows.length} รายการ ตัวอย่าง: ${sampleText}`;
            resultEl.className = 'external-test-result success';
        }
        showNotification(`ทดสอบการเชื่อมต่อสำเร็จ (${rows.length} รายการ)`, 'success');
    } catch (error) {
        console.error('External connection test failed:', error);
        if (resultEl) {
            resultEl.textContent = `เชื่อมต่อไม่สำเร็จ: ${error.message || 'Unknown error'}`;
            resultEl.className = 'external-test-result error';
        }
        showNotification(error.message || 'ทดสอบการเชื่อมต่อไม่สำเร็จ', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml || '<i class="fas fa-vial"></i> ทดสอบการเชื่อมต่อ';
        }
    }
}

function setupExternalDrugSyncTimer() {
    if (drugSyncTimer) {
        clearInterval(drugSyncTimer);
        drugSyncTimer = null;
    }

    const everyMinutes = Number(googleSheetsConfig.externalDrugAutoSyncMinutes || 0);
    if (!googleSheetsConfig.externalDrugSourceUrl || !everyMinutes || everyMinutes < 1) {
        return;
    }

    drugSyncTimer = setInterval(async () => {
        try {
            await syncDrugListFromExternalDatabase({ silent: true });
        } catch (error) {
            console.warn('Auto sync external drug list failed:', error);
        }
    }, everyMinutes * 60 * 1000);
}
