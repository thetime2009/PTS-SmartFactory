// ── AI Multi-Provider System ─────────────────────────────────────
let AI_PROVIDER = localStorage.getItem('ptts_ai_provider') || 'anthropic';
const AI_KEYS = {
  anthropic: localStorage.getItem('ptts_ai_key_anthropic') || localStorage.getItem('ptts_ai_key') || '',
  openai:    localStorage.getItem('ptts_ai_key_openai')    || '',
  gemini:    localStorage.getItem('ptts_ai_key_gemini')    || '',
};

// Legacy compat (from setup banner)
function saveAiKey() {
  const k = $('aiApiKeyInput') ? $('aiApiKeyInput').value.trim() : '';
  if (!k) return;
  AI_KEYS.anthropic = k;
  localStorage.setItem('ptts_ai_key_anthropic', k);
  localStorage.setItem('ptts_ai_key', k);
  Swal.fire({icon:'success',title:'บันทึก API Key แล้ว ✅',background:'#0d1b2a',color:'#cce4ff',
    timer:1500,showConfirmButton:false,toast:true,position:'top-end'});
}

function apiTabSaveScript() {
  const url = ($('apiTab_scriptUrl').value || '').trim();
  if (!url) return;
  SCRIPT_URL = url;
  localStorage.setItem('ptts_script_url', url);

  const st = $('apiTab_scriptStatus');
  if (st) st.textContent = '✓ บันทึกแล้ว — กด ทดสอบเชื่อมต่อ เพื่อตรวจสอบ';
  Swal.fire({icon:'success',title:'บันทึก URL แล้ว ✅',background:'#0d1b2a',color:'#cce4ff',
    timer:1400,showConfirmButton:false,toast:true,position:'top-end'});
}

function apiTabCopyScriptUrl() {
  const url = ($('apiTab_scriptUrl').value || '').trim();
  if (!url) {
    Swal.fire({icon:'warning',title:'ไม่มี URL ให้คัดลอก',background:'#0d1b2a',color:'#cce4ff',
      timer:1400,showConfirmButton:false,toast:true,position:'top-end'});
    return;
  }
  const _toast = () => Swal.fire({icon:'success',title:'คัดลอก URL แล้ว ✅',background:'#0d1b2a',color:'#cce4ff',
    timer:1200,showConfirmButton:false,toast:true,position:'top-end'});
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(_toast).catch(() => _copyFallback(url, _toast));
  } else {
    _copyFallback(url, _toast);
  }
}

function _copyFallback(text, onDone) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
  if (onDone) onDone();
}

function selectProvider(name) {
  AI_PROVIDER = name;
  localStorage.setItem('ptts_ai_provider', name);
  const labels = {anthropic:'Anthropic (Claude)',openai:'OpenAI (GPT)',gemini:'Google (Gemini)'};
  ['anthropic','openai','gemini'].forEach(p => {
    const card  = $('apv-' + p);
    const radio = $('radio-' + p);
    if (card)  card.classList.toggle('active', p === name);
    if (radio) radio.classList.toggle('checked', p === name);
  });
  const chip = $('activeProviderChip');
  if (chip) chip.textContent = '● ' + (labels[name] || name);
}

function copyProviderKey(provider) {
  const inp = $('key_' + provider);
  const val = inp ? inp.value : '';
  if (!val) {
    Swal.fire({icon:'warning',title:'ไม่มี API Key ให้คัดลอก',background:'#0d1b2a',color:'#cce4ff',
      timer:1400,showConfirmButton:false,toast:true,position:'top-end'});
    return;
  }
  const _toast = () => Swal.fire({icon:'success',title:'คัดลอก API Key แล้ว ✅',background:'#0d1b2a',color:'#cce4ff',
    timer:1200,showConfirmButton:false,toast:true,position:'top-end'});
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(val).then(_toast).catch(() => _copyFallback(val, _toast));
  } else {
    _copyFallback(val, _toast);
  }
}

function updateKeyPreview(provider, val) {
  const el = $('prev_' + provider);
  if (!el) return;
  if (!val) { el.textContent = '—'; return; }
  el.textContent = val.slice(0,8) + '…' + val.slice(-4);
}

function toggleKeyVis(id, btn) {
  const inp = $(id);
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.textContent = show ? '🙈' : '👁️';
}

