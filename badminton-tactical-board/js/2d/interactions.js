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
import { updateShotInfo, updateHUD, updateParamPanel, updateLog } from '../ui/panels.js';

// ========== 拖拽與選擇 ==========

let isDragging = false;

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
      hits.push({ type: 'ball', point: 'to', dist: dTo, label: '🎯 落點 (Ball To)' });
    }

    const fromPx = m2px(shot.ballFrom.x, shot.ballFrom.z);
    const dFrom = Math.hypot(mPx.x - fromPx.x, mPx.y - fromPx.y);
    if (dFrom <= 22) {
      hits.push({ type: 'ball', point: 'from', dist: dFrom, label: '🏸 擊球點 (Ball From)' });
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

// ========== 事件處理 ==========

function handlePointerDown(e) {
  const state = getState();
  const shot = getCurrentShot();

  if (state.appMode === 'free') {
    if (state.freeDraw.tool === 'pencil') {
      const mPx = getCanvasMousePos(e);
      const mPos = px2m(mPx.x, mPx.y);
      state.freeDraw.currentPath = {
        color: state.freeDraw.color,
        width: state.freeDraw.lineWidth,
        points: [{ x: mPos.x, z: mPos.z }]
      };
      isDragging = true;
    }
    return;
  }

  if (!shot) return;

  const mPx = getCanvasMousePos(e);

  // 等待設定落點
  if (shot.pendingTo) {
    const mPos = px2m(mPx.x, mPx.y);
    shot.ballTo = { x: mPos.x, y: 0.1, z: mPos.z };
    shot.pendingTo = false;
    const shots = getShots();
    autoMatchShotProperties(shot, shots, state.mode, state.appMode);
    applySmartPositions(shot, shots, state.mode, state.appMode);
    cascadeBallPositions(getCurrentIndex(), shots, state.mode, state.appMode);
    setCurrentIndex(getCurrentIndex());
    return;
  }

  const hits = getHitTarget(mPx);
  if (hits.length > 0) {
    if (hits.length > 1 && (hits[1].dist - hits[0].dist < 6)) {
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

function handlePointerMove(e) {
  if (!isDragging) return;

  const state = getState();
  const mPx = getCanvasMousePos(e);
  const mPos = px2m(mPx.x, mPx.y);

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

    if (state.snapEnabled && intercepts.length > 0) {
      for (const ic of intercepts) {
        if (ic.playerId === state.selected.id) {
          const dSnap = Math.hypot(clampedX - ic.snapX, clampedZ - ic.snapZ);
          if (dSnap < 0.6) {
            snapTarget = { x: ic.snapX, z: ic.snapZ, type: 'intercept' };
            break;
          }
        }
      }
    }

    if (!snapTarget && state.snapEnabled && !shot.isSetup) {
      const dTo = Math.hypot(clampedX - shot.ballTo.x, clampedZ - shot.ballTo.z);
      if (dTo < 0.5) {
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

function handlePointerUp(e) {
  const state = getState();
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
}

// ========== 事件綁定 ==========

export function initInteractions() {
  const canvas = document.getElementById('court2d');

  canvas.addEventListener('mousedown', handlePointerDown);
  canvas.addEventListener('mousemove', handlePointerMove);
  window.addEventListener('mouseup', handlePointerUp);

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handlePointerDown(e);
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    handlePointerMove(e);
  }, { passive: false });

  window.addEventListener('touchend', handlePointerUp);

  // 點擊外部關閉彈窗
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