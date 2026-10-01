// Dashboard: โหลดข้อมูล, filter, สรุป, รายงานรายเดือน, ตาราง
// โหลดเป็น classic script ตามลำดับใน JS_FILES (ดู sw.js / *.html)

// Pagination state
let currentTablePage = 1;
let cachedValidRows = [];

async function readFromGoogleSheet() {
    const result = await apiPost('getErrors');
    return result.data || [];
}

// ข้อมูลรายงานล่าสุดจาก server (ไม่รวม header) — filter ใช้ข้อมูลนี้โดยไม่ต้องดึงใหม่
let dashboardRows = null;

function isHeaderRow(row) {
    if (!Array.isArray(row)) return false;
    return String(row[1] || '').trim().toLowerCase() === 'reportid' ||
        /timestamp|วันที่|date/i.test(String(row[0] || ''));
}

// คำนวณและแสดงผล dashboard ใหม่จากข้อมูลที่ cache ไว้ (เช่น เมื่อเปลี่ยนธีม — กราฟต้องวาดใหม่)
function renderDashboard() {
    if (!dashboardRows) return;
    const filteredData = applyUserFilter(dashboardRows);
    lastUserFilteredData = filteredData.slice();

    updateDashboard(dashboardRows, filteredData);
    currentTablePage = 1;
    populateTable(filteredData);

    if (!window._analyticsFilterUIInitialized) {
        initAnalyticsFilterUI();
        window._analyticsFilterUIInitialized = true;
    }
    refreshAdvancedAnalytics();
}


// Dashboard functions — ดึงข้อมูลจาก server (ปุ่มรีเฟรช / เปิดหน้า)
async function loadData() {
    try {
        const loadBtn = document.querySelector('.load-btn');
        let originalText = '';
        if (loadBtn) {
            originalText = loadBtn.innerHTML;
            loadBtn.innerHTML = '<div class="loading"></div> Loading...';
            loadBtn.disabled = true;
        }

        // Show skeleton loading in stat cards
        document.querySelectorAll('#overviewStats .stat-number').forEach(el => {
            el.innerHTML = '<div class="skeleton skeleton-number"></div>';
        });
        const tableBody = document.getElementById('errorTableBody');
        if (tableBody) {
            tableBody.innerHTML = Array.from({length: 5}, () =>
                `<tr>${Array.from({length: 9}, () => '<td><div class="skeleton skeleton-text"></div></td>').join('')}</tr>`
            ).join('');
        }

        const data = await readFromGoogleSheet();

        if (data.length === 0) {
            showNotification('ไม่พบข้อมูลใน Google Sheets', 'info');
            return;
        }

        // Skip header row if it exists
        const errorData = isHeaderRow(data[0]) ? data.slice(1) : data;

        // เก็บ Report IDs ที่มีอยู่แล้วเพื่อป้องกันการซ้ำ
        loadExistingReportIds(data);

        dashboardRows = errorData;
        renderDashboard();

        showNotification(`โหลดข้อมูลแล้ว ${errorData.length} รายการ`, 'success');

    } catch (error) {
        console.error('Error loading data:', error);
        showNotification(error.message, 'error');
    } finally {
        const loadBtn = document.querySelector('.load-btn');
        if (loadBtn) {
            loadBtn.innerHTML = '<i class="fas fa-sync"></i> รีเฟรชข้อมูล';
            loadBtn.disabled = false;
        }
    }
}

// Load existing Report IDs to prevent duplicates
function loadExistingReportIds(data) {
    usedReportIds.clear(); // เคลียร์ก่อน

    if (Array.isArray(data) && data.length > 0) {
        data.forEach((row, index) => {
            // Skip header row
            if (index === 0 || !Array.isArray(row)) return;

            const reportId = row[1]; // คอลัมน์ B = Report ID
            if (reportId && typeof reportId === 'string') {
                usedReportIds.add(reportId);
            }
        });

        debugLog(`Loaded ${usedReportIds.size} existing Report IDs for duplicate prevention`);
    }
}

