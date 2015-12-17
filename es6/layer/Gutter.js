"use strict";
import { addCssClass, createElement, removeCssClass } from "../lib/dom";
import { escapeHTML } from "../lib/lang";
import EventEmitterClass from "../lib/event_emitter";
export default class Gutter extends EventEmitterClass {
    constructor(container) {
        super();
        this.gutterWidth = 0;
        this.$annotations = [];
        this.$cells = [];
        this.$fixedWidth = false;
        this.$showLineNumbers = true;
        this.$renderer = "";
        this.$showFoldWidgets = true;
        this.element = createElement("div");
        this.element.className = "ace_layer ace_gutter-layer";
        container.appendChild(this.element);
        this.setShowFoldWidgets(this.$showFoldWidgets);
        this.$updateAnnotations = this.$updateAnnotations.bind(this);
    }
    setSession(session) {
        if (this.session) {
            this.session.off("change", this.$updateAnnotations);
        }
        this.session = session;
        session.on("change", this.$updateAnnotations);
    }
    setAnnotations(annotations) {
        this.$annotations = [];
        for (var i = 0; i < annotations.length; i++) {
            var annotation = annotations[i];
            var row = annotation.row;
            var rowInfo = this.$annotations[row];
            if (!rowInfo) {
                rowInfo = this.$annotations[row] = { text: [] };
            }
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
    $updateAnnotations(e, session) {
        if (!this.$annotations.length)
            return;
        var delta = e.data;
        var range = delta.range;
        var firstRow = range.start.row;
        var len = range.end.row - firstRow;
        if (len === 0) {
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
        var lastRow = Math.min(config.lastRow + config.gutterOffset, session.getLength() - 1);
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
        var row = firstRow;
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
            }
            else {
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
            getWidth: function () { return ""; },
            getText: function () { return ""; }
        };
    }
    getShowLineNumbers() {
        return this.$showLineNumbers;
    }
    setShowFoldWidgets(show) {
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
        var style = window.getComputedStyle(this.element.firstChild);
        this.$padding = {};
        this.$padding.left = parseInt(style.paddingLeft) + 1 || 0;
        this.$padding.right = parseInt(style.paddingRight) || 0;
        return this.$padding;
    }
    getRegion(point) {
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
