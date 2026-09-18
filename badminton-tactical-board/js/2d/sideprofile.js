import { COURT } from '../config/constants.js';
import { getTrajectoryPoint } from '../core/physics.js';

// ========== Side Profile 側視軌跡 ==========

let sideCanvas = null;
let sideCtx = null;

/**
 * 初始化 Side Profile Canvas
 */
export function initSideProfile() {
  sideCanvas = document.getElementById('sideArcCanvas');
  if (sideCanvas) {
    sideCtx = sideCanvas.getContext('2d');
  }
}

/**
 * 渲染 Side Profile
 */
export function renderSideProfile(shot) {
  if (!sideCanvas || !sideCtx) {
    initSideProfile();
    if (!sideCanvas || !sideCtx) return;
  }

  const w = sideCanvas.width = sideCanvas.clientWidth || 320;
  const h = sideCanvas.height = sideCanvas.clientHeight || 110;

  sideCtx.clearRect(0, 0, w, h);

  if (!shot || shot.isSetup || shot.pendingTo) {
    sideCtx.fillStyle = '#666666';
    sideCtx.font = '12px sans-serif';
    sideCtx.textAlign = 'center';
    sideCtx.fillText('無當前球路軌跡可預覽', w / 2, h / 2);
    return;
  }

  const marginX = 25;
  const groundY = h - 18;
  // v0.2b：動態縱軸——依頂點與關鍵點（起/終/攔截）最高值縮放，讓高中低位視覺差異明顯
  const topY = Math.max(
    shot.apexHeight || 0,
    shot.ballFrom ? shot.ballFrom.y : 0,
    shot.ballTo ? shot.ballTo.y : 0,
    (shot.hitPoint && shot.hitPoint.y) || 0
  );
  const maxHVal = Math.min(8.0, Math.max(2.5, topY + 0.8));

  function z2px(z) { return marginX + ((7.0 - z) / 14.0) * (w - 2 * marginX); }
  function y2py(y) { return groundY - (y / maxHVal) * (groundY - 12); }

  // 地面
  sideCtx.strokeStyle = '#2e7d32';
  sideCtx.lineWidth = 2.5;
  sideCtx.beginPath();
  sideCtx.moveTo(z2px(6.7), groundY);
  sideCtx.lineTo(z2px(-6.7), groundY);
  sideCtx.stroke();

  // 標記線
  sideCtx.strokeStyle = '#1e3a5f';
  sideCtx.lineWidth = 1;
  [-6.7, -5.94, -1.98, 0, 1.98, 5.94, 6.7].forEach(z => {
    sideCtx.beginPath();
    sideCtx.moveTo(z2px(z), groundY);
    sideCtx.lineTo(z2px(z), groundY - 5);
    sideCtx.stroke();
  });

  // 半場標籤
  sideCtx.fillStyle = '#64b5f6';
  sideCtx.font = '9px sans-serif';
  sideCtx.textAlign = 'left';
  sideCtx.fillText('A 隊半場', marginX, h - 4);

  sideCtx.fillStyle = '#ff8a65';
  sideCtx.textAlign = 'right';
  sideCtx.fillText('B 隊半場', w - marginX, h - 4);

  // 球網
  const netX = z2px(0);
  const netTopY = y2py(COURT.net_height);
  sideCtx.strokeStyle = '#ffffff';
  sideCtx.lineWidth = 2;
  sideCtx.beginPath();
  sideCtx.moveTo(netX, groundY);
  sideCtx.lineTo(netX, netTopY);
  sideCtx.stroke();
  sideCtx.fillStyle = '#ff5252';
  sideCtx.fillRect(netX - 2, netTopY, 4, 3);

  // v0.2b：帶位虛線（高位帶下緣 2.0m／中位帶下緣 1.4m）
  [[2.0, '#b39ddb'], [1.4, '#80cbc4']].forEach(([bandY, color]) => {
    const lineY = y2py(bandY);
    if (lineY <= 12 || lineY >= groundY) return;
    sideCtx.save();
    sideCtx.strokeStyle = color;
    sideCtx.globalAlpha = 0.45;
    sideCtx.lineWidth = 1;
    sideCtx.setLineDash([4, 4]);
    sideCtx.beginPath();
    sideCtx.moveTo(z2px(6.7), lineY);
    sideCtx.lineTo(z2px(-6.7), lineY);
    sideCtx.stroke();
    sideCtx.restore();
    sideCtx.fillStyle = color;
    sideCtx.font = '8px sans-serif';
    sideCtx.textAlign = 'right';
    sideCtx.fillText(bandY.toFixed(1) + 'm', z2px(-6.7) - 2, lineY - 2);
  });

  // 軌跡
  sideCtx.strokeStyle = '#ffd54f';
  sideCtx.lineWidth = 2;
  sideCtx.beginPath();

  const steps = 40;
  let maxHPoint = { y: -1, z: 0, px: 0, py: 0 };
  let netClearanceY = null;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt3d = getTrajectoryPoint(shot, t);
    const px = z2px(pt3d.z);
    const py = y2py(pt3d.y);

    if (i === 0) sideCtx.moveTo(px, py);
    else sideCtx.lineTo(px, py);

    if (pt3d.y > maxHPoint.y) {
      maxHPoint = { y: pt3d.y, z: pt3d.z, px, py };
    }

    if (i > 0) {
      const prevPt = getTrajectoryPoint(shot, (i - 1) / steps);
      if (prevPt.z * pt3d.z <= 0) {
        netClearanceY = pt3d.y;
      }
    }
  }
  sideCtx.stroke();

  // 起點
  const startPx = z2px(shot.ballFrom.z);
  const startPy = y2py(shot.ballFrom.y);
  sideCtx.fillStyle = '#2196f3';
  sideCtx.beginPath();
  sideCtx.arc(startPx, startPy, 4, 0, Math.PI * 2);
  sideCtx.fill();

  // 終點
  const endPx = z2px(shot.ballTo.z);
  const endPy = y2py(shot.ballTo.y);
  sideCtx.fillStyle = '#f57c00';
  sideCtx.beginPath();
  sideCtx.arc(endPx, endPy, 4, 0, Math.PI * 2);
  sideCtx.fill();

  // 最高點
  if (maxHPoint.px > 0) {
    sideCtx.fillStyle = '#ffd54f';
    sideCtx.beginPath();
    sideCtx.arc(maxHPoint.px, maxHPoint.py, 3, 0, Math.PI * 2);
    sideCtx.fill();
    sideCtx.font = 'bold 9px sans-serif';
    sideCtx.textAlign = 'center';
    sideCtx.fillText(`最高 ${maxHPoint.y.toFixed(2)}m`, maxHPoint.px, maxHPoint.py - 4);
  }

  // 過網高度
  if (netClearanceY !== null) {
    const netYPx = y2py(netClearanceY);
    sideCtx.fillStyle = netClearanceY >= COURT.net_height ? '#81c784' : '#ff8a65';
    sideCtx.font = '9px sans-serif';
    sideCtx.textAlign = 'left';
    sideCtx.fillText(`過網 ${netClearanceY.toFixed(2)}m`, netX + 4, netYPx + 3);
  }

  // v0.2b：攔截點標記（hitPoint 有值時，紅點＋帶位標籤）
  if (shot.hitPoint && shot.hitPoint.t !== undefined) {
    const hpPx = z2px(shot.hitPoint.z);
    const hpPy = y2py(shot.hitPoint.y);
    sideCtx.fillStyle = '#ff5252';
    sideCtx.beginPath();
    sideCtx.arc(hpPx, hpPy, 4, 0, Math.PI * 2);
    sideCtx.fill();
    sideCtx.strokeStyle = '#ffffff';
    sideCtx.lineWidth = 1;
    sideCtx.stroke();
    const levelLabel = shot.hitPoint.level === 'high' ? '高位'
      : (shot.hitPoint.level === 'mid' ? '中位' : '低位');
    sideCtx.fillStyle = '#ff8a80';
    sideCtx.font = 'bold 9px sans-serif';
    sideCtx.textAlign = 'center';
    sideCtx.fillText(`攔截 ${shot.hitPoint.y.toFixed(2)}m（${levelLabel}）`, hpPx, Math.max(10, hpPy - 7));
  }
}