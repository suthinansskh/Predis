// แดชบอร์ดเหตุการณ์ยา High Alert (HAD) — ใช้สถิติที่คำนวณฝั่ง server (reports.stats / reports.list hadOnly)
// โหลดเป็น classic script ตามลำดับใน JS_FILES (ดู sw.js / *.html)

const HAD_PAGE_SIZE = 20;
const hadCharts = {};
const hadState = { period: '12m', from: '', to: '', process: 'all', patientType: 'all', page: 1 };

function bangkokToday() {
    const now = new Date(Date.now() + 7 * 3600 * 1000);
    return now.toISOString().slice(0, 10);
}

function shiftDate(dateText, days) {
    const d = new Date(dateText + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** ช่วงวันที่ของตัวเลือกช่วงเวลา → {from, to} (yyyy-MM-dd, เวลาไทย) */
function hadPeriodRange(period) {
    const today = bangkokToday();
    const year = parseInt(today.slice(0, 4), 10);
    const month = parseInt(today.slice(5, 7), 10);
    switch (period) {
        case 'month': return { from: today.slice(0, 7) + '-01', to: today };
        case '30d': return { from: shiftDate(today, -29), to: today };
        case '90d': return { from: shiftDate(today, -89), to: today };
        case '12m': {
            // 12 เดือนรวมเดือนนี้ (ตรงกับกราฟแนวโน้ม): วันที่ 1 ของเดือนเดียวกันเมื่อ 11 เดือนก่อน
            const start = new Date(Date.UTC(year, month - 1 - 11, 1));
            return { from: start.toISOString().slice(0, 10), to: today };
        }
        case 'fiscal': return { from: (month >= 10 ? year : year - 1) + '-10-01', to: today };
        case 'lastFiscal': {
            const start = (month >= 10 ? year : year - 1) - 1;
            return { from: start + '-10-01', to: (start + 1) + '-09-30' };
        }
        case 'custom': return { from: hadState.from, to: hadState.to };
        default: return { from: '', to: '' };
    }
}

function hadFilterPayload() {
    const range = hadPeriodRange(hadState.period);
    return { ...range, process: hadState.process, patientType: hadState.patientType, hadOnly: true };
}

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function thaiMonthLabel(yyyyMm) {
    const [y, m] = yyyyMm.split('-').map(Number);
    return `${THAI_MONTHS[m - 1]} ${String((y + 543) % 100).padStart(2, '0')}`;
}

function formatThaiDate(dateText) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText || '')) return dateText || '-';
    const [y, m, d] = dateText.split('-').map(Number);
    return `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
}

function percent(part, whole) {
    return whole ? (part / whole * 100) : 0;
}

// ===== Rendering =====

function renderHadTiles(stats) {
    const comparison = stats.comparison || { allInRange: 0 };
    const rate = percent(stats.totals.all, comparison.allInRange);
    const tiles = [
        ['fa-exclamation-triangle', 'เหตุการณ์ HAD (ช่วงที่เลือก)', stats.totals.all, 'danger'],
        ['fa-percentage', 'สัดส่วนของเหตุการณ์ทั้งหมด', `${rate.toFixed(1)}%`, 'warning', `${stats.totals.all} จาก ${comparison.allInRange}`],
        ['fa-calendar-alt', 'เดือนนี้', stats.totals.month, 'info'],
        ['fa-calendar-week', '7 วันล่าสุด', stats.totals.last7, 'info'],
        ['fa-pills', 'รายการยา HAD ที่เกี่ยวข้อง', stats.topHadDrugs.length, 'primary']
    ];
    document.getElementById('hadTiles').innerHTML = tiles.map(([icon, label, value, tone, sub]) => `
        <div class="stat-card ${tone}">
            <div class="stat-icon"><i class="fas ${icon}" aria-hidden="true"></i></div>
            <div class="stat-content">
                <h3>${escapeHtml(label)}</h3>
                <div class="stat-number">${escapeHtml(String(value))}</div>
                ${sub ? `<div class="stat-description">${escapeHtml(sub)}</div>` : ''}
            </div>
        </div>`).join('');
}

function cssColor(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
}

function renderHadChart(id, config) {
    if (typeof Chart === 'undefined') return;
    if (hadCharts[id]) hadCharts[id].destroy();
    const canvas = document.getElementById(id);
    if (!canvas) return;
    hadCharts[id] = new Chart(canvas, config);
}

function renderHadTrend(stats) {
    const months = stats.monthly.map(m => thaiMonthLabel(m.month));
    const all = (stats.comparison && stats.comparison.monthlyAll) || [];
    const rates = stats.monthly.map((m, i) => +percent(m.count, all[i] ? all[i].count : 0).toFixed(1));
    renderHadChart('hadTrendChart', {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                { type: 'bar', label: 'เหตุการณ์ HAD', data: stats.monthly.map(m => m.count), backgroundColor: cssColor('--color-danger', '#EF4444'), yAxisID: 'y' },
                { type: 'line', label: '% ของเหตุการณ์ทั้งหมด', data: rates, borderColor: cssColor('--color-warning', '#F59E0B'),
                    backgroundColor: cssColor('--color-warning', '#F59E0B'), tension: 0.3, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'จำนวน' } },
                y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%' } }
            }
        }
    });
}

function renderHadDrugChart(stats) {
    const top = stats.topHadDrugs.slice(0, 10);
    const empty = document.getElementById('hadDrugEmpty');
    if (empty) empty.hidden = top.length > 0;
    renderHadChart('hadDrugChart', {
        type: 'bar',
        data: {
            labels: top.map(d => d.label.length > 32 ? d.label.slice(0, 31) + '…' : d.label),
            datasets: [{ label: 'จำนวนเหตุการณ์', data: top.map(d => d.count), backgroundColor: cssColor('--color-danger', '#EF4444') }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => top[items[0].dataIndex].label } } },
            scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });
}

// รายการแบบแท่งสำหรับการกระจายตาม กระบวนการ/ข้อผิดพลาด/สาเหตุ/เวร/สถานที่
function renderBarList(elementId, entries, total) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (!entries.length) {
        el.innerHTML = '<p class="text-center text-muted">ไม่มีข้อมูล</p>';
        return;
    }
    el.innerHTML = `<ul class="bar-list">${entries.slice(0, 8).map(e => {
        const pct = percent(e.count, total);
        return `<li>
            <div class="bar-list-row"><span>${escapeHtml(e.label)}</span><span>${e.count} <small>(${pct.toFixed(0)}%)</small></span></div>
            <div class="bar-list-track"><div class="bar-list-fill" style="width:${Math.max(pct, 2).toFixed(1)}%"></div></div>
        </li>`;
    }).join('')}</ul>`;
}

function renderHadBreakdowns(stats) {
    const total = stats.totals.all;
    renderBarList('hadByProcess', stats.byProcess, total);
    renderBarList('hadByErrorDetail', stats.byErrorDetail, total);
    renderBarList('hadByCause', stats.byCause, total);
    renderBarList('hadByShift', stats.byShift, total);
    renderBarList('hadByLocation', stats.byLocation, total);
}

function drugCell(code, name, hadCodes) {
    if (!name && !code) return '-';
    const isHad = code && hadCodes.includes(code);
    return `${isHad ? '<span class="tag tag-danger">HAD</span> ' : ''}${escapeHtml(name || code)}${code && name ? ` <small>(${escapeHtml(code)})</small>` : ''}`;
}

async function loadHadEvents(page = 1) {
    hadState.page = page;
    const tbody = document.getElementById('hadEventsBody');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</td></tr>';
    try {
        const result = await apiV2('reports.list', { ...hadFilterPayload(), page, pageSize: HAD_PAGE_SIZE });
        if (!result.items.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">ไม่พบเหตุการณ์ HAD ในช่วงที่เลือก</td></tr>';
        } else {
            tbody.innerHTML = result.items.map(r => {
                const had = String(r.hadDrugCodes || '').split(',').filter(Boolean);
                return `<tr>
                    <td>${escapeHtml(formatThaiDate(r.eventDate))}<br><small>${escapeHtml(r.shift || '')}</small></td>
                    <td>${escapeHtml(r.id)}</td>
                    <td>${escapeHtml(r.process)}</td>
                    <td>${escapeHtml(r.errorDetail)}</td>
                    <td>${drugCell(r.correctDrugCode, r.correctDrugName, had)}</td>
                    <td>${drugCell(r.incorrectDrugCode, r.incorrectDrugName, had)}</td>
                    <td>${escapeHtml(r.cause)}</td>
                    <td>${escapeHtml(r.reporterName || '-')}</td>
                </tr>`;
            }).join('');
        }
        const pages = Math.max(1, Math.ceil(result.total / HAD_PAGE_SIZE));
        document.getElementById('hadEventsInfo').textContent = `ทั้งหมด ${result.total} รายการ · หน้า ${page}/${pages}`;
        document.getElementById('hadPrevPage').disabled = page <= 1;
        document.getElementById('hadNextPage').disabled = page >= pages;
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center">${escapeHtml(error.message)}</td></tr>`;
    }
}

