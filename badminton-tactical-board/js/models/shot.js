import { COURT, ARC_TYPES, LIMITS } from '../config/constants.js';
import { getPlayers, getDefaultSetupPlayers, detectHitLevel, getOpponent, getTeamDirection } from './player.js';
import { getState, getShots, setShots, pushHistory } from '../core/state.js';
import { getTrajectoryPoint, getShotDuration } from '../core/physics.js';
import { deepClone, clamp } from '../utils/helpers.js';

// ========== 拍次操作 ==========

/**
 * 獲取弧線默認 Apex 高度
 */
export function getDefaultApexForArc(arcType, fromY, toY) {
  switch (arcType) {
    case 'high_arc': return 6.0;
    case 'mid_high_arc': return 4.0;
    case 'low_flat_arc': return 1.6;
    case 'fast_press': return Math.max(1.8, (fromY || 2.3));
    case 'soft_press': return Math.max(1.6, (fromY || 2.3));
    default: return 3.2;
  }
}

/**
 * 獲取弧線默認 Apex 位置 (0~1)
 */
export function getDefaultApexPosForArc(arcType) {
  switch (arcType) {
    case 'high_arc': return 0.85;
    case 'mid_high_arc': return 0.50;
    case 'low_flat_arc': return 0.50;
    case 'fast_press': return 0.10;
    case 'soft_press': return 0.10;
    default: return 0.50;
  }
}

/**
 * 自動匹配拍次屬性
 */
export function autoMatchShotProperties(shot, shots, mode, appMode) {
  if (shot.isSetup || shot.pendingTo) return;

  const idx = shots.indexOf(shot);

  // 第1拍：固定低位發球
  if (idx === 1) {
    shot.hitLevel = 'low';
    if (!shot.hitLevelOverride) {
      shot.ballFrom.y = LIMITS.serveHeight;
    }
  }

  // 正反手自動判斷
  if (!shot.forehandOverride) {
    if (shot.striker === 'A') {
      shot.forehand = (shot.ballTo.x >= 0);
    } else {
      shot.forehand = (shot.ballTo.x <= 0);
    }
  }

  // 腳本模式（原智能模式）：自動調整擊球高度
  if (appMode === 'smart' && !shot.hitLevelOverride && idx !== 1) {
    if (shot.arcType === 'fast_press' || shot.arcType === 'soft_press') {
      shot.hitLevel = 'high';
      shot.ballFrom.y = Math.max(2.3, shot.ballFrom.y || 2.3);
    } else {
      shot.hitLevel = detectHitLevel(shot.ballFrom.y);
    }
  }

  // 快壓/輕壓 必須高位
  if ((shot.hitLevel === 'mid' || shot.hitLevel === 'low') &&
      (shot.arcType === 'fast_press' || shot.arcType === 'soft_press')) {
    shot.arcType = 'mid_high_arc';
  }

  // 快壓/輕壓 固定 Apex
  if (ARC_TYPES[shot.arcType]?.isPress) {
    shot.apexHeight = getDefaultApexForArc(shot.arcType, shot.ballFrom.y, shot.ballTo.y);
    shot.apexPos = getDefaultApexPosForArc(shot.arcType);
  } else if (shot.apexPos === undefined) {
    shot.apexPos = getDefaultApexPosForArc(shot.arcType);
  }
}

/**
 * 智能定位 (腳本模式)
 */
