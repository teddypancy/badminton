import { COURT, ARC_TYPES, LIMITS, SPEED_RANGES, PHYSICS } from '../config/constants.js';
import { getDefaultApexForArc, getDefaultApexPosForArc, getEffectiveEnd } from '../models/shot.js';
import { dist2D } from '../utils/helpers.js';
import { getPlayers } from '../models/player.js';

// ========== 物理引擎 v0.2A ==========

export function getInitialSpeed(shot) {
  if (!shot || shot.isSetup) return 0;

  const arcType = shot.arcType;

  if (arcType === 'fast_press' || arcType === 'soft_press') {
    return getPressSpeed(shot);
  }

  return getArcSpeed(shot);
}

/**
 * 估算快壓的飛行時間（給定速度）
 */
function estimatePressFlightTime(shot, speedKmh) {
  const from = shot.ballFrom;
  const to = getEffectiveEnd(shot);
  const dist = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const speedMps = speedKmh / 3.6;
  return Math.max(0.3, dist / (speedMps * 0.7));
}

/**
 * 估算擊球方到達擊球點的時間
 */
function estimatePlayerArrivalTime(shot) {
  const striker = shot.striker;
  const strikerIds = Object.keys(shot.players).filter(id => id.startsWith(striker));
  if (strikerIds.length === 0) return 0.5;

  const strikerPos = shot.players[strikerIds[0]];
  if (!strikerPos) return 0.5;

  const from = shot.ballFrom;
  const dist = Math.hypot(from.x - strikerPos.x, from.z - strikerPos.z);
  const speed = strikerPos.speed || 3.0;
  return dist / Math.max(0.5, speed);
}

/**
 * 快壓速度計算（迭代求解）
 * 基準：擊球方等待球下落的時間
 *   > 1s：蓄力重殺
 *   > 0.5s：從容
 *   > 0s：剛好
 *   <= 0s：遲到
 */
function getPressSpeed(shot) {
  const from = shot.ballFrom;
  const arcType = shot.arcType;

  const isBackcourt = Math.abs(from.z) > 3.0;
  const range = isBackcourt
    ? SPEED_RANGES.backcourt[arcType]
    : SPEED_RANGES.frontcourt.high_soft_press;

  const { min, max } = range;

  if (arcType === 'soft_press') {
    return min;
  }

  // 初始估計：中位數
  let speed = Math.round((min + max) / 2);
  const playerArrivalTime = estimatePlayerArrivalTime(shot);

  for (let iter = 0; iter < 3; iter++) {
    // 用當前速度計算球到達時間
    const flightTime = estimatePressFlightTime(shot, speed);

    // 等待時間 = 球到達時間 - 球員到達時間
    const waitTime = flightTime - playerArrivalTime;

    // 根據等待時間調整速度
    let newSpeed;
    if (waitTime > 1.0) {
      // 蓄力重殺：接近上限
      newSpeed = Math.round(min + (max - min) * 0.9);
    } else if (waitTime > 0.5) {
      // 從容：中上
      newSpeed = Math.round(min + (max - min) * 0.7);
    } else if (waitTime > 0) {
      // 剛好：中等
      newSpeed = Math.round(min + (max - min) * 0.5);
    } else {
      // 遲到：中下
      newSpeed = Math.round(min + (max - min) * 0.3);
    }

    // 收斂條件：差異 < 5 km/h
    if (Math.abs(newSpeed - speed) < 5) {
      speed = newSpeed;
      break;
    }
    speed = newSpeed;
  }

  return speed;
}

