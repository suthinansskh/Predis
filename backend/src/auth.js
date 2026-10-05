// Login, ลงทะเบียน, ขอรีเซ็ตรหัส, เปลี่ยนรหัส
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน

function loginFailureKey(normalizedCode) {
  return 'fail:' + normalizedCode;
}

// ===== Login throttling (นับตามบัญชีจริง, หน่วงเวลาเพิ่มขึ้นตาม LOGIN_DELAYS) =====

function loginThrottleState(key) {
  try {
    var state = JSON.parse(CacheService.getScriptCache().get(loginFailureKey(key)) || 'null');
    return state && typeof state.n === 'number' ? state : { n: 0, until: 0 };
  } catch (e) {
    return { n: 0, until: 0 };
  }
}

function loginDelaySeconds(failures) {
  for (var i = 0; i < LOGIN_DELAYS.length; i++) {
    if (failures >= LOGIN_DELAYS[i].failures) return LOGIN_DELAYS[i].seconds;
  }
  return 0;
}

function recordLoginFailure(key) {
  var state = loginThrottleState(key);
  state.n += 1;
  state.until = Date.now() + loginDelaySeconds(state.n) * 1000;
  CacheService.getScriptCache().put(loginFailureKey(key), JSON.stringify(state), 60 * 60);
  return state;
}

function clearLoginFailures(key) {
  CacheService.getScriptCache().remove(loginFailureKey(key));
}

// หาแถวผู้ใช้จาก PS Code หรือ ID13 — ถ้ามีหลายแถว ให้แถวที่ active มาก่อน
// @returns {{sheet, rowNumber, row}|null}
function findUserByLogin(userCode) {
  var normalizedCode = String(userCode || '').trim().toLowerCase();
  if (!normalizedCode) return null;
  var sheet = getUserSheet();
  var values = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < values.length; i++) {
    var psCode = (values[i][0] || '').toString().trim().toLowerCase();
    var id13 = (values[i][1] || '').toString().trim().toLowerCase();
    if (psCode !== normalizedCode && id13 !== normalizedCode) continue;
    if (rowIndex === -1 || isActiveStatus(values[i][7])) rowIndex = i;
    if (isActiveStatus(values[i][7])) break;
  }
  return rowIndex === -1 ? null : { sheet: sheet, rowNumber: rowIndex + 1, row: values[rowIndex] };
}

function throttleKeyFor(found, userCode) {
  return found ? String(found.row[0]).trim().toLowerCase() : String(userCode || '').trim().toLowerCase();
}

function lockedResult(state) {
  var retryAfter = Math.max(1, Math.ceil((state.until - Date.now()) / 1000));
  return {
    ok: false,
    code: 'LOCKED',
    retryAfter: retryAfter,
    message: 'ใส่รหัสผ่านผิดหลายครั้ง กรุณารอ ' + (retryAfter >= 60 ? Math.ceil(retryAfter / 60) + ' นาที' : retryAfter + ' วินาที') + ' แล้วลองใหม่'
  };
}

function userFromRow(row) {
  return {
    psCode: (row[0] || '').toString().trim(),
    name: (row[2] || '').toString().trim(),
    group: (row[3] || '').toString().trim(),
    level: (row[4] || '').toString().trim(),
    email: (row[5] || '').toString().trim(),
    status: true
  };
}

/**
 * ตรวจ credentials (ใช้ร่วมกันทั้ง API เดิมและ v2)
 * @returns {{ok:true, user:Object, mustChangePassword:boolean} |
 *           {ok:false, code:string, message:string, retryAfter?:number}}
 * code: MISSING_FIELDS, LOCKED, WRONG_CREDENTIALS, PENDING_APPROVAL, REJECTED, DISABLED, DEFAULT_PASSWORD_BLOCKED
 */