export function applySmartPositions(shot, shots, mode, appMode) {
  if (appMode !== 'smart' || shot.isSetup || shot.pendingTo) return;

  const striker = shot.striker;
  const defender = getOpponent(striker);
  const players = getPlayers(mode);
  const strikerSide = getTeamDirection(striker);
  const defenderSide = getTeamDirection(defender);

  const strikerIds = players[striker] || [];
  strikerIds.forEach((id, pIdx) => {
    if (pIdx === 0) {
      shot.players[id] = { x: 0, z: strikerSide * 3.35, speed: shot.players[id]?.speed || 3.0 };
    } else {
      shot.players[id] = { x: pIdx === 1 ? -1.25 : 1.25, z: strikerSide * 4.5, speed: shot.players[id]?.speed || 3.0 };
    }
  });

  const defenderIds = players[defender] || [];
  if (defenderIds.length > 0) {
    shot.players[defenderIds[0]] = {
      x: shot.ballTo.x,
      z: shot.ballTo.z,
      speed: shot.players[defenderIds[0]]?.speed || 3.0
    };
    for (let i = 1; i < defenderIds.length; i++) {
      const coverX = shot.ballTo.x > 0 ? -1.25 : 1.25;
      shot.players[defenderIds[i]] = {
        x: coverX,
        z: defenderSide * 3.35,
        speed: shot.players[defenderIds[i]]?.speed || 3.0
      };
    }
  }

  // 計算速度
  const prevShotIndex = shots.indexOf(shot) - 1;
  const prevShot = prevShotIndex >= 0 ? shots[prevShotIndex] : null;

  if (prevShot) {
    const duration = getShotDuration(shot);
    Object.keys(shot.players).forEach(id => {
      const prevP = prevShot.players[id];
      const currP = shot.players[id];
      if (prevP && currP) {
        const dist = Math.hypot(currP.x - prevP.x, currP.z - prevP.z);
        let reqSpeed = dist / Math.max(0.15, duration);
        reqSpeed = clamp(reqSpeed, 1.0, 8.0);
        shot.players[id].speed = parseFloat(reqSpeed.toFixed(1));
      }
    });
  }
}

/**
 * 級聯更新球路位置
 */
export function cascadeBallPositions(fromIndex, shots, mode, appMode) {
  for (let i = Math.max(1, fromIndex); i < shots.length - 1; i++) {
    const prevShot = shots[i];
    const nextShot = shots[i + 1];
    if (prevShot.interception && prevShot.interception.pt) {
      nextShot.ballFrom = { ...prevShot.interception.pt };
    } else {
      nextShot.ballFrom = { ...prevShot.ballTo };
    }
    autoMatchShotProperties(nextShot, shots, mode, appMode);
    applySmartPositions(nextShot, shots, mode, appMode);
  }
}

/**
 * 更新第1拍發球方
 */
export function updateShot1Server(shots, mode) {
  if (shots.length <= 1) return;
  const serverTeam = shots[0].server || 'A';
  const shot1 = shots[1];
  shot1.striker = serverTeam;

  const players = getPlayers(mode);
  const pIds = players[serverTeam] || [];
  let closest = null, minZ = 999;

  pIds.forEach(id => {
    const p = shots[0].players[id];
    if (p && Math.abs(p.z) < minZ) {
      minZ = Math.abs(p.z);
      closest = p;
    }
  });

  if (closest) {
    shot1.ballFrom = { x: closest.x, y: LIMITS.serveHeight, z: closest.z };
  }
  cascadeBallPositions(1, shots, mode, 'smart');
}

/**
 * 獲取默認球員站位（用於新增拍時初始化）
 */
function getDefaultPlayerPositions(mode, striker, defender, prevShot) {
  const players = getPlayers(mode);
  const strikerSide = getTeamDirection(striker);
  const defenderSide = getTeamDirection(defender);
  const result = {};

  // 擊球方默認站位
  const strikerIds = players[striker] || [];
  strikerIds.forEach((id, pIdx) => {
    if (pIdx === 0) {
      result[id] = { x: 0, z: strikerSide * 3.35, speed: 3.0 };
    } else {
      result[id] = { x: pIdx === 1 ? -1.25 : 1.25, z: strikerSide * 4.5, speed: 3.0 };
    }
  });

  // 防守方默認站位
  const defenderIds = players[defender] || [];
  defenderIds.forEach((id, pIdx) => {
    if (pIdx === 0) {
      result[id] = { x: 0, z: defenderSide * 3.35, speed: 3.0 };
    } else {
      result[id] = { x: pIdx === 1 ? -1.25 : 1.25, z: defenderSide * 4.5, speed: 3.0 };
    }
  });

  return result;
}

/**
 * 創建新拍（修復版：確保球員不消失）
 */
