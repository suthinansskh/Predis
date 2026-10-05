# Predispensing Error Recorder (v2)

ระบบบันทึกและวิเคราะห์ความคลาดเคลื่อนก่อนจ่ายยา — Vue 3 PWA บน GitHub Pages + Google Apps Script API + Google Sheets

## โครงสร้าง

| ส่วน | ที่อยู่ | หน้าที่ |
|---|---|---|
| Frontend | `frontend/` (Vite + Vue 3 + vue-router + vite-plugin-pwa) | แอปทั้งหมด — deploy อัตโนมัติด้วย `.github/workflows/pages.yml` |
| Backend | `backend/src/*.js` (clasp `rootDir`) | API v2 เดียวของระบบ (`api-v2.js`) |
| ข้อมูล | Google Sheets | `Reports` (หลัก), `Users`, `Drug_List`, `Drug_Overrides`, `Activations`, `Password_Resets`, `Audit_Log`, `Meta` |
| รายการยา | `tools/sync-drugs.js` → `drug_list.json` + Sheet `Drug_List` | ดึงจาก HOSxP (MySQL) |
| Migration | `tools/migrate-reports.js` | ย้ายรายงานจาก `Predispensing_Errors` → `Reports` (ทำแล้ว 5 ต.ค. 2569) |
| MCP | `mcp-server/` | ให้ Claude Desktop อ่าน Sheet (รันในเครื่อง admin เท่านั้น) |

`Predispensing_Errors` ยังถูกเขียนคู่กับ `Reports` (mirror รูปแบบเดิม สำหรับคนที่เปิดดู Sheet และ `mcp-server`)
— แหล่งข้อมูลหลักของแอปคือ `Reports`

## API v2

POST `FormData { action, token, payload(JSON) }` → `{ ok: true, data } | { ok: false, error: { code, message, ... } }`

| กลุ่ม | action |
|---|---|
| ไม่ต้อง login | `auth.login`, `auth.activate`, `auth.register`, `auth.requestReset`, `drugs.list` (GET ได้) |
| ผู้ใช้ทุกคน | `auth.me`, `auth.logout`, `auth.changePassword`, `reports.create`, `reports.list`, `reports.stats` |
| เภสัชกรขึ้นไป | `drugs.update`, `drugs.add` |
| admin | `users.list`, `users.approve`, `users.reject`, `users.update`, `users.issueActivations`, `admin.loginStats` |

action แบบเดิม (ไม่มีจุด) ตอบ `APP_UPDATED` ให้แอปเวอร์ชันเก่าที่ค้างใน cache แจ้งผู้ใช้รีโหลด

## ความปลอดภัย

- Token แบบ stateless (HMAC-SHA256, อายุ 12 ชม.) — logout / admin ปิดบัญชี / เปลี่ยนระดับ ยกเลิกทุก session ของผู้ใช้นั้น
- สิทธิ์ตรวจที่ server ทุก action; ระดับ `user` เห็นรายงานคนอื่นแบบไม่มีชื่อผู้รายงาน/รายละเอียด
- รหัสผิดติดกัน → หน่วงเวลา 30 วินาที / 2 นาที / 15 นาที (นับตามบัญชีจริง ไม่ว่าจะใช้ PS Code หรือเลขบัตร)
- รหัสเริ่มต้น/รหัสอ่อนถูกปฏิเสธ → ใช้ **รหัสเปิดใช้งาน** (8 ตัว ใช้ครั้งเดียว อายุ 14 วัน เก็บเฉพาะ hash)
- **Google Sheet ต้องแชร์แบบจำกัด** (ห้าม "Anyone with the link")
- ห้าม commit ข้อมูลบุคลากร / `.env` / `credentials.json` — CI จะ fail

## งาน admin

- **ผู้ใช้ใช้รหัสเริ่มต้น / ลืมรหัสผ่าน**: เมนู "จัดการผู้ใช้" → "ออกรหัส + พิมพ์ใบแจก" (ทุกคนที่ใช้รหัสอ่อน, แยกตามกลุ่มงาน)
  หรือ "รหัสเปิดใช้งาน" รายคน → ผู้ใช้กด "มีรหัสเปิดใช้งาน" ที่หน้า login แล้วตั้งรหัสเอง
- **ลงทะเบียนใหม่**: อนุมัติ/ปฏิเสธ พร้อมกำหนดระดับ ที่หน้าเดียวกัน (มี badge จำนวนงานค้าง)
- **HAD**: กำหนดที่หน้า "รายการยา" เท่านั้น (ไม่ใช้ธง `high_alert_drug` ของ HOSxP ซึ่งไม่ตรงกับรายการ HAD ของห้องยา)
- Apps Script editor (ฉุกเฉิน): `auditWeakPasswords()`, `setUserPasswordHashed('PS', 'รหัสชั่วคราว')`

## พัฒนา

```bash
npm install && npm ci --prefix tools && npm ci --prefix frontend
npm run check                 # lint + backend tests + frontend tests + build
npm --prefix frontend run dev # http://localhost:5173 (ใช้ API จริง — ตั้ง VITE_API_URL เพื่อชี้ที่อื่น)
```

## อัปเดตรายการยา

```bash
cp tools/.env.example tools/.env   # MySQL + SPREADSHEET_ID, วาง credentials.json (service account)
npm --prefix tools run sync-drugs:dry-run
npm --prefix tools run sync-drugs:sheets   # drug_list.json + Sheet Drug_List (HAD จาก Drug_Overrides)
```

แล้ว commit `drug_list.json` (ไฟล์สำรองออฟไลน์ของแอป — Pages build ใหม่อัตโนมัติ)

## Deploy

1. **Backend ก่อนเสมอ**: `npm run deploy:backend` (push + redeploy ที่ deployment เดิม → URL ไม่เปลี่ยน)
   ตรวจว่า `appsscript.json` ยังเป็น `ANYONE_ANONYMOUS`
2. **Frontend**: push เข้า `main` → workflow `pages.yml` test + build + deploy อัตโนมัติ
