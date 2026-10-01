// Google Apps Script Code สำหรับ Predispensing Error Recorder
// Deploy: `clasp push` แล้ว `clasp deploy -i <deploymentId>` (คง URL เดิม)
// การตั้งค่า Deploy: Execute as "Me", Who has access "Anyone"
//
// ความปลอดภัย:
// - ทุก action ยกเว้น login / getDrugs ต้องส่ง `token` ที่ได้จาก login
// - สิทธิ์ (role) ตรวจฝั่ง server เสมอ — การซ่อนปุ่มฝั่ง client เป็นแค่ UX
// - Google Sheet ต้อง "จำกัดสิทธิ์" (ไม่เปิด Anyone with the link) มิฉะนั้นข้าม API นี้ได้

const SPREADSHEET_ID = '1QDIxEXCVLiA7oijXN15N2ZH2LzPtHDecbqolYGs9Ldk';

const ERROR_SHEET = 'Predispensing_Errors';
const DRUG_SHEET = 'Drug_List';
const USER_SHEET = 'Users';

const SESSION_TTL_SECONDS = 6 * 60 * 60; // CacheService max = 6 ชั่วโมง
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCK_SECONDS = 15 * 60;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_ITERATIONS = 1000; // Apps Script ไม่มี PBKDF2 — วน SHA-256 แทน

// รหัสผ่านเริ่มต้นที่เคยหลุดสู่สาธารณะ (sample_users.csv ใน repo public)
const WEAK_PASSWORDS = ['@12345', '12345', '123456', '1234', 'password', 'Admin@1234'];

// true = ปฏิเสธการ login ด้วยรหัสอ่อน/รหัสเริ่มต้น เพราะผู้อื่นรู้รหัสนี้แล้ว
// ผู้ใช้ต้องขอรหัสชั่วคราวจาก admin (ดู forceResetWeakPasswords)
const BLOCK_WEAK_PASSWORD_LOGIN = true;

const ROLE_ACTIONS = {
  addDrug: ['admin', 'supervisor', 'pharmacist'],
  replaceDrugList: ['admin'],
  listUsers: ['admin'],
  approveUser: ['admin'],
  rejectUser: ['admin'],
  updateUser: ['admin'],
  adminResetPassword: ['admin']
};

const USER_LEVELS = ['user', 'pharmacist', 'supervisor', 'admin'];

// ระดับที่เห็นรายงานของทุกคนแบบเต็ม — ระดับ user เห็นรายงานคนอื่นแบบไม่ระบุตัวตน
const FULL_REPORT_ACCESS = ['admin', 'supervisor', 'pharmacist'];
const REDACTED_REPORTER = '(ผู้รายงานอื่น)';
const USER_GROUPS = ['เภสัชกร', 'เจ้าพนักงานเภสัชกรรม', 'อื่นๆ'];
const RESET_SHEET = 'Password_Resets';

// คอลัมน์ใน Sheet Users (1-based) — I/J เพิ่มสำหรับการลงทะเบียน
const COL = { PS: 1, ID13: 2, NAME: 3, GROUP: 4, LEVEL: 5, EMAIL: 6, PASSWORD: 7, STATUS: 8, REQUEST: 9, REQUESTED_AT: 10 };
const USER_HEADER = ['PS Code', 'ID 13 หลัก', 'ชื่อ-นามสกุล', 'กลุ่ม', 'ระดับ', 'อีเมล', 'รหัสผ่าน', 'status', 'สถานะคำขอ', 'วันที่ขอ'];

const REGISTER_MAX_PER_HOUR = 30;
const RESET_REQUEST_COOLDOWN_SECONDS = 60 * 60;

// ช่วงเปลี่ยนผ่าน: client เวอร์ชันเก่า (cache ใน Service Worker) ยังไม่ส่ง token
// และจะแสดง "บันทึกสำเร็จ" แม้ server ปฏิเสธ → ยอมรับ append แบบไม่มี token ชั่วคราว
// เพื่อไม่ให้รายงานหาย (บันทึก Audit_Log ทุกครั้ง) — ลบทิ้งหลังวันที่นี้
const LEGACY_APPEND_UNTIL = new Date('2026-10-08T00:00:00+07:00');

