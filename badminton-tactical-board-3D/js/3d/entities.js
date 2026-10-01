// js/3d/entities.js

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.module.js';
import { COURT } from '../config/constants.js';
import { getState, getCurrentShot, getShots } from '../core/state.js';
import { getPlayers } from '../models/player.js';
import { getTrajectoryPoint } from '../core/physics.js';
import { getTrajectoryData } from '../core/trajectory.js';
import { getScene } from './scene.js';

let playerMeshes = {};
let shuttleMesh = null;
let trajectoryMesh = null;
let trailMesh = null;
export let ballTrail = [];

// ========== 建立球場 ==========

export function buildCourt() {
  const scene = getScene();

  // ---- 地板：roughness 1.0、metalness 0 = 無反光 ----
  const courtGeo = new THREE.PlaneGeometry(COURT.width_d, COURT.length);
  const courtMat = new THREE.MeshStandardMaterial({ 
    color: 0x1b5e20, 
    roughness: 1.0, 
    metalness: 0.0
  });
  const courtFloor = new THREE.Mesh(courtGeo, courtMat);
  courtFloor.rotation.x = -Math.PI / 2;
  // 不再 receiveShadow
  scene.add(courtFloor);

  // ---- 外圍 ----
  const outGeo = new THREE.PlaneGeometry(COURT.width_d + 3, COURT.length + 3);
  const outMat = new THREE.MeshStandardMaterial({ 
    color: 0x0f2847, 
    roughness: 1.0, 
    metalness: 0.0
  });
  const outFloor = new THREE.Mesh(outGeo, outMat);
  outFloor.rotation.x = -Math.PI / 2;
  outFloor.position.y = -0.01;
  scene.add(outFloor);

  // ---- 標線 ----
  const points = [];
  const addLine = (x1, z1, x2, z2) => {
    points.push(new THREE.Vector3(x1, 0.02, z1), new THREE.Vector3(x2, 0.02, z2));
  };

  const hw = COURT.width_d / 2;
  const hws = COURT.width_s / 2;
  const hl = COURT.length / 2;

  // 1. 雙打邊線（最外側）
  addLine(-hw, -hl, -hw, hl);
  addLine(hw, -hl, hw, hl);
  addLine(-hw, -hl, hw, -hl);
  addLine(-hw, hl, hw, hl);

  // 2. 單打邊線（內側）
  addLine(-hws, -hl, -hws, hl);
  addLine(hws, -hl, hws, hl);

  // 3. 雙打後發球線
  addLine(-hw, -COURT.double_back, hw, -COURT.double_back);
  addLine(-hw, COURT.double_back, hw, COURT.double_back);

  // 4. 單打發球線（延伸至雙打邊線）
  addLine(-hw, -COURT.service_line, hw, -COURT.service_line);
  addLine(-hw, COURT.service_line, hw, COURT.service_line);

  // 5. 中線（只畫到發球線）
  addLine(0, -hl, 0, -COURT.service_line);
  addLine(0, hl, 0, COURT.service_line);

  const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  scene.add(lines);

  // ========================================
  // 球網
  // ========================================
  const postGeo = new THREE.CylinderGeometry(0.04, 0.04, COURT.net_height, 16);
  const postMat = new THREE.MeshStandardMaterial({ 
    color: 0xcccccc, 
    roughness: 1.0, 
    metalness: 0.0
  });

  const postL = new THREE.Mesh(postGeo, postMat);
  postL.position.set(-hw, COURT.net_height / 2, 0);
  scene.add(postL);

  const postR = new THREE.Mesh(postGeo, postMat);
  postR.position.set(hw, COURT.net_height / 2, 0);
  scene.add(postR);

  const netGeo = new THREE.PlaneGeometry(COURT.width_d, 0.8);
  const netMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    roughness: 1.0,
    metalness: 0.0
  });
  const netMesh = new THREE.Mesh(netGeo, netMat);
  netMesh.position.set(0, COURT.net_height - 0.4, 0);
  scene.add(netMesh);

  const tapeGeo = new THREE.PlaneGeometry(COURT.width_d, 0.06);
  const tapeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const tapeMesh = new THREE.Mesh(tapeGeo, tapeMat);
  tapeMesh.position.set(0, COURT.net_height - 0.03, 0);
  scene.add(tapeMesh);

  // 單打邊線與球網交點標記
  const dotGeo = new THREE.SphereGeometry(0.03, 8, 8);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const dotL = new THREE.Mesh(dotGeo, dotMat);
  dotL.position.set(-hws, 0.02, 0);
  scene.add(dotL);
  const dotR = new THREE.Mesh(dotGeo, dotMat);
  dotR.position.set(hws, 0.02, 0);
  scene.add(dotR);
}

