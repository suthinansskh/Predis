// doGet / doPost — action เดิม (compat) และ API v2 (action มีจุด เช่น auth.login)
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน
//
// Deploy: `npm run deploy:backend` (clasp push + create-deployment -i <id> เดิม → URL ไม่เปลี่ยน)
// Web app: Execute as "Me", access ANYONE_ANONYMOUS (ดู appsscript.json)
//
// ความปลอดภัย:
// - ทุก action ยกเว้น login / register / getDrugs ต้องส่ง `token` ที่ได้จาก login
// - สิทธิ์ (role) ตรวจฝั่ง server เสมอ — การซ่อนปุ่มฝั่ง client เป็นแค่ UX
// - Google Sheet ต้อง "จำกัดสิทธิ์" (ไม่เปิด Anyone with the link) มิฉะนั้นข้าม API นี้ได้

function doGet(e) {
  try {
    var action = e.parameter.action;
    drugIndexMemo = null;

    // v2: รายการยา (สาธารณะ, GET แคชได้)
    if (action === 'drugs.list') {
      return handleV2(action, {}, null);
    }

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
    drugIndexMemo = null;
    var params = (e && e.parameter) ? e.parameter : {};
    if (params.action && String(params.action).indexOf('.') !== -1) {
      var payload = {};
      if (params.payload) {
        try {
          payload = JSON.parse(params.payload);
        } catch (parseErr) {
          return v2Fail('BAD_REQUEST', 'payload ไม่ใช่ JSON');
        }
      }
      return handleV2(String(params.action), payload, params.token);
    }

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
      case 'updateDrug':
        return updateDrug(session, data);
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
        return updateUser(session, data.psCode, data.level, data.active, data.group);
      case 'adminResetPassword':
        return adminResetPassword(session, data.psCode);
    }

    return jsonResponse({ success: false, error: 'Invalid action or missing data' });

  } catch (error) {
    console.error(error);
    if (e && e.parameter && String(e.parameter.action || '').indexOf('.') !== -1) {
      return v2Fail('SERVER_ERROR', 'Server error: ' + error.toString());
    }
    return jsonResponse({ success: false, error: 'Server error: ' + error.toString() });
  }
}

// ===== Error Reporting =====
