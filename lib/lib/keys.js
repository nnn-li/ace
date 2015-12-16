"use strict";
import { mixin } from './oop';
var Keys = {
    MODIFIER_KEYS: {
        16: 'Shift', 17: 'Ctrl', 18: 'Alt', 224: 'Meta'
    },
    KEY_MODS: {
        "ctrl": 1, "alt": 2, "option": 2, "shift": 4,
        "super": 8, "meta": 8, "command": 8, "cmd": 8
    },
    FUNCTION_KEYS: {
        8: "Backspace",
        9: "Tab",
        13: "Return",
        19: "Pause",
        27: "Esc",
        32: "Space",
        33: "PageUp",
        34: "PageDown",
        35: "End",
        36: "Home",
        37: "Left",
        38: "Up",
        39: "Right",
        40: "Down",
        44: "Print",
        45: "Insert",
        46: "Delete",
        96: "Numpad0",
        97: "Numpad1",
        98: "Numpad2",
        99: "Numpad3",
        100: "Numpad4",
        101: "Numpad5",
        102: "Numpad6",
        103: "Numpad7",
        104: "Numpad8",
        105: "Numpad9",
        '-13': "NumpadEnter",
        112: "F1",
        113: "F2",
        114: "F3",
        115: "F4",
        116: "F5",
        117: "F6",
        118: "F7",
        119: "F8",
        120: "F9",
        121: "F10",
        122: "F11",
        123: "F12",
        144: "Numlock",
        145: "Scrolllock"
    },
    PRINTABLE_KEYS: {
        32: ' ', 48: '0', 49: '1', 50: '2', 51: '3', 52: '4', 53: '5',
        54: '6', 55: '7', 56: '8', 57: '9', 59: ';', 61: '=', 65: 'a',
        66: 'b', 67: 'c', 68: 'd', 69: 'e', 70: 'f', 71: 'g', 72: 'h',
        73: 'i', 74: 'j', 75: 'k', 76: 'l', 77: 'm', 78: 'n', 79: 'o',
        80: 'p', 81: 'q', 82: 'r', 83: 's', 84: 't', 85: 'u', 86: 'v',
        87: 'w', 88: 'x', 89: 'y', 90: 'z', 107: '+', 109: '-', 110: '.',
        187: '=', 188: ',', 189: '-', 190: '.', 191: '/', 192: '`', 219: '[',
        220: '\\', 221: ']', 222: '\''
    },
    enter: 13,
    esc: 27,
    escape: 27,
    del: 46
};
var name, i;
for (i in Keys.FUNCTION_KEYS) {
    name = Keys.FUNCTION_KEYS[i].toLowerCase();
    Keys[name] = parseInt(i, 10);
}
for (i in Keys.PRINTABLE_KEYS) {
    name = Keys.PRINTABLE_KEYS[i].toLowerCase();
    Keys[name] = parseInt(i, 10);
}
mixin(Keys, Keys.MODIFIER_KEYS);
mixin(Keys, Keys.PRINTABLE_KEYS);
mixin(Keys, Keys.FUNCTION_KEYS);
Keys[173] = '-';
(function () {
    var mods = ["cmd", "ctrl", "alt", "shift"];
    for (var i = Math.pow(2, mods.length); i--;) {
        var f = function (s) {
            return i & Keys.KEY_MODS[s];
        };
        var filtrate = mods.filter(f);
        Keys.KEY_MODS[i] = mods.filter(f).join("-") + "-";
    }
})();
export var FUNCTION_KEYS = Keys.FUNCTION_KEYS;
export var PRINTABLE_KEYS = Keys.PRINTABLE_KEYS;
export var MODIFIER_KEYS = Keys.MODIFIER_KEYS;
export var KEY_MODS = Keys.KEY_MODS;
export var enter = Keys["return"];
export var escape = Keys.esc;
export var del = Keys["delete"];
export function keyCodeToString(keyCode) {
    var keyString = Keys[keyCode];
    if (typeof keyString !== "string") {
        keyString = String.fromCharCode(keyCode);
    }
    return keyString.toLowerCase();
}
export default Keys;