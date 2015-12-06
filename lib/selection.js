import { stringReverse } from "./lib/lang";
import { EventEmitterClass } from "./lib/event_emitter";
import { Range } from "./range";
export class Selection extends EventEmitterClass {
    constructor(session) {
        super();
        this.session = session;
        this.doc = session.getDocument();
        this.clearSelection();
        this.lead = this.selectionLead = this.doc.createAnchor(0, 0);
        this.anchor = this.selectionAnchor = this.doc.createAnchor(0, 0);
        var self = this;
        this.lead.on("change", function (e) {
            self._emit("changeCursor");
            if (!self.$isEmpty)
                self._emit("changeSelection");
            if (!self.$keepDesiredColumnOnChange && e.old.column != e.value.column)
                self.$desiredColumn = null;
        });
        this.selectionAnchor.on("change", function () {
            if (!self.$isEmpty) {
                self._emit("changeSelection");
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
            this._emit("changeSelection");
        }
    }
    getSelectionAnchor() {
        if (this.$isEmpty)
            return this.getSelectionLead();
        else
            return this.anchor.getPosition();
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
            this._emit("changeSelection");
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
    selectToPosition(pos) {
        this.$moveSelection(function () {
            this.moveCursorToPosition(pos);
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
        if (typeof column == "undefined") {
            var cursor = row || this.lead;
            row = cursor.row;
            column = cursor.column;
        }
        return this.session.getWordRange(row, column);
    }
    selectWord() {
        this.setSelectionRange(this.getWordRange());
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
        var str = this.session['getFoldStringAt'](row, column, -1);
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
        if ((data.length || this.rangeCount) && data.length != this.rangeCount)
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VsZWN0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3NlbGVjdGlvbi50cyJdLCJuYW1lcyI6WyJTZWxlY3Rpb24iLCJTZWxlY3Rpb24uY29uc3RydWN0b3IiLCJTZWxlY3Rpb24uaXNFbXB0eSIsIlNlbGVjdGlvbi5pc011bHRpTGluZSIsIlNlbGVjdGlvbi5nZXRDdXJzb3IiLCJTZWxlY3Rpb24uc2V0U2VsZWN0aW9uQW5jaG9yIiwiU2VsZWN0aW9uLmdldFNlbGVjdGlvbkFuY2hvciIsIlNlbGVjdGlvbi5nZXRTZWxlY3Rpb25MZWFkIiwiU2VsZWN0aW9uLnNoaWZ0U2VsZWN0aW9uIiwiU2VsZWN0aW9uLmlzQmFja3dhcmRzIiwiU2VsZWN0aW9uLmdldFJhbmdlIiwiU2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uIiwiU2VsZWN0aW9uLnNlbGVjdEFsbCIsIlNlbGVjdGlvbi5zZXRSYW5nZSIsIlNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZSIsIlNlbGVjdGlvbi4kbW92ZVNlbGVjdGlvbiIsIlNlbGVjdGlvbi5zZWxlY3RUbyIsIlNlbGVjdGlvbi5zZWxlY3RUb1Bvc2l0aW9uIiwiU2VsZWN0aW9uLm1vdmVUbyIsIlNlbGVjdGlvbi5tb3ZlVG9Qb3NpdGlvbiIsIlNlbGVjdGlvbi5zZWxlY3RVcCIsIlNlbGVjdGlvbi5zZWxlY3REb3duIiwiU2VsZWN0aW9uLnNlbGVjdFJpZ2h0IiwiU2VsZWN0aW9uLnNlbGVjdExlZnQiLCJTZWxlY3Rpb24uc2VsZWN0TGluZVN0YXJ0IiwiU2VsZWN0aW9uLnNlbGVjdExpbmVFbmQiLCJTZWxlY3Rpb24uc2VsZWN0RmlsZUVuZCIsIlNlbGVjdGlvbi5zZWxlY3RGaWxlU3RhcnQiLCJTZWxlY3Rpb24uc2VsZWN0V29yZFJpZ2h0IiwiU2VsZWN0aW9uLnNlbGVjdFdvcmRMZWZ0IiwiU2VsZWN0aW9uLmdldFdvcmRSYW5nZSIsIlNlbGVjdGlvbi5zZWxlY3RXb3JkIiwiU2VsZWN0aW9uLnNlbGVjdEFXb3JkIiwiU2VsZWN0aW9uLmdldExpbmVSYW5nZSIsIlNlbGVjdGlvbi5zZWxlY3RMaW5lIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JVcCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yRG93biIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGVmdCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yUmlnaHQiLCJTZWxlY3Rpb24ubW92ZUN1cnNvckxpbmVTdGFydCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGluZUVuZCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yRmlsZUVuZCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yRmlsZVN0YXJ0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JMb25nV29yZFJpZ2h0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JMb25nV29yZExlZnQiLCJTZWxlY3Rpb24uJHNob3J0V29yZEVuZEluZGV4IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JTaG9ydFdvcmRSaWdodCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yU2hvcnRXb3JkTGVmdCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yV29yZFJpZ2h0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JXb3JkTGVmdCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yQnkiLCJTZWxlY3Rpb24ubW92ZUN1cnNvclRvUG9zaXRpb24iLCJTZWxlY3Rpb24ubW92ZUN1cnNvclRvIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JUb1NjcmVlbiIsIlNlbGVjdGlvbi5kZXRhY2giLCJTZWxlY3Rpb24uZnJvbU9yaWVudGVkUmFuZ2UiLCJTZWxlY3Rpb24udG9PcmllbnRlZFJhbmdlIiwiU2VsZWN0aW9uLmdldFJhbmdlT2ZNb3ZlbWVudHMiLCJTZWxlY3Rpb24udG9KU09OIiwiU2VsZWN0aW9uLnRvU2luZ2xlUmFuZ2UiLCJTZWxlY3Rpb24uYWRkUmFuZ2UiLCJTZWxlY3Rpb24uZnJvbUpTT04iLCJTZWxlY3Rpb24uaXNFcXVhbCJdLCJtYXBwaW5ncyI6Ik9BK0JPLEVBQUMsYUFBYSxFQUFDLE1BQU0sWUFBWTtP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RURBLEVBQUVBLENBQUNBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxNQUFNQSxDQUFDQSxJQUFJQSxLQUFLQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxFQUFFQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUMvRUEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsTUFBTUEsQ0FBQ0EsSUFBSUEsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsRUFBRUEsTUFBTUEsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDakRBLENBQUNBO0lBQ0xBLENBQUNBO0lBS0RqQyxVQUFVQTtRQUNOa0MsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUNoREEsQ0FBQ0E7SUFNRGxDLFlBQVlBO1FBQ1JtQyxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUM3QkEsQ0FBQ0E7SUFNRG5DLGNBQWNBO1FBQ1ZvQyxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUM1QkEsQ0FBQ0E7SUFNRHBDLGNBQWNBO1FBQ1ZxQyxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxFQUFFQSxFQUNoQ0EsSUFBSUEsQ0FBQ0E7UUFFVEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDL0RBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ3pEQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUU3QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUMvRUEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7WUFDeENBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLE9BQU9BLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLElBQUlBLE9BQU9BLENBQUNBO2dCQUM5SUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLElBQUlBO2dCQUNBQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNqQ0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFNRHJDLGVBQWVBO1FBQ1hzQyxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQTtRQUNsQ0EsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDMURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ1BBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ3JEQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzNDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1Q0EsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7WUFDeENBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBO1lBQ3ZCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxPQUFPQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxJQUFJQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDaEpBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO1lBQ2xDQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDRkEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUJBLENBQUNBO1FBQ0xBLENBQUNBO0lBQ0xBLENBQUNBO0lBTUR0QyxtQkFBbUJBO1FBQ2Z1QyxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUN4QkEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDOUJBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLG1CQUFtQkEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFHOURBLElBQUlBLG1CQUFtQkEsR0FBR0EsSUFBSUEs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SUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDakNBLElBQUlBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRTNDQSxJQUFJQSxLQUFLQSxDQUFDQTtRQUNWQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN0Q0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFHbkNBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ2xEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNQQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNqREEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFHREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdERBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLFNBQVNBLENBQUNBO1lBQzVDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN0Q0EsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDM0NBLENBQUNBO1FBR0RBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ3hCQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNwQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7WUFDdkJBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO2dCQUMvQkEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxFQUFFQSxDQUFDQTtZQUMvQkEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFHREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkRBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBO1lBQ3pDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN2Q0EsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7SUFDbkNBLENBQUNBO0lBTUQzQyxzQkFBc0JBO1FBQ2xCNEMsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDeEJBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBO1FBRzlCQSxJQUFJQSxJQUFJQSxDQUFDQTtRQUNUQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqREEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDckRBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBR0RBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDM0RBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ2RBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLEVBQUVBLE1BQU1BLENBQUNBLENBQUFBO1FBQ3BEQSxDQUFDQTtRQUVEQSxJQUFJQSxZQUFZQSxHQUFHQSxhQUFhQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN0Q0EsSUFBSUEsS0FBS0EsQ0FBQ0E7UUFDVkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdENBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBR25DQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyREEsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsU0FBU0EsQ0FB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Q0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDL0NBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRWhFQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUMxREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZEEsR0FBR0EsQ0FBQ0E7Z0JBQ0FBLEdBQUdBLEVBQUVBLENBQUNBO2dCQUNOQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNqQ0EsQ0FBQ0EsUUFBUUEsR0FBR0EsR0FBR0EsQ0FBQ0EsSUFBSUEsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBQ0E7WUFFdkNBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBO1lBQ3JCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDbkJBLElBQUlBLEdBQUdBLEVBQUVBLENBQUFBO1FBQ2pCQSxDQUFDQTtRQUVEQSxJQUFJQSxZQUFZQSxHQUFHQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN2Q0EsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtRQUVsREEsTUFB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Q0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0E7WUFDcENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQUE7UUFDcEJBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtBQUNMOUQsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXG5pbXBvcnQge0RvY3VtZW50fSBmcm9tIFwiLi9kb2N1bWVudFwiO1xuaW1wb3J0IHtzdHJpbmdSZXZlcnNlfSBmcm9tIFwiLi9saWIvbGFuZ1wiO1xuaW1wb3J0IHtFdmVudEVtaXR0ZXJDbGFzc30gZnJvbSBcIi4vbGliL2V2ZW50X2VtaXR0ZXJcIjtcbmltcG9ydCB7UmFuZ2V9IGZyb20gXCIuL3JhbmdlXCI7XG5pbXBvcnQge1JhbmdlTGlzdH0gZnJvbSBcIi4vcmFuZ2VfbGlzdFwiO1xuaW1wb3J0IHtFZGl0U2Vzc2lvbn0gZnJvbSBcIi4vZWRpdF9zZXNzaW9uXCI7XG5pbXBvcnQge0FuY2hvcn0gZnJvbSBcIi4vYW5jaG9yXCI7XG5cbi8qKlxuICogQ29udGFpbnMgdGhlIGN1cnNvciBwb3NpdGlvbiBhbmQgdGhlIHRleHQgc2VsZWN0aW9uIG9mIGFuIGVkaXQgc2Vzc2lvbi5cbiAqXG4gKiBUaGUgcm93L2NvbHVtbnMgdXNlZCBpbiB0aGUgc2VsZWN0aW9uIGFyZSBpbiBkb2N1bWVudCBjb29yZGluYXRlcyByZXByZXNlbnRpbmcgdGhzIGNvb3JkaW5hdGVzIGFzIHRoZXogYXBwZWFyIGluIHRoZSBkb2N1bWVudCBiZWZvcmUgYXBwbHlpbmcgc29mdCB3cmFwIGFuZCBmb2xkaW5nLlxuICogQGNsYXNzIFNlbGVjdGlvblxuICoqL1xuXG5cbi8qKlxuICogRW1pdHRlZCB3aGVuIHRoZSBjdXJzb3IgcG9zaXRpb24gY2hhbmdlcy5cbiAqIEBldmVudCBjaGFuZ2VDdXJzb3JcbiAqXG4qKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIHRoZSBjdXJzb3Igc2VsZWN0aW9uIGNoYW5nZXMuXG4gKiBcbiAqICBAZXZlbnQgY2hhbmdlU2VsZWN0aW9uXG4qKi9cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBgU2VsZWN0aW9uYCBvYmplY3QuXG4gKiBAcGFyYW0ge0VkaXRTZXNzaW9ufSBzZXNzaW9uIFRoZSBzZXNzaW9uIHRvIHVzZVxuICogXG4gKiBAY29uc3RydWN0b3JcbiAqKi9cbmV4cG9ydCBjbGFzcyBTZWxlY3Rpb24gZXh0ZW5kcyBFdmVudEVtaXR0ZXJDbGFzcyB7XG4gICAgcHJpdmF0ZSBzZXNzaW9uOiBFZGl0U2Vzc2lvbjtcbiAgICBwcml2YXRlIGRvYzogRG9jdW1lbnQ7XG4gICAgLy8gV2h5IGRvIHdlIHNlZW0gdG8gaGF2ZSBjb3BpZXM/XG4gICAgcHVibGljIGxlYWQ6IEFuY2hvcjtcbiAgICBwdWJsaWMgYW5jaG9yOiBBbmNob3I7XG4gICAgcHJpdmF0ZSBzZWxlY3Rpb25MZWFkOiBBbmNob3I7XG4gICAgcHJpdmF0ZSBzZWxlY3Rpb25BbmNob3I6IEFuY2hvcjtcbiAgICBwcml2YXRlICRpc0VtcHR5OiBib29sZWFuO1xuICAgIHByaXZhdGUgJGtlZXBEZXNpcmVkQ29sdW1uT25DaGFuZ2U6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkZGVzaXJlZENvbHVtbjsgIC8vIElzIHRoaXMgdXNlZCBhbnl3aGVyZT9cbiAgICBwcml2YXRlIHJhbmdlQ291bnQ7XG4gICAgcHVibGljIHJhbmdlcztcbiAgICBwdWJsaWMgcmFuZ2VMaXN0OiBSYW5nZUxpc3Q7XG4gICAgY29uc3RydWN0b3Ioc2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uID0gc2Vzc2lvbjtcbiAgICAgICAgdGhpcy5kb2MgPSBzZXNzaW9uLmdldERvY3VtZW50KCk7XG5cbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB0aGlzLmxlYWQgPSB0aGlzLnNlbGVjdGlvbkxlYWQgPSB0aGlzLmRvYy5jcmVhdGVBbmNob3IoMCwgMCk7XG4gICAgICAgIHRoaXMuYW5jaG9yID0gdGhpcy5zZWxlY3Rpb25BbmNob3IgPSB0aGlzLmRvYy5jcmVhdGVBbmNob3IoMCwgMCk7XG5cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLmxlYWQub24oXCJjaGFuZ2VcIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgc2VsZi5fZW1pdChcImNoYW5nZUN1cnNvclwiKTtcbiAgICAgICAgICAgIGlmICghc2VsZi4kaXNFbXB0eSlcbiAgICAgICAgICAgICAgICBzZWxmLl9lbWl0KFwiY2hhbmdlU2VsZWN0aW9uXCIpO1xuICAgICAgICAgICAgaWYgKCFzZWxmLiRrZWVwRGVzaXJlZENvbHVtbk9uQ2hhbmdlICYmIGUub2xkLmNvbHVtbiAhPSBlLnZhbHVlLmNvbHVtbilcbiAgICAgICAgICAgICAgICBzZWxmLiRkZXNpcmVkQ29sdW1uID0gbnVsbDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5zZWxlY3Rpb25BbmNob3Iub24oXCJjaGFuZ2VcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoIXNlbGYuJGlzRW1wdHkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9lbWl0KFwiY2hhbmdlU2VsZWN0aW9uXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBzZWxlY3Rpb24gaXMgZW1wdHkuXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICovXG4gICAgaXNFbXB0eSgpIHtcbiAgICAgICAgLy8gV2hhdCBpcyB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuICRpc0VtcHR5IGFuZCB3aGF0IHRoaXMgZnVuY3Rpb24gcmV0dXJucz9cbiAgICAgICAgcmV0dXJuICh0aGlzLiRpc0VtcHR5IHx8IChcbiAgICAgICAgICAgIHRoaXMuYW5jaG9yLnJvdyA9PSB0aGlzLmxlYWQucm93ICYmXG4gICAgICAgICAgICB0aGlzLmFuY2hvci5jb2x1bW4gPT0gdGhpcy5sZWFkLmNvbHVtblxuICAgICAgICApKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBzZWxlY3Rpb24gaXMgYSBtdWx0aS1saW5lLlxuICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgKiovXG4gICAgaXNNdWx0aUxpbmUoKSB7XG4gICAgICAgIGlmICh0aGlzLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0UmFuZ2UoKS5pc011bHRpTGluZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgYHJvd2AgYW5kIGBjb2x1bW5gIGN1cnJlbnQgcG9zaXRpb24gb2YgdGhlIGN1cnNvci5cbiAgICAqIEByZXR1cm5zIHtPYmplY3R9XG4gICAgKiovXG4gICAgZ2V0Q3Vyc29yKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sZWFkLmdldFBvc2l0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZXRzIHRoZSByb3cgYW5kIGNvbHVtbiBwb3NpdGlvbiBvZiB0aGUgYW5jaG9yLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlU2VsZWN0aW9uJ2AgZXZlbnQuXG4gICAgKiBAcGFyYW0ge251bWJlcn0gcm93IFRoZSBuZXcgcm93XG4gICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1uIFRoZSBuZXcgY29sdW1uXG4gICAgKiovXG4gICAgc2V0U2VsZWN0aW9uQW5jaG9yKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmFuY2hvci5zZXRQb3NpdGlvbihyb3csIGNvbHVtbik7XG5cbiAgICAgICAgaWYgKHRoaXMuJGlzRW1wdHkpIHtcbiAgICAgICAgICAgIHRoaXMuJGlzRW1wdHkgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VTZWxlY3Rpb25cIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGByb3dgIGFuZCBgY29sdW1uYCBvZiB0aGUgY2FsbGluZyBzZWxlY3Rpb24gYW5jaG9yLlxuICAgICpcbiAgICAqIEByZXR1cm5zIHtPYmplY3R9XG4gICAgKiBAcmVsYXRlZCBBbmNob3IuZ2V0UG9zaXRpb25cbiAgICAqKi9cbiAgICBnZXRTZWxlY3Rpb25BbmNob3IoKSB7XG4gICAgICAgIGlmICh0aGlzLiRpc0VtcHR5KVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U2VsZWN0aW9uTGVhZCgpXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFuY2hvci5nZXRQb3NpdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGByb3dgIGFuZCBgY29sdW1uYCBvZiB0aGUgY2FsbGluZyBzZWxlY3Rpb24gbGVhZC5cbiAgICAqIEByZXR1cm5zIHtPYmplY3R9XG4gICAgKiovXG4gICAgZ2V0U2VsZWN0aW9uTGVhZCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubGVhZC5nZXRQb3NpdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2hpZnRzIHRoZSBzZWxlY3Rpb24gdXAgKG9yIGRvd24sIGlmIFtbU2VsZWN0aW9uLmlzQmFja3dhcmRzIGBpc0JhY2t3YXJkcygpYF1dIGlzIHRydWUpIHRoZSBnaXZlbiBudW1iZXIgb2YgY29sdW1ucy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW5zIFRoZSBudW1iZXIgb2YgY29sdW1ucyB0byBzaGlmdCBieVxuICAgICpcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHNoaWZ0U2VsZWN0aW9uKGNvbHVtbnMpIHtcbiAgICAgICAgaWYgKHRoaXMuJGlzRW1wdHkpIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHRoaXMubGVhZC5yb3csIHRoaXMubGVhZC5jb2x1bW4gKyBjb2x1bW5zKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBhbmNob3IgPSB0aGlzLmdldFNlbGVjdGlvbkFuY2hvcigpO1xuICAgICAgICB2YXIgbGVhZCA9IHRoaXMuZ2V0U2VsZWN0aW9uTGVhZCgpO1xuXG4gICAgICAgIHZhciBpc0JhY2t3YXJkcyA9IHRoaXMuaXNCYWNrd2FyZHMoKTtcblxuICAgICAgICBpZiAoIWlzQmFja3dhcmRzIHx8IGFuY2hvci5jb2x1bW4gIT09IDApXG4gICAgICAgICAgICB0aGlzLnNldFNlbGVjdGlvbkFuY2hvcihhbmNob3Iucm93LCBhbmNob3IuY29sdW1uICsgY29sdW1ucyk7XG5cbiAgICAgICAgaWYgKGlzQmFja3dhcmRzIHx8IGxlYWQuY29sdW1uICE9PSAwKSB7XG4gICAgICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGxlYWQucm93LCBsZWFkLmNvbHVtbiArIGNvbHVtbnMpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBzZWxlY3Rpb24gaXMgZ29pbmcgYmFja3dhcmRzIGluIHRoZSBkb2N1bWVudC5cbiAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICoqL1xuICAgIGlzQmFja3dhcmRzKCkge1xuICAgICAgICB2YXIgYW5jaG9yID0gdGhpcy5hbmNob3I7XG4gICAgICAgIHZhciBsZWFkID0gdGhpcy5sZWFkO1xuICAgICAgICByZXR1cm4gKGFuY2hvci5yb3cgPiBsZWFkLnJvdyB8fCAoYW5jaG9yLnJvdyA9PSBsZWFkLnJvdyAmJiBhbmNob3IuY29sdW1uID4gbGVhZC5jb2x1bW4pKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFtSZXR1cm5zIHRoZSBbW1JhbmdlXV0gZm9yIHRoZSBzZWxlY3RlZCB0ZXh0Ll17OiAjU2VsZWN0aW9uLmdldFJhbmdlfVxuICAgICogQHJldHVybnMge1JhbmdlfVxuICAgICoqL1xuICAgIGdldFJhbmdlKCkge1xuICAgICAgICB2YXIgYW5jaG9yID0gdGhpcy5hbmNob3I7XG4gICAgICAgIHZhciBsZWFkID0gdGhpcy5sZWFkO1xuXG4gICAgICAgIGlmICh0aGlzLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHJldHVybiBSYW5nZS5mcm9tUG9pbnRzKGxlYWQsIGxlYWQpO1xuXG4gICAgICAgIGlmICh0aGlzLmlzQmFja3dhcmRzKCkpIHtcbiAgICAgICAgICAgIHJldHVybiBSYW5nZS5mcm9tUG9pbnRzKGxlYWQsIGFuY2hvcik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gUmFuZ2UuZnJvbVBvaW50cyhhbmNob3IsIGxlYWQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBbRW1wdGllcyB0aGUgc2VsZWN0aW9uIChieSBkZS1zZWxlY3RpbmcgaXQpLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlU2VsZWN0aW9uJ2AgZXZlbnQuXXs6ICNTZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb259XG4gICAgKiovXG4gICAgY2xlYXJTZWxlY3Rpb24oKSB7XG4gICAgICAgIGlmICghdGhpcy4kaXNFbXB0eSkge1xuICAgICAgICAgICAgdGhpcy4kaXNFbXB0eSA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLl9lbWl0KFwiY2hhbmdlU2VsZWN0aW9uXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZWxlY3RzIGFsbCB0aGUgdGV4dCBpbiB0aGUgZG9jdW1lbnQuXG4gICAgKiovXG4gICAgc2VsZWN0QWxsKCkge1xuICAgICAgICB2YXIgbGFzdFJvdyA9IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMTtcbiAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25BbmNob3IoMCwgMCk7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGxhc3RSb3csIHRoaXMuZG9jLmdldExpbmUobGFzdFJvdykubGVuZ3RoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNldHMgdGhlIHNlbGVjdGlvbiB0byB0aGUgcHJvdmlkZWQgcmFuZ2UuXG4gICAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBUaGUgcmFuZ2Ugb2YgdGV4dCB0byBzZWxlY3RcbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gcmV2ZXJzZSBJbmRpY2F0ZXMgaWYgdGhlIHJhbmdlIHNob3VsZCBnbyBiYWNrd2FyZHMgKGB0cnVlYCkgb3Igbm90XG4gICAgKlxuICAgICpcbiAgICAqIEBtZXRob2Qgc2V0U2VsZWN0aW9uUmFuZ2VcbiAgICAqIEBhbGlhcyBzZXRSYW5nZVxuICAgICoqL1xuICAgIHNldFJhbmdlKHJhbmdlLCByZXZlcnNlPzogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldFNlbGVjdGlvblJhbmdlKHJhbmdlLCByZXZlcnNlKTtcbiAgICB9XG4gICAgc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2U6IHsgc3RhcnQ6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07IGVuZDogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB9LCByZXZlcnNlPzogYm9vbGVhbikge1xuICAgICAgICBpZiAocmV2ZXJzZSkge1xuICAgICAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25BbmNob3IocmFuZ2UuZW5kLnJvdywgcmFuZ2UuZW5kLmNvbHVtbik7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdFRvKHJhbmdlLnN0YXJ0LnJvdywgcmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uQW5jaG9yKHJhbmdlLnN0YXJ0LnJvdywgcmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0VG8ocmFuZ2UuZW5kLnJvdywgcmFuZ2UuZW5kLmNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuZ2V0UmFuZ2UoKS5pc0VtcHR5KCkpXG4gICAgICAgICAgICB0aGlzLiRpc0VtcHR5ID0gdHJ1ZTtcbiAgICAgICAgdGhpcy4kZGVzaXJlZENvbHVtbiA9IG51bGw7XG4gICAgfVxuXG4gICAgJG1vdmVTZWxlY3Rpb24obW92ZXIpIHtcbiAgICAgICAgdmFyIGxlYWQgPSB0aGlzLmxlYWQ7XG4gICAgICAgIGlmICh0aGlzLiRpc0VtcHR5KVxuICAgICAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25BbmNob3IobGVhZC5yb3csIGxlYWQuY29sdW1uKTtcblxuICAgICAgICBtb3Zlci5jYWxsKHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiBjdXJzb3IgdG8gdGhlIGluZGljYXRlZCByb3cgYW5kIGNvbHVtbi5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBzZWxlY3QgdG9cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGNvbHVtbiB0byBzZWxlY3QgdG9cbiAgICAqXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBzZWxlY3RUbyhyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgY29sdW1uKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIGN1cnNvciB0byB0aGUgcm93IGFuZCBjb2x1bW4gaW5kaWNhdGVkIGJ5IGBwb3NgLlxuICAgICogQHBhcmFtIHtPYmplY3R9IHBvcyBBbiBvYmplY3QgY29udGFpbmluZyB0aGUgcm93IGFuZCBjb2x1bW5cbiAgICAqXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBzZWxlY3RUb1Bvc2l0aW9uKHBvcykge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihwb3MpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gY3Vyc29yIHRvIHRoZSBpbmRpY2F0ZWQgcm93IGFuZCBjb2x1bW4uXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gc2VsZWN0IHRvXG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gdG8gc2VsZWN0IHRvXG4gICAgKlxuICAgICoqL1xuICAgIG1vdmVUbyhyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIGN1cnNvciB0byB0aGUgcm93IGFuZCBjb2x1bW4gaW5kaWNhdGVkIGJ5IGBwb3NgLlxuICAgICogQHBhcmFtIHtPYmplY3R9IHBvcyBBbiBvYmplY3QgY29udGFpbmluZyB0aGUgcm93IGFuZCBjb2x1bW5cbiAgICAqKi9cbiAgICBtb3ZlVG9Qb3NpdGlvbihwb3MpIHtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKHBvcyk7XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHVwIG9uZSByb3cuXG4gICAgKiovXG4gICAgc2VsZWN0VXAoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yVXApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gZG93biBvbmUgcm93LlxuICAgICoqL1xuICAgIHNlbGVjdERvd24oKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yRG93bik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gcmlnaHQgb25lIGNvbHVtbi5cbiAgICAqKi9cbiAgICBzZWxlY3RSaWdodCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JSaWdodCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiBsZWZ0IG9uZSBjb2x1bW4uXG4gICAgKiovXG4gICAgc2VsZWN0TGVmdCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JMZWZ0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBiZWdpbm5pbmcgb2YgdGhlIGN1cnJlbnQgbGluZS5cbiAgICAqKi9cbiAgICBzZWxlY3RMaW5lU3RhcnQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yTGluZVN0YXJ0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBlbmQgb2YgdGhlIGN1cnJlbnQgbGluZS5cbiAgICAqKi9cbiAgICBzZWxlY3RMaW5lRW5kKCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvckxpbmVFbmQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIGVuZCBvZiB0aGUgZmlsZS5cbiAgICAqKi9cbiAgICBzZWxlY3RGaWxlRW5kKCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvckZpbGVFbmQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIHN0YXJ0IG9mIHRoZSBmaWxlLlxuICAgICoqL1xuICAgIHNlbGVjdEZpbGVTdGFydCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JGaWxlU3RhcnQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIGZpcnN0IHdvcmQgb24gdGhlIHJpZ2h0LlxuICAgICoqL1xuICAgIHNlbGVjdFdvcmRSaWdodCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JXb3JkUmlnaHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIGZpcnN0IHdvcmQgb24gdGhlIGxlZnQuXG4gICAgKiovXG4gICAgc2VsZWN0V29yZExlZnQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yV29yZExlZnQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB0byBoaWdobGlnaHQgdGhlIGVudGlyZSB3b3JkLlxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZ2V0V29yZFJhbmdlXG4gICAgKiovXG4gICAgZ2V0V29yZFJhbmdlKHJvdz8sIGNvbHVtbj8pIHtcbiAgICAgICAgaWYgKHR5cGVvZiBjb2x1bW4gPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgdmFyIGN1cnNvciA9IHJvdyB8fCB0aGlzLmxlYWQ7XG4gICAgICAgICAgICByb3cgPSBjdXJzb3Iucm93O1xuICAgICAgICAgICAgY29sdW1uID0gY3Vyc29yLmNvbHVtbjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFdvcmRSYW5nZShyb3csIGNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogU2VsZWN0cyBhbiBlbnRpcmUgd29yZCBib3VuZGFyeS5cbiAgICAqKi9cbiAgICBzZWxlY3RXb3JkKCkge1xuICAgICAgICB0aGlzLnNldFNlbGVjdGlvblJhbmdlKHRoaXMuZ2V0V29yZFJhbmdlKCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2VsZWN0cyBhIHdvcmQsIGluY2x1ZGluZyBpdHMgcmlnaHQgd2hpdGVzcGFjZS5cbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmdldEFXb3JkUmFuZ2VcbiAgICAqKi9cbiAgICBzZWxlY3RBV29yZCgpIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yKCk7XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuc2Vzc2lvbi5nZXRBV29yZFJhbmdlKGN1cnNvci5yb3csIGN1cnNvci5jb2x1bW4pO1xuICAgICAgICB0aGlzLnNldFNlbGVjdGlvblJhbmdlKHJhbmdlKTtcbiAgICB9XG5cbiAgICBnZXRMaW5lUmFuZ2Uocm93PzogbnVtYmVyLCBleGNsdWRlTGFzdENoYXI/OiBib29sZWFuKTogUmFuZ2Uge1xuICAgICAgICB2YXIgcm93U3RhcnQgPSB0eXBlb2Ygcm93ID09IFwibnVtYmVyXCIgPyByb3cgOiB0aGlzLmxlYWQucm93O1xuICAgICAgICB2YXIgcm93RW5kO1xuXG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkTGluZShyb3dTdGFydCk7XG4gICAgICAgIGlmIChmb2xkTGluZSkge1xuICAgICAgICAgICAgcm93U3RhcnQgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgICAgICByb3dFbmQgPSBmb2xkTGluZS5lbmQucm93O1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcm93RW5kID0gcm93U3RhcnQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZXhjbHVkZUxhc3RDaGFyKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFJhbmdlKHJvd1N0YXJ0LCAwLCByb3dFbmQsIHRoaXMuc2Vzc2lvbi5nZXRMaW5lKHJvd0VuZCkubGVuZ3RoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUmFuZ2Uocm93U3RhcnQsIDAsIHJvd0VuZCArIDEsIDApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZWxlY3RzIHRoZSBlbnRpcmUgbGluZS5cbiAgICAqKi9cbiAgICBzZWxlY3RMaW5lKCkge1xuICAgICAgICB0aGlzLnNldFNlbGVjdGlvblJhbmdlKHRoaXMuZ2V0TGluZVJhbmdlKCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdXAgb25lIHJvdy5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yVXAoKSB7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvckJ5KC0xLCAwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIGRvd24gb25lIHJvdy5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yRG93bigpIHtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yQnkoMSwgMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciBsZWZ0IG9uZSBjb2x1bW4uXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckxlZnQoKSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmxlYWQuZ2V0UG9zaXRpb24oKSxcbiAgICAgICAgICAgIGZvbGQ7XG5cbiAgICAgICAgaWYgKGZvbGQgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZEF0KGN1cnNvci5yb3csIGN1cnNvci5jb2x1bW4sIC0xKSkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8oZm9sZC5zdGFydC5yb3csIGZvbGQuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgfSBlbHNlIGlmIChjdXJzb3IuY29sdW1uID09PSAwKSB7XG4gICAgICAgICAgICAvLyBjdXJzb3IgaXMgYSBsaW5lIChzdGFydFxuICAgICAgICAgICAgaWYgKGN1cnNvci5yb3cgPiAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8oY3Vyc29yLnJvdyAtIDEsIHRoaXMuZG9jLmdldExpbmUoY3Vyc29yLnJvdyAtIDEpLmxlbmd0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgdGFiU2l6ZSA9IHRoaXMuc2Vzc2lvbi5nZXRUYWJTaXplKCk7XG4gICAgICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmlzVGFiU3RvcChjdXJzb3IpICYmIHRoaXMuZG9jLmdldExpbmUoY3Vyc29yLnJvdykuc2xpY2UoY3Vyc29yLmNvbHVtbiAtIHRhYlNpemUsIGN1cnNvci5jb2x1bW4pLnNwbGl0KFwiIFwiKS5sZW5ndGggLSAxID09IHRhYlNpemUpXG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yQnkoMCwgLXRhYlNpemUpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckJ5KDAsIC0xKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgcmlnaHQgb25lIGNvbHVtbi5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yUmlnaHQoKSB7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLmxlYWQuZ2V0UG9zaXRpb24oKTtcbiAgICAgICAgdmFyIGZvbGQgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZEF0KHBvcy5yb3csIHBvcy5jb2x1bW4sIDEpO1xuICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8oZm9sZC5lbmQucm93LCBmb2xkLmVuZC5jb2x1bW4pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHRoaXMubGVhZC5jb2x1bW4gPT0gdGhpcy5kb2MuZ2V0TGluZSh0aGlzLmxlYWQucm93KS5sZW5ndGgpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmxlYWQucm93IDwgdGhpcy5kb2MuZ2V0TGVuZ3RoKCkgLSAxKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8odGhpcy5sZWFkLnJvdyArIDEsIDApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHRhYlNpemUgPSB0aGlzLnNlc3Npb24uZ2V0VGFiU2l6ZSgpO1xuICAgICAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMubGVhZDtcbiAgICAgICAgICAgIGlmICh0aGlzLnNlc3Npb24uaXNUYWJTdG9wKGN1cnNvcikgJiYgdGhpcy5kb2MuZ2V0TGluZShjdXJzb3Iucm93KS5zbGljZShjdXJzb3IuY29sdW1uLCBjdXJzb3IuY29sdW1uICsgdGFiU2l6ZSkuc3BsaXQoXCIgXCIpLmxlbmd0aCAtIDEgPT0gdGFiU2l6ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckJ5KDAsIHRhYlNpemUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yQnkoMCwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzdGFydCBvZiB0aGUgbGluZS5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yTGluZVN0YXJ0KCkge1xuICAgICAgICB2YXIgcm93ID0gdGhpcy5sZWFkLnJvdztcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMubGVhZC5jb2x1bW47XG4gICAgICAgIHZhciBzY3JlZW5Sb3cgPSB0aGlzLnNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblJvdyhyb3csIGNvbHVtbik7XG5cbiAgICAgICAgLy8gRGV0ZXJtIHRoZSBkb2MtcG9zaXRpb24gb2YgdGhlIGZpcnN0IGNoYXJhY3RlciBhdCB0aGUgc2NyZWVuIGxpbmUuXG4gICAgICAgIHZhciBmaXJzdENvbHVtblBvc2l0aW9uID0gdGhpcy5zZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIDApO1xuXG4gICAgICAgIC8vIERldGVybSB0aGUgbGluZVxuICAgICAgICAvLyBIb3cgZG9lcyBnZXREaXNwbGF5TGluZSBnZXQgZnJvbSBmb2xkaW5nIG9udG8gc2Vzc2lvbj9cbiAgICAgICAgdmFyIGJlZm9yZUN1cnNvciA9IHRoaXMuc2Vzc2lvblsnZ2V0RGlzcGxheUxpbmUnXShcbiAgICAgICAgICAgIHJvdywgbnVsbCwgZmlyc3RDb2x1bW5Qb3NpdGlvbi5yb3csXG4gICAgICAgICAgICBmaXJzdENvbHVtblBvc2l0aW9uLmNvbHVtblxuICAgICAgICApO1xuXG4gICAgICAgIHZhciBsZWFkaW5nU3BhY2UgPSBiZWZvcmVDdXJzb3IubWF0Y2goL15cXHMqLyk7XG4gICAgICAgIC8vIFRPRE8gZmluZCBiZXR0ZXIgd2F5IGZvciBlbWFjcyBtb2RlIHRvIG92ZXJyaWRlIHNlbGVjdGlvbiBiZWhhdmlvcnNcbiAgICAgICAgaWYgKGxlYWRpbmdTcGFjZVswXS5sZW5ndGggIT0gY29sdW1uICYmICF0aGlzLnNlc3Npb25bJyR1c2VFbWFjc1N0eWxlTGluZVN0YXJ0J10pXG4gICAgICAgICAgICBmaXJzdENvbHVtblBvc2l0aW9uLmNvbHVtbiArPSBsZWFkaW5nU3BhY2VbMF0ubGVuZ3RoO1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKGZpcnN0Q29sdW1uUG9zaXRpb24pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIGVuZCBvZiB0aGUgbGluZS5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yTGluZUVuZCgpIHtcbiAgICAgICAgdmFyIGxlYWQgPSB0aGlzLmxlYWQ7XG4gICAgICAgIHZhciBsaW5lRW5kID0gdGhpcy5zZXNzaW9uLmdldERvY3VtZW50TGFzdFJvd0NvbHVtblBvc2l0aW9uKGxlYWQucm93LCBsZWFkLmNvbHVtbik7XG4gICAgICAgIGlmICh0aGlzLmxlYWQuY29sdW1uID09IGxpbmVFbmQuY29sdW1uKSB7XG4gICAgICAgICAgICB2YXIgbGluZSA9IHRoaXMuc2Vzc2lvbi5nZXRMaW5lKGxpbmVFbmQucm93KTtcbiAgICAgICAgICAgIGlmIChsaW5lRW5kLmNvbHVtbiA9PSBsaW5lLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHZhciB0ZXh0RW5kID0gbGluZS5zZWFyY2goL1xccyskLyk7XG4gICAgICAgICAgICAgICAgaWYgKHRleHRFbmQgPiAwKVxuICAgICAgICAgICAgICAgICAgICBsaW5lRW5kLmNvbHVtbiA9IHRleHRFbmQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhsaW5lRW5kLnJvdywgbGluZUVuZC5jb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIGVuZCBvZiB0aGUgZmlsZS5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yRmlsZUVuZCgpIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMTtcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMuZG9jLmdldExpbmUocm93KS5sZW5ndGg7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzdGFydCBvZiB0aGUgZmlsZS5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yRmlsZVN0YXJ0KCkge1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbygwLCAwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSB3b3JkIG9uIHRoZSByaWdodC5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yTG9uZ1dvcmRSaWdodCgpIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMubGVhZC5yb3c7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLmxlYWQuY29sdW1uO1xuICAgICAgICB2YXIgbGluZSA9IHRoaXMuZG9jLmdldExpbmUocm93KTtcbiAgICAgICAgdmFyIHJpZ2h0T2ZDdXJzb3IgPSBsaW5lLnN1YnN0cmluZyhjb2x1bW4pO1xuXG4gICAgICAgIHZhciBtYXRjaDtcbiAgICAgICAgdGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4ID0gMDtcblxuICAgICAgICAvLyBza2lwIGZvbGRzXG4gICAgICAgIHZhciBmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChyb3csIGNvbHVtbiwgMSk7XG4gICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhmb2xkLmVuZC5yb3csIGZvbGQuZW5kLmNvbHVtbik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBmaXJzdCBza2lwIHNwYWNlXG4gICAgICAgIGlmIChtYXRjaCA9IHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmV4ZWMocmlnaHRPZkN1cnNvcikpIHtcbiAgICAgICAgICAgIGNvbHVtbiArPSB0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5sYXN0SW5kZXg7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICAgICAgcmlnaHRPZkN1cnNvciA9IGxpbmUuc3Vic3RyaW5nKGNvbHVtbik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpZiBhdCBsaW5lIGVuZCBwcm9jZWVkIHdpdGggbmV4dCBsaW5lXG4gICAgICAgIGlmIChjb2x1bW4gPj0gbGluZS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgbGluZS5sZW5ndGgpO1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yUmlnaHQoKTtcbiAgICAgICAgICAgIGlmIChyb3cgPCB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDEpXG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yV29yZFJpZ2h0KCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBhZHZhbmNlIHRvIHRoZSBlbmQgb2YgdGhlIG5leHQgdG9rZW5cbiAgICAgICAgaWYgKG1hdGNoID0gdGhpcy5zZXNzaW9uLnRva2VuUmUuZXhlYyhyaWdodE9mQ3Vyc29yKSkge1xuICAgICAgICAgICAgY29sdW1uICs9IHRoaXMuc2Vzc2lvbi50b2tlblJlLmxhc3RJbmRleDtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi50b2tlblJlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgd29yZCBvbiB0aGUgbGVmdC5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yTG9uZ1dvcmRMZWZ0KCkge1xuICAgICAgICB2YXIgcm93ID0gdGhpcy5sZWFkLnJvdztcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMubGVhZC5jb2x1bW47XG5cbiAgICAgICAgLy8gc2tpcCBmb2xkc1xuICAgICAgICB2YXIgZm9sZDtcbiAgICAgICAgaWYgKGZvbGQgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZEF0KHJvdywgY29sdW1uLCAtMSkpIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGZvbGQuc3RhcnQucm93LCBmb2xkLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBIb3cgZG9lcyB0aGlzIGdldCBmcm9tIHRoZSBmb2xkaW5nIGFkYXB0ZXIgb250byB0aGUgc2Vzc2lvbj9cbiAgICAgICAgdmFyIHN0ciA9IHRoaXMuc2Vzc2lvblsnZ2V0Rm9sZFN0cmluZ0F0J10ocm93LCBjb2x1bW4sIC0xKTtcbiAgICAgICAgaWYgKHN0ciA9PSBudWxsKSB7XG4gICAgICAgICAgICBzdHIgPSB0aGlzLmRvYy5nZXRMaW5lKHJvdykuc3Vic3RyaW5nKDAsIGNvbHVtbilcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBsZWZ0T2ZDdXJzb3IgPSBzdHJpbmdSZXZlcnNlKHN0cik7XG4gICAgICAgIHZhciBtYXRjaDtcbiAgICAgICAgdGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4ID0gMDtcblxuICAgICAgICAvLyBza2lwIHdoaXRlc3BhY2VcbiAgICAgICAgaWYgKG1hdGNoID0gdGhpcy5zZXNzaW9uLm5vblRva2VuUmUuZXhlYyhsZWZ0T2ZDdXJzb3IpKSB7XG4gICAgICAgICAgICBjb2x1bW4gLT0gdGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4O1xuICAgICAgICAgICAgbGVmdE9mQ3Vyc29yID0gbGVmdE9mQ3Vyc29yLnNsaWNlKHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmxhc3RJbmRleCk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgYXQgYmVnaW4gb2YgdGhlIGxpbmUgcHJvY2VlZCBpbiBsaW5lIGFib3ZlXG4gICAgICAgIGlmIChjb2x1bW4gPD0gMCkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCAwKTtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckxlZnQoKTtcbiAgICAgICAgICAgIGlmIChyb3cgPiAwKVxuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvcldvcmRMZWZ0KCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBtb3ZlIHRvIHRoZSBiZWdpbiBvZiB0aGUgd29yZFxuICAgICAgICBpZiAobWF0Y2ggPSB0aGlzLnNlc3Npb24udG9rZW5SZS5leGVjKGxlZnRPZkN1cnNvcikpIHtcbiAgICAgICAgICAgIGNvbHVtbiAtPSB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXg7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4pO1xuICAgIH1cblxuICAgICRzaG9ydFdvcmRFbmRJbmRleChyaWdodE9mQ3Vyc29yKSB7XG4gICAgICAgIHZhciBtYXRjaCwgaW5kZXggPSAwLCBjaDtcbiAgICAgICAgdmFyIHdoaXRlc3BhY2VSZSA9IC9cXHMvO1xuICAgICAgICB2YXIgdG9rZW5SZSA9IHRoaXMuc2Vzc2lvbi50b2tlblJlO1xuXG4gICAgICAgIHRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgaWYgKG1hdGNoID0gdGhpcy5zZXNzaW9uLnRva2VuUmUuZXhlYyhyaWdodE9mQ3Vyc29yKSkge1xuICAgICAgICAgICAgaW5kZXggPSB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXg7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB3aGlsZSAoKGNoID0gcmlnaHRPZkN1cnNvcltpbmRleF0pICYmIHdoaXRlc3BhY2VSZS50ZXN0KGNoKSlcbiAgICAgICAgICAgICAgICBpbmRleCsrO1xuXG4gICAgICAgICAgICBpZiAoaW5kZXggPCAxKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICAgICAgICAgIHdoaWxlICgoY2ggPSByaWdodE9mQ3Vyc29yW2luZGV4XSkgJiYgIXRva2VuUmUudGVzdChjaCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICAgICAgICAgICAgICBpbmRleCsrO1xuICAgICAgICAgICAgICAgICAgICBpZiAod2hpdGVzcGFjZVJlLnRlc3QoY2gpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPiAyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5kZXgtLVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aGlsZSAoKGNoID0gcmlnaHRPZkN1cnNvcltpbmRleF0pICYmIHdoaXRlc3BhY2VSZS50ZXN0KGNoKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5kZXgrKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPiAyKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRva2VuUmUubGFzdEluZGV4ID0gMDtcblxuICAgICAgICByZXR1cm4gaW5kZXg7XG4gICAgfVxuXG4gICAgbW92ZUN1cnNvclNob3J0V29yZFJpZ2h0KCkge1xuICAgICAgICB2YXIgcm93ID0gdGhpcy5sZWFkLnJvdztcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMubGVhZC5jb2x1bW47XG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5kb2MuZ2V0TGluZShyb3cpO1xuICAgICAgICB2YXIgcmlnaHRPZkN1cnNvciA9IGxpbmUuc3Vic3RyaW5nKGNvbHVtbik7XG5cbiAgICAgICAgdmFyIGZvbGQgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZEF0KHJvdywgY29sdW1uLCAxKTtcbiAgICAgICAgaWYgKGZvbGQpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5tb3ZlQ3Vyc29yVG8oZm9sZC5lbmQucm93LCBmb2xkLmVuZC5jb2x1bW4pO1xuXG4gICAgICAgIGlmIChjb2x1bW4gPT0gbGluZS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHZhciBsID0gdGhpcy5kb2MuZ2V0TGVuZ3RoKCk7XG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgcm93Kys7XG4gICAgICAgICAgICAgICAgcmlnaHRPZkN1cnNvciA9IHRoaXMuZG9jLmdldExpbmUocm93KVxuICAgICAgICAgICAgfSB3aGlsZSAocm93IDwgbCAmJiAvXlxccyokLy50ZXN0KHJpZ2h0T2ZDdXJzb3IpKVxuXG4gICAgICAgICAgICBpZiAoIS9eXFxzKy8udGVzdChyaWdodE9mQ3Vyc29yKSlcbiAgICAgICAgICAgICAgICByaWdodE9mQ3Vyc29yID0gXCJcIlxuICAgICAgICAgICAgY29sdW1uID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpbmRleCA9IHRoaXMuJHNob3J0V29yZEVuZEluZGV4KHJpZ2h0T2ZDdXJzb3IpO1xuXG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgY29sdW1uICsgaW5kZXgpO1xuICAgIH1cblxuICAgIG1vdmVDdXJzb3JTaG9ydFdvcmRMZWZ0KCkge1xuICAgICAgICB2YXIgcm93ID0gdGhpcy5sZWFkLnJvdztcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMubGVhZC5jb2x1bW47XG5cbiAgICAgICAgdmFyIGZvbGQ7XG4gICAgICAgIGlmIChmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChyb3csIGNvbHVtbiwgLTEpKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMubW92ZUN1cnNvclRvKGZvbGQuc3RhcnQucm93LCBmb2xkLnN0YXJ0LmNvbHVtbik7XG5cbiAgICAgICAgdmFyIGxpbmUgPSB0aGlzLnNlc3Npb24uZ2V0TGluZShyb3cpLnN1YnN0cmluZygwLCBjb2x1bW4pO1xuICAgICAgICBpZiAoY29sdW1uID09IDApIHtcbiAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICByb3ctLTtcbiAgICAgICAgICAgICAgICBsaW5lID0gdGhpcy5kb2MuZ2V0TGluZShyb3cpO1xuICAgICAgICAgICAgfSB3aGlsZSAocm93ID4gMCAmJiAvXlxccyokLy50ZXN0KGxpbmUpKVxuXG4gICAgICAgICAgICBjb2x1bW4gPSBsaW5lLmxlbmd0aDtcbiAgICAgICAgICAgIGlmICghL1xccyskLy50ZXN0KGxpbmUpKVxuICAgICAgICAgICAgICAgIGxpbmUgPSBcIlwiXG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGVmdE9mQ3Vyc29yID0gc3RyaW5nUmV2ZXJzZShsaW5lKTtcbiAgICAgICAgdmFyIGluZGV4ID0gdGhpcy4kc2hvcnRXb3JkRW5kSW5kZXgobGVmdE9mQ3Vyc29yKTtcblxuICAgICAgICByZXR1cm4gdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4gLSBpbmRleCk7XG4gICAgfVxuXG4gICAgbW92ZUN1cnNvcldvcmRSaWdodCgpIHtcbiAgICAgICAgLy8gU2VlIGtleWJvYXJkL2VtYWNzLmpzXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb25bJyRzZWxlY3RMb25nV29yZHMnXSkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yTG9uZ1dvcmRSaWdodCgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yU2hvcnRXb3JkUmlnaHQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIG1vdmVDdXJzb3JXb3JkTGVmdCgpIHtcbiAgICAgICAgLy8gU2VlIGtleWJvYXJkL2VtYWNzLmpzXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb25bJyRzZWxlY3RMb25nV29yZHMnXSkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yTG9uZ1dvcmRMZWZ0KCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JTaG9ydFdvcmRMZWZ0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gcG9zaXRpb24gaW5kaWNhdGVkIGJ5IHRoZSBwYXJhbWV0ZXJzLiBOZWdhdGl2ZSBudW1iZXJzIG1vdmUgdGhlIGN1cnNvciBiYWNrd2FyZHMgaW4gdGhlIGRvY3VtZW50LlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvd3MgVGhlIG51bWJlciBvZiByb3dzIHRvIG1vdmUgYnlcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjaGFycyBUaGUgbnVtYmVyIG9mIGNoYXJhY3RlcnMgdG8gbW92ZSBieVxuICAgICpcbiAgICAqXG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb25cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yQnkocm93cywgY2hhcnMpIHtcbiAgICAgICAgdmFyIHNjcmVlblBvcyA9IHRoaXMuc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oXG4gICAgICAgICAgICB0aGlzLmxlYWQucm93LFxuICAgICAgICAgICAgdGhpcy5sZWFkLmNvbHVtblxuICAgICAgICApO1xuXG4gICAgICAgIGlmIChjaGFycyA9PT0gMCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJGRlc2lyZWRDb2x1bW4pXG4gICAgICAgICAgICAgICAgc2NyZWVuUG9zLmNvbHVtbiA9IHRoaXMuJGRlc2lyZWRDb2x1bW47XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy4kZGVzaXJlZENvbHVtbiA9IHNjcmVlblBvcy5jb2x1bW47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZG9jUG9zID0gdGhpcy5zZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Qb3Mucm93ICsgcm93cywgc2NyZWVuUG9zLmNvbHVtbik7XG5cbiAgICAgICAgaWYgKHJvd3MgIT09IDAgJiYgY2hhcnMgPT09IDAgJiYgZG9jUG9zLnJvdyA9PT0gdGhpcy5sZWFkLnJvdyAmJiBkb2NQb3MuY29sdW1uID09PSB0aGlzLmxlYWQuY29sdW1uKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmxpbmVXaWRnZXRzICYmIHRoaXMuc2Vzc2lvbi5saW5lV2lkZ2V0c1tkb2NQb3Mucm93XSlcbiAgICAgICAgICAgICAgICBkb2NQb3Mucm93Kys7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBtb3ZlIHRoZSBjdXJzb3IgYW5kIHVwZGF0ZSB0aGUgZGVzaXJlZCBjb2x1bW5cbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8oZG9jUG9zLnJvdywgZG9jUG9zLmNvbHVtbiArIGNoYXJzLCBjaGFycyA9PT0gMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBwb3NpdGlvbiBpbmRpY2F0ZWQgYnkgaXRzIGByb3dgIGFuZCBgY29sdW1uYC5cbiAgICAqIEBwYXJhbSB7T2JqZWN0fSBwb3NpdGlvbiBUaGUgcG9zaXRpb24gdG8gbW92ZSB0b1xuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgbW92ZUN1cnNvclRvUG9zaXRpb24ocG9zaXRpb24pIHtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocG9zaXRpb24ucm93LCBwb3NpdGlvbi5jb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgcm93IGFuZCBjb2x1bW4gcHJvdmlkZWQuIFtJZiBgcHJldmVudFVwZGF0ZURlc2lyZWRDb2x1bW5gIGlzIGB0cnVlYCwgdGhlbiB0aGUgY3Vyc29yIHN0YXlzIGluIHRoZSBzYW1lIGNvbHVtbiBwb3NpdGlvbiBhcyBpdHMgb3JpZ2luYWwgcG9pbnQuXXs6ICNwcmV2ZW50VXBkYXRlQm9vbERlc2N9XG4gICAgKiBAcGFyYW0ge251bWJlcn0gcm93IFRoZSByb3cgdG8gbW92ZSB0b1xuICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIHRvIG1vdmUgdG9cbiAgICAqIEBwYXJhbSB7Ym9vbGVhbn0ga2VlcERlc2lyZWRDb2x1bW4gW0lmIGB0cnVlYCwgdGhlIGN1cnNvciBtb3ZlIGRvZXMgbm90IHJlc3BlY3QgdGhlIHByZXZpb3VzIGNvbHVtbl17OiAjcHJldmVudFVwZGF0ZUJvb2x9XG4gICAgKi9cbiAgICBtb3ZlQ3Vyc29yVG8ocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBrZWVwRGVzaXJlZENvbHVtbj86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgLy8gRW5zdXJlIHRoZSByb3cvY29sdW1uIGlzIG5vdCBpbnNpZGUgb2YgYSBmb2xkLlxuICAgICAgICB2YXIgZm9sZCA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkQXQocm93LCBjb2x1bW4sIDEpO1xuICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgcm93ID0gZm9sZC5zdGFydC5yb3c7XG4gICAgICAgICAgICBjb2x1bW4gPSBmb2xkLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJGtlZXBEZXNpcmVkQ29sdW1uT25DaGFuZ2UgPSB0cnVlO1xuICAgICAgICB0aGlzLmxlYWQuc2V0UG9zaXRpb24ocm93LCBjb2x1bW4pO1xuICAgICAgICB0aGlzLiRrZWVwRGVzaXJlZENvbHVtbk9uQ2hhbmdlID0gZmFsc2U7XG5cbiAgICAgICAgaWYgKCFrZWVwRGVzaXJlZENvbHVtbilcbiAgICAgICAgICAgIHRoaXMuJGRlc2lyZWRDb2x1bW4gPSBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc2NyZWVuIHBvc2l0aW9uIGluZGljYXRlZCBieSByb3cgYW5kIGNvbHVtbi4gezpwcmV2ZW50VXBkYXRlQm9vbERlc2N9XG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gbW92ZSB0b1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIHRvIG1vdmUgdG9cbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0ga2VlcERlc2lyZWRDb2x1bW4gezpwcmV2ZW50VXBkYXRlQm9vbH1cbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JUb1NjcmVlbihyb3csIGNvbHVtbiwga2VlcERlc2lyZWRDb2x1bW4pIHtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuc2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24ocm93LCBjb2x1bW4pO1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhwb3Mucm93LCBwb3MuY29sdW1uLCBrZWVwRGVzaXJlZENvbHVtbik7XG4gICAgfVxuXG4gICAgLy8gcmVtb3ZlIGxpc3RlbmVycyBmcm9tIGRvY3VtZW50XG4gICAgZGV0YWNoKCkge1xuICAgICAgICB0aGlzLmxlYWQuZGV0YWNoKCk7XG4gICAgICAgIHRoaXMuYW5jaG9yLmRldGFjaCgpO1xuICAgICAgICB0aGlzLnNlc3Npb24gPSB0aGlzLmRvYyA9IG51bGw7XG4gICAgfVxuXG4gICAgZnJvbU9yaWVudGVkUmFuZ2UocmFuZ2UpIHtcbiAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSwgcmFuZ2UuY3Vyc29yID09IHJhbmdlLnN0YXJ0KTtcbiAgICAgICAgdGhpcy4kZGVzaXJlZENvbHVtbiA9IHJhbmdlLmRlc2lyZWRDb2x1bW4gfHwgdGhpcy4kZGVzaXJlZENvbHVtbjtcbiAgICB9XG5cbiAgICB0b09yaWVudGVkUmFuZ2UocmFuZ2U/KSB7XG4gICAgICAgIHZhciByID0gdGhpcy5nZXRSYW5nZSgpO1xuICAgICAgICBpZiAocmFuZ2UpIHtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbiA9IHIuc3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQucm93ID0gci5zdGFydC5yb3c7XG4gICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uID0gci5lbmQuY29sdW1uO1xuICAgICAgICAgICAgcmFuZ2UuZW5kLnJvdyA9IHIuZW5kLnJvdztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJhbmdlID0gcjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJhbmdlLmN1cnNvciA9IHRoaXMuaXNCYWNrd2FyZHMoKSA/IHJhbmdlLnN0YXJ0IDogcmFuZ2UuZW5kO1xuICAgICAgICByYW5nZS5kZXNpcmVkQ29sdW1uID0gdGhpcy4kZGVzaXJlZENvbHVtbjtcbiAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2F2ZXMgdGhlIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uIGFuZCBjYWxscyBgZnVuY2AgdGhhdCBjYW4gY2hhbmdlIHRoZSBjdXJzb3JcbiAgICAqIHBvc3Rpb24uIFRoZSByZXN1bHQgaXMgdGhlIHJhbmdlIG9mIHRoZSBzdGFydGluZyBhbmQgZXZlbnR1YWwgY3Vyc29yIHBvc2l0aW9uLlxuICAgICogV2lsbCByZXNldCB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuICAgICogQHBhcmFtIHtGdW5jdGlvbn0gVGhlIGNhbGxiYWNrIHRoYXQgc2hvdWxkIGNoYW5nZSB0aGUgY3Vyc29yIHBvc2l0aW9uXG4gICAgKiBAcmV0dXJucyB7UmFuZ2V9XG4gICAgKlxuICAgICoqL1xuICAgIGdldFJhbmdlT2ZNb3ZlbWVudHMoZnVuYykge1xuICAgICAgICB2YXIgc3RhcnQgPSB0aGlzLmdldEN1cnNvcigpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZnVuYy5jYWxsKG51bGwsIHRoaXMpO1xuICAgICAgICAgICAgdmFyIGVuZCA9IHRoaXMuZ2V0Q3Vyc29yKCk7XG4gICAgICAgICAgICByZXR1cm4gUmFuZ2UuZnJvbVBvaW50cyhzdGFydCwgZW5kKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmV0dXJuIFJhbmdlLmZyb21Qb2ludHMoc3RhcnQsIHN0YXJ0KTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oc3RhcnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdG9KU09OKCkge1xuICAgICAgICBpZiAodGhpcy5yYW5nZUNvdW50KSB7XG4gICAgICAgICAgICB2YXIgZGF0YTogYW55ID0gdGhpcy5yYW5nZXMubWFwKGZ1bmN0aW9uKHIpIHtcbiAgICAgICAgICAgICAgICB2YXIgcjEgPSByLmNsb25lKCk7XG4gICAgICAgICAgICAgICAgcjEuaXNCYWNrd2FyZHMgPSByLmN1cnNvciA9PSByLnN0YXJ0O1xuICAgICAgICAgICAgICAgIHJldHVybiByMTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIGRhdGE6IGFueSA9IHRoaXMuZ2V0UmFuZ2UoKTtcbiAgICAgICAgICAgIGRhdGEuaXNCYWNrd2FyZHMgPSB0aGlzLmlzQmFja3dhcmRzKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRhdGE7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB0b1NpbmdsZVJhbmdlKGRhdGEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiU2VsZWN0aW9uLnRvU2luZ2xlUmFuZ2UgaXMgdW5zdXBwb3J0ZWRcIik7XG4gICAgfVxuXG4gICAgcHVibGljIGFkZFJhbmdlKGRhdGEsIHNvbWV0aGluZzogYm9vbGVhbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJTZWxlY3Rpb24uYWRkUmFuZ2UgaXMgdW5zdXBwb3J0ZWRcIik7XG4gICAgfVxuXG4gICAgZnJvbUpTT04oZGF0YSkge1xuICAgICAgICBpZiAoZGF0YS5zdGFydCA9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnJhbmdlTGlzdCkge1xuICAgICAgICAgICAgICAgIHRoaXMudG9TaW5nbGVSYW5nZShkYXRhWzBdKTtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gZGF0YS5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHI6IGFueSA9IFJhbmdlLmZyb21Qb2ludHMoZGF0YVtpXS5zdGFydCwgZGF0YVtpXS5lbmQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZGF0YS5pc0JhY2t3YXJkcylcbiAgICAgICAgICAgICAgICAgICAgICAgIHIuY3Vyc29yID0gci5zdGFydDtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hZGRSYW5nZShyLCB0cnVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgZGF0YSA9IGRhdGFbMF07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMucmFuZ2VMaXN0KVxuICAgICAgICAgICAgdGhpcy50b1NpbmdsZVJhbmdlKGRhdGEpO1xuICAgICAgICB0aGlzLnNldFNlbGVjdGlvblJhbmdlKGRhdGEsIGRhdGEuaXNCYWNrd2FyZHMpO1xuICAgIH1cblxuICAgIGlzRXF1YWwoZGF0YSkge1xuICAgICAgICBpZiAoKGRhdGEubGVuZ3RoIHx8IHRoaXMucmFuZ2VDb3VudCkgJiYgZGF0YS5sZW5ndGggIT0gdGhpcy5yYW5nZUNvdW50KVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAoIWRhdGEubGVuZ3RoIHx8ICF0aGlzLnJhbmdlcylcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldFJhbmdlKCkuaXNFcXVhbChkYXRhKTtcblxuICAgICAgICBmb3IgKHZhciBpID0gdGhpcy5yYW5nZXMubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMucmFuZ2VzW2ldLmlzRXF1YWwoZGF0YVtpXSkpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxufVxuIl19