  console.log("[OpenCC 2.5.2] script start");
  const opencc_local_file = '/opencc-js-1.0.5.esm.js';
  // 模組的路徑包含檔名，路徑從本地酒館根目錄開始。例如模組若在C:\AI\SillyTavern\public\localfile\opencc，就設為'/localfile/opencc/opencc-js-1.0.5.esm.js'
  // 若設為空或註解掉或找不到本地檔，會自動從網路抓

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
const UI_FONT_SIZE_KEY = 'opencc_ui_font_size_percent';
const UI_FONT_SIZE_DEFAULT = 65;
const DEFAULT_VARIANT = 't';  // 官版
const toast = (type, message, title = '', options = {}) => {
  const toastOptions = {
    closeOnHover: false,
    extendedTimeOut: 200,
    ...options,
  };
  return toastr[type](message, title, toastOptions);
};

  const MENU_ID = 'th-custom-extension-menu-item';
  const MENU_NAME = 'OpenCC';

// 頂層變數：三個 converter
let convTradT = null;   // 官版 t
let convTradTW = null;  // 台版 tw
let convTradHK = null;  // 港版 hk
let convSimp = null;
let convTradTWP = null; // 台版詞語轉繁
let convTWPToSimp = null; // 台版詞語轉簡
let openccManualConverting = false; // 手動本樓轉換期間，暫停自動轉換事件

