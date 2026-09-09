import { COURT } from '../config/constants.js';
import { getState, getCurrentShot, getFreeDraw } from '../core/state.js';
import { getTrajectoryPoint, getInterceptionInfo } from '../core/physics.js';
import { getPlayers } from '../models/player.js';
import { showMiniPopup, hideMiniPopup } from './popup.js';
import { renderSideProfile } from './sideprofile.js';

// ========== 2D Canvas 渲染器 ==========

const canvas = document.getElementById('court2d');
const ctx = canvas.getContext('2d');
let scale = 1, offX = 0, offY = 0;

// ========== 坐標轉換 ==========

export function m2px(x, z) {
  return { x: offX + (-z) * scale, y: offY + x * scale };
}

export function px2m(px, py) {
  return { x: (py - offY) / scale, z: -((px - offX) / scale) };
}

// ========== 畫布尺寸調整 ==========

export function resizeCanvas() {
  const wrap = document.getElementById('court-wrap');
  if (!wrap || wrap.clientWidth <= 0 || wrap.clientHeight <= 0) return;

  const innerW = wrap.clientWidth - 16;
  const innerH = wrap.clientHeight - 16;

  const totalLength = COURT.length + 2 * COURT.margin;
  const totalWidth = COURT.width_d + 2 * COURT.margin;
  const courtAspect = totalLength / totalWidth;

  let drawW, drawH;
  if (innerW / courtAspect <= innerH) {
    drawW = innerW;
    drawH = innerW / courtAspect;
  } else {
    drawH = innerH;
    drawW = innerH * courtAspect;
  }

  canvas.width = Math.floor(drawW);
  canvas.height = Math.floor(drawH);
  canvas.style.width = Math.floor(drawW) + 'px';
  canvas.style.height = Math.floor(drawH) + 'px';

  scale = drawW / totalLength;
  offX = drawW / 2;
  offY = drawH / 2 + 20;

  render2D();
  renderSideProfile(getCurrentShot());
}

// ========== 獲取弧線點 (2D) ==========

function getArcPoints2D(shot) {
  if (!shot || !shot.ballFrom || !shot.ballTo) return { points: [] };

  const points = [];
  const steps = 35;
  const fromP = m2px(shot.ballFrom.x, shot.ballFrom.z);
  const toP = m2px(shot.ballTo.x, shot.ballTo.z);

  const dx = toP.x - fromP.x;
  const dy = toP.y - fromP.y;
  const len = Math.hypot(dx, dy);

  let nx = 0, ny = -1;
  if (len > 0.001) {
    let tempNx = -dy / len;
    let tempNy = dx / len;
    if (tempNy > 0) {
      tempNx = -tempNx;
      tempNy = -tempNy;
    }
    nx = tempNx;
    ny = tempNy;
  }

  const heightScale = scale * 0.35;

  let maxH = -1;
  let maxHPoint = null;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt3d = getTrajectoryPoint(shot, t);
    const baseP = m2px(pt3d.x, pt3d.z);

    const displayH = Math.max(0, pt3d.y - (shot.ballTo.y || 0) * Math.pow(t, 2));

    const arcX = baseP.x + nx * (displayH * heightScale);
    const arcY = baseP.y + ny * (displayH * heightScale);

    const ptObj = {
      x: arcX,
      y: arcY,
      baseX: baseP.x,
      baseY: baseP.y,
      h: pt3d.y,
      t: t,
      pt3d: pt3d
    };

    points.push(ptObj);

    if (pt3d.y > maxH) {
      maxH = pt3d.y;
      maxHPoint = ptObj;
    }
  }

  return { points, maxHPoint };
}

// ========== 繪製路徑 ==========

