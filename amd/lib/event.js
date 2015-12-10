define(["require", "exports", './keys', './useragent'], function (require, exports, keys_1, useragent_1) {
    function addListener(target, type, callback, useCapture) {
        if (target.addEventListener) {
            return target.addEventListener(type, callback, false);
        }
    }
    exports.addListener = addListener;
    function removeListener(target, type, callback, useCapture) {
        if (target.removeEventListener) {
            return target.removeEventListener(type, callback, false);
        }
    }
    exports.removeListener = removeListener;
    /*
    * Prevents propagation and clobbers the default action of the passed event
    */
    function stopEvent(e) {
        stopPropagation(e);
        preventDefault(e);
        return false;
    }
    exports.stopEvent = stopEvent;
    function stopPropagation(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }
        else {
            e.cancelBubble = true;
        }
    }
    exports.stopPropagation = stopPropagation;
    function preventDefault(e) {
        // returnValue is no longer documented in typings.
        var RETURN_VALUE_DEPRECATED = 'returnValue';
        if (e.preventDefault) {
            e.preventDefault();
        }
        else if (e[RETURN_VALUE_DEPRECATED]) {
            e[RETURN_VALUE_DEPRECATED] = false;
        }
    }
    exports.preventDefault = preventDefault;
    /*
     * @return {Number} 0 for left button, 1 for middle button, 2 for right button
     */
    function getButton(e) {
        if (e.type == "dblclick")
            return 0;
        if (e.type == "contextmenu" || (useragent_1.isMac && (e.ctrlKey && !e.altKey && !e.shiftKey)))
            return 2;
        // DOM Event
        if (e.preventDefault) {
            return e.button;
        }
        else {
            return { 1: 0, 2: 2, 4: 1 }[e.button];
        }
    }
    exports.getButton = getButton;
    // FIXME: We should not be assuming the document as window.document!
    /**
     * Returns a function which may be used to manually release the mouse.
     */
    function capture(unused, acquireCaptureHandler, releaseCaptureHandler) {
        // FIXME: 'Document' is missing property 'onmouseleave' from 'HTMLElement'.
        var element = document;
        function releaseMouse(e) {
            // It seems redundant and cumbersome to provide this event to both handlers?
            acquireCaptureHandler && acquireCaptureHandler(e);
            releaseCaptureHandler && releaseCaptureHandler(e);
            removeListener(element, "mousemove", acquireCaptureHandler, true);
            removeListener(element, "mouseup", releaseMouse, true);
            removeListener(element, "dragstart", releaseMouse, true);
        }
        addListener(element, "mousemove", acquireCaptureHandler, true);
        addListener(element, "mouseup", releaseMouse, true);
        addListener(element, "dragstart", releaseMouse, true);
        return releaseMouse;
    }
    exports.capture = capture;
    /**
     * Adds a portable 'mousewheel' ['wheel','DOM MouseScroll'] listener to an element.
     */
    function addMouseWheelListener(element, callback) {
        if ("onmousewheel" in element) {
            addListener(element, "mousewheel", function (e) {
                var factor = 8;
                if (e['wheelDeltaX'] !== undefined) {
                    e['wheelX'] = -e['wheelDeltaX'] / factor;
                    e['wheelY'] = -e['wheelDeltaY'] / factor;
                }
                else {
                    e['wheelX'] = 0;
                    e['wheelY'] = -e.wheelDelta / factor;
                }
                callback(e);
            });
        }
        else if ("onwheel" in element) {
            addListener(element, "wheel", function (e) {
                var factor = 0.35;
                switch (e.deltaMode) {
                    case e.DOM_DELTA_PIXEL:
                        e.wheelX = e.deltaX * factor || 0;
                        e.wheelY = e.deltaY * factor || 0;
                        break;
                    case e.DOM_DELTA_LINE:
                    case e.DOM_DELTA_PAGE:
                        e.wheelX = (e.deltaX || 0) * 5;
                        e.wheelY = (e.deltaY || 0) * 5;
                        break;
                }
                callback(e);
            });
        }
        else {
            // TODO: Define interface for DOMMouseScroll.
            addListener(element, "DOMMouseScroll", function (e) {
                if (e.axis && e.axis == e.HORIZONTAL_AXIS) {
                    e.wheelX = (e.detail || 0) * 5;
                    e.wheelY = 0;
                }
                else {
                    e.wheelX = 0;
                    e.wheelY = (e.detail || 0) * 5;
                }
                callback(e);
            });
        }
    }
    exports.addMouseWheelListener = addMouseWheelListener;
    function addMultiMouseDownListener(el, timeouts, eventHandler, callbackName) {
        var clicks = 0;
        var startX, startY, timer;
        var eventNames = {
            2: "dblclick",
            3: "tripleclick",
            4: "quadclick"
        };
        addListener(el, "mousedown", function (e) {
            if (getButton(e) !== 0) {
                clicks = 0;
            }
            else if (e.detail > 1) {
                clicks++;
                if (clicks > 4)
                    clicks = 1;
            }
            else {
                clicks = 1;
            }
            if (useragent_1.isIE) {
                var isNewClick = Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5;
                if (!timer || isNewClick)
                    clicks = 1;
                if (timer)
                    clearTimeout(timer);
                timer = setTimeout(function () { timer = null; }, timeouts[clicks - 1] || 600);
                if (clicks == 1) {
                    startX = e.clientX;
                    startY = e.clientY;
                }
            }
            // TODO. This custom property is not part of MouseEvent.
            e['_clicks'] = clicks;
            eventHandler[callbackName]("mousedown", e);
            if (clicks > 4)
                clicks = 0;
            else if (clicks > 1)
                return eventHandler[callbackName](eventNames[clicks], e);
        });
        if (useragent_1.isOldIE) {
            addListener(el, "dblclick", function (e) {
                clicks = 2;
                if (timer)
                    clearTimeout(timer);
                timer = setTimeout(function () { timer = null; }, timeouts[clicks - 1] || 600);
                eventHandler[callbackName]("mousedown", e);
                eventHandler[callbackName](eventNames[clicks], e);
            });
        }
    }
    exports.addMultiMouseDownListener = addMultiMouseDownListener;
    var getModifierHash = useragent_1.isMac && useragent_1.isOpera && !("KeyboardEvent" in window)
        ? function (e) {
            return 0 | (e.metaKey ? 1 : 0) | (e.altKey ? 2 : 0) | (e.shiftKey ? 4 : 0) | (e.ctrlKey ? 8 : 0);
        }
        : function (e) {
            return 0 | (e.ctrlKey ? 1 : 0) | (e.altKey ? 2 : 0) | (e.shiftKey ? 4 : 0) | (e.metaKey ? 8 : 0);
        };
    function getModifierString(e) {
        return keys_1.KEY_MODS[getModifierHash(e)];
    }
    exports.getModifierString = getModifierString;
    function normalizeCommandKeys(callback, e, keyCode) {
        var hashId = getModifierHash(e);
        if (!useragent_1.isMac && pressedKeys) {
            if (pressedKeys[91] || pressedKeys[92])
                hashId |= 8;
            if (pressedKeys.altGr) {
                if ((3 & hashId) != 3)
                    pressedKeys.altGr = 0;
                else
                    return;
            }
            if (keyCode === 18 || keyCode === 17) {
                if (keyCode === 17 && e.location === 1) {
                    ts = e.timeStamp;
                }
                else if (keyCode === 18 && hashId === 3 && e.location === 2) {
                    var dt = -ts;
                    ts = e.timeStamp;
                    dt += ts;
                    if (dt < 3)
                        pressedKeys.altGr = true;
                }
            }
        }
        if (keyCode in keys_1.MODIFIER_KEYS) {
            switch (keys_1.MODIFIER_KEYS[keyCode]) {
                case "Alt":
                    hashId = 2;
                    break;
                case "Shift":
                    hashId = 4;
                    break;
                case "Ctrl":
                    hashId = 1;
                    break;
                default:
                    hashId = 8;
                    break;
            }
            keyCode = -1;
        }
        if (hashId & 8 && (keyCode === 91 || keyCode === 93)) {
            keyCode = -1;
        }
        if (!hashId && keyCode === 13) {
            if (e.location === 3) {
                callback(e, hashId, -keyCode);
                if (e.defaultPrevented)
                    return;
            }
        }
        if (useragent_1.isChromeOS && hashId & 8) {
            callback(e, hashId, keyCode);
            if (e.defaultPrevented)
                return;
            else
                hashId &= ~8;
        }
        // If there is no hashId and the keyCode is not a function key, then
        // we don't call the callback as we don't handle a command key here
        // (it's a normal key/character input).
        if (!hashId && !(keyCode in keys_1.FUNCTION_KEYS) && !(keyCode in keys_1.PRINTABLE_KEYS)) {
            return false;
        }
        return callback(e, hashId, keyCode);
    }
    var pressedKeys = null;
    function resetPressedKeys(e) {
        pressedKeys = Object.create(null);
    }
    var ts = 0;
    function addCommandKeyListener(el, callback) {
        if (useragent_1.isOldGecko || (useragent_1.isOpera && !("KeyboardEvent" in window))) {
            // Old versions of Gecko aka. Firefox < 4.0 didn't repeat the keydown
            // event if the user pressed the key for a longer time. Instead, the
            // keydown event was fired once and later on only the keypress event.
            // To emulate the 'right' keydown behavior, the keyCode of the initial
            // keyDown event is stored and in the following keypress events the
            // stores keyCode is used to emulate a keyDown event.
            var lastKeyDownKeyCode = null;
            addListener(el, "keydown", function (e) {
                lastKeyDownKeyCode = e.keyCode;
            });
            addListener(el, "keypress", function (e) {
                return normalizeCommandKeys(callback, e, lastKeyDownKeyCode);
            });
        }
        else {
            var lastDefaultPrevented = null;
            addListener(el, "keydown", function (e) {
                pressedKeys[e.keyCode] = true;
                var result = normalizeCommandKeys(callback, e, e.keyCode);
                lastDefaultPrevented = e.defaultPrevented;
                return result;
            });
            addListener(el, 'keypress', function (e) {
                if (lastDefaultPrevented && (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey)) {
                    stopEvent(e);
                    lastDefaultPrevented = null;
                }
            });
            addListener(el, 'keyup', function (e) {
                pressedKeys[e.keyCode] = null;
            });
            if (!pressedKeys) {
                pressedKeys = Object.create(null);
                addListener(window, 'focus', resetPressedKeys);
            }
        }
    }
    exports.addCommandKeyListener = addCommandKeyListener;
    // FIXME: Conditional exports not supported by TypeScript or Harmony/ES6.
    // declare var exports: any;
    /*
    if (window.postMessage && !isOldIE) {
        var postMessageId = 1;
        exports.nextTick = function(callback, win) {
            win = win || window;
            var messageName = "zero-timeout-message-" + postMessageId;
            addListener(win, "message", function listener(e) {
                if (e.data == messageName) {
                    stopPropagation(e);
                    removeListener(win, "message", listener);
                    callback();
                }
            });
            win.postMessage(messageName, "*");
        };
    }
    */
    var nextFrameCandidate = window.requestAnimationFrame ||
        window['mozRequestAnimationFrame'] ||
        window['webkitRequestAnimationFrame'] ||
        window.msRequestAnimationFrame ||
        window['oRequestAnimationFrame'];
    if (nextFrameCandidate) {
        nextFrameCandidate = nextFrameCandidate.bind(window);
    }
    else {
        nextFrameCandidate = function (callback) {
            setTimeout(callback, 17);
        };
    }
    /**
     * A backwards-compatible, browser-neutral, requestAnimationFrame.
     */
    exports.requestAnimationFrame = nextFrameCandidate;
});
