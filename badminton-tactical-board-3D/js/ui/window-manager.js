// ========== 浮動小窗管理器 ==========
// 功能：開關、拖動、記憶位置（localStorage）、自動復位、允許重疊、打開順序置頂
// 位置以百分比儲存（縮放視窗按比例移動），transform GPU 加速

const STORAGE_KEY = 'btb_windows_v1';
const MOBILE_BREAKPOINT = 768;

let windows = {};   // { id: { el, btn, defaultLeftPercent, defaultTopPercent, xPercent, yPercent } }
let dragState = null;
let zIndexCounter = 100;

function isMobile() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function loadPositions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function savePosition(id, xPercent, yPercent) {
  const all = loadPositions();
  all[id] = { x: xPercent, y: yPercent };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
}

function clampToViewport(x, y, w, h) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const minVisible = Math.min(60, Math.min(vw, vh) * 0.3);
  let nx = x, ny = y;
  if (nx > vw - minVisible) nx = vw - minVisible;
  if (ny > vh - minVisible) ny = vh - minVisible;
  if (nx + w < minVisible) nx = minVisible - w;
  if (ny + h < minVisible) ny = minVisible - h;
  if (nx < 0) nx = 0;
  if (ny < 52) ny = 52;
  return { x: nx, y: ny };
}

function pixelsToPercent(px, viewportSize) {
  return (px / viewportSize) * 100;
}

function percentToPixels(pct, viewportSize) {
  return (pct / 100) * viewportSize;
}

function applyPosition(win, xPercent, yPercent) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = win.el.getBoundingClientRect();

  const maxW = vw - 16;
  const maxH = vh - 80;
  if (rect.width > maxW) {
    win.el.style.maxWidth = maxW + 'px';
  }
  if (rect.height > maxH) {
    win.el.style.maxHeight = maxH + 'px';
  }

  let x = percentToPixels(xPercent, vw);
  let y = percentToPixels(yPercent, vh);
  const c = clampToViewport(x, y, rect.width || 240, rect.height || 120);
  win.el.style.transform = `translate(${c.x}px, ${c.y}px)`;
  win.xPercent = pixelsToPercent(c.x, vw);
  win.yPercent = pixelsToPercent(c.y, vh);
}

function onDragStart(e, win) {
  if (e.target.closest('.fw-close')) return;
  const rect = win.el.getBoundingClientRect();
  dragState = {
    id: win.id,
    offsetX: (e.touches ? e.touches[0].clientX : e.clientX) - rect.left,
    offsetY: (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
  };
  win.el.classList.add('dragging');
  win.el.style.zIndex = ++zIndexCounter;
  e.preventDefault();
}

function onDragMove(e) {
  if (!dragState) return;
  const win = windows[dragState.id];
  if (!win) return;
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  const nx = cx - dragState.offsetX;
  const ny = cy - dragState.offsetY;
  const rect = win.el.getBoundingClientRect();
  const c = clampToViewport(nx, ny, rect.width, rect.height);
  win.el.style.transform = `translate(${c.x}px, ${c.y}px)`;
  // 更新記憶體百分比
  win.xPercent = pixelsToPercent(c.x, window.innerWidth);
  win.yPercent = pixelsToPercent(c.y, window.innerHeight);
}

function onDragEnd() {
  if (!dragState) return;
  const win = windows[dragState.id];
  if (win) {
    win.el.classList.remove('dragging');
    savePosition(win.id, win.xPercent, win.yPercent);
  }
  dragState = null;
}

function bindDrag(win) {
  const header = win.el.querySelector('.fw-header');
  if (!header) return;
  header.addEventListener('mousedown', (e) => onDragStart(e, win));
  header.addEventListener('touchstart', (e) => onDragStart(e, win), { passive: false });
}

export function registerWindow(id, options = {}) {
  const el = document.getElementById(id);
  if (!el) return null;

  const btnId = options.btnId;
  const btn = btnId ? document.getElementById(btnId) : null;

  el.classList.add('float-window');
  el.style.left = '0';
  el.style.top = '0';

  const win = {
    id,
    el,
    btn,
    defaultLeftPercent: options.defaultLeftPercent ?? 2,
    defaultTopPercent: options.defaultTopPercent ?? 10,
    xPercent: options.defaultLeftPercent ?? 2,
    yPercent: options.defaultTopPercent ?? 10
  };

  // 初始位置：localStorage 優先，否則預設
  const saved = loadPositions()[id];
  if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
    win.xPercent = saved.x;
    win.yPercent = saved.y;
  }
  applyPosition(win, win.xPercent, win.yPercent);

  // 關閉按鈕
  const closeBtn = el.querySelector('.fw-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeWindow(id);
    });
  }

  // 頂欄按鈕開關
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleWindow(id);
    });
  }

  bindDrag(win);
  windows[id] = win;
  return win;
}

export function openWindow(id) {
  const win = windows[id];
  if (!win) return;
  if (isMobile()) {
    Object.keys(windows).forEach(otherId => {
      if (otherId !== id) closeWindow(otherId);
    });
  }
  win.el.classList.add('open');
  win.el.style.zIndex = ++zIndexCounter;
  if (win.btn) win.btn.classList.add('active');
  applyPosition(win, win.xPercent, win.yPercent);
}

export function closeWindow(id) {
  const win = windows[id];
  if (!win) return;
  win.el.classList.remove('open');
  if (win.btn) win.btn.classList.remove('active');
}

export function toggleWindow(id) {
  const win = windows[id];
  if (!win) return;
  if (win.el.classList.contains('open')) {
    closeWindow(id);
  } else {
    openWindow(id);
  }
}

export function initWindowManager() {
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('touchmove', onDragMove, { passive: false });
  window.addEventListener('mouseup', onDragEnd);
  window.addEventListener('touchend', onDragEnd);
  window.addEventListener('resize', () => {
    Object.values(windows).forEach(win => {
      applyPosition(win, win.xPercent, win.yPercent);
    });
  });
}
