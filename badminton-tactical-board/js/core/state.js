import { deepClone } from '../utils/helpers.js';

// ========== 全局狀態 ==========

const defaultState = {
  appMode: 'smart',      // 'smart' | 'free'
  mode: 'singles',       // 'singles' | 'doubles' | '2v1' | '3v1'
  shots: [],
  currentShot: 0,
  playing: false,
  stepMode: false,       // 單節模式（新增）
  playSpeed: 1,
  selected: null,
  snapEnabled: true,
  snappedPlayer: null,
  snappedType: null,
  history: [],
  redoHistory: [],
  freeDraw: {
    tool: 'pencil',
    color: '#ff5252',
    lineWidth: 3,
    paths: [],
    redoPaths: [],
    currentPath: null
  }
};

let state = deepClone(defaultState);

// 動畫時間（統一來源）
let animTime = 0;

// ========== 狀態操作函數 ==========

export function getState() {
  return state;
}

export function setState(newState) {
  state = { ...state, ...newState };
}

export function resetState() {
  state = deepClone(defaultState);
  animTime = 0;
}

export function getAnimTime() {
  return animTime;
}

export function setAnimTime(val) {
  animTime = val;
}

export function addAnimTime(delta) {
  animTime += delta;
}

// 拍次操作
export function getCurrentShot() {
  return state.shots[state.currentShot] || null;
}

export function getShot(index) {
  return state.shots[index] || null;
}

export function getShots() {
  return state.shots;
}

export function setShots(shots) {
  state.shots = shots;
}

export function getCurrentIndex() {
  return state.currentShot;
}

export function setCurrentIndex(idx) {
  if (idx >= 0 && idx < state.shots.length) {
    state.currentShot = idx;
  }
}

// 歷史記錄
export function pushHistory() {
  state.history.push(JSON.stringify(state.shots));
  state.redoHistory = [];
}

export function undo() {
  if (state.history.length === 0) return null;
  state.redoHistory.push(JSON.stringify(state.shots));
  return JSON.parse(state.history.pop());
}

export function redo() {
  if (state.redoHistory.length === 0) return null;
  state.history.push(JSON.stringify(state.shots));
  return JSON.parse(state.redoHistory.pop());
}

// 自由繪圖
export function getFreeDraw() {
  return state.freeDraw;
}

export function setFreeDraw(fd) {
  state.freeDraw = { ...state.freeDraw, ...fd };
}

export function addFreePath(path) {
  state.freeDraw.paths.push(path);
  state.freeDraw.redoPaths = [];
}

export function undoFreeDraw() {
  if (state.freeDraw.paths.length === 0) return;
  state.freeDraw.redoPaths.push(state.freeDraw.paths.pop());
}

export function clearFreeDraw() {
  state.freeDraw.paths = [];
  state.freeDraw.redoPaths = [];
}