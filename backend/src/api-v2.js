// API v2 — action มีจุด (เช่น auth.login) ส่งเป็น FormData: action, token, payload(JSON)
// ตอบรูปแบบเดียว: {ok:true, data} | {ok:false, error:{code, message, ...}}
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน

function v2Ok(data) {
  return jsonResponse({ ok: true, data: data === undefined ? null : data });
}

function v2Fail(code, message, extra) {
  var error = { code: code, message: message };
  if (extra) Object.keys(extra).forEach(function(k) { if (extra[k] !== undefined) error[k] = extra[k]; });
  return jsonResponse({ ok: false, error: error });
}

// ผลลัพธ์ภายใน {ok, data} | {ok:false, code, message, ...} → response
function v2Result(result) {
  if (result.ok) return v2Ok(result.data);
  var extra = {};
  Object.keys(result).forEach(function(k) { if (['ok', 'code', 'message'].indexOf(k) === -1) extra[k] = result[k]; });
  return v2Fail(result.code || 'ERROR', result.message || 'เกิดข้อผิดพลาด', extra);
}

// ใช้ฟังก์ชันเดิมที่คืน jsonResponse({success, error, ...}) ใน v2
function v2FromLegacy(output) {
  var body = JSON.parse(output.getContent());
  if (body.success) {
    delete body.success;
    return v2Ok(body);
  }
  return v2Fail(body.code || (body.authRequired ? 'AUTH_REQUIRED' : 'ERROR'), body.error || 'เกิดข้อผิดพลาด');
}

// สร้างเมื่อเรียกครั้งแรก: Apps Script โหลดไฟล์ตามลำดับ ค่าคงที่จากไฟล์อื่น (เช่น DRUG_MANAGERS)
// จึงยังใช้ไม่ได้ตอนโหลดไฟล์นี้
var v2RoutesMemo = null;

function v2Routes() {
  if (!v2RoutesMemo) v2RoutesMemo = buildV2Routes();
  return v2RoutesMemo;
}

function buildV2Routes() {
  return {
  // ----- public -----
  'auth.login': { public: true, handler: function(p) {
    var result = authenticate(p.userCode, p.password);
    if (!result.ok) return v2Result(result);
    return v2Ok({ user: result.user, token: signToken(result.user), expiresIn: TOKEN_TTL_MS / 1000, mustChangePassword: result.mustChangePassword });
  } },
  'auth.activate': { public: true, handler: function(p) { return v2Result(activateAccount(p)); } },
  'auth.register': { public: true, handler: function(p) { return v2FromLegacy(registerUser(p)); } },
  'auth.requestReset': { public: true, handler: function(p) { return v2FromLegacy(requestPasswordReset(p.userCode)); } },
  'drugs.list': { public: true, handler: function() { return v2Ok({ drugs: cachedDrugList() }); } },
  'drugs.overrides': { public: true, handler: function() { return v2Ok({ overrides: drugOverridesList() }); } },

  // ----- authenticated -----
  'auth.me': { handler: function(p, s) { return v2Ok(sessionSummary(s)); } },
  'auth.logout': { handler: function(p, s, token) { destroySession(token); return v2Ok(); } },
  'auth.changePassword': { handler: function(p, s) { return v2FromLegacy(changeUserPassword(s, p.currentPassword, p.newPassword)); } },
  'reports.create': { handler: function(p, s) { return v2Result(createReport(s, p)); } },
  'reports.list': { handler: function(p, s) { return v2Result(listReports(s, p)); } },
  'reports.stats': { handler: function(p, s) { return v2Result(getReportStats(s, p)); } },
  'drugs.update': { roles: DRUG_MANAGERS, handler: function(p, s) { return v2FromLegacy(updateDrug(s, p)); } },
  'drugs.add': { roles: DRUG_MANAGERS, handler: function(p, s) {
    p.action = 'addDrug';
    return v2FromLegacy(handleDrugOperation(SpreadsheetApp.openById(SPREADSHEET_ID), p, s));
  } },
  'users.list': { roles: ['admin'], handler: function() { return v2FromLegacy(listUsers()); } },
  'users.approve': { roles: ['admin'], handler: function(p, s) { return v2FromLegacy(approveUser(s, p.psCode, p.level)); } },
  'users.reject': { roles: ['admin'], handler: function(p, s) { return v2FromLegacy(rejectUser(s, p.psCode)); } },
  'users.update': { roles: ['admin'], handler: function(p, s) { return v2FromLegacy(updateUser(s, p.psCode, p.level, p.active, p.group)); } },
  'users.issueActivations': { roles: ['admin'], handler: function(p, s) { return v2Result(issueActivations(s, p)); } },
  'admin.loginStats': { roles: ['admin'], handler: function(p) { return v2Ok(loginStats(p.days)); } }
  };
}

