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

import { addCommandKeyListener, addListener, capture, preventDefault } from "../lib/event"
import { isChrome, isGecko, isIE, isMac, isOldIE, isTouchPad, isWebKit, isWin } from "../lib/useragent"
import { computedStyle, createElement } from "../lib/dom"
import { delayedCall } from "../lib/lang";
import Editor from "../Editor";

var BROKEN_SETDATA = isChrome < 18;
var USE_IE_MIME_TYPE = isIE;

/**
 * @class TextInput
 */
export default class TextInput {
    focus() { };
    blur() { };
    isFocused() { };
    setReadOnly(readOnly: boolean) { };
    onContextMenuClose() { };
    onContextMenu(e) { };
    moveToMouse(e, bringToFront) { };
    setInputHandler(cb) { };
    getInputHandler() { };
    getElement() { };

    /**
     * @class TextInput
     * @constructor
     * @param container {Element}
     * @param editor {Editor}
     */
    constructor(container: Element, editor: Editor) {
        // FIXME: I'm sure this shuld become a property.
        // Don't know why we have all these monkey patched methods?!.
        var text = <HTMLTextAreaElement>createElement("textarea");
        text.className = "ace_text-input";

        if (isTouchPad) {
            text.setAttribute("x-palm-disable-auto-cap", 'true');
        }

        text.wrap = "off";
        text['autocorrect'] = "off";
        text['autocapitalize'] = "off";
        text.spellcheck = false;

        text.style.opacity = "0";
        container.insertBefore(text, container.firstChild);

        var PLACEHOLDER = "\x01\x01";

        var copied = false;
        var pasted = false;
        var inComposition: any = false;
        var tempStyle = '';
        var isSelectionEmpty = true;

        // FOCUS
        // ie9 throws error if document.activeElement is accessed too soon
        try { var isFocused = document.activeElement === text; } catch (e) { }

        addListener(text, "blur", function() {
            editor.onBlur();
            isFocused = false;
        });
        addListener(text, "focus", function() {
            isFocused = true;
            editor.onFocus();
            resetSelection();
        });
        this.focus = function() { text.focus(); };
        this.blur = function() { text.blur(); };
        this.isFocused = function() {
            return isFocused;
        };

        // modifying selection of blured textarea can focus it (chrome mac/linux)
        var syncSelection = delayedCall(function() {
            isFocused && resetSelection(isSelectionEmpty);
        });
        var syncValue = delayedCall(function() {
            if (!inComposition) {
                text.value = PLACEHOLDER;
                isFocused && resetSelection();
            }
        });

        function resetSelection(isEmpty?: boolean) {
            if (inComposition)
                return;
            if (inputHandler) {
                selectionStart = 0;
                selectionEnd = isEmpty ? 0 : text.value.length - 1;
            } else {
                var selectionStart = isEmpty ? 2 : 1;
                var selectionEnd = 2;
            }
            // on firefox this throws if textarea is hidden
            try {
                text.setSelectionRange(selectionStart, selectionEnd);
            } catch (e) { }
        }

        function resetValue() {
            if (inComposition)
                return;
            text.value = PLACEHOLDER;
            //http://code.google.com/p/chromium/issues/detail?id=76516
            if (isWebKit)
                syncValue.schedule();
        }

        isWebKit || editor.on('changeSelection', function(event, editor: Editor) {
            if (editor.selection.isEmpty() != isSelectionEmpty) {
                isSelectionEmpty = !isSelectionEmpty;
                syncSelection.schedule();
            }
        });

        resetValue();
        if (isFocused)
            editor.onFocus();


        var isAllSelected = function(text) {
            return text.selectionStart === 0 && text.selectionEnd === text.value.length;
        };
        // IE8 does not support setSelectionRange
        if (!text.setSelectionRange && text.createTextRange) {
            text.setSelectionRange = function(selectionStart, selectionEnd) {
                var range = this.createTextRange();
                range.collapse(true);
                range.moveStart('character', selectionStart);
                range.moveEnd('character', selectionEnd);
                range.select();
            };
            isAllSelected = function(text: HTMLTextAreaElement) {
                try {
                    var range = text.ownerDocument['selection'].createRange();
                }
                catch (e) {
                }
                if (!range || range.parentElement() != text) return false;
                return range.text == text.value;
            }
        }
        if (isOldIE) {
            var inPropertyChange = false;
            var onPropertyChange = function(e) {
                if (inPropertyChange)
                    return;
                var data = text.value;
                if (inComposition || !data || data == PLACEHOLDER)
                    return;
                // can happen either after delete or during insert operation
                if (e && data == PLACEHOLDER[0])
                    return syncProperty.schedule();

                sendText(data);
                // ie8 calls propertychange handlers synchronously!
                inPropertyChange = true;
                resetValue();
                inPropertyChange = false;
            };
            var syncProperty = delayedCall(onPropertyChange);
            addListener(text, "propertychange", onPropertyChange);

            var keytable = { 13: 1, 27: 1 };
            addListener(text, "keyup", function(e) {
                if (inComposition && (!text.value || keytable[e.keyCode]))
                    setTimeout(onCompositionEnd, 0);
                if ((text.value.charCodeAt(0) || 0) < 129) {
                    return syncProperty.call();
                }
                inComposition ? onCompositionUpdate() : onCompositionStart();
            });
            // when user presses backspace after focusing the editor 
            // propertychange isn't called for the next character
            addListener(text, "keydown", function(e) {
                syncProperty.schedule(50);
            });
        }

        var onSelect = function(e) {
            if (copied) {
                copied = false;
            } else if (isAllSelected(text)) {
                editor.selectAll();
                resetSelection();
            } else if (inputHandler) {
                resetSelection(editor.selection.isEmpty());
            }
        };

        var inputHandler = null;
        this.setInputHandler = function(cb) { inputHandler = cb };
        this.getInputHandler = function() { return inputHandler };
        var afterContextMenu = false;

        var sendText = function(data) {
            if (inputHandler) {
                data = inputHandler(data);
                inputHandler = null;
            }
            if (pasted) {
                resetSelection();
                if (data)
                    editor.onPaste(data);
                pasted = false;
            } else if (data == PLACEHOLDER.charAt(0)) {
                if (afterContextMenu)
                    editor.execCommand("del", { source: "ace" });
                else // some versions of android do not fire keydown when pressing backspace
                    editor.execCommand("backspace", { source: "ace" });
            } else {
                if (data.substring(0, 2) == PLACEHOLDER)
                    data = data.substr(2);
                else if (data.charAt(0) == PLACEHOLDER.charAt(0))
                    data = data.substr(1);
                else if (data.charAt(data.length - 1) == PLACEHOLDER.charAt(0))
                    data = data.slice(0, -1);
                // can happen if undo in textarea isn't stopped
                if (data.charAt(data.length - 1) == PLACEHOLDER.charAt(0))
                    data = data.slice(0, -1);

                if (data)
                    editor.onTextInput(data);
            }
            if (afterContextMenu)
                afterContextMenu = false;
        };
        var onInput = function(e) {
            if (inComposition)
                return;
            var data = text.value;
            sendText(data);
            resetValue();
        };

        var handleClipboardData = function(e, data?) {
            var clipboardData = e.clipboardData || window['clipboardData'];
            if (!clipboardData || BROKEN_SETDATA)
                return;
            // using "Text" doesn't work on old webkit but ie needs it
            // TODO are there other browsers that require "Text"?
            var mime = USE_IE_MIME_TYPE ? "Text" : "text/plain";
            if (data) {
                // Safari 5 has clipboardData object, but does not handle setData()
                return clipboardData.setData(mime, data) !== false;
            }
            else {
                return clipboardData.getData(mime);
            }
        };

        var doCopy = function(e, isCut) {
            var data = editor.getCopyText();
            if (!data)
                return preventDefault(e);

            if (handleClipboardData(e, data)) {
                isCut ? editor.onCut() : editor.onCopy();
                preventDefault(e);
            } else {
                copied = true;
                text.value = data;
                text.select();
                setTimeout(function() {
                    copied = false;
                    resetValue();
                    resetSelection();
                    isCut ? editor.onCut() : editor.onCopy();
                });
            }
        };

        var onCut = function(e) {
            doCopy(e, true);
        };

        var onCopy = function(e) {
            doCopy(e, false);
        };

        var onPaste = function(e) {
            var data = handleClipboardData(e);
            if (typeof data === "string") {
                if (data)
                    editor.onPaste(data);
                if (isIE)
                    setTimeout(resetSelection);
                preventDefault(e);
            }
            else {
                text.value = "";
                pasted = true;
            }
        };

        addCommandKeyListener(text, editor.onCommandKey.bind(editor));

        addListener(text, "select", onSelect);

        addListener(text, "input", onInput);

        addListener(text, "cut", onCut);
        addListener(text, "copy", onCopy);
        addListener(text, "paste", onPaste);


        // Opera has no clipboard events
        if (!('oncut' in text) || !('oncopy' in text) || !('onpaste' in text)) {
            addListener(container, "keydown", function(e) {
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


        // COMPOSITION
        var onCompositionStart = function() {
            if (inComposition || !editor.onCompositionStart || editor.$readOnly)
                return;

            inComposition = {};
            editor.onCompositionStart();
            setTimeout(onCompositionUpdate, 0);
            editor.on("mousedown", onCompositionEnd);
            if (!editor.selection.isEmpty()) {
                editor.insert("", false);
                editor.getSession().markUndoGroup();
                editor.selection.clearSelection();
            }
            editor.getSession().markUndoGroup();
        };

        var onCompositionUpdate = function() {

            if (!inComposition || !editor.onCompositionUpdate || editor.$readOnly)
                return;
            var val = text.value.replace(/\x01/g, "");
            if (inComposition.lastValue === val) return;

            editor.onCompositionUpdate(val);
            if (inComposition.lastValue)
                editor.undo();
            inComposition.lastValue = val;
            if (inComposition.lastValue) {
                var r = editor.selection.getRange();
                editor.insert(inComposition.lastValue, false);
                editor.getSession().markUndoGroup();
                inComposition.range = editor.selection.getRange();
                editor.selection.setRange(r);
                editor.selection.clearSelection();
            }
        };

        var onCompositionEnd = function(e, editor: Editor) {
            if (!editor.onCompositionEnd || editor.$readOnly) return;

            var c = inComposition;
            inComposition = false;
            var timer = setTimeout(function() {
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
            inputHandler = function compositionInputHandler(str: string) {

                if (timer)
                    clearTimeout(timer);
                str = str.replace(/\x01/g, "");
                if (str == c.lastValue)
                    return "";
                if (c.lastValue && timer)
                    editor.undo();
                return str;
            };
            editor.onCompositionEnd();
            editor.off("mousedown", onCompositionEnd);
            if (e.type == "compositionend" && c.range) {
                editor.selection.setRange(c.range);
            }
        };



        var syncComposition = delayedCall(onCompositionUpdate, 50);

        addListener(text, "compositionstart", onCompositionStart);
        if (isGecko) {
            addListener(text, "text", function() { syncComposition.schedule() });
        }
        else {
            addListener(text, "keyup", function() { syncComposition.schedule() });
            addListener(text, "keydown", function() { syncComposition.schedule() });
        }
        addListener(text, "compositionend", onCompositionEnd);

        this.getElement = function() {
            return text;
        };

        this.setReadOnly = function(readOnly: boolean) {
            text.readOnly = readOnly;
        };

        this.onContextMenu = function(e) {
            afterContextMenu = true;
            resetSelection(editor.selection.isEmpty());
            editor._emit("nativecontextmenu", { target: editor, domEvent: e });
            this.moveToMouse(e, true);
        };

        this.moveToMouse = function(e, bringToFront) {
            if (!tempStyle)
                tempStyle = text.style.cssText;
            text.style.cssText = (bringToFront ? "z-index:100000;" : "")
                + "height:" + text.style.height + ";"
                + (isIE ? "opacity:0.1;" : "");

            var rect = editor.container.getBoundingClientRect();
            var style = window.getComputedStyle(editor.container);
            var top = rect.top + (parseInt(style.borderTopWidth) || 0);
            var left = rect.left + (parseInt(style.borderLeftWidth) || 0);
            var maxTop = rect.bottom - top - text.clientHeight - 2;
            var move = function(e) {
                text.style.left = e.clientX - left - 2 + "px";
                text.style.top = Math.min(e.clientY - top - 2, maxTop) + "px";
            };
            move(e);

            if (e.type != "mousedown")
                return;

            if (editor.renderer.$keepTextAreaAtCursor)
                editor.renderer.$keepTextAreaAtCursor = null;

            // on windows context menu is opened after mouseup
            if (isWin)
                capture(editor.container, move, onContextMenuClose);
        };

        this.onContextMenuClose = onContextMenuClose;
        function onContextMenuClose() {
            setTimeout(function() {
                if (tempStyle) {
                    text.style.cssText = tempStyle;
                    tempStyle = '';
                }
                if (editor.renderer.$keepTextAreaAtCursor == null) {
                    editor.renderer.$keepTextAreaAtCursor = true;
                    editor.renderer.$moveTextAreaToCursor();
                }
            }, 0);
        }

        var onContextMenu = function(e) {
            editor.textInput.onContextMenu(e);
            onContextMenuClose();
        };
        addListener(editor.renderer.scroller, "contextmenu", onContextMenu);
        addListener(text, "contextmenu", onContextMenu);
    }
}