function saveProviderKey(provider) {
  const inp = $('key_' + provider);
  if (!inp) return;
  const k = inp.value.trim();
  if (!k) {
    Swal.fire({icon:'warning',title:'กรุณากรอก API Key',
      text:'กรอก Key ในช่องก่อนกด บันทึก',
      background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#3b82f6'});
    return;
  }
  AI_KEYS[provider] = k;
  localStorage.setItem('ptts_ai_key_' + provider, k);
  if (provider === 'anthropic') localStorage.setItem('ptts_ai_key', k);
  updateKeyPreview(provider, k);
  // Flash save button green
  document.querySelectorAll('#apv-' + provider + ' .api-save-btn')
    .forEach(b => {
      const orig = b.textContent;
      b.textContent = '✓';
      b.style.background = 'rgba(110,207,173,.3)';
      b.style.borderColor = 'rgba(110,207,173,.5)';
      setTimeout(() => { b.textContent = orig; b.style.background = ''; b.style.borderColor = ''; }, 1800);
    });
  const names = {anthropic:'Anthropic',openai:'OpenAI',gemini:'Google'};
  Swal.fire({
    icon:'success',
    title:'บันทึก API Key แล้ว ✅',
    html:'<div style="font-size:.83rem;color:#8b8aaa;margin-top:4px">Provider: <b style="color:#d4cfe8">' + (names[provider]||provider) + '</b></div>',
    background:'#0d1b2a', color:'#cce4ff',
    confirmButtonColor:'#1d65cc', confirmButtonText:'OK',
    timer:2500, timerProgressBar:true
  });
}

async function testProviderKey(provider) {
  const k = AI_KEYS[provider];
  const stEl  = $('status_' + provider);
  const detEl = $('detail_' + provider);
  if (!k) {
    Swal.fire({icon:'warning',title:'ยังไม่มี API Key',text:'กรอก Key แล้วกด 💾 ก่อน',
      background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#3b82f6'});
    return;
  }
  if (stEl) stEl.innerHTML = '<span style="color:#8b8aaa">🔄…</span>';
  if (detEl) detEl.style.display = 'none';

  try {
    let ok = false, detail = '';

    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{'x-api-key':k,'anthropic-version':'2023-06-01',
          'anthropic-dangerous-direct-browser-access':'true','content-type':'application/json'},
        body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:8,
          messages:[{role:'user',content:'Hi'}]})
      });
      const d = await r.json().catch(()=>({}));
      ok = r.ok;
      if (ok) {
        detail = `<b>Model:</b> claude-haiku-4-5<br>
          <b>Input:</b> $0.80 / 1M tokens · <b>Output:</b> $4.00 / 1M tokens<br>
          <b>Vision:</b> รองรับรูปภาพ ✓<br>
          <b>Rate limit:</b> 50 req/min (free tier)`;
      } else {
        detail = d.error?.message || 'Key ไม่ถูกต้อง';
      }

    } else if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/models',
        {headers:{'Authorization': 'Bearer ' + k}});
      ok = r.ok;
      if (ok) {
        const mods = (await r.json().catch(()=>({data:[]}))).data || [];
        const vMods = mods.filter(m=>m.id.startsWith('gpt-4')||m.id.includes('vision')).map(m=>m.id).slice(0,4);
        detail = `<b>Models available:</b> ${mods.length}<br>
          <b>Vision models:</b> ${vMods.join(', ')||'gpt-4o-mini'}<br>
          <b>Input:</b> $0.15/1M (4o-mini) · <b>Output:</b> $0.60/1M<br>
          <b>Vision:</b> รองรับรูปภาพ ✓`;
      } else {
        const d = await r.json().catch(()=>({}));
        detail = d.error?.message || 'Key ไม่ถูกต้อง';
      }

    } else if (provider === 'gemini') {
      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${k}`);
      const listData = await listRes.json().catch(()=>({}));
      if (!listRes.ok) {
        ok = false;
        detail = listData.error?.message || 'Key ไม่ถูกต้อง';
      } else {
        const models = listData.models || [];
        const visionModels = models
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => m.name.replace('models/',''));
        const preferred = ['gemini-2.0-flash','gemini-2.0-flash-001','gemini-1.5-flash','gemini-1.5-pro','gemini-2.5-flash','gemini-2.5-pro'];
        const pick = preferred.find(p => visionModels.includes(p)) || visionModels[0] || 'gemini-2.0-flash';
        localStorage.setItem('ptts_gemini_model', pick);
        ok = true;
        detail = `<b>Models available:</b> ${models.length}<br>
          <b>Vision-ready:</b> ${visionModels.slice(0,4).join(', ')}<br>
          <b>Selected:</b> <b style="color:#34d399">${pick}</b><br>
          <b>Free tier:</b> ตรวจสอบโควต้าใน Google AI Studio`;
      }
    }

    const stEl2  = $('status_' + provider);
    const detEl2 = $('detail_' + provider);
    if (stEl2) stEl2.innerHTML = ok
      ? '<span style="color:#34d399">✅ ใช้งานได้</span>'
      : '<span style="color:#f87171">❌ ไม่สำเร็จ</span>';
    if (detEl2) { detEl2.innerHTML = detail; detEl2.style.display = 'block'; }
    Swal.fire({
      icon: ok ? 'success' : 'error',
      title: ok ? 'ทดสอบสำเร็จ ✅' : 'ทดสอบไม่สำเร็จ ❌',
      html: `<div style="font-size:.82rem;text-align:left;padding:4px 0;line-height:1.7">${detail}</div>`,
      background: '#0d1b2a', color: '#cce4ff',
      confirmButtonColor: ok ? '#1d65cc' : '#dc2626',
      confirmButtonText: 'OK'
    });
  } catch(e) {
    const stEl3 = $('status_' + provider);
    if (stEl3) stEl3.innerHTML = '<span style="color:#f87171">❌ Error</span>';
    Swal.fire({icon:'error',title:'เกิดข้อผิดพลาด',text:e.message,
      background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#dc2626'});
  }
}

// ── AI Image Reader ─────────────────────────────────────────────
// ── Image Attachment ─────────────────────────────────────────────
let _attachedImage = null;  // { name, dataUrl, base64, mimeType }

function handleAttachFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const dataUrl = ev.target.result;
    const base64  = dataUrl.split(',')[1];
    _attachedImage = { name: file.name, dataUrl, base64, mimeType: file.type };
    // อัปเดตปุ่ม
    const btn = $('btnAttach');
    if (btn) {
      btn.innerHTML = '📎 <span style="color:#34d399">●</span> เปลี่ยนรูป';
      btn.style.borderColor = 'rgba(52,211,153,.6)';
    }
    const viewBtn = $('btnViewAttach');
    if (viewBtn) viewBtn.style.display = 'flex';
    _syncAttachPreview();
    // reset input so same file can be reselected
    $('attachFileInput').value = '';
  };
  reader.readAsDataURL(file);
}

function viewAttachedImage() {
  if (!_attachedImage) return;
  Swal.fire({
    imageUrl: _attachedImage.dataUrl,
    imageAlt: _attachedImage.name,
    title: `<span style="font-size:.9rem;color:#94a3b8">${_attachedImage.name}</span>`,
    background: '#0a1c2e', color: '#f1f5f9',
    showConfirmButton: false, showCloseButton: true,
    width: 'auto',
    customClass: { image: 'attach-preview-img' },
    footer: `<button onclick="clearAttachedImage();Swal.close()"
      style="background:rgba(248,113,113,.15);border:1px solid rgba(248,113,113,.3);
      color:#f87171;padding:6px 16px;border-radius:8px;cursor:pointer;font-family:Sarabun,sans-serif">
      🗑 ลบรูปนี้</button>`
  });
}

function _syncAttachPreview() {
  const img     = $('attachPreviewImg');
  const empty   = $('apEmpty');
  const overlay = $('apOverlay');
  if (!img) return;
  if (_attachedImage && _attachedImage.legacy) {
    // ข้อมูลเก่าจากระบบเดิม มีแค่ชื่อไฟล์ ไม่มีรูปให้แสดง
    img.src = '';
    img.style.display = 'none';
    if (empty) {
      empty.style.display = 'flex';
      empty.innerHTML = `<span class="ap-icon">⚠️</span>
        <span class="ap-label" style="font-size:.72rem;line-height:1.4;text-align:center;padding:0 8px">
          ไม่พบรูป (ข้อมูลเก่า)<br><span style="opacity:.7">${_attachedImage.name}</span><br>คลิกเพื่อแนบรูปใหม่
        </span>`;
    }
    if (overlay) overlay.style.display = 'flex';
  } else if (_attachedImage) {
    img.src = _attachedImage.dataUrl;
    img.style.display = 'block';
    if (empty)   empty.style.display   = 'none';
    if (overlay) overlay.style.display = 'flex';
  } else {
    img.src = '';
    img.style.display = 'none';
    if (empty) {
      empty.style.display = 'flex';
      empty.innerHTML = `<span class="ap-icon">📎</span><span class="ap-label">คลิกเพื่อแนบรูปใบขอราคา</span>`;
    }
    if (overlay) overlay.style.display = 'none';
  }
}

function clearAttachedImage() {
  _attachedImage = null;
  const btn = $('btnAttach');
  if (btn) { btn.innerHTML = '📎 แนบรูป'; btn.style.borderColor = 'rgba(52,211,153,.3)'; }
  const viewBtn = $('btnViewAttach');
  if (viewBtn) viewBtn.style.display = 'none';
  _syncAttachPreview();
}

function _loadAttachFromUrl(url) {
  if (!url) return;
  // ค่าเก่าจากระบบเดิมเป็นแค่ชื่อไฟล์/พาธ ไม่ใช่ URL ที่เปิดดูได้ (ไม่ขึ้นต้นด้วย http)
  const isViewable = /^https?:\/\//i.test(url);
  _attachedImage = {
    name: isViewable ? 'รูปใบขอราคา' : url,
    dataUrl: isViewable ? url : null,
    base64: null, mimeType: 'image/*', driveUrl: url,
    legacy: !isViewable
  };
  const btn = $('btnAttach');
  if (btn) { btn.innerHTML = '📎 <span style="color:#34d399">●</span> เปลี่ยนรูป'; btn.style.borderColor = 'rgba(52,211,153,.6)'; }
  const viewBtn = $('btnViewAttach');
  if (viewBtn) viewBtn.style.display = isViewable ? 'flex' : 'none';
  _syncAttachPreview();
}

async function _runAiFromDataUrl(dataUrl, mime) {
  const b64 = dataUrl.split(',')[1];
  Swal.fire({
    title: '🔍 กำลังวิเคราะห์แบบ...',
    html: '<div style="color:#8b8aaa;font-size:.85rem">กำลังส่งรูปไปยัง AI อ่านข้อมูลงาน…</div>',
    background: '#0d1b2a', color: '#cce4ff',
    allowOutsideClick: false, showConfirmButton: false,
    willOpen: () => Swal.showLoading()
  });
  try {
    const parsed = await callAiReader(b64, mime || 'image/jpeg');
    Swal.close();
    showAiConfirm(parsed);
  } catch(err) {
    Swal.fire({icon:'error', title:'อ่านแบบไม่สำเร็จ', text:err.message,
      background:'#0d1b2a', color:'#cce4ff'});
  }
}

function openAiReader() {
  // ถ้ามีรูปแนบอยู่แล้ว — ถามก่อน
  if (_attachedImage?.dataUrl) {
    Swal.fire({
      title: '📷 อ่านจากรูปไหน?',
      html: `<img src="${_attachedImage.dataUrl}" style="width:100%;max-height:160px;object-fit:contain;
              border-radius:8px;border:1px solid rgba(255,255,255,.1);margin-bottom:4px">
             <div style="font-size:.8rem;color:#94a3b8;margin-top:6px">${_attachedImage.name}</div>`,
      background: '#0d1b2a', color: '#cce4ff',
      showDenyButton: true, showCancelButton: true,
      confirmButtonText: '✅ ใช้รูปที่แนบ',
      denyButtonText:    '🖼 เลือกรูปใหม่',
      cancelButtonText:  'ยกเลิก',
      confirmButtonColor: '#2563eb',
      denyButtonColor:    '#6d28d9',
      cancelButtonColor:  '#475569'
    }).then(r => {
      if (r.isConfirmed) {
        _runAiFromDataUrl(_attachedImage.dataUrl, _attachedImage.mimeType);
      } else if (r.isDenied) {
        _openAiFilePicker();
      }
    });
    return;
  }
  _openAiFilePicker();
}

function _openAiFilePicker() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      await _runAiFromDataUrl(ev.target.result, file.type || 'image/jpeg');
    };
    reader.readAsDataURL(file);
  };
  inp.click();
}

// ── Text-only AI call (ไม่มีรูป) ────────────────────────────────────
async function callAiText(prompt, maxTokens = 1800) {
  const k = AI_KEYS[AI_PROVIDER];
  if (!k) throw new Error('ยังไม่มี API Key สำหรับ ' + AI_PROVIDER + ' — ตั้งค่าใน แท็บ API');

  if (AI_PROVIDER === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': k, 'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'Anthropic error');
    return d.content?.[0]?.text || '';

  } else if (AI_PROVIDER === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + k, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini', max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'OpenAI error');
    return d.choices?.[0]?.message?.content || '';

  } else { // gemini — auto-fallback เมื่อ quota หมด
    const _fallbacks = ['gemini-2.0-flash','gemini-2.0-flash-001','gemini-1.5-flash','gemini-1.5-pro','gemini-2.5-flash'];
    const _cur = localStorage.getItem('ptts_gemini_model') || 'gemini-2.0-flash';
    // เริ่มจาก model ปัจจุบัน แล้วต่อด้วยตัวที่เหลือ
    const _order = [_cur, ..._fallbacks.filter(m => m !== _cur)];
    let lastErr = '';
    for (const model of _order) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${k}`,
        { method:'POST', headers:{'content-type':'application/json'},
          body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }] }) }
      );
      const d = await r.json();
      if (r.ok) {
        if (model !== _cur) {
          localStorage.setItem('ptts_gemini_model', model);
          Swal.fire({ toast:true, position:'top-end', icon:'info', showConfirmButton:false, timer:3500,
            title:`⚡ สลับ model → ${model}`, text:`Quota ${_cur} หมด ใช้ ${model} แทน` });
        }
        return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
      const msg = d.error?.message || '';
      lastErr = msg;
      if (!msg.toLowerCase().includes('quota') && !msg.toLowerCase().includes('rate')) throw new Error(msg);
    }
    throw new Error('Quota หมดทุก model: ' + lastErr);
  }
}

