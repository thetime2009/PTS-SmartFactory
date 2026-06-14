// ══════════════════════════════════════════════════════
// ══ ใบส่งชุบ (PlatingNote) — ส่งงานไปร้านชุบ ══════════════
// ══════════════════════════════════════════════════════
// รายการแต่ละชิ้น: { source:'order'|'extra', noPO, description, qty, unit,
//                    top, bot, meshOut, meshIn, price, status }
//   (top/bot/meshOut/meshIn = boolean มี/ไม่มี, price = ราคา/หน่วย,
//    status = 'งานใหม่' | 'งานเก่า')

let _platingExtraItems = [];   // รายการเพิ่มเอง (ไม่ผูกกับ Order)
let _platingHistCache  = [];
let _platingPreviewData = null;
let _platingOrderMeta  = {};   // { [noPO]: { price, status } } — ราคา/สถานะ ต่อ Order ใน checklist
let _platingHideSent     = true; // ซ่อนรายการที่ "ส่งชุบแล้ว" (มาร์ค) ออกจาก checklist
let _platingHideNoNeed  = true; // ซ่อนรายการที่มาร์ค "ไม่ต้องชุบ" ออกจาก checklist
let _platingOrderPage  = 1;    // หน้าปัจจุบันของ checklist Order
const PLATING_PAGE_SIZE = 20;  // จำนวนรายการต่อหน้า
let _platingShareData  = null; // { platingNo, dateStr, supplier, items } — สำหรับสร้างการ์ดแชร์รูป (มือถือ)

// ── หาราคาล่าสุดที่เคยใช้สำหรับรายการนี้ จากประวัติใบส่งชุบ (_platingHistCache เรียงล่าสุดก่อน) ──
function _platingFindLastPrice(description) {
  const key = String(description||'').trim();
  if (!key) return 0;
  for (const p of (_platingHistCache || [])) {
    for (const it of (p.items || [])) {
      if (String(it.description||'').trim() === key && (parseFloat(it.price)||0) > 0) {
        return parseFloat(it.price) || 0;
      }
    }
  }
  return 0;
}

// ── ความจำราคา: signature = ชื่อรายการ + รูปแบบวัสดุ (มี/ไม่มี ฝาบน/ฝาล่าง/ตะแกรงนอก/ตะแกรงใน) ──
let _platingPriceMemList = []; // cache ความจำราคา [{ key, description, top, bot, meshOut, meshIn, price }]

function _platingSignature(description, p) {
  const desc = String(description||'').trim();
  if (!desc) return '';
  const pat = (p.top?'1':'0') + (p.bot?'1':'0') + (p.meshOut?'1':'0') + (p.meshIn?'1':'0');
  return desc + '|' + pat;
}

async function _platingFetchPriceMemory() {
  try {
    const res = await fetch(SCRIPT_URL + '?action=getPlatingPriceMemory', { mode:'cors' }).then(r => r.json());
    _platingPriceMemList = (res && res.status === 'ok' && Array.isArray(res.list)) ? res.list : [];
  } catch (e) { _platingPriceMemList = []; }
}

// หาราคาที่จำไว้สำหรับ signature นี้ (คืน 0 ถ้าไม่พบ)
function _platingFindMemoryPrice(description, p) {
  const key = _platingSignature(description, p);
  if (!key) return 0;
  const hit = (_platingPriceMemList || []).find(m => m.key === key);
  return hit ? (parseFloat(hit.price) || 0) : 0;
}

// บันทึก/อัปเดตความจำราคาจากรายการที่ออกใบส่งชุบ (เรียกหลังบันทึกใบส่งชุบสำเร็จ)
function _platingLearnPriceMemory(items) {
  let changed = false;
  (items || []).forEach(it => {
    const price = parseFloat(it.price) || 0;
    if (price <= 0) return;
    const key = _platingSignature(it.description, it);
    if (!key) return;
    const existing = (_platingPriceMemList || []).find(m => m.key === key);
    if (existing) {
      if ((parseFloat(existing.price)||0) !== price) { existing.price = price; changed = true; }
    } else {
      _platingPriceMemList.push({
        key, description: String(it.description||'').trim(),
        top: !!it.top, bot: !!it.bot, meshOut: !!it.meshOut, meshIn: !!it.meshIn,
        price,
      });
      changed = true;
    }
  });
  if (changed && SCRIPT_URL) {
    fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'savePlatingPriceMemory', list: _platingPriceMemList }) })
      .catch(()=>{});
  }
}

// ── เริ่มต้นแท็บใบส่งชุบ: โหลด suppliers + render checklist + ประวัติ ──
async function platingInit() {
  await fetchSuppliers();
  if (!_dtCache || !_dtCache.length) { try { await dtRefresh(false); } catch(e) {} }
  _platingRefreshSupplierSelect();
  // ค่าเริ่มต้น: วันที่ออกใบส่งชุบ = วันนี้ (ถ้ายังไม่ได้กรอก)
  if ($('platingDate') && !$('platingDate').value) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2,'0');
    $('platingDate').value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  _platingOrderMeta = {};
  await fetchPlatingNotes();       // โหลดประวัติก่อน เพื่อใช้หาราคาล่าสุดตอน render checklist
  await _platingFetchNoNeed();     // โหลดรายการ "ไม่ต้องชุบ" จาก server (sync ทุกเครื่อง)
  await _platingFetchPriceMemory(); // โหลดความจำราคา จาก server (sync ทุกเครื่อง)
  _platingRenderOrderList();
  _platingSuggestNextNo();
}

// เติม dropdown "ร้านชุบ" จาก _supplierCache
function _platingRefreshSupplierSelect() {
  const sel = $('platingSupplier');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— เลือกร้านชุบ —</option>' +
    (_supplierCache || []).map(s => `<option value="${s.code}">${s.name}</option>`).join('');
  // ค่าเริ่มต้น: ใช้ร้านชุบที่เลือกล่าสุด (ถ้ายังไม่ได้เลือกในรอบนี้)
  const lastUsed = localStorage.getItem('ptts_plating_supplier') || '';
  if (cur) sel.value = cur;
  else if (lastUsed && (_supplierCache || []).some(s => s.code === lastUsed)) sel.value = lastUsed;
}

// ── หา presence ของ ฝาบน/ฝาล่าง/ตะแกรงนอก/ตะแกรงใน จาก _dtCache ตาม noQuo ──
function _platingPresenceForOrder(noPO_row) {
  const noQuo = String(noPO_row[ORDER_COLS.noQuo] || '').replace(/^Q-/i, '').trim();
  const dt = (_dtCache || []).find(r => String(r[DT.noQuo] || '').replace(/^Q-/i, '').trim() === noQuo);

  // ใช้ข้อมูลจาก Order เป็นหลัก (matTop/matBot/meshOut/meshIn) — fallback ไป DATA เฉพาะ Order เก่าที่ยังไม่มีข้อมูลในคอลัมน์นี้
  const matTop     = String(noPO_row[ORDER_COLS.matTop]  || '').trim() || (dt ? String(dt[DT.matTop]||'').trim()  : '');
  const matBot     = String(noPO_row[ORDER_COLS.matBot]  || '').trim() || (dt ? String(dt[DT.matBot]||'').trim()  : '');
  const matMeshOut = String(noPO_row[ORDER_COLS.meshOut] || '').trim() || (dt ? String(dt[DT.meshOut]||'').trim() : '');
  const matMeshIn  = String(noPO_row[ORDER_COLS.meshIn]  || '').trim() || (dt ? String(dt[DT.meshIn]||'').trim()  : '');

  // เช็คว่า "มี" หรือ "ไม่มี" จากข้อความ MAT อย่างเดียว — ไม่ต้องอ่านราคาอีกต่อไป
  const has = (m) => !!m && m !== 'ไม่มี';

  return {
    top:     has(matTop),
    bot:     has(matBot),
    meshOut: has(matMeshOut),
    meshIn:  has(matMeshIn),
    matTop, matBot, matMeshOut, matMeshIn,
  };
}

