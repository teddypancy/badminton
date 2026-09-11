import { ARC_TYPES, LIMITS } from '../config/constants.js';
import { getState, getCurrentShot, getShots, getCurrentIndex } from '../core/state.js';
import { checkPhysics, getInterceptionInfo } from '../core/physics.js';
import { render2D } from '../2d/renderer.js';
import { renderSideProfile } from '../2d/sideprofile.js';
import { sync3DPositions } from '../3d/entities.js';

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

// ========== 判斷速度顏色 ==========
function getSpeedColor(currentSpeed, prevSpeed) {
  if (prevSpeed === undefined || prevSpeed === null) {
    return '#ffd54f';
  }
  const diff = currentSpeed - prevSpeed;
  if (diff > 0.15) return '#ff5252';
  if (diff < -0.15) return '#81c784';
  return '#ffd54f';
}

// ========== 更新參數面板 ==========
export function updateParamPanel() {
  const state = getState();
  const shot = getCurrentShot();
  const content = document.getElementById('param-content');
  const diagContent = document.getElementById('diagnostic-content');
  const panelWrap = document.getElementById('panel-wrap');

  // 手繪模式：隱藏整個參數區
  if (state.appMode === 'free') {
    if (panelWrap) panelWrap.classList.add('hidden-panel');
    return;
  }

  if (panelWrap) panelWrap.classList.remove('hidden-panel');

  if (!content || !shot) return;

  renderSideProfile(shot);

  // 第 0 拍
  if (shot.isSetup) {
    let html = `<h4>🎯 發接發站位</h4>`;
    html += `
      <div class="param-row">
        <label>發球方：</label>
        <div class="param-btns">
          <button class="${shot.server === 'A' ? 'active' : ''}" onclick="window.setServer('A')">藍隊</button>
          <button class="${shot.server === 'B' ? 'active' : ''}" onclick="window.setServer('B')">紅隊</button>
        </div>
      </div>
    `;
    html += `<div style="font-weight:bold; color:#ffd54f; font-size:11px; margin: 8px 0 4px 0;">⚡ 球員速度</div>`;
    Object.entries(shot.players).forEach(([id, p]) => {
      const teamLabel = id.startsWith('A') ? '藍' : '紅';
      html += `
        <div class="param-row">
          <label style="width:60px;">${teamLabel}${id}</label>
          <div class="slider-container" style="flex:1;max-width:160px;">
            <button class="step-btn" onclick="window.adjustPlayerSpeed('${id}', -0.2)">−</button>
            <span class="slider-val" style="min-width:36px;font-size:12px;">${(p.speed || 3.0).toFixed(1)}</span>
            <button class="step-btn" onclick="window.adjustPlayerSpeed('${id}', 0.2)">+</button>
          </div>
        </div>
      `;
    });
    content.innerHTML = html;

    if (diagContent) {
      diagContent.innerHTML = `<div style="font-size:11px;color:#78909c;">第 0 拍：初始站位調整</div>`;
    }
    return;
  }

  // ===== 第 1 拍以後 =====
  const shots = getShots();
  const diag = checkPhysics(shot, shots, state.mode);
  const prevShot = state.currentShot > 0 ? shots[state.currentShot - 1] : null;

  // ---- 參數區 ----
  let html = '';

  // 球員速度
  html += `<div style="font-weight:bold; color:#ffd54f; font-size:11px; margin-bottom:4px;">⚡ 球員速度</div>`;
  const playerEntries = Object.entries(shot.players);
  const cols = playerEntries.length >= 3 ? 2 : 1;
  html += `<div style="display:grid; grid-template-columns: ${cols === 2 ? '1fr 1fr' : '1fr'}; gap:4px; margin-bottom:8px;">`;

  playerEntries.forEach(([id, p]) => {
    const isStriker = id.startsWith(shot.striker);
    const teamLabel = id.startsWith('A') ? '藍' : '紅';
    const roleLabel = isStriker ? '⚔️' : '🛡️';

    const prevSpeed = prevShot?.players?.[id]?.speed;
    const speedColor = getSpeedColor(p.speed || 3.0, prevSpeed);

    let finalColor = speedColor;
    const diagSpeedWarns = diag.speedWarns || [];
    const warn = diagSpeedWarns.find(w => w.id === id);
    if (warn && warn.type === 'extreme') {
      finalColor = '#ff1744';
    } else if (warn && warn.type === 'need_faster') {
      finalColor = '#ff8a80';
    }

    html += `
      <div class="param-row" style="margin-bottom:2px;">
        <label style="width:50px;font-size:10px;">${teamLabel}${id} ${roleLabel}</label>
        <div class="slider-container" style="flex:1;max-width:120px;">
          <button class="step-btn" onclick="window.adjustPlayerSpeed('${id}', -0.2)" style="padding:1px 6px;font-size:12px;">−</button>
          <span class="slider-val" style="color:${finalColor};min-width:32px;font-size:11px;">${(p.speed || 3.0).toFixed(1)}</span>
          <button class="step-btn" onclick="window.adjustPlayerSpeed('${id}', 0.2)" style="padding:1px 6px;font-size:12px;">+</button>
        </div>
      </div>
    `;
  });
  html += `</div>`;

  // 擊球姿態
  html += `
    <div class="param-row">
      <label>擊球姿態：</label>
      <div class="param-btns">
        <button class="${shot.forehand ? 'active' : ''}" onclick="window.setForehand(true)">正手</button>
        <button class="${!shot.forehand ? 'active' : ''}" onclick="window.setForehand(false)">反手</button>
      </div>
    </div>
  `;

  // 擊球高度
  const isFirstShot = state.currentShot === 1;
  html += `
    <div class="param-row">
      <label>擊球高度：</label>
      <div class="param-btns">
        <button class="${shot.hitLevel === 'high' ? 'active' : ''}" onclick="window.setHitLevel('high')" ${isFirstShot ? 'disabled' : ''}>高位</button>
        <button class="${shot.hitLevel === 'mid' ? 'active' : ''}" onclick="window.setHitLevel('mid')" ${isFirstShot ? 'disabled' : ''}>中位</button>
        <button class="${shot.hitLevel === 'low' ? 'active' : ''}" onclick="window.setHitLevel('low')" ${isFirstShot ? 'disabled' : ''}>低位</button>
      </div>
    </div>
    <div style="font-size:10px; color:#78909c; margin-top:-2px; margin-bottom:6px; padding-left:2px;">
      ${isFirstShot ? '🔒 第1拍固定低位發球 (1.15m)' : '高位 2.0m↑ · 中位 1.4-2.0m · 低位 1.4m↓'}
    </div>
  `;

  // 球路類型
  const showPressOptions = shot.hitLevel === 'high';
  html += `
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
    ${!showPressOptions ? '<div style="font-size:10px; color:#78909c; margin-top:-2px; margin-bottom:6px;">💡 快壓/輕壓僅限高位</div>' : ''}
  `;

  // Apex 控制
  const isPress = shot.arcType === 'fast_press' || shot.arcType === 'soft_press';
  html += `
    <div class="param-row">
      <label>頂點高度：</label>
      <div class="slider-container">
        <button class="step-btn" onclick="window.adjustApexHeight(-0.1)" ${isPress ? 'disabled' : ''}>−</button>
        <input type="range" min="1.2" max="8.0" step="0.1" value="${shot.apexHeight.toFixed(1)}" oninput="window.setApexHeight(parseFloat(this.value))" ${isPress ? 'disabled' : ''} style="flex:1;">
        <button class="step-btn" onclick="window.adjustApexHeight(0.1)" ${isPress ? 'disabled' : ''}>+</button>
        <span class="slider-val" style="min-width:44px;">${shot.apexHeight.toFixed(1)}m ${isPress ? '🔒' : ''}</span>
      </div>
    </div>
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

  content.innerHTML = html;

  // ===== 物理診斷區 =====
  if (diagContent) {
    let diagHtml = '';

    diagHtml += `<div class="physics-diag ${diag.type}" style="margin-bottom:6px;">${diag.msg}</div>`;

    if (diag.stats) {
      const s = diag.stats;
      diagHtml += `<div style="font-size:11px; background:rgba(0,0,0,0.2); border-radius:4px; padding:6px 8px; margin-bottom:6px;">`;
      diagHtml += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">`;
      diagHtml += `<div>🎯 初速：<strong style="color:#ffd54f;">${s.initialSpeed}</strong> km/h</div>`;
      diagHtml += `<div>📊 均速：<strong style="color:#ffd54f;">${s.averageSpeed}</strong> km/h</div>`;
      diagHtml += `<div>📏 距離：<strong style="color:#90caf9;">${s.flightDistance.toFixed(1)}</strong> m</div>`;
      diagHtml += `<div>⏱ 時間：<strong style="color:#90caf9;">${s.flightTime.toFixed(2)}</strong> s</div>`;
      diagHtml += `</div>`;

      if (s.netClearance < 50) {
        const netColor = s.netClearance >= 1.55 ? '#81c784' : '#ff8a65';
        diagHtml += `<div style="margin-top:4px;">🌐 過網：<strong style="color:${netColor};">${s.netClearance.toFixed(2)}</strong> m</div>`;
      }

      if (shot.interception) {
        diagHtml += `<div style="margin-top:4px; color:#ff1744;">⚡ 攔截於：<strong>${shot.interception.height.toFixed(2)}</strong> m（球員 ${shot.interception.playerId}）</div>`;
      }
      diagHtml += `</div>`;
    }

    if (diag.speedWarns && diag.speedWarns.length > 0) {
      diag.speedWarns.forEach(warn => {
        const warnColor = warn.type === 'extreme' ? '#ff1744' : '#ff8a80';
        diagHtml += `<div style="font-size:10px;color:${warnColor};padding:2px 4px;">${warn.msg}</div>`;
      });
    }

    diagContent.innerHTML = diagHtml;
  }
}