// ── คำอธิบายเกณฑ์การจัดกลุ่ม A/B/C สำหรับวิเคราะห์ราคา ──────────────
function showPricingInfo() {
  Swal.fire({
    title: 'ℹ️ วิธีคิดกลุ่ม A/B/C',
    width: 480,
    background: '#0a1c2e', color: '#cce4ff',
    confirmButtonText: 'เข้าใจแล้ว',
    confirmButtonColor: '#4f46e5',
    html: `
      <div style="text-align:left;font-family:Sarabun,sans-serif;font-size:.82rem;line-height:1.7;color:#cbd5e1">
        <p style="margin:0 0 8px">
          ระบบจะค้นหา <b>งานเก่าที่เคยบันทึกไว้ (3 ปีย้อนหลัง)</b> แล้วให้คะแนนความ "คล้าย" กับงานปัจจุบัน
          (เต็ม ~110 คะแนน) จากปัจจัยเหล่านี้:
        </p>
        <ul style="margin:0 0 10px;padding-left:20px">
          <li><b>ขนาด OD (สูงสุด 35 คะแนน)</b> — ยิ่งใกล้เคียงยิ่งได้คะแนนเยอะ ถ้าต่างกันเกิน 20% จะตัดทิ้ง ไม่นำมาคิดเลย</li>
          <li><b>ขนาด ID (สูงสุด 15 คะแนน)</b> — ต่างกันไม่เกิน 5% ได้เต็ม</li>
          <li><b>ความสูง H (สูงสุด 15 คะแนน)</b> — ต่างกันไม่เกิน 5% ได้เต็ม</li>
          <li><b>วัสดุ MAT ฝาบน (สูงสุด 20 คะแนน)</b> — ตรงกันเป๊ะ 20 คะแนน, ตรงแค่ตระกูลเดียวกัน (เช่น SPCC) ได้ 12</li>
          <li><b>ตะแกรงนอก (10 คะแนน)</b> — มี/ไม่มี ตรงกัน</li>
          <li><b>ตะแกรงใน (8 คะแนน)</b> — มี/ไม่มี ตรงกัน</li>
          <li><b>จำนวนลูก (สูงสุด 7 คะแนน)</b> — อยู่ในช่วงเดียวกัน เช่น ≤5 / 6–20 / 21–50 / 51–200 / มากกว่า 200</li>
        </ul>
        <p style="margin:0 0 6px;font-weight:700;color:#a5b4fc">แบ่งกลุ่มตามคะแนนรวม:</p>
        <ul style="margin:0;padding-left:20px">
          <li><b style="color:#34d399">กลุ่ม A เหมือนมาก</b> — คะแนน ≥ 65 (ขนาด/วัสดุ/ตะแกรง/จำนวน ใกล้เคียงกันมาก)</li>
          <li><b style="color:#fbbf24">กลุ่ม B คล้ายกัน</b> — คะแนน 35–64</li>
          <li><b style="color:#94a3b8">กลุ่ม C ขนาดใกล้เคียง</b> — คะแนน 15–34</li>
          <li>คะแนนต่ำกว่า 15 หรือ OD ต่างเกิน 20% → ไม่นำมาใช้วิเคราะห์</li>
        </ul>
        <p style="margin:10px 0 0;font-size:.75rem;color:#64748b">
          แต่ละกลุ่มจะแสดง: ราคาต่ำสุด/เฉลี่ย/สูงสุด, Win rate, Margin เฉลี่ย, ต้นทุนเฉลี่ย,
          และแนวโน้มราคา 12 เดือนล่าสุด ให้ AI ใช้ประกอบการแนะนำราคา
        </p>
      </div>`
  });
}

