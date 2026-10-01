import { SPEED_BASELINE } from '../config/constants.js';
import { getState, getCurrentShot, getShots } from '../core/state.js';
import { checkPhysics } from '../core/physics.js';
import { render2D } from '../2d/renderer.js';
import { renderSideProfile } from '../2d/sideprofile.js';
import { sync3DPositions } from '../3d/entities.js';
import { clamp } from '../utils/helpers.js';

// v0.5 3B：暴露移動/回動速度手動調整函數（供 inline onclick 呼叫）
window.__setMoveSpeed = function(value) {
  const shot = getCurrentShot();
  if (!shot || shot.isSetup) return;
  shot.moveSpeed = parseFloat(clamp(value, SPEED_BASELINE.NORMAL_MIN, SPEED_BASELINE.GLOBAL_CAP).toFixed(2));
  shot.moveSpeedOverride = true;
  updateParamPanel();
  render2D();
  sync3DPositions();
};

window.__setRecoverSpeed = function(value) {
  const shot = getCurrentShot();
  if (!shot || shot.isSetup) return;
  shot.recoverSpeed = parseFloat(clamp(value, SPEED_BASELINE.NORMAL_MIN, SPEED_BASELINE.GLOBAL_CAP).toFixed(2));
  shot.recoverSpeedOverride = true;
  updateParamPanel();
  render2D();
  sync3DPositions();
};

// v0.5 3B：視角鎖定（panels.js 本地實作，避免 controls.js 快取相依問題）
let _isViewLocked = false;
function toggleViewLock() {
  _isViewLocked = !_isViewLocked;
  // 透過 window 呼叫 controls.js 暴露的 setViewLock（若存在）
  if (typeof window.setViewLock === 'function') {
    window.setViewLock(_isViewLocked);
  } else {
    // fallback：直接操作 controls
    const controls = window.__controls;
    if (controls) {
      controls.enabled = !_isViewLocked;
      if (_isViewLocked && typeof window.setCameraView === 'function') {
        window.setCameraView('top');
      }
    }
    const btn = document.getElementById('btn-view-lock');
    if (btn) {
      btn.classList.toggle('active', _isViewLocked);
      btn.textContent = _isViewLocked ? '🔓 解除鎖定' : '🔒 鎖定俯瞰';
    }
  }
}

// v0.5 3B：綁定視角鎖定按鈕
function ensureViewLockBound() {
  const btn = document.getElementById('btn-view-lock');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', toggleViewLock);
}

// ========== 更新拍數資訊 ==========
export function updateShotInfo() {
  const state = getState();
  const infoText = document.getElementById('shot-info-text');
  if (infoText) {
    infoText.textContent = `${state.currentShot} / ${state.shots.length - 1}`;
  }
}

// ========== 更新 HUD ==========
export function updateHUD() {
  const state = getState();
  const hud = document.getElementById('hud');
  if (hud) {
    hud.textContent = `📊 共 ${state.shots.length - 1} 拍`;
  }
}

// ========== 系統提示（寫入說明與診斷小窗） ==========
export function updateSystemPrompt(message, type) {
  const el = document.getElementById('system-prompt-content');
  if (!el) return;
  const color = type === 'warn' ? '#ff8a80' : (type === 'ok' ? '#81c784' : '#90caf9');
  el.innerHTML = `<div style="font-size:11px; color:${color}; padding:6px 8px; background:rgba(0,0,0,0.2); border-radius:4px; margin-top:6px;">${message}</div>`;
}

// ========== 分區渲染：拍次管理 ==========
function renderShotManagement(shot) {
  // 確保視角鎖定按鈕已綁定（fallback）
  ensureViewLockBound();

  // 按鈕已在 HTML 中，這裡只需更新拍序與視角鎖定按鈕狀態
  const state = getState();
  const infoText = document.getElementById('shot-info-text');
  if (infoText) {
    infoText.textContent = `${state.currentShot} / ${state.shots.length - 1}`;
  }
}

