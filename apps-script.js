// Google Apps Script Code สำหรับ Predispensing Error Recorder
// วิธีใช้: คัดลอกโค้ดนี้ไปใส่ใน Google Apps Script และ Deploy เป็น Web App
// การตั้งค่า Deploy: Execute as "Me", Who has access "Anyone"

// ⚠️ สำคัญ: ต้องแทนที่ SPREADSHEET_ID ด้วย ID จริงของ Google Sheets
const SPREADSHEET_ID = '1QDIxEXCVLiA7oijXN15N2ZH2LzPtHDecbqolYGs9Ldk';

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
  try {
    const action = e.parameter.action;
    
    if (action === 'getUsers') {
      const userCode = e.parameter.userCode;
      const password = e.parameter.password;
      return getUsersFromSheet(userCode, password);
    } else if (action === 'getDrugs') {
      return getDrugsFromSheet();
    } else if (action === 'getErrors') {
      return getErrorsFromSheet();
    }
    
    return jsonResponse({
      status: 'OK',
      message: 'Predispensing Error Recorder API is working',
      timestamp: new Date().toISOString(),
      availableActions: ['getUsers', 'getDrugs', 'getErrors']
    });
    
  } catch (error) {
    return jsonResponse({
      success: false,
      error: 'GET request error: ' + error.toString()
    });
  }
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
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Handle user authentication
    if (data.action === 'getUsers') {
      return getUsersFromSheet(data.userCode, data.password);
    }
    
    // Handle drug list operations
    if (data.action === 'addDrug') {
      return handleDrugOperation(spreadsheet, data);
    }
    
    // Handle get drug list
    if (data.action === 'getDrugList') {
      return getDrugList(spreadsheet, data.drugSheetName || 'Drug_List');
    }
    
    // Handle error reporting (default action)
    const sheet = spreadsheet.getSheetByName(data.sheetName || 'Predispensing_Errors');
    
    if (!sheet) {
      return jsonResponse({
        error: 'Sheet not found: ' + (data.sheetName || 'Predispensing_Errors')
      });
    }
    
    if (data.action === 'append') {
      // Handle FormData format
      if (data.eventDate) {
        // ตรวจสอบการซ้ำของ Report ID ก่อนบันทึก
        const reportId = data.reportId;
        if (reportId) {
          const existingData = sheet.getDataRange().getValues();
          const isDuplicate = existingData.some(row => row[1] === reportId); // คอลัมน์ B = Report ID
          
          if (isDuplicate) {
            return jsonResponse({
              error: 'Report ID ซ้ำ: ' + reportId + ' มีอยู่ในระบบแล้ว',
              duplicate: true,
              reportId: reportId
            });
          }
        }
        
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

// Get drugs from Drug_List sheet
function getDrugsFromSheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const drugSheet = spreadsheet.getSheetByName('Drug_List');
    
    if (!drugSheet) {
      return jsonResponse({
        success: true,
        data: [],
        message: 'ไม่พบ Sheet "Drug_List" ระบบจะสร้างเมื่อมีการเพิ่มยาใหม่'
      });
    }
    
    const range = drugSheet.getDataRange();
    const values = range.getValues();
    
    if (values.length <= 1) {
      return jsonResponse({
        success: true,
        data: [],
        message: 'ไม่มีข้อมูลยาใน Sheet'
      });
    }
    
    // Skip header row and format data
    const drugs = values.slice(1).map(row => ({
      code: row[0] || '',
      name: row[1] || '',
      group: row[2] || '',
      had: row[3] || '',
      status: row[4] === true || row[4] === 'TRUE' || row[4] === 'true'
    })).filter(drug => drug.code && drug.status);
    
    return jsonResponse({
      success: true,
      data: drugs,
      count: drugs.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    return jsonResponse({
      success: false,
      error: 'Error getting drug list: ' + error.toString()
    });
  }
}

// Get errors from Predispensing_Errors sheet
function getErrorsFromSheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const errorSheet = spreadsheet.getSheetByName('Predispensing_Errors');
    
    if (!errorSheet) {
      return jsonResponse({
        success: true,
        data: [],
        message: 'ไม่พบ Sheet "Predispensing_Errors" ระบบจะสร้างเมื่อมีการบันทึกข้อผิดพลาดครั้งแรก'
      });
    }
    
    const range = errorSheet.getDataRange();
    const values = range.getValues();
    
    return jsonResponse({
      success: true,
      data: values,
      count: values.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    return jsonResponse({
      success: false,
      error: 'Error getting error data: ' + error.toString()
    });
  }
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

// Get users from Users sheet for authentication (ใช้ข้อมูลจริงจาก Google Sheets)
function getUsersFromSheet(userCode, password) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const userSheet = spreadsheet.getSheetByName('Users');
    
    if (!userSheet) {
      return jsonResponse({
        success: false,
        error: 'ไม่พบ Sheet ชื่อ "Users" กรุณาสร้าง Sheet และนำเข้าข้อมูลจาก sample_users.csv'
      });
    }
    
    // Get all data from the sheet
    const range = userSheet.getDataRange();
    const values = range.getValues();
    
    if (values.length <= 1) {
      return jsonResponse({
        success: false,
        error: 'ไม่พบข้อมูลผู้ใช้ใน Sheet "Users" กรุณานำเข้าข้อมูลจาก sample_users.csv'
      });
    }
    
    // Skip header row and format data
    // Expected columns: PS_Code, ID_13, Name, Group, Level, Email, Password, Status
    let users = values.slice(1).map(row => ({
      psCode: row[0] ? row[0].toString().trim() : '',
      id13: row[1] ? row[1].toString().trim() : '',
      name: row[2] ? row[2].toString().trim() : '',
      group: row[3] ? row[3].toString().trim() : '',
      level: row[4] ? row[4].toString().trim() : '',
      email: row[5] ? row[5].toString().trim() : '',
      password: row[6] ? row[6].toString().trim() : '',
      status: row[7] === true || row[7] === 'TRUE' || row[7] === 'true'
    })).filter(user => 
      user.psCode && // ต้องมี PS Code
      user.status === true // และสถานะเป็น active
    );
    
    // กรองผู้ใช้ตาม userCode และ password ถ้าระบุมา
    if (userCode && password) {
      users = users.filter(user => 
        (user.psCode.toLowerCase() === userCode.toLowerCase() || 
         user.id13.toLowerCase() === userCode.toLowerCase()) &&
        user.password === password
      );
    } else if (userCode) {
      // ถ้าระบุแค่ userCode สำหรับ backward compatibility
      users = users.filter(user => 
        user.psCode.toLowerCase() === userCode.toLowerCase() || 
        user.id13.toLowerCase() === userCode.toLowerCase()
      );
    }
    
    console.log(`ดึงข้อมูลผู้ใช้ได้ ${users.length} คน จาก Google Sheets`);
    
    return jsonResponse({
      success: true,
      users: users, // ใช้ key "users" ตาม client-side expectation
      totalUsers: users.length,
      message: userCode ? 
        `ค้นหาผู้ใช้สำหรับ ${userCode}: พบ ${users.length} คน` :
        `พบข้อมูลผู้ใช้ ${users.length} คนจาก Google Sheets`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in getUsersFromSheet:', error);
    return jsonResponse({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้: ' + error.toString()
    });
  }
}
