// Google Apps Script Code สำหรับ Predispensing Error Recorder
// วิธีใช้: คัดลอกโค้ดนี้ไปใส่ใน Google Apps Script และ Deploy เป็น Web App
// การตั้งค่า Deploy: Execute as "Me", Who has access "Anyone"

// ⚠️ สำคัญ: ต้องแทนที่ SPREADSHEET_ID ด้วย ID จริงของ Google Sheets
const SPREADSHEET_ID = '1QDIxEXCVLiA7oijXN15N2ZH2LzPtHDecbqolYGs9Ldk';

const PASSWORD_HASH_PREFIX = 'sha256$';

// ===== Password Hashing Utilities =====

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

function generateSalt() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function hashPasswordWithSalt(password, salt) {
  return PASSWORD_HASH_PREFIX + salt + '$' + sha256Hex(salt + ':' + password);
}

function isHashedPassword(storedValue) {
  return typeof storedValue === 'string' && storedValue.indexOf(PASSWORD_HASH_PREFIX) === 0;
}

function verifyPassword(inputPassword, storedValue) {
  if (!storedValue || !inputPassword) return false;
  if (!isHashedPassword(storedValue)) return false;
  var parts = storedValue.split('$');
  if (parts.length !== 3) return false;
  var salt = parts[1];
  var expectedHash = parts[2];
  var actualHash = sha256Hex(salt + ':' + inputPassword);
  return actualHash === expectedHash;
}

// ===== Sanitization Helper =====

