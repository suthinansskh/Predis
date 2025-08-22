# โครงสร้าง Users Sheet สำหรับระบบ Login

# โครงสร้าง Users Sheet สำหรับระบบ Login

## 📊 โครงสร้าง Google Sheet ชื่อ "Users" (โครงสร้างจริง)

| คอลัมน์ | ชื่อฟิลด์ | รายละเอียด | ตัวอย่าง | บังคับ |
|---------|-----------|------------|----------|--------|
| A | **PS Code** | รหัส PS Code | `P01`, `P02` | ✅ |
| B | **ID 13 หลัก** | รหัส ID13 หลัก 13 หลัก | `XXXXXXXXXXXXX` | ✅ |
| C | **ชื่อ-นามสกุล** | ชื่อ-นามสกุลเต็ม | `ทดสอบ ทดสอบ` | ✅ |
| D | **กลุ่ม** | กลุ่มงาน/แผนก | `เภสัชกร`, `พยาบาล` | ✅ |
| E | **ระดับ** | ระดับตำแหน่ง | `supervisor`, `staff` | ✅ |
| F | **อีเมล** | อีเมลผู้ใช้ | `user@hospital.com` | ❌ |
| G | **รหัสผ่าน** | รหัสผ่าน | `@12345` | ❌ |
| H | **status** | สถานะการใช้งาน | `TRUE`, `FALSE` | ✅ |

## 📝 ตัวอย่างข้อมูลใน Sheet

```
A       B               C                                      D                          E           F                       G        H
PS Code ID 13 หลัก      ชื่อ-นามสกุล                           กลุ่ม                       ระดับ       อีเมล                   รหัสผ่าน  status
P01     XXXXXXXXXXXXX   ทดสอบ ทดสอบ                           เภสัชกร                    supervisor                          @12345   TRUE
P02     XXXXXXXXXXXXX   [REDACTED NAME]                     เภสัชกร                    pharmacist                          @12345   TRUE
P03     XXXXXXXXXXXXX   [REDACTED NAME]                เภสัชกร                    pharmacist                          @12345   TRUE
P13     XXXXXXXXXXXXX   [REDACTED NAME]                 เภสัชกร                    admin       s.oekaroek@gmail.com    admin123 TRUE
S01     XXXXXXXXXXXXX   [REDACTED NAME]                      เจ้าพนักงานเภสัชกรรม       user                                @12345   TRUE
S02     XXXXXXXXXXXXX   [REDACTED NAME]                 เจ้าพนักงานเภสัชกรรม       user                                @12345   TRUE
```

## 🔐 การทำงานของระบบ Login

### 1. **การเข้าสู่ระบบ**
- ผู้ใช้สามารถใส่ **PS Code** หรือ **ID13** ได้
- ระบบจะค้นหาใน Google Sheet "Users"
- ตรวจสอบ `status = "Active"` เท่านั้น

### 2. **Demo Mode (ไม่ต้องตั้งค่า Google Apps Script)**
ผู้ใช้ตัวอย่างที่สามารถ Login ได้:

**เภสัชกร:**
- `P01` หรือ `XXXXXXXXXXXXX` - ทดสอบ ทดสอบ (เภสัชกร - supervisor)
- `P02` หรือ `XXXXXXXXXXXXX` - [REDACTED NAME] (เภสัชกร - pharmacist)
- `P03` หรือ `XXXXXXXXXXXXX` - [REDACTED NAME] (เภสัชกร - pharmacist)
- `P13` หรือ `XXXXXXXXXXXXX` - [REDACTED NAME] (เภสัชกร - admin)
- `P22` หรือ `XXXXXXXXXXXXX` - [REDACTED NAME] (เภสัชกร - pharmacist)
- `P25` หรือ `XXXXXXXXXXXXX` - [REDACTED NAME] (เภสัชกร - pharmacist)

**เจ้าพนักงานเภสัชกรรม:**
- `S01` หรือ `XXXXXXXXXXXXX` - [REDACTED NAME] (เจ้าพนักงานเภสัชกรรม - user)
- `S02` หรือ `XXXXXXXXXXXXX` - [REDACTED NAME] (เจ้าพนักงานเภสัชกรรม - user)
- `S19` หรือ `XXXXXXXXXXXXX` - [REDACTED NAME] (เจ้าพนักงานเภสัชกรรม - user)

