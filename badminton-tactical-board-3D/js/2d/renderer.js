import { COURT } from '../config/constants.js';
import { getState, getCurrentShot, getFreeDraw } from '../core/state.js';
import { renderSideProfile } from './sideprofile.js';

// ========== 2D Canvas 渲染器（v0.5 3C-2：僅手繪模式）==========
// 腳本模式的球員/球/軌跡/攔截點 2D 渲染已移除，戰術編輯一律在 3D 場景進行。
// 本檔只負責：球場底圖、手繪路徑、球員參考點（供手繪定位與選擇工具使用）。

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

// ========== 繪製手繪路徑 ==========

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

// ========== 繪製球員參考點 ==========

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
  });
}

// ========== 主渲染函數 ==========

export function render2D() {
  const w = canvas.width, h = canvas.height;
  if (w === 0 || h === 0) return;

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

  // --- 球員參考點（定位與選擇工具用）---
  drawPlayers(shot);
}
