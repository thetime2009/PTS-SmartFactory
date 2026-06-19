const $ = id => document.getElementById(id);

// ── ป้องกันกดปุ่ม Save/ปุ่มสำคัญซ้ำระหว่างรอข้อมูลจาก cloud (กันกดซ้ำ/ทำซ้ำ) ──
// ใช้: onclick="guardClick(this, () => saveXxx())"  หรือ onclick="guardClick(this, saveXxx)"
async function guardClick(btn, fn, busyText) {
  if (!btn) { return fn(); }
  if (btn.dataset.busy === '1' || btn.disabled) return; // กำลังทำงานอยู่ -> ไม่ทำซ้ำ
  btn.dataset.busy = '1';
  btn.dataset.oldHtml = btn.innerHTML;
  btn.disabled = true;
  btn.style.opacity = '.6';
  btn.style.cursor = 'wait';
  if (busyText) btn.innerHTML = busyText;
  // กันค้าง: ถ้า 60 วินาทีแล้วยังไม่คืนสถานะ ให้ปลดล็อกอัตโนมัติ
  const safety = setTimeout(() => _guardRelease(btn), 60000);
  try {
    await fn();
  } finally {
    clearTimeout(safety);
    _guardRelease(btn);
  }
}
function _guardRelease(btn) {
  if (!btn) return;
  btn.dataset.busy = '0';
  btn.disabled = false;
  btn.style.opacity = '';
  btn.style.cursor = '';
  if (btn.dataset.oldHtml !== undefined) { btn.innerHTML = btn.dataset.oldHtml; delete btn.dataset.oldHtml; }
}

// ── ซ่อน/แสดงเนื้อหาการ์ด (การ์ดที่พับเก็บไว้ เรียกดูเมื่อต้องการ) ──
function _toggleCardBody(id, btn) {
  const el = $(id);
  if (!el) return;
  const show = el.style.display === 'none';
  el.style.display = show ? '' : 'none';
  if (btn) btn.textContent = show ? '▲ ซ่อน' : '▼ แสดง';
}
// ── สลับ sub-tab ในแท็บ Order ── ('1' = สร้าง Order จากใบเสนอราคา, '2' = Order ทั่วไป/ใบเสนอราคา/Item Master)
function _ordSubTabSwitch(which) {
  ['1','2'].forEach(n => {
    const panel = $('ordSubPanel' + n);
    const btn   = $('ordSubBtn' + n);
    if (panel) panel.classList.toggle('active', n === which);
    if (btn)   btn.classList.toggle('active', n === which);
  });
}
// ── สลับ sub-tab ในแท็บ ใบกำกับภาษี ── ('1' = ออกใบกำกับ, '2' = เพิ่มลูกค้า, '3' = รายงานภาษีขาย, '4' = ใบวางบิล)
function _invSubTabSwitch(which) {
  ['1','2','3','4','5'].forEach(n => {
    const panel = $('invSubPanel' + n);
    const btn   = $('invSubBtn' + n);
    if (panel) panel.classList.toggle('active', n === which);
    if (btn)   btn.classList.toggle('active', n === which);
  });
  // การ์ด "ใบกำกับที่ออกแล้ว" ไม่แสดงใน sub-tab ใบวางบิล (4) และ ใบเสร็จ (5)
  const issuedCard = $('invIssuedCard');
  if (issuedCard) issuedCard.style.display = (which === '4' || which === '5') ? 'none' : '';
  if (which === '4' && typeof fetchBillingNotes === 'function') fetchBillingNotes();
  if (which === '5' && typeof rcptInit === 'function') rcptInit();
}
const num = id => parseFloat(String($(id).value).replace(/,/g,'')) || 0;
const fmt = n => '฿' + n.toLocaleString('th-TH', {minimumFractionDigits:2, maximumFractionDigits:2});

