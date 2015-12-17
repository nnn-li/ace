"use strict";
export var OS = {
    LINUX: "LINUX",
    MAC: "MAC",
    WINDOWS: "WINDOWS"
};
export function getOS() {
    if (isMac) {
        return OS.MAC;
    }
    else if (isLinux) {
        return OS.LINUX;
    }
    else {
        return OS.WINDOWS;
    }
}
var os = (navigator.platform.match(/mac|win|linux/i) || ["other"])[0].toLowerCase();
var ua = navigator.userAgent;
export var isWin = (os == "win");
export var isMac = (os == "mac");
export var isLinux = (os == "linux");
export var isIE = (navigator.appName == "Microsoft Internet Explorer" || navigator.appName.indexOf("MSAppHost") >= 0)
    ? parseFloat((ua.match(/(?:MSIE |Trident\/[0-9]+[\.0-9]+;.*rv:)([0-9]+[\.0-9]+)/) || [])[1])
    : parseFloat((ua.match(/(?:Trident\/[0-9]+[\.0-9]+;.*rv:)([0-9]+[\.0-9]+)/) || [])[1]);
export var isOldIE = isIE && isIE < 9;
export var isGecko = (('Controllers' in window) || ('controllers' in window)) && window.navigator.product === "Gecko";
export var isMozilla = isGecko;
export var isOldGecko = isGecko && parseInt((ua.match(/rv\:(\d+)/) || [])[1], 10) < 4;
export var isOpera = ('opera' in window) && Object.prototype.toString.call(window['opera']) == "[object Opera]";
export var isWebKit = parseFloat(ua.split("WebKit/")[1]) || undefined;
export var isChrome = parseFloat(ua.split(" Chrome/")[1]) || undefined;
export var isChromeOS = ua.indexOf(" CrOS ") >= 0;
export var isAIR = ua.indexOf("AdobeAIR") >= 0;
export var isAndroid = ua.indexOf("Android") >= 0;
export var isIPad = ua.indexOf("iPad") >= 0;
export var isTouchPad = ua.indexOf("TouchPad") >= 0;
export var isMobile = isAndroid || isIPad || isTouchPad;
