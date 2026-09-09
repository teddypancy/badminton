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
    const modeText = state.mode === 'singles' ? '單打' :
                     state.mode === 'doubles' ? '雙打' : state.mode;
    const appText = state.appMode === 'smart' ? '智能模式' : '自由模式';
    hud.textContent = `${modeText}回合 · ${appText} · 共 ${state.shots.length - 1} 拍`;
  }
}

// ========== 更新日誌 ==========

export function updateLog() {
  const list = document.getElementById('log-list');
  if (!list) return;

  const state = getState();
  const shots = state.shots;

  let html = '';
  shots.forEach((s, idx) => {
    if (idx === 0) {
      html += `<div class="popup-item ${idx === state.currentShot ? 'current' : ''}" onclick="window.setCurrentShot(0)">第 0 拍：準備站位 (發球方: ${s.server === 'A' ? '藍隊' : '紅隊'})</div>`;
    } else {
      const arcName = ARC_TYPES[s.arcType]?.name || s.arcType;
      html += `<div class="popup-item ${idx === state.currentShot ? 'current' : ''}" onclick="window.setCurrentShot(${idx})">第 ${idx} 拍：${s.striker === 'A' ? '藍隊' : '紅隊'} ${arcName} (落點 X:${s.ballTo.x.toFixed(1)}, Z:${s.ballTo.z.toFixed(1)})</div>`;
    }
  });
  list.innerHTML = html;
}

// ========== 更新參數面板 ==========

