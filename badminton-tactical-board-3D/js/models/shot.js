import { COURT, ARC_TYPES, LIMITS } from '../config/constants.js';
import { getPlayers, getDefaultSetupPlayers, detectHitLevel, getOpponent, getTeamDirection } from './player.js';
import { getState, getShots, setShots, pushHistory } from '../core/state.js';
import { getFullDuration, findInterception, findBandDeadline, getEffectiveEnd } from '../core/physics.js';
import { deepClone, clamp } from '../utils/helpers.js';

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
 * v0.2b：將 findInterception 的結果轉為 shot.hitPoint 資料格式
 * 頂層必須有 x/y/z（getEffectiveEnd 會把它當點用）與 t（getShotDuration / 3D 動畫用）
 */
function toHitPointData(hit) {
  if (!hit || !hit.pt) return null;
  return {
    x: hit.pt.x,
    y: hit.pt.y,
    z: hit.pt.z,
    t: hit.t,
    time: hit.time,
    height: hit.height,
    level: hit.level
  };
}

/**
 * v0.2b：計算擊球點（攔截點）
 * 輸入只有：球軌跡、接球方起點、接球方速度（智能匹配寫回或使用者手動設定）。
 * declaredLevel：宣告帶位（high/mid/low），決定 findInterception 的高度帶範圍：
 *   high → [2.0, 3.0]  mid → [1.4, 2.0]  low → [0.1, 3.0]（壓制球低位攔截寬帶）。
 *   弧線球 + low 宣告不會到這裡（matchReceiverSpeed / cascade 已置 null）。
 * 找不到可達攔截點時回 null，呼叫端以 ballTo 作為有效結束點、球落地結束本拍。
 */
export function computeHitPoint(shot, prevShot, declaredLevel = 'high') {
  if (!shot || shot.isSetup || shot.pendingTo) return null;

  const striker = shot.striker;
  const defender = striker === 'A' ? 'B' : 'A';
  const players = getPlayers(getState().mode);
  const defenderIds = players[defender] || [];
  if (defenderIds.length === 0) return null;

  const defenderId = defenderIds[0];

  // 起點：優先上一拍結束時的位置（回中後 previewPositions），
  // 其次本拍 players（拍次開始時位置），最後上一拍 players
  const startPos = (prevShot?.previewPositions?.[defenderId])
    ? prevShot.previewPositions[defenderId]
    : (shot.players?.[defenderId] || prevShot?.players?.[defenderId]);

  if (!startPos) return null;

  // 接球方速度（智能匹配或使用者手動設定），不在此處寫回
  const speed = shot.players?.[defenderId]?.speed || 3.0;

  // 帶位映射：declaredLevel → [minBallY, maxBallY]（帶位忠實）
  let minBallY, maxBallY;
  if (declaredLevel === 'high') {
    minBallY = 2.0; maxBallY = 3.0;
  } else if (declaredLevel === 'mid') {
    minBallY = 1.4; maxBallY = 2.0;
  } else { // 'low' — 壓制球低位攔截用；弧線球 + low 宣告不會到這裡
    minBallY = 0.1; maxBallY = 3.0;
  }

  const hit = findInterception(shot, startPos, speed, minBallY, maxBallY);

  return toHitPointData(hit);
}

export function autoMatchShotProperties(shot, shots, mode, appMode) {
  if (shot.isSetup || shot.pendingTo) return;

  const idx = shots.indexOf(shot);

  if (idx === 1) {
    shot.hitLevel = 'low';
    if (!shot.hitLevelOverride) {
      shot.ballFrom.y = LIMITS.serveHeight;
    }
  }

  if (!shot.forehandOverride) {
    if (shot.striker === 'A') {
      shot.forehand = (shot.ballTo.x >= 0);
    } else {
      shot.forehand = (shot.ballTo.x <= 0);
    }
  }

  if (appMode === 'smart' && !shot.hitLevelOverride && idx !== 1) {
    if (shot.arcType === 'fast_press' || shot.arcType === 'soft_press') {
      shot.hitLevel = 'high';
      shot.ballFrom.y = Math.max(2.3, shot.ballFrom.y || 2.3);
    } else {
      shot.hitLevel = detectHitLevel(shot.ballFrom.y);
    }
  }

  if ((shot.hitLevel === 'mid' || shot.hitLevel === 'low') &&
      (shot.arcType === 'fast_press' || shot.arcType === 'soft_press')) {
    shot.arcType = 'mid_high_arc';
  }

  if (!shot.apexOverride) {
    shot.apexHeight = getDefaultApexForArc(shot.arcType, shot.ballFrom.y, shot.ballTo.y);
    shot.apexPos = getDefaultApexPosForArc(shot.arcType);
  }
}

/**
 * v0.2b：統一智能匹配入口（對指定拍 S 操作）
 * 規則：第 S 拍接球方的速度，由第 S+1 拍宣告的 hitLevel 決定
 * （第 S+1 拍的 hitLevel = 其擊球高度 = 第 S 拍攔截點的高度）：
 *   - high：截止時刻 = 球在守方半場下降穿過 2.0m，速度 = dist(起點, 球位置) / (t × 全程T)
 *   - mid ：截止時刻 = 球在守方半場下降穿過 1.4m
 *   - low ：球落地，走路速度 = dist(起點, 落點) / 全程T
 * 因為高位截止時刻早於中位、中位早於落地，所需速度天然保持 高 ≥ 中 ≥ 低。
 * 最後一拍（無下一拍）不做速度匹配，只重算攔截點與站位。
 * 觸發時機：改 hitLevel（作用於前一拍）、拖終點、改弧度、改 Apex、吸附到球軌跡終點。
 * 手動吸附攔截點 / 手動調速不經過此函數（手動覆蓋優先）。
 *
 * v0.2c：effLevel（實際配速依據）與宣告帶位脫鉤——
 *   宣告帶位不可達時自動降級配速（degraded 記錄），effLevel 跟著配速依據走：
 *   宣告 high 高位不可達 → 配速按 mid → effLevel='mid' → 攔在中帶
 *   宣告 high/mid 均不可達 → 配速按 low → effLevel='low' → 弧線球球落地 / 壓制球低位攔截
 *   宣告 low → effLevel='low' → 弧線球球落地 / 壓制球低位攔截
 * 這樣選點帶位與診斷訊息「已按 X 位配速」字面一致（帶位忠實）。
 */
export function matchReceiverSpeed(shot, shots) {
  if (!shot || shot.isSetup || shot.pendingTo) return null;

  // 重新匹配 = 捨棄舊手動吸附（球路參數可能已變，舊吸附點不再有效）
  shot.interception = null;

  const idx = shots.indexOf(shot);
  if (idx < 0) return null;

  const state = getState();
  const striker = shot.striker;
  const defender = striker === 'A' ? 'B' : 'A';
  const players = getPlayers(state.mode);
  const defenderIds = players[defender] || [];
  if (defenderIds.length === 0) return null;

  const defenderId = defenderIds[0];
  const prevShot = idx > 0 ? shots[idx - 1] : null;
  const nextShot = idx < shots.length - 1 ? shots[idx + 1] : null;

  // 接球方起點：與 computeHitPoint 同源（上一拍結束位置優先）
  const startPos = (prevShot?.previewPositions?.[defenderId])
    ? prevShot.previewPositions[defenderId]
    : (shot.players?.[defenderId] || prevShot?.players?.[defenderId]);

  // 降級記錄：宣告帶位在守方半場不可達時自動降級配速（下一拍宣告保留不動）
  let degraded = null;
  let effLevel = null; // 實際配速依據（決定 computeHitPoint 的帶位範圍）

  // 速度匹配：僅當有下一拍（有人要接這顆球）時
  if (nextShot && !nextShot.isSetup && !nextShot.pendingTo && startPos) {
    const targetLevel = nextShot.hitLevel;
    let speed = null;

    if (targetLevel === 'low') {
      // 低位：球落地，走路速度 = dist(起點, 落點) / 全程時間
      effLevel = 'low';
      const duration = getFullDuration(shot);
      const targetPos = shot.ballTo
        ? { x: shot.ballTo.x, z: shot.ballTo.z }
        : { x: 0, z: 0 };
      const dist = Math.hypot(targetPos.x - startPos.x, targetPos.z - startPos.z);
      // 加 5% 餘量：toFixed(2) 捨入 + findInterception 嚴格判斷 playerTime <= flightTime，
      // 恰好趕上的理論速度向下捨入後會被判為「來不及」→ hitPoint = null。
      // 餘量放大分母 0.95 等於速度放大 ≈5%，確保所有邊界場景都能通過嚴格判斷。
      speed = parseFloat(clamp(dist / Math.max(0.1, duration * 0.8 * 0.95), 1.0, 8.0).toFixed(2));
    } else if (targetLevel === 'high' || targetLevel === 'mid') {
      // 高/中位：以「球下降穿過帶下緣」的時刻為截止，反求所需速度。
      // 高帶不可達時自動降級「配速依據」（下一拍 hitLevel 宣告保留不動）：
      //   宣告 high 但高位不可達 → 按中位截止配速；中位也不可達 → 按低位走路配速
      let deadline = findBandDeadline(shot, targetLevel);

      if (!deadline && targetLevel === 'high') {
        deadline = findBandDeadline(shot, 'mid');
        if (deadline) { degraded = 'high→mid'; effLevel = 'mid'; }
      }
      if (!deadline) {
        // 連中位都到不了（或宣告本來就是 mid 但中位不可達）→ 降為低位走路
        degraded = targetLevel === 'high' ? 'high→low' : 'mid→low';
        effLevel = 'low';
        const duration = getFullDuration(shot);
        const targetPos = shot.ballTo
          ? { x: shot.ballTo.x, z: shot.ballTo.z }
          : { x: 0, z: 0 };
        const dist = Math.hypot(targetPos.x - startPos.x, targetPos.z - startPos.z);
        speed = parseFloat(clamp(dist / Math.max(0.1, duration * 0.8 * 0.95), 1.0, 8.0).toFixed(2));
      } else {
        // deadline 存在 → effLevel = 配速依據帶位（宣告 high 用 high deadline、宣告 mid 用 mid deadline）
        effLevel = targetLevel;
        const duration = getFullDuration(shot);
        const dist = Math.hypot(deadline.pt.x - startPos.x, deadline.pt.z - startPos.z);
        // 加 5% 餘量：與 low 分支同樣原因，避免捨入後 playerTime 微幅大於 flightTime
        const rawSpeed = dist / Math.max(0.1, deadline.t * duration * 0.8 * 0.95);
        speed = parseFloat(clamp(rawSpeed, 1.0, 8.0).toFixed(2));
      }
    }

    if (speed !== null && shot.players[defenderId] && !shot.players[defenderId].speedOverride) {
      shot.players[defenderId].speed = speed;
    }
  }

  // 順序：先以（新）速度重算攔截點 → 再刷新站位/preview
  // effLevel（實際配速依據）決定選點帶位（帶位忠實）：
  //   effLevel='low' → 弧線球球落地（null）、壓制球低位攔截（帶 [0.1, 3.0]）
  //   effLevel='high'/'mid' → computeHitPoint 限對應帶位
  // 最後一拍（無下一拍）時 effLevel 維持 null → 用宣告帶位作為帶位（無配速降級邏輯）
  const isPressShot = shot.arcType === 'fast_press' || shot.arcType === 'soft_press';
  if (effLevel === 'low') {
    // 配速依據 = low：弧線球球落地、壓制球低位攔截
    shot.hitPoint = isPressShot ? computeHitPoint(shot, prevShot, 'low') : null;
  } else if (effLevel === 'high' || effLevel === 'mid') {
    // 配速依據 = high/mid：選點限 effLevel 對應帶位
    shot.hitPoint = computeHitPoint(shot, prevShot, effLevel);
  } else {
    // effLevel 為 null（無下一拍，最後一拍）：用本拍宣告帶位
    shot.hitPoint = computeHitPoint(shot, prevShot, shot.hitLevel || 'high');
  }
  applySmartPositions(shot, shots, state.mode, state.appMode);

  return {
    adjusted: true,
    shotIndex: idx,
    playerId: defenderId,
    speed: shot.players[defenderId]?.speed ?? null,
    degraded: degraded
  };
}

export function applySmartPositions(shot, shots, mode, appMode) {
  if (appMode !== 'smart' || shot.isSetup || shot.pendingTo) return;

  const striker = shot.striker;
  const defender = getOpponent(striker);
  const players = getPlayers(mode);
  const strikerSide = getTeamDirection(striker);
  const defenderSide = getTeamDirection(defender);

  if (!shot.previewPositions) shot.previewPositions = {};

  const strikerIds = players[striker] || [];
  strikerIds.forEach((id, pIdx) => {
    if (pIdx === 0) {
      shot.previewPositions[id] = { x: 0, z: strikerSide * 3.35 };
    } else {
      shot.previewPositions[id] = { x: pIdx === 1 ? -1.25 : 1.25, z: strikerSide * 4.5 };
    }
  });

  // 接球方：永遠吸附球軌跡終點（落點）——攔截點只影響 3D 切拍時刻與下一拍起點，不影響 2D 站位
  const defenderIds = players[defender] || [];
  if (defenderIds.length > 0) {
    shot.previewPositions[defenderIds[0]] = {
      x: shot.ballTo.x,
      z: shot.ballTo.z
    };
    for (let i = 1; i < defenderIds.length; i++) {
      const coverX = shot.ballTo.x > 0 ? -1.25 : 1.25;
      shot.previewPositions[defenderIds[i]] = {
        x: coverX,
        z: defenderSide * 3.35
      };
    }
  }
  // recalculateSpeeds 已從此處拆出：擊球方回中速度只在「落點變化」時重算
  // （拖終點、點擊設定落點、拖動預覽球員），改弧度/Apex/hitLevel 不經過此函數
}

