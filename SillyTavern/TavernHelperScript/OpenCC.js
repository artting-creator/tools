
  console.log('[OpenCC Final] OpenCC 載入成功');

  const STORAGE_KEY = 'opencc_auto_mode';

  const t = {
    INPUT_TRAD: '輸入繁體',
    INPUT_SIMP: '输入简体',
    LAST_TRAD: '本樓訊息繁體',
    LAST_SIMP: '本楼讯息简体'
  };

  const MENU_ID = 'th-custom-extension-menu-item';
  const MENU_NAME = 'OpenCC';

  let convSimp = null;
  let convTrad = null;

  /* =========================
      轉換初始化
  ========================== */

  const ensureConverter = async () => {
    if (convSimp && convTrad) return;

    const module = await import('https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/+esm');
    convTrad = module.Converter({ from: 'cn', to: 't' });
    convSimp = module.Converter({ from: 't', to: 'cn' });
  };

  const convert = (text, mode) => {
    if (mode === 'traditional') return convTrad?.(text) ?? text;
    if (mode === 'simplified') return convSimp?.(text) ?? text;
    return text;
  };

  /* =========================
      四個按鈕功能
  ========================== */

  const convertInput = async (mode) => {
    const input = $('#send_textarea');
    if (!input.length) return toastr.error('找不到輸入框');

    const val = String(input.val() ?? '');
    if (!val) return;

    await ensureConverter();
    input.val(convert(val, mode)).trigger('input').trigger('focus');

    toastr.success(mode === 'traditional'
      ? '已轉成繁體'
      : '已转成简体');
  };

  const convertLastMessage = async (msgId, mode) => {
    const msgs = getChatMessages(msgId);
    if (!msgs?.[0]) return;

    const msg = String(msgs[0].message ?? '');
    if (!msg) return;

    await ensureConverter();
    const newMsg = convert(msg, mode);

    if (newMsg !== msg) {
      await setChatMessages(
        [{ message_id: msgId, message: newMsg }],
        { refresh: 'affected' }
      );

      toastr.success(mode === 'traditional'
        ? '本樓已轉繁體'
        : '本楼已转简体');
    }
  };

  /* =========================
      建立四個轉換按鈕
  ========================== */

  appendInexistentScriptButtons(
    Object.values(t).map(name => ({ name, visible: true }))
  );

  eventOn(getButtonEvent(t.INPUT_TRAD), () => convertInput('traditional'));
  eventOn(getButtonEvent(t.INPUT_SIMP), () => convertInput('simplified'));
  eventOn(getButtonEvent(t.LAST_TRAD), () =>
    convertLastMessage(getLastMessageId(), 'traditional')
  );
  eventOn(getButtonEvent(t.LAST_SIMP), () =>
    convertLastMessage(getLastMessageId(), 'simplified')
  );

  /* =========================
      設定 checkbox
  ========================== */

  const settings = [
    { id:'auto-trad', name:'自動將回覆轉成繁體', state:false, type:'receive' },
    { id:'auto-simp', name:'自动将回覆转成简体', state:false, type:'receive' },
    { id:'hide-buttons', name:'不用按鈕', state:false, type:'ui' }
  ];

  const getItem = id => settings.find(x => x.id === id);
  const getState = id => getItem(id)?.state ?? false;
  const setState = (id,val) => { const i=getItem(id); if(i) i.state=val; };

  const loadSetting = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const data = JSON.parse(raw);
      if (typeof data.trad === 'boolean') setState('auto-trad', data.trad);
      if (typeof data.simp === 'boolean') setState('auto-simp', data.simp);
      if (typeof data.hide === 'boolean') setState('hide-buttons', data.hide);
// 除錯：強制互斥（如果兩個都 true，優先保留 trad，關掉 simp）
    if (getState('auto-trad') && getState('auto-simp')) {
      setState('auto-simp', false);
      saveSetting();  // 立即存回修正後的狀態
    }
    } catch {}
  };

  const saveSetting = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      trad: getState('auto-trad'),
      simp: getState('auto-simp'),
      hide: getState('hide-buttons')
    }));
  };

  /* =========================
      隱藏四個轉換按鈕
  ========================== */

  const toggleButtonsVisibility = () => {
    const hide = getState('hide-buttons');

    Object.values(t).forEach(name => {
      const btn = $(`.menu_button:contains("${name}")`);
      hide ? btn.hide() : btn.show();
    });
  };

/* =========================
    Popup UI（checkbox） - 加強 UI 同步
========================= */

