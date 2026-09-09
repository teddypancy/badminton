import { COURT, ARC_TYPES, LIMITS } from '../config/constants.js';
import { getDefaultApexForArc, getDefaultApexPosForArc } from '../models/shot.js';
import { dist2D } from '../utils/helpers.js';
import { getPlayers } from '../models/player.js';

// ========== 物理引擎 ==========

/**
 * 獲取軌跡點 (所有模組統一使用此函數)
 */
export function getTrajectoryPoint(shot, t) {
  const from = shot.ballFrom, to = shot.ballTo;
  const arcType = shot.arcType;
  let x, y, z;

  const crossesNet = (from.z * to.z < 0);
  const totalDistZ = Math.abs(from.z) + Math.abs(to.z);
  const tNet = (crossesNet && totalDistZ > 0) ? Math.abs(from.z) / totalDistZ : 0.5;

  const userApex = shot.apexHeight !== undefined ? shot.apexHeight : getDefaultApexForArc(arcType, from.y, to.y);
  const apexH = Math.max(userApex, Math.max(from.y, to.y) + 0.05);
  const tApex = (shot.apexPos !== undefined) ? shot.apexPos : getDefaultApexPosForArc(arcType);

  // 快壓 / 輕壓 (特殊衰減曲線)
  if (arcType === 'fast_press' || arcType === 'soft_press') {
    const decay = arcType === 'fast_press' ? 1.8 : 1.2;
    const tDecay = (1 - Math.exp(-decay * t)) / (1 - Math.exp(-decay));

    x = from.x + (to.x - from.x) * tDecay;
    z = from.z + (to.z - from.z) * tDecay;
    let baseY = from.y + (to.y - from.y) * tDecay;

    let netArcBonus = 0;
    if (crossesNet) {
      const linearNetY = from.y + (to.y - from.y) * tNet;
      const minSafeNetY = COURT.net_height + 0.10;
      if (linearNetY < minSafeNetY) {
        netArcBonus = (minSafeNetY - linearNetY) * Math.sin(t * Math.PI);
      }
    }
    y = baseY + netArcBonus;
  }
  // 其他球路 (標準拋物線)
  else {
    const decay = 1.6;
    const tDecay = (1 - Math.exp(-decay * t)) / (1 - Math.exp(-decay));
    x = from.x + (to.x - from.x) * tDecay;
    z = from.z + (to.z - from.z) * tDecay;

    if (tApex > 0.05 && tApex < 0.95) {
      if (t <= tApex) {
        const normT = t / tApex;
        y = from.y + (apexH - from.y) * Math.sin(normT * Math.PI / 2);
      } else {
        const normT = (t - tApex) / (1 - tApex);
        y = apexH - (apexH - to.y) * Math.pow(normT, 1.8);
      }
    } else {
      const baseLinearY = (1 - t) * from.y + t * to.y;
      const hBoost = Math.max(0.1, apexH - (from.y + to.y) / 2);
      y = baseLinearY + 4 * hBoost * t * (1 - t);
    }
  }

  return { x, y: Math.max(0.05, y), z };
}

/**
 * 獲取球速與力量
 */
export function getSpeedAndForce(from, to, arcType) {
  const dist = dist2D(from, to);
  let baseSpeed = 15 + dist * 3.5;
  if (arcType === 'fast_press') baseSpeed *= 1.45;
  if (arcType === 'soft_press') baseSpeed *= 0.85;
  if (arcType === 'high_arc') baseSpeed *= 1.15;

  const kmh = baseSpeed * 3.6;
  const forceRatio = Math.min(1.0, dist / 12.0);
  return { speedMps: baseSpeed, speedKmh: Math.round(kmh), forceRatio };
}

/**
 * 獲取單拍飛行時間
 */
export function getShotDuration(shot) {
  if (!shot || shot.isSetup) return 1.0;
  const dist = dist2D(shot.ballFrom, shot.ballTo);
  let baseDuration = 1.8;
  switch (shot.arcType) {
    case 'high_arc':
      baseDuration = 1.8 + dist * 0.08 + (shot.apexHeight || 6.0) * 0.1;
      break;
    case 'mid_high_arc':
      baseDuration = 1.3 + dist * 0.07 + (shot.apexHeight || 4.0) * 0.08;
      break;
    case 'low_flat_arc':
      baseDuration = 0.9 + dist * 0.05;
      break;
    case 'fast_press':
      baseDuration = 0.5 + dist * 0.04;
      break;
    case 'soft_press':
      baseDuration = 1.0 + dist * 0.05;
      break;
    default:
      baseDuration = 1.3 + dist * 0.07;
  }
  return Math.max(0.4, baseDuration);
}

/**
 * 獲取總回合時間
 */
export function getTotalRallyDuration(shots) {
  let total = 0;
  for (let i = 1; i < shots.length; i++) {
    total += getShotDuration(shots[i]);
  }
  return Math.max(0.1, total);
}

/**
 * 物理診斷
 */
