
  console.log("[OpenCC] script start");

$('.opencc-btn').remove();
  const STORAGE_KEY = 'opencc_auto_mode';
  const TAG_STORAGE_KEY = 'opencc_custom_tag';
  const TAG_LIST_STORAGE_KEY = 'opencc_custom_tag_list';
  const t = {
    INPUT_TRAD: '輸入轉繁⇄简',
    INPUT_CLEAR: '清空',
    LAST_TRAD: '本樓轉繁',
    LAST_SIMP: '本楼转简'
  };

const VARIANT_STORAGE_KEY = 'opencc_trad_variant';
const DEFAULT_VARIANT = 't';  // 官版

  const MENU_ID = 'th-custom-extension-menu-item';
  const MENU_NAME = 'OpenCC';


// 頂層變數：三個 converter
let convTradT = null;   // 官版 t
let convTradTW = null;  // 台版 tw
let convTradHK = null;  // 港版 hk
let convSimp = null;
let convTradTWP = null; // 台版詞語轉繁
let convTWPToSimp = null; // 台版詞語轉簡

// OpenCC 模組載入：本地優先，CDN 備援
const loadOpenCCModule = async () => {
  const localSource = '/opencc-js-1.0.5.esm.js';
  const remoteSources = [
    'https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/+esm',
    'https://testingcf.jsdelivr.net/npm/opencc-js@1.0.5/+esm',
  ];

  let lastErr = null;

  // 先探測本地檔是否存在且回傳 JS MIME，避免缺檔時瀏覽器噴出 module MIME 錯誤
  try {
    const probe = await fetch(localSource, { method: 'GET', cache: 'no-store' });
    const ct = String(probe.headers.get('content-type') || '').toLowerCase();
    const okMime = ct.includes('javascript') || ct.includes('ecmascript') || ct.includes('text/plain');
    if (probe.ok && okMime) {
      const mod = await import(localSource);
      console.info('[OpenCC] module loaded from:', localSource);
      return mod;
    }
    console.info('[OpenCC] local module skipped:', localSource, 'status=', probe.status, 'content-type=', ct || 'unknown');
  } catch (err) {
    console.info('[OpenCC] local module unavailable, fallback to CDN:', err?.message || err);
  }

  for (const url of remoteSources) {
    try {
      const mod = await import(url);
      console.info('[OpenCC] module loaded from:', url);
      return mod;
    } catch (err) {
      lastErr = err;
      console.warn('[OpenCC] module load failed:', url, err?.message || err);
    }
  }

  throw (lastErr || new Error('OpenCC module load failed'));
};
// ensureConverter：一次建立三個（同步）
const ensureConverter = async () => {
  if (convTradT && convTradTW && convTradHK && convTradTWP && convSimp) return;

  const module = await loadOpenCCModule();

  convTradT  = module.Converter({ from: 'cn', to: 't' });
  convTradTW = module.Converter({ from: 'cn', to: 'tw' });
  convTradHK = module.Converter({ from: 'cn', to: 'hk' });
  convTradTWP = module.Converter({ from: 'cn', to: 'twp' });
  convSimp   = module.Converter({ from: 't', to: 'cn' });
  convTWPToSimp = module.Converter({ from: 'twp', to: 'cn' });
};

ensureConverter(); // 一開始就載入一次

