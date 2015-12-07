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

import {
addCssClass,
computedStyle,
createElement,
removeCssClass} from "../lib/dom";
import {escapeHTML} from "../lib/lang";
import {EventEmitterClass} from "../lib/event_emitter";
import {EditSession} from "../edit_session";

export class Gutter extends EventEmitterClass {
    public element: HTMLDivElement;
    public gutterWidth = 0;
    public $annotations = [];
    public $cells: { element; textNode; foldWidget }[] = [];
    private $fixedWidth = false;
    private $showLineNumbers = true;
    private $renderer: any = "";
    private session: EditSession;
    private $showFoldWidgets = true;
    public $padding;
    constructor(parentEl: HTMLElement) {
        super();
        this.element = <HTMLDivElement>createElement("div");
        this.element.className = "ace_layer ace_gutter-layer";
        parentEl.appendChild(this.element);
        this.setShowFoldWidgets(this.$showFoldWidgets);
        this.$updateAnnotations = this.$updateAnnotations.bind(this);
    }
    setSession(session: EditSession) {
        if (this.session) {
            this.session.removeEventListener("change", this.$updateAnnotations);
        }
        this.session = session;
        session.on("change", this.$updateAnnotations);
    }

    addGutterDecoration(row, className) {
        if (window.console) {
            console.warn && console.warn("deprecated use session.addGutterDecoration");
        }
        this.session.addGutterDecoration(row, className);
    }

    removeGutterDecoration(row, className) {
        if (window.console)
            console.warn && console.warn("deprecated use session.removeGutterDecoration");
        this.session.removeGutterDecoration(row, className);
    }

    // FIXME: The text and html appear to be optional.
    setAnnotations(annotations: { html: string; row: number; text: string; type: string }[]) {
        // iterate over sparse array
        this.$annotations = [];
        for (var i = 0; i < annotations.length; i++) {
            var annotation = annotations[i];
            var row = annotation.row;
            var rowInfo = this.$annotations[row];
            if (!rowInfo)
                rowInfo = this.$annotations[row] = { text: [] };

            var annoText = annotation.text;
            annoText = annoText ? escapeHTML(annoText) : annotation.html || "";

            if (rowInfo.text.indexOf(annoText) === -1)
                rowInfo.text.push(annoText);

            var type = annotation.type;
            if (type === "error")
                rowInfo.className = " ace_error";
            else if (type === "warning" && rowInfo.className != " ace_error")
                rowInfo.className = " ace_warning";
            else if (type === "info" && (!rowInfo.className))
                rowInfo.className = " ace_info";
        }
    }

    $updateAnnotations(e) {
        if (!this.$annotations.length)
            return;
        var delta = e.data;
        var range = delta.range;
        var firstRow = range.start.row;
        var len = range.end.row - firstRow;
        if (len === 0) {
            // do nothing
        }
        else if (delta.action == "removeText" || delta.action == "removeLines") {
            this.$annotations.splice(firstRow, len + 1, null);
        }
        else {
            var args = new Array(len + 1);
            args.unshift(firstRow, 1);
            this.$annotations.splice.apply(this.$annotations, args);
        }
    }