// อธิบายความหมายของ 🏆 Win rate และ 📈 Margin เฉลี่ยที่แสดงในแต่ละกลุ่ม
function showPricingMetricInfo() {
  Swal.fire({
    title: 'ℹ️ ความหมายของตัวเลขในแต่ละกลุ่ม',
    width: 440,
    background: '#0a1c2e', color: '#cce4ff',
    confirmButtonText: 'เข้าใจแล้ว',
    confirmButtonColor: '#4f46e5',
    html: `
      <div style="text-align:left;font-family:Sarabun,sans-serif;font-size:.82rem;line-height:1.8;color:#cbd5e1">
        <p style="margin:0 0 10px">
          <b>🏆 Win rate</b> — สัดส่วนงาน <b>"ในกลุ่มนี้"</b> ที่มีสถานะเป็น
          <span style="color:#60a5fa">"ผ่าน"</span> หรือ <span style="color:#22c55e">"อนุมัติ"</span>
          เทียบกับจำนวนงานทั้งหมดในกลุ่ม<br>
          เช่น 32.1% หมายถึง งานลักษณะนี้เคยถูกตอบรับ/อนุมัติประมาณ 32.1% ของงานคล้ายกันทั้งหมด
        </p>
        <p style="margin:0">
          <b>📈 Margin เฉลี่ย</b> — กำไรเฉลี่ย คิดเป็น % ของราคาขาย (กำไร ÷ ราคาขาย × 100)
          เฉลี่ยจากงานในกลุ่มนี้ทั้งหมด<br>
          เช่น 14.2% หมายถึง โดยเฉลี่ยงานกลุ่มนี้มีกำไรประมาณ 14.2% ของราคาขาย
        </p>
      </div>`
  });
}

// แสดงรายการงานทั้งหมดในกลุ่ม A/B/C (กดจากจำนวน "X งาน" ในการ์ดวิเคราะห์ราคา)
function showGroupJobsModal(groupKey) {
  const rows = (window._piGroupRows && window._piGroupRows[groupKey]) || [];
  const labels = {
    A: '🟢 เหมือนมาก (OD+ID+H+วัตถุดิบ+ตะแกรง)',
    B: '🟡 คล้ายกัน (OD+บางมิติตรง)',
    C: '🔵 ขนาดใกล้เคียง (OD เป็นหลัก)'
  };
  const stMap = { 'อนุมัติ':'#22c55e','ผ่าน':'#60a5fa','รอสรุป':'#f59e0b','ยกเลิก':'#f87171','':'#64748b' };
  const fmtN = n => Math.round(n||0).toLocaleString('th-TH');

  const sorted = [...rows].sort((a,b) => {
    const da = thaiShortToIso(String(a[DT.date]||'')) || '';
    const db = thaiShortToIso(String(b[DT.date]||'')) || '';
    return db.localeCompare(da);
  });

  const rowsHtml = sorted.map(r => {
    const od=r[DT.od]||'', idV=r[DT.id]||'', h=r[DT.h]||'';
    const size = (od && idV && h) ? `${od}×${idV}×${h}` : (r[DT.size]||'—');
    const tc = parseFloat(r[DT.totalCost])||0, sp = parseFloat(r[DT.sellPrice])||0;
    const st = String(r[DT.status]||'').trim();
    const col = stMap[st] || '#64748b';
    return `<tr style="border-bottom:1px solid rgba(255,255,255,.06)">
      <td style="padding:6px 8px;font-size:.72rem;color:#a5b4fc;font-weight:600;white-space:nowrap">${r[DT.noQuo]||'—'}</td>
      <td style="padding:6px 8px;font-size:.7rem;color:#94a3b8;white-space:nowrap">${r[DT.date]||'—'}</td>
      <td style="padding:6px 8px;font-size:.74rem;color:#e2e8f0;white-space:nowrap">${size} <span style="color:#64748b;font-size:.65rem">มม.</span></td>
      <td style="padding:6px 8px;font-size:.72rem;color:#cbd5e1;white-space:nowrap">${r[DT.matTop]||'—'}</td>
      <td style="padding:6px 8px;text-align:right;font-size:.74rem;color:#60a5fa;white-space:nowrap">฿${fmtN(tc)}</td>
      <td style="padding:6px 8px;text-align:right;font-size:.74rem;color:#e2e8f0;font-weight:700;white-space:nowrap">฿${fmtN(sp)}</td>
      <td style="padding:6px 8px;text-align:center;white-space:nowrap"><span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:.62rem;font-weight:600;background:${col}22;color:${col};border:1px solid ${col}55">${st||'—'}</span></td>
    </tr>`;
  }).join('');

  Swal.fire({
    title: labels[groupKey] || 'รายการงานที่คล้ายกัน',
    width: 620,
    background: '#0a1c2e', color: '#cce4ff',
    confirmButtonText: 'ปิด', confirmButtonColor: '#4f46e5',
    html: `
      <div style="text-align:left;max-height:60vh;overflow:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="border-bottom:1px solid rgba(255,255,255,.15)">
            <th style="padding:6px 8px;text-align:left;font-size:.66rem;color:#94a3b8">No.Quo</th>
            <th style="padding:6px 8px;text-align:left;font-size:.66rem;color:#94a3b8">วันที่</th>
            <th style="padding:6px 8px;text-align:left;font-size:.66rem;color:#94a3b8">ขนาด</th>
            <th style="padding:6px 8px;text-align:left;font-size:.66rem;color:#94a3b8">MAT</th>
            <th style="padding:6px 8px;text-align:right;font-size:.66rem;color:#94a3b8">ต้นทุน</th>
            <th style="padding:6px 8px;text-align:right;font-size:.66rem;color:#94a3b8">ราคาขาย</th>
            <th style="padding:6px 8px;text-align:center;font-size:.66rem;color:#94a3b8">สถานะ</th>
          </tr></thead>
          <tbody>${rowsHtml || '<tr><td colspan="7" style="padding:16px;text-align:center;color:#64748b">ไม่พบข้อมูล</td></tr>'}</tbody>
        </table>
      </div>`
  });
}

// ── ประวัติผลวิเคราะห์ AI เคาะราคา (เก็บไว้ดูซ้ำ ไม่ต้องยิง AI ใหม่) ──
const PRICING_HIST_KEY = 'ptts_pricing_history';
const PRICING_HIST_MAX = 20;

function _getPricingHistory() {
  try { return JSON.parse(localStorage.getItem(PRICING_HIST_KEY) || '[]'); } catch(e) { return []; }
}
function _savePricingResult(cur, result) {
  const hist = _getPricingHistory();
  hist.unshift({ time: new Date().toISOString(), cur, result });
  if (hist.length > PRICING_HIST_MAX) hist.length = PRICING_HIST_MAX;
  localStorage.setItem(PRICING_HIST_KEY, JSON.stringify(hist));
}
function _pricingToHtml(txt) {
  return txt
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')
    .replace(/\n/g,'<br>');
}
const B_ = n => '฿' + Math.round(n).toLocaleString('th-TH');
function _fmtPricingDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit',year:'2-digit'})
    + ' ' + d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
}

