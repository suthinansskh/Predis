// รหัสเปิดใช้งาน (activation code) — ให้ผู้ใช้ตั้งรหัสผ่านเองโดย admin ไม่ต้องรู้รหัสจริง
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน
//
// ขั้นตอน: admin ออกรหัส (ทีละคนหรือทุกคนที่ใช้รหัสอ่อน) → พิมพ์ใบแยกตามกลุ่มงาน → หัวหน้าแจก
//          → ผู้ใช้กรอก PS Code + รหัส + รหัสผ่านใหม่ → เข้าระบบได้ทันที
// รหัสใช้ได้ครั้งเดียว อายุ ACTIVATION_TTL_DAYS วัน เก็บเฉพาะ hash

var ACTIVATION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ไม่มี 0/O, 1/I สับสนง่าย

function generateActivationCode() {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid());
  var out = '';
  for (var i = 0; i < 8; i++) {
    out += ACTIVATION_ALPHABET.charAt(((bytes[i] % 256) + 256) % 256 % ACTIVATION_ALPHABET.length);
  }
  return out;
}

function normalizeActivationCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function activationHash(psCode, code) {
  return sha256Hex(String(psCode).trim().toLowerCase() + ':' + normalizeActivationCode(code));
}

/** PS Code ของผู้ใช้ที่ active และยังใช้รหัสผ่านว่าง/อ่อน/รหัสเริ่มต้น */
function weakPasswordUsers() {
  var values = getUserSheet().getDataRange().getValues().slice(1);
  var weak = [];
  values.forEach(function(row) {
    var psCode = (row[0] || '').toString().trim();
    if (!psCode || !isActiveStatus(row[7])) return;
    var id13 = (row[1] || '').toString().trim();
    var stored = (row[6] || '').toString().trim();
    var candidates = WEAK_PASSWORDS.concat(id13 ? [id13, id13.slice(-4)] : []);
    var isWeak = !stored || (!isHashedPassword(stored) && isWeakPassword(stored, id13)) ||
      // ตรวจเฉพาะ hash แบบเก่า (รอบเดียว, เร็ว) — hash ใหม่ผ่าน isWeakPassword ตอนตั้งรหัสแล้ว
      (stored.indexOf(LEGACY_HASH_PREFIX) === 0 && candidates.some(function(pw) { return verifyPassword(pw, stored); }));
    if (isWeak) weak.push(psCode);
  });
  return weak;
}

/**
 * ออกรหัสเปิดใช้งาน (admin)
 * @param {Object} session
 * @param {{psCodes?: string[]|string, weakOnly?: boolean|string}} payload
 *   psCodes = รายคน; ไม่ระบุ + weakOnly → ทุกคนที่ใช้รหัสอ่อน
 * @returns {{items: Array<{psCode,name,group,code,expiresAt}>}} รหัสจริงแสดงครั้งเดียว
 */
function issueActivations(session, payload) {
  var psCodes = payload.psCodes;
  if (typeof psCodes === 'string') psCodes = psCodes ? JSON.parse(psCodes) : [];
  var weakOnly = payload.weakOnly === true || payload.weakOnly === 'true';
  if ((!psCodes || psCodes.length === 0) && weakOnly) psCodes = weakPasswordUsers();
  if (!psCodes || psCodes.length === 0) {
    return { ok: false, code: 'NO_TARGETS', message: 'ไม่มีผู้ใช้ที่ต้องออกรหัส' };
  }
  if (psCodes.length > 300) {
    return { ok: false, code: 'TOO_MANY', message: 'ออกรหัสได้ครั้งละไม่เกิน 300 คน' };
  }

  var users = {};
  getUserSheet().getDataRange().getValues().slice(1).forEach(function(row) {
    var ps = (row[0] || '').toString().trim();
    if (ps) users[ps.toLowerCase()] = row;
  });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var table = Table(ACTIVATIONS_SHEET);
    var existing = table.all();
    var now = new Date();
    var expires = new Date(now.getTime() + ACTIVATION_TTL_DAYS * 24 * 3600 * 1000);
    var expiresText = Utilities.formatDate(expires, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
    var items = [];
    var rows = [];

    psCodes.forEach(function(raw) {
      var row = users[String(raw).trim().toLowerCase()];
      if (!row || !isActiveStatus(row[7])) return;
      var psCode = row[0].toString().trim();
      // รหัสเก่าที่ยังไม่ใช้ของคนนี้ → ยกเลิก
      existing.forEach(function(a) {
        if (String(a.psCode).toLowerCase() === psCode.toLowerCase() && !a.usedAt) {
          table.update(a._row, { usedAt: 'SUPERSEDED' });
        }
      });
      var code = generateActivationCode();
      rows.push({
        psCode: psCode,
        codeHash: activationHash(psCode, code),
        expiresAt: expires.toISOString(),
        createdBy: session.psCode,
        createdAt: now.toISOString(),
        usedAt: ''
      });
      items.push({ psCode: psCode, name: String(row[2] || ''), group: String(row[3] || ''), code: code, expiresAt: expiresText });
    });
    table.appendMany(rows);
    closeResetRequests(items.map(function(i) { return i.psCode; }), session.psCode);
    logAuditEvent('ACTIVATIONS_ISSUED', session.psCode, items.length + ' users');
    return { ok: true, data: { items: items } };
  } finally {
    lock.releaseLock();
  }
}

