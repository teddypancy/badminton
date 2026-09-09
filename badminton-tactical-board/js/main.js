// ========== 應用入口 ==========

// 導入所有模組
import { COURT, ARC_TYPES, DRAW_COLORS } from './config/constants.js';
import { showToast } from './utils/toast.js';
import { getState, setState, getShots, getCurrentShot, getCurrentIndex, setCurrentIndex, pushHistory, undo, redo } from './core/state.js';
import { getPlayers, getDefaultSetupPlayers, detectHitLevel } from './models/player.js';
import { getTrajectoryPoint, getShotDuration, getTotalRallyDuration, checkPhysics, getInterceptionInfo } from './core/physics.js';
import { newShot, initDemo, autoMatchShotProperties, applySmartPositions, cascadeBallPositions, updateShot1Server } from './models/shot.js';
import { resizeCanvas, render2D, m2px, px2m } from './2d/renderer.js';
import { initInteractions } from './2d/interactions.js';
import { initSideProfile, renderSideProfile } from './2d/sideprofile.js';
import { showMiniPopup, hideMiniPopup } from './2d/popup.js';
import { initScene, getScene, getCamera, getRenderer, getControls } from './3d/scene.js';
import { buildCourt, createShuttle, buildPlayers, sync3DPositions, clearBallTrail, getPlayerMeshes } from './3d/entities.js';
import { startAnimation, stopAnimation } from './3d/animation.js';
import { setCameraView } from './3d/controls.js';
import { updateShotInfo, updateHUD, updateParamPanel, updateLog } from './ui/panels.js';
import { getScriptLibrary, getCurrentScriptId, syncCurrentToLibrary, loadScriptFromLibrary, addScript, deleteScript, editScriptName, updateScriptsList, exportAllScripts, importScripts } from './ui/scripts.js';

// ========== 暴露全局函數給 HTML ==========

// 拍次操作
window.newShot = newShot;
window.initDemo = initDemo;
window.autoMatchShotProperties = autoMatchShotProperties;
window.applySmartPositions = applySmartPositions;
window.cascadeBallPositions = cascadeBallPositions;
window.updateShot1Server = updateShot1Server;

// 狀態操作
window.getState = getState;
window.getShots = getShots;
window.getCurrentShot = getCurrentShot;
window.getCurrentIndex = getCurrentIndex;
window.setCurrentIndex = setCurrentIndex;

// 2D
window.resizeCanvas = resizeCanvas;
window.render2D = render2D;
window.m2px = m2px;
window.px2m = px2m;
window.showMiniPopup = showMiniPopup;
window.hideMiniPopup = hideMiniPopup;

// 3D
window.sync3DPositions = sync3DPositions;
window.setCameraView = setCameraView;
window.clearBallTrail = clearBallTrail;

// UI
window.updateShotInfo = updateShotInfo;
window.updateHUD = updateHUD;
window.updateParamPanel = updateParamPanel;
window.updateLog = updateLog;
window.showToast = showToast;

// 腳本管理
window.getScriptLibrary = getScriptLibrary;
window.getCurrentScriptId = getCurrentScriptId;
window.syncCurrentToLibrary = syncCurrentToLibrary;
window.loadScriptFromLibrary = loadScriptFromLibrary;
window.addScript = addScript;
window.deleteScript = deleteScript;
window.editScriptName = editScriptName;
window.updateScriptsList = updateScriptsList;
window.exportAllScripts = exportAllScripts;
window.importScripts = importScripts;

// 參數操作 (由 HTML 調用)
window.setServer = function(team) {
  const state = getState();
  const shots = getShots();
  if (shots[0]) {
    shots[0].server = team;
    updateShot1Server(shots, state.mode);
    render2D();
    sync3DPositions();
    renderSideProfile(getCurrentShot());
    updateParamPanel();
    updateLog();
  }
};

