import { getState, getAnimTime, setAnimTime, addAnimTime, getCurrentIndex, setCurrentIndex } from '../core/state.js';
import { getShots } from '../core/state.js';
import { getTotalRallyDuration, getShotDuration, getTrajectoryPoint } from '../core/physics.js';
import { getPlayerMeshes, getShuttleMesh, ballTrail, updateBallTrail } from './entities.js';
import { render2D } from '../2d/renderer.js';
import { renderSideProfile } from '../2d/sideprofile.js';
import { updateShotInfo } from '../ui/panels.js';

let animationId = null;
let lastFrameTime = 0;

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

  // 更新軌跡控制
  const controls = window.__controls;
  if (controls) controls.update();

  if (state.playing) {
    const shots = getShots();
    const totalDuration = getTotalRallyDuration(shots);
    let animTime = getAnimTime();
    animTime += delta * state.playSpeed;

    if (animTime >= totalDuration) {
      animTime = totalDuration;
      state.playing = false;
      const playBtn = document.getElementById('btn-play');
      if (playBtn) playBtn.textContent = '播放';
    }

    setAnimTime(animTime);
    const slider = document.getElementById('timeline');
    if (slider) slider.value = (animTime / totalDuration) * 100;

    // 更新位置
    let accumulatedTime = 0;
    const shuttle = getShuttleMesh();
    const playerMeshes = getPlayerMeshes();

    for (let i = 1; i < shots.length; i++) {
      const s = shots[i];
      const dur = getShotDuration(s);
      if (animTime >= accumulatedTime && animTime <= accumulatedTime + dur) {
        setCurrentIndex(i);
        const t = (animTime - accumulatedTime) / dur;
        const pt = getTrajectoryPoint(s, t);
        if (shuttle) shuttle.position.set(pt.x, pt.y, pt.z);
        ballTrail.push({ x: pt.x, y: pt.y, z: pt.z });
        updateBallTrail();
        renderSideProfile(s);

        const prevShot = shots[i - 1];
        Object.keys(s.players).forEach(id => {
          const pStart = prevShot.players[id];
          const pEnd = s.players[id];
          if (pStart && pEnd && playerMeshes[id]) {
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

  // 渲染 3D
  const renderer = window.__renderer;
  const scene = window.__scene;
  const camera = window.__camera;
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}