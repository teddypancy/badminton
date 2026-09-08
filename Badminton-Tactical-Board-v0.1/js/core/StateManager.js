/*
==================================================
File:
StateManager.js

Module:
Global Application State

Version:
v0.1

Responsibility:
Manage shared system data.

Central Data:
GameState

==================================================
*/


const GameState = {

    currentScript:null,

    players:{},

    shots:[],

    trajectory:null,

    diagnosis:null,

    runtime:{
        playing:false
    }

};


class StateManager {

    static getState() {
        return GameState;
    }


    static update(key,value) {

        GameState[key] = value;

    }

}

export default StateManager;
