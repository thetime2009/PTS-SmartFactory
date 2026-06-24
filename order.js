// ══════════════════════════════════════════════════════
// ══ TAB: Order — เชื่อมกับชีต "Order" (ใช้ร่วมกับ AppSheet) ══
// ══════════════════════════════════════════════════════
// คอลัมน์ A-AB (28 คอลัมน์, 0-based) — L-T (11-19) เป็นช่องสำรองของ AppSheet ห้ามแก้
const ORDER_COLS = {
  noQuo: 0, noPO: 1, orderDate: 2, mold: 3, workType: 4, productList: 5,
  qty: 6, material: 7, switch_: 8,
  price: 10,        // K = ราคาขาย
  note: 11,         // L = หมายเหตุ
  poFile: 21,       // V = รูปภาพPO. ลิงก์เปิดดู (ไฟล์แนบ PO) — ใช้คอลัมน์ V ไปก่อน
  poFilePath: 12,   // M = รูปภาพPO. path สัมพัทธ์ เช่น ORDER_Images/{เลขที่PO}.รูปภาพPO..{ชื่อไฟล์}.jpg
  jobImg1: 13,      // N = รูปงาน1
  jobImg2: 14,      // O = รูปงาน2
  statusDeliver: 15,// P = สถานะส่งงาน (แสดงในตาราง, อ่านอย่างเดียว)
  process: 16,      // Q = Process (สถานะงานที่แก้ไขได้ — กำลังผลิต/ส่งชุป/.../เรียบร้อย)
  note2: 17,        // R = Note (แสดงในตาราง, อ่านอย่างเดียว)
  update: 20, status: 22, totalTax: 23, add: 24, my: 25,
  wantDate: 26, customer: 27,
  invoiceNo: 28, invoiceDate: 29,  // AC, AD = เลขที่/วันที่ใบกำกับภาษี
  meshOut: 30, meshIn: 31,         // AE, AF = ตะแกรงนอก/ตะแกรงใน
  matTop: 32, matBot: 33,          // AG, AH = ฝาบน/ฝาล่าง
  od: 34, id_: 35, h_: 36,          // AI, AJ, AK = ขนาด OD/ID/H (ตัดเหล็ก)
  wiId: 37                          // AL = WI ที่ผูกกับ Order นี้โดยตรง
};
const ORDER_NUM_COLS = 38;
let _orderCache = [];
let _wiCache = []; // WI list โหลดจาก backend (match ด้วย OD+ID+H+workType)
const ORDER_LOAD_LIMIT = 100; // โหลดปกติ = 100 รายการล่าสุด, กด "โหลดทั้งหมด" = 0 (ทั้งหมด)
let _itemMasterCache = []; // รายการสินค้า/บริการที่ใช้บ่อย (Item Master) — โหลดจาก fetchItemMaster()
let _ordEditNoPO = null;
let _ordPoFileBlobs = {};  // { prefix: File } — เก็บ blob หลังแก้ไขรูป PO
let _trkPage = parseInt(localStorage.getItem('ptts_trk_page')) || 1;
const TRK_PAGE_SIZE = 10;