// ===== Password Hashing Utilities =====

const LEGACY_HASH_PREFIX = 'sha256$';   // sha256$salt$hash (รอบเดียว — เลิกใช้)
const HASH_PREFIX = 'sha256i$';         // sha256i$iterations$salt$hash

function toHex(bytes) {
  return bytes.map(function(b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function sha256Hex(input) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  return toHex(raw);
}

function iteratedSha256Hex(password, salt, iterations) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password, Utilities.Charset.UTF_8);
  for (var i = 1; i < iterations; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  }
  return toHex(bytes);
}

function generateSalt() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function hashPassword(password) {
  var salt = generateSalt();
  return HASH_PREFIX + PASSWORD_ITERATIONS + '$' + salt + '$' + iteratedSha256Hex(password, salt, PASSWORD_ITERATIONS);
}

function isHashedPassword(storedValue) {
  return typeof storedValue === 'string' &&
    (storedValue.indexOf(HASH_PREFIX) === 0 || storedValue.indexOf(LEGACY_HASH_PREFIX) === 0);
}

function needsRehash(storedValue) {
  return !(typeof storedValue === 'string' && storedValue.indexOf(HASH_PREFIX) === 0);
}

// เทียบ string แบบใช้เวลาคงที่ ป้องกัน timing attack
function constantTimeEquals(a, b) {
  a = String(a);
  b = String(b);
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function verifyPassword(inputPassword, storedValue) {
  if (!storedValue || !inputPassword) return false;
  var parts = String(storedValue).split('$');
  if (storedValue.indexOf(HASH_PREFIX) === 0 && parts.length === 4) {
    var iterations = parseInt(parts[1], 10);
    if (!(iterations > 0)) return false;
    return constantTimeEquals(iteratedSha256Hex(inputPassword, parts[2], iterations), parts[3]);
  }
  if (storedValue.indexOf(LEGACY_HASH_PREFIX) === 0 && parts.length === 3) {
    return constantTimeEquals(sha256Hex(parts[1] + ':' + inputPassword), parts[2]);
  }
  return false;
}

function mustChangeKey(psCode) {
  return 'mustChange:' + String(psCode).trim().toLowerCase();
}

function generateTempPassword() {
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid());
  var out = '';
  for (var i = 0; i < 10; i++) {
    out += alphabet.charAt(((bytes[i] % 256) + 256) % 256 % alphabet.length);
  }
  return out;
}

function isWeakPassword(password, id13) {
  var pw = String(password || '');
  if (pw.length < PASSWORD_MIN_LENGTH) return true;
  if (WEAK_PASSWORDS.indexOf(pw) !== -1) return true;
  var id = String(id13 || '');
  return id !== '' && (pw === id || pw === id.slice(-4));
}

// ===== Sanitization Helper =====

/**
 * ทำความสะอาด input เพื่อป้องกัน formula injection
 * @param {*} value
 * @returns {string}
 */
function sanitizeInput(value) {
  if (value === null || value === undefined) return '';
  var str = value.toString().trim();
  // ป้องกัน formula injection (=, +, -, @, tab, carriage return, pipe, backslash)
  if (str.length > 0 && /^[=+\-@\t\r|\\]/.test(str)) {
    str = "'" + str;
  }
  // Remove null bytes
  str = str.replace(/\0/g, '');
  // Limit length to prevent abuse
  if (str.length > 5000) {
    str = str.substring(0, 5000);
  }
  return str;
}

// ===== JSON Response Helper =====

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function authError(message) {
  return jsonResponse({ success: false, authRequired: true, error: message || 'กรุณาเข้าสู่ระบบใหม่' });
}

// ===== Sessions =====

function sessionKey(token) {
  return 'sess:' + token;
}

function revokedKey(psCode) {
  return 'revokedAt:' + String(psCode).trim().toLowerCase();
}

// ยกเลิกทุก session ของผู้ใช้ (ใช้เมื่อปิดบัญชี/เปลี่ยนระดับ/admin รีเซ็ตรหัส)
function revokeUserSessions(psCode) {
  PropertiesService.getScriptProperties().setProperty(revokedKey(psCode), String(Date.now()));
}

