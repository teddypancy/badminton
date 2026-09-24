// ========== 迷你選擇器彈窗 ==========

let popupVisible = false;

/**
 * 顯示迷你選擇器
 */
export function showMiniPopup(px, py, title, options) {
  const popup = document.getElementById('mini-selector-popup');
  const titleEl = document.getElementById('mini-popup-title');
  const optionsEl = document.getElementById('mini-popup-options');
  const courtWrap = document.getElementById('court-wrap');
  const canvas = document.getElementById('court2d');

  if (!popup || !titleEl || !optionsEl || !courtWrap || !canvas) return;

  titleEl.textContent = title;
  optionsEl.innerHTML = '';

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.style.cssText = 'text-align:left; padding:6px 10px; font-size:11px; background:#1e3a5f; width:100%; border:1px solid #2a4a73; border-radius:4px; cursor:pointer; color:#e6e6e6; transition:background 0.2s;';
    btn.onmouseover = () => btn.style.background = '#f57c00';
    btn.onmouseout = () => btn.style.background = '#1e3a5f';
    btn.textContent = opt.label;
    btn.onclick = (ev) => {
      ev.stopPropagation();
      opt.action();
      hideMiniPopup();
    };
    optionsEl.appendChild(btn);
  });

  const wrapRect = courtWrap.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();

  const domX = (px / canvas.width) * canvasRect.width + (canvasRect.left - wrapRect.left);
  const domY = (py / canvas.height) * canvasRect.height + (canvasRect.top - wrapRect.top);

  let posX = domX + 15;
  let posY = domY - 10;

  popup.style.display = 'block';
  const popupWidth = popup.offsetWidth || 160;
  const popupHeight = popup.offsetHeight || 100;

  if (posX + popupWidth > wrapRect.width - 10) posX = domX - popupWidth - 15;
  if (posY + popupHeight > wrapRect.height - 10) posY = wrapRect.height - popupHeight - 10;
  if (posY < 10) posY = 10;

  popup.style.left = Math.max(10, posX) + 'px';
  popup.style.top = Math.max(10, posY) + 'px';

  popupVisible = true;
}

/**
 * 隱藏迷你選擇器
 */
export function hideMiniPopup() {
  const popup = document.getElementById('mini-selector-popup');
  if (popup) {
    popup.style.display = 'none';
  }
  popupVisible = false;
}

/**
 * 檢查彈窗是否可見
 */
export function isPopupVisible() {
  return popupVisible;
}