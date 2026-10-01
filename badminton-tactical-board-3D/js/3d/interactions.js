// js/3d/interactions.js
// v0.5 3C-1：3D 場景互動（Raycaster、拖曳、點選、吸附、系統提示）

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.module.js';
import { getCamera, getRenderer, getControls } from './scene.js';
import { getState, getCurrentShot, getShots, getCurrentIndex } from '../core/state.js';
import { generateInterceptPoints } from '../core/physics.js';
import { getPlayers } from '../models/player.js';
import {
  sync3DPositions,
  getPlayerMeshes,
  getShuttleMesh,
  refresh3DShotView
} from './entities.js';
import { render2D } from '../2d/renderer.js';
import { renderSideProfile } from '../2d/sideprofile.js';
import { updateParamPanel, updateSystemPrompt } from '../ui/panels.js';
import { updateLog } from '../ui/logs.js';
import { autoMatchShotProperties, recalculateRecoverSpeed } from '../models/shot.js';
import { COURT, LIMITS, SPEED_BASELINE } from '../config/constants.js';

let raycaster = null;
let pointer = null;
let isDragging = false;
let dragTarget = null;            // { kind:'real'|'preview', id }
let pendingGroundClick = false;   // 區分「點擊地面」與「拖曳旋轉視角」
let downClientX = 0;
let downClientY = 0;
let ballPickMode = false;         // 選中球後，下一擊地面改變終點
let controlsWereEnabled = true;
let serveHighlightId = null;      // 第 1 拍高亮的發球球員

const SNAP_RADIUS = 0.2;
const CLICK_THRESHOLD_PX = 6;

// ========== 初始化 ==========

export function init3DInteractions() {
  const renderer = getRenderer();
  if (!renderer) return;
  const canvas = renderer.domElement;

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  canvas.addEventListener('mousedown', handlePointerDown);
  window.addEventListener('mousemove', handlePointerMove);
  window.addEventListener('mouseup', handlePointerUp);
  canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
  window.addEventListener('touchmove', handlePointerMove, { passive: false });
  window.addEventListener('touchend', handlePointerUp);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
}

// ========== 坐標與拾取 ==========

function updatePointer(e) {
  const renderer = getRenderer();
  const rect = renderer.domElement.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  return { clientX, clientY };
}

function pickGround() {
  raycaster.setFromCamera(pointer, getCamera());
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(groundPlane, point) ? point : null;
}

function pickPlayer() {
  raycaster.setFromCamera(pointer, getCamera());
  const targets = [
    ...Object.values(getPlayerMeshes()),
    ...Object.values(window.__previewMeshes || {})
  ];
  const intersects = raycaster.intersectObjects(targets, true);
  if (intersects.length === 0) return null;

  let obj = intersects[0].object;
  while (obj && !obj.userData.playerId) obj = obj.parent;
  if (obj && obj.userData.playerId) {
    return { id: obj.userData.playerId, kind: obj.userData.kind || 'real' };
  }
  return null;
}

function pickShuttle() {
  const shuttle = getShuttleMesh();
  if (!shuttle) return false;
  raycaster.setFromCamera(pointer, getCamera());
  return raycaster.intersectObject(shuttle, true).length > 0;
}

function findNearestInterceptPoint(worldX, worldZ, interceptPoints) {
  if (!interceptPoints || interceptPoints.length === 0) return null;
  let nearest = null;
  let minDist = SNAP_RADIUS;
  interceptPoints.forEach((ip, idx) => {
    if (!ip.reachable) return;
    const d = Math.hypot(worldX - ip.pt.x, worldZ - ip.pt.z);
    if (d < minDist) {
      minDist = d;
      nearest = { idx, ip, dist: d };
    }
  });
  return nearest;
}

// ========== 場地約束 ==========

function clampToCourt(x, z) {
  return {
    x: Math.max(-COURT.width_d / 2, Math.min(COURT.width_d / 2, x)),
    z: Math.max(-COURT.length / 2, Math.min(COURT.length / 2, z))
  };
}

function clampToOwnHalf(team, x, z) {
  const c = clampToCourt(x, z);
  c.z = team === 'A' ? Math.max(0, c.z) : Math.min(0, c.z);
  return c;
}

// 球終點必須在擊球方（mover）的對方半場
function isEndpointOnOpponentHalf(shot, z) {
  return shot.mover === 'A' ? z <= -0.05 : z >= 0.05;
}

// ========== 3D 選擇彈窗（球與球員重疊時） ==========
// 3D 場景使用 fixed 定位彈窗 #popup-3d-select（不依附 2D 抽屜）。

function hide3DPopup() {
  const old = document.getElementById('popup-3d-select');
  if (old) old.remove();
}

function show3DPopup(clientX, clientY, options) {
  hide3DPopup();
  const div = document.createElement('div');
  div.id = 'popup-3d-select';
  div.style.cssText = [
    'position:fixed', 'z-index:10000',
    'background:#1e3a5f', 'border:1px solid #2a4a73', 'border-radius:6px',
    'padding:6px', 'min-width:120px',
    'box-shadow:0 4px 14px rgba(0,0,0,0.5)',
    `left:${Math.min(clientX + 12, window.innerWidth - 150)}px`,
    `top:${Math.min(clientY, window.innerHeight - 110)}px`
  ].join(';');

  const title = document.createElement('div');
  title.textContent = '選擇物件';
  title.style.cssText = 'font-size:11px;color:#90caf9;padding:2px 4px 6px;';
  div.appendChild(title);

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.textContent = opt.label;
    btn.style.cssText =
      'display:block;text-align:left;padding:6px 10px;font-size:12px;background:#24405f;color:#e6e6e6;' +
      'border:1px solid #2a4a73;border-radius:4px;cursor:pointer;width:100%;margin-top:3px;';
    btn.onmouseover = () => { btn.style.background = '#f57c00'; };
    btn.onmouseout = () => { btn.style.background = '#24405f'; };
    btn.onclick = (ev) => {
      ev.stopPropagation();
      hide3DPopup();
      opt.action();
    };
    div.appendChild(btn);
  });

  document.body.appendChild(div);
  setTimeout(() => {
    document.addEventListener('mousedown', function outside(e) {
      if (!div.contains(e.target)) {
        hide3DPopup();
        document.removeEventListener('mousedown', outside);
      }
    });
  }, 0);
}

// ========== 發球球員高亮 ==========

function setServeHighlight(mesh, on) {
  if (!mesh) return;
  mesh.traverse(obj => {
    if (obj.isMesh && obj.material && obj.material.emissive) {
      obj.material.emissive.setHex(on ? 0x1565c0 : 0x000000);
      obj.material.emissiveIntensity = on ? 0.6 : 0;
    }
  });
}

function clearServeHighlight() {
  if (!serveHighlightId) return;
  setServeHighlight(getPlayerMeshes()[serveHighlightId], false);
  serveHighlightId = null;
}

// ========== Pointer Down ==========

function handlePointerDown(e) {
  if (e.type === 'mousedown' && e.button !== 0) return;
  const state = getState();
  if (state.appMode === 'free' || state.playing) return;
  const shot = getCurrentShot();
  if (!shot) return;

  e.preventDefault();
  hide3DPopup();
  const { clientX, clientY } = updatePointer(e);
  downClientX = clientX;
  downClientY = clientY;

  const playerHit = pickPlayer();
  const shuttleHit = pickShuttle();

  if (playerHit && shuttleHit) {
    show3DPopup(clientX, clientY, [
      { label: '球員', action: () => beginPlayerAction(playerHit) },
      { label: '球', action: () => beginBallPick(shot) }
    ]);
    return;
  }

  if (playerHit) {
    beginPlayerAction(playerHit);
    return;
  }

  if (shuttleHit) {
    beginBallPick(shot);
    return;
  }

  // 地面：延到 pointerup 並判斷是否為單純點擊（避免與旋轉視角衝突）
  pendingGroundClick = true;
}

function beginPlayerAction(playerHit) {
  const shot = getCurrentShot();
  const idx = getCurrentIndex();

  if (idx === 0) {
    // 設定拍：所有實體球員可拖曳調整站位
    if (playerHit.kind !== 'real') return;
    startDrag(playerHit.id, 'real');
    return;
  }

  if (idx === 1) {
    // 點選發球方（mover）球員 → 作為發球起點
    if (playerHit.id.startsWith(shot.mover)) {
      if (shot.pendingTo) {
        const p = shot.players[playerHit.id];
        if (p) {
          shot.ballFrom = { x: p.x, y: LIMITS.serveHeight, z: p.z };
          clearServeHighlight();
          serveHighlightId = playerHit.id;
          setServeHighlight(getPlayerMeshes()[playerHit.id], true);
          render2D();
          sync3DPositions();
          updateSystemPrompt('發球起點已選定，請點選對方半場設定落點', 'info');
        }
      } else {
        updateSystemPrompt('第 1 拍已完成，可拖曳接球方球員調整站位', 'info');
      }
      return;
    }
    // 接球方（recoverer）球員可拖曳設定站位
    if (playerHit.kind === 'real' && playerHit.id.startsWith(shot.recoverer)) {
      startDrag(playerHit.id, 'real');
      return;
    }
    updateSystemPrompt('第 1 拍僅可拖曳接球方球員設定站位', 'warn');
    return;
  }

  // 第 2 拍起：僅半透明球員可拖曳
  if (playerHit.kind === 'preview') {
    startDrag(playerHit.id, 'preview');
  } else {
    updateSystemPrompt('實體球員不可拖曳，請拖曳半透明球員', 'warn');
  }
}

function beginBallPick(shot) {
  const idx = getCurrentIndex();
  if (idx === 0) return;
  if (shot.pendingTo) {
    updateSystemPrompt('請先完成擊球點設定', 'warn');
    return;
  }
  ballPickMode = true;
  updateSystemPrompt('已選中球，請點選地面改變終點位置', 'info');
}

function startDrag(id, kind) {
  const controls = getControls();
  controlsWereEnabled = controls ? controls.enabled : true;
  if (controls) controls.enabled = false;
  isDragging = true;
  dragTarget = { id, kind };
}

// ========== Pointer Move ==========

function handlePointerMove(e) {
  const { clientX, clientY } = e.touches
    ? { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }
    : { clientX: e.clientX, clientY: e.clientY };

  if (isDragging && dragTarget) {
    e.preventDefault();
    updatePointer(e);
    const ground = pickGround();
    if (!ground) return;

    const shot = getCurrentShot();
    const idx = getCurrentIndex();

    if (dragTarget.kind === 'real') {
      handleRealPlayerDrag(ground, shot, idx);
    } else {
      handlePreviewDrag(ground, shot, idx);
    }
    pendingGroundClick = false;
    return;
  }

  // 移動超過點擊門檻 → 視為旋轉視角，取消地面點擊
  if (pendingGroundClick) {
    if (Math.hypot(clientX - downClientX, clientY - downClientY) > CLICK_THRESHOLD_PX) {
      pendingGroundClick = false;
    }
  }
}

function handleRealPlayerDrag(ground, shot, idx) {
  const id = dragTarget.id;
  if (!shot.players[id]) return;

  let pos;
  if (idx === 0) {
    pos = clampToCourt(ground.x, ground.z);
  } else if (idx === 1) {
    // 接球方僅可在己方半場
    pos = clampToOwnHalf(shot.recoverer, ground.x, ground.z);
  } else {
    pos = clampToCourt(ground.x, ground.z);
  }

  shot.players[id].x = pos.x;
  shot.players[id].z = pos.z;

  // 設定拍拖動發球方 → 同步第 1 拍擊球點（與 2D 行為一致）
  if (idx === 0) {
    const shots = getShots();
    const serverTeam = shots[0]?.server || 'A';
    if (id.startsWith(serverTeam) && shots[1]) {
      shots[1].ballFrom.x = pos.x;
      shots[1].ballFrom.z = pos.z;
    }
  }

  // 第 1 拍拖動接球方：即時更新位置
  getPlayerMeshes()[id].position.set(pos.x, 0, pos.z);
  render2D();
  renderSideProfile(shot);
  updateParamPanel();
}

function handlePreviewDrag(ground, shot, idx) {
  if (idx < 2) return;
  const id = dragTarget.id;
  const team = id.startsWith('A') ? 'A' : 'B';
  const previewMesh = (window.__previewMeshes || {})[id];
  if (!previewMesh) return;

  if (!shot.previewPositions) shot.previewPositions = {};

  if (team === shot.mover) {
    // ① 移動方：吸附上一拍攔截點
    const shots = getShots();
    const prevShot = shots[idx - 1];
    const nearest = prevShot ? findNearestInterceptPoint(ground.x, ground.z, prevShot.interceptPoints) : null;

    if (nearest) {
      const ip = nearest.ip;
      previewMesh.position.set(ip.pt.x, 0, ip.pt.z);
      shot.ballFrom = { x: ip.pt.x, y: ip.pt.y, z: ip.pt.z };
      shot.selectedInterceptIndex = nearest.idx;
      shot.hitPoint = {
        x: ip.pt.x, y: ip.pt.y, z: ip.pt.z,
        t: ip.t, height: ip.height, level: ip.level,
        moveSpeed: ip.moveSpeed, reachable: ip.reachable
      };
      shot.interception = { pt: { x: ip.pt.x, y: ip.pt.y, z: ip.pt.z }, t: ip.t, height: ip.height };
      shot.hitLevel = ip.level;
      shot.moveSpeed = ip.moveSpeed;
      if (shot.players[id]) shot.players[id].speed = ip.moveSpeed;
      shot.previewPositions[id] = { x: ip.pt.x, z: ip.pt.z };
      shot.pendingTo = false;
      ballPickMode = false;
      updateSystemPrompt(`已吸附攔截點（高度 ${ip.height.toFixed(2)}m），請點選對方半場設定球終點`, 'ok');
    } else {
      const pos = clampToOwnHalf(team, ground.x, ground.z);
      previewMesh.position.set(pos.x, 0, pos.z);
      shot.ballFrom = null;
      shot.selectedInterceptIndex = null;
      shot.hitPoint = null;
      shot.interception = null;
      shot.pendingTo = true;
      updateSystemPrompt('未吸附攔截點，放開後本回合結束（不生成下一拍）', 'warn');
    }
  } else if (team === shot.recoverer) {
    // ③ 回動方：自由拖曳至回中位置（限己方半場）
    const pos = clampToOwnHalf(team, ground.x, ground.z);
    previewMesh.position.set(pos.x, 0, pos.z);
    shot.previewPositions[id] = { x: pos.x, z: pos.z };
    recalculateRecoverSpeed(shot, getState().mode, getState().appMode);
    updateSystemPrompt(`回動方（${team}隊）回中位置已更新`, 'info');
  }

  render2D();
  sync3DPositions();
  renderSideProfile(shot);
  updateParamPanel();
}

// ========== Pointer Up ==========

function handlePointerUp(e) {
  // 地面單純點擊 → 設定球終點
  if (pendingGroundClick && !isDragging) {
    pendingGroundClick = false;
    updatePointer(e);
    const ground = pickGround();
    const shot = getCurrentShot();
    if (ground && shot) handleGroundClick(ground, shot);
  }

  if (isDragging) {
    const shot = getCurrentShot();
    const idx = getCurrentIndex();

    if (dragTarget.kind === 'preview' && idx >= 2) {
      const team = dragTarget.id.startsWith('A') ? 'A' : 'B';
      if (team === shot.mover) {
        if (shot.ballFrom) {
          updateSystemPrompt('擊球點已設定，請點選對方半場設定球終點', 'ok');
        } else {
          updateSystemPrompt('未吸附攔截點，球落地，本回合結束', 'warn');
        }
      } else if (team === shot.recoverer) {
        shot.recoverConfirmed = true;
        updateSystemPrompt('本拍完成，可新增下一拍', 'ok');
        updateLog();
      }
    }

    const controls = getControls();
    if (controls) controls.enabled = controlsWereEnabled;
  }

  isDragging = false;
  dragTarget = null;
}

// ========== 地面點擊：設定球終點 ==========

function handleGroundClick(groundPoint, shot) {
  const idx = getCurrentIndex();
  const state = getState();

  if (idx === 0) return;

  // 球複選模式：重新設定終點
  if (ballPickMode) {
    ballPickMode = false;
    finalizeBallEnd(groundPoint, shot);
    return;
  }

  if (idx === 1) {
    if (!shot.pendingTo) {
      updateSystemPrompt('第 1 拍已完成', 'info');
      return;
    }
    if (!shot.ballFrom) {
      updateSystemPrompt('請先點選發球球員作為起點', 'warn');
      return;
    }
    finalizeBallEnd(groundPoint, shot);
    return;
  }

  // 第 2 拍起：需先吸附攔截點
  if (!shot.ballFrom) {
    updateSystemPrompt('請先拖曳移動方半透明球員吸附攔截點', 'warn');
    return;
  }
  finalizeBallEnd(groundPoint, shot);
}

function finalizeBallEnd(groundPoint, shot) {
  const state = getState();
  const idx = getCurrentIndex();
  const pos = clampToCourt(groundPoint.x, groundPoint.z);

  if (!isEndpointOnOpponentHalf(shot, pos.z)) {
    updateSystemPrompt('球終點必須在擊球方的對方半場', 'warn');
    return;
  }

  shot.ballTo = { x: pos.x, y: 0.1, z: pos.z };
  shot.pendingTo = false;
  autoMatchShotProperties(shot, getShots(), state.mode, state.appMode);

  // 生成本拍攔截點（供下一拍 mover 使用）。
  // 3C-1 角色交替：下一拍 mover = 本拍 recoverer，無需下一拍已存在。
  const nextMover = shot.recoverer;
  const players = getPlayers(state.mode);
  const moverId = (players[nextMover] || [])[0];
  const moverStartPos = moverId
    ? (shot.previewPositions?.[moverId] || shot.players?.[moverId])
    : null;
  const prevMoveSpeed = idx === 1
    ? SPEED_BASELINE.FIRST_SHOT
    : (getShots()[idx - 1]?.moveSpeed || SPEED_BASELINE.FIRST_SHOT);

  if (nextMover && moverStartPos) {
    shot.interceptPoints = generateInterceptPoints(shot, moverStartPos, nextMover, prevMoveSpeed);
  }

  clearServeHighlight();
  render2D();
  sync3DPositions();
  renderSideProfile(shot);
  updateParamPanel();
  updateLog();
  refresh3DShotView(shot);
  updateSystemPrompt(`球終點已設定，請拖曳回動方（${shot.recoverer}隊）球員到回中位置`, 'ok');
}

// ========== 拍次切換提示（main.js 鉤子呼叫） ==========

export function onShotChanged3D() {
  const shot = getCurrentShot();
  if (!shot) return;
  const idx = getCurrentIndex();
  ballPickMode = false;

  if (idx === 0) {
    updateSystemPrompt('拖曳球員可調整發接發站位', 'info');
  } else if (idx === 1) {
    if (shot.pendingTo) {
      updateSystemPrompt('第 1 拍：先點選發球球員作為起點，再點選對方半場設定落點', 'info');
    } else {
      updateSystemPrompt('第 1 拍完成，可新增第 2 拍', 'ok');
    }
  } else {
    if (!shot.ballFrom) {
      updateSystemPrompt(`請拖曳半透明球員（移動方 ${shot.mover}隊）吸附光圈`, 'info');
    } else if (shot.pendingTo || !shot.ballTo) {
      updateSystemPrompt('已吸附攔截點，請點選對方半場設定球終點', 'info');
    } else if (!shot.recoverConfirmed) {
      updateSystemPrompt(`請拖曳回動方（${shot.recoverer}隊）球員到回中位置`, 'info');
    } else {
      updateSystemPrompt('本拍完成，可新增下一拍', 'ok');
    }
  }
}

export function get3DInteractionsState() {
  return { isDragging, dragTarget, ballPickMode };
}
