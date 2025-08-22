# 🔧 Environment Configuration Guide

## ⚠️ สำคัญ: การตั้งค่าข้อมูลส่วนตัว

ก่อนใช้งานแอปพลิเคชัน คุณต้องตั้งค่าข้อมูลส่วนตัวของคุณเอง:

### 1. Google Sheets API Configuration

แก้ไขไฟล์ `script.js` บรรทัดที่ 6-12:

```javascript
let googleSheetsConfig = {
    apiKey: 'YOUR_GOOGLE_SHEETS_API_KEY',
    spreadsheetId: 'YOUR_GOOGLE_SHEETS_ID',
    sheetName: 'Predispensing_Errors',
    userSheetName: 'Users',
    drugSheetName: 'Drug_List',
    webAppUrl: 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL'
};
```

### 2. วิธีการได้มาซึ่งข้อมูลเหล่านี้

#### Google Sheets API Key:
1. ไปที่ [Google Cloud Console](https://console.cloud.google.com/)
2. สร้างโปรเจกต์ใหม่หรือเลือกโปรเจกต์ที่มีอยู่
3. เปิดใช้งาน Google Sheets API
4. สร้าง API Key ใน Credentials

#### Google Sheets ID:
- จาก URL ของ Google Sheet ของคุณ
- ตัวอย่าง: `https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit`

#### Google Apps Script Web App URL:
1. เปิด Google Sheet → Extensions → Apps Script
2. วางโค้ดจากไฟล์ `apps-script.js`
3. Deploy → New deployment → Web app
4. คัดลอก URL ที่ได้

### 3. การรักษาความปลอดภัย

❗ **อย่าเอาข้อมูลเหล่านี้ขึ้น GitHub หรือแชร์กับผู้อื่น**

- API Keys สามารถเข้าถึงข้อมูลของคุณได้
- ใช้ `.gitignore` เพื่อไม่ให้ commit ไฟล์ที่มีข้อมูลส่วนตัว
- หากต้องการแชร์โค้ด ให้ลบข้อมูลส่วนตัวออกก่อน

### 4. Demo Mode

หากไม่ตั้งค่า `webAppUrl` แอปจะทำงานในโหมด Demo:
- แสดงข้อมูลตัวอย่าง
- ไม่สามารถบันทึกข้อมูลได้จริง
- เหมาะสำหรับการทดสอบ

### 5. Production Setup

สำหรับการใช้งานจริง:
1. ตั้งค่าข้อมูลทั้งหมดให้ครบถ้วน
2. ทดสอบการเชื่อมต่อ
3. เตรียมข้อมูลผู้ใช้ใน Google Sheets
4. ทดสอบการบันทึกข้อมูล

## 📚 เอกสารเพิ่มเติม

- [README.md](README.md) - คำแนะนำการติดตั้งและใช้งาน
- [GOOGLE_APPS_SCRIPT_SETUP.md](GOOGLE_APPS_SCRIPT_SETUP.md) - การตั้งค่า Google Apps Script
- [USER_MANUAL.md](USER_MANUAL.md) - คู่มือการใช้งาน