function createSession(user) {
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  var session = { psCode: user.psCode, name: user.name, group: user.group, level: user.level, issuedAt: Date.now() };
  CacheService.getScriptCache().put(sessionKey(token), JSON.stringify(session), SESSION_TTL_SECONDS);
  return token;
}

// คืนค่า session (และต่ออายุ) หรือ null ถ้า token ไม่ถูกต้อง/หมดอายุ
function getSession(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
  var cache = CacheService.getScriptCache();
  var raw = cache.get(sessionKey(token));
  if (!raw) return null;
  var session = JSON.parse(raw);
  var revokedAt = parseInt(PropertiesService.getScriptProperties().getProperty(revokedKey(session.psCode)) || '0', 10);
  if (revokedAt && (session.issuedAt || 0) < revokedAt) {
    cache.remove(sessionKey(token));
    return null;
  }
  cache.put(sessionKey(token), raw, SESSION_TTL_SECONDS);
  return session;
}

function destroySession(token) {
  if (typeof token === 'string' && token) {
    CacheService.getScriptCache().remove(sessionKey(token));
  }
}

function formatReporter(session) {
  return session.name + ' (' + session.psCode + ') - ' + session.group + '/' + session.level;
}

// ===== Request Parsing =====

function parsePostData(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var postContents = (e && e.postData && e.postData.contents) ? e.postData.contents : '';

  if (params.payload) return JSON.parse(params.payload);
  if (params.action) return params;
  if (!postContents) return null;
  try {
    return JSON.parse(postContents);
  } catch (parseErr) {
    // application/x-www-form-urlencoded เช่น payload=%7B...%7D
    if (postContents.indexOf('payload=') === 0) {
      return JSON.parse(decodeURIComponent(postContents.substring(8).replace(/\+/g, ' ')));
    }
    return params;
  }
}

// ===== HTTP Handlers =====