    update(config) {
        var session = this.session;
        var firstRow = config.firstRow;
        var lastRow = Math.min(config.lastRow + config.gutterOffset,  // needed to compensate for hor scollbar
            session.getLength() - 1);
        var fold = session.getNextFoldLine(firstRow);
        var foldStart = fold ? fold.start.row : Infinity;
        var foldWidgets = this.$showFoldWidgets && session['foldWidgets'];
        var breakpoints = session.$breakpoints;
        var decorations = session.$decorations;
        var firstLineNumber = session['$firstLineNumber'];
        var lastLineNumber = 0;

        var gutterRenderer = session['gutterRenderer'] || this.$renderer;

        var cell = null;
        var index = -1;
        var row: number = firstRow;
        while (true) {
            if (row > foldStart) {
                row = fold.end.row + 1;
                fold = session.getNextFoldLine(row, fold);
                foldStart = fold ? fold.start.row : Infinity;
            }
            if (row > lastRow) {
                while (this.$cells.length > index + 1) {
                    cell = this.$cells.pop();
                    this.element.removeChild(cell.element);
                }
                break;
            }

            cell = this.$cells[++index];
            if (!cell) {
                cell = { element: null, textNode: null, foldWidget: null };
                cell.element = createElement("div");
                cell.textNode = document.createTextNode('');
                cell.element.appendChild(cell.textNode);
                this.element.appendChild(cell.element);
                this.$cells[index] = cell;
            }

            var className = "ace_gutter-cell ";
            if (breakpoints[row])
                className += breakpoints[row];
            if (decorations[row])
                className += decorations[row];
            if (this.$annotations[row])
                className += this.$annotations[row].className;
            if (cell.element.className != className)
                cell.element.className = className;

            var height = session.getRowLength(row) * config.lineHeight + "px";
            if (height != cell.element.style.height)
                cell.element.style.height = height;

            if (foldWidgets) {
                var c = foldWidgets[row];
                // check if cached value is invalidated and we need to recompute
                if (c == null)
                    c = foldWidgets[row] = session.getFoldWidget(row);
            }

            if (c) {
                if (!cell.foldWidget) {
                    cell.foldWidget = createElement("span");
                    cell.element.appendChild(cell.foldWidget);
                }
                var className = "ace_fold-widget ace_" + c;
                if (c == "start" && row == foldStart && row < fold.end.row)
                    className += " ace_closed";
                else
                    className += " ace_open";
                if (cell.foldWidget.className != className)
                    cell.foldWidget.className = className;

                var height = config.lineHeight + "px";
                if (cell.foldWidget.style.height != height)
                    cell.foldWidget.style.height = height;
            } else {
                if (cell.foldWidget) {
                    cell.element.removeChild(cell.foldWidget);
                    cell.foldWidget = null;
                }
            }

            var text = lastLineNumber = gutterRenderer
                ? gutterRenderer.getText(session, row)
                : row + firstLineNumber;
            if (text != cell.textNode.data)
                cell.textNode.data = text;

            row++;
        }

        this.element.style.height = config.minHeight + "px";

        if (this.$fixedWidth || session.$useWrapMode)
            lastLineNumber = session.getLength() + firstLineNumber;

        var gutterWidth = gutterRenderer
            ? gutterRenderer.getWidth(session, lastLineNumber, config)
            : lastLineNumber.toString().length * config.characterWidth;

        var padding = this.$padding || this.$computePadding();
        gutterWidth += padding.left + padding.right;
        if (gutterWidth !== this.gutterWidth && !isNaN(gutterWidth)) {
            this.gutterWidth = gutterWidth;
            this.element.style.width = Math.ceil(this.gutterWidth) + "px";
            this._emit("changeGutterWidth", gutterWidth);
        }
    }

    setShowLineNumbers(show) {
        this.$renderer = !show && {
            getWidth: function() { return "" },
            getText: function() { return "" }
        };
    }

    getShowLineNumbers(): boolean {
        return this.$showLineNumbers;
    }

    setShowFoldWidgets(show: boolean): void {
        if (show)
            addCssClass(this.element, "ace_folding-enabled");
        else
            removeCssClass(this.element, "ace_folding-enabled");

        this.$showFoldWidgets = show;
        this.$padding = null;
    }

    getShowFoldWidgets() {
        return this.$showFoldWidgets;
    }

    $computePadding() {
        if (!this.element.firstChild) {
            return { left: 0, right: 0 };
        }
        // FIXME: The firstChild may not be an HTMLElement.
        var style: CSSStyleDeclaration = computedStyle(<HTMLElement>this.element.firstChild);
        this.$padding = {};
        this.$padding.left = parseInt(style.paddingLeft) + 1 || 0;
        this.$padding.right = parseInt(style.paddingRight) || 0;
        return this.$padding;
    }

    /**
     * Returns either "markers", "foldWidgets", or undefined.
     */
    getRegion(point: { clientX: number }): string {
        var padding = this.$padding || this.$computePadding();
        var rect = this.element.getBoundingClientRect();
        if (point.clientX < padding.left + rect.left) {
            return "markers";
        }
        if (this.$showFoldWidgets && point.clientX > rect.right - padding.right) {
            return "foldWidgets";
        }
    }
}