function authenticate(userCode, password) {
  if (!userCode || !password) {
    return { ok: false, code: 'MISSING_FIELDS', message: 'กรุณาระบุรหัสผู้ใช้และรหัสผ่าน' };
  }
  var found = findUserByLogin(userCode);
  var key = throttleKeyFor(found, userCode);
  var state = loginThrottleState(key);
  if (state.until > Date.now()) return lockedResult(state);

  var inputPassword = password.toString().trim();
  var passwordMatch = false;
  if (found) {
    var storedPassword = (found.row[6] || '').toString().trim();
    if (isHashedPassword(storedPassword)) {
      passwordMatch = verifyPassword(inputPassword, storedPassword);
    } else if (storedPassword) {
      // Legacy: plain text password
      passwordMatch = constantTimeEquals(inputPassword, storedPassword);
    }
    // ไม่มีรหัสผ่าน = login ไม่ได้ (ต้องใช้รหัสเปิดใช้งาน)
  }

  if (!passwordMatch) {
    var failed = recordLoginFailure(key);
    logAuditEvent('LOGIN_FAILED', found ? found.row[0] : userCode, 'Invalid credentials (attempt ' + failed.n + ')');
    if (failed.until > Date.now()) return lockedResult(failed);
    return { ok: false, code: 'WRONG_CREDENTIALS', message: 'ไม่พบผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  }

  var row = found.row;
  var rawId13 = (row[1] || '').toString().trim();

  // แจ้งสถานะบัญชีหลังตรวจรหัสผ่านแล้วเท่านั้น (ไม่เปิดเผยว่ามีบัญชีนี้อยู่)
  if (!isActiveStatus(row[7])) {
    var request = (row[COL.REQUEST - 1] || '').toString();
    if (request === 'PENDING') return { ok: false, code: 'PENDING_APPROVAL', message: 'บัญชีของคุณอยู่ระหว่างรอผู้ดูแลระบบอนุมัติ' };
    if (request === 'REJECTED') return { ok: false, code: 'REJECTED', message: 'คำขอลงทะเบียนไม่ได้รับการอนุมัติ กรุณาติดต่อผู้ดูแลระบบ' };
    return { ok: false, code: 'DISABLED', message: 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ' };
  }

  if (BLOCK_WEAK_PASSWORD_LOGIN && isWeakPassword(inputPassword, rawId13)) {
    clearLoginFailures(key);
    logAuditEvent('LOGIN_BLOCKED_WEAK', row[0], 'Default/weak password');
    return {
      ok: false,
      code: 'DEFAULT_PASSWORD_BLOCKED',
      message: 'รหัสผ่านเริ่มต้นถูกปิดใช้งานเพื่อความปลอดภัย กรุณาใช้ "รหัสเปิดใช้งาน" จากหัวหน้าหรือผู้ดูแลระบบ หรือกด "ลืมรหัสผ่าน"'
    };
  }

  var storedPw = (row[6] || '').toString().trim();
  if (needsRehash(storedPw)) {
    try {
      found.sheet.getRange(found.rowNumber, COL.PASSWORD).setValue(hashPassword(inputPassword));
    } catch (migrateErr) {
      // Non-fatal: password still works, just not migrated yet
    }
  }
  clearLoginFailures(key);

  var mustChangePassword = isWeakPassword(inputPassword, rawId13) ||
    PropertiesService.getScriptProperties().getProperty(mustChangeKey(row[0])) === '1';
  var user = userFromRow(row);
  logAuditEvent('LOGIN_SUCCESS', user.psCode, mustChangePassword ? 'Weak password — must change' : 'Login successful');
  return { ok: true, user: user, mustChangePassword: mustChangePassword };
}

function registerUser(data) {
  try {
    if (rateLimited('reg:global', REGISTER_MAX_PER_HOUR, 60 * 60)) {
      return jsonResponse({ success: false, error: 'มีการลงทะเบียนจำนวนมาก กรุณาลองใหม่ภายหลัง' });
    }

    var psCode = String(data.psCode || '').trim();
    var name = String(data.name || '').trim();
    var group = String(data.group || '').trim();
    var email = String(data.email || '').trim();
    var password = String(data.password || '');

    if (!/^[A-Za-z0-9_-]{2,20}$/.test(psCode)) {
      return jsonResponse({ success: false, error: 'PS Code ต้องเป็นตัวอักษรอังกฤษ/ตัวเลข 2-20 ตัว' });
    }
    if (name.length < 4 || name.length > 100) {
      return jsonResponse({ success: false, error: 'กรุณาระบุชื่อ-นามสกุล' });
    }
    if (USER_GROUPS.indexOf(group) === -1) {
      return jsonResponse({ success: false, error: 'กรุณาเลือกกลุ่มงาน' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ success: false, error: 'รูปแบบอีเมลไม่ถูกต้อง' });
    }
    if (isWeakPassword(password, '')) {
      return jsonResponse({
        success: false,
        error: 'รหัสผ่านต้องมีอย่างน้อย ' + PASSWORD_MIN_LENGTH + ' ตัวอักษร และห้ามเป็นรหัสที่เดาง่าย'
      });
    }

    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      if (findUserRow(psCode)) {
        return jsonResponse({ success: false, error: 'PS Code นี้มีในระบบแล้ว หากลืมรหัสผ่านให้กด "ลืมรหัสผ่าน"' });
      }
      getUserSheet().appendRow([
        sanitizeInput(psCode), '', sanitizeInput(name), sanitizeInput(group), 'user',
        sanitizeInput(email), hashPassword(password), false, 'PENDING', nowText()
      ]);
    } finally {
      lock.releaseLock();
    }

    logAuditEvent('REGISTER_REQUESTED', psCode, name);
    return jsonResponse({ success: true, message: 'ส่งคำขอลงทะเบียนแล้ว กรุณารอผู้ดูแลระบบอนุมัติ' });

  } catch (error) {
    return jsonResponse({ success: false, error: 'Error registering: ' + error.toString() });
  }
}

function getResetSheet() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(RESET_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(RESET_SHEET);
    sheet.getRange(1, 1, 1, 6).setValues([['วันที่ขอ', 'PS Code', 'ชื่อ', 'สถานะ', 'ดำเนินการโดย', 'วันที่ดำเนินการ']]);
  }
  return sheet;
}

/**
 * บันทึกคำขอรีเซ็ตรหัสผ่านให้ admin ดำเนินการ
 * ตอบข้อความเดียวกันเสมอ — ไม่เปิดเผยว่ามีผู้ใช้นี้หรือไม่
 */
function requestPasswordReset(userCode) {
  var generic = jsonResponse({
    success: true,
    message: 'หากรหัสผู้ใช้ถูกต้อง คำขอของคุณถูกส่งถึงผู้ดูแลระบบแล้ว กรุณาติดต่อรับรหัสผ่านชั่วคราว'
  });

  try {
    var code = String(userCode || '').trim().toLowerCase();
    if (!code || code.length > 30) return generic;
    if (rateLimited('rr:' + code, 1, RESET_REQUEST_COOLDOWN_SECONDS)) return generic;
    if (rateLimited('rr:global', 50, 60 * 60)) return generic;

    // รับได้ทั้ง PS Code และ ID13
    var sheet = getUserSheet();
    var lastRow = sheet.getLastRow();
    var rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, COL.STATUS).getValues() : [];
    var user = null;
    for (var i = 0; i < rows.length; i++) {
      var ps = (rows[i][0] || '').toString().trim();
      var id13 = (rows[i][1] || '').toString().trim().toLowerCase();
      if ((ps.toLowerCase() === code || id13 === code) && isActiveStatus(rows[i][7])) {
        user = { psCode: ps, name: rows[i][2] };
        break;
      }
    }
    if (!user) return generic;

    var resetSheet = getResetSheet();
    var resetRows = resetSheet.getDataRange().getValues().slice(1);
    var alreadyPending = resetRows.some(function(r) { return r[1] === user.psCode && r[3] === 'PENDING'; });
    if (!alreadyPending) {
      resetSheet.appendRow([nowText(), sanitizeInput(user.psCode), sanitizeInput(user.name), 'PENDING', '', '']);
      logAuditEvent('RESET_REQUESTED', user.psCode, '');
    }
  } catch (error) {
    console.error('requestPasswordReset failed:', error);
  }
  return generic;
}

