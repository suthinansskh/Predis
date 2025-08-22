# Google Apps Script Setup Guide

## วิธีตั้งค่า Google Apps Script สำหรับ Predispensing Error Recorder

### ขั้นตอนที่ 1: สร้าง Google Apps Script Project

1. ไปที่ [Google Apps Script](https://script.google.com/)
2. คลิก "โครงการใหม่" (New Project)
3. ลบโค้ดเริ่มต้นออก
4. คัดลอกโค้ดจากไฟล์ `apps-script.js` ทั้งหมดมาวาง

### ขั้นตอนที่ 2: ตั้งค่า Spreadsheet ID

1. ไปที่ Google Sheets ของคุณ
2. คัดลอก Spreadsheet ID จาก URL
   ```
   https://docs.google.com/spreadsheets/d/1QDIxEXCVLiA7oijXN15N2ZH2LzPtHDecbqolYGs9Ldk/edit
   
   Spreadsheet ID = 1QDIxEXCVLiA7oijXN15N2ZH2LzPtHDecbqolYGs9Ldk
   ```
3. แทนที่ Spreadsheet ID ในโค้ด Apps Script

### ขั้นตอนที่ 3: Deploy Web App

1. ในหน้า Apps Script คลิก "ปรับใช้" (Deploy) > "การปรับใช้ใหม่" (New Deployment)
2. เลือก Type: "Web app"
3. ตั้งค่า:
   - **Execute as:** Me (ผู้สร้าง)
   - **Who has access:** Anyone (ทุกคน)
4. คลิก "Deploy"
5. คัดลอก Web App URL ที่ได้

### ขั้นตอนที่ 4: อัปเดต Web App URL

คัดลอก URL ที่ได้จากขั้นตอนที่ 3 มาใส่ในไฟล์ `script.js`:

```javascript
let googleSheetsConfig = {
    webAppUrl: 'YOUR_WEB_APP_URL_HERE'
};
```

### ขั้นตอนที่ 5: สร้าง Users Sheet

1. ไปที่ Google Sheets
2. สร้าง Sheet ใหม่ชื่อ "Users"
3. สร้าง Header ตามโครงสร้างนี้:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| PS_Code | ID_13 | Name | Group | Level | Email | Password | Status |

4. นำเข้าข้อมูลจากไฟล์ `sample_users.csv`

### ขั้นตอนที่ 6: ทดสอบการเชื่อมต่อ

1. เปิดเว็บแอปพลิเคชัน
2. ทดสอบ Login ด้วย:
   - PS Code: P13
   - หรือ ID 13: 3320100275241
3. ตรวจสอบ Console ใน Browser (F12) ว่ามีข้อผิดพลาดหรือไม่

### การแก้ไขปัญหา

#### ปัญหา: "Script function not found"
**แก้ไข:** ตรวจสอบให้แน่ใจว่าได้คัดลอกโค้ดทั้งหมดจาก `apps-script.js`

#### ปัญหา: "Permission denied"
**แก้ไข:** 
1. ในหน้า Apps Script ไปที่ "การอนุมัติ" (Permissions)
2. อนุมัติการเข้าถึง Google Sheets

#### ปัญหา: "Spreadsheet not found"
**แก้ไข:** ตรวจสอบ Spreadsheet ID ให้ถูกต้อง

#### ปัญหา: CORS Error
**แก้ไข:** ตรวจสอบว่า Deploy settings เป็น "Anyone" และใช้ FormData ในการส่งข้อมูล

### ตัวอย่าง Web App URL ที่ถูกต้อง

```
https://script.google.com/macros/s/AKfycbwlq9JEVCGqE_vhKLFE7-x7Mj2S7t0kJZwwkHRhyLWn8t5aJWsUr4qKBNS5U9qJqJQm/exec
```

### การทดสอบ Apps Script

สามารถทดสอบ Apps Script โดยตรงผ่าน URL:

```
https://YOUR_WEB_APP_URL/exec?action=getUsers
```

ควรได้ Response:
```json
{
  "success": true,
  "data": [...user data...],
  "count": 77
}
```

## หมายเหตุสำคัญ

1. **Google Sheets ต้องมี Sheet ชื่อ "Users"** พร้อมข้อมูลผู้ใช้ทั้งหมด 77 คน
2. **Apps Script ต้อง Deploy ใหม่** ทุกครั้งที่แก้ไขโค้ด
3. **Web App URL จะเปลี่ยน** หากมีการ Deploy ใหม่
4. **ข้อมูลผู้ใช้ใน Google Sheets ต้องมี Status = TRUE** เพื่อให้สามารถ Login ได้
