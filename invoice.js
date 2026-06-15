// ══════════════════════════════════════════════════════
// ══ TAB: ลูกค้า (Customers) ══════════════════════════════
// ══════════════════════════════════════════════════════
let _custCache  = [];
let _custEditIdx = -1; // index ใน _custCache ที่กำลังแก้ไข, -1 = ไม่มี, 'new' = แถวใหม่

async function fetchCustomers() {
  if (!SCRIPT_URL) { renderCustomerTable(); return; }
  const wrap = $('custTableWrap');
  if (wrap) wrap.innerHTML = `<div style="text-align:center;padding:16px;color:var(--t3);font-size:.82rem"><span class="spin-ico">↻</span> กำลังโหลด…</div>`;
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getCustomers', {mode:'cors'});
    const data = await res.json();
    if (data.status === 'ok') _custCache = data.customers || [];
    else throw new Error(data.message || 'unknown');
  } catch (e) {
    if (wrap) { wrap.innerHTML = `<div style="text-align:center;padding:16px;color:#f87171;font-size:.82rem">โหลดข้อมูลไม่สำเร็จ: ${e.message}</div>`; return; }
  }
  renderCustomerTable();
  _invRefreshCustomerSelect();
  _billRefreshCustomerSelect();
}

function custAddRow() {
  _custCache.push({ code:'', name:'', branch:'', taxId:'', address:'', phone:'', contact:'' });
  _custEditIdx = _custCache.length - 1;
  renderCustomerTable();
}
function custEditRow(i)    { _custEditIdx = i; renderCustomerTable(); }
function custCancelEdit(i) {
  if (!_custCache[i].code && !_custCache[i].name) _custCache.splice(i, 1);
  _custEditIdx = -1;
  renderCustomerTable();
}

async function custSaveRow(i) {
  const g = id => (document.getElementById(id)?.value || '').trim();
  const data = {
    code:    _custCache[i].code || '',
    name:    g('cust_name_'+i),
    branch:  g('cust_branch_'+i),
    taxId:   g('cust_taxid_'+i),
    address: g('cust_addr_'+i),
    phone:   g('cust_phone_'+i),
    contact: g('cust_contact_'+i),
  };
  if (!data.name) {
    Swal.fire({icon:'warning',title:'กรุณาใส่ชื่อลูกค้า/บริษัท',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#3b82f6'});
    return;
  }
  if (!SCRIPT_URL) {
    Swal.fire({icon:'info',title:'ยังไม่ตั้งค่า URL',text:'กรุณาใส่ Apps Script URL ก่อน',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    return;
  }
  try {
    const res = await fetch(SCRIPT_URL, {
      method:'POST', mode:'cors',
      headers:{'Content-Type':'text/plain'},
      body: JSON.stringify(Object.assign({ action:'saveCustomer' }, data))
    });
    const out = await res.json();
    if (!out || out.status !== 'ok') throw new Error((out && out.message) || 'save failed');
    _custEditIdx = -1;
    await fetchCustomers();
    Swal.fire({icon:'success',title:'บันทึกลูกค้าแล้ว ✅',background:'#0d1b2a',color:'#cce4ff',
      timer:1200,showConfirmButton:false,toast:true,position:'top-end'});
  } catch (e) {
    Swal.fire({icon:'error',title:'บันทึกไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
  }
}

async function custDeleteRow(i) {
  const c = _custCache[i];
  if (!c) return;
  Swal.fire({
    icon:'warning', title:`ลบลูกค้า "${c.name}"?`,
    html:`<div style="font-size:.83rem;color:#8b8aaa">ไม่สามารถย้อนกลับได้</div>`,
    background:'#0d1b2a', color:'#cce4ff',
    confirmButtonText:'🗑 ลบเลย', confirmButtonColor:'#c0464a',
    showCancelButton:true, cancelButtonText:'ยกเลิก', cancelButtonColor:'#374151',
  }).then(async r => {
    if (!r.isConfirmed) return;
    if (!c.code) { _custCache.splice(i,1); renderCustomerTable(); return; }
    try {
      const res = await fetch(SCRIPT_URL, {
        method:'POST', mode:'cors',
        headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({ action:'deleteCustomer', code: c.code })
      });
      const out = await res.json();
      if (!out || out.status !== 'ok') throw new Error((out && out.message) || 'delete failed');
      await fetchCustomers();
      Swal.fire({icon:'success',title:'ลบแล้ว',background:'#0d1b2a',color:'#cce4ff',
        timer:1200,showConfirmButton:false,toast:true,position:'top-end'});
    } catch (e) {
      Swal.fire({icon:'error',title:'ลบไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
    }
  });
}

function _custInput(id, val, placeholder) {
  return `<input id="${id}" value="${(val||'').replace(/"/g,'&quot;')}" placeholder="${placeholder||''}"
    style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid rgba(99,102,241,.35);
    background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.8rem">`;
}

// รายชื่อลูกค้าที่มีอยู่จริงในชีต Order (คอลัมน์ "ลูกค้า") — ใช้ทำ autocomplete
// เพื่อให้ "ชื่อ/บริษัท" ในทะเบียนลูกค้าตรงกับ Order เป๊ะๆ (ใช้จับคู่ออกใบกำกับ)
function _invOrderCustomerNames() {
  const set = new Set();
  (_orderCache || []).forEach(r => {
    const n = String(r[ORDER_COLS.customer] || '').trim();
    if (n) set.add(n);
  });
  return [...set].sort();
}

function _custNameInput(id, val) {
  return `<input id="${id}" value="${(val||'').replace(/"/g,'&quot;')}" placeholder="ชื่อ/บริษัท *"
    style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid rgba(99,102,241,.35);
    background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.8rem">`;
}

// ช่อง "ผู้ติดต่อ" — ค่านี้คือสิ่งที่อยู่ในคอลัมน์ "ลูกค้า" ของชีต Order จริง (ใช้ตอนออกใบเสนอราคา)
// ใช้ autocomplete จากรายชื่อที่มีอยู่จริงใน Order เพื่อให้จับคู่ออกใบกำกับได้ตรง
function _custContactInput(id, val) {
  const opts = _invOrderCustomerNames();
  return `<input id="${id}" list="${id}_list" value="${(val||'').replace(/"/g,'&quot;')}" placeholder="ผู้ติดต่อ * (ต้องตรงกับคอลัมน์ลูกค้าใน Order)"
    style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid rgba(99,102,241,.35);
    background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.8rem">
    <datalist id="${id}_list">${opts.map(o=>`<option value="${o.replace(/"/g,'&quot;')}">`).join('')}</datalist>`;
}

function renderCustomerTable() {
  const wrap = $('custTableWrap');
  if (!wrap) return;
  if (!_custCache.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:24px;color:var(--t3);font-size:.82rem">
      ยังไม่มีลูกค้า — กด ➕ เพิ่มลูกค้า</div>`;
    return;
  }
  const rows = _custCache.map((c, i) => {
    if (i === _custEditIdx) {
      return `<tr style="background:rgba(99,102,241,.08)">
        <td style="padding:6px 8px" colspan="6">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px">
            ${_custNameInput('cust_name_'+i, c.name)}
            ${_custInput('cust_branch_'+i, c.branch, 'สาขา')}
            ${_custInput('cust_taxid_'+i, c.taxId, 'เลขผู้เสียภาษี 13 หลัก')}
            ${_custInput('cust_phone_'+i, c.phone, 'เบอร์โทร')}
            ${_custContactInput('cust_contact_'+i, c.contact)}
          </div>
          <div style="margin-top:6px">${_custInput('cust_addr_'+i, c.address, 'ที่อยู่')}</div>
          <div style="margin-top:8px;text-align:right">
            <button onclick="guardClick(this, () => custSaveRow(${i}))"
              style="padding:5px 14px;border-radius:6px;border:none;background:#34d399;color:#0a2e1a;
              font-family:Sarabun,sans-serif;font-size:.78rem;font-weight:700;cursor:pointer;margin-right:6px">💾 บันทึก</button>
            <button onclick="custCancelEdit(${i})"
              style="padding:5px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:transparent;
              color:var(--t3);font-family:Sarabun,sans-serif;font-size:.78rem;cursor:pointer">✕ ยกเลิก</button>
          </div>
        </td>
      </tr>`;
    }
    return `<tr style="${i%2===0?'background:var(--c1-05)':''}">
      <td style="padding:7px 10px;font-weight:700;color:var(--c1)">${c.name||'—'}</td>
      <td style="padding:7px 10px;font-size:.78rem;color:var(--t2)">${c.branch||'—'}</td>
      <td style="padding:7px 10px;font-size:.78rem;color:var(--t3)">${c.taxId||'—'}</td>
      <td style="padding:7px 10px;font-size:.78rem;color:var(--t3)">${c.phone||'—'}</td>
      <td style="padding:7px 10px;font-size:.78rem;color:var(--t3)">${c.contact||'—'}</td>
      <td style="padding:7px 10px;white-space:nowrap">
        <button onclick="custEditRow(${i})"
          style="padding:3px 10px;border-radius:6px;border:1px solid rgba(99,102,241,.4);background:transparent;
          color:#818cf8;font-family:Sarabun,sans-serif;font-size:.75rem;cursor:pointer;margin-right:4px">✏️</button>
        <button onclick="custDeleteRow(${i})"
          style="padding:3px 10px;border-radius:6px;border:1px solid rgba(248,113,113,.3);background:transparent;
          color:#f87171;font-family:Sarabun,sans-serif;font-size:.75rem;cursor:pointer">🗑</button>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:.82rem">
      <thead>
        <tr style="border-bottom:1px solid rgba(255,255,255,.1)">
          <th style="padding:6px 10px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">ชื่อ/บริษัท</th>
          <th style="padding:6px 10px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">สาขา</th>
          <th style="padding:6px 10px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">เลขผู้เสียภาษี</th>
          <th style="padding:6px 10px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">เบอร์โทร</th>
          <th style="padding:6px 10px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">ผู้ติดต่อ</th>
          <th style="padding:6px 10px;width:80px"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ══════════════════════════════════════════════════════
// ══ TAB: ใบกำกับภาษี (Tax Invoice) ══════════════════════
// ══════════════════════════════════════════════════════
let _invSelectedPOs = new Set();

// ยอดรวมของ Order (รวม VAT) — คอลัมน์ totalTax (X) บางแถวยังไม่มีค่า (สูตรในชีตยังไม่คำนวณ)
// จึงคำนวณสำรองจาก จำนวน × ราคา × 1.07
function _invOrderTotal(r) {
  const t = parseFloat(r[ORDER_COLS.totalTax]) || 0;
  if (t) return t;
  const qty = parseFloat(r[ORDER_COLS.qty]) || 0;
  const price = parseFloat(r[ORDER_COLS.price]) || 0;
  return qty * price * 1.07;
}

// นับจำนวน PO ที่ยังไม่ออกใบกำกับของลูกค้ารายนี้ (จับคู่ด้วย contact/name เหมือน renderInvOrderList)
function _invCountPendingPOs(cust) {
  const matchKeys = [cust.contact, cust.name].map(s => (s||'').trim()).filter(Boolean);
  if (!matchKeys.length) return 0;
  return (_orderCache || []).filter(r =>
    matchKeys.includes(String(r[ORDER_COLS.customer]||'').trim()) &&
    !String(r[ORDER_COLS.invoiceNo]||'').trim()
  ).length;
}

function _invRefreshCustomerSelect() {
  const sel = $('inv_customer');
  if (!sel) return;
  const curCode = sel.value ? (_custCache[parseInt(sel.value,10)]||{}).code : '';
  // เรียงลูกค้าตามจำนวน PO ที่รอเปิดใบกำกับ มากไปน้อย (value ยังอ้าง index เดิมใน _custCache)
  const ordered = _custCache.map((c,i) => ({ i, c, n: _invCountPendingPOs(c) }))
    .sort((a,b) => b.n - a.n);
  sel.innerHTML = '<option value="">— เลือกลูกค้า —</option>' +
    ordered.map(({i,c,n}) => `<option value="${i}"${n ? ' class="has-pending"' : ''}>${c.name}${c.branch?' ('+c.branch+')':''}${n ? ` — รอเปิด ${n} PO` : ''}</option>`).join('');
  if (curCode) {
    const idx = _custCache.findIndex(c=>c.code===curCode);
    if (idx >= 0) sel.value = String(idx);
  }
}

let _invRepInited = false;
function invInit() {
  _invRefreshCustomerSelect();
  renderInvOrderList();
  if (!_invRepInited) {
    _invRepInited = true;
    const now = new Date();
    if ($('invRep_month')) $('invRep_month').value = String(now.getMonth() + 1);
    if ($('invRep_year'))  $('invRep_year').value  = String(now.getFullYear() + 543);
  }
  fetchIssuedInvoices();
  _billRefreshCustomerSelect();
  if ($('billDate') && !$('billDate').value) $('billDate').value = _todayStr();
}

function invOnCustomerChange() {
  _invSelectedPOs.clear();
  renderInvOrderList();
}

function renderInvOrderList() {
  const wrap = $('invOrderListWrap');
  if (!wrap) return;
  const idx = $('inv_customer')?.value ?? '';
  const cust = idx !== '' ? _custCache[parseInt(idx,10)] : null;
  if (!cust) {
    wrap.innerHTML = `<div style="text-align:center;padding:20px;color:var(--t3);font-size:.82rem">
      กรุณาเลือกลูกค้าก่อน</div>`;
    _invUpdateSummary();
    return;
  }
  // คอลัมน์ "ลูกค้า" ใน Order เก็บค่า "ชื่อผู้ติดต่อ" (ตอนออกใบเสนอราคา) ไม่ใช่ชื่อบริษัท
  // จึงจับคู่ด้วย cust.contact เป็นหลัก (เผื่อกรณีกรอกชื่อบริษัทไว้ในช่องนั้นด้วย จึงเทียบ cust.name ด้วย)
  const matchKeys = [cust.contact, cust.name].map(s => (s||'').trim()).filter(Boolean);
  let rows = _orderCache.filter(r =>
    matchKeys.includes(String(r[ORDER_COLS.customer]||'').trim()) &&
    !String(r[ORDER_COLS.invoiceNo]||'').trim()
  );
  const poFilterTerms = ($('invPOFilter')?.value || '').toLowerCase()
    .split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  if (poFilterTerms.length) {
    rows = rows.filter(r => {
      const noPO = String(r[ORDER_COLS.noPO]||'').toLowerCase();
      return poFilterTerms.some(term => noPO.includes(term));
    });
  }
  if (!rows.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:20px;color:var(--t3);font-size:.82rem">
      ${poFilterTerms.length ? 'ไม่พบ PO ที่ตรงกับคำค้นหา' : 'ไม่มี PO ที่ยังไม่ออกใบกำกับสำหรับลูกค้านี้'}</div>`;
    _invUpdateSummary();
    return;
  }
  wrap.innerHTML = rows.map(r => {
    const noPO  = String(r[ORDER_COLS.noPO] || '');
    const prod  = r[ORDER_COLS.productList] || '';
    const date  = r[ORDER_COLS.orderDate] || '';
    const qty   = String(r[ORDER_COLS.qty] || '').trim();
    const note  = String(r[ORDER_COLS.note] || '').trim();
    const total = _invOrderTotal(r);
    const checked = _invSelectedPOs.has(noPO) ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;
      border:1px solid var(--bc-card);margin-bottom:6px;cursor:pointer;background:var(--bg-input2)">
      <input type="checkbox" ${checked} onchange="_invToggleRow('${noPO.replace(/'/g,"\\'")}',this.checked)"
        style="width:18px;height:18px;flex-shrink:0">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;color:var(--c1);font-size:.85rem">${noPO}</div>
        <div style="font-size:.76rem;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${prod}</div>
        <div style="font-size:.7rem;color:var(--t3)">วันที่: ${date}${qty ? ' · จำนวน: '+qty : ''}</div>
        ${note ? `<div style="font-size:.7rem;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">หมายเหตุ: ${note}</div>` : ''}
      </div>
      <div style="font-weight:700;color:#34d399;font-size:.85rem;white-space:nowrap">${fmtB(total)} ฿</div>
    </label>`;
  }).join('');
  _invUpdateSummary();
}

function _invClearPOFilter() {
  if ($('invPOFilter')) $('invPOFilter').value = '';
  renderInvOrderList();
}

function _invToggleRow(noPO, checked) {
  if (checked) _invSelectedPOs.add(noPO);
  else _invSelectedPOs.delete(noPO);
  _invUpdateSummary();
}

function _invUpdateSummary() {
  const sumEl = $('invSummaryWrap');
  if (!sumEl) return;
  let total = 0;
  _orderCache.forEach(r => {
    if (_invSelectedPOs.has(String(r[ORDER_COLS.noPO]||''))) total += _invOrderTotal(r);
  });
  const subtotal = total / 1.07;
  const vat = total - subtotal;
  const poListStr = Array.from(_invSelectedPOs).join(', ');
  sumEl.innerHTML = `
    ${poListStr ? `<div style="font-size:.74rem;color:var(--t3);margin-bottom:6px;word-break:break-all">PO ที่เลือก: ${poListStr}</div>` : ''}
    <div style="display:flex;justify-content:space-between;font-size:.8rem;color:var(--t2);margin-bottom:3px">
      <span>เลือก ${_invSelectedPOs.size} PO — รวมก่อน VAT</span><span>${fmtB(subtotal)} ฿</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:.8rem;color:var(--t2);margin-bottom:3px">
      <span>ภาษีมูลค่าเพิ่ม 7%</span><span>${fmtB(vat)} ฿</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:.95rem;font-weight:800;color:var(--c1);
      border-top:1px solid var(--bc-card);padding-top:6px;margin-top:4px">
      <span>ยอดรวมทั้งสิ้น</span><span>${fmtB(total)} ฿</span>
    </div>`;
}

// ── ตรวจสอบ PO ที่เลือก ว่าซ้ำกับใบกำกับที่ออกไปแล้วหรือไม่ ──
// คืนรายการ {po, invoiceNo} ของ PO ที่พบว่าซ้ำ (เคยอยู่ในใบกำกับอื่นมาก่อน)
function _invFindDuplicatePOs(selectedPOs) {
  const dups = [];
  (_invIssuedCache || []).forEach(inv => {
    const poList = String(inv.poList || '').split(',').map(s => s.trim()).filter(Boolean);
    poList.forEach(po => {
      if (selectedPOs.has(po)) dups.push({ po, invoiceNo: inv.invoiceNo });
    });
  });
  return dups;
}

// ── ออกใบกำกับภาษี: ขอเลขที่เอกสาร → แสดง preview ────────
async function invGeneratePreview() {
  if (!_invSelectedPOs.size) {
    Swal.fire({icon:'warning',title:'กรุณาเลือก PO อย่างน้อย 1 รายการ',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#3b82f6'});
    return;
  }
  if (!SCRIPT_URL) {
    Swal.fire({icon:'info',title:'ยังไม่ตั้งค่า URL',text:'กรุณาใส่ Apps Script URL ก่อน',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    return;
  }

  // ── ตรวจสอบ PO ซ้ำกับใบกำกับที่ออกไปแล้ว ──
  const dups = _invFindDuplicatePOs(_invSelectedPOs);
  if (dups.length) {
    const list = dups.map(d => `PO ${d.po} → อยู่ในใบกำกับ ${d.invoiceNo} แล้ว`).join('<br>');
    const result = await Swal.fire({
      icon: 'warning',
      title: 'พบ PO ซ้ำกับใบกำกับที่ออกไปแล้ว',
      html: list,
      showCancelButton: true,
      confirmButtonText: 'ออกใบกำกับต่อ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#f59e0b',
      background: '#0d1b2a', color: '#cce4ff'
    });
    if (!result.isConfirmed) return;
  }

  const type = $('inv_type')?.value === 'short' ? 'short' : 'full';
  const idx = $('inv_customer')?.value ?? '';
  const cust = idx !== '' ? _custCache[parseInt(idx,10)] : null;
  if (!cust) return;

  Swal.fire({title:'กำลังขอเลขที่ใบกำกับ...',background:'#0d1b2a',color:'#cce4ff',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getNextInvoiceNo&type=' + type, {mode:'cors'});
    const data = await res.json();
    if (!data || data.status !== 'ok') throw new Error((data && data.message) || 'failed');
    Swal.close();

    // ── เสนอเลขที่ใบกำกับถัดไป แต่แก้ไขได้ (เหมือนใบวางบิล) ──
    const numResult = await Swal.fire({
      icon:'question', title:'เลขที่ใบกำกับ',
      input:'text', inputValue: data.nextNo,
      inputLabel:'ระบบเสนอเลขถัดไปให้ — แก้ไขได้ถ้าต้องการ',
      showCancelButton:true, confirmButtonText:'ใช้เลขนี้', cancelButtonText:'ยกเลิก',
      confirmButtonColor:'#2563eb', background:'#0d1b2a', color:'#cce4ff',
      inputValidator: v => !v.trim() ? 'กรุณากรอกเลขที่ใบกำกับ' : undefined
    });
    if (!numResult.isConfirmed) return;
    const invoiceNo = numResult.value.trim();

    await _invShowPreview(invoiceNo, type, cust);
  } catch (e) {
    Swal.fire({icon:'error',title:'ขอเลขที่ไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
  }
}

// ── สร้างรายการสินค้า (items) แบบโครงสร้างข้อมูล จากแถว Order ที่เลือก ──
function _invBuildItemsFromOrders(orderRows) {
  return orderRows.map(r => {
    const qty = parseFloat(r[ORDER_COLS.qty]) || 0;
    const priceExVat = parseFloat(r[ORDER_COLS.price]) || 0;
    const lineTotal = _invOrderTotal(r);
    const sizeParts = String(r[ORDER_COLS.productList]||'').split(/[x×X]/).map(s=>s.trim()).filter(Boolean);
    return {
      poNo:     String(r[ORDER_COLS.noPO]||''),
      workType: String(r[ORDER_COLS.workType]||'').trim(),
      od: sizeParts[0]||'', id: sizeParts[1]||'', h: sizeParts[2]||'',
      meshOut:  String(r[ORDER_COLS.meshOut]||'').trim(),
      meshIn:   String(r[ORDER_COLS.meshIn]||'').trim(),
      note:     String(r[ORDER_COLS.note]||'').trim(),
      qty, priceExVat, lineTotal,
    };
  });
}

// ── สร้างแถวตารางรายการสินค้า (ใช้ทั้งตอนออกใบกำกับใหม่ และพิมพ์ใบกำกับเดิม) ──
function _invRenderItemRows(itemsArr, isFull) {
  let total = 0;
  const rowsHtml = (itemsArr || []).map((it, idx) => {
    const qty = parseFloat(it.qty) || 0;
    const priceExVat = parseFloat(it.priceExVat) || 0;
    const lineTotal = (it.lineTotal != null && it.lineTotal !== '') ? (parseFloat(it.lineTotal)||0) : (qty * priceExVat * 1.07);
    total += lineTotal;
    const unitPrice = isFull ? priceExVat : priceExVat * 1.07;
    const amount    = isFull ? lineTotal / 1.07 : lineTotal;

    let sizeLine = '';
    if (it.od || it.id || it.h) sizeLine = `SIZE :OD${it.od||''}xID${it.id||''}xH${it.h||''} mm`;

    const detailLines = [];
    if (it.workType) detailLines.push(`แบบงาน: ${it.workType}`);
    if (sizeLine) detailLines.push(sizeLine);
    if (it.meshOut) detailLines.push(`ตะแกรงนอก: ${matLabel(it.meshOut)}`);
    if (it.meshIn) detailLines.push(`ตะแกรงใน: ${matLabel(it.meshIn)}`);
    if (it.note) detailLines.push(`หมายเหตุ: ${it.note}`);
    const detailHtml = detailLines.length
      ? `<div style="font-size:.71rem;color:#666;margin-top:3px;line-height:1.5">${detailLines.join('<br>')}</div>`
      : '';

    return `<tr style="border-bottom:1px solid #e8ecf2">
      <td style="padding:8px 10px;text-align:center">${idx + 1}</td>
      <td style="padding:8px 10px">${it.poNo ? `(PO ${it.poNo})` : ''}${detailHtml}</td>
      <td style="padding:8px 10px;text-align:center">${qty || ''}</td>
      <td style="padding:8px 10px;text-align:right">${fmtB(unitPrice)}</td>
      <td style="padding:8px 10px;text-align:right">${fmtB(amount)}</td>
    </tr>`;
  }).join('');
  return { rowsHtml, total };
}

// ── สร้าง HTML เอกสารใบกำกับภาษี (ใช้ร่วมกันทั้งออกใหม่ และพิมพ์ใบเดิม) ──
function _invBuildDocHtml({ invoiceNo, isFull, cust, dateStr, itemRows, subtotal, vat, total }) {
  const co = _companyInfoCache || {};
  return `
<div class="doc-paper" style="overflow:hidden">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;
    padding:22px 28px 14px;border-bottom:3px solid #2563eb;gap:12px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:56px;height:56px;border-radius:10px;flex-shrink:0;overflow:hidden;
        display:flex;align-items:center;justify-content:center">
        <img src="${_getLogoSrc()}" alt="PTS" style="width:100%;height:100%;object-fit:contain"
          onerror="this.parentNode.style.background='#2563eb';this.style.display='none';this.parentNode.innerHTML='<span style=color:#fff;font-weight:800;font-size:1.05rem>PT</span>'">
      </div>
      <div>
        <div style="font-weight:800;font-size:.95rem;color:#1a2232;padding-bottom:3px;border-bottom:1px solid #2563eb;margin-bottom:3px">${co.name||''}</div>
        <div style="font-size:.65rem;color:#888;letter-spacing:.5px">${co.nameEn||''}</div>
        <div style="font-size:.68rem;color:#555;margin-top:3px;line-height:1.6">
          ${co.address||''}${co.addressEn ? '<br>'+co.addressEn : ''}<br>โทร: ${co.phone||''} | อีเมล์: ${co.email||''}<br>TAX ID: ${co.taxId||''}
        </div>
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:1.6rem;font-weight:800;color:#2563eb;line-height:1">
        ${isFull ? 'ใบกำกับภาษี' : 'ใบกำกับภาษีอย่างย่อ'}</div>
      <div style="font-size:.65rem;color:#888;letter-spacing:2.5px;margin-bottom:10px">
        ${isFull ? 'TAX INVOICE' : 'ABBREVIATED TAX INVOICE'}</div>
      <table style="font-size:.78rem;margin-left:auto">
        <tr><td style="color:#666;padding:2px 6px 2px 0">เลขที่ / No:</td>
            <td style="font-weight:700;color:#2563eb">${invoiceNo}</td></tr>
        <tr><td style="color:#666;padding:2px 6px 2px 0">วันที่ / Date:</td>
            <td>${dateStr}</td></tr>
      </table>
    </div>
  </div>

  <div style="padding:14px 28px;border-bottom:1px solid #e8ecf2">
    <div style="font-size:.62rem;font-weight:700;color:#2563eb;letter-spacing:1.2px;margin-bottom:7px">
      ลูกค้า / CUSTOMER</div>
    <div style="font-size:.9rem;font-weight:700;margin-bottom:2px">${cust.name||''}${cust.branch?' ('+cust.branch+')':''}</div>
    <div style="font-size:.78rem;color:#444;margin-bottom:2px">${cust.address||''}</div>
    <div style="font-size:.78rem;color:#444">
      ${isFull && cust.taxId ? `เลขผู้เสียภาษี: ${cust.taxId} | ` : ''}โทร: ${cust.phone||'—'}
    </div>
  </div>

  <div style="padding:16px 28px">
    <table style="width:100%;border-collapse:collapse;font-size:.79rem">
      <thead>
        <tr style="background:#2563eb;color:#fff">
          <th style="padding:8px 10px;text-align:center;border-radius:4px 0 0 0;width:8%">ลำดับที่</th>
          <th style="padding:8px 10px;text-align:left">รายการ</th>
          <th style="padding:8px 10px;text-align:center;width:9%">จำนวน</th>
          <th style="padding:8px 10px;text-align:right;width:15%">หน่วยละ (฿)</th>
          <th style="padding:8px 10px;text-align:right;width:16%;border-radius:0 4px 0 0">
            ${isFull ? 'มูลค่าก่อน VAT (฿)' : 'จำนวนเงิน (฿)'}</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        ${isFull ? `
        <tr><td colspan="4" style="padding:7px 10px;text-align:right;color:#555;border-top:1px solid #e8ecf2">
            รวมก่อน VAT / Subtotal</td>
          <td style="padding:7px 10px;text-align:right;font-weight:700;border-top:1px solid #e8ecf2">${fmtB(subtotal)}</td></tr>
        <tr><td colspan="4" style="padding:5px 10px;text-align:right;color:#888">ภาษีมูลค่าเพิ่ม VAT 7%</td>
          <td style="padding:5px 10px;text-align:right;color:#888">${fmtB(vat)}</td></tr>
        <tr style="background:#1d4ed8;color:#fff">
          <td colspan="4" style="padding:9px 10px;text-align:right;font-weight:700;font-size:.9rem;border-radius:0 0 0 4px">
            ยอดรวมทั้งสิ้น / GRAND TOTAL</td>
          <td style="padding:9px 10px;text-align:right;font-weight:800;font-size:.9rem;border-radius:0 0 4px 0">
            ฿ ${fmtB(total)}</td>
        </tr>` : `
        <tr style="background:#1d4ed8;color:#fff">
          <td colspan="4" style="padding:9px 10px;text-align:right;font-weight:700;font-size:.9rem;border-radius:0 0 0 4px">
            ยอดรวมทั้งสิ้น (รวม VAT) / GRAND TOTAL</td>
          <td style="padding:9px 10px;text-align:right;font-weight:800;font-size:.9rem;border-radius:0 0 4px 0">
            ฿ ${fmtB(total)}</td>
        </tr>`}
      </tfoot>
    </table>
  </div>

  <div style="display:flex;gap:12px;padding:24px 28px 28px;flex-wrap:wrap">
    <div style="flex:1;text-align:center;min-width:160px">
      <div style="margin-top:35px;border-top:1px solid #bbb;padding-top:5px;font-size:.7rem;color:#555">ผู้รับเงิน / Received by</div>
      <div style="font-size:.65rem;color:#aaa;margin-top:10px;display:flex;align-items:center;justify-content:center;gap:4px">(<span style="display:inline-block;min-width:150px;border-bottom:1px solid #999;height:1px"></span>)</div>
      <div style="font-size:.65rem;color:#aaa;margin-top:10px">วันที่ ......../......../........</div>
    </div>
    <div style="flex:1;text-align:center;min-width:160px">
      <div style="margin-top:35px;border-top:1px solid #bbb;padding-top:5px;font-size:.7rem;color:#555">ผู้มีอำนาจลงนาม / Authorized signature</div>
      <div style="font-size:.65rem;color:#aaa;margin-top:10px;display:flex;align-items:center;justify-content:center;gap:4px">(<span style="display:inline-block;min-width:150px;border-bottom:1px solid #999;height:1px"></span>)</div>
      <div style="font-size:.65rem;color:#aaa;margin-top:10px">วันที่ ......../......../........</div>
    </div>
  </div>
</div>`;
}

// ── ออกใบกำกับใหม่: แสดง preview พร้อมปุ่มยืนยันออกใบกำกับ ──
async function _invShowPreview(invoiceNo, type, cust) {
  const isFull = type === 'full';
  const orderRows = _orderCache.filter(r => _invSelectedPOs.has(String(r[ORDER_COLS.noPO]||'')));
  const itemsArr = _invBuildItemsFromOrders(orderRows);
  const { rowsHtml: itemRows, total } = _invRenderItemRows(itemsArr, isFull);
  const subtotal = total / 1.07;
  const vat = total - subtotal;
  const now = new Date();
  const dateStr = now.toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});

  const html = _invBuildDocHtml({ invoiceNo, isFull, cust, dateStr, itemRows, subtotal, vat, total });

  _invPreviewMode = true;
  _invPreviewData = { invoiceNo, type, customerCode: cust.code, poList: [..._invSelectedPOs], subtotal, vat, total, items: itemsArr };

  let docInv = $('docInv');
  if (!docInv) {
    docInv = document.createElement('div');
    docInv.id = 'docInv';
    $('docQuo').parentNode.appendChild(docInv);
  }
  $('docQuo').classList.add('dp-hidden');
  $('docCost').classList.add('dp-hidden');
  docInv.classList.remove('dp-hidden');
  docInv.innerHTML = html;

  if ($('dtabQuo'))  $('dtabQuo').style.display  = 'none';
  if ($('dtabCost')) $('dtabCost').style.display = 'none';
  const swapBtn = document.querySelector('.doc-bottombar .doc-tab-btn[onclick*="_docActiveTab"]');
  if (swapBtn) swapBtn.style.display = 'none';

  // เพิ่มปุ่ม "ยืนยันออกใบกำกับ" ใน bottombar
  let confirmBtn = $('invConfirmBtn');
  if (!confirmBtn) {
    confirmBtn = document.createElement('button');
    confirmBtn.id = 'invConfirmBtn';
    confirmBtn.className = 'doc-tab-btn no-print';
    confirmBtn.style = 'padding:8px 18px;border-radius:8px;border:none;background:#2563eb;' +
      'color:#fff;font-size:.82rem;font-weight:700;cursor:pointer;font-family:Sarabun,sans-serif;margin-right:8px';
    confirmBtn.onclick = invConfirmIssue;
    document.querySelector('.doc-bottombar > div').prepend(confirmBtn);
  }
  confirmBtn.textContent = '✅ ยืนยันออกใบกำกับ ' + invoiceNo;
  confirmBtn.style.display = '';

  _invCurrentDocData = {
    invoiceNo, cust, dateStr, isFull,
    poText: [..._invSelectedPOs].join(', '),
    itemsArr, subtotal, vat, total,
  };
  _invAddOverlayButtons();

  $('docExportOverlay').classList.add('open');
}

async function invConfirmIssue() {
  if (!_invPreviewData) return;
  Swal.fire({
    icon:'question', title:`ยืนยันออกใบกำกับเลขที่ ${_invPreviewData.invoiceNo}?`,
    html:`<div style="font-size:.83rem;color:#8b8aaa">ยอดรวม ${fmtB(_invPreviewData.total)} ฿ — ${_invPreviewData.poList.length} PO<br>
      หลังยืนยัน PO เหล่านี้จะถูกบันทึกว่าออกใบกำกับแล้ว</div>`,
    background:'#0d1b2a', color:'#cce4ff',
    confirmButtonText:'✅ ยืนยัน', confirmButtonColor:'#2563eb',
    showCancelButton:true, cancelButtonText:'ยกเลิก', cancelButtonColor:'#374151',
  }).then(async r => {
    if (!r.isConfirmed) return;
    Swal.fire({
      title: 'กำลังออกใบกำกับ...', html: 'กรุณารอสักครู่',
      background:'#0d1b2a', color:'#cce4ff',
      allowOutsideClick:false, allowEscapeKey:false, showConfirmButton:false,
      didOpen: () => Swal.showLoading(),
    });
    try {
      const res = await fetch(SCRIPT_URL, {
        method:'POST', mode:'cors',
        headers:{'Content-Type':'text/plain'},
        body: JSON.stringify(Object.assign({ action:'saveInvoiceRecord', issuedBy: 'PTS' }, _invPreviewData))
      });
      const out = await res.json();
      if (!out || out.status !== 'ok') throw new Error((out && out.message) || 'save failed');
      _invSelectedPOs.clear();
      _invPreviewData = null;
      closeDocExport();
      if ($('invPOFilter')) $('invPOFilter').value = '';
      await fetchOrders();
      renderInvOrderList();
      fetchIssuedInvoices();
      Swal.fire({icon:'success',title:`ออกใบกำกับ ${out.invoiceNo} สำเร็จ ✅`,background:'#0d1b2a',color:'#cce4ff',
        timer:1800,showConfirmButton:false,toast:true,position:'top-end'});
    } catch (e) {
      Swal.fire({icon:'error',title:'ออกใบกำกับไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
    }
  });
}

let _invPreviewMode = false;
let _invPreviewData = null;

// ── แปลงวันที่ dd/MM/yyyy เป็นวันที่ไทยแบบยาว ──
function _invThaiDate(d) {
  const p = String(d||'').split('/');
  if (p.length !== 3) return d || '';
  let y = parseInt(p[2],10);
  if (y > 2400) y -= 543; // เก็บเป็น พ.ศ. (เช่น 2569) -> แปลงเป็น ค.ศ. ก่อนสร้าง Date กัน toLocaleDateString บวก 543 ซ้ำ
  const dt = new Date(y, parseInt(p[1],10) - 1, parseInt(p[0],10));
  if (isNaN(dt.getTime())) return d || '';
  return dt.toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});
}

// ── พิมพ์ใบกำกับเดิมซ้ำ (ใช้ข้อมูล/รายการที่แก้ไขแล้ว ไม่มีปุ่มยืนยันออกใบกำกับ) ──
function _invReprintInvoice(inv, itemsArr) {
  const isFull = !(inv.type === 'short' || inv.type === 'อย่างย่อ');
  const cust = _custCache.find(c => c.code === inv.customerCode) || {};
  const items = itemsArr || inv.items || [];
  const { rowsHtml: itemRows, total } = _invRenderItemRows(items, isFull);
  const subtotal = (inv.subtotal !== undefined && inv.subtotal !== '') ? parseFloat(inv.subtotal)||0 : total/1.07;
  const vat      = (inv.vat !== undefined && inv.vat !== '')           ? parseFloat(inv.vat)||0      : (total - subtotal);
  const grand    = (inv.total !== undefined && inv.total !== '')       ? parseFloat(inv.total)||0    : total;
  const dateStr  = _invThaiDate(inv.date);

  const html = _invBuildDocHtml({ invoiceNo: inv.invoiceNo, isFull, cust, dateStr, itemRows, subtotal, vat, total: grand });

  _invPreviewMode = true;
  _invPreviewData = null;

  let docInv = $('docInv');
  if (!docInv) {
    docInv = document.createElement('div');
    docInv.id = 'docInv';
    $('docQuo').parentNode.appendChild(docInv);
  }
  $('docQuo').classList.add('dp-hidden');
  $('docCost').classList.add('dp-hidden');
  docInv.classList.remove('dp-hidden');
  docInv.innerHTML = html;

  if ($('dtabQuo'))  $('dtabQuo').style.display  = 'none';
  if ($('dtabCost')) $('dtabCost').style.display = 'none';
  const swapBtn = document.querySelector('.doc-bottombar .doc-tab-btn[onclick*="_docActiveTab"]');
  if (swapBtn) swapBtn.style.display = 'none';

  const confirmBtn = $('invConfirmBtn');
  if (confirmBtn) confirmBtn.style.display = 'none';

  const poText = (inv.poList && inv.poList.length) ? inv.poList.join(', ')
    : [...new Set(items.map(it => it.poNo).filter(Boolean))].join(', ');
  _invCurrentDocData = {
    invoiceNo: inv.invoiceNo, cust, dateStr, isFull,
    poText, itemsArr: items, subtotal, vat, total: grand,
  };
  _invAddOverlayButtons();

  $('docExportOverlay').classList.add('open');
}

// ══════════════════════════════════════════════════════
// ══ พิมพ์บนฟอร์มสำเร็จ (กระดาษ A4 ต่อเนื่องที่พิมพ์หัวกระดาษไว้แล้ว) ══
// ══════════════════════════════════════════════════════
let _invCurrentDocData = null;

// ตำแหน่งเริ่มต้น (มม. จากมุมบนซ้ายของกระดาษ A4 210x297) — ปรับได้ที่ "⚙️ ตำแหน่ง"
const _INV_OVERLAY_DEFAULT_POS = {
  companyLogo:     {x:15, y:6},
  companyLogoSize: {x:25, y:15},
  companyName:   {x:45,  y:7,  size:13, bold:true},
  companyNameEn: {x:45,  y:12, size:11, bold:true},
  companyAddr:   {x:45,  y:17, size:10, bold:false},
  companyAddrEn: {x:45,  y:22, size:10, bold:false},
  companyTax:    {x:45,  y:27, size:10, bold:false},
  companyContact:{x:45,  y:32, size:10, bold:false},
  custTaxId:   {x:18,  y:44, size:10, bold:false},
  custName:    {x:18,  y:50, size:10, bold:false},
  custAddr:    {x:18,  y:56, size:10, bold:false},
  invoiceNo:   {x:178, y:30, size:10, bold:false},
  date:        {x:178, y:38, size:10, bold:false},
  poNo:        {x:178, y:46, size:10, bold:false},
  itemNo:      {x:12,  y:80, size:10, bold:false},
  itemDesc:    {x:24,  y:80, size:8.5, bold:false},
  itemQty:     {x:128, y:80, size:10, bold:false},
  itemPrice:   {x:150, y:80, size:10, bold:false},
  itemTotal:   {x:178, y:80, size:10, bold:false},
  rowHeight:   {x:7,   y:0},
  amountWords: {x:18,  y:238, size:10, bold:false},
  subtotal:    {x:178, y:238, size:10, bold:false},
  vat:         {x:178, y:246, size:10, bold:false},
  total:       {x:178, y:254, size:10, bold:false},
};
const _INV_OVERLAY_FIELD_LABELS = {
  companyLogo:'ตำแหน่งโลโก้ (มุมซ้ายบน)', companyLogoSize:'ขนาดโลโก้ (กว้าง x สูง มม.)',
  companyName:'ชื่อบริษัทเรา (ไทย)', companyNameEn:'ชื่อบริษัทเรา (อังกฤษ)',
  companyAddr:'ที่อยู่บริษัทเรา (ไทย)', companyAddrEn:'ที่อยู่บริษัทเรา (อังกฤษ)',
  companyTax:'เลขประจำตัวผู้เสียภาษีอากรบริษัทเรา',
  companyContact:'เบอร์โทร/อีเมล์บริษัทเรา',
  custName:'ชื่อลูกค้า', custAddr:'ที่อยู่ลูกค้า', custTaxId:'เลขผู้เสียภาษีลูกค้า',
  invoiceNo:'เลขที่ใบกำกับ', date:'วันที่', poNo:'เลขที่ PO/เอกสาร',
  itemNo:'ลำดับ (แถวแรก)', itemDesc:'รายละเอียดสินค้า (แถวแรก)', itemQty:'จำนวน+หน่วย (แถวแรก)',
  itemPrice:'ราคาต่อหน่วย (แถวแรก)', itemTotal:'จำนวนเงิน (แถวแรก)', rowHeight:'ความสูงต่อแถว (มม.)',
  amountWords:'จำนวนเงินเป็นตัวอักษร', subtotal:'รวมก่อน VAT', vat:'ภาษีมูลค่าเพิ่ม VAT', total:'ยอดรวมทั้งสิ้น',
};

function _invOverlayGetPos() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('_invOverlayPos') || '{}'); } catch(e) {}
  const merged = {};
  Object.keys(_INV_OVERLAY_DEFAULT_POS).forEach(k => {
    merged[k] = Object.assign({}, _INV_OVERLAY_DEFAULT_POS[k], saved[k] || {});
  });
  return merged;
}
function _invOverlaySavePos(pos) {
  localStorage.setItem('_invOverlayPos', JSON.stringify(pos));
}

// ── เพิ่มปุ่ม "พิมพ์บนฟอร์มสำเร็จ" + "⚙️ ตำแหน่ง" ใน bottombar ของ preview ──
function _invAddOverlayButtons() {
  const bar = document.querySelector('.doc-bottombar > div');
  if (!bar) return;

  let cfgBtn = $('invOverlaySettingsBtn');
  if (!cfgBtn) {
    cfgBtn = document.createElement('button');
    cfgBtn.id = 'invOverlaySettingsBtn';
    cfgBtn.className = 'doc-tab-btn no-print';
    cfgBtn.style = 'padding:8px 12px;border-radius:8px;border:none;background:#374151;' +
      'color:#fff;font-size:.82rem;font-weight:700;cursor:pointer;font-family:Sarabun,sans-serif;margin-right:8px';
    cfgBtn.textContent = '⚙️ ตำแหน่ง';
    cfgBtn.onclick = _invOverlaySettings;
    bar.prepend(cfgBtn);
  }
  cfgBtn.style.display = '';

  let btn = $('invOverlayPrintBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'invOverlayPrintBtn';
    btn.className = 'doc-tab-btn no-print';
    btn.style = 'padding:8px 14px;border-radius:8px;border:none;background:#16a34a;' +
      'color:#fff;font-size:.82rem;font-weight:700;cursor:pointer;font-family:Sarabun,sans-serif;margin-right:8px';
    btn.textContent = '🖨 พิมพ์บนฟอร์มสำเร็จ';
    btn.onclick = _invPrintOverlayCurrent;
    bar.prepend(btn);
  }
  btn.style.display = '';
}

// ── อ่านจำนวนเงินเป็นข้อความภาษาไทย เช่น "หนึ่งหมื่นสี่ร้อยแปดสิบหกบาทถ้วน" ──
const _TH_DIGIT_WORDS = ['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
const _TH_PLACE_WORDS = ['','สิบ','ร้อย','พัน','หมื่น','แสน','ล้าน'];
function _thaiNumReadInt(n) {
  n = Math.floor(n);
  if (n === 0) return 'ศูนย์';
  let result = '';
  // จัดการหลักล้านขึ้นไปแบบวนซ้ำ (1,000,000 ขึ้นไป)
  if (n >= 10000000) {
    const millions = Math.floor(n / 1000000);
    result += _thaiNumReadInt(millions) + 'ล้าน';
    n = n % 1000000;
    if (n === 0) return result;
  }
  const digits = String(n).split('').map(d => parseInt(d,10));
  const len = digits.length;
  digits.forEach((d, i) => {
    const place = len - i - 1;
    if (d === 0) return;
    if (place === 0 && d === 1 && len > 1) result += 'เอ็ด';
    else if (place === 1 && d === 1) result += 'สิบ';
    else if (place === 1 && d === 2) result += 'ยี่สิบ';
    else result += _TH_DIGIT_WORDS[d] + (_TH_PLACE_WORDS[place] || '');
  });
  return result;
}
function _thaiBahtText(num) {
  num = Math.round((parseFloat(num)||0) * 100) / 100;
  const neg = num < 0;
  num = Math.abs(num);
  const baht = Math.floor(num);
  const satang = Math.round((num - baht) * 100);
  let text = _thaiNumReadInt(baht) + 'บาท';
  text += satang === 0 ? 'ถ้วน' : (_thaiNumReadInt(satang) + 'สตางค์');
  return (neg ? 'ลบ' : '') + text;
}

// ── เปิดหน้าต่างพิมพ์เฉพาะข้อมูล (overlay) ทับฟอร์มกระดาษที่พิมพ์ไว้แล้ว ──
function _invPrintOverlayCurrent() {
  if (!_invCurrentDocData) {
    Swal.fire({icon:'warning', title:'ไม่มีข้อมูลใบกำกับให้พิมพ์', background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#1d65cc'});
    return;
  }
  _invPrintOverlay(_invCurrentDocData);
}

function _invPrintOverlay(data) {
  const { invoiceNo, cust, dateStr, poText, itemsArr, subtotal, vat, total, isFull } = data;
  const pos = _invOverlayGetPos();
  const rowH = pos.rowHeight.x || 7;
  let html = '';

  const addField = (key, text, extraStyle) => {
    const p = pos[key];
    if (!p || text === '' || text == null) return;
    const sz = p.size || 10;
    const fw = p.bold ? 800 : 400;
    html += `<div style="position:absolute;left:${p.x}mm;top:${p.y}mm;font-size:${sz}pt;font-weight:${fw};white-space:nowrap;${extraStyle||''}">${text}</div>`;
  };

  const co = _companyInfoCache || {};
  const logoSrc = (typeof _getLogoSrc === 'function') ? _getLogoSrc() : (co.logoUrl || '');
  if (logoSrc) {
    const lp = pos.companyLogo, ls = pos.companyLogoSize;
    html += `<img src="${logoSrc}" style="position:absolute;left:${lp.x}mm;top:${lp.y}mm;width:${ls.x}mm;height:${ls.y}mm;object-fit:contain">`;
  }
  addField('companyName', co.name || '', 'padding-bottom:0.8mm;border-bottom:1mm solid #2563eb;');
  addField('companyNameEn', co.nameEn || '');
  addField('companyAddr', co.address || '');
  addField('companyAddrEn', co.addressEn || '');
  const coTaxLine = co.taxId ? ('เลขประจำตัวผู้เสียภาษีอากร : ' + co.taxId) : '';
  addField('companyTax', coTaxLine);
  const coContactLine = [co.phone ? ('โทร: ' + co.phone) : '', co.email ? ('อีเมล์: ' + co.email) : ''].filter(Boolean).join('  ');
  addField('companyContact', coContactLine);

  addField('custName', cust.name || '');
  addField('custAddr', cust.address || '');
  if (isFull && cust.taxId) addField('custTaxId', cust.taxId);
  addField('invoiceNo', invoiceNo || '');
  addField('date', dateStr || '');
  addField('poNo', poText || '');

  let _ovY = pos.itemNo.y;
  // เพดานความสูงของพื้นที่รายการสินค้า — ไม่ให้แถวสุดท้ายล้นลงไปทับ/เกินพื้นที่ "จำนวนเงินเป็นตัวอักษร"
  // (กันไม่ให้เนื้อหารวมทั้งหน้าเกิน 297มม. ซึ่งจะทำให้เบราว์เซอร์ auto-scale ตอนพิมพ์ จนตำแหน่ง X/Y ที่ตั้งไว้คงที่ดูเหมือน "ขยับ")
  const _ovMaxY = pos.amountWords.y - 10;
  (itemsArr || []).forEach((it, idx) => {
    const y = Math.min(_ovY, _ovMaxY);
    const qty = parseFloat(it.qty) || 0;
    const priceExVat = parseFloat(it.priceExVat) || 0;
    const lineTotal = (it.lineTotal != null && it.lineTotal !== '') ? (parseFloat(it.lineTotal)||0) : (qty * priceExVat * 1.07);
    const unitPrice = isFull ? priceExVat : priceExVat * 1.07;
    const amount = isFull ? lineTotal / 1.07 : lineTotal;

    const descLines = [];
    if (it.workType) descLines.push(it.workType);
    if (it.od || it.id || it.h) descLines.push(`SIZE: OD${it.od||''}xID${it.id||''}xH${it.h||''} mm`);
    if (it.meshOut) descLines.push(`ตะแกรงนอก: ${matLabel(it.meshOut)}`);
    if (it.meshIn) descLines.push(`ตะแกรงใน: ${matLabel(it.meshIn)}`);
    if (it.note) descLines.push(it.note);
    descLines.forEach((l,i) => {
      html += `<div style="position:absolute;left:${pos.itemDesc.x}mm;top:${y + i*4}mm;width:${Math.max(20, (pos.itemQty.x - pos.itemDesc.x - 2))}mm;font-size:${pos.itemDesc.size||8.5}pt;font-weight:${pos.itemDesc.bold?800:400};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l}</div>`;
    });

    html += `<div style="position:absolute;left:${pos.itemNo.x}mm;top:${y}mm;font-size:${pos.itemNo.size||10}pt;font-weight:${pos.itemNo.bold?800:400}">${idx+1}</div>`;
    html += `<div style="position:absolute;left:${pos.itemQty.x}mm;top:${y}mm;font-size:${pos.itemQty.size||10}pt;font-weight:${pos.itemQty.bold?800:400};white-space:nowrap">${qty ? fmtB(qty, qty%1?2:0)+' '+(it.unit||'EA') : ''}</div>`;
    html += `<div style="position:absolute;left:${pos.itemPrice.x}mm;top:${y}mm;font-size:${pos.itemPrice.size||10}pt;font-weight:${pos.itemPrice.bold?800:400};text-align:right;white-space:nowrap">${fmtB(unitPrice)}</div>`;
    html += `<div style="position:absolute;left:${pos.itemTotal.x}mm;top:${y}mm;font-size:${pos.itemTotal.size||10}pt;font-weight:${pos.itemTotal.bold?800:400};text-align:right;white-space:nowrap">${fmtB(amount)}</div>`;

    // เว้นระยะแถวถัดไปตามจำนวนบรรทัดรายละเอียด (กันทับกัน) อย่างน้อย rowH
    _ovY += Math.max(rowH, descLines.length * 4 + 3);
  });

  addField('amountWords', _thaiBahtText(total));
  addField('subtotal', fmtB(subtotal), 'text-align:right');
  if (isFull) addField('vat', fmtB(vat), 'text-align:right');
  addField('total', fmtB(total), 'text-align:right');

  const docHtml = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
<title>พิมพ์บนฟอร์มสำเร็จ — ${invoiceNo||''}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap">
<style>
  @page { size: A4; margin: 0; }
  html,body { margin:0; padding:0; }
  body { font-family:'Sarabun',sans-serif; color:#000; }
  .ov-page { position:relative; width:210mm; height:297mm; }
  .ov-page div { line-height:1.25; }
  @media print { .ov-page { page-break-after: avoid; } }
</style>
</head><body>
<div class="ov-page">${html}</div>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) {
    Swal.fire({icon:'error', title:'เปิดหน้าต่างไม่ได้', text:'กรุณาอนุญาต popup สำหรับเว็บไซต์นี้',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#1d65cc'});
    return;
  }
  w.document.open();
  w.document.write(docHtml);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch(e) {} }, 350);
}

// ── ตั้งค่าตำแหน่งฟิลด์ (มม.) สำหรับพิมพ์บนฟอร์มสำเร็จ — เก็บใน localStorage ──
function _invOverlaySettings() {
  const pos = _invOverlayGetPos();
  const rows = Object.keys(_INV_OVERLAY_DEFAULT_POS).map(k => {
    const label = _INV_OVERLAY_FIELD_LABELS[k] || k;
    const hasTextStyle = (pos[k].size !== undefined);
    if (k === 'rowHeight') {
      return `<tr><td style="padding:3px 8px;text-align:left;color:#cce4ff">${label}</td>
        <td colspan="4" style="padding:3px"><input type="number" step="0.5" id="ovp_${k}_x" value="${pos[k].x}" style="width:60px;font-family:Sarabun,sans-serif"></td></tr>`;
    }
    const styleCells = hasTextStyle ? `
      <td style="padding:3px;color:#8b8aaa">Size:<input type="number" step="0.5" id="ovp_${k}_size" value="${pos[k].size}" style="width:64px;font-size:1rem;padding:4px;font-family:Sarabun,sans-serif;margin-left:4px"></td>
      <td style="padding:3px;color:#8b8aaa">หนา:<input type="checkbox" id="ovp_${k}_bold" ${pos[k].bold ? 'checked' : ''} style="width:18px;height:18px;margin-left:4px;vertical-align:middle"></td>` :
      `<td colspan="2"></td>`;
    return `<tr><td style="padding:3px 8px;text-align:left;color:#cce4ff;white-space:nowrap">${label}</td>
      <td style="padding:3px;color:#8b8aaa">X:<input type="number" step="0.5" id="ovp_${k}_x" value="${pos[k].x}" style="width:64px;font-size:1rem;padding:4px;font-family:Sarabun,sans-serif;margin-left:4px"></td>
      <td style="padding:3px;color:#8b8aaa">Y:<input type="number" step="0.5" id="ovp_${k}_y" value="${pos[k].y}" style="width:64px;font-size:1rem;padding:4px;font-family:Sarabun,sans-serif;margin-left:4px"></td>${styleCells}</tr>`;
  }).join('');

  Swal.fire({
    title: '⚙️ ตั้งค่าตำแหน่งพิมพ์บนฟอร์มสำเร็จ',
    html: `<div style="max-height:55vh;overflow:auto;text-align:left">
      <div style="font-size:.76rem;color:#8b8aaa;margin-bottom:8px;line-height:1.5">
        ระบุตำแหน่ง X/Y เป็นมิลลิเมตร นับจากมุมบนซ้ายของกระดาษ A4 (210×297 มม.)<br>
        พิมพ์ทดสอบแล้ววางทับฟอร์มจริงเพื่อเทียบตำแหน่ง จากนั้นปรับค่าทีละน้อยจนตรง</div>
      <table style="font-size:.8rem;width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table>
    </div>`,
    width: 'min(680px, 95vw)',
    heightAuto: false,
    background:'#0d1b2a', color:'#cce4ff',
    showCancelButton:true, showDenyButton:true,
    confirmButtonText:'💾 บันทึก', confirmButtonColor:'#2563eb',
    denyButtonText:'↺ คืนค่าเริ่มต้น', denyButtonColor:'#6b7280',
    cancelButtonText:'ยกเลิก', cancelButtonColor:'#374151',
    preConfirm: () => {
      const newPos = {};
      Object.keys(_INV_OVERLAY_DEFAULT_POS).forEach(k => {
        const xEl = document.getElementById(`ovp_${k}_x`);
        const yEl = document.getElementById(`ovp_${k}_y`);
        const sizeEl = document.getElementById(`ovp_${k}_size`);
        const boldEl = document.getElementById(`ovp_${k}_bold`);
        newPos[k] = { x: parseFloat(xEl.value)||0, y: yEl ? (parseFloat(yEl.value)||0) : 0 };
        if (sizeEl) newPos[k].size = parseFloat(sizeEl.value)||10;
        if (boldEl) newPos[k].bold = boldEl.checked;
      });
      return newPos;
    }
  }).then(r => {
    if (r.isConfirmed) {
      _invOverlaySavePos(r.value);
      Swal.fire({icon:'success', title:'บันทึกตำแหน่งแล้ว', background:'#0d1b2a', color:'#cce4ff',
        timer:1300, showConfirmButton:false, toast:true, position:'top-end'});
    } else if (r.isDenied) {
      localStorage.removeItem('_invOverlayPos');
      Swal.fire({icon:'info', title:'คืนค่าเริ่มต้นแล้ว', background:'#0d1b2a', color:'#cce4ff',
        timer:1300, showConfirmButton:false, toast:true, position:'top-end'});
    }
  });
}

// ══════════════════════════════════════════════════════
// ══ ใบกำกับที่ออกแล้ว — แก้ไขรายละเอียด ══════════════════
// ══════════════════════════════════════════════════════
let _invIssuedCache = [];

// ── คลิกเลขที่ PO ในรายการใบกำกับที่ออกแล้ว -> ไปแท็บ Order พร้อมกรองด้วยเลข PO นั้น ──
function _invGoToOrderPO(po) {
  switchTab('order');
  if ($('ordSearch')) {
    $('ordSearch').value = po;
    if (typeof renderOrderTable === 'function') renderOrderTable();
  }
}

async function fetchIssuedInvoices() {
  if (!SCRIPT_URL) { renderIssuedInvoiceList(); return; }
  const wrap = $('invIssuedListWrap');
  if (wrap) wrap.innerHTML = `<div style="text-align:center;padding:16px;color:var(--t3);font-size:.82rem"><span class="spin-ico">↻</span> กำลังโหลด…</div>`;
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getInvoices', {mode:'cors'});
    const data = await res.json();
    if (data.status === 'ok') _invIssuedCache = (data.invoices || []).slice().reverse(); // ล่าสุดอยู่บน
    else throw new Error(data.message || 'unknown');
  } catch (e) {
    if (wrap) { wrap.innerHTML = `<div style="text-align:center;padding:16px;color:#f87171;font-size:.82rem">โหลดข้อมูลไม่สำเร็จ: ${e.message}</div>`; return; }
  }
  renderIssuedInvoiceList();
}

// ล้างตัวกรอง "ใบกำกับที่ออกแล้ว"
function _invClearIssuedFilter() {
  if ($('invIssuedFilterSearch')) $('invIssuedFilterSearch').value = '';
  if ($('invIssuedFilterType'))   $('invIssuedFilterType').value   = '';
  if ($('invIssuedFilterFrom'))   $('invIssuedFilterFrom').value   = '';
  if ($('invIssuedFilterTo'))     $('invIssuedFilterTo').value     = '';
  renderIssuedInvoiceList();
}

// "13/06/2569" -> "2026-06-13" (BE -> ISO) สำหรับเทียบกับ <input type=date>
function _invIssuedDateToIso(d) {
  const p = String(d||'').split('/');
  if (p.length !== 3) return '';
  let y = parseInt(p[2],10);
  if (y > 2400) y -= 543;
  return `${y}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
}

// ── แบ่งหน้ารายการ "ใบกำกับที่ออกแล้ว" เป็นรายเดือน (เรียงปัจจุบัน -> เก่า) ──
let _invIssuedPageYM = null; // {y, m} ปี ค.ศ./เดือน (1-12) ของหน้าที่กำลังแสดง
const _INV_MONTH_NAMES = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

function _invIssuedAllYMs() {
  const set = new Set();
  _invIssuedCache.forEach(inv => {
    const iso = _invIssuedDateToIso(inv.date);
    if (iso) set.add(iso.slice(0,7)); // "yyyy-MM"
  });
  return Array.from(set).sort(); // เก่า -> ใหม่
}

function _invIssuedChangeMonth(delta) {
  const yms = _invIssuedAllYMs();
  if (!yms.length || !_invIssuedPageYM) return;
  const cur = `${_invIssuedPageYM.y}-${String(_invIssuedPageYM.m).padStart(2,'0')}`;
  let idx = yms.indexOf(cur);
  if (idx === -1) idx = yms.length - 1;
  idx += delta;
  if (idx < 0 || idx >= yms.length) return;
  const [y,m] = yms[idx].split('-').map(Number);
  _invIssuedPageYM = { y, m };
  renderIssuedInvoiceList();
}

function renderIssuedInvoiceList() {
  const wrap = $('invIssuedListWrap');
  if (!wrap) return;
  if (!_invIssuedCache.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:16px;color:var(--t3);font-size:.82rem">
      ยังไม่มีใบกำกับที่ออก</div>`;
    return;
  }

  // ── ตัวกรอง ──
  const qTerms = ($('invIssuedFilterSearch')?.value || '').toLowerCase()
    .split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  const typeFilter = $('invIssuedFilterType')?.value || '';
  const dateFrom = $('invIssuedFilterFrom')?.value || '';
  const dateTo   = $('invIssuedFilterTo')?.value || '';

  let list = _invIssuedCache;

  if (qTerms.length) {
    list = list.filter(inv => {
      const cust = _custCache.find(c => c.code === inv.customerCode) || {};
      const poList = (inv.items || []).map(it => it.poNo).filter(Boolean);
      const poArr  = poList.length ? poList : (inv.poList ? (Array.isArray(inv.poList) ? inv.poList : String(inv.poList).split(',').map(s=>s.trim()).filter(Boolean)) : []);
      const fields = [inv.invoiceNo, cust.name||inv.customerCode||'', cust.branch||'', ...poArr]
        .map(v => String(v||'').toLowerCase());
      return qTerms.some(term => fields.some(v => v.includes(term)));
    });
  }

  if (typeFilter) {
    list = list.filter(inv => {
      const isFull = !(inv.type === 'short' || inv.type === 'อย่างย่อ');
      return typeFilter === 'full' ? isFull : !isFull;
    });
  }

  if (dateFrom || dateTo) {
    list = list.filter(inv => {
      const iso = _invIssuedDateToIso(inv.date);
      if (!iso) return false;
      if (dateFrom && iso < dateFrom) return false;
      if (dateTo   && iso > dateTo)   return false;
      return true;
    });
  }

  // ── แบ่งหน้ารายเดือน (เฉพาะตอนไม่ได้กำหนดช่วงวันที่เอง) ──
  let pageBar = '';
  if (!dateFrom && !dateTo) {
    const yms = _invIssuedAllYMs();
    if (yms.length) {
      if (!_invIssuedPageYM) {
        const [y,m] = yms[yms.length-1].split('-').map(Number); // เดือนล่าสุด
        _invIssuedPageYM = { y, m };
      }
      const curYM = `${_invIssuedPageYM.y}-${String(_invIssuedPageYM.m).padStart(2,'0')}`;
      const idx = yms.indexOf(curYM);
      list = list.filter(inv => _invIssuedDateToIso(inv.date).slice(0,7) === curYM);
      const beYear = _invIssuedPageYM.y + 543;
      pageBar = `
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:12px;padding:8px 12px;
          border:1px solid var(--bc-card);border-radius:10px;background:var(--bg-input2)">
          <button type="button" onclick="_invIssuedChangeMonth(-1)" ${idx<=0?'disabled':''}
            style="padding:5px 14px;border-radius:7px;border:1px solid var(--bc-card);background:var(--bg-input);
            color:var(--t1);font-size:.78rem;cursor:${idx<=0?'default':'pointer'};opacity:${idx<=0?'.35':'1'};font-family:Sarabun,sans-serif">‹ เดือนก่อนหน้า</button>
          <div style="flex:1;text-align:center;font-weight:700;font-size:.9rem;color:var(--t1)">${_INV_MONTH_NAMES[_invIssuedPageYM.m]} ${beYear}</div>
          <button type="button" onclick="_invIssuedChangeMonth(1)" ${idx>=yms.length-1?'disabled':''}
            style="padding:5px 14px;border-radius:7px;border:1px solid var(--bc-card);background:var(--bg-input);
            color:var(--t1);font-size:.78rem;cursor:${idx>=yms.length-1?'default':'pointer'};opacity:${idx>=yms.length-1?'.35':'1'};font-family:Sarabun,sans-serif">เดือนถัดไป ›</button>
        </div>`;
    }
  }

  if (!list.length) {
    wrap.innerHTML = pageBar + `<div style="text-align:center;padding:16px;color:var(--t3);font-size:.82rem">
      ไม่พบใบกำกับในเดือนนี้</div>`;
    return;
  }

  const rows = list.map(inv => {
    const cust = _custCache.find(c => c.code === inv.customerCode) || {};
    const poList = (inv.items || []).map(it => it.poNo).filter(Boolean);
    const poArr  = poList.length ? poList : (inv.poList ? (Array.isArray(inv.poList) ? inv.poList : String(inv.poList).split(',').map(s=>s.trim()).filter(Boolean)) : []);
    const poText = poArr.length
      ? poArr.map(po => `<a href="javascript:void(0)" onclick="_invGoToOrderPO('${String(po).replace(/'/g,"\\'")}')"
          style="color:#818cf8;text-decoration:underline;cursor:pointer">${po}</a>`).join(', ')
      : '-';
    return `<tr style="border-bottom:1px solid var(--bc-card)">
      <td style="padding:6px 8px;font-weight:700;color:var(--c1);white-space:nowrap">${inv.invoiceNo}</td>
      <td style="padding:6px 8px;font-size:.78rem;color:var(--t2);white-space:nowrap">${inv.date}</td>
      <td style="padding:6px 8px;font-size:.78rem;color:var(--t2)">${cust.name||inv.customerCode||''}${cust.branch?' ('+cust.branch+')':''}</td>
      <td style="padding:6px 8px;font-size:.78rem;color:var(--t3)">${poText}</td>
      <td style="padding:6px 8px;font-size:.78rem;color:var(--t3)">${inv.type}</td>
      <td style="padding:6px 8px;font-size:.78rem;color:#34d399;text-align:right;white-space:nowrap">${fmtB(inv.total)} ฿</td>
      <td style="padding:6px 8px;text-align:center;white-space:nowrap">
        <button onclick="openEditInvoice('${inv.invoiceNo.replace(/'/g,"\\'")}')"
          style="padding:3px 10px;border-radius:6px;border:1px solid rgba(99,102,241,.4);background:transparent;
          color:#818cf8;font-family:Sarabun,sans-serif;font-size:.75rem;cursor:pointer;margin-right:4px">✏️ แก้ไข</button>
        <button onclick="deleteIssuedInvoice('${inv.invoiceNo.replace(/'/g,"\\'")}')"
          style="padding:3px 10px;border-radius:6px;border:1px solid rgba(220,38,38,.4);background:transparent;
          color:#f87171;font-family:Sarabun,sans-serif;font-size:.75rem;cursor:pointer">🗑️ ลบ</button>
      </td>
    </tr>`;
  }).join('');
  wrap.innerHTML = pageBar + `
    <table style="width:100%;border-collapse:collapse;font-size:.8rem">
      <thead>
        <tr style="border-bottom:1px solid var(--bc-card)">
          <th style="padding:6px 8px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">เลขที่ใบกำกับ</th>
          <th style="padding:6px 8px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">วันที่</th>
          <th style="padding:6px 8px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">ลูกค้า</th>
          <th style="padding:6px 8px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">รายการ PO</th>
          <th style="padding:6px 8px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">ประเภท</th>
          <th style="padding:6px 8px;text-align:right;color:var(--t2);font-weight:600;font-size:.75rem">ยอดรวม</th>
          <th style="padding:6px 8px;width:130px"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── ลบใบกำกับที่ออกแล้ว (พร้อมยืนยัน) ──
async function deleteIssuedInvoice(invoiceNo) {
  const result = await Swal.fire({
    icon: 'warning',
    title: `ลบใบกำกับ ${invoiceNo}?`,
    text: 'การลบนี้ไม่สามารถย้อนกลับได้',
    showCancelButton: true,
    confirmButtonText: 'ลบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#dc2626',
    background: '#0d1b2a', color: '#cce4ff'
  });
  if (!result.isConfirmed) return;

  if (!SCRIPT_URL) return;
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST', mode: 'cors',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'deleteInvoiceRecord', invoiceNo })
    });
    const out = await res.json();
    if (!out || out.status !== 'ok') throw new Error((out && out.message) || 'delete failed');
    await fetchIssuedInvoices();
    Swal.fire({icon:'success',title:`ลบใบกำกับ ${invoiceNo} แล้ว ✅`,background:'#0d1b2a',color:'#cce4ff',
      timer:1500,showConfirmButton:false,toast:true,position:'top-end'});
  } catch (e) {
    Swal.fire({icon:'error',title:'ลบไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
  }
}

// แปลงวันที่ dd/MM/yyyy <-> yyyy-MM-dd (สำหรับ <input type="date">)
function _invDateToInput(d) {
  const p = String(d||'').split('/');
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}` : '';
}
function _invDateFromInput(d) {
  const p = String(d||'').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '';
}

// ── HTML ของแถวรายการสินค้า 1 แถวในตัวแก้ไข ──
function _invItemRowHtml(it) {
  it = it || {};
  const esc = s => String(s==null?'':s).replace(/"/g,'&quot;');
  return `<div class="inv-item-row" style="border:1px solid var(--bc-card);border-radius:8px;padding:10px;margin-bottom:10px;
    display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px 10px">
    <div class="field" style="grid-column:span 2;display:flex;gap:6px;align-items:flex-end">
      <div style="flex:1"><label>PO</label><input type="text" class="ii-po" value="${esc(it.poNo)}"></div>
      <button type="button" class="btn" onclick="_invOpenPOPicker(this)" style="padding:7px 10px;font-size:.74rem;white-space:nowrap">🔍 เลือก PO</button>
    </div>
    <div class="field"><label>OD</label><input type="text" class="ii-od" value="${esc(it.od)}"></div>
    <div class="field"><label>ID</label><input type="text" class="ii-id" value="${esc(it.id)}"></div>
    <div class="field"><label>H</label><input type="text" class="ii-h" value="${esc(it.h)}"></div>
    <div class="field" style="grid-column:span 2"><label>แบบงาน</label><input type="text" class="ii-worktype" value="${esc(it.workType)}"></div>
    <div class="field"><label>ตะแกรงนอก</label><input type="text" class="ii-meshout" value="${esc(it.meshOut)}"></div>
    <div class="field"><label>ตะแกรงใน</label><input type="text" class="ii-meshin" value="${esc(it.meshIn)}"></div>
    <div class="field" style="grid-column:span 2"><label>หมายเหตุ</label><input type="text" class="ii-note" value="${esc(it.note)}"></div>
    <div class="field"><label>จำนวน</label><input type="number" class="ii-qty" step="any" value="${it.qty??''}"></div>
    <div class="field" style="grid-column:span 2"><label>ราคา/หน่วย (ก่อน VAT)</label><input type="number" class="ii-price" step="0.01" value="${it.priceExVat??''}"></div>
    <div style="display:flex;align-items:flex-end">
      <button type="button" class="btn" onclick="_invRemoveItemRow(this)" style="padding:7px 10px;font-size:.74rem;width:100%">🗑️ ลบรายการ</button>
    </div>
  </div>`;
}

function _invRenderItemsEditor(items) {
  const wrap = $('invEdit_itemsWrap');
  if (!wrap) return;
  wrap.innerHTML = (items || []).map(_invItemRowHtml).join('');
  // คำนวณยอด/รายการ PO อัตโนมัติทุกครั้งที่มีการพิมพ์แก้ไขในแถวรายการ
  wrap.oninput = _invEditRecalcAll;
  _invEditRecalcAll();
}

function invEditAddItem() {
  const wrap = $('invEdit_itemsWrap');
  if (!wrap) return;
  wrap.insertAdjacentHTML('beforeend', _invItemRowHtml({}));
  _invEditRecalcAll();
  Swal.fire({icon:'success',title:'เพิ่มรายการแล้ว',background:'#0d1b2a',color:'#cce4ff',
    timer:1000,showConfirmButton:false,toast:true,position:'top-end'});
}

async function _invRemoveItemRow(btn) {
  const row = btn.closest('.inv-item-row');
  if (!row) return;
  const wrap = $('invEdit_itemsWrap');
  if (wrap && wrap.querySelectorAll('.inv-item-row').length <= 1) {
    Swal.fire({icon:'warning',title:'ต้องมีรายการสินค้าอย่างน้อย 1 รายการ',background:'#0d1b2a',color:'#cce4ff',
      timer:1500,showConfirmButton:false,toast:true,position:'top-end'});
    return;
  }
  const po = row.querySelector('.ii-po')?.value.trim();
  const result = await Swal.fire({
    icon: 'warning',
    title: 'ลบรายการนี้?',
    text: po ? `รายการ PO ${po} จะถูกลบออกจากใบกำกับนี้` : 'รายการนี้จะถูกลบออกจากใบกำกับนี้',
    showCancelButton: true,
    confirmButtonText: 'ลบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#dc2626',
    background: '#0d1b2a', color: '#cce4ff'
  });
  if (!result.isConfirmed) return;
  row.remove();
  _invEditRecalcAll();
  Swal.fire({icon:'success',title:'ลบรายการแล้ว',background:'#0d1b2a',color:'#cce4ff',
    timer:1000,showConfirmButton:false,toast:true,position:'top-end'});
}

function _invCollectEditItems() {
  const wrap = $('invEdit_itemsWrap');
  if (!wrap) return [];
  return [...wrap.querySelectorAll('.inv-item-row')].map(row => {
    const qty = parseFloat(row.querySelector('.ii-qty').value) || 0;
    const priceExVat = parseFloat(row.querySelector('.ii-price').value) || 0;
    return {
      poNo:       row.querySelector('.ii-po').value.trim(),
      workType:   row.querySelector('.ii-worktype').value.trim(),
      od:         row.querySelector('.ii-od').value.trim(),
      id:         row.querySelector('.ii-id').value.trim(),
      h:          row.querySelector('.ii-h').value.trim(),
      meshOut:    row.querySelector('.ii-meshout').value.trim(),
      meshIn:     row.querySelector('.ii-meshin').value.trim(),
      note:       row.querySelector('.ii-note').value.trim(),
      qty,
      priceExVat,
      lineTotal:  qty * priceExVat * 1.07,
    };
  });
}

// ── ตัวเลือก PO: ดึงรายละเอียดจาก _orderCache มาเติมในแถวรายการที่เลือก ──
let _invPOPickerTargetRow = null;

function _invOpenPOPicker(btn) {
  _invPOPickerTargetRow = btn.closest('.inv-item-row');
  const s = $('invPOPicker_search');
  if (s) s.value = '';
  _invRenderPOPickerList('');
  $('invPOPickerModal').style.display = 'flex';
}

function _invClosePOPicker() {
  $('invPOPickerModal').style.display = 'none';
  _invPOPickerTargetRow = null;
}

// PO ที่ถูกใช้ไปแล้วในแถวอื่นๆ ของใบกำกับนี้ (ไม่รวมแถวเป้าหมายเอง) — ห้ามเลือกซ้ำ
function _invUsedPOsInEditor() {
  const wrap = $('invEdit_itemsWrap');
  if (!wrap) return new Set();
  const used = new Set();
  [...wrap.querySelectorAll('.inv-item-row')].forEach(row => {
    if (row === _invPOPickerTargetRow) return;
    const po = row.querySelector('.ii-po')?.value.trim();
    if (po) used.add(po);
  });
  return used;
}

function _invRenderPOPickerList(filter) {
  const list = $('invPOPicker_list');
  if (!list) return;
  const f = String(filter||'').trim().toLowerCase();

  // กรองตามลูกค้าของใบกำกับที่กำลังแก้ไข
  const custSel = $('invEdit_customer');
  const cust = custSel ? _custCache.find(c => c.code === custSel.value) : null;
  // คอลัมน์ "ลูกค้า" ใน Order เก็บค่า "ชื่อผู้ติดต่อ" เป็นหลัก (เผื่อกรอกชื่อบริษัทไว้ จึงเทียบ cust.name ด้วย)
  const matchKeys = cust ? [cust.contact, cust.name].map(s => (s||'').trim()).filter(Boolean) : [];

  const usedPOs = _invUsedPOsInEditor();

  const rows = (_orderCache || []).filter(r => {
    const noPO = String(r[ORDER_COLS.noPO]||'').trim();
    if (!noPO) return false;
    if (usedPOs.has(noPO)) return false; // ห้ามเลือก PO ที่ใช้ไปแล้วในแถวอื่น
    if (matchKeys.length && !matchKeys.includes(String(r[ORDER_COLS.customer]||'').trim())) return false; // เฉพาะลูกค้าเดียวกัน
    if (!f) return true;
    const hay = [noPO, r[ORDER_COLS.customer], r[ORDER_COLS.productList], r[ORDER_COLS.workType]].join(' ').toLowerCase();
    return hay.includes(f);
  }).slice(0, 200);

  list.innerHTML = rows.map(r => {
    const noPO = String(r[ORDER_COLS.noPO]||'').trim();
    const cust = String(r[ORDER_COLS.customer]||'').trim();
    const size = String(r[ORDER_COLS.productList]||'').trim();
    const work = String(r[ORDER_COLS.workType]||'').trim();
    const qty  = parseFloat(r[ORDER_COLS.qty]) || 0;
    return `<div onclick="_invPickPO('${noPO.replace(/'/g,"\\'")}')" style="padding:8px 10px;border-bottom:1px solid var(--bc-card);cursor:pointer;font-size:.8rem">
      <div style="font-weight:700;color:var(--c1)">PO ${noPO}${cust?` <span style="color:var(--t3);font-weight:400">— ${cust}</span>`:''}</div>
      <div style="color:var(--t3);font-size:.74rem">${size}${work?' | '+work:''}${qty?' | จำนวน '+qty:''}</div>
    </div>`;
  }).join('') || `<div style="padding:14px;text-align:center;color:var(--t3);font-size:.8rem">ไม่พบ PO</div>`;
}

function _invPickPO(noPO) {
  const row = (_orderCache || []).find(r => String(r[ORDER_COLS.noPO]||'').trim() === noPO);
  const tr  = _invPOPickerTargetRow;
  if (!row || !tr) { _invClosePOPicker(); return; }
  const item = _invBuildItemsFromOrders([row])[0];
  tr.querySelector('.ii-po').value       = item.poNo;
  tr.querySelector('.ii-od').value       = item.od;
  tr.querySelector('.ii-id').value       = item.id;
  tr.querySelector('.ii-h').value        = item.h;
  tr.querySelector('.ii-worktype').value = item.workType;
  tr.querySelector('.ii-meshout').value  = item.meshOut;
  tr.querySelector('.ii-meshin').value   = item.meshIn;
  tr.querySelector('.ii-note').value     = item.note;
  tr.querySelector('.ii-qty').value      = item.qty;
  tr.querySelector('.ii-price').value    = item.priceExVat;
  _invClosePOPicker();
  _invEditRecalcAll();
  Swal.fire({icon:'success',title:`เลือก PO ${item.poNo} แล้ว`,background:'#0d1b2a',color:'#cce4ff',
    timer:1200,showConfirmButton:false,toast:true,position:'top-end'});
}

function openEditInvoice(invoiceNo) {
  const inv = _invIssuedCache.find(x => x.invoiceNo === invoiceNo);
  if (!inv) return;
  $('invEdit_no').textContent = inv.invoiceNo;
  $('invEdit_invoiceNo').value = inv.invoiceNo;
  $('invEdit_date').value = _invDateToInput(inv.date);
  $('invEdit_type').value = inv.type === 'อย่างย่อ' ? 'short' : 'full';
  $('invEdit_poList').value = inv.poList || '';
  $('invEdit_subtotal').value = inv.subtotal;
  $('invEdit_vat').value = inv.vat;
  $('invEdit_total').value = inv.total;
  $('invEdit_status').value = inv.status || 'ออกแล้ว';

  // ลูกค้า: เติม select ด้วยรายชื่อจาก _custCache
  const sel = $('invEdit_customer');
  sel.innerHTML = _custCache.map(c => `<option value="${c.code}">${c.name}${c.branch?' ('+c.branch+')':''}</option>`).join('');
  sel.value = inv.customerCode;

  _invRenderItemsEditor(inv.items || []);

  $('invEditModal').style.display = 'flex';
}

function closeInvoiceEdit() {
  $('invEditModal').style.display = 'none';
}

// ── คำนวณรายการ PO / มูลค่าก่อน VAT / VAT / ยอดรวม อัตโนมัติจากรายการสินค้าในตัวแก้ไข ──
function _invEditRecalcAll() {
  const items = _invCollectEditItems();
  const poList = [...new Set(items.map(it => it.poNo).filter(Boolean))];
  const sub = items.reduce((s, it) => s + (it.qty * it.priceExVat), 0);
  const vat = sub * 0.07;
  const poEl = $('invEdit_poList');
  if (poEl) poEl.value = poList.join(', ');
  $('invEdit_subtotal').value = sub.toFixed(2);
  $('invEdit_vat').value = vat.toFixed(2);
  $('invEdit_total').value = (sub + vat).toFixed(2);
}

// ── ดูตัวอย่างใบกำกับจากข้อมูลที่กำลังแก้ไข (ยังไม่บันทึก) ──
function _invPreviewEditDoc() {
  _invEditRecalcAll();
  const items = _invCollectEditItems();
  const inv = {
    invoiceNo: $('invEdit_invoiceNo').value,
    type: $('invEdit_type').value,
    customerCode: $('invEdit_customer').value,
    date: _invDateFromInput($('invEdit_date').value),
    subtotal: $('invEdit_subtotal').value,
    vat: $('invEdit_vat').value,
    total: $('invEdit_total').value,
  };
  _invReprintInvoice(inv, items);
}

async function saveInvoiceEdit(thenReprint) {
  const invoiceNo = $('invEdit_invoiceNo').value;
  const dateStr = _invDateFromInput($('invEdit_date').value);
  if (!dateStr) {
    Swal.fire({icon:'warning',title:'กรุณาเลือกวันที่',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#3b82f6'});
    return false;
  }
  const poList = $('invEdit_poList').value.split(',').map(s=>s.trim()).filter(Boolean);
  const orig = _invIssuedCache.find(x => x.invoiceNo === invoiceNo) || {};
  const items = _invCollectEditItems();

  // ── ตรวจสอบ PO ซ้ำกับใบกำกับอื่น (ไม่รวมใบนี้เอง) ──
  const dups = _invFindDuplicatePOs(new Set(poList)).filter(d => d.invoiceNo !== invoiceNo);
  if (dups.length) {
    const list = dups.map(d => `PO ${d.po} → อยู่ในใบกำกับ ${d.invoiceNo} แล้ว`).join('<br>');
    const result = await Swal.fire({
      icon: 'warning',
      title: 'พบ PO ซ้ำกับใบกำกับอื่น',
      html: list,
      showCancelButton: true,
      confirmButtonText: 'บันทึกต่อ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#f59e0b',
      background: '#0d1b2a', color: '#cce4ff'
    });
    if (!result.isConfirmed) return false;
  }
  const data = {
    action: 'updateInvoiceRecord',
    invoiceNo,
    date: dateStr,
    type: $('invEdit_type').value,
    customerCode: $('invEdit_customer').value,
    poList,
    subtotal: parseFloat($('invEdit_subtotal').value) || 0,
    vat: parseFloat($('invEdit_vat').value) || 0,
    total: parseFloat($('invEdit_total').value) || 0,
    status: $('invEdit_status').value,
    issuedBy: orig.issuedBy || '',
    items,
  };
  Swal.fire({
    title: thenReprint ? 'กำลังบันทึกและเตรียมพิมพ์...' : 'กำลังบันทึก...',
    text: 'กรุณารอสักครู่ อาจใช้เวลาสักครู่',
    background:'#0d1b2a', color:'#cce4ff',
    allowOutsideClick: false, allowEscapeKey: false,
    didOpen: () => Swal.showLoading()
  });
  try {
    const res = await fetch(SCRIPT_URL, {
      method:'POST', mode:'cors',
      headers:{'Content-Type':'text/plain'},
      body: JSON.stringify(data)
    });
    const out = await res.json();
    if (!out || out.status !== 'ok') throw new Error((out && out.message) || 'save failed');
    await fetchIssuedInvoices();
    Swal.close();
    if (thenReprint) {
      const updated = _invIssuedCache.find(x => x.invoiceNo === invoiceNo) || Object.assign({}, data);
      closeInvoiceEdit();
      _invReprintInvoice(updated, items);
    } else {
      closeInvoiceEdit();
      Swal.fire({icon:'success',title:`แก้ไขใบกำกับ ${invoiceNo} แล้ว ✅`,background:'#0d1b2a',color:'#cce4ff',
        timer:1500,showConfirmButton:false,toast:true,position:'top-end'});
    }
    return true;
  } catch (e) {
    Swal.close();
    Swal.fire({icon:'error',title:'แก้ไขไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
    return false;
  }
}

function saveInvoiceEditAndReprint() {
  saveInvoiceEdit(true);
}

// ══════════════════════════════════════════════════════
// ══ รายงานภาษีขาย (Sales Tax Report) ════════════════════
// ══════════════════════════════════════════════════════
async function invShowSalesTaxReport() {
  if (!SCRIPT_URL) {
    Swal.fire({icon:'info',title:'ยังไม่ตั้งค่า URL',text:'กรุณาใส่ Apps Script URL ก่อน',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    return;
  }
  const month = parseInt($('invRep_month')?.value, 10);
  const year  = parseInt($('invRep_year')?.value, 10);
  if (!month || !year) {
    Swal.fire({icon:'warning',title:'กรุณาเลือกเดือน/ปี',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#3b82f6'});
    return;
  }

  Swal.fire({title:'กำลังโหลดข้อมูล...',background:'#0d1b2a',color:'#cce4ff',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getInvoices', {mode:'cors'});
    const data = await res.json();
    if (!data || data.status !== 'ok') throw new Error((data && data.message) || 'failed');
    Swal.close();

    // กรองตามเดือน/ปีที่เลือก — วันที่เก็บเป็น dd/MM/yyyy
    const list = (data.invoices || []).filter(inv => {
      const parts = String(inv.date||'').split('/');
      if (parts.length !== 3) return false;
      return parseInt(parts[1],10) === month && parseInt(parts[2],10) === year;
    }).sort((a,b) => a.invoiceNo.localeCompare(b.invoiceNo));

    _invRepShowPreview(list, month, year);
  } catch (e) {
    Swal.fire({icon:'error',title:'โหลดข้อมูลไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
  }
}

function _invRepShowPreview(list, month, year) {
  const co = _companyInfoCache || {};
  const monthNames = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

  let sumSubtotal = 0, sumVat = 0, sumTotal = 0;
  const rows = list.map((inv, idx) => {
    const cust = _custCache.find(c => c.code === inv.customerCode) || {};
    const isBranch = (cust.branch||'').trim() && !/สำนักงานใหญ่|head\s*office/i.test(cust.branch||'');
    sumSubtotal += inv.subtotal; sumVat += inv.vat; sumTotal += inv.total;
    return `<tr style="border-bottom:1px solid #e8ecf2">
      <td style="padding:6px 8px;text-align:center">${idx+1}</td>
      <td style="padding:6px 8px;text-align:center;white-space:nowrap">${inv.date}</td>
      <td style="padding:6px 8px;text-align:center;white-space:nowrap">${inv.invoiceNo}</td>
      <td style="padding:6px 8px;white-space:nowrap">${cust.name||''}</td>
      <td style="padding:6px 8px;text-align:center;white-space:nowrap">${cust.taxId||''}</td>
      <td style="padding:6px 8px;text-align:center;font-size:.7rem">${isBranch ? `สาขา ${cust.branch}` : 'สำนักงานใหญ่'}</td>
      <td style="padding:6px 8px;text-align:right">${fmtB(inv.subtotal)}</td>
      <td style="padding:6px 8px;text-align:right">${fmtB(inv.vat)}</td>
      <td style="padding:6px 8px;text-align:right">${fmtB(inv.total)}</td>
    </tr>`;
  }).join('');

  const html = `
<div class="doc-paper" style="overflow:hidden;max-width:1180px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;
    padding:22px 28px 14px;border-bottom:3px solid #0d9488;gap:12px;flex-wrap:wrap">
    <div>
      <div style="font-weight:800;font-size:.95rem;color:#1a2232;padding-bottom:3px;border-bottom:1px solid #0d9488;margin-bottom:3px">${co.name||''} (สำนักงานใหญ่)</div>
      <div style="font-size:.65rem;color:#888;letter-spacing:.5px">${co.nameEn||''} (Head office)</div>
      <div style="font-size:.68rem;color:#555;margin-top:3px;line-height:1.6">
        ${co.address||''}${co.addressEn ? '<br>'+co.addressEn : ''}<br>TAX ID: ${co.taxId||''}
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:1.4rem;font-weight:800;color:#0d9488;line-height:1">รายงานภาษีขาย</div>
      <div style="font-size:.65rem;color:#888;letter-spacing:2.5px;margin-bottom:6px">SALES TAX REPORT</div>
      <div style="font-size:.85rem;font-weight:700;color:#333">ประจำเดือน ${monthNames[month]} ${year}</div>
    </div>
  </div>

  <div style="padding:14px 28px">
    <table style="width:100%;border-collapse:collapse;font-size:.74rem">
      <thead>
        <tr style="background:#e0f2f1;color:#0f4f49;border-bottom:2px solid #0d9488;-webkit-print-color-adjust:exact;print-color-adjust:exact">
          <th style="padding:6px 8px;text-align:center;border-radius:4px 0 0 0">ลำดับ</th>
          <th style="padding:6px 8px;text-align:center">วัน เดือน ปี</th>
          <th style="padding:6px 8px;text-align:center">เลขที่ใบกำกับ</th>
          <th style="padding:6px 8px;text-align:left;white-space:nowrap">บริษัทร้านค้า</th>
          <th style="padding:6px 8px;text-align:center">เลขประจำตัวผู้เสียภาษี</th>
          <th style="padding:6px 8px;text-align:center">สำนักงานใหญ่/สาขา</th>
          <th style="padding:6px 8px;text-align:right">มูลค่าก่อน VAT (฿)</th>
          <th style="padding:6px 8px;text-align:right">VAT (฿)</th>
          <th style="padding:6px 8px;text-align:right;border-radius:0 4px 0 0">รวม (฿)</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="9" style="padding:18px;text-align:center;color:#999">ไม่มีใบกำกับในเดือนนี้</td></tr>`}</tbody>
      <tfoot>
        <tr style="background:#e0f2f1;color:#0f4f49;border-top:2px solid #0d9488;-webkit-print-color-adjust:exact;print-color-adjust:exact">
          <td colspan="6" style="padding:8px;text-align:right;font-weight:700;border-radius:0 0 0 4px">สรุปยอดขาย ณ สิ้นเดือน</td>
          <td style="padding:8px;text-align:right;font-weight:800">${fmtB(sumSubtotal)}</td>
          <td style="padding:8px;text-align:right;font-weight:800">${fmtB(sumVat)}</td>
          <td style="padding:8px;text-align:right;font-weight:800;border-radius:0 0 4px 0">${fmtB(sumTotal)}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</div>`;

  _invPreviewMode = true;

  let docRep = $('docInvRep');
  if (!docRep) {
    docRep = document.createElement('div');
    docRep.id = 'docInvRep';
    $('docQuo').parentNode.appendChild(docRep);
  }
  ['docQuo','docCost','docInv'].forEach(id => { if ($(id)) $(id).classList.add('dp-hidden'); });
  docRep.classList.remove('dp-hidden');
  docRep.innerHTML = html;

  if ($('dtabQuo'))  $('dtabQuo').style.display  = 'none';
  if ($('dtabCost')) $('dtabCost').style.display = 'none';
  const swapBtn = document.querySelector('.doc-bottombar .doc-tab-btn[onclick*="_docActiveTab"]');
  if (swapBtn) swapBtn.style.display = 'none';
  if ($('invConfirmBtn')) $('invConfirmBtn').style.display = 'none';

  $('docExportOverlay').classList.add('open');
}

// ══════════════════════════════════════════════════════
// ══ ใบวางบิล — รวมใบกำกับภาษีที่ออกแล้วของลูกค้าเดียวกัน ══
// ══════════════════════════════════════════════════════

// เติม dropdown "ลูกค้า" ของใบวางบิล จาก _custCache
function _billRefreshCustomerSelect() {
  const sel = $('billCustomer');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— เลือกลูกค้า —</option>' +
    (_custCache || []).map(c => `<option value="${c.code}">${c.name}${c.branch ? ' (' + c.branch + ')' : ''}</option>`).join('');
  if (cur) sel.value = cur;
}

// ── ค้นหาใบกำกับของลูกค้าที่เลือก ในช่วงวันที่ที่กำหนด -> แสดง checklist ──
function _billLoadInvoices() {
  const wrap = $('billInvoiceListWrap');
  if (!wrap) return;
  const custCode = $('billCustomer')?.value || '';
  const dateFrom = $('billDateFrom')?.value || '';
  const dateTo   = $('billDateTo')?.value || '';

  if (!custCode) {
    wrap.innerHTML = `<div style="text-align:center;padding:16px;color:var(--t3);font-size:.82rem">กรุณาเลือกลูกค้าก่อน</div>`;
    return;
  }

  let list = (_invIssuedCache || []).filter(inv => inv.customerCode === custCode && !inv.billNo);
  if (dateFrom || dateTo) {
    list = list.filter(inv => {
      const iso = _invIssuedDateToIso(inv.date);
      if (!iso) return false;
      if (dateFrom && iso < dateFrom) return false;
      if (dateTo   && iso > dateTo)   return false;
      return true;
    });
  }

  if (!list.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:16px;color:var(--t3);font-size:.82rem">ไม่พบใบกำกับที่ยังไม่วางบิลของลูกค้านี้ในช่วงที่เลือก</div>`;
    return;
  }

  // เสนอเลขที่ใบวางบิลถัดไป (ถ้าช่องยังไม่ได้กรอก)
  _billSuggestNextNo();

  const rows = list.map((inv, idx) => {
    const poList = (inv.items || []).map(it => it.poNo).filter(Boolean);
    const poArr  = poList.length ? poList : (inv.poList ? (Array.isArray(inv.poList) ? inv.poList : String(inv.poList).split(',').map(s=>s.trim()).filter(Boolean)) : []);
    const total = (inv.total !== undefined && inv.total !== '') ? parseFloat(inv.total)||0 : 0;
    return `<tr style="border-bottom:1px solid var(--bc-card)">
      <td style="padding:6px 8px;text-align:center">
        <input type="checkbox" class="bill-chk" data-idx="${idx}" checked style="width:16px;height:16px;cursor:pointer">
      </td>
      <td style="padding:6px 8px">${inv.invoiceNo}</td>
      <td style="padding:6px 8px">${inv.date}</td>
      <td style="padding:6px 8px">${poArr.join(', ') || '-'}</td>
      <td style="padding:6px 8px;text-align:right">${fmtB(total)}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:.8rem">
      <thead>
        <tr style="border-bottom:1px solid var(--bc-card)">
          <th style="padding:6px 8px;text-align:center;width:34px">
            <input type="checkbox" id="billChkAll" checked onchange="_billToggleAll(this.checked)" style="width:16px;height:16px;cursor:pointer">
          </th>
          <th style="padding:6px 8px;text-align:left">เลขที่ใบกำกับ</th>
          <th style="padding:6px 8px;text-align:left">วันที่</th>
          <th style="padding:6px 8px;text-align:left">เลขที่ PO</th>
          <th style="padding:6px 8px;text-align:right">จำนวนเงิน</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  wrap._billList = list;
}

function _billToggleAll(checked) {
  document.querySelectorAll('#billInvoiceListWrap .bill-chk').forEach(c => c.checked = checked);
}

// ── เสนอเลขที่ใบวางบิลถัดไปจาก BillingNote sheet (ถ้าช่องยังว่าง) — แก้ไขเองได้เสมอ ──
async function _billSuggestNextNo() {
  if (!SCRIPT_URL || !$('billNo') || $('billNo').value.trim()) return;
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getNextBillNo', {mode:'cors'});
    const data = await res.json();
    if (data.status === 'ok' && data.billNo && !$('billNo').value.trim()) {
      $('billNo').value = data.billNo;
    }
  } catch (e) { /* เงียบไว้ — ผู้ใช้กรอกเองได้ */ }
}

// ── สร้าง HTML เอกสารใบวางบิล ──
function _billBuildDocHtml({ billNo, billDateStr, payTerm, cust, items, wht }) {
  const co = _companyInfoCache || {};
  const sumTotal    = items.reduce((s,i) => s + (parseFloat(i.total)||0), 0);
  const sumSubtotal = items.reduce((s,i) => {
    const t = parseFloat(i.total)||0;
    const sub = (i.subtotal !== undefined && i.subtotal !== '') ? parseFloat(i.subtotal)||0 : t/1.07;
    return s + sub;
  }, 0);
  const sumVat = sumTotal - sumSubtotal;
  const whtAmount = wht ? sumSubtotal * 0.03 : 0;
  const netAmount = sumTotal - whtAmount;

  const rows = items.map((inv, idx) => {
    const poList = (inv.items || []).map(it => it.poNo).filter(Boolean);
    const poArr  = poList.length ? poList : (inv.poList ? (Array.isArray(inv.poList) ? inv.poList : String(inv.poList).split(',').map(s=>s.trim()).filter(Boolean)) : []);
    const total = (inv.total !== undefined && inv.total !== '') ? parseFloat(inv.total)||0 : 0;
    return `<tr style="border-bottom:1px solid #e8ecf2">
      <td style="padding:7px 10px;text-align:center">${idx + 1}</td>
      <td style="padding:7px 10px">${inv.invoiceNo}</td>
      <td style="padding:7px 10px;text-align:center">${inv.date}</td>
      <td style="padding:7px 10px">${poArr.join(', ') || '-'}</td>
      <td style="padding:7px 10px;text-align:right">${fmtB(total)}</td>
    </tr>`;
  }).join('');

  return `
<div class="doc-paper" style="overflow:hidden">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;
    padding:22px 28px 14px;border-bottom:3px solid #2563eb;gap:12px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:56px;height:56px;border-radius:10px;flex-shrink:0;overflow:hidden;
        display:flex;align-items:center;justify-content:center">
        <img src="${_getLogoSrc()}" alt="PTS" style="width:100%;height:100%;object-fit:contain"
          onerror="this.parentNode.style.background='#2563eb';this.style.display='none';this.parentNode.innerHTML='<span style=color:#fff;font-weight:800;font-size:1.05rem>PT</span>'">
      </div>
      <div>
        <div style="font-weight:800;font-size:.95rem;color:#1a2232;padding-bottom:3px;border-bottom:1px solid #2563eb;margin-bottom:3px">${co.name||''}</div>
        <div style="font-size:.65rem;color:#888;letter-spacing:.5px">${co.nameEn||''}</div>
        <div style="font-size:.68rem;color:#555;margin-top:3px;line-height:1.6">
          ${co.address||''}${co.addressEn ? '<br>'+co.addressEn : ''}<br>โทร: ${co.phone||''} | อีเมล์: ${co.email||''}<br>TAX ID: ${co.taxId||''}
        </div>
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:1.6rem;font-weight:800;color:#2563eb;line-height:1">ใบวางบิล</div>
      <div style="font-size:.65rem;color:#888;letter-spacing:2.5px;margin-bottom:10px">BILLING NOTE</div>
      <table style="font-size:.78rem;margin-left:auto">
        <tr><td style="color:#666;padding:2px 6px 2px 0">เลขที่ใบวางบิล / No:</td>
            <td style="font-weight:700;color:#2563eb">${billNo||''}</td></tr>
        <tr><td style="color:#666;padding:2px 6px 2px 0">วันที่ / Date:</td>
            <td>${billDateStr}</td></tr>
        <tr><td style="color:#666;padding:2px 6px 2px 0">เงื่อนไขการชำระเงิน:</td>
            <td>${payTerm||''}</td></tr>
      </table>
    </div>
  </div>

  <div style="padding:14px 28px;border-bottom:1px solid #e8ecf2">
    <div style="font-size:.62rem;font-weight:700;color:#2563eb;letter-spacing:1.2px;margin-bottom:7px">
      ลูกค้า / CUSTOMER</div>
    <div style="font-size:.9rem;font-weight:700;margin-bottom:2px">${cust.name||''}${cust.branch?' ('+cust.branch+')':''}</div>
    <div style="font-size:.78rem;color:#444;margin-bottom:2px">${cust.address||''}</div>
    <div style="font-size:.78rem;color:#444">
      ${cust.taxId ? `เลขผู้เสียภาษี: ${cust.taxId} | ` : ''}โทร: ${cust.phone||'—'}
    </div>
  </div>

  <div style="padding:16px 28px">
    <table style="width:100%;border-collapse:collapse;font-size:.79rem">
      <thead>
        <tr style="background:#2563eb;color:#fff">
          <th style="padding:8px 10px;text-align:center;border-radius:4px 0 0 0;width:8%">ลำดับที่</th>
          <th style="padding:8px 10px;text-align:left">เลขที่ใบกำกับภาษี</th>
          <th style="padding:8px 10px;text-align:center;width:14%">ลงวันที่</th>
          <th style="padding:8px 10px;text-align:left;width:22%">เลขที่ใบสั่งซื้อ</th>
          <th style="padding:8px 10px;text-align:right;width:16%;border-radius:0 4px 0 0">จำนวนเงิน (฿)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="4" style="padding:7px 10px;text-align:right;color:#555;border-top:1px solid #e8ecf2">
            รวมภาษีมูลค่าเพิ่ม (รวมอยู่ในยอดแต่ละใบแล้ว)</td>
          <td style="padding:7px 10px;text-align:right;color:#888;border-top:1px solid #e8ecf2">${fmtB(sumVat)}</td></tr>
        <tr><td colspan="4" style="padding:5px 10px;text-align:right;color:#555">รวมเงินทั้งสิ้น</td>
          <td style="padding:5px 10px;text-align:right;font-weight:700">${fmtB(sumTotal)}</td></tr>
        ${wht ? `
        <tr><td colspan="4" style="padding:5px 10px;text-align:right;color:#dc2626">หัก ณ ที่จ่าย 3%</td>
          <td style="padding:5px 10px;text-align:right;color:#dc2626">${fmtB(whtAmount)}</td></tr>` : ''}
        <tr style="background:#1d4ed8;color:#fff">
          <td colspan="4" style="padding:9px 10px;text-align:right;font-weight:700;font-size:.9rem;border-radius:0 0 0 4px">
            จำนวนเงินรับสุทธิ / NET AMOUNT</td>
          <td style="padding:9px 10px;text-align:right;font-weight:800;font-size:.9rem;border-radius:0 0 4px 0">
            ฿ ${fmtB(netAmount)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div style="padding:0 28px 14px;font-size:.78rem;color:#444">
    ได้รับบิลไว้ตรวจสอบตามรายการนี้ถูกต้องแล้ว จำนวน ${items.length} ฉบับ
  </div>

  <div style="display:flex;gap:12px;padding:10px 28px 28px;flex-wrap:wrap">
    <div style="flex:1;text-align:center;min-width:160px">
      <div style="margin-top:35px;border-top:1px solid #bbb;padding-top:5px;font-size:.7rem;color:#555">ผู้รับวางบิล / Received by</div>
      <div style="font-size:.65rem;color:#aaa;margin-top:10px;display:flex;align-items:center;justify-content:center;gap:4px">(<span style="display:inline-block;min-width:150px;border-bottom:1px solid #999;height:1px"></span>)</div>
      <div style="font-size:.65rem;color:#aaa;margin-top:10px">วันที่ ......../......../........</div>
    </div>
    <div style="flex:1;text-align:center;min-width:160px">
      <div style="margin-top:35px;border-top:1px solid #bbb;padding-top:5px;font-size:.7rem;color:#555">
        ผู้มีอำนาจลงนาม / Authorized signature<br>ในนาม ${co.name||''}</div>
      <div style="font-size:.65rem;color:#aaa;margin-top:10px;display:flex;align-items:center;justify-content:center;gap:4px">(<span style="display:inline-block;min-width:150px;border-bottom:1px solid #999;height:1px"></span>)</div>
      <div style="font-size:.65rem;color:#aaa;margin-top:10px">วันที่ ......../......../........</div>
    </div>
  </div>
</div>`;
}

// ── สร้างใบวางบิล จากใบกำกับที่ติ๊กเลือก -> แสดง preview ในกรอบเอกสาร ──
function _billGenerate() {
  const wrap = $('billInvoiceListWrap');
  const custCode = $('billCustomer')?.value || '';
  if (!custCode || !wrap || !wrap._billList) {
    Swal.fire({icon:'warning', title:'กรุณาเลือกลูกค้าและค้นหาใบกำกับก่อน',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#2563eb'});
    return;
  }
  const checked = Array.from(document.querySelectorAll('#billInvoiceListWrap .bill-chk:checked'))
    .map(c => wrap._billList[parseInt(c.dataset.idx,10)]).filter(Boolean);
  if (!checked.length) {
    Swal.fire({icon:'warning', title:'กรุณาเลือกใบกำกับอย่างน้อย 1 ใบ',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#2563eb'});
    return;
  }
  const cust = _custCache.find(c => c.code === custCode) || {};
  const billNo  = $('billNo')?.value || '';
  const payTerm = $('billPayTerm')?.value || '';
  const wht     = !!$('billWht')?.checked;
  const billDateVal = $('billDate')?.value || '';
  const billDateStr = billDateVal
    ? new Date(billDateVal + 'T00:00:00').toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'})
    : new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});

  // เรียงตามวันที่ใบกำกับ (เก่า -> ใหม่)
  const items = checked.slice().sort((a,b) => _invIssuedDateToIso(a.date).localeCompare(_invIssuedDateToIso(b.date)));

  const html = _billBuildDocHtml({ billNo, billDateStr, payTerm, cust, items, wht });

  // เตรียมข้อมูลสำหรับบันทึก (ยืนยันวางบิล)
  const sumTotal    = items.reduce((s,i) => s + (parseFloat(i.total)||0), 0);
  const sumSubtotal = items.reduce((s,i) => {
    const t = parseFloat(i.total)||0;
    const sub = (i.subtotal !== undefined && i.subtotal !== '') ? parseFloat(i.subtotal)||0 : t/1.07;
    return s + sub;
  }, 0);
  const whtAmount = wht ? sumSubtotal * 0.03 : 0;
  const netAmount = sumTotal - whtAmount;
  _billPreviewData = {
    billNo, billDate: $('billDate')?.value ? _billDateToThaiBE($('billDate').value) : '',
    customerCode: custCode, invoiceNos: items.map(i => i.invoiceNo),
    sumTotal, whtAmount, netAmount, payTerm
  };

  _invPreviewMode = true;

  let docBill = $('docBill');
  if (!docBill) {
    docBill = document.createElement('div');
    docBill.id = 'docBill';
    $('docQuo').parentNode.appendChild(docBill);
  }
  ['docQuo','docCost','docInv','docInvRep'].forEach(id => { if ($(id)) $(id).classList.add('dp-hidden'); });
  docBill.classList.remove('dp-hidden');
  docBill.innerHTML = html;

  if ($('dtabQuo'))  $('dtabQuo').style.display  = 'none';
  if ($('dtabCost')) $('dtabCost').style.display = 'none';
  const swapBtn = document.querySelector('.doc-bottombar .doc-tab-btn[onclick*="_docActiveTab"]');
  if (swapBtn) swapBtn.style.display = 'none';
  if ($('invConfirmBtn')) $('invConfirmBtn').style.display = 'none';

  // ปุ่ม "ยืนยันวางบิล"
  let billConfirmBtn = $('billConfirmBtn');
  if (!billConfirmBtn) {
    billConfirmBtn = document.createElement('button');
    billConfirmBtn.id = 'billConfirmBtn';
    billConfirmBtn.className = 'doc-tab-btn no-print';
    billConfirmBtn.style = 'padding:8px 18px;border-radius:8px;border:none;background:#2563eb;' +
      'color:#fff;font-size:.82rem;font-weight:700;cursor:pointer;font-family:Sarabun,sans-serif;margin-right:8px';
    billConfirmBtn.onclick = () => guardClick(billConfirmBtn, _billConfirmSave, 'กำลังบันทึก...');
    document.querySelector('.doc-bottombar > div').prepend(billConfirmBtn);
  }
  billConfirmBtn.textContent = '✅ ยืนยันวางบิล ' + billNo;
  billConfirmBtn.style.display = '';

  $('docExportOverlay').classList.add('open');
}

let _billPreviewData = null;

// ── แปลง yyyy-MM-dd (input date) -> dd/MM/yyyy พ.ศ. ──
function _billDateToThaiBE(isoDate) {
  const p = String(isoDate||'').split('-');
  if (p.length !== 3) return '';
  const dd = p[2], mm = p[1], yyyy = String(parseInt(p[0],10) + 543);
  return `${dd}/${mm}/${yyyy}`;
}

// ── ยืนยันวางบิล: บันทึก BillingNote + มาร์คใบกำกับว่าวางบิลแล้ว ──
async function _billConfirmSave() {
  if (!_billPreviewData) return;
  if (!_billPreviewData.billNo) {
    Swal.fire({icon:'warning', title:'กรุณากรอกเลขที่ใบวางบิล', background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#2563eb'});
    return;
  }
  const confirmed = await Swal.fire({
    icon:'question', title:`ยืนยันวางบิลเลขที่ ${_billPreviewData.billNo}?`,
    html:`<div style="font-size:.83rem;color:#8b8aaa">รวม ${_billPreviewData.invoiceNos.length} ใบกำกับ — ยอดรับสุทธิ ${fmtB(_billPreviewData.netAmount)} ฿<br>
      หลังยืนยัน ใบกำกับเหล่านี้จะถูกบันทึกว่าวางบิลแล้ว</div>`,
    background:'#0d1b2a', color:'#cce4ff',
    confirmButtonText:'✅ ยืนยัน', confirmButtonColor:'#2563eb',
    showCancelButton:true, cancelButtonText:'ยกเลิก', cancelButtonColor:'#374151',
  }).then(r => r.isConfirmed);
  if (!confirmed) return;

  Swal.fire({
    title: 'กำลังบันทึกใบวางบิล...', html: 'กรุณารอสักครู่',
    background:'#0d1b2a', color:'#cce4ff',
    allowOutsideClick:false, allowEscapeKey:false, showConfirmButton:false,
    didOpen: () => Swal.showLoading(),
  });
  try {
    const res = await fetch(SCRIPT_URL, {
      method:'POST', mode:'cors',
      headers:{'Content-Type':'text/plain'},
      body: JSON.stringify(Object.assign({ action:'saveBillingNote', issuedBy: 'PTS' }, _billPreviewData))
    });
    const out = await res.json();
    if (!out || out.status !== 'ok') throw new Error((out && out.message) || 'save failed');
    _billPreviewData = null;
    closeDocExport();
    if ($('billNo')) $('billNo').value = '';
    await fetchIssuedInvoices();
    _billLoadInvoices();
    Swal.fire({icon:'success',title:`บันทึกใบวางบิล ${out.billNo} สำเร็จ ✅`,background:'#0d1b2a',color:'#cce4ff',
      timer:1800,showConfirmButton:false,toast:true,position:'top-end'});
  } catch (e) {
    Swal.fire({icon:'error',title:'บันทึกใบวางบิลไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
  }
}

// ══════════════════════════════════════════════════════
// ══ ประวัติใบวางบิล — ดู / พิมพ์ซ้ำ ══════════════════════
// ══════════════════════════════════════════════════════
let _billHistCache = [];

function _billHistClearFilter() {
  if ($('billHistSearch')) $('billHistSearch').value = '';
  if ($('billHistFrom'))   $('billHistFrom').value   = '';
  if ($('billHistTo'))     $('billHistTo').value     = '';
  renderBillingHistory();
}

async function fetchBillingNotes() {
  if (!SCRIPT_URL) { renderBillingHistory(); return; }
  const wrap = $('billHistListWrap');
  if (wrap) wrap.innerHTML = `<div style="text-align:center;padding:16px;color:var(--t3);font-size:.82rem"><span class="spin-ico">↻</span> กำลังโหลด…</div>`;
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getBillingNotes', {mode:'cors'});
    const data = await res.json();
    if (data.status === 'ok') _billHistCache = (data.bills || []).slice().reverse(); // ล่าสุดอยู่บน
    else throw new Error(data.message || 'unknown');
  } catch (e) {
    if (wrap) { wrap.innerHTML = `<div style="text-align:center;padding:16px;color:#f87171;font-size:.82rem">โหลดข้อมูลไม่สำเร็จ: ${e.message}</div>`; return; }
  }
  renderBillingHistory();
}

function renderBillingHistory() {
  const wrap = $('billHistListWrap');
  if (!wrap) return;
  const kw   = ($('billHistSearch')?.value || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
  const from = $('billHistFrom')?.value || '';
  const to   = $('billHistTo')?.value   || '';

  let list = _billHistCache.slice();
  if (from || to) {
    list = list.filter(b => {
      const iso = _invIssuedDateToIso(b.date);
      if (!iso) return false;
      if (from && iso < from) return false;
      if (to   && iso > to)   return false;
      return true;
    });
  }
  if (kw.length) {
    list = list.filter(b => {
      const cust = _custCache.find(c => c.code === b.customerCode);
      const hay = [b.billNo, b.customerCode, cust?.name, cust?.branch, b.invoiceNos].join(' ').toLowerCase();
      return kw.every(k => hay.includes(k));
    });
  }

  if (!list.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:16px;color:var(--t3);font-size:.82rem">ไม่พบประวัติใบวางบิล</div>`;
    return;
  }

  const rows = list.map((b, idx) => {
    const cust = _custCache.find(c => c.code === b.customerCode) || {};
    const realIdx = _billHistCache.indexOf(b);
    return `<tr style="border-bottom:1px solid var(--bc-card)">
      <td style="padding:6px 8px">${b.billNo}</td>
      <td style="padding:6px 8px">${b.date}</td>
      <td style="padding:6px 8px">${cust.name || b.customerCode}${cust.branch?' ('+cust.branch+')':''}</td>
      <td style="padding:6px 8px;text-align:center">${(b.invoiceNos||'').split(',').filter(Boolean).length}</td>
      <td style="padding:6px 8px;text-align:right">${fmtB(b.sumTotal)}</td>
      <td style="padding:6px 8px;text-align:right;color:${b.whtAmount?'#f87171':'inherit'}">${b.whtAmount ? fmtB(b.whtAmount) : '-'}</td>
      <td style="padding:6px 8px;text-align:right;font-weight:700">${fmtB(b.netAmount)}</td>
      <td style="padding:6px 8px;text-align:center">
        <button onclick="_billReprint(${realIdx})" style="padding:5px 12px;border-radius:6px;border:none;
          background:#2563eb;color:#fff;font-size:.74rem;cursor:pointer;font-family:Sarabun,sans-serif">🖨️ พิมพ์ซ้ำ</button>
        <button onclick="guardClick(this, () => _billCancel(${realIdx}), 'กำลังยกเลิก...')" style="padding:5px 12px;border-radius:6px;border:none;margin-left:4px;
          background:#dc2626;color:#fff;font-size:.74rem;cursor:pointer;font-family:Sarabun,sans-serif">🗑️ ยกเลิก</button>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:.8rem">
      <thead>
        <tr style="border-bottom:1px solid var(--bc-card)">
          <th style="padding:6px 8px;text-align:left">เลขที่ใบวางบิล</th>
          <th style="padding:6px 8px;text-align:left">วันที่</th>
          <th style="padding:6px 8px;text-align:left">ลูกค้า</th>
          <th style="padding:6px 8px;text-align:center">จำนวนใบกำกับ</th>
          <th style="padding:6px 8px;text-align:right">ยอดรวม</th>
          <th style="padding:6px 8px;text-align:right">หัก ณ ที่จ่าย</th>
          <th style="padding:6px 8px;text-align:right">รับสุทธิ</th>
          <th style="padding:6px 8px;text-align:center">พิมพ์ซ้ำ</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── ยกเลิกใบวางบิล — ลบจากประวัติ + เคลียร์สถานะ "วางบิลแล้ว" ของใบกำกับที่เกี่ยวข้อง ──
async function _billCancel(idx) {
  const b = _billHistCache[idx];
  if (!b) return;
  const conf = await Swal.fire({
    icon:'warning', title:`ยกเลิกใบวางบิล ${b.billNo}?`,
    text:'ใบกำกับที่อยู่ในใบวางบิลนี้จะกลับมาเลือกวางบิลใหม่ได้',
    showCancelButton:true, confirmButtonText:'ยกเลิกใบวางบิล', cancelButtonText:'ปิด',
    confirmButtonColor:'#dc2626', background:'#0d1b2a', color:'#cce4ff'
  });
  if (!conf.isConfirmed) return;
  try {
    const res  = await fetch(SCRIPT_URL, {
      method:'POST', mode:'cors',
      body: JSON.stringify({ action:'deleteBillingNote', billNo: b.billNo })
    });
    const out = await res.json();
    if (!out || out.status !== 'ok') throw new Error((out && out.message) || 'delete failed');
    await fetchIssuedInvoices();
    await fetchBillingNotes();
    _billLoadInvoices();
    Swal.fire({icon:'success',title:`ยกเลิกใบวางบิล ${b.billNo} แล้ว`,background:'#0d1b2a',color:'#cce4ff',
      timer:1800,showConfirmButton:false,toast:true,position:'top-end'});
  } catch (e) {
    Swal.fire({icon:'error',title:'ยกเลิกไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
  }
}

// ── พิมพ์ใบวางบิลซ้ำจากประวัติ — ดึงรายละเอียดใบกำกับจาก _invIssuedCache ──
function _billReprint(idx) {
  const b = _billHistCache[idx];
  if (!b) return;
  const cust = _custCache.find(c => c.code === b.customerCode) || {};
  const invoiceNos = (b.invoiceNos || '').split(',').map(s => s.trim()).filter(Boolean);
  const items = invoiceNos.map(no => _invIssuedCache.find(inv => inv.invoiceNo === no)).filter(Boolean);

  const billDateStr = _invThaiDate(b.date);
  const html = _billBuildDocHtml({
    billNo: b.billNo, billDateStr, payTerm: b.payTerm, cust, items, wht: !!b.whtAmount
  });

  _billPreviewData = null;
  _invPreviewMode = true;

  let docBill = $('docBill');
  if (!docBill) {
    docBill = document.createElement('div');
    docBill.id = 'docBill';
    $('docQuo').parentNode.appendChild(docBill);
  }
  ['docQuo','docCost','docInv','docInvRep'].forEach(id => { if ($(id)) $(id).classList.add('dp-hidden'); });
  docBill.classList.remove('dp-hidden');
  docBill.innerHTML = html;

  if ($('dtabQuo'))  $('dtabQuo').style.display  = 'none';
  if ($('dtabCost')) $('dtabCost').style.display = 'none';
  const swapBtn = document.querySelector('.doc-bottombar .doc-tab-btn[onclick*="_docActiveTab"]');
  if (swapBtn) swapBtn.style.display = 'none';
  if ($('invConfirmBtn'))  $('invConfirmBtn').style.display  = 'none';
  if ($('billConfirmBtn')) $('billConfirmBtn').style.display = 'none';

  $('docExportOverlay').classList.add('open');
}
