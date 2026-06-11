// ══════════════════════════════════════════════════════
// ══ TAB: Order — เชื่อมกับชีต "Order" (ใช้ร่วมกับ AppSheet) ══
// ══════════════════════════════════════════════════════
// คอลัมน์ A-AB (28 คอลัมน์, 0-based) — L-T (11-19) เป็นช่องสำรองของ AppSheet ห้ามแก้
const ORDER_COLS = {
  noQuo: 0, noPO: 1, orderDate: 2, mold: 3, workType: 4, productList: 5,
  qty: 6, material: 7, switch_: 8,
  price: 10,        // K = ราคาขาย
  note: 11,         // L = หมายเหตุ
  poFile: 12,       // M = รูปภาพPO. (ไฟล์แนบ PO)
  statusDeliver: 15,// P = สถานะส่งงาน (แสดงในตาราง, อ่านอย่างเดียว)
  process: 16,      // Q = Process (สถานะงานที่แก้ไขได้ — กำลังผลิต/ส่งซุป/.../เรียบร้อย)
  update: 20, linkImages: 21, status: 22, totalTax: 23, add: 24, my: 25,
  wantDate: 26, customer: 27
};
const ORDER_NUM_COLS = 28;
let _orderCache = [];
let _ordEditNoPO = null;

