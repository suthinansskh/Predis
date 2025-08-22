# การอัปเดต Google Apps Script - แก้ปัญหา CORS

## 🔧 ขั้นตอนการแก้ไข CORS:

### 1. เข้าไปที่ Google Apps Script
- ไปที่: https://script.google.com
- เปิดโปรเจ็ค Apps Script ของคุณ

### 2. อัปเดตโค้ดทั้งหมด
**⚠️ สำคัญ: คัดลอกโค้ดจากไฟล์ `apps-script.js` ในโปรเจ็คนี้ทั้งหมด**

การอัปเดตครั้งนี้เพิ่ม:
- ✅ CORS headers ในทุก response
- ✅ doGet() function สำหรับ preflight requests
- ✅ OPTIONS method handling
- ✅ Cross-origin support

### 3. บันทึกและ Deploy ใหม่
1. กด **Ctrl+S** เพื่อบันทึก
2. ไปที่ **Deploy > New Deployment**
3. เลือก **"Web app"** 
4. ตั้งค่า:
   - **Execute as**: Me (your email)
   - **Who has access**: Anyone
5. กด **Deploy**
6. **คัดลอก URL ใหม่**

### 4. อัปเดต URL ในแอปพลิเคชัน
- ไปที่หน้า **Settings** ในแอปพลิเคชัน
- วาง **URL ใหม่** ในช่อง "Google Apps Script Web App URL"
- กด **Save Settings**

## 🎯 สิ่งที่แก้ไขแล้ว:
- ✅ **CORS Headers**: เพิ่ม Access-Control-Allow-Origin
- ✅ **Preflight Support**: รองรับ OPTIONS requests
- ✅ **Error Handling**: CORS headers ในทุก error response
- ✅ **Drug Sheet Support**: รองรับ drugSheetName แบบ dynamic

## 🧪 วิธีทดสอบ:
1. รีเฟรชเพจแอปพลิเคชัน
2. ดู Console - ควรไม่มี CORS errors
3. ทดสอบ dropdown รายการยา - ควรโหลดจาก API
4. ทดสอบบันทึกข้อมูล

## 📋 หากยังมีปัญหา:
1. ตรวจสอบว่า Deploy เป็น **"Anyone"** access
2. ลองใช้ **Incognito/Private** browsing mode
3. รอ 2-3 นาทีหลัง deploy ใหม่
4. ตรวจสอบ URL ใน Settings ว่าถูกต้อง
