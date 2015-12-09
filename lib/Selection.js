import { stringReverse } from "./lib/lang";
import EventEmitterClass from "./lib/event_emitter";
import Range from "./Range";
export default class Selection extends EventEmitterClass {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VsZWN0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1NlbGVjdGlvbi50cyJdLCJuYW1lcyI6WyJTZWxlY3Rpb24iLCJTZWxlY3Rpb24uY29uc3RydWN0b3IiLCJTZWxlY3Rpb24uaXNFbXB0eSIsIlNlbGVjdGlvbi5pc011bHRpTGluZSIsIlNlbGVjdGlvbi5nZXRDdXJzb3IiLCJTZWxlY3Rpb24uc2V0U2VsZWN0aW9uQW5jaG9yIiwiU2VsZWN0aW9uLmdldFNlbGVjdGlvbkFuY2hvciIsIlNlbGVjdGlvbi5nZXRTZWxlY3Rpb25MZWFkIiwiU2VsZWN0aW9uLnNoaWZ0U2VsZWN0aW9uIiwiU2VsZWN0aW9uLmlzQmFja3dhcmRzIiwiU2VsZWN0aW9uLmdldFJhbmdlIiwiU2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uIiwiU2VsZWN0aW9uLnNlbGVjdEFsbCIsIlNlbGVjdGlvbi5zZXRSYW5nZSIsIlNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZSIsIlNlbGVjdGlvbi4kbW92ZVNlbGVjdGlvbiIsIlNlbGVjdGlvbi5zZWxlY3RUbyIsIlNlbGVjdGlvbi5zZWxlY3RUb1Bvc2l0aW9uIiwiU2VsZWN0aW9uLm1vdmVUbyIsIlNlbGVjdGlvbi5tb3ZlVG9Qb3NpdGlvbiIsIlNlbGVjdGlvbi5zZWxlY3RVcCIsIlNlbGVjdGlvbi5zZWxlY3REb3duIiwiU2VsZWN0aW9uLnNlbGVjdFJpZ2h0IiwiU2VsZWN0aW9uLnNlbGVjdExlZnQiLCJTZWxlY3Rpb24uc2VsZWN0TGluZVN0YXJ0IiwiU2VsZWN0aW9uLnNlbGVjdExpbmVFbmQiLCJTZWxlY3Rpb24uc2VsZWN0RmlsZUVuZCIsIlNlbGVjdGlvbi5zZWxlY3RGaWxlU3RhcnQiLCJTZWxlY3Rpb24uc2VsZWN0V29yZFJpZ2h0IiwiU2VsZWN0aW9uLnNlbGVjdFdvcmRMZWZ0IiwiU2VsZWN0aW9uLmdldFdvcmRSYW5nZSIsIlNlbGVjdGlvbi5zZWxlY3RXb3JkIiwiU2VsZWN0aW9uLnNlbGVjdEFXb3JkIiwiU2VsZWN0aW9uLmdldExpbmVSYW5nZSIsIlNlbGVjdGlvbi5zZWxlY3RMaW5lIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JVcCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yRG93biIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGVmdCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yUmlnaHQiLCJTZWxlY3Rpb24ubW92ZUN1cnNvckxpbmVTdGFydCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGluZUVuZCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yRmlsZUVuZCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yRmlsZVN0YXJ0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JMb25nV29yZFJpZ2h0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JMb25nV29yZExlZnQiLCJTZWxlY3Rpb24uJHNob3J0V29yZEVuZEluZGV4IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JTaG9ydFdvcmRSaWdodCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yU2hvcnRXb3JkTGVmdCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yV29yZFJpZ2h0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JXb3JkTGVmdCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yQnkiLCJTZWxlY3Rpb24ubW92ZUN1cnNvclRvUG9zaXRpb24iLCJTZWxlY3Rpb24ubW92ZUN1cnNvclRvIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JUb1NjcmVlbiIsIlNlbGVjdGlvbi5kZXRhY2giLCJTZWxlY3Rpb24uZnJvbU9yaWVudGVkUmFuZ2UiLCJTZWxlY3Rpb24udG9PcmllbnRlZFJhbmdlIiwiU2VsZWN0aW9uLmdldFJhbmdlT2ZNb3ZlbWVudHMiLCJTZWxlY3Rpb24udG9KU09OIiwiU2VsZWN0aW9uLnRvU2luZ2xlUmFuZ2UiLCJTZWxlY3Rpb24uYWRkUmFuZ2UiLCJTZWxlY3Rpb24uZnJvbUpTT04iLCJTZWxlY3Rpb24uaXNFcXVhbCJdLCJtYXBwaW5ncyI6Ik9BK0JPLEVBQUMsYUFBYSxFQUFDLE1BQU0sWUFBWTtP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QSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDL0VBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLE1BQU1BLENBQUNBLElBQUlBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLEVBQUVBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ2pEQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUtEakMsVUFBVUE7UUFDTmtDLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDaERBLENBQUNBO0lBTURsQyxZQUFZQTtRQUNSbUMsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDN0JBLENBQUNBO0lBTURuQyxjQUFjQTtRQUNWb0MsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDNUJBLENBQUNBO0lBTURwQyxjQUFjQTtRQUNWcUMsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsRUFBRUEsRUFDaENBLElBQUlBLENBQUNBO1FBRVRBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQy9EQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUN6REEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFN0JBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqQkEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDL0VBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO1lBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxPQUFPQSxFQUFFQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxJQUFJQSxPQUFPQSxDQUFDQTtnQkFDOUlBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBQ25DQSxJQUFJQTtnQkFDQUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDakNBLENBQUNBO0lBQ0xBLENBQUNBO0lBTURyQyxlQUFlQTtRQUNYc0MsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0E7UUFDbENBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQzFEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNQQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNyREEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEVBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUMzQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUNBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO1lBQ3hDQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUN2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsSUFBSUEsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2hKQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUNsQ0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0ZBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQzVCQSxDQUFDQTtRQUNMQSxDQUFDQTtJQUNMQSxDQUFDQTtJQU1EdEMsbUJBQW1CQTtRQUNmdUMsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDeEJBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBO1FBQzlCQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxtQkFBbUJBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBRzlEQSxJQUFJQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLHdC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QUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2pDQSxJQUFJQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUUzQ0EsSUFBSUEsS0FBS0EsQ0FBQ0E7UUFDVkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdENBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBR25DQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNsREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDUEEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDakRBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBR0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3REQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUM1Q0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDdENBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQzNDQSxDQUFDQTtRQUdEQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4QkEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDcENBLElBQUlBLENBQUNBLGVBQWVBLEVBQUVBLENBQUNBO1lBQ3ZCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxTQUFTQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDL0JBLElBQUlBLENBQUNBLG1CQUFtQkEsRUFBRUEsQ0FBQ0E7WUFDL0JBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBR0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ25EQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUN6Q0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdkNBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO0lBQ25DQSxDQUFDQTtJQU1EM0Msc0JBQXNCQTtRQUNsQjRDLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBO1FBQ3hCQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUc5QkEsSUFBSUEsSUFBSUEsQ0FBQ0E7UUFDVEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakRBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQ3JEQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUdEQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxlQUFlQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN4REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZEEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQUE7UUFDcERBLENBQUNBO1FBRURBLElBQUlBLFlBQVlBLEdBQUdBLGFBQWFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3RDQSxJQUFJQSxLQUFLQSxDQUFDQTtRQUNWQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN0Q0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFHbkNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JEQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUM1Q0EsWUFBWUEsR0FBR0EsWUFBWUEs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TUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0E7WUFDcENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQUE7UUFDcEJBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtBQUNMOUQsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXG5pbXBvcnQgRWRpdG9yRG9jdW1lbnQgZnJvbSBcIi4vRWRpdG9yRG9jdW1lbnRcIjtcbmltcG9ydCB7c3RyaW5nUmV2ZXJzZX0gZnJvbSBcIi4vbGliL2xhbmdcIjtcbmltcG9ydCBFdmVudEVtaXR0ZXJDbGFzcyBmcm9tIFwiLi9saWIvZXZlbnRfZW1pdHRlclwiO1xuaW1wb3J0IE9yaWVudGVkUmFuZ2UgZnJvbSBcIi4vT3JpZW50ZWRSYW5nZVwiO1xuaW1wb3J0IFJhbmdlIGZyb20gXCIuL1JhbmdlXCI7XG5pbXBvcnQge1JhbmdlTGlzdH0gZnJvbSBcIi4vcmFuZ2VfbGlzdFwiO1xuaW1wb3J0IEVkaXRTZXNzaW9uIGZyb20gXCIuL0VkaXRTZXNzaW9uXCI7XG5pbXBvcnQgQW5jaG9yIGZyb20gXCIuL0FuY2hvclwiO1xuXG4vKipcbiAqIENvbnRhaW5zIHRoZSBjdXJzb3IgcG9zaXRpb24gYW5kIHRoZSB0ZXh0IHNlbGVjdGlvbiBvZiBhbiBlZGl0IHNlc3Npb24uXG4gKlxuICogVGhlIHJvdy9jb2x1bW5zIHVzZWQgaW4gdGhlIHNlbGVjdGlvbiBhcmUgaW4gZG9jdW1lbnQgY29vcmRpbmF0ZXMgcmVwcmVzZW50aW5nIHRocyBjb29yZGluYXRlcyBhcyB0aGV6IGFwcGVhciBpbiB0aGUgZG9jdW1lbnQgYmVmb3JlIGFwcGx5aW5nIHNvZnQgd3JhcCBhbmQgZm9sZGluZy5cbiAqIEBjbGFzcyBTZWxlY3Rpb25cbiAqKi9cblxuXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgY3Vyc29yIHBvc2l0aW9uIGNoYW5nZXMuXG4gKiBAZXZlbnQgY2hhbmdlQ3Vyc29yXG4gKlxuKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgY3Vyc29yIHNlbGVjdGlvbiBjaGFuZ2VzLlxuICogXG4gKiAgQGV2ZW50IGNoYW5nZVNlbGVjdGlvblxuKiovXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgYFNlbGVjdGlvbmAgb2JqZWN0LlxuICogQHBhcmFtIHtFZGl0U2Vzc2lvbn0gc2Vzc2lvbiBUaGUgc2Vzc2lvbiB0byB1c2VcbiAqIFxuICogQGNvbnN0cnVjdG9yXG4gKiovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTZWxlY3Rpb24gZXh0ZW5kcyBFdmVudEVtaXR0ZXJDbGFzcyB7XG4gICAgcHJpdmF0ZSBzZXNzaW9uOiBFZGl0U2Vzc2lvbjtcbiAgICAvLyBGSVhNRTogTWF5YmUgU2VsZWN0aW9uIHNob3VsZCBvbmx5IGNvdXBsZSB0byB0aGUgRWRpdFNlc3Npb24/XG4gICAgcHJpdmF0ZSBkb2M6IEVkaXRvckRvY3VtZW50O1xuICAgIC8vIFdoeSBkbyB3ZSBzZWVtIHRvIGhhdmUgY29waWVzP1xuICAgIHB1YmxpYyBsZWFkOiBBbmNob3I7XG4gICAgcHVibGljIGFuY2hvcjogQW5jaG9yO1xuICAgIHByaXZhdGUgc2VsZWN0aW9uTGVhZDogQW5jaG9yO1xuICAgIHByaXZhdGUgc2VsZWN0aW9uQW5jaG9yOiBBbmNob3I7XG4gICAgcHJpdmF0ZSAkaXNFbXB0eTogYm9vbGVhbjtcbiAgICBwcml2YXRlICRrZWVwRGVzaXJlZENvbHVtbk9uQ2hhbmdlOiBib29sZWFuO1xuICAgIHByaXZhdGUgJGRlc2lyZWRDb2x1bW47ICAvLyBJcyB0aGlzIHVzZWQgYW55d2hlcmU/XG4gICAgcHJpdmF0ZSByYW5nZUNvdW50O1xuICAgIHB1YmxpYyByYW5nZXM7XG4gICAgcHVibGljIHJhbmdlTGlzdDogUmFuZ2VMaXN0O1xuICAgIGNvbnN0cnVjdG9yKHNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbiA9IHNlc3Npb247XG4gICAgICAgIHRoaXMuZG9jID0gc2Vzc2lvbi5nZXREb2N1bWVudCgpO1xuXG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5sZWFkID0gdGhpcy5zZWxlY3Rpb25MZWFkID0gdGhpcy5kb2MuY3JlYXRlQW5jaG9yKDAsIDApO1xuICAgICAgICB0aGlzLmFuY2hvciA9IHRoaXMuc2VsZWN0aW9uQW5jaG9yID0gdGhpcy5kb2MuY3JlYXRlQW5jaG9yKDAsIDApO1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5sZWFkLm9uKFwiY2hhbmdlXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHNlbGYuX2VtaXQoXCJjaGFuZ2VDdXJzb3JcIik7XG4gICAgICAgICAgICBpZiAoIXNlbGYuJGlzRW1wdHkpXG4gICAgICAgICAgICAgICAgc2VsZi5fZW1pdChcImNoYW5nZVNlbGVjdGlvblwiKTtcbiAgICAgICAgICAgIGlmICghc2VsZi4ka2VlcERlc2lyZWRDb2x1bW5PbkNoYW5nZSAmJiBlLm9sZC5jb2x1bW4gIT0gZS52YWx1ZS5jb2x1bW4pXG4gICAgICAgICAgICAgICAgc2VsZi4kZGVzaXJlZENvbHVtbiA9IG51bGw7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuc2VsZWN0aW9uQW5jaG9yLm9uKFwiY2hhbmdlXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKCFzZWxmLiRpc0VtcHR5KSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fZW1pdChcImNoYW5nZVNlbGVjdGlvblwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgc2VsZWN0aW9uIGlzIGVtcHR5LlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqL1xuICAgIGlzRW1wdHkoKSB7XG4gICAgICAgIC8vIFdoYXQgaXMgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiAkaXNFbXB0eSBhbmQgd2hhdCB0aGlzIGZ1bmN0aW9uIHJldHVybnM/XG4gICAgICAgIHJldHVybiAodGhpcy4kaXNFbXB0eSB8fCAoXG4gICAgICAgICAgICB0aGlzLmFuY2hvci5yb3cgPT0gdGhpcy5sZWFkLnJvdyAmJlxuICAgICAgICAgICAgdGhpcy5hbmNob3IuY29sdW1uID09IHRoaXMubGVhZC5jb2x1bW5cbiAgICAgICAgKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgc2VsZWN0aW9uIGlzIGEgbXVsdGktbGluZS5cbiAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICoqL1xuICAgIGlzTXVsdGlMaW5lKCkge1xuICAgICAgICBpZiAodGhpcy5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLmdldFJhbmdlKCkuaXNNdWx0aUxpbmUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGByb3dgIGFuZCBgY29sdW1uYCBjdXJyZW50IHBvc2l0aW9uIG9mIHRoZSBjdXJzb3IuXG4gICAgKiBAcmV0dXJucyB7T2JqZWN0fVxuICAgICoqL1xuICAgIGdldEN1cnNvcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubGVhZC5nZXRQb3NpdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyB0aGUgcm93IGFuZCBjb2x1bW4gcG9zaXRpb24gb2YgdGhlIGFuY2hvci4gVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRzIHRoZSBgJ2NoYW5nZVNlbGVjdGlvbidgIGV2ZW50LlxuICAgICogQHBhcmFtIHtudW1iZXJ9IHJvdyBUaGUgbmV3IHJvd1xuICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbiBUaGUgbmV3IGNvbHVtblxuICAgICoqL1xuICAgIHNldFNlbGVjdGlvbkFuY2hvcihyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5hbmNob3Iuc2V0UG9zaXRpb24ocm93LCBjb2x1bW4pO1xuXG4gICAgICAgIGlmICh0aGlzLiRpc0VtcHR5KSB7XG4gICAgICAgICAgICB0aGlzLiRpc0VtcHR5ID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLl9lbWl0KFwiY2hhbmdlU2VsZWN0aW9uXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBgcm93YCBhbmQgYGNvbHVtbmAgb2YgdGhlIGNhbGxpbmcgc2VsZWN0aW9uIGFuY2hvci5cbiAgICAqXG4gICAgKiBAcmV0dXJucyB7T2JqZWN0fVxuICAgICogQHJlbGF0ZWQgQW5jaG9yLmdldFBvc2l0aW9uXG4gICAgKiovXG4gICAgZ2V0U2VsZWN0aW9uQW5jaG9yKCkge1xuICAgICAgICBpZiAodGhpcy4kaXNFbXB0eSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldFNlbGVjdGlvbkxlYWQoKVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hbmNob3IuZ2V0UG9zaXRpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBgcm93YCBhbmQgYGNvbHVtbmAgb2YgdGhlIGNhbGxpbmcgc2VsZWN0aW9uIGxlYWQuXG4gICAgKiBAcmV0dXJucyB7T2JqZWN0fVxuICAgICoqL1xuICAgIGdldFNlbGVjdGlvbkxlYWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxlYWQuZ2V0UG9zaXRpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNoaWZ0cyB0aGUgc2VsZWN0aW9uIHVwIChvciBkb3duLCBpZiBbW1NlbGVjdGlvbi5pc0JhY2t3YXJkcyBgaXNCYWNrd2FyZHMoKWBdXSBpcyB0cnVlKSB0aGUgZ2l2ZW4gbnVtYmVyIG9mIGNvbHVtbnMuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1ucyBUaGUgbnVtYmVyIG9mIGNvbHVtbnMgdG8gc2hpZnQgYnlcbiAgICAqXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBzaGlmdFNlbGVjdGlvbihjb2x1bW5zKSB7XG4gICAgICAgIGlmICh0aGlzLiRpc0VtcHR5KSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyh0aGlzLmxlYWQucm93LCB0aGlzLmxlYWQuY29sdW1uICsgY29sdW1ucyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgYW5jaG9yID0gdGhpcy5nZXRTZWxlY3Rpb25BbmNob3IoKTtcbiAgICAgICAgdmFyIGxlYWQgPSB0aGlzLmdldFNlbGVjdGlvbkxlYWQoKTtcblxuICAgICAgICB2YXIgaXNCYWNrd2FyZHMgPSB0aGlzLmlzQmFja3dhcmRzKCk7XG5cbiAgICAgICAgaWYgKCFpc0JhY2t3YXJkcyB8fCBhbmNob3IuY29sdW1uICE9PSAwKVxuICAgICAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25BbmNob3IoYW5jaG9yLnJvdywgYW5jaG9yLmNvbHVtbiArIGNvbHVtbnMpO1xuXG4gICAgICAgIGlmIChpc0JhY2t3YXJkcyB8fCBsZWFkLmNvbHVtbiAhPT0gMCkge1xuICAgICAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhsZWFkLnJvdywgbGVhZC5jb2x1bW4gKyBjb2x1bW5zKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgc2VsZWN0aW9uIGlzIGdvaW5nIGJhY2t3YXJkcyBpbiB0aGUgZG9jdW1lbnQuXG4gICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAqKi9cbiAgICBpc0JhY2t3YXJkcygpIHtcbiAgICAgICAgdmFyIGFuY2hvciA9IHRoaXMuYW5jaG9yO1xuICAgICAgICB2YXIgbGVhZCA9IHRoaXMubGVhZDtcbiAgICAgICAgcmV0dXJuIChhbmNob3Iucm93ID4gbGVhZC5yb3cgfHwgKGFuY2hvci5yb3cgPT0gbGVhZC5yb3cgJiYgYW5jaG9yLmNvbHVtbiA+IGxlYWQuY29sdW1uKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBbUmV0dXJucyB0aGUgW1tSYW5nZV1dIGZvciB0aGUgc2VsZWN0ZWQgdGV4dC5dezogI1NlbGVjdGlvbi5nZXRSYW5nZX1cbiAgICAqIEByZXR1cm5zIHtSYW5nZX1cbiAgICAqKi9cbiAgICBnZXRSYW5nZSgpIHtcbiAgICAgICAgdmFyIGFuY2hvciA9IHRoaXMuYW5jaG9yO1xuICAgICAgICB2YXIgbGVhZCA9IHRoaXMubGVhZDtcblxuICAgICAgICBpZiAodGhpcy5pc0VtcHR5KCkpXG4gICAgICAgICAgICByZXR1cm4gUmFuZ2UuZnJvbVBvaW50cyhsZWFkLCBsZWFkKTtcblxuICAgICAgICBpZiAodGhpcy5pc0JhY2t3YXJkcygpKSB7XG4gICAgICAgICAgICByZXR1cm4gUmFuZ2UuZnJvbVBvaW50cyhsZWFkLCBhbmNob3IpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIFJhbmdlLmZyb21Qb2ludHMoYW5jaG9yLCBsZWFkKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogW0VtcHRpZXMgdGhlIHNlbGVjdGlvbiAoYnkgZGUtc2VsZWN0aW5nIGl0KS4gVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRzIHRoZSBgJ2NoYW5nZVNlbGVjdGlvbidgIGV2ZW50Ll17OiAjU2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9ufVxuICAgICoqL1xuICAgIGNsZWFyU2VsZWN0aW9uKCkge1xuICAgICAgICBpZiAoIXRoaXMuJGlzRW1wdHkpIHtcbiAgICAgICAgICAgIHRoaXMuJGlzRW1wdHkgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5fZW1pdChcImNoYW5nZVNlbGVjdGlvblwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogU2VsZWN0cyBhbGwgdGhlIHRleHQgaW4gdGhlIGRvY3VtZW50LlxuICAgICoqL1xuICAgIHNlbGVjdEFsbCgpIHtcbiAgICAgICAgdmFyIGxhc3RSb3cgPSB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDE7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uQW5jaG9yKDAsIDApO1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhsYXN0Um93LCB0aGlzLmRvYy5nZXRMaW5lKGxhc3RSb3cpLmxlbmd0aCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZXRzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIHByb3ZpZGVkIHJhbmdlLlxuICAgICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgVGhlIHJhbmdlIG9mIHRleHQgdG8gc2VsZWN0XG4gICAgKiBAcGFyYW0ge0Jvb2xlYW59IHJldmVyc2UgSW5kaWNhdGVzIGlmIHRoZSByYW5nZSBzaG91bGQgZ28gYmFja3dhcmRzIChgdHJ1ZWApIG9yIG5vdFxuICAgICpcbiAgICAqXG4gICAgKiBAbWV0aG9kIHNldFNlbGVjdGlvblJhbmdlXG4gICAgKiBAYWxpYXMgc2V0UmFuZ2VcbiAgICAqKi9cbiAgICBzZXRSYW5nZShyYW5nZSwgcmV2ZXJzZT86IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSwgcmV2ZXJzZSk7XG4gICAgfVxuICAgIHNldFNlbGVjdGlvblJhbmdlKHJhbmdlOiB7IHN0YXJ0OiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9OyBlbmQ6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0gfSwgcmV2ZXJzZT86IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKHJldmVyc2UpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uQW5jaG9yKHJhbmdlLmVuZC5yb3csIHJhbmdlLmVuZC5jb2x1bW4pO1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RUbyhyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnNldFNlbGVjdGlvbkFuY2hvcihyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdFRvKHJhbmdlLmVuZC5yb3csIHJhbmdlLmVuZC5jb2x1bW4pO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmdldFJhbmdlKCkuaXNFbXB0eSgpKVxuICAgICAgICAgICAgdGhpcy4kaXNFbXB0eSA9IHRydWU7XG4gICAgICAgIHRoaXMuJGRlc2lyZWRDb2x1bW4gPSBudWxsO1xuICAgIH1cblxuICAgICRtb3ZlU2VsZWN0aW9uKG1vdmVyKSB7XG4gICAgICAgIHZhciBsZWFkID0gdGhpcy5sZWFkO1xuICAgICAgICBpZiAodGhpcy4kaXNFbXB0eSlcbiAgICAgICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uQW5jaG9yKGxlYWQucm93LCBsZWFkLmNvbHVtbik7XG5cbiAgICAgICAgbW92ZXIuY2FsbCh0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gY3Vyc29yIHRvIHRoZSBpbmRpY2F0ZWQgcm93IGFuZCBjb2x1bW4uXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gc2VsZWN0IHRvXG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gdG8gc2VsZWN0IHRvXG4gICAgKlxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgc2VsZWN0VG8ocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbik7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiBjdXJzb3IgdG8gdGhlIHJvdyBhbmQgY29sdW1uIGluZGljYXRlZCBieSBgcG9zYC5cbiAgICAqIEBwYXJhbSB7T2JqZWN0fSBwb3MgQW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIHJvdyBhbmQgY29sdW1uXG4gICAgKlxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgc2VsZWN0VG9Qb3NpdGlvbihwb3MpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24ocG9zKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIGN1cnNvciB0byB0aGUgaW5kaWNhdGVkIHJvdyBhbmQgY29sdW1uLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIHNlbGVjdCB0b1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIHRvIHNlbGVjdCB0b1xuICAgICpcbiAgICAqKi9cbiAgICBtb3ZlVG8ocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiBjdXJzb3IgdG8gdGhlIHJvdyBhbmQgY29sdW1uIGluZGljYXRlZCBieSBgcG9zYC5cbiAgICAqIEBwYXJhbSB7T2JqZWN0fSBwb3MgQW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIHJvdyBhbmQgY29sdW1uXG4gICAgKiovXG4gICAgbW92ZVRvUG9zaXRpb24ocG9zKSB7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihwb3MpO1xuICAgIH1cblxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB1cCBvbmUgcm93LlxuICAgICoqL1xuICAgIHNlbGVjdFVwKCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvclVwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIGRvd24gb25lIHJvdy5cbiAgICAqKi9cbiAgICBzZWxlY3REb3duKCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvckRvd24pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHJpZ2h0IG9uZSBjb2x1bW4uXG4gICAgKiovXG4gICAgc2VsZWN0UmlnaHQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yUmlnaHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gbGVmdCBvbmUgY29sdW1uLlxuICAgICoqL1xuICAgIHNlbGVjdExlZnQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yTGVmdCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB0byB0aGUgYmVnaW5uaW5nIG9mIHRoZSBjdXJyZW50IGxpbmUuXG4gICAgKiovXG4gICAgc2VsZWN0TGluZVN0YXJ0KCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvckxpbmVTdGFydCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB0byB0aGUgZW5kIG9mIHRoZSBjdXJyZW50IGxpbmUuXG4gICAgKiovXG4gICAgc2VsZWN0TGluZUVuZCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JMaW5lRW5kKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBlbmQgb2YgdGhlIGZpbGUuXG4gICAgKiovXG4gICAgc2VsZWN0RmlsZUVuZCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JGaWxlRW5kKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBzdGFydCBvZiB0aGUgZmlsZS5cbiAgICAqKi9cbiAgICBzZWxlY3RGaWxlU3RhcnQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yRmlsZVN0YXJ0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBmaXJzdCB3b3JkIG9uIHRoZSByaWdodC5cbiAgICAqKi9cbiAgICBzZWxlY3RXb3JkUmlnaHQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yV29yZFJpZ2h0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBmaXJzdCB3b3JkIG9uIHRoZSBsZWZ0LlxuICAgICoqL1xuICAgIHNlbGVjdFdvcmRMZWZ0KCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvcldvcmRMZWZ0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gaGlnaGxpZ2h0IHRoZSBlbnRpcmUgd29yZC5cbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmdldFdvcmRSYW5nZVxuICAgICoqL1xuICAgIGdldFdvcmRSYW5nZShyb3c/LCBjb2x1bW4/KSB7XG4gICAgICAgIGlmICh0eXBlb2YgY29sdW1uID09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgIHZhciBjdXJzb3IgPSByb3cgfHwgdGhpcy5sZWFkO1xuICAgICAgICAgICAgcm93ID0gY3Vyc29yLnJvdztcbiAgICAgICAgICAgIGNvbHVtbiA9IGN1cnNvci5jb2x1bW47XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRXb3JkUmFuZ2Uocm93LCBjb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFNlbGVjdHMgYW4gZW50aXJlIHdvcmQgYm91bmRhcnkuXG4gICAgKiovXG4gICAgc2VsZWN0V29yZCgpIHtcbiAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25SYW5nZSh0aGlzLmdldFdvcmRSYW5nZSgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNlbGVjdHMgYSB3b3JkLCBpbmNsdWRpbmcgaXRzIHJpZ2h0IHdoaXRlc3BhY2UuXG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRBV29yZFJhbmdlXG4gICAgKiovXG4gICAgc2VsZWN0QVdvcmQoKSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvcigpO1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLnNlc3Npb24uZ2V0QVdvcmRSYW5nZShjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcbiAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSk7XG4gICAgfVxuXG4gICAgZ2V0TGluZVJhbmdlKHJvdz86IG51bWJlciwgZXhjbHVkZUxhc3RDaGFyPzogYm9vbGVhbik6IFJhbmdlIHtcbiAgICAgICAgdmFyIHJvd1N0YXJ0ID0gdHlwZW9mIHJvdyA9PSBcIm51bWJlclwiID8gcm93IDogdGhpcy5sZWFkLnJvdztcbiAgICAgICAgdmFyIHJvd0VuZDtcblxuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZExpbmUocm93U3RhcnQpO1xuICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgIHJvd1N0YXJ0ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICAgICAgcm93RW5kID0gZm9sZExpbmUuZW5kLnJvdztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJvd0VuZCA9IHJvd1N0YXJ0O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGV4Y2x1ZGVMYXN0Q2hhcikge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBSYW5nZShyb3dTdGFydCwgMCwgcm93RW5kLCB0aGlzLnNlc3Npb24uZ2V0TGluZShyb3dFbmQpLmxlbmd0aCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFJhbmdlKHJvd1N0YXJ0LCAwLCByb3dFbmQgKyAxLCAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogU2VsZWN0cyB0aGUgZW50aXJlIGxpbmUuXG4gICAgKiovXG4gICAgc2VsZWN0TGluZSgpIHtcbiAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25SYW5nZSh0aGlzLmdldExpbmVSYW5nZSgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHVwIG9uZSByb3cuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvclVwKCkge1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeSgtMSwgMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciBkb3duIG9uZSByb3cuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckRvd24oKSB7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvckJ5KDEsIDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgbGVmdCBvbmUgY29sdW1uLlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JMZWZ0KCkge1xuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5sZWFkLmdldFBvc2l0aW9uKCksXG4gICAgICAgICAgICBmb2xkO1xuXG4gICAgICAgIGlmIChmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uLCAtMSkpIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGZvbGQuc3RhcnQucm93LCBmb2xkLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgIH0gZWxzZSBpZiAoY3Vyc29yLmNvbHVtbiA9PT0gMCkge1xuICAgICAgICAgICAgLy8gY3Vyc29yIGlzIGEgbGluZSAoc3RhcnRcbiAgICAgICAgICAgIGlmIChjdXJzb3Iucm93ID4gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGN1cnNvci5yb3cgLSAxLCB0aGlzLmRvYy5nZXRMaW5lKGN1cnNvci5yb3cgLSAxKS5sZW5ndGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHRhYlNpemUgPSB0aGlzLnNlc3Npb24uZ2V0VGFiU2l6ZSgpO1xuICAgICAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi5pc1RhYlN0b3AoY3Vyc29yKSAmJiB0aGlzLmRvYy5nZXRMaW5lKGN1cnNvci5yb3cpLnNsaWNlKGN1cnNvci5jb2x1bW4gLSB0YWJTaXplLCBjdXJzb3IuY29sdW1uKS5zcGxpdChcIiBcIikubGVuZ3RoIC0gMSA9PSB0YWJTaXplKVxuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckJ5KDAsIC10YWJTaXplKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeSgwLCAtMSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHJpZ2h0IG9uZSBjb2x1bW4uXG4gICAgKiovXG4gICAgbW92ZUN1cnNvclJpZ2h0KCkge1xuICAgICAgICB2YXIgcG9zID0gdGhpcy5sZWFkLmdldFBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChwb3Mucm93LCBwb3MuY29sdW1uLCAxKTtcbiAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGZvbGQuZW5kLnJvdywgZm9sZC5lbmQuY29sdW1uKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLmxlYWQuY29sdW1uID09IHRoaXMuZG9jLmdldExpbmUodGhpcy5sZWFkLnJvdykubGVuZ3RoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5sZWFkLnJvdyA8IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSkge1xuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHRoaXMubGVhZC5yb3cgKyAxLCAwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciB0YWJTaXplID0gdGhpcy5zZXNzaW9uLmdldFRhYlNpemUoKTtcbiAgICAgICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmxlYWQ7XG4gICAgICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmlzVGFiU3RvcChjdXJzb3IpICYmIHRoaXMuZG9jLmdldExpbmUoY3Vyc29yLnJvdykuc2xpY2UoY3Vyc29yLmNvbHVtbiwgY3Vyc29yLmNvbHVtbiArIHRhYlNpemUpLnNwbGl0KFwiIFwiKS5sZW5ndGggLSAxID09IHRhYlNpemUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeSgwLCB0YWJTaXplKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckJ5KDAsIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3RhcnQgb2YgdGhlIGxpbmUuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckxpbmVTdGFydCgpIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMubGVhZC5yb3c7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLmxlYWQuY29sdW1uO1xuICAgICAgICB2YXIgc2NyZWVuUm93ID0gdGhpcy5zZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Sb3cocm93LCBjb2x1bW4pO1xuXG4gICAgICAgIC8vIERldGVybSB0aGUgZG9jLXBvc2l0aW9uIG9mIHRoZSBmaXJzdCBjaGFyYWN0ZXIgYXQgdGhlIHNjcmVlbiBsaW5lLlxuICAgICAgICB2YXIgZmlyc3RDb2x1bW5Qb3NpdGlvbiA9IHRoaXMuc2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93LCAwKTtcblxuICAgICAgICAvLyBEZXRlcm0gdGhlIGxpbmVcbiAgICAgICAgLy8gSG93IGRvZXMgZ2V0RGlzcGxheUxpbmUgZ2V0IGZyb20gZm9sZGluZyBvbnRvIHNlc3Npb24/XG4gICAgICAgIHZhciBiZWZvcmVDdXJzb3IgPSB0aGlzLnNlc3Npb25bJ2dldERpc3BsYXlMaW5lJ10oXG4gICAgICAgICAgICByb3csIG51bGwsIGZpcnN0Q29sdW1uUG9zaXRpb24ucm93LFxuICAgICAgICAgICAgZmlyc3RDb2x1bW5Qb3NpdGlvbi5jb2x1bW5cbiAgICAgICAgKTtcblxuICAgICAgICB2YXIgbGVhZGluZ1NwYWNlID0gYmVmb3JlQ3Vyc29yLm1hdGNoKC9eXFxzKi8pO1xuICAgICAgICAvLyBUT0RPIGZpbmQgYmV0dGVyIHdheSBmb3IgZW1hY3MgbW9kZSB0byBvdmVycmlkZSBzZWxlY3Rpb24gYmVoYXZpb3JzXG4gICAgICAgIGlmIChsZWFkaW5nU3BhY2VbMF0ubGVuZ3RoICE9IGNvbHVtbiAmJiAhdGhpcy5zZXNzaW9uWyckdXNlRW1hY3NTdHlsZUxpbmVTdGFydCddKVxuICAgICAgICAgICAgZmlyc3RDb2x1bW5Qb3NpdGlvbi5jb2x1bW4gKz0gbGVhZGluZ1NwYWNlWzBdLmxlbmd0aDtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihmaXJzdENvbHVtblBvc2l0aW9uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBlbmQgb2YgdGhlIGxpbmUuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckxpbmVFbmQoKSB7XG4gICAgICAgIHZhciBsZWFkID0gdGhpcy5sZWFkO1xuICAgICAgICB2YXIgbGluZUVuZCA9IHRoaXMuc2Vzc2lvbi5nZXREb2N1bWVudExhc3RSb3dDb2x1bW5Qb3NpdGlvbihsZWFkLnJvdywgbGVhZC5jb2x1bW4pO1xuICAgICAgICBpZiAodGhpcy5sZWFkLmNvbHVtbiA9PSBsaW5lRW5kLmNvbHVtbikge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSB0aGlzLnNlc3Npb24uZ2V0TGluZShsaW5lRW5kLnJvdyk7XG4gICAgICAgICAgICBpZiAobGluZUVuZC5jb2x1bW4gPT0gbGluZS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB2YXIgdGV4dEVuZCA9IGxpbmUuc2VhcmNoKC9cXHMrJC8pO1xuICAgICAgICAgICAgICAgIGlmICh0ZXh0RW5kID4gMClcbiAgICAgICAgICAgICAgICAgICAgbGluZUVuZC5jb2x1bW4gPSB0ZXh0RW5kO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8obGluZUVuZC5yb3csIGxpbmVFbmQuY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBlbmQgb2YgdGhlIGZpbGUuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckZpbGVFbmQoKSB7XG4gICAgICAgIHZhciByb3cgPSB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDE7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLmRvYy5nZXRMaW5lKHJvdykubGVuZ3RoO1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3RhcnQgb2YgdGhlIGZpbGUuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckZpbGVTdGFydCgpIHtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8oMCwgMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgd29yZCBvbiB0aGUgcmlnaHQuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckxvbmdXb3JkUmlnaHQoKSB7XG4gICAgICAgIHZhciByb3cgPSB0aGlzLmxlYWQucm93O1xuICAgICAgICB2YXIgY29sdW1uID0gdGhpcy5sZWFkLmNvbHVtbjtcbiAgICAgICAgdmFyIGxpbmUgPSB0aGlzLmRvYy5nZXRMaW5lKHJvdyk7XG4gICAgICAgIHZhciByaWdodE9mQ3Vyc29yID0gbGluZS5zdWJzdHJpbmcoY29sdW1uKTtcblxuICAgICAgICB2YXIgbWF0Y2g7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi50b2tlblJlLmxhc3RJbmRleCA9IDA7XG5cbiAgICAgICAgLy8gc2tpcCBmb2xkc1xuICAgICAgICB2YXIgZm9sZCA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkQXQocm93LCBjb2x1bW4sIDEpO1xuICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8oZm9sZC5lbmQucm93LCBmb2xkLmVuZC5jb2x1bW4pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZmlyc3Qgc2tpcCBzcGFjZVxuICAgICAgICBpZiAobWF0Y2ggPSB0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5leGVjKHJpZ2h0T2ZDdXJzb3IpKSB7XG4gICAgICAgICAgICBjb2x1bW4gKz0gdGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4O1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgICAgIHJpZ2h0T2ZDdXJzb3IgPSBsaW5lLnN1YnN0cmluZyhjb2x1bW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgYXQgbGluZSBlbmQgcHJvY2VlZCB3aXRoIG5leHQgbGluZVxuICAgICAgICBpZiAoY29sdW1uID49IGxpbmUubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGxpbmUubGVuZ3RoKTtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclJpZ2h0KCk7XG4gICAgICAgICAgICBpZiAocm93IDwgdGhpcy5kb2MuZ2V0TGVuZ3RoKCkgLSAxKVxuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvcldvcmRSaWdodCgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gYWR2YW5jZSB0byB0aGUgZW5kIG9mIHRoZSBuZXh0IHRva2VuXG4gICAgICAgIGlmIChtYXRjaCA9IHRoaXMuc2Vzc2lvbi50b2tlblJlLmV4ZWMocmlnaHRPZkN1cnNvcikpIHtcbiAgICAgICAgICAgIGNvbHVtbiArPSB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXg7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHdvcmQgb24gdGhlIGxlZnQuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckxvbmdXb3JkTGVmdCgpIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMubGVhZC5yb3c7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLmxlYWQuY29sdW1uO1xuXG4gICAgICAgIC8vIHNraXAgZm9sZHNcbiAgICAgICAgdmFyIGZvbGQ7XG4gICAgICAgIGlmIChmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChyb3csIGNvbHVtbiwgLTEpKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhmb2xkLnN0YXJ0LnJvdywgZm9sZC5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSG93IGRvZXMgdGhpcyBnZXQgZnJvbSB0aGUgZm9sZGluZyBhZGFwdGVyIG9udG8gdGhlIHNlc3Npb24/XG4gICAgICAgIHZhciBzdHIgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZFN0cmluZ0F0KHJvdywgY29sdW1uLCAtMSk7XG4gICAgICAgIGlmIChzdHIgPT0gbnVsbCkge1xuICAgICAgICAgICAgc3RyID0gdGhpcy5kb2MuZ2V0TGluZShyb3cpLnN1YnN0cmluZygwLCBjb2x1bW4pXG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGVmdE9mQ3Vyc29yID0gc3RyaW5nUmV2ZXJzZShzdHIpO1xuICAgICAgICB2YXIgbWF0Y2g7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi50b2tlblJlLmxhc3RJbmRleCA9IDA7XG5cbiAgICAgICAgLy8gc2tpcCB3aGl0ZXNwYWNlXG4gICAgICAgIGlmIChtYXRjaCA9IHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmV4ZWMobGVmdE9mQ3Vyc29yKSkge1xuICAgICAgICAgICAgY29sdW1uIC09IHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmxhc3RJbmRleDtcbiAgICAgICAgICAgIGxlZnRPZkN1cnNvciA9IGxlZnRPZkN1cnNvci5zbGljZSh0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5sYXN0SW5kZXgpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGlmIGF0IGJlZ2luIG9mIHRoZSBsaW5lIHByb2NlZWQgaW4gbGluZSBhYm92ZVxuICAgICAgICBpZiAoY29sdW1uIDw9IDApIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgMCk7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JMZWZ0KCk7XG4gICAgICAgICAgICBpZiAocm93ID4gMClcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JXb3JkTGVmdCgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gbW92ZSB0byB0aGUgYmVnaW4gb2YgdGhlIHdvcmRcbiAgICAgICAgaWYgKG1hdGNoID0gdGhpcy5zZXNzaW9uLnRva2VuUmUuZXhlYyhsZWZ0T2ZDdXJzb3IpKSB7XG4gICAgICAgICAgICBjb2x1bW4gLT0gdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4O1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgY29sdW1uKTtcbiAgICB9XG5cbiAgICAkc2hvcnRXb3JkRW5kSW5kZXgocmlnaHRPZkN1cnNvcikge1xuICAgICAgICB2YXIgbWF0Y2gsIGluZGV4ID0gMCwgY2g7XG4gICAgICAgIHZhciB3aGl0ZXNwYWNlUmUgPSAvXFxzLztcbiAgICAgICAgdmFyIHRva2VuUmUgPSB0aGlzLnNlc3Npb24udG9rZW5SZTtcblxuICAgICAgICB0b2tlblJlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgIGlmIChtYXRjaCA9IHRoaXMuc2Vzc2lvbi50b2tlblJlLmV4ZWMocmlnaHRPZkN1cnNvcikpIHtcbiAgICAgICAgICAgIGluZGV4ID0gdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgd2hpbGUgKChjaCA9IHJpZ2h0T2ZDdXJzb3JbaW5kZXhdKSAmJiB3aGl0ZXNwYWNlUmUudGVzdChjaCkpXG4gICAgICAgICAgICAgICAgaW5kZXgrKztcblxuICAgICAgICAgICAgaWYgKGluZGV4IDwgMSkge1xuICAgICAgICAgICAgICAgIHRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICB3aGlsZSAoKGNoID0gcmlnaHRPZkN1cnNvcltpbmRleF0pICYmICF0b2tlblJlLnRlc3QoY2gpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXgrKztcbiAgICAgICAgICAgICAgICAgICAgaWYgKHdoaXRlc3BhY2VSZS50ZXN0KGNoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4ID4gMikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluZGV4LS1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2hpbGUgKChjaCA9IHJpZ2h0T2ZDdXJzb3JbaW5kZXhdKSAmJiB3aGl0ZXNwYWNlUmUudGVzdChjaCkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluZGV4Kys7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4ID4gMilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0b2tlblJlLmxhc3RJbmRleCA9IDA7XG5cbiAgICAgICAgcmV0dXJuIGluZGV4O1xuICAgIH1cblxuICAgIG1vdmVDdXJzb3JTaG9ydFdvcmRSaWdodCgpIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMubGVhZC5yb3c7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLmxlYWQuY29sdW1uO1xuICAgICAgICB2YXIgbGluZSA9IHRoaXMuZG9jLmdldExpbmUocm93KTtcbiAgICAgICAgdmFyIHJpZ2h0T2ZDdXJzb3IgPSBsaW5lLnN1YnN0cmluZyhjb2x1bW4pO1xuXG4gICAgICAgIHZhciBmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChyb3csIGNvbHVtbiwgMSk7XG4gICAgICAgIGlmIChmb2xkKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMubW92ZUN1cnNvclRvKGZvbGQuZW5kLnJvdywgZm9sZC5lbmQuY29sdW1uKTtcblxuICAgICAgICBpZiAoY29sdW1uID09IGxpbmUubGVuZ3RoKSB7XG4gICAgICAgICAgICB2YXIgbCA9IHRoaXMuZG9jLmdldExlbmd0aCgpO1xuICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgIHJvdysrO1xuICAgICAgICAgICAgICAgIHJpZ2h0T2ZDdXJzb3IgPSB0aGlzLmRvYy5nZXRMaW5lKHJvdylcbiAgICAgICAgICAgIH0gd2hpbGUgKHJvdyA8IGwgJiYgL15cXHMqJC8udGVzdChyaWdodE9mQ3Vyc29yKSlcblxuICAgICAgICAgICAgaWYgKCEvXlxccysvLnRlc3QocmlnaHRPZkN1cnNvcikpXG4gICAgICAgICAgICAgICAgcmlnaHRPZkN1cnNvciA9IFwiXCJcbiAgICAgICAgICAgIGNvbHVtbiA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaW5kZXggPSB0aGlzLiRzaG9ydFdvcmRFbmRJbmRleChyaWdodE9mQ3Vyc29yKTtcblxuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbiArIGluZGV4KTtcbiAgICB9XG5cbiAgICBtb3ZlQ3Vyc29yU2hvcnRXb3JkTGVmdCgpIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMubGVhZC5yb3c7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLmxlYWQuY29sdW1uO1xuXG4gICAgICAgIHZhciBmb2xkO1xuICAgICAgICBpZiAoZm9sZCA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkQXQocm93LCBjb2x1bW4sIC0xKSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm1vdmVDdXJzb3JUbyhmb2xkLnN0YXJ0LnJvdywgZm9sZC5zdGFydC5jb2x1bW4pO1xuXG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5zZXNzaW9uLmdldExpbmUocm93KS5zdWJzdHJpbmcoMCwgY29sdW1uKTtcbiAgICAgICAgaWYgKGNvbHVtbiA9PSAwKSB7XG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgcm93LS07XG4gICAgICAgICAgICAgICAgbGluZSA9IHRoaXMuZG9jLmdldExpbmUocm93KTtcbiAgICAgICAgICAgIH0gd2hpbGUgKHJvdyA+IDAgJiYgL15cXHMqJC8udGVzdChsaW5lKSlcblxuICAgICAgICAgICAgY29sdW1uID0gbGluZS5sZW5ndGg7XG4gICAgICAgICAgICBpZiAoIS9cXHMrJC8udGVzdChsaW5lKSlcbiAgICAgICAgICAgICAgICBsaW5lID0gXCJcIlxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxlZnRPZkN1cnNvciA9IHN0cmluZ1JldmVyc2UobGluZSk7XG4gICAgICAgIHZhciBpbmRleCA9IHRoaXMuJHNob3J0V29yZEVuZEluZGV4KGxlZnRPZkN1cnNvcik7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMubW92ZUN1cnNvclRvKHJvdywgY29sdW1uIC0gaW5kZXgpO1xuICAgIH1cblxuICAgIG1vdmVDdXJzb3JXb3JkUmlnaHQoKSB7XG4gICAgICAgIC8vIFNlZSBrZXlib2FyZC9lbWFjcy5qc1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uWyckc2VsZWN0TG9uZ1dvcmRzJ10pIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckxvbmdXb3JkUmlnaHQoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclNob3J0V29yZFJpZ2h0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBtb3ZlQ3Vyc29yV29yZExlZnQoKSB7XG4gICAgICAgIC8vIFNlZSBrZXlib2FyZC9lbWFjcy5qc1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uWyckc2VsZWN0TG9uZ1dvcmRzJ10pIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckxvbmdXb3JkTGVmdCgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yU2hvcnRXb3JkTGVmdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHBvc2l0aW9uIGluZGljYXRlZCBieSB0aGUgcGFyYW1ldGVycy4gTmVnYXRpdmUgbnVtYmVycyBtb3ZlIHRoZSBjdXJzb3IgYmFja3dhcmRzIGluIHRoZSBkb2N1bWVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3dzIFRoZSBudW1iZXIgb2Ygcm93cyB0byBtb3ZlIGJ5XG4gICAgKiBAcGFyYW0ge051bWJlcn0gY2hhcnMgVGhlIG51bWJlciBvZiBjaGFyYWN0ZXJzIHRvIG1vdmUgYnlcbiAgICAqXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckJ5KHJvd3MsIGNoYXJzKSB7XG4gICAgICAgIHZhciBzY3JlZW5Qb3MgPSB0aGlzLnNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKFxuICAgICAgICAgICAgdGhpcy5sZWFkLnJvdyxcbiAgICAgICAgICAgIHRoaXMubGVhZC5jb2x1bW5cbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoY2hhcnMgPT09IDApIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiRkZXNpcmVkQ29sdW1uKVxuICAgICAgICAgICAgICAgIHNjcmVlblBvcy5jb2x1bW4gPSB0aGlzLiRkZXNpcmVkQ29sdW1uO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuJGRlc2lyZWRDb2x1bW4gPSBzY3JlZW5Qb3MuY29sdW1uO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGRvY1BvcyA9IHRoaXMuc2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUG9zLnJvdyArIHJvd3MsIHNjcmVlblBvcy5jb2x1bW4pO1xuXG4gICAgICAgIGlmIChyb3dzICE9PSAwICYmIGNoYXJzID09PSAwICYmIGRvY1Bvcy5yb3cgPT09IHRoaXMubGVhZC5yb3cgJiYgZG9jUG9zLmNvbHVtbiA9PT0gdGhpcy5sZWFkLmNvbHVtbikge1xuICAgICAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi5saW5lV2lkZ2V0cyAmJiB0aGlzLnNlc3Npb24ubGluZVdpZGdldHNbZG9jUG9zLnJvd10pXG4gICAgICAgICAgICAgICAgZG9jUG9zLnJvdysrO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gbW92ZSB0aGUgY3Vyc29yIGFuZCB1cGRhdGUgdGhlIGRlc2lyZWQgY29sdW1uXG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGRvY1Bvcy5yb3csIGRvY1Bvcy5jb2x1bW4gKyBjaGFycywgY2hhcnMgPT09IDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB0byB0aGUgcG9zaXRpb24gaW5kaWNhdGVkIGJ5IGl0cyBgcm93YCBhbmQgYGNvbHVtbmAuXG4gICAgKiBAcGFyYW0ge09iamVjdH0gcG9zaXRpb24gVGhlIHBvc2l0aW9uIHRvIG1vdmUgdG9cbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JUb1Bvc2l0aW9uKHBvc2l0aW9uKSB7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHBvc2l0aW9uLnJvdywgcG9zaXRpb24uY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHJvdyBhbmQgY29sdW1uIHByb3ZpZGVkLiBbSWYgYHByZXZlbnRVcGRhdGVEZXNpcmVkQ29sdW1uYCBpcyBgdHJ1ZWAsIHRoZW4gdGhlIGN1cnNvciBzdGF5cyBpbiB0aGUgc2FtZSBjb2x1bW4gcG9zaXRpb24gYXMgaXRzIG9yaWdpbmFsIHBvaW50Ll17OiAjcHJldmVudFVwZGF0ZUJvb2xEZXNjfVxuICAgICogQHBhcmFtIHtudW1iZXJ9IHJvdyBUaGUgcm93IHRvIG1vdmUgdG9cbiAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW4gVGhlIGNvbHVtbiB0byBtb3ZlIHRvXG4gICAgKiBAcGFyYW0ge2Jvb2xlYW59IGtlZXBEZXNpcmVkQ29sdW1uIFtJZiBgdHJ1ZWAsIHRoZSBjdXJzb3IgbW92ZSBkb2VzIG5vdCByZXNwZWN0IHRoZSBwcmV2aW91cyBjb2x1bW5dezogI3ByZXZlbnRVcGRhdGVCb29sfVxuICAgICovXG4gICAgbW92ZUN1cnNvclRvKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwga2VlcERlc2lyZWRDb2x1bW4/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIC8vIEVuc3VyZSB0aGUgcm93L2NvbHVtbiBpcyBub3QgaW5zaWRlIG9mIGEgZm9sZC5cbiAgICAgICAgdmFyIGZvbGQgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZEF0KHJvdywgY29sdW1uLCAxKTtcbiAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgIHJvdyA9IGZvbGQuc3RhcnQucm93O1xuICAgICAgICAgICAgY29sdW1uID0gZm9sZC5zdGFydC5jb2x1bW47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiRrZWVwRGVzaXJlZENvbHVtbk9uQ2hhbmdlID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5sZWFkLnNldFBvc2l0aW9uKHJvdywgY29sdW1uKTtcbiAgICAgICAgdGhpcy4ka2VlcERlc2lyZWRDb2x1bW5PbkNoYW5nZSA9IGZhbHNlO1xuXG4gICAgICAgIGlmICgha2VlcERlc2lyZWRDb2x1bW4pXG4gICAgICAgICAgICB0aGlzLiRkZXNpcmVkQ29sdW1uID0gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHNjcmVlbiBwb3NpdGlvbiBpbmRpY2F0ZWQgYnkgcm93IGFuZCBjb2x1bW4uIHs6cHJldmVudFVwZGF0ZUJvb2xEZXNjfVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIG1vdmUgdG9cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGNvbHVtbiB0byBtb3ZlIHRvXG4gICAgKiBAcGFyYW0ge0Jvb2xlYW59IGtlZXBEZXNpcmVkQ29sdW1uIHs6cHJldmVudFVwZGF0ZUJvb2x9XG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yVG9TY3JlZW4ocm93LCBjb2x1bW4sIGtlZXBEZXNpcmVkQ29sdW1uKSB7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLnNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHJvdywgY29sdW1uKTtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocG9zLnJvdywgcG9zLmNvbHVtbiwga2VlcERlc2lyZWRDb2x1bW4pO1xuICAgIH1cblxuICAgIC8vIHJlbW92ZSBsaXN0ZW5lcnMgZnJvbSBkb2N1bWVudFxuICAgIGRldGFjaCgpIHtcbiAgICAgICAgdGhpcy5sZWFkLmRldGFjaCgpO1xuICAgICAgICB0aGlzLmFuY2hvci5kZXRhY2goKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uID0gdGhpcy5kb2MgPSBudWxsO1xuICAgIH1cblxuICAgIGZyb21PcmllbnRlZFJhbmdlKHJhbmdlOiBPcmllbnRlZFJhbmdlKSB7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2UsIHJhbmdlLmN1cnNvciA9PSByYW5nZS5zdGFydCk7XG4gICAgICAgIHRoaXMuJGRlc2lyZWRDb2x1bW4gPSByYW5nZS5kZXNpcmVkQ29sdW1uIHx8IHRoaXMuJGRlc2lyZWRDb2x1bW47XG4gICAgfVxuXG4gICAgdG9PcmllbnRlZFJhbmdlKHJhbmdlPykge1xuICAgICAgICB2YXIgciA9IHRoaXMuZ2V0UmFuZ2UoKTtcbiAgICAgICAgaWYgKHJhbmdlKSB7XG4gICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4gPSByLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LnJvdyA9IHIuc3RhcnQucm93O1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IHIuZW5kLmNvbHVtbjtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5yb3cgPSByLmVuZC5yb3c7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByYW5nZSA9IHI7XG4gICAgICAgIH1cblxuICAgICAgICByYW5nZS5jdXJzb3IgPSB0aGlzLmlzQmFja3dhcmRzKCkgPyByYW5nZS5zdGFydCA6IHJhbmdlLmVuZDtcbiAgICAgICAgcmFuZ2UuZGVzaXJlZENvbHVtbiA9IHRoaXMuJGRlc2lyZWRDb2x1bW47XG4gICAgICAgIHJldHVybiByYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNhdmVzIHRoZSBjdXJyZW50IGN1cnNvciBwb3NpdGlvbiBhbmQgY2FsbHMgYGZ1bmNgIHRoYXQgY2FuIGNoYW5nZSB0aGUgY3Vyc29yXG4gICAgKiBwb3N0aW9uLiBUaGUgcmVzdWx0IGlzIHRoZSByYW5nZSBvZiB0aGUgc3RhcnRpbmcgYW5kIGV2ZW50dWFsIGN1cnNvciBwb3NpdGlvbi5cbiAgICAqIFdpbGwgcmVzZXQgdGhlIGN1cnNvciBwb3NpdGlvbi5cbiAgICAqIEBwYXJhbSB7RnVuY3Rpb259IFRoZSBjYWxsYmFjayB0aGF0IHNob3VsZCBjaGFuZ2UgdGhlIGN1cnNvciBwb3NpdGlvblxuICAgICogQHJldHVybnMge1JhbmdlfVxuICAgICpcbiAgICAqKi9cbiAgICBnZXRSYW5nZU9mTW92ZW1lbnRzKGZ1bmMpIHtcbiAgICAgICAgdmFyIHN0YXJ0ID0gdGhpcy5nZXRDdXJzb3IoKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZ1bmMuY2FsbChudWxsLCB0aGlzKTtcbiAgICAgICAgICAgIHZhciBlbmQgPSB0aGlzLmdldEN1cnNvcigpO1xuICAgICAgICAgICAgcmV0dXJuIFJhbmdlLmZyb21Qb2ludHMoc3RhcnQsIGVuZCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHJldHVybiBSYW5nZS5mcm9tUG9pbnRzKHN0YXJ0LCBzdGFydCk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKHN0YXJ0KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRvSlNPTigpIHtcbiAgICAgICAgaWYgKHRoaXMucmFuZ2VDb3VudCkge1xuICAgICAgICAgICAgdmFyIGRhdGE6IGFueSA9IHRoaXMucmFuZ2VzLm1hcChmdW5jdGlvbihyKSB7XG4gICAgICAgICAgICAgICAgdmFyIHIxID0gci5jbG9uZSgpO1xuICAgICAgICAgICAgICAgIHIxLmlzQmFja3dhcmRzID0gci5jdXJzb3IgPT0gci5zdGFydDtcbiAgICAgICAgICAgICAgICByZXR1cm4gcjE7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBkYXRhOiBhbnkgPSB0aGlzLmdldFJhbmdlKCk7XG4gICAgICAgICAgICBkYXRhLmlzQmFja3dhcmRzID0gdGhpcy5pc0JhY2t3YXJkcygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkYXRhO1xuICAgIH1cblxuICAgIHByaXZhdGUgdG9TaW5nbGVSYW5nZShkYXRhKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlNlbGVjdGlvbi50b1NpbmdsZVJhbmdlIGlzIHVuc3VwcG9ydGVkXCIpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhZGRSYW5nZShkYXRhLCBzb21ldGhpbmc6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiU2VsZWN0aW9uLmFkZFJhbmdlIGlzIHVuc3VwcG9ydGVkXCIpO1xuICAgIH1cblxuICAgIGZyb21KU09OKGRhdGEpIHtcbiAgICAgICAgaWYgKGRhdGEuc3RhcnQgPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5yYW5nZUxpc3QpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRvU2luZ2xlUmFuZ2UoZGF0YVswXSk7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IGRhdGEubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciByOiBhbnkgPSBSYW5nZS5mcm9tUG9pbnRzKGRhdGFbaV0uc3RhcnQsIGRhdGFbaV0uZW5kKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEuaXNCYWNrd2FyZHMpXG4gICAgICAgICAgICAgICAgICAgICAgICByLmN1cnNvciA9IHIuc3RhcnQ7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkUmFuZ2UociwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgIGRhdGEgPSBkYXRhWzBdO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnJhbmdlTGlzdClcbiAgICAgICAgICAgIHRoaXMudG9TaW5nbGVSYW5nZShkYXRhKTtcbiAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25SYW5nZShkYXRhLCBkYXRhLmlzQmFja3dhcmRzKTtcbiAgICB9XG5cbiAgICBpc0VxdWFsKGRhdGEpIHtcbiAgICAgICAgaWYgKChkYXRhLmxlbmd0aCB8fCB0aGlzLnJhbmdlQ291bnQpICYmIGRhdGEubGVuZ3RoICE9IHRoaXMucmFuZ2VDb3VudClcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKCFkYXRhLmxlbmd0aCB8fCAhdGhpcy5yYW5nZXMpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRSYW5nZSgpLmlzRXF1YWwoZGF0YSk7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IHRoaXMucmFuZ2VzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgaWYgKCF0aGlzLnJhbmdlc1tpXS5pc0VxdWFsKGRhdGFbaV0pKVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbn1cbiJdfQ==