// แสดงผลวิเคราะห์ (ทั้งของใหม่และของเก่าจากประวัติ) — มีปุ่ม "📜 ประวัติ" ท้ายกล่อง
function _showPricingResultModal(cur, result, time) {
  Swal.fire({
    title: '🎯 AI เคาะราคา',
    html: `
      <div style="text-align:left;font-family:Sarabun,sans-serif;font-size:.88rem;line-height:2;color:#cbd5e1;padding:4px 2px">
        <div style="background:rgba(99,102,241,.12);border-radius:8px;padding:7px 12px;margin-bottom:12px;font-size:.75rem;color:#94a3b8">
          OD${cur.od}×ID${cur.id}×H${cur.h} · ${cur.unit} ลูก · ต้นทุน ${B_(cur.costPerUnit)}/ลูก
          ${time ? `<br>🕐 วิเคราะห์เมื่อ ${_fmtPricingDate(time)}` : ''}
        </div>
        ${_pricingToHtml(result)}
      </div>`,
    background: '#0d1b2a', color: '#cce4ff',
    width: 480,
    showCloseButton: true,
    showDenyButton: true,
    denyButtonText: '📜 ประวัติทั้งหมด',
    denyButtonColor: '#475569',
    confirmButtonText: '✅ ปิด',
    confirmButtonColor: '#4f46e5',
  }).then(r => {
    if (r.isDenied) showPricingHistory();
  });
}

// แสดงผลวิเคราะห์ล่าสุด (ไม่เรียก AI ใหม่) — ถ้ายังไม่เคยวิเคราะห์ จะเรียก AI ให้เลย
function showLastPricingResult() {
  const hist = _getPricingHistory();
  if (hist.length) {
    const e = hist[0];
    _showPricingResultModal(e.cur, e.result, e.time);
    return;
  }
  // ไม่มีในประวัติ (เครื่อง/เบราว์เซอร์นี้) — ลองใช้ผลที่บันทึกไว้กับงานนี้ (BG) แทน
  const saved = ($('f_aiSale')?.value || '').trim();
  if (saved) {
    const cur = {
      od: parseFloat($('f_od')?.value) || 0,
      id: parseFloat($('f_id')?.value) || 0,
      h:  parseFloat($('f_h')?.value)  || 0,
      unit: parseFloat($('f_unit')?.value) || 1,
      costPerUnit: num('f_totalCost'),
    };
    _showPricingResultModal(cur, saved, null);
    return;
  }
  Swal.fire({icon:'info', title:'ยังไม่เคยวิเคราะห์', text:'กดปุ่ม "AI เคาะราคา" เพื่อวิเคราะห์ครั้งแรก',
    background:'#0d1b2a', color:'#cce4ff', confirmButtonColor:'#4f46e5'});
}

// แสดงประวัติผลวิเคราะห์ทั้งหมด (สูงสุด 20 รายการล่าสุด) — กดดูซ้ำได้ ไม่เสียโควต้า
function showPricingHistory() {
  const hist = _getPricingHistory();
  const listHtml = hist.length ? hist.map((e, i) => {
    const m = e.result.match(/ราคาที่แนะนำ[:\s]*฿?\s*([\d,]+)/);
    const recPrice = m ? `฿${m[1]}` : '—';
    return `
    <div onclick="_showPricingResultModal(_getPricingHistory()[${i}].cur,_getPricingHistory()[${i}].result,_getPricingHistory()[${i}].time)"
      style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px;
      background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;
      padding:8px 10px;margin-bottom:6px;text-align:left">
      <div style="flex:1;min-width:0">
        <div style="font-size:.8rem;font-weight:700;color:#e2e8f0">
          OD${e.cur.od}×ID${e.cur.id}×H${e.cur.h} · ${e.cur.unit} ลูก
        </div>
        <div style="font-size:.7rem;color:#94a3b8">🕐 ${_fmtPricingDate(e.time)} · ต้นทุน ${B_(e.cur.costPerUnit)}/ลูก</div>
      </div>
      <div style="font-size:.85rem;font-weight:800;color:#a5b4fc;flex-shrink:0">${recPrice}</div>
    </div>`;
  }).join('') : '<div style="text-align:center;color:#94a3b8;font-size:.85rem;padding:16px 0">ยังไม่มีประวัติการวิเคราะห์</div>';

  Swal.fire({
    title: '📜 ประวัติ AI เคาะราคา',
    width: 480,
    html: `
      <div style="text-align:left">
        <div style="font-size:.75rem;color:#64748b;margin-bottom:10px">
          เก็บผลวิเคราะห์ล่าสุดไว้ ${PRICING_HIST_MAX} รายการ — กดรายการเพื่อดูซ้ำโดยไม่ต้องวิเคราะห์ใหม่
        </div>
        <div style="max-height:50vh;overflow-y:auto">${listHtml}</div>
      </div>`,
    background: '#0d1b2a', color: '#cce4ff',
    showConfirmButton: true, confirmButtonText: 'ปิด', confirmButtonColor: '#475569'
  });
}

