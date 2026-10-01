import { LIMITS, SPEED_BASELINE } from '../config/constants.js';
import { getPlayers, getDefaultSetupPlayers, getTeamDirection } from './player.js';
import { getState, getShots } from '../core/state.js';
import {
  getFullDuration,
  getEffectiveEnd,
  generateInterceptPoints,
  computeRecoverSpeed
} from '../core/physics.js';
import { clamp } from '../utils/helpers.js';

// ========== 拍次操作 ==========

export function getDefaultApexForArc(arcType, fromY, toY) {
  switch (arcType) {
    case 'high_arc': return 6.0;
    case 'mid_high_arc': return 4.0;
    case 'low_flat_arc': return 1.7;
    case 'fast_press': return Math.max(1.8, (fromY || 2.3));
    case 'soft_press': return Math.max(1.6, (fromY || 2.3));
    default: return 3.2;
  }
}

export function getDefaultApexPosForArc(arcType) {
  switch (arcType) {
    case 'high_arc': return 0.90;
    case 'mid_high_arc': return 0.70;
    case 'low_flat_arc': return 0.50;
    case 'fast_press': return 0.10;
    case 'soft_press': return 0.10;
    default: return 0.50;
  }
}

/**
 * 將攔截點轉為 shot.hitPoint 資料格式
 * 頂層必須有 x/y/z/t（getEffectiveEnd 會把它當點用）
 */
function toHitPointData(hit) {
  if (!hit || !hit.pt) return null;
  return {
    x: hit.pt.x,
    y: hit.pt.y,
    z: hit.pt.z,
    t: hit.t,
    time: (hit.time !== undefined) ? hit.time : null,
    height: hit.height,
    level: hit.level,
    moveSpeed: hit.moveSpeed,
    reachable: hit.reachable
  };
}

// ========== v0.5 回合制：computeHitPoint ==========
// 重寫：依 selectedInterceptIndex 回傳本拍選中的攔截點。
// 舊呼叫端仍傳第三參數 declaredLevel（main.js / interactions.js），此參數 v0.5 不再使用，
// 保留函數簽名僅為向後相容，避免外部 import 炸掉。

export function computeHitPoint(shot, prevShot, declaredLevel /* deprecated in v0.5 */) {
  if (!shot || shot.isSetup || shot.pendingTo) return null;
  if (!shot.interceptPoints || shot.interceptPoints.length === 0) return null;

  const selectedIdx = shot.selectedInterceptIndex ?? 0;
  const hit = shot.interceptPoints[selectedIdx];
  if (!hit) return null;
  return toHitPointData(hit);
}

// ========== v0.5 回合制：autoMatchShotProperties ==========

export function autoMatchShotProperties(shot, shots, mode, appMode) {
  if (shot.isSetup || shot.pendingTo) return;

  const idx = shots.indexOf(shot);

  // 第 1 拍（發球）：擊球高度固定低位
  if (idx === 1) {
    shot.hitLevel = 'low';
    if (!shot.hitLevelOverride) {
      shot.ballFrom.y = LIMITS.serveHeight;
    }
  }

  // 擊球姿態依來球方向默認判定（v0.5 新增）：
  // 球在右（ballTo.x > ballFrom.x）＝正手；球在左＝反手
  // striker=A 時，A 隊擊球，來球方向看 ballTo 相對 ballFrom 的 x 偏移
  // striker=B 時反之
  if (!shot.forehandOverride) {
    const ballMovingRight = shot.ballTo.x >= shot.ballFrom.x;
    shot.forehand = ballMovingRight;
  }

  // v0.5：不再依下一拍宣告 hitLevel 決定本拍 arcType 或 apex
  // 擊球高度依攔截點實際值（由 matchRoundSpeeds 寫入 shot.interceptPoints 的 height 欄位）

  if (!shot.apexOverride) {
    shot.apexHeight = getDefaultApexForArc(shot.arcType, shot.ballFrom.y, shot.ballTo.y);
    shot.apexPos = getDefaultApexPosForArc(shot.arcType);
  }
}

// ========== v0.5 回合制：matchRoundSpeeds（新）+ matchReceiverSpeed（舊 wrapper） ==========

/**
 * v0.5 回合制：統一配速入口
 * 規則：
 *   - 移動速度 = dist(移動方起點, 攔截點) / 球的飛行時間
 *   - 速度上限 = 上一拍移動速度 × 3，封頂 5.4 m/s
 *   - 生成所有可達攔截點（含 y=0.1 終點）
 *   - 預設選中第一個 reachable 點
 *   - 回動速度 = dist(回動方起點, 回中位置) / 上一拍球的飛行時間
 */
export function matchRoundSpeeds(shot, shots) {
  if (!shot || shot.isSetup || shot.pendingTo) return null;

  shot.interception = null;

  const idx = shots.indexOf(shot);
  if (idx < 0) return null;

  const state = getState();
  const players = getPlayers(state.mode);

  // 第 1 拍：無速度，基準 1.0
  // 第 2 拍起：prevMoveSpeed = 上一拍 moveSpeed
  const prevMoveSpeed = idx >= 2
    ? (shots[idx - 1]?.moveSpeed || SPEED_BASELINE.FIRST_SHOT)
    : SPEED_BASELINE.FIRST_SHOT;

  // 本拍 mover / recoverer
  const mover = shot.mover;
  const recoverer = shot.recoverer;
  if (!mover || !recoverer) return null;

  const moverSide = mover; // moverSide 與 mover 同名（'A' | 'B'）
  const moverIds = players[mover] || [];
  if (moverIds.length === 0) return null;

  const moverId = moverIds[0];
  const prevShot = idx > 0 ? shots[idx - 1] : null;

  // 移動方起點：上一拍結束位置優先
  const moverStartPos = (prevShot?.previewPositions?.[moverId])
    ? prevShot.previewPositions[moverId]
    : (shot.players?.[moverId] || prevShot?.players?.[moverId]);

  if (!moverStartPos) return null;

  // 生成攔截點
  const interceptPoints = generateInterceptPoints(shot, moverStartPos, moverSide, prevMoveSpeed);
  shot.interceptPoints = interceptPoints;

  // 預設選中第一個 reachable 點；若全不可達則選第一個（診斷會顯示來不及）
  let selectedIdx = 0;
  for (let i = 0; i < interceptPoints.length; i++) {
    if (interceptPoints[i].reachable) { selectedIdx = i; break; }
  }
  shot.selectedInterceptIndex = selectedIdx;

  // 寫入 moveSpeed
  const selected = interceptPoints[selectedIdx];
  shot.moveSpeed = selected ? selected.moveSpeed : null;

  // 寫入 hitPoint（v0.5：hitPoint 等同選中的攔截點）
  shot.hitPoint = computeHitPoint(shot, prevShot);

  // 回動速度：dist(回動方起點, 回中位置) / 上一拍球的飛行時間
  let recoverSpeed = null;
  if (idx >= 2) {
    const prevShotForRecover = shots[idx - 1];
    const recovererIds = players[recoverer] || [];
    if (recovererIds.length > 0) {
      const recovererId = recovererIds[0];
      const recovererStartPos = (prevShot?.previewPositions?.[recovererId])
        ? prevShot.previewPositions[recovererId]
        : (shot.players?.[recovererId] || prevShot?.players?.[recovererId]);
      const recoverCenterPos = { x: 0, z: getTeamDirection(recoverer) * 3.35 };
      const prevFlightTime = getFullDuration(prevShotForRecover);
      if (recovererStartPos && prevFlightTime > 0) {
        recoverSpeed = parseFloat(computeRecoverSpeed(recovererStartPos, recoverCenterPos, prevFlightTime).toFixed(2));
        recoverSpeed = clamp(recoverSpeed, SPEED_BASELINE.NORMAL_MIN, SPEED_BASELINE.GLOBAL_CAP);
      }
    }
  }
  shot.recoverSpeed = recoverSpeed;

  // 寫入 player speed（供 render/diagnosis 用，v0.5 不再由外部呼叫 speedOverride 判定）
  if (shot.players[moverId]) {
    shot.players[moverId].speed = shot.moveSpeed || shot.players[moverId].speed || SPEED_BASELINE.FIRST_SHOT;
  }

  applySmartPositions(shot, shots, state.mode, state.appMode);

  return {
    adjusted: true,
    shotIndex: idx,
    moverId: moverId,
    moveSpeed: shot.moveSpeed,
    recoverSpeed: shot.recoverSpeed,
    interceptCount: interceptPoints.length,
    selectedIndex: selectedIdx,
    degraded: null  // 舊欄位保留（v0.5 無降級配速概念）
  };
}

