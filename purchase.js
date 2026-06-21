// ════════════════════════════════════════════════════════════
//  purchase.js — ระบบใบสั่งซื้อ (Purchase Order)
//  เชื่อมกับ Order ผ่านฟิลด์ "อ้างอิง No.PO/No.Quo"
// ════════════════════════════════════════════════════════════

const PO_HEADER_COLS = {
  poNo:0, issueDate:1, wantDate:2, supplierCode:3, refOrders:4,
  payTerm:5, deliverTerm:6, subtotal:7, vat:8, total:9,
  status:10, createdBy:11, note:12, update:13
};
const PO_ITEM_COLS = { poNo:0, seq:1, name:2, spec:3, qty:4, unit:5, unitPrice:6, lineTotal:7, imageUrl:8 };

let _poCache = [];          // header rows
let _poItemsCache = {};     // poNo -> items rows
let _supplierCache = [];
let _poSupplierItemsCache = []; // [{supplierCode, name, spec, unit, unitPrice, imageUrl, updatedAt}]
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
    if (typeof _platingRefreshSupplierSelect === 'function') _platingRefreshSupplierSelect();
    if (typeof _platingRefreshDetailSupplierSelect === 'function') _platingRefreshDetailSupplierSelect();
    renderSupplierTable();
  } catch (err) { console.error('fetchSuppliers', err); }
}

// ════════════════════════════════════════════════════════════
//  จัดการ Supplier (CRUD) — แท็บ "Supplier"
// ════════════════════════════════════════════════════════════
let _supplierEditIdx = -1;

function _supplierInput(id, val, placeholder) {
  return `<input id="${id}" value="${(val||'').toString().replace(/"/g,'&quot;')}" placeholder="${placeholder||''}"
    style="width:100%;box-sizing:border-box;padding:5px 8px;border-radius:6px;border:1px solid rgba(99,102,241,.35);
    background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.8rem">`;
}

function supplierAddRow() {
  _supplierCache.push({ code:'', name:'', address:'', taxId:'', contact:'', note:'', leadTimeDays:0, matCodes:'' });
  _supplierEditIdx = _supplierCache.length - 1;
  renderSupplierTable();
}
function supplierEditRow(i) { _supplierEditIdx = i; renderSupplierTable(); }
function supplierCancelEdit(i) {
  if (!_supplierCache[i].code && !_supplierCache[i].name) _supplierCache.splice(i, 1);
  _supplierEditIdx = -1;
  renderSupplierTable();
}

async function supplierSaveRow(i) {
  const g = id => (document.getElementById(id)?.value || '').trim();
  const data = {
    code:    _supplierCache[i].code || '',
    name:    g('sup_name_'+i),
    address: g('sup_addr_'+i),
    taxId:   g('sup_taxid_'+i),
    contact: g('sup_contact_'+i),
    note:         g('sup_note_'+i),
    leadTimeDays: parseInt(g('sup_lead_'+i)) || 0,
    matCodes:     g('sup_matcodes_'+i),
  };
  if (!data.name) { Swal.fire({icon:'warning',title:'กรุณาใส่ชื่อ Supplier',confirmButtonColor:'#6366f1'}); return; }
  if (!SCRIPT_URL) { Swal.fire({icon:'info',title:'ยังไม่ตั้งค่า URL',confirmButtonColor:'#6366f1'}); return; }
  try {
    const res = await fetch(SCRIPT_URL, {
      method:'POST', mode:'cors',
      headers:{'Content-Type':'text/plain'},
      body: JSON.stringify(Object.assign({ action:'saveSupplier' }, data))
    });
    const out = await res.json();
    if (!out || out.status !== 'ok') throw new Error((out && out.message) || 'save failed');
    _supplierEditIdx = -1;
    await fetchSuppliers();
    Swal.fire({icon:'success',title:'บันทึก Supplier แล้ว ✅',timer:1200,toast:true,position:'top-end',showConfirmButton:false});
  } catch (e) {
    Swal.fire({icon:'error',title:'บันทึกไม่สำเร็จ',text:e.message,confirmButtonColor:'#6366f1'});
  }
}

async function supplierDeleteRow(i) {
  const s = _supplierCache[i];
  if (!s) return;
  Swal.fire({
    icon:'warning', title:`ลบ Supplier "${s.name}"?`,
    html:`<div style="font-size:.83rem;color:#8b8aaa">ไม่สามารถย้อนกลับได้</div>`,
    confirmButtonText:'🗑 ลบเลย', confirmButtonColor:'#c0464a',
    showCancelButton:true, cancelButtonText:'ยกเลิก', cancelButtonColor:'#374151',
  }).then(async r => {
    if (!r.isConfirmed) return;
    if (!s.code) { _supplierCache.splice(i,1); renderSupplierTable(); return; }
    try {
      const res = await fetch(SCRIPT_URL, {
        method:'POST', mode:'cors',
        headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({ action:'deleteSupplier', code: s.code })
      });
      const out = await res.json();
      if (!out || out.status !== 'ok') throw new Error((out && out.message) || 'delete failed');
      await fetchSuppliers();
      Swal.fire({icon:'success',title:'ลบแล้ว',timer:1200,toast:true,position:'top-end',showConfirmButton:false});
    } catch (e) {
      Swal.fire({icon:'error',title:'ลบไม่สำเร็จ',text:e.message,confirmButtonColor:'#6366f1'});
    }
  });
}