window.setPlayerSpeed = function(id, speed) {
  const shot = getCurrentShot();
  if (shot && shot.players[id]) {
    shot.players[id].speed = parseFloat(speed.toFixed(1));
    render2D();
    sync3DPositions();
    updateParamPanel();
  }
};

window.adjustPlayerSpeed = function(id, delta) {
  const current = getCurrentShot()?.players[id]?.speed || 3.0;
  window.setPlayerSpeed(id, Math.max(1.0, Math.min(8.0, current + delta)));
};

window.setArcType = function(type) {
  const shot = getCurrentShot();
  const state = getState();
  if (shot && !shot.isSetup) {
    shot.arcType = type;
    const shots = getShots();
    autoMatchShotProperties(shot, shots, state.mode, state.appMode);
    cascadeBallPositions(getCurrentIndex(), shots, state.mode, state.appMode);
    render2D();
    sync3DPositions();
    renderSideProfile(shot);
    updateParamPanel();
    updateLog();
  }
};

window.setHitLevel = function(level) {
  const shot = getCurrentShot();
  const state = getState();
  if (shot && !shot.isSetup) {
    shot.hitLevel = level;
    shot.hitLevelOverride = true;
    if (level === 'high') shot.ballFrom.y = Math.max(2.1, shot.ballFrom.y);
    else if (level === 'mid') shot.ballFrom.y = 1.6;
    else shot.ballFrom.y = 1.15;

    const shots = getShots();
    autoMatchShotProperties(shot, shots, state.mode, state.appMode);
    cascadeBallPositions(getCurrentIndex(), shots, state.mode, state.appMode);
    render2D();
    sync3DPositions();
    renderSideProfile(shot);
    updateParamPanel();
    updateLog();
  }
};

window.setForehand = function(isForehand) {
  const shot = getCurrentShot();
  if (shot && !shot.isSetup) {
    shot.forehand = isForehand;
    shot.forehandOverride = true;
    render2D();
    sync3DPositions();
    renderSideProfile(shot);
    updateParamPanel();
    updateLog();
  }
};

window.setApexHeight = function(h) {
  const shot = getCurrentShot();
  if (shot && !shot.isSetup) {
    shot.apexHeight = Math.max(1.0, Math.min(8.0, h));
    render2D();
    sync3DPositions();
    renderSideProfile(shot);
    updateParamPanel();
    updateLog();
  }
};

window.adjustApexHeight = function(delta) {
  const current = getCurrentShot()?.apexHeight || 4.0;
  window.setApexHeight(current + delta);
};

window.setApexPos = function(pos) {
  const shot = getCurrentShot();
  if (shot && !shot.isSetup) {
    shot.apexPos = Math.max(0.05, Math.min(0.95, pos));
    render2D();
    sync3DPositions();
    renderSideProfile(shot);
    updateParamPanel();
    updateLog();
  }
};

window.adjustApexPos = function(delta) {
  const current = getCurrentShot()?.apexPos || 0.5;
  window.setApexPos(current + delta);
};

window.setCurrentShot = function(idx, atEnd = false) {
  const shots = getShots();
  if (idx < 0 || idx >= shots.length) return;
  setCurrentIndex(idx);
  hideMiniPopup();
  const state = getState();
  const shot = shots[idx];
  if (shot && !shot.isSetup && !shot.pendingTo) {
    state.selected = { type: 'ball', point: 'to' };
  } else {
    state.selected = null;
  }
  render2D();
  sync3DPositions(atEnd);
  updateShotInfo();
  updateHUD();
  updateParamPanel();
  updateLog();
};

// 腳本名稱編輯輔助
window.promptEditScript = function(id) {
  const script = getScriptLibrary().find(s => s.id === id);
  if (!script) return;
  const newName = prompt('請輸入新的腳本名稱：', script.name);
  if (newName !== null && newName.trim() !== '') {
    editScriptName(id, newName.trim());
  }
};

// ========== 初始化 ==========