export function checkPhysics(shot, shots, mode) {
  if (shot.isSetup) {
    return { valid: true, type: 'ok', msg: '第 0 拍：初始發接發站位調整' };
  }
  if (shot.pendingTo) {
    return { valid: true, type: 'ok', msg: '🎯 請點擊對面場地設定球路落點' };
  }

  const { speedKmh } = getSpeedAndForce(shot.ballFrom, shot.ballTo, shot.arcType);

  // 過網檢查
  let netPassed = false;
  let minNetHeight = 99;
  for (let t = 0; t <= 1.0; t += 0.01) {
    const p = getTrajectoryPoint(shot, t);
    if (Math.abs(p.z) < 0.15) {
      netPassed = true;
      if (p.y < minNetHeight) minNetHeight = p.y;
    }
  }

  // 速度檢查
  const speedWarns = [];
  const duration = getShotDuration(shot);
  const prevShotIndex = shots.indexOf(shot) - 1;
  const prevShot = prevShotIndex >= 0 ? shots[prevShotIndex] : null;

  Object.entries(shot.players).forEach(([id, p]) => {
    if (prevShot && prevShot.players[id]) {
      const prevP = prevShot.players[id];
      const dist = dist2D(p, prevP);
      const reqSpeed = dist / Math.max(0.1, duration);

      if (reqSpeed > LIMITS.playerMaxSpeed) {
        speedWarns.push({
          id,
          type: 'extreme',
          msg: `⚠️ 球員 ${id} 跑動距離過大 (${dist.toFixed(1)}m)，需 ${reqSpeed.toFixed(1)}m/s，超過人類極限！`,
          required: reqSpeed,
          current: p.speed || 3.0
        });
      } else if (reqSpeed > (p.speed || 3.0)) {
        speedWarns.push({
          id,
          type: 'need_faster',
          msg: `⚠️ 球員 ${id} 跑動 ${dist.toFixed(1)}m，速度 ${(p.speed || 3.0).toFixed(1)}m/s 低於所需 ${reqSpeed.toFixed(1)}m/s`,
          required: reqSpeed,
          current: p.speed || 3.0
        });
      }
    } else if ((p.speed || 3.0) > LIMITS.playerMaxSpeed) {
      speedWarns.push({
        id,
        type: 'extreme',
        msg: `⚠️ 球員 ${id} 設定速度 ${p.speed.toFixed(1)}m/s 超過人類極限！`,
        required: p.speed || 3.0,
        current: p.speed || 3.0
      });
    }
  });

  // 快壓/輕壓 高度檢查
  if ((shot.arcType === 'fast_press' || shot.arcType === 'soft_press') && shot.hitLevel !== 'high') {
    return {
      valid: false,
      type: 'warn',
      msg: `⚠️ 違背物理規律：${shot.hitLevel}位擊球無法進行${ARC_TYPES[shot.arcType].name}！`,
      speedWarns
    };
  }

  // 觸網檢查
  if (netPassed && minNetHeight < COURT.net_height) {
    return {
      valid: false,
      type: 'warn',
      msg: `⚠️ 軌跡過網高度僅 ${minNetHeight.toFixed(2)}m (網高 ${COURT.net_height}m)，球將觸網！`,
      speedWarns
    };
  }

  // 速度警告
  if (speedWarns.length > 0) {
    const needsFaster = speedWarns.filter(w => w.type === 'need_faster');
    const extremes = speedWarns.filter(w => w.type === 'extreme');

    let suggestion = '';
    if (needsFaster.length > 0) {
      const maxReq = Math.max(...needsFaster.map(w => w.required));
      suggestion = ` 💡 建議速度：${Math.ceil(maxReq * 10) / 10}m/s`;
    }
    if (extremes.length > 0) {
      suggestion = ' ⚠️ 部分球員速度超過人類極限 (8m/s)';
    }

    return {
      valid: false,
      type: 'warn',
      msg: speedWarns.map(w => w.msg).join(' ') + suggestion,
      speedWarns
    };
  }

  return {
    valid: true,
    type: 'ok',
    msg: `✓ 物理規律正常：球速 ${speedKmh} km/h，過網 ${minNetHeight < 50 ? minNetHeight.toFixed(2) + 'm' : '極佳'}，頂點 ${shot.apexHeight.toFixed(2)}m。`
  };
}

/**
 * 獲取攔截點信息 (修復 require 循環依賴報錯)
 */
export function getInterceptionInfo(shot, mode) {
  if (!shot || shot.isSetup || shot.pendingTo) return [];

  const defenderSide = shot.striker === 'A' ? 'B' : 'A';
  const defenderIds = getPlayers(mode)[defenderSide] || [];
  const duration = getShotDuration(shot);
  const totalDist = dist2D(shot.ballFrom, shot.ballTo);
  if (totalDist <= 0.1) return [];

  const stepDist = 0.5;
  const steps = Math.max(2, Math.floor(totalDist / stepDist));
  const intercepts = [];

  defenderIds.forEach(id => {
    const playerPos = shot.players[id];
    if (!playerPos) return;

    const speed = playerPos.speed || 3.0;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const flightTime = t * duration;
      const pt = getTrajectoryPoint(shot, t);

      // 判斷是否在防守方半場 (這部分邏輯與原版4.86一致)
      const isDefenderArea = defenderSide === 'A' ? (pt.z >= -0.1) : (pt.z <= 0.1);

      if (isDefenderArea && pt.y >= 0.8 && pt.y <= 2.8) {
        const snapX = shot.ballFrom.x + t * (shot.ballTo.x - shot.ballFrom.x);
        const snapZ = shot.ballFrom.z + t * (shot.ballTo.z - shot.ballFrom.z);

        const dist = Math.hypot(snapX - playerPos.x, snapZ - playerPos.z);
        const timeNeeded = dist / speed;

        if (timeNeeded <= flightTime) {
          intercepts.push({
            playerId: id,
            t: t,
            flightTime: flightTime,
            pt: pt,
            snapX: snapX,
            snapZ: snapZ,
            dist: dist,
            timeNeeded: timeNeeded,
            height: pt.y,
            canPress: pt.y >= 2.0
          });
        }
      }
    }
  });

  return intercepts;
}