// Apply user-based filtering based on current user and filter settings
function applyUserFilter(data) {
    if (!currentUser || !data) return data;
    const filterUserEl = document.getElementById('filterUser');
    const filterPeriodEl = document.getElementById('filterPeriod');
    const filterUser = filterUserEl ? filterUserEl.value : '';
    const filterPeriod = filterPeriodEl ? filterPeriodEl.value : '';

    let filteredData = data;

    // Apply user filter
    if (filterUser === 'currentUser') {
        // Show only current user's reports
        filteredData = filteredData.filter(row => {
            const reporter = (row[11] || '').toString().trim(); // ผู้รายงาน in column 11
            return reporter === currentUser.name ||
                reporter.includes(currentUser.name) ||
                reporter === currentUser.psCode ||
                reporter === currentUser.id13;
        });
    } else if (filterUser === 'myGroup') {
        // Show only reports from user's group
        filteredData = filteredData.filter(row => {
            const reporter = (row[11] || '').toString().trim();
            // This would need a lookup to user database to check group
            // For now, assume reporter name contains group info or use a simplified approach
            return reporter.includes(currentUser.group) ||
                reporter === currentUser.name ||
                (currentUser.level === 'admin'); // Admin can see all
        });
    }

    // Apply period filter
    if (filterPeriod) {
        const now = new Date();
        let startDate;

        switch (filterPeriod) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'quarter':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
        }

        if (startDate) {
            filteredData = filteredData.filter(row => {
                try {
                    const rowDate = new Date(row[0]);
                    return !isNaN(rowDate.getTime()) && rowDate >= startDate;
                } catch (e) {
                    return false;
                }
            });
        }
    }

    return filteredData;
}

// ===== Analytics Filter State =====
let lastUserFilteredData = [];
let analyticsFilters = {
    errorType: 'all', // 'all' | 'ผู้ป่วยนอก' | 'ผู้ป่วยใน'
    periodMode: 'all', // 'all' | 'year' | 'month'
    year: null,
    month: null,
    process: 'all' // เพิ่มตัวแปรสำหรับกรองกระบวนการ
};

// ===== Process Filter State =====
let processFilter = 'all'; // Variable to store selected process filter
let errorProcessFilter = 'all'; // Variable to store selected process filter for error details
let drugProcessFilter = 'all'; // Variable to store selected process filter for drug statistics

function applyAnalyticsFiltersToData(baseData) {
    if (!Array.isArray(baseData)) return [];
    return baseData.filter(row => {
        try {
            // row indices: 0=date, 3=errorType
            if (!row[0]) return false;
            // Filter by error type
            if (analyticsFilters.errorType !== 'all') {
                const et = (row[3] || '').toString().trim();
                if (et !== analyticsFilters.errorType) return false;
            }
            // Filter by period
            if (analyticsFilters.periodMode !== 'all') {
                const d = new Date(row[0]);
                if (isNaN(d)) return false;
                const y = d.getFullYear();
                const m = (d.getMonth() + 1).toString().padStart(2, '0');
                if (analyticsFilters.periodMode === 'year') {
                    if (!analyticsFilters.year || y.toString() !== analyticsFilters.year.toString()) return false;
                } else if (analyticsFilters.periodMode === 'month') {
                    if (!analyticsFilters.year || !analyticsFilters.month) return false;
                    if (y.toString() !== analyticsFilters.year.toString() || m !== analyticsFilters.month) return false;
                }
            }
            return true;
        } catch { return false; }
    });
}

function refreshAdvancedAnalytics() {
    // หน้า myreport ไม่มีส่วนวิเคราะห์ขั้นสูง (ไม่โหลด analytics.js)
    if (typeof generateAdvancedAnalytics !== 'function') return;
    const filteredForAnalytics = applyAnalyticsFiltersToData(lastUserFilteredData);
    generateAdvancedAnalytics(filteredForAnalytics);
    updateAnalyticsFilterSummary();
}

function updateAnalyticsFilterSummary() {
    const el = document.getElementById('analyticsFilterSummary');
    if (!el) return;
    let parts = [];
    parts.push(analyticsFilters.errorType === 'all' ? 'ทุกประเภทผู้ป่วย' : analyticsFilters.errorType);
    parts.push(analyticsFilters.process === 'all' ? 'ทุกกระบวนการ' : analyticsFilters.process);
    if (analyticsFilters.periodMode === 'all') {
        parts.push('ทุกช่วงเวลา');
    } else if (analyticsFilters.periodMode === 'year') {
        parts.push('ปี ' + analyticsFilters.year);
    } else if (analyticsFilters.periodMode === 'month') {
        parts.push(`เดือน ${analyticsFilters.month}/${analyticsFilters.year}`);
    }
    el.textContent = 'ตัวกรอง: ' + parts.join(' | ');
}

