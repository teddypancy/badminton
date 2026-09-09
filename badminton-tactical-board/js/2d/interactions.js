import { COURT } from '../config/constants.js';
import {
  getState, getCurrentShot, getShots, getCurrentIndex,
  setCurrentIndex, setAnimTime
} from '../core/state.js';
import { getTrajectoryPoint, getInterceptionInfo } from '../core/physics.js';
import {
  autoMatchShotProperties, applySmartPositions, cascadeBallPositions
} from '../models/shot.js';
import { getPlayers } from '../models/player.js';
import { m2px, px2m, render2D } from './renderer.js';
import { showMiniPopup, hideMiniPopup, isPopupVisible } from './popup.js';
import { renderSideProfile } from './sideprofile.js';
import { sync3DPositions } from '../3d/entities.js';
import { updateShotInfo, updateHUD, updateParamPanel } from '../ui/panels.js';
import { updateLog } from '../ui/logs.js';

let isDragging = false;
let isPointerDown = false;
let pointerStartX = 0;
let pointerStartY = 0;
let longPressTimer = null;
let isLongPress = false;

function getCanvasMousePos(e) {
  const canvas = document.getElementById('court2d');
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height)
  };
}

function getHitTarget(mPx) {
  const state = getState();
  const shot = getCurrentShot();
  if (!shot) return [];

  const hits = [];

  if (!shot.isSetup && !shot.pendingTo) {
    const toPx = m2px(shot.ballTo.x, shot.ballTo.z);
    const dTo = Math.hypot(mPx.x - toPx.x, mPx.y - toPx.y);
    if (dTo <= 22) {
      hits.push({ type: 'ball', point: 'to', dist: dTo, label: '🎯 落點' });
    }

    const fromPx = m2px(shot.ballFrom.x, shot.ballFrom.z);
    const dFrom = Math.hypot(mPx.x - fromPx.x, mPx.y - fromPx.y);
    if (dFrom <= 22) {
      hits.push({ type: 'ball', point: 'from', dist: dFrom, label: '🏸 擊球點' });
    }
  }

  for (const [id, pos] of Object.entries(shot.players)) {
    const pPx = m2px(pos.x, pos.z);
    const dP = Math.hypot(mPx.x - pPx.x, mPx.y - pPx.y);
    if (dP <= 22) {
      hits.push({ type: 'player', id: id, dist: dP, label: `球員 ${id}` });
    }
  }

  hits.sort((a, b) => a.dist - b.dist);
  return hits;
}

function selectAndStartDrag(target) {
  const state = getState();
  state.selected = target;
  isDragging = true;
  render2D();
  updateParamPanel();
}

// ===== 處理 Pointer Down =====
function handlePointerDown(e) {
  const state = getState();
  const shot = getCurrentShot();
  const mPx = getCanvasMousePos(e);
  const isRightClick = e.button === 2;

  isPointerDown = true;
  pointerStartX = mPx.x;
  pointerStartY = mPx.y;
  isLongPress = false;

  // ---- 手繪模式 ----
  if (state.appMode === 'free') {
    const tool = state.freeDraw.tool;
    
    if (tool === 'pencil') {
      // 畫筆：繪製軌跡
      const mPos = px2m(mPx.x, mPx.y);
      state.freeDraw.currentPath = {
        color: state.freeDraw.color,
        width: state.freeDraw.lineWidth || 3,
        points: [{ x: mPos.x, z: mPos.z }]
      };
      isDragging = true;
    } else if (tool === 'select') {
      // 選取：可拖動球員
      const hits = getHitTarget(mPx);
      const playerHit = hits.find(h => h.type === 'player');
      if (playerHit) {
        selectAndStartDrag(playerHit);
      } else {
        state.selected = null;
        render2D();
      }
    } else if (tool === 'eraser') {
      // 橡皮擦：刪除點擊位置的畫筆軌跡
      const mPos = px2m(mPx.x, mPx.y);
      const paths = state.freeDraw.paths;
      const eraseRadius = 0.3; // 擦除半徑（公尺）
      
      let erased = false;
      for (let i = paths.length - 1; i >= 0; i--) {
        const path = paths[i];
        if (!path.points || path.points.length === 0) continue;
        // 檢查路徑上是否有點在擦除範圍內
        const shouldErase = path.points.some(p => {
          const dist = Math.hypot(p.x - mPos.x, p.z - mPos.z);
          return dist < eraseRadius;
        });
        if (shouldErase) {
          paths.splice(i, 1);
          erased = true;
        }
      }
      if (erased) render2D();
    }
    return;
  }

  // ---- 腳本模式 ----
  if (!shot) return;

  // ---- 等待落點設定（單擊直接確定） ----
  if (shot.pendingTo) {
    const mPos = px2m(mPx.x, mPx.y);
    const clampedX = Math.max(-COURT.width_d / 2, Math.min(COURT.width_d / 2, mPos.x));
    const clampedZ = Math.max(-COURT.length / 2, Math.min(COURT.length / 2, mPos.z));
    shot.ballTo = { x: clampedX, y: 0.1, z: clampedZ };
    shot.pendingTo = false;
    const shots = getShots();
    autoMatchShotProperties(shot, shots, state.mode, state.appMode);
    applySmartPositions(shot, shots, state.mode, state.appMode);
    cascadeBallPositions(getCurrentIndex(), shots, state.mode, state.appMode);
    render2D();
    sync3DPositions();
    renderSideProfile(shot);
    updateParamPanel();
    updateLog();
    return;
  }

  // ---- 右鍵 或 長按（移動端）彈出重疊選擇 ----
  if (isRightClick) {
    const hits = getHitTarget(mPx);
    if (hits.length > 1) {
      const options = hits.map(h => ({
        label: h.label,
        action: () => {
          selectAndStartDrag(h);
          hideMiniPopup();
        }
      }));
      showMiniPopup(mPx.x, mPx.y, '選擇重疊物件', options);
      return;
    }
    return;
  }

  // ---- 移動端長按檢測 ----
  if (e.touches) {
    longPressTimer = setTimeout(() => {
      isLongPress = true;
      const hits = getHitTarget(mPx);
      if (hits.length > 1) {
        const options = hits.map(h => ({
          label: h.label,
          action: () => {
            selectAndStartDrag(h);
            hideMiniPopup();
          }
        }));
        showMiniPopup(mPx.x, mPx.y, '選擇重疊物件', options);
      } else if (hits.length === 1) {
        selectAndStartDrag(hits[0]);
      }
    }, 600);
  }

  // ---- 單擊選中 ----
  const hits = getHitTarget(mPx);
  if (hits.length > 0) {
    selectAndStartDrag(hits[0]);
  } else {
    state.selected = null;
    state.snappedPlayer = null;
    state.snappedType = null;
    hideMiniPopup();
    render2D();
    updateParamPanel();
  }
}