// ── Pricing Analysis AI ──────────────────────────────────────────────
async function showPricingAnalysis() {
  // ── ดึงข้อมูลฟอร์ม ──────────────────────────────────
  const cur = {
    od:   parseFloat($('f_od')?.value)   || 0,
    id:   parseFloat($('f_id')?.value)   || 0,
    h:    parseFloat($('f_h')?.value)    || 0,
    unit: parseFloat($('f_unit')?.value) || 1,
    mat:  String($('f_matTop')?.value || '').trim(),
    meshOut: !!(String($('f_meshOut')?.value||'').trim()) || (parseFloat($('f_cMeshOut')?.value)||0)>0,
    meshIn:  !!(String($('f_meshIn')?.value||'').trim())  || (parseFloat($('f_cMeshIn')?.value) ||0)>0,
    costPerUnit: num('f_totalCost'),
    sellPrice: parseFloat(String($('f_sellPrice')?.value||'').replace(/,/g,'')),
  };

  // ต้นทุนรวม/ลูก (คำนวณตรงจาก updateSummaryPanel logic ถ้า f_totalCostUnit ไม่มี)
  if (!cur.costPerUnit) {
    const u = cur.unit;
    const costTop=num('f_costTop'),costBot=num('f_costBot'),cMeshOut=num('f_cMeshOut'),cMeshIn=num('f_cMeshIn');
    const cTestWaste=num('f_cTestWaste'),cOutsource=num('f_cOutsource'),cLaser=num('f_cLaser'),cPlating=num('f_cPlating');
    const cLabor=num('f_cLabor'),cMachine=num('f_cMachine'),cMold=num('f_cMold'),fixedCost=num('f_fixedCost');
    const cOther=num('f_cOther1')+num('f_cOther2')+num('f_cOther3');
    const cTransport=u>0?num('f_transport')/u:num('f_transport');
    const perUnitVar=costTop+costBot+cTestWaste+cOutsource+cMeshOut+cMeshIn+cLaser+cPlating+cLabor+cTransport+cMachine+cOther;
    cur.costPerUnit = perUnitVar + (u>0?(cMold+fixedCost)/u:(cMold+fixedCost));
  }
  const margin = cur.sellPrice>0 ? (cur.sellPrice-cur.costPerUnit)/cur.sellPrice*100 : 0;

  if (!cur.od) {
    Swal.fire({icon:'warning',title:'กรอก OD ก่อน',background:'#0a1c2e',color:'#f1f5f9'}); return;
  }
  if (!AI_KEYS[AI_PROVIDER]) {
    Swal.fire({icon:'warning',title:'ยังไม่มี API Key',text:'ตั้งค่าใน แท็บ API',background:'#0a1c2e',color:'#f1f5f9'}); return;
  }

  // ── คำนวณ stats กลุ่มต่างๆ (เหมือน _updatePricingInsight) ───────
  const cutoff3y = new Date(); cutoff3y.setFullYear(cutoff3y.getFullYear()-3);
  const cutoff1y = new Date(); cutoff1y.setFullYear(cutoff1y.getFullYear()-1);
  const pool = (_dtCache||[]).filter(r => {
    const iso=thaiShortToIso(String(r[DT.date]||''));
    if(iso&&new Date(iso)<cutoff3y) return false;
    return String(r[DT.status]||'').trim()!=='ยกเลิก';
  });
  const scored = pool.map(r=>({r,sc:_piScore(r,cur)})).filter(x=>x.sc>0);
  const grpA = scored.filter(x=>x.sc>=65).map(x=>x.r);
  const grpB = scored.filter(x=>x.sc>=35&&x.sc<65).map(x=>x.r);
  const grpC = scored.filter(x=>x.sc>=15&&x.sc<35).map(x=>x.r);

  const _avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
  const grpInfo = rows => {
    if(!rows.length) return null;
    const px=rows.map(r=>parseFloat(r[DT.sellPrice])||0).filter(v=>v>0);
    const mx=rows.map(r=>parseFloat(r[DT.totalCost])||0).filter(v=>v>0);
    const mg=rows.map(r=>{const sp=parseFloat(r[DT.sellPrice])||0,tc=parseFloat(r[DT.totalCost])||0;return sp&&tc?(sp-tc)/sp*100:null;}).filter(v=>v!==null);
    const wins=rows.filter(r=>['ผ่าน','อนุมัติ'].includes(String(r[DT.status]||'').trim())).length;
    const recentPx=rows.filter(r=>{const d=thaiShortToIso(String(r[DT.date]||''));return d&&new Date(d)>=cutoff1y;}).map(r=>parseFloat(r[DT.sellPrice])||0).filter(v=>v>0);
    const olderPx=rows.filter(r=>{const d=thaiShortToIso(String(r[DT.date]||''));const dt=d&&new Date(d);return dt&&dt<cutoff1y;}).map(r=>parseFloat(r[DT.sellPrice])||0).filter(v=>v>0);
    const spPct=cur.sellPrice>0&&px.length>1?(px.filter(v=>v<cur.sellPrice).length/px.length)*100:null;
    let trend='ข้อมูลน้อย';
    if(recentPx.length&&olderPx.length){const t=(_avg(recentPx)-_avg(olderPx))/_avg(olderPx)*100;trend=t>3?`ขึ้น +${t.toFixed(1)}%`:t<-3?`ลง ${t.toFixed(1)}%`:'คงที่';}
    return {count:rows.length,avgP:px.length?_avg(px):0,minP:px.length?Math.min(...px):0,maxP:px.length?Math.max(...px):0,avgC:mx.length?_avg(mx):0,avgMgn:mg.length?_avg(mg):0,winRate:rows.length?wins/rows.length*100:0,trend,spPct};
  };
  const sA=grpInfo(grpA), sB=grpInfo(grpB), sC=grpInfo(grpC);
  const best = sA||sB||sC;

  // ── margin options จากฟอร์ม ──────────────────────────
  const mOpts=[40,50,60,100,200].map(pct=>{
    const p=cur.costPerUnit*(1+pct/100);
    return `+${pct}% → ฿${Math.round(p).toLocaleString('th-TH')} (Margin ${(pct/(1+pct/100)).toFixed(1)}%)`;
  }).join('\n');

  // ── สร้าง prompt ─────────────────────────────────────
  const B = n => '฿'+Math.round(n).toLocaleString('th-TH');
  const P1= n => n.toFixed(1)+'%';
  const grpTxt = (label, s) => !s ? `${label}: ไม่มีข้อมูล` :
    `${label} (${s.count} งาน):
      ราคา: ต่ำสุด ${B(s.minP)} / เฉลี่ย ${B(s.avgP)} / สูงสุด ${B(s.maxP)}
      Win rate: ${P1(s.winRate)} | Margin เฉลี่ย: ${P1(s.avgMgn)} | ต้นทุนเฉลี่ย: ${B(s.avgC)}
      แนวโน้ม 12 เดือน: ${s.trend}
      ${s.spPct!==null?`ราคาเสนอปัจจุบัน (${B(cur.sellPrice)}) อยู่ที่ Percentile ${s.spPct.toFixed(0)}th ของกลุ่มนี้`:''}`;

  const meshDesc = [cur.meshOut?'ตะแกรงนอก':'', cur.meshIn?'ตะแกรงใน':''].filter(Boolean).join('+') || 'ไม่มีตะแกรง';

  const prompt = `คุณเป็นที่ปรึกษาราคาสินค้าชิ้นส่วนโลหะอุตสาหกรรม

ข้อมูลงาน:
- ขนาด: OD${cur.od}×ID${cur.id}×H${cur.h} mm | จำนวน: ${cur.unit} ลูก
- วัตถุดิบ: ${cur.mat||'ไม่ระบุ'} | ${meshDesc}
- ต้นทุน/ลูก: ${B(cur.costPerUnit)}
- ราคาเสนอปัจจุบัน: ${cur.sellPrice>0?B(cur.sellPrice)+` (Margin ${P1(margin)})`:'ยังไม่กำหนด'}

ข้อมูลประวัติงานที่คล้ายกัน (3 ปีย้อนหลัง):
${grpTxt('กลุ่ม A เหมือนมาก', sA)}
${grpTxt('กลุ่ม B คล้ายกัน', sB)}
${grpTxt('กลุ่ม C ขนาดใกล้เคียง', sC)}

ตอบเป็นภาษาไทย กระชับ แค่ 3 บรรทัด:
1. ราคาที่แนะนำ: ฿_____  (Margin ___%)
2. เหตุผล: (1 ประโยค)
3. ความเสี่ยง: (1 ประโยค ถ้ามี)`;

  // ── แสดง loading modal ──────────────────────────────
  Swal.fire({
    title: '🤖 AI กำลังเคาะราคา…',
    html: '<div style="color:#94a3b8;font-size:.85rem">รอสักครู่…</div>',
    background: '#0d1b2a', color: '#cce4ff',
    allowOutsideClick: false, showConfirmButton: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const result = await callAiText(prompt, 400);
    const _now = new Date().toISOString();
    _savePricingResult(cur, result);
    // เก็บผลวิเคราะห์ล่าสุดไว้แนบกับ "งานนี้" เพื่อบันทึกลง DATA (คอลัมน์ BG = AI Sale)
    if ($('f_aiSale')) $('f_aiSale').value = result;
    if ($('aiSaleHint')) $('aiSaleHint').style.display = 'block';
    _showPricingResultModal(cur, result, _now);
  } catch(e) {
    Swal.fire({ icon:'error', title:'AI ไม่ตอบสนอง', text: e.message,
      background:'#0d1b2a', color:'#f1f5f9' });
  }
}

async function callAiReader(b64, mime) {
  const k = AI_KEYS[AI_PROVIDER];
  if (!k) throw new Error('ยังไม่มี API Key สำหรับ ' + AI_PROVIDER + ' — ตั้งค่าใน แท็บ API');

  const prompt = `คุณคือผู้เชี่ยวชาญอ่านแบบงานผลิต ดึงข้อมูลจากภาพ:
- ชื่องาน/ประเภทงาน → jobName
- วัสดุ (เช่น ทองเหลือง, สเตนเลส, อลูมิเนียม) → material
- เกรด/สเปค → specMat
- OD (mm) → od, ID (mm) → id, ความสูง H (mm) → h
- จำนวน/ชิ้น → qty
- หมายเหตุสำคัญ → note
ตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น:
{"jobName":"","material":"","specMat":"","od":"","id":"","h":"","qty":"","note":""}`;

  if (AI_PROVIDER === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': k, 'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 512,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'Anthropic error');
    const txt = d.content?.[0]?.text || '{}';
    return JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] || '{}');

  } else if (AI_PROVIDER === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + k, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini', max_tokens: 512,
        messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + b64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'OpenAI error');
    const txt = d.choices?.[0]?.message?.content || '{}';
    return JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] || '{}');

  } else { // gemini
    const geminiModel = localStorage.getItem('ptts_gemini_model') || 'gemini-2.0-flash';
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${k}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [
          { inline_data: { mime_type: mime, data: b64 } },
          { text: prompt }
        ]}]})
      }
    );
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'Gemini error');
    const txt = d.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] || '{}');
  }
}

