  console.log("[OpenCC] script start");
alert("OPENCC JS LOADED");
  const STORAGE_KEY = 'opencc_auto_mode';
  const TAG_STORAGE_KEY = 'opencc_custom_tag';
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

  /* 自訂標籤解析函式 */
const parseCustomTags = (input) => {
  const trimmed = (input || '').trim();
  if (!trimmed) return [];

  const parts = trimmed.split(',').map(p => p.trim()).filter(p => p);
  const configs = [];

  for (const part of parts) {
    const config = parseSingleTag(part);  // 下面定義 parseSingleTag
    if (config.enabled) {
      configs.push(config);
    }
  }

  return configs;
};

// 單一標籤解析（原本的 parseCustomTag 改名並微調）
const parseSingleTag = (input) => {
  const trimmed = input.trim();
  if (!trimmed) return { enabled: false };

  // 先檢查是否有 | → 前綴|後綴
  if (trimmed.includes('|')) {
    const firstPipeIndex = trimmed.indexOf('|');
    if (firstPipeIndex > 0 && firstPipeIndex < trimmed.length - 1) {
      const prefix = trimmed.substring(0, firstPipeIndex).trim();
      const suffix = trimmed.substring(firstPipeIndex + 1).trim();
      if (prefix && suffix) {
        return {
          enabled: true,
          isPaired: false,
          open: prefix,
          close: suffix
        };
      }
    }
    return { enabled: false };
  }

  // 成對標籤
  const pairedRegex = /^([<\[])(.+?)([>\]])$/;
  const pairedMatch = trimmed.match(pairedRegex);
  if (pairedMatch) {
    const openChar = pairedMatch[1];
    const tagName = pairedMatch[2].trim();
    const closeChar = pairedMatch[3];
    if (tagName) {
      const open = openChar + tagName + closeChar;
      const close = (openChar === '<' ? '</' : '[/') + tagName + closeChar;
      return {
        enabled: true,
        isPaired: true,
        open,
        close
      };
    }
  }

  return { enabled: false };
};

  /* 通用 tag 轉換函式（支援自訂前後綴） */
const convertCustomTags = (text, mode, configs) => {
  if (mode !== 'traditional' && mode !== 'simplified') return text;
  if (!configs.length) return text;

  let result = text;
  for (const config of configs) {
    const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const openEsc = escapeRegex(config.open);
    const closeEsc = escapeRegex(config.close);

    const regex = new RegExp(`${openEsc}([\\s\\S]*?)${closeEsc}`, 'gi');

    result = result.replace(regex, (match, inner) => {
      const convertedInner = convert(inner.trim(), mode);
      return `${config.open}${convertedInner}${config.close}`;
    });
  }
  return result;
};

  /* =========================
      四個按鈕功能
  ========================== */
  const convertInput = async (mode) => {
    const input = $('#send_textarea');
    if (!input.length) return toastr.error('找不到輸入框', '', {timeOut:1500});
    const val = String(input.val() ?? '');
    if (!val) return;
    await ensureConverter();
    input.val(convert(val, mode)).trigger('input').trigger('focus');
    toastr.success(mode === 'traditional' ? '已轉成繁體' : '已转成简体', '', {timeOut:1100});
  };

