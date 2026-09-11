import { getState, setState } from '../core/state.js';
import { getShots } from '../core/state.js';
import { deepClone } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { getShotDuration, getTotalRallyDuration } from '../core/physics.js';

// ========== 常數 ==========
const STORAGE_KEY = 'btb_script_library_v0.2';
const CURRENT_KEY = 'btb_current_script_id_v0.2';

// ========== 腳本資料結構 ==========
// {
//   id: string,
//   name: string,
//   type: 'singles' | 'doubles' | '2v1' | '3v1',
//   data: {
//     mode: string,
//     appMode: string,
//     shots: array,
//     diagnostics: array,
//     modifiedAt: string
//   }
// }

let scriptLibrary = [];
let currentScriptId = null;

// ========== localStorage 操作 ==========

/**
 * 儲存腳本庫到 localStorage
 */
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scriptLibrary));
    if (currentScriptId) {
      localStorage.setItem(CURRENT_KEY, currentScriptId);
    }
  } catch (err) {
    console.warn('localStorage 儲存失敗：', err);
  }
}

/**
 * 從 localStorage 載入腳本庫
 */
function loadFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        scriptLibrary = parsed;
        const storedCurrentId = localStorage.getItem(CURRENT_KEY);
        if (storedCurrentId && scriptLibrary.find(s => s.id === storedCurrentId)) {
          currentScriptId = storedCurrentId;
        } else {
          currentScriptId = scriptLibrary[0].id;
        }
        return true;
      }
    }
  } catch (err) {
    console.warn('localStorage 載入失敗：', err);
  }
  return false;
}

// ========== 腳本庫初始化 ==========

/**
 * 建立預設腳本
 */
function createDefaultScript() {
  return {
    id: 'script_' + Date.now(),
    name: '[單打]001',
    type: 'singles',
    data: {
      mode: 'singles',
      appMode: 'smart',
      shots: [],
      diagnostics: [],
      modifiedAt: new Date().toISOString()
    }
  };
}

/**
 * 初始化腳本庫
 * 優先從 localStorage 載入；若無，建立預設
 */
function initScriptLibrary() {
  if (scriptLibrary.length === 0) {
    const loaded = loadFromStorage();
    if (!loaded) {
      const defaultScript = createDefaultScript();
      scriptLibrary.push(defaultScript);
      currentScriptId = defaultScript.id;
      saveToStorage();
    }
  }
}

// ========== 舊腳本遷移 ==========

/**
 * 修復舊腳本：補上新欄位
 */
function migrateShot(shot) {
  if (!shot) return shot;

  // 第 0 拍
  if (shot.isSetup) {
    if (shot.previewPositions === undefined) {
      shot.previewPositions = null;
    }
    if (shot.interception === undefined) {
      shot.interception = null;
    }
    return shot;
  }

  // 第 1 拍以後
  if (shot.interception === undefined) {
    shot.interception = null;
  }

  // previewPositions：若無，從 players 生成
  if (!shot.previewPositions && shot.players) {
    shot.previewPositions = {};
    const striker = shot.striker;
    const defender = striker === 'A' ? 'B' : 'A';
    const strikerSide = striker === 'A' ? 1 : -1;
    const defenderSide = defender === 'A' ? 1 : -1;

    Object.keys(shot.players).forEach(id => {
      if (id.startsWith(striker)) {
        shot.previewPositions[id] = { x: 0, z: strikerSide * 3.35 };
      } else {
        shot.previewPositions[id] = {
          x: shot.ballTo?.x || 0,
          z: shot.ballTo?.z || defenderSide * 3.35
        };
      }
    });
  }

  return shot;
}

// ========== 公開 API ==========

export function getScriptLibrary() {
  initScriptLibrary();
  return scriptLibrary;
}

export function getCurrentScriptId() {
  initScriptLibrary();
  return currentScriptId;
}

export function getCurrentScriptName() {
  initScriptLibrary();
  const script = scriptLibrary.find(s => s.id === currentScriptId);
  return script ? script.name : '未命名';
}

export function getScriptTypeLabel(type) {
  const labels = { singles: '單打', doubles: '雙打', '2v1': '2-1式', '3v1': '3-1式' };
  return labels[type] || type;
}

export function syncCurrentToLibrary() {
  initScriptLibrary();
  const state = getState();
  const script = scriptLibrary.find(s => s.id === currentScriptId);
  if (script) {
    script.data = {
      mode: state.mode,
      appMode: state.appMode,
      shots: deepClone(state.shots),
      diagnostics: script.data?.diagnostics || [],
      modifiedAt: new Date().toISOString()
    };
    script.type = state.mode;
    saveToStorage();
  }
}

export function loadScriptFromLibrary(id) {
  initScriptLibrary();
  const script = scriptLibrary.find(s => s.id === id);
  if (!script || !script.data) return;

  currentScriptId = id;
  const state = getState();
  state.mode = script.data.mode || script.type || 'singles';
  state.appMode = script.data.appMode || 'smart';

  // 複製 shots，並修復舊腳本
  const loadedShots = deepClone(script.data.shots || []);
  state.shots = loadedShots.map(migrateShot);

  state.history = [];
  state.redoHistory = [];

  // 儲存當前腳本 ID
  saveToStorage();

  if (window.setCurrentShot) window.setCurrentShot(0);
  if (window.updateHUD) window.updateHUD();
  if (window.updateParamPanel) window.updateParamPanel();
  if (window.updateLog) window.updateLog();
  updateScriptsList();
  showToast(`已載入腳本：${script.name}`);
}