function showAiConfirm(p) {
  const rows = [
    ['ชื่องาน / ประเภท', p.jobName || '—'],
    ['วัสดุ',           p.material || '—'],
    ['เกรด / สเปค',    p.specMat  || '—'],
    ['OD (mm)',         p.od       || '—'],
    ['ID (mm)',         p.id       || '—'],
    ['H  (mm)',         p.h        || '—'],
    ['จำนวน',           p.qty      || '—'],
    ['หมายเหตุ',        p.note     || '—'],
  ];
  const tableHtml = rows.map(([k,v]) =>
    `<tr><td style="text-align:right;padding:3px 10px;color:#8b8aaa;font-size:.82rem;white-space:nowrap">${k}</td>
     <td style="padding:3px 10px;color:#d4cfe8;font-size:.82rem"><b>${v}</b></td></tr>`
  ).join('');
  Swal.fire({
    title: '📋 ข้อมูลที่อ่านได้',
    html: `<table style="margin:0 auto;border-collapse:collapse">${tableHtml}</table>
      <div style="margin-top:10px;font-size:.78rem;color:#8b8aaa">ตรวจสอบแล้วกด ✅ ใช้ข้อมูลนี้</div>`,
    background: '#0d1b2a', color: '#cce4ff',
    showCancelButton: true,
    confirmButtonColor: '#1d65cc', confirmButtonText: '✅ ใช้ข้อมูลนี้',
    cancelButtonColor: '#6b7280', cancelButtonText: 'ยกเลิก',
  }).then(res => { if (res.isConfirmed) fillFromAi(p); });
}

function fillFromAi(p) {
  const setVal = (id, v) => { const el=$(id); if(el && v) el.value=v; };
  if (p.material) {
    const sel = $('f_material');
    if (sel) {
      const opt = Array.from(sel.options).find(o =>
        o.text.toLowerCase().includes(p.material.toLowerCase()) ||
        o.value.toLowerCase().includes(p.material.toLowerCase()));
      if (opt) sel.value = opt.value;
    }
  }
  if (p.specMat) {
    const sel = $('f_specMat');
    if (sel) {
      const opt = Array.from(sel.options).find(o => o.text.includes(p.specMat));
      if (opt) sel.value = opt.value;
    }
  }
  setVal('f_od',     p.od);
  setVal('f_id',     p.id);
  setVal('f_h',      p.h);
  setVal('f_unit',   p.qty);
  setVal('f_remark', p.note);
  // default ฝาบน/ล่าง = SPCC-0.6 ถ้าว่าง
  ['f_matTop','f_matBot'].forEach(id => {
    const el = $(id); if (el && !el.value) el.value = 'SPCC-0.6';
  });
  if (p.od || p.id || p.h) updateSize();
  calcAll();
  Swal.fire({icon:'success',title:'เติมข้อมูลแล้ว ✅',
    background:'#0d1b2a',color:'#cce4ff',
    timer:1600,showConfirmButton:false,toast:true,position:'top-end'});
}