function initAnalyticsFilterUI() {
    const etSel = document.getElementById('analyticsErrorType');
    const processSel = document.getElementById('analyticsProcessFilter');
    const modeSel = document.getElementById('analyticsPeriodMode');
    const yearSel = document.getElementById('analyticsYear');
    const monthSel = document.getElementById('analyticsMonth');
    const yearWrap = document.getElementById('analyticsYearWrapper');
    const monthWrap = document.getElementById('analyticsMonthWrapper');
    const applyBtn = document.getElementById('applyAnalyticsFilters');
    const resetBtn = document.getElementById('resetAnalyticsFilters');

    // Populate years from data (after data load we'll call populate)
    function populateYears() {
        if (!yearSel) return;
        const dates = (lastUserFilteredData || []).map(r => r[0]).filter(Boolean);
        const years = Array.from(new Set(dates.map(d => { const dd = new Date(d); if (!isNaN(dd)) return dd.getFullYear(); }).filter(Boolean))).sort();
        yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        if (!analyticsFilters.year && years.length > 0) analyticsFilters.year = years[years.length - 1];
        if (analyticsFilters.year) yearSel.value = analyticsFilters.year;
    }

    if (modeSel) {
        modeSel.addEventListener('change', () => {
            analyticsFilters.periodMode = modeSel.value;
            if (analyticsFilters.periodMode === 'year') {
                yearWrap.style.display = 'flex';
                monthWrap.style.display = 'none';
                populateYears();
            } else if (analyticsFilters.periodMode === 'month') {
                yearWrap.style.display = 'flex';
                monthWrap.style.display = 'flex';
                populateYears();
            } else {
                yearWrap.style.display = 'none';
                monthWrap.style.display = 'none';
            }
        });
    }
    if (etSel) etSel.addEventListener('change', () => { analyticsFilters.errorType = etSel.value; });
    if (processSel) processSel.addEventListener('change', () => {
        analyticsFilters.process = processSel.value;
        processFilter = processSel.value;  // Sync with global processFilter
        errorProcessFilter = processSel.value;  // Sync with error process filter
        drugProcessFilter = processSel.value;  // Sync with drug process filter
        // Update dropdowns in all cards as well
        const causeProcessFilter = document.getElementById('processFilter');
        const errorProcessFilterEl = document.getElementById('errorProcessFilter');
        const drugProcessFilterEl = document.getElementById('drugProcessFilter');
        if (causeProcessFilter) causeProcessFilter.value = processSel.value;
        if (errorProcessFilterEl) errorProcessFilterEl.value = processSel.value;
        if (drugProcessFilterEl) drugProcessFilterEl.value = processSel.value;
    });
    if (yearSel) yearSel.addEventListener('change', () => { analyticsFilters.year = yearSel.value; });
    if (monthSel) monthSel.addEventListener('change', () => { analyticsFilters.month = monthSel.value; });
    if (applyBtn) applyBtn.addEventListener('click', refreshAdvancedAnalytics);
    if (resetBtn) resetBtn.addEventListener('click', () => {
        analyticsFilters = { errorType: 'all', periodMode: 'all', year: null, month: null, process: 'all' };
        processFilter = 'all'; // Reset global processFilter
        errorProcessFilter = 'all'; // Reset error process filter
        drugProcessFilter = 'all'; // Reset drug process filter
        if (etSel) etSel.value = 'all';
        if (processSel) processSel.value = 'all';
        if (modeSel) modeSel.value = 'all';
        // Also reset the dropdowns in all cards
        const causeProcessFilter = document.getElementById('processFilter');
        const errorProcessFilterEl = document.getElementById('errorProcessFilter');
        const drugProcessFilterEl = document.getElementById('drugProcessFilter');
        if (causeProcessFilter) causeProcessFilter.value = 'all';
        if (errorProcessFilterEl) errorProcessFilterEl.value = 'all';
        if (drugProcessFilterEl) drugProcessFilterEl.value = 'all';
        yearWrap.style.display = 'none';
        monthWrap.style.display = 'none';
        refreshAdvancedAnalytics();
    });
    updateAnalyticsFilterSummary();
}