function doGet(e) {
  try {
    var action = e.parameter.action;

    // รายการยาเป็นข้อมูลสาธารณะ (ไม่มีข้อมูลผู้ป่วย/บุคลากร)
    if (action === 'getDrugs') {
      return getDrugsFromSheet();
    }

    if (action) {
      // login / getErrors ผ่าน GET ถูกปิด: รหัสผ่านและ token ใน URL จะถูกบันทึกใน log
      return jsonResponse({ success: false, error: 'Action "' + action + '" ต้องเรียกผ่าน POST' });
    }

    return jsonResponse({
      status: 'OK',
      message: 'Predispensing Error Recorder API is working',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return jsonResponse({ success: false, error: 'GET request error: ' + error.toString() });
  }
}

function doPost(e) {
  try {
    var data = parsePostData(e);
    if (!data) {
      return jsonResponse({ success: false, error: 'No data received' });
    }

    var action = data.action;

    // ===== Public actions =====
    if (action === 'login') {
      return loginUser(data.userCode, data.password);
    }
    if (action === 'getDrugList') {
      return getDrugList(SpreadsheetApp.openById(SPREADSHEET_ID));
    }
    if (action === 'register') {
      return registerUser(data);
    }
    if (action === 'requestPasswordReset') {
      return requestPasswordReset(data.userCode);
    }

    // ===== Authenticated actions =====
    var session = getSession(data.token);

    if (!session) {
      if (action === 'append' && new Date() < LEGACY_APPEND_UNTIL && !data.token) {
        return appendError(data, null, e);
      }
      return authError();
    }

    var allowedRoles = ROLE_ACTIONS[action];
    if (allowedRoles && allowedRoles.indexOf(session.level) === -1) {
      logAuditEvent('ACCESS_DENIED', session.psCode, 'Action: ' + action);
      return jsonResponse({ success: false, error: 'ไม่มีสิทธิ์ดำเนินการนี้' });
    }

    switch (action) {
      case 'logout':
        destroySession(data.token);
        return jsonResponse({ success: true });
      case 'getErrors':
        return getErrorsFromSheet(session);
      case 'append':
        return appendError(data, session, e);
      case 'changePassword':
        return changeUserPassword(session, data.currentPassword, data.newPassword);
      case 'addDrug':
      case 'replaceDrugList':
        return handleDrugOperation(SpreadsheetApp.openById(SPREADSHEET_ID), data, session);
      case 'listUsers':
        return listUsers();
      case 'approveUser':
        return approveUser(session, data.psCode, data.level);
      case 'rejectUser':
        return rejectUser(session, data.psCode);
      case 'updateUser':
        return updateUser(session, data.psCode, data.level, data.active);
      case 'adminResetPassword':
        return adminResetPassword(session, data.psCode);
    }

    return jsonResponse({ success: false, error: 'Invalid action or missing data' });

  } catch (error) {
    return jsonResponse({ success: false, error: 'Server error: ' + error.toString() });
  }
}

// ===== Error Reporting =====

/**
 * บันทึกรายงาน error
 * @param {Object} data - ข้อมูลจาก client
 * @param {Object|null} session - null = legacy client ช่วงเปลี่ยนผ่าน
 */
function appendError(data, session, e) {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ERROR_SHEET);
  if (!sheet) {
    return jsonResponse({ success: false, error: 'Sheet not found: ' + ERROR_SHEET });
  }
  if (!data.eventDate) {
    return jsonResponse({ success: false, error: 'กรุณาระบุวันที่เกิดเหตุการณ์' });
  }

  // Idempotency token check
  var submissionToken = data.submissionToken;
  if (submissionToken) {
    try {
      var cache = CacheService.getScriptCache();
      if (cache.get('sub:' + submissionToken)) {
        return jsonResponse({
          success: true,
          duplicate: true,
          idempotent: true,
          message: 'Duplicate submission ignored via token',
          submissionToken: submissionToken
        });
      }
      cache.put('sub:' + submissionToken, '1', 600);
    } catch (cacheErr) {
      // Non-fatal, continue without idempotency
    }
  }

  // ผู้รายงานมาจาก session เสมอ — ป้องกันการปลอมชื่อผู้รายงาน
  var reporter = session ? formatReporter(session) : data.reporter;

  var rowData = [
    sanitizeInput(data.eventDate),
    sanitizeInput(data.reportId),
    sanitizeInput(data.shift),
    sanitizeInput(data.errorType),
    sanitizeInput(data.location),
    sanitizeInput(data.process),
    sanitizeInput(data.errorDetail),
    sanitizeInput(data.correctItem),
    sanitizeInput(data.incorrectItem),
    sanitizeInput(data.cause),
    sanitizeInput(data.additionalDetails || ''),
    sanitizeInput(reporter),
    Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss')
  ];

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    // Duplicate Report ID check (ภายใน lock เพื่อกัน race condition)
    var reportId = data.reportId;
    if (reportId) {
      var lastRow = sheet.getLastRow();
      var ids = lastRow > 0 ? sheet.getRange(1, 2, lastRow, 1).getValues() : [];
      var isDuplicate = ids.some(function(row) { return row[0] === reportId; });
      if (isDuplicate) {
        return jsonResponse({
          success: false,
          error: 'Report ID ซ้ำ: ' + reportId + ' มีอยู่ในระบบแล้ว',
          duplicate: true,
          reportId: reportId
        });
      }
    }

    sheet.appendRow(rowData);
  } finally {
    lock.releaseLock();
  }

  logAuditEvent(session ? 'ERROR_RECORDED' : 'ERROR_RECORDED_LEGACY',
    session ? session.psCode : (data.reporter || ''),
    'Report ID: ' + (data.reportId || ''));

  // For form submissions, return HTML that closes the window
  if (e && e.parameter && e.parameter.payload) {
    return HtmlService.createHtmlOutput('<script>window.close();</script>');
  }

  return jsonResponse({
    success: true,
    message: 'Data appended successfully',
    timestamp: new Date().toISOString(),
    submissionToken: data.submissionToken || null
  });
}

// ===== Audit Logging Helper =====