function getArcSpeed(shot) {
  const from = shot.ballFrom;
  const to = getEffectiveEnd(shot);
  const arcType = shot.arcType;

  const horizontalDist = dist2D(from, to);
  const apexHeight = shot.apexHeight || getDefaultApexForArc(arcType, from.y, to.y);
  const verticalRise = Math.max(0.1, apexHeight - (from.y || 1.0));

  const isBackcourt = Math.abs(to.z) > 3.0;

  let range;
  if (arcType === 'high_arc' || arcType === 'mid_high_arc') {
    if (isBackcourt) {
      range = SPEED_RANGES.backcourt.high_arc;
    } else {
      range = SPEED_RANGES.frontcourt.high_lift;
    }
  } else if (arcType === 'low_flat_arc') {
    if (horizontalDist < 6.0) {
      range = isBackcourt ? SPEED_RANGES.backcourt.near_flat : SPEED_RANGES.frontcourt.mid_low_near;
    } else {
      range = isBackcourt ? SPEED_RANGES.backcourt.far_flat : SPEED_RANGES.frontcourt.mid_low_far;
    }
  } else {
    range = SPEED_RANGES.backcourt.high_arc;
  }

  const { min, max } = range;

  const distFactor = Math.min(1.0, horizontalDist / 13.4);
  const heightFactor = Math.max(0, 1.0 - verticalRise / 8.0);

  const factor = distFactor * 0.6 + heightFactor * 0.4;

  return Math.round(min + (max - min) * factor);
}

export function getTrajectoryPoint(shot, t) {
  const arcType = shot.arcType;

  if (arcType === 'fast_press' || arcType === 'soft_press') {
    return getPressTrajectory(shot, t);
  }

  return getArcTrajectory(shot, t);
}

function getPressTrajectory(shot, t) {
  const from = shot.ballFrom;
  const to = getEffectiveEnd(shot);
  const arcType = shot.arcType;

  const decay = arcType === 'fast_press' ? 1.8 : 1.2;
  const tDecay = (1 - Math.exp(-decay * t)) / (1 - Math.exp(-decay));

  const x = from.x + (to.x - from.x) * tDecay;
  const z = from.z + (to.z - from.z) * tDecay;
  let baseY = from.y + (to.y - from.y) * tDecay;

  const crossesNet = (from.z * to.z < 0);
  const totalDistZ = Math.abs(from.z) + Math.abs(to.z);
  const tNet = (crossesNet && totalDistZ > 0) ? Math.abs(from.z) / totalDistZ : 0.5;

  let netArcBonus = 0;
  if (crossesNet) {
    const linearNetY = from.y + (to.y - from.y) * tNet;
    const minSafeNetY = COURT.net_height + 0.10;
    if (linearNetY < minSafeNetY) {
      netArcBonus = (minSafeNetY - linearNetY) * Math.sin(t * Math.PI);
    }
  }
  const y = baseY + netArcBonus;

  return { x, y: Math.max(0.05, y), z };
}

function getArcTrajectory(shot, t) {
  const from = shot.ballFrom;
  const to = getEffectiveEnd(shot);
  const arcType = shot.arcType;

  const userApex = shot.apexHeight !== undefined ? shot.apexHeight : getDefaultApexForArc(arcType, from.y, to.y);
  const apexH = Math.max(userApex, Math.max(from.y, to.y) + 0.05);
  const userApexPos = (shot.apexPos !== undefined) ? shot.apexPos : getDefaultApexPosForArc(arcType);

  const riseHeight = Math.max(0.1, apexH - (from.y || 1.0));
  const fallHeight = Math.max(0.1, apexH - (to.y || 0.1));
  const tUp = Math.sqrt(2 * riseHeight / PHYSICS.gravity) * PHYSICS.resistanceUp;
  const tDown = Math.sqrt(2 * fallHeight / PHYSICS.gravity) * PHYSICS.resistanceDown;
  const tApexTimeRatio = tUp / (tUp + tDown);

  let x, z;
  if (t <= tApexTimeRatio) {
    const normT = t / tApexTimeRatio;
    const horizProgress = normT * userApexPos;
    x = from.x + (to.x - from.x) * horizProgress;
    z = from.z + (to.z - from.z) * horizProgress;
  } else {
    const normT = (t - tApexTimeRatio) / (1 - tApexTimeRatio);
    const horizProgress = userApexPos + normT * (1 - userApexPos);
    x = from.x + (to.x - from.x) * horizProgress;
    z = from.z + (to.z - from.z) * horizProgress;
  }

  let y;
  if (t <= tApexTimeRatio) {
    const normT = t / tApexTimeRatio;
    y = from.y + (apexH - from.y) * Math.sin(normT * Math.PI / 2);
  } else {
    const normT = (t - tApexTimeRatio) / (1 - tApexTimeRatio);
    y = apexH - (apexH - to.y) * (normT * normT);
  }

  return { x, y: Math.max(0.05, y), z };
}

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

