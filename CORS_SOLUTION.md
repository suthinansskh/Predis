# การแก้ปัญหา CORS ใน Predispensing Error Recorder

## 🚨 ปัญหา CORS ที่พบ
```
Access to fetch at 'https://script.google.com/...' has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## ✅ วิธีแก้ไขที่ดำเนินการแล้ว

### 1. **เปลี่ยนจาก JSON เป็น FormData**
- **ก่อน**: ใช้ `Content-Type: application/json` ซึ่งทำให้เกิด preflight request
- **หลัง**: ใช้ `FormData` ที่ไม่ต้องการ preflight request

### 2. **ลบ Headers ที่ไม่จำเป็น**
```javascript
// ❌ แบบเดิม (ทำให้เกิด CORS preflight)
const response = await fetch(url, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(data)
});

// ✅ แบบใหม่ (หลีกเลี่ยง CORS preflight)
const formData = new FormData();
formData.append('action', 'getDrugList');
formData.append('drugSheetName', 'Drug_List');

const response = await fetch(url, {
    method: 'POST',
    body: formData  // ไม่ต้องใส่ headers
});
```

### 3. **เพิ่ม Demo Mode**
ถ้าไม่ได้ตั้งค่า Google Apps Script Web App URL ระบบจะทำงานในโหมดทดสอบ:
- ใช้ข้อมูลยาตัวอย่าง
- จำลองการบันทึกข้อมูล
- แสดงผลลัพธ์ในคอนโซล

## 🔧 ฟังก์ชันที่ได้รับการแก้ไข

### 1. **loadDrugList()**
```javascript
// ใช้ FormData แทน JSON
const formData = new FormData();
formData.append('action', 'getDrugList');
formData.append('drugSheetName', googleSheetsConfig.drugSheetName || 'Drug_List');

const response = await fetch(googleSheetsConfig.webAppUrl, {
    method: 'POST',
    body: formData  // ไม่มี headers
});
```

### 2. **handleDrugFormSubmit()**
```javascript
// เพิ่ม Demo Mode
if (!googleSheetsConfig.webAppUrl) {
    console.log('Demo Mode: เพิ่มยาใหม่', drugData);
    globalDrugList.push(drugData);
    showNotification('✅ เพิ่มรายการยาเรียบร้อย (โหมดทดสอบ)', 'success');
    return;
}

// ใช้ FormData สำหรับการส่งข้อมูลจริง
const formData = new FormData();
formData.append('action', 'addDrug');
formData.append('drugCode', drugData.drugCode);
// ... ฟิลด์อื่นๆ
```

## 🎯 ประโยชน์ของการแก้ไข

1. **หลีกเลี่ยง CORS Preflight**: FormData ไม่จำเป็นต้องใช้ preflight request
2. **ความเข้ากันได้**: ทำงานได้กับ Google Apps Script โดยไม่ต้องแก้ไข server-side
3. **Demo Mode**: สามารถทดสอบได้โดยไม่ต้องตั้งค่า Google Apps Script
4. **UX ที่ดีขึ้น**: มีการแจ้งเตือนสถานะการทำงานอย่างชัดเจน

## 📋 วิธีทดสอบ

### 1. **โหมดทดสอบ** (ไม่ต้องตั้งค่า Google Apps Script)
- เปิดแอปพลิเคชัน
- จะเห็นข้อความ "กำลังทำงานในโหมดทดสอบ"
- ทุกฟังก์ชันทำงานได้ แต่ไม่บันทึกข้อมูลจริง

### 2. **โหมดการใช้งานจริง**
1. Deploy Google Apps Script เป็น Web App
2. ใส่ Web App URL ในหน้าตั้งค่า
3. ระบบจะเปลี่ยนเป็นการบันทึกข้อมูลจริงใน Google Sheets

## 🔍 การตรวจสอบการทำงาน

เปิด Developer Tools (F12) และดูในแท็บ Console:
- **Demo Mode**: จะเห็นข้อความ "Demo Mode: ใช้ข้อมูลยาตัวอย่าง"
- **Network Tab**: จะไม่เห็น preflight OPTIONS requests อีกต่อไป
- **การโหลดยา**: จะเห็นข้อความ "โหลดข้อมูลยาตัวอย่าง: 5 รายการ"

## 🚀 สรุป

การแก้ไขนี้จะทำให้:
1. ✅ แก้ปัญหา CORS แล้ว
2. ✅ ระบบทำงานได้ทั้งโหมดทดสอบและโหมดจริง
3. ✅ UX ดีขึ้นด้วยการแจ้งเตือนสถานะ
4. ✅ ไม่ต้องแก้ไข Google Apps Script code
