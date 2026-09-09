// js/3d/entities.js

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.module.js';
import { COURT } from '../config/constants.js';
import { getState, getCurrentShot } from '../core/state.js';
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

  // 地板
  const courtGeo = new THREE.PlaneGeometry(COURT.width_d, COURT.length);
  const courtMat = new THREE.MeshStandardMaterial({ color: 0x1b5e20, roughness: 0.4 });
  const courtFloor = new THREE.Mesh(courtGeo, courtMat);
  courtFloor.rotation.x = -Math.PI / 2;
  courtFloor.receiveShadow = true;
  scene.add(courtFloor);

  // 外圍
  const outGeo = new THREE.PlaneGeometry(COURT.width_d + 3, COURT.length + 3);
  const outMat = new THREE.MeshStandardMaterial({ color: 0x0f2847, roughness: 0.6 });
  const outFloor = new THREE.Mesh(outGeo, outMat);
  outFloor.rotation.x = -Math.PI / 2;
  outFloor.position.y = -0.01;
  scene.add(outFloor);

  // 標線
  const points = [];
  const addLine = (x1, z1, x2, z2) => {
    points.push(new THREE.Vector3(x1, 0.01, z1), new THREE.Vector3(x2, 0.01, z2));
  };

  const hw = COURT.width_d / 2, hl = COURT.length / 2;
  addLine(-hw, -hl, hw, -hl);
  addLine(hw, -hl, hw, hl);
  addLine(hw, hl, -hw, hl);
  addLine(-hw, hl, -hw, -hl);
  addLine(-hw, 0, hw, 0);
  addLine(-hw, -COURT.service_line, hw, -COURT.service_line);
  addLine(-hw, COURT.service_line, hw, COURT.service_line);
  addLine(-hw, -COURT.double_back, hw, -COURT.double_back);
  addLine(-hw, COURT.double_back, hw, COURT.double_back);
  addLine(0, -hl, 0, -COURT.service_line);
  addLine(0, hl, 0, COURT.service_line);

  const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  scene.add(lines);

  // 球網
  const postGeo = new THREE.CylinderGeometry(0.03, 0.03, COURT.net_height, 16);
  const postMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 });

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
    opacity: 0.45,
    side: THREE.DoubleSide
  });
  const netMesh = new THREE.Mesh(netGeo, netMat);
  netMesh.position.set(0, COURT.net_height - 0.4, 0);
  scene.add(netMesh);

  const tapeGeo = new THREE.PlaneGeometry(COURT.width_d, 0.08);
  const tapeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const tapeMesh = new THREE.Mesh(tapeGeo, tapeMat);
  tapeMesh.position.set(0, COURT.net_height - 0.04, 0);
  scene.add(tapeMesh);
}

// ========== 建立羽球 ==========

export function createShuttle() {
  const scene = getScene();
  const group = new THREE.Group();

  const coneGeo = new THREE.ConeGeometry(0.08, 0.12, 12, 1, true);
  const coneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    roughness: 0.3
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.y = 0.06;
  group.add(cone);

  const headGeo = new THREE.SphereGeometry(0.04, 12, 12);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffd54f, roughness: 0.2 });
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

  // 清除不存在的
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
        color: isTeamA ? 0x2196f3 : 0xff5252
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.6;
      body.castShadow = true;
      group.add(body);

      const headGeo = new THREE.SphereGeometry(0.22, 16, 16);
      const headMat = new THREE.MeshStandardMaterial({ color: 0xffe0b2 });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 1.35;
      head.castShadow = true;
      group.add(head);

      playerMeshes[id] = group;
      scene.add(group);
    }
  });
}

// ========== 同步 3D 位置 ==========

export function sync3DPositions(atEnd = false) {
  const state = getState();
  const shot = getCurrentShot();
  if (!shot) return;

  // 更新球員位置
  Object.entries(shot.players).forEach(([id, pos]) => {
    if (playerMeshes[id]) {
      playerMeshes[id].position.set(pos.x, 0, pos.z);
    }
  });

  // 更新球
  if (shot.isSetup) {
    const serverTeam = shot.server || 'A';
    const serverId = (getPlayers(state.mode)[serverTeam] || [])[0];
    const serverP = shot.players[serverId] || { x: 0, z: serverTeam === 'A' ? 3.35 : -3.35 };
    if (shuttleMesh) {
      shuttleMesh.position.set(serverP.x, 0.85, serverP.z);
    }
    if (trajectoryMesh) trajectoryMesh.visible = false;
    return;
  }

  const targetPoint = atEnd ? shot.ballTo : shot.ballFrom;
  if (shuttleMesh) {
    shuttleMesh.position.set(targetPoint.x, targetPoint.y || 0.85, targetPoint.z);
  }

  update3DTrajectory(shot);
}

// ========== 更新 3D 軌跡 ==========

function update3DTrajectory(shot) {
  const scene = getScene();

  if (trajectoryMesh) {
    scene.remove(trajectoryMesh);
    trajectoryMesh = null;
  }

  if (!shot || shot.isSetup || shot.pendingTo) return;

  const data = getTrajectoryData(shot, 40);
  if (data.points.length < 2) return;

  const points = data.points.map(p => new THREE.Vector3(p.x, p.y, p.z));

  const curve = new THREE.CatmullRomCurve3(points);
  const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.025, 8, false);
  const tubeMat = new THREE.MeshStandardMaterial({
    color: 0xffd54f,
    emissive: 0xf57c00,
    emissiveIntensity: 0.4
  });
  trajectoryMesh = new THREE.Mesh(tubeGeo, tubeMat);
  scene.add(trajectoryMesh);
}

// ========== 球體尾跡 (黃色拖尾) ==========

export function updateBallTrail() {
  const scene = getScene();

  if (trailMesh) {
    scene.remove(trailMesh);
    trailMesh = null;
  }

  if (ballTrail.length < 2) return;

  // 取最近 60 個點 (約1-2秒的軌跡)
  const trailPoints = ballTrail.slice(-60);
  const pts = trailPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
  
  // 使用 Line 線條實現黃色拖尾
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color: 0xffd54f,
    transparent: true,
    opacity: 0.8,
    linewidth: 2
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
export function getTrajectoryMesh() { return trajectoryMesh; }