async function loadHadDashboard() {
    const status = document.getElementById('hadStatus');
    status.textContent = 'กำลังคำนวณ...';
    document.getElementById('hadTiles').querySelectorAll('.stat-number').forEach(el => {
        el.innerHTML = '<div class="skeleton skeleton-number"></div>';
    });
    try {
        const stats = await apiV2('reports.stats', hadFilterPayload());
        renderHadTiles(stats);
        renderHadTrend(stats);
        renderHadDrugChart(stats);
        renderHadBreakdowns(stats);
        const range = hadPeriodRange(hadState.period);
        status.textContent = range.from
            ? `ช่วง ${formatThaiDate(range.from)} – ${formatThaiDate(range.to)} · อัปเดต ${new Date(stats.generatedAt).toLocaleTimeString('th-TH')}`
            : `ทุกช่วงเวลา · อัปเดต ${new Date(stats.generatedAt).toLocaleTimeString('th-TH')}`;
    } catch (error) {
        status.textContent = '';
        showNotification('โหลดสถิติ HAD ไม่สำเร็จ: ' + error.message, 'error');
    }
    loadHadEvents(1);
}

// ===== Export =====

function csvCell(value) {
    const s = String(value === undefined || value === null ? '' : value);
    // กันสูตรเมื่อเปิดใน Excel
    const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
    return `"${safe.replace(/"/g, '""')}"`;
}

