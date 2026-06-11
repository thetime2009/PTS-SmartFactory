// ════════════════════════════════════════════════════════════
//  purchase.js — ระบบใบสั่งซื้อ (Purchase Order)
//  เชื่อมกับ Order ผ่านฟิลด์ "อ้างอิง No.PO/No.Quo"
// ════════════════════════════════════════════════════════════

const PO_HEADER_COLS = {
  poNo:0, issueDate:1, wantDate:2, supplierCode:3, refOrders:4,
  payTerm:5, deliverTerm:6, subtotal:7, vat:8, total:9,
  status:10, createdBy:11, note:12, update:13
};
const PO_ITEM_COLS = { poNo:0, seq:1, name:2, spec:3, qty:4, unit:5, unitPrice:6, lineTotal:7 };

let _poCache = [];          // header rows
let _poItemsCache = {};     // poNo -> items rows
let _supplierCache = [];
let _poEditingNo = null;    // poNo ที่กำลังแก้ไข, null = สร้างใหม่
let _poItems = [];          // รายการสินค้าในการ์ดที่กำลังแก้ไข
let _poPage = 1;
const PO_PAGE_SIZE = 20;

// ── ข้อมูลบริษัท (สำหรับหัวกระดาษใบสั่งซื้อ) ──
const PTS_COMPANY = {
  nameTh: 'บริษัท ปิ่นทองเทรดดิ้งแอนด์ซัพพลาย จำกัด',
  nameEn: 'PINTHONGTRADDING AND SUPPLY CO., LTD.',
  address: 'เลขที่ 9/88 หมู่ที่ 2 ต.แพรกษาใหม่ อ.เมือง จ.สมุทรปราการ 10280',
  phone: '02-345-6789, 081-999-8888',
  email: 'Thetime.pota@gmail.com',
  taxId: '0105574001897',
};
const PTS_LOGO_B64 = 'data:image/png;base64,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xALYt88UXbt25mDVOefA9Onwr3/BscfCxRfDQw+Z87tVddA480yYM8es2W+8sWKvr0goP43kiaYoLWBNIkkJvYq1gMGcDx461NycTnjiCVi0CO66y5xSeukl+M9/TJGfeSaMHm3W0AfjwgvNKaqvvzYTiceC8gK2cD5Lo6kGItI7NGB0442JGfFt00akd28zYN5774msXGku7r/6ajPKht1uLvpfvLjywa2NG83IHC++KNKyZfQ2NWoksm1bsPSoXL60I4cmkZSNBsW6D1wZmzaZ27x5pjtl69Zw6qlm0/q//zX7x++/b9bay5bBs8+Cy1W+jHbt4MQT4dNPoXt3eP756GzSg1iaGk88mtCHwueD336DhQth+HBzve+YMZCeDlOngsMBgwdXbNvpp8NXX5nijxbDiNnIthawxhpiXQO3aFG9pYNgCnrtWnj8cejVC44+2ty/aNGB783IgO3boVGj6GvP8jVwVH1gLWBNIomPKyXAgAHQt6/5OiOj+u6Rublwzz3m6qVXXjF7q+E4neDxmM1whyM6W8sPYuVHU5QWsCaRxH41Epiiuuoqs5kLMH48tG8fWVkrV5q+0vv2ld+fk2OK2GaLvvVQvgmtlxNqagxl91ssm9CdO5uxsc4802zifv+9Oe8bKYWFUFBQft+6dXDEEWbUjoMtnKgK5WvgqNAC1iSS+NTAAweagmjUCG67DWbPNud7U1MjK69ePXPeOEhenjkC3bkz/P579PbGcDWSFrAmkZR1TGMl4BNOMEeTg9x1lzmqvHIljBgRWZn//KdZRpC33oKdO83zvPtudPbC/k1oPYilqTGUCTjaZmiQUaPA7S77u1EjeP11c963VStzdLk6OBxw551lf+fmmi6YnTqZZX/ySfQ2l29Cx3ilhEYTJ0RkYMi76T//id6j6eyzw1N3lufHH800KmPGiNx0k5mF4VDluVwiL7xQvpw+fcxj778vcsUVsfEOO+ookbxQbrfZVv8uGk2VEJGuIWF89515I0cqAqezatkFp0wxMyzcfLOZKqWyss4/38yhFMTnExk2zDw+YYKZaiVW7p0XXRT+4JkczTXV1bcmYYiIG3gLuACA776Dyy+HbduqX9jIkea87ccfm66SDofZZG7f3vw/fK62qMjM1rB2rRkEb88esw/eoAEcc4zZ5z3xxLL3//knDBsGS5aYnlqnnQZX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';

