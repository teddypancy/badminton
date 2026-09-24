import { getState, getCurrentShot, getShots, getCurrentIndex } from '../core/state.js';
import { ARC_TYPES } from '../config/constants.js';
import { checkPhysics, getInterceptionInfo, getShotDuration, getTotalRallyDuration } from '../core/physics.js';
import { getCurrentScriptName, getScriptTypeLabel, getScriptLibrary, getCurrentScriptId } from './scripts.js';

// ========== 更新日誌 ==========

export function updateLog() {
  const list = document.getElementById('log-list');
  const title = document.getElementById('log-title');
  if (!list) return;

  const state = getState();
  const shots = state.shots;
  const currentName = getCurrentScriptName();
  const scriptLib = getScriptLibrary();
  const currentScript = scriptLib.find(s => s.id === getCurrentScriptId());
  const typeLabel = currentScript ? getScriptTypeLabel(currentScript.type || state.mode) : '';

  if (title) {
    title.textContent = `📋 ${currentName} (${typeLabel})`;
  }

  let html = '';

  // 腳本資訊
  html += `<div style="padding:6px 10px; background:#0d203a; border-radius:4px; margin-bottom:8px; font-size:11px; color:#90caf9;">`;
  html += `📅 修改日期：${currentScript?.data?.modifiedAt?.slice(0, 10) || '未記錄'}`;
  html += ` &nbsp;|&nbsp; 🏸 總拍數：${shots.length - 1} 拍`;
  html += ` &nbsp;|&nbsp; ⏱ 總時間：${getTotalRallyDuration(shots).toFixed(1)}s`;
  html += `</div>`;

  // 修改紀錄
  html += `<div style="font-weight:bold; color:#ffd54f; font-size:11px; padding:4px 10px; border-bottom:1px solid #1e3a5f; margin-bottom:6px;">📝 修改紀錄與拍次明細</div>`;

  // 拍次明細
  shots.forEach((s, idx) => {
    if (idx === 0) {
      const serverLabel = s.server === 'A' ? '藍隊' : '紅隊';
      html += `<div class="popup-item ${idx === state.currentShot ? 'current' : ''}" onclick="window.setCurrentShot(0)">
        <strong>第 0 拍</strong>：準備站位 (發球方: ${serverLabel})
        ${s.players ? Object.keys(s.players).map(id => `👤${id}`).join(' ') : ''}
      </div>`;
    } else {
      const arcName = ARC_TYPES[s.arcType]?.name || s.arcType;
      const strikerLabel = s.striker === 'A' ? '🔵藍隊' : '🔴紅隊';
      const hitLevelLabel = s.hitLevel === 'high' ? '高位' : s.hitLevel === 'mid' ? '中位' : '低位';
      const duration = getShotDuration(s);

      // 物理診斷
      const diag = checkPhysics(s, shots, state.mode);
      const diagIcon = diag.type === 'ok' ? '✅' : '⚠️';
      const diagColor = diag.type === 'ok' ? '#81c784' : '#ff8a65';

      html += `<div class="popup-item ${idx === state.currentShot ? 'current' : ''}" onclick="window.setCurrentShot(${idx})" style="border-left:3px solid ${diag.type === 'ok' ? '#2e7d32' : '#e64a19'};">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span><strong>第 ${idx} 拍</strong> ${strikerLabel} ${arcName}</span>
          <span style="font-size:10px;color:#90caf9;">⏱ ${duration.toFixed(2)}s</span>
        </div>
        <div style="font-size:10px;color:#90caf9;margin-top:2px;">
          高度: ${hitLevelLabel} · 起點(${s.ballFrom.x.toFixed(1)}, ${s.ballFrom.z.toFixed(1)}) → 落點(${s.ballTo.x.toFixed(1)}, ${s.ballTo.z.toFixed(1)})
        </div>`;

      // 結構化數據
      if (diag.stats) {
        const st = diag.stats;
        html += `<div style="font-size:10px;color:#90caf9;margin-top:2px;display:grid;grid-template-columns:1fr 1fr;gap:2px;">
          <span>🎯 初速 ${st.initialSpeed} km/h</span>
          <span>📊 均速 ${st.averageSpeed} km/h</span>
          <span>📏 距離 ${st.flightDistance.toFixed(1)} m</span>
          <span>⏱ 時間 ${st.flightTime.toFixed(2)} s</span>
        </div>`;
      }

      // 攔截
      if (s.interception) {
        html += `<div style="font-size:10px;color:#ff1744;margin-top:2px;">⚡ 攔截於 ${s.interception.height.toFixed(2)} m</div>`;
      }

      // 診斷
      html += `<div style="font-size:10px;color:${diagColor};margin-top:2px;">
        ${diagIcon} ${diag.msg}
      </div>
    </div>`;

      // 速度警告
      if (diag.speedWarns && diag.speedWarns.length > 0) {
        diag.speedWarns.forEach(warn => {
          const warnColor = warn.type === 'extreme' ? '#ff1744' : '#ff8a80';
          html += `<div style="font-size:10px;color:${warnColor};padding:2px 10px 2px 30px;background:rgba(255,0,0,0.05);border-radius:3px;margin-bottom:2px;">
            ⚡ ${warn.msg}
            ${warn.required ? ` 💡 建議速度：${Math.ceil(warn.required * 10) / 10}m/s` : ''}
          </div>`;
        });
      }
    }
  });

  // 診斷匯總
  const diagSummary = shots.slice(1).map((s, idx) => {
    const diag = checkPhysics(s, shots, state.mode);
    return { idx: idx + 1, type: diag.type, msg: diag.msg };
  });

  const warnCount = diagSummary.filter(d => d.type === 'warn').length;
  if (warnCount > 0) {
    html += `<div style="padding:8px 10px; background:rgba(230,74,25,0.15); border-radius:4px; margin-top:8px; border:1px solid #e64a19;">
      <div style="font-weight:bold;color:#ff8a65;font-size:11px;">⚠️ 診斷匯總：${warnCount} 個物理警告</div>
      ${diagSummary.filter(d => d.type === 'warn').map(d =>
        `<div style="font-size:10px;color:#ff8a65;padding:2px 0;">第 ${d.idx} 拍：${d.msg}</div>`
      ).join('')}
    </div>`;
  } else if (shots.length > 1) {
    html += `<div style="padding:8px 10px; background:rgba(46,125,50,0.15); border-radius:4px; margin-top:8px; border:1px solid #2e7d32;">
      <div style="font-weight:bold;color:#81c784;font-size:11px;">✅ 所有拍次物理規律正常</div>
    </div>`;
  }

  list.innerHTML = html;
}