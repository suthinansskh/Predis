// ลงทะเบียน Chart.js เฉพาะเมื่อหน้าที่มีกราฟถูกโหลด (หน้าบันทึกรายงานไม่ต้องโหลด)
import { Chart, BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);
