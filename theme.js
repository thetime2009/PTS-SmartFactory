
// ── Theme System ────────────────────────────────────────────────
const _PRESETS = [
  {name:'ฟ้าน้ำ',      h1:210, h2:195},
  {name:'มิดไนท์',    h1:240, h2:260},
  {name:'ม่วง',       h1:270, h2:290},
  {name:'ฟ้าเขียว',   h1:195, h2:160},
  {name:'เขียว',      h1:155, h2:175},
  {name:'เขียวเหลือง',h1:130, h2:90 },
  {name:'ส้ม',        h1:30,  h2:20 },
  {name:'แดง',        h1:350, h2:10 },
  {name:'ชมพู',       h1:330, h2:310},
];

let _currentHue1 = parseInt(localStorage.getItem('ptts_theme_hue1') || '210');
let _currentHue2 = parseInt(localStorage.getItem('ptts_theme_hue2') || '195');
let _currentMode = localStorage.getItem('ptts_theme_mode') || 'light';

function _hslToRgb(h, s, l) {
  h /= 360;
  const q = l < .5 ? l*(1+s) : l+s-l*s;
  const p = 2*l - q;
  const hue2rgb = (p,q,t) => {
    if(t<0) t+=1; if(t>1) t-=1;
    if(t<1/6) return p+(q-p)*6*t;
    if(t<1/2) return q;
    if(t<2/3) return p+(q-p)*(2/3-t)*6;
    return p;
  };
  return [
    Math.round(hue2rgb(p,q,h+1/3)*255),
    Math.round(hue2rgb(p,q,h)*255),
    Math.round(hue2rgb(p,q,h-1/3)*255)
  ];
}

function applyTheme(h1, h2, mode) {
  _currentHue1 = h1; _currentHue2 = h2; _currentMode = mode;
  const c1 = `hsl(${h1},85%,58%)`;
  const c2 = `hsl(${h2},90%,52%)`;
  const r  = document.documentElement;

  r.style.setProperty('--c1', c1);
  r.style.setProperty('--c2', c2);
  r.style.setProperty('--grad', `linear-gradient(135deg,${c1},${c2})`);

  const [r1,g1,b1] = _hslToRgb(h1, .85, .58);
  r.style.setProperty('--c1-05', `rgba(${r1},${g1},${b1},.05)`);
  r.style.setProperty('--c1-10', `rgba(${r1},${g1},${b1},.10)`);
  r.style.setProperty('--c1-15', `rgba(${r1},${g1},${b1},.15)`);
  r.style.setProperty('--c1-20', `rgba(${r1},${g1},${b1},.20)`);
  r.style.setProperty('--c1-28', `rgba(${r1},${g1},${b1},.28)`);
  r.style.setProperty('--c1-30', `rgba(${r1},${g1},${b1},.30)`);

  if (mode === 'dark') {
    r.setAttribute('data-theme', 'dark');
  } else {
    r.removeAttribute('data-theme');
    r.style.setProperty('--bg',      `hsl(${h1},55%,95%)`);
    r.style.setProperty('--bg-deep', `hsl(${h1},50%,88%)`);
    r.style.setProperty('--t1',      `hsl(${h1},60%,22%)`);
    r.style.setProperty('--t2',      `hsl(${h1},38%,42%)`);
    r.style.setProperty('--t3',      `hsl(${h1},28%,58%)`);
    r.style.setProperty('--t4',      `hsl(${h1},22%,72%)`);
  }

  const gp = $('gradPreview');
  if (gp) gp.style.background = `linear-gradient(135deg,${c1},${c2})`;

  const ml = $('modeLight'), md = $('modeDark');
  if (ml) ml.classList.toggle('active', mode==='light');
  if (md) md.classList.toggle('active', mode==='dark');

  localStorage.setItem('ptts_theme_hue1', h1);
  localStorage.setItem('ptts_theme_hue2', h2);
  localStorage.setItem('ptts_theme_mode',  mode);

  if (_beChart) { _beChart.destroy(); _beChart = null; }
  if (_cdChart) { _cdChart.destroy(); _cdChart = null; }
  updateCharts();
}

function onHueChange() {
  const h1 = parseInt($('hue1Slider').value);
  const h2 = parseInt($('hue2Slider').value);
  applyTheme(h1, h2, _currentMode);
}

function setMode(mode) {
  applyTheme(_currentHue1, _currentHue2, mode);
}

function openThemePanel() {
  const ov = $('themePanelOverlay');
  if (!ov) return;
  const s1=$('hue1Slider'), s2=$('hue2Slider');
  if (s1) s1.value = _currentHue1;
  if (s2) s2.value = _currentHue2;
  const pc = $('themePresets');
  if (pc) pc.innerHTML = _PRESETS.map((p,i) => {
    const c1=`hsl(${p.h1},85%,58%)`, c2=`hsl(${p.h2},90%,52%)`;
    return `<button class="tp-preset" onclick="applyPreset(${i})" title="${p.name}"
      style="background:linear-gradient(135deg,${c1},${c2})"></button>`;
  }).join('');
  const gp=$('gradPreview');
  if (gp) gp.style.background=`linear-gradient(135deg,hsl(${_currentHue1},85%,58%),hsl(${_currentHue2},90%,52%))`;
  const ml=$('modeLight'), md=$('modeDark');
  if (ml) ml.classList.toggle('active', _currentMode==='light');
  if (md) md.classList.toggle('active', _currentMode==='dark');
  ov.classList.add('open');
}

function closeThemePanel(e) {
  if (e && e.target !== $('themePanelOverlay')) return;
  const ov = $('themePanelOverlay');
  if (ov) ov.classList.remove('open');
}

function applyPreset(i) {
  const p = _PRESETS[i];
  if (!p) return;
  const s1=$('hue1Slider'), s2=$('hue2Slider');
  if (s1) s1.value = p.h1;
  if (s2) s2.value = p.h2;
  applyTheme(p.h1, p.h2, _currentMode);
  // sync cfg sliders too
  const c1=$('cfgHue1'), c2=$('cfgHue2');
  if (c1) c1.value = p.h1;
  if (c2) c2.value = p.h2;
  updateCfgGradPreview();
}

// ── Setting Tab: ค่าเริ่มต้น ──────────────────────────────────────
function saveCfgDefaults() {
  const margin    = parseInt($('cfg_margin')?.value)     || 40;
  const fixedCost = parseFloat($('cfg_fixedCost')?.value) || 50;
  const machinePct= parseFloat($('cfg_machinePct')?.value) ?? 5;
  const transport = parseFloat($('cfg_transport')?.value) || 300;
  const plating   = parseFloat($('cfg_plating')?.value)  || 90;
  localStorage.setItem('ptts_margin',          margin);
  localStorage.setItem('ptts_def_fixedcost',   fixedCost);
  localStorage.setItem('ptts_machine_pct',     machinePct);
  localStorage.setItem('ptts_def_transport',   transport);
  localStorage.setItem('ptts_def_plating',     plating);
  // Apply immediately
  _selectedMargin = margin;
  document.querySelectorAll('.margin-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.pct) === margin));
  calcAll();
  const st = $('cfgDefaultsStatus');
  if (st) { st.textContent = '✓ บันทึกแล้ว'; setTimeout(() => st.textContent='', 1500); }
}

function loadCfgDefaults() {
  const margin     = parseInt(localStorage.getItem('ptts_margin'))         || 40;
  const fixedCost  = parseFloat(localStorage.getItem('ptts_def_fixedcost'))|| 50;
  const machinePct = parseFloat(localStorage.getItem('ptts_machine_pct'))  ?? 5;
  const transport  = parseFloat(localStorage.getItem('ptts_def_transport'))|| 300;
  const plating    = parseFloat(localStorage.getItem('ptts_def_plating'))  || 90;
  if ($('cfg_margin'))     $('cfg_margin').value     = margin;
  if ($('cfg_fixedCost'))  $('cfg_fixedCost').value  = fixedCost;
  if ($('cfg_machinePct')) $('cfg_machinePct').value = machinePct;
  if ($('cfg_transport'))  $('cfg_transport').value  = transport;
  if ($('cfg_plating'))    $('cfg_plating').value    = plating;
}

// ── Setting Tab: ธีม inline ──────────────────────────────────────
function onCfgHueChange() {
  const h1 = parseInt($('cfgHue1').value);
  const h2 = parseInt($('cfgHue2').value);
  applyTheme(h1, h2, _currentMode);
  // sync old sliders
  const s1=$('hue1Slider'), s2=$('hue2Slider');
  if (s1) s1.value = h1;
  if (s2) s2.value = h2;
  updateCfgGradPreview();
}

function updateCfgGradPreview() {
  const gp = $('cfgGradPreview');
  if (gp) gp.style.background=`linear-gradient(135deg,hsl(${_currentHue1},85%,58%),hsl(${_currentHue2},90%,52%))`;
}

function highlightModeBtn() {
  const btnL = $('cfgModeLight'), btnD = $('cfgModeDark');
  if (!btnL || !btnD) return;
  const isLight = _currentMode === 'light';
  btnL.style.borderColor = isLight  ? 'var(--c1)' : 'var(--inp-bc)';
  btnL.style.color       = isLight  ? 'var(--c1)' : 'var(--txt)';
  btnL.style.background  = isLight  ? 'var(--c1-10)' : 'var(--inp-bg)';
  btnD.style.borderColor = !isLight ? 'var(--c1)' : 'var(--inp-bc)';
  btnD.style.color       = !isLight ? 'var(--c1)' : 'var(--txt)';
  btnD.style.background  = !isLight ? 'var(--c1-10)' : 'var(--inp-bg)';
}

function initCfgTheme() {
  const c1=$('cfgHue1'), c2=$('cfgHue2');
  if (c1) c1.value = _currentHue1;
  if (c2) c2.value = _currentHue2;
  const presets = $('cfgThemePresets');
  if (presets) presets.innerHTML = _PRESETS.map((p,i) => {
    const cc1=`hsl(${p.h1},85%,58%)`, cc2=`hsl(${p.h2},90%,52%)`;
    return `<button class="tp-preset" onclick="applyPreset(${i})" title="${p.name}"
      style="background:linear-gradient(135deg,${cc1},${cc2})"></button>`;
  }).join('');
  updateCfgGradPreview();
  highlightModeBtn();
}

// ── Share Card after Save ─────────────────────────────────────────

function _fmtShareN(n) {
  return (parseFloat(n)||0).toLocaleString('th-TH', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function _shareRow(row) {
  // DT-aligned 0-based indices
  return {
    noQuo    : row[1]  || '—',
    date     : row[2]  || '—',
    od       : row[3],  id2: row[4],  h: row[5],
    od2      : parseFloat(row[54]) || 0,
    unit     : parseInt(row[6])  || 0,
    size     : row[7]  || '—',
    workType : row[8]  || '',
    meshOut  : row[17] || '',    // ตะแกรงนอก
    meshIn   : row[19] || '',    // ตะแกรงใน
    totalCost: parseFloat(row[40]) || 0,
    sellPrice: parseFloat(row[41]) || 0,
    profitU  : parseFloat(row[42]) || 0,
    profitJ  : parseFloat(row[43]) || 0,
    gapWeld  : row[44] != null && row[44] !== '' ? row[44] : '',  // AS
    contact  : row[45] || '—',
    remark   : row[46] || '',
    quoter   : row[47] || '',
    rawMat   : row[48] || '',
    refId    : row[53] || '—',
    rev      : parseInt(row[59]) || 0,
  };
}

function buildShareText(row) {
  const d = _shareRow(row);
  const size = (d.od && d.id2 && d.h)
    ? (d.od2 > 0 ? `${d.od2} / ${d.od}×${d.id2}×${d.h} mm.` : `${d.od}×${d.id2}×${d.h} mm.`)
    : d.size;
  const marginPct = d.sellPrice > 0 ? ((d.profitU/d.sellPrice)*100).toFixed(1) : '0';
  const now = new Date();
  const thDate = now.toLocaleDateString('th-TH',{year:'numeric',month:'numeric',day:'numeric'})
               + ' ' + now.toLocaleTimeString('th-TH');

  return [
    '📢 แจ้งเสนอราคา',
    '---------------------------------',
    `เลขอ้างอิง: ${d.refId}${d.rev > 0 ? ' Rev.'+d.rev : ''}`,
    d.workType  ? `แบบงาน: ${d.workType}` : '',
    `รายการ: ${size}`,
    `จำนวน: ${d.unit.toLocaleString('th-TH')} ลูก.`,
    d.meshOut   ? `ตะแกรงนอก: ${matLabel(d.meshOut)}` : '',
    d.meshIn    ? `ตะแกรงใน: ${matLabel(d.meshIn)}`   : '',
    d.gapWeld !== '' ? `ช่องว่างจีบเหลือ: ${d.gapWeld} mm.` : '',
    `หมายเหตุ: ${d.remark || '-'}`,
    `ราคา: @ ${Math.round(d.sellPrice).toLocaleString('th-TH')}.-`,
    '----------------------------------',
    `📅 วันที่: ${thDate}`,
  ].filter(Boolean).join('\n');
}

function buildShareCardHTML(row) {
  const d = _shareRow(row);
  const { noQuo, date, od, id2, h, od2, unit, workType, meshOut, meshIn,
          totalCost, sellPrice, profitU, profitJ, gapWeld,
          contact, remark, quoter, rawMat, refId, rev } = d;
  const size = (od && id2 && h)
    ? (od2 > 0 ? `${od2} / ${od} × ${id2} × ${h} mm` : `${od} × ${id2} × ${h} mm`)
    : (row[7]||'—');

  // company logo
  const logoB64 = _companyInfoCache && _companyInfoCache.logoUrl;
  const logoHTML = logoB64
    ? `<img src="${logoB64}" style="width:44px;height:44px;border-radius:10px;object-fit:contain;background:#fff;padding:2px;flex-shrink:0">`
    : `<div style="width:44px;height:44px;background:rgba(255,255,255,.2);border-radius:10px;
        display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0">🏭</div>`;

  // row helper — light card style
  const row_ = (icon, label, val, valColor, bg) => `
    <div style="display:flex;align-items:center;gap:10px;padding:11px 16px;
      border-bottom:1px solid #f1f5f9;${bg?`background:${bg};`:''}">
      <span style="font-size:1.05rem;min-width:22px;text-align:center">${icon}</span>
      <span style="font-size:.82rem;color:#64748b;min-width:90px;flex-shrink:0">${label}</span>
      <span style="font-size:.88rem;font-weight:600;color:${valColor||'#1e293b'};flex:1">${val}</span>
    </div>`;

  const gapRow = (() => {
    if (gapWeld === '') return '';
    const autoG = (d.od > 0 && d.id2 > 0) ? (((d.od-5)-(d.id2+5))/2).toFixed(1) : null;
    const isCust = autoG !== null && parseFloat(gapWeld) !== parseFloat(autoG);
    const lbl = isCust ? 'ช่องว่างจีบ <span style="color:#f59e0b;font-size:.72rem">(ลูกค้ากำหนด)</span>' : 'ช่องว่างจีบ';
    return row_('↔️', lbl, `${gapWeld} mm.`);
  })();

  const imgSection = ((_lastSavedImage || _attachedImage) && !(_lastSavedImage || _attachedImage).legacy) ? (() => {
    const img = _lastSavedImage || _attachedImage;
    return `<div style="padding:10px 16px 0">
      <div style="font-size:.7rem;font-weight:700;color:#94a3b8;text-transform:uppercase;
        letter-spacing:.6px;margin-bottom:6px">📎 รูปใบขอราคา</div>
      <div role="img" aria-label="ใบขอราคา" onclick="viewAttachedImage()"
        style="width:100%;height:200px;border-radius:8px;border:1px solid #e2e8f0;
        background:#f8fafc url('${img.dataUrl}') center center / contain no-repeat;cursor:pointer"></div>
    </div>`;
  })() : '';

  return `
  <div id="shareCardInner" style="background:#fff;border-radius:16px;overflow:hidden;
    font-family:'Sarabun',Tahoma,sans-serif;text-align:left;
    box-shadow:0 20px 50px rgba(0,0,0,.18);margin:-8px -16px">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#3b5bdb,#7c3aed);padding:16px 18px 14px;
      position:relative;overflow:hidden">
      <div style="position:absolute;top:-20px;right:-20px;width:100px;height:100px;
        border-radius:50%;background:rgba(255,255,255,.08)"></div>
      <div style="display:flex;align-items:center;gap:12px;position:relative">
        ${logoHTML}
        <div style="flex:1">
          <div style="font-size:1rem;font-weight:800;color:#fff;letter-spacing:.2px">PTS Quotation</div>
          <div style="font-size:.72rem;color:rgba(255,255,255,.75);margin-top:1px">Quotation Summary</div>
        </div>
        <div style="background:rgba(255,255,255,.18);padding:4px 12px;border-radius:999px;
          font-size:.72rem;color:#fff;font-weight:700;border:1px solid rgba(255,255,255,.3)">
          ✅ บันทึกแล้ว
        </div>
      </div>
    </div>

    <!-- Date + Ref -->
    <div style="background:#fff">
      ${row_('📅','วันที่', date)}
      ${row_('🔗','Ref', `<span style="color:#6366f1;font-size:.82rem">${refId}${rev > 0 ? ' Rev.'+rev : ''}</span>`, null)}
    </div>

    <!-- Section: ข้อมูลชิ้นงาน -->
    <div style="padding:8px 16px 4px;background:#f8fafc;
      border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">
      <span style="font-size:.72rem;font-weight:800;color:#475569;
        letter-spacing:.5px;text-transform:uppercase">ข้อมูลชิ้นงาน</span>
    </div>
    <div style="background:#fff">
      ${rawMat   ? row_('🧱','วัตถุดิบ', rawMat) : ''}
      ${workType ? row_('🔧','แบบงาน', workType) : ''}
      ${row_('📐','ขนาด', size)}
      ${unit > 0 ? row_('🔢','จำนวน', `${unit.toLocaleString('th-TH')} ลูก`) : ''}
      ${meshOut  ? row_('🟪','ตะแกรงนอก', matLabel(meshOut), '#1e293b', meshIn?'':'') : ''}
      ${meshIn   ? row_('🟫','ตะแกรงใน',  matLabel(meshIn),  '#1e293b', '') : ''}
      ${gapRow}
      ${remark   ? row_('📝','หมายเหตุ', remark, '#d97706') : ''}
    </div>

    <!-- ราคา -->
    <div style="display:flex;align-items:center;gap:12px;padding:14px 18px;
      background:#fff;border-top:2px solid #f1f5f9">
      <span style="font-size:1.1rem">💰</span>
      <span style="font-size:.88rem;color:#475569;font-weight:600;white-space:nowrap">ราคาเสนอ / ลูก</span>
      <span style="font-size:1.45rem;font-weight:800;color:#16a34a;
        border:2.5px solid #16a34a;border-radius:999px;
        padding:3px 20px;letter-spacing:.5px;white-space:nowrap">
        ${Math.round(sellPrice).toLocaleString('th-TH')}.-
      </span>
    </div>

    ${imgSection}
    <div style="padding-bottom:6px"></div>
  </div>`;
}

async function shareCardAsImage(row) {
  const el = $('shareCardEl');
  if (!el) return;
  el.innerHTML = buildShareCardHTML(row);
  el.style.left = '-9999px';
  el.style.top  = '0';
  el.style.display = 'block';
  try {
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch(e) {} }
    await new Promise(r => setTimeout(r, 80)); // wait for fonts/layout
    // รอให้รูปแนบ (ถ้ามี) โหลด/ถอดรหัสเสร็จก่อน ไม่งั้น html2canvas จะ capture ตอนรูปยังไม่มาขนาด แล้วได้ภาพยืด/บิดเบี้ยว
    const imgs = el.querySelectorAll('img');
    await Promise.all(Array.from(imgs).map(im => {
      if (im.complete && im.naturalWidth > 0) return Promise.resolve();
      return new Promise(res => {
        im.addEventListener('load', res, { once:true });
        im.addEventListener('error', res, { once:true });
        setTimeout(res, 1500); // กันค้าง
      });
    }));
    const canvas = await html2canvas(el, {
      backgroundColor: null, scale: 2,
      useCORS: true, allowTaint: true,
      width: 480, logging: false
    });
    el.style.display = 'none';
    return canvas;
  } catch(e) {
    el.style.display = 'none';
    throw e;
  }
}

async function shareToLine(row) {
  const text = buildShareText(row);
  // Try Web Share API first (mobile native share sheet)
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch(e) { /* fallback */ }
  }
  // Fallback: LINE URL scheme
  window.open('https://line.me/R/msg/text/?' + encodeURIComponent(text), '_blank');
}

async function copyShareText(row) {
  const text = buildShareText(row);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch(e) {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  }
}

async function downloadShareImage(row) {
  try {
    const canvas = await shareCardAsImage(row);
    if (!canvas) return;
    const noQuo = row[1] || 'quo';
    const link  = document.createElement('a');
    link.download = `PTS-${noQuo}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch(e) {
    Swal.fire({icon:'warning',title:'ไม่สามารถสร้างรูปได้',text:e.message,
      background:'#0d1b2a',color:'#cce4ff',timer:2500,showConfirmButton:false,toast:true,position:'top-end'});
  }
}

async function shareCardImage(row) {
  // Capture card → blob → Web Share API (ไม่บันทึกในเครื่อง)
  try {
    const canvas = await shareCardAsImage(row);
    if (!canvas) return;
    const noQuo = row[1] || 'quo';
    const fileName = `PTS-${noQuo}.png`;

    // ใช้ Web Share API พร้อม files (mobile native share sheet → เลือก Telegram ได้)
    if (navigator.canShare && navigator.share) {
      canvas.toBlob(async blob => {
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
            return;
          } catch(e) { /* user cancelled or not supported */ }
        }
        // fallback: download
        const link = document.createElement('a');
        link.download = fileName;
        link.href = URL.createObjectURL(blob);
        link.click();
      }, 'image/png');
    } else {
      // fallback: download
      const link = document.createElement('a');
      link.download = fileName;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  } catch(e) {
    Swal.fire({icon:'warning',title:'ไม่สามารถแชร์รูปได้',text:e.message,
      background:'#0d1b2a',color:'#cce4ff',timer:2500,showConfirmButton:false,toast:true,position:'top-end'});
  }
}

function showSaveSuccessCard(row, isUpdate) {
  Swal.fire({
    html: buildShareCardHTML(row),
    background: '#fff',
    backdrop: 'rgba(15,23,42,.7)',
    showConfirmButton: false,
    showCloseButton: true,
    width: 480,
    padding: '0',
    customClass: { popup: 'share-card-popup', closeButton: 'share-card-close' },
    footer: `
      <div style="display:flex;gap:8px;width:100%;flex-wrap:wrap;padding:0 4px 4px">
        <!-- Upload รูป -->
        <label style="flex:1;min-width:110px;display:flex;align-items:center;justify-content:center;
          gap:5px;padding:10px 8px;border-radius:10px;border:1.5px dashed #cbd5e1;
          background:#f8fafc;color:#64748b;font-family:Sarabun,sans-serif;font-size:.82rem;
          font-weight:600;cursor:pointer" title="อัปโหลดรูปใบขอราคา">
          📎 อัปโหลดรูป
          <input type="file" accept="image/*" style="display:none"
            onchange="(function(e){
              const f=e.target.files[0]; if(!f) return;
              const r=new FileReader();
              r.onload=ev=>{
                _attachedImage={dataUrl:ev.target.result,name:f.name,size:f.size};
                _lastSavedImage=_attachedImage;
                Swal.close();
                showSaveSuccessCard(_lastSavedRow,false);
              };
              r.readAsDataURL(f);
            })(event)">
        </label>
        <!-- คัดลอก -->
        <button onclick="copyShareText(_lastSavedRow).then(()=>{
          this.textContent='✅ คัดลอกแล้ว!';setTimeout(()=>this.textContent='📋 คัดลอก',1500)})"
          style="flex:1;min-width:110px;padding:10px 8px;border-radius:10px;
          border:1.5px solid #e2e8f0;background:#f8fafc;color:#475569;
          font-family:Sarabun,sans-serif;font-size:.82rem;font-weight:600;cursor:pointer">
          📋 คัดลอก</button>
        <!-- ส่งรูป -->
        <button onclick="shareCardImage(_lastSavedRow)"
          style="flex:1;min-width:110px;padding:10px 8px;border-radius:10px;border:none;
          background:linear-gradient(135deg,#0088cc,#229ed9);color:#fff;
          font-family:Sarabun,sans-serif;font-size:.82rem;font-weight:700;
          cursor:pointer;box-shadow:0 3px 10px rgba(0,136,204,.3)">
          ✈️ ส่งรูป</button>
        <!-- บันทึกรูป -->
        <button onclick="downloadShareImage(_lastSavedRow)"
          style="flex:1;min-width:110px;padding:10px 8px;border-radius:10px;
          border:1.5px solid #e2e8f0;background:#f8fafc;color:#475569;
          font-family:Sarabun,sans-serif;font-size:.82rem;font-weight:600;cursor:pointer">
          🖼 บันทึกรูป</button>
        <!-- ปิด -->
        <button onclick="Swal.close()"
          style="flex:1;min-width:110px;padding:10px 8px;border-radius:10px;
          border:1.5px solid #fca5a5;background:#fff1f2;color:#dc2626;
          font-family:Sarabun,sans-serif;font-size:.82rem;font-weight:700;cursor:pointer">
          ✕ ปิด</button>
      </div>`,
  });
}

let _lastSavedRow   = null;
let _lastSavedImage = null;  // snapshot รูปแนบ ณ ตอน save

// ── HELP SYSTEM ──────────────────────────────────────────────────────
const _TIPS = {
  custgap: {
    title: '↔️ ลูกค้ากำหนดช่องว่าง',
    body: `<b>ค่าปกติ = 0</b> → ระบบคำนวณช่องว่างอัตโนมัติจาก OD และ ID<br><br>
           <b>ถ้าลูกค้ากำหนด เช่น 10 mm</b> → ตะแกรงในจะใหญ่ขึ้น ราคาเพิ่มตาม<br><br>
           สูตรที่ใช้:<br>
           • Auto: <code>(OD-5 - ID-5) ÷ 2</code><br>
           • Custom: ตะแกรงใน = <code>(OD - custgap×2) × π + 50</code><br><br>
           ⚠️ ค่าที่ใส่ต้องน้อยกว่า auto gap`
  },
  overhead: {
    title: '💰 ต้นทุนคงที่ / Overhead',
    body: `ค่าใช้จ่ายบริหารที่บวกเพิ่มต่อชิ้น เช่น ค่าไฟ ค่าเช่า ค่าน้ำ<br><br>
           <b>ค่าเริ่มต้น:</b> กำหนดได้ใน Config → ค่าเริ่มต้น<br><br>
           <b>ตัวอย่าง:</b> ถ้าใส่ 50 บาท/ลูก → ต้นทุนรวมจะบวก 50 บาทต่อชิ้นงาน<br><br>
           รวมอยู่ใน <b>ต้นทุนรวม</b> ก่อนคำนวณราคาขาย`
  },
  refid: {
    title: '🔗 เลขอ้างอิง (Ref)',
    body: `สร้างอัตโนมัติทุกครั้งที่เปิดฟอร์มใหม่<br><br>
           <b>รูปแบบ:</b> <code>Q-YYYYMMDD-XXXX</code><br>
           ตัวอย่าง: <code>Q-20260608-1205</code><br><br>
           • YYYYMMDD = วันที่ปัจจุบัน<br>
           • XXXX = เลขสุ่ม 4 หลัก<br><br>
           เก็บใน <b>คอลัมน์ BB</b> ของ Google Sheet ใช้สำหรับค้นหางานได้`
  },
  labor: {
    title: '👷 อัตราค่าแรง',
    body: `กำหนดได้ใน <b>Config → ค่าแรง</b><br><br>
           <b>โหมดคำนวณ:</b><br>
           • ฿/นาที × เวลาต่อกระบวนการ<br>
           • ฿/ชั่วโมง × ชั่วโมงต่อกระบวนการ<br>
           • ฿/วัน × จำนวนวัน<br><br>
           <b>ปุ่ม "รีโหลดค่าแรง"</b> จะสว่างขึ้น (เหลือง) เมื่อ config ค่าแรงมีการเปลี่ยนแปลง<br>
           กดเพื่ออัพเดทค่าแรงในฟอร์มปัจจุบัน`
  }
};

function showTip(key) {
  const t = _TIPS[key];
  if (!t) return;
  Swal.fire({
    title: t.title,
    html: `<div style="text-align:left;font-size:.88rem;line-height:1.7;color:#cbd5e1">${t.body}</div>`,
    background: '#0d1b2a', color: '#e2e8f0',
    confirmButtonColor: '#1d65cc', confirmButtonText: 'ได้เลย',
    width: 400,
  });
}

function showHelp(section) {
  const sections = [
    { id:'start', icon:'🚀', title:'เริ่มต้นใช้งาน', body:`
      <b>ขั้นตอนแรก:</b> ไปที่แท็บ <b>⚙️ Config</b> แล้วใส่ <b>Script URL</b> ของ Google Apps Script<br><br>
      <b>ไม่มี Script URL?</b> ดูวิธีติดตั้งใน <code>วิธีติดตั้ง.txt</code> ที่มาพร้อมกับโปรเจค<br><br>
      หลังจากตั้งค่าแล้ว กดปุ่ม <b>🔄 รีเฟรช</b> เพื่อดึงข้อมูลจาก Google Sheet` },
    { id:'general', icon:'📋', title:'ข้อมูลทั่วไป', body:`
      <b>สถานะ:</b> รอสรุป / ยืนยันแล้ว / ยกเลิก<br>
      <b>No.Quo:</b> เลขใบเสนอราคา สร้างอัตโนมัติ<br>
      <b>วันที่:</b> บันทึกเป็นรูปแบบ วัน/เดือน/ปีพ.ศ. (เช่น 8/6/2569)<br>
      <b>เลขอ้างอิง:</b> สร้างอัตโนมัติ <code>Q-YYYYMMDD-XXXX</code> ใช้ค้นหางาน<br>
      <b>ลูกค้า / ผู้ติดต่อ:</b> เลือกจาก dropdown (กำหนดใน Config)` },
    { id:'size', icon:'📐', title:'ขนาดชิ้นงาน', body:`
      <b>OD:</b> เส้นผ่าศูนย์กลางนอก (mm)<br>
      <b>ID:</b> เส้นผ่าศูนย์กลางใน (mm)<br>
      <b>H:</b> ความสูง (mm)<br><br>
      <b>ช่องว่างใส่จีบ:</b> คำนวณอัตโนมัติ = (OD-5 - ID-5) ÷ 2<br>
      <b>ลูกค้ากำหนดช่องว่าง:</b> ใส่เมื่อลูกค้าระบุมา → ราคาตะแกรงในจะเพิ่มตาม<br><br>
      <b>🔍 ตรวจสอบแม่พิมพ์:</b> กรอก OD+ID แล้วระบบเทียบกับ Config อัตโนมัติ` },
    { id:'material', icon:'🧱', title:'วัสดุ & ต้นทุน', body:`
      <b>MAT:</b> เลือกวัสดุจาก dropdown → ราคา/ลูกคำนวณอัตโนมัติจากสูตรตัด<br><br>
      <b>ราคา Auto:</b> ดึงจากแท็บ DATA ใน Google Sheet<br>
      ถ้าราคาไม่ถูก → แก้ใน Sheet แล้วกด รีเฟรช<br><br>
      <b>เลือก "ไม่มี":</b> ราคาจะเป็น 0 อัตโนมัติ<br><br>
      <b>เทสเสีย:</b> คำนวณ 15% ของต้นทุนวัสดุรวม` },
    { id:'labor', icon:'👷', title:'ค่าแรง', body:`
      ตั้งค่าได้ใน <b>Config → ค่าแรง</b><br><br>
      <b>กระบวนการ:</b> เพิ่มได้หลาย process เช่น ตัด, เชื่อม, ขัด<br>
      แต่ละ process มีเวลาและอัตราแยกกัน<br><br>
      <b>ปุ่มรีโหลดค่าแรง:</b> จะสว่างเหลืองเมื่อแก้ Config แล้วยังไม่อัพเดทฟอร์ม<br><br>
      <b>ค่าขนส่ง:</b> เลือก 100/200/300/500 หรือพิมพ์เองได้` },
    { id:'price', icon:'💰', title:'ราคาเสนอ', body:`
      <b>ต้นทุน/ลูก:</b> รวมทุกรายการ วัสดุ + ค่าแรง + Overhead + อื่นๆ<br><br>
      <b>Margin:</b> กำหนดใน Config (%) → ราคาขาย = ต้นทุน × (1 + margin%)<br>
      ราคาขายปัดขึ้นเป็นจำนวนเต็ม 10 อัตโนมัติ<br><br>
      <b>ราคาขาย:</b> แก้ไขเองได้ตลอดเวลา` },
    { id:'save', icon:'💾', title:'บันทึก & แชร์', body:`
      <b>💾 บันทึก:</b> ต้องกรอก "ลูกค้า" ก่อนถึงบันทึกได้<br><br>
      หลังบันทึก จะแสดง <b>Card สรุปใบเสนอราคา</b> พร้อมปุ่ม:<br>
      • 📋 คัดลอก → คัดลอกข้อความ Telegram format<br>
      • ✈️ ส่งรูป → แชร์รูป Card ผ่าน Telegram/LINE/อื่นๆ<br>
      • 🖼 บันทึกรูป → save ไฟล์ PNG ลงเครื่อง<br><br>
      <b>📎 แนบรูป:</b> แนบใบขอราคาจากลูกค้า → แสดงใน Card + ช่วย AI อ่านแบบ` },
    { id:'config', icon:'⚙️', title:'Config & ตั้งค่า', body:`
      <b>Script URL:</b> URL ของ Google Apps Script (บันทึกครั้งเดียว)<br>
      <b>ค่าเริ่มต้น:</b> Margin%, Overhead, ค่าชุบ, ค่าขนส่ง<br>
      <b>ค่าแรง:</b> อัตรา ฿/นาที ฿/ชั่วโมง ฿/วัน และกระบวนการ<br>
      <b>สูตรตัด:</b> กำหนดสูตรคำนวณขนาดตัดแต่ละชิ้นส่วน<br>
      <b>แม่พิมพ์:</b> เพิ่มขนาด OD ที่มีแม่พิมพ์อยู่<br>
      <b>ลูกค้า:</b> เพิ่มรายชื่อลูกค้าสำหรับ dropdown` },
  ];

  const navHtml = sections.map(s =>
    `<button onclick="document.querySelectorAll('.help-sec').forEach(e=>e.style.display='none');document.getElementById('hs-${s.id}').style.display='block';this.parentElement.querySelectorAll('button').forEach(b=>b.style.background='transparent');this.style.background='rgba(99,102,241,.25)'"
      style="padding:7px 12px;border:none;border-radius:8px;background:transparent;color:#cbd5e1;font-family:Sarabun,sans-serif;font-size:.82rem;cursor:pointer;text-align:left;width:100%">
      ${s.icon} ${s.title}</button>`
  ).join('');

  const contentHtml = sections.map((s, i) =>
    `<div id="hs-${s.id}" class="help-sec" style="display:${i===0?'block':'none'}">
      <div style="font-size:.95rem;font-weight:700;color:#e2e8f0;margin-bottom:10px">${s.icon} ${s.title}</div>
      <div style="font-size:.85rem;line-height:1.75;color:#cbd5e1">${s.body}</div>
    </div>`
  ).join('');

  Swal.fire({
    html: `
      <div style="display:flex;gap:0;height:380px;text-align:left;font-family:Sarabun,sans-serif">
        <div style="width:145px;flex-shrink:0;border-right:1px solid rgba(255,255,255,.1);padding:8px 6px;overflow-y:auto;display:flex;flex-direction:column;gap:2px">
          ${navHtml}
        </div>
        <div style="flex:1;padding:14px 16px;overflow-y:auto">${contentHtml}</div>
      </div>`,
    background: '#0d1b2a', color: '#e2e8f0',
    title: '📖 คู่มือการใช้งาน PTS',
    showConfirmButton: false,
    showCloseButton: true,
    width: 620,
    didOpen: () => {
      // highlight first nav button
      const btns = document.querySelectorAll('.swal2-html-container button');
      if (btns.length) btns[0].style.background = 'rgba(99,102,241,.25)';
    }
  });
}

function reshowShareCard() {
  if (!_lastSavedRow) return;
  showSaveSuccessCard(_lastSavedRow, !!_loadedNoQuo);
}

function _enableShareBtn(row) {
  _lastSavedRow = row;
  // enable mobile btn
  const btn = $('btnReshowCard');
  if (btn) {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor  = 'pointer';
    btn.title = 'เปิดการ์ดแชร์อีกครั้ง';
  }
  // enable desktop (SP) btn
  const btnSP = $('btnReshowCardSP');
  if (btnSP) {
    btnSP.disabled = false;
    btnSP.style.opacity = '1';
    btnSP.style.cursor  = 'pointer';
    btnSP.title = 'เปิดการ์ดแชร์อีกครั้ง';
  }
}

// ── Summary Panel Resize ─────────────────────────────────────────
// ใช้ CSS variable --sp-width เพื่อให้ทั้ง panel width และ body padding-right sync กัน
const SP_WIDTH_KEY = 'ptts_sp_width';
const SP_DEFAULT   = 544;   // px — ค่าเริ่มต้น (กว้างกว่าเดิม 2x)
const SP_MIN       = 220;   // px — แคบสุด
const SP_MAX       = 900;   // px — กว้างสุด

function _spSetWidth(w) {
  // จำกัดความกว้างสูงสุดตามหน้าจอจริง (กันแผงสรุปต้นทุนใหญ่เกินไปบนแท็บเล็ตแนวนอน)
  const viewportCap = Math.floor(window.innerWidth * 0.35);
  const cap = Math.max(SP_MIN, Math.min(SP_MAX, viewportCap));
  w = Math.max(SP_MIN, Math.min(cap, Math.round(w)));
  document.documentElement.style.setProperty('--sp-width', w + 'px');
  localStorage.setItem(SP_WIDTH_KEY, w);
}

function _spInitResize() {
  // โหลดความกว้างที่บันทึกไว้ (หรือใช้ default)
  const saved = parseInt(localStorage.getItem(SP_WIDTH_KEY));
  _spSetWidth(isNaN(saved) ? SP_DEFAULT : saved);

  // ปรับขนาดใหม่อัตโนมัติเมื่อหมุนจอ/เปลี่ยนขนาดหน้าจอ
  window.addEventListener('resize', () => {
    const sv = parseInt(localStorage.getItem(SP_WIDTH_KEY));
    _spSetWidth(isNaN(sv) ? SP_DEFAULT : sv);
  });

  const handle = $('spResizeHandle');
  if (!handle) return;

  let dragging = false, startX = 0, startW = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = parseInt(getComputedStyle($('summaryPanel')).width) || SP_DEFAULT;
    handle.classList.add('dragging');
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta = startX - e.clientX; // ลากซ้าย = กว้างขึ้น
    _spSetWidth(startW + delta);
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.userSelect = '';
  });

  // ดับเบิ้ลคลิก = reset กลับ default
  handle.addEventListener('dblclick', () => _spSetWidth(SP_DEFAULT));
}

// ── Init ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Init summary panel resize (ต้องก่อน switchTab เพื่อให้ padding-right ถูกต้อง)
  _spInitResize();
  // Render tab bar from saved config (sidebar logo ถูกสร้างตรงนี้)
  renderTabBar();
  // Apply saved logo หลัง renderTabBar เพื่อให้ครบทุก element
  _applyLogoAll();
  // โหลดข้อมูลบริษัท (ชีต Company) มา cache ไว้ใช้ทุกจุด
  _fetchCompanyInfo();
  // ทุกครั้งที่เปิดโปรแกรมใหม่ (รีเฟรช/เปิดแท็บใหม่) → เริ่มที่แท็บ "ติดตามงาน/แดชบอร์ด" เสมอ
  switchTab('track');

  // เปิดจากปุ่ม "เปิดเต็มจอ" (?track=full) → แท็บใหม่นี้แสดงเฉพาะติดตามงานแบบเต็มจอ
  if (new URLSearchParams(location.search).get('track') === 'full') {
    switchTab('track');
    document.body.classList.add('trk-fullscreen-mode');
  }
  _updateDraftBadge(); // แสดงจำนวนแบบร่างที่บันทึกไว้

  // Init labor fingerprint (baseline = ค่าที่โหลดมาตอนเปิดฟอร์ม)
  _saveLaborFingerprint();

  // Restore script URL
  const savedUrl = localStorage.getItem('ptts_script_url') || '';
  if (savedUrl) {
    SCRIPT_URL = savedUrl;
    if ($('apiTab_scriptUrl')) $('apiTab_scriptUrl').value = savedUrl;
  }

  // Restore AI provider + key previews
  selectProvider(AI_PROVIDER);
  ['anthropic','openai','gemini'].forEach(prov => {
    if (AI_KEYS[prov]) {
      updateKeyPreview(prov, AI_KEYS[prov]);
      const inp = $('key_' + prov);
      if (inp) inp.value = AI_KEYS[prov];
    }
  });

  // Restore margin
  const savedMargin = parseInt(localStorage.getItem('ptts_margin')) || 40;
  _selectedMargin = savedMargin;
  document.querySelectorAll('.margin-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.pct) === savedMargin);
  });

  // Restore labor config
  const savedRate = localStorage.getItem('ptts_labor_rate');
  const savedPer  = localStorage.getItem('ptts_rate_per');
  if (savedRate && $('f_laborRate'))  $('f_laborRate').value  = savedRate;
  if (savedPer  && $('f_ratePer'))   $('f_ratePer').value    = savedPer;

  // Default cost values — ใช้ค่าจาก Settings tab ถ้ามี
  const defTransport = localStorage.getItem('ptts_def_transport') || '300';
  const defPlating   = localStorage.getItem('ptts_def_plating')   || '90';
  const defFixedCost = localStorage.getItem('ptts_def_fixedcost') || '50';
  if ($('f_transport')  && !$('f_transport').value)  $('f_transport').value  = defTransport;
  if ($('f_cPlating')   && !$('f_cPlating').value)   $('f_cPlating').value   = defPlating;
  if ($('f_fixedCost')  && !$('f_fixedCost')._userSet) $('f_fixedCost').value = defFixedCost;

  // Load Settings tab UI
  loadCfgDefaults();
  initCfgTheme();

  // ค่าเริ่มต้นวันที่ = วันนี้
  if ($('f_date') && !$('f_date').value) {
    $('f_date').value = new Date().toISOString().split('T')[0];
  }

  // สร้างเลขอ้างอิงครั้งแรก
  initRefId();

  // Apply saved theme
  applyTheme(_currentHue1, _currentHue2, _currentMode);

  // Load data & calc
  if (SCRIPT_URL) loadAllData();
  calcAll();
  renderPartFormulas();
  renderSpecMatTable();
  setTimeout(updateCharts, 400);
});

// ── Part Formula System (drives runCalc) ──────────────────────────
function _escH(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderCustomFormulas() { renderPartFormulas(); }  // alias

function renderPartFormulas() {
  const list = $('pfList');
  if (!list) return;
  if (!_partFormulas || !_partFormulas.length) _partFormulas = _DEFAULT_PART_FORMULAS.map(f=>({...f}));
  const od=num('f_od'), id=num('f_id'), h=num('f_h'), unit=num('f_unit')||1;
  const custgap=num('f_custGap')||0;
  const ef = expr => {
    try {
      return new Function('od','id','h','unit','pi','sqrt','pow','custgap',
        '"use strict";return('+expr+')')(od,id,h,unit,Math.PI,Math.sqrt,Math.pow,custgap);
    } catch(e) { return null; }
  };
  const fmtN = v => (v===null||isNaN(v))
    ? '<span style="color:#f87171">⚠️</span>'
    : '<span style="color:#34d399;font-weight:700">'+(Number.isInteger(+v)?Number(v).toLocaleString('th-TH'):Number(v).toFixed(2))+'</span>';

  list.innerHTML = _partFormulas.map((pf, i) => `
    <div class="pf-part-card">
      <div class="pf-part-name" style="display:flex;justify-content:space-between;align-items:center">
        <span>${_escH(pf.name)}</span>
        <label style="display:flex;align-items:center;gap:5px;font-size:.73rem;color:var(--t3);font-weight:400;cursor:pointer">
          <input type="checkbox" id="pf_nf_${i}" ${pf.noFlip?'checked':''} onchange="_pfChange()"
            style="accent-color:var(--c1);width:13px;height:13px">
          ล็อกทิศทาง
        </label>
      </div>
      <div class="cf-row" style="margin-bottom:6px;margin-top:6px">
        <span style="flex:0 0 46px;text-align:right;font-size:.73rem;color:var(--t3)">กว้าง</span>
        <input class="cf-expr-inp" id="pf_cw_${i}" value="${_escH(pf.cw)}"
          oninput="_pfChange()" placeholder="เช่น od+50">
        <span class="pf-val">${fmtN(ef(pf.cw))} <span style="font-size:.7rem;opacity:.6">mm</span></span>
      </div>
      <div class="cf-row" style="margin-bottom:0">
        <span style="flex:0 0 46px;text-align:right;font-size:.73rem;color:var(--t3)">ยาว</span>
        <input class="cf-expr-inp" id="pf_cl_${i}" value="${_escH(pf.cl)}"
          oninput="_pfChange()" placeholder="เช่น od*pi+50">
        <span class="pf-val">${fmtN(ef(pf.cl))} <span style="font-size:.7rem;opacity:.6">mm</span></span>
      </div>
    </div>`).join('');
}

function evalCustomFormulas() { renderPartFormulas(); }

function _pfChange() {
  _partFormulas.forEach((pf, i) => {
    const cw = document.getElementById('pf_cw_'+i);
    const cl = document.getElementById('pf_cl_'+i);
    const nf = document.getElementById('pf_nf_'+i);
    if (cw) pf.cw = cw.value.trim();
    if (cl) pf.cl = cl.value.trim();
    if (nf) pf.noFlip = nf.checked;
  });
  renderPartFormulas();
  const btn = $('pfSaveBtn');
  if (btn) { btn.textContent='💾 บันทึก*'; btn.style.color='#fbbf24'; btn.style.borderColor='rgba(251,191,36,.4)'; }
}

function savePartFormulas() {
  _partFormulas.forEach((pf, i) => {
    const cw = document.getElementById('pf_cw_'+i);
    const cl = document.getElementById('pf_cl_'+i);
    const nf = document.getElementById('pf_nf_'+i);
    if (cw) pf.cw = cw.value.trim();
    if (cl) pf.cl = cl.value.trim();
    if (nf) pf.noFlip = nf.checked;
  });
  localStorage.setItem('ptts_part_formulas', JSON.stringify(_partFormulas));
  const btn = $('pfSaveBtn');
  if (btn) { btn.textContent='✅ บันทึกแล้ว'; btn.style.color=''; btn.style.borderColor='';
    setTimeout(()=>{ if(btn) btn.textContent='💾 บันทึก'; }, 2200); }
  autoCalcFill();
  Swal.fire({icon:'success',title:'บันทึกสูตรแล้ว ✅',background:'#0d1b2a',color:'#cce4ff',
    timer:1400,showConfirmButton:false,toast:true,position:'top-end'});
}

function resetPartFormulas() {
  _partFormulas = _DEFAULT_PART_FORMULAS.map(f=>({...f}));
  localStorage.removeItem('ptts_part_formulas');
  renderPartFormulas();
  autoCalcFill();
  Swal.fire({icon:'info',title:'รีเซ็ตสูตรแล้ว',background:'#0d1b2a',color:'#cce4ff',
    timer:1400,showConfirmButton:false,toast:true,position:'top-end'});
}

// ═══════════════════════════════════════════════════════════════
//  DOCUMENT EXPORT CENTER
// ═══════════════════════════════════════════════════════════════
let _docActiveTab = 'quo';
let _specSheetMode = false;

function showDocExport() {
  buildDocuments();
  const ov = $('docExportOverlay');
  ov.classList.add('open');
  switchDocTab('quo');
}
function closeDocExport() {
  $('docExportOverlay').classList.remove('open');
  if (_specSheetMode) {
    _specSheetMode = false;
    if ($('dtabQuo')) $('dtabQuo').style.display = '';
    const swapBtn = document.querySelector('.doc-bottombar .doc-tab-btn[onclick*="_docActiveTab"]');
    if (swapBtn) swapBtn.style.display = '';
  }
  if (_invPreviewMode) {
    _invPreviewMode = false;
    if ($('dtabQuo'))  $('dtabQuo').style.display  = '';
    if ($('dtabCost')) $('dtabCost').style.display = '';
    if ($('docInv'))   $('docInv').classList.add('dp-hidden');
    if ($('docInvRep')) $('docInvRep').classList.add('dp-hidden');
    if ($('docBill'))  $('docBill').classList.add('dp-hidden');
    if ($('docPlating')) $('docPlating').classList.add('dp-hidden');
    const swapBtn = document.querySelector('.doc-bottombar .doc-tab-btn[onclick*="_docActiveTab"]');
    if (swapBtn) swapBtn.style.display = '';
    if ($('invConfirmBtn')) $('invConfirmBtn').style.display = 'none';
    if ($('billConfirmBtn')) $('billConfirmBtn').style.display = 'none';
    if ($('platingConfirmBtn')) $('platingConfirmBtn').style.display = 'none';
  }
  if (typeof _gquoPreviewMode !== 'undefined' && _gquoPreviewMode) {
    _gquoPreviewMode = false;
    if ($('dtabQuo'))  $('dtabQuo').style.display  = '';
    if ($('dtabCost')) $('dtabCost').style.display = '';
    if ($('docGenQuo')) $('docGenQuo').classList.add('dp-hidden');
    const swapBtn = document.querySelector('.doc-bottombar .doc-tab-btn[onclick*="_docActiveTab"]');
    if (swapBtn) swapBtn.style.display = '';
  }
}
function switchDocTab(tab) {
  _docActiveTab = tab;
  $('docQuo').classList.toggle('dp-hidden', tab !== 'quo');
  $('docCost').classList.toggle('dp-hidden', tab !== 'cost');
  $('dtabQuo').className  = 'doc-tab-btn' + (tab==='quo'  ? ' dact-blue'  : '');
  $('dtabCost').className = 'doc-tab-btn' + (tab==='cost' ? ' dact-green' : '');
}
function printDoc() {
  window.print();
}

// ── หาเอกสารที่กำลังแสดงอยู่ใน docExportOverlay (สำหรับบันทึก/แชร์ภาพ) ──
function _getActiveDocEl() {
  const ids = ['docPlating','docInv','docInvRep','docBill','docGenQuo','docCost','docQuo'];
  for (const id of ids) {
    const el = $(id);
    if (el && !el.classList.contains('dp-hidden') && el.innerHTML.trim()) return el;
  }
  return $('docQuo');
}

async function _captureActiveDoc() {
  const el = _getActiveDocEl();
  if (!el) return null;
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch(e) {} }
  await new Promise(r => setTimeout(r, 80));
  const imgs = el.querySelectorAll('img');
  await Promise.all(Array.from(imgs).map(im => {
    if (im.complete && im.naturalWidth > 0) return Promise.resolve();
    return new Promise(res => {
      im.addEventListener('load', res, { once:true });
      im.addEventListener('error', res, { once:true });
      setTimeout(res, 1500);
    });
  }));
  return html2canvas(el, { backgroundColor:'#ffffff', scale:2, useCORS:true, allowTaint:true, logging:false });
}

// ── บันทึกเอกสารที่แสดงอยู่เป็นไฟล์ภาพ PNG ──
async function saveDocAsImage() {
  try {
    const canvas = await _captureActiveDoc();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `PTS-doc-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch(e) {
    Swal.fire({icon:'warning',title:'ไม่สามารถบันทึกภาพได้',text:e.message,
      background:'#0d1b2a',color:'#cce4ff',timer:2500,showConfirmButton:false,toast:true,position:'top-end'});
  }
}

// ── แชร์เอกสารที่แสดงอยู่เป็นภาพ ผ่าน Web Share API (LINE/Telegram/อื่นๆ บนมือถือ) ──
async function shareDocImage() {
  try {
    const canvas = await _captureActiveDoc();
    if (!canvas) return;
    const fileName = `PTS-doc-${Date.now()}.png`;
    canvas.toBlob(async blob => {
      const file = new File([blob], fileName, { type:'image/png' });
      if (navigator.canShare && navigator.canShare({ files:[file] })) {
        try { await navigator.share({ files:[file], title:'เอกสาร PTS' }); return; } catch(e) { /* ผู้ใช้กดยกเลิก */ }
      }
      // เครื่อง/เบราว์เซอร์ไม่รองรับ Web Share API → ดาวน์โหลดแทน
      const link = document.createElement('a');
      link.download = fileName;
      link.href = URL.createObjectURL(blob);
      link.click();
      Swal.fire({icon:'info',title:'บันทึกภาพแล้ว',text:'อุปกรณ์นี้แชร์โดยตรงไม่ได้ กรุณาส่งไฟล์ภาพที่บันทึกไว้ให้ลูกค้าทาง LINE/Telegram',
        background:'#0d1b2a',color:'#cce4ff',timer:3500,showConfirmButton:false,toast:true,position:'top-end'});
    }, 'image/png');
  } catch(e) {
    Swal.fire({icon:'warning',title:'ไม่สามารถแชร์ภาพได้',text:e.message,
      background:'#0d1b2a',color:'#cce4ff',timer:2500,showConfirmButton:false,toast:true,position:'top-end'});
  }
}

function fmtB(n, dec=2) {
  return Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:dec,maximumFractionDigits:dec});
}
function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});
}

// ── ใบเสนอราคาทั่วไป (กรอกหลายรายการเอง) — render เป็น doc แยก ใน docExportOverlay ──
let _gquoPreviewMode = false;

function _gquoRenderDoc(data) {
  const cfg = _companyInfoCache || {};
  const co = {
    name:    cfg.name    || 'บริษัท ปทิตตา ไส้กรองและวิศวกรรม จำกัด',
    nameEn:  cfg.nameEn  || 'PATITTA FILTER ENGINEERING CO., LTD.',
    addr:    cfg.address || 'เลขที่ 589/12 แขวงบางนาใต้ เขตบางนา กรุงเทพมหานคร 10260',
    tel:     cfg.phone   || '02-345-6789, 081-999-8888',
    email:   cfg.email   || 'sales@patitta-engine.co.th',
    taxId:   cfg.taxId   || '0105574001897',
  };

  const rows = data.items.map(it => {
    const qty   = parseFloat(it.qty)   || 0;
    const price = parseFloat(it.price) || 0;
    const total = qty * price;
    return { desc: it.desc || '—', unit: it.unit || 'ชิ้น', qty, price, total };
  });
  const subtotal = rows.reduce((s,r) => s + r.total, 0);
  const vatAmt   = subtotal * 0.07;
  const grand    = subtotal + vatAmt;

  const itemRows = rows.map(r => `
    <tr style="border-bottom:1px solid #e8ecf2">
      <td style="padding:10px 10px;line-height:1.5">${_escH(r.desc)}</td>
      <td style="padding:10px;text-align:center;font-weight:700">${r.qty.toLocaleString('th-TH')}</td>
      <td style="padding:10px;text-align:center;color:#555">${_escH(r.unit)}</td>
      <td style="padding:10px;text-align:right">${fmtB(r.price)}</td>
      <td style="padding:10px;text-align:right;font-weight:600">${fmtB(r.total)}</td>
    </tr>`).join('');

  const html = `
<div class="doc-paper" style="overflow:hidden">
  <!-- ── Header ── -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;
    padding:22px 28px 14px;border-bottom:3px solid #2563eb;gap:12px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:56px;height:56px;border-radius:10px;flex-shrink:0;overflow:hidden;
        display:flex;align-items:center;justify-content:center">
        <img src="${_getLogoSrc()}" alt="PTS" style="width:100%;height:100%;object-fit:contain"
          onerror="this.parentNode.style.background='#2563eb';this.style.display='none';this.parentNode.innerHTML='<span style=color:#fff;font-weight:800;font-size:1.05rem>PT</span>'">
      </div>
      <div>
        <div style="font-weight:800;font-size:.95rem;color:#1a2232">${co.name}</div>
        <div style="font-size:.65rem;color:#888;letter-spacing:.5px">${co.nameEn}</div>
        <div style="font-size:.68rem;color:#555;margin-top:3px;line-height:1.6">
          ${co.addr}<br>โทร: ${co.tel} | อีเมล์: ${co.email}<br>TAX ID: ${co.taxId}
        </div>
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:1.6rem;font-weight:800;color:#2563eb;line-height:1">ใบเสนอราคา</div>
      <div style="font-size:.65rem;color:#888;letter-spacing:2.5px;margin-bottom:10px">QUOTATION</div>
      <table style="font-size:.78rem;margin-left:auto">
        <tr><td style="color:#666;padding:2px 6px 2px 0">เลขที่ / No:</td>
            <td style="font-weight:700;color:#2563eb">${_escH(data.refNo)}</td></tr>
        <tr><td style="color:#666;padding:2px 6px 2px 0">วันที่ / Date:</td>
            <td>${fmtDate(data.dateVal)}</td></tr>
      </table>
    </div>
  </div>

  <!-- ── Customer ── -->
  <div style="display:flex;gap:0;border-bottom:1px solid #e8ecf2">
    <div style="flex:1;padding:14px 28px">
      <div style="font-size:.62rem;font-weight:700;color:#2563eb;letter-spacing:1.2px;margin-bottom:7px">
        ลูกค้าผู้ติดต่อ / CLIENT BILL TO</div>
      <div style="font-size:.9rem;font-weight:700;margin-bottom:2px">${_escH(data.customer) || '—'}</div>
      ${data.remark ? `<div style="font-size:.72rem;color:#7a6a00;background:#fefce8;padding:5px 8px;
        border-radius:4px;border-left:3px solid #fbbf24;margin-top:6px">หมายเหตุ: ${_escH(data.remark)}</div>` : ''}
    </div>
  </div>

  <!-- ── Product Table ── -->
  <div style="padding:16px 28px">
    <table style="width:100%;border-collapse:collapse;font-size:.79rem">
      <thead>
        <tr style="background:#2563eb;color:#fff">
          <th style="padding:8px 10px;text-align:left;border-radius:4px 0 0 0">รายละเอียดสินค้า/บริการ / Description</th>
          <th style="padding:8px 10px;text-align:center;width:10%">จำนวน</th>
          <th style="padding:8px 10px;text-align:center;width:8%">หน่วย</th>
          <th style="padding:8px 10px;text-align:right;width:16%">ราคา/หน่วย</th>
          <th style="padding:8px 10px;text-align:right;width:16%;border-radius:0 4px 0 0">ยอดรวม (฿)</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr><td colspan="4" style="padding:7px 10px;text-align:right;color:#555;border-top:1px solid #e8ecf2">
            รวมก่อน VAT / Subtotal</td>
          <td style="padding:7px 10px;text-align:right;font-weight:700;border-top:1px solid #e8ecf2">${fmtB(subtotal)}</td></tr>
        <tr><td colspan="4" style="padding:5px 10px;text-align:right;color:#888">ภาษีมูลค่าเพิ่ม VAT 7%</td>
          <td style="padding:5px 10px;text-align:right;color:#888">${fmtB(vatAmt)}</td></tr>
        <tr style="background:#1d4ed8;color:#fff">
          <td colspan="4" style="padding:9px 10px;text-align:right;font-weight:700;font-size:.9rem;border-radius:0 0 0 4px">
            ยอดรวมทั้งสิ้น / GRAND TOTAL</td>
          <td style="padding:9px 10px;text-align:right;font-weight:800;font-size:.9rem;border-radius:0 0 4px 0">
            ฿ ${fmtB(grand)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- ── Signature ── -->
  <div style="display:flex;gap:0;border-top:1px solid #e8ecf2;padding:14px 28px 22px;flex-wrap:wrap;gap:12px">
    <div style="flex:1;min-width:160px;text-align:center">
      <div style="border-top:1px solid #ccc;margin-top:32px;padding-top:6px;font-size:.73rem;color:#555">
        ลงชื่อ ผู้เสนอราคา</div>
      <div style="font-size:.68rem;color:#888;margin-top:3px">( __________________ )<br>ตำแหน่ง: ________________</div>
      <div style="font-size:.68rem;color:#aaa;margin-top:2px">วันที่: ${fmtDate(data.dateVal)}</div>
    </div>
    <div style="flex:1;min-width:160px;text-align:center">
      <div style="border-top:1px solid #ccc;margin-top:32px;padding-top:6px;font-size:.73rem;color:#555">
        ลงชื่อ ผู้อนุมัติ</div>
      <div style="font-size:.68rem;color:#888;margin-top:3px">( __________________ )<br>ตำแหน่ง: ________________</div>
    </div>
    <div style="flex:1;min-width:160px;text-align:center">
      <div style="border-top:1px solid #ccc;margin-top:32px;padding-top:6px;font-size:.73rem;color:#555">
        ลงชื่อ ผู้รับใบเสนอราคา</div>
      <div style="font-size:.68rem;color:#888;margin-top:3px">( __________________ )<br>บจก./บริษัท: ________________</div>
      <div style="font-size:.68rem;color:#aaa;margin-top:2px">วันที่: ________________</div>
    </div>
  </div>
</div>`;

  _gquoPreviewMode = true;

  let docGenQuo = $('docGenQuo');
  if (!docGenQuo) {
    docGenQuo = document.createElement('div');
    docGenQuo.id = 'docGenQuo';
    $('docQuo').parentNode.appendChild(docGenQuo);
  }
  $('docQuo').classList.add('dp-hidden');
  $('docCost').classList.add('dp-hidden');
  docGenQuo.classList.remove('dp-hidden');
  docGenQuo.innerHTML = html;

  if ($('dtabQuo'))  $('dtabQuo').style.display  = 'none';
  if ($('dtabCost')) $('dtabCost').style.display = 'none';
  const swapBtn = document.querySelector('.doc-bottombar .doc-tab-btn[onclick*="_docActiveTab"]');
  if (swapBtn) swapBtn.style.display = 'none';

  $('docExportOverlay').classList.add('open');
}

function buildDocuments() {
  const cfg = _companyInfoCache || {};
  const co = {
    name:    cfg.name    || 'บริษัท ปทิตตา ไส้กรองและวิศวกรรม จำกัด',
    nameEn:  cfg.nameEn  || 'PATITTA FILTER ENGINEERING CO., LTD.',
    addr:    cfg.address || 'เลขที่ 589/12 แขวงบางนาใต้ เขตบางนา กรุงเทพมหานคร 10260',
    tel:     cfg.phone   || '02-345-6789, 081-999-8888',
    email:   cfg.email   || 'sales@patitta-engine.co.th',
    taxId:   cfg.taxId   || '0105574001897',
  };

  // ── Form values ─────────────────────────────────────────────
  const noQuo    = $('f_noQuo').value || '—';
  const refId    = ($('f_refId') && $('f_refId').value) ? $('f_refId').value : generateRefId();
  const dateVal  = $('f_date').value  || '';
  const unit     = num('f_unit') || 1;
  const od       = num('f_od'); const id_ = num('f_id'); const h = num('f_h');
  const od2      = ($('f_hasOd2') && $('f_hasOd2').checked && num('f_od2') > 0) ? num('f_od2') : 0;
  const rawMat   = $('f_rawMat').value || '';
  const workType = $('f_workType').value || '';
  const remark   = $('f_remark').value || '';
  const contactName = $('f_contact').value || '—';
  const contactCo   = (_contactsData.find(c=>c.name===contactName)||{}).company || '';

  const sellPriceU = num('f_sellPrice');
  const totalCost  = num('f_totalCost');
  const profitUnit = num('f_profitUnit');
  const profitJob  = num('f_profitJob');

  const revNo = parseInt($('f_rev')?.value) || 0;
  const revSuffix = revNo > 0 ? ` Rev.${revNo}` : '';
  const quoNo = `${refId}${revSuffix}`;   // ใช้เลขอ้างอิง BB + Rev. (ถ้ามีการแก้ไข) แทน No.Quo ภายใน

  // ── COST LINE ITEMS ─────────────────────────────────────────
  const lines = [];
  function addLine(label, detail, unitCost, isPerJob) {
    const c = parseFloat(unitCost) || 0;
    if (!c && !detail) return;
    const perUnit = isPerJob ? c/unit : c;
    lines.push({ label, detail, perUnit, total: perUnit*unit });
  }
  addLine('ฝาบน (Top Cap)',       matLabel($('f_matTop').value),  num('f_costTop'),    false);
  addLine('ฝาล่าง (Bottom Cap)',  matLabel($('f_matBot').value),  num('f_costBot'),    false);
  addLine('งานเทสเสีย (Testing Waste)', $('f_testWaste').value, num('f_cTestWaste'), false);
  addLine('จ้างภายนอก (Outsource)', $('f_outsource').value, num('f_cOutsource'), false);
  addLine('ตะแกรงนอก (Outer Mesh)', matLabel($('f_meshOut').value), num('f_cMeshOut'),  false);
  addLine('ตะแกรงใน (Inner Mesh)',  matLabel($('f_meshIn').value),  num('f_cMeshIn'),   false);
  addLine('เลเซอร์ (Laser)',       $('f_laser').value,     num('f_cLaser'),    false);
  addLine('ร้าน/ชุป (Plating)',    $('f_plating').value || 'ชุบซิงค์ครั้ง', num('f_cPlating'), false);
  addLine('แม่พิมพ์ (Mold)',       $('f_mold').value,      num('f_cMold'),     true);
  const laborRate = num('f_laborRate');
  const workdays  = num('f_workdays');
  addLine(`ค่าแรง (${laborRate>0?laborRate+'/วัน':''})`, '', num('f_cLabor'), false);
  addLine('ค่าขนส่ง (Logistics)', $('f_transport').value, num('f_cTransport'), false);
  addLine('เครื่องจักร์ (Machine setup)', $('f_machine').value, num('f_cMachine'), false);
  if ($('f_other1').value || num('f_cOther1'))
    addLine($('f_other1').value||'อื่นๆ 1', '', num('f_cOther1'), false);
  if ($('f_other2').value || num('f_cOther2'))
    addLine($('f_other2').value||'อื่นๆ 2', '', num('f_cOther2'), false);
  if ($('f_other3').value || num('f_cOther3'))
    addLine($('f_other3').value||'อื่นๆ 3', '', num('f_cOther3'), false);
  addLine('ต้นทุนคงที่ (Fixed Cost Unit)', 'ค่าบริหาร', num('f_fixedCost'), true);

  // totalCost = ต้นทุน/ลูก (after fix)
  const marginPct = totalCost > 0 && sellPriceU > 0
    ? ((sellPriceU - totalCost) / sellPriceU * 100).toFixed(1)
    : '—';

  // ──────────────────────────────────────────────────────────────
  //  DOCUMENT 1: OFFICIAL QUOTATION
  // ──────────────────────────────────────────────────────────────
  const subtotal  = sellPriceU * unit;
  const vatAmt    = subtotal * 0.07;
  const grandTotal= subtotal + vatAmt;

  const _sizeStr  = od2 > 0 ? `OD ฝา2: ${od2} / ${od}×${id_}×${h}` : `${od}×${id_}×${h}`;
  const productDesc = [
    `ไส้กรองอุตสาหกรรม: ${_sizeStr} มม.`,
    rawMat   ? `วัสดุ: ${rawMat}` : '',
    workType ? `แบบงาน: ${workType}` : '',
  ].filter(Boolean).join(' | ');

  $('docQuo').innerHTML = `
<div class="doc-paper" style="overflow:hidden">
  <!-- ── Header ── -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;
    padding:22px 28px 14px;border-bottom:3px solid #2563eb;gap:12px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:56px;height:56px;border-radius:10px;flex-shrink:0;overflow:hidden;
        display:flex;align-items:center;justify-content:center">
        <img src="${_getLogoSrc()}" alt="PTS" style="width:100%;height:100%;object-fit:contain"
          onerror="this.parentNode.style.background='#2563eb';this.style.display='none';this.parentNode.innerHTML='<span style=color:#fff;font-weight:800;font-size:1.05rem>PT</span>'">
      </div>
      <div>
        <div style="font-weight:800;font-size:.95rem;color:#1a2232">${co.name}</div>
        <div style="font-size:.65rem;color:#888;letter-spacing:.5px">${co.nameEn}</div>
        <div style="font-size:.68rem;color:#555;margin-top:3px;line-height:1.6">
          ${co.addr}<br>โทร: ${co.tel} | อีเมล์: ${co.email}<br>TAX ID: ${co.taxId}
        </div>
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:1.6rem;font-weight:800;color:#2563eb;line-height:1">ใบเสนอราคา</div>
      <div style="font-size:.65rem;color:#888;letter-spacing:2.5px;margin-bottom:10px">QUOTATION</div>
      <table style="font-size:.78rem;margin-left:auto">
        <tr><td style="color:#666;padding:2px 6px 2px 0">เลขที่ / No:</td>
            <td style="font-weight:700;color:#2563eb">${quoNo}</td></tr>
        <tr><td style="color:#666;padding:2px 6px 2px 0">วันที่ / Date:</td>
            <td>${fmtDate(dateVal)}</td></tr>
      </table>
    </div>
  </div>

  <!-- ── Customer / Delivery ── -->
  <div style="display:flex;gap:0;border-bottom:1px solid #e8ecf2">
    <div style="flex:1;padding:14px 28px;border-right:1px solid #e8ecf2">
      <div style="font-size:.62rem;font-weight:700;color:#2563eb;letter-spacing:1.2px;margin-bottom:7px">
        ลูกค้าผู้ติดต่อ / CLIENT BILL TO</div>
      <div style="font-size:.9rem;font-weight:700;margin-bottom:2px">${contactName}</div>
      <div style="font-size:.78rem;color:#444;margin-bottom:5px">${contactCo}</div>
      <div id="quo-addr-edit" contenteditable="true"
        style="font-size:.73rem;color:#666;min-height:18px;outline:none;
          border-bottom:1px dashed #ccc;padding-bottom:2px">กรอกที่อยู่ลูกค้า...</div>
    </div>
    <div style="flex:1;padding:14px 28px">
      <div style="font-size:.62rem;font-weight:700;color:#2563eb;letter-spacing:1.2px;margin-bottom:7px">
        รายละเอียดจัดส่งและภาษี</div>
      <div style="font-size:.78rem;color:#444;margin-bottom:2px">โทร: <span id="quo-cphone">—</span></div>
      <div style="font-size:.78rem;color:#444;margin-bottom:6px">อีเมล์: <span id="quo-cemail">—</span></div>
      ${remark ? `<div style="font-size:.72rem;color:#7a6a00;background:#fefce8;padding:5px 8px;
        border-radius:4px;border-left:3px solid #fbbf24">หมายเหตุ: ${remark}</div>` : ''}
    </div>
  </div>

  <!-- ── Product Table ── -->
  <div style="padding:16px 28px">
    <table style="width:100%;border-collapse:collapse;font-size:.79rem">
      <thead>
        <tr style="background:#2563eb;color:#fff">
          <th style="padding:8px 10px;text-align:left;border-radius:4px 0 0 0">รายละเอียดสินค้า / Description</th>
          <th style="padding:8px 10px;text-align:center;width:10%">จำนวน</th>
          <th style="padding:8px 10px;text-align:center;width:8%">หน่วย</th>
          <th style="padding:8px 10px;text-align:right;width:16%">ราคา/หน่วย</th>
          <th style="padding:8px 10px;text-align:right;width:16%;border-radius:0 4px 0 0">ยอดรวม (฿)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid #e8ecf2">
          <td style="padding:10px 10px;line-height:1.5">${productDesc}</td>
          <td style="padding:10px;text-align:center;font-weight:700">${unit.toLocaleString('th-TH')}</td>
          <td style="padding:10px;text-align:center;color:#555">ชิ้น</td>
          <td style="padding:10px;text-align:right">${fmtB(sellPriceU)}</td>
          <td style="padding:10px;text-align:right;font-weight:600">${fmtB(subtotal)}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr><td colspan="4" style="padding:7px 10px;text-align:right;color:#555;border-top:1px solid #e8ecf2">
            รวมก่อน VAT / Subtotal</td>
          <td style="padding:7px 10px;text-align:right;font-weight:700;border-top:1px solid #e8ecf2">${fmtB(subtotal)}</td></tr>
        <tr><td colspan="4" style="padding:5px 10px;text-align:right;color:#888">ภาษีมูลค่าเพิ่ม VAT 7%</td>
          <td style="padding:5px 10px;text-align:right;color:#888">${fmtB(vatAmt)}</td></tr>
        <tr style="background:#1d4ed8;color:#fff">
          <td colspan="4" style="padding:9px 10px;text-align:right;font-weight:700;font-size:.9rem;border-radius:0 0 0 4px">
            ยอดรวมทั้งสิ้น / GRAND TOTAL</td>
          <td style="padding:9px 10px;text-align:right;font-weight:800;font-size:.9rem;border-radius:0 0 4px 0">
            ฿ ${fmtB(grandTotal)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- ── Terms ── -->
  <div style="display:flex;gap:16px;padding:6px 28px 14px;flex-wrap:wrap">
    <div style="flex:1;min-width:180px">
      <div style="font-size:.68rem;font-weight:700;color:#333;margin-bottom:3px">เงื่อนไขการชำระเงิน / Payment Terms</div>
      <div id="quo-terms" contenteditable="true"
        style="font-size:.76rem;color:#444;outline:none;border-bottom:1px dashed #ccc;min-height:16px;padding-bottom:2px">
        เงินสด / มัดจำ 50% ก่อนผลิต ชำระส่วนที่เหลือก่อนรับสินค้า</div>
    </div>
    <div style="flex:1;min-width:180px">
      <div style="font-size:.68rem;font-weight:700;color:#333;margin-bottom:3px">กำหนดส่งมอบ / Delivery Lead Time</div>
      <div id="quo-delivery" contenteditable="true"
        style="font-size:.76rem;color:#444;outline:none;border-bottom:1px dashed #ccc;min-height:16px;padding-bottom:2px">
        ภายใน 30 วัน นับจากวันได้รับใบสั่งซื้อที่ถูกต้อง</div>
    </div>
  </div>

  <!-- ── Signature ── -->
  <div style="display:flex;gap:0;border-top:1px solid #e8ecf2;padding:14px 28px 22px;flex-wrap:wrap;gap:12px">
    <div style="flex:1;min-width:160px;text-align:center">
      <div style="border-top:1px solid #ccc;margin-top:32px;padding-top:6px;font-size:.73rem;color:#555">
        ลงชื่อ ผู้เสนอราคา</div>
      <div style="font-size:.68rem;color:#888;margin-top:3px">( __________________ )<br>ตำแหน่ง: ________________</div>
      <div style="font-size:.68rem;color:#aaa;margin-top:2px">วันที่: ${fmtDate(dateVal)}</div>
    </div>
    <div style="flex:1;min-width:160px;text-align:center">
      <div style="border-top:1px solid #ccc;margin-top:32px;padding-top:6px;font-size:.73rem;color:#555">
        ลงชื่อ ผู้อนุมัติ</div>
      <div style="font-size:.68rem;color:#888;margin-top:3px">( __________________ )<br>ตำแหน่ง: ________________</div>
    </div>
    <div style="flex:1;min-width:160px;text-align:center">
      <div style="border-top:1px solid #ccc;margin-top:32px;padding-top:6px;font-size:.73rem;color:#555">
        ลงชื่อ ผู้รับใบเสนอราคา</div>
      <div style="font-size:.68rem;color:#888;margin-top:3px">( __________________ )<br>บจก./บริษัท: ________________</div>
      <div style="font-size:.68rem;color:#aaa;margin-top:2px">วันที่: ________________</div>
    </div>
  </div>
</div>`;

  // ──────────────────────────────────────────────────────────────
  //  DOCUMENT 2: INTERNAL COSTING SHEET
  // ──────────────────────────────────────────────────────────────
  const costRows = lines.map((l,i) => `
<tr style="${i%2===0?'background:#f8fafc':''}">
  <td style="padding:7px 10px">${l.label}</td>
  <td style="padding:7px 10px;color:#555;font-size:.76rem">${l.detail||'—'}</td>
  <td style="padding:7px 10px;text-align:right;font-weight:500">${fmtB(l.perUnit)} ฿</td>
  <td style="padding:7px 10px;text-align:right;color:#2563eb;font-weight:600">${fmtB(l.total)} ฿</td>
</tr>`).join('');

  const netPerUnit = totalCost;                  // already ต้นทุน/ลูก
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

  <!-- ── Bottom nav ── -->
  <div style="display:flex;justify-content:space-between;align-items:center;
    padding:10px 20px;background:#f1f5f9;font-size:.68rem;color:#888;flex-wrap:wrap;gap:6px">
    <div>ย้อนกลับหน้าใบเสนอราคา &nbsp;<b style="color:#2563eb">← </b></div>
    <div style="display:flex;gap:8px">
      <button onclick="switchDocTab('quo')" class="no-print"
        style="padding:5px 12px;border-radius:6px;border:1px solid #2563eb;background:transparent;
          color:#2563eb;font-size:.72rem;cursor:pointer;font-family:'Sarabun',sans-serif">
        ← ใบเสนอราคา</button>
      <button onclick="printDoc()" class="no-print"
        style="padding:5px 12px;border-radius:6px;border:none;background:#059669;
          color:#fff;font-size:.72rem;cursor:pointer;font-family:'Sarabun',sans-serif">
        🖨 พิมพ์หรือบันทึกเป็น PDF</button>
    </div>
  </div>
</div>`;
}

// ── Logo helpers ──────────────────────────────────────────────
// โลโก้บริษัทเก็บที่ Google Sheet "Company" (key: company_logo_url, อัปโหลดขึ้น Drive)
// cache ในตัวแปร _companyInfoCache (โหลดตอนเปิดแอป) — ถ้าไม่มี fallback → PTS.png
// เชื่อมทุกจุด: header (.ph-logo), sidebar (.sidebar-logo), ใบเสนอราคา (buildDocuments)
// ตั้งค่าผ่าน: ดูแบบเสนอราคา → ⚙️ ตั้งค่าบริษัท → คลิกกรอบโลโก้
// ลบ: กด 🗑 ลบ ใน modal → กลับเป็น PTS.png อัตโนมัติ
let _companyInfoCache = null;
async function _fetchCompanyInfo() {
  if (!SCRIPT_URL) return null;
  try {
    const res = await fetch(SCRIPT_URL + '?action=getCompanyInfo', { mode: 'cors' });
    const data = await res.json();
    if (data && data.status === 'ok') {
      _companyInfoCache = data.info || {};
      _applyLogoAll();
    }
  } catch (e) { /* เงียบไว้ ใช้ค่า default ไปก่อน */ }
  return _companyInfoCache;
}
function _getLogoSrc() {
  return (_companyInfoCache && _companyInfoCache.logoUrl) || 'PTS.png';
}
function _applyLogoAll() {
  const src = _getLogoSrc();
  document.querySelectorAll('.app-logo-img').forEach(el => {
    el.style.display = '';
    if (el.nextElementSibling && el.nextElementSibling.classList.contains('ph-logo-fallback')) {
      el.nextElementSibling.style.display = 'none';
    }
    el.src = src;
  });
}
async function handleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (!SCRIPT_URL) {
    Swal.fire({icon:'info',title:'ยังไม่ตั้งค่า URL',text:'กรุณาใส่ Apps Script URL ก่อน',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    input.value = '';
    return;
  }
  Swal.fire({title:'กำลังอัปโหลดโลโก้...',background:'#0d1b2a',color:'#cce4ff',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
  try {
    const result = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const r = e.target.result || '';
        const idx = r.indexOf('base64,');
        resolve(idx >= 0 ? r.slice(idx + 7) : r);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch(SCRIPT_URL, {
      method: 'POST', mode: 'cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'uploadLogo', fileName: file.name, mimeType: file.type, base64: result })
    });
    const data = await res.json();
    if (!data || data.status !== 'ok') throw new Error((data && data.message) || 'upload failed');

    // บันทึก logoUrl ลงชีต Company ด้วย
    await fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveCompanyInfo', logoUrl: data.url }) });

    if (!_companyInfoCache) _companyInfoCache = {};
    _companyInfoCache.logoUrl = data.url;
    _refreshLogoPreview();
    _applyLogoAll();
    Swal.close();
  } catch (e) {
    Swal.fire({icon:'error',title:'อัปโหลดโลโก้ไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
  }
  input.value = '';
}
async function deleteLogo() {
  if (SCRIPT_URL) {
    await fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveCompanyInfo', clearLogo: true }) });
  }
  if (_companyInfoCache) _companyInfoCache.logoUrl = '';
  _refreshLogoPreview();
  _applyLogoAll();
}
function _refreshLogoPreview() {
  const src = _companyInfoCache && _companyInfoCache.logoUrl;
  const img = $('cfg_logoImg');
  const ph  = $('cfg_logoPlaceholder');
  const del = $('cfg_logoDelBtn');
  if (src) {
    if (img) { img.src = src; img.style.display = 'block'; }
    if (ph)  ph.style.display = 'none';
    if (del) del.style.display = 'inline-block';
  } else {
    if (img) { img.src = ''; img.style.display = 'none'; }
    if (ph)  ph.style.display = 'block';
    if (del) del.style.display = 'none';
  }
}

// ── Company config ────────────────────────────────────────────
// ข้อมูลบริษัทเก็บที่ Google Sheet "Company" (sync ทุกอุปกรณ์)
// fields: name, nameEn, address, phone, email, taxId, logoUrl
// ใช้ใน: buildDocuments() → ใบเสนอราคา + ใบจำแนกต้นทุน + ใบกำกับภาษี
// ตั้งค่าผ่าน: ดูแบบเสนอราคา → ⚙️ ตั้งค่าบริษัท
async function saveCompanyCfg() {
  if (!SCRIPT_URL) {
    Swal.fire({icon:'info',title:'ยังไม่ตั้งค่า URL',text:'กรุณาใส่ Apps Script URL ก่อน',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    return;
  }
  const cfg = {
    name:    $('cfg_coName').value.trim(),
    nameEn:  $('cfg_coNameEn').value.trim(),
    address: $('cfg_coAddr').value.trim(),
    phone:   $('cfg_coTel').value.trim(),
    email:   $('cfg_coEmail').value.trim(),
    taxId:   $('cfg_coTaxId').value.trim(),
  };
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST', mode: 'cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(Object.assign({ action: 'saveCompanyInfo' }, cfg))
    });
    const data = await res.json();
    if (!data || data.status !== 'ok') throw new Error((data && data.message) || 'save failed');
    _companyInfoCache = Object.assign({}, _companyInfoCache, cfg);
    closeDocCfg();
    Swal.fire({icon:'success',title:'บันทึกข้อมูลบริษัทแล้ว ✅',background:'#0d1b2a',
      color:'#cce4ff',timer:1400,showConfirmButton:false,toast:true,position:'top-end'});
  } catch (e) {
    Swal.fire({icon:'error',title:'บันทึกไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
  }
}
async function openDocCfg() {
  $('docCfgModal').style.display = 'flex';
  if (!_companyInfoCache) await _fetchCompanyInfo();
  const cfg = _companyInfoCache || {};
  $('cfg_coName').value   = cfg.name    || 'บริษัท ปทิตตา ไส้กรองและวิศวกรรม จำกัด';
  $('cfg_coNameEn').value = cfg.nameEn  || 'PATITTA FILTER ENGINEERING CO., LTD.';
  $('cfg_coAddr').value   = cfg.address || 'เลขที่ 589/12 แขวงบางนาใต้ เขตบางนา กรุงเทพมหานคร 10260';
  $('cfg_coTel').value    = cfg.phone   || '02-345-6789, 081-999-8888';
  $('cfg_coEmail').value  = cfg.email   || 'sales@patitta-engine.co.th';
  $('cfg_coTaxId').value  = cfg.taxId   || '0105574001897';
  _refreshLogoPreview();
}
function closeDocCfg() { $('docCfgModal').style.display = 'none'; }