// ── โหลด suppliers ──
async function fetchSuppliers() {
  if (!SCRIPT_URL) return;
  try {
    const res = await fetch(SCRIPT_URL + '?action=getSuppliers', {mode:'cors'});
    const data = await res.json();
    _supplierCache = data.suppliers || [];
    const sel = $('po_supplier');
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = '<option value="">— เลือก Supplier —</option>' +
        _supplierCache.map(s => `<option value="${s.code}">${s.name} (${s.code})</option>`).join('');
      if (cur) sel.value = cur;
    }
  } catch (err) { console.error('fetchSuppliers', err); }
}

// ── โหลดใบสั่งซื้อทั้งหมด ──
async function fetchPurchaseOrders() {
  const tbody = $('poBody');
  if (!tbody) return;
  if (!SCRIPT_URL) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:30px;text-align:center;color:var(--t3);font-size:.8rem">⚠️ ยังไม่ได้ตั้งค่า Script URL</td></tr>`;
    return;
  }
  tbody.innerHTML = `<tr><td colspan="7" style="padding:30px;text-align:center;color:var(--t3);font-size:.8rem">↻ กำลังโหลด…</td></tr>`;
  try {
    const res = await fetch(SCRIPT_URL + '?action=getPurchaseOrders', {mode:'cors'});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.status === 'error') throw new Error(data.message || 'unknown');
    _poCache = (data.headers || []).slice().reverse(); // ใหม่สุดก่อน
    _poItemsCache = data.items || {};
    _poPage = 1;
    renderPOTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:30px;text-align:center;color:#f87171;font-size:.8rem">โหลดข้อมูลไม่สำเร็จ: ${err.message}</td></tr>`;
  }
}

function _poSupplierName(code) {
  const s = _supplierCache.find(x => x.code === code);
  return s ? s.name : (code || '—');
}

function _poStatusBadge(status) {
  const map = {
    'ร่าง':          {bg:'rgba(148,163,184,.15)', fg:'#94a3b8', bd:'rgba(148,163,184,.35)'},
    'ส่งแล้ว':       {bg:'rgba(56,189,248,.15)',  fg:'#0ea5e9', bd:'rgba(56,189,248,.35)'},
    'ได้รับของแล้ว': {bg:'rgba(34,197,94,.15)',   fg:'#16a34a', bd:'rgba(34,197,94,.35)'},
    'ยกเลิก':        {bg:'rgba(248,113,113,.15)', fg:'#ef4444', bd:'rgba(248,113,113,.35)'},
  };
  const c = map[status] || map['ร่าง'];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:.65rem;font-weight:600;
    background:${c.bg};color:${c.fg};border:1px solid ${c.bd}">${status||'ร่าง'}</span>`;
}