// ===== 處理 Pointer Move =====
function handlePointerMove(e) {
  if (!isDragging) return;

  const state = getState();
  const mPx = getCanvasMousePos(e);
  const mPos = px2m(mPx.x, mPx.y);

  // ---- 手繪模式 ----
  if (state.appMode === 'free') {
    if (state.freeDraw.currentPath) {
      state.freeDraw.currentPath.points.push({ x: mPos.x, z: mPos.z });
      render2D();
    }
    return;
  }

  if (!state.selected) return;

  const shot = getCurrentShot();
  if (!shot) return;

  const clampedX = Math.max(-COURT.width_d / 2 - 0.5, Math.min(COURT.width_d / 2 + 0.5, mPos.x));
  const clampedZ = Math.max(-COURT.length / 2 - 0.5, Math.min(COURT.length / 2 + 0.5, mPos.z));

  if (state.selected.type === 'player') {
    let snapTarget = null;
    const intercepts = getInterceptionInfo(shot, state.mode);

    // 吸附範圍 0.2m
    if (state.snapEnabled && intercepts.length > 0) {
      for (const ic of intercepts) {
        if (ic.playerId === state.selected.id) {
          const dSnap = Math.hypot(clampedX - ic.snapX, clampedZ - ic.snapZ);
          if (dSnap < 0.2) {
            snapTarget = { x: ic.snapX, z: ic.snapZ, type: 'intercept' };
            break;
          }
        }
      }
    }

    if (!snapTarget && state.snapEnabled && !shot.isSetup) {
      const dTo = Math.hypot(clampedX - shot.ballTo.x, clampedZ - shot.ballTo.z);
      if (dTo < 0.2) {
        snapTarget = { x: shot.ballTo.x, z: shot.ballTo.z, type: 'ballTo' };
      }
    }

    if (snapTarget) {
      shot.players[state.selected.id].x = snapTarget.x;
      shot.players[state.selected.id].z = snapTarget.z;
      state.snappedPlayer = state.selected.id;
      state.snappedType = snapTarget.type;
    } else {
      shot.players[state.selected.id].x = clampedX;
      shot.players[state.selected.id].z = clampedZ;
      state.snappedPlayer = null;
      state.snappedType = null;
    }
  } else if (state.selected.type === 'ball') {
    if (state.selected.point === 'from') {
      shot.ballFrom.x = clampedX;
      shot.ballFrom.z = clampedZ;
    } else if (state.selected.point === 'to') {
      shot.ballTo.x = clampedX;
      shot.ballTo.z = clampedZ;
      if (state.appMode === 'smart') {
        const shots = getShots();
        applySmartPositions(shot, shots, state.mode, state.appMode);
      }
    }
  }

  const shots = getShots();
  cascadeBallPositions(getCurrentIndex(), shots, state.mode, state.appMode);
  render2D();
  sync3DPositions();
  renderSideProfile(shot);
  updateParamPanel();
}

// ===== 處理 Pointer Up =====
function handlePointerUp(e) {
  const state = getState();

  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  if (isLongPress) {
    isLongPress = false;
    isDragging = false;
    isPointerDown = false;
    return;
  }

  if (state.appMode === 'free') {
    if (state.freeDraw.currentPath) {
      if (state.freeDraw.currentPath.points.length > 1) {
        state.freeDraw.paths.push(state.freeDraw.currentPath);
        state.freeDraw.redoPaths = [];
      }
      state.freeDraw.currentPath = null;
      render2D();
    }
  }

  isDragging = false;
  isPointerDown = false;
}

// ===== 事件綁定 =====
export function initInteractions() {
  const canvas = document.getElementById('court2d');

  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    handlePointerDown(e);
  });

  canvas.addEventListener('mousemove', (e) => {
    e.preventDefault();
    handlePointerMove(e);
  });

  window.addEventListener('mouseup', (e) => {
    handlePointerUp(e);
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handlePointerDown(e);
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    handlePointerMove(e);
  }, { passive: false });

  window.addEventListener('touchend', (e) => {
    handlePointerUp(e);
  });

  window.addEventListener('click', (e) => {
    const popup = document.getElementById('mini-selector-popup');
    const canvas = document.getElementById('court2d');
    if (popup && popup.style.display === 'block') {
      if (!popup.contains(e.target) && e.target !== canvas) {
        hideMiniPopup();
      }
    }
  });
}