// ========== v0.5 3C-2：回合制動畫播放 ==========
//
// 播放模型（見 3C-2 話術第二節）：
// - 拍時長 = 球的飛行時間（起點 → 攔截點/落點）
// - 移動方與回動方同時移動，皆以球飛行時間為結束；擊球為瞬間，不佔時間
// - 每拍 i 的球沿 shots[i] 軌跡飛行；shots[i+1].hitPoint 是下一拍移動方
//   在「本拍飛行」中的攔截點（位置等同 shots[i+1].ballFrom）
// - 球在該攔截點被擊打（及時到位）→ hit，切下一拍；否則球播到 ballTo 落地
// - 移動方來不及到位（接不到球）：球播到落地、移動方半路停下，本拍播完中斷
// - 播放時只顯示拖尾；非播放時的全軌跡線由 entities.refresh3DShotView 管理

import { getState, getAnimTime, setAnimTime, setCurrentIndex, getShots, getCurrentShot } from '../core/state.js';
import { getFullDuration, getTrajectoryPoint } from '../core/physics.js';
import { getPlayers } from '../models/player.js';
import {
  getPlayerMeshes, getShuttleMesh, ballTrail, updateBallTrail, clearBallTrail,
  showHitRipple, updateHitRipple,
  setTrajectoryLinesVisible, setPlayersPlaybackMode, refresh3DShotView
} from './entities.js';
import { render2D } from '../2d/renderer.js';
import { renderSideProfile } from '../2d/sideprofile.js';
import { updateShotInfo } from '../ui/panels.js';

let animationId = null;
let lastFrameTime = 0;

// 播放狀態：animate 迴圈是播放期間球/球員位置的唯一寫入者
let wasPlaying = false;
let lastEnteredShot = -1;

const TRAIL_MAX_FRAMES = 60;
const REACH_EPS = 0.15;   // 到位判定容差（米）

// 切拍脈衝——有 hitPoint 的拍切換瞬間，球體短暫發光提示攔截發生
// 球體（shuttleMesh）是 group（cone 白 + head 黃），材質無 emissive（預設黑 0x000000 / intensity 1.0）
let cutPulseStartTime = 0;
let cutPulseActive = false;
const CUT_PULSE_DURATION = 300;    // 毫秒
const CUT_PULSE_COLOR = 0xffaa00;  // 脈衝色（亮橙）
const CUT_PULSE_PEAK = 1.0;        // 峰值 emissiveIntensity
const SHUTTLE_EMISSIVE_DEFAULT = 0x000000; // 球體原 emissive（預設黑）
const SHUTTLE_EMISSIVE_INTENSITY_DEFAULT = 1.0; // 球體原 intensity（預設）

function setShuttleEmissive(hex, intensity) {
  const shuttle = getShuttleMesh();
  if (!shuttle || !shuttle.children) return;
  shuttle.children.forEach(child => {
    if (child.material && child.material.emissive) {
      child.material.emissive.setHex(hex);
      child.material.emissiveIntensity = intensity;
    }
  });
}

function resetCutPulse() {
  if (cutPulseActive) {
    setShuttleEmissive(SHUTTLE_EMISSIVE_DEFAULT, SHUTTLE_EMISSIVE_INTENSITY_DEFAULT);
    cutPulseActive = false;
  }
}

export function startAnimation() {
  if (animationId) return;
  lastFrameTime = performance.now();
  animate();
}

export function stopAnimation() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  resetCutPulse();
  lastEnteredShot = -1;
}

// ========== 播放時間軸構建 ==========

/**
 * 取某隊在本拍實際存在的球員 ID（單打/雙打/2-1/3-1 通用）
 */
function teamPlayerIds(shot, team, mode) {
  if (!team) return [];
  const inShot = Object.keys(shot.players || {}).filter(id => id.startsWith(team));
  const roster = (getPlayers(mode)[team] || []).filter(id => inShot.includes(id));
  return roster.length ? roster : inShot;
}

/**
 * 球員在上一拍結束時的位置（上拍回中/擊球目標點；第 1 拍用設置拍站位）
 */
function prevEndPos(shots, shotIdx, id) {
  const prev = shots[shotIdx - 1];
  if (!prev) return null;
  return (prev.previewPositions && prev.previewPositions[id]) || prev.players?.[id] || null;
}

/**
 * 建立回合制播放時間軸。
 * 每個 item：{ i, s, start, dur, mode:'hit'|'land', endT, failMover }
 * - hit ：本拍球被下一拍移動方在 next.hitPoint.t 攔截，
 *         時長 = 本拍全程 × next.hitPoint.t，球終點 = next.ballFrom
 * - land：無下一拍 / 無攔截 / 接不到球 → 球播到 ballTo，本拍播完中斷
 *         failMover 記錄接不到球的球員（朝擊球點跑但半路停下）
 */