// ── Date helpers: ISO ↔ Thai D/M/YYYY พ.ศ. (ตรงกับ Google Sheet) ────
function isoToThaiShort(iso) {
  // "2026-06-08" → "8/6/2569"
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  return `${parseInt(d)}/${parseInt(m)}/${parseInt(y) + 543}`;
}
function thaiShortToIso(thai) {
  // "8/6/2569" → "2026-06-08"  (รองรับทั้ง / และ -)
  if (!thai) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(thai)) return thai; // already ISO
  const sep = thai.includes('/') ? '/' : '-';
  const parts = thai.split(sep);
  if (parts.length !== 3) return thai;
  const [d, m, y] = parts;
  // y อาจเป็น 4 หลัก พ.ศ. (2569) หรือ 2 หลัก (69)
  const beYear = parseInt(y) > 2400 ? parseInt(y) : (parseInt(y) >= 43 ? 2500 + parseInt(y) : 2600 + parseInt(y));
  const ceYear = beYear - 543;
  return `${ceYear}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

// ── "NEW" badge helper ────────────────────────────────
// ติด badge "NEW" กระพริบ ที่แถวซึ่งยังไม่เคยถูกเปิด/แก้ไข (เก็บ id ที่ "เห็นแล้ว" ไว้ใน localStorage)
const SEEN_KEY_DATA  = 'ptts_seen_noquo';
const SEEN_KEY_ORDER = 'ptts_seen_nopo';

function _getSeenSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
  catch(e) { return new Set(); }
}
function _addSeen(key, id) {
  if (!id) return;
  const set = _getSeenSet(key);
  const k = String(id);
  if (set.has(k)) return;
  set.add(k);
  localStorage.setItem(key, JSON.stringify([...set]));
}
// ครั้งแรกที่ใช้งาน (ยังไม่เคยมี key นี้เลย) — ตั้ง baseline จากข้อมูลปัจจุบัน
// เพื่อไม่ให้แถวเก่าทั้งหมดขึ้น "NEW" พร้อมกัน
function _initSeenIfEmpty(key, ids) {
  if (localStorage.getItem(key) === null) {
    localStorage.setItem(key, JSON.stringify(ids.map(String)));
  }
}
function _isNewItem(key, id) {
  if (!id) return false;
  return !_getSeenSet(key).has(String(id));
}
function _newBadge(isNew) {
  return isNew ? ' <span class="new-badge">NEW</span>' : '';
}

// ── URL persistence ──────────────────────────────────
let SCRIPT_URL = localStorage.getItem('ptts_script_url') || '';
if (SCRIPT_URL) {
  if ($('apiTab_scriptUrl')) $('apiTab_scriptUrl').value = SCRIPT_URL;
  if ($('setupBanner')) $('setupBanner').style.borderColor = 'rgba(52,211,153,.4)';
}
function saveScriptUrl() {
  // redirect to apiTabSaveScript
  apiTabSaveScript();
}

// ── TAB SWITCHING ────────────────────────────────────
// ── Tab Config System ────────────────────────────────
const TAB_DEFS = [
  { id:'breakdown', icon:'📋', label:'BreakDown'    },
  { id:'calc',      icon:'🔢', label:'คำนวณ'    },
  { id:'labor',     icon:'👷', label:'แรงงาน'  },
  { id:'mold',      icon:'🔩', label:'แม่พิมพ์' },
  { id:'data',      icon:'🗂️', label:'DATA'     },
  { id:'order',     icon:'📦', label:'Order'    },
  { id:'track',     icon:'🚀', label:'ติดตามงาน' },
  { id:'po',        icon:'🧾', label:'ใบสั่งซื้อ' },
  { id:'invoice',   icon:'📑', label:'ใบกำกับภาษี' },
  { id:'plating',   icon:'🧪', label:'ใบส่งชุบ' },
  { id:'api',       icon:'🔧', label:'ตั้งค่า'  },
  { id:'mat',       icon:'🧱', label:'MAT'      },
  { id:'supplier',  icon:'🏢', label:'Supplier' },
  { id:'rfq',       icon:'📨', label:'ใบขอราคา' },
  { id:'dept_help', icon:'📖', label:'วิธีใช้งานแผนก' },
];

// ── Sidebar Group Menu (เดสก์ท็อป ≥1024px) ─────────────
// จัดกลุ่มแท็บตามแผนก พร้อม submenu เปิด-ปิดได้
// รายการที่ ph:true = ฟีเจอร์ที่ยังไม่มีในระบบ (กำลังพัฒนา) — กดแล้วแจ้งเตือน ไม่เปิดแท็บจริง

// รายการเมนูแบบเดี่ยว (ไม่อยู่ในกลุ่ม) — แสดงไว้บนสุด เหนือกลุ่มฝ่ายขาย
const TOP_SIDEBAR_ITEMS = [
  { tab:'track', label:'แดชบอร์ด', icon:'📊', view:'full' },
];

const GROUP_DEFS = [
  { id:'sales', icon:'💼', label:'ฝ่ายขาย', items: [
    { tab:'breakdown' },
    { tab:'order', label:'ใบเสนอราคา', icon:'📝' },
    { tab:'order' },
    { tab:'data' },
    { tab:'labor' },
    { tab:'mold' },
    { tab:'mat' },
    { tab:'dept_help', label:'วิธีใช้งานแผนก', icon:'📖', dept:'sales' },
  ]},
  { id:'purchase', icon:'🛒', label:'ฝ่ายจัดซื้อ', items: [
    { tab:'rfq' },
    { tab:'po' },
    { tab:'plating' },
    { tab:'mat' },
    { tab:'supplier' },
    { tab:'dept_help', label:'วิธีใช้งานแผนก', icon:'📖', dept:'purchase' },
  ]},
  { id:'production', icon:'🏭', label:'ฝ่ายผลิต', items: [
    { tab:'order', label:'Job Order', icon:'📋' },
    { tab:'calc', label:'คำนวณตัดเหล็ก' },
    { tab:'mold' },
    { tab:'track', view:'reduced' },
    { ph:true, label:'Inspection', icon:'🔍' },
    { ph:true, label:'WI', icon:'📄' },
    { tab:'dept_help', label:'วิธีใช้งานแผนก', icon:'📖', dept:'production' },
  ]},
  { id:'account', icon:'💰', label:'บัญชี', items: [
    { tab:'invoice', label:'ใบกำกับภาษี', icon:'📑', subTab:'1' },
    { tab:'invoice', label:'เพิ่มลูกค้า', icon:'👥', subTab:'2' },
    { tab:'invoice', label:'รายงานภาษีขาย', icon:'📊', subTab:'3' },
    { tab:'invoice', label:'ใบวางบิล', icon:'📑', subTab:'4' },
    { tab:'invoice', label:'ใบเสร็จ', icon:'🧾', subTab:'5' },
    { tab:'invoice', label:'รายงานภาษี', icon:'📈', subTab:'3' },
    { tab:'dept_help', label:'วิธีใช้งานแผนก', icon:'📖', dept:'account' },
  ]},
  { id:'settings', icon:'⚙️', label:'ตั้งค่า', items: [
    { tab:'api' },
  ]},
];
function _loadSidebarGroupState() {
  try { return JSON.parse(localStorage.getItem('ptts_sb_groups') || '{}'); } catch(e) { return {}; }
}
function _toggleSidebarGroup(id) {
  const st = _loadSidebarGroupState();
  st[id] = !st[id];
  localStorage.setItem('ptts_sb_groups', JSON.stringify(st));
  renderTabBar();
}
function _placeholderAlert(label) {
  alert('🚧 "' + label + '" กำลังพัฒนา ยังไม่พร้อมใช้งานในขณะนี้');
}

// แท็บย่อยที่กำลังเปิดอยู่ (ใช้ไฮไลต์เมนูย่อยใน sidebar เช่น ใบกำกับภาษี / เพิ่มลูกค้า / รายงานภาษีขาย / ใบวางบิล)
let _activeSubTab = null;
// โหมดแสดงผลของหน้าติดตามงาน/แดชบอร์ด ('full' = แดชบอร์ด แสดงทุกการ์ดสรุป, 'reduced' = ติดตามงาน ซ่อนการ์ดที่ไม่จำเป็น)
let _trkViewMode = 'full';
let _activeHelpDept = localStorage.getItem('ptts_help_dept') || 'sales';
function _openDeptHelp(dept) {
  _activeHelpDept = dept;
  localStorage.setItem('ptts_help_dept', dept);
  switchTab('dept_help');
  _renderDeptHelp(dept);
  renderTabBar();
}
function _renderDeptHelp(dept) {
  const ids = ['sales','purchase','production','account'];
  const d = dept || _activeHelpDept;
  ids.forEach(k => {
    const el = document.getElementById('deptHelp-' + k);
    if (el) el.style.display = (k === d) ? '' : 'none';
  });
}
function _sbGoto(tab, subTab, view) {
  _activeSubTab = subTab || null;
  if (tab === 'track' && view) _trkViewMode = view;
  localStorage.setItem('ptts_trk_view_mode', _trkViewMode);
  localStorage.setItem('ptts_active_subtab', _activeSubTab || '');
  switchTab(tab);
  if (subTab && typeof _invSubTabSwitch === 'function') _invSubTabSwitch(subTab);
  if (tab === 'track' && typeof renderTrackDashboard === 'function') renderTrackDashboard();
  renderTabBar();
}

function _loadTabCfg() {
  let order, hidden;
  try { order  = JSON.parse(localStorage.getItem('ptts_tab_order')  || 'null') || TAB_DEFS.map(t=>t.id); } catch(e) { order  = TAB_DEFS.map(t=>t.id); }
  try { hidden = JSON.parse(localStorage.getItem('ptts_tab_hidden') || '[]'); } catch(e) { hidden = []; }
  // เผื่อมีแท็บใหม่ (เช่น order) ที่ไม่อยู่ใน config เก่าที่บันทึกไว้ — เติมต่อท้ายให้ครบ
  TAB_DEFS.forEach(t => { if (!order.includes(t.id)) order.push(t.id); });
  return { order, hidden };
}
function _saveTabCfg(order, hidden) {
  localStorage.setItem('ptts_tab_order',  JSON.stringify(order));
  localStorage.setItem('ptts_tab_hidden', JSON.stringify(hidden));
}

let _activeTab = 'breakdown';

// แท็บย่อยที่ถูกรวมไว้ใต้ปุ่ม "เพิ่มเติม" (ลดจำนวนปุ่มในแถบแท็บ)
const SUB_TAB_IDS = ['labor', 'mold', 'api', 'mat', 'po', 'cust', 'invoice', 'supplier'];

function renderTabBar() { try { _renderTabBarInner(); } catch(e) { console.error('[renderTabBar]', e); } }
function _renderTabBarInner() {
  const bar = $('mainTabBar');
  if (!bar) return;
  const { order, hidden } = _loadTabCfg();
  const sidebarHdr = `<div class="sidebar-header">
    <div class="sidebar-logo"><img src="${_getLogoSrc()}" alt="PTS" class="app-logo-img" style="width:100%;height:100%;object-fit:contain;display:block" onerror="this.style.display='none';this.parentNode.textContent='PT'"></div>
    <div><div class="sidebar-title">PTS</div><div class="sidebar-sub">Cost Breakdown</div></div>
  </div>`;
  // เดสก์ท็อป (sidebar ≥1024px): แสดงเป็นเมนูกลุ่มตามแผนก เปิด-ปิด submenu ได้
  const isDesktop = window.innerWidth >= 1024;

  if (isDesktop) {
    const groupState = _loadSidebarGroupState();
    const topItemsHtml = TOP_SIDEBAR_ITEMS.map(it => {
      if (it.ph) {
        return `<button type="button" class="tab-btn sb-placeholder sb-top-item" onclick="_placeholderAlert('${String(it.label).replace(/'/g,"\\'")}')">
          <span class="t-icon">⏳</span><span class="t-label">${it.label}</span>
        </button>`;
      }
      if (hidden.includes(it.tab)) return '';
      const def = TAB_DEFS.find(t=>t.id===it.tab);
      if (!def) return '';
      const label = it.label || def.label;
      const icon  = it.icon  || def.icon;
      const isActive = it.tab === _activeTab && (it.subTab||null) === (_activeSubTab||null);
      const viewArg = it.view ? `,'${it.view}'` : '';
      const click = it.subTab ? `_sbGoto('${it.tab}','${it.subTab}'${viewArg})` : `_sbGoto('${it.tab}',null${viewArg})`;
      return `<button type="button" class="tab-btn sb-top-item${isActive?' active':''}" data-tab="${it.tab}" onclick="${click}">
        <span class="t-icon">${icon}</span><span class="t-label">${label}</span>
      </button>`;
    }).join('');
    const groupsHtml = (function() { return GROUP_DEFS.map(g => {
      const itemsHtml = g.items.map(it => {
        if (it.ph) {
          return `<button type="button" class="tab-btn sb-placeholder" onclick="_placeholderAlert('${String(it.label).replace(/'/g,"\\'")}')">
            <span class="t-icon">⏳</span><span class="t-label">${it.label}</span>
          </button>`;
        }
        if (hidden.includes(it.tab)) return '';
        const def = TAB_DEFS.find(t=>t.id===it.tab);
        if (!def) return '';
        const label = it.label || def.label;
        const icon  = it.icon  || def.icon;
        const isActive = it.dept
          ? (it.tab === _activeTab && it.dept === _activeHelpDept)
          : (it.tab === _activeTab && (it.subTab||null) === (_activeSubTab||null));
        const viewArg = it.view ? `,'${it.view}'` : '';
        const click = it.dept
          ? `_openDeptHelp('${it.dept}')`
          : (it.subTab ? `_sbGoto('${it.tab}','${it.subTab}'${viewArg})` : `_sbGoto('${it.tab}',null${viewArg})`);
        const btnId = it.dept ? `tbtn-dept_help-${it.dept}` : `tbtn-${it.tab}`;
        return `<button type="button" class="tab-btn${isActive?' active':''}" id="${btnId}" data-tab="${it.tab}" onclick="${click}">
          <span class="t-icon">${icon}</span><span class="t-label">${label}</span>
        </button>`;
      }).join('');
      const hasActive = g.items.some(it => !it.ph && it.tab === _activeTab && (!it.dept || it.dept === _activeHelpDept));
      const isOpen = (groupState[g.id] !== undefined) ? groupState[g.id] : hasActive;
      return `<div class="sb-group${isOpen?' open':''}">
        <button type="button" class="sb-group-header" onclick="_toggleSidebarGroup('${g.id}')">
          <span class="t-icon">${g.icon}</span><span class="t-label">${g.label}</span>
          <span class="sb-caret">${isOpen?'▾':'▸'}</span>
        </button>
        <div class="sb-group-items">${itemsHtml}</div>
      </div>`;
    }).join(''); })();
    bar.innerHTML = sidebarHdr + topItemsHtml + groupsHtml;
    const menu = $('moreMenu');
    if (menu) menu.innerHTML = '';
    return;
  }

  let subItems = [];
  let moreInserted = false;
  const buttons = order.map(id => {
    if (hidden.includes(id)) return '';
    const def = TAB_DEFS.find(t=>t.id===id);
    if (!def) return '';
    if (!isDesktop && SUB_TAB_IDS.includes(id)) {
      subItems.push(def);
      if (moreInserted) return '';
      moreInserted = true;
      const isActive = SUB_TAB_IDS.includes(_activeTab);
      return `<button class="tab-btn${isActive?' active':''}" id="tbtn-more" onclick="_toggleMoreMenu(event)">
        <span class="t-icon">⋯</span><span class="t-label">เพิ่มเติม</span>
      </button>`;
    }
    const isActive = id === _activeTab;
    return `<button class="tab-btn${isActive?' active':''}" id="tbtn-${id}" onclick="switchTab('${id}')">
      <span class="t-icon">${def.icon}</span><span class="t-label">${def.label}</span>
    </button>`;
  }).join('');
  bar.innerHTML = sidebarHdr + buttons;

  const menu = $('moreMenu');
  if (menu) {
    menu.innerHTML = subItems.map(def => {
      const isActive = def.id === _activeTab;
      return `<button class="tab-btn${isActive?' active':''}" id="tbtn-${def.id}" onclick="switchTab('${def.id}');_closeMoreMenu()">
        <span class="t-icon">${def.icon}</span><span class="t-label">${def.label}</span>
      </button>`;
    }).join('');
  }
}

// re-render tab bar เมื่อข้าม breakpoint เดสก์ท็อป (1024px) เพื่อสลับโหมด group/ไม่ group "เพิ่มเติม"
let _wasDesktopTabs = window.innerWidth >= 1024;
window.addEventListener('resize', () => {
  const nowDesktop = window.innerWidth >= 1024;
  if (nowDesktop !== _wasDesktopTabs) {
    _wasDesktopTabs = nowDesktop;
    renderTabBar();
  }
});
// safety net: ถ้า DOMContentLoaded-time render ล้มเหลวไปด้วยเหตุใดก็ตาม ให้ render อีกครั้งตอน window.load
window.addEventListener('load', () => {
  const bar = document.getElementById('mainTabBar');
  if (bar && !bar.querySelector('.tab-btn, .sb-group, .sb-top-item')) renderTabBar();
});

function _toggleMoreMenu(e) {
  const menu = $('moreMenu');
  const btn  = $('tbtn-more');
  if (!menu || !btn) return;
  if (menu.classList.contains('show')) { _closeMoreMenu(); return; }
  const r = btn.getBoundingClientRect();
  if (window.innerWidth >= 1024) {
    // เดสก์ท็อป: sidebar อยู่ซ้าย → เปิดเมนูทางขวาของปุ่ม
    menu.style.left   = (r.right + 6) + 'px';
    menu.style.top    = r.top + 'px';
    menu.style.bottom = 'auto';
    menu.style.right  = 'auto';
  } else {
    // มือถือ: tab bar อยู่ล่าง → เปิดเมนูเหนือปุ่ม
    menu.style.bottom = (window.innerHeight - r.top + 6) + 'px';
    menu.style.right  = (window.innerWidth - r.right) + 'px';
    menu.style.left   = 'auto';
    menu.style.top    = 'auto';
  }
  menu.classList.add('show');
  if (e) e.stopPropagation();
  setTimeout(() => document.addEventListener('click', _onMoreMenuOutsideClick), 0);
}
function _closeMoreMenu() {
  const menu = $('moreMenu');
  if (menu) menu.classList.remove('show');
  document.removeEventListener('click', _onMoreMenuOutsideClick);
}
function _onMoreMenuOutsideClick(e) {
  const menu = $('moreMenu');
  const btn  = $('tbtn-more');
  if (!menu) return;
  if (menu.contains(e.target) || (btn && btn.contains(e.target))) return;
  _closeMoreMenu();
}

function switchTab(name) {
  const { hidden } = _loadTabCfg();
  if (hidden.includes(name)) return;
  TAB_DEFS.forEach(t => {
    const tab = $('tab-' + t.id);
    if (tab) tab.classList.remove('active');
  });
  const tabEl = $('tab-' + name);
  if (tabEl) tabEl.classList.add('active');
  _activeTab = name;
  if (name !== 'invoice') _activeSubTab = null;
  else if (!_activeSubTab) _activeSubTab = '1';
  localStorage.setItem('ptts_active_tab', name);
  renderTabBar();
  // แสดง summary panel ฝั่งขวาเฉพาะแท็บ "สรุป/breakdown" เท่านั้น แท็บอื่นให้เนื้อหาเต็มจอ (เดสก์ท็อป)
  document.body.classList.toggle('no-summary-tab', name !== 'breakdown');
  if (name === 'calc')      refreshCalcTab();
  if (name === 'labor')     { renderProcTable(); updateLaborPreview(); }
  if (name === 'mold')      renderMoldTable();
  if (name === 'breakdown') setTimeout(updateCharts, 50);
  if (name === 'data')      dtRefresh(false);
  if (name === 'api')       { initCfgTheme(); renderTabManager(); }
  if (name === 'mat')       { renderMatTable('flap'); renderMatTable('mesh'); }
  if (name === 'supplier')  { fetchSuppliers(); }
  if (name === 'order')     { updateOrderPreview(); fetchOrders(); fetchCustomers().then(()=>_gordRefreshCustomerList()); fetchItemMaster(); }
  if (name === 'track')     {
    fetchOrders(); renderTrackDashboard();
    // โหลดประวัติใบแจ้งชุบ เพื่อใช้แสดงไอคอน 📨 บนขั้น "กำลังส่งชุป" ถ้าออกใบแจ้งชุบแล้ว
    if (typeof fetchPlatingNotes === 'function') fetchPlatingNotes().then(()=>renderTrackDashboard());
  }
  // รีเฟรชอัตโนมัติเฉพาะตอนอยู่แท็บติดตามงาน (อัตราตั้งค่าได้ในโหมดเต็มจอ)
  if (name === 'track') {
    if (typeof _trkApplyColsUI==='function') _trkApplyColsUI();
    if (typeof _trkApplyRefreshUI==='function') _trkApplyRefreshUI();
    if (typeof _startTrkAutoRefresh==='function') _startTrkAutoRefresh();
  }
  else { if (typeof _stopTrkAutoRefresh==='function') _stopTrkAutoRefresh(); }
  // ออกจากโหมดเต็มจอถ้าสลับแท็บอื่น
  if (name !== 'track' && document.body.classList.contains('trk-fullscreen-mode')) {
    document.body.classList.remove('trk-fullscreen-mode');
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(()=>{});
    const btn = $('trkFullBtn');
    if (btn) btn.textContent = '⛶ เปิดเต็มจอ';
  }
  if (name === 'po')        { fetchSuppliers(); fetchPurchaseOrders(); fetchPOSupplierItems(); if (!_poEditingNo && !_poItems.length) _poNewForm(); }
  if (name === 'cust')       { fetchCustomers(); fetchOrders(); }
  if (name === 'invoice')    { fetchCustomers(); fetchOrders(); invInit(); }
  if (name === 'plating')    { fetchSuppliers(); fetchOrders(); platingInit(); }
}

// ── Tab Manager UI ───────────────────────────────────
let _tmrDragSrc = null;

function renderTabManager() {
  const wrap = $('tabManagerWrap');
  if (!wrap) return;
  const { order, hidden } = _loadTabCfg();
  wrap.innerHTML = order.map((id, i) => {
    const def = TAB_DEFS.find(t=>t.id===id);
    if (!def) return '';
    const isHidden = hidden.includes(id);
    return `<div class="tmr-row${isHidden?' tmr-hidden':''}" id="tmr-${id}"
      draggable="true"
      ondragstart="_tmrDragStart(event,'${id}')"
      ondragover="_tmrDragOver(event,'${id}')"
      ondragleave="_tmrDragLeave(event,'${id}')"
      ondrop="_tmrDrop(event,'${id}')">
      <span class="tmr-handle">⠿</span>
      <span class="tmr-icon">${def.icon}</span>
      <span class="tmr-label">${def.label}</span>
      <button class="tmr-btn" onclick="_tmrMove('${id}',-1)" ${i===0?'disabled':''}
        title="ขยับขึ้น">↑</button>
      <button class="tmr-btn" onclick="_tmrMove('${id}',1)" ${i===order.length-1?'disabled':''}
        title="ขยับลง">↓</button>
      <button class="tmr-btn" onclick="_tmrToggle('${id}')"
        style="color:${isHidden?'#f87171':'#34d399'};border-color:${isHidden?'rgba(248,113,113,.3)':'rgba(52,211,153,.3)'}"
        title="${isHidden?'แสดง':'ซ่อน'}">${isHidden?'🙈':'👁️'}</button>
    </div>`;
  }).join('');
}

function _tmrDragStart(e, id) { _tmrDragSrc=id; e.dataTransfer.effectAllowed='move'; }
function _tmrDragOver(e, id)  {
  e.preventDefault(); e.dataTransfer.dropEffect='move';
  const el = $('tmr-'+id); if(el) el.classList.add('drag-over');
}
function _tmrDragLeave(e, id) { const el=$('tmr-'+id); if(el) el.classList.remove('drag-over'); }
function _tmrDrop(e, id) {
  e.preventDefault();
  const el=$('tmr-'+id); if(el) el.classList.remove('drag-over');
  if (!_tmrDragSrc || _tmrDragSrc===id) return;
  const { order, hidden } = _loadTabCfg();
  const fi=order.indexOf(_tmrDragSrc), ti=order.indexOf(id);
  if(fi<0||ti<0) return;
  order.splice(fi,1); order.splice(ti,0,_tmrDragSrc);
  _saveTabCfg(order, hidden); renderTabBar(); renderTabManager();
}
function _tmrMove(id, dir) {
  const { order, hidden } = _loadTabCfg();
  const i=order.indexOf(id), ni=i+dir;
  if(ni<0||ni>=order.length) return;
  order.splice(i,1); order.splice(ni,0,id);
  _saveTabCfg(order, hidden); renderTabBar(); renderTabManager();
}
function _tmrToggle(id) {
  const { order, hidden } = _loadTabCfg();
  const i=hidden.indexOf(id);
  // ห้ามซ่อนแท็บ ตั้งค่า (api) — ต้องเข้าถึงได้เสมอ
  if(id==='api' && i<0) {
    Swal.fire({icon:'warning',title:'ไม่สามารถซ่อนแท็บ ตั้งค่า',text:'ต้องเข้าถึงได้เสมอเพื่อจัดการแท็บอื่น',background:'#0d1b2a',color:'#cce4ff',timer:2200,showConfirmButton:false,toast:true,position:'top-end'});
    return;
  }
  if(i>=0) hidden.splice(i,1); else hidden.push(id);
  // ห้ามซ่อนทุกแท็บ
  const visible = order.filter(x=>!hidden.includes(x));
  if(!visible.length) { Swal.fire({icon:'warning',title:'ต้องมีแท็บอย่างน้อย 1 อัน',background:'#0d1b2a',color:'#cce4ff',timer:1800,showConfirmButton:false,toast:true,position:'top-end'}); return; }
  // ถ้าซ่อนแท็บที่กำลังแสดงอยู่ → switch ไปแท็บแรกที่ visible
  if(hidden.includes(_activeTab)) switchTab(visible[0]);
  _saveTabCfg(order, hidden); renderTabBar(); renderTabManager();
}
function tabMgrReset() {
  localStorage.removeItem('ptts_tab_order');
  localStorage.removeItem('ptts_tab_hidden');
  _activeTab='breakdown';
  renderTabBar();
  renderTabManager();
  Swal.fire({icon:'success',title:'รีเซ็ตแล้ว',background:'#0d1b2a',color:'#cce4ff',timer:1400,showConfirmButton:false,toast:true,position:'top-end'});
}

// ── Size auto-calculate ──────────────────────────────
function calcGapWeld() {
  const od   = parseFloat($('f_od')?.value)   || 0;
  const id2  = parseFloat($('f_id')?.value)   || 0;
  const cust = parseFloat($('f_custGap')?.value) || 0;
  const elAuto = $('f_gapWeld');
  const elCust = $('f_custGap');
  const lblAuto = elAuto?.closest('.field')?.querySelector('label');
  const lblCust = elCust?.closest('.field')?.querySelector('label');
  if (!elAuto) return;

  // คำนวณค่า auto ก่อน
  let autoGap = '';
  if (od > 0 && id2 > 0) {
    const g = ((od - 5) - (id2 + 5)) / 2;
    autoGap = g > 0 ? g.toFixed(1) : '0.0';
  }

  // ── Validation: ลูกค้ากำหนดฯ ห้ามเกิน auto gap ──
  const autoVal = autoGap !== '' ? parseFloat(autoGap) : null;
  if (elCust) {
    if (cust >= 1 && autoVal !== null && cust > autoVal) {
      elCust.style.borderColor = '#f87171';
      elCust.style.boxShadow   = '0 0 0 3px rgba(248,113,113,.2)';
      const errLbl = elCust.closest('.field')?.querySelector('.gap-err');
      if (!errLbl) {
        const span = document.createElement('span');
        span.className = 'gap-err';
        span.style.cssText = 'font-size:.72rem;color:#f87171;margin-top:3px;display:block';
        span.textContent = `⚠️ เกิน auto (${autoVal} mm)`;
        elCust.closest('.field')?.appendChild(span);
      }
      return; // block — ไม่อัพเดท gapWeld
    } else {
      elCust.closest('.field')?.querySelector('.gap-err')?.remove();
      elCust.style.borderColor = '';
      elCust.style.boxShadow   = '';
    }
  }

  const useCust = cust >= 1;

  if (useCust) {
    // ลูกค้ากำหนด → ช่องว่างใส่จีบ = 0, highlight custGap
    elAuto.value = '0';
    elAuto.style.opacity = '0.45';
    elAuto.style.borderColor = '';
    if (lblAuto) lblAuto.style.color = '';

    elCust.style.borderColor = '#34d399';
    elCust.style.boxShadow   = '0 0 0 3px rgba(52,211,153,.2)';
    if (lblCust) {
      lblCust.innerHTML = 'ลูกค้ากำหนดช่องว่าง (mm) <span style="color:#34d399;font-size:.68rem;font-weight:700">●ใช้ค่านี้</span>';
    }
  } else {
    // ใช้ auto → แสดงค่าปกติ, highlight gapWeld
    elAuto.value   = autoGap;
    elAuto.style.opacity     = '1';
    elAuto.style.borderColor = '#34d399';
    elAuto.style.boxShadow   = '0 0 0 2px rgba(52,211,153,.15)';
    if (lblAuto) {
      lblAuto.innerHTML = 'ช่องว่างใส่จีบ (mm) <span style="color:#34d399;font-size:.68rem;font-weight:700">●ใช้ค่านี้</span>';
    }

    elCust.style.borderColor = '';
    elCust.style.boxShadow   = '';
    if (lblCust) lblCust.innerHTML = 'ลูกค้ากำหนดช่องว่าง (mm) <span style="color:#8b8aaa;font-size:.68rem">(0 = ไม่ได้กำหนด)</span>';
  }

  // re-calc ตะแกรงใน ด้วย custgap ใหม่
  autoCalcFill();
}

function updateSize() {
  const od  = $('f_od').value.trim();
  const id  = $('f_id').value.trim();
  const h   = $('f_h').value.trim();
  const od2 = ($('f_hasOd2')?.checked && $('f_od2')?.value.trim()) ? $('f_od2').value.trim() : '';
  const base = [od,id,h].filter(Boolean).join('x');
  if (od || id || h) $('f_size').value = od2 ? `${od2}/${base}` : base;
  checkMold(parseFloat(od) || 0, parseFloat(id) || 0);
  _validateDimensions();
  calcGapWeld();
}

// ── ODฝา2 helpers ──────────────────────────────────────
function toggleOd2Panel() {
  const on = $('f_hasOd2')?.checked;
  const p  = $('od2Panel');
  if (p) p.style.display = on ? '' : 'none';
  if (!on) {
    if ($('f_od2'))      $('f_od2').value = '';
    if ($('f_matOd2'))   $('f_matOd2').value = '';
    if ($('f_costOd2'))  $('f_costOd2').value = '';
  }
  updateSize(); calcAll();
}

function od2AutoCost() {
  const doCalc = $('r_od2calc_yes')?.checked;
  const lbl    = $('od2costLabel');
  const inp    = $('f_costOd2');
  if (!doCalc) {
    if (lbl) lbl.textContent = '';
    if (inp) { inp.value = ''; inp.setAttribute('readonly',''); inp.style.background=''; }
    calcAll(); return;
  }
  if (inp) inp.removeAttribute('readonly');
  if (lbl) lbl.textContent = '●auto';
  const matCode = $('f_matOd2')?.value;
  const od2     = parseFloat($('f_od2')?.value) || 0;
  if (!matCode || !od2) { calcAll(); return; }
  const price = matPriceMap[matCode] || 0;
  if (!price) { calcAll(); return; }
  // ใช้สูตรเดียวกับฝาบน/ล่าง: cw = od2 + 50, cl = od2 + 50 (จาก _partFormulas[0])
  const fTop  = _partFormulas?.[0];
  const evalF = expr => { try { return new Function('od','id','h','unit','pi','sqrt','pow','custgap',
    '"use strict";return('+expr+')')(od2, 0, 0, 1, Math.PI, Math.sqrt, Math.pow, 0)||0; } catch(e){return od2+50;} };
  const cw = fTop ? evalF(fTop.cw) : od2 + 50;
  const cl = fTop ? evalF(fTop.cl) : od2 + 50;
  const DEF  = specMatData['4 X 8 ฟุต(ปรกติ)'] || {w:1219, l:2438};
  const spec  = specMatData[matCode] || DEF;
  const sw = spec.w, sl = spec.l;
  const pieces = Math.floor(sw/cw) * Math.floor(sl/cl);
  const ppc = pieces > 0 ? price / pieces : price;
  if (inp) inp.value = ppc.toFixed(2);
  calcAll();
}

function _validateDimensions() {
  const od = parseFloat($('f_od').value) || 0;
  const id = parseFloat($('f_id').value) || 0;
  // ID ≥ OD — highlight fields red, no popup (popup fires on save)
  const odEl = $('f_od'), idEl = $('f_id');
  if (od > 0 && id > 0 && id >= od) {
    if (odEl) odEl.style.borderColor = '#f87171';
    if (idEl) idEl.style.borderColor = '#f87171';
  } else {
    if (odEl) odEl.style.borderColor = '';
    if (idEl) idEl.style.borderColor = '';
  }
}

// ── Spec Mat Local Data ───────────────────────────────────────────
const _DEFAULT_SPEC_MAT = [
  { code:'4 X 8 ฟุต(ปรกติ)',    w:1219, l:2438, unit:'มิล' },
  { code:'4 X 8 ฟุต (สลับช้าง)', w:2438, l:1219, unit:'มิล' },
  { code:'CT-6',                w:600,  l:7200, unit:'มิล' },
  { code:'CT-7',                w:600,  l:7500, unit:'มิล' },
  { code:'CT-20',               w:1219, l:2438, unit:'มิล' },
  { code:'CT-20(ดำ)',            w:700,  l:3400, unit:'มิล' },
  { code:'CT-20-ซิงค์เทา',      w:1219, l:2438, unit:'มิล' },
  { code:'CT-7B',               w:670,  l:3900, unit:'มิล' },
];
let _localSpecMat = _DEFAULT_SPEC_MAT.map(r=>({...r}));
(function(){
  try {
    const s = localStorage.getItem('ptts_spec_mat');
    if (s) {
      const p = JSON.parse(s);
      if (Array.isArray(p) && p.length > 0) _localSpecMat = p;
      else localStorage.removeItem('ptts_spec_mat');
    }
  } catch(e){ localStorage.removeItem('ptts_spec_mat'); }
})();

function _saveLocalSpecMat() {
  localStorage.setItem('ptts_spec_mat', JSON.stringify(_localSpecMat));
  specMatData = {};
  _localSpecMat.forEach(r => { specMatData[r.code] = {w:+r.w, l:+r.l}; });
}

let _smtEditIdx = -1;

function renderSpecMatTable() {
  const wrap = $('smtTableWrap');
  if (!wrap) return;
  if (!_localSpecMat.length) {
    wrap.innerHTML = '<div style="color:var(--t3);font-size:.78rem;text-align:center;padding:10px">ยังไม่มีข้อมูล</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="smt-table">
      <thead><tr>
        <th>ชื่อ / รหัส</th>
        <th style="width:80px;text-align:center">กว้าง</th>
        <th style="width:80px;text-align:center">ยาว</th>
        <th style="width:46px;text-align:center">หน่วย</th>
        <th style="width:56px;text-align:center">จัดการ</th>
      </tr></thead>
      <tbody>${_localSpecMat.map((r,i) => _smtEditIdx===i ? `
        <tr style="background:rgba(99,102,241,.1)">
          <td><input class="smt-inp" id="smt_code_${i}" value="${_escH(r.code)}"></td>
          <td><input class="smt-inp" id="smt_w_${i}" type="number" value="${r.w}"></td>
          <td><input class="smt-inp" id="smt_l_${i}" type="number" value="${r.l}"></td>
          <td><input class="smt-inp" id="smt_u_${i}" value="${_escH(r.unit)}"></td>
          <td style="text-align:center">
            <button class="smt-act-btn" onclick="guardClick(this, () => smtSaveRow(${i}))" title="บันทึก">✅</button>
            <button class="smt-act-btn" onclick="smtCancelEdit()" title="ยกเลิก">✖</button>
          </td>
        </tr>` : `
        <tr>
          <td style="color:var(--t1);font-weight:500">${_escH(r.code)}</td>
          <td style="text-align:center;color:var(--t2)">${r.w}</td>
          <td style="text-align:center;color:var(--t2)">${r.l}</td>
          <td style="text-align:center;color:var(--t3);font-size:.72rem">${_escH(r.unit||'')}</td>
          <td style="text-align:center">
            <button class="smt-act-btn" onclick="smtEditRow(${i})" title="แก้ไข">✏️</button>
            <button class="smt-act-btn" onclick="smtDeleteRow(${i})" title="ลบ">🗑️</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function smtEditRow(i)  { _smtEditIdx = i; renderSpecMatTable(); }