async function exportHadCsv() {
    const btn = document.getElementById('hadExportBtn');
    btn.disabled = true;
    try {
        const rows = [];
        for (let page = 1; page <= 50; page++) {
            const result = await apiV2('reports.list', { ...hadFilterPayload(), page, pageSize: 200 });
            rows.push(...result.items);
            if (rows.length >= result.total) break;
        }
        const header = ['วันที่เกิดเหตุ', 'เวร', 'Report ID', 'ประเภทผู้ป่วย', 'สถานที่', 'กระบวนการ', 'ข้อผิดพลาด',
            'รหัสยาที่ถูกต้อง', 'ยาที่ถูกต้อง', 'รหัสยาที่ผิด', 'ยาที่ผิด', 'ยา HAD', 'สาเหตุ', 'ผู้รายงาน'];
        const lines = [header.map(csvCell).join(',')].concat(rows.map(r => [
            r.eventDate, r.shift, r.id, r.patientType, r.substation || r.location, r.process, r.errorDetail,
            r.correctDrugCode, r.correctDrugName, r.incorrectDrugCode, r.incorrectDrugName, r.hadDrugCodes, r.cause, r.reporterName
        ].map(csvCell).join(',')));
        const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const range = hadPeriodRange(hadState.period);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `HAD-events_${range.from || 'all'}_${range.to || bangkokToday()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        showNotification(`ส่งออก ${rows.length} รายการแล้ว`, 'success');
    } catch (error) {
        showNotification('ส่งออกไม่สำเร็จ: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

// ===== Init =====

function initHadDashboard() {
    const periodEl = document.getElementById('hadPeriod');
    const customEl = document.getElementById('hadCustomRange');
    if (!periodEl || periodEl.dataset.ready) {
        if (periodEl) loadHadDashboard();
        return;
    }
    periodEl.dataset.ready = 'true';

    const today = bangkokToday();
    document.getElementById('hadFrom').max = today;
    document.getElementById('hadTo').max = today;

    periodEl.addEventListener('change', () => {
        hadState.period = periodEl.value;
        customEl.hidden = periodEl.value !== 'custom';
        if (periodEl.value !== 'custom') loadHadDashboard();
    });
    document.getElementById('hadApplyCustom').addEventListener('click', () => {
        hadState.from = document.getElementById('hadFrom').value;
        hadState.to = document.getElementById('hadTo').value || today;
        if (!hadState.from) {
            showNotification('กรุณาเลือกวันที่เริ่มต้น', 'warning');
            return;
        }
        loadHadDashboard();
    });
    document.getElementById('hadProcess').addEventListener('change', e => { hadState.process = e.target.value; loadHadDashboard(); });
    document.getElementById('hadPatientType').addEventListener('change', e => { hadState.patientType = e.target.value; loadHadDashboard(); });
    document.getElementById('hadRefreshBtn').addEventListener('click', loadHadDashboard);
    document.getElementById('hadExportBtn').addEventListener('click', exportHadCsv);
    document.getElementById('hadPrevPage').addEventListener('click', () => loadHadEvents(hadState.page - 1));
    document.getElementById('hadNextPage').addEventListener('click', () => loadHadEvents(hadState.page + 1));

    loadHadDashboard();
}
