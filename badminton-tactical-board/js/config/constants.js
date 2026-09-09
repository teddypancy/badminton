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