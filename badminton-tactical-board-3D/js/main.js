// ========== 應用入口 ==========

import { COURT, ARC_TYPES, DRAW_COLORS } from './config/constants.js';
import { showToast } from './utils/toast.js';
import { getState, setState, getShots, getCurrentShot, getCurrentIndex, setCurrentIndex, pushHistory, getAnimTime, setAnimTime } from './core/state.js';
import { getPlayers, getDefaultSetupPlayers, detectHitLevel } from './models/player.js';
import { getTrajectoryPoint, getShotDuration, getTotalRallyDuration, checkPhysics, getInterceptionInfo } from './core/physics.js';
import { newShot, initDemo, autoMatchShotProperties, matchReceiverSpeed, applySmartPositions, cascadeBallPositions, updateShot1Server, computeHitPoint } from './models/shot.js?v=0.31c';
import { resizeCanvas, render2D, m2px, px2m } from './2d/renderer.js';
import { initInteractions } from './2d/interactions.js';
import { initSideProfile, renderSideProfile } from './2d/sideprofile.js';
import { showMiniPopup, hideMiniPopup } from './2d/popup.js';
import { initScene, getScene, getCamera, getRenderer, getControls } from './3d/scene.js';
import { buildCourt, createShuttle, buildPlayers, sync3DPositions, clearBallTrail, getPlayerMeshes } from './3d/entities.js';
import { startAnimation, stopAnimation } from './3d/animation.js';
import { setCameraView } from './3d/controls.js';
import { updateShotInfo, updateHUD, updateParamPanel } from './ui/panels.js';
import { updateLog } from './ui/logs.js';
import { getScriptLibrary, getCurrentScriptId, syncCurrentToLibrary, loadScriptFromLibrary, addScript, deleteScript, editScriptName, updateScriptsList, exportAllScripts, importScripts, getCurrentScriptName, getScriptTypeLabel } from './ui/scripts.js';
import { initWindowManager, registerWindow, toggleWindow } from './ui/window-manager.js';

// ========== 暴露全局函數給 HTML ==========

window.newShot = newShot;
window.initDemo = initDemo;
window.autoMatchShotProperties = autoMatchShotProperties;
window.applySmartPositions = applySmartPositions;
window.cascadeBallPositions = cascadeBallPositions;
window.updateShot1Server = updateShot1Server;

window.getState = getState;
window.getShots = getShots;
window.getCurrentShot = getCurrentShot;
window.getCurrentIndex = getCurrentIndex;
window.setCurrentIndex = setCurrentIndex;

window.resizeCanvas = resizeCanvas;
window.render2D = render2D;
window.m2px = m2px;
window.px2m = px2m;
window.showMiniPopup = showMiniPopup;
window.hideMiniPopup = hideMiniPopup;

window.sync3DPositions = sync3DPositions;
window.setCameraView = setCameraView;
window.clearBallTrail = clearBallTrail;

window.updateShotInfo = updateShotInfo;
window.updateHUD = updateHUD;
window.updateParamPanel = updateParamPanel;
window.updateLog = updateLog;
window.showToast = showToast;

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
window.getCurrentScriptName = getCurrentScriptName;
window.getScriptTypeLabel = getScriptTypeLabel;

// ===== 參數操作 =====
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
  const shots = getShots();
  const state = getState();
  if (shot && shot.players[id]) {
    shot.players[id].speed = parseFloat(speed.toFixed(1));
    shot.players[id].speedOverride = true;
    // 重算 hitPoint
    const idx = getCurrentIndex();
    const prevShot = idx > 0 ? shots[idx - 1] : null;
    shot.hitPoint = computeHitPoint(shot, prevShot, shot.hitLevel || 'high');
    render2D();
    sync3DPositions();
    updateParamPanel();
  }
};

window.adjustPlayerSpeed = function(id, delta) {
  const current = getCurrentShot()?.players[id]?.speed || 2.0;
  window.setPlayerSpeed(id, Math.max(1.0, Math.min(8.0, current + delta)));
};

