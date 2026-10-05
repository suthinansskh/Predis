// Sanitize input, JSON response, parse request body
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน

/**
 * ทำความสะอาด input เพื่อป้องกัน formula injection
 * @param {*} value
 * @returns {string}
 */
function sanitizeInput(value) {
  if (value === null || value === undefined) return '';
  var str = value.toString().trim();
  // ป้องกัน formula injection (=, +, -, @, tab, carriage return, pipe, backslash)
  if (str.length > 0 && /^[=+\-@\t\r|\\]/.test(str)) {
    str = "'" + str;
  }
  // Remove null bytes
  str = str.replace(/\0/g, '');
  // Limit length to prevent abuse
  if (str.length > 5000) {
    str = str.substring(0, 5000);
  }
  return str;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function authError(message) {
  return jsonResponse({ success: false, authRequired: true, error: message || 'กรุณาเข้าสู่ระบบใหม่' });
}

function parsePostData(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var postContents = (e && e.postData && e.postData.contents) ? e.postData.contents : '';

  if (params.payload) return JSON.parse(params.payload);
  if (params.action) return params;
  if (!postContents) return null;
  try {
    return JSON.parse(postContents);
  } catch (parseErr) {
    // application/x-www-form-urlencoded เช่น payload=%7B...%7D
    if (postContents.indexOf('payload=') === 0) {
      return JSON.parse(decodeURIComponent(postContents.substring(8).replace(/\+/g, ' ')));
    }
    return params;
  }
}

// ===== HTTP Handlers =====