function _todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
// แปลงวันที่ dd/MM/yyyy (จาก Sheet) <-> yyyy-MM-dd (สำหรับ <input type=date>)
function _ordDateToInput(s) {
  s = String(s||'').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  return s;
}
function _ordDateToSheet(s) {
  s = String(s||'').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${parseInt(m[3])}/${parseInt(m[2])}/${parseInt(m[1])+543}`;
  return s;
}

// อัปเดตพรีวิวข้อมูลจากใบเสนอราคาที่เปิดอยู่
// แถวข้อมูลจากแท็บ DATA ที่เลือกผ่านปุ่ม "📦 AddOrder" — ใช้แทนระบบเดิมที่ดึงจากฟอร์มที่เปิดอยู่ (ช้า/สับสน)
let _ordSourceRow = null;

function updateOrderPreview() {
  const r = _ordSourceRow;
  if (!r) {
    ['ord_previewNoQuo','ord_previewCustomer','ord_previewWorkType','ord_previewProductList','ord_previewQty','ord_previewPrice'].forEach(id => {
      if ($(id)) $(id).textContent = '—';
    });
    if ($('ord_productList')) $('ord_productList').value = '';
    if ($('ord_material'))    $('ord_material').textContent = '—';
    _ordUpdateCreateBtn();
    return;
  }
  if ($('ord_previewNoQuo'))    $('ord_previewNoQuo').textContent    = r[DT.noQuo] || '—';
  if ($('ord_previewCustomer')) $('ord_previewCustomer').textContent = (() => {
    const sel = $('f_contact');
    const val = r[DT.contact] || '';
    if (sel) {
      const opt = Array.from(sel.options).find(o => o.value === val);
      if (opt) return opt.text || '—';
    }
    return val || '—';
  })();
  if ($('ord_previewWorkType')) $('ord_previewWorkType').textContent = r[DT.workType] || '—';
  if ($('ord_previewQty'))      $('ord_previewQty').textContent      = r[DT.unit] || '—';
  if ($('ord_previewPrice'))    $('ord_previewPrice').textContent    = r[DT.sellPrice] || '—';

  // รายการสินค้า = ขนาด (OD×ID×H) จาก DATA — ห้ามแก้ไขในการ์ด Order
  const od = r[DT.od]||'', id2 = r[DT.id]||'', h = r[DT.h]||'';
  const sizeVal = (od && id2 && h) ? `${od}×${id2}×${h}` : (r[DT.size]||'');
  const plEl = $('ord_productList');
  if (plEl) plEl.value = sizeVal;
  if ($('ord_previewProductList')) $('ord_previewProductList').textContent = sizeVal || '—';

  // แม่พิมพ์ — ตรวจสอบ OD จาก DATA เทียบกับตารางแม่พิมพ์ ว่ามีหรือไม่ (แก้ไขเพิ่มเติมได้ ไม่ทับค่าที่แก้เอง)
  _ordAutoFill('ord_mold', _ordCheckMoldOd());

  // หมายเหตุ — ดึงค่ามาให้อัตโนมัติ แต่แก้ไขเพิ่มเติมได้ (ไม่ทับค่าที่แก้เอง)
  _ordAutoFill('ord_note', r[DT.remark] || '');

  // วัตถุดิบ — ดึงจาก DATA แสดงเป็น label อย่างเดียว
  if ($('ord_material')) $('ord_material').textContent = r[DT.rawMat] || '—';

  _ordUpdateCreateBtn();
}
// เปลี่ยนข้อความ/พฤติกรรมปุ่มหลัก ตามว่าการ์ดมีข้อมูลจาก DATA แล้วหรือยัง
function _ordUpdateCreateBtn() {
  const btn = $('ord_createBtn');
  if (!btn) return;
  btn.innerHTML = _ordSourceRow ? '➕ สร้าง Order' : '🚀 เริ่มสร้าง Order';
}
// กดปุ่มหลัก: ถ้ายังไม่มีข้อมูลจาก DATA → ไปแท็บ DATA เพื่อกด "Order", ถ้ามีแล้ว → สร้าง Order
function _ordCreateBtnClick() {
  if (!_ordSourceRow) {
    switchTab('data');
    return;
  }
  createOrder();
}
// ตรวจสอบว่า OD ของรายการ ตรงกับตารางแม่พิมพ์หรือไม่ -> คืนค่า OD ถ้าตรง, "ไม่มี" ถ้าไม่ตรง
function _ordCheckMoldOd() {
  const odVal = parseFloat(_ordSourceRow ? _ordSourceRow[DT.od] : NaN);
  if (!odVal) return 'ไม่มี';
  const row = (_moldData || []).find(m => m.od === odVal);
  if (!row) return 'ไม่มี';
  const ids = row.ids || [];
  const noMold = ids.some(v => v.includes('ไม่มีพิมพ์'));
  if (noMold || ids.length === 0) return 'ไม่มี';
  return String(odVal);
}
// เติมค่าอัตโนมัติลงช่อง โดยไม่ทับค่าที่ผู้ใช้แก้ไขเองแล้ว
function _ordAutoFill(id, val) {
  const el = $(id);
  if (!el) return;
  if (el.value === '' || el.value === el.dataset.autoVal) {
    el.value = val;
    el.dataset.autoVal = val;
  }
}

// เคลียร์การ์ด "สร้าง Order" กลับสู่สถานะว่าง (ใช้ทั้งตอนสร้างสำเร็จ และตอนพบ No.Quo+No.PO ซ้ำ)
function _ordResetCard() {
  if ($('ord_noPO')) $('ord_noPO').value = '';
  if ($('ord_note'))  { $('ord_note').value = ''; delete $('ord_note').dataset.autoVal; }
  if ($('ord_mold'))  { $('ord_mold').value = ''; delete $('ord_mold').dataset.autoVal; }
  if ($('ord_workStatus')) $('ord_workStatus').value = 'ปรกติ';
  _ordSourceRow = null;
  updateOrderPreview();
  _ordClearPoFile('ord');
}

// ปุ่ม "📦 AddOrder" จากตาราง DATA (เฉพาะแถวที่สถานะ = "รอสรุป")
function dtAddOrder(idx) {
  const tbody = $('dtBody');
  const rows = tbody && tbody._filteredRows;
  if (!rows || !rows[idx]) return;
  const r = rows[idx];

  Swal.fire({
    title: 'สร้าง Order จากใบเสนอราคานี้?',
    html: `<small>No.Quo: <b>${r[DT.noQuo]}</b> — ข้อมูลในการ์ด "สร้าง Order" จะถูกแทนที่ด้วยข้อมูลจากรายการนี้</small>`,
    icon: 'question', showCancelButton: true,
    confirmButtonText: '✅ ดึงข้อมูล', cancelButtonText: 'ยกเลิก',
    background: '#0a1c2e', color: '#f1f5f9',
    confirmButtonColor: '#f59e0b', cancelButtonColor: '#475569'
  }).then(res => {
    if (!res.isConfirmed) return;
    _ordResetCard();   // ล้างค่าเก่าก่อน
    _ordSourceRow = r; // แล้วค่อยตั้งแถวใหม่
    switchTab('order');
  });
}

// เมื่อเลือกไฟล์ PO ใหม่ — แสดงชื่อไฟล์ + รูปตัวอย่าง (ถ้าเป็นรูปภาพ) + ปุ่มลบ
function _ordPoFileChanged(prefix) {
  const input = $(prefix + '_poFile');
  const file  = input?.files?.[0];
  const nameEl  = $(prefix + '_poFileName');
  const clearEl = $(prefix + '_poFileClear');
  const imgEl   = $(prefix + '_poFilePreview');
  if (!file) { _ordClearPoFile(prefix); return; }
  if (nameEl)  nameEl.textContent = file.name;
  if (clearEl) clearEl.style.display = 'inline-block';
  if (imgEl) {
    if (file.type && file.type.startsWith('image/')) {
      imgEl.src = URL.createObjectURL(file);
      imgEl.style.display = 'block';
    } else {
      imgEl.style.display = 'none';
      imgEl.removeAttribute('src');
    }
  }
}
// ลบไฟล์ PO ที่เลือกไว้
function _ordClearPoFile(prefix) {
  const input  = $(prefix + '_poFile');
  const nameEl = $(prefix + '_poFileName');
  const clearEl = $(prefix + '_poFileClear');
  const imgEl  = $(prefix + '_poFilePreview');
  if (input)  input.value = '';
  if (nameEl) nameEl.textContent = 'ยังไม่ได้เลือกไฟล์ใด';
  if (clearEl) clearEl.style.display = 'none';
  if (imgEl) { imgEl.style.display = 'none'; imgEl.removeAttribute('src'); }
}

// แปลงไฟล์เป็น base64 (ตัด prefix data:...;base64, ออก)
function _ordFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || '';
      const idx = result.indexOf('base64,');
      resolve(idx >= 0 ? result.slice(idx + 7) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
// อัปโหลดไฟล์ PO ไปยัง Drive ผ่าน Apps Script แล้วคืน URL
async function _ordUploadPoFile(file) {
  const base64 = await _ordFileToBase64(file);
  const res = await fetch(SCRIPT_URL, {
    method: 'POST', mode: 'cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'uploadOrderFile', fileName: file.name, mimeType: file.type, base64 })
  });
  const data = await res.json();
  if (data && data.status === 'ok') return data.url;
  throw new Error((data && data.message) || 'upload failed');
}

// สร้าง Order ใหม่จากใบเสนอราคาที่เปิดอยู่
async function createOrder() {
  if (!SCRIPT_URL) {
    Swal.fire({icon:'info',title:'ยังไม่ตั้งค่า URL',text:'กรุณาใส่ Apps Script URL ก่อน',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    return;
  }
  const noQuo = _ordSourceRow ? (_ordSourceRow[DT.noQuo] || '') : '';
  const noPO  = $('ord_noPO').value.trim();
  if (!noQuo) {
    Swal.fire({icon:'warning',title:'ไม่พบข้อมูลใบเสนอราคา',text:'กรุณากดปุ่ม "📦 AddOrder" จากตาราง DATA ก่อนสร้าง Order',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    return;
  }
  if (!noPO) {
    Swal.fire({icon:'warning',title:'กรุณาใส่ No.PO',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    return;
  }

  // ตรวจสอบว่ากรอกข้อมูลครบถ้วนก่อนบันทึก
  const missing = [];
  if (!$('ord_orderDate')?.value)            missing.push('วันที่สั่งซื้อ');
  if (!$('ord_wantDate')?.value)             missing.push('วันที่ต้องการ');
  if (!($('ord_mold')?.value || '').trim())  missing.push('แม่พิมพ์');
  if (!($('ord_note')?.value || '').trim())  missing.push('หมายเหตุ');
  if (!$('ord_poFile')?.files?.[0])          missing.push('แนบไฟล์ PO');
  if (missing.length) {
    Swal.fire({
      icon:'warning', title:'กรอกข้อมูลไม่ครบถ้วน',
      html:'กรุณากรอก/แนบข้อมูลให้ครบก่อนสร้าง Order:<br><b>' + missing.join(', ') + '</b>',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1'
    });
    return;
  }

  // ตรวจสอบ No.Quo ซ้ำ (คอลัมน์ A ห้ามซ้ำ)
  const dupQuo = (_orderCache || []).some(r =>
    String(r[ORDER_COLS.noQuo] || '').trim() === String(noQuo).trim()
  );
  if (dupQuo) {
    await Swal.fire({
      icon: 'error', title: 'พบ No.Quo ซ้ำ',
      html: `มี Order ที่ใช้ <b>No.Quo: ${noQuo}</b> อยู่แล้ว<br><span style="font-size:.8rem;color:#8b8aaa">No.Quo ห้ามซ้ำ ไม่สามารถสร้าง Order นี้ได้</span>`,
      background:'#0d1b2a', color:'#cce4ff',
      confirmButtonText: 'ตกลง', confirmButtonColor:'#dc2626'
    });
    if ($('ord_noPO')) { $('ord_noPO').value = ''; $('ord_noPO').focus(); }
    return;
  }

  // ตรวจสอบ No.PO ซ้ำ (คอลัมน์ B ห้ามซ้ำ)
  const dupPO = (_orderCache || []).some(r =>
    String(r[ORDER_COLS.noPO] || '').trim() === String(noPO).trim()
  );
  if (dupPO) {
    await Swal.fire({
      icon: 'error', title: 'พบ No.PO ซ้ำ',
      html: `มี Order ที่ใช้ <b>No.PO: ${noPO}</b> อยู่แล้ว<br><span style="font-size:.8rem;color:#8b8aaa">No.PO ห้ามซ้ำ ไม่สามารถสร้าง Order นี้ได้</span>`,
      background:'#0d1b2a', color:'#cce4ff',
      confirmButtonText: 'ตกลง', confirmButtonColor:'#dc2626'
    });
    if ($('ord_noPO')) { $('ord_noPO').value = ''; $('ord_noPO').focus(); }
    return;
  }

  // ยืนยันก่อนสร้าง Order จริง
  const confirmRes = await Swal.fire({
    icon: 'question', title: 'ยืนยันการสร้าง Order?',
    html: `No.Quo: <b>${noQuo}</b><br>No.PO: <b>${noPO}</b>`,
    showCancelButton: true,
    confirmButtonText: '✅ ยืนยัน', cancelButtonText: 'ยกเลิก',
    background: '#0a1c2e', color: '#f1f5f9',
    confirmButtonColor: '#22c55e', cancelButtonColor: '#475569'
  });
  if (!confirmRes.isConfirmed) return;

  const customer = ($('ord_previewCustomer')?.textContent || '').trim().replace(/^—$/, '') || '';

  const row = new Array(ORDER_NUM_COLS).fill('');
  row[ORDER_COLS.noQuo]       = noQuo;
  row[ORDER_COLS.noPO]        = noPO;
  row[ORDER_COLS.orderDate]   = _ordDateToSheet($('ord_orderDate').value || _todayStr());
  row[ORDER_COLS.mold]        = $('ord_mold')?.value || '';
  row[ORDER_COLS.workType]    = _ordSourceRow[DT.workType] || '';
  row[ORDER_COLS.productList] = $('ord_productList').value || '';
  row[ORDER_COLS.qty]         = _ordSourceRow[DT.unit] || '';
  row[ORDER_COLS.material]    = ($('ord_material')?.textContent || '').trim().replace(/^—$/, '') || '';
  row[ORDER_COLS.price]       = _ordSourceRow[DT.sellPrice] || '';
  row[ORDER_COLS.note]        = $('ord_note').value || '';
  row[ORDER_COLS.process]     = $('ord_status').value || 'กำลังผลิต';
  row[ORDER_COLS.status]      = $('ord_workStatus')?.value || 'ปรกติ';
  row[ORDER_COLS.wantDate]    = _ordDateToSheet($('ord_wantDate').value || '');
  row[ORDER_COLS.customer]    = customer;

  const createBtn = $('ord_createBtn');
  const statusEl  = $('ord_createStatus');
  if (createBtn) createBtn.disabled = true;

  try {
    const poFile = $('ord_poFile')?.files?.[0];
    if (poFile) {
      if (statusEl) statusEl.textContent = '⏳ กำลังอัปโหลดไฟล์ PO...';
      row[ORDER_COLS.poFile] = await _ordUploadPoFile(poFile);
    }

    await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'addOrder', row }) });

    // อัปเดตสถานะของรายการต้นทาง (DATA) เป็น "ผ่าน" — แถวเดียวเท่านั้น (ตรวจ noQuo ก่อนส่ง)
    if (statusEl) statusEl.textContent = '⏳ กำลังอัปเดตสถานะ DATA...';
    await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'updateDataStatus', noQuo, status:'ผ่าน' }) });

    Swal.fire({icon:'success',title:'สร้าง Order แล้ว ✅',
      html:`บันทึก Order เรียบร้อย<br><span style="font-size:.8rem;color:#8b8aaa">อัปเดตสถานะ DATA ของ No.Quo: <b>${noQuo}</b> เป็น "ผ่าน" แล้ว</span>`,
      background:'#0d1b2a',color:'#cce4ff',
      confirmButtonColor:'#6366f1', timer:2200, showConfirmButton:false});
    _ordResetCard();
    if (statusEl) statusEl.textContent = '';
    setTimeout(fetchOrders, 1200);
  } catch (err) {
    Swal.fire({icon:'error',title:'เกิดข้อผิดพลาด',text:'ส่งข้อมูลไม่สำเร็จ',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    if (statusEl) statusEl.textContent = '';
  } finally {
    if (createBtn) createBtn.disabled = false;
  }
}

// โหลดรายการ Order จากชีต "Order"
async function fetchOrders() {
  const tbody = $('ordBody');
  if (!tbody) return;
  if (!SCRIPT_URL) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding:30px;text-align:center;color:var(--t3);font-size:.8rem">⚠️ ยังไม่ได้ตั้งค่า Script URL</td></tr>`;
    return;
  }
  tbody.innerHTML = `<tr><td colspan="10" style="padding:30px;text-align:center;color:var(--t3);font-size:.8rem">↻ กำลังโหลด…</td></tr>`;
  try {
    const res = await fetch(SCRIPT_URL + '?action=getOrders', {mode:'cors'});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.status === 'error') throw new Error(data.message || 'unknown');
    _orderCache = (data.rows || []).slice().reverse(); // ใหม่สุดก่อน
    _ordPage = 1;
    renderOrderTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding:30px;text-align:center;color:#f87171;font-size:.8rem">โหลดข้อมูลไม่สำเร็จ: ${err.message}</td></tr>`;
  }
}