// ========== 分區渲染：移動速度 ==========
function renderMoveSpeed(shot) {
  const el = document.getElementById('move-speed-content');
  if (!el) return;

  if (shot.isSetup) {
    el.innerHTML = `<div style="font-size:11px; color:#78909c;">—（設定拍不設速度）</div>`;
    return;
  }

  const state = getState();
  const isFirstShot = state.currentShot === 1;

  if (isFirstShot) {
    el.innerHTML = `<div style="font-size:11px; color:#78909c;">—（第 1 拍不設速度）</div>`;
    return;
  }

  const mover = shot.mover || '?';
  const val = shot.moveSpeed;
  const display = val === null || val === undefined ? '待設定' : val.toFixed(2) + ' m/s';

  el.innerHTML = `
    <div class="param-row">
      <label style="font-size:11px;">移動速度（${mover}隊）：</label>
      <div class="slider-container" style="flex:1;">
        <button class="step-btn" onclick="window.__setMoveSpeed(${val === null ? SPEED_BASELINE.NORMAL_MIN : (val - 0.2).toFixed(2)})">−</button>
        <span class="slider-val" style="min-width:56px;font-size:11px;">${display}</span>
        <button class="step-btn" onclick="window.__setMoveSpeed(${val === null ? SPEED_BASELINE.NORMAL_MIN + 0.2 : (val + 0.2).toFixed(2)})">+</button>
      </div>
    </div>
  `;
}

// ========== 分區渲染：擊球姿態 ==========
function renderStance(shot) {
  const el = document.getElementById('stance-content');
  if (!el) return;

  if (shot.isSetup) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = `
    <div class="param-row">
      <label>正手/反手：</label>
      <div class="param-btns" style="flex:0 0 auto; gap:4px;">
        <button class="${shot.forehand ? 'active' : ''}" style="min-width:48px; padding:4px 12px;" onclick="window.setForehand(true)">正手</button>
        <button class="${!shot.forehand ? 'active' : ''}" style="min-width:48px; padding:4px 12px;" onclick="window.setForehand(false)">反手</button>
      </div>
    </div>
  `;
}

// ========== 分區渲染：擊球高度 ==========
function renderHitLevel(shot) {
  const el = document.getElementById('hit-level-content');
  if (!el) return;

  if (shot.isSetup) {
    el.innerHTML = '';
    return;
  }

  const state = getState();
  const isFirstShot = state.currentShot === 1;

  // v0.5 3C-1：擊球高度優先取吸附時寫入的 hitPoint；
  // 未吸附時退回 interceptPoints[selectedInterceptIndex]
  const selectedIp = shot.hitPoint || shot.interceptPoints?.[shot.selectedInterceptIndex];
  const actualHeight = selectedIp ? selectedIp.height.toFixed(2) : '無攔截';
  const actualLevel = selectedIp ? selectedIp.level : shot.hitLevel;

  el.innerHTML = `
    <div class="param-row">
      <label>擊球高度：</label>
      <div class="param-btns">
        <button class="${actualLevel === 'high' ? 'active' : ''}" onclick="window.setHitLevel('high')" ${isFirstShot ? 'disabled' : ''}>高位</button>
        <button class="${actualLevel === 'mid' ? 'active' : ''}" onclick="window.setHitLevel('mid')" ${isFirstShot ? 'disabled' : ''}>中位</button>
        <button class="${actualLevel === 'low' ? 'active' : ''}" onclick="window.setHitLevel('low')" ${isFirstShot ? 'disabled' : ''}>低位</button>
      </div>
    </div>
    <div style="font-size:10px; color:#78909c; margin-top:-2px; margin-bottom:6px; padding-left:2px;">
      ${isFirstShot ? '🔒 第1拍固定低位發球 (1.15m)' : '實際高度：' + actualHeight + 'm'}
    </div>
  `;
}

