// ค่าคงที่และการตั้งค่า (Sheet, role, นโยบายรหัสผ่าน)
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน

const SPREADSHEET_ID = '1QDIxEXCVLiA7oijXN15N2ZH2LzPtHDecbqolYGs9Ldk';

const ERROR_SHEET = 'Predispensing_Errors';

const DRUG_SHEET = 'Drug_List';

// ค่า HAD/สถานะที่เภสัชกรแก้เอง — Drug_List ถูกเขียนทับเมื่อ sync จาก HOSxP จึงต้องเก็บแยก
const DRUG_OVERRIDE_SHEET = 'Drug_Overrides';

const USER_SHEET = 'Users';

const PASSWORD_MIN_LENGTH = 8;

const PASSWORD_ITERATIONS = 1000; // Apps Script ไม่มี PBKDF2 — วน SHA-256 แทน

// รหัสผ่านเริ่มต้นที่เคยหลุดสู่สาธารณะ (sample_users.csv ใน repo public)
const WEAK_PASSWORDS = ['@12345', '12345', '123456', '1234', 'password', 'Admin@1234'];

// true = ปฏิเสธการ login ด้วยรหัสอ่อน/รหัสเริ่มต้น เพราะผู้อื่นรู้รหัสนี้แล้ว
// ผู้ใช้ต้องใช้รหัสเปิดใช้งานจาก admin (ดู activation.js)
const BLOCK_WEAK_PASSWORD_LOGIN = true;

const USER_LEVELS = ['user', 'pharmacist', 'supervisor', 'admin'];

// ระดับที่เห็นรายงานของทุกคนแบบเต็ม — ระดับ user เห็นรายงานคนอื่นแบบไม่ระบุตัวตน
const FULL_REPORT_ACCESS = ['admin', 'supervisor', 'pharmacist'];

const REDACTED_REPORTER = '(ผู้รายงานอื่น)';

const USER_GROUPS = ['เภสัชกร', 'เจ้าพนักงานเภสัชกรรม', 'อื่นๆ'];

const RESET_SHEET = 'Password_Resets';

// คอลัมน์ใน Sheet Users (1-based) — I/J เพิ่มสำหรับการลงทะเบียน
const COL = { PS: 1, ID13: 2, NAME: 3, GROUP: 4, LEVEL: 5, EMAIL: 6, PASSWORD: 7, STATUS: 8, REQUEST: 9, REQUESTED_AT: 10 };

const USER_HEADER = ['PS Code', 'ID 13 หลัก', 'ชื่อ-นามสกุล', 'กลุ่ม', 'ระดับ', 'อีเมล', 'รหัสผ่าน', 'status', 'สถานะคำขอ', 'วันที่ขอ'];

const REGISTER_MAX_PER_HOUR = 30;

const RESET_REQUEST_COOLDOWN_SECONDS = 60 * 60;

// ===== v2 =====

const REPORTS_SHEET = 'Reports';
const ACTIVATIONS_SHEET = 'Activations';
const META_SHEET = 'Meta';

// token แบบ stateless ครอบคลุมเวร 12 ชม. (เดิม CacheService 6 ชม. และถูกล้างได้)
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const ACTIVATION_TTL_DAYS = 14;

// หน่วงเวลาหลังใส่รหัสผิดติดกัน (นับตามบัญชีจริง) — เรียงจากมากไปน้อย
const LOGIN_DELAYS = [
  { failures: 7, seconds: 15 * 60 },
  { failures: 5, seconds: 2 * 60 },
  { failures: 3, seconds: 30 }
];

const DRUG_MANAGERS = ['admin', 'supervisor', 'pharmacist'];

// คอลัมน์ของ Sheet ที่สร้างใหม่ (Table layer อ่าน/เขียนตามชื่อ header)
const SCHEMAS = {
  Reports: ['id', 'eventDate', 'shift', 'patientType', 'location', 'substation', 'process', 'errorDetail',
    'correctDrugCode', 'correctDrugName', 'incorrectDrugCode', 'incorrectDrugName', 'isHad', 'hadDrugCodes',
    'cause', 'details', 'reporterPsCode', 'reporterName', 'createdAt', 'submissionToken', 'source'],
  Activations: ['psCode', 'codeHash', 'expiresAt', 'createdBy', 'createdAt', 'usedAt'],
  Meta: ['key', 'value']
};

// คอลัมน์ที่ต้องเก็บเป็นข้อความเสมอ (กัน "010" → 10 และวันที่ถูกแปลงเป็น Date)
const TEXT_COLUMNS = {
  Reports: ['id', 'eventDate', 'correctDrugCode', 'incorrectDrugCode', 'hadDrugCodes', 'reporterPsCode', 'createdAt', 'submissionToken'],
  Activations: ['psCode', 'codeHash', 'expiresAt', 'createdAt', 'usedAt'],
  Meta: ['key', 'value']
};
