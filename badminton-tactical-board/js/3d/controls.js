// js/3d/controls.js

import { getCamera, getControls } from './scene.js';

export function setCameraView(viewType) {
  const camera = getCamera();
  const controls = getControls();

  if (!camera || !controls) {
    console.warn('Camera or controls not initialized');
    return;
  }

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewType);
  });

  switch (viewType) {
    case 'top':
      camera.position.set(0, 18, 0.01);
      controls.target.set(0, 0, 0);
      break;
    case 'side':
      camera.position.set(16, 3, 0);
      controls.target.set(0, 1, 0);
      break;
    case '45':
      camera.position.set(9.5, 10.5, 11.5);
      controls.target.set(0, 0, 0);
      break;
    case 'high':
      camera.position.set(0, 12, 12);
      controls.target.set(0, 0, 0);
      break;
    case 'low':
      camera.position.set(0, 1.8, 8);
      controls.target.set(0, 1.2, 0);
      break;
    default:
      camera.position.set(9.5, 10.5, 11.5);
      controls.target.set(0, 0, 0);
  }
  controls.update();
}