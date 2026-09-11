import { getState, getAnimTime, setAnimTime, getCurrentIndex, setCurrentIndex, getShots } from '../core/state.js';
import { getTotalRallyDuration, getShotDuration, getTrajectoryPoint } from '../core/physics.js';
import { getPlayerMeshes, getShuttleMesh, ballTrail, updateBallTrail, clearBallTrail } from './entities.js';
import { render2D } from '../2d/renderer.js';
import { renderSideProfile } from '../2d/sideprofile.js';
import { updateShotInfo } from '../ui/panels.js';

let animationId = null;
let lastFrameTime = 0;

const TRAIL_MAX_FRAMES = 60;

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
        const t = (animTime - accumulatedTime) / dur;
        const pt = getTrajectoryPoint(s, t);
        if (shuttle) {
          shuttle.position.set(pt.x, pt.y, pt.z);
        }

        ballTrail.push({ x: pt.x, y: pt.y, z: pt.z });
        if (ballTrail.length > TRAIL_MAX_FRAMES) {
          ballTrail.splice(0, ballTrail.length - TRAIL_MAX_FRAMES);
        }
        updateBallTrail();
        renderSideProfile(s);

        // ========================================
        // 球員移動：從上一拍結束位置 → 當前拍目標位置
        // ========================================
        const prevShot = shots[i - 1];
        Object.keys(s.players).forEach(id => {
          // pStart：上一拍結束時的位置
          let pStart;
          if (i === 1) {
            // 第 1 拍：從第 0 拍實體位置開始
            pStart = prevShot.players[id];
          } else {
            // 第 2 拍以後：從上一拍的目標位置開始
            pStart = (prevShot.previewPositions && prevShot.previewPositions[id])
              ? prevShot.previewPositions[id]
              : prevShot.players[id];
          }

          // pEnd：當前拍的目標位置
          const pEnd = (s.previewPositions && s.previewPositions[id])
            ? s.previewPositions[id]
            : s.players[id];

          if (pStart && pEnd && playerMeshes && playerMeshes[id]) {
            const lerpX = pStart.x + (pEnd.x - pStart.x) * t;
            const lerpZ = pStart.z + (pEnd.z - pStart.z) * t;
            playerMeshes[id].position.set(lerpX, 0, lerpZ);
          }
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