const convertLastMessage = async (msgId, mode) => {
  const msgs = getChatMessages(msgId);
  if (!msgs?.[0]) return;
  const msg = String(msgs[0].message ?? '');
  if (!msg) return;

  await ensureConverter();

  let newMsg = convert(msg, mode);

  // ── 這裡改成處理多個標籤 ──
  const tagMode = getState('tag-trad') ? 'traditional' :
                  getState('tag-simp') ? 'simplified' : null;

  if (tagMode) {
    const tagInput = localStorage.getItem(TAG_STORAGE_KEY) || '[IMG_GEN]';
    const tagConfigs = parseCustomTags(tagInput);  // 回傳陣列

    if (tagConfigs.length > 0) {
      newMsg = convertCustomTags(newMsg, tagMode, tagConfigs);
    }
  }
  // ──────────────────────────────────────

  if (newMsg !== msg) {
    await setChatMessages(
      [{ message_id: msgId, message: newMsg }],
      { refresh: 'affected' }
    );

    let toastText = mode === 'traditional' ? '本樓已轉繁體' : '本楼已转简体';

    // toast 顯示處理了幾個標籤（可選，建議保留）
    const tagInput = localStorage.getItem(TAG_STORAGE_KEY) || '[IMG_GEN]';
    const tagConfigs = parseCustomTags(tagInput);
    if (tagMode && tagConfigs.length > 0) {
      toastText += `（含 ${tagConfigs.length} 個標籤）`;
    } else if (tagMode) {
      toastText += '（標籤無效）';
    }

    toastr.success(toastText, '', {timeOut:1100});
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
  eventOn(getButtonEvent(t.LAST_TRAD), () => convertLastMessage(getLastMessageId(), 'traditional'));
  eventOn(getButtonEvent(t.LAST_SIMP), () => convertLastMessage(getLastMessageId(), 'simplified'));

  /* =========================
      設定項目
  ========================== */
  const settings = [
    { id:'auto-trad', name:'自動將回覆轉成繁體', state:false, type:'receive' },
    { id:'auto-simp', name:'自动将回覆转成简体', state:false, type:'receive' },
    { id:'tag-trad',  name:'標籤內容轉為繁體',   state:false, type:'tag' },
    { id:'tag-simp',  name:'标签内容转为简体',   state:false, type:'tag' },
    { id:'hide-buttons', name:'不用按鈕', state:false, type:'ui' }
  ];

  const getItem = id => settings.find(x => x.id === id);
  const getState = id => getItem(id)?.state ?? false;
  const setState = (id, val) => { const i = getItem(id); if (i) i.state = val; };

  const loadSetting = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.trad === 'boolean') setState('auto-trad', data.trad);
      if (typeof data.simp === 'boolean') setState('auto-simp', data.simp);
      if (typeof data.tagTrad === 'boolean') setState('tag-trad', data.tagTrad);
      if (typeof data.tagSimp === 'boolean') setState('tag-simp', data.tagSimp);
      if (typeof data.hide === 'boolean') setState('hide-buttons', data.hide);

      if (getState('auto-trad') && getState('auto-simp')) setState('auto-simp', false);
      if (getState('tag-trad') && getState('tag-simp')) setState('tag-simp', false);
      saveSetting();
    } catch {}
  };

  const saveSetting = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      trad: getState('auto-trad'),
      simp: getState('auto-simp'),
      tagTrad: getState('tag-trad'),
      tagSimp: getState('tag-simp'),
      hide: getState('hide-buttons')
    }));
  };

  /* =========================
      隱藏按鈕
  ========================== */
  const toggleButtonsVisibility = () => {
    const hide = getState('hide-buttons');
    Object.values(t).forEach(name => {
      const btn = $(`.menu_button:contains("${name}")`);
      hide ? btn.hide() : btn.show();
    });
  };

  /* =========================
      Popup UI
  ========================== */
  const openSettingUI = () => {
    loadSetting();
    $('.th-custom-popup-ui').remove();
    $('.opencc-overlay').remove();

    const checkboxes = settings.map(item => `
      <div style="display: flex; align-items: center; margin-bottom: 16px; gap: 12px;">
        <input type="checkbox" id="${item.id}" ${item.state ? 'checked' : ''}
               style="margin: 0; width: 18px; height: 18px; flex-shrink: 0; accent-color: #f44336;"/>
        <label for="${item.id}" style="margin: 0; cursor: pointer; white-space: nowrap; color: #eee;">
          ${item.name}
        </label>
      </div>
    `).join('');

    const customTagValue = localStorage.getItem(TAG_STORAGE_KEY) || '[IMG_GEN]';

const tagSection = `
  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #444;">
    <select id="tag-preset" style="width:100%; padding:8px; margin-bottom:8px; background:#2c2c2e; color:#eee; border:1px solid #555; border-radius:6px;">
      <option value="[IMG_GEN]">例一"[IMG_GEN]"：[tag][/tag]格式</option>
      <option value="<action>">例二"&lt;action&gt;"：&lt;tag&gt;&lt;/tag&gt;格式</option>
      <option value="think target=|</thought>">例三"think target=|&lt;/thought&gt;"：tag1|tag2格式</option>
    </select>
    <input type="text" id="custom-tag-input" value="${customTagValue}"
           placeholder="[tag] 或 <tag> 或 prefix|suffix"
           style="width:100%; padding:10px; background:#1e1e1e; color:#eee; border:1px solid #555; border-radius:6px; font-family:monospace;">
<div class="tag-help" style="margin-top:6px; font-size:0.85em; color:#aaa; line-height:1.4;">
  <div class="trad-text">
    要勾選標籤內容轉為繁/簡體，設定標籤才有用<br>
    支援格式：可設多組，用英文逗號分隔<br>
    • 成對標籤[]<br>
    • 成對標籤<><br>
    • 自訂標籤1|自訂標籤2<br>
  </div>
  <div class="simp-text" style="display:none;">
    要勾选标签内容转为繁/简体，设定标签才有用<br>
    支持格式：可设多组，用英文逗号分隔<br>
    • 成对标签[]<br>
    • 成对标签<><br>
    • 自定义标签1|自定义标签2<br>
  </div>
</div>
  </div>
`;

    const overlay = $('<div class="opencc-overlay" style="position:fixed;inset:0;z-index:999998;background:rgba(0,0,0,0.65);"></div>');
    $('body').append(overlay);

    const popup = $(`
      <div class="th-custom-popup-ui" style="
        position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        width:400px; max-height:85vh; overflow-y:auto;
        background:#2c2c2e; color:#eee; padding:24px; border-radius:12px;
        z-index:999999; box-shadow:0 0 30px rgba(0,0,0,0.7);
        font-family:system-ui, sans-serif;">
        <h3 style="margin:0 0 20px; font-size:1.4em; text-align:center; color:#eee;">Setting</h3>
        ${checkboxes}
        ${tagSection}
        <button type="button" class="menu_button th-custom-popup-close" style="
          margin-top:24px; width:100%; padding:12px; background:#f44336; color:white;
          border:none; border-radius:6px; cursor:pointer; font-size:1.1em; transition: background 0.2s;">
          Close
        </button>
      </div>
    `);
    $('body').append(popup);
// hover 切換繁簡說明（用 JS 控制，避免 CSS 衝突）
const helpDiv = popup.find('.tag-help');
if (helpDiv.length) {
  const tradText = helpDiv.find('.trad-text');
  const simpText = helpDiv.find('.simp-text');

  helpDiv.on('mouseenter', function() {
    tradText.hide();
    simpText.show();
  }).on('mouseleave', function() {
    tradText.show();
    simpText.hide();
  });

  // 初始狀態顯示繁體
  tradText.show();
  simpText.hide();
}
    // hover 效果
    popup.find('.th-custom-popup-close').on('mouseenter', function() { $(this).css('background', '#d32f2f'); })
                                       .on('mouseleave', function() { $(this).css('background', '#f44336'); });

    // 關閉事件
    overlay.on('click', () => { popup.remove(); overlay.remove(); });
    popup.find('.th-custom-popup-close').on('click', () => { popup.remove(); overlay.remove(); });
    popup.on('click', e => e.stopPropagation());

    // checkbox 事件
    settings.forEach(item => {
      const checkbox = popup.find(`#${item.id}`);
      checkbox.on('change', function(){
        const checked = this.checked;
        setState(item.id, checked);

        if (item.type === 'receive' && checked) {
          settings.filter(x => x.type === 'receive' && x.id !== item.id)
            .forEach(x => { setState(x.id, false); popup.find(`#${x.id}`).prop('checked', false); });
        }
        if (item.type === 'tag' && checked) {
          settings.filter(x => x.type === 'tag' && x.id !== item.id)
            .forEach(x => { setState(x.id, false); popup.find(`#${x.id}`).prop('checked', false); });
        }

        saveSetting();
        toggleButtonsVisibility();
        toastr.success(`${item.name}：${checked ? 'ON' : 'OFF'}`, '', {timeOut:1100});
      });
    });

    // 自訂標籤輸入事件
    const presetSelect = popup.find('#tag-preset');
    const tagInput = popup.find('#custom-tag-input');

    presetSelect.on('change', function() {
      const val = this.value;
      tagInput.val(val);
      localStorage.setItem(TAG_STORAGE_KEY, val);
    });

    tagInput.on('input', function() {
      localStorage.setItem(TAG_STORAGE_KEY, this.value.trim());
    });
  };

  /* =========================
      加入 extensions menu
  ========================== */
  const injectMenu = () => {
    if (document.getElementById(MENU_ID)) return;
    const menu = $('#extensionsMenu');
    if (!menu.length) return;
    const list = menu.find('.list-group').first().length ? menu.find('.list-group').first() : menu;
    const btn = $(`
      <a id="${MENU_ID}" class="list-group-item" href="javascript:void(0)">
        <i class="fa-solid fa-language"></i> ${MENU_NAME}
      </a>
    `);
    btn.on('click', openSettingUI);
    list.append(btn);
  };

  injectMenu();
  loadSetting();
  toggleButtonsVisibility();
  new MutationObserver(injectMenu).observe(document.body, {childList:true, subtree:true});

  /* =========================
      自動轉換回覆（包含自訂 tag）
  ========================== */