function logAuditEvent(eventType, userCode, details) {
  try {
    var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    var auditSheet = spreadsheet.getSheetByName('Audit_Log');
    if (!auditSheet) {
      auditSheet = spreadsheet.insertSheet('Audit_Log');
      auditSheet.getRange(1, 1, 1, 5).setValues([['Timestamp', 'Event', 'UserCode', 'Details', 'IP']]);
      auditSheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#fff3cd');
    }
    var timestamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
    auditSheet.appendRow([timestamp, eventType, sanitizeInput(userCode), sanitizeInput(details), '']);
  } catch (e) {
    // Non-fatal: audit logging should not break main flow
    console.error('Audit logging failed:', e);
  }
}

// ===== Authentication (Server-side verification) =====

function loginFailureKey(normalizedCode) {
  return 'fail:' + normalizedCode;
}

/**
 * ตรวจสอบ credentials ฝั่ง server แล้วออก session token
 * @param {string} userCode - PS Code หรือ ID13
 * @param {string} password - รหัสผ่าน
 */
function loginUser(userCode, password) {
  try {
    if (!userCode || !password) {
      return jsonResponse({ success: false, error: 'กรุณาระบุ userCode และ password' });
    }

    var normalizedCode = userCode.toString().trim().toLowerCase();
    var cache = CacheService.getScriptCache();
    var failures = parseInt(cache.get(loginFailureKey(normalizedCode)) || '0', 10);
    if (failures >= LOGIN_MAX_FAILURES) {
      return jsonResponse({
        success: false,
        error: 'ใส่รหัสผ่านผิดเกิน ' + LOGIN_MAX_FAILURES + ' ครั้ง กรุณารอ 15 นาทีแล้วลองใหม่'
      });
    }

    var userSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USER_SHEET);
    if (!userSheet) {
      return jsonResponse({ success: false, error: 'ไม่พบ Sheet ชื่อ "' + USER_SHEET + '"' });
    }

    var values = userSheet.getDataRange().getValues();
    var inputPassword = password.toString().trim();
    var foundUser = null;
    var passwordMatch = false;
    var mustChangePassword = false;

    // หาแถวที่ตรงกับรหัส — ถ้ามีหลายแถว ให้แถวที่ active มาก่อน
    var rowIndex = -1;
    for (var i = 1; i < values.length; i++) {
      var psCode = (values[i][0] || '').toString().trim().toLowerCase();
      var id13 = (values[i][1] || '').toString().trim().toLowerCase();
      if (psCode !== normalizedCode && id13 !== normalizedCode) continue;
      if (rowIndex === -1 || isActiveStatus(values[i][7])) rowIndex = i;
      if (isActiveStatus(values[i][7])) break;
    }

    if (rowIndex !== -1) {
      var row = values[rowIndex];
      var rawId13 = (row[1] || '').toString().trim();
      var storedPassword = (row[6] || '').toString().trim();

      if (isHashedPassword(storedPassword)) {
        passwordMatch = verifyPassword(inputPassword, storedPassword);
      } else if (storedPassword) {
        // Legacy: plain text password
        passwordMatch = constantTimeEquals(inputPassword, storedPassword);
      }
      // ไม่มีรหัสผ่าน = login ไม่ได้ (เดิมใช้ 4 ตัวท้าย ID13 แต่ ID13 หลุดสู่สาธารณะแล้ว)

      // แจ้งสถานะบัญชีหลังตรวจรหัสผ่านแล้วเท่านั้น (ไม่เปิดเผยว่ามีบัญชีนี้อยู่)
      if (passwordMatch && !isActiveStatus(row[7])) {
        var request = (row[COL.REQUEST - 1] || '').toString();
        return jsonResponse({
          success: false,
          error: request === 'PENDING' ? 'บัญชีของคุณอยู่ระหว่างรอผู้ดูแลระบบอนุมัติ'
            : request === 'REJECTED' ? 'คำขอลงทะเบียนไม่ได้รับการอนุมัติ กรุณาติดต่อผู้ดูแลระบบ'
            : 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ'
        });
      }

      if (passwordMatch && BLOCK_WEAK_PASSWORD_LOGIN && isWeakPassword(inputPassword, rawId13)) {
        logAuditEvent('LOGIN_BLOCKED_WEAK', row[0], 'Default/weak password');
        return jsonResponse({
          success: false,
          error: 'รหัสผ่านเริ่มต้นถูกปิดใช้งานเพื่อความปลอดภัย กรุณากด "ลืมรหัสผ่าน" เพื่อขอรหัสผ่านชั่วคราวจากผู้ดูแลระบบ'
        });
      }

      if (passwordMatch) {
        mustChangePassword = isWeakPassword(inputPassword, rawId13) ||
          PropertiesService.getScriptProperties().getProperty(mustChangeKey(row[0])) === '1';
        if (needsRehash(storedPassword)) {
          try {
            userSheet.getRange(rowIndex + 1, COL.PASSWORD).setValue(hashPassword(inputPassword));
          } catch (migrateErr) {
            // Non-fatal: password still works, just not migrated yet
          }
        }
        foundUser = {
          psCode: (row[0] || '').toString().trim(),
          name: (row[2] || '').toString().trim(),
          group: (row[3] || '').toString().trim(),
          level: (row[4] || '').toString().trim(),
          email: (row[5] || '').toString().trim(),
          status: true
        };
      }
    }

    if (!foundUser) {
      cache.put(loginFailureKey(normalizedCode), String(failures + 1), LOGIN_LOCK_SECONDS);
      logAuditEvent('LOGIN_FAILED', userCode, 'Invalid credentials (attempt ' + (failures + 1) + ')');
      return jsonResponse({ success: false, error: 'ไม่พบผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    cache.remove(loginFailureKey(normalizedCode));
    logAuditEvent('LOGIN_SUCCESS', foundUser.psCode, mustChangePassword ? 'Weak password — must change' : 'Login successful');

    return jsonResponse({
      success: true,
      user: foundUser,
      token: createSession(foundUser),
      expiresIn: SESSION_TTL_SECONDS,
      mustChangePassword: mustChangePassword,
      message: 'เข้าสู่ระบบสำเร็จ',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in loginUser:', error);
    return jsonResponse({ success: false, error: 'เกิดข้อผิดพลาดในการตรวจสอบผู้ใช้: ' + error.toString() });
  }
}

// ===== Drug Functions =====

function toHadLabel(value) {
  return (value === 1 || value === '1' || value === true || value === 'High' || value === 'TRUE') ? 'High' : 'Regular';
}

function toActive(value) {
  return value === true || value === 'TRUE' || value === 'true' || value == 1 || value === 'Active';
}

// Get drugs from Drug_List sheet (public GET)
function getDrugsFromSheet() {
  try {
    var drugSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(DRUG_SHEET);
    if (!drugSheet) {
      return jsonResponse({ success: true, data: [], message: 'ไม่พบ Sheet "' + DRUG_SHEET + '"' });
    }

    var values = drugSheet.getDataRange().getValues();
    var drugs = values.slice(1).map(function(row) {
      return {
        code: row[0] || '',
        name: row[1] || '',
        group: row[2] || '',
        had: toHadLabel(row[3]),
        status: toActive(row[4]),
        unit: row[5] || '',
        strength: row[6] || '',
        dosageForm: row[7] || '',
        tmtCode: row[8] || '',
        unitPrice: row[9] || 0
      };
    }).filter(function(drug) { return drug.code && drug.status; });

    return jsonResponse({ success: true, data: drugs, count: drugs.length, timestamp: new Date().toISOString() });

  } catch (error) {
    return jsonResponse({ success: false, error: 'Error getting drug list: ' + error.toString() });
  }
}

function isOwnReport(row, session) {
  var reporter = String(row[11] || '');
  return reporter.indexOf('(' + session.psCode + ')') !== -1 ||
    (session.name && reporter.indexOf(session.name) !== -1);
}

// ระดับ user: รายงานของคนอื่นตัดชื่อผู้รายงานและรายละเอียดเพิ่มเติมออก (ยังใช้ทำสถิติได้)
function redactReportsFor(values, session) {
  if (FULL_REPORT_ACCESS.indexOf(session.level) !== -1) return values;
  return values.map(function(row, i) {
    if (i === 0 || isOwnReport(row, session)) return row;
    var copy = row.slice();
    copy[10] = '';
    copy[11] = REDACTED_REPORTER;
    return copy;
  });
}

// Get errors from Predispensing_Errors sheet (authenticated)
function getErrorsFromSheet(session) {
  try {
    var errorSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ERROR_SHEET);
    if (!errorSheet) {
      return jsonResponse({ success: true, data: [], message: 'ไม่พบ Sheet "' + ERROR_SHEET + '"' });
    }

    var values = redactReportsFor(errorSheet.getDataRange().getValues(), session);
    return jsonResponse({ success: true, data: values, count: values.length, timestamp: new Date().toISOString() });

  } catch (error) {
    return jsonResponse({ success: false, error: 'Error getting error data: ' + error.toString() });
  }
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
    var drugs = values.slice(1).map(function(row) {
      return {
        drugCode: row[0] || '',
        drugName: row[1] || '',
        group: row[2] || '',
        had: toHadLabel(row[3]),
        status: toActive(row[4]) ? 'Active' : 'Inactive',
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

// ===== Registration (public) =====

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

// ===== Password reset request (public) =====

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

// ===== User management (admin) =====

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

function updateUser(session, psCode, level, active) {
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
  if (changes.length === 0) {
    return jsonResponse({ success: false, error: 'ไม่มีข้อมูลที่จะเปลี่ยน' });
  }

  revokeUserSessions(psCode);
  logAuditEvent('USER_UPDATED', session.psCode, psCode + ' ' + changes.join(', '));
  return jsonResponse({ success: true, message: 'บันทึกการเปลี่ยนแปลงของ ' + psCode + ' แล้ว' });
}

// ออกรหัสผ่านชั่วคราว — ส่งกลับครั้งเดียวให้ admin แจ้งผู้ใช้ด้วยตนเอง
function adminResetPassword(session, psCode) {
  var found = findUserRow(psCode);
  if (!found) {
    return jsonResponse({ success: false, error: 'ไม่พบผู้ใช้' });
  }

  var temp = generateTempPassword();
  found.sheet.getRange(found.rowNumber, COL.PASSWORD).setValue(hashPassword(temp));
  PropertiesService.getScriptProperties().setProperty(mustChangeKey(found.row[0]), '1');
  revokeUserSessions(found.row[0]);
  CacheService.getScriptCache().remove(loginFailureKey(String(found.row[0]).trim().toLowerCase()));

  var resetSheet = getResetSheet();
  var resetRows = resetSheet.getDataRange().getValues();
  for (var i = 1; i < resetRows.length; i++) {
    if (resetRows[i][1] === found.row[0] && resetRows[i][3] === 'PENDING') {
      resetSheet.getRange(i + 1, 4, 1, 3).setValues([['DONE', session.psCode, nowText()]]);
    }
  }

  logAuditEvent('ADMIN_RESET_PASSWORD', session.psCode, String(found.row[0]));
  return jsonResponse({ success: true, psCode: String(found.row[0]), name: String(found.row[2]), tempPassword: temp });
}

// ===== Change Password =====

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

// รายชื่อผู้ใช้ที่ยังใช้รหัสผ่านเริ่มต้น/อ่อน (ตรวจจาก hash) — ใช้ติดตามการเปลี่ยนรหัส
function auditWeakPasswords() {
  var userSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USER_SHEET);
  var values = userSheet.getDataRange().getValues().slice(1);
  var weak = [];

  values.forEach(function(row) {
    var psCode = (row[0] || '').toString().trim();
    var id13 = (row[1] || '').toString().trim();
    var stored = (row[6] || '').toString().trim();
    if (!psCode) return;

    var candidates = WEAK_PASSWORDS.concat(id13 ? [id13, id13.slice(-4)] : []);
    var isWeak = !stored || (!isHashedPassword(stored) && isWeakPassword(stored, id13)) ||
      // ตรวจเฉพาะ hash แบบเก่า (รอบเดียว, เร็ว) — hash ใหม่ผ่าน isWeakPassword ตอนตั้งรหัสแล้ว
      (stored.indexOf(LEGACY_HASH_PREFIX) === 0 && candidates.some(function(pw) { return verifyPassword(pw, stored); }));
    if (isWeak) weak.push(psCode);
  });

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