function renderSupplierTable() {
  const wrap = $('supplierTableWrap');
  if (!wrap) return;
  if (!_supplierCache.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:24px;color:var(--t3);font-size:.82rem">
      ยังไม่มี Supplier — กด ➕ เพิ่ม Supplier</div>`;
    return;
  }
  const rows = _supplierCache.map((s, i) => {
    if (i === _supplierEditIdx) {
      const _inpStyle = 'width:100%;box-sizing:border-box;padding:5px 8px;border-radius:6px;border:1px solid rgba(99,102,241,.35);background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.8rem';
      return `<tr style="background:rgba(99,102,241,.08);vertical-align:top">
        <td style="padding:4px 6px">${_supplierInput('sup_name_'+i, s.name, 'ชื่อบริษัท/Supplier')}</td>
        <td style="padding:4px 6px">${_supplierInput('sup_taxid_'+i, s.taxId, 'เลขผู้เสียภาษี 13 หลัก')}</td>
        <td style="padding:4px 6px">${_supplierInput('sup_addr_'+i, s.address, 'ที่อยู่')}</td>
        <td style="padding:4px 6px">${_supplierInput('sup_contact_'+i, s.contact, 'ผู้ติดต่อ/เบอร์โทร')}</td>
        <td style="padding:4px 6px">${_supplierInput('sup_note_'+i, s.note, 'หมายเหตุ')}</td>
        <td style="padding:4px 6px">
          <input id="sup_lead_${i}" type="number" min="0" value="${s.leadTimeDays||0}" placeholder="วัน"
            style="${_inpStyle}">
        </td>
        <td style="padding:4px 6px;white-space:nowrap;vertical-align:middle">
          <button onclick="guardClick(this, () => supplierSaveRow(${i}))"
            style="padding:5px 10px;border-radius:6px;border:1px solid rgba(52,211,153,.4);
            background:rgba(52,211,153,.12);color:#6ecfad;font-family:Sarabun,sans-serif;
            font-size:.78rem;cursor:pointer">💾</button>
          <button onclick="supplierCancelEdit(${i})"
            style="padding:5px 10px;border-radius:6px;border:1px solid rgba(239,68,68,.4);
            background:rgba(239,68,68,.1);color:#f87171;font-family:Sarabun,sans-serif;
            font-size:.78rem;cursor:pointer;margin-left:4px">✕</button>
        </td>
      </tr>
      <tr style="background:rgba(99,102,241,.04)">
        <td colspan="7" style="padding:2px 6px 8px">
          <div style="font-size:.68rem;color:var(--t3);margin-bottom:2px">📦 MAT Codes ที่จัดหา (คั่นด้วยจุลภาค)</div>
          ${_supplierInput('sup_matcodes_'+i, s.matCodes||'', 'เช่น SPCC-0.6, SPCC-1.0, SUS304-1.0')}
        </td>
      </tr>`;
    }
    return `<tr style="${i%2===0?'background:var(--c1-05)':''}">
      <td style="padding:7px 10px;font-weight:700;color:var(--c1)">${s.name||'—'}</td>
      <td style="padding:7px 10px;font-size:.78rem;color:var(--t3)">${s.taxId||'—'}</td>
      <td style="padding:7px 10px;font-size:.78rem;color:var(--t3)">${s.address||'—'}</td>
      <td style="padding:7px 10px;font-size:.78rem;color:var(--t3)">${s.contact||'—'}</td>
      <td style="padding:7px 10px;font-size:.78rem;color:var(--t3)">${s.note||'—'}</td>
      <td style="padding:7px 10px;font-size:.78rem;color:var(--t2);text-align:center">${s.leadTimeDays ? s.leadTimeDays+' วัน' : '—'}</td>
      <td style="padding:7px 10px;white-space:nowrap">
        <button onclick="supplierEditRow(${i})"
          style="padding:4px 8px;border-radius:6px;border:1px solid rgba(99,102,241,.35);
          background:rgba(99,102,241,.08);color:#818cf8;cursor:pointer;font-size:.85rem">✏️</button>
        <button onclick="supplierDeleteRow(${i})"
          style="padding:4px 8px;border-radius:6px;border:1px solid rgba(239,68,68,.35);
          background:rgba(239,68,68,.08);color:#f87171;cursor:pointer;font-size:.85rem;margin-left:4px">🗑</button>
      </td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:.82rem">
      <thead>
        <tr style="border-bottom:1px solid rgba(255,255,255,.1)">
          <th style="padding:7px 10px;text-align:left">ชื่อ/บริษัท</th>
          <th style="padding:7px 10px;text-align:left">เลขผู้เสียภาษี</th>
          <th style="padding:7px 10px;text-align:left">ที่อยู่</th>
          <th style="padding:7px 10px;text-align:left">ผู้ติดต่อ</th>
          <th style="padding:7px 10px;text-align:left">หมายเหตุ</th>
          <th style="padding:7px 10px;text-align:center">Lead Time</th>
          <th style="width:80px"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── โหลดคลังรายการสินค้าที่เคยสั่งซื้อ แยกตาม supplier ──
async function fetchPOSupplierItems() {
  if (!SCRIPT_URL) return;
  try {
    const res = await fetch(SCRIPT_URL + '?action=getPOSupplierItems', {mode:'cors'});
    const data = await res.json();
    _poSupplierItemsCache = data.items || [];
    _poRenderSupplierItemChips();
  } catch (err) { console.error('fetchPOSupplierItems', err); }
}

// ── โหลดใบสั่งซื้อทั้งหมด ──
async function fetchPurchaseOrders() {
  const tbody = $('poBody');
  if (!tbody) return;
  if (!SCRIPT_URL) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:30px;text-align:center;color:var(--t3);font-size:.8rem">⚠️ ยังไม่ได้ตั้งค่า Script URL</td></tr>`;
    return;
  }
  tbody.innerHTML = `<tr><td colspan="7" style="padding:30px;text-align:center;color:var(--t3);font-size:.8rem"><span class="spin-ico">↻</span> กำลังโหลด…</td></tr>`;
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
    'ส่งเอกสารแล้ว': {bg:'rgba(56,189,248,.15)',  fg:'#0ea5e9', bd:'rgba(56,189,248,.35)'},
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
    tbody.innerHTML = `<tr><td colspan="8" style="padding:30px;text-align:center;color:var(--t3);font-size:.8rem">ไม่มีใบสั่งซื้อ</td></tr>`;
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
    const items  = _poItemsCache[poNo] || [];
    const itemsSummary = items.length
      ? items.map(it => it[PO_ITEM_COLS.name]||'').filter(Boolean).join(', ')
      : '—';
    return `<tr style="${rowBg};border-bottom:1px solid var(--bc-div)">
      <td style="padding:8px 10px;font-size:.78rem;font-weight:600;color:var(--c1);white-space:nowrap">${poNo}</td>
      <td style="padding:8px 10px;font-size:.72rem;color:var(--t3);white-space:nowrap">${r[PO_HEADER_COLS.issueDate]||'—'}</td>
      <td style="padding:8px 10px;font-size:.78rem;color:var(--t1)">${_poSupplierName(r[PO_HEADER_COLS.supplierCode])}</td>
      <td style="padding:8px 10px;font-size:.72rem;color:var(--t2);max-width:240px" title="${itemsSummary.replace(/"/g,'&quot;')}">
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${itemsSummary}</div>
      </td>
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
  _poItems.push({ name:'', spec:'', qty:'', unit:'ชิ้น', unitPrice:'', imageUrl:'' });
  _poRenderItemsEditor();
}
// ── แสดงชิพรายการเดิมของ supplier ที่เลือก (คลิกเพื่อเพิ่มรายการแบบกรอกอัตโนมัติ) ──
function _poRenderSupplierItemChips() {
  const wrap = $('poSupplierItemChips');
  if (!wrap) return;
  const code = $('po_supplier') ? $('po_supplier').value : '';
  const items = _poSupplierItemsCache.filter(it => it.supplierCode === code);
  if (!code || items.length === 0) {
    wrap.innerHTML = '';
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  const chipsHtml = items.map((it, idx) => `
    <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 6px 4px 10px;border-radius:999px;
      border:1px solid rgba(99,102,241,.35);background:rgba(99,102,241,.1);margin:2px">
      <button type="button" class="btn-fx" onclick="_poAddItemFromChip(${idx})"
        style="border:none;background:none;color:#818cf8;font-family:'Sarabun',sans-serif;font-size:.74rem;cursor:pointer;padding:0">
        ${it.name}${it.unitPrice ? ' · ฿' + parseFloat(it.unitPrice).toLocaleString('th-TH',{minimumFractionDigits:2}) : ''}
      </button>
      <button type="button" onclick="_poDeleteSupplierItemChip(${idx})" title="ลบรายการนี้จากคลัง"
        style="border:none;background:none;color:#f87171;font-size:.72rem;cursor:pointer;padding:0;line-height:1;width:14px;height:14px;display:flex;align-items:center;justify-content:center">✕</button>
    </span>`).join('');
  wrap.innerHTML = `<div style="font-size:.74rem;color:var(--t3);margin-bottom:4px">รายการที่เคยสั่งจาก Supplier นี้ (คลิกเพื่อเพิ่ม, กด ✕ เพื่อลบออกจากคลัง):</div>
    <div style="display:flex;flex-wrap:wrap;max-height:96px;overflow-y:auto;padding-right:4px">${chipsHtml}</div>`;
}
// ── ลบรายการออกจากคลังของ supplier (ไม่กระทบ PO ที่บันทึกไว้แล้ว) ──
async function _poDeleteSupplierItemChip(idx) {
  const code = $('po_supplier') ? $('po_supplier').value : '';
  const items = _poSupplierItemsCache.filter(it => it.supplierCode === code);
  const it = items[idx];
  if (!it) return;
  const ok = await Swal.fire({
    icon:'warning', title:'ลบรายการนี้จากคลังของ Supplier?', text: it.name,
    showCancelButton:true, confirmButtonText:'ลบ', cancelButtonText:'ยกเลิก',
    confirmButtonColor:'#ef4444', background:'var(--bg-deep)', color:'var(--t1)'
  });
  if (!ok.isConfirmed) return;
  _poSupplierItemsCache = _poSupplierItemsCache.filter(x => !(x.supplierCode === it.supplierCode && x.name === it.name));
  _poRenderSupplierItemChips();
  if (!SCRIPT_URL) return;
  try {
    await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'deletePOSupplierItem', supplierCode: it.supplierCode, name: it.name }) });
  } catch (err) { console.error('_poDeleteSupplierItemChip', err); }
}
// ── คลิกชิพ: เพิ่มรายการใหม่พร้อมข้อมูลจากคลังของ supplier ──
function _poAddItemFromChip(idx) {
  const code = $('po_supplier') ? $('po_supplier').value : '';
  const items = _poSupplierItemsCache.filter(it => it.supplierCode === code);
  const it = items[idx];
  if (!it) return;
  _poItems.push({
    name: it.name || '', spec: it.spec || '', qty: '',
    unit: it.unit || 'ชิ้น', unitPrice: (it.unitPrice !== '' && it.unitPrice != null) ? it.unitPrice : '',
    imageUrl: it.imageUrl || ''
  });
  _poRenderItemsEditor();
  _poRecalcTotals();
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
// ── อัปโหลดรูปของแต่ละรายการขึ้น Drive ──
async function _poUploadItemImage(idx, input) {
  const file = input.files[0];
  if (!file) return;
  if (!_poItems[idx]) return;
  if (!SCRIPT_URL) {
    Swal.fire({icon:'info', title:'ยังไม่ตั้งค่า URL', text:'กรุณาใส่ Apps Script URL ก่อน', background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1'});
    input.value = '';
    return;
  }
  Swal.fire({title:'กำลังอัปโหลดรูป...', background:'#0d1b2a', color:'#cce4ff', allowOutsideClick:false, didOpen:()=>Swal.showLoading()});
  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const r = e.target.result || '';
        const i = r.indexOf('base64,');
        resolve(i >= 0 ? r.slice(i + 7) : r);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch(SCRIPT_URL, {
      method: 'POST', mode: 'cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'uploadPOItemImage', fileName: file.name, mimeType: file.type, base64 })
    });
    const data = await res.json();
    if (!data || data.status !== 'ok') throw new Error((data && data.message) || 'upload failed');
    _poItems[idx].imageUrl = data.url;
    _poRenderItemsEditor();
    Swal.close();
  } catch (e) {
    Swal.fire({icon:'error', title:'อัปโหลดรูปไม่สำเร็จ', text:String(e.message||e), background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#dc2626'});
  }
  input.value = '';
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
      <td style="padding:6px 8px;text-align:center">
        <input type="file" accept="image/*" id="poItemImgFile_${idx}" style="display:none" onchange="_poUploadItemImage(${idx},this)">
        ${it.imageUrl
          ? `<img src="${it.imageUrl}" onclick="document.getElementById('poItemImgFile_${idx}').click()"
              style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid var(--bc-input);cursor:pointer" title="คลิกเพื่อเปลี่ยนรูป">`
          : `<button type="button" onclick="document.getElementById('poItemImgFile_${idx}').click()"
              style="width:36px;height:36px;border-radius:6px;border:1px dashed var(--bc-input);background:var(--bg-input);color:var(--t3);cursor:pointer;font-size:.9rem" title="เพิ่มรูป">📷</button>`}
      </td>
      <td style="padding:6px 8px"><input type="text" value="${(it.name||'').replace(/"/g,'&quot;')}" oninput="_poItemChanged(${idx},'name',this.value)"
        style="width:100%;box-sizing:border-box;padding:5px 7px;border-radius:6px;border:1px solid var(--bc-input);background:var(--bg-input);color:var(--t1);font-size:.78rem;font-family:Sarabun,sans-serif"></td>
      <td style="padding:6px 8px"><input type="number" value="${it.qty||''}" oninput="_poItemChanged(${idx},'qty',this.value)"
        style="width:100%;box-sizing:border-box;padding:5px 7px;border-radius:6px;border:1px solid var(--bc-input);background:var(--bg-input);color:var(--t1);font-size:.78rem;text-align:center;font-family:Sarabun,sans-serif"></td>
      <td style="padding:6px 8px"><input type="text" list="poUnitOptions" value="${(it.unit||'').replace(/"/g,'&quot;')}" oninput="_poItemChanged(${idx},'unit',this.value)"
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
  _poRenderSupplierItemChips();
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


