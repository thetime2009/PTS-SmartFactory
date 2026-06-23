// ══════════════════════════════════════════════════════════════
// hr.js v3.3  —  HR Module
// นำเข้าข้อมูลสแกนหน้า | สรุปเวลางาน | พนักงาน | ตั้งค่า | สลิปเงินเดือน
// ══════════════════════════════════════════════════════════════

/* global Swal, SCRIPT_URL */

// ── State ─────────────────────────────────────────────────────
let _hrS        = null;  // settings cache (from localStorage)
let _hrEmps     = [];    // [{empId,name,dept,position,type,salary,dailyRate,otRateWD,otRateSun}]
let _hrAtt      = [];    // attendance rows (loaded per month)
let _hrPreview  = [];    // parsed import rows before confirm
let _hrHolidays = [];    // [{date:'dd/MM/yyyy', name:'...', type:'...'}]
let _hrSubCur   = '1';  // active sub-tab
let _hrSumMon   = '';   // 'YYYY-MM' viewing in summary
let _hrSumPeriod = 'all'; // 'all' | 'p1' | 'p2'

const HR_LS  = 'ptts_hr_settings';
const HR_PAY_LS = 'ptts_hr_pay_cfg';
const HR_PAY_DEF = {
  mode: 'semi',            // 'semi' | 'monthly'
  p1: { start: 11, end: 25, payday: 1 },   // จ่ายวันที่ 1 เดือนถัดไป
  p2: { start: 26, end: 10, payday: 16 },  // จ่ายวันที่ 16 เดือนนี้
};
function _hrPayCfg() {
  try {
    var raw = JSON.parse(localStorage.getItem(HR_PAY_LS) || '{}');
    return {
      mode: raw.mode || HR_PAY_DEF.mode,
      p1: Object.assign({}, HR_PAY_DEF.p1, raw.p1 || {}),
      p2: Object.assign({}, HR_PAY_DEF.p2, raw.p2 || {}),
    };
  } catch(e) { return HR_PAY_DEF; }
}
const HR_DEF = {
  startTime: '08:00',
  endTime:   '17:00',
  lateGrace: 5,          // grace นาที (สายหลัง startTime+5)
  otMinTime: '19:00',    // ออกหลังนี้ถึงนับ OT
  otEndTime: '20:00',    // เวลา OT สิ้นสุด
  otFullMin: 10,         // ออกก่อน otEndTime กี่นาที → ให้ OT เต็ม
  otMaxH:    3,
  sunRate:   2,          // วันอาทิตย์ = 2x
  satRate:   1,
};

// ── Pure helpers ──────────────────────────────────────────────
function _hrMin(t) {
  if (!t) return 0;
  const p = String(t).split(':');
  return parseInt(p[0]) * 60 + (parseInt(p[1]) || 0);
}
function _hrHM(m) {
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
function _hrFmt(n) {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _hrDMY(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return d + '/' + m + '/' + date.getFullYear();
}
function _hrMKey(dmy) {
  if (!dmy) return '';
  const p = String(dmy).split('/');
  return p.length < 3 ? '' : p[2] + '-' + p[1].padStart(2, '0');
}
function _hrMLab(key) {
  if (!key) return '';
  const p = key.split('-');
  const MO = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return (MO[parseInt(p[1]) - 1] || p[1]) + ' ' + (parseInt(p[0]) + 543);
}
function _hrOTRoundTime(s) { return _hrHM(_hrMin(s.otEndTime) - (parseInt(s.otFullMin) || 10)); }

// ── Settings ──────────────────────────────────────────────────
function _hrCfg() {
  if (!_hrS) {
    try { _hrS = Object.assign({}, HR_DEF, JSON.parse(localStorage.getItem(HR_LS) || '{}')); }
    catch (e) { _hrS = Object.assign({}, HR_DEF); }
  }
  return _hrS;
}
function _hrSaveS() { localStorage.setItem(HR_LS, JSON.stringify(_hrS)); }

// ── API ───────────────────────────────────────────────────────
function _hrUrl() {
  return (typeof SCRIPT_URL !== 'undefined' ? SCRIPT_URL : null)
      || localStorage.getItem('ptts_script_url') || '';
}
function _hrGET(action, params) {
  const url = _hrUrl();
  if (!url) return Promise.reject('ไม่พบ Script URL — กรุณาตั้งค่าใน ⚙️ ตั้งค่า');
  const p = Object.assign({ action }, params || {});
  return fetch(url + '?' + new URLSearchParams(p)).then(function(r) { return r.json(); });
}
function _hrPOST(action, body) {
  const url = _hrUrl();
  if (!url) return Promise.reject('ไม่พบ Script URL — กรุณาตั้งค่าใน ⚙️ ตั้งค่า');
  return fetch(url, {
    method: 'POST',
    body: JSON.stringify(Object.assign({ action }, body || {}))
  }).then(function(r) { return r.json(); });
}

// ── Sub-tab navigation ────────────────────────────────────────
function hrSubSwitch(n) {
  _hrSubCur = String(n);
  ['1', '2', '3', '4', '5', '6'].forEach(function(k) {
    const btn = document.getElementById('hrBtn' + k);
    const pan = document.getElementById('hrPanel' + k);
    if (btn) {
      btn.style.background   = k === _hrSubCur ? 'var(--c1)' : 'transparent';
      btn.style.color        = k === _hrSubCur ? '#fff' : 'var(--t3)';
      btn.style.borderColor  = k === _hrSubCur ? 'var(--c1)' : 'var(--bc-input)';
    }
    if (pan) pan.style.display = k === _hrSubCur ? '' : 'none';
  });
  if (n === '2') _hrRenderSummary();
  if (n === '3') _hrRenderEmps();
  if (n === '4') _hrRenderSettings();
  if (n === '5') _hrRenderCal();
  if (n === '6') _hrRenderLoans();
}

function hrInitTab() {
  _hrS = null; // reset cache → reload from LS
  _hrCfg();
  // form.html (admin) → set manager session อัตโนมัติ ไม่ต้อง login
  if (!_hrSession) {
    _hrSession = { empId: 'admin', name: 'ผู้จัดการ', dept: '', role: 'manager', advanceBudget: 0 };
  }
  hrSubSwitch(_hrSubCur || '1');
  _hrRenderImport();
}

// ══════════════════════════════════════════════════════════════
// PANEL 1 — นำเข้าข้อมูล
// ══════════════════════════════════════════════════════════════
function _hrRenderImport() {
  const p = document.getElementById('hrPanel1');
  if (!p) return;
  p.innerHTML =
    '<div style="max-width:720px">' +
    '<div style="background:var(--card);border:1px solid var(--bc-input);border-radius:14px;padding:20px 22px;margin-bottom:16px">' +
      '<div style="font-weight:700;font-size:.95rem;color:var(--c1);margin-bottom:6px">📥 นำเข้าจากเครื่องสแกนหน้า ZKTeco</div>' +
      '<div style="font-size:.82rem;color:var(--t3);margin-bottom:14px">อัปโหลดไฟล์ Excel (.xls / .xlsx) ที่ Export จากเครื่องสแกน — ระบบจะคำนวณ OT และเวลาสาย โดยอัตโนมัติ</div>' +
      '<label style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;' +
        'background:rgba(99,102,241,.15);color:#818cf8;border:1px solid rgba(99,102,241,.4);' +
        'border-radius:10px;cursor:pointer;font-size:.88rem;font-weight:700">' +
        '📂 เลือกไฟล์' +
        '<input type="file" accept=".xls,.xlsx" style="display:none" onchange="hrHandleFile(this)">' +
      '</label>' +
      '<span id="hrFileName" style="margin-left:10px;font-size:.82rem;color:var(--t3)"></span>' +
    '</div>' +
    '<div id="hrImportPreview" style="margin-bottom:12px"></div>' +
    '<div id="hrImportActions"></div>' +
    '</div>';
}

function hrHandleFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  document.getElementById('hrFileName').textContent = file.name;

  if (typeof XLSX === 'undefined') {
    Swal.fire('❌ ไม่พบ SheetJS', 'กรุณาโหลดหน้าใหม่', 'error');
    return;
  }

  Swal.fire({ title: '⏳ กำลังอ่านไฟล์...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const wb     = XLSX.read(e.target.result, { type: 'binary', cellDates: false });
      const parsed = _hrParseZKTeco(wb);
      // กรองเฉพาะพนักงานที่อยู่ในระบบ
      _hrFilterAndPreview(parsed);
    } catch (err) {
      Swal.hideLoading(); Swal.close();
      Swal.fire('❌ อ่านไฟล์ไม่ได้', err.message, 'error');
    }
  };
  reader.readAsBinaryString(file);
}

// ── กรองเฉพาะพนักงานที่อยู่ในระบบก่อน Preview ───────────────
function _hrFilterAndPreview(parsed) {
  function _doFilter() {
    var empIds   = _hrEmps.map(function(e) { return String(e.empId  || '').trim().toLowerCase(); });
    var empNames = _hrEmps.map(function(e) { return String(e.name   || '').trim(); });

    var skipped  = {};
    var filtered = parsed.filter(function(r) {
      var idMatch   = empIds.indexOf(String(r.empId   || '').trim().toLowerCase()) >= 0;
      var nameMatch = empNames.indexOf(String(r.empName || '').trim()) >= 0;
      if (!idMatch && !nameMatch) { skipped[r.empName || r.empId] = true; return false; }
      return true;
    });

    _hrPreview = filtered;
    Swal.hideLoading(); Swal.close();

    var skippedNames = Object.keys(skipped);
    if (skippedNames.length) {
      Swal.fire({
        icon: 'warning',
        title: 'ข้ามพนักงาน ' + skippedNames.length + ' คน',
        html: 'ไม่พบในระบบ จึงไม่นำเข้า:<br><b style="color:#f87171">' + skippedNames.join(', ') + '</b><br>' +
          '<span style="font-size:.78rem;color:#94a3b8">กรุณาเพิ่มพนักงานในแท็บ พนักงาน ก่อน</span>',
        background: '#0d1b2a', color: '#cce4ff',
        confirmButtonColor: '#4f46e5', confirmButtonText: 'รับทราบ'
      }).then(function() { _hrShowPreview(_hrPreview); });
    } else {
      _hrShowPreview(_hrPreview);
    }
  }

  if (_hrEmps.length && _hrHolidays.length) {
    _doFilter();
  } else {
    // โหลด employees + holidays พร้อมกัน
    var calls = [];
    if (!_hrEmps.length)     calls.push(_hrGET('getHREmployees'));
    if (!_hrHolidays.length) calls.push(_hrGET('getHRHolidays'));

    Promise.all(calls).then(function(results) {
      var idx = 0;
      if (!_hrEmps.length)     { _hrEmps     = (results[idx++] || {}).data || []; }
      if (!_hrHolidays.length) { _hrHolidays = (results[idx++] || {}).data || []; }
      _doFilter();
    }).catch(function() {
      _hrPreview = parsed;
      Swal.hideLoading(); Swal.close();
      _hrShowPreview(_hrPreview);
    });
  }
}

// ── ZKTeco Excel Parser ──────────────────────────────────────
function _hrParseZKTeco(wb) {
  const s = _hrCfg();
  const result = [];

  wb.SheetNames.forEach(function(sName) {
    const ws   = wb.Sheets[sName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (!rows.length) return;

    // ตรวจว่าชีตนี้คือบัตรตอก
    const a1 = String(rows[0] && rows[0][0] || '').trim();
    if (a1 !== 'รายงานบัตรตอก') return;

    const BLOCK = 15;
    let maxBlocks = 1;
    while ((rows[2] || [])[maxBlocks * BLOCK] != null) maxBlocks++;
    maxBlocks = Math.min(maxBlocks, 6);

    for (let b = 0; b < maxBlocks; b++) {
      const off = b * BLOCK;
      const r2  = rows[2] || [];
      const r3  = rows[3] || [];

      // ชื่อ empId อยู่ที่ offset+9 ใน row2 (ชื่อ) และ row3 (รหัส)
      const empName = String(r2[off + 9] || r2[off + 8] || '').trim();
      const dept    = String(r2[off + 1] || '').trim();
      const empId   = String(r3[off + 9] || r3[off + 1] || (b + 1)).trim();
      const period  = String(r3[off + 1] || (rows[1] && rows[1][1]) || '').trim();

      if (!empName) continue;

      // period: '2026-06-01 ~ 2026-06-15'
      let startYear = new Date().getFullYear();
      let startMonth = new Date().getMonth() + 1;
      const pm = period.match(/(\d{4})-(\d{2})/);
      if (pm) { startYear = parseInt(pm[1]); startMonth = parseInt(pm[2]); }

      for (let r = 10; r < rows.length; r++) {
        const row = rows[r] || [];
        const dayLabel = String(row[off] || '').trim();
        if (!dayLabel.match(/^\d{1,2}[\s ]/)) continue;

        const dayNum = parseInt(dayLabel);
        if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) continue;

        const date = new Date(startYear, startMonth - 1, dayNum);
        if (date.getMonth() !== startMonth - 1) continue;

        const dow = date.getDay(); // 0=อาทิตย์
        const clockIn = _hrCleanTime(row[off + 1]);

        // last scan = ค่าสุดท้ายที่มีใน col 3,5,7,10,12 ของ block
        const scanCols = [off + 3, off + 5, off + 7, off + 10, off + 12];
        const scans = scanCols.map(function(i) { return _hrCleanTime(row[i]); }).filter(Boolean);
        const lastScan = scans[scans.length - 1] || '';

        const dateStr = _hrDMY(date);
        const calc = _hrCalcDay(clockIn, lastScan, dow, s, dateStr);

        result.push(Object.assign({
          empId: empId, empName: empName, dept: dept, period: period,
          date: dateStr, dow: dow,
          clockIn: clockIn, lastScan: lastScan
        }, calc));
      }
    }
  });

  return result;
}

function _hrCleanTime(v) {
  if (v == null) return '';
  const s = String(v).trim();
  return s.match(/^\d{1,2}:\d{2}/) ? s.substring(0, 5) : '';
}

function _hrCalcDay(clockIn, lastScan, dow, s, dateStr) {
  const isAbsent  = !clockIn;
  const isHoliday = dateStr ? _hrHolidays.some(function(h) { return h.date === dateStr; }) : false;

  // วันอาทิตย์ ไม่มี scan = หยุด
  if (isAbsent && dow === 0) return { status: 'off', lateMin: 0, otHours: 0, otRate: s.sunRate || 2 };
  // วันหยุดนักขัตฤกษ์ ไม่มี scan = หยุด (ไม่ใช่ขาด)
  if (isAbsent && isHoliday) return { status: 'off', lateMin: 0, otHours: 0, otRate: 1 };
  // วันทำงาน ไม่มี clock-in = ขาด
  if (isAbsent)              return { status: 'absent', lateMin: 0, otHours: 0, otRate: 1 };

  const ciMins    = _hrMin(clockIn);
  const startMins = _hrMin(s.startTime);
  const graceMins = startMins + (parseInt(s.lateGrace) || 5);
  const lateMin   = ciMins > graceMins ? ciMins - startMins : 0;

  let otHours = 0;
  let otRate  = 1;

  if (dow === 0) {
    // วันอาทิตย์: ทุกชม. = OT 2x
    if (lastScan) {
      const mins = _hrMin(lastScan) - ciMins;
      otHours = Math.round(Math.max(0, mins) / 60 * 10) / 10;
    }
    otRate = parseFloat(s.sunRate) || 2;
  } else {
    otRate = dow === 6 ? (parseFloat(s.satRate) || 1) : 1;
    if (lastScan) {
      const lastMins  = _hrMin(lastScan);
      const otMinMins = _hrMin(s.otMinTime); // 19:00
      const otEndMins = _hrMin(s.otEndTime); // 20:00
      const endMins   = _hrMin(s.endTime);   // 17:00
      const roundBuf  = parseInt(s.otFullMin) || 10;

      if (lastMins >= otMinMins) {
        if (lastMins >= otEndMins - roundBuf) {
          otHours = parseFloat(s.otMaxH) || 3; // round-up เต็ม
        } else {
          otHours = Math.min(
            Math.round((lastMins - endMins) / 60 * 10) / 10,
            parseFloat(s.otMaxH) || 3
          );
        }
      }
    }
  }

  return { status: 'present', lateMin: lateMin, otHours: otHours, otRate: otRate };
}

function _hrShowPreview(rows) {
  const p   = document.getElementById('hrImportPreview');
  const act = document.getElementById('hrImportActions');
  if (!p) return;

  if (!rows.length) {
    p.innerHTML = '<div style="color:var(--t3);font-size:.85rem;padding:12px">❌ ไม่พบข้อมูลบัตรตอก (หน้าแรกต้องชื่อ "รายงานบัตรตอก")</div>';
    if (act) act.innerHTML = '';
    return;
  }

  // group by emp
  const stats = {};
  rows.forEach(function(r) {
    if (!stats[r.empId]) stats[r.empId] = { name: r.empName, dept: r.dept, present: 0, absent: 0, off: 0, lateMin: 0, otH: 0, rows: [] };
    const st = stats[r.empId];
    if (r.status === 'present') st.present++;
    else if (r.status === 'absent') st.absent++;
    else st.off++;
    st.lateMin += parseInt(r.lateMin) || 0;
    st.otH += parseFloat(r.otHours) || 0;
    st.rows.push(r);
  });

  const DAYS_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  let html = '<div style="font-size:.8rem;color:var(--t3);margin-bottom:10px">พบข้อมูล ' + rows.length + ' วัน (' + Object.keys(stats).length + ' คน) — ตรวจสอบและเช็ค ✅ อนุมัติ OT ก่อนบันทึก</div>';

  Object.keys(stats).forEach(function(empId) {
    const st     = stats[empId];
    const hasOT  = st.otH > 0;
    const safeId = empId.replace(/[^a-zA-Z0-9]/g, '_');

    html += '<div style="background:var(--card);border:1px solid var(--bc-input);border-radius:12px;padding:14px 16px;margin-bottom:12px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px">' +
        '<div style="font-weight:700;color:var(--c1)">' + st.name + ' <span style="font-size:.78rem;color:var(--t3)">' + st.dept + '</span></div>' +
        '<div style="font-size:.78rem;color:var(--t3)">มา <b style="color:#34d399">' + st.present + '</b> | ขาด <b style="color:#f87171">' + st.absent + '</b> | หยุด ' + st.off + ' | สาย ' + st.lateMin + ' น. | OT <span id="otSumChip_' + safeId + '">0.0</span> ชม.</div>' +
      '</div>' +
      '<div style="overflow-x:auto">' +
      '<table style="width:100%;border-collapse:collapse;font-size:.76rem">' +
        '<tr style="background:rgba(99,102,241,.1)">' +
          '<th style="padding:4px 8px;text-align:left">วันที่</th>' +
          '<th style="text-align:center">วัน</th>' +
          '<th style="text-align:center">เข้างาน</th>' +
          '<th style="text-align:center">ออก/OT</th>' +
          '<th style="text-align:center">สาย(น.)</th>' +
          '<th style="text-align:center">OT(ชม.)</th>' +
          '<th style="text-align:center">สถานะ</th>' +
          (hasOT ? '<th style="text-align:center;color:#818cf8;white-space:nowrap">✅ อนุมัติ OT</th><th style="text-align:left;color:var(--t3);white-space:nowrap;min-width:160px">หมายเหตุ OT</th>' : '') +
        '</tr>' +
        st.rows.map(function(r) {
          const dParts     = String(r.date || '').split('/');
          const dLabel     = dParts[0] + '/' + (dParts[1] || '');
          const sDow       = DAYS_TH[r.dow] || '';
          const isSun      = r.dow === 0;
          const isSat      = r.dow === 6;
          const holidayObj = _hrHolidays.find(function(h) { return h.date === r.date; });
          const isHoliday  = !!holidayObj;
          const dowColor   = isSun ? 'color:#f87171' : isSat ? 'color:#fbbf24' : '';
          const sColor     = r.status === 'absent' ? '#f87171' : r.status === 'off' ? 'var(--t3)' : '#34d399';
          const sTx        = r.status === 'absent' ? 'ขาด' : r.status === 'off' ? 'หยุด' : 'มา';
          const hasRowOT   = (parseFloat(r.otHours) || 0) > 0;
          const dateKey    = String(r.date).replace(/\//g, '-');
          const ckId       = 'otck_' + safeId + '_' + dateKey;
          const noteId     = 'otnote_' + safeId + '_' + dateKey;
          const ciId       = 'ci_' + safeId + '_' + dateKey;
          const lsId       = 'ls_' + safeId + '_' + dateKey;
          const otDispId   = 'otdisp_' + safeId + '_' + dateKey;
          const ckWrapId   = 'otckwrap_' + safeId + '_' + dateKey;
          const noteWrapId = 'notewrap_' + safeId + '_' + dateKey;
          const recalc     = '_hrRecalcRow(\'' + safeId + '\',\'' + dateKey + '\',' + r.dow + ')';
          const tStyle     = 'padding:3px 6px;border-radius:4px;border:1px solid #cbd5e1;background:#fff;color:#1e293b;font-family:Sarabun,sans-serif;font-size:.8rem;width:88px';

          // ไฮไลต์: วันหยุดราชการ (เหลือง) > วันอาทิตย์ (แดง) > มี OT (ม่วงจาง)
          var rowBg = isHoliday
            ? 'background:rgba(251,191,36,.13);border-left:3px solid #f59e0b;'
            : isSun
              ? 'background:rgba(248,113,113,.13);border-left:3px solid #f87171;'
              : (hasRowOT ? 'background:rgba(129,140,248,.06);' : '');
          var dateColor = isHoliday ? ';color:#92400e;font-weight:700' : isSun ? ';font-weight:700;color:#f87171' : '';
          var dateTxt   = dLabel + (isHoliday ? ' 🎉' : '');

          return '<tr style="border-top:1px solid var(--bc-input);' + rowBg + '">' +
            '<td style="padding:3px 8px' + dateColor + '">' + dateTxt + '</td>' +
            '<td style="text-align:center;' + dowColor + (isSun ? ';font-weight:700' : '') + '">' + sDow + '</td>' +
            '<td style="text-align:center;padding:2px 4px">' +
              '<input type="time" id="' + ciId + '" value="' + (r.clockIn || '') + '" oninput="' + recalc + '" style="' + tStyle + '">' +
            '</td>' +
            '<td style="text-align:center;padding:2px 4px">' +
              '<input type="time" id="' + lsId + '" value="' + (r.lastScan || '') + '" oninput="' + recalc + '" style="' + tStyle + '">' +
            '</td>' +
            '<td style="text-align:center' + (r.lateMin > 0 ? ';color:#f87171' : '') + '">' + (r.lateMin || 0) + '</td>' +
            '<td style="text-align:center" id="' + otDispId + '"><span style="' + (hasRowOT ? 'color:#818cf8;font-weight:700' : '') + '">' + (hasRowOT ? Number(r.otHours).toFixed(1) : '—') + '</span></td>' +
            '<td style="text-align:center;color:' + sColor + '">' + sTx + '</td>' +
            (hasOT
              ? '<td style="text-align:center;padding:2px 6px" id="' + ckWrapId + '">' + (hasRowOT
                  ? '<input type="checkbox" id="' + ckId + '" onchange="_hrUpdateOTSum(\'' + safeId + '\')" style="width:16px;height:16px;accent-color:#818cf8;cursor:pointer" title="เช็ค = อนุมัติ OT วันนี้">'
                  : '') + '</td>' +
                '<td style="padding:2px 6px" id="' + noteWrapId + '">' + (hasRowOT
                  ? '<input type="text" id="' + noteId + '" value="' + (isHoliday ? (holidayObj.name || '') : '') + '" placeholder="เช่น ซ่อมเครื่อง, ปิดงานด่วน..." style="width:100%;min-width:150px;padding:3px 7px;border-radius:5px;border:1px solid #cbd5e1;background:#fff;color:#1e293b;font-family:Sarabun,sans-serif;font-size:.74rem">'
                  : (isHoliday ? '<span style="font-size:.72rem;color:#92400e">' + (holidayObj.name || '') + '</span>' : '')) + '</td>'
              : '') +
            '</tr>';
        }).join('') +
      '</table></div>';

    if (hasOT) {
      html += '<div style="margin-top:6px;font-size:.72rem;color:var(--t3)">⚠️ วันที่ไม่ได้เช็ค ✅ จะถูกตัด OT ออกอัตโนมัติ</div>';
    }

    html += '</div>';
  });

  p.innerHTML = html;

  if (act) act.innerHTML =
    '<button onclick="hrConfirmImport()" style="padding:10px 24px;background:var(--c1);color:#fff;border:none;border-radius:10px;font-family:\'Sarabun\',sans-serif;font-size:.9rem;font-weight:700;cursor:pointer">✅ บันทึก ' + rows.length + ' รายการ</button>' +
    '<button onclick="_hrPreview=[];document.getElementById(\'hrImportPreview\').innerHTML=\'\';document.getElementById(\'hrImportActions\').innerHTML=\'\';" style="margin-left:10px;padding:10px 18px;background:transparent;color:var(--t3);border:1px solid var(--bc-input);border-radius:10px;font-family:\'Sarabun\',sans-serif;font-size:.85rem;cursor:pointer">❌ ล้าง</button>';
}

function hrConfirmImport() {
  if (!_hrPreview.length) return;

  // อ่าน checkbox + เลขใบจาก DOM แล้วสร้าง rows สำหรับบันทึก
  var cutCount = 0;
  var rows = _hrPreview.map(function(r) {
    var copy    = Object.assign({}, r);
    var safeId  = String(r.empId).replace(/[^a-zA-Z0-9]/g, '_');
    var hasRowOT = (parseFloat(r.otHours) || 0) > 0;

    if (hasRowOT) {
      var ckId     = 'otck_' + safeId + '_' + String(r.date).replace(/\//g, '-');
      var noteId   = 'otnote_' + safeId + '_' + String(r.date).replace(/\//g, '-');
      var ck       = document.getElementById(ckId);
      var approved = ck ? ck.checked : false;
      var noteEl   = document.getElementById(noteId);
      copy.otNote  = (approved && noteEl) ? noteEl.value.trim() : '';
      if (!approved) { copy.otHours = 0; cutCount++; }
    } else {
      copy.otNote = '';
    }
    return copy;
  });

  var msg = 'จะบันทึก ' + rows.length + ' รายการ';
  if (cutCount > 0) msg += '\n(ตัด OT ออก ' + cutCount + ' วัน — ไม่ได้เช็คอนุมัติ)';

  Swal.fire({
    title: 'บันทึกข้อมูล?',
    text: msg,
    icon: 'question', showCancelButton: true,
    confirmButtonText: '✅ บันทึก', cancelButtonText: 'ยกเลิก'
  }).then(function(res) {
    if (!res.isConfirmed) return;
    _hrDoSave(rows);
  });
}

// ── บันทึกจริง ────────────────────────────────────────────────
function _hrDoSave(rows) {
  Swal.fire({ title: '⏳ กำลังบันทึก...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });
  _hrPOST('saveHRAttendance', { rows: rows }).then(function(r) {
    Swal.hideLoading(); Swal.close();
    if (r.status === 'ok') {
      Swal.fire({ icon: 'success', title: '✅ บันทึกสำเร็จ', text: 'บันทึก ' + (r.saved || rows.length) + ' รายการ', timer: 1800, showConfirmButton: false });
      _hrPreview = [];
      _hrAtt = [];
      document.getElementById('hrImportPreview').innerHTML = '';
      document.getElementById('hrImportActions').innerHTML = '';
      setTimeout(function() { hrSubSwitch('2'); }, 1900);
    } else {
      Swal.fire('❌ ผิดพลาด', r.message || 'ไม่ทราบสาเหตุ', 'error');
    }
  }).catch(function(e) { Swal.hideLoading(); Swal.close(); Swal.fire('❌ Error', String(e), 'error'); });
}

// ── คำนวณ OT ใหม่เมื่อแก้เวลาใน Preview ────────────────────────
function _hrRecalcRow(safeId, dateKey, dow) {
  var s        = _hrCfg();
  var ciEl     = document.getElementById('ci_' + safeId + '_' + dateKey);
  var lsEl     = document.getElementById('ls_' + safeId + '_' + dateKey);
  var clockIn  = ciEl  ? ciEl.value  : '';
  var lastScan = lsEl  ? lsEl.value  : '';

  var originalDate = dateKey.replace(/-/g, '/');
  var calc     = _hrCalcDay(clockIn, lastScan, dow, s, originalDate);
  var hasRowOT = calc.otHours > 0;

  // อัปเดต OT display
  var otDisp = document.getElementById('otdisp_' + safeId + '_' + dateKey);
  if (otDisp) {
    otDisp.innerHTML = '<span style="' + (hasRowOT ? 'color:#818cf8;font-weight:700' : '') + '">' +
      (hasRowOT ? Number(calc.otHours).toFixed(1) : '—') + '</span>';
  }

  // อัปเดต checkbox
  var ckWrap = document.getElementById('otckwrap_' + safeId + '_' + dateKey);
  if (ckWrap) {
    ckWrap.innerHTML = hasRowOT
      ? '<input type="checkbox" id="otck_' + safeId + '_' + dateKey + '" onchange="_hrUpdateOTSum(\'' + safeId + '\')" style="width:16px;height:16px;accent-color:#818cf8;cursor:pointer" title="เช็ค = อนุมัติ OT วันนี้">'
      : '';
  }

  // อัปเดต note
  var noteWrap = document.getElementById('notewrap_' + safeId + '_' + dateKey);
  if (noteWrap) {
    var hObj = _hrHolidays.find(function(h) { return h.date === originalDate; });
    noteWrap.innerHTML = hasRowOT
      ? '<input type="text" id="otnote_' + safeId + '_' + dateKey + '" value="' + (hObj ? hObj.name : '') + '" placeholder="เช่น ซ่อมเครื่อง, ปิดงานด่วน..." style="width:100%;min-width:150px;padding:3px 7px;border-radius:5px;border:1px solid #cbd5e1;background:#fff;color:#1e293b;font-family:Sarabun,sans-serif;font-size:.74rem">'
      : (hObj ? '<span style="font-size:.72rem;color:#92400e">' + hObj.name + '</span>' : '');
  }

  // อัปเดต _hrPreview
  var originalDate = dateKey.replace(/-/g, '/');
  _hrPreview.forEach(function(r) {
    if (String(r.empId).replace(/[^a-zA-Z0-9]/g, '_') === safeId && r.date === originalDate) {
      r.clockIn  = clockIn;
      r.lastScan = lastScan;
      r.otHours  = calc.otHours;
      r.otRate   = calc.otRate;
      r.lateMin  = calc.lateMin;
      r.status   = calc.status;
    }
  });

  // อัปเดต OT chip บนหัวพนักงาน
  _hrUpdateOTSum(safeId);
}

// ── รวม OT เฉพาะวันที่เช็ค ✅ แล้วอัปเดต chip หัวพนักงาน ──────
function _hrUpdateOTSum(safeId) {
  var total = 0;
  _hrPreview.forEach(function(r) {
    if (String(r.empId).replace(/[^a-zA-Z0-9]/g, '_') !== safeId) return;
    var ot = parseFloat(r.otHours) || 0;
    if (ot <= 0) return;
    var dk = String(r.date).replace(/\//g, '-');
    var ck = document.getElementById('otck_' + safeId + '_' + dk);
    if (ck && ck.checked) total += ot;
  });
  var chip = document.getElementById('otSumChip_' + safeId);
  if (chip) chip.textContent = total.toFixed(1);
}

// ══════════════════════════════════════════════════════════════
// PANEL 2 — สรุปเวลางาน
// ══════════════════════════════════════════════════════════════
function _hrRenderSummary() {
  const p = document.getElementById('hrPanel2');
  if (!p) return;

  const now = new Date();
  if (!_hrSumMon) _hrSumMon = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  p.innerHTML =
    '<div style="max-width:900px">' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">' +
      '<button onclick="_hrSumPrev()" style="padding:6px 14px;border-radius:8px;border:1px solid var(--bc-input);background:transparent;color:var(--t2);cursor:pointer;font-size:1rem">◀</button>' +
      '<div style="font-weight:700;font-size:.95rem;color:var(--c1);min-width:110px;text-align:center" id="hrSumMonLabel">' + _hrMLab(_hrSumMon) + '</div>' +
      '<button onclick="_hrSumNext()" style="padding:6px 14px;border-radius:8px;border:1px solid var(--bc-input);background:transparent;color:var(--t2);cursor:pointer;font-size:1rem">▶</button>' +
      _hrPeriodSelect() +
      '<button onclick="_hrLoadAndRender()" style="padding:6px 16px;border-radius:8px;background:rgba(99,102,241,.15);color:#818cf8;border:1px solid rgba(99,102,241,.4);cursor:pointer;font-size:.82rem;font-family:\'Sarabun\',sans-serif">🔄 โหลดข้อมูล</button>' +
    '</div>' +
    '<div id="hrSumTable"><div style="color:var(--t3);font-size:.85rem">⏳ กำลังโหลด...</div></div>' +
    '</div>';
  _hrLoadAndRender();
}

function _hrPeriodSelect() {
  var pc = _hrPayCfg();
  if (pc.mode !== 'semi') return '';
  var opts = [
    ['all',  'ทั้งเดือน'],
    ['p1',   'งวด 1 ('+pc.p1.start+'-'+pc.p1.end+')'],
    ['p2',   'งวด 2 ('+pc.p2.start+' เดือนก่อน – '+pc.p2.end+' เดือนนี้)'],
  ];
  return '<select id="hrSumPeriodSel" onchange="_hrSumPeriod=this.value;_hrApplyFilter()" ' +
    'style="padding:6px 10px;border-radius:8px;border:1px solid var(--bc-input);background:var(--bg);color:var(--t1);font-family:\'Sarabun\',sans-serif;font-size:.82rem">' +
    opts.map(function(o){ return '<option value="'+o[0]+'"'+(_hrSumPeriod===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('') +
  '</select>';
}

function _hrFilterByPeriod(rows, period, mon) {
  var pc = _hrPayCfg();
  if (period === 'all' || pc.mode !== 'semi') return rows;
  var mp = mon.split('-').map(Number); // [ceYear, ceMonth]
  var ceY = mp[0], ceM = mp[1];
  return rows.filter(function(r) {
    var dp = String(r.date||'').split('/');
    if (dp.length < 3) return false;
    var d = parseInt(dp[0]), m = parseInt(dp[1]), yr = parseInt(dp[2]);
    // normalize: yr >= 2500 = BE → ลบ 543, น้อยกว่า = CE อยู่แล้ว
    var rY = yr >= 2500 ? yr - 543 : yr;
    var rM = m;
    if (period === 'p1') {
      return rY === ceY && rM === ceM && d >= pc.p1.start && d <= pc.p1.end;
    }
    if (period === 'p2') {
      // prev month part: day >= p2.start
      var pM = ceM === 1 ? 12 : ceM - 1;
      var pY = ceM === 1 ? ceY - 1 : ceY;
      if (rY === pY && rM === pM && d >= pc.p2.start) return true;
      // current month part: day <= p2.end
      if (rY === ceY && rM === ceM && d <= pc.p2.end) return true;
    }
    return false;
  });
}

function _hrApplyFilter() {
  var tbl = document.getElementById('hrSumTable');
  if (!tbl || !_hrAtt.length) return;
  var base = _hrAtt.filter(function(r) { return _hrMKey(r.date) === _hrSumMon; });
  // for p2, also include prev month records
  if (_hrSumPeriod === 'p2') {
    var mp = _hrSumMon.split('-').map(Number);
    var pM = mp[1] === 1 ? 12 : mp[1] - 1;
    var pY = mp[1] === 1 ? mp[0]-1 : mp[0];
    var prevMon = pY + '-' + String(pM).padStart(2,'0');
    var prevRecs = _hrAtt.filter(function(r) { return _hrMKey(r.date) === prevMon; });
    base = base.concat(prevRecs);
  }
  tbl.innerHTML = _hrSumTableHtml(_hrFilterByPeriod(base, _hrSumPeriod, _hrSumMon));
}

function _hrSumPrev() {
  const p = _hrSumMon.split('-').map(Number);
  const d = new Date(p[0], p[1] - 2, 1);
  _hrSumMon = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const lbl = document.getElementById('hrSumMonLabel');
  if (lbl) lbl.textContent = _hrMLab(_hrSumMon);
}
function _hrSumNext() {
  const p = _hrSumMon.split('-').map(Number);
  const d = new Date(p[0], p[1], 1);
  _hrSumMon = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const lbl = document.getElementById('hrSumMonLabel');
  if (lbl) lbl.textContent = _hrMLab(_hrSumMon);
}

function _hrLoadAndRender() {
  const tbl = document.getElementById('hrSumTable');
  if (!tbl) return;
  tbl.innerHTML = '<div style="color:var(--t3);font-size:.85rem">⏳ กำลังโหลด...</div>';

  // ถ้า p2 ต้องโหลดเดือนก่อนด้วย
  var months = [_hrSumMon];
  if (_hrSumPeriod === 'p2') {
    var mp2 = _hrSumMon.split('-').map(Number);
    var pM2 = mp2[1] === 1 ? 12 : mp2[1]-1;
    var pY2 = mp2[1] === 1 ? mp2[0]-1 : mp2[0];
    months.push(pY2+'-'+String(pM2).padStart(2,'0'));
  }
  Promise.all([
    Promise.all(months.map(function(m){ return _hrGET('getHRAttendance', { month: m }); })),
    _hrGET('getHREmployees')
  ]).then(function(results) {
    _hrAtt  = results[0].reduce(function(a,r){ return a.concat(r.data||[]); }, []);
    _hrEmps = results[1].data || [];
    // employee mode → กรอง เฉพาะตัวเอง
    if (_hrSession && _hrSession.role === 'emp') {
      var _empId = String(_hrSession.empId);
      _hrAtt  = _hrAtt.filter(function(r) { return String(r.empId) === _empId; });
      _hrEmps = _hrEmps.filter(function(e) { return String(e.empId) === _empId; });
    }
    var base = _hrAtt.filter(function(r) { return _hrMKey(r.date) === _hrSumMon; });
    if (_hrSumPeriod === 'p2') {
      var mp = _hrSumMon.split('-').map(Number);
      var pM = mp[1]===1?12:mp[1]-1, pY = mp[1]===1?mp[0]-1:mp[0];
      var prev = pY+'-'+String(pM).padStart(2,'0');
      base = base.concat(_hrAtt.filter(function(r){ return _hrMKey(r.date)===prev; }));
    }
    tbl.innerHTML = _hrSumTableHtml(_hrFilterByPeriod(base, _hrSumPeriod, _hrSumMon));
  }).catch(function(e) {
    tbl.innerHTML = '<div style="color:#f87171;font-size:.85rem">❌ ' + e + '</div>';
  });
}

function _hrSumTableHtml(rows) {
  if (!rows.length) {
    return '<div style="color:var(--t3);font-size:.85rem">ไม่พบข้อมูลเดือน ' + _hrMLab(_hrSumMon) + ' — กรุณานำเข้าข้อมูลก่อน</div>';
  }

  // สร้าง map empId → type จาก _hrEmps
  const empTypeMap = {};
  _hrEmps.forEach(function(e) { empTypeMap[String(e.empId)] = e.type || 'monthly'; });

  const emp = {};
  rows.forEach(function(r) {
    const id = String(r.empId);
    if (!emp[id]) emp[id] = {
      name: r.empName || r.name, dept: r.dept,
      type: empTypeMap[id] || 'monthly',
      present: 0, absent: 0, off: 0, lateTimes: 0, lateMin: 0, otWD: 0, otSun: 0,
    };
    const e  = emp[id];
    const st = r.status;
    if (st === 'present') e.present++;
    else if (st === 'absent') e.absent++;
    else e.off++;
    if ((parseInt(r.lateMin) || 0) > 0) { e.lateTimes++; e.lateMin += parseInt(r.lateMin) || 0; }
    const ot   = parseFloat(r.otHours) || 0;
    const rate = parseFloat(r.otRate) || 1;
    if (rate >= 2) e.otSun += ot; else e.otWD += ot;
  });

  // แยกกลุ่ม: รายเดือน ก่อน, รายวัน หลัง
  const monthly = Object.keys(emp).filter(function(id) { return emp[id].type !== 'daily'; });
  const daily   = Object.keys(emp).filter(function(id) { return emp[id].type === 'daily'; });

  function stat(val, label, color, unit) {
    var c = color || 'var(--t2)';
    return '<div style="text-align:center;flex:1;min-width:0">' +
      '<div style="font-size:1.05rem;font-weight:800;color:' + c + ';line-height:1.1">' + val +
        (unit ? '<span style="font-size:.6rem;font-weight:500"> ' + unit + '</span>' : '') + '</div>' +
      '<div style="font-size:.6rem;color:var(--t3);margin-top:1px">' + label + '</div>' +
    '</div>';
  }

  function empCard(id) {
    const e = emp[id];
    const isManager = !_hrSession || _hrSession.role === 'manager';
    const ac = e.type === 'daily' ? '#0891b2' : '#4f46e5';
    return '<div style="background:var(--bg-card);border:1.5px solid var(--bc-card);border-radius:14px;overflow:hidden">' +
      '<div style="background:' + ac + '18;padding:10px 14px;display:flex;align-items:center;gap:10px;border-bottom:1.5px solid ' + ac + '30">' +
        '<div style="width:36px;height:36px;border-radius:50%;background:' + ac + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:800;flex-shrink:0">' +
          (e.name ? e.name.charAt(0) : '?') +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:700;font-size:.93rem;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + e.name + '</div>' +
          '<div style="font-size:.7rem;color:' + ac + ';font-weight:600;margin-top:1px">' +
            (e.dept || '—') + ' · ' + (e.type === 'daily' ? 'รายวัน' : 'รายเดือน') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:2px;padding:10px 10px;border-bottom:1px solid var(--bc-input)">' +
        stat(e.present,          'มา',         '#059669') +
        stat(e.absent,           'ขาด',        e.absent  > 0 ? '#dc2626' : 'var(--t4)') +
        stat(e.lateTimes,        'สายครั้ง',   e.lateMin > 0 ? '#d97706' : 'var(--t4)') +
        stat(e.lateMin,          'สายนาที',    e.lateMin > 0 ? '#d97706' : 'var(--t4)', 'น.') +
        stat(e.otWD.toFixed(1),  'OT ปกติ',   '#4338ca', 'ชม.') +
        stat(e.otSun.toFixed(1), 'OT อา.',     '#b45309', 'ชม.') +
      '</div>' +
      '<div style="display:flex;gap:6px;padding:8px 10px;flex-wrap:wrap">' +
        '<button onclick="hrOpenPayslip(\'' + id + '\',\'' + _hrSumMon + '\',\''+_hrSumPeriod+'\')" ' +
          'style="flex:1;min-width:60px;padding:6px 2px;background:#d1fae5;color:#065f46;border:1px solid #6ee7b7;border-radius:8px;cursor:pointer;font-family:\'Sarabun\',sans-serif;font-size:.77rem;font-weight:600">🧾 สลิป</button>' +
        '<button onclick="hrPrintAttReport(\'' + id + '\',\'' + _hrSumMon + '\',\''+_hrSumPeriod+'\')" ' +
          'style="flex:1;min-width:60px;padding:6px 2px;background:#e0e7ff;color:#3730a3;border:1px solid #a5b4fc;border-radius:8px;cursor:pointer;font-family:\'Sarabun\',sans-serif;font-size:.77rem;font-weight:600">🖨️ รายงาน</button>' +
        (isManager ?
          '<button onclick="hrEditAtt(\'' + id + '\',\'' + _hrSumMon + '\',\''+_hrSumPeriod+'\')" ' +
            'style="flex:1;min-width:60px;padding:6px 2px;background:#ffedd5;color:#9a3412;border:1px solid #fdba74;border-radius:8px;cursor:pointer;font-family:\'Sarabun\',sans-serif;font-size:.77rem;font-weight:600">✏️ แก้ไข</button>' : '') +
      '</div>' +
    '</div>';
  }

  function sectionLabel(label, count, color) {
    return '<div style="grid-column:1/-1;display:flex;align-items:center;gap:8px;margin-top:4px">' +
      '<div style="flex:1;height:2px;border-radius:2px;background:' + color + '40"></div>' +
      '<span style="font-size:.78rem;font-weight:700;color:' + color + ';white-space:nowrap">' +
        label + ' <span style="font-weight:400;opacity:.75">(' + count + ' คน)</span>' +
      '</span>' +
      '<div style="flex:1;height:2px;border-radius:2px;background:' + color + '40"></div>' +
    '</div>';
  }

  let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px">';

  if (monthly.length) {
    html += sectionLabel('💼 รายเดือน', monthly.length, '#4f46e5');
    monthly.forEach(function(id) { html += empCard(id); });
  }
  if (daily.length) {
    html += sectionLabel('🔧 รายวัน', daily.length, '#0891b2');
    daily.forEach(function(id) { html += empCard(id); });
  }

  html += '</div>';
  return html;
}

// ══════════════════════════════════════════════════════════════
// PANEL 3 — พนักงาน
// ══════════════════════════════════════════════════════════════
function _hrRenderEmps() {
  const p = document.getElementById('hrPanel3');
  if (!p) return;
  p.innerHTML = '<div style="color:var(--t3);font-size:.85rem">⏳ กำลังโหลด...</div>';

  _hrGET('getHREmployees').then(function(res) {
    _hrEmps = res.data || [];
    p.innerHTML = _hrEmpsHtml();
  }).catch(function(e) {
    p.innerHTML = '<div style="color:#f87171">❌ ' + e + '</div>';
  });
}

function _hrEmpsHtml() {
  const addBtn = '<div style="display:flex;justify-content:flex-end;margin-bottom:14px">' +
    '<button onclick="hrAddEmp()" style="padding:8px 20px;background:var(--c1);color:#fff;border:none;border-radius:10px;font-family:\'Sarabun\',sans-serif;font-size:.86rem;font-weight:700;cursor:pointer">➕ เพิ่มพนักงาน</button>' +
    '</div>';

  if (!_hrEmps.length) return '<div>' + addBtn + '<div style="color:var(--t3);font-size:.85rem;text-align:center;padding:24px">ยังไม่มีข้อมูลพนักงาน — กด ➕ เพิ่มพนักงาน</div></div>';

  const cards = _hrEmps.map(function(e, i) {
    const isDaily = e.type === 'daily';
    const ac = isDaily ? '#0891b2' : '#4f46e5';
    const payLabel = isDaily ? 'ค่าแรง/วัน' : 'เงินเดือน';
    const payVal = _hrFmt(isDaily ? e.dailyRate : e.salary);

    // avatar — รูปโปรไฟล์ หรืออักษรย่อ
    const avatar = e.profileUrl
      ? '<img src="' + e.profileUrl + '" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid ' + ac + ';flex-shrink:0" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">' +
        '<div style="display:none;width:44px;height:44px;border-radius:50%;background:' + ac + ';color:#fff;align-items:center;justify-content:center;font-size:1.1rem;font-weight:800;flex-shrink:0">' + (e.name ? e.name.charAt(0) : '?') + '</div>'
      : '<div style="width:44px;height:44px;border-radius:50%;background:' + ac + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:800;flex-shrink:0">' + (e.name ? e.name.charAt(0) : '?') + '</div>';

    function infoItem(label, val) {
      if (!val) return '';
      return '<div style="display:flex;gap:6px;align-items:flex-start;padding:4px 0;border-bottom:1px solid var(--bc-input)">' +
        '<span style="font-size:.68rem;color:var(--t3);white-space:nowrap;min-width:80px;padding-top:1px">' + label + '</span>' +
        '<span style="font-size:.8rem;color:var(--t1);word-break:break-word">' + val + '</span>' +
      '</div>';
    }

    return '<div style="background:var(--bg-card);border:1.5px solid var(--bc-card);border-radius:14px;overflow:hidden">' +
      // ── header ──
      '<div style="background:' + ac + '18;padding:12px 14px;display:flex;align-items:center;gap:10px;border-bottom:1.5px solid ' + ac + '30">' +
        avatar +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:700;font-size:.96rem;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + e.name + '</div>' +
          '<div style="font-size:.7rem;color:' + ac + ';font-weight:600;margin-top:1px">' + (e.dept || '—') + (e.position ? ' · ' + e.position : '') + '</div>' +
        '</div>' +
        '<span style="background:' + ac + '22;color:' + ac + ';border-radius:6px;padding:2px 8px;font-size:.68rem;font-weight:700;white-space:nowrap;flex-shrink:0">' + (isDaily ? 'รายวัน' : 'รายเดือน') + '</span>' +
      '</div>' +
      // ── รายละเอียด ──
      '<div style="padding:10px 14px">' +
        infoItem('รหัส', e.empId) +
        infoItem('เบอร์โทร', e.phone) +
        infoItem('บัตรประชาชน', e.idCard ? (e.idCard.replace(/(.{1})(.{4})(.{5})(.{2})(.{1})/, '$1-$2-$3-$4-$5')) : '') +
        infoItem('ที่อยู่', e.address) +
        infoItem(payLabel, '฿' + payVal) +
        infoItem('OT ปกติ/อา.', (e.otRateWD||100) + '% / ' + (e.otRateSun||200) + '%') +
        infoItem('วงเงินเบิก/เดือน', e.advanceBudget ? '฿' + _hrFmt(e.advanceBudget) : '') +
        (e.idCardUrl ? '<div style="margin-top:4px"><a href="' + e.idCardUrl + '" target="_blank" style="font-size:.75rem;color:#3b82f6;text-decoration:none">🪪 ดูสแกนบัตร</a></div>' : '') +
      '</div>' +
      // ── ปุ่ม ──
      '<div style="display:flex;gap:8px;padding:8px 12px;border-top:1px solid var(--bc-input)">' +
        '<button onclick="hrEditEmp(' + i + ')" style="flex:1;padding:6px;border-radius:8px;border:1px solid rgba(99,102,241,.35);background:rgba(99,102,241,.08);color:#6366f1;cursor:pointer;font-family:\'Sarabun\',sans-serif;font-size:.8rem;font-weight:600">✏️ แก้ไข</button>' +
        '<button onclick="hrDelEmp(' + i + ')" style="flex:1;padding:6px;border-radius:8px;border:1px solid rgba(248,113,113,.3);background:rgba(248,113,113,.07);color:#f87171;cursor:pointer;font-family:\'Sarabun\',sans-serif;font-size:.8rem;font-weight:600">🗑 ลบ</button>' +
      '</div>' +
    '</div>';
  }).join('');

  return '<div>' + addBtn +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">' + cards + '</div></div>';
}
function hrAddEmp()   { _hrEmpModal(null, -1); }
function hrEditEmp(i) { _hrEmpModal(_hrEmps[i], i); }

function _hrEmpModal(emp, idx) {
  const isNew = idx < 0;
  const v = function(id) { const el = document.getElementById(id); return el ? el.value : ''; };

  // helper อัปโหลดไฟล์พนักงาน
  function uploadEmpFile(inputId, fieldId) {
    return new Promise(function(resolve) {
      var input = document.getElementById(inputId);
      if (!input || !input.files || !input.files[0]) return resolve('');
      var file = input.files[0];
      var reader = new FileReader();
      reader.onload = function(ev) {
        var b64 = ev.target.result.split(',')[1];
        _hrPOST('uploadEmployeeFile', {
          base64: b64, mimeType: file.type,
          filename: (emp && emp.empId ? emp.empId : 'new') + '_' + fieldId + '_' + file.name
        }).then(function(r) { resolve(r && r.url ? r.url : ''); }).catch(function() { resolve(''); });
      };
      reader.readAsDataURL(file);
    });
  }

  const fileRow = function(id, label, currentUrl) {
    return '<div style="margin-bottom:8px">' +
      '<label style="font-size:.76rem;color:var(--t3);display:block;margin-bottom:3px">' + label + '</label>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<input id="' + id + '" type="file" accept="image/*,.pdf" style="flex:1;font-size:.78rem">' +
        (currentUrl ? '<a href="' + currentUrl + '" target="_blank" style="font-size:.75rem;color:#3b82f6;white-space:nowrap">📎 ดูไฟล์</a>' : '') +
      '</div>' +
    '</div>';
  };

  Swal.fire({
    title: isNew ? '➕ เพิ่มพนักงาน' : '✏️ แก้ไขพนักงาน',
    width: '600px',
    html:
      '<div style="text-align:left;font-size:.86rem">' +
      // ── ข้อมูลพื้นฐาน ──
      '<div style="font-size:.72rem;font-weight:700;color:#6366f1;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">ข้อมูลพื้นฐาน</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
        _hrField('empFId',   'รหัสพนักงาน', emp && emp.empId    || '', 'text', '001') +
        _hrField('empFName', 'ชื่อ-สกุล',   emp && emp.name     || '', 'text', 'ชื่อ') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
        _hrField('empFDept', 'แผนก',         emp && emp.dept     || '', 'text', 'ฝ่ายผลิต') +
        _hrField('empFPos',  'ตำแหน่ง',      emp && emp.position || '', 'text', 'พนักงาน') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
        _hrField('empFPhone',  'เบอร์โทรศัพท์', emp ? (emp.phone||'') : '', 'tel', '0812345678', 'inputmode="numeric" maxlength="10" autocomplete="tel"') +
        _hrField('empFIdCard', 'เลขบัตรประชาชน', emp && emp.idCard || '', 'text', '1-XXXX-XXXXX-XX-X', 'maxlength="17"') +
      '</div>' +
      '<div style="margin-bottom:10px">' +
        '<label style="font-size:.76rem;color:var(--t3);display:block;margin-bottom:3px">ที่อยู่</label>' +
        '<textarea id="empFAddr" rows="2" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--bc-input);background:var(--card);color:var(--t1);font-family:\'Sarabun\',sans-serif;box-sizing:border-box;resize:vertical">' +
          (emp && emp.address || '') +
        '</textarea>' +
      '</div>' +
      // ── ค่าจ้าง / OT ──
      '<div style="font-size:.72rem;font-weight:700;color:#6366f1;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">ค่าจ้าง / OT</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
        '<div><label style="font-size:.76rem;color:var(--t3);display:block;margin-bottom:3px">ประเภทค่าจ้าง</label>' +
          '<select id="empFType" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--bc-input);background:var(--card);color:var(--t1);font-family:\'Sarabun\',sans-serif;box-sizing:border-box">' +
            '<option value="monthly"' + (emp && emp.type !== 'daily' ? ' selected' : '') + '>รายเดือน</option>' +
            '<option value="daily"' + (emp && emp.type === 'daily' ? ' selected' : '') + '>รายวัน</option>' +
          '</select></div>' +
        '<div><label style="font-size:.76rem;color:var(--t3);display:block;margin-bottom:3px">รอบการจ่าย</label>' +
          '<select id="empFPayCycle" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--bc-input);background:var(--card);color:var(--t1);font-family:\'Sarabun\',sans-serif;box-sizing:border-box">' +
            '<option value="default"' + (!emp || emp.payCycle === 'default' || !emp.payCycle ? ' selected' : '') + '>ตามค่าตั้งระบบ</option>' +
            '<option value="semi"' + (emp && emp.payCycle === 'semi' ? ' selected' : '') + '>ครึ่งเดือน (2 งวด)</option>' +
            '<option value="monthly"' + (emp && emp.payCycle === 'monthly' ? ' selected' : '') + '>รายเดือน (1 งวด)</option>' +
          '</select></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
        _hrField('empFSal',  'เงินเดือน (บาท/เดือน)', emp && emp.salary    || 0, 'number') +
        _hrField('empFDay',  'ค่าแรง (บาท/วัน)',       emp && emp.dailyRate || 0, 'number') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
        _hrField('empFOTWD',  'OT ปกติ (฿/ชม.)',       emp && emp.otRateWD  || 100, 'number') +
        _hrField('empFOTSun', 'OT อาทิตย์ (฿/ชม.)',    emp && emp.otRateSun || 200, 'number') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">' +
        _hrField('empFAdvBudget', 'วงเงินเบิก/เดือน (฿)', emp && emp.advanceBudget || 0, 'number') +
        _hrField('empFPin', 'PIN เข้าระบบ (4 หลัก)', '', 'password', '••••') +
      '</div>' +
      // ── เอกสาร / รูปถ่าย ──
      '<div style="font-size:.72rem;font-weight:700;color:#6366f1;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">เอกสาร / รูปถ่าย (เก็บที่ Drive)</div>' +
      fileRow('empFProfile', '📷 รูปประจำตัว', emp && emp.profileUrl || '') +
      fileRow('empFIdScan',  '🪪 สแกนบัตรประชาชน', emp && emp.idCardUrl || '') +
      '</div>',
    showCancelButton: true,
    confirmButtonText: isNew ? '➕ เพิ่ม' : '💾 บันทึก',
    cancelButtonText: 'ยกเลิก',
    preConfirm: function() {
      var addr = document.getElementById('empFAddr');
      var data = {
        empId:         v('empFId').trim(), name: v('empFName').trim(),
        dept:          v('empFDept').trim(), position: v('empFPos').trim(),
        type:          v('empFType'),
        payCycle:      v('empFPayCycle') || 'default',
        salary:        parseFloat(v('empFSal')) || 0, dailyRate: parseFloat(v('empFDay')) || 0,
        otRateWD:      parseFloat(v('empFOTWD')) || 100, otRateSun: parseFloat(v('empFOTSun')) || 200,
        advanceBudget: parseFloat(v('empFAdvBudget')) || 0,
        pin:           v('empFPin').trim() || undefined,
        phone:         v('empFPhone').trim() || undefined,
        idCard:        v('empFIdCard').trim(),
        address:       addr ? addr.value.trim() : '',
        profileUrl:    emp && emp.profileUrl || '',
        idCardUrl:     emp && emp.idCardUrl  || '',
        active: true, _idx: idx,
      };
      if (!data.empId || !data.name) { Swal.showValidationMessage('กรุณาใส่รหัสและชื่อ'); return false; }
      // อัปโหลดไฟล์ก่อนบันทึก
      return Promise.all([
        uploadEmpFile('empFProfile', 'profile'),
        uploadEmpFile('empFIdScan',  'idcard'),
      ]).then(function(urls) {
        if (urls[0]) data.profileUrl = urls[0];
        if (urls[1]) data.idCardUrl  = urls[1];
        return data;
      });
    }
  }).then(function(res) {
    if (!res.isConfirmed) return;
    Swal.fire({ title: '⏳', text: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });
    _hrPOST('saveHREmployee', res.value).then(function(r) {
      Swal.hideLoading(); Swal.close();
      if (r.status === 'ok') _hrRenderEmps();
      else Swal.fire('❌', r.message || 'ผิดพลาด', 'error');
    }).catch(function(e) { Swal.hideLoading(); Swal.close(); Swal.fire('❌', String(e), 'error'); });
  });
}

function _hrField(id, label, value, type, placeholder, extra) {
  return '<div><label style="font-size:.76rem;color:var(--t3);display:block;margin-bottom:3px">' + label + '</label>' +
    '<input id="' + id + '" type="' + (type || 'text') + '" value="' + value + '"' +
    (placeholder ? ' placeholder="' + placeholder + '"' : '') +
    (extra ? ' ' + extra : '') +
    ' style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--bc-input);background:var(--card);color:var(--t1);font-family:\'Sarabun\',sans-serif;box-sizing:border-box"></div>';
}

function hrDelEmp(i) {
  const emp = _hrEmps[i];
  if (!emp) return;
  Swal.fire({
    title: 'ลบ ' + emp.name + '?', text: 'ข้อมูลเวลางานยังคงอยู่',
    icon: 'warning', showCancelButton: true,
    confirmButtonText: '🗑 ลบ', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#f87171'
  }).then(function(res) {
    if (!res.isConfirmed) return;
    Swal.fire({ title: '⏳', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });
    _hrPOST('deleteHREmployee', { empId: emp.empId }).then(function(r) {
      Swal.hideLoading(); Swal.close();
      if (r.status === 'ok') _hrRenderEmps();
      else Swal.fire('❌', r.message || 'ผิดพลาด', 'error');
    }).catch(function(e) { Swal.hideLoading(); Swal.close(); Swal.fire('❌', String(e), 'error'); });
  });
}

// ══════════════════════════════════════════════════════════════
// PANEL 5 — ปฏิทินวันหยุด (Interactive + Print)
// ══════════════════════════════════════════════════════════════

const _CAL_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const _CAL_DAYS   = ['อา','จ','อ','พ','พฤ','ศ','ส'];

function _hrRenderCal() {
  const p = document.getElementById('hrPanel5');
  if (!p) return;
  const now = new Date();
  const curBE = now.getFullYear() + 543;
  const years = [2569,2570,2571,2572,2573,2574,2575];
  const defY  = years.indexOf(curBE) >= 0 ? curBE : 2569;

  p.innerHTML =
    '<div style="max-width:980px">' +
    // ── controls ──
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">' +
      '<select id="hrCalYear" onchange="_hrCalDraw()" style="padding:8px 14px;border-radius:9px;border:1px solid var(--bc-input);background:var(--bg);color:var(--t1);font-family:\'Sarabun\',sans-serif;font-size:.9rem;font-weight:700">' +
        years.map(function(y){ return '<option value="'+y+'"'+(y===defY?' selected':'')+'>'+y+' ('+(y-543)+')</option>'; }).join('') +
      '</select>' +
      '<button onclick="_hrCalLoad()" style="padding:8px 16px;border-radius:9px;background:rgba(99,102,241,.12);color:#818cf8;border:1px solid rgba(99,102,241,.3);font-family:\'Sarabun\',sans-serif;font-size:.84rem;cursor:pointer">🔄 โหลดวันหยุด</button>' +
      '<button onclick="_hrCalPrint()" style="padding:8px 20px;border-radius:9px;background:var(--c1);color:#fff;border:none;font-family:\'Sarabun\',sans-serif;font-size:.84rem;font-weight:700;cursor:pointer">🖨️ พิมพ์ปฏิทิน</button>' +
      '<span style="font-size:.74rem;color:var(--t3)">💡 คลิกวันที่เพื่อเพิ่ม / แก้ไข / ลบวันหยุด</span>' +
    '</div>' +
    // ── calendar grid ──
    '<div id="hrCalGrid"></div>' +
    // ── legend ──
    '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;font-size:.74rem;color:var(--t3)">' +
      '<span><span style="display:inline-block;width:12px;height:12px;background:rgba(248,113,113,.4);border-radius:3px;vertical-align:middle;margin-right:4px"></span>นักขัตฤกษ์</span>' +
      '<span><span style="display:inline-block;width:12px;height:12px;background:rgba(251,191,36,.4);border-radius:3px;vertical-align:middle;margin-right:4px"></span>ชดเชย</span>' +
      '<span><span style="display:inline-block;width:12px;height:12px;background:rgba(52,211,153,.4);border-radius:3px;vertical-align:middle;margin-right:4px"></span>บริษัท</span>' +
    '</div>' +
    '</div>';

  _hrCalLoad();
}

function _hrNormDate(val) {
  // Normalize any date format → "dd/MM/yyyy" BE
  var s = String(val || '');
  if (!s) return '';

  // Format 1: dd/MM/yyyy (ถูกอยู่แล้ว หรือ CE ที่ต้อง +543)
  var slashP = s.split('/');
  if (slashP.length === 3) {
    var yr = parseInt(slashP[2]);
    if (yr < 2500) yr += 543;
    return ('0'+slashP[0]).slice(-2) + '/' + ('0'+slashP[1]).slice(-2) + '/' + yr;
  }

  // Format 2: Apps Script Date string "Thu Jan 01 2026 00:00:00 GMT+..."
  var _MON = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
  var m2 = s.match(/[A-Z][a-z]{2}\s+(\d{1,2})\s+(\d{4})/);
  var mName = s.match(/([A-Z][a-z]{2})\s+\d{1,2}\s+\d{4}/);
  if (m2 && mName && _MON[mName[1]]) {
    var yr2 = parseInt(m2[2]);
    if (yr2 < 2500) yr2 += 543;
    return ('0'+m2[1]).slice(-2) + '/' + ('0'+_MON[mName[1]]).slice(-2) + '/' + yr2;
  }

  // Format 3: ISO yyyy-MM-dd
  var isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoM) {
    var yr3 = parseInt(isoM[1]);
    if (yr3 < 2500) yr3 += 543;
    return isoM[3] + '/' + isoM[2] + '/' + yr3;
  }

  return s;
}

function _hrCalLoad() {
  const grid = document.getElementById('hrCalGrid');
  if (grid) grid.innerHTML = '<div style="color:var(--t3);font-size:.85rem;padding:12px">⏳ กำลังโหลดวันหยุด...</div>';
  _hrGET('getHRHolidays').then(function(res) {
    _hrHolidays = (res.data || []).map(function(h) {
      return Object.assign({}, h, { date: _hrNormDate(h.date) });
    });
    if (!_hrHolidays.length) {
      Swal.fire({
        icon: 'warning',
        title: 'ไม่พบวันหยุด',
        html: 'Sheet HR_Holidays ว่างเปล่า<br><span style="font-size:.85rem;color:#94a3b8">ไปที่ <b>ตั้งค่า HR</b> แล้วกด <b>สร้างวันหยุด</b> ก่อน<br>หรือตรวจสอบว่า <b>Redeploy Code.gs</b> แล้ว</span>',
        confirmButtonColor: '#4f46e5',
      });
    }
    _hrCalDraw();
  }).catch(function(e) {
    if (grid) grid.innerHTML = '<div style="color:#f87171;font-size:.85rem;padding:12px">❌ โหลดวันหยุดไม่ได้ — ตรวจสอบ Script URL และ Redeploy Code.gs<br><small style="color:#94a3b8">' + String(e) + '</small></div>';
  });
}

function _hrCalDraw() {
  const grid = document.getElementById('hrCalGrid');
  const sel  = document.getElementById('hrCalYear');
  if (!grid || !sel) return;
  const beYear = parseInt(sel.value);
  const ceYear = beYear - 543;

  // map วันหยุดของปีนี้ → key = 'dd/mm'
  const hMap = {};
  _hrHolidays.forEach(function(h) {
    const p = String(h.date||'').split('/');
    if (p.length === 3 && parseInt(p[2]) === beYear) hMap[p[0]+'/'+p[1]] = h;
  });

  function _holBg(type) {
    return type==='บริษัท' ? 'rgba(52,211,153,.2)' : type==='ชดเชย' ? 'rgba(251,191,36,.2)' : 'rgba(248,113,113,.2)';
  }
  function _holFc(type) {
    return type==='บริษัท' ? '#059669' : type==='ชดเชย' ? '#92400e' : '#dc2626';
  }

  let html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">';

  for (let m = 1; m <= 12; m++) {
    const firstDow   = new Date(ceYear, m-1, 1).getDay();
    const daysInMon  = new Date(ceYear, m, 0).getDate();
    const mm         = String(m).padStart(2,'0');

    html += '<div style="background:var(--card);border:1px solid var(--bc-input);border-radius:10px;overflow:hidden">';
    // เดือน header
    html += '<div style="background:var(--c1);color:#fff;text-align:center;padding:7px 4px;font-weight:700;font-size:.82rem">'+_CAL_MONTHS[m-1]+' '+beYear+'</div>';
    // วันในสัปดาห์ header
    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr)">';
    _CAL_DAYS.forEach(function(d,i){
      var c = i===0?'#f87171':i===6?'#fbbf24':'var(--t3)';
      html += '<div style="text-align:center;padding:3px 1px;font-size:.6rem;font-weight:700;color:'+c+';border-bottom:1px solid var(--bc-input)">'+d+'</div>';
    });
    html += '</div>';
    // วันที่
    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr)">';
    for (let i=0; i<firstDow; i++) html += '<div style="min-height:36px;border-right:1px solid var(--bc-input);border-bottom:1px solid var(--bc-input)"></div>';
    for (let d=1; d<=daysInMon; d++) {
      const dow  = new Date(ceYear,m-1,d).getDay();
      const dd   = String(d).padStart(2,'0');
      const key  = dd+'/'+mm;
      const dStr = dd+'/'+mm+'/'+beYear;
      const hol  = hMap[key];
      const esc  = dStr.replace(/'/g,"\\'");
      const nEsc = hol ? hol.name.replace(/'/g,"\\'") : '';

      var bg = hol ? _holBg(hol.type) : (dow===0?'rgba(248,113,113,.05)':dow===6?'rgba(251,191,36,.04)':'var(--card)');
      var fc = hol ? _holFc(hol.type) : (dow===0?'#f87171':dow===6?'#fbbf24':'var(--t1)');

      html += '<div onclick="_hrCalClick(\''+esc+'\',\''+nEsc+'\')" ' +
        'style="min-height:36px;border-right:1px solid var(--bc-input);border-bottom:1px solid var(--bc-input);background:'+bg+';cursor:pointer;padding:2px 3px;position:relative" ' +
        'onmouseover="this.style.filter=\'brightness(.93)\'" onmouseout="this.style.filter=\'\'">' +
        '<div style="font-size:.72rem;font-weight:'+(hol?'700':'400')+';color:'+fc+'">'+d+'</div>' +
        (hol ? '<div style="font-size:.52rem;color:'+fc+';line-height:1.2;overflow:hidden;max-height:18px;word-break:break-all">'+hol.name+'</div>' : '') +
      '</div>';
    }
    html += '</div></div>';
  }
  html += '</div>';
  grid.innerHTML = html;
}

function _hrCalClick(dateStr, existingName) {
  if (existingName) {
    Swal.fire({
      title: '📅 ' + dateStr.substring(0,5),
      html: '<div style="font-size:.9rem;margin-bottom:4px"><b>' + existingName + '</b></div>',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: '✏️ แก้ชื่อ',
      denyButtonText: '🗑 ลบ',
      cancelButtonText: 'ปิด',
      confirmButtonColor: '#4f46e5',
      denyButtonColor: '#ef4444',
    }).then(function(result) {
      if (result.isConfirmed) {
        Swal.fire({
          title: 'แก้ชื่อวันหยุด',
          input: 'text', inputValue: existingName,
          showCancelButton: true,
          confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก',
          confirmButtonColor: '#4f46e5',
        }).then(function(r2) {
          if (!r2.isConfirmed || !r2.value.trim()) return;
          var hol  = _hrHolidays.find(function(h){ return h.date === dateStr; });
          var type = hol ? hol.type : 'นักขัตฤกษ์';
          _hrPOST('deleteHRHoliday', { date: dateStr }).then(function() {
            return _hrPOST('seedHRHolidays', { holidays: [{ date: dateStr, name: r2.value.trim(), type: type }] });
          }).then(function() { _hrCalLoad(); });
        });
      } else if (result.isDenied) {
        Swal.fire({
          icon: 'warning', title: 'ลบวันหยุด?',
          text: dateStr.substring(0,5) + ' — ' + existingName,
          showCancelButton: true,
          confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก',
          confirmButtonColor: '#ef4444',
        }).then(function(r3) {
          if (r3.isConfirmed) _hrPOST('deleteHRHoliday', { date: dateStr }).then(function() { _hrCalLoad(); });
        });
      }
    });
  } else {
    Swal.fire({
      title: '➕ เพิ่มวันหยุด ' + dateStr.substring(0,5),
      html:
        '<input id="swal-hn" class="swal2-input" placeholder="ชื่อวันหยุด" style="margin:6px auto">' +
        '<select id="swal-ht" class="swal2-select" style="margin:6px auto;width:80%;padding:8px;border-radius:8px;border:1px solid #d1d5db">' +
          '<option value="บริษัท">บริษัท</option>' +
          '<option value="นักขัตฤกษ์">นักขัตฤกษ์</option>' +
          '<option value="ชดเชย">ชดเชย</option>' +
        '</select>',
      showCancelButton: true,
      confirmButtonText: '➕ เพิ่ม', cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#4f46e5',
      focusConfirm: false,
      preConfirm: function() {
        var n = document.getElementById('swal-hn').value.trim();
        var t = document.getElementById('swal-ht').value;
        if (!n) { Swal.showValidationMessage('กรุณาใส่ชื่อวันหยุด'); return false; }
        return { name: n, type: t };
      }
    }).then(function(result) {
      if (!result.isConfirmed) return;
      _hrPOST('seedHRHolidays', { holidays: [{ date: dateStr, name: result.value.name, type: result.value.type }] })
        .then(function() { _hrCalLoad(); });
    });
  }
}

// ── พิมพ์ปฏิทิน A4 พร้อมช่องลงนาม ──────────────────────────
function _hrCalPrint() {
  const sel = document.getElementById('hrCalYear');
  if (!sel) return;
  const beYear = parseInt(sel.value);
  const ceYear = beYear - 543;

  const yearHols = _hrHolidays.filter(function(h) {
    return String(h.date||'').endsWith('/'+beYear);
  }).sort(function(a,b) {
    var pa=a.date.split('/'), pb=b.date.split('/');
    return new Date(parseInt(pa[2])-543,parseInt(pa[1])-1,parseInt(pa[0])) -
           new Date(parseInt(pb[2])-543,parseInt(pb[1])-1,parseInt(pb[0]));
  });

  const hMap = {};
  yearHols.forEach(function(h) {
    var p = h.date.split('/');
    hMap[p[0]+'/'+p[1]] = h;
  });

  var _coCfg = {}; try { _coCfg = JSON.parse(localStorage.getItem('ptts_company_cfg') || '{}'); } catch(e){}
  var compName = _coCfg.name || localStorage.getItem('ptts_company_name') || '';

  function holBg(type) { return type==='บริษัท'?'#d1fae5':type==='ชดเชย'?'#fef3c7':'#fee2e2'; }
  function holFc(type) { return type==='บริษัท'?'#065f46':type==='ชดเชย'?'#78350f':'#991b1b'; }

  // สร้าง HTML 12 เดือน
  var monthsHtml = '';
  for (var m=1; m<=12; m++) {
    var firstDow  = new Date(ceYear,m-1,1).getDay();
    var daysInMon = new Date(ceYear,m,0).getDate();
    var mm = String(m).padStart(2,'0');

    monthsHtml += '<div class="month-box"><div class="month-hdr">'+_CAL_MONTHS[m-1]+'</div>';
    monthsHtml += '<div class="day-row">';
    _CAL_DAYS.forEach(function(d,i){
      monthsHtml += '<div class="dh" style="color:'+(i===0?'#dc2626':i===6?'#d97706':'#6b7280')+'">'+d+'</div>';
    });
    monthsHtml += '</div><div class="dates-grid">';
    for (var i=0;i<firstDow;i++) monthsHtml+='<div class="dc empty"></div>';
    for (var d=1;d<=daysInMon;d++) {
      var dow = new Date(ceYear,m-1,d).getDay();
      var dd2 = String(d).padStart(2,'0');
      var hol = hMap[dd2+'/'+mm];
      var bg  = hol ? holBg(hol.type) : (dow===0?'#fff5f5':dow===6?'#fffbeb':'#fff');
      var fc  = hol ? holFc(hol.type) : (dow===0?'#dc2626':dow===6?'#d97706':'#374151');
      monthsHtml += '<div class="dc" style="background:'+bg+';color:'+fc+';font-weight:'+(hol?'700':'400')+'">' +
        '<span>'+d+'</span>' + (hol?'<small>'+hol.name+'</small>':'') + '</div>';
    }
    monthsHtml += '</div></div>';
  }

  // รายการวันหยุดแยกประเภท
  var listHtml = '';
  var grouped = {};
  yearHols.forEach(function(h){
    if (!grouped[h.type]) grouped[h.type]=[];
    grouped[h.type].push(h);
  });
  Object.keys(grouped).forEach(function(type) {
    listHtml += '<div style="margin-bottom:6px"><b style="color:'+(type==='บริษัท'?'#065f46':type==='ชดเชย'?'#78350f':'#991b1b')+';font-size:11pt">■ '+type+'</b>';
    grouped[type].forEach(function(h) {
      listHtml += '<div style="display:flex;gap:12px;font-size:10pt;margin-left:14px;line-height:1.6">' +
        '<span style="min-width:70px">'+h.date.substring(0,5)+'</span><span>'+h.name+'</span></div>';
    });
    listHtml += '</div>';
  });

  var win = window.open('','_blank');
  if (!win) { Swal.fire('⚠️','กรุณาอนุญาต Pop-up','warning'); return; }

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>ปฏิทินวันหยุด ${beYear}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Sarabun',sans-serif;font-size:10pt;color:#1f2937;background:#fff;padding:14mm 12mm}
h1{font-size:18pt;font-weight:800;text-align:center;color:#1e3a8a;margin-bottom:2px}
.sub{text-align:center;font-size:11pt;color:#6b7280;margin-bottom:12px}
.cal-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.month-box{border:1px solid #d1d5db;border-radius:6px;overflow:hidden}
.month-hdr{background:#1e3a8a;color:#fff;text-align:center;padding:4px;font-weight:700;font-size:10pt}
.day-row,.dates-grid{display:grid;grid-template-columns:repeat(7,1fr)}
.dh{text-align:center;font-size:7.5pt;font-weight:700;padding:2px 0;background:#f3f4f6}
.dc{text-align:center;font-size:8pt;padding:2px 1px;min-height:28px;border:0.5px solid #f3f4f6;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;line-height:1.2}
.dc.empty{background:#f9fafb}
.dc small{font-size:6pt;line-height:1.1;display:block;overflow:hidden;max-height:14px;word-break:break-all}
.list-section{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px}
.sign-row{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:10px;border-top:1px solid #d1d5db;padding-top:10px}
.sign-box{text-align:center}
.sign-line{border-bottom:1px solid #374151;margin:28px 8px 4px;height:1px}
.sign-label{font-size:9pt;color:#6b7280}
@media print{body{padding:8mm 10mm}@page{size:A4;margin:0}}
</style></head><body>
<h1>ปฏิทินวันหยุดประจำปี ${beYear}</h1>
<div class="sub">${compName}${compName?' — ':''}รวม ${yearHols.length} วันหยุด</div>
<div class="cal-grid">${monthsHtml}</div>
<div class="list-section">${listHtml}</div>
<div class="sign-row">
  <div class="sign-box"><div class="sign-line"></div><div class="sign-label">ผู้จัดทำ / ฝ่าย HR</div></div>
  <div class="sign-box"><div class="sign-line"></div><div class="sign-label">ผู้ตรวจสอบ</div></div>
  <div class="sign-box"><div class="sign-line"></div><div class="sign-label">ผู้อนุมัติ / ผู้บริหาร</div></div>
</div>
<script>(function(){if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){window.focus();window.print();});}else{setTimeout(function(){window.print();},800);}})();<\/script>
</body></html>`);
  win.document.close();
}

// ══════════════════════════════════════════════════════════════
// HOLIDAY SEED — ข้อมูลวันหยุดพุทธและฟังก์ชันสร้างรายการ
// ══════════════════════════════════════════════════════════════

// วันหยุดทางพุทธศาสนา (ขึ้นอยู่กับปฏิทินจันทรคติ)
// * = ประมาณการ ควรตรวจสอบก่อนใช้งานจริง
const HR_HOLIDAY_BUDDHIST = {
  2569: [
    { m: 2, d: 20, name: 'วันมาฆบูชา' },
    { m: 5, d: 31, name: 'วันวิสาขบูชา' },
    { m: 7, d: 29, name: 'วันอาสาฬหบูชา' },
  ],
  2570: [ // 2027 CE
    { m: 3, d: 12, name: 'วันมาฆบูชา' },
    { m: 5, d: 20, name: 'วันวิสาขบูชา' },
    { m: 7, d: 18, name: 'วันอาสาฬหบูชา' },
  ],
  2571: [ // 2028 CE
    { m: 3, d:  1, name: 'วันมาฆบูชา' },
    { m: 6, d:  8, name: 'วันวิสาขบูชา' },
    { m: 8, d:  6, name: 'วันอาสาฬหบูชา' },
  ],
  2572: [ // 2029 CE
    { m: 2, d: 18, name: 'วันมาฆบูชา' },
    { m: 5, d: 28, name: 'วันวิสาขบูชา' },
    { m: 7, d: 26, name: 'วันอาสาฬหบูชา' },
  ],
  2573: [ // 2030 CE
    { m: 2, d:  7, name: 'วันมาฆบูชา' },
    { m: 5, d: 17, name: 'วันวิสาขบูชา' },
    { m: 7, d: 15, name: 'วันอาสาฬหบูชา' },
  ],
  2574: [ // 2031 CE
    { m: 2, d: 27, name: 'วันมาฆบูชา' },
    { m: 6, d:  7, name: 'วันวิสาขบูชา' },
    { m: 8, d:  4, name: 'วันอาสาฬหบูชา' },
  ],
};

// วันหยุดราชการคงที่ (วัน/เดือนเดิมทุกปี)
const HR_HOLIDAY_FIXED = [
  { m: 1,  d: 1,  name: 'วันขึ้นปีใหม่' },
  { m: 4,  d: 6,  name: 'วันจักรี' },
  { m: 4,  d: 13, name: 'วันสงกรานต์' },
  { m: 4,  d: 14, name: 'วันสงกรานต์' },
  { m: 4,  d: 15, name: 'วันสงกรานต์' },
  { m: 5,  d: 1,  name: 'วันแรงงานแห่งชาติ' },
  { m: 6,  d: 3,  name: 'วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี' },
  { m: 7,  d: 28, name: 'วันเฉลิมพระชนมพรรษา ร.10' },
  { m: 8,  d: 12, name: 'วันแม่แห่งชาติ' },
  { m: 10, d: 13, name: 'วันคล้ายวันสวรรคต ร.9' },
  { m: 10, d: 23, name: 'วันปิยมหาราช' },
  { m: 12, d: 5,  name: 'วันคล้ายวันพระบรมราชสมภพ ร.9 (วันพ่อ)' },
  { m: 12, d: 10, name: 'วันรัฐธรรมนูญ' },
  { m: 12, d: 31, name: 'วันสิ้นปี' },
];

// สร้างรายการวันหยุดของปี BE ที่ต้องการ พร้อมคำนวณวันชดเชยอัตโนมัติ
function _hrBuildHolidays(beYear) {
  var ceYear   = beYear - 543;
  var buddhist = (HR_HOLIDAY_BUDDHIST[beYear] || []).map(function(h) {
    return { m: h.m, d: h.d, name: h.name, type: 'นักขัตฤกษ์' };
  });
  var all = HR_HOLIDAY_FIXED.map(function(h) {
    return { m: h.m, d: h.d, name: h.name, type: 'นักขัตฤกษ์' };
  }).concat(buddhist);

  var used   = {};
  var result = [];

  function _push(dateObj, name, type) {
    var dd  = String(dateObj.getDate()).padStart(2, '0');
    var mm  = String(dateObj.getMonth() + 1).padStart(2, '0');
    var key = dd + '/' + mm + '/' + beYear;
    if (used[key]) return;
    used[key] = true;
    result.push({ date: key, name: name, type: type });
  }

  all.forEach(function(h) {
    var base = new Date(ceYear, h.m - 1, h.d);
    _push(base, h.name, h.type);
    var dow = base.getDay(); // 0=อาทิตย์, 6=เสาร์
    if (dow === 0) {
      // ตรงอาทิตย์ → ชดเชยจันทร์
      _push(new Date(ceYear, h.m - 1, h.d + 1), 'ชดเชย' + h.name, 'ชดเชย');
    } else if (dow === 6) {
      // ตรงเสาร์ → ชดเชยจันทร์ (+2)
      _push(new Date(ceYear, h.m - 1, h.d + 2), 'ชดเชย' + h.name, 'ชดเชย');
    }
  });

  // sort ตามวันที่
  result.sort(function(a, b) {
    var pa = a.date.split('/'), pb = b.date.split('/');
    return new Date(parseInt(pa[2]) - 543, parseInt(pa[1]) - 1, parseInt(pa[0])) -
           new Date(parseInt(pb[2]) - 543, parseInt(pb[1]) - 1, parseInt(pb[0]));
  });
  return result;
}

// ══════════════════════════════════════════════════════════════
// PANEL 4 — ตั้งค่า HR
// ══════════════════════════════════════════════════════════════
function _hrRenderSettings() {
  const p = document.getElementById('hrPanel4');
  if (!p) return;
  const s = _hrCfg();
  const roundTime = _hrOTRoundTime(s);

  p.innerHTML =
    '<div style="max-width:560px;background:var(--card);border:1px solid var(--bc-input);border-radius:14px;padding:22px 24px">' +
    '<div style="font-weight:700;font-size:.95rem;color:var(--c1);margin-bottom:16px">⚙️ กฎการคำนวณ HR</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">' +
      _hrCfgField('hrCfgStart', '⏰ เวลาเข้างาน', s.startTime, 'time') +
      _hrCfgField('hrCfgEnd',   '⏰ เวลาเลิกงาน', s.endTime,   'time') +
    '</div>' +
    '<div style="margin-bottom:12px">' +
      _hrCfgField('hrCfgGrace', '🕐 Grace สาย (นาที) — สายหลัง ' + s.startTime + '+' + s.lateGrace + ' น.', s.lateGrace, 'number') +
    '</div>' +
    '<div style="background:rgba(129,140,248,.08);border:1px solid rgba(129,140,248,.2);border-radius:10px;padding:14px;margin-bottom:12px">' +
      '<div style="font-size:.82rem;font-weight:700;color:#818cf8;margin-bottom:8px">⚡ กฎ OT</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">' +
        _hrCfgField('hrCfgOTMin', 'ออกหลัง (เริ่มนับ OT)', s.otMinTime, 'time') +
        _hrCfgField('hrCfgOTEnd', 'เวลา OT สิ้นสุด',        s.otEndTime, 'time') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        _hrCfgField('hrCfgOTMax',   'OT สูงสุด (ชม./วัน)',           s.otMaxH,   'number') +
        _hrCfgField('hrCfgOTRound', 'Round-up ก่อน OTEnd (นาที)',    s.otFullMin,'number') +
      '</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">' +
      _hrCfgField('hrCfgSun', '☀️ อัตราวันอาทิตย์ (×)', s.sunRate, 'number') +
      _hrCfgField('hrCfgSat', '📅 อัตราวันเสาร์ (×)',    s.satRate, 'number') +
    '</div>' +
    '<button onclick="hrSaveSettings()" style="width:100%;padding:11px;background:var(--c1);color:#fff;border:none;border-radius:10px;font-family:\'Sarabun\',sans-serif;font-size:.9rem;font-weight:700;cursor:pointer">💾 บันทึกการตั้งค่า</button>' +
    '<div style="margin-top:12px;padding:10px 12px;background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.15);border-radius:8px;font-size:.76rem;color:var(--t3);line-height:1.7">' +
      '<b style="color:#34d399">ตัวอย่างกฎ OT ปัจจุบัน:</b><br>' +
      '• ออกก่อน ' + s.otMinTime + ' → ไม่มี OT<br>' +
      '• ' + s.otMinTime + ' – ' + roundTime + ' → OT = เวลาออก − ' + s.endTime + '<br>' +
      '• ออก ≥ ' + roundTime + ' → OT เต็ม ' + s.otMaxH + ' ชม.<br>' +
      '• วันอาทิตย์ → ทุกชม.ที่ทำงาน × ' + s.sunRate +
    '</div>' +
    '</div>' +

    // ── การ์ดจัดการวันหยุด ─────────────────────────────────────────
    '<div style="max-width:560px;margin-top:16px;background:var(--card);border:1px solid var(--bc-input);border-radius:14px;padding:22px 24px">' +
      '<div style="font-weight:700;font-size:.95rem;color:var(--c1);margin-bottom:4px">📅 วันหยุดราชการ</div>' +
      '<div style="font-size:.76rem;color:var(--t3);margin-bottom:14px">สร้างรายการวันหยุดประจำปีลงใน Sheet HR_Holidays — ข้ามวันที่ซ้ำอัตโนมัติ</div>' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
        '<label style="font-size:.82rem;color:var(--t2)">เลือกปี:</label>' +
        '<select id="hrHolYear" onchange="_hrHolPreview()" style="padding:7px 12px;border-radius:8px;border:1px solid var(--bc-input);background:var(--bg);color:var(--t1);font-family:\'Sarabun\',sans-serif;font-size:.85rem">' +
          [2569,2570,2571,2572,2573,2574].map(function(y) {
            return '<option value="' + y + '">' + y + ' (' + (y-543) + ')</option>';
          }).join('') +
        '</select>' +
        '<button onclick="hrSeedHolidays()" style="padding:8px 18px;background:var(--c1);color:#fff;border:none;border-radius:8px;font-family:\'Sarabun\',sans-serif;font-size:.85rem;font-weight:700;cursor:pointer">✅ สร้างวันหยุด</button>' +
      '</div>' +
      '<div id="hrHolPreviewBox" style="max-height:260px;overflow-y:auto;border:1px solid var(--bc-input);border-radius:8px;padding:8px 4px">' +
        _hrHolPreviewHtml(2569) +
      '</div>' +
      '<div style="margin-top:8px;font-size:.7rem;color:var(--t3)">⚠️ วันหยุดพุทธ (มาฆบูชา/วิสาขบูชา/อาสาฬหบูชา) เป็นข้อมูลประมาณการ ควรตรวจสอบกับปฏิทินราชการก่อนใช้จริง</div>' +
    '</div>' +

    // ── การ์ดรอบการจ่ายเงินเดือน ─────────────────────────────────
    _hrPayCycleCard() +

    // ── การ์ด Master PIN ─────────────────────────────────────────
    '<div style="max-width:560px;margin-top:16px;background:var(--card);border:1px solid var(--bc-input);border-radius:14px;padding:22px 24px">' +
      '<div style="font-weight:700;font-size:.95rem;color:var(--c1);margin-bottom:4px">🔐 Master PIN (ผู้จัดการ)</div>' +
      '<div style="font-size:.76rem;color:var(--t3);margin-bottom:14px">PIN นี้ใช้สำหรับผู้จัดการ/เจ้าของเข้าระบบเบิก/กู้ — สามารถดูและอนุมัติคำขอของพนักงานทุกคน</div>' +
      '<div style="display:flex;gap:10px;align-items:center">' +
        '<input id="hrMasterPinInput" type="password" maxlength="8" placeholder="ตั้ง Master PIN" ' +
          'style="flex:1;padding:9px 12px;border:1px solid var(--bc-input);border-radius:8px;background:var(--bg2);color:var(--t1);font-family:\'Sarabun\',sans-serif;font-size:.9rem" ' +
          'value="' + (localStorage.getItem('ptts_hr_master_pin') ? '••••' : '') + '">' +
        '<button onclick="hrSaveMasterPin()" style="padding:9px 18px;background:var(--c1);color:#fff;border:none;border-radius:8px;font-family:\'Sarabun\',sans-serif;font-size:.88rem;font-weight:700;cursor:pointer">💾 บันทึก</button>' +
      '</div>' +
      (localStorage.getItem('ptts_hr_master_pin')
        ? '<div style="margin-top:8px;font-size:.76rem;color:#059669">✅ ตั้ง Master PIN ไว้แล้ว</div>'
        : '<div style="margin-top:8px;font-size:.76rem;color:#d97706">⚠️ ยังไม่ได้ตั้ง Master PIN</div>') +
    '</div>' +

    '</div>';
}

// ── สร้าง HTML preview รายการวันหยุด ─────────────────────────
function _hrHolPreviewHtml(beYear) {
  var list = _hrBuildHolidays(beYear);
  if (!list.length) return '<div style="padding:8px 12px;font-size:.8rem;color:var(--t3)">ไม่มีข้อมูล</div>';
  var TYPE_COLOR = { 'นักขัตฤกษ์': '#818cf8', 'ชดเชย': '#f59e0b' };
  return list.map(function(h) {
    var c = TYPE_COLOR[h.type] || 'var(--t3)';
    return '<div style="display:flex;align-items:center;gap:8px;padding:4px 10px;border-bottom:1px solid var(--bc-input)">' +
      '<span style="font-size:.78rem;color:var(--t3);min-width:68px">' + h.date.substring(0, 5) + '</span>' +
      '<span style="font-size:.8rem;color:var(--t1);flex:1">' + h.name + '</span>' +
      '<span style="font-size:.7rem;color:' + c + ';font-weight:600">' + h.type + '</span>' +
    '</div>';
  }).join('');
}

// เรียกเมื่อเปลี่ยน dropdown ปี
function _hrHolPreview() {
  var sel = document.getElementById('hrHolYear');
  var box = document.getElementById('hrHolPreviewBox');
  if (!sel || !box) return;
  box.innerHTML = _hrHolPreviewHtml(parseInt(sel.value));
}

// ── UI การ์ดรอบการจ่ายเงินเดือน ────────────────────────────────
function _hrPayCycleCard() {
  var pc = _hrPayCfg();
  var isSemi = pc.mode === 'semi';
  function dayInput(id, val) {
    return '<input id="'+id+'" type="number" min="1" max="31" value="'+val+'" style="width:56px;padding:6px 8px;border-radius:7px;border:1px solid var(--bc-input);background:var(--bg);color:var(--t1);font-family:\'Sarabun\',sans-serif;text-align:center">';
  }
  return '<div style="max-width:560px;margin-top:16px;background:var(--card);border:1px solid var(--bc-input);border-radius:14px;padding:22px 24px">' +
    '<div style="font-weight:700;font-size:.95rem;color:var(--c1);margin-bottom:4px">💰 รอบการจ่ายเงินเดือน</div>' +
    '<div style="font-size:.76rem;color:var(--t3);margin-bottom:14px">กำหนดช่วงวันทำงานและวันจ่ายแต่ละงวด — ใช้สำหรับกรองข้อมูลสรุปและสลิปเงินเดือน</div>' +
    // mode selector
    '<div style="display:flex;gap:10px;margin-bottom:16px">' +
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 16px;border-radius:9px;border:2px solid '+(isSemi?'var(--c1)':'var(--bc-input)')+';background:'+(isSemi?'rgba(99,102,241,.1)':'transparent')+'">' +
        '<input type="radio" name="hrPayMode" value="semi" '+(isSemi?'checked':'')+' onchange="hrPayModeChange(this)" style="accent-color:var(--c1)">' +
        '<span style="font-size:.85rem;font-weight:700;color:var(--t1)">ครึ่งเดือน (2 งวด)</span>' +
      '</label>' +
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 16px;border-radius:9px;border:2px solid '+(!isSemi?'var(--c1)':'var(--bc-input)')+';background:'+(!isSemi?'rgba(99,102,241,.1)':'transparent')+'">' +
        '<input type="radio" name="hrPayMode" value="monthly" '+(!isSemi?'checked':'')+' onchange="hrPayModeChange(this)" style="accent-color:var(--c1)">' +
        '<span style="font-size:.85rem;font-weight:700;color:var(--t1)">รายเดือน (1 งวด)</span>' +
      '</label>' +
    '</div>' +
    // period detail (show only if semi)
    '<div id="hrPaySemiDetail" style="display:'+(isSemi?'block':'none')+'">' +
      // งวด 1
      '<div style="background:rgba(99,102,241,.06);border:1px solid rgba(99,102,241,.18);border-radius:10px;padding:14px;margin-bottom:10px">' +
        '<div style="font-size:.8rem;font-weight:700;color:#818cf8;margin-bottom:10px">📌 งวดที่ 1 — จ่ายวันที่ 1 (เดือนถัดไป)</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.83rem;color:var(--t2)">' +
          'ช่วงทำงาน: วันที่ ' + dayInput('hrPayP1Start', pc.p1.start) +
          ' <span>ถึง</span> วันที่ ' + dayInput('hrPayP1End', pc.p1.end) +
          ' &nbsp;|&nbsp; จ่ายวันที่ ' + dayInput('hrPayP1Day', pc.p1.payday) + ' (เดือนถัดไป)' +
        '</div>' +
      '</div>' +
      // งวด 2
      '<div style="background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.18);border-radius:10px;padding:14px;margin-bottom:10px">' +
        '<div style="font-size:.8rem;font-weight:700;color:#34d399;margin-bottom:10px">📌 งวดที่ 2 — จ่ายวันที่ 16 (เดือนนี้)</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.83rem;color:var(--t2)">' +
          'ช่วงทำงาน: วันที่ ' + dayInput('hrPayP2Start', pc.p2.start) + ' (เดือนก่อน)' +
          ' <span>ถึง</span> วันที่ ' + dayInput('hrPayP2End', pc.p2.end) + ' (เดือนนี้)' +
          ' &nbsp;|&nbsp; จ่ายวันที่ ' + dayInput('hrPayP2Day', pc.p2.payday) +
        '</div>' +
      '</div>' +
      '<div style="font-size:.72rem;color:var(--t3);margin-bottom:10px">💡 ตัวอย่าง: วันที่ 1 ม.ค. = จ่ายเงินสำหรับ 11-25 ธ.ค. | วันที่ 16 ม.ค. = จ่ายเงินสำหรับ 26 ธ.ค. – 10 ม.ค.</div>' +
    '</div>' +
    '<button onclick="hrSavePayCfg()" style="width:100%;padding:10px;background:var(--c1);color:#fff;border:none;border-radius:9px;font-family:\'Sarabun\',sans-serif;font-size:.88rem;font-weight:700;cursor:pointer">💾 บันทึกรอบการจ่าย</button>' +
  '</div>';
}

function hrPayModeChange(el) {
  var d = document.getElementById('hrPaySemiDetail');
  if (d) d.style.display = el.value === 'semi' ? 'block' : 'none';
  // อัปเดต border ของ label
  var labels = document.querySelectorAll('label[style*="hrPayMode"]');
  document.querySelectorAll('input[name="hrPayMode"]').forEach(function(r) {
    var lbl = r.parentElement;
    if (r.checked) {
      lbl.style.border = '2px solid var(--c1)';
      lbl.style.background = 'rgba(99,102,241,.1)';
    } else {
      lbl.style.border = '2px solid var(--bc-input)';
      lbl.style.background = 'transparent';
    }
  });
}

function hrSavePayCfg() {
  var modeEl = document.querySelector('input[name="hrPayMode"]:checked');
  var g = function(id) { var el = document.getElementById(id); return el ? parseInt(el.value) || 0 : 0; };
  var cfg = {
    mode: modeEl ? modeEl.value : 'semi',
    p1: { start: g('hrPayP1Start') || 11, end: g('hrPayP1End') || 25, payday: g('hrPayP1Day') || 1 },
    p2: { start: g('hrPayP2Start') || 26, end: g('hrPayP2End') || 10, payday: g('hrPayP2Day') || 16 },
  };
  localStorage.setItem(HR_PAY_LS, JSON.stringify(cfg));
  Swal.fire({ icon: 'success', title: '💾 บันทึกรอบการจ่ายแล้ว', timer: 1200, showConfirmButton: false });
}

// กดปุ่ม "สร้างวันหยุด" → POST ไปบันทึก
function hrSeedHolidays() {
  var sel = document.getElementById('hrHolYear');
  if (!sel) return;
  var beYear   = parseInt(sel.value);
  var holidays = _hrBuildHolidays(beYear);
  if (!holidays.length) return;

  Swal.fire({ title: '⏳ กำลังสร้างวันหยุดปี ' + beYear + '...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });

  _hrPOST('seedHRHolidays', { holidays: holidays })
    .then(function(r) {
      Swal.fire({
        icon: 'success',
        title: '✅ สร้างวันหยุดปี ' + beYear + ' แล้ว',
        html: 'เพิ่ม <b style="color:#34d399">' + (r.added || 0) + ' วัน</b>' +
              (r.skipped ? ' | ข้าม <b style="color:#94a3b8">' + r.skipped + ' วัน</b> (มีอยู่แล้ว)' : ''),
        confirmButtonColor: '#4f46e5',
      });
      // อัปเดต _hrHolidays cache
      _hrGET('getHRHolidays').then(function(res) { _hrHolidays = res.data || []; });
    })
    .catch(function(e) { Swal.fire('❌ ผิดพลาด', String(e), 'error'); });
}


function _hrCfgField(id, label, value, type) {
  return '<div><label style="font-size:.76rem;color:var(--t3);display:block;margin-bottom:4px">' + label + '</label>' +
    '<input id="' + id + '" type="' + type + '" value="' + value + '" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--bc-input);background:var(--bg);color:var(--t1);font-family:\'Sarabun\',sans-serif;box-sizing:border-box"></div>';
}

function hrSaveSettings() {
  const g = function(id) { const el = document.getElementById(id); return el ? el.value : ''; };
  _hrS = {
    startTime: g('hrCfgStart') || HR_DEF.startTime,
    endTime:   g('hrCfgEnd')   || HR_DEF.endTime,
    lateGrace: parseInt(g('hrCfgGrace'))   || HR_DEF.lateGrace,
    otMinTime: g('hrCfgOTMin') || HR_DEF.otMinTime,
    otEndTime: g('hrCfgOTEnd') || HR_DEF.otEndTime,
    otMaxH:    parseFloat(g('hrCfgOTMax'))   || HR_DEF.otMaxH,
    otFullMin: parseInt(g('hrCfgOTRound'))   || HR_DEF.otFullMin,
    sunRate:   parseFloat(g('hrCfgSun'))    || HR_DEF.sunRate,
    satRate:   parseFloat(g('hrCfgSat'))    || HR_DEF.satRate,
  };
  _hrSaveS();
  Swal.fire({ icon: 'success', title: '💾 บันทึกแล้ว', timer: 1200, showConfirmButton: false });
  setTimeout(_hrRenderSettings, 1300); // re-render ตัวอย่าง
}

// ══════════════════════════════════════════════════════════════
// ATT REPORT — รายงานการเข้างานรายบุคคล
// ══════════════════════════════════════════════════════════════
function hrPrintAttReport(empId, month, period) {
  var emp  = (_hrEmps || []).find(function(e) { return String(e.empId) === String(empId); }) || {};
  var name = emp.name || empId;
  var dept = emp.dept || '';

  // ดึง attendance ของ employee นี้ในช่วงที่เลือก
  var allRecs = (_hrAtt || []).filter(function(r) { return String(r.empId) === String(empId); });
  var recs    = _hrFilterByPeriod(allRecs, period || 'all', month);

  // เรียงตามวันที่
  recs = recs.slice().sort(function(a, b) {
    var pa = String(a.date).split('/'), pb = String(b.date).split('/');
    var da = new Date(parseInt(pa[2]) < 2500 ? parseInt(pa[2]) : parseInt(pa[2])-543, parseInt(pa[1])-1, parseInt(pa[0]));
    var db = new Date(parseInt(pb[2]) < 2500 ? parseInt(pb[2]) : parseInt(pb[2])-543, parseInt(pb[1])-1, parseInt(pb[0]));
    return da - db;
  });

  // ป้ายสถานะ
  var ST_LABEL = { present: 'มา', absent: 'ขาด', off: 'หยุด/ลา', holiday: 'วันหยุด' };
  var ST_COLOR = { present: '#16a34a', absent: '#dc2626', off: '#9333ea', holiday: '#0891b2' };
  var DOW_TH   = ['อา','จ','อ','พ','พฤ','ศ','ส'];

  // คำนวณ summary
  var totPresent = 0, totAbsent = 0, totOff = 0, totLate = 0, totLateMin = 0;
  var totOtWD = 0, totOtSun = 0;
  recs.forEach(function(r) {
    var st = r.status || 'present';
    if (st === 'present') totPresent++;
    else if (st === 'absent') totAbsent++;
    else totOff++;
    if ((parseFloat(r.lateMin) || 0) > 0) { totLate++; totLateMin += parseFloat(r.lateMin)||0; }
    var ot = parseFloat(r.otHours) || 0;
    if (ot > 0) { if ((parseFloat(r.otRate)||1) >= 2) totOtSun += ot; else totOtWD += ot; }
  });

  // ชื่อบริษัท
  var coName = '';
  try { coName = (JSON.parse(localStorage.getItem('ptts_company_cfg') || '{}')).name || ''; } catch(e) {}

  // ป้ายงวด
  var pc = _hrPayCfg();
  var periodLabel = '';
  if (period === 'p1') periodLabel = 'งวด 1 ('+pc.p1.start+'–'+pc.p1.end+' '+_hrMLab(month)+')';
  else if (period === 'p2') periodLabel = 'งวด 2 ('+pc.p2.start+' '+(function(){var mp=month.split('-').map(Number);var pM=mp[1]===1?12:mp[1]-1,pY=mp[1]===1?mp[0]-1:mp[0];return _hrMLab(pY+'-'+String(pM).padStart(2,'0'));})()+'–'+pc.p2.end+' '+_hrMLab(month)+')';
  else periodLabel = 'ทั้งเดือน '+_hrMLab(month);

  // สร้าง HTML ตาราง
  var rows = '';
  recs.forEach(function(r) {
    var st    = r.status || 'present';
    var stLbl = ST_LABEL[st] || st;
    var stCol = ST_COLOR[st] || '#333';
    var dow   = DOW_TH[parseInt(r.dow) || 0] || '';
    var lm    = parseFloat(r.lateMin) || 0;
    var ot    = parseFloat(r.otHours) || 0;
    var otRate= parseFloat(r.otRate)  || 1;
    var lateCell  = lm > 0 ? '<span style="color:#b45309;font-weight:700">'+lm+' นาที</span>' : '<span style="color:#aaa">—</span>';
    var otCell    = ot > 0
      ? '<span style="color:'+(otRate>=2?'#d97706':'#6366f1')+';font-weight:700">'+ot.toFixed(1)+'h'+(otRate>=2?' (×2)':'')+' </span>'
      : '<span style="color:#aaa">—</span>';
    var noteCell  = r.otNote ? '<div style="font-size:.72rem;color:#888;margin-top:2px">'+r.otNote+'</div>' : '';
    rows += '<tr>' +
      '<td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap">'+r.date+'</td>' +
      '<td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:700;color:'+(dow==='อา'||dow==='ส'?'#9333ea':'#374151')+'">'+dow+'</td>' +
      '<td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:'+stCol+';font-weight:700">'+stLbl+'</td>' +
      '<td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:.82rem">'+(r.clockIn||'—')+'</td>' +
      '<td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:.82rem">'+(r.lastScan||'—')+'</td>' +
      '<td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:center">'+lateCell+'</td>' +
      '<td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:center">'+otCell+noteCell+'</td>' +
    '</tr>';
  });

  var printDate = (function() {
    var now = new Date();
    return ('0'+now.getDate()).slice(-2)+'/'+('0'+(now.getMonth()+1)).slice(-2)+'/'+(now.getFullYear()+543);
  })();

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<title>รายงานการเข้างาน — '+name+'</title>' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">' +
    '<style>' +
      'body{font-family:\'Sarabun\',sans-serif;margin:0;padding:20mm 15mm;font-size:13pt;color:#111}' +
      'h1{font-size:16pt;margin:0 0 2px;color:#1e3a5f}' +
      'h2{font-size:13pt;margin:0 0 12px;color:#374151;font-weight:600}' +
      '.co{font-size:11pt;color:#555;margin-bottom:14px}' +
      '.info-row{display:flex;gap:24px;flex-wrap:wrap;margin-bottom:14px;border:1px solid #e5e7eb;border-radius:8px;padding:10px 16px;background:#f9fafb}' +
      '.info-item{display:flex;flex-direction:column;gap:2px}' +
      '.info-label{font-size:.72rem;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px}' +
      '.info-val{font-size:1rem;font-weight:700;color:#111}' +
      'table{width:100%;border-collapse:collapse}' +
      'thead tr{background:#1e3a5f;color:#fff}' +
      'th{padding:7px 8px;text-align:center;font-size:.78rem;font-weight:700;letter-spacing:.3px}' +
      'th:first-child{text-align:left}' +
      'tbody tr:nth-child(even){background:#f8fafc}' +
      '.summary{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px;border-top:2px solid #1e3a5f;padding-top:14px}' +
      '.sum-box{flex:1;min-width:90px;text-align:center;background:#f0f4ff;border-radius:8px;padding:8px 10px}' +
      '.sum-num{font-size:1.4rem;font-weight:700}' +
      '.sum-lbl{font-size:.72rem;color:#555;margin-top:2px}' +
      '.foot{margin-top:20px;text-align:right;font-size:.75rem;color:#aaa}' +
      '@media print{body{padding:10mm 10mm}@page{size:A4;margin:10mm}}' +
    '</style></head><body>' +
    (coName ? '<div class="co">'+coName+'</div>' : '') +
    '<h1>รายงานการเข้างาน</h1>' +
    '<h2>'+periodLabel+'</h2>' +
    '<div class="info-row">' +
      '<div class="info-item"><span class="info-label">พนักงาน</span><span class="info-val">'+name+'</span></div>' +
      '<div class="info-item"><span class="info-label">รหัส</span><span class="info-val">'+empId+'</span></div>' +
      (dept ? '<div class="info-item"><span class="info-label">แผนก</span><span class="info-val">'+dept+'</span></div>' : '') +
    '</div>' +
    '<table><thead><tr>' +
      '<th style="text-align:left">วันที่</th>' +
      '<th>วัน</th>' +
      '<th>สถานะ</th>' +
      '<th>เวลาเข้า</th>' +
      '<th>เวลาออก</th>' +
      '<th>สาย</th>' +
      '<th>OT</th>' +
    '</tr></thead><tbody>' +
    (rows || '<tr><td colspan="7" style="text-align:center;padding:20px;color:#aaa">ไม่พบข้อมูล</td></tr>') +
    '</tbody></table>' +
    '<div class="summary">' +
      '<div class="sum-box"><div class="sum-num" style="color:#16a34a">'+totPresent+'</div><div class="sum-lbl">วันที่มา</div></div>' +
      '<div class="sum-box"><div class="sum-num" style="color:#dc2626">'+totAbsent+'</div><div class="sum-lbl">ขาด</div></div>' +
      '<div class="sum-box"><div class="sum-num" style="color:#9333ea">'+totOff+'</div><div class="sum-lbl">หยุด/ลา</div></div>' +
      '<div class="sum-box"><div class="sum-num" style="color:#b45309">'+totLate+'</div><div class="sum-lbl">มาสาย ('+totLateMin+' นาที)</div></div>' +
      '<div class="sum-box"><div class="sum-num" style="color:#6366f1">'+totOtWD.toFixed(1)+'</div><div class="sum-lbl">OT ปกติ (ชม.)</div></div>' +
      '<div class="sum-box"><div class="sum-num" style="color:#d97706">'+totOtSun.toFixed(1)+'</div><div class="sum-lbl">OT อาทิตย์ (ชม.)</div></div>' +
    '</div>' +
    '<div class="foot">พิมพ์: '+printDate+'</div>' +
    '<script>(function(){' +
      'function go(){try{window.focus();window.print();}catch(e){}}' +
      'if(document.fonts&&document.fonts.ready){document.fonts.ready.then(go).catch(function(){setTimeout(go,700);});}else{setTimeout(go,700);}' +
    '})();<\/script></body></html>';

  var win = window.open('', '_blank');
  if (!win) { Swal.fire('⚠️', 'กรุณาอนุญาต Popup แล้วลองใหม่', 'warning'); return; }
  win.document.write(html);
  win.document.close();
}

// ══════════════════════════════════════════════════════════════
// EDIT ATT — แก้ไขเวลาทำงานหลัง save
// ══════════════════════════════════════════════════════════════
function hrEditAtt(empId, month, period) {
  var emp  = (_hrEmps || []).find(function(e) { return String(e.empId) === String(empId); }) || {};
  var name = emp.name || empId;

  // ดึงและเรียงข้อมูลของ employee นี้ในงวดที่เลือก
  var allRecs = (_hrAtt || []).filter(function(r) { return String(r.empId) === String(empId); });
  var recs    = _hrFilterByPeriod(allRecs, period || 'all', month).slice().sort(function(a, b) {
    var pa = String(a.date).split('/'), pb = String(b.date).split('/');
    var toTs = function(p) { return new Date(parseInt(p[2])<2500?parseInt(p[2]):parseInt(p[2])-543, parseInt(p[1])-1, parseInt(p[0])).getTime(); };
    return toTs(pa) - toTs(pb);
  });

  if (!recs.length) { Swal.fire('ℹ️', 'ไม่พบข้อมูลในงวดนี้', 'info'); return; }

  var DOW_TH = ['อา','จ','อ','พ','พฤ','ศ','ส'];

  // สร้างแถวใน popup
  var tableRows = recs.map(function(r, i) {
    var dowIdx = parseInt(r.dow) || 0;
    var dow    = DOW_TH[dowIdx] || '';
    var isSun  = dowIdx === 0;  // อาทิตย์
    var isSat  = dowIdx === 6;  // เสาร์
    // วันอาทิตย์ → บังคับ วันหยุด
    var effStatus = isSun ? 'holiday' : (r.status || 'present');

    // สีพื้นแถว + เส้นซ้าย (เข้มขึ้น มองเห็นชัด)
    var rowStyle = 'border-top:1px solid #e5e7eb;';
    if (isSun) {
      rowStyle = 'border-top:1px solid #c4b5fd;background:#ede9fe;border-left:4px solid #7c3aed;';
    } else if (isSat) {
      rowStyle = 'border-top:1px solid #c7d2fe;background:#e0e7ff;border-left:4px solid #6366f1;';
    } else if (effStatus === 'absent') {
      rowStyle = 'border-top:1px solid #fca5a5;background:#fee2e2;border-left:4px solid #dc2626;';
    } else if (effStatus === 'off') {
      rowStyle = 'border-top:1px solid #d8b4fe;background:#f3e8ff;border-left:4px solid #9333ea;';
    } else if ((parseFloat(r.lateMin)||0) > 0) {
      rowStyle = 'border-top:1px solid #fcd34d;background:#fef9c3;border-left:4px solid #d97706;';
    }

    // สีตัวอักษรวันที่
    var dateTxtCol = (isSun||isSat) ? '#4338ca' : '#374151';

    // input disabled สำหรับวันอาทิตย์
    var disabledAttr = isSun
      ? ' disabled style="width:90px;padding:3px 4px;border:1px solid #c4b5fd;border-radius:5px;background:#ede9fe;font-family:\'Sarabun\',sans-serif;font-size:.8rem;color:#9ca3af"'
      : ' style="width:90px;padding:3px 4px;border:1px solid #d1d5db;border-radius:5px;font-family:\'Sarabun\',sans-serif;font-size:.8rem"';

    // สี select สถานะ
    var selStyle = 'width:100px;padding:3px 4px;border-radius:5px;font-family:\'Sarabun\',sans-serif;font-size:.8rem;font-weight:700;';
    if (isSun)                   selStyle += 'border:1px solid #c4b5fd;background:#ddd6fe;color:#5b21b6;';
    else if (effStatus==='absent') selStyle += 'border:1px solid #f87171;background:#fee2e2;color:#b91c1c;';
    else if (effStatus==='off')    selStyle += 'border:1px solid #c084fc;background:#f3e8ff;color:#7e22ce;';
    else                           selStyle += 'border:1px solid #d1d5db;background:#fff;color:#111827;font-weight:400;';

    return '<tr style="' + rowStyle + '">' +
      '<td style="padding:5px 6px;white-space:nowrap;font-size:.82rem;color:' + dateTxtCol + ';font-weight:700">' +
        r.date + ' <span style="font-size:.76rem;font-weight:700;color:' + ((isSun||isSat)?'#4338ca':'#6b7280') + '">' + dow + '</span>' +
        (isSun ? ' <span style="font-size:.68rem;background:#7c3aed;color:#fff;padding:1px 6px;border-radius:4px;margin-left:4px">วันหยุด</span>' : '') +
      '</td>' +
      '<td style="padding:4px 4px">' +
        '<select id="eat_st_'+i+'" ' + (isSun?'disabled ':'') + 'style="'+selStyle+'">' +
          '<option value="present"'+(effStatus==='present'?' selected':'')+'>มา</option>' +
          '<option value="absent"'+(effStatus==='absent'?' selected':'')+'>ขาด</option>' +
          '<option value="off"'+(effStatus==='off'?' selected':'')+'>หยุด/ลา</option>' +
          '<option value="holiday"'+(effStatus==='holiday'?' selected':'')+'>วันหยุด</option>' +
        '</select>' +
      '</td>' +
      '<td style="padding:4px 4px"><input id="eat_ci_'+i+'" type="time" value="'+(r.clockIn||'')+'"' + disabledAttr + '></td>' +
      '<td style="padding:4px 4px"><input id="eat_ls_'+i+'" type="time" value="'+(r.lastScan||'')+'"' + disabledAttr + '></td>' +
      '<td style="padding:4px 4px"><input id="eat_lm_'+i+'" type="number" min="0" value="'+(r.lateMin||0)+'" ' + (isSun?'disabled ':'') + 'style="width:60px;padding:3px 4px;border:1px solid #d1d5db;border-radius:5px;font-family:\'Sarabun\',sans-serif;font-size:.8rem;text-align:center"></td>' +
      '<td style="padding:4px 4px"><input id="eat_ot_'+i+'" type="number" min="0" step="0.5" value="'+(r.otHours||0)+'" style="width:60px;padding:3px 4px;border:1px solid #d1d5db;border-radius:5px;font-family:\'Sarabun\',sans-serif;font-size:.8rem;text-align:center"></td>' +
      '<td style="padding:4px 4px"><input id="eat_on_'+i+'" type="text" value="'+(r.otNote||'')+'" placeholder="หมายเหตุ OT" style="width:100px;padding:3px 4px;border:1px solid #d1d5db;border-radius:5px;font-family:\'Sarabun\',sans-serif;font-size:.78rem"></td>' +
    '</tr>';
  }).join('');

  var popHtml =
    '<div style="font-family:\'Sarabun\',sans-serif;font-size:.85rem">' +
    '<div style="font-weight:700;font-size:1rem;color:#1e3a5f;margin-bottom:10px">✏️ แก้ไขเวลางาน — ' + name + '</div>' +
    '<div style="overflow-x:auto;max-height:65vh;overflow-y:auto">' +
    '<table style="width:100%;border-collapse:collapse;min-width:580px">' +
    '<thead><tr style="background:#1e3a5f;color:#fff;position:sticky;top:0;z-index:1">' +
      '<th style="padding:6px 6px;text-align:left;font-size:.76rem">วันที่</th>' +
      '<th style="padding:6px 4px;font-size:.76rem">สถานะ</th>' +
      '<th style="padding:6px 4px;font-size:.76rem">เข้า</th>' +
      '<th style="padding:6px 4px;font-size:.76rem">ออก</th>' +
      '<th style="padding:6px 4px;font-size:.76rem">สาย(น.)</th>' +
      '<th style="padding:6px 4px;font-size:.76rem">OT(ชม.)</th>' +
      '<th style="padding:6px 4px;font-size:.76rem">หมายเหตุ OT</th>' +
    '</tr></thead>' +
    '<tbody>' + tableRows + '</tbody>' +
    '</table></div></div>';

  Swal.fire({
    title: '',
    html: popHtml,
    width: '780px',
    showCancelButton: true,
    confirmButtonText: '💾 บันทึก',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#4f46e5',
    focusConfirm: false,
    preConfirm: function() {
      // รวบ rows ที่แก้แล้ว
      var updated = recs.map(function(r, i) {
        var dowIdx = parseInt(r.dow) || 0;
        var isSun  = dowIdx === 0;
        var stEl   = document.getElementById('eat_st_'+i);
        var ciEl   = document.getElementById('eat_ci_'+i);
        var lsEl   = document.getElementById('eat_ls_'+i);
        var lmEl   = document.getElementById('eat_lm_'+i);
        return Object.assign({}, r, {
          status:   isSun ? 'holiday' : (stEl ? stEl.value : r.status),
          clockIn:  isSun ? '' : (ciEl ? ciEl.value : r.clockIn),
          lastScan: isSun ? '' : (lsEl ? lsEl.value : r.lastScan),
          lateMin:  isSun ? 0  : (parseFloat(lmEl ? lmEl.value : 0) || 0),
          otHours:  parseFloat(document.getElementById('eat_ot_'+i).value) || 0,
          otNote:   document.getElementById('eat_on_'+i).value.trim(),
        });
      });
      return updated;
    }
  }).then(function(result) {
    if (!result.isConfirmed) return;
    var updatedRows = result.value;
    Swal.fire({ title: '⏳ กำลังบันทึก...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });
    _hrPOST('saveHRAttendance', { rows: updatedRows }).then(function(r) {
      Swal.close();
      if (r.status === 'ok') {
        // อัปเดต _hrAtt ใน memory ด้วย
        updatedRows.forEach(function(ur) {
          var idx = _hrAtt.findIndex(function(a) { return String(a.empId)===String(ur.empId) && a.date===ur.date; });
          if (idx >= 0) _hrAtt[idx] = ur; else _hrAtt.push(ur);
        });
        Swal.fire({ icon:'success', title:'✅ บันทึกสำเร็จ', text:'อัปเดต '+updatedRows.length+' รายการ', timer:1600, showConfirmButton:false })
          .then(function() { _hrLoadAndRender(); });
      } else {
        Swal.fire('❌ ผิดพลาด', r.message || 'ไม่ทราบสาเหตุ', 'error');
      }
    }).catch(function(e) { Swal.close(); Swal.fire('❌ Error', String(e), 'error'); });
  });
}

// ══════════════════════════════════════════════════════════════
// PAYSLIP — สลิปเงินเดือน
// ══════════════════════════════════════════════════════════════
function hrOpenPayslip(empId, month, period) {
  period = period || 'all';
  const emp     = _hrEmps.find(function(e) { return String(e.empId) === String(empId); });
  // รวบรวม att ทั้งหมดของพนักงานที่โหลดไว้ (อาจมีหลายเดือนถ้า p2)
  const allAtt  = _hrAtt.filter(function(r) { return String(r.empId) === String(empId); });
  const att     = _hrFilterByPeriod(allAtt, period, month);

  if (!att.length) {
    Swal.fire('⚠️', 'ไม่พบข้อมูลเวลางานของพนักงานนี้ในงวดที่เลือก — กรุณาโหลดข้อมูลก่อน', 'warning');
    return;
  }

  const payslip = _hrCalcPayslip(emp, att, month, period);
  const html    = _hrSlipHtml(payslip);

  const win = window.open('', '_blank');
  if (!win) { Swal.fire('❌', 'ไม่สามารถเปิดหน้าต่างได้ — กรุณาอนุญาต popup', 'error'); return; }
  win.document.write(html);
  win.document.close();
}

function _hrCalcPayslip(emp, att, month, period) {
  period = period || 'all';
  const pc        = _hrPayCfg();
  const empCycle  = (emp && emp.payCycle) || 'default';
  const isSemi    = empCycle === 'semi' || (empCycle === 'default' && pc.mode === 'semi');
  const isPeriod  = isSemi && (period === 'p1' || period === 'p2');

  const workDays  = att.filter(function(r) { return r.status !== 'off'; }).length;
  const present   = att.filter(function(r) { return r.status === 'present'; }).length;
  const absent    = att.filter(function(r) { return r.status === 'absent'; }).length;
  const lateRows  = att.filter(function(r) { return (parseInt(r.lateMin) || 0) > 0; });
  const lateTimes = lateRows.length;
  const lateMins  = lateRows.reduce(function(a, r) { return a + (parseInt(r.lateMin) || 0); }, 0);

  let otWDH = 0, otSunH = 0;
  att.forEach(function(r) {
    const ot   = parseFloat(r.otHours) || 0;
    const rate = parseFloat(r.otRate)  || 1;
    if (rate >= 2) otSunH += ot; else otWDH += ot;
  });
  otWDH  = Math.round(otWDH  * 10) / 10;
  otSunH = Math.round(otSunH * 10) / 10;

  const salary    = parseFloat((emp && emp.salary)    || 0);
  const dailyRate = parseFloat((emp && emp.dailyRate) || 0);
  const otRateWD  = parseFloat((emp && emp.otRateWD)  || 100);
  const otRateSun = parseFloat((emp && emp.otRateSun) || 200);
  const type      = (emp && emp.type) || 'monthly';

  // label งวด
  var periodLabel = '';
  if (isPeriod) {
    var pDef = period === 'p1' ? pc.p1 : pc.p2;
    var mp = month.split('-').map(Number); // [ceYear, ceMonth]
    if (period === 'p1') {
      var beM = mp[1] + 543 - 543; // ใช้ ceMonth
      periodLabel = 'งวด 1 วันที่ '+pDef.start+'-'+pDef.end+' '+_CAL_MONTHS[mp[1]-1]+' '+(mp[0]+543);
    } else {
      var pM2 = mp[1]===1?12:mp[1]-1;
      periodLabel = 'งวด 2 วันที่ '+pDef.start+' '+_CAL_MONTHS[pM2-1]+' – '+pDef.end+' '+_CAL_MONTHS[mp[1]-1]+' '+(mp[0]+543);
    }
  }

  let basePay = 0, absentDeduct = 0;
  if (type === 'daily') {
    basePay = dailyRate * present;
  } else {
    basePay = isPeriod ? salary / 2 : salary;
    if (workDays > 0 && absent > 0) absentDeduct = (basePay / (workDays + absent)) * absent;
  }

  const otPayWD  = otWDH  * otRateWD;
  const otPaySun = otSunH * otRateSun;
  const gross    = basePay + otPayWD + otPaySun;
  const net      = gross - absentDeduct;

  return {
    empId: (emp && emp.empId) || '',
    name:  (emp && emp.name)  || (att[0] && (att[0].empName || att[0].name)) || '',
    dept:  (emp && emp.dept)  || (att[0] && att[0].dept) || '',
    position: (emp && emp.position) || '',
    type:  type,
    month: month, monthLabel: _hrMLab(month), periodLabel: periodLabel,
    workDays: workDays, present: present, absent: absent,
    lateTimes: lateTimes, lateMins: lateMins,
    otWDH: otWDH, otSunH: otSunH,
    salary: salary, dailyRate: dailyRate, otRateWD: otRateWD, otRateSun: otRateSun,
    basePay: basePay, otPayWD: otPayWD, otPaySun: otPaySun,
    absentDeduct: absentDeduct, gross: gross, net: net,
  };
}

function _hrSlipHtml(p) {
  var _slipCo = {}; try { _slipCo = JSON.parse(localStorage.getItem('ptts_company_cfg')||'{}'); } catch(e){}
  const company  = _slipCo.name || localStorage.getItem('ptts_company_name') || 'PTTS SMART FACTORY';
  const now      = new Date();
  const printDt  = _hrDMY(now);
  const safeId   = String(p.empId || '').replace(/[^a-zA-Z0-9]/g, '');
  const safeMon  = String(p.month || '').replace(/[^0-9-]/g, '');

  const earningsRows = [
    [p.type === 'daily'
      ? 'ค่าแรงรายวัน (' + p.present + ' วัน × ฿' + _hrFmt(p.dailyRate) + ')'
      : 'เงินเดือน', p.basePay],
    p.otWDH  > 0 ? ['OT ปกติ (' + p.otWDH  + ' ชม. × ฿' + _hrFmt(p.otRateWD)  + ')', p.otPayWD]  : null,
    p.otSunH > 0 ? ['OT อาทิตย์ (' + p.otSunH + ' ชม. × ฿' + _hrFmt(p.otRateSun) + ')', p.otPaySun] : null,
  ].filter(Boolean);

  const deductRows = p.absentDeduct > 0
    ? [['ขาดงาน ' + p.absent + ' วัน', -p.absentDeduct]]
    : [];

  function row(label, val, bold) {
    return '<tr><td style="padding:7px 16px;' + (bold ? 'font-weight:700;color:#1e293b' : 'color:#374151') + '">' + label + '</td>' +
      '<td style="padding:7px 16px;text-align:right;' + (val < 0 ? 'color:#dc2626' : bold ? 'color:#1e293b' : 'color:#374151') + ';' + (bold ? 'font-weight:700' : '') + '">' +
      (val < 0 ? '−' : '') + ' ฿' + _hrFmt(Math.abs(val)) + '</td></tr>';
  }

  return '<!DOCTYPE html><html lang="th"><head>\n' +
'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n' +
'<title>สลิปเงินเดือน — ' + p.name + '</title>\n' +
'<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">\n' +
'<style>\n' +
'* { margin:0; padding:0; box-sizing:border-box; }\n' +
'body { font-family:\'Sarabun\',sans-serif; background:#f1f5f9; display:flex; flex-direction:column; align-items:center; padding:16px 12px 40px; min-height:100vh; }\n' +
'.slip { background:#fff; border-radius:16px; width:100%; max-width:460px; box-shadow:0 4px 24px rgba(0,0,0,.12); overflow:hidden; margin-top:10px; }\n' +
'.top { background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%); padding:22px 20px 18px; color:#fff; text-align:center; }\n' +
'.top .co { font-size:.72rem; opacity:.8; letter-spacing:1px; text-transform:uppercase; }\n' +
'.top h1 { font-size:1.3rem; font-weight:800; margin:4px 0 2px; }\n' +
'.top .mo { font-size:.86rem; opacity:.9; }\n' +
'.emp-grid { display:grid; grid-template-columns:1fr 1fr; padding:12px 16px; background:#f8fafc; border-bottom:1px solid #e2e8f0; gap:8px; }\n' +
'.emp-cell label { font-size:.68rem; color:#94a3b8; display:block; margin-bottom:1px; }\n' +
'.emp-cell span { font-size:.86rem; font-weight:600; color:#1e293b; }\n' +
'.sec-head { padding:7px 16px; background:#f1f5f9; font-size:.68rem; font-weight:700; color:#64748b; letter-spacing:.8px; text-transform:uppercase; border-top:1px solid #e2e8f0; }\n' +
'table { width:100%; border-collapse:collapse; }\n' +
'table td { border-bottom:1px solid #f1f5f9; }\n' +
'.tot-row td { background:#f8fafc; border-bottom:2px solid #e2e8f0 !important; }\n' +
'.net-row td { background:linear-gradient(135deg,#059669,#10b981); color:#fff !important; font-weight:800 !important; font-size:1.05rem; padding:14px 16px !important; border:none !important; }\n' +
'.att-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; padding:12px 16px; }\n' +
'.ac { text-align:center; padding:6px 4px; background:#f8fafc; border-radius:8px; }\n' +
'.ac .v { font-size:1.1rem; font-weight:800; }\n' +
'.ac .l { font-size:.65rem; color:#94a3b8; margin-top:1px; }\n' +
'.sig-row { display:grid; grid-template-columns:1fr 1fr; gap:16px; padding:14px 16px 8px; }\n' +
'.sig .line { border-bottom:1px solid #cbd5e1; height:28px; }\n' +
'.sig .lbl { font-size:.7rem; color:#94a3b8; text-align:center; margin-top:4px; }\n' +
'.footer { padding:10px 16px; font-size:.68rem; color:#94a3b8; border-top:1px solid #f1f5f9; text-align:center; }\n' +
'.action-bar { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; max-width:460px; width:100%; }\n' +
'.btn { padding:10px 20px; border-radius:10px; font-family:\'Sarabun\',sans-serif; font-size:.88rem; font-weight:700; cursor:pointer; border:none; }\n' +
'.bp { background:#3b82f6; color:#fff; }\n' +
'.bs { background:#059669; color:#fff; }\n' +
'.bl { background:#00c300; color:#fff; }\n' +
'@media print { body { background:#fff; padding:0; } .slip { box-shadow:none; border-radius:0; max-width:100%; margin:0; } .action-bar { display:none; } }\n' +
'</style></head><body>\n' +
'<div class="action-bar">' +
  '<button class="btn bp" onclick="window.print()">🖨 พิมพ์</button>' +
  '<button class="btn bs" onclick="hrSaveImg()">💾 บันทึกภาพ</button>' +
  '<button class="btn bl" onclick="hrShareLINE()">💚 แชร์ LINE</button>' +
  '<button class="btn" style="background:#64748b;color:#fff" onclick="window.close()">✖ ปิด</button>' +
'</div>\n' +
'<div class="slip" id="slipCard">\n' +
  '<div class="top">' +
    '<div class="co">' + company + '</div>' +
    '<h1>สลิปเงินเดือน</h1>' +
    '<div class="mo">' + (p.periodLabel ? p.periodLabel : 'ประจำเดือน ' + p.monthLabel) + '</div>' +
  '</div>\n' +
  '<div class="emp-grid">' +
    '<div class="emp-cell"><label>ชื่อ-สกุล</label><span>' + p.name + '</span></div>' +
    '<div class="emp-cell"><label>รหัสพนักงาน</label><span>' + (p.empId || '—') + '</span></div>' +
    '<div class="emp-cell"><label>แผนก</label><span>' + (p.dept || '—') + '</span></div>' +
    '<div class="emp-cell"><label>ตำแหน่ง</label><span>' + (p.position || '—') + '</span></div>' +
  '</div>\n' +
  '<div class="sec-head">สรุปการเข้างาน</div>' +
  '<div class="att-grid">' +
    '<div class="ac"><div class="v" style="color:#059669">' + p.present + '</div><div class="l">วันมา</div></div>' +
    '<div class="ac"><div class="v" style="color:#dc2626">' + p.absent + '</div><div class="l">วันขาด</div></div>' +
    '<div class="ac"><div class="v" style="color:#d97706">' + p.lateTimes + '</div><div class="l">ครั้งสาย<br>' + p.lateMins + ' น.</div></div>' +
    '<div class="ac"><div class="v" style="color:#7c3aed">' + p.otWDH + '</div><div class="l">OT ปกติ<br>ชม.</div></div>' +
    '<div class="ac"><div class="v" style="color:#d97706">' + p.otSunH + '</div><div class="l">OT อาทิตย์<br>ชม.</div></div>' +
    '<div class="ac"><div class="v" style="color:#1e293b">' + p.workDays + '</div><div class="l">วันทำงาน</div></div>' +
  '</div>\n' +
  '<div class="sec-head">รายได้</div>' +
  '<table>' + earningsRows.map(function(r) { return row(r[0], r[1], false); }).join('') +
    '<tr class="tot-row">' + row('รวมรายได้', p.gross, true).slice(4, -5) + '</tr>' +
  '</table>\n' +
  (deductRows.length
    ? '<div class="sec-head">รายการหัก</div><table>' +
      deductRows.map(function(r) { return row(r[0], r[1], false); }).join('') +
      '<tr class="tot-row">' + row('รวมหัก', -p.absentDeduct, true).slice(4, -5) + '</tr>' +
      '</table>\n'
    : '') +
  '<table><tr class="net-row"><td>💰 รับสุทธิ</td><td style="text-align:right">฿' + _hrFmt(p.net) + '</td></tr></table>\n' +
  '<div class="sig-row"><div class="sig"><div class="line"></div><div class="lbl">ลายเซ็นผู้รับเงิน</div></div>' +
    '<div class="sig"><div class="line"></div><div class="lbl">วันที่รับเงิน</div></div></div>\n' +
  '<div class="footer">พิมพ์เมื่อ ' + printDt + ' | ขอสงวนสิทธิ์ตรวจสอบย้อนหลัง</div>' +
'</div>\n' +
'<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>\n' +
'<script>\n' +
'async function hrSaveImg() {\n' +
'  try {\n' +
'    const canvas = await html2canvas(document.getElementById("slipCard"),{scale:2,useCORS:true,backgroundColor:"#fff"});\n' +
'    const blob = await new Promise(function(r){canvas.toBlob(r,"image/png");});\n' +
'    const a = document.createElement("a"); a.href=URL.createObjectURL(blob);\n' +
'    a.download="payslip_' + safeId + '_' + safeMon + '.png"; a.click();\n' +
'  } catch(e) { alert("ไม่สามารถบันทึกภาพได้: "+e.message); }\n' +
'}\n' +
'async function hrShareLINE() {\n' +
'  try {\n' +
'    const canvas = await html2canvas(document.getElementById("slipCard"),{scale:2,useCORS:true,backgroundColor:"#fff"});\n' +
'    const blob = await new Promise(function(r){canvas.toBlob(r,"image/png");});\n' +
'    const file = new File([blob],"payslip_' + (p.name || 'emp') + '.png",{type:"image/png"});\n' +
'    if (navigator.share && navigator.canShare && navigator.canShare({files:[file]})) {\n' +
'      await navigator.share({files:[file],title:"สลิปเงินเดือน ' + (p.name || '') + ' ' + (p.monthLabel || '') + '"});\n' +
'    } else {\n' +
'      const a = document.createElement("a"); a.href=URL.createObjectURL(blob);\n' +
'      a.download="payslip.png"; a.click();\n' +
'      setTimeout(function(){alert("บันทึกภาพแล้ว — เปิด LINE แล้วส่งรูปให้พนักงาน");},600);\n' +
'    }\n' +
'  } catch(e) { alert("ไม่สามารถแชร์ได้: "+e.message); }\n' +
'}\n' +
'<\/script>\n' +
'</body></html>';
}

// ══════════════════════════════════════════════════════════════
// SUB-TAB 6 — เบิก/กู้เงิน (Loan & Advance)
// ══════════════════════════════════════════════════════════════
let _hrLoans = [];

function _hrRenderLoans() {
  const p = document.getElementById('hrPanel6');
  if (!p) return;
  _hrLoanBadgeClear(); // ล้าง badge เมื่อเปิดหน้าเบิก/กู้
  // ยังไม่ login → แสดงหน้า login
  if (!_hrSession) { _hrShowLoanLogin(); return; }
  p.innerHTML = '<div style="padding:16px 0;text-align:center;color:var(--t3)">⏳ กำลังโหลด...</div>';
  // emp เห็นเฉพาะตัวเอง, manager เห็นทุกคน
  const params = _hrSession.role === 'emp' ? { empId: _hrSession.empId } : {};
  // โหลด employees พร้อมกัน (manager ต้องการชื่อพนักงาน)
  var calls = [_hrGET('getLoanRequests', params)];
  if (_hrSession.role === 'manager' && !_hrEmps.length) calls.push(_hrGET('getHREmployees'));
  Promise.all(calls).then(function(results) {
    _hrLoans = (results[0] && results[0].data) || [];
    if (results[1]) _hrEmps = results[1].data || [];
    p.innerHTML = _hrLoansPanelHtml();
    _hrLoansBindEvents();
  }).catch(function(e) {
    p.innerHTML = '<div style="padding:20px;color:#dc2626">โหลดข้อมูลไม่สำเร็จ: ' + e.message + '</div>';
  });
}

function _hrLoanStatusCard(filter, icon, label, count, accent, bg) {
  return '<div onclick="hrLoanSetFilter(\'' + filter + '\')" ' +
    'style="flex:1;min-width:0;cursor:pointer;background:' + bg + ';border:2px solid ' + accent + ';border-radius:10px;padding:8px 4px;text-align:center;transition:transform .15s,box-shadow .15s" ' +
    'onmouseover="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 6px 18px rgba(0,0,0,.1)\'" ' +
    'onmouseout="this.style.transform=\'\';this.style.boxShadow=\'\'">' +
    '<div style="font-size:1.1rem;line-height:1.3">' + icon + '</div>' +
    '<div style="font-size:1.5rem;font-weight:800;color:' + accent + ';line-height:1.2">' + count + '</div>' +
    '<div style="font-size:.65rem;color:var(--t2);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 2px">' + label + '</div>' +
  '</div>';
}

function _hrLoansPanelHtml() {
  const isManager = _hrSession && _hrSession.role === 'manager';
  const sessionName = _hrSession ? (_hrSession.name || _hrSession.empId) : '';
  // นับแต่ละสถานะ
  const cntPending  = _hrLoans.filter(function(l) { return l.status === 'pending';  }).length;
  const cntApproved = _hrLoans.filter(function(l) { return l.status === 'approved'; }).length;
  const cntRejected = _hrLoans.filter(function(l) { return l.status === 'rejected'; }).length;
  const cntClosed   = _hrLoans.filter(function(l) { return l.status === 'closed';   }).length;
  const cntAll      = _hrLoans.length;

  return '<div style="padding:0 4px">' +
    // session info bar (ซ่อนใน employee.html เพราะมี session bar ของตัวเองแล้ว — ยังคงไว้สำหรับ form.html)
    '<div id="hrLoanSessionBar" style="display:flex;align-items:center;justify-content:space-between;background:' + (isManager ? 'rgba(79,70,229,.07)' : 'rgba(8,145,178,.07)') + ';border:1px solid ' + (isManager ? 'rgba(79,70,229,.2)' : 'rgba(8,145,178,.2)') + ';border-radius:10px;padding:8px 14px;margin-bottom:14px">' +
      '<div style="font-size:.84rem;color:var(--t2)">' +
        (isManager ? '🔑 <b>ผู้จัดการ</b>' : '👤 ' + sessionName) +
      '</div>' +
      '<button onclick="hrLogout()" style="background:transparent;color:var(--t3);border:1px solid var(--bc-input);border-radius:6px;padding:4px 12px;cursor:pointer;font-family:inherit;font-size:.78rem">🔓 ออกจากระบบ</button>' +
    '</div>' +
    // ── สถานะขนาดใหญ่ ──
    '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:12px">' +
      _hrLoanStatusCard('all',      '📋', 'ทั้งหมด',     cntAll,      '#6366f1', 'rgba(99,102,241,.08)') +
      _hrLoanStatusCard('pending',  '⏳', 'รออนุมัติ',   cntPending,  '#f59e0b', 'rgba(245,158,11,.08)') +
      _hrLoanStatusCard('approved', '✅', 'อนุมัติแล้ว', cntApproved, '#10b981', 'rgba(16,185,129,.08)') +
      _hrLoanStatusCard('rejected', '❌', 'ปฏิเสธ',      cntRejected, '#ef4444', 'rgba(239,68,68,.08)') +
      _hrLoanStatusCard('closed',   '🔒', 'ปิดแล้ว',     cntClosed,   '#64748b', 'rgba(100,116,139,.08)') +
    '</div>' +
    // header bar
    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px">' +
      '<div style="font-size:1.05rem;font-weight:700;color:var(--t1)">💰 เบิก/กู้เงิน</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button onclick="hrLoanNew()" style="background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:7px 16px;cursor:pointer;font-family:inherit;font-size:.9rem">➕ ยื่นคำขอใหม่</button>' +
        '<button onclick="_hrRenderLoans()" style="background:transparent;color:var(--t3);border:1px solid var(--bc-input);border-radius:8px;padding:7px 14px;cursor:pointer;font-family:inherit;font-size:.9rem">🔄 รีเฟรช</button>' +
      '</div>' +
    '</div>' +
    // filter tabs
    '<div id="hrLoanFilter" style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">' +
      _hrLoanFilterBtn('all',      'ทั้งหมด') +
      _hrLoanFilterBtn('pending',  '⏳ รออนุมัติ') +
      _hrLoanFilterBtn('approved', '✅ อนุมัติ') +
      _hrLoanFilterBtn('rejected', '❌ ปฏิเสธ') +
      _hrLoanFilterBtn('closed',   '🔒 ปิดแล้ว') +
    '</div>' +
    // table
    '<div id="hrLoanTable">' + _hrLoanTableHtml('all') + '</div>' +
  '</div>';
}

function _hrLoanFilterBtn(val, label) {
  return '<button onclick="hrLoanSetFilter(\'' + val + '\')" id="hrLFBtn-' + val + '" ' +
    'style="border-radius:20px;padding:5px 14px;cursor:pointer;font-family:inherit;font-size:.85rem;' +
    'background:' + (val === 'all' ? 'var(--c1)' : 'transparent') + ';' +
    'color:' + (val === 'all' ? '#fff' : 'var(--t3)') + ';' +
    'border:1px solid ' + (val === 'all' ? 'var(--c1)' : 'var(--bc-input)') + '">' + label + '</button>';
}

let _hrLoanCurFilter = 'all';
function hrLoanSetFilter(val) {
  _hrLoanCurFilter = val;
  ['all','pending','approved','rejected','closed'].forEach(function(k) {
    const b = document.getElementById('hrLFBtn-' + k);
    if (!b) return;
    const active = k === val;
    b.style.background  = active ? 'var(--c1)' : 'transparent';
    b.style.color        = active ? '#fff' : 'var(--t3)';
    b.style.borderColor  = active ? 'var(--c1)' : 'var(--bc-input)';
  });
  const tbl = document.getElementById('hrLoanTable');
  if (tbl) tbl.innerHTML = _hrLoanTableHtml(val);
}

function _hrFmtDateShort(d) {
  if (!d) return '—';
  var dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d).slice(0, 16);
  var day = String(dt.getDate()).padStart(2, '0');
  var mon = String(dt.getMonth() + 1).padStart(2, '0');
  var yr  = dt.getFullYear() + 543;
  var h   = String(dt.getHours()).padStart(2, '0');
  var m   = String(dt.getMinutes()).padStart(2, '0');
  return day + '/' + mon + '/' + yr + ' ' + h + ':' + m;
}

function _hrLoanDaysSince(dateStr) {
  if (!dateStr) return 0;
  var d;
  var s = String(dateStr);
  if (s[2] === '/') { // dd/MM/yyyy BE
    var p = s.split(' ')[0].split('/');
    var yr = parseInt(p[2]); var mo = parseInt(p[1])-1; var dy = parseInt(p[0]);
    if (yr > 2500) yr -= 543;
    d = new Date(yr, mo, dy);
  } else {
    d = new Date(s);
  }
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

function _hrLoanTableHtml(filter) {
  const rows = filter === 'all' ? _hrLoans : _hrLoans.filter(function(l) { return l.status === filter; });
  if (!rows.length) return '<div style="padding:32px;text-align:center;color:var(--t3)">ไม่มีรายการ</div>';

  const isEmp = _hrSession && _hrSession.role === 'emp';
  const isManagerView = _hrSession && _hrSession.role === 'manager';

  const statusStyle = {
    pending:  { bg:'#fef3c7', color:'#92400e', label:'⏳ รออนุมัติ' },
    approved: { bg:'#d1fae5', color:'#065f46', label:'✅ อนุมัติแล้ว' },
    rejected: { bg:'#fee2e2', color:'#991b1b', label:'❌ ปฏิเสธ' },
    closed:   { bg:'#f1f5f9', color:'#475569', label:'🔒 ปิดแล้ว' },
  };
  const typeStyle = {
    advance: { bg:'#e0e7ff', color:'#3730a3', label:'เบิก' },
    loan:    { bg:'#fce7f3', color:'#9d174d', label:'กู้' },
  };
  const dayRingColor = { pending:'#f59e0b', approved:'#10b981', rejected:'#94a3b8', closed:'#64748b' };

  function badge(map, key) {
    var s = map[key] || { bg:'#f1f5f9', color:'#475569', label: key };
    return '<span style="background:' + s.bg + ';color:' + s.color + ';border-radius:99px;padding:2px 10px;font-size:.76rem;font-weight:600">' + s.label + '</span>';
  }

  var cards = rows.map(function(l) {
    var days    = _hrLoanDaysSince(l.requestDate);
    var ringClr = dayRingColor[l.status] || '#64748b';
    var ts      = typeStyle[l.type] || { bg:'#f1f5f9', color:'#475569', label: l.type };

    // ── day circle ──
    var dayCircle =
      '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'width:52px;height:52px;border-radius:50%;border:3px solid ' + ringClr + ';flex-shrink:0">' +
        '<span style="font-size:1.1rem;font-weight:800;color:' + ringClr + ';line-height:1">' + days + '</span>' +
        '<span style="font-size:.6rem;color:' + ringClr + ';margin-top:1px">วันที่แล้ว</span>' +
      '</div>';

    // ── action buttons ──
    var actionArea = '';
    if (l.status === 'pending' && isManagerView) {
      actionArea =
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button onclick="hrLoanApprove(\'' + l.requestId + '\')" style="flex:1;min-width:80px;background:#d1fae5;color:#065f46;border:none;border-radius:8px;padding:7px 10px;cursor:pointer;font-size:.84rem;font-family:inherit;font-weight:600">✅ อนุมัติ</button>' +
          '<button onclick="hrLoanReject(\'' + l.requestId + '\')" style="flex:1;min-width:80px;background:#fee2e2;color:#991b1b;border:none;border-radius:8px;padding:7px 10px;cursor:pointer;font-size:.84rem;font-family:inherit;font-weight:600">❌ ปฏิเสธ</button>' +
        '</div>';
    } else if (l.status === 'approved' && isManagerView) {
      actionArea =
        '<button onclick="hrLoanClose(\'' + l.requestId + '\')" style="width:100%;background:#0f172a;color:#fff;border:none;border-radius:8px;padding:8px 10px;cursor:pointer;font-size:.84rem;font-family:inherit;font-weight:600">💳 บันทึกโอนเงิน / ปิดรายการ</button>';
    } else if (l.status === 'closed') {
      var xfAmt  = l.transferAmount ? '฿' + _hrFmt(l.transferAmount) : '';
      var xfDate = l.transferDate   ? _hrFmtDateShort(l.transferDate).slice(0,10) : '';
      var xfNote = l.transferNote   ? l.transferNote : '';
      actionArea =
        '<div style="background:var(--bg2);border-radius:8px;padding:8px 10px;font-size:.8rem;display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
          (xfDate ? '<span style="color:var(--t2)">📅 ' + xfDate + '</span>' : '') +
          (xfAmt  ? '<span style="color:#059669;font-weight:700">' + xfAmt + '</span>' : '') +
          (xfNote ? '<span style="color:var(--t3)">' + xfNote + '</span>' : '') +
          (l.slipImageUrl ? '<a href="' + l.slipImageUrl + '" target="_blank" style="color:#3b82f6;text-decoration:none">🖼️ ใบโอน</a>' : '') +
          (l.closedDate ? '<span style="color:var(--t4);font-size:.75rem;margin-left:auto">ปิด ' + _hrFmtDateShort(l.closedDate).slice(0,10) + '</span>' : '') +
        '</div>';
    } else if (l.status === 'approved' && !isManagerView) {
      actionArea = '<div style="font-size:.8rem;color:#059669">✅ อนุมัติโดย ' + (l.approvedBy || '—') + '</div>';
    } else if (l.status === 'rejected') {
      actionArea = '<div style="font-size:.8rem;color:#dc2626">❌ ปฏิเสธแล้ว</div>';
    }

    return '<div style="background:var(--bg-card);border:1px solid var(--bc-card);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:10px">' +
      // ── header row ──
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px">' +
            '<span style="background:' + ts.bg + ';color:' + ts.color + ';border-radius:6px;padding:2px 9px;font-size:.78rem;font-weight:700">' + ts.label + '</span>' +
            badge(statusStyle, l.status) +
          '</div>' +
          '<div style="font-size:1.2rem;font-weight:800;color:var(--t1)">฿' + _hrFmt(l.amount) + '</div>' +
          (function(){
            var n = l.empName || ((_hrEmps||[]).find(function(e){ return String(e.empId)===String(l.empId); })||{}).name || l.empId;
            return !isEmp ? '<div style="font-size:.85rem;font-weight:600;color:var(--t2);margin-top:2px">👤 ' + n + '</div>' : '';
          })() +
          (function(){
            if (l.type !== 'advance') return '';
            // หา advanceBudget ของพนักงานคนนี้
            var empRec = (_hrEmps||[]).find(function(e){ return String(e.empId)===String(l.empId); }) || {};
            var budget = parseFloat(empRec.advanceBudget || (_hrSession && _hrSession.empId === String(l.empId) ? _hrSession.advanceBudget : 0) || 0);
            if (!budget) return '';
            // คำนวณยอดเบิกแล้วเดือนปัจจุบัน (pending+approved+closed ที่ requestDate อยู่เดือนนี้)
            var nowYM = (function(){ var d=new Date(); return d.getFullYear()+'-'+(d.getMonth()<9?'0':'')+(d.getMonth()+1); })();
            var used = 0;
            (_hrLoans||[]).forEach(function(x){
              if (String(x.empId) !== String(l.empId)) return;
              if (x.type !== 'advance') return;
              if (x.status === 'rejected') return;
              // parse requestDate dd/MM/yyyy BE → CE ym
              var rd = String(x.requestDate||'');
              var parts = rd.split(/[\/ ]/);
              if (parts.length >= 3) {
                var beY = parseInt(parts[2]); var m = parts[1];
                var ceY = beY > 2500 ? beY - 543 : beY;
                var ym = ceY + '-' + (m.length===1?'0':'') + m;
                if (ym === nowYM) used += parseFloat(x.amount||0);
              }
            });
            var remain = Math.max(0, budget - used);
            var pct = Math.min(100, budget > 0 ? Math.round(used/budget*100) : 0);
            var barColor = pct >= 90 ? '#ef4444' : pct >= 60 ? '#f59e0b' : '#10b981';
            return '<div style="margin-top:6px;background:var(--bg2);border-radius:8px;padding:7px 10px;font-size:.75rem">' +
              '<div style="display:flex;justify-content:space-between;color:var(--t3);margin-bottom:4px">' +
                '<span>วงเงิน/เดือน <b style="color:var(--t1)">฿' + _hrFmt(budget) + '</b></span>' +
                '<span style="color:' + (remain===0?'#ef4444':'#059669') + ';font-weight:700">เหลือ ฿' + _hrFmt(remain) + '</span>' +
              '</div>' +
              '<div style="background:var(--bc-card);border-radius:99px;height:5px;overflow:hidden">' +
                '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:99px;transition:width .3s"></div>' +
              '</div>' +
              '<div style="color:var(--t4);margin-top:3px">เบิกแล้ว ฿' + _hrFmt(used) + ' (' + pct + '%)</div>' +
            '</div>';
          })() +
        '</div>' +
        dayCircle +
      '</div>' +
      // ── details ──
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:.8rem">' +
        '<div style="color:var(--t3)">เลขที่<br><span style="color:var(--t2);font-size:.75rem">' + l.requestId + '</span></div>' +
        '<div style="color:var(--t3)">วันที่ยื่น<br><span style="color:var(--t2)">' + _hrFmtDateShort(l.requestDate) + '</span></div>' +
        (l.reason ? '<div style="color:var(--t3);grid-column:1/-1">เหตุผล<br><span style="color:var(--t2)">' + l.reason + '</span></div>' : '') +
        (l.type === 'loan' && l.repayPeriods > 1
          ? '<div style="color:var(--t3)">ผ่อน<br><span style="color:var(--t2)">' + l.repayPeriods + ' งวด (฿' + _hrFmt(l.installmentAmt) + '/งวด)</span></div>'
          : '') +
      '</div>' +
      // ── action ──
      (actionArea ? '<div style="border-top:1px solid var(--bc-input);padding-top:10px">' + actionArea + '</div>' : '') +
    '</div>';
  }).join('');

  return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">' + cards + '</div>';
}


function _hrLoansBindEvents() { /* event binding ผ่าน onclick inline */ }

// ── ยื่นคำขอใหม่ ─────────────────────────────────────────────
function hrLoanNew() {
  const _isEmpRole = _hrSession && _hrSession.role === 'emp';
  if (!_isEmpRole && (!_hrEmps || !_hrEmps.length)) {
    Swal.fire({ icon: 'warning', title: 'ยังไม่มีข้อมูลพนักงาน', text: 'กรุณาเพิ่มพนักงานในแท็บ "พนักงาน" ก่อน', confirmButtonText: 'ตกลง' });
    return;
  }
  const isEmp = _hrSession && _hrSession.role === 'emp';
  // emp เห็นเฉพาะตัวเอง; manager เห็นทุกคน
  // ถ้า role=emp และ _hrEmps ยังไม่โหลด → ใช้ session data แทน
  const empListRaw = (!_hrEmps || !_hrEmps.length) && isEmp
    ? [{ empId: _hrSession.empId, name: _hrSession.name, dept: _hrSession.dept || '', advanceBudget: _hrSession.advanceBudget || 0 }]
    : _hrEmps;
  const empList = isEmp
    ? empListRaw.filter(function(e) { return String(e.empId) === String(_hrSession.empId); })
    : empListRaw;
  const empOpts = empList.map(function(e) {
    return '<option value="' + e.empId + '" data-budget="' + (e.advanceBudget || 0) + '">' + e.name + ' (' + e.empId + ')</option>';
  }).join('');

  Swal.fire({
    title: '💰 ยื่นคำขอเบิก/กู้',
    width: 480,
    html: '<div style="text-align:left;font-family:Sarabun,sans-serif">' +
      '<div style="margin-bottom:10px">' +
        '<label style="font-size:.85rem;color:var(--t2)">พนักงาน</label>' +
        '<select id="lnFEmp" style="width:100%;padding:8px;border:1px solid var(--bc-input);border-radius:8px;background:var(--bg2);color:var(--t1);font-family:inherit;margin-top:4px">' + empOpts + '</select>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
        '<div>' +
          '<label style="font-size:.85rem;color:var(--t2)">ประเภท</label>' +
          '<select id="lnFType" onchange="hrLoanTypeChanged()" style="width:100%;padding:8px;border:1px solid var(--bc-input);border-radius:8px;background:var(--bg2);color:var(--t1);font-family:inherit;margin-top:4px">' +
            '<option value="advance">เบิกล่วงหน้า</option>' +
            '<option value="loan">กู้เงิน</option>' +
          '</select>' +
        '</div>' +
        '<div>' +
          '<label style="font-size:.85rem;color:var(--t2)">จำนวนเงิน (บาท)</label>' +
          '<input id="lnFAmt" type="number" min="0" step="100" style="width:100%;padding:8px;border:1px solid var(--bc-input);border-radius:8px;background:var(--bg2);color:var(--t1);font-family:inherit;margin-top:4px;box-sizing:border-box">' +
        '</div>' +
      '</div>' +
      '<div id="lnFLoanRow" style="display:none;margin-bottom:10px">' +
        '<label style="font-size:.85rem;color:var(--t2)">ผ่อนชำระ (งวด)</label>' +
        '<input id="lnFPeriods" type="number" min="1" max="24" value="1" style="width:100%;padding:8px;border:1px solid var(--bc-input);border-radius:8px;background:var(--bg2);color:var(--t1);font-family:inherit;margin-top:4px;box-sizing:border-box">' +
      '</div>' +
      '<div style="margin-bottom:10px">' +
        '<label style="font-size:.85rem;color:var(--t2)">เหตุผล</label>' +
        '<input id="lnFReason" type="text" style="width:100%;padding:8px;border:1px solid var(--bc-input);border-radius:8px;background:var(--bg2);color:var(--t1);font-family:inherit;margin-top:4px;box-sizing:border-box">' +
      '</div>' +
      '<div id="lnBudgetInfo" style="font-size:.82rem;color:#4338ca;background:#e0e7ff;border-radius:8px;padding:8px 12px;display:none"></div>' +
    '</div>',
    showCancelButton: true,
    confirmButtonText: '📨 ยื่นคำขอ',
    cancelButtonText: 'ยกเลิก',
    didOpen: function() { hrLoanTypeChanged(); },
    preConfirm: function() {
      const empSel = document.getElementById('lnFEmp');
      const empId  = empSel.value;
      const empOpt = empSel.options[empSel.selectedIndex];
      const empObj = _hrEmps.find(function(e) { return String(e.empId) === String(empId); }) || {};
      const amt    = parseFloat(document.getElementById('lnFAmt').value) || 0;
      const type   = document.getElementById('lnFType').value;
      const reason = document.getElementById('lnFReason').value.trim();
      const periods = parseInt(document.getElementById('lnFPeriods').value) || 1;
      if (!empId) { Swal.showValidationMessage('กรุณาเลือกพนักงาน'); return false; }
      if (amt <= 0)  { Swal.showValidationMessage('กรุณาใส่จำนวนเงิน'); return false; }
      if (!reason)   { Swal.showValidationMessage('กรุณาใส่เหตุผล'); return false; }
      return {
        empId: empId, empName: empObj.name || '', dept: empObj.dept || '',
        type: type, amount: amt, reason: reason, repayPeriods: periods,
        advanceBudget: parseFloat(empOpt.dataset.budget) || 0
      };
    }
  }).then(function(res) {
    if (!res.isConfirmed) return;
    _hrPOST('saveLoanRequest', res.value).then(function(r) {
      if (r.status === 'budget_exceeded') {
        Swal.fire({ icon: 'warning', title: '⚠️ เกินวงเงิน', text: r.message, confirmButtonText: 'ตกลง' });
      } else if (r.status === 'ok') {
        Swal.fire({ icon: 'success', title: 'ยื่นคำขอสำเร็จ', text: 'เลขที่: ' + r.requestId, timer: 2000, showConfirmButton: false });
        _hrRenderLoans();
      } else {
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: r.message || 'ไม่ทราบสาเหตุ', confirmButtonText: 'ตกลง' });
      }
    });
  });
}

function hrLoanTypeChanged() {
  const t = document.getElementById('lnFType');
  const loanRow = document.getElementById('lnFLoanRow');
  const budgetInfo = document.getElementById('lnBudgetInfo');
  if (!t) return;
  if (loanRow) loanRow.style.display = t.value === 'loan' ? '' : 'none';
  if (t.value === 'advance' && budgetInfo) {
    const empSel = document.getElementById('lnFEmp');
    if (empSel) {
      const opt      = empSel.options[empSel.selectedIndex];
      const selEmpId = opt ? opt.value : '';
      const budget   = parseFloat(opt && opt.dataset.budget) || 0;
      if (budget > 0) {
        // คำนวณยอดที่เบิกไปแล้วในเดือนนี้
        const nowMon = (function(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); })();
        var used = 0;
        (_hrLoans || []).forEach(function(l) {
          if (String(l.empId) !== String(selEmpId)) return;
          if (l.type !== 'advance') return;
          if (l.status === 'rejected') return;
          var rd = String(l.requestDate || '');
          var rdKey = '';
          if (rd.length >= 10 && rd[2] === '/') {
            var beYr = parseInt(rd.slice(6,10));
            var ceYr = beYr > 2500 ? beYr - 543 : beYr; // แปลง BE → CE
            rdKey = ceYr + '-' + rd.slice(3,5);
          } else { rdKey = rd.slice(0,7); }
          if (rdKey === nowMon) used += parseFloat(l.amount) || 0;
        });
        const remain = Math.max(0, budget - used);
        budgetInfo.style.display = '';
        budgetInfo.innerHTML =
          '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:.82rem">' +
            '<span>💡 วงเงิน/เดือน <b>฿' + _hrFmt(budget) + '</b></span>' +
            (used > 0 ? '<span style="color:#dc2626">เบิกแล้ว <b>฿' + _hrFmt(used) + '</b></span>' : '') +
            '<span style="color:#059669">เบิกได้อีก <b>฿' + _hrFmt(remain) + '</b></span>' +
          '</div>';
      } else {
        budgetInfo.style.display = 'none';
      }
    }
  } else if (budgetInfo) {
    budgetInfo.style.display = 'none';
  }
}

// ── อนุมัติ ───────────────────────────────────────────────────
function hrLoanApprove(requestId) {
  Swal.fire({
    title: '✅ อนุมัติคำขอ',
    html: '<div style="text-align:left;font-family:Sarabun,sans-serif">' +
      '<div style="margin-bottom:10px">' +
        '<label style="font-size:.85rem;color:var(--t2)">ชื่อผู้อนุมัติ</label>' +
        '<input id="apFBy" type="text" placeholder="คุณสุรศักดิ์" style="width:100%;padding:8px;border:1px solid var(--bc-input);border-radius:8px;background:var(--bg2);color:var(--t1);font-family:inherit;margin-top:4px;box-sizing:border-box">' +
      '</div>' +
      '<div style="margin-bottom:10px">' +
        '<label style="font-size:.85rem;color:var(--t2)">หักจากงวดเดือน (เช่น 2026-07)</label>' +
        '<input id="apFMon" type="month" style="width:100%;padding:8px;border:1px solid var(--bc-input);border-radius:8px;background:var(--bg2);color:var(--t1);font-family:inherit;margin-top:4px;box-sizing:border-box">' +
      '</div>' +
      '<div>' +
        '<label style="font-size:.85rem;color:var(--t2)">หมายเหตุ (ถ้ามี)</label>' +
        '<input id="apFNote" type="text" style="width:100%;padding:8px;border:1px solid var(--bc-input);border-radius:8px;background:var(--bg2);color:var(--t1);font-family:inherit;margin-top:4px;box-sizing:border-box">' +
      '</div>' +
    '</div>',
    showCancelButton: true,
    confirmButtonText: '✅ ยืนยันอนุมัติ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#059669',
    preConfirm: function() {
      const by = (document.getElementById('apFBy').value || '').trim();
      if (!by) { Swal.showValidationMessage('กรุณาใส่ชื่อผู้อนุมัติ'); return false; }
      return {
        requestId: requestId,
        approvedBy: by,
        deductMonth: document.getElementById('apFMon').value || '',
        notes: document.getElementById('apFNote').value || ''
      };
    }
  }).then(function(res) {
    if (!res.isConfirmed) return;
    _hrPOST('approveLoan', res.value).then(function(r) {
      if (r.status === 'ok') {
        Swal.fire({ icon: 'success', title: 'อนุมัติแล้ว', timer: 1500, showConfirmButton: false });
        _hrRenderLoans();
      } else {
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: r.message, confirmButtonText: 'ตกลง' });
      }
    });
  });
}

// ── ปฏิเสธ ───────────────────────────────────────────────────
function hrLoanReject(requestId) {
  Swal.fire({
    title: '❌ ปฏิเสธคำขอ',
    input: 'text',
    inputLabel: 'เหตุผลที่ปฏิเสธ (ถ้ามี)',
    inputPlaceholder: 'เช่น เกินวงเงิน',
    showCancelButton: true,
    confirmButtonText: 'ยืนยันปฏิเสธ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#dc2626',
  }).then(function(res) {
    if (!res.isConfirmed) return;
    _hrPOST('rejectLoan', { requestId: requestId, notes: res.value || '' }).then(function(r) {
      if (r.status === 'ok') {
        Swal.fire({ icon: 'success', title: 'ปฏิเสธแล้ว', timer: 1500, showConfirmButton: false });
        _hrRenderLoans();
      } else {
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: r.message, confirmButtonText: 'ตกลง' });
      }
    });
  });
}

// ── helper: next pay month (yyyy-MM) ─────────────────────────
function _hrNextPayMonth() {
  var d = new Date();
  var m = d.getMonth() + 1; // next month (0-based+1 = current, +2 = next)
  var y = d.getFullYear();
  if (m > 11) { m = 0; y++; } else { m++; }
  return y + '-' + String(m).padStart(2, '0');
}

// ── ปิดรายการ (บัญชี Step 4) ──────────────────────────────────
function hrLoanClose(requestId) {
  const loan     = _hrLoans.find(function(l) { return l.requestId === requestId; }) || {};
  const isAdv    = loan.type === 'advance';
  const nextMon  = _hrNextPayMonth();
  const inp = function(id, label, type, val, ph, extra) {
    return '<div style="margin-bottom:10px">' +
      '<label style="font-weight:600;display:block;margin-bottom:4px;font-size:.88rem">' + label + '</label>' +
      '<input id="' + id + '" type="' + type + '" value="' + (val||'') + '" placeholder="' + (ph||'') + '" ' + (extra||'') +
      ' style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-family:inherit;font-size:.92rem;box-sizing:border-box"></div>';
  };
  var deductHtml = isAdv
    ? '<div style="margin-bottom:10px;padding:10px 12px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;font-size:.88rem;color:#166534">' +
        '✅ <b>หักงวดถัดไปทั้งหมด</b> — งวด ' + nextMon +
        '<input type="hidden" id="clMon" value="' + nextMon + '">' +
      '</div>'
    : inp('clMon', 'หักเงินเดือนงวด (yyyy-MM)', 'month', loan.deductMonth || '', '');

  Swal.fire({
    title: '💳 บันทึกการโอนเงิน',
    html:
      '<div style="text-align:left;font-family:\'Sarabun\',sans-serif;font-size:.92rem">' +
      inp('clDate', 'วันที่โอนเงิน', 'date', new Date().toISOString().slice(0,10), '') +
      inp('clAmt',  'จำนวนที่โอน (บาท)', 'number', loan.amount || '', '0', 'min="0"') +
      inp('clNote', 'หมายเหตุ / เลขที่ใบโอน', 'text', '', 'เช่น ref. โอน') +
      deductHtml +
      '<div style="margin-bottom:4px"><label style="font-weight:600;display:block;margin-bottom:4px;font-size:.88rem">📷 แนบรูปใบโอนเงิน (ถ้ามี)</label>' +
        '<input id="clSlip" type="file" accept="image/*" style="width:100%;font-family:inherit;font-size:.85rem;padding:4px 0">' +
        '<div id="clSlipStatus" style="font-size:.8rem;color:var(--t3);margin-top:4px"></div>' +
      '</div>' +
      '</div>',
    showCancelButton: true,
    confirmButtonText: '✅ ปิดรายการ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0f172a',
    preConfirm: function() {
      var d = document.getElementById('clDate').value;
      var a = parseFloat(document.getElementById('clAmt').value);
      if (!d) { Swal.showValidationMessage('กรุณาระบุวันที่โอน'); return false; }
      if (!a || a <= 0) { Swal.showValidationMessage('กรุณาระบุจำนวนเงินที่โอน'); return false; }
      var baseData = {
        requestId:      requestId,
        transferDate:   d,
        transferAmount: a,
        transferNote:   document.getElementById('clNote').value || '',
        deductMonth:    document.getElementById('clMon').value  || '',
        slipImageUrl:   ''
      };
      var fileInput = document.getElementById('clSlip');
      if (!fileInput || !fileInput.files || !fileInput.files[0]) {
        return Promise.resolve(baseData);
      }
      var file = fileInput.files[0];
      var statusEl = document.getElementById('clSlipStatus');
      if (statusEl) statusEl.textContent = '⏳ กำลังอัปโหลดรูป...';
      return new Promise(function(resolve) {
        var reader = new FileReader();
        reader.onload = function(e) {
          var b64 = e.target.result.split(',')[1];
          var ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
          _hrPOST('uploadSlipImage', {
            base64:   b64,
            mimeType: file.type || 'image/jpeg',
            filename: 'slip_' + requestId + '_' + Date.now() + '.' + ext
          }).then(function(up) {
            if (up && up.url) baseData.slipImageUrl = up.url;
            resolve(baseData);
          }).catch(function() { resolve(baseData); });
        };
        reader.onerror = function() { resolve(baseData); };
        reader.readAsDataURL(file);
      });
    }
  }).then(function(res) {
    if (!res.isConfirmed) return;
    _hrPOST('closeLoan', res.value).then(function(r) {
      if (r.status === 'ok') {
        Swal.fire({ icon: 'success', title: 'ปิดรายการแล้ว', timer: 1500, showConfirmButton: false });
        _hrRenderLoans();
      } else {
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: r.message, confirmButtonText: 'ตกลง' });
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// LOAN PENDING BADGE — แจ้งเตือน admin หน้าแท็บ เบิก/กู้
// ══════════════════════════════════════════════════════════════
let _hrLoanPollTimer = null;

function _hrLoanBadgeStart() {
  if (_hrLoanPollTimer) return; // running already
  _hrLoanPoll();
  _hrLoanPollTimer = setInterval(_hrLoanPoll, 60000); // ทุก 60 วิ
}

function _hrLoanPoll() {
  if (_hrSubCur === '6') return; // อยู่หน้าเบิก/กู้แล้ว — ไม่ต้อง poll
  _hrGET('getLoanRequests', { status: 'pending' }).then(function(r) {
    var cnt = (r && r.data) ? r.data.length : 0;
    _hrLoanBadgeUpdate(cnt);
  }).catch(function() {});
}

// inject blink animation once
(function() {
  if (document.getElementById('hrBadgeStyle')) return;
  var s = document.createElement('style');
  s.id = 'hrBadgeStyle';
  s.textContent = '@keyframes hrBadgePulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.65;transform:scale(1.2)}}' +
    '.hr-badge-blink{animation:hrBadgePulse 1.2s ease-in-out infinite}';
  document.head.appendChild(s);
})();

function _hrLoanBadgeUpdate(cnt) {
  var BADGE_STYLE = 'position:absolute;top:-5px;right:-5px;background:#ef4444;color:#fff;' +
    'border-radius:99px;font-size:.65rem;font-weight:700;padding:1px 5px;min-width:16px;' +
    'text-align:center;line-height:16px;pointer-events:none;box-shadow:0 0 0 2px var(--bg)';

  // --- badge บน sub-tab เบิก/กู้ ---
  var btn = document.getElementById('hrBtn6');
  if (btn) {
    var badge = document.getElementById('hrLoanBadge');
    if (cnt > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.id = 'hrLoanBadge';
        badge.style.cssText = BADGE_STYLE;
        btn.style.position = 'relative';
        btn.appendChild(badge);
      }
      badge.className = 'hr-badge-blink';
      badge.textContent = cnt > 9 ? '9+' : String(cnt);
    } else if (badge) { badge.remove(); }
  }

  // --- badge บน HR sidebar group header (แสดงก่อนเข้า tab) ---
  var hrGrpBtn = null;
  var allGrp = document.querySelectorAll('.sb-group-header');
  for (var i = 0; i < allGrp.length; i++) {
    if (allGrp[i].textContent.replace(/[\s\u200b]/g,'').indexOf('HR') !== -1) {
      hrGrpBtn = allGrp[i]; break;
    }
  }
  if (hrGrpBtn) {
    var sbBadge = document.getElementById('hrSidebarLoanBadge');
    if (cnt > 0) {
      if (!sbBadge) {
        sbBadge = document.createElement('span');
        sbBadge.id = 'hrSidebarLoanBadge';
        sbBadge.style.cssText = 'position:absolute;top:8px;right:30px;background:#ef4444;color:#fff;' +
          'border-radius:99px;font-size:.65rem;font-weight:700;padding:1px 5px;min-width:16px;' +
          'text-align:center;line-height:16px;pointer-events:none;box-shadow:0 0 0 2px var(--bg)';
        hrGrpBtn.style.position = 'relative';
        hrGrpBtn.appendChild(sbBadge);
      }
      sbBadge.className = 'hr-badge-blink';
      sbBadge.textContent = cnt > 9 ? '9+' : String(cnt);
    } else if (sbBadge) { sbBadge.remove(); }
  }
}

function _hrLoanBadgeClear() {
  _hrLoanBadgeUpdate(0);
}

// ══════════════════════════════════════════════════════════════
// LOGIN SYSTEM — เบิก/กู้
// ══════════════════════════════════════════════════════════════
const HR_MASTER_PIN_LS = 'ptts_hr_master_pin';
let _hrSession = null; // null | { empId, name, dept, role: 'manager'|'emp', advanceBudget }

function hrSaveMasterPin() {
  const inp = document.getElementById('hrMasterPinInput');
  if (!inp) return;
  const v = inp.value.trim();
  if (!v || v.length < 4) {
    Swal.fire({ icon: 'warning', title: 'PIN ต้องมีอย่างน้อย 4 ตัวอักษร', confirmButtonText: 'ตกลง' });
    return;
  }
  localStorage.setItem(HR_MASTER_PIN_LS, v);
  inp.value = '••••';
  Swal.fire({ icon: 'success', title: 'บันทึก Master PIN แล้ว', timer: 1200, showConfirmButton: false });
}

function hrLogout() {
  _hrSession = null;
  _hrRenderLoans();
}

// เรียกจาก _hrRenderLoans() — ถ้ายังไม่ login → แสดง popup login
function _hrShowLoanLogin() {
  const p = document.getElementById('hrPanel6');
  if (!p) return;
  p.innerHTML = '<div style="max-width:400px;margin:40px auto;padding:32px 28px;' +
    'background:var(--bg-card);border:1px solid var(--bc-card);border-radius:20px;text-align:center">' +
    '<div style="font-size:2rem;margin-bottom:12px">🔐</div>' +
    '<div style="font-size:1.1rem;font-weight:700;color:var(--t1);margin-bottom:6px">เข้าสู่ระบบ</div>' +
    '<div style="font-size:.84rem;color:var(--t3);margin-bottom:24px">ใส่เบอร์โทรศัพท์ + PIN</div>' +
    '<div style="text-align:left;margin-bottom:12px">' +
      '<label style="font-size:.82rem;color:var(--t2);font-weight:600;display:block;margin-bottom:4px">เบอร์โทรศัพท์</label>' +
      '<input id="lnLoginId" type="tel" inputmode="numeric" maxlength="10" ' +
        'style="width:100%;padding:10px 12px;border:1px solid var(--bc-input);border-radius:9px;' +
        'background:var(--bg-input);color:var(--t1);font-family:\'Sarabun\',sans-serif;font-size:.95rem" ' +
        'placeholder="0812345678">' +
    '</div>' +
    '<div style="text-align:left;margin-bottom:20px">' +
      '<label style="font-size:.82rem;color:var(--t2);font-weight:600;display:block;margin-bottom:4px">PIN</label>' +
      '<input id="lnLoginPin" type="password" ' +
        'style="width:100%;padding:10px 12px;border:1px solid var(--bc-input);border-radius:9px;' +
        'background:var(--bg-input);color:var(--t1);font-family:\'Sarabun\',sans-serif;font-size:.95rem" ' +
        'placeholder="รหัส PIN" onkeydown="if(event.key===\'Enter\')hrDoLoanLogin()">' +
    '</div>' +
    '<div id="lnLoginErr" style="min-height:18px;font-size:.82rem;color:#ef4444;margin-bottom:12px"></div>' +
    '<button onclick="hrDoLoanLogin()" style="width:100%;padding:12px;background:var(--c1);color:#fff;' +
      'border:none;border-radius:11px;font-family:\'Sarabun\',sans-serif;font-size:1rem;font-weight:700;cursor:pointer">' +
      'เข้าสู่ระบบ</button>' +
  '</div>';
}

function hrDoLoanLogin() {
  const empId = ((document.getElementById('lnLoginId') || {}).value || '').trim();
  const pin   = ((document.getElementById('lnLoginPin') || {}).value || '').trim();
  const errEl = document.getElementById('lnLoginErr');
  if (!empId || !pin) {
    if (errEl) errEl.textContent = 'กรุณากรอกเบอร์โทร และ PIN';
    return;
  }
  // ตรวจ Master PIN ก่อน — ถ้าตรง = manager
  const masterPin = localStorage.getItem(HR_MASTER_PIN_LS) || '';
  if (masterPin && pin === masterPin) {
    _hrSession = { empId: empId, name: 'ผู้จัดการ', dept: '', role: 'manager', advanceBudget: 0 };
    _hrRenderLoans();
    return;
  }
  // login ปกติผ่าน backend (ใช้ phone)
  _hrPOST('hrLogin', { phone: empId, pin: pin }).then(function(r) {
    if (r.status === 'ok') {
      _hrSession = Object.assign({}, r.emp, { role: 'emp' });
      _hrRenderLoans();
    } else {
      if (errEl) errEl.textContent = r.message || 'PIN ไม่ถูกต้อง';
    }
  }).catch(function() {
    if (errEl) errEl.textContent = 'เชื่อมต่อไม่สำเร็จ';
  });
}

// ===== AUTO-START LOAN BADGE (ก่อนเข้า HR tab) =====
(function() {
  function _hrAutoStart() {
    if (typeof _hrLoanBadgeStart === 'function') _hrLoanBadgeStart();
  }
  // รอให้ sidebar render + SCRIPT_URL พร้อม (localStorage)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(_hrAutoStart, 1200); });
  } else {
    setTimeout(_hrAutoStart, 1200);
  }
})();
