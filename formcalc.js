// ── MAT Data ─────────────────────────────────────────
const MAT_FLAP = ['f_matTop','f_matBot'];
const MAT_MESH = ['f_meshOut','f_meshIn'];
let matPriceMap = {};
let matNameMap  = {};   // code → ชื่อรายการ
let specMatData  = {};
// sync local spec mat into specMatData on declaration
_localSpecMat.forEach(r => { specMatData[r.code] = {w:+r.w, l:+r.l}; });

function fillSelect(id, items) {
  const sel = $(id);
  const prev = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  items.forEach(m => {
    const code = typeof m === 'object' ? m.code : m;
    const name = typeof m === 'object' && m.name ? m.name : (matNameMap[code] || '');
    const opt = document.createElement('option');
    opt.value = opt.textContent = code;  // form ภายในใช้รหัส
    sel.appendChild(opt);
  });
  const codes = items.map(m => typeof m === 'object' ? m.code : m);
  if (prev && codes.includes(prev)) sel.value = prev;
}

// ── Seed dropdowns from local MAT on startup ──────────
(function(){
  if (_localMatFlap.length) { MAT_FLAP.forEach(id => fillSelect(id, _localMatFlap)); fillSelect('f_matOd2', _localMatFlap); _syncMatToMaps(); }
  if (_localMatMesh.length) { MAT_MESH.forEach(id => fillSelect(id, _localMatMesh)); _syncMatToMaps(); }
})();

// ── LOAD ALL DATA ────────────────────────────────────
function setDbStatus(state, msg) {
  const el = $('dbStatus');
  if (!el) return;
  const styles = {
    loading: 'background:rgba(251,191,36,.4);color:#fef08a;border-color:rgba(251,191,36,.9)',
    ok:      'background:#4ade80;color:#052e16;border-color:#16a34a',
    error:   'background:rgba(239,68,68,.4);color:#fecaca;border-color:rgba(239,68,68,.9)',
    idle:    'background:rgba(100,116,139,.4);color:#e2e8f0;border-color:rgba(255,255,255,.4)',
  };
  el.style.cssText += ';' + (styles[state] || styles.idle);
  el.textContent = msg;
  // sync header chip
  const chip = $('phConnChip');
  if (chip) {
    if (state === 'ok') {
      chip.style.display = '';
      chip.textContent = '✓ Online';
      chip.style.cssText = 'font-size:.68rem;font-weight:700;padding:3px 10px;border-radius:999px;background:#4ade80;border:1px solid #16a34a;color:#052e16;letter-spacing:.3px';
    } else if (state === 'error') {
      chip.style.display = '';
      chip.textContent = '⚠ Offline';
      chip.style.cssText = 'font-size:.68rem;font-weight:700;padding:3px 10px;border-radius:999px;background:rgba(239,68,68,.4);border:1px solid rgba(239,68,68,.95);color:#fecaca;letter-spacing:.3px';
    } else {
      chip.style.display = 'none';
    }
  }
}

async function loadAllData(showResult) {
  if (!SCRIPT_URL) {
    setDbStatus('idle', '⬤ ยังไม่ตั้งค่า URL');
    return;
  }
  setDbStatus('loading', '↻ กำลังโหลด…');

  const base = SCRIPT_URL;
  const fetchJSON = (action) =>
    fetch(base + '?action=' + action, {mode:'cors'})
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });

  try {
    const [matData, specData, workData, contactData, nextNoData, moldDataRes, laborData, draftsData] = await Promise.all([
      fetchJSON('getMAT'),
      fetchJSON('getSpecMat'),
      fetchJSON('getWorkTypes'),
      fetchJSON('getContacts'),
      fetchJSON('getNextNo'),
      fetchJSON('getModl'),
      fetchJSON('getLaborConfig'),
      fetchJSON('getDrafts'),
    ]);

    // MAT — server เป็นข้อมูลหลักเสมอ (sync ข้ามเครื่อง) คงค่า w/l เดิมไว้ถ้ามี
    if (matData.status === 'ok') {
      const seedMat = (serverItems, type) => {
        if (!Array.isArray(serverItems)) return;
        const oldArr = _getMatArr(type);
        const oldMap = new Map(oldArr.map(x => [x.code, x]));
        const newArr = serverItems.map(m => {
          const old  = oldMap.get(m.code);
          const spec = specMatData[m.code] || {};
          return {
            code: m.code,
            name: m.name || '',
            price: +m.price || 0,
            priceBuy: +m.priceBuy || 0,
            // ขนาดแผ่น: ใช้ค่าจาก Sheet (คอลัมน์ G/H) เป็นหลัก เพื่อให้ตรงกันทุกเครื่อง
            w: (+m.w || 0) || old?.w || spec.w || 1219,
            l: (+m.l || 0) || old?.l || spec.l || 2438,
            unit: 'มิล',
          };
        });
        const arr = _getMatArr(type);
        arr.length = 0;
        newArr.forEach(x => arr.push(x));
        _saveLocalMat(type);
        _getMatSel(type).forEach(id => fillSelect(id, arr));
        arr.forEach(m => { matPriceMap[m.code] = +m.price||0; if(m.name) matNameMap[m.code] = m.name; });
      };
      seedMat(matData.matFlap, 'flap');
      seedMat(matData.matMesh, 'mesh');
    }
    // Spec Mat — use server data only if no local override saved by user
    if (specData.status === 'ok') {
      if (!localStorage.getItem('ptts_spec_mat')) {
        specMatData = specData.specs || {};
        _localSpecMat = Object.entries(specMatData).map(([code,v])=>({code, w:+v.w||0, l:+v.l||0, unit:'มิล'}));
        renderSpecMatTable();
      }
    }
    // Work Types
    if (workData.status === 'ok' && Array.isArray(workData.types)) {
      const wSel = $('f_workType'), wDl = $('workTypeList'), wPrev = wSel ? wSel.value : '';
      if (wSel && wDl) {
        wDl.innerHTML = '';
        workData.types.forEach(t => {
          const o = document.createElement('option');
          o.value = t; wDl.appendChild(o);
        });
        if (wPrev) wSel.value = wPrev;
      }
    }
    // Contacts
    if (contactData.status === 'ok' && Array.isArray(contactData.contacts)) {
      const cSel = $('f_contact'), cPrev = cSel ? cSel.value : '';
      if (cSel) {
        cSel.innerHTML = '<option value="">— เลือกผู้ติดต่อ —</option>';
        contactData.contacts.forEach(c => {
          const o = document.createElement('option');
          o.value = c.name;
          o.textContent = c.company ? c.name + ' (' + c.company + ')' : c.name;
          cSel.appendChild(o);
        });
        if (cPrev) cSel.value = cPrev;
      }
    }
    // Next No
    if (nextNoData.status === 'ok' && nextNoData.nextNo) {
      $('f_noQuo').value = nextNoData.nextNo;
    }

    // Mold data
    if (moldDataRes && moldDataRes.status === 'ok' && Array.isArray(moldDataRes.molds)) {
      _moldData = moldDataRes.molds;
    }

    // Labor config (อัตราค่าแรง + กระบวนการผลิต) — sync ทุกเครื่องจาก Sheet
    if (laborData && laborData.status === 'ok' && laborData.config) {
      const cfg = laborData.config;
      if (Array.isArray(cfg.processes) && cfg.processes.length) {
        _laborProcs = cfg.processes;
        localStorage.setItem('ptts_labor_processes', JSON.stringify(cfg.processes));
      }
      if (cfg.ratePerMin)  localStorage.setItem('ptts_labor_rate_min', cfg.ratePerMin);
      if (cfg.ratePerDay)  localStorage.setItem('ptts_labor_rate_day', cfg.ratePerDay);
      if (cfg.hoursPerDay) localStorage.setItem('ptts_labor_hours_per_day', cfg.hoursPerDay);
      if (cfg.ratePerMin && cfg.hoursPerDay) {
        localStorage.setItem('ptts_labor_rate_hour', (cfg.ratePerMin * 60).toFixed(2));
      }
      if (typeof renderProcTable === 'function' && $('proc_tbody')) renderProcTable();
      if (typeof calcLaborByProcess === 'function') calcLaborByProcess();
    }

    // แบบร่าง (Drafts) — sync ทุกเครื่องจาก Sheet (server เป็นข้อมูลหลัก)
    if (draftsData && draftsData.status === 'ok' && Array.isArray(draftsData.drafts)) {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(draftsData.drafts));
      _updateDraftBadge();
    }

    setDbStatus('ok', '✓ เชื่อมต่อแล้ว');
    if (showResult) {
      Swal.fire({icon:'success',title:'โหลดข้อมูลสำเร็จ ✅',
        background:'#0a1c2e',color:'#f1f5f9',timer:1500,showConfirmButton:false,
        toast:true,position:'top-end'});
    }
    // โหลด history (DATA rows) ในพื้นหลังเพื่อให้ Pricing Insight ทำงานได้ทันที
    // ไม่ต้องรอให้ผู้ใช้ไปแท็บ DATA ก่อน
    dtRefresh(false).catch(() => {});
  } catch(err) {
    setDbStatus('error', '✗ ' + (err.message||'โหลดไม่สำเร็จ'));
    const errMsg = err.message || String(err);
    const isCors = errMsg.includes('CORS') || errMsg.includes('fetch') || errMsg.includes('Failed');
    const isUrl  = !SCRIPT_URL || SCRIPT_URL.length < 10;
    Swal.fire({
      icon:'error', title:'โหลดฐานข้อมูลไม่ได้ ❌',
      html: '<div style="font-size:.82rem;color:#94a3b8;line-height:2;text-align:left">'
        + (isUrl ? '<b style="color:#f87171">⚠️ ยังไม่ได้ตั้งค่า Script URL</b><br>' : '')
        + (isCors ? '<b style="color:#fbbf24">⚠️ CORS Error — ต้อง Deploy ใหม่</b><br>' : '')
        + '• ไปที่ Apps Script → <b>Deploy → Manage deployments</b><br>'
        + '• กด ✏️ แก้ไข → Version: <b>New version</b> → Deploy<br>'
        + '• ตรวจสอบว่าเลือก <b>Anyone</b> (ไม่ใช่ Only myself)<br>'
        + '<div style="margin-top:8px;padding:7px 10px;background:rgba(0,0,0,.3);border-radius:6px;'
        + 'font-family:monospace;font-size:.75rem;color:#64748b;word-break:break-all">'
        + errMsg.slice(0,120) + '</div></div>',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#1d65cc',
      confirmButtonText:'🔄 ลองใหม่',
      showCancelButton:true, cancelButtonText:'ปิด', cancelButtonColor:'#374151'
    }).then(r => { if (r.isConfirmed) loadAllData(true); });
  }
}

// legacy wrappers (backward compat)
function loadMatOptions(s) {}
function loadSpecMat()    {}
function loadWorkTypes(s) {}
function loadContacts(s)  {}
function loadNextNo()     {}

function loadMatOptions(silent) {
  if (!SCRIPT_URL) return;
  fetch(SCRIPT_URL + '?action=getMAT', {mode:'cors'})
    .then(r => r.json())
    .then(data => {
      if (data.status === 'ok') {
        if (Array.isArray(data.matFlap)) {
          const arr = _getMatArr('flap');
          const localCodes = new Set(arr.map(x=>x.code));
          let changed = false;
          data.matFlap.forEach(m => {
            if (!localCodes.has(m.code)) { arr.push({code:m.code,price:+m.price||0,w:1219,l:2438,unit:'มิล'}); changed=true; }
          });
          if (changed) _saveLocalMat('flap');
          else { MAT_FLAP.forEach(id => fillSelect(id, arr)); arr.forEach(m => { matPriceMap[m.code]=+m.price||0; }); }
        }
        if (Array.isArray(data.matMesh)) {
          const arr = _getMatArr('mesh');
          const localCodes = new Set(arr.map(x=>x.code));
          let changed = false;
          data.matMesh.forEach(m => {
            if (!localCodes.has(m.code)) { arr.push({code:m.code,price:+m.price||0,w:1219,l:2438,unit:'มิล'}); changed=true; }
          });
          if (changed) _saveLocalMat('mesh');
          else { MAT_MESH.forEach(id => fillSelect(id, arr)); arr.forEach(m => { matPriceMap[m.code]=+m.price||0; }); }
        }
        if (!silent) Swal.fire({icon:'success',title:'โหลด MAT แล้ว ✅',background:'#0a1c2e',color:'#f1f5f9',timer:1200,showConfirmButton:false,toast:true,position:'top-end'});
      } else {
        if (!silent) Swal.fire({icon:'warning',title:'MAT ว่างเปล่า',text:data.message||'ไม่พบข้อมูลใน tab MAT',background:'#0a1c2e',color:'#f1f5f9'});
      }
    })
    .catch(() => {
      if (!silent) Swal.fire({icon:'error',title:'โหลด MAT ไม่ได้',text:'ตรวจสอบ URL หรือ Deploy ใหม่',background:'#0a1c2e',color:'#f1f5f9'});
    });
}



let _contactsData = [];
function loadContacts(silent) {
  if (!SCRIPT_URL) return;
  fetch(SCRIPT_URL + '?action=getContacts', {mode:'cors'})
    .then(r => r.json())
    .then(data => {
      if (data.status === 'ok' && Array.isArray(data.contacts)) {
        _contactsData = data.contacts;
        const sel  = $('f_contact');
        const prev = sel.value;
        sel.innerHTML = '<option value="">— เลือกผู้ติดต่อ —</option>';
        data.contacts.forEach(c => {
          const opt = document.createElement('option');
          opt.value       = c.name;
          opt.textContent = c.company ? c.name + ' (' + c.company + ')' : c.name;
          sel.appendChild(opt);
        });
        if (prev) sel.value = prev;
      }
    })
    .catch(() => {});
}

function loadWorkTypes(silent) {
  if (!SCRIPT_URL) return;
  fetch(SCRIPT_URL + '?action=getWorkTypes', {mode:'cors'})
    .then(r => r.json())
    .then(data => {
      if (data.status === 'ok' && Array.isArray(data.types)) {
        const sel = $('f_workType');
        const dl  = $('workTypeList');
        const prev = sel.value;
        dl.innerHTML = '';
        data.types.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t;
          dl.appendChild(opt);
        });
        if (prev) sel.value = prev;
      }
    })
    .catch(() => {});
}

function loadSpecMat() {
  if (!SCRIPT_URL) return;
  fetch(SCRIPT_URL + '?action=getSpecMat', {mode:'cors'})
    .then(r => r.json())
    .then(data => { if (data.status === 'ok') specMatData = data.specs || {}; })
    .catch(() => {});
}

function loadNextNo() {
  if (!SCRIPT_URL) return;
  fetch(SCRIPT_URL + '?action=getNextNo', {mode:'cors'})
    .then(r => r.json())
    .then(data => {
      if (data.status === 'ok' && data.nextNo) {
        $('f_noQuo').value = data.nextNo;
      }
    })
    .catch(() => {});
}

// ── CORE CALCULATION ENGINE ──────────────────────────
let _flipStates = [false, false, false, false]; // user-toggled per card

// ── Part Formula Config (drives runCalc) ───────────────────────────
const _DEFAULT_PART_FORMULAS = [
  { name:'ฝาบน',       cw:'od+50', cl:'od+50',       noFlip:false },
  { name:'ฝาล่าง',     cw:'od+50', cl:'od+50',       noFlip:false },
  { name:'ตะแกรงนอก', cw:'h',     cl:'od*pi+50',    noFlip:true  },
  { name:'ตะแกรงใน',  cw:'h',     cl:'(custgap>0?od-custgap*2:id+5)*pi+50',noFlip:true  },
];
let _partFormulas = _DEFAULT_PART_FORMULAS.map(f=>({...f}));
(function(){
  try {
    const s = localStorage.getItem('ptts_part_formulas');
    if (s) {
      const p = JSON.parse(s);
      if (Array.isArray(p) && p.length === 4) {
        _partFormulas = p;
        // migrate: อัพเกรดสูตรตะแกรงในเก่าที่ไม่มี custgap
        if (_partFormulas[3] && _partFormulas[3].cl === '(id+5)*pi+50') {
          _partFormulas[3].cl = '(custgap>0?od-custgap*2:id+5)*pi+50';
          localStorage.setItem('ptts_part_formulas', JSON.stringify(_partFormulas));
        }
      } else localStorage.removeItem('ptts_part_formulas');
    }
  } catch(e){ localStorage.removeItem('ptts_part_formulas'); }
})();

// ── เครื่องมือคำนวณขนาดตัด/เลย์เอาต์ (ใช้ร่วมกันโดย runCalc และการพิมพ์ Report จาก Order) ──
// แยกออกมาเพื่อให้สามารถคำนวณจากข้อมูลที่บันทึกไว้ (DATA/Order) ได้ โดยไม่ต้องพึ่งค่าจากฟอร์มที่เปิดอยู่
function _computeCutParts(od, id_, h, unit, matCodes, custgap, flips) {
  if (!od || !h) return null;
  custgap = custgap || 0;
  flips = flips || [false, false, false, false];

  const DEF = specMatData['4 X 8 ฟุต(ปรกติ)'] || {w:1219, l:2438};

  function getSheet(code) {
    if (!code) return DEF;
    return specMatData[code] || DEF;
  }

  function bestPieces(sw, sl, cw, cl, userFlipped) {
    if (!cw || !cl) return {pieces:0, flipped:false, cols:0, rows:0, altPieces:0};
    const n = Math.floor(sw/cw) * Math.floor(sl/cl);   // normal orientation
    const f = Math.floor(sl/cw) * Math.floor(sw/cl);   // flipped orientation
    if (userFlipped) {
      return { pieces:f, flipped:true,
        cols:Math.floor(sw/cl), rows:Math.floor(sl/cw), altPieces:n };
    }
    return { pieces:n, flipped:false,
      cols:Math.floor(sl/cl), rows:Math.floor(sw/cw), altPieces:f };
  }

  function makeCard(partName, matCode, sheetFn, cw, cl, userFlipped) {
    const price = matPriceMap[matCode] || 0;
    const sh    = sheetFn(matCode);
    const r     = bestPieces(sh.w, sh.l, cw, cl, userFlipped);
    const ppc   = r.pieces > 0 ? price / r.pieces : 0;
    return {partName, matCode, price, sh, cw, cl, ...r, ppc, totalJob: ppc * unit};
  }

  const _ef = expr => { try { return new Function('od','id','h','unit','pi','sqrt','pow','custgap',
    '"use strict";return('+expr+')')(od,id_,h,unit,Math.PI,Math.sqrt,Math.pow,custgap)||0; } catch(e){return 0;} };
  const pf = _partFormulas;
  return [
    makeCard('ฝาบน',        matCodes[0], () => DEF,      _ef(pf[0].cw), _ef(pf[0].cl), flips[0]),
    makeCard('ฝาล่าง',      matCodes[1], () => DEF,      _ef(pf[1].cw), _ef(pf[1].cl), flips[1]),
    makeCard('ตะแกรงนอก',   matCodes[2], getSheet,       _ef(pf[2].cw), _ef(pf[2].cl), flips[2]),
    makeCard('ตะแกรงใน',    matCodes[3], getSheet,       _ef(pf[3].cw), _ef(pf[3].cl), flips[3]),
  ];
}

function runCalc() {
  const od   = num('f_od');
  const id_  = num('f_id');
  const h    = num('f_h');
  const unit = num('f_unit') || 1;
  const custgap = num('f_custGap') || 0;
  const matCodes = [$('f_matTop').value, $('f_matBot').value, $('f_meshOut').value, $('f_meshIn').value];
  return _computeCutParts(od, id_, h, unit, matCodes, custgap, _flipStates);
}

// ── AUTO CALC + FILL (reactive) ──────────────────────
// ── Mesh fit validation ────────────────────────────────────────────
let _meshFitAlertShown = false; // debounce: ไม่ spam popup
function _checkMeshFit(res) {
  if (!res) return;
  // res[2]=ตะแกรงนอก, res[3]=ตะแกรงใน
  [2, 3].forEach(ci => {
    const r = res[ci];
    if (!r || !r.matCode) return;                  // ยังไม่เลือก MAT
    if (r.pieces > 0) { _meshFitAlertShown = false; return; } // ตัดได้ปกติ
    if (_meshFitAlertShown) return;                // ป้องกัน popup ซ้ำ

    const partName = ci === 2 ? 'ตะแกรงนอก' : 'ตะแกรงใน';
    const fid      = ci === 2 ? 'f_meshOut' : 'f_meshIn';
    const canFlip  = r.altPieces > 0;             // flip แล้วตัดได้
    _meshFitAlertShown = true;

    if (canFlip && !_flipStates[ci]) {
      // เสนอให้สลับ
      Swal.fire({
        icon: 'question',
        title: `⟳ สลับทิศทาง${partName}?`,
        html: `ขนาดตัด <b>${r.cw.toFixed(0)}×${r.cl.toFixed(0)} mm</b> ไม่พอดีกับแผ่น <b>${r.matCode}</b><br>
               แต่ถ้า<b>สลับทิศทาง</b>จะได้ <b style="color:#34d399">${r.altPieces} ชิ้น/แผ่น</b><br>
               <span style="font-size:.78rem;color:#8b8aaa">สลับ${partName}เลยไหม?</span>`,
        background:'#0d1b2a', color:'#cce4ff',
        showCancelButton: true,
        confirmButtonText: `⟳ สลับ${partName}เลย`,
        cancelButtonText: '🔄 เปลี่ยน MAT ใหม่',
        confirmButtonColor: '#1d65cc',
        cancelButtonColor: '#6b7280',
      }).then(result => {
        if (result.isConfirmed) {
          _flipStates[ci] = true;
          _meshFitAlertShown = false;
          autoCalcFill(); refreshCalcTab();
        } else {
          // บังคับเปลี่ยน MAT: ล้างค่าและโฟกัส
          const sel = $(fid);
          if (sel) { sel.value = ''; sel.dispatchEvent(new Event('change')); }
          autoCalcFill(); refreshCalcTab();
          Swal.fire({
            icon:'info', title:'เปลี่ยน MAT ใหม่',
            html:`กรุณาเลือก <b>${partName}</b> ที่มีขนาดแผ่น ≥ <b>${Math.max(r.cw,r.cl).toFixed(0)} mm</b>`,
            background:'#0d1b2a', color:'#cce4ff',
            confirmButtonColor:'#1d65cc', timer:4000, timerProgressBar:true
          });
          _meshFitAlertShown = false;
        }
      });
    } else if (!canFlip) {
      // ทั้งสองทิศก็ไม่พอ
      Swal.fire({
        icon:'error', title:'❌ แผ่นเล็กเกินไป',
        html:`ขนาดตัด <b>${r.cw.toFixed(0)}×${r.cl.toFixed(0)} mm</b> ไม่พอดีกับแผ่น <b>${r.matCode}</b><br>
              แม้สลับทิศทางก็ตัดไม่ได้<br>
              <span style="font-size:.8rem;color:#8b8aaa">กรุณาเลือก ${partName} ที่ใหญ่กว่านี้</span>`,
        background:'#0d1b2a', color:'#cce4ff',
        confirmButtonColor:'#dc2626'
      }).then(() => {
        const sel = $(fid);
        if (sel) { sel.value = ''; sel.dispatchEvent(new Event('change')); }
        autoCalcFill(); refreshCalcTab();
        _meshFitAlertShown = false;
      });
    }
  });
}

function autoRawMat() {
  const wt = ($('f_workType') ? $('f_workType').value : '').toUpperCase();
  let mat = 'เหล็ก'; // default
  if (/SUS/.test(wt))       mat = 'แสตนเลส';
  else if (/ALU/.test(wt))  mat = 'อะลูมิเนียม';
  else if (/พลาสติก/.test($('f_workType')?.value || '')) mat = 'พลาสติก';
  else if (/ยาง/.test($('f_workType')?.value || ''))     mat = 'ยาง';

  const el = $('f_rawMat');
  if (el && !el._userEdited) el.value = mat;

  // auto-select ขัดเงา ถ้าวัตถุดิบเป็น SUS
  const plating = $('f_plating');
  if (plating && !plating._userEdited) {
    plating.value = mat === 'แสตนเลส' ? 'ขัดเงา' : 'ชุปซิงค์เงิน';
  }
}

function autoCalcFill() {
  const res = runCalc();
  if (!res) return;
  autoRawMat();

  // Mesh fit check (H vs MAT)
  _checkMeshFit(res);

  // Auto-fill cost fields
  const costIds  = ['f_costTop','f_costBot','f_cMeshOut','f_cMeshIn'];
  const matCodes = ['f_matTop','f_matBot','f_meshOut','f_meshIn'];
  res.forEach((r,i) => {
    const selected = $(matCodes[i])?.value || '';
    if (selected === 'ไม่มี' || selected === '') {
      $(costIds[i]).value = '0.00';   // ไม่มีวัสดุ → cost = 0
    } else if (r.ppc > 0) {
      $(costIds[i]).value = r.ppc.toFixed(2);
    }
  });
  // ค่าแรงอัตโนมัติ
  calcLaborByProcess();
  // เทสเสีย = 15% of material costs
  const matSum = res.reduce((s,r) => s + r.ppc, 0);
  $('f_cTestWaste').value = (matSum * 0.15).toFixed(2);
  calcAll();

  // Update Tab 2 if visible
  if ($('tab-calc').classList.contains('active')) {
    renderCalcTab(res);
  }
}

// ── TAB 2 RENDER ─────────────────────────────────────
function refreshCalcTab() {
  const res = runCalc();
  renderCalcTab(res);
}

// compact version สำหรับ print report (A4)
function buildGridVizSmall(sw, sl, cols, rows) {
  const longH = sl >= sw, dW = longH ? sl : sw, dH = longH ? sw : sl;
  const dCols = longH ? cols : rows, dRows = longH ? rows : cols;
  const PT = 13, PL = 22, PR = 5, PB = 5;
  const maxW = 180, maxH = 68;
  const scale = Math.min(maxW / dW, maxH / dH);
  const W = dW * scale, H = dH * scale;
  const cellW = W / dCols, cellH = H / dRows;
  const vW = W + PL + PR, vH = H + PT + PB;
  let cells = '';
  for (let r = 0; r < dRows; r++)
    for (let c = 0; c < dCols; c++)
      cells += `<rect x="${(PL+c*cellW).toFixed(1)}" y="${(PT+r*cellH).toFixed(1)}"
        width="${(cellW-.8).toFixed(1)}" height="${(cellH-.8).toFixed(1)}"
        fill="rgba(0,0,0,.06)" stroke="#888" stroke-width=".5"/>`;
  return `<svg viewBox="0 0 ${vW.toFixed(0)} ${vH.toFixed(0)}" style="width:100%;max-width:180px;display:block;margin:0 auto">
    <rect x="${PL}" y="${PT}" width="${W.toFixed(1)}" height="${H.toFixed(1)}"
      fill="#f9f9f9" stroke="#999" stroke-width="1"/>
    ${cells}
    <text x="${(PL+W/2).toFixed(0)}" y="${(PT-3).toFixed(0)}"
      text-anchor="middle" font-size="8" fill="#666">${dCols} แถว</text>
    <text x="${(PL-3).toFixed(0)}" y="${(PT+H/2+3).toFixed(0)}"
      text-anchor="end" font-size="8" fill="#666">${dRows} แถว</text>
  </svg>`;
}

function buildGridViz(sw, sl, cols, rows) {
  // แสดงแนวนอน (landscape) เสมอ — ด้านยาวอยู่แนวนอน
  const longH = sl >= sw, dW = longH ? sl : sw, dH = longH ? sw : sl;
  const dCols = longH ? cols : rows, dRows = longH ? rows : cols;
  const PT = 18, PL = 30, PR = 8, PB = 8;
  const maxW = 270, maxH = 110;
  const scale = Math.min(maxW / dW, maxH / dH);
  const W = dW * scale, H = dH * scale;
  const cellW = W / dCols, cellH = H / dRows;
  const vW = W + PL + PR, vH = H + PT + PB;
  let cells = '';
  for (let r = 0; r < dRows; r++)
    for (let c = 0; c < dCols; c++)
      cells += `<rect x="${(PL+c*cellW).toFixed(1)}" y="${(PT+r*cellH).toFixed(1)}"
        width="${(cellW-.8).toFixed(1)}" height="${(cellH-.8).toFixed(1)}"
        fill="rgba(74,222,128,.12)" stroke="rgba(74,222,128,.5)" stroke-width=".6"/>`;
  return `<svg viewBox="0 0 ${vW.toFixed(0)} ${vH.toFixed(0)}" class="cp-grid-svg" style="width:100%;max-width:320px">
    <rect x="${PL}" y="${PT}" width="${W.toFixed(1)}" height="${H.toFixed(1)}"
      fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
    ${cells}
    <text x="${(PL+W/2).toFixed(0)}" y="${(PT-5).toFixed(0)}"
      text-anchor="middle" font-size="9" fill="#94a3b8">${dCols} แถว</text>
    <text x="${(PL-4).toFixed(0)}" y="${(PT+H/2+3).toFixed(0)}"
      text-anchor="end" font-size="9" fill="#94a3b8">${dRows} แถว</text>
  </svg>`;
}

function renderCalcTab(res) {
  const od   = num('f_od');
  const id_  = num('f_id');
  const h    = num('f_h');
  const unit = num('f_unit') || 1;

  // Dim bar
  $('dimBar').innerHTML = [
    `<div class="dim-chip">OD <strong>${od||'?'}</strong></div>`,
    `<div class="dim-chip">ID <strong>${id_||'?'}</strong></div>`,
    `<div class="dim-chip">H <strong>${h||'?'}</strong></div>`,
    `<div class="dim-chip">Unit <strong>${unit}</strong></div>`,
  ].join('');

  if (!od || !h) {
    $('dimHint').style.display = 'block';
    $('dimHint').textContent = '⬆️ กรอก OD, H ในแทบ Break Down เพื่อเริ่มคำนวณ';
    ['cp_top','cp_bot','cp_meshOut','cp_meshIn'].forEach(id => {
      $(id).innerHTML = '<div style="color:#64748b;font-size:.82rem;padding:10px">—</div>';
    });
    return;
  }
  $('dimHint').style.display = 'none';

  if (!res) return;
  const cardIds = ['cp_top','cp_bot','cp_meshOut','cp_meshIn'];
  res.forEach((r, i) => {
    const sw = r.flipped ? r.sh.l : r.sh.w;
    const sl = r.flipped ? r.sh.w : r.sh.l;
    const hasPrice = r.price > 0;
    const cardEl = $(cardIds[i]);
    cardEl.className = 'cp-card' + (r.pieces > 0 && hasPrice ? ' ready' : '');
    cardEl.innerHTML = `
      <div class="cp-header">
        <span class="cp-name">${r.partName}</span>
        ${r.matCode ? `<span class="cp-badge">${r.matCode}</span>` : ''}
      </div>
      <div class="cp-select">
        <select style="background:rgba(15,23,42,.8);border:1px solid rgba(255,255,255,.12);
          border-radius:8px;padding:9px 12px;color:#f1f5f9;font-family:Sarabun,sans-serif;
          font-size:.88rem;width:100%;outline:none;"
          onchange="syncMat(${i},this.value)"
          id="cp_sel_${i}">
        </select>
      </div>
      ${r.pieces > 0 ? `
      <div class="cp-results">
        <div class="cp-stat">
          <div class="cp-stat-lbl">ราคา/แผ่น</div>
          <div class="cp-stat-val ${hasPrice?'':'cp-empty'}">${hasPrice ? fmt(r.price) : 'ไม่มีราคา'}</div>
        </div>
        <div class="cp-stat">
          <div class="cp-stat-lbl">ขนาดแผ่น (มม.)</div>
          <div class="cp-stat-val">${sw}×${sl}</div>
        </div>
        <div class="cp-stat">
          <div class="cp-stat-lbl">ขนาดตัด (มม.)</div>
          <div class="cp-stat-val">${r.cw.toFixed(0)}×${r.cl.toFixed(0)}</div>
        </div>
        <div class="cp-stat">
          <div class="cp-stat-lbl">ชิ้น/แผ่น (${r.rows}×${r.cols})</div>
          <div class="cp-stat-val green">${r.pieces} ชิ้น</div>
        </div>
        <div class="cp-stat">
          <div class="cp-stat-lbl">ราคา/ชิ้น → ใส่ฟอร์มอัตโนมัติ</div>
          <div class="cp-stat-val yellow">${fmt(r.ppc)}</div>
        </div>
        <div class="cp-stat">
          <div class="cp-stat-lbl">รวม ×${unit} ชิ้น</div>
          <div class="cp-stat-val green">${fmt(r.totalJob)}</div>
        </div>
      </div>
      <div class="cp-grid-summary">
        <span>ตารางกริดปกติ: กว้างฟิต <strong>${r.rows} แถว</strong> × ยาวฟิต <strong>${r.cols} แถว</strong> = <strong style="color:#4ade80">${r.pieces} ตัว/แผ่น</strong></span>
        <span>ใช้แผ่นทั้งหมด: <strong style="color:#facc15">${r.pieces>0 ? Math.ceil(unit/r.pieces) : '-'} แผ่น</strong></span>
        <span style="margin-left:auto">Utilization: <strong style="color:#4ade80">${((r.cw*r.cl*r.pieces)/(sw*sl)*100).toFixed(1)}%</strong></span>
      </div>
      ${r.rows>0 && r.cols>0 ? buildGridViz(sw, sl, r.cols, r.rows) : ''}
      ${(()=>{
        const nf = _partFormulas[i] && _partFormulas[i].noFlip;
        if (r.flipped) return `<button class="cp-flip-btn cp-flip-on" onclick="toggleFlip(${i})">↩ กลับทิศเดิม (${r.altPieces} ชิ้น)</button>`;
        if (r.altPieces > r.pieces) return nf
          ? `<div class="cp-flip-info">⟳ สลับทิศทาง — ได้ ${r.altPieces} ชิ้น/แผ่น (ล็อกทิศทาง)</div>`
          : `<button class="cp-flip-btn" onclick="toggleFlip(${i})">⟳ สลับทิศทาง — ได้ ${r.altPieces} ชิ้น/แผ่น</button>`;
        return '';
      })()}
      ` : `<div class="cp-empty" style="padding:8px 0">เลือกวัสดุและกรอกขนาดเพื่อคำนวณ</div>`}
    `;

    // Populate select in Tab 2 card (mirrors Tab 1)
    const sel2 = $('cp_sel_' + i);
    const src  = [['f_matTop','f_matBot'][i], 'f_meshOut','f_meshIn'][Math.min(i,2)];
    const srcSel = $(['f_matTop','f_matBot','f_meshOut','f_meshIn'][i]);
    if (srcSel && sel2) {
      sel2.innerHTML = srcSel.innerHTML;
      sel2.value = srcSel.value;
    }
  });
  renderCustomFormulas();
}

// Sync select from Tab 2 → Tab 1
function syncMat(idx, val) {
  const ids = ['f_matTop','f_matBot','f_meshOut','f_meshIn'];
  $(ids[idx]).value = val;
  autoCalcFill();
  refreshCalcTab();
}

function toggleFlip(i) {
  _flipStates[i] = !_flipStates[i];
  autoCalcFill();
  refreshCalcTab();
}

// ── PRINT: Report ขนาดตัด ─────────────────────────────
// meta = {od, id_, h, unit, noQuo, noPO}
function _renderCuttingReportHtml(res, meta) {
  const { od, id_, h, unit, noQuo, noPO } = meta;
  const now = new Date();
  const dateStr = now.toLocaleDateString('th-TH', {year:'numeric', month:'long', day:'numeric'});

  const cards = res.map(r => {
    const isNone = String(r.matCode||'').trim() === 'ไม่มี';
    const sw = r.flipped ? r.sh.l : r.sh.w;
    const sl = r.flipped ? r.sh.w : r.sh.l;
    const hasLayout = !isNone && r.pieces > 0;
    const sheetsNeeded = hasLayout ? Math.ceil(unit / r.pieces) : '-';
    const util = hasLayout ? ((r.cw*r.cl*r.pieces)/(sw*sl)*100).toFixed(1) : '0.0';
    const grid = hasLayout ? buildGridVizSmall(sw, sl, r.cols, r.rows) : '';
    return `
      <div class="rpt-card">
        <div class="rpt-head">
          <span class="rpt-name">${r.partName}</span>
          ${r.matCode ? `<span class="rpt-badge">${r.matCode}</span>` : ''}
        </div>
        ${isNone ? `
        <div class="rpt-none">
          <div class="rpt-none-icon">✕</div>
          <div class="rpt-none-lbl">ไม่ใช้ชิ้นส่วนนี้</div>
        </div>
        ` : hasLayout ? `
        <div class="rpt-cutsize">
          <div class="rpt-cutsize-lbl">✂️ ขนาดตัด (มม.)</div>
          <div class="rpt-cutsize-val">${r.cw.toFixed(0)} <span class="rpt-x">×</span> ${r.cl.toFixed(0)}</div>
        </div>
        <table class="rpt-table">
          <tr><td>ขนาดแผ่น (มม.)</td><td><strong>${sw} × ${sl}</strong></td></tr>
          <tr><td>เลย์เอาต์ (แถว×แถว)</td><td><strong>${r.rows} × ${r.cols}</strong></td></tr>
          <tr><td>ชิ้น/แผ่น</td><td><strong>${r.pieces} ชิ้น</strong></td></tr>
          <tr><td>จำนวนที่ต้องการ</td><td><strong>${unit} ชิ้น</strong></td></tr>
          <tr><td>ใช้แผ่นทั้งหมด</td><td><strong>${sheetsNeeded} แผ่น</strong></td></tr>
          <tr><td>Utilization</td><td><strong>${util}%</strong></td></tr>
        </table>
        <div class="rpt-grid">${grid}</div>
        ` : `<div class="rpt-empty">— ไม่มีข้อมูลขนาดตัด —</div>`}
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8">
<title>Report ขนาดตัด - ${noPO || noQuo}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing:border-box; }
  body { font-family:'Sarabun',sans-serif; margin:0 auto; padding:4px 0; color:#111;
         max-width:190mm; font-size:13px; }
  .rpt-header { border-bottom:2px solid #333; padding-bottom:5px; margin-bottom:8px; }
  .rpt-header h1 { margin:0 0 3px; font-size:1rem; }
  .rpt-meta { display:flex; flex-wrap:wrap; gap:10px; font-size:.78rem; color:#333; }
  .rpt-meta b { color:#000; }
  .rpt-grid-wrap { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .rpt-card { border:1px solid #999; border-radius:6px; padding:7px 8px; break-inside:avoid; }
  .rpt-head { display:flex; align-items:center; justify-content:space-between;
              border-bottom:1px solid #ccc; padding-bottom:4px; margin-bottom:5px; }
  .rpt-name { font-weight:700; font-size:.9rem; }
  .rpt-badge { background:#eee; border:1px solid #999; border-radius:5px;
               padding:1px 6px; font-size:.7rem; }
  .rpt-cutsize { background:#fffbe6; border:2px solid #f59e0b; border-radius:7px;
                 padding:4px 8px; margin-bottom:6px; text-align:center; }
  .rpt-cutsize-lbl { font-size:.72rem; font-weight:700; color:#92400e; margin-bottom:1px; }
  .rpt-cutsize-val { font-size:1.65rem; font-weight:900; color:#000; line-height:1.1; letter-spacing:.5px; }
  .rpt-cutsize-val .rpt-x { color:#f59e0b; }
  .rpt-table { width:100%; border-collapse:collapse; font-size:.72rem; }
  .rpt-table td { padding:2px 3px; border-bottom:1px dashed #ddd; }
  .rpt-table td:first-child { color:#555; }
  .rpt-table td:last-child { text-align:right; }
  .rpt-grid { margin-top:5px; text-align:center; }
  .rpt-grid svg { max-width:220px !important; }
  .rpt-grid svg text { fill:#555 !important; }
  .rpt-grid svg rect[fill*="rgba(74,222,128"] { fill:rgba(0,0,0,.06) !important; stroke:#666 !important; }
  .rpt-empty { color:#888; font-size:.78rem; padding:6px 0; }
  .rpt-none { display:flex; flex-direction:column; align-items:center;
              justify-content:center; padding:10px 0; }
  .rpt-none-icon {
    width:44px; height:44px; border-radius:50%;
    background:#fff; border:3px solid #dc2626; color:#dc2626;
    display:flex; align-items:center; justify-content:center;
    font-size:1.6rem; font-weight:900; line-height:1; margin-bottom:5px;
  }
  .rpt-none-lbl { font-size:.85rem; font-weight:700; color:#dc2626; }
  @media print { body { padding:0; } }
</style>
</head><body>
  <div class="rpt-header">
    <h1>Report ขนาดตัด — รายชิ้นส่วน</h1>
    <div class="rpt-meta">
      <span>เลขที่ใบเสนอราคา: <b>${noQuo}</b></span>
      <span>OD: <b>${od||'-'}</b></span>
      <span>ID: <b>${id_||'-'}</b></span>
      <span>H: <b>${h||'-'}</b></span>
      <span>จำนวน: <b>${unit}</b> ชุด</span>
      <span style="margin-left:auto">วันที่พิมพ์: <b>${dateStr}</b></span>
    </div>
  </div>
  <div class="rpt-grid-wrap">${cards}</div>
</body></html>`;

  return html;
}

// เปิดหน้าต่างพิมพ์ด้วย HTML ของรายงานที่สร้างไว้แล้ว
function _openCuttingReport(html) {
  const w = window.open('', '_blank');
  if (!w) {
    Swal.fire({icon:'error', title:'เปิดหน้าต่างไม่ได้', text:'กรุณาอนุญาต popup สำหรับเว็บไซต์นี้',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#1d65cc'});
    return;
  }
  // ฉีด print trigger ก่อน </body> — w.onload ไม่ fire บน iOS หลัง document.write
  const htmlWithPrint = html.replace('</body>', `<script>(function(){
    function go(){ try{ window.focus(); window.print(); }catch(e){} }
    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(go).catch(function(){ setTimeout(go,700); });
    } else { setTimeout(go,700); }
  })();<\/script></body>`);
  w.document.write(htmlWithPrint);
  w.document.close();
}

// พิมพ์ Report ขนาดตัด จากข้อมูลในฟอร์มที่เปิดอยู่ (แท็บคำนวณตัดเหล็ก)
function printCuttingReport() {
  const res = runCalc();
  if (!res) {
    Swal.fire({icon:'warning', title:'ยังไม่มีข้อมูล', text:'กรุณากรอก OD, H ก่อนพิมพ์รายงาน',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#1d65cc'});
    return;
  }
  const od   = num('f_od');
  const id_  = num('f_id');
  const h    = num('f_h');
  const unit = num('f_unit') || 1;
  const noQuo = ($('f_noQuo') && $('f_noQuo').value) || '-';
  const html = _renderCuttingReportHtml(res, {od, id_, h, unit, noQuo, noPO:''});
  _openCuttingReport(html);
}

// พิมพ์ Report ขนาดตัด จากแถวข้อมูล DATA ที่บันทึกไว้ (ใช้สำหรับปุ่ม "ตัดเหล็ก" ในตาราง Order)
// dtRow = แถวข้อมูลจาก _dtCache (คอลัมน์ตาม DT.*)
function printCuttingReportFromDataRow(dtRow, noPO) {
  const od   = parseFloat(dtRow[DT.od]) || 0;
  const id_  = parseFloat(dtRow[DT.id]) || 0;
  const h    = parseFloat(dtRow[DT.h]) || 0;
  const unit = parseFloat(dtRow[DT.unit]) || 1;
  const custgap = 0; // ค่าเริ่มต้นเหมือนตอนโหลดจ๊อบเข้าฟอร์ม
  const matCodes = [dtRow[DT.matTop]||'', dtRow[DT.matBot]||'', dtRow[DT.meshOut]||'', dtRow[DT.meshIn]||''];
  const res = _computeCutParts(od, id_, h, unit, matCodes, custgap, [false,false,false,false]);
  if (!res) {
    Swal.fire({icon:'warning', title:'ข้อมูลไม่ครบ', text:'Order นี้ไม่มีข้อมูล OD/H สำหรับคำนวณขนาดตัด',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#1d65cc'});
    return;
  }
  const noQuo = dtRow[DT.noQuo] || '-';
  const html = _renderCuttingReportHtml(res, {od, id_, h, unit, noQuo, noPO: noPO || ''});
  _openCuttingReport(html);
}

// ── CLEAR ────────────────────────────────────────────
function clearForm() {
  Swal.fire({
    title:'ล้างข้อมูลทั้งหมด?', text:'ข้อมูลในฟอร์มจะถูกลบออก',
    icon:'warning', showCancelButton:true,
    confirmButtonText:'🗑️ ล้างเลย', cancelButtonText:'ยกเลิก',
    background:'#0a1c2e', color:'#f1f5f9',
    confirmButtonColor:'#ef4444', cancelButtonColor:'#475569'
  }).then(r => {
    if (!r.isConfirmed) return;
    document.querySelectorAll('input, select').forEach(el => {
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });
    $('f_date').value = new Date().toISOString().split('T')[0];
    if ($('f_custGap')) $('f_custGap').value = '0';
    if ($('aiSaleHint')) $('aiSaleHint').style.display = 'none';
    if ($('f_rev')) $('f_rev').value = '0';
    _loadedDraftId = null;
    _loadedRev = 0;
    // restore defaults
    if ($('f_transport'))  $('f_transport').value  = '300';  // เหมารวม /job default
    if ($('f_cPlating'))   $('f_cPlating').value   = '90';
    initRefId();   // สร้างเลขอ้างอิงใหม่
    if ($('f_rawMat'))   $('f_rawMat')._userEdited   = false;
    if ($('f_plating'))  $('f_plating')._userEdited  = false;
    if ($('f_cMachine')) $('f_cMachine')._userEdited = false;
    clearAttachedImage();
    setLoadedJob(null);
    calcAll();
    Swal.fire({icon:'success',title:'ล้างข้อมูลแล้ว',background:'#0a1c2e',color:'#f1f5f9',timer:1100,showConfirmButton:false,toast:true,position:'top-end'});
  });
}

// ── LOADED JOB TRACKER ──────────────────────────────
let _loadedNoQuo = null;   // null = new record; string = editing existing
let _loadedRev   = 0;      // Rev. ของแถวที่กำลังแก้ไข (0 = งานใหม่/ยังไม่เคยแก้ → ครั้งแรกที่แก้จะเซฟเป็น Rev.1)

function setLoadedJob(noQuo) {
  _loadedNoQuo = noQuo ? String(noQuo) : null;
  if (noQuo) {
    _loadedDraftId = null; // โหลดงานจริงจาก DATA → ไม่ผูกกับแบบร่างใดๆ
  } else {
    _loadedRev = 0; // ไม่ได้แก้ไขแถวเดิม → งานนี้จะเซฟ Rev. = 0 (ยังไม่เคยแก้ไข)
    if ($('f_rev')) $('f_rev').value = '0';
    if ($('revField')) $('revField').style.display = 'none';
  }
  // mobile badge
  const badge = $('editingBadge');
  if (badge) {
    if (_loadedNoQuo) {
      badge.textContent = '✏️ แก้ไข No.' + _loadedNoQuo;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }
  // desktop (summary panel) badge
  const badgeSP = $('editingBadgeSP');
  if (badgeSP) {
    if (_loadedNoQuo) {
      badgeSP.textContent = '✏️ แก้ไข No.' + _loadedNoQuo;
      badgeSP.style.display = 'inline-flex';
    } else {
      badgeSP.style.display = 'none';
    }
  }
  // swap button labels (mobile + desktop)
  const btn   = $('saveBtnLabel');
  const btnSP = $('saveBtnLabelSP');
  const txt = _loadedNoQuo ? '💾 บันทึกทับแถวเดิม' : '💾 บันทึกลง Sheets';
  if (btn)   btn.textContent   = txt;
  if (btnSP) btnSP.textContent = txt;
}

// ── DRAFTS (แบบร่าง — รองาน/รอราคาจากร้านภายนอก) ─────────
const DRAFTS_KEY = 'ptts_drafts';
let _loadedDraftId = null; // เก็บ id แบบร่างที่กำลังโหลดอยู่ในฟอร์ม (ใช้ลบทิ้งเมื่อ Save สำเร็จ)

function _getDrafts() {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]'); } catch(e) { return []; }
}
function _setDrafts(arr) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(arr));
  _updateDraftBadge();
  // sync ขึ้น Sheet "Drafts" เพื่อให้เห็นแบบร่างเดียวกันทุกเครื่อง
  if (SCRIPT_URL) {
    fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'saveDrafts', drafts: arr }) })
      .catch(()=>{});
  }
}
function _updateDraftBadge() {
  const n = _getDrafts().length;
  document.querySelectorAll('.draftCountBadge').forEach(el => {
    el.textContent = n;
    el.style.display = n > 0 ? 'inline-flex' : 'none';
  });
}
function _fmtDraftDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit',year:'2-digit'})
    + ' ' + d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
}

// เก็บค่าทุกช่อง (id ขึ้นต้นด้วย f_ หรือ r_) ในฟอร์มปัจจุบัน
function _snapshotForm() {
  const data = {};
  document.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
    if (!/^(f_|r_)/.test(el.id)) return;
    if (el.type === 'checkbox' || el.type === 'radio') data[el.id] = el.checked;
    else data[el.id] = el.value;
  });
  return data;
}
// คืนค่าทุกช่องจาก snapshot กลับเข้าฟอร์ม
function _restoreForm(data) {
  Object.keys(data).forEach(id => {
    const el = $(id);
    if (!el) return;
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = data[id];
    else el.value = data[id];
  });
}

// บันทึกฟอร์มปัจจุบันเป็นแบบร่าง (ใช้กับงานที่ยังไม่พร้อมบันทึกจริง เช่น รอราคาจากร้านภายนอก)
function saveDraft() {
  const data = _snapshotForm();
  const od = data.f_od || '', id_ = data.f_id || '', h = data.f_h || '';
  const sizeLabel = (od && id_ && h) ? `${od}×${id_}×${h}` : '—';
  const cust = (data.f_contact || '').trim() || '—';
  Swal.fire({
    title: '📝 บันทึกแบบร่าง',
    input: 'text',
    inputLabel: 'ชื่อ/หมายเหตุแบบร่าง (ไม่บังคับ)',
    inputPlaceholder: `${cust} • ${sizeLabel}`,
    showCancelButton: true,
    confirmButtonText: '💾 บันทึก', cancelButtonText: 'ยกเลิก',
    background: '#0a1c2e', color: '#f1f5f9',
    confirmButtonColor: '#2563eb', cancelButtonColor: '#475569'
  }).then(r => {
    if (!r.isConfirmed) return;
    const drafts = _getDrafts();
    drafts.unshift({
      id: 'd' + Date.now(),
      savedAt: new Date().toISOString(),
      label: (r.value || '').trim() || `${cust} • ${sizeLabel}`,
      size: sizeLabel, cust,
      data
    });
    _setDrafts(drafts);
    Swal.fire({icon:'success', title:'บันทึกแบบร่างแล้ว ✅', toast:true, position:'top-end',
      timer:1300, showConfirmButton:false, background:'#0a1c2e', color:'#f1f5f9'});
  });
}

// แสดงรายการแบบร่างทั้งหมด พร้อมปุ่มโหลด/ลบ
async function openDrafts() {
  // ดึงแบบร่างล่าสุดจากเซิร์ฟเวอร์ก่อน (เผื่อมีคนบันทึกจากเครื่องอื่น)
  if (SCRIPT_URL) {
    try {
      const res = await fetch(SCRIPT_URL + '?action=getDrafts', {mode:'cors'}).then(r=>r.json());
      if (res && res.status === 'ok' && Array.isArray(res.drafts)) {
        localStorage.setItem(DRAFTS_KEY, JSON.stringify(res.drafts));
        _updateDraftBadge();
      }
    } catch(e) {}
  }
  const drafts = _getDrafts();
  const listHtml = drafts.length ? drafts.map(d => `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;
      background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;
      padding:8px 10px;margin-bottom:6px">
      <div style="text-align:left;flex:1;min-width:0">
        <div style="font-size:.82rem;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.label}</div>
        <div style="font-size:.7rem;color:#94a3b8">📅 ${_fmtDraftDate(d.savedAt)} · 📐 ${d.size}</div>
      </div>
      <button onclick="loadDraft('${d.id}')" style="padding:6px 10px;border:none;border-radius:7px;
        background:#2563eb;color:#fff;font-size:.75rem;cursor:pointer;font-weight:700;flex-shrink:0">📂 โหลด</button>
      <button onclick="deleteDraft('${d.id}')" style="padding:6px 10px;border:none;border-radius:7px;
        background:rgba(239,68,68,.15);color:#f87171;font-size:.75rem;cursor:pointer;font-weight:700;flex-shrink:0">🗑️</button>
    </div>
  `).join('') : '<div style="text-align:center;color:#94a3b8;font-size:.85rem;padding:16px 0">ยังไม่มีแบบร่าง</div>';

  Swal.fire({
    title: '📂 แบบร่างที่บันทึกไว้',
    width: 480,
    html: `
      <div style="text-align:left">
        <div style="font-size:.75rem;color:#64748b;margin-bottom:10px">
          สำหรับงานที่ยังไม่พร้อมบันทึกจริง เช่น รอราคาจากร้านภายนอก/ผู้รับเหมาช่วง —
          กรอกข้อมูลเท่าที่มี แล้วกดบันทึกแบบร่างไว้ก่อนได้
        </div>
        <button onclick="Swal.close(); saveDraft();" style="width:100%;margin-bottom:10px;padding:9px;border:none;
          border-radius:9px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font-weight:700;
          cursor:pointer;font-family:Sarabun,sans-serif;font-size:.82rem">
          📝 บันทึกฟอร์มปัจจุบันเป็นแบบร่างใหม่
        </button>
        <div style="max-height:46vh;overflow-y:auto">${listHtml}</div>
      </div>`,
    showConfirmButton: true, confirmButtonText: 'ปิด',
    background: '#0a1c2e', color: '#f1f5f9', confirmButtonColor: '#475569'
  });
}

// โหลดแบบร่างกลับเข้าฟอร์ม (แทนที่ข้อมูลในฟอร์มปัจจุบันทั้งหมด)
function loadDraft(id) {
  const d = _getDrafts().find(x => x.id === id);
  if (!d) return;
  Swal.fire({
    title: 'โหลดแบบร่างนี้?', text: 'ข้อมูลในฟอร์มปัจจุบันจะถูกแทนที่ด้วยข้อมูลในแบบร่าง',
    icon: 'question', showCancelButton: true,
    confirmButtonText: '📂 โหลด', cancelButtonText: 'ยกเลิก',
    background: '#0a1c2e', color: '#f1f5f9',
    confirmButtonColor: '#2563eb', cancelButtonColor: '#475569'
  }).then(r => {
    if (!r.isConfirmed) return;
    _restoreForm(d.data);
    _loadedDraftId = id; // จำไว้ว่าโหลดแบบร่างนี้ → ถ้า Save สำเร็จจะลบแบบร่างนี้ทิ้ง
    if ($('f_hasOd2') && typeof toggleOd2Panel === 'function') toggleOd2Panel();
    if (typeof updateSize === 'function') updateSize();
    if (typeof syncRemarkChips === 'function') syncRemarkChips();
    setLoadedJob(null); // แบบร่าง → บันทึกเป็นรายการใหม่เสมอ
    computeNextNo();    // คำนวณเลขที่ใบเสนอราคาใหม่ตามปัจจุบัน กันเลขซ้ำกับที่บันทึกไปแล้ว
    if (typeof initRefId === 'function') initRefId(); // สร้างเลขอ้างอิงใหม่ ไม่ใช้ของแบบร่างเดิม
    calcAll();
    if (typeof updateSummaryPanel === 'function') updateSummaryPanel();
    switchTab('breakdown');
    setTimeout(() => {
      Swal.fire({icon:'success', title:'โหลดแบบร่างแล้ว ✅', timer:1200, showConfirmButton:false,
        background:'#0a1c2e', color:'#f1f5f9'});
    }, 200);
  });
}

// ลบแบบร่าง
function deleteDraft(id) {
  Swal.fire({
    title: 'ลบแบบร่างนี้?', icon: 'warning', showCancelButton: true,
    confirmButtonText: '🗑️ ลบ', cancelButtonText: 'ยกเลิก',
    background: '#0a1c2e', color: '#f1f5f9',
    confirmButtonColor: '#ef4444', cancelButtonColor: '#475569'
  }).then(r => {
    if (!r.isConfirmed) return;
    _setDrafts(_getDrafts().filter(x => x.id !== id));
    Swal.fire({icon:'success', title:'ลบแบบร่างแล้ว', toast:true, position:'top-end',
      timer:1000, showConfirmButton:false, background:'#0a1c2e', color:'#f1f5f9'});
    openDrafts();
  });
}

// ── SUBMIT ───────────────────────────────────────────
function submitForm() {
  if (!SCRIPT_URL) {
    Swal.fire({icon:'warning',title:'ยังไม่ตั้งค่า URL',text:'กรุณาใส่ Apps Script URL ก่อน',background:'#0a1c2e',color:'#f1f5f9',confirmButtonColor:'#2563eb'});
    if ($('apiTab_scriptUrl')) $('apiTab_scriptUrl').focus(); return;
  }
  // ── Validation ──────────────────────────────────────
  const _required = [
    { id:'f_od',      label:'OD' },
    { id:'f_id',      label:'ID' },
    { id:'f_h',       label:'H (ความสูง)' },
    { id:'f_unit',    label:'จำนวน (Unit)' },
    { id:'f_matTop',  label:'MAT ฝาบน' },
    { id:'f_matBot',  label:'MAT ฝาล่าง' },
    { id:'f_meshOut', label:'ตะแกรงนอก' },
    { id:'f_meshIn',  label:'ตะแกรงใน' },
  ];
  const _missing = _required.filter(f => {
    const el = $(f.id);
    return !el || !String(el.value).trim() || el.value === '0';
  });
  if (_missing.length > 0) {
    Swal.fire({
      icon: 'warning',
      title: 'กรอกข้อมูลไม่ครบ ⚠️',
      html: '<div style="text-align:left;font-size:.9rem;line-height:2">'
        + _missing.map(f => `❌ <b>${f.label}</b>`).join('<br>')
        + '</div>',
      background: '#1e293b', color: '#f1f5f9',
      confirmButtonColor: '#6366f1', confirmButtonText: 'กลับไปกรอก'
    });
    // highlight missing fields
    _required.forEach(f => {
      const el = $(f.id);
      if (!el) return;
      const missing = !String(el.value).trim() || el.value === '0';
      el.style.borderColor = missing ? '#f87171' : '';
    });
    // scroll to first missing
    const firstEl = $(_missing[0].id);
    if (firstEl) { switchTab('breakdown'); firstEl.scrollIntoView({behavior:'smooth',block:'center'}); }
    return;
  }
  // ID ≥ OD — block save
  const _saveOd = parseFloat($('f_od').value) || 0;
  const _saveId = parseFloat($('f_id').value) || 0;
  if (_saveOd > 0 && _saveId > 0 && _saveId >= _saveOd) {
    Swal.fire({
      icon:'error', title:'⚠️ ขนาดไม่ถูกต้อง',
      html:'<b>ID (' + _saveId + ' mm)</b> ต้องน้อยกว่า <b>OD (' + _saveOd + ' mm)</b><br><span style="font-size:.82rem;color:#8b8aaa">กรุณาแก้ไขก่อน บันทึก</span>',
      background:'#0d1b2a', color:'#cce4ff',
      confirmButtonColor:'#dc2626', confirmButtonText:'แก้ไข'
    });
    const odEl=$('f_od'), idEl=$('f_id');
    if(odEl){odEl.style.borderColor='#f87171'; odEl.scrollIntoView({behavior:'smooth',block:'center'});}
    if(idEl) idEl.style.borderColor='#f87171';
    return;
  }
  // ── ตรวจเลขซ้ำ (เฉพาะบันทึกใหม่เท่านั้น) ─────────────────────
  if (!_loadedNoQuo) {
    const newNo = String($('f_noQuo').value).trim();
    if (!newNo) {
      Swal.fire({icon:'error',title:'⚠️ ไม่มีเลขที่ใบเสนอราคา',
        text:'กรุณาโหลดข้อมูลจาก API ก่อน เพื่อรับเลขที่ใบเสนอราคา',
        background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
      return;
    }
    const dupFound = _dtCache.some(r => {
      const existing = String(r[DT.noQuo] || '').replace(/^Q-/i, '').trim();
      return existing === newNo;
    });
    if (dupFound) {
      Swal.fire({
        icon: 'error', title: '⚠️ เลขที่ซ้ำ!',
        html: `เลขที่ใบเสนอราคา <b>${newNo}</b> มีอยู่แล้วใน DATA<br>
               <span style="font-size:.82rem;color:#8b8aaa">หากต้องการแก้ไข ให้โหลด job นั้นจาก tab DATA ก่อน</span>`,
        background: '#0d1b2a', color: '#cce4ff',
        confirmButtonColor: '#dc2626', confirmButtonText: 'ตกลง'
      });
      return;
    }
  }

  // ── ตรวจ ลูกค้า ────────────────────────────────────────────────
  const _contactVal = ($('f_contact')?.value || '').trim();
  if (!_contactVal || _contactVal === '—') {
    Swal.fire({
      icon:'warning', title:'⚠️ ยังไม่ได้ใส่ชื่อลูกค้า',
      text:'กรุณากรอกชื่อลูกค้าก่อนบันทึก',
      background:'#0d1b2a', color:'#cce4ff',
      confirmButtonColor:'#f59e0b', confirmButtonText:'ตกลง'
    }).then(() => {
      $('f_contact')?.focus();
      $('f_contact')?.scrollIntoView({behavior:'smooth', block:'center'});
    });
    return;
  }

  // clear highlights
  _required.forEach(f => { const el=$(f.id); if(el) el.style.borderColor=''; });
  if($('f_od')) $('f_od').style.borderColor='';
  if($('f_id')) $('f_id').style.borderColor='';
  // เก็บราคาเสนอขายเดิมไว้ก่อน — ห้ามให้ calcAll() (auto sell price จาก margin) มาทับ
  const _keepSellPrice = $('f_sellPrice')?.value || '';
  calcLabor(); calcAll();
  if ($('f_sellPrice') && _keepSellPrice !== '') {
    $('f_sellPrice').value = _keepSellPrice;
    // คำนวณกำไร/ลูก, กำไร/JOB ใหม่ตามราคาเสนอขายเดิม
    const _spUnit = num('f_sellPrice');
    const _unit2  = num('f_unit') || 1;
    const _costU  = num('f_totalCost');
    if ($('f_profitUnit')) $('f_profitUnit').value = (_spUnit - _costU).toFixed(2);
    if ($('f_profitJob'))  $('f_profitJob').value  = ((_spUnit - _costU) * _unit2).toFixed(2);
  }

  const workdays  = num('f_workdays');
  const laborRate = num('f_laborRate');
  const totalLabor = workdays * laborRate;

  const row = [
    /* 1  */ $('f_status').value,
    /* 2  */ $('f_noQuo').value,
    /* 3  */ isoToThaiShort($('f_date').value),
    /* 4  */ num('f_od'),
    /* 5  */ num('f_id'),
    /* 6  */ num('f_h'),
    /* 7  */ num('f_unit'),
    /* 8  */ $('f_size').value,
    /* 9  */ $('f_workType').value,
    /* 10 */ $('f_matTop').value,
    /* 11 */ num('f_costTop'),
    /* 12 */ $('f_matBot').value,
    /* 13 */ num('f_costBot'),
    /* 14 */ $('f_testWaste').value,
    /* 15 */ num('f_cTestWaste'),
    /* 16 */ $('f_outsource').value,
    /* 17 */ num('f_cOutsource'),
    /* 18 */ $('f_meshOut').value,
    /* 19 */ num('f_cMeshOut'),
    /* 20 */ $('f_meshIn').value,
    /* 21 */ num('f_cMeshIn'),
    /* 22 */ $('f_laser').value,
    /* 23 */ num('f_cLaser'),
    /* 24 */ $('f_plating').value,
    /* 25 */ num('f_cPlating'),
    /* 26 */ $('f_mold').value,
    /* 27 */ num('f_cMold'),
    /* 28 */ Math.ceil((workdays/60)/8),  // AB = Leadtime (วัน)
    /* 29 */ num('f_cLabor'),         // AC = ค่าแรง/ลูก (= totalLabor / unit)
    /* 30 */ $('f_transport').value, // AD
    /* 31 */ num('f_cTransport'),    // AE
    /* 32 */ $('f_machine').value,   // AF
    /* 33 */ num('f_cMachine'),      // AG
    /* 34 */ $('f_other1').value,    // AH
    /* 35 */ num('f_cOther1'),       // AI
    /* 36 */ $('f_other2').value,    // AJ
    /* 37 */ num('f_cOther2'),       // AK
    /* 38 */ $('f_other3').value,    // AL
    /* 39 */ num('f_cOther3'),       // AM
    /* 40 */ num('f_fixedCost'),     // AN
    /* 41 */ num('f_totalCost'),     // AO
    /* 42 */ num('f_sellPrice'),     // AP
    /* 43 */ num('f_profitUnit'),    // AQ = กำไร/ลูก
    /* 44 */ num('f_profitJob'),     // AR = กำไร/JOB
    /* 45 */ (() => {                 // AS = ช่องว่างใส่จีบ
      const cust = parseFloat($('f_custGap')?.value) || 0;
      if (cust >= 1) return cust;
      return parseFloat($('f_gapWeld')?.value) || 0;
    })(),
    /* 46 */ $('f_contact').value,   // AT
    /* 47 */ $('f_remark').value,    // AU
    /* 48 */ $('f_quoter').value,    // AV
    /* 49 */ $('f_rawMat').value,    // AW
    /* 50 */ '',                     // AX (reserved)
    /* 51 */ (_attachedImage?.driveUrl || ''),  // AY = รูปใบขอราคา (Drive URL)
    /* 52 */ '',                     // AZ (reserved)
    /* 53 */ '',                     // BA (reserved)
    /* 54 */ $('f_refId') ? $('f_refId').value : generateRefId(),  // BB = เลขอ้างอิง
    /* 55 */ ($('f_hasOd2')?.checked ? (parseFloat($('f_od2')?.value)||0) : 0),  // BC = OD ฝา2
    /* 56 */ ($('f_hasOd2')?.checked ? ($('f_matOd2')?.value||'') : ''),         // BD = MAT ฝา2
    /* 57 */ ($('f_hasOd2')?.checked ? num('f_costOd2') : 0),                    // BE = cost ฝา2
    /* 58 */ ($('f_hasOd2')?.checked ? ($('r_od2calc_yes')?.checked ? 1 : 0) : 0), // BF = flag
    /* 59 */ $('f_aiSale')?.value || '', // BG = AI Sale (ผลวิเคราะห์ AI เคาะราคา)
    /* 60 */ (_loadedNoQuo ? (_loadedRev + 1) : 0), // BH = Rev. (0 = ยังไม่เคยแก้ไข, แก้ครั้งแรก = 1, +1 ทุกครั้งที่บันทึกทับแถวเดิม)
  ];

  const isUpdate = !!_loadedNoQuo;
  const _cfOd   = num('f_od'), _cfId = num('f_id'), _cfH = num('f_h');
  const _cfOd2  = ($('f_hasOd2')?.checked && num('f_od2') > 0) ? num('f_od2') : 0;
  const _cfSize = _cfOd && _cfId && _cfH
    ? (_cfOd2 > 0 ? `${_cfOd2}/${_cfOd}×${_cfId}×${_cfH} mm.` : `${_cfOd}×${_cfId}×${_cfH} mm.`)
    : '—';
  const _cfCust = ($('f_contact') && $('f_contact').value) ? $('f_contact').value : '—';
  const _cfNo   = isUpdate ? _loadedNoQuo : $('f_noQuo').value;
  const _cfRev  = isUpdate ? (_loadedRev + 1) : 0;
  // ⚠️ เตือนถ้าราคาเสนอขาย ต่ำกว่าต้นทุนรวม/ลูก (ขาดทุน)
  const _cfSellPrice = num('f_sellPrice');
  const _cfTotalCost = num('f_totalCost');
  const _cfBelowCost = _cfSellPrice > 0 && _cfTotalCost > 0 && _cfSellPrice < _cfTotalCost;
  const confirmHtml = `
    <div style="text-align:left;font-size:.83rem;line-height:2;margin-top:4px">
      <div>📋 <b>No.Quo:</b> ${_cfNo}</div>
      <div>👤 <b>ลูกค้า:</b> ${_cfCust}</div>
      <div>📐 <b>Size:</b> ${_cfSize}</div>
      <div>🔢 <b>จำนวน:</b> ${num('f_unit').toLocaleString('th-TH')} ชิ้น</div>
      <div>💰 <b>ราคาเสนอขาย:</b> ${_cfSellPrice.toLocaleString('th-TH')} บาท/ลูก</div>
      ${isUpdate ? `<div>🔁 <b>Rev.:</b> ${_cfRev}</div>` : ''}
      ${isUpdate ? '<div style="color:#f59e0b;font-size:.78rem">⚠️ จะบันทึกทับแถวเดิม</div>' : ''}
      ${_cfBelowCost ? `<div style="color:#f87171;font-weight:700;font-size:.8rem;margin-top:4px">
        🚨 ราคาเสนอขาย (${_cfSellPrice.toLocaleString('th-TH')}) ต่ำกว่าต้นทุนรวม/ลูก (${_cfTotalCost.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}) — จะขาดทุน!
        </div>` : ''}
    </div>`;

  Swal.fire({
    title: _cfBelowCost ? '⚠️ ราคาต่ำกว่าต้นทุน!' : (isUpdate ? 'บันทึกทับแถวเดิม?' : 'บันทึกข้อมูล?'),
    html: confirmHtml,
    icon: _cfBelowCost ? 'warning' : 'question', showCancelButton:true,
    confirmButtonText: _cfBelowCost ? '⚠️ ยืนยันบันทึกทั้งที่ขาดทุน' : (isUpdate ? '✅ อัปเดต' : '✅ บันทึก'),
    cancelButtonText:'ยกเลิก',
    background:'#0a1c2e', color:'#f1f5f9',
    confirmButtonColor: _cfBelowCost ? '#dc2626' : (isUpdate ? '#f59e0b' : '#2563eb'),
    cancelButtonColor:'#475569'
  }).then(r => {
    if (!r.isConfirmed) return;
    Swal.fire({title: isUpdate ? 'กำลังอัปเดต…' : 'กำลังบันทึก…',
      background:'#0a1c2e',color:'#f1f5f9',allowOutsideClick:false,showConfirmButton:false,
      didOpen:()=>Swal.showLoading()});
    const _imgPayload = (_attachedImage?.base64 && !_attachedImage?.driveUrl)
      ? { imageBase64: _attachedImage.base64, imageMime: _attachedImage.mimeType, imageName: _attachedImage.name }
      : {};
    const payload = isUpdate
      ? { action: 'updateRow', noQuo: _loadedNoQuo, row, ..._imgPayload }
      : { row, ..._imgPayload };
    fetch(SCRIPT_URL, {method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    }).then(() => {
      // ── อัปเดต _dtCache ทันที เพื่อป้องกัน save ซ้ำ ──────────
      if (!isUpdate) {
        _dtCache.push(row);          // เพิ่มแถวใหม่เข้า cache
        computeNextNo();             // คำนวณ No.Quo ถัดไปใหม่
        initRefId();                 // สร้างเลขอ้างอิงใหม่
      } else {
        // อัปเดต row ที่มีอยู่ใน cache
        const idx = _dtCache.findIndex(r => String(r[DT.noQuo]||'').replace(/^Q-/i,'') === String(_loadedNoQuo));
        if (idx !== -1) _dtCache[idx] = row;
      }
      // ── ถ้าโหลดมาจากแบบร่าง และบันทึกสำเร็จ → ลบแบบร่างนั้นทิ้ง ──
      if (_loadedDraftId) {
        _setDrafts(_getDrafts().filter(x => x.id !== _loadedDraftId));
        if (typeof _updateDraftBadge === 'function') _updateDraftBadge();
        _loadedDraftId = null;
      }
      setLoadedJob(null);
      _lastSavedRow   = row;
      _lastSavedImage = _attachedImage ? { ..._attachedImage } : null;  // snapshot ก่อน reset
      _enableShareBtn(row);
      showSaveSuccessCard(row, isUpdate);
      _resetFormSilent();   // คืนค่าฟอร์มพร้อมรับงานถัดไป
    }).catch(err => {
      Swal.fire({icon:'error',title:'เกิดข้อผิดพลาด',text:err.toString(),background:'#0a1c2e',color:'#f1f5f9'});
    });
  });
}


// ── Remark Chips ─────────────────────────────────────────────────
function syncRemarkChips() {
  const el = $('f_remark');

  // รวบรวม label ทุก chip (ทั้ง checked และไม่ checked)
  const allLabels = Array.from(document.querySelectorAll('#remarkChips .rchip')).map(chip => {
    const sel = chip.querySelector('.rchip-sel');
    let label = chip.dataset.label || '';
    if (chip.dataset.labelSel && sel) label = sel.value;
    return label.trim();
  }).filter(Boolean);

  // ดึงข้อความที่พิมพ์เองออกมา (ส่วนที่ไม่ใช่ chip label)
  const currentParts = el.value.split(',').map(s => s.trim()).filter(Boolean);
  const manualParts = currentParts.filter(s => !allLabels.some(l => s.startsWith(l)));

  // chip ที่ checked อยู่
  const chipParts = [];
  document.querySelectorAll('#remarkChips .rchip').forEach(chip => {
    const cb = chip.querySelector('input[type=checkbox]');
    if (!cb?.checked) return;
    const sel  = chip.querySelector('.rchip-sel');
    const numEl = chip.querySelector('.rchip-num');
    let label = chip.dataset.label || '';
    if (chip.dataset.labelSel && sel) label = sel.value;
    let text = label;
    if (numEl?.value) {
      const unit = chip.dataset.unit || numEl.dataset.unit || '';
      text += ' ' + numEl.value + ' ' + unit;
    }
    if (text.trim()) chipParts.push(text.trim());
  });

  // ต่อกัน: ข้อความพิมพ์เอง + chip ที่เลือก
  el.value = [...manualParts, ...chipParts].filter(Boolean).join(', ');
}

function _clearRemarkChips() {
  document.querySelectorAll('#remarkChips input[type=checkbox]').forEach(cb => cb.checked = false);
  document.querySelectorAll('#remarkChips .rchip-num').forEach(n => n.value = '');
  if ($('f_remark')) $('f_remark').value = '';
}

function _resetFormSilent() {
  // ล้างทุกช่อง
  document.querySelectorAll('input:not([type=file]), select').forEach(el => {
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  });

  // คืนค่า defaults
  $('f_date').value = new Date().toISOString().split('T')[0];
  if ($('f_custGap'))   $('f_custGap').value   = '0';
  if ($('f_transport')) $('f_transport').value  = localStorage.getItem('ptts_def_transport') || '300';
  if ($('f_cPlating'))  $('f_cPlating').value   = localStorage.getItem('ptts_def_plating')   || '90';
  if ($('f_fixedCost')) $('f_fixedCost').value  = localStorage.getItem('ptts_def_fixedCost') || '50';
  if ($('f_status'))    $('f_status').value      = 'รอสรุป';

  // reset flags
  if ($('f_rawMat'))   $('f_rawMat')._userEdited   = false;
  if ($('f_plating'))  $('f_plating')._userEdited  = false;
  if ($('f_cMachine')) $('f_cMachine')._userEdited = false;

  clearAttachedImage();
  _clearRemarkChips();
  computeNextNo();   // เลขที่ใบถัดไป
  initRefId();       // เลขอ้างอิงใหม่
  if ($('f_rev')) $('f_rev').value = '0';
  _loadedRev = 0;
  calcAll();
}

// ── LABOR CONFIG ─────────────────────────────────────
const LABOR_DEFAULTS = [
  { name: 'ตัดตะแกรง',  base: 2, setup: 15, factor: 0.005, dim: 'H',  enabled: true },
  { name: 'ตัดฝา',       base: 5, setup: 20, factor: 0.010, dim: 'OD', enabled: true },
  { name: 'สปอตตะแกรง', base: 3, setup: 15, factor: 0.008, dim: 'H',  enabled: true },
  { name: 'บึ้มฝา',      base: 6, setup: 30, factor: 0.006, dim: 'OD', enabled: true },
  { name: 'QC_Packing',  base: 2, setup: 10, factor: 0.001, dim: 'OD', enabled: true },
];

let _laborProcs = null;

function getLaborProcesses() {
  if (_laborProcs) return _laborProcs;
  try {
    const s = localStorage.getItem('ptts_labor_processes');
    _laborProcs = s ? JSON.parse(s) : JSON.parse(JSON.stringify(LABOR_DEFAULTS));
  } catch { _laborProcs = JSON.parse(JSON.stringify(LABOR_DEFAULTS)); }
  return _laborProcs;
}

function getLaborRatePerMin() {
  return parseFloat(localStorage.getItem('ptts_labor_rate_min')) || 3;
}

function onRateDayChange() {
  const perDay   = parseFloat($('cfg_ratePerDay').value) || 0;
  const hrsPerDay = parseFloat($('cfg_hoursPerDay').value) || 8;
  const perHour  = perDay > 0 ? (perDay / hrsPerDay) : 0;
  const perMin   = perHour > 0 ? (perHour / 60) : 0;
  if ($('cfg_ratePerHour')) $('cfg_ratePerHour').value = perHour > 0 ? perHour.toFixed(2) : '';
  if ($('cfg_ratePerMin'))  $('cfg_ratePerMin').value  = perMin  > 0 ? perMin.toFixed(4)  : '';
  updateLaborPreview();
}

function onRateHourChange() { onRateDayChange(); }

function calcLaborByProcess() {
  if (_laborManual) return;   // user is typing manually — skip auto-calc
  const od    = num('f_od');
  const h     = num('f_h');
  const units = num('f_unit') || 1;
  const rate  = getLaborRatePerMin();
  const procs = getLaborProcesses();
  let totalMin = 0;
  procs.forEach(p => {
    if (!p.enabled) return;
    const dimVal  = p.dim === 'H' ? h : od;
    // Setup Cost = setup × factor × dim (one-time per job, scales with size)
    // Unit Cost  = base × units (scales with quantity only)
    const effFactor = dimVal > 0 ? p.factor * dimVal : 1;
    const setupMin  = p.setup * effFactor;
    const unitMin   = p.base * units;
    totalMin += setupMin + unitMin;
  });
  const totalCost  = totalMin * rate;
  const costPerUnit = units > 0 ? totalCost / units : totalCost;
  $('f_cLabor').value    = costPerUnit > 0 ? costPerUnit.toFixed(2) : '';
  $('f_workdays').value  = totalMin.toFixed(1);
  $('f_laborRate').value = rate;
  // แสดงเวลา/ลูก ใน label
  const minPerUnit = units > 0 ? totalMin / units : totalMin;
  const hrPerUnit  = minPerUnit / 60;
  const ltd = $('laborTimeDetail');
  if (ltd) {
    ltd.textContent = totalMin > 0
      ? `— ${minPerUnit.toFixed(1)} นาที / ${hrPerUnit.toFixed(2)} ชม. ต่อลูก`
      : '';
  }
  // show total for reference
  const lpu = $('laborPerUnit');
  if (lpu) {
    if (totalCost > 0 && units > 1) {
      const leadDays = Math.ceil((totalMin / 60) / 8);
      lpu.textContent = `รวมทั้ง job: ฿${totalCost.toFixed(2)} | เวลารวม: ${totalMin.toFixed(1)} นาที (${units} ลูก) | Leadtime: ${leadDays} วัน`;
    } else {
      lpu.textContent = '';
    }
  }
  return { totalMin, totalCost, costPerUnit, rate, procs };
}

function calcLabor() { calcLaborByProcess(); }

function renderProcTable() {
  // restore อัตราค่าจ้างจาก localStorage ทุกครั้งที่เปิด tab
  const savedDay  = localStorage.getItem('ptts_labor_rate_day');
  const savedHrs  = localStorage.getItem('ptts_labor_hours_per_day');
  const savedMin  = localStorage.getItem('ptts_labor_rate_min');
  const savedHour = localStorage.getItem('ptts_labor_rate_hour');
  if (savedDay  && $('cfg_ratePerDay'))  $('cfg_ratePerDay').value  = savedDay;
  if (savedHrs  && $('cfg_hoursPerDay')) $('cfg_hoursPerDay').value = savedHrs;
  if (savedHour && $('cfg_ratePerHour')) $('cfg_ratePerHour').value = savedHour;
  if (savedMin  && $('cfg_ratePerMin'))  $('cfg_ratePerMin').value  = savedMin;

  const procs = getLaborProcesses();
  const tbody = $('proc_tbody');
  if (!tbody) return;
  const inStyle = 'background:var(--bg-input);border:1px solid var(--bc-input);border-radius:6px;padding:6px 8px;color:var(--t1);font-family:Sarabun,sans-serif;font-size:.82rem;width:100%;text-align:center;-webkit-appearance:none';
  tbody.innerHTML = procs.map((p, i) => `
    <tr style="border-bottom:1px solid var(--bc-div)">
      <td style="padding:8px;text-align:center">
        <input type="checkbox" ${p.enabled?'checked':''} onchange="toggleProc(${i},this.checked)"
          style="width:16px;height:16px;cursor:pointer;accent-color:var(--c1)">
      </td>
      <td style="padding:6px 4px;overflow:hidden">
        <input type="text" value="${(p.name||'').replace(/"/g,'&quot;')}" oninput="editProc(${i},'name',this.value)"
          style="${inStyle};text-align:left;min-width:0;width:100%;box-sizing:border-box">
      </td>
      <td style="padding:6px 4px">
        <input type="number" value="${p.base}" step="0.1" oninput="editProc(${i},'base',this.value)" style="${inStyle}">
      </td>
      <td style="padding:6px 4px">
        <input type="number" value="${p.setup}" step="1" oninput="editProc(${i},'setup',this.value)" style="${inStyle}">
      </td>
      <td style="padding:6px 4px">
        <input type="number" value="${p.factor}" step="0.001" oninput="editProc(${i},'factor',this.value)" style="${inStyle}">
      </td>
      <td style="padding:6px 4px">
        <select onchange="editProc(${i},'dim',this.value)" style="${inStyle};width:100%;box-sizing:border-box">
          <option ${p.dim==='OD'?'selected':''}>OD</option>
          <option ${p.dim==='H' ?'selected':''}>H</option>
        </select>
      </td>
      <td style="padding:6px 4px;text-align:center">
        <button onclick="deleteProc(${i})" title="ลบกระบวนการ"
          style="padding:5px 8px;border-radius:7px;border:1px solid rgba(248,113,113,.35);background:rgba(248,113,113,.1);color:#f87171;font-size:.7rem;cursor:pointer">🗑️</button>
      </td>
    </tr>`).join('');
}

function addProc() {
  const procs = getLaborProcesses();
  procs.push({ name: 'กระบวนการใหม่', base: 0, setup: 0, factor: 0, dim: 'OD', enabled: true });
  renderProcTable();
  updateLaborPreview();
}

function deleteProc(i) {
  const procs = getLaborProcesses();
  const name = procs[i]?.name || '';
  Swal.fire({
    icon:'warning', title:`ลบ "${name}"?`,
    background:'#0d1b2a', color:'#cce4ff',
    confirmButtonText:'🗑 ลบเลย', confirmButtonColor:'#c0464a',
    showCancelButton:true, cancelButtonText:'ยกเลิก', cancelButtonColor:'#374151',
  }).then(r => {
    if (!r.isConfirmed) return;
    procs.splice(i, 1);
    renderProcTable();
    updateLaborPreview();
  });
}

function toggleProc(i, val) {
  const procs = getLaborProcesses();
  procs[i].enabled = val;
  updateLaborPreview();
}

function editProc(i, key, val) {
  const procs = getLaborProcesses();
  procs[i][key] = (key === 'dim' || key === 'name') ? val : (parseFloat(val) || 0);
  updateLaborPreview();
}

function updateLaborPreview() {
  const rateMin = parseFloat($('cfg_ratePerMin') && $('cfg_ratePerMin').value ? $('cfg_ratePerMin').value : null) || getLaborRatePerMin();
  const od    = num('f_od');
  const h     = num('f_h');
  const units = num('f_unit') || 1;
  const procs = getLaborProcesses();
  let totalMin = 0;
  let rows = '';
  procs.forEach(p => {
    if (!p.enabled) return;
    const dimVal    = p.dim === 'H' ? h : od;
    const effFactor = dimVal > 0 ? p.factor * dimVal : 1;
    const setupMin  = p.setup * effFactor;
    const unitMin   = p.base * units;
    const minPerJob = setupMin + unitMin;
    const setupCost = setupMin * rateMin;
    const unitCost  = unitMin  * rateMin;
    totalMin += minPerJob;
    rows += `<div style="padding:5px 8px;background:var(--pair-bg);border:1px solid var(--bc-div);border-radius:6px;margin-bottom:4px">
      <div style="display:flex;justify-content:space-between">
        <span style="color:var(--t1);font-weight:600">${p.name}</span>
        <span style="color:var(--c1);font-weight:600">${minPerJob.toFixed(1)} นาที &nbsp;=&nbsp; ฿${(minPerJob*rateMin).toFixed(2)}</span>
      </div>
      <div style="display:flex;gap:12px;font-size:.72rem;color:var(--t3);margin-top:2px;padding-left:4px">
        <span>🔧 Setup: ฿${setupCost.toFixed(2)}</span>
        <span>🔩 Unit×${units}: ฿${unitCost.toFixed(2)}</span>
      </div>
    </div>`;
  });
  const el = $('laborPreviewRows');
  if (el) el.innerHTML = rows || '<div style="color:var(--t3);font-size:.8rem;padding:8px">— ไม่มีกระบวนการที่เปิดใช้งาน —</div>';
  if ($('prev_totalMin'))  $('prev_totalMin').textContent  = totalMin.toFixed(1) + ' นาที';
  if ($('prev_totalCost')) $('prev_totalCost').textContent = fmt(totalMin * rateMin);
}

function saveLaborConfig() {
  const rateDay   = parseFloat($('cfg_ratePerDay').value) || 0;
  const hrsPerDay = parseFloat($('cfg_hoursPerDay').value) || 8;
  const rateHour  = parseFloat($('cfg_ratePerHour').value) || 0;
  const rateMin   = parseFloat($('cfg_ratePerMin').value)  || 0;
  if (rateMin) localStorage.setItem('ptts_labor_rate_min', rateMin);
  if (rateHour) localStorage.setItem('ptts_labor_rate_hour', rateHour);
  if (rateDay)  localStorage.setItem('ptts_labor_rate_day', rateDay);
  localStorage.setItem('ptts_labor_hours_per_day', hrsPerDay);
  const procs = getLaborProcesses();
  localStorage.setItem('ptts_labor_processes', JSON.stringify(procs));
  _laborProcs = procs;
  calcLaborByProcess();
  calcAll();
  _checkLaborChanged();   // อัปเดตสถานะปุ่ม

  // Save to Google Sheet
  if (SCRIPT_URL) {
    const payload = {
      action: 'saveLaborConfig',
      ratePerMin: rateMin,
      ratePerDay: rateDay,
      hoursPerDay: hrsPerDay,
      processes: procs
    };
    fetch(SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    }).then(() => {
      Swal.fire({icon:'success', title:'บันทึกแล้ว ✅',
        html:`<small>อัตรา <b>฿${rateMin}/นาที</b> | ${procs.filter(p=>p.enabled).length} กระบวนการ<br>💾 บันทึกลง Sheet แล้ว</small>`,
        background:'#0a1c2e', color:'#f1f5f9', timer:2500, showConfirmButton:false, toast:true, position:'top-end'});
    }).catch(() => {
      Swal.fire({icon:'warning', title:'บันทึกในเครื่องแล้ว',
        html:`<small>⚠️ ไม่สามารถบันทึกลง Sheet ได้ (ตรวจสอบ Apps Script)</small>`,
        background:'#0a1c2e', color:'#f1f5f9', timer:2500, showConfirmButton:false, toast:true, position:'top-end'});
    });
  } else {
    Swal.fire({icon:'success', title:'บันทึกในเครื่องแล้ว ✅',
      html:`<small>อัตรา <b>฿${rateMin}/นาที</b> | ${procs.filter(p=>p.enabled).length} กระบวนการ</small>`,
      background:'#0a1c2e', color:'#f1f5f9', timer:2000, showConfirmButton:false, toast:true, position:'top-end'});
  }
}

function applyLaborNow() {
  const rateHour = parseFloat($('cfg_ratePerHour').value) || 0;
  const rateMin  = rateHour > 0 ? rateHour / 60 : (parseFloat($('cfg_ratePerMin').value) || 3);
  localStorage.setItem('ptts_labor_rate_min', rateMin);
  if (rateHour) localStorage.setItem('ptts_labor_rate_hour', rateHour);
  _laborProcs = getLaborProcesses();
  calcLaborByProcess();
  calcAll();
  _checkLaborChanged();   // อัปเดตสถานะปุ่ม
  Swal.fire({icon:'success',title:'คำนวณค่าแรงแล้ว ⚡',background:'#0a1c2e',color:'#f1f5f9',
    timer:1200,showConfirmButton:false,toast:true,position:'top-end'});
}

// ── Mold Management ──────────────────────────────────────────────
function renderMoldTable() {
  const wrap = $('moldTableWrap');
  if (!wrap) return;
  if (!SCRIPT_URL) {
    wrap.innerHTML = '<div style="text-align:center;padding:40px;color:#c9a85c;font-size:.85rem">⚠️ ยังไม่ตั้งค่า Script URL</div>';
    return;
  }
  if (_moldData.length === 0) {
    wrap.innerHTML = '<div style="text-align:center;padding:40px;color:#55536a;font-size:.85rem">ไม่มีข้อมูลแม่พิมพ์ — กด 🔄 โหลดใหม่</div>';
    return;
  }

  // Filter logic
  const q = ($('moldSearch') ? $('moldSearch').value.trim().toLowerCase() : '');
  const clearBtn = $('moldSearchClear');
  if (clearBtn) clearBtn.style.display = q ? '' : 'none';

  const filtered = q
    ? _moldData.map((m, i) => ({ m, i })).filter(({ m }) => {
        if (String(m.od).includes(q)) return true;
        return (m.ids || []).some(v => v.toLowerCase().includes(q));
      })
    : _moldData.map((m, i) => ({ m, i }));

  const info = $('moldFilterInfo');
  if (info) {
    info.textContent = q
      ? `พบ ${filtered.length} รายการจาก ${_moldData.length} ทั้งหมด`
      : '';
  }

  if (filtered.length === 0) {
    wrap.innerHTML = '<div style="text-align:center;padding:32px;color:#7c7a9a;font-size:.85rem">🔍 ไม่พบรายการที่ค้นหา</div>';
    return;
  }

  const rows = filtered.map(({ m, i }) => {
    const ids = (m.ids || []);
    const hasNoMold = ids.some(v => v.includes('ไม่มีพิมพ์'));
    const idBadges = ids.map(v => {
      const isMeta = isNaN(parseFloat(v));
      return `<span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:.76rem;font-weight:600;margin:2px;
        background:${isMeta ? '#fef3c7' : '#d1fae5'};
        border:1px solid ${isMeta ? '#fbbf24' : '#34d399'};
        color:${isMeta ? '#92400e' : '#065f46'}">${v}</span>`;
    }).join('');
    return `<div style="background:#fff;border:1px solid #e2e8f0;
      border-radius:11px;padding:12px 14px;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,.06)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:${ids.length ? '8px' : '0'}">
        <div style="background:#7c3aed;border-radius:8px;padding:4px 14px;
          font-size:.95rem;font-weight:700;color:#fff;min-width:72px;text-align:center">
          OD ${m.od}
        </div>
        <div style="flex:1;font-size:.75rem;color:#94a3b8">${ids.length} ID${ids.length !== 1 ? 's' : ''}</div>
        <button onclick="moldEdit(${i})" style="padding:5px 12px;border-radius:7px;border:1px solid #bfdbfe;
          background:#eff6ff;color:#1d4ed8;font-size:.78rem;cursor:pointer;font-family:Sarabun,sans-serif;font-weight:600">
          ✏️ แก้ไข
        </button>
        <button onclick="moldDelete(${i})" style="padding:5px 12px;border-radius:7px;border:1px solid #fecaca;
          background:#fff1f2;color:#dc2626;font-size:.78rem;cursor:pointer;font-family:Sarabun,sans-serif;font-weight:600">
          🗑️ ลบ
        </button>
      </div>
      ${ids.length ? '<div style="padding-left:2px">' + idBadges + '</div>' : '<div style="font-size:.75rem;color:#94a3b8;padding-left:2px">— ยังไม่มี ID</div>'}
    </div>`;
  }).join('');

  wrap.innerHTML = rows;
  if ($('moldTableStatus')) $('moldTableStatus').textContent = `${_moldData.length} รายการ`;
}

async function moldReload() {
  if (!SCRIPT_URL) {
    Swal.fire({icon:'warning',title:'ยังไม่ตั้งค่า URL',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#3b82f6'});
    return;
  }
  const st = $('moldTableStatus');
  if (st) st.textContent = '↻ กำลังโหลด…';
  try {
    const res = await fetch(SCRIPT_URL + '?action=getModl', {mode:'cors'}).then(r => r.json());
    if (res.status === 'ok') {
      _moldData = res.molds || [];
      renderMoldTable();
      checkMold(num('f_od'), num('f_id'));
    } else {
      if (st) st.textContent = '❌ ' + (res.message || 'ผิดพลาด');
    }
  } catch(e) {
    if (st) st.textContent = '❌ โหลดไม่สำเร็จ';
  }
}

function moldAdd() {
  Swal.fire({
    title: '➕ เพิ่ม OD ใหม่',
    html: `<div style="text-align:left">
      <label style="font-size:.8rem;color:#8b8aaa;display:block;margin-bottom:4px">OD (mm) *</label>
      <input id="swal_od" type="number" step="0.01" placeholder="เช่น 63.5"
        style="width:100%;padding:9px 12px;background:rgba(20,20,32,.9);border:1px solid rgba(255,255,255,.15);
        border-radius:8px;color:#d4cfe8;font-family:Sarabun,sans-serif;font-size:.9rem;margin-bottom:12px">
      <label style="font-size:.8rem;color:#8b8aaa;display:block;margin-bottom:4px">ID ที่มี (คั่นด้วย , เช่น 30,45,50)</label>
      <input id="swal_ids" type="text" placeholder="เช่น 30, 45, 50 หรือ ไม่มีพิมพ์"
        style="width:100%;padding:9px 12px;background:rgba(20,20,32,.9);border:1px solid rgba(255,255,255,.15);
        border-radius:8px;color:#d4cfe8;font-family:Sarabun,sans-serif;font-size:.9rem">
    </div>`,
    background:'#0d1b2a', color:'#cce4ff',
    confirmButtonText:'💾 บันทึก', confirmButtonColor:'#1d65cc',
    showCancelButton:true, cancelButtonText:'ยกเลิก', cancelButtonColor:'#374151',
    focusConfirm:false,
    preConfirm: () => {
      const od = parseFloat(document.getElementById('swal_od').value);
      if (!od) { Swal.showValidationMessage('กรุณากรอก OD'); return false; }
      if (_moldData.some(m => m.od === od)) { Swal.showValidationMessage('OD ' + od + ' มีอยู่แล้ว'); return false; }
      const idsRaw = document.getElementById('swal_ids').value;
      const ids = idsRaw.split(',').map(v => v.trim()).filter(Boolean);
      return { od, ids };
    }
  }).then(async r => {
    if (!r.isConfirmed) return;
    const { od, ids } = r.value;
    await moldSaveNew(od, ids);
  });
}

async function moldSaveNew(od, ids) {
  try {
    const payload = { action: 'addMold', od, ids };
    await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    _moldData.push({ od, ids });
    _moldData.sort((a,b) => a.od - b.od);
    renderMoldTable();
    checkMold(num('f_od'), num('f_id'));
    Swal.fire({icon:'success',title:`เพิ่ม OD ${od} แล้ว ✅`,
      background:'#0d1b2a',color:'#cce4ff',timer:1800,showConfirmButton:false,
      toast:true,position:'top-end'});
  } catch(e) {
    Swal.fire({icon:'error',title:'บันทึกไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#3b82f6'});
  }
}

function moldEdit(idx) {
  const m = _moldData[idx];
  if (!m) return;
  Swal.fire({
    title: `✏️ แก้ไข OD ${m.od}`,
    html: `<div style="text-align:left">
      <label style="font-size:.8rem;color:#8b8aaa;display:block;margin-bottom:4px">OD (mm) — ไม่สามารถเปลี่ยนได้</label>
      <input type="text" value="${m.od}" disabled
        style="width:100%;padding:9px 12px;background:rgba(90,82,184,.08);border:1px solid rgba(90,82,184,.2);
        border-radius:8px;color:#9b8fff;font-family:Sarabun,sans-serif;font-size:.9rem;margin-bottom:12px">
      <label style="font-size:.8rem;color:#8b8aaa;display:block;margin-bottom:4px">ID ที่มี (คั่นด้วย , )</label>
      <input id="swal_edit_ids" type="text" value="${(m.ids||[]).join(', ')}"
        style="width:100%;padding:9px 12px;background:rgba(20,20,32,.9);border:1px solid rgba(255,255,255,.15);
        border-radius:8px;color:#d4cfe8;font-family:Sarabun,sans-serif;font-size:.9rem">
      <div style="font-size:.72rem;color:#7c7a9a;margin-top:6px">ใส่ "ไม่มีพิมพ์" เพื่อทำเครื่องหมายว่ายังไม่มีแม่พิมพ์</div>
    </div>`,
    background:'#0d1b2a', color:'#cce4ff',
    confirmButtonText:'💾 บันทึก', confirmButtonColor:'#1d65cc',
    showCancelButton:true, cancelButtonText:'ยกเลิก', cancelButtonColor:'#374151',
    focusConfirm:false,
    preConfirm: () => {
      const idsRaw = document.getElementById('swal_edit_ids').value;
      return idsRaw.split(',').map(v => v.trim()).filter(Boolean);
    }
  }).then(async r => {
    if (!r.isConfirmed) return;
    const newIds = r.value;
    try {
      const payload = { action: 'updateMold', od: m.od, ids: newIds };
      await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
        headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      _moldData[idx].ids = newIds;
      renderMoldTable();
      checkMold(num('f_od'), num('f_id'));
      Swal.fire({icon:'success',title:`อัปเดต OD ${m.od} แล้ว ✅`,
        background:'#0d1b2a',color:'#cce4ff',timer:1800,showConfirmButton:false,
        toast:true,position:'top-end'});
    } catch(e) {
      Swal.fire({icon:'error',title:'บันทึกไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#3b82f6'});
    }
  });
}

function moldDelete(idx) {
  const m = _moldData[idx];
  if (!m) return;
  Swal.fire({
    icon:'warning',
    title: `ลบ OD ${m.od}?`,
    html: `<div style="font-size:.85rem;color:#8b8aaa">ID ที่มี: <b style="color:#d4cfe8">${(m.ids||[]).join(', ') || '—'}</b><br>การลบนี้ไม่สามารถย้อนกลับได้</div>`,
    background:'#0d1b2a', color:'#cce4ff',
    confirmButtonText:'🗑️ ลบเลย', confirmButtonColor:'#c0464a',
    showCancelButton:true, cancelButtonText:'ยกเลิก', cancelButtonColor:'#374151',
  }).then(async r => {
    if (!r.isConfirmed) return;
    try {
      const payload = { action: 'deleteMold', od: m.od };
      await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
        headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      _moldData.splice(idx, 1);
      renderMoldTable();
      checkMold(num('f_od'), num('f_id'));
      Swal.fire({icon:'success',title:`ลบ OD ${m.od} แล้ว`,
        background:'#0d1b2a',color:'#cce4ff',timer:1600,showConfirmButton:false,
        toast:true,position:'top-end'});
    } catch(e) {
      Swal.fire({icon:'error',title:'ลบไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#3b82f6'});
    }
  });
}


// ── ใบตรวจสอบแม่พิมพ์ ─────────────────────────────────────────
function moldPrintCheckSheet() {
  if (!_moldData || !_moldData.length) {
    Swal.fire({ icon:'warning', title:'ยังไม่มีข้อมูล', text:'กรุณากด 🔄 โหลดใหม่ ก่อนพิมพ์ใบตรวจสอบ',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#3b82f6' });
    return;
  }

  var today = new Date();
  var dd   = String(today.getDate()).padStart(2,'0');
  var mm   = String(today.getMonth()+1).padStart(2,'0');
  var yyyy = today.getFullYear() + 543;
  var dateStr = dd + '/' + mm + '/' + yyyy;

  // สีพื้นหลังสลับกลุ่ม
  var groupColors = ['#f8f9fb', '#ffffff'];

  var seq = 0;
  var rowsHtml = '';

  _moldData.forEach(function(m, gi) {
    var ids = (m.ids && m.ids.length) ? m.ids : ['—'];
    var bg  = groupColors[gi % 2];

    ids.forEach(function(idVal, ii) {
      var isFirst   = ii === 0;
      var isNoMold  = idVal === '—' || idVal.includes('ไม่มีพิมพ์');
      var checkCell = isNoMold
        ? '<td style="text-align:center;font-size:.85rem;color:#94a3b8">—</td>'
        : '<td style="text-align:center"><span style="display:inline-block;width:14px;height:14px;border:1.5px solid #94a3b8;border-radius:3px"></span></td>';

      var odCell = isFirst
        ? '<td style="padding:7px 10px;font-weight:700;font-size:.82rem;color:#1e3a5f;' +
          'border-right:2px solid #e2e8f0;vertical-align:top;white-space:nowrap">' + m.od + '</td>'
        : '<td style="border-right:2px solid #e2e8f0"></td>';

      var idCell = isNoMold
        ? '<td style="padding:7px 10px;font-size:.75rem;color:#94a3b8;font-style:italic">ไม่มีพิมพ์</td>'
        : '<td style="padding:7px 10px;font-size:.82rem;color:#334155;font-weight:600">' + idVal + '</td>';

      var statusCell = isFirst
        ? '<td style="padding:7px 10px;font-size:.7rem;color:#64748b;white-space:nowrap">ดี &nbsp;/&nbsp; ชำรุด &nbsp;/&nbsp; สูญหาย</td>'
        : '<td></td>';

      seq++;
      rowsHtml +=
        '<tr style="background:' + bg + ';border-bottom:1px solid #e2e8f0">' +
          '<td style="padding:7px 8px;text-align:center;font-size:.7rem;color:#94a3b8">' + seq + '</td>' +
          odCell +
          idCell +
          checkCell +
          statusCell +
          '<td style="padding:7px 10px;border-bottom:1px solid #cbd5e1;min-width:70px"></td>' +
          '<td style="padding:7px 10px;border-bottom:1px solid #cbd5e1;min-width:120px"></td>' +
        '</tr>';
    });
  });

  var html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<style>' +
    'body{font-family:Sarabun,sans-serif;font-size:13px;color:#1e293b;margin:0;padding:0}' +
    '@page{size:A4 landscape;margin:12mm 14mm}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#1e3a5f;color:#fff;padding:8px 10px;font-size:.72rem;font-weight:700;white-space:nowrap}' +
    '.header-box{display:flex;justify-content:space-between;align-items:flex-start;' +
      'border-bottom:2px solid #1e3a5f;padding-bottom:10px;margin-bottom:14px}' +
    '.title{font-size:1.05rem;font-weight:900;color:#1e3a5f}' +
    '.sub{font-size:.72rem;color:#64748b;margin-top:3px}' +
    '.sign-row{display:flex;gap:32px;margin-top:20px}' +
    '.sign-box{flex:1;border-top:1.5px solid #334155;padding-top:6px;text-align:center;' +
      'font-size:.75rem;color:#475569}' +
    '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}' +
    '</style></head><body>' +

    '<div class="header-box">' +
      '<div>' +
        '<div class="title">🔩 ใบตรวจสอบแม่พิมพ์</div>' +
        '<div class="sub">PTTS Cost Breakdown — Mold Inspection Check Sheet</div>' +
      '</div>' +
      '<div style="text-align:right;font-size:.78rem">' +
        '<div style="color:#64748b">วันที่ตรวจสอบ</div>' +
        '<div style="font-size:.95rem;font-weight:900;color:#1e3a5f">' + dateStr + '</div>' +
        '<div style="margin-top:4px;color:#64748b;font-size:.7rem">รอบตรวจ: _______________</div>' +
      '</div>' +
    '</div>' +

    '<table>' +
      '<thead><tr>' +
        '<th style="width:28px;text-align:center">#</th>' +
        '<th style="width:70px">OD (mm)</th>' +
        '<th style="width:70px">ID (mm)</th>' +
        '<th style="width:52px;text-align:center">มีจริง ✓</th>' +
        '<th style="width:150px">สภาพ</th>' +
        '<th style="width:90px">ที่เก็บ</th>' +
        '<th>หมายเหตุ</th>' +
      '</tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
    '</table>' +

    '<div class="sign-row">' +
      '<div class="sign-box">ผู้ตรวจสอบ<br><br><br></div>' +
      '<div class="sign-box">ผู้ควบคุมการผลิต<br><br><br></div>' +
      '<div class="sign-box">วันที่: _____ / _____ / _____<br><br></div>' +
    '</div>' +

    '<script>(function(){' +
      'function go(){try{window.focus();window.print();}catch(e){}}' +
      'if(document.fonts&&document.fonts.ready){document.fonts.ready.then(go).catch(function(){setTimeout(go,700);});}' +
      'else{setTimeout(go,700);}' +
    '})();<\/script>' +
    '</body></html>';

  var win = window.open('', '_blank');
  if (!win) {
    Swal.fire({ icon:'warning', title:'Popup ถูกบล็อก', text:'กรุณาอนุญาต popup แล้วลองใหม่',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#3b82f6' });
    return;
  }
  win.document.write(html);
  win.document.close();
}
