
  console.log('[OpenCC Clean] OpenCC 載入成功');

  const STORAGE_KEY = 'opencc_auto_mode';

  const t = {
    INPUT_TRAD: '輸入繁體',
    INPUT_SIMP: '输入简体',
    LAST_TRAD: '本樓訊息繁體',
    LAST_SIMP: '本楼讯息简体'
  };

  const e = 'th-custom-extension-menu-item';
  const n = 'OpenCC menu';

  let a = null;
  let i = null;

  const o = async () => {
    if (a && i) return;
    const module = await import('https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/+esm');
    const convTrad = module.Converter({ from: 'cn', to: 't' });
    const convSimp = module.Converter({ from: 't', to: 'cn' });
    a = (text) => convSimp(text);
    i = (text) => convTrad(text);
  };

  const s = (text, mode) => {
    if (mode === 'traditional') return i?.(text) ?? text;
    if (mode === 'simplified') return a?.(text) ?? text;
    return text;
  };

  const r = async (mode) => {
    const input = $('#send_textarea');
    if (!input.length) return toastr.error('找不到輸入框');
    const val = String(input.val() ?? '');
    if (!val) return;
    await o();
    input.val(s(val, mode)).trigger('input').trigger('focus');
    toastr.success(mode === 'traditional' ? '已轉成繁體' : '已转成简体');
  };

  const c = async (msgId, mode) => {
    const msgs = getChatMessages(msgId);
    if (!msgs?.[0]) return;
    const msg = String(msgs[0].message ?? '');
    if (!msg) return;
    await o();
    const newMsg = s(msg, mode);
    if (newMsg !== msg) {
      await setChatMessages([{message_id: msgId, message: newMsg}], {refresh: 'affected'});
      toastr.success(mode === 'traditional' ? '本樓已轉繁體' : '本楼已转简体');
    }
  };

  appendInexistentScriptButtons(Object.values(t).map(name => ({name, visible:true})));

  eventOn(getButtonEvent(t.INPUT_TRAD), () => r('traditional'));
  eventOn(getButtonEvent(t.INPUT_SIMP), () => r('simplified'));
  eventOn(getButtonEvent(t.LAST_TRAD), () => c(getLastMessageId(), 'traditional'));
  eventOn(getButtonEvent(t.LAST_SIMP), () => c(getLastMessageId(), 'simplified'));

  const m = [
    {id:'auto-translate-receive-output-checkbox-t', name:'自動將回覆訊息轉成繁體', state:false, type:'receive'},
    {id:'auto-translate-receive-output-checkbox-s', name:'自动将回覆讯息转成简体', state:false, type:'receive'}
  ];

  const h = id => m.find(e => e.id === id);
  const g = id => h(id)?.state ?? false;
  const f = (id, state) => { const item = h(id); if (item) item.state = state; };

  const loadSetting = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.t === 'boolean')
        f('auto-translate-receive-output-checkbox-t', data.t);
      if (typeof data.s === 'boolean')
        f('auto-translate-receive-output-checkbox-s', data.s);
    } catch(e){}
  };

  const saveSetting = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      t: g('auto-translate-receive-output-checkbox-t'),
      s: g('auto-translate-receive-output-checkbox-s')
    }));
  };

  const u = (id, others, msg) => function() {
    const checked = Boolean(this.checked);
    f(id, checked);
    if (checked) others.forEach(o => f(o,false));
    saveSetting();
    toastr.success(`${msg}：${checked?'開啟':'關閉'}`);
  };

const w = () => {
  loadSetting();

  $('.th-custom-popup-ui').remove();
  $('.opencc-overlay').remove();

  const checkboxes = m.map(item => `
    <div class="flex-container alignitemscenter"
         style="gap:8px; margin-bottom:8px;">
      <input type="checkbox" id="${item.id}"
        ${item.state ? 'checked' : ''} />
      <label for="${item.id}">${item.name}</label>
    </div>
  `).join('');

  // ⭐ 恢復透明遮罩
  const overlay = $(`
    <div class="opencc-overlay"
      style="
        position:fixed;
        top:0;
        left:0;
        width:100%;
        height:100%;
        background:transparent;
        z-index:999998;
      ">
    </div>
  `);

  $('body').append(overlay);

  // ⭐ 恢復美化面板
  const popup = $(`
    <div class="th-custom-popup-ui"
      style="
        position:fixed;
        top:50%;
        left:50%;
        transform:translate(-50%,-50%);
        width:380px;
        max-height:80vh;
        overflow-y:auto;
        background:#2c2c2e;
        color:#eee;
        padding:20px;
        border-radius:12px;
        z-index:999999;
        box-shadow:0 0 30px rgba(0,0,0,0.7);
      ">
      <h3 style="
        margin:0 0 15px;
        font-size:1.5em;
        text-align:center;
      ">
        OpenCC Setting
      </h3>

      ${checkboxes}

      <button type="button"
        class="menu_button th-custom-popup-close"
        style="
          margin-top:20px;
          width:100%;
          padding:10px;
          background:#f44336;
          color:white;
          border:none;
          border-radius:6px;
          cursor:pointer;
          font-size:1.1em;
        ">
        Close
      </button>
    </div>
  `);

  $('body').append(popup);

  // ⭐ 點空白關閉
  overlay.on('click', () => {
    popup.remove();
    overlay.remove();
  });

  popup.find('.th-custom-popup-close').on('click', () => {
    popup.remove();
    overlay.remove();
  });

  // ⭐ 防止點面板時冒泡
  popup.on('click', e => e.stopPropagation());

  // ⭐ 綁 checkbox
  m.forEach(item => {
    popup.find(`#${item.id}`).on(
      'change',
      u(
        item.id,
        m.filter(i => i.type === item.type && i.id !== item.id).map(i => i.id),
        item.name
      )
    );
  });
};