function drawPathOn2D(path) {
  if (!path.points || path.points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = path.color;
  ctx.lineWidth = path.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const p0 = m2px(path.points[0].x, path.points[0].z);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < path.points.length; i++) {
    const pt = m2px(path.points[i].x, path.points[i].z);
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();
  ctx.restore();
}

// ========== 繪製球員（獨立函數） ==========

function drawPlayers(shot) {
  const state = getState();
  if (!shot || !shot.players) return;
  
  Object.entries(shot.players).forEach(([id, pos]) => {
    const p = m2px(pos.x, pos.z);
    const sel = state.selected?.type === 'player' && state.selected.id === id;
    const isSnapped = state.snappedPlayer === id;

    ctx.fillStyle = id.startsWith('A') ? '#2196f3' : '#ff5252';
    ctx.strokeStyle = isSnapped ? '#ff9800' : (sel ? '#ffffff' : 'transparent');
    ctx.lineWidth = isSnapped ? 4 : 3;

    ctx.beginPath();
    ctx.arc(p.x, p.y, isSnapped ? 18 : 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(id.replace('A', '').replace('B', ''), p.x, p.y);

    if (isSnapped) {
      ctx.font = 'bold 9px sans-serif';
      ctx.fillStyle = '#ffb74d';
      let snapLabel = '🧲磁吸';
      if (state.snappedType === 'intercept') snapLabel = '⚡攔截吸附';
      else if (state.snappedType === 'ballTo') snapLabel = '🎯終點吸附';
      ctx.fillText(snapLabel, p.x, p.y + 24);
    }
  });
}

// ========== 主渲染函數 ==========

export function render2D() {
  const w = canvas.width, h = canvas.height;
  if (w === 0 || h === 0) return;

  const state = getState();
  const shot = getCurrentShot();

  ctx.clearRect(0, 0, w, h);

  // --- 繪製球場 ---
  const c1 = m2px(-COURT.width_d / 2, -COURT.length / 2);
  const c2 = m2px(COURT.width_d / 2, COURT.length / 2);

  ctx.fillStyle = '#1b5e20';
  ctx.fillRect(c1.x, c1.y, c2.x - c1.x, c2.y - c1.y);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(c1.x, c1.y, c2.x - c1.x, c2.y - c1.y);

  ctx.lineWidth = 1.5;
  const sTop = m2px(-COURT.width_s / 2, -COURT.length / 2);
  const sBottom = m2px(COURT.width_s / 2, COURT.length / 2);
  ctx.beginPath();
  ctx.moveTo(c1.x, sTop.y);
  ctx.lineTo(c2.x, sTop.y);
  ctx.moveTo(c1.x, sBottom.y);
  ctx.lineTo(c2.x, sBottom.y);
  ctx.stroke();

  const netX = m2px(0, 0).x;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(netX, c1.y);
  ctx.lineTo(netX, c2.y);
  ctx.stroke();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  const sfLeft = m2px(0, -COURT.service_line).x;
  const sfRight = m2px(0, COURT.service_line).x;
  ctx.beginPath();
  ctx.moveTo(sfLeft, c1.y);
  ctx.lineTo(sfLeft, c2.y);
  ctx.moveTo(sfRight, c1.y);
  ctx.lineTo(sfRight, c2.y);
  ctx.stroke();

  const dbLeft = m2px(0, -COURT.double_back).x;
  const dbRight = m2px(0, COURT.double_back).x;
  ctx.beginPath();
  ctx.moveTo(dbLeft, c1.y);
  ctx.lineTo(dbLeft, c2.y);
  ctx.moveTo(dbRight, c1.y);
  ctx.lineTo(dbRight, c2.y);
  ctx.stroke();

  const midY = m2px(0, 0).y;
  ctx.beginPath();
  ctx.moveTo(c1.x, midY);
  ctx.lineTo(sfLeft, midY);
  ctx.moveTo(sfRight, midY);
  ctx.lineTo(c2.x, midY);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(netX, c1.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(netX, c2.y, 4, 0, Math.PI * 2);
  ctx.fill();

  // --- 自由繪圖 ---
  const freeDraw = getFreeDraw();
  freeDraw.paths.forEach(path => drawPathOn2D(path));
  if (freeDraw.currentPath) drawPathOn2D(freeDraw.currentPath);

  // ---- 手繪模式 ----
  if (state.appMode === 'free') {
    // 只繪製球員（保留球員物件）
    drawPlayers(shot);
    return;
  }

  if (!shot) return;

  // --- 等待落點設定 ---
  if (shot.pendingTo) {
    drawPlayers(shot);

    const oppSide = shot.striker === 'A' ? -1 : 1;
    const centerPos = m2px(0, oppSide * 3.35);
    ctx.save();
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(centerPos.x, centerPos.y, 32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎯 點擊此半場設定落點', centerPos.x, centerPos.y);
    ctx.restore();
    return;
  }

  // --- 腳本模式提示 ---
  if (state.appMode === 'smart' && !shot.isSetup && !shot.pendingTo) {
    const strikerSide = shot.striker === 'A' ? 1 : -1;
    const pHome = m2px(0, strikerSide * 3.35);

    ctx.save();
    ctx.fillStyle = shot.striker === 'A' ? 'rgba(33, 150, 243, 0.35)' : 'rgba(255, 82, 82, 0.35)';
    ctx.strokeStyle = shot.striker === 'A' ? '#2196f3' : '#ff5252';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pHome.x, pHome.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('回中', pHome.x, pHome.y);
    ctx.restore();

    const defenderSide = shot.striker === 'A' ? 'B' : 'A';
    const pGhostMove = m2px(shot.ballTo.x, shot.ballTo.z);
    ctx.save();
    ctx.fillStyle = defenderSide === 'A' ? 'rgba(33, 150, 243, 0.35)' : 'rgba(255, 82, 82, 0.35)';
    ctx.strokeStyle = defenderSide === 'A' ? '#2196f3' : '#ff5252';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pGhostMove.x, pGhostMove.y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('預跑', pGhostMove.x, pGhostMove.y);
    ctx.restore();
  }

  // --- 球員移動軌跡 ---
  if (state.currentShot >= 1) {
    const prevShot = state.shots[state.currentShot - 1];
    if (prevShot && prevShot.players) {
      Object.entries(shot.players).forEach(([id, pos]) => {
        const prevPos = prevShot.players[id];
        if (prevPos) {
          const pPrev = m2px(prevPos.x, prevPos.z);
          const pCurr = m2px(pos.x, pos.z);
          ctx.save();
          ctx.strokeStyle = id.startsWith('A') ? 'rgba(33, 150, 243, 0.45)' : 'rgba(255, 82, 82, 0.45)';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(pPrev.x, pPrev.y);
          ctx.lineTo(pCurr.x, pCurr.y);
          ctx.stroke();
          ctx.restore();

          const dist = Math.hypot(pCurr.x - pPrev.x, pCurr.y - pPrev.y);
          if (dist > 20) {
            const arrowAngle = Math.atan2(pCurr.y - pPrev.y, pCurr.x - pPrev.x);
            ctx.save();
            ctx.fillStyle = id.startsWith('A') ? 'rgba(33, 150, 243, 0.6)' : 'rgba(255, 82, 82, 0.6)';
            ctx.translate(pCurr.x - 16 * Math.cos(arrowAngle), pCurr.y - 16 * Math.sin(arrowAngle));
            ctx.rotate(arrowAngle);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-8, -4);
            ctx.lineTo(-8, 4);
            ctx.fill();
            ctx.restore();
          }

          ctx.fillStyle = id.startsWith('A') ? 'rgba(33, 150, 243, 0.35)' : 'rgba(255, 82, 82, 0.35)';
          ctx.beginPath();
          ctx.arc(pPrev.x, pPrev.y, 14, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
  }

  // --- 球路軌跡 ---
  if (!shot.isSetup && !shot.pendingTo) {
    const from = m2px(shot.ballFrom.x, shot.ballFrom.z);
    const to = m2px(shot.ballTo.x, shot.ballTo.z);
    const isSelectedBall = state.selected?.type === 'ball';

    // 白色直線
    ctx.save();
    ctx.strokeStyle = isSelectedBall ? '#ffffff' : 'rgba(220, 220, 220, 0.85)';
    ctx.lineWidth = isSelectedBall ? 2.5 : 1.8;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();

    // 黃色真實拋物線
    const arcData = getArcPoints2D(shot);
    if (arcData && arcData.points && arcData.points.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = isSelectedBall ? 3.0 : 2.2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(arcData.points[0].x, arcData.points[0].y);
      for (let i = 1; i < arcData.points.length; i++) {
        ctx.lineTo(arcData.points[i].x, arcData.points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 攔截點（僅顯示橙色圓點，無文字）
    const intercepts = getInterceptionInfo(shot, state.mode);
    if (intercepts && intercepts.length > 0) {
      intercepts.forEach(ic => {
        const interPx = m2px(ic.snapX, ic.snapZ);
        ctx.save();
        ctx.fillStyle = '#ff9800';
        ctx.shadowColor = '#ff9800';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(interPx.x, interPx.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(interPx.x, interPx.y, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });
    }

    // 頂點與殺球距離標記
    if (arcData.maxHPoint) {
      const pMax = arcData.maxHPoint;
      ctx.save();

      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pMax.baseX, pMax.baseY);
      ctx.lineTo(pMax.x, pMax.y);
      ctx.stroke();

      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.arc(pMax.x, pMax.y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#4fc3f7';
      ctx.beginPath();
      ctx.arc(pMax.baseX, pMax.baseY, 6, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`頂點 ${pMax.h.toFixed(1)}m`, pMax.x, pMax.y - 3);
      ctx.restore();
    }

    // 標記：擊球距離
    const distanceToNet = Math.abs(shot.ballFrom.z);
    if (distanceToNet > 0) {
      const netLineX = m2px(0, 0).x;
      const fromY = from.y;

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(from.x, fromY);
      ctx.lineTo(netLineX, fromY);
      ctx.stroke();

      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#ffd54f';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`擊球距離 ${distanceToNet.toFixed(1)}m`, (from.x + netLineX) / 2, fromY - 4);
      ctx.restore();
    }

    // 畫擊球點與落點
    ctx.fillStyle = (state.selected?.type === 'ball' && state.selected.point === 'from') ? '#ffffff' : '#ffd54f';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(from.x, from.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = (state.selected?.type === 'ball' && state.selected.point === 'to') ? '#ffffff' : '#f57c00';
    ctx.beginPath();
    ctx.arc(to.x, to.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // --- 繪製球員 ---
  drawPlayers(shot);
}