// ========== 建立羽球 ==========

export function createShuttle() {
  const scene = getScene();
  const group = new THREE.Group();

  const coneGeo = new THREE.ConeGeometry(0.08, 0.12, 12, 1, true);
  const coneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    roughness: 1.0,
    metalness: 0.0
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.y = 0.06;
  group.add(cone);

  const headGeo = new THREE.SphereGeometry(0.04, 12, 12);
  const headMat = new THREE.MeshStandardMaterial({ 
    color: 0xffd54f, 
    roughness: 1.0, 
    metalness: 0.0
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 0.01;
  group.add(head);

  shuttleMesh = group;
  scene.add(shuttleMesh);
  return shuttleMesh;
}

// ========== 建立球員 ==========

export function buildPlayers() {
  const scene = getScene();
  const state = getState();
  const players = getPlayers(state.mode);
  const allIds = [...(players.A || []), ...(players.B || [])];

  Object.keys(playerMeshes).forEach(id => {
    if (!allIds.includes(id)) {
      scene.remove(playerMeshes[id]);
      delete playerMeshes[id];
    }
  });

  allIds.forEach(id => {
    if (!playerMeshes[id]) {
      const isTeamA = id.startsWith('A');
      const group = new THREE.Group();

      const bodyGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.2, 16);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: isTeamA ? 0x2196f3 : 0xff5252,
        roughness: 1.0,
        metalness: 0.0
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.6;
      // 不再 castShadow
      group.add(body);

      const headGeo = new THREE.SphereGeometry(0.22, 16, 16);
      const headMat = new THREE.MeshStandardMaterial({ 
        color: 0xffe0b2, 
        roughness: 1.0, 
        metalness: 0.0
      });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 1.35;
      // 不再 castShadow
      group.add(head);

      playerMeshes[id] = group;
      // v0.5 3C-1：提供 Raycaster 向上追溯用
      group.userData.playerId = id;
      group.userData.kind = 'real';
      scene.add(group);
    }
  });
}

// ========== 同步 3D 位置 ==========

export function sync3DPositions(atEnd = false) {
  const state = getState();
  const shot = getCurrentShot();
  if (!shot) return;

  Object.entries(shot.players).forEach(([id, pos]) => {
    if (playerMeshes[id]) {
      playerMeshes[id].position.set(pos.x, 0, pos.z);
    }
  });

  if (shot.isSetup) {
    const serverTeam = shot.server || 'A';
    const serverId = (getPlayers(state.mode)[serverTeam] || [])[0];
    const serverP = shot.players[serverId] || { x: 0, z: serverTeam === 'A' ? 3.35 : -3.35 };
    if (shuttleMesh) {
      shuttleMesh.visible = true;
      shuttleMesh.position.set(serverP.x, 0.85, serverP.z);
    }
    if (trajectoryMesh) trajectoryMesh.visible = false;
    return;
  }

  const targetPoint = atEnd ? shot.ballTo : shot.ballFrom;
  if (shuttleMesh) {
    // 3C-1：第 2 拍起尚未吸附攔截點時 ballFrom 為 null（球落地、回合結束），隱藏球體避免對 null 取址
    if (targetPoint) {
      shuttleMesh.visible = true;
      shuttleMesh.position.set(targetPoint.x, targetPoint.y || 0.85, targetPoint.z);
    } else {
      shuttleMesh.visible = false;
    }
  }

  update3DTrajectory(shot);
}

// ========== 更新 3D 軌跡 ==========

function update3DTrajectory(shot) {
  const scene = getScene();

  // 清除舊軌跡
  if (trajectoryMesh) {
    scene.remove(trajectoryMesh);
    trajectoryMesh = null;
  }

  // v0.2A：停用 3D 黃色軌跡管（只保留拖尾）
  return;

  // 以下為原本的生成邏輯（保留供未來使用）
  /*
  if (!shot || shot.isSetup || shot.pendingTo) return;

  const data = getTrajectoryData(shot, 40);
  if (data.points.length < 2) return;

  const points = data.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
  const curve = new THREE.CatmullRomCurve3(points);
  const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.025, 8, false);
  const tubeMat = new THREE.MeshStandardMaterial({
    color: 0xffd54f,
    emissive: 0xf57c00,
    emissiveIntensity: 0.4,
    roughness: 1.0,
    metalness: 0.0
  });
  trajectoryMesh = new THREE.Mesh(tubeGeo, tubeMat);
  scene.add(trajectoryMesh);
  */
}

// ========== 球體尾跡 ==========

export function updateBallTrail() {
  const scene = getScene();

  if (trailMesh) {
    scene.remove(trailMesh);
    trailMesh = null;
  }

  if (ballTrail.length < 2) return;

  const trailPoints = ballTrail.slice(-60);
  const pts = trailPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
  
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color: 0xffd54f,
    transparent: true,
    opacity: 0.8
  });
  trailMesh = new THREE.Line(geo, mat);
  scene.add(trailMesh);
}