function _todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
// แปลงวันที่ dd/MM/yyyy (จาก Sheet) <-> yyyy-MM-dd (สำหรับ <input type=date>)
function _ordDateToInput(s) {
  s = String(s||'').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    let yyyy = parseInt(m[3]);
    if (yyyy > 2400) yyyy -= 543; // พ.ศ. -> ค.ศ. (กันบันทึกซ้ำเป็น 3112)
    return yyyy + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0');
  }
  return s;
}
function _ordDateToSheet(s) {
  s = String(s||'').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${parseInt(m[3])}/${parseInt(m[2])}/${parseInt(m[1])+543}`;
  return s;
}
// ตรวจสอบว่าวันที่ dd/MM/yyyy(พ.ศ.) อยู่ในเดือนนี้หรือเดือนที่แล้วหรือไม่
function _ordIsRecentMonth(s) {
  s = String(s||'').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return false;
  const mm = parseInt(m[2]);
  let yyyy = parseInt(m[3]);
  if (yyyy > 2400) yyyy -= 543; // พ.ศ. -> ค.ศ.
  const now = new Date();
  const curKey = now.getFullYear()*12 + now.getMonth();
  const rowKey = yyyy*12 + (mm-1);
  const diff = curKey - rowKey;
  return diff >= 0 && diff <= 1;
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
    if ($('ord_customer')) $('ord_customer').value = '';
    if ($('ord_workType')) $('ord_workType').value = '';
    if ($('ord_productList')) $('ord_productList').value = '';
    if ($('ord_material'))    $('ord_material').textContent = '—';
    _ordUpdateCreateBtn();
    return;
  }
  if ($('ord_previewNoQuo'))    $('ord_previewNoQuo').textContent    = r[DT.noQuo] || '—';
  const _custDisplayVal = (() => {
    const sel = $('f_contact');
    const val = r[DT.contact] || '';
    if (sel) {
      const opt = Array.from(sel.options).find(o => o.value === val);
      if (opt) return opt.text || '';
    }
    return val || '';
  })();
  if ($('ord_previewCustomer')) $('ord_previewCustomer').textContent = _custDisplayVal || '—';
  if ($('ord_customer') && !$('ord_customer').dataset.userEdit) $('ord_customer').value = _custDisplayVal;
  if ($('ord_previewWorkType')) $('ord_previewWorkType').textContent = r[DT.workType] || '—';
  if ($('ord_workType') && !$('ord_workType').dataset.userEdit)   $('ord_workType').value  = r[DT.workType] || '';
  if ($('ord_previewQty'))      $('ord_previewQty').textContent      = r[DT.unit] || '—';
  if ($('ord_previewPrice'))    $('ord_previewPrice').textContent    = r[DT.sellPrice] || '—';
  // จำนวน/ราคา — ดึงจากใบเสนอราคามาให้อัตโนมัติ แต่แก้ไขให้ตรงกับ PO จริงได้ (ไม่ทับค่าที่แก้เอง)
  _ordAutoFill('ord_qty',   r[DT.unit]      || '');
  _ordAutoFill('ord_price', r[DT.sellPrice] || '');

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

  // ตะแกรงนอก/ตะแกรงใน — ดึงจาก DATA มาให้อัตโนมัติ แต่แก้ไขเพิ่มเติมได้ (ไม่ทับค่าที่แก้เอง)
  _ordAutoFillSelect('ord_meshOut', r[DT.meshOut] || '');
  _ordAutoFillSelect('ord_meshIn',  r[DT.meshIn]  || '');

  // ฝาบน/ฝาล่าง — ดึงจาก DATA มาให้อัตโนมัติ แต่แก้ไขเพิ่มเติมได้ (ไม่ทับค่าที่แก้เอง)
  _ordAutoFillSelect('ord_matTop', r[DT.matTop] || '');
  _ordAutoFillSelect('ord_matBot', r[DT.matBot] || '');
  if ($('ord_od')) $('ord_od').value = r[DT.od]  || '';
  if ($('ord_id')) $('ord_id').value = r[DT.id]  || '';
  if ($('ord_h'))  $('ord_h').value  = r[DT.h]   || '';

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

// เติมตัวเลือกในช่อง select ของฝาบน/ฝาล่าง/ตะแกรงนอก/ตะแกรงใน จากรายการ MAT (ฝา/ตะแกรง ที่ตั้งไว้ในแท็บ MAT)
function _ordPopulateMatMeshDatalists() {
  const matCodes  = (_localMatFlap || []).map(m => String(m.code || '').trim()).filter(Boolean);
  const meshCodes = (_localMatMesh || []).map(m => String(m.code || '').trim()).filter(Boolean);
  const matOpts  = ['', ...Array.from(new Set(matCodes)).sort()];
  const meshOpts = ['', ...Array.from(new Set(meshCodes)).sort()];
  ['ord_matTop', 'ord_matBot'].forEach(id => _ordFillSelectOptions(id, matOpts));
  ['ord_meshOut', 'ord_meshIn'].forEach(id => _ordFillSelectOptions(id, meshOpts));
}

// เติม <option> ให้ select โดยคงค่าที่เลือกอยู่ไว้ (ถ้าค่าเดิมไม่อยู่ในลิสต์ ให้เพิ่มเป็น option พิเศษ)
function _ordFillSelectOptions(id, opts) {
  const el = $(id);
  if (!el) return;
  const cur = el.value;
  el.innerHTML = opts.map(v => `<option value="${_escH(v)}">${v ? _escH(v) : '—'}</option>`).join('');
  if (cur && !opts.includes(cur)) el.appendChild(new Option(cur, cur));
  el.value = cur;
}

// เติมค่าอัตโนมัติลงช่อง select โดยไม่ทับค่าที่ผู้ใช้แก้ไขเองแล้ว (เพิ่ม option ใหม่ถ้ายังไม่มีในลิสต์)
function _ordAutoFillSelect(id, val) {
  const el = $(id);
  if (!el) return;
  if (el.value === '' || el.value === el.dataset.autoVal) {
    if (val && !Array.from(el.options).some(o => o.value === val)) {
      el.appendChild(new Option(val, val));
    }
    el.value = val;
    el.dataset.autoVal = val;
  }
}

// เคลียร์การ์ด "สร้าง Order" กลับสู่สถานะว่าง (ใช้ทั้งตอนสร้างสำเร็จ และตอนพบ No.Quo+No.PO ซ้ำ)
function _ordResetCard() {
  if ($('ord_noPO')) $('ord_noPO').value = '';
  if ($('ord_note'))  { $('ord_note').value = ''; delete $('ord_note').dataset.autoVal; }
  if ($('ord_note2')) { $('ord_note2').value = ''; }
  if ($('ord_mold'))  { $('ord_mold').value = ''; delete $('ord_mold').dataset.autoVal; }
  if ($('ord_meshOut')) { $('ord_meshOut').value = ''; delete $('ord_meshOut').dataset.autoVal; }
  if ($('ord_meshIn'))  { $('ord_meshIn').value = '';  delete $('ord_meshIn').dataset.autoVal; }
  if ($('ord_matTop')) { $('ord_matTop').value = ''; delete $('ord_matTop').dataset.autoVal; }
  if ($('ord_matBot')) { $('ord_matBot').value = ''; delete $('ord_matBot').dataset.autoVal; }
  if ($('ord_od')) $('ord_od').value = '';
  if ($('ord_id')) $('ord_id').value = '';
  if ($('ord_h'))  $('ord_h').value  = '';
  if ($('ord_qty'))   { $('ord_qty').value = '';   delete $('ord_qty').dataset.autoVal; }
  if ($('ord_price')) { $('ord_price').value = ''; delete $('ord_price').dataset.autoVal; }
  if ($('ord_workStatus')) $('ord_workStatus').value = 'ปรกติ';
  _ordSourceRow = null;
  updateOrderPreview();
  _ordClearPoFile('ord');
  _ordClearJobImg('ord');
}

// ปุ่ม "📦 Order" จากตาราง DATA — ใช้ได้ทุกสถานะ (อาจดึงใบเสนอราคาเดิมมาเปิด Order เลขที่ PO ใหม่)
function dtAddOrder(idx) {
  const tbody = $('dtBody');
  const rows = tbody && tbody._filteredRows;
  if (!rows || !rows[idx]) return;
  const r = rows[idx];
  const noQuo = String(r[DT.noQuo]||'').trim();

  // ตรวจสอบว่า No.Quo นี้ถูกใช้อ้างอิงใน Order เดิมแล้วหรือไม่ (อาจมีหลาย PO)
  const usedIn = (_orderCache || []).filter(o =>
    String(o[ORDER_COLS.noQuo]||'').trim() === noQuo
  ).map(o => String(o[ORDER_COLS.noPO]||'').trim()).filter(Boolean);

  const warnHtml = usedIn.length
    ? `<div style="margin-top:8px;padding:8px;border-radius:8px;background:rgba(245,158,11,.12);color:#fbbf24;font-size:.8rem">
         ⚠️ No.Quo นี้ถูกใช้อ้างอิงกับ PO อยู่แล้ว: <b>${usedIn.join(', ')}</b><br>
         หากดำเนินการต่อ จะเป็นการเปิด Order ใหม่ (เลขที่ PO ใหม่) จากใบเสนอราคาเดิมนี้
       </div>`
    : '';

  Swal.fire({
    title: 'สร้าง Order จากใบเสนอราคานี้?',
    html: `<small>No.Quo: <b>${noQuo}</b> — ข้อมูลในการ์ด "สร้าง Order" จะถูกแทนที่ด้วยข้อมูลจากรายการนี้</small>${warnHtml}`,
    icon: usedIn.length ? 'warning' : 'question', showCancelButton: true,
    confirmButtonText: '✅ ดึงข้อมูล', cancelButtonText: 'ยกเลิก',
    background: '#0a1c2e', color: '#f1f5f9',
    confirmButtonColor: '#f59e0b', cancelButtonColor: '#475569'
  }).then(res => {
    if (!res.isConfirmed) return;
    _ordResetCard();   // ล้างค่าเก่าก่อน
    _ordSourceRow = r; // แล้วค่อยตั้งแถวใหม่
    switchTab('order');
    _ordSubTabSwitch('1'); // force กลับ Sub-tab 1 เสมอ
  });
}

// เมื่อเลือกไฟล์ PO ใหม่ — แสดงชื่อไฟล์ + รูปตัวอย่าง (ถ้าเป็นรูปภาพ) + ปุ่มลบ [Python edit OK]
function _ordPoFileChanged(prefix) {
  const input = $(prefix + '_poFile');
  const file  = input?.files?.[0];
  const nameEl  = $(prefix + '_poFileName');
  const clearEl = $(prefix + '_poFileClear');
  const imgEl   = $(prefix + '_poFilePreview');
  const iconEl  = $(prefix + '_poDropIcon');
  const editBtn = $(prefix + '_poEditBtn');
  if (!file) { _ordClearPoFile(prefix); return; }
  // ไฟล์ใหม่ — ล้าง blob เดิม (ถ้ามี)
  delete _ordPoFileBlobs[prefix];
  if (nameEl)  { nameEl.textContent = file.name; nameEl.style.color = '#059669'; }
  if (clearEl) clearEl.style.display = 'inline-block';
  if (iconEl)  iconEl.textContent = '✅';
  const dzPo = $(prefix + '_poDropZone');
  if (dzPo)  { dzPo.style.borderColor = '#059669'; dzPo.style.background = '#f0fdf4'; }
  if (imgEl) {
    if (file.type && file.type.startsWith('image/')) {
      imgEl.src = URL.createObjectURL(file);
      imgEl.style.display = 'block';
      if (editBtn) editBtn.style.display = 'inline-flex';
    } else {
      imgEl.style.display = 'none';
      imgEl.removeAttribute('src');
      if (editBtn) editBtn.style.display = 'none';
    }
  }
}
// ลบไฟล์ PO ที่เลือกไว้
function _ordClearPoFile(prefix) {
  const input  = $(prefix + '_poFile');
  const nameEl = $(prefix + '_poFileName');
  const clearEl = $(prefix + '_poFileClear');
  const imgEl  = $(prefix + '_poFilePreview');
  const editBtn = $(prefix + '_poEditBtn');
  if (input)  input.value = '';
  if (nameEl) { nameEl.textContent = 'คลิกเพื่อเลือกไฟล์ PO (รูปภาพ / PDF)...'; nameEl.style.color = '#6b7280'; }
  if (clearEl) clearEl.style.display = 'none';
  if (imgEl) { imgEl.style.display = 'none'; imgEl.removeAttribute('src'); }
  if (editBtn) editBtn.style.display = 'none';
  const icPo = $(prefix + '_poDropIcon');
  if (icPo) icPo.textContent = '📤';
  const dzPo2 = $(prefix + '_poDropZone');
  if (dzPo2) { dzPo2.style.borderColor = '#d1d5db'; dzPo2.style.background = '#fafafa'; }
  delete _ordPoFileBlobs[prefix];
}

// เปิด image editor สำหรับรูป PO
function _ordOpenPoEditor(prefix) {
  const imgEl = $(prefix + '_poFilePreview');
  if (!imgEl || !imgEl.src || imgEl.style.display === 'none') {
    Swal.fire({ icon:'warning', title:'ไม่มีรูปให้แก้ไข', text:'กรุณาเลือกไฟล์รูปภาพ PO ก่อน', confirmButtonText:'ตกลง' });
    return;
  }
  _imgEditorOpen(imgEl.src, function(file, url) {
    // อัปเดต blob store + preview
    _ordPoFileBlobs[prefix] = file;
    imgEl.src = url;
    imgEl.style.display = 'block';
    const nameEl = $(prefix + '_poFileName');
    if (nameEl) nameEl.textContent = '✅ แก้ไขแล้ว — ' + file.name;
  });
}

// เมื่อเลือกไฟล์รูป Drawing (แบบงาน) ใหม่ — แสดงรูปตัวอย่าง + ปุ่มลบ
function _ordJobImgChanged(prefix) {
  const input = $(prefix + '_jobImg1');
  const file  = input?.files?.[0];
  const nameEl  = $(prefix + '_jobImg1Name');
  const clearEl = $(prefix + '_jobImg1Clear');
  const imgEl   = $(prefix + '_jobImg1Preview');
  const iconEl  = $(prefix + '_drawDropIcon');
  if (!file) { _ordClearJobImg(prefix); return; }
  if (nameEl)  { nameEl.textContent = file.name; nameEl.style.color = '#059669'; }
  if (clearEl) clearEl.style.display = 'inline-block';
  if (iconEl)  iconEl.textContent = '✅';
  const dzDr = $(prefix + '_drawDropZone');
  if (dzDr)  { dzDr.style.borderColor = '#059669'; dzDr.style.background = '#f0fdf4'; }
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
// ลบรูป Drawing ที่เลือกไว้
function _ordClearJobImg(prefix) {
  const input  = $(prefix + '_jobImg1');
  const nameEl = $(prefix + '_jobImg1Name');
  const clearEl = $(prefix + '_jobImg1Clear');
  const imgEl  = $(prefix + '_jobImg1Preview');
  if (input)  input.value = '';
  if (nameEl) { nameEl.textContent = 'คลิกเพื่อเลือกรูป Drawing...'; nameEl.style.color = '#6b7280'; }
  if (clearEl) clearEl.style.display = 'none';
  if (imgEl) { imgEl.style.display = 'none'; imgEl.removeAttribute('src'); }
  const icDr = $(prefix + '_drawDropIcon');
  if (icDr) icDr.textContent = '🖼️';
  const dzDr2 = $(prefix + '_drawDropZone');
  if (dzDr2) { dzDr2.style.borderColor = '#d1d5db'; dzDr2.style.background = '#fafafa'; }
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
async function _ordUploadPoFile(file, noPO) {
  const base64 = await _ordFileToBase64(file);
  const res = await fetch(SCRIPT_URL, {
    method: 'POST', mode: 'cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'uploadOrderFile', fileName: file.name, mimeType: file.type, base64, noPO: noPO || '' })
  });
  const data = await res.json();
  if (data && data.status === 'ok') return { url: data.url, path: data.path || '' };
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
  if (!$('ord_poFile')?.files?.[0])          missing.push('แนบไฟล์ PO');
  if (missing.length) {
    Swal.fire({
      icon:'warning', title:'กรอกข้อมูลไม่ครบถ้วน',
      html:'กรุณากรอก/แนบข้อมูลให้ครบก่อนสร้าง Order:<br><b>' + missing.join(', ') + '</b>',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1'
    });
    return;
  }

  // ตรวจสอบ No.Quo ซ้ำ — แจ้งเตือน PO ที่เคยอ้างอิงไว้ แต่ยังสร้าง Order ใหม่ได้ (เผื่อเปิด Order เลขที่ PO ใหม่จากใบเสนอราคาเดิม)
  const dupQuoPOs = (_orderCache || []).filter(r =>
    String(r[ORDER_COLS.noQuo] || '').trim() === String(noQuo).trim()
  ).map(r => String(r[ORDER_COLS.noPO]||'').trim()).filter(Boolean);
  if (dupQuoPOs.length) {
    const confirmRes = await Swal.fire({
      icon: 'warning', title: 'พบ No.Quo ซ้ำ',
      html: `<b>No.Quo: ${noQuo}</b> ถูกใช้อ้างอิงกับ PO อยู่แล้ว: <b>${dupQuoPOs.join(', ')}</b><br>
             <span style="font-size:.8rem;color:#8b8aaa">ต้องการสร้าง Order ใหม่ (No.PO: ${noPO}) จากใบเสนอราคาเดิมนี้ต่อหรือไม่?</span>`,
      showCancelButton: true,
      background:'#0d1b2a', color:'#cce4ff',
      confirmButtonText: '✅ สร้างต่อ', cancelButtonText: 'ยกเลิก',
      confirmButtonColor:'#f59e0b', cancelButtonColor:'#475569'
    });
    if (!confirmRes.isConfirmed) {
      if ($('ord_noPO')) { $('ord_noPO').value = ''; $('ord_noPO').focus(); }
      return;
    }
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

  const customer = ($('ord_customer')?.value || $('ord_previewCustomer')?.textContent || '').trim().replace(/^—$/, '') || '';

  const row = new Array(ORDER_NUM_COLS).fill('');
  row[ORDER_COLS.statusDeliver] = false; // P = FALSE (default)
  row[ORDER_COLS.noQuo]       = noQuo;
  row[ORDER_COLS.noPO]        = noPO;
  row[ORDER_COLS.orderDate]   = _ordDateToSheet($('ord_orderDate').value || _todayStr());
  row[ORDER_COLS.mold]        = $('ord_mold')?.value || '';
  row[ORDER_COLS.workType]    = ($('ord_workType')?.value || '').trim() || (_ordSourceRow ? _ordSourceRow[DT.workType] : '') || '';
  row[ORDER_COLS.productList] = $('ord_productList').value || '';
  row[ORDER_COLS.qty]         = ($('ord_qty')?.value || '').trim() || _ordSourceRow[DT.unit] || '';
  row[ORDER_COLS.material]    = ($('ord_material')?.textContent || '').trim().replace(/^—$/, '') || '';
  row[ORDER_COLS.price]       = ($('ord_price')?.value || '').trim() || _ordSourceRow[DT.sellPrice] || '';
  row[ORDER_COLS.note]        = $('ord_note').value || '';
  row[ORDER_COLS.note2]       = $('ord_note2')?.value || '';
  row[ORDER_COLS.process]     = $('ord_status').value || 'กำลังผลิต';
  row[ORDER_COLS.statusDeliver] = (row[ORDER_COLS.process] === 'เรียบร้อย'); // P sync
  row[ORDER_COLS.status]      = $('ord_workStatus')?.value || 'ปรกติ';
  row[ORDER_COLS.wantDate]    = _ordDateToSheet($('ord_wantDate').value || '');
  row[ORDER_COLS.customer]    = customer;
  row[ORDER_COLS.meshOut]     = $('ord_meshOut')?.value || '';
  row[ORDER_COLS.meshIn]      = $('ord_meshIn')?.value || '';
  row[ORDER_COLS.matTop]      = $('ord_matTop')?.value || '';
  row[ORDER_COLS.matBot]      = $('ord_matBot')?.value || '';
  row[ORDER_COLS.od]          = $('ord_od')?.value  || '';
  row[ORDER_COLS.id_]         = $('ord_id')?.value  || '';
  row[ORDER_COLS.h_]          = $('ord_h')?.value   || '';

  const createBtn = $('ord_createBtn');
  const statusEl  = $('ord_createStatus');
  if (createBtn) createBtn.disabled = true;

  const _ordSetProgress = (text) => {
    if (statusEl) statusEl.textContent = '';
    Swal.update({ html: `<div style="font-size:.95rem">${text}</div>` });
  };

  try {
    Swal.fire({
      title: 'กำลังสร้าง Order...',
      html: '<div style="font-size:.95rem">⏳ กำลังเตรียมข้อมูล...</div>',
      allowOutsideClick: false, allowEscapeKey: false, showConfirmButton: false,
      background:'#0d1b2a', color:'#cce4ff',
      didOpen: () => Swal.showLoading()
    });

    const poFile = _ordPoFileBlobs['ord'] || $('ord_poFile')?.files?.[0];
    if (poFile) {
      _ordSetProgress('⏳ กำลังอัปโหลดไฟล์ PO...');
      const up = await _ordUploadPoFile(poFile, noPO);
      row[ORDER_COLS.poFile]     = up.url;
      row[ORDER_COLS.poFilePath] = up.path;
    }

    const jobImg1 = $('ord_jobImg1')?.files?.[0];
    if (jobImg1) {
      _ordSetProgress('⏳ กำลังอัปโหลดรูป Drawing...');
      const up = await _ordUploadPoFile(jobImg1, noPO);
      row[ORDER_COLS.jobImg1] = up.url;
    }


    // ── ตรวจ Stock ก่อน save ────────────────────────────────
    if (typeof stockCheckBeforeOrder === 'function') {
      var _matCodesToCheck = [
        row[ORDER_COLS.matTop], row[ORDER_COLS.matBot],
        row[ORDER_COLS.meshOut], row[ORDER_COLS.meshIn]
      ].filter(function(c){ return !!c && c.trim(); });
      var _stockOk = await stockCheckBeforeOrder(_matCodesToCheck);
      if (!_stockOk) { if (createBtn) createBtn.disabled = false; return; }
    }
    _ordSetProgress('⏳ กำลังบันทึก Order...');
    await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'addOrder', row }) });

    // อัปเดตสถานะของรายการต้นทาง (DATA) เป็น "ผ่าน" — แถวเดียวเท่านั้น (ตรวจ noQuo ก่อนส่ง)
    _ordSetProgress('⏳ กำลังอัปเดตสถานะ DATA...');
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

    // ถามว่าต้องการออกใบงานตัดเหล็กเลยหรือไม่
    setTimeout(async () => {
      const r2 = await Swal.fire({
        icon:'question', title:'ออกใบงานตัดเหล็กเลยหรือไม่?',
        html:`No.PO: <b>${noPO}</b>`,
        showCancelButton:true,
        confirmButtonText:'✂️ ออกใบงานตัดเหล็ก', cancelButtonText:'ไว้ทีหลัง',
        background:'#0a1c2e', color:'#f1f5f9',
        confirmButtonColor:'#f59e0b', cancelButtonColor:'#475569'
      });
      if (r2.isConfirmed && _ordSourceRow) {
        printCuttingReportFromDataRow(_ordSourceRow, noPO);
      }
    }, 2400);
  } catch (err) {
    Swal.fire({icon:'error',title:'เกิดข้อผิดพลาด',text:'ส่งข้อมูลไม่สำเร็จ',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    if (statusEl) statusEl.textContent = '';
  } finally {
    if (createBtn) createBtn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════
// ── สร้าง Order ทั่วไป (สินค้า/บริการอื่นๆ ที่ไม่ผูกกับใบเสนอราคา/สเปคไส้กรอง) ──
// ══════════════════════════════════════════════════════

// เติม datalist รายชื่อลูกค้า (จาก _custCache) ให้ช่อง "ลูกค้า" ของ Order ทั่วไป
function _gordRefreshCustomerList() {
  const dl = $('gord_customerList');
  if (!dl) return;
  dl.innerHTML = (_custCache || []).map(c => `<option value="${c.name}${c.branch?' ('+c.branch+')':''}">`).join('');
  _ordRefreshFormLists();
}

// แปลงชื่อลูกค้าแบบเต็ม "ชื่อบริษัท (สาขา)" ที่เลือกจาก dropdown → ค่า "ผู้ติดต่อ" ของลูกค้านั้น
// (ใช้บันทึกลงคอลัมน์ "ลูกค้า" ของชีต Order เพื่อให้จับคู่กับระบบออกใบกำกับภาษีได้)
function _custDisplayToContact(display) {
  display = (display || '').trim();
  if (!display) return display;
  const cust = (_custCache || []).find(c => `${c.name}${c.branch ? ' (' + c.branch + ')' : ''}` === display);
  return cust ? (cust.contact || cust.name) : display;
}

// เติม datalist ลูกค้า + แบบงาน สำหรับฟอร์ม "สร้าง Order จากใบเสนอราคา"
function _ordRefreshFormLists() {
  // ลูกค้า — จาก _custCache
  const custDl = $('ord_customerList');
  if (custDl) {
    custDl.innerHTML = (_custCache || []).map(c =>
      `<option value="${(c.name||'')}${c.branch?' ('+c.branch+')':''}">` ).join('');
  }
  // แบบงาน — unique values จาก Order cache + DATA cache
  const wtDl = $('ord_workTypeList');
  if (wtDl) {
    const seen = new Set();
    (_orderCache || []).forEach(r => { const v = String(r[ORDER_COLS.workType]||'').trim(); if(v) seen.add(v); });
    (_dtCache    || []).forEach(r => { const v = String(r[DT.workType]||'').trim();          if(v) seen.add(v); });
    wtDl.innerHTML = [...seen].sort().map(v => `<option value="${v}">`).join('');
  }
  // populate datalist ตัวกรอง
  const fwDl = $('ordFilterWorkTypeList');
  if (fwDl) {
    const seen2 = new Set();
    (_orderCache || []).forEach(r => { const v = String(r[ORDER_COLS.workType]||'').trim(); if(v) seen2.add(v); });
    fwDl.innerHTML = [...seen2].sort().map(v => `<option value="${v}">`).join('');
  }
}

// เมื่อเลือกรายการสินค้า/บริการจาก Item Master (datalist) — เติมหน่วย/ราคาให้อัตโนมัติถ้ามีข้อมูล
function _gordItemSelected() {
  const name = ($('gord_productList')?.value || '').trim();
  const item = (_itemMasterCache || []).find(it => it.name === name);
  if (!item) return;
  if ($('gord_unit')  && !$('gord_unit').value)  $('gord_unit').value  = item.unit  || 'ชิ้น';
  if ($('gord_price') && !$('gord_price').value) $('gord_price').value = item.price || '';
}

// เคลียร์การ์ด "สร้าง Order ทั่วไป" กลับสู่สถานะว่าง
function _gordResetCard() {
  ['gord_customer','gord_noPO','gord_productList','gord_qty','gord_price','gord_note'].forEach(id => {
    if ($(id)) $(id).value = '';
  });
  if ($('gord_unit'))   $('gord_unit').value = 'ชิ้น';
  if ($('gord_status')) $('gord_status').value = 'กำลังผลิต';
  _ordClearPoFile('gord');
  _ordClearJobImg('gord');
}

// สร้าง Order ใหม่แบบทั่วไป (สินค้า/บริการอื่นๆ) — ไม่ต้องมีข้อมูลจาก DATA
async function createGeneralOrder() {
  if (!SCRIPT_URL) {
    Swal.fire({icon:'info',title:'ยังไม่ตั้งค่า URL',text:'กรุณาใส่ Apps Script URL ก่อน',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    return;
  }
  const noPO = ($('gord_noPO')?.value || '').trim();
  const productList = ($('gord_productList')?.value || '').trim();
  const qty = ($('gord_qty')?.value || '').trim();
  const price = ($('gord_price')?.value || '').trim();

  // ตรวจสอบข้อมูลที่จำเป็น
  const missing = [];
  if (!noPO)                              missing.push('No.PO');
  if (!productList)                       missing.push('รายการสินค้า/บริการ');
  if (!qty)                               missing.push('จำนวน');
  if (!price)                             missing.push('ราคา/หน่วย');
  if (!($('gord_customer')?.value||'').trim()) missing.push('ลูกค้า');
  if (!$('gord_orderDate')?.value)        missing.push('วันที่สั่งซื้อ');
  if (!$('gord_wantDate')?.value)         missing.push('วันที่ต้องการ');
  if (missing.length) {
    Swal.fire({
      icon:'warning', title:'กรอกข้อมูลไม่ครบถ้วน',
      html:'กรุณากรอกข้อมูลให้ครบก่อนสร้าง Order:<br><b>' + missing.join(', ') + '</b>',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1'
    });
    return;
  }

  // No.Quo ของ Order ทั่วไป — สร้างจาก No.PO (ไม่มีใบเสนอราคาต้นทาง) ต้องไม่ซ้ำกับ Order อื่น
  const noQuo = 'GEN-' + noPO;

  // ตรวจสอบ No.PO / No.Quo ซ้ำ (คอลัมน์ A, B ห้ามซ้ำ)
  const dupPO = (_orderCache || []).some(r => String(r[ORDER_COLS.noPO] || '').trim() === noPO);
  if (dupPO) {
    await Swal.fire({
      icon: 'error', title: 'พบ No.PO ซ้ำ',
      html: `มี Order ที่ใช้ <b>No.PO: ${noPO}</b> อยู่แล้ว<br><span style="font-size:.8rem;color:#8b8aaa">No.PO ห้ามซ้ำ ไม่สามารถสร้าง Order นี้ได้</span>`,
      background:'#0d1b2a', color:'#cce4ff',
      confirmButtonText: 'ตกลง', confirmButtonColor:'#dc2626'
    });
    if ($('gord_noPO')) { $('gord_noPO').value = ''; $('gord_noPO').focus(); }
    return;
  }
  const dupQuo = (_orderCache || []).some(r => String(r[ORDER_COLS.noQuo] || '').trim() === noQuo);
  if (dupQuo) {
    await Swal.fire({
      icon: 'error', title: 'พบรายการซ้ำ',
      html: `มี Order ที่ใช้ <b>No.PO: ${noPO}</b> ในรูปแบบ Order ทั่วไปอยู่แล้ว`,
      background:'#0d1b2a', color:'#cce4ff',
      confirmButtonText: 'ตกลง', confirmButtonColor:'#dc2626'
    });
    return;
  }

  // ยืนยันก่อนสร้าง Order จริง
  const confirmRes = await Swal.fire({
    icon: 'question', title: 'ยืนยันการสร้าง Order ทั่วไป?',
    html: `No.PO: <b>${noPO}</b><br>รายการ: <b>${productList}</b>`,
    showCancelButton: true,
    confirmButtonText: '✅ ยืนยัน', cancelButtonText: 'ยกเลิก',
    background: '#0a1c2e', color: '#f1f5f9',
    confirmButtonColor: '#22c55e', cancelButtonColor: '#475569'
  });
  if (!confirmRes.isConfirmed) return;

  const unit = ($('gord_unit')?.value || 'ชิ้น').trim() || 'ชิ้น';

  const row = new Array(ORDER_NUM_COLS).fill('');
  row[ORDER_COLS.statusDeliver] = false; // P = FALSE (default)
  row[ORDER_COLS.noQuo]       = noQuo;
  row[ORDER_COLS.noPO]        = noPO;
  row[ORDER_COLS.orderDate]   = _ordDateToSheet($('gord_orderDate').value || _todayStr());
  row[ORDER_COLS.workType]    = 'ทั่วไป';
  row[ORDER_COLS.productList] = unit && unit !== 'ชิ้น' ? `${productList} (${unit})` : productList;
  row[ORDER_COLS.qty]         = qty;
  row[ORDER_COLS.price]       = price;
  row[ORDER_COLS.note]        = $('gord_note')?.value || '';
  row[ORDER_COLS.process]     = $('gord_status')?.value || 'กำลังผลิต';
  row[ORDER_COLS.statusDeliver] = (row[ORDER_COLS.process] === 'เรียบร้อย'); // P sync
  row[ORDER_COLS.status]      = 'ปรกติ';
  row[ORDER_COLS.wantDate]    = _ordDateToSheet($('gord_wantDate').value || '');
  row[ORDER_COLS.customer]    = _custDisplayToContact(($('gord_customer')?.value || '').trim());

  const createBtn = $('gord_createBtn');
  const statusEl  = $('gord_createStatus');
  if (createBtn) createBtn.disabled = true;

  try {
    const poFile = _ordPoFileBlobs['gord'] || $('gord_poFile')?.files?.[0];
    if (poFile) {
      if (statusEl) statusEl.textContent = '⏳ กำลังอัปโหลดไฟล์ PO...';
      const up = await _ordUploadPoFile(poFile, noPO);
      row[ORDER_COLS.poFile]     = up.url;
      row[ORDER_COLS.poFilePath] = up.path;
    }

    const jobImg1 = $('gord_jobImg1')?.files?.[0];
    if (jobImg1) {
      if (statusEl) statusEl.textContent = '⏳ กำลังอัปโหลดรูป Drawing...';
      const up = await _ordUploadPoFile(jobImg1, noPO);
      row[ORDER_COLS.jobImg1] = up.url;
    }


    // ── ตรวจ Stock ก่อน save ────────────────────────────────
    if (typeof stockCheckBeforeOrder === 'function') {
      var _matCodesToCheck = [
        row[ORDER_COLS.matTop], row[ORDER_COLS.matBot],
        row[ORDER_COLS.meshOut], row[ORDER_COLS.meshIn]
      ].filter(function(c){ return !!c && c.trim(); });
      var _stockOk = await stockCheckBeforeOrder(_matCodesToCheck);
      if (!_stockOk) { if (createBtn) createBtn.disabled = false; return; }
    }
    if (statusEl) statusEl.textContent = '⏳ กำลังบันทึก...';
    await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'addOrder', row }) });

    Swal.fire({icon:'success',title:'สร้าง Order แล้ว ✅',
      html:`บันทึก Order ทั่วไปเรียบร้อย<br><span style="font-size:.8rem;color:#8b8aaa">No.PO: <b>${noPO}</b></span>`,
      background:'#0d1b2a',color:'#cce4ff',
      confirmButtonColor:'#6366f1', timer:2200, showConfirmButton:false});
    _gordResetCard();
    if (statusEl) statusEl.textContent = '';
    setTimeout(fetchOrders, 1200);
  } catch (err) {
    Swal.fire({icon:'error',title:'เกิดข้อผิดพลาด',text:'ส่งข้อมูลไม่สำเร็จ',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    if (statusEl) statusEl.textContent = '';
  } finally {
    if (createBtn) createBtn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════
// ── สร้างใบเสนอราคาทั่วไป (กรอกหลายรายการเอง ไม่ผูกกับสเปคไส้กรอง) ──
// ══════════════════════════════════════════════════════
let _gquoItems = [{ desc:'', qty:1, unit:'ชิ้น', price:0 }];

function _gquoRenderItems() {
  const wrap = $('gquoItemsWrap');
  if (!wrap) return;
  const inputCss = "width:100%;padding:6px 8px;font-size:.78rem;border-radius:6px;border:1px solid var(--bc-div);background:var(--bg1,#fff);font-family:inherit;box-sizing:border-box";
  wrap.innerHTML = `
    <datalist id="gquo_itemList">${(_itemMasterCache||[]).map(it=>`<option value="${_escH(it.name)}">`).join('')}</datalist>
    <table style="width:100%;border-collapse:collapse;font-size:.8rem;min-width:560px">
      <thead><tr style="text-align:left;color:var(--t3);font-size:.7rem">
        <th style="padding:4px 6px">รายละเอียดสินค้า/บริการ</th>
        <th style="padding:4px 6px;width:80px">จำนวน</th>
        <th style="padding:4px 6px;width:80px">หน่วย</th>
        <th style="padding:4px 6px;width:110px">ราคา/หน่วย</th>
        <th style="padding:4px 6px;width:110px;text-align:right">รวม (฿)</th>
        <th style="width:30px"></th>
      </tr></thead>
      <tbody>
        ${_gquoItems.map((it,i) => `
        <tr>
          <td style="padding:3px"><input type="text" list="gquo_itemList" value="${_escH(it.desc)}" placeholder="ชื่อสินค้า/บริการ" oninput="_gquoUpdateItem(${i},'desc',this.value,false)" onchange="_gquoItemSelected(${i},this.value)" style="${inputCss}"></td>
          <td style="padding:3px"><input type="number" min="0" value="${it.qty}" oninput="_gquoUpdateItem(${i},'qty',this.value,true)" style="${inputCss}"></td>
          <td style="padding:3px"><input type="text" value="${_escH(it.unit)}" oninput="_gquoUpdateItem(${i},'unit',this.value,false)" style="${inputCss}"></td>
          <td style="padding:3px"><input type="number" min="0" step="0.01" value="${it.price}" oninput="_gquoUpdateItem(${i},'price',this.value,true)" style="${inputCss}"></td>
          <td class="gquo-total" data-idx="${i}" style="padding:3px;text-align:right;font-weight:600;white-space:nowrap">${((parseFloat(it.qty)||0)*(parseFloat(it.price)||0)).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
          <td style="padding:3px;text-align:center"><button type="button" onclick="_gquoRemoveRow(${i})" title="ลบรายการ" style="border:none;background:none;color:#ef4444;cursor:pointer;font-size:1rem">✕</button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

// เลือกรายการจาก Item Master (datalist) → เติมหน่วย/ราคาให้อัตโนมัติ
function _gquoItemSelected(i, name) {
  name = (name||'').trim();
  const item = (_itemMasterCache||[]).find(it => it.name === name);
  if (!item || !_gquoItems[i]) return;
  _gquoItems[i].desc  = name;
  _gquoItems[i].unit  = item.unit  || _gquoItems[i].unit;
  _gquoItems[i].price = item.price || _gquoItems[i].price;
  _gquoRenderItems();
}

// อัปเดตข้อมูลรายการโดยไม่ render ตารางใหม่ทั้งหมด (ป้องกัน input เสีย focus ขณะพิมพ์)
function _gquoUpdateItem(i, field, val, isNum) {
  if (!_gquoItems[i]) return;
  _gquoItems[i][field] = val;
  if (isNum) {
    const wrap = $('gquoItemsWrap');
    const cell = wrap && wrap.querySelector(`.gquo-total[data-idx="${i}"]`);
    if (cell) {
      const total = (parseFloat(_gquoItems[i].qty)||0) * (parseFloat(_gquoItems[i].price)||0);
      cell.textContent = total.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
    }
  }
}

function _gquoAddRow() {
  _gquoItems.push({ desc:'', qty:1, unit:'ชิ้น', price:0 });
  _gquoRenderItems();
}

function _gquoRemoveRow(i) {
  if (_gquoItems.length <= 1) { _gquoItems = [{ desc:'', qty:1, unit:'ชิ้น', price:0 }]; }
  else _gquoItems.splice(i, 1);
  _gquoRenderItems();
}

// ── date helpers สำหรับ gquo ──────────────────────────────────
function _gquoDateToThai(iso) {
  if (!iso) return '';
  if (String(iso).includes('/')) return String(iso); // already Thai
  const s = String(iso).substring(0,10);
  const p = s.split('-');
  if (p.length !== 3) return s;
  return `${p[2]}/${p[1]}/${parseInt(p[0])+543}`;
}
function _gquoThaiToIso(thai) {
  if (!thai) return '';
  if (!String(thai).includes('/')) return String(thai).substring(0,10);
  const p = String(thai).split('/');
  if (p.length !== 3) return thai;
  return `${parseInt(p[2])-543}-${p[1]}-${p[0]}`;
}

function _gquoResetCard() {
  if ($('gquo_customer')) $('gquo_customer').value = '';
  if ($('gquo_refNo'))    $('gquo_refNo').value = '';
  if ($('gquo_date'))     $('gquo_date').value = '';
  if ($('gquo_remark'))   $('gquo_remark').value = '';
  _gquoItems = [{ desc:'', qty:1, unit:'ชิ้น', price:0 }];
  _gquoRenderItems();
}

// ── เปิดดูตัวอย่างใบเสนอราคาทั่วไปจากรายการที่กรอก ──
function _gquoPreview() {
  const items = _gquoItems.filter(it => (it.desc||'').trim() || (parseFloat(it.price)||0) > 0);
  if (!items.length) {
    Swal.fire({icon:'warning',title:'กรุณากรอกรายการสินค้า/บริการ',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    return;
  }
  const customer = ($('gquo_customer')?.value || '').trim();
  const refNo = ($('gquo_refNo')?.value || '').trim() || generateRefId();
  const dateVal = $('gquo_date')?.value || _todayStr();
  const remark = ($('gquo_remark')?.value || '').trim();
  _gquoRenderDoc({ customer, refNo, dateVal, remark, items });
}


// ── บันทึกใบเสนอราคาทั่วไป → Google Sheets ชีต Quotations ──
async function _gquoSave() {
  const items = _gquoItems.filter(it => (it.desc||'').trim() || (parseFloat(it.price)||0) > 0);
  if (!items.length) {
    Swal.fire({icon:'warning', title:'กรุณากรอกรายการสินค้า/บริการ',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1'});
    return;
  }
  if (!SCRIPT_URL) {
    Swal.fire({icon:'warning', title:'ยังไม่ได้ตั้งค่า Script URL',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1'});
    return;
  }
  const customer = ($('gquo_customer')?.value || '').trim();
  const refNoEl  = $('gquo_refNo');
  const refNo    = (refNoEl?.value || '').trim() || generateRefId();
  if (refNoEl && !refNoEl.value.trim()) refNoEl.value = refNo; // แสดงเลขที่ที่สร้างอัตโนมัติ
  const dateVal  = $('gquo_date')?.value || _todayStr();  // ส่ง ISO ไป Sheets, แปลง Thai BE แค่ตอนแสดงผล
  const remark   = ($('gquo_remark')?.value || '').trim();

  const subtotal = items.reduce((s, it) => s + (parseFloat(it.qty)||0) * (parseFloat(it.price)||0), 0);
  const vatAmt   = subtotal * 0.07;
  const grand    = subtotal + vatAmt;

  Swal.fire({ title:'กำลังบันทึก...', allowOutsideClick:false,
    background:'#0d1b2a', color:'#cce4ff', showConfirmButton:false, didOpen:()=>Swal.showLoading() });
  try {
    const res = await fetch(SCRIPT_URL, {
      method:'POST', mode:'no-cors', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'saveGeneralQuotation',
        refNo, date: dateVal, customer, items, remark, subtotal, vatAmt, grand })
    });
    Swal.fire({ toast:true, position:'top-end', icon:'success', title:'บันทึกแล้ว ✅ ' + refNo,
      showConfirmButton:false, timer:2000, timerProgressBar:true });
    _gquoFetchList();   // รีเฟรชรายการอัตโนมัติหลังบันทึก
    _gquoResetCard();   // เคลียร์การ์ดอัตโนมัติหลังบันทึก
  } catch(err) {
    Swal.fire({ icon:'error', title:'บันทึกไม่สำเร็จ', text: String(err),
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1' });
  }
}


// ── รายการใบเสนอราคาทั่วไป (Quotations sheet) ──
let _gquoListCache = [];

async function _gquoFetchList() {
  const tbody = $('gquoListBody');
  if (!tbody) return;
  if (!SCRIPT_URL) {
    tbody.innerHTML = `<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--t3);font-size:.8rem">⚠️ ยังไม่ได้ตั้งค่า Script URL</td></tr>`;
    return;
  }
  tbody.innerHTML = `<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--t3);font-size:.8rem"><span class="spin-ico">↻</span> กำลังโหลด…</td></tr>`;
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getGeneralQuotations', {mode:'cors'});
    const data = await res.json();
    _gquoListCache = (data.data || []).reverse(); // ใหม่สุดก่อน
    _gquoRenderList();
  } catch(err) {
    tbody.innerHTML = `<tr><td colspan="5" style="padding:20px;text-align:center;color:#f87171;font-size:.8rem">โหลดไม่สำเร็จ: ${err.message}</td></tr>`;
  }
}

function _gquoRenderList() {
  const tbody = $('gquoListBody');
  if (!tbody) return;
  // ── อ่านค่า filter ──
  const srch    = (($('gquoFilterSearch')||{}).value||'').trim().toLowerCase();
  const fromVal = ($('gquoFilterFrom')||{}).value||'';
  const toVal   = ($('gquoFilterTo')||{}).value||'';
  // ── กรอง ──
  const filtered = _gquoListCache.filter((q, i) => {
    if (srch) {
      const hay = (String(q.refNo||'') + ' ' + String(q.customer||'')).toLowerCase();
      if (!hay.includes(srch)) return false;
    }
    const rawDate = String(q.date||'');
    const isoDate = _gquoThaiToIso(rawDate);
    if (fromVal && isoDate < fromVal) return false;
    if (toVal   && isoDate > toVal)   return false;
    return true;
  });
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="padding:30px;text-align:center;color:var(--t3);font-size:.8rem">${_gquoListCache.length ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีรายการ'}</td></tr>`;
    return;
  }
  const fmtNum = n => (parseFloat(n)||0).toLocaleString('th-TH', {minimumFractionDigits:2, maximumFractionDigits:2});
  tbody.innerHTML = filtered.map((q) => {
    const i     = _gquoListCache.indexOf(q); // index จริงใน cache (สำหรับ preview/delete)
    const refNo = _escH(String(q.refNo||''));
    const date  = _escH(_gquoDateToThai(String(q.date||'')));
    const cust  = _escH(String(q.customer||'—'));
    const grand = fmtNum(q.grand);
    return `<tr style="border-bottom:1px solid var(--bc-div);font-size:.8rem">
      <td style="padding:8px 10px;font-weight:600;color:var(--c1)">${refNo}</td>
      <td style="padding:8px 10px;color:var(--t2)">${date}</td>
      <td style="padding:8px 10px">${cust}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:600">${grand} ฿</td>
      <td style="padding:8px 10px;text-align:center;white-space:nowrap">
        <button onclick="_gquoLoadFromList(${i})" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(99,102,241,.4);background:rgba(99,102,241,.1);color:#a78bfa;font-size:.72rem;cursor:pointer;font-family:Sarabun,sans-serif;margin-right:4px">✏️ แก้ไข</button>
        <button onclick="_gquoPreviewFromList(${i})" style="padding:4px 10px;border-radius:6px;border:1px solid var(--bc-div);background:var(--bg-card);color:var(--t1);font-size:.72rem;cursor:pointer;font-family:Sarabun,sans-serif;margin-right:4px">🖨️ พิมพ์</button>
        <button onclick="_gquoDeleteFromList(${i})" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.08);color:#f87171;font-size:.72rem;cursor:pointer;font-family:Sarabun,sans-serif">🗑️ ลบ</button>
      </td>
    </tr>`;
  }).join('');
}

