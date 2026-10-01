# Predispensing Error Recorder

ระบบบันทึกความคลาดเคลื่อนก่อนจ่ายยา (Predispensing Error) — PWA แบบ static บน GitHub Pages
ใช้ Google Apps Script + Google Sheets เป็น backend

## โครงสร้าง

| ส่วน | ไฟล์ | หน้าที่ |
|---|---|---|
| Frontend | `*.html`, `styles.css`, `js/*.js`, `sw.js` | หน้าเว็บ (GitHub Pages) |
| Backend | `apps-script.js`, `appsscript.json` | API เดียวของระบบ (login, บันทึก/อ่านรายงาน, รายการยา) |
| รายการยา | `drug_list.json`, `tools/sync-drugs.js` | ดึงจาก HOSxP (MySQL) → JSON + Sheet `Drug_List` |
| MCP | `mcp-server/` | เครื่องมือให้ Claude Desktop อ่าน/วิเคราะห์ Sheet (รันในเครื่อง admin เท่านั้น) |

`js/*.js` เป็น classic script ที่แชร์ตัวแปร global ร่วมกัน ลำดับการโหลดกำหนดใน `JS_FILES` ของ `sw.js`
และต้องตรงกับแท็ก `<script>` ในทุกหน้า (`npm test` ตรวจให้) — `init.js` ต้องโหลดเป็นไฟล์สุดท้าย

## ความปลอดภัย

- Login ผ่าน POST → ได้ session token (อายุ 6 ชม.) ทุก action ยกเว้น `login`/`getDrugs` ต้องแนบ token
- สิทธิ์ (role) ตรวจที่ Apps Script — การซ่อนปุ่มฝั่ง client เป็นเพียง UX
- ชื่อผู้รายงานมาจาก session ฝั่ง server (ปลอมไม่ได้)
- ใส่รหัสผิด 5 ครั้ง → ล็อก 15 นาที; รหัสเริ่มต้น/รหัสอ่อนถูกปฏิเสธ
- **Google Sheet ต้องแชร์แบบจำกัด** (ห้าม "Anyone with the link") มิฉะนั้นข้าม API ได้
- ห้าม commit ข้อมูลบุคลากร (`*.users.csv`, `sample_users.csv`), `.env`, `credentials.json` — CI จะ fail

### รีเซ็ตรหัสผ่าน (admin)

เปิด Apps Script editor แล้วรันฟังก์ชัน:

- `auditWeakPasswords()` — แสดงรายชื่อผู้ที่ยังใช้รหัสเริ่มต้น/อ่อน
- `forceResetWeakPasswords()` — ออกรหัสชั่วคราวแบบสุ่มลง Sheet `Temp_Passwords`
  แจกให้ผู้ใช้เป็นรายบุคคล แล้ว**ลบ Sheet นั้นทิ้ง** ผู้ใช้จะถูกบังคับเปลี่ยนรหัสเมื่อ login
- `setUserPasswordHashed('P01', 'รหัสชั่วคราว')` — ตั้งรหัสชั่วคราวให้คนเดียว (บังคับเปลี่ยนเช่นกัน)

## พัฒนา

```bash
npm install            # ESLint
npm ci --prefix tools  # dependencies ของ sync-drugs (ใช้ใน test ด้วย)
npm run check          # lint + test
npx live-server --port=5500   # เปิดหน้าเว็บ (หรือ VS Code task "Launch Live Server")
```

## อัปเดตรายการยา

```bash
cp tools/.env.example tools/.env   # ใส่ค่า MySQL + SPREADSHEET_ID, วาง credentials.json (service account)
npm --prefix tools run sync-drugs:dry-run   # ดูรายการที่เพิ่ม/ลบ/เปลี่ยน
npm --prefix tools run sync-drugs:sheets    # เขียน drug_list.json + Sheet Drug_List
```

แล้ว commit `drug_list.json` (ไฟล์สำรองเมื่อโหลดจาก Sheet ไม่ได้)

## Deploy

- **Frontend**: push เข้า `main` → GitHub Pages; ถ้าเพิ่ม/ลบไฟล์ใน `ASSETS` ให้เพิ่ม `CACHE_VERSION` ใน `sw.js`
- **Backend**: `npm run deploy:backend` (= `clasp push` + `clasp deploy -i <id>` ที่ deployment เดิม → URL ไม่เปลี่ยน)
  - deploy backend **ก่อน** frontend เสมอ
