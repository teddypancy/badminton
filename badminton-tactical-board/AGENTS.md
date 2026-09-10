# AGENTS.md - 羽球戰術板 v0.2

## 專案說明

瀏覽器端羽球戰術模擬工具。純前端，零構建步驟，無 npm 依賴。
技術棧：原生 HTML + CSS + ES Modules + Three.js (CDN)。

## 目錄結構

badminton-tactical-board/
├── BTB.html              # 唯一入口
├── css/                  # 模組化樣式（18 個文件）
│   ├── main.css          # 入口，@import 其餘
│   ├── base/             # 變數、重置、排版
│   ├── components/       # 按鈕、面板、表單、彈窗
│   ├── layout/           # 頂欄、抽屜、側欄
│   ├── pages/            # 場地、腳本、日誌
│   └── responsive.css    # 響應式（必須最後載入）
└── js/                   # ES Modules（18 個文件）
    ├── main.js           # 應用入口
    ├── config/           # 常量
    ├── core/             # 狀態、物理、軌跡
    ├── models/           # 拍次、球員
    ├── 2d/               # Canvas 渲染、交互
    ├── 3d/               # Three.js 場景、實體、動畫
    ├── ui/               # 面板、日誌、腳本
    └── utils/            # 工具函數

## 硬約束（不可違反）

- 禁止引入 npm / webpack / vite 等構建工具。這是零構建專案。
- 禁止將 CSS 合回單文件。已模組化拆分，保持現狀。
- 禁止在 js/ 中使用 CommonJS（require）。全部用 ES Modules。
- Three.js 版本鎖定 0.147.0，通過 importmap 從 CDN 載入。禁止升級。
- 所有物理計算必須走 js/core/physics.js 的 getTrajectoryPoint()。禁止在渲染層自行計算軌跡。
- 新增 UI 文字用繁體中文。
- 修改 CSS 後，確認 css/main.css 的 @import 順序不變（responsive.css 必須最後）。
- 修改 js/main.js 的全局函數暴露時，同步更新 window.* 賦值。

## 關鍵文件索引

| 需求 | 該讀哪個文件 |
|------|-------------|
| 修改 2D 渲染 | js/2d/renderer.js |
| 修改 2D 交互/拖拽 | js/2d/interactions.js |
| 修改 3D 場景 | js/3d/scene.js |
| 修改 3D 球場/球員/球 | js/3d/entities.js |
| 修改 3D 動畫播放 | js/3d/animation.js |
| 修改 3D 視角 | js/3d/controls.js |
| 修改物理診斷 | js/core/physics.js |
| 修改軌跡計算 | js/core/physics.js 的 getTrajectoryPoint() |
| 修改拍次邏輯 | js/models/shot.js |
| 修改球員站位 | js/models/player.js |
| 修改參數面板 | js/ui/panels.js |
| 修改日誌 | js/ui/logs.js |
| 修改腳本管理 | js/ui/scripts.js |
| 修改常量/球路定義 | js/config/constants.js |
| 修改按鈕樣式 | css/components/buttons.css |
| 修改面板寬度 | css/layout/sidebar.css |
| 修改頂欄 | css/layout/topbar.css |
| 修改手機版樣式 | css/responsive.css |
| 修改顏色/間距變數 | css/base/variables.css |

## 工作方式（極重要）

### 用戶是編程基礎薄弱者，請遵守以下對話模式

**預設行為**：只讀不改，先定位再修改。

1. **收到「修改 X」但未指定位置時**：
   - 先讀取相關文件
   - 回報：文件名、行號、當前值、可調參數、修改效果
   - 明確說「先不要修改任何東西」
   - 等用戶確認後才動手

2. **收到精準修改指令時**：
   - 只改指定的那處
   - 其他都不要動
   - 改完回報：改了哪個文件、哪一行、從什麼改成什麼

3. **收到模糊需求（如「優化 UI」）時**：
   - 先問清楚：改哪個區域？想要什麼效果？
   - 不要自行猜測並大範圍修改

4. **修改前必須**：
   - 完整讀取要改的文件
   - 確認修改不會影響其他模組

5. **修改後必須**：
   - 完整貼出修改後的完整文件（不要只給局部代碼）
   - 告訴用戶怎麼測試

### 禁止行為

- 禁止一次改多個文件（除任務本身跨文件）
- 禁止在未確認問題前就開始改
- 禁止「順便」優化其他代碼
- 禁止引入專案未使用的依賴
- 禁止修改未提及的參數

## 常用命令

| 操作 | 命令 |
|------|------|
| 本地預覽 | 用任意靜態伺服器打開 BTB.html（如 python -m http.server） |
| 檢查錯誤 | 瀏覽器 F12 → Console |

## 當前版本

v0.2