export function updateParamPanel() {
  const content = document.getElementById('param-content');
  const state = getState();
  const shot = getCurrentShot();

  if (!content || !shot) return;

  // 第 0 拍
  if (shot.isSetup) {
    let html = `<h4>戰術配置 (第 0 拍 - 發接發站位)</h4>`;
    html += `
      <div class="param-row" style="margin-top:6px;">
        <label style="width:85px;">發球方：</label>
        <div class="param-btns">
          <button class="${shot.server === 'A' ? 'active' : ''}" onclick="window.setServer('A')">藍隊 (下/左)</button>
          <button class="${shot.server === 'B' ? 'active' : ''}" onclick="window.setServer('B')">紅隊 (上/右)</button>
        </div>
      </div>
    `;

    html += `<div style="font-weight:bold; color:#ffd54f; font-size:11px; margin: 10px 0 4px 0;">球員初始移動速度 (m/s)</div>`;
    Object.entries(shot.players).forEach(([id, p]) => {
      const teamLabel = id.startsWith('A') ? '藍' : '紅';
      html += `
        <div class="param-row">
          <label style="width:90px;">${teamLabel}隊 ${id}：</label>
          <div class="slider-container">
            <button class="step-btn" onclick="window.adjustPlayerSpeed('${id}', -0.2)">-</button>
            <input type="range" min="1.0" max="8.0" step="0.1" value="${(p.speed || 3.0).toFixed(1)}" oninput="window.setPlayerSpeed('${id}', parseFloat(this.value))">
            <button class="step-btn" onclick="window.adjustPlayerSpeed('${id}', 0.2)">+</button>
            <span class="slider-val">${(p.speed || 3.0).toFixed(1)} m/s</span>
          </div>
        </div>
      `;
    });

    html += `
      <div style="font-size:11px; color:#90caf9; margin-top:10px; line-height:1.4; background:#0d203a; padding:8px; border-radius:4px; border:1px solid #1e3a5f;">
        💡 <strong>第 0 拍說明：</strong><br>
        此拍為發接發準備站位，可直接在 2D 戰術板上拖拽球員圓圈調整發球與接發球位置。
      </div>
    `;
    content.innerHTML = html;
    return;
  }

  // 診斷
  const shots = getShots();
  const diag = checkPhysics(shot, shots, state.mode);
  let html = `<h4>戰術參數與物理診斷 (第 ${state.currentShot} 拍)</h4>`;
  html += `<div class="physics-diag ${diag.type}">${diag.msg}</div>`;

  // 攔截點
  const intercepts = getInterceptionInfo(shot, state.mode);
  if (intercepts.length > 0) {
    intercepts.forEach(ic => {
      html += `<div class="physics-diag intercept">⚡ 攔截點提醒：球員 <strong>${ic.playerId}</strong> 可在飛行 ${ic.flightTime.toFixed(2)}s 時於高度 ${ic.height.toFixed(2)}m 處進行攔截扣殺！</div>`;
    });
  }

  // 球員速度 (網格排列)
  html += `<div style="font-weight:bold; color:#ffd54f; font-size:11px; margin: 8px 0 4px 0;">球員移動速度 (m/s)</div>`;

  const playerEntries = Object.entries(shot.players);
  // 2人以上用2列網格
  const cols = playerEntries.length >= 3 ? 2 : 1;

  html += `<div style="display:grid; grid-template-columns: ${cols === 2 ? '1fr 1fr' : '1fr'}; gap:4px;">`;
  playerEntries.forEach(([id, p]) => {
    const isStriker = id.startsWith(shot.striker);
    const teamLabel = id.startsWith('A') ? '藍' : '紅';
    const roleLabel = isStriker ? '(擊球)' : '(防守)';

    // 檢查是否需要加速
    let speedColor = '#ffd54f';
    const diagSpeedWarns = diag.speedWarns || [];
    const warn = diagSpeedWarns.find(w => w.id === id);
    if (warn && warn.type === 'need_faster') {
      speedColor = '#ff8a80'; // 淺紅色
    } else if (warn && warn.type === 'extreme') {
      speedColor = '#ff1744'; // 亮紅色
    }

    html += `
      <div class="param-row" style="margin-bottom:2px;">
        <label style="width:70px; font-size:10px;">${teamLabel}${id} ${roleLabel}</label>
        <div class="slider-container">
          <button class="step-btn" onclick="window.adjustPlayerSpeed('${id}', -0.2)" style="padding:1px 4px;font-size:10px;">-</button>
          <input type="range" min="1.0" max="8.0" step="0.1" value="${(p.speed || 3.0).toFixed(1)}" oninput="window.setPlayerSpeed('${id}', parseFloat(this.value))" style="flex:1;">
          <button class="step-btn" onclick="window.adjustPlayerSpeed('${id}', 0.2)" style="padding:1px 4px;font-size:10px;">+</button>
          <span class="slider-val" style="color:${speedColor};min-width:32px;font-size:10px;">${(p.speed || 3.0).toFixed(1)}</span>
        </div>
      </div>
    `;
  });
  html += `</div>`;

  // 擊球姿態
  html += `
    <div class="param-row" style="margin-top:6px;">
      <label>擊球姿態：</label>
      <div class="param-btns">
        <button class="${shot.forehand ? 'active' : ''}" onclick="window.setForehand(true)">正手</button>
        <button class="${!shot.forehand ? 'active' : ''}" onclick="window.setForehand(false)">反手</button>
      </div>
    </div>
  `;

  // 擊球高度 (第1拍固定低位)
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
    <div style="font-size:10px; color:#90caf9; margin-top:2px; margin-bottom:6px; padding-left:2px;">
      ${isFirstShot ? '🔒 第1拍固定為低位發球 (1.15m)' : '（高位2.0m以上）（中位1.4-2.0m）（低位1.4m以下）'}
    </div>
  `;

  // 球路類型 (快壓/輕壓僅高位顯示)
  const showPressOptions = shot.hitLevel === 'high';
  html += `
    <div class="param-row">
      <label>球路類型：</label>
      <div class="param-btns">
        <button class="${shot.arcType === 'high_arc' ? 'active' : ''}" onclick="window.setArcType('high_arc')">高球</button>
        <button class="${shot.arcType === 'mid_high_arc' ? 'active' : ''}" onclick="window.setArcType('mid_high_arc')">平高球</button>
        <button class="${shot.arcType === 'low_flat_arc' ? 'active' : ''}" onclick="window.setArcType('low_flat_arc')">平球</button>
        ${showPressOptions ? `
          <button class="${shot.arcType === 'fast_press' ? 'active' : ''}" onclick="window.setArcType('fast_press')">快壓</button>
          <button class="${shot.arcType === 'soft_press' ? 'active' : ''}" onclick="window.setArcType('soft_press')">輕壓</button>
        ` : ''}
      </div>
    </div>
    ${!showPressOptions ? '<div style="font-size:10px; color:#90caf9; margin-top:2px; margin-bottom:6px; padding-left:2px;">💡 快壓/輕壓僅限高位擊球時使用</div>' : ''}
  `;

  // Apex 控制 (快壓/輕壓禁用)
  const isPress = shot.arcType === 'fast_press' || shot.arcType === 'soft_press';
  html += `
    <div class="param-row">
      <label>頂點高度：</label>
      <div class="slider-container">
        <button class="step-btn" onclick="window.adjustApexHeight(-0.2)" ${isPress ? 'disabled' : ''}>-</button>
        <input type="range" min="1.2" max="8.0" step="0.1" value="${shot.apexHeight.toFixed(1)}" oninput="window.setApexHeight(parseFloat(this.value))" ${isPress ? 'disabled' : ''}>
        <button class="step-btn" onclick="window.adjustApexHeight(0.2)" ${isPress ? 'disabled' : ''}>+</button>
        <span class="slider-val">${shot.apexHeight.toFixed(1)} m ${isPress ? '🔒' : ''}</span>
      </div>
    </div>
    <div class="param-row">
      <label>頂點位置：</label>
      <div class="slider-container">
        <button class="step-btn" onclick="window.adjustApexPos(-0.05)" ${isPress ? 'disabled' : ''}>-</button>
        <input type="range" min="0.05" max="0.95" step="0.05" value="${shot.apexPos.toFixed(2)}" oninput="window.setApexPos(parseFloat(this.value))" ${isPress ? 'disabled' : ''}>
        <button class="step-btn" onclick="window.adjustApexPos(0.05)" ${isPress ? 'disabled' : ''}>+</button>
        <span class="slider-val">${Math.round(shot.apexPos * 100)}% ${isPress ? '🔒' : ''}</span>
      </div>
    </div>
    ${isPress ? '<div style="font-size:10px; color:#ffd54f; margin-top:2px; margin-bottom:4px;">🔒 快壓/輕壓固定 Apex 參數</div>' : ''}
  `;

  content.innerHTML = html;
}