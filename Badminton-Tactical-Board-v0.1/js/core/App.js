/*
==================================================
File:
App.js

Module:
Core Application Controller

Responsibility:
Initialize system modules.
==================================================
*/

import EventBus from "./EventBus.js";
import StateManager from "./StateManager.js";


class App {

    static start() {

        console.log(
            "App Initialization..."
        );

        this.initializeState();
        this.initializeEvents();

        console.log(
            "Core Initialized"
        );

    }


    static initializeState() {

        const state = StateManager.getState();

        console.log(
            "GameState:",
            state
        );

    }


    static initializeEvents() {

        EventBus.emit(
            "SYSTEM_READY",
            {
                status:"ready"
            }
        );

    }

}

export default App;