// convert：同步 + 根據 variant 選 converter
const convert = (text, mode) => {
  const input = String(text ?? '');
if (mode === 'simplified') {
  const variant = localStorage.getItem(VARIANT_STORAGE_KEY) || 't';

  // 👉 如果是 twp，要用詞語逆轉
  if (variant === 'twp') {
    return convTWPToSimp ? convTWPToSimp(input) : input;
  }
  // 👉 其他照舊
  return convSimp ? convSimp(input) : input;
}
  if (mode === 'traditional') {
    const variant = localStorage.getItem(VARIANT_STORAGE_KEY) || 't';
    let conv;
if (variant === 'twp') {
  const simp = convSimp ? convSimp(input) : input;
  return convTradTWP ? convTradTWP(simp) : input;
}
else if (variant === 'tw') {
  conv = convTradTW;
}
else if (variant === 'hk') {
  conv = convTradHK;
}
else {
  conv = convTradT;
}
    return conv ? conv(input) : input;
  }
  return input;
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

const loadSavedTagList = () => {
  try {
    const raw = localStorage.getItem(TAG_LIST_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => {
        if (typeof item === 'string') {
          const tag = item.trim();
          return tag ? { tag, note: '' } : null;
        }
        if (item && typeof item === 'object') {
          const tag = String(item.tag ?? '').trim();
          if (!tag) return null;
          return { tag, note: String(item.note ?? '').trim() };
        }
        return null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};

const saveTagList = (list) => {
  localStorage.setItem(TAG_LIST_STORAGE_KEY, JSON.stringify(list));
};

const saveTagToList = (tagValue) => {
  const tag = String(tagValue ?? '').trim();
  if (!tag) return null;
  const list = loadSavedTagList();
  if (list.some(item => item.tag === tag)) {
    return { status: 'exists', tag };
  }
  const next = [{ tag, note: '' }, ...list].slice(0, 30);
  saveTagList(next);
  return { status: 'saved', tag };
};

const appendUniqueTag = (currentRaw, tagRaw) => {
  const current = String(currentRaw ?? '').trim();
  const currentParts = current ? current.split(',').map(x => x.trim()).filter(Boolean) : [];
  const incomingParts = String(tagRaw ?? '').split(',').map(x => x.trim()).filter(Boolean);
  if (!incomingParts.length) return { changed: false, value: current };

  const seen = new Set(currentParts);
  let changed = false;

  incomingParts.forEach((tag) => {
    if (!seen.has(tag)) {
      currentParts.push(tag);
      seen.add(tag);
      changed = true;
    }
  });

  return { changed, value: currentParts.join(',') };
};

  /* 通用 tag 轉換函式（支援自訂前後綴） */
const convertCustomTags = async (text, mode, configs) => {
  if (mode !== 'traditional' && mode !== 'simplified') return text;
  if (!configs.length) return text;

  // 強制轉成字串，防呆上游傳入 Promise / undefined 等
  let result = String(text ?? '');

  for (const config of configs) {
    const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const openEsc = escapeRegex(config.open);
    const closeEsc = escapeRegex(config.close);

    // 避免無效標籤
    if (!openEsc || !closeEsc) continue;

    const regex = new RegExp(`${openEsc}([\\s\\S]*?)${closeEsc}`, 'gi');

    // 先抓出所有匹配，避免在迴圈中修改 result 影響迭代器
    const matches = [...result.matchAll(regex)];

    for (const match of matches) {
      const inner = match[1] || '';  // 捕獲群組1，內容部分
      const safeInner = String(inner).trim();
      const convertedInner = convert(safeInner, mode);
      const replacement = `${config.open}${convertedInner}${config.close}`;

      // 一次替換這一個匹配
      result = result.replace(match[0], replacement);
    }
  }

  return result;
};

/* =========================
    狀態（輸入框切換用）
========================= */
let currentMode = 'traditional'; // 預設繁體

// 👉 合併後的「輸入框轉換」按鈕
eventOn(getButtonEvent(t.INPUT_TRAD), async () => {
  await convertInput(currentMode);
  // 切換模式
  currentMode = currentMode === 'traditional' ? 'simplified' : 'traditional';
});

  // 清空功能
eventOn(getButtonEvent(t.INPUT_CLEAR), () => clearInput());

// 👉 保留「最後訊息轉換」兩顆（不合併）
eventOn(getButtonEvent(t.LAST_TRAD), () =>
  convertLastMessage(getLastMessageId(), 'traditional')
);

eventOn(getButtonEvent(t.LAST_SIMP), () =>
  convertLastMessage(getLastMessageId(), 'simplified')
);

// convertInput：去掉 async / await
const convertInput = (mode) => {
  const input = $('#send_textarea');
  if (!input.length) return toastr.error('找不到輸入框', '', { timeOut: 1500 });
  const val = String(input.val() ?? '');
  if (!val) return;

  input
    .val(convert(val, mode))
    .trigger('input')
    .trigger('focus');

  toastr.success(
    mode === 'traditional' ? '已轉成繁體' : '已转成简体',
    '',
    { timeOut: 1100 }
  );
};

let clearConfirm = false;
let clearTimer = null;

const clearInput = () => {
  const input = $('#send_textarea');
  if (!input.length) {
    return toastr.error('找不到輸入框', '', { timeOut: 1500 });
  }

  const val = String(input.val() ?? '');
  if (!val) return;

  // 第一次點擊 → 提示
  if (!clearConfirm) {
    clearConfirm = true;
flashDanger();
    toastr.warning('再點一次「清空」即可清除', '', {
      timeOut: 1500
    });

    // 1.5秒內有效
    clearTimer = setTimeout(() => {
      clearConfirm = false;
    }, 1500);

    return;
  }

  // 第二次點擊 → 執行
  clearConfirm = false;
  clearTimer && clearTimeout(clearTimer);

  input.val('').trigger('input').trigger('focus');

  toastr.success('已清空輸入', '', { timeOut: 1100 });
};

const flashDanger = () => {
  const btn = $(`.menu_button:contains("${t.INPUT_CLEAR}")`);
  if (!btn.length) return;

  btn.css({
    backgroundColor: '#e74c3c',
    color: '#fff',
    borderColor: '#e74c3c',
    transition: 'all 0.2s ease'
  });

  setTimeout(() => {
    btn.css({
      backgroundColor: '',
      color: '',
      borderColor: '',
    });
  }, 1500);
};




const convertLastMessage = async (msgId, mode) => {
  const msgs = getChatMessages(msgId);
  if (!msgs?.[0]) return;
  const msg = String(msgs[0].message ?? '');
  if (!msg) return;

  let newMsg = convert(msg, mode);

  // ── 處理多個自訂標籤 ──
  const tagMode = getState('tag-trad') ? 'traditional' :
                  getState('tag-simp') ? 'simplified' : null;

  if (tagMode) {
    const tagInput = localStorage.getItem(TAG_STORAGE_KEY) || '[IMG_GEN]';
    const tagConfigs = parseCustomTags(tagInput);
    if (tagConfigs.length > 0) {
      newMsg = await convertCustomTags(newMsg, tagMode, tagConfigs);
    }
  }
  // ──────────────────────────────────────

  if (newMsg !== msg) {
    await setChatMessages(
      [{ message_id: msgId, message: newMsg }],
      { refresh: 'affected' }
    );

    let toastText = mode === 'traditional' ? '本樓已轉繁體' : '本楼已转简体';

    // toast 顯示標籤數量（可選）
    const tagInput = localStorage.getItem(TAG_STORAGE_KEY) || '[IMG_GEN]';
    const tagConfigs = parseCustomTags(tagInput);
    const tagCount = tagConfigs.length;
    if (tagMode && tagCount > 0) {
      toastText += `（含 ${tagCount} 個標籤）`;
    } else if (tagMode) {
      toastText += '（標籤無效）';
    }

    toastr.success(toastText, '', { timeOut: 1100 });
  }
};

/* =========================
    建立按鈕（加上 id）
========================= */
appendInexistentScriptButtons([
  { name: t.INPUT_TRAD, visible: true, id: 'btn-convert-input' },
  { name: t.INPUT_CLEAR, visible: true, id: 'btn-clear-input' },
  { name: t.LAST_TRAD, visible: true, id: 'btn-convert-last-trad' },
  { name: t.LAST_SIMP, visible: true, id: 'btn-convert-last-simp' }
]);

//   Object.values(t).map(name => ({ name, visible: true }))

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
if (!document.getElementById('opencc-mobile-style')) {
  const style = document.createElement('style');
  style.id = 'opencc-mobile-style';
  style.innerHTML = `
    @media (max-width:600px){
      .th-custom-popup-ui{
        width:92vw !important;
        padding:18px !important;
      }

      .th-custom-popup-ui h3{
        font-size:20px;
      }

      .th-custom-popup-ui label{
      font-size:12px; /* 縮小字體 */
      line-height:1.2; /* 調整行距 */
      }
  #custom-tag-input{
    font-size:14px;
  }
    }
  `;
  document.head.appendChild(style);
}
    const checkboxes = settings.map(item => `
 <div style="
  display:flex;
  align-items:flex-start;
  margin-bottom:14px; /* 間距 */
  gap:10px; /* 間隔 */
">
        <input type="checkbox" id="${item.id}" ${item.state ? 'checked' : ''}
style="
margin:0;
width:20px;
height:20px;
flex-shrink:0;
accent-color:#f44336;
cursor:pointer;
">
<label for="${item.id}" style="
  margin:0;
  cursor:pointer;
  color:#eee;
  line-height:1.2; /* 行距 */
  font-size:18px; /* 字體 */
  flex:1;
">
          ${item.name}
        </label>
      </div>
    `).join('');

const variantSection = `
  <div style="margin-top: 24px;">
    <select id="trad-variant" style="width:100%; padding:10px; font-size:18px; background:#2c2c2e; color:#eee; border:1px solid #555; border-radius:6px;">
      <option value="t" ${localStorage.getItem(VARIANT_STORAGE_KEY) === 't' || !localStorage.getItem(VARIANT_STORAGE_KEY) ? 'selected' : ''}>官版繁體 (t)</option>
      <option value="tw" ${localStorage.getItem(VARIANT_STORAGE_KEY) === 'tw' ? 'selected' : ''}>台版繁體 (tw)</option>
      <option value="hk" ${localStorage.getItem(VARIANT_STORAGE_KEY) === 'hk' ? 'selected' : ''}>港版繁體 (hk)</option>
      <option value="twp" ${localStorage.getItem(VARIANT_STORAGE_KEY) === 'twp' ? 'selected' : ''}>台版繁體+詞語转换 (twp)</option>
    </select>
    <div class="tag-help" style="margin-top:6px; font-size:16px; color:#aaa; line-height:1.4;">
      <div class="trad-text">
        繁體版本影響：輸入框、本樓、自動回覆、標籤內容的所有繁體轉換
      </div>
      <div class="simp-text" style="display:none;">
        繁体版本影响：输入框、本楼、自动回复、标签内容的所有繁体转换
      </div>
    </div>
  </div>
`;


    const customTagValue = localStorage.getItem(TAG_STORAGE_KEY) || '[IMG_GEN]';

const tagSection = `
  <div style="margin-top: 24px;">    <select id="tag-preset" style="width:100%; padding:8px; font-size:18px; margin-bottom:8px; background:#2c2c2e; color:#eee; border:1px solid #555; border-radius:6px;">
      <option value="" selected disabled>標籤設定範例</option>
      <option value="[IMG]">例一：[tag][/tag]成對中括號</option>
      <option value="<action>">例二：&lt;tag&gt;&lt;/tag&gt;成對尖括號</option>
      <option value="<IMG prompt=|>">例三：豎線前tag1|豎線後tag2</option>
      <option value="[IMG_GEN],< |」">例四：多組之間用逗號</option>
    </select>
    <div style="display:flex; gap:8px; align-items:center;">
      <input type="text" id="custom-tag-input" value="${customTagValue}"
             placeholder="[tag] 或 <tag> 或 prefix|suffix"
style="
  flex:1;
  padding:10px;
  font-size:18px;
  background:#1e1e1e;
  color:#eee;
  border:1px solid #555;
  border-radius:6px;
  font-family:monospace;
">
      <button type="button" id="save-custom-tag-btn" class="menu_button" style="white-space:nowrap; min-width:72px;">保存</button>
      <button type="button" id="clear-custom-tag-btn" class="menu_button" style="white-space:nowrap; min-width:72px;">清除</button>
    </div>
    <details id="saved-tag-list-wrap" style="margin-top:8px; border:1px solid #555; border-radius:6px; padding:8px; background:#1f1f20;">
      <summary style="cursor:pointer; color:#ddd; font-size:18px;">自訂標籤列表</summary>
      <div id="saved-tag-list" style="display:flex; flex-direction:column; gap:8px; margin-top:8px;"></div>
    </details>
<div class="tag-help" style="margin-top:6px; font-size:16px; color:#aaa; line-height:1.4;">
  <div class="trad-text">
    • 標籤設定可參考範例<br>
    • 勾選標籤內容轉為繁/簡體，標籤才有效<br>
    • 應用場景：例如生圖時產生的路徑不可轉繁簡，或正則只抓取繁/簡體角色名<br>
    • 標籤可保存並自訂備註
  </div>
  <div class="simp-text" style="display:none;">
    • 标签设定可参考范例<br>
    • 勾选标签内容转为繁/简体，标签才有效<br>
    • 应用场景：例如生图时产生的路径不可转繁简，或正则只抓取繁/简体角色名<br>
    • 标签可保存并自订备注
  </div>
</div>
  </div>
`;

    const overlay = $('<div class="opencc-overlay" style="position:fixed;inset:0;z-index:999998;background:rgba(0,0,0,0.65);overflow:hidden;"></div>');
    $('body').append(overlay);

const popup = $(`
<div class="th-custom-popup-ui" style="
position:fixed;
top:6vh;
left:50%;
transform:translateX(-50%);

width:min(92vw,420px);
max-height:88vh;

overflow-y:auto;
-webkit-overflow-scrolling:touch;

  background:#2c2c2e;
  color:#eee;
  padding:22px;
  border-radius:12px;
  z-index:999999;

  box-shadow:0 0 30px rgba(0,0,0,0.7);
  font-family:system-ui,sans-serif;
">
        <h3 style="margin:0 0 20px; font-size:26px; text-align:center; color:#eee;">Setting</h3>
        ${checkboxes}
        ${tagSection}
		${variantSection}
        <button type="button" class="menu_button th-custom-popup-close" style="
          margin-top:24px; width:100%; padding:12px; background:#f44336; color:white;
          border:none; border-radius:6px; cursor:pointer; font-size:21px; transition: background 0.2s;">
          Close
        </button>
      </div>
    `);
    $('body').append(popup);

// hover 切換繁簡說明（用 JS 控制，避免 CSS 衝突）
const bindHelpToggle = (container) => {
  if (!container || !container.length) return;
  const tradText = container.find('.trad-text');
  const simpText = container.find('.simp-text');
  if (!tradText.length || !simpText.length) return;

  container.off('click.helpToggle').on('click.helpToggle', function() {
    if (simpText.is(':visible')) {
      simpText.hide();
      tradText.show();
    } else {
      tradText.hide();
      simpText.show();
    }
  });

  tradText.show();
  simpText.hide();
};

const helpBlocks = popup.find('.tag-help');
bindHelpToggle(helpBlocks.eq(0));
bindHelpToggle(helpBlocks.eq(1));
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
const variantSelect = popup.find('#trad-variant');
    const saveTagBtn = popup.find('#save-custom-tag-btn');
    const clearTagBtn = popup.find('#clear-custom-tag-btn');
    const savedTagWrap = popup.find('#saved-tag-list-wrap');
    const savedTagList = popup.find('#saved-tag-list');

    const renderSavedTagList = () => {
      const list = loadSavedTagList();
      savedTagList.empty();

      if (!list.length) {
        savedTagList.append('<span style="font-size:15px; color:#888;">尚未保存任何標籤</span>');
        return;
      }

      list.forEach((item, index) => {
        const row = $(`
          <div style="display:grid; grid-template-columns:38px 1fr 1fr 56px; gap:6px; align-items:center;">
            <div style="font-size:15px; color:#aaa; text-align:center;">${index + 1}</div>
            <input type="text" class="saved-tag-note" data-tag-index="${index}" value="${String(item.note ?? '').replace(/"/g, '&quot;')}" placeholder="備註" style="min-width:0; padding:6px; font-size:15px; background:#262626; color:#eee; border:1px solid #555; border-radius:4px;">
            <button type="button" class="menu_button saved-tag-item" data-tag-index="${index}" style="margin:0; padding:6px 8px; font-size:15px; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${String(item.tag).replace(/"/g, '&quot;')}">${item.tag}</button>
            <button type="button" class="menu_button saved-tag-delete" data-tag-index="${index}" style="margin:0; width:56px; height:34px; padding:0; font-size:15px; line-height:1;">刪除</button>
          </div>
        `);

        row.find('.saved-tag-item').on('click', () => {
          const { changed, value } = appendUniqueTag(tagInput.val(), item.tag);
          tagInput.val(value);
          localStorage.setItem(TAG_STORAGE_KEY, value);
          tagInput.trigger('focus');
          if (changed) toastr.success('已附加保存標籤', '', { timeOut: 1000 });
          else toastr.info('標籤已存在，不重複附加', '', { timeOut: 1000 });
        });

        row.find('.saved-tag-note').on('change', function() {
          const i = Number($(this).data('tag-index'));
          const nextList = loadSavedTagList();
          if (!nextList[i]) return;
          nextList[i].note = String(this.value ?? '').trim();
          saveTagList(nextList);
        });

        row.find('.saved-tag-delete').on('click', function() {
          const i = Number($(this).data('tag-index'));
          const nextList = loadSavedTagList().filter((_, idx) => idx !== i);
          saveTagList(nextList);
          renderSavedTagList();
          toastr.success('已刪除保存標籤', '', { timeOut: 900 });
        });

        savedTagList.append(row);
      });
    };
    renderSavedTagList();

    presetSelect.on('change', function() {
      const val = this.value;
      if (!val) return;
      const { changed, value } = appendUniqueTag(tagInput.val(), val);
      tagInput.val(value);
      tagInput.trigger('focus');   // 新增
      localStorage.setItem(TAG_STORAGE_KEY, value);
      if (!changed) {
        toastr.info('範例標籤已存在，不重複附加', '', { timeOut: 1000 });
      }
      this.value = '';
    });

    tagInput.on('input', function() {
      localStorage.setItem(TAG_STORAGE_KEY, this.value.trim());
    });

        saveTagBtn.on('click', function() {
      const currentTag = String(tagInput.val() ?? '').trim();
      const savedTag = saveTagToList(currentTag);
      renderSavedTagList();

      if (!savedTag) {
        toastr.info('請先輸入標籤內容', '', { timeOut: 900 });
        return;
      }
      if (savedTag.status === 'exists') {
        toastr.info('標籤已存在，未重複保存', '', { timeOut: 1000 });
        return;
      }

      toastr.success('標籤已保存', '', { timeOut: 1000 });
    });

    clearTagBtn.on('click', function() {
      tagInput.val('');
      localStorage.setItem(TAG_STORAGE_KEY, '');
      tagInput.trigger('focus');
      toastr.success('已清空標籤輸入', '', { timeOut: 900 });
    });

// 新增：繁體變體選擇
variantSelect.on('change', function() {
  const val = this.value;
  localStorage.setItem(VARIANT_STORAGE_KEY, val);

let labelt = '官版繁體';
if (val === 'tw') labelt = '台版繁體';
else if (val === 'hk') labelt = '港版繁體';
else if (val === 'twp') labelt = '台版繁體+詞語轉換';

toastr.success(`已切換為 ${labelt}`, '', { timeOut: 1100 });

  console.log('variant:', val);
  console.log('convTradTWP:', convTradTWP);
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
  <a id="${MENU_ID}" class="list-group-item opencc-btn" href="javascript:void(0)">
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


// 建立觀察器
const observer = new IntersectionObserver((entries) => {
  const allMsgs = getChatMessages();

  entries.forEach(entry => {
    if (!entry.isIntersecting) return;

    const el = entry.target;

    if (el.dataset.converted === 'true') return;

    const elements = Array.from(document.querySelectorAll('.mes'))
      .filter(e => !e.closest('#message_template'));

    const index = elements.indexOf(el);
    if (index === -1) return;

    const msgObj = allMsgs[index];
    if (!msgObj) return;

    let msg = String(msgObj.message || '');
    if (!msg) return;

    let newMsg = msg;

    // 👉 你的轉換
    const receiveMode = getState('auto-trad') ? 'traditional' :
                        getState('auto-simp') ? 'simplified' : null;

    if (receiveMode) {
      newMsg = convert(newMsg, receiveMode);
    }

    if (newMsg !== msg) {
      setChatMessages(
        [{ message_id: msgObj.message_id, message: newMsg }],
        { refresh: 'affected' }
      );
    }

    el.dataset.converted = 'true';
  });
}, {
  root: null,
  threshold: 0,
  rootMargin: '300px'
});

// Observe綁定
window.observeAllMessages = function () {
  const elements = Array.from(document.querySelectorAll('.mes'))
    .filter(el => !el.closest('#message_template'));

  console.log('valid:', elements.length);

  elements.forEach(el => {
    if (!el.dataset.observing) {
      observer.observe(el);
      el.dataset.observing = 'true';
    }
  });
};

setTimeout(() => {
  console.log('manual run');
  observeAllMessages();
}, 2000);

  /* =========================
      自動轉換回覆（包含自訂 tag）
  ========================== */
eventOn(tavern_events.MESSAGE_RECEIVED, async (msgId) => {
  if (msgId !== getLastMessageId()) return;

  const msgs = getChatMessages(msgId);
  if (!msgs?.[0]) return;
  let msg = String(msgs[0].message || '');
  if (!msg) return;

  let newMsg = msg;

  // Step 1: receive 模式（整則訊息轉換）
  const receiveMode = getState('auto-trad') ? 'traditional' :
                      getState('auto-simp') ? 'simplified' : null;
  if (receiveMode) {
    newMsg = convert(newMsg, receiveMode);
  }

  // Step 2: 標籤模式（多個標籤內容轉換）
  const tagMode = getState('tag-trad') ? 'traditional' :
                  getState('tag-simp') ? 'simplified' : null;
  if (tagMode) {
    const tagInput = localStorage.getItem(TAG_STORAGE_KEY) || '[IMG_GEN]';
    const tagConfigs = parseCustomTags(tagInput);
    if (tagConfigs.length > 0) {
      newMsg = await convertCustomTags(newMsg, tagMode, tagConfigs);
    }
  }

  // 如果有變化才更新
  if (newMsg !== msg) {
    await setChatMessages(
      [{ message_id: msgId, message: newMsg }],
      { refresh: 'affected' }
    );

    let toastText = '';
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
        ? `${tagCount} 個標籤內容已轉為繁體`
        : `${tagCount} 个标签内容已转为简体`;
    }

    if (toastText) {
      toastr.success(toastText, '', { timeOut: 1100 });
    }
  }
});

  console.log('[OpenCC] 腳本完成初始化');
