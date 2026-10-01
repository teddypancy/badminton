// ========== 羽球物理常數與規格 ==========
export const COURT = {
  length: 13.4,
  width_d: 6.1,
  width_s: 5.18,
  service_line: 1.98,
  double_back: 5.94,
  net_height: 1.55,
  margin: 1.0,
  out_bound: 0.5
};

export const ARC_TYPES = {
  high_arc: { name: '高球', desc: '高弧度：上升至落點上方後垂直下落', isPress: false },
  mid_high_arc: { name: '平高球', desc: '平高弧度：標準羽球衰減拋物線', isPress: false },
  low_flat_arc: { name: '平球', desc: '平球/低平球：平貼網頂快速過網拋物線', isPress: false },
  fast_press: { name: '快壓', desc: '重殺：高擊球點下壓快速過網', isPress: true },
  soft_press: { name: '輕壓', desc: '劈殺/劈吊：高擊球點中速前向下壓', isPress: true }
};

export const DRAW_COLORS = ['#ff5252', '#2196f3', '#ffd54f', '#4caf50', '#ff9800', '#ab47bc', '#ffffff', '#00bcd4'];

// 極限值
export const LIMITS = {
  playerMaxSpeed: 8.0,
  serveHeight: 1.15
};

// ========== v0.5 回合制速度基準 ==========
export const SPEED_BASELINE = {
  FIRST_SHOT: 1.0,        // 第 1 拍基準速度 m/s
  NORMAL_MIN: 1.0,        // 正常移動速度下限
  NORMAL_MAX: 1.8,        // 正常移動速度上限
  ACCEL_MULTIPLIER: 3,    // 瞬時提速倍率
  GLOBAL_CAP: 5.4,        // 全域封頂（1.8 × 3）
  DIAG_CAP: 8.0           // 診斷上限（保留舊值）
};

// ========== 初速度範圍（km/h）v0.2A ==========
export const SPEED_RANGES = {
  // 後場
  backcourt: {
    high_arc:   { min: 120, max: 160 },  // 高球、平高球
    soft_press: { min: 170, max: 220 },  // 輕壓
    fast_press: { min: 200, max: 250 },  // 快壓
    near_flat:  { min: 80,  max: 120 },  // 近平球（吊球）
    far_flat:   { min: 120, max: 180 }   // 遠平球（抽球）
  },
  // 前場
  frontcourt: {
    high_soft_press: { min: 170, max: 220 },  // 高位輕壓
    mid_low_near:    { min: 50,  max: 70 },   // 中低位平球（近）
    mid_low_far:     { min: 90,  max: 120 },  // 中低位平球（遠）
    high_lift:       { min: 70,  max: 100 }   // 高弧度挑後場
  },
  // 發球
  serve: {
    backcourt_high: { min: 70, max: 100 },  // 發後場高弧度
    net_short:      { min: 30, max: 60 }    // 發網前
  }
};

// ========== 物理常數 v0.2A ==========
export const PHYSICS = {
  gravity: 9.8,
  airResistanceK: 0.008,
  resistanceUp: 1.3,
  resistanceDown: 1.4
};