function updateDashboard(allData, filteredData) {
    debugLog('Updating dashboard with all data:', allData?.length, 'filtered:', filteredData?.length);

    if (!allData || allData.length === 0) {
        document.getElementById('totalErrors').textContent = '0';
        document.getElementById('myErrors').textContent = '0';
        document.getElementById('groupErrors').textContent = '0';
        document.getElementById('monthlyErrors').textContent = '0';
        document.getElementById('weeklyErrors').textContent = '0';
        return;
    }

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(thisYear, thisMonth, now.getDate());
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

    let totalCount = 0;
    let myCount = 0;
    let groupCount = 0;
    let monthlyCount = 0;
    let weeklyCount = 0;
    let todayCount = 0;
    let sevenDayCount = 0;
    let thisMonthTrend = 0;
    let lastMonthTrend = 0;

    // Process all data for total counts
    // ปีงบประมาณ (1 ต.ค. – 30 ก.ย.)
    const fiscalYearStart = new Date(now.getMonth() >= 9 ? thisYear : thisYear - 1, 9, 1);
    let fiscalYearCount = 0;

    // Process all data for total counts (allData ไม่มีแถว header แล้ว — ดู isHeaderRow)
    allData.forEach((row) => {
        if (!row[0] || !row[1]) return;

        try {
            const errorDate = new Date(row[0]);
            const reporter = (row[11] || '').toString().trim();

            if (!isNaN(errorDate.getTime())) {
                totalCount++;
                if (errorDate >= fiscalYearStart && errorDate <= now) fiscalYearCount++;

                // Count user's own reports
                if (currentUser && (
                    reporter === currentUser.name ||
                    reporter.includes(currentUser.name) ||
                    reporter === currentUser.psCode ||
                    reporter === currentUser.id13)) {
                    myCount++;
                }

                // Count group reports (simplified - could be enhanced with user database lookup)
                if (currentUser && (
                    reporter.includes(currentUser.group) ||
                    reporter === currentUser.name ||
                    currentUser.level === 'admin')) {
                    groupCount++;
                }

                const rowMonth = errorDate.getMonth();
                const rowYear = errorDate.getFullYear();

                // Monthly count
                if (rowMonth === thisMonth && rowYear === thisYear) {
                    monthlyCount++;
                    thisMonthTrend++;
                }

                // Last month count (for trend)
                if (rowMonth === lastMonth && rowYear === lastMonthYear) {
                    lastMonthTrend++;
                }

                // Weekly / 7-day count
                if (errorDate >= lastWeek) {
                    weeklyCount++;
                    sevenDayCount++;
                }

                // Today count
                if (errorDate >= todayStart) {
                    todayCount++;
                }
            }
        } catch (e) {
            console.warn('Error processing row:', e, row);
        }
    });

    // Apply filter-specific counts for monthly (use filtered data)
    if (filteredData && filteredData !== allData) {
        monthlyCount = 0;

        filteredData.forEach((row) => {
            if (!row[0] || !row[1]) return;

            try {
                const errorDate = new Date(row[0]);

                if (!isNaN(errorDate.getTime())) {
                    if (errorDate.getMonth() === thisMonth && errorDate.getFullYear() === thisYear) {
                        monthlyCount++;
                    }
                }
            } catch (e) {
                console.warn('Error processing filtered row:', e, row);
            }
        });
    }

    // Legacy IDs (keep if still present but new layout uses different IDs)
    const legacyTotal = document.getElementById('totalErrors');
    if (legacyTotal) legacyTotal.textContent = totalCount;

    var elAllTime = document.getElementById('totalAllTime'); if (elAllTime) elAllTime.textContent = totalCount;
    var elYear = document.getElementById('totalYear'); if (elYear) elYear.textContent = fiscalYearCount;
    var elMonth = document.getElementById('totalMonth'); if (elMonth) elMonth.textContent = monthlyCount;
    var elWeek = document.getElementById('totalWeek'); if (elWeek) elWeek.textContent = sevenDayCount;
    var elToday = document.getElementById('totalToday'); if (elToday) elToday.textContent = todayCount;

    // Per-user breakdown (Section 2)
    buildUserBreakdownTable(allData);

    // Monthly report by year (Section 2.5)
    buildMonthlyReportByYear(allData);

    // Trend indicator (using pre-computed counts from single pass)
    updateTrendIndicator(null, thisMonth, thisYear, thisMonthTrend, lastMonthTrend);
}