function init() {
  // 1. 3D 場景
  initScene();

  const scene = getScene();
  const camera = getCamera();
  const controls = getControls();

  // 保存引用供 animation 使用
  window.__scene = scene;
  window.__camera = camera;
  window.__controls = controls;
  window.__renderer = getRenderer();

  // 2. 3D 實體
  buildCourt();
  createShuttle();
  buildPlayers();

  // 3. 2D 初始化
  initSideProfile();
  initInteractions();

  // 4. 載入示範腳本
  const state = getState();
  state.shots = [];
  initDemo(state.shots, state.mode, state.appMode);

  // 5. 設置當前拍
  window.setCurrentShot(0);

  // 6. 同步到腳本庫
  syncCurrentToLibrary();

  // 7. 啟動動畫
  startAnimation();

  // 8. 綁定 UI 事件
  bindUIEvents();

  // 9. 默認視角
  setCameraView('45');

  console.log('🏸 羽球戰術板 v4.86 已初始化 (模組化版本)');
}

// ========== UI 事件綁定 ==========

function bindUIEvents() {
  // 2D 抽屜
  document.getElementById('btn-drawer').addEventListener('click', () => {
    const drawer = document.getElementById('drawer2d');
    drawer.classList.toggle('open');
    if (drawer.classList.contains('open')) {
      setTimeout(resizeCanvas, 50);
    }
  });

  document.getElementById('btn-close-drawer').addEventListener('click', () => {
    document.getElementById('drawer2d').classList.remove('open');
  });

  // 3D 工具欄
  document.getElementById('btn-toggle-tb').addEventListener('click', () => {
    const tb = document.getElementById('integrated-toolbar');
    tb.classList.toggle('hidden');
    document.getElementById('btn-toggle-tb').classList.toggle('active', !tb.classList.contains('hidden'));
  });

  // 播放控制
  document.getElementById('btn-play').addEventListener('click', () => {
    const state = getState();
    const shots = getShots();
    if (state.playing) {
      state.playing = false;
      document.getElementById('btn-play').textContent = '播放';
    } else {
      const totalDur = getTotalRallyDuration(shots);
      if (window.__animTime >= totalDur) window.__animTime = 0;
      state.playing = true;
      document.getElementById('btn-play').textContent = '暫停';
    }
  });

  document.getElementById('btn-stop').addEventListener('click', () => {
    const state = getState();
    state.playing = false;
    window.__animTime = 0;
    document.getElementById('btn-play').textContent = '播放';
    document.getElementById('timeline').value = 0;
    window.setCurrentShot(0, true);
    clearBallTrail();
    renderSideProfile(getCurrentShot());
  });

  document.getElementById('btn-step').addEventListener('click', () => {
    const state = getState();
    state.playing = false;
    document.getElementById('btn-play').textContent = '播放';
    clearBallTrail();
    const nextIdx = Math.min(getCurrentIndex() + 1, getShots().length - 1);
    window.setCurrentShot(nextIdx, true);
  });

  // 時間軸
  document.getElementById('timeline').addEventListener('input', (e) => {
    const state = getState();
    state.playing = false;
    document.getElementById('btn-play').textContent = '播放';
    const percent = parseFloat(e.target.value);
    const shots = getShots();
    const totalDur = getTotalRallyDuration(shots);
    window.__animTime = (percent / 100) * totalDur;

    let accumulatedTime = 0;
    for (let i = 1; i < shots.length; i++) {
      const s = shots[i];
      const dur = getShotDuration(s);
      if (window.__animTime >= accumulatedTime && window.__animTime <= accumulatedTime + dur) {
        window.setCurrentShot(i);
        renderSideProfile(s);
        break;
      }
      accumulatedTime += dur;
    }
  });

  // 速度
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const state = getState();
      state.playSpeed = parseFloat(btn.dataset.speed);
    });
  });

  // 視角
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => setCameraView(btn.dataset.view));
  });

  // 拍次控制
  document.getElementById('btn-shot-prev').addEventListener('click', () => {
    if (getCurrentIndex() > 0) window.setCurrentShot(getCurrentIndex() - 1);
  });

  document.getElementById('btn-shot-next').addEventListener('click', () => {
    if (getCurrentIndex() < getShots().length - 1) window.setCurrentShot(getCurrentIndex() + 1);
  });

  document.getElementById('btn-add').addEventListener('click', () => {
    const state = getState();
    const shots = getShots();
    const shot = newShot(shots.length, shots, state.mode, state.appMode);
    shot.pendingTo = true;
    shots.push(shot);
    cascadeBallPositions(shots.length - 1, shots, state.mode, state.appMode);
    window.setCurrentShot(shots.length - 1);
  });

  document.getElementById('btn-del').addEventListener('click', () => {
    const shots = getShots();
    if (shots.length <= 1) return;
    if (getCurrentIndex() === 0) {
      showToast('第 0 拍為基礎設定，無法刪除！');
      return;
    }
    shots.splice(getCurrentIndex(), 1);
    const nextIdx = Math.min(getCurrentIndex(), shots.length - 1);
    const state = getState();
    cascadeBallPositions(nextIdx, shots, state.mode, state.appMode);
    window.setCurrentShot(nextIdx);
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    syncCurrentToLibrary();
    showToast('戰術腳本已更新保存！');
  });

  // 撤銷/復原
  document.getElementById('btn-undo').addEventListener('click', () => {
    const prev = undo();
    if (prev) {
      const state = getState();
      state.shots = prev;
      const idx = Math.min(getCurrentIndex(), state.shots.length - 1);
      window.setCurrentShot(idx);
      updateParamPanel();
      render2D();
      sync3DPositions();
    }
  });

  document.getElementById('btn-redo').addEventListener('click', () => {
    const next = redo();
    if (next) {
      const state = getState();
      state.shots = next;
      const idx = Math.min(getCurrentIndex(), state.shots.length - 1);
      window.setCurrentShot(idx);
      updateParamPanel();
      render2D();
      sync3DPositions();
    }
  });

  // 模式切換 (移除手動模式)
  document.querySelectorAll('.app-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.app-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const state = getState();
      state.appMode = btn.dataset.appmode;

      const freeTb = document.getElementById('free-draw-toolbar');
      if (freeTb) freeTb.classList.toggle('active', state.appMode === 'free');

      render2D();
      updateHUD();
      updateParamPanel();
    });
  });

  // 場地模式
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const state = getState();
      state.mode = btn.dataset.mode;

      // 重建球員
      const scene = getScene();
      Object.values(getPlayerMeshes()).forEach(m => scene.remove(m));
      buildPlayers();

      // 重新初始化
      state.shots = [];
      initDemo(state.shots, state.mode, state.appMode);
      window.setCurrentShot(0);
      syncCurrentToLibrary();
    });
  });

  // 日誌
  document.getElementById('btn-log').addEventListener('click', () => {
    const logPanel = document.getElementById('log-panel');
    const scriptsPanel = document.getElementById('scripts-panel');
    if (logPanel) {
      const isShow = logPanel.style.display === 'none' || logPanel.style.display === '';
      scriptsPanel.style.display = 'none';
      logPanel.style.display = isShow ? 'flex' : 'none';
      if (isShow) updateLog();
    }
  });

  // 腳本管理
  document.getElementById('btn-scripts').addEventListener('click', () => {
    const scriptsPanel = document.getElementById('scripts-panel');
    const logPanel = document.getElementById('log-panel');
    if (scriptsPanel) {
      const isShow = scriptsPanel.style.display === 'none' || scriptsPanel.style.display === '';
      logPanel.style.display = 'none';
      scriptsPanel.style.display = isShow ? 'flex' : 'none';
      if (isShow) updateScriptsList();
    }
  });

  // 新增腳本 (彈窗選擇類型)
  document.getElementById('btn-new-script').addEventListener('click', () => {
    const typeOptions = [
      { label: '單打', value: 'singles' },
      { label: '雙打', value: 'doubles' },
      { label: '1v2', value: '2v1' },
      { label: '1v3', value: '3v1' }
    ];

    // 簡單彈窗選擇
    const type = prompt('請選擇腳本類型：\n1. 單打\n2. 雙打\n3. 1v2\n4. 1v3', '1');
    if (!type) return;

    const typeMap = { '1': 'singles', '2': 'doubles', '3': '2v1', '4': '3v1' };
    const typeLabels = { 'singles': '單打', 'doubles': '雙打', '2v1': '1v2', '3v1': '1v3' };
    const selectedType = typeMap[type];
    if (!selectedType) { showToast('無效的選擇'); return; }

    const name = prompt('請輸入腳本名稱：', `${typeLabels[selectedType]}001`);
    if (name === null || name.trim() === '') { showToast('已取消'); return; }

    const state = getState();
    state.mode = selectedType;
    state.shots = [];
    initDemo(state.shots, state.mode, state.appMode);

    const newId = addScript(selectedType, name.trim());
    syncCurrentToLibrary();
    updateScriptsList();

    // 更新模式按鈕
    document.querySelectorAll('.mode-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === selectedType)
    );

    // 重建球員
    const scene = getScene();
    Object.values(getPlayerMeshes()).forEach(m => scene.remove(m));
    buildPlayers();

    window.setCurrentShot(0);
    showToast(`已新增腳本：${name.trim()}`);
  });

  // 導入/導出
  document.getElementById('btn-export-all').addEventListener('click', exportAllScripts);

  document.getElementById('btn-import-all').addEventListener('click', () => {
    document.getElementById('file-import').click();
  });

  document.getElementById('file-import').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      importScripts(evt.target.result);
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // 自由繪圖工具
  document.getElementById('btn-draw-tool').addEventListener('click', function() {
    document.querySelectorAll('#free-draw-toolbar .btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    const state = getState();
    state.freeDraw.tool = 'pencil';
  });

  document.getElementById('btn-select-tool').addEventListener('click', function() {
    document.querySelectorAll('#free-draw-toolbar .btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    const state = getState();
    state.freeDraw.tool = 'select';
  });

  document.getElementById('btn-eraser-tool').addEventListener('click', function() {
    document.querySelectorAll('#free-draw-toolbar .btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    const state = getState();
    state.freeDraw.tool = 'eraser';
  });

  document.getElementById('btn-clear-draw').addEventListener('click', () => {
    const state = getState();
    state.freeDraw.paths = [];
    state.freeDraw.redoPaths = [];
    render2D();
  });

  document.getElementById('btn-undo-draw').addEventListener('click', () => {
    const state = getState();
    if (state.freeDraw.paths.length > 0) {
      state.freeDraw.redoPaths.push(state.freeDraw.paths.pop());
      render2D();
    }
  });

  // 顏色選擇器
  const colorListContainer = document.getElementById('color-picker-list');
  if (colorListContainer) {
    const colors = ['#ff5252', '#2196f3', '#ffd54f', '#4caf50', '#ff9800', '#ab47bc', '#ffffff', '#00bcd4'];
    const state = getState();
    colors.forEach(c => {
      const dot = document.createElement('div');
      dot.className = `color-picker-dot ${c === state.freeDraw.color ? 'active' : ''}`;
      dot.style.background = c;
      dot.onclick = () => {
        document.querySelectorAll('.color-picker-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        state.freeDraw.color = c;
      };
      colorListContainer.appendChild(dot);
    });
  }

  // 窗口 Resize
  window.addEventListener('resize', () => {
    resizeCanvas();
  });

  // 自動展開 2D 抽屜
  setTimeout(() => {
    document.getElementById('drawer2d').classList.add('open');
    setTimeout(resizeCanvas, 100);
  }, 300);
}

// ========== 啟動 ==========

document.addEventListener('DOMContentLoaded', init);