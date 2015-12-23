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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImtleXMudHMiXSwibmFtZXMiOlsia2V5Q29kZVRvU3RyaW5nIl0sIm1hcHBpbmdzIjoiQUE4QkEsWUFBWSxDQUFDO09BSU4sRUFBRSxLQUFLLEVBQUUsTUFBTSxPQUFPO0FBSzdCLElBQUksSUFBSSxHQUFHO0lBQ1AsYUFBYSxFQUFFO1FBQ1gsRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLE1BQU07S0FDbEQ7SUFFRCxRQUFRLEVBQUU7UUFDTixNQUFNLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQztRQUM1QyxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQztLQUNoRDtJQUVELGFBQWEsRUFBRTtRQUNYLENBQUMsRUFBRSxXQUFXO1FBQ2QsQ0FBQyxFQUFFLEtBQUs7UUFDUixFQUFFLEVBQUUsUUFBUTtRQUNaLEVBQUUsRUFBRSxPQUFPO1FBQ1gsRUFBRSxFQUFFLEtBQUs7UUFDVCxFQUFFLEVBQUUsT0FBTztRQUNYLEVBQUUsRUFBRSxRQUFRO1FBQ1osRUFBRSxFQUFFLFVBQVU7UUFDZCxFQUFFLEVBQUUsS0FBSztRQUNULEVBQUUsRUFBRSxNQUFNO1FBQ1YsRUFBRSxFQUFFLE1BQU07UUFDVixFQUFFLEVBQUUsSUFBSTtRQUNSLEVBQUUsRUFBRSxPQUFPO1FBQ1gsRUFBRSxFQUFFLE1BQU07UUFDVixFQUFFLEVBQUUsT0FBTztRQUNYLEVBQUUsRUFBRSxRQUFRO1FBQ1osRUFBRSxFQUFFLFFBQVE7UUFDWixFQUFFLEVBQUUsU0FBUztRQUNiLEVBQUUsRUFBRSxTQUFTO1FBQ2IsRUFBRSxFQUFFLFNBQVM7UUFDYixFQUFFLEVBQUUsU0FBUztRQUNiLEdBQUcsRUFBRSxTQUFTO1FBQ2QsR0FBRyxFQUFFLFNBQVM7UUFDZCxHQUFHLEVBQUUsU0FBUztRQUNkLEdBQUcsRUFBRSxTQUFTO1FBQ2QsR0FBRyxFQUFFLFNBQVM7UUFDZCxHQUFHLEVBQUUsU0FBUztRQUNkLEtBQUssRUFBRSxhQUFhO1FBQ3BCLEdBQUcsRUFBRSxJQUFJO1FBQ1QsR0FBRyxFQUFFLElBQUk7UUFDVCxHQUFHLEVBQUUsSUFBSTtRQUNULEdBQUcsRUFBRSxJQUFJO1FBQ1QsR0FBRyxFQUFFLElBQUk7UUFDVCxHQUFHLEVBQUUsSUFBSTtRQUNULEdBQUcsRUFBRSxJQUFJO1FBQ1QsR0FBRyxFQUFFLElBQUk7UUFDVCxHQUFHLEVBQUUsSUFBSTtRQUNULEdBQUcsRUFBRSxLQUFLO1FBQ1YsR0FBRyxFQUFFLEtBQUs7UUFDVixHQUFHLEVBQUUsS0FBSztRQUNWLEdBQUcsRUFBRSxTQUFTO1FBQ2QsR0FBRyxFQUFFLFlBQVk7S0FDcEI7SUFFRCxjQUFjLEVBQUU7UUFDWixFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRztRQUM3RCxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRztRQUM3RCxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRztRQUM3RCxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRztRQUM3RCxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRztRQUM3RCxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztRQUNoRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztRQUNwRSxHQUFHLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLElBQUk7S0FDakM7SUFDRCxLQUFLLEVBQUUsRUFBRTtJQUNULEdBQUcsRUFBRSxFQUFFO0lBQ1AsTUFBTSxFQUFFLEVBQUU7SUFDVixHQUFHLEVBQUUsRUFBRTtDQUNWLENBQUM7QUFHRixJQUFJLElBQUksRUFBRSxDQUFDLENBQUM7QUFDWixHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7SUFDM0IsSUFBSSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDM0MsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLFFBQVEsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFDakMsQ0FBQztBQUdELEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztJQUM1QixJQUFJLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUM1QyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsUUFBUSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztBQUNqQyxDQUFDO0FBR0QsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7QUFDaEMsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7QUFDakMsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7QUFJaEMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQztBQUVoQixDQUFDO0lBRUcsSUFBSSxJQUFJLEdBQVEsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztJQUNoRCxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxDQUFDO1FBQzFDLElBQUksQ0FBQyxHQUFHLFVBQVMsQ0FBUztZQUN0QixNQUFNLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDaEMsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxRQUFRLEdBQWEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4QyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQztJQUN0RCxDQUFDO0FBQ0wsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUVMLFdBQVcsYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUM7QUFDOUMsV0FBVyxjQUFjLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQztBQUNoRCxXQUFXLGFBQWEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDO0FBQzlDLFdBQVcsUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUM7QUFHcEMsV0FBVyxLQUFLLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQ2xDLFdBQVcsTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUM7QUFDN0IsV0FBVyxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBRWhDLGdDQUFnQyxPQUFlO0lBRTNDQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtJQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsU0FBU0EsS0FBS0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDaENBLFNBQVNBLEdBQUdBLE1BQU1BLENBQUNBLFlBQVlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO0lBQzdDQSxDQUFDQTtJQUNEQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQTtBQUNuQ0EsQ0FBQ0E7QUFFRCxlQUFlLElBQUksQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qISBAbGljZW5zZVxuPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblNwcm91dENvcmUgLS0gSmF2YVNjcmlwdCBBcHBsaWNhdGlvbiBGcmFtZXdvcmtcbmNvcHlyaWdodCAyMDA2LTIwMDksIFNwcm91dCBTeXN0ZW1zIEluYy4sIEFwcGxlIEluYy4gYW5kIGNvbnRyaWJ1dG9ycy5cblxuUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbmNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSxcbnRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb25cbnRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLFxuYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlXG5Tb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuXG5UaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG5cblRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbklNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG5BVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG5MSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lOR1xuRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUlxuREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG5TcHJvdXRDb3JlIGFuZCB0aGUgU3Byb3V0Q29yZSBsb2dvIGFyZSB0cmFkZW1hcmtzIG9mIFNwcm91dCBTeXN0ZW1zLCBJbmMuXG5cbkZvciBtb3JlIGluZm9ybWF0aW9uIGFib3V0IFNwcm91dENvcmUsIHZpc2l0IGh0dHA6Ly93d3cuc3Byb3V0Y29yZS5jb21cblxuXG49PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuQGxpY2Vuc2UgKi9cblwidXNlIHN0cmljdFwiO1xuXG4vLyBNb3N0IG9mIHRoZSBmb2xsb3dpbmcgY29kZSBpcyB0YWtlbiBmcm9tIFNwcm91dENvcmUgd2l0aCBhIGZldyBjaGFuZ2VzLlxuXG5pbXBvcnQgeyBtaXhpbiB9IGZyb20gJy4vb29wJztcblxuLypcbiAqIEhlbHBlciBmdW5jdGlvbnMgYW5kIGhhc2hlcyBmb3Iga2V5IGhhbmRsaW5nLlxuICovXG52YXIgS2V5cyA9IHtcbiAgICBNT0RJRklFUl9LRVlTOiB7XG4gICAgICAgIDE2OiAnU2hpZnQnLCAxNzogJ0N0cmwnLCAxODogJ0FsdCcsIDIyNDogJ01ldGEnXG4gICAgfSxcblxuICAgIEtFWV9NT0RTOiB7XG4gICAgICAgIFwiY3RybFwiOiAxLCBcImFsdFwiOiAyLCBcIm9wdGlvblwiOiAyLCBcInNoaWZ0XCI6IDQsXG4gICAgICAgIFwic3VwZXJcIjogOCwgXCJtZXRhXCI6IDgsIFwiY29tbWFuZFwiOiA4LCBcImNtZFwiOiA4XG4gICAgfSxcblxuICAgIEZVTkNUSU9OX0tFWVM6IHtcbiAgICAgICAgODogXCJCYWNrc3BhY2VcIixcbiAgICAgICAgOTogXCJUYWJcIixcbiAgICAgICAgMTM6IFwiUmV0dXJuXCIsXG4gICAgICAgIDE5OiBcIlBhdXNlXCIsXG4gICAgICAgIDI3OiBcIkVzY1wiLFxuICAgICAgICAzMjogXCJTcGFjZVwiLFxuICAgICAgICAzMzogXCJQYWdlVXBcIixcbiAgICAgICAgMzQ6IFwiUGFnZURvd25cIixcbiAgICAgICAgMzU6IFwiRW5kXCIsXG4gICAgICAgIDM2OiBcIkhvbWVcIixcbiAgICAgICAgMzc6IFwiTGVmdFwiLFxuICAgICAgICAzODogXCJVcFwiLFxuICAgICAgICAzOTogXCJSaWdodFwiLFxuICAgICAgICA0MDogXCJEb3duXCIsXG4gICAgICAgIDQ0OiBcIlByaW50XCIsXG4gICAgICAgIDQ1OiBcIkluc2VydFwiLFxuICAgICAgICA0NjogXCJEZWxldGVcIixcbiAgICAgICAgOTY6IFwiTnVtcGFkMFwiLFxuICAgICAgICA5NzogXCJOdW1wYWQxXCIsXG4gICAgICAgIDk4OiBcIk51bXBhZDJcIixcbiAgICAgICAgOTk6IFwiTnVtcGFkM1wiLFxuICAgICAgICAxMDA6IFwiTnVtcGFkNFwiLFxuICAgICAgICAxMDE6IFwiTnVtcGFkNVwiLFxuICAgICAgICAxMDI6IFwiTnVtcGFkNlwiLFxuICAgICAgICAxMDM6IFwiTnVtcGFkN1wiLFxuICAgICAgICAxMDQ6IFwiTnVtcGFkOFwiLFxuICAgICAgICAxMDU6IFwiTnVtcGFkOVwiLFxuICAgICAgICAnLTEzJzogXCJOdW1wYWRFbnRlclwiLFxuICAgICAgICAxMTI6IFwiRjFcIixcbiAgICAgICAgMTEzOiBcIkYyXCIsXG4gICAgICAgIDExNDogXCJGM1wiLFxuICAgICAgICAxMTU6IFwiRjRcIixcbiAgICAgICAgMTE2OiBcIkY1XCIsXG4gICAgICAgIDExNzogXCJGNlwiLFxuICAgICAgICAxMTg6IFwiRjdcIixcbiAgICAgICAgMTE5OiBcIkY4XCIsXG4gICAgICAgIDEyMDogXCJGOVwiLFxuICAgICAgICAxMjE6IFwiRjEwXCIsXG4gICAgICAgIDEyMjogXCJGMTFcIixcbiAgICAgICAgMTIzOiBcIkYxMlwiLFxuICAgICAgICAxNDQ6IFwiTnVtbG9ja1wiLFxuICAgICAgICAxNDU6IFwiU2Nyb2xsbG9ja1wiXG4gICAgfSxcblxuICAgIFBSSU5UQUJMRV9LRVlTOiB7XG4gICAgICAgIDMyOiAnICcsIDQ4OiAnMCcsIDQ5OiAnMScsIDUwOiAnMicsIDUxOiAnMycsIDUyOiAnNCcsIDUzOiAnNScsXG4gICAgICAgIDU0OiAnNicsIDU1OiAnNycsIDU2OiAnOCcsIDU3OiAnOScsIDU5OiAnOycsIDYxOiAnPScsIDY1OiAnYScsXG4gICAgICAgIDY2OiAnYicsIDY3OiAnYycsIDY4OiAnZCcsIDY5OiAnZScsIDcwOiAnZicsIDcxOiAnZycsIDcyOiAnaCcsXG4gICAgICAgIDczOiAnaScsIDc0OiAnaicsIDc1OiAnaycsIDc2OiAnbCcsIDc3OiAnbScsIDc4OiAnbicsIDc5OiAnbycsXG4gICAgICAgIDgwOiAncCcsIDgxOiAncScsIDgyOiAncicsIDgzOiAncycsIDg0OiAndCcsIDg1OiAndScsIDg2OiAndicsXG4gICAgICAgIDg3OiAndycsIDg4OiAneCcsIDg5OiAneScsIDkwOiAneicsIDEwNzogJysnLCAxMDk6ICctJywgMTEwOiAnLicsXG4gICAgICAgIDE4NzogJz0nLCAxODg6ICcsJywgMTg5OiAnLScsIDE5MDogJy4nLCAxOTE6ICcvJywgMTkyOiAnYCcsIDIxOTogJ1snLFxuICAgICAgICAyMjA6ICdcXFxcJywgMjIxOiAnXScsIDIyMjogJ1xcJydcbiAgICB9LFxuICAgIGVudGVyOiAxMyxcbiAgICBlc2M6IDI3LFxuICAgIGVzY2FwZTogMjcsXG4gICAgZGVsOiA0NlxufTtcblxuLy8gQSByZXZlcnNlIG1hcCBvZiBGVU5DVElPTl9LRVlTXG52YXIgbmFtZSwgaTtcbmZvciAoaSBpbiBLZXlzLkZVTkNUSU9OX0tFWVMpIHtcbiAgICBuYW1lID0gS2V5cy5GVU5DVElPTl9LRVlTW2ldLnRvTG93ZXJDYXNlKCk7XG4gICAgS2V5c1tuYW1lXSA9IHBhcnNlSW50KGksIDEwKTtcbn1cblxuLy8gQSByZXZlcnNlIG1hcCBvZiBQUklOVEFCTEVfS0VZU1xuZm9yIChpIGluIEtleXMuUFJJTlRBQkxFX0tFWVMpIHtcbiAgICBuYW1lID0gS2V5cy5QUklOVEFCTEVfS0VZU1tpXS50b0xvd2VyQ2FzZSgpO1xuICAgIEtleXNbbmFtZV0gPSBwYXJzZUludChpLCAxMCk7XG59XG5cbi8vIEFkZCB0aGUgTU9ESUZJRVJfS0VZUywgRlVOQ1RJT05fS0VZUyBhbmQgUFJJTlRBQkxFX0tFWVMgdG8gdGhlIEtFWSB2YXJpYWJsZXMgYXMgd2VsbC5cbm1peGluKEtleXMsIEtleXMuTU9ESUZJRVJfS0VZUyk7XG5taXhpbihLZXlzLCBLZXlzLlBSSU5UQUJMRV9LRVlTKTtcbm1peGluKEtleXMsIEtleXMuRlVOQ1RJT05fS0VZUyk7XG5cblxuLy8gd29ya2Fyb3VuZCBmb3IgZmlyZWZveCBidWdcbktleXNbMTczXSA9ICctJztcblxuKGZ1bmN0aW9uKCkge1xuICAgIC8vIFdoeSBkbyBJIG5lZWQgdG8gc2V0IGFueSBoZXJlIHJhdGhlciB0aGFuIHN0cmluZz9cbiAgICB2YXIgbW9kczogYW55ID0gW1wiY21kXCIsIFwiY3RybFwiLCBcImFsdFwiLCBcInNoaWZ0XCJdO1xuICAgIGZvciAodmFyIGkgPSBNYXRoLnBvdygyLCBtb2RzLmxlbmd0aCk7IGktLTspIHtcbiAgICAgICAgdmFyIGYgPSBmdW5jdGlvbihzOiBzdHJpbmcpOiBudW1iZXIge1xuICAgICAgICAgICAgcmV0dXJuIGkgJiBLZXlzLktFWV9NT0RTW3NdO1xuICAgICAgICB9O1xuICAgICAgICB2YXIgZmlsdHJhdGU6IG51bWJlcltdID0gbW9kcy5maWx0ZXIoZik7XG4gICAgICAgIEtleXMuS0VZX01PRFNbaV0gPSBtb2RzLmZpbHRlcihmKS5qb2luKFwiLVwiKSArIFwiLVwiO1xuICAgIH1cbn0pKCk7XG5cbmV4cG9ydCB2YXIgRlVOQ1RJT05fS0VZUyA9IEtleXMuRlVOQ1RJT05fS0VZUztcbmV4cG9ydCB2YXIgUFJJTlRBQkxFX0tFWVMgPSBLZXlzLlBSSU5UQUJMRV9LRVlTO1xuZXhwb3J0IHZhciBNT0RJRklFUl9LRVlTID0gS2V5cy5NT0RJRklFUl9LRVlTO1xuZXhwb3J0IHZhciBLRVlfTU9EUyA9IEtleXMuS0VZX01PRFM7XG5cbi8vIGFsaWFzZXNcbmV4cG9ydCB2YXIgZW50ZXIgPSBLZXlzW1wicmV0dXJuXCJdO1xuZXhwb3J0IHZhciBlc2NhcGUgPSBLZXlzLmVzYztcbmV4cG9ydCB2YXIgZGVsID0gS2V5c1tcImRlbGV0ZVwiXTtcblxuZXhwb3J0IGZ1bmN0aW9uIGtleUNvZGVUb1N0cmluZyhrZXlDb2RlOiBudW1iZXIpOiBzdHJpbmcge1xuICAgIC8vIExhbmd1YWdlLXN3aXRjaGluZyBrZXlzdHJva2UgaW4gQ2hyb21lL0xpbnV4IGVtaXRzIGtleUNvZGUgMC5cbiAgICB2YXIga2V5U3RyaW5nID0gS2V5c1trZXlDb2RlXTtcbiAgICBpZiAodHlwZW9mIGtleVN0cmluZyAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICBrZXlTdHJpbmcgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGtleUNvZGUpO1xuICAgIH1cbiAgICByZXR1cm4ga2V5U3RyaW5nLnRvTG93ZXJDYXNlKCk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IEtleXM7XG4iXX0=