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
  playerAvgSpeed: 3.0,
  playerMaxSpeed: 8.0,
  apexMax: 8.0,
  apexMin: 1.2,
  serveHeight: 1.15  // 發球高度
};

// ========== 初速度範圍（km/h）v0.2A ==========
// 按場景與球路分類，作為全局數據，方便以後針對性微調
export const SPEED_RANGES = {
  // 後場
  backcourt: {
    high_arc:   { min: 120, max: 160 },  // 高球、平高球
    soft_press: { min: 150, max: 200 },  // 輕壓
    fast_press: { min: 200, max: 250 },  // 快壓
    near_flat:  { min: 80,  max: 120 },  // 近平球（吊球）
    far_flat:   { min: 120, max: 180 }   // 遠平球（抽球）
  },
  // 前場
  frontcourt: {
    high_soft_press: { min: 150, max: 200 },  // 高位輕壓
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
  gravity: 9.8,               // 重力加速度 m/s²
  airResistanceK: 0.008,      // 空氣阻力係數（備用）
  resistanceUp: 1.3,          // 上升段時間修正係數
  resistanceDown: 1.4         // 下降段時間修正係數
};