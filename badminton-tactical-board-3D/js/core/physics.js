import { COURT, LIMITS, SPEED_RANGES, PHYSICS, SPEED_BASELINE } from '../config/constants.js';
import { getDefaultApexForArc, getDefaultApexPosForArc } from '../models/shot.js';
import { dist2D } from '../utils/helpers.js';

// ========== 物理引擎 v0.2b / v0.5 ==========

export function getInitialSpeed(shot) {
  if (!shot || shot.isSetup) return 0;

  const arcType = shot.arcType;

  if (arcType === 'fast_press' || arcType === 'soft_press') {
    return getPressSpeed(shot);
  }

  return getArcSpeed(shot);
}

function estimatePressFlightTime(shot, speedKmh) {
  const from = shot.ballFrom;
  const to = shot.ballTo;
  const dist = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const speedMps = speedKmh / 3.6;
  return Math.max(0.3, dist / (speedMps * 0.3));
}

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

  let speed = Math.round((min + max) / 2);
  const playerArrivalTime = estimatePlayerArrivalTime(shot);

  for (let iter = 0; iter < 3; iter++) {
    const flightTime = estimatePressFlightTime(shot, speed);
    const waitTime = flightTime - playerArrivalTime;

    let newSpeed;
    if (waitTime > 1.0) {
      newSpeed = Math.round(min + (max - min) * 0.9);
    } else if (waitTime > 0.5) {
      newSpeed = Math.round(min + (max - min) * 0.7);
    } else if (waitTime > 0) {
      newSpeed = Math.round(min + (max - min) * 0.5);
    } else {
      newSpeed = Math.round(min + (max - min) * 0.3);
    }

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
  const to = shot.ballTo;
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
  // 3C-1：回合結束拍（未吸附攔截點）ballFrom 為 null，直接回傳終點/安全點避免下游取址崩潰
  if (!shot || !shot.ballFrom) {
    return shot && shot.ballTo ? { x: shot.ballTo.x, y: shot.ballTo.y || 0.1, z: shot.ballTo.z } : { x: 0, y: 0.1, z: 0 };
  }
  if (!shot.ballTo) {
    return { x: shot.ballFrom.x, y: shot.ballFrom.y || 0.1, z: shot.ballFrom.z };
  }

  const arcType = shot.arcType;

  if (arcType === 'fast_press' || arcType === 'soft_press') {
    return getPressTrajectory(shot, t);
  }

  return getArcTrajectory(shot, t);
}

