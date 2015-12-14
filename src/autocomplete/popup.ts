/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2012, Ajax.org B.V.
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

import EditorDocument from "../EditorDocument";
import EditSession from "../EditSession";
import VirtualRenderer from "../VirtualRenderer";
import Editor from "../Editor";
import Range from "../Range";
import {addListener} from "../lib/event";
import {stringRepeat} from "../lib/lang";
import EventEmitterClass from "../lib/event_emitter";
import {addCssClass, createElement, ensureHTMLStyleElement, removeCssClass} from "../lib/dom";

var noop = function() { };

export interface ListView {
    isOpen: boolean;
    focus;
    container;
    on(eventName: string, callback, capturing?: boolean);
    getData(row: number);
    setData(data: string[]);
    getRow();
    setRow(row: number);
    getTextLeftOffset(): number;
    show(pos, lineHeight, topdownOnly?): void;
    hide();
    importTheme(themeName: string): void;
    setFontSize(fontSize): void;
    getLength(): number;
}

export class ListViewPopup implements ListView {
    private editor: Editor;
    private $borderSize = 1;
    private $imageSize = 0;
    private hoverMarker = new Range(-1, 0, -1, Infinity);
    private hoverMarkerId: number;
    private selectionMarker = new Range(-1, 0, -1, Infinity);
    private selectionMarkerId: number;
    public isOpen = false;
    private isTopdown = false;
    private lastMouseEvent: any;
    private lastMouseEventScrollTop;
    private data: any[] = [];
    private screenWidth;
    constructor(parentNode: Node) {
        // Cache the 'this' pointer for event handlers.
        var self = this;

        function createEditor(el: HTMLDivElement) {
            var renderer = new VirtualRenderer(el);

            renderer.content.style.cursor = "default";
            renderer.setStyle("ace_autocomplete");
            renderer.$cursorLayer.restartTimer = noop;
            renderer.$cursorLayer.element.style.opacity = "0";
            renderer.$maxLines = 8;
            renderer.$keepTextAreaAtCursor = false;

            var model = new EditorDocument("");
            var editSession = new EditSession(model);
            var editor = new Editor(renderer, editSession);

            editor.setHighlightActiveLine(false);
            editor.setShowPrintMargin(false);
            editor.renderer.setShowGutter(false);
            editor.renderer.setHighlightGutterLine(false);

            editor.setOption("displayIndentGuides", false);
            editor.setOption("dragDelay", 150);

            editor.focus = noop;
            editor.$isFocused = true;

            editor.setHighlightActiveLine(false);
            // FIXME: This must be a RegExp.
            // editor.session.highlight("");
            editor.getSession().$searchHighlight.clazz = "ace_highlight-marker";

            return editor;
        }

        var el: HTMLDivElement = <HTMLDivElement>createElement("div");
        this.editor = createEditor(el);

        if (parentNode) {
            parentNode.appendChild(el);
        }
        el.style.display = "none";

        this.editor.on("mousedown", function(e) {
            var pos = e.getDocumentPosition();
            self.editor.selection.moveToPosition(pos);
            self.selectionMarker.start.row = self.selectionMarker.end.row = pos.row;
            e.stop();
        });

        this.selectionMarkerId = this.editor.getSession().addMarker(this.selectionMarker, "ace_active-line", "fullLine");

        this.setSelectOnHover(false);

        this.editor.on("mousemove", function(e: MouseEvent) {
            if (!self.lastMouseEvent) {
                self.lastMouseEvent = e;
                return;
            }
            if (self.lastMouseEvent.x === e.x && self.lastMouseEvent.y === e.y) {
                return;
            }
            self.lastMouseEvent = e;
            self.lastMouseEventScrollTop = self.editor.renderer.scrollTop;
            var row = self.lastMouseEvent.getDocumentPosition().row;
            if (self.hoverMarker.start.row != row) {
                if (!self.hoverMarkerId) {
                    self.setRow(row);
                }
                self.setHoverMarker(row);
            }
        });
        this.editor.renderer.on("beforeRender", function() {
            if (self.lastMouseEvent && self.hoverMarker.start.row != -1) {
                self.lastMouseEvent.$pos = null;
                var row = self.lastMouseEvent.getDocumentPosition().row;
                if (!self.hoverMarkerId) {
                    self.setRow(row);
                }
                self.setHoverMarker(row, true);
            }
        });
        this.editor.renderer.on("afterRender", function() {
            var row = self.getRow();
            var t = self.editor.renderer.$textLayer;
            var selected = <HTMLElement>t.element.childNodes[row - t.config.firstRow];
            // FIXME: DGH Don't know why selectedNode is not found.
            if (selected == t['selectedNode'])
                return;
            if (t['selectedNode'])
                removeCssClass(t['selectedNode'], "ace_selected");
            t['selectedNode'] = selected;
            if (selected)
                addCssClass(selected, "ace_selected");
        });

        function hideHoverMarker() { self.setHoverMarker(-1) }

        addListener(this.editor.container, "mouseout", hideHoverMarker);
        this.editor.on("hide", hideHoverMarker);
        this.editor.on("changeSelection", hideHoverMarker);

        this.editor.getSession().doc.getLength = function() {
            return self.data.length;
        };
        this.editor.getSession().doc.getLine = function(i) {
            var data = self.data[i];
            if (typeof data == "string") {
                return data;
            }
            return (data && data.value) || "";
        };

        var bgTokenizer = this.editor.getSession().bgTokenizer;
        bgTokenizer.$tokenizeRow = function(dataIndex) {
            var data = self.data[dataIndex];
            var tokens = [];
            if (!data)
                return tokens;
            if (typeof data == "string")
                data = { value: data };
            if (!data.caption)
                data.caption = data.value || data.name;

            var last = -1;
            var flag, c;
            for (var cIndex = 0, length = data.caption.length; cIndex < length; cIndex++) {
                c = data.caption[cIndex];
                flag = data.matchMask & (1 << cIndex) ? 1 : 0;
                if (last !== flag) {
                    tokens.push({ type: data.className || "" + (flag ? "completion-highlight" : ""), value: c });
                    last = flag;
                } else {
                    tokens[tokens.length - 1].value += c;
                }
            }

            if (data.meta) {
                var maxW = self.editor.renderer.$size.scrollerWidth / self.editor.renderer.layerConfig.characterWidth;
                if (data.meta.length + data.caption.length < maxW - 2)
                    tokens.push({ type: "rightAlignedText", value: data.meta });
            }
            return tokens;
        };
        bgTokenizer.$updateOnChange = noop;
        bgTokenizer.start = noop;

        this.editor.getSession().$computeWidth = function() {
            return self.screenWidth = 0;
        };

        this.editor.on("changeSelection", function() {
            if (this.isOpen) {
                this.setRow(this.popup.selection.lead.row);
            }
        });
    }
    /**
     * @param {{top;left}} pos
     * @param {number} lineHeight
     * @param {boolean} topdownOnly
     */
    show(pos: { top: number; left: number }, lineHeight: number, topdownOnly?: boolean) {
        var el = this.editor.container;
        var screenHeight = window.innerHeight;
        var screenWidth = window.innerWidth;
        var renderer = this.editor.renderer;
        // var maxLines = Math.min(renderer.$maxLines, this.session.getLength());
        var maxH = renderer.$maxLines * lineHeight * 1.4;
        var top = pos.top + this.$borderSize;
        if (top + maxH > screenHeight - lineHeight && !topdownOnly) {
            el.style.top = "";
            el.style.bottom = screenHeight - top + "px";
            this.isTopdown = false;
        }
        else {
            top += lineHeight;
            el.style.top = top + "px";
            el.style.bottom = "";
            this.isTopdown = true;
        }

        el.style.display = "";
        renderer.$textLayer.checkForSizeChanges();

        var left = pos.left;
        if (left + el.offsetWidth > screenWidth) {
            left = screenWidth - el.offsetWidth;
        }

        el.style.left = left + "px";

        this.editor._signal("show");
        this.lastMouseEvent = null;
        this.isOpen = true;
    }
    hide() {
        this.editor.container.style.display = "none";
        this.editor._signal("hide");
        this.isOpen = false;
    }
    setData(list) {
        this.data = list || [];
        this.editor.setValue(stringRepeat("\n", list.length), -1);
        this.setRow(0);
    }
    getData(row: number) {
        return this.data[row];
    }
    on(eventName: string, callback: (event, ee: EventEmitterClass) => any, capturing?: boolean) {
        return this.editor.on(eventName, callback, capturing);
    }
    getTextLeftOffset(): number {
        return this.$borderSize + this.editor.renderer.$padding + this.$imageSize;
    }
    setSelectOnHover(val) {
        if (!val) {
            this.hoverMarkerId = this.editor.getSession().addMarker(this.hoverMarker, "ace_line-hover", "fullLine");
        }
        else if (this.hoverMarkerId) {
            this.editor.getSession().removeMarker(this.hoverMarkerId);
            this.hoverMarkerId = null;
        }
    }
    setHoverMarker(row: number, suppressRedraw?: boolean) {
        if (row !== this.hoverMarker.start.row) {
            this.hoverMarker.start.row = this.hoverMarker.end.row = row;
            if (!suppressRedraw) {
                this.editor.getSession()._emit("changeBackMarker");
            }
            this.editor._emit("changeHoverMarker");
        }
    }
    getHoveredRow(): number {
        return this.hoverMarker.start.row;
    }
    getRow(): number {
        return this.selectionMarker.start.row;
    }
    setRow(row: number) {
        row = Math.max(-1, Math.min(this.data.length, row));
        if (this.selectionMarker.start.row != row) {
            this.editor.selection.clearSelection();
            this.selectionMarker.start.row = this.selectionMarker.end.row = row || 0;
            this.editor.getSession()._emit("changeBackMarker");
            this.editor.moveCursorTo(row || 0, 0);
            if (this.isOpen) {
                this.editor._signal("select");
            }
        }
    }
    importTheme(themeName: string): void {
        this.editor.importTheme(themeName);
    }
    setFontSize(fontSize: string): void {
        this.editor.setFontSize(fontSize);
    }

