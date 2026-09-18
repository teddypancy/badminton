// js/core/trajectory.js

import { getTrajectoryPoint, getShotDuration } from './physics.js';

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
