import { COURT } from '../config/constants.js';

// ========== 球員邏輯 ==========

/**
 * 根據模式獲取球員ID列表
 */
export function getPlayers(mode) {
  switch (mode) {
    case 'singles': return { A: ['A1'], B: ['B1'] };
    case 'doubles': return { A: ['A1', 'A2'], B: ['B1', 'B2'] };
    case '2v1': return { A: ['A1'], B: ['B1', 'B2'] };
    case '3v1': return { A: ['A1'], B: ['B1', 'B2', 'B3'] };
    default: return { A: ['A1'], B: ['B1'] };
  }
}

/**
 * 獲取默認站位
 */
export function getDefaultSetupPlayers(mode) {
  const players = getPlayers(mode);
  const result = {};

  const teamA = players.A || [];
  if (teamA.length === 1) {
    result[teamA[0]] = { x: 1.25, z: 3.35, speed: 3.0 };
  } else if (teamA.length === 2) {
    result[teamA[0]] = { x: 1.25, z: 3.35, speed: 3.0 };
    result[teamA[1]] = { x: -1.25, z: 3.35, speed: 3.0 };
  } else if (teamA.length >= 3) {
    result[teamA[0]] = { x: 0, z: 2.0, speed: 3.0 };
    result[teamA[1]] = { x: 1.25, z: 4.8, speed: 3.0 };
    result[teamA[2]] = { x: -1.25, z: 4.8, speed: 3.0 };
  }

  const teamB = players.B || [];
  if (teamB.length === 1) {
    result[teamB[0]] = { x: -1.25, z: -3.35, speed: 3.0 };
  } else if (teamB.length === 2) {
    result[teamB[0]] = { x: -1.25, z: -3.35, speed: 3.0 };
    result[teamB[1]] = { x: 1.25, z: -3.35, speed: 3.0 };
  } else if (teamB.length >= 3) {
    result[teamB[0]] = { x: 0, z: -2.0, speed: 3.0 };
    result[teamB[1]] = { x: -1.25, z: -4.8, speed: 3.0 };
    result[teamB[2]] = { x: 1.25, z: -4.8, speed: 3.0 };
  }

  return result;
}

/**
 * 判斷擊球高度等級
 */
export function detectHitLevel(ballFromY) {
  if (ballFromY >= 2.0) return 'high';
  if (ballFromY >= 1.4) return 'mid';
  return 'low';
}

/**
 * 獲取對方隊伍
 */
export function getOpponent(team) {
  return team === 'A' ? 'B' : 'A';
}

/**
 * 獲取隊伍方向 (+1 = A隊在上/左, -1 = B隊在下/右)
 */
export function getTeamDirection(team) {
  return team === 'A' ? 1 : -1;
}