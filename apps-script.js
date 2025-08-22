// Google Apps Script Code สำหรับ Predispensing Error Recorder
// วิธีใช้: คัดลอกโค้ดนี้ไปใส่ใน Google Apps Script
// Refactored: ลดการซ้ำของ setHeaders / createTextOutput ด้วย helper jsonResponse()

// หมายเหตุ: Apps Script (ContentService) ไม่รองรับ setHeaders สำหรับกำหนด CORS เอง
// เพื่อลด error ใช้เพียง setMimeType(JSON) และหลีกเลี่ยงการส่ง custom headers
// (เราใช้ FormData ฝั่ง client เพื่อลด preflight จึงไม่จำเป็นต้องตั้ง CORS header เอง)

/**
 * สร้าง JSON response พร้อม headers มาตรฐาน
 * @param {Object} obj - payload ที่จะส่งกลับ
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return jsonResponse({
    status: 'OK',
    message: 'Predispensing Error Recorder API is working',
    timestamp: new Date().toISOString()
  });
}

// Handle OPTIONS request for CORS preflight
function doOptions(e) {
  // ตอบกลับว่าง ๆ สำหรับ preflight (ถึงแม้เราหลีกเลี่ยงอยู่แล้ว)
  return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    // Handle CORS preflight
    if (e.parameter && e.parameter.method === 'OPTIONS') {
  return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
    }

    let data;
    
    // Handle different types of POST data
    if (e.parameter && e.parameter.action) {
      // FormData from web form
      data = e.parameter;
    } else if (e.postData && e.postData.contents) {
      // JSON payload
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter && e.parameter.payload) {
      // Form submission with payload
      data = JSON.parse(e.parameter.payload);
    } else {
  return jsonResponse({ error: 'No data received' });
    }
    
    const spreadsheet = SpreadsheetApp.openById('1QDIxEXCVLiA7oijXN15N2ZH2LzPtHDecbqolYGs9Ldk');
    
    // Handle drug list operations
    if (data.action === 'addDrug') {
  return handleDrugOperation(spreadsheet, data);
    }
    
    // Handle get drug list
    if (data.action === 'getDrugList') {
  return getDrugList(spreadsheet, data.drugSheetName || 'Drug_List');
    }
    
    // Handle error reporting
    const sheet = spreadsheet.getSheetByName(data.sheetName || 'Predispensing_Errors');
    
    if (!sheet) {
      return jsonResponse({
        error: 'Sheet not found: ' + (data.sheetName || 'Predispensing_Errors')
      });
    }
    
    if (data.action === 'append') {
      // Handle FormData format
      if (data.eventDate) {
        // แยกวันที่เกิดเหตุการณ์และ timestamp ให้ชัดเจน
        const rowData = [
          data.eventDate,              // วันที่เกิดเหตุการณ์ (ผู้ใช้เลือก)
          data.reportId,               // ReportID
          data.shift,                  // เวร
          data.errorType,              // ประเภท
          data.location,               // สถานที่
          data.process,                // กระบวนการ
          data.errorDetail,            // ข้อผิดพลาด
          data.correctItem,            // รายการถูกต้อง
          data.incorrectItem,          // รายการผิด
          data.cause,                  // สาเหตุ
          data.additionalDetails || '',// รายละเอียดเพิ่มเติม
          data.reporter,               // ผู้รายงาน
          Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss') // timestamp บันทึกข้อมูล (เวลาไทย)
        ];
        sheet.appendRow(rowData);
      } else if (data.data) {
        // Handle JSON format
        sheet.appendRow(data.data);
      }
      
      // For form submissions, return HTML that closes the window
      if (e.parameter && e.parameter.payload) {
        return HtmlService.createHtmlOutput('<script>window.close();</script>');
      }
      
      return jsonResponse({
        success: true,
        message: 'Data appended successfully',
        timestamp: new Date().toISOString()
      });
    }
    
    return jsonResponse({ error: 'Invalid action or missing data' });
    
  } catch (error) {
    return jsonResponse({
      error: 'Server error: ' + error.toString()
    });
  }
}

// ฟังก์ชันทดสอบ (ไม่บังคับ)
function testFunction() {
  Logger.log('Google Apps Script is working!');
}

// Handle drug list operations
function handleDrugOperation(spreadsheet, data) {
  try {
    let drugSheet = spreadsheet.getSheetByName('Drug_List');
    
    // Create Drug_List sheet if it doesn't exist
    if (!drugSheet) {
      drugSheet = spreadsheet.insertSheet('Drug_List');
      // Add headers to match your existing structure
      drugSheet.getRange(1, 1, 1, 5).setValues([['Drug Code', 'Drug Name', 'Group', 'HAD', 'status']]);
      // Format headers
      drugSheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#e1f5fe');
    }
    
    if (data.action === 'addDrug') {
      // Check if drug code already exists
      const existingData = drugSheet.getDataRange().getValues();
      const drugCodeExists = existingData.some((row, index) => 
        index > 0 && row[0] === data.drugCode
      );
      
      if (drugCodeExists) {
        return jsonResponse({
          error: 'รหัสยาซ้ำ: ' + data.drugCode + ' มีอยู่ในระบบแล้ว'
        });
      }
      
      // Add new drug - matching your sheet structure
      drugSheet.appendRow([
        data.drugCode,        // Column A: Drug Code
        data.drugName,        // Column B: Drug Name  
        data.group,           // Column C: Group
        data.had === 'High' ? 1 : 0,  // Column D: HAD (1 for High Alert, 0 for Regular)
        data.status === 'Active' ? 1 : 0  // Column E: status (1 for Active, 0 for Inactive)
      ]);
      
      return jsonResponse({
        success: true,
        message: 'เพิ่มรายการยาเรียบร้อยแล้ว',
        timestamp: new Date().toISOString()
      });
    }
    
    return jsonResponse({ error: 'Invalid drug operation' });
    
  } catch (error) {
    return jsonResponse({
      error: 'Drug operation error: ' + error.toString()
    });
  }
}

// Get drug list from Drug_List sheet
function getDrugList(spreadsheet, drugSheetName = 'Drug_List') {
  try {
    const drugSheet = spreadsheet.getSheetByName(drugSheetName);
    
    if (!drugSheet) {
      return jsonResponse({
        success: true,
        data: [],
        message: `No ${drugSheetName} sheet found`
      });
    }
    
    // Get all data from the sheet
    const range = drugSheet.getDataRange();
    const values = range.getValues();
    
    if (values.length <= 1) {
      return jsonResponse({
        success: true,
        data: [],
        message: 'No drug data found'
      });
    }
    
    // Skip header row and format data
    const drugs = values.slice(1).map(row => ({
      drugCode: row[0] || '',
      drugName: row[1] || '',
      group: row[2] || '',
      had: row[3] == 1 ? 'High' : 'Regular',
      status: row[4] == 1 ? 'Active' : 'Inactive'
    }));
    
    return jsonResponse({
      success: true,
      data: drugs,
      count: drugs.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    return jsonResponse({
      error: 'Error getting drug list: ' + error.toString()
    });
  }
}
