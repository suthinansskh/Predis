# การเปลี่ยนแปลงสำหรับการใช้ข้อมูลจริง (Production Mode)

## 🎯 **สถานะปัจจุบัน**

### ✅ **ที่เสร็จแล้ว:**
1. **ข้อมูลผู้ใช้จริง:** มีข้อมูลผู้ใช้ครบ 77 คนในไฟล์ `sample_users.csv`
2. **Google Apps Script:** มีฟังก์ชัน `getUsers()` พร้อมใช้งาน
3. **Authentication Logic:** ระบบ Login รองรับการดึงข้อมูลจาก Google Sheets
4. **Fallback Mode:** หาก Google Sheets ไม่พร้อม จะใช้ข้อมูล demo

### 🔄 **ที่ต้องทำ:**
1. **Deploy Google Apps Script** เป็น Web App
2. **สร้าง Users Sheet** ใน Google Sheets พร้อมข้อมูลจริง
3. **อัปเดต Web App URL** ในไฟล์ `script.js`

## 📋 **ขั้นตอนการเปลี่ยนไปใช้ข้อมูลจริง**

### ขั้นตอนที่ 1: สร้าง Google Sheets
```
1. เปิด Google Sheets: https://docs.google.com/spreadsheets/d/1QDIxEXCVLiA7oijXN15N2ZH2LzPtHDecbqolYGs9Ldk/edit
2. สร้าง Sheet ใหม่ชื่อ "Users"
3. Copy ข้อมูลจาก sample_users.csv มาใส่
4. ตรวจสอบว่ามี Header ครบ 8 คอลัมน์:
   PS_Code | ID_13 | Name | Group | Level | Email | Password | Status
```

### ขั้นตอนที่ 2: Deploy Google Apps Script
```
1. ไปที่ https://script.google.com/
2. สร้างโปรเจกต์ใหม่
3. คัดลอกโค้ดจาก apps-script.js
4. Deploy เป็น Web App:
   - Execute as: Me
   - Who has access: Anyone
5. คัดลอก Web App URL
```

### ขั้นตอนที่ 3: อัปเดตการตั้งค่า
```javascript
// ในไฟล์ script.js เปลี่ยนจาก:
webAppUrl: ''

// เป็น:
webAppUrl: 'YOUR_ACTUAL_WEB_APP_URL'
```

## 🔧 **การตั้งค่าที่เปลี่ยนแปลง**

### ไฟล์ `script.js`:
```javascript
async function authenticateUser(userCode) {
    // จะใช้ Google Apps Script ก่อน (Production Mode)
    // หากเกิดข้อผิดพลาด จะ fallback ไปใช้ demo data
}
```

### ไฟล์ `apps-script.js`:
```javascript
function getUsers(spreadsheet, userSheetName = 'Users', userCode = null) {
    // ดึงข้อมูลผู้ใช้ทั้งหมด 77 คนจาก Users Sheet
    // กรองเฉพาะผู้ใช้ที่ status = TRUE
    // ค้นหาด้วย PS Code หรือ ID 13 หลัก
}
```

## 📊 **ข้อมูลผู้ใช้ในระบบ**

### เภสัชกร (47 คน):
- PS Code: P01-P48 (ไม่มี P20)
- ระดับ: admin, supervisor, pharmacist
- ตัวอย่าง: P13 = [REDACTED NAME] (admin)

### เจ้าพนักงานเภสัชกรรม (30 คน):
- PS Code: S01-S31 (ไม่มี S10, S20, S24)
- ระดับ: user
- ตัวอย่าง: S01 = [REDACTED NAME] (user)

## 🧪 **การทดสอบ**

### Demo Mode (ปัจจุบัน):
```
Login ได้ด้วย: P13, P01, P02, P03, P22, P25, S01, S02, S19, admin
ID 13: XXXXXXXXXXXXX (P13), 9999999999999 (admin)
```

### Production Mode (หลัง Deploy):
```
Login ได้ด้วย PS Code หรือ ID 13 ของผู้ใช้ทั้งหมด 77 คน
ข้อมูลดึงจาก Google Sheets แบบ Real-time
```

## 🚦 **การตรวจสอบสถานะ**

### ตรวจสอบว่าอยู่ใน Production Mode:
1. เปิด Browser Console (F12)
2. ดูว่าขึ้น "Production Mode: ตรวจสอบผู้ใช้จาก Google Sheets"
3. หากเป็น "Fallback to Demo Mode" แสดงว่ายังเชื่อมต่อ Google Sheets ไม่ได้

### ตรวจสอบข้อมูลผู้ใช้:
```javascript
// ใน Console สามารถทดสอบได้:
fetch('YOUR_WEB_APP_URL?action=getUsers')
  .then(r => r.json())
  .then(d => console.log(d));
```

## 📝 **หมายเหตุสำคัญ**

1. **ข้อมูลใน Google Sheets ต้องมี Status = TRUE** เพื่อให้ Login ได้
2. **Apps Script ต้อง Deploy ใหม่** ทุกครั้งที่แก้โค้ด
3. **Web App URL จะเปลี่ยน** หากมีการ Deploy ใหม่
4. **ระบบมี Fallback** หากไม่สามารถเชื่อมต่อ Google Sheets ได้

## 🔐 **ความปลอดภัย**

### ในระบบจริง:
- ข้อมูลผู้ใช้เก็บใน Google Sheets (ปลอดภัย)
- รหัสผ่านเก็บในรูปแบบ Plain Text (ควรเข้ารหัส)
- การเข้าถึงผ่าน Google Apps Script (มี Authentication)

### คำแนะนำ:
- ควรเข้ารหัสรหัสผ่านใน Google Sheets
- ตั้งค่า Google Sheets ให้เฉพาะคนที่เกี่ยวข้องเข้าถึงได้
- ติดตาม Apps Script Logs สำหรับการใช้งาน

---

**สถานะ:** พร้อมใช้งานในโหมด Demo / รอ Deploy เพื่อใช้ข้อมูลจริง
**อัปเดตล่าสุด:** สิงหาคม 2025 - เพิ่มข้อมูลผู้ใช้ครบ 77 คน