// OpenCC 模組載入：本地優先，CDN 備援
const loadOpenCCModule = async () => {
  const localSource = String((typeof opencc_local_file !== 'undefined' ? opencc_local_file : '') || '').trim();
  const remoteSources = [
    'https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/+esm',
    'https://testingcf.jsdelivr.net/npm/opencc-js@1.0.5/+esm',
  ];

  let lastErr = null;

  // 先探測本地檔是否存在且回傳 JS MIME，避免缺檔時瀏覽器噴出 module MIME 錯誤
  if (localSource) {
    try {
      const probe = await fetch(localSource, { method: 'GET', cache: 'no-store' });
      const ct = String(probe.headers.get('content-type') || '').toLowerCase();
      const okMime = ct.includes('javascript') || ct.includes('ecmascript') || ct.includes('text/plain');
      if (probe.ok && okMime) {
        const mod = await import(localSource);
        console.info('[OpenCC] module loaded from:', localSource);
        return mod;
      }
    } catch (err) {
      // local probe failed; fallback to CDN
    }
  }

  if (localSource) {
    console.info('[OpenCC] local module not found, fallback to CDN');
  } else {
    console.info('[OpenCC] local module disabled, fallback to CDN');
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

const exportSavedTagListText = (list) => {
  const lines = [
    '# OpenCC custom tag list',
    '# format: tag<TAB>note',
    '# one item per line',
  ];
  list.forEach((item) => {
    const tag = String(item?.tag ?? '').trim();
    if (!tag) return;
    const note = String(item?.note ?? '').replace(/\r?\n/g, ' ').trim();
    lines.push(`${tag}\t${note}`);
  });
  return lines.join('\n');
};

const parseSavedTagListText = (text) => {
  const rows = String(text ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

  const seen = new Set();
  const result = [];

  rows.forEach((line) => {
    const [tagPart, ...noteParts] = line.split('\t');
    const tag = String(tagPart ?? '').trim();
    if (!tag || seen.has(tag)) return;
    const note = noteParts.join('\t').trim();
    seen.add(tag);
    result.push({ tag, note });
  });

  return result.slice(0, 50);
};

const saveTagToList = (tagValue) => {
  const tag = String(tagValue ?? '').trim();
  if (!tag) return null;
  const list = loadSavedTagList();
  if (list.some(item => item.tag === tag)) {
    return { status: 'exists', tag };
  }
  const next = [{ tag, note: '' }, ...list].slice(0, 50);
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
      const safeInner = String(inner);
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

// 👉 本輪訊息轉換（從最後一個 user 樓層後開始）
eventOn(getButtonEvent(t.LAST_TRAD), () =>
  convertLatestRoundMessages('traditional')
);

eventOn(getButtonEvent(t.LAST_SIMP), () =>
  convertLatestRoundMessages('simplified')
);

// convertInput：去掉 async / await
const convertInput = (mode) => {
  const input = $('#send_textarea');
  if (!input.length) return toast('error', '找不到輸入框', '', { timeOut: 1500 });
  const val = String(input.val() ?? '');
  if (!val) return;

  input
    .val(convert(val, mode))
    .trigger('input')
    .trigger('focus');

  toast('success', 
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
    return toast('error', '找不到輸入框', '', { timeOut: 1500 });
  }

  const val = String(input.val() ?? '');
  if (!val) return;

  // 第一次點擊 → 提示
  if (!clearConfirm) {
    clearConfirm = true;
flashDanger();
    toast('warning', '再點一次「清空」即可清除', '', {
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

  toast('success', '已清空輸入', '', { timeOut: 1100 });
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

const convertDisplayedRoundMessageDOM = (roundMsgs, mode) => {
  const convertTextNodesInRoot = (root) => {
    if (!root) return false;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let changed = false;

    while (node) {
      const src = String(node.nodeValue ?? '');
      if (src.trim()) {
        const dst = convert(src, mode);
        if (dst !== src) {
          node.nodeValue = dst;
          changed = true;
        }
      }
      node = walker.nextNode();
    }
    return changed;
  };

  const convertIframeTree = (rootEl) => {
    if (!rootEl) return false;
    let changed = false;

    const iframes = Array.from(rootEl.querySelectorAll('iframe'));
    iframes.forEach((frame) => {
      try {
        const doc = frame.contentDocument || frame.contentWindow?.document;
        if (!doc) return;
        if (convertTextNodesInRoot(doc.body || doc.documentElement)) {
          changed = true;
        }
      } catch (err) {
        // cross-origin iframe cannot be accessed
      }
    });

    return changed;
  };
  let changedRows = 0;
  const ids = Array.from(new Set((roundMsgs || []).map(item => Number(item.message_id)).filter(Number.isFinite)));
  if (!ids.length) return 0;

  ids.forEach((messageId) => {
    const $display = retrieveDisplayedMessage(messageId);
    if (!$display?.length) return;

    const root = $display.get(0);
    if (!root) return;

    const changedInMain = convertTextNodesInRoot(root);
    const changedInIframe = convertIframeTree(root);
    if (changedInMain || changedInIframe) changedRows += 1;
  });

  return changedRows;
};




const convertLatestRoundMessages = async (mode) => {
  openccManualConverting = true;
  try {
  const lastMessageId = getLastMessageId();
  if (lastMessageId < 0) return;

  const allMsgs = getChatMessages(`0-${lastMessageId}`);
  if (!allMsgs?.length) return;

  let lastUserMessageId = -1;
  for (let i = allMsgs.length - 1; i >= 0; i--) {
    if (allMsgs[i].role === 'user') {
      lastUserMessageId = allMsgs[i].message_id;
      break;
    }
  }

  const roundMsgs = allMsgs.filter((item) =>
    item.message_id > lastUserMessageId &&
    item.role !== 'user' &&
    String(item.message ?? '').trim()
  );

  if (!roundMsgs.length) {
    toast('info', '本輪沒有可轉換內容', '', { timeOut: 1000 });
    return;
  }

  const tagMode = getState('tag-trad') ? 'traditional' :
                  getState('tag-simp') ? 'simplified' : null;
  const tagInput = localStorage.getItem(TAG_STORAGE_KEY) || '[IMG_GEN]';
  const tagConfigs = parseCustomTags(tagInput);

  // 先做資料層轉換（補回標籤功能）
  const updates = [];
  for (const item of roundMsgs) {
    const original = String(item.message ?? '');
    if (!original) continue;

    // 資料層只處理標籤內文；整體繁簡交給顯示層
    let converted = original;
    if (tagMode && tagConfigs.length > 0) converted = await convertCustomTags(converted, tagMode, tagConfigs);

    if (converted !== original) {
      updates.push({ message_id: item.message_id, message: converted });
    }
  }

  if (updates.length) {
    await setChatMessages(updates, { refresh: 'affected' });
  }

  // 等待本輪樓層完成重繪後，再對整輪顯示層補轉，避免只命中最後一樓
  await new Promise(resolve => setTimeout(resolve, 300));
  const domChangedCount = convertDisplayedRoundMessageDOM(roundMsgs, mode);

  if (!domChangedCount) {
    toast('info', '本輪訊息無需轉換', '', { timeOut: 1000 });
    return;
  }

  let toastText = mode === 'traditional'
    ? `本輪已轉繁體（畫面更新 ${domChangedCount} 樓）`
    : `本轮已转简体（画面更新 ${domChangedCount} 楼）`;

  if (tagMode && tagConfigs.length > 0) {
    toastText += mode === 'traditional'
      ? `（含 ${tagConfigs.length} 個標籤）`
      : `（含 ${tagConfigs.length} 个标签）`;
  } else if (tagMode) {
    toastText += mode === 'traditional' ? '（標籤無效）' : '（标签无效）';
  }

  toast('success', toastText, '', { timeOut: 1200 });
  } finally {
    // 給渲染事件一點時間，避免手動轉換後立刻被自動模式覆蓋
    setTimeout(() => { openccManualConverting = false; }, 800);
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
        font-size:calc(2rem * var(--opencc-font-scale, 0.65));
      }

      .th-custom-popup-ui label{
      font-size:calc(1.2rem * var(--opencc-font-scale, 0.65)); /* 縮小字體 */
      line-height:1.2; /* 調整行距 */
      }
  #custom-tag-input{
    font-size:calc(1.4rem * var(--opencc-font-scale, 0.65));
  }
    }
  `;
  document.head.appendChild(style);
}
    const normalizeUIFontSizePercent = (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) return UI_FONT_SIZE_DEFAULT;
      return Math.max(40, Math.min(120, numeric));
    };
    const getUIFontSizePercent = () => {
      const raw = localStorage.getItem(UI_FONT_SIZE_KEY);
      const normalized = normalizeUIFontSizePercent(raw);
      if (String(raw ?? '') !== String(normalized)) {
        localStorage.setItem(UI_FONT_SIZE_KEY, String(normalized));
      }
      return normalized;
    };
    const setUIFontSizePercent = (nextPercent) => {
      const normalized = normalizeUIFontSizePercent(nextPercent);
      localStorage.setItem(UI_FONT_SIZE_KEY, String(normalized));
      return normalized;
    };
    const fs = (size) => `calc(${size} * var(--opencc-font-scale, 0.65))`;
    const ui = {
      checkboxLabel: `margin:0; cursor:pointer; color:#eee; line-height:1.2; font-size:${fs('1.8rem')}; flex:1;`,
      select: `width:100%; padding:10px; font-size:${fs('1.8rem')}; background:#2c2c2e; color:#eee; border:1px solid #555; border-radius:6px;`,
      input: `flex:1; padding:10px; font-size:${fs('1.8rem')}; background:#1e1e1e; color:#eee; border:1px solid #555; border-radius:6px; font-family:monospace;`,
      smallBtn: `white-space:nowrap; min-width:56px; height:34px; padding:0 8px; font-size:${fs('1.5rem')}; line-height:1;`,
      smallBtnFixed: `white-space:nowrap; width:56px; height:34px; padding:0; font-size:${fs('1.5rem')};`,
      helpText: `margin-top:6px; font-size:${fs('1.6rem')}; color:#aaa; line-height:1.4;`,
      summary: `cursor:pointer; color:#ddd; font-size:${fs('1.8rem')}; list-style:none;`,
    };
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
<label for="${item.id}" style="${ui.checkboxLabel}">
          ${item.name}
        </label>
      </div>
    `).join('');

const variantSection = `
  <div style="margin-top: 24px;">
    <select id="trad-variant" style="${ui.select}">
      <option value="t" ${localStorage.getItem(VARIANT_STORAGE_KEY) === 't' || !localStorage.getItem(VARIANT_STORAGE_KEY) ? 'selected' : ''}>官版繁體 (t)</option>
      <option value="tw" ${localStorage.getItem(VARIANT_STORAGE_KEY) === 'tw' ? 'selected' : ''}>台版繁體 (tw)</option>
      <option value="hk" ${localStorage.getItem(VARIANT_STORAGE_KEY) === 'hk' ? 'selected' : ''}>港版繁體 (hk)</option>
      <option value="twp" ${localStorage.getItem(VARIANT_STORAGE_KEY) === 'twp' ? 'selected' : ''}>台版繁體+詞語转换 (twp)</option>
    </select>
    <div class="tag-help" style="${ui.helpText}">
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
  <div style="margin-top: 24px;">    <select id="tag-preset" style="${ui.select} margin-bottom:8px; padding:8px;">
      <option value="" selected disabled>標籤設定範例</option>
      <option value="[IMG]">例一：[tag][/tag]成對中括號</option>
      <option value="<action>">例二：&lt;tag&gt;&lt;/tag&gt;成對尖括號</option>
      <option value="<IMG prompt=|>">例三：豎線前tag1|豎線後tag2</option>
      <option value="[IMG_GEN],< |」">例四：多組之間用逗號</option>
    </select>
    <div style="display:flex; gap:8px; align-items:center;">
      <input type="text" id="custom-tag-input" value="${customTagValue}"
             placeholder="[tag] 或 <tag> 或 prefix|suffix"
style="${ui.input}">
      <button type="button" id="save-custom-tag-btn" class="menu_button" style="${ui.smallBtnFixed}">保存</button>
      <button type="button" id="clear-custom-tag-btn" class="menu_button" style="${ui.smallBtnFixed}">清除</button>
    </div>
    <details id="saved-tag-list-wrap" style="margin-top:8px; border:1px solid #555; border-radius:6px; padding:8px; background:#1f1f20;">
      <summary style="${ui.summary}">
        <span style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <span>自訂標籤列表</span>
          <span style="display:flex; align-items:center; gap:6px;">
            <button type="button" id="import-tag-list-btn" class="menu_button" style="${ui.smallBtn}">導入</button>
            <button type="button" id="export-tag-list-btn" class="menu_button" style="${ui.smallBtn}">導出</button>
          </span>
        </span>
      </summary>
      <input type="file" id="import-tag-list-file" accept=".txt,text/plain" style="display:none;">
      <div id="saved-tag-list" style="display:flex; flex-direction:column; gap:8px; margin-top:8px;"></div>
    </details>
<div class="tag-help" style="${ui.helpText}">
  <div class="trad-text">
    • 標籤設定可參考範例<br>
    • 勾選標籤內容轉為繁/簡體，標籤才有效<br>
    • 應用場景例如生圖的路徑，例如正則抓取<br>
    • 保存：保存到列表，上限50筆<br>
    • 清除：清除標籤輸入框內容<br>
    • 標籤列表內可自訂備註，方便點選
  </div>
  <div class="simp-text" style="display:none;">
    • 标签设定可参考范例<br>
    • 勾选标签内容转为繁/简体，标签才有效<br>
    • 应用场景例如生图的路径，例如正则抓取<br>
    • 保存：保存到列表，上限50笔<br>
    • 清除：清除标签输入框内容<br>
    • 标签列表内可自订备注，方便点选
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
  --opencc-font-scale:${getUIFontSizePercent() / 100};
">
        <div style="display:flex; align-items:center; justify-content:space-between; margin:0 0 20px; gap:8px;">
          <h3 style="margin:0; font-size:${fs('2.6rem')}; text-align:left; color:#eee;">Setting</h3>
          <div style="display:flex; align-items:center; gap:6px;">
            <button type="button" id="opencc-font-dec" class="menu_button" style="margin:0; min-width:32px; height:32px; padding:0 8px; font-size:${fs('1.6rem')}; line-height:1;">-</button>
            <button type="button" id="opencc-font-reset" class="menu_button" style="margin:0; min-width:64px; height:32px; padding:0 10px; font-size:${fs('1.4rem')}; line-height:1; white-space:nowrap;">字体</button>
            <button type="button" id="opencc-font-inc" class="menu_button" style="margin:0; min-width:32px; height:32px; padding:0 8px; font-size:${fs('1.6rem')}; line-height:1;">+</button>
          </div>
        </div>
        ${checkboxes}
        ${tagSection}
		${variantSection}
        <button type="button" class="menu_button th-custom-popup-close" style="
          margin-top:24px; width:100%; padding:12px; background:#f44336; color:white;
          border:none; border-radius:6px; cursor:pointer; font-size:${fs('2.1rem')}; transition: background 0.2s;">
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
        toast('success', `${item.name}：${checked ? 'ON' : 'OFF'}`, '', {timeOut:1100});
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
    const importTagListBtn = popup.find('#import-tag-list-btn');
    const exportTagListBtn = popup.find('#export-tag-list-btn');
    const importTagListFile = popup.find('#import-tag-list-file');
    importTagListBtn.add(exportTagListBtn).on('mousedown click', function(e) { e.stopPropagation(); });
    const fontDecBtn = popup.find('#opencc-font-dec');
    const fontResetBtn = popup.find('#opencc-font-reset');
    const fontIncBtn = popup.find('#opencc-font-inc');

    const applyPopupFontSize = (nextPercent) => {
      const finalPercent = setUIFontSizePercent(nextPercent);
      popup.css('--opencc-font-scale', `${finalPercent / 100}`);
      return finalPercent;
    };

    fontDecBtn.on('click', () => {
      const current = getUIFontSizePercent();
      applyPopupFontSize(current - 5);
    });
    fontIncBtn.on('click', () => {
      const current = getUIFontSizePercent();
      applyPopupFontSize(current + 5);
    });
    fontResetBtn.on('click', () => {
      applyPopupFontSize(UI_FONT_SIZE_DEFAULT);
      toast('success', '已恢復預設大小', '', {
        timeOut: 1000,
        extendedTimeOut: 200,
        closeOnHover: false
      });
    });

    const renderSavedTagList = () => {
      const list = loadSavedTagList();
      savedTagList.empty();
      const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      if (!list.length) {
        savedTagList.append('<span style="font-size:calc(1.5rem * var(--opencc-font-scale, 0.65)); color:#888;">尚未保存任何標籤</span>');
        return;
      }

      list.forEach((item, index) => {
        const safeTag = escapeHtml(item.tag);
        const safeNote = escapeHtml(item.note ?? '');
        const row = $(`
          <div style="display:grid; grid-template-columns:38px minmax(0,1fr) minmax(140px,1fr) 56px; gap:6px; align-items:center;">
            <div style="font-size:calc(1.5rem * var(--opencc-font-scale, 0.65)); color:#aaa; text-align:center;">${index + 1}</div>
            <input type="text" class="saved-tag-note" data-tag-index="${index}" value="${safeNote}" placeholder="備註" style="min-width:0; padding:6px; font-size:calc(1.5rem * var(--opencc-font-scale, 0.65)); background:#262626; color:#eee; border:1px solid #555; border-radius:4px;">
            <button type="button" class="menu_button saved-tag-item" data-tag-index="${index}" style="margin:0; width:100%; min-width:140px; max-width:100%; padding:6px 8px; font-size:calc(1.5rem * var(--opencc-font-scale, 0.65)); text-align:left;" title="${safeTag}"><span style="display:block; width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:left;">${safeTag}</span></button>
            <button type="button" class="menu_button saved-tag-delete" data-tag-index="${index}" style="margin:0; width:56px; height:34px; padding:0; font-size:calc(1.5rem * var(--opencc-font-scale, 0.65)); line-height:1;">刪除</button>
          </div>
        `);

        row.find('.saved-tag-item').on('click', () => {
          const { changed, value } = appendUniqueTag(tagInput.val(), item.tag);
          tagInput.val(value);
          localStorage.setItem(TAG_STORAGE_KEY, value);
          tagInput.trigger('focus');
          if (changed) toast('success', '已附加保存標籤', '', { timeOut: 1000 });
          else toast('info', '標籤已存在，不重複附加', '', { timeOut: 1000 });
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
          toast('success', '已刪除保存標籤', '', { timeOut: 900 });
        });

        savedTagList.append(row);
      });
    };
    renderSavedTagList();

    presetSelect.on('change', function() {
      const val = this.value;
      if (!val) return;
      tagInput.val(val);
      tagInput.trigger('focus');
      localStorage.setItem(TAG_STORAGE_KEY, val);
      toast('success', '已套用範例標籤', '', { timeOut: 1000 });
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
        toast('info', '請先輸入標籤內容', '', { timeOut: 900 });
        return;
      }
      if (savedTag.status === 'exists') {
        toast('info', '標籤已存在，保存已生效', '', { timeOut: 1000 });
        return;
      }

      toast('success', '標籤已保存', '', { timeOut: 1000 });
    });

    clearTagBtn.on('click', function() {
      tagInput.val('');
      localStorage.setItem(TAG_STORAGE_KEY, '');
      tagInput.trigger('focus');
      toast('success', '已清空標籤輸入', '', { timeOut: 900 });
    });

    exportTagListBtn.on('click', function() {
      const list = loadSavedTagList();
      const content = exportSavedTagListText(list);
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'opencc-custom-tag-list.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('success', '已導出標籤列表', '', { timeOut: 1000 });
    });

    importTagListBtn.on('click', function() {
      importTagListFile.val('');
      importTagListFile.trigger('click');
    });

    importTagListFile.on('change', function(event) {
      const file = event.target?.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const nextList = parseSavedTagListText(String(reader.result ?? ''));
        saveTagList(nextList);
        renderSavedTagList();
        toast('success', `已導入 ${nextList.length} 筆標籤`, '', { timeOut: 1000 });
      };
      reader.onerror = () => {
        toast('error', '導入失敗，請確認檔案格式', '', { timeOut: 1200 });
      };
      reader.readAsText(file, 'utf-8');
    });

// 新增：繁體變體選擇
variantSelect.on('change', function() {
  const val = this.value;
  localStorage.setItem(VARIANT_STORAGE_KEY, val);

let labelt = '官版繁體';
if (val === 'tw') labelt = '台版繁體';
else if (val === 'hk') labelt = '港版繁體';
else if (val === 'twp') labelt = '台版繁體+詞語轉換';

toast('success', `已切換為 ${labelt}`, '', { timeOut: 1100 });

  console.log('variant:', val);
  console.log('convTradTWP:', convTradTWP);
});


  };

  /* =========================
      加入 extensions menu
  ========================== */
  const injectMenu = () => {
    const menu = $('#extensionsMenu');
    if (!menu.length) return;
    const list = menu.find('.list-group').first().length ? menu.find('.list-group').first() : menu;
    list.find(`#${MENU_ID}, .opencc-btn`).remove();
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


// （已停用）舊版 IntersectionObserver 自動轉換，避免干擾目前顯示層/資料層流程

  /* =========================
      自動轉換回覆（顯示層）
  ========================== */
const autoConvertDisplayedById = async (msgId) => {
  if (openccManualConverting) return;
  await ensureConverter();
  const receiveMode = getState('auto-trad') ? 'traditional' :
                      getState('auto-simp') ? 'simplified' : null;
  if (!receiveMode) return;

  const msgs = getChatMessages(msgId);
  const msg0 = msgs?.[0];
  if (!msg0) return;
  if (String(msg0.role || '') === 'user') return;

  // 先做資料層（只轉標籤內文）
  if (msg0) {
    const original = String(msg0.message || '');
    if (original) {
      const tagMode = getState('tag-trad') ? 'traditional' :
                      getState('tag-simp') ? 'simplified' : null;
      let converted = original;
      if (tagMode) {
        const tagInput = localStorage.getItem(TAG_STORAGE_KEY) || '[IMG_GEN]';
        const tagConfigs = parseCustomTags(tagInput);
        if (tagConfigs.length > 0) {
          converted = await convertCustomTags(converted, tagMode, tagConfigs);
        }
      }
      if (converted !== original) {
        await setChatMessages(
          [{ message_id: msgId, message: converted }],
          { refresh: 'affected' }
        );
      }
    }
  }

  // 對齊按鈕流程：資料層標籤轉換後，延遲 300ms 再做一次顯示層轉換
  await new Promise(resolve => setTimeout(resolve, 300));
  convertDisplayedRoundMessageDOM([{ message_id: msgId }], receiveMode);
};

// 避免同一樓層在短時間內被多個事件重複觸發轉換
const OPENCC_AUTO_CONVERT_DEDUPE_MS = 500;
const openccAutoConvertRecent = new Map();
const openccAutoConvertPending = new Map();
const triggerAutoConvertByEvent = (msgId) => {
  if (openccManualConverting) return;
  const id = Number(msgId);
  if (!Number.isFinite(id) || id < 0) return;

  const now = Date.now();
  const lastAt = openccAutoConvertRecent.get(id) || 0;
  const elapsed = now - lastAt;
  if (elapsed < OPENCC_AUTO_CONVERT_DEDUPE_MS) {
    if (!openccAutoConvertPending.has(id)) {
      const waitMs = OPENCC_AUTO_CONVERT_DEDUPE_MS - elapsed;
      const timer = setTimeout(() => {
        openccAutoConvertPending.delete(id);
        openccAutoConvertRecent.set(id, Date.now());
        autoConvertDisplayedById(id).catch(() => {});
      }, waitMs);
      openccAutoConvertPending.set(id, timer);
    }
    return;
  }

  openccAutoConvertRecent.set(id, now);
  if (openccAutoConvertRecent.size > 200) {
    for (const [k, ts] of openccAutoConvertRecent) {
      if (now - ts > OPENCC_AUTO_CONVERT_DEDUPE_MS * 4) openccAutoConvertRecent.delete(k);
    }
  }

  autoConvertDisplayedById(id).catch(() => {});
};

eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED, (msgId) => {
  triggerAutoConvertByEvent(msgId);
});

eventOn(tavern_events.MESSAGE_RECEIVED, (msgId) => {
  triggerAutoConvertByEvent(msgId);
});

// 兼容其他腳本改寫訊息內容後的重渲染（例如 applyImagePromptInsertions）
eventOn(tavern_events.MESSAGE_UPDATED, (msgId) => {
  triggerAutoConvertByEvent(msgId);
});

  console.log('[OpenCC] 腳本完成初始化');