// ── หา noPO ที่เคยออกใบส่งชุบไปแล้ว (จากประวัติ PlatingNote) เพื่อมาร์คใน checklist ──
function _platingSentOrderSet() {
  const set = new Set();
  (_platingHistCache || []).forEach(p => {
    String(p.orderNos || '').split(',').map(s => s.trim()).filter(Boolean).forEach(no => set.add(no));
  });
  return set;
}

// ── จัดการรายการที่มาร์คว่า "ไม่ต้องชุบ" (sync ขึ้น Sheet "PlatingNoNeed" ให้เห็นเหมือนกันทุกเครื่อง) ──
let _platingNoNeedList = []; // cache รายการ No.PO ที่มาร์คไว้ (โหลดจาก server)

async function _platingFetchNoNeed() {
  try {
    const res = await fetch(SCRIPT_URL + '?action=getPlatingNoNeed', { mode:'cors' }).then(r => r.json());
    _platingNoNeedList = (res && res.status === 'ok' && Array.isArray(res.list)) ? res.list : [];
  } catch (e) { _platingNoNeedList = []; }
}
function _platingNoNeedSet() {
  return new Set(_platingNoNeedList);
}
function _platingSaveNoNeedSet(set) {
  _platingNoNeedList = [...set];
  if (SCRIPT_URL) {
    fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'savePlatingNoNeed', list: _platingNoNeedList }) })
      .catch(()=>{});
  }
}
function _platingToggleNoNeed(noPO, checked) {
  const set = _platingNoNeedSet();
  if (checked) set.add(noPO); else set.delete(noPO);
  _platingSaveNoNeedSet(set);
  _platingRenderOrderList();
}
function _platingToggleHideNoNeed(checked) {
  _platingHideNoNeed = !!checked;
  _platingOrderPage = 1;
  _platingRenderOrderList();
}

// ── แสดง checklist Order ทั้งหมด (ทุกสถานะ) พร้อมมาร์ครายการที่เคยส่งชุบแล้ว + ฟิลเตอร์ + แบ่งหน้า ──
function _platingRenderOrderList() {
  const wrap = $('platingOrderListWrap');
  if (!wrap) return;
  const all = (_orderCache || []);

  if (!all.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:16px;color:var(--t3);font-size:.82rem">ไม่พบ Order</div>`;
    return;
  }

  const sentSet = _platingSentOrderSet();
  const noNeedSet = _platingNoNeedSet();
  let list = all;
  if (_platingHideSent) list = list.filter(r => !sentSet.has(String(r[ORDER_COLS.noPO]||'').trim()));
  if (_platingHideNoNeed) list = list.filter(r => !noNeedSet.has(String(r[ORDER_COLS.noPO]||'').trim()));

  const totalPages = Math.max(1, Math.ceil(list.length / PLATING_PAGE_SIZE));
  if (_platingOrderPage > totalPages) _platingOrderPage = totalPages;
  if (_platingOrderPage < 1) _platingOrderPage = 1;
  const start = (_platingOrderPage - 1) * PLATING_PAGE_SIZE;
  const pageList = list.slice(start, start + PLATING_PAGE_SIZE);

  const hiddenCount = all.length - list.length;
  const filterBar = `
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:8px;font-size:.8rem">
      <div style="display:flex;flex-wrap:wrap;gap:14px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;color:var(--t2)">
          <input type="checkbox" ${_platingHideSent?'checked':''} onchange="_platingToggleHideSent(this.checked)" style="width:16px;height:16px;cursor:pointer">
          รายการแจ้งชุบแล้ว
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;color:var(--t2)">
          <input type="checkbox" ${_platingHideNoNeed?'checked':''} onchange="_platingToggleHideNoNeed(this.checked)" style="width:16px;height:16px;cursor:pointer">
          ซ่อนรายการไม่ต้องชุบ
        </label>
      </div>
      <span style="color:var(--t3)">พบ ${list.length} รายการ${hiddenCount ? ` (ซ่อน ${hiddenCount} รายการ)` : ''}</span>
    </div>`;

  if (!list.length) {
    wrap.innerHTML = filterBar + `<div style="text-align:center;padding:16px;color:var(--t3);font-size:.82rem">ไม่พบ Order ที่ตรงกับเงื่อนไข</div>`;
    wrap._platingList = list;
    return;
  }

  const rows = pageList.map((r, i) => {
    const idx = start + i;
    const p = _platingPresenceForOrder(r);
    const noPO = String(r[ORDER_COLS.noPO]||'').trim();
    const product = String(r[ORDER_COLS.productList]||'').trim() || '-';
    const qty = String(r[ORDER_COLS.qty]||'').trim() || '-';
    const sent = sentSet.has(noPO);
    const noNeed = noNeedSet.has(noPO);
    const noMatAtAll = !p.top && !p.bot && !p.meshOut && !p.meshIn;
    // qtyCell: ถ้าไม่มีวัสดุนี้ ('matKey' ใน p เป็น false) แสดง ❌ / ถ้ามีให้เป็นช่องกรอกจำนวนแก้ไขได้
    const qtyCell = (hasMat, metaKey) => hasMat
      ? `<input type="number" step="1" min="0" value="${meta[metaKey] || ''}" placeholder="0"
          oninput="_platingSetOrderMeta('${noPO}','${metaKey}',this.value)"
          style="width:64px;padding:6px;border-radius:6px;border:1px solid var(--bc-input);background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.8rem;text-align:center">`
      : `<span style="color:#ef4444;font-weight:700">❌</span>`;
    const workType = String(r[ORDER_COLS.workType]||'').trim() || '-';

    // เตรียมค่า price/status เริ่มต้น (เรียกใช้ความจำราคา > ราคาล่าสุดจากประวัติ ถ้ามี)
    if (!_platingOrderMeta[noPO]) {
      const memPrice = _platingFindMemoryPrice(product, p);
      const lastPrice = memPrice || _platingFindLastPrice(product);
      const qtyNum = parseFloat(qty) || 0;
      _platingOrderMeta[noPO] = {
        price: lastPrice, status: lastPrice > 0 ? 'งานเก่า' : 'งานใหม่',
        priceFromMemory: !!memPrice,
        topQty:     p.top     ? qtyNum : 0,
        botQty:     p.bot     ? qtyNum : 0,
        meshOutQty: p.meshOut ? qtyNum : 0,
        meshInQty:  p.meshIn  ? qtyNum : 0,
      };
    }
    const meta = _platingOrderMeta[noPO];

    return `<tr style="border-bottom:1px solid var(--bc-card)">
      <td style="padding:6px 8px;text-align:center">
        <input type="checkbox" class="plating-chk" data-idx="${idx}" style="width:16px;height:16px;cursor:pointer">
      </td>
      <td style="padding:6px 8px">
        <a href="javascript:void(0)" onclick="_platingGoToOrder('${noPO.replace(/'/g,"\\'")}')"
          style="color:#60a5fa;text-decoration:underline;cursor:pointer">${noPO}</a>
      </td>
      <td style="padding:6px 8px">${product}</td>
      <td style="padding:6px 8px;text-align:center">${qty}</td>
      <td style="padding:6px 8px;text-align:center;font-size:.74rem;white-space:nowrap">${workType}</td>
      <td style="padding:6px 8px;text-align:center">${qtyCell(p.top, 'topQty')}</td>
      <td style="padding:6px 8px;text-align:center">${qtyCell(p.bot, 'botQty')}</td>
      <td style="padding:6px 8px;text-align:center">${qtyCell(p.meshOut, 'meshOutQty')}</td>
      <td style="padding:6px 8px;text-align:center">${qtyCell(p.meshIn, 'meshInQty')}</td>
      <td style="padding:6px 8px;text-align:center">
        <div style="position:relative;display:inline-block">
          <input type="number" step="0.01" min="0" value="${meta.price || ''}" placeholder="0.00"
            oninput="_platingSetOrderMeta('${noPO}','price',this.value)"
            style="width:80px;padding:6px;border-radius:6px;border:1px solid var(--bc-input);background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.8rem;text-align:center">
          ${meta.priceFromMemory ? `<span title="ระบบใส่ราคาให้อัตโนมัติจากความจำ" style="position:absolute;top:-7px;right:-7px;font-size:.78rem;line-height:1">🧠</span>` : ''}
        </div>
      </td>
      <td style="padding:6px 8px;text-align:center">
        <select onchange="_platingSetOrderMeta('${noPO}','status',this.value)"
          style="padding:6px 4px;border-radius:6px;border:1px solid var(--bc-input);background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.78rem">
          <option value="งานใหม่" ${meta.status==='งานใหม่'?'selected':''}>งานใหม่</option>
          <option value="งานเก่า" ${meta.status==='งานเก่า'?'selected':''}>งานเก่า</option>
        </select>
      </td>
      <td style="padding:6px 8px;text-align:center">
        ${sent ? `<span style="color:#fbbf24;font-weight:700;font-size:.74rem">📌 ส่งชุบแล้ว</span>`
          : `<label style="display:flex;align-items:center;gap:4px;justify-content:center;cursor:pointer;color:#ef4444;font-size:.74rem;font-weight:600;white-space:nowrap">
              <input type="checkbox" ${noNeed?'checked':''} onchange="_platingToggleNoNeed('${noPO}',this.checked)" style="width:14px;height:14px;cursor:pointer">
              🚫 ไม่ต้องชุบ
            </label>`}
      </td>
    </tr>`;
  }).join('');

  // ── แถบเปลี่ยนหน้า ──
  const pager = `
    <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:10px;font-size:.8rem;color:var(--t2)">
      <button onclick="_platingGotoPage(${_platingOrderPage - 1})" ${_platingOrderPage<=1?'disabled':''}
        style="padding:5px 12px;border-radius:6px;border:1px solid var(--bc-input);background:var(--bg-input);color:var(--t1);cursor:${_platingOrderPage<=1?'default':'pointer'};opacity:${_platingOrderPage<=1?'.4':'1'};font-family:Sarabun,sans-serif">‹ ก่อนหน้า</button>
      <span>หน้า ${_platingOrderPage} / ${totalPages}</span>
      <button onclick="_platingGotoPage(${_platingOrderPage + 1})" ${_platingOrderPage>=totalPages?'disabled':''}
        style="padding:5px 12px;border-radius:6px;border:1px solid var(--bc-input);background:var(--bg-input);color:var(--t1);cursor:${_platingOrderPage>=totalPages?'default':'pointer'};opacity:${_platingOrderPage>=totalPages?'.4':'1'};font-family:Sarabun,sans-serif">ถัดไป ›</button>
    </div>`;

  wrap.innerHTML = filterBar + `
    <table style="width:100%;border-collapse:collapse;font-size:.8rem">
      <thead>
        <tr style="border-bottom:1px solid var(--bc-card)">
          <th style="padding:6px 8px;text-align:center;width:34px">
            <input type="checkbox" id="platingChkAll" onchange="_platingToggleAll(this.checked)" style="width:16px;height:16px;cursor:pointer">
          </th>
          <th style="padding:6px 8px;text-align:left">เลขที่ PO</th>
          <th style="padding:6px 8px;text-align:left">รายการ</th>
          <th style="padding:6px 8px;text-align:center">จำนวน</th>
          <th style="padding:6px 8px;text-align:center">รูปแบบงาน</th>
          <th style="padding:6px 8px;text-align:center">ฝาบน</th>
          <th style="padding:6px 8px;text-align:center">ฝาล่าง</th>
          <th style="padding:6px 8px;text-align:center">ตะแกรงนอก</th>
          <th style="padding:6px 8px;text-align:center">ตะแกรงใน</th>
          <th style="padding:6px 8px;text-align:center">ราคา/หน่วย</th>
          <th style="padding:6px 8px;text-align:center">งานเก่า/ใหม่</th>
          <th style="padding:6px 8px;text-align:center">มาร์ค</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>` + pager;
  wrap._platingList = list;
}