const ORD_PAGE_SIZE = 20;
let _ordPage = 1;

function _ordGoPage(p) {
  _ordPage = p;
  renderOrderTable();
}

function _ordTruncate(s, n) {
  s = String(s||'');
  return s.length > n ? s.slice(0, n-1) + '…' : s;
}

function _ordResetFilters() {
  $('ordSearch').value = '';
  $('ordFilterStatus').value = '_not_done';
  $('ordFilterCustomer').value = '';
  $('ordFilterWantFrom').value = '';
  $('ordFilterWantTo').value = '';
  _ordPage = 1;
  renderOrderTable();
}

function renderOrderTable() {
  const tbody = $('ordBody');
  if (!tbody) return;
  const q = ($('ordSearch')?.value || '').trim().toLowerCase();
  let rows = _orderCache;
  if (q) {
    rows = rows.filter(r => [r[ORDER_COLS.noQuo], r[ORDER_COLS.noPO], r[ORDER_COLS.customer], r[ORDER_COLS.productList]]
      .some(v => String(v||'').toLowerCase().includes(q)));
  }

  // ── ตัวกรอง: สถานะงาน (ค่าเริ่มต้น = ซ่อนรายการที่ "เรียบร้อย") ──
  const statusFilter = $('ordFilterStatus')?.value ?? '_not_done';
  if (statusFilter === '_not_done') {
    rows = rows.filter(r => String(r[ORDER_COLS.process]||'').trim() !== 'เรียบร้อย');
  } else if (statusFilter !== '_all') {
    rows = rows.filter(r => String(r[ORDER_COLS.process]||'').trim() === statusFilter);
  }

  // ── ตัวกรอง: ลูกค้า ──
  const custFilter = ($('ordFilterCustomer')?.value || '').trim().toLowerCase();
  if (custFilter) {
    rows = rows.filter(r => String(r[ORDER_COLS.customer]||'').toLowerCase().includes(custFilter));
  }

  // ── ตัวกรอง: ช่วงวันที่ต้องการ ──
  const wantFrom = $('ordFilterWantFrom')?.value || '';
  const wantTo   = $('ordFilterWantTo')?.value || '';
  if (wantFrom || wantTo) {
    rows = rows.filter(r => {
      const iso = _ordDateToInput(r[ORDER_COLS.wantDate]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
      if (wantFrom && iso < wantFrom) return false;
      if (wantTo   && iso > wantTo)   return false;
      return true;
    });
  }
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding:30px;text-align:center;color:var(--t3);font-size:.8rem">ไม่มีข้อมูล Order</td></tr>`;
    $('ordPager').innerHTML = '';
    return;
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / ORD_PAGE_SIZE));
  if (_ordPage > totalPages) _ordPage = totalPages;
  if (_ordPage < 1) _ordPage = 1;
  const startIdx = (_ordPage - 1) * ORD_PAGE_SIZE;
  const pageRows = rows.slice(startIdx, startIdx + ORD_PAGE_SIZE);

  tbody.innerHTML = pageRows.map(r => {
    const noPO  = String(r[ORDER_COLS.noPO]||'');
    const price = parseFloat(r[ORDER_COLS.price]) || 0;
    const productList = String(r[ORDER_COLS.productList]||'');
    const customer    = String(r[ORDER_COLS.customer]||'');
    return `<tr style="border-bottom:1px solid var(--bc-div)">
      <td style="padding:8px 8px;font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r[ORDER_COLS.noQuo]||'—'}</td>
      <td style="padding:8px 8px;font-size:.78rem;font-weight:600;color:var(--c1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${noPO||'—'}</td>
      <td style="padding:8px 8px;font-size:.78rem;white-space:nowrap">${r[ORDER_COLS.orderDate]||'—'}</td>
      <td style="padding:8px 8px;font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${customer.replace(/"/g,'&quot;')}">${_ordTruncate(customer,12)||'—'}</td>
      <td style="padding:8px 8px;font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${productList.replace(/"/g,'&quot;')}">${_ordTruncate(productList,28)||'—'}</td>
      <td style="padding:8px 8px;font-size:.78rem;text-align:center">${r[ORDER_COLS.qty]||'—'}</td>
      <td style="padding:8px 8px;font-size:.78rem;text-align:right;white-space:nowrap">${price ? price.toLocaleString('th-TH',{minimumFractionDigits:2}) : '—'}</td>
      <td style="padding:8px 8px;font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r[ORDER_COLS.process]||'—'}</td>
      <td style="padding:8px 8px;font-size:.78rem;white-space:nowrap">${r[ORDER_COLS.wantDate]||'—'}</td>
      <td style="padding:8px 8px;text-align:center">
        <button onclick="openEditOrder('${noPO.replace(/'/g,"\\'")}')"
          style="padding:5px 10px;border-radius:7px;border:1px solid rgba(99,102,241,.35);
          background:rgba(99,102,241,.1);color:#9b8fff;font-size:.72rem;cursor:pointer">✏️ แก้ไข</button>
      </td>
    </tr>`;
  }).join('');

  // ── ตัวควบคุมแบ่งหน้า ──
  const pager = $('ordPager');
  if (pager) {
    if (totalPages <= 1) {
      pager.innerHTML = `<span>ทั้งหมด ${rows.length} รายการ</span>`;
    } else {
      pager.innerHTML = `
        <button onclick="_ordGoPage(${_ordPage-1})" ${_ordPage<=1?'disabled':''}
          style="padding:5px 12px;border-radius:7px;border:1px solid var(--bc-card);background:var(--bg-card);color:var(--t1);font-size:.75rem;cursor:pointer;${_ordPage<=1?'opacity:.4;cursor:not-allowed':''}">‹ ก่อนหน้า</button>
        <span>หน้า ${_ordPage} / ${totalPages} (ทั้งหมด ${rows.length} รายการ)</span>
        <button onclick="_ordGoPage(${_ordPage+1})" ${_ordPage>=totalPages?'disabled':''}
          style="padding:5px 12px;border-radius:7px;border:1px solid var(--bc-card);background:var(--bg-card);color:var(--t1);font-size:.75rem;cursor:pointer;${_ordPage>=totalPages?'opacity:.4;cursor:not-allowed':''}">ถัดไป ›</button>
      `;
    }
  }
}

