# TRAE_RULES.md — 羽球戰術板 v0.3 專用

## 用途
規範 Trae Agent 在本專案的回覆格式與行為，降低 token 消耗。

---

## 一、回覆格式（強制）

固定四段，順序不可調換：

[改動] 檔案 | 行號 | 舊 | 新
[數據] 欄位表
[錯誤] 有→貼全文；無→寫「無」

- 禁止段落：前言、總結、心得、建議、延伸、確認語。
- 禁止詞：我判斷、我確認、根因、因為、所以、成功、失敗、通過、修復、應該、建議、可以考慮。
- 卡住時只寫一行：卡住：<一句話>，停止該步驟，不找替代做法。

---

## 二、行為規則（強制）

1. 收到「修改 X」未指定位置：只讀檔、只回報（檔案、行號、當前值、可調參數、效果），最後加一行 先不要修改任何東西。
2. 收到精準指令：只改指定那一處，其他不動。
3. 收到模糊需求：只回一行 請指定：區域 / 目標效果，不猜、不改。
4. 修改前：完整讀取目標檔。
5. 修改後：完整貼出整個檔案（不論多大），再寫測試方法。
6. 一次只改一個檔（任務本身跨檔除外）。

---

## 三、硬約束（違反即回退）

- 禁 npm / webpack / vite。
- 禁合併 CSS；responsive.css 必須最後載入。
- js/ 全部 ES Modules，禁 require。
- Three.js 鎖 0.147.0，禁升級。
- 軌跡一律走 js/core/physics.js 的 getTrajectoryPoint()；渲染層禁自算。
- UI 文字用繁體中文。
- 改 main.js 全局函數時同步更新 window.*。
- localStorage key 維持 v0.2 字樣，不換。
- 修改後必須完整貼出整個檔案（非局部）。

---

## 四、Token 精簡規則

- 不重述用戶問題。
- 不重述已知規範。
- 不貼未改動的程式碼片段。
- 不解釋「為什麼這樣改」。
- 一次回覆只給：改動清單 + 數據 + 錯誤。
- 需要讀檔時，只貼出與修改相關的行號區間。
- 禁止條列式長篇說明；能用一行表達就不用兩行。

---

## 五、測試指令格式

用 <方法> 跑，參數：<全部寫死>
記錄欄位：<只列要的>

- 參數不可留空、不可寫「依情況」。
- 記錄欄位只列本次驗證需要的。

---

## 六、關鍵文件索引（查表用，不重述）

| 需求 | 檔案 |
|------|------|
| 2D 渲染 | js/2d/renderer.js |
| 2D 交互 | js/2d/interactions.js |
| 3D 場景 | js/3d/scene.js |
| 3D 實體 | js/3d/entities.js |
| 3D 動畫 | js/3d/animation.js |
| 3D 視角 | js/3d/controls.js |
| 物理/軌跡 | js/core/physics.js |
| 拍次邏輯 | js/models/shot.js |
| 球員站位 | js/models/player.js |
| 參數面板 | js/ui/panels.js |
| 日誌 | js/ui/logs.js |
| 腳本管理 | js/ui/scripts.js |
| 常數/球路 | js/config/constants.js |
| 按鈕樣式 | css/components/buttons.css |
| 面板寬度 | css/layout/sidebar.css |
| 頂欄 | css/layout/topbar.css |
| 手機版 | css/responsive.css |
| 顏色變數 | css/base/variables.css |

---

## 七、當前版本

v0.3｜待辦：O4、O6（v0.4）