fetch('https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.min.js')
.then(r => r.text())
.then(openccCode => {
  eval(openccCode);
  console.log('[OpenCC Clean] OpenCC 載入成功');

  const STORAGE_KEY = 'opencc_auto_mode';

  const t = {
    INPUT_TRAD: '輸入繁體',
    INPUT_SIMP: '输入简体',
    LAST_TRAD: '本樓訊息繁體',
    LAST_SIMP: '本楼讯息简体'
  };

  const e = 'th-custom-extension-menu-item';
  const n = 'OpenCC menu';

  let a = null;
  let i = null;

  const o = async () => {
    if (a && i) return;
    const module = await import('https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/+esm');
    const convTrad = module.Converter({ from: 'cn', to: 't' });
    const convSimp = module.Converter({ from: 't', to: 'cn' });
    a = (text) => convSimp(text);
    i = (text) => convTrad(text);
  };

  const s = (text, mode) => {
    if (mode === 'traditional') return i?.(text) ?? text;
    if (mode === 'simplified') return a?.(text) ?? text;
    return text;
  };

  const r = async (mode) => {
    const input = $('#send_textarea');
    if (!input.length) return toastr.error('找不到輸入框');
    const val = String(input.val() ?? '');
    if (!val) return;
    await o();
    input.val(s(val, mode)).trigger('input').trigger('focus');
    toastr.success(mode === 'traditional' ? '已轉成繁體' : '已转成简体');
  };

  const c = async (msgId, mode) => {
    const msgs = getChatMessages(msgId);
    if (!msgs?.[0]) return;
    const msg = String(msgs[0].message ?? '');
    if (!msg) return;
    await o();
    const newMsg = s(msg, mode);
    if (newMsg !== msg) {
      await setChatMessages([{message_id: msgId, message: newMsg}], {refresh: 'affected'});
      toastr.success(mode === 'traditional' ? '本樓已轉繁體' : '本楼已转简体');
    }
  };

  appendInexistentScriptButtons(Object.values(t).map(name => ({name, visible:true})));

  eventOn(getButtonEvent(t.INPUT_TRAD), () => r('traditional'));
  eventOn(getButtonEvent(t.INPUT_SIMP), () => r('simplified'));
  eventOn(getButtonEvent(t.LAST_TRAD), () => c(getLastMessageId(), 'traditional'));
  eventOn(getButtonEvent(t.LAST_SIMP), () => c(getLastMessageId(), 'simplified'));

  const m = [
    {id:'auto-translate-receive-output-checkbox-t', name:'自動將回覆訊息轉成繁體', state:false, type:'receive'},
    {id:'auto-translate-receive-output-checkbox-s', name:'自动将回覆讯息转成简体', state:false, type:'receive'}
  ];

  const h = id => m.find(e => e.id === id);
  const g = id => h(id)?.state ?? false;
  const f = (id, state) => { const item = h(id); if (item) item.state = state; };

  const loadSetting = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.t === 'boolean')
        f('auto-translate-receive-output-checkbox-t', data.t);
      if (typeof data.s === 'boolean')
        f('auto-translate-receive-output-checkbox-s', data.s);
    } catch(e){}
  };

  const saveSetting = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      t: g('auto-translate-receive-output-checkbox-t'),
      s: g('auto-translate-receive-output-checkbox-s')
    }));
  };

  const u = (id, others, msg) => function() {
    const checked = Boolean(this.checked);
    f(id, checked);
    if (checked) others.forEach(o => f(o,false));
    saveSetting();
    toastr.success(`${msg}：${checked?'開啟':'關閉'}`);
  };