// ── เรนเดอร์ตารางรายการ PO ──
function renderPOTable() {
  const tbody = $('poBody');
  if (!tbody) return;
  const q = ($('poSearch')?.value || '').trim().toLowerCase();
  let rows = _poCache;
  if (q) {
    rows = rows.filter(r => [r[PO_HEADER_COLS.poNo], r[PO_HEADER_COLS.refOrders], _poSupplierName(r[PO_HEADER_COLS.supplierCode])]
      .some(v => String(v||'').toLowerCase().includes(q)));
  }
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:30px;text-align:center;color:var(--t3);font-size:.8rem">ไม่มีใบสั่งซื้อ</td></tr>`;
    if ($('poPager')) $('poPager').innerHTML = '';
    return;
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / PO_PAGE_SIZE));
  if (_poPage > totalPages) _poPage = totalPages;
  if (_poPage < 1) _poPage = 1;
  const startIdx = (_poPage - 1) * PO_PAGE_SIZE;
  const pageRows = rows.slice(startIdx, startIdx + PO_PAGE_SIZE);

  tbody.innerHTML = pageRows.map((r, ri) => {
    const poNo   = String(r[PO_HEADER_COLS.poNo]||'');
    const total  = parseFloat(r[PO_HEADER_COLS.total]) || 0;
    const status = String(r[PO_HEADER_COLS.status]||'ร่าง');
    const rowBg  = ri % 2 === 0 ? '' : 'background:var(--pair-bg)';
    return `<tr style="${rowBg};border-bottom:1px solid var(--bc-div)">
      <td style="padding:8px 10px;font-size:.78rem;font-weight:600;color:var(--c1);white-space:nowrap">${poNo}</td>
      <td style="padding:8px 10px;font-size:.72rem;color:var(--t3);white-space:nowrap">${r[PO_HEADER_COLS.issueDate]||'—'}</td>
      <td style="padding:8px 10px;font-size:.78rem;color:var(--t1)">${_poSupplierName(r[PO_HEADER_COLS.supplierCode])}</td>
      <td style="padding:8px 10px;font-size:.72rem;color:var(--t2)">${r[PO_HEADER_COLS.refOrders]||'—'}</td>
      <td style="padding:8px 10px;text-align:right;font-size:.78rem;font-weight:600;color:var(--c1);white-space:nowrap">${total ? total.toLocaleString('th-TH',{minimumFractionDigits:2}) : '—'} <span style="font-size:.65rem">฿</span></td>
      <td style="padding:8px 10px;white-space:nowrap">${_poStatusBadge(status)}</td>
      <td style="padding:8px 10px;text-align:center;white-space:nowrap">
        <button class="btn-fx" onclick="_poEdit('${poNo}')" style="padding:5px 10px;border-radius:7px;border:none;background:#2563eb;color:#fff;font-size:.7rem;cursor:pointer;font-family:Sarabun,sans-serif;margin:1px">✏️ แก้ไข</button>
        <button class="btn-fx" onclick="_poPrint('${poNo}')" style="padding:5px 10px;border-radius:7px;border:none;background:#16a34a;color:#fff;font-size:.7rem;cursor:pointer;font-family:Sarabun,sans-serif;margin:1px">🖨️ พิมพ์</button>
        <button class="btn-fx" onclick="_poDelete('${poNo}')" style="padding:5px 8px;border-radius:7px;border:1px solid rgba(248,113,113,.35);background:rgba(248,113,113,.1);color:#f87171;font-size:.7rem;cursor:pointer;margin:1px">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  const pager = $('poPager');
  if (pager) {
    if (totalPages <= 1) {
      pager.innerHTML = `<span>ทั้งหมด ${rows.length} รายการ</span>`;
    } else {
      pager.innerHTML = `
        <button class="btn-fx" onclick="_poGoPage(${_poPage-1})" ${_poPage<=1?'disabled':''}
          style="padding:5px 12px;border-radius:7px;border:1px solid var(--bc-card);background:var(--bg-card);color:var(--t1);font-size:.75rem;cursor:pointer;${_poPage<=1?'opacity:.4;cursor:not-allowed':''}">‹ ก่อนหน้า</button>
        <span>หน้า ${_poPage} / ${totalPages} (ทั้งหมด ${rows.length} รายการ)</span>
        <button class="btn-fx" onclick="_poGoPage(${_poPage+1})" ${_poPage>=totalPages?'disabled':''}
          style="padding:5px 12px;border-radius:7px;border:1px solid var(--bc-card);background:var(--bg-card);color:var(--t1);font-size:.75rem;cursor:pointer;${_poPage>=totalPages?'opacity:.4;cursor:not-allowed':''}">ถัดไป ›</button>
      `;
    }
  }
}
function _poGoPage(p) { _poPage = p; renderPOTable(); }

// ── จัดการรายการสินค้าในฟอร์ม ──
function _poAddItemRow() {
  _poItems.push({ name:'', spec:'', qty:'', unit:'', unitPrice:'' });
  _poRenderItemsEditor();
}
function _poRemoveItemRow(idx) {
  _poItems.splice(idx, 1);
  _poRenderItemsEditor();
  _poRecalcTotals();
}
function _poItemChanged(idx, field, value) {
  if (!_poItems[idx]) return;
  _poItems[idx][field] = value;
  if (field === 'qty' || field === 'unitPrice') {
    const qty = parseFloat(_poItems[idx].qty) || 0;
    const price = parseFloat(_poItems[idx].unitPrice) || 0;
    const lineEl = $('poItemTotal_' + idx);
    if (lineEl) lineEl.textContent = (qty*price).toLocaleString('th-TH',{minimumFractionDigits:2});
    _poRecalcTotals();
  }
}
function _poRenderItemsEditor() {
  const wrap = $('poItemsBody');
  if (!wrap) return;
  if (_poItems.length === 0) {
    wrap.innerHTML = `<tr><td colspan="8" style="padding:14px;text-align:center;color:var(--t3);font-size:.78rem">ยังไม่มีรายการ — กด "เพิ่มรายการ"</td></tr>`;
    return;
  }
  wrap.innerHTML = _poItems.map((it, idx) => {
    const lineTotal = (parseFloat(it.qty)||0) * (parseFloat(it.unitPrice)||0);
    return `<tr>
      <td style="padding:6px 8px;text-align:center;font-size:.76rem;color:var(--t3)">${idx+1}</td>
      <td style="padding:6px 8px"><input type="text" value="${(it.name||'').replace(/"/g,'&quot;')}" oninput="_poItemChanged(${idx},'name',this.value)"
        style="width:100%;box-sizing:border-box;padding:5px 7px;border-radius:6px;border:1px solid var(--bc-input);background:var(--bg-input);color:var(--t1);font-size:.78rem;font-family:Sarabun,sans-serif"></td>
      <td style="padding:6px 8px"><input type="text" value="${(it.spec||'').replace(/"/g,'&quot;')}" oninput="_poItemChanged(${idx},'spec',this.value)"
        style="width:100%;box-sizing:border-box;padding:5px 7px;border-radius:6px;border:1px solid var(--bc-input);background:var(--bg-input);color:var(--t1);font-size:.78rem;font-family:Sarabun,sans-serif"></td>
      <td style="padding:6px 8px"><input type="number" value="${it.qty||''}" oninput="_poItemChanged(${idx},'qty',this.value)"
        style="width:100%;box-sizing:border-box;padding:5px 7px;border-radius:6px;border:1px solid var(--bc-input);background:var(--bg-input);color:var(--t1);font-size:.78rem;text-align:center;font-family:Sarabun,sans-serif"></td>
      <td style="padding:6px 8px"><input type="text" value="${(it.unit||'').replace(/"/g,'&quot;')}" oninput="_poItemChanged(${idx},'unit',this.value)"
        style="width:100%;box-sizing:border-box;padding:5px 7px;border-radius:6px;border:1px solid var(--bc-input);background:var(--bg-input);color:var(--t1);font-size:.78rem;text-align:center;font-family:Sarabun,sans-serif"></td>
      <td style="padding:6px 8px"><input type="number" value="${it.unitPrice||''}" oninput="_poItemChanged(${idx},'unitPrice',this.value)"
        style="width:100%;box-sizing:border-box;padding:5px 7px;border-radius:6px;border:1px solid var(--bc-input);background:var(--bg-input);color:var(--t1);font-size:.78rem;text-align:right;font-family:Sarabun,sans-serif"></td>
      <td style="padding:6px 8px;text-align:right;font-size:.78rem;font-weight:600;color:var(--c1);white-space:nowrap" id="poItemTotal_${idx}">${lineTotal.toLocaleString('th-TH',{minimumFractionDigits:2})}</td>
      <td style="padding:6px 8px;text-align:center">
        <button class="btn-fx" onclick="_poRemoveItemRow(${idx})" style="border:none;background:none;color:#f87171;cursor:pointer;font-size:.9rem">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}