export function newShot(index, shots, mode, appMode, prevShotData = null) {
  const prev = prevShotData || (index > 0 ? shots[index - 1] : null);
  const players = getPlayers(mode);

  const serverTeam = shots[0]?.server || 'A';
  let striker, defender;

  if (index === 0) {
    striker = 'A';
    defender = 'B';
  } else if (index === 1) {
    striker = serverTeam;
    defender = serverTeam === 'A' ? 'B' : 'A';
  } else {
    const prevStriker = prev ? prev.striker : 'A';
    striker = prevStriker === 'A' ? 'B' : 'A';
    defender = striker === 'A' ? 'B' : 'A';
  }

  let ballFrom, ballTo;
  if (index === 0) {
    ballFrom = { x: 1.25, y: LIMITS.serveHeight, z: 3.35 };
    ballTo = { x: 1.25, y: LIMITS.serveHeight, z: 3.35 };
  } else if (index === 1) {
    const setupShot = shots[0] || { players: {} };
    const pIds = players[serverTeam] || [];
    let closest = null, minZ = 999;
    pIds.forEach(id => {
      const p = setupShot.players[id];
      if (p && Math.abs(p.z) < minZ) { minZ = Math.abs(p.z); closest = p; }
    });
    ballFrom = closest ? { x: closest.x, y: LIMITS.serveHeight, z: closest.z } :
                         { x: 1.25, y: LIMITS.serveHeight, z: serverTeam === 'A' ? 3.35 : -3.35 };
    ballTo = { x: -1.25, y: 0.15, z: striker === 'A' ? -2.2 : 2.2 };
  } else {
    if (prev && prev.interception && prev.interception.pt) {
      ballFrom = { ...prev.interception.pt };
    } else {
      ballFrom = prev ? { ...prev.ballTo } : { x: 0, y: 1.55, z: 0 };
    }
    const defSideZ = striker === 'A' ? -4.5 : 4.5;
    ballTo = { x: 0, y: 0.1, z: defSideZ };
  }

  const initialArc = index === 1 ? 'low_flat_arc' : 'mid_high_arc';

  const shot = {
    isSetup: index === 0,
    pendingTo: false,
    server: index === 0 ? (shots[0]?.server || 'A') : undefined,
    striker: striker,
    hitLevel: index === 1 ? 'low' : 'high',
    hitLevelOverride: false,
    arcType: initialArc,
    apexHeight: getDefaultApexForArc(initialArc, ballFrom.y, ballTo.y),
    apexPos: getDefaultApexPosForArc(initialArc),
    forehand: true,
    forehandOverride: false,
    ballFrom: ballFrom,
    ballTo: ballTo,
    interception: null,
    players: {}
  };

  if (index === 0) {
    shot.players = getDefaultSetupPlayers(mode);
  } else {
    const isSmart = appMode === 'smart';
    const strikerSide = getTeamDirection(striker);

    // ***** 修復關鍵：確保 players 永遠有值 *****
    // 1. 先從上一拍複製球員數據（如果有）
    if (prev && prev.players) {
      Object.keys(prev.players).forEach(id => {
        shot.players[id] = { ...prev.players[id], speed: prev.players[id].speed || 3.0 };
      });
    }

    // 2. 確保所有當前模式下的球員都存在
    const allPlayerIds = [...(players[striker] || []), ...(players[defender] || [])];
    allPlayerIds.forEach(id => {
      if (!shot.players[id]) {
        // 如果沒有從上一拍複製到，使用默認站位
        const isStriker = id.startsWith(striker);
        const side = isStriker ? strikerSide : getTeamDirection(defender);
        const zBase = side * 3.35;
        shot.players[id] = { x: 0, z: zBase, speed: 3.0 };
      }
    });

    // 3. 如果是腳本模式，應用智能定位（覆蓋站位）
    if (isSmart) {
      applySmartPositions(shot, shots, mode, appMode);
    }
  }

  autoMatchShotProperties(shot, shots, mode, appMode);
  return shot;
}

/**
 * 初始化示範腳本 - 僅保留第0拍
 */
export function initDemo(shots, mode, appMode) {
  // 清空 shots
  shots.length = 0;

  // 僅創建第0拍（發接發站位）
  const s0 = newShot(0, shots, mode, appMode);
  s0.server = 'A';
  shots.push(s0);

  return shots;
}