function getFlightDistance3D(shot) {
  const from = shot.ballFrom;
  const to = getEffectiveEnd(shot);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  // 水平距離（忽略高度差）
  return Math.hypot(dx, dz);
}

/**
 * 計算平均速度（km/h）
 */
function getAverageSpeed(shot) {
  const initialKmh = getInitialSpeed(shot);
  if (initialKmh === 0) return 0;
  return Math.round(initialKmh * 0.6);
}

export function getShotDuration(shot) {
  if (!shot || shot.isSetup) return 1.0;

  const arcType = shot.arcType;
  const from = shot.ballFrom;
  const to = getEffectiveEnd(shot);

  if (arcType === 'fast_press' || arcType === 'soft_press') {
    const dist = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const speedKmh = getInitialSpeed(shot);
    const speedMps = speedKmh / 3.6;
    let duration = dist / (speedMps * 0.7);
    return Math.max(0.3, Math.min(2.0, duration));
  }

  const userApex = shot.apexHeight !== undefined ? shot.apexHeight : getDefaultApexForArc(arcType, from.y, to.y);
  const apexH = Math.max(userApex, Math.max(from.y, to.y) + 0.05);

  const riseHeight = Math.max(0.1, apexH - (from.y || 1.0));
  const fallHeight = Math.max(0.1, apexH - (to.y || 0.1));

  const tUp = Math.sqrt(2 * riseHeight / PHYSICS.gravity) * PHYSICS.resistanceUp;
  const tDown = Math.sqrt(2 * fallHeight / PHYSICS.gravity) * PHYSICS.resistanceDown;

  const duration = tUp + tDown;
  return Math.max(0.3, Math.min(6.0, duration));
}

export function getTotalRallyDuration(shots) {
  let total = 0;
  for (let i = 1; i < shots.length; i++) {
    total += getShotDuration(shots[i]);
  }
  return Math.max(0.1, total);
}

/**
 * 物理診斷
 * v0.2A：回傳結構化 stats 數據
 */