// ── คลิกเลขที่ PO เพื่อไปดูรายละเอียด Order นี้ในแท็บ Order ──
function _platingGoToOrder(noPO) {
  switchTab('order');
  setTimeout(() => { try { showOrderDetail(noPO); } catch(e) {} }, 150);
}

// สลับการซ่อนรายการที่ "ส่งชุบแล้ว"
function _platingToggleHideSent(checked) {
  _platingHideSent = !!checked;
  _platingOrderPage = 1;
  _platingRenderOrderList();
}

// เปลี่ยนหน้า checklist Order
function _platingGotoPage(page) {
  _platingOrderPage = page;
  _platingRenderOrderList();
}

function _platingToggleAll(checked) {
  document.querySelectorAll('#platingOrderListWrap .plating-chk').forEach(c => c.checked = checked);
}

// ตั้งค่า ราคา/สถานะ ของ Order แต่ละแถวใน checklist
function _platingSetOrderMeta(noPO, field, value) {
  if (!_platingOrderMeta[noPO]) _platingOrderMeta[noPO] = { price: 0, status: 'งานใหม่' };
  if (['price','topQty','botQty','meshOutQty','meshInQty'].includes(field)) value = parseFloat(value) || 0;
  _platingOrderMeta[noPO][field] = value;
  if (field === 'price') _platingOrderMeta[noPO].priceFromMemory = false; // ผู้ใช้แก้ราคาเอง ไม่ใช่จากความจำแล้ว
}