window.setArcType = function(type) {
  const shot = getCurrentShot();
  const state = getState();
  const shots = getShots();
  if (shot && !shot.isSetup) {
    shot.arcType = type;
    shot.apexOverride = false;
    autoMatchShotProperties(shot, shots, state.mode, state.appMode);
    // 統一智能匹配：球路改變 → 接球方速度依新球路重匹配（band = 下一拍 hitLevel）
    matchReceiverSpeed(shot, shots);
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
  const shots = getShots();

  if (shot && !shot.isSetup) {
    // 超極限拒絕：手動改高度前，先檢查該帶位是否物理可達
    const idx0 = getCurrentIndex();
    const prevShot0 = idx0 > 0 ? shots[idx0 - 1] : null;
    if (prevShot0 && !prevShot0.isSetup && !prevShot0.pendingTo) {
      const testHit = computeHitPoint(prevShot0, idx0 > 1 ? shots[idx0 - 2] : null, level);
      if (!testHit) {
        const levelName = level === 'high' ? '高位' : (level === 'mid' ? '中位' : '低位');
        showToast('該帶位不可達，已保持原設定：' + levelName);
        render2D(); sync3DPositions(); renderSideProfile(shot); updateParamPanel(); updateLog();
        return;
      }
    }
    shot.hitLevel = level;
    shot.hitLevelOverride = true;

    // 統一智能匹配：改 hitLevel → 前一拍接球方速度重匹配（band = 本拍 hitLevel）
    if (getCurrentIndex() > 0) {
      matchReceiverSpeed(shots[getCurrentIndex() - 1], shots);
    }
    cascadeBallPositions(Math.max(1, getCurrentIndex() - 1), shots, state.mode, state.appMode);
    applySmartPositions(shot, shots, state.mode, state.appMode);

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
  const state = getState();
  const shots = getShots();
  if (shot && !shot.isSetup) {
    shot.apexHeight = Math.max(1.0, Math.min(8.0, h));
    shot.apexOverride = true;
    // 統一智能匹配：頂點改變 → 接球方速度重匹配 → 攔截點 → 站位 → 下一拍起點
    matchReceiverSpeed(shot, shots);
    cascadeBallPositions(getCurrentIndex(), shots, state.mode, state.appMode);
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
  const state = getState();
  const shots = getShots();
  if (shot && !shot.isSetup) {
    shot.apexPos = Math.max(0.05, Math.min(0.95, pos));
    shot.apexOverride = true;
    // 統一智能匹配：頂點位置改變 → 接球方速度重匹配 → 攔截點 → 站位 → 下一拍起點
    matchReceiverSpeed(shot, shots);
    cascadeBallPositions(getCurrentIndex(), shots, state.mode, state.appMode);
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

window.promptEditScript = function(id) {
  const script = getScriptLibrary().find(s => s.id === id);
  if (!script) return;
  const newName = prompt('請輸入新的腳本名稱：', script.name);
  if (newName !== null && newName.trim() !== '') {
    editScriptName(id, newName.trim());
  }
};

function updateLogButton() {
  const btn = document.getElementById('btn-log');
  if (btn) {
    const name = getCurrentScriptName();
    btn.textContent = `📋 ${name}`;
  }
}

// ========== 初始化 ==========

function init() {
  console.log('🏸 初始化開始...');

  setAnimTime(0);

  const sceneResult = initScene();
  if (!sceneResult) {
    console.error('3D場景初始化失敗！');
    return;
  }

  const scene = getScene();
  const camera = getCamera();
  const controls = getControls();

  window.__scene = scene;
  window.__camera = camera;
  window.__controls = controls;
  window.__renderer = getRenderer();

  console.log('✅ 3D場景初始化完成');

  buildCourt();
  createShuttle();
  buildPlayers();

  console.log('✅ 3D實體建立完成');

  initSideProfile();
  initInteractions();

  const scriptLib = getScriptLibrary();
  if (scriptLib.length > 0 && scriptLib[0].data && scriptLib[0].data.shots && scriptLib[0].data.shots.length > 0) {
    loadScriptFromLibrary(scriptLib[0].id);
  } else {
    const state = getState();
    state.shots = [];
    initDemo(state.shots, state.mode, state.appMode);
    window.setCurrentShot(0);
    syncCurrentToLibrary();
  }

  setTimeout(() => {
    setCameraView('45');
  }, 50);

  startAnimation();

  initWindowManager();
  registerWindow('integrated-toolbar', { btnId: 'btn-console-play',   defaultLeftPercent: 1,  defaultTopPercent: 1  });
  registerWindow('param-panel',        { btnId: 'btn-console-param',  defaultLeftPercent: 1,  defaultTopPercent: 60 });
  registerWindow('sideprofile-panel',  { btnId: 'btn-sideprofile',    defaultLeftPercent: 80, defaultTopPercent: 40 });
  registerWindow('diag-panel',         { btnId: 'btn-diag',           defaultLeftPercent: 1,  defaultTopPercent: 90 });
  registerWindow('log-panel',          { btnId: 'btn-log',            defaultLeftPercent: 80, defaultTopPercent: 1  });
  registerWindow('scripts-panel',      { btnId: 'btn-scripts',        defaultLeftPercent: 40, defaultTopPercent: 1  });
  window.toggleFloatWindow = toggleWindow;

  bindUIEvents();
  updateLogButton();
  updateHUD();

  const freeTb = document.getElementById('free-draw-toolbar');
  if (freeTb) freeTb.style.display = 'none';

  const renderer = window.__renderer;
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }

  console.log('🏸 羽球戰術板 v0.3 已初始化');
}

// ========== UI 事件綁定 ==========

function bindUIEvents() {
  const drawerBtn = document.getElementById('btn-drawer');
  const drawer = document.getElementById('drawer2d');

  drawer.classList.remove('open');

  drawerBtn.addEventListener('click', () => {
    drawer.classList.toggle('open');
    drawerBtn.classList.toggle('active', drawer.classList.contains('open'));
    if (drawer.classList.contains('open')) {
      setTimeout(resizeCanvas, 50);
    }
  });

  // ===== 播放控制 =====
  const playBtn = document.getElementById('btn-play');
  const stopBtn = document.getElementById('btn-stop');
  const stepBtn = document.getElementById('btn-step');

  playBtn.addEventListener('click', () => {
    const state = getState();
    const shots = getShots();
    const totalDur = getTotalRallyDuration(shots);

    if (state.playing) {
      state.playing = false;
      playBtn.textContent = '▶ 播放';
    } else {
      let animTime = getAnimTime();
      if (animTime >= totalDur) {
        setAnimTime(0);
        window.setCurrentShot(0, true);
        clearBallTrail();
        if (window.__clearTrail) window.__clearTrail();
      }
      state.playing = true;
      playBtn.textContent = '⏸ 暫停';
    }
  });

  stopBtn.addEventListener('click', () => {
    const state = getState();
    state.playing = false;
    state.stepMode = false;
    stepBtn.classList.remove('active');
    setAnimTime(0);
    playBtn.textContent = '▶ 播放';
    document.getElementById('timeline').value = 0;
    window.setCurrentShot(0, true);
    clearBallTrail();
    renderSideProfile(getCurrentShot());
    if (window.__clearTrail) window.__clearTrail();
  });

  stepBtn.addEventListener('click', () => {
    const state = getState();
    state.stepMode = !state.stepMode;
    stepBtn.classList.toggle('active', state.stepMode);
  });

  document.getElementById('timeline').addEventListener('input', (e) => {
    const state = getState();
    state.playing = false;
    playBtn.textContent = '▶ 播放';
    const percent = parseFloat(e.target.value);
    const shots = getShots();
    const totalDur = getTotalRallyDuration(shots);
    const newTime = (percent / 100) * totalDur;
    setAnimTime(newTime);

    let accumulatedTime = 0;
    for (let i = 1; i < shots.length; i++) {
      const s = shots[i];
      const dur = getShotDuration(s);
      if (newTime >= accumulatedTime && newTime <= accumulatedTime + dur) {
        window.setCurrentShot(i);
        renderSideProfile(s);
        break;
      }
      accumulatedTime += dur;
    }
  });

  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const state = getState();
      state.playSpeed = parseFloat(btn.dataset.speed);
    });
  });

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => setCameraView(btn.dataset.view));
  });

  // ===== 拍次控制 =====
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
    updateLogButton();
    showToast('戰術腳本已更新保存！');
  });

  // ===== 模式切換 =====
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const state = getState();
      state.appMode = btn.dataset.appmode;

      const freeTb = document.getElementById('free-draw-toolbar');
      if (freeTb) {
        freeTb.style.display = state.appMode === 'free' ? 'flex' : 'none';
      }

      const panelWrap = document.getElementById('panel-wrap');
      if (panelWrap) {
        if (state.appMode === 'free') {
          panelWrap.classList.add('hidden-panel');
        } else {
          panelWrap.classList.remove('hidden-panel');
        }
      }

      render2D();
      updateHUD();
      updateParamPanel();
    });
  });

  // ===== 手繪工具 =====
  document.querySelectorAll('#free-draw-toolbar .tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#free-draw-toolbar .tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      const state = getState();
      state.freeDraw.tool = this.dataset.tool;
    });
  });

  document.getElementById('btn-undo-draw').addEventListener('click', () => {
    const state = getState();
    if (state.freeDraw.paths.length > 0) {
      state.freeDraw.redoPaths.push(state.freeDraw.paths.pop());
      render2D();
    }
  });

  document.getElementById('btn-clear-draw').addEventListener('click', () => {
    const state = getState();
    state.freeDraw.paths = [];
    state.freeDraw.redoPaths = [];
    render2D();
  });

  const colorListContainer = document.getElementById('color-picker-list');
  if (colorListContainer) {
    const colors = ['#ff5252', '#2196f3', '#ffd54f', '#4caf50', '#ff9800', '#ab47bc', '#ffffff'];
    const state = getState();
    colors.forEach(c => {
      const dot = document.createElement('div');
      dot.className = 'color-dot';
      if (c === state.freeDraw.color) dot.classList.add('active');
      dot.style.background = c;
      dot.onclick = () => {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        state.freeDraw.color = c;
      };
      colorListContainer.appendChild(dot);
    });
  }

  // ===== 日誌 =====
  const logBtn = document.getElementById('btn-log');
  const logPanel = document.getElementById('log-panel');

  logBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (logPanel) {
      updateLog();
    }
  });

  // ===== 腳本管理 =====
  const scriptsBtn = document.getElementById('btn-scripts');
  const scriptsPanel = document.getElementById('scripts-panel');

  scriptsBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (scriptsPanel) {
      updateScriptsList();
    }
  });

  document.getElementById('btn-new-script').addEventListener('click', function(e) {
    e.stopPropagation();
    document.getElementById('script-type-modal').style.display = 'flex';
  });

  document.getElementById('btn-modal-close').addEventListener('click', () => {
    document.getElementById('script-type-modal').style.display = 'none';
  });

  document.getElementById('script-type-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('script-type-modal').style.display = 'none';
    }
  });

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const typeFormats = { singles: '[單打]', doubles: '[雙打]', '2v1': '[2-1式]', '3v1': '[3-1式]' };

      document.getElementById('script-type-modal').style.display = 'none';

      const defaultName = `${typeFormats[type]}001`;
      const name = prompt('請輸入腳本名稱：', defaultName);
      if (name === null || name.trim() === '') {
        showToast('已取消');
        return;
      }

      const state = getState();
      state.mode = type;
      state.shots = [];
      initDemo(state.shots, state.mode, state.appMode);

      const newId = addScript(type, name.trim());
      syncCurrentToLibrary();
      updateScriptsList();
      updateLogButton();

      window.setCurrentShot(0);
      showToast(`已新增腳本：${name.trim()}`);
    });
  });

  document.getElementById('btn-export-all').addEventListener('click', function(e) {
    e.stopPropagation();
    exportAllScripts();
  });

  document.getElementById('btn-import-all').addEventListener('click', function(e) {
    e.stopPropagation();
    document.getElementById('file-import').click();
  });

  document.getElementById('file-import').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      importScripts(evt.target.result);
      updateLogButton();
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // ===== 佔位按鈕已由 registerWindow 接管 =====

  initResizer();

  window.addEventListener('resize', () => {
    resizeCanvas();
  });
}