function _poRecalcTotals() {
  const subtotal = _poItems.reduce((s,it) => s + (parseFloat(it.qty)||0)*(parseFloat(it.unitPrice)||0), 0);
  const vat = subtotal * 0.07;
  const total = subtotal + vat;
  if ($('po_subtotal')) $('po_subtotal').textContent = subtotal.toLocaleString('th-TH',{minimumFractionDigits:2});
  if ($('po_vat'))      $('po_vat').textContent      = vat.toLocaleString('th-TH',{minimumFractionDigits:2});
  if ($('po_total'))    $('po_total').textContent    = total.toLocaleString('th-TH',{minimumFractionDigits:2});
  return { subtotal, vat, total };
}

// ── สร้างใบใหม่ / เคลียร์ฟอร์ม ──
async function _poNewForm() {
  _poEditingNo = null;
  _poItems = [];
  $('po_poNo').value = 'กำลังสร้างเลขที่...';
  $('po_issueDate').value = _todayStr();
  $('po_wantDate').value = '';
  $('po_supplier').value = '';
  $('po_refOrders').value = '';
  $('po_payTerm').value = '';
  $('po_deliverTerm').value = '';
  $('po_status').value = 'ร่าง';
  $('po_note').value = '';
  _poRenderItemsEditor();
  _poRecalcTotals();
  $('po_formTitle').textContent = '🧾 สร้างใบสั่งซื้อใหม่';
  $('po_saveBtn').textContent = '💾 บันทึกใบสั่งซื้อ';
  if (SCRIPT_URL) {
    try {
      const res = await fetch(SCRIPT_URL + '?action=getNextPONo', {mode:'cors'});
      const data = await res.json();
      $('po_poNo').value = data.nextPO || '';
    } catch (err) {
      $('po_poNo').value = '';
    }
  } else {
    $('po_poNo').value = '';
  }
}

