// ========== 通用工具函數 ==========

/**
 * 深拷貝對象
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 限制數值範圍
 */
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * 兩點距離 (2D)
 */
export function dist2D(p1, p2) {
  return Math.hypot(p2.x - p1.x, p2.z - p1.z);
}