function _gquoResetFilters() {
  const s = $('gquoFilterSearch'); if (s) s.value = '';
  const f = $('gquoFilterFrom');  if (f) f.value = '';
  const t = $('gquoFilterTo');    if (t) t.value = '';
  _gquoRenderList();
}

function _gquoLoadFromList(i) {
  const q = _gquoListCache[i];
  if (!q) return;
  // ขยายการ์ดฟอร์มถ้าซ่อนอยู่
  const body = $('gquoFormBody');
  if (body && body.style.display === 'none') {
    const toggle = body.closest('.card')?.querySelector('[onclick*="gquoFormBody"]');
    if (toggle) toggle.click();
  }
  // ใส่ค่าในฟอร์ม
  if ($('gquo_customer')) $('gquo_customer').value = q.customer || '';
  if ($('gquo_refNo'))    $('gquo_refNo').value    = q.refNo    || '';
  if ($('gquo_remark'))   $('gquo_remark').value   = q.remark   || '';
  // date: แปลง ISO → yyyy-MM-dd สำหรับ input type=date
  if ($('gquo_date')) {
    $('gquo_date').value = _gquoThaiToIso(String(q.date||''));
  }
  // รายการ
  const srcItems = Array.isArray(q.items) ? q.items : [];
  _gquoItems = srcItems.length
    ? srcItems.map(it => ({
        desc:  it.desc  || it.name  || '',
        qty:   parseFloat(it.qty)   || 1,
        unit:  it.unit  || 'ชิ้น',
        price: parseFloat(it.price) || 0,
      }))
    : [{ desc:'', qty:1, unit:'ชิ้น', price:0 }];
  _gquoRenderItems();
  // scroll ขึ้นไปฟอร์ม
  const card = $('gquo_customer');
  if (card) card.closest('.card')?.scrollIntoView({ behavior:'smooth', block:'start' });
  Swal.fire({ toast:true, position:'top-end', icon:'info',
    title:`โหลด ${_escH(q.refNo||'')} ลงฟอร์มแล้ว`,
    showConfirmButton:false, timer:1600, timerProgressBar:true });
}

function _gquoPreviewFromList(i) {
  const q = _gquoListCache[i];
  if (!q) return;
  const items = Array.isArray(q.items) ? q.items : [];
  _gquoRenderDoc({ customer: q.customer||'', refNo: q.refNo||'', dateVal: q.date||'', remark: q.remark||'', items });
}