// Calculate trend indicator
function updateTrendIndicator(allData, thisMonth, thisYear, precomputedThis, precomputedLast) {
    const trendEl = document.getElementById('trendIndicator');
    if (!trendEl) return;

    try {
        let thisMonthCount, lastMonthCount;

        if (precomputedThis !== undefined && precomputedLast !== undefined) {
            // Use pre-computed counts (avoid extra iteration)
            thisMonthCount = precomputedThis;
            lastMonthCount = precomputedLast;
        } else {
            // Fallback: compute from data
            thisMonthCount = 0;
            lastMonthCount = 0;
            const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
            const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

            (allData || []).forEach(row => {
                if (!row[0] || !row[1]) return;
                try {
                    const errorDate = new Date(row[0]);
                    if (isNaN(errorDate.getTime())) return;
                    const month = errorDate.getMonth();
                    const year = errorDate.getFullYear();
                    if (month === thisMonth && year === thisYear) thisMonthCount++;
                    else if (month === lastMonth && year === lastMonthYear) lastMonthCount++;
                } catch (e) { }
            });
        }

        if (lastMonthCount === 0) {
            trendEl.textContent = thisMonthCount > 0 ? '↗ ใหม่' : '-';
            trendEl.style.color = thisMonthCount > 0 ? '#ffc107' : '#6c757d';
        } else {
            const percentChange = ((thisMonthCount - lastMonthCount) / lastMonthCount * 100);

            if (percentChange > 10) {
                trendEl.textContent = `↗ +${percentChange.toFixed(0)}%`;
                trendEl.style.color = '#dc3545';
            } else if (percentChange < -10) {
                trendEl.textContent = `↘ ${percentChange.toFixed(0)}%`;
                trendEl.style.color = '#28a745';
            } else {
                trendEl.textContent = '→ คงที่';
                trendEl.style.color = '#17a2b8';
            }
        }
    } catch (error) {
        console.error('Error calculating trend:', error);
        trendEl.textContent = '-';
        trendEl.style.color = '#6c757d';
    }
}

// Build per-user breakdown table: today / 7 days / month / all
function buildUserBreakdownTable(allData) {
    const tbody = document.getElementById('userBreakdownBody');
    if (!allData || allData.length === 0) {
        // Reset mini stats to 0 when no data
        ['userToday', 'userWeek', 'userMonth', 'userAll'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '0'; });
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">ไม่มีข้อมูล</td></tr>';
        return;
    }
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const userStats = {}; // reporter => {today, week, month, all}
    allData.forEach((row, idx) => {
        if (!row || !row[0] || !row[11]) return; // require date + reporter
        const reporter = row[11];
        if (!userStats[reporter]) userStats[reporter] = { today: 0, week: 0, month: 0, all: 0 };
        userStats[reporter].all++;
        let d;
        try { d = new Date(row[0]); } catch { return; }
        if (isNaN(d)) return;
        if (d >= lastWeek) userStats[reporter].week++;
        if (d.getFullYear() === thisYear && d.getMonth() === thisMonth) userStats[reporter].month++;
        if (d.getFullYear() === thisYear && d.getMonth() === thisMonth && d.getDate() === now.getDate()) userStats[reporter].today++;
    });

    // If currentUser defined, restrict to only that user's entries
    let entries = Object.entries(userStats);
    if (typeof currentUser === 'object' && currentUser) {
        const name = currentUser.name || '';
        const ps = currentUser.psCode || '';
        entries = entries.filter(([reporter]) => {
            const r = reporter.toLowerCase();
            return (name && r.includes(name.toLowerCase())) || (ps && r.includes(ps.toLowerCase()));
        });
    }
    const rows = entries
        .sort((a, b) => b[1].all - a[1].all)
        .map(([name, s]) => `<tr><td>${escapeHtml(name)}</td><td>${s.today}</td><td>${s.week}</td><td>${s.month}</td><td>${s.all}</td></tr>`)
        .join('');
    if (tbody) tbody.innerHTML = rows || '<tr><td colspan="5" style="text-align:center;">ไม่มีข้อมูล</td></tr>';

    // Update mini stats for current user if exactly one row (filtered) or find current user aggregate
    if (currentUser) {
        const target = entries.find(([name]) => name.toLowerCase().includes((currentUser.name || '').toLowerCase()) || name.includes(currentUser.psCode || ''));
        if (target) {
            const stats = target[1];
            const elToday = document.getElementById('userToday'); if (elToday) elToday.textContent = stats.today;
            const elWeek = document.getElementById('userWeek'); if (elWeek) elWeek.textContent = stats.week;
            const elMonth = document.getElementById('userMonth'); if (elMonth) elMonth.textContent = stats.month;
            const elAll = document.getElementById('userAll'); if (elAll) elAll.textContent = stats.all;
        }
    }
}

// ===== Monthly Report by Year (Section 2.5) =====
let monthlyReportChart = null;
let monthlyReportAllData = [];

