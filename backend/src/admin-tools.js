// ฟังก์ชันสำหรับรันเองใน Apps Script editor
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน

// รายชื่อผู้ใช้ที่ยังใช้รหัสผ่านเริ่มต้น/อ่อน (ตรวจจาก hash) — ใช้ติดตามการเปลี่ยนรหัส
function auditWeakPasswords() {
  var weak = weakPasswordUsers();
  console.log('Users with weak/default passwords: ' + weak.length + '\n' + weak.join(', '));
  return weak;
}

// ออกรหัสผ่านชั่วคราวแบบสุ่มให้ทุกคนที่ยังใช้รหัสอ่อน/รหัสเริ่มต้น
// ผลลัพธ์อยู่ใน Sheet "Temp_Passwords" — แจกให้ผู้ใช้เป็นรายบุคคล แล้ว "ลบ Sheet นั้นทิ้ง"
// ผู้ใช้จะถูกบังคับให้เปลี่ยนรหัสผ่านเมื่อ login ครั้งแรก
function forceResetWeakPasswords() {
  var weak = auditWeakPasswords();
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var userSheet = spreadsheet.getSheetByName(USER_SHEET);
  var lastRow = userSheet.getLastRow();
  var rows = userSheet.getRange(2, 1, lastRow - 1, 3).getValues();
  var props = PropertiesService.getScriptProperties();
  var issued = [['PS Code', 'ชื่อ', 'รหัสผ่านชั่วคราว']];

  rows.forEach(function(row, i) {
    var psCode = (row[0] || '').toString().trim();
    if (weak.indexOf(psCode) === -1) return;
    var temp = generateTempPassword();
    userSheet.getRange(i + 2, 7).setValue(hashPassword(temp));
    props.setProperty(mustChangeKey(psCode), '1');
    issued.push([psCode, row[2], temp]);
  });

  var out = spreadsheet.getSheetByName('Temp_Passwords') || spreadsheet.insertSheet('Temp_Passwords');
  out.clear();
  out.getRange(1, 1, issued.length, 3).setValues(issued);
  logAuditEvent('FORCE_RESET_WEAK', 'admin', (issued.length - 1) + ' users');
  return issued.length - 1;
}

// Run once in Apps Script editor to hash any remaining plain-text passwords.
function migrateUsersToHashedPasswords() {
  var userSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USER_SHEET);
  if (!userSheet) {
    throw new Error('Users sheet not found');
  }

  var lastRow = userSheet.getLastRow();
  if (lastRow <= 1) {
    return { updated: 0, skipped: 0, message: 'No user rows to migrate' };
  }

  var range = userSheet.getRange(2, 7, lastRow - 1, 1); // Column G: Password
  var values = range.getValues();
  var updated = 0;
  var skipped = 0;

  for (var i = 0; i < values.length; i++) {
    var current = (values[i][0] || '').toString().trim();
    if (!current || isHashedPassword(current)) { skipped++; continue; }
    values[i][0] = hashPassword(current);
    updated++;
  }

  if (updated > 0) {
    range.setValues(values);
  }

  return { updated: updated, skipped: skipped, message: 'Password migration completed' };
}

// Admin utility: reset a single user password to hashed format.
function setUserPasswordHashed(psCodeOrId13, newPassword) {
  if (!psCodeOrId13 || !newPassword) {
    throw new Error('psCodeOrId13 and newPassword are required');
  }

  var userSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USER_SHEET);
  if (!userSheet) {
    throw new Error('Users sheet not found');
  }

  var lastRow = userSheet.getLastRow();
  if (lastRow <= 1) {
    throw new Error('No user data found');
  }

  var id = psCodeOrId13.toString().trim().toLowerCase();
  var rows = userSheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var targetIndex = -1;

  for (var i = 0; i < rows.length; i++) {
    var psCode = (rows[i][0] || '').toString().trim().toLowerCase();
    var id13 = (rows[i][1] || '').toString().trim().toLowerCase();
    if (psCode === id || id13 === id) {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex === -1) {
    throw new Error('User not found: ' + psCodeOrId13);
  }

  userSheet.getRange(targetIndex + 2, 7).setValue(hashPassword(newPassword.toString()));
  // รหัสที่ admin ตั้งให้ถือเป็นรหัสชั่วคราว — บังคับเปลี่ยนเมื่อ login
  PropertiesService.getScriptProperties().setProperty(mustChangeKey(rows[targetIndex][0]), '1');

  return { success: true, user: psCodeOrId13, message: 'Password updated in hashed format' };
}
