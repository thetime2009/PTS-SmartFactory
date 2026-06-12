// ══════════════════════════════════════════════════════
// ══ TAB: ลูกค้า (Customers) ══════════════════════════════
// ══════════════════════════════════════════════════════
let _custCache  = [];
let _custEditIdx = -1; // index ใน _custCache ที่กำลังแก้ไข, -1 = ไม่มี, 'new' = แถวใหม่

async function fetchCustomers() {
  if (!SCRIPT_URL) { renderCustomerTable(); return; }
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getCustomers', {mode:'cors'});
    const data = await res.json();
    if (data.status === 'ok') _custCache = data.customers || [];
  } catch (e) { /* เงียบไว้ */ }
  renderCustomerTable();
  _invRefreshCustomerSelect();
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
    background:rgba(20,20,32,.9);color:#d4cfe8;font-family:Sarabun,sans-serif;font-size:.8rem">`;
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
    background:rgba(20,20,32,.9);color:#d4cfe8;font-family:Sarabun,sans-serif;font-size:.8rem">`;
}

// ช่อง "ผู้ติดต่อ" — ค่านี้คือสิ่งที่อยู่ในคอลัมน์ "ลูกค้า" ของชีต Order จริง (ใช้ตอนออกใบเสนอราคา)
// ใช้ autocomplete จากรายชื่อที่มีอยู่จริงใน Order เพื่อให้จับคู่ออกใบกำกับได้ตรง
function _custContactInput(id, val) {
  const opts = _invOrderCustomerNames();
  return `<input id="${id}" list="${id}_list" value="${(val||'').replace(/"/g,'&quot;')}" placeholder="ผู้ติดต่อ * (ต้องตรงกับคอลัมน์ลูกค้าใน Order)"
    style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid rgba(99,102,241,.35);
    background:rgba(20,20,32,.9);color:#d4cfe8;font-family:Sarabun,sans-serif;font-size:.8rem">
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
            <button onclick="custSaveRow(${i})"
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

function _invRefreshCustomerSelect() {
  const sel = $('inv_customer');
  if (!sel) return;
  const curCode = sel.value ? (_custCache[parseInt(sel.value,10)]||{}).code : '';
  sel.innerHTML = '<option value="">— เลือกลูกค้า —</option>' +
    _custCache.map((c,i) => `<option value="${i}">${c.name}${c.branch?' ('+c.branch+')':''}</option>`).join('');
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
    if ($('invRep_year'))  $('invRep_year').value  = String(now.getFullYear());
  }
  fetchIssuedInvoices();
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
  const rows = _orderCache.filter(r =>
    matchKeys.includes(String(r[ORDER_COLS.customer]||'').trim()) &&
    !String(r[ORDER_COLS.invoiceNo]||'').trim()
  );
  if (!rows.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:20px;color:var(--t3);font-size:.82rem">
      ไม่มี PO ที่ยังไม่ออกใบกำกับสำหรับลูกค้านี้</div>`;
    _invUpdateSummary();
    return;
  }
  wrap.innerHTML = rows.map(r => {
    const noPO  = String(r[ORDER_COLS.noPO] || '');
    const prod  = r[ORDER_COLS.productList] || '';
    const date  = r[ORDER_COLS.orderDate] || '';
    const total = parseFloat(r[ORDER_COLS.totalTax]) || 0;
    const checked = _invSelectedPOs.has(noPO) ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;
      border:1px solid var(--bc-card);margin-bottom:6px;cursor:pointer;background:var(--bg-input2)">
      <input type="checkbox" ${checked} onchange="_invToggleRow('${noPO.replace(/'/g,"\\'")}',this.checked)"
        style="width:18px;height:18px;flex-shrink:0">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;color:var(--c1);font-size:.85rem">${noPO}</div>
        <div style="font-size:.76rem;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${prod}</div>
        <div style="font-size:.7rem;color:var(--t3)">วันที่: ${date}</div>
      </div>
      <div style="font-weight:700;color:#34d399;font-size:.85rem;white-space:nowrap">${fmtB(total)} ฿</div>
    </label>`;
  }).join('');
  _invUpdateSummary();
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
    if (_invSelectedPOs.has(String(r[ORDER_COLS.noPO]||''))) total += parseFloat(r[ORDER_COLS.totalTax]) || 0;
  });
  const subtotal = total / 1.07;
  const vat = total - subtotal;
  sumEl.innerHTML = `
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
    await _invShowPreview(data.nextNo, type, cust);
  } catch (e) {
    Swal.fire({icon:'error',title:'ขอเลขที่ไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
  }
}

// ── สร้างรายการสินค้า (items) แบบโครงสร้างข้อมูล จากแถว Order ที่เลือก ──
function _invBuildItemsFromOrders(orderRows) {
  return orderRows.map(r => {
    const t   = parseFloat(r[ORDER_COLS.totalTax]) || 0;
    const qty = parseFloat(r[ORDER_COLS.qty]) || 0;
    const priceExVat = parseFloat(r[ORDER_COLS.price]) || 0;
    const lineTotal = t || (qty * priceExVat * 1.07);
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
    if (it.meshOut) detailLines.push(`ตะแกรงนอก: ${it.meshOut}`);
    if (it.meshIn) detailLines.push(`ตะแกรงใน: ${it.meshIn}`);
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
        <div style="font-weight:800;font-size:.95rem;color:#1a2232">${co.name||''}</div>
        <div style="font-size:.65rem;color:#888;letter-spacing:.5px">${co.nameEn||''}</div>
        <div style="font-size:.68rem;color:#555;margin-top:3px;line-height:1.6">
          ${co.address||''}<br>โทร: ${co.phone||''} | อีเมล์: ${co.email||''}<br>TAX ID: ${co.taxId||''}
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
      <div style="border-top:1px solid #bbb;padding-top:5px;font-size:.7rem;color:#555">ผู้รับเงิน / Received by</div>
      <div style="font-size:.65rem;color:#aaa;margin-top:2px">( ______________ )</div>
    </div>
    <div style="flex:1;text-align:center;min-width:160px">
      <div style="border-top:1px solid #bbb;padding-top:5px;font-size:.7rem;color:#555">ผู้มีอำนาจลงนาม / Authorized signature</div>
      <div style="font-size:.65rem;color:#aaa;margin-top:2px">( ______________ )</div>
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
    try {
      const res = await fetch(SCRIPT_URL, {
        method:'POST', mode:'cors',
        headers:{'Content-Type':'text/plain'},
        body: JSON.stringify(Object.assign({ action:'saveInvoiceRecord', issuedBy: 'PTS' }, _invPreviewData))
      });
      const out = await res.json();
      if (!out || out.status !== 'ok') throw new Error((out && out.message) || 'save failed');
      Swal.fire({icon:'success',title:`ออกใบกำกับ ${out.invoiceNo} สำเร็จ ✅`,background:'#0d1b2a',color:'#cce4ff',
        timer:1800,showConfirmButton:false,toast:true,position:'top-end'});
      _invSelectedPOs.clear();
      _invPreviewData = null;
      closeDocExport();
      await fetchOrders();
      renderInvOrderList();
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
  const dt = new Date(parseInt(p[2],10), parseInt(p[1],10) - 1, parseInt(p[0],10));
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

  $('docExportOverlay').classList.add('open');
}

// ══════════════════════════════════════════════════════
// ══ ใบกำกับที่ออกแล้ว — แก้ไขรายละเอียด ══════════════════
// ══════════════════════════════════════════════════════
let _invIssuedCache = [];

async function fetchIssuedInvoices() {
  if (!SCRIPT_URL) { renderIssuedInvoiceList(); return; }
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getInvoices', {mode:'cors'});
    const data = await res.json();
    if (data.status === 'ok') _invIssuedCache = (data.invoices || []).slice().reverse(); // ล่าสุดอยู่บน
  } catch (e) { /* เงียบไว้ */ }
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
  const rows = _invIssuedCache.map(inv => {
    const cust = _custCache.find(c => c.code === inv.customerCode) || {};
    const poList = (inv.items || []).map(it => it.poNo).filter(Boolean);
    const poText = poList.length ? poList.join(', ') : (inv.poList ? (Array.isArray(inv.poList) ? inv.poList.join(', ') : inv.poList) : '-');
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
  wrap.innerHTML = `
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
      <button type="button" class="btn" onclick="this.closest('.inv-item-row').remove()" style="padding:7px 10px;font-size:.74rem;width:100%">🗑️ ลบรายการ</button>
    </div>
  </div>`;
}

function _invRenderItemsEditor(items) {
  const wrap = $('invEdit_itemsWrap');
  if (!wrap) return;
  wrap.innerHTML = (items || []).map(_invItemRowHtml).join('');
}

function invEditAddItem() {
  const wrap = $('invEdit_itemsWrap');
  if (!wrap) return;
  wrap.insertAdjacentHTML('beforeend', _invItemRowHtml({}));
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

function _invRenderPOPickerList(filter) {
  const list = $('invPOPicker_list');
  if (!list) return;
  const f = String(filter||'').trim().toLowerCase();
  const rows = (_orderCache || []).filter(r => {
    const noPO = String(r[ORDER_COLS.noPO]||'').trim();
    if (!noPO) return false;
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

// ── คำนวณ VAT/รวม อัตโนมัติเมื่อแก้ "มูลค่าก่อน VAT" ──
function _invEditRecalc() {
  const sub = parseFloat($('invEdit_subtotal').value) || 0;
  const vat = sub * 0.07;
  $('invEdit_vat').value = vat.toFixed(2);
  $('invEdit_total').value = (sub + vat).toFixed(2);
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
  try {
    const res = await fetch(SCRIPT_URL, {
      method:'POST', mode:'cors',
      headers:{'Content-Type':'text/plain'},
      body: JSON.stringify(data)
    });
    const out = await res.json();
    if (!out || out.status !== 'ok') throw new Error((out && out.message) || 'save failed');
    await fetchIssuedInvoices();
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
      <td style="padding:6px 8px">${cust.name||''}</td>
      <td style="padding:6px 8px;text-align:center;white-space:nowrap">${cust.taxId||''}</td>
      <td style="padding:6px 8px;text-align:center;font-size:.7rem">${isBranch ? `สาขา ${cust.branch}` : 'สำนักงานใหญ่'}</td>
      <td style="padding:6px 8px;text-align:right">${fmtB(inv.subtotal)}</td>
      <td style="padding:6px 8px;text-align:right">${fmtB(inv.vat)}</td>
      <td style="padding:6px 8px;text-align:right">${fmtB(inv.total)}</td>
    </tr>`;
  }).join('');

  const html = `
<div class="doc-paper" style="overflow:hidden">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;
    padding:22px 28px 14px;border-bottom:3px solid #0d9488;gap:12px;flex-wrap:wrap">
    <div>
      <div style="font-weight:800;font-size:.95rem;color:#1a2232">${co.name||''}</div>
      <div style="font-size:.65rem;color:#888;letter-spacing:.5px">${co.nameEn||''}</div>
      <div style="font-size:.68rem;color:#555;margin-top:3px;line-height:1.6">
        ${co.address||''}<br>TAX ID: ${co.taxId||''}
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
        <tr style="background:#0d9488;color:#fff">
          <th style="padding:6px 8px;text-align:center;border-radius:4px 0 0 0">ลำดับ</th>
          <th style="padding:6px 8px;text-align:center">วัน เดือน ปี</th>
          <th style="padding:6px 8px;text-align:center">เลขที่ใบกำกับ</th>
          <th style="padding:6px 8px;text-align:left">บริษัทที่ขายไป</th>
          <th style="padding:6px 8px;text-align:center">เลขประจำตัวผู้เสียภาษี</th>
          <th style="padding:6px 8px;text-align:center">สำนักงานใหญ่/สาขา</th>
          <th style="padding:6px 8px;text-align:right">มูลค่าก่อน VAT (฿)</th>
          <th style="padding:6px 8px;text-align:right">VAT (฿)</th>
          <th style="padding:6px 8px;text-align:right;border-radius:0 4px 0 0">รวม (฿)</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="9" style="padding:18px;text-align:center;color:#999">ไม่มีใบกำกับในเดือนนี้</td></tr>`}</tbody>
      <tfoot>
        <tr style="background:#0f766e;color:#fff">
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