function buildMonthlyReportByYear(dataArg) {
    // Store data for re-calls from dropdown change
    if (dataArg) monthlyReportAllData = dataArg;
    const allData = monthlyReportAllData;
    if (!allData || allData.length === 0) return;

    const yearSelect = document.getElementById('monthlyReportYear');
    const scopeSelect = document.getElementById('monthlyReportUserScope');
    const tbody = document.getElementById('monthlyReportBody');
    if (!yearSelect || !tbody) return;

    const showOnlyMe = scopeSelect ? scopeSelect.value === 'me' : true;

    // Filter data to current user if scope = me
    const filtered = allData.filter((row) => {
        if (!row[0] || !row[1]) return false;
        try {
            const d = new Date(row[0]);
            if (isNaN(d.getTime())) return false;
        } catch { return false; }
        if (showOnlyMe && currentUser) {
            const reporter = (row[11] || '').toString().trim();
            return reporter === currentUser.name ||
                reporter.includes(currentUser.name) ||
                reporter === currentUser.psCode ||
                reporter === currentUser.id13;
        }
        return true;
    });

    // Collect available years
    const yearSet = new Set();
    filtered.forEach(row => {
        try {
            const y = new Date(row[0]).getFullYear();
            if (!isNaN(y)) yearSet.add(y);
        } catch {}
    });
    const years = Array.from(yearSet).sort((a, b) => b - a);

    // Populate year dropdown (preserve selection)
    const prevYear = yearSelect.value;
    yearSelect.innerHTML = '';
    years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y + (y + 543 ? ' (' + (y + 543) + ')' : '');
        yearSelect.appendChild(opt);
    });
    if (years.length === 0) {
        yearSelect.innerHTML = '<option value="">ไม่มีข้อมูล</option>';
        tbody.innerHTML = '<tr><td colspan="14" class="text-center">ไม่มีข้อมูล</td></tr>';
        return;
    }
    // Restore previous selection if still valid
    if (prevYear && years.includes(parseInt(prevYear))) {
        yearSelect.value = prevYear;
    } else {
        yearSelect.value = years[0];
    }
    const selectedYear = parseInt(yearSelect.value);

    // Count per month for selected year
    const monthlyCounts = new Array(12).fill(0);
    filtered.forEach(row => {
        try {
            const d = new Date(row[0]);
            if (d.getFullYear() === selectedYear) {
                monthlyCounts[d.getMonth()]++;
            }
        } catch {}
    });

    const total = monthlyCounts.reduce((a, b) => a + b, 0);
    const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

    // Render table
    let rowHtml = '<tr><td><strong>จำนวน</strong></td>';
    monthlyCounts.forEach((count, i) => {
        rowHtml += `<td class="${count > 0 ? 'has-data' : ''}">${count}</td>`;
    });
    rowHtml += `<td><strong>${total}</strong></td></tr>`;
    tbody.innerHTML = rowHtml;

    // Render chart
    const ctx = document.getElementById('monthlyReportChart');
    if (!ctx) return;
    if (monthlyReportChart) monthlyReportChart.destroy();

    const userLabel = showOnlyMe && currentUser ? currentUser.name : 'ทั้งหมด';
    monthlyReportChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: thaiMonths,
            datasets: [{
                label: `จำนวนรายงาน (${userLabel}) ปี ${selectedYear + 543}`,
                data: monthlyCounts,
                backgroundColor: 'rgba(37, 99, 235, 0.7)',
                borderColor: 'rgba(37, 99, 235, 1)',
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    callbacks: {
                        title: (items) => thaiMonths[items[0].dataIndex] + ' ' + (selectedYear + 543),
                        label: (item) => `จำนวน: ${item.raw} รายงาน`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1, font: { family: 'Sarabun' } },
                    title: { display: true, text: 'จำนวนรายงาน', font: { family: 'Sarabun' } }
                },
                x: {
                    ticks: { font: { family: 'Sarabun' } }
                }
            }
        }
    });
}

// Helper function to format dates and handle invalid dates
function formatDate(dateString) {
    if (!dateString || dateString.trim() === '') {
        return { date: 'N/A', time: 'N/A' };
    }

    try {
        const date = new Date(dateString);

        // Check if date is valid
        if (isNaN(date.getTime())) {
            console.warn('Invalid date:', dateString);
            return { date: 'วันที่ไม่ถูกต้อง', time: 'N/A' };
        }

        const formattedDate = date.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        const formattedTime = date.toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        return { date: formattedDate, time: formattedTime };
    } catch (error) {
        console.error('Error formatting date:', error, dateString);
        return { date: 'วันที่ไม่ถูกต้อง', time: 'N/A' };
    }
}