// ── จัดการรายการเพิ่มเอง (ไม่ผูกกับ Order) ──
function _platingAddExtraItem() {
  _platingExtraItems.push({ description:'', qty:1, unit:'Set', top:false, bot:false, meshOut:false, meshIn:false, price:0, status:'งานใหม่' });
  _platingRenderExtraItems();
}
function _platingRemoveExtraItem(idx) {
  _platingExtraItems.splice(idx, 1);
  _platingRenderExtraItems();
}
function _platingUpdateExtraItem(idx, field, value) {
  if (!_platingExtraItems[idx]) return;
  if (field === 'qty' || field === 'price') value = parseFloat(value) || 0;
  if (['top','bot','meshOut','meshIn'].includes(field)) value = !!value;
  _platingExtraItems[idx][field] = value;
}
// ดึงราคาล่าสุดจากประวัติมาใส่ตามชื่อรายการที่กรอก
function _platingLookupExtraPrice(idx) {
  const it = _platingExtraItems[idx];
  if (!it) return;
  const price = _platingFindLastPrice(it.description);
  if (price > 0) {
    it.price = price;
    it.status = 'งานเก่า';
    _platingRenderExtraItems();
  } else {
    Swal.fire({icon:'info', title:'ไม่พบราคาประวัติของรายการนี้', background:'#0d1b2a', color:'#cce4ff',
      timer:1500, showConfirmButton:false, toast:true, position:'top-end'});
  }
}
function _platingRenderExtraItems() {
  const wrap = $('platingExtraItemsWrap');
  if (!wrap) return;
  if (!_platingExtraItems.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:10px;color:var(--t3);font-size:.8rem">ไม่มีรายการเพิ่มเอง</div>`;
    return;
  }
  const chkBox = (idx, key, val) =>
    `<input type="checkbox" ${val?'checked':''} onchange="_platingUpdateExtraItem(${idx},'${key}',this.checked)" style="width:16px;height:16px;cursor:pointer">`;
  const rows = _platingExtraItems.map((it, idx) => `
    <tr style="border-bottom:1px solid var(--bc-card)">
      <td style="padding:6px 8px">
        <input type="text" value="${it.description||''}" placeholder="ชื่อรายการ"
          oninput="_platingUpdateExtraItem(${idx},'description',this.value)"
          style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--bc-input);background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.8rem">
      </td>
      <td style="padding:6px 8px;text-align:center">
        <input type="number" value="${it.qty||0}" min="0"
          oninput="_platingUpdateExtraItem(${idx},'qty',this.value)"
          style="width:64px;padding:6px;border-radius:6px;border:1px solid var(--bc-input);background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.8rem;text-align:center">
      </td>
      <td style="padding:6px 8px;text-align:center">${chkBox(idx,'top',it.top)}</td>
      <td style="padding:6px 8px;text-align:center">${chkBox(idx,'bot',it.bot)}</td>
      <td style="padding:6px 8px;text-align:center">${chkBox(idx,'meshOut',it.meshOut)}</td>
      <td style="padding:6px 8px;text-align:center">${chkBox(idx,'meshIn',it.meshIn)}</td>
      <td style="padding:6px 8px;text-align:center">
        <div style="display:flex;gap:4px;align-items:center;justify-content:center">
          <input type="number" step="0.01" value="${it.price || ''}" min="0" placeholder="0.00"
            oninput="_platingUpdateExtraItem(${idx},'price',this.value)"
            style="width:70px;padding:6px;border-radius:6px;border:1px solid var(--bc-input);background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.8rem;text-align:center">
          <button type="button" onclick="_platingLookupExtraPrice(${idx})" title="ดึงราคาล่าสุดจากประวัติ"
            style="padding:5px 7px;border-radius:6px;border:1px solid rgba(99,102,241,.4);background:rgba(99,102,241,.1);
            color:#818cf8;font-size:.74rem;cursor:pointer">🔍</button>
        </div>
      </td>
      <td style="padding:6px 8px;text-align:center">
        <select onchange="_platingUpdateExtraItem(${idx},'status',this.value)"
          style="padding:6px 4px;border-radius:6px;border:1px solid var(--bc-input);background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.78rem">
          <option value="งานใหม่" ${it.status==='งานใหม่'?'selected':''}>งานใหม่</option>
          <option value="งานเก่า" ${it.status==='งานเก่า'?'selected':''}>งานเก่า</option>
        </select>
      </td>
      <td style="padding:6px 8px;text-align:center">
        <button onclick="_platingRemoveExtraItem(${idx})" style="padding:5px 10px;border-radius:6px;border:none;
          background:#dc2626;color:#fff;font-size:.74rem;cursor:pointer;font-family:Sarabun,sans-serif">🗑️</button>
      </td>
    </tr>`).join('');
  wrap.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:.8rem">
      <thead>
        <tr style="border-bottom:1px solid var(--bc-card)">
          <th style="padding:6px 8px;text-align:left">รายการ</th>
          <th style="padding:6px 8px;text-align:center">จำนวน</th>
          <th style="padding:6px 8px;text-align:center">ฝาบน</th>
          <th style="padding:6px 8px;text-align:center">ฝาล่าง</th>
          <th style="padding:6px 8px;text-align:center">ตะแกรงนอก</th>
          <th style="padding:6px 8px;text-align:center">ตะแกรงใน</th>
          <th style="padding:6px 8px;text-align:center">ราคา/หน่วย</th>
          <th style="padding:6px 8px;text-align:center">สถานะ</th>
          <th style="padding:6px 8px;text-align:center"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── เสนอเลขที่ใบส่งชุบถัดไปจาก PlatingNote sheet (ถ้าช่องยังว่าง) — แก้ไขเองได้เสมอ ──
async function _platingSuggestNextNo() {
  if (!SCRIPT_URL || !$('platingNo') || $('platingNo').value.trim()) return;
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getNextPlatingNo', {mode:'cors'});
    const data = await res.json();
    if (data.status === 'ok' && data.platingNo && !$('platingNo').value.trim()) {
      $('platingNo').value = data.platingNo;
    }
  } catch (e) { /* เงียบไว้ — ผู้ใช้กรอกเองได้ */ }
}