// ========== 分割條拖動 ==========
function initResizer() {
  const resizer = document.getElementById('resizer-v');
  const leftColumn = document.querySelector('.drawer-left-column');
  const panelWrap = document.getElementById('panel-wrap');
  const drawer = document.getElementById('drawer2d');

  if (!resizer || !leftColumn || !panelWrap || !drawer) return;

  let isDragging = false;

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const drawerRect = drawer.getBoundingClientRect();
    const resizerRect = resizer.getBoundingClientRect();
    const resizerWidth = resizerRect.width;

    const newPanelWidth = drawerRect.right - e.clientX - resizerWidth / 2;
    const clampedWidth = Math.max(280, Math.min(500, newPanelWidth));

    panelWrap.style.width = clampedWidth + 'px';
    panelWrap.style.minWidth = clampedWidth + 'px';
    panelWrap.style.maxWidth = clampedWidth + 'px';

    resizeCanvas();
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      resizeCanvas();
    }
  });

  resizer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isDragging = true;
    resizer.classList.add('dragging');
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const drawerRect = drawer.getBoundingClientRect();
    const resizerRect = resizer.getBoundingClientRect();
    const resizerWidth = resizerRect.width;

    const newPanelWidth = drawerRect.right - touch.clientX - resizerWidth / 2;
    const clampedWidth = Math.max(280, Math.min(500, newPanelWidth));

    panelWrap.style.width = clampedWidth + 'px';
    panelWrap.style.minWidth = clampedWidth + 'px';
    panelWrap.style.maxWidth = clampedWidth + 'px';

    resizeCanvas();
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (isDragging) {
      isDragging = false;
      resizer.classList.remove('dragging');
      resizeCanvas();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);