**Admin:**
- `admin` หรือ `9999999999999` - ผู้ดูแลระบบ (IT - admin)

### 3. **Production Mode (ใช้ Google Apps Script)**
- ข้อมูลผู้ใช้จะมาจาก Google Sheet จริง
- ระบบจะค้นหาผู้ใช้ด้วย API ที่ปลอดภัย

## 🛠️ การตั้งค่า Google Sheet

### ขั้นตอนที่ 1: สร้าง Sheet
1. สร้าง Sheet ใหม่ชื่อ **"Users"**
2. ใส่ headers ในแถวแรก: `userCode`, `name`, `department`, `position`, `id13`, `status`
3. เพิ่มข้อมูลผู้ใช้ตามตัวอย่างด้านบน

### ขั้นตอนที่ 2: แก้ไข Google Apps Script
โค้ดสำหรับจัดการผู้ใช้ได้ถูกเพิ่มใน `apps-script.js` แล้ว:
```javascript
// Handle get users for authentication
if (data.action === 'getUsers') {
  return getUsers(spreadsheet, data.userSheetName || 'Users', data.userCode);
}
```

### ขั้นตอนที่ 3: Deploy Web App
1. คัดลอกโค้ดจาก `apps-script.js` ไปใส่ใน Google Apps Script
2. Deploy เป็น Web App
3. ตั้งค่า Web App URL ในหน้าตั้งค่าของแอปพลิเคชัน

## 🔒 การรักษาความปลอดภัย

### 1. **ไม่มีรหัสผ่าน**
- ระบบใช้ PS Code/ID13 เท่านั้น (Single Sign-On แบบง่าย)
- เหมาะสำหรับสภาพแวดล้อมที่ควบคุมได้

### 2. **Session Management**
- ข้อมูล Login เก็บใน `localStorage`
- ปุ่ม Logout จะลบข้อมูล session
- ระบบจะตรวจสอบการ Login ทุกครั้งที่เปิดหน้า

### 3. **การจำกัดสิทธิ์**
- เฉพาะผู้ใช้ที่มี `status = "Active"` เท่านั้น
- สามารถเพิ่มระดับสิทธิ์ในอนาคตได้

## 📱 การใช้งาน

### 1. **หน้า Login**
- ใส่ PS Code หรือ ID13
- กดปุ่ม "เข้าสู่ระบบ"
- ระบบจะตรวจสอบและแสดงข้อความต้อนรับ

### 2. **หน้าหลัก**
- แสดงชื่อผู้ใช้ที่ Login มุมขวาบน
- ปุ่ม "ออกจากระบบ" สำหรับ Logout

### 3. **การบันทึกข้อมูล**
- ฟิลด์ "ผู้รายงาน" จะใช้ข้อมูลจากผู้ใช้ที่ Login
- ไม่ต้องเลือกผู้รายงานซ้ำ

## 🎯 ประโยชน์ของระบบ Login

1. **ควบคุมการเข้าถึง**: เฉพาะบุคลากรที่ได้รับอนุญาต
2. **ติดตามผู้รายงาน**: รู้ว่าใครรายงานข้อผิดพลาดแต่ละครั้ง
3. **ประสบการณ์ที่ดี**: ไม่ต้องใส่ชื่อผู้รายงานทุกครั้ง
4. **การจัดการง่าย**: เพิ่ม/ลด/แก้ไขผู้ใช้ผ่าน Google Sheet

## 🔧 การแก้ไขปัญหา

### ปัญหา: Login ไม่ได้
- ตรวจสอบ PS Code/ID13 ให้ถูกต้อง
- ตรวจสอบ `status = "Active"` ใน Sheet
- ตรวจสอบการเชื่อมต่อ Internet

### ปัญหา: ข้อมูลไม่อัปเดต
- Refresh หน้าเว็บ
- ตรวจสอบ Google Sheet ว่ามีข้อมูลใหม่
- ตรวจสอบ Web App URL ในการตั้งค่า
