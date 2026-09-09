import { getState, setState } from '../core/state.js';
import { getShots } from '../core/state.js';
import { deepClone } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';

let scriptLibrary = [
  { id: 'script_1', name: '預設戰術 1 (單打攻防v4.85版)', type: 'singles', data: null }
];
let currentScriptId = 'script_1';

// ========== 腳本管理 ==========

export function getScriptLibrary() { return scriptLibrary; }
export function getCurrentScriptId() { return currentScriptId; }

export function syncCurrentToLibrary() {
  const state = getState();
  const script = scriptLibrary.find(s => s.id === currentScriptId);
  if (script) {
    script.data = {
      mode: state.mode,
      appMode: state.appMode,
      shots: deepClone(state.shots)
    };
    script.type = state.mode;
  }
}

export function loadScriptFromLibrary(id) {
  const script = scriptLibrary.find(s => s.id === id);
  if (!script || !script.data) return;

  currentScriptId = id;
  const state = getState();
  state.mode = script.data.mode || script.type || 'singles';
  state.shots = deepClone(script.data.shots);
  state.history = [];
  state.redoHistory = [];

  // 更新 UI
  document.querySelectorAll('.mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === state.mode)
  );

  // 觸發重新渲染
  if (window.setCurrentShot) window.setCurrentShot(0);
  if (window.updateHUD) window.updateHUD();
  updateScriptsList();
  showToast(`已載入腳本：${script.name}`);
}

export function addScript(type, name) {
  const newId = 'script_' + Date.now();
  scriptLibrary.push({
    id: newId,
    name: name,
    type: type,
    data: null
  });
  currentScriptId = newId;
  updateScriptsList();
  return newId;
}

export function deleteScript(id) {
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
  const script = scriptLibrary.find(s => s.id === id);
  if (!script) return false;
  if (newName && newName.trim() !== '') {
    script.name = newName.trim();
    updateScriptsList();
    return true;
  }
  return false;
}

export function updateScriptsList() {
  const list = document.getElementById('scripts-list');
  if (!list) return;

  list.innerHTML = scriptLibrary.map(s => `
    <div class="script-item-wrap">
      <div class="popup-item ${s.id === currentScriptId ? 'current' : ''}" onclick="window.loadScriptFromLibrary('${s.id}')">
        ${s.name}
      </div>
      <div class="script-action-btns">
        <button class="btn-edit-script" onclick="window.promptEditScript('${s.id}')" title="修改名稱">✎</button>
        <button class="btn-del-script" onclick="window.deleteScript('${s.id}')" title="刪除">✕</button>
      </div>
    </div>
  `).join('');
}

// 導出/導入
export function exportAllScripts() {
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
  try {
    const imported = JSON.parse(jsonData);
    if (Array.isArray(imported) && imported.length > 0) {
      scriptLibrary = imported;
      loadScriptFromLibrary(scriptLibrary[0].id);
      showToast('腳本庫導入成功！');
      return true;
    }
    alert('JSON 格式不符');
    return false;
  } catch (err) {
    alert('無效的 JSON 檔案');
    return false;
  }
}