// ── Text Reader (ข้อความลูกค้า) ──────────────────────────────────
function openTextReader() {
  const k = AI_KEYS[AI_PROVIDER];
  if (!k) {
    Swal.fire({icon:'warning',title:'ยังไม่มี API Key',
      text:'ตั้งค่า API Key ในแท็บ ตั้งค่า ก่อน',
      background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#3b82f6'}); return;
  }
  Swal.fire({
    title: '📝 วางข้อความลูกค้า',
    html: `<div style="display:flex;justify-content:flex-end;margin-bottom:6px">
        <button type="button" id="swal-paste-btn"
          style="padding:7px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.15);
          background:#475569;color:#fff;font-family:Sarabun,sans-serif;font-size:.8rem;
          font-weight:600;cursor:pointer">📋 วาง</button>
      </div>
      <textarea id="swal-txt" rows="10" placeholder="วางข้อความขอราคาจากลูกค้าที่นี่..."
      style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);
      background:rgba(8,16,28,.8);color:#cce4ff;font-family:Sarabun,sans-serif;font-size:.85rem;
      resize:vertical;outline:none;box-sizing:border-box"></textarea>`,
    background:'#0d1b2a', color:'#cce4ff',
    allowOutsideClick:false,
    showCancelButton:true, confirmButtonText:'🤖 วิเคราะห์',
    confirmButtonColor:'#2563eb', cancelButtonColor:'#6b7280', cancelButtonText:'ยกเลิก',
    didOpen: () => {
      const btn = document.getElementById('swal-paste-btn');
      if (btn) {
        btn.addEventListener('click', async () => {
          try {
            const text = await navigator.clipboard.readText();
            const ta = document.getElementById('swal-txt');
            if (ta && text) ta.value = text;
          } catch (err) {
            Swal.showValidationMessage('วางไม่ได้ — อนุญาตการเข้าถึงคลิปบอร์ดก่อน หรือวางด้วย Ctrl+V ในกล่องข้อความ');
          }
        });
      }
    },
    preConfirm: () => {
      const v = document.getElementById('swal-txt').value.trim();
      if (!v) { Swal.showValidationMessage('กรุณาวางข้อความก่อน'); return false; }
      return v;
    }
  }).then(async res => {
    if (!res.isConfirmed) return;
    Swal.fire({title:'🤖 กำลังวิเคราะห์...',background:'#0d1b2a',color:'#cce4ff',
      allowOutsideClick:false,showConfirmButton:false,
      didOpen:()=>Swal.showLoading()});
    try {
      const parsed = await _callAiTextReader(res.value);
      Swal.close();
      showTextAiConfirm(parsed);
    } catch(e) {
      Swal.fire({icon:'error',title:'เกิดข้อผิดพลาด',text:e.message,
        background:'#0d1b2a',color:'#cce4ff',confirmButtonColor:'#3b82f6'});
    }
  });
}

async function _callAiTextReader(rawText) {
  const k = AI_KEYS[AI_PROVIDER];
  if (!k) throw new Error('ยังไม่มี API Key');
  // Build MAT reference
  const meshRef = _localMatMesh.map(m => m.code + (m.name ? ' = '+m.name : '')).join('\n') || '(ยังไม่มีข้อมูล)';
  const flapRef = _localMatFlap.map(m => m.code + (m.name ? ' = '+m.name : '')).join('\n') || '(ยังไม่มีข้อมูล)';
  const prompt = `คุณคือผู้เชี่ยวชาญอ่านข้อความขอราคาชิ้นงานกรองอุตสาหกรรมไทย

รายการวัตถุดิบตะแกรง (Mesh) ในระบบ:
${meshRef}

รายการวัตถุดิบฝา (Flap) ในระบบ:
${flapRef}

ข้อความจากลูกค้า:
${rawText}

วิเคราะห์และดึงข้อมูล จับคู่ตะแกรงนอก/ในกับ "code" ที่ตรงที่สุดจากรายการด้านบน
(เช่น "รูกลม 5mm" → หา code ที่มี "5" และ "กลม" ในชื่อ, "CT-7" → code "CT-7")
- workType: แบบงาน สรุปสั้นๆ (เช่น หัว-ท้าย ทะลุ / ก้นปิดสโลป / ฝาเรียบ)
- od: OD เป็น mm ตัวเลขเท่านั้น
- id: ID เป็น mm ตัวเลขเท่านั้น
- h: H เป็น mm ตัวเลขเท่านั้น
- meshOut: รหัสตะแกรงนอก (code จากรายการ หรือ "" ถ้าไม่มี)
- meshIn: รหัสตะแกรงใน (code จากรายการ หรือ "" ถ้าไม่มี)
- qty: จำนวน ตัวเลขเท่านั้น
- note: หมายเหตุอื่นๆ สำคัญ (เช่น มีโอริง, ปากเบิด, เจาะรู ฯลฯ)

ตอบเป็น JSON เท่านั้น:
{"workType":"","od":"","id":"","h":"","meshOut":"","meshIn":"","qty":"","note":""}`;

  if (AI_PROVIDER === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'x-api-key':k,'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true','content-type':'application/json'},
      body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:512,
        messages:[{role:'user',content:prompt}]})
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message||'Anthropic error');
    return JSON.parse((d.content?.[0]?.text||'{}').match(/\{[\s\S]*\}/)?.[0]||'{}');
  } else if (AI_PROVIDER === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{'Authorization':'Bearer '+k,'content-type':'application/json'},
      body:JSON.stringify({model:'gpt-4o-mini',max_tokens:512,
        messages:[{role:'user',content:prompt}]})
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message||'OpenAI error');
    return JSON.parse((d.choices?.[0]?.message?.content||'{}').match(/\{[\s\S]*\}/)?.[0]||'{}');
  } else { // gemini — auto-fallback
    const _fallbacks = ['gemini-2.0-flash','gemini-2.0-flash-001','gemini-1.5-flash','gemini-1.5-pro','gemini-2.5-flash'];
    const _cur = localStorage.getItem('ptts_gemini_model')||'gemini-2.0-flash';
    const _order = [_cur, ..._fallbacks.filter(m=>m!==_cur)];
    let lastErr = '';
    for (const model of _order) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${k}`,
        {method:'POST',headers:{'content-type':'application/json'},
         body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})});
      const d = await r.json();
      if (r.ok) {
        if (model !== _cur) {
          localStorage.setItem('ptts_gemini_model', model);
          Swal.fire({ toast:true, position:'top-end', icon:'info', showConfirmButton:false, timer:3500,
            title:`⚡ สลับ model → ${model}`, text:`Quota ${_cur} หมด ใช้ ${model} แทน` });
        }
        return JSON.parse((d.candidates?.[0]?.content?.parts?.[0]?.text||'{}').match(/\{[\s\S]*\}/)?.[0]||'{}');
      }
      const msg = d.error?.message||'';
      lastErr = msg;
      if (!msg.toLowerCase().includes('quota') && !msg.toLowerCase().includes('rate')) throw new Error(msg);
    }
    throw new Error('Quota หมดทุก model: ' + lastErr);
  }
}

function showTextAiConfirm(p) {
  const inp = (id,val,ph='') =>
    `<input id="tc_${id}" value="${val||''}" placeholder="${ph}"
      style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.15);
      background:rgba(8,16,28,.8);color:#cce4ff;font-family:Sarabun,sans-serif;font-size:.82rem;
      box-sizing:border-box">`;
  // Build mesh select options
  const meshOpts = (cur) => '<option value="">— ไม่มี —</option>' +
    _localMatMesh.map(m => `<option value="${m.code}" ${m.code===cur?'selected':''}>${m.code}${m.name?' — '+m.name:''}</option>`).join('');
  const sel = (id,cur) =>
    `<select id="tc_${id}" style="width:100%;padding:5px 8px;border-radius:6px;
      border:1px solid rgba(255,255,255,.15);background:rgba(8,16,28,.8);
      color:#cce4ff;font-family:Sarabun,sans-serif;font-size:.82rem">${meshOpts(cur)}</select>`;
  const row = (lbl,content) =>
    `<tr><td style="padding:4px 8px;color:#8b8aaa;font-size:.78rem;white-space:nowrap;text-align:right;vertical-align:middle">${lbl}</td>
     <td style="padding:4px 8px">${content}</td></tr>`;
  Swal.fire({
    title:'📋 ยืนยันข้อมูล',
    html:`<table style="width:100%;border-collapse:collapse;text-align:left">
      ${row('แบบงาน',inp('workType',p.workType,'หัว-ท้าย ทะลุ / ก้นปิด...'))}
      ${row('OD (mm)',inp('od',p.od))}
      ${row('ID (mm)',inp('id',p.id))}
      ${row('H (mm)',inp('h',p.h))}
      ${row('ตะแกรงนอก',sel('meshOut',p.meshOut))}
      ${row('ตะแกรงใน',sel('meshIn',p.meshIn))}
      ${row('จำนวน',inp('qty',p.qty))}
      ${row('หมายเหตุ',inp('note',p.note,'โอริง, เจาะรู, ปากเบิด...'))}
    </table>
    <div style="margin-top:8px;font-size:.74rem;color:#64748b">แก้ไขได้ก่อนกด ✅</div>`,
    background:'#0d1b2a', color:'#cce4ff', width:'480px',
    showCancelButton:true,
    confirmButtonText:'✅ ลงฟอร์ม', confirmButtonColor:'#1d65cc',
    cancelButtonText:'ยกเลิก', cancelButtonColor:'#6b7280',
    preConfirm: () => ({
      workType: document.getElementById('tc_workType')?.value||'',
      od:       document.getElementById('tc_od')?.value||'',
      id:       document.getElementById('tc_id')?.value||'',
      h:        document.getElementById('tc_h')?.value||'',
      meshOut:  document.getElementById('tc_meshOut')?.value||'',
      meshIn:   document.getElementById('tc_meshIn')?.value||'',
      qty:      document.getElementById('tc_qty')?.value||'',
      note:     document.getElementById('tc_note')?.value||'',
    })
  }).then(res => { if (res.isConfirmed) fillFromTextAi(res.value); });
}

function fillFromTextAi(p) {
  const set = (id,v) => { const el=$(id); if(el && v!==undefined && v!=='') el.value=v; };
  set('f_od', p.od); set('f_id', p.id); set('f_h', p.h); set('f_unit', p.qty);
  set('f_remark', p.note);
  // แบบงาน
  if (p.workType) {
    const wSel = $('f_workType'), wDl = $('workTypeList');
    if (wSel) {
      const opt = wDl ? Array.from(wDl.options).find(o =>
        o.value.includes(p.workType) || p.workType.includes(o.value)) : null;
      wSel.value = opt ? opt.value : p.workType;
    }
  }
  // ตะแกรง
  if (p.meshOut) { const s=$('f_meshOut'); if(s) s.value=p.meshOut; }
  if (p.meshIn)  { const s=$('f_meshIn');  if(s) s.value=p.meshIn;  }
  // default ฝาบน/ล่าง = SPCC-0.6 ถ้าว่าง
  ['f_matTop','f_matBot'].forEach(id => {
    const el = $(id); if (el && !el.value) el.value = 'SPCC-0.6';
  });
  if (p.od||p.id||p.h) updateSize();
  calcAll();
  Swal.fire({icon:'success',title:'ลงฟอร์มแล้ว ✅',
    background:'#0d1b2a',color:'#cce4ff',
    timer:1600,showConfirmButton:false,toast:true,position:'top-end'});
}