async function _gquoDeleteFromList(i) {
  const q = _gquoListCache[i];
  if (!q) return;
  const { isConfirmed } = await Swal.fire({
    title: 'ลบใบเสนอราคา?',
    html: `<b>${_escH(String(q.refNo||''))}</b> — ${_escH(String(q.customer||''))}`,
    icon: 'warning', showCancelButton:true,
    confirmButtonText:'ลบ', cancelButtonText:'ยกเลิก',
    confirmButtonColor:'#ef4444', cancelButtonColor:'#6366f1',
    background:'#0d1b2a', color:'#cce4ff',
  });
  if (!isConfirmed) return;
  try {
    await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'deleteGeneralQuotation', refNo: q.refNo }) });
    _gquoListCache.splice(i, 1);
    _gquoRenderList();
    Swal.fire({ toast:true, position:'top-end', icon:'success', title:'ลบแล้ว',
      showConfirmButton:false, timer:1500, timerProgressBar:true });
  } catch(err) {
    Swal.fire({ icon:'error', title:'ลบไม่สำเร็จ', text:String(err),
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1' });
  }
}

// ── เริ่มต้น: render แถวเปล่า 1 แถวเมื่อหน้าโหลด ──

// ══════════════════════════════════════════════════════
// WI (Work Instruction) — จัดการ + viewer
// ══════════════════════════════════════════════════════

let _wiItems = []; // steps ของ WI ที่กำลังแก้ไขอยู่
let _wiEditId = null; // WI_ID ที่กำลัง edit (null = สร้างใหม่)

// ── compress รูปก่อนบันทึก (เหมือน RFQ) ──
function _wiCompressImg(file, maxPx = 900, quality = 0.72) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── เปิดฟอร์ม ──
function _wiOpenForm(wiId) {
  _wiEditId = wiId;
  if (wiId) {
    const wi = _wiCache.find(w => w.wiId === wiId);
    if (!wi) return;
    $('wi_od').value       = wi.od || '';
    $('wi_id').value       = wi.id || '';
    $('wi_h').value        = wi.h  || '';
    $('wi_worktype').value = wi.workType || '';
    $('wi_remark').value   = wi.remark || '';
    _wiItems = (wi.steps || []).map(s => ({ ...s }));
    $('wiFormTitle').textContent = 'แก้ไข WI — ' + wi.wiId;
  } else {
    $('wi_od').value = $('wi_id').value = $('wi_h').value = $('wi_worktype').value = $('wi_remark').value = '';
    _wiItems = [];
    $('wiFormTitle').textContent = 'สร้าง WI ใหม่';
  }
  _wiRenderSteps();
  $('wiFormCard').style.display = 'block';
  $('wiFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  _wiPopulateWorkTypeList();
}

function _wiCloseForm() {
  $('wiFormCard').style.display = 'none';
  _wiItems = []; _wiEditId = null;
}

// ── populate datalist แบบงาน (ดึงจาก backend + orderCache) ──
async function _wiPopulateWorkTypeList() {
  const dl = $('wiWorkTypeList');
  if (!dl) return;
  // ดึงจาก orderCache ก่อน (ถ้ามี)
  let types = [...new Set(_orderCache.map(r => String(r[ORDER_COLS.workType] || '').trim()).filter(Boolean))];
  // ถ้าไม่มี → fetch จาก backend
  if (!types.length && SCRIPT_URL) {
    try {
      const res = await fetch(SCRIPT_URL + '?action=getWorkTypes').then(r => r.json());
      if (res.status === 'ok') types = (res.types || []).map(w => String(w).trim()).filter(Boolean);
    } catch(e) {}
  }
  dl.innerHTML = [...new Set(types)].map(t => `<option value="${t}">`).join('');
}

// ── render steps ──
function _wiRenderSteps() {
  const wrap = $('wiStepsWrap');
  if (!wrap) return;
  if (!_wiItems.length) {
    wrap.innerHTML = '<div style="text-align:center;color:var(--t3);padding:12px;font-size:.82rem">ยังไม่มีขั้นตอน — กด "+ เพิ่มขั้นตอน"</div>';
    return;
  }
  wrap.innerHTML = _wiItems.map((s, i) => `
    <div style="border:1px solid var(--bc-div);border-radius:10px;padding:10px;margin-bottom:10px;display:flex;gap:10px;align-items:flex-start">
      <div style="flex-shrink:0;width:32px;height:32px;border-radius:8px;background:var(--c1);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.9rem">${i+1}</div>
      <div style="flex:1;min-width:0">
        <input type="text" value="${(s.caption||'').replace(/"/g,'&quot;')}" placeholder="คำอธิบายขั้นตอน..." 
          oninput="_wiItems[${i}].caption=this.value"
          style="width:100%;margin-bottom:8px;padding:7px 10px;border:1px solid var(--bc-div);border-radius:7px;font-family:Sarabun,sans-serif;font-size:.85rem;background:var(--bg1);color:var(--t1)">
        ${s.img
          ? `<div style="position:relative;display:inline-block">
               <img src="${s.img}" style="max-height:100px;max-width:200px;border-radius:8px;border:1px solid var(--bc-div);display:block">
               <button onclick="_wiRemoveImg(${i})" style="position:absolute;top:3px;right:3px;background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:.65rem;line-height:1">✕</button>
             </div>`
          : `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.78rem;color:var(--c1);border:1.5px dashed var(--bc-div);border-radius:8px;padding:7px 12px;background:var(--bg2)">
               📷 อัปโหลดรูป
               <input type="file" accept="image/*" style="display:none" onchange="_wiImgChange(event,${i})">
             </label>`}
      </div>
      <button onclick="_wiRemoveStep(${i})" style="flex-shrink:0;background:none;border:none;color:var(--t3);cursor:pointer;font-size:1.1rem;padding:2px 4px" title="ลบขั้นตอนนี้">🗑️</button>
    </div>`).join('');
}

function _wiAddStep() {
  _wiItems.push({ caption: '', img: '' });
  _wiRenderSteps();
}

function _wiRemoveStep(i) {
  _wiItems.splice(i, 1);
  _wiRenderSteps();
}

function _wiRemoveImg(i) {
  _wiItems[i].img = '';
  _wiRenderSteps();
}

async function _wiImgChange(event, i) {
  const file = event.target.files[0];
  if (!file) return;
  if (!SCRIPT_URL) { Swal.fire({ icon:'error', title:'ยังไม่ได้ตั้งค่า Script URL' }); return; }
  // compress ก่อนส่ง (ลดขนาด upload)
  const b64 = await _wiCompressImg(file, 1200, 0.80);
  Swal.fire({ title:'กำลังอัปโหลดรูป...', allowOutsideClick:false, didOpen:()=>Swal.showLoading() });
  try {
    const res = await fetch(SCRIPT_URL, {
      method:'POST',
      body: JSON.stringify({
        action: 'uploadWIImage',
        base64: b64,
        mimeType: 'image/jpeg',
        filename: 'wi_step' + i + '_' + Date.now() + '.jpg'
      })
    }).then(r => r.json());
    if (res.status !== 'ok') throw new Error(res.message || 'upload error');
    _wiItems[i].img = res.url; // เก็บ Drive URL แทน base64
    Swal.close();
    _wiRenderSteps();
  } catch(err) {
    Swal.fire({ icon:'error', title:'อัปโหลดรูปไม่สำเร็จ', text: err.message });
  }
}

// ── บันทึก WI ──
async function _wiSave() {
  const od = parseFloat($('wi_od').value) || 0;
  const id = parseFloat($('wi_id').value) || 0;
  const h  = parseFloat($('wi_h').value)  || 0;
  const wt = ($('wi_worktype').value || '').trim();
  if (!od || !id || !h || !wt) {
    Swal.fire({ icon:'warning', title:'กรุณากรอก OD / ID / H และ แบบงาน', confirmButtonText:'ตกลง' });
    return;
  }
  if (!_wiItems.length) {
    Swal.fire({ icon:'warning', title:'กรุณาเพิ่มขั้นตอนอย่างน้อย 1 ขั้น', confirmButtonText:'ตกลง' });
    return;
  }
  if (!SCRIPT_URL) { Swal.fire({ icon:'error', title:'ยังไม่ได้ตั้งค่า Script URL' }); return; }

  // auto wiId
  const wiId = _wiEditId || ('WI-' + Date.now());
  const payload = {
    action: 'saveWI',
    wiId, od, id: id, h, workType: wt,
    remark: ($('wi_remark').value || '').trim(),
    steps: _wiItems
  };

  Swal.fire({ title:'กำลังบันทึก...', allowOutsideClick:false, didOpen:()=>Swal.showLoading() });
  try {
    const res = await fetch(SCRIPT_URL, { method:'POST', body: JSON.stringify(payload) }).then(r=>r.json());
    if (res.status !== 'ok') throw new Error(res.message || 'error');
    Swal.fire({ toast:true, position:'top-end', icon:'success', title:'บันทึก WI แล้ว ✅', showConfirmButton:false, timer:2000 });
    _wiCloseForm();
    await _wiLoadList();
  } catch(err) {
    Swal.fire({ icon:'error', title:'บันทึกไม่สำเร็จ', text:err.message });
  }
}

// ── ลบ WI ──
function _wiPrint(wiId) {
  const wi = _wiCache.find(w => w.wiId === wiId);
  if (!wi) return;
  const companyName = localStorage.getItem('ptts_company_name') || 'PTTS';
  const steps = wi.steps || [];
  const stepsHtml = steps.map((s, i) => `
    <div style="break-inside:avoid;border:1px solid #d1d5db;border-radius:10px;padding:14px 16px;margin-bottom:12px;background:#fff">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="min-width:32px;height:32px;border-radius:50%;background:#2563eb;color:#fff;
          font-weight:800;font-size:1rem;display:flex;align-items:center;justify-content:center">${i+1}</div>
        <div style="font-size:.95rem;font-weight:700;color:#1e293b">${s.caption||'(ไม่มีคำอธิบาย)'}</div>
      </div>
      ${s.img ? `<img src="${s.img}" style="width:100%;max-height:260px;object-fit:contain;border-radius:8px;border:1px solid #e2e8f0;display:block">` : ''}
    </div>`).join('');

  const html = `<!DOCTYPE html><html lang="th"><head>
    <meta charset="UTF-8">
    <title>WI: ${wi.wiId}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap">
    <style>
      * { box-sizing:border-box; margin:0; padding:0; }
      body { font-family:Sarabun,sans-serif; background:#f8fafc; color:#1e293b; padding:0; }
      @media print {
        body { background:#fff; }
        @page { size:A4; margin:15mm 12mm; }
      }
    </style>
  </head><body>
    <div style="max-width:720px;margin:0 auto;padding:24px 16px">

      <!-- หัว -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;
        border-bottom:3px solid #2563eb;padding-bottom:12px;margin-bottom:18px">
        <div>
          <div style="font-size:.72rem;font-weight:600;color:#64748b;letter-spacing:.05em;text-transform:uppercase">Work Instruction</div>
          <div style="font-size:1.5rem;font-weight:800;color:#2563eb">${wi.wiId}</div>
          <div style="font-size:.8rem;color:#475569;margin-top:2px">วันที่สร้าง: ${wi.updatedAt||'—'}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:1rem;font-weight:700;color:#1e293b">${companyName}</div>
          <div style="font-size:.72rem;color:#64748b;margin-top:2px">ฝ่ายผลิต</div>
        </div>
      </div>

      <!-- สเปก -->
      <div style="background:#eff6ff;border-radius:8px;padding:10px 16px;margin-bottom:20px;display:inline-block">
        <div style="font-size:.68rem;color:#3b82f6;font-weight:600;margin-bottom:2px">รายการ</div>
        <div style="font-size:1.1rem;font-weight:800;color:#1e40af">OD${wi.od}xID${wi.id}xH${wi.h} mm. &nbsp;·&nbsp; ${wi.workType||'—'}</div>
      </div>

      ${wi.remark ? `<div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:10px 14px;margin-bottom:18px;font-size:.85rem">
        <span style="font-weight:700;color:#854d0e">📝 หมายเหตุ: </span>${wi.remark}</div>` : ''}

      <!-- ขั้นตอน -->
      <div style="font-size:.78rem;font-weight:700;color:#6366f1;margin-bottom:10px;letter-spacing:.04em">
        ขั้นตอนการทำงาน (${steps.length} ขั้นตอน)
      </div>
      ${stepsHtml || '<div style="color:#94a3b8;font-size:.85rem;padding:12px 0">ไม่มีขั้นตอน</div>'}

      <!-- ช่องลงชื่อ -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0">
        ${['ผู้ปฏิบัติงาน','หัวหน้างาน','ผู้ตรวจสอบ'].map(l=>`
        <div style="text-align:center">
          <div style="border-bottom:1px solid #94a3b8;height:36px;margin-bottom:4px"></div>
          <div style="font-size:.72rem;color:#64748b">${l}</div>
        </div>`).join('')}
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
  if (!win) { Swal.fire({ icon:'error', title:'บล็อก popup', text:'กรุณาอนุญาต popup แล้วลองใหม่' }); return; }
  win.document.write(html);
  win.document.close();
}

function _wiShowLinkedOrders(wiId) {
  const wi = _wiCache.find(w => w.wiId === wiId);
  if (!wi) return;
  // หา Order ที่ผูกตรง (wiId) หรือ auto-match (OD+ID+H+workType)
  const linked = _orderCache.filter(r => {
    if (String(r[ORDER_COLS.wiId]||'').trim() === wiId) return true; // ผูกตรง
    // auto-match
    if (_wiNorm(r[ORDER_COLS.od]) !== _wiNorm(wi.od)) return false;
    if (_wiNorm(r[ORDER_COLS.id_]) !== _wiNorm(wi.id)) return false;
    if (_wiNorm(r[ORDER_COLS.h_])  !== _wiNorm(wi.h))  return false;
    if (String(r[ORDER_COLS.workType]||'').trim() !== String(wi.workType||'').trim()) return false;
    return true;
  });

  if (!linked.length) {
    Swal.fire({ icon:'info', title:'ไม่มี Order ที่ผูกกับ WI นี้',
      text: 'WI: ' + wiId, confirmButtonText:'ปิด', confirmButtonColor:'#475569',
      background:'var(--bg-deep)', color:'var(--t1)' });
    return;
  }

  const rows = linked.map(r => {
    const noPO   = String(r[ORDER_COLS.noPO]||'—');
    const noQuo  = String(r[ORDER_COLS.noQuo]||'—');
    const cust   = String(r[ORDER_COLS.customer]||'—');
    const proc   = String(r[ORDER_COLS.process]||'—');
    const isDirect = String(r[ORDER_COLS.wiId]||'').trim() === wiId;
    const escPO  = noPO.replace(/'/g,"\'");
    return `<tr style="border-bottom:1px solid var(--bc-div);font-size:.82rem">
      <td style="padding:7px 10px;font-weight:700;color:#9b8fff">${noPO}</td>
      <td style="padding:7px 10px;color:var(--c1)">${noQuo}</td>
      <td style="padding:7px 10px">${cust}</td>
      <td style="padding:7px 10px;text-align:center">
        <span style="padding:2px 8px;border-radius:20px;font-size:.68rem;font-weight:600;background:${isDirect?'rgba(20,184,166,.15)':'rgba(99,102,241,.12)'};color:${isDirect?'#2dd4bf':'#9b8fff'};border:1px solid ${isDirect?'rgba(20,184,166,.3)':'rgba(99,102,241,.25)'}">
          ${isDirect?'🔗 ผูกตรง':'🔍 Auto-match'}
        </span>
      </td>
      <td style="padding:7px 10px">${proc}</td>
      <td style="padding:7px 10px;text-align:center">
        <button onclick="Swal.close();setTimeout(()=>showOrderDetail('${escPO}'),150)"
          style="padding:3px 10px;border-radius:6px;border:none;background:#6366f1;color:#fff;font-size:.7rem;cursor:pointer">📋 ดู</button>
      </td>
    </tr>`;
  }).join('');

  Swal.fire({
    title: '🔗 Order ที่ผูกกับ WI: ' + wiId,
    html: `<div style="text-align:left;max-height:60vh;overflow-y:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:var(--bg2);color:var(--t2);font-size:.75rem">
          <th style="padding:7px 10px;text-align:left">No.PO</th>
          <th style="padding:7px 10px;text-align:left">No.Quo</th>
          <th style="padding:7px 10px;text-align:left">ลูกค้า</th>
          <th style="padding:7px 10px;text-align:center">ประเภท</th>
          <th style="padding:7px 10px;text-align:left">Process</th>
          <th style="padding:7px 10px"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`,
    width: 'min(95vw, 820px)',
    background: 'var(--bg-deep)', color: 'var(--t1)',
    showConfirmButton: true, confirmButtonText: '✕ ปิด', confirmButtonColor: '#475569'
  });
}

async function _wiDelete(wiId) {
  const confirm = await Swal.fire({ icon:'warning', title:'ลบ WI ' + wiId + '?', showCancelButton:true, confirmButtonText:'ลบ', cancelButtonText:'ยกเลิก', confirmButtonColor:'#ef4444' });
  if (!confirm.isConfirmed) return;
  if (!SCRIPT_URL) return;
  try {
    await fetch(SCRIPT_URL, { method:'POST', body: JSON.stringify({ action:'deleteWI', wiId }) }).then(r=>r.json());
    Swal.fire({ toast:true, position:'top-end', icon:'success', title:'ลบแล้ว', showConfirmButton:false, timer:1500 });
    await _wiLoadList();
  } catch(err) {
    Swal.fire({ icon:'error', title:'ลบไม่สำเร็จ' });
  }
}

// ── โหลดรายการ WI ──
async function _wiLoadList() {
  const body = $('wiListBody');
  if (!SCRIPT_URL) {
    if (body) body.innerHTML = '<div style="text-align:center;color:#dc2626;padding:20px">⚠️ ยังไม่ได้ตั้งค่า Script URL — ไปที่แท็บ ตั้งค่า</div>';
    return;
  }
  if (body) body.innerHTML = '<div style="text-align:center;color:var(--t3);padding:20px">⏳ กำลังโหลด...</div>';
  try {
    const res = await fetch(SCRIPT_URL + '?action=getWIList').then(r => r.json());
    if (res.status === 'ok') {
      _wiCache = res.data || [];
      _wiRenderList();
    } else {
      if (body) body.innerHTML = '<div style="text-align:center;color:#dc2626;padding:20px">❌ ' + (res.message || 'โหลด WI ไม่ได้') + '</div>';
    }
  } catch(e) {
    if (body) body.innerHTML = '<div style="text-align:center;color:#dc2626;padding:20px">❌ เชื่อมต่อ Code.gs ไม่ได้: ' + e.message + '</div>';
  }
}

// ── render ตาราง WI ──
function _wiRenderList() {
  const body = $('wiListBody');
  if (!body) return;
  const q   = ($('wiSearchInput')?.value || '').toLowerCase().trim();
  const fOD = ($('wiFilterOD')?.value || '').trim();
  const fID = ($('wiFilterID')?.value || '').trim();
  const fH  = ($('wiFilterH')?.value  || '').trim();
  const fWT = ($('wiFilterWT')?.value  || '').toLowerCase().trim();

  // populate datalist แบบงาน
  const dl = $('wiFilterWTList');
  if (dl) {
    const wts = [...new Set(_wiCache.map(w => w.workType||'').filter(Boolean))];
    dl.innerHTML = wts.map(t => `<option value="${t}">`).join('');
  }

  const rows = _wiCache.filter(w => {
    if (q && ![w.od, w.id, w.h, w.workType, w.wiId].some(v => String(v||'').toLowerCase().includes(q))) return false;
    if (fOD && _wiNorm(w.od) !== _wiNorm(fOD)) return false;
    if (fID && _wiNorm(w.id) !== _wiNorm(fID)) return false;
    if (fH  && _wiNorm(w.h)  !== _wiNorm(fH))  return false;
    if (fWT && !String(w.workType||'').toLowerCase().includes(fWT)) return false;
    return true;
  });
  if (!rows.length) {
    body.innerHTML = '<div style="text-align:center;color:var(--t3);padding:20px;font-size:.85rem">ไม่พบ WI' + (q||fOD||fID||fH||fWT ? ' ที่ตรงกับเงื่อนไข' : ' — กด "+ สร้าง WI ใหม่" ด้านบน') + '</div>';
    return;
  }
  const _wiDateBE = s => {
    const m = String(s||'').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? m[1]+'/'+m[2]+'/'+m[3] : '—'; // ชีตเก็บ พ.ศ. แล้ว — แสดงตรงๆ
  };
  body.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:.82rem">
    <thead><tr style="background:var(--bg2);color:var(--t2)">
      <th style="padding:8px 10px;text-align:left">WI ID</th>
      <th style="padding:8px 10px;text-align:left">สเปกงาน</th>
      <th style="padding:8px 10px;text-align:center">ขั้นตอน</th>
      <th style="padding:8px 10px;text-align:center">วันที่สร้าง</th>
      <th style="padding:8px 10px;text-align:center">จัดการ</th>
    </tr></thead>
    <tbody>${rows.map(w => `
      <tr style="border-bottom:1px solid var(--bc-div)">
        <td style="padding:8px 10px;font-weight:700;color:var(--c1)">${w.wiId}</td>
        <td style="padding:8px 10px">
          <div style="font-weight:700;color:#1e40af">OD${w.od}xID${w.id}xH${w.h} mm.</div>
          <div style="font-size:.72rem;color:var(--t3);margin-top:1px">${w.workType||'—'}</div>
        </td>
        <td style="padding:8px 10px;text-align:center">
          <span style="background:#eff6ff;color:#1d4ed8;border-radius:5px;padding:2px 8px;font-weight:700">${(w.steps||[]).length} ขั้น</span>
        </td>
        <td style="padding:8px 10px;text-align:center;color:var(--t2);font-size:.75rem">${_wiDateBE(w.updatedAt)}</td>
        <td style="padding:8px 10px;text-align:center;white-space:nowrap">
          <button onclick="_wiOpenViewer('${w.wiId}')" style="padding:4px 10px;border-radius:6px;border:none;background:#2563eb;color:#fff;font-size:.72rem;cursor:pointer;margin:1px">👁️ ดู</button>
          <button onclick="_wiOpenForm('${w.wiId}')" style="padding:4px 10px;border-radius:6px;border:none;background:#f59e0b;color:#fff;font-size:.72rem;cursor:pointer;margin:1px">✏️ แก้</button>
          <button onclick="_wiDelete('${w.wiId}')" style="padding:4px 10px;border-radius:6px;border:none;background:#ef4444;color:#fff;font-size:.72rem;cursor:pointer;margin:1px">🗑️</button>
          <button onclick="_wiShowLinkedOrders('${w.wiId}')" style="padding:4px 10px;border-radius:6px;border:none;background:#0f766e;color:#fff;font-size:.72rem;cursor:pointer;margin:1px" title="ดู Order ที่ผูกอยู่">🔗 PO</button>
          <button onclick="_wiPrint('${w.wiId}')" style="padding:4px 10px;border-radius:6px;border:none;background:#7c3aed;color:#fff;font-size:.72rem;cursor:pointer;margin:1px" title="พิมพ์ใบ WI">🖨️</button>
        </td>
      </tr>`).join('')}
    </tbody></table>`;
}

// ── Viewer (step-by-step สำหรับแรงงาน) — อัปเดต in-place ไม่กระพริบ ──
let _wiViewStep = 0;
let _wiViewData = null;

function _wiOpenViewer(wiId) {
  const wi = _wiCache.find(w => w.wiId === wiId);
  if (!wi || !(wi.steps||[]).length) { Swal.fire({ icon:'info', title:'ไม่มีขั้นตอนใน WI นี้' }); return; }
  _wiViewData = wi; _wiViewStep = 0;
  const total = wi.steps.length;
  Swal.fire({
    html: `<div style="font-family:Sarabun,sans-serif">
      <div style="font-size:.78rem;color:#64748b;margin-bottom:4px" id="_wiVHead"></div>
      <div style="font-size:.85rem;font-weight:700;color:#2563eb;margin-bottom:10px" id="_wiVStep"></div>
      <div id="_wiVImg" style="margin-bottom:10px"></div>
      <div style="font-size:1rem;font-weight:600;color:#1e293b;padding:6px 0;min-height:32px" id="_wiVCaption"></div>
      <div style="display:flex;gap:6px;justify-content:center;margin-top:10px" id="_wiVDots"></div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button id="_wiVPrev" onclick="_wiViewPrev()"
          style="flex:1;padding:9px;border-radius:8px;border:1px solid #cbd5e1;background:#f8fafc;color:#334155;font-family:Sarabun,sans-serif;font-size:.88rem;cursor:pointer">◀ ก่อนหน้า</button>
        <button id="_wiVNext" onclick="_wiViewNext()"
          style="flex:1;padding:9px;border-radius:8px;border:none;background:#2563eb;color:#fff;font-family:Sarabun,sans-serif;font-size:.88rem;cursor:pointer;font-weight:700">ถัดไป ▶</button>
      </div>
    </div>`,
    showConfirmButton: false,
    showCloseButton: true,
    width: '400px',
    didOpen: () => _wiUpdateView()
  });
}

function _wiUpdateView() {
  const wi = _wiViewData;
  const steps = wi.steps || [];
  const s = steps[_wiViewStep];
  const total = steps.length;
  const q = id => document.getElementById(id);
  if (!q('_wiVHead')) return;
  q('_wiVHead').textContent    = wi.od + '×' + wi.id + '×' + wi.h + ' · ' + (wi.workType||'');
  q('_wiVStep').textContent    = 'ขั้นตอนที่ ' + (_wiViewStep+1) + ' / ' + total;
  q('_wiVImg').innerHTML       = s.img
    ? `<img src="${s.img}" style="max-width:100%;max-height:260px;border-radius:10px;border:1px solid #e2e8f0;display:block;margin:0 auto">`
    : `<div style="height:90px;background:#f1f5f9;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#94a3b8">ไม่มีรูป</div>`;
  q('_wiVCaption').textContent = s.caption || '(ไม่มีคำอธิบาย)';
  q('_wiVDots').innerHTML      = steps.map((_,i) =>
    `<div style="width:${i===_wiViewStep?'18px':'8px'};height:8px;border-radius:4px;background:${i===_wiViewStep?'#2563eb':'#cbd5e1'};transition:all .2s"></div>`
  ).join('');
  const prev = q('_wiVPrev'), next = q('_wiVNext');
  if (prev) prev.style.opacity = _wiViewStep === 0 ? '.35' : '1';
  if (next) next.textContent   = _wiViewStep < total-1 ? 'ถัดไป ▶' : '✅ เสร็จสิ้น';
}

function _wiViewPrev() {
  if (_wiViewStep > 0) { _wiViewStep--; _wiUpdateView(); }
}
function _wiViewNext() {
  const total = (_wiViewData?.steps||[]).length;
  if (_wiViewStep < total-1) { _wiViewStep++; _wiUpdateView(); }
  else Swal.close();
}


document.addEventListener('DOMContentLoaded', () => { if ($('gquoItemsWrap')) _gquoRenderItems(); if ($('gquoListBody')) _gquoFetchList(); setTimeout(_wiLoad, 1500); });

// ══════════════════════════════════════════════════════
// ── Item Master: รายการสินค้า/บริการที่ใช้บ่อย (sheet "ItemMaster") ──
// ══════════════════════════════════════════════════════
let _imEditIdx = -1;

async function fetchItemMaster() {
  if (!SCRIPT_URL) { renderItemMasterTable(); _gordRefreshItemList(); return; }
  const wrap = $('imTableWrap');
  if (wrap) wrap.innerHTML = `<div style="text-align:center;padding:16px;color:var(--t3);font-size:.82rem"><span class="spin-ico">↻</span> กำลังโหลด…</div>`;
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getItemMaster', {mode:'cors'});
    const data = await res.json();
    if (data.status === 'ok') _itemMasterCache = data.items || [];
    else throw new Error(data.message || 'unknown');
  } catch (e) {
    if (wrap) { wrap.innerHTML = `<div style="text-align:center;padding:16px;color:#f87171;font-size:.82rem">โหลดข้อมูลไม่สำเร็จ: ${e.message}</div>`; return; }
  }
  renderItemMasterTable();
  _gordRefreshItemList();
}

// เติม datalist รายชื่อสินค้า/บริการ ให้ช่อง "รายการสินค้า/บริการ" ของ Order ทั่วไป
function _gordRefreshItemList() {
  const dl = $('gord_itemList');
  if (!dl) return;
  dl.innerHTML = (_itemMasterCache || []).map(it => `<option value="${_escH(it.name)}">`).join('');
}

function _imInput(id, val, placeholder, type) {
  return `<input id="${id}" type="${type||'text'}" value="${_escH(val)}" placeholder="${placeholder||''}"
    style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid rgba(99,102,241,.35);
    background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.8rem;box-sizing:border-box">`;
}

function imAddRow() {
  _itemMasterCache.push({ code:'', name:'', unit:'ชิ้น', price:0 });
  _imEditIdx = _itemMasterCache.length - 1;
  renderItemMasterTable();
}
function imEditRow(i)    { _imEditIdx = i; renderItemMasterTable(); }
function imCancelEdit(i) {
  if (!_itemMasterCache[i].code && !_itemMasterCache[i].name) _itemMasterCache.splice(i, 1);
  _imEditIdx = -1;
  renderItemMasterTable();
}

async function imSaveRow(i) {
  const g = id => (document.getElementById(id)?.value || '').trim();
  const data = {
    code:  _itemMasterCache[i].code || '',
    name:  g('im_name_'+i),
    unit:  g('im_unit_'+i) || 'ชิ้น',
    price: parseFloat(g('im_price_'+i)) || 0,
  };
  if (!data.name) {
    Swal.fire({icon:'warning',title:'กรุณาใส่ชื่อรายการ',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#3b82f6'});
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
      body: JSON.stringify(Object.assign({ action:'saveItem' }, data))
    });
    const out = await res.json();
    if (!out || out.status !== 'ok') throw new Error((out && out.message) || 'save failed');
    _imEditIdx = -1;
    await fetchItemMaster();
    Swal.fire({icon:'success',title:'บันทึกรายการแล้ว ✅',background:'#0d1b2a',color:'#cce4ff',
      timer:1200,showConfirmButton:false,toast:true,position:'top-end'});
  } catch (e) {
    Swal.fire({icon:'error',title:'บันทึกไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
  }
}

async function imDeleteRow(i) {
  const it = _itemMasterCache[i];
  if (!it) return;
  Swal.fire({
    icon:'warning', title:`ลบรายการ "${it.name}"?`,
    html:`<div style="font-size:.83rem;color:#8b8aaa">ไม่สามารถย้อนกลับได้</div>`,
    background:'#0d1b2a', color:'#cce4ff',
    confirmButtonText:'🗑 ลบเลย', confirmButtonColor:'#c0464a',
    showCancelButton:true, cancelButtonText:'ยกเลิก', cancelButtonColor:'#374151',
  }).then(async r => {
    if (!r.isConfirmed) return;
    if (!it.code) { _itemMasterCache.splice(i,1); renderItemMasterTable(); return; }
    try {
      const res = await fetch(SCRIPT_URL, {
        method:'POST', mode:'cors',
        headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({ action:'deleteItem', code: it.code })
      });
      const out = await res.json();
      if (!out || out.status !== 'ok') throw new Error((out && out.message) || 'delete failed');
      await fetchItemMaster();
      Swal.fire({icon:'success',title:'ลบแล้ว',background:'#0d1b2a',color:'#cce4ff',
        timer:1200,showConfirmButton:false,toast:true,position:'top-end'});
    } catch (e) {
      Swal.fire({icon:'error',title:'ลบไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
    }
  });
}

function renderItemMasterTable() {
  const wrap = $('imTableWrap');
  if (!wrap) return;
  if (!_itemMasterCache.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:24px;color:var(--t3);font-size:.82rem">
      ยังไม่มีรายการ — กด ➕ เพิ่มรายการ</div>`;
    return;
  }
  const rows = _itemMasterCache.map((it, i) => {
    if (i === _imEditIdx) {
      return `<tr style="background:rgba(99,102,241,.08)">
        <td style="padding:6px 8px">${_imInput('im_name_'+i, it.name, 'ชื่อรายการสินค้า/บริการ *')}</td>
        <td style="padding:6px 8px">${_imInput('im_unit_'+i, it.unit || 'ชิ้น', 'หน่วย')}</td>
        <td style="padding:6px 8px">${_imInput('im_price_'+i, it.price, 'ราคา/หน่วย', 'number')}</td>
        <td style="padding:6px 8px;white-space:nowrap">
          <button onclick="guardClick(this, () => imSaveRow(${i}))"
            style="padding:5px 10px;border-radius:6px;border:none;background:#34d399;color:#0a2e1a;
            font-family:Sarabun,sans-serif;font-size:.75rem;font-weight:700;cursor:pointer;margin-right:4px">💾</button>
          <button onclick="imCancelEdit(${i})"
            style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:transparent;
            color:var(--t3);font-family:Sarabun,sans-serif;font-size:.75rem;cursor:pointer">✕</button>
        </td>
      </tr>`;
    }
    return `<tr style="${i%2===0?'background:var(--c1-05)':''}">
      <td style="padding:7px 10px;font-weight:700;color:var(--c1)">${_escH(it.name)||'—'}</td>
      <td style="padding:7px 10px;font-size:.78rem;color:var(--t2)">${_escH(it.unit)||'—'}</td>
      <td style="padding:7px 10px;font-size:.78rem;color:var(--t3)">${Number(it.price||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      <td style="padding:7px 10px;white-space:nowrap">
        <button onclick="imEditRow(${i})"
          style="padding:3px 10px;border-radius:6px;border:1px solid rgba(99,102,241,.4);background:transparent;
          color:#818cf8;font-family:Sarabun,sans-serif;font-size:.75rem;cursor:pointer;margin-right:4px">✏️</button>
        <button onclick="imDeleteRow(${i})"
          style="padding:3px 10px;border-radius:6px;border:1px solid rgba(248,113,113,.3);background:transparent;
          color:#f87171;font-family:Sarabun,sans-serif;font-size:.75rem;cursor:pointer">🗑</button>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:.82rem">
      <thead>
        <tr style="border-bottom:1px solid rgba(255,255,255,.1)">
          <th style="padding:6px 10px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">ชื่อรายการ</th>
          <th style="padding:6px 10px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">หน่วย</th>
          <th style="padding:6px 10px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">ราคา/หน่วย</th>
          <th style="padding:6px 10px;width:80px"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── ลบรายการ Order: ลบแถวใน sheet "Order" + ตั้งสถานะ DATA ของ No.Quo เป็น "รอสรุป" ──
async function deleteOrderRow(noPO, noQuo) {
  if (!SCRIPT_URL) {
    Swal.fire({icon:'warning',title:'ยังไม่ได้ตั้งค่า Script URL',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    return;
  }
  const r = await Swal.fire({
    icon:'warning', title:'ลบรายการ Order นี้?',
    html:`<div style="text-align:left;font-size:.85rem;line-height:1.8">
      <div>📋 <b>No.Quo:</b> ${noQuo || '—'}</div>
      <div>📦 <b>No.PO:</b> ${noPO || '—'}</div>
      <div style="color:#f87171;margin-top:6px">⚠️ จะลบแถวนี้ออกจากชีต Order และตั้งสถานะ DATA ของ No.Quo เป็น "รอสรุป"</div>
    </div>`,
    showCancelButton:true, confirmButtonText:'🗑️ ลบ', cancelButtonText:'ยกเลิก',
    background:'#0d1b2a', color:'#cce4ff',
    confirmButtonColor:'#dc2626', cancelButtonColor:'#475569'
  });
  if (!r.isConfirmed) return;

  Swal.fire({title:'กำลังลบ…', background:'#0d1b2a', color:'#cce4ff', allowOutsideClick:false, showConfirmButton:false, didOpen:()=>Swal.showLoading()});
  try {
    await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'deleteOrder', noPO }) });

    if (noQuo) {
      await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'updateDataStatus', noQuo, status:'รอสรุป' }) });
    }

    Swal.fire({icon:'success', title:'ลบแล้ว ✅',
      html:`ลบรายการ Order เรียบร้อย${noQuo ? `<br><span style="font-size:.8rem;color:#8b8aaa">ตั้งสถานะ DATA ของ No.Quo: <b>${noQuo}</b> เป็น "รอสรุป" แล้ว</span>` : ''}`,
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1', timer:2200, showConfirmButton:false});
    setTimeout(fetchOrders, 1200);
  } catch (err) {
    Swal.fire({icon:'error', title:'เกิดข้อผิดพลาด', text:'ลบไม่สำเร็จ', background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1'});
  }
}

// โหลดรายการ Order จากชีต "Order"
// showAll = true → โหลดทั้งหมด (limit=0), false/ไม่ระบุ → โหลดล่าสุด ORDER_LOAD_LIMIT รายการ
async function fetchOrders(showAll) {
  const tbody = $('ordBody');
  const trkBody = $('trackBody');
  const trkSum  = $('trkSummary');
  if (!tbody) return;
  if (!SCRIPT_URL) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding:30px;text-align:center;color:var(--t3);font-size:.8rem">⚠️ ยังไม่ได้ตั้งค่า Script URL</td></tr>`;
    return;
  }
  const limit = showAll ? 0 : ORDER_LOAD_LIMIT;
  tbody.innerHTML = `<tr><td colspan="10" style="padding:30px;text-align:center;color:var(--t3);font-size:.8rem"><span class="spin-ico">↻</span> กำลังโหลด…</td></tr>`;
  if (trkBody) trkBody.innerHTML = `<div style="padding:30px;text-align:center;color:var(--t3);font-size:.85rem"><span class="spin-ico">↻</span> กำลังโหลด…</div>`;
  if (trkSum)  trkSum.innerHTML  = '';
  try {
    const res = await fetch(SCRIPT_URL + '?action=getOrders&limit=' + limit, {mode:'cors'});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.status === 'error') throw new Error(data.message || 'unknown');
    // กรองแถวว่าง (ไม่มีเลข PO) ออก — เกิดจากแถวเปล่าท้ายชีตที่ getLastRow() นับรวมมาด้วย
    _orderCache = (data.rows || []).filter(r => String(r[ORDER_COLS.noPO]||'').trim()).slice().reverse(); // ใหม่สุดก่อน
    _initSeenIfEmpty(SEEN_KEY_ORDER, _orderCache.map(r => r[ORDER_COLS.noPO]));
    _ordPage = 1;
    _ordPopulateMatMeshDatalists();
    renderOrderTable();
    renderOrdLoadBanner(data.total || _orderCache.length, data.limited);
    if (typeof renderTrackDashboard === 'function') renderTrackDashboard();
    if (typeof _invRefreshCustomerSelect === 'function') _invRefreshCustomerSelect(); // อัปเดตจำนวน PO ที่รอเปิดใบกำกับ
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding:30px;text-align:center;color:#f87171;font-size:.8rem">โหลดข้อมูลไม่สำเร็จ: ${err.message}</td></tr>`;
    if (trkBody) trkBody.innerHTML = `<div style="padding:30px;text-align:center;color:#f87171;font-size:.85rem">โหลดข้อมูลไม่สำเร็จ: ${err.message}</div>`;
  }
}

// แบนเนอร์ "โหลดทั้งหมด" — แสดงเมื่อโหลดมาไม่ครบ (limited)
function renderOrdLoadBanner(total, limited) {
  const el = $('ordLoadBanner');
  if (!el) return;
  if (limited) {
    el.innerHTML = `<span style="color:#f59e0b;font-size:.75rem">
      ⚡ แสดง ${ORDER_LOAD_LIMIT.toLocaleString()} รายการล่าสุด จากทั้งหมด ${total.toLocaleString()} รายการ &nbsp;
      <button onclick="fetchOrders(true)" style="padding:3px 10px;border-radius:6px;cursor:pointer;
        font-family:Sarabun,sans-serif;font-size:.72rem;border:1px solid #f59e0b;
        background:rgba(245,158,11,.15);color:#f59e0b">
        📂 โหลดทั้งหมด ${total.toLocaleString()} รายการ
      </button></span>`;
  } else {
    el.innerHTML = '';
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
  if ($('ordFilterWorkType')) $('ordFilterWorkType').value = '';
  $('ordFilterWantFrom').value = '';
  $('ordFilterWantTo').value = '';
  _ordPage = 1;
  renderOrderTable();
}

// ── เรียงลำดับตาราง Order ──
let _ordSortCol = null;
let _ordSortDir = 1; // 1 = น้อย→มาก, -1 = มาก→น้อย
const _ORD_SORT_COLS = ['noQuo','noPO','customer','orderDate','wantDate','qty','price','process'];
function _ordSortBy(col) {
  if (_ordSortCol === col) {
    _ordSortDir = -_ordSortDir;
  } else {
    _ordSortCol = col;
    _ordSortDir = 1;
  }
  _ordPage = 1;
  renderOrderTable();
}
function _ordSortValue(r, col) {
  switch (col) {
    case 'orderDate':
    case 'wantDate':
      return _ordDateToInput(r[ORDER_COLS[col]]) || '';
    case 'qty':
    case 'price':
      return parseFloat(r[ORDER_COLS[col]]) || 0;
    default:
      return String(r[ORDER_COLS[col]]||'').toLowerCase();
  }
}

function renderOrderTable() {
  const tbody = $('ordBody');
  if (!tbody) return;
  // อัปเดตไอคอนหัวคอลัมน์ตามสถานะการเรียงลำดับ
  _ORD_SORT_COLS.forEach(col => {
    const el = $('ordSortIcon_' + col);
    if (el) el.textContent = (_ordSortCol === col) ? (_ordSortDir === 1 ? ' ▲' : ' ▼') : '';
  });
  const qTerms = ($('ordSearch')?.value || '').toLowerCase()
    .split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  let rows = _orderCache;
  if (qTerms.length) {
    rows = rows.filter(r => {
      const fields = [r[ORDER_COLS.noQuo], r[ORDER_COLS.noPO], r[ORDER_COLS.customer], r[ORDER_COLS.productList]]
        .map(v => String(v||'').toLowerCase());
      return qTerms.some(term => fields.some(v => v.includes(term)));
    });
  }

  // ── ตัวกรอง: สถานะงาน (ค่าเริ่มต้น = ซ่อนรายการ "เรียบร้อย" ยกเว้นเดือนนี้/เดือนที่แล้ว) ──
  const statusFilter = $('ordFilterStatus')?.value ?? '_not_done';
  if (statusFilter === '_not_done') {
    rows = rows.filter(r => String(r[ORDER_COLS.process]||'').trim() !== 'เรียบร้อย' || _ordIsRecentMonth(r[ORDER_COLS.orderDate]));
  } else if (statusFilter !== '_all') {
    rows = rows.filter(r => String(r[ORDER_COLS.process]||'').trim() === statusFilter);
  }

  // ── ตัวกรอง: ลูกค้า ──
  const custFilter = ($('ordFilterCustomer')?.value || '').trim().toLowerCase();
  if (custFilter) {
    rows = rows.filter(r => String(r[ORDER_COLS.customer]||'').toLowerCase().includes(custFilter));
  }

  // ── ตัวกรอง: แบบงาน ──
  const workTypeFilter = ($('ordFilterWorkType')?.value || '').trim().toLowerCase();
  if (workTypeFilter) {
    rows = rows.filter(r => String(r[ORDER_COLS.workType]||'').toLowerCase().includes(workTypeFilter));
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
    tbody.innerHTML = `<tr><td colspan="12" style="padding:30px;text-align:center;color:var(--t3);font-size:.8rem">ไม่มีข้อมูล Order</td></tr>`;
    $('ordPager').innerHTML = '';
    return;
  }

  // ── เรียงลำดับ ──
  if (_ordSortCol) {
    rows = rows.slice().sort((a, b) => {
      const va = _ordSortValue(a, _ordSortCol);
      const vb = _ordSortValue(b, _ordSortCol);
      if (va < vb) return -1 * _ordSortDir;
      if (va > vb) return 1 * _ordSortDir;
      return 0;
    });
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / ORD_PAGE_SIZE));
  if (_ordPage > totalPages) _ordPage = totalPages;
  if (_ordPage < 1) _ordPage = 1;
  const startIdx = (_ordPage - 1) * ORD_PAGE_SIZE;
  const pageRows = rows.slice(startIdx, startIdx + ORD_PAGE_SIZE);

  tbody.innerHTML = pageRows.map((r, ri) => {
    const noPO  = String(r[ORDER_COLS.noPO]||'');
    const price = parseFloat(r[ORDER_COLS.price]) || 0;
    const productList = String(r[ORDER_COLS.productList]||'');
    const customer    = String(r[ORDER_COLS.customer]||'');
    const note  = String(r[ORDER_COLS.note]||'');
    const note2 = String(r[ORDER_COLS.note2]||'');
    const process = String(r[ORDER_COLS.process]||'');
    const matStr = String(r[ORDER_COLS.material]||'');
    const isStainless = matStr.includes('สแตนเลส') || matStr.includes('SUS');
    const rowBg = isStainless
      ? 'background:rgba(250,204,21,.16);border-left:3px solid #facc15'
      : (ri % 2 === 0 ? '' : 'background:var(--pair-bg)');
    const isNewRow = _isNewItem(SEEN_KEY_ORDER, noPO);
    return `<tr style="${rowBg};border-bottom:1px solid var(--bc-div)">
      <td style="padding:8px 10px;white-space:nowrap">${_ordStatusBadge(process)}<br>
        <span style="display:inline-flex;align-items:center;gap:4px"><span style="font-size:.72rem;color:var(--c1);font-weight:600">${r[ORDER_COLS.noQuo]||'—'}</span>${_newBadge(isNewRow)}</span></td>
      <td style="padding:8px 10px;font-size:.78rem;font-weight:600;color:var(--t1);white-space:nowrap">${noPO||'—'} ${_wiBadge(r)}</td>
      <td style="padding:8px 10px;font-size:.78rem;color:var(--t1)">${customer||'—'}</td>
      <td style="padding:8px 10px;font-size:.72rem;color:var(--t3);white-space:nowrap">${r[ORDER_COLS.orderDate]||'—'}</td>
      <td style="padding:8px 10px;font-size:.72rem;color:var(--t3);white-space:nowrap">${r[ORDER_COLS.wantDate]||'—'}</td>
      <td style="padding:8px 10px;font-size:.72rem;color:var(--t1)">${String(r[ORDER_COLS.workType]||'')||'—'}</td>
      <td style="padding:8px 10px;font-size:.78rem;color:var(--t1)">${productList||'—'}</td>
      <td style="padding:8px 10px;text-align:center;font-size:.8rem;color:var(--t1)">${r[ORDER_COLS.qty]||'—'}</td>
      <td style="padding:8px 10px;font-size:.72rem;color:var(--t2)">${[note, note2].filter(Boolean).join(' / ') || '—'}</td>
      <td style="padding:8px 10px;text-align:right;font-size:.78rem;font-weight:600;color:var(--c1);white-space:nowrap">${price ? price.toLocaleString('th-TH',{minimumFractionDigits:2}) : '—'} <span style="font-size:.65rem">฿</span></td>
      <td style="padding:8px 10px;text-align:center;white-space:nowrap">
        <button onclick="showOrderDetail('${noPO.replace(/'/g,"\\'")}')"
          style="padding:5px 10px;border-radius:7px;border:none;background:#2563eb;color:#fff;
                 font-size:.7rem;cursor:pointer;font-family:Sarabun,sans-serif;margin:1px">
          👁️ ดู
        </button>
        <button onclick="_ordPrintCutting('${noPO.replace(/'/g,"\\'")}')"
          style="padding:5px 10px;border-radius:7px;border:none;background:#f59e0b;color:#fff;
                 font-size:.7rem;cursor:pointer;font-family:Sarabun,sans-serif;margin:1px">
          ✂️ ตัดเหล็ก
        </button>
        <button onclick="_ordPrintWorkOrder('${noPO.replace(/'/g,"\\'")}')"
          style="padding:5px 10px;border-radius:7px;border:none;background:#7c3aed;color:#fff;
                 font-size:.7rem;cursor:pointer;font-family:Sarabun,sans-serif;margin:1px">
          📋 Job Order
        </button>
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


// ── WI Cache & Match ─────────────────────────────────────────
function _wiNorm(v) { return parseFloat(String(v).trim()) || 0; }

function _wiLoad() {
  if (!SCRIPT_URL) return;
  fetch(SCRIPT_URL + '?action=getWIList')
    .then(r => r.json())
    .then(d => { if (d.status === 'ok') _wiCache = d.data || []; })
    .catch(() => {});
}

function _wiMatch(r) {
  // ตรวจ wiId ที่ผูกไว้โดยตรงก่อน (Approach A)
  const linkedId = String(r[ORDER_COLS.wiId] || '').trim();
  if (linkedId) return _wiCache.find(w => w.wiId === linkedId) || null;
  // fallback: auto-match ด้วย OD+ID+H+workType
  const od = _wiNorm(r[ORDER_COLS.od]);
  const id = _wiNorm(r[ORDER_COLS.id_]);
  const h  = _wiNorm(r[ORDER_COLS.h_]);
  const wt = String(r[ORDER_COLS.workType] || '').trim();
  if (!od && !id && !h) return null;
  return _wiCache.find(w =>
    _wiNorm(w.od) === od &&
    _wiNorm(w.id) === id &&
    _wiNorm(w.h)  === h  &&
    String(w.workType || '').trim() === wt
  ) || null;
}

function _wiBadge(r) {
  const wi = _wiMatch(r);
  if (wi) return '<span class="trk-wi-badge trk-wi-yes" title="มี WI: ' + (wi.wiId||'') + '">📋 WI</span>';
  return ''; // ไม่มี WI — ซ่อน badge
}

// ── ผูก/เปลี่ยน WI ให้ Order ──
async function _wiSetForOrder(noPO, wiId) {
  if (!SCRIPT_URL) return;
  const r = _orderCache.find(row => String(row[ORDER_COLS.noPO]) === String(noPO));
  if (!r) return;
  const toast = Swal.mixin({ toast:true, position:'top-end', showConfirmButton:false, timer:1800, timerProgressBar:true });
  try {
    const res = await fetch(SCRIPT_URL, {
      method:'POST',
      body: JSON.stringify({ action:'setOrderWI', noPO, wiId })
    }).then(res => res.json());
    if (res.status !== 'ok') throw new Error(res.message || 'error');
    // อัปเดต cache เลย ไม่ต้อง reload ทั้งหมด
    r[ORDER_COLS.wiId] = wiId;
    // อัปเดต badge ใน popup
    const badgeEl = document.getElementById('swd-wi-badge');
    if (badgeEl) badgeEl.innerHTML = _wiBadge(r);
    const viewBtn = document.getElementById('swd-wi-view');
    if (viewBtn) {
      const wi = _wiMatch(r);
      viewBtn.style.display = wi ? '' : 'none';
      if (wi) viewBtn.onclick = () => { Swal.close(); setTimeout(()=>_wiOpenViewer(wi.wiId),150); };
    }
    // re-render ตาราง/kanban เพื่ออัป badge
    if (typeof renderOrderTable === 'function') renderOrderTable();
    if (typeof _trkRender === 'function') _trkRender();
    toast.fire({ icon:'success', title: wiId ? 'ผูก WI แล้ว ✅' : 'ยกเลิก WI แล้ว' });
  } catch(err) {
    toast.fire({ icon:'error', title:'บันทึกไม่สำเร็จ', timer:2200 });
  }
}

// ── badge แสดงสถานะ Process (สไตล์เดียวกับตาราง DATA) ──
function _ordStatusBadge(process) {
  const c = _ordProcessColor(process);
  return `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:.65rem;font-weight:600;
    background:${c.bg};color:${c.fg};border:1px solid ${c.bd}">${process||'—'}</span>`;
}
// ── สีของ badge ตาม Process ──
function _ordProcessColor(process) {
  const p = String(process||'').trim();
  if (p === 'เรียบร้อย')   return {bg:'rgba(34,197,94,.15)',  fg:'#4ade80', bd:'rgba(34,197,94,.35)'};
  if (p === 'กำลังผลิต')   return {bg:'rgba(245,158,11,.15)', fg:'#fbbf24', bd:'rgba(245,158,11,.35)'};
  if (p === 'รอConfirm')   return {bg:'rgba(148,163,184,.15)',fg:'#cbd5e1', bd:'rgba(148,163,184,.35)'};
  if (p === 'Stock' || p === 'FG รอเรียก') return {bg:'rgba(99,102,241,.15)', fg:'#9b8fff', bd:'rgba(99,102,241,.35)'};
  if (p === 'เตรียมส่ง')   return {bg:'rgba(20,184,166,.15)', fg:'#2dd4bf', bd:'rgba(20,184,166,.35)'};
  return {bg:'rgba(56,189,248,.15)', fg:'#7dd3fc', bd:'rgba(56,189,248,.35)'};
}
// ── สีของ badge ตามสถานะส่งงาน ──
function _ordDeliverColor(s) {
  const v = String(s||'').trim();
  if (v.includes('ส่งแล้ว') || v.includes('เรียบร้อย')) return {bg:'rgba(34,197,94,.15)', fg:'#4ade80', bd:'rgba(34,197,94,.35)'};
  if (v.includes('ยังไม่ส่ง') || v === '') return {bg:'rgba(248,113,113,.15)', fg:'#f87171', bd:'rgba(248,113,113,.35)'};
  return {bg:'rgba(56,189,248,.15)', fg:'#7dd3fc', bd:'rgba(56,189,248,.35)'};
}
// ── แตกข้อความรูปภาพหลายรูป (คั่นด้วย , / ; / ขึ้นบรรทัดใหม่) ──
function _ordSplitImages(s) {
  return String(s||'').split(/[\n,;]+/).map(x => x.trim()).filter(Boolean);
}

// ── ลำดับขั้นตอนงาน สำหรับ Timeline (ความคืบหน้า) ──
const ORDER_FLOW_STEPS = [
  {label:'รับออเดอร์',          icon:'📋'},
  {label:'กำลังผลิต',           icon:'⚙️'},
  {label:'กำลังส่งชุป',          icon:'🧪'},
  {label:'เตรียมส่ง',            icon:'📦'},
  {label:'เรียบร้อย (ส่งสินค้าแล้ว)', icon:'🚚'},
];
// คืนค่า index ของขั้นตอนปัจจุบัน (0-4) หรือ 5 = เสร็จสิ้นทั้งหมด
function _ordCurrentStepIdx(r) {
  const p = String(r[ORDER_COLS.process]||'').trim();
  const delivered = String(r[ORDER_COLS.statusDeliver]||'').includes('ส่งแล้ว');
  if (delivered || p === 'เรียบร้อย') return 5;
  if (p === 'รอConfirm') return 0;
  if (p === 'กำลังผลิต') return 1;
  if (['ส่งชุป','ส่งตัวอย่างเทส+รอสรุป','ส่งยังไม่ครบ'].includes(p)) return 2;
  if (p === 'FG รอเรียก' || p === 'Stock') return 3;
  if (p === 'เตรียมส่ง') return 4;
  return 1; // ค่าเริ่มต้น = กำลังผลิต (รับออเดอร์แล้ว)
}
// สร้าง HTML ของ Timeline แนวตั้ง
function _ordTimelineHtml(r) {
  const cur = _ordCurrentStepIdx(r);
  const orderDate = String(r[ORDER_COLS.orderDate]||'').trim() || '—';
  const wantDate  = String(r[ORDER_COLS.wantDate]||'').trim() || '—';
  return ORDER_FLOW_STEPS.map((s,i) => {
    const isLast = i === ORDER_FLOW_STEPS.length - 1;
    let dot, dateTxt, badge;
    if (i < cur) {
      dot = `<div style="width:26px;height:26px;border-radius:50%;background:rgba(34,197,94,.18);border:2px solid #22c55e;
        display:flex;align-items:center;justify-content:center;font-size:.85rem;color:#4ade80;flex-shrink:0">✓</div>`;
      dateTxt = i === 0 ? orderDate : '';
      badge = `<span style="font-size:.66rem;font-weight:700;color:#4ade80;background:rgba(34,197,94,.12);
        border-radius:6px;padding:1px 7px">เสร็จสิ้น</span>`;
    } else if (i === cur) {
      dot = `<div style="width:26px;height:26px;border-radius:50%;background:rgba(245,158,11,.18);border:2px solid #f59e0b;
        display:flex;align-items:center;justify-content:center;font-size:.8rem;flex-shrink:0">${s.icon}</div>`;
      dateTxt = wantDate !== '—' ? `กำหนด: ${wantDate}` : '';
      badge = `<span style="font-size:.66rem;font-weight:700;color:#fbbf24;background:rgba(245,158,11,.12);
        border-radius:6px;padding:1px 7px">กำลังดำเนินการ</span>`;
    } else {
      dot = `<div style="width:26px;height:26px;border-radius:50%;background:rgba(148,163,184,.12);border:2px solid #475569;
        display:flex;align-items:center;justify-content:center;font-size:.8rem;color:#64748b;flex-shrink:0">${s.icon}</div>`;
      dateTxt = '';
      badge = `<span style="font-size:.66rem;font-weight:700;color:var(--t3);background:rgba(148,163,184,.1);
        border-radius:6px;padding:1px 7px">รอดำเนินการ</span>`;
    }
    return `
      <div style="display:flex;gap:10px">
        <div style="display:flex;flex-direction:column;align-items:center">
          ${dot}
          ${!isLast ? `<div style="flex:1;width:2px;min-height:26px;background:${i < cur ? '#22c55e' : 'rgba(148,163,184,.25)'};margin:2px 0"></div>` : ''}
        </div>
        <div style="padding-bottom:18px">
          <div style="font-size:.82rem;font-weight:700;color:${i<=cur?'var(--t1)':'var(--t3)'}">${s.label}</div>
          ${dateTxt ? `<div style="font-size:.7rem;color:var(--t3);margin:2px 0">${dateTxt}</div>` : ''}
          <div style="margin-top:3px">${badge}</div>
        </div>
      </div>`;
  }).join('');
}

// ── การ์ด: ดูรายละเอียด Order ──
function showOrderDetail(noPO) {
  const r = _orderCache.find(row => String(row[ORDER_COLS.noPO]) === String(noPO));
  if (!r) return;
  _addSeen(SEEN_KEY_ORDER, noPO);
  renderOrderTable();

  const g = (k) => String(r[ORDER_COLS[k]] ?? '').trim() || '—';
  const procColor = _ordProcessColor(r[ORDER_COLS.process]);
  const delColor  = _ordDeliverColor(r[ORDER_COLS.statusDeliver]);
  const price = parseFloat(r[ORDER_COLS.price]) || 0;
  const noQuo = String(r[ORDER_COLS.noQuo]||'');
  const escPO   = noPO.replace(/'/g,"\\'");
  const escQuo  = noQuo.replace(/'/g,"\\'");

  const poUrl = String(r[ORDER_COLS.poFile]||'').trim();
  const jobImgs = [String(r[ORDER_COLS.jobImg1]||'').trim(), String(r[ORDER_COLS.jobImg2]||'').trim()];
  const shipDate = String(r[ORDER_COLS.update]||'').trim() || '—';

  const rowField = (icon, label, value) => `
    <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0">
      <div style="font-size:1rem;line-height:1.4;flex-shrink:0">${icon}</div>
      <div style="min-width:0">
        <div style="font-size:.68rem;color:var(--t3)">${label}</div>
        <div style="font-size:.85rem;font-weight:600;color:var(--t1);word-break:break-word">${value}</div>
      </div>
    </div>`;

  const imgCard = (label, url, h) => {
    const height = h || 90;
    return `
    <div style="text-align:center">
      <div style="font-size:.68rem;color:var(--t3);margin-bottom:4px">${label}</div>
      ${url
        ? `<div style="position:relative">
             <img src="${url}" style="width:100%;height:${height}px;object-fit:cover;border-radius:8px;border:1px solid var(--bc-card)">
             <button onclick="_ordZoomImage('${String(url).replace(/'/g,"\\'")}','${label.replace(/'/g,"\\'")}')"
               style="position:absolute;bottom:5px;right:5px;width:24px;height:24px;border-radius:50%;border:none;
               background:rgba(0,0,0,.55);color:#fff;font-size:.78rem;cursor:pointer;display:flex;align-items:center;justify-content:center">🔍</button>
           </div>`
        : `<div style="width:100%;height:${height}px;border-radius:8px;border:1px dashed var(--bc-card);
             display:flex;align-items:center;justify-content:center;color:var(--t3);font-size:.7rem">ไม่มีรูป</div>`}
    </div>`;
  };

  // รูป PO ขนาดใหญ่ — ใช้ object-fit:contain ให้เห็นรายละเอียดทั้งภาพ ไม่ถูกครอป
  const imgCardLarge = (label, url) => `
    <div style="text-align:center">
      <div style="font-size:.7rem;font-weight:700;color:var(--c1);margin-bottom:6px">${label}</div>
      ${url
        ? `<div style="position:relative;background:var(--bc-div);border-radius:10px">
             <img src="${url}" style="width:100%;height:280px;object-fit:contain;border-radius:10px;border:1px solid var(--bc-card)">
             <button onclick="_ordZoomImage('${String(url).replace(/'/g,"\\'")}','${label.replace(/'/g,"\\'")}')"
               style="position:absolute;bottom:8px;right:8px;width:30px;height:30px;border-radius:50%;border:none;
               background:rgba(0,0,0,.55);color:#fff;font-size:.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center">🔍</button>
           </div>`
        : `<div style="width:100%;height:280px;border-radius:10px;border:1px dashed var(--bc-card);
             display:flex;align-items:center;justify-content:center;color:var(--t3);font-size:.75rem">ไม่มีรูป</div>`}
    </div>`;

  const html = `
    <div style="text-align:left;font-family:inherit">
      <!-- หัวการ์ด -->
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:8px;
        padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid var(--bc-div)">
        <div style="display:flex;gap:18px;flex-wrap:wrap">
          <div><div style="font-size:.68rem;color:var(--t3)">No.Quo</div><div style="font-size:1rem;font-weight:800;color:var(--c1)">${g('noQuo')}</div></div>
          <div><div style="font-size:.68rem;color:var(--t3)">No.PO</div><div style="font-size:1rem;font-weight:800;color:#9b8fff">${g('noPO')}</div></div>
          <div><div style="font-size:.68rem;color:var(--t3)">ลูกค้า</div><div style="font-size:1rem;font-weight:700;color:var(--t1)">${g('customer')}</div></div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span style="padding:4px 10px;border-radius:999px;font-size:.72rem;font-weight:700;
            background:${procColor.bg};color:${procColor.fg};border:1px solid ${procColor.bd}">${g('process')}</span>
          <span style="padding:4px 10px;border-radius:999px;font-size:.72rem;font-weight:700;
            background:${delColor.bg};color:${delColor.fg};border:1px solid ${delColor.bd}">📦 ${g('statusDeliver')}</span>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:16px;align-items:start">
        <!-- ── คอลัมน์ 1: ข้อมูลหลัก ── -->
        <div>
          <div style="font-size:.7rem;font-weight:700;color:var(--c1);margin-bottom:2px">📋 ข้อมูลหลัก</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 14px;background:var(--bc-div);
            border-radius:10px;padding:6px 12px">
            ${rowField('📅','วันที่สั่งซื้อ', g('orderDate'))}
            ${rowField('🚚','วันที่ส่งงาน', shipDate)}
            ${rowField('⏰','วันที่ต้องการ', g('wantDate'))}
            ${rowField('🏷️','สถานะงาน', g('status'))}
            ${rowField('🧱','แม่พิมพ์', g('mold'))}
            ${rowField('📐','แบบงาน', g('workType'))}
            ${rowField('📦','รายการสินค้า', g('productList'))}
            ${rowField('🔢','จำนวน', g('qty'))}
            ${rowField('🧪','วัตถุดิบ', g('material'))}
            ${rowField('🔝','ฝาบน', g('matTop') || '—')}
            ${rowField('🔻','ฝาล่าง', g('matBot') || '—')}
            ${rowField('🕸️','ตะแกรงนอก', g('meshOut') || '—')}
            ${rowField('🕸️','ตะแกรงใน', g('meshIn') || '—')}
            ${rowField('💰','ราคาเสนอขาย', price ? price.toLocaleString('th-TH',{minimumFractionDigits:2}) + ' บาท' : '—')}
          </div>

          <!-- หมายเหตุ / Note -->
          <div style="font-size:.7rem;font-weight:700;color:var(--c1);margin:10px 0 6px">📝 หมายเหตุ / Note</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div style="background:var(--bc-div);border-radius:10px;padding:10px 12px;
              font-size:.8rem;color:var(--t1);white-space:pre-wrap;word-break:break-word;min-height:40px">
              <div style="font-size:.66rem;color:var(--t3);margin-bottom:3px">หมายเหตุ</div>${g('note')}</div>
            <div style="background:var(--bc-div);border-radius:10px;padding:10px 12px;
              font-size:.8rem;color:var(--t1);white-space:pre-wrap;word-break:break-word;min-height:40px">
              <div style="font-size:.66rem;color:var(--t3);margin-bottom:3px">Note</div>—</div>
          </div>
        </div>

        <!-- ── คอลัมน์ 2: รูปภาพ (PO ใหญ่ + รูปงาน) ── -->
        <div>
          <div style="font-size:.7rem;font-weight:700;color:var(--c1);margin-bottom:6px">🖼️ รูปภาพ</div>
          <div style="margin-bottom:10px">
            ${imgCardLarge('รูปภาพ PO.', poUrl)}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            ${imgCard('รูปงาน 1', jobImgs[0]||'', 100)}
            ${imgCard('รูปงาน 2', jobImgs[1]||'', 100)}
          </div>
        </div>

        <!-- ── คอลัมน์ 3: ความคืบหน้า (Timeline) ── -->
        <div>
          <div style="font-size:.7rem;font-weight:700;color:var(--c1);margin-bottom:8px">📈 ความคืบหน้า (Timeline)</div>
          <div style="background:var(--bc-div);border-radius:10px;padding:12px 12px 0 12px">
            ${_ordTimelineHtml(r)}
          </div>
        </div>
      </div>

      <!-- ── WI Section ── -->
      <div style="margin-top:12px;padding:10px 14px;border-radius:10px;background:var(--bc-div);border:1px solid var(--bc-card);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:.72rem;font-weight:700;color:var(--c1);white-space:nowrap">📋 Work Instruction</span>
        <span id="swd-wi-badge">${_wiBadge(r)}</span>
        <select id="swd-wi-select" onchange="_wiSetForOrder('${escPO}',this.value)"
          style="flex:1;min-width:140px;padding:5px 8px;border-radius:6px;border:1px solid var(--bc-card);background:var(--bg-deep);color:var(--t1);font-size:.75rem;cursor:pointer">
          <option value="">— ยังไม่ผูก WI —</option>
          ${_wiCache.map(w => `<option value="${w.wiId}" ${String(r[ORDER_COLS.wiId]||'')===w.wiId?'selected':''}>${w.wiId} · OD${w.od} ID${w.id} H${w.h} ${w.workType||''}</option>`).join('')}
        </select>
        ${(() => { const wi = _wiMatch(r); return `<button id="swd-wi-view" onclick="Swal.close();setTimeout(()=>_wiOpenViewer('${wi ? wi.wiId.replace(/'/g,"\\'") : ''}'),150)"
          style="padding:5px 12px;border-radius:6px;border:none;background:#2563eb;color:#fff;font-size:.75rem;font-weight:700;cursor:pointer;display:${wi?'':'none'}">👁️ ดู WI</button>`; })()}
      </div>

      <!-- ปุ่ม Action -->
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:14px;
        padding-top:10px;border-top:1px solid var(--bc-div)">
        <button onclick="_ordCopySpec('${escPO}')"
          style="padding:7px 12px;border-radius:8px;border:1px solid rgba(99,102,241,.35);
          background:rgba(99,102,241,.1);color:#6366f1;font-size:.78rem;font-weight:700;cursor:pointer">📄 คัดลอกสเปก</button>
        <button onclick="_ordQuickChangeProcess('${escPO}')"
          style="padding:7px 12px;border-radius:8px;border:1px solid rgba(245,158,11,.35);
          background:rgba(245,158,11,.1);color:#d97706;font-size:.78rem;font-weight:700;cursor:pointer">🔄 เปลี่ยนสถานะ</button>
        ${g('process') === 'เรียบร้อย' ? '' : `<button onclick="_ordMarkDelivered('${escPO}')"
          style="padding:7px 12px;border-radius:8px;border:1px solid rgba(34,197,94,.35);
          background:rgba(34,197,94,.1);color:#16a34a;font-size:.78rem;font-weight:700;cursor:pointer">✈️ ส่งงาน</button>`}
        <button onclick="_ordPrintDetail('${escPO}')"
          style="padding:7px 12px;border-radius:8px;border:1px solid var(--bc-card);
          background:var(--bc-div);color:var(--t1);font-size:.78rem;font-weight:700;cursor:pointer">🖨️ พิมพ์</button>
        <button onclick="Swal.close(); openEditOrder('${escPO}')"
          style="padding:7px 12px;border-radius:8px;border:1px solid rgba(99,102,241,.35);
          background:rgba(99,102,241,.1);color:#6366f1;font-size:.78rem;font-weight:700;cursor:pointer">✏️ แก้ไข</button>
        <button onclick="deleteOrderRow('${escPO}','${escQuo}')"
          style="padding:7px 12px;border-radius:8px;border:1px solid rgba(248,113,113,.35);
          background:rgba(248,113,113,.1);color:#f87171;font-size:.78rem;font-weight:700;cursor:pointer">🗑️ ลบ Order</button>
      </div>
    </div>`;

  Swal.fire({
    title: '📋 รายละเอียด Order',
    html, width: 'min(96vw, 1180px)',
    background: '#ffffff', color: '#1e293b',
    showConfirmButton: true,
    confirmButtonText: '✕ ปิด', confirmButtonColor: '#475569'
  });
}

// ── ดูรูปขยาย ──
function _ordZoomImage(url, label) {
  Swal.fire({
    title: label, imageUrl: url, imageAlt: label,
    width: 'min(92vw, 720px)',
    background: 'var(--bg-deep)', color: 'var(--t1)',
    confirmButtonText: 'ปิด', confirmButtonColor: '#6366f1'
  });
}

// ── เปลี่ยนสถานะงาน (Process) แบบเร็ว จากการ์ดรายละเอียด ──
async function _ordQuickChangeProcess(noPO) {
  const r = _orderCache.find(row => String(row[ORDER_COLS.noPO]) === String(noPO));
  if (!r) return;
  const options = {};
  ['รอConfirm','กำลังผลิต','ส่งชุป','ส่งตัวอย่างเทส+รอสรุป','ส่งยังไม่ครบ','FG รอเรียก','Stock','เตรียมส่ง','เรียบร้อย']
    .forEach(v => options[v] = v);

  const { value: newProcess } = await Swal.fire({
    title: '🔄 เปลี่ยนสถานะงาน (Process)',
    input: 'select',
    inputOptions: options,
    inputValue: r[ORDER_COLS.process] || '',
    showCancelButton: true,
    confirmButtonText: '✅ บันทึก', cancelButtonText: 'ยกเลิก',
    background: 'var(--bg-deep)', color: 'var(--t1)',
    confirmButtonColor: '#6366f1', cancelButtonColor: '#475569'
  });
  if (!newProcess) return;

  const row = r.slice();
  while (row.length < ORDER_NUM_COLS) row.push('');
  row[ORDER_COLS.process] = newProcess;
  row[ORDER_COLS.statusDeliver] = (newProcess === 'เรียบร้อย'); // P sync กับ AppSheet

  // แสดง loading ระหว่างบันทึก
  Swal.fire({ title:'⏳ กำลังบันทึก...', allowOutsideClick:false,
    background:'var(--bg-deep)', color:'var(--t1)', didOpen:()=>Swal.showLoading() });

  const toast = Swal.mixin({ toast:true, position:'top-end', showConfirmButton:false, timer:1500, timerProgressBar:true });
  try {
    await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'updateOrder', noPO, row }) });
    await fetchOrders();
    showOrderDetail(noPO);
    toast.fire({icon:'success', title:'บันทึกแล้ว ✅'});
  } catch (err) {
    toast.fire({icon:'error', title:'บันทึกไม่สำเร็จ', timer:2200});
  }
}

// ── ตั้งสถานะส่งงาน = "ส่งแล้ว" + บันทึกวันที่ส่งงาน ──
async function _ordMarkDelivered(noPO) {
  const r = _orderCache.find(row => String(row[ORDER_COLS.noPO]) === String(noPO));
  if (!r) return;
  const res = await Swal.fire({
    icon:'question', title:'ยืนยันส่งงาน?',
    html:`No.PO: <b>${noPO}</b><br><span style="font-size:.8rem;color:var(--t3)">จะตั้งสถานะส่งงาน = "ส่งแล้ว", สถานะงาน (Process) = "เรียบร้อย" และบันทึกวันที่ส่งงานวันนี้</span>`,
    showCancelButton:true, confirmButtonText:'✅ ยืนยัน', cancelButtonText:'ยกเลิก',
    background:'var(--bg-deep)', color:'var(--t1)',
    confirmButtonColor:'#22c55e', cancelButtonColor:'#475569'
  });
  if (!res.isConfirmed) return;

  const row = r.slice();
  while (row.length < ORDER_NUM_COLS) row.push('');
  row[ORDER_COLS.statusDeliver] = true;   // P = TRUE (AppSheet)
  row[ORDER_COLS.process] = 'เรียบร้อย';
  row[ORDER_COLS.update] = _ordDateToSheet(_todayStr());

  showOrderDetail(noPO);
  const toast = Swal.mixin({ toast:true, position:'top-end', showConfirmButton:false, timer:1500, timerProgressBar:true });
  try {
    await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'updateOrder', noPO, row }) });
    await fetchOrders();
    showOrderDetail(noPO);
    toast.fire({icon:'success', title:'ส่งงานแล้ว ✅'});
  } catch (err) {
    toast.fire({icon:'error', title:'บันทึกไม่สำเร็จ', timer:2200});
  }
}

// ── พิมพ์ Report ขนาดตัดเหล็ก: 1) จาก Order (OD/H) → 2) จาก DATA (No.Quo) → 3) กรอกเอง ──
async function _ordPrintCutting(noPO) {
  const ord = _orderCache.find(row => String(row[ORDER_COLS.noPO]) === String(noPO));
  if (!ord) return;
  const noQuo = String(ord[ORDER_COLS.noQuo] || '').trim();

  // ── ดึง OD/ID/H จาก Order โดยตรง (Order เก็บค่าพวกนี้ไว้แล้ว) ──
  const ordOd  = parseFloat(ord[ORDER_COLS.od]  || '') || 0;
  const ordId  = parseFloat(ord[ORDER_COLS.id_] || '') || 0;
  const ordH   = parseFloat(ord[ORDER_COLS.h_]  || '') || 0;
  const ordQty = parseFloat(ord[ORDER_COLS.qty] || '') || 1;
  const ordMatTop  = String(ord[ORDER_COLS.matTop]  || '').trim();
  const ordMatBot  = String(ord[ORDER_COLS.matBot]  || '').trim();
  const ordMeshOut = String(ord[ORDER_COLS.meshOut] || '').trim();
  const ordMeshIn  = String(ord[ORDER_COLS.meshIn]  || '').trim();

  if (ordOd && ordH) {
    // มีข้อมูล OD/H ใน Order — ใช้เลย ไม่ต้องโหลด DATA
    const matCodes = [ordMatTop, ordMatBot, ordMeshOut, ordMeshIn];
    const res = _computeCutParts(ordOd, ordId, ordH, ordQty, matCodes, 0, [false,false,false,false]);
    if (!res) {
      Swal.fire({icon:'warning', title:'คำนวณไม่ได้', text:'ข้อมูล OD หรือ H ไม่ถูกต้อง',
        background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#1d65cc'});
      return;
    }
    const html = _renderCuttingReportHtml(res, {
      od: ordOd, id_: ordId, h: ordH, unit: ordQty,
      noQuo: noQuo || '—', noPO: noPO || ''
    });
    _openCuttingReport(html);
    return;
  }

  // ── Fallback #2: ลองดึงจาก DATA ด้วย No.Quo (Order เก่าที่ยังไม่มี OD/H) ──
  if (noQuo) {
    if (!_dtCache || !_dtCache.length) {
      Swal.fire({title:'⏳ กำลังโหลดข้อมูล...', allowOutsideClick:false, background:'#0d1b2a', color:'#cce4ff', didOpen:()=>Swal.showLoading()});
      await dtRefresh(false);
      Swal.close();
    }
    const stripQ = s => String(s || '').replace(/^Q-/i, '').trim();
    const dtRow = (_dtCache || []).find(r => stripQ(r[DT.noQuo]) === stripQ(noQuo));
    if (dtRow) {
      printCuttingReportFromDataRow(dtRow, noPO);
      return;
    }
  }

  // ── Fallback #3: ไม่มีทั้งใน Order และ DATA — ให้กรอกขนาดเองได้ ──
  const matKeys = Object.keys(typeof specMatData !== 'undefined' ? specMatData : {});
  const matOpts = ['— ไม่มี —', ...matKeys].map(k => `<option value="${k}">${k}</option>`).join('');
  const IS = `width:100%;padding:6px 8px;border-radius:6px;border:1px solid #cbd5e1;background:#f8fafc;color:#1e293b;font-family:Sarabun,sans-serif;font-size:.82rem`;

  const { isConfirmed, value: dims } = await Swal.fire({
    title: `✂️ ตัดเหล็ก — กรอกขนาด`,
    background: '#ffffff', color: '#1e293b',
    width: 'min(92vw, 520px)',
    html: `
      <div style="text-align:left;font-size:.82rem;color:#475569;margin-bottom:6px">
        ${noQuo ? `No.Quo: <b>${noQuo}</b> — ` : ''}ยังไม่มีข้อมูล OD/H บันทึกไว้ใน Order — กรุณากรอกขนาด
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:left">
        <label style="font-size:.78rem;font-weight:600;color:#475569">OD (มม.)*<br>
          <input type="number" id="cft_od" min="0" step="0.1" placeholder="เช่น 150"
            style="${IS};margin-top:3px"></label>
        <label style="font-size:.78rem;font-weight:600;color:#475569">ID (มม.)<br>
          <input type="number" id="cft_id" min="0" step="0.1" placeholder="0"
            style="${IS};margin-top:3px" value="0"></label>
        <label style="font-size:.78rem;font-weight:600;color:#475569">H (มม.)*<br>
          <input type="number" id="cft_h" min="0" step="0.1" placeholder="เช่น 80"
            style="${IS};margin-top:3px"></label>
        <label style="font-size:.78rem;font-weight:600;color:#475569">จำนวน (ลูก)<br>
          <input type="number" id="cft_unit" min="1" step="1" value="1"
            style="${IS};margin-top:3px"></label>
      </div>
      ${matKeys.length ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:left;margin-top:10px">
        <label style="font-size:.78rem;font-weight:600;color:#475569">ฝาบน<br>
          <select id="cft_matTop" style="${IS};margin-top:3px">${matOpts}</select></label>
        <label style="font-size:.78rem;font-weight:600;color:#475569">ฝาล่าง<br>
          <select id="cft_matBot" style="${IS};margin-top:3px">${matOpts}</select></label>
        <label style="font-size:.78rem;font-weight:600;color:#475569">ตะแกรงนอก<br>
          <select id="cft_meshOut" style="${IS};margin-top:3px">${matOpts}</select></label>
        <label style="font-size:.78rem;font-weight:600;color:#475569">ตะแกรงใน<br>
          <select id="cft_meshIn" style="${IS};margin-top:3px">${matOpts}</select></label>
      </div>` : ''}`,
    showCancelButton: true,
    confirmButtonText: '✂️ พิมพ์รายงาน',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#f59e0b',
    cancelButtonColor: '#94a3b8',
    preConfirm: () => {
      const od   = parseFloat(document.getElementById('cft_od')?.value) || 0;
      const id_  = parseFloat(document.getElementById('cft_id')?.value) || 0;
      const h    = parseFloat(document.getElementById('cft_h')?.value)  || 0;
      const unit = parseFloat(document.getElementById('cft_unit')?.value) || 1;
      if (!od || !h) { Swal.showValidationMessage('กรุณากรอก OD และ H'); return false; }
      const matTop  = document.getElementById('cft_matTop')?.value  || '';
      const matBot  = document.getElementById('cft_matBot')?.value  || '';
      const meshOut = document.getElementById('cft_meshOut')?.value || '';
      const meshIn  = document.getElementById('cft_meshIn')?.value  || '';
      return { od, id_, h, unit,
        matCodes: [
          matTop  === '— ไม่มี —' ? '' : matTop,
          matBot  === '— ไม่มี —' ? '' : matBot,
          meshOut === '— ไม่มี —' ? '' : meshOut,
          meshIn  === '— ไม่มี —' ? '' : meshIn,
        ]
      };
    }
  });

  if (!isConfirmed || !dims) return;
  const res = _computeCutParts(dims.od, dims.id_, dims.h, dims.unit, dims.matCodes, 0, [false,false,false,false]);
  if (!res) {
    Swal.fire({icon:'warning', title:'คำนวณไม่ได้', text:'ข้อมูล OD หรือ H ไม่ถูกต้อง',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#1d65cc'});
    return;
  }
  const html = _renderCuttingReportHtml(res, {
    od: dims.od, id_: dims.id_, h: dims.h, unit: dims.unit,
    noQuo: noQuo || '—', noPO: noPO || ''
  });
  _openCuttingReport(html);
}

// ── พิมพ์ใบสั่งงานผลิต (Work Order) ของ Order ──
async function _ordPrintWorkOrder(noPO) {
  const ord = _orderCache.find(row => String(row[ORDER_COLS.noPO]) === String(noPO));
  if (!ord) return;
  const g = (k) => String(ord[ORDER_COLS[k]] ?? '').trim();
  const noQuo = g('noQuo');

  // ถ้ายังไม่เคยโหลดข้อมูล DATA ให้โหลดก่อน (ต้องใช้ OD/ID/H/ตะแกรง/ฝา)
  if (!_dtCache || !_dtCache.length) {
    Swal.fire({title:'⏳ กำลังโหลดข้อมูล DATA...', allowOutsideClick:false, background:'#0d1b2a', color:'#cce4ff', didOpen:()=>Swal.showLoading()});
    await dtRefresh(false);
    Swal.close();
  }
  const dtRow = (_dtCache || []).find(row => String(row[DT.noQuo] || '').trim() === noQuo);

  const od = dtRow ? (dtRow[DT.od]||'') : '';
  const id_ = dtRow ? (dtRow[DT.id]||'') : '';
  const h  = dtRow ? (dtRow[DT.h]||'')  : '';
  const meshOut = g('meshOut') || (dtRow ? matLabel(dtRow[DT.meshOut]) : '');
  const meshIn  = g('meshIn')  || (dtRow ? matLabel(dtRow[DT.meshIn])  : '');
  const matTop  = g('matTop')  || (dtRow ? matLabel(dtRow[DT.matTop])  : '');
  const matBot  = g('matBot')  || (dtRow ? matLabel(dtRow[DT.matBot])  : '');

  const drawingImg = String(ord[ORDER_COLS.jobImg1]||'').trim() || String(ord[ORDER_COLS.jobImg2]||'').trim();
  const poImg = String(ord[ORDER_COLS.poFile]||'').trim();

  // หา รหัสลูกค้า จาก _custCache (ใช้ contact หรือ name เพื่อจับคู่)
  const _custVal = g('customer');
  const _custObj = (_custCache || []).find(c => c.contact === _custVal || c.name === _custVal);
  const custCode = (_custObj && _custObj.code) ? _custObj.code : _custVal;

  const html = _renderWorkOrderHtml({
    noPO, noQuo,
    customer: custCode,
    productList: g('productList') || '—',
    workType: g('workType') || '—',
    qty: g('qty') || '—',
    od, id_, h, meshOut, meshIn, matTop, matBot,
    orderDate: g('orderDate'),
    wantDate: g('wantDate'),
    note: g('note'),
    drawingImg,
    poImg,
  });
  _openCuttingReport(html);
}

// ── สร้างแผนภาพ SVG แบบโครงตะกร้าตาม workType (อ้างอิงแพทเทิลที่ผู้ใช้ส่งมา) ──
function _workTypeDiagramSvg(workType) {
  const wt = String(workType||'');
  let type = null;
  if (/บุ๋ม|เจาะรู/.test(wt)) type = 'dimple';
  else if (/ทะลุ/.test(wt)) type = 'through';
  if (!type) return '';

  const meshDots = (cx, cy) => {
    let dots = '';
    const cols = 5, rows = 4, sp = 10;
    const startX = cx - (cols-1)*sp/2;
    const startY = cy - (rows-1)*sp/2;
    for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
      dots += `<circle cx="${startX+c*sp}" cy="${startY+r*sp}" r="3.5" fill="none" stroke="#222" stroke-width="1"/>`;
    }
    return dots;
  };

  if (type === 'through') {
    return `
    <div style="text-align:center">
      <div style="font-weight:700;font-size:.85rem;margin-bottom:6px">โครง หัว-ท้าย ทะลุ</div>
      <svg viewBox="0 0 220 240" width="100%" style="max-height:240px">
        <line x1="50" y1="20" x2="50" y2="220" stroke="#222" stroke-width="2"/>
        <line x1="170" y1="20" x2="170" y2="220" stroke="#222" stroke-width="2"/>
        <line x1="50" y1="20" x2="65" y2="20" stroke="#222" stroke-width="2"/>
        <line x1="170" y1="20" x2="155" y2="20" stroke="#222" stroke-width="2"/>
        <line x1="50" y1="220" x2="65" y2="220" stroke="#222" stroke-width="2"/>
        <line x1="170" y1="220" x2="155" y2="220" stroke="#222" stroke-width="2"/>
        ${meshDots(110,120)}
      </svg>
    </div>`;
  }

  // dimple (หัวทะลุ-ท้ายบุ๋มเจาะรู)
  return `
  <div style="text-align:center">
    <div style="font-weight:700;font-size:.85rem;margin-bottom:6px">โครงหัวทะลุ-ท้ายบุ๋มเจาะรู</div>
    <svg viewBox="0 0 220 260" width="100%" style="max-height:240px">
      <line x1="50" y1="20" x2="50" y2="210" stroke="#222" stroke-width="2"/>
      <line x1="170" y1="20" x2="170" y2="210" stroke="#222" stroke-width="2"/>
      <line x1="50" y1="20" x2="65" y2="20" stroke="#222" stroke-width="2"/>
      <line x1="170" y1="20" x2="155" y2="20" stroke="#222" stroke-width="2"/>
      <path d="M50,210 Q110,236 170,210" fill="none" stroke="#222" stroke-width="2"/>
      <ellipse cx="110" cy="219" rx="17" ry="7" fill="none" stroke="#222" stroke-width="2"/>
      <text x="110" y="252" text-anchor="middle" font-size="14" font-weight="700" fill="#222">เจาะรู</text>
      ${meshDots(110,112)}
    </svg>
  </div>`;
}

// ── สร้าง HTML เอกสารใบสั่งงานผลิต (Work Order) — เอกสารปกติมีหัวกระดาษ/โลโก้บริษัท ──
function _renderWorkOrderHtml(d) {
  const co = _companyInfoCache || {};
  const now = new Date();
  const printDateStr = now.toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});

  const specRows = [
    ['แบบงาน', d.workType || '—'],
    ['ตะแกรงนอก', d.meshOut || '—'],
    ['ตะแกรงใน', d.meshIn || '—'],
    ['ฝาบน', d.matTop || '—'],
    ['ฝาล่าง', d.matBot || '—'],
  ].map(([label, val]) => `
    <tr><td style="padding:6px 10px;color:#666;border-bottom:1px solid #eee;width:35%">${label}</td>
        <td style="padding:6px 10px;font-weight:600;border-bottom:1px solid #eee">${val}</td></tr>`).join('');

  const checklistSteps = ['ตัดเหล็ก','ขึ้นรูป/เชื่อม','ส่งชุบ','ตรวจสอบ/QC','แพ็ค/พร้อมส่ง'];
  const checklistRows = checklistSteps.map(step => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;width:28px;text-align:center">
        <div style="width:16px;height:16px;border:1.5px solid #999;border-radius:3px;display:inline-block"></div>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee">${step}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;width:25%">ผู้ทำ: ____________________</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;width:20%">วันที่เสร็จ: __________</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
<title>ใบสั่งงานผลิต — ${d.noPO}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap">
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  body { margin:0; font-family:'Sarabun',sans-serif; color:#1a2232; font-size:13px; }
  table { width:100%; border-collapse:collapse; }
</style>
</head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;
    padding-bottom:14px;border-bottom:3px solid #2563eb;gap:12px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:56px;height:56px;border-radius:10px;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center">
        <img src="${_getLogoSrc()}" alt="PTS" style="width:100%;height:100%;object-fit:contain"
          onerror="this.parentNode.style.background='#2563eb';this.style.display='none';this.parentNode.innerHTML='<span style=color:#fff;font-weight:800;font-size:1.05rem>PT</span>'">
      </div>
      <div>
        <div style="font-weight:800;font-size:.95rem">${co.name||''}</div>
        <div style="font-size:.65rem;color:#888;letter-spacing:.5px">${co.nameEn||''}</div>
        <div style="font-size:.68rem;color:#555;margin-top:3px;line-height:1.6">
          ${co.address||''}${co.addressEn ? '<br>'+co.addressEn : ''}<br>โทร: ${co.phone||''} | อีเมล์: ${co.email||''}
        </div>
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:1.6rem;font-weight:800;color:#2563eb;line-height:1">ใบสั่งงานผลิต</div>
      <div style="font-size:.65rem;color:#888;letter-spacing:2.5px;margin-bottom:10px">JOB ORDER</div>
      <table style="font-size:.78rem;margin-left:auto">
        <tr><td style="color:#666;padding:2px 6px 2px 0">เลขที่ PO:</td>
            <td style="font-weight:700;color:#2563eb">${d.noPO||'—'}</td></tr>
        <tr><td style="color:#666;padding:2px 6px 2px 0">No.Quo:</td>
            <td>${d.noQuo||'—'}</td></tr>
        <tr><td style="color:#666;padding:2px 6px 2px 0">วันที่พิมพ์:</td>
            <td>${printDateStr}</td></tr>
      </table>
    </div>
  </div>

  <div style="padding:14px 0;border-bottom:1px solid #e8ecf2">
    <div style="font-size:.62rem;font-weight:700;color:#2563eb;letter-spacing:1.2px;margin-bottom:6px">รหัสลูกค้า / CUSTOMER CODE</div>
    <div style="font-size:.95rem;font-weight:700">${d.customer||'—'}</div>
  </div>

  <div style="padding:14px 0;border-bottom:1px solid #e8ecf2">
    <div style="border:2px solid #2563eb;border-radius:10px;padding:14px 20px;
      display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;background:#f5f8ff">
      <div>
        <div style="font-size:.65rem;color:#2563eb;font-weight:700;letter-spacing:1.5px;margin-bottom:4px">รายการ</div>
        <div style="font-weight:800;font-size:2rem;line-height:1.25">${typeof _platingFormatDimDesc === 'function' ? _platingFormatDimDesc(d.productList) : (d.productList||'—')}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:.65rem;color:#2563eb;font-weight:700;letter-spacing:1.5px;margin-bottom:4px">จำนวน</div>
        <div style="font-weight:800;font-size:2.4rem;line-height:1.2;color:#2563eb">${d.qty}<span style="font-size:1.1rem;font-weight:700;margin-left:6px">ลูก</span></div>
      </div>
    </div>
  </div>

  <!-- DRAWING — เต็มความกว้าง -->
  <div style="padding:14px 0;border-bottom:1px solid #e8ecf2">
    <div style="font-size:.62rem;font-weight:700;color:#2563eb;letter-spacing:1.2px;margin-bottom:6px">แบบงาน / DRAWING</div>
    <div style="display:flex;gap:8px;align-items:flex-start">
      <div style="flex:1;min-width:0">
        ${(() => {
          if (d.drawingImg) {
            return `<img src="${d.drawingImg}" onerror="this.style.display='none'" style="width:100%;height:320px;
              object-fit:contain;border:1px solid #ddd;border-radius:6px;background:#fafafa;display:block">`;
          }
          const diagramSvg = _workTypeDiagramSvg(d.workType);
          if (diagramSvg) {
            return `<div style="border:1px solid #ddd;border-radius:6px;background:#fafafa;padding:8px;height:320px;display:flex;align-items:center;justify-content:center">${diagramSvg}</div>`;
          }
          return `<div style="border:1.5px dashed #bbb;border-radius:8px;height:320px;
              display:flex;align-items:center;justify-content:center;color:#bbb;font-size:.8rem;text-align:center">
              (พื้นที่สำหรับวาด/แนบแบบงาน)</div>`;
        })()}
      </div>
      <div style="flex:1;min-width:0">
        ${d.poImg ? `
          <img src="${d.poImg}" style="width:100%;height:320px;
            object-fit:contain;border:1px solid #ddd;border-radius:6px;background:#fafafa;display:block">
        ` : `
          <div style="border:1.5px dashed #bbb;border-radius:8px;height:320px;
            display:flex;align-items:center;justify-content:center;color:#bbb;font-size:.8rem;text-align:center">
            (ไม่มีไฟล์ PO แนบ)</div>
        `}
      </div>
    </div>
  </div>

  <!-- SPEC (ซ้าย) + วันที่รับงาน/กำหนดส่ง (ขวา) -->
  <div style="padding:14px 0;border-bottom:1px solid #e8ecf2;display:flex;gap:20px;align-items:flex-end;flex-wrap:wrap">
    <div style="flex:1;min-width:200px">
      <div style="font-size:.62rem;font-weight:700;color:#2563eb;letter-spacing:1.2px;margin-bottom:6px">ข้อมูลงาน / สเปก</div>
      <table style="font-size:.85rem">${specRows}</table>
    </div>
    <div style="flex-shrink:0;display:flex;align-items:center;gap:12px;padding-bottom:4px">
      <div>
        <div style="font-size:.62rem;color:#666;margin-bottom:2px">วันที่รับงาน</div>
        <div style="font-size:.9rem;font-weight:600">${d.orderDate || '—'}</div>
      </div>
      <div style="font-size:1.2rem;color:#e8ecf2">→</div>
      <div style="border:3px solid #dc2626;border-radius:8px;padding:8px 18px;text-align:center;
        background:#dc2626;print-color-adjust:exact;-webkit-print-color-adjust:exact">
        <div style="font-size:.6rem;color:#fca5a5;font-weight:700;letter-spacing:1.5px;margin-bottom:3px;
          print-color-adjust:exact;-webkit-print-color-adjust:exact">▶ กำหนดส่ง</div>
        <div style="font-size:1.4rem;font-weight:900;color:#fff;letter-spacing:.5px;
          print-color-adjust:exact;-webkit-print-color-adjust:exact">${d.wantDate || '—'}</div>
      </div>
    </div>
  </div>

  <div style="padding:10px 0;border-bottom:1px solid #e8ecf2">
    <div style="font-size:.62rem;font-weight:700;color:#2563eb;letter-spacing:1.2px;margin-bottom:4px">หมายเหตุ</div>
    <div style="font-size:.85rem;min-height:24px;white-space:pre-wrap">${d.note || '—'}</div>
  </div>

  <div style="display:flex;gap:8px;padding-top:14px;flex-wrap:wrap">
    <div style="flex:1;text-align:center;min-width:120px">
      <div style="margin-top:22px;border-top:1px solid #bbb;padding-top:4px;font-size:.68rem;color:#555">ผู้สั่งงาน</div>
      <div style="font-size:.62rem;color:#aaa;margin-top:4px">วันที่ ......../......../........</div>
    </div>
    <div style="flex:1;text-align:center;min-width:120px">
      <div style="margin-top:22px;border-top:1px solid #bbb;padding-top:4px;font-size:.68rem;color:#555">ผู้ตรวจสอบ / QC</div>
      <div style="font-size:.62rem;color:#aaa;margin-top:4px">วันที่ ......../......../........</div>
    </div>
    <div style="flex:1;text-align:center;min-width:120px">
      <div style="margin-top:22px;border-top:1px solid #bbb;padding-top:4px;font-size:.68rem;color:#555">ผู้อนุมัติ</div>
      <div style="font-size:.62rem;color:#aaa;margin-top:4px">วันที่ ......../......../........</div>
    </div>
  </div>
</body></html>`;
}

// ── คัดลอกสเปกงานของ Order (สำหรับแจ้งฝ่ายผลิต/ลูกค้า) ──
async function _ordCopySpec(noPO) {
  const ord = _orderCache.find(row => String(row[ORDER_COLS.noPO]) === String(noPO));
  if (!ord) return;
  const g = (k) => String(ord[ORDER_COLS[k]] ?? '').trim();
  const noQuo = g('noQuo');

  // ถ้ายังไม่เคยโหลดข้อมูล DATA ให้โหลดก่อน (ต้องใช้เลขอ้างอิง/ตะแกรง/ช่องว่างจีบ)
  if (!_dtCache || !_dtCache.length) {
    Swal.fire({title:'⏳ กำลังโหลดข้อมูล DATA...', allowOutsideClick:false, background:'#0d1b2a', color:'#cce4ff', didOpen:()=>Swal.showLoading()});
    await dtRefresh(false);
    Swal.close();
  }
  const dtRow = (_dtCache || []).find(row => String(row[DT.noQuo] || '').trim() === noQuo);

  let status = g('process') || '—';
  if (status === 'เรียบร้อย') status = 'เรียบร้อยพร้อมส่ง';

  const refId   = dtRow ? (dtRow[DT.refId] || '—') : '—';
  const meshOut = g('meshOut') || (dtRow ? matLabel(dtRow[DT.meshOut]) : '');
  const meshIn  = g('meshIn')  || (dtRow ? matLabel(dtRow[DT.meshIn])  : '');
  const matTop  = g('matTop') || (dtRow ? matLabel(dtRow[DT.matTop]) : '');
  const matBot  = g('matBot') || (dtRow ? matLabel(dtRow[DT.matBot]) : '');
  const gapWeld = dtRow ? String(dtRow[DT.gapWeld] || '').trim() : '';

  const productList = g('productList') || '—';
  const productLine = /mm\.?\s*$/i.test(productList) ? productList : `${productList} mm.`;
  const qty = g('qty') || '—';
  const note = g('note') || '-';

  const lines = [
    `สถานะ: ${status}`,
    `เลขที่PO: ${noPO}`,
    `เลขอ้างอิง: ${refId}`,
    `แบบงาน: ${g('workType') || '—'}`,
    `รายการ: ${productLine}`,
    `จำนวน: ${qty} ลูก.`,
    `ฝาบน: ${matTop || '—'}`,
    `ฝาล่าง: ${matBot || '—'}`,
    `ตะแกรงนอก: ${meshOut || '—'}`,
    `ตะแกรงใน: ${meshIn || '—'}`,
    `ช่องว่างจีบเหลือ: ${gapWeld ? gapWeld + ' mm.' : '—'}`,
    `หมายเหตุ: ${note}`,
  ];
  const text = lines.join('\n');

  const toast = Swal.mixin({ toast:true, position:'top-end', showConfirmButton:false, timer:1500, timerProgressBar:true });
  const onDone = () => toast.fire({icon:'success', title:'คัดลอกสเปกแล้ว ✅'});
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onDone).catch(() => _copyFallback(text, onDone));
  } else {
    _copyFallback(text, onDone);
  }
}

// ── พิมพ์การ์ดรายละเอียด Order ──
function _ordPrintDetail(noPO) {
  const r = _orderCache.find(row => String(row[ORDER_COLS.noPO]) === String(noPO));
  if (!r) return;
  const g = (k) => String(r[ORDER_COLS[k]] ?? '').trim() || '—';
  const price = parseFloat(r[ORDER_COLS.price]) || 0;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`
    <html><head><title>Order ${g('noPO')}</title>
    <style>
      body{font-family:'Sarabun',Tahoma,sans-serif;padding:24px;color:#111}
      h2{margin:0 0 4px}
      .row{display:flex;gap:24px;margin-bottom:6px;flex-wrap:wrap}
      .lbl{font-size:.75rem;color:#666}
      .val{font-size:1rem;font-weight:700}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      td{padding:6px 8px;border:1px solid #ccc;font-size:.85rem;vertical-align:top}
      td.lbl2{background:#f3f4f6;font-weight:700;width:160px}
    </style></head><body>
    <h2>ใบสั่งงาน Order</h2>
    <div class="row">
      <div><div class="lbl">No.Quo</div><div class="val">${g('noQuo')}</div></div>
      <div><div class="lbl">No.PO</div><div class="val">${g('noPO')}</div></div>
      <div><div class="lbl">ลูกค้า</div><div class="val">${g('customer')}</div></div>
    </div>
    <table>
      <tr><td class="lbl2">วันที่สั่งซื้อ</td><td>${g('orderDate')}</td><td class="lbl2">วันที่ต้องการ</td><td>${g('wantDate')}</td></tr>
      <tr><td class="lbl2">แม่พิมพ์</td><td>${g('mold')}</td><td class="lbl2">แบบงาน</td><td>${g('workType')}</td></tr>
      <tr><td class="lbl2">รายการสินค้า</td><td>${g('productList')}</td><td class="lbl2">จำนวน</td><td>${g('qty')}</td></tr>
      <tr><td class="lbl2">วัตถุดิบ</td><td>${g('material')}</td><td class="lbl2">ราคาเสนอขาย</td><td>${price ? price.toLocaleString('th-TH',{minimumFractionDigits:2})+' บาท' : '—'}</td></tr>
      <tr><td class="lbl2">ฝาบน</td><td>${g('matTop') || '—'}</td><td class="lbl2">ฝาล่าง</td><td>${g('matBot') || '—'}</td></tr>
      <tr><td class="lbl2">ตะแกรงนอก</td><td>${g('meshOut') || '—'}</td><td class="lbl2">ตะแกรงใน</td><td>${g('meshIn') || '—'}</td></tr>
      <tr><td class="lbl2">Process</td><td>${g('process')}</td><td class="lbl2">สถานะส่งงาน</td><td>${g('statusDeliver')}</td></tr>
      <tr><td class="lbl2">หมายเหตุ</td><td colspan="3">${g('note')}</td></tr>
    </table>
    <script>(function(){
      function go(){ try{ window.focus(); window.print(); }catch(e){} }
      if(document.fonts && document.fonts.ready){
        document.fonts.ready.then(go).catch(function(){ setTimeout(go,700); });
      } else { setTimeout(go,700); }
    })();<\/script>
    </body></html>`);
  win.document.close();
}

// ── เมนู "เพิ่มเติม" ──
function _ordMoreMenu(noPO, noQuo) {
  Swal.fire({
    title: '⋯ เพิ่มเติม',
    html: `<div style="display:flex;flex-direction:column;gap:8px;text-align:left">
      <button onclick="deleteOrderRow('${noPO}','${noQuo}')"
        style="padding:9px 12px;border-radius:8px;border:1px solid rgba(248,113,113,.35);
        background:rgba(248,113,113,.1);color:#f87171;font-size:.82rem;font-weight:700;cursor:pointer;text-align:left">🗑️ ลบ Order นี้</button>
    </div>`,
    showConfirmButton:false, showCloseButton:true,
    background:'var(--bg-deep)', color:'var(--t1)'
  });
}

// เติม dropdown "ลูกค้า" ในป๊อปอัพแก้ไข Order จาก _custCache (ค่า = ผู้ติดต่อ/ชื่อลูกค้า ตามที่บันทึกในชีต Order)
function _ordEditFillCustomerSelect(currentVal) {
  const sel = $('ordEdit_customer');
  if (!sel) return;
  const opts = (_custCache || []).map(c => {
    const val = c.contact || c.name;
    const label = `${c.name}${c.branch ? ' (' + c.branch + ')' : ''}`;
    return { val, label };
  });
  currentVal = (currentVal || '').trim();
  if (currentVal && !opts.some(o => o.val === currentVal)) {
    opts.unshift({ val: currentVal, label: currentVal });
  }
  sel.innerHTML = opts.map(o =>
    `<option value="${String(o.val).replace(/"/g,'&quot;')}">${o.label}</option>`).join('');
  sel.value = currentVal;
}

function openEditOrder(noPO) {
  const r = _orderCache.find(row => String(row[ORDER_COLS.noPO]) === String(noPO));
  if (!r) return;
  _addSeen(SEEN_KEY_ORDER, noPO);
  renderOrderTable();
  _ordEditNoPO = noPO;
  $('ordEdit_noPO').textContent  = noPO;
  _ordEditFillCustomerSelect(r[ORDER_COLS.customer] || '');
  $('ordEdit_orderDate').value   = _ordDateToInput(r[ORDER_COLS.orderDate]);
  $('ordEdit_wantDate').value    = _ordDateToInput(r[ORDER_COLS.wantDate]);
  $('ordEdit_status').value      = r[ORDER_COLS.process] || '';
  $('ordEdit_qty').value         = r[ORDER_COLS.qty] || '';
  $('ordEdit_price').value       = r[ORDER_COLS.price] || '';
  $('ordEdit_productList').value = r[ORDER_COLS.productList] || '';
  $('ordEdit_material').value    = r[ORDER_COLS.material] || '';
  $('ordEdit_meshOut').value      = r[ORDER_COLS.meshOut] || '';
  $('ordEdit_meshIn').value       = r[ORDER_COLS.meshIn] || '';
  if ($('ordEdit_matTop')) $('ordEdit_matTop').value = r[ORDER_COLS.matTop] || '';
  if ($('ordEdit_matBot')) $('ordEdit_matBot').value = r[ORDER_COLS.matBot] || '';
  if ($('ordEdit_od')) $('ordEdit_od').value = r[ORDER_COLS.od]  || '';
  if ($('ordEdit_id')) $('ordEdit_id').value = r[ORDER_COLS.id_] || '';
  if ($('ordEdit_h'))  $('ordEdit_h').value  = r[ORDER_COLS.h_]  || '';
  $('ordEdit_note').value        = r[ORDER_COLS.note] || '';
  if ($('ordEdit_note2')) $('ordEdit_note2').value = r[ORDER_COLS.note2] || '';
  if ($('ordEdit_workStatus')) $('ordEdit_workStatus').value = r[ORDER_COLS.status] || 'ปรกติ';
  _ordClearPoFile('ordEdit');
  const poUrl = r[ORDER_COLS.poFile] || '';
  if ($('ordEdit_poLinkWrap')) {
    $('ordEdit_poLinkWrap').innerHTML = poUrl
      ? `<a href="${poUrl}" target="_blank" rel="noopener">📎 ดูไฟล์ PO เดิม</a>`
      : '';
  }
  _ordClearJobImg('ordEdit');
  const jobImg1Url = r[ORDER_COLS.jobImg1] || '';
  if ($('ordEdit_jobImg1LinkWrap')) {
    $('ordEdit_jobImg1LinkWrap').innerHTML = jobImg1Url
      ? `<a href="${jobImg1Url}" target="_blank" rel="noopener">📎 ดูรูป Drawing เดิม</a>`
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
  const editingNoPO = _ordEditNoPO;
  const r = _orderCache.find(row => String(row[ORDER_COLS.noPO]) === String(_ordEditNoPO));
  if (!r) return;
  const row = r.slice();
  while (row.length < ORDER_NUM_COLS) row.push('');
  row[ORDER_COLS.customer]    = $('ordEdit_customer').value;
  row[ORDER_COLS.orderDate]   = _ordDateToSheet($('ordEdit_orderDate').value);
  row[ORDER_COLS.wantDate]    = _ordDateToSheet($('ordEdit_wantDate').value);
  row[ORDER_COLS.process]     = $('ordEdit_status').value;
  row[ORDER_COLS.statusDeliver] = (row[ORDER_COLS.process] === 'เรียบร้อย'); // P sync
  row[ORDER_COLS.status]      = $('ordEdit_workStatus')?.value || row[ORDER_COLS.status] || 'ปรกติ';
  row[ORDER_COLS.qty]         = $('ordEdit_qty').value;
  row[ORDER_COLS.price]       = $('ordEdit_price').value;
  row[ORDER_COLS.productList] = $('ordEdit_productList').value;
  row[ORDER_COLS.material]    = $('ordEdit_material').value;
  row[ORDER_COLS.meshOut]     = $('ordEdit_meshOut').value;
  row[ORDER_COLS.meshIn]      = $('ordEdit_meshIn').value;
  row[ORDER_COLS.matTop]      = $('ordEdit_matTop')?.value ?? row[ORDER_COLS.matTop] ?? '';
  row[ORDER_COLS.matBot]      = $('ordEdit_matBot')?.value ?? row[ORDER_COLS.matBot] ?? '';
  row[ORDER_COLS.od]          = $('ordEdit_od')?.value  ?? row[ORDER_COLS.od]  ?? '';
  row[ORDER_COLS.id_]         = $('ordEdit_id')?.value  ?? row[ORDER_COLS.id_] ?? '';
  row[ORDER_COLS.h_]          = $('ordEdit_h')?.value   ?? row[ORDER_COLS.h_]  ?? '';
  row[ORDER_COLS.note]        = $('ordEdit_note').value;
  row[ORDER_COLS.note2]       = $('ordEdit_note2')?.value || '';
  row[ORDER_COLS.poFile]      = r[ORDER_COLS.poFile] || '';
  row[ORDER_COLS.poFilePath]  = r[ORDER_COLS.poFilePath] || '';
  row[ORDER_COLS.jobImg1]     = r[ORDER_COLS.jobImg1] || '';

  const saveBtn  = $('ordEdit_saveBtn');
  const statusEl = $('ordEdit_status_msg');
  if (saveBtn) saveBtn.disabled = true;

  Swal.fire({
    title: 'กำลังบันทึก...', html: 'กรุณารอสักครู่',
    background:'#0d1b2a', color:'#cce4ff',
    allowOutsideClick:false, allowEscapeKey:false, showConfirmButton:false,
    didOpen: () => Swal.showLoading(),
  });

  try {
    const poFile = _ordPoFileBlobs['ordEdit'] || $('ordEdit_poFile')?.files?.[0];
    if (poFile) {
      if (statusEl) statusEl.textContent = '⏳ กำลังอัปโหลดไฟล์ PO...';
      const up = await _ordUploadPoFile(poFile, _ordEditNoPO);
      row[ORDER_COLS.poFile]     = up.url;
      row[ORDER_COLS.poFilePath] = up.path;
    }

    const jobImg1 = $('ordEdit_jobImg1')?.files?.[0];
    if (jobImg1) {
      if (statusEl) statusEl.textContent = '⏳ กำลังอัปโหลดรูป Drawing...';
      const up = await _ordUploadPoFile(jobImg1, _ordEditNoPO);
      row[ORDER_COLS.jobImg1] = up.url;
    }

    await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'updateOrder', noPO: _ordEditNoPO, row }) });

    if (statusEl) statusEl.textContent = '';
    closeOrderEdit();
    await fetchOrders();
    Swal.fire({icon:'success',title:'บันทึกแล้ว ✅',background:'#0d1b2a',color:'#cce4ff',
      confirmButtonColor:'#6366f1', timer:1300, showConfirmButton:false});
    setTimeout(() => showOrderDetail(editingNoPO), 900);
  } catch (err) {
    Swal.fire({icon:'error',title:'เกิดข้อผิดพลาด',text:'บันทึกไม่สำเร็จ',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    if (statusEl) statusEl.textContent = '';
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

// ── Backfill ฝาบน/ฝาล่าง (matTop/matBot) ให้ Order เก่าทุกแถว (รันครั้งเดียว) ──
// ดึงค่าจาก DATA (DT.matTop/DT.matBot ตาม noQuo) มาเติมคอลัมน์ AG/AH ของ Order
// ที่ยังว่างอยู่ — ไม่ทับค่าที่มีอยู่แล้ว
async function _ordBackfillMatTopBot() {
  const confirmRes = await Swal.fire({
    icon: 'question',
    title: 'ดึงฝาบน/ฝาล่าง ย้อนหลัง?',
    html: 'ระบบจะดึงค่า "ฝาบน/ฝาล่าง" จากข้อมูล DATA (ตาม No.Quo) มาเติมใน Order ทุกแถวที่ยังไม่มีข้อมูล<br><span style="font-size:.78rem;color:#8b8aaa">แถวที่มีข้อมูลอยู่แล้วจะไม่ถูกทับ — ทำครั้งนี้ครั้งเดียวก็พอ</span>',
    showCancelButton: true,
    confirmButtonText: '✅ เริ่มดึงข้อมูล', cancelButtonText: 'ยกเลิก',
    background: '#0a1c2e', color: '#f1f5f9',
    confirmButtonColor: '#f59e0b', cancelButtonColor: '#475569'
  });
  if (!confirmRes.isConfirmed) return;

  Swal.fire({
    title: '⏳ กำลังโหลดข้อมูล...', allowOutsideClick: false,
    background: '#0d1b2a', color: '#cce4ff', didOpen: () => Swal.showLoading()
  });

  if (!_dtCache || !_dtCache.length) await dtRefresh(false);
  if (!_orderCache || !_orderCache.length) await fetchOrders();

  const targets = [];
  for (const r of _orderCache) {
    const curTop = String(r[ORDER_COLS.matTop] ?? '').trim();
    const curBot = String(r[ORDER_COLS.matBot] ?? '').trim();
    if (curTop && curBot) continue; // มีข้อมูลครบแล้ว ไม่ต้องแก้

    const noQuo = String(r[ORDER_COLS.noQuo] ?? '').trim();
    const noPO  = String(r[ORDER_COLS.noPO] ?? '').trim();
    if (!noPO || !noQuo) continue;

    const dt = (_dtCache || []).find(row => String(row[DT.noQuo] || '').trim() === noQuo);
    if (!dt) continue;

    const matTop = matLabel(dt[DT.matTop]) || '';
    const matBot = matLabel(dt[DT.matBot]) || '';
    if (!matTop && !matBot) continue;

    const row = r.slice();
    while (row.length < ORDER_NUM_COLS) row.push('');
    if (!curTop && matTop) row[ORDER_COLS.matTop] = matTop;
    if (!curBot && matBot) row[ORDER_COLS.matBot] = matBot;
    targets.push({ noPO, row });
  }

  if (!targets.length) {
    Swal.fire({icon:'info', title:'ไม่มีรายการที่ต้องอัปเดต', text:'ทุก Order มีข้อมูลฝาบน/ฝาล่างอยู่แล้ว หรือไม่พบข้อมูลใน DATA', background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1'});
    return;
  }

  let done = 0;
  for (const t of targets) {
    Swal.update({ title: `⏳ กำลังอัปเดต... (${done + 1}/${targets.length})`, html: `No.PO: ${t.noPO}` });
    try {
      await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'updateOrder', noPO: t.noPO, row: t.row }) });
    } catch (e) { /* ข้ามรายการที่ error */ }
    done++;
  }

  await fetchOrders();
  Swal.fire({icon:'success', title:'เสร็จแล้ว ✅', text:`อัปเดตฝาบน/ฝาล่าง ${done} รายการ`, background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#6366f1'});
}

// ══════════════════════════════════════════════════════
// ── แท็บ "ติดตามงาน" (Production Step Tracker Dashboard) ──
// ══════════════════════════════════════════════════════

// แปลงวันที่ (รองรับทั้ง dd/MM/yyyy พ.ศ. จาก Sheet และ yyyy-MM-dd) เป็น Date object (ค.ศ.)
function _ordDateToJS(s) {
  s = String(s||'').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    let y = parseInt(m[3]);
    if (y > 2400) y -= 543;
    return new Date(y, parseInt(m[2])-1, parseInt(m[1]));
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]));
  return null;
}

// ── วงกลมนับถอยหลัง Lead Time (วันนี้ → วันที่ต้องการ) ──
function _trkLeadTimeCircle(r) {
  const cur = _ordCurrentStepIdx(r);
  const wantD  = _ordDateToJS(r[ORDER_COLS.wantDate]);
  const orderD = _ordDateToJS(r[ORDER_COLS.orderDate]);
  const today  = new Date(); today.setHours(0,0,0,0);

  const R = 32, C = 2*Math.PI*R;

  if (cur === 5) {
    return `
      <div class="trk-circle" style="--ring:#22c55e">
        <svg viewBox="0 0 76 76"><circle class="trk-ring-bg" cx="38" cy="38" r="${R}"/>
          <circle class="trk-ring" cx="38" cy="38" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>
        <div class="trk-circle-txt"><div class="trk-circle-num" style="font-size:1.4rem">✅</div><div class="trk-circle-lbl">เสร็จสิ้น</div></div>
      </div>`;
  }
  if (!wantD) {
    return `
      <div class="trk-circle" style="--ring:#94a3b8">
        <svg viewBox="0 0 76 76"><circle class="trk-ring-bg" cx="38" cy="38" r="${R}"/></svg>
        <div class="trk-circle-txt"><div class="trk-circle-num">—</div><div class="trk-circle-lbl">ไม่มีกำหนด</div></div>
      </div>`;
  }
  const msPerDay = 86400000;
  const daysLeft = Math.round((wantD - today) / msPerDay);
  const totalDays = orderD ? Math.max(1, Math.round((wantD - orderD) / msPerDay)) : Math.max(1, Math.abs(daysLeft) || 1);
  let pct = Math.max(0, Math.min(1, daysLeft / totalDays));
  let ring = '#22c55e', numTxt = `${daysLeft}`, lbl = 'วันคงเหลือ', warnIcon = '', extraClass = '';
  if (daysLeft < 0) {
    // BackOrder: เลยกำหนดส่งแล้ว — เน้นสุด ไอคอนหัวกะโหลกกระพริบ
    ring = '#dc2626'; numTxt = `+${Math.abs(daysLeft)}`; lbl = 'BackOrder'; pct = 1;
    warnIcon = '<div class="trk-circle-warn trk-blink">💀</div>';
    extraClass = ' trk-circle-danger';
  } else if (daysLeft === 0) {
    // ถึงกำหนดส่งวันนี้ — เส้นแดง ไอคอนอันตรายกระพริบ
    ring = '#ef4444'; lbl = 'ถึงกำหนดวันนี้';
    warnIcon = '<div class="trk-circle-warn trk-blink">🚨</div>';
    extraClass = ' trk-circle-danger';
  } else if (daysLeft === 1) {
    // เหลือ 1 วัน — สีเหลือง ไอคอนเตือนกระพริบ
    ring = '#f59e0b';
    warnIcon = '<div class="trk-circle-warn trk-blink">⚠️</div>';
  } else if (daysLeft <= 2) {
    ring = '#f59e0b';
  }
  const offset = C * (1 - pct);
  return `
    <div class="trk-circle${extraClass}" style="--ring:${ring}">
      <svg viewBox="0 0 76 76"><circle class="trk-ring-bg" cx="38" cy="38" r="${R}"/>
        <circle class="trk-ring" cx="38" cy="38" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${offset}"/></svg>
      <div class="trk-circle-txt"><div class="trk-circle-num">${numTxt}</div><div class="trk-circle-lbl">${lbl}</div></div>
      ${warnIcon}
    </div>`;
}

// ── แถบขั้นตอนแนวนอน (5 ขั้นเดิม) ──
function _trkStepsHtml(r) {
  const cur = _ordCurrentStepIdx(r);
  // เช็คว่า PO นี้ออกใบแจ้งชุบไปแล้วหรือยัง (ใช้ตัดสินใจแสดงไอคอน 📨 บนขั้น "กำลังส่งชุป")
  const noPO = String(r[ORDER_COLS.noPO]||'').trim();
  const platingSent = (typeof _platingSentOrderSet === 'function' && noPO)
    ? _platingSentOrderSet().has(noPO) : false;
  return `<div class="trk-steps">${ORDER_FLOW_STEPS.map((s,i) => {
    const state = i < cur || cur === 5 ? 'done' : (i === cur ? 'active' : 'todo');
    const icon  = state === 'done' ? '✓' : s.icon;
    const isLast = i === ORDER_FLOW_STEPS.length - 1;
    const badge = (i === 2 && platingSent)
      ? `<span class="trk-step-badge" title="ออกใบแจ้งชุบแล้ว">📨</span>` : '';
    return `<div class="trk-step ${state}">
        <div class="trk-step-dot" title="${s.label}">${icon}${badge}</div>
        <div class="trk-step-lbl">${s.label}</div>
      </div>${!isLast ? `<div class="trk-step-line ${i < cur || cur===5 ? 'done':''}"></div>` : ''}`;
  }).join('')}</div>`;
}

// ── แสดง/ซ่อนรายละเอียดเพิ่มเติมในการ์ด ──
function _trkToggle(idx) {
  const el = $('trkDetail-' + idx);
  const btn = $('trkToggleBtn-' + idx);
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  if (btn) btn.textContent = open ? '🔽 แสดงรายละเอียด' : '🔼 ซ่อนรายละเอียด';
}

// ── คลิกรูปในการ์ด Track เพื่อดูภาพขยาย ──
function _trkZoomImg(url) {
  if (!url) return;
  Swal.fire({
    imageUrl: url, imageAlt: 'รูปงาน',
    showConfirmButton: false, showCloseButton: true,
    background: '#0d1b2a',
    width: 'auto',
    imageWidth: 'min(90vw, 600px)',
    imageHeight: 'auto',
  });
}

// ── การ์ดสรุปจำนวนงานแยกตามสถานะ (Process) ──
const TRK_STATUS_DEFS = [
  { key:'',                         icon:'❓', label:'ยังไม่ระบุสถานะ',     color:'#ef4444', group:'process' },
  { key:'รอConfirm',                icon:'⏳', label:'รอ Confirm',          color:'#94a3b8', group:'process' },
  { key:'กำลังผลิต',                 icon:'🔧', label:'กำลังผลิต',           color:'#f59e0b', group:'process' },
  { key:'ส่งชุป',                    icon:'✨', label:'ส่งชุป',              color:'#fbbf24', group:'process' },
  { key:'เตรียมส่ง',                 icon:'📦', label:'เตรียมส่ง',           color:'#2dd4bf', group:'process' },
  { key:'ส่งตัวอย่างเทส+รอสรุป',       icon:'🧪', label:'ส่งตัวอย่าง+รอสรุป',  color:'#38bdf8', group:'process' },
  { key:'ส่งยังไม่ครบ',               icon:'📤', label:'ส่งยังไม่ครบ',        color:'#fb923c', group:'process' },
  { key:'FG รอเรียก',                icon:'📦', label:'FG รอเรียก',          color:'#6366f1', group:'process' },
  { key:'Stock',                    icon:'🏬', label:'Stock',               color:'#9b8fff', group:'process' },
  { key:'เรียบร้อย',                  icon:'✅', label:'เรียบร้อย',           color:'#22c55e', group:'process' },
  { key:'__other__',                icon:'❔', label:'อื่นๆ (ค่าไม่ตรงสถานะ)', color:'#a855f7', group:'process' },
  { key:'BackOrder',                icon:'🔥', label:'BackOrder (เลยกำหนดส่ง)', color:'#ef4444', group:'other' },
];

// กลุ่มการ์ดสรุป — แยกการ์ดที่อิงจากสถานะ Process กับการ์ดที่ไม่เกี่ยวกับ Process (เช่น BackOrder ที่คำนวณจากวันที่ต้องการ)
const TRK_SUM_GROUPS = [
  { key:'process', label:'สถานะ Process งาน' },
  { key:'other',    label:'อื่นๆ (ไม่ใช่ Process งาน)' },
];

// สถานะ "ตัวจริง" ของออเดอร์ — ถ้าส่งของแล้ว (สถานะส่งงาน = ส่งแล้ว) หรือ Process = เรียบร้อย
// ให้ถือว่าเป็น "เรียบร้อย" เสมอ แม้คอลัมน์ Process จะยังเป็นค่าเก่า (เช่น ส่งชุป) — กันการ์ดสรุปนับซ้ำ/ผิด
// ถ้า Process ว่าง → '' (การ์ด "ยังไม่ระบุสถานะ")
// ถ้า Process มีค่า แต่ไม่ตรงกับ key ของการ์ดใดเลย (เช่น พิมพ์ผิด/เว้นวรรคแปลกๆ) → '__other__'
// (การ์ด "อื่นๆ") เพื่อให้ยอดรวมการ์ดตรงกับจำนวน Order ทั้งหมดเสมอ และคลิกดูได้ว่าคือแถวไหน
function _trkEffectiveStatus(r) {
  const p = String(r[ORDER_COLS.process]||'').trim();
  const delivered = String(r[ORDER_COLS.statusDeliver]||'').includes('ส่งแล้ว');
  if (delivered || p === 'เรียบร้อย') return 'เรียบร้อย';
  if (p === '') return '';
  // 'BackOrder' ไม่ใช่สถานะ Process จริงอีกต่อไป (เปลี่ยนเป็นการ์ด "เลยกำหนดส่ง" คำนวณจากวันที่)
  const known = TRK_STATUS_DEFS.some(s => s.key === p && p !== 'BackOrder');
  return known ? p : '__other__';
}

// ออเดอร์ "เลยกำหนดส่ง" (BackOrder) — วันที่ต้องการ (wantDate) ผ่านมาแล้ว และยังไม่เรียบร้อย/ส่งแล้ว
function _trkIsOverdue(r) {
  if (_trkEffectiveStatus(r) === 'เรียบร้อย') return false;
  const wantD = _ordDateToJS(r[ORDER_COLS.wantDate]);
  if (!wantD) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  return wantD < today;
}

// การ์ดสรุปที่ซ่อนในแท็บ "ติดตามงาน" (โหมด reduced) — แสดงครบเฉพาะแท็บ "แดชบอร์ด" (โหมด full)
const TRK_REDUCED_HIDE_KEYS = ['', 'รอConfirm', 'ส่งยังไม่ครบ', '__other__'];

function _trkRenderSummary() {
  const wrap = $('trkSummary');
  if (!wrap) return;
  const curFilter = $('trkFilter')?.value || '';
  const reduced = (typeof _trkViewMode !== 'undefined') && _trkViewMode === 'reduced';

  // หัวข้อการ์ด: แท็บ "แดชบอร์ด" (full) → "แดชบอร์ดสถานะงาน", แท็บ "ติดตามงาน" (reduced) → "ติดตามสถานะงาน"
  const titleEl = $('trkPageTitle');
  if (titleEl) titleEl.textContent = reduced ? 'ติดตามสถานะงาน' : 'แดชบอร์ดสถานะงาน';

  wrap.innerHTML = TRK_SUM_GROUPS.map(g => {
    let defs = TRK_STATUS_DEFS.filter(s => s.group === g.key);
    if (reduced) defs = defs.filter(s => !TRK_REDUCED_HIDE_KEYS.includes(s.key));
    if (!defs.length) return '';
    const cards = defs.map(s => {
      const isBackOrder = s.key === 'BackOrder';
      const count = isBackOrder
        ? _orderCache.filter(_trkIsOverdue).length
        : _orderCache.filter(r => _trkEffectiveStatus(r) === s.key).length;
      const filterVal = isBackOrder ? 'overdue' : ('proc:' + s.key);
      const active = curFilter === filterVal;
      const blink = (isBackOrder && count > 0) ? ' trk-blink' : '';
      return `
        <div class="trk-sum-card${active ? ' active' : ''}${blink}" style="--sc:${s.color}" onclick="_trkSetFilter('${filterVal.replace(/'/g,"\\'")}')">
          <div class="trk-sum-top">
            <span class="trk-sum-lbl">${s.label}</span>
            <span class="trk-sum-icon">${s.icon}</span>
          </div>
          <div class="trk-sum-num">${count}</div>
          <div class="trk-sum-sub">รายการ</div>
        </div>`;
    }).join('');
    return `
      <div class="trk-sum-group">
        <div class="trk-sum-group-title">${g.label}</div>
        <div class="trk-sum-grid">${cards}</div>
      </div>`;
  }).join('');
}

// ── สับแท็บย่อย "แดชบอร์ด" (การ์ดสรุป+รายการ) / "List tasks" (สรุปยอดงานตามสถานะ) ──
let _trkSubTab = localStorage.getItem('ptts_trk_subtab') || 'cards';

function _trkSetSubTab(tab) {
  _trkSubTab = tab;
  localStorage.setItem('ptts_trk_subtab', tab);
  renderTrackDashboard();
}

function _trkApplySubTabUI() {
  const cardsBtn = $('trkSubTabBtn-cards');
  const tasksBtn = $('trkSubTabBtn-tasks');
  const cardsView = $('trkCardsView');
  const tasksView = $('trkTaskListView');
  const isTasks = _trkSubTab === 'tasks';
  if (cardsBtn) cardsBtn.classList.toggle('active', !isTasks);
  if (tasksBtn) tasksBtn.classList.toggle('active', isTasks);
  if (cardsView) cardsView.style.display = isTasks ? 'none' : '';
  if (tasksView) tasksView.style.display = isTasks ? '' : 'none';
}

// สถานะที่จะแสดงในแต่ละคอลัมน์ของ "List tasks"
const TRK_TASKLIST_GROUPS = [
  { key:'กำลังผลิต',              label:'กำลังผลิต',              color:'#2563eb' },
  { key:'ส่งชุป',                 label:'ส่งชุปแล้ว',             color:'#f59e0b' },
  { key:'ส่งตัวอย่างเทส+รอสรุป', label:'ส่งตัวอย่างเทส+รอสรุป', color:'#38bdf8' },
  { key:'เตรียมส่ง',              label:'เตรียมส่ง',              color:'#0d9488' },
];

// รวมยอด "จำนวน" ของแต่ละ "รายการสินค้า" แยกตามสถานะ Process (กำลังผลิต / ส่งชุป)
// คลิกแถวใน List tasks → เปิดรายละเอียด Order (และ mark ว่าเห็นแล้ว ป้าย NEW หายทันที)
function _trkTaskRowClick(noPO) {
  if (typeof showOrderDetail === 'function') showOrderDetail(noPO);
  _trkRenderTaskList();
}

// ลำดับความสำคัญ "สถานะงาน" สำหรับเรียงใน List tasks (ต่ำ = ขึ้นก่อน)
function _trkWorkStatusOrder(r) {
  const s = String(r[ORDER_COLS.status] || '').trim();
  if (s === 'เร่งด่วน') return 0;
  if (s === 'สต๊อก')   return 2;
  return 1; // ปรกติ / อื่นๆ
}

// badge สถานะงาน — แสดงเฉพาะเมื่อไม่ใช่ "ปรกติ"
function _trkWorkStatusBadge(r) {
  const s = String(r[ORDER_COLS.status] || '').trim();
  if (s === 'เร่งด่วน') return '<span class="trk-ws-badge trk-ws-urgent">🔴 เร่งด่วน</span>';
  if (s === 'สต๊อก')   return '<span class="trk-ws-badge trk-ws-stock">📦 สต๊อก</span>';
  return '';
}

function _trkRenderTaskList() {
  const wrap = $('trkTaskList');
  if (!wrap) return;

  wrap.innerHTML = TRK_TASKLIST_GROUPS.map(grp => {
    // เรียงเร่งด่วนขึ้นก่อน → ปรกติ → สต๊อก
    const rows = _orderCache
      .filter(r => _trkEffectiveStatus(r) === grp.key)
      .sort((a, b) => _trkWorkStatusOrder(a) - _trkWorkStatusOrder(b));
    const itemsHtml = rows.length
      ? rows.map(r => {
          const name = String(r[ORDER_COLS.productList] || '').trim() || '(ไม่ระบุรายการ)';
          const qty = parseFloat(String(r[ORDER_COLS.qty] || '').replace(/,/g, '')) || 0;
          const workType = String(r[ORDER_COLS.workType] || '').trim() || '—';
          const customer = String(r[ORDER_COLS.customer] || '').trim() || '—';
          const noPO = r[ORDER_COLS.noPO];
          const isNewRow = _isNewItem(SEEN_KEY_ORDER, noPO);
          return `<div class="trk-task-row" onclick="_trkTaskRowClick('${String(noPO).replace(/'/g,"\\'")}')">
              <div class="trk-task-circle">${_trkLeadTimeCircle(r)}</div>
              <div class="trk-task-info">
                <div class="trk-task-main">${name} = ${qty.toLocaleString('th-TH')} <span class="trk-task-unit">ลูก</span>${_trkWorkStatusBadge(r)}${_newBadge(isNewRow)}${_wiBadge(r)}</div>
                <div class="trk-task-meta">แบบงาน: ${workType} · ลูกค้า: ${customer}</div>
              </div>
            </div>`;
        }).join('')
      : `<div class="trk-task-empty">ไม่มีงาน</div>`;
    return `
      <div class="trk-task-col" style="--col-clr:${grp.color}">
        <div class="trk-task-head" style="border-bottom-color:${grp.color}">
          <span class="trk-task-count-big" style="background:${grp.color}">${rows.length}</span>
          <span class="trk-task-head-label">${grp.label}</span>
        </div>
        <div class="trk-task-body">${itemsHtml}</div>
      </div>`;
  }).join('');
}

// คลิกการ์ดสรุป → ตั้งค่าตัวกรองตามสถานะ (คลิกซ้ำ = ยกเลิกตัวกรอง)
function _trkSetFilter(val) {
  const sel = $('trkFilter');
  if (!sel) return;
  sel.value = (sel.value === val) ? '' : val;
  _trkPage = 1;
  localStorage.setItem('ptts_trk_page', 1);
  renderTrackDashboard();
}

// ── โหมดเต็มจอ + รีเฟรชอัตโนมัติ (สำหรับเปิดจอแสดงผลค้างไว้) ──
// หมายเหตุ: ข้อมูลดึงจาก Google Sheet ผ่าน Apps Script ซึ่งมี quota จำนวนครั้งเรียกต่อวัน/ต่อผู้ใช้
// ถ้ารีเฟรชถี่เกินไปอาจโดน rate-limit หรือกระทบผู้ใช้คนอื่นที่ใช้ Sheet เดียวกัน
// กำหนดขั้นต่ำบังคับไว้ที่ 1 นาที (TRK_REFRESH_MIN_MIN) — ห้ามตั้งต่ำกว่านี้
// ค่าเริ่มต้นแนะนำ 10 นาที ซึ่งเพียงพอสำหรับจอแสดงผลสถานะงานที่เปลี่ยนแปลงไม่บ่อย
let _trkAutoRefreshTimer = null;
let _trkClockTimer = null;
const TRK_REFRESH_MIN_MIN   = 1;  // ขั้นต่ำที่บังคับใช้ (นาที) — ห้ามต่ำกว่านี้
const TRK_REFRESH_DEFAULT_MIN = 10; // ค่าเริ่มต้นแนะนำ (นาที)

// สลับโหมดเต็มจอของแดชบอร์ดติดตามงาน
// — ใช้ Fullscreen API (requestFullscreen) แทนการเปิดแท็บใหม่
// — สไตล์ trk-fullscreen-mode ซ่อน header/tab-bar ใน style.css อยู่แล้ว
function toggleTrackFullscreen() {
  // ถ้าอยู่ในโหมดเต็มจอแล้ว → ออก
  if (document.body.classList.contains('trk-fullscreen-mode')) {
    _trkCloseFullscreen();
    return;
  }
  // สลับไปแท็บติดตามงาน (ถ้ายังไม่อยู่ที่นั่น)
  if (_activeTab !== 'track') switchTab('track');
  // เปิดโหมด CSS (ซ่อน header/tabs)
  document.body.classList.add('trk-fullscreen-mode');
  // เรียก Fullscreen API — ต้องเรียกจาก user gesture (onclick) จึงทำงานได้ทุก browser
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  if (req) req.call(el).catch(() => {});
  // ฟัง fullscreenchange: ถ้าผู้ใช้กด Escape → ออกจากโหมดด้วย
  document.addEventListener('fullscreenchange', _trkOnFSChange);
  document.addEventListener('webkitfullscreenchange', _trkOnFSChange);
}

function _trkOnFSChange() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    document.body.classList.remove('trk-fullscreen-mode');
    const btn = $('trkFullBtn');
    if (btn) btn.textContent = '⛶ เปิดเต็มจอ';
    document.removeEventListener('fullscreenchange', _trkOnFSChange);
    document.removeEventListener('webkitfullscreenchange', _trkOnFSChange);
  }
}

// ออกจากโหมดเต็มจอ
function _trkCloseFullscreen() {
  document.body.classList.remove('trk-fullscreen-mode');
  const btn = $('trkFullBtn');
  if (btn) btn.textContent = '⛶ เปิดเต็มจอ';
  document.removeEventListener('fullscreenchange', _trkOnFSChange);
  document.removeEventListener('webkitfullscreenchange', _trkOnFSChange);
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
    if (exit) exit.call(document).catch(() => {});
  }
}

// โหมดเต็มจอ (เปิดผ่าน toggleTrackFullscreen ด้วย ?track=full) ใช้ key การตั้งค่าแยกจากหน้าปกติ
// เพื่อไม่ให้การปรับคอลัมน์/รีเฟรชในแท็บเต็มจอ ไปกระทบหน้าติดตามงานปกติ (และกลับกัน)
function _trkIsFullMode() {
  return new URLSearchParams(location.search).get('track') === 'full';
}
function _trkKey(base) {
  return _trkIsFullMode() ? base + '_full' : base;
}

// จำนวนคอลัมน์ของการ์ดติดตามงาน (1-4) — ปรับได้จากแถบตั้งค่า (แยกค่าระหว่างหน้าปกติ/เต็มจอ)
// ค่าเริ่มต้น: เดสก์ท็อป (≥1024px) = 3 คอลัมน์, มือถือ/แท็บเล็ต = 2 คอลัมน์
// หมายเหตุ: ผู้ใช้ที่เคยตั้งค่าไว้เป็น 2 จากค่าเริ่มต้นเดิม จะถูกย้ายเป็น 3 ครั้งเดียว (เดสก์ท็อปเท่านั้น)
function _trkGetCols() {
  const key = _trkKey('ptts_trk_cols');
  const migKey = key + '_mig3';
  let saved = parseInt(localStorage.getItem(key));
  if (window.innerWidth >= 1024 && !localStorage.getItem(migKey)) {
    localStorage.setItem(migKey, '1');
    if (!saved || saved === 2) {
      saved = 3;
      localStorage.setItem(key, '3');
    }
  }
  if (saved) return saved;
  return window.innerWidth >= 1024 ? 3 : 2;
}
function _trkSetCols(n) {
  n = Math.max(1, Math.min(4, parseInt(n) || 2));
  localStorage.setItem(_trkKey('ptts_trk_cols'), n);
  document.documentElement.style.setProperty('--trk-cols', n);
}
function _trkApplyColsUI() {
  const n = _trkGetCols();
  document.documentElement.style.setProperty('--trk-cols', n);
  const sel = $('trkColsSel');
  if (sel) sel.value = String(n);
}

// อัตรารีเฟรชอัตโนมัติ (นาที) — ปรับได้จากแถบตั้งค่า (แยกค่าระหว่างหน้าปกติ/เต็มจอ)
function _trkGetRefreshMin() {
  const v = parseInt(localStorage.getItem(_trkKey('ptts_trk_refresh_min'))) || TRK_REFRESH_DEFAULT_MIN;
  return Math.max(TRK_REFRESH_MIN_MIN, v); // บังคับขั้นต่ำเสมอ แม้ค่าเก่าใน localStorage จะต่ำกว่า
}
function _trkSetRefresh(min) {
  min = Math.max(TRK_REFRESH_MIN_MIN, parseInt(min) || TRK_REFRESH_DEFAULT_MIN);
  localStorage.setItem(_trkKey('ptts_trk_refresh_min'), min);
  if (_trkAutoRefreshTimer) _startTrkAutoRefresh(); // restart ด้วยค่าใหม่
}
function _trkApplyRefreshUI() {
  const sel = $('trkRefreshSel');
  if (sel) sel.value = String(_trkGetRefreshMin());
}

// เริ่ม/หยุด auto-refresh — เรียกจาก switchTab() ตอนเข้า/ออกแท็บติดตามงาน
function _startTrkAutoRefresh() {
  _stopTrkAutoRefresh();
  const ms = _trkGetRefreshMin() * 60 * 1000;
  _trkAutoRefreshTimer = setInterval(() => { fetchOrders(); _trkUpdateClock(); }, ms);
  _trkUpdateClock();
  _trkClockTimer = setInterval(_trkUpdateClock, 1000);
}
function _stopTrkAutoRefresh() {
  if (_trkAutoRefreshTimer) { clearInterval(_trkAutoRefreshTimer); _trkAutoRefreshTimer = null; }
  if (_trkClockTimer) { clearInterval(_trkClockTimer); _trkClockTimer = null; }
}
function _trkUpdateClock() {
  const el = $('trkFsClock');
  if (!el) return;
  const now = new Date();
  el.textContent = '🕐 อัปเดตล่าสุด ' + now.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
}

// รีเซ็ตกลับหน้า 1 (เมื่อเปลี่ยนคำค้นหา/ตัวกรอง) โดยไม่เลื่อนจอ
function _trkResetPage() {
  _trkPage = 1;
  localStorage.setItem('ptts_trk_page', 1);
  renderTrackDashboard();
}

// เปลี่ยนหน้า pagination
function _trkGoPage(p) {
  _trkPage = p;
  localStorage.setItem('ptts_trk_page', p);
  renderTrackDashboard();
  const wrap = $('trackBody');
  if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── เรนเดอร์แดชบอร์ดติดตามงาน ──
function renderTrackDashboard() {
  const wrap = $('trackBody');
  if (!wrap) return;
  _trkApplySubTabUI();
  _trkRenderTaskList();
  _trkRenderSummary();

  const search = ($('trkSearch')?.value || '').trim().toLowerCase();
  const filter = $('trkFilter')?.value || '';

  let rows = _orderCache.filter(r => {
    const cur = _ordCurrentStepIdx(r);
    if (filter === 'active' && cur === 5) return false;
    if (filter === 'done' && cur !== 5) return false;
    if (filter === 'overdue' && !_trkIsOverdue(r)) return false;
    if (filter.startsWith('proc:')) {
      const want = filter.slice(5);
      if (_trkEffectiveStatus(r) !== want) return false;
    }
    if (search) {
      const hay = [r[ORDER_COLS.noPO], r[ORDER_COLS.noQuo], r[ORDER_COLS.customer], r[ORDER_COLS.productList]]
        .map(x => String(x||'').toLowerCase()).join(' ');
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const pager = $('trkPager');

  if (!rows.length) {
    wrap.innerHTML = `<div style="padding:30px;text-align:center;color:var(--t3);font-size:.85rem">ไม่พบข้อมูล Order</div>`;
    if (pager) pager.innerHTML = '';
    return;
  }

  // ── Pagination: หน้าละ 10 รายการ ──
  const totalPages = Math.max(1, Math.ceil(rows.length / TRK_PAGE_SIZE));
  if (_trkPage > totalPages) _trkPage = totalPages;
  if (_trkPage < 1) _trkPage = 1;
  const startIdx = (_trkPage - 1) * TRK_PAGE_SIZE;
  const pageRows = rows.slice(startIdx, startIdx + TRK_PAGE_SIZE);

  if (pager) {
    if (totalPages <= 1) {
      pager.innerHTML = '';
    } else {
      let btns = '';
      for (let p = 1; p <= totalPages; p++) {
        btns += `<button class="trk-page-btn${p === _trkPage ? ' active' : ''}" onclick="_trkGoPage(${p})">${p}</button>`;
      }
      pager.innerHTML = `
        <button class="trk-page-btn" ${_trkPage<=1?'disabled':''} onclick="_trkGoPage(${_trkPage-1})">‹</button>
        ${btns}
        <button class="trk-page-btn" ${_trkPage>=totalPages?'disabled':''} onclick="_trkGoPage(${_trkPage+1})">›</button>
        <span class="trk-page-info">ทั้งหมด ${rows.length} รายการ</span>`;
    }
  }

  const cards = pageRows.map((r, idx) => {
    const g = (k) => {
      const v = r[ORDER_COLS[k]];
      const s = String(v ?? '').trim();
      if (/^(true|false)$/i.test(s)) return /^true$/i.test(s) ? 'ส่งแล้ว' : '—';
      return s || '—';
    };
    const noPO  = g('noPO');
    const noQuo = g('noQuo');
    const procColor = _ordProcessColor(r[ORDER_COLS.process]);
    const delColor  = _ordDeliverColor(r[ORDER_COLS.statusDeliver]);

    const poUrl = String(r[ORDER_COLS.poFile]||'').trim();
    const jobImg1 = String(r[ORDER_COLS.jobImg1]||'').trim();
    const img = jobImg1 || poUrl || '';
    const shipDate = String(r[ORDER_COLS.update]||'').trim() || '—';
    const note = g('note');
    const escPO = noPO.replace(/'/g,"\\'");

    return `
    <div class="track-card">
      <div class="trk-head">
        <div style="min-width:0">
          <div class="trk-po">PO ${noPO}</div>
          <div class="trk-quo">Quo ${noQuo} · ${g('customer')}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
          <span class="trk-badge" style="background:${procColor.bg};color:${procColor.fg};border-color:${procColor.bd}">${g('process')}</span>
          <span class="trk-badge" style="background:${delColor.bg};color:${delColor.fg};border-color:${delColor.bd}">📦 ${g('statusDeliver')}</span>
        </div>
      </div>

      <div class="trk-body">
        ${img
          ? `<img class="trk-img" src="${img}" loading="lazy" onerror="this.style.display='none'" onclick="_trkZoomImg('${img.replace(/'/g,"\\'")}')">`
          : `<div class="trk-img trk-img-empty">ไม่มีรูป</div>`}
        <div class="trk-info">
          <div class="trk-product">${g('productList')}</div>
          <div class="trk-meta">📐 ${g('workType')} &nbsp;·&nbsp; 🔢 จำนวน <span class="trk-qty">${g('qty')}</span></div>
          <div class="trk-meta">🧱 แม่พิมพ์ ${g('mold')}</div>
        </div>
        ${_trkLeadTimeCircle(r)}
      </div>

      ${_trkStepsHtml(r)}

      <div class="trk-dates">
        <div><span class="trk-date-lbl">📅 วันที่สั่งซื้อ</span><span>${g('orderDate')}</span></div>
        <div><span class="trk-date-lbl">⏰ วันที่ต้องการ</span><span>${g('wantDate')}</span></div>
        <div><span class="trk-date-lbl">🚚 วันที่ส่งงาน</span><span>${shipDate}</span></div>
      </div>

      <button id="trkToggleBtn-${idx}" class="trk-toggle-btn btn-fx" onclick="_trkToggle(${idx})">🔽 แสดงรายละเอียด</button>
      <div id="trkDetail-${idx}" style="display:none">
        <div class="trk-note"><div class="trk-date-lbl">📝 หมายเหตุ</div>${note}</div>
        <div class="trk-actions">
          <button class="btn-fx" onclick="showOrderDetail('${escPO}')" style="padding:7px 12px;border-radius:8px;border:1px solid var(--bc-card);background:var(--bc-div);color:var(--t1);font-size:.78rem;font-weight:700;cursor:pointer">📋 ดูรายละเอียดเต็ม</button>
          <button class="btn-fx" onclick="_ordQuickChangeProcess('${escPO}')" style="padding:7px 12px;border-radius:8px;border:none;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;font-size:.78rem;font-weight:700;cursor:pointer">🔄 เปลี่ยนสถานะ</button>
        </div>
      </div>
    </div>`;
  }).join('');

  wrap.innerHTML = cards || '<div style="padding:40px;text-align:center;color:var(--t3)">ไม่มีข้อมูลในช่วงนี้</div>';
}