function handleV2(action, payload, token) {
  var route = v2Routes()[action];
  if (!route) return v2Fail('UNKNOWN_ACTION', 'ไม่รู้จัก action: ' + action);
  var session = null;
  if (!route.public) {
    session = getSession(token);
    if (!session) return v2Fail('AUTH_REQUIRED', 'กรุณาเข้าสู่ระบบใหม่');
    if (route.roles && route.roles.indexOf(session.level) === -1) {
      logAuditEvent('ACCESS_DENIED', session.psCode, 'Action: ' + action);
      return v2Fail('FORBIDDEN', 'ไม่มีสิทธิ์ดำเนินการนี้');
    }
  }
  return route.handler(payload || {}, session, token);
}

// ===== auth.me / admin =====

/** ข้อมูลผู้ใช้ปัจจุบัน + จำนวนงานค้างสำหรับ admin (badge ที่เมนู) */
function sessionSummary(session) {
  var summary = {
    user: { psCode: session.psCode, name: session.name, group: session.group, level: session.level },
    expiresAt: session.expiresAt || null
  };
  if (session.level === 'admin') {
    var users = getUserSheet().getDataRange().getValues().slice(1);
    var resets = getResetSheet().getDataRange().getValues().slice(1);
    summary.pendingCounts = {
      registrations: users.filter(function(r) { return r[COL.REQUEST - 1] === 'PENDING'; }).length,
      resets: resets.filter(function(r) { return r[3] === 'PENDING'; }).length
    };
  }
  return summary;
}

var LOGIN_STAT_EVENTS = ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGIN_BLOCKED_WEAK', 'RESET_REQUESTED', 'ACCOUNT_ACTIVATED', 'ACTIVATIONS_ISSUED'];

/** สถิติ login รายวันจาก Audit_Log + สถานะบัญชีปัจจุบัน */
function loginStats(days) {
  var n = Math.min(90, Math.max(1, parseInt(days || '14', 10) || 14));
  var since = Utilities.formatDate(new Date(Date.now() - (n - 1) * 24 * 3600 * 1000), 'Asia/Bangkok', 'yyyy-MM-dd');
  var audit = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Audit_Log');
  var rows = audit ? audit.getDataRange().getValues().slice(1) : [];
  var byDay = {};
  rows.forEach(function(r) {
    var ts = r[0] instanceof Date ? Utilities.formatDate(r[0], 'Asia/Bangkok', 'yyyy-MM-dd') : String(r[0]).slice(0, 10);
    if (ts < since || LOGIN_STAT_EVENTS.indexOf(r[1]) === -1) return;
    byDay[ts] = byDay[ts] || {};
    byDay[ts][r[1]] = (byDay[ts][r[1]] || 0) + 1;
  });
  var users = getUserSheet().getDataRange().getValues().slice(1).filter(function(r) { return r[0]; });
  var activations = Table(ACTIVATIONS_SHEET).all();
  var nowIso = new Date().toISOString();
  return {
    days: Object.keys(byDay).sort().map(function(d) { return { date: d, counts: byDay[d] }; }),
    accounts: {
      total: users.length,
      active: users.filter(function(r) { return isActiveStatus(r[7]); }).length,
      weakPassword: weakPasswordUsers().length,
      missingGroup: users.filter(function(r) { return !String(r[3] || '').trim(); }).length,
      activationsPending: activations.filter(function(a) { return !a.usedAt && String(a.expiresAt) > nowIso; }).length
    }
  };
}
