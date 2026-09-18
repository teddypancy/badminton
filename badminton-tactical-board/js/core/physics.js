import { COURT, ARC_TYPES, LIMITS, SPEED_RANGES, PHYSICS } from '../config/constants.js';
import { getDefaultApexForArc, getDefaultApexPosForArc } from '../models/shot.js';
import { dist2D } from '../utils/helpers.js';
import { getPlayers } from '../models/player.js';

// ========== 物理引擎 v0.2b ==========

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

  const playerMovements = {};
  let maxDefenderRequiredSpeed = 0;
  let maxDefenderId = null;
  let maxStrikerRequiredSpeed = 0;
  let maxStrikerId = null;

  const striker = shot.striker;
  const defender = striker === 'A' ? 'B' : 'A';

  // 診斷與配速同源：起點以上一拍 previewPositions 優先（與 computeHitPoint/matchReceiverSpeed 同源）；
  // 接球方終點以攔截點水平座標為準（無攔截時為落點 preview），避免「速度不足」誤報。
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

  const stats = {
    initialSpeed: initialSpeedKmh,
    averageSpeed: averageSpeedKmh,
    flightDistance: flightDist,
    flightTime: flightTime,
    netClearance: minNetHeight,
    playerMovements
  };

  if ((shot.arcType === 'fast_press' || shot.arcType === 'soft_press') && shot.hitLevel !== 'high') {
    return {
      valid: false,
      type: 'warn',
      msg: `⚠️ 違背物理規律：${shot.hitLevel}位擊球無法進行${ARC_TYPES[shot.arcType].name}`,
      stats
    };
  }

  if (netPassed && minNetHeight < COURT.net_height) {
    return {
      valid: false,
      type: 'warn',
      msg: `⚠️ 過網太低（${minNetHeight.toFixed(2)}m）`,
      stats
    };
  }

  const SPEED_TOLERANCE = 0.05;

  if (maxStrikerId && maxStrikerRequiredSpeed > LIMITS.playerMaxSpeed + SPEED_TOLERANCE) {
    return {
      valid: false,
      type: 'warn',
      msg: `⚠️ 回中速度超限：${maxStrikerId} ${maxStrikerRequiredSpeed.toFixed(1)}m/s`,
      stats
    };
  }

  if (maxDefenderId) {
    if (maxDefenderRequiredSpeed > LIMITS.playerMaxSpeed + SPEED_TOLERANCE) {
      return {
        valid: false,
        type: 'warn',
        msg: `⚠️ 速度不足：${maxDefenderId} 需 ${maxDefenderRequiredSpeed.toFixed(1)}m/s（上限 ${LIMITS.playerMaxSpeed.toFixed(1)}）`,
        stats
      };
    }

    if (maxDefenderRequiredSpeed > (shot.players[maxDefenderId]?.speed || 3.0) + SPEED_TOLERANCE) {
      return {
        valid: false,
        type: 'warn',
        msg: `⚠️ 速度不足：${maxDefenderId} 需 ${maxDefenderRequiredSpeed.toFixed(1)}m/s`,
        stats
      };
    }
  }

  // v0.2b：高/中帶不可達常駐診斷
  // 下一拍宣告的 hitLevel 若超出此球路在守方半場可達的高度帶，
  // matchReceiverSpeed 已自動降級配速（宣告保留不動），此處常駐提示取代「✓ 物理正常」。
  const shotIdx = shots.indexOf(shot);
  const nextShot = (shotIdx >= 0 && shotIdx < shots.length - 1) ? shots[shotIdx + 1] : null;
  if (nextShot && !nextShot.isSetup && !nextShot.pendingTo) {
    const targetLevel = nextShot.hitLevel;
    const highDeadline = targetLevel === 'high' ? findBandDeadline(shot, 'high') : null;
    const midDeadline = (targetLevel === 'high' || targetLevel === 'mid')
      ? findBandDeadline(shot, 'mid') : null;

    if (targetLevel === 'high' && !highDeadline) {
      // 壓制球（快壓/輕壓）過網即低於 2.0m，高位物理上不存在——訊息特化點出原因
      const isPressShot = shot.arcType === 'fast_press' || shot.arcType === 'soft_press';

      // v0.2c G1：mid 帶幾何存在（midDeadline 非 null）但帶內所有點 clamp 8.0 仍不可達
      // → findInterception 限 [1.4, 2.0] 返回 null → hitPoint=null 球落地，
      // 補強診斷取代「已按中位配速」，避免用戶誤以為中位攔截成功
      if (midDeadline) {
        const diagDefenderId = (getPlayers(mode)['B'] || getPlayers(mode)['A'] || [])[0];
        if (diagDefenderId) {
          const diagPrevShot = shotIdx > 0 ? shots[shotIdx - 1] : null;
          const diagStartPos = (diagPrevShot?.previewPositions?.[diagDefenderId])
            ? diagPrevShot.previewPositions[diagDefenderId]
            : (shot.players?.[diagDefenderId] || diagPrevShot?.players?.[diagDefenderId]);
          if (diagStartPos) {
            const maxSpeedHit = findInterception(shot, diagStartPos, 8.0, 1.4, 2.0);
            if (!maxSpeedHit) {
              return {
                valid: true,
                type: 'warn',
                msg: isPressShot
                  ? '⚠️ 快壓球不可選高位：中位攔截亦不可達，球落地'
                  : '⚠️ 高位不可達、中位攔截亦不可達：速度上限 8.0m/s 無法攔截，球落地',
                stats
              };
            }
          }
        }
      }

      return {
        valid: true,
        type: 'warn',
        msg: isPressShot
          ? (midDeadline
              ? '⚠️ 快壓球不可選高位：過網即低於 2.0m，已按中位配速'
              : '⚠️ 快壓球不可選高位：中位亦不可達，已按低位配速（球落地）')
          : (midDeadline
              ? '⚠️ 高位不可達：此球路過網後無法在 2.0m 以上攔截，已按中位配速'
              : '⚠️ 高位不可達：中位亦不可達，已按低位配速（球落地）'),
        stats
      };
    }

    if (targetLevel === 'mid' && !midDeadline) {
      return {
        valid: true,
        type: 'warn',
        msg: '⚠️ 中位不可達：已按低位配速（球落地）',
        stats
      };
    }

    // v0.2c：mid 帶幾何存在（deadline 非 null）但帶內所有點 player clamp 8.0 仍不可達
    // → findInterception 限 [1.4, 2.0] 返回 null → hitPoint=null 球落地，
    // 診斷不會顯示「中位不可達」（因 midDeadline 存在），需額外提示避免無說明的球落地行為
    if (targetLevel === 'mid' && midDeadline) {
      const diagDefenderId = (getPlayers(mode)['B'] || getPlayers(mode)['A'] || [])[0];
      if (diagDefenderId) {
        const diagPrevShot = shotIdx > 0 ? shots[shotIdx - 1] : null;
        const diagStartPos = (diagPrevShot?.previewPositions?.[diagDefenderId])
          ? diagPrevShot.previewPositions[diagDefenderId]
          : (shot.players?.[diagDefenderId] || diagPrevShot?.players?.[diagDefenderId]);
        if (diagStartPos) {
          const maxSpeedHit = findInterception(shot, diagStartPos, 8.0, 1.4, 2.0);
          if (!maxSpeedHit) {
            return {
              valid: true,
              type: 'warn',
              msg: '⚠️ 中位攔截不可達：速度上限 8.0m/s 無法在中帶攔截',
              stats
            };
          }
        }
      }
    }
  }

  return {
    valid: true,
    type: 'ok',
    msg: '✓ 物理正常',
    stats
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

      if (isDefenderArea && pt.y >= LIMITS.INTERCEPT_Y_MIN && pt.y <= LIMITS.INTERCEPT_Y_MAX) {
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

// ========== v0.2b：擊球點計算核心 ==========

export function getHeightLevel(y) {
  if (y < 0.1) return 'invalid';
  if (y >= 2.0) return 'high';
  if (y >= 1.4) return 'mid';
  return 'low';
}

/**
 * v0.2b：攔截點求解（純粹化）
 * 輸入只有：球軌跡、接球方起點 startPos、接球方速度 speed、帶位範圍 [minBallY, maxBallY]。
 * 掃描軌跡，取「最早」滿足以下全部條件的 t：
 *   1. 球高度在 [minBallY, maxBallY] 區間（預設 [1.4, 3.0]；壓制球低位攔截傳 [0.1, 3.0]；
 *      宣告 high 傳 [2.0, 3.0]、宣告 mid 傳 [1.4, 2.0]——帶位忠實）
 *   2. 球在守方半場（已過網）
 *   3. 接球方可達：dist(startPos, 球位置) / speed ≤ t × 全程時間
 * 無解回傳 null（呼叫端以 ballTo 作為有效結束點，球落地結束本拍）。
 */
export function findInterception(shot, startPos, speed, minBallY = 1.4, maxBallY = 3.0) {
  if (!shot || shot.isSetup || shot.pendingTo) return null;
  if (!startPos || !speed || speed <= 0) return null;

  const duration = getFullDuration(shot);
  if (duration <= 0) return null;

  const defenderSide = shot.striker === 'A' ? 'B' : 'A';
  const MIN_BALL_Y = minBallY;
  const MAX_BALL_Y = maxBallY;
  const STEP = 0.005;

  for (let t = 0; t <= 1.0; t += STEP) {
    const ballPos = getTrajectoryPoint(shot, t);
    if (ballPos.y < MIN_BALL_Y || ballPos.y > MAX_BALL_Y) continue;

    // 只能在守方半場攔截（過網之後）
    const isDefenderArea = defenderSide === 'A' ? (ballPos.z >= -0.1) : (ballPos.z <= 0.1);
    if (!isDefenderArea) continue;

    const dist = Math.hypot(ballPos.x - startPos.x, ballPos.z - startPos.z);
    const flightTime = t * duration;
    const playerTime = dist / speed;

    if (playerTime <= flightTime) {
      return {
        t: t,
        time: flightTime,
        pt: { x: ballPos.x, y: ballPos.y, z: ballPos.z },
        height: ballPos.y,
        level: getHeightLevel(ballPos.y),
        distance: dist,
        playerPos: { x: startPos.x, z: startPos.z }
      };
    }
  }
  return null;
}

/**
 * v0.2b：求目標高度帶的「截止時刻」
 * 高位 → 球在守方半場下降穿過 2.0m 的時刻；中位 → 下降穿過 1.4m 的時刻。
 * 回傳 { t, pt }（t 為 0-1 正規化，pt 為當時球位置）；
 * 球在守方半場到不了該高度（過網前已低於下緣）時回 null。
 * 供 matchReceiverSpeed 以「球到達攔截點的時間」反求接球方所需速度。
 */
export function findBandDeadline(shot, targetLevel) {
  if (!shot || shot.isSetup || shot.pendingTo) return null;
  const hMin = targetLevel === 'high' ? 2.0 : (targetLevel === 'mid' ? 1.4 : null);
  if (hMin === null) return null;

  const defenderSide = shot.striker === 'A' ? 'B' : 'A';
  const STEP = 0.005;

  for (let t = 1.0; t >= 0; t -= STEP) {
    const ballPos = getTrajectoryPoint(shot, t);
    const isDefenderArea = defenderSide === 'A' ? (ballPos.z >= -0.1) : (ballPos.z <= 0.1);
    if (isDefenderArea && ballPos.y >= hMin) {
      return { t: t, pt: { x: ballPos.x, y: ballPos.y, z: ballPos.z } };
    }
  }
  return null;
}