/**
 * ทำความสะอาด input เพื่อป้องกัน formula injection และ XSS
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

/**
 * สร้าง JSON response พร้อม headers มาตรฐาน
 * @param {Object} obj - payload ที่จะส่งกลับ
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== HTTP Handlers =====

function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === 'login') {
      return loginUser(e.parameter.userCode, e.parameter.password);
    } else if (action === 'getUsers') {
      return jsonResponse({
        success: false,
        error: 'Authentication via GET is disabled. Use POST action=login.'
      });
    } else if (action === 'getDrugs') {
      return getDrugsFromSheet();
    } else if (action === 'getErrors') {
      return getErrorsFromSheet();
    }

    return jsonResponse({
      status: 'OK',
      message: 'Predispensing Error Recorder API is working',
      timestamp: new Date().toISOString(),
      availableActions: ['login', 'changePassword', 'getDrugs', 'getErrors', 'getDrugList', 'addDrug', 'replaceDrugList', 'append']
    });

  } catch (error) {
    return jsonResponse({
      success: false,
      error: 'GET request error: ' + error.toString()
    });
  }
}

// Handle OPTIONS request for CORS preflight
function doOptions(e) {
  return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    // Handle CORS preflight
    if (e.parameter && e.parameter.method === 'OPTIONS') {
      return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
    }

    let data;
    var params = (e && e.parameter) ? e.parameter : {};
    var postContents = (e && e.postData && e.postData.contents) ? e.postData.contents : '';

    // Handle different types of POST data
    if (params.payload) {
      data = JSON.parse(params.payload);
    } else if (params.action) {
      data = params;
    } else if (postContents) {
      try {
        data = JSON.parse(postContents);
      } catch (parseErr) {
        // application/x-www-form-urlencoded เช่น payload=%7B...%7D
        if (postContents.indexOf('payload=') === 0) {
          var payloadValue = decodeURIComponent(postContents.substring(8).replace(/\+/g, ' '));
          data = JSON.parse(payloadValue);
        } else {
          data = params || {};
        }
      }
    } else {
      return jsonResponse({ error: 'No data received' });
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);

    // ===== Authentication (Server-side only) =====
    if (data.action === 'login' || data.action === 'getUsers') {
      return loginUser(data.userCode, data.password);
    }

    // ===== Change Password =====
    if (data.action === 'changePassword') {
      return changeUserPassword(
        spreadsheet,
        data.userCode,
        data.currentPassword,
        data.newPassword
      );
    }

    // ===== Drug Operations =====
    if (data.action === 'addDrug' || data.action === 'replaceDrugList') {
      return handleDrugOperation(spreadsheet, data);
    }

    if (data.action === 'getDrugList') {
      return getDrugList(spreadsheet, data.drugSheetName || 'Drug_List');
    }

    // ===== Error Reporting =====
    const sheet = spreadsheet.getSheetByName(data.sheetName || 'Predispensing_Errors');

    if (!sheet) {
      return jsonResponse({
        error: 'Sheet not found: ' + (data.sheetName || 'Predispensing_Errors')
      });
    }

    if (data.action === 'append') {
      if (data.eventDate) {
        // Idempotency token check
        var submissionToken = data.submissionToken;
        if (submissionToken) {
          try {
            var cache = CacheService.getScriptCache();
            var existing = cache.get(submissionToken);
            if (existing) {
              return jsonResponse({
                success: true,
                duplicate: true,
                idempotent: true,
                message: 'Duplicate submission ignored via token',
                submissionToken: submissionToken
              });
            } else {
              cache.put(submissionToken, '1', 600);
            }
          } catch (cacheErr) {
            // Non-fatal, continue without idempotency
          }
        }

        // Duplicate Report ID check
        const reportId = data.reportId;
        if (reportId) {
          const existingData = sheet.getDataRange().getValues();
          const isDuplicate = existingData.some(row => row[1] === reportId);
          if (isDuplicate) {
            return jsonResponse({
              error: 'Report ID ซ้ำ: ' + reportId + ' มีอยู่ในระบบแล้ว',
              duplicate: true,
              reportId: reportId
            });
          }
        }

        // ===== Sanitize inputs before write =====
        const rowData = [
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
          sanitizeInput(data.reporter),
          Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss')
        ];

        // ===== LockService: ป้องกัน concurrent write =====
        const lock = LockService.getScriptLock();
        try {
          lock.waitLock(10000);
          sheet.appendRow(rowData);
          logAuditEvent('ERROR_RECORDED', data.reporter || '', 'Report ID: ' + (data.reportId || ''));
        } finally {
          lock.releaseLock();
        }

      } else if (data.data) {
        // Handle JSON format (legacy)
        const lock = LockService.getScriptLock();
        try {
          lock.waitLock(10000);
          sheet.appendRow(data.data);
        } finally {
          lock.releaseLock();
        }
      }

      // For form submissions, return HTML that closes the window
      if (e.parameter && e.parameter.payload) {
        return HtmlService.createHtmlOutput('<script>window.close();</script>');
      }

      return jsonResponse({
        success: true,
        message: 'Data appended successfully',
        timestamp: new Date().toISOString(),
        submissionToken: data.submissionToken || null
      });
    }

    return jsonResponse({ error: 'Invalid action or missing data' });

  } catch (error) {
    return jsonResponse({
      error: 'Server error: ' + error.toString()
    });
  }
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
    auditSheet.appendRow([timestamp, eventType, userCode || '', details || '', '']);
  } catch (e) {
    // Non-fatal: audit logging should not break main flow
    console.error('Audit logging failed:', e);
  }
}

// ===== Authentication (Server-side verification) =====

/**
 * ตรวจสอบ credentials ฝั่ง server และส่งกลับเฉพาะข้อมูล user (ไม่มี password)
 * @param {string} userCode - PS Code หรือ ID13
 * @param {string} password - รหัสผ่าน
 */
