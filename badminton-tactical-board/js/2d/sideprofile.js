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
  const maxHVal = Math.max(6.5, (shot.apexHeight || 4.0) + 0.8);

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
}