export function clearBallTrail() {
  ballTrail = [];
  updateBallTrail();
}

export function getPlayerMeshes() { return playerMeshes; }
export function getShuttleMesh() { return shuttleMesh; }

// ========== 擊球水紋 ==========
let rippleMesh = null;

export function showHitRipple(x, z) {
  const scene = getScene();
  if (rippleMesh) {
    scene.remove(rippleMesh);
    if (rippleMesh.geometry) rippleMesh.geometry.dispose();
    if (rippleMesh.material) rippleMesh.material.dispose();
    rippleMesh = null;
  }
  const geo = new THREE.RingGeometry(0.01, 0.15, 32);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd54f,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  rippleMesh = new THREE.Mesh(geo, mat);
  rippleMesh.rotation.x = -Math.PI / 2;
  rippleMesh.position.set(x, 0.05, z);
  rippleMesh.userData.startTime = performance.now();
  rippleMesh.userData.active = true;
  scene.add(rippleMesh);
}

export function updateHitRipple() {
  if (!rippleMesh || !rippleMesh.userData.active) return;
  const elapsed = performance.now() - rippleMesh.userData.startTime;
  const DURATION = 400;
  if (elapsed >= DURATION) {
    const scene = getScene();
    scene.remove(rippleMesh);
    if (rippleMesh.geometry) rippleMesh.geometry.dispose();
    if (rippleMesh.material) rippleMesh.material.dispose();
    rippleMesh = null;
    return;
  }
  const ratio = elapsed / DURATION;
  const scale = 1 + ratio * 3;
  rippleMesh.scale.set(scale, scale, scale);
  rippleMesh.material.opacity = 0.9 * (1 - ratio);
}

// ========== v0.5 3C-1：半透明預覽球員 ==========

function disposeGroup(group) {
  group.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
}

/**
 * 建立半透明預覽球員（全體球員各一隻，平時隱藏）
 */
