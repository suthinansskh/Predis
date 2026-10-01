// กราฟและการวิเคราะห์ขั้นสูง
// โหลดเป็น classic script ตามลำดับใน JS_FILES (ดู sw.js / *.html)

// ===== ENHANCED ANALYTICS FUNCTIONS =====

// Global analytics data
let analyticsData = {
    processData: {},
    causeData: {},
    locationData: {},
    timeData: { morning: 0, afternoon: 0, night: 0 },
    monthlyTrend: [],
    insights: []
};

// Main analytics generation function
function generateAdvancedAnalytics(data) {
    console.log('Generating advanced analytics for data:', data);

    if (!data || data.length === 0) {
        resetAllAnalytics();
        return;
    }

    // Filter out header row and empty rows
    const processedData = data.filter(row => {
        return row && row[0] && row[1] &&
            row[0].toString().trim() !== '' &&
            row[1].toString().trim() !== '' &&
            !row[0].toString().toLowerCase().includes('timestamp');
    });

    if (processedData.length === 0) {
        resetAllAnalytics();
        return;
    }

    // Process data for analytics
    processAnalyticsData(processedData);

    // Pre-compute analytics-filtered data once for all charts
    const analyticsFilteredData = applyAnalyticsFiltersToData(lastUserFilteredData || []);

    // Generate charts (pass pre-filtered data to avoid re-filtering)
    generateProcessChart();
    generateErrorChartByProcess(analyticsFilteredData);
    generateCauseChartByProcess(analyticsFilteredData);
    generateDrugChartByProcess(analyticsFilteredData);
    updateLocationRanking();
    updateTimeDistribution();
    generateMonthlyTrendChart();

    console.log('Analytics generation completed');
}

// Process data for analytics
function processAnalyticsData(data) {
    // Reset analytics data
    analyticsData = {
        processData: {},
        causeData: {},
        locationData: {},
        timeData: { morning: 0, afternoon: 0, night: 0 },
        monthlyTrend: [],
        insights: []
    };

    const monthlyCount = {};

    data.forEach(row => {
        if (!row || !row[0]) return;

        try {
            // Process distribution
            const process = (row[5] || 'ไม่ระบุ').toString().trim();
            analyticsData.processData[process] = (analyticsData.processData[process] || 0) + 1;

            // Cause distribution
            const cause = (row[7] || 'ไม่ระบุ').toString().trim();
            analyticsData.causeData[cause] = (analyticsData.causeData[cause] || 0) + 1;

            // Location distribution
            const location = (row[4] || 'ไม่ระบุ').toString().trim();
            analyticsData.locationData[location] = (analyticsData.locationData[location] || 0) + 1;

            // Time distribution - ใช้ข้อมูลจากคอลัมน์เวรโดยตรง
            const shift = (row[2] || '').toString().trim(); // คอลัมน์ C (index 2) ตามรูปภาพ Google Sheets
            if (shift) {
                if (shift === 'เช้า') {
                    analyticsData.timeData.morning++;
                } else if (shift === 'บ่าย') {
                    analyticsData.timeData.afternoon++;
                } else if (shift === 'ดึก') {
                    analyticsData.timeData.night++;
                }
            }

            // Monthly trend - ใช้วันที่เกิดเหตุการณ์
            const eventDateStr = (row[0] || '').toString().trim();
            if (eventDateStr) {
                const eventDate = new Date(eventDateStr);
                if (!isNaN(eventDate.getTime())) {
                    const monthKey = `${eventDate.getFullYear()}-${(eventDate.getMonth() + 1).toString().padStart(2, '0')}`;
                    monthlyCount[monthKey] = (monthlyCount[monthKey] || 0) + 1;
                }
            }
        } catch (e) {
            console.warn('Error processing row for analytics:', e, row);
        }
    });

    // Convert monthly data to array
    analyticsData.monthlyTrend = Object.entries(monthlyCount)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12); // Last 12 months
}