function changeUserPassword(session, currentPassword, newPassword) {
  try {
    if (!currentPassword || !newPassword) {
      return jsonResponse({ success: false, error: 'กรุณาระบุรหัสผ่านปัจจุบันและรหัสผ่านใหม่' });
    }

    var nextPassword = newPassword.toString();
    if (currentPassword === nextPassword) {
      return jsonResponse({ success: false, error: 'รหัสผ่านใหม่ต้องแตกต่างจากรหัสผ่านเดิม' });
    }

    var userSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USER_SHEET);
    if (!userSheet) {
      return jsonResponse({ success: false, error: 'Users sheet not found' });
    }

    var lastRow = userSheet.getLastRow();
    var values = lastRow > 1 ? userSheet.getRange(2, 1, lastRow - 1, 8).getValues() : [];
    var normalizedCode = session.psCode.toString().trim().toLowerCase();
    var targetIndex = -1;

    for (var i = 0; i < values.length; i++) {
      if ((values[i][0] || '').toString().trim().toLowerCase() === normalizedCode) {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex === -1) {
      return jsonResponse({ success: false, error: 'ไม่พบผู้ใช้' });
    }

    var row = values[targetIndex];
    var rawId13 = (row[1] || '').toString().trim();
    var storedPassword = (row[6] || '').toString().trim();
    var currentOk = isHashedPassword(storedPassword)
      ? verifyPassword(currentPassword.toString(), storedPassword)
      : (storedPassword !== '' && constantTimeEquals(currentPassword.toString(), storedPassword));

    if (!currentOk) {
      logAuditEvent('PASSWORD_CHANGE_FAILED', session.psCode, 'Wrong current password');
      return jsonResponse({ success: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    }

    if (isWeakPassword(nextPassword, rawId13)) {
      return jsonResponse({
        success: false,
        error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย ' + PASSWORD_MIN_LENGTH + ' ตัวอักษร และห้ามเป็นรหัสเริ่มต้นหรือเลขบัตรประชาชน'
      });
    }

    userSheet.getRange(targetIndex + 2, 7).setValue(hashPassword(nextPassword));
    PropertiesService.getScriptProperties().deleteProperty(mustChangeKey(session.psCode));
    logAuditEvent('PASSWORD_CHANGED', session.psCode, '');

    return jsonResponse({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' });

  } catch (error) {
    return jsonResponse({ success: false, error: 'Error changing password: ' + error.toString() });
  }
}

// ===== Admin Utilities (Run manually in Apps Script editor) =====