export function checkPhysics(shot, shots, mode) {
  if (shot.isSetup) {
    return {
      valid: true,
      type: 'ok',
      msg: '第 0 拍：初始發接發站位調整',
      stats: null,
      speedWarns: []
    };
  }
  if (shot.pendingTo) {
    return {
      valid: true,
      type: 'ok',
      msg: '🎯 請點擊對面場地設定球路落點',
      stats: null,
      speedWarns: []
    };
  }

  const initialSpeedKmh = getInitialSpeed(shot);
  const averageSpeedKmh = getAverageSpeed(shot);
  const flightTime = getShotDuration(shot);
  const flightDist = getFlightDistance3D(shot);

  let netPassed = false;
  let minNetHeight = 99;
  for (let t = 0; t <= 1.0; t += 0.01) {
    const p = getTrajectoryPoint(shot, t);
    if (Math.abs(p.z) < 0.15) {
      netPassed = true;
      if (p.y < minNetHeight) minNetHeight = p.y;
    }
  }

  // 速度警告
  const speedWarns = [];
  const prevShotIndex = shots.indexOf(shot) - 1;
  const prevShot = prevShotIndex >= 0 ? shots[prevShotIndex] : null;

  // 球員移動距離
  const playerMovements = {};

  Object.entries(shot.players).forEach(([id, p]) => {
    const previewPos = shot.previewPositions?.[id] || p;
    const dist = Math.hypot(previewPos.x - p.x, previewPos.z - p.z);
    const reqSpeed = dist / Math.max(0.1, flightTime);

    playerMovements[id] = {
      distance: dist,
      requiredSpeed: reqSpeed,
      currentSpeed: p.speed || 3.0
    };

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
  });

  // 快壓/輕壓 高度檢查
  if ((shot.arcType === 'fast_press' || shot.arcType === 'soft_press') && shot.hitLevel !== 'high') {
    return {
      valid: false,
      type: 'warn',
      msg: `⚠️ 違背物理規律：${shot.hitLevel}位擊球無法進行${ARC_TYPES[shot.arcType].name}！`,
      stats: {
        initialSpeed: initialSpeedKmh,
        averageSpeed: averageSpeedKmh,
        flightDistance: flightDist,
        flightTime: flightTime,
        netClearance: minNetHeight,
        playerMovements
      },
      speedWarns
    };
  }

  // 觸網檢查
  if (netPassed && minNetHeight < COURT.net_height) {
    return {
      valid: false,
      type: 'warn',
      msg: `⚠️ 軌跡過網高度僅 ${minNetHeight.toFixed(2)}m (網高 ${COURT.net_height}m)，球將觸網！`,
      stats: {
        initialSpeed: initialSpeedKmh,
        averageSpeed: averageSpeedKmh,
        flightDistance: flightDist,
        flightTime: flightTime,
        netClearance: minNetHeight,
        playerMovements
      },
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
      stats: {
        initialSpeed: initialSpeedKmh,
        averageSpeed: averageSpeedKmh,
        flightDistance: flightDist,
        flightTime: flightTime,
        netClearance: minNetHeight,
        playerMovements
      },
      speedWarns
    };
  }

  // 正常
  const interceptNote = shot.interception ? ` [攔截於 ${shot.interception.height.toFixed(2)}m]` : '';
  return {
    valid: true,
    type: 'ok',
    msg: `✓ 物理正常${interceptNote}`,
    stats: {
      initialSpeed: initialSpeedKmh,
      averageSpeed: averageSpeedKmh,
      flightDistance: flightDist,
      flightTime: flightTime,
      netClearance: minNetHeight,
      playerMovements
    },
    speedWarns: []
  };
}

export function getInterceptionInfo(shot, mode) {
  if (!shot || shot.isSetup || shot.pendingTo) return [];

  const defenderSide = shot.striker === 'A' ? 'B' : 'A';
  const defenderIds = getPlayers(mode)[defenderSide] || [];
  const duration = getShotDuration(shot);
  const totalDist = dist2D(shot.ballFrom, shot.ballTo);
  if (totalDist <= 0.1) return [];

  const interval = 0.5;
  const count = Math.max(10, Math.ceil(duration / interval));
  const intercepts = [];

  defenderIds.forEach(id => {
    const playerPos = shot.players[id];
    if (!playerPos) return;

    const speed = playerPos.speed || 3.0;

    for (let i = 1; i <= count; i++) {
      const t = i / count;
      const flightTime = t * duration;
      const pt = getTrajectoryPoint(shot, t);

      const isDefenderArea = defenderSide === 'A' ? (pt.z >= -0.1) : (pt.z <= 0.1);

      if (isDefenderArea && pt.y >= 0.8 && pt.y <= 2.8) {
        const snapX = shot.ballFrom.x + t * (shot.ballTo.x - shot.ballFrom.x);
        const snapZ = shot.ballFrom.z + t * (shot.ballTo.z - shot.ballFrom.z);

        const dist = Math.hypot(snapX - playerPos.x, snapZ - playerPos.z);
        const timeNeeded = dist / speed;

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
          canPress: pt.y >= 2.0,
          canReach: timeNeeded <= flightTime
        });
      }
    }
  });

  return intercepts;
}