function openEditOrder(noPO) {
  const r = _orderCache.find(row => String(row[ORDER_COLS.noPO]) === String(noPO));
  if (!r) return;
  _ordEditNoPO = noPO;
  $('ordEdit_noPO').textContent  = noPO;
  $('ordEdit_orderDate').value   = _ordDateToInput(r[ORDER_COLS.orderDate]);
  $('ordEdit_wantDate').value    = _ordDateToInput(r[ORDER_COLS.wantDate]);
  $('ordEdit_status').value      = r[ORDER_COLS.process] || '';
  $('ordEdit_qty').value         = r[ORDER_COLS.qty] || '';
  $('ordEdit_price').value       = r[ORDER_COLS.price] || '';
  $('ordEdit_productList').value = r[ORDER_COLS.productList] || '';
  $('ordEdit_material').value    = r[ORDER_COLS.material] || '';
  $('ordEdit_note').value        = r[ORDER_COLS.note] || '';
  if ($('ordEdit_workStatus')) $('ordEdit_workStatus').value = r[ORDER_COLS.status] || 'ปรกติ';
  _ordClearPoFile('ordEdit');
  const poUrl = r[ORDER_COLS.poFile] || '';
  if ($('ordEdit_poLinkWrap')) {
    $('ordEdit_poLinkWrap').innerHTML = poUrl
      ? `<a href="${poUrl}" target="_blank" rel="noopener">📎 ดูไฟล์ PO เดิม</a>`
      : '';
  }
  $('orderEditModal').style.display = 'flex';
}
function closeOrderEdit() {
  $('orderEditModal').style.display = 'none';
  _ordEditNoPO = null;
}
async function saveOrderEdit() {
  if (!_ordEditNoPO) return;
  const r = _orderCache.find(row => String(row[ORDER_COLS.noPO]) === String(_ordEditNoPO));
  if (!r) return;
  const row = r.slice();
  while (row.length < ORDER_NUM_COLS) row.push('');
  row[ORDER_COLS.orderDate]   = _ordDateToSheet($('ordEdit_orderDate').value);
  row[ORDER_COLS.wantDate]    = _ordDateToSheet($('ordEdit_wantDate').value);
  row[ORDER_COLS.process]     = $('ordEdit_status').value;
  row[ORDER_COLS.status]      = $('ordEdit_workStatus')?.value || row[ORDER_COLS.status] || 'ปรกติ';
  row[ORDER_COLS.qty]         = $('ordEdit_qty').value;
  row[ORDER_COLS.price]       = $('ordEdit_price').value;
  row[ORDER_COLS.productList] = $('ordEdit_productList').value;
  row[ORDER_COLS.material]    = $('ordEdit_material').value;
  row[ORDER_COLS.note]        = $('ordEdit_note').value;
  row[ORDER_COLS.poFile]      = r[ORDER_COLS.poFile] || '';

  const saveBtn  = $('ordEdit_saveBtn');
  const statusEl = $('ordEdit_status_msg');
  if (saveBtn) saveBtn.disabled = true;

  try {
    const poFile = $('ordEdit_poFile')?.files?.[0];
    if (poFile) {
      if (statusEl) statusEl.textContent = '⏳ กำลังอัปโหลดไฟล์ PO...';
      row[ORDER_COLS.poFile] = await _ordUploadPoFile(poFile);
    }

    await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'updateOrder', noPO: _ordEditNoPO, row }) });

    Swal.fire({icon:'success',title:'บันทึกแล้ว ✅',background:'#0d1b2a',color:'#cce4ff',
      confirmButtonColor:'#6366f1', timer:1300, showConfirmButton:false});
    if (statusEl) statusEl.textContent = '';
    closeOrderEdit();
    setTimeout(fetchOrders, 1000);
  } catch (err) {
    Swal.fire({icon:'error',title:'เกิดข้อผิดพลาด',text:'บันทึกไม่สำเร็จ',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    if (statusEl) statusEl.textContent = '';
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}