export function addScript(type, name) {
  initScriptLibrary();
  const newId = 'script_' + Date.now();
  scriptLibrary.push({
    id: newId,
    name: name,
    type: type,
    data: {
      mode: type,
      appMode: 'smart',
      shots: [],
      diagnostics: [],
      modifiedAt: new Date().toISOString()
    }
  });
  currentScriptId = newId;
  updateScriptsList();
  saveToStorage();
  return newId;
}

export function deleteScript(id) {
  initScriptLibrary();
  if (scriptLibrary.length <= 1) {
    showToast('至少需保留一個腳本');
    return false;
  }
  if (!confirm('確定刪除此腳本？此操作無法撤銷。')) return false;

  scriptLibrary = scriptLibrary.filter(s => s.id !== id);
  if (currentScriptId === id) {
    loadScriptFromLibrary(scriptLibrary[0].id);
  } else {
    updateScriptsList();
    saveToStorage();
  }
  return true;
}

export function editScriptName(id, newName) {
  initScriptLibrary();
  const script = scriptLibrary.find(s => s.id === id);
  if (!script) return false;
  if (newName && newName.trim() !== '') {
    script.name = newName.trim();
    updateScriptsList();
    saveToStorage();
    if (window.updateLogButton) window.updateLogButton();
    return true;
  }
  return false;
}

export function updateScriptsList() {
  initScriptLibrary();
  const list = document.getElementById('scripts-list');
  if (!list) return;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  list.innerHTML = scriptLibrary.map(s => {
    const isCurrent = s.id === currentScriptId;
    const shots = s.data?.shots || [];
    const totalShots = shots.length > 0 ? shots.length - 1 : 0;
    const modifiedDate = s.data?.modifiedAt ? s.data.modifiedAt.slice(0, 10) : dateStr;
    const typeLabel = getScriptTypeLabel(s.type || s.data?.mode || 'singles');

    return `
    <div class="script-item ${isCurrent ? 'current' : ''}" onclick="window.loadScriptFromLibrary('${s.id}')">
      <div class="info">
        <span class="name">${s.name}</span>
        <span class="meta">${typeLabel} · ${totalShots}拍 · ${modifiedDate}</span>
      </div>
      <div class="actions">
        <button class="btn-edit" onclick="event.stopPropagation();window.promptEditScript('${s.id}')">✎ 更名</button>
        <button class="btn-del" onclick="event.stopPropagation();window.deleteScript('${s.id}')">✕ 刪除</button>
      </div>
    </div>
  `}).join('');
}

// ========== 導入/導出 ==========

/**
 * 導出所有腳本
 */
export function exportAllScripts() {
  initScriptLibrary();
  syncCurrentToLibrary();

  const exportData = {
    version: '0.2A',
    exportedAt: new Date().toISOString(),
    scripts: scriptLibrary
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `badminton_tactics_${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

/**
 * 匯入腳本
 * 支援兩種格式：
 * 1. 新格式：{ version, exportedAt, scripts: [...] }
 * 2. 舊格式：直接是陣列 [...]
 */
export function importScripts(jsonData) {
  initScriptLibrary();
  try {
    const parsed = JSON.parse(jsonData);

    // 判斷格式
    let importedScripts;
    if (Array.isArray(parsed)) {
      // 舊格式：直接是陣列
      importedScripts = parsed;
    } else if (parsed && Array.isArray(parsed.scripts)) {
      // 新格式
      importedScripts = parsed.scripts;
    } else {
      alert('JSON 格式不符：需要腳本陣列或 { scripts: [...] }');
      return false;
    }

    // 驗證每個腳本
    const valid = importedScripts.every(s => s.id && s.name && s.type && s.data);
    if (!valid) {
      alert('JSON 格式不符：缺少必要欄位 (id, name, type, data)');
      return false;
    }

    // 修復舊腳本
    importedScripts.forEach(s => {
      if (s.data && Array.isArray(s.data.shots)) {
        s.data.shots = s.data.shots.map(migrateShot);
      }
    });

    // 合併策略：詢問使用者
    const hasExisting = scriptLibrary.length > 0;
    let mergeMode = 'replace'; // 預設取代

    if (hasExisting) {
      const answer = confirm(
        `目前已有 ${scriptLibrary.length} 個腳本。\n\n` +
        `點「確定」= 合併（保留現有 + 新增導入）\n` +
        `點「取消」= 取代（清空現有，只保留導入）`
      );
      mergeMode = answer ? 'merge' : 'replace';
    }

    if (mergeMode === 'replace') {
      scriptLibrary = importedScripts;
    } else {
      // 合併：避免 ID 衝突
      importedScripts.forEach(s => {
        if (scriptLibrary.find(existing => existing.id === s.id)) {
          s.id = 'script_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        }
        scriptLibrary.push(s);
      });
    }

    currentScriptId = scriptLibrary[0].id;
    saveToStorage();
    loadScriptFromLibrary(currentScriptId);
    if (window.updateLogButton) window.updateLogButton();
    showToast(`導入成功（${mergeMode === 'merge' ? '合併' : '取代'}）：${importedScripts.length} 個腳本`);
    return true;

  } catch (err) {
    console.error('導入失敗：', err);
    alert('無效的 JSON 檔案');
    return false;
  }
}

/**
 * 清空 localStorage（用於測試或重置）
 */
export function clearStorage() {
  if (!confirm('確定清空所有本地儲存的腳本？此操作無法撤銷。')) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(CURRENT_KEY);
  scriptLibrary = [];
  currentScriptId = null;
  initScriptLibrary();
  loadScriptFromLibrary(currentScriptId);
  showToast('已清空本地儲存');
}

// 初始化
initScriptLibrary();