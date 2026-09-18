import { getState, getAnimTime, setAnimTime, getCurrentIndex, setCurrentIndex, getShots } from '../core/state.js';
import { getTotalRallyDuration, getShotDuration, getTrajectoryPoint } from '../core/physics.js';
import { getPlayerMeshes, getShuttleMesh, ballTrail, updateBallTrail, clearBallTrail } from './entities.js';
import { render2D } from '../2d/renderer.js';
import { renderSideProfile } from '../2d/sideprofile.js';
import { updateShotInfo } from '../ui/panels.js';

let animationId = null;
let lastFrameTime = 0;

const TRAIL_MAX_FRAMES = 60;

// v0.2c B1：切拍脈衝——有 hitPoint 的拍切換瞬間，球體短暫發光提示攔截發生
// 球體（shuttleMesh）是 group（cone 白 + head 黃），材質無 emissive（預設黑 0x000000 / intensity 1.0）
let cutPulseStartTime = 0;
let cutPulseActive = false;
let lastPulseShotIndex = -1;
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
  // B1：重置脈衝，恢復球體原發光狀態
  resetCutPulse();
  lastPulseShotIndex = -1;
}

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
    const shots = getShots();
    const totalDuration = getTotalRallyDuration(shots);
    let animTime = getAnimTime();
    animTime += delta * state.playSpeed;

    // 計算當前播放位置屬於哪一拍
    let accumulatedTime = 0;
    let shotEndTime = 0;
    for (let i = 1; i < shots.length; i++) {
      const dur = getShotDuration(shots[i]);
      if (animTime >= accumulatedTime && animTime < accumulatedTime + dur) {
        shotEndTime = accumulatedTime + dur;
        break;
      }
      accumulatedTime += dur;
      shotEndTime = accumulatedTime;
    }

    // 單節模式
    if (state.stepMode && animTime >= shotEndTime) {
      animTime = shotEndTime;
      state.playing = false;
      const playBtn = document.getElementById('btn-play');
      if (playBtn) playBtn.textContent = '▶ 播放';
    }

    if (animTime >= totalDuration) {
      animTime = totalDuration;
      state.playing = false;
      const playBtn = document.getElementById('btn-play');
      if (playBtn) playBtn.textContent = '▶ 播放';
    }

    setAnimTime(animTime);
    const slider = document.getElementById('timeline');
    if (slider && totalDuration > 0) {
      slider.value = (animTime / totalDuration) * 100;
    }

    accumulatedTime = 0;
    const shuttle = getShuttleMesh();
    const playerMeshes = getPlayerMeshes();

    for (let i = 1; i < shots.length; i++) {
      const s = shots[i];
      const dur = getShotDuration(s);
      if (animTime >= accumulatedTime && animTime <= accumulatedTime + dur) {
        setCurrentIndex(i);
        const tProgress = (animTime - accumulatedTime) / dur;
        const elapsedTime = animTime - accumulatedTime;

        // B1：切拍脈衝觸發——僅該拍有 hitPoint（攔截發生）且首次進入此拍時
        // （球落地 hitPoint=null 的拍不閃，避免誤導）
        if (s.hitPoint && s.hitPoint.t !== undefined && lastPulseShotIndex !== i) {
          lastPulseShotIndex = i;
          cutPulseStartTime = performance.now();
          cutPulseActive = true;
          setShuttleEmissive(CUT_PULSE_COLOR, CUT_PULSE_PEAK);
        }

        // v0.2b：球的 t 用 tProgress × hitT
        // hitT = 球在完整軌跡上的比例（到 hitPoint 為止）
        // 若無 hitPoint，hitT = 1.0（到 ballTo）
        const hitT = (s.hitPoint && s.hitPoint.t !== undefined) ? s.hitPoint.t : 1.0;
        const t = tProgress * hitT;
        const pt = getTrajectoryPoint(s, t);

        // 更新球位置
        if (shuttle) {
          shuttle.position.set(pt.x, pt.y, pt.z);

          // B1：脈衝衰減——intensity 從峰值線性降到 0，結束後恢復原狀
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

        // 拖尾
        ballTrail.push({ x: pt.x, y: pt.y, z: pt.z });
        if (ballTrail.length > TRAIL_MAX_FRAMES) {
          ballTrail.splice(0, ballTrail.length - TRAIL_MAX_FRAMES);
        }
        updateBallTrail();
        renderSideProfile(s);

        // ========================================
        // v0.2b：球員以實際速度移動
        // 起點 = 上一拍的「目標位置」（previewPositions）
        // 這樣每拍播放都是連續的，不會跳回起點
        // ========================================
        const prevShot = shots[i - 1];
        Object.keys(s.players).forEach(id => {
          // 起點：上一拍的目標位置（若無則用實體位置）
          const pStart = (prevShot.previewPositions && prevShot.previewPositions[id])
            ? prevShot.previewPositions[id]
            : prevShot.players[id];

          // 終點：當前拍的目標位置
          const pEnd = (s.previewPositions && s.previewPositions[id])
            ? s.previewPositions[id]
            : s.players[id];

          if (!pStart || !pEnd || !playerMeshes || !playerMeshes[id]) return;

          const speed = s.players[id]?.speed || 3.0;

          const dx = pEnd.x - pStart.x;
          const dz = pEnd.z - pStart.z;
          const targetDist = Math.hypot(dx, dz);

          if (targetDist < 0.001) {
            playerMeshes[id].position.set(pEnd.x, 0, pEnd.z);
            return;
          }

          // 已移動距離 = 速度 × 已飛行時間
          const maxDist = speed * elapsedTime;
          const ratio = Math.min(1, maxDist / targetDist);

          const currentX = pStart.x + dx * ratio;
          const currentZ = pStart.z + dz * ratio;

          playerMeshes[id].position.set(currentX, 0, currentZ);
        });
        break;
      }
      accumulatedTime += dur;
    }
    render2D();
    updateShotInfo();
  }

  const renderer = window.__renderer;
  const scene = window.__scene;
  const camera = window.__camera;
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

window.__clearTrail = function() {
  clearBallTrail();
};