function smtCancelEdit(){ _smtEditIdx = -1; renderSpecMatTable(); }

function smtSaveRow(i) {
  const code = ($('smt_code_'+i)||{}).value?.trim();
  const w    = parseFloat(($('smt_w_'+i)||{}).value) || 0;
  const l    = parseFloat(($('smt_l_'+i)||{}).value) || 0;
  const unit = ($('smt_u_'+i)||{}).value?.trim() || 'มิล';
  if (!code || !w || !l) {
    Swal.fire({icon:'warning',title:'กรอกข้อมูลให้ครบ',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    return;
  }
  _localSpecMat[i] = {code, w, l, unit};
  _smtEditIdx = -1;
  _saveLocalSpecMat();
  renderSpecMatTable();
}

function smtAddRow() {
  _localSpecMat.push({code:'MAT ใหม่', w:1219, l:2438, unit:'มิล'});
  _smtEditIdx = _localSpecMat.length - 1;
  _saveLocalSpecMat();
  renderSpecMatTable();
  setTimeout(()=>{ const el=$('smt_code_'+_smtEditIdx); if(el){el.focus();el.select();} },50);
}

function smtDeleteRow(i) {
  const code = _localSpecMat[i]?.code || '';
  Swal.fire({
    icon:'warning', title:'ลบรายการนี้?',
    html:`<b>${_escH(code)}</b><br><span style="font-size:.8rem;color:#8b8aaa">ไม่สามารถกู้คืนได้</span>`,
    background:'#0d1b2a', color:'#cce4ff', showCancelButton:true,
    confirmButtonColor:'#dc2626', confirmButtonText:'ลบ', cancelButtonText:'ยกเลิก'
  }).then(r => {
    if (!r.isConfirmed) return;
    _localSpecMat.splice(i, 1);
    if (_smtEditIdx >= i) _smtEditIdx = -1;
    _saveLocalSpecMat();
    renderSpecMatTable();
  });
}

function smtSyncFromServer() {
  if (!SCRIPT_URL) {
    Swal.fire({icon:'info',title:'ยังไม่ตั้งค่า URL',text:'กรุณาใส่ Apps Script URL ก่อน',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#6366f1'});
    return;
  }
  fetch(SCRIPT_URL+'?action=getSpecMat',{mode:'cors'})
    .then(r=>r.json())
    .then(data => {
      if (data.status==='ok' && data.specs && Object.keys(data.specs).length>0) {
        _localSpecMat = Object.entries(data.specs).map(([code,v])=>({code, w:+v.w||0, l:+v.l||0, unit:'มิล'}));
        _smtEditIdx = -1;
        _saveLocalSpecMat();
        renderSpecMatTable();
        Swal.fire({icon:'success',title:'ซิงค์สำเร็จ',timer:1200,showConfirmButton:false,background:'#0d1b2a',color:'#cce4ff'});
      } else {
        Swal.fire({icon:'error',title:'ไม่พบข้อมูลจากเซิร์ฟเวอร์',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
      }
    })
    .catch(()=>Swal.fire({icon:'error',title:'เชื่อมต่อไม่ได้',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'}));
}

// ── MAT Management (ฝา / ตะแกรง) ─────────────────────
let _localMatFlap = [];
let _localMatMesh = [];
let _matEditIdx   = { flap: -1, mesh: -1 };

(function(){
  const load = (key, target) => {
    try {
      const s = localStorage.getItem(key);
      if (s) { const p = JSON.parse(s); if (Array.isArray(p)) { target.length=0; p.forEach(x=>target.push(x)); } }
    } catch(e) { localStorage.removeItem(key); }
  };
  load('ptts_mat_flap', _localMatFlap);
  load('ptts_mat_mesh', _localMatMesh);
})();

// ── สลับ sub-tab ของแท็บ MAT: ฝา (Flap) / ตะแกรง (Mesh) ──
function matSwitchSubTab(type) {
  const tabs = { flap: 'matSubTab_flap', mesh: 'matSubTab_mesh' };
  Object.keys(tabs).forEach(t => {
    const panel = $(tabs[t]);
    const btn   = $('matSubTabBtn_' + t);
    if (panel) panel.style.display = (t === type) ? '' : 'none';
    if (btn) {
      if (t === type) {
        btn.style.background = 'rgba(99,102,241,.15)';
        btn.style.borderColor = 'rgba(99,102,241,.4)';
        btn.style.color = '#818cf8';
      } else {
        btn.style.background = 'transparent';
        btn.style.borderColor = 'var(--bc-input)';
        btn.style.color = 'var(--t3)';
      }
    }
  });
  renderMatTable(type);
}

function _getMatArr(type) { return type==='flap' ? _localMatFlap : _localMatMesh; }
function _getMatKey(type) { return type==='flap' ? 'ptts_mat_flap' : 'ptts_mat_mesh'; }
function _getMatWrap(type){ return $(type==='flap' ? 'matFlapTableWrap' : 'matMeshTableWrap'); }
function _getMatSel(type) { return type==='flap' ? MAT_FLAP : MAT_MESH; }

function _syncMatToMaps() {
  _localMatFlap.forEach(m => { matPriceMap[m.code]=+m.price||0; if(m.name) matNameMap[m.code]=m.name; if(m.w&&m.l) specMatData[m.code]={w:+m.w,l:+m.l}; });
  _localMatMesh.forEach(m => { matPriceMap[m.code]=+m.price||0; if(m.name) matNameMap[m.code]=m.name; if(m.w&&m.l) specMatData[m.code]={w:+m.w,l:+m.l}; });
}

// แปลงรหัสวัตถุดิบเป็นชื่อรายการ (สำหรับ output ภายนอก)
// ถ้าไม่มีชื่อในระบบ คืนรหัสเดิม
function matLabel(code) {
  if (!code) return '';
  return matNameMap[code] || code;
}

function _saveLocalMat(type) {
  localStorage.setItem(_getMatKey(type), JSON.stringify(_getMatArr(type)));
  _syncMatToMaps();
  _getMatSel(type).forEach(id => fillSelect(id, _getMatArr(type)));
}

function renderMatTable(type) {
  const wrap = _getMatWrap(type);
  if (!wrap) return;
  const arr  = _getMatArr(type);
  const editIdx = _matEditIdx[type];

  if (!arr.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:24px;color:var(--t3);font-size:.82rem">
      ยังไม่มีรายการ — กด ➕ เพิ่ม</div>`;
    return;
  }

  const rows = arr.map((m, i) => {
    if (i === editIdx) {
      return `<tr style="background:rgba(52,211,153,.08)">
        <td style="padding:6px 8px">
          <input id="mat_code_${type}_${i}" value="${m.code}"
            style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid rgba(52,211,153,.4);
            background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.82rem">
        </td>
        <td style="padding:6px 8px">
          <input id="mat_name_${type}_${i}" value="${m.name||''}" placeholder="ชื่อรายการวัตถุดิบ"
            style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid rgba(148,163,184,.25);
            background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.78rem">
        </td>
        <td style="padding:6px 8px">
          <div style="font-size:.7rem;color:var(--t3);margin-bottom:2px">ราคาซื้อจริง</div>
          <input id="mat_pricebuy_${type}_${i}" type="number" step="0.01" value="${m.priceBuy||0}"
            oninput="(function(){var v=parseFloat(this.value)||0;var el=document.getElementById('mat_price_${type}_${i}');if(el)el.value=Math.round(v*1.3);}).call(this)"
            style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid rgba(251,191,36,.4);
            background:var(--bg-input);color:#d97706;font-family:Sarabun,sans-serif;font-size:.82rem;margin-bottom:4px">
          <div style="font-size:.7rem;color:var(--t3);margin-bottom:2px">ราคา+30% <span style="color:#34d399">(ใช้คำนวณ)</span></div>
          <input id="mat_price_${type}_${i}" type="number" step="0.01" value="${m.price||0}"
            style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid rgba(52,211,153,.4);
            background:var(--bg-input);color:#16a34a;font-family:Sarabun,sans-serif;font-size:.82rem">
        </td>
        <td style="padding:6px 8px">
          <input id="mat_w_${type}_${i}" type="number" step="1" value="${m.w||1219}" placeholder="กว้าง"
            style="width:64px;padding:5px 6px;border-radius:6px;border:1px solid rgba(99,102,241,.4);
            background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.8rem">
          <span style="color:var(--t3);font-size:.75rem">×</span>
          <input id="mat_l_${type}_${i}" type="number" step="1" value="${m.l||2438}" placeholder="ยาว"
            style="width:64px;padding:5px 6px;border-radius:6px;border:1px solid rgba(99,102,241,.4);
            background:var(--bg-input);color:var(--t1);font-family:Sarabun,sans-serif;font-size:.8rem">
        </td>
        <td style="padding:6px 8px;white-space:nowrap">
          <button onclick="guardClick(this, () => matSaveRow('${type}',${i}))"
            style="padding:4px 12px;border-radius:6px;border:none;background:#34d399;color:#0a2e1a;
            font-family:Sarabun,sans-serif;font-size:.78rem;font-weight:700;cursor:pointer;margin-right:4px">💾</button>
          <button onclick="matCancelEdit('${type}')"
            style="padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:transparent;
            color:var(--t3);font-family:Sarabun,sans-serif;font-size:.78rem;cursor:pointer">✕</button>
        </td>
      </tr>`;
    }
    return `<tr style="${i%2===0?'background:var(--c1-05)':''}">
      <td style="padding:7px 10px;font-weight:600;color:var(--c1);white-space:nowrap">${m.code}</td>
      <td style="padding:7px 10px;font-size:.8rem;color:var(--t2)">${m.name||'—'}</td>
      <td style="padding:7px 10px">
        <div style="font-size:.72rem;color:var(--t3)">ซื้อ: <span style="color:#fbbf24">${(+m.priceBuy||0).toLocaleString('th-TH')} ฿</span></div>
        <div style="font-weight:700;color:#34d399">${(+m.price||0).toLocaleString('th-TH')} ฿ <span style="font-size:.68rem;color:var(--t3)">+30%</span></div>
      </td>
      <td style="padding:7px 10px;font-size:.78rem;color:var(--t3)">${m.w||'—'}×${m.l||'—'} มิล</td>
      <td style="padding:7px 10px;white-space:nowrap">
        <button onclick="matEditRow('${type}',${i})"
          style="padding:3px 10px;border-radius:6px;border:1px solid rgba(99,102,241,.4);background:transparent;
          color:#818cf8;font-family:Sarabun,sans-serif;font-size:.75rem;cursor:pointer;margin-right:4px">✏️</button>
        <button onclick="matDeleteRow('${type}',${i})"
          style="padding:3px 10px;border-radius:6px;border:1px solid rgba(248,113,113,.3);background:transparent;
          color:#f87171;font-family:Sarabun,sans-serif;font-size:.75rem;cursor:pointer">🗑</button>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:.82rem">
      <thead>
        <tr style="border-bottom:1px solid rgba(255,255,255,.1)">
          <th style="padding:6px 10px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">รหัส / Code</th>
          <th style="padding:6px 10px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">ชื่อรายการ</th>
          <th style="padding:6px 10px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">ราคาซื้อ / ราคา+30%</th>
          <th style="padding:6px 10px;text-align:left;color:var(--t2);font-weight:600;font-size:.75rem">ขนาดแผ่น (มิล)</th>
          <th style="padding:6px 10px;width:100px"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function matEditRow(type, i)  { _matEditIdx[type]=i; renderMatTable(type); }
function matCancelEdit(type)  { _matEditIdx[type]=-1; renderMatTable(type); }

function matSaveRow(type, i) {
  const code     = (document.getElementById('mat_code_'+type+'_'+i)?.value||'').trim();
  const name     = (document.getElementById('mat_name_'+type+'_'+i)?.value||'').trim();
  const priceBuy = parseFloat(document.getElementById('mat_pricebuy_'+type+'_'+i)?.value)||0;
  const price    = parseFloat(document.getElementById('mat_price_'+type+'_'+i)?.value)||Math.round(priceBuy*1.3);
  const w        = parseInt(document.getElementById('mat_w_'+type+'_'+i)?.value)||1219;
  const l        = parseInt(document.getElementById('mat_l_'+type+'_'+i)?.value)||2438;
  if (!code) { Swal.fire({icon:'warning',title:'กรุณาใส่รหัสวัตถุดิบ',background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#3b82f6'}); return; }
  const arr = _getMatArr(type);
  // check duplicate code (not same index)
  if (arr.some((m,j) => m.code===code && j!==i)) {
    Swal.fire({icon:'warning',title:`รหัส "${code}" มีอยู่แล้ว`,background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#3b82f6'}); return;
  }
  arr[i] = { code, name, price, priceBuy, w, l, unit:'มิล' };
  _matEditIdx[type] = -1;
  _saveLocalMat(type);
  // sync to specMat
  if (!_localSpecMat) _localSpecMat = [];
  const si = _localSpecMat.findIndex(r=>r.code===code);
  if (si>=0) _localSpecMat[si]={code,w,l,unit:'มิล'};
  else _localSpecMat.push({code,w,l,unit:'มิล'});
  if(typeof _saveLocalSpecMat==='function') _saveLocalSpecMat();
  if(typeof renderSpecMatTable==='function') renderSpecMatTable();
  renderMatTable(type);
  if (SCRIPT_URL) {
    fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'updateMat', type, code, name, price, priceBuy, w, l }) })
      .catch(()=>{});
  }
  Swal.fire({icon:'success',title:'บันทึกแล้ว ✅',background:'#0d1b2a',color:'#cce4ff',
    timer:1200,showConfirmButton:false,toast:true,position:'top-end'});
}

function matAddRow(type) {
  const arr = _getMatArr(type);
  arr.push({ code:'NEW', price:0, priceBuy:0, w:1219, l:2438, unit:'มิล' });
  _matEditIdx[type] = arr.length - 1;
  renderMatTable(type);
  // scroll to new row
  const wrap = _getMatWrap(type);
  if (wrap) wrap.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function matDeleteRow(type, i) {
  const arr  = _getMatArr(type);
  const code = arr[i]?.code || '';
  Swal.fire({
    icon:'warning', title:`ลบ "${code}"?`,
    html:`<div style="font-size:.83rem;color:#8b8aaa">ลบออกจากรายการและ dropdown<br>ไม่สามารถย้อนกลับได้</div>`,
    background:'#0d1b2a', color:'#cce4ff',
    confirmButtonText:'🗑 ลบเลย', confirmButtonColor:'#c0464a',
    showCancelButton:true, cancelButtonText:'ยกเลิก', cancelButtonColor:'#374151',
  }).then(r => {
    if (!r.isConfirmed) return;
    arr.splice(i, 1);
    if (_matEditIdx[type] >= arr.length) _matEditIdx[type] = -1;
    _saveLocalMat(type);
    renderMatTable(type);
    if (SCRIPT_URL && code) {
      fetch(SCRIPT_URL, { method:'POST', mode:'no-cors',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'deleteMat', type, code }) })
        .catch(()=>{});
    }
    Swal.fire({icon:'success',title:`ลบ "${code}" แล้ว`,background:'#0d1b2a',color:'#cce4ff',
      timer:1300,showConfirmButton:false,toast:true,position:'top-end'});
  });
}

// ── Labor ────────────────────────────────────────────
function calcLabor() {
  const t = num('f_workdays') * num('f_laborRate');
  $('f_cLabor').value = t > 0 ? t.toFixed(2) : '';
}

// ── MARGIN / SELL PRICE ──────────────────────────────
let _selectedMargin = 40;
let _moldData = [];   // [{od, ids:[]}] loaded from Modl tab

function setMargin(pct) {
  _selectedMargin = pct;
  const lbl = $('marginLabel');
  if (lbl) lbl.textContent = pct > 0 ? ('●+' + pct + '%') : '●กำหนดเอง';
  calcAll();
}

function onSellPriceInput() {
  _selectedMargin = 0;
  const lbl = $('marginLabel');
  if (lbl) lbl.textContent = '●กำหนดเอง';
  calcAll();
  _updatePricingInsight(); // อัปเดต percentile ทันทีที่พิมพ์ราคา
}

function renderMarginTable(total, unit) {
  const tbl = $('marginTable');
  if (!tbl) return;
  const pcts = [40, 50, 60, 100, 200];
  // costPerUnit = total / unit (or total if unit=0)
  const costPerUnit = unit > 0 ? total / unit : total;
  tbl.innerHTML = pcts.map(p => {
    const pricePerUnit = costPerUnit * (1 + p / 100);
    const priceJob     = pricePerUnit * (unit > 0 ? unit : 1);
    const profUnit     = pricePerUnit - costPerUnit;
    const isActive     = _selectedMargin === p;
    const profCls      = profUnit >= 0 ? 'pos' : 'neg';
    return `<div class="mgn-card${isActive?' active':''}" onclick="setMargin(${p})">
      <div class="mc-pct">+${p}%</div>
      <div class="mc-price">${fmt(pricePerUnit)}/ลูก</div>
      <div class="mc-prof ${profCls}">กำไร ${fmt(profUnit)}/ลูก</div>
    </div>`;
  }).join('');
}

// ── Main cost calculation ────────────────────────────
// ── Mold Checker ─────────────────────────────────────────────
function checkMold(od, id) {
  const icon = $('moldIcon');
  const text = $('moldText');
  const chip = $('moldIdsChip');
  if (!icon || !text) return;

  if (!od) {
    icon.textContent = '🔍';
    text.style.color = '#7c7a9a';
    text.textContent = 'กรอก OD และ ID เพื่อตรวจสอบแม่พิมพ์';
    if (chip) chip.style.display = 'none';
    const box = $('moldStatus');
    if (box) { box.style.borderColor = 'rgba(255,255,255,.07)'; box.style.background = 'rgba(255,255,255,.03)'; }
    return;
  }

  const odVal = parseFloat(od);
  const idVal = id ? parseFloat(id) : null;
  const row   = _moldData.find(m => m.od === odVal);
  const box   = $('moldStatus');

  if (!row) {
    // ไม่พบ OD ในตาราง
    icon.textContent = '❌';
    text.style.color = '#e08080';
    text.textContent = `ไม่พบแม่พิมพ์สำหรับ OD ${odVal}`;
    if (chip) chip.style.display = 'none';
    if (box) { box.style.borderColor = 'rgba(224,128,128,.3)'; box.style.background = 'rgba(224,128,128,.05)'; }
    // รอกรอก ID และ H ครบก่อน ถึงจะ popup
    const _hNow  = parseFloat($('f_h').value)  || 0;
    const _idNow = parseFloat($('f_id').value) || 0;
    if (_hNow > 0 && _idNow > 0) {
      Swal.fire({
        icon:'error', title:'❌ ไม่พบแม่พิมพ์',
        html:'ไม่มีข้อมูลแม่พิมพ์สำหรับ <b>OD ' + odVal + ' mm</b><br><span style="font-size:.8rem;color:#8b8aaa">ตรวจสอบข้อมูลในแท็บ แม่พิมพ์</span>',
        background:'#0d1b2a', color:'#cce4ff',
        confirmButtonColor:'#dc2626', confirmButtonText:'OK'
      });
    }
    return;
  }

  // มีข้อมูล OD — ตรวจสอบสถานะ ids
  const ids = row.ids || [];
  const noMold = ids.some(v => v.includes('ไม่มีพิมพ์'));

  if (noMold || ids.length === 0) {
    icon.textContent = '⚠️';
    text.style.color = '#c9a85c';
    text.textContent = `OD ${odVal} — ยังไม่มีแม่พิมพ์`;
    if (chip) chip.style.display = 'none';
    if (box) { box.style.borderColor = 'rgba(201,168,92,.3)'; box.style.background = 'rgba(201,168,92,.05)'; }
    return;
  }

  // ตรวจสอบ ID ด้วย (ถ้ากรอก)
  if (idVal) {
    const matched = ids.some(v => {
      const n = parseFloat(v);
      return !isNaN(n) && Math.abs(n - idVal) < 0.01;
    });
    if (matched) {
      icon.textContent = '✅';
      text.style.color = '#6ecfad';
      text.textContent = `OD ${odVal} + ID ${idVal} — พร้อมทำงาน`;
      if (chip) { chip.textContent = `ID ที่มี: ${ids.filter(v=>!isNaN(parseFloat(v))).join(', ')}`; chip.style.display = ''; }
      if (box) { box.style.borderColor = 'rgba(110,207,173,.3)'; box.style.background = 'rgba(110,207,173,.05)'; }
    } else {
      icon.textContent = '🔶';
      text.style.color = '#c9a85c';
      text.textContent = `มี OD ${odVal} อย่างเดียว — ไม่พบ ID ${idVal}`;
      if (chip) { chip.textContent = `ID ที่มี: ${ids.filter(v=>!isNaN(parseFloat(v))).join(', ')}`; chip.style.display = ''; }
      if (box) { box.style.borderColor = 'rgba(201,168,92,.3)'; box.style.background = 'rgba(201,168,92,.05)'; }
    }
  } else {
    // มี OD แต่ยังไม่กรอก ID
    icon.textContent = '🔶';
    text.style.color = '#c9a85c';
    text.textContent = `มี OD ${odVal} อย่างเดียว — กรอก ID เพื่อตรวจสอบ`;
    if (chip) { chip.textContent = `ID ที่มี: ${ids.filter(v=>!isNaN(parseFloat(v))).join(', ')}`; chip.style.display = ''; }
    if (box) { box.style.borderColor = 'rgba(201,168,92,.3)'; box.style.background = 'rgba(201,168,92,.05)'; }
  }
}

function toggleAccord(hdr) {
  const body  = hdr.nextElementSibling;
  const arrow = hdr.querySelector('.accord-arrow');
  const open  = body.style.display !== 'none';
  body.style.display  = open ? 'none' : 'block';
  if (arrow) arrow.style.transform = open ? '' : 'rotate(180deg)';
}

function _updateTestWasteSummary() {
  const el = $('accord_testWaste_summary');
  if (!el) return;
  const cost = num('f_cTestWaste');
  el.textContent = cost > 0 ? `฿${cost.toFixed(2)}/ลูก` : '';
}

function _updateFixedSummary() {
  const el = $('accord_fixed_summary');
  if (!el) return;
  const cost = num('f_fixedCost');
  el.textContent = cost > 0 ? `฿${cost.toFixed(0)}/job` : '';
}

function calcAll() {
  calcLaborByProcess();
  // เทสเสีย 15% ของค่าวัสดุทั้งหมด
  const matBase = num('f_costTop') + num('f_costBot') + num('f_cMeshOut') + num('f_cMeshIn');
  $('f_cTestWaste').value = (matBase * 0.15).toFixed(2);
  _updateTestWasteSummary();
  _updateFixedSummary();
  const costTop=num('f_costTop'), costBot=num('f_costBot');
  const cTestWaste=num('f_cTestWaste'), cOutsource=num('f_cOutsource');
  const cMeshOut=num('f_cMeshOut'), cMeshIn=num('f_cMeshIn');
  const cLaser=num('f_cLaser'), cPlating=num('f_cPlating'), cMold=num('f_cMold');
  const cLabor=num('f_cLabor'), cMachine=num('f_cMachine');
  const cOther1=num('f_cOther1'), cOther2=num('f_cOther2'), cOther3=num('f_cOther3');
  const fixedCost=num('f_fixedCost');
  const unit=num('f_unit') || 1;
  // ขนส่ง: เหมารวม/job → auto /ลูก
  const transportJob = num('f_transport');
  const cTransport = unit > 0 ? transportJob/unit : transportJob;
  if ($('f_cTransport')) $('f_cTransport').value = cTransport > 0 ? cTransport.toFixed(2) : '';

  // เครื่องจักร: auto X% ของวัตถุดิบ (costTop+costBot) ถ้าผู้ใช้ยังไม่ได้แก้
  const machineEl = $('f_cMachine');
  if (machineEl && !machineEl._userEdited) {
    const machinePct = parseFloat(localStorage.getItem('ptts_machine_pct') ?? 5) || 5;
    const autoMachine = (costTop + costBot) * (machinePct / 100);
    machineEl.value = autoMachine > 0 ? autoMachine.toFixed(2) : '0.00';
    // update badge label
    const lbl = machineEl.closest('.pair-row')?.querySelector('label span');
    if (lbl) lbl.textContent = `●auto ${machinePct}%`;
  }

  // ODฝา2: รวมต้นทุนเฉพาะเมื่อ checkbox เปิด + radio = คำนวณ
  const hasOd2   = $('f_hasOd2')?.checked;
  const doCalcOd2 = hasOd2 && $('r_od2calc_yes')?.checked;
  const cOd2     = doCalcOd2 ? num('f_costOd2') : 0;

  // per-unit costs; cMold+fixedCost are per-job (cTransport now per-unit)
  const perUnitVar = costTop+costBot+cTestWaste+cOutsource+cMeshOut+cMeshIn+
                     cLaser+cPlating+cLabor+cTransport+num('f_cMachine')+
                     cOther1+cOther2+cOther3+cOd2;
  const total = perUnitVar*unit + cMold + fixedCost;
  const costPerUnit2 = perUnitVar + (unit > 0 ? (cMold + fixedCost) / unit : (cMold + fixedCost));
  // auto sell price from margin — per unit
  if (typeof _selectedMargin !== 'undefined' && _selectedMargin > 0 && total > 0) {
    const spUnit = Math.ceil(costPerUnit2 * (1 + _selectedMargin / 100) / 10) * 10;
    $('f_sellPrice').value = spUnit.toLocaleString('th-TH', {minimumFractionDigits:0, maximumFractionDigits:0});
  }
  const sellPriceUnit = num('f_sellPrice');           // ราคา/ลูก
  const sellPriceJob  = sellPriceUnit * unit;          // ราคา JOB
  const profitUnit = sellPriceUnit - costPerUnit2;
  const profitJob  = profitUnit * unit;
  renderMarginTable(total, unit);

  $('f_totalCost').value  = costPerUnit2.toFixed(2);   // ต้นทุน/ลูก
  $('f_profitJob').value  = profitJob.toFixed(2);
  $('f_profitUnit').value = profitUnit.toFixed(2);
  const costPerUnit = costPerUnit2;
  $('disp_total').textContent      = fmt(total);
  $('disp_profitJob').textContent  = fmt(profitJob);
  if ($('disp_profitUnit')) $('disp_profitUnit').textContent = fmt(profitUnit);
  if ($('disp_costPerUnit'))  $('disp_costPerUnit').textContent  = fmt(costPerUnit);
  if ($('disp_profitPerUnit')) $('disp_profitPerUnit').textContent = fmt(profitUnit);
  $('pb_job').className = 'profit-box' + (profitJob < 0 ? ' neg' : '');
  updateCharts();
  renderPriceComparison();
  updateSummaryPanel();
}

// ── Price Comparison Table & Chart ───────────────────
function renderPriceComparison() {
  const tbody = $('pcTableBody');
  const canvas = $('pcChart');
  if (!tbody || !canvas) return;

  // read current per-unit variable costs + per-job costs
  const costTop=num('f_costTop'), costBot=num('f_costBot');
  const cTestWaste=num('f_cTestWaste');
  const cOutsource=num('f_cOutsource');
  const cMeshOut=num('f_cMeshOut'), cMeshIn=num('f_cMeshIn');
  const cLaser=num('f_cLaser'), cPlating=num('f_cPlating');
  const cLabor=num('f_cLabor'), cMachine=num('f_cMachine');
  const cOther1=num('f_cOther1'), cOther2=num('f_cOther2'), cOther3=num('f_cOther3');
  const cMold=num('f_cMold'), fixedCost=num('f_fixedCost');
  const curUnit = num('f_unit') || 1;
  const cTransport = curUnit > 0 ? num('f_transport')/curUnit : num('f_transport');

  const perUnitVar = costTop+costBot+cTestWaste+cOutsource+cMeshOut+cMeshIn+
                     cLaser+cPlating+cLabor+cTransport+cMachine+cOther1+cOther2+cOther3;
  const perJobFixed = cMold + fixedCost;

  // คำนวณ % กำไรจริงจากราคาที่กรอกในช่อง "ราคาเสนอขาย" (เทียบกับต้นทุน/ลูกที่จำนวนปัจจุบัน)
  // แล้วใช้ % นี้แทนการ fix +40% — ทำให้ตารางและกราฟ interactive ตามราคาเสนอขายจริง
  const sellPriceUnit = num('f_sellPrice');
  const cpuCur = perUnitVar + (curUnit > 0 ? perJobFixed / curUnit : perJobFixed);
  const margin = (sellPriceUnit > 0 && cpuCur > 0)
    ? (sellPriceUnit / cpuCur - 1) * 100
    : (typeof _selectedMargin !== 'undefined' ? _selectedMargin : 40);
  const marginLbl = margin.toFixed(1).replace(/\.0$/, '');

  // generate tiers — from input if provided, else auto from current qty
  const qtyInput = $('pcQtyInput');
  let tiers;
  if (qtyInput && qtyInput.value.trim()) {
    tiers = qtyInput.value.split(/[,\s]+/)
      .map(v => parseInt(v.replace(/[^0-9]/g,'')))
      .filter(v => v >= 1);
    tiers = [...new Set(tiers)].sort((a,b)=>a-b);
  }
  if (!tiers || tiers.length === 0) {
    const base = curUnit > 0 ? curUnit : 100;
    const rawTiers = [
      Math.round(base * 0.25), Math.round(base * 0.5),
      base,
      Math.round(base * 2), Math.round(base * 3),
      Math.round(base * 5), Math.round(base * 10), Math.round(base * 20)
    ];
    tiers = [...new Set(rawTiers.filter(v => v >= 1))].sort((a,b)=>a-b);
  }

  const fmtN = n => n.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtI = n => n.toLocaleString('th-TH');

  const rows = tiers.map(qty => {
    const cpu  = perUnitVar + (qty > 0 ? perJobFixed / qty : perJobFixed);
    // จำนวนเดียวกับช่อง "จำนวน" ปัจจุบัน → ใช้ราคาเสนอขายตามที่กรอกจริง ไม่ปัดด้วย margin
    const spu  = (qty === curUnit && sellPriceUnit > 0) ? sellPriceUnit : cpu * (1 + margin / 100);
    const job  = spu * qty;
    const profit = job - (perUnitVar * qty + perJobFixed);
    return { qty, cpu, spu, job, profit };
  });

  // table
  tbody.innerHTML = rows.map(r => {
    const isActive = r.qty === curUnit;
    const profCls = r.profit >= 0 ? '#34d399' : '#f87171';
    const bg = isActive ? 'background:var(--c1-10)' : '';
    return `<tr style="${bg};border-bottom:1px solid var(--bc-div)">
      <td style="padding:6px 8px;text-align:center;color:${isActive?'var(--c1)':'var(--t1)'};font-weight:${isActive?'700':'400'}">${fmtI(r.qty)}${isActive?' ●':''}</td>
      <td style="padding:6px 8px;text-align:right;color:var(--t2)">฿${fmtN(r.cpu)}</td>
      <td style="padding:6px 8px;text-align:right;color:var(--c1);font-weight:600">฿${fmtN(r.spu)}</td>
      <td style="padding:6px 8px;text-align:right;color:var(--t1)">฿${fmtN(r.job)}</td>
      <td style="padding:6px 8px;text-align:right;color:${profCls};font-weight:600">฿${fmtN(r.profit)}</td>
    </tr>`;
  }).join('');

  // chart
  if (typeof Chart === 'undefined') return;
  const labels = rows.map(r => fmtI(r.qty));
  const cpuData = rows.map(r => +r.cpu.toFixed(2));
  const spuData = rows.map(r => +r.spu.toFixed(2));

  if (_pcChart) { _pcChart.destroy(); _pcChart = null; }
  const _cs = getComputedStyle(document.documentElement);
  const _t2c = _cs.getPropertyValue('--t2').trim();
  const _t3c = _cs.getPropertyValue('--t3').trim();
  const _bcc = _cs.getPropertyValue('--bc-div').trim();
  _pcChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'ต้นทุน/ลูก', data: cpuData, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.1)',
          tension: 0.35, pointRadius: 4, pointHoverRadius: 6, fill: true },
        { label: `ราคาขาย/ลูก (${margin>=0?'+':''}${marginLbl}%)`, data: spuData, borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,.07)',
          tension: 0.35, pointRadius: 4, pointHoverRadius: 6, fill: true }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: _t2c, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ` ฿${ctx.parsed.y.toLocaleString('th-TH',{minimumFractionDigits:2})}` } }
      },
      scales: {
        x: { ticks: { color: _t3c, font: { size: 10 } }, grid: { color: _bcc } },
        y: { ticks: { color: _t3c, font: { size: 10 },
                      callback: v => '฿'+v.toLocaleString('th-TH') },
             grid: { color: _bcc } }
      }
    }
  });
}

// ══ CHAT WIDGET (แชทภายในทีม) ═══════════════════════════════════
const CHAT_NAME_KEY  = 'ptts_chat_name';
const CHAT_SEEN_KEY  = 'ptts_chat_seen_count';
const CHAT_POLL_MS   = 8000;
let _chatMessages = [];
let _chatPollTimer = null;
let _chatOpen = false;

function _chatGetName() {
  return localStorage.getItem(CHAT_NAME_KEY) || '';
}

function _chatChangeName() {
  Swal.fire({
    title: '👤 ตั้งชื่อของคุณ',
    input: 'text',
    inputValue: _chatGetName(),
    inputPlaceholder: 'เช่น ป้อม, นุช, ...',
    confirmButtonText: 'บันทึก', confirmButtonColor: '#6366f1',
    showCancelButton: true, cancelButtonText: 'ยกเลิก',
    background: 'var(--bg-card)', color: 'var(--t1)',
    inputValidator: v => !v.trim() ? 'กรุณากรอกชื่อ' : undefined
  }).then(res => {
    if (!res.isConfirmed) return;
    localStorage.setItem(CHAT_NAME_KEY, res.value.trim());
    _chatUpdateWhoAmI();
  });
}

function _chatUpdateWhoAmI() {
  const el = $('chatWhoAmI');
  if (!el) return;
  const name = _chatGetName();
  el.textContent = name ? `คุณ: ${name} (เปลี่ยน)` : 'ตั้งชื่อ';
}

function _chatToggle() {
  const panel = $('chatPanel');
  if (!panel) return;
  _chatOpen = !panel.classList.contains('open');
  panel.classList.toggle('open', _chatOpen);
  if (_chatOpen) {
    if (!_chatGetName()) _chatChangeName();
    _chatFetch(true);
    _chatMarkSeen();
    setTimeout(() => $('chatInput')?.focus(), 200);
  }
}

function _chatInputKeydown(ev) {
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    _chatSend();
  }
}

function _chatMarkSeen() {
  localStorage.setItem(CHAT_SEEN_KEY, String(_chatMessages.length));
  const badge = $('chatFabBadge');
  if (badge) badge.style.display = 'none';
  $('chatFab')?.classList.remove('has-unread');
}

function _chatRender() {
  const body = $('chatBody');
  if (!body) return;
  if (!_chatMessages.length) {
    body.innerHTML = '<div class="chat-empty">ยังไม่มีข้อความ — เริ่มแชทกับทีมได้เลย</div>';
    return;
  }
  const myName = _chatGetName();
  const wasAtBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 30;
  body.innerHTML = _chatMessages.map(m => {
    const mine = myName && m.sender === myName;
    return `<div class="chat-msg ${mine ? 'me' : 'other'}">
        <div class="chat-msg-bubble">${mine ? '' : `<b>${_escH(m.sender)}</b><br>`}${_escH(m.message)}</div>
        <div class="chat-msg-meta">${mine ? '' : ''}${_escH(m.time||'')}</div>
      </div>`;
  }).join('');
  if (wasAtBottom || !_chatOpen) body.scrollTop = body.scrollHeight;
}

function _chatFetch(scrollToBottom) {
  if (!SCRIPT_URL) return;
  fetch(SCRIPT_URL + '?action=getChatMessages', { mode: 'cors' })
    .then(r => r.json())
    .then(data => {
      if (data.status !== 'ok' || !Array.isArray(data.messages)) return;
      const prevLen = _chatMessages.length;
      _chatMessages = data.messages;
      _chatRender();
      if (_chatOpen) {
        _chatMarkSeen();
        if (scrollToBottom) {
          const body = $('chatBody');
          if (body) body.scrollTop = body.scrollHeight;
        }
      } else {
        const seen = parseInt(localStorage.getItem(CHAT_SEEN_KEY) || '0', 10);
        const unread = Math.max(0, _chatMessages.length - seen);
        const badge = $('chatFabBadge');
        const fab = $('chatFab');
        if (unread > 0) {
          if (badge) { badge.textContent = unread > 99 ? '99+' : String(unread); badge.style.display = 'flex'; }
          fab?.classList.add('has-unread');
        } else {
          if (badge) badge.style.display = 'none';
          fab?.classList.remove('has-unread');
        }
      }
    })
    .catch(() => {});
}

function _chatSend() {
  const input = $('chatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  if (!SCRIPT_URL) {
    Swal.fire({icon:'info', title:'ยังไม่ตั้งค่า URL', text:'กรุณาใส่ Apps Script URL ก่อน', background:'var(--bg-card)', color:'var(--t1)', confirmButtonColor:'#6366f1'});
    return;
  }
  let name = _chatGetName();
  if (!name) {
    _chatChangeName();
    return;
  }
  input.value = '';
  input.style.height = 'auto';
  // optimistic render
  _chatMessages.push({ time: new Date().toLocaleString('th-TH', {hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}), sender: name, message: text });
  _chatRender();
  _chatMarkSeen();
  const body = $('chatBody');
  if (body) body.scrollTop = body.scrollHeight;

  fetch(SCRIPT_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'sendChatMessage', sender: name, message: text })
   }).catch(() => {});
}
setTimeout(() => _chatFetch(true), 1500);

function _chatInit() {
  _chatUpdateWhoAmI();
  if (!SCRIPT_URL) return;
  _chatFetch(false);
  if (_chatPollTimer) clearInterval(_chatPollTimer);
  _chatPollTimer = setInterval(() => _chatFetch(false), CHAT_POLL_MS);
  $('chatInput')?.addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 70) + 'px';
  });
}