const openSettingUI = () => {
  loadSetting();
  $('.th-custom-popup-ui').remove();
  $('.opencc-overlay').remove();

  // 保持你現在成功的同一列排版
  const checkboxes = settings.map(item => `
    <div style="display: flex; align-items: center; margin-bottom: 16px; gap: 12px;">
      <input type="checkbox" id="${item.id}" ${item.state ? 'checked' : ''} 
             style="margin: 0; width: 18px; height: 18px; flex-shrink: 0; accent-color: #f44336;"/>
      <label for="${item.id}" style="margin: 0; cursor: pointer; white-space: nowrap; color: #eee;">
        ${item.name}
      </label>
    </div>
  `).join('');

  const overlay = $('<div class="opencc-overlay" style="position:fixed;inset:0;z-index:999998;background:rgba(0,0,0,0.65);"></div>');
  $('body').append(overlay);

  const popup = $(`
    <div class="th-custom-popup-ui"
      style="
        position:fixed;
        top:50%;
        left:50%;
        transform:translate(-50%,-50%);
        width:400px;
        max-height:85vh;
        overflow-y:auto;
        background:#2c2c2e;
        color:#eee;
        padding:24px;
        border-radius:12px;
        z-index:999999;
        box-shadow:0 0 30px rgba(0,0,0,0.7);
        font-family:system-ui, sans-serif;
      ">
      <h3 style="
        margin:0 0 20px;
        font-size:1.4em;
        text-align:center;
        color:#eee;
      ">
        Setting
      </h3>
      ${checkboxes}
      <button type="button"
        class="menu_button th-custom-popup-close"
        style="
          margin-top:24px;
          width:100%;
          padding:12px;
          background:#f44336;
          color:white;
          border:none;
          border-radius:6px;
          cursor:pointer;
          font-size:1.1em;
          transition: background 0.2s;
        ">
        Close
      </button>
    </div>
  `);
  $('body').append(popup);

  // 讓紅色按鈕有 hover 效果（可選，喜歡就留，不喜歡可刪）
  popup.find('.th-custom-popup-close').on('mouseenter', function() {
    $(this).css('background', '#d32f2f');
  }).on('mouseleave', function() {
    $(this).css('background', '#f44336');
  });

  overlay.on('click', () => { popup.remove(); overlay.remove(); });
  popup.find('.th-custom-popup-close').on('click', () => { popup.remove(); overlay.remove(); });
  popup.on('click', e => e.stopPropagation());

  /* checkbox 綁定（維持原邏輯） */
  settings.forEach(item => {
    const checkbox = popup.find(`#${item.id}`);
    
    checkbox.on('change', function(){
      const checked = this.checked;
      setState(item.id, checked);

      if (item.type === 'receive' && checked) {
        settings
          .filter(x => x.type === 'receive' && x.id !== item.id)
          .forEach(x => {
            setState(x.id, false);
            popup.find(`#${x.id}`).prop('checked', false);
          });
      }

      saveSetting();
      toggleButtonsVisibility();
      toastr.success(`${item.name}：${checked ? 'ON' : 'OFF'}`);
    });
  });
};

  /* =========================
      加入 extensions menu
  ========================== */

  const injectMenu = () => {

    if (document.getElementById(MENU_ID)) return;

    const menu = $('#extensionsMenu');
    if (!menu.length) return;

    const list = menu.find('.list-group').first().length
      ? menu.find('.list-group').first()
      : menu;

    const btn = $(`
      <a id="${MENU_ID}" class="list-group-item" href="javascript:void(0)">
        <i class="fa-solid fa-language"></i>
        ${MENU_NAME}
      </a>
    `);

    btn.on('click', openSettingUI);
    list.append(btn);
  };

  injectMenu();
  loadSetting();
  toggleButtonsVisibility();

  new MutationObserver(injectMenu)
    .observe(document.body,{childList:true,subtree:true});

  /* =========================
      自動轉換回覆
  ========================== */

  eventOn(tavern_events.MESSAGE_RECEIVED, async (msgId)=>{

    if(msgId!==getLastMessageId()) return;

    const mode =
      getState('auto-trad') ? 'traditional' :
      getState('auto-simp') ? 'simplified' :
      null;

    if(!mode) return;

    await ensureConverter();

    const msgs = getChatMessages(msgId);
    if(!msgs?.[0]) return;

    const msg = String(msgs[0].message||'');
    const newMsg = convert(msg, mode);

    if(newMsg!==msg){
      await setChatMessages(
        [{message_id:msgId,message:newMsg}],
        {refresh:'affected'}
      );

      toastr.success(mode==='traditional'
        ? '已將最新回覆轉為繁體'
        : '已将最新回覆转为简体');
    }
  });

  console.log('[OpenCC Final] 腳本完成初始化');