export function buildPreviewPlayers() {
  const scene = getScene();
  const state = getState();
  const players = getPlayers(state.mode);
  const allIds = [...(players.A || []), ...(players.B || [])];

  if (!window.__previewMeshes) window.__previewMeshes = {};

  // 模式切換後清除不存在的舊預覽球員
  Object.keys(window.__previewMeshes).forEach(id => {
    if (!allIds.includes(id)) {
      scene.remove(window.__previewMeshes[id]);
      disposeGroup(window.__previewMeshes[id]);
      delete window.__previewMeshes[id];
    }
  });

  allIds.forEach(id => {
    if (window.__previewMeshes[id]) return;

    const group = new THREE.Group();

    const bodyGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.2, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: id.startsWith('A') ? 0x2196f3 : 0xff5252,
      transparent: true,
      opacity: 0.4,
      roughness: 1.0,
      metalness: 0.0
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6;
    group.add(body);

    const headGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffe0b2,
      transparent: true,
      opacity: 0.4,
      roughness: 1.0,
      metalness: 0.0
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.35;
    group.add(head);

    group.userData.playerId = id;
    group.userData.kind = 'preview';
    group.visible = false;

    window.__previewMeshes[id] = group;
    scene.add(group);
  });
}

/**
 * 同步預覽球員位置：mover / recoverer 顯示於實體球員位置，其餘隱藏
 */
export function syncPreviewPositions() {
  const state = getState();
  const shot = getCurrentShot();
  const previewMeshes = window.__previewMeshes || {};
  if (!shot) {
    Object.values(previewMeshes).forEach(m => { m.visible = false; });
    return;
  }
  const players = getPlayers(state.mode);

  const activeIds = new Set([
    ...(players[shot.mover] || []),
    ...(players[shot.recoverer] || [])
  ]);

  Object.entries(previewMeshes).forEach(([id, previewMesh]) => {
    const realMesh = playerMeshes[id];
    if (!realMesh) {
      previewMesh.visible = false;
      return;
    }
    if (activeIds.has(id)) {
      previewMesh.position.copy(realMesh.position);
      previewMesh.scale.set(1, 1, 1);
      previewMesh.visible = true;
    } else {
      previewMesh.visible = false;
    }
  });
}

// ========== v0.5 3C-1：實體球員縮放（第 2 拍起縮小一號） ==========

export function updateRealPlayerScale() {
  const state = getState();
  const idx = state.currentShot;
  // 第 0、1 拍實體正常大小且可點選；
  // 第 2 拍起縮小一號與半透明預覽球員區別，且實體不參與 Raycaster（僅半透明可拖）
  const scale = idx >= 2 ? 0.5 : 1.0;
  Object.values(playerMeshes).forEach(mesh => {
    mesh.scale.set(scale, scale, scale);
    mesh.traverse(child => {
      if (!child.isMesh) return;
      if (idx >= 2) {
        child.raycast = function () {};
      } else if (child.userData._raycastDisabled) {
        child.raycast = THREE.Mesh.prototype.raycast;
        child.userData._raycastDisabled = false;
      }
    });
    if (idx >= 2) {
      mesh.traverse(child => { child.userData._raycastDisabled = true; });
    }
  });
}

// ========== v0.5 3C-1：攔截點光圈 ==========

/**
 * 依攔截點陣列建立光圈（固定大小，僅可達點顯示）
 */
export function buildInterceptRings(interceptPoints) {
  const scene = getScene();
  if (window.__interceptRings) {
    window.__interceptRings.forEach(r => {
      scene.remove(r);
      if (r.geometry) r.geometry.dispose();
      if (r.material) r.material.dispose();
    });
  }
  window.__interceptRings = [];

  if (!interceptPoints) return;

  interceptPoints.forEach(ip => {
    if (!ip.reachable) return;
    const geo = new THREE.RingGeometry(0.09, 0.13, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd54f,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(ip.pt.x, 0.02, ip.pt.z);
    ring.userData.level = ip.level;
    ring.userData.interceptPoint = ip;
    scene.add(ring);
    window.__interceptRings.push(ring);
  });
}

/**
 * 選高度時：對應 level 光圈變亮，其他變暗淡但仍可選
 */
export function highlightInterceptRings(level) {
  const rings = window.__interceptRings || [];
  rings.forEach(ring => {
    if (level && ring.userData.level === level) {
      ring.material.opacity = 1.0;
      ring.material.color.setHex(0xffeb3b);
    } else if (level) {
      ring.material.opacity = 0.3;
      ring.material.color.setHex(0xffd54f);
    } else {
      ring.material.opacity = 0.7;
      ring.material.color.setHex(0xffd54f);
    }
  });
}

// ========== v0.5 3C-1：3D 球軌跡線 ==========

let prevTrajectoryMesh = null;
let curTrajectoryMesh = null;

function buildTrajectoryLine(shot, color, opacity) {
  if (!shot || shot.isSetup || shot.pendingTo) return null;
  if (!shot.ballFrom || !shot.ballTo) return null;

  const pts = [];
  const STEPS = 60;
  for (let i = 0; i <= STEPS; i++) {
    const p = getTrajectoryPoint(shot, i / STEPS);
    pts.push(new THREE.Vector3(p.x, p.y, p.z));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color: color,
    transparent: true,
    opacity: opacity
  });
  return new THREE.Line(geo, mat);
}

