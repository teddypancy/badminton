@echo off
chcp 65001 >nul
title Badminton Tactical Board v0.1 - Core Initialization

echo.
echo ============================================
echo Badminton Tactical Board v0.1
echo Phase 1-2 Core Initialization
echo ============================================
echo.


REM ============================================
REM 更新 main.js
REM ============================================

echo Updating main.js...


(
echo /*
echo ==================================================
echo File:
echo main.js
echo.
echo Module:
echo Application Entry
echo.
echo Version:
echo v0.1
echo.
echo Responsibility:
echo Start application.
echo ==================================================
echo */
echo.
echo import App from "./core/App.js";
echo.
echo console.log^("Loading Badminton Tactical Board v0.1..."^);
echo.
echo App.start^(^);
echo.
echo console.log^("System Ready"^);
echo.

) > js\main.js


REM ============================================
REM 更新 App.js
REM ============================================

echo Updating App.js...


(
echo /*
echo ==================================================
echo File:
echo App.js
echo.
echo Module:
echo Core Application Controller
echo.
echo Responsibility:
echo Initialize system modules.
echo ==================================================
echo */
echo.
echo import EventBus from "./EventBus.js";
echo import StateManager from "./StateManager.js";
echo.
echo.
echo class App {
echo.
echo     static start^(^) {
echo.
echo         console.log^(
echo             "App Initialization..."
echo         ^);
echo.
echo         this.initializeState^(^);
echo         this.initializeEvents^(^);
echo.
echo         console.log^(
echo             "Core Initialized"
echo         ^);
echo.
echo     }
echo.
echo.
echo     static initializeState^(^) {
echo.
echo         const state = StateManager.getState^(^);
echo.
echo         console.log^(
echo             "GameState:",
echo             state
echo         ^);
echo.
echo     }
echo.
echo.
echo     static initializeEvents^(^) {
echo.
echo         EventBus.emit^(
echo             "SYSTEM_READY",
echo             {
echo                 status:"ready"
echo             }
echo         ^);
echo.
echo     }
echo.
echo }
echo.
echo export default App;

) > js\core\App.js


REM ============================================
REM 建立 index.html Module 引用
REM ============================================

echo Updating index.html...


(
echo ^<!DOCTYPE html^>
echo ^<html lang="zh-TW"^>
echo.
echo ^<head^>
echo     ^<meta charset="UTF-8"^>
echo     ^<title^>羽球戰術板 v0.1^</title^>
echo ^</head^>
echo.
echo ^<body^>
echo.
echo     ^<h1^>
echo         羽球戰術板 v0.1
echo     ^</h1^>
echo.
echo     ^<div id="app"^>
echo         System Loading...
echo     ^</div^>
echo.
echo.
echo     ^<script type="module" src="./js/main.js"^>^</script^>
echo.
echo ^</body^>
echo.
echo ^</html^>

) > index.html


echo.
echo ============================================
echo Core Initialization Completed
echo ============================================
echo.

pause