// ── นำเข้ารายการจากใบขอราคา → ฟอร์ม PO ──────────────────────
async function _poImportFromRFQ() {
  // โหลด RFQ list ถ้ายังไม่มี
  if (!_rfqListCache.length) {
    if (!SCRIPT_URL) {
      Swal.fire({ icon:'warning', title:'ยังไม่ได้ตั้งค่า Script URL', background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1' });
      return;
    }
    Swal.fire({ title:'กำลังโหลดใบขอราคา…', allowOutsideClick:false, showConfirmButton:false,
      background:'#0d1b2a', color:'#cce4ff', didOpen:()=>Swal.showLoading() });
    try {
      const res  = await fetch(SCRIPT_URL + '?action=getRFQList', {mode:'cors'});
      const data = await res.json();
      _rfqListCache = (data.data || []).reverse();
      Swal.close();
    } catch(err) {
      Swal.fire({ icon:'error', title:'โหลดไม่สำเร็จ', text:String(err), background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1' });
      return;
    }
  }

  if (!_rfqListCache.length) {
    Swal.fire({ icon:'info', title:'ยังไม่มีใบขอราคา', text:'กรุณาสร้างใบขอราคาก่อนครับ', background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1' });
    return;
  }

  // helper สร้าง row HTML
  function _rfqPickRowHtml(q, i) {
    const items = Array.isArray(q.items) ? q.items : [];
    return `<tr data-idx="${i}" data-rfqno="${_escH((q.rfqNo||'').toLowerCase())}" data-supplier="${_escH((q.supplier||'').toLowerCase())}"
              onclick="_poPickRFQ(${i})"
              style="cursor:pointer;border-bottom:1px solid rgba(255,255,255,.08);transition:background .15s"
              onmouseover="this.style.background='rgba(99,102,241,.15)'" onmouseout="this.style.background=''">
      <td style="padding:8px 12px;font-weight:600;color:#a78bfa;font-size:.82rem;white-space:nowrap">${_escH(q.rfqNo||'')}</td>
      <td style="padding:8px 12px;color:#94a3b8;font-size:.78rem;white-space:nowrap">${_escH(_rfqThDate(q.date||''))}</td>
      <td style="padding:8px 12px;color:#e2e8f0;font-size:.82rem">${_escH(q.supplier||'—')}</td>
      <td style="padding:8px 12px;text-align:center;color:#94a3b8;font-size:.78rem">${items.length} รายการ</td>
    </tr>`;
  }

  const allRows = _rfqListCache.map((q, i) => _rfqPickRowHtml(q, i)).join('');

  await Swal.fire({
    title: '📨 เลือกใบขอราคา',
    html: `
      <div style="margin-bottom:10px">
        <input id="rfqPickSearch" type="text" placeholder="🔍 ค้นหาเลขที่ / ซัพพลายเออร์…"
          style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:8px;
                 border:1px solid rgba(99,102,241,.4);background:rgba(15,23,42,.8);
                 color:#e2e8f0;font-size:.82rem;font-family:Sarabun,sans-serif;outline:none"
          oninput="_rfqPickFilter(this.value)">
      </div>
      <div style="text-align:left;max-height:320px;overflow-y:auto;border-radius:6px;border:1px solid rgba(99,102,241,.2)">
        <table style="width:100%;border-collapse:collapse">
          <thead style="position:sticky;top:0;z-index:1">
            <tr style="background:#0f1729">
              <th style="padding:7px 12px;font-size:.75rem;color:#a78bfa;text-align:left;border-bottom:1px solid rgba(99,102,241,.3)">เลขที่</th>
              <th style="padding:7px 12px;font-size:.75rem;color:#a78bfa;text-align:left;border-bottom:1px solid rgba(99,102,241,.3)">วันที่</th>
              <th style="padding:7px 12px;font-size:.75rem;color:#a78bfa;text-align:left;border-bottom:1px solid rgba(99,102,241,.3)">ซัพพลายเออร์</th>
              <th style="padding:7px 12px;font-size:.75rem;color:#a78bfa;text-align:center;border-bottom:1px solid rgba(99,102,241,.3)">รายการ</th>
            </tr>
          </thead>
          <tbody id="rfqPickBody">${allRows}</tbody>
        </table>
        <div id="rfqPickEmpty" style="display:none;padding:24px;text-align:center;color:#64748b;font-size:.82rem">ไม่พบรายการที่ตรงกัน</div>
      </div>`,
    background: '#0d1b2a',
    color: '#cce4ff',
    showConfirmButton: false,
    showCloseButton: true,
    width: 640,
    didOpen: () => {
      window._poPickRFQ = (i) => {
        Swal.close();
        setTimeout(() => _poApplyRFQ(i), 100);
      };
      window._rfqPickFilter = (val) => {
        const kw = val.trim().toLowerCase();
        const tbody = document.getElementById('rfqPickBody');
        const empty = document.getElementById('rfqPickEmpty');
        if (!tbody) return;
        let visible = 0;
        tbody.querySelectorAll('tr').forEach(tr => {
          const match = !kw
            || tr.dataset.rfqno.includes(kw)
            || tr.dataset.supplier.includes(kw);
          tr.style.display = match ? '' : 'none';
          if (match) visible++;
        });
        if (empty) empty.style.display = visible ? 'none' : 'block';
      };
      // focus search
      setTimeout(() => {
        const el = document.getElementById('rfqPickSearch');
        if (el) el.focus();
      }, 100);
    }
  });
}

function _poApplyRFQ(i) {
  const q = _rfqListCache[i];
  if (!q) return;
  const items = Array.isArray(q.items) ? q.items : [];

  // ── จับคู่ supplier name → supplier code ──
  const matchedSupplier = _supplierCache.find(s =>
    String(s.name||'').trim().toLowerCase() === String(q.supplier||'').trim().toLowerCase()
  );
  if (matchedSupplier) {
    $('po_supplier').value = matchedSupplier.code;
    _poRenderSupplierItemChips();
  }

  // ── ใส่เลข RFQ ที่ช่อง อ้างอิง ──
  const refEl = $('po_refOrders');
  if (refEl) {
    const existing = refEl.value.trim();
    refEl.value = existing ? existing + ', ' + q.rfqNo : q.rfqNo;
  }

  // ── นำรายการ RFQ ใส่ _poItems ──
  const newRows = items
    .filter(r => String(r.name||'').trim())
    .map(r => ({
      name:      String(r.name||''),
      spec:      String(r.remark||''),
      qty:       String(r.qty||'1'),
      unit:      String(r.unit||'ชิ้น'),
      unitPrice: '',
      imageUrl:  r.img || '',
    }));

  if (newRows.length) {
    _poItems = _poItems.filter(r => r.name.trim()); // ลบแถวว่างออกก่อน
    _poItems = _poItems.concat(newRows);
    _poRenderItemsEditor();
    _poRecalcTotals();
  }

  // scroll ขึ้นไปหัวฟอร์ม
  const title = $('po_formTitle');
  if (title) title.scrollIntoView({ behavior:'smooth', block:'start' });

  Swal.fire({ toast:true, position:'top-end', icon:'success',
    title:`นำเข้า ${newRows.length} รายการจาก ${q.rfqNo} แล้ว`,
    showConfirmButton:false, timer:2000, timerProgressBar:true });
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
    imageUrl: it[PO_ITEM_COLS.imageUrl] || '',
  }));
  _poRenderItemsEditor();
  _poRecalcTotals();
  _poRenderSupplierItemChips();
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
    (parseFloat(it.qty)||0) * (parseFloat(it.unitPrice)||0), it.imageUrl||''
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
    Swal.fire({icon:'success', title:'บันทึกใบสั่งซื้อแล้ว ✅',
      html:`เลขที่ PO: <b>${poNo}</b>`,
      background:'#0d1b2a', color:'#cce4ff',
      confirmButtonColor:'#6366f1', timer:1800, showConfirmButton:false});
    // ── รับวัสดุเข้า Stock (ถ้า stock.js โหลดแล้ว) ──
    if (typeof stockReceiveFromPO === 'function') {
      const poItemsForStock = _poItems
        .filter(it => it.name && parseFloat(it.qty) > 0)
        .map(it => ({
          matCode: it.name.trim(),
          name:    it.spec || '',
          qty:     parseFloat(it.qty) || 0,
          unit:    it.unit || 'แผ่น'
        }))
        .filter(it => {
          // กรองเฉพาะ matCode ที่มีใน _stockRows (เพื่อความแม่นยำ)
          if (typeof _stockRows !== 'undefined' && _stockRows.length > 0) {
            return _stockRows.some(r => r.matCode === it.matCode);
          }
          return true; // ถ้ายังไม่โหลด stock ให้แสดงทั้งหมด
        });
      await stockReceiveFromPO(poNo, poItemsForStock);
    }
    if (btn) btn.textContent = btnOldText;
    await _poNewForm();
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
// ── พรีวิว PO จากฟอร์มปัจจุบัน (ไม่ต้องบันทึกก่อน) ────────────
function _poPreview() {
  const items = _poItems.filter(r => String(r.name||'').trim());
  if (!items.length) {
    Swal.fire({ icon:'warning', title:'กรุณากรอกรายการสินค้าก่อน', background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1' });
    return;
  }
  const poNo       = $('po_poNo').value || '(ร่าง)';
  const issueDate  = $('po_issueDate').value || '';
  const wantDate   = $('po_wantDate').value || '';
  const supCode    = $('po_supplier').value || '';
  const refOrders  = $('po_refOrders').value || '';
  const payTerm    = $('po_payTerm').value || '';
  const deliverTerm= $('po_deliverTerm').value || '';
  const createdBy  = $('po_createdBy').value || '';
  const note       = $('po_note').value || '';
  const supplier   = _supplierCache.find(s => s.code === supCode) || { name: supCode };

  const fmt = n => (parseFloat(n)||0).toLocaleString('th-TH',{minimumFractionDigits:2});
  let subtotal = 0;
  const itemRows = items.map((it, idx) => {
    const qty  = parseFloat(it.qty)||0;
    const up   = parseFloat(it.unitPrice)||0;
    const line = qty * up;
    subtotal  += line;
    const imgHtml = it.imageUrl
      ? `<img src="${it.imageUrl}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:4px">`
      : '';
    return `<tr>
      <td class="c">${idx+1}</td>
      <td>${imgHtml}${it.name||''}</td>
      <td class="c">${it.qty||''}</td>
      <td class="c">${it.unit||''}</td>
      <td class="r">${up ? fmt(up) : '—'}</td>
      <td class="r">${line ? fmt(line) : '—'}</td>
    </tr>`;
  }).join('');
  const vat   = subtotal * 0.07;
  const total = subtotal + vat;

  const itemsWithImage = items.filter(it => it.imageUrl);
  const itemImagesHtml = itemsWithImage.length ? `
    <div class="item-images">
      ${itemsWithImage.map((it,idx) => `
        <div class="item-img-box">
          <img class="item-img" src="${it.imageUrl}">
          <div class="item-img-cap">${idx+1}. ${it.name||''}</div>
        </div>`).join('')}
    </div>` : '';

  const win = window.open('', '_blank');
  if (!win) { alert('กรุณาอนุญาต popup'); return; }
  win.document.write(`
  <html><head><title>พรีวิว PO ${poNo}</title>
  <style>
    @page{size:A4;margin:12mm}
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:'Sarabun',Tahoma,sans-serif;color:#1e293b;font-size:12px;margin:0;background:#e2e8f0}
    .wrap{display:flex;gap:16px;align-items:flex-start;max-width:1000px;margin:0 auto;
      background:#fff;padding:16px;box-shadow:0 0 12px rgba(0,0,0,.08)}
    @media print{body{background:#fff}.wrap{max-width:none;margin:0;padding:0;box-shadow:none}}
    .draft-banner{background:#fef3c7;border:1.5px dashed #f59e0b;border-radius:8px;padding:7px 14px;
      font-size:11px;color:#92400e;font-weight:600;text-align:center;margin-bottom:12px}
    .main{flex:1;min-width:0}
    .sidebar{width:190px;flex-shrink:0;background:#fff;color:#1e293b;border:1.5px solid #1e293b;border-radius:14px;padding:14px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;padding-bottom:12px;border-bottom:2px solid #16335c}
    .brand{display:flex;gap:12px;align-items:flex-start}
    .brand .logo-box{width:56px;height:56px;flex-shrink:0;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center}
    .brand .logo-box img{width:100%;height:100%;object-fit:contain}
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
    td.c,th.c{text-align:center} td.r,th.r{text-align:right}
    .totals{display:flex;justify-content:flex-end;margin-bottom:12px}
    .totals table{width:230px}
    .totals td{border:none;padding:3px 6px;font-size:11px}
    .totals tr.grand td{font-weight:700;font-size:12.5px;color:#16335c;border-top:2px solid #16335c}
    .note{border:1px solid #dbe3ee;border-radius:10px;padding:8px 10px;margin-bottom:36px;font-size:10.5px;min-height:30px}
    .sign{display:flex;justify-content:space-around;text-align:center;margin-bottom:14px}
    .sign .s{width:180px}
    .sign .ln{border-top:1px solid #94a3b8;margin-top:30px;padding-top:4px;font-size:10.5px}
    .sign .lab{display:inline-block;background:#eef2ff;color:#16335c;border-radius:14px;padding:2px 12px;font-size:10px;font-weight:600;margin-bottom:4px}
    .sb-pono{background:#f1f5f9;border:1px solid #cbd5e1;border-radius:10px;padding:9px 10px;margin-bottom:10px}
    .sb-pono .lab{font-size:9.5px;color:#64748b}
    .sb-pono .val{font-size:15px;font-weight:700;color:#1e293b;margin-top:2px}
    .sb-row{margin-bottom:9px}
    .sb-row .lab{font-size:9.5px;color:#64748b}
    .sb-row .val{font-size:11px;font-weight:600;color:#1e293b;margin-top:2px;word-break:break-word}
    .sb-hr{border:none;border-top:1px solid #cbd5e1;margin:10px 0}
    .item-images{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px}
    .item-img-box{width:150px;text-align:center}
    .item-img-box .item-img{width:150px;height:150px;object-fit:contain;border:1px solid #dbe3ee;border-radius:8px;background:#f8fafc}
    .item-img-box .item-img-cap{font-size:10px;color:#475569;margin-top:4px;word-break:break-word}
  </style></head><body>
  <div class="wrap">
    <div class="main">
      <div class="draft-banner">⚠️ พรีวิว — ยังไม่ได้บันทึก (DRAFT PREVIEW)</div>
      <div class="header">
        <div class="brand">
          <div class="logo-box"><img src="${_getLogoSrc ? _getLogoSrc() : (typeof PTS_LOGO_B64!=='undefined'?PTS_LOGO_B64:'')}"></div>
          <div>
            <div class="name-th">${typeof PTS_COMPANY!=='undefined'?PTS_COMPANY.nameTh:''}</div>
            <div class="name-en">${typeof PTS_COMPANY!=='undefined'?PTS_COMPANY.nameEn:''}</div>
            <div class="info">
              <div>📍 ${typeof PTS_COMPANY!=='undefined'?PTS_COMPANY.address:''}</div>
              <div>📞 ${typeof PTS_COMPANY!=='undefined'?PTS_COMPANY.phone:''}</div>
              <div>เลขประจำตัวผู้เสียภาษี: ${typeof PTS_COMPANY!=='undefined'?PTS_COMPANY.taxId:''}</div>
            </div>
          </div>
        </div>
        <div class="title"><h1>ใบสั่งซื้อ</h1><div class="en">PURCHASE ORDER</div></div>
      </div>
      <div class="boxes">
        <div class="box">
          <h3>👤 ผู้จำหน่าย (Supplier)</h3>
          <div class="ln"><b>${supplier.name||supCode||'—'}</b></div>
          <div class="ln">${supplier.address||''}</div>
          <div class="ln">เลขประจำตัวผู้เสียภาษี: ${supplier.taxId||'—'}</div>
          <div class="ln">ติดต่อ: ${supplier.contact||'—'}</div>
        </div>
        <div class="box">
          <h3>📋 เงื่อนไข (Terms)</h3>
          <div class="ln">การชำระเงิน : ${payTerm||'—'}</div>
          <div class="ln">การส่งมอบ : ${deliverTerm||'—'}</div>
          <div class="ln">อ้างอิง No.PO/Quo : ${refOrders||'—'}</div>
        </div>
      </div>
      <table>
        <thead><tr>
          <th class="c" style="width:5%">ลำดับ</th>
          <th>รายการ</th>
          <th class="c" style="width:8%">จำนวน</th>
          <th class="c" style="width:7%">หน่วย</th>
          <th class="r" style="width:14%">ราคา/หน่วย (THB)</th>
          <th class="r" style="width:14%">จำนวนเงิน (THB)</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      ${itemImagesHtml}
      <div class="totals">
        <table>
          <tr><td>รวมเป็นเงิน</td><td class="r">${fmt(subtotal)} บาท</td></tr>
          <tr><td>ภาษีมูลค่าเพิ่ม 7%</td><td class="r">${fmt(vat)} บาท</td></tr>
          <tr class="grand"><td>รวมสุทธิ</td><td class="r">${fmt(total)} บาท</td></tr>
        </table>
      </div>
      <div class="note"><b>หมายเหตุ</b><br>${note||'—'}</div>
      <div class="sign">
        <div class="s"><div class="lab">ผู้จัดทำ</div><div class="ln">${createdBy||''}<br>${issueDate||''}</div></div>
        <div class="s"><div class="lab">ผู้อนุมัติ</div><div class="ln">&nbsp;</div></div>
      </div>
    </div>
    <div class="sidebar">
      <div class="sb-pono"><div class="lab">เลขที่ PO</div><div class="val">${poNo}</div></div>
      <div class="sb-row"><div class="lab">วันที่สั่งซื้อ</div><div class="val">${issueDate||'—'}</div></div>
      <div class="sb-row"><div class="lab">วันที่ต้องการรับ</div><div class="val">${wantDate||'—'}</div></div>
      <hr class="sb-hr">
      <div class="sb-row"><div class="lab">🚚 การจัดส่ง</div><div class="val">${deliverTerm||'—'}</div></div>
      <div class="sb-row"><div class="lab">💳 การชำระเงิน</div><div class="val">${payTerm||'—'}</div></div>
      <div class="sb-row"><div class="lab">📄 อ้างอิง</div><div class="val">${refOrders||'—'}</div></div>
      <hr class="sb-hr">
      <div class="sb-row"><div class="lab">👤 ผู้ติดต่อ</div><div class="val">${createdBy||'—'}</div></div>
    </div>
  </div>
  <script>(function(){
    function go(){ try{ window.focus(); window.print(); }catch(e){} }
    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(go).catch(function(){ setTimeout(go,700); });
    } else { setTimeout(go,700); }
  })();<\/script>
  </body></html>`);
  win.document.close();
}

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
      <td class="c">${it[PO_ITEM_COLS.qty]||''}</td>
      <td class="c">${it[PO_ITEM_COLS.unit]||''}</td>
      <td class="r">${fmt(it[PO_ITEM_COLS.unitPrice])}</td>
      <td class="r">${fmt(it[PO_ITEM_COLS.lineTotal])}</td>
    </tr>`).join('');

  // ── รูปภาพรายการ (แสดงใต้ตาราง รูปใหญ่ ต่อรายการที่มีรูป) ──
  const itemsWithImage = items.filter(it => it[PO_ITEM_COLS.imageUrl]);
  const itemImagesHtml = itemsWithImage.length ? `
    <div class="item-images">
      ${itemsWithImage.map(it => `
        <div class="item-img-box">
          <img class="item-img" src="${it[PO_ITEM_COLS.imageUrl]}">
          <div class="item-img-cap">${it[PO_ITEM_COLS.seq]}. ${it[PO_ITEM_COLS.name]||''}</div>
        </div>`).join('')}
    </div>` : '';

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`
  <html><head><title>ใบสั่งซื้อ ${poNo}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
    body{font-family:'Sarabun',Tahoma,sans-serif;color:#1e293b;font-size:12px;margin:0;background:#e2e8f0}
    .wrap{display:flex;gap:16px;align-items:flex-start;max-width:1000px;margin:0 auto;
      background:#fff;padding:16px;box-shadow:0 0 12px rgba(0,0,0,.08)}
    @media print {
      body{background:#fff}
      .wrap{max-width:none;margin:0;padding:0;box-shadow:none}
    }
    .main{flex:1;min-width:0}
    .sidebar{width:190px;flex-shrink:0;background:#fff;color:#1e293b;border:1.5px solid #1e293b;border-radius:14px;padding:14px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;padding-bottom:12px;border-bottom:2px solid #16335c}
    .brand{display:flex;gap:12px;align-items:flex-start}
    .brand .logo-box{width:56px;height:56px;flex-shrink:0;border-radius:8px;overflow:hidden;
      display:flex;align-items:center;justify-content:center}
    .brand .logo-box img{width:100%;height:100%;object-fit:contain}
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
    .sb-pono{background:#f1f5f9;border:1px solid #cbd5e1;border-radius:10px;padding:9px 10px;margin-bottom:10px}
    .sb-pono .lab{font-size:9.5px;color:#64748b;opacity:.85}
    .sb-pono .val{font-size:15px;font-weight:700;color:#1e293b;margin-top:2px}
    .sb-row{margin-bottom:9px}
    .sb-row .lab{font-size:9.5px;color:#64748b;opacity:.85}
    .sb-row .val{font-size:11px;font-weight:600;color:#1e293b;margin-top:2px;word-break:break-word}
    .sb-hr{border:none;border-top:1px solid #cbd5e1;margin:10px 0}
    .item-images{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px}
    .item-img-box{width:150px;text-align:center}
    .item-img-box .item-img{width:150px;height:150px;object-fit:contain;border:1px solid #dbe3ee;border-radius:8px;background:#f8fafc}
    .item-img-box .item-img-cap{font-size:10px;color:#475569;margin-top:4px;word-break:break-word}
  </style></head><body>
  <div class="wrap">
    <div class="main">
      <div class="header">
        <div class="brand">
          <div class="logo-box"><img src="${_getLogoSrc ? _getLogoSrc() : PTS_LOGO_B64}"></div>
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
          <th class="c" style="width:8%">จำนวน<br>QTY</th>
          <th class="c" style="width:7%">หน่วย<br>Unit</th>
          <th class="r" style="width:14%">ราคา/หน่วย<br>Unit Price (THB)</th>
          <th class="r" style="width:14%">จำนวนเงิน<br>Amount (THB)</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      ${itemImagesHtml}

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
  <script>(function(){
    function go(){ try{ window.focus(); window.print(); }catch(e){} }
    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(go).catch(function(){ setTimeout(go,700); });
    } else { setTimeout(go,700); }
  })();<\/script>
  </body></html>`);
  win.document.close();
}

// ══════════════════════════════════════════════════════════
// EXPENSE RECEIPT — ใบเสร็จรายจ่าย
// ══════════════════════════════════════════════════════════

const _EXP_DEFAULT_CATS = [
  'ค่าซ่อมบำรุงรถ','ค่าแรง+ค่าย่อยรถ','เครื่องจักร',
  'จ้างกิจกรรมงาน','จ้างประกอบงาน','อัปปี้',
  'ซื้อวัตถุดิบ','ใช้ไป','อะไหล่เครื่องจักร'
];
const _EXP_CATS_KEY   = 'ptts_expense_cats';
let _expRows     = [];   // [{desc,qty,unitPrice}]
let _expEditRef  = null; // ref ที่กำลังแก้ไข

// ── Sub-tab switch ──
function _poSubTabSwitch(n) {
  ['1','2','3'].forEach(k => {
    const panel = document.getElementById('poSubPanel' + k);
    const btn   = document.getElementById('poSubBtn'   + k);
    if (panel) panel.style.display = (k === n) ? '' : 'none';
    if (btn) {
      btn.classList.toggle('active', k === n);
    }
  });
  if (n === '2') { _expInitForm(); _expFetchList(); }
  if (n === '3') { _expRenderCatList(); }
}

// ── Category helpers ──
function _expGetCats() {
  try { return JSON.parse(localStorage.getItem(_EXP_CATS_KEY) || 'null') || [..._EXP_DEFAULT_CATS]; }
  catch(e) { return [..._EXP_DEFAULT_CATS]; }
}
function _expSaveCats(cats) { localStorage.setItem(_EXP_CATS_KEY, JSON.stringify(cats)); }

function _expRenderCatList() {
  const cats = _expGetCats();
  const el = document.getElementById('expCatList');
  if (!el) return;
  if (!cats.length) { el.innerHTML = '<div style="color:var(--t3);font-size:.83rem">ยังไม่มีหมวด</div>'; return; }
  el.innerHTML = cats.map((c, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--br)">
      <span style="flex:1;font-size:.88rem">${c}</span>
      <button onclick="_expDeleteCat(${i})" style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#f87171;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:.78rem">ลบ</button>
    </div>`).join('');
}

function _expAddCat() {
  const inp = document.getElementById('exp_newCat');
  if (!inp) return;
  const name = inp.value.trim();
  if (!name) return;
  const cats = _expGetCats();
  if (cats.includes(name)) { Swal.fire({icon:'info',title:'มีหมวดนี้แล้ว',timer:1200,showConfirmButton:false,background:'var(--bg-card)',color:'var(--t1)'}); return; }
  cats.push(name);
  _expSaveCats(cats);
  inp.value = '';
  _expRenderCatList();
  _expPopulateCatSelect();
}

function _expDeleteCat(idx) {
  const cats = _expGetCats();
  if (idx < 0 || idx >= cats.length) return;
  cats.splice(idx, 1);
  _expSaveCats(cats);
  _expRenderCatList();
  _expPopulateCatSelect();
}

function _expPopulateCatSelect() {
  const sel = document.getElementById('exp_category');
  if (!sel) return;
  const cats = _expGetCats();
  const cur  = sel.value;
  sel.innerHTML = '<option value="">— เลือกหมวด —</option>' +
    cats.map(c => `<option value="${c}"${c===cur?' selected':''}>${c}</option>`).join('');
}

// ── Form init / reset ──
function _expInitForm() {
  const today = new Date().toISOString().slice(0, 10);
  const refEl = document.getElementById('exp_refNo');
  if (refEl && !refEl.value) refEl.value = _expGenRef();
  const dateEl = document.getElementById('exp_date');
  if (dateEl && !dateEl.value) dateEl.value = today;
  _expPopulateCatSelect();
  if (!_expRows.length) { _expRows = [{desc:'',qty:1,unitPrice:0},{desc:'',qty:1,unitPrice:0}]; }
  _expRenderRows();
}

function _expReset() {
  _expRows    = [{desc:'',qty:1,unitPrice:0},{desc:'',qty:1,unitPrice:0}];
  _expEditRef = null;
  const fields = ['exp_refNo','exp_vendorName','exp_vendorTaxId','exp_vendorAddress','exp_note'];
  fields.forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('exp_refNo').value = _expGenRef();
  document.getElementById('exp_date').value  = new Date().toISOString().slice(0,10);
  _expPopulateCatSelect();
  _expClearImg();
  _expRenderRows();
}

function _expGenRef() {
  const d = new Date();
  const ds = d.getFullYear()+''+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  const ts = String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0');
  return 'EXP-'+ds+'-'+ts;
}

// ── Rows ──
function _expAddRow() {
  _expRows.push({desc:'',qty:1,unitPrice:0});
  _expRenderRows();
}

function _expRemoveRow(i) {
  if (_expRows.length <= 1) return;
  _expRows.splice(i, 1);
  _expRenderRows();
}

function _expRenderRows() {
  const tbody = document.getElementById('expItemBody');
  if (!tbody) return;
  tbody.innerHTML = _expRows.map((r, i) => `
    <tr>
      <td style="text-align:center;padding:5px 4px;color:var(--t3)">${i+1}</td>
      <td style="padding:4px"><input type="text" value="${r.desc||''}" oninput="_expRowChange(${i},'desc',this.value)" placeholder="รายการ" style="width:100%;background:var(--inp-bg);border:1px solid var(--inp-bc);border-radius:6px;padding:6px 8px;color:var(--txt);font-family:Sarabun,sans-serif;font-size:.85rem"></td>
      <td style="padding:4px"><input type="number" value="${r.qty||1}" min="0" step="0.01" oninput="_expRowChange(${i},'qty',this.value)" style="width:100%;background:var(--inp-bg);border:1px solid var(--inp-bc);border-radius:6px;padding:6px 8px;color:var(--txt);font-family:Sarabun,sans-serif;font-size:.85rem;text-align:center"></td>
      <td style="padding:4px"><input type="number" value="${r.unitPrice||0}" min="0" step="0.01" oninput="_expRowChange(${i},'unitPrice',this.value)" style="width:100%;background:var(--inp-bg);border:1px solid var(--inp-bc);border-radius:6px;padding:6px 8px;color:var(--txt);font-family:Sarabun,sans-serif;font-size:.85rem;text-align:right"></td>
      <td style="text-align:right;padding:5px 8px;font-size:.85rem;color:var(--t1)">${((+r.qty||0)*(+r.unitPrice||0)).toLocaleString('th-TH',{minimumFractionDigits:2})}</td>
      <td style="text-align:center;padding:4px"><button onclick="_expRemoveRow(${i})" style="background:none;border:none;cursor:pointer;color:#f87171;font-size:.9rem;padding:4px 6px" title="ลบ">✕</button></td>
    </tr>`).join('');
  _expCalcTotal();
}

function _expRowChange(i, field, val) {
  if (!_expRows[i]) return;
  _expRows[i][field] = field === 'desc' ? val : parseFloat(val)||0;
  // อัปเดต cell จำนวนเงินของแถวนี้โดยตรง
  const rows = document.querySelectorAll('#expItemBody tr');
  if (rows[i]) {
    const amtCell = rows[i].querySelectorAll('td')[4];
    if (amtCell) amtCell.textContent = ((+_expRows[i].qty||0)*(+_expRows[i].unitPrice||0)).toLocaleString('th-TH',{minimumFractionDigits:2});
  }
  _expCalcTotal();
}

function _expCalcTotal() {
  const total = _expRows.reduce((s,r) => s + (+(r.qty)||0)*(+(r.unitPrice)||0), 0);
  const el = document.getElementById('exp_total');
  if (el) el.textContent = total.toLocaleString('th-TH', {minimumFractionDigits:2});
  return total;
}

// ── Save ──
function _expCollectData() {
  const g = id => (document.getElementById(id)||{}).value || '';
  const total = _expCalcTotal();
  const rows  = _expRows.filter(r => r.desc || (+r.qty>0 && +r.unitPrice>0));
  return {
    ref:           g('exp_refNo'),
    date:          g('exp_date'),
    category:      g('exp_category'),
    payMethod:     g('exp_payMethod'),
    vendorName:    g('exp_vendorName'),
    vendorTaxId:   g('exp_vendorTaxId'),
    vendorAddress: g('exp_vendorAddress'),
    note:          g('exp_note'),
    items:         rows,
    total:         total,
    imageUrl:      _expImgData || '',
  };
}

function _expSave() {
  const data = _expCollectData();
  if (!data.ref || !data.vendorName) {
    Swal.fire({icon:'warning',title:'กรุณากรอกข้อมูล',text:'ต้องการชื่อผู้รับเงิน',timer:2000,showConfirmButton:false,background:'var(--bg-card)',color:'var(--t1)'}); return;
  }
  if (!SCRIPT_URL) {
    Swal.fire({icon:'info',title:'ยังไม่ตั้งค่า URL',text:'กรุณาใส่ Apps Script URL ในแท็บตั้งค่าก่อน',background:'var(--bg-card)',color:'var(--t1)'}); return;
  }
  Swal.fire({title:'กำลังบันทึก…',didOpen:()=>Swal.showLoading(),background:'var(--bg-card)',color:'var(--t1)'});
  fetch(SCRIPT_URL, {
    method:'POST', mode:'no-cors',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify({ action:'saveExpenseReceipt', data })
  }).then(() => {
    if (_expImgData && data.ref) localStorage.setItem('ptts_exp_img_' + data.ref, _expImgData);
    Swal.fire({icon:'success',title:'บันทึกใบเสร็จแล้ว ✅',timer:1400,showConfirmButton:false,toast:true,position:'top-end',background:'#0d1b2a',color:'#cce4ff'});
    _expFetchList();
  }).catch(() => Swal.fire({icon:'error',title:'บันทึกไม่สำเร็จ',background:'var(--bg-card)',color:'var(--t1)'}));
}

// ── Fetch list ──
function _expFetchList() {
  const el = document.getElementById('expListBody');
  if (!el) return;
  if (!SCRIPT_URL) { el.innerHTML = '<div style="color:var(--t3);padding:12px">ยังไม่ตั้งค่า Script URL</div>'; return; }
  el.innerHTML = '<div style="color:var(--t3);padding:12px">กำลังโหลด…</div>';
  fetch(SCRIPT_URL + '?action=getExpenseReceipts')
    .then(r => r.json())
    .then(d => _expRenderList(d.data || []))
    .catch(() => { el.innerHTML = '<div style="color:var(--t3);padding:12px">โหลดไม่ได้ (ตรวจสอบ URL)</div>'; });
}

let _expListCache = [];
let _expImgData   = null; // base64 รูปที่สั่งซื้อ (เก็บชั่วคราว)

function _expImgChanged() {
  const input = document.getElementById('exp_img');
  const file  = input?.files?.[0];
  const nameEl  = document.getElementById('exp_imgName');
  const clearEl = document.getElementById('exp_imgClear');
  const imgEl   = document.getElementById('exp_imgPreview');
  if (!file) { _expClearImg(); return; }
  const reader = new FileReader();
  reader.onload = e => {
    _expImgData = e.target.result;
    if (nameEl)  nameEl.textContent = file.name;
    if (clearEl) clearEl.style.display = 'inline-block';
    if (imgEl)  { imgEl.src = _expImgData; imgEl.style.display = 'block'; }
  };
  reader.readAsDataURL(file);
}

function _expClearImg() {
  _expImgData = null;
  const input = document.getElementById('exp_img');
  if (input)  input.value = '';
  const nameEl  = document.getElementById('exp_imgName');
  const clearEl = document.getElementById('exp_imgClear');
  const imgEl   = document.getElementById('exp_imgPreview');
  if (nameEl)  nameEl.textContent = 'ยังไม่ได้เลือก';
  if (clearEl) clearEl.style.display = 'none';
  if (imgEl)  { imgEl.style.display = 'none'; imgEl.removeAttribute('src'); }
}

function _expRenderList(rows) {
  const el = document.getElementById('expListBody');
  if (!el) return;
  if (!rows.length) { el.innerHTML = '<div style="color:var(--t3);padding:12px">ยังไม่มีรายการ</div>'; return; }
  _expListCache = [...rows].sort((a,b) => (b.date||'').localeCompare(a.date||''));
  const fmtDate = d => { try {
    const months = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    if (d.includes('T') || d.includes('/')) { const dt=new Date(d.includes('/')?d.split('/').reverse().join('-'):d); if(!isNaN(dt)) return dt.getDate()+' '+months[dt.getMonth()+1]+' '+(dt.getFullYear()+543); }
    const [y,m,day]=d.split('-'); return (+day)+' '+months[+m]+' '+(+y+543);
  } catch(e){return d;} };
  el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:.83rem">
    <thead><tr style="background:var(--bg-alt,rgba(255,255,255,.04));color:var(--t3);font-size:.78rem">
      <th style="padding:7px 10px;text-align:left">เลขที่</th>
      <th style="padding:7px 10px;text-align:left">วันที่</th>
      <th style="padding:7px 10px;text-align:left">หมวด</th>
      <th style="padding:7px 10px;text-align:left">ผู้รับเงิน</th>
      <th style="padding:7px 10px;text-align:right">รวม</th>
      <th style="padding:7px 10px;text-align:center">รูป</th>
      <th style="padding:7px 10px;text-align:center">ปฏิบัติการ</th>
    </tr></thead>
    <tbody>${_expListCache.map((r,i) => {
      const imgData = r.ref ? localStorage.getItem('ptts_exp_img_' + r.ref) : null;
      const thumbHtml = imgData
        ? `<img src="${imgData}" style="width:38px;height:38px;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid var(--bc-div)" onclick="_expShowImgFull('${r.ref}')" title="ดูรูปเต็ม">`
        : `<span style="color:var(--t3);font-size:.72rem">—</span>`;
      return `<tr style="border-bottom:1px solid var(--br)">
      <td style="padding:7px 10px;color:var(--t3)">${r.ref||''}</td>
      <td style="padding:7px 10px">${fmtDate(r.date||'')}</td>
      <td style="padding:7px 10px">${r.category||''}</td>
      <td style="padding:7px 10px">${r.vendorName||''}</td>
      <td style="padding:7px 10px;text-align:right">${(+(r.total)||0).toLocaleString('th-TH',{minimumFractionDigits:2})}</td>
      <td style="padding:7px 10px;text-align:center">${thumbHtml}</td>
      <td style="padding:7px 10px;text-align:center;white-space:nowrap">
        <button onclick="_expEditFromIdx(${i})" style="padding:5px 10px;border-radius:7px;border:none;background:#2563eb;color:#fff;font-size:.7rem;cursor:pointer;font-family:Sarabun,sans-serif;margin:1px">✏️ แก้ไข</button>
        <button onclick="_expPrintFromIdx(${i})" style="padding:5px 10px;border-radius:7px;border:none;background:#16a34a;color:#fff;font-size:.7rem;cursor:pointer;font-family:Sarabun,sans-serif;margin:1px">🖨️ พิมพ์</button>
        <button onclick="_expDeleteFromIdx(${i})" style="padding:5px 8px;border-radius:7px;border:1px solid rgba(248,113,113,.35);background:rgba(248,113,113,.1);color:#f87171;font-size:.7rem;cursor:pointer;margin:1px">🗑️</button>
      </td>
    </tr>`;
    }).join('')}
    </tbody></table>`;
}

function _expShowImgFull(ref) {
  const imgData = localStorage.getItem('ptts_exp_img_' + ref);
  if (!imgData) return;
  Swal.fire({ imageUrl: imgData, imageAlt: 'รูปที่สั่งซื้อ ' + ref, showConfirmButton: false, showCloseButton: true, width: 'auto', padding: '8px', background: 'var(--bg-card,#1e2130)' });
}

function _expPrintPreview() {
  const data = _expCollectData();
  _expOpenPrint(data);
}

function _expPrintFromIdx(i) {
  const data = _expListCache[i];
  if (!data) return;
  _expOpenPrint(data);
}

function _expEditFromIdx(i) {
  const data = _expListCache[i];
  if (!data) return;
  const g = (id, val) => { const el = document.getElementById(id); if (el) el.value = val||''; };
  g('exp_refNo',         data.ref);
  g('exp_date',          data.date ? (data.date.includes('T') ? data.date.slice(0,10) : data.date) : '');
  g('exp_vendorName',    data.vendorName);
  g('exp_vendorTaxId',   data.vendorTaxId);
  g('exp_vendorAddress', data.vendorAddress);
  g('exp_note',          data.note);
  g('exp_payMethod',     data.payMethod);
  _expPopulateCatSelect();
  const catSel = document.getElementById('exp_category');
  if (catSel) catSel.value = data.category||'';
  const items = Array.isArray(data.items) ? data.items : (typeof data.items==='string' ? JSON.parse(data.items||'[]') : []);
  _expRows = items.map(it => ({ desc: it.desc||'', qty: +(it.qty)||1, unitPrice: +(it.unitPrice)||0 }));
  if (!_expRows.length) _expRows = [{desc:'',qty:1,unitPrice:0}];
  _expRenderRows();
  // โหลดรูปจาก localStorage
  _expClearImg();
  const savedImg = data.ref ? localStorage.getItem('ptts_exp_img_' + data.ref) : null;
  if (savedImg) {
    _expImgData = savedImg;
    const nameEl  = document.getElementById('exp_imgName');
    const clearEl = document.getElementById('exp_imgClear');
    const imgEl   = document.getElementById('exp_imgPreview');
    if (nameEl)  nameEl.textContent = 'รูปที่บันทึกไว้';
    if (clearEl) clearEl.style.display = 'inline-block';
    if (imgEl)  { imgEl.src = savedImg; imgEl.style.display = 'block'; }
  }
  _expEditRef = data.ref || null;
  document.getElementById('exp_refNo')?.scrollIntoView({ behavior:'smooth', block:'center' });
}

function _expDeleteFromIdx(i) {
  const data = _expListCache[i];
  if (!data) return;
  Swal.fire({
    icon:'warning', title:'ลบใบเสร็จ?',
    text: `เลขที่ ${data.ref||''} — ${data.vendorName||''}`,
    showCancelButton:true, confirmButtonText:'ลบ', cancelButtonText:'ยกเลิก',
    confirmButtonColor:'#ef4444', background:'var(--bg-card)', color:'var(--t1)'
  }).then(r => {
    if (!r.isConfirmed) return;
    if (!SCRIPT_URL) { Swal.fire({icon:'info',title:'ยังไม่ตั้งค่า URL',background:'var(--bg-card)',color:'var(--t1)'}); return; }
    fetch(SCRIPT_URL, {
      method:'POST', mode:'no-cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({ action:'deleteExpenseReceipt', ref: data.ref })
    }).then(() => {
      Swal.fire({icon:'success',title:'ลบแล้ว 🗑️',timer:1200,showConfirmButton:false,toast:true,position:'top-end',background:'#0d1b2a',color:'#cce4ff'});
      _expFetchList();
    });
  });
}

function _expOpenPrint(data) {
  const win = window.open('', '_blank');
  if (!win) { Swal.fire({icon:'warning',title:'ป๊อปอัพถูกบล็อก',text:'กรุณาอนุญาต popup ของเบราว์เซอร์'}); return; }
  // ถ้า _companyInfoCache ยังไม่มีให้ fetch ก่อน แล้วค่อย build
  const _doBuild = () => { win.document.write(_expBuildFullHtml(data)); win.document.close(); };
  if (typeof _companyInfoCache !== 'undefined' && _companyInfoCache && _companyInfoCache.name) {
    _doBuild();
  } else if (typeof _fetchCompanyInfo === 'function' && SCRIPT_URL) {
    _fetchCompanyInfo().then(_doBuild).catch(_doBuild);
  } else {
    _doBuild();
  }
}

function _expBuildFullHtml(data) {
  const imgData = data.ref ? localStorage.getItem('ptts_exp_img_' + data.ref) : (_expImgData || null);
  const _co = (typeof _companyInfoCache !== 'undefined' && _companyInfoCache) || {};
  const companyName    = _co.name    || 'บริษัท พีทีทีเอส จำกัด';
  const companyAddress = _co.address || '';
  const companyTaxId   = _co.taxId   || '';

  const dateStr = data.date ? (() => {
    const months = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    if (data.date.includes('T') || data.date.includes('/')) {
      const dt = new Date(data.date.includes('/') ? data.date.split('/').reverse().join('-') : data.date);
      if (!isNaN(dt)) return `${dt.getDate()} ${months[dt.getMonth()+1]} ${dt.getFullYear()+543}`;
    }
    const [y,m,d] = data.date.split('-');
    return `${+d} ${months[+m]} ${+y+543}`;
  })() : '';

  const items = Array.isArray(data.items) ? data.items : (typeof data.items==='string' ? JSON.parse(data.items||'[]') : []);
  const totalRows = Math.max(items.length, 10);
  const rowsHtml = Array.from({length:totalRows}, (_,i) => {
    const it = items[i];
    const amt = it ? ((+(it.qty)||0)*(+(it.unitPrice)||0)) : 0;
    return `<tr style="height:22px">
      <td style="border:1px solid #ccc;padding:3px 6px;text-align:center;font-size:12px">${it ? i+1 : ''}</td>
      <td style="border:1px solid #ccc;padding:3px 8px;font-size:12px">${it ? (it.desc||'') : ''}</td>
      <td style="border:1px solid #ccc;padding:3px 6px;text-align:center;font-size:12px">${it ? (it.qty||'') : ''}</td>
      <td style="border:1px solid #ccc;padding:3px 8px;text-align:right;font-size:12px">${it ? (+(it.unitPrice)||0).toLocaleString('th-TH',{minimumFractionDigits:2}) : ''}</td>
      <td style="border:1px solid #ccc;padding:3px 8px;text-align:right;font-size:12px">${it ? amt.toLocaleString('th-TH',{minimumFractionDigits:2}) : ''}</td>
    </tr>`;
  }).join('');

  const total = (+(data.total)||0).toLocaleString('th-TH',{minimumFractionDigits:2});

  return `<!DOCTYPE html><html><head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Sarabun',sans-serif; font-size:13px; background:#fff; color:#000; }
    @media print { @page{margin:10mm} body{background:#fff} }
    table.items { width:100%; border-collapse:collapse; margin:8px 0; }
  </style>
  </head><body>
  <div style="padding:15mm 15mm 10mm">
    <div style="text-align:center;font-size:18px;font-weight:700;margin-bottom:12px">ใบเสร็จรับเงิน</div>
    <div style="text-align:right;font-size:12px;margin-bottom:10px">วันที่ ${dateStr}</div>
    <div style="border:1px solid #aaa;padding:8px 10px;margin-bottom:8px;font-size:12px">
      <div><b>ผู้รับเงิน:</b> ${data.vendorName||''}</div>
      <div><b>ที่อยู่:</b> ${(data.vendorAddress||'').replace(/\n/g,' ')}</div>
      <div><b>เลขประจำตัว:</b> ${data.vendorTaxId||''}</div>
    </div>
    <div style="border:1px solid #aaa;padding:8px 10px;margin-bottom:8px;font-size:12px">
      <div><b>ได้รับเงินจาก:</b> ${companyName}</div>
      <div><b>ที่อยู่:</b> ${companyAddress}</div>
      <div><b>เลขประจำตัวผู้เสียภาษี:</b> ${companyTaxId}</div>
    </div>
    <div style="font-size:12px;margin-bottom:6px">ตามรายละเอียดดังต่อไปนี้</div>
    <table class="items">
      <thead><tr style="background:#f0f0f0">
        <th style="border:1px solid #ccc;padding:5px 6px;width:40px;font-size:12px">ลำดับ</th>
        <th style="border:1px solid #ccc;padding:5px 8px;font-size:12px;text-align:left">รายการ</th>
        <th style="border:1px solid #ccc;padding:5px 6px;width:70px;font-size:12px">จำนวน</th>
        <th style="border:1px solid #ccc;padding:5px 8px;width:100px;font-size:12px;text-align:right">ราคาต่อหน่วย</th>
        <th style="border:1px solid #ccc;padding:5px 8px;width:100px;font-size:12px;text-align:right">จำนวนเงิน</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr><td colspan="4" style="border:1px solid #ccc;padding:5px 8px;text-align:right;font-weight:700;font-size:12px">รวมทั้งสิ้น</td>
            <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;font-weight:700;font-size:12px">${total}</td></tr>
      </tfoot>
    </table>
    <div style="font-size:12px;margin:8px 0">ชำระโดย ${data.payMethod||'เงินสด'}</div>
    ${data.note ? `<div style="font-size:11px;color:#555;margin-bottom:8px">หมายเหตุ: ${data.note}</div>` : ''}
    ${imgData ? `<div style="margin:14px 0 8px">
      <div style="font-size:11px;color:#555;margin-bottom:6px;font-weight:600">รูปที่สั่งซื้อ</div>
      <img src="${imgData}" style="max-width:100%;max-height:260px;object-fit:contain;border:1px solid #ddd;border-radius:6px;display:block;print-color-adjust:exact;-webkit-print-color-adjust:exact">
    </div>` : ''}
    <div style="display:flex;justify-content:space-between;margin-top:32px;font-size:12px">
      <div style="text-align:center">
        <div style="margin-bottom:32px">ผู้จ่ายเงิน ...................................</div>
        <div>วันที่ ............................................</div>
      </div>
      <div style="text-align:center">
        <div style="margin-bottom:32px">ผู้รับเงิน ...................................</div>
        <div>วันที่ ............................................</div>
      </div>
    </div>
  </div>
  <script>(function(){
    function go(){ try{ window.focus(); window.print(); }catch(e){} }
    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(go).catch(function(){ setTimeout(go,700); });
    } else { setTimeout(go,700); }
  })();<\/script>
  </body></html>`;
}


// ══════════════════════════════════════════════════════════════
// ── RFQ (ใบขอราคา) ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

let _rfqListCache = [];
let _rfqRows      = [];   // รายการในฟอร์มปัจจุบัน
let _rfqEditNo    = null; // เลขที่ที่กำลังแก้ไข (null = สร้างใหม่)

// ── ย่อรูปเป็น base64 ────────────────────────────────────────
function _rfqCompressImg(file, maxPx, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxPx || h > maxPx) {
          if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
          else       { w = Math.round(w * maxPx / h); h = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality || 0.65));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── เริ่มต้น render ตารางรายการ ───────────────────────────────
function _rfqRenderItems() {
  const wrap = $('rfqItemsWrap');
  if (!wrap) return;
  if (!_rfqRows.length) _rfqRows = [_rfqEmptyRow()];
  wrap.innerHTML = `
    <table style="width:100%;border-collapse:collapse;min-width:720px">
      <thead>
        <tr style="background:var(--bg-deep)">
          <th style="width:3%;padding:7px 6px;font-size:.7rem;color:var(--t2);font-weight:600;text-align:center;border-bottom:1px solid var(--bc-div)">#</th>
          <th style="width:28%;padding:7px 8px;font-size:.7rem;color:var(--t2);font-weight:600;text-align:left;border-bottom:1px solid var(--bc-div)">ชื่อสินค้า / วัสดุ</th>
          <th style="width:8%;padding:7px 6px;font-size:.7rem;color:var(--t2);font-weight:600;text-align:center;border-bottom:1px solid var(--bc-div)">จำนวน</th>
          <th style="width:8%;padding:7px 6px;font-size:.7rem;color:var(--t2);font-weight:600;text-align:center;border-bottom:1px solid var(--bc-div)">หน่วย</th>
          <th style="width:20%;padding:7px 8px;font-size:.7rem;color:var(--t2);font-weight:600;text-align:left;border-bottom:1px solid var(--bc-div)">หมายเหตุ</th>
          <th style="width:14%;padding:7px 8px;font-size:.7rem;color:var(--t2);font-weight:600;text-align:center;border-bottom:1px solid var(--bc-div)">รูปภาพ</th>
          <th style="width:5%;padding:7px 6px;font-size:.7rem;color:var(--t2);font-weight:600;text-align:center;border-bottom:1px solid var(--bc-div)">ลบ</th>
        </tr>
      </thead>
      <tbody>
        ${_rfqRows.map((r, i) => _rfqRowHtml(r, i)).join('')}
      </tbody>
    </table>`;
}

function _rfqEmptyRow() {
  return { name:'', qty:'1', unit:'ชิ้น', remark:'', img:'' };
}

function _rfqRowHtml(r, i) {
  const imgCell = r.img
    ? `<div style="position:relative;display:inline-block">
         <img src="${r.img}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--bc-div);display:block;cursor:pointer"
              onclick="_rfqViewImg(${i})" title="คลิกดูภาพเต็ม">
         <button onclick="_rfqRemoveImg(${i})" title="ลบรูป"
           style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;border:none;
                  background:#ef4444;color:#fff;font-size:.6rem;cursor:pointer;line-height:1;padding:0">✕</button>
       </div>`
    : `<label style="cursor:pointer;padding:5px 8px;border-radius:6px;border:1px dashed var(--bc-div);
              font-size:.72rem;color:var(--t3);white-space:nowrap">
         📷 เพิ่มรูป
         <input type="file" accept="image/*" style="display:none" onchange="_rfqImgChange(event,${i})">
       </label>`;
  return `<tr style="border-bottom:1px solid var(--bc-div)">
    <td style="padding:6px;text-align:center;font-size:.75rem;color:var(--t3)">${i+1}</td>
    <td style="padding:4px 6px">
      <input type="text" value="${_escH(r.name)}" placeholder="ชื่อสินค้า/วัสดุ"
        oninput="_rfqRows[${i}].name=this.value"
        style="width:100%;box-sizing:border-box;padding:5px 7px;border-radius:5px;border:1px solid var(--bc-input);
               background:var(--bg-input);color:var(--t1);font-size:.78rem;font-family:Sarabun,sans-serif;outline:none">
    </td>
    <td style="padding:4px 6px">
      <input type="number" value="${_escH(r.qty)}" min="0" step="any"
        oninput="_rfqRows[${i}].qty=this.value"
        style="width:70px;padding:5px 6px;border-radius:5px;border:1px solid var(--bc-input);
               background:var(--bg-input);color:var(--t1);font-size:.78rem;font-family:Sarabun,sans-serif;outline:none;text-align:center">
    </td>
    <td style="padding:4px 6px">
      <input type="text" value="${_escH(r.unit)}" placeholder="ชิ้น"
        oninput="_rfqRows[${i}].unit=this.value"
        style="width:70px;padding:5px 6px;border-radius:5px;border:1px solid var(--bc-input);
               background:var(--bg-input);color:var(--t1);font-size:.78rem;font-family:Sarabun,sans-serif;outline:none;text-align:center">
    </td>
    <td style="padding:4px 6px">
      <input type="text" value="${_escH(r.remark)}" placeholder="หมายเหตุ"
        oninput="_rfqRows[${i}].remark=this.value"
        style="width:100%;box-sizing:border-box;padding:5px 7px;border-radius:5px;border:1px solid var(--bc-input);
               background:var(--bg-input);color:var(--t1);font-size:.78rem;font-family:Sarabun,sans-serif;outline:none">
    </td>
    <td style="padding:4px 6px;text-align:center">${imgCell}</td>
    <td style="padding:4px 6px;text-align:center">
      <button onclick="_rfqRemoveRow(${i})"
        style="padding:3px 8px;border-radius:5px;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.08);
               color:#f87171;font-size:.72rem;cursor:pointer;font-family:Sarabun,sans-serif">🗑️</button>
    </td>
  </tr>`;
}

function _rfqAddRow() {
  _rfqRows.push(_rfqEmptyRow());
  _rfqRenderItems();
}

function _rfqRemoveRow(i) {
  if (_rfqRows.length <= 1) { _rfqRows = [_rfqEmptyRow()]; }
  else { _rfqRows.splice(i, 1); }
  _rfqRenderItems();
}

async function _rfqImgChange(event, i) {
  const file = event.target.files[0];
  if (!file) return;
  const b64 = await _rfqCompressImg(file, 400, 0.65);
  _rfqRows[i].img = b64;
  _rfqRenderItems();
}

function _rfqRemoveImg(i) {
  _rfqRows[i].img = '';
  _rfqRenderItems();
}

function _rfqViewImg(i) {
  const src = _rfqRows[i].img;
  if (!src) return;
  Swal.fire({ imageUrl: src, imageAlt: 'รูปสินค้า', showConfirmButton: false,
    showCloseButton: true, background:'#0d1b2a' });
}

// ── reset ฟอร์ม ───────────────────────────────────────────────
function _rfqReset() {
  _rfqEditNo = null;
  if ($('rfq_formTitle')) $('rfq_formTitle').textContent = 'สร้างใบขอราคาใหม่';
  if ($('rfq_no'))       $('rfq_no').value = '';
  if ($('rfq_date'))     $('rfq_date').value = new Date().toISOString().slice(0,10);
  if ($('rfq_supplier')) $('rfq_supplier').value = '';
  if ($('rfq_remark'))   $('rfq_remark').value = '';
  if ($('rfq_status'))   $('rfq_status').textContent = '';
  _rfqRows = [_rfqEmptyRow()];
  _rfqRenderItems();
}

// ── auto-gen เลขที่ ────────────────────────────────────────────
function _rfqGenNo() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const seq = String(_rfqListCache.length + 1).padStart(3,'0');
  return `RFQ-${yy}${mm}-${seq}`;
}

// ── บันทึก ──────────────────────────────────────────────────────
async function _rfqSave() {
  if (!SCRIPT_URL) {
    Swal.fire({ icon:'warning', title:'ยังไม่ได้ตั้งค่า Script URL', background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1' });
    return;
  }
  const items = _rfqRows.filter(r => r.name.trim());
  if (!items.length) {
    Swal.fire({ icon:'warning', title:'กรุณากรอกรายการอย่างน้อย 1 รายการ', background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1' });
    return;
  }
  const rfqNo = ($('rfq_no').value.trim()) || _rfqGenNo();
  $('rfq_no').value = rfqNo;
  const payload = {
    action:   'saveRFQ',
    rfqNo,
    date:     $('rfq_date').value,
    supplier: $('rfq_supplier').value.trim(),
    items:    JSON.stringify(items),
    remark:   $('rfq_remark').value.trim(),
    createdAt: new Date().toISOString(),
  };
  const st = $('rfq_status');
  if (st) st.textContent = '';
  Swal.fire({ title:'กำลังบันทึก…', allowOutsideClick:false, showConfirmButton:false,
    background:'#0d1b2a', color:'#cce4ff', didOpen:()=>Swal.showLoading() });
  try {
    await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    if (st) st.textContent = '✅ บันทึกแล้ว';
    Swal.fire({ toast:true, position:'top-end', icon:'success', title:'บันทึกใบขอราคาแล้ว',
      showConfirmButton:false, timer:1800, timerProgressBar:true });
    _rfqFetchList();
  } catch(err) {
    if (st) st.textContent = '❌ บันทึกไม่สำเร็จ';
    Swal.fire({ icon:'error', title:'บันทึกไม่สำเร็จ', text:String(err), background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1' });
  }
}

// ── โหลดรายการ ─────────────────────────────────────────────────
async function _rfqFetchList() {
  const tbody = $('rfqListBody');
  if (!tbody) return;
  if (!SCRIPT_URL) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--t3);font-size:.8rem">⚠️ ยังไม่ได้ตั้งค่า Script URL</td></tr>`;
    return;
  }
  tbody.innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--t3);font-size:.8rem"><span style="display:inline-block;animation:spin 1s linear infinite">↻</span> กำลังโหลด…</td></tr>`;
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getRFQList', {mode:'cors'});
    const data = await res.json();
    _rfqListCache = (data.data || []).reverse();
    _rfqRenderList();
  } catch(err) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;color:#f87171;font-size:.8rem">โหลดไม่สำเร็จ: ${err.message}</td></tr>`;
  }
}

// ── render รายการ (พร้อม filter) ─────────────────────────────
function _rfqRenderList() {
  const tbody = $('rfqListBody');
  if (!tbody) return;
  const srch    = (($('rfqFilterSearch')||{}).value||'').trim().toLowerCase();
  const fromVal = ($('rfqFilterFrom')||{}).value||'';
  const toVal   = ($('rfqFilterTo')||{}).value||'';
  const filtered = _rfqListCache.filter(q => {
    if (srch) {
      const hay = (String(q.rfqNo||'') + ' ' + String(q.supplier||'')).toLowerCase();
      if (!hay.includes(srch)) return false;
    }
    const isoDate = String(q.date||'').substring(0,10);
    if (fromVal && isoDate < fromVal) return false;
    if (toVal   && isoDate > toVal)   return false;
    return true;
  });
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding:30px;text-align:center;color:var(--t3);font-size:.8rem">${_rfqListCache.length?'ไม่พบรายการที่ตรงกับตัวกรอง':'ยังไม่มีรายการ'}</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(q => {
    const ci = _rfqListCache.indexOf(q);
    const items = Array.isArray(q.items) ? q.items : [];
    const hasImg = items.some(r => r.img);
    return `<tr style="border-bottom:1px solid var(--bc-div);font-size:.8rem">
      <td style="padding:8px 10px;font-weight:600;color:var(--c1)">${_escH(String(q.rfqNo||''))}${hasImg?'<span style="margin-left:4px;font-size:.65rem;background:rgba(99,102,241,.2);color:#a78bfa;padding:1px 5px;border-radius:4px">📷</span>':''}</td>
      <td style="padding:8px 10px;color:var(--t2)">${_escH(_rfqThDate(q.date||''))}</td>
      <td style="padding:8px 10px">${_escH(String(q.supplier||'—'))}</td>
      <td style="padding:8px 10px;text-align:center">${items.length} รายการ</td>
      <td style="padding:8px 10px;color:var(--t3);font-size:.75rem">${_escH(String(q.remark||'—'))}</td>
      <td style="padding:8px 10px;text-align:center;white-space:nowrap">
        <button onclick="_rfqCreatePO(${ci})" style="padding:4px 9px;border-radius:6px;border:1px solid rgba(52,211,153,.4);background:rgba(52,211,153,.1);color:#34d399;font-size:.72rem;cursor:pointer;font-family:Sarabun,sans-serif;margin-right:4px">🧾 สร้าง PO</button><button onclick="_rfqLoadFromList(${ci})" style="padding:4px 9px;border-radius:6px;border:1px solid rgba(99,102,241,.4);background:rgba(99,102,241,.1);color:#a78bfa;font-size:.72rem;cursor:pointer;font-family:Sarabun,sans-serif;margin-right:4px">✏️ แก้ไข</button><button onclick="_rfqPrintFromList(${ci})" style="padding:4px 9px;border-radius:6px;border:1px solid var(--bc-div);background:var(--bg-card);color:var(--t1);font-size:.72rem;cursor:pointer;font-family:Sarabun,sans-serif;margin-right:4px">🖨️ พิมพ์</button>
        <button onclick="_rfqDeleteFromList(${ci})" style="padding:4px 9px;border-radius:6px;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.08);color:#f87171;font-size:.72rem;cursor:pointer;font-family:Sarabun,sans-serif">🗑️ ลบ</button>
      </td>
    </tr>`;
  }).join('');
}

function _rfqResetFilters() {
  const s = $('rfqFilterSearch'); if (s) s.value = '';
  const f = $('rfqFilterFrom');   if (f) f.value = '';
  const t = $('rfqFilterTo');     if (t) t.value = '';
  _rfqRenderList();
}

// ── ลบ ────────────────────────────────────────────────────────
// ── สร้าง PO จาก RFQ โดยตรง ─────────────────────────────────
async function _rfqCreatePO(i) {
  const q = _rfqListCache[i];
  if (!q) return;
  // ยืนยันก่อนสร้าง
  const { isConfirmed } = await Swal.fire({
    title: 'สร้างใบสั่งซื้อจากใบขอราคา?',
    html: `<b>${_escH(q.rfqNo||'')}</b><br><span style="font-size:.85rem;color:#94a3b8">${_escH(q.supplier||'')} · ${Array.isArray(q.items)?q.items.length:0} รายการ</span>`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: '🧾 สร้าง PO',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#16a34a',
    cancelButtonColor: '#6366f1',
    background: '#0d1b2a', color: '#cce4ff',
  });
  if (!isConfirmed) return;
  // สลับไปแท็บ PO
  if (typeof switchTab === 'function') switchTab('po');
  else if (typeof showTab === 'function') showTab('po');
  // รอ DOM พร้อม แล้วสร้างฟอร์มใหม่ + apply RFQ
  await new Promise(r => setTimeout(r, 150));
  if (typeof _poNewForm === 'function') await _poNewForm();
  await new Promise(r => setTimeout(r, 200));
  _poApplyRFQ(i);
}

async function _rfqDeleteFromList(i) {
  const q = _rfqListCache[i];
  if (!q) return;
  const { isConfirmed } = await Swal.fire({
    title: 'ลบใบขอราคา?', html: `<b>${_escH(String(q.rfqNo||''))}</b> — ${_escH(String(q.supplier||''))}`,
    icon: 'warning', showCancelButton:true,
    confirmButtonText:'ลบ', cancelButtonText:'ยกเลิก',
    confirmButtonColor:'#ef4444', cancelButtonColor:'#6366f1',
    background:'#0d1b2a', color:'#cce4ff',
  });
  if (!isConfirmed) return;
  try {
    await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'deleteRFQ', rfqNo: q.rfqNo }) });
    _rfqListCache.splice(i, 1);
    _rfqRenderList();
    Swal.fire({ toast:true, position:'top-end', icon:'success', title:'ลบแล้ว', showConfirmButton:false, timer:1500, timerProgressBar:true });
  } catch(err) {
    Swal.fire({ icon:'error', title:'ลบไม่สำเร็จ', text:String(err), background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1' });
  }
}

// ── พิมพ์ (จากฟอร์ม) ─────────────────────────────────────────
function _rfqPrint() {
  const items = _rfqRows.filter(r => r.name.trim());
  if (!items.length) {
    Swal.fire({ icon:'warning', title:'กรุณากรอกรายการก่อนพิมพ์', background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1' });
    return;
  }
  const data = {
    rfqNo:    $('rfq_no').value || _rfqGenNo(),
    date:     $('rfq_date').value,
    supplier: $('rfq_supplier').value.trim(),
    items,
    remark:   $('rfq_remark').value.trim(),
  };
  _rfqOpenPrintWindow(data);
}

function _rfqPrintFromList(i) {
  const q = _rfqListCache[i];
  if (!q) return;
  _rfqOpenPrintWindow({ rfqNo: q.rfqNo, date: q.date, supplier: q.supplier,
    items: Array.isArray(q.items) ? q.items : [], remark: q.remark });
}

function _rfqLoadFromList(i) {
  const q = _rfqListCache[i];
  if (!q) return;
  _rfqEditNo = q.rfqNo;
  if ($('rfq_formTitle')) $('rfq_formTitle').textContent = 'แก้ไขใบขอราคา';
  if ($('rfq_no'))       $('rfq_no').value = q.rfqNo;
  if ($('rfq_date'))     $('rfq_date').value = _rfqThaiToIso(q.date||'');
  if ($('rfq_supplier')) $('rfq_supplier').value = q.supplier || '';
  if ($('rfq_remark'))   $('rfq_remark').value = q.remark || '';
  if ($('rfq_status'))   $('rfq_status').textContent = '';
  _rfqRows = Array.isArray(q.items) && q.items.length ? q.items.map(r => ({
    name: r.name||'', qty: r.qty||'1', unit: r.unit||'ชิ้น', remark: r.remark||'', img: r.img||''
  })) : [_rfqEmptyRow()];
  _rfqRenderItems();
  // scroll to form
  const card = $('rfqFormBody');
  if (card) card.closest('.card')?.scrollIntoView({ behavior:'smooth', block:'start' });
}

function _rfqOpenPrintWindow(data) {
  const co   = (typeof getCompanyInfo === 'function') ? getCompanyInfo() : {};
  const coName   = co.name    || 'PTTS';
  const coAddr   = co.address || '';
  const coTel    = co.tel     || '';
  const coTaxId  = co.taxId   || '';
  const thDate   = _rfqThDate(data.date);
  const itemsHtml = data.items.map((r, i) => {
    const imgCell = r.img
      ? `<img src="${r.img}" style="width:70px;height:70px;object-fit:cover;border-radius:4px;print-color-adjust:exact;-webkit-print-color-adjust:exact">`
      : '';
    return `<tr>
      <td style="border:1px solid #bbb;padding:5px 7px;text-align:center;font-size:11px">${i+1}</td>
      <td style="border:1px solid #bbb;padding:5px 7px;text-align:center">${imgCell}</td>
      <td style="border:1px solid #bbb;padding:5px 7px;font-size:11px">${_escH(r.name)}</td>
      <td style="border:1px solid #bbb;padding:5px 7px;text-align:center;font-size:11px">${_escH(String(r.qty))}</td>
      <td style="border:1px solid #bbb;padding:5px 7px;text-align:center;font-size:11px">${_escH(r.unit||'ชิ้น')}</td>
      <td style="border:1px solid #bbb;padding:5px 7px;font-size:11px">${_escH(r.remark||'')}</td>
      <td style="border:1px solid #bbb;padding:5px 7px;text-align:right;font-size:11px"> </td>
      <td style="border:1px solid #bbb;padding:5px 7px;text-align:right;font-size:11px"> </td>
    </tr>`;
  }).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>ใบขอราคา ${_escH(data.rfqNo||'')}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Sarabun',sans-serif;font-size:13px;color:#111;background:#fff;padding:20px}
    @media print{body{padding:0}@page{size:A4;margin:12mm 10mm}}
    table{width:100%;border-collapse:collapse}
    th{background:#f3f4f6;font-weight:700;font-size:11px}
  </style></head><body>
  <div style="max-width:720px;margin:0 auto;padding:10px">
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
      <div>
        <div style="font-size:16px;font-weight:800;color:#111">${_escH(coName)}</div>
        <div style="font-size:10px;color:#555;margin-top:2px">${_escH(coAddr)}</div>
        <div style="font-size:10px;color:#555">โทร: ${_escH(coTel)}${coTaxId ? ' &nbsp;|&nbsp; เลขภาษี: ' + _escH(coTaxId) : ''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:18px;font-weight:800;letter-spacing:.5px;color:#1e3a5f">ใบขอราคา</div>
        <div style="font-size:10px;color:#555">REQUEST FOR QUOTATION</div>
        <div style="font-size:11px;font-weight:700;margin-top:4px">เลขที่: ${_escH(data.rfqNo||'')}</div>
        <div style="font-size:10px;color:#555">วันที่: ${_escH(thDate)}</div>
      </div>
    </div>
    <!-- Supplier -->
    <div style="border:1px solid #ccc;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:11px">
      <div style="font-weight:700;margin-bottom:2px">เรียน: ${_escH(data.supplier||'…………………………………………………………')}</div>
      <div style="color:#555">กรุณาเสนอราคาสินค้า/วัสดุตามรายการด้านล่าง และส่งกลับภายในกำหนด</div>
    </div>
    <!-- Items table -->
    <table>
      <thead>
        <tr>
          <th style="border:1px solid #bbb;padding:6px 8px;text-align:center;width:4%">#</th>
          <th style="border:1px solid #bbb;padding:6px 8px;text-align:center;width:12%">รูป</th>
          <th style="border:1px solid #bbb;padding:6px 8px;text-align:left;width:28%">รายการสินค้า/วัสดุ</th>
          <th style="border:1px solid #bbb;padding:6px 8px;text-align:center;width:8%">จำนวน</th>
          <th style="border:1px solid #bbb;padding:6px 8px;text-align:center;width:8%">หน่วย</th>
          <th style="border:1px solid #bbb;padding:6px 8px;text-align:left;width:18%">หมายเหตุ</th>
          <th style="border:1px solid #bbb;padding:6px 8px;text-align:right;width:11%">ราคา/หน่วย (฿)</th>
          <th style="border:1px solid #bbb;padding:6px 8px;text-align:right;width:11%">รวม (฿)</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
      <tfoot>
        <tr>
          <td colspan="7" style="border:1px solid #bbb;padding:6px 8px;text-align:right;font-weight:700;font-size:11px">รวมทั้งสิ้น</td>
          <td style="border:1px solid #bbb;padding:6px 8px;text-align:right;font-size:11px"> </td>
        </tr>
      </tfoot>
    </table>
    ${data.remark ? `<div style="margin-top:8px;font-size:10px;color:#555">หมายเหตุ: ${_escH(data.remark)}</div>` : ''}
    <!-- Signature -->
    <div style="display:flex;justify-content:space-between;margin-top:36px;font-size:11px">
      <div style="text-align:center;width:45%">
        <div style="border-bottom:1px solid #999;margin-bottom:4px;padding-bottom:28px"></div>
        <div>ผู้ขอราคา / ฝ่ายจัดซื้อ</div>
        <div style="color:#555;margin-top:2px">วันที่ ………………………………</div>
      </div>
      <div style="text-align:center;width:45%">
        <div style="border-bottom:1px solid #999;margin-bottom:4px;padding-bottom:28px"></div>
        <div>ผู้เสนอราคา / ซัพพลายเออร์</div>
        <div style="color:#555;margin-top:2px">วันที่ ………………………………</div>
      </div>
    </div>
  </div>
  <script>(function(){
    function go(){ try{ window.focus(); window.print(); }catch(e){} }
    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(go).catch(function(){ setTimeout(go,700); });
    } else { setTimeout(go,700); }
  })();<\/script>
  </body></html>`;
  const win = window.open('','_blank');
  if (!win) { alert('กรุณาอนุญาต popup'); return; }
  win.document.write(html);
  win.document.close();
}

// แปลง ISO (yyyy-MM-dd CE) → dd/mm/yyyy BE
function _rfqDateToThai(isoDate) {
  if (!isoDate) return '';
  const p = String(isoDate).split('-');
  if (p.length !== 3) return isoDate;
  return `${p[2]}/${p[1]}/${parseInt(p[0])+543}`;
}
// แปลง dd/mm/yyyy BE → ISO (yyyy-MM-dd CE) สำหรับใส่กลับ <input type="date">
function _rfqThaiToIso(thaiDate) {
  if (!thaiDate) return '';
  const p = String(thaiDate).split('/');
  if (p.length !== 3) return thaiDate.substring(0,10);
  return `${parseInt(p[2])-543}-${p[1]}-${p[0]}`;
}
// แสดงผลวันที่ — รับได้ทั้ง ISO และ dd/mm/yyyy BE
function _rfqThDate(v) {
  if (!v) return '';
  if (String(v).includes('/')) return String(v); // already Thai
  return _rfqDateToThai(String(v).substring(0,10));
}

// ── โหลด supplier list ──────────────────────────────────────
function _rfqLoadSupplierList(retry) {
  const dl = $('rfq_supplierList');
  if (!dl) return;
  if (typeof _supplierCache !== 'undefined' && _supplierCache.length) {
    dl.innerHTML = _supplierCache.map(s => `<option value="${_escH(String(s.name||''))}"></option>`).join('');
  } else if ((retry||0) < 8) {
    // ยังไม่โหลด — รอแล้วลองใหม่ (สูงสุด 8 ครั้ง × 600ms = 4.8s)
    setTimeout(() => _rfqLoadSupplierList((retry||0)+1), 600);
  } else if (SCRIPT_URL) {
    // ดึงโดยตรงเป็น fallback
    fetch(SCRIPT_URL + '?action=getSuppliers', {mode:'cors'})
      .then(r => r.json())
      .then(d => {
        if (d.suppliers && d.suppliers.length) {
          dl.innerHTML = d.suppliers.map(s => `<option value="${_escH(String(s.name||''))}"></option>`).join('');
        }
      }).catch(()=>{});
  }
}

// ── DOMContentLoaded ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if ($('rfqItemsWrap')) {
    _rfqReset();
    _rfqFetchList();
    setTimeout(_rfqLoadSupplierList, 1200);
  }
});
