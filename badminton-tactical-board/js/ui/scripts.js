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

function migrateShot(shot) {
  if (!shot) return shot;

  if (shot.isSetup) {
    if (shot.previewPositions === undefined) {
      shot.previewPositions = null;
    }
    if (shot.interception === undefined) {
      shot.interception = null;
    }
    return shot;
  }

  if (shot.interception === undefined) {
    shot.interception = null;
  }

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

  const loadedShots = deepClone(script.data.shots || []);
  state.shots = loadedShots.map(migrateShot);

  state.history = [];
  state.redoHistory = [];

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
 *
 * 合併邏輯：
 *   用 name + type 找同名同類型的腳本
 *   - 相同 modifiedAt → 跳過
 *   - 匯入的較新 → 取代
 *   - 匯入的較舊 → 跳過
 *   - 沒找到 → 新增
 */
export function importScripts(jsonData) {
  initScriptLibrary();
  try {
    const parsed = JSON.parse(jsonData);

    let importedScripts;
    if (Array.isArray(parsed)) {
      importedScripts = parsed;
    } else if (parsed && Array.isArray(parsed.scripts)) {
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
      // 確保 modifiedAt 存在
      if (!s.data.modifiedAt) {
        s.data.modifiedAt = new Date(0).toISOString(); // 很早的時間
      }
    });

    // 合併策略：詢問使用者
    const hasExisting = scriptLibrary.length > 0;
    let mergeMode = 'smart'; // 預設智慧合併

    if (hasExisting) {
      const answer = confirm(
        `目前已有 ${scriptLibrary.length} 個腳本。\n\n` +
        `點「確定」= 智慧合併（比對時間戳，新的取代舊的）\n` +
        `點「取消」= 取代（清空現有，只保留導入）`
      );
      mergeMode = answer ? 'smart' : 'replace';
    }

    if (mergeMode === 'replace') {
      // 取代模式：直接清空
      scriptLibrary = importedScripts;
    } else {
      // 智慧合併模式
      let addedCount = 0;
      let replacedCount = 0;
      let skippedCount = 0;

      importedScripts.forEach(imported => {
        // 用 name + type 找現有腳本
        const existingIndex = scriptLibrary.findIndex(
          existing => existing.name === imported.name && existing.type === imported.type
        );

        if (existingIndex === -1) {
          // 沒找到，新增
          scriptLibrary.push(imported);
          addedCount++;
        } else {
          // 找到，比對時間戳
          const existing = scriptLibrary[existingIndex];
          const existingTime = existing.data?.modifiedAt || new Date(0).toISOString();
          const importedTime = imported.data?.modifiedAt || new Date(0).toISOString();

          if (importedTime > existingTime) {
            // 匯入的較新 → 取代
            scriptLibrary[existingIndex] = imported;
            replacedCount++;
          } else {
            // 匯入的較舊或相同 → 跳過
            skippedCount++;
          }
        }
      });

      showToast(
        `智慧合併完成：新增 ${addedCount}、取代 ${replacedCount}、跳過 ${skippedCount}`
      );
    }

    currentScriptId = scriptLibrary[0].id;
    saveToStorage();
    loadScriptFromLibrary(currentScriptId);
    if (window.updateLogButton) window.updateLogButton();

    if (mergeMode === 'replace') {
      showToast(`導入成功（取代）：${importedScripts.length} 個腳本`);
    }
    return true;

  } catch (err) {
    console.error('導入失敗：', err);
    alert('無效的 JSON 檔案');
    return false;
  }
}

/**
 * 清空 localStorage
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