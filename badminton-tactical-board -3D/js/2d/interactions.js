import { COURT } from '../config/constants.js';
import {
  getState, getCurrentShot, getShots, getCurrentIndex,
  setCurrentIndex, setAnimTime
} from '../core/state.js';
import { getTrajectoryPoint, getInterceptionInfo, getFullDuration } from '../core/physics.js';
import {
  autoMatchShotProperties, cascadeBallPositions,
  recalculateSpeeds, computeHitPoint, matchReceiverSpeed
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

const SNAP_ENTER = 0.3;
const SNAP_EXIT = 0.4;

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

  if (state.appMode === 'free') {
    if (shot.players) {
      Object.entries(shot.players).forEach(([id, pos]) => {
        const pPx = m2px(pos.x, pos.z);
        const dP = Math.hypot(mPx.x - pPx.x, mPx.y - pPx.y);
        if (dP <= 22) {
          hits.push({ type: 'player', id: id, dist: dP, label: `球員 ${id}` });
        }
      });
    }
    hits.sort((a, b) => a.dist - b.dist);
    return hits;
  }

  if (shot.isSetup) {
    if (shot.players) {
      Object.entries(shot.players).forEach(([id, pos]) => {
        const pPx = m2px(pos.x, pos.z);
        const dP = Math.hypot(mPx.x - pPx.x, mPx.y - pPx.y);
        if (dP <= 22) {
          hits.push({ type: 'player', id: id, dist: dP, label: `球員 ${id}` });
        }
      });
    }
    hits.sort((a, b) => a.dist - b.dist);
    return hits;
  }

  if (!shot.isSetup && !shot.pendingTo) {
    const isFirstShot = state.currentShot === 1;
    if (isFirstShot) {
      const fromPx = m2px(shot.ballFrom.x, shot.ballFrom.z);
      const dFrom = Math.hypot(mPx.x - fromPx.x, mPx.y - fromPx.y);
      if (dFrom <= 20) {
        hits.push({ type: 'ball', point: 'from', dist: dFrom, label: '🏸 擊球點' });
      }
    }

    const toPx = m2px(shot.ballTo.x, shot.ballTo.z);
    const dTo = Math.hypot(mPx.x - toPx.x, mPx.y - toPx.y);
    if (dTo <= 22) {
      hits.push({ type: 'ball', point: 'to', dist: dTo, label: '🎯 落點' });
    }
  }

  if (!shot.isSetup && !shot.pendingTo && shot.previewPositions) {
    Object.entries(shot.previewPositions).forEach(([id, pos]) => {
      const pPx = m2px(pos.x, pos.z);
      const dP = Math.hypot(mPx.x - pPx.x, mPx.y - pPx.y);
      if (dP <= 20) {
        hits.push({ type: 'preview', id: id, dist: dP, label: `預覽球員 ${id}` });
      }
    });
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
      const mPos = px2m(mPx.x, mPx.y);
      state.freeDraw.currentPath = {
        color: state.freeDraw.color,
        width: state.freeDraw.lineWidth || 3,
        points: [{ x: mPos.x, z: mPos.z }]
      };
      isDragging = true;
    } else if (tool === 'select') {
      const hits = getHitTarget(mPx);
      if (hits.length > 0) {
        selectAndStartDrag(hits[0]);
      } else {
        state.selected = null;
        render2D();
        updateParamPanel();
      }
    } else if (tool === 'eraser') {
      const mPos = px2m(mPx.x, mPx.y);
      const paths = state.freeDraw.paths;
      const eraseRadius = 0.3;
      let erased = false;
      for (let i = paths.length - 1; i >= 0; i--) {
        const path = paths[i];
        if (!path.points || path.points.length === 0) continue;
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

  if (shot.isSetup) {
    const hits = getHitTarget(mPx);
    if (hits.length > 0) {
      selectAndStartDrag(hits[0]);
    } else {
      state.selected = null;
      render2D();
      updateParamPanel();
    }
    return;
  }

  if (shot.pendingTo) {
    const mPos = px2m(mPx.x, mPx.y);
    const clampedX = Math.max(-COURT.width_d / 2, Math.min(COURT.width_d / 2, mPos.x));
    const clampedZ = Math.max(-COURT.length / 2, Math.min(COURT.length / 2, mPos.z));
    shot.ballTo = { x: clampedX, y: 0.1, z: clampedZ };
    shot.pendingTo = false;

    const shots = getShots();
    autoMatchShotProperties(shot, shots, state.mode, state.appMode);

    // 統一智能匹配：接球方速度 → 攔截點 → 站位；落點確定 → 重算擊球方回中速度
    matchReceiverSpeed(shot, shots);
    recalculateSpeeds(shot, state.mode, state.appMode);

    cascadeBallPositions(getCurrentIndex(), shots, state.mode, state.appMode);
    render2D();
    sync3DPositions();
    renderSideProfile(shot);
    updateParamPanel();
    updateLog();
    return;
  }

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
  const shot = getCurrentShot();

  const clampedX = Math.max(-COURT.width_d / 2 - 0.5, Math.min(COURT.width_d / 2 + 0.5, mPos.x));
  const clampedZ = Math.max(-COURT.length / 2 - 0.5, Math.min(COURT.length / 2 + 0.5, mPos.z));

  // ---- 手繪模式 ----
  if (state.appMode === 'free') {
    if (state.freeDraw.currentPath) {
      state.freeDraw.currentPath.points.push({ x: mPos.x, z: mPos.z });
      render2D();
      return;
    }
    if (state.selected && state.selected.type === 'player' && shot) {
      shot.players[state.selected.id].x = clampedX;
      shot.players[state.selected.id].z = clampedZ;
      render2D();
      sync3DPositions();
      updateParamPanel();
      return;
    }
    return;
  }

  // ---- 腳本模式 ----
  if (!state.selected || !shot) return;

  // 第 0 拍：拖動實體球員
  if (shot.isSetup && state.selected.type === 'player') {
    shot.players[state.selected.id].x = clampedX;
    shot.players[state.selected.id].z = clampedZ;

    const shots = getShots();
    if (shots.length > 1) {
      const striker = state.selected.id.startsWith('A') ? 'A' : 'B';
      const serverTeam = shots[0].server || 'A';
      if (striker === serverTeam) {
        const shot1 = shots[1];
        shot1.ballFrom.x = clampedX;
        shot1.ballFrom.z = clampedZ;
        cascadeBallPositions(1, shots, state.mode, state.appMode);
      }
    }

    render2D();
    sync3DPositions();
    renderSideProfile(shot);
    updateParamPanel();
    updateLog();
    return;
  }

  // 拖動半透明預覽球員
  if (state.selected.type === 'preview') {
    const id = state.selected.id;
    if (!shot.previewPositions) shot.previewPositions = {};
    if (!shot.previewPositions[id]) shot.previewPositions[id] = { x: 0, z: 0 };

    let finalX = clampedX;
    let finalZ = clampedZ;
    let snapType = null;
    let snapData = null;

    const wasSnapped = state.snappedPlayer === id && state.snappedType;
    const currentSnapRange = wasSnapped ? SNAP_EXIT : SNAP_ENTER;

    if (state.snapEnabled) {
      const intercepts = getInterceptionInfo(shot, state.mode);
      if (intercepts && intercepts.length > 0) {
        for (const ic of intercepts) {
          const dSnap = Math.hypot(clampedX - ic.snapX, clampedZ - ic.snapZ);
          if (dSnap < currentSnapRange) {
            finalX = ic.snapX;
            finalZ = ic.snapZ;
            snapType = 'intercept';
            snapData = ic;
            break;
          }
        }
      }

      if (!snapType) {
        const dTo = Math.hypot(clampedX - shot.ballTo.x, clampedZ - shot.ballTo.z);
        if (dTo < currentSnapRange) {
          finalX = shot.ballTo.x;
          finalZ = shot.ballTo.z;
          snapType = 'ballTo';
        }
      }
    }

    shot.previewPositions[id].x = finalX;
    shot.previewPositions[id].z = finalZ;

    const defender = shot.striker === 'A' ? 'B' : 'A';
    const isDefender = id.startsWith(defender);

    if (snapType === 'intercept' && snapData && isDefender) {
      shot.interception = {
        pt: { x: snapData.snapX, y: snapData.height, z: snapData.snapZ },
        playerId: snapData.playerId,
        height: snapData.height,
        flightTime: snapData.flightTime,
        t: snapData.t
      };

      const defenderPos = shot.players[id];
      if (defenderPos) {
        const moveDist = Math.hypot(
          snapData.snapX - defenderPos.x,
          snapData.snapZ - defenderPos.z
        );
        const reqSpeed = moveDist / Math.max(0.1, snapData.flightTime);
        const finalSpeed = Math.max(1.0, Math.min(8.0, reqSpeed));
        shot.players[id].speed = parseFloat(finalSpeed.toFixed(1));
        shot.players[id].speedOverride = true;
      }
    } else {
      shot.interception = null;
      // 自由拖（未吸附）：速度 = 起點→拖動終點 ÷ 該拍全程時間
      if (isDefender && shot.players[id]) {
        const startPos = shot.players[id];
        const moveDist = Math.hypot(finalX - startPos.x, finalZ - startPos.z);
        const fullDur = getFullDuration(shot);
        const freeSpeed = Math.max(1.0, Math.min(8.0, moveDist / Math.max(0.15, fullDur)));
        shot.players[id].speed = parseFloat(freeSpeed.toFixed(1));
        shot.players[id].speedOverride = true;
      }
    }

    state.snappedPlayer = snapType ? id : null;
    state.snappedType = snapType;

    // 只重算速度，不重設 previewPositions
    recalculateSpeeds(shot, state.mode, state.appMode);

    // 重算 hitPoint
    const shots = getShots();
    const idx = getCurrentIndex();
    const prevShot = idx > 0 ? shots[idx - 1] : null;
    shot.hitPoint = computeHitPoint(shot, prevShot, shot.hitLevel || 'high');

    cascadeBallPositions(getCurrentIndex(), shots, state.mode, state.appMode);

    render2D();
    sync3DPositions();
    renderSideProfile(shot);
    updateParamPanel();
    return;
  }

  // 拖動球軌跡起點
  if (state.selected.type === 'ball' && state.selected.point === 'from') {
    shot.ballFrom.x = clampedX;
    shot.ballFrom.z = clampedZ;

    // 軌跡起點改變 → 接球方速度重匹配 + 擊球方回中速度重算
    matchReceiverSpeed(shot, getShots());
    recalculateSpeeds(shot, state.mode, state.appMode);
  }
  // 拖動球軌跡終點（理論落點）
  else if (state.selected.type === 'ball' && state.selected.point === 'to') {
    shot.ballTo.x = clampedX;
    shot.ballTo.z = clampedZ;
    shot.ballTo.y = 0.1;  // 確保是地面落點

    // 統一智能匹配（拖動中即時）：接球方速度 → 攔截點 → 站位；
    // 落點變化 → 同步重算擊球方回中速度
    matchReceiverSpeed(shot, getShots());
    recalculateSpeeds(shot, state.mode, state.appMode);

    // 接球方 preview 永遠吸附落點（攔截點只影響 3D 切拍時刻，不影響 2D 站位）；手動模式也適用
    if (shot.previewPositions) {
      const defender = shot.striker === 'A' ? 'B' : 'A';
      const defenderIds = getPlayers(state.mode)[defender] || [];
      if (defenderIds.length > 0 && shot.ballTo) {
        shot.previewPositions[defenderIds[0]] = { x: shot.ballTo.x, z: shot.ballTo.z };
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

  // 拖動結束：終點拖曳完成 → 統一智能匹配（接球方速度 → 攔截點 → 站位）
  if (state.appMode !== 'free' && isDragging &&
      state.selected && state.selected.type === 'ball' && state.selected.point === 'to') {
    const shot = getCurrentShot();
    if (shot && !shot.isSetup && !shot.pendingTo) {
      const shots = getShots();
      matchReceiverSpeed(shot, shots);
      recalculateSpeeds(shot, state.mode, state.appMode);
      cascadeBallPositions(getCurrentIndex(), shots, state.mode, state.appMode);
      render2D();
      sync3DPositions();
      renderSideProfile(shot);
      updateParamPanel();
      updateLog();
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