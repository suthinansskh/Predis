// Table layer — อ่าน/เขียนแถวเป็น object ตามชื่อ header (ไม่อ้าง index ของคอลัมน์)
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน

/**
 * @param {string} name ชื่อ Sheet (ถ้ามี SCHEMAS[name] จะสร้าง Sheet/คอลัมน์ที่ขาดให้)
 */
function Table(name) {
  var schema = SCHEMAS[name] || null;
  var textCols = TEXT_COLUMNS[name] || [];
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    if (!schema) throw new Error('Sheet not found: ' + name);
    sheet = spreadsheet.insertSheet(name);
  }

  var lastCol = sheet.getLastColumn();
  var header = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  while (header.length && header[header.length - 1] === '') header.pop();
  if (schema) {
    var missing = schema.filter(function(c) { return header.indexOf(c) === -1; });
    if (missing.length) {
      sheet.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
      header = header.concat(missing);
    }
  }

  function readCell(value) {
    // ' นำหน้าใช้บังคับให้ Sheets เก็บเป็นข้อความ (Sheets จริงตัดออกให้อยู่แล้ว)
    if (typeof value === 'string' && value.charAt(0) === "'") return value.slice(1);
    return value;
  }

  function writeCell(col, value) {
    if (value === undefined || value === null) return '';
    if (typeof value === 'boolean' || typeof value === 'number') return value;
    var str = String(value).replace(/\0/g, '');
    if (str.length > 5000) str = str.substring(0, 5000);
    // ' นำหน้ากันทั้งการแปลงชนิด ("010" → 10) และ formula injection
    if (textCols.indexOf(col) !== -1) return str === '' ? '' : "'" + str;
    return sanitizeInput(str);
  }

  function toRow(obj) {
    return header.map(function(col) { return writeCell(col, obj[col]); });
  }

  return {
    name: name,
    sheet: sheet,
    header: header,

    /** @returns {Object[]} ทุกแถว (ไม่รวมแถวว่าง) เป็น object พร้อม _row = เลขแถวใน Sheet */
    all: function() {
      var lastRow = sheet.getLastRow();
      if (lastRow < 2 || header.length === 0) return [];
      var values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
      var out = [];
      for (var i = 0; i < values.length; i++) {
        var obj = { _row: i + 2 };
        var empty = true;
        for (var c = 0; c < header.length; c++) {
          var v = readCell(values[i][c]);
          obj[header[c]] = v;
          if (v !== '' && v !== null && v !== undefined) empty = false;
        }
        if (!empty) out.push(obj);
      }
      return out;
    },

    findBy: function(col, value) {
      var target = String(value);
      var rows = this.all();
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][col]) === target) return rows[i];
      }
      return null;
    },

    append: function(obj) {
      this.appendMany([obj]);
    },

    appendMany: function(objs) {
      if (!objs.length) return;
      var start = Math.max(sheet.getLastRow(), 1) + 1;
      sheet.getRange(start, 1, objs.length, header.length).setValues(objs.map(toRow));
    },

    /** แก้เฉพาะคอลัมน์ใน patch ของแถว rowNumber */
    update: function(rowNumber, patch) {
      Object.keys(patch).forEach(function(col) {
        var c = header.indexOf(col);
        if (c === -1) throw new Error('Unknown column ' + col + ' in ' + name);
        sheet.getRange(rowNumber, c + 1).setValue(writeCell(col, patch[col]));
      });
    }
  };
}

// ===== Meta (key/value) =====

function getMeta(key) {
  var row = Table(META_SHEET).findBy('key', key);
  return row ? String(row.value) : '';
}

function setMeta(key, value) {
  var table = Table(META_SHEET);
  var row = table.findBy('key', key);
  if (row) {
    table.update(row._row, { value: String(value) });
  } else {
    table.append({ key: key, value: String(value) });
  }
}