eventOn(tavern_events.MESSAGE_RECEIVED, async (msgId) => {
  if (msgId !== getLastMessageId()) return;

  await ensureConverter();

  const msgs = getChatMessages(msgId);
  if (!msgs?.[0]) return;

  let msg = String(msgs[0].message || '');
  if (!msg) return;

  let newMsg = msg;

  // Step 1: receive 模式（整則訊息）
  const receiveMode = getState('auto-trad') ? 'traditional' :
                      getState('auto-simp') ? 'simplified' : null;
  if (receiveMode) {
    newMsg = convert(newMsg, receiveMode);
  }

  // ── 這裡改成處理多個標籤 ──
  const tagMode = getState('tag-trad') ? 'traditional' :
                  getState('tag-simp') ? 'simplified' : null;
  if (tagMode) {
    const tagInput = localStorage.getItem(TAG_STORAGE_KEY) || '[IMG_GEN]';
    const tagConfigs = parseCustomTags(tagInput);

    if (tagConfigs.length > 0) {
      newMsg = convertCustomTags(newMsg, tagMode, tagConfigs);
    }
  }
  // ──────────────────────────────────────

  if (newMsg !== msg) {
    await setChatMessages(
      [{ message_id: msgId, message: newMsg }],
      { refresh: 'affected' }
    );

    let toastText = '';

    // 顯示更精確的訊息
    const tagInput = localStorage.getItem(TAG_STORAGE_KEY) || '[IMG_GEN]';
    const tagConfigs = parseCustomTags(tagInput);
    const tagCount = tagConfigs.length;

    if (receiveMode && tagMode && tagCount > 0) {
      toastText = receiveMode === 'traditional'
        ? `已轉為繁體（含 ${tagCount} 個標籤）`
        : `已转为简体（含 ${tagCount} 个标签）`;
    } else if (receiveMode) {
      toastText = receiveMode === 'traditional'
        ? '已轉為繁體'
        : '已转为简体';
    } else if (tagMode && tagCount > 0) {
      toastText = tagMode === 'traditional'
        ? ` ${tagCount} 個標籤內容已轉為繁體`
        : ` ${tagCount} 个标签内容已转为简体`;
    }

    if (toastText) {
      toastr.success(toastText, '', { timeOut: 1100 });
    }
  }
});

  console.log('[OpenCC Final] 腳本完成初始化');