function populateTable(data) {
    const tableBody = document.getElementById('errorTableBody');
    if (!tableBody) return; // Exit if not on the dashboard page

    if (!data || data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="no-data">
                    <div class="no-data-content">
                        <i class="fas fa-database"></i>
                        <p>ไม่มีข้อมูลที่ตรงกับตัวกรอง</p>
                        <small>ลองปรับเปลี่ยนตัวกรองหรือรีเฟรชข้อมูล</small>
                    </div>
                </td>
            </tr>
        `;
        updateTablePagination(0, 0, 0, 1, 1);
        return;
    }

    // Data is already filtered by applyUserFilter, so we just need to format it
    let workingData = data;

    // Skip header row if exists
    if (data.length > 0 && Array.isArray(data[0]) && data[0][0] &&
        (data[0][0].toString().toLowerCase().includes('timestamp') ||
            data[0][0].toString().toLowerCase().includes('วันที่'))) {
        workingData = data.slice(1);
    }

    if (workingData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="no-data">
                    <div class="no-data-content">
                        <i class="fas fa-database"></i>
                        <p>ไม่มีข้อมูลที่ตรงกับตัวกรอง</p>
                        <small>ลองปรับเปลี่ยนตัวกรองหรือรีเฟรชข้อมูล</small>
                    </div>
                </td>
            </tr>
        `;
        updateTablePagination(0, 0, 0, 1, 1);
        return;
    }

    // Get page size
    const pageSize = parseInt(document.getElementById('tablePageSize')?.value || '25');
    const validRows = workingData.filter(row => {
        // Filter out empty rows - check if row has timestamp and report ID
        return row && row[0] && row[1] &&
            row[0].toString().trim() !== '' &&
            row[1].toString().trim() !== '';
    });

    // Sort by date (column 0) descending (latest first)
    validRows.sort((a, b) => {
        try {
            const da = new Date(a[0]);
            const db = new Date(b[0]);
            if (isNaN(da) && isNaN(db)) return 0;
            if (isNaN(da)) return 1;
            if (isNaN(db)) return -1;
            return db - da; // newest first
        } catch { return 0; }
    });

    // Cache for pagination navigation
    cachedValidRows = validRows;

    // Calculate pagination
    const totalPages = Math.max(1, Math.ceil(validRows.length / pageSize));
    if (currentTablePage > totalPages) currentTablePage = totalPages;
    if (currentTablePage < 1) currentTablePage = 1;
    const startIdx = (currentTablePage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, validRows.length);

    const displayRows = validRows.slice(startIdx, endIdx).map(row => {
        // Validate and format data
        const reportId = row[1] || 'N/A';

        // Better date handling using formatDate function
        const { date: formattedDate } = formatDate(row[0]);
        const shift = row[2] || 'N/A'; // เวร
        const errorType = row[3] || 'N/A';
        const location = row[4] || 'N/A';
        const process = row[5] || 'N/A';
        const error = row[6] || 'N/A'; // ข้อผิดพลาด
        const reporter = row[11] || 'N/A'; // ผู้รายงาน in column 11

        // Highlight current user's reports
        const isMyReport = currentUser && (
            reporter === currentUser.name ||
            reporter.includes(currentUser.name) ||
            reporter === currentUser.psCode ||
            reporter === currentUser.id13
        );

        // Check for high priority errors (example criteria)
        const isHighPriority = error.includes('ยาผิด') || error.includes('ขนาดผิด') ||
            error.includes('คนไข้ผิด') || process.includes('จ่ายยา');

        let rowClass = '';
        if (isMyReport) rowClass += ' my-report';
        if (isHighPriority) rowClass += ' high-priority';

        return `
            <tr class="${rowClass}">
                <td>${escapeHtml(reportId)}</td>
                <td>${escapeHtml(formattedDate)}</td>
                <td>${escapeHtml(shift)}</td>
                <td>${escapeHtml(errorType)}</td>
                <td>${escapeHtml(location)}</td>
                <td>${escapeHtml(process)}</td>
                <td>${escapeHtml(error)}</td>
                <td>${escapeHtml(reporter)}</td>
                <td>
                    <button class="btn-view" onclick="viewErrorDetail('${escapeHtml(reportId)}')" title="ดูรายละเอียด">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tableBody.innerHTML = displayRows;

    // Update pagination info
    updateTablePagination(startIdx + 1, endIdx, validRows.length, currentTablePage, totalPages);

    // Initialize table features
    initializeTableFeatures();
}

// Update table pagination information
function updateTablePagination(start, end, total, page, totalPages) {
    const showingStart = document.getElementById('showingStart');
    const showingEnd = document.getElementById('showingEnd');
    const totalRecords = document.getElementById('totalRecords');

    if (showingStart) showingStart.textContent = total > 0 ? start : '0';
    if (showingEnd) showingEnd.textContent = end;
    if (totalRecords) totalRecords.textContent = total.toString();

    // Update page navigation buttons if they exist
    const prevBtn = document.getElementById('tablePrevPage');
    const nextBtn = document.getElementById('tableNextPage');
    const pageInfo = document.getElementById('tablePageInfo');

    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;
    if (pageInfo) pageInfo.textContent = `หน้า ${page} / ${totalPages}`;
}

// Pagination navigation functions
function tableNextPage() {
    currentTablePage++;
    populateTable(lastUserFilteredData);
}

function tablePrevPage() {
    currentTablePage = Math.max(1, currentTablePage - 1);
    populateTable(lastUserFilteredData);
}

function tablePageSizeChanged() {
    currentTablePage = 1;
    populateTable(lastUserFilteredData);
}

// Initialize table features (sorting, search, etc.)
function initializeTableFeatures() {
    // Add table sorting
    addTableSorting();

    // Add search functionality
    addTableSearch();
}

// Add table sorting functionality
function addTableSorting() {
    const table = document.getElementById('errorTable');
    if (!table) return;

    const headers = table.querySelectorAll('th.sortable');
    headers.forEach((header, index) => {
        // Prevent duplicate listeners
        if (header.dataset.sortListenerAdded) return;
        header.dataset.sortListenerAdded = 'true';

        header.addEventListener('click', () => {
            const currentSort = header.getAttribute('data-sort-direction') || 'asc';
            const newSort = currentSort === 'asc' ? 'desc' : 'asc';

            // Reset all other headers
            headers.forEach(h => {
                h.setAttribute('data-sort-direction', '');
                h.querySelector('i').className = 'fas fa-sort';
            });

            // Set current header
            header.setAttribute('data-sort-direction', newSort);
            const icon = header.querySelector('i');
            icon.className = newSort === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';

            sortTableByColumn(index, newSort === 'asc');
        });
    });
}

// Sort table by column
function sortTableByColumn(columnIndex, ascending = true) {
    const table = document.getElementById('errorTable');
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr')).filter(row =>
        !row.querySelector('.no-data-content')
    );

    rows.sort((a, b) => {
        const aCell = a.cells[columnIndex];
        const bCell = b.cells[columnIndex];
        const aText = aCell && aCell.textContent ? aCell.textContent.trim() : '';
        const bText = bCell && bCell.textContent ? bCell.textContent.trim() : '';

        // Try to parse as numbers or dates first
        const aNum = parseFloat(aText);
        const bNum = parseFloat(bText);

        if (!isNaN(aNum) && !isNaN(bNum)) {
            return ascending ? aNum - bNum : bNum - aNum;
        }

        // Try to parse as dates
        const aDate = new Date(aText);
        const bDate = new Date(bText);

        if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) {
            return ascending ? aDate - bDate : bDate - aDate;
        }

        // Default to string comparison
        return ascending ?
            aText.localeCompare(bText, 'th', { numeric: true }) :
            bText.localeCompare(aText, 'th', { numeric: true });
    });

    // Re-append sorted rows
    rows.forEach(row => tbody.appendChild(row));
}

// Add table search functionality
function addTableSearch() {
    const searchInput = document.getElementById('tableSearch');
    if (!searchInput) return;

    // Remove existing event listeners
    searchInput.replaceWith(searchInput.cloneNode(true));
    const newSearchInput = document.getElementById('tableSearch');

    newSearchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        filterTableRows(searchTerm);
    });
}

// Filter table rows based on search term
function filterTableRows(searchTerm) {
    const table = document.getElementById('errorTable');
    const tbody = table.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr');

    let visibleCount = 0;

    rows.forEach(row => {
        if (row.querySelector('.no-data-content')) {
            return; // Skip no-data rows
        }

        const rowText = Array.from(row.cells)
            .slice(0, 8) // Exclude action column
            .map(cell => cell.textContent.toLowerCase())
            .join(' ');

        const isVisible = searchTerm === '' || rowText.includes(searchTerm);
        row.style.display = isVisible ? '' : 'none';

        if (isVisible) visibleCount++;
    });

    // Update table statistics - filter adjusts visible rows without changing pagination
    const totalRecords = document.getElementById('totalRecords');
    const originalTotal = totalRecords ? parseInt(totalRecords.textContent) : 0;
    updateTablePagination(1, visibleCount, originalTotal, 1, 1);
}

// View error detail function
function viewErrorDetail(reportId) {
    showNotification(`กำลังโหลดรายละเอียดของรายงาน: ${reportId}`, 'info');

    // Future implementation: Open modal with detailed error information
    // For now, just show a notification
    setTimeout(() => {
        showNotification(`รายงาน ${reportId}: รายละเอียดจะแสดงในเวอร์ชันถัดไป`, 'info');
    }, 1000);
}

// Set current date as default in form
