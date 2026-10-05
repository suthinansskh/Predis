// รายการยา, HAD/สถานะ override
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน

function toHadLabel(value) {
  return (value === 1 || value === '1' || value === true || value === 'High' || value === 'TRUE') ? 'High' : 'Regular';
}

function toActive(value) {
  return value === true || value === 'TRUE' || value === 'true' || value == 1 || value === 'Active';
}

function drugCodeKey(code) {
  // ตัด ' นำหน้า (ใช้บังคับให้ Sheets เก็บเป็นข้อความ)
  return String(code === null || code === undefined ? '' : code).trim().replace(/^'/, '').toUpperCase();
}

function getDrugOverrideSheet() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(DRUG_OVERRIDE_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(DRUG_OVERRIDE_SHEET);
    sheet.getRange(1, 1, 1, 5).setValues([['Drug Code', 'HAD', 'Status', 'แก้ไขโดย', 'แก้ไขเมื่อ']]);
  }
  return sheet;
}

// { DRUGCODE: { had: 'High'|'Regular', status: true|false } }
function getDrugOverrides() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(DRUG_OVERRIDE_SHEET);
  var map = {};
  if (!sheet) return map;
  sheet.getDataRange().getValues().slice(1).forEach(function(r) {
    var key = drugCodeKey(r[0]);
    if (!key) return;
    map[key] = { had: r[1] ? toHadLabel(r[1]) : null, status: r[2] === '' ? null : toActive(r[2]) };
  });
  return map;
}

function applyDrugOverride(drug, overrides) {
  var o = overrides[drugCodeKey(drug.code)];
  if (o) {
    if (o.had) drug.had = o.had;
    if (o.status !== null) drug.status = o.status;
  }
  return drug;
}

/**
 * แก้ HAD / สถานะการใช้งานของยา (role: admin, supervisor, pharmacist)
 * เขียนทั้ง Drug_List (มีผลทันที) และ Drug_Overrides (คงอยู่หลัง sync จาก HOSxP)
 */
function updateDrug(session, data) {
  var key = drugCodeKey(data.drugCode);
  if (!key) {
    return jsonResponse({ success: false, error: 'กรุณาระบุรหัสยา' });
  }
  var had = data.had === undefined || data.had === '' ? null : data.had;
  var status = data.status === undefined || data.status === '' ? null : data.status;
  if (had !== null && had !== 'High' && had !== 'Regular') {
    return jsonResponse({ success: false, error: 'สถานะ HAD ไม่ถูกต้อง' });
  }
  if (status !== null && status !== 'Active' && status !== 'Inactive') {
    return jsonResponse({ success: false, error: 'สถานะการใช้งานไม่ถูกต้อง' });
  }
  if (had === null && status === null) {
    return jsonResponse({ success: false, error: 'ไม่มีข้อมูลที่จะเปลี่ยน' });
  }

  var drugSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(DRUG_SHEET);
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    var lastRow = drugSheet ? drugSheet.getLastRow() : 0;
    var codes = lastRow > 1 ? drugSheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];
    var rowIndex = -1;
    for (var i = 0; i < codes.length; i++) {
      if (drugCodeKey(codes[i][0]) === key) { rowIndex = i + 2; break; }
    }
    if (rowIndex === -1) {
      return jsonResponse({ success: false, error: 'ไม่พบรหัสยา ' + data.drugCode });
    }
    if (had !== null) drugSheet.getRange(rowIndex, 4).setValue(had === 'High' ? 1 : 0);
    if (status !== null) drugSheet.getRange(rowIndex, 5).setValue(status === 'Active' ? 1 : 0);

    var overrideSheet = getDrugOverrideSheet();
    var rows = overrideSheet.getDataRange().getValues();
    var overrideRow = -1;
    for (var j = 1; j < rows.length; j++) {
      if (drugCodeKey(rows[j][0]) === key) { overrideRow = j + 1; break; }
    }
    var existing = overrideRow === -1 ? ['', '', ''] : rows[overrideRow - 1];
    var newRow = [
      "'" + String(data.drugCode).trim(), // เก็บเป็นข้อความ (กันเลข 0 นำหน้าหาย)
      had !== null ? had : existing[1],
      status !== null ? status : existing[2],
      session.psCode,
      nowText()
    ];
    if (overrideRow === -1) {
      overrideSheet.appendRow(newRow);
    } else {
      overrideSheet.getRange(overrideRow, 1, 1, 5).setValues([newRow]);
    }
  } finally {
    lock.releaseLock();
  }

  logAuditEvent('DRUG_UPDATED', session.psCode, data.drugCode + ' ' +
    [had !== null ? 'HAD=' + had : '', status !== null ? 'status=' + status : ''].join(' ').trim());
  return jsonResponse({ success: true, message: 'บันทึกการแก้ไขยา ' + data.drugCode + ' แล้ว' });
}

function toDrugRow(drug) {
  return [
    sanitizeInput(drug.drugCode || ''),
    sanitizeInput(drug.drugName || ''),
    sanitizeInput(drug.group || ''),
    toHadLabel(drug.had) === 'High' ? 1 : 0,
    toActive(drug.status) ? 1 : 0,
    sanitizeInput(drug.unit || ''),
    sanitizeInput(drug.strength || ''),
    sanitizeInput(drug.dosageForm || ''),
    sanitizeInput(drug.tmtCode || ''),
    Number(drug.unitPrice) || 0
  ];
}

// Handle drug list operations (role-checked in doPost)
function handleDrugOperation(spreadsheet, data, session) {
  try {
    var drugSheet = spreadsheet.getSheetByName(DRUG_SHEET);

    if (!drugSheet) {
      drugSheet = spreadsheet.insertSheet(DRUG_SHEET);
      drugSheet.getRange(1, 1, 1, 10).setValues([['Drug Code', 'Drug Name', 'Group', 'HAD', 'Status', 'Unit', 'Strength', 'Dosage Form', 'TMT Code', 'Unit Price']]);
      drugSheet.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#e1f5fe');
    }

    if (data.action === 'addDrug') {
      if (!data.drugCode || !data.drugName) {
        return jsonResponse({ success: false, error: 'กรุณาระบุรหัสยาและชื่อยา' });
      }

      var lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000);
        var lastRow = drugSheet.getLastRow();
        var codes = lastRow > 1 ? drugSheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];
        var exists = codes.some(function(row) { return String(row[0]) === String(data.drugCode); });
        if (exists) {
          return jsonResponse({ success: false, error: 'รหัสยาซ้ำ: ' + data.drugCode + ' มีอยู่ในระบบแล้ว' });
        }
        drugSheet.appendRow(toDrugRow(data));
      } finally {
        lock.releaseLock();
      }

      logAuditEvent('DRUG_ADDED', session.psCode, data.drugCode);
      return jsonResponse({ success: true, message: 'เพิ่มรายการยาเรียบร้อยแล้ว', timestamp: new Date().toISOString() });
    }

    if (data.action === 'replaceDrugList') {
      var drugs = typeof data.drugs === 'string' ? JSON.parse(data.drugs) : data.drugs;
      if (!Array.isArray(drugs) || drugs.length === 0) {
        return jsonResponse({ success: false, error: 'drugs must be a non-empty array' });
      }

      var replaceLock = LockService.getScriptLock();
      try {
        replaceLock.waitLock(15000);
        var currentLastRow = drugSheet.getLastRow();
        if (currentLastRow > 1) {
          drugSheet.getRange(2, 1, currentLastRow - 1, 10).clearContent();
        }
        drugSheet.getRange(2, 1, drugs.length, 10).setValues(drugs.map(toDrugRow));
      } finally {
        replaceLock.releaseLock();
      }

      logAuditEvent('DRUG_LIST_REPLACED', session.psCode, drugs.length + ' drugs');
      return jsonResponse({ success: true, message: 'Drug list replaced successfully', count: drugs.length, timestamp: new Date().toISOString() });
    }

    return jsonResponse({ success: false, error: 'Invalid drug operation' });

  } catch (error) {
    return jsonResponse({ success: false, error: 'Drug operation error: ' + error.toString() });
  }
}

// Get drug list from Drug_List sheet (app format)
function getDrugList(spreadsheet) {
  try {
    var drugSheet = spreadsheet.getSheetByName(DRUG_SHEET);
    if (!drugSheet) {
      return jsonResponse({ success: true, data: [], message: 'No ' + DRUG_SHEET + ' sheet found' });
    }

    var values = drugSheet.getDataRange().getValues();
    var overrides = getDrugOverrides();
    var drugs = values.slice(1).map(function(row) {
      var drug = applyDrugOverride({
        code: row[0] || '',
        had: toHadLabel(row[3]),
        status: toActive(row[4])
      }, overrides);
      return {
        drugCode: row[0] || '',
        drugName: row[1] || '',
        group: row[2] || '',
        had: drug.had,
        status: drug.status ? 'Active' : 'Inactive',
        unit: row[5] || '',
        strength: row[6] || '',
        dosageForm: row[7] || '',
        tmtCode: row[8] || '',
        unitPrice: row[9] || 0
      };
    });

    return jsonResponse({ success: true, data: drugs, count: drugs.length, timestamp: new Date().toISOString() });

  } catch (error) {
    return jsonResponse({ success: false, error: 'Error getting drug list: ' + error.toString() });
  }
}

// ===== Users: helpers =====
