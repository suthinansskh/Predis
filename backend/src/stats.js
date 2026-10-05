// สถิติรายงาน — คำนวณฝั่ง server แล้ว cache (dashboard ไม่ต้องดึงข้อมูลดิบทั้งหมดอีก)
// Apps Script: ทุกไฟล์ใน backend/src แชร์ global scope เดียวกัน

var STATS_CACHE_SECONDS = 300;
var STATS_TOP_N = 15;

function addDays(dateText, days) {
  var d = new Date(dateText + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ปีงบประมาณ (1 ต.ค. – 30 ก.ย.) ที่ครอบ today
function fiscalYearStart(today) {
  var year = parseInt(today.slice(0, 4), 10);
  var month = parseInt(today.slice(5, 7), 10);
  return (month >= 10 ? year : year - 1) + '-10-01';
}

function countBy(reports, keyFn) {
  var counts = {};
  reports.forEach(function(r) {
    var key = keyFn(r);
    if (key === '' || key === null || key === undefined) return;
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function topEntries(counts, n, labels) {
  return Object.keys(counts)
    .map(function(k) { return { key: k, label: labels && labels[k] ? labels[k] : k, count: counts[k] }; })
    .sort(function(a, b) { return b.count - a.count || (a.key < b.key ? -1 : 1); })
    .slice(0, n || Infinity);
}

/** Pure: จำนวนรายงานต่อเดือน 12 เดือนล่าสุด (รวมเดือนของ today) */
function monthlyCounts(reports, today) {
  var monthly = [];
  var cursor = new Date(today.slice(0, 7) + '-01T00:00:00Z');
  cursor.setUTCMonth(cursor.getUTCMonth() - 11);
  var byMonth = countBy(reports.filter(function(r) { return /^\d{4}-\d{2}-\d{2}$/.test(r.eventDate); }),
    function(r) { return r.eventDate.slice(0, 7); });
  for (var i = 0; i < 12; i++) {
    var key = cursor.toISOString().slice(0, 7);
    monthly.push({ month: key, count: byMonth[key] || 0 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return monthly;
}

/**
 * Pure: สรุปสถิติจากรายการรายงาน (กรองมาแล้ว)
 * @param {Object[]} reports object ของ Reports
 * @param {{today: string, includeReporters?: boolean}} opts today = yyyy-MM-dd (เวลาไทย)
 */
function computeStats(reports, opts) {
  var today = opts.today;
  var month = today.slice(0, 7);
  var weekStart = addDays(today, -6);
  var fyStart = fiscalYearStart(today);
  var dated = reports.filter(function(r) { return /^\d{4}-\d{2}-\d{2}$/.test(r.eventDate); });

  var totals = { all: dated.length, fiscalYear: 0, month: 0, last7: 0, today: 0, had: 0 };
  dated.forEach(function(r) {
    if (r.eventDate >= fyStart && r.eventDate <= today) totals.fiscalYear++;
    if (r.eventDate.slice(0, 7) === month) totals.month++;
    if (r.eventDate >= weekStart && r.eventDate <= today) totals.last7++;
    if (r.eventDate === today) totals.today++;
    if (isTrue(r.isHad)) totals.had++;
  });

  var monthly = monthlyCounts(dated, today);

  var drugLabels = {};
  var drugCounts = countBy(dated, function(r) {
    var code = r.incorrectDrugCode || r.correctDrugCode;
    if (!code) return '';
    drugLabels[code] = r.incorrectDrugCode ? r.incorrectDrugName : r.correctDrugName;
    return code;
  });
  var hadLabels = {};
  var hadCounts = {};
  dated.forEach(function(r) {
    String(r.hadDrugCodes || '').split(',').filter(Boolean).forEach(function(code) {
      hadCounts[code] = (hadCounts[code] || 0) + 1;
      hadLabels[code] = code === r.correctDrugCode ? r.correctDrugName : r.incorrectDrugName;
    });
  });

  var result = {
    totals: totals,
    monthly: monthly,
    byProcess: topEntries(countBy(dated, function(r) { return r.process; })),
    byErrorDetail: topEntries(countBy(dated, function(r) { return r.errorDetail; }), STATS_TOP_N),
    byCause: topEntries(countBy(dated, function(r) { return r.cause; }), STATS_TOP_N),
    byLocation: topEntries(countBy(dated, function(r) { return r.substation || r.location; }), STATS_TOP_N),
    byShift: topEntries(countBy(dated, function(r) { return r.shift; })),
    byPatientType: topEntries(countBy(dated, function(r) { return r.patientType; })),
    topDrugs: topEntries(drugCounts, STATS_TOP_N, drugLabels),
    topHadDrugs: topEntries(hadCounts, STATS_TOP_N, hadLabels)
  };
  if (opts.includeReporters) {
    var reporterLabels = {};
    result.byReporter = topEntries(countBy(dated, function(r) {
      if (!r.reporterPsCode) return '';
      reporterLabels[r.reporterPsCode] = r.reporterName;
      return r.reporterPsCode;
    }), 50, reporterLabels);
  }
  return result;
}

/** v2: สถิติตาม filter (cache ตาม reportsVersion — ล้างอัตโนมัติเมื่อมีรายงานใหม่) */
function getReportStats(session, p) {
  var fullAccess = FULL_REPORT_ACCESS.indexOf(session.level) !== -1;
  var filter = {
    from: p.from || '', to: p.to || '', process: p.process || '', patientType: p.patientType || '',
    location: p.location || '', hadOnly: isTrue(p.hadOnly), mine: isTrue(p.mine)
  };
  var cacheKey = 'stats:' + reportsDataKey() + ':' + (fullAccess ? 'full' : 'user') + ':' +
    (filter.mine ? session.psCode : '') + ':' + sha256Hex(JSON.stringify(filter)).slice(0, 16);
  var cache = CacheService.getScriptCache();
  var cached = cache.get(cacheKey);
  if (cached) return { ok: true, data: JSON.parse(cached) };

  filter.psCode = session.psCode;
  var all = readAllReports();
  var today = formatBangkokDate(new Date());
  var stats = computeStats(filterReports(all, filter), { today: today, includeReporters: fullAccess });

  // แนวโน้มแสดง 12 เดือนเสมอ (ไม่ขึ้นกับช่วงวันที่ที่เลือก)
  var noDate = {};
  Object.keys(filter).forEach(function(k) { noDate[k] = filter[k]; });
  noDate.from = '';
  noDate.to = '';
  stats.monthly = monthlyCounts(filterReports(all, noDate), today);

  // เมื่อกรองเฉพาะ HAD: ส่งยอดรวมทุกเหตุการณ์ (ช่วงเดียวกัน) มาด้วยเพื่อคำนวณสัดส่วน
  if (filter.hadOnly) {
    var everyKind = {};
    Object.keys(filter).forEach(function(k) { everyKind[k] = filter[k]; });
    everyKind.hadOnly = false;
    noDate.hadOnly = false;
    stats.comparison = {
      allInRange: filterReports(all, everyKind).filter(function(r) { return /^\d{4}-\d{2}-\d{2}$/.test(r.eventDate); }).length,
      monthlyAll: monthlyCounts(filterReports(all, noDate), today)
    };
  }
  stats.generatedAt = new Date().toISOString();
  var json = JSON.stringify(stats);
  if (json.length < 90000) cache.put(cacheKey, json, STATS_CACHE_SECONDS);
  return { ok: true, data: stats };
}