// Generate process distribution pie chart
function generateProcessChart() {
    // Use Chart.js to render a horizontal bar chart for process distribution
    const canvas = document.getElementById('processChart');
    if (!canvas) return;

    const dataObj = analyticsData.processData || {};
    const labels = Object.keys(dataObj).sort((a, b) => dataObj[b] - dataObj[a]);
    const data = labels.map(l => dataObj[l]);

    // Update summary
    if (labels.length > 0) {
        const topProcess = labels[0];
        const topProcessCount = data[0];
        document.getElementById('topProcess').textContent = topProcess || '-';
        document.getElementById('topProcessCount').textContent = topProcessCount || '0';
    } else {
        document.getElementById('topProcess').textContent = '-';
        document.getElementById('topProcessCount').textContent = '0';
    }

    // Destroy previous instance
    if (processChartInstance) {
        try { processChartInstance.destroy(); } catch (e) { /* ignore */ }
        processChartInstance = null;
    }

    // Colors
    const palette = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#E91E63', '#795548'];
    const backgroundColors = labels.map((_, i) => palette[i % palette.length]);

    processChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'จำนวน',
                data: data,
                backgroundColor: backgroundColors,
                borderRadius: 8,
                barThickness: 18
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.formattedValue} รายการ`
                    }
                }
            },
            scales: {
                x: { beginAtZero: true, ticks: { precision: 0 } },
                y: { ticks: { autoSkip: false } }
            }
        }
    });
}

// Generate cause distribution bar chart
function generateCauseChart() {
    const canvas = document.getElementById('causeChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const causes = Object.keys(analyticsData.causeData);
    const counts = Object.values(analyticsData.causeData);

    if (causes.length === 0) {
        drawNoDataMessage(ctx, canvas, 'ไม่มีข้อมูลสาเหตุ');
        return;
    }

    // Sort and get top 8 causes
    const sortedData = causes.map((cause, index) => ({
        cause,
        count: counts[index]
    })).sort((a, b) => b.count - a.count).slice(0, 8);

    const topCause = sortedData[0]?.cause || '-';
    document.getElementById('topCause').textContent = topCause;

    const maxCount = Math.max(...sortedData.map(item => item.count));
    const barWidth = (canvas.width - 100) / sortedData.length;
    const maxBarHeight = canvas.height - 100;

    sortedData.forEach((item, index) => {
        const barHeight = (item.count / maxCount) * maxBarHeight;
        const x = 50 + (index * barWidth);
        const y = canvas.height - 50 - barHeight;

        // Create gradient
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, '#36A2EB');
        gradient.addColorStop(1, '#1E88E5');

        // Draw bar
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth - 15, barHeight);

        // Draw count on top of bar
        ctx.fillStyle = '#333';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(item.count, x + (barWidth - 15) / 2, y - 5);

        // Draw cause label (rotated)
        ctx.save();
        ctx.translate(x + (barWidth - 15) / 2, canvas.height - 25);
        ctx.rotate(-Math.PI / 6);
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        const labelText = item.cause.length > 10 ? item.cause.substring(0, 10) + '...' : item.cause;
        ctx.fillText(labelText, 0, 0);
        ctx.restore();
    });

    // Draw axes
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(50, 50);
    ctx.lineTo(50, canvas.height - 50);
    ctx.lineTo(canvas.width - 50, canvas.height - 50);
    ctx.stroke();
}

// Filter cause chart by selected process
function filterCauseByProcess() {
    const processSelect = document.getElementById('processFilter');
    if (!processSelect) return;

    processFilter = processSelect.value;
    analyticsFilters.process = processSelect.value; // Sync with analytics filters
    errorProcessFilter = processSelect.value; // Sync with error process filter
    drugProcessFilter = processSelect.value; // Sync with drug process filter

    // Update other dropdowns
    const analyticsProcessSelect = document.getElementById('analyticsProcessFilter');
    const errorProcessFilterEl = document.getElementById('errorProcessFilter');
    const drugProcessFilterEl = document.getElementById('drugProcessFilter');
    if (analyticsProcessSelect) analyticsProcessSelect.value = processFilter;
    if (errorProcessFilterEl) errorProcessFilterEl.value = processFilter;
    if (drugProcessFilterEl) drugProcessFilterEl.value = processFilter;

    // Update UI to show selected process
    const selectedProcessEl = document.getElementById('selectedProcess');
    const selectedErrorProcessEl = document.getElementById('selectedErrorProcess');
    const selectedDrugProcessEl = document.getElementById('selectedDrugProcess');
    if (selectedProcessEl) {
        selectedProcessEl.textContent = processFilter === 'all' ? 'ทุกกระบวนการ' : processFilter;
    }
    if (selectedErrorProcessEl) {
        selectedErrorProcessEl.textContent = processFilter === 'all' ? 'ทุกกระบวนการ' : processFilter;
    }
    if (selectedDrugProcessEl) {
        selectedDrugProcessEl.textContent = processFilter === 'all' ? 'ทุกกระบวนการ' : processFilter;
    }

    // Update analytics filter summary
    updateAnalyticsFilterSummary();

    // Pre-compute filtered data once for all charts
    const preFiltered = applyAnalyticsFiltersToData(lastUserFilteredData || []);

    // Regenerate all charts with process filter
    generateCauseChartByProcess(preFiltered);
    generateErrorChartByProcess(preFiltered);
    generateDrugChartByProcess(preFiltered);
}

// Generate cause chart filtered by process and show top 5
function generateCauseChartByProcess(preFilteredData) {
    // Render top 5 causes using Chart.js
    const canvas = document.getElementById('causeChart');
    if (!canvas) return;

    let filteredData = preFilteredData || applyAnalyticsFiltersToData(lastUserFilteredData || []);
    if (processFilter !== 'all') {
        filteredData = filteredData.filter(row => ((row[5] || '').toString().trim()) === processFilter);
    }

    const causeCounts = {};
    filteredData.forEach(row => {
        const cause = (row[9] || '').toString().trim();
        if (cause) causeCounts[cause] = (causeCounts[cause] || 0) + 1;
    });

    const sorted = Object.entries(causeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const labels = sorted.map(s => s[0]);
    const data = sorted.map(s => s[1]);

    const topCauseEl = document.getElementById('topCause');
    const causeItemCountEl = document.getElementById('causeItemCount');
    if (topCauseEl) topCauseEl.textContent = labels[0] || '-';
    if (causeItemCountEl) causeItemCountEl.textContent = data.reduce((a, b) => a + b, 0) || '0';

    if (causeChartInstance) { try { causeChartInstance.destroy(); } catch (e) { } causeChartInstance = null; }

    const palette = ['#FF6B6B', '#FF9F43', '#26D0CE', '#74C0FC', '#9C27B0'];

    causeChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ data: data, backgroundColor: palette.slice(0, labels.length), borderRadius: 8 }]
        },
        options: {
            indexAxis: 'y',
            responsive: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) { return context.formattedValue + ' รายการ'; }
                    }
                }
            },
            scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { ticks: { autoSkip: false } } }
        }
    });
}

// Filter error chart by selected process
function filterErrorByProcess() {
    const errorProcessSelect = document.getElementById('errorProcessFilter');
    if (!errorProcessSelect) return;

    errorProcessFilter = errorProcessSelect.value;
    analyticsFilters.process = errorProcessSelect.value; // Sync with analytics filters
    processFilter = errorProcessSelect.value; // Sync with cause process filter
    drugProcessFilter = errorProcessSelect.value; // Sync with drug process filter

    // Update other dropdowns
    const analyticsProcessSelect = document.getElementById('analyticsProcessFilter');
    const causeProcessFilter = document.getElementById('processFilter');
    const drugProcessFilterEl = document.getElementById('drugProcessFilter');
    if (analyticsProcessSelect) analyticsProcessSelect.value = errorProcessFilter;
    if (causeProcessFilter) causeProcessFilter.value = errorProcessFilter;
    if (drugProcessFilterEl) drugProcessFilterEl.value = errorProcessFilter;

    // Update UI to show selected process
    const selectedErrorProcessEl = document.getElementById('selectedErrorProcess');
    const selectedProcessEl = document.getElementById('selectedProcess');
    const selectedDrugProcessEl = document.getElementById('selectedDrugProcess');
    if (selectedErrorProcessEl) {
        selectedErrorProcessEl.textContent = errorProcessFilter === 'all' ? 'ทุกกระบวนการ' : errorProcessFilter;
    }
    if (selectedProcessEl) {
        selectedProcessEl.textContent = errorProcessFilter === 'all' ? 'ทุกกระบวนการ' : errorProcessFilter;
    }
    if (selectedDrugProcessEl) {
        selectedDrugProcessEl.textContent = errorProcessFilter === 'all' ? 'ทุกกระบวนการ' : errorProcessFilter;
    }

    // Update analytics filter summary
    updateAnalyticsFilterSummary();

    // Pre-compute filtered data once for all charts
    const preFiltered = applyAnalyticsFiltersToData(lastUserFilteredData || []);

    // Regenerate all charts with process filter
    generateErrorChartByProcess(preFiltered);
    generateCauseChartByProcess(preFiltered);
    generateDrugChartByProcess(preFiltered);
}

// Generate error chart filtered by process and show top 5
function generateErrorChartByProcess(preFilteredData) {
    // Render top 5 errors using Chart.js
    const canvas = document.getElementById('errorChart');
    if (!canvas) return;

    let filteredData = preFilteredData || applyAnalyticsFiltersToData(lastUserFilteredData || []);
    if (errorProcessFilter !== 'all') {
        filteredData = filteredData.filter(row => ((row[5] || '').toString().trim()) === errorProcessFilter);
    }

    const errorCounts = {};
    filteredData.forEach(row => {
        const err = (row[6] || '').toString().trim();
        if (err) errorCounts[err] = (errorCounts[err] || 0) + 1;
    });

    const sorted = Object.entries(errorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const labels = sorted.map(s => s[0]);
    const data = sorted.map(s => s[1]);

    const topErrorEl = document.getElementById('topError');
    const errorItemCountEl = document.getElementById('errorItemCount');
    if (topErrorEl) topErrorEl.textContent = labels[0] || '-';
    if (errorItemCountEl) errorItemCountEl.textContent = data.reduce((a, b) => a + b, 0) || '0';

    if (errorChartInstance) { try { errorChartInstance.destroy(); } catch (e) { } errorChartInstance = null; }

    const palette = ['#FF9800', '#2196F3', '#4CAF50', '#9C27B0', '#607D8B'];
    errorChartInstance = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets: [{ data, backgroundColor: palette.slice(0, labels.length), borderRadius: 8 }] },
        options: {
            indexAxis: 'y',
            responsive: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: function (context) { return context.formattedValue + ' รายการ'; } } }
            },
            scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { ticks: { autoSkip: false } } }
        }
    });
}

// Filter drug chart by selected process
function filterDrugByProcess() {
    const drugProcessSelect = document.getElementById('drugProcessFilter');
    if (!drugProcessSelect) return;

    drugProcessFilter = drugProcessSelect.value;
    analyticsFilters.process = drugProcessSelect.value; // Sync with analytics filters
    processFilter = drugProcessSelect.value; // Sync with cause process filter
    errorProcessFilter = drugProcessSelect.value; // Sync with error process filter

    // Update other dropdowns
    const analyticsProcessSelect = document.getElementById('analyticsProcessFilter');
    const causeProcessFilter = document.getElementById('processFilter');
    const errorProcessFilterEl = document.getElementById('errorProcessFilter');
    if (analyticsProcessSelect) analyticsProcessSelect.value = drugProcessFilter;
    if (causeProcessFilter) causeProcessFilter.value = drugProcessFilter;
    if (errorProcessFilterEl) errorProcessFilterEl.value = drugProcessFilter;

    // Update UI to show selected process
    const selectedDrugProcessEl = document.getElementById('selectedDrugProcess');
    const selectedProcessEl = document.getElementById('selectedProcess');
    const selectedErrorProcessEl = document.getElementById('selectedErrorProcess');
    if (selectedDrugProcessEl) {
        selectedDrugProcessEl.textContent = drugProcessFilter === 'all' ? 'ทุกกระบวนการ' : drugProcessFilter;
    }
    if (selectedProcessEl) {
        selectedProcessEl.textContent = drugProcessFilter === 'all' ? 'ทุกกระบวนการ' : drugProcessFilter;
    }
    if (selectedErrorProcessEl) {
        selectedErrorProcessEl.textContent = drugProcessFilter === 'all' ? 'ทุกกระบวนการ' : drugProcessFilter;
    }

    // Update analytics filter summary
    updateAnalyticsFilterSummary();

    // Pre-compute filtered data once for all charts
    const preFiltered = applyAnalyticsFiltersToData(lastUserFilteredData || []);

    // Regenerate all charts with process filter
    generateDrugChartByProcess(preFiltered);
    generateCauseChartByProcess(preFiltered);
    generateErrorChartByProcess(preFiltered);
}

// Generate drug chart filtered by process and show top 5 correct items
function generateDrugChartByProcess(preFilteredData) {
    const canvas = document.getElementById('drugChart');
    if (!canvas) return;

    let filteredData = preFilteredData || applyAnalyticsFiltersToData(lastUserFilteredData || []);
    if (drugProcessFilter !== 'all') {
        filteredData = filteredData.filter(row => ((row[5] || '').toString().trim()) === drugProcessFilter);
    }

    const drugCounts = {};
    filteredData.forEach(row => {
        const correctDrug = (row[7] || '').toString().trim();
        if (correctDrug) drugCounts[correctDrug] = (drugCounts[correctDrug] || 0) + 1;
    });

    const sorted = Object.entries(drugCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const labels = sorted.map(s => s[0]);
    const data = sorted.map(s => s[1]);

    const topDrugEl = document.getElementById('topDrug');
    const drugItemCountEl = document.getElementById('drugItemCount');
    if (topDrugEl) topDrugEl.textContent = labels[0] || '-';
    if (drugItemCountEl) drugItemCountEl.textContent = data.reduce((a, b) => a + b, 0) || '0';

    if (drugChartInstance) { try { drugChartInstance.destroy(); } catch (e) { } drugChartInstance = null; }

    const palette = ['#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#4CAF50'];
    drugChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: palette.slice(0, labels.length),
                borderRadius: 8
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: function (context) { return context.formattedValue + ' รายการ'; } } }
            },
            scales: {
                x: { beginAtZero: true, ticks: { precision: 0 } },
                y: { ticks: { autoSkip: false } }
            }
        }
    });
}

// Update location ranking
function updateLocationRanking() {
    const container = document.getElementById('locationRanking');
    if (!container) return;

    const locations = Object.entries(analyticsData.locationData)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    if (locations.length === 0) {
        container.innerHTML = `
            <div class="ranking-item">
                <div class="rank-badge">-</div>
                <div class="location-info">
                    <div class="location-name">ไม่มีข้อมูล</div>
                    <div class="location-count">0 ครั้ง</div>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = locations.map(([location, count], index) => `
        <div class="ranking-item">
            <div class="rank-badge">${index + 1}</div>
            <div class="location-info">
                <div class="location-name">${escapeHtml(location)}</div>
                <div class="location-count">${count} ครั้ง</div>
            </div>
        </div>
    `).join('');
}