// ปิดคำขอรีเซ็ตรหัสที่ค้างของผู้ใช้เหล่านี้
function closeResetRequests(psCodes, handledBy) {
  if (!psCodes.length) return;
  var targets = {};
  psCodes.forEach(function(p) { targets[String(p).toLowerCase()] = true; });
  var sheet = getResetSheet();
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (targets[String(rows[i][1]).toLowerCase()] && rows[i][3] === 'PENDING') {
      sheet.getRange(i + 1, 4, 1, 3).setValues([['DONE', handledBy, nowText()]]);
    }
  }
}

/**
 * เปิดใช้งานบัญชีด้วยรหัสเปิดใช้งาน แล้วตั้งรหัสผ่านใหม่ (public)
 * @returns {{ok:true, data:{user, token, expiresIn}} | {ok:false, code, message, retryAfter?}}
 */
function activateAccount(payload) {
  var userCode = String(payload.userCode || '').trim();
  var code = normalizeActivationCode(payload.code);
  var newPassword = String(payload.newPassword || '');
  if (!userCode || !code || !newPassword) {
    return { ok: false, code: 'MISSING_FIELDS', message: 'กรุณากรอกรหัสผู้ใช้ รหัสเปิดใช้งาน และรหัสผ่านใหม่' };
  }

  var found = findUserByLogin(userCode);
  var key = throttleKeyFor(found, userCode);
  var state = loginThrottleState(key);
  if (state.until > Date.now()) return lockedResult(state);

  var invalid = function() {
    var failed = recordLoginFailure(key);
    logAuditEvent('ACTIVATION_FAILED', found ? found.row[0] : userCode, 'attempt ' + failed.n);
    if (failed.until > Date.now()) return lockedResult(failed);
    return { ok: false, code: 'ACTIVATION_INVALID', message: 'รหัสเปิดใช้งานไม่ถูกต้อง หมดอายุ หรือถูกใช้ไปแล้ว' };
  };
  if (!found || !isActiveStatus(found.row[7])) return invalid();

  var psCode = found.row[0].toString().trim();
  var rawId13 = (found.row[1] || '').toString().trim();
  if (isWeakPassword(newPassword, rawId13)) {
    return {
      ok: false,
      code: 'WEAK_PASSWORD',
      message: 'รหัสผ่านใหม่ต้องมีอย่างน้อย ' + PASSWORD_MIN_LENGTH + ' ตัวอักษร และห้ามเป็นรหัสเริ่มต้นหรือเลขบัตรประชาชน'
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var table = Table(ACTIVATIONS_SHEET);
    var hash = activationHash(psCode, code);
    var nowIso = new Date().toISOString();
    var match = table.all().filter(function(a) {
      return String(a.psCode).toLowerCase() === psCode.toLowerCase() && !a.usedAt &&
        String(a.expiresAt) > nowIso && constantTimeEquals(String(a.codeHash), hash);
    })[0];
    if (!match) return invalid();

    found.sheet.getRange(found.rowNumber, COL.PASSWORD).setValue(hashPassword(newPassword));
    table.update(match._row, { usedAt: nowIso });
  } finally {
    lock.releaseLock();
  }

  PropertiesService.getScriptProperties().deleteProperty(mustChangeKey(psCode));
  revokeUserSessions(psCode);
  clearLoginFailures(key);
  closeResetRequests([psCode], psCode);
  logAuditEvent('ACCOUNT_ACTIVATED', psCode, '');

  // ออก token หลัง revoke (คนละ millisecond กับ revokedAt)
  Utilities.sleep(2);
  var user = userFromRow(found.row);
  return { ok: true, data: { user: user, token: signToken(user), expiresIn: TOKEN_TTL_MS / 1000 } };
}