// ── โหลด PO มาแก้ไข ──
function _poEdit(poNo) {
  const r = _poCache.find(row => String(row[PO_HEADER_COLS.poNo]) === String(poNo));
  if (!r) return;
  _poEditingNo = poNo;
  $('po_poNo').value = poNo;
  $('po_issueDate').value = _ordDateToInput(r[PO_HEADER_COLS.issueDate]);
  $('po_wantDate').value  = _ordDateToInput(r[PO_HEADER_COLS.wantDate]);
  $('po_supplier').value  = r[PO_HEADER_COLS.supplierCode] || '';
  $('po_refOrders').value = r[PO_HEADER_COLS.refOrders] || '';
  $('po_payTerm').value   = r[PO_HEADER_COLS.payTerm] || '';
  $('po_deliverTerm').value = r[PO_HEADER_COLS.deliverTerm] || '';
  $('po_status').value    = r[PO_HEADER_COLS.status] || 'ร่าง';
  $('po_createdBy').value = r[PO_HEADER_COLS.createdBy] || '';
  $('po_note').value      = r[PO_HEADER_COLS.note] || '';

  const items = _poItemsCache[poNo] || [];
  _poItems = items.map(it => ({
    name: it[PO_ITEM_COLS.name] || '',
    spec: it[PO_ITEM_COLS.spec] || '',
    qty:  it[PO_ITEM_COLS.qty] || '',
    unit: it[PO_ITEM_COLS.unit] || '',
    unitPrice: it[PO_ITEM_COLS.unitPrice] || '',
  }));
  _poRenderItemsEditor();
  _poRecalcTotals();
  $('po_formTitle').textContent = `✏️ แก้ไขใบสั่งซื้อ ${poNo}`;
  $('po_saveBtn').textContent = '💾 บันทึกการแก้ไข';
  document.getElementById('tab-po')?.scrollIntoView?.({behavior:'smooth', block:'start'});
}