const w = () => {
  loadSetting();

  $('.th-custom-popup-ui').remove();
  $('.opencc-overlay').remove();

  const checkboxes = m.map(item => `
    <div class="flex-container alignitemscenter"
         style="gap:8px; margin-bottom:8px;">
      <input type="checkbox" id="${item.id}"
        ${item.state ? 'checked' : ''} />
      <label for="${item.id}">${item.name}</label>
    </div>
  `).join('');

  // ⭐ 恢復透明遮罩
  const overlay = $(`
    <div class="opencc-overlay"
      style="
        position:fixed;
        top:0;
        left:0;
        width:100%;
        height:100%;
        background:transparent;
        z-index:999998;
      ">
    </div>
  `);

  $('body').append(overlay);

  // ⭐ 恢復美化面板
  const popup = $(`
    <div class="th-custom-popup-ui"
      style="
        position:fixed;
        top:50%;
        left:50%;
        transform:translate(-50%,-50%);
        width:380px;
        max-height:80vh;
        overflow-y:auto;
        background:#2c2c2e;
        color:#eee;
        padding:20px;
        border-radius:12px;
        z-index:999999;
        box-shadow:0 0 30px rgba(0,0,0,0.7);
      ">
      <h3 style="
        margin:0 0 15px;
        font-size:1.5em;
        text-align:center;
      ">
        OpenCC Setting
      </h3>

      ${checkboxes}

      <button type="button"
        class="menu_button th-custom-popup-close"
        style="
          margin-top:20px;
          width:100%;
          padding:10px;
          background:#f44336;
          color:white;
          border:none;
          border-radius:6px;
          cursor:pointer;
          font-size:1.1em;
        ">
        Close
      </button>
    </div>
  `);

  $('body').append(popup);

  // ⭐ 點空白關閉
  overlay.on('click', () => {
    popup.remove();
    overlay.remove();
  });

  popup.find('.th-custom-popup-close').on('click', () => {
    popup.remove();
    overlay.remove();
  });

  // ⭐ 防止點面板時冒泡
  popup.on('click', e => e.stopPropagation());

  // ⭐ 綁 checkbox
  m.forEach(item => {
    popup.find(`#${item.id}`).on(
      'change',
      u(
        item.id,
        m.filter(i => i.type === item.type && i.id !== item.id).map(i => i.id),
        item.name
      )
    );
  });
};

const y = () => {
  if (document.getElementById(e)) return;

  const menu = $('#extensionsMenu');
  if (!menu.length) return;

  const list = menu.find('.list-group').first().length
    ? menu.find('.list-group').first()
    : menu;

  const btn = $(`
    <a id="${e}" class="list-group-item" href="javascript:void(0)">
      <i class="fa-solid fa-language"></i>
      ${n}
    </a>
  `);

  btn.on('click', w);
  list.append(btn);
};

  y();
  loadSetting();

  const observer = new MutationObserver(y);
  observer.observe(document.body,{childList:true,subtree:true});

  eventOn(tavern_events.MESSAGE_RECEIVED, async (msgId)=>{
    if(msgId!==getLastMessageId()) return;

    const trad = g('auto-translate-receive-output-checkbox-t');
    const simp = g('auto-translate-receive-output-checkbox-s');

    const mode = trad?'traditional':simp?'simplified':null;
    if(!mode) return;

    await o();

    const lastId = getLastMessageId();
    const msgs = getChatMessages(lastId);
    if(!msgs?.[0]) return;

    const msg = String(msgs[0].message||'');
    const newMsg = s(msg, mode);

    if(newMsg!==msg){
      await setChatMessages([{message_id:lastId,message:newMsg}],{refresh:'affected'});
      toastr.success(mode==='traditional'
        ? '已將最新回覆轉為繁體'
        : '已將最新回覆轉為簡體');
    }
  });

  console.log('[OpenCC Final] 腳本完成初始化');
});

  y();
  loadSetting();

  const observer = new MutationObserver(y);
  observer.observe(document.body,{childList:true,subtree:true});

  eventOn(tavern_events.MESSAGE_RECEIVED, async (msgId)=>{
    if(msgId!==getLastMessageId()) return;

    const trad = g('auto-translate-receive-output-checkbox-t');
    const simp = g('auto-translate-receive-output-checkbox-s');

    const mode = trad?'traditional':simp?'simplified':null;
    if(!mode) return;

    await o();

    const lastId = getLastMessageId();
    const msgs = getChatMessages(lastId);
    if(!msgs?.[0]) return;

    const msg = String(msgs[0].message||'');
    const newMsg = s(msg, mode);

    if(newMsg!==msg){
      await setChatMessages([{message_id:lastId,message:newMsg}],{refresh:'affected'});
      toastr.success(mode==='traditional'
        ? '已將最新回覆轉為繁體'
        : '已將最新回覆轉為簡體');
    }
  });

  console.log('[OpenCC Final] 腳本完成初始化');
