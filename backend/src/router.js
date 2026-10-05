// doGet / doPost — API v2 (action มีจุด เช่น auth.login)
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน
//
// Deploy: `npm run deploy:backend` (clasp push + create-deployment -i <id> เดิม → URL ไม่เปลี่ยน)
// Web app: Execute as "Me", access ANYONE_ANONYMOUS (ดู appsscript.json)
//
// ความปลอดภัย:
// - ใช้ API v2 เท่านั้น (ดู api-v2.js): ทุก action ยกเว้น auth.login/activate/register/requestReset
//   และ drugs.list ต้องส่ง `token`
// - สิทธิ์ (role) ตรวจฝั่ง server เสมอ — การซ่อนปุ่มฝั่ง client เป็นแค่ UX
// - Google Sheet ต้อง "จำกัดสิทธิ์" (ไม่เปิด Anyone with the link) มิฉะนั้นข้าม API นี้ได้

// แอปเวอร์ชันเดิม (cache ในเบราว์เซอร์) เรียก action แบบไม่มีจุด → แจ้งให้รีโหลด
function appUpdatedResponse() {
  return jsonResponse({
    success: false,
    ok: false,
    code: 'APP_UPDATED',
    error: 'แอปมีเวอร์ชันใหม่ กรุณารีโหลดหน้าเว็บ (Ctrl+F5)'
  });
}

function doGet(e) {
  try {
    drugIndexMemo = null;
    var action = String((e && e.parameter && e.parameter.action) || '');
    if (action === 'drugs.list') return handleV2(action, {}, null);
    if (action) return appUpdatedResponse();
    return jsonResponse({ status: 'OK', message: 'Predispensing Error Recorder API v2', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error(error);
    return v2Fail('SERVER_ERROR', 'Server error: ' + error.toString());
  }
}

function doPost(e) {
  try {
    drugIndexMemo = null;
    var params = (e && e.parameter) ? e.parameter : {};
    var action = String(params.action || '');
    if (action.indexOf('.') === -1) return appUpdatedResponse();

    var payload = {};
    if (params.payload) {
      try {
        payload = JSON.parse(params.payload);
      } catch (parseErr) {
        return v2Fail('BAD_REQUEST', 'payload ไม่ใช่ JSON');
      }
    }
    return handleV2(action, payload, params.token);
  } catch (error) {
    console.error(error);
    return v2Fail('SERVER_ERROR', 'Server error: ' + error.toString());
  }
}
