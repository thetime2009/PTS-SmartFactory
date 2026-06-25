// ══════════════════════════════════════════════════════════════
// hr.js v4.71  —  HR Module
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
const HR_SSO_LS   = 'ptts_hr_sso_cfg';
const HR_LEAVE_LS = 'ptts_hr_leave_cfg';
// ค่า default กฎการลา/ขาด
const HR_LEAVE_DEF = {
  absent: { monthly: { deduct: true,  divisor: 15 }, daily: { paid: false } },
  off:    { monthly: { deduct: false, divisor: 15 }, daily: { paid: false } },
};
function _hrLeaveCfg() {
  try {
    var raw = JSON.parse(localStorage.getItem(HR_LEAVE_LS) || '{}');
    return {
      absent: {
        monthly: Object.assign({}, HR_LEAVE_DEF.absent.monthly, (raw.absent && raw.absent.monthly) || {}),
        daily:   Object.assign({}, HR_LEAVE_DEF.absent.daily,   (raw.absent && raw.absent.daily)   || {}),
      },
      off: {
        monthly: Object.assign({}, HR_LEAVE_DEF.off.monthly, (raw.off && raw.off.monthly) || {}),
        daily:   Object.assign({}, HR_LEAVE_DEF.off.daily,   (raw.off && raw.off.daily)   || {}),
      },
    };
  } catch(e) { return HR_LEAVE_DEF; }
}
const HR_PAY_DEF = {
  mode: 'semi',            // 'semi' | 'monthly'
  p1: { start: 1, end: 15, payday: 16 },   // จ่ายวันที่ 16 เดือนเดียวกัน
  p2: { start: 16, end: 31, payday: 1 },   // จ่ายวันที่ 1 เดือนถัดไป
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

// ── ประกันสังคม ──────────────────────────────────────────────
function _hrCalcSSO(salary) {
  // พนักงานจ่าย 5% ของเงินเดือน ฐานสูงสุด 17,500 บาท → สูงสุด 875 บาท/เดือน (ปี 2569)
  var base = Math.min(Number(salary) || 0, 17500);
  return Math.round(base * 0.05);
}

// ── Settings ──────────────────────────────────────────────────
function _hrSSOMode() {
  // 'split' = แบ่งครึ่งต่องวด | 'p1' = หักงวด 1 เต็ม | 'p2' = หักงวด 2 เต็ม
  try { return localStorage.getItem(HR_SSO_LS) || 'split'; } catch(e) { return 'split'; }
}

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
  // เพิ่ม _t เพื่อป้องกัน browser cache GET responses
  const p = Object.assign({ action, _t: Date.now() }, params || {});
  return fetch(url + '?' + new URLSearchParams(p)).then(function(r) { return r.json(); });
}
function _hrPOST(action, body) {
  const url = _hrUrl();
  if (!url) return Promise.reject('ไม่พบ Script URL — กรุณาตั้งค่าใน ⚙️ ตั้งค่า');
  const payload = JSON.stringify(Object.assign({ action }, body || {}));
  return fetch(url, { method: 'POST', body: payload })
    .then(function(r) {
      // อ่าน text ก่อน แล้วค่อย parse JSON
      // เพื่อไม่ให้ Apps Script HTML error page ทำให้ตก catch โดยไม่ตั้งใจ
      return r.text().then(function(txt) {
        try { return JSON.parse(txt); }
        catch(e) {
          // server ตอบ non-JSON (HTML error page) — propagate เป็น error จริง
          return { status: 'error', message: 'Server error: ' + txt.slice(0, 300) };
        }
      });
    })
    .catch(function(netErr) {
      // ตรงนี้ = network/CORS error เท่านั้น (ไม่ใช่ JSON parse error แล้ว)
      // ถ้า error มาจาก .text() เอง หรือ network fail → fallback no-cors
      return fetch(url, { method: 'POST', mode: 'no-cors', body: payload })
        .then(function() { return { status: 'ok', _nocors: true }; });
    });
}


// ── Loan deduct notification badge ──────────────────────────
var _LOAN_NOTIFY_KEY = 'ptts_loan_notify';
function _hrSetLoanBadge() {
  try { localStorage.setItem(_LOAN_NOTIFY_KEY, '1'); } catch(e) {}
  _hrRefreshLoanBadge();
}
function _hrClearLoanBadge() {
  try { localStorage.removeItem(_LOAN_NOTIFY_KEY); } catch(e) {}
  var btn = document.getElementById('hrBtn8');
  if (btn) { var d = btn.querySelector('.loan-notify-dot'); if (d) d.remove(); }
}
function _hrRefreshLoanBadge() {
  var btn = document.getElementById('hrBtn8');
  if (!btn) return;
  var has = btn.querySelector('.loan-notify-dot');
  try {
    if (localStorage.getItem(_LOAN_NOTIFY_KEY)) {
      if (!has) { var dot = document.createElement('span'); dot.className = 'loan-notify-dot'; btn.appendChild(dot); }
    } else { if (has) has.remove(); }
  } catch(e) {}
}

// ── Sub-tab navigation ────────────────────────────────────────
function hrSubSwitch(n) {
  _hrSubCur = String(n);
  ['1', '2', '3', '4', '5', '6', '7', '8'].forEach(function(k) {
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
  if (n === '3') _hrRenderPayroll();
  if (n === '4') _hrRenderEmps();
  if (n === '5') _hrRenderSettings();
  if (n === '6') _hrRenderCal();
  if (n === '7') _hrRenderLoans();
  if (n === '8') { _hrClearLoanBadge(); _hrRenderLoanContracts(); }
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
  _hrRefreshLoanBadge();
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

  // Auto-select งวดตามวันที่ปัจจุบัน (เฉพาะครั้งแรกที่เปิด หรือเมื่อยังเป็น all)
  var _autopc = _hrPayCfg();
  if (_autopc.mode === 'semi' && _hrSumPeriod === 'all') {
    var _d = now.getDate();
    _hrSumPeriod = (_d >= _autopc.p1.start && _d <= _autopc.p1.end) ? 'p1' : 'p2';
  }

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
    // ── info box อธิบายวิธีคำนวณ ──
    '<div style="margin-top:14px;padding:12px 16px;background:rgba(99,102,241,.05);border:1px solid rgba(99,102,241,.18);border-radius:10px;font-size:.76rem;color:var(--t3);line-height:1.85">' +
      '<b style="color:var(--c1)">ℹ️ วิธีอ่านตัวเลขในการ์ด</b><br>' +
      '• <b style="color:var(--t2)">มา / ขาด / สาย</b> = จำนวนวันที่สแกนเข้างาน — ใช้แสดงสถิติเท่านั้น ไม่ใช่ฐานคำนวณค่าแรง<br>' +
      '• <b style="color:var(--t2)">รายเดือน</b>: เงินเดือนงวด = เงินเดือน ÷ 2 &nbsp;(ถ้าเลือกงวด) หรือเต็มเดือน &nbsp;→ หักเฉพาะวัน <b>ขาด</b> เท่านั้น (ตามกฎที่ตั้งใน ตั้งค่า HR)<br>' +
      '• <b style="color:var(--t2)">รายวัน</b>: ค่าแรง = วันที่ <b>มา</b> × ค่าแรง/วัน &nbsp;(ลา/หยุดได้ค่าแรงหรือไม่ขึ้นกับการตั้งค่า)' +
    '</div>' +
    '</div>';
  _hrLoadAndRender();
}

function _hrPeriodSelect() {
  var pc = _hrPayCfg();
  if (pc.mode !== 'semi') return '';
  var opts = [
    ['all',  'ทั้งเดือน'],
    ['p1',   'งวด 1 ('+pc.p1.start+'-'+pc.p1.end+')'],
    ['p2',   pc.p2.start > pc.p2.end ? 'งวด 2 ('+pc.p2.start+' เดือนก่อน – '+pc.p2.end+' เดือนนี้)' : 'งวด 2 ('+pc.p2.start+'–'+pc.p2.end+')'],
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
      if (pc.p2.start <= pc.p2.end) {
        // same-month (เช่น 16-31): ตรวจเดือนเดียวกัน
        return rY === ceY && rM === ceM && d >= pc.p2.start && d <= pc.p2.end;
      } else {
        // cross-month (เช่น 26 เดือนก่อน – 10 เดือนนี้)
        var pM = ceM === 1 ? 12 : ceM - 1;
        var pY = ceM === 1 ? ceY - 1 : ceY;
        if (rY === pY && rM === pM && d >= pc.p2.start) return true;
        if (rY === ceY && rM === ceM && d <= pc.p2.end) return true;
      }
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
    _hrGET('getHREmployees'),
    _hrGET('getHRLoanContracts').catch(function(){ return {data:[]}; })
  ]).then(function(results) {
    _hrAtt  = results[0].reduce(function(a,r){ return a.concat(r.data||[]); }, []);
    _hrEmps = results[1].data || [];
    var _lc2 = results[2];
    _hrLoanContracts = Array.isArray(_lc2) ? _lc2 : ((_lc2 && _lc2.data) ? _lc2.data : []);
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

  // แผนที่ attendance รายบุคคล สำหรับคำนวณ payslip
  const attByEmp = {};
  rows.forEach(function(r) {
    const id = String(r.empId);
    if (!attByEmp[id]) attByEmp[id] = [];
    attByEmp[id].push(r);
  });

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
    const empRec = _hrEmps.find(function(x) { return String(x.empId) === id; }) || null;
    const initials = e.name ? e.name.charAt(0) : '?';
    const thumbUrl = _hrDriveThumb(empRec && empRec.profileUrl);
    const avatarHtml = thumbUrl
      ? '<img src="' + thumbUrl + '" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid ' + ac + ';flex-shrink:0" onerror="this.style.display=\'none\'">'
      : '<div style="width:36px;height:36px;border-radius:50%;background:' + ac + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:800;flex-shrink:0">' + initials + '</div>';

    return '<div style="background:var(--bg-card);border:1.5px solid var(--bc-card);border-radius:14px;overflow:hidden">' +
      '<div style="background:' + ac + '18;padding:10px 14px;display:flex;align-items:center;gap:10px;border-bottom:1.5px solid ' + ac + '30">' +
        avatarHtml +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:700;font-size:.93rem;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + e.name + '</div>' +
          '<div style="font-size:.7rem;color:' + ac + ';font-weight:600;margin-top:1px">' +
            (e.dept || '—') + ' · ' + (e.type === 'daily' ? 'รายวัน' : 'รายเดือน') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:2px;padding:10px 10px;border-bottom:1px solid var(--bc-input)">' +
        stat(e.present,          'มา',       '#059669') +
        stat(e.absent,           'ขาด',      e.absent  > 0 ? '#dc2626' : 'var(--t4)') +
        stat(e.lateTimes,        'สายครั้ง', e.lateMin > 0 ? '#d97706' : 'var(--t4)') +
        stat(e.lateMin,          'สายนาที',  e.lateMin > 0 ? '#d97706' : 'var(--t4)', 'น.') +
        stat(e.otWD.toFixed(1),  'OT ปรกติ', '#4338ca', 'ชม.') +
        stat(e.otSun.toFixed(1), 'OT อา.',  '#b45309', 'ชม.') +
      '</div>' +
      '<div style="display:flex;gap:6px;padding:8px 10px;flex-wrap:wrap">' +
        '<button onclick="hrPrintAttReport(\'' + id + '\',\'' + _hrSumMon + '\',\'' + _hrSumPeriod + '\')" ' +
          'style="flex:1;min-width:60px;padding:6px 2px;background:#e0e7ff;color:#3730a3;border:1px solid #a5b4fc;border-radius:8px;cursor:pointer;font-family:\'Sarabun\',sans-serif;font-size:.77rem;font-weight:600">🖨️ รายงาน</button>' +
        (isManager ?
          '<button onclick="hrEditAtt(\'' + id + '\',\'' + _hrSumMon + '\',\'' + _hrSumPeriod + '\')" ' +
            'style="flex:1;min-width:60px;padding:6px 2px;background:#ffedd5;color:#9a3412;border:1px solid #fdba74;border-radius:8px;cursor:pointer;font-family:\'Sarabun\',sans-serif;font-size:.77rem;font-weight:600">📋 ตารางวันทำงาน</button>' : '') +
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
// PANEL 3 — สรุปเงินเดือน (Payroll)
// ══════════════════════════════════════════════════════════════
function _hrRenderPayroll() {
  const p = document.getElementById('hrPanel3');
  if (!p) return;

  const now = new Date();
  if (!_hrSumMon) _hrSumMon = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  // Auto-select งวดตามวันที่ปัจจุบัน (เฉพาะครั้งแรกที่เปิด)
  var _autopc = _hrPayCfg();
  if (_autopc.mode === 'semi' && _hrSumPeriod === 'all') {
    var _d = now.getDate();
    _hrSumPeriod = (_d >= _autopc.p1.start && _d <= _autopc.p1.end) ? 'p1' : 'p2';
  }

  p.innerHTML =
    '<div style="max-width:900px">' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">' +
      '<button onclick="_hrPayPrev()" style="padding:6px 14px;border-radius:8px;border:1px solid var(--bc-input);background:transparent;color:var(--t2);cursor:pointer;font-size:1rem">◀</button>' +
      '<div style="font-weight:700;font-size:.95rem;color:var(--c1);min-width:110px;text-align:center" id="hrPayMonLabel">' + _hrMLab(_hrSumMon) + '</div>' +
      '<button onclick="_hrPayNext()" style="padding:6px 14px;border-radius:8px;border:1px solid var(--bc-input);background:transparent;color:var(--t2);cursor:pointer;font-size:1rem">▶</button>' +
      _hrPeriodSelectPay() +
      '<button onclick="_hrPayLoadAndRender()" style="padding:6px 16px;border-radius:8px;background:rgba(99,102,241,.15);color:#818cf8;border:1px solid rgba(99,102,241,.4);cursor:pointer;font-size:.82rem;font-family:Sarabun,sans-serif">🔄 โหลดข้อมูล</button>' +
    '</div>' +
    '<div id="hrPayTable"><div style="color:var(--t3);font-size:.85rem">⏳ กำลังโหลด...</div></div>' +
    '</div>';

  _hrPayLoadAndRender();
}

function _hrPeriodSelectPay() {
  var pc = _hrPayCfg();
  if (pc.mode !== 'semi') return '';
  var opts = [
    ['all',  'ทั้งเดือน'],
    ['p1',   'งวด 1 ('+pc.p1.start+'-'+pc.p1.end+')'],
    ['p2',   pc.p2.start > pc.p2.end ? 'งวด 2 ('+pc.p2.start+' เดือนก่อน – '+pc.p2.end+' เดือนนี้)' : 'งวด 2 ('+pc.p2.start+'–'+pc.p2.end+')'],
  ];
  return '<select id="hrPayPeriodSel" onchange="_hrSumPeriod=this.value;_hrApplyPayFilter()" ' +
    'style="padding:6px 10px;border-radius:8px;border:1px solid var(--bc-input);background:var(--bg);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.82rem">' +
    opts.map(function(o){ return '<option value="'+o[0]+'"'+(_hrSumPeriod===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('') +
  '</select>';
}

function _hrApplyPayFilter() {
  var tbl = document.getElementById('hrPayTable');
  if (!tbl || !_hrAtt.length) return;
  var base = _hrAtt.filter(function(r) { return _hrMKey(r.date) === _hrSumMon; });
  if (_hrSumPeriod === 'p2') {
    var mp = _hrSumMon.split('-').map(Number);
    var pM = mp[1] === 1 ? 12 : mp[1] - 1;
    var pY = mp[1] === 1 ? mp[0]-1 : mp[0];
    var prevMon = pY + '-' + String(pM).padStart(2,'0');
    var prevRecs = _hrAtt.filter(function(r) { return _hrMKey(r.date) === prevMon; });
    base = base.concat(prevRecs);
  }
  tbl.innerHTML = _hrPayTableHtml(_hrFilterByPeriod(base, _hrSumPeriod, _hrSumMon));
}

function _hrPayLoadAndRender() {
  const tbl = document.getElementById('hrPayTable');
  if (!tbl) return;
  tbl.innerHTML = '<div style="color:var(--t3);font-size:.85rem">⏳ กำลังโหลด...</div>';

  var months = [_hrSumMon];
  if (_hrSumPeriod === 'p2') {
    var mp2 = _hrSumMon.split('-').map(Number);
    var pM2 = mp2[1] === 1 ? 12 : mp2[1]-1;
    var pY2 = mp2[1] === 1 ? mp2[0]-1 : mp2[0];
    months.push(pY2+'-'+String(pM2).padStart(2,'0'));
  }
  Promise.all([
    Promise.all(months.map(function(m){ return _hrGET('getHRAttendance', { month: m }); })),
    _hrGET('getHREmployees'),
    _hrGET('getHRLoanContracts').catch(function(){ return {data:[]}; }),
    _hrGET('getLoanRequests').catch(function(){ return {data:[]}; }),  // โหลดทุก status รวม closed (รอหัก)
    _hrGET('getSalaryPayments', { month: _hrSumMon }).catch(function(){ return {data:[]}; })
  ]).then(function(results) {
    _hrAtt  = results[0].reduce(function(a,r){ return a.concat(r.data||[]); }, []);
    _hrEmps = results[1].data || [];
    var _lc2 = results[2];
    _hrLoanContracts = Array.isArray(_lc2) ? _lc2 : ((_lc2 && _lc2.data) ? _lc2.data : []);
    var _lr = results[3];
    _hrLoans = Array.isArray(_lr) ? _lr : ((_lr && _lr.data) ? _lr.data : []);
    var _sp = results[4];
    _hrSalaryPaid = Array.isArray(_sp) ? _sp : ((_sp && _sp.data) ? _sp.data : []);
    var base = _hrAtt.filter(function(r) { return _hrMKey(r.date) === _hrSumMon; });
    if (_hrSumPeriod === 'p2') {
      var mp = _hrSumMon.split('-').map(Number);
      var pM = mp[1]===1?12:mp[1]-1, pY = mp[1]===1?mp[0]-1:mp[0];
      var prev = pY+'-'+String(pM).padStart(2,'0');
      base = base.concat(_hrAtt.filter(function(r){ return _hrMKey(r.date)===prev; }));
    }
    tbl.innerHTML = _hrPayTableHtml(_hrFilterByPeriod(base, _hrSumPeriod, _hrSumMon));
  }).catch(function(e) {
    tbl.innerHTML = '<div style="color:#f87171;font-size:.85rem">❌ ' + e + '</div>';
  });
}

function _hrPayPrev() {
  var mp = _hrSumMon.split('-').map(Number);
  var m = mp[1] - 1, y = mp[0];
  if (m < 1) { m = 12; y--; }
  _hrSumMon = y + '-' + String(m).padStart(2, '0');
  var lbl = document.getElementById('hrPayMonLabel');
  if (lbl) lbl.textContent = _hrMLab(_hrSumMon);
  _hrPayLoadAndRender();
}

function _hrPayNext() {
  var mp = _hrSumMon.split('-').map(Number);
  var m = mp[1] + 1, y = mp[0];
  if (m > 12) { m = 1; y++; }
  _hrSumMon = y + '-' + String(m).padStart(2, '0');
  var lbl = document.getElementById('hrPayMonLabel');
  if (lbl) lbl.textContent = _hrMLab(_hrSumMon);
  _hrPayLoadAndRender();
}

function _hrPayTableHtml(rows) {
  var isManager = !_hrSession || _hrSession.role === 'manager';
  // Build paidMap keyed by empId+'|'+period from cached _hrSalaryPaid
  var paidMap = {};
  (_hrSalaryPaid||[]).forEach(function(p){
    paidMap[p.empId+'|'+p.period] = p;
    // index 'all' ด้วย เพื่อให้ view "ทั้งเดือน" เห็นว่าจ่ายแล้ว
    if (!paidMap[p.empId+'|all']) paidMap[p.empId+'|all'] = p;
  });
  if (!rows.length) {
    return '<div style="color:var(--t3);font-size:.85rem">ไม่พบข้อมูลเดือน ' + _hrMLab(_hrSumMon) + ' — กรุณานำเข้าข้อมูลก่อน</div>';
  }

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

  const attByEmp = {};
  rows.forEach(function(r) {
    const id = String(r.empId);
    if (!attByEmp[id]) attByEmp[id] = [];
    attByEmp[id].push(r);
  });

  const monthly = Object.keys(emp).filter(function(id) { return emp[id].type !== 'daily'; });
  const daily   = Object.keys(emp).filter(function(id) { return emp[id].type === 'daily'; });

  function payCard(id, paidRec) {
    var e = emp[id];
    var isDaily = e.type === 'daily';
    var headerBg = isDaily ? '#0e7490' : '#1e40af';
    var empRec = _hrEmps.find(function(x) { return String(x.empId) === id; }) || null;
    var ps = _hrCalcPayslip(empRec, attByEmp[id] || [], _hrSumMon, _hrSumPeriod);
    var phone = (empRec && empRec.phone) ? empRec.phone.replace(/[^0-9]/g,'') : '';
    var initials = e.name ? e.name.charAt(0) : '?';
    var thumbUrl = _hrDriveThumb(empRec && empRec.profileUrl);
    var avatarHtml = thumbUrl
      ? '<img src="' + thumbUrl + '" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.5);flex-shrink:0">'
      : '<div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.2);color:#fff;display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:800;flex-shrink:0">' + initials + '</div>';

    function iRow(lbl, val, plus) {
      return '<div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:3px">'
        + '<span style="color:var(--t3)">' + lbl + '</span>'
        + '<span style="color:var(--t1)">' + (plus ? '+' : '') + '\u0e3f' + _hrFmt(val) + '</span></div>';
    }
    function dRow(lbl, val) {
      return '<div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:3px">'
        + '<span style="color:var(--t3)">' + lbl + '</span>'
        + '<span style="color:#f87171">&minus;\u0e3f' + _hrFmt(val) + '</span></div>';
    }
    function sumRow(lbl, val, col) {
      return '<div style="display:flex;justify-content:space-between;font-size:.8rem;font-weight:700;margin-top:5px;padding-top:5px;border-top:1px dashed var(--bc-input)">'
        + '<span style="color:' + col + '">' + lbl + '</span>'
        + '<span style="color:' + col + '">\u0e3f' + _hrFmt(val) + '</span></div>';
    }

    // รายได้
    var baseLabel = isDaily
      ? ('\u0e04\u0e48\u0e32\u0e41\u0e23\u0e07 (' + ps.present + ' \u0e27\u0e31\u0e19 \u00d7 \u0e3f' + _hrFmt(ps.dailyRate) + ')')
      : '\u0e40\u0e07\u0e34\u0e19\u0e40\u0e14\u0e37\u0e2d\u0e19';
    var incHtml = iRow(baseLabel, ps.basePay, false);
    if (ps.otPayWD  > 0) incHtml += iRow('OT \u0e1b\u0e23\u0e01\u0e15\u0e34 (' + ps.otWDH  + ' \u0e0a\u0e21.)', ps.otPayWD,  true);
    if (ps.otPaySun > 0) incHtml += iRow('OT \u0e2d\u0e32\u0e17\u0e34\u0e15\u0e22\u0e4c (' + ps.otSunH + ' \u0e0a\u0e21.)', ps.otPaySun, true);
    incHtml += sumRow('\u0e23\u0e27\u0e21\u0e23\u0e32\u0e22\u0e23\u0e31\u0e1a', ps.gross, '#059669');

    // รายหัก
    var totalDed = 0, fixedDed = 0, dedHtml = '', _pcEditIdx = 0;
    if (ps.absentDeduct > 0) {
      dedHtml += dRow('\u0e02\u0e32\u0e14\u0e07\u0e32\u0e19 ' + ps.absent + ' \u0e27\u0e31\u0e19', ps.absentDeduct);
      totalDed += ps.absentDeduct; fixedDed += ps.absentDeduct;
    }
    if (ps.loanDeductItems && ps.loanDeductItems.length > 0) {
      ps.loanDeductItems.forEach(function(ld) {
        if (!paidRec && (ld.source === 'contract' || ld.source === 'request')) {
          // Editable textbox
          dedHtml += '<div style="display:flex;justify-content:space-between;align-items:center;font-size:.78rem;margin-bottom:3px">'
            + '<span style="color:var(--t3)">' + ld.label + '</span>'
            + '<div style="display:flex;align-items:center;gap:1px">'
              + '<span style="color:#f87171;font-size:.75rem">&minus;\u0e3f</span>'
              + '<input type="number" id="pcLd_' + id + '_' + _pcEditIdx + '"'
                + ' data-src="' + ld.source + '"'
                + ' data-key="' + (ld.loanId || ld.requestId || '') + '"'
                + ' data-advc="' + (ld.advanceClosed ? '1' : '0') + '"'
                + ' data-lbl="' + (ld.label||'').replace(/"/g,'') + '"'
                + ' value="' + ld.amount.toFixed(2) + '" min="0" step="0.01"'
                + ' oninput="_hrPCRecalc(\'' + id + '\')"'
                + ' style="width:88px;border:1px solid #fca5a5;border-radius:6px;padding:2px 6px;background:#fff5f5;color:#dc2626;font-family:Sarabun,sans-serif;font-size:.78rem;font-weight:700;text-align:right">'
            + '</div></div>';
          _pcEditIdx++;
        } else {
          dedHtml += dRow(ld.label, ld.amount);
          fixedDed += ld.amount;
        }
        totalDed += ld.amount;
      });
    }
    var baseForEdit = (ps.gross - (ps.offDeduct||0) - fixedDed).toFixed(2);
    var dedSumHtml = dedHtml
      ? '<input type="hidden" id="pcBase_' + id + '" value="' + baseForEdit + '">'
        + '<div style="display:flex;justify-content:space-between;font-size:.8rem;font-weight:700;margin-top:5px;padding-top:5px;border-top:1px dashed var(--bc-input)">'
          + '<span style="color:#ef4444">\u0e23\u0e27\u0e21\u0e23\u0e32\u0e22\u0e2b\u0e31\u0e01</span>'
          + '<span id="pcTDed_' + id + '" style="color:#ef4444">&minus;\u0e3f' + _hrFmt(totalDed) + '</span></div>'
      : '';
    var dedSection = dedHtml
      ? '<div style="padding:10px 14px;border-bottom:0.5px solid var(--bc-input)">'
          + '<div style="font-size:.68rem;font-weight:700;color:var(--t3);margin-bottom:6px;letter-spacing:.5px">\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e2b\u0e31\u0e01</div>'
          + dedHtml + dedSumHtml + '</div>'
      : '';

    var loanJson = '';
    try { loanJson = encodeURIComponent(JSON.stringify(ps.loanDeductItems || [])); } catch(je) { loanJson = encodeURIComponent('[]'); }

    var Q = '&quot;';

    // Badge และปุ่ม — แยกตามสถานะ paid/pending
    var badgeHtml, actionHtml;
    if (paidRec) {
      // โอนแล้ว
      var delBtn = isManager
        ? ' <button onclick="hrDeleteSalaryPayment(' + Q + paidRec.payId + Q + ')" '
          + 'title="\u0e25\u0e1a\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34\u0e01\u0e32\u0e23\u0e42\u0e2d\u0e19" '
          + 'style="background:none;border:none;cursor:pointer;font-size:.8rem;opacity:.6;padding:0 0 0 4px">\ud83d\uddd1\ufe0f</button>'
        : '';
      var slipBtn = paidRec.slipUrl
        ? ' <a href="' + paidRec.slipUrl + '" target="_blank" title="\u0e14\u0e39\u0e43\u0e1a\u0e42\u0e2d\u0e19" '
          + 'style="color:#6ee7b7;font-size:.8rem;text-decoration:none;padding:0 4px">\ud83e\uddfe</a>'
        : '';
      var histDi = '';
      try { histDi = encodeURIComponent(JSON.stringify(paidRec.deductItems || [])); } catch(e) {}
      var paidSlipBtn = '<button onclick="hrOpenPayslip(' + Q + id + Q + ',' + Q + _hrSumMon + Q + ',' + Q + _hrSumPeriod + Q + ',' + Q + histDi + Q + ')" '
        + 'style="margin-top:8px;width:100%;padding:7px;background:#f0fdf4;color:#166534;border:0.5px solid #86efac;border-radius:8px;cursor:pointer;font-family:Sarabun,sans-serif;font-size:.78rem;font-weight:700">'
        + '\ud83e\uddfe \u0e14\u0e39\u0e2a\u0e25\u0e34\u0e1b</button>';
      badgeHtml = '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0">'
        + '<span style="font-size:.65rem;padding:3px 9px;border-radius:99px;background:#065f46;color:#6ee7b7;font-weight:700">\u2705 \u0e42\u0e2d\u0e19\u0e41\u0e25\u0e49\u0e27</span>'
        + '<span style="font-size:.6rem;color:rgba(255,255,255,.6)">' + paidRec.transferDate + slipBtn + delBtn + '</span>'
        + '</div>';
      actionHtml = '<div style="padding:0 14px 10px">' + paidSlipBtn + '</div>';
    } else {
      // รอยืนยัน
      var ocSlip    = 'hrOpenPayslip(' + Q + id + Q + ',' + Q + _hrSumMon + Q + ',' + Q + _hrSumPeriod + Q + ')';
      var ocConfirm = 'hrConfirmPayrollFromCard(' + Q + id + Q + ',' + Q + encodeURIComponent(e.name||'') + Q + ',' + Q + _hrSumMon + Q + ',' + Q + _hrSumPeriod + Q + ')';
      var ocQR      = phone ? '(function(){ var _n=parseFloat((document.getElementById(' + Q + 'pcNet_' + id + Q + ')||{}).getAttribute(' + Q + 'data-net' + Q + ')||' + ps.net.toFixed(2) + '); hrShowPromptPayQR(' + Q + phone + Q + ',_n,' + Q + encodeURIComponent(e.name||'') + Q + ',' + Q + id + Q + '); })()' : '';

      var btnStyle1 = 'flex:1;padding:8px 4px;background:#eff6ff;color:#1d4ed8;border:0.5px solid #93c5fd;border-radius:8px;cursor:pointer;font-family:Sarabun,sans-serif;font-size:.78rem;font-weight:700';
      var btnStyle2 = 'flex:1;padding:8px 4px;background:#f5f3ff;color:#6d28d9;border:0.5px solid #c4b5fd;border-radius:8px;cursor:pointer;font-family:Sarabun,sans-serif;font-size:.78rem;font-weight:700';
      var btnStyle3 = 'width:100%;margin-top:8px;padding:10px;background:#e2e8f0;color:#94a3b8;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-family:Sarabun,sans-serif;font-size:.84rem;font-weight:600';

      var slipBtn    = '<button onclick="' + ocSlip + '" style="' + btnStyle1 + '">\ud83e\uddfe \u0e14\u0e39\u0e2a\u0e25\u0e34\u0e1b</button>';
      var qrBtn      = phone ? '<button onclick="' + ocQR + '" style="' + btnStyle2 + '">&#x1F532; QR \u0e42\u0e2d\u0e19</button>' : '<div style="flex:1"></div>';
      var confirmBtn = '<button onclick="' + ocConfirm + '" style="' + btnStyle3 + '">⏳ รอโอนเงินเดือน</button>';

      badgeHtml  = '<span style="font-size:.68rem;padding:3px 9px;border-radius:99px;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-weight:700;flex-shrink:0;box-shadow:0 1px 4px rgba(234,88,12,.4)">\u0e23\u0e2d\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19</span>';
      actionHtml = '<div style="padding:10px 14px">'
        + '<div style="display:flex;gap:8px">' + slipBtn + qrBtn + '</div>'
        + confirmBtn
        + '</div>';
    }

    var outerBorder = paidRec ? '2px solid #4ade80' : '0.5px solid var(--bc-input)';
    var watermarkHtml = paidRec
      ? '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:3;transform:rotate(-30deg)">'
          + '<span style="font-size:2.4rem;font-weight:900;color:rgba(34,197,94,0.22);white-space:nowrap;letter-spacing:3px;font-family:Sarabun,sans-serif">'
          + '\u2705 \u0e42\u0e2d\u0e19\u0e41\u0e25\u0e49\u0e27'
          + '</span></div>'
      : '';
    var paidBar = paidRec
      ? '<div style="background:#dcfce7;border-top:1px solid #86efac;padding:9px 14px;display:flex;align-items:center;justify-content:center;gap:8px">'
          + '<span style="font-size:1rem">\u2705</span>'
          + '<span style="font-size:.8rem;font-weight:700;color:#166534">\u0e42\u0e2d\u0e19\u0e40\u0e07\u0e34\u0e19\u0e41\u0e25\u0e49\u0e27 ' + paidRec.transferDate + ' \u00b7 \u0e3f' + _hrFmt(paidRec.amount) + '</span>'
        + '</div>'
      : '';

    return '<div style="background:var(--bg-card);border:' + outerBorder + ';border-radius:14px;overflow:hidden;position:relative">'
      + watermarkHtml
      + '<div style="background:' + headerBg + ';padding:12px 14px">'
        + '<div style="display:flex;align-items:center;gap:10px">'
          + avatarHtml
          + '<div style="flex:1;min-width:0">'
            + '<div style="font-weight:700;font-size:.92rem;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + e.name + '</div>'
            + '<div style="font-size:.7rem;color:rgba(255,255,255,.75);margin-top:1px">' + (e.dept||'\u2014') + ' \u00b7 ' + (isDaily?'\u0e23\u0e32\u0e22\u0e27\u0e31\u0e19':'\u0e23\u0e32\u0e22\u0e40\u0e14\u0e37\u0e2d\u0e19') + '</div>'
          + '</div>'
          + badgeHtml
        + '</div>'
      + '</div>'
      + '<div style="padding:10px 14px;border-bottom:0.5px solid var(--bc-input)">'
        + '<div style="font-size:.68rem;font-weight:700;color:var(--t3);margin-bottom:6px;letter-spacing:.5px">\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49</div>'
        + incHtml
      + '</div>'
      + dedSection
      + '<div style="padding:10px 14px' + (actionHtml ? ';border-bottom:0.5px solid var(--bc-input)' : '') + '">'
        + '<div style="background:#f0fdf4;border:0.5px solid #86efac;border-radius:8px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">'
          + '<span style="font-size:.82rem;color:#166534;font-weight:700">\u0e23\u0e31\u0e1a\u0e2a\u0e38\u0e17\u0e18\u0e34</span>'
          + '<span id="pcNet_' + id + '" data-net="' + ps.net.toFixed(2) + '" style="font-size:1.15rem;font-weight:800;color:#166534">\u0e3f' + _hrFmt(ps.net) + '</span>'
        + '</div>'
      + '</div>'
      + actionHtml
      + paidBar
    + '</div>';
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
    monthly.forEach(function(id) { html += payCard(id, paidMap[id+'|'+_hrSumPeriod] || paidMap[id+'|all'] || null); });
  }
  if (daily.length) {
    html += sectionLabel('🔧 รายวัน', daily.length, '#0891b2');
    daily.forEach(function(id) { html += payCard(id, paidMap[id+'|'+_hrSumPeriod] || paidMap[id+'|all'] || null); });
  }
  html += '</div>';
  return html;
}

// ══════════════════════════════════════════════════════════════
// UTILITY — payslip row + PromptPay QR
// ══════════════════════════════════════════════════════════════

function _hrPayRow(label, val, bold) {
  var neg = val < 0;
  var color = neg ? '#dc2626' : bold ? '#1e293b' : '#374151';
  return '<tr>' +
    '<td style="padding:3px 0;color:' + (bold ? '#374151' : '#64748b') + ';' + (bold ? 'font-weight:700' : '') + '">' + label + '</td>' +
    '<td style="padding:3px 0;text-align:right;color:' + color + ';' + (bold ? 'font-weight:700' : '') + ';' + (bold ? 'border-top:1px solid #e2e8f0;padding-top:5px' : '') + '">' +
      (neg ? '−' : '') + '฿' + _hrFmt(Math.abs(val)) +
    '</td></tr>';
}

function _hrCRC16(str) {
  var crc = 0xFFFF;
  for (var i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (var j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc;
}

function _hrPromptPayPayload(phone, amount) {
  function tlv(id, val) { return id + String(val.length).padStart(2,'0') + val; }
  // Normalize phone → 0066XXXXXXXXX (13 digits)
  var p = phone.replace(/[^0-9]/g,'');
  if (p.startsWith('66')) p = p.slice(2);
  if (p.startsWith('0')) p = p.slice(1);
  p = '0066' + p;
  var acctInfo = tlv('00','A000000677010111') + tlv('01', p);
  var payload =
    tlv('00','01') +
    tlv('01','12') +
    tlv('29', acctInfo) +
    tlv('52','0000') +
    tlv('53','764') +
    (amount > 0 ? tlv('54', parseFloat(amount).toFixed(2)) : '') +
    tlv('58','TH') +
    tlv('59','N/A') +
    tlv('60','Bangkok') +
    '6304';
  var crc = _hrCRC16(payload).toString(16).toUpperCase().padStart(4,'0');
  return payload + crc;
}

function hrShowPromptPayQR(phone, amount, nameEncoded, empId) {
  var name = decodeURIComponent(nameEncoded || '');
  var payload = _hrPromptPayPayload(phone, amount);
  // Remove existing modal
  var old = document.getElementById('hrQRModal');
  if (old) old.remove();

  var ovl = document.createElement('div');
  ovl.id = 'hrQRModal';
  ovl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  ovl.onclick = function(ev) { if (ev.target === ovl) ovl.remove(); };
  ovl.innerHTML =
    '<div style="background:#fff;border-radius:20px;padding:24px 20px;max-width:300px;width:100%;text-align:center;position:relative;box-shadow:0 8px 40px rgba(0,0,0,.25)">' +
      '<button onclick="document.getElementById(\'hrQRModal\').remove()" ' +
        'style="position:absolute;top:10px;right:14px;background:none;border:none;font-size:1.3rem;cursor:pointer;color:#94a3b8;line-height:1">✕</button>' +
      '<div style="font-size:.72rem;color:#7c3aed;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px">พร้อมเพย์</div>' +
      '<div style="font-size:1rem;font-weight:800;color:#1e293b;margin-bottom:2px">' + name + '</div>' +
      '<div style="font-size:.78rem;color:#64748b;margin-bottom:14px">📱 0' + phone.replace(/^0+66/,'').replace(/^0+/,'').replace(/(\d{2})(\d{3})(\d{4})/,'$1-$2-$3') + '</div>' +
      '<div id="hrQRCanvas" style="display:inline-block;padding:10px;background:#fff;border:2px solid #e2e8f0;border-radius:12px;margin-bottom:14px"></div>' +
      '<div style="background:linear-gradient(135deg,#059669,#10b981);color:#fff;padding:10px 20px;border-radius:10px;font-size:1.25rem;font-weight:800">฿' + _hrFmt(amount) + '</div>' +
      '<div style="font-size:.7rem;color:#94a3b8;margin-top:8px;margin-bottom:14px">สแกนเพื่อโอนเงินเดือน — พร้อมเพย์</div>' +
      '<div style="margin-top:2px">' +
        '<button onclick="document.getElementById(\'hrQRModal\').remove()" ' +
          'style="width:100%;padding:10px;background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;border-radius:10px;cursor:pointer;font-family:\'Sarabun\',sans-serif;font-size:.88rem;font-weight:700">ปิด — กลับไปแนบสลิป</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ovl);

  // Generate QR after render
  setTimeout(function() {
    var canvas = document.getElementById('hrQRCanvas');
    if (!canvas) return;
    if (typeof QRCode !== 'undefined') {
      new QRCode(canvas, { text: payload, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
    } else {
      canvas.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(payload) + '" style="width:220px;height:220px">';
    }
  }, 80);
}

// ══════════════════════════════════════════════════════════════
// PANEL 3 — พนักงาน
// ══════════════════════════════════════════════════════════════
function _hrRenderEmps() {
  const p = document.getElementById('hrPanel4');
  if (!p) return;
  p.innerHTML = '<div style="color:var(--t3);font-size:.85rem">⏳ กำลังโหลด...</div>';

  _hrGET('getHREmployees').then(function(res) {
    _hrEmps = res.data || [];
    p.innerHTML = _hrEmpsHtml();
  }).catch(function(e) {
    p.innerHTML = '<div style="color:#f87171">❌ ' + e + '</div>';
  });
}

// แปลง Google Drive URL ทุกรูปแบบ → thumbnail URL ที่โหลดได้ใน <img>
function _hrDriveThumb(url) {
  if (!url) return '';
  // ดึง file ID จาก URL รูปแบบต่างๆ
  var m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
          url.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
          url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w400-h400';
  return url; // fallback URL เดิม
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
    const initials = e.name ? e.name.trim().charAt(0).toUpperCase() : '?';

    // photo zone — 96px circle centered
    const thumbUrl = _hrDriveThumb(e.profileUrl);
    const photoZone = thumbUrl
      ? '<img src="' + thumbUrl + '" alt="photo" ' +
          'style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid ' + ac + ';background:var(--bg2)" ' +
          'onerror="this.outerHTML=\'<div style=&quot;width:88px;height:88px;border-radius:50%;background:' + ac + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:800&quot;>' + initials + '</div>\'">'
      : '<div style="width:88px;height:88px;border-radius:50%;background:' + ac + '22;border:2px dashed ' + ac + '60;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px">' +
          '<span style="font-size:2rem;line-height:1;color:' + ac + ';font-weight:800">' + initials + '</span>' +
          '<span style="font-size:.55rem;color:' + ac + ';opacity:.7">ยังไม่มีรูป</span>' +
        '</div>';

    function infoItem(label, val) {
      if (!val) return '';
      return '<div style="display:flex;gap:6px;align-items:flex-start;padding:5px 0;border-bottom:1px solid var(--bc-input)">' +
        '<span style="font-size:.68rem;color:var(--t3);white-space:nowrap;min-width:84px;padding-top:1px">' + label + '</span>' +
        '<span style="font-size:.8rem;color:var(--t1);word-break:break-word">' + val + '</span>' +
      '</div>';
    }

    return '<div style="background:var(--bg-card);border:1.5px solid var(--bc-card);border-radius:14px;overflow:hidden">' +
      // ── photo + name header ──
      '<div style="background:' + ac + '12;padding:16px 14px 12px;display:flex;flex-direction:column;align-items:center;gap:8px;border-bottom:1.5px solid ' + ac + '25;position:relative">' +
        '<span style="position:absolute;top:10px;right:10px;background:' + ac + '22;color:' + ac + ';border-radius:6px;padding:2px 8px;font-size:.65rem;font-weight:700">' + (isDaily ? 'รายวัน' : 'รายเดือน') + '</span>' +
        photoZone +
        '<div style="text-align:center">' +
          '<div style="font-weight:700;font-size:.96rem;color:var(--t1)">' + e.name + '</div>' +
          '<div style="font-size:.7rem;color:' + ac + ';font-weight:600;margin-top:2px">' + (e.dept || '—') + (e.position ? ' · ' + e.position : '') + '</div>' +
        '</div>' +
      '</div>' +
      // ── รายละเอียด ──
      '<div style="padding:10px 14px">' +
        infoItem('รหัส', e.empId) +
        infoItem('เบอร์โทร', e.phone) +
        infoItem('บัตรประชาชน', e.idCard ? e.idCard.replace(/(\d{1})(\d{4})(\d{5})(\d{2})(\d{1})/, '$1-$2-$3-$4-$5') : '') +
        infoItem('ที่อยู่', e.address) +
        infoItem(payLabel, '฿' + payVal) +
        infoItem('OT ปกติ/อา.', (e.otRateWD||100) + '% / ' + (e.otRateSun||200) + '%') +
        infoItem('วงเงินเบิก/เดือน', e.advanceBudget ? '฿' + _hrFmt(e.advanceBudget) : '') +
        // ── allowances ──
        ((e.allowances && e.allowances.filter(function(a){return a.amount>0;}).length)
          ? '<div style="margin-top:6px;padding:6px 0;border-top:1px dashed var(--bc-input)">'
            + '<div style="font-size:.65rem;font-weight:700;color:#059669;margin-bottom:4px;letter-spacing:.4px">💰 รายได้อื่นๆ</div>'
            + e.allowances.filter(function(a){return a.amount>0;}).map(function(a){
                return '<div style="display:flex;justify-content:space-between;font-size:.75rem;color:var(--t2);padding:1px 0">'
                  + '<span>' + a.label + '</span><span style="font-weight:600;color:#059669">฿' + _hrFmt(a.amount) + '</span></div>';
              }).join('')
            + '</div>'
          : '') +
        '<div style="margin-top:6px">' +
          (e.ssoEnabled !== false
            ? '<span style="font-size:.65rem;padding:2px 8px;background:#dcfce7;color:#15803d;border-radius:5px;font-weight:700">🛡 ประกันสังคม</span>'
            : '<span style="font-size:.65rem;padding:2px 8px;background:#fef9c3;color:#854d0e;border-radius:5px;font-weight:700">⏸ ยังไม่หักประกัน</span>') +
        '</div>' +
        (e.idCardUrl ? '<div style="margin-top:6px"><a href="' + e.idCardUrl + '" target="_blank" style="font-size:.75rem;color:#3b82f6;text-decoration:none">🪪 ดูสแกนบัตร</a></div>' : '') +
      '</div>' +
      // ── ปุ่ม ──
      '<div style="display:flex;gap:8px;padding:8px 12px;border-top:1px solid var(--bc-input)">' +
        '<button onclick="hrEditEmp(' + i + ')" style="flex:1;padding:6px;border-radius:8px;border:1px solid rgba(99,102,241,.35);background:rgba(99,102,241,.08);color:#6366f1;cursor:pointer;font-family:\'Sarabun\',sans-serif;font-size:.8rem;font-weight:600">✏️ แก้ไข</button>' +
        '<button onclick="hrDelEmp(' + i + ')" style="flex:1;padding:6px;border-radius:8px;border:1px solid rgba(248,113,113,.3);background:rgba(248,113,113,.07);color:#f87171;cursor:pointer;font-family:\'Sarabun\',sans-serif;font-size:.8rem;font-weight:600">🗑 ลบ</button>' +
      '</div>' +
    '</div>';
  }).join('');

  return '<div>' + addBtn +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px">' + cards + '</div></div>';
}
function _hrEmpAllowAdd() {
  var list = document.getElementById('empFAllowList');
  if (!list) return;
  var i = list.children.length;
  var div = document.createElement('div');
  div.id = 'empFA_' + i;
  div.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;align-items:center';
  div.innerHTML = '<input id="empFALbl_' + i + '" type="text" placeholder="ชื่อรายการ เช่น ค่าตำแหน่ง" style="flex:1;padding:7px 10px;border:1px solid var(--bc-input);border-radius:7px;font-family:Sarabun,sans-serif;font-size:.83rem;background:var(--bg-input);color:var(--t1)">'
    + '<input id="empFAAmt_' + i + '" type="number" min="0" placeholder="0" value="0" style="width:100px;padding:7px 10px;border:1px solid var(--bc-input);border-radius:7px;font-family:Sarabun,sans-serif;font-size:.83rem;background:var(--bg-input);color:var(--t1)">'
    + '<button type="button" onclick="_hrEmpAllowRemove(' + i + ')" style="background:#fee2e2;color:#dc2626;border:none;border-radius:7px;width:28px;height:28px;cursor:pointer;font-size:.9rem;flex-shrink:0">✕</button>';
  list.appendChild(div);
}
function _hrEmpAllowRemove(i) {
  var el = document.getElementById('empFA_' + i);
  if (el) el.remove();
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
        '<div><label style="font-size:.76rem;color:var(--t3);display:block;margin-bottom:3px">PIN เข้าระบบ (4 หลัก)</label><div style="position:relative"><input id="empFPin" type="password" value="' + (emp && emp.pin ? emp.pin : '') + '" placeholder="ตั้ง PIN" maxlength="6" style="width:100%;padding:8px 40px 8px 10px;border-radius:8px;border:1px solid var(--bc-input);background:var(--card);color:var(--t1);font-family:Sarabun,sans-serif;box-sizing:border-box"><button type="button" id="empFPinEye" onclick="hrTogglePinEye()" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:1.1rem;padding:0;line-height:1">👁</button></div></div>' +
      '</div>' +
      // ── เอกสาร / รูปถ่าย ──
      '<div style="font-size:.72rem;font-weight:700;color:#6366f1;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">เอกสาร / รูปถ่าย (เก็บที่ Drive)</div>' +
      fileRow('empFProfile', '📷 รูปประจำตัว', emp && emp.profileUrl || '') +
      fileRow('empFIdScan',  '🪪 สแกนบัตรประชาชน', emp && emp.idCardUrl || '') +
      // ── สวัสดิการ / การหัก ──
      '<div style="font-size:.72rem;font-weight:700;color:#6366f1;margin:10px 0 6px;text-transform:uppercase;letter-spacing:.5px">สวัสดิการ / การหัก</div>' +
      '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(99,102,241,.05);border:1px solid rgba(99,102,241,.15);border-radius:8px;cursor:pointer">' +
        '<input type="checkbox" id="empFSSO"' + (emp && emp.ssoEnabled !== false ? ' checked' : '') + ' style="width:16px;height:16px;cursor:pointer;accent-color:#6366f1">' +
        '<div>' +
          '<div style="font-size:.83rem;font-weight:600;color:var(--t1)">หักประกันสังคม</div>' +
          '<div style="font-size:.72rem;color:var(--t3)">5% ของเงินเดือน (สูงสุด ฿750/เดือน) ตาม พ.ร.บ. ประกันสังคม</div>' +
        '</div>' +
      '</label>' +
      // ── รายได้อื่นๆ (allowances) ──
      '<div style="font-size:.72rem;font-weight:700;color:#059669;margin:12px 0 6px;text-transform:uppercase;letter-spacing:.5px">รายได้อื่นๆ (ค่าตำแหน่ง / ค่าอาหาร ฯลฯ)</div>' +
      '<div id="empFAllowList">' + (function() {
        var rows = (emp && emp.allowances) || [];
        if (!rows.length) rows = [{ label: '', amount: 0 }];
        return rows.map(function(a, i) {
          return '<div id="empFA_' + i + '" style="display:flex;gap:6px;margin-bottom:6px;align-items:center">' +
            '<input id="empFALbl_' + i + '" type="text" placeholder="ชื่อรายการ เช่น ค่าตำแหน่ง" value="' + (a.label||'') + '" style="flex:1;padding:7px 10px;border:1px solid var(--bc-input);border-radius:7px;font-family:Sarabun,sans-serif;font-size:.83rem;background:var(--bg-input);color:var(--t1)">' +
            '<input id="empFAAmt_' + i + '" type="number" min="0" placeholder="0" value="' + (a.amount||0) + '" style="width:100px;padding:7px 10px;border:1px solid var(--bc-input);border-radius:7px;font-family:Sarabun,sans-serif;font-size:.83rem;background:var(--bg-input);color:var(--t1)">' +
            '<button type="button" onclick="_hrEmpAllowRemove(' + i + ')" style="background:#fee2e2;color:#dc2626;border:none;border-radius:7px;width:28px;height:28px;cursor:pointer;font-size:.9rem;flex-shrink:0">✕</button>' +
          '</div>';
        }).join('');
      })() + '</div>' +
      '<button type="button" onclick="_hrEmpAllowAdd()" style="margin-top:4px;padding:6px 14px;background:rgba(5,150,105,.1);color:#059669;border:1px dashed #059669;border-radius:8px;font-family:Sarabun,sans-serif;font-size:.8rem;cursor:pointer">+ เพิ่มรายการ</button>' +
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
        ssoEnabled: document.getElementById('empFSSO') ? document.getElementById('empFSSO').checked : true,
        allowances: (function() {
          var list = document.getElementById('empFAllowList');
          if (!list) return [];
          var result = [];
          for (var i = 0; i < list.children.length; i++) {
            var lbl = document.getElementById('empFALbl_' + i);
            var amt = document.getElementById('empFAAmt_' + i);
            if (lbl && amt && lbl.value.trim()) {
              result.push({ label: lbl.value.trim(), amount: parseFloat(amt.value) || 0 });
            }
          }
          return result;
        })(),
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

function hrTogglePinEye() {
  var inp = document.getElementById('empFPin');
  var btn = document.getElementById('empFPinEye');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (btn) btn.textContent = inp.type === 'password' ? '👁' : '🙈';
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
  const p = document.getElementById('hrPanel6');
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
      ((_hrSession && _hrSession.role !== 'emp') ?
        '<button onclick="_hrCalLoad()" style="padding:8px 16px;border-radius:9px;background:rgba(99,102,241,.12);color:#818cf8;border:1px solid rgba(99,102,241,.3);font-family:\'Sarabun\',sans-serif;font-size:.84rem;cursor:pointer">🔄 โหลดวันหยุด</button>' : '') +
      '<button onclick="_hrCalPrint()" style="padding:8px 20px;border-radius:9px;background:var(--c1);color:#fff;border:none;font-family:\'Sarabun\',sans-serif;font-size:.84rem;font-weight:700;cursor:pointer">🖨️ พิมพ์ปฏิทิน</button>' +
      ((_hrSession && _hrSession.role !== 'emp') ?
        '<span style="font-size:.74rem;color:var(--t3)">💡 คลิกวันที่เพื่อเพิ่ม / แก้ไข / ลบวันหยุด</span>' : '') +
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
        'onmouseover="this.style.filter=\'brightness(.93)\'" onmouseout="this.style.filter=\'\'">'+
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
  // employee: read-only — แสดงชื่อวันหยุดเฉยๆ ไม่มีแก้ไข/ลบ
  if (_hrSession && _hrSession.role === 'emp') {
    if (!existingName) return;
    Swal.fire({
      title: '📅 ' + dateStr.slice(0,5),
      text: existingName,
      confirmButtonText: 'ปิด',
      confirmButtonColor: '#4f46e5',
    });
    return;
  }
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
body{font-family:Sarabun,sans-serif;font-size:10pt;color:#1f2937;background:#fff;padding:14mm 12mm}
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
  const p = document.getElementById('hrPanel5');
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

    // ── การ์ดตั้งค่ากฎการลา/ขาด ────────────────────────────────
    (function() {
      var lc = _hrLeaveCfg();
      var selStyle = 'padding:5px 8px;border:1px solid var(\'--bc-input\');border-radius:7px;background:var(\'--bg\');color:var(\'--t1\');font-family:\'Sarabun\',sans-serif;font-size:.82rem';
      var divSel = function(id, val) {
        return '<select id="' + id + '" style="' + selStyle + '">' +
          '<option value="15"'+(val===15?' selected':'')+'>÷ 15 วัน</option>' +
          '<option value="26"'+(val===26?' selected':'')+'>÷ 26 วัน</option>' +
          '<option value="30"'+(val===30?' selected':'')+'>÷ 30 วัน</option>' +
        '</select>';
      };
      var row = function(label, idDeduct, deductVal, idDiv, divVal, idPaid, paidVal) {
        return '<div style="display:grid;grid-template-columns:80px 1fr 1fr 1fr;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(\'--bc-input\')">' +
          '<div style="font-size:.82rem;font-weight:700;color:var(\'--t1\')">' + label + '</div>' +
          '<div style="font-size:.75rem;color:var(\'--t3\')">รายเดือน: <select id="' + idDeduct + '" style="' + selStyle + '">' +
            '<option value="0"'+(!deductVal?' selected':'')+'>ไม่หัก</option>' +
            '<option value="1"'+(deductVal?' selected':'')+'>หัก</option>' +
          '</select></div>' +
          '<div style="font-size:.75rem;color:var(\'--t3\')">อัตราหัก: ' + divSel(idDiv, divVal) + '</div>' +
          '<div style="font-size:.75rem;color:var(\'--t3\')">รายวัน: <select id="' + idPaid + '" style="' + selStyle + '">' +
            '<option value="0"'+(!paidVal?' selected':'')+'>ไม่ได้ค่าแรง</option>' +
            '<option value="1"'+(paidVal?' selected':'')+'>ได้ค่าแรง</option>' +
          '</select></div>' +
        '</div>';
      };
      return '<div style="max-width:560px;margin-top:16px;background:var(--card);border:1px solid var(--bc-input);border-radius:14px;padding:22px 24px">' +
        '<div style="font-weight:700;font-size:.95rem;color:var(--c1);margin-bottom:4px">📋 กฎการลา / ขาดงาน</div>' +
        '<div style="font-size:.76rem;color:var(--t3);margin-bottom:14px">กำหนดว่าแต่ละ status หักเงินเดือน/ค่าแรงหรือไม่ และอัตราหักต่อวัน</div>' +
        '<div style="font-size:.72rem;font-weight:700;color:var(--t3);display:grid;grid-template-columns:80px 1fr 1fr 1fr;gap:8px;padding-bottom:6px;border-bottom:2px solid var(--bc-input)">' +
          '<div>Status</div><div>รายเดือน</div><div>อัตราหัก/วัน</div><div>รายวัน</div>' +
        '</div>' +
        row('ขาด', 'lcAbsMon', lc.absent.monthly.deduct, 'lcAbsDiv', lc.absent.monthly.divisor, 'lcAbsDay', lc.absent.daily.paid) +
        row('หยุด/ลา', 'lcOffMon', lc.off.monthly.deduct, 'lcOffDiv', lc.off.monthly.divisor, 'lcOffDay', lc.off.daily.paid) +
        '<button onclick="hrSaveLeaveCfg()" style="margin-top:12px;width:100%;padding:10px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:8px;font-family:\'Sarabun\',sans-serif;font-size:.88rem;font-weight:700;cursor:pointer">💾 บันทึกกฎการลา</button>' +
      '</div>';
    })() +

    // ── การ์ดตั้งค่าประกันสังคม ────────────────────────────────────
    '<div style="max-width:560px;margin-top:16px;background:var(--card);border:1px solid var(--bc-input);border-radius:14px;padding:22px 24px">' +
      '<div style="font-weight:700;font-size:.95rem;color:var(--c1);margin-bottom:4px">🛡 ตั้งค่าประกันสังคม</div>' +
      '<div style="font-size:.76rem;color:var(--t3);margin-bottom:14px">กำหนดว่าจะหักประกันสังคมพนักงาน (5% สูงสุด ฿750/เดือน) ในงวดใด</div>' +
      '<select id="hrSSOMode" style="width:100%;padding:9px 12px;border:1px solid var(--bc-input);border-radius:8px;background:var(--bg);color:var(--t1);font-family:\'Sarabun\',sans-serif;font-size:.88rem;margin-bottom:12px">' +
        '<option value="split"' + (_hrSSOMode()==='split' ? ' selected' : '') + '>แบ่งครึ่งทั้ง 2 งวด (งวด 1 + งวด 2 รวม = ฿750)</option>' +
        '<option value="p1"' + (_hrSSOMode()==='p1' ? ' selected' : '') + '>หักงวด 1 เต็ม (งวด 2 ไม่หัก)</option>' +
        '<option value="p2"' + (_hrSSOMode()==='p2' ? ' selected' : '') + '>หักงวด 2 เต็ม (งวด 1 ไม่หัก)</option>' +
      '</select>' +
      '<button onclick="hrSaveSSO()" style="width:100%;padding:10px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:8px;font-family:\'Sarabun\',sans-serif;font-size:.88rem;font-weight:700;cursor:pointer">💾 บันทึก</button>' +
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
  function dayInput(id, val, onch) {
    return '<input id="'+id+'" type="number" min="1" max="31" value="'+val+'"' + (onch ? ' oninput="'+onch+'"' : '') + ' style="width:56px;padding:6px 8px;border-radius:7px;border:1px solid var(--bc-input);background:var(--bg);color:var(--t1);font-family:\'Sarabun\',sans-serif;text-align:center">';
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
        '<div style="font-size:.8rem;font-weight:700;color:#818cf8;margin-bottom:10px">📌 งวดที่ 1 — จ่ายวันที่ 16 (เดือนเดียวกัน)</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.83rem;color:var(--t2)">' +
          'ช่วงทำงาน: วันที่ ' + dayInput('hrPayP1Start', pc.p1.start) +
          ' <span>ถึง</span> วันที่ ' + dayInput('hrPayP1End', pc.p1.end) +
          ' &nbsp;|&nbsp; จ่ายวันที่ ' + dayInput('hrPayP1Day', pc.p1.payday) + ' (เดือนเดียวกัน)' +
        '</div>' +
      '</div>' +
      // งวด 2
      '<div style="background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.18);border-radius:10px;padding:14px;margin-bottom:10px">' +
        '<div style="font-size:.8rem;font-weight:700;color:#34d399;margin-bottom:10px">📌 งวดที่ 2 — จ่ายวันที่ 1 (เดือนถัดไป)</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.83rem;color:var(--t2)">' +
          'ช่วงทำงาน: วันที่ ' + dayInput('hrPayP2Start', pc.p2.start, 'hrP2UpdateLabel()') +
            (pc.p2.start > pc.p2.end ? ' <span id="hrP2StartLbl" style="font-size:.72rem;color:#f59e0b;font-weight:700">(เดือนก่อน)</span>' : ' <span id="hrP2StartLbl"></span>') +
          ' <span>ถึง</span> วันที่ ' + dayInput('hrPayP2End', pc.p2.end, 'hrP2UpdateLabel()') +
            ' <span id="hrP2EndLbl" style="font-size:.72rem;color:#34d399;font-weight:700">' + (pc.p2.start > pc.p2.end ? '(เดือนนี้)' : '(เดือนเดียวกัน)') + '</span>' +
          ' &nbsp;|&nbsp; จ่ายวันที่ ' + dayInput('hrPayP2Day', pc.p2.payday) +
        '</div>' +
      '</div>' +
      '<div style="font-size:.72rem;color:var(--t3);margin-bottom:10px">💡 ตัวอย่าง: วันที่ 16 ม.ค. = จ่ายเงินสำหรับ 1-15 ม.ค. | วันที่ 1 ก.พ. = จ่ายเงินสำหรับ 16-31 ม.ค.</div>' +
    '</div>' +
    '<button onclick="hrSavePayCfg()" style="width:100%;padding:10px;background:var(--c1);color:#fff;border:none;border-radius:9px;font-family:\'Sarabun\',sans-serif;font-size:.88rem;font-weight:700;cursor:pointer">💾 บันทึกรอบการจ่าย</button>' +
  '</div>';
}

function hrP2UpdateLabel() {
  var s = parseInt((document.getElementById('hrPayP2Start')||{}).value) || 0;
  var e = parseInt((document.getElementById('hrPayP2End')||{}).value) || 0;
  var startLbl = document.getElementById('hrP2StartLbl');
  var endLbl   = document.getElementById('hrP2EndLbl');
  if (!startLbl || !endLbl) return;
  if (s > e) {
    // cross-month
    startLbl.textContent = '(เดือนก่อน)';
    startLbl.style.color = '#f59e0b';
    endLbl.textContent   = '(เดือนนี้)';
    endLbl.style.color   = '#34d399';
  } else {
    // same-month
    startLbl.textContent = '';
    endLbl.textContent   = '(เดือนเดียวกัน)';
    endLbl.style.color   = '#34d399';
  }
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
    p1: { start: g('hrPayP1Start') || 1, end: g('hrPayP1End') || 15, payday: g('hrPayP1Day') || 16 },
    p2: { start: g('hrPayP2Start') || 16, end: g('hrPayP2End') || 31, payday: g('hrPayP2Day') || 1 },
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

function hrSaveLeaveCfg() {
  var g = function(id) { var el = document.getElementById(id); return el ? parseInt(el.value) : 0; };
  var cfg = {
    absent: {
      monthly: { deduct: !!g('lcAbsMon'), divisor: g('lcAbsDiv') || 15 },
      daily:   { paid: !!g('lcAbsDay') },
    },
    off: {
      monthly: { deduct: !!g('lcOffMon'), divisor: g('lcOffDiv') || 15 },
      daily:   { paid: !!g('lcOffDay') },
    },
  };
  localStorage.setItem(HR_LEAVE_LS, JSON.stringify(cfg));
  Swal.fire({ icon: 'success', title: '💾 บันทึกกฎการลาแล้ว', timer: 1200, showConfirmButton: false });
}

function hrSaveSSO() {
  var el = document.getElementById('hrSSOMode');
  if (!el) return;
  localStorage.setItem(HR_SSO_LS, el.value);
  Swal.fire({ icon: 'success', title: 'บันทึกแล้ว', timer: 1200, showConfirmButton: false });
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
        '<select id="eat_st_'+i+'" ' + (isSun?'disabled ':'') + 'onchange="_eatSum()" style="'+selStyle+'">' +
          '<option value="present"'+(effStatus==='present'?' selected':'')+'>มา</option>' +
          '<option value="absent"'+(effStatus==='absent'?' selected':'')+'>ขาด</option>' +
          '<option value="off"'+(effStatus==='off'?' selected':'')+'>หยุด/ลา</option>' +
          '<option value="holiday"'+(effStatus==='holiday'?' selected':'')+'>วันหยุด</option>' +
        '</select>' +
      '</td>' +
      '<td style="padding:4px 4px"><input id="eat_ci_'+i+'" type="time" value="'+(r.clockIn||'')+'"' + (isSun?' disabled style="width:90px;padding:3px 4px;border:1px solid #c4b5fd;border-radius:5px;background:#ede9fe;font-family:\'Sarabun\',sans-serif;font-size:.8rem;color:#9ca3af"':'oninput="_eatSum()" style="width:90px;padding:3px 4px;border:1px solid #d1d5db;border-radius:5px;font-family:\'Sarabun\',sans-serif;font-size:.8rem"') + '></td>' +
      '<td style="padding:4px 4px"><input id="eat_ls_'+i+'" type="time" value="'+(r.lastScan||'')+'"' + disabledAttr + '></td>' +
      '<td style="padding:4px 4px"><input id="eat_lm_'+i+'" type="number" min="0" value="'+(r.lateMin||0)+'" ' + (isSun?'disabled ':'') + 'oninput="_eatSum()" style="width:60px;padding:3px 4px;border:1px solid #d1d5db;border-radius:5px;font-family:\'Sarabun\',sans-serif;font-size:.8rem;text-align:center"></td>' +
      '<td style="padding:4px 4px"><input id="eat_ot_'+i+'" type="number" min="0" step="0.5" value="'+(r.otHours||0)+'" oninput="_eatSum()" style="width:60px;padding:3px 4px;border:1px solid #d1d5db;border-radius:5px;font-family:\'Sarabun\',sans-serif;font-size:.8rem;text-align:center"></td>' +
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
    '</table></div>' +
    '<div id="eat_summary" style="display:flex;flex-wrap:wrap;gap:8px;padding:10px 4px 4px;border-top:2px solid #e5e7eb;margin-top:6px"></div>' +
    '</div>';

  var _eatN = recs.length;
  window._eatSum = function() {
    var present=0,absent=0,off=0,holiday=0,late=0,lateMinTot=0,otTot=0;
    for(var i=0;i<_eatN;i++){
      var st=(document.getElementById('eat_st_'+i)||{}).value||'';
      if(st==='present') present++;
      else if(st==='absent') absent++;
      else if(st==='off') off++;
      else if(st==='holiday') holiday++;
      var lm=parseFloat((document.getElementById('eat_lm_'+i)||{}).value)||0;
      if(lm>0){late++;lateMinTot+=lm;}
      otTot+=parseFloat((document.getElementById('eat_ot_'+i)||{}).value)||0;
    }
    var box=document.getElementById('eat_summary'); if(!box)return;
    function chip(val,lbl,bg,fc){
      return '<div style="background:'+bg+';color:'+fc+';border-radius:10px;padding:5px 12px;text-align:center;min-width:60px">'+
        '<div style="font-size:1rem;font-weight:800">'+val+'</div>'+
        '<div style="font-size:.65rem;margin-top:1px;opacity:.85">'+lbl+'</div></div>';
    }
    box.innerHTML =
      chip(present,'วันมา','#dcfce7','#166534')+
      chip(absent,'วันขาด','#fee2e2','#991b1b')+
      chip(off,'หยุด/ลา','#f3e8ff','#6b21a8')+
      chip(holiday,'วันหยุด','#ede9fe','#5b21b6')+
      chip(late,'ครั้งสาย','#fef9c3','#854d0e')+
      chip(lateMinTot+' น.','รวมสาย','#ffedd5','#9a3412')+
      chip(otTot.toFixed(1)+' ชม.','OT รวม','#e0e7ff','#3730a3');
  };

  Swal.fire({
    title: '',
    html: popHtml,
    width: '780px',
    showCancelButton: true,
    confirmButtonText: '💾 บันทึก',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#4f46e5',
    focusConfirm: false,
    didOpen: function() { _eatSum(); },
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
function hrOpenPayslip(empId, month, period, deductItemsJson) {
  period = period || 'all';
  const emp     = _hrEmps.find(function(e) { return String(e.empId) === String(empId); });
  const allAtt  = _hrAtt.filter(function(r) { return String(r.empId) === String(empId); });
  const att     = _hrFilterByPeriod(allAtt, period, month);

  if (!att.length) {
    Swal.fire('⚠️', 'ไม่พบข้อมูลเวลางานของพนักงานนี้ในงวดที่เลือก — กรุณาโหลดข้อมูลก่อน', 'warning');
    return;
  }

  const payslip = _hrCalcPayslip(emp, att, month, period);

  // ถ้ามี deductItems ที่บันทึกไว้ตอน confirm → ใช้แทนการคำนวณใหม่ (สลิป historical)
  if (deductItemsJson) {
    try {
      var histItems = JSON.parse(decodeURIComponent(deductItemsJson));
      if (histItems && histItems.length) {
        payslip.loanDeductItems = histItems;
        payslip.loanDeductTotal = histItems.reduce(function(s, x) { return s + (x.amount || 0); }, 0);
        payslip.net = payslip.gross - (payslip.absentDeduct || 0) - (payslip.offDeduct || 0) - payslip.loanDeductTotal;
      }
    } catch(e) {}
  }

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

  var _leaveCfg = _hrLeaveCfg();
  let basePay = 0, absentDeduct = 0, offDeduct = 0;
  if (type === 'daily') {
    // รายวัน: นับเฉพาะวันที่กฎบอกว่า 'ได้ค่าแรง'
    var paidPresent = present; // present เสมอได้ค่าแรง
    var offCount = att.filter(function(r) { return r.status === 'off'; }).length;
    if (_leaveCfg.off.daily.paid) paidPresent += offCount;
    basePay = dailyRate * paidPresent;
  } else {
    basePay = isPeriod ? salary / 2 : salary;
    var _daysDiv = isPeriod ? 15 : 30;
    // ขาด (absent)
    if (absent > 0 && _leaveCfg.absent.monthly.deduct) {
      var abDiv = _leaveCfg.absent.monthly.divisor || _daysDiv;
      absentDeduct = (salary / abDiv) * absent;
    }
    // หยุด/ลา (off)
    var offCnt = att.filter(function(r) { return r.status === 'off'; }).length;
    if (offCnt > 0 && _leaveCfg.off.monthly.deduct) {
      var offDiv = _leaveCfg.off.monthly.divisor || _daysDiv;
      offDeduct = (salary / offDiv) * offCnt;
    }
  }

  const otPayWD  = otWDH  * otRateWD;
  const otPaySun = otSunH * otRateSun;
  // allowances จากข้อมูลพนักงาน
  var allowances = (emp && emp.allowances) || [];
  var allowanceTotal = allowances.reduce(function(s, a) { return s + (parseFloat(a.amount) || 0); }, 0);
  const gross    = basePay + otPayWD + otPaySun + allowanceTotal;

  // ── หักเงินกู้/เบิก — ดึงจาก _hrLoanContracts + _hrLoans (approved) ──
  var empIdStr = String((emp && emp.empId) || '');
  var loanDeductItems = [];
  if (empIdStr) {
    if (typeof _hrLoanContracts !== 'undefined') {
      (_hrLoanContracts || []).forEach(function(lc) {
        if (String(lc.empId) !== empIdStr) return;
        if (lc.status !== 'active') return;
        if (lc.outstanding <= 0) return;
        var deductAmt = lc.type === 'advance'
          ? lc.outstanding
          : Math.min(lc.outstanding, lc.installmentAmt);
        loanDeductItems.push({
          loanId: lc.loanId, source: 'contract', type: lc.type,
          label: (lc.type === 'advance' ? 'หักเบิก' : 'หักเงินกู้') + ' (' + lc.loanId + ')',
          amount: deductAmt
        });
      });
    }
    if (typeof _hrLoans !== 'undefined') {
      (_hrLoans || []).forEach(function(lr) {
        if (String(lr.empId) !== empIdStr) return;
        if (lr.amount <= 0) return;
        // approved = อนุมัติแล้ว → หักงวดถัดไปหลังวันเบิก
        // เบิก p1(1-15) → หัก p2 เดือนเดียวกัน | เบิก p2(16-31) → หัก p1 เดือนถัดไป
        if (lr.status === 'approved') {
          var _pc = _hrPayCfg();
          var _nextPd = (function(requestDate) {
            var rd = String(requestDate || '');
            var day = 0, ceY = 0, _mm = '';
            if (rd.length >= 10 && rd[2] === '/') {
              day = parseInt(rd.slice(0,2)) || 0;
              _mm  = rd.slice(3,5);
              var beY = parseInt(rd.slice(6,10)) || 0;
              ceY = beY > 2500 ? beY - 543 : beY;
            } else { var _d = new Date(rd); if (!isNaN(_d)) { day=_d.getDate(); ceY=_d.getFullYear(); _mm=String(_d.getMonth()+1).padStart(2,'0'); } }
            if (!day || !ceY) return null;
            if (day >= _pc.p1.start && day <= _pc.p1.end) {
              return { month: ceY + '-' + _mm, period: 'p2' };
            } else {
              var _nm = parseInt(_mm)+1, _ny = ceY;
              if (_nm > 12) { _nm = 1; _ny++; }
              return { month: _ny + '-' + String(_nm).padStart(2,'0'), period: 'p1' };
            }
          })(lr.requestDate);
          var _shouldDeduct = false;
          if (!_nextPd) {
            _shouldDeduct = (period === 'all');
          } else if (period === 'all') {
            _shouldDeduct = _nextPd.month <= month; // due หรือค้างจ่าย
          } else {
            _shouldDeduct = (_nextPd.month === month && _nextPd.period === period);
          }
          if (_shouldDeduct) {
            loanDeductItems.push({
              requestId: lr.requestId, source: 'request', type: lr.type || 'advance',
              label: 'หักเบิก (' + lr.requestId + ')',
              amount: lr.amount
            });
          }
        }
        // closed = โอนแล้ว รอหักคืนจากสลิป — ตรวจ deductMonth ตรงกับเดือนปัจจุบัน
        if (lr.status === 'closed' && !lr.deducted && lr.deductMonth && lr.deductMonth === month) {
          loanDeductItems.push({
            requestId: lr.requestId, source: 'request', type: lr.type || 'advance',
            label: 'หักเบิกคืน (' + lr.requestId + ')',
            amount: lr.amount,
            advanceClosed: true  // flag: ต้อง markAdvanceDeducted หลัง confirm payroll
          });
        }
      });
    }
  }
  // ── ประกันสังคม — โหมดตาม _hrSSOMode(): split/p1/p2 ──
  if (emp && emp.ssoEnabled) {
    var ssoAmt = 0, ssoLabel = '';
    if (type === 'daily') {
      // รายวัน: คิด SSO จากค่าแรงจริงในงวดนั้น (ไม่รวม OT) ต่อ 1 งวด ไม่ต้องแบ่ง 2
      var ssoBase = _hrCalcSSO(basePay);
      if (ssoBase > 0 && isPeriod) {
        ssoAmt = ssoBase;
        ssoLabel = 'ประกันสังคม 5% (งวด ' + (period === 'p1' ? '1' : '2') + ')';
      } else if (ssoBase > 0 && !isPeriod) {
        // ดูรายเดือน: รวมทั้งเดือนประมาณจาก basePay (ไม่มี OT)
        ssoAmt = ssoBase;
        ssoLabel = 'ประกันสังคม 5%';
      }
    } else {
      // รายเดือน: คิดจากเงินเดือนเต็ม แบ่งตาม mode
      var ssoFull = _hrCalcSSO(salary);
      if (ssoFull > 0) {
        var ssoMode = _hrSSOMode();
        if (!isPeriod) {
          ssoAmt = ssoFull;
          ssoLabel = 'ประกันสังคม 5% (สูงสุด ฿875)';
        } else if (ssoMode === 'split') {
          ssoAmt   = period === 'p1' ? Math.ceil(ssoFull / 2) : Math.floor(ssoFull / 2);
          ssoLabel = 'ประกันสังคม 5% (งวด ' + (period === 'p1' ? '1' : '2') + ')';
        } else if (ssoMode === period) {
          ssoAmt   = ssoFull;
          ssoLabel = 'ประกันสังคม 5% (สูงสุด ฿875)';
        }
      }
    }
    if (ssoAmt > 0) {
      loanDeductItems.unshift({ source: 'sso', label: ssoLabel, amount: ssoAmt });
    }
  }
  var loanDeductTotal = loanDeductItems.reduce(function(s, x) { return s + x.amount; }, 0);
  const net = gross - absentDeduct - offDeduct - loanDeductTotal;

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
    allowances: allowances, allowanceTotal: allowanceTotal,
    absentDeduct: absentDeduct, offDeduct: offDeduct, gross: gross,
    loanDeductItems: loanDeductItems, loanDeductTotal: loanDeductTotal,
    net: net,
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
  ].concat((p.allowances || []).filter(function(a) { return a.amount > 0; }).map(function(a) {
    return [a.label || 'รายได้อื่นๆ', a.amount];
  })).filter(Boolean);

  const absentDeductRows = p.absentDeduct > 0
    ? [['ขาดงาน ' + p.absent + ' วัน', -p.absentDeduct]]
    : [];
  const offDeductRows = (p.offDeduct || 0) > 0
    ? [['หักวันลา/หยุด', -(p.offDeduct)]]
    : [];
  const loanDeductRows = (p.loanDeductItems || []).map(function(x) { return [x.label, -x.amount]; });
  const deductRows = absentDeductRows.concat(offDeductRows).concat(loanDeductRows);
  const totalDeduct = (p.absentDeduct || 0) + (p.offDeduct || 0) + (p.loanDeductTotal || 0);

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
      '<tr class="tot-row">' + row('รวมหัก', -totalDeduct, true).slice(4, -5) + '</tr>' +
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
  const p = document.getElementById('hrPanel7');
  if (!p) return;
  _hrLoanBadgeClear(); // ล้าง badge เมื่อเปิดหน้าเบิก/กู้
  // ยังไม่ login → แสดงหน้า login
  if (!_hrSession) { _hrShowLoanLogin(); return; }
  p.innerHTML = '<div style="padding:16px 0;text-align:center;color:var(--t3)">⏳ กำลังโหลด...</div>';
  // emp เห็นเฉพาะตัวเอง, manager เห็นทุกคน
  const params = _hrSession.role === 'emp' ? { empId: _hrSession.empId } : {};
  // โหลด employees พร้อมกัน (manager ต้องการชื่อพนักงาน)
  var lcParams = _hrSession.role === 'emp' ? { empId: _hrSession.empId } : {};
  // เสมอโหลด employees ใหม่เพื่อให้รูปพนักงานอัปเดตทุกครั้งที่ refresh
  var _needEmps = _hrSession.role === 'manager';
  var calls = [_hrGET('getLoanRequests', params)];
  if (_needEmps) calls.push(_hrGET('getHREmployees'));
  calls.push(_hrGET('getHRLoanContracts', lcParams));
  calls.push(_hrGET('getHRLoanPayments', lcParams));
  Promise.all(calls).then(function(results) {
    var _ri = 0;
    _hrLoans = (results[_ri++] && results[_ri-1].data) || [];
    if (_needEmps) _hrEmps = (results[_ri++] && results[_ri-1].data) || _hrEmps;
    _hrLoanContracts         = (results[_ri++] && results[_ri-1].data) || [];
    _hrLoanContractPayments  = (results[_ri]   && results[_ri].data)   || [];
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
  // ยอดเบิก/เดือนนี้ — นับเฉพาะ closed ที่ requestDate อยู่ในเดือนปัจจุบัน
  var _nowYMSumm = (function(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); })();
  function _loanReqYM(l) {
    var rd = String(l.requestDate||'');
    if (rd.length >= 10 && rd[2] === '/') {
      var beY = parseInt(rd.slice(6,10)); var ceY = beY > 2500 ? beY - 543 : beY;
      return ceY + '-' + rd.slice(3,5);
    }
    var dp = new Date(rd); return isNaN(dp) ? '' : dp.getFullYear() + '-' + String(dp.getMonth()+1).padStart(2,'0');
  }
  var totalAdvance = 0, totalLoan = 0;
  _hrLoans.forEach(function(l) {
    if (l.status !== 'closed' && l.status !== 'deducted') return;
    if (_loanReqYM(l) !== _nowYMSumm) return; // เฉพาะเดือนนี้
    var amt = parseFloat(l.transferAmount || l.amount || 0);
    if (l.type === 'advance') totalAdvance += amt;
    else if (l.type === 'loan') totalLoan += amt;
  });

  // ── summary cards (ทั้ง manager และ emp) ──
  // คำนวณ budget bar สำหรับ employee
  var budgetBarHtml = '';
  var _budgetForBar = !isManager ? parseFloat((_hrSession && _hrSession.advanceBudget) || 0) : 0;
  if (_budgetForBar > 0) {
    var _nowYM = (function(){ var d=new Date(); return d.getFullYear()+'-'+(d.getMonth()<9?'0':'')+(d.getMonth()+1); })();
    var _usedBar = 0;
    _hrLoans.forEach(function(x){
      if (x.type !== 'advance' || x.status === 'rejected') return;
      var rd = String(x.requestDate||''); var rdKey = '';
      if (rd.length >= 10 && rd[2] === '/') {
        var beY = parseInt(rd.slice(6,10)); var ceY = beY > 2500 ? beY - 543 : beY;
        rdKey = ceY + '-' + rd.slice(3,5);
      } else { var _dp = new Date(rd); if (!isNaN(_dp)) rdKey = _dp.getFullYear() + '-' + String(_dp.getMonth()+1).padStart(2,'0'); }
      if (rdKey === _nowYM) _usedBar += parseFloat(x.amount||0);
    });
    var _remainBar = Math.max(0, _budgetForBar - _usedBar);
    var _pctBar = Math.min(100, _budgetForBar > 0 ? Math.round(_usedBar / _budgetForBar * 100) : 0);
    var _barClr = _pctBar >= 90 ? '#ef4444' : _pctBar >= 60 ? '#f59e0b' : '#10b981';
    budgetBarHtml =
      '<div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid #86efac;border-radius:12px;padding:12px 16px;margin-bottom:14px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<div style="font-size:.8rem;font-weight:700;color:#166534">📊 วงเงินเบิก/เดือนนี้</div>' +
          '<div style="font-size:.8rem;font-weight:700;color:' + (_remainBar===0?'#ef4444':'#059669') + '">เหลือ ฿' + _hrFmt(_remainBar) + '</div>' +
        '</div>' +
        '<div style="background:#bbf7d0;border-radius:99px;height:8px;overflow:hidden;margin-bottom:6px">' +
          '<div style="height:100%;width:' + _pctBar + '%;background:' + _barClr + ';border-radius:99px;transition:width .4s"></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:.74rem;color:#16a34a">' +
          '<span>เบิกแล้ว ฿' + _hrFmt(_usedBar) + ' (' + _pctBar + '%)</span>' +
          '<span>วงเงิน ฿' + _hrFmt(_budgetForBar) + '</span>' +
        '</div>' +
      '</div>';
  }

  // รวมยอดแยกตามพนักงาน — เฉพาะ manager และเดือนนี้
  var _empTotals = {};
  _hrLoans.forEach(function(l) {
    if (l.status !== 'closed' && l.status !== 'deducted') return;
    if (_loanReqYM(l) !== _nowYMSumm) return;
    var n = l.empName || l.empId || '?';
    if (!_empTotals[n]) _empTotals[n] = 0;
    _empTotals[n] += parseFloat(l.transferAmount || l.amount || 0);
  });
  var _empRows = isManager ? Object.keys(_empTotals).sort().map(function(n) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(129,140,248,.25)">' +
      '<span style="font-size:.82rem;color:#3730a3;font-weight:600">👤 ' + n + '</span>' +
      '<span style="font-size:.85rem;font-weight:800;color:#4338ca">฿' + _hrFmt(_empTotals[n]) + '</span>' +
    '</div>';
  }).join('') : '';
  var _closedCount = _hrLoans.filter(function(l){ return (l.status==='closed'||l.status==='deducted') && _loanReqYM(l)===_nowYMSumm; }).length;

  var summaryHtml =
    '<div style="margin-bottom:14px">' +
      '<div style="background:linear-gradient(135deg,#e0e7ff 0%,#c7d2fe 100%);border:2px solid #818cf8;border-radius:12px;padding:14px 16px">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">' +
          '<div>' +
            '<div style="font-size:.75rem;font-weight:600;color:#4338ca;margin-bottom:2px">💸 ยอดเบิกเดือนนี้ (โอนแล้ว)</div>' +
            '<div style="font-size:1.4rem;font-weight:900;color:#3730a3">฿' + _hrFmt(totalAdvance + totalLoan) + '</div>' +
          '</div>' +
          '<div style="background:#818cf8;color:#fff;border-radius:99px;padding:3px 10px;font-size:.72rem;font-weight:700">' + _closedCount + ' รายการ</div>' +
        '</div>' +
        (_empRows ? '<div style="margin-top:6px">' + _empRows + '</div>' : '') +
      '</div>' +
    '</div>' + budgetBarHtml;

  // ── session bar ──
  var sessionBar =
    '<div id="hrLoanSessionBar" style="display:flex;align-items:center;justify-content:space-between;background:' + (isManager ? 'rgba(79,70,229,.07)' : 'rgba(8,145,178,.07)') + ';border:1px solid ' + (isManager ? 'rgba(79,70,229,.2)' : 'rgba(8,145,178,.2)') + ';border-radius:10px;padding:8px 14px;margin-bottom:14px">' +
      '<div style="font-size:.84rem;color:var(--t2)">' +
        (isManager ? '🔑 <b>ผู้จัดการ</b>' : '👤 ' + sessionName) +
      '</div>' +
      '<button onclick="hrLogout()" style="background:transparent;color:var(--t3);border:1px solid var(--bc-input);border-radius:6px;padding:4px 12px;cursor:pointer;font-family:inherit;font-size:.78rem">🔓 ออกจากระบบ</button>' +
    '</div>';

  // ── ถ้าเป็น manager — layout เดิม ──
  if (isManager) {
    return '<div style="padding:0 4px">' +
      sessionBar + summaryHtml +
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px">' +
        '<div style="font-size:1.05rem;font-weight:700;color:var(--t1)">💰 เบิกล่วงหน้า</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button onclick="hrLoanNew()" style="background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:7px 16px;cursor:pointer;font-family:inherit;font-size:.9rem">➕ ยื่นคำขอใหม่</button>' +
          '<button onclick="_hrRenderLoans()" style="background:transparent;color:var(--t3);border:1px solid var(--bc-input);border-radius:8px;padding:7px 14px;cursor:pointer;font-family:inherit;font-size:.9rem">🔄 รีเฟรช</button>' +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:10px;display:flex;align-items:center;gap:8px">' +
        '<span style="font-size:.82rem;color:var(--t3)">📅 เดือน:</span>' +
        '<select id="hrLoanMonthSel" onchange="hrLoanSetMonth(this.value)" ' +
          'style="border-radius:8px;padding:4px 10px;font-size:.82rem;border:1px solid var(--bc-input);background:var(--bg1);color:var(--t1);font-family:inherit;cursor:pointer">' +
          '<option value="">ทุกเดือน</option>' +
          (function(){
            var months = {};
            (_hrLoans||[]).forEach(function(l){
              var rd = String(l.requestDate||'');
              var ym = ''; var label = '';
              if (rd.length >= 10 && rd[2] === '/') {
                var beY = parseInt(rd.slice(6,10)); var ceY = beY > 2500 ? beY-543 : beY;
                ym = ceY + '-' + rd.slice(3,5);
                var thMon = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
                label = thMon[parseInt(rd.slice(3,5))||0] + ' ' + beY;
              } else { var d=new Date(rd); if(!isNaN(d)){ ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); label=ym; } }
              if (ym) months[ym] = label;
            });
            return Object.keys(months).sort().reverse().map(function(ym){
              return '<option value="'+ym+'"'+(ym===_hrLoanCurMonth?' selected':'')+'>'+months[ym]+'</option>';
            }).join('');
          })()+
        '</select>' +
      '</div>' +
      '<div id="hrLoanFilter" style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">' +
        _hrLoanFilterBtn('all',      'ทั้งหมด') +
        _hrLoanFilterBtn('pending',  '⏳ รออนุมัติ') +
        _hrLoanFilterBtn('approved', '✅ รอโอนจ่าย') +
        _hrLoanFilterBtn('rejected', '❌ ปฏิเสธ') +
        _hrLoanFilterBtn('closed',   '✅ โอนแล้ว') +
      '</div>' +
      '<div id="hrLoanTable">' + _hrLoanTableHtml('all') + '</div>' +
    '</div>';
  }

  // ── employee view ──
  return '<div style="padding:0 4px">' +
    sessionBar + summaryHtml +
    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">' +
      '<div style="font-size:1rem;font-weight:700;color:var(--t1)">💸 คำขอเบิกล่วงหน้า</div>' +
      '<div style="display:flex;gap:8px">' +
        '<button onclick="hrLoanNew()" style="background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:7px 16px;cursor:pointer;font-family:inherit;font-size:.88rem;font-weight:600">➕ ยื่นคำขอใหม่</button>' +
        '<button onclick="_hrRenderLoans()" style="background:transparent;color:var(--t3);border:1px solid var(--bc-input);border-radius:8px;padding:7px 12px;cursor:pointer;font-family:inherit;font-size:.88rem">🔄</button>' +
      '</div>' +
    '</div>' +
    '<div style="margin-bottom:10px;display:flex;align-items:center;gap:8px">' +
        '<span style="font-size:.82rem;color:var(--t3)">📅 เดือน:</span>' +
        '<select id="hrLoanMonthSel" onchange="hrLoanSetMonth(this.value)" ' +
          'style="border-radius:8px;padding:4px 10px;font-size:.82rem;border:1px solid var(--bc-input);background:var(--bg1);color:var(--t1);font-family:inherit;cursor:pointer">' +
          '<option value="">ทุกเดือน</option>' +
          (function(){
            var months = {};
            (_hrLoans||[]).forEach(function(l){
              var rd = String(l.requestDate||'');
              var ym = ''; var label = '';
              if (rd.length >= 10 && rd[2] === '/') {
                var beY = parseInt(rd.slice(6,10)); var ceY = beY > 2500 ? beY-543 : beY;
                ym = ceY + '-' + rd.slice(3,5);
                var thMon = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
                label = thMon[parseInt(rd.slice(3,5))||0] + ' ' + beY;
              } else { var d=new Date(rd); if(!isNaN(d)){ ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); label=ym; } }
              if (ym) months[ym] = label;
            });
            return Object.keys(months).sort().reverse().map(function(ym){
              return '<option value="'+ym+'"'+(ym===_hrLoanCurMonth?' selected':'')+'>'+months[ym]+'</option>';
            }).join('');
          })()+
        '</select>' +
      '</div>' +
      '<div id="hrLoanFilter" style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">' +
      _hrLoanFilterBtn('all',      'ทั้งหมด') +
      _hrLoanFilterBtn('pending',  '⏳ รออนุมัติ') +
      _hrLoanFilterBtn('approved', '✅ รอโอนจ่าย') +
      _hrLoanFilterBtn('rejected', '❌ ปฏิเสธ') +
      _hrLoanFilterBtn('closed',   '✅ โอนแล้ว') +
    '</div>' +
    '<div id="hrLoanTable">' + _hrLoanTableHtml('all') + '</div>' +
  '</div>';
}

function hrEmpLoanSubSwitch(n) {
  var p1 = document.getElementById('hrEmpLoanPanel1');
  var p2 = document.getElementById('hrEmpLoanPanel2');
  var t1 = document.getElementById('hrEmpLoanTab1');
  var t2 = document.getElementById('hrEmpLoanTab2');
  if (!p1 || !p2) return;
  // toggle panels
  p1.style.cssText = (n === 1) ? 'display:block' : 'display:none';
  p2.style.cssText = (n === 2) ? 'display:block' : 'display:none';
  // toggle tab buttons — ใช้ hex color โดยตรง (ไม่ใช้ CSS var)
  var base = 'flex:1;padding:9px 6px;cursor:pointer;font-family:inherit;font-size:.9rem;font-weight:600;border:none;border-radius:10px;transition:background .18s';
  if (t1) t1.style.cssText = base + (n === 1 ? ';background:#3b82f6;color:#fff;box-shadow:0 2px 8px rgba(59,130,246,.35)' : ';background:#f1f5f9;color:#64748b');
  if (t2) t2.style.cssText = base + (n === 2 ? ';background:#3b82f6;color:#fff;box-shadow:0 2px 8px rgba(59,130,246,.35)' : ';background:#f1f5f9;color:#64748b');
}

function _hrLoanFilterBtn(val, label) {
  return '<button onclick="hrLoanSetFilter(\'' + val + '\')" id="hrLFBtn-' + val + '" ' +
    'style="border-radius:20px;padding:5px 14px;cursor:pointer;font-family:inherit;font-size:.85rem;' +
    'background:' + (val === 'all' ? 'var(--c1)' : 'transparent') + ';' +
    'color:' + (val === 'all' ? '#fff' : 'var(--t3)') + ';' +
    'border:1px solid ' + (val === 'all' ? 'var(--c1)' : 'var(--bc-input)') + '">' + label + '</button>';
}

let _hrLoanCurFilter = 'all';
let _hrLoanCurMonth  = '';   // '' = ทุกเดือน, 'YYYY-MM' = เดือนที่เลือก

function hrLoanSetMonth(ym) {
  _hrLoanCurMonth = ym;
  var sel = document.getElementById('hrLoanMonthSel');
  if (sel) sel.value = ym;
  var tbl = document.getElementById('hrLoanTable');
  if (tbl) tbl.innerHTML = _hrLoanTableHtml(_hrLoanCurFilter);
}

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
  // helper: parse requestDate → CE ym string 'YYYY-MM'
  function _loanYM(l) {
    var rd = String(l.requestDate||'');
    if (rd.length >= 10 && rd[2] === '/') {
      var beY = parseInt(rd.slice(6,10)); var ceY = beY > 2500 ? beY-543 : beY;
      return ceY + '-' + rd.slice(3,5);
    }
    var d = new Date(rd); return isNaN(d) ? '' : d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  // helper: parse requestDate → timestamp for sorting
  function _loanTs(l) {
    var rd = String(l.requestDate||'');
    if (rd.length >= 10 && rd[2] === '/') {
      var p = rd.split(/[ /]/); var beY = parseInt(p[2]); var ceY = beY > 2500 ? beY-543 : beY;
      return new Date(ceY, parseInt(p[1])-1, parseInt(p[0]), parseInt((p[3]||'0:0').split(':')[0]), parseInt((p[3]||'0:0').split(':')[1]||0)).getTime();
    }
    var d = new Date(rd); return isNaN(d) ? 0 : d.getTime();
  }
  var base = _hrLoans.slice().sort(function(a,b){ return _loanTs(b) - _loanTs(a); }); // newest first
  if (filter !== 'all') base = base.filter(function(l){ return l.status === filter; });
  if (_hrLoanCurMonth) base = base.filter(function(l){ return _loanYM(l) === _hrLoanCurMonth; });
  const rows = base;
  if (!rows.length) return '<div style="padding:32px;text-align:center;color:var(--t3)">ไม่มีรายการ</div>';

  const isEmp = _hrSession && _hrSession.role === 'emp';
  const isManagerView = _hrSession && _hrSession.role === 'manager';

  const statusStyle = {
    pending:  { bg:'#fef3c7', color:'#92400e', label:'⏳ รออนุมัติ' },
    approved: { bg:'#cffafe', color:'#155e75', label:'✅ อนุมัติแล้ว — รอโอนจ่าย' },
    rejected: { bg:'#fee2e2', color:'#991b1b', label:'❌ ปฏิเสธ' },
    closed:   { bg:'#d1fae5', color:'#065f46', label:'✅ โอนแล้ว — รอหักสลิป' },
    deducted: { bg:'#dbeafe', color:'#1e40af', label:'💰 หักสลิปแล้ว' },
  };
  const dayRingColorDeducted = '#3b82f6';
  const typeStyle = {
    advance: { bg:'#e0e7ff', color:'#3730a3', label:'เบิก' },
    loan:    { bg:'#fce7f3', color:'#9d174d', label:'กู้' },
  };
  const dayRingColor = { pending:'#f59e0b', approved:'#10b981', rejected:'#94a3b8', closed:'#64748b' };

  function badge(map, key, item) {
    // ถ้า deducted แล้ว override badge ทันที
    if (item && item.deducted) {
      return '<span style="background:#dbeafe;color:#1e40af;border-radius:99px;padding:2px 10px;font-size:.76rem;font-weight:600">💰 หักสลิปแล้ว</span>';
    }
    var s = map[key] || { bg:'#f1f5f9', color:'#475569', label: key };
    return '<span style="background:' + s.bg + ';color:' + s.color + ';border-radius:99px;padding:2px 10px;font-size:.76rem;font-weight:600">' + s.label + '</span>';
  }

  var cards = rows.map(function(l) {
    var days    = _hrLoanDaysSince(l.requestDate);
    var ringClr = dayRingColor[l.status] || '#64748b';
    var ts      = typeStyle[l.type] || { bg:'#f1f5f9', color:'#475569', label: l.type };

    // ── employee photo avatar (admin only) ──
    var _lEmp  = (_hrEmps||[]).find(function(e){ return String(e.empId)===String(l.empId); }) || {};
    var _lThumb = _hrDriveThumb(_lEmp.profileUrl || '');
    var _lInit  = (_lEmp.name||l.empName||'?').trim().charAt(0).toUpperCase();
    var _lAvatarSize = 68;
    var photoAvatar = isEmp ? '' : (_lThumb
      ? '<img src="' + _lThumb + '" alt="photo" style="width:' + _lAvatarSize + 'px;height:' + _lAvatarSize + 'px;border-radius:50%;object-fit:cover;border:3px solid ' + ringClr + ';box-shadow:0 2px 8px rgba(0,0,0,.15);display:block" ' +
          'onerror="this.outerHTML=\'<div style=&quot;width:' + _lAvatarSize + 'px;height:' + _lAvatarSize + 'px;border-radius:50%;background:' + ringClr + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:800;border:3px solid ' + ringClr + '&quot;>' + _lInit + '</div>\'">' 
      : '<div style="width:' + _lAvatarSize + 'px;height:' + _lAvatarSize + 'px;border-radius:50%;background:' + ringClr + '22;border:3px solid ' + ringClr + ';display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:800;color:' + ringClr + '">' + _lInit + '</div>');

    // ── day circle (ใต้รูป) ──
    var dayCircle = l.status === 'closed'
      ? '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;' +
          'width:52px;height:52px;border-radius:50%;background:#d1fae5;border:3px solid #10b981;flex-shrink:0">' +
          '<span style="font-size:1.5rem;line-height:1">✅</span>' +
        '</div>'
      : '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;' +
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
        '<button onclick="hrLoanClose(\'' + l.requestId + '\')" style="width:100%;background:linear-gradient(135deg,#0891b2,#06b6d4);color:#fff;border:none;border-radius:8px;padding:8px 10px;cursor:pointer;font-size:.84rem;font-family:inherit;font-weight:600">✅ อนุมัติแล้ว — รอโอนเงิน</button>';
    } else if (l.status === 'closed' || l.status === 'deducted') {
      var xfAmt  = parseFloat(l.transferAmount || l.amount || 0);
      var xfDate = l.closedDate || l.transferDate || '';
      var xfNote = l.transferNote || '';
      actionArea =
        '<div style="display:flex;flex-direction:column;gap:8px">' +
        '<div style="background:linear-gradient(135deg,#d1fae5 0%,#a7f3d0 100%);border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:12px">' +
          '<div style="width:40px;height:40px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;box-shadow:0 2px 8px rgba(16,185,129,.25)">✅</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:.78rem;font-weight:700;color:#065f46;letter-spacing:.3px">💸 เงินเข้าแล้ว</div>' +
            '<div style="font-size:1.15rem;font-weight:900;color:#047857;line-height:1.2">฿' + _hrFmt(xfAmt) + '</div>' +
            '<div style="font-size:.73rem;color:#059669;margin-top:2px">' +
              (xfDate ? '📅 ' + _hrFmtDateShort(xfDate).slice(0,10) : '') +
              (xfNote ? ' &nbsp;·&nbsp; ' + xfNote : '') +
            '</div>' +
          '</div>' +
          (l.slipImageUrl
            ? '<a href="' + l.slipImageUrl + '" target="_blank" style="background:#fff;color:#059669;border-radius:8px;padding:6px 10px;font-size:.78rem;font-weight:700;text-decoration:none;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.08)">🖼️ ใบโอน</a>'
            : '') +
        '</div>' +
        (l.deducted
          ? '<div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:8px 12px;display:flex;align-items:center;gap:8px;font-size:.8rem">' +
              '<span style="font-size:1.1rem">💰</span>' +
              '<span style="font-weight:700;color:#1e40af">หักจากสลิปแล้ว</span>' +
              (l.deductedDate ? '<span style="color:#3b82f6;margin-left:4px">— ' + _hrFmtDateShort(l.deductedDate).slice(0,10) + '</span>' : '') +
            '</div>'
          : (l.deductMonth
              ? (function(){
                  var dm = String(l.deductMonth||'');
                  // ถ้า Date string ยาว → แปลงเป็น yyyy-MM
                  if (dm.length > 7) {
                    var d2 = new Date(dm);
                    if (!isNaN(d2)) dm = d2.getFullYear() + '-' + String(d2.getMonth()+1).padStart(2,'0');
                  }
                  var th = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
                  var pp = dm.split('-');
                  var dmLabel = pp.length === 2 ? (th[parseInt(pp[1])-1]||pp[1]) + ' ' + (parseInt(pp[0])+543) : dm;
                  return '<div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;display:flex;align-items:center;gap:8px;font-size:.8rem">' +
                    '<span style="font-size:1.1rem">⏳</span>' +
                    '<span style="color:#92400e">รอหักจากสลิป <b>' + dmLabel + '</b></span>' +
                  '</div>';
                })()
              : '')) +
        '</div>';
    } else if (l.status === 'approved' && !isManagerView) {
      actionArea = '<div style="font-size:.8rem;color:#059669">✅ อนุมัติโดย ' + (l.approvedBy || '—') + '</div>';
    } else if (l.status === 'rejected') {
      actionArea = '<div style="font-size:.8rem;color:#dc2626">❌ ปฏิเสธแล้ว</div>';
    }

    // ── ปุ่มลบ: admin ลบได้ทุก status, employee ลบได้เฉพาะ pending ──
    var canDelete = isManagerView || (l.status === 'pending');
    var deleteBtn = canDelete
      ? '<button onclick="hrDeleteLoanRequest(\''+l.requestId+'\')" '
          + 'style="width:100%;background:transparent;color:#ef4444;border:1px solid #fca5a5;border-radius:8px;'
          + 'padding:6px 10px;cursor:pointer;font-size:.8rem;font-family:inherit;font-weight:600;margin-top:2px">'
          + '🗑️ ลบใบเบิกนี้</button>'
      : '';

    var _wmStyle = l.deducted
      ? 'position:relative;overflow:hidden;'
      : '';
    var _wmHtml = l.deducted
      ? '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:2">'
          + '<span style="transform:rotate(-30deg);font-size:1.1rem;font-weight:900;color:rgba(30,64,175,.18);white-space:nowrap;letter-spacing:2px;border:3px solid rgba(30,64,175,.18);border-radius:8px;padding:6px 18px">💰 หักจากสลิปแล้ว</span>'
        + '</div>'
      : '';
    return '<div style="background:var(--bg-card);border:1px solid var(--bc-card);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;' + _wmStyle + '">' +
      _wmHtml +
      // ── header row ──
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px">' +
            '<span style="background:' + ts.bg + ';color:' + ts.color + ';border-radius:6px;padding:2px 9px;font-size:.78rem;font-weight:700">' + ts.label + '</span>' +
            badge(statusStyle, l.status, l) +
          '</div>' +
          '<div style="font-size:1.2rem;font-weight:800;color:var(--t1)">฿' + _hrFmt(l.amount) + '</div>' +
          (function(){
            var n = l.empName || (_lEmp.name) || l.empId;
            return !isEmp ? '<div style="font-size:.85rem;font-weight:600;color:var(--t2);margin-top:2px">' + n + '</div>' : '';
          })() +
        '</div>' +
        (isEmp
          ? dayCircle
          : '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0">' +
              photoAvatar +
              (l.status !== 'closed'
                ? '<div style="font-size:.6rem;color:' + ringClr + ';font-weight:700;text-align:center">' + days + ' วัน</div>'
                : '') +
            '</div>') +
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
      (canDelete ? deleteBtn : '') +
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
    title: '💰 ยื่นขอเบิกล่วงหน้า',
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
      // ตรวจ budget วงเงินเบิกล่วงหน้า (ใช้ค่าจาก hrLoanTypeChanged ที่คำนวณแม่นยำแล้ว)
      if (type === 'advance') {
        var _budgetEl = document.getElementById('lnBudgetInfo');
        var _budget = parseFloat((empOpt && empOpt.dataset.budget) || (_budgetEl && _budgetEl.dataset.budget) || 0);
        if (_budget > 0) {
          var _used = _budgetEl ? parseFloat(_budgetEl.dataset.used || 0) : 0;
          var _remain = _budgetEl ? parseFloat(_budgetEl.dataset.remain !== undefined ? _budgetEl.dataset.remain : _budget) : _budget;
          if (amt > _remain) {
            Swal.showValidationMessage('⚠️ เกินวงเงิน — เบิกแล้ว ฿' + _hrFmt(_used) + ' / วงเงิน ฿' + _hrFmt(_budget) + ' (เบิกได้อีก ฿' + _hrFmt(Math.max(0, _remain)) + ')');
            return false;
          }
        }
      }
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
            // format: dd/MM/yyyy
            var beYr = parseInt(rd.slice(6,10));
            var ceYr = beYr > 2500 ? beYr - 543 : beYr;
            rdKey = ceYr + '-' + rd.slice(3,5);
          } else {
            // Apps Script Date string หรือ ISO — ให้ Date() parse
            var _dp = new Date(rd);
            if (!isNaN(_dp)) rdKey = _dp.getFullYear() + '-' + String(_dp.getMonth()+1).padStart(2,'0');
          }
          if (rdKey === nowMon) used += parseFloat(l.amount) || 0;
        });
        const remain = Math.max(0, budget - used);
        budgetInfo.dataset.remain = remain;
        budgetInfo.dataset.used = used;
        budgetInfo.dataset.budget = budget;
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
        '<input id="apFBy" type="text" value="สุรศักดิ์" placeholder="คุณสุรศักดิ์" style="width:100%;padding:8px;border:1px solid var(--bc-input);border-radius:8px;background:var(--bg2);color:var(--t1);font-family:inherit;margin-top:4px;box-sizing:border-box">' +
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
      Swal.showLoading();
      return new Promise(function(resolve) {
        setTimeout(function() {
          resolve({
            requestId: requestId,
            approvedBy: by,
            deductMonth: document.getElementById('apFMon').value || '',
            notes: document.getElementById('apFNote').value || ''
          });
        }, 80);
      });
    }
  }).then(function(res) {
    if (!res.isConfirmed) return;
    _hrPOST('approveLoan', res.value).then(function(r) {
      if (r.status === 'ok') {
        Swal.fire({ icon: 'success', title: 'อนุมัติแล้ว', timer: 1500, showConfirmButton: false });
        _hrRenderLoans();
        _hrPayLoadAndRender();
      } else {
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: r.message, confirmButtonText: 'ตกลง' });
      }
    });
  });
}

// ── ปฏิเสธ ───────────────────────────────────────────────────
function hrDeleteLoanRequest(requestId) {
  Swal.fire({
    icon: 'warning',
    title: '🗑️ ลบใบเบิกล่วงหน้า?',
    html: 'เลขที่ <b>' + requestId + '</b><br><span style="font-size:.85rem;color:#6b7280">การลบไม่สามารถกู้คืนได้</span>',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonText: 'ยกเลิก',
    confirmButtonText: '🗑️ ลบเลย',
  }).then(function(res) {
    if (!res.isConfirmed) return;
    _hrPOST('deleteLoanRequest', { requestId: requestId }).then(function(r) {
      if (r && r.status === 'ok') {
        Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1200, showConfirmButton: false });
        _hrRenderLoans();
        _hrPayLoadAndRender();
      } else {
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: (r && r.message) || '' });
      }
    });
  });
}

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

  // หาเบอร์โทรพนักงานสำหรับ QR
  var _loanEmpRec = (_hrEmps||[]).find(function(e){ return String(e.empId)===String(loan.empId); }) || {};
  var _loanPhone  = (_loanEmpRec.phone||'').replace(/[^0-9]/g,'');
  var _loanName   = loan.empName || _loanEmpRec.name || '';
  var _loanAmt    = parseFloat(loan.amount||0);
  var qrBtnInModal = _loanPhone
    ? '<button type="button" onclick="(function(){ var a=parseFloat(document.getElementById(\'clAmt\').value)||' + '0; hrShowPromptPayQR(\''+_loanPhone+'\',a,\''+encodeURIComponent(_loanName)+'\',\''+loan.empId+'\'); })()" ' +
        'style="width:100%;margin-bottom:10px;padding:9px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:\'Sarabun\',sans-serif;font-size:.88rem;font-weight:700">🔲 สร้าง QR พร้อมเพย์</button>'
    : '<div style="margin-bottom:8px;padding:7px 10px;background:#fef3c7;border-radius:8px;font-size:.8rem;color:#92400e">⚠️ ไม่พบเบอร์โทรพนักงาน — ไม่สามารถสร้าง QR ได้</div>';

  Swal.fire({
    title: '💳 บันทึกการโอนเงิน',
    html:
      '<div style="text-align:left;font-family:\'Sarabun\',sans-serif;font-size:.92rem">' +
      qrBtnInModal +
      inp('clDate', 'วันที่โอนเงิน', 'date', new Date().toISOString().slice(0,10), '') +
      inp('clAmt',  'จำนวนที่โอน (บาท)', 'number', loan.amount || '', '0', 'min="0"') +
      inp('clNote', 'หมายเหตุ / เลขที่ใบโอน', 'text', '', 'เช่น ref. โอน') +
      deductHtml +
      '<div style="margin-bottom:4px">' +
        '<label style="font-weight:700;display:block;margin-bottom:6px;font-size:.88rem;color:#dc2626">\ud83d\udcce แนบรูปใบโอนเงิน <span style=\"color:#dc2626\">*</span></label>' +
        '<label id="clSlipLabel" style="display:flex;align-items:center;gap:8px;border:2px dashed #d1d5db;border-radius:8px;padding:10px 12px;cursor:pointer;background:#fafafa;transition:border-color .2s">' +
          '<input id="clSlip" type="file" accept="image/*" style="display:none">' +
          '<span id="clSlipIcon" style="font-size:1.4rem">\ud83d\uddbc\ufe0f</span>' +
          '<span id="clSlipTxt" style="font-size:.82rem;color:#6b7280">คลิกเพื่อเลือกรูปสลิป...</span>' +
        '</label>' +
        '<div id="clSlipPreview" style="margin-top:6px;display:none">' +
          '<img id="clSlipImg" style="max-width:100%;max-height:160px;border-radius:8px;border:1px solid #e5e7eb;object-fit:contain">' +
        '</div>' +
      '</div>' +
      '</div>',
    showCancelButton: true,
    confirmButtonText: '\u2705 ยืนยันการโอน',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0891b2',
    didOpen: function() {
      var inp  = document.getElementById('clSlip');
      var lbl  = document.getElementById('clSlipLabel');
      var txt  = document.getElementById('clSlipTxt');
      var ico  = document.getElementById('clSlipIcon');
      var prev = document.getElementById('clSlipPreview');
      var img  = document.getElementById('clSlipImg');
      if (!inp) return;
      inp.addEventListener('change', function() {
        if (!inp.files || !inp.files[0]) return;
        txt.textContent = inp.files[0].name;
        ico.textContent = '\u2705';
        lbl.style.borderColor = '#059669';
        lbl.style.background = '#f0fdf4';
        var fr = new FileReader();
        fr.onload = function(e) { img.src = e.target.result; prev.style.display = 'block'; };
        fr.readAsDataURL(inp.files[0]);
      });
    },
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
        Swal.showValidationMessage('📎 กรุณาแนบรูปสลิปการโอนเงินก่อน Save');
        return false;
      }
      var file = fileInput.files[0];
      var statusEl = document.getElementById('clSlipStatus');
      // แสดง loading ขณะอัปโหลด
      Swal.showLoading();
      if (statusEl) statusEl.textContent = '⏳ กำลังอัปโหลดรูปสลิป...';
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
  var btn = document.getElementById('hrBtn7');
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
  const p = document.getElementById('hrPanel7');
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

// ═══════════════════════════════════════════════════════════════════════
// บันทึกหักเงินกู้จากหน้าสรุปเงินเดือน
// ═══════════════════════════════════════════════════════════════════════
async function hrRecordLoanDeductFromPayroll(loanId, empId, amount, periodLabel) {
  const { value: formVals, isConfirmed } = await Swal.fire({
    title: 'บันทึกการหัก',
    html:
      '<div style="font-family:Sarabun,sans-serif;font-size:.88rem;text-align:left;line-height:1.9">' +
      '📋 <b>' + loanId + '</b>&nbsp;&nbsp;งวด: ' + periodLabel + '<br>' +
      '<label style="font-weight:600">ยอดที่หัก (฿)</label><br>' +
      '<input id="swal-deduct-amt" type="number" step="0.01" min="0.01" value="' + amount.toFixed(2) + '" ' +
        'style="width:100%;padding:7px 10px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:1rem;font-family:Sarabun,sans-serif;margin-top:2px;box-sizing:border-box">' +
      '<label style="font-weight:600;margin-top:8px;display:block">หมายเหตุ (ถ้ามี)</label>' +
      '<input id="swal-deduct-note" type="text" placeholder="เช่น งวดสุดท้าย" ' +
        'style="width:100%;padding:7px 10px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:.9rem;font-family:Sarabun,sans-serif;margin-top:2px;box-sizing:border-box">' +
      '</div>',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: '💳 บันทึก',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#059669',
    preConfirm: function() {
      var a = parseFloat(document.getElementById('swal-deduct-amt').value);
      if (!a || a <= 0) { Swal.showValidationMessage('ยอดหักต้องมากกว่า 0'); return false; }
      return { amount: a, note: document.getElementById('swal-deduct-note').value.trim() };
    }
  });
  if (!isConfirmed || !formVals) return;

  const finalAmt = formVals.amount;
  const finalNote = formVals.note || 'หักจากสรุปเงินเดือน';

  const url = (typeof SCRIPT_URL !== 'undefined' && SCRIPT_URL) || localStorage.getItem('ptts_script_url') || '';
  if (!url) { Swal.fire('Error', 'ยังไม่ได้ตั้งค่า Script URL', 'error'); return; }

  // สร้างวันที่วันนี้ dd/MM/yyyy BE
  var _now = new Date();
  var _pd = String(_now.getDate()).padStart(2,'0') + '/' +
            String(_now.getMonth()+1).padStart(2,'0') + '/' +
            (_now.getFullYear() + 543);

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: 'recordHRLoanPayment',
        loanId: loanId,
        empId: empId,
        amount: finalAmt,
        payDate: _pd,
        periodLabel: periodLabel,
        note: finalNote,
        recordedBy: 'HR'
      })
    });
    const d = await r.json();
    if (d.status === 'ok') {
      await Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ ✅', timer: 1400, showConfirmButton: false });
      try {
        const lc = await _hrGET('getHRLoanContracts');
        _hrLoanContracts = Array.isArray(lc) ? lc : ((lc && lc.data) ? lc.data : []);
      } catch(e2) { _hrLoanContracts = []; }
      _hrPayLoadAndRender();
    } else {
      Swal.fire('เกิดข้อผิดพลาด', d.message || 'ไม่ทราบสาเหตุ', 'error');
    }
  } catch(err) {
    Swal.fire('Error', String(err), 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// HR LOAN CONTRACTS MODULE

async function hrRecordSalaryPayment(empId, empName, netPay) {
  var mon = _hrSumMon || (function(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); })();
  var prdLabel = _hrSumPeriod === 'p1' ? 'งวด 1' : _hrSumPeriod === 'p2' ? 'งวด 2' : 'ทั้งเดือน';
  var todayStr = (function(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })();
  const { value: v, isConfirmed } = await Swal.fire({
    title: '💳 บันทึกโอนเงินเดือน',
    html:
      '<div style="font-family:Sarabun,sans-serif;font-size:.88rem;text-align:left;line-height:2">' +
      '👤 <b>' + empName + '</b> | ' + prdLabel + ' ' + mon + '<br>' +
      '<label style="font-weight:600">วันที่โอน</label><br>' +
      '<input id="sp_date" type="date" value="' + todayStr + '" style="width:100%;border-radius:8px;border:1px solid var(--bc-input);padding:6px 10px;font-size:.9rem;font-family:Sarabun,sans-serif;box-sizing:border-box"><br>' +
      '<label style="font-weight:600">ยอดที่โอน (฿)</label><br>' +
      '<input id="sp_amt" type="number" value="' + netPay.toFixed(2) + '" step="0.01" style="width:100%;border-radius:8px;border:1px solid var(--bc-input);padding:6px 10px;font-size:.9rem;font-family:Sarabun,sans-serif;box-sizing:border-box"><br>' +
      '<label style="font-weight:600">หมายเหตุ</label><br>' +
      '<input id="sp_note" type="text" placeholder="เช่น โอนผ่าน KBank" style="width:100%;border-radius:8px;border:1px solid var(--bc-input);padding:6px 10px;font-size:.9rem;font-family:Sarabun,sans-serif;box-sizing:border-box">' +
      '</div>',
    showCancelButton: true,
    confirmButtonText: '✅ บันทึก',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0891b2',
    preConfirm: function() {
      return {
        transferDate: document.getElementById('sp_date').value,
        amount: parseFloat(document.getElementById('sp_amt').value)||0,
        note: document.getElementById('sp_note').value.trim()
      };
    }
  });
  if (!isConfirmed || !v) return;
  try {
    var res = await _hrPOST('recordSalaryPayment', {
      empId: empId, empName: empName,
      month: mon, period: _hrSumPeriod||'all',
      amount: v.amount, transferDate: v.transferDate,
      note: v.note, recordedBy: 'admin'
    });
    if (res && res.status === 'ok') {
      Swal.fire({ icon:'success', title:'บันทึกแล้ว', text:'โอนเงินเดือน ' + empName + ' เรียบร้อย', timer:2000, showConfirmButton:false });
    } else {
      Swal.fire({ icon:'error', title:'ผิดพลาด', text: (res&&res.message)||'ไม่ทราบสาเหตุ' });
    }
  } catch(e) {
    Swal.fire({ icon:'error', title:'ผิดพลาด', text: String(e) });
  }
}

// ─────────────────────────────────────────────────────────────
// _hrPCRecalc — อัปเดต net ในการ์ดแบบ realtime เมื่อแก้ยอดหัก
// ─────────────────────────────────────────────────────────────
function _hrPCRecalc(empId) {
  var baseEl = document.getElementById('pcBase_' + empId);
  if (!baseEl) return;
  var base  = parseFloat(baseEl.value) || 0;
  var total = 0;
  document.querySelectorAll('[id^="pcLd_' + empId + '_"]').forEach(function(inp) {
    total += parseFloat(inp.value) || 0;
  });
  var newNet = base - total;
  var netEl = document.getElementById('pcNet_' + empId);
  if (netEl) {
    netEl.textContent = '฿' + _hrFmt(newNet);
    netEl.setAttribute('data-net', newNet.toFixed(2));
  }
  var tdEl = document.getElementById('pcTDed_' + empId);
  if (tdEl) {
    var fixedEl = document.getElementById('pcBase_' + empId);
    // totalDed = base - newNet
    tdEl.textContent = '&minus;฿' + _hrFmt(base - newNet);
    tdEl.innerHTML = '&minus;฿' + _hrFmt(base - newNet);
  }
}

// ─────────────────────────────────────────────────────────────
// hrConfirmPayrollFromCard — อ่าน net + loan items จากการ์ด แล้วเปิด dialog ยืนยัน
// ─────────────────────────────────────────────────────────────
async function hrConfirmPayrollFromCard(empId, nameEnc, month, period) {
  var empName  = decodeURIComponent(nameEnc || '');
  var netEl    = document.getElementById('pcNet_' + empId);
  var net      = netEl ? (parseFloat(netEl.getAttribute('data-net')) || 0) : 0;
  var loanItems = [];
  document.querySelectorAll('[id^="pcLd_' + empId + '_"]').forEach(function(inp) {
    loanItems.push({
      source:       inp.dataset.src  || '',
      loanId:       inp.dataset.key  || '',
      requestId:    inp.dataset.key  || '',
      advanceClosed: inp.dataset.advc === '1',
      label:        inp.dataset.lbl  || '',
      amount:       parseFloat(inp.value) || 0
    });
  });
  var loanEnc = encodeURIComponent(JSON.stringify(loanItems));
  await hrConfirmPayroll(empId, nameEnc, net, month, period, loanEnc);
}

async function hrConfirmPayroll(id, nameEnc, net, month, period, loanEnc) {
  var empName   = decodeURIComponent(nameEnc || '');
  var loanItems = [];
  try { loanItems = JSON.parse(decodeURIComponent(loanEnc || '%5B%5D')); } catch(e2) {}
  var prdLabel = period === 'p1' ? 'งวด 1' : period === 'p2' ? 'งวด 2' : 'ทั้งเดือน';

  // ── ป้องกันโอนซ้ำ (client-side: ตรวจ cache) ──
  var existing = (_hrSalaryPaid || []).find(function(p) {
    return String(p.empId) === String(id) && p.month === month &&
           (p.period === period || p.period === 'all' || period === 'all');
  });
  if (existing) {
    var monLbl2 = (function(){
      var pp = (month||'').split('-');
      if (pp.length < 2) return month||'';
      var th = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
      return th[parseInt(pp[1])-1] + ' ' + (parseInt(pp[0])+543);
    })();
    Swal.fire({
      icon: 'warning',
      title: '⚠️ บันทึกซ้ำ!',
      html: '<div style="font-family:Sarabun,sans-serif;font-size:.9rem;line-height:1.8">'
        + '👤 <b>' + empName + '</b> ' + prdLabel + ' ' + monLbl2 + '<br>'
        + '✅ บันทึกการโอนไว้แล้ว วันที่ <b>' + existing.transferDate + '</b><br>'
        + 'ยอด <b>฿' + Number(existing.amount).toLocaleString('th-TH',{minimumFractionDigits:2}) + '</b><br><br>'
        + '<span style="font-size:.82rem;color:#6b7280">ถ้าต้องการแก้ไข กรุณาลบรายการเดิม (🗑️) ก่อน</span>'
        + '</div>',
      confirmButtonText: 'ตกลง'
    });
    return;
  }
  var todayStr = (function(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })();
  var monLabel = (function(){
    var p = (month||'').split('-');
    if (p.length < 2) return month||'';
    var th = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return th[parseInt(p[1])-1] + ' ' + (parseInt(p[0])+543);
  })();

  // Helper: อ่านไฟล์เป็น base64
  function readFileBase64(file) {
    return new Promise(function(resolve, reject) {
      var fr = new FileReader();
      fr.onload = function(e) { resolve(e.target.result.split(',')[1]); };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  // ยอด net คำนวณมาจากการ์ดหลักแล้ว ไม่ต้องแสดงรายการหักซ้ำในนี้
  var _cpDedSection = '';

  var { value: v, isConfirmed } = await Swal.fire({
    title: '\ud83d\udcb8 รอโอนเงินเดือน',
    html: '<div style="font-family:Sarabun,sans-serif;font-size:.88rem;text-align:left;line-height:1.8">'
      + '<div style="background:#f0fdf4;border:0.5px solid #86efac;border-radius:8px;padding:6px 12px;margin-bottom:10px">'
        + '\ud83d\udc64 <b>' + empName + '</b> | ' + prdLabel + ' ' + monLabel
      + '</div>'
      + '<label style="font-weight:600;display:block;margin-bottom:2px">วันที่โอน</label>'
      + '<input id="cp_date" type="date" value="' + todayStr + '" style="width:100%;border-radius:8px;border:1px solid #d1d5db;padding:6px 10px;font-size:.9rem;font-family:Sarabun,sans-serif;box-sizing:border-box;margin-bottom:8px"><br>'
      + _cpDedSection
      + '<label style="font-weight:600;display:block;margin-bottom:2px">ยอดที่โอน (฿)</label>'
      + '<input id="cp_amt" type="number" value="' + net.toFixed(2) + '" step="0.01" style="width:100%;border-radius:8px;border:1px solid #d1d5db;padding:6px 10px;font-size:.9rem;font-family:Sarabun,sans-serif;box-sizing:border-box;margin-bottom:8px"><br>'
      + '<label style="font-weight:600;display:block;margin-bottom:2px">หมายเหตุ</label>'
      + '<input id="cp_note" type="text" placeholder="เช่น โอนผ่าน KBank" style="width:100%;border-radius:8px;border:1px solid #d1d5db;padding:6px 10px;font-size:.9rem;font-family:Sarabun,sans-serif;box-sizing:border-box;margin-bottom:8px"><br>'
      + '<label style="font-weight:700;display:block;margin-bottom:4px;color:#dc2626">📎 แนบสลิปโอนเงิน <span style="color:#dc2626;font-size:.75rem">(บังคับ — พนักงานต้องใช้สลิป)</span></label>'
      + '<label id="cp_slip_label" style="display:flex;align-items:center;gap:8px;border:2px dashed #d1d5db;border-radius:8px;padding:10px 12px;cursor:pointer;background:#fafafa;transition:border-color .2s">'
        + '<input id="cp_slip" type="file" accept="image/*" style="display:none">'
        + '<span id="cp_slip_icon" style="font-size:1.4rem">\ud83d\uddbc\ufe0f</span>'
        + '<span id="cp_slip_txt" style="font-size:.82rem;color:#6b7280">คลิกเพื่อเลือกรูปสลิป...</span>'
      + '</label>'
      + '<div id="cp_slip_preview" style="margin-top:6px;display:none">'
        + '<img id="cp_slip_img" style="max-width:100%;max-height:160px;border-radius:8px;border:1px solid #e5e7eb;object-fit:contain">'
      + '</div>'
      + '</div>',
    showCancelButton: true,
    confirmButtonText: '\u2705 ยืนยันโอนแล้ว',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#059669',
    didOpen: function() {
      var inp = document.getElementById('cp_slip');
      var lbl = document.getElementById('cp_slip_label');
      var txt = document.getElementById('cp_slip_txt');
      var ico = document.getElementById('cp_slip_icon');
      var prev = document.getElementById('cp_slip_preview');
      var img  = document.getElementById('cp_slip_img');
      inp.addEventListener('change', function() {
        if (!inp.files || !inp.files[0]) return;
        var file = inp.files[0];
        txt.textContent = file.name;
        ico.textContent = '\u2705';
        lbl.style.borderColor = '#059669';
        lbl.style.background = '#f0fdf4';
        var fr = new FileReader();
        fr.onload = function(e) { img.src = e.target.result; prev.style.display = 'block'; };
        fr.readAsDataURL(file);
      });
      // ── wire deduction inputs → recalc net ──
      function _cpRecalc() {
        var t = 0;
        document.querySelectorAll('[id^="cp_ded_"]').forEach(function(e) { t += parseFloat(e.value) || 0; });
        var el = document.getElementById('cp_amt');
        if (el) el.value = (_cpGross - t).toFixed(2);
      }
      document.querySelectorAll('[id^="cp_ded_"]').forEach(function(e) {
        e.addEventListener('input', _cpRecalc);
      });
    },
    preConfirm: function() {
      var inp = document.getElementById('cp_slip');
      // บังคับแนบสลิป
      if (!inp || !inp.files || !inp.files[0]) {
        Swal.showValidationMessage('📎 กรุณาแนบสลิปโอนเงินก่อนยืนยัน');
        return false;
      }
      // อ่านยอดหักที่ปรับแล้ว
      var _adjItems = loanItems.map(function(x, i) {
        var el = document.getElementById('cp_ded_' + i);
        return Object.assign({}, x, { amount: el ? (parseFloat(el.value) || 0) : (x.amount || 0) });
      });
      return {
        transferDate: document.getElementById('cp_date').value,
        amount: parseFloat(document.getElementById('cp_amt').value) || 0,
        note: document.getElementById('cp_note').value.trim(),
        slipFile: (inp && inp.files && inp.files[0]) ? inp.files[0] : null,
        adjustedLoanItems: _adjItems
      };
    }
  });
  if (!isConfirmed || !v) return;

  Swal.fire({ title: '\u23f3 กำลังบันทึก...', allowOutsideClick: false, didOpen: function(){ Swal.showLoading(); } });
  try {
    // อัปโหลดสลิป (ถ้ามี)
    var slipUrl = '';
    if (v.slipFile) {
      var base64 = await readFileBase64(v.slipFile);
      var upRes = await _hrPOST('uploadSlipImage', {
        base64: base64, mimeType: v.slipFile.type, filename: 'salary_slip_' + id + '_' + month + '.jpg'
      });
      if (upRes && upRes.status === 'ok') {
        slipUrl = upRes.url || '';
      }
      // ถ้า upload ไม่สำเร็จ → ดำเนินการต่อได้ (slipUrl = '' ไม่มีปัญหา)
    }

    // บันทึกการโอน
    var res = await _hrPOST('recordSalaryPayment', {
      empId: id, empName: empName,
      month: month, period: period || 'all',
      amount: v.amount, transferDate: v.transferDate,
      note: v.note, slipUrl: slipUrl, recordedBy: 'admin',
      deductItems: (v.adjustedLoanItems && v.adjustedLoanItems.length) ? v.adjustedLoanItems : loanItems
    });
    if (res && res.status === 'ok') {
      // ── Auto ตัดยอดเงินกู้/เบิกที่ถูกหักงวดนี้ ──
      var _effItems = (v.adjustedLoanItems && v.adjustedLoanItems.length) ? v.adjustedLoanItems : loanItems;
      // ── เตือนถ้า HR ใส่ 0 ในรายการที่แก้ได้ ──
      var _zeroItems = _effItems.filter(function(x){
        return (x.source === 'contract' || x.source === 'request') && (x.amount || 0) === 0;
      });
      if (_zeroItems.length) {
        var _zeroLabels = _zeroItems.map(function(x){ return '• ' + (x.label || x.requestId || x.loanId); }).join('<br>');
        var { isConfirmed: _zeroOk } = await Swal.fire({
          icon: 'warning',
          title: '⚠️ ยอดหักเป็น 0',
          html: '<div style="font-family:Sarabun,sans-serif;font-size:.9rem;text-align:left;line-height:1.8">'
            + 'รายการต่อไปนี้จะ <b>ไม่ถูกหัก</b>งวดนี้ และ<b>ยังค้างอยู่</b>สำหรับงวดถัดไป:<br><br>'
            + '<span style="color:#dc2626">' + _zeroLabels + '</span><br><br>'
            + '<span style="font-size:.82rem;color:#6b7280">ถ้าต้องการยกเว้นงวดนี้จริงๆ กด ยืนยัน</span>'
            + '</div>',
          showCancelButton: true,
          confirmButtonText: 'ยืนยัน ข้ามการหักงวดนี้',
          cancelButtonText: 'กลับไปแก้',
          confirmButtonColor: '#dc2626'
        });
        if (!_zeroOk) return;
      }
      var contractDeducts = _effItems.filter(function(x){ return x.source === 'contract' && x.loanId && x.amount > 0; });
      var requestDeducts  = _effItems.filter(function(x){ return x.source === 'request' && x.requestId && x.amount > 0; });
      if (contractDeducts.length || requestDeducts.length) {
        try {
          await _hrPOST('payrollDeductLoans', {
            contracts: contractDeducts.map(function(x){ return { loanId: x.loanId, amount: x.amount }; }),
            requests:  requestDeducts.map(function(x){ return { requestId: x.requestId, amount: x.amount }; })
          });
          if (contractDeducts.length) _hrSetLoanBadge(); // แจ้งเตือนแท็บสัญญาเงินกู้
        } catch(e3) { /* ไม่ block — salary บันทึกแล้ว */ }
        // ── mark advance closed → deducted (เฉพาะที่หักครบ) ──
        var closedAdvanceIds = _effItems
          .filter(function(x){ return x.advanceClosed && x.requestId && x.amount > 0; })
          .map(function(x){ return x.requestId; });
        if (closedAdvanceIds.length) {
          try {
            await _hrPOST('markAdvanceDeducted', { requestIds: closedAdvanceIds });
          } catch(e4) { /* ไม่ block */ }
        }
      }
      await Swal.fire({ icon:'success', title:'บันทึกแล้ว', text:'โอนเงินเดือน ' + empName + ' เรียบร้อย', timer:1800, showConfirmButton:false });
      _hrPayLoadAndRender();
    } else {
      Swal.fire({ icon:'error', title:'ผิดพลาด', text:(res&&res.message)||'ไม่ทราบสาเหตุ' });
    }
  } catch(err) {
    Swal.fire({ icon:'error', title:'ผิดพลาด', text:String(err) });
  }
}

async function hrDeleteSalaryPayment(payId) {
  var { isConfirmed } = await Swal.fire({
    icon: 'warning',
    title: 'ลบประวัติการโอน?',
    text: 'ยืนยันลบรายการโอนเงินเดือนนี้?',
    showCancelButton: true,
    confirmButtonText: 'ลบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#dc2626'
  });
  if (!isConfirmed) return;
  try {
    var res = await _hrPOST('deleteSalaryPayment', { payId: payId });
    if (res && res.status === 'ok') {
      await Swal.fire({ icon:'success', title:'ลบแล้ว', timer:1500, showConfirmButton:false });
      _hrPayLoadAndRender();
    } else {
      Swal.fire({ icon:'error', title:'ผิดพลาด', text:(res&&res.message)||'ไม่ทราบสาเหตุ' });
    }
  } catch(err) {
    Swal.fire({ icon:'error', title:'ผิดพลาด', text:String(err) });
  }
}

async function hrRecordAdvReqDeductFromPayroll(requestId, empId, amount, periodLabel) {
  const { value: formVals, isConfirmed } = await Swal.fire({
    title: 'บันทึกหักเงินเบิก',
    html:
      '<div style="font-family:Sarabun,sans-serif;font-size:.88rem;text-align:left;line-height:1.9">' +
      '📋 <b>' + requestId + '</b>&nbsp;&nbsp;งวด: ' + periodLabel + '<br>' +
      '<label style="font-weight:600">ยอดที่หัก (฿)</label><br>' +
      '<input id="swal-adv-amt" type="number" step="0.01" min="0.01" value="' + amount.toFixed(2) + '" ' +
        'style="width:100%;padding:7px 10px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:1rem;font-family:Sarabun,sans-serif;margin-top:2px;box-sizing:border-box">' +
      '<label style="font-weight:600;margin-top:8px;display:block">หมายเหตุ (ถ้ามี)</label>' +
      '<input id="swal-adv-note" type="text" placeholder="เช่น หักเต็มจำนวน" ' +
        'style="width:100%;padding:7px 10px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:.9rem;font-family:Sarabun,sans-serif;margin-top:2px;box-sizing:border-box">' +
      '</div>',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: '💳 บันทึก',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#059669',
    preConfirm: function() {
      var a = parseFloat(document.getElementById('swal-adv-amt').value);
      if (!a || a <= 0) { Swal.showValidationMessage('ยอดหักต้องมากกว่า 0'); return false; }
      return { amount: a, note: document.getElementById('swal-adv-note').value.trim() };
    }
  });
  if (!isConfirmed || !formVals) return;

  var _now = new Date();
  var _pd = String(_now.getDate()).padStart(2,'0') + '/' +
            String(_now.getMonth()+1).padStart(2,'0') + '/' +
            (_now.getFullYear() + 543);
  const url = (typeof SCRIPT_URL !== 'undefined' && SCRIPT_URL) || localStorage.getItem('ptts_script_url') || '';
  if (!url) { Swal.fire('Error', 'ยังไม่ได้ตั้งค่า Script URL', 'error'); return; }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: 'closeLoan',
        requestId: requestId,
        deductMonth: periodLabel,
        transferDate: _pd,
        transferAmount: formVals.amount,
        transferNote: formVals.note || 'หักจากสรุปเงินเดือน'
      })
    });
    const d = await r.json();
    if (d.status === 'ok') {
      await Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ ✅', timer: 1400, showConfirmButton: false });
      try {
        var lr = await _hrGET('getLoanRequests'); // โหลดทุก status
        _hrLoans = Array.isArray(lr) ? lr : ((lr && lr.data) ? lr.data : []);
      } catch(e2) { _hrLoans = []; }
      _hrPayLoadAndRender();
    } else {
      Swal.fire('เกิดข้อผิดพลาด', d.message || 'ไม่ทราบสาเหตุ', 'error');
    }
  } catch(err) {
    Swal.fire('Error', String(err), 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════

var _hrLoanContracts = [];
var _lcShowClosed = false; // toggle แสดงสัญญาปิดแล้ว
var _hrSalaryPaid = [];  // cached getSalaryPayments for current month
var _hrLoanContractPayments = [];

// ── loader ───────────────────────────────────────────────────────────
function _hrLoanContractsLoad(empId, cb) {
  var url = (typeof SCRIPT_URL !== 'undefined' ? SCRIPT_URL : (localStorage.getItem('ptts_script_url')||''));
  if (!url) { cb && cb(); return; }
  var qs = empId ? '?action=getHRLoanContracts&empId=' + encodeURIComponent(empId)
                 : '?action=getHRLoanContracts';
  fetch(url + qs).then(function(r){ return r.json(); }).then(function(d){
    _hrLoanContracts = d.data || [];
    cb && cb();
  }).catch(function(){ cb && cb(); });
}

function _hrLoanContractPaymentsLoad(loanId, empId, cb) {
  var url = (typeof SCRIPT_URL !== 'undefined' ? SCRIPT_URL : (localStorage.getItem('ptts_script_url')||''));
  if (!url) { cb && cb(); return; }
  var qs = '?action=getHRLoanPayments';
  if (loanId) qs += '&loanId=' + encodeURIComponent(loanId);
  if (empId)  qs += '&empId='  + encodeURIComponent(empId);
  fetch(url + qs).then(function(r){ return r.json(); }).then(function(d){
    _hrLoanContractPayments = d.data || [];
    cb && cb();
  }).catch(function(){ cb && cb(); });
}

// ── Admin: render sub-tab 8 ────────────────────────────────────────────
function _hrRenderLoanContracts() {
  var panel = document.getElementById('hrPanel8');
  if (!panel) return;
  panel.innerHTML = '<div style="padding:8px 4px;color:var(--t3);font-size:.85rem">⏳ กำลังโหลด...</div>';
  // โหลดพนักงาน + สัญญา + ประวัติพร้อมกัน
  var calls = [
    _hrGET('getHRLoanContracts', {}),
    _hrGET('getHRLoanPayments', {})
  ];
  if (!_hrEmps || !_hrEmps.length) calls.push(_hrGET('getHREmployees'));
  Promise.all(calls).then(function(results) {
    _hrLoanContracts = (results[0] && results[0].data) || [];
    _hrLoanContractPayments = (results[1] && results[1].data) || [];
    if (results[2] && results[2].data) _hrEmps = results[2].data;
    panel.innerHTML = _hrLoanContractsPanelHtml();
  }).catch(function(e) {
    panel.innerHTML = '<div style="padding:20px;color:#dc2626">โหลดไม่สำเร็จ: ' + e.message + '</div>';
  });
}

function _lcToggleClosed() {
  _lcShowClosed = !_lcShowClosed;
  var p = document.getElementById('hrPanel8');
  if (p) p.innerHTML = _hrLoanContractsPanelHtml();
}

function _hrLoanContractsPanelHtml() {
  var totalActive = _hrLoanContracts.filter(function(l){ return l.status==='active'; });
  var totalClosed = _hrLoanContracts.filter(function(l){ return l.status==='closed'; });
  var totalOutstanding = totalActive.reduce(function(s,l){ return s + l.outstanding; }, 0);
  var visible = _lcShowClosed ? _hrLoanContracts : totalActive;

  var toggleBtn = totalClosed.length
    ? '<button onclick="_lcToggleClosed()" style="background:' + (_lcShowClosed ? '#059669' : '#e2e8f0') + ';color:' + (_lcShowClosed ? '#fff' : '#475569') + ';border:none;border-radius:8px;padding:6px 13px;cursor:pointer;font-family:\'Sarabun\',sans-serif;font-size:.82rem;font-weight:600;display:flex;align-items:center;gap:5px">'
        + (_lcShowClosed ? '✅ ซ่อนสัญญาปิดแล้ว (' + totalClosed.length + ')' : '🗂 แสดงสัญญาปิดแล้ว (' + totalClosed.length + ')')
      + '</button>'
    : '';

  var html = '<div style="padding:0 4px">' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">' +
      _lcStatBox('📋', 'สัญญาทั้งหมด', _hrLoanContracts.length, '#6366f1') +
      _lcStatBox('🟢', 'กำลังผ่อน', totalActive.length, '#10b981') +
      _lcStatBox('💰', 'ยอดค้างรวม', '\u0e3f'+_hrFmt(totalOutstanding), '#f59e0b') +
    '</div>' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">' +
      '<div style="font-size:1rem;font-weight:700;color:var(--t1)">📋 รายการสัญญาเงินกู้</div>' +
      '<div style="display:flex;gap:8px;align-items:center">' +
        toggleBtn +
        '<button onclick="hrLoanContractAdd()" style="background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:7px 16px;cursor:pointer;font-family:\'Sarabun\',sans-serif;font-size:.88rem;font-weight:600">➕ เพิ่มสัญญา</button>' +
      '</div>' +
    '</div>';

  if (!visible.length) {
    html += '<div style="padding:40px;text-align:center;color:var(--t3)">'
      + (totalClosed.length && !_lcShowClosed ? '🗂 มีสัญญาปิดแล้ว ' + totalClosed.length + ' รายการ — กดปุ่ม "แสดงสัญญาปิดแล้ว" เพื่อดู' : 'ยังไม่มีสัญญาเงินกู้')
      + '</div>';
  } else {
    html += '<div style="display:flex;flex-direction:column;gap:12px">';
    visible.forEach(function(lc) {
      html += _hrLoanContractCardHtml(lc);
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function _lcStatBox(icon, label, val, color) {
  return '<div style="background:var(--bg2);border-radius:12px;padding:14px 16px;text-align:center">' +
    '<div style="font-size:1.3rem;margin-bottom:4px">' + icon + '</div>' +
    '<div style="font-size:1.1rem;font-weight:800;color:' + color + '">' + val + '</div>' +
    '<div style="font-size:.72rem;color:var(--t3);margin-top:2px">' + label + '</div>' +
  '</div>';
}

function _hrLoanContractCardHtml(lc) {
  var paid = lc.originalAmount - lc.outstanding;
  var pct = lc.originalAmount > 0 ? Math.min(100, Math.round(paid / lc.originalAmount * 100)) : 0;
  var isActive = lc.status === 'active';
  var barColor = pct >= 100 ? '#10b981' : pct >= 60 ? '#6366f1' : '#f59e0b';
  var accentColor = lc.type === 'advance' ? '#6366f1' : '#ec4899';
  var typeLabel   = lc.type === 'advance' ? 'เบิก' : 'กู้';
  var empPayments = _hrLoanContractPayments.filter(function(p){ return p.loanId === lc.loanId; });

  // employee photo (admin only)
  var _lcEmp   = (_hrEmps||[]).find(function(e){ return String(e.empId)===String(lc.empId); }) || {};
  var _lcThumb = _hrDriveThumb(_lcEmp.profileUrl || '');
  var _lcInit  = (lc.empName||'?').trim().charAt(0).toUpperCase();
  var _lcIsAdmin = _hrSession && _hrSession.role === 'manager';
  var avatarHtml = !_lcIsAdmin ? '' : (_lcThumb
    ? '<img src="' + _lcThumb + '" onerror="this.style.display=\'none\'" alt="photo" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.8);box-shadow:0 2px 8px rgba(0,0,0,.2)">'
    : '<div style="width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,.25);border:3px solid rgba(255,255,255,.7);display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:800;color:#fff">' + _lcInit + '</div>');

  var _closedWm = !isActive
    ? '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:3;transform:rotate(-25deg)">'
        + '<span style="font-size:2rem;font-weight:900;color:rgba(5,150,105,0.18);white-space:nowrap;letter-spacing:3px;font-family:Sarabun,sans-serif">✅ ชำระครบแล้ว</span>'
      + '</div>'
    : '';
  var _headerBg = isActive
    ? 'linear-gradient(135deg,' + accentColor + ' 0%,' + accentColor + 'bb 100%)'
    : 'linear-gradient(135deg,#94a3b8,#64748b)';
  var _outerStyle = 'background:var(--bg-card);border:1.5px solid ' + (isActive ? 'var(--bc-card)' : '#94a3b8') + ';border-radius:16px;overflow:hidden;box-shadow:0 2px 14px rgba(0,0,0,.07);position:relative;' + (!isActive ? 'opacity:.85' : '');

  return (
    '<div style="' + _outerStyle + '">' +
    _closedWm +
    // ── gradient header ──
    '<div style="background:' + _headerBg + ';padding:14px 16px;display:flex;align-items:center;gap:12px">' +
      (_lcIsAdmin && avatarHtml ? '<div style="flex-shrink:0">' + avatarHtml + '</div>' : '') +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px">' +
          '<span style="background:rgba(255,255,255,.2);color:#fff;border-radius:6px;padding:2px 9px;font-size:.74rem;font-weight:700">' + typeLabel + '</span>' +
          (isActive
            ? '<span style="background:#d1fae5;color:#065f46;border-radius:99px;padding:2px 9px;font-size:.72rem;font-weight:600">🟢 กำลังผ่อน</span>'
            : '<span style="background:rgba(255,255,255,.9);color:#059669;border-radius:99px;padding:2px 9px;font-size:.72rem;font-weight:700">✅ ปิดแล้ว' + (lc.closedDate ? ' · ' + lc.closedDate.slice(0,10) : '') + '</span>') +
        '</div>' +
        '<div style="font-size:1.2rem;font-weight:900;color:#fff;line-height:1.2">฿' + _hrFmt(lc.outstanding) + '<span style="font-size:.7rem;font-weight:400;opacity:.8;margin-left:5px">คงค้าง</span></div>' +
        '<div style="font-size:.8rem;color:rgba(255,255,255,.85);margin-top:2px">' + lc.empName + '</div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
        '<div style="font-size:.64rem;color:rgba(255,255,255,.7)">หักต่องวด</div>' +
        '<div style="font-size:1rem;font-weight:800;color:#fff">฿' + _hrFmt(lc.installmentAmt) + '</div>' +
        '<div style="font-size:.64rem;color:rgba(255,255,255,.7);margin-top:2px">วันที่ ' + lc.payDays + '</div>' +
      '</div>' +
    '</div>' +
    // ── body ──
    '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">' +
      // loan id + reason
      '<div style="display:flex;justify-content:space-between;font-size:.77rem;color:var(--t3)">' +
        '<span>' + lc.loanId + '</span>' +
        '<span style="color:var(--t2)">📌 ' + (lc.reason||'—') + '</span>' +
      '</div>' +
      // progress
      '<div>' +
        '<div style="display:flex;justify-content:space-between;font-size:.74rem;color:var(--t3);margin-bottom:5px">' +
          '<span>จ่ายแล้ว <b style="color:' + barColor + '">฿' + _hrFmt(paid) + '</b></span>' +
          '<span>ทั้งหมด ฿' + _hrFmt(lc.originalAmount) + ' <b style="color:' + barColor + '">(' + pct + '%)</b></span>' +
        '</div>' +
        '<div style="background:var(--bc-card);border-radius:99px;height:8px;overflow:hidden">' +
          '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,' + barColor + ',' + barColor + 'aa);border-radius:99px;transition:width .5s"></div>' +
        '</div>' +
      '</div>' +
      // payment history
      (empPayments.length > 0
        ? '<div style="background:var(--bg2);border-radius:10px;padding:9px 12px">' +
            '<div style="font-size:.74rem;font-weight:700;color:var(--t2);margin-bottom:6px">📜 ประวัติการหัก</div>' +
            empPayments.slice(-3).reverse().map(function(p){
              return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--bc-input);font-size:.76rem">' +
                '<span style="color:var(--t3)">' + (p.periodLabel||p.payDate) + '</span>' +
                '<span style="color:#059669;font-weight:700">−฿' + _hrFmt(p.amount) + '</span>' +
              '</div>';
            }).join('') +
          '</div>'
        : '') +
      // action buttons
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        (isActive
          ? '<button onclick="hrLoanContractRecordPayment(\'' + lc.loanId + '\')" style="flex:1;background:linear-gradient(135deg,#0891b2,#06b6d4);color:#fff;border:none;border-radius:10px;padding:9px 10px;cursor:pointer;font-family:\'Sarabun\',sans-serif;font-size:.86rem;font-weight:700;box-shadow:0 2px 8px rgba(8,145,178,.25)">💳 บันทึกการหัก</button>'
          : '') +
        '<button onclick="hrViewLoanContract(\'' + lc.loanId + '\')" style="flex:1;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;border-radius:10px;padding:9px 10px;cursor:pointer;font-family:\'Sarabun\',sans-serif;font-size:.86rem;font-weight:700;box-shadow:0 2px 8px rgba(124,58,237,.2)">📄 ดูสัญญา</button>' +
      '</div>' +
    '</div>' +
    '</div>'
  );
}

// ── Add contract form ─────────────────────────────────────────────────
function hrLoanContractAdd() {
  var empOptions = (_hrEmps||[]).map(function(e){
    return '<option value="' + e.empId + '">' + e.name + ' (' + (e.dept||'') + ')</option>';
  }).join('');
  Swal.fire({
    title: 'เพิ่มสัญญาเงินกู้',
    html:
      '<div style="text-align:left;display:flex;flex-direction:column;gap:10px;font-size:.88rem;font-family:\'Sarabun\',sans-serif">' +
      '<label>พนักงาน<br><select id="lc_empId" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:8px;font-family:inherit;font-size:.88rem">' +
        '<option value="">-- เลือก --</option>' + empOptions +
      '</select></label>' +
      '<label>ประเภท<br><select id="lc_type" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:8px;font-family:inherit">' +
        '<option value="loan">กู้เงิน</option><option value="advance">เบิกเงิน</option>' +
      '</select></label>' +
      '<label>ยอดคงค้าง (บาท)<br><input id="lc_outstanding" type="number" placeholder="8819" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:8px;font-family:inherit"></label>' +
      '<label>หักต่องวด (บาท)<br><input id="lc_installAmt" type="number" placeholder="1750" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:8px;font-family:inherit"></label>' +
      '<label>วันหัก (เช่น 1,16)<br><input id="lc_payDays" value="1,16" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:8px;font-family:inherit"></label>' +
      '<label>วัตถุประสงค์<br><input id="lc_reason" placeholder="เช่น ค่าใช้จ่ายตรวจ DNA" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:8px;font-family:inherit"></label>' +
      '</div>',
    showCancelButton: true, confirmButtonText: '💾 บันทึก', cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#4f46e5',
    preConfirm: function() {
      var empId = document.getElementById('lc_empId').value;
      var outstanding = parseFloat(document.getElementById('lc_outstanding').value);
      var installAmt = parseFloat(document.getElementById('lc_installAmt').value);
      if (!empId) { Swal.showValidationMessage('กรุณาเลือกพนักงาน'); return false; }
      if (!outstanding || outstanding <= 0) { Swal.showValidationMessage('กรุณาใส่ยอดคงค้าง'); return false; }
      if (!installAmt || installAmt <= 0) { Swal.showValidationMessage('กรุณาใส่ยอดหักต่องวด'); return false; }
      var empRec = (_hrEmps||[]).find(function(e){ return String(e.empId) === empId; }) || {};
      return {
        empId: empId, empName: empRec.name || '',
        type: document.getElementById('lc_type').value,
        outstanding: outstanding, originalAmount: outstanding,
        installmentAmt: installAmt,
        payDays: document.getElementById('lc_payDays').value || '1,16',
        reason: document.getElementById('lc_reason').value,
        status: 'active'
      };
    }
  }).then(function(result) {
    if (!result.isConfirmed) return;
    _hrPOST('saveHRLoanContract', result.value).then(function(r) {
      if (r.status === 'ok') {
        Swal.fire({ icon:'success', title:'บันทึกแล้ว', timer:1200, showConfirmButton:false });
        _hrRenderLoanContracts();
      } else {
        Swal.fire({ icon:'error', title:'ผิดพลาด', text: r.message });
      }
    });
  });
}

// ── Record payment ────────────────────────────────────────────────────
function hrLoanContractRecordPayment(loanId) {
  var lc = (_hrLoanContracts||[]).find(function(l){ return l.loanId === loanId; });
  if (!lc) return;
  var today = (function(){
    var d=new Date();
    var be=d.getFullYear()+543;
    var m=String(d.getMonth()+1).padStart(2,'0');
    var dd=String(d.getDate()).padStart(2,'0');
    return dd+'/'+m+'/'+be;
  })();
  Swal.fire({
    title: 'บันทึกการหัก',
    html:
      '<div style="text-align:left;display:flex;flex-direction:column;gap:10px;font-size:.88rem;font-family:\'Sarabun\',sans-serif">' +
      '<div style="background:#f0f4ff;border-radius:8px;padding:10px 12px">' +
        '<div style="font-weight:700">👤 ' + lc.empName + '</div>' +
        '<div style="color:#475569">' + lc.loanId + ' | ยอดค้าง ฿' + _hrFmt(lc.outstanding) + '</div>' +
      '</div>' +
      '<label>ยอดที่หัก (บาท)<br><input id="pay_amt" type="number" value="' + lc.installmentAmt + '" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:8px;font-family:inherit"></label>' +
      '<label>งวดที่ / ป้ายกำกับ<br><input id="pay_period" placeholder="เช่น 01/07/2569 หรือ งวด 1/6" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:8px;font-family:inherit"></label>' +
      '<label>วันที่หัก<br><input id="pay_date" value="' + today + '" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:8px;font-family:inherit"></label>' +
      '<label>หมายเหตุ<br><input id="pay_note" placeholder="(ไม่บังคับ)" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:8px;font-family:inherit"></label>' +
      '</div>',
    showCancelButton: true, confirmButtonText: '💳 บันทึก', cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0f172a',
    preConfirm: function() {
      var amt = parseFloat(document.getElementById('pay_amt').value);
      if (!amt || amt <= 0) { Swal.showValidationMessage('ใส่ยอดที่หัก'); return false; }
      if (amt > lc.outstanding + 0.01) { Swal.showValidationMessage('ยอดหักเกินกว่ายอดค้าง ฿'+_hrFmt(lc.outstanding)); return false; }
      return {
        loanId: loanId, empId: lc.empId, amount: amt,
        periodLabel: document.getElementById('pay_period').value,
        payDate: document.getElementById('pay_date').value,
        note: document.getElementById('pay_note').value,
        recordedBy: (_hrSession && _hrSession.name) || 'HR'
      };
    }
  }).then(function(result) {
    if (!result.isConfirmed) return;
    _hrPOST('recordHRLoanPayment', result.value).then(function(r) {
      if (r.status === 'ok') {
        var msg = r.closed ? '✅ ปิดสัญญาเรียบร้อย ยอดครบ!' : '💳 บันทึกการหักแล้ว\nยอดคงค้าง: ฿' + _hrFmt(r.outstandingAfter);
        Swal.fire({ icon:'success', title:'สำเร็จ', text: msg, timer:2000, showConfirmButton:false });
        _hrRenderLoanContracts();
      } else {
        Swal.fire({ icon:'error', title:'ผิดพลาด', text: r.message });
      }
    });
  });
}

// ── View contract modal (ทั้ง admin + emp) ───────────────────────────
function hrViewLoanContract(loanId) {
  var lc = (_hrLoanContracts||[]).find(function(l){ return l.loanId === loanId; });
  if (!lc) { Swal.fire({icon:'error',title:'ไม่พบสัญญา'}); return; }
  var empPayments = (_hrLoanContractPayments||[]).filter(function(p){ return p.loanId === loanId; });
  var paid = lc.originalAmount - lc.outstanding;
  var pct = lc.originalAmount > 0 ? Math.min(100, Math.round(paid / lc.originalAmount * 100)) : 0;

  // สร้างตารางงวด (คาดการณ์)
  var scheduleRows = '';
  var remaining = lc.outstanding;
  var installAmt = lc.installmentAmt;
  var startDate = new Date();
  // หาวันหักถัดไป
  var payDaysArr = String(lc.payDays||'1,16').split(',').map(function(d){ return parseInt(d)||1; });
  var nextDay = payDaysArr[0];
  var d = new Date(); d.setDate(1);
  // สร้างตาราง forecast
  var periodIdx = 1;
  var maxRows = 24; // max 24 งวด
  while (remaining > 0 && periodIdx <= maxRows) {
    var amt = Math.min(remaining, installAmt);
    remaining = Math.round((remaining - amt) * 100) / 100;
    var matchPay = empPayments.find(function(p){ return p.periodLabel && p.periodLabel.includes && periodIdx === empPayments.indexOf(p)+1; });
    var found = empPayments[periodIdx-1];
    var statusHtml = found
      ? '<span style="background:#d1fae5;color:#065f46;border-radius:99px;padding:1px 8px;font-size:.72rem">✅ จ่ายแล้ว</span>'
      : '<span style="background:#fef3c7;color:#92400e;border-radius:99px;padding:1px 8px;font-size:.72rem">รอจ่าย</span>';
    var periodLabel = found ? (found.periodLabel || 'งวด '+periodIdx) : 'งวด '+periodIdx;
    scheduleRows += '<tr style="' + (remaining===0?'background:#f0fdf4':periodIdx%2?'':'background:var(--bg2)') + '">' +
      '<td style="padding:5px 8px;text-align:center;font-size:.78rem">' + periodIdx + '</td>' +
      '<td style="padding:5px 8px;font-size:.78rem">' + periodLabel + '</td>' +
      '<td style="padding:5px 8px;text-align:right;font-size:.78rem">฿' + _hrFmt(amt) + '</td>' +
      '<td style="padding:5px 8px;text-align:right;font-size:.78rem">฿' + _hrFmt(remaining) + '</td>' +
      '<td style="padding:5px 8px;text-align:center">' + statusHtml + '</td>' +
    '</tr>';
    periodIdx++;
  }

  var html =
    '<div style="text-align:left;font-family:\'Sarabun\',sans-serif;font-size:.85rem;padding:4px 0">' +
    // info grid
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin-bottom:14px;padding:12px;background:var(--bg2);border-radius:10px">' +
      '<div><div style="font-size:.7rem;color:var(--t3)">พนักงาน</div><div style="font-weight:700">' + lc.empName + '</div></div>' +
      '<div><div style="font-size:.7rem;color:var(--t3)">เลขที่สัญญา</div><div style="font-weight:600;font-size:.82rem">' + lc.loanId + '</div></div>' +
      '<div><div style="font-size:.7rem;color:var(--t3)">ยอดเดิม</div><div style="font-weight:700;color:#3730a3">฿' + _hrFmt(lc.originalAmount) + '</div></div>' +
      '<div><div style="font-size:.7rem;color:var(--t3)">ยอดคงค้าง</div><div style="font-weight:700;color:' + (lc.outstanding>0?'#dc2626':'#059669') + '">฿' + _hrFmt(lc.outstanding) + '</div></div>' +
      '<div><div style="font-size:.7rem;color:var(--t3)">หักต่องวด</div><div style="font-weight:600">฿' + _hrFmt(lc.installmentAmt) + '</div></div>' +
      '<div><div style="font-size:.7rem;color:var(--t3)">วันหัก</div><div style="font-weight:600">ทุกวันที่ ' + lc.payDays + '</div></div>' +
    '</div>' +
    '<div style="font-size:.8rem;color:var(--t2);margin-bottom:10px;padding:6px 10px;background:#fffbeb;border-radius:8px">📌 ' + lc.reason + '</div>' +
    // progress
    '<div style="margin-bottom:14px">' +
      '<div style="display:flex;justify-content:space-between;font-size:.75rem;color:var(--t3);margin-bottom:5px">' +
        '<span>จ่ายแล้ว ฿' + _hrFmt(paid) + '</span><span>' + pct + '%</span>' +
      '</div>' +
      '<div style="background:#e2e8f0;border-radius:99px;height:8px;overflow:hidden">' +
        '<div style="height:100%;width:' + pct + '%;background:' + (pct>=100?'#10b981':'#6366f1') + ';border-radius:99px"></div>' +
      '</div>' +
    '</div>' +
    // schedule table
    '<div style="font-size:.8rem;font-weight:700;color:var(--t2);margin-bottom:6px">ตารางการผ่อนชำระ</div>' +
    '<div style="overflow-x:auto;max-height:240px;overflow-y:auto">' +
      '<table style="width:100%;border-collapse:collapse">' +
        '<thead style="position:sticky;top:0;background:var(--bg-card)">' +
          '<tr><th style="padding:5px 8px;font-size:.73rem;color:var(--t3);border-bottom:1px solid var(--bc-input)">งวด</th>' +
          '<th style="padding:5px 8px;font-size:.73rem;color:var(--t3);border-bottom:1px solid var(--bc-input)">งวด/วันที่</th>' +
          '<th style="padding:5px 8px;font-size:.73rem;color:var(--t3);border-bottom:1px solid var(--bc-input);text-align:right">หัก</th>' +
          '<th style="padding:5px 8px;font-size:.73rem;color:var(--t3);border-bottom:1px solid var(--bc-input);text-align:right">คงเหลือ</th>' +
          '<th style="padding:5px 8px;font-size:.73rem;color:var(--t3);border-bottom:1px solid var(--bc-input)">สถานะ</th></tr>' +
        '</thead>' +
        '<tbody>' + scheduleRows + '</tbody>' +
      '</table>' +
    '</div>' +
    '</div>';

  Swal.fire({
    title: '📄 สัญญาเงินกู้',
    html: html,
    width: 560,
    confirmButtonText: '🖨️ พิมพ์สัญญา',
    cancelButtonText: 'ปิด',
    showCancelButton: true,
    confirmButtonColor: '#4f46e5',
  }).then(function(result) {
    if (result.isConfirmed) hrPrintLoanContract(loanId);
  });
}

// ── format date string for contract doc (handles long Date strings + yyyy-MM-dd) ──
function _lcFmtDate(val) {
  if (!val) return '—';
  var s = String(val).trim();
  // yyyy-MM-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    var p = s.split('-');
    var th = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return parseInt(p[2]) + ' ' + th[parseInt(p[1])-1] + ' ' + (parseInt(p[0])+543);
  }
  // dd/MM/yyyy (BE or CE)
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    var p2 = s.split('/');
    var yr = parseInt(p2[2]); if (yr > 2500) yr -= 543;
    var th2 = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return parseInt(p2[0]) + ' ' + th2[parseInt(p2[1])-1] + ' ' + (yr+543);
  }
  // Long Date string (Apps Script / JS)
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    var th3 = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return d.getDate() + ' ' + th3[d.getMonth()] + ' ' + (d.getFullYear()+543);
  }
  return s;
}

// ── Print contract ────────────────────────────────────────────────────
function hrPrintLoanContract(loanId) {
  var lc = (_hrLoanContracts||[]).find(function(l){ return l.loanId === loanId; });
  if (!lc) return;
  var empPayments = (_hrLoanContractPayments||[]).filter(function(p){ return p.loanId === loanId; });
  var _slipCo = {}; try { _slipCo = JSON.parse(localStorage.getItem('ptts_company_cfg')||'{}'); } catch(e){}
  var company = _slipCo.name || localStorage.getItem('ptts_company_name') || 'PTS Smart Factory';

  // สร้างตารางผ่อน
  var schedRows = '';
  var rem = lc.outstanding;
  var inst = lc.installmentAmt;
  var idx = 1;
  while (rem > 0 && idx <= 36) {
    var amt = Math.min(rem, inst);
    rem = Math.round((rem - amt)*100)/100;
    var found = empPayments[idx-1];
    var pl = found ? (found.periodLabel||'งวด '+idx) : 'งวด '+idx;
    var st = found ? '<span style="background:#d1fae5;color:#065f46;border-radius:99px;padding:1px 8px;font-size:.72rem">✅ จ่ายแล้ว</span>'
                   : '<span style="background:#fef3c7;color:#92400e;border-radius:99px;padding:1px 8px;font-size:.72rem">รอจ่าย</span>';
    schedRows += '<tr style="' + (idx%2?'':'background:#f8fafc') + (rem===0?';background:#f0fdf4':'') + '">' +
      '<td style="padding:5px 10px;text-align:center">' + idx + '</td>' +
      '<td style="padding:5px 10px">' + pl + '</td>' +
      '<td style="padding:5px 10px;text-align:right">฿' + _hrFmt(amt) + '</td>' +
      '<td style="padding:5px 10px;text-align:right">฿' + _hrFmt(rem) + '</td>' +
      '<td style="padding:5px 10px;text-align:center">' + st + '</td>' +
    '</tr>';
    idx++;
  }

  var html = '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">' +
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:\'Sarabun\',sans-serif;font-size:14px;color:#1e293b;padding:36px 48px}' +
    'h2{font-size:1.1rem;font-weight:700;text-align:center;margin-bottom:4px}' +
    '.sub{font-size:.82rem;color:#64748b;text-align:center;margin-bottom:20px}' +
    '.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:14px 0}' +
    '.irow .lbl{font-size:.72rem;color:#64748b}.irow .val{font-weight:600;font-size:.9rem}' +
    '.hl{background:#f0f4ff;border:1px solid #c7d2fe;border-radius:10px;padding:12px 16px;margin:14px 0}' +
    '.hl .amount{font-size:1.4rem;font-weight:800;color:#3730a3}' +
    'table{width:100%;border-collapse:collapse;margin-top:8px;font-size:.82rem}' +
    'th{background:#f8fafc;padding:6px 10px;border:1px solid #e2e8f0;font-weight:600;font-size:.75rem;color:#475569}' +
    'td{padding:6px 10px;border:1px solid #e2e8f0}' +
    '.terms{font-size:.78rem;line-height:1.9;color:#475569;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin:14px 0}' +
    '.terms ol{padding-left:18px}' +
    '.sign-row{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:28px}' +
    '.sign-box{text-align:center;border-top:1px solid #334155;padding-top:6px;margin-top:40px}' +
    '.sign-box .nm{font-weight:600;font-size:.85rem}.sign-box .rl{font-size:.72rem;color:#64748b}' +
    '@media print{body{padding:20px 32px}}</style></head><body>' +
    '<h2>สัญญากู้เงิน</h2>' +
    '<div class="sub">' + company + ' &nbsp;|&nbsp; เลขที่: ' + lc.loanId + ' &nbsp;|&nbsp; วันที่: ' + _lcFmtDate(lc.startDate) + '</div>' +
    '<div class="info-grid">' +
      '<div class="irow"><div class="lbl">ชื่อพนักงาน</div><div class="val">' + lc.empName + '</div></div>' +
      '<div class="irow"><div class="lbl">รหัสพนักงาน</div><div class="val">' + lc.empId + '</div></div>' +
      '<div class="irow" style="grid-column:1/-1"><div class="lbl">วัตถุประสงค์</div><div class="val">' + lc.reason + '</div></div>' +
    '</div>' +
    '<div class="hl">' +
      '<div style="font-size:.78rem;color:#6366f1;margin-bottom:4px">ยอดคงค้าง ณ วันทำสัญญา</div>' +
      '<div class="amount">฿' + _hrFmt(lc.outstanding) + '</div>' +
      '<div style="display:flex;gap:24px;margin-top:8px;font-size:.82rem;flex-wrap:wrap">' +
        '<div><span style="color:#6366f1">หักต่องวด</span> <b>฿' + _hrFmt(lc.installmentAmt) + '</b></div>' +
        '<div><span style="color:#6366f1">วันหัก</span> <b>ทุกวันที่ ' + lc.payDays + '</b></div>' +
        '<div><span style="color:#6366f1">เริ่มหัก</span> <b>' + _lcFmtDate(lc.startDate) + '</b></div>' +
      '</div>' +
    '</div>' +
    '<div style="font-size:.82rem;font-weight:700;margin-bottom:6px">ตารางการผ่อนชำระ</div>' +
    '<table><thead><tr><th>งวด</th><th>งวด/วันที่</th><th style="text-align:right">ยอดหัก</th><th style="text-align:right">คงเหลือ</th><th>สถานะ</th></tr></thead>' +
    '<tbody>' + schedRows + '</tbody></table>' +
    '<div class="terms"><ol>' +
      '<li>ผู้กู้ยินยอมให้บริษัทหักเงินเดือนตามตารางข้างต้นทุกงวดโดยอัตโนมัติ</li>' +
      '<li>ยอดหักต่องวดอาจปรับเปลี่ยนได้โดยแจ้งล่วงหน้า ยอดรวมต้องครบตามสัญญา</li>' +
      '<li>หากผู้กู้ลาออกหรือพ้นสภาพพนักงาน ยอดคงค้างทั้งหมดถึงกำหนดชำระทันที</li>' +
      '<li>สัญญาฉบับนี้ทำขึ้น 2 ชุด ผู้กู้และบริษัทเก็บฝ่ายละ 1 ชุด</li>' +
    '</ol></div>' +
    '<div class="sign-row">' +
      '<div class="sign-box"><div class="nm">' + lc.empName + '</div><div class="rl">ผู้กู้</div><div style="font-size:.72rem;color:#94a3b8">วันที่ ......../......../........</div></div>' +
      '<div class="sign-box"><div class="nm">................................................................</div><div class="rl">ผู้อนุมัติ / ' + company + '</div><div style="font-size:.72rem;color:#94a3b8">วันที่ ......../......../........</div></div>' +
    '</div>' +
    '<script>(function(){if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){window.print();});}else{setTimeout(function(){window.print();},700);}})();<\/script>' +
    '</body></html>';

  var win = window.open('','_blank');
  if (!win) { alert('กรุณาอนุญาต popup'); return; }
  win.document.write(html);
  win.document.close();
}

// ── Employee view: สัญญาของฉัน ────────────────────────────────────────
function _hrEmpMyLoansSection() {
  var myLoans = (_hrLoanContracts||[]).filter(function(l){ return l.status==='active'; });
  if (!myLoans.length) return '';

  var cards = myLoans.map(function(lc) {
    var paid = lc.originalAmount - lc.outstanding;
    var pct = lc.originalAmount > 0 ? Math.min(100, Math.round(paid / lc.originalAmount * 100)) : 0;
    var myPays = (_hrLoanContractPayments||[]).filter(function(p){ return p.loanId === lc.loanId; });
    var typeBadge = lc.type === 'advance'
      ? '<span style="background:#e0e7ff;color:#3730a3;border-radius:6px;padding:2px 8px;font-size:.75rem;font-weight:700">เบิก</span>'
      : '<span style="background:#fce7f3;color:#9d174d;border-radius:6px;padding:2px 8px;font-size:.75rem;font-weight:700">กู้</span>';
    // คำนวณงวดที่เหลือ
    var remPeriods = lc.installmentAmt > 0 ? Math.ceil(lc.outstanding / lc.installmentAmt) : '—';

    return '<div style="background:var(--bg-card);border:1px solid var(--bc-card);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        typeBadge +
        '<span style="font-size:.78rem;font-weight:700;color:var(--t2)">' + lc.loanId + '</span>' +
        '<span style="font-size:.75rem;color:var(--t3)">📌 ' + lc.reason + '</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div style="background:linear-gradient(135deg,#fee2e2,#fecaca);border-radius:10px;padding:10px 12px">' +
          '<div style="font-size:.7rem;color:#9b1c1c">ยอดคงค้าง</div>' +
          '<div style="font-size:1.2rem;font-weight:800;color:#dc2626">฿' + _hrFmt(lc.outstanding) + '</div>' +
        '</div>' +
        '<div style="background:linear-gradient(135deg,#dbeafe,#bfdbfe);border-radius:10px;padding:10px 12px">' +
          '<div style="font-size:.7rem;color:#1e40af">หักต่องวด</div>' +
          '<div style="font-size:1.2rem;font-weight:800;color:#1d4ed8">฿' + _hrFmt(lc.installmentAmt) + '</div>' +
          '<div style="font-size:.68rem;color:#3b82f6;margin-top:1px">วันที่ ' + lc.payDays + ' | เหลือ ~' + remPeriods + ' งวด</div>' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<div style="display:flex;justify-content:space-between;font-size:.73rem;color:var(--t3);margin-bottom:4px">' +
          '<span>ผ่อนไปแล้ว ' + pct + '%</span>' +
          '<span>' + myPays.length + ' งวด จากทั้งหมด</span>' +
        '</div>' +
        '<div style="background:var(--bc-card);border-radius:99px;height:7px;overflow:hidden">' +
          '<div style="height:100%;width:' + pct + '%;background:' + (pct>=100?'#10b981':'#6366f1') + ';border-radius:99px"></div>' +
        '</div>' +
      '</div>' +
      '<button onclick="hrViewLoanContract(\'' + lc.loanId + '\')" style="width:100%;background:var(--bg2);color:var(--t2);border:1px solid var(--bc-input);border-radius:8px;padding:7px 10px;cursor:pointer;font-family:\'Sarabun\',sans-serif;font-size:.84rem">📄 ดูสัญญา + ตารางผ่อน</button>' +
    '</div>';
  }).join('');

  return '<div style="margin-bottom:20px">' +
    '<div style="font-size:.95rem;font-weight:700;color:var(--t1);margin-bottom:10px;display:flex;align-items:center;gap:6px">' +
      '<span style="background:#fce7f3;color:#9d174d;border-radius:8px;padding:3px 10px;font-size:.82rem">📋 สัญญาเงินกู้ของฉัน</span>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">' + cards + '</div>' +
    '<hr style="border:none;border-top:1px solid var(--bc-input);margin:16px 0">' +
  '</div>';
}