// ── สร้าง HTML เอกสารใบส่งชุบ ──
function _platingBuildDocHtml({ platingNo, dateStr, supplier, items }) {
  const co = _companyInfoCache || {};
  const qtyCell = (has, qtyVal, fallbackQty) => {
    if (!has) return `<span style="color:#ef4444;font-weight:700">❌</span>`;
    const v = (qtyVal !== undefined && qtyVal !== null && qtyVal !== '') ? qtyVal : fallbackQty;
    return (v !== undefined && v !== null && v !== '') ? v : '-';
  };
  let grandTotal = 0;
  const matCell = (has, mat) => has
    ? `<span style="font-size:.78rem;color:#444;white-space:nowrap">${mat || '-'}</span>`
    : `<span style="color:#ef4444;font-weight:700">❌</span>`;
  const rows = items.map((it, idx) => {
    const price  = parseFloat(it.price) || 0;
    const qtyNum = parseFloat(it.qty) || 0;
    const amount = price * qtyNum;
    grandTotal += amount;
    const hasMatRow = it.matTop || it.matBot || it.matMeshOut || it.matMeshIn ||
      it.top || it.bot || it.meshOut || it.meshIn;
    const matRow = hasMatRow ? `
    <tr style="border-bottom:1px solid #e8ecf2">
      <td style="padding:0 10px 7px"></td>
      <td style="padding:0 10px 7px;text-align:right;font-size:.78rem;color:#777;font-style:italic">ชื่อวัตถุดิบ:</td>
      <td style="padding:0 10px 7px"></td>
      <td style="padding:0 10px 7px;text-align:center">${matCell(it.top, it.matTop)}</td>
      <td style="padding:0 10px 7px;text-align:center">${matCell(it.bot, it.matBot)}</td>
      <td style="padding:0 10px 7px;text-align:center">${matCell(it.meshOut, it.matMeshOut)}</td>
      <td style="padding:0 10px 7px;text-align:center">${matCell(it.meshIn, it.matMeshIn)}</td>
      <td style="padding:0 10px 7px"></td>
      <td style="padding:0 10px 7px"></td>
      <td style="padding:0 10px 7px"></td>
    </tr>` : '';
    return `
    <tr${hasMatRow ? '' : ' style="border-bottom:1px solid #e8ecf2"'}>
      <td style="padding:7px 10px;text-align:center;white-space:nowrap">${idx + 1}</td>
      <td style="padding:7px 10px">${it.noPO ? `[${it.noPO}] ` : ''}${it.description||''}</td>
      <td style="padding:7px 10px;text-align:center;white-space:nowrap">${it.qty||''} ${it.unit||''}</td>
      <td style="padding:7px 10px;text-align:center;white-space:nowrap">${qtyCell(it.top, it.topQty, it.qty)}</td>
      <td style="padding:7px 10px;text-align:center;white-space:nowrap">${qtyCell(it.bot, it.botQty, it.qty)}</td>
      <td style="padding:7px 10px;text-align:center;white-space:nowrap">${qtyCell(it.meshOut, it.meshOutQty, it.qty)}</td>
      <td style="padding:7px 10px;text-align:center;white-space:nowrap">${qtyCell(it.meshIn, it.meshInQty, it.qty)}</td>
      <td style="padding:7px 10px;text-align:right;white-space:nowrap">${price ? fmtB(price) : '-'}</td>
      <td style="padding:7px 10px;text-align:right;white-space:nowrap">${amount ? fmtB(amount) : '-'}</td>
      <td style="padding:7px 10px;text-align:center;font-size:.72rem;color:#555;white-space:nowrap">${it.status||'-'}</td>
    </tr>${matRow}`;
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
        <div style="font-weight:800;font-size:.95rem;color:#1a2232">${co.name||''}</div>
        <div style="font-size:.65rem;color:#888;letter-spacing:.5px">${co.nameEn||''}</div>
        <div style="font-size:.68rem;color:#555;margin-top:3px;line-height:1.6">
          ${co.address||''}<br>โทร: ${co.phone||''} | อีเมล์: ${co.email||''}<br>TAX ID: ${co.taxId||''}
        </div>
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:1.6rem;font-weight:800;color:#2563eb;line-height:1">ใบส่งชุบ</div>
      <div style="font-size:.65rem;color:#888;letter-spacing:2.5px;margin-bottom:10px">PLATING DELIVERY NOTE</div>
      <table style="font-size:.78rem;margin-left:auto">
        <tr><td style="color:#666;padding:2px 6px 2px 0">เลขที่ / No:</td>
            <td style="font-weight:700;color:#2563eb">${platingNo||''}</td></tr>
        <tr><td style="color:#666;padding:2px 6px 2px 0">วันที่ / Date:</td>
            <td>${dateStr}</td></tr>
      </table>
    </div>
  </div>

  <div style="padding:14px 28px;border-bottom:1px solid #e8ecf2">
    <div style="font-size:.62rem;font-weight:700;color:#2563eb;letter-spacing:1.2px;margin-bottom:7px">
      ร้านชุบ / PLATING SHOP</div>
    <div style="font-size:.9rem;font-weight:700;margin-bottom:2px">${supplier.name||''}</div>
    <div style="font-size:.78rem;color:#444;margin-bottom:2px">${supplier.address||''}</div>
    <div style="font-size:.78rem;color:#444">โทร: ${supplier.contact||'—'}</div>
  </div>

  <div style="padding:16px 28px">
    <table style="width:100%;border-collapse:collapse;font-size:.79rem">
      <thead>
        <tr style="background:#2563eb;color:#fff">
          <th style="padding:8px 10px;text-align:center;border-radius:4px 0 0 0;width:6%">ลำดับ</th>
          <th style="padding:8px 10px;text-align:left">รายการ</th>
          <th style="padding:8px 10px;text-align:center;width:12%">จำนวน/หน่วย</th>
          <th style="padding:8px 10px;text-align:center;width:6%">ฝาบน</th>
          <th style="padding:8px 10px;text-align:center;width:6%">ฝาล่าง</th>
          <th style="padding:8px 10px;text-align:center;width:7%">ตะแกรงนอก</th>
          <th style="padding:8px 10px;text-align:center;width:7%">ตะแกรงใน</th>
          <th style="padding:8px 10px;text-align:center;width:10%">ราคา/หน่วย</th>
          <th style="padding:8px 10px;text-align:center;width:10%">จำนวนเงิน</th>
          <th style="padding:8px 10px;text-align:center;width:10%;border-radius:0 4px 0 0">งานเก่า/ใหม่</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="8" style="padding:8px 10px;text-align:right;font-weight:700;border-top:2px solid #2563eb">รวมทั้งสิ้น</td>
          <td style="padding:8px 10px;text-align:right;font-weight:700;border-top:2px solid #2563eb;color:#2563eb">${fmtB(grandTotal)}</td>
          <td style="border-top:2px solid #2563eb"></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div style="display:flex;gap:12px;padding:10px 28px 28px;flex-wrap:wrap">
    <div style="flex:1;text-align:center;min-width:160px">
      <div style="border-top:1px solid #bbb;padding-top:5px;font-size:.7rem;color:#555">ผู้ส่งสินค้า / Sent by</div>
      <div style="font-size:.65rem;color:#aaa;margin-top:2px">( ______________ )</div>
    </div>
    <div style="flex:1;text-align:center;min-width:160px">
      <div style="border-top:1px solid #bbb;padding-top:5px;font-size:.7rem;color:#555">ผู้รับสินค้า (ร้านชุบ) / Received by</div>
      <div style="font-size:.65rem;color:#aaa;margin-top:2px">( ______________ )</div>
    </div>
  </div>
</div>`;
}

// ── สร้าง HTML "การ์ดใบส่งชุบ" สำหรับแชร์เป็นรูปบนมือถือ (แนวตั้ง กว้าง 480px รูปแบบ/สีเหมือนใบส่งชุบจริง) ──
function _platingBuildShareCardHtml(data) {
  const { platingNo, dateStr, supplier, items } = data;
  const co = _companyInfoCache || {};

  const fieldRow = (label, val, valColor) => `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f1f5f9">
      <span style="font-size:.74rem;color:#64748b;min-width:78px;flex-shrink:0">${label}</span>
      <span style="font-size:.8rem;font-weight:600;color:${valColor||'#1e293b'};flex:1;text-align:right">${val}</span>
    </div>`;

  const matVal = (has, mat, qtyVal, fallbackQty) => {
    if (!has) return `<span style="color:#ef4444;font-weight:700">❌</span>`;
    const v = (qtyVal !== undefined && qtyVal !== null && qtyVal !== '') ? qtyVal : fallbackQty;
    const qtyTxt = (v !== undefined && v !== null && v !== '') ? v : '-';
    return `${qtyTxt}${mat ? ` <span style="color:#777;font-size:.72rem">(${mat})</span>` : ''}`;
  };

  let grandTotal = 0;
  const itemCards = items.map((it, idx) => {
    const price  = parseFloat(it.price) || 0;
    const qtyNum = parseFloat(it.qty) || 0;
    const amount = price * qtyNum;
    grandTotal += amount;
    return `
    <div style="background:#fff;border-radius:10px;overflow:hidden;margin-bottom:10px;
      border:1px solid #e8ecf2;box-shadow:0 1px 3px rgba(0,0,0,.04)">
      <div style="background:#2563eb;color:#fff;padding:8px 12px;font-size:.8rem;font-weight:700">
        ${idx + 1}. ${it.noPO ? `[${it.noPO}] ` : ''}${it.description || ''}
      </div>
      <div style="padding:6px 12px">
        ${fieldRow('จำนวน/หน่วย', `${it.qty||''} ${it.unit||''}`)}
        ${fieldRow('ฝาบน', matVal(it.top, it.matTop, it.topQty, it.qty))}
        ${fieldRow('ฝาล่าง', matVal(it.bot, it.matBot, it.botQty, it.qty))}
        ${fieldRow('ตะแกรงนอก', matVal(it.meshOut, it.matMeshOut, it.meshOutQty, it.qty))}
        ${fieldRow('ตะแกรงใน', matVal(it.meshIn, it.matMeshIn, it.meshInQty, it.qty))}
        ${fieldRow('ราคา/หน่วย', price ? fmtB(price) : '-')}
        ${fieldRow('จำนวนเงิน', amount ? fmtB(amount) : '-', '#2563eb')}
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0">
          <span style="font-size:.74rem;color:#64748b;min-width:78px;flex-shrink:0">งานเก่า/ใหม่</span>
          <span style="font-size:.78rem;font-weight:600;color:#555;flex:1;text-align:right">${it.status||'-'}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  return `
  <div id="platingShareCardInner" style="background:#f1f5f9;border-radius:16px;overflow:hidden;
    font-family:'Sarabun',Tahoma,sans-serif;text-align:left;padding:14px">

    <!-- Header -->
    <div style="background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:10px;
      border-bottom:3px solid #2563eb">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:44px;height:44px;border-radius:10px;flex-shrink:0;overflow:hidden;
          display:flex;align-items:center;justify-content:center">
          <img src="${_getLogoSrc()}" alt="PTS" style="width:100%;height:100%;object-fit:contain"
            onerror="this.parentNode.style.background='#2563eb';this.style.display='none';this.parentNode.innerHTML='<span style=color:#fff;font-weight:800;font-size:.95rem>PT</span>'">
        </div>
        <div style="flex:1">
          <div style="font-weight:800;font-size:.86rem;color:#1a2232">${co.name||''}</div>
          <div style="font-size:.6rem;color:#888;letter-spacing:.5px">${co.nameEn||''}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:1.15rem;font-weight:800;color:#2563eb;line-height:1">ใบส่งชุบ</div>
          <div style="font-size:.58rem;color:#888;letter-spacing:1.5px">PLATING DELIVERY NOTE</div>
        </div>
      </div>
      <table style="font-size:.76rem;width:100%">
        <tr><td style="color:#666;padding:2px 6px 2px 0">เลขที่ / No:</td>
            <td style="font-weight:700;color:#2563eb">${platingNo||''}</td></tr>
        <tr><td style="color:#666;padding:2px 6px 2px 0">วันที่ / Date:</td>
            <td>${dateStr}</td></tr>
      </table>
    </div>

    <!-- ร้านชุบ -->
    <div style="background:#fff;border-radius:12px;padding:12px 16px;margin-bottom:10px">
      <div style="font-size:.6rem;font-weight:700;color:#2563eb;letter-spacing:1.2px;margin-bottom:6px">
        ร้านชุบ / PLATING SHOP</div>
      <div style="font-size:.86rem;font-weight:700;margin-bottom:2px">${supplier.name||''}</div>
      <div style="font-size:.76rem;color:#444;margin-bottom:2px">${supplier.address||''}</div>
      <div style="font-size:.76rem;color:#444">โทร: ${supplier.contact||'—'}</div>
    </div>

    <!-- รายการ -->
    ${itemCards}

    <!-- รวมทั้งสิ้น -->
    <div style="background:#fff;border-radius:12px;padding:12px 16px;display:flex;
      align-items:center;justify-content:space-between;border-top:3px solid #2563eb">
      <span style="font-size:.86rem;font-weight:700;color:#1a2232">รวมทั้งสิ้น</span>
      <span style="font-size:1.05rem;font-weight:800;color:#2563eb">${fmtB(grandTotal)}</span>
    </div>
  </div>`;
}

// ── render การ์ดใบส่งชุบลง #platingShareCardEl แล้ว capture เป็น canvas (กว้าง 480px เหมือนการ์ด Quotation) ──
async function _platingShareCardAsImage() {
  if (!_platingShareData) return null;
  const el = $('platingShareCardEl');
  if (!el) return null;
  el.innerHTML = _platingBuildShareCardHtml(_platingShareData);
  el.style.left = '-9999px';
  el.style.top  = '0';
  el.style.display = 'block';
  try {
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
    let canvas;
    try {
      canvas = await html2canvas(el, {
        backgroundColor: '#f1f5f9', scale: 2,
        useCORS: true, allowTaint: true,
        width: 480, logging: false
      });
      canvas.toDataURL('image/png'); // ทดสอบว่า canvas ไม่ถูก taint
    } catch(e) {
      canvas = await html2canvas(el, {
        backgroundColor: '#f1f5f9', scale: 2,
        useCORS: true, allowTaint: true,
        width: 480, logging: false,
        ignoreElements: node => node.tagName === 'IMG'
      });
    }
    el.style.display = 'none';
    return canvas;
  } catch(e) {
    el.style.display = 'none';
    throw e;
  }
}

// ── แชร์การ์ดใบส่งชุบเป็นรูป ผ่าน Web Share API (ทำงานเหมือนปุ่ม "ส่งรูป" ใน Quotation เป๊ะๆ) ──
async function sharePlatingShareCard() {
  if (typeof html2canvas !== 'function') {
    _notifyErr('โหลดไลบรารีไม่สำเร็จ', 'อินเทอร์เน็ต/เครือข่ายอาจบล็อก html2canvas ลองเช็คการเชื่อมต่อแล้วโหลดหน้าใหม่');
    return;
  }
  if (!_platingShareData) {
    _notifyErr('ไม่สามารถแชร์รูปได้', 'ไม่พบข้อมูลใบส่งชุบ กรุณากดสร้าง/แสดงเอกสารใหม่อีกครั้ง');
    return;
  }
  const hasSwal = typeof Swal !== 'undefined' && Swal && typeof Swal.fire === 'function';
  try {
    if (hasSwal) {
      Swal.fire({
        title: 'กำลังสร้างรูป...', allowOutsideClick: false, showConfirmButton: false,
        background: '#0d1b2a', color: '#cce4ff',
        didOpen: () => Swal.showLoading()
      });
    }
    const canvas = await _platingShareCardAsImage();
    if (!canvas) { if (hasSwal) Swal.close(); return; }
    const fileName = `PTS-${_platingShareData.platingNo || 'plating'}.png`;
    const dataUrl = canvas.toDataURL('image/png');

    // แสดงรูปในป็อปอัพ ให้แตะค้างที่รูปเพื่อ "บันทึกรูปภาพ"/"แชร์" ได้ทันที (ไม่ต้องเปิดแท็บใหม่)
    const canShareFiles = !!(navigator.canShare && navigator.share);
    const btnStyle = 'padding:9px 16px;border-radius:8px;border:none;color:#fff;font-size:.82rem;' +
      'font-weight:700;cursor:pointer;font-family:Sarabun,sans-serif';
    const shareBtnHtml = canShareFiles
      ? `<button id="platingShareBtn" style="${btnStyle}background:#06c755">📤 แชร์ไปยัง LINE/Telegram</button>`
      : '';

    if (!hasSwal) {
      // ไม่มี Swal → เปิดรูปในแท็บใหม่เป็นทางเลือกสุดท้าย
      window.open(dataUrl, '_blank');
      return;
    }

    Swal.fire({
      html: `
        <div style="text-align:center">
          <img src="${dataUrl}" style="width:100%;border-radius:8px;border:1px solid #2a3f5f">
          <div style="font-size:.74rem;color:#94a3b8;margin:10px 0">
            แตะค้างที่รูป แล้วเลือก "บันทึกรูปภาพ" หรือ "แชร์" เพื่อส่งให้ลูกค้าได้เลย</div>
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:4px">
            <button id="platingDownloadBtn" style="${btnStyle}background:#0ea5e9">📥 บันทึกรูป</button>
            ${shareBtnHtml}
          </div>
        </div>`,
      background: '#0d1b2a', color: '#cce4ff',
      showConfirmButton: true, confirmButtonText: 'ปิด', confirmButtonColor: '#334155',
      width: 420,
      didOpen: () => {
        const dlBtn = document.getElementById('platingDownloadBtn');
        if (dlBtn) dlBtn.onclick = () => {
          const link = document.createElement('a');
          link.download = fileName;
          link.href = dataUrl;
          link.click();
        };
        const shBtn = document.getElementById('platingShareBtn');
        if (shBtn) shBtn.onclick = () => {
          canvas.toBlob(async blob => {
            if (!blob) return;
            const file = new File([blob], fileName, { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) {
              try { await navigator.share({ files: [file] }); } catch(e) { /* user cancelled */ }
            }
          }, 'image/png');
        };
      }
    });
  } catch(e) {
    if (hasSwal) Swal.close();
    _notifyErr('ไม่สามารถแชร์รูปได้', e && e.message);
  }
}

// ── สร้างใบส่งชุบ จาก Order ที่ติ๊กเลือก + รายการเพิ่มเอง -> แสดง preview ──
function _platingGenerate() {
  const wrap = $('platingOrderListWrap');
  const supplierCode = $('platingSupplier')?.value || '';
  if (!supplierCode) {
    Swal.fire({icon:'warning', title:'กรุณาเลือกร้านชุบ',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#2563eb'});
    return;
  }
  const checkedOrders = wrap && wrap._platingList
    ? Array.from(document.querySelectorAll('#platingOrderListWrap .plating-chk:checked'))
        .map(c => wrap._platingList[parseInt(c.dataset.idx,10)]).filter(Boolean)
    : [];

  if (!checkedOrders.length && !_platingExtraItems.length) {
    Swal.fire({icon:'warning', title:'กรุณาเลือก Order หรือเพิ่มรายการอย่างน้อย 1 รายการ',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#2563eb'});
    return;
  }

  const supplier = _supplierCache.find(s => s.code === supplierCode) || {};
  const platingNo  = $('platingNo')?.value || '';
  const platingDateVal = $('platingDate')?.value || '';
  const dateStr = platingDateVal
    ? new Date(platingDateVal + 'T00:00:00').toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'})
    : new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});

  const orderItems = checkedOrders.map(r => {
    const noPO = String(r[ORDER_COLS.noPO]||'').trim();
    const p = _platingPresenceForOrder(r);
    const meta = _platingOrderMeta[noPO] || { price:0, status:'งานใหม่' };
    return {
      source: 'order', noPO,
      description: String(r[ORDER_COLS.productList]||'').trim() || '-',
      qty: String(r[ORDER_COLS.qty]||'').trim() || '',
      unit: 'Set',
      top: !!p.top, bot: !!p.bot, meshOut: !!p.meshOut, meshIn: !!p.meshIn,
      topQty: meta.topQty || 0, botQty: meta.botQty || 0, meshOutQty: meta.meshOutQty || 0, meshInQty: meta.meshInQty || 0,
      matTop: p.matTop || '', matBot: p.matBot || '', matMeshOut: p.matMeshOut || '', matMeshIn: p.matMeshIn || '',
      price: parseFloat(meta.price) || 0, status: meta.status || 'งานใหม่',
    };
  });
  const extraItems = (_platingExtraItems || [])
    .filter(it => String(it.description||'').trim())
    .map(it => Object.assign({ source:'extra' }, it));

  const items = orderItems.concat(extraItems);
  if (!items.length) {
    Swal.fire({icon:'warning', title:'ไม่มีรายการที่จะส่งชุบ',
      background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#2563eb'});
    return;
  }

  const html = _platingBuildDocHtml({ platingNo, dateStr, supplier, items });
  _platingShareData = { platingNo, dateStr, supplier, items };

  // เตรียมข้อมูลสำหรับบันทึก (ยืนยันส่งชุบ)
  _platingPreviewData = {
    platingNo,
    platingDate: platingDateVal ? _billDateToThaiBE(platingDateVal) : '',
    supplierCode, items,
    orderNos: checkedOrders.map(r => String(r[ORDER_COLS.noPO]||'').trim()).filter(Boolean),
  };

  _invPreviewMode = true;

  let docPlating = $('docPlating');
  if (!docPlating) {
    docPlating = document.createElement('div');
    docPlating.id = 'docPlating';
    $('docQuo').parentNode.appendChild(docPlating);
  }
  ['docQuo','docCost','docInv','docInvRep','docBill'].forEach(id => { if ($(id)) $(id).classList.add('dp-hidden'); });
  docPlating.classList.remove('dp-hidden');
  docPlating.innerHTML = html;

  if ($('dtabQuo'))  $('dtabQuo').style.display  = 'none';
  if ($('dtabCost')) $('dtabCost').style.display = 'none';
  const swapBtn = document.querySelector('.doc-bottombar .doc-tab-btn[onclick*="_docActiveTab"]');
  if (swapBtn) swapBtn.style.display = 'none';
  if ($('invConfirmBtn'))  $('invConfirmBtn').style.display  = 'none';
  if ($('billConfirmBtn')) $('billConfirmBtn').style.display = 'none';

  // ปุ่ม "ยืนยันส่งชุบ"
  let platingConfirmBtn = $('platingConfirmBtn');
  if (!platingConfirmBtn) {
    platingConfirmBtn = document.createElement('button');
    platingConfirmBtn.id = 'platingConfirmBtn';
    platingConfirmBtn.className = 'doc-tab-btn no-print';
    platingConfirmBtn.style = 'padding:8px 18px;border-radius:8px;border:none;background:#2563eb;' +
      'color:#fff;font-size:.82rem;font-weight:700;cursor:pointer;font-family:Sarabun,sans-serif;margin-right:8px';
    platingConfirmBtn.onclick = () => guardClick(platingConfirmBtn, _platingConfirmSave, 'กำลังบันทึก...');
    document.querySelector('.doc-bottombar > div').prepend(platingConfirmBtn);
  }
  platingConfirmBtn.textContent = '✅ ยืนยันส่งชุบ ' + platingNo;
  platingConfirmBtn.style.display = '';

  $('docExportOverlay').classList.add('open');
}

// ── ยืนยันส่งชุบ: บันทึก PlatingNote + รีเฟรชรายการ ──
async function _platingConfirmSave() {
  if (!_platingPreviewData) return;
  if (!_platingPreviewData.platingNo) {
    Swal.fire({icon:'warning', title:'กรุณากรอกเลขที่ใบส่งชุบ', background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#2563eb'});
    return;
  }
  const confirmed = await Swal.fire({
    icon:'question', title:`ยืนยันส่งชุบเลขที่ ${_platingPreviewData.platingNo}?`,
    html:`<div style="font-size:.83rem;color:#8b8aaa">รวม ${_platingPreviewData.items.length} รายการ` +
      (_platingPreviewData.orderNos.length ? ` (${_platingPreviewData.orderNos.length} Order)` : '') + `</div>`,
    background:'#0d1b2a', color:'#cce4ff',
    confirmButtonText:'✅ ยืนยัน', confirmButtonColor:'#2563eb',
    showCancelButton:true, cancelButtonText:'ยกเลิก', cancelButtonColor:'#374151',
  }).then(r => r.isConfirmed);
  if (!confirmed) return;

  Swal.fire({
    title: 'กำลังบันทึกใบส่งชุบ...', html: 'กรุณารอสักครู่',
    background:'#0d1b2a', color:'#cce4ff',
    allowOutsideClick:false, allowEscapeKey:false, showConfirmButton:false,
    didOpen: () => Swal.showLoading(),
  });
  try {
    const res = await fetch(SCRIPT_URL, {
      method:'POST', mode:'cors',
      headers:{'Content-Type':'text/plain'},
      body: JSON.stringify(Object.assign({ action:'savePlatingNote', issuedBy: 'PTS' }, _platingPreviewData))
    });
    const out = await res.json();
    if (!out || out.status !== 'ok') throw new Error((out && out.message) || 'save failed');
    _platingLearnPriceMemory(_platingPreviewData.items); // จำราคารายการที่ออกใบส่งชุบไว้ใช้ครั้งหน้า
    _platingPreviewData = null;
    closeDocExport();
    if ($('platingNo')) $('platingNo').value = '';
    _platingExtraItems = [];
    _platingRenderExtraItems();
    await fetchOrders();
    await fetchPlatingNotes();
    _platingOrderMeta = {}; // รีเซ็ต เพื่อให้รายการที่เหลือใช้ความจำราคาล่าสุดที่เพิ่งบันทึกไปด้วย
    _platingRenderOrderList();
    _platingSuggestNextNo();
    Swal.fire({icon:'success',title:`บันทึกใบส่งชุบ ${out.platingNo} สำเร็จ ✅`,background:'#0d1b2a',color:'#cce4ff',
      timer:1800,showConfirmButton:false,toast:true,position:'top-end'});
  } catch (e) {
    Swal.fire({icon:'error',title:'บันทึกใบส่งชุบไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
  }
}

// ══════════════════════════════════════════════════════
// ══ ประวัติใบส่งชุบ — ดู / พิมพ์ซ้ำ ══════════════════════
// ══════════════════════════════════════════════════════

function _platingHistClearFilter() {
  if ($('platingHistSearch')) $('platingHistSearch').value = '';
  if ($('platingHistFrom'))   $('platingHistFrom').value   = '';
  if ($('platingHistTo'))     $('platingHistTo').value     = '';
  renderPlatingHistory();
}

// ── โหลดประวัติใบส่งชุบจาก PlatingNote sheet ──
async function fetchPlatingNotes() {
  if (!SCRIPT_URL) { renderPlatingHistory(); return; }
  const wrap = $('platingHistListWrap');
  if (wrap) wrap.innerHTML = `<div style="text-align:center;padding:16px;color:var(--t3);font-size:.82rem"><span class="spin-ico">↻</span> กำลังโหลด…</div>`;
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getPlatingNotes', {mode:'cors'});
    const data = await res.json();
    if (data.status === 'ok') _platingHistCache = (data.plates || []).slice().reverse(); // ล่าสุดอยู่บน
    else throw new Error(data.message || 'unknown');
  } catch (e) {
    if (wrap) { wrap.innerHTML = `<div style="text-align:center;padding:16px;color:#f87171;font-size:.82rem">โหลดข้อมูลไม่สำเร็จ: ${e.message}</div>`; return; }
  }
  renderPlatingHistory();
}

function renderPlatingHistory() {
  const wrap = $('platingHistListWrap');
  if (!wrap) return;
  const kw   = ($('platingHistSearch')?.value || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
  const from = $('platingHistFrom')?.value || '';
  const to   = $('platingHistTo')?.value   || '';

  let list = (_platingHistCache || []).slice();
  if (from || to) {
    list = list.filter(p => {
      const iso = _invIssuedDateToIso(p.date);
      if (!iso) return false;
      if (from && iso < from) return false;
      if (to   && iso > to)   return false;
      return true;
    });
  }
  if (kw.length) {
    list = list.filter(p => {
      const supplier = _supplierCache.find(s => s.code === p.supplierCode) || {};
      const hay = [p.platingNo, p.supplierCode, supplier.name, p.orderNos].join(' ').toLowerCase();
      return kw.every(k => hay.includes(k));
    });
  }

  if (!list.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:16px;color:var(--t3);font-size:.82rem">ไม่พบประวัติใบส่งชุบ</div>`;
    return;
  }

  const rows = list.map(p => {
    const supplier = _supplierCache.find(s => s.code === p.supplierCode) || {};
    const realIdx = _platingHistCache.indexOf(p);
    const itemCount = (p.items || []).length;
    const total = (p.items || []).reduce((s,it) => s + (parseFloat(it.price)||0) * (parseFloat(it.qty)||0), 0);
    const poList = String(p.orderNos||'').split(',').map(s=>s.trim()).filter(Boolean);
    const poHtml = poList.length
      ? poList.map(no => `<a href="javascript:void(0)" onclick="_platingGotoOrder('${no.replace(/'/g,"\\'")}')"
          style="color:var(--c1);text-decoration:underline;cursor:pointer">${no}</a>`).join(', ')
      : '-';
    return `<tr style="border-bottom:1px solid var(--bc-card)">
      <td style="padding:6px 8px">${p.platingNo}</td>
      <td style="padding:6px 8px">${p.date}</td>
      <td style="padding:6px 8px">${supplier.name || p.supplierCode}</td>
      <td style="padding:6px 8px;text-align:center">${poHtml}</td>
      <td style="padding:6px 8px;text-align:center">${itemCount}</td>
      <td style="padding:6px 8px;text-align:right">${total ? fmtB(total) : '-'}</td>
      <td style="padding:6px 8px;text-align:center">
        <button onclick="_platingReprint(${realIdx})" style="padding:5px 12px;border-radius:6px;border:none;
          background:#2563eb;color:#fff;font-size:.74rem;cursor:pointer;font-family:Sarabun,sans-serif">🖨️ พิมพ์ซ้ำ</button>
        <button onclick="guardClick(this, () => _platingCancel(${realIdx}), 'กำลังยกเลิก...')" style="padding:5px 12px;border-radius:6px;border:none;margin-left:4px;
          background:#dc2626;color:#fff;font-size:.74rem;cursor:pointer;font-family:Sarabun,sans-serif">🗑️ ยกเลิก</button>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:.8rem">
      <thead>
        <tr style="border-bottom:1px solid var(--bc-card)">
          <th style="padding:6px 8px;text-align:left">เลขที่ใบส่งชุบ</th>
          <th style="padding:6px 8px;text-align:left">วันที่</th>
          <th style="padding:6px 8px;text-align:left">ร้านชุบ</th>
          <th style="padding:6px 8px;text-align:center">เลขที่ PO</th>
          <th style="padding:6px 8px;text-align:center">จำนวนรายการ</th>
          <th style="padding:6px 8px;text-align:right">ยอดรวม</th>
          <th style="padding:6px 8px;text-align:center">พิมพ์ซ้ำ</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── กดเลขที่ PO ในประวัติใบส่งชุบ → ไปหน้า Order พร้อมกรองหาเลขนั้น ──
function _platingGotoOrder(noPO) {
  switchTab('order');
  setTimeout(() => {
    const search = $('ordFilterStatus');
    if (search) search.value = '_all';
    const box = $('ordSearch');
    if (box) box.value = noPO;
    if (typeof renderOrderTable === 'function') renderOrderTable();
  }, 300);
}

// ── ยกเลิกใบส่งชุบ — ลบจากประวัติ (ไม่ revert สถานะ Order) ──
async function _platingCancel(idx) {
  const p = _platingHistCache[idx];
  if (!p) return;
  const conf = await Swal.fire({
    icon:'warning', title:`ยกเลิกใบส่งชุบ ${p.platingNo}?`,
    text:'Order ที่อยู่ในใบส่งชุบนี้จะกลับมาเลือกส่งชุบใหม่ได้',
    showCancelButton:true, confirmButtonText:'ยกเลิกใบส่งชุบ', cancelButtonText:'ปิด',
    confirmButtonColor:'#dc2626', background:'#0d1b2a', color:'#cce4ff'
  });
  if (!conf.isConfirmed) return;
  try {
    const res  = await fetch(SCRIPT_URL, {
      method:'POST', mode:'cors',
      body: JSON.stringify({ action:'deletePlatingNote', platingNo: p.platingNo })
    });
    const out = await res.json();
    if (!out || out.status !== 'ok') throw new Error((out && out.message) || 'delete failed');
    await fetchPlatingNotes();
    _platingRenderOrderList();
    Swal.fire({icon:'success',title:`ยกเลิกใบส่งชุบ ${p.platingNo} แล้ว`,background:'#0d1b2a',color:'#cce4ff',
      timer:1800,showConfirmButton:false,toast:true,position:'top-end'});
  } catch (e) {
    Swal.fire({icon:'error',title:'ยกเลิกไม่สำเร็จ',text:e.message,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
  }
}

// ── พิมพ์ใบส่งชุบซ้ำจากประวัติ ──
function _platingReprint(idx) {
  const p = _platingHistCache[idx];
  if (!p) return;
  const supplier = _supplierCache.find(s => s.code === p.supplierCode) || {};
  const dateStr = _invThaiDate(p.date);
  const html = _platingBuildDocHtml({ platingNo: p.platingNo, dateStr, supplier, items: p.items || [] });
  _platingShareData = { platingNo: p.platingNo, dateStr, supplier, items: p.items || [] };

  _platingPreviewData = null;
  _invPreviewMode = true;

  let docPlating = $('docPlating');
  if (!docPlating) {
    docPlating = document.createElement('div');
    docPlating.id = 'docPlating';
    $('docQuo').parentNode.appendChild(docPlating);
  }
  ['docQuo','docCost','docInv','docInvRep','docBill'].forEach(id => { if ($(id)) $(id).classList.add('dp-hidden'); });
  docPlating.classList.remove('dp-hidden');
  docPlating.innerHTML = html;

  if ($('dtabQuo'))  $('dtabQuo').style.display  = 'none';
  if ($('dtabCost')) $('dtabCost').style.display = 'none';
  const swapBtn = document.querySelector('.doc-bottombar .doc-tab-btn[onclick*="_docActiveTab"]');
  if (swapBtn) swapBtn.style.display = 'none';
  if ($('invConfirmBtn'))     $('invConfirmBtn').style.display     = 'none';
  if ($('billConfirmBtn'))    $('billConfirmBtn').style.display    = 'none';
  if ($('platingConfirmBtn')) $('platingConfirmBtn').style.display = 'none';

  $('docExportOverlay').classList.add('open');
}