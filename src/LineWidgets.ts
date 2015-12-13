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

import {addCssClass, createElement} from "./lib/dom";
import Range from "./Range";
import Editor from "./Editor";
import EditSession from "./EditSession";
import VirtualRenderer from "./VirtualRenderer";
import LineWidget from "./LineWidget";
import Change from './Change';

export default class LineWidgets {
    session: EditSession;
    editor: Editor;
    firstRow: number;
    lastRow: number;
    lineWidgets: LineWidget[];
    // TODO: This is also on the EditSession.
    $wrapData: number[][];
    // FIXME: I think this should be coming from the session.
    $useWrapMode: boolean;
    constructor(session: EditSession) {
        this.session = session;
        this.session.widgetManager = this;
        this.session.getRowLength = this.getRowLength;
        this.session.$getWidgetScreenLength = this.$getWidgetScreenLength;
        this.updateOnChange = this.updateOnChange.bind(this);
        this.renderWidgets = this.renderWidgets.bind(this);
        this.measureWidgets = this.measureWidgets.bind(this);
        this.session._changedWidgets = [];
        this.$onChangeEditor = this.$onChangeEditor.bind(this);

        this.session.on("change", this.updateOnChange);
        this.session.on("changeFold", this.updateOnFold);
        this.session.on("changeEditor", this.$onChangeEditor);
    }
    getRowLength(row: number): number {
        var h: number;

        if (this.lineWidgets)
            h = this.lineWidgets[row] && this.lineWidgets[row].rowCount || 0;
        else
            h = 0;

        if (!this.$useWrapMode || !this.$wrapData[row]) {
            return 1 + h;
        }
        else {
            return this.$wrapData[row].length + 1 + h;
        }
    }

    private $getWidgetScreenLength(): number {
        var screenRows = 0;
        this.lineWidgets.forEach(function(w) {
            if (w && w.rowCount && !w.hidden)
                screenRows += w.rowCount;
        });
        return screenRows;
    }

    private $onChangeEditor(e, session: EditSession) {
        this.attach(e.editor);
    }

    attach(editor: Editor): void {
        if (editor && editor.widgetManager && editor.widgetManager != this)
            editor.widgetManager.detach();

        if (this.editor == editor)
            return;

        this.detach();
        this.editor = editor;

        if (editor) {
            editor.widgetManager = this;
            editor.renderer.on("beforeRender", this.measureWidgets);
            editor.renderer.on("afterRender", this.renderWidgets);
        }
    }
    detach(e?): void {
        var editor = this.editor;
        if (!editor)
            return;

        this.editor = null;
        editor.widgetManager = null;

        editor.renderer.off("beforeRender", this.measureWidgets);
        editor.renderer.off("afterRender", this.renderWidgets);
        var lineWidgets = this.session.lineWidgets;
        lineWidgets && lineWidgets.forEach(function(w) {
            if (w && w.el && w.el.parentNode) {
                w._inDocument = false;
                w.el.parentNode.removeChild(w.el);
            }
        });
    }

    updateOnFold(e: Change, session: EditSession) {
        var lineWidgets = session.lineWidgets;
        if (!lineWidgets || !e.action)
            return;
        var fold = e.data;
        var start = fold.start.row;
        var end = fold.end.row;
        var hide = e.action == "add";
        for (var i = start + 1; i < end; i++) {
            if (lineWidgets[i])
                lineWidgets[i].hidden = hide;
        }
        if (lineWidgets[end]) {
            if (hide) {
                if (!lineWidgets[start])
                    lineWidgets[start] = lineWidgets[end];
                else
                    lineWidgets[end].hidden = hide;
            } else {
                if (lineWidgets[start] == lineWidgets[end])
                    lineWidgets[start] = undefined;
                lineWidgets[end].hidden = hide;
            }
        }
    }

    // FIXME: Appears to be using a different format from the standard Change.
    updateOnChange(delta: { action: string; start: { row: number; column: number }; end: { row: number; column: number } }, session: EditSession) {
        var lineWidgets = this.session.lineWidgets;
        if (!lineWidgets) return;

        var startRow = delta.start.row;
        var len = delta.end.row - startRow;

        if (len === 0) {
            // return
        }
        else if (delta.action === 'remove') {
            var removed = lineWidgets.splice(startRow + 1, len);
            removed.forEach(function(w) {
                w && this.removeLineWidget(w);
            }, this);
            this.$updateRows();
        }
        else {
            var args = new Array(len);
            args.unshift(startRow, 0);
            lineWidgets.splice.apply(lineWidgets, args);
            this.$updateRows();
        }
    }

    private $updateRows() {
        var lineWidgets = this.session.lineWidgets;
        if (!lineWidgets) return;
        var noWidgets = true;
        lineWidgets.forEach(function(w: LineWidget, i: number) {
            if (w) {
                noWidgets = false;
                w.row = i;
                while (w.$oldWidget) {
                    w.$oldWidget.row = i;
                    w = w.$oldWidget;
                }
            }
        });
        if (noWidgets)
            this.session.lineWidgets = null;
    }

