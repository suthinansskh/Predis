// Hash รหัสผ่าน, constant-time compare, รหัสสุ่ม, ตรวจรหัสอ่อน
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน

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
