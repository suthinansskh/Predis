// Session token (HMAC แบบ stateless + legacy CacheService) และการยกเลิกรายคน
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน

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

// token ใหม่เป็นแบบ stateless เสมอ (คงชื่อเดิมไว้ให้ code เดิมเรียกได้)
function createSession(user) {
  return signToken(user);
}

// คืนค่า session (และต่ออายุ) หรือ null ถ้า token ไม่ถูกต้อง/หมดอายุ
function getSession(token) {
  if (typeof token === 'string' && token.indexOf('.') !== -1) return verifyToken(token);
  // token แบบเดิม (CacheService) — ใช้ได้จนหมดอายุ
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

// logout: token แบบ stateless ยกเลิกทีละใบไม่ได้ → ยกเลิกทุก session ของผู้ใช้คนนั้น
// (เหมาะกับเครื่องในห้องยาที่ใช้ร่วมกัน)
function destroySession(token) {
  if (typeof token !== 'string' || !token) return;
  if (token.indexOf('.') !== -1) {
    var session = verifyToken(token);
    if (session) revokeUserSessions(session.psCode);
    return;
  }
  CacheService.getScriptCache().remove(sessionKey(token));
}

function formatReporter(session) {
  return session.name + ' (' + session.psCode + ') - ' + session.group + '/' + session.level;
}

// ===== Request Parsing =====

// ===== Stateless token: base64url(payload).base64url(HMAC-SHA256) =====

function tokenSecret() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('TOKEN_SECRET');
  if (!secret) {
    secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('TOKEN_SECRET', secret);
  }
  return secret;
}

function base64UrlEncode(data) {
  return Utilities.base64EncodeWebSafe(data).replace(/=+$/, '');
}

function base64UrlDecodeToString(text) {
  var padded = text + '===='.slice((text.length % 4) || 4);
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString();
}

function tokenSignature(body) {
  return base64UrlEncode(Utilities.computeHmacSha256Signature(body, tokenSecret()));
}

function signToken(user) {
  var now = Date.now();
  var payload = { p: user.psCode, n: user.name, g: user.group, l: user.level, iat: now, exp: now + TOKEN_TTL_MS };
  var body = base64UrlEncode(JSON.stringify(payload));
  return body + '.' + tokenSignature(body);
}

// คืน session หรือ null (ลายเซ็นผิด / หมดอายุ / ถูกยกเลิกด้วย revokeUserSessions)
function verifyToken(token) {
  var parts = String(token).split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  if (!constantTimeEquals(tokenSignature(parts[0]), parts[1])) return null;
  var payload;
  try {
    payload = JSON.parse(base64UrlDecodeToString(parts[0]));
  } catch (e) {
    return null;
  }
  if (!payload || !payload.p || !(payload.exp > Date.now())) return null;
  var revokedAt = parseInt(PropertiesService.getScriptProperties().getProperty(revokedKey(payload.p)) || '0', 10);
  if (revokedAt && payload.iat < revokedAt) return null;
  return { psCode: payload.p, name: payload.n, group: payload.g, level: payload.l, issuedAt: payload.iat, expiresAt: payload.exp };
}