// Update time distribution - ใช้ข้อมูลจากตารางเวร
function updateTimeDistribution() {
    const { morning, afternoon, night } = analyticsData.timeData;
    const total = morning + afternoon + night;

    // Update counts
    document.getElementById('morningCount').textContent = morning;
    document.getElementById('afternoonCount').textContent = afternoon;
    document.getElementById('nightCount').textContent = night;

    if (total === 0) {
        // Reset bars and percentages
        ['morning', 'afternoon', 'night'].forEach(time => {
            document.getElementById(`${time}Bar`).style.width = '0%';
            document.getElementById(`${time}Percent`).textContent = '0%';
        });
        return;
    }

    // Update bars and percentages with animation
    const morningPercent = ((morning / total) * 100).toFixed(1);
    const afternoonPercent = ((afternoon / total) * 100).toFixed(1);
    const nightPercent = ((night / total) * 100).toFixed(1);

    // Animate the bars
    setTimeout(() => {
        document.getElementById('morningBar').style.width = `${morningPercent}%`;
        document.getElementById('afternoonBar').style.width = `${afternoonPercent}%`;
        document.getElementById('nightBar').style.width = `${nightPercent}%`;
    }, 100);

    document.getElementById('morningPercent').textContent = `${morningPercent}%`;
    document.getElementById('afternoonPercent').textContent = `${afternoonPercent}%`;
    document.getElementById('nightPercent').textContent = `${nightPercent}%`;

    // Call displayShiftInsights with the calculated data
    displayShiftInsights(morning, afternoon, night, total);
}

