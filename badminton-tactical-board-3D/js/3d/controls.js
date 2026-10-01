// js/3d/controls.js

import { getCamera, getControls } from './scene.js';

// v0.5 3B：視角鎖定狀態
let isViewLocked = false;

export function setCameraView(viewType) {
  const camera = getCamera();
  const controls = getControls();

  if (!camera || !controls) {
    console.warn('Camera or controls not initialized');
    return;
  }

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewType);
  });

  switch (viewType) {
    case 'top':
      camera.position.set(0, 20, 0.01);
      controls.target.set(0, 0, 0);
      break;
    case 'side':
      camera.position.set(10, 3, 0);
      controls.target.set(0, 1, 0);
      break;
    case '45':
      camera.position.set(9, 9, 8);
      controls.target.set(0, 0, 0);
      break;
    case 'high':
      camera.position.set(0, 12, 12);
      controls.target.set(0, 0, 0);
      break;
    case 'low':
      camera.position.set(0, 2.0, 11);
      controls.target.set(0, 1.2, 0);
      break;
    default:
      camera.position.set(9.5, 10.5, 11.5);
      controls.target.set(0, 0, 0);
  }
  controls.update();
}

// v0.5 3B：視角鎖定開關
export function setViewLock(locked) {
  isViewLocked = locked;
  const controls = getControls();
  if (controls) {
    if (locked) {
      controls.enabled = false;
      setCameraView('top');   // 俯瞰
    } else {
      controls.enabled = true;
    }
  }
  // 更新按鈕狀態
  const btn = document.getElementById('btn-view-lock');
  if (btn) {
    btn.classList.toggle('active', locked);
    btn.textContent = locked ? '🔓 解除鎖定' : '🔒 鎖定俯瞰';
  }
}

// v0.5 3B：綁定視角鎖定按鈕點擊事件（延遲綁定，確保 DOM 就緒）
function bindViewLockButton() {
  const btn = document.getElementById('btn-view-lock');
  if (!btn) return;
  if (btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    setViewLock(!isViewLocked);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindViewLockButton);
} else {
  bindViewLockButton();
}