// ========== 分區渲染：球路類型 ==========
function renderArcType(shot) {
  const el = document.getElementById('arc-type-content');
  if (!el) return;

  if (shot.isSetup) {
    el.innerHTML = '';
    return;
  }

  const state = getState();
  const isFirstShot = state.currentShot === 1;

  // 第 1 拍發球：正手默認後場高遠球、反手默認網前平球（提示用，不強制）
  let hint = '';
  if (isFirstShot) {
    hint = shot.forehand
      ? '<div style="font-size:10px; color:#78909c; margin-top:-2px;">💡 正手發球建議後場高遠球</div>'
      : '<div style="font-size:10px; color:#78909c; margin-top:-2px;">💡 反手發球建議網前平球</div>';
  }

  const showPressOptions = true; // v0.5：快壓/輕壓不再限制高位

  el.innerHTML = `
    <div class="param-row">
      <label>球路類型：</label>
      <div class="param-btns">
        <button class="${shot.arcType === 'high_arc' ? 'active' : ''}" onclick="window.setArcType('high_arc')">高球</button>
        <button class="${shot.arcType === 'mid_high_arc' ? 'active' : ''}" onclick="window.setArcType('mid_high_arc')">平高</button>
        <button class="${shot.arcType === 'low_flat_arc' ? 'active' : ''}" onclick="window.setArcType('low_flat_arc')">平球</button>
        ${showPressOptions ? `
          <button class="${shot.arcType === 'fast_press' ? 'active' : ''}" onclick="window.setArcType('fast_press')">快壓</button>
          <button class="${shot.arcType === 'soft_press' ? 'active' : ''}" onclick="window.setArcType('soft_press')">輕壓</button>
        ` : ''}
      </div>
    </div>
    ${hint}
  `;
}

// ========== 分區渲染：頂點高度 ==========
function renderApexHeight(shot) {
  const el = document.getElementById('apex-height-content');
  if (!el) return;

  if (shot.isSetup) {
    el.innerHTML = '';
    return;
  }

  const isPress = shot.arcType === 'fast_press' || shot.arcType === 'soft_press';

  el.innerHTML = `
    <div class="param-row">
      <label>頂點高度：</label>
      <div class="slider-container">
        <button class="step-btn" onclick="window.adjustApexHeight(-0.1)" ${isPress ? 'disabled' : ''}>−</button>
        <input type="range" min="1.2" max="8.0" step="0.1" value="${shot.apexHeight.toFixed(1)}" oninput="window.setApexHeight(parseFloat(this.value))" ${isPress ? 'disabled' : ''} style="flex:1;">
        <button class="step-btn" onclick="window.adjustApexHeight(0.1)" ${isPress ? 'disabled' : ''}>+</button>
        <span class="slider-val" style="min-width:44px;">${shot.apexHeight.toFixed(1)}m ${isPress ? '🔒' : ''}</span>
      </div>
    </div>
  `;
}

// ========== 分區渲染：頂點位置 ==========
function renderApexPos(shot) {
  const el = document.getElementById('apex-pos-content');
  if (!el) return;

  if (shot.isSetup) {
    el.innerHTML = '';
    return;
  }

  const isPress = shot.arcType === 'fast_press' || shot.arcType === 'soft_press';

  el.innerHTML = `
    <div class="param-row">
      <label>頂點位置：</label>
      <div class="slider-container">
        <button class="step-btn" onclick="window.adjustApexPos(-0.05)" ${isPress ? 'disabled' : ''}>−</button>
        <input type="range" min="0.05" max="0.95" step="0.05" value="${shot.apexPos.toFixed(2)}" oninput="window.setApexPos(parseFloat(this.value))" ${isPress ? 'disabled' : ''} style="flex:1;">
        <button class="step-btn" onclick="window.adjustApexPos(0.05)" ${isPress ? 'disabled' : ''}>+</button>
        <span class="slider-val" style="min-width:44px;">${Math.round(shot.apexPos * 100)}% ${isPress ? '🔒' : ''}</span>
      </div>
    </div>
  `;
}

