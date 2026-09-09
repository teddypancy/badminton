import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls;

export function initScene() {
  const container = document.getElementById('container3d');
  
  if (!container) {
    console.error('container3d 元素不存在！');
    return null;
  }

  // 檢查是否已初始化
  if (renderer) {
    console.log('3D場景已存在，跳過初始化');
    return { scene, camera, renderer, controls };
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1929);

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || (window.innerHeight - 48);

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(9.5, 10.5, 11.5);

  renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: false 
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.update();

  // 光照
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(10, 20, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0x4488ff, 0.3);
  fillLight.position.set(-10, 5, -10);
  scene.add(fillLight);

  // Resize handler
  window.addEventListener('resize', () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || (window.innerHeight - 48);
    if (camera && renderer) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
  });

  console.log('✅ Three.js 場景初始化成功');
  return { scene, camera, renderer, controls };
}

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }
export function getControls() { return controls; }