function buildTrajectoryLines(shot) {
  const scene = getScene();

  if (prevTrajectoryMesh) {
    scene.remove(prevTrajectoryMesh);
    prevTrajectoryMesh.geometry.dispose();
    prevTrajectoryMesh.material.dispose();
    prevTrajectoryMesh = null;
  }
  if (curTrajectoryMesh) {
    scene.remove(curTrajectoryMesh);
    curTrajectoryMesh.geometry.dispose();
    curTrajectoryMesh.material.dispose();
    curTrajectoryMesh = null;
  }

  const shots = getShots();
  const idx = shots.indexOf(shot);

  // 上一拍軌跡（淡藍）
  const prevShot = idx > 0 ? shots[idx - 1] : null;
  if (prevShot && !prevShot.isSetup) {
    prevTrajectoryMesh = buildTrajectoryLine(prevShot, 0x81d4fa, 0.85);
    if (prevTrajectoryMesh) scene.add(prevTrajectoryMesh);
  }

  // 本拍軌跡（黃）
  curTrajectoryMesh = buildTrajectoryLine(shot, 0xffd54f, 0.95);
  if (curTrajectoryMesh) scene.add(curTrajectoryMesh);
}

/**
 * v0.5 3C-2：播放時隱藏全軌跡線（只留拖尾）；非播放時由 refresh3DShotView 重建
 */
export function setTrajectoryLinesVisible(visible) {
  if (prevTrajectoryMesh) prevTrajectoryMesh.visible = visible;
  if (curTrajectoryMesh) curTrajectoryMesh.visible = visible;
}

/**
 * v0.5 3C-2：進入/離開播放模式時切換實體球員狀態。
 * 播放中所有球員恢復正常縮放並開啟 Raycaster（3C-1 第 2 拍起的縮小/禁用只屬編輯模式）；
 * 離開播放時由 refresh3DShotView → updateRealPlayerScale 依當前拍重設。
 */
export function setPlayersPlaybackMode(isPlaying) {
  if (!isPlaying) return;
  Object.values(playerMeshes).forEach(mesh => {
    mesh.scale.set(1, 1, 1);
    mesh.traverse(child => {
      if (!child.isMesh) return;
      if (child.userData._raycastDisabled) {
        child.raycast = THREE.Mesh.prototype.raycast;
        child.userData._raycastDisabled = false;
      }
    });
  });
}

/**
 * v0.5 3C-1：切換拍次後一併刷新 3D 編輯視覺
 * （半透明球員、實體縮放、上拍光圈、新舊軌跡線）
 */
export function refresh3DShotView(shot) {
  if (!shot) return;
  buildPreviewPlayers();
  syncPreviewPositions();
  updateRealPlayerScale();

  const shots = getShots();
  const idx = shots.indexOf(shot);
  const prevShot = idx > 0 ? shots[idx - 1] : null;
  if (prevShot && prevShot.interceptPoints && prevShot.interceptPoints.length > 0) {
    buildInterceptRings(prevShot.interceptPoints);
  } else {
    buildInterceptRings([]);
  }

  buildTrajectoryLines(shot);
}