// ── บันทึก PO ──
async function _poSave() {
  const poNo = String($('po_poNo').value || '').trim();
  if (!poNo || poNo === 'กำลังสร้างเลขที่...') {
    Swal.fire({icon:'warning', title:'ยังไม่ได้เลขที่ PO', text:'กรุณารอสักครู่หรือกด "ใบใหม่" อีกครั้ง', toast:true, position:'top-end', showConfirmButton:false, timer:2200});
    return;
  }
  if (!$('po_supplier').value) {
    Swal.fire({icon:'warning', title:'กรุณาเลือก Supplier', toast:true, position:'top-end', showConfirmButton:false, timer:2200});
    return;
  }
  if (_poItems.length === 0) {
    Swal.fire({icon:'warning', title:'กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ', toast:true, position:'top-end', showConfirmButton:false, timer:2200});
    return;
  }
  const { subtotal, vat, total } = _poRecalcTotals();
  const header = [
    poNo,
    _ordDateToSheet($('po_issueDate').value || _todayStr()),
    _ordDateToSheet($('po_wantDate').value || ''),
    $('po_supplier').value,
    $('po_refOrders').value || '',
    $('po_payTerm').value || '',
    $('po_deliverTerm').value || '',
    subtotal, vat, total,
    $('po_status').value || 'ร่าง',
    $('po_createdBy').value || '',
    $('po_note').value || '',
    _ordDateToSheet(_todayStr()),
  ];
  const items = _poItems.map((it, idx) => [
    poNo, idx+1, it.name||'', it.spec||'', parseFloat(it.qty)||0, it.unit||'', parseFloat(it.unitPrice)||0,
    (parseFloat(it.qty)||0) * (parseFloat(it.unitPrice)||0)
  ]);

  const btn = $('po_saveBtn');
  const btnOldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ กำลังบันทึก...'; }
  Swal.fire({
    title: 'กำลังบันทึกใบสั่งซื้อ...', allowOutsideClick:false, allowEscapeKey:false,
    background:'#0d1b2a', color:'#cce4ff',
    didOpen: () => Swal.showLoading(),
  });
  try {
    await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'savePurchaseOrder', poNo, header, items }) });
    await fetchPurchaseOrders();
    _poEditingNo = poNo;
    $('po_formTitle').textContent = `✏️ แก้ไขใบสั่งซื้อ ${poNo}`;
    if (btn) btn.textContent = '💾 บันทึกการแก้ไข';
    Swal.fire({icon:'success', title:'บันทึกใบสั่งซื้อแล้ว ✅',
      html:`เลขที่ PO: <b>${poNo}</b>`,
      background:'#0d1b2a', color:'#cce4ff',
      confirmButtonColor:'#6366f1', timer:1800, showConfirmButton:false});
  } catch (err) {
    if (btn) btn.textContent = btnOldText;
    Swal.fire({icon:'error', title:'บันทึกไม่สำเร็จ', text:String(err.message||err),
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1'});
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── ลบ PO ──
async function _poDelete(poNo) {
  const ok = await Swal.fire({
    icon:'warning', title:'ลบใบสั่งซื้อนี้?', text:poNo,
    showCancelButton:true, confirmButtonText:'ลบ', cancelButtonText:'ยกเลิก',
    confirmButtonColor:'#ef4444', background:'var(--bg-deep)', color:'var(--t1)'
  });
  if (!ok.isConfirmed) return;
  Swal.fire({
    title: 'กำลังลบใบสั่งซื้อ...', allowOutsideClick:false, allowEscapeKey:false,
    background:'#0d1b2a', color:'#cce4ff',
    didOpen: () => Swal.showLoading(),
  });
  try {
    await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'deletePurchaseOrder', poNo }) });
    await fetchPurchaseOrders();
    Swal.fire({icon:'success', title:'ลบแล้ว ✅', html:`เลขที่ PO: <b>${poNo}</b>`,
      background:'#0d1b2a', color:'#cce4ff',
      confirmButtonColor:'#6366f1', timer:1500, showConfirmButton:false});
    if (_poEditingNo === poNo) _poNewForm();
  } catch (err) {
    Swal.fire({icon:'error', title:'ลบไม่สำเร็จ', text:String(err.message||err),
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1'});
  }
}

// ── พิมพ์ใบสั่งซื้อ A4 ──
function _poPrint(poNo) {
  const r = _poCache.find(row => String(row[PO_HEADER_COLS.poNo]) === String(poNo));
  if (!r) return;
  const items = _poItemsCache[poNo] || [];
  const supplier = _supplierCache.find(s => s.code === r[PO_HEADER_COLS.supplierCode]) || {};
  const fmt = n => (parseFloat(n)||0).toLocaleString('th-TH',{minimumFractionDigits:2});
  const subtotal = parseFloat(r[PO_HEADER_COLS.subtotal]) || 0;
  const vat = parseFloat(r[PO_HEADER_COLS.vat]) || 0;
  const total = parseFloat(r[PO_HEADER_COLS.total]) || 0;

  const itemRows = items.map(it => `
    <tr>
      <td class="c">${it[PO_ITEM_COLS.seq]}</td>
      <td>${it[PO_ITEM_COLS.name]||''}</td>
      <td>${it[PO_ITEM_COLS.spec]||''}</td>
      <td class="c">${it[PO_ITEM_COLS.qty]||''}</td>
      <td class="c">${it[PO_ITEM_COLS.unit]||''}</td>
      <td class="r">${fmt(it[PO_ITEM_COLS.unitPrice])}</td>
      <td class="r">${fmt(it[PO_ITEM_COLS.lineTotal])}</td>
    </tr>`).join('');

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`
  <html><head><title>ใบสั่งซื้อ ${poNo}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body{font-family:'Sarabun',Tahoma,sans-serif;color:#1e293b;font-size:12px;margin:0}
    .wrap{display:flex;gap:16px;align-items:flex-start}
    .main{flex:1;min-width:0}
    .sidebar{width:190px;flex-shrink:0;background:#16335c;color:#dce8ff;border-radius:14px;padding:14px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;padding-bottom:12px;border-bottom:2px solid #16335c}
    .brand{display:flex;gap:10px}
    .brand img{width:54px;height:auto}
    .brand .name-th{font-weight:700;font-size:14px;color:#16335c}
    .brand .name-en{font-size:10.5px;color:#2563eb;font-weight:700;margin:2px 0 4px}
    .brand .info div{font-size:10px;color:#475569;margin-top:2px}
    .title{text-align:right}
    .title h1{margin:0;font-size:24px;color:#16335c;font-weight:800}
    .title .en{color:#2563eb;font-weight:700;font-size:12px;letter-spacing:2px}
    .boxes{display:flex;gap:10px;margin-bottom:12px}
    .box{flex:1;border:1px solid #dbe3ee;border-radius:10px;padding:8px 10px}
    .box h3{margin:0 0 5px;font-size:11px;color:#16335c}
    .box .ln{font-size:10.5px;color:#475569;margin-top:2px}
    table{width:100%;border-collapse:collapse;margin-bottom:10px}
    th{background:#16335c;color:#fff;font-size:10.5px;padding:7px 5px;font-weight:600}
    td{border-bottom:1px solid #e5e9f0;padding:6px 5px;font-size:10.5px}
    td.c,th.c{text-align:center}
    td.r,th.r{text-align:right}
    .totals{display:flex;justify-content:flex-end;margin-bottom:12px}
    .totals table{width:230px}
    .totals td{border:none;padding:3px 6px;font-size:11px}
    .totals tr.grand td{font-weight:700;font-size:12.5px;color:#16335c;border-top:2px solid #16335c}
    .note{border:1px solid #dbe3ee;border-radius:10px;padding:8px 10px;margin-bottom:36px;font-size:10.5px;min-height:30px}
    .sign{display:flex;justify-content:space-around;text-align:center;margin-bottom:14px}
    .sign .s{width:180px}
    .sign .ln{border-top:1px solid #94a3b8;margin-top:30px;padding-top:4px;font-size:10.5px}
    .sign .lab{display:inline-block;background:#eef2ff;color:#16335c;border-radius:14px;padding:2px 12px;font-size:10px;font-weight:600;margin-bottom:4px}
    .footer{text-align:center;color:#94a3b8;font-size:10px;margin-top:6px}
    .sb-pono{background:rgba(255,255,255,.10);border-radius:10px;padding:9px 10px;margin-bottom:10px}
    .sb-pono .lab{font-size:9.5px;opacity:.8}
    .sb-pono .val{font-size:15px;font-weight:700;color:#fff;margin-top:2px}
    .sb-row{margin-bottom:9px}
    .sb-row .lab{font-size:9.5px;opacity:.75}
    .sb-row .val{font-size:11px;font-weight:600;color:#fff;margin-top:2px;word-break:break-word}
    .sb-hr{border:none;border-top:1px solid rgba(255,255,255,.18);margin:10px 0}
  </style></head><body>
  <div class="wrap">
    <div class="main">
      <div class="header">
        <div class="brand">
          <img src="${PTS_LOGO_B64}">
          <div>
            <div class="name-th">${PTS_COMPANY.nameTh}</div>
            <div class="name-en">${PTS_COMPANY.nameEn}</div>
            <div class="info">
              <div>📍 ${PTS_COMPANY.address}</div>
              <div>📞 ${PTS_COMPANY.phone} &nbsp; ✉️ ${PTS_COMPANY.email}</div>
              <div>เลขประจำตัวผู้เสียภาษี: ${PTS_COMPANY.taxId}</div>
            </div>
          </div>
        </div>
        <div class="title">
          <h1>ใบสั่งซื้อ</h1>
          <div class="en">PURCHASE ORDER</div>
        </div>
      </div>

      <div class="boxes">
        <div class="box">
          <h3>👤 ผู้จำหน่าย (Supplier)</h3>
          <div class="ln"><b>${supplier.name||r[PO_HEADER_COLS.supplierCode]||'—'}</b></div>
          <div class="ln">${supplier.address||''}</div>
          <div class="ln">เลขประจำตัวผู้เสียภาษี: ${supplier.taxId||'—'}</div>
          <div class="ln">ติดต่อ: ${supplier.contact||'—'}</div>
        </div>
        <div class="box">
          <h3>📋 เงื่อนไข (Terms)</h3>
          <div class="ln">การชำระเงิน : ${r[PO_HEADER_COLS.payTerm]||'—'}</div>
          <div class="ln">การส่งมอบ : ${r[PO_HEADER_COLS.deliverTerm]||'—'}</div>
          <div class="ln">อ้างอิง No.PO/Quo : ${r[PO_HEADER_COLS.refOrders]||'—'}</div>
          <div class="ln">สถานะ : ${r[PO_HEADER_COLS.status]||'—'}</div>
        </div>
      </div>

      <table>
        <thead><tr>
          <th class="c" style="width:5%">ลำดับ<br>No.</th>
          <th>รายการ<br>Description</th>
          <th style="width:14%">สเปค<br>Spec.</th>
          <th class="c" style="width:8%">จำนวน<br>QTY</th>
          <th class="c" style="width:7%">หน่วย<br>Unit</th>
          <th class="r" style="width:14%">ราคา/หน่วย<br>Unit Price (THB)</th>
          <th class="r" style="width:14%">จำนวนเงิน<br>Amount (THB)</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div class="totals">
        <table>
          <tr><td>รวมเป็นเงิน (Total)</td><td class="r">${fmt(subtotal)} บาท</td></tr>
          <tr><td>ภาษีมูลค่าเพิ่ม 7% (VAT 7%)</td><td class="r">${fmt(vat)} บาท</td></tr>
          <tr class="grand"><td>รวมสุทธิ (Grand Total)</td><td class="r">${fmt(total)} บาท</td></tr>
        </table>
      </div>

      <div class="note">
        <b>หมายเหตุ (Note)</b><br>${r[PO_HEADER_COLS.note] ? r[PO_HEADER_COLS.note] : '—'}
      </div>

      <div class="sign">
        <div class="s">
          <div class="lab">ผู้จัดทำ (Prepared by)</div>
          <div class="ln">${r[PO_HEADER_COLS.createdBy]||''}<br>${r[PO_HEADER_COLS.issueDate]||''}</div>
        </div>
        <div class="s">
          <div class="lab">ผู้อนุมัติ (Approved by)</div>
          <div class="ln">&nbsp;</div>
        </div>
      </div>

      <div class="footer">ขอบคุณที่ไว้วางใจใช้บริการของเรา</div>
    </div>

    <div class="sidebar">
      <div class="sb-pono">
        <div class="lab">เลขที่ (PO No.)</div>
        <div class="val">${poNo}</div>
      </div>
      <div class="sb-row"><div class="lab">วันที่สั่งซื้อ (Order Date)</div><div class="val">${r[PO_HEADER_COLS.issueDate]||'—'}</div></div>
      <div class="sb-row"><div class="lab">วันที่ต้องการรับ (Required Date)</div><div class="val">${r[PO_HEADER_COLS.wantDate]||'—'}</div></div>
      <hr class="sb-hr">
      <div class="sb-row"><div class="lab">🚚 การจัดส่ง (Delivery)</div><div class="val">${r[PO_HEADER_COLS.deliverTerm]||'—'}</div></div>
      <div class="sb-row"><div class="lab">💳 การชำระเงิน (Payment)</div><div class="val">${r[PO_HEADER_COLS.payTerm]||'—'}</div></div>
      <div class="sb-row"><div class="lab">💱 สกุลเงิน (Currency)</div><div class="val">THB</div></div>
      <div class="sb-row"><div class="lab">📄 อ้างอิง (Reference)</div><div class="val">${r[PO_HEADER_COLS.refOrders]||'—'}</div></div>
      <hr class="sb-hr">
      <div class="sb-row"><div class="lab">👤 ผู้ติดต่อ (Contact)</div><div class="val">${r[PO_HEADER_COLS.createdBy]||'—'}</div></div>
    </div>
  </div>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
