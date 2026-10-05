// รายงานใน Sheet Predispensing_Errors เดิม (compat) + redaction ตาม role
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน

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
    if (reportsMigrated()) {
      var report = reportFromLegacyRow(rowData, currentDrugIndex(), formatBangkokDate);
      if (session) {
        report.reporterPsCode = session.psCode;
        report.reporterName = session.name;
      }
      report.submissionToken = String(data.submissionToken || '');
      report.source = 'legacy-api';
      Table(REPORTS_SHEET).append(report);
    }
  } finally {
    lock.releaseLock();
  }
  bumpReportsVersion();

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
