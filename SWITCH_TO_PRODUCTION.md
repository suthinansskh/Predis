# วิธีเปลี่ยนไปใช้ข้อมูลจริงจาก Google Sheets

## 🎯 **ขั้นตอนการเปลี่ยนไปใช้ Production Mode**

### ขั้นตอนที่ 1: เตรียม Google Sheets
1. เปิด Google Sheets: https://docs.google.com/spreadsheets/d/1QDIxEXCVLiA7oijXN15N2ZH2LzPtHDecbqolYGs9Ldk/edit
2. สร้าง Sheet ใหม่ชื่อ **"Users"**
3. ใส่ Header ในแถวแรก:
   ```
   A1: PS_Code
   B1: ID_13
   C1: Name
   D1: Group
   E1: Level
   F1: Email
   G1: Password
   H1: Status
   ```

### ขั้นตอนที่ 2: นำเข้าข้อมูลผู้ใช้
1. เปิดไฟล์ `sample_users.csv`
2. Copy ข้อมูลทั้งหมด (77 บรรทัด)
3. Paste ลงใน Sheet "Users" โดยเริ่มจากแถวที่ 2
4. ตรวจสอบว่าข้อมูลครบทั้งหมด 77 คน

### ขั้นตอนที่ 3: Deploy Google Apps Script
1. ไปที่ https://script.google.com/
2. คลิก **"โครงการใหม่"**
3. ลบโค้ดเก่าออก
4. Copy โค้ดจากไฟล์ `apps-script.js` ทั้งหมดมาวาง
5. บันทึกโครงการ (ตั้งชื่อ: "Predispensing Error Recorder")

### ขั้นตอนที่ 4: ตั้งค่า Deployment
1. คลิก **"ปรับใช้" (Deploy)** > **"การปรับใช้ใหม่" (New Deployment)**
2. เลือก Type: **"Web app"**
3. ตั้งค่า:
   - **Execute as:** Me (ผู้สร้าง)
   - **Who has access:** Anyone (ทุกคน)
4. คลิก **"Deploy"**
5. อนุมัติการเข้าถึง Google Sheets
6. **Copy Web App URL** ที่ได้

### ขั้นตอนที่ 5: อัปเดต Web App URL
1. เปิดไฟล์ `script.js`
2. หาบรรทัด:
   ```javascript
   webAppUrl: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'
   ```
3. แทนที่ `YOUR_DEPLOYMENT_ID` ด้วย ID จริงที่ได้จาก Deploy
4. บันทึกไฟล์

## 📋 **ตัวอย่าง Web App URL ที่ถูกต้อง**

```javascript
webAppUrl: 'https://script.google.com/macros/s/AKfycbwlq9JEVCGqE_vhKLFE7-x7Mj2S7t0kJZwwkHRhyLWn8t5aJWsUr4qKBNS5U9qJqJQm/exec'
```

## 🧪 **การทดสอบ**

### ทดสอบ Apps Script:
1. เปิด URL ใน Browser: `YOUR_WEB_APP_URL?action=getUsers`
2. ควรได้ Response:
   ```json
   {
     "success": true,
     "data": [...user data...],
     "count": 77
   }
   ```

### ทดสอบการ Login:
1. เปิดระบบ Predispensing Error Recorder
2. ใส่ PS Code จริง เช่น: **P13**
3. ดู Console (F12) ควรขึ้น: **"Production Mode: ตรวจสอบผู้ใช้จาก Google Sheets P13"**
4. Login สำเร็จด้วยข้อมูลจริง

## 🔧 **การแก้ไขปัญหา**

### ปัญหา: "Script function not found"
**แก้ไข:** ตรวจสอบว่าได้ Copy โค้ดจาก `apps-script.js` ครบถ้วน

### ปัญหา: "Permission denied"
**แก้ไข:** 
1. ใน Apps Script ไปที่ "อำนาจ" (Permissions)
2. อนุมัติการเข้าถึง Google Sheets

### ปัญหา: "Spreadsheet not found"
**แก้ไข:** ตรวจสอบ Spreadsheet ID ใน `apps-script.js`

### ปัญหา: CORS Error
**แก้ไข:** ตรวจสอบ Deploy Settings เป็น "Anyone"

## 📊 **ข้อมูลที่จะใช้จริง**

### ผู้ใช้ทั้งหมด: 77 คน
- **เภสัชกร:** 47 คน (P01-P48, ไม่มี P20)
- **เจ้าพนักงานเภสัชกรรม:** 30 คน (S01-S31, ไม่มี S10, S20, S24)

### ตัวอย่างผู้ใช้จริง:
```
P13 | XXXXXXXXXXXXX | [REDACTED NAME] | เภสัชกร | admin
P12 | XXXXXXXXXXXXX | [REDACTED NAME] | เภสัชกร | pharmacist
S01 | XXXXXXXXXXXXX | [REDACTED NAME] | เจ้าพนักงานเภสัชกรรม | user
```

## ⚠️ **ข้อควรระวัง**

1. **Web App URL จะเปลี่ยน** หากมีการ Deploy ใหม่
2. **ต้อง Deploy ใหม่** ทุกครั้งที่แก้ไขโค้ด Apps Script
3. **ข้อมูลใน Google Sheets ต้องมี Status = TRUE** เพื่อให้ Login ได้
4. **Spreadsheet ID ต้องถูกต้อง** ทั้งใน `script.js` และ `apps-script.js`

## 🎉 **ผลลัพธ์เมื่อเสร็จสิ้น**

✅ ระบบใช้ข้อมูลผู้ใช้จริงจาก Google Sheets  
✅ Login ได้ด้วย PS Code หรือ ID 13 หลักจริง  
✅ ข้อมูลแบบ Real-time จาก Google Sheets  
✅ ไม่ต้องพึ่งข้อมูล Demo อีกต่อไป  

---

**หมายเหตุ:** หากต้องการกลับไปใช้โหมด Demo ให้ใส่ `webAppUrl: ''` (ค่าว่าง) ในไฟล์ `script.js`