function buildPlaybackTimeline(shots) {
  const items = [];
  let acc = 0;
  const state = getState();

  for (let i = 1; i < shots.length; i++) {
    const s = shots[i];
    // 未吸附攔截點的回合結束拍（ballFrom=null）不進入播放
    if (!s.ballFrom || !s.ballTo) break;

    const fullDur = getFullDuration(s);
    const next = shots[i + 1];
    let mode = 'land';
    let dur = fullDur;
    let endT = 1;
    let failMover = null;

    // 下一拍移動方在「本拍飛行」中的攔截點
    const intercepted = !!(next && next.ballFrom && next.hitPoint && next.hitPoint.t > 0);
    if (intercepted) {
      // 球抵達攔截點的時間 = 本拍全程 × 攔截比例
      const avail = fullDur * next.hitPoint.t;
      const ids = teamPlayerIds(next, next.mover, state.mode);
      const id0 = ids[0];
      const start = id0 ? prevEndPos(shots, i + 1, id0) : null;
      const dist = start ? Math.hypot(next.ballFrom.x - start.x, next.ballFrom.z - start.z) : 0;
      const speed = (next.moveSpeed != null) ? next.moveSpeed : (next.players?.[id0]?.speed ?? 0);

      // 球員移動時間 ≤ 球抵達攔截點時間（dist / speed ≤ avail）才接得到
      if (dist <= speed * avail + REACH_EPS) {
        mode = 'hit';
        dur = avail;
        endT = next.hitPoint.t;
      } else {
        // 接不到：本拍球照樣落地；該球員朝擊球點跑，播放時只跑到半路
        failMover = {
          ids,
          x: next.ballFrom.x, z: next.ballFrom.z,
          sx: start ? start.x : next.ballFrom.x,
          sz: start ? start.z : next.ballFrom.z,
          speed
        };
      }
    }

    items.push({ i, s, start: acc, dur, mode, endT, failMover });
    acc += dur;

    // 落地（無下一拍 / 無攔截 / 接不到）即中斷，不再播下一拍
    if (mode === 'land') break;
  }

  return { items, total: acc };
}

// ========== 單幀播放更新 ==========

function updatePlaybackFrame(shots, timeline, animTime, now) {
  const shuttle = getShuttleMesh();
  const playerMeshes = getPlayerMeshes();
  const state = getState();

  for (const it of timeline.items) {
    const { i, s } = it;
    if (animTime < it.start || animTime > it.start + it.dur) continue;

    setCurrentIndex(i);

    // 切拍瞬間（每拍第一次進入）
    if (lastEnteredShot !== i) {
      lastEnteredShot = i;
      // 3C-2 Part 3：擊球水紋 = 本拍擊球點（球起點 ballFrom），非攔截點
      showHitRipple(s.ballFrom.x, s.ballFrom.z);
      // 擊球脈衝僅在實際攔截擊打時閃爍
      if (s.hitPoint && s.hitPoint.t !== undefined) {
        cutPulseStartTime = performance.now();
        cutPulseActive = true;
        setShuttleEmissive(CUT_PULSE_COLOR, CUT_PULSE_PEAK);
      }
    }

    const p = Math.min(1, Math.max(0, (animTime - it.start) / it.dur));
    const elapsed = p * it.dur;

    // ---- 球：沿本拍軌跡；hit 拍在 endT（下一拍攔截比例）結束，land 拍播到 ballTo ----
    const ballT = p * it.endT;
    const pt = getTrajectoryPoint(s, ballT);
    if (shuttle) {
      shuttle.visible = true;
      shuttle.position.set(pt.x, pt.y, pt.z);

      if (cutPulseActive) {
        const pulseElapsed = now - cutPulseStartTime;
        if (pulseElapsed >= CUT_PULSE_DURATION) {
          resetCutPulse();
        } else {
          const pulseRatio = pulseElapsed / CUT_PULSE_DURATION;
          setShuttleEmissive(CUT_PULSE_COLOR, CUT_PULSE_PEAK * (1 - pulseRatio));
        }
      }
    }

    updateHitRipple();

    // ---- 拖尾（播放期間唯一的球路視覺，最多 60 幀）----
    ballTrail.push({ x: pt.x, y: pt.y, z: pt.z });
    if (ballTrail.length > TRAIL_MAX_FRAMES) {
      ballTrail.splice(0, ballTrail.length - TRAIL_MAX_FRAMES);
    }
    updateBallTrail();
    renderSideProfile(s);

    // ---- 球員：移動方 / 回動方角色制 ----
    const moverIds = teamPlayerIds(s, s.mover, state.mode);
    const recovererIds = teamPlayerIds(s, s.recoverer, state.mode);
    // 回動方可移動預算 = 回動速度 × 上一拍飛行時間（3C-2 話術 3.1 第 4 點）
    const recoverBudgetDur = i > 1 ? getFullDuration(shots[i - 1]) : it.dur;
    const failIds = it.failMover ? it.failMover.ids : [];

    Object.keys(s.players || {}).forEach(id => {
      const mesh = playerMeshes?.[id];
      if (!mesh) return;

      let end, speed, budget, start;

      if (failIds.includes(id)) {
        // 2.3 接不到球：自上拍結束位置朝攔截點跑，速度不足 → 停在半路
        start = { x: it.failMover.sx, z: it.failMover.sz };
        end = { x: it.failMover.x, z: it.failMover.z };
        speed = it.failMover.speed;
        budget = Infinity;
      } else {
        start = prevEndPos(shots, i, id);
        if (!start) {
          const here = s.players[id];
          mesh.position.set(here.x, 0, here.z);
          return;
        }

        if (moverIds.includes(id)) {
          // 移動方：上拍結束位置 → 本拍擊球點（球起點 ballFrom）
          end = { x: s.ballFrom.x, z: s.ballFrom.z };
          speed = (s.moveSpeed != null) ? s.moveSpeed : (s.players[id]?.speed ?? 3.0);
          budget = Infinity;
        } else if (recovererIds.includes(id)) {
          // 回動方：上拍結束位置 → 本拍回中位置
          end = s.previewPositions?.[id] || s.players[id];
          speed = (s.recoverSpeed != null) ? s.recoverSpeed : (s.players[id]?.speed ?? 3.0);
          budget = speed * recoverBudgetDur;
        } else {
          // 雙打其餘球員：直接放在本拍目標站位
          end = s.previewPositions?.[id] || s.players[id];
          mesh.position.set(end.x, 0, end.z);
          return;
        }
      }

      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.001) {
        mesh.position.set(end.x, 0, end.z);
        return;
      }

      // 已移動距離 = 速度 × 本拍已飛行時間，並受回動預算/總距離限制
      const travel = Math.min(speed * elapsed, dist, budget);
      mesh.position.set(start.x + dx * (travel / dist), 0, start.z + dz * (travel / dist));
    });
    break;
  }

  render2D();
  updateShotInfo();
}

