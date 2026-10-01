import { COURT } from '../config/constants.js';
import { getState, getCurrentShot } from '../core/state.js';
import { m2px, px2m, render2D } from './renderer.js';
import { sync3DPositions } from '../3d/entities.js';
import { updateParamPanel } from '../ui/panels.js';

// ========== 2D 手繪板互動（v0.5 3C-2：僅手繪模式）==========
// 腳本模式的拖曳球員、點擊落點、端點拖曳、長按/右鍵重疊選單皆已移除，
// 戰術編輯（球員/球/攔截點）一律在 3D 場景進行（js/3d/interactions.js）。
// 本檔只保留：鉛筆、橡皮、選擇（拖動球員參考點，同步 3D）。

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

// 命中測試：僅球員參考點
function getHitTarget(mPx) {
  const shot = getCurrentShot();
  if (!shot || !shot.players) return [];

  const hits = [];
  Object.entries(shot.players).forEach(([id, pos]) => {
    const pPx = m2px(pos.x, pos.z);
    const dP = Math.hypot(mPx.x - pPx.x, mPx.y - pPx.y);
    if (dP <= 22) {
      hits.push({ type: 'player', id: id, dist: dP, label: `球員 ${id}` });
    }
  });
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

  // v0.5 3C-2：2D 僅手繪模式可互動
  if (state.appMode !== 'free') return;

  const mPx = getCanvasMousePos(e);
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
}

// ===== 處理 Pointer Move =====
function handlePointerMove(e) {
  if (!isDragging) return;

  const state = getState();
  if (state.appMode !== 'free') return;

  const mPx = getCanvasMousePos(e);
  const mPos = px2m(mPx.x, mPx.y);
  const shot = getCurrentShot();

  // 鉛筆續畫
  if (state.freeDraw.currentPath) {
    state.freeDraw.currentPath.points.push({ x: mPos.x, z: mPos.z });
    render2D();
    return;
  }

  // 選擇工具：拖動球員參考點（同步 3D 實體）
  if (state.selected && state.selected.type === 'player' && shot) {
    const clampedX = Math.max(-COURT.width_d / 2 - 0.5, Math.min(COURT.width_d / 2 + 0.5, mPos.x));
    const clampedZ = Math.max(-COURT.length / 2 - 0.5, Math.min(COURT.length / 2 + 0.5, mPos.z));
    shot.players[state.selected.id].x = clampedX;
    shot.players[state.selected.id].z = clampedZ;
    render2D();
    sync3DPositions();
    updateParamPanel();
  }
}

// ===== 處理 Pointer Up =====
function handlePointerUp() {
  const state = getState();

  if (state.appMode === 'free' && state.freeDraw.currentPath) {
    if (state.freeDraw.currentPath.points.length > 1) {
      state.freeDraw.paths.push(state.freeDraw.currentPath);
      state.freeDraw.redoPaths = [];
    }
    state.freeDraw.currentPath = null;
    render2D();
  }

  isDragging = false;
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

  window.addEventListener('mouseup', () => {
    handlePointerUp();
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

  window.addEventListener('touchend', () => {
    handlePointerUp();
  });
}