// แสดงข้อมูลเชิงลึกของการกระจายตามเวร
function displayShiftInsights(morningCount, afternoonCount, nightCount, totalCount) {
    const shiftInsightElement = document.getElementById('shiftInsights');
    if (!shiftInsightElement) return; // Ensure the element exists

    if (totalCount === 0) {
        shiftInsightElement.innerHTML = `<p>ไม่มีข้อมูลสำหรับวิเคราะห์เชิงลึก</p>`;
        return;
    }

    const morningPercent = (morningCount / totalCount) * 100;
    const afternoonPercent = (afternoonCount / totalCount) * 100;
    const nightPercent = (nightCount / totalCount) * 100;

    // หาเวรที่มีปัญหามากที่สุดและน้อยที่สุด
    const shifts = [
        { name: 'เช้า', count: morningCount, percent: morningPercent },
        { name: 'บ่าย', count: afternoonCount, percent: afternoonPercent },
        { name: 'ดึก', count: nightCount, percent: nightPercent }
    ];

    shifts.sort((a, b) => b.count - a.count);

    const insights = [];

    // วิเคราะห์เวรที่มีปัญหามากที่สุด
    if (shifts[0].count > 0) {
        insights.push(`เวร${shifts[0].name} มีข้อผิดพลาดมากที่สุด (${shifts[0].count} ครั้ง, ${shifts[0].percent.toFixed(1)}%)`);
    }

    // วิเคราะห์ความแตกต่างระหว่างเวร
    const maxPercent = shifts[0].percent;
    const minPercent = shifts[2].percent;
    const difference = maxPercent - minPercent;

    if (difference > 30) {
        insights.push(`ความแตกต่างระหว่างเวรสูง: ${difference.toFixed(1)}% (${shifts[0].name} vs ${shifts[2].name})`);
    } else if (difference < 10) {
        insights.push(`การกระจายข้อผิดพลาดระหว่างเวรค่อนข้างสมดุล`);
    }

    // อัปเดต shiftInsightElement ที่ query ไว้ตั้งแต่ต้นฟังก์ชัน
    shiftInsightElement.innerHTML = insights.map(insight => `<p><i class="fas fa-lightbulb"></i> ${insight}</p>`).join('');
}