function getPressTrajectory(shot, t) {
  const from = shot.ballFrom;
  const to = shot.ballTo;
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
  const to = shot.ballTo;
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

function getFlightDistance3D(shot) {
  const from = shot.ballFrom;
  const to = shot.ballTo;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.hypot(dx, dz);
}

function getAverageSpeed(shot) {
  const initialKmh = getInitialSpeed(shot);
  if (initialKmh === 0) return 0;
  return Math.round(initialKmh * 0.6);
}

export function getFullDuration(shot) {
  if (!shot || shot.isSetup) return 1.0;
  // 3C-1：未吸附攔截點的回合結束拍 ballFrom/ballTo 可能為 null
  if (!shot.ballFrom || !shot.ballTo) return 1.0;

  const arcType = shot.arcType;
  const from = shot.ballFrom;
  const to = shot.ballTo;

  if (arcType === 'fast_press' || arcType === 'soft_press') {
    const dist = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const speedKmh = getInitialSpeed(shot);
    const speedMps = speedKmh / 3.6;
    const factor = arcType === 'fast_press' ? 0.3 : 0.15;
    let duration = dist / (speedMps * factor);
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

export function getShotDuration(shot) {
  if (!shot || shot.isSetup) return 1.0;

  const fullDur = getFullDuration(shot);

  // C3-4：手動吸附攔截點優先（與 getEffectiveEnd 對齊，消滅雙源）
  if (shot.interception && shot.interception.t !== undefined) {
    return Math.max(0.3, fullDur * shot.interception.t);
  }

  if (shot.hitPoint && shot.hitPoint.t !== undefined) {
    return Math.max(0.3, fullDur * shot.hitPoint.t);
  }

  return fullDur;
}

export function getTotalRallyDuration(shots) {
  let total = 0;
  for (let i = 1; i < shots.length; i++) {
    total += getShotDuration(shots[i]);
  }
  return Math.max(0.1, total);
}

export function getEffectiveEnd(shot) {
  if (!shot) return null;
  if (shot.interception && shot.interception.pt) return shot.interception.pt;
  if (shot.hitPoint) return shot.hitPoint;
  return shot.ballTo;
}

// ========== v0.5 回合制：新增函數 ==========

/**
 * v0.5：移動速度 = dist(移動方起點, 攔截點) / 球的飛行時間
 */
export function computeMoveSpeed(moverStartPos, interceptPoint, flightTime) {
  if (!moverStartPos || !interceptPoint || flightTime <= 0) return 99;
  const dist = Math.hypot(interceptPoint.x - moverStartPos.x, interceptPoint.z - moverStartPos.z);
  return dist / flightTime;
}

/**
 * v0.5：回動速度 = dist(回動方起點, 回中位置) / 上一拍球的飛行時間
 */
export function computeRecoverSpeed(recovererStartPos, recoverCenterPos, prevShotFlightTime) {
  if (!recovererStartPos || !recoverCenterPos || prevShotFlightTime <= 0) return 99;
  const dist = Math.hypot(recoverCenterPos.x - recovererStartPos.x, recoverCenterPos.z - recovererStartPos.z);
  return dist / prevShotFlightTime;
}

/**
 * v0.5 回合制：生成攔截點
 * 掃描球軌跡 t=0..1，返回所有符合以下條件的點：
 *   1. 在移動方半場（moverSide === 'A' → z >= 0.05；'B' → z <= -0.05）
 *   2. 高度 ≤ 3.0m（含 y=0.1 終點）
 *   3. 移動速度未超過 prevMoveSpeed × 3（封頂 5.4）
 * 每點含 { t, pt, height, level, moveSpeed, reachable }
 */
export function generateInterceptPoints(shot, moverStartPos, moverSide, prevMoveSpeed) {
  if (!shot || shot.isSetup || shot.pendingTo) return [];

  const duration = getFullDuration(shot);
  if (duration <= 0) return [];

  // 速度上限
  const accelCap = prevMoveSpeed * SPEED_BASELINE.ACCEL_MULTIPLIER;
  const speedCap = Math.min(accelCap, SPEED_BASELINE.GLOBAL_CAP);

  const STEP = 0.005;
  const points = [];

  for (let t = STEP; t <= 1.0; t += STEP) {
    const pt = getTrajectoryPoint(shot, t);

    // 規則 2：移動方半場
    const inMoverArea = moverSide === 'A' ? (pt.z >= 0.05) : (pt.z <= -0.05);
    if (!inMoverArea) continue;

    // 規則 3：高度 ≤ 3.0m；含 y=0.1 終點
    if (pt.y > 3.0) continue;
    if (pt.y < 0.05) continue;

    const flightTime = t * duration;
    const moveSpeed = computeMoveSpeed(moverStartPos, pt, flightTime);

    // 規則 6-7：超上限不生成；剛好 5.4 生成
    if (moveSpeed > speedCap + 1e-6) continue;

    const moveTime = Math.hypot(pt.x - moverStartPos.x, pt.z - moverStartPos.z) / Math.max(0.01, moveSpeed);
    const reachable = moveTime < flightTime;

    points.push({
      t: t,
      pt: { x: pt.x, y: pt.y, z: pt.z },
      height: pt.y,
      level: getHeightLevel(pt.y),
      moveSpeed: parseFloat(moveSpeed.toFixed(2)),
      reachable: reachable
    });
  }

  return points;
}

// ========== 診斷（v0.5 回合制優先，舊模型 fallback） ==========

export function checkPhysics(shot, shots, mode) {
  if (shot.isSetup) {
    return {
      valid: true,
      type: 'ok',
      msg: '調整發接發站位',
      stats: null
    };
  }
  if (shot.pendingTo) {
    return {
      valid: true,
      type: 'ok',
      msg: '點擊場地設定落點',
      stats: null
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

  const stats = {
    initialSpeed: initialSpeedKmh,
    averageSpeed: averageSpeedKmh,
    flightDistance: flightDist,
    flightTime: flightTime,
    netClearance: minNetHeight,
    playerMovements: null
  };

  // 過網高度檢查（保留）
  if (netPassed && minNetHeight < COURT.net_height) {
    return {
      valid: false,
      type: 'warn',
      msg: `⚠️ 過網太低（${minNetHeight.toFixed(2)}m）`,
      stats
    };
  }

  // v0.5 回合制診斷（新模型優先）
  if (shot.interceptPoints && shot.interceptPoints.length > 0) {
    const reachablePoints = shot.interceptPoints.filter(p => p.reachable);
    const speeds = shot.interceptPoints.map(p => p.moveSpeed);
    const maxSpeed = Math.max(...speeds);

    // 所有攔截點速度超限
    if (reachablePoints.length === 0 && maxSpeed > SPEED_BASELINE.GLOBAL_CAP + 1e-6) {
      return {
        valid: true,
        type: 'warn',
        msg: '⚠️ 所有攔截點速度超限，球落地',
        stats: { ...stats, maxMoveSpeed: maxSpeed, interceptCount: shot.interceptPoints.length }
      };
    }

    // 有可達點，但當前選中點速度超限
    const selectedIdx = shot.selectedInterceptIndex ?? 0;
    const selected = shot.interceptPoints[selectedIdx];
    if (selected && selected.moveSpeed > SPEED_BASELINE.GLOBAL_CAP + 1e-6) {
      return {
        valid: true,
        type: 'warn',
        msg: `⚠️ 移動速度超限：${selected.moveSpeed.toFixed(1)}m/s`,
        stats: { ...stats, maxMoveSpeed: maxSpeed, interceptCount: shot.interceptPoints.length }
      };
    }

    // 移動時間 ≥ 球抵達時間
    if (selected && !selected.reachable) {
      return {
        valid: true,
        type: 'warn',
        msg: '⚠️ 移動方來不及，球落地',
        stats: { ...stats, maxMoveSpeed: maxSpeed, interceptCount: shot.interceptPoints.length }
      };
    }

    return { valid: true, type: 'ok', msg: '✓ 物理正常', stats };
  }

  // --- 舊模型 fallback（無 interceptPoints） ---
  const playerMovements = {};
  let maxDefenderRequiredSpeed = 0;
  let maxDefenderId = null;
  let maxStrikerRequiredSpeed = 0;
  let maxStrikerId = null;

  const striker = shot.striker;
  const defender = striker === 'A' ? 'B' : 'A';

  const diagIdx = shots.indexOf(shot);
  const diagPrevShot = diagIdx > 0 ? shots[diagIdx - 1] : null;

  Object.entries(shot.players).forEach(([id, p]) => {
    const startPos = (diagPrevShot?.previewPositions?.[id])
      ? diagPrevShot.previewPositions[id]
      : p;
    let endPos = shot.previewPositions?.[id] || p;
    if (id.startsWith(defender) && shot.hitPoint) {
      endPos = { x: shot.hitPoint.x, z: shot.hitPoint.z };
    }
    const dist = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z);
    const reqSpeed = dist / Math.max(0.1, flightTime);

    playerMovements[id] = {
      distance: dist,
      requiredSpeed: reqSpeed,
      currentSpeed: p.speed || 3.0
    };

    if (id.startsWith(defender)) {
      if (reqSpeed > maxDefenderRequiredSpeed) {
        maxDefenderRequiredSpeed = reqSpeed;
        maxDefenderId = id;
      }
    }

    if (id.startsWith(striker)) {
      if ((p.speed || 3.0) > maxStrikerRequiredSpeed) {
        maxStrikerRequiredSpeed = p.speed || 3.0;
        maxStrikerId = id;
      }
    }
  });

  const oldStats = { ...stats, playerMovements };

  if (maxStrikerId && maxStrikerRequiredSpeed > LIMITS.playerMaxSpeed + 0.05) {
    return {
      valid: false,
      type: 'warn',
      msg: `⚠️ 回中速度超限：${maxStrikerId} ${maxStrikerRequiredSpeed.toFixed(1)}m/s`,
      stats: oldStats
    };
  }

  return { valid: true, type: 'ok', msg: '✓ 物理正常', stats: oldStats };
}

// ========== 高度分級 ==========

export function getHeightLevel(y) {
  if (y < 0.1) return 'invalid';
  if (y >= 2.0) return 'high';
  if (y >= 1.4) return 'mid';
  return 'low';
}
