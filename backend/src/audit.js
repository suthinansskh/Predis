// Audit log
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน

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
    auditSheet.appendRow([timestamp, eventType, sanitizeInput(userCode), sanitizeInput(details), '']);
  } catch (e) {
    // Non-fatal: audit logging should not break main flow
    console.error('Audit logging failed:', e);
  }
}

// ===== Authentication (Server-side verification) =====
