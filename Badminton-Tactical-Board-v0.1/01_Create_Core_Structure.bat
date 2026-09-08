@echo off
chcp 65001 >nul
title Badminton Tactical Board v0.1 - Core Structure Creator

echo.
echo ============================================
echo  Badminton Tactical Board v0.1
echo  Phase 1 - Core Architecture Generator
echo ============================================
echo.


REM ============================================
REM 建立核心資料夾
REM ============================================

echo Creating folders...

if not exist js mkdir js
if not exist js\core mkdir js\core
if not exist js\config mkdir js\config
if not exist docs mkdir docs


echo Folder creation completed.
echo.


REM ============================================
REM 建立 main.js
REM ============================================

if not exist js\main.js (

echo /*
echo ==================================================
echo File:
echo main.js
echo.
echo Module:
echo Application Entry Point
echo.
echo Version:
echo v0.1
echo.
echo Responsibility:
echo Initialize badminton tactical board system.
echo.
echo Responsibilities:
echo - Start application
echo - Load core modules
echo - Initialize system state
echo.
echo Do Not:
echo - Put UI logic here
echo - Put physics calculation here
echo.
echo ==================================================
echo */


) > js\main.js

echo Created: js\main.js


REM ============================================
REM 建立 App.js
REM ============================================

if not exist js\core\App.js (

echo /*
echo ==================================================
echo File:
echo App.js
echo.
echo Module:
echo Core Application Controller
echo.
echo Version:
echo v0.1
echo.
echo Responsibility:
echo Manage system startup sequence.
echo.
echo Main Flow:
echo main.js
echo   ^
echo App.start()
echo   ^
echo Initialize modules
echo.
echo ==================================================
echo */
echo.
echo.
echo class App {
echo.
echo     static start^(^) {
echo         console.log^("Badminton Tactical Board v0.1 Started"^);
echo     }
echo.
echo }
echo.
echo export default App;

) > js\core\App.js

echo Created: js\core\App.js


REM ============================================
REM 建立 EventBus.js
REM ============================================

if not exist js\core\EventBus.js (

echo /*
echo ==================================================
echo File:
echo EventBus.js
echo.
echo Module:
echo System Event Communication
echo.
echo Version:
echo v0.1
echo.
echo Responsibility:
echo Provide communication between modules.
echo.
echo Example:
echo UI
echo  ^
echo EventBus
echo  ^
echo Engine
echo.
echo ==================================================
echo */
echo.
echo.
echo class EventBus {
echo.
echo     static events = {};
echo.
echo     static on^(event, callback^) {
echo.
echo         if ^(!this.events[event]^)
echo             this.events[event] = [];
echo.
echo         this.events[event].push^(callback^);
echo     }
echo.
echo.
echo     static emit^(event, data^) {
echo.
echo         if ^(this.events[event]^) {
echo.
echo             this.events[event].forEach^(callback =^> {
echo                 callback^(data^);
echo             });
echo         }
echo     }
echo.
echo }
echo.
echo export default EventBus;

) > js\core\EventBus.js

echo Created: js\core\EventBus.js


REM ============================================
REM 建立 StateManager.js
REM ============================================

if not exist js\core\StateManager.js (

echo /*
echo ==================================================
echo File:
echo StateManager.js
echo.
echo Module:
echo Global Application State
echo.
echo Version:
echo v0.1
echo.
echo Responsibility:
echo Manage shared system data.
echo.
echo Central Data:
echo GameState
echo.
echo ==================================================
echo */
echo.
echo.
echo const GameState = {
echo.
echo     currentScript:null,
echo.
echo     players:{},
echo.
echo     shots:[],
echo.
echo     trajectory:null,
echo.
echo     diagnosis:null,
echo.
echo     runtime:{
echo         playing:false
echo     }
echo.
echo };
echo.
echo.
echo class StateManager {
echo.
echo     static getState^(^) {
echo         return GameState;
echo     }
echo.
echo.
echo     static update^(key,value^) {
echo.
echo         GameState[key] = value;
echo.
echo     }
echo.
echo }
echo.
echo export default StateManager;

) > js\core\StateManager.js

echo Created: js\core\StateManager.js


REM ============================================
REM 建立 Config 文件
REM ============================================


if not exist js\config\PhysicsConfig.js (

echo /*
echo Physics Configuration
echo Version: v0.1
echo.
echo Central physics parameters.
echo Modify here only.
echo */

echo.
echo const PhysicsConfig = {
echo.
echo     gravity:9.8,
echo.
echo     airResistance:0.02,
echo.
echo     maxApex:8
echo.
echo };
echo.
echo export default PhysicsConfig;

) > js\config\PhysicsConfig.js


echo Created: js\config\PhysicsConfig.js



if not exist js\config\PlayerConfig.js (

echo /*
echo Player Configuration
echo Version: v0.1
echo */

echo.
echo const PlayerConfig = {
echo.
echo     averageSpeed:3,
echo.
echo     maxSpeed:8
echo.
echo };
echo.
echo export default PlayerConfig;

) > js\config\PlayerConfig.js


echo Created: js\config\PlayerConfig.js



if not exist js\config\RuleConfig.js (

echo /*
echo Badminton Rule Configuration
echo Version: v0.1
echo */

echo.
echo const RuleConfig = {
echo.
echo     height:{
echo.
echo         high:2.0,
echo         middle:1.4,
echo         low:0
echo.
echo     },
echo.
echo     maxApex:8
echo.
echo };
echo.
echo export default RuleConfig;

) > js\config\RuleConfig.js


echo Created: js\config\RuleConfig.js


REM ============================================
REM 建立開發備註文件
REM ============================================

if not exist docs\DevelopmentNotes.md (

echo # 羽球戰術板 v0.1 Development Notes > docs\DevelopmentNotes.md
echo. >> docs\DevelopmentNotes.md
echo Version: v0.1 >> docs\DevelopmentNotes.md
echo. >> docs\DevelopmentNotes.md
echo Phase 1: Core Architecture Created >> docs\DevelopmentNotes.md

)

echo Created: docs\DevelopmentNotes.md


echo.
echo ============================================
echo Core Architecture Created Successfully.
echo ============================================
echo.

pause