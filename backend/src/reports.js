// รายงาน v2 — Sheet "Reports" แบบมีโครงสร้าง (รหัสยา + HAD ต่อรายงาน)
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน
//
// ช่วงเปลี่ยนผ่าน: เขียนลง Predispensing_Errors (ให้ frontend เดิมเห็น) และลง Reports เมื่อ migrate แล้ว
// (Meta.reportsMigrated = 'true' — ตั้งโดย tools/migrate-reports.js)

// ===== Pure functions (ไม่เรียก service ของ Apps Script — ใช้ซ้ำใน tools/migrate-reports.js) =====

var LEGACY_COLS = { eventDate: 0, id: 1, shift: 2, patientType: 3, location: 4, process: 5, errorDetail: 6,
  correctItem: 7, incorrectItem: 8, cause: 9, details: 10, reporter: 11, createdAt: 12 };
var SUBSTATION_PREFIX = 'รพ.สต.';

/** @param {Array<{drugCode, drugName, had}>} drugs */
function buildDrugIndex(drugs) {
  var byCode = {};
  var byName = {};
  drugs.forEach(function(d) {
    var code = String(d.drugCode || '').trim();
    if (!code) return;
    var entry = { code: code, name: String(d.drugName || '').trim(), had: d.had === 'High' };
    byCode[code.toUpperCase()] = entry;
    var nameKey = entry.name.toLowerCase();
    if (nameKey && !byName[nameKey]) byName[nameKey] = entry;
  });
  return { byCode: byCode, byName: byName };
}

/**
 * แปลงข้อความยา ("ชื่อ (CODE)" หรือชื่ออย่างเดียว) / รหัส → ยาในรายการ
 * @returns {{code:string, name:string, had:boolean, matched:boolean}}
 */
function resolveDrug(index, text, code) {
  var raw = String(text || '').trim();
  var codeKey = String(code || '').trim().toUpperCase();
  if (codeKey && index.byCode[codeKey]) return withMatch(index.byCode[codeKey]);
  if (!raw) return { code: codeKey, name: '', had: false, matched: false };

  var m = raw.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (m) {
    var parsedCode = m[2].trim().toUpperCase();
    if (index.byCode[parsedCode]) return withMatch(index.byCode[parsedCode]);
    var byParsedName = index.byName[m[1].trim().toLowerCase()];
    if (byParsedName) return withMatch(byParsedName);
  }
  var byName = index.byName[raw.toLowerCase()] || (index.byCode[raw.toUpperCase()]);
  if (byName) return withMatch(byName);
  // รหัสในวงเล็บที่ไม่ได้อยู่ท้ายข้อความ เช่น "TRAMADOL ... (TMDHC1) จำนวน 30 เม็ด"
  var groups = raw.match(/\(([^()]+)\)/g) || [];
  for (var g = 0; g < groups.length; g++) {
    var inner = groups[g].slice(1, -1).trim().toUpperCase();
    if (index.byCode[inner]) return withMatch(index.byCode[inner]);
  }
  return { code: m ? m[2].trim() : '', name: m ? m[1].trim() : raw, had: false, matched: false };

  function withMatch(d) {
    return { code: d.code, name: d.name, had: d.had, matched: true };
  }
}

/** "ชื่อ นามสกุล (PS) - กลุ่ม/ระดับ" → {psCode, name} */
function parseReporter(text) {
  var raw = String(text || '').trim();
  var m = raw.match(/^(.*?)\s*\(([^()]+)\)/);
  return m ? { psCode: m[2].trim(), name: m[1].trim() } : { psCode: '', name: raw };
}

/** วันที่เป็น yyyy-MM-dd (รับ Date, ISO string, "yyyy-MM-dd ...") */
function normalizeEventDate(value, formatDate) {
  if (value instanceof Date || (value && typeof value.getTime === 'function')) {
    return isNaN(value.getTime()) ? '' : formatDate(value);
  }
  var m = String(value || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return '';
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}

function splitLocation(location) {
  var loc = String(location || '').trim();
  if (loc.indexOf(SUBSTATION_PREFIX) === 0 && loc.length > SUBSTATION_PREFIX.length) {
    return { location: SUBSTATION_PREFIX, substation: loc };
  }
  return { location: loc, substation: '' };
}

/**
 * แถว Predispensing_Errors → object ของ Reports
 * @param {Array} row
 * @param {Object} index buildDrugIndex()
 * @param {function(Date):string} formatDate Date → yyyy-MM-dd
 */
function reportFromLegacyRow(row, index, formatDate) {
  var correct = resolveDrug(index, row[LEGACY_COLS.correctItem]);
  var incorrect = resolveDrug(index, row[LEGACY_COLS.incorrectItem]);
  var reporter = parseReporter(row[LEGACY_COLS.reporter]);
  var loc = splitLocation(row[LEGACY_COLS.location]);
  var hadCodes = [correct, incorrect].filter(function(d) { return d.had; }).map(function(d) { return d.code; })
    .filter(function(c, i, arr) { return arr.indexOf(c) === i; });
  var createdAt = row[LEGACY_COLS.createdAt];
  return {
    id: String(row[LEGACY_COLS.id] || '').trim(),
    eventDate: normalizeEventDate(row[LEGACY_COLS.eventDate], formatDate),
    shift: String(row[LEGACY_COLS.shift] || ''),
    patientType: String(row[LEGACY_COLS.patientType] || ''),
    location: loc.location,
    substation: loc.substation,
    process: String(row[LEGACY_COLS.process] || ''),
    errorDetail: String(row[LEGACY_COLS.errorDetail] || ''),
    correctDrugCode: correct.code,
    correctDrugName: correct.name,
    incorrectDrugCode: incorrect.code,
    incorrectDrugName: incorrect.name,
    isHad: hadCodes.length > 0,
    hadDrugCodes: hadCodes.join(','),
    cause: String(row[LEGACY_COLS.cause] || ''),
    details: String(row[LEGACY_COLS.details] || ''),
    reporterPsCode: reporter.psCode,
    reporterName: reporter.name,
    createdAt: createdAt instanceof Date ? formatDate(createdAt) : String(createdAt || ''),
    submissionToken: '',
    source: 'legacy'
  };
}

function drugLabel(code, name) {
  if (!name) return code || '';
  return code ? name + ' (' + code + ')' : name;
}

/** object ของ Reports → แถว Predispensing_Errors (ให้ frontend เดิมเห็นรายงานใหม่) */
function legacyRowFromReport(r) {
  var location = r.substation || r.location;
  return [r.eventDate, r.id, r.shift, r.patientType, location, r.process, r.errorDetail,
    drugLabel(r.correctDrugCode, r.correctDrugName), drugLabel(r.incorrectDrugCode, r.incorrectDrugName),
    r.cause, r.details, r.reporterLabel || r.reporterName, r.createdAt];
}

/**
 * กรอง + เรียง (ใหม่ก่อน) + แบ่งหน้า
 * @param {Object[]} reports
 * @param {{from?, to?, process?, patientType?, location?, mine?, psCode?, hadOnly?}} f
 */
function filterReports(reports, f) {
  f = f || {};
  return reports.filter(function(r) {
    if (f.from && r.eventDate < f.from) return false;
    if (f.to && r.eventDate > f.to) return false;
    if (f.process && f.process !== 'all' && r.process !== f.process) return false;
    if (f.patientType && f.patientType !== 'all' && r.patientType !== f.patientType) return false;
    if (f.location && f.location !== 'all' && r.location !== f.location) return false;
    if (f.hadOnly && !isTrue(r.isHad)) return false;
    if (f.mine && String(r.reporterPsCode).toLowerCase() !== String(f.psCode || '').toLowerCase()) return false;
    return true;
  });
}

function sortReportsDesc(reports) {
  return reports.slice().sort(function(a, b) {
    if (a.eventDate !== b.eventDate) return a.eventDate < b.eventDate ? 1 : -1;
    return String(a.createdAt) < String(b.createdAt) ? 1 : String(a.createdAt) > String(b.createdAt) ? -1 : 0;
  });
}

function isTrue(v) {
  return v === true || v === 'TRUE' || v === 'true';
}

/** ระดับ user: รายงานของคนอื่นไม่แสดงชื่อผู้รายงานและรายละเอียดเพิ่มเติม */
function redactReport(r, session) {
  if (FULL_REPORT_ACCESS.indexOf(session.level) !== -1) return r;
  if (String(r.reporterPsCode).toLowerCase() === String(session.psCode).toLowerCase()) return r;
  var copy = {};
  Object.keys(r).forEach(function(k) { copy[k] = r[k]; });
  copy.details = '';
  copy.reporterName = REDACTED_REPORTER;
  copy.reporterPsCode = '';
  return copy;
}

function publicReport(r) {
  var out = {};
  SCHEMAS.Reports.forEach(function(k) { if (k !== 'submissionToken') out[k] = r[k]; });
  out.isHad = isTrue(r.isHad);
  return out;
}

// ===== Data access =====

var drugIndexMemo = null; // ต่อ execution

function currentDrugIndex() {
  if (!drugIndexMemo) {
    var payload = JSON.parse(getDrugList(SpreadsheetApp.openById(SPREADSHEET_ID)).getContent());
    drugIndexMemo = buildDrugIndex(payload.data || []);
  }
  return drugIndexMemo;
}

function formatBangkokDate(date) {
  return Utilities.formatDate(date, 'Asia/Bangkok', 'yyyy-MM-dd');
}

function reportsMigrated() {
  return getMeta('reportsMigrated') === 'true';
}

function bumpReportsVersion() {
  setMeta('reportsVersion', String(Date.now()));
}

/** รายงานทั้งหมดเป็น object (จาก Reports ถ้า migrate แล้ว ไม่งั้นแปลงจาก Sheet เดิม) */
function readAllReports() {
  if (reportsMigrated()) return Table(REPORTS_SHEET).all();
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ERROR_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var index = currentDrugIndex();
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues()
    .filter(function(row) { return row[LEGACY_COLS.id]; })
    .map(function(row) { return reportFromLegacyRow(row, index, formatBangkokDate); });
}

function generateServerReportId() {
  var stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMddHHmmss');
  return 'PE' + stamp + ('0' + Math.floor(Math.random() * 100)).slice(-2);
}

/**
 * เขียนรายงาน (legacy + Reports) ภายใน lock พร้อมกัน id ซ้ำ
 * @returns {boolean} false ถ้า id ซ้ำ
 */
function writeReport(report) {
  var legacySheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ERROR_SHEET);
  var migrated = reportsMigrated();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var lastRow = legacySheet.getLastRow();
    var ids = lastRow > 0 ? legacySheet.getRange(1, 2, lastRow, 1).getValues() : [];
    if (ids.some(function(r) { return String(r[0]) === report.id; })) return false;
    legacySheet.appendRow(legacyRowFromReport(report).map(sanitizeInput));
    if (migrated) Table(REPORTS_SHEET).append(report);
  } finally {
    lock.releaseLock();
  }
  bumpReportsVersion();
  return true;
}

var REQUIRED_REPORT_FIELDS = {
  eventDate: 'วันที่เกิดเหตุการณ์', shift: 'เวร', patientType: 'ประเภทผู้ป่วย', location: 'สถานที่',
  process: 'กระบวนการ', errorDetail: 'ข้อผิดพลาด', cause: 'สาเหตุ'
};

/** v2: บันทึกรายงาน — รหัสยา/HAD เติมฝั่ง server จากรายการยา */
function createReport(session, p) {
  var missing = Object.keys(REQUIRED_REPORT_FIELDS).filter(function(k) { return !String(p[k] || '').trim(); });
  if (missing.length) {
    return { ok: false, code: 'VALIDATION', message: 'กรุณากรอก: ' + missing.map(function(k) { return REQUIRED_REPORT_FIELDS[k]; }).join(', '), fields: missing };
  }
  var eventDate = normalizeEventDate(p.eventDate, formatBangkokDate);
  if (!eventDate || eventDate > formatBangkokDate(new Date())) {
    return { ok: false, code: 'VALIDATION', message: 'วันที่เกิดเหตุการณ์ไม่ถูกต้อง', fields: ['eventDate'] };
  }

  var cache = CacheService.getScriptCache();
  if (p.submissionToken) {
    var previous = cache.get('sub:' + p.submissionToken);
    if (previous) return { ok: true, data: { id: previous, duplicate: true } };
  }

  var index = currentDrugIndex();
  var correct = resolveDrug(index, p.correctDrugText || p.correctDrugName, p.correctDrugCode);
  var incorrect = resolveDrug(index, p.incorrectDrugText || p.incorrectDrugName, p.incorrectDrugCode);
  var hadCodes = [correct, incorrect].filter(function(d) { return d.had; }).map(function(d) { return d.code; })
    .filter(function(c, i, arr) { return arr.indexOf(c) === i; });
  var location = String(p.location).trim();
  var substation = location === SUBSTATION_PREFIX ? String(p.substation || '').trim() : '';

  var report = {
    id: '',
    eventDate: eventDate,
    shift: String(p.shift), patientType: String(p.patientType), location: location, substation: substation,
    process: String(p.process), errorDetail: String(p.errorDetail),
    correctDrugCode: correct.code, correctDrugName: correct.name,
    incorrectDrugCode: incorrect.code, incorrectDrugName: incorrect.name,
    isHad: hadCodes.length > 0, hadDrugCodes: hadCodes.join(','),
    cause: String(p.cause), details: String(p.details || ''),
    reporterPsCode: session.psCode, reporterName: session.name,
    reporterLabel: formatReporter(session),
    createdAt: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss'),
    submissionToken: String(p.submissionToken || ''),
    source: 'v2'
  };

  for (var attempt = 0; attempt < 5; attempt++) {
    report.id = generateServerReportId();
    if (writeReport(report)) {
      if (p.submissionToken) cache.put('sub:' + p.submissionToken, report.id, 3600);
      logAuditEvent('ERROR_RECORDED', session.psCode, 'Report ID: ' + report.id);
      return { ok: true, data: { id: report.id, isHad: report.isHad, hadDrugCodes: hadCodes } };
    }
  }
  return { ok: false, code: 'CONFLICT', message: 'สร้าง Report ID ไม่สำเร็จ กรุณาลองใหม่' };
}

/** v2: รายการรายงาน (กรอง + แบ่งหน้า + redaction ตาม role) */
function listReports(session, p) {
  var page = Math.max(1, parseInt(p.page || '1', 10) || 1);
  var pageSize = Math.min(200, Math.max(1, parseInt(p.pageSize || '50', 10) || 50));
  var filtered = sortReportsDesc(filterReports(readAllReports(), {
    from: p.from, to: p.to, process: p.process, patientType: p.patientType, location: p.location,
    hadOnly: isTrue(p.hadOnly), mine: isTrue(p.mine), psCode: session.psCode
  }));
  var items = filtered.slice((page - 1) * pageSize, page * pageSize)
    .map(function(r) { return publicReport(redactReport(r, session)); });
  return { ok: true, data: { items: items, total: filtered.length, page: page, pageSize: pageSize } };
}
