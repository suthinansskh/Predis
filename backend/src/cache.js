// Cache ข้อมูลก้อนใหญ่ใน CacheService (จำกัด 100KB/key): gzip → base64 → แบ่ง chunk
// และเวอร์ชันของข้อมูลรายงาน (Script Properties — ไม่ต้องอ่าน Sheet Meta ทุกคำขอ)
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน

var CACHE_CHUNK_CHARS = 90000;
var CACHE_MAX_SECONDS = 6 * 60 * 60;

function cachePutLarge(key, value, seconds) {
  var text = JSON.stringify(value);
  var packed = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(text, 'application/json')).getBytes());
  var entries = {};
  var count = Math.ceil(packed.length / CACHE_CHUNK_CHARS) || 1;
  for (var i = 0; i < count; i++) {
    entries[key + ':' + i] = packed.substr(i * CACHE_CHUNK_CHARS, CACHE_CHUNK_CHARS);
  }
  entries[key + ':n'] = String(count);
  try {
    CacheService.getScriptCache().putAll(entries, Math.min(seconds || CACHE_MAX_SECONDS, CACHE_MAX_SECONDS));
    return true;
  } catch (e) {
    console.error('cachePutLarge failed:', e); // เกินขนาด cache → ใช้งานต่อได้แบบไม่มี cache
    return false;
  }
}

/** @returns {*} ค่าที่เก็บไว้ หรือ null ถ้าไม่มี/ไม่ครบ */
function cacheGetLarge(key) {
  var cache = CacheService.getScriptCache();
  var count = parseInt(cache.get(key + ':n') || '0', 10);
  if (!count) return null;
  var keys = [];
  for (var i = 0; i < count; i++) keys.push(key + ':' + i);
  var parts = cache.getAll(keys);
  var packed = '';
  for (var j = 0; j < count; j++) {
    if (!parts[keys[j]]) return null;
    packed += parts[keys[j]];
  }
  try {
    var blob = Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(packed), 'application/x-gzip'));
    return JSON.parse(blob.getDataAsString('UTF-8'));
  } catch (e) {
    return null;
  }
}

function cacheRemoveLarge(key) {
  var cache = CacheService.getScriptCache();
  var count = parseInt(cache.get(key + ':n') || '0', 10);
  var keys = [key + ':n'];
  for (var i = 0; i < count; i++) keys.push(key + ':' + i);
  cache.removeAll(keys);
}

// ===== เวอร์ชันข้อมูลรายงาน =====

/** เปลี่ยนเมื่อแอปบันทึกรายงาน (ใช้ล้าง cache สถิติ/รายการ) */
function reportsVersion() {
  return PropertiesService.getScriptProperties().getProperty('reportsVersion') || '0';
}

function bumpReportsVersion() {
  var version = String(Date.now());
  PropertiesService.getScriptProperties().setProperty('reportsVersion', version);
  return version;
}

function reportsSheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REPORTS_SHEET);
}

/**
 * key ของข้อมูลรายงานชุดปัจจุบัน: เวอร์ชัน + จำนวนแถว
 * (จำนวนแถวจับรายงานที่เขียนตรงลง Sheet เช่น mcp-server ได้ด้วย)
 */
function reportsDataKey(lastRow) {
  var rows = lastRow;
  if (rows === undefined) {
    var sheet = reportsSheet();
    rows = sheet ? sheet.getLastRow() : 0;
  }
  return reportsVersion() + '.' + rows;
}