    addLineWidget(w: LineWidget): LineWidget {
        if (!this.session.lineWidgets) {
            this.session.lineWidgets = new Array(this.session.getLength());
        }

        var old: LineWidget = this.session.lineWidgets[w.row];
        if (old) {
            w.$oldWidget = old;
            if (old.el && old.el.parentNode) {
                old.el.parentNode.removeChild(old.el);
                old._inDocument = false;
            }
        }

        this.session.lineWidgets[w.row] = w;

        w.session = this.session;

        var renderer = this.editor.renderer;
        if (w.html && !w.el) {
            w.el = <HTMLDivElement>createElement("div");
            w.el.innerHTML = w.html;
        }
        if (w.el) {
            addCssClass(w.el, "ace_lineWidgetContainer");
            w.el.style.position = "absolute";
            w.el.style.zIndex = '5';
            renderer.container.appendChild(w.el);
            w._inDocument = true;
        }

        if (!w.coverGutter) {
            w.el.style.zIndex = '3';
        }
        if (!w.pixelHeight) {
            w.pixelHeight = w.el.offsetHeight;
        }
        if (w.rowCount == null) {
            w.rowCount = w.pixelHeight / renderer.layerConfig.lineHeight;
        }

        var fold = this.session.getFoldAt(w.row, 0);
        w.$fold = fold;
        if (fold) {
            var lineWidgets = this.session.lineWidgets;
            if (w.row == fold.end.row && !lineWidgets[fold.start.row])
                lineWidgets[fold.start.row] = w;
            else
                w.hidden = true;
        }

        this.session._emit("changeFold", { data: { start: { row: w.row } } });

        this.$updateRows();
        this.renderWidgets(null, renderer);
        this.onWidgetChanged(w);
        return w;
    };

    removeLineWidget(w: LineWidget): void {
        w._inDocument = false;
        w.session = null;
        if (w.el && w.el.parentNode)
            w.el.parentNode.removeChild(w.el);
        if (w.editor && w.editor.destroy) try {
            w.editor.destroy();
        } catch (e) { }
        if (this.session.lineWidgets) {
            var w1 = this.session.lineWidgets[w.row]
            if (w1 == w) {
                this.session.lineWidgets[w.row] = w.$oldWidget;
                if (w.$oldWidget)
                    this.onWidgetChanged(w.$oldWidget);
            } else {
                while (w1) {
                    if (w1.$oldWidget == w) {
                        w1.$oldWidget = w.$oldWidget;
                        break;
                    }
                    w1 = w1.$oldWidget;
                }
            }
        }
        this.session._emit("changeFold", { data: { start: { row: w.row } } });
        this.$updateRows();
    }

    getWidgetsAtRow(row: number): LineWidget[] {
        var lineWidgets = this.session.lineWidgets;
        var w = lineWidgets && lineWidgets[row];
        var list: LineWidget[] = [];
        while (w) {
            list.push(w);
            w = w.$oldWidget;
        }
        return list;
    };

    onWidgetChanged(w: LineWidget): void {
        this.session._changedWidgets.push(w);
        this.editor && this.editor.renderer.updateFull();
    };

    measureWidgets(unused: any, renderer: VirtualRenderer): void {
        var changedWidgets = this.session._changedWidgets;
        var config = renderer.layerConfig;

        if (!changedWidgets || !changedWidgets.length) return;
        var min = Infinity;
        for (var i = 0; i < changedWidgets.length; i++) {
            var w = changedWidgets[i];
            if (!w || !w.el) continue;
            if (w.session != this.session) continue;
            if (!w._inDocument) {
                if (this.session.lineWidgets[w.row] != w)
                    continue;
                w._inDocument = true;
                renderer.container.appendChild(w.el);
            }

            w.h = w.el.offsetHeight;

            if (!w.fixedWidth) {
                w.w = w.el.offsetWidth;
                w.screenWidth = Math.ceil(w.w / config.characterWidth);
            }

            var rowCount = w.h / config.lineHeight;
            if (w.coverLine) {
                rowCount -= this.session.getRowLineCount(w.row);
                if (rowCount < 0)
                    rowCount = 0;
            }
            if (w.rowCount != rowCount) {
                w.rowCount = rowCount;
                if (w.row < min)
                    min = w.row;
            }
        }
        if (min != Infinity) {
            this.session._emit("changeFold", { data: { start: { row: min } } });
            this.session.lineWidgetWidth = null;
        }
        this.session._changedWidgets = [];
    }

    renderWidgets(e, renderer: VirtualRenderer) {
        var config = renderer.layerConfig;
        var lineWidgets = this.session.lineWidgets;
        if (!lineWidgets) {
            return;
        }
        var first = Math.min(this.firstRow, config.firstRow);
        var last = Math.max(this.lastRow, config.lastRow, lineWidgets.length);

        while (first > 0 && !lineWidgets[first]) {
            first--;
        }

        this.firstRow = config.firstRow;
        this.lastRow = config.lastRow;

        renderer.$cursorLayer.config = config;
        for (var i = first; i <= last; i++) {
            var w = lineWidgets[i];
            if (!w || !w.el) continue;
            if (w.hidden) {
                w.el.style.top = -100 - (w.pixelHeight || 0) + "px";
                continue;
            }
            if (!w._inDocument) {
                w._inDocument = true;
                renderer.container.appendChild(w.el);
            }
            var top: number = renderer.$cursorLayer.getPixelPosition({ row: i, column: 0 }, true).top;
            if (!w.coverLine) {
                top += config.lineHeight * this.session.getRowLineCount(w.row);
            }
            w.el.style.top = top - config.offset + "px";

            var left = w.coverGutter ? 0 : renderer.gutterWidth;
            if (!w.fixedWidth) {
                left -= renderer.scrollLeft;
            }
            w.el.style.left = left + "px";

            if (w.fullWidth && w.screenWidth) {
                w.el.style.minWidth = config.width + 2 * config.padding + "px";
            }

            if (w.fixedWidth) {
                w.el.style.right = renderer.scrollBarV.width + "px";
            }
            else {
                w.el.style.right = "";
            }
        }
    }
}
