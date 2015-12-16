"use strict";
import { addCommandKeyListener, addListener, capture, preventDefault } from "../lib/event";
import { isChrome, isGecko, isIE, isMac, isOldIE, isTouchPad, isWebKit, isWin } from "../lib/useragent";
import { createElement } from "../lib/dom";
import { delayedCall } from "../lib/lang";
var BROKEN_SETDATA = isChrome < 18;
var USE_IE_MIME_TYPE = isIE;
export default class TextInput {
    constructor(parentNode, host) {
        var text = createElement("textarea");
        text.className = "ace_text-input";
        if (isTouchPad) {
            text.setAttribute("x-palm-disable-auto-cap", 'true');
        }
        text.wrap = "off";
        text['autocorrect'] = "off";
        text['autocapitalize'] = "off";
        text.spellcheck = false;
        text.style.opacity = "0";
        parentNode.insertBefore(text, parentNode.firstChild);
        var PLACEHOLDER = "\x01\x01";
        var copied = false;
        var pasted = false;
        var inComposition = false;
        var tempStyle = '';
        var isSelectionEmpty = true;
        try {
            var isFocused = document.activeElement === text;
        }
        catch (e) { }
        addListener(text, "blur", function () {
            host.onBlur();
            isFocused = false;
        });
        addListener(text, "focus", function () {
            isFocused = true;
            host.onFocus();
            resetSelection();
        });
        this.focus = function () { text.focus(); };
        this.blur = function () { text.blur(); };
        this.isFocused = function () {
            return isFocused;
        };
        var syncSelection = delayedCall(function () {
            isFocused && resetSelection(isSelectionEmpty);
        });
        var syncValue = delayedCall(function () {
            if (!inComposition) {
                text.value = PLACEHOLDER;
                isFocused && resetSelection();
            }
        });
        function resetSelection(isEmpty) {
            if (inComposition)
                return;
            if (inputHandler) {
                selectionStart = 0;
                selectionEnd = isEmpty ? 0 : text.value.length - 1;
            }
            else {
                var selectionStart = isEmpty ? 2 : 1;
                var selectionEnd = 2;
            }
            try {
                text.setSelectionRange(selectionStart, selectionEnd);
            }
            catch (e) { }
        }
        function resetValue() {
            if (inComposition)
                return;
            text.value = PLACEHOLDER;
            if (isWebKit)
                syncValue.schedule();
        }
        isWebKit || host.on('changeSelection', function (event, editor) {
            if (host.selection.isEmpty() != isSelectionEmpty) {
                isSelectionEmpty = !isSelectionEmpty;
                syncSelection.schedule();
            }
        });
        resetValue();
        if (isFocused)
            host.onFocus();
        var isAllSelected = function (text) {
            return text.selectionStart === 0 && text.selectionEnd === text.value.length;
        };
        if (!text.setSelectionRange && text.createTextRange) {
            text.setSelectionRange = function (selectionStart, selectionEnd) {
                var range = this.createTextRange();
                range.collapse(true);
                range.moveStart('character', selectionStart);
                range.moveEnd('character', selectionEnd);
                range.select();
            };
            isAllSelected = function (text) {
                try {
                    var range = text.ownerDocument['selection'].createRange();
                }
                catch (e) {
                }
                if (!range || range.parentElement() != text)
                    return false;
                return range.text == text.value;
            };
        }
        if (isOldIE) {
            var inPropertyChange = false;
            var onPropertyChange = function (e) {
                if (inPropertyChange)
                    return;
                var data = text.value;
                if (inComposition || !data || data == PLACEHOLDER)
                    return;
                if (e && data == PLACEHOLDER[0])
                    return syncProperty.schedule();
                sendText(data);
                inPropertyChange = true;
                resetValue();
                inPropertyChange = false;
            };
            var syncProperty = delayedCall(onPropertyChange);
            addListener(text, "propertychange", onPropertyChange);
            var keytable = { 13: 1, 27: 1 };
            addListener(text, "keyup", function (e) {
                if (inComposition && (!text.value || keytable[e.keyCode]))
                    setTimeout(onCompositionEnd, 0);
                if ((text.value.charCodeAt(0) || 0) < 129) {
                    return syncProperty.call();
                }
                inComposition ? onCompositionUpdate() : onCompositionStart();
            });
            addListener(text, "keydown", function (e) {
                syncProperty.schedule(50);
            });
        }
        var onSelect = function (e) {
            if (copied) {
                copied = false;
            }
            else if (isAllSelected(text)) {
                host.selectAll();
                resetSelection();
            }
            else if (inputHandler) {
                resetSelection(host.selection.isEmpty());
            }
        };
        var inputHandler = null;
        this.setInputHandler = function (cb) { inputHandler = cb; };
        this.getInputHandler = function () { return inputHandler; };
        var afterContextMenu = false;
        var sendText = function (data) {
            if (inputHandler) {
                data = inputHandler(data);
                inputHandler = null;
            }
            if (pasted) {
                resetSelection();
                if (data)
                    host.onPaste(data);
                pasted = false;
            }
            else if (data == PLACEHOLDER.charAt(0)) {
                if (afterContextMenu)
                    host.execCommand("del", { source: "ace" });
                else
                    host.execCommand("backspace", { source: "ace" });
            }
            else {
                if (data.substring(0, 2) == PLACEHOLDER)
                    data = data.substr(2);
                else if (data.charAt(0) == PLACEHOLDER.charAt(0))
                    data = data.substr(1);
                else if (data.charAt(data.length - 1) == PLACEHOLDER.charAt(0))
                    data = data.slice(0, -1);
                if (data.charAt(data.length - 1) == PLACEHOLDER.charAt(0))
                    data = data.slice(0, -1);
                if (data)
                    host.onTextInput(data);
            }
            if (afterContextMenu)
                afterContextMenu = false;
        };
        var onInput = function (e) {
            if (inComposition)
                return;
            var data = text.value;
            sendText(data);
            resetValue();
        };
        var handleClipboardData = function (e, data) {
            var clipboardData = e.clipboardData || window['clipboardData'];
            if (!clipboardData || BROKEN_SETDATA)
                return;
            var mime = USE_IE_MIME_TYPE ? "Text" : "text/plain";
            if (data) {
                return clipboardData.setData(mime, data) !== false;
            }
            else {
                return clipboardData.getData(mime);
            }
        };
        var doCopy = function (e, isCut) {
            var data = host.getCopyText();
            if (!data)
                return preventDefault(e);
            if (handleClipboardData(e, data)) {
                isCut ? host.onCut() : host.onCopy();
                preventDefault(e);
            }
            else {
                copied = true;
                text.value = data;
                text.select();
                setTimeout(function () {
                    copied = false;
                    resetValue();
                    resetSelection();
                    isCut ? host.onCut() : host.onCopy();
                });
            }
        };
        var onCut = function (e) {
            doCopy(e, true);
        };
        var onCopy = function (e) {
            doCopy(e, false);
        };
        var onPaste = function (e) {
            var data = handleClipboardData(e);
            if (typeof data === "string") {
                if (data)
                    host.onPaste(data);
                if (isIE)
                    setTimeout(resetSelection);
                preventDefault(e);
            }
            else {
                text.value = "";
                pasted = true;
            }
        };
        addCommandKeyListener(text, host.onCommandKey.bind(host));
        addListener(text, "select", onSelect);
        addListener(text, "input", onInput);
        addListener(text, "cut", onCut);
        addListener(text, "copy", onCopy);
        addListener(text, "paste", onPaste);
        if (!('oncut' in text) || !('oncopy' in text) || !('onpaste' in text)) {
            addListener(parentNode, "keydown", function (e) {
                if ((isMac && !e.metaKey) || !e.ctrlKey)
                    return;
                switch (e.keyCode) {
                    case 67:
                        onCopy(e);
                        break;
                    case 86:
                        onPaste(e);
                        break;
                    case 88:
                        onCut(e);
                        break;
                }
            });
        }
        var onCompositionStart = function () {
            if (inComposition || !host.onCompositionStart || host.$readOnly)
                return;
            inComposition = {};
            host.onCompositionStart();
            setTimeout(onCompositionUpdate, 0);
            host.on("mousedown", onCompositionEnd);
            if (!host.selection.isEmpty()) {
                host.insert("", false);
                host.getSession().markUndoGroup();
                host.selection.clearSelection();
            }
            host.getSession().markUndoGroup();
        };
        var onCompositionUpdate = function () {
            if (!inComposition || !host.onCompositionUpdate || host.$readOnly)
                return;
            var val = text.value.replace(/\x01/g, "");
            if (inComposition.lastValue === val)
                return;
            host.onCompositionUpdate(val);
            if (inComposition.lastValue)
                host.undo();
            inComposition.lastValue = val;
            if (inComposition.lastValue) {
                var r = host.selection.getRange();
                host.insert(inComposition.lastValue, false);
                host.getSession().markUndoGroup();
                inComposition.range = host.selection.getRange();
                host.selection.setRange(r);
                host.selection.clearSelection();
            }
        };
        var onCompositionEnd = function (e, editor) {
            if (!host.onCompositionEnd || host.$readOnly)
                return;
            var c = inComposition;
            inComposition = false;
            var timer = setTimeout(function () {
                timer = null;
                var str = text.value.replace(/\x01/g, "");
                if (inComposition)
                    return;
                else if (str == c.lastValue)
                    resetValue();
                else if (!c.lastValue && str) {
                    resetValue();
                    sendText(str);
                }
            });
            inputHandler = function compositionInputHandler(str) {
                if (timer)
                    clearTimeout(timer);
                str = str.replace(/\x01/g, "");
                if (str == c.lastValue)
                    return "";
                if (c.lastValue && timer)
                    host.undo();
                return str;
            };
            host.onCompositionEnd();
            host.off("mousedown", onCompositionEnd);
            if (e.type == "compositionend" && c.range) {
                host.selection.setRange(c.range);
            }
        };
        var syncComposition = delayedCall(onCompositionUpdate, 50);
        addListener(text, "compositionstart", onCompositionStart);
        if (isGecko) {
            addListener(text, "text", function () { syncComposition.schedule(); });
        }
        else {
            addListener(text, "keyup", function () { syncComposition.schedule(); });
            addListener(text, "keydown", function () { syncComposition.schedule(); });
        }
        addListener(text, "compositionend", onCompositionEnd);
        this.getElement = function () {
            return text;
        };
        this.setReadOnly = function (readOnly) {
            text.readOnly = readOnly;
        };
        this.onContextMenu = function (e) {
            afterContextMenu = true;
            resetSelection(host.selection.isEmpty());
            host._emit("nativecontextmenu", { target: host, domEvent: e });
            this.moveToMouse(e, true);
        };
        this.moveToMouse = function (e, bringToFront) {
            if (!tempStyle)
                tempStyle = text.style.cssText;
            text.style.cssText = (bringToFront ? "z-index:100000;" : "")
                + "height:" + text.style.height + ";"
                + (isIE ? "opacity:0.1;" : "");
            var rect = host.container.getBoundingClientRect();
            var style = window.getComputedStyle(host.container);
            var top = rect.top + (parseInt(style.borderTopWidth) || 0);
            var left = rect.left + (parseInt(style.borderLeftWidth) || 0);
            var maxTop = rect.bottom - top - text.clientHeight - 2;
            var move = function (e) {
                text.style.left = e.clientX - left - 2 + "px";
                text.style.top = Math.min(e.clientY - top - 2, maxTop) + "px";
            };
            move(e);
            if (e.type != "mousedown")
                return;
            if (host.renderer.$keepTextAreaAtCursor)
                host.renderer.$keepTextAreaAtCursor = null;
            if (isWin)
                capture(host.container, move, onContextMenuClose);
        };
        this.onContextMenuClose = onContextMenuClose;
        function onContextMenuClose() {
            setTimeout(function () {
                if (tempStyle) {
                    text.style.cssText = tempStyle;
                    tempStyle = '';
                }
                if (host.renderer.$keepTextAreaAtCursor == null) {
                    host.renderer.$keepTextAreaAtCursor = true;
                    host.renderer.$moveTextAreaToCursor();
                }
            }, 0);
        }
        var onContextMenu = function (e) {
            host.textInput.onContextMenu(e);
            onContextMenuClose();
        };
        addListener(host.renderer.scroller, "contextmenu", onContextMenu);
        addListener(text, "contextmenu", onContextMenu);
    }
    focus() { }
    ;
    blur() { }
    ;
    isFocused() { }
    ;
    setReadOnly(readOnly) { }
    ;
    onContextMenuClose() { }
    ;
    onContextMenu(e) { }
    ;
    moveToMouse(e, bringToFront) { }
    ;
    setInputHandler(cb) { }
    ;
    getInputHandler() { }
    ;
    getElement() {
    }
    ;
}