// Generate monthly trend chart
function generateMonthlyTrendChart() {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;

    // Destroy any existing Chart.js instance on this canvas
    if (trendChartInstance) {
        try { trendChartInstance.destroy(); } catch (e) { /* ignore */ }
        trendChartInstance = null;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const trendData = analyticsData.monthlyTrend;

    if (trendData.length === 0) {
        drawNoDataMessage(ctx, canvas, 'ไม่มีข้อมูลแนวโน้ม');
        return;
    }

    const months = trendData.map(([month]) => month);
    const counts = trendData.map(([, count]) => count);
    const maxCount = Math.max(...counts, 1);

    // Update trend insights
    updateTrendInsights(months, counts);

    const marginLeft = 60;
    const marginBottom = 60;
    const marginTop = 40;
    const marginRight = 40;
    const chartWidth = canvas.width - marginLeft - marginRight;
    const chartHeight = canvas.height - marginBottom - marginTop;

    // Draw background grid
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
        const y = marginTop + (i * chartHeight / 5);
        ctx.beginPath();
        ctx.moveTo(marginLeft, y);
        ctx.lineTo(marginLeft + chartWidth, y);
        ctx.stroke();
    }

    // Vertical grid lines
    for (let i = 0; i <= months.length - 1; i++) {
        const x = marginLeft + (i * chartWidth / (months.length - 1));
        ctx.beginPath();
        ctx.moveTo(x, marginTop);
        ctx.lineTo(x, marginTop + chartHeight);
        ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(marginLeft, marginTop);
    ctx.lineTo(marginLeft, marginTop + chartHeight);
    ctx.lineTo(marginLeft + chartWidth, marginTop + chartHeight);
    ctx.stroke();

    // Draw trend line and area
    if (months.length > 1) {
        const pointSpacing = chartWidth / (months.length - 1);

        // Create gradient for area fill
        const gradient = ctx.createLinearGradient(0, marginTop, 0, marginTop + chartHeight);
        gradient.addColorStop(0, 'rgba(54, 162, 235, 0.3)');
        gradient.addColorStop(1, 'rgba(54, 162, 235, 0.1)');

        // Draw area
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(marginLeft, marginTop + chartHeight);

        months.forEach((month, index) => {
            const x = marginLeft + (index * pointSpacing);
            const y = marginTop + chartHeight - ((counts[index] / maxCount) * chartHeight);

            if (index === 0) {
                ctx.lineTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.lineTo(marginLeft + chartWidth, marginTop + chartHeight);
        ctx.closePath();
        ctx.fill();

        // Draw trend line
        ctx.strokeStyle = '#36A2EB';
        ctx.lineWidth = 3;
        ctx.beginPath();

        months.forEach((month, index) => {
            const x = marginLeft + (index * pointSpacing);
            const y = marginTop + chartHeight - ((counts[index] / maxCount) * chartHeight);

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        // Draw points
        months.forEach((month, index) => {
            const x = marginLeft + (index * pointSpacing);
            const y = marginTop + chartHeight - ((counts[index] / maxCount) * chartHeight);

            // Point background
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, 2 * Math.PI);
            ctx.fill();

            // Point border
            ctx.strokeStyle = '#36A2EB';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Count label
            ctx.fillStyle = '#333';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(counts[index], x, y - 12);
        });
    }

    // Draw Y-axis labels
    ctx.fillStyle = '#666';
    ctx.font = '11px Arial';
    ctx.textAlign = 'right';

    for (let i = 0; i <= 5; i++) {
        const value = Math.round((maxCount / 5) * (5 - i));
        const y = marginTop + (i * chartHeight / 5);
        ctx.fillText(value.toString(), marginLeft - 10, y + 4);
    }

    // Draw X-axis labels
    ctx.textAlign = 'center';
    months.forEach((month, index) => {
        const x = marginLeft + (index * chartWidth / (months.length - 1));
        ctx.save();
        ctx.translate(x, marginTop + chartHeight + 15);
        ctx.rotate(-Math.PI / 6);
        ctx.fillText(month, 0, 0);
        ctx.restore();
    });
}

// Update trend insights
function updateTrendInsights(months, counts) {
    if (months.length === 0) {
        document.getElementById('peakMonth').textContent = '-';
        document.getElementById('lowMonth').textContent = '-';
        document.getElementById('changeRate').textContent = '-';
        return;
    }

    const maxIndex = counts.indexOf(Math.max(...counts));
    const minIndex = counts.indexOf(Math.min(...counts));

    document.getElementById('peakMonth').textContent = months[maxIndex];
    document.getElementById('lowMonth').textContent = months[minIndex];

    if (months.length >= 2) {
        const lastCount = counts[counts.length - 1];
        const previousCount = counts[counts.length - 2];

        if (previousCount === 0) {
            document.getElementById('changeRate').textContent = lastCount > 0 ? '+100%' : '0%';
        } else {
            const changeRate = ((lastCount - previousCount) / previousCount * 100).toFixed(1);
            document.getElementById('changeRate').textContent = `${changeRate > 0 ? '+' : ''}${changeRate}%`;
        }
    } else {
        document.getElementById('changeRate').textContent = '-';
    }
}

// Helper function to draw "no data" message on canvas
function drawNoDataMessage(ctx, canvas, message) {
    ctx.fillStyle = '#ccc';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);
}

// Reset all analytics
function resetAllAnalytics() {
    // Reset charts
    ['processChart', 'causeChart', 'trendChart'].forEach(chartId => {
        const canvas = document.getElementById(chartId);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawNoDataMessage(ctx, canvas, 'ไม่มีข้อมูล');
        }
    });

    // Reset summary data
    document.getElementById('topProcess').textContent = '-';
    document.getElementById('topProcessCount').textContent = '0';
    document.getElementById('topCause').textContent = '-';

    // Reset time distribution
    ['morning', 'afternoon', 'night'].forEach(time => {
        document.getElementById(`${time}Count`).textContent = '0';
        document.getElementById(`${time}Bar`).style.width = '0%';
        document.getElementById(`${time}Percent`).textContent = '0%';
    });

    // Reset trend insights
    document.getElementById('peakMonth').textContent = '-';
    document.getElementById('lowMonth').textContent = '-';
    document.getElementById('changeRate').textContent = '-';

    // Reset location ranking
    const locationRanking = document.getElementById('locationRanking');
    if (locationRanking) {
        locationRanking.innerHTML = `
            <div class="ranking-item">
                <div class="rank-badge">-</div>
                <div class="location-info">
                    <div class="location-name">ไม่มีข้อมูล</div>
                    <div class="location-count">0 ครั้ง</div>
                </div>
            </div>
        `;
    }

    // Reset insights
    document.getElementById('riskFactors').innerHTML = '<p>ไม่มีข้อมูลสำหรับการวิเคราะห์</p>';
    document.getElementById('improvements').innerHTML = '<p>ไม่มีข้อมูลสำหรับการวิเคราะห์</p>';
    document.getElementById('recommendations').innerHTML = '<p>ไม่มีข้อมูลสำหรับการวิเคราะห์</p>';
}
