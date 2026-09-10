import { getState, setState } from '../core/state.js';
import { getShots } from '../core/state.js';
import { deepClone } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';
import { getShotDuration, getTotalRallyDuration } from '../core/physics.js';

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

// 默認腳本
function createDefaultScript() {
  const state = getState();
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

// 初始化腳本庫
function initScriptLibrary() {
  if (scriptLibrary.length === 0) {
    const defaultScript = createDefaultScript();
    scriptLibrary.push(defaultScript);
    currentScriptId = defaultScript.id;
  }
}

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
  state.shots = deepClone(script.data.shots);
  state.history = [];
  state.redoHistory = [];

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

// 導出/導入 (JSON)
export function exportAllScripts() {
  initScriptLibrary();
  syncCurrentToLibrary();
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(scriptLibrary, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `badminton_tactics_${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export function importScripts(jsonData) {
  initScriptLibrary();
  try {
    const imported = JSON.parse(jsonData);
    if (Array.isArray(imported) && imported.length > 0) {
      const valid = imported.every(s => s.id && s.name && s.type && s.data);
      if (!valid) {
        alert('JSON 格式不符：缺少必要欄位 (id, name, type, data)');
        return false;
      }
      scriptLibrary = imported;
      loadScriptFromLibrary(scriptLibrary[0].id);
      if (window.updateLogButton) window.updateLogButton();
      showToast('腳本庫導入成功！');
      return true;
    }
    alert('JSON 格式不符：需要陣列');
    return false;
  } catch (err) {
    alert('無效的 JSON 檔案');
    return false;
  }
}

// 初始化
initScriptLibrary();