// ========== 主迴圈 ==========

function animate() {
  animationId = requestAnimationFrame(animate);

  const state = getState();
  const now = performance.now();
  const delta = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  const controls = window.__controls;
  if (controls && controls.update) {
    controls.update();
  }

  if (state.playing) {
    // 進入播放：隱藏全軌跡線、球員恢復正常縮放與射線、重置切拍記錄
    if (!wasPlaying) {
      wasPlaying = true;
      lastEnteredShot = -1;
      clearBallTrail();
      setTrajectoryLinesVisible(false);
      setPlayersPlaybackMode(true);
      const shuttle = getShuttleMesh();
      if (shuttle) shuttle.visible = true;
    }

    const shots = getShots();
    const timeline = buildPlaybackTimeline(shots);

    if (timeline.items.length === 0) {
      state.playing = false;
      const playBtn = document.getElementById('btn-play');
      if (playBtn) playBtn.textContent = '▶ 播放';
    } else {
      const prevAnimTime = getAnimTime();
      const stepDelta = delta * state.playSpeed;

      // 單拍模式：以「上一幀所在拍的結束點」偵測跨拍，精準停在邊界
      let boundary = 0;
      for (const it of timeline.items) {
        if (prevAnimTime >= it.start && prevAnimTime < it.start + it.dur) {
          boundary = it.start + it.dur;
          break;
        }
      }

      let animTime;
      if (state.stepMode && boundary > 0 && prevAnimTime < boundary && (prevAnimTime + stepDelta) >= boundary) {
        animTime = boundary;
        state.playing = false;
        const playBtn = document.getElementById('btn-play');
        if (playBtn) playBtn.textContent = '▶ 播放';
      } else {
        animTime = prevAnimTime + stepDelta;
      }

      if (animTime >= timeline.total) {
        animTime = timeline.total;
        state.playing = false;
        const playBtn = document.getElementById('btn-play');
        if (playBtn) playBtn.textContent = '▶ 播放';
      }

      setAnimTime(animTime);

      const slider = document.getElementById('timeline');
      if (slider && timeline.total > 0) {
        slider.value = (animTime / timeline.total) * 100;
      }

      updatePlaybackFrame(shots, timeline, animTime, now);
    }
  }

  // 離開播放（暫停/停止/結束/中斷）：恢復全軌跡線與編輯視覺、清空拖尾
  if (!state.playing && wasPlaying) {
    wasPlaying = false;
    resetCutPulse();
    clearBallTrail();
    setPlayersPlaybackMode(false);
    refresh3DShotView(getCurrentShot());
  }

  const renderer = window.__renderer;
  const scene = window.__scene;
  const camera = window.__camera;
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

window.__clearTrail = function () {
  clearBallTrail();
};
