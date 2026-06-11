// ══════════════════════════════════════════════════════
// DATA TAB  — ประวัติใบเสนอราคา
// ══════════════════════════════════════════════════════
let _dtCache   = [];          // full rows fetched from sheet
let _dtFilter  = '';          // status filter ('all' | status string)
let _dtSortCol = 'noQuo';    // default sort: Quo No.
let _dtSortDir = -1;          // -1 = desc, 1 = asc
let _dtPage    = 0;           // current page (0-based)
const DT_PAGE_SIZE = 50;      // rows per page

// Column indices (0-based, matching the save order in submitForm)
const DT = {
  status:   0,  // A
  noQuo:    1,  // B
  date:     2,  // C
  od:       3,  // D
  id:       4,  // E
  h:        5,  // F
  unit:     6,  // G
  size:     7,  // H
  workType: 8,  // I
  matTop:   9,  costTop:  10,
  matBot:  11,  costBot:  12,
  testWasteLabel: 13, cTestWaste: 14,
  outsource: 15, cOutsource: 16,
  meshOut:  17,  cMeshOut:  18,
  meshIn:   19,  cMeshIn:   20,
  laser:    21,  cLaser:    22,
  plating:  23,  cPlating:  24,
  mold:     25,  cMold:     26,
  workdays: 27,  cLabor:    28,            // AC = ค่าแรงรวม (workdays × rate)
  transport:29,  cTransport:30,
  machine:  31,  cMachine:  32,
  other1:   33,  cOther1:   34,
  other2:   35,  cOther2:   36,
  other3:   37,  cOther3:   38,
  fixedCost:39,
  totalCost:40,  // AO
  sellPrice:41,  // AP
  profitUnit:42, // AQ = กำไร/ลูก
  profitJob: 43, // AR = กำไร/JOB
  gapWeld:  44,   // AS = ช่องว่างใส่จีบ
  contact:  45,  // AT
  remark:   46,  // AU
  quoter:   47,  // AV
  rawMat:   48,  // AW
  // AX=49, AY=50, AZ=51, BA=52 — reserved / empty
  refId:    53,  // BB = เลขอ้างอิง (Q-YYYYMMDD-XXXX)
  // ── ODฝา2 (BC-BF = index 54-57) ──────────────────────
  od2:      54,  // BC = OD ฝา2 (mm)
  matOd2:   55,  // BD = MAT ฝา2 code
  costOd2:  56,  // BE = cost ฝา2 / ลูก
  calcOd2:  57,  // BF = 1=คำนวณ, 0=ไม่คำนวณ
  aiSale:   58,  // BG = ผลวิเคราะห์ AI เคาะราคา
  rev:      59   // BH = Rev. (เลขแก้ไข เริ่มที่ 1, +1 ทุกครั้งที่บันทึกทับแถวเดิม)
};

async function dtRefresh(showMsg) {
  if (!SCRIPT_URL) {
    dtShowEmpty('⚠️ ยังไม่ได้ตั้งค่า Script URL — ไปที่แท็บ API Keys');
    return;
  }
  const limit = showMsg ? 0 : 200;  // รีเฟรชปกติ = 200, กด "โหลดทั้งหมด" = 0
  dtShowEmpty(`↻ กำลังโหลด${limit > 0 ? ' ' + limit + ' รายการล่าสุด' : 'ทั้งหมด'}…`);
  try {
    const url = SCRIPT_URL + '?action=getCosts&limit=' + limit;  // limit=0 = ทั้งหมด
    const res  = await fetch(url, {mode:'cors'});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(data.message || 'ข้อผิดพลาดจาก server');
    _dtCache = Array.isArray(data.rows) ? data.rows : [];
    _dtPage  = 0;
    // ตั้ง baseline "เห็นแล้ว" ครั้งแรก — ไม่ให้ของเก่าทั้งหมดขึ้น NEW พร้อมกัน
    _initSeenIfEmpty(SEEN_KEY_DATA, _dtCache.map(r => r[DT.noQuo]));
    computeNextNo();
    const odNow = ($('f_od') && $('f_od').value) ? $('f_od').value : '';
    // auto-fill search เฉพาะตอนโหลดปกติ (ไม่ใช่ "โหลดทั้งหมด") และ search ว่างอยู่
    if (!showMsg && odNow && !$('dtSearch').value) $('dtSearch').value = odNow;
    _dtFilter = 'all';
    dtRender();
    // อัปเดต pricing insight หลังโหลดข้อมูลใหม่
    _updatePricingInsight();
    // แสดง banner ถ้าโหลดแบบ limited
    renderDtLoadBanner(data.total || _dtCache.length, data.limited);
    if (showMsg) Swal.fire({icon:'success',title:'โหลดข้อมูลสำเร็จ ✅',
      text:`พบ ${_dtCache.length} รายการ`,timer:1500,showConfirmButton:false,
      background:'#0a1c2e',color:'#f1f5f9'});
  } catch(e) {
    dtShowEmpty('❌ โหลดไม่สำเร็จ: ' + e.message);
  }
}

function renderDtLoadBanner(total, limited) {
  const el = $('dtLoadBanner');
  if (!el) return;
  if (limited) {
    el.innerHTML = `<span style="color:#f59e0b;font-size:.75rem">
      ⚡ แสดง 200 รายการล่าสุด จากทั้งหมด ${total.toLocaleString()} รายการ &nbsp;
      <button onclick="loadDtData(true)" style="padding:3px 10px;border-radius:6px;cursor:pointer;
        font-family:Sarabun,sans-serif;font-size:.72rem;border:1px solid #f59e0b;
        background:rgba(245,158,11,.15);color:#f59e0b">
        📂 โหลดทั้งหมด ${total.toLocaleString()} รายการ
      </button></span>`;
  } else {
    el.innerHTML = '';
  }
}

function computeNextNo() {
  // หาค่า max ของ No.Quo จาก _dtCache แล้ว +1
  // ค่าใน column B อาจเป็น "Q-3890" หรือ "3890"
  if (!_dtCache.length) return;
  let max = 0;
  _dtCache.forEach(r => {
    const raw = String(r[DT.noQuo] || '').replace(/^Q-/i, '');
    const n   = parseInt(raw, 10);
    if (!isNaN(n) && n > max) max = n;
  });
  if (max > 0) {
    const el = $('f_noQuo');
    // อัปเดตเฉพาะถ้าไม่ได้โหลด job เก่าอยู่ (ไม่มี _loadedNoQuo)
    if (el && !_loadedNoQuo) el.value = max + 1;
  }
}

function dtShowEmpty(msg) {
  const b = $('dtBody');
  if (b) b.innerHTML = `<tr><td colspan="9" style="padding:40px;text-align:center;color:var(--t3);font-size:.8rem">${msg}</td></tr>`;
  if ($('dtCount')) $('dtCount').textContent = '';
  if ($('dtSubtitle')) $('dtSubtitle').textContent = msg;
}

function dtToggleExactSizeFilter() {
  const cb = $('adv_exact_size');
  if (!cb) return;
  const od = parseFloat($('f_od')?.value) || 0;
  const id_ = parseFloat($('f_id')?.value) || 0;
  const h  = parseFloat($('f_h')?.value) || 0;
  if (cb.checked && !od && !id_ && !h) {
    cb.checked = false;
    Swal.fire({icon:'info', title:'กรุณากรอก OD / ID / H ก่อน',
      text:'กรอกขนาดงานในแท็บฟอร์มหลักก่อน แล้วกลับมาติ๊กตัวกรองนี้',
      timer:2500, showConfirmButton:false, background:'#0a1c2e', color:'#f1f5f9'});
    return;
  }
  _dtPage = 0; dtRender();
}

function dtToggleOdFilter() {
  const cb  = $('dtOdFilter');
  const lbl = $('dtOdFilterLabel');
  const odNow = $('f_od') ? String($('f_od').value||'').trim() : '';
  if (cb && cb.checked && !odNow) {
    cb.checked = false;
    Swal.fire({icon:'info', title:'กรุณากรอก OD ก่อน',
      text:'กรอก OD ในแท็บฟอร์มหลักก่อน แล้วกลับมาติ๊กตัวกรองนี้',
      timer:2500, showConfirmButton:false, background:'#0a1c2e', color:'#f1f5f9'});
    return;
  }
  if (cb && cb.checked && odNow) {
    if (lbl) lbl.textContent = `(OD ${odNow})`;
  } else {
    if (lbl) lbl.textContent = odNow ? `(OD ${odNow})` : '';
  }
  dtRender();
}

function dtRender() {
  const search = ($('dtSearch') ? $('dtSearch').value : '').toLowerCase().trim();
  const odCb  = $('dtOdFilter');
  const odNow = $('f_od') ? String($('f_od').value||'').trim() : '';
  // update OD label
  const lbl = $('dtOdFilterLabel');
  if (lbl && odNow) lbl.textContent = `(OD ${odNow})`;

  const adv = _getAdvFilters();
  const advActive = _countAdvActive(adv);
  // update adv active badge
  const advCount = $('dtAdvActiveCount');
  const advClearBtn = $('dtAdvClearBtn');
  if (advCount) { advCount.style.display = advActive ? '' : 'none'; advCount.textContent = advActive; }
  if (advClearBtn) advClearBtn.style.display = advActive ? '' : 'none';

  const rows = _dtCache.filter(r => {
    if (!Array.isArray(r)) return false;
    // status filter
    if (_dtFilter && _dtFilter !== 'all') {
      if ((r[DT.status]||'').toLowerCase() !== _dtFilter.toLowerCase()) return false;
    }
    // OD checkbox filter (numeric comparison)
    if (odCb && odCb.checked && odNow) {
      if (Math.abs((parseFloat(r[DT.od])||0) - parseFloat(odNow)) > 0.01) return false;
    }
    // text search across key fields
    if (search) {
      const hay = [
        r[DT.noQuo], r[DT.od], r[DT.id], r[DT.h],
        r[DT.workType], r[DT.remark], r[DT.contact],
        `${r[DT.od]}×${r[DT.id]}×${r[DT.h]}`,
        r[DT.matOd2], String(Math.abs(parseFloat(r[DT.od2])||0)||'')
      ].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    // ── Advanced filters ──
    if (advActive) {
      const od = parseFloat(r[DT.od]) || 0;
      if (adv.odMin !== null && od < adv.odMin) return false;
      if (adv.odMax !== null && od > adv.odMax) return false;
      const sp = parseFloat(r[DT.sellPrice]) || 0;
      if (adv.priceMin !== null && sp < adv.priceMin) return false;
      if (adv.priceMax !== null && sp > adv.priceMax) return false;
      if (adv.matFlap) {
        const f = [(r[DT.matTop]||'').toLowerCase(),(r[DT.matBot]||'').toLowerCase()].join(' ');
        if (!f.includes(adv.matFlap)) return false;
      }
      if (adv.matMesh) {
        const m = [(r[DT.meshOut]||'').toLowerCase(),(r[DT.meshIn]||'').toLowerCase()].join(' ');
        if (!m.includes(adv.matMesh)) return false;
      }
      if (adv.workType && !(r[DT.workType]||'').toLowerCase().includes(adv.workType)) return false;
      if (adv.status && (r[DT.status]||'').trim() !== adv.status) return false;
      if (adv.exactSize) {
        // กรองตาม OD×ID×H ที่มีค่า (numeric, tolerance 0.01)
        if (adv._od > 0 && Math.abs((parseFloat(r[DT.od])||0) - adv._od) > 0.01) return false;
        if (adv._id > 0 && Math.abs((parseFloat(r[DT.id])||0) - adv._id) > 0.01) return false;
        if (adv._h  > 0 && Math.abs((parseFloat(r[DT.h] )||0) - adv._h)  > 0.01) return false;
      }
      if (adv.dateFrom || adv.dateTo) {
        const iso = _toIso(r[DT.date]);
        if (adv.dateFrom && iso < adv.dateFrom) return false;
        if (adv.dateTo   && iso > adv.dateTo)   return false;
      }
    }
    return true;
  });

  // ── sort ──────────────────────────────────────────────
  rows.sort((a, b) => {
    let av = a[DT[_dtSortCol] ?? 0];
    let bv = b[DT[_dtSortCol] ?? 0];
    if (_dtSortCol === 'noQuo') {
      av = parseInt(String(av||'').replace(/\D/g,'')) || 0;
      bv = parseInt(String(bv||'').replace(/\D/g,'')) || 0;
    } else if (_dtSortCol === 'date') {
      // expect "DD/MM/YYYY" or ISO
      const toTs = s => {
        if (!s) return 0;
        const p = String(s).split('/');
        return p.length === 3 ? new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime() || 0 : new Date(s).getTime() || 0;
      };
      av = toTs(av); bv = toTs(bv);
    } else {
      av = parseFloat(av) || 0;
      bv = parseFloat(bv) || 0;
    }
    return (av - bv) * _dtSortDir;
  });
  // update sort indicators in thead
  ['noQuo','date','unit','totalCost','sellPrice'].forEach(col => {
    const el = $(`dts_${col}`);
    if (!el) return;
    if (col === _dtSortCol) el.textContent = _dtSortDir === -1 ? '▼' : '▲';
    else el.textContent = '';
  });

  // update subtitle & count
  if ($('dtSubtitle')) $('dtSubtitle').textContent =
    `ประมวลผลประวัติข้อมูล ${_dtCache.length} จ็อบ · กรองแล้ว: ${rows.length} รายการ`;
  if ($('dtCount')) $('dtCount').textContent =
    `แสดงผลลัพธ์ ${rows.length} รายการที่ตรงเป้า`;

  // status chips
  dtRenderChips();

  const fmtB = v => {
    const n = parseFloat(v) || 0;
    return n.toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:0});
  };
  const statusBadge = s => {
    const map = { 'อนุมัติ':'#22c55e','ผ่าน':'#60a5fa','รอสรุป':'#f59e0b','ยกเลิก':'#f87171','':'#64748b' };
    const col = map[s] || '#64748b';
    return `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:.65rem;font-weight:600;
      background:${col}22;color:${col};border:1px solid ${col}55">${s||'—'}</span>`;
  };

  const tbody = $('dtBody');
  if (!tbody) return;
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" style="padding:32px;text-align:center;color:var(--t3);font-size:.8rem">
      ไม่พบข้อมูลที่ตรงกัน</td></tr>`;
    renderDtPagination(0, 0);
    return;
  }

  // clamp page
  const totalPages = Math.ceil(rows.length / DT_PAGE_SIZE);
  if (_dtPage >= totalPages) _dtPage = totalPages - 1;
  const pageRows = rows.slice(_dtPage * DT_PAGE_SIZE, (_dtPage + 1) * DT_PAGE_SIZE);

  tbody.innerHTML = pageRows.map((r, ri) => {
    const globalIdx = _dtPage * DT_PAGE_SIZE + ri;
    const od = r[DT.od]||'', id2 = r[DT.id]||'', h = r[DT.h]||'';
    const od2r = parseFloat(r[DT.od2]) || 0;
    const size = od && id2 && h
      ? (od2r > 0 ? `${od2r}/${od}×${id2}×${h}` : `${od}×${id2}×${h}`)
      : (r[DT.size]||'—');
    const tc   = parseFloat(r[DT.totalCost]) || 0;
    const sp   = parseFloat(r[DT.sellPrice]) || 0;
    const prof = sp - tc;
    const profCol = prof >= 0 ? '#34d399' : '#f87171';
    const profSign = prof >= 0 ? '+' : '';
    const workNote = [r[DT.workType], r[DT.remark]].filter(Boolean).join(' · ');
    // ไฮไลต์แถวที่ใช้วัตถุดิบสแตนเลส/SUS304 (AW) เพราะราคาสูงเป็นพิเศษ
    const rawMatStr = String(r[DT.rawMat]||'').toUpperCase();
    const isStainless = rawMatStr.includes('สแตนเลส') || rawMatStr.includes('SUS');
    const rowBg = isStainless
      ? 'background:rgba(250,204,21,.16);border-left:3px solid #facc15'
      : (ri % 2 === 0 ? '' : 'background:var(--pair-bg)');
    const hasAiSale = !!String(r[DT.aiSale]||'').trim();
    const isNewRow = _isNewItem(SEEN_KEY_DATA, r[DT.noQuo]);
    return `<tr style="${rowBg};border-bottom:1px solid var(--bc-div)" class="dt-row">
      <td style="padding:8px 10px;white-space:nowrap">${statusBadge(r[DT.status])}<br>
        <span style="display:inline-flex;align-items:center;gap:4px"><span style="font-size:.72rem;color:var(--c1);font-weight:600">${r[DT.noQuo]||'—'}</span>${hasAiSale ? ' <span title="มีผลวิเคราะห์ AI เคาะราคาแนบไว้" style="font-size:.75rem">🤖</span>' : ''}${_newBadge(isNewRow)}</span></td>
      <td style="padding:8px 10px;font-size:.72rem;color:var(--t3);white-space:nowrap">${r[DT.date]||'—'}</td>
      <td style="padding:8px 10px;font-size:.78rem;color:var(--t1);font-weight:600;white-space:nowrap">${size} <span style="color:var(--t3);font-size:.65rem">มม.</span></td>
      <td style="padding:8px 10px;font-size:.72rem;white-space:nowrap">${r[DT.matTop]  ? `<span style="background:rgba(59,130,246,.18);color:#111;border-radius:5px;padding:1px 7px;font-weight:600">${r[DT.matTop]}</span>`  : '<span style="color:var(--t3)">—</span>'}</td>
      <td style="padding:8px 10px;font-size:.72rem;white-space:nowrap">${r[DT.matBot]  ? `<span style="background:rgba(59,130,246,.18);color:#111;border-radius:5px;padding:1px 7px;font-weight:600">${r[DT.matBot]}</span>`  : '<span style="color:var(--t3)">—</span>'}</td>
      <td style="padding:8px 10px;font-size:.72rem;white-space:nowrap">${r[DT.meshOut] ? `<span style="background:rgba(74,222,128,.22);color:#111;border-radius:5px;padding:1px 7px;font-weight:600">${r[DT.meshOut]}</span>` : '<span style="color:var(--t3)">—</span>'}</td>
      <td style="padding:8px 10px;font-size:.72rem;white-space:nowrap">${r[DT.meshIn]  ? `<span style="background:rgba(74,222,128,.22);color:#111;border-radius:5px;padding:1px 7px;font-weight:600">${r[DT.meshIn]}</span>`  : '<span style="color:var(--t3)">—</span>'}</td>
      <td style="padding:8px 10px;text-align:center;font-size:.8rem;color:var(--t1)">${r[DT.unit]||'—'}</td>
      <td style="padding:8px 10px;text-align:right;font-size:.78rem;color:var(--c1);font-weight:600">${fmtB(tc)} <span style="font-size:.65rem">฿</span></td>
      <td style="padding:8px 10px;text-align:right;font-size:.78rem;font-weight:600;color:${(sp>0&&tc>0&&sp<tc)?'#f87171':'var(--t1)'}">${fmtB(sp)} <span style="font-size:.65rem">฿</span></td>
      <td style="padding:8px 10px;font-size:.72rem;color:var(--t2);max-width:160px">${workNote||'—'}</td>
      <td style="padding:8px 10px;text-align:center;white-space:nowrap">
        <button onclick="dtLoadIntoForm(${globalIdx})"
          style="padding:5px 10px;border-radius:7px;border:none;background:#16a34a;color:#fff;
                 font-size:.7rem;cursor:pointer;font-family:Sarabun,sans-serif;margin:1px">
          📂 โหลดจ็อบนี้
        </button>
        <button onclick="dtShowSpecSheet(${globalIdx})"
          style="padding:5px 10px;border-radius:7px;border:none;background:#2563eb;color:#fff;
                 font-size:.7rem;cursor:pointer;font-family:Sarabun,sans-serif;margin:1px">
          📋 สเปค
        </button>
        ${(r[DT.status]||'') === 'รอสรุป' ? `
        <button onclick="dtAddOrder(${globalIdx})"
          style="padding:5px 10px;border-radius:7px;border:none;background:#f59e0b;color:#1a1200;
                 font-size:.7rem;cursor:pointer;font-family:Sarabun,sans-serif;margin:1px;font-weight:700">
          📦 Order
        </button>` : ''}
        <button onclick="dtDelete('${String(r[DT.noQuo]||'').replace(/'/g,"\\'")}',this)"
          style="padding:5px 8px;border-radius:7px;border:1px solid rgba(248,113,113,.35);
                 background:rgba(248,113,113,.1);color:#f87171;font-size:.7rem;cursor:pointer;margin:1px">
          🗑️
        </button>
      </td>
    </tr>`;
  }).join('');

  // store filtered rows on tbody for dtLoadIntoForm index lookup
  tbody._filteredRows = rows;

  renderDtPagination(totalPages, rows.length);
}

function renderDtPagination(totalPages, total) {
  const el = $('dtPagination');
  if (!el) return;
  if (totalPages <= 1) { el.innerHTML = ''; return; }

  const btnStyle = (active) =>
    `padding:5px 10px;border-radius:7px;cursor:pointer;font-family:Sarabun,sans-serif;font-size:.75rem;
     border:1px solid var(--bc-div);
     background:${active ? 'var(--c1)' : 'var(--bg-input)'};
     color:${active ? '#fff' : 'var(--t2)'};`;

  const start = _dtPage * DT_PAGE_SIZE + 1;
  const end   = Math.min((_dtPage + 1) * DT_PAGE_SIZE, total);

  let html = `<span style="font-size:.72rem;color:var(--t3);margin-right:4px">
    แสดง ${start}–${end} จาก ${total} รายการ</span>`;

  html += `<button onclick="dtGoPage(0)" style="${btnStyle(false)}" ${_dtPage===0?'disabled':''}>«</button>`;
  html += `<button onclick="dtGoPage(${_dtPage-1})" style="${btnStyle(false)}" ${_dtPage===0?'disabled':''}>‹</button>`;

  // show window of pages around current
  const win = 2;
  for (let p = Math.max(0, _dtPage-win); p <= Math.min(totalPages-1, _dtPage+win); p++) {
    html += `<button onclick="dtGoPage(${p})" style="${btnStyle(p===_dtPage)}">${p+1}</button>`;
  }

  html += `<button onclick="dtGoPage(${_dtPage+1})" style="${btnStyle(false)}" ${_dtPage>=totalPages-1?'disabled':''}>›</button>`;
  html += `<button onclick="dtGoPage(${totalPages-1})" style="${btnStyle(false)}" ${_dtPage>=totalPages-1?'disabled':''}>»</button>`;

  el.innerHTML = html;
}

function dtGoPage(p) {
  _dtPage = p;
  dtRender();
  // scroll table into view
  const tb = $('dtBody');
  if (tb) tb.closest('div')?.scrollIntoView({behavior:'smooth', block:'start'});
}

// ── เลขอ้างอิง (BB) ─────────────────────────────────────
function generateRefId() {
  const now   = new Date();
  const ymd   = now.getFullYear().toString() +
                String(now.getMonth()+1).padStart(2,'0') +
                String(now.getDate()).padStart(2,'0');
  const rand  = String(Math.floor(1000 + Math.random() * 9000));
  return `Q-${ymd}-${rand}`;
}
function initRefId() {
  const el = $('f_refId');
  if (!el) return;
  if (!el.value) el.value = generateRefId();
}

function dtSort(col) {
  if (_dtSortCol === col) {
    _dtSortDir = _dtSortDir * -1;   // toggle
  } else {
    _dtSortCol = col;
    _dtSortDir = -1;                // new column → start descending
  }
  dtRender();
}

function dtRenderChips() {
  const el = $('dtStatusChips');
  if (!el) return;
  const counts = { 'all': _dtCache.length };
  _dtCache.forEach(r => {
    const s = (Array.isArray(r) ? r[DT.status] : '') || '';
    counts[s] = (counts[s] || 0) + 1;
  });
  const defs = [
    { key:'all',    label:'ทั้งหมด',    col:'#a5b4fc' },
    { key:'อนุมัติ', label:'อนุมัติแล้ว', col:'#22c55e' },
    { key:'ผ่าน',    label:'ผ่าน',        col:'#60a5fa' },
    { key:'รอสรุป',  label:'รอสรุป',      col:'#f59e0b' },
    { key:'ยกเลิก',  label:'ยกเลิก',      col:'#f87171' },
  ];
  el.innerHTML = defs.filter(d => counts[d.key] > 0).map(d => {
    const active = _dtFilter === d.key;
    return `<button onclick="_dtFilter='${d.key}';_dtPage=0;dtRender()"
      style="padding:4px 10px;border-radius:20px;font-size:.7rem;cursor:pointer;font-family:Sarabun,sans-serif;
             border:1px solid ${d.col}55;
             background:${active ? d.col+'33' : 'var(--bg-card)'};
             color:${active ? d.col : 'var(--t3)'};font-weight:${active?'700':'400'}">
      ${d.label} (${counts[d.key]||0})
    </button>`;
  }).join('');
}

function dtClearSearch() {
  if ($('dtSearch')) { $('dtSearch').value = ''; _dtPage = 0; dtRender(); }
}

// ── Advanced Search ──────────────────────────────────
function dtToggleAdvSearch() {
  const p = $('dtAdvPanel');
  if (!p) return;
  const open = p.style.display !== 'block';
  p.style.display = open ? 'block' : 'none';
  const lbl = $('dtAdvSearchLabel');
  if (lbl) lbl.textContent = open ? 'ปิดค้นหาละเอียด' : 'ค้นหาละเอียด';
}

function loadDtData(all) { dtRefresh(all); }

function dtClearAdv() {
  ['adv_od_min','adv_od_max','adv_date_from','adv_date_to',
   'adv_price_min','adv_price_max','adv_mat_flap','adv_mat_mesh','adv_worktype','adv_status']
    .forEach(id => { const el=$(id); if(el) el.value=''; });
  const cb=$('adv_exact_size'); if(cb) cb.checked=false;
  _dtPage = 0; dtRender();
}

// ── Advanced Search filters ───────────────────────────────────
// ตัวกรองนอก panel: adv_status (สถานะ), adv_exact_size (OD×ID×H จากฟอร์ม), dtOdFilter (OD เท่านั้น)
// ตัวกรองใน panel: OD range, วันที่, ราคา, MAT ฝา, MAT ตะแกรง, แบบงาน
// _countAdvActive() → badge แสดงจำนวน filter ที่ active
// dtClearAdv() → ล้างทุก filter
function _getAdvFilters() {
  const g = id => { const el=$(id); return el ? el.value.trim() : ''; };
  const gn = id => parseFloat(g(id)) || null;
  const gb = id => { const el=$(id); return el ? el.checked : false; };
  // update exact-size label dynamically
  const lbl = $('adv_exact_size_label');
  const od = parseFloat($('f_od')?.value)||0;
  const id_ = parseFloat($('f_id')?.value)||0;
  const h  = parseFloat($('f_h')?.value)||0;
  if (lbl) lbl.textContent = (od||id_||h) ? `(OD${od}×ID${id_}×H${h})` : '(จากฟอร์ม)';
  return {
    odMin:     gn('adv_od_min'),
    odMax:     gn('adv_od_max'),
    dateFrom:  g('adv_date_from'),
    dateTo:    g('adv_date_to'),
    priceMin:  gn('adv_price_min'),
    priceMax:  gn('adv_price_max'),
    matFlap:   g('adv_mat_flap').toLowerCase(),
    matMesh:   g('adv_mat_mesh').toLowerCase(),
    workType:  g('adv_worktype').toLowerCase(),
    status:    g('adv_status'),
    exactSize: gb('adv_exact_size'),
    _od: od, _id: id_, _h: h,
  };
}

function _countAdvActive(f) {
  let n = 0;
  if (f.odMin !== null || f.odMax !== null) n++;
  if (f.dateFrom || f.dateTo) n++;
  if (f.priceMin !== null || f.priceMax !== null) n++;
  if (f.matFlap) n++;
  if (f.matMesh) n++;
  if (f.workType) n++;
  if (f.status) n++;
  if (f.exactSize) n++;
  return n;
}

function _toIso(thaiShort) {
  if (!thaiShort) return '';
  const p = String(thaiShort).split('/');
  if (p.length === 3) {
    const y = parseInt(p[2]) > 2500 ? parseInt(p[2])-543 : parseInt(p[2]);
    return `${y}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
  }
  return thaiShort;
}

function dtLoadIntoForm(idx) {
  const tbody = $('dtBody');
  const rows = tbody && tbody._filteredRows;
  if (!rows || !rows[idx]) return;
  const r = rows[idx];

  Swal.fire({
    title:'โหลดจ็อบนี้เข้าฟอร์ม?',
    html:`<small>No.Quo: <b>${r[DT.noQuo]}</b> — ข้อมูลในฟอร์มปัจจุบันจะถูกแทนที่</small>`,
    icon:'question', showCancelButton:true,
    confirmButtonText:'✅ โหลด', cancelButtonText:'ยกเลิก',
    background:'#0a1c2e', color:'#f1f5f9',
    confirmButtonColor:'#16a34a', cancelButtonColor:'#475569'
  }).then(res => {
    if (!res.isConfirmed) return;
    _addSeen(SEEN_KEY_DATA, r[DT.noQuo]);
    dtRender();
    const sv = (id, val) => { const el = $(id); if (el && val !== undefined && val !== null) el.value = val; };
    const sn = (id, val) => sv(id, parseFloat(val) || '');
    sv('f_status',    r[DT.status]);
    sv('f_noQuo',     r[DT.noQuo]);
    sv('f_date',      thaiShortToIso(r[DT.date]));
    sn('f_od',        r[DT.od]);
    sn('f_id',        r[DT.id]);
    sn('f_h',         r[DT.h]);
    sn('f_unit',      r[DT.unit]);
    sv('f_workType',  r[DT.workType]);
    // ช่องว่างใส่จีบ — โหลดค่าที่บันทึกไว้, custGap reset = 0
    if ($('f_gapWeld') && r[DT.gapWeld]) $('f_gapWeld').value = r[DT.gapWeld];
    if ($('f_custGap')) $('f_custGap').value = '0';
    sv('f_matTop',    r[DT.matTop]);     sn('f_costTop',    r[DT.costTop]);
    sv('f_matBot',    r[DT.matBot]);     sn('f_costBot',    r[DT.costBot]);
    sv('f_testWaste', r[DT.testWasteLabel]); sn('f_cTestWaste', r[DT.cTestWaste]);
    sv('f_outsource', r[DT.outsource]); sn('f_cOutsource', r[DT.cOutsource]);
    sv('f_meshOut',   r[DT.meshOut]);  sn('f_cMeshOut',  r[DT.cMeshOut]);
    sv('f_meshIn',    r[DT.meshIn]);   sn('f_cMeshIn',   r[DT.cMeshIn]);
    sv('f_laser',     r[DT.laser]);    sn('f_cLaser',    r[DT.cLaser]);
    sv('f_plating',   r[DT.plating]);  sn('f_cPlating',  r[DT.cPlating]);
    sv('f_mold',      r[DT.mold]);      sn('f_cMold',      r[DT.cMold]);
    sn('f_workdays',  r[DT.workdays]);
    sn('f_transport', r[DT.transport]); // f_cTransport คำนวณ auto ใน calcAll()
    sv('f_machine',   r[DT.machine]);  sn('f_cMachine',  r[DT.cMachine]);
    if ($('f_cMachine') && r[DT.cMachine]) $('f_cMachine')._userEdited = true;
    sv('f_other1',    r[DT.other1]);   sn('f_cOther1',   r[DT.cOther1]);
    sv('f_other2',    r[DT.other2]);   sn('f_cOther2',   r[DT.cOther2]);
    sv('f_other3',    r[DT.other3]);   sn('f_cOther3',   r[DT.cOther3]);
    sn('f_fixedCost', r[DT.fixedCost]);
    sv('f_contact',   r[DT.contact]);
    sv('f_remark',    r[DT.remark]);
    sv('f_quoter',    r[DT.quoter]);
    sv('f_rawMat',    r[DT.rawMat]);
    // โหลด ODฝา2
    { const od2raw = parseFloat(r[DT.od2]) || 0;
      const hasOd2  = od2raw > 0;
      const doCalc  = (parseFloat(r[DT.calcOd2]) || 0) === 1;
      const od2val  = od2raw;
      const cb = $('f_hasOd2');
      if (cb) { cb.checked = hasOd2; toggleOd2Panel(); }
      if (hasOd2) {
        if ($('f_od2')) $('f_od2').value = od2val;
        const matEl = $('f_matOd2');
        if (matEl) matEl.value = r[DT.matOd2] || '';
        const rYes = $('r_od2calc_yes'), rNo = $('r_od2calc_no');
        if (rYes) rYes.checked = doCalc;
        if (rNo)  rNo.checked  = !doCalc;
        const costEl = $('f_costOd2');
        if (costEl) { costEl.value = parseFloat(r[DT.costOd2]) || ''; }
      }
    }
    // โหลด Rev. (BH) — แสดงเฉพาะตอนโหลดจ๊อบเก่าเข้าฟอร์ม
    { _loadedRev = parseInt(r[DT.rev]) || 0;
      if ($('f_rev')) $('f_rev').value = String(_loadedRev);
      if ($('revField')) $('revField').style.display = (_loadedRev > 0) ? '' : 'none';
    }
    // โหลดผลวิเคราะห์ AI เคาะราคา (BG)
    { const aiSaleVal = r[DT.aiSale] || '';
      if ($('f_aiSale')) $('f_aiSale').value = aiSaleVal;
      if ($('aiSaleHint')) $('aiSaleHint').style.display = aiSaleVal ? 'block' : 'none';
    }
    // โหลดรูปใบขอราคา (AY = index 50)
    { const imgUrl = r[50]; if (imgUrl) _loadAttachFromUrl(imgUrl); else clearAttachedImage(); }
    // เลขอ้างอิง BB — โหลดของเดิม ถ้าไม่มีให้สร้างใหม่
    { const rid = r[DT.refId]; const el = $('f_refId');
      if (el) el.value = rid ? rid : generateRefId(); }
    const _savedSellPrice = parseFloat(r[DT.sellPrice]) || 0;
    // โหลดค่าแรง/ลูก ที่บันทึกไว้ — ต้อง set manual mode ก่อน calcAll() เพื่อกัน calcLaborByProcess() ทับ
    const savedCLabor = parseFloat(r[DT.cLabor]) || 0;
    if (savedCLabor > 0) {
      _laborManual = true;
      const inp  = $('f_cLabor');
      const chip = $('laborModeChip');
      if (inp)  { inp.removeAttribute('readonly'); inp.value = savedCLabor.toFixed(2);
                  inp.style.borderColor='rgba(251,191,36,.5)'; inp.style.background='rgba(251,191,36,.06)'; }
      if (chip) { chip.textContent='✏️ กรอกเอง'; chip.style.background='rgba(251,191,36,.15)';
                  chip.style.color='#fbbf24'; chip.style.borderColor='rgba(251,191,36,.3)'; }
    } else {
      _laborManual = false;
      const inp  = $('f_cLabor');
      const chip = $('laborModeChip');
      if (inp)  { inp.setAttribute('readonly',''); inp.style.borderColor=''; inp.style.background=''; }
      if (chip) { chip.textContent='⚡ อัตโนมัติ'; chip.style.background='rgba(52,211,153,.15)';
                  chip.style.color='#34d399'; chip.style.borderColor='rgba(52,211,153,.3)'; }
    }
    setLoadedJob(r[DT.noQuo]);
    if (typeof updateSize === 'function') updateSize();   // อัปเดตช่อง OD×ID×H
    calcAll();
    // ตั้งราคาเสนอขายหลัง calcAll() เพราะ calcAll() จะทับด้วย margin อัตโนมัติ
    if (_savedSellPrice > 0 && $('f_sellPrice')) {
      $('f_sellPrice').value = _savedSellPrice.toLocaleString('th-TH', {minimumFractionDigits:0, maximumFractionDigits:0});
      // ปิด auto margin ไว้ก่อน ไม่งั้น calcAll() รอบถัดไปจะทับราคาที่เพิ่งใส่กลับด้วย margin อัตโนมัติอีก
      _selectedMargin = 0;
      const lbl = $('marginLabel');
      if (lbl) lbl.textContent = '●กำหนดเอง';
      // คำนวณซ้ำอีกรอบด้วยราคาเสนอขายที่บันทึกไว้ — ให้ตาราง/กราฟเปรียบเทียบราคา + summary panel ใช้ราคานี้ตั้งแต่โหลดครั้งแรก
      calcAll();
      if (typeof updateSummaryPanel === 'function') updateSummaryPanel();
    }
    switchTab('breakdown');
    setTimeout(() => {
      Swal.fire({icon:'success',title:'โหลดสำเร็จ ✅',timer:1200,showConfirmButton:false,
        background:'#0a1c2e',color:'#f1f5f9'});
    }, 200);
  });
}

function dtShowSpecSheet(idx) {
  const tbody = $('dtBody');
  const rows = tbody && tbody._filteredRows;
  if (!rows || !rows[idx]) return;
  const r = rows[idx];

  // ดูสเปคแล้ว ถือว่าเห็นแล้ว เคลียร์ NEW badge ของแถวนี้
  if (_isNewItem(SEEN_KEY_DATA, r[DT.noQuo])) {
    _addSeen(SEEN_KEY_DATA, r[DT.noQuo]);
    dtRender();
  }

  const refId    = r[DT.refId] || generateRefId();
  const revNo    = parseInt(r[DT.rev]) || 0;
  const revSuffix = revNo > 0 ? ` Rev.${revNo}` : '';
  const dateVal  = thaiShortToIso(r[DT.date]);
  const unit     = parseFloat(r[DT.unit]) || 1;
  const od       = parseFloat(r[DT.od]) || 0;
  const id_      = parseFloat(r[DT.id]) || 0;
  const h        = parseFloat(r[DT.h]) || 0;
  const rawMat   = r[DT.rawMat] || '';
  const workType = r[DT.workType] || '';
  const contactName = r[DT.contact] || '—';
  const contactCo   = (_contactsData.find(c=>c.name===contactName)||{}).company || '';

  const sellPriceU = parseFloat(r[DT.sellPrice]) || 0;
  const totalCost  = parseFloat(r[DT.totalCost]) || 0;
  const profitJob  = parseFloat(r[DT.profitJob]) || 0;
  const marginPct = totalCost > 0 && sellPriceU > 0
    ? ((sellPriceU - totalCost) / sellPriceU * 100).toFixed(1)
    : '—';

  // ── COST LINE ITEMS (จากข้อมูลแถวที่บันทึกไว้) ──
  const lines = [];
  function addLine(label, detail, unitCost, isPerJob) {
    const c = parseFloat(unitCost) || 0;
    if (!c && !detail) return;
    const perUnit = isPerJob ? c/unit : c;
    lines.push({ label, detail, perUnit, total: perUnit*unit });
  }
  addLine('ฝาบน (Top Cap)',       matLabel(r[DT.matTop]), r[DT.costTop], false);
  addLine('ฝาล่าง (Bottom Cap)',  matLabel(r[DT.matBot]), r[DT.costBot], false);
  addLine('งานเทสเสีย (Testing Waste)', r[DT.testWasteLabel], r[DT.cTestWaste], false);
  addLine('จ้างภายนอก (Outsource)', r[DT.outsource], r[DT.cOutsource], false);
  addLine('ตะแกรงนอก (Outer Mesh)', matLabel(r[DT.meshOut]), r[DT.cMeshOut], false);
  addLine('ตะแกรงใน (Inner Mesh)',  matLabel(r[DT.meshIn]),  r[DT.cMeshIn], false);
  addLine('เลเซอร์ (Laser)',       r[DT.laser], r[DT.cLaser], false);
  addLine('ร้าน/ชุป (Plating)',    r[DT.plating] || 'ชุบซิงค์ครั้ง', r[DT.cPlating], false);
  addLine('แม่พิมพ์ (Mold)',       r[DT.mold], r[DT.cMold], true);
  addLine('ค่าแรง (ต่อลูก)', '', r[DT.cLabor], false);
  addLine('ค่าขนส่ง (Logistics)', '', r[DT.cTransport], false);
  addLine('เครื่องจักร์ (Machine setup)', r[DT.machine], r[DT.cMachine], false);
  if (r[DT.other1] || parseFloat(r[DT.cOther1])) addLine(r[DT.other1]||'อื่นๆ 1', '', r[DT.cOther1], false);
  if (r[DT.other2] || parseFloat(r[DT.cOther2])) addLine(r[DT.other2]||'อื่นๆ 2', '', r[DT.cOther2], false);
  if (r[DT.other3] || parseFloat(r[DT.cOther3])) addLine(r[DT.other3]||'อื่นๆ 3', '', r[DT.cOther3], false);
  addLine('ต้นทุนคงที่ (Fixed Cost Unit)', 'ค่าบริหาร', r[DT.fixedCost], true);

  const costRows = lines.map((l,i) => `
<tr style="${i%2===0?'background:#f8fafc':''}">
  <td style="padding:7px 10px">${l.label}</td>
  <td style="padding:7px 10px;color:#555;font-size:.76rem">${l.detail||'—'}</td>
  <td style="padding:7px 10px;text-align:right;font-weight:500">${fmtB(l.perUnit)} ฿</td>
  <td style="padding:7px 10px;text-align:right;color:#2563eb;font-weight:600">${fmtB(l.total)} ฿</td>
</tr>`).join('');

  const netPerUnit = totalCost;
  const marginAmt  = sellPriceU - netPerUnit;
  const marginColor = marginAmt >= 0 ? '#059669' : '#dc2626';

  $('docCost').innerHTML = `
<div class="doc-paper" style="overflow:hidden">
  <!-- ── Header ── -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;
    padding:18px 28px 12px;background:#0a1828;color:#cce4ff;gap:12px;flex-wrap:wrap">
    <div>
      <div style="font-size:.6rem;font-weight:700;letter-spacing:2px;color:#34d399;margin-bottom:4px">
        INTERNAL COSTING SHEET &amp; MARGIN ANALYSIS</div>
      <div style="font-size:1.1rem;font-weight:800;margin-bottom:2px">ใบพิกัดจำแนกสเปคและต้นทุนฟิลเตอร์ (ภายใน)</div>
      <div style="font-size:.7rem;color:#7090a8">
        วันที่ประเมิน: ${fmtDate(dateVal)} &nbsp;|&nbsp;
        เลขอ้างอิง: ${refId}${revSuffix}
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:.78rem;margin-bottom:2px">อ้างอิง <b style="color:#60a5fa">${refId}${revSuffix}</b></div>
      <div style="font-size:.76rem">เรียนส่ง: ${contactName}</div>
      ${contactCo?`<div style="font-size:.7rem;color:#7090a8">${contactCo}</div>`:''}
      <div style="margin-top:5px;font-size:.68rem;display:inline-block;
        background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.4);
        color:#fbbf24;padding:2px 8px;border-radius:10px">🔒 ข้อมูลภายในบริษัทเท่านั้น</div>
    </div>
  </div>

  <!-- ── Specs ── -->
  <div style="display:flex;gap:0;border-bottom:1px solid #e8ecf2">
    <div style="flex:1;padding:14px 20px;border-right:1px solid #e8ecf2">
      <div style="font-weight:700;font-size:.78rem;margin-bottom:8px;color:#1a2232">
        1. รายละเอียดสเปควิศวกรรม</div>
      <div style="font-size:.76rem;color:#333;line-height:2">
        • เส้นผ่านศูนย์กลางภายนอก (OD): <b>${od} มม.</b><br>
        • เส้นผ่านศูนย์กลางภายใน (ID): <b>${id_} มม.</b><br>
        • ความสูงชิ้นงาน (H): <b>${h} มม.</b><br>
        • แบบสไตล์งานท้ายท้าย: <b>${workType||'—'}</b>
        ${rawMat?`<br>• วัตถุดิบหลัก: <b>${rawMat}</b>`:''}
      </div>
    </div>
    <div style="flex:1;padding:14px 20px">
      <div style="font-weight:700;font-size:.78rem;margin-bottom:8px;color:#1a2232">
        2. ปริมาณเลือกผลิตพิจารณา</div>
      <div style="font-size:.76rem;color:#333;line-height:2">
        • จำนวนสั่งใบเสนอราคา: <b>${unit.toLocaleString('th-TH')} ชิ้น</b><br>
        • ราคาเสนอต่อหน่วย: <b style="color:#2563eb;font-size:.86rem">${fmtB(sellPriceU)} บาท</b><br>
        • ต้นทุนรวม/หน่วย: <b>${fmtB(netPerUnit)} บาท</b><br>
        • กำไร/หน่วย: <b style="color:${marginColor}">${fmtB(marginAmt)} บาท</b>
      </div>
    </div>
  </div>

  <!-- ── Cost Table ── -->
  <div style="padding:14px 20px">
    <div style="font-weight:700;font-size:.78rem;margin-bottom:10px;color:#1a2232">
      3. สรุปพิกัดบัญชีต้นทุนจริงประกอบ (NESTING-FORMULA BASED)</div>
    <table style="width:100%;border-collapse:collapse;font-size:.78rem">
      <thead>
        <tr style="background:#1d4ed8;color:#fff">
          <th style="padding:8px 10px;text-align:left;border-radius:4px 0 0 0">หมวดรายการวัสดุ-บริการ</th>
          <th style="padding:8px 10px;text-align:left;width:22%">ตัวเลือก / Nesting</th>
          <th style="padding:8px 10px;text-align:right;width:17%">เฉลี่ยต่อลูก (บาท)</th>
          <th style="padding:8px 10px;text-align:right;width:17%;border-radius:0 4px 0 0">
            ยอดราคารวมล็อต (${unit} ลูก)</th>
        </tr>
      </thead>
      <tbody>${costRows}</tbody>
      <tfoot>
        <tr style="background:#1e3a5f;color:#fff;font-weight:700">
          <td colspan="2" style="padding:9px 10px;font-size:.85rem">
            ยอดรวมผู้ควบคุมผลิตสุทธิ (Net Manufacturing Cost)</td>
          <td style="padding:9px 10px;text-align:right;font-size:.85rem">${fmtB(netPerUnit)} ฿</td>
          <td style="padding:9px 10px;text-align:right;font-size:.85rem">${fmtB(netPerUnit*unit)} ฿</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- ── Margin Analysis + Approvals ── -->
  <div style="display:flex;gap:0;border-top:1px solid #e8ecf2;flex-wrap:wrap">
    <div style="flex:1;min-width:200px;padding:14px 20px;border-right:1px solid #e8ecf2">
      <div style="font-weight:700;font-size:.78rem;margin-bottom:8px;color:#1a2232">
        ผลสรุปวิเคราะห์เป้าจำลอง (MARGIN ANALYTICS)</div>
      <div style="font-size:.79rem;line-height:2.1">
        <div>ราคาเสนอขายตั้งไว้: <b style="color:#2563eb;font-size:.86rem">${fmtB(sellPriceU)} บาท/ลูก</b></div>
        <div>ต้นทุนรวมแปรผันต่อลูก: ${fmtB(netPerUnit)} บาท/ลูก</div>
        <div>มาร์จิ้นป้อปเปิ้งเซ็นส่วนต่าง: <b style="color:${marginColor}">
          ${marginAmt >= 0 ? '+' : ''}${marginPct}%</b></div>
        <div style="margin-top:6px;padding:7px 10px;border-radius:6px;
          background:${marginAmt>=0?'rgba(5,150,105,.08)':'rgba(220,38,38,.08)'};
          border-left:3px solid ${marginColor};font-weight:700;color:${marginColor}">
          กำไรล็อตสรุปตามตลาด (Job Profit):<br>
          <span style="font-size:1.05rem">${fmtB(profitJob)} บาท</span>
        </div>
      </div>
    </div>
    <div style="flex:1;min-width:200px;padding:14px 20px">
      <div style="font-weight:700;font-size:.78rem;margin-bottom:8px;color:#1a2232">
        การลงมติอนุมัติผลิต (APPROVALS)</div>
      <div style="font-size:.73rem;color:#555;margin-bottom:12px;line-height:1.6">
        ข้อมูลต้นทุนและการจัดสรรส่วน Nesting ได้ประเมินแล้วสมเหตุสมผล
        อนุมัติเดินหน้าผลิต</div>
      <div style="display:flex;gap:12px;margin-top:8px">
        <div style="flex:1;text-align:center">
          <div style="border-top:1px solid #bbb;padding-top:5px;font-size:.7rem;color:#555">
            อนุมัติ ผู้จัดการฝ่ายขาย</div>
          <div style="font-size:.65rem;color:#aaa;margin-top:2px">( ______________ )</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="border-top:1px solid #bbb;padding-top:5px;font-size:.7rem;color:#555">
            อนุมัติ ผู้จัดการฝ่ายผลิต</div>
          <div style="font-size:.65rem;color:#aaa;margin-top:2px">( ______________ )</div>
        </div>
      </div>
    </div>
  </div>
</div>`;

  // เปิด overlay เฉพาะแท็บ Costing Sheet — ซ่อนแท็บใบเสนอราคา/ปุ่มสลับ เพราะข้อมูลฝั่งฟอร์มไม่ตรงกับแถวนี้
  _specSheetMode = true;
  $('docExportOverlay').classList.add('open');
  switchDocTab('cost');
  if ($('dtabQuo')) $('dtabQuo').style.display = 'none';
  const swapBtn = document.querySelector('.doc-bottombar .doc-tab-btn[onclick*="_docActiveTab"]');
  if (swapBtn) swapBtn.style.display = 'none';
}

async function dtDelete(noQuo, btn) {
  if (!SCRIPT_URL) return;
  const confirm = await Swal.fire({
    title:`ลบ ${noQuo}?`, text:'ข้อมูลจะถูกลบออกจาก Google Sheet',
    icon:'warning', showCancelButton:true,
    confirmButtonText:'🗑️ ลบ', cancelButtonText:'ยกเลิก',
    confirmButtonColor:'#dc2626', cancelButtonColor:'#475569',
    background:'#0a1c2e', color:'#f1f5f9'
  });
  if (!confirm.isConfirmed) return;
  btn.disabled = true; btn.textContent = '…';
  try {
    const res = await fetch(SCRIPT_URL, {
      method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({action:'deleteRow', noQuo})
    });
    Swal.fire({icon:'success',title:'ลบแล้ว',timer:1200,showConfirmButton:false,
      background:'#0a1c2e',color:'#f1f5f9'});
    await dtRefresh(false);
  } catch(e) {
    Swal.fire({icon:'error',title:'ลบไม่สำเร็จ',text:e.message,background:'#0a1c2e',color:'#f1f5f9'});
    btn.disabled = false; btn.textContent = '🗑️';
  }
}

function pcResetTiers() {
  const inp = $('pcQtyInput');
  if (inp) { inp.value = ''; renderPriceComparison(); }
}

let _laborManual = false;
function toggleLaborMode() {
  _laborManual = !_laborManual;
  const inp  = $('f_cLabor');
  const chip = $('laborModeChip');
  if (_laborManual) {
    inp.removeAttribute('readonly');
    inp.style.borderColor = 'rgba(251,191,36,.5)';
    inp.style.background  = 'rgba(251,191,36,.06)';
    if (chip) { chip.textContent='✏️ กรอกเอง'; chip.style.background='rgba(251,191,36,.15)'; chip.style.color='#fbbf24'; chip.style.borderColor='rgba(251,191,36,.3)'; }
    inp.focus(); inp.select();
  } else {
    inp.setAttribute('readonly','');
    inp.style.borderColor = '';
    inp.style.background  = '';
    if (chip) { chip.textContent='⚡ อัตโนมัติ'; chip.style.background='rgba(52,211,153,.15)'; chip.style.color='#34d399'; chip.style.borderColor='rgba(52,211,153,.3)'; }
    calcLaborByProcess();
    calcAll();
  }
}

// ── Pricing Intelligence ─────────────────────────────────────────────
// Multi-dimensional similarity: OD × ID × H × จำนวน × ตะแกรง × วัตถุดิบ
// จัดกลุ่ม 3 ระดับ แล้วเปรียบเทียบกับงานปัจจุบัน

function _piScore(row, cur) {
  // คืน similarity score 0–110
  let s = 0;

  // ── OD (35 คะแนน) ──────────────────────────────
  if (cur.od > 0) {
    const d = Math.abs((parseFloat(row[DT.od])||0) - cur.od) / cur.od * 100;
    if      (d <=  2) s += 35;
    else if (d <=  5) s += 28;
    else if (d <= 10) s += 20;
    else if (d <= 20) s += 10;
    else return 0; // OD เกิน 20% — ตัดออก ไม่นับ
  }

  // ── ID (15 คะแนน) ──────────────────────────────
  if (cur.id > 0) {
    const d = Math.abs((parseFloat(row[DT.id])||0) - cur.id) / cur.id * 100;
    if      (d <=  5) s += 15;
    else if (d <= 15) s += 10;
    else if (d <= 30) s +=  5;
  }

  // ── H (15 คะแนน) ───────────────────────────────
  if (cur.h > 0) {
    const d = Math.abs((parseFloat(row[DT.h])||0) - cur.h) / cur.h * 100;
    if      (d <=  5) s += 15;
    else if (d <= 15) s += 10;
    else if (d <= 30) s +=  5;
  }

  // ── วัตถุดิบ (20 คะแนน) ─────────────────────────
  const rowMat = String(row[DT.matTop]||'').trim();
  const pfx = t => t.split(/[\s_\-\/]/)[0].toUpperCase();
  if (cur.mat && rowMat) {
    if (rowMat === cur.mat)              s += 20;
    else if (pfx(rowMat) === pfx(cur.mat)) s += 12;
  }

  // ── ตะแกรงนอก (10 คะแนน) ────────────────────────
  const rMeshOut = !!(String(row[DT.meshOut]||'').trim()) || (parseFloat(row[DT.cMeshOut])||0) > 0;
  if (rMeshOut === cur.meshOut) s += 10;

  // ── ตะแกรงใน (8 คะแนน) ──────────────────────────
  const rMeshIn  = !!(String(row[DT.meshIn] ||'').trim()) || (parseFloat(row[DT.cMeshIn]) ||0) > 0;
  if (rMeshIn === cur.meshIn) s += 8;

  // ── จำนวน tier (7 คะแนน) ─────────────────────────
  const qTier = n => n<=5?0:n<=20?1:n<=50?2:n<=200?3:4;
  const dt = Math.abs(qTier(parseFloat(row[DT.unit])||0) - qTier(cur.unit));
  if (dt === 0) s += 7;
  else if (dt === 1) s += 3;

  return s; // max ≈ 110
}

function _updatePricingInsight() {
  const body = $('spInsightBody');
  const meta = $('spInsightMeta');
  if (!body) return;

  // ── ค่างานปัจจุบัน ──────────────────────────────────
  const cur = {
    od:      parseFloat($('f_od')?.value)   || 0,
    id:      parseFloat($('f_id')?.value)   || 0,
    h:       parseFloat($('f_h')?.value)    || 0,
    unit:    parseFloat($('f_unit')?.value) || 1,
    mat:     String($('f_matTop')?.value    || '').trim(),
    meshOut: !!(String($('f_meshOut')?.value || '').trim()) || (parseFloat($('f_cMeshOut')?.value)||0) > 0,
    meshIn:  !!(String($('f_meshIn')?.value  || '').trim()) || (parseFloat($('f_cMeshIn')?.value) ||0) > 0,
  };
  const currentSP = parseFloat(String($('f_sellPrice')?.value||'').replace(/,/g,'')) || 0;

  if (!cur.od) {
    body.innerHTML = '<div style="text-align:center;padding:8px 0;color:var(--t3);font-size:.75rem">กรอก OD เพื่อวิเคราะห์</div>';
    if (meta) meta.textContent = '—'; return;
  }
  if (!_dtCache || !_dtCache.length) {
    body.innerHTML = '<div style="text-align:center;padding:8px 0;color:var(--t3);font-size:.75rem">ยังไม่โหลดข้อมูล DATA</div>';
    if (meta) meta.textContent = '—'; return;
  }

  // ── กรอง 3 ปี + ไม่ยกเลิก ───────────────────────────
  const cutoff3y = new Date(); cutoff3y.setFullYear(cutoff3y.getFullYear()-3);
  const cutoff1y = new Date(); cutoff1y.setFullYear(cutoff1y.getFullYear()-1);
  const pool = _dtCache.filter(r => {
    const iso = thaiShortToIso(String(r[DT.date]||''));
    if (iso && new Date(iso) < cutoff3y) return false;
    return String(r[DT.status]||'').trim() !== 'ยกเลิก';
  });

  if (!pool.length) {
    body.innerHTML = '<div style="text-align:center;padding:8px 0;color:var(--t3)">ไม่พบข้อมูลใน 3 ปี</div>';
    if (meta) meta.textContent = '—'; return;
  }

  // ── Scoring + จัดกลุ่ม ──────────────────────────────
  const scored = pool.map(r => ({ r, sc: _piScore(r, cur) })).filter(x => x.sc > 0);
  scored.sort((a,b) => b.sc - a.sc);

  // 3 กลุ่ม: เหมือนมาก (≥65) / คล้ายกัน (35-64) / ขนาดใกล้เคียง (15-34)
  const grpA = scored.filter(x => x.sc >= 65).map(x=>x.r);   // เหมือนมาก
  const grpB = scored.filter(x => x.sc>=35 && x.sc<65).map(x=>x.r); // คล้ายกัน
  const grpC = scored.filter(x => x.sc>=15 && x.sc<35).map(x=>x.r); // ขนาดใกล้เคียง

  if (meta) meta.textContent = `OD${cur.od}×ID${cur.id}×H${cur.h} · ${scored.length}งาน`;

  if (!scored.length) {
    body.innerHTML = `<div style="text-align:center;padding:10px 0;color:var(--t3);font-size:.75rem">ไม่พบงานที่คล้ายกันใน 3 ปี</div>`;
    return;
  }

  // ── helpers ─────────────────────────────────────────
  const _avg = a => a.reduce((s,v)=>s+v,0)/a.length;
  const _med = a => { const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; };
  const B  = n => '฿'+Math.round(n).toLocaleString('th-TH');
  const P1 = n => n.toFixed(1)+'%';
  const SN = n => (n>=0?'+':'')+n.toFixed(1)+'%';

  // สถิติของกลุ่ม
  const grpStats = rows => {
    if (!rows.length) return null;
    const prices  = rows.map(r=>parseFloat(r[DT.sellPrice])||0).filter(v=>v>0);
    const costs   = rows.map(r=>parseFloat(r[DT.totalCost])||0).filter(v=>v>0);
    const margins = rows.map(r=>{const sp=parseFloat(r[DT.sellPrice])||0,tc=parseFloat(r[DT.totalCost])||0;return sp&&tc?(sp-tc)/sp*100:null;}).filter(v=>v!==null);
    const wins    = rows.filter(r=>['ผ่าน','อนุมัติ'].includes(String(r[DT.status]||'').trim())).length;
    const recent  = rows.filter(r=>{const d=thaiShortToIso(String(r[DT.date]||''));return d&&new Date(d)>=cutoff1y;});
    const older   = rows.filter(r=>{const d=thaiShortToIso(String(r[DT.date]||''));const dt=d&&new Date(d);return dt&&dt<cutoff1y;});
    const recentP = recent.map(r=>parseFloat(r[DT.sellPrice])||0).filter(v=>v>0);
    const olderP  = older.map(r=>parseFloat(r[DT.sellPrice])||0).filter(v=>v>0);
    let trendPct=null,trendDir='→',trendCol='#94a3b8';
    if(recentP.length&&olderP.length){trendPct=(_avg(recentP)-_avg(olderP))/_avg(olderP)*100;if(trendPct>3){trendDir='↑';trendCol='#34d399';}else if(trendPct<-3){trendDir='↓';trendCol='#f87171';}}
    return {
      count: rows.length, winRate: rows.length?wins/rows.length*100:0,
      avgP: prices.length?_avg(prices):0, medP: prices.length?_med(prices):0,
      minP: prices.length?Math.min(...prices):0, maxP: prices.length?Math.max(...prices):0,
      avgC: costs.length?_avg(costs):0,
      avgMgn: margins.length?_avg(margins):0,
      spPct: currentSP>0&&prices.length>1?(prices.filter(v=>v<currentSP).length/prices.length)*100:null,
      vsAvg: currentSP>0&&prices.length?(currentSP-_avg(prices))/_avg(prices)*100:null,
      trendDir,trendCol,trendPct,
    };
  };

  const sA = grpStats(grpA), sB = grpStats(grpB), sC = grpStats(grpC);
  window._piGroupRows = { A: grpA, B: grpB, C: grpC };

  // ── verdict จากกลุ่มที่ดีที่สุด ─────────────────────
  const bestStat = sA || sB || sC;
  let verdict='',vColor='#94a3b8',vBg='rgba(148,163,184,.1)',vIcon='—',vSub='';
  if (bestStat) {
    const v = bestStat.vsAvg;
    if (currentSP > 0 && bestStat.avgP > 0) {
      if      (v> 15){verdict='สูงกว่าตลาด — แข่งยาก';  vColor='#f87171';vBg='rgba(248,113,113,.12)';vIcon='⚠';}
      else if (v>  5){verdict='สูงกว่าเฉลี่ย';           vColor='#fbbf24';vBg='rgba(251,191,36,.12)'; vIcon='↑';}
      else if (v< -5){verdict='ต่ำกว่าเฉลี่ย — แข่งขันได้'; vColor='#34d399';vBg='rgba(52,211,153,.12)';vIcon='✓';}
      else            {verdict='ใกล้ค่าตลาด';             vColor='#34d399';vBg='rgba(52,211,153,.12)';vIcon='✓';}
      vSub = `vs เฉลี่ย <b style="color:${v>=0?'#34d399':'#f87171'}">${SN(v)}</b>`;
    } else if (bestStat.avgP > 0) {
      verdict=`แนะนำ ${B(bestStat.avgP)}–${B(bestStat.avgP*1.1)}`; vColor='#a78bfa';vBg='rgba(167,139,250,.12)';vIcon='💡';
      vSub=`จาก ${bestStat.count} งานที่คล้าย`;
    }
  }

  // progress bar
  const pBar = pct => {
    if(pct===null) return '<span style="color:var(--t3);font-size:.7rem">ยังไม่กำหนด</span>';
    const col=pct>=75?'#f87171':pct>=40?'#fbbf24':'#34d399';
    return `<div style="display:flex;align-items:center;gap:4px"><div style="flex:1;height:5px;border-radius:3px;background:var(--bc-div);overflow:hidden"><div style="width:${pct.toFixed(0)}%;height:100%;background:${col};border-radius:3px"></div></div><span style="font-size:.75rem;font-weight:700;color:${col}">${pct.toFixed(0)}%</span></div>`;
  };

  // กลุ่ม card
  const grpCard = (stat, label, dot, groupKey) => {
    if (!stat) return '';
    const wc = stat.winRate>=50?'#34d399':'#f87171';
    const mc = stat.avgMgn>=25?'#34d399':stat.avgMgn>=10?'#fbbf24':'#f87171';
    return `
    <div style="background:var(--bg-input2);border:1px solid var(--bc-div);border-left:3px solid ${dot};border-radius:8px;padding:8px 10px;margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
        <span style="font-size:.72rem;font-weight:700;color:${dot}">${label}</span>
        <span onclick="showGroupJobsModal('${groupKey}')" title="ดูรายการงานในกลุ่มนี้"
          style="font-size:.65rem;color:var(--c1);cursor:pointer;text-decoration:underline">${stat.count} งาน 🔍</span>
      </div>
      <!-- ราคา min/avg/max -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;margin-bottom:5px">
        ${[['ต่ำสุด',stat.minP,'#94a3b8'],['เฉลี่ย',stat.avgP,'#60a5fa'],['สูงสุด',stat.maxP,'#f472b6']].map(([l,v,c])=>`
        <div style="text-align:center;background:rgba(0,0,0,.04);border-radius:5px;padding:3px">
          <div style="font-size:.58rem;color:var(--t3)">${l}</div>
          <div style="font-size:.73rem;font-weight:800;color:${c}">${B(v)}</div>
        </div>`).join('')}
      </div>
      <!-- win / margin / trend -->
      <div style="display:flex;gap:6px;align-items:center;font-size:.65rem;flex-wrap:wrap">
        <span onclick="showPricingMetricInfo()" style="cursor:pointer" title="คลิกดูคำอธิบาย">🏆 <b style="color:${wc}">${P1(stat.winRate)}</b></span>
        <span onclick="showPricingMetricInfo()" style="cursor:pointer" title="คลิกดูคำอธิบาย">📈 <b style="color:${mc}">${P1(stat.avgMgn)}</b></span>
        ${stat.trendPct!==null?`<span style="color:${stat.trendCol}">${stat.trendDir}${SN(stat.trendPct)}</span>`:''}
      </div>
      <!-- percentile bar -->
      ${stat.spPct!==null?`<div style="margin-top:5px"><div style="font-size:.6rem;color:var(--t3);margin-bottom:2px">Percentile ราคาปัจจุบัน</div>${pBar(stat.spPct)}</div>`:''}
    </div>`;
  };

  // ── สรุป attributes ปัจจุบัน ───────────────────────
  const meshTags = [cur.meshOut?'ตะแกรงนอก':'', cur.meshIn?'ตะแกรงใน':''].filter(Boolean).join(', ') || '—';
  const matTag   = cur.mat || '—';

  body.innerHTML = `
  <!-- Current job fingerprint -->
  <div style="font-size:.65rem;color:var(--t3);margin-bottom:8px;line-height:1.7;background:rgba(0,0,0,.04);border-radius:7px;padding:5px 8px">
    <b style="color:var(--t2)">งานปัจจุบัน:</b>
    OD ${cur.od} × ID ${cur.id} × H ${cur.h} · ${cur.unit} ลูก<br>
    MAT: <span style="color:var(--t1)">${matTag}</span> · ตะแกรง: <span style="color:var(--t1)">${meshTags}</span>
  </div>

  <!-- VERDICT -->
  ${verdict?`
  <div style="background:${vBg};border:1.5px solid ${vColor};border-radius:10px;padding:8px 12px;margin-bottom:10px;display:flex;align-items:center;gap:8px">
    <span style="font-size:1.15rem">${vIcon}</span>
    <div><div style="font-size:.88rem;font-weight:800;color:${vColor}">${verdict}</div>
    ${vSub?`<div style="font-size:.72rem;color:var(--t2)">${vSub}</div>`:''}</div>
  </div>`:''}

  <!-- GROUP CARDS -->
  ${grpCard(sA, '🟢 เหมือนมาก (OD+ID+H+วัตถุดิบ+ตะแกรง)', '#34d399', 'A')}
  ${grpCard(sB, '🟡 คล้ายกัน (OD+บางมิติตรง)', '#fbbf24', 'B')}
  ${grpCard(sC, '🔵 ขนาดใกล้เคียง (OD เป็นหลัก)', '#60a5fa', 'C')}

  <!-- AI Detailed Analysis Button -->
  <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
    <button onclick="showPricingAnalysis()"
      style="flex:1;padding:9px 10px;border:none;border-radius:9px;cursor:pointer;font-family:'Sarabun',sans-serif;font-size:.82rem;font-weight:700;display:flex;align-items:center;justify-content:center;gap:7px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;box-shadow:0 2px 10px rgba(79,70,229,.35);transition:opacity .15s"
      onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
      🤖 AI เคาะราคา
    </button>
    <span onclick="showLastPricingResult()" title="ดูผลวิเคราะห์ล่าสุด (ไม่เสียโควต้า)"
      style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;flex-shrink:0;
      border-radius:50%;background:rgba(79,70,229,.15);color:#a5b4fc;font-size:.85rem;font-weight:700;
      cursor:pointer;border:1px solid rgba(124,58,237,.4)">🕐</span>
    <span onclick="showPricingInfo()" title="วิธีคิดกลุ่ม A/B/C"
      style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;flex-shrink:0;
      border-radius:50%;background:rgba(79,70,229,.15);color:#a5b4fc;font-size:.78rem;font-weight:700;
      cursor:pointer;font-style:italic;font-family:Georgia,serif;border:1px solid rgba(124,58,237,.4)">i</span>
  </div>
  `;
}

// ── Summary Panel ────────────────────────────────────
let _spDonut = null;
function updateSummaryPanel() {
  const panel = $('summaryPanel');
  if (!panel || getComputedStyle(panel).display === 'none') return; // hidden on mobile
  const unit      = num('f_unit') || 1;
  const costTop   = num('f_costTop'), costBot = num('f_costBot');
  const cMeshOut  = num('f_cMeshOut'), cMeshIn = num('f_cMeshIn');
  const cTestWaste= num('f_cTestWaste'), cOutsource = num('f_cOutsource');
  const cLaser    = num('f_cLaser'), cPlating = num('f_cPlating');
  const cLabor    = num('f_cLabor'), cMachine = num('f_cMachine');
  const cMold     = num('f_cMold'), fixedCost = num('f_fixedCost');
  const cOther    = num('f_cOther1') + num('f_cOther2') + num('f_cOther3');
  const cTransport= unit > 0 ? num('f_transport')/unit : num('f_transport');

  const perUnitVar = costTop+costBot+cTestWaste+cOutsource+cMeshOut+cMeshIn+
                     cLaser+cPlating+cLabor+cTransport+cMachine+cOther;
  const total      = perUnitVar*unit + cMold + fixedCost;
  const costPerUnit= perUnitVar + (unit > 0 ? (cMold+fixedCost)/unit : (cMold+fixedCost));
  const sellPriceUnit = num('f_sellPrice');
  const profitJob  = (sellPriceUnit - costPerUnit) * unit;
  const margin     = sellPriceUnit > 0 ? ((sellPriceUnit - costPerUnit)/sellPriceUnit*100) : 0;

  // KPI text
  if($('sp_totalJob'))    $('sp_totalJob').textContent    = fmt(total);
  if($('sp_costPerUnit')) $('sp_costPerUnit').textContent = 'ต้นทุน/ลูก: ' + fmt(costPerUnit);
  if($('sp_unit'))        $('sp_unit').textContent        = unit.toLocaleString('th-TH') + ' ลูก';
  if($('sp_sellPrice'))   $('sp_sellPrice').textContent   = fmt(sellPriceUnit);
  const profEl = $('sp_profit');
  if(profEl) { profEl.textContent = fmt(profitJob); profEl.className = 'sp-kpi-val ' + (profitJob >= 0 ? 'pos' : 'neg'); }
  const marEl = $('sp_margin');
  if(marEl)  { marEl.textContent = margin.toFixed(1) + '%'; marEl.className = 'sp-kpi-val ' + (margin >= 0 ? 'pos' : 'neg'); }

  // Donut chart data (per-job totals)
  const matCost   = (costTop+costBot+cMeshOut+cMeshIn+cTestWaste+cOutsource) * unit;
  const laborCost = (cLabor+cMachine) * unit;
  const moldCost  = cMold + fixedCost;
  const otherCost = (cLaser+cPlating+cOther+cTransport) * unit;
  const chartData = [matCost, laborCost, moldCost, otherCost].map(v => Math.max(0,v));
  const hasData   = chartData.some(v => v > 0);

  const matPct = total > 0 ? (matCost/total*100).toFixed(0) : 0;
  if($('sp_pct_mat')) $('sp_pct_mat').textContent = matPct + '%';

  const legend = $('sp_legend');
  if (!hasData) {
    if(legend) legend.innerHTML = '<div class="sp-no-data">กรอกข้อมูลเพื่อดูกราฟ</div>';
    if(_spDonut) { _spDonut.destroy(); _spDonut = null; }
    return;
  }

  const COLORS = ['#3b82f6','#34d399','#f59e0b','#a78bfa'];
  const LABELS = ['วัสดุ','แรงงาน','แม่พิมพ์','อื่นๆ'];
  const canvas  = $('spDonut');
  if (canvas && typeof Chart !== 'undefined') {
    if (_spDonut) {
      _spDonut.data.datasets[0].data = chartData;
      _spDonut.update('none');
    } else {
      _spDonut = new Chart(canvas, {
        type: 'doughnut',
        data: { labels: LABELS, datasets: [{ data: chartData, backgroundColor: COLORS, borderWidth: 0, hoverOffset: 4 }] },
        options: {
          cutout: '65%',
          plugins: { legend:{display:false}, tooltip:{ callbacks:{ label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` } } },
          animation: { duration: 250 }
        }
      });
    }
  }

  // Legend rows
  if (legend) {
    legend.innerHTML = chartData.map((v,i) => {
      const pct = total > 0 ? (v/total*100).toFixed(1) : '0.0';
      return `<div class="sp-legend-row">
        <span class="sp-legend-name"><span class="sp-legend-dot" style="background:${COLORS[i]}"></span>${LABELS[i]}</span>
        <span class="sp-legend-val">${pct}%</span>
      </div>`;
    }).join('');
  }

  // อัปเดต Pricing Intelligence
  _updatePricingInsight();
}

let _beChart = null, _cdChart = null, _pcChart = null;
function updateCharts() {
  if (typeof Chart === 'undefined') return;
  const costTop=num('f_costTop'), costBot=num('f_costBot');
  const cTestWaste=num('f_cTestWaste');
  const cMeshOut=num('f_cMeshOut'), cMeshIn=num('f_cMeshIn');
  const cLaser=num('f_cLaser'), cPlating=num('f_cPlating'), cMold=num('f_cMold');
  const cLabor=num('f_cLabor'), cMachine=num('f_cMachine');
  const cOutsource=num('f_cOutsource');
  const cOther1=num('f_cOther1'), cOther2=num('f_cOther2'), cOther3=num('f_cOther3');
  const fixedCost=num('f_fixedCost');
  const unit=num('f_unit') || 1;
  const sellPriceU=num('f_sellPrice');  // ราคา/ลูก
  const cTransport = unit > 0 ? num('f_transport')/unit : num('f_transport');
  // per-unit costs; cMold+fixedCost per-job, cTransport now per-unit
  const perUnitVar2 = costTop+costBot+cTestWaste+cOutsource+cMeshOut+cMeshIn+
                      cLaser+cPlating+cLabor+cTransport+cMachine+
                      cOther1+cOther2+cOther3;
  const total = perUnitVar2*unit + cMold + fixedCost;
  const varCost = perUnitVar2*unit + cMold;
  const vcPerUnit = unit > 0 ? varCost / unit : varCost;
  const spUnit = sellPriceU;  // already per unit
  const beQty = (spUnit > vcPerUnit && spUnit > 0) ? fixedCost / (spUnit - vcPerUnit) : 0;
  const profitPerUnit = spUnit - vcPerUnit;
  const markupPct = vcPerUnit > 0 ? (profitPerUnit / vcPerUnit * 100) : 0;
  const totalProfit = profitPerUnit * unit - fixedCost;

  // stat chips
  const beQ = $('be_qty');   if (beQ) beQ.textContent = beQty > 0 ? beQty.toFixed(1)+' ลูก' : '—';
  const beV = $('be_vc');    if (beV) beV.textContent = vcPerUnit > 0 ? fmt(vcPerUnit) : '—';
  const beM = $('be_markup');
  if (beM) { beM.textContent = sellPriceU>0 ? (markupPct>=0?'+':'')+markupPct.toFixed(1)+'%' : '—'; beM.style.color = markupPct>=0?'#34d399':'#f87171'; }
  const beR = $('be_result');
  if (beR) {
    const isProfit = totalProfit >= 0;
    beR.textContent = totalProfit !== 0 ? (isProfit?'✅ กำไร ':'❌ ขาดทุน ')+fmt(Math.abs(totalProfit)) : '—';
    beR.style.color = isProfit ? '#34d399' : '#f87171';
  }

  // ── Break-Even Line Chart ──────────────────────────
  const maxQ = Math.max(unit*2, beQty*1.8, 12);
  const steps = 12;
  const labels = Array.from({length:steps+1}, (_,i) => (maxQ/steps*i).toFixed(1));
  const fcData  = labels.map(() => fixedCost);
  const tcData  = labels.map((_,i) => fixedCost + vcPerUnit*(maxQ/steps*i));
  const revData = labels.map((_,i) => spUnit*(maxQ/steps*i));

  const beCtx = $('chartBreakEven');
  if (!beCtx) return;
  if (_beChart) { _beChart.destroy(); _beChart=null; }
  // inline vertical-line plugin (avoids Chart.register conflict on re-render)
  const beVlinePlugin = {
    id:'beVlineInline',
    afterDraw(chart) {
      if (!(unit > 0)) return;
      const {ctx,chartArea:{top,bottom},scales:{x}} = chart;
      const xCur = x.getPixelForValue(unit.toFixed(1));
      ctx.save(); ctx.strokeStyle='#fbbf24'; ctx.lineWidth=1.5; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(xCur,top); ctx.lineTo(xCur,bottom); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }
  };
  const _cs2 = getComputedStyle(document.documentElement);
  const _t2b = _cs2.getPropertyValue('--t2').trim();
  const _t3b = _cs2.getPropertyValue('--t3').trim();
  const _bcb = _cs2.getPropertyValue('--bc-div').trim();
  _beChart = new Chart(beCtx, {
    type:'line',
    data:{ labels, datasets:[
      {label:'ต้นทุนคงที่ (Fixed)',data:fcData,borderColor:'#3b82f6',borderDash:[5,4],borderWidth:2,pointRadius:0,fill:false,tension:0},
      {label:'ต้นทุนรวม (Total Cost)',data:tcData,borderColor:'#f87171',borderWidth:2,pointRadius:0,fill:false,tension:0},
      {label:'รายได้รวม (Revenue)',data:revData,borderColor:'#16a34a',borderWidth:2,pointRadius:0,fill:false,tension:0},
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{labels:{color:_t2b,font:{size:10},boxWidth:16}},
        tooltip:{mode:'index',intersect:false,callbacks:{label:ctx=>' '+ctx.dataset.label+': ฿'+ctx.raw.toLocaleString('th-TH',{maximumFractionDigits:0})}}
      },
      scales:{
        x:{ticks:{color:_t3b,font:{size:9}},grid:{color:_bcb},
           title:{display:true,text:'จำนวน (ลูก)',color:_t3b,font:{size:10}}},
        y:{ticks:{color:_t3b,font:{size:9},callback:v=>v>=1000?(v/1000).toFixed(0)+'k':v},
           grid:{color:_bcb},
           title:{display:true,text:'มูลค่า (฿)',color:_t3b,font:{size:10}}}
      }
    }
  });
  // apply inline plugin (no global Chart.register needed)
  _beChart.config.plugins = [beVlinePlugin];
  _beChart.update();

  // ── Cost Distribution Donut ────────────────────────
  const matV     = costTop+costBot+cMeshOut+cMeshIn+cTestWaste;
  const procV    = cPlating+cLaser+cOutsource;
  const laborV   = cLabor+cMachine;
  const transV   = cTransport+(unit>0?cMold/unit:cMold); // both per-unit for donut
  const fixedV   = fixedCost+cOther1+cOther2+cOther3;
  const cdVals   = [matV,procV,laborV,transV,fixedV].map(v=>Math.max(v,0));
  const cdColors = ['#34d399','#60a5fa','#fb923c','#38bdf8','#f472b6'];
  const cdLabels = ['วัตถุดิบและฝา/ตะแกรง','ค่าชุบและเลเซอร์','ค่าแรงและขึ้นรูป','ค่าขนส่ง/แม่พิมพ์','ต้นทุนคงที่/อื่นๆ'];
  const cdCtx = $('chartCostDist');
  if (!cdCtx) return;
  if (_cdChart) { _cdChart.destroy(); _cdChart=null; }
  _cdChart = new Chart(cdCtx, {
    type:'doughnut',
    data:{labels:cdLabels,datasets:[{data:cdVals,backgroundColor:cdColors,borderWidth:1,borderColor:'rgba(0,0,0,.25)',hoverOffset:6}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{label:ctx=>{ const s=cdVals.reduce((a,b)=>a+b,0); return ` ${ctx.label}: ฿${ctx.raw.toFixed(1)} (${s>0?(ctx.raw/s*100).toFixed(1):0}%)`; }}}
      }
    }
  });
  const leg = $('costDistLegend');
  if (leg) {
    const s = cdVals.reduce((a,b)=>a+b,0);
    leg.innerHTML = cdLabels.map((l,i)=>`<div style="display:flex;justify-content:space-between;gap:6px">
      <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cdColors[i]};margin-right:4px;vertical-align:middle"></span>${l}</span>
      <span style="color:var(--t2);white-space:nowrap">${fmt(cdVals[i])} (${s>0?(cdVals[i]/s*100).toFixed(1):0}%)</span>
    </div>`).join('');
  }
}

// ── Labor change detector ─────────────────────────────────────────
let _laborFingerprint = '';   // fingerprint ตอนที่ฟอร์มโหลด / หลังกด reload

function _getLaborFingerprint() {
  const keys = ['ptts_labor_rate_min','ptts_labor_rate_hour','ptts_labor_rate_day',
                 'ptts_labor_hours_per_day','ptts_labor_processes'];
  return keys.map(k => localStorage.getItem(k) || '').join('|');
}

function _saveLaborFingerprint() {
  _laborFingerprint = _getLaborFingerprint();
  $('btnReloadLabor')?.classList.remove('labor-changed');
  $('btnReloadLaborSP')?.classList.remove('labor-changed');
}

function _checkLaborChanged() {
  const btn   = $('btnReloadLabor');
  const btnSP = $('btnReloadLaborSP');
  const changed = _getLaborFingerprint() !== _laborFingerprint;
  [btn, btnSP].forEach(b => {
    if (!b) return;
    if (changed) {
      b.classList.add('labor-changed');
      b.title = 'ค่าแรงมีการเปลี่ยนแปลง — คลิกเพื่ออัปเดต';
    } else {
      b.classList.remove('labor-changed');
      b.title = '';
    }
  });
}

function recalcBtn() {
  calcLabor(); calcAll();
  _saveLaborFingerprint();   // reset — ค่าแรงถูกโหลดแล้ว
  Swal.fire({icon:'success',title:'รีโหลดค่าแรงแล้ว ✅',background:'#0a1c2e',color:'#f1f5f9',timer:1100,showConfirmButton:false,toast:true,position:'top-end'});
}