function loginUser(userCode, password) {
  try {
    if (!userCode || !password) {
      return jsonResponse({
        success: false,
        error: 'กรุณาระบุ userCode และ password'
      });
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const userSheet = spreadsheet.getSheetByName('Users');

    if (!userSheet) {
      return jsonResponse({
        success: false,
        error: 'ไม่พบ Sheet ชื่อ "Users" กรุณาสร้าง Sheet และนำเข้าข้อมูลจาก sample_users.csv'
      });
    }

    const range = userSheet.getDataRange();
    const values = range.getValues();

    if (values.length <= 1) {
      return jsonResponse({
        success: false,
        error: 'ไม่พบข้อมูลผู้ใช้ใน Sheet "Users"'
      });
    }

    const normalizedCode = userCode.toString().trim().toLowerCase();

    // ค้นหาผู้ใช้จาก PS Code หรือ ID13
    let foundUser = null;
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var psCode = (row[0] || '').toString().trim().toLowerCase();
      var id13   = (row[1] || '').toString().trim().toLowerCase();
      var status = row[7] === true || row[7] === 'TRUE' || row[7] === 'true';

      if ((psCode === normalizedCode || id13 === normalizedCode) && status) {
        // ตรวจสอบรหัสผ่านจากคอลัมน์ G (index 6)
        var storedPassword = (row[6] || '').toString().trim();
        var inputPassword = password.toString().trim();

        var passwordMatch = false;

        if (isHashedPassword(storedPassword)) {
          // รหัสผ่านถูก hash แล้ว — ตรวจสอบด้วย verifyPassword
          passwordMatch = verifyPassword(inputPassword, storedPassword);
        } else if (storedPassword) {
          // Legacy: plain text password — ตรวจสอบตรงๆ แล้ว migrate เป็น hash
          passwordMatch = (inputPassword === storedPassword);
          if (passwordMatch) {
            // Auto-migrate to hashed password
            try {
              var salt = generateSalt();
              var hashed = hashPasswordWithSalt(inputPassword, salt);
              var spreadsheetForUpdate = SpreadsheetApp.openById(SPREADSHEET_ID);
              var userSheetForUpdate = spreadsheetForUpdate.getSheetByName('Users');
              if (userSheetForUpdate) {
                userSheetForUpdate.getRange(i + 1, 7).setValue(hashed);
              }
            } catch (migrateErr) {
              // Non-fatal: password still works, just not migrated yet
            }
          }
        } else {
          // Fallback: ถ้าไม่มี password ในคอลัมน์ G ใช้ 4 ตัวท้ายของ ID13
          var rawId13 = (row[1] || '').toString().trim();
          var expectedPassword = rawId13.slice(-4);
          passwordMatch = (inputPassword === expectedPassword);
          if (passwordMatch) {
            // Auto-migrate to hashed password
            try {
              var salt = generateSalt();
              var hashed = hashPasswordWithSalt(inputPassword, salt);
              var spreadsheetForUpdate = SpreadsheetApp.openById(SPREADSHEET_ID);
              var userSheetForUpdate = spreadsheetForUpdate.getSheetByName('Users');
              if (userSheetForUpdate) {
                userSheetForUpdate.getRange(i + 1, 7).setValue(hashed);
              }
            } catch (migrateErr) {
              // Non-fatal
            }
          }
        }

        if (!passwordMatch) {
          logAuditEvent('LOGIN_FAILED', userCode, 'Invalid password');
          return jsonResponse({ success: false, error: 'รหัสผ่านไม่ถูกต้อง' });
        }

        // ✅ Login สำเร็จ — ส่งกลับเฉพาะข้อมูล user (ไม่มี password)
        logAuditEvent('LOGIN_SUCCESS', userCode, 'Login successful');
        foundUser = {
          psCode: (row[0] || '').toString().trim(),
          id13:   (row[1] || '').toString().trim(),
          name:   (row[2] || '').toString().trim(),
          group:  (row[3] || '').toString().trim(),
          level:  (row[4] || '').toString().trim(),
          email:  (row[5] || '').toString().trim(),
          status: true
        };
        break;
      }
    }

    if (!foundUser) {
      logAuditEvent('LOGIN_FAILED', userCode, 'User not found or inactive');
      return jsonResponse({ success: false, error: 'ไม่พบผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    return jsonResponse({
      success: true,
      user: foundUser,
      message: 'เข้าสู่ระบบสำเร็จ',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in loginUser:', error);
    return jsonResponse({
      success: false,
      error: 'เกิดข้อผิดพลาดในการตรวจสอบผู้ใช้: ' + error.toString()
    });
  }
}

// ===== Drug Functions =====

// Get drugs from Drug_List sheet
function getDrugsFromSheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const drugSheet = spreadsheet.getSheetByName('Drug_List');

    if (!drugSheet) {
      return jsonResponse({
        success: true,
        data: [],
        message: 'ไม่พบ Sheet "Drug_List" ระบบจะสร้างเมื่อมีการเพิ่มยาใหม่'
      });
    }

    const range = drugSheet.getDataRange();
    const values = range.getValues();

    if (values.length <= 1) {
      return jsonResponse({
        success: true,
        data: [],
        message: 'ไม่มีข้อมูลยาใน Sheet'
      });
    }

    const drugs = values.slice(1).map(row => ({
      code: row[0] || '',
      name: row[1] || '',
      group: row[2] || '',
      had: row[3] || '',
      status: row[4] === true || row[4] === 'TRUE' || row[4] === 'true' || row[4] == 1,
      unit: row[5] || '',
      strength: row[6] || '',
      dosageForm: row[7] || '',
      tmtCode: row[8] || '',
      unitPrice: row[9] || 0
    })).filter(drug => drug.code && drug.status);

    return jsonResponse({
      success: true,
      data: drugs,
      count: drugs.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return jsonResponse({
      success: false,
      error: 'Error getting drug list: ' + error.toString()
    });
  }
}

// Get errors from Predispensing_Errors sheet
function getErrorsFromSheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const errorSheet = spreadsheet.getSheetByName('Predispensing_Errors');

    if (!errorSheet) {
      return jsonResponse({
        success: true,
        data: [],
        message: 'ไม่พบ Sheet "Predispensing_Errors"'
      });
    }

    const range = errorSheet.getDataRange();
    const values = range.getValues();

    return jsonResponse({
      success: true,
      data: values,
      count: values.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return jsonResponse({
      success: false,
      error: 'Error getting error data: ' + error.toString()
    });
  }
}

// Handle drug list operations
function handleDrugOperation(spreadsheet, data) {
  try {
    const targetDrugSheetName = data.drugSheetName || 'Drug_List';
    let drugSheet = spreadsheet.getSheetByName(targetDrugSheetName);

    if (!drugSheet) {
      drugSheet = spreadsheet.insertSheet(targetDrugSheetName);
      drugSheet.getRange(1, 1, 1, 10).setValues([['Drug Code', 'Drug Name', 'Group', 'HAD', 'Status', 'Unit', 'Strength', 'Dosage Form', 'TMT Code', 'Unit Price']]);
      drugSheet.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#e1f5fe');
    }

    if (data.action === 'addDrug') {
      const existingData = drugSheet.getDataRange().getValues();
      const drugCodeExists = existingData.some((row, index) =>
        index > 0 && row[0] === data.drugCode
      );

      if (drugCodeExists) {
        return jsonResponse({
          error: 'รหัสยาซ้ำ: ' + data.drugCode + ' มีอยู่ในระบบแล้ว'
        });
      }

      const lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000);
        drugSheet.appendRow([
          sanitizeInput(data.drugCode),
          sanitizeInput(data.drugName),
          sanitizeInput(data.group),
          data.had === 'High' ? 1 : 0,
          data.status === 'Active' ? 1 : 0,
          sanitizeInput(data.unit || ''),
          sanitizeInput(data.strength || ''),
          sanitizeInput(data.dosageForm || ''),
          sanitizeInput(data.tmtCode || ''),
          data.unitPrice || 0
        ]);
      } finally {
        lock.releaseLock();
      }

      return jsonResponse({
        success: true,
        message: 'เพิ่มรายการยาเรียบร้อยแล้ว',
        timestamp: new Date().toISOString()
      });
    }

    if (data.action === 'replaceDrugList') {
      if (!Array.isArray(data.drugs)) {
        return jsonResponse({ success: false, error: 'drugs must be an array' });
      }

      const lock = LockService.getScriptLock();
      try {
        lock.waitLock(15000);
        const lastRow = drugSheet.getLastRow();
        if (lastRow > 1) {
          drugSheet.getRange(2, 1, lastRow - 1, 10).clearContent();
        }
        if (data.drugs.length > 0) {
          const rows = data.drugs.map(drug => [
            sanitizeInput(drug.drugCode || ''),
            sanitizeInput(drug.drugName || ''),
            sanitizeInput(drug.group || ''),
            (drug.had === 'High' || drug.had === 1 || drug.had === true) ? 1 : 0,
            (drug.status === 'Active' || drug.status === 1 || drug.status === true) ? 1 : 0,
            sanitizeInput(drug.unit || ''),
            sanitizeInput(drug.strength || ''),
            sanitizeInput(drug.dosageForm || ''),
            sanitizeInput(drug.tmtCode || ''),
            drug.unitPrice || 0
          ]);
          drugSheet.getRange(2, 1, rows.length, 10).setValues(rows);
        }
      } finally {
        lock.releaseLock();
      }

      return jsonResponse({
        success: true,
        message: 'Drug list replaced successfully',
        count: data.drugs.length,
        timestamp: new Date().toISOString()
      });
    }

    return jsonResponse({ error: 'Invalid drug operation' });

  } catch (error) {
    return jsonResponse({
      error: 'Drug operation error: ' + error.toString()
    });
  }
}

// Get drug list from Drug_List sheet
function getDrugList(spreadsheet, drugSheetName = 'Drug_List') {
  try {
    const drugSheet = spreadsheet.getSheetByName(drugSheetName);

    if (!drugSheet) {
      return jsonResponse({
        success: true,
        data: [],
        message: `No ${drugSheetName} sheet found`
      });
    }

    const range = drugSheet.getDataRange();
    const values = range.getValues();

    if (values.length <= 1) {
      return jsonResponse({
        success: true,
        data: [],
        message: 'No drug data found'
      });
    }

    const drugs = values.slice(1).map(row => ({
      drugCode: row[0] || '',
      drugName: row[1] || '',
      group: row[2] || '',
      had: row[3] == 1 ? 'High' : 'Regular',
      status: row[4] == 1 ? 'Active' : 'Inactive',
      unit: row[5] || '',
      strength: row[6] || '',
      dosageForm: row[7] || '',
      tmtCode: row[8] || '',
      unitPrice: row[9] || 0
    }));

    return jsonResponse({
      success: true,
      data: drugs,
      count: drugs.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return jsonResponse({
      error: 'Error getting drug list: ' + error.toString()
    });
  }
}

// ===== Admin Utilities (Run manually in Apps Script editor) =====

// Run once in Apps Script editor to migrate legacy plain-text passwords.
function migrateUsersToHashedPasswords() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var userSheet = spreadsheet.getSheetByName('Users');
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
    if (!current) { skipped++; continue; }
    if (isHashedPassword(current)) { skipped++; continue; }
    var salt = generateSalt();
    values[i][0] = hashPasswordWithSalt(current, salt);
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

  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var userSheet = spreadsheet.getSheetByName('Users');
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

  var salt = generateSalt();
  var hashed = hashPasswordWithSalt(newPassword.toString(), salt);
  userSheet.getRange(targetIndex + 2, 7).setValue(hashed);

  return {
    success: true,
    user: psCodeOrId13,
    message: 'Password updated in hashed format'
  };
}

// ===== Change Password =====

function changeUserPassword(spreadsheet, userCode, currentPassword, newPassword) {
  try {
    if (!userCode || !currentPassword || !newPassword) {
      return jsonResponse({
        success: false,
        error: 'userCode, currentPassword and newPassword are required'
      });
    }

    var normalizedCode = userCode.toString().trim().toLowerCase();
    var nextPassword = newPassword.toString();

    if (nextPassword.length < 8) {
      return jsonResponse({
        success: false,
        error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร'
      });
    }

    if (currentPassword === newPassword) {
      return jsonResponse({
        success: false,
        error: 'รหัสผ่านใหม่ต้องแตกต่างจากรหัสผ่านเดิม'
      });
    }

    var userSheet = spreadsheet.getSheetByName('Users');
    if (!userSheet) {
      return jsonResponse({ success: false, error: 'Users sheet not found' });
    }

    var lastRow = userSheet.getLastRow();
    if (lastRow <= 1) {
      return jsonResponse({ success: false, error: 'No user data found' });
    }

    var values = userSheet.getRange(2, 1, lastRow - 1, 8).getValues();
    var targetIndex = -1;
    var storedPassword = '';
    var userStatus = false;

    for (var i = 0; i < values.length; i++) {
      var psCode = (values[i][0] || '').toString().trim().toLowerCase();
      var id13 = (values[i][1] || '').toString().trim().toLowerCase();
      if (psCode === normalizedCode || id13 === normalizedCode) {
        targetIndex = i;
        storedPassword = (values[i][6] || '').toString().trim();
        userStatus = values[i][7] === true || values[i][7] === 'TRUE' || values[i][7] === 'true';
        break;
      }
    }

    if (targetIndex === -1) {
      return jsonResponse({ success: false, error: 'ไม่พบผู้ใช้' });
    }

    if (!userStatus) {
      return jsonResponse({ success: false, error: 'บัญชีผู้ใช้ถูกปิดใช้งาน' });
    }

    if (!verifyPassword(currentPassword.toString(), storedPassword)) {
      return jsonResponse({ success: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    }

    var salt = generateSalt();
    var hashed = hashPasswordWithSalt(nextPassword, salt);
    userSheet.getRange(targetIndex + 2, 7).setValue(hashed);

    return jsonResponse({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' });

  } catch (error) {
    return jsonResponse({
      success: false,
      error: 'Error changing password: ' + error.toString()
    });
  }
}