/**
 * 擊球方回中速度重算（嚴格鎖定：只在「落點變化」時呼叫）
 * 觸發時機：拖終點（拖動中＋鬆手）、點擊設定落點、拖動預覽球員。
 * 改弧度 / 改 Apex / 改 hitLevel 一律不呼叫此函數（回中速度數值完全不動）。
 */
export function recalculateSpeeds(shot, mode, appMode) {
  if (appMode !== 'smart' || shot.isSetup || shot.pendingTo) return;
  if (!shot.previewPositions) return;

  const striker = shot.striker;
  const players = getPlayers(mode);

  // 擊球方回中速度：以「球飛行全程時間（起點→終點）」反求
  // （擊球方無法預判接球方是否攔截，全程時間才是其實際能掌握的資訊）
  const duration = getFullDuration(shot);

  // 只重算擊球方回中速度；接球方到位速度由 matchReceiverSpeed（智能匹配）
  // 或使用者手動設定決定，不在此處覆寫
  const strikerIds = players[striker] || [];
  strikerIds.forEach((id) => {
    const previewPos = shot.previewPositions?.[id];
    if (!previewPos) return;

    const hitPos = shot.ballFrom;
    const dist = Math.hypot(previewPos.x - hitPos.x, previewPos.z - hitPos.z);
    let reqSpeed = dist / Math.max(0.15, duration);
    reqSpeed = clamp(reqSpeed, 1.0, 8.0);

    if (shot.players[id]) {
      shot.players[id].speed = parseFloat(reqSpeed.toFixed(1));
    }
  });
}

/**
 * v0.2b：級聯更新
 * 下一拍起點 = 上一拍 hitPoint（若有），否則用 ballTo
 */
export function cascadeBallPositions(fromIndex, shots, mode, appMode) {
  for (let i = Math.max(1, fromIndex); i < shots.length - 1; i++) {
    const prevShot = shots[i];
    const nextShot = shots[i + 1];

    const effectiveEnd = getEffectiveEnd(prevShot);
    nextShot.ballFrom = { ...effectiveEnd };

    if (prevShot.previewPositions) {
      Object.keys(prevShot.previewPositions).forEach(id => {
        if (nextShot.players[id]) {
          nextShot.players[id].x = prevShot.previewPositions[id].x;
          nextShot.players[id].z = prevShot.previewPositions[id].z;
        }
      });
    }

    autoMatchShotProperties(nextShot, shots, mode, appMode);

    // 重算 hitPoint（方案C：先算擊球點，讓 applySmartPositions/recalculateSpeeds 用最新 hitPoint）
    // 與 matchReceiverSpeed 同規則（帶位忠實）：
    //   下下一拍宣告 low → 弧線球球落地（null）、壓制球低位攔截（帶 [0.1, 3.0]）
    //   下下一拍宣告 high/mid → 選點限宣告帶位（帶位忠實）
    //   最後一拍（無下下一拍）→ 用本拍宣告帶位計算攔截點
    const afterNext = (i + 2 < shots.length) ? shots[i + 2] : null;
    const nextDeclared = (afterNext && !afterNext.isSetup && !afterNext.pendingTo)
      ? afterNext.hitLevel : null;
    const isPressNext = nextShot.arcType === 'fast_press' || nextShot.arcType === 'soft_press';
    if (nextDeclared === null) {
      // 最後一拍或下下一拍 pending：宣告級別未知 → 用本拍宣告作為帶位
      nextShot.hitPoint = computeHitPoint(nextShot, prevShot, nextShot.hitLevel || 'high');
    } else if (nextDeclared === 'low') {
      // 下下一拍宣告 low：壓制球可低位攔截，弧線球球落地（與 matchReceiverSpeed 對齊）
      nextShot.hitPoint = isPressNext ? computeHitPoint(nextShot, prevShot, 'low') : null;
    } else {
      // 下下一拍宣告 high/mid：直接用宣告作為帶位（cascade 無配速降級邏輯，宣告即帶位）
      nextShot.hitPoint = computeHitPoint(nextShot, prevShot, nextDeclared);
    }

    applySmartPositions(nextShot, shots, mode, appMode);
  }
}

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
    previewPositions: {}
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
  return shot;
}

export function initDemo(shots, mode, appMode) {
  shots.length = 0;

  const s0 = newShot(0, shots, mode, appMode);
  s0.server = 'A';
  shots.push(s0);

  return shots;
}