// ========== 分區渲染：回動速度 ==========
function renderRecoverSpeed(shot) {
  const el = document.getElementById('recover-speed-content');
  if (!el) return;

  if (shot.isSetup) {
    el.innerHTML = `<div style="font-size:11px; color:#78909c;">—（設定拍不設速度）</div>`;
    return;
  }

  const state = getState();
  const isFirstShot = state.currentShot === 1;

  if (isFirstShot) {
    el.innerHTML = `<div style="font-size:11px; color:#78909c;">—（第 1 拍不設速度）</div>`;
    return;
  }

  const recoverer = shot.recoverer || '?';
  const val = shot.recoverSpeed;
  const display = val === null || val === undefined ? '待設定' : val.toFixed(2) + ' m/s';

  el.innerHTML = `
    <div class="param-row">
      <label style="font-size:11px;">回動速度（${recoverer}隊）：</label>
      <div class="slider-container" style="flex:1;">
        <button class="step-btn" onclick="window.__setRecoverSpeed(${val === null ? SPEED_BASELINE.NORMAL_MIN : (val - 0.2).toFixed(2)})">−</button>
        <span class="slider-val" style="min-width:56px;font-size:11px;">${display}</span>
        <button class="step-btn" onclick="window.__setRecoverSpeed(${val === null ? SPEED_BASELINE.NORMAL_MIN + 0.2 : (val + 0.2).toFixed(2)})">+</button>
      </div>
    </div>
  `;
}

// ========== 渲染物理診斷至「說明與診斷」小窗 ==========
function renderDiagnostic(shot) {
  const diagContent = document.getElementById('diagnostic-content');
  if (!diagContent) return;

  if (shot.isSetup) {
    diagContent.innerHTML = `<div class="physics-diag ok" style="margin-bottom:0;">調整發接發站位</div>`;
    return;
  }

  const state = getState();
  const shots = getShots();
  const diag = checkPhysics(shot, shots, state.mode);

  let diagHtml = `<div class="physics-diag ${diag.type}" style="margin-bottom:6px;">${diag.msg}</div>`;

  if (diag.stats) {
    const s = diag.stats;
    diagHtml += `<div style="font-size:11px; background:rgba(0,0,0,0.2); border-radius:4px; padding:6px 8px;">`;
    diagHtml += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">`;
    diagHtml += `<div>🎯 初速：<strong style="color:#ffd54f;">${s.initialSpeed}</strong> km/h</div>`;
    diagHtml += `<div>📊 均速：<strong style="color:#ffd54f;">${s.averageSpeed}</strong> km/h</div>`;
    diagHtml += `<div>📏 距離：<strong style="color:#90caf9;">${s.flightDistance.toFixed(1)}</strong> m</div>`;
    diagHtml += `<div>⏱ 時間：<strong style="color:#90caf9;">${s.flightTime.toFixed(2)}</strong> s</div>`;
    diagHtml += `</div>`;

    if (s.netClearance && s.netClearance < 50) {
      const netColor = s.netClearance >= 1.55 ? '#81c784' : '#ff8a65';
      diagHtml += `<div style="margin-top:4px;">🌐 過網：<strong style="color:${netColor};">${s.netClearance.toFixed(2)}</strong> m</div>`;
    }
    diagHtml += `</div>`;
  }

  diagContent.innerHTML = diagHtml;
}

// ========== 更新參數面板（分區渲染） ==========
export function updateParamPanel() {
  const state = getState();
  const shot = getCurrentShot();

  if (state.appMode === 'free') {
    return;
  }

  if (!shot) return;

  renderSideProfile(shot);

  // setup 拍：只渲染拍次管理與物理診斷
  if (shot.isSetup) {
    renderShotManagement(shot);
    document.getElementById('move-speed-content').innerHTML = `<div style="font-size:11px; color:#78909c;">—（設定拍不設速度）</div>`;
    document.getElementById('stance-content').innerHTML = '';
    document.getElementById('hit-level-content').innerHTML = '';
    document.getElementById('arc-type-content').innerHTML = '';
    document.getElementById('apex-height-content').innerHTML = '';
    document.getElementById('apex-pos-content').innerHTML = '';
    document.getElementById('recover-speed-content').innerHTML = `<div style="font-size:11px; color:#78909c;">—（設定拍不設速度）</div>`;
    renderDiagnostic(shot);
    return;
  }

  renderShotManagement(shot);
  renderMoveSpeed(shot);
  renderStance(shot);
  renderHitLevel(shot);
  renderArcType(shot);
  renderApexHeight(shot);
  renderApexPos(shot);
  renderRecoverSpeed(shot);
  renderDiagnostic(shot);
}
