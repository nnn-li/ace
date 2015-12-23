"use strict";
import { stringReverse } from "./lib/lang";
import EventEmitterClass from "./lib/EventEmitterClass";
import Range from "./Range";
export default class Selection {
    constructor(session) {
        this.eventBus = new EventEmitterClass(this);
        this.session = session;
        this.doc = session.getDocument();
        this.clearSelection();
        this.lead = this.selectionLead = this.doc.createAnchor(0, 0);
        this.anchor = this.selectionAnchor = this.doc.createAnchor(0, 0);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VsZWN0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiU2VsZWN0aW9uLnRzIl0sIm5hbWVzIjpbIlNlbGVjdGlvbiIsIlNlbGVjdGlvbi5jb25zdHJ1Y3RvciIsIlNlbGVjdGlvbi5pc0VtcHR5IiwiU2VsZWN0aW9uLmlzTXVsdGlMaW5lIiwiU2VsZWN0aW9uLmdldEN1cnNvciIsIlNlbGVjdGlvbi5zZXRTZWxlY3Rpb25BbmNob3IiLCJTZWxlY3Rpb24uZ2V0U2VsZWN0aW9uQW5jaG9yIiwiU2VsZWN0aW9uLmdldFNlbGVjdGlvbkxlYWQiLCJTZWxlY3Rpb24uc2hpZnRTZWxlY3Rpb24iLCJTZWxlY3Rpb24uaXNCYWNrd2FyZHMiLCJTZWxlY3Rpb24uZ2V0UmFuZ2UiLCJTZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb24iLCJTZWxlY3Rpb24uc2VsZWN0QWxsIiwiU2VsZWN0aW9uLnNldFJhbmdlIiwiU2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlIiwiU2VsZWN0aW9uLiRtb3ZlU2VsZWN0aW9uIiwiU2VsZWN0aW9uLnNlbGVjdFRvIiwiU2VsZWN0aW9uLnNlbGVjdFRvUG9zaXRpb24iLCJTZWxlY3Rpb24ubW92ZVRvIiwiU2VsZWN0aW9uLm1vdmVUb1Bvc2l0aW9uIiwiU2VsZWN0aW9uLnNlbGVjdFVwIiwiU2VsZWN0aW9uLnNlbGVjdERvd24iLCJTZWxlY3Rpb24uc2VsZWN0UmlnaHQiLCJTZWxlY3Rpb24uc2VsZWN0TGVmdCIsIlNlbGVjdGlvbi5zZWxlY3RMaW5lU3RhcnQiLCJTZWxlY3Rpb24uc2VsZWN0TGluZUVuZCIsIlNlbGVjdGlvbi5zZWxlY3RGaWxlRW5kIiwiU2VsZWN0aW9uLnNlbGVjdEZpbGVTdGFydCIsIlNlbGVjdGlvbi5zZWxlY3RXb3JkUmlnaHQiLCJTZWxlY3Rpb24uc2VsZWN0V29yZExlZnQiLCJTZWxlY3Rpb24uZ2V0V29yZFJhbmdlIiwiU2VsZWN0aW9uLnNlbGVjdFdvcmQiLCJTZWxlY3Rpb24uc2VsZWN0QVdvcmQiLCJTZWxlY3Rpb24uZ2V0TGluZVJhbmdlIiwiU2VsZWN0aW9uLnNlbGVjdExpbmUiLCJTZWxlY3Rpb24ubW92ZUN1cnNvclVwIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JEb3duIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JMZWZ0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JSaWdodCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGluZVN0YXJ0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JMaW5lRW5kIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JGaWxlRW5kIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JGaWxlU3RhcnQiLCJTZWxlY3Rpb24ubW92ZUN1cnNvckxvbmdXb3JkUmlnaHQiLCJTZWxlY3Rpb24ubW92ZUN1cnNvckxvbmdXb3JkTGVmdCIsIlNlbGVjdGlvbi4kc2hvcnRXb3JkRW5kSW5kZXgiLCJTZWxlY3Rpb24ubW92ZUN1cnNvclNob3J0V29yZFJpZ2h0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JTaG9ydFdvcmRMZWZ0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JXb3JkUmlnaHQiLCJTZWxlY3Rpb24ubW92ZUN1cnNvcldvcmRMZWZ0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JCeSIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbiIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yVG8iLCJTZWxlY3Rpb24ubW92ZUN1cnNvclRvU2NyZWVuIiwiU2VsZWN0aW9uLm9uIiwiU2VsZWN0aW9uLm9mZiIsIlNlbGVjdGlvbi5kZXRhY2giLCJTZWxlY3Rpb24uZnJvbU9yaWVudGVkUmFuZ2UiLCJTZWxlY3Rpb24udG9PcmllbnRlZFJhbmdlIiwiU2VsZWN0aW9uLmdldFJhbmdlT2ZNb3ZlbWVudHMiLCJTZWxlY3Rpb24udG9KU09OIiwiU2VsZWN0aW9uLnRvU2luZ2xlUmFuZ2UiLCJTZWxlY3Rpb24uYWRkUmFuZ2UiLCJTZWxlY3Rpb24uZnJvbUpTT04iLCJTZWxlY3Rpb24uaXNFcXVhbCJdLCJtYXBwaW5ncyI6IkFBb0RBLFlB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SUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDdEJBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxNQUFNQSxDQUFDQSxJQUFJQSxLQUFLQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxFQUFFQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUMvRUEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsTUFBTUEsQ0FBQ0EsSUFBSUEsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsRUFBRUEsTUFBTUEsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDakRBLENBQUNBO0lBQ0xBLENBQUNBO0lBS0RqQyxVQUFVQTtRQUNOa0MsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUNoREEsQ0FBQ0E7SUFNRGxDLFlBQVlBO1FBQ1JtQyxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUM3QkEsQ0FBQ0E7SUFNRG5DLGNBQWNBO1FBQ1ZvQyxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUM1QkEsQ0FBQ0E7SUFNRHBDLGNBQWNBO1FBQ1ZxQyxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxFQUFFQSxFQUNoQ0EsSUFBSUEsQ0FBQ0E7UUFFVEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDL0RBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ3pEQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUU3QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUMvRUEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7WUFDeENBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLE9BQU9BLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLElBQUlBLE9BQU9BLENBQUNBO2dCQUM5SUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLElBQUlBO2dCQUNBQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNqQ0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFNRHJDLGVBQWVBO1FBQ1hzQyxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQTtRQUNsQ0EsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDMURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ1BBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ3JEQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzNDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFH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QSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUM5QkEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDakNBLElBQUlBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRTNDQSxJQUFJQSxLQUFLQSxDQUFDQTtRQUNWQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN0Q0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFHbkNBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ2xEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNQQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNqREEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFHREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdERBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLFNBQVNBLENBQUNBO1lBQzVDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN0Q0EsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDM0NBLENBQUNBO1FBR0RBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ3hCQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNwQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7WUFDdkJBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO2dCQUMvQkEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxFQUFFQSxDQUFDQTtZQUMvQkEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFHREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkRBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBO1lBQ3pDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN2Q0EsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7SUFDbkNBLENBQUNBO0lBTUQzQyxzQkFBc0JBO1FBQ2xCNEMsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDeEJBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBO1FBRzlCQSxJQUFJQSxJQUFJQSxDQUFDQTtRQUNUQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqREEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDckRBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBR0RBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGVBQWVBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3hEQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNkQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFBQTtRQUNwREEsQ0FBQ0E7UUFFREEsSUFBSUEsWUFBWUEsR0FBR0EsYUFBYUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdENBLElBQUlBLEtBQUtBLENBQUNBO1FBQ1ZBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3RDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUduQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckRBLE1B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TUFBTUEsQ0FBQ0E7UUFFOUJBLElBQUlBLElBQUlBLENBQUNBO1FBQ1RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQy9DQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUVoRUEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDMURBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2RBLEdBQUdBLENBQUNBO2dCQUNBQSxHQUFHQSxFQUFFQSxDQUFDQTtnQkFDTkEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDakNBLENBQUNBLFFBQVFBLEdBQUdBLEdBQUdBLENBQUNBLElBQUlBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEVBQUNBO1lBRXZDQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNyQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ25CQSxJQUFJQSxHQUFHQSxFQUFFQSxDQUFBQTtRQUNqQkEsQ0FBQ0E7UUFFREEsSUFBSUEsWUFBWUEsR0FBR0EsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDdkNBLElBQUlBLEtBQUtBLEdBQUdB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QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDNUJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBO29CQUM3QkEsSUFBSUEsQ0FBQ0EsR0FBUUEsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzFEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQTt3QkFDakJBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO29CQUN2QkEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzNCQSxDQUFDQTtnQkFDREEsTUFBTUEsQ0FBQ0E7WUFDWEEsQ0FBQ0E7WUFBQ0EsSUFBSUE7Z0JBQ0ZBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3ZCQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUNmQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUM3QkEsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtJQUNuREEsQ0FBQ0E7SUFFRC9ELE9BQU9BLENBQUNBLElBQUlBO1FBQ1JnRSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxLQUFLQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtZQUNwRUEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDakJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBO1lBQzdCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUV6Q0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0E7WUFDcENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQUE7UUFDcEJBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtBQUNMaEUsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNC0yMDE2IERhdmlkIEdlbyBIb2xtZXMgPGRhdmlkLmdlby5ob2xtZXNAZ21haWwuY29tPlxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGxcbiAqIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuICogU09GVFdBUkUuXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cInVzZSBzdHJpY3RcIjtcblxuaW1wb3J0IERvY3VtZW50IGZyb20gXCIuL0RvY3VtZW50XCI7XG5pbXBvcnQge3N0cmluZ1JldmVyc2V9IGZyb20gXCIuL2xpYi9sYW5nXCI7XG5pbXBvcnQgRXZlbnRFbWl0dGVyQ2xhc3MgZnJvbSBcIi4vbGliL0V2ZW50RW1pdHRlckNsYXNzXCI7XG5pbXBvcnQgT3JpZW50ZWRSYW5nZSBmcm9tIFwiLi9PcmllbnRlZFJhbmdlXCI7XG5pbXBvcnQgUG9zaXRpb24gZnJvbSBcIi4vUG9zaXRpb25cIjtcbmltcG9ydCBSYW5nZSBmcm9tIFwiLi9SYW5nZVwiO1xuaW1wb3J0IHtSYW5nZUxpc3R9IGZyb20gXCIuL3JhbmdlX2xpc3RcIjtcbmltcG9ydCBFZGl0U2Vzc2lvbiBmcm9tIFwiLi9FZGl0U2Vzc2lvblwiO1xuaW1wb3J0IEFuY2hvciBmcm9tIFwiLi9BbmNob3JcIjtcbmltcG9ydCBFdmVudEJ1cyBmcm9tIFwiLi9FdmVudEJ1c1wiO1xuXG4vKipcbiAqIENvbnRhaW5zIHRoZSBjdXJzb3IgcG9zaXRpb24gYW5kIHRoZSB0ZXh0IHNlbGVjdGlvbiBvZiBhbiBlZGl0IHNlc3Npb24uXG4gKlxuICogVGhlIHJvdy9jb2x1bW5zIHVzZWQgaW4gdGhlIHNlbGVjdGlvbiBhcmUgaW4gZG9jdW1lbnQgY29vcmRpbmF0ZXMgcmVwcmVzZW50aW5nXG4gKiB0aGUgY29vcmRpbmF0ZXMgYXMgdGhleSBhcHBlYXIgaW4gdGhlIGRvY3VtZW50IGJlZm9yZSBhcHBseWluZyBzb2Z0IHdyYXAgYW5kIGZvbGRpbmcuXG4gKlxuICogQGNsYXNzIFNlbGVjdGlvblxuICovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTZWxlY3Rpb24gaW1wbGVtZW50cyBFdmVudEJ1czxTZWxlY3Rpb24+IHtcbiAgICBwcml2YXRlIHNlc3Npb246IEVkaXRTZXNzaW9uO1xuICAgIC8vIEZJWE1FOiBNYXliZSBTZWxlY3Rpb24gc2hvdWxkIG9ubHkgY291cGxlIHRvIHRoZSBFZGl0U2Vzc2lvbj9cbiAgICBwcml2YXRlIGRvYzogRG9jdW1lbnQ7XG4gICAgLy8gV2h5IGRvIHdlIHNlZW0gdG8gaGF2ZSBjb3BpZXM/XG4gICAgcHVibGljIGxlYWQ6IEFuY2hvcjtcbiAgICBwdWJsaWMgYW5jaG9yOiBBbmNob3I7XG4gICAgcHJpdmF0ZSBzZWxlY3Rpb25MZWFkOiBBbmNob3I7XG4gICAgcHJpdmF0ZSBzZWxlY3Rpb25BbmNob3I6IEFuY2hvcjtcbiAgICBwcml2YXRlICRpc0VtcHR5OiBib29sZWFuO1xuICAgIHByaXZhdGUgJGtlZXBEZXNpcmVkQ29sdW1uT25DaGFuZ2U6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkZGVzaXJlZENvbHVtbjsgIC8vIElzIHRoaXMgdXNlZCBhbnl3aGVyZT9cbiAgICBwdWJsaWMgcmFuZ2VDb3VudDogbnVtYmVyO1xuICAgIHB1YmxpYyByYW5nZXM7XG4gICAgcHVibGljIHJhbmdlTGlzdDogUmFuZ2VMaXN0O1xuICAgIHByaXZhdGUgZXZlbnRCdXM6IEV2ZW50RW1pdHRlckNsYXNzPFNlbGVjdGlvbj47XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbmV3IGBTZWxlY3Rpb25gIG9iamVjdC5cbiAgICAgKlxuICAgICAqIEBjbGFzcyBTZWxlY3Rpb25cbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKiBAcGFyYW0gc2Vzc2lvbiB7RWRpdFNlc3Npb259IFRoZSBzZXNzaW9uIHRvIHVzZS5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihzZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLmV2ZW50QnVzID0gbmV3IEV2ZW50RW1pdHRlckNsYXNzPFNlbGVjdGlvbj4odGhpcyk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbiA9IHNlc3Npb247XG4gICAgICAgIHRoaXMuZG9jID0gc2Vzc2lvbi5nZXREb2N1bWVudCgpO1xuXG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5sZWFkID0gdGhpcy5zZWxlY3Rpb25MZWFkID0gdGhpcy5kb2MuY3JlYXRlQW5jaG9yKDAsIDApO1xuICAgICAgICB0aGlzLmFuY2hvciA9IHRoaXMuc2VsZWN0aW9uQW5jaG9yID0gdGhpcy5kb2MuY3JlYXRlQW5jaG9yKDAsIDApO1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5sZWFkLm9uKFwiY2hhbmdlXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IGNoYW5nZUN1cnNvclxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBzZWxmLmV2ZW50QnVzLl9lbWl0KFwiY2hhbmdlQ3Vyc29yXCIpO1xuICAgICAgICAgICAgaWYgKCFzZWxmLiRpc0VtcHR5KSB7XG4gICAgICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgICAgICogQGV2ZW50IGNoYW5nZVNlbGVjdGlvblxuICAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIHNlbGYuZXZlbnRCdXMuX2VtaXQoXCJjaGFuZ2VTZWxlY3Rpb25cIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXNlbGYuJGtlZXBEZXNpcmVkQ29sdW1uT25DaGFuZ2UgJiYgZS5vbGQuY29sdW1uICE9IGUudmFsdWUuY29sdW1uKVxuICAgICAgICAgICAgICAgIHNlbGYuJGRlc2lyZWRDb2x1bW4gPSBudWxsO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnNlbGVjdGlvbkFuY2hvci5vbihcImNoYW5nZVwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmICghc2VsZi4kaXNFbXB0eSkge1xuICAgICAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICAgICAqIEBldmVudCBjaGFuZ2VTZWxlY3Rpb25cbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICBzZWxmLmV2ZW50QnVzLl9lbWl0KFwiY2hhbmdlU2VsZWN0aW9uXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgc2VsZWN0aW9uIGlzIGVtcHR5LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBpc0VtcHR5XG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuICAgICAgICAvLyBXaGF0IGlzIHRoZSBkaWZmZXJlbmNlIGJldHdlZW4gJGlzRW1wdHkgYW5kIHdoYXQgdGhpcyBmdW5jdGlvbiByZXR1cm5zP1xuICAgICAgICByZXR1cm4gKHRoaXMuJGlzRW1wdHkgfHwgKFxuICAgICAgICAgICAgdGhpcy5hbmNob3Iucm93ID09IHRoaXMubGVhZC5yb3cgJiZcbiAgICAgICAgICAgIHRoaXMuYW5jaG9yLmNvbHVtbiA9PSB0aGlzLmxlYWQuY29sdW1uXG4gICAgICAgICkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBzZWxlY3Rpb24gaXMgYSBtdWx0aS1saW5lLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBpc011bHRpTGluZVxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgaXNNdWx0aUxpbmUoKTogYm9vbGVhbiB7XG4gICAgICAgIGlmICh0aGlzLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0UmFuZ2UoKS5pc011bHRpTGluZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgcG9zaXRpb24gb2YgdGhlIGN1cnNvci5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0Q3Vyc29yXG4gICAgICogQHJldHVybiB7UG9zaXRpb259XG4gICAgICovXG4gICAgZ2V0Q3Vyc29yKCk6IFBvc2l0aW9uIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubGVhZC5nZXRQb3NpdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHJvdyBhbmQgY29sdW1uIHBvc2l0aW9uIG9mIHRoZSBhbmNob3IuXG4gICAgICogVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRzIHRoZSBgJ2NoYW5nZVNlbGVjdGlvbidgIGV2ZW50LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRTZWxlY3Rpb25BbmNob3JcbiAgICAgKiBAcGFyYW0gcm93IHtudW1iZXJ9IFRoZSBuZXcgcm93XG4gICAgICogQHBhcmFtIGNvbHVtbiB7bnVtYmVyfSBUaGUgbmV3IGNvbHVtblxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0U2VsZWN0aW9uQW5jaG9yKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmFuY2hvci5zZXRQb3NpdGlvbihyb3csIGNvbHVtbik7XG5cbiAgICAgICAgaWYgKHRoaXMuJGlzRW1wdHkpIHtcbiAgICAgICAgICAgIHRoaXMuJGlzRW1wdHkgPSBmYWxzZTtcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IGNoYW5nZVNlbGVjdGlvblxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB0aGlzLmV2ZW50QnVzLl9lbWl0KFwiY2hhbmdlU2VsZWN0aW9uXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgcG9zaXRpb24gb2YgdGhlIGNhbGxpbmcgc2VsZWN0aW9uIGFuY2hvci5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0U2VsZWN0aW9uQW5jaG9yXG4gICAgICogQHJldHVybiB7UG9zaXRpb259XG4gICAgICogQHJlbGF0ZWQgQW5jaG9yLmdldFBvc2l0aW9uXG4gICAgICovXG4gICAgZ2V0U2VsZWN0aW9uQW5jaG9yKCk6IFBvc2l0aW9uIHtcbiAgICAgICAgaWYgKHRoaXMuJGlzRW1wdHkpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldFNlbGVjdGlvbkxlYWQoKVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYW5jaG9yLmdldFBvc2l0aW9uKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBgcm93YCBhbmQgYGNvbHVtbmAgb2YgdGhlIGNhbGxpbmcgc2VsZWN0aW9uIGxlYWQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFNlbGVjdGlvbkxlYWRcbiAgICAgKiBAcmV0dXJuIHtQb3NpdGlvbn1cbiAgICAgKi9cbiAgICBnZXRTZWxlY3Rpb25MZWFkKCk6IFBvc2l0aW9uIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubGVhZC5nZXRQb3NpdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNoaWZ0cyB0aGUgc2VsZWN0aW9uIHVwIChvciBkb3duLCBpZiBbW1NlbGVjdGlvbi5pc0JhY2t3YXJkcyBgaXNCYWNrd2FyZHMoKWBdXSBpcyB0cnVlKSB0aGUgZ2l2ZW4gbnVtYmVyIG9mIGNvbHVtbnMuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNoaWZ0U2VsZWN0aW9uXG4gICAgICogQHBhcmFtIGNvbHVtbnMge251bWJlcn0gVGhlIG51bWJlciBvZiBjb2x1bW5zIHRvIHNoaWZ0IGJ5LlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2hpZnRTZWxlY3Rpb24oY29sdW1uczogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLiRpc0VtcHR5KSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyh0aGlzLmxlYWQucm93LCB0aGlzLmxlYWQuY29sdW1uICsgY29sdW1ucyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgYW5jaG9yID0gdGhpcy5nZXRTZWxlY3Rpb25BbmNob3IoKTtcbiAgICAgICAgdmFyIGxlYWQgPSB0aGlzLmdldFNlbGVjdGlvbkxlYWQoKTtcblxuICAgICAgICB2YXIgaXNCYWNrd2FyZHMgPSB0aGlzLmlzQmFja3dhcmRzKCk7XG5cbiAgICAgICAgaWYgKCFpc0JhY2t3YXJkcyB8fCBhbmNob3IuY29sdW1uICE9PSAwKVxuICAgICAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25BbmNob3IoYW5jaG9yLnJvdywgYW5jaG9yLmNvbHVtbiArIGNvbHVtbnMpO1xuXG4gICAgICAgIGlmIChpc0JhY2t3YXJkcyB8fCBsZWFkLmNvbHVtbiAhPT0gMCkge1xuICAgICAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhsZWFkLnJvdywgbGVhZC5jb2x1bW4gKyBjb2x1bW5zKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHNlbGVjdGlvbiBpcyBnb2luZyBiYWNrd2FyZHMgaW4gdGhlIGRvY3VtZW50LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBpc0JhY2t3YXJkc1xuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgaXNCYWNrd2FyZHMoKTogYm9vbGVhbiB7XG4gICAgICAgIHZhciBhbmNob3IgPSB0aGlzLmFuY2hvcjtcbiAgICAgICAgdmFyIGxlYWQgPSB0aGlzLmxlYWQ7XG4gICAgICAgIHJldHVybiAoYW5jaG9yLnJvdyA+IGxlYWQucm93IHx8IChhbmNob3Iucm93ID09IGxlYWQucm93ICYmIGFuY2hvci5jb2x1bW4gPiBsZWFkLmNvbHVtbikpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFtSZXR1cm5zIHRoZSBbW1JhbmdlXV0gZm9yIHRoZSBzZWxlY3RlZCB0ZXh0Ll17OiAjU2VsZWN0aW9uLmdldFJhbmdlfVxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRSYW5nZVxuICAgICAqIEByZXR1cm4ge1JhbmdlfVxuICAgICAqL1xuICAgIGdldFJhbmdlKCkge1xuICAgICAgICB2YXIgYW5jaG9yID0gdGhpcy5hbmNob3I7XG4gICAgICAgIHZhciBsZWFkID0gdGhpcy5sZWFkO1xuXG4gICAgICAgIGlmICh0aGlzLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHJldHVybiBSYW5nZS5mcm9tUG9pbnRzKGxlYWQsIGxlYWQpO1xuXG4gICAgICAgIGlmICh0aGlzLmlzQmFja3dhcmRzKCkpIHtcbiAgICAgICAgICAgIHJldHVybiBSYW5nZS5mcm9tUG9pbnRzKGxlYWQsIGFuY2hvcik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gUmFuZ2UuZnJvbVBvaW50cyhhbmNob3IsIGxlYWQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1wdGllcyB0aGUgc2VsZWN0aW9uIChieSBkZS1zZWxlY3RpbmcgaXQpLlxuICAgICAqIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VTZWxlY3Rpb24nYCBldmVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgY2xlYXJTZWxlY3Rpb25cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGNsZWFyU2VsZWN0aW9uKCk6IHZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuJGlzRW1wdHkpIHtcbiAgICAgICAgICAgIHRoaXMuJGlzRW1wdHkgPSB0cnVlO1xuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBAZXZlbnQgY2hhbmdlU2VsZWN0aW9uXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMuZXZlbnRCdXMuX2VtaXQoXCJjaGFuZ2VTZWxlY3Rpb25cIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZWxlY3RzIGFsbCB0aGUgdGV4dCBpbiB0aGUgZG9jdW1lbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNlbGVjdEFsbFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2VsZWN0QWxsKCk6IHZvaWQge1xuICAgICAgICB2YXIgbGFzdFJvdyA9IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMTtcbiAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25BbmNob3IoMCwgMCk7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGxhc3RSb3csIHRoaXMuZG9jLmdldExpbmUobGFzdFJvdykubGVuZ3RoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIHByb3ZpZGVkIHJhbmdlLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRSYW5nZVxuICAgICAqIEBwYXJhbSB7UmFuZ2V9IHJhbmdlIFRoZSByYW5nZSBvZiB0ZXh0IHRvIHNlbGVjdFxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gcmV2ZXJzZSBJbmRpY2F0ZXMgaWYgdGhlIHJhbmdlIHNob3VsZCBnbyBiYWNrd2FyZHMgKGB0cnVlYCkgb3Igbm90XG4gICAgICovXG4gICAgcHVibGljIHNldFJhbmdlKHJhbmdlOiBSYW5nZSwgcmV2ZXJzZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSwgcmV2ZXJzZSk7XG4gICAgfVxuXG4gICAgcHVibGljIHNldFNlbGVjdGlvblJhbmdlKHJhbmdlOiBSYW5nZSwgcmV2ZXJzZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgaWYgKHJldmVyc2UpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uQW5jaG9yKHJhbmdlLmVuZC5yb3csIHJhbmdlLmVuZC5jb2x1bW4pO1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RUbyhyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnNldFNlbGVjdGlvbkFuY2hvcihyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdFRvKHJhbmdlLmVuZC5yb3csIHJhbmdlLmVuZC5jb2x1bW4pO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmdldFJhbmdlKCkuaXNFbXB0eSgpKVxuICAgICAgICAgICAgdGhpcy4kaXNFbXB0eSA9IHRydWU7XG4gICAgICAgIHRoaXMuJGRlc2lyZWRDb2x1bW4gPSBudWxsO1xuICAgIH1cblxuICAgICRtb3ZlU2VsZWN0aW9uKG1vdmVyKSB7XG4gICAgICAgIHZhciBsZWFkID0gdGhpcy5sZWFkO1xuICAgICAgICBpZiAodGhpcy4kaXNFbXB0eSlcbiAgICAgICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uQW5jaG9yKGxlYWQucm93LCBsZWFkLmNvbHVtbik7XG5cbiAgICAgICAgbW92ZXIuY2FsbCh0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIGN1cnNvciB0byB0aGUgaW5kaWNhdGVkIHJvdyBhbmQgY29sdW1uLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZWxlY3RUb1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBzZWxlY3QgdG9cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gdG8gc2VsZWN0IHRvXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZWxlY3RUbyhyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgY29sdW1uKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiBjdXJzb3IgdG8gdGhlIHJvdyBhbmQgY29sdW1uIGluZGljYXRlZCBieSBgcG9zYC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2VsZWN0VG9Qb3NpdGlvblxuICAgICAqIEBwYXJhbSBwb3NpdGlvbiB7UG9zaXRpb259IEFuIG9iamVjdCBjb250YWluaW5nIHRoZSByb3cgYW5kIGNvbHVtblxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2VsZWN0VG9Qb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24pOiB2b2lkIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgc2VsZi5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihwb3NpdGlvbik7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gY3Vyc29yIHRvIHRoZSBpbmRpY2F0ZWQgcm93IGFuZCBjb2x1bW4uXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIG1vdmVUb1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBzZWxlY3QgdG9cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gdG8gc2VsZWN0IHRvXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBtb3ZlVG8ocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gY3Vyc29yIHRvIHRoZSByb3cgYW5kIGNvbHVtbiBpbmRpY2F0ZWQgYnkgYHBvc2AuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIG1vdmVUb1Bvc2l0aW9uXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHBvcyBBbiBvYmplY3QgY29udGFpbmluZyB0aGUgcm93IGFuZCBjb2x1bW4uXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBtb3ZlVG9Qb3NpdGlvbihwb3M6IFBvc2l0aW9uKTogdm9pZCB7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihwb3MpO1xuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB1cCBvbmUgcm93LlxuICAgICAqL1xuICAgIHNlbGVjdFVwKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvclVwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIGRvd24gb25lIHJvdy5cbiAgICAgKi9cbiAgICBzZWxlY3REb3duKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvckRvd24pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gcmlnaHQgb25lIGNvbHVtbi5cbiAgICAgKi9cbiAgICBzZWxlY3RSaWdodCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JSaWdodCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiBsZWZ0IG9uZSBjb2x1bW4uXG4gICAgICovXG4gICAgc2VsZWN0TGVmdCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JMZWZ0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBiZWdpbm5pbmcgb2YgdGhlIGN1cnJlbnQgbGluZS5cbiAgICAgKi9cbiAgICBzZWxlY3RMaW5lU3RhcnQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yTGluZVN0YXJ0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBlbmQgb2YgdGhlIGN1cnJlbnQgbGluZS5cbiAgICAgKi9cbiAgICBzZWxlY3RMaW5lRW5kKCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvckxpbmVFbmQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIGVuZCBvZiB0aGUgZmlsZS5cbiAgICAgKi9cbiAgICBzZWxlY3RGaWxlRW5kKCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvckZpbGVFbmQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIHN0YXJ0IG9mIHRoZSBmaWxlLlxuICAgICoqL1xuICAgIHNlbGVjdEZpbGVTdGFydCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JGaWxlU3RhcnQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIGZpcnN0IHdvcmQgb24gdGhlIHJpZ2h0LlxuICAgICoqL1xuICAgIHNlbGVjdFdvcmRSaWdodCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JXb3JkUmlnaHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIGZpcnN0IHdvcmQgb24gdGhlIGxlZnQuXG4gICAgKiovXG4gICAgc2VsZWN0V29yZExlZnQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yV29yZExlZnQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gaGlnaGxpZ2h0IHRoZSBlbnRpcmUgd29yZC5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRXb3JkUmFuZ2VcbiAgICAgKi9cbiAgICBnZXRXb3JkUmFuZ2Uocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogUmFuZ2Uge1xuICAgICAgICAvLyAgICAgICAgaWYgKHR5cGVvZiBjb2x1bW4gPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgLy8gICAgICAgICAgICB2YXIgY3Vyc29yID0gcm93IHx8IHRoaXMubGVhZDtcbiAgICAgICAgLy8gICAgICAgICAgICByb3cgPSBjdXJzb3Iucm93O1xuICAgICAgICAvLyAgICAgICAgICAgIGNvbHVtbiA9IGN1cnNvci5jb2x1bW47XG4gICAgICAgIC8vICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0V29yZFJhbmdlKHJvdywgY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBTZWxlY3RzIGFuIGVudGlyZSB3b3JkIGJvdW5kYXJ5LlxuICAgICoqL1xuICAgIHNlbGVjdFdvcmQoKSB7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uUmFuZ2UodGhpcy5nZXRXb3JkUmFuZ2UodGhpcy5sZWFkLnJvdywgdGhpcy5sZWFkLmNvbHVtbikpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2VsZWN0cyBhIHdvcmQsIGluY2x1ZGluZyBpdHMgcmlnaHQgd2hpdGVzcGFjZS5cbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmdldEFXb3JkUmFuZ2VcbiAgICAqKi9cbiAgICBzZWxlY3RBV29yZCgpIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yKCk7XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuc2Vzc2lvbi5nZXRBV29yZFJhbmdlKGN1cnNvci5yb3csIGN1cnNvci5jb2x1bW4pO1xuICAgICAgICB0aGlzLnNldFNlbGVjdGlvblJhbmdlKHJhbmdlKTtcbiAgICB9XG5cbiAgICBnZXRMaW5lUmFuZ2Uocm93PzogbnVtYmVyLCBleGNsdWRlTGFzdENoYXI/OiBib29sZWFuKTogUmFuZ2Uge1xuICAgICAgICB2YXIgcm93U3RhcnQgPSB0eXBlb2Ygcm93ID09IFwibnVtYmVyXCIgPyByb3cgOiB0aGlzLmxlYWQucm93O1xuICAgICAgICB2YXIgcm93RW5kO1xuXG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkTGluZShyb3dTdGFydCk7XG4gICAgICAgIGlmIChmb2xkTGluZSkge1xuICAgICAgICAgICAgcm93U3RhcnQgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgICAgICByb3dFbmQgPSBmb2xkTGluZS5lbmQucm93O1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcm93RW5kID0gcm93U3RhcnQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZXhjbHVkZUxhc3RDaGFyKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFJhbmdlKHJvd1N0YXJ0LCAwLCByb3dFbmQsIHRoaXMuc2Vzc2lvbi5nZXRMaW5lKHJvd0VuZCkubGVuZ3RoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUmFuZ2Uocm93U3RhcnQsIDAsIHJvd0VuZCArIDEsIDApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZWxlY3RzIHRoZSBlbnRpcmUgbGluZS5cbiAgICAqKi9cbiAgICBzZWxlY3RMaW5lKCkge1xuICAgICAgICB0aGlzLnNldFNlbGVjdGlvblJhbmdlKHRoaXMuZ2V0TGluZVJhbmdlKCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdXAgb25lIHJvdy5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yVXAoKSB7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvckJ5KC0xLCAwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIGRvd24gb25lIHJvdy5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yRG93bigpIHtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yQnkoMSwgMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciBsZWZ0IG9uZSBjb2x1bW4uXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckxlZnQoKSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmxlYWQuZ2V0UG9zaXRpb24oKSxcbiAgICAgICAgICAgIGZvbGQ7XG5cbiAgICAgICAgaWYgKGZvbGQgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZEF0KGN1cnNvci5yb3csIGN1cnNvci5jb2x1bW4sIC0xKSkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8oZm9sZC5zdGFydC5yb3csIGZvbGQuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgfSBlbHNlIGlmIChjdXJzb3IuY29sdW1uID09PSAwKSB7XG4gICAgICAgICAgICAvLyBjdXJzb3IgaXMgYSBsaW5lIChzdGFydFxuICAgICAgICAgICAgaWYgKGN1cnNvci5yb3cgPiAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8oY3Vyc29yLnJvdyAtIDEsIHRoaXMuZG9jLmdldExpbmUoY3Vyc29yLnJvdyAtIDEpLmxlbmd0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgdGFiU2l6ZSA9IHRoaXMuc2Vzc2lvbi5nZXRUYWJTaXplKCk7XG4gICAgICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmlzVGFiU3RvcChjdXJzb3IpICYmIHRoaXMuZG9jLmdldExpbmUoY3Vyc29yLnJvdykuc2xpY2UoY3Vyc29yLmNvbHVtbiAtIHRhYlNpemUsIGN1cnNvci5jb2x1bW4pLnNwbGl0KFwiIFwiKS5sZW5ndGggLSAxID09IHRhYlNpemUpXG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yQnkoMCwgLXRhYlNpemUpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckJ5KDAsIC0xKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgcmlnaHQgb25lIGNvbHVtbi5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yUmlnaHQoKSB7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLmxlYWQuZ2V0UG9zaXRpb24oKTtcbiAgICAgICAgdmFyIGZvbGQgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZEF0KHBvcy5yb3csIHBvcy5jb2x1bW4sIDEpO1xuICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8oZm9sZC5lbmQucm93LCBmb2xkLmVuZC5jb2x1bW4pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHRoaXMubGVhZC5jb2x1bW4gPT0gdGhpcy5kb2MuZ2V0TGluZSh0aGlzLmxlYWQucm93KS5sZW5ndGgpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmxlYWQucm93IDwgdGhpcy5kb2MuZ2V0TGVuZ3RoKCkgLSAxKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8odGhpcy5sZWFkLnJvdyArIDEsIDApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHRhYlNpemUgPSB0aGlzLnNlc3Npb24uZ2V0VGFiU2l6ZSgpO1xuICAgICAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMubGVhZDtcbiAgICAgICAgICAgIGlmICh0aGlzLnNlc3Npb24uaXNUYWJTdG9wKGN1cnNvcikgJiYgdGhpcy5kb2MuZ2V0TGluZShjdXJzb3Iucm93KS5zbGljZShjdXJzb3IuY29sdW1uLCBjdXJzb3IuY29sdW1uICsgdGFiU2l6ZSkuc3BsaXQoXCIgXCIpLmxlbmd0aCAtIDEgPT0gdGFiU2l6ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckJ5KDAsIHRhYlNpemUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yQnkoMCwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzdGFydCBvZiB0aGUgbGluZS5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yTGluZVN0YXJ0KCkge1xuICAgICAgICB2YXIgcm93ID0gdGhpcy5sZWFkLnJvdztcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMubGVhZC5jb2x1bW47XG4gICAgICAgIHZhciBzY3JlZW5Sb3cgPSB0aGlzLnNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblJvdyhyb3csIGNvbHVtbik7XG5cbiAgICAgICAgLy8gRGV0ZXJtIHRoZSBkb2MtcG9zaXRpb24gb2YgdGhlIGZpcnN0IGNoYXJhY3RlciBhdCB0aGUgc2NyZWVuIGxpbmUuXG4gICAgICAgIHZhciBmaXJzdENvbHVtblBvc2l0aW9uID0gdGhpcy5zZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIDApO1xuXG4gICAgICAgIC8vIERldGVybSB0aGUgbGluZVxuICAgICAgICAvLyBIb3cgZG9lcyBnZXREaXNwbGF5TGluZSBnZXQgZnJvbSBmb2xkaW5nIG9udG8gc2Vzc2lvbj9cbiAgICAgICAgdmFyIGJlZm9yZUN1cnNvciA9IHRoaXMuc2Vzc2lvblsnZ2V0RGlzcGxheUxpbmUnXShcbiAgICAgICAgICAgIHJvdywgbnVsbCwgZmlyc3RDb2x1bW5Qb3NpdGlvbi5yb3csXG4gICAgICAgICAgICBmaXJzdENvbHVtblBvc2l0aW9uLmNvbHVtblxuICAgICAgICApO1xuXG4gICAgICAgIHZhciBsZWFkaW5nU3BhY2UgPSBiZWZvcmVDdXJzb3IubWF0Y2goL15cXHMqLyk7XG4gICAgICAgIC8vIFRPRE8gZmluZCBiZXR0ZXIgd2F5IGZvciBlbWFjcyBtb2RlIHRvIG92ZXJyaWRlIHNlbGVjdGlvbiBiZWhhdmlvcnNcbiAgICAgICAgaWYgKGxlYWRpbmdTcGFjZVswXS5sZW5ndGggIT0gY29sdW1uICYmICF0aGlzLnNlc3Npb25bJyR1c2VFbWFjc1N0eWxlTGluZVN0YXJ0J10pXG4gICAgICAgICAgICBmaXJzdENvbHVtblBvc2l0aW9uLmNvbHVtbiArPSBsZWFkaW5nU3BhY2VbMF0ubGVuZ3RoO1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKGZpcnN0Q29sdW1uUG9zaXRpb24pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIGVuZCBvZiB0aGUgbGluZS5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yTGluZUVuZCgpIHtcbiAgICAgICAgdmFyIGxlYWQgPSB0aGlzLmxlYWQ7XG4gICAgICAgIHZhciBsaW5lRW5kID0gdGhpcy5zZXNzaW9uLmdldERvY3VtZW50TGFzdFJvd0NvbHVtblBvc2l0aW9uKGxlYWQucm93LCBsZWFkLmNvbHVtbik7XG4gICAgICAgIGlmICh0aGlzLmxlYWQuY29sdW1uID09IGxpbmVFbmQuY29sdW1uKSB7XG4gICAgICAgICAgICB2YXIgbGluZSA9IHRoaXMuc2Vzc2lvbi5nZXRMaW5lKGxpbmVFbmQucm93KTtcbiAgICAgICAgICAgIGlmIChsaW5lRW5kLmNvbHVtbiA9PSBsaW5lLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHZhciB0ZXh0RW5kID0gbGluZS5zZWFyY2goL1xccyskLyk7XG4gICAgICAgICAgICAgICAgaWYgKHRleHRFbmQgPiAwKVxuICAgICAgICAgICAgICAgICAgICBsaW5lRW5kLmNvbHVtbiA9IHRleHRFbmQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhsaW5lRW5kLnJvdywgbGluZUVuZC5jb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIGVuZCBvZiB0aGUgZmlsZS5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yRmlsZUVuZCgpIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMTtcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMuZG9jLmdldExpbmUocm93KS5sZW5ndGg7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzdGFydCBvZiB0aGUgZmlsZS5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yRmlsZVN0YXJ0KCkge1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbygwLCAwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSB3b3JkIG9uIHRoZSByaWdodC5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yTG9uZ1dvcmRSaWdodCgpIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMubGVhZC5yb3c7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLmxlYWQuY29sdW1uO1xuICAgICAgICB2YXIgbGluZSA9IHRoaXMuZG9jLmdldExpbmUocm93KTtcbiAgICAgICAgdmFyIHJpZ2h0T2ZDdXJzb3IgPSBsaW5lLnN1YnN0cmluZyhjb2x1bW4pO1xuXG4gICAgICAgIHZhciBtYXRjaDtcbiAgICAgICAgdGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4ID0gMDtcblxuICAgICAgICAvLyBza2lwIGZvbGRzXG4gICAgICAgIHZhciBmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChyb3csIGNvbHVtbiwgMSk7XG4gICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhmb2xkLmVuZC5yb3csIGZvbGQuZW5kLmNvbHVtbik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBmaXJzdCBza2lwIHNwYWNlXG4gICAgICAgIGlmIChtYXRjaCA9IHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmV4ZWMocmlnaHRPZkN1cnNvcikpIHtcbiAgICAgICAgICAgIGNvbHVtbiArPSB0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5sYXN0SW5kZXg7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICAgICAgcmlnaHRPZkN1cnNvciA9IGxpbmUuc3Vic3RyaW5nKGNvbHVtbik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpZiBhdCBsaW5lIGVuZCBwcm9jZWVkIHdpdGggbmV4dCBsaW5lXG4gICAgICAgIGlmIChjb2x1bW4gPj0gbGluZS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgbGluZS5sZW5ndGgpO1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yUmlnaHQoKTtcbiAgICAgICAgICAgIGlmIChyb3cgPCB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDEpXG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yV29yZFJpZ2h0KCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBhZHZhbmNlIHRvIHRoZSBlbmQgb2YgdGhlIG5leHQgdG9rZW5cbiAgICAgICAgaWYgKG1hdGNoID0gdGhpcy5zZXNzaW9uLnRva2VuUmUuZXhlYyhyaWdodE9mQ3Vyc29yKSkge1xuICAgICAgICAgICAgY29sdW1uICs9IHRoaXMuc2Vzc2lvbi50b2tlblJlLmxhc3RJbmRleDtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi50b2tlblJlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgd29yZCBvbiB0aGUgbGVmdC5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yTG9uZ1dvcmRMZWZ0KCkge1xuICAgICAgICB2YXIgcm93ID0gdGhpcy5sZWFkLnJvdztcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMubGVhZC5jb2x1bW47XG5cbiAgICAgICAgLy8gc2tpcCBmb2xkc1xuICAgICAgICB2YXIgZm9sZDtcbiAgICAgICAgaWYgKGZvbGQgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZEF0KHJvdywgY29sdW1uLCAtMSkpIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGZvbGQuc3RhcnQucm93LCBmb2xkLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBIb3cgZG9lcyB0aGlzIGdldCBmcm9tIHRoZSBmb2xkaW5nIGFkYXB0ZXIgb250byB0aGUgc2Vzc2lvbj9cbiAgICAgICAgdmFyIHN0ciA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkU3RyaW5nQXQocm93LCBjb2x1bW4sIC0xKTtcbiAgICAgICAgaWYgKHN0ciA9PSBudWxsKSB7XG4gICAgICAgICAgICBzdHIgPSB0aGlzLmRvYy5nZXRMaW5lKHJvdykuc3Vic3RyaW5nKDAsIGNvbHVtbilcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBsZWZ0T2ZDdXJzb3IgPSBzdHJpbmdSZXZlcnNlKHN0cik7XG4gICAgICAgIHZhciBtYXRjaDtcbiAgICAgICAgdGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4ID0gMDtcblxuICAgICAgICAvLyBza2lwIHdoaXRlc3BhY2VcbiAgICAgICAgaWYgKG1hdGNoID0gdGhpcy5zZXNzaW9uLm5vblRva2VuUmUuZXhlYyhsZWZ0T2ZDdXJzb3IpKSB7XG4gICAgICAgICAgICBjb2x1bW4gLT0gdGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4O1xuICAgICAgICAgICAgbGVmdE9mQ3Vyc29yID0gbGVmdE9mQ3Vyc29yLnNsaWNlKHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmxhc3RJbmRleCk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgYXQgYmVnaW4gb2YgdGhlIGxpbmUgcHJvY2VlZCBpbiBsaW5lIGFib3ZlXG4gICAgICAgIGlmIChjb2x1bW4gPD0gMCkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCAwKTtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckxlZnQoKTtcbiAgICAgICAgICAgIGlmIChyb3cgPiAwKVxuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvcldvcmRMZWZ0KCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBtb3ZlIHRvIHRoZSBiZWdpbiBvZiB0aGUgd29yZFxuICAgICAgICBpZiAobWF0Y2ggPSB0aGlzLnNlc3Npb24udG9rZW5SZS5leGVjKGxlZnRPZkN1cnNvcikpIHtcbiAgICAgICAgICAgIGNvbHVtbiAtPSB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXg7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4pO1xuICAgIH1cblxuICAgICRzaG9ydFdvcmRFbmRJbmRleChyaWdodE9mQ3Vyc29yKSB7XG4gICAgICAgIHZhciBtYXRjaCwgaW5kZXggPSAwLCBjaDtcbiAgICAgICAgdmFyIHdoaXRlc3BhY2VSZSA9IC9cXHMvO1xuICAgICAgICB2YXIgdG9rZW5SZSA9IHRoaXMuc2Vzc2lvbi50b2tlblJlO1xuXG4gICAgICAgIHRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgaWYgKG1hdGNoID0gdGhpcy5zZXNzaW9uLnRva2VuUmUuZXhlYyhyaWdodE9mQ3Vyc29yKSkge1xuICAgICAgICAgICAgaW5kZXggPSB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXg7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB3aGlsZSAoKGNoID0gcmlnaHRPZkN1cnNvcltpbmRleF0pICYmIHdoaXRlc3BhY2VSZS50ZXN0KGNoKSlcbiAgICAgICAgICAgICAgICBpbmRleCsrO1xuXG4gICAgICAgICAgICBpZiAoaW5kZXggPCAxKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICAgICAgICAgIHdoaWxlICgoY2ggPSByaWdodE9mQ3Vyc29yW2luZGV4XSkgJiYgIXRva2VuUmUudGVzdChjaCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICAgICAgICAgICAgICBpbmRleCsrO1xuICAgICAgICAgICAgICAgICAgICBpZiAod2hpdGVzcGFjZVJlLnRlc3QoY2gpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPiAyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5kZXgtLVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aGlsZSAoKGNoID0gcmlnaHRPZkN1cnNvcltpbmRleF0pICYmIHdoaXRlc3BhY2VSZS50ZXN0KGNoKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5kZXgrKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPiAyKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRva2VuUmUubGFzdEluZGV4ID0gMDtcblxuICAgICAgICByZXR1cm4gaW5kZXg7XG4gICAgfVxuXG4gICAgbW92ZUN1cnNvclNob3J0V29yZFJpZ2h0KCkge1xuICAgICAgICB2YXIgcm93ID0gdGhpcy5sZWFkLnJvdztcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMubGVhZC5jb2x1bW47XG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5kb2MuZ2V0TGluZShyb3cpO1xuICAgICAgICB2YXIgcmlnaHRPZkN1cnNvciA9IGxpbmUuc3Vic3RyaW5nKGNvbHVtbik7XG5cbiAgICAgICAgdmFyIGZvbGQgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZEF0KHJvdywgY29sdW1uLCAxKTtcbiAgICAgICAgaWYgKGZvbGQpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5tb3ZlQ3Vyc29yVG8oZm9sZC5lbmQucm93LCBmb2xkLmVuZC5jb2x1bW4pO1xuXG4gICAgICAgIGlmIChjb2x1bW4gPT0gbGluZS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHZhciBsID0gdGhpcy5kb2MuZ2V0TGVuZ3RoKCk7XG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgcm93Kys7XG4gICAgICAgICAgICAgICAgcmlnaHRPZkN1cnNvciA9IHRoaXMuZG9jLmdldExpbmUocm93KVxuICAgICAgICAgICAgfSB3aGlsZSAocm93IDwgbCAmJiAvXlxccyokLy50ZXN0KHJpZ2h0T2ZDdXJzb3IpKVxuXG4gICAgICAgICAgICBpZiAoIS9eXFxzKy8udGVzdChyaWdodE9mQ3Vyc29yKSlcbiAgICAgICAgICAgICAgICByaWdodE9mQ3Vyc29yID0gXCJcIlxuICAgICAgICAgICAgY29sdW1uID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpbmRleCA9IHRoaXMuJHNob3J0V29yZEVuZEluZGV4KHJpZ2h0T2ZDdXJzb3IpO1xuXG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgY29sdW1uICsgaW5kZXgpO1xuICAgIH1cblxuICAgIG1vdmVDdXJzb3JTaG9ydFdvcmRMZWZ0KCkge1xuICAgICAgICB2YXIgcm93ID0gdGhpcy5sZWFkLnJvdztcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMubGVhZC5jb2x1bW47XG5cbiAgICAgICAgdmFyIGZvbGQ7XG4gICAgICAgIGlmIChmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChyb3csIGNvbHVtbiwgLTEpKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMubW92ZUN1cnNvclRvKGZvbGQuc3RhcnQucm93LCBmb2xkLnN0YXJ0LmNvbHVtbik7XG5cbiAgICAgICAgdmFyIGxpbmUgPSB0aGlzLnNlc3Npb24uZ2V0TGluZShyb3cpLnN1YnN0cmluZygwLCBjb2x1bW4pO1xuICAgICAgICBpZiAoY29sdW1uID09IDApIHtcbiAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICByb3ctLTtcbiAgICAgICAgICAgICAgICBsaW5lID0gdGhpcy5kb2MuZ2V0TGluZShyb3cpO1xuICAgICAgICAgICAgfSB3aGlsZSAocm93ID4gMCAmJiAvXlxccyokLy50ZXN0KGxpbmUpKVxuXG4gICAgICAgICAgICBjb2x1bW4gPSBsaW5lLmxlbmd0aDtcbiAgICAgICAgICAgIGlmICghL1xccyskLy50ZXN0KGxpbmUpKVxuICAgICAgICAgICAgICAgIGxpbmUgPSBcIlwiXG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGVmdE9mQ3Vyc29yID0gc3RyaW5nUmV2ZXJzZShsaW5lKTtcbiAgICAgICAgdmFyIGluZGV4ID0gdGhpcy4kc2hvcnRXb3JkRW5kSW5kZXgobGVmdE9mQ3Vyc29yKTtcblxuICAgICAgICByZXR1cm4gdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4gLSBpbmRleCk7XG4gICAgfVxuXG4gICAgbW92ZUN1cnNvcldvcmRSaWdodCgpIHtcbiAgICAgICAgLy8gU2VlIGtleWJvYXJkL2VtYWNzLmpzXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb25bJyRzZWxlY3RMb25nV29yZHMnXSkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yTG9uZ1dvcmRSaWdodCgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yU2hvcnRXb3JkUmlnaHQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIG1vdmVDdXJzb3JXb3JkTGVmdCgpIHtcbiAgICAgICAgLy8gU2VlIGtleWJvYXJkL2VtYWNzLmpzXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb25bJyRzZWxlY3RMb25nV29yZHMnXSkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yTG9uZ1dvcmRMZWZ0KCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JTaG9ydFdvcmRMZWZ0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gcG9zaXRpb24gaW5kaWNhdGVkIGJ5IHRoZSBwYXJhbWV0ZXJzLiBOZWdhdGl2ZSBudW1iZXJzIG1vdmUgdGhlIGN1cnNvciBiYWNrd2FyZHMgaW4gdGhlIGRvY3VtZW50LlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvd3MgVGhlIG51bWJlciBvZiByb3dzIHRvIG1vdmUgYnlcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjaGFycyBUaGUgbnVtYmVyIG9mIGNoYXJhY3RlcnMgdG8gbW92ZSBieVxuICAgICpcbiAgICAqXG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb25cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yQnkocm93cywgY2hhcnMpIHtcbiAgICAgICAgdmFyIHNjcmVlblBvcyA9IHRoaXMuc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oXG4gICAgICAgICAgICB0aGlzLmxlYWQucm93LFxuICAgICAgICAgICAgdGhpcy5sZWFkLmNvbHVtblxuICAgICAgICApO1xuXG4gICAgICAgIGlmIChjaGFycyA9PT0gMCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJGRlc2lyZWRDb2x1bW4pXG4gICAgICAgICAgICAgICAgc2NyZWVuUG9zLmNvbHVtbiA9IHRoaXMuJGRlc2lyZWRDb2x1bW47XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy4kZGVzaXJlZENvbHVtbiA9IHNjcmVlblBvcy5jb2x1bW47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZG9jUG9zID0gdGhpcy5zZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Qb3Mucm93ICsgcm93cywgc2NyZWVuUG9zLmNvbHVtbik7XG5cbiAgICAgICAgaWYgKHJvd3MgIT09IDAgJiYgY2hhcnMgPT09IDAgJiYgZG9jUG9zLnJvdyA9PT0gdGhpcy5sZWFkLnJvdyAmJiBkb2NQb3MuY29sdW1uID09PSB0aGlzLmxlYWQuY29sdW1uKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmxpbmVXaWRnZXRzICYmIHRoaXMuc2Vzc2lvbi5saW5lV2lkZ2V0c1tkb2NQb3Mucm93XSlcbiAgICAgICAgICAgICAgICBkb2NQb3Mucm93Kys7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBtb3ZlIHRoZSBjdXJzb3IgYW5kIHVwZGF0ZSB0aGUgZGVzaXJlZCBjb2x1bW5cbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8oZG9jUG9zLnJvdywgZG9jUG9zLmNvbHVtbiArIGNoYXJzLCBjaGFycyA9PT0gMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB0byB0aGUgcG9zaXRpb24gaW5kaWNhdGVkIGJ5IGl0cyBgcm93YCBhbmQgYGNvbHVtbmAuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIG1vdmVDdXJzb3JUb1Bvc2l0aW9uXG4gICAgICogQHBhcmFtIHBvc2l0aW9uIHtQb3NpdGlvbn0gVGhlIHBvc2l0aW9uIHRvIG1vdmUgdG8uXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBtb3ZlQ3Vyc29yVG9Qb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocG9zaXRpb24ucm93LCBwb3NpdGlvbi5jb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHJvdyBhbmQgY29sdW1uIHByb3ZpZGVkLlxuICAgICAqIFtJZiBgcHJldmVudFVwZGF0ZURlc2lyZWRDb2x1bW5gIGlzIGB0cnVlYCwgdGhlbiB0aGUgY3Vyc29yIHN0YXlzIGluIHRoZSBzYW1lIGNvbHVtbiBwb3NpdGlvbiBhcyBpdHMgb3JpZ2luYWwgcG9pbnQuXXs6ICNwcmV2ZW50VXBkYXRlQm9vbERlc2N9XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvdyBUaGUgcm93IHRvIG1vdmUgdG9cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gdG8gbW92ZSB0b1xuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0ga2VlcERlc2lyZWRDb2x1bW4gW0lmIGB0cnVlYCwgdGhlIGN1cnNvciBtb3ZlIGRvZXMgbm90IHJlc3BlY3QgdGhlIHByZXZpb3VzIGNvbHVtbl17OiAjcHJldmVudFVwZGF0ZUJvb2x9XG4gICAgICovXG4gICAgbW92ZUN1cnNvclRvKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwga2VlcERlc2lyZWRDb2x1bW4/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIC8vIEVuc3VyZSB0aGUgcm93L2NvbHVtbiBpcyBub3QgaW5zaWRlIG9mIGEgZm9sZC5cbiAgICAgICAgdmFyIGZvbGQgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZEF0KHJvdywgY29sdW1uLCAxKTtcbiAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgIHJvdyA9IGZvbGQuc3RhcnQucm93O1xuICAgICAgICAgICAgY29sdW1uID0gZm9sZC5zdGFydC5jb2x1bW47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiRrZWVwRGVzaXJlZENvbHVtbk9uQ2hhbmdlID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5sZWFkLnNldFBvc2l0aW9uKHJvdywgY29sdW1uKTtcbiAgICAgICAgdGhpcy4ka2VlcERlc2lyZWRDb2x1bW5PbkNoYW5nZSA9IGZhbHNlO1xuXG4gICAgICAgIGlmICgha2VlcERlc2lyZWRDb2x1bW4pXG4gICAgICAgICAgICB0aGlzLiRkZXNpcmVkQ29sdW1uID0gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHNjcmVlbiBwb3NpdGlvbiBpbmRpY2F0ZWQgYnkgcm93IGFuZCBjb2x1bW4uIHs6cHJldmVudFVwZGF0ZUJvb2xEZXNjfVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIG1vdmUgdG9cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGNvbHVtbiB0byBtb3ZlIHRvXG4gICAgKiBAcGFyYW0ge0Jvb2xlYW59IGtlZXBEZXNpcmVkQ29sdW1uIHs6cHJldmVudFVwZGF0ZUJvb2x9XG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yVG9TY3JlZW4ocm93LCBjb2x1bW4sIGtlZXBEZXNpcmVkQ29sdW1uKSB7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLnNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHJvdywgY29sdW1uKTtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocG9zLnJvdywgcG9zLmNvbHVtbiwga2VlcERlc2lyZWRDb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb25cbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIHtzdHJpbmd9XG4gICAgICogQHBhcmFtIGNhbGxiYWNrIHsoZXZlbnQsIHNvdXJjZTogU2VsZWN0aW9uKSA9PiBhbnl9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBvbihldmVudE5hbWU6IHN0cmluZywgY2FsbGJhY2s6IChldmVudDogYW55LCBzb3VyY2U6IFNlbGVjdGlvbikgPT4gYW55KTogdm9pZCB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMub24oZXZlbnROYW1lLCBjYWxsYmFjaywgZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb2ZmXG4gICAgICogQHBhcmFtIGV2ZW50TmFtZSB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSBjYWxsYmFjayB7KGV2ZW50LCBzb3VyY2U6IFNlbGVjdGlvbikgPT4gYW55fVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb2ZmKGV2ZW50TmFtZTogc3RyaW5nLCBjYWxsYmFjazogKGV2ZW50OiBhbnksIHNvdXJjZTogU2VsZWN0aW9uKSA9PiBhbnkpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5vZmYoZXZlbnROYW1lLCBjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgLy8gcmVtb3ZlIGxpc3RlbmVycyBmcm9tIGRvY3VtZW50XG4gICAgZGV0YWNoKCkge1xuICAgICAgICB0aGlzLmxlYWQuZGV0YWNoKCk7XG4gICAgICAgIHRoaXMuYW5jaG9yLmRldGFjaCgpO1xuICAgICAgICB0aGlzLnNlc3Npb24gPSB0aGlzLmRvYyA9IG51bGw7XG4gICAgfVxuXG4gICAgZnJvbU9yaWVudGVkUmFuZ2UocmFuZ2U6IE9yaWVudGVkUmFuZ2UpIHtcbiAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSwgcmFuZ2UuY3Vyc29yID09IHJhbmdlLnN0YXJ0KTtcbiAgICAgICAgdGhpcy4kZGVzaXJlZENvbHVtbiA9IHJhbmdlLmRlc2lyZWRDb2x1bW4gfHwgdGhpcy4kZGVzaXJlZENvbHVtbjtcbiAgICB9XG5cbiAgICB0b09yaWVudGVkUmFuZ2UocmFuZ2U/KSB7XG4gICAgICAgIHZhciByID0gdGhpcy5nZXRSYW5nZSgpO1xuICAgICAgICBpZiAocmFuZ2UpIHtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbiA9IHIuc3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQucm93ID0gci5zdGFydC5yb3c7XG4gICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uID0gci5lbmQuY29sdW1uO1xuICAgICAgICAgICAgcmFuZ2UuZW5kLnJvdyA9IHIuZW5kLnJvdztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJhbmdlID0gcjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJhbmdlLmN1cnNvciA9IHRoaXMuaXNCYWNrd2FyZHMoKSA/IHJhbmdlLnN0YXJ0IDogcmFuZ2UuZW5kO1xuICAgICAgICByYW5nZS5kZXNpcmVkQ29sdW1uID0gdGhpcy4kZGVzaXJlZENvbHVtbjtcbiAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2F2ZXMgdGhlIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uIGFuZCBjYWxscyBgZnVuY2AgdGhhdCBjYW4gY2hhbmdlIHRoZSBjdXJzb3JcbiAgICAqIHBvc3Rpb24uIFRoZSByZXN1bHQgaXMgdGhlIHJhbmdlIG9mIHRoZSBzdGFydGluZyBhbmQgZXZlbnR1YWwgY3Vyc29yIHBvc2l0aW9uLlxuICAgICogV2lsbCByZXNldCB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuICAgICogQHBhcmFtIHtGdW5jdGlvbn0gVGhlIGNhbGxiYWNrIHRoYXQgc2hvdWxkIGNoYW5nZSB0aGUgY3Vyc29yIHBvc2l0aW9uXG4gICAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgICAqXG4gICAgKiovXG4gICAgZ2V0UmFuZ2VPZk1vdmVtZW50cyhmdW5jKSB7XG4gICAgICAgIHZhciBzdGFydCA9IHRoaXMuZ2V0Q3Vyc29yKCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmdW5jLmNhbGwobnVsbCwgdGhpcyk7XG4gICAgICAgICAgICB2YXIgZW5kID0gdGhpcy5nZXRDdXJzb3IoKTtcbiAgICAgICAgICAgIHJldHVybiBSYW5nZS5mcm9tUG9pbnRzKHN0YXJ0LCBlbmQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICByZXR1cm4gUmFuZ2UuZnJvbVBvaW50cyhzdGFydCwgc3RhcnQpO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihzdGFydCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB0b0pTT04oKSB7XG4gICAgICAgIGlmICh0aGlzLnJhbmdlQ291bnQpIHtcbiAgICAgICAgICAgIHZhciBkYXRhOiBhbnkgPSB0aGlzLnJhbmdlcy5tYXAoZnVuY3Rpb24ocikge1xuICAgICAgICAgICAgICAgIHZhciByMSA9IHIuY2xvbmUoKTtcbiAgICAgICAgICAgICAgICByMS5pc0JhY2t3YXJkcyA9IHIuY3Vyc29yID09IHIuc3RhcnQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHIxO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZGF0YTogYW55ID0gdGhpcy5nZXRSYW5nZSgpO1xuICAgICAgICAgICAgZGF0YS5pc0JhY2t3YXJkcyA9IHRoaXMuaXNCYWNrd2FyZHMoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGF0YTtcbiAgICB9XG5cbiAgICBwdWJsaWMgdG9TaW5nbGVSYW5nZShkYXRhOiBSYW5nZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJTZWxlY3Rpb24udG9TaW5nbGVSYW5nZSBpcyB1bnN1cHBvcnRlZFwiKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYWRkUmFuZ2UoZGF0YTogUmFuZ2UsIHNvbWV0aGluZz86IGJvb2xlYW4pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiU2VsZWN0aW9uLmFkZFJhbmdlIGlzIHVuc3VwcG9ydGVkXCIpO1xuICAgIH1cblxuICAgIGZyb21KU09OKGRhdGEvKjoge3N0YXJ0O2xlbmd0aDtpc0JhY2thcmRzfSovKSB7XG4gICAgICAgIGlmIChkYXRhLnN0YXJ0ID09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgaWYgKHRoaXMucmFuZ2VMaXN0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b1NpbmdsZVJhbmdlKGRhdGFbMF0pO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSBkYXRhLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcjogYW55ID0gUmFuZ2UuZnJvbVBvaW50cyhkYXRhW2ldLnN0YXJ0LCBkYXRhW2ldLmVuZCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkYXRhLmlzQmFja3dhcmRzKVxuICAgICAgICAgICAgICAgICAgICAgICAgci5jdXJzb3IgPSByLnN0YXJ0O1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZFJhbmdlKHIsIHRydWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICBkYXRhID0gZGF0YVswXTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5yYW5nZUxpc3QpXG4gICAgICAgICAgICB0aGlzLnRvU2luZ2xlUmFuZ2UoZGF0YSk7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uUmFuZ2UoZGF0YSwgZGF0YS5pc0JhY2t3YXJkcyk7XG4gICAgfVxuXG4gICAgaXNFcXVhbChkYXRhKSB7XG4gICAgICAgIGlmICgoZGF0YS5sZW5ndGggfHwgdGhpcy5yYW5nZUNvdW50KSAmJiBkYXRhLmxlbmd0aCAhPT0gdGhpcy5yYW5nZUNvdW50KVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAoIWRhdGEubGVuZ3RoIHx8ICF0aGlzLnJhbmdlcylcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldFJhbmdlKCkuaXNFcXVhbChkYXRhKTtcblxuICAgICAgICBmb3IgKHZhciBpID0gdGhpcy5yYW5nZXMubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMucmFuZ2VzW2ldLmlzRXF1YWwoZGF0YVtpXSkpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxufVxuIl19