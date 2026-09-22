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
  _custCache.push({ code:'', name:'', branch:'', taxId:'', address:'', phone:'', contact:'', wht: false, credit: '' });
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
    wht:     !!(document.getElementById('cust_wht_'+i)?.checked),
    credit:  g('cust_credit_'+i),
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
        <td style="padding:6px 8px" colspan="8">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px">
            ${_custNameInput('cust_name_'+i, c.name)}
            ${_custInput('cust_branch_'+i, c.branch, 'สาขา')}
            ${_custInput('cust_taxid_'+i, c.taxId, 'เลขผู้เสียภาษี 13 หลัก')}
            ${_custInput('cust_phone_'+i, c.phone, 'เบอร์โทร')}
            ${_custContactInput('cust_contact_'+i, c.contact)}
            <input id="cust_credit_${i}" value="${(c.credit||'').replace(/"/g,'&quot;')}" placeholder="เงื่อนไขการชำระเงิน (เช่น เครดิต 30 วัน)"
              list="cust_credit_list"
              style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid rgba(99,102,241,.35);
              background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.8rem">
            <datalist id="cust_credit_list">
              <option value="เงินสด"><option value="เครดิต 15 วัน"><option value="เครดิต 30 วัน">
              <option value="เครดิต 45 วัน"><option value="เครดิต 60 วัน">
            </datalist>
          </div>
          <div style="margin-top:6px">${_custInput('cust_addr_'+i, c.address, 'ที่อยู่')}</div>
          <div style="margin-top:8px;display:flex;align-items:center;gap:8px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.8rem;color:var(--t2)">
              <input type="checkbox" id="cust_wht_${i}" ${c.wht ? 'checked' : ''}
                style="width:16px;height:16px;cursor:pointer;accent-color:#818cf8">
              หัก ณ ที่จ่าย 3% (ค่าเริ่มต้น)
            </label>
            <div style="flex:1;text-align:right">
              <button onclick="guardClick(this, () => custSaveRow(${i}))"
                style="padding:5px 14px;border-radius:6px;border:none;background:#34d399;color:#0a2e1a;
                font-family:Sarabun,sans-serif;font-size:.78rem;font-weight:700;cursor:pointer;margin-right:6px">💾 บันทึก</button>
              <button onclick="custCancelEdit(${i})"
                style="padding:5px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:transparent;
                color:var(--t3);font-family:Sarabun,sans-serif;font-size:.78rem;cursor:pointer">✕ ยกเลิก</button>
            </div>
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
      <td style="padding:7px 10px;font-size:.75rem;color:var(--t2)">${c.credit||'—'}</td>
      <td style="padding:7px 10px;text-align:center;font-size:.8rem">
        ${c.wht ? '<span style="color:#34d399;font-size:.75rem">✓ หัก 3%</span>' : '<span style="color:var(--t3);font-size:.75rem">—</span>'}
      </td>
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
          <th style="padding:6px 10px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">เครดิต</th>
          <th style="padding:6px 10px;text-align:center;color:var(--t2);font-weight:600;font-size:.75rem">หัก ณ ที่จ่าย</th>
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
let _invPoTotalMap = {};

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
  const invoicedPOs = _invInvoicedPOSet();
  return (_orderCache || []).filter(r => {
    const noPO = String(r[ORDER_COLS.noPO]||'').trim();
    return matchKeys.includes(String(r[ORDER_COLS.customer]||'').trim()) &&
      !String(r[ORDER_COLS.invoiceNo]||'').trim() &&
      !invoicedPOs.has(noPO);  // ชั้น 2: cross-check กับ Invoices sheet
  }).length;
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

// ── แถบสถานะ Order ในแท็บออกใบกำกับ — แจ้งจำนวนที่โหลด + ปุ่มโหลดทั้งหมด ──
let _invOrderLoading = false;
let _invOrderLoadError = false;
function renderInvOrderStatus() {
  const el = $('invOrderStatusBar');
  if (!el) return;
  const loaded  = (_orderCache || []).length;
  const total   = (typeof _ordTotal === 'number' && _ordTotal) ? _ordTotal : loaded;
  const limited = (typeof _orderCacheLimited !== 'undefined') ? _orderCacheLimited : true;
  if (_invOrderLoading) {
    el.innerHTML = `<div style="padding:8px 12px;border-radius:8px;background:var(--c1-05);border:1px solid var(--bc-input);font-size:.78rem;color:var(--t2)">
      <span class="spin-ico">↻</span> กำลังโหลด Order ทั้งหมด… (อาจใช้เวลา 20-40 วิ)</div>`;
    return;
  }
  if (_invOrderLoadError && limited) {
    el.innerHTML = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;border-radius:8px;background:#fef2f2;border:1px solid #fca5a5;font-size:.78rem;color:#991b1b">
      ⚠️ โหลด Order ทั้งหมดไม่สำเร็จ — เห็นแค่ ${loaded.toLocaleString()} จาก ${total.toLocaleString()} รายการ
      <button type="button" onclick="invLoadAllOrders()" style="padding:3px 12px;border-radius:6px;border:none;cursor:pointer;font-family:'Sarabun',sans-serif;font-size:.75rem;font-weight:600;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff">🔄 ลองใหม่</button></div>`;
    return;
  }
  if (!limited && loaded >= total) {
    el.innerHTML = `<div style="padding:8px 12px;border-radius:8px;background:#f0fdf4;border:1px solid #86efac;font-size:.78rem;color:#065f46">
      📦 Order: ${total.toLocaleString()} รายการ · ครบทั้งหมด</div>`;
  } else {
    el.innerHTML = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;border-radius:8px;background:#fffbeb;border:1px solid #fcd34d;font-size:.78rem;color:#92400e">
      ⚠️ โหลดแล้ว ${loaded.toLocaleString()} จาก ${total.toLocaleString()} รายการ — อาจหา PO ไม่เจอ
      <button type="button" onclick="invLoadAllOrders()" style="padding:3px 12px;border-radius:6px;border:none;cursor:pointer;font-family:'Sarabun',sans-serif;font-size:.75rem;font-weight:600;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff">📂 โหลดทั้งหมด</button></div>`;
  }
}

// กดปุ่ม "โหลดทั้งหมด" ในแท็บออกใบกำกับ — โหลด + รีเฟรชรายการ PO ให้อัตโนมัติ
async function invLoadAllOrders() {
  if (_invOrderLoading) return;
  _invOrderLoading = true;
  _invOrderLoadError = false;
  renderInvOrderStatus();
  try { if (typeof fetchOrders === 'function') await fetchOrders(true); }
  catch(e) { _invOrderLoadError = true; }
  _invOrderLoading = false;
  if (typeof _orderCacheLimited !== 'undefined' && _orderCacheLimited !== false) _invOrderLoadError = true;
  _invRefreshCustomerSelect();
  renderInvOrderList();
  renderInvOrderStatus();
}

let _invRepInited = false;
async function invInit() {
  // โหลด Order ทั้งหมด — ถ้า cache ยังครบ (limited=false) ไม่ต้องโหลดซ้ำ
  if (typeof fetchOrders === 'function' && (typeof _orderCacheLimited === 'undefined' || _orderCacheLimited !== false)) {
    const wrap = $('invOrderListWrap');
    if (wrap) wrap.innerHTML = '<div style="text-align:center;padding:20px;color:var(--t3);font-size:.82rem"><span class="spin-ico">↻</span> โหลด Order ทั้งหมด…</div>';
    _invOrderLoading = true;
    _invOrderLoadError = false;
    renderInvOrderStatus();
    try { await fetchOrders(true); } catch(e) { _invOrderLoadError = true; }
    _invOrderLoading = false;
    if (typeof _orderCacheLimited !== 'undefined' && _orderCacheLimited !== false) _invOrderLoadError = true;
  }
  renderInvOrderStatus();
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
  const invoicedPOs = _invInvoicedPOSet(); // ชั้น 2: cross-check กับ Invoices sheet
  let rows = _orderCache.filter(r => {
    const noPO = String(r[ORDER_COLS.noPO]||'').trim();
    return matchKeys.includes(String(r[ORDER_COLS.customer]||'').trim()) &&
      !String(r[ORDER_COLS.invoiceNo]||'').trim() &&
      !invoicedPOs.has(noPO);
  });
  // สร้าง map noPO → total จากแถวที่ผ่าน filter ขั้นแรก (ก่อน text filter)
  _invPoTotalMap = {};
  rows.forEach(r => {
    const k = String(r[ORDER_COLS.noPO]||'').trim();
    if (k) _invPoTotalMap[k] = _invOrderTotal(r);
  });
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
  // ── ตรวจหา PO ที่ออกใบกำกับแล้วแต่ยัง stamp ไม่ครบใน Order sheet (col AC/AD) ──
  const unstampedWarning = (function() {
    if (!_invIssuedCache || !_invIssuedCache.length) return '';
    const issues = [];
    (_invIssuedCache).forEach(inv => {
      if (inv.status === 'ยกเลิก') return; // ใบยกเลิก → ไม่แสดง stamp warning
      const poArr = String(inv.poList || '').split(',').map(x => x.trim()).filter(Boolean);
      poArr.forEach(po => {
        const orderRow = (_orderCache || []).find(r => String(r[ORDER_COLS.noPO]||'').trim() === po);
        if (orderRow && !String(orderRow[ORDER_COLS.invoiceNo]||'').trim()) {
          issues.push({ po, invoiceNo: inv.invoiceNo, invDate: inv.date || '' });
        }
      });
    });
    if (!issues.length) return '';
    const lines = issues.map(x => {
      const safePo  = encodeURIComponent(x.po);
      const safeInv = encodeURIComponent(x.invoiceNo);
      const safeDt  = encodeURIComponent(x.invDate || '');
      return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0">`+
        `<span style="font-weight:800;color:#dc2626">${x.po}</span>`+
        `<span style="color:#991b1b;font-size:.75rem">(${x.invoiceNo})</span>`+
        `<button onclick="invStampOrderPO(decodeURIComponent('${safePo}'),decodeURIComponent('${safeInv}'),decodeURIComponent('${safeDt}'))" `+
          `style="font-size:.72rem;padding:2px 10px;border-radius:5px;border:none;`+
          `background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;cursor:pointer;font-weight:600">`+
          `📌 Stamp</button>`+
        `</div>`;
    }).join('');
    return `<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:8px;padding:10px 14px;margin-bottom:10px">
      <div style="font-size:.8rem;font-weight:700;color:#dc2626;margin-bottom:6px">⚠️ PO ต่อไปนี้ออกใบกำกับแล้ว แต่ยังไม่ได้ stamp ในชีต Order (col AC/AD):</div>
      <div style="font-size:.82rem;line-height:1.9">${lines}</div>
      <div style="font-size:.72rem;color:#b91c1c;margin-top:4px">กดปุ่ม Stamp เพื่ออัปเดต col AC/AD ทันที — หรือตรวจสอบในชีต Order</div>
    </div>`;
  })();

  wrap.innerHTML = unstampedWarning + rows.map(r => {
    const noPO  = String(r[ORDER_COLS.noPO] || '');
    const prod  = r[ORDER_COLS.productList] || '';
    const date  = r[ORDER_COLS.orderDate] || '';
    const qty   = String(r[ORDER_COLS.qty] || '').trim();
    const note  = String(r[ORDER_COLS.note] || '').trim();
    const total = _invOrderTotal(r);
    const checked = _invSelectedPOs.has(noPO) ? 'checked' : '';
    const noPO_esc = noPO.replace(/'/g,"\\'");
    return `<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;
      border:1px solid var(--bc-card);margin-bottom:6px;cursor:pointer;background:var(--bg-input2)">
      <input type="checkbox" ${checked} onchange="_invToggleRow('${noPO_esc}',this.checked)"
        style="width:18px;height:18px;flex-shrink:0">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-weight:700;color:var(--c1);font-size:.85rem">${noPO}</span>
          <button type="button" onclick="event.preventDefault();event.stopPropagation();_invGoToOrder('${noPO_esc}')"
            title="เปิดรายละเอียด PO นี้"
            style="background:none;border:1px solid var(--c1);border-radius:4px;cursor:pointer;padding:1px 6px;font-size:.68rem;color:var(--c1);line-height:1.4;font-family:Sarabun,sans-serif;flex-shrink:0">
            🔍 ดู PO
          </button>
        </div>
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

// ── Stamp PO ลง Order col AC/AD ผ่าน Code.gs ──────────────────────────────
async function invStampOrderPO(po, invoiceNo, invDate) {
  const cf = await Swal.fire({
    title: 'ยืนยัน Stamp PO?',
    html: `จะเขียน <b>${invoiceNo}</b> ลงใน Order<br>col AC/AD ของ <b>${po}</b><br><span style="font-size:.8rem;color:#6b7280">วันที่ใบกำกับ: ${invDate || '(ไม่มี)'}</span>`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: '📌 Stamp เลย',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#dc2626',
    reverseButtons: true
  });
  if (!cf.isConfirmed) return;

  if (!SCRIPT_URL) {
    Swal.fire('ข้อผิดพลาด', 'ยังไม่ได้ตั้งค่า Script URL — ไปที่แท็บ ตั้งค่า', 'error');
    return;
  }
  Swal.fire({ title: 'กำลัง Stamp...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'stampOrderPO', noPOs: [po], invoiceNo, invoiceDate: invDate })
    });
    const json = await res.json();
    if (json.status !== 'ok') throw new Error(json.message || 'ไม่สำเร็จ');

    // อัป local cache ให้ row นั้นมี invoiceNo แล้ว → warning หาย
    (_orderCache || []).forEach(r => {
      if (String(r[ORDER_COLS.noPO] || '').trim() === po) {
        r[ORDER_COLS.invoiceNo]   = invoiceNo;
        r[ORDER_COLS.invoiceDate] = invDate;
      }
    });

    await Swal.fire({ icon: 'success', title: 'Stamp สำเร็จ!',
      html: `<b>${po}</b> → ${invoiceNo}`, timer: 1800, showConfirmButton: false });
    renderInvOrderList();
  } catch (e) {
    Swal.fire('ข้อผิดพลาด', e.message, 'error');
  }
}

function _invToggleRow(noPO, checked) {
  if (checked) _invSelectedPOs.add(noPO);
  else _invSelectedPOs.delete(noPO);
  _invUpdateSummary();
}

function _invGoToOrder(noPO) {
  const r = (_orderCache || []).find(row => String(row[ORDER_COLS.noPO]||'').trim() === noPO);
  if (!r) return;

  const v  = s => String(r[s] != null ? r[s] : '').trim();
  const poFileUrl = v(ORDER_COLS.poFile);
  const jobImg1   = v(ORDER_COLS.jobImg1);
  const jobImg2   = v(ORDER_COLS.jobImg2);

  const imgBtn = (url, label) => url
    ? `<a href="${url}" target="_blank" rel="noopener"
        style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:6px;
          background:#1e3a5f;color:#60a5fa;font-size:.78rem;text-decoration:none;border:1px solid #2563eb">
        🖼️ ${label}
      </a>`
    : '';

  const field = (label, val) => val
    ? `<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.07)">
        <span style="color:#8b8aaa;font-size:.76rem;min-width:90px;flex-shrink:0">${label}</span>
        <span style="color:#e2e8f0;font-size:.80rem;word-break:break-word">${val}</span>
      </div>`
    : '';

  const imgsHtml = [imgBtn(poFileUrl,'รูป PO'), imgBtn(jobImg1,'รูปงาน 1'), imgBtn(jobImg2,'รูปงาน 2')]
    .filter(Boolean).join(' ');

  Swal.fire({
    title: `📋 ${noPO}`,
    html: `<div style="text-align:left;font-family:Sarabun,sans-serif">
      ${field('รายการ',       v(ORDER_COLS.productList))}
      ${field('รูปแบบงาน',    v(ORDER_COLS.workType))}
      ${field('วันที่สั่ง',    v(ORDER_COLS.orderDate))}
      ${field('วันที่ต้องการ', v(ORDER_COLS.wantDate))}
      ${field('จำนวน',        v(ORDER_COLS.qty))}
      ${field('วัสดุ',        v(ORDER_COLS.material))}
      ${field('ตะแกรงนอก',   v(ORDER_COLS.meshOut))}
      ${field('ตะแกรงใน',    v(ORDER_COLS.meshIn))}
      ${field('ฝาบน',        v(ORDER_COLS.matTop))}
      ${field('ฝาล่าง',      v(ORDER_COLS.matBot))}
      ${field('ราคาขาย',     v(ORDER_COLS.price) ? fmtB(parseFloat(v(ORDER_COLS.price)))+' ฿' : '')}
      ${field('Process',     v(ORDER_COLS.process))}
      ${field('หมายเหตุ',    v(ORDER_COLS.note))}
      ${field('Note',        v(ORDER_COLS.note2))}
      ${imgsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">${imgsHtml}</div>` : ''}
      <div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1)">
        <button id="_invEditBtn" style="width:100%;padding:9px;border-radius:8px;border:none;background:#6366f1;color:#fff;font-size:.84rem;font-weight:700;cursor:pointer;font-family:Sarabun,sans-serif">✏️ แก้ไข Order</button>
      </div>
    </div>`,
    background: '#0d1b2a',
    color: '#cce4ff',
    width: 'min(96vw,480px)',
    confirmButtonText: 'ปิด',
    confirmButtonColor: '#374151',
    didOpen: () => {
      const btn = document.getElementById('_invEditBtn');
      if (btn) btn.addEventListener('click', () => {
        Swal.close();
        setTimeout(() => { if (typeof openEditOrder === 'function') openEditOrder(noPO); }, 150);
      });
    },
  });
}

function _invUpdateSummary() {
  const sumEl = $('invSummaryWrap');
  if (!sumEl) return;
  let total = 0;
  _invSelectedPOs.forEach(noPO => {
    const key = noPO.trim();
    if (_invPoTotalMap && key in _invPoTotalMap) {
      total += _invPoTotalMap[key];
    } else {
      const r = (_orderCache || []).find(row => String(row[ORDER_COLS.noPO]||'').trim() === key);
      if (r) total += _invOrderTotal(r);
    }
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
// คืน Set ของ noPO ทั้งหมดที่ออกใบกำกับไปแล้ว (ข้าม status "ยกเลิก")
function _invInvoicedPOSet() {
  const s = new Set();
  (_invIssuedCache || []).forEach(inv => {
    if (inv.status === 'ยกเลิก') return; // ใบยกเลิก → คืน PO ให้ใช้ใหม่ได้
    String(inv.poList || '').split(',').map(x => x.trim()).filter(Boolean).forEach(po => s.add(po));
  });
  return s;
}

// คืนรายการ {po, invoiceNo} ของ PO ที่พบว่าซ้ำ (ข้าม status "ยกเลิก")
function _invFindDuplicatePOs(selectedPOs) {
  const dups = [];
  (_invIssuedCache || []).forEach(inv => {
    if (inv.status === 'ยกเลิก') return;
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

  // ── ตรวจสอบ PO ซ้ำกับใบกำกับที่ออกไปแล้ว (BLOCK — ห้ามผ่านเด็ดขาด) ──
  const dups = _invFindDuplicatePOs(_invSelectedPOs);
  if (dups.length) {
    const list = dups.map(d => `• PO <b>${d.po}</b> → ใบกำกับ <b>${d.invoiceNo}</b>`).join('<br>');
    await Swal.fire({
      icon: 'error',
      title: '🚫 ออกใบกำกับซ้ำไม่ได้',
      html: `<div style="text-align:left;font-size:.88rem;line-height:2">${list}</div>
             <div style="margin-top:10px;font-size:.8rem;color:#f87171">กรุณายกเลิกการเลือก PO ที่ซ้ำออกก่อน</div>`,
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#dc2626',
      background: '#0d1b2a', color: '#cce4ff'
    });
    return; // BLOCK — ไม่มีทางเลือก "ออกต่อ"
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

    // ── เสนอเลขที่ใบกำกับถัดไป + วันที่ออกใบ ──
    const todayIso = new Date().toISOString().slice(0,10);
    const numResult = await Swal.fire({
      icon: 'question',
      title: 'เลขที่ใบกำกับ',
      html: `
        <div style="text-align:left;margin-bottom:10px">
          <label style="font-size:.82rem;color:#8b8aaa;display:block;margin-bottom:4px">เลขที่ใบกำกับ — แก้ไขได้</label>
          <input id="swal_inv_no" class="swal2-input" value="${data.nextNo}" style="margin:0;width:100%">
        </div>
        <div style="text-align:left;margin-bottom:10px">
          <label style="font-size:.82rem;color:#8b8aaa;display:block;margin-bottom:4px">วันที่ออกใบ</label>
          <input id="swal_inv_date" type="date" class="swal2-input" value="${todayIso}" style="margin:0;width:100%;font-family:Sarabun,sans-serif">
        </div>
        <div style="text-align:left">
          <label style="font-size:.82rem;color:#8b8aaa;display:block;margin-bottom:4px">เงื่อนไขการชำระเงิน</label>
          <input id="swal_inv_credit" class="swal2-input" list="swal_inv_credit_list"
            value="${(cust.credit||'').replace(/"/g,'&quot;')}"
            placeholder="เช่น เครดิต 30 วัน / เงินสด"
            style="margin:0;width:100%;font-family:Sarabun,sans-serif">
          <datalist id="swal_inv_credit_list">
            <option value="เงินสด"><option value="เครดิต 15 วัน"><option value="เครดิต 30 วัน">
            <option value="เครดิต 45 วัน"><option value="เครดิต 60 วัน">
          </datalist>
        </div>`,
      showCancelButton: true,
      confirmButtonText: 'ใช้เลขนี้',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#2563eb',
      background: '#0d1b2a',
      color: '#cce4ff',
      preConfirm: () => {
        const no         = document.getElementById('swal_inv_no')?.value.trim();
        const date       = document.getElementById('swal_inv_date')?.value;
        const creditTerm = document.getElementById('swal_inv_credit')?.value.trim();
        if (!no) { Swal.showValidationMessage('กรุณากรอกเลขที่ใบกำกับ'); return false; }
        return { no, date, creditTerm };
      },
    });
    if (!numResult.isConfirmed) return;
    const invoiceNo      = numResult.value.no;
    const invoiceDateIso = numResult.value.date || todayIso;
    const creditTerm     = numResult.value.creditTerm || '';

    await _invShowPreview(invoiceNo, type, cust, invoiceDateIso, creditTerm);
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
function _invBuildDocHtml({ invoiceNo, isFull, cust, dateStr, itemRows, subtotal, vat, total, creditTerm }) {
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
        ${creditTerm ? `<tr><td style="color:#666;padding:2px 6px 2px 0">เงื่อนไขการชำระเงิน:</td>
            <td>${creditTerm}</td></tr>` : ''}
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
      <div style="margin-top:35px;border-top:1px solid #bbb;padding-top:5px;font-size:.7rem;color:#555">ผู้รับเงิน / Received by</div>      <div style="font-size:.65rem;color:#aaa;margin-top:10px">วันที่ ......../......../........</div>
    </div>
    <div style="flex:1;text-align:center;min-width:160px">
      <div style="margin-top:35px;border-top:1px solid #bbb;padding-top:5px;font-size:.7rem;color:#555">ผู้มีอำนาจลงนาม / Authorized signature</div>      <div style="font-size:.65rem;color:#aaa;margin-top:10px">วันที่ ......../......../........</div>
    </div>
  </div>
</div>`;
}

// ── ออกใบกำกับใหม่: แสดง preview พร้อมปุ่มยืนยันออกใบกำกับ ──
async function _invShowPreview(invoiceNo, type, cust, invoiceDateIso, creditTerm) {
  const isFull = type === 'full';
  const orderRows = _orderCache.filter(r => _invSelectedPOs.has(String(r[ORDER_COLS.noPO]||'')));
  const itemsArr = _invBuildItemsFromOrders(orderRows);
  const { rowsHtml: itemRows, total } = _invRenderItemRows(itemsArr, isFull);
  const subtotal = total / 1.07;
  const vat = total - subtotal;
  const dateObj = invoiceDateIso ? new Date(invoiceDateIso + 'T00:00:00') : new Date();
  const dateStr = _fmtDateBE(dateObj);

  const html = _invBuildDocHtml({ invoiceNo, isFull, cust, dateStr, itemRows, subtotal, vat, total, creditTerm });

  _invPreviewMode = true;
  _invPreviewData = { invoiceNo, date: dateStr, type, customerCode: cust.code, poList: [..._invSelectedPOs], subtotal, vat, total, items: itemsArr, creditTerm };

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
    itemsArr, subtotal, vat, total, creditTerm,
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
  if (y > 2400) y -= 543; // พ.ศ. → ค.ศ. ก่อนสร้าง Date
  const dt = new Date(y, parseInt(p[1],10) - 1, parseInt(p[0],10));
  if (isNaN(dt.getTime())) return d || '';
  return _fmtDateBE(dt);
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

  const creditTerm = inv.creditTerm || inv.credit || '';
  const html = _invBuildDocHtml({ invoiceNo: inv.invoiceNo, isFull, cust, dateStr, itemRows, subtotal, vat, total: grand, creditTerm });

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
    poText, itemsArr: items, subtotal, vat, total: grand, creditTerm,
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
  companyLogo:     {x:0,  y:5},
  companyLogoSize: {x:28, y:28},
  companyName:   {x:30,  y:7,  size:13, bold:true},
  companyNameLine: {x:0.6, y:2},
  companyNameEn: {x:30,  y:14, size:11, bold:true},
  companyAddr:   {x:30,  y:22, size:11, bold:false},
  companyAddrEn: {x:30,  y:28, size:11, bold:false},
  companyContact:{x:30,  y:34, size:11, bold:false},
  companyTax:    {x:30,  y:40, size:11, bold:false},
  custTaxId:   {x:80,  y:56, size:10, bold:false},
  custName:    {x:6,   y:65, size:10, bold:false},
  custAddr:    {x:6,   y:71, size:10, bold:false},
  invoiceNo:   {x:160, y:55, size:10, bold:false},
  date:        {x:160, y:64, size:10, bold:false},
  payTerm:     {x:160, y:73, size:10, bold:false},
  poNo:        {x:160, y:83, size:10, bold:false},
  itemNo:      {x:8,   y:110, size:10, bold:false},
  itemDesc:    {x:20,  y:80, size:10, bold:false},
  itemQty:     {x:105, y:80, size:10, bold:false},
  itemPrice:   {x:130, y:80, size:10, bold:false},
  itemTotal:   {x:170, y:80, size:10, bold:false},
  rowHeight:   {x:7,   y:0},
  itemDescLineGap: {x:6, y:0},
  amountWords: {x:20,  y:210, size:10, bold:false},
  subtotal:    {x:170, y:210, size:10, bold:false},
  vat:         {x:170, y:229, size:10, bold:false},
  total:       {x:170, y:236, size:10, bold:false},
};
const _INV_OVERLAY_FIELD_LABELS = {
  companyLogo:'ตำแหน่งโลโก้ (มุมซ้ายบน)', companyLogoSize:'ขนาดโลโก้ (กว้าง x สูง มม.)',
  companyName:'ชื่อบริษัทเรา (ไทย)',
  companyNameLine:'เส้นคั่นใต้ชื่อบริษัท (X=ความหนา มม., Y=ระยะห่างจากตัวอักษร มม.)',
  companyNameEn:'ชื่อบริษัทเรา (อังกฤษ)',
  companyAddr:'ที่อยู่บริษัทเรา (ไทย)', companyAddrEn:'ที่อยู่บริษัทเรา (อังกฤษ)',
  companyContact:'เบอร์โทร/อีเมล์บริษัทเรา',
  companyTax:'เลขประจำตัวผู้เสียภาษีอากรบริษัทเรา',
  custName:'ชื่อลูกค้า', custAddr:'ที่อยู่ลูกค้า', custTaxId:'เลขผู้เสียภาษีลูกค้า',
  invoiceNo:'เลขที่ใบกำกับ', date:'วันที่', payTerm:'เงื่อนไขการชำระเงิน (Term of Payment)', poNo:'เลขที่ PO/เอกสาร',
  itemNo:'ลำดับ (แถวแรก)', itemDesc:'รายละเอียดสินค้า (แถวแรก)', itemQty:'จำนวน+หน่วย (แถวแรก)',
  itemPrice:'ราคาต่อหน่วย (แถวแรก)', itemTotal:'จำนวนเงิน (แถวแรก)', rowHeight:'ความสูงต่อแถว (มม.)',
  itemDescLineGap:'ช่องไฟระหว่างบรรทัดรายละเอียดสินค้า (มม.)',
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

// ── โหลดฟอนต์ Sarabun (TTF) มาแปลงเป็น base64 สำหรับฝังใน PDF (cache ไว้ใน localStorage) ──
let _SARABUN_FONT_CACHE = null;
async function _invLoadSarabunFonts() {
  if (_SARABUN_FONT_CACHE) return _SARABUN_FONT_CACHE;
  try {
    const cached = JSON.parse(localStorage.getItem('_sarabunFontB64_v2') || 'null');
    if (cached && cached.regular && cached.bold && cached.regular.length > 10000 && cached.bold.length > 10000) {
      _SARABUN_FONT_CACHE = cached; return cached;
    }
  } catch (e) {}
  const bufToB64 = (buf) => {
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  };
  // โหลดฟอนต์: ลองไฟล์ในโปรเจกต์ (local) ก่อน ถ้าไม่มี/โหลดไม่ได้ ค่อย fallback ไปที่ GitHub
  const toB64 = async (localUrl, remoteUrl) => {
    try {
      const res = await fetch(localUrl);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 10000) return bufToB64(buf);
      }
    } catch (e) {}
    const res2 = await fetch(remoteUrl);
    if (!res2.ok) throw new Error('โหลดฟอนต์ไม่สำเร็จ: ' + remoteUrl);
    return bufToB64(await res2.arrayBuffer());
  };
  const [regular, bold] = await Promise.all([
    toB64('Sarabun-Regular.ttf', 'https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Regular.ttf'),
    toB64('Sarabun-Bold.ttf', 'https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Bold.ttf'),
  ]);
  if (regular.length < 10000 || bold.length < 10000) throw new Error('ไฟล์ฟอนต์ที่โหลดมาไม่สมบูรณ์');
  _SARABUN_FONT_CACHE = { regular, bold };
  try { localStorage.setItem('_sarabunFontB64_v2', JSON.stringify(_SARABUN_FONT_CACHE)); } catch (e) {}
  return _SARABUN_FONT_CACHE;
}

// ── โหลดรูปภาพ (โลโก้) มาแปลงเป็น dataURL สำหรับฝังใน PDF ──
function _invImgToDataURL(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    if (src.startsWith('data:')) return resolve(src);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ── ตัดข้อความให้พอดีกับความกว้าง (มม.) โดยเติม … ถ้ายาวเกิน ──
function _invPdfTruncate(doc, text, maxWidthMm, sizePt) {
  doc.setFontSize(sizePt);
  if (doc.getTextWidth(text) <= maxWidthMm) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxWidthMm) t = t.slice(0, -1);
  return t + '…';
}

// ── สร้างไฟล์ PDF สำหรับพิมพ์ทับฟอร์มกระดาษที่พิมพ์ไว้แล้ว (ตำแหน่งคงที่ ไม่ขยับตามจำนวนรายการ) ──
async function _invPrintOverlay(data) {
  const { invoiceNo, cust, dateStr, poText, itemsArr, subtotal, vat, total, isFull, creditTerm } = data;
  const pos = _invOverlayGetPos();
  const rowH = pos.rowHeight.x || 7;
  const PT2MM = 0.3528;

  Swal.fire({ title: 'กำลังสร้าง PDF...', background: '#0d1b2a', color: '#cce4ff', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('โหลดไลบรารี jsPDF ไม่สำเร็จ (เช็คอินเทอร์เน็ต แล้วลองรีโหลดหน้าเว็บ)');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const fonts = await _invLoadSarabunFonts();
    doc.addFileToVFS('Sarabun-Regular.ttf', fonts.regular);
    doc.addFileToVFS('Sarabun-Bold.ttf', fonts.bold);
    doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
    doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold');
    doc.setFont('Sarabun', 'normal');
    doc.setTextColor(0, 0, 0);

    const addField = (key, text, opts) => {
      const p = pos[key];
      if (!p || text === '' || text == null) return;
      const sz = p.size || 10;
      doc.setFont('Sarabun', p.bold ? 'bold' : 'normal');
      doc.setFontSize(sz);
      let t = String(text);
      if (opts && opts.maxWidth) t = _invPdfTruncate(doc, t, opts.maxWidth, sz);
      const lines = t.split('\n');
      const lineH = sz * PT2MM * 1.35;
      lines.forEach((line, i) => {
        doc.text(line, p.x, p.y + sz * PT2MM * 0.8 + i * lineH);
      });
    };

    const co = _companyInfoCache || {};
    const logoSrc = (typeof _getLogoSrc === 'function') ? _getLogoSrc() : (co.logoUrl || '');
    const logoData = await _invImgToDataURL(logoSrc);
    if (logoData) {
      const lp = pos.companyLogo, ls = pos.companyLogoSize;
      try { doc.addImage(logoData, lp.x, lp.y, ls.x, ls.y); } catch (e) {}
    }
    addField('companyName', co.name || '');
    // เส้นคั่นใต้ชื่อบริษัท (ไทย) — ให้ตรงกับเส้นคั่นในตัวอย่างหน้าจอ
    if (co.name) {
      const cnp = pos.companyName;
      const lnp = pos.companyNameLine || {x:0.6, y:0.8};
      const lineY = cnp.y + (cnp.size || 13) * PT2MM * 0.8 + (lnp.y != null ? lnp.y : 0.8);
      doc.setFont('Sarabun', cnp.bold ? 'bold' : 'normal');
      doc.setFontSize(cnp.size || 13);
      const nameWidth = doc.getTextWidth(String(co.name));
      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(lnp.x || 0.6);
      doc.line(cnp.x, lineY, cnp.x + nameWidth, lineY);
    }
    addField('companyNameEn', co.nameEn || '');
    addField('companyAddr', co.address || '');
    addField('companyAddrEn', co.addressEn || '');
    const coTaxLine = co.taxId ? ('เลขประจำตัวผู้เสียภาษีอากร : ' + co.taxId) : '';
    addField('companyTax', coTaxLine);
    const coContactLine = [co.phone ? ('โทร: ' + co.phone) : '', co.email ? ('อีเมล์: ' + co.email) : ''].filter(Boolean).join('  ');
    addField('companyContact', coContactLine);

    addField('custName', cust.name ? (cust.name + (cust.branch ? ' (' + cust.branch + ')' : '')) : '');
    // ตัดที่อยู่ตรง "จังหวัด" ให้ขึ้นบรรทัดใหม่ ป้องกันข้อความยาวเกิน
    const custAddrStr = (cust.address || '').replace(/\s*(จังหวัด)/g, '\n$1');
    addField('custAddr', custAddrStr);
    if (isFull && cust.taxId) addField('custTaxId', cust.taxId);
    addField('invoiceNo', invoiceNo || '');
    addField('date', dateStr || '');
    addField('payTerm', creditTerm || '');
    addField('poNo', poText || '');

    let _ovY = pos.itemNo.y;
    // เพดานความสูงของพื้นที่รายการสินค้า — ไม่ให้แถวสุดท้ายล้นลงไปทับ/เกินพื้นที่ "จำนวนเงินเป็นตัวอักษร"
    const _ovMaxY = pos.amountWords.y - 10;
    const descMaxWidth = Math.max(20, (pos.itemQty.x - pos.itemDesc.x - 2));
    (itemsArr || []).forEach((it, idx) => {
      const y = Math.min(_ovY, _ovMaxY);
      const qty = parseFloat(it.qty) || 0;
      const priceExVat = parseFloat(it.priceExVat) || 0;
      const lineTotal = (it.lineTotal != null && it.lineTotal !== '') ? (parseFloat(it.lineTotal) || 0) : (qty * priceExVat * 1.07);
      const unitPrice = isFull ? priceExVat : priceExVat * 1.07;
      const amount = isFull ? lineTotal / 1.07 : lineTotal;

      const descLines = [];
      if (it.workType) descLines.push(it.workType);
      if (it.od || it.id || it.h) descLines.push(`SIZE: OD${it.od||''}xID${it.id||''}xH${it.h||''} mm`);
      if (it.meshOut) descLines.push(`ตะแกรงนอก: ${matLabel(it.meshOut)}`);
      if (it.meshIn) descLines.push(`ตะแกรงใน: ${matLabel(it.meshIn)}`);
      if (it.note) descLines.push(it.note);
      const dsz = pos.itemDesc.size || 8.5;
      doc.setFont('Sarabun', pos.itemDesc.bold ? 'bold' : 'normal');
      doc.setFontSize(dsz);
      const descLineGap = pos.itemDescLineGap.x || 4;
      descLines.forEach((l, i) => {
        const t = _invPdfTruncate(doc, l, descMaxWidth, dsz);
        doc.text(t, pos.itemDesc.x, y + i * descLineGap + dsz * PT2MM * 0.8);
      });

      doc.setFont('Sarabun', pos.itemNo.bold ? 'bold' : 'normal');
      doc.setFontSize(pos.itemNo.size || 10);
      doc.text(String(idx + 1), pos.itemNo.x, y + (pos.itemNo.size || 10) * PT2MM * 0.8);

      doc.setFont('Sarabun', pos.itemQty.bold ? 'bold' : 'normal');
      doc.setFontSize(pos.itemQty.size || 10);
      const qtyText = qty ? fmtB(qty, qty % 1 ? 2 : 0) + ' ' + (it.unit || 'EA') : '';
      if (qtyText) doc.text(qtyText, pos.itemQty.x, y + (pos.itemQty.size || 10) * PT2MM * 0.8);

      doc.setFont('Sarabun', pos.itemPrice.bold ? 'bold' : 'normal');
      doc.setFontSize(pos.itemPrice.size || 10);
      doc.text(fmtB(unitPrice), pos.itemPrice.x, y + (pos.itemPrice.size || 10) * PT2MM * 0.8);

      doc.setFont('Sarabun', pos.itemTotal.bold ? 'bold' : 'normal');
      doc.setFontSize(pos.itemTotal.size || 10);
      doc.text(fmtB(amount), pos.itemTotal.x, y + (pos.itemTotal.size || 10) * PT2MM * 0.8);

      // เว้นระยะแถวถัดไปตามจำนวนบรรทัดรายละเอียด (กันทับกัน) อย่างน้อย rowH
      _ovY += Math.max(rowH, descLines.length * descLineGap + 3);
    });

    addField('amountWords', _thaiBahtText(total));
    addField('subtotal', fmtB(subtotal));
    if (isFull) addField('vat', fmtB(vat));
    addField('total', fmtB(total));

    const blobUrl = doc.output('bloburl');
    const w = window.open(blobUrl, '_blank');
    Swal.close();
    if (!w) {
      Swal.fire({ icon: 'error', title: 'เปิดหน้าต่างไม่ได้', text: 'กรุณาอนุญาต popup สำหรับเว็บไซต์นี้',
        background: '#0d1b2a', color: '#cce4ff', confirmButtonColor: '#1d65cc' });
    }
  } catch (e) {
    console.error(e);
    Swal.close();
    Swal.fire({ icon: 'error', title: 'สร้าง PDF ไม่สำเร็จ', text: String(e && e.message || e),
      background: '#0d1b2a', color: '#cce4ff', confirmButtonColor: '#1d65cc' });
  }
}

// ── ตั้งค่าตำแหน่งฟิลด์ (มม.) สำหรับพิมพ์บนฟอร์มสำเร็จ — เก็บใน localStorage ──
function _invOverlaySettings() {
  const pos = _invOverlayGetPos();
  const rows = Object.keys(_INV_OVERLAY_DEFAULT_POS).map(k => {
    const label = _INV_OVERLAY_FIELD_LABELS[k] || k;
    const hasTextStyle = (pos[k].size !== undefined);
    if (k === 'rowHeight' || k === 'itemDescLineGap') {
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
  // re-render PO picker + customer counts หลัง issued cache โหลดเสร็จ
  // เพื่อให้ cross-check กับ Invoices sheet มีผลทันที
  _invRefreshCustomerSelect();
  renderInvOrderList();
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
    const isCancelled = inv.status === 'ยกเลิก';
    const cust = _custCache.find(c => c.code === inv.customerCode) || {};
    const poList = (inv.items || []).map(it => it.poNo).filter(Boolean);
    const poArr  = poList.length ? poList : (inv.poList ? (Array.isArray(inv.poList) ? inv.poList : String(inv.poList).split(',').map(s=>s.trim()).filter(Boolean)) : []);
    const poText = poArr.length
      ? poArr.map(po => `<a href="javascript:void(0)" onclick="_invGoToOrderPO('${String(po).replace(/'/g,"\\'")}')"
          style="color:${isCancelled?'#64748b':'#818cf8'};text-decoration:${isCancelled?'line-through':'underline'};cursor:pointer">${po}</a>`).join(', ')
      : '-';
    const rowStyle = isCancelled ? 'border-bottom:1px solid var(--bc-card);opacity:.6;background:rgba(239,68,68,.04)' : 'border-bottom:1px solid var(--bc-card)';
    const cancelBadge = isCancelled ? `<span style="display:inline-block;padding:1px 7px;border-radius:10px;background:rgba(239,68,68,.15);color:#f87171;font-size:.68rem;font-weight:700;margin-left:4px">ยกเลิก</span>` : '';
    const safeNo = inv.invoiceNo.replace(/'/g,"\\'");
    const actionBtns = isCancelled
      ? `<button onclick="openEditInvoice('${safeNo}')"
          style="padding:3px 10px;border-radius:6px;border:1px solid rgba(148,163,184,.4);background:transparent;
          color:#94a3b8;font-family:Sarabun,sans-serif;font-size:.75rem;cursor:pointer;margin-right:6px">🔍 ดูรายละเอียด</button>
         <span style="font-size:.72rem;color:#64748b;font-style:italic">เก็บไว้เพื่อสอบทาน</span>`
      : `<button onclick="openEditInvoice('${safeNo}')"
          style="padding:3px 10px;border-radius:6px;border:1px solid rgba(99,102,241,.4);background:transparent;
          color:#818cf8;font-family:Sarabun,sans-serif;font-size:.75rem;cursor:pointer;margin-right:4px">✏️ แก้ไข</button>
        <button onclick="cancelIssuedInvoice('${safeNo}')"
          style="padding:3px 10px;border-radius:6px;border:1px solid rgba(251,146,60,.4);background:transparent;
          color:#fb923c;font-family:Sarabun,sans-serif;font-size:.75rem;cursor:pointer;margin-right:4px">🚫 ยกเลิก</button>
        <button onclick="deleteIssuedInvoice('${safeNo}')"
          style="padding:3px 10px;border-radius:6px;border:1px solid rgba(220,38,38,.4);background:transparent;
          color:#f87171;font-family:Sarabun,sans-serif;font-size:.75rem;cursor:pointer">🗑️ ลบ</button>`;
    return `<tr style="${rowStyle}">
      <td style="padding:6px 8px;font-weight:700;color:${isCancelled?'var(--t3)':'var(--c1)'};white-space:nowrap">
        <span style="${isCancelled?'text-decoration:line-through':''}">${inv.invoiceNo}</span>${cancelBadge}</td>
      <td style="padding:6px 8px;font-size:.78rem;color:var(--t2);white-space:nowrap">${_invThaiDate(inv.date)}</td>
      <td style="padding:6px 8px;font-size:.78rem;color:var(--t2)">${cust.name||inv.customerCode||''}${cust.branch?' ('+cust.branch+')':''}</td>
      <td style="padding:6px 8px;font-size:.78rem;color:var(--t3)">${poText}</td>
      <td style="padding:6px 8px;font-size:.78rem;color:var(--t3)">${inv.type}</td>
      <td style="padding:6px 8px;font-size:.78rem;color:${isCancelled?'#64748b':'#34d399'};text-align:right;white-space:nowrap">${isCancelled?'<s>':''}${fmtB(inv.total)} ฿${isCancelled?'</s>':''}</td>
      <td style="padding:6px 8px;text-align:center;white-space:nowrap">${actionBtns}</td>
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

// ── ยกเลิกใบกำกับ — คงเลขที่ไว้ เปลี่ยน status → "ยกเลิก" + คืน PO ให้ใช้ใหม่ได้ ──
async function cancelIssuedInvoice(invoiceNo) {
  const PROC_OPTIONS = ['กำลังผลิต','ส่งชุป','ส่งตัวอย่างเทส+รอสรุป','ส่งยังไม่ครบ','FG รอเรียก','Stock','เตรียมส่ง','(ไม่เปลี่ยนสถานะ)'];
  const { isConfirmed, value: revertProcess } = await Swal.fire({
    icon: 'warning',
    title: `ยกเลิกใบกำกับ ${invoiceNo}?`,
    html: `<div style="text-align:left;font-size:.85rem;color:#94a3b8;margin-bottom:10px">
             เลขที่ใบกำกับ <b style="color:#f1f5f9">${invoiceNo}</b> จะถูกคงไว้ในระบบ แต่เปลี่ยนสถานะเป็น <b style="color:#f87171">ยกเลิก</b><br>
             เลขที่ PO ที่ผูกไว้จะถูกปลดออก — สามารถนำกลับมาเปิดใบกำกับใหม่ได้
           </div>
           <div style="text-align:left;font-size:.82rem;margin-bottom:6px;color:#94a3b8">เปลี่ยน Process ของ Order ที่เกี่ยวข้องกลับเป็น:</div>
           <select id="swal_cancelProc" style="width:100%;padding:8px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#cce4ff;font-size:.85rem">
             ${PROC_OPTIONS.map(o => `<option value="${o}"${o==='เตรียมส่ง'?' selected':''}>${o}</option>`).join('')}
           </select>`,
    showCancelButton: true,
    confirmButtonText: '🚫 ยกเลิกใบกำกับ',
    cancelButtonText: 'ปิด',
    confirmButtonColor: '#f97316',
    background: '#0d1b2a', color: '#cce4ff',
    preConfirm: () => document.getElementById('swal_cancelProc').value
  });
  if (!isConfirmed) return;
  if (!SCRIPT_URL) return;
  const rv = revertProcess === '(ไม่เปลี่ยนสถานะ)' ? '' : revertProcess;
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST', mode: 'cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'cancelInvoiceRecord', invoiceNo, revertProcess: rv })
    });
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(data.message || 'unknown');
    // อัป Invoices cache
    const c = (_invIssuedCache || []).find(x => x.invoiceNo === invoiceNo);
    const cancelledPOs = c ? String(c.poList || '').split(',').map(s => s.trim()).filter(Boolean) : [];
    if (c) c.status = 'ยกเลิก';
    // อัป Order cache — เคลียร์ invoiceNo (col AC) ออกจาก row ที่ PO ตรงกัน
    // เพื่อให้ renderInvOrderList แสดง PO คืนทันที โดยไม่ต้อง re-fetch
    if (cancelledPOs.length && typeof _orderCache !== 'undefined' && _orderCache) {
      _orderCache.forEach(r => {
        const po = String(r[ORDER_COLS.noPO] || '').trim();
        if (cancelledPOs.includes(po)) {
          r[ORDER_COLS.invoiceNo] = '';   // col AC — เคลียร์เลขที่ใบกำกับ
          if (typeof ORDER_COLS.invoiceDate !== 'undefined') r[ORDER_COLS.invoiceDate] = ''; // col AD ถ้ามี
        }
      });
    }
    renderIssuedInvoiceList();
    renderInvOrderList();
    Swal.fire({ icon:'success', title:`ยกเลิกใบกำกับ ${invoiceNo} แล้ว ✅`,
      text:'PO ที่เกี่ยวข้องพร้อมสำหรับการออกใบกำกับใหม่',
      background:'#0d1b2a', color:'#cce4ff', timer:2000, showConfirmButton:false, toast:true, position:'top-end' });
  } catch(e) {
    Swal.fire({ icon:'error', title:'ยกเลิกไม่สำเร็จ', text:e.message, background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#dc2626' });
  }
}

// ── ลบใบกำกับที่ออกแล้ว (พร้อมยืนยัน + ถามสถานะ Process ที่จะ revert) ──
async function deleteIssuedInvoice(invoiceNo) {
  const PROC_OPTIONS = ['กำลังผลิต','ส่งชุป','ส่งตัวอย่างเทส+รอสรุป','ส่งยังไม่ครบ','FG รอเรียก','Stock','เตรียมส่ง','(ไม่เปลี่ยนสถานะ)'];
  const { isConfirmed, value: revertProcess } = await Swal.fire({
    icon: 'warning',
    title: `ลบใบกำกับ ${invoiceNo}?`,
    html: `<div style="text-align:left;font-size:.85rem;margin-bottom:10px">เปลี่ยน Process ของ Order ที่เกี่ยวข้องกลับเป็น:</div>
           <select id="swal_revertProc" style="width:100%;padding:8px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#cce4ff;font-size:.85rem">
             ${PROC_OPTIONS.map(o => `<option value="${o}"${o==='กำลังผลิต'?' selected':''}>${o}</option>`).join('')}
           </select>`,
    showCancelButton: true,
    confirmButtonText: 'ลบใบกำกับ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#dc2626',
    background: '#0d1b2a', color: '#cce4ff',
    preConfirm: () => document.getElementById('swal_revertProc').value
  });
  if (!isConfirmed) return;

  if (!SCRIPT_URL) return;
  const rv = revertProcess === '(ไม่เปลี่ยนสถานะ)' ? '' : revertProcess;
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST', mode: 'cors',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'deleteInvoiceRecord', invoiceNo, revertProcess: rv })
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
// แปลง stored date (dd/MM/YYYY ไม่ว่า พ.ศ. หรือ ค.ศ.) → yyyy-MM-dd (CE) สำหรับ <input type="date">
function _invDateToInput(d) {
  const p = String(d||'').split('/');
  if (p.length !== 3) return '';
  let y = parseInt(p[2], 10);
  if (y > 2400) y -= 543; // พ.ศ. → ค.ศ.
  return `${y}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
}
// แปลง yyyy-MM-dd (CE จาก input) → dd/MM/พ.ศ. สำหรับเก็บใน Sheet
function _invDateFromInput(d) {
  const p = String(d||'').split('-');
  if (p.length !== 3) return '';
  let y = parseInt(p[0], 10);
  if (y < 2400) y += 543; // ค.ศ. → พ.ศ.
  return `${p[2]}/${p[1]}/${y}`;
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

  // ── Read-only mode สำหรับใบที่ยกเลิกแล้ว ──
  const isCancelled = inv.status === 'ยกเลิก';
  const modalTitle = $('invEditModal').querySelector('[id="invEdit_no"]');
  const hdr = $('invEditModal').querySelector('[style*="font-weight:700;font-size:.95rem"]');
  // banner
  let banner = $('invEditCancelBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'invEditCancelBanner';
    banner.style.cssText = 'background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.35);border-radius:8px;' +
      'padding:8px 14px;margin-bottom:12px;color:#f87171;font-weight:700;font-size:.82rem;display:none';
    banner.textContent = '🚫 ใบกำกับนี้ถูกยกเลิกแล้ว — ดูได้อย่างเดียว ไม่สามารถแก้ไขได้';
    hdr && hdr.parentNode.insertBefore(banner, hdr.nextSibling);
  }
  banner.style.display = isCancelled ? 'block' : 'none';
  // lock / unlock fields
  ['invEdit_date','invEdit_type','invEdit_customer','invEdit_status'].forEach(id => {
    const el = $(id); if (!el) return;
    if (isCancelled) { el.setAttribute('disabled',''); el.style.opacity='.5'; el.style.cursor='not-allowed'; }
    else             { el.removeAttribute('disabled'); el.style.opacity=''; el.style.cursor=''; }
  });
  // lock item editor rows (rendered by _invRenderItemsEditor)
  const itemWrap = $('invEdit_itemsWrap');
  if (itemWrap) {
    itemWrap.querySelectorAll('input,select,button').forEach(el => {
      if (isCancelled) { el.setAttribute('disabled',''); el.style.opacity='.5'; }
      else             { el.removeAttribute('disabled'); el.style.opacity=''; }
    });
  }
  // add-item button
  const addItemBtn = $('invEditModal').querySelector('button[onclick*="invEditAddItem"]');
  if (addItemBtn) addItemBtn.style.display = isCancelled ? 'none' : '';
  // save buttons / view button visibility
  const footer = $('invEditModal').querySelector('[style*="display:flex;flex-wrap:wrap"]');
  if (footer) {
    footer.querySelectorAll('button').forEach(btn => {
      const txt = btn.textContent.trim();
      if (txt.includes('บันทึก')) btn.style.display = isCancelled ? 'none' : '';
    });
  }

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
    const isCancelled = inv.status === 'ยกเลิก';
    if (!isCancelled) { sumSubtotal += inv.subtotal; sumVat += inv.vat; sumTotal += inv.total; }
    const rowBg    = isCancelled ? 'background:#fff5f5' : 'border-bottom:1px solid #e8ecf2';
    const numStyle = isCancelled ? 'text-decoration:line-through;color:#ef4444' : '';
    const badge    = isCancelled ? ' <span style="display:inline-block;background:#ef4444;color:#fff;font-size:.6rem;padding:1px 5px;border-radius:3px;margin-left:3px;vertical-align:middle">ยกเลิก</span>' : '';
    return `<tr style="${rowBg}">
      <td style="padding:6px 8px;text-align:center">${idx+1}</td>
      <td style="padding:6px 8px;text-align:center;white-space:nowrap;${numStyle}">${inv.date}</td>
      <td style="padding:6px 8px;text-align:center;white-space:nowrap;${numStyle}">${inv.invoiceNo}${badge}</td>
      <td style="padding:6px 8px;white-space:nowrap;${numStyle}">${cust.name||''}</td>
      <td style="padding:6px 8px;text-align:center;white-space:nowrap;${numStyle}">${cust.taxId||''}</td>
      <td style="padding:6px 8px;text-align:center;font-size:.7rem;${numStyle}">${isBranch ? `สาขา ${cust.branch}` : 'สำนักงานใหญ่'}</td>
      <td style="padding:6px 8px;text-align:right;${numStyle}">${fmtB(inv.subtotal)}</td>
      <td style="padding:6px 8px;text-align:right;${numStyle}">${fmtB(inv.vat)}</td>
      <td style="padding:6px 8px;text-align:right;${numStyle}">${fmtB(inv.total)}</td>
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

// เติม dropdown "ลูกค้า" ของใบวางบิล
// รวมจาก _custCache + customerCode ที่อยู่ใน invIssuedCache แต่ไม่อยู่ใน _custCache
function _billRefreshCustomerSelect() {
  const sel = $('billCustomer');
  if (!sel) return;
  const cur = sel.value;

  // สร้าง map จาก _custCache
  const custMap = {};
  (_custCache || []).forEach(c => { if (c.code) custMap[c.code] = c; });

  // เพิ่ม customerCode จาก _invIssuedCache ที่ไม่อยู่ใน _custCache
  (_invIssuedCache || []).forEach(inv => {
    const code = String(inv.customerCode || '').trim();
    if (code && !custMap[code]) {
      custMap[code] = { code, name: code, branch: '' }; // ใช้ code เป็นชื่อถ้าไม่มีในฐานข้อมูล
    }
  });

  const allCusts = Object.values(custMap).sort((a, b) => a.name.localeCompare(b.name, 'th'));

  sel.innerHTML = '<option value="">— เลือกลูกค้า —</option>' +
    allCusts.map(c => `<option value="${c.code}">${c.name}${c.branch ? ' (' + c.branch + ')' : ''}</option>`).join('');
  if (cur) sel.value = cur;
}

// เมื่อเลือกลูกค้าใน dropdown ใบวางบิล → ตั้งค่า WHT checkbox ตามข้อมูลลูกค้า (ยังแก้ไขเองได้)
function _billOnCustomerChange() {
  const sel = $('billCustomer');
  const whtBox = $('billWht');
  if (!sel || !whtBox) return;
  const code = sel.value;
  if (!code) return;
  const cust = (_custCache || []).find(c => c.code === code);
  if (cust) whtBox.checked = !!cust.wht;
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
        <input type="checkbox" class="bill-chk" data-idx="${idx}" checked onchange="_billUpdateSummary()" style="width:16px;height:16px;cursor:pointer">
      </td>
      <td style="padding:6px 8px">${inv.invoiceNo}</td>
      <td style="padding:6px 8px">${_invThaiDate(inv.date)}</td>
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
    </table>
    <div id="billSummaryBar" style="margin-top:10px;padding:10px 14px;border-radius:8px;
      background:rgba(37,99,235,.12);border:1px solid rgba(37,99,235,.25);font-size:.8rem;color:var(--t1)">
    </div>`;
  wrap._billList = list;
  _billUpdateSummary();
}

// ── อัปเดต summary bar แสดงจำนวน + เลขที่ใบกำกับที่ติ๊กเลือก ──
function _billUpdateSummary() {
  const wrap = $('billInvoiceListWrap');
  const bar  = $('billSummaryBar');
  if (!wrap || !bar || !wrap._billList) return;

  const checked = Array.from(document.querySelectorAll('#billInvoiceListWrap .bill-chk:checked'))
    .map(c => wrap._billList[parseInt(c.dataset.idx, 10)]).filter(Boolean);

  if (!checked.length) {
    bar.innerHTML = `<span style="color:var(--t3)">⚠️ ยังไม่ได้เลือกใบกำกับ</span>`;
    return;
  }

  const sumTotal = checked.reduce((s, inv) => s + (parseFloat(inv.total)||0), 0);
  const nos = checked.map(inv => `<span style="background:#1e3a5f;border:1px solid #3b82f6;padding:2px 8px;
    border-radius:4px;font-weight:600;color:#e2f0ff;font-size:.75rem;white-space:nowrap">${inv.invoiceNo}</span>`).join(' ');

  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="color:#fff;font-weight:700;white-space:nowrap;background:#2563eb;
        padding:3px 10px;border-radius:6px;font-size:.78rem">
        📋 ${checked.length} ใบ</span>
      <div style="display:flex;flex-wrap:wrap;gap:4px;flex:1">${nos}</div>
      <span style="font-weight:700;color:#34d399;white-space:nowrap;font-size:.82rem">รวม ${fmtB(sumTotal)} ฿</span>
    </div>`;
}

function _billToggleAll(checked) {
  document.querySelectorAll('#billInvoiceListWrap .bill-chk').forEach(c => c.checked = checked);
  _billUpdateSummary();
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
      <td style="padding:5px 8px;text-align:center;white-space:nowrap">${idx + 1}</td>
      <td style="padding:5px 8px;white-space:nowrap">${inv.invoiceNo}</td>
      <td style="padding:5px 8px;text-align:center;white-space:nowrap">${inv.date}</td>
      <td style="padding:5px 8px;word-break:break-word;overflow-wrap:break-word">${poArr.join(', ') || '-'}</td>
      <td style="padding:5px 8px;text-align:right;white-space:nowrap">${fmtB(total)}</td>
    </tr>`;
  }).join('');

  return `
<div class="doc-paper" style="overflow:hidden;font-size:.87rem">
  <!-- ═══ หัวเอกสาร ═══ -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;
    padding:18px 24px 12px;border-bottom:3px solid #2563eb;gap:12px">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:52px;height:52px;border-radius:9px;flex-shrink:0;overflow:hidden;
        display:flex;align-items:center;justify-content:center">
        <img src="${_getLogoSrc()}" alt="PTS" style="width:100%;height:100%;object-fit:contain"
          onerror="this.parentNode.style.background='#2563eb';this.style.display='none';this.parentNode.innerHTML='<span style=color:#fff;font-weight:800;font-size:1rem>PT</span>'">
      </div>
      <div>
        <div style="font-weight:800;font-size:.93rem;color:#1a2232;padding-bottom:2px;border-bottom:1px solid #2563eb;margin-bottom:2px">${co.name||''}</div>
        <div style="font-size:.63rem;color:#888;letter-spacing:.4px">${co.nameEn||''}</div>
        <div style="font-size:.66rem;color:#555;margin-top:2px;line-height:1.55">
          ${co.address||''}${co.addressEn ? '<br>'+co.addressEn : ''}<br>โทร: ${co.phone||''} | อีเมล์: ${co.email||''}<br>TAX ID: ${co.taxId||''}
        </div>
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:1.5rem;font-weight:800;color:#2563eb;line-height:1">ใบวางบิล</div>
      <div style="font-size:.62rem;color:#888;letter-spacing:2.5px;margin-bottom:8px">BILLING NOTE</div>
      <table style="font-size:.76rem;margin-left:auto;border-spacing:0">
        <tr><td style="color:#666;padding:2px 6px 2px 0;white-space:nowrap">เลขที่ใบวางบิล / No:</td>
            <td style="font-weight:700;color:#2563eb;white-space:nowrap">${billNo||''}</td></tr>
        <tr><td style="color:#666;padding:2px 6px 2px 0;white-space:nowrap">วันที่ / Date:</td>
            <td style="white-space:nowrap">${billDateStr}</td></tr>
        <tr><td style="color:#666;padding:2px 6px 2px 0;white-space:nowrap">เงื่อนไขการชำระเงิน:</td>
            <td style="white-space:nowrap">${payTerm||''}</td></tr>
      </table>
    </div>
  </div>

  <!-- ═══ ข้อมูลลูกค้า ═══ -->
  <div style="padding:10px 24px;border-bottom:1px solid #e8ecf2">
    <div style="font-size:.6rem;font-weight:700;color:#2563eb;letter-spacing:1.2px;margin-bottom:5px">
      ลูกค้า / CUSTOMER</div>
    <div style="font-size:.88rem;font-weight:700;margin-bottom:2px">${cust.name||''}${cust.branch?' ('+cust.branch+')':''}</div>
    <div style="font-size:.75rem;color:#444;margin-bottom:2px">${cust.address||''}</div>
    <div style="font-size:.75rem;color:#444">
      ${cust.taxId ? `เลขผู้เสียภาษี: ${cust.taxId}` : ''}${cust.taxId && cust.phone ? ' | ' : ''}${cust.phone ? `โทร: ${cust.phone}` : ''}
    </div>
  </div>

  <!-- ═══ ตารางรายการ ═══ -->
  <div style="padding:12px 24px">
    <table style="width:100%;border-collapse:collapse;font-size:.78rem;table-layout:fixed">
      <colgroup>
        <col style="width:5%">
        <col style="width:17%">
        <col style="width:15%">
        <col style="width:42%">
        <col style="width:21%">
      </colgroup>
      <thead>
        <tr style="background:#2563eb;color:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact">
          <th style="padding:7px 8px;text-align:center">ลำดับที่</th>
          <th style="padding:7px 8px;text-align:left">เลขที่ใบกำกับภาษี</th>
          <th style="padding:7px 8px;text-align:center">ลงวันที่</th>
          <th style="padding:7px 8px;text-align:left">เลขที่ใบสั่งซื้อ</th>
          <th style="padding:7px 8px;text-align:right">จำนวนเงิน (฿)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="4" style="padding:6px 8px;text-align:right;color:#555;border-top:2px solid #e8ecf2;font-size:.75rem">
            รวมภาษีมูลค่าเพิ่ม (รวมอยู่ในยอดแต่ละใบแล้ว)</td>
          <td style="padding:6px 8px;text-align:right;color:#888;border-top:2px solid #e8ecf2;white-space:nowrap">${fmtB(sumVat)}</td>
        </tr>
        <tr>
          <td colspan="4" style="padding:5px 8px;text-align:right;color:#333;font-weight:600">รวมเงินทั้งสิ้น</td>
          <td style="padding:5px 8px;text-align:right;font-weight:700;white-space:nowrap">${fmtB(sumTotal)}</td>
        </tr>
        ${wht ? `
        <tr>
          <td colspan="4" style="padding:5px 8px;text-align:right;color:#dc2626">หัก ณ ที่จ่าย 3%</td>
          <td style="padding:5px 8px;text-align:right;color:#dc2626;white-space:nowrap">${fmtB(whtAmount)}</td>
        </tr>` : ''}
        <tr style="background:#1d4ed8;color:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact">
          <td colspan="4" style="padding:8px 8px;text-align:right;font-weight:700;font-size:.86rem">
            จำนวนเงินรับสุทธิ / NET AMOUNT</td>
          <td style="padding:8px 8px;text-align:right;font-weight:800;font-size:.86rem;white-space:nowrap">
            ฿ ${fmtB(netAmount)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- ═══ หมายเหตุ ═══ -->
  <div style="padding:2px 24px 10px;font-size:.74rem;color:#555">
    ได้รับบิลไว้ตรวจสอบตามรายการนี้ถูกต้องแล้ว จำนวน ${items.length} ฉบับ
  </div>

  <!-- ═══ ลายเซ็น ═══ -->
  <div style="display:flex;gap:0;border-top:1px solid #e8ecf2;margin:0 24px">
    <div style="flex:1;text-align:center;padding:8px 12px 20px">
      <div style="margin-top:38px;border-top:1px solid #aaa;padding-top:5px;font-size:.7rem;color:#444">ผู้รับวางบิล / Received by</div>
      <div style="font-size:.63rem;color:#aaa;margin-top:8px">วันที่ ......../......../........</div>
    </div>
    <div style="width:1px;background:#e8ecf2;margin:8px 0"></div>
    <div style="flex:1;text-align:center;padding:8px 12px 20px">
      <div style="margin-top:38px;border-top:1px solid #aaa;padding-top:5px;font-size:.7rem;color:#444">
        ผู้มีอำนาจลงนาม / Authorized signature<br>ในนาม ${co.name||''}</div>
      <div style="font-size:.63rem;color:#aaa;margin-top:8px">วันที่ ......../......../........</div>
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
    ? _billDateToThaiBE(billDateVal)
    : _fmtDateBE(new Date());

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

// ── แปลง Date object -> dd/MM/yyyy พ.ศ. ──
function _fmtDateBE(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  const dd   = String(dateObj.getDate()).padStart(2,'0');
  const mm   = String(dateObj.getMonth()+1).padStart(2,'0');
  const yyyy = dateObj.getFullYear() + 543;
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

// ═══════════════════════════════════════════════════════════════════
// ── ใบเสร็จรับเงิน (Receipt) — sub-tab 5 ─────────────────────────
// ═══════════════════════════════════════════════════════════════════
let _rcptLoaded = false;

async function rcptInit() {
  const sel = $('rcpt_invNo');
  if (!sel) return;
  // โหลด invoice list ถ้ายังไม่มี
  if (!_invIssuedCache || !_invIssuedCache.length) await fetchIssuedInvoices();
  // เติม dropdown
  sel.innerHTML = '<option value="">— เลือกใบกำกับ —</option>' +
    (_invIssuedCache || []).map(inv => {
      const cust = (_custCache || []).find(c => c.code === inv.customerCode) || {};
      const label = `${inv.invoiceNo} | ${_invThaiDate(inv.date)} | ${cust.name || inv.customerCode || ''}`;
      return `<option value="${inv.invoiceNo}">${label}</option>`;
    }).join('');
  // load history
  rcptLoadHistory();
  // set default date today
  const td = $('rcptDate');
  if (td && !td.value) td.value = new Date().toISOString().slice(0,10);
}

function rcptOnInvSelect() {
  const invNo = $('rcpt_invNo')?.value;
  const wrap = $('rcptPreviewWrap');
  if (!wrap) return;
  if (!invNo) { wrap.style.display = 'none'; return; }
  const inv = (_invIssuedCache || []).find(x => x.invoiceNo === invNo);
  if (!inv) { wrap.style.display = 'none'; return; }
  const cust = (_custCache || []).find(c => c.code === inv.customerCode) || {};
  $('rcptCust').textContent = cust.name || inv.customerCode || '—';
  $('rcptAmt').textContent = '฿' + (parseFloat(inv.total)||0).toLocaleString('th-TH', {minimumFractionDigits:2});
  wrap.style.display = '';
  const td = $('rcptDate');
  if (td && !td.value) td.value = new Date().toISOString().slice(0,10);
}

function rcptLoadHistory() {
  const wrap = $('rcptHistList');
  if (!wrap) return;
  const saved = JSON.parse(localStorage.getItem('ptts_receipts') || '[]');
  if (!saved.length) { wrap.innerHTML = '<div style="color:var(--t3);font-size:.85rem;padding:8px 0">ยังไม่มีใบเสร็จที่ออก</div>'; return; }
  wrap.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:.83rem">
    <thead><tr style="background:rgba(255,255,255,.05)">
      <th style="padding:7px 10px;text-align:left">เลขที่ใบเสร็จ</th>
      <th style="padding:7px 10px;text-align:left">วันที่</th>
      <th style="padding:7px 10px;text-align:left">ลูกค้า</th>
      <th style="padding:7px 10px;text-align:right">ยอด</th>
      <th style="padding:7px 10px;text-align:center">พิมพ์</th>
    </tr></thead><tbody>
    ${saved.slice().reverse().map(r => `
      <tr style="border-bottom:1px solid rgba(255,255,255,.05)">
        <td style="padding:7px 10px;color:var(--c1);font-weight:700">${r.rcptNo}</td>
        <td style="padding:7px 10px;color:var(--t2)">${r.date}</td>
        <td style="padding:7px 10px">${r.cust}</td>
        <td style="padding:7px 10px;text-align:right;color:#34d399">฿${parseFloat(r.total||0).toLocaleString('th-TH',{minimumFractionDigits:2})}</td>
        <td style="padding:7px 10px;text-align:center">
          <button onclick="rcptPrintSaved('${r.rcptNo.replace(/'/g,"\\'")}',${saved.indexOf(r)})" style="padding:4px 10px;border-radius:6px;border:1px solid var(--inp-bc);background:var(--bg-card);color:var(--t1);cursor:pointer;font-family:Sarabun,sans-serif;font-size:.78rem">🖨️</button>
        </td>
      </tr>`).join('')}
    </tbody></table>`;
}

function rcptPrint() {
  const invNo = $('rcpt_invNo')?.value;
  if (!invNo) return;
  const inv = (_invIssuedCache || []).find(x => x.invoiceNo === invNo);
  if (!inv) return;
  const cust = (_custCache || []).find(c => c.code === inv.customerCode) || {};
  const dateVal = $('rcptDate')?.value || new Date().toISOString().slice(0,10);
  const payMethod = $('rcptPayMethod')?.value || 'โอนเงิน';
  const total = parseFloat(inv.total)||0;

  // สร้างเลขที่ใบเสร็จ
  const saved = JSON.parse(localStorage.getItem('ptts_receipts') || '[]');
  const today = dateVal.replace(/-/g,'');
  const seq = saved.filter(r => r.rcptNo.includes(today)).length + 1;
  const rcptNo = `RC-${today}-${String(seq).padStart(3,'0')}`;

  // บันทึก
  const record = { rcptNo, date: isoToThaiShort(dateVal), cust: cust.name || inv.customerCode || '', total, invNo, payMethod };
  saved.push(record);
  localStorage.setItem('ptts_receipts', JSON.stringify(saved));

  _rcptOpenPrint({ rcptNo, inv, cust, dateVal, payMethod, total });
  rcptLoadHistory();
}

function rcptPrintSaved(rcptNo, idx) {
  const saved = JSON.parse(localStorage.getItem('ptts_receipts') || '[]');
  const r = saved[saved.length - 1 - idx]; // reversed
  if (!r) return;
  const inv = (_invIssuedCache || []).find(x => x.invoiceNo === r.invNo) || {};
  const cust = (_custCache || []).find(c => c.code === inv.customerCode) || {};
  _rcptOpenPrint({ rcptNo: r.rcptNo, inv, cust, dateVal: r.date, payMethod: r.payMethod, total: r.total });
}

function _rcptOpenPrint({ rcptNo, inv, cust, dateVal, payMethod, total }) {
  const comp = _companyInfoCache || {};
  const thaiDate = dateVal.includes('/') ? dateVal : isoToThaiShort(dateVal);
  const totalFmt = '฿' + parseFloat(total||0).toLocaleString('th-TH',{minimumFractionDigits:2});
  const subtotal = (parseFloat(inv.subtotal)||0) || total/1.07;
  const vat = total - subtotal;

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
<title>ใบเสร็จรับเงิน ${rcptNo}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap">
<style>
@page{size:A4;margin:18mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
body{margin:0;padding:16px;font-family:'Sarabun',sans-serif;color:#1a2232;background:#fff}
.doc{max-width:760px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1d4ed8;padding-bottom:14px;margin-bottom:18px}
.co-name{font-size:1.1rem;font-weight:800;color:#1d4ed8}
.co-sub{font-size:.78rem;color:#555;margin-top:2px}
.doc-title{text-align:right}
.doc-title h1{font-size:1.4rem;font-weight:900;color:#1d4ed8;margin:0}
.doc-title .rcpt-no{font-size:.85rem;color:#555;margin-top:4px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;margin-bottom:18px;padding:12px;background:#f8faff;border-radius:8px;border:1px solid #e0e8ff}
.info-grid .lbl{font-size:.72rem;color:#888;margin-bottom:2px}
.info-grid .val{font-size:.9rem;font-weight:600}
table{width:100%;border-collapse:collapse;margin-bottom:14px}
th{background:#1d4ed8;color:#fff;padding:8px 10px;font-size:.82rem;text-align:left}
td{padding:7px 10px;border-bottom:1px solid #e8ecf2;font-size:.85rem}
.total-row{background:#f0f5ff}
.total-row td{font-weight:700;font-size:.95rem;border-top:2px solid #1d4ed8}
.paid-stamp{display:inline-block;border:3px solid #16a34a;border-radius:8px;color:#16a34a;font-size:1.1rem;font-weight:900;padding:6px 20px;transform:rotate(-3deg);margin-top:16px;letter-spacing:2px}
.sign-row{display:flex;gap:20px;margin-top:32px}
.sign-box{flex:1;text-align:center;padding-top:8px;border-top:1px solid #bbb;font-size:.78rem;color:#555}
@media print{body{padding:0}.paid-stamp{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="doc">
  <div class="header">
    <div>
      <div class="co-name">${comp.name||'บริษัท PTTS'}</div>
      <div class="co-sub">${comp.address||''}</div>
      <div class="co-sub">เลขที่ผู้เสียภาษี: ${comp.taxId||''}</div>
    </div>
    <div class="doc-title">
      <h1>ใบเสร็จรับเงิน</h1>
      <div class="doc-title"><b>RECEIPT</b></div>
      <div class="rcpt-no">เลขที่: ${rcptNo}</div>
    </div>
  </div>
  <div class="info-grid">
    <div><div class="lbl">ลูกค้า</div><div class="val">${cust.name||inv.customerCode||'—'}${cust.branch?' ('+cust.branch+')':''}</div></div>
    <div><div class="lbl">วันที่ออกใบเสร็จ</div><div class="val">${thaiDate}</div></div>
    <div><div class="lbl">อ้างอิงใบกำกับภาษีเลขที่</div><div class="val">${inv.invoiceNo||'—'}</div></div>
    <div><div class="lbl">วิธีชำระเงิน</div><div class="val">${payMethod}</div></div>
  </div>
  <table>
    <thead><tr><th>รายการ</th><th style="text-align:right">จำนวนเงิน (บาท)</th></tr></thead>
    <tbody>
      <tr><td>ค่าสินค้า/บริการ (ตามใบกำกับภาษีเลขที่ ${inv.invoiceNo||''})</td><td style="text-align:right">${(subtotal).toLocaleString('th-TH',{minimumFractionDigits:2})}</td></tr>
      <tr><td>ภาษีมูลค่าเพิ่ม 7%</td><td style="text-align:right">${(vat).toLocaleString('th-TH',{minimumFractionDigits:2})}</td></tr>
      <tr class="total-row"><td>รวมทั้งสิ้น</td><td style="text-align:right;color:#1d4ed8">${totalFmt}</td></tr>
    </tbody>
  </table>
  <div><span class="paid-stamp">✓ ชำระเงินแล้ว</span></div>
  <div class="sign-row">
    <div class="sign-box"><div style="margin-top:35px;border-top:1px solid #bbb;padding-top:4px">ผู้รับเงิน</div><div style="margin-top:4px;font-size:.7rem;color:#aaa">วันที่ ......../......../........</div></div>
    <div class="sign-box"><div style="margin-top:35px;border-top:1px solid #bbb;padding-top:4px">ผู้จ่ายเงิน</div><div style="margin-top:4px;font-size:.7rem;color:#aaa">วันที่ ......../......../........</div></div>
  </div>
</div>
<script>(function(){function go(){try{window.focus();window.print();}catch(e){}}
if(document.fonts&&document.fonts.ready){document.fonts.ready.then(go).catch(function(){setTimeout(go,700)});}else{setTimeout(go,700);}})();<\/script>
</body></html>`;

  const w = window.open('','_blank');
  if (!w) { Swal.fire({icon:'warning',title:'Popup ถูกบล็อก',text:'กรุณาอนุญาต popup แล้วลองใหม่',background:'var(--bg-card)',color:'var(--t1)'}); return; }
  w.document.write(html);
  w.document.close();
}