    get focus() {
        return this.editor.focus;
    }

    getLength(): number {
        return this.editor.getSession().getLength();
    }

    get container() {
        return this.editor.container;
    }
}

ensureHTMLStyleElement("\
.ace_editor.ace_autocomplete .ace_marker-layer .ace_active-line {\
    background-color: #CAD6FA;\
    z-index: 1;\
}\
.ace_editor.ace_autocomplete .ace_line-hover {\
    border: 1px solid #abbffe;\
    margin-top: -1px;\
    background: rgba(233,233,253,0.4);\
}\
.ace_editor.ace_autocomplete .ace_line-hover {\
    position: absolute;\
    z-index: 2;\
}\
.ace_editor.ace_autocomplete .ace_scroller {\
   background: none;\
   border: none;\
   box-shadow: none;\
}\
.ace_rightAlignedText {\
    color: gray;\
    display: inline-block;\
    position: absolute;\
    right: 4px;\
    text-align: right;\
    z-index: -1;\
}\
.ace_editor.ace_autocomplete .ace_completion-highlight{\
    color: #000;\
    text-shadow: 0 0 0.01em;\
}\
.ace_editor.ace_autocomplete {\
    width: 280px;\
    z-index: 200000;\
    background: #fbfbfb;\
    color: #444;\
    border: 1px lightgray solid;\
    position: fixed;\
    box-shadow: 2px 3px 5px rgba(0,0,0,.2);\
    line-height: 1.4;\
}");
