/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

/*
 * I hate doing this, but we need some way to determine if the user is on a Mac
 * The reason is that users have different expectations of their key combinations.
 *
 * Take copy as an example, Mac people expect to use CMD or APPLE + C
 * Windows folks expect to use CTRL + C
 */
export var OS = {
  LINUX: "LINUX",
  MAC: "MAC",
  WINDOWS: "WINDOWS"
};

/**
 * Return an exports.OS constant
 */
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

// this can be called in non browser environments (e.g. from ace/requirejs/text)
//if (typeof navigator != "object") {
//  return;
//}

var os = (navigator.platform.match(/mac|win|linux/i) || ["other"])[0].toLowerCase();
var ua = navigator.userAgent;

// Is the user using a browser that identifies itself as Windows
export var isWin = (os == "win");

// Is the user using a browser that identifies itself as Mac OS
export var isMac = (os == "mac");

// Is the user using a browser that identifies itself as Linux
export var isLinux = (os == "linux");

// Windows Store JavaScript apps (aka Metro apps written in HTML5 and JavaScript) do not use the "Microsoft Internet Explorer" string in their user agent, but "MSAppHost" instead.
export var isIE =
    (navigator.appName == "Microsoft Internet Explorer" || navigator.appName.indexOf("MSAppHost") >= 0)
    ? parseFloat((ua.match(/(?:MSIE |Trident\/[0-9]+[\.0-9]+;.*rv:)([0-9]+[\.0-9]+)/) || [])[1])
    : parseFloat((ua.match(/(?:Trident\/[0-9]+[\.0-9]+;.*rv:)([0-9]+[\.0-9]+)/) || [])[1]); // for ie

export var isOldIE = isIE && isIE < 9;

// Is this Firefox or related?
export var isGecko = (('Controllers' in window) || ('controllers' in window)) && window.navigator.product === "Gecko";
export var isMozilla = isGecko;

// oldGecko == rev < 2.0 
export var isOldGecko = isGecko && parseInt((ua.match(/rv\:(\d+)/) || [])[1], 10) < 4;

// Is this Opera 
export var isOpera = ('opera' in window) && Object.prototype.toString.call(window['opera']) == "[object Opera]";

// Is the user using a browser that identifies itself as WebKit 
export var isWebKit = parseFloat(ua.split("WebKit/")[1]) || undefined;

export var isChrome = parseFloat(ua.split(" Chrome/")[1]) || undefined;

export var isChromeOS = ua.indexOf(" CrOS ") >= 0;

export var isAIR = ua.indexOf("AdobeAIR") >= 0;

export var isAndroid = ua.indexOf("Android") >= 0;

export var isIPad = ua.indexOf("iPad") >= 0;

export var isTouchPad = ua.indexOf("TouchPad") >= 0;

export var isMobile = isAndroid || isIPad || isTouchPad;
