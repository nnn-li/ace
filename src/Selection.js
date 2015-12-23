"use strict";
import { stringReverse } from "./lib/lang";
import EventEmitterClass from "./lib/EventEmitterClass";
import Range from "./Range";
import Anchor from "./Anchor";
export default class Selection {
    constructor(session) {
        this.eventBus = new EventEmitterClass(this);
        this.session = session;
        this.doc = session.getDocument();
        this.clearSelection();
        this.lead = this.selectionLead = new Anchor(this.doc, 0, 0);
        this.anchor = this.selectionAnchor = new Anchor(this.doc, 0, 0);
        var self = this;
        this.lead.on("change", function (e) {
            self.eventBus._emit("changeCursor");
            if (!self.$isEmpty) {
                self.eventBus._emit("changeSelection");
            }
            if (!self.$keepDesiredColumnOnChange && e.old.column != e.value.column)
                self.$desiredColumn = null;
        });
        this.selectionAnchor.on("change", function () {
            if (!self.$isEmpty) {
                self.eventBus._emit("changeSelection");
            }
        });
    }
    isEmpty() {
        return (this.$isEmpty || (this.anchor.row == this.lead.row &&
            this.anchor.column == this.lead.column));
    }
    isMultiLine() {
        if (this.isEmpty()) {
            return false;
        }
        return this.getRange().isMultiLine();
    }
    getCursor() {
        return this.lead.getPosition();
    }
    setSelectionAnchor(row, column) {
        this.anchor.setPosition(row, column);
        if (this.$isEmpty) {
            this.$isEmpty = false;
            this.eventBus._emit("changeSelection");
        }
    }
    getSelectionAnchor() {
        if (this.$isEmpty) {
            return this.getSelectionLead();
        }
        else {
            return this.anchor.getPosition();
        }
    }
    getSelectionLead() {
        return this.lead.getPosition();
    }
    shiftSelection(columns) {
        if (this.$isEmpty) {
            this.moveCursorTo(this.lead.row, this.lead.column + columns);
            return;
        }
        var anchor = this.getSelectionAnchor();
        var lead = this.getSelectionLead();
        var isBackwards = this.isBackwards();
        if (!isBackwards || anchor.column !== 0)
            this.setSelectionAnchor(anchor.row, anchor.column + columns);
        if (isBackwards || lead.column !== 0) {
            this.$moveSelection(function () {
                this.moveCursorTo(lead.row, lead.column + columns);
            });
        }
    }
    isBackwards() {
        var anchor = this.anchor;
        var lead = this.lead;
        return (anchor.row > lead.row || (anchor.row == lead.row && anchor.column > lead.column));
    }
    getRange() {
        var anchor = this.anchor;
        var lead = this.lead;
        if (this.isEmpty())
            return Range.fromPoints(lead, lead);
        if (this.isBackwards()) {
            return Range.fromPoints(lead, anchor);
        }
        else {
            return Range.fromPoints(anchor, lead);
        }
    }
    clearSelection() {
        if (!this.$isEmpty) {
            this.$isEmpty = true;
            this.eventBus._emit("changeSelection");
        }
    }
    selectAll() {
        var lastRow = this.doc.getLength() - 1;
        this.setSelectionAnchor(0, 0);
        this.moveCursorTo(lastRow, this.doc.getLine(lastRow).length);
    }
    setRange(range, reverse) {
        this.setSelectionRange(range, reverse);
    }
    setSelectionRange(range, reverse) {
        if (reverse) {
            this.setSelectionAnchor(range.end.row, range.end.column);
            this.selectTo(range.start.row, range.start.column);
        }
        else {
            this.setSelectionAnchor(range.start.row, range.start.column);
            this.selectTo(range.end.row, range.end.column);
        }
        if (this.getRange().isEmpty())
            this.$isEmpty = true;
        this.$desiredColumn = null;
    }
    $moveSelection(mover) {
        var lead = this.lead;
        if (this.$isEmpty)
            this.setSelectionAnchor(lead.row, lead.column);
        mover.call(this);
    }
    selectTo(row, column) {
        this.$moveSelection(function () {
            this.moveCursorTo(row, column);
        });
    }
    selectToPosition(position) {
        var self = this;
        this.$moveSelection(function () {
            self.moveCursorToPosition(position);
        });
    }
    moveTo(row, column) {
        this.clearSelection();
        this.moveCursorTo(row, column);
    }
    moveToPosition(pos) {
        this.clearSelection();
        this.moveCursorToPosition(pos);
    }
    selectUp() {
        this.$moveSelection(this.moveCursorUp);
    }
    selectDown() {
        this.$moveSelection(this.moveCursorDown);
    }
    selectRight() {
        this.$moveSelection(this.moveCursorRight);
    }
    selectLeft() {
        this.$moveSelection(this.moveCursorLeft);
    }
    selectLineStart() {
        this.$moveSelection(this.moveCursorLineStart);
    }
    selectLineEnd() {
        this.$moveSelection(this.moveCursorLineEnd);
    }
    selectFileEnd() {
        this.$moveSelection(this.moveCursorFileEnd);
    }
    selectFileStart() {
        this.$moveSelection(this.moveCursorFileStart);
    }
    selectWordRight() {
        this.$moveSelection(this.moveCursorWordRight);
    }
    selectWordLeft() {
        this.$moveSelection(this.moveCursorWordLeft);
    }
    getWordRange(row, column) {
        return this.session.getWordRange(row, column);
    }
    selectWord() {
        this.setSelectionRange(this.getWordRange(this.lead.row, this.lead.column));
    }
    selectAWord() {
        var cursor = this.getCursor();
        var range = this.session.getAWordRange(cursor.row, cursor.column);
        this.setSelectionRange(range);
    }
    getLineRange(row, excludeLastChar) {
        var rowStart = typeof row == "number" ? row : this.lead.row;
        var rowEnd;
        var foldLine = this.session.getFoldLine(rowStart);
        if (foldLine) {
            rowStart = foldLine.start.row;
            rowEnd = foldLine.end.row;
        }
        else {
            rowEnd = rowStart;
        }
        if (excludeLastChar) {
            return new Range(rowStart, 0, rowEnd, this.session.getLine(rowEnd).length);
        }
        else {
            return new Range(rowStart, 0, rowEnd + 1, 0);
        }
    }
    selectLine() {
        this.setSelectionRange(this.getLineRange());
    }
    moveCursorUp() {
        this.moveCursorBy(-1, 0);
    }
    moveCursorDown() {
        this.moveCursorBy(1, 0);
    }
    moveCursorLeft() {
        var cursor = this.lead.getPosition(), fold;
        if (fold = this.session.getFoldAt(cursor.row, cursor.column, -1)) {
            this.moveCursorTo(fold.start.row, fold.start.column);
        }
        else if (cursor.column === 0) {
            if (cursor.row > 0) {
                this.moveCursorTo(cursor.row - 1, this.doc.getLine(cursor.row - 1).length);
            }
        }
        else {
            var tabSize = this.session.getTabSize();
            if (this.session.isTabStop(cursor) && this.doc.getLine(cursor.row).slice(cursor.column - tabSize, cursor.column).split(" ").length - 1 == tabSize)
                this.moveCursorBy(0, -tabSize);
            else
                this.moveCursorBy(0, -1);
        }
    }
    moveCursorRight() {
        var pos = this.lead.getPosition();
        var fold = this.session.getFoldAt(pos.row, pos.column, 1);
        if (fold) {
            this.moveCursorTo(fold.end.row, fold.end.column);
        }
        else if (this.lead.column == this.doc.getLine(this.lead.row).length) {
            if (this.lead.row < this.doc.getLength() - 1) {
                this.moveCursorTo(this.lead.row + 1, 0);
            }
        }
        else {
            var tabSize = this.session.getTabSize();
            var cursor = this.lead;
            if (this.session.isTabStop(cursor) && this.doc.getLine(cursor.row).slice(cursor.column, cursor.column + tabSize).split(" ").length - 1 == tabSize) {
                this.moveCursorBy(0, tabSize);
            }
            else {
                this.moveCursorBy(0, 1);
            }
        }
    }
    moveCursorLineStart() {
        var row = this.lead.row;
        var column = this.lead.column;
        var screenRow = this.session.documentToScreenRow(row, column);
        var firstColumnPosition = this.session.screenToDocumentPosition(screenRow, 0);
        var beforeCursor = this.session['getDisplayLine'](row, null, firstColumnPosition.row, firstColumnPosition.column);
        var leadingSpace = beforeCursor.match(/^\s*/);
        if (leadingSpace[0].length != column && !this.session['$useEmacsStyleLineStart'])
            firstColumnPosition.column += leadingSpace[0].length;
        this.moveCursorToPosition(firstColumnPosition);
    }
    moveCursorLineEnd() {
        var lead = this.lead;
        var lineEnd = this.session.getDocumentLastRowColumnPosition(lead.row, lead.column);
        if (this.lead.column == lineEnd.column) {
            var line = this.session.getLine(lineEnd.row);
            if (lineEnd.column == line.length) {
                var textEnd = line.search(/\s+$/);
                if (textEnd > 0)
                    lineEnd.column = textEnd;
            }
        }
        this.moveCursorTo(lineEnd.row, lineEnd.column);
    }
    moveCursorFileEnd() {
        var row = this.doc.getLength() - 1;
        var column = this.doc.getLine(row).length;
        this.moveCursorTo(row, column);
    }
    moveCursorFileStart() {
        this.moveCursorTo(0, 0);
    }
    moveCursorLongWordRight() {
        var row = this.lead.row;
        var column = this.lead.column;
        var line = this.doc.getLine(row);
        var rightOfCursor = line.substring(column);
        var match;
        this.session.nonTokenRe.lastIndex = 0;
        this.session.tokenRe.lastIndex = 0;
        var fold = this.session.getFoldAt(row, column, 1);
        if (fold) {
            this.moveCursorTo(fold.end.row, fold.end.column);
            return;
        }
        if (match = this.session.nonTokenRe.exec(rightOfCursor)) {
            column += this.session.nonTokenRe.lastIndex;
            this.session.nonTokenRe.lastIndex = 0;
            rightOfCursor = line.substring(column);
        }
        if (column >= line.length) {
            this.moveCursorTo(row, line.length);
            this.moveCursorRight();
            if (row < this.doc.getLength() - 1)
                this.moveCursorWordRight();
            return;
        }
        if (match = this.session.tokenRe.exec(rightOfCursor)) {
            column += this.session.tokenRe.lastIndex;
            this.session.tokenRe.lastIndex = 0;
        }
        this.moveCursorTo(row, column);
    }
    moveCursorLongWordLeft() {
        var row = this.lead.row;
        var column = this.lead.column;
        var fold;
        if (fold = this.session.getFoldAt(row, column, -1)) {
            this.moveCursorTo(fold.start.row, fold.start.column);
            return;
        }
        var str = this.session.getFoldStringAt(row, column, -1);
        if (str == null) {
            str = this.doc.getLine(row).substring(0, column);
        }
        var leftOfCursor = stringReverse(str);
        var match;
        this.session.nonTokenRe.lastIndex = 0;
        this.session.tokenRe.lastIndex = 0;
        if (match = this.session.nonTokenRe.exec(leftOfCursor)) {
            column -= this.session.nonTokenRe.lastIndex;
            leftOfCursor = leftOfCursor.slice(this.session.nonTokenRe.lastIndex);
            this.session.nonTokenRe.lastIndex = 0;
        }
        if (column <= 0) {
            this.moveCursorTo(row, 0);
            this.moveCursorLeft();
            if (row > 0)
                this.moveCursorWordLeft();
            return;
        }
        if (match = this.session.tokenRe.exec(leftOfCursor)) {
            column -= this.session.tokenRe.lastIndex;
            this.session.tokenRe.lastIndex = 0;
        }
        this.moveCursorTo(row, column);
    }
    $shortWordEndIndex(rightOfCursor) {
        var match, index = 0, ch;
        var whitespaceRe = /\s/;
        var tokenRe = this.session.tokenRe;
        tokenRe.lastIndex = 0;
        if (match = this.session.tokenRe.exec(rightOfCursor)) {
            index = this.session.tokenRe.lastIndex;
        }
        else {
            while ((ch = rightOfCursor[index]) && whitespaceRe.test(ch))
                index++;
            if (index < 1) {
                tokenRe.lastIndex = 0;
                while ((ch = rightOfCursor[index]) && !tokenRe.test(ch)) {
                    tokenRe.lastIndex = 0;
                    index++;
                    if (whitespaceRe.test(ch)) {
                        if (index > 2) {
                            index--;
                            break;
                        }
                        else {
                            while ((ch = rightOfCursor[index]) && whitespaceRe.test(ch))
                                index++;
                            if (index > 2)
                                break;
                        }
                    }
                }
            }
        }
        tokenRe.lastIndex = 0;
        return index;
    }
    moveCursorShortWordRight() {
        var row = this.lead.row;
        var column = this.lead.column;
        var line = this.doc.getLine(row);
        var rightOfCursor = line.substring(column);
        var fold = this.session.getFoldAt(row, column, 1);
        if (fold)
            return this.moveCursorTo(fold.end.row, fold.end.column);
        if (column == line.length) {
            var l = this.doc.getLength();
            do {
                row++;
                rightOfCursor = this.doc.getLine(row);
            } while (row < l && /^\s*$/.test(rightOfCursor));
            if (!/^\s+/.test(rightOfCursor))
                rightOfCursor = "";
            column = 0;
        }
        var index = this.$shortWordEndIndex(rightOfCursor);
        this.moveCursorTo(row, column + index);
    }
    moveCursorShortWordLeft() {
        var row = this.lead.row;
        var column = this.lead.column;
        var fold;
        if (fold = this.session.getFoldAt(row, column, -1))
            return this.moveCursorTo(fold.start.row, fold.start.column);
        var line = this.session.getLine(row).substring(0, column);
        if (column == 0) {
            do {
                row--;
                line = this.doc.getLine(row);
            } while (row > 0 && /^\s*$/.test(line));
            column = line.length;
            if (!/\s+$/.test(line))
                line = "";
        }
        var leftOfCursor = stringReverse(line);
        var index = this.$shortWordEndIndex(leftOfCursor);
        return this.moveCursorTo(row, column - index);
    }
    moveCursorWordRight() {
        if (this.session['$selectLongWords']) {
            this.moveCursorLongWordRight();
        }
        else {
            this.moveCursorShortWordRight();
        }
    }
    moveCursorWordLeft() {
        if (this.session['$selectLongWords']) {
            this.moveCursorLongWordLeft();
        }
        else {
            this.moveCursorShortWordLeft();
        }
    }
    moveCursorBy(rows, chars) {
        var screenPos = this.session.documentToScreenPosition(this.lead.row, this.lead.column);
        if (chars === 0) {
            if (this.$desiredColumn)
                screenPos.column = this.$desiredColumn;
            else
                this.$desiredColumn = screenPos.column;
        }
        var docPos = this.session.screenToDocumentPosition(screenPos.row + rows, screenPos.column);
        if (rows !== 0 && chars === 0 && docPos.row === this.lead.row && docPos.column === this.lead.column) {
            if (this.session.lineWidgets && this.session.lineWidgets[docPos.row])
                docPos.row++;
        }
        this.moveCursorTo(docPos.row, docPos.column + chars, chars === 0);
    }
    moveCursorToPosition(position) {
        this.moveCursorTo(position.row, position.column);
    }
    moveCursorTo(row, column, keepDesiredColumn) {
        var fold = this.session.getFoldAt(row, column, 1);
        if (fold) {
            row = fold.start.row;
            column = fold.start.column;
        }
        this.$keepDesiredColumnOnChange = true;
        this.lead.setPosition(row, column);
        this.$keepDesiredColumnOnChange = false;
        if (!keepDesiredColumn)
            this.$desiredColumn = null;
    }
    moveCursorToScreen(row, column, keepDesiredColumn) {
        var pos = this.session.screenToDocumentPosition(row, column);
        this.moveCursorTo(pos.row, pos.column, keepDesiredColumn);
    }
    on(eventName, callback) {
        this.eventBus.on(eventName, callback, false);
    }
    off(eventName, callback) {
        this.eventBus.off(eventName, callback);
    }
    detach() {
        this.lead.detach();
        this.anchor.detach();
        this.session = this.doc = null;
    }
    fromOrientedRange(range) {
        this.setSelectionRange(range, range.cursor == range.start);
        this.$desiredColumn = range.desiredColumn || this.$desiredColumn;
    }
    toOrientedRange(range) {
        var r = this.getRange();
        if (range) {
            range.start.column = r.start.column;
            range.start.row = r.start.row;
            range.end.column = r.end.column;
            range.end.row = r.end.row;
        }
        else {
            range = r;
        }
        range.cursor = this.isBackwards() ? range.start : range.end;
        range.desiredColumn = this.$desiredColumn;
        return range;
    }
    getRangeOfMovements(func) {
        var start = this.getCursor();
        try {
            func.call(null, this);
            var end = this.getCursor();
            return Range.fromPoints(start, end);
        }
        catch (e) {
            return Range.fromPoints(start, start);
        }
        finally {
            this.moveCursorToPosition(start);
        }
    }
    toJSON() {
        if (this.rangeCount) {
            var data = this.ranges.map(function (r) {
                var r1 = r.clone();
                r1.isBackwards = r.cursor == r.start;
                return r1;
            });
        }
        else {
            var data = this.getRange();
            data.isBackwards = this.isBackwards();
        }
        return data;
    }
    toSingleRange(data) {
        throw new Error("Selection.toSingleRange is unsupported");
    }
    addRange(data, something) {
        throw new Error("Selection.addRange is unsupported");
    }
    fromJSON(data) {
        if (data.start == undefined) {
            if (this.rangeList) {
                this.toSingleRange(data[0]);
                for (var i = data.length; i--;) {
                    var r = Range.fromPoints(data[i].start, data[i].end);
                    if (data.isBackwards)
                        r.cursor = r.start;
                    this.addRange(r, true);
                }
                return;
            }
            else
                data = data[0];
        }
        if (this.rangeList)
            this.toSingleRange(data);
        this.setSelectionRange(data, data.isBackwards);
    }
    isEqual(data) {
        if ((data.length || this.rangeCount) && data.length !== this.rangeCount)
            return false;
        if (!data.length || !this.ranges)
            return this.getRange().isEqual(data);
        for (var i = this.ranges.length; i--;) {
            if (!this.ranges[i].isEqual(data[i]))
                return false;
        }
        return true;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VsZWN0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiU2VsZWN0aW9uLnRzIl0sIm5hbWVzIjpbIlNlbGVjdGlvbiIsIlNlbGVjdGlvbi5jb25zdHJ1Y3RvciIsIlNlbGVjdGlvbi5pc0VtcHR5IiwiU2VsZWN0aW9uLmlzTXVsdGlMaW5lIiwiU2VsZWN0aW9uLmdldEN1cnNvciIsIlNlbGVjdGlvbi5zZXRTZWxlY3Rpb25BbmNob3IiLCJTZWxlY3Rpb24uZ2V0U2VsZWN0aW9uQW5jaG9yIiwiU2VsZWN0aW9uLmdldFNlbGVjdGlvbkxlYWQiLCJTZWxlY3Rpb24uc2hpZnRTZWxlY3Rpb24iLCJTZWxlY3Rpb24uaXNCYWNrd2FyZHMiLCJTZWxlY3Rpb24uZ2V0UmFuZ2UiLCJTZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb24iLCJTZWxlY3Rpb24uc2VsZWN0QWxsIiwiU2VsZWN0aW9uLnNldFJhbmdlIiwiU2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlIiwiU2VsZWN0aW9uLiRtb3ZlU2VsZWN0aW9uIiwiU2VsZWN0aW9uLnNlbGVjdFRvIiwiU2VsZWN0aW9uLnNlbGVjdFRvUG9zaXRpb24iLCJTZWxlY3Rpb24ubW92ZVRvIiwiU2VsZWN0aW9uLm1vdmVUb1Bvc2l0aW9uIiwiU2VsZWN0aW9uLnNlbGVjdFVwIiwiU2VsZWN0aW9uLnNlbGVjdERvd24iLCJTZWxlY3Rpb24uc2VsZWN0UmlnaHQiLCJTZWxlY3Rpb24uc2VsZWN0TGVmdCIsIlNlbGVjdGlvbi5zZWxlY3RMaW5lU3RhcnQiLCJTZWxlY3Rpb24uc2VsZWN0TGluZUVuZCIsIlNlbGVjdGlvbi5zZWxlY3RGaWxlRW5kIiwiU2VsZWN0aW9uLnNlbGVjdEZpbGVTdGFydCIsIlNlbGVjdGlvbi5zZWxlY3RXb3JkUmlnaHQiLCJTZWxlY3Rpb24uc2VsZWN0V29yZExlZnQiLCJTZWxlY3Rpb24uZ2V0V29yZFJhbmdlIiwiU2VsZWN0aW9uLnNlbGVjdFdvcmQiLCJTZWxlY3Rpb24uc2VsZWN0QVdvcmQiLCJTZWxlY3Rpb24uZ2V0TGluZVJhbmdlIiwiU2VsZWN0aW9uLnNlbGVjdExpbmUiLCJTZWxlY3Rpb24ubW92ZUN1cnNvclVwIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JEb3duIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JMZWZ0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JSaWdodCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGluZVN0YXJ0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JMaW5lRW5kIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JGaWxlRW5kIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JGaWxlU3RhcnQiLCJTZWxlY3Rpb24ubW92ZUN1cnNvckxvbmdXb3JkUmlnaHQiLCJTZWxlY3Rpb24ubW92ZUN1cnNvckxvbmdXb3JkTGVmdCIsIlNlbGVjdGlvbi4kc2hvcnRXb3JkRW5kSW5kZXgiLCJTZWxlY3Rpb24ubW92ZUN1cnNvclNob3J0V29yZFJpZ2h0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JTaG9ydFdvcmRMZWZ0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JXb3JkUmlnaHQiLCJTZWxlY3Rpb24ubW92ZUN1cnNvcldvcmRMZWZ0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JCeSIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbiIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yVG8iLCJTZWxlY3Rpb24ubW92ZUN1cnNvclRvU2NyZWVuIiwiU2VsZWN0aW9uLm9uIiwiU2VsZWN0aW9uLm9mZiIsIlNlbGVjdGlvbi5kZXRhY2giLCJTZWxlY3Rpb24uZnJvbU9yaWVudGVkUmFuZ2UiLCJTZWxlY3Rpb24udG9PcmllbnRlZFJhbmdlIiwiU2VsZWN0aW9uLmdldFJhbmdlT2ZNb3ZlbWVudHMiLCJTZWxlY3Rpb24udG9KU09OIiwiU2VsZWN0aW9uLnRvU2luZ2xlUmFuZ2UiLCJTZWxlY3Rpb24uYWRkUmFuZ2UiLCJTZWxlY3Rpb24uZnJvbUpTT04iLCJTZWxlY3Rpb24uaXNFcXVhbCJdLCJtYXBwaW5ncyI6IkFBb0RBLFlB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QSxHQUFHQSxDQUFDQTtRQUM5QkEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDdEJBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxNQUFNQSxDQUFDQSxJQUFJQSxLQUFLQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxFQUFFQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUMvRUEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsTUFBTUEsQ0FBQ0EsSUFBSUEsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsRUFBRUEsTUFBTUEsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDakRBLENBQUNBO0lBQ0xBLENBQUNBO0lBS0RqQyxVQUFVQTtRQUNOa0MsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUNoREEsQ0FBQ0E7SUFNRGxDLFlBQVlBO1FBQ1JtQyxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUM3QkEsQ0FBQ0E7SUFNRG5DLGNBQWNBO1FBQ1ZvQyxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUM1QkEsQ0FBQ0E7SUFNRHBDLGNBQWNBO1FBQ1ZxQyxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxFQUFFQSxFQUNoQ0EsSUFBSUEsQ0FBQ0E7UUFFVEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDL0RBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ3pEQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUU3QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUMvRUEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7WUFDeENBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLE9BQU9BLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLElBQUlBLE9BQU9BLENBQUNBO2dCQUM5SUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLElBQUlBO2dCQUNBQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNqQ0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFNRHJDLGVBQWVBO1FBQ1hzQyxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQTtRQUNsQ0EsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDMURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ1BBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ3JEQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzNDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1Q0EsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7WUFDeENBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBO1lBQ3ZCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxPQUFPQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxJQUFJQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDaEpBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO1lBQ2xDQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDRkEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUJBLENBQUNBO1FBQ0xBLENBQUNBO0lBQ0xBLENBQUNBO0lBTUR0QyxtQkFBbUJBO1FBQ2Z1QyxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUN4QkEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDOUJBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlB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QUNBO1FBRzlCQSxJQUFJQSxJQUFJQSxDQUFDQTtRQUNUQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqREEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDckRBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBR0RBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGVBQWVBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3hEQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNkQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFBQTtRQUNwREEsQ0FBQ0E7UUFFREEsSUFBSUEsWUFBWUEsR0FBR0EsYUFBYUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdENBLElBQUlBLEtBQUtBLENBQUNBO1FBQ1ZBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3RDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUduQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEs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TUEsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFFOUJBLElBQUlBLElBQUlBLENBQUNBO1FBQ1RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQy9DQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUVoRUEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDMURBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2RBLEdBQUdBLENBQUNBO2dCQUNBQSxHQUFHQSxFQUFFQSxDQUFDQTtnQkFDTkEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDakNBLENBQUNBLFFBQVFBLEdBQUdBLEdBQUdBLENBQUNBLElBQUlBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEVBQUNBO1lBRXZDQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNyQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ25CQSxJQUFJQSxHQUFHQSxFQUFFQSxDQUFBQTtRQUNqQkEsQ0FBQ0E7UUFFREEsSUFBSUEsWUFBWUEsR0FBR0EsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FB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QUFJQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDNUJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBO29CQUM3QkEsSUFBSUEsQ0FBQ0EsR0FBUUEsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzFEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQTt3QkFDakJBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO29CQUN2QkEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzNCQSxDQUFDQTtnQkFDREEsTUFBTUEsQ0FBQ0E7WUFDWEEsQ0FBQ0E7WUFBQ0EsSUFBSUE7Z0JBQ0ZBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3ZCQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUNmQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUM3QkEsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtJQUNuREEsQ0FBQ0E7SUFFRC9ELE9BQU9BLENBQUNBLElBQUlBO1FBQ1JnRSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxLQUFLQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtZQUNwRUEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDakJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBO1lBQzdCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUV6Q0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0E7WUFDcENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQUE7UUFDcEJBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtBQUNMaEUsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNC0yMDE2IERhdmlkIEdlbyBIb2xtZXMgPGRhdmlkLmdlby5ob2xtZXNAZ21haWwuY29tPlxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGxcbiAqIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuICogU09GVFdBUkUuXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cInVzZSBzdHJpY3RcIjtcblxuaW1wb3J0IERvY3VtZW50IGZyb20gXCIuL0RvY3VtZW50XCI7XG5pbXBvcnQge3N0cmluZ1JldmVyc2V9IGZyb20gXCIuL2xpYi9sYW5nXCI7XG5pbXBvcnQgRXZlbnRFbWl0dGVyQ2xhc3MgZnJvbSBcIi4vbGliL0V2ZW50RW1pdHRlckNsYXNzXCI7XG5pbXBvcnQgT3JpZW50ZWRSYW5nZSBmcm9tIFwiLi9PcmllbnRlZFJhbmdlXCI7XG5pbXBvcnQgUG9zaXRpb24gZnJvbSBcIi4vUG9zaXRpb25cIjtcbmltcG9ydCBSYW5nZSBmcm9tIFwiLi9SYW5nZVwiO1xuaW1wb3J0IHtSYW5nZUxpc3R9IGZyb20gXCIuL3JhbmdlX2xpc3RcIjtcbmltcG9ydCBFZGl0U2Vzc2lvbiBmcm9tIFwiLi9FZGl0U2Vzc2lvblwiO1xuaW1wb3J0IEFuY2hvciBmcm9tIFwiLi9BbmNob3JcIjtcbmltcG9ydCBFdmVudEJ1cyBmcm9tIFwiLi9FdmVudEJ1c1wiO1xuXG4vKipcbiAqIENvbnRhaW5zIHRoZSBjdXJzb3IgcG9zaXRpb24gYW5kIHRoZSB0ZXh0IHNlbGVjdGlvbiBvZiBhbiBlZGl0IHNlc3Npb24uXG4gKlxuICogVGhlIHJvdy9jb2x1bW5zIHVzZWQgaW4gdGhlIHNlbGVjdGlvbiBhcmUgaW4gZG9jdW1lbnQgY29vcmRpbmF0ZXMgcmVwcmVzZW50aW5nXG4gKiB0aGUgY29vcmRpbmF0ZXMgYXMgdGhleSBhcHBlYXIgaW4gdGhlIGRvY3VtZW50IGJlZm9yZSBhcHBseWluZyBzb2Z0IHdyYXAgYW5kIGZvbGRpbmcuXG4gKlxuICogQGNsYXNzIFNlbGVjdGlvblxuICovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTZWxlY3Rpb24gaW1wbGVtZW50cyBFdmVudEJ1czxTZWxlY3Rpb24+IHtcbiAgICBwcml2YXRlIHNlc3Npb246IEVkaXRTZXNzaW9uO1xuICAgIC8vIEZJWE1FOiBNYXliZSBTZWxlY3Rpb24gc2hvdWxkIG9ubHkgY291cGxlIHRvIHRoZSBFZGl0U2Vzc2lvbj9cbiAgICBwcml2YXRlIGRvYzogRG9jdW1lbnQ7XG4gICAgLy8gV2h5IGRvIHdlIHNlZW0gdG8gaGF2ZSBjb3BpZXM/XG4gICAgcHVibGljIGxlYWQ6IEFuY2hvcjtcbiAgICBwdWJsaWMgYW5jaG9yOiBBbmNob3I7XG4gICAgcHJpdmF0ZSBzZWxlY3Rpb25MZWFkOiBBbmNob3I7XG4gICAgcHJpdmF0ZSBzZWxlY3Rpb25BbmNob3I6IEFuY2hvcjtcbiAgICBwcml2YXRlICRpc0VtcHR5OiBib29sZWFuO1xuICAgIHByaXZhdGUgJGtlZXBEZXNpcmVkQ29sdW1uT25DaGFuZ2U6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkZGVzaXJlZENvbHVtbjsgIC8vIElzIHRoaXMgdXNlZCBhbnl3aGVyZT9cbiAgICBwdWJsaWMgcmFuZ2VDb3VudDogbnVtYmVyO1xuICAgIHB1YmxpYyByYW5nZXM7XG4gICAgcHVibGljIHJhbmdlTGlzdDogUmFuZ2VMaXN0O1xuICAgIHByaXZhdGUgZXZlbnRCdXM6IEV2ZW50RW1pdHRlckNsYXNzPFNlbGVjdGlvbj47XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbmV3IGBTZWxlY3Rpb25gIG9iamVjdC5cbiAgICAgKlxuICAgICAqIEBjbGFzcyBTZWxlY3Rpb25cbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKiBAcGFyYW0gc2Vzc2lvbiB7RWRpdFNlc3Npb259IFRoZSBzZXNzaW9uIHRvIHVzZS5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihzZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLmV2ZW50QnVzID0gbmV3IEV2ZW50RW1pdHRlckNsYXNzPFNlbGVjdGlvbj4odGhpcyk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbiA9IHNlc3Npb247XG4gICAgICAgIHRoaXMuZG9jID0gc2Vzc2lvbi5nZXREb2N1bWVudCgpO1xuXG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5sZWFkID0gdGhpcy5zZWxlY3Rpb25MZWFkID0gbmV3IEFuY2hvcih0aGlzLmRvYywgMCwgMCk7XG4gICAgICAgIHRoaXMuYW5jaG9yID0gdGhpcy5zZWxlY3Rpb25BbmNob3IgPSBuZXcgQW5jaG9yKHRoaXMuZG9jLCAwLCAwKTtcblxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMubGVhZC5vbihcImNoYW5nZVwiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIEBldmVudCBjaGFuZ2VDdXJzb3JcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgc2VsZi5ldmVudEJ1cy5fZW1pdChcImNoYW5nZUN1cnNvclwiKTtcbiAgICAgICAgICAgIGlmICghc2VsZi4kaXNFbXB0eSkge1xuICAgICAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICAgICAqIEBldmVudCBjaGFuZ2VTZWxlY3Rpb25cbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICBzZWxmLmV2ZW50QnVzLl9lbWl0KFwiY2hhbmdlU2VsZWN0aW9uXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFzZWxmLiRrZWVwRGVzaXJlZENvbHVtbk9uQ2hhbmdlICYmIGUub2xkLmNvbHVtbiAhPSBlLnZhbHVlLmNvbHVtbilcbiAgICAgICAgICAgICAgICBzZWxmLiRkZXNpcmVkQ29sdW1uID0gbnVsbDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5zZWxlY3Rpb25BbmNob3Iub24oXCJjaGFuZ2VcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoIXNlbGYuJGlzRW1wdHkpIHtcbiAgICAgICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAgICAgKiBAZXZlbnQgY2hhbmdlU2VsZWN0aW9uXG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgc2VsZi5ldmVudEJ1cy5fZW1pdChcImNoYW5nZVNlbGVjdGlvblwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHNlbGVjdGlvbiBpcyBlbXB0eS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgaXNFbXB0eVxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgaXNFbXB0eSgpOiBib29sZWFuIHtcbiAgICAgICAgLy8gV2hhdCBpcyB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuICRpc0VtcHR5IGFuZCB3aGF0IHRoaXMgZnVuY3Rpb24gcmV0dXJucz9cbiAgICAgICAgcmV0dXJuICh0aGlzLiRpc0VtcHR5IHx8IChcbiAgICAgICAgICAgIHRoaXMuYW5jaG9yLnJvdyA9PSB0aGlzLmxlYWQucm93ICYmXG4gICAgICAgICAgICB0aGlzLmFuY2hvci5jb2x1bW4gPT0gdGhpcy5sZWFkLmNvbHVtblxuICAgICAgICApKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgc2VsZWN0aW9uIGlzIGEgbXVsdGktbGluZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgaXNNdWx0aUxpbmVcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIGlzTXVsdGlMaW5lKCk6IGJvb2xlYW4ge1xuICAgICAgICBpZiAodGhpcy5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLmdldFJhbmdlKCkuaXNNdWx0aUxpbmUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHBvc2l0aW9uIG9mIHRoZSBjdXJzb3IuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldEN1cnNvclxuICAgICAqIEByZXR1cm4ge1Bvc2l0aW9ufVxuICAgICAqL1xuICAgIGdldEN1cnNvcigpOiBQb3NpdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmxlYWQuZ2V0UG9zaXRpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSByb3cgYW5kIGNvbHVtbiBwb3NpdGlvbiBvZiB0aGUgYW5jaG9yLlxuICAgICAqIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VTZWxlY3Rpb24nYCBldmVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0U2VsZWN0aW9uQW5jaG9yXG4gICAgICogQHBhcmFtIHJvdyB7bnVtYmVyfSBUaGUgbmV3IHJvd1xuICAgICAqIEBwYXJhbSBjb2x1bW4ge251bWJlcn0gVGhlIG5ldyBjb2x1bW5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldFNlbGVjdGlvbkFuY2hvcihyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5hbmNob3Iuc2V0UG9zaXRpb24ocm93LCBjb2x1bW4pO1xuXG4gICAgICAgIGlmICh0aGlzLiRpc0VtcHR5KSB7XG4gICAgICAgICAgICB0aGlzLiRpc0VtcHR5ID0gZmFsc2U7XG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIEBldmVudCBjaGFuZ2VTZWxlY3Rpb25cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5ldmVudEJ1cy5fZW1pdChcImNoYW5nZVNlbGVjdGlvblwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHBvc2l0aW9uIG9mIHRoZSBjYWxsaW5nIHNlbGVjdGlvbiBhbmNob3IuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFNlbGVjdGlvbkFuY2hvclxuICAgICAqIEByZXR1cm4ge1Bvc2l0aW9ufVxuICAgICAqIEByZWxhdGVkIEFuY2hvci5nZXRQb3NpdGlvblxuICAgICAqL1xuICAgIGdldFNlbGVjdGlvbkFuY2hvcigpOiBQb3NpdGlvbiB7XG4gICAgICAgIGlmICh0aGlzLiRpc0VtcHR5KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRTZWxlY3Rpb25MZWFkKClcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFuY2hvci5nZXRQb3NpdGlvbigpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgYHJvd2AgYW5kIGBjb2x1bW5gIG9mIHRoZSBjYWxsaW5nIHNlbGVjdGlvbiBsZWFkLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRTZWxlY3Rpb25MZWFkXG4gICAgICogQHJldHVybiB7UG9zaXRpb259XG4gICAgICovXG4gICAgZ2V0U2VsZWN0aW9uTGVhZCgpOiBQb3NpdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmxlYWQuZ2V0UG9zaXRpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaGlmdHMgdGhlIHNlbGVjdGlvbiB1cCAob3IgZG93biwgaWYgW1tTZWxlY3Rpb24uaXNCYWNrd2FyZHMgYGlzQmFja3dhcmRzKClgXV0gaXMgdHJ1ZSkgdGhlIGdpdmVuIG51bWJlciBvZiBjb2x1bW5zLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzaGlmdFNlbGVjdGlvblxuICAgICAqIEBwYXJhbSBjb2x1bW5zIHtudW1iZXJ9IFRoZSBudW1iZXIgb2YgY29sdW1ucyB0byBzaGlmdCBieS5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNoaWZ0U2VsZWN0aW9uKGNvbHVtbnM6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy4kaXNFbXB0eSkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8odGhpcy5sZWFkLnJvdywgdGhpcy5sZWFkLmNvbHVtbiArIGNvbHVtbnMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGFuY2hvciA9IHRoaXMuZ2V0U2VsZWN0aW9uQW5jaG9yKCk7XG4gICAgICAgIHZhciBsZWFkID0gdGhpcy5nZXRTZWxlY3Rpb25MZWFkKCk7XG5cbiAgICAgICAgdmFyIGlzQmFja3dhcmRzID0gdGhpcy5pc0JhY2t3YXJkcygpO1xuXG4gICAgICAgIGlmICghaXNCYWNrd2FyZHMgfHwgYW5jaG9yLmNvbHVtbiAhPT0gMClcbiAgICAgICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uQW5jaG9yKGFuY2hvci5yb3csIGFuY2hvci5jb2x1bW4gKyBjb2x1bW5zKTtcblxuICAgICAgICBpZiAoaXNCYWNrd2FyZHMgfHwgbGVhZC5jb2x1bW4gIT09IDApIHtcbiAgICAgICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8obGVhZC5yb3csIGxlYWQuY29sdW1uICsgY29sdW1ucyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBzZWxlY3Rpb24gaXMgZ29pbmcgYmFja3dhcmRzIGluIHRoZSBkb2N1bWVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgaXNCYWNrd2FyZHNcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIGlzQmFja3dhcmRzKCk6IGJvb2xlYW4ge1xuICAgICAgICB2YXIgYW5jaG9yID0gdGhpcy5hbmNob3I7XG4gICAgICAgIHZhciBsZWFkID0gdGhpcy5sZWFkO1xuICAgICAgICByZXR1cm4gKGFuY2hvci5yb3cgPiBsZWFkLnJvdyB8fCAoYW5jaG9yLnJvdyA9PSBsZWFkLnJvdyAmJiBhbmNob3IuY29sdW1uID4gbGVhZC5jb2x1bW4pKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBbUmV0dXJucyB0aGUgW1tSYW5nZV1dIGZvciB0aGUgc2VsZWN0ZWQgdGV4dC5dezogI1NlbGVjdGlvbi5nZXRSYW5nZX1cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0UmFuZ2VcbiAgICAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgICAgKi9cbiAgICBnZXRSYW5nZSgpIHtcbiAgICAgICAgdmFyIGFuY2hvciA9IHRoaXMuYW5jaG9yO1xuICAgICAgICB2YXIgbGVhZCA9IHRoaXMubGVhZDtcblxuICAgICAgICBpZiAodGhpcy5pc0VtcHR5KCkpXG4gICAgICAgICAgICByZXR1cm4gUmFuZ2UuZnJvbVBvaW50cyhsZWFkLCBsZWFkKTtcblxuICAgICAgICBpZiAodGhpcy5pc0JhY2t3YXJkcygpKSB7XG4gICAgICAgICAgICByZXR1cm4gUmFuZ2UuZnJvbVBvaW50cyhsZWFkLCBhbmNob3IpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIFJhbmdlLmZyb21Qb2ludHMoYW5jaG9yLCBsZWFkKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtcHRpZXMgdGhlIHNlbGVjdGlvbiAoYnkgZGUtc2VsZWN0aW5nIGl0KS5cbiAgICAgKiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlU2VsZWN0aW9uJ2AgZXZlbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGNsZWFyU2VsZWN0aW9uXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBjbGVhclNlbGVjdGlvbigpOiB2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLiRpc0VtcHR5KSB7XG4gICAgICAgICAgICB0aGlzLiRpc0VtcHR5ID0gdHJ1ZTtcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IGNoYW5nZVNlbGVjdGlvblxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB0aGlzLmV2ZW50QnVzLl9lbWl0KFwiY2hhbmdlU2VsZWN0aW9uXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2VsZWN0cyBhbGwgdGhlIHRleHQgaW4gdGhlIGRvY3VtZW50LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZWxlY3RBbGxcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNlbGVjdEFsbCgpOiB2b2lkIHtcbiAgICAgICAgdmFyIGxhc3RSb3cgPSB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDE7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uQW5jaG9yKDAsIDApO1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhsYXN0Um93LCB0aGlzLmRvYy5nZXRMaW5lKGxhc3RSb3cpLmxlbmd0aCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBwcm92aWRlZCByYW5nZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0UmFuZ2VcbiAgICAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBUaGUgcmFuZ2Ugb2YgdGV4dCB0byBzZWxlY3RcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHJldmVyc2UgSW5kaWNhdGVzIGlmIHRoZSByYW5nZSBzaG91bGQgZ28gYmFja3dhcmRzIChgdHJ1ZWApIG9yIG5vdFxuICAgICAqL1xuICAgIHB1YmxpYyBzZXRSYW5nZShyYW5nZTogUmFuZ2UsIHJldmVyc2U/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2UsIHJldmVyc2UpO1xuICAgIH1cblxuICAgIHB1YmxpYyBzZXRTZWxlY3Rpb25SYW5nZShyYW5nZTogUmFuZ2UsIHJldmVyc2U/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIGlmIChyZXZlcnNlKSB7XG4gICAgICAgICAgICB0aGlzLnNldFNlbGVjdGlvbkFuY2hvcihyYW5nZS5lbmQucm93LCByYW5nZS5lbmQuY29sdW1uKTtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0VG8ocmFuZ2Uuc3RhcnQucm93LCByYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25BbmNob3IocmFuZ2Uuc3RhcnQucm93LCByYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RUbyhyYW5nZS5lbmQucm93LCByYW5nZS5lbmQuY29sdW1uKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5nZXRSYW5nZSgpLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuJGlzRW1wdHkgPSB0cnVlO1xuICAgICAgICB0aGlzLiRkZXNpcmVkQ29sdW1uID0gbnVsbDtcbiAgICB9XG5cbiAgICAkbW92ZVNlbGVjdGlvbihtb3Zlcikge1xuICAgICAgICB2YXIgbGVhZCA9IHRoaXMubGVhZDtcbiAgICAgICAgaWYgKHRoaXMuJGlzRW1wdHkpXG4gICAgICAgICAgICB0aGlzLnNldFNlbGVjdGlvbkFuY2hvcihsZWFkLnJvdywgbGVhZC5jb2x1bW4pO1xuXG4gICAgICAgIG1vdmVyLmNhbGwodGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiBjdXJzb3IgdG8gdGhlIGluZGljYXRlZCByb3cgYW5kIGNvbHVtbi5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2VsZWN0VG9cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gc2VsZWN0IHRvXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIHRvIHNlbGVjdCB0b1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2VsZWN0VG8ocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbik7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gY3Vyc29yIHRvIHRoZSByb3cgYW5kIGNvbHVtbiBpbmRpY2F0ZWQgYnkgYHBvc2AuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNlbGVjdFRvUG9zaXRpb25cbiAgICAgKiBAcGFyYW0gcG9zaXRpb24ge1Bvc2l0aW9ufSBBbiBvYmplY3QgY29udGFpbmluZyB0aGUgcm93IGFuZCBjb2x1bW5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNlbGVjdFRvUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uKTogdm9pZCB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYubW92ZUN1cnNvclRvUG9zaXRpb24ocG9zaXRpb24pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIGN1cnNvciB0byB0aGUgaW5kaWNhdGVkIHJvdyBhbmQgY29sdW1uLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBtb3ZlVG9cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gc2VsZWN0IHRvXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIHRvIHNlbGVjdCB0b1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgbW92ZVRvKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIGN1cnNvciB0byB0aGUgcm93IGFuZCBjb2x1bW4gaW5kaWNhdGVkIGJ5IGBwb3NgLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBtb3ZlVG9Qb3NpdGlvblxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwb3MgQW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIHJvdyBhbmQgY29sdW1uLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgbW92ZVRvUG9zaXRpb24ocG9zOiBQb3NpdGlvbik6IHZvaWQge1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24ocG9zKTtcbiAgICB9XG5cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdXAgb25lIHJvdy5cbiAgICAgKi9cbiAgICBzZWxlY3RVcCgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JVcCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiBkb3duIG9uZSByb3cuXG4gICAgICovXG4gICAgc2VsZWN0RG93bigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JEb3duKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHJpZ2h0IG9uZSBjb2x1bW4uXG4gICAgICovXG4gICAgc2VsZWN0UmlnaHQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yUmlnaHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gbGVmdCBvbmUgY29sdW1uLlxuICAgICAqL1xuICAgIHNlbGVjdExlZnQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yTGVmdCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB0byB0aGUgYmVnaW5uaW5nIG9mIHRoZSBjdXJyZW50IGxpbmUuXG4gICAgICovXG4gICAgc2VsZWN0TGluZVN0YXJ0KCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvckxpbmVTdGFydCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB0byB0aGUgZW5kIG9mIHRoZSBjdXJyZW50IGxpbmUuXG4gICAgICovXG4gICAgc2VsZWN0TGluZUVuZCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JMaW5lRW5kKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBlbmQgb2YgdGhlIGZpbGUuXG4gICAgICovXG4gICAgc2VsZWN0RmlsZUVuZCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JGaWxlRW5kKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBzdGFydCBvZiB0aGUgZmlsZS5cbiAgICAqKi9cbiAgICBzZWxlY3RGaWxlU3RhcnQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yRmlsZVN0YXJ0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBmaXJzdCB3b3JkIG9uIHRoZSByaWdodC5cbiAgICAqKi9cbiAgICBzZWxlY3RXb3JkUmlnaHQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yV29yZFJpZ2h0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBmaXJzdCB3b3JkIG9uIHRoZSBsZWZ0LlxuICAgICoqL1xuICAgIHNlbGVjdFdvcmRMZWZ0KCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvcldvcmRMZWZ0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIGhpZ2hsaWdodCB0aGUgZW50aXJlIHdvcmQuXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZ2V0V29yZFJhbmdlXG4gICAgICovXG4gICAgZ2V0V29yZFJhbmdlKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IFJhbmdlIHtcbiAgICAgICAgLy8gICAgICAgIGlmICh0eXBlb2YgY29sdW1uID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIC8vICAgICAgICAgICAgdmFyIGN1cnNvciA9IHJvdyB8fCB0aGlzLmxlYWQ7XG4gICAgICAgIC8vICAgICAgICAgICAgcm93ID0gY3Vyc29yLnJvdztcbiAgICAgICAgLy8gICAgICAgICAgICBjb2x1bW4gPSBjdXJzb3IuY29sdW1uO1xuICAgICAgICAvLyAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFdvcmRSYW5nZShyb3csIGNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogU2VsZWN0cyBhbiBlbnRpcmUgd29yZCBib3VuZGFyeS5cbiAgICAqKi9cbiAgICBzZWxlY3RXb3JkKCkge1xuICAgICAgICB0aGlzLnNldFNlbGVjdGlvblJhbmdlKHRoaXMuZ2V0V29yZFJhbmdlKHRoaXMubGVhZC5yb3csIHRoaXMubGVhZC5jb2x1bW4pKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNlbGVjdHMgYSB3b3JkLCBpbmNsdWRpbmcgaXRzIHJpZ2h0IHdoaXRlc3BhY2UuXG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRBV29yZFJhbmdlXG4gICAgKiovXG4gICAgc2VsZWN0QVdvcmQoKSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvcigpO1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLnNlc3Npb24uZ2V0QVdvcmRSYW5nZShjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcbiAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSk7XG4gICAgfVxuXG4gICAgZ2V0TGluZVJhbmdlKHJvdz86IG51bWJlciwgZXhjbHVkZUxhc3RDaGFyPzogYm9vbGVhbik6IFJhbmdlIHtcbiAgICAgICAgdmFyIHJvd1N0YXJ0ID0gdHlwZW9mIHJvdyA9PSBcIm51bWJlclwiID8gcm93IDogdGhpcy5sZWFkLnJvdztcbiAgICAgICAgdmFyIHJvd0VuZDtcblxuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZExpbmUocm93U3RhcnQpO1xuICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgIHJvd1N0YXJ0ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICAgICAgcm93RW5kID0gZm9sZExpbmUuZW5kLnJvdztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJvd0VuZCA9IHJvd1N0YXJ0O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGV4Y2x1ZGVMYXN0Q2hhcikge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBSYW5nZShyb3dTdGFydCwgMCwgcm93RW5kLCB0aGlzLnNlc3Npb24uZ2V0TGluZShyb3dFbmQpLmxlbmd0aCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFJhbmdlKHJvd1N0YXJ0LCAwLCByb3dFbmQgKyAxLCAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogU2VsZWN0cyB0aGUgZW50aXJlIGxpbmUuXG4gICAgKiovXG4gICAgc2VsZWN0TGluZSgpIHtcbiAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25SYW5nZSh0aGlzLmdldExpbmVSYW5nZSgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHVwIG9uZSByb3cuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvclVwKCkge1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeSgtMSwgMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciBkb3duIG9uZSByb3cuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckRvd24oKSB7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvckJ5KDEsIDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgbGVmdCBvbmUgY29sdW1uLlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JMZWZ0KCkge1xuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5sZWFkLmdldFBvc2l0aW9uKCksXG4gICAgICAgICAgICBmb2xkO1xuXG4gICAgICAgIGlmIChmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uLCAtMSkpIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGZvbGQuc3RhcnQucm93LCBmb2xkLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgIH0gZWxzZSBpZiAoY3Vyc29yLmNvbHVtbiA9PT0gMCkge1xuICAgICAgICAgICAgLy8gY3Vyc29yIGlzIGEgbGluZSAoc3RhcnRcbiAgICAgICAgICAgIGlmIChjdXJzb3Iucm93ID4gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGN1cnNvci5yb3cgLSAxLCB0aGlzLmRvYy5nZXRMaW5lKGN1cnNvci5yb3cgLSAxKS5sZW5ndGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHRhYlNpemUgPSB0aGlzLnNlc3Npb24uZ2V0VGFiU2l6ZSgpO1xuICAgICAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi5pc1RhYlN0b3AoY3Vyc29yKSAmJiB0aGlzLmRvYy5nZXRMaW5lKGN1cnNvci5yb3cpLnNsaWNlKGN1cnNvci5jb2x1bW4gLSB0YWJTaXplLCBjdXJzb3IuY29sdW1uKS5zcGxpdChcIiBcIikubGVuZ3RoIC0gMSA9PSB0YWJTaXplKVxuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckJ5KDAsIC10YWJTaXplKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeSgwLCAtMSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHJpZ2h0IG9uZSBjb2x1bW4uXG4gICAgKiovXG4gICAgbW92ZUN1cnNvclJpZ2h0KCkge1xuICAgICAgICB2YXIgcG9zID0gdGhpcy5sZWFkLmdldFBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChwb3Mucm93LCBwb3MuY29sdW1uLCAxKTtcbiAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGZvbGQuZW5kLnJvdywgZm9sZC5lbmQuY29sdW1uKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLmxlYWQuY29sdW1uID09IHRoaXMuZG9jLmdldExpbmUodGhpcy5sZWFkLnJvdykubGVuZ3RoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5sZWFkLnJvdyA8IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSkge1xuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHRoaXMubGVhZC5yb3cgKyAxLCAwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciB0YWJTaXplID0gdGhpcy5zZXNzaW9uLmdldFRhYlNpemUoKTtcbiAgICAgICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmxlYWQ7XG4gICAgICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmlzVGFiU3RvcChjdXJzb3IpICYmIHRoaXMuZG9jLmdldExpbmUoY3Vyc29yLnJvdykuc2xpY2UoY3Vyc29yLmNvbHVtbiwgY3Vyc29yLmNvbHVtbiArIHRhYlNpemUpLnNwbGl0KFwiIFwiKS5sZW5ndGggLSAxID09IHRhYlNpemUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeSgwLCB0YWJTaXplKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckJ5KDAsIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3RhcnQgb2YgdGhlIGxpbmUuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckxpbmVTdGFydCgpIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMubGVhZC5yb3c7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLmxlYWQuY29sdW1uO1xuICAgICAgICB2YXIgc2NyZWVuUm93ID0gdGhpcy5zZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Sb3cocm93LCBjb2x1bW4pO1xuXG4gICAgICAgIC8vIERldGVybSB0aGUgZG9jLXBvc2l0aW9uIG9mIHRoZSBmaXJzdCBjaGFyYWN0ZXIgYXQgdGhlIHNjcmVlbiBsaW5lLlxuICAgICAgICB2YXIgZmlyc3RDb2x1bW5Qb3NpdGlvbiA9IHRoaXMuc2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93LCAwKTtcblxuICAgICAgICAvLyBEZXRlcm0gdGhlIGxpbmVcbiAgICAgICAgLy8gSG93IGRvZXMgZ2V0RGlzcGxheUxpbmUgZ2V0IGZyb20gZm9sZGluZyBvbnRvIHNlc3Npb24/XG4gICAgICAgIHZhciBiZWZvcmVDdXJzb3IgPSB0aGlzLnNlc3Npb25bJ2dldERpc3BsYXlMaW5lJ10oXG4gICAgICAgICAgICByb3csIG51bGwsIGZpcnN0Q29sdW1uUG9zaXRpb24ucm93LFxuICAgICAgICAgICAgZmlyc3RDb2x1bW5Qb3NpdGlvbi5jb2x1bW5cbiAgICAgICAgKTtcblxuICAgICAgICB2YXIgbGVhZGluZ1NwYWNlID0gYmVmb3JlQ3Vyc29yLm1hdGNoKC9eXFxzKi8pO1xuICAgICAgICAvLyBUT0RPIGZpbmQgYmV0dGVyIHdheSBmb3IgZW1hY3MgbW9kZSB0byBvdmVycmlkZSBzZWxlY3Rpb24gYmVoYXZpb3JzXG4gICAgICAgIGlmIChsZWFkaW5nU3BhY2VbMF0ubGVuZ3RoICE9IGNvbHVtbiAmJiAhdGhpcy5zZXNzaW9uWyckdXNlRW1hY3NTdHlsZUxpbmVTdGFydCddKVxuICAgICAgICAgICAgZmlyc3RDb2x1bW5Qb3NpdGlvbi5jb2x1bW4gKz0gbGVhZGluZ1NwYWNlWzBdLmxlbmd0aDtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihmaXJzdENvbHVtblBvc2l0aW9uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBlbmQgb2YgdGhlIGxpbmUuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckxpbmVFbmQoKSB7XG4gICAgICAgIHZhciBsZWFkID0gdGhpcy5sZWFkO1xuICAgICAgICB2YXIgbGluZUVuZCA9IHRoaXMuc2Vzc2lvbi5nZXREb2N1bWVudExhc3RSb3dDb2x1bW5Qb3NpdGlvbihsZWFkLnJvdywgbGVhZC5jb2x1bW4pO1xuICAgICAgICBpZiAodGhpcy5sZWFkLmNvbHVtbiA9PSBsaW5lRW5kLmNvbHVtbikge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSB0aGlzLnNlc3Npb24uZ2V0TGluZShsaW5lRW5kLnJvdyk7XG4gICAgICAgICAgICBpZiAobGluZUVuZC5jb2x1bW4gPT0gbGluZS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB2YXIgdGV4dEVuZCA9IGxpbmUuc2VhcmNoKC9cXHMrJC8pO1xuICAgICAgICAgICAgICAgIGlmICh0ZXh0RW5kID4gMClcbiAgICAgICAgICAgICAgICAgICAgbGluZUVuZC5jb2x1bW4gPSB0ZXh0RW5kO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8obGluZUVuZC5yb3csIGxpbmVFbmQuY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBlbmQgb2YgdGhlIGZpbGUuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckZpbGVFbmQoKSB7XG4gICAgICAgIHZhciByb3cgPSB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDE7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLmRvYy5nZXRMaW5lKHJvdykubGVuZ3RoO1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3RhcnQgb2YgdGhlIGZpbGUuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckZpbGVTdGFydCgpIHtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8oMCwgMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgd29yZCBvbiB0aGUgcmlnaHQuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckxvbmdXb3JkUmlnaHQoKSB7XG4gICAgICAgIHZhciByb3cgPSB0aGlzLmxlYWQucm93O1xuICAgICAgICB2YXIgY29sdW1uID0gdGhpcy5sZWFkLmNvbHVtbjtcbiAgICAgICAgdmFyIGxpbmUgPSB0aGlzLmRvYy5nZXRMaW5lKHJvdyk7XG4gICAgICAgIHZhciByaWdodE9mQ3Vyc29yID0gbGluZS5zdWJzdHJpbmcoY29sdW1uKTtcblxuICAgICAgICB2YXIgbWF0Y2g7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi50b2tlblJlLmxhc3RJbmRleCA9IDA7XG5cbiAgICAgICAgLy8gc2tpcCBmb2xkc1xuICAgICAgICB2YXIgZm9sZCA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkQXQocm93LCBjb2x1bW4sIDEpO1xuICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8oZm9sZC5lbmQucm93LCBmb2xkLmVuZC5jb2x1bW4pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZmlyc3Qgc2tpcCBzcGFjZVxuICAgICAgICBpZiAobWF0Y2ggPSB0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5leGVjKHJpZ2h0T2ZDdXJzb3IpKSB7XG4gICAgICAgICAgICBjb2x1bW4gKz0gdGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4O1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgICAgIHJpZ2h0T2ZDdXJzb3IgPSBsaW5lLnN1YnN0cmluZyhjb2x1bW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgYXQgbGluZSBlbmQgcHJvY2VlZCB3aXRoIG5leHQgbGluZVxuICAgICAgICBpZiAoY29sdW1uID49IGxpbmUubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGxpbmUubGVuZ3RoKTtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclJpZ2h0KCk7XG4gICAgICAgICAgICBpZiAocm93IDwgdGhpcy5kb2MuZ2V0TGVuZ3RoKCkgLSAxKVxuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvcldvcmRSaWdodCgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gYWR2YW5jZSB0byB0aGUgZW5kIG9mIHRoZSBuZXh0IHRva2VuXG4gICAgICAgIGlmIChtYXRjaCA9IHRoaXMuc2Vzc2lvbi50b2tlblJlLmV4ZWMocmlnaHRPZkN1cnNvcikpIHtcbiAgICAgICAgICAgIGNvbHVtbiArPSB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXg7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHdvcmQgb24gdGhlIGxlZnQuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckxvbmdXb3JkTGVmdCgpIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMubGVhZC5yb3c7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLmxlYWQuY29sdW1uO1xuXG4gICAgICAgIC8vIHNraXAgZm9sZHNcbiAgICAgICAgdmFyIGZvbGQ7XG4gICAgICAgIGlmIChmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChyb3csIGNvbHVtbiwgLTEpKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhmb2xkLnN0YXJ0LnJvdywgZm9sZC5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSG93IGRvZXMgdGhpcyBnZXQgZnJvbSB0aGUgZm9sZGluZyBhZGFwdGVyIG9udG8gdGhlIHNlc3Npb24/XG4gICAgICAgIHZhciBzdHIgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZFN0cmluZ0F0KHJvdywgY29sdW1uLCAtMSk7XG4gICAgICAgIGlmIChzdHIgPT0gbnVsbCkge1xuICAgICAgICAgICAgc3RyID0gdGhpcy5kb2MuZ2V0TGluZShyb3cpLnN1YnN0cmluZygwLCBjb2x1bW4pXG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGVmdE9mQ3Vyc29yID0gc3RyaW5nUmV2ZXJzZShzdHIpO1xuICAgICAgICB2YXIgbWF0Y2g7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi50b2tlblJlLmxhc3RJbmRleCA9IDA7XG5cbiAgICAgICAgLy8gc2tpcCB3aGl0ZXNwYWNlXG4gICAgICAgIGlmIChtYXRjaCA9IHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmV4ZWMobGVmdE9mQ3Vyc29yKSkge1xuICAgICAgICAgICAgY29sdW1uIC09IHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmxhc3RJbmRleDtcbiAgICAgICAgICAgIGxlZnRPZkN1cnNvciA9IGxlZnRPZkN1cnNvci5zbGljZSh0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5sYXN0SW5kZXgpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGlmIGF0IGJlZ2luIG9mIHRoZSBsaW5lIHByb2NlZWQgaW4gbGluZSBhYm92ZVxuICAgICAgICBpZiAoY29sdW1uIDw9IDApIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgMCk7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JMZWZ0KCk7XG4gICAgICAgICAgICBpZiAocm93ID4gMClcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JXb3JkTGVmdCgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gbW92ZSB0byB0aGUgYmVnaW4gb2YgdGhlIHdvcmRcbiAgICAgICAgaWYgKG1hdGNoID0gdGhpcy5zZXNzaW9uLnRva2VuUmUuZXhlYyhsZWZ0T2ZDdXJzb3IpKSB7XG4gICAgICAgICAgICBjb2x1bW4gLT0gdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4O1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgY29sdW1uKTtcbiAgICB9XG5cbiAgICAkc2hvcnRXb3JkRW5kSW5kZXgocmlnaHRPZkN1cnNvcikge1xuICAgICAgICB2YXIgbWF0Y2gsIGluZGV4ID0gMCwgY2g7XG4gICAgICAgIHZhciB3aGl0ZXNwYWNlUmUgPSAvXFxzLztcbiAgICAgICAgdmFyIHRva2VuUmUgPSB0aGlzLnNlc3Npb24udG9rZW5SZTtcblxuICAgICAgICB0b2tlblJlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgIGlmIChtYXRjaCA9IHRoaXMuc2Vzc2lvbi50b2tlblJlLmV4ZWMocmlnaHRPZkN1cnNvcikpIHtcbiAgICAgICAgICAgIGluZGV4ID0gdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgd2hpbGUgKChjaCA9IHJpZ2h0T2ZDdXJzb3JbaW5kZXhdKSAmJiB3aGl0ZXNwYWNlUmUudGVzdChjaCkpXG4gICAgICAgICAgICAgICAgaW5kZXgrKztcblxuICAgICAgICAgICAgaWYgKGluZGV4IDwgMSkge1xuICAgICAgICAgICAgICAgIHRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICB3aGlsZSAoKGNoID0gcmlnaHRPZkN1cnNvcltpbmRleF0pICYmICF0b2tlblJlLnRlc3QoY2gpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXgrKztcbiAgICAgICAgICAgICAgICAgICAgaWYgKHdoaXRlc3BhY2VSZS50ZXN0KGNoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4ID4gMikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluZGV4LS1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2hpbGUgKChjaCA9IHJpZ2h0T2ZDdXJzb3JbaW5kZXhdKSAmJiB3aGl0ZXNwYWNlUmUudGVzdChjaCkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluZGV4Kys7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4ID4gMilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0b2tlblJlLmxhc3RJbmRleCA9IDA7XG5cbiAgICAgICAgcmV0dXJuIGluZGV4O1xuICAgIH1cblxuICAgIG1vdmVDdXJzb3JTaG9ydFdvcmRSaWdodCgpIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMubGVhZC5yb3c7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLmxlYWQuY29sdW1uO1xuICAgICAgICB2YXIgbGluZSA9IHRoaXMuZG9jLmdldExpbmUocm93KTtcbiAgICAgICAgdmFyIHJpZ2h0T2ZDdXJzb3IgPSBsaW5lLnN1YnN0cmluZyhjb2x1bW4pO1xuXG4gICAgICAgIHZhciBmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChyb3csIGNvbHVtbiwgMSk7XG4gICAgICAgIGlmIChmb2xkKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMubW92ZUN1cnNvclRvKGZvbGQuZW5kLnJvdywgZm9sZC5lbmQuY29sdW1uKTtcblxuICAgICAgICBpZiAoY29sdW1uID09IGxpbmUubGVuZ3RoKSB7XG4gICAgICAgICAgICB2YXIgbCA9IHRoaXMuZG9jLmdldExlbmd0aCgpO1xuICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgIHJvdysrO1xuICAgICAgICAgICAgICAgIHJpZ2h0T2ZDdXJzb3IgPSB0aGlzLmRvYy5nZXRMaW5lKHJvdylcbiAgICAgICAgICAgIH0gd2hpbGUgKHJvdyA8IGwgJiYgL15cXHMqJC8udGVzdChyaWdodE9mQ3Vyc29yKSlcblxuICAgICAgICAgICAgaWYgKCEvXlxccysvLnRlc3QocmlnaHRPZkN1cnNvcikpXG4gICAgICAgICAgICAgICAgcmlnaHRPZkN1cnNvciA9IFwiXCJcbiAgICAgICAgICAgIGNvbHVtbiA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaW5kZXggPSB0aGlzLiRzaG9ydFdvcmRFbmRJbmRleChyaWdodE9mQ3Vyc29yKTtcblxuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbiArIGluZGV4KTtcbiAgICB9XG5cbiAgICBtb3ZlQ3Vyc29yU2hvcnRXb3JkTGVmdCgpIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMubGVhZC5yb3c7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLmxlYWQuY29sdW1uO1xuXG4gICAgICAgIHZhciBmb2xkO1xuICAgICAgICBpZiAoZm9sZCA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkQXQocm93LCBjb2x1bW4sIC0xKSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm1vdmVDdXJzb3JUbyhmb2xkLnN0YXJ0LnJvdywgZm9sZC5zdGFydC5jb2x1bW4pO1xuXG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5zZXNzaW9uLmdldExpbmUocm93KS5zdWJzdHJpbmcoMCwgY29sdW1uKTtcbiAgICAgICAgaWYgKGNvbHVtbiA9PSAwKSB7XG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgcm93LS07XG4gICAgICAgICAgICAgICAgbGluZSA9IHRoaXMuZG9jLmdldExpbmUocm93KTtcbiAgICAgICAgICAgIH0gd2hpbGUgKHJvdyA+IDAgJiYgL15cXHMqJC8udGVzdChsaW5lKSlcblxuICAgICAgICAgICAgY29sdW1uID0gbGluZS5sZW5ndGg7XG4gICAgICAgICAgICBpZiAoIS9cXHMrJC8udGVzdChsaW5lKSlcbiAgICAgICAgICAgICAgICBsaW5lID0gXCJcIlxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxlZnRPZkN1cnNvciA9IHN0cmluZ1JldmVyc2UobGluZSk7XG4gICAgICAgIHZhciBpbmRleCA9IHRoaXMuJHNob3J0V29yZEVuZEluZGV4KGxlZnRPZkN1cnNvcik7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMubW92ZUN1cnNvclRvKHJvdywgY29sdW1uIC0gaW5kZXgpO1xuICAgIH1cblxuICAgIG1vdmVDdXJzb3JXb3JkUmlnaHQoKSB7XG4gICAgICAgIC8vIFNlZSBrZXlib2FyZC9lbWFjcy5qc1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uWyckc2VsZWN0TG9uZ1dvcmRzJ10pIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckxvbmdXb3JkUmlnaHQoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclNob3J0V29yZFJpZ2h0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBtb3ZlQ3Vyc29yV29yZExlZnQoKSB7XG4gICAgICAgIC8vIFNlZSBrZXlib2FyZC9lbWFjcy5qc1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uWyckc2VsZWN0TG9uZ1dvcmRzJ10pIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckxvbmdXb3JkTGVmdCgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yU2hvcnRXb3JkTGVmdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHBvc2l0aW9uIGluZGljYXRlZCBieSB0aGUgcGFyYW1ldGVycy4gTmVnYXRpdmUgbnVtYmVycyBtb3ZlIHRoZSBjdXJzb3IgYmFja3dhcmRzIGluIHRoZSBkb2N1bWVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3dzIFRoZSBudW1iZXIgb2Ygcm93cyB0byBtb3ZlIGJ5XG4gICAgKiBAcGFyYW0ge051bWJlcn0gY2hhcnMgVGhlIG51bWJlciBvZiBjaGFyYWN0ZXJzIHRvIG1vdmUgYnlcbiAgICAqXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckJ5KHJvd3MsIGNoYXJzKSB7XG4gICAgICAgIHZhciBzY3JlZW5Qb3MgPSB0aGlzLnNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKFxuICAgICAgICAgICAgdGhpcy5sZWFkLnJvdyxcbiAgICAgICAgICAgIHRoaXMubGVhZC5jb2x1bW5cbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoY2hhcnMgPT09IDApIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiRkZXNpcmVkQ29sdW1uKVxuICAgICAgICAgICAgICAgIHNjcmVlblBvcy5jb2x1bW4gPSB0aGlzLiRkZXNpcmVkQ29sdW1uO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuJGRlc2lyZWRDb2x1bW4gPSBzY3JlZW5Qb3MuY29sdW1uO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGRvY1BvcyA9IHRoaXMuc2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUG9zLnJvdyArIHJvd3MsIHNjcmVlblBvcy5jb2x1bW4pO1xuXG4gICAgICAgIGlmIChyb3dzICE9PSAwICYmIGNoYXJzID09PSAwICYmIGRvY1Bvcy5yb3cgPT09IHRoaXMubGVhZC5yb3cgJiYgZG9jUG9zLmNvbHVtbiA9PT0gdGhpcy5sZWFkLmNvbHVtbikge1xuICAgICAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi5saW5lV2lkZ2V0cyAmJiB0aGlzLnNlc3Npb24ubGluZVdpZGdldHNbZG9jUG9zLnJvd10pXG4gICAgICAgICAgICAgICAgZG9jUG9zLnJvdysrO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gbW92ZSB0aGUgY3Vyc29yIGFuZCB1cGRhdGUgdGhlIGRlc2lyZWQgY29sdW1uXG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGRvY1Bvcy5yb3csIGRvY1Bvcy5jb2x1bW4gKyBjaGFycywgY2hhcnMgPT09IDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIHBvc2l0aW9uIGluZGljYXRlZCBieSBpdHMgYHJvd2AgYW5kIGBjb2x1bW5gLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBtb3ZlQ3Vyc29yVG9Qb3NpdGlvblxuICAgICAqIEBwYXJhbSBwb3NpdGlvbiB7UG9zaXRpb259IFRoZSBwb3NpdGlvbiB0byBtb3ZlIHRvLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgbW92ZUN1cnNvclRvUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uKTogdm9pZCB7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHBvc2l0aW9uLnJvdywgcG9zaXRpb24uY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSByb3cgYW5kIGNvbHVtbiBwcm92aWRlZC5cbiAgICAgKiBbSWYgYHByZXZlbnRVcGRhdGVEZXNpcmVkQ29sdW1uYCBpcyBgdHJ1ZWAsIHRoZW4gdGhlIGN1cnNvciBzdGF5cyBpbiB0aGUgc2FtZSBjb2x1bW4gcG9zaXRpb24gYXMgaXRzIG9yaWdpbmFsIHBvaW50Ll17OiAjcHJldmVudFVwZGF0ZUJvb2xEZXNjfVxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3cgVGhlIHJvdyB0byBtb3ZlIHRvXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIHRvIG1vdmUgdG9cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGtlZXBEZXNpcmVkQ29sdW1uIFtJZiBgdHJ1ZWAsIHRoZSBjdXJzb3IgbW92ZSBkb2VzIG5vdCByZXNwZWN0IHRoZSBwcmV2aW91cyBjb2x1bW5dezogI3ByZXZlbnRVcGRhdGVCb29sfVxuICAgICAqL1xuICAgIG1vdmVDdXJzb3JUbyhyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGtlZXBEZXNpcmVkQ29sdW1uPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICAvLyBFbnN1cmUgdGhlIHJvdy9jb2x1bW4gaXMgbm90IGluc2lkZSBvZiBhIGZvbGQuXG4gICAgICAgIHZhciBmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChyb3csIGNvbHVtbiwgMSk7XG4gICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICByb3cgPSBmb2xkLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIGNvbHVtbiA9IGZvbGQuc3RhcnQuY29sdW1uO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4ka2VlcERlc2lyZWRDb2x1bW5PbkNoYW5nZSA9IHRydWU7XG4gICAgICAgIHRoaXMubGVhZC5zZXRQb3NpdGlvbihyb3csIGNvbHVtbik7XG4gICAgICAgIHRoaXMuJGtlZXBEZXNpcmVkQ29sdW1uT25DaGFuZ2UgPSBmYWxzZTtcblxuICAgICAgICBpZiAoIWtlZXBEZXNpcmVkQ29sdW1uKVxuICAgICAgICAgICAgdGhpcy4kZGVzaXJlZENvbHVtbiA9IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzY3JlZW4gcG9zaXRpb24gaW5kaWNhdGVkIGJ5IHJvdyBhbmQgY29sdW1uLiB7OnByZXZlbnRVcGRhdGVCb29sRGVzY31cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBtb3ZlIHRvXG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gdG8gbW92ZSB0b1xuICAgICogQHBhcmFtIHtCb29sZWFufSBrZWVwRGVzaXJlZENvbHVtbiB7OnByZXZlbnRVcGRhdGVCb29sfVxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgbW92ZUN1cnNvclRvU2NyZWVuKHJvdywgY29sdW1uLCBrZWVwRGVzaXJlZENvbHVtbikge1xuICAgICAgICB2YXIgcG9zID0gdGhpcy5zZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihyb3csIGNvbHVtbik7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHBvcy5yb3csIHBvcy5jb2x1bW4sIGtlZXBEZXNpcmVkQ29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIG9uXG4gICAgICogQHBhcmFtIGV2ZW50TmFtZSB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSBjYWxsYmFjayB7KGV2ZW50LCBzb3VyY2U6IFNlbGVjdGlvbikgPT4gYW55fVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb24oZXZlbnROYW1lOiBzdHJpbmcsIGNhbGxiYWNrOiAoZXZlbnQ6IGFueSwgc291cmNlOiBTZWxlY3Rpb24pID0+IGFueSk6IHZvaWQge1xuICAgICAgICB0aGlzLmV2ZW50QnVzLm9uKGV2ZW50TmFtZSwgY2FsbGJhY2ssIGZhbHNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIG9mZlxuICAgICAqIEBwYXJhbSBldmVudE5hbWUge3N0cmluZ31cbiAgICAgKiBAcGFyYW0gY2FsbGJhY2sgeyhldmVudCwgc291cmNlOiBTZWxlY3Rpb24pID0+IGFueX1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIG9mZihldmVudE5hbWU6IHN0cmluZywgY2FsbGJhY2s6IChldmVudDogYW55LCBzb3VyY2U6IFNlbGVjdGlvbikgPT4gYW55KTogdm9pZCB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMub2ZmKGV2ZW50TmFtZSwgY2FsbGJhY2spO1xuICAgIH1cblxuICAgIC8vIHJlbW92ZSBsaXN0ZW5lcnMgZnJvbSBkb2N1bWVudFxuICAgIGRldGFjaCgpIHtcbiAgICAgICAgdGhpcy5sZWFkLmRldGFjaCgpO1xuICAgICAgICB0aGlzLmFuY2hvci5kZXRhY2goKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uID0gdGhpcy5kb2MgPSBudWxsO1xuICAgIH1cblxuICAgIGZyb21PcmllbnRlZFJhbmdlKHJhbmdlOiBPcmllbnRlZFJhbmdlKSB7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2UsIHJhbmdlLmN1cnNvciA9PSByYW5nZS5zdGFydCk7XG4gICAgICAgIHRoaXMuJGRlc2lyZWRDb2x1bW4gPSByYW5nZS5kZXNpcmVkQ29sdW1uIHx8IHRoaXMuJGRlc2lyZWRDb2x1bW47XG4gICAgfVxuXG4gICAgdG9PcmllbnRlZFJhbmdlKHJhbmdlPykge1xuICAgICAgICB2YXIgciA9IHRoaXMuZ2V0UmFuZ2UoKTtcbiAgICAgICAgaWYgKHJhbmdlKSB7XG4gICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4gPSByLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LnJvdyA9IHIuc3RhcnQucm93O1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IHIuZW5kLmNvbHVtbjtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5yb3cgPSByLmVuZC5yb3c7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByYW5nZSA9IHI7XG4gICAgICAgIH1cblxuICAgICAgICByYW5nZS5jdXJzb3IgPSB0aGlzLmlzQmFja3dhcmRzKCkgPyByYW5nZS5zdGFydCA6IHJhbmdlLmVuZDtcbiAgICAgICAgcmFuZ2UuZGVzaXJlZENvbHVtbiA9IHRoaXMuJGRlc2lyZWRDb2x1bW47XG4gICAgICAgIHJldHVybiByYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNhdmVzIHRoZSBjdXJyZW50IGN1cnNvciBwb3NpdGlvbiBhbmQgY2FsbHMgYGZ1bmNgIHRoYXQgY2FuIGNoYW5nZSB0aGUgY3Vyc29yXG4gICAgKiBwb3N0aW9uLiBUaGUgcmVzdWx0IGlzIHRoZSByYW5nZSBvZiB0aGUgc3RhcnRpbmcgYW5kIGV2ZW50dWFsIGN1cnNvciBwb3NpdGlvbi5cbiAgICAqIFdpbGwgcmVzZXQgdGhlIGN1cnNvciBwb3NpdGlvbi5cbiAgICAqIEBwYXJhbSB7RnVuY3Rpb259IFRoZSBjYWxsYmFjayB0aGF0IHNob3VsZCBjaGFuZ2UgdGhlIGN1cnNvciBwb3NpdGlvblxuICAgICogQHJldHVybiB7UmFuZ2V9XG4gICAgKlxuICAgICoqL1xuICAgIGdldFJhbmdlT2ZNb3ZlbWVudHMoZnVuYykge1xuICAgICAgICB2YXIgc3RhcnQgPSB0aGlzLmdldEN1cnNvcigpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZnVuYy5jYWxsKG51bGwsIHRoaXMpO1xuICAgICAgICAgICAgdmFyIGVuZCA9IHRoaXMuZ2V0Q3Vyc29yKCk7XG4gICAgICAgICAgICByZXR1cm4gUmFuZ2UuZnJvbVBvaW50cyhzdGFydCwgZW5kKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmV0dXJuIFJhbmdlLmZyb21Qb2ludHMoc3RhcnQsIHN0YXJ0KTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oc3RhcnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdG9KU09OKCkge1xuICAgICAgICBpZiAodGhpcy5yYW5nZUNvdW50KSB7XG4gICAgICAgICAgICB2YXIgZGF0YTogYW55ID0gdGhpcy5yYW5nZXMubWFwKGZ1bmN0aW9uKHIpIHtcbiAgICAgICAgICAgICAgICB2YXIgcjEgPSByLmNsb25lKCk7XG4gICAgICAgICAgICAgICAgcjEuaXNCYWNrd2FyZHMgPSByLmN1cnNvciA9PSByLnN0YXJ0O1xuICAgICAgICAgICAgICAgIHJldHVybiByMTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIGRhdGE6IGFueSA9IHRoaXMuZ2V0UmFuZ2UoKTtcbiAgICAgICAgICAgIGRhdGEuaXNCYWNrd2FyZHMgPSB0aGlzLmlzQmFja3dhcmRzKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRhdGE7XG4gICAgfVxuXG4gICAgcHVibGljIHRvU2luZ2xlUmFuZ2UoZGF0YTogUmFuZ2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiU2VsZWN0aW9uLnRvU2luZ2xlUmFuZ2UgaXMgdW5zdXBwb3J0ZWRcIik7XG4gICAgfVxuXG4gICAgcHVibGljIGFkZFJhbmdlKGRhdGE6IFJhbmdlLCBzb21ldGhpbmc/OiBib29sZWFuKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlNlbGVjdGlvbi5hZGRSYW5nZSBpcyB1bnN1cHBvcnRlZFwiKTtcbiAgICB9XG5cbiAgICBmcm9tSlNPTihkYXRhLyo6IHtzdGFydDtsZW5ndGg7aXNCYWNrYXJkc30qLykge1xuICAgICAgICBpZiAoZGF0YS5zdGFydCA9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnJhbmdlTGlzdCkge1xuICAgICAgICAgICAgICAgIHRoaXMudG9TaW5nbGVSYW5nZShkYXRhWzBdKTtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gZGF0YS5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHI6IGFueSA9IFJhbmdlLmZyb21Qb2ludHMoZGF0YVtpXS5zdGFydCwgZGF0YVtpXS5lbmQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZGF0YS5pc0JhY2t3YXJkcylcbiAgICAgICAgICAgICAgICAgICAgICAgIHIuY3Vyc29yID0gci5zdGFydDtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hZGRSYW5nZShyLCB0cnVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgZGF0YSA9IGRhdGFbMF07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMucmFuZ2VMaXN0KVxuICAgICAgICAgICAgdGhpcy50b1NpbmdsZVJhbmdlKGRhdGEpO1xuICAgICAgICB0aGlzLnNldFNlbGVjdGlvblJhbmdlKGRhdGEsIGRhdGEuaXNCYWNrd2FyZHMpO1xuICAgIH1cblxuICAgIGlzRXF1YWwoZGF0YSkge1xuICAgICAgICBpZiAoKGRhdGEubGVuZ3RoIHx8IHRoaXMucmFuZ2VDb3VudCkgJiYgZGF0YS5sZW5ndGggIT09IHRoaXMucmFuZ2VDb3VudClcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKCFkYXRhLmxlbmd0aCB8fCAhdGhpcy5yYW5nZXMpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRSYW5nZSgpLmlzRXF1YWwoZGF0YSk7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IHRoaXMucmFuZ2VzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgaWYgKCF0aGlzLnJhbmdlc1tpXS5pc0VxdWFsKGRhdGFbaV0pKVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbn1cbiJdfQ==