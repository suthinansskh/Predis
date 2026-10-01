// Export ข้อมูล / PDF / refresh charts
// โหลดเป็น classic script ตามลำดับใน JS_FILES (ดู sw.js / *.html)

// ===== Export Functions =====

/**
 * Export ตารางข้อมูลเป็นไฟล์ CSV
 */
function exportTableData() {
    try {
        // ดึงข้อมูลจากตาราง
        const rows = [];
        const headers = [];
        const table = document.querySelector('#errorData table, table');

        // รวบรวม headers จาก thead
        const ths = document.querySelectorAll('#errorTableBody');
        // ใช้ column names แบบตรงๆ
        rows.push(['Report ID', 'วันที่เกิด', 'เวร', 'ประเภท', 'สถานที่', 'กระบวนการ', 'ข้อผิดพลาด', 'ผู้รายงาน']);

        const trs = document.querySelectorAll('#errorTableBody tr');
        trs.forEach(tr => {
            const tds = tr.querySelectorAll('td');
            if (tds.length >= 8) {
                const row = [];
                for (let i = 0; i < 8; i++) {
                    let text = (tds[i]?.textContent || '').trim().replace(/,/g, '\uFF0C');
                    row.push(`"${text}"`);
                }
                rows.push(row);
            }
        });

        if (rows.length <= 1) {
            showNotification('ไม่มีข้อมูลในตารางให้ Export', 'warning');
            return;
        }

        // สร้าง CSV content (UTF-8 BOM สำหรับ Excel)
        const BOM = '\uFEFF';
        const csvContent = BOM + rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const link = document.createElement('a');
        link.href = url;
        link.download = `predispensing_errors_${dateStr}.csv`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showNotification(`✅ Export สำเร็จ: ${rows.length - 1} รายการ`, 'success');
    } catch (err) {
        showNotification('Export ไม่สำเร็จ: ' + err.message, 'error');
    }
}

/**
 * Export สรุป Analytics เป็น CSV
 */
function exportAnalytics() {
    try {
        const rows = [];
        const now = new Date();
        const dateStr = now.toLocaleDateString('th-TH');

        rows.push(['=== รายงานสรุปสถิติ Predispensing Error ===']);
        rows.push([`วันที่สร้างรายงาน: ${dateStr}`]);
        rows.push([]);

        // กระบวนการ
        rows.push(['กระบวนการ', 'จำนวน']);
        Object.entries(analyticsData.processData)
            .sort((a, b) => b[1] - a[1])
            .forEach(([k, v]) => rows.push([`"${k}"`, v]));
        rows.push([]);

        // สาเหตุ
        rows.push(['สาเหตุ', 'จำนวน']);
        Object.entries(analyticsData.causeData)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .forEach(([k, v]) => rows.push([`"${k}"`, v]));
        rows.push([]);

        // สถานที่
        rows.push(['สถานที่', 'จำนวน']);
        Object.entries(analyticsData.locationData)
            .sort((a, b) => b[1] - a[1])
            .forEach(([k, v]) => rows.push([`"${k}"`, v]));
        rows.push([]);

        // เวร
        rows.push(['เวร', 'จำนวน']);
        rows.push(['เช้า', analyticsData.timeData.morning]);
        rows.push(['บ่าย', analyticsData.timeData.afternoon]);
        rows.push(['ดึก', analyticsData.timeData.night]);

        const BOM = '\uFEFF';
        const csvContent = BOM + rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `analytics_summary_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}.csv`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showNotification('✅ Export Analytics สำเร็จ', 'success');
    } catch (err) {
        showNotification('Export ไม่สำเร็จ: ' + err.message, 'error');
    }
}

/**
 * Export Dashboard เป็น PDF ผ่าน window.print()
 */
function exportDashboardPDF() {
    // Temporarily show only the dashboard for printing
    const dashboard = document.getElementById('dashboard');
    if (!dashboard) return;

    document.body.classList.add('print-mode');
    window.print();
    document.body.classList.remove('print-mode');
}

/**
 * Refresh chart ตาม chartType ที่ระบุ
 */
function refreshChart(chartType) {
    switch (chartType) {
        case 'process': generateProcessChart(); break;
        case 'cause': generateCauseChart(); break;
        case 'trend': generateMonthlyTrendChart(); break;
        case 'drug': generateDrugChartByProcess(); break;
        default: refreshAdvancedAnalytics();
    }
    showNotification(`รีเฟรชกราฟ ${chartType || 'ทั้งหมด'} เรียบร้อย`, 'success');
}

/**
 * อัปเดต Trend Chart ตาม period ที่เลือก
 */
function updateTrendChart() {
    const periodEl = document.getElementById('trendPeriod');
    if (!periodEl) return;
    const months = parseInt(periodEl.value) || 12;

    // กรอง monthlyTrend ตามช่วงเวลาที่เลือก
    const allTrend = analyticsData.monthlyTrend || [];
    if (allTrend.length === 0) {
        showNotification('ยังไม่มีข้อมูล Trend', 'warning');
        return;
    }

    // Rebuild trend chart with filtered data
    const filtered = allTrend.slice(-months);
    const filteredMonths = filtered.map(t => t.month);
    const filteredCounts = filtered.map(t => t.count);

    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (trendChartInstance) {
        trendChartInstance.destroy();
        trendChartInstance = null;
    }

    if (filteredMonths.length === 0) {
        drawNoDataMessage(ctx, canvas, 'ไม่มีข้อมูลในช่วงเวลานี้');
        return;
    }

    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: filteredMonths,
            datasets: [{
                label: `แนวโน้ม ${months} เดือนล่าสุด`,
                data: filteredCounts,
                borderColor: '#2563EB',
                backgroundColor: 'rgba(37,99,235,0.08)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#2563EB',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } }
            }
        }
    });

    updateTrendInsights(filteredMonths, filteredCounts);
    showNotification(`✅ อัปเดต Trend ${months} เดือนล่าสุดแล้ว`, 'success');
}