// deprecated wrapper：舊代碼仍 import matchReceiverSpeed（main.js / interactions.js）
// 直接指向新函數，確保外部呼叫不會炸掉
export const matchReceiverSpeed = matchRoundSpeeds;

// ========== v0.5 回合制：applySmartPositions ==========
// 修改：移除「接球方永遠吸附落點」邏輯；
// 移動方回中位置依 moverSide；回動方回中位置本階段先設預設值，3B 再引導。

export function applySmartPositions(shot, shots, mode, appMode) {
  if (appMode !== 'smart' || shot.isSetup || shot.pendingTo) return;

  const players = getPlayers(mode);
  const mover = shot.mover;
  const recoverer = shot.recoverer;

  if (!shot.previewPositions) shot.previewPositions = {};

  // 擊球方（本拍 striker）回中位置 — 保留 v0.3 邏輯
  const striker = shot.striker;
  const strikerSide = getTeamDirection(striker);
  const strikerIds = players[striker] || [];
  strikerIds.forEach((id, pIdx) => {
    if (pIdx === 0) {
      shot.previewPositions[id] = { x: 0, z: strikerSide * 3.35 };
    } else {
      shot.previewPositions[id] = { x: pIdx === 1 ? -1.25 : 1.25, z: strikerSide * 4.5 };
    }
  });

  // 移動方（本拍 mover）位置：上一拍回動後位置，或預設回中間區域
  if (mover) {
    const moverIds = players[mover] || [];
    const moverSide = getTeamDirection(mover);
    const prevIdx = shots.indexOf(shot) - 1;
    const prevShot = prevIdx >= 0 ? shots[prevIdx] : null;

    moverIds.forEach((id, pIdx) => {
      let pos;
      if (prevShot?.previewPositions?.[id]) {
        pos = prevShot.previewPositions[id];
      } else if (shot.players?.[id]) {
        pos = shot.players[id];
      } else {
        pos = { x: pIdx === 0 ? 0 : (pIdx === 1 ? -1.25 : 1.25), z: moverSide * 3.35 };
      }
      shot.previewPositions[id] = pos;
    });
  }

  // 回動方（本拍 recoverer）回中位置 — 本階段先設預設值，3B 再引導
  if (recoverer) {
    const recovererIds = players[recoverer] || [];
    const recovererSide = getTeamDirection(recoverer);
    recovererIds.forEach((id, pIdx) => {
      shot.previewPositions[id] = {
        x: pIdx === 0 ? 0 : (pIdx === 1 ? -1.25 : 1.25),
        z: recovererSide * 3.35
      };
    });
  }
}

// ========== v0.5 回合制：recalculateRecoverSpeed ==========
// 重寫：回動速度 = dist(回動方起點, 回中位置) / 上一拍球的飛行時間

