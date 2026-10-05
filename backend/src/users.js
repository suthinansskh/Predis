// จัดการผู้ใช้ (admin) และ helper ของ Sheet Users
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน

function isActiveStatus(value) {
  return value === true || value === 'TRUE' || value === 'true';
}

function getUserSheet() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(USER_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(USER_SHEET);
  }
  // เพิ่ม header คอลัมน์ I/J ถ้ายังไม่มี (Sheet เดิมมีถึง H)
  var header = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, USER_HEADER.length).getValues()[0] : [];
  if (header[COL.REQUEST - 1] !== USER_HEADER[COL.REQUEST - 1]) {
    sheet.getRange(1, 1, 1, USER_HEADER.length).setValues([USER_HEADER.map(function(h, i) { return header[i] || h; })]);
  }
  return sheet;
}

// คืน { sheet, rowNumber, row } ของผู้ใช้จาก PS Code (rowNumber เป็น 1-based) หรือ null
function findUserRow(psCode) {
  var sheet = getUserSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1 || !psCode) return null;
  var target = String(psCode).trim().toLowerCase();
  var rows = sheet.getRange(2, 1, lastRow - 1, USER_HEADER.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if ((rows[i][0] || '').toString().trim().toLowerCase() === target) {
      return { sheet: sheet, rowNumber: i + 2, row: rows[i] };
    }
  }
  return null;
}

function rateLimited(key, max, seconds) {
  var cache = CacheService.getScriptCache();
  var count = parseInt(cache.get(key) || '0', 10);
  if (count >= max) return true;
  cache.put(key, String(count + 1), seconds);
  return false;
}

function nowText() {
  return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
}

function maskId13(id13) {
  var s = String(id13 || '');
  return s.length > 4 ? new Array(s.length - 3).join('*') + s.slice(-4) : s;
}

function listUsers() {
  var sheet = getUserSheet();
  var lastRow = sheet.getLastRow();
  var rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, USER_HEADER.length).getValues() : [];
  var props = PropertiesService.getScriptProperties();

  var users = rows.filter(function(r) { return (r[0] || '').toString().trim(); }).map(function(r) {
    var psCode = r[0].toString().trim();
    return {
      psCode: psCode,
      id13: maskId13(r[1]),
      name: String(r[2] || ''),
      group: String(r[3] || ''),
      level: String(r[4] || ''),
      email: String(r[5] || ''),
      active: isActiveStatus(r[7]),
      request: String(r[COL.REQUEST - 1] || ''),
      requestedAt: String(r[COL.REQUESTED_AT - 1] || ''),
      hasPassword: Boolean(r[6]),
      mustChangePassword: props.getProperty(mustChangeKey(psCode)) === '1'
    };
  });

  var resets = getResetSheet().getDataRange().getValues().slice(1)
    .filter(function(r) { return r[3] === 'PENDING'; })
    .map(function(r) { return { requestedAt: String(r[0]), psCode: String(r[1]), name: String(r[2]) }; });

  return jsonResponse({ success: true, users: users, pendingResets: resets, levels: USER_LEVELS });
}

function approveUser(session, psCode, level) {
  var found = findUserRow(psCode);
  if (!found || found.row[COL.REQUEST - 1] !== 'PENDING') {
    return jsonResponse({ success: false, error: 'ไม่พบคำขอลงทะเบียนที่รออนุมัติ' });
  }
  var newLevel = USER_LEVELS.indexOf(level) !== -1 ? level : 'user';
  found.sheet.getRange(found.rowNumber, COL.LEVEL).setValue(newLevel);
  found.sheet.getRange(found.rowNumber, COL.STATUS).setValue(true);
  found.sheet.getRange(found.rowNumber, COL.REQUEST).setValue('APPROVED');
  logAuditEvent('USER_APPROVED', session.psCode, psCode + ' as ' + newLevel);
  return jsonResponse({ success: true, message: 'อนุมัติ ' + psCode + ' แล้ว' });
}

function rejectUser(session, psCode) {
  var found = findUserRow(psCode);
  if (!found || found.row[COL.REQUEST - 1] !== 'PENDING') {
    return jsonResponse({ success: false, error: 'ไม่พบคำขอลงทะเบียนที่รออนุมัติ' });
  }
  found.sheet.getRange(found.rowNumber, COL.STATUS).setValue(false);
  found.sheet.getRange(found.rowNumber, COL.REQUEST).setValue('REJECTED');
  logAuditEvent('USER_REJECTED', session.psCode, psCode);
  return jsonResponse({ success: true, message: 'ปฏิเสธคำขอของ ' + psCode + ' แล้ว' });
}

function updateUser(session, psCode, level, active, group) {
  var found = findUserRow(psCode);
  if (!found) {
    return jsonResponse({ success: false, error: 'ไม่พบผู้ใช้' });
  }
  if (String(psCode).trim().toLowerCase() === String(session.psCode).trim().toLowerCase()) {
    return jsonResponse({ success: false, error: 'ไม่สามารถเปลี่ยนระดับหรือปิดบัญชีของตัวเองได้' });
  }

  var changes = [];
  if (level !== undefined && level !== '') {
    if (USER_LEVELS.indexOf(level) === -1) {
      return jsonResponse({ success: false, error: 'ระดับผู้ใช้ไม่ถูกต้อง' });
    }
    found.sheet.getRange(found.rowNumber, COL.LEVEL).setValue(level);
    changes.push('level=' + level);
  }
  if (active !== undefined && active !== '') {
    var isActive = active === true || active === 'true';
    found.sheet.getRange(found.rowNumber, COL.STATUS).setValue(isActive);
    changes.push('active=' + isActive);
  }
  if (group !== undefined && group !== '') {
    var newGroup = String(group).trim();
    if (newGroup.length > 50) {
      return jsonResponse({ success: false, error: 'ชื่อกลุ่มงานยาวเกินไป' });
    }
    found.sheet.getRange(found.rowNumber, COL.GROUP).setValue(sanitizeInput(newGroup));
    changes.push('group=' + newGroup);
  }
  if (changes.length === 0) {
    return jsonResponse({ success: false, error: 'ไม่มีข้อมูลที่จะเปลี่ยน' });
  }

  revokeUserSessions(psCode);
  logAuditEvent('USER_UPDATED', session.psCode, psCode + ' ' + changes.join(', '));
  return jsonResponse({ success: true, message: 'บันทึกการเปลี่ยนแปลงของ ' + psCode + ' แล้ว' });
}

// ===== Change Password =====
