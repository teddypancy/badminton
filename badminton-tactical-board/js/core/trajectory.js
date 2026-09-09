// js/core/trajectory.js

import { getTrajectoryPoint, getShotDuration } from './physics.js';
import { getState } from './state.js';
import { getPlayers } from '../models/player.js';

/**
 * 獲取單一拍次的完整軌跡數據
 * @param {Object} shot - 拍次對象
 * @param {number} steps - 採樣點數量 (默認 40)
 * @returns {Object} { points, duration, maxHeight, maxHeightPoint, netCrossing }
 */
export function getTrajectoryData(shot, steps = 40) {
  if (!shot || shot.isSetup || shot.pendingTo) {
    return { points: [], duration: 0, maxHeight: 0, maxHeightPoint: null, netCrossing: null };
  }

  const points = [];
  let maxHeight = -1;
  let maxHeightPoint = null;
  let netCrossing = null;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt = getTrajectoryPoint(shot, t);
    points.push({ t, ...pt });

    if (pt.y > maxHeight) {
      maxHeight = pt.y;
      maxHeightPoint = { t, ...pt };
    }

    // 檢測過網點 (z 軸穿越 0)
    if (i > 0) {
      const prevPt = points[i - 1];
      if (prevPt.z * pt.z <= 0 && Math.abs(prevPt.z - pt.z) > 0.001) {
        netCrossing = { t, ...pt };
      }
    }
  }

  const duration = getShotDuration(shot);

  return {
    points,
    duration,
    maxHeight,
    maxHeightPoint,
    netCrossing
  };
}

/**
 * 獲取整個回合的軌跡數據
 * @returns {Array} 每拍的軌跡數據數組
 */
export function getAllTrajectories() {
  const state = getState();
  const results = [];

  for (let i = 0; i < state.shots.length; i++) {
    const shot = state.shots[i];
    if (shot.isSetup || shot.pendingTo) {
      results.push({ index: i, isSetup: true, data: null });
    } else {
      results.push({
        index: i,
        isSetup: false,
        data: getTrajectoryData(shot)
      });
    }
  }

  return results;
}

/**
 * 獲取指定時間點的軌跡位置
 * @param {number} animTime - 動畫時間 (秒)
 * @returns {Object|null} { shotIndex, t, point }
 */
export function getTrajectoryAtTime(animTime) {
  const state = getState();
  const shots = state.shots;

  if (shots.length <= 1) return null;

  let accumulatedTime = 0;

  for (let i = 1; i < shots.length; i++) {
    const shot = shots[i];
    const duration = getShotDuration(shot);

    if (animTime >= accumulatedTime && animTime <= accumulatedTime + duration) {
      const t = (animTime - accumulatedTime) / duration;
      const point = getTrajectoryPoint(shot, t);
      return {
        shotIndex: i,
        t: t,
        point: point,
        shot: shot
      };
    }
    accumulatedTime += duration;
  }

  // 超出範圍，返回最後一拍終點
  const lastShot = shots[shots.length - 1];
  if (lastShot && !lastShot.isSetup) {
    return {
      shotIndex: shots.length - 1,
      t: 1.0,
      point: { ...lastShot.ballTo },
      shot: lastShot
    };
  }

  return null;
}

/**
 * 獲取軌跡上的吸附點 (用於球員吸附)
 * @param {Object} shot - 拍次對象
 * @param {number} interval - 時間間隔 (秒)
 * @returns {Array} 吸附點數組
 */
export function getSnapPoints(shot, interval = 0.5) {
  if (!shot || shot.isSetup || shot.pendingTo) return [];

  const duration = getShotDuration(shot);
  const count = Math.max(2, Math.floor(duration / interval));
  const points = [];

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const pt = getTrajectoryPoint(shot, t);
    const flightTime = t * duration;

    points.push({
      t: t,
      flightTime: flightTime,
      x: pt.x,
      y: pt.y,
      z: pt.z,
      // 速度估算 (簡化)
      speed: t < 0.5 ? 15 + t * 10 : 25 - (t - 0.5) * 20
    });
  }

  return points;
}

/**
 * 獲取球員在軌跡上的攔截點
 * @param {Object} shot - 拍次對象
 * @param {string} playerId - 球員 ID
 * @param {number} playerSpeed - 球員速度 (m/s)
 * @returns {Array} 可攔截點數組
 */
export function getPlayerInterceptPoints(shot, playerId, playerSpeed) {
  if (!shot || shot.isSetup || shot.pendingTo) return [];

  const snapPoints = getSnapPoints(shot, 0.3);
  const state = getState();
  const defenderSide = shot.striker === 'A' ? 'B' : 'A';
  const isDefenderArea = defenderSide === 'A' ? 1 : -1;

  const intercepts = [];

  for (const sp of snapPoints) {
    const playerPos = shot.players[playerId];
    if (!playerPos) continue;

    // 檢查是否在防守方區域
    const inDefenderArea = (defenderSide === 'A') ? (sp.z >= -0.1) : (sp.z <= 0.1);
    if (!inDefenderArea) continue;

    // 檢查高度是否可擊球 (0.8m ~ 2.8m)
    if (sp.y < 0.8 || sp.y > 2.8) continue;

    const dist = Math.hypot(sp.x - playerPos.x, sp.z - playerPos.z);
    const timeNeeded = dist / Math.max(0.5, playerSpeed);

    if (timeNeeded <= sp.flightTime) {
      intercepts.push({
        playerId: playerId,
        t: sp.t,
        flightTime: sp.flightTime,
        x: sp.x,
        y: sp.y,
        z: sp.z,
        dist: dist,
        timeNeeded: timeNeeded,
        canPress: sp.y >= 2.0
      });
    }
  }

  return intercepts;
}

/**
 * 驗證軌跡是否合理 (過網高度檢查)
 * @param {Object} shot - 拍次對象
 * @returns {Object} { valid, minNetHeight, msg }
 */
export function validateTrajectory(shot) {
  if (!shot || shot.isSetup || shot.pendingTo) {
    return { valid: true, minNetHeight: 0, msg: '無需驗證' };
  }

  const data = getTrajectoryData(shot);
  let netPassed = false;
  let minNetHeight = 99;

  for (const pt of data.points) {
    if (Math.abs(pt.z) < 0.15) {
      netPassed = true;
      if (pt.y < minNetHeight) minNetHeight = pt.y;
    }
  }

  const COURT = { net_height: 1.55 }; // 從 constants 導入

  if (netPassed && minNetHeight < COURT.net_height) {
    return {
      valid: false,
      minNetHeight: minNetHeight,
      msg: `⚠️ 過網高度 ${minNetHeight.toFixed(2)}m，低於網高 ${COURT.net_height}m`
    };
  }

  return {
    valid: true,
    minNetHeight: minNetHeight,
    msg: `✓ 過網高度 ${minNetHeight < 50 ? minNetHeight.toFixed(2) + 'm' : '極佳'}`
  };
}