export function recalculateRecoverSpeed(shot, mode, appMode) {
  if (appMode !== 'smart' || shot.isSetup || shot.pendingTo) return;
  if (!shot.previewPositions) return;

  const idx = getShots().indexOf(shot);
  if (idx < 2) return; // 第 1 拍 recoverSpeed = null

  const prevShot = getShots()[idx - 1];
  const recoverer = shot.recoverer;
  if (!recoverer) return;

  const players = getPlayers(mode);
  const recovererIds = players[recoverer] || [];
  const prevFlightTime = getFullDuration(prevShot);
  if (prevFlightTime <= 0) return;

  recovererIds.forEach((id) => {
    const startPos = prevShot?.previewPositions?.[id] || shot.players?.[id];
    const centerPos = shot.previewPositions?.[id]; // 已由 applySmartPositions 設好回中位置
    if (!startPos || !centerPos) return;

    const rawSpeed = computeRecoverSpeed(startPos, centerPos, prevFlightTime);
    const clamped = clamp(rawSpeed, SPEED_BASELINE.NORMAL_MIN, SPEED_BASELINE.GLOBAL_CAP);
    shot.recoverSpeed = parseFloat(clamped.toFixed(2));
  });
}

// deprecated wrapper：舊代碼仍 import recalculateSpeeds（interactions.js）
export const recalculateSpeeds = recalculateRecoverSpeed;

// ========== v0.5 回合制：級聯更新 ==========
// 語義：下一拍起點 = 上一拍擊球點（選中的攔截點）
// getEffectiveEnd 邏輯不變（先看 interception → hitPoint → ballTo），
// 級聯後重算攔截點（呼叫 matchRoundSpeeds）

export function cascadeBallPositions(fromIndex, shots, mode, appMode) {
  for (let i = Math.max(1, fromIndex); i < shots.length - 1; i++) {
    const prevShot = shots[i];
    const nextShot = shots[i + 1];

    // 下一拍起點 = 上一拍選中的攔截點（或 ballTo）
    const effectiveEnd = getEffectiveEnd(prevShot);
    nextShot.ballFrom = { ...effectiveEnd };

    // 上一拍結束時的球員位置 → 下一拍起始位置
    if (prevShot.previewPositions) {
      Object.keys(prevShot.previewPositions).forEach(id => {
        if (nextShot.players[id]) {
          nextShot.players[id].x = prevShot.previewPositions[id].x;
          nextShot.players[id].z = prevShot.previewPositions[id].z;
        }
      });
    }

    // v0.5：級聯後角色交替（mover / recoverer）
    nextShot.mover = prevShot.recoverer;
    nextShot.recoverer = prevShot.mover;

    autoMatchShotProperties(nextShot, shots, mode, appMode);

    // 重算攔截點（v0.5：呼叫 matchRoundSpeeds）
    matchRoundSpeeds(nextShot, shots);
  }
}

// ========== updateShot1Server（保留不動） ==========

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

// ========== v0.5 回合制：newShot ==========

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

  // v0.5：角色交替邏輯
  let mover = null, recoverer = null;
  if (index === 0) {
    mover = null; recoverer = null;
  } else if (index === 1) {
    // v0.5 3C-1 修正（取代 3B 版本）：
    // mover = 發球方（形式指派，不設移動值）
    // recoverer = 接球方（形式指派，不設回動值）
    mover = serverTeam;                        // 發球方
    recoverer = serverTeam === 'A' ? 'B' : 'A'; // 接球方
  } else {
    // 第 2 拍起：mover = 上一拍 recoverer；recoverer = 上一拍 mover
    mover = prev ? prev.recoverer : (striker === 'A' ? 'B' : 'A');
    recoverer = prev ? prev.mover : striker;
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
    ballTo = { x: -1.25, y: 0.1, z: striker === 'A' ? -2.2 : 2.2 };
  } else {
    if (prev) {
      const prevEffectiveEnd = getEffectiveEnd(prev);
      ballFrom = { ...prevEffectiveEnd };
    } else {
      ballFrom = { x: 0, y: 1.55, z: 0 };
    }
    const defSideZ = striker === 'A' ? -4.5 : 4.5;
    ballTo = { x: 0, y: 0.1, z: defSideZ };
  }

  const initialArc = index === 1 ? 'low_flat_arc' : 'mid_high_arc';

  const shot = {
    // v0.3 既有欄位（全部保留）
    isSetup: index === 0,
    pendingTo: false,
    server: index === 0 ? (shots[0]?.server || 'A') : undefined,
    striker: striker,
    hitLevel: index === 1 ? 'low' : 'high',
    hitLevelOverride: false,
    arcType: initialArc,
    apexHeight: getDefaultApexForArc(initialArc, ballFrom.y, ballTo.y),
    apexPos: getDefaultApexPosForArc(initialArc),
    apexOverride: false,
    forehand: true,
    forehandOverride: false,
    ballFrom: ballFrom,
    ballTo: ballTo,
    hitPoint: null,
    interception: null,
    players: {},
    previewPositions: {},
    // v0.5 回合制新增欄位
    mover: mover,
    recoverer: recoverer,
    moveSpeed: null,           // 第 1 拍為 null，第 2 拍起由 matchRoundSpeeds 寫入
    recoverSpeed: null,        // 第 1 拍為 null
    interceptPoints: [],       // 第 1 拍為空，第 2 拍起由 matchRoundSpeeds 寫入
    selectedInterceptIndex: null
  };

  if (index === 0) {
    shot.players = getDefaultSetupPlayers(mode);
    shot.previewPositions = null;
  } else {
    const isSmart = appMode === 'smart';
    const strikerSide = getTeamDirection(striker);
    const defenderSide = getTeamDirection(defender);

    if (index === 1) {
      const setupShot = shots[0];
      if (setupShot && setupShot.players) {
        Object.keys(setupShot.players).forEach(id => {
          shot.players[id] = {
            x: setupShot.players[id].x,
            z: setupShot.players[id].z,
            speed: setupShot.players[id].speed || 2.0
          };
        });
      }
    } else {
      if (prev && prev.previewPositions) {
        Object.keys(prev.previewPositions).forEach(id => {
          shot.players[id] = {
            x: prev.previewPositions[id].x,
            z: prev.previewPositions[id].z,
            speed: prev.players[id]?.speed || 2.0
          };
        });
      }
    }

    const allPlayerIds = [...(players[striker] || []), ...(players[defender] || [])];
    allPlayerIds.forEach(id => {
      if (!shot.players[id]) {
        const isStriker = id.startsWith(striker);
        const side = isStriker ? strikerSide : defenderSide;
        shot.players[id] = { x: 0, z: side * 3.35, speed: 2.0 };
      }
    });

    const strikerIds = players[striker] || [];
    strikerIds.forEach((id, pIdx) => {
      if (pIdx === 0) {
        shot.previewPositions[id] = { x: 0, z: strikerSide * 3.35 };
      } else {
        shot.previewPositions[id] = { x: pIdx === 1 ? -1.25 : 1.25, z: strikerSide * 4.5 };
      }
    });

    const defenderIds = players[defender] || [];
    defenderIds.forEach((id, pIdx) => {
      if (pIdx === 0) {
        shot.previewPositions[id] = { x: ballTo.x, z: ballTo.z };
      } else {
        const coverX = ballTo.x > 0 ? -1.25 : 1.25;
        shot.previewPositions[id] = { x: coverX, z: defenderSide * 3.35 };
      }
    });

    if (isSmart) {
      applySmartPositions(shot, shots, mode, appMode);
    }
  }

  autoMatchShotProperties(shot, shots, mode, appMode);

  // 第 2 拍起立即跑 matchRoundSpeeds 生成攔截點 + 寫入 moveSpeed
  // 注意：此時 shot 尚未 push 到 shots，需用暫存陣列讓 indexOf 與 prevShot 正確
  if (index >= 2 && appMode === 'smart') {
    const tempShots = [...shots, shot];
    matchRoundSpeeds(shot, tempShots);
  }

  return shot;
}

// ========== initDemo（保留不動） ==========

export function initDemo(shots, mode, appMode) {
  shots.length = 0;

  const s0 = newShot(0, shots, mode, appMode);
  s0.server = 'A';
  shots.push(s0);

  return shots;
}
