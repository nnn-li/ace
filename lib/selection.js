import { stringReverse } from "./lib/lang";
import EventEmitterClass from "./lib/event_emitter";
import Range from "./Range";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VsZWN0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3NlbGVjdGlvbi50cyJdLCJuYW1lcyI6WyJTZWxlY3Rpb24iLCJTZWxlY3Rpb24uY29uc3RydWN0b3IiLCJTZWxlY3Rpb24uaXNFbXB0eSIsIlNlbGVjdGlvbi5pc011bHRpTGluZSIsIlNlbGVjdGlvbi5nZXRDdXJzb3IiLCJTZWxlY3Rpb24uc2V0U2VsZWN0aW9uQW5jaG9yIiwiU2VsZWN0aW9uLmdldFNlbGVjdGlvbkFuY2hvciIsIlNlbGVjdGlvbi5nZXRTZWxlY3Rpb25MZWFkIiwiU2VsZWN0aW9uLnNoaWZ0U2VsZWN0aW9uIiwiU2VsZWN0aW9uLmlzQmFja3dhcmRzIiwiU2VsZWN0aW9uLmdldFJhbmdlIiwiU2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uIiwiU2VsZWN0aW9uLnNlbGVjdEFsbCIsIlNlbGVjdGlvbi5zZXRSYW5nZSIsIlNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZSIsIlNlbGVjdGlvbi4kbW92ZVNlbGVjdGlvbiIsIlNlbGVjdGlvbi5zZWxlY3RUbyIsIlNlbGVjdGlvbi5zZWxlY3RUb1Bvc2l0aW9uIiwiU2VsZWN0aW9uLm1vdmVUbyIsIlNlbGVjdGlvbi5tb3ZlVG9Qb3NpdGlvbiIsIlNlbGVjdGlvbi5zZWxlY3RVcCIsIlNlbGVjdGlvbi5zZWxlY3REb3duIiwiU2VsZWN0aW9uLnNlbGVjdFJpZ2h0IiwiU2VsZWN0aW9uLnNlbGVjdExlZnQiLCJTZWxlY3Rpb24uc2VsZWN0TGluZVN0YXJ0IiwiU2VsZWN0aW9uLnNlbGVjdExpbmVFbmQiLCJTZWxlY3Rpb24uc2VsZWN0RmlsZUVuZCIsIlNlbGVjdGlvbi5zZWxlY3RGaWxlU3RhcnQiLCJTZWxlY3Rpb24uc2VsZWN0V29yZFJpZ2h0IiwiU2VsZWN0aW9uLnNlbGVjdFdvcmRMZWZ0IiwiU2VsZWN0aW9uLmdldFdvcmRSYW5nZSIsIlNlbGVjdGlvbi5zZWxlY3RXb3JkIiwiU2VsZWN0aW9uLnNlbGVjdEFXb3JkIiwiU2VsZWN0aW9uLmdldExpbmVSYW5nZSIsIlNlbGVjdGlvbi5zZWxlY3RMaW5lIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JVcCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yRG93biIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGVmdCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yUmlnaHQiLCJTZWxlY3Rpb24ubW92ZUN1cnNvckxpbmVTdGFydCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGluZUVuZCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yRmlsZUVuZCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yRmlsZVN0YXJ0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JMb25nV29yZFJpZ2h0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JMb25nV29yZExlZnQiLCJTZWxlY3Rpb24uJHNob3J0V29yZEVuZEluZGV4IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JTaG9ydFdvcmRSaWdodCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yU2hvcnRXb3JkTGVmdCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yV29yZFJpZ2h0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JXb3JkTGVmdCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yQnkiLCJTZWxlY3Rpb24ubW92ZUN1cnNvclRvUG9zaXRpb24iLCJTZWxlY3Rpb24ubW92ZUN1cnNvclRvIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JUb1NjcmVlbiIsIlNlbGVjdGlvbi5kZXRhY2giLCJTZWxlY3Rpb24uZnJvbU9yaWVudGVkUmFuZ2UiLCJTZWxlY3Rpb24udG9PcmllbnRlZFJhbmdlIiwiU2VsZWN0aW9uLmdldFJhbmdlT2ZNb3ZlbWVudHMiLCJTZWxlY3Rpb24udG9KU09OIiwiU2VsZWN0aW9uLnRvU2luZ2xlUmFuZ2UiLCJTZWxlY3Rpb24uYWRkUmFuZ2UiLCJTZWxlY3Rpb24uZnJvbUpTT04iLCJTZWxlY3Rpb24uaXNFcXVhbCJdLCJtYXBwaW5ncyI6Ik9BK0JPLEVBQUMsYUFBYSxFQUFDLE1BQU0sWUFBWTtP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QSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDL0VBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLE1BQU1BLENBQUNBLElBQUlBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLEVBQUVBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ2pEQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUtEakMsVUFBVUE7UUFDTmtDLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDaERBLENBQUNBO0lBTURsQyxZQUFZQTtRQUNSbUMsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDN0JBLENBQUNBO0lBTURuQyxjQUFjQTtRQUNWb0MsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDNUJBLENBQUNBO0lBTURwQyxjQUFjQTtRQUNWcUMsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsRUFBRUEsRUFDaENBLElBQUlBLENBQUNBO1FBRVRBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQy9EQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUN6REEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFN0JBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqQkEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDL0VBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO1lBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxPQUFPQSxFQUFFQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxJQUFJQSxPQUFPQSxDQUFDQTtnQkFDOUlBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBQ25DQSxJQUFJQTtnQkFDQUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDakNBLENBQUNBO0lBQ0xBLENBQUNBO0lBTURyQyxlQUFlQTtRQUNYc0MsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0E7UUFDbENBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQzFEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNQQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNyREEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEVBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUMzQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUNBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO1lBQ3hDQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUN2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsSUFBSUEsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2hKQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUNsQ0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0ZBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQzVCQSxDQUFDQTtRQUNMQSxDQUFDQTtJQUNMQSxDQUFDQTtJQU1EdEMsbUJBQW1CQTtRQUNmdUMsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDeEJBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBO1FBQzlCQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxtQkFBbUJBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBRzlEQSxJQUFJQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLHdC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QUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2pDQSxJQUFJQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUUzQ0EsSUFBSUEsS0FBS0EsQ0FBQ0E7UUFDVkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdENBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBR25DQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNsREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDUEEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDakRBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBR0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3REQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUM1Q0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDdENBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQzNDQSxDQUFDQTtRQUdEQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4QkEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDcENBLElBQUlBLENBQUNBLGVBQWVBLEVBQUVBLENBQUNBO1lBQ3ZCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxTQUFTQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDL0JBLElBQUlBLENBQUNBLG1CQUFtQkEsRUFBRUEsQ0FBQ0E7WUFDL0JBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBR0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ25EQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUN6Q0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdkNBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO0lBQ25DQSxDQUFDQTtJQU1EM0Msc0JBQXNCQTtRQUNsQjRDLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBO1FBQ3hCQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUc5QkEsSUFBSUEsSUFBSUEsQ0FBQ0E7UUFDVEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakRBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQ3JEQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUdEQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxlQUFlQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN4REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZEEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQUE7UUFDcERBLENBQUNBO1FBRURBLElBQUlBLFlBQVlBLEdBQUdBLGFBQWFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3RDQSxJQUFJQSxLQUFLQSxDQUFDQTtRQUNWQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN0Q0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFHbkNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JEQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUM1Q0EsWUFBWUEsR0FBR0EsWUFBWUEs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TUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0E7WUFDcENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQUE7UUFDcEJBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtBQUNMOUQsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXG5pbXBvcnQgRWRpdG9yRG9jdW1lbnQgZnJvbSBcIi4vRWRpdG9yRG9jdW1lbnRcIjtcbmltcG9ydCB7c3RyaW5nUmV2ZXJzZX0gZnJvbSBcIi4vbGliL2xhbmdcIjtcbmltcG9ydCBFdmVudEVtaXR0ZXJDbGFzcyBmcm9tIFwiLi9saWIvZXZlbnRfZW1pdHRlclwiO1xuaW1wb3J0IE9yaWVudGVkUmFuZ2UgZnJvbSBcIi4vT3JpZW50ZWRSYW5nZVwiO1xuaW1wb3J0IFJhbmdlIGZyb20gXCIuL1JhbmdlXCI7XG5pbXBvcnQge1JhbmdlTGlzdH0gZnJvbSBcIi4vcmFuZ2VfbGlzdFwiO1xuaW1wb3J0IEVkaXRTZXNzaW9uIGZyb20gXCIuL0VkaXRTZXNzaW9uXCI7XG5pbXBvcnQgQW5jaG9yIGZyb20gXCIuL0FuY2hvclwiO1xuXG4vKipcbiAqIENvbnRhaW5zIHRoZSBjdXJzb3IgcG9zaXRpb24gYW5kIHRoZSB0ZXh0IHNlbGVjdGlvbiBvZiBhbiBlZGl0IHNlc3Npb24uXG4gKlxuICogVGhlIHJvdy9jb2x1bW5zIHVzZWQgaW4gdGhlIHNlbGVjdGlvbiBhcmUgaW4gZG9jdW1lbnQgY29vcmRpbmF0ZXMgcmVwcmVzZW50aW5nIHRocyBjb29yZGluYXRlcyBhcyB0aGV6IGFwcGVhciBpbiB0aGUgZG9jdW1lbnQgYmVmb3JlIGFwcGx5aW5nIHNvZnQgd3JhcCBhbmQgZm9sZGluZy5cbiAqIEBjbGFzcyBTZWxlY3Rpb25cbiAqKi9cblxuXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgY3Vyc29yIHBvc2l0aW9uIGNoYW5nZXMuXG4gKiBAZXZlbnQgY2hhbmdlQ3Vyc29yXG4gKlxuKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgY3Vyc29yIHNlbGVjdGlvbiBjaGFuZ2VzLlxuICogXG4gKiAgQGV2ZW50IGNoYW5nZVNlbGVjdGlvblxuKiovXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgYFNlbGVjdGlvbmAgb2JqZWN0LlxuICogQHBhcmFtIHtFZGl0U2Vzc2lvbn0gc2Vzc2lvbiBUaGUgc2Vzc2lvbiB0byB1c2VcbiAqIFxuICogQGNvbnN0cnVjdG9yXG4gKiovXG5leHBvcnQgY2xhc3MgU2VsZWN0aW9uIGV4dGVuZHMgRXZlbnRFbWl0dGVyQ2xhc3Mge1xuICAgIHByaXZhdGUgc2Vzc2lvbjogRWRpdFNlc3Npb247XG4gICAgLy8gRklYTUU6IE1heWJlIFNlbGVjdGlvbiBzaG91bGQgb25seSBjb3VwbGUgdG8gdGhlIEVkaXRTZXNzaW9uP1xuICAgIHByaXZhdGUgZG9jOiBFZGl0b3JEb2N1bWVudDtcbiAgICAvLyBXaHkgZG8gd2Ugc2VlbSB0byBoYXZlIGNvcGllcz9cbiAgICBwdWJsaWMgbGVhZDogQW5jaG9yO1xuICAgIHB1YmxpYyBhbmNob3I6IEFuY2hvcjtcbiAgICBwcml2YXRlIHNlbGVjdGlvbkxlYWQ6IEFuY2hvcjtcbiAgICBwcml2YXRlIHNlbGVjdGlvbkFuY2hvcjogQW5jaG9yO1xuICAgIHByaXZhdGUgJGlzRW1wdHk6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAka2VlcERlc2lyZWRDb2x1bW5PbkNoYW5nZTogYm9vbGVhbjtcbiAgICBwcml2YXRlICRkZXNpcmVkQ29sdW1uOyAgLy8gSXMgdGhpcyB1c2VkIGFueXdoZXJlP1xuICAgIHByaXZhdGUgcmFuZ2VDb3VudDtcbiAgICBwdWJsaWMgcmFuZ2VzO1xuICAgIHB1YmxpYyByYW5nZUxpc3Q6IFJhbmdlTGlzdDtcbiAgICBjb25zdHJ1Y3RvcihzZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICB0aGlzLnNlc3Npb24gPSBzZXNzaW9uO1xuICAgICAgICB0aGlzLmRvYyA9IHNlc3Npb24uZ2V0RG9jdW1lbnQoKTtcblxuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIHRoaXMubGVhZCA9IHRoaXMuc2VsZWN0aW9uTGVhZCA9IHRoaXMuZG9jLmNyZWF0ZUFuY2hvcigwLCAwKTtcbiAgICAgICAgdGhpcy5hbmNob3IgPSB0aGlzLnNlbGVjdGlvbkFuY2hvciA9IHRoaXMuZG9jLmNyZWF0ZUFuY2hvcigwLCAwKTtcblxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMubGVhZC5vbihcImNoYW5nZVwiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBzZWxmLl9lbWl0KFwiY2hhbmdlQ3Vyc29yXCIpO1xuICAgICAgICAgICAgaWYgKCFzZWxmLiRpc0VtcHR5KVxuICAgICAgICAgICAgICAgIHNlbGYuX2VtaXQoXCJjaGFuZ2VTZWxlY3Rpb25cIik7XG4gICAgICAgICAgICBpZiAoIXNlbGYuJGtlZXBEZXNpcmVkQ29sdW1uT25DaGFuZ2UgJiYgZS5vbGQuY29sdW1uICE9IGUudmFsdWUuY29sdW1uKVxuICAgICAgICAgICAgICAgIHNlbGYuJGRlc2lyZWRDb2x1bW4gPSBudWxsO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnNlbGVjdGlvbkFuY2hvci5vbihcImNoYW5nZVwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmICghc2VsZi4kaXNFbXB0eSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX2VtaXQoXCJjaGFuZ2VTZWxlY3Rpb25cIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHNlbGVjdGlvbiBpcyBlbXB0eS5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBpc0VtcHR5KCkge1xuICAgICAgICAvLyBXaGF0IGlzIHRoZSBkaWZmZXJlbmNlIGJldHdlZW4gJGlzRW1wdHkgYW5kIHdoYXQgdGhpcyBmdW5jdGlvbiByZXR1cm5zP1xuICAgICAgICByZXR1cm4gKHRoaXMuJGlzRW1wdHkgfHwgKFxuICAgICAgICAgICAgdGhpcy5hbmNob3Iucm93ID09IHRoaXMubGVhZC5yb3cgJiZcbiAgICAgICAgICAgIHRoaXMuYW5jaG9yLmNvbHVtbiA9PSB0aGlzLmxlYWQuY29sdW1uXG4gICAgICAgICkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHNlbGVjdGlvbiBpcyBhIG11bHRpLWxpbmUuXG4gICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAqKi9cbiAgICBpc011bHRpTGluZSgpIHtcbiAgICAgICAgaWYgKHRoaXMuaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy5nZXRSYW5nZSgpLmlzTXVsdGlMaW5lKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBgcm93YCBhbmQgYGNvbHVtbmAgY3VycmVudCBwb3NpdGlvbiBvZiB0aGUgY3Vyc29yLlxuICAgICogQHJldHVybnMge09iamVjdH1cbiAgICAqKi9cbiAgICBnZXRDdXJzb3IoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxlYWQuZ2V0UG9zaXRpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNldHMgdGhlIHJvdyBhbmQgY29sdW1uIHBvc2l0aW9uIG9mIHRoZSBhbmNob3IuIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VTZWxlY3Rpb24nYCBldmVudC5cbiAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3cgVGhlIG5ldyByb3dcbiAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW4gVGhlIG5ldyBjb2x1bW5cbiAgICAqKi9cbiAgICBzZXRTZWxlY3Rpb25BbmNob3Iocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuYW5jaG9yLnNldFBvc2l0aW9uKHJvdywgY29sdW1uKTtcblxuICAgICAgICBpZiAodGhpcy4kaXNFbXB0eSkge1xuICAgICAgICAgICAgdGhpcy4kaXNFbXB0eSA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5fZW1pdChcImNoYW5nZVNlbGVjdGlvblwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgYHJvd2AgYW5kIGBjb2x1bW5gIG9mIHRoZSBjYWxsaW5nIHNlbGVjdGlvbiBhbmNob3IuXG4gICAgKlxuICAgICogQHJldHVybnMge09iamVjdH1cbiAgICAqIEByZWxhdGVkIEFuY2hvci5nZXRQb3NpdGlvblxuICAgICoqL1xuICAgIGdldFNlbGVjdGlvbkFuY2hvcigpIHtcbiAgICAgICAgaWYgKHRoaXMuJGlzRW1wdHkpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRTZWxlY3Rpb25MZWFkKClcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYW5jaG9yLmdldFBvc2l0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgYHJvd2AgYW5kIGBjb2x1bW5gIG9mIHRoZSBjYWxsaW5nIHNlbGVjdGlvbiBsZWFkLlxuICAgICogQHJldHVybnMge09iamVjdH1cbiAgICAqKi9cbiAgICBnZXRTZWxlY3Rpb25MZWFkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sZWFkLmdldFBvc2l0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTaGlmdHMgdGhlIHNlbGVjdGlvbiB1cCAob3IgZG93biwgaWYgW1tTZWxlY3Rpb24uaXNCYWNrd2FyZHMgYGlzQmFja3dhcmRzKClgXV0gaXMgdHJ1ZSkgdGhlIGdpdmVuIG51bWJlciBvZiBjb2x1bW5zLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbnMgVGhlIG51bWJlciBvZiBjb2x1bW5zIHRvIHNoaWZ0IGJ5XG4gICAgKlxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgc2hpZnRTZWxlY3Rpb24oY29sdW1ucykge1xuICAgICAgICBpZiAodGhpcy4kaXNFbXB0eSkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8odGhpcy5sZWFkLnJvdywgdGhpcy5sZWFkLmNvbHVtbiArIGNvbHVtbnMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGFuY2hvciA9IHRoaXMuZ2V0U2VsZWN0aW9uQW5jaG9yKCk7XG4gICAgICAgIHZhciBsZWFkID0gdGhpcy5nZXRTZWxlY3Rpb25MZWFkKCk7XG5cbiAgICAgICAgdmFyIGlzQmFja3dhcmRzID0gdGhpcy5pc0JhY2t3YXJkcygpO1xuXG4gICAgICAgIGlmICghaXNCYWNrd2FyZHMgfHwgYW5jaG9yLmNvbHVtbiAhPT0gMClcbiAgICAgICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uQW5jaG9yKGFuY2hvci5yb3csIGFuY2hvci5jb2x1bW4gKyBjb2x1bW5zKTtcblxuICAgICAgICBpZiAoaXNCYWNrd2FyZHMgfHwgbGVhZC5jb2x1bW4gIT09IDApIHtcbiAgICAgICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8obGVhZC5yb3csIGxlYWQuY29sdW1uICsgY29sdW1ucyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHNlbGVjdGlvbiBpcyBnb2luZyBiYWNrd2FyZHMgaW4gdGhlIGRvY3VtZW50LlxuICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgKiovXG4gICAgaXNCYWNrd2FyZHMoKSB7XG4gICAgICAgIHZhciBhbmNob3IgPSB0aGlzLmFuY2hvcjtcbiAgICAgICAgdmFyIGxlYWQgPSB0aGlzLmxlYWQ7XG4gICAgICAgIHJldHVybiAoYW5jaG9yLnJvdyA+IGxlYWQucm93IHx8IChhbmNob3Iucm93ID09IGxlYWQucm93ICYmIGFuY2hvci5jb2x1bW4gPiBsZWFkLmNvbHVtbikpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogW1JldHVybnMgdGhlIFtbUmFuZ2VdXSBmb3IgdGhlIHNlbGVjdGVkIHRleHQuXXs6ICNTZWxlY3Rpb24uZ2V0UmFuZ2V9XG4gICAgKiBAcmV0dXJucyB7UmFuZ2V9XG4gICAgKiovXG4gICAgZ2V0UmFuZ2UoKSB7XG4gICAgICAgIHZhciBhbmNob3IgPSB0aGlzLmFuY2hvcjtcbiAgICAgICAgdmFyIGxlYWQgPSB0aGlzLmxlYWQ7XG5cbiAgICAgICAgaWYgKHRoaXMuaXNFbXB0eSgpKVxuICAgICAgICAgICAgcmV0dXJuIFJhbmdlLmZyb21Qb2ludHMobGVhZCwgbGVhZCk7XG5cbiAgICAgICAgaWYgKHRoaXMuaXNCYWNrd2FyZHMoKSkge1xuICAgICAgICAgICAgcmV0dXJuIFJhbmdlLmZyb21Qb2ludHMobGVhZCwgYW5jaG9yKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBSYW5nZS5mcm9tUG9pbnRzKGFuY2hvciwgbGVhZCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFtFbXB0aWVzIHRoZSBzZWxlY3Rpb24gKGJ5IGRlLXNlbGVjdGluZyBpdCkuIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VTZWxlY3Rpb24nYCBldmVudC5dezogI1NlbGVjdGlvbi5jbGVhclNlbGVjdGlvbn1cbiAgICAqKi9cbiAgICBjbGVhclNlbGVjdGlvbigpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRpc0VtcHR5KSB7XG4gICAgICAgICAgICB0aGlzLiRpc0VtcHR5ID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VTZWxlY3Rpb25cIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNlbGVjdHMgYWxsIHRoZSB0ZXh0IGluIHRoZSBkb2N1bWVudC5cbiAgICAqKi9cbiAgICBzZWxlY3RBbGwoKSB7XG4gICAgICAgIHZhciBsYXN0Um93ID0gdGhpcy5kb2MuZ2V0TGVuZ3RoKCkgLSAxO1xuICAgICAgICB0aGlzLnNldFNlbGVjdGlvbkFuY2hvcigwLCAwKTtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8obGFzdFJvdywgdGhpcy5kb2MuZ2V0TGluZShsYXN0Um93KS5sZW5ndGgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBwcm92aWRlZCByYW5nZS5cbiAgICAqIEBwYXJhbSB7UmFuZ2V9IHJhbmdlIFRoZSByYW5nZSBvZiB0ZXh0IHRvIHNlbGVjdFxuICAgICogQHBhcmFtIHtCb29sZWFufSByZXZlcnNlIEluZGljYXRlcyBpZiB0aGUgcmFuZ2Ugc2hvdWxkIGdvIGJhY2t3YXJkcyAoYHRydWVgKSBvciBub3RcbiAgICAqXG4gICAgKlxuICAgICogQG1ldGhvZCBzZXRTZWxlY3Rpb25SYW5nZVxuICAgICogQGFsaWFzIHNldFJhbmdlXG4gICAgKiovXG4gICAgc2V0UmFuZ2UocmFuZ2UsIHJldmVyc2U/OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2UsIHJldmVyc2UpO1xuICAgIH1cbiAgICBzZXRTZWxlY3Rpb25SYW5nZShyYW5nZTogeyBzdGFydDogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTsgZW5kOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IH0sIHJldmVyc2U/OiBib29sZWFuKSB7XG4gICAgICAgIGlmIChyZXZlcnNlKSB7XG4gICAgICAgICAgICB0aGlzLnNldFNlbGVjdGlvbkFuY2hvcihyYW5nZS5lbmQucm93LCByYW5nZS5lbmQuY29sdW1uKTtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0VG8ocmFuZ2Uuc3RhcnQucm93LCByYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25BbmNob3IocmFuZ2Uuc3RhcnQucm93LCByYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RUbyhyYW5nZS5lbmQucm93LCByYW5nZS5lbmQuY29sdW1uKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5nZXRSYW5nZSgpLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuJGlzRW1wdHkgPSB0cnVlO1xuICAgICAgICB0aGlzLiRkZXNpcmVkQ29sdW1uID0gbnVsbDtcbiAgICB9XG5cbiAgICAkbW92ZVNlbGVjdGlvbihtb3Zlcikge1xuICAgICAgICB2YXIgbGVhZCA9IHRoaXMubGVhZDtcbiAgICAgICAgaWYgKHRoaXMuJGlzRW1wdHkpXG4gICAgICAgICAgICB0aGlzLnNldFNlbGVjdGlvbkFuY2hvcihsZWFkLnJvdywgbGVhZC5jb2x1bW4pO1xuXG4gICAgICAgIG1vdmVyLmNhbGwodGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIGN1cnNvciB0byB0aGUgaW5kaWNhdGVkIHJvdyBhbmQgY29sdW1uLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIHNlbGVjdCB0b1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIHRvIHNlbGVjdCB0b1xuICAgICpcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHNlbGVjdFRvKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gY3Vyc29yIHRvIHRoZSByb3cgYW5kIGNvbHVtbiBpbmRpY2F0ZWQgYnkgYHBvc2AuXG4gICAgKiBAcGFyYW0ge09iamVjdH0gcG9zIEFuIG9iamVjdCBjb250YWluaW5nIHRoZSByb3cgYW5kIGNvbHVtblxuICAgICpcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHNlbGVjdFRvUG9zaXRpb24ocG9zKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKHBvcyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiBjdXJzb3IgdG8gdGhlIGluZGljYXRlZCByb3cgYW5kIGNvbHVtbi5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBzZWxlY3QgdG9cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGNvbHVtbiB0byBzZWxlY3QgdG9cbiAgICAqXG4gICAgKiovXG4gICAgbW92ZVRvKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gY3Vyc29yIHRvIHRoZSByb3cgYW5kIGNvbHVtbiBpbmRpY2F0ZWQgYnkgYHBvc2AuXG4gICAgKiBAcGFyYW0ge09iamVjdH0gcG9zIEFuIG9iamVjdCBjb250YWluaW5nIHRoZSByb3cgYW5kIGNvbHVtblxuICAgICoqL1xuICAgIG1vdmVUb1Bvc2l0aW9uKHBvcykge1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24ocG9zKTtcbiAgICB9XG5cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdXAgb25lIHJvdy5cbiAgICAqKi9cbiAgICBzZWxlY3RVcCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JVcCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiBkb3duIG9uZSByb3cuXG4gICAgKiovXG4gICAgc2VsZWN0RG93bigpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JEb3duKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiByaWdodCBvbmUgY29sdW1uLlxuICAgICoqL1xuICAgIHNlbGVjdFJpZ2h0KCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvclJpZ2h0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIGxlZnQgb25lIGNvbHVtbi5cbiAgICAqKi9cbiAgICBzZWxlY3RMZWZ0KCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvckxlZnQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIGJlZ2lubmluZyBvZiB0aGUgY3VycmVudCBsaW5lLlxuICAgICoqL1xuICAgIHNlbGVjdExpbmVTdGFydCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JMaW5lU3RhcnQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIGVuZCBvZiB0aGUgY3VycmVudCBsaW5lLlxuICAgICoqL1xuICAgIHNlbGVjdExpbmVFbmQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yTGluZUVuZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB0byB0aGUgZW5kIG9mIHRoZSBmaWxlLlxuICAgICoqL1xuICAgIHNlbGVjdEZpbGVFbmQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yRmlsZUVuZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB0byB0aGUgc3RhcnQgb2YgdGhlIGZpbGUuXG4gICAgKiovXG4gICAgc2VsZWN0RmlsZVN0YXJ0KCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvckZpbGVTdGFydCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB0byB0aGUgZmlyc3Qgd29yZCBvbiB0aGUgcmlnaHQuXG4gICAgKiovXG4gICAgc2VsZWN0V29yZFJpZ2h0KCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvcldvcmRSaWdodCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB0byB0aGUgZmlyc3Qgd29yZCBvbiB0aGUgbGVmdC5cbiAgICAqKi9cbiAgICBzZWxlY3RXb3JkTGVmdCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JXb3JkTGVmdCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIGhpZ2hsaWdodCB0aGUgZW50aXJlIHdvcmQuXG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRXb3JkUmFuZ2VcbiAgICAqKi9cbiAgICBnZXRXb3JkUmFuZ2Uocm93PywgY29sdW1uPykge1xuICAgICAgICBpZiAodHlwZW9mIGNvbHVtbiA9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICB2YXIgY3Vyc29yID0gcm93IHx8IHRoaXMubGVhZDtcbiAgICAgICAgICAgIHJvdyA9IGN1cnNvci5yb3c7XG4gICAgICAgICAgICBjb2x1bW4gPSBjdXJzb3IuY29sdW1uO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0V29yZFJhbmdlKHJvdywgY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBTZWxlY3RzIGFuIGVudGlyZSB3b3JkIGJvdW5kYXJ5LlxuICAgICoqL1xuICAgIHNlbGVjdFdvcmQoKSB7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uUmFuZ2UodGhpcy5nZXRXb3JkUmFuZ2UoKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZWxlY3RzIGEgd29yZCwgaW5jbHVkaW5nIGl0cyByaWdodCB3aGl0ZXNwYWNlLlxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZ2V0QVdvcmRSYW5nZVxuICAgICoqL1xuICAgIHNlbGVjdEFXb3JkKCkge1xuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5nZXRDdXJzb3IoKTtcbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5zZXNzaW9uLmdldEFXb3JkUmFuZ2UoY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbik7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2UpO1xuICAgIH1cblxuICAgIGdldExpbmVSYW5nZShyb3c/OiBudW1iZXIsIGV4Y2x1ZGVMYXN0Q2hhcj86IGJvb2xlYW4pOiBSYW5nZSB7XG4gICAgICAgIHZhciByb3dTdGFydCA9IHR5cGVvZiByb3cgPT0gXCJudW1iZXJcIiA/IHJvdyA6IHRoaXMubGVhZC5yb3c7XG4gICAgICAgIHZhciByb3dFbmQ7XG5cbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldEZvbGRMaW5lKHJvd1N0YXJ0KTtcbiAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICByb3dTdGFydCA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIHJvd0VuZCA9IGZvbGRMaW5lLmVuZC5yb3c7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByb3dFbmQgPSByb3dTdGFydDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChleGNsdWRlTGFzdENoYXIpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUmFuZ2Uocm93U3RhcnQsIDAsIHJvd0VuZCwgdGhpcy5zZXNzaW9uLmdldExpbmUocm93RW5kKS5sZW5ndGgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBSYW5nZShyb3dTdGFydCwgMCwgcm93RW5kICsgMSwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNlbGVjdHMgdGhlIGVudGlyZSBsaW5lLlxuICAgICoqL1xuICAgIHNlbGVjdExpbmUoKSB7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uUmFuZ2UodGhpcy5nZXRMaW5lUmFuZ2UoKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB1cCBvbmUgcm93LlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JVcCgpIHtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yQnkoLTEsIDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgZG93biBvbmUgcm93LlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JEb3duKCkge1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeSgxLCAwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIGxlZnQgb25lIGNvbHVtbi5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yTGVmdCgpIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMubGVhZC5nZXRQb3NpdGlvbigpLFxuICAgICAgICAgICAgZm9sZDtcblxuICAgICAgICBpZiAoZm9sZCA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkQXQoY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbiwgLTEpKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhmb2xkLnN0YXJ0LnJvdywgZm9sZC5zdGFydC5jb2x1bW4pO1xuICAgICAgICB9IGVsc2UgaWYgKGN1cnNvci5jb2x1bW4gPT09IDApIHtcbiAgICAgICAgICAgIC8vIGN1cnNvciBpcyBhIGxpbmUgKHN0YXJ0XG4gICAgICAgICAgICBpZiAoY3Vyc29yLnJvdyA+IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhjdXJzb3Iucm93IC0gMSwgdGhpcy5kb2MuZ2V0TGluZShjdXJzb3Iucm93IC0gMSkubGVuZ3RoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciB0YWJTaXplID0gdGhpcy5zZXNzaW9uLmdldFRhYlNpemUoKTtcbiAgICAgICAgICAgIGlmICh0aGlzLnNlc3Npb24uaXNUYWJTdG9wKGN1cnNvcikgJiYgdGhpcy5kb2MuZ2V0TGluZShjdXJzb3Iucm93KS5zbGljZShjdXJzb3IuY29sdW1uIC0gdGFiU2l6ZSwgY3Vyc29yLmNvbHVtbikuc3BsaXQoXCIgXCIpLmxlbmd0aCAtIDEgPT0gdGFiU2l6ZSlcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeSgwLCAtdGFiU2l6ZSk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yQnkoMCwgLTEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciByaWdodCBvbmUgY29sdW1uLlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JSaWdodCgpIHtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMubGVhZC5nZXRQb3NpdGlvbigpO1xuICAgICAgICB2YXIgZm9sZCA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkQXQocG9zLnJvdywgcG9zLmNvbHVtbiwgMSk7XG4gICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhmb2xkLmVuZC5yb3csIGZvbGQuZW5kLmNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5sZWFkLmNvbHVtbiA9PSB0aGlzLmRvYy5nZXRMaW5lKHRoaXMubGVhZC5yb3cpLmxlbmd0aCkge1xuICAgICAgICAgICAgaWYgKHRoaXMubGVhZC5yb3cgPCB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDEpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyh0aGlzLmxlYWQucm93ICsgMSwgMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgdGFiU2l6ZSA9IHRoaXMuc2Vzc2lvbi5nZXRUYWJTaXplKCk7XG4gICAgICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5sZWFkO1xuICAgICAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi5pc1RhYlN0b3AoY3Vyc29yKSAmJiB0aGlzLmRvYy5nZXRMaW5lKGN1cnNvci5yb3cpLnNsaWNlKGN1cnNvci5jb2x1bW4sIGN1cnNvci5jb2x1bW4gKyB0YWJTaXplKS5zcGxpdChcIiBcIikubGVuZ3RoIC0gMSA9PSB0YWJTaXplKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yQnkoMCwgdGFiU2l6ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeSgwLCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHN0YXJ0IG9mIHRoZSBsaW5lLlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JMaW5lU3RhcnQoKSB7XG4gICAgICAgIHZhciByb3cgPSB0aGlzLmxlYWQucm93O1xuICAgICAgICB2YXIgY29sdW1uID0gdGhpcy5sZWFkLmNvbHVtbjtcbiAgICAgICAgdmFyIHNjcmVlblJvdyA9IHRoaXMuc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUm93KHJvdywgY29sdW1uKTtcblxuICAgICAgICAvLyBEZXRlcm0gdGhlIGRvYy1wb3NpdGlvbiBvZiB0aGUgZmlyc3QgY2hhcmFjdGVyIGF0IHRoZSBzY3JlZW4gbGluZS5cbiAgICAgICAgdmFyIGZpcnN0Q29sdW1uUG9zaXRpb24gPSB0aGlzLnNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgMCk7XG5cbiAgICAgICAgLy8gRGV0ZXJtIHRoZSBsaW5lXG4gICAgICAgIC8vIEhvdyBkb2VzIGdldERpc3BsYXlMaW5lIGdldCBmcm9tIGZvbGRpbmcgb250byBzZXNzaW9uP1xuICAgICAgICB2YXIgYmVmb3JlQ3Vyc29yID0gdGhpcy5zZXNzaW9uWydnZXREaXNwbGF5TGluZSddKFxuICAgICAgICAgICAgcm93LCBudWxsLCBmaXJzdENvbHVtblBvc2l0aW9uLnJvdyxcbiAgICAgICAgICAgIGZpcnN0Q29sdW1uUG9zaXRpb24uY29sdW1uXG4gICAgICAgICk7XG5cbiAgICAgICAgdmFyIGxlYWRpbmdTcGFjZSA9IGJlZm9yZUN1cnNvci5tYXRjaCgvXlxccyovKTtcbiAgICAgICAgLy8gVE9ETyBmaW5kIGJldHRlciB3YXkgZm9yIGVtYWNzIG1vZGUgdG8gb3ZlcnJpZGUgc2VsZWN0aW9uIGJlaGF2aW9yc1xuICAgICAgICBpZiAobGVhZGluZ1NwYWNlWzBdLmxlbmd0aCAhPSBjb2x1bW4gJiYgIXRoaXMuc2Vzc2lvblsnJHVzZUVtYWNzU3R5bGVMaW5lU3RhcnQnXSlcbiAgICAgICAgICAgIGZpcnN0Q29sdW1uUG9zaXRpb24uY29sdW1uICs9IGxlYWRpbmdTcGFjZVswXS5sZW5ndGg7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oZmlyc3RDb2x1bW5Qb3NpdGlvbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgZW5kIG9mIHRoZSBsaW5lLlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JMaW5lRW5kKCkge1xuICAgICAgICB2YXIgbGVhZCA9IHRoaXMubGVhZDtcbiAgICAgICAgdmFyIGxpbmVFbmQgPSB0aGlzLnNlc3Npb24uZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uUG9zaXRpb24obGVhZC5yb3csIGxlYWQuY29sdW1uKTtcbiAgICAgICAgaWYgKHRoaXMubGVhZC5jb2x1bW4gPT0gbGluZUVuZC5jb2x1bW4pIHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gdGhpcy5zZXNzaW9uLmdldExpbmUobGluZUVuZC5yb3cpO1xuICAgICAgICAgICAgaWYgKGxpbmVFbmQuY29sdW1uID09IGxpbmUubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdmFyIHRleHRFbmQgPSBsaW5lLnNlYXJjaCgvXFxzKyQvKTtcbiAgICAgICAgICAgICAgICBpZiAodGV4dEVuZCA+IDApXG4gICAgICAgICAgICAgICAgICAgIGxpbmVFbmQuY29sdW1uID0gdGV4dEVuZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGxpbmVFbmQucm93LCBsaW5lRW5kLmNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgZW5kIG9mIHRoZSBmaWxlLlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JGaWxlRW5kKCkge1xuICAgICAgICB2YXIgcm93ID0gdGhpcy5kb2MuZ2V0TGVuZ3RoKCkgLSAxO1xuICAgICAgICB2YXIgY29sdW1uID0gdGhpcy5kb2MuZ2V0TGluZShyb3cpLmxlbmd0aDtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHN0YXJ0IG9mIHRoZSBmaWxlLlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JGaWxlU3RhcnQoKSB7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKDAsIDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHdvcmQgb24gdGhlIHJpZ2h0LlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JMb25nV29yZFJpZ2h0KCkge1xuICAgICAgICB2YXIgcm93ID0gdGhpcy5sZWFkLnJvdztcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMubGVhZC5jb2x1bW47XG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5kb2MuZ2V0TGluZShyb3cpO1xuICAgICAgICB2YXIgcmlnaHRPZkN1cnNvciA9IGxpbmUuc3Vic3RyaW5nKGNvbHVtbik7XG5cbiAgICAgICAgdmFyIG1hdGNoO1xuICAgICAgICB0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuXG4gICAgICAgIC8vIHNraXAgZm9sZHNcbiAgICAgICAgdmFyIGZvbGQgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZEF0KHJvdywgY29sdW1uLCAxKTtcbiAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGZvbGQuZW5kLnJvdywgZm9sZC5lbmQuY29sdW1uKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGZpcnN0IHNraXAgc3BhY2VcbiAgICAgICAgaWYgKG1hdGNoID0gdGhpcy5zZXNzaW9uLm5vblRva2VuUmUuZXhlYyhyaWdodE9mQ3Vyc29yKSkge1xuICAgICAgICAgICAgY29sdW1uICs9IHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmxhc3RJbmRleDtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgICAgICByaWdodE9mQ3Vyc29yID0gbGluZS5zdWJzdHJpbmcoY29sdW1uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGlmIGF0IGxpbmUgZW5kIHByb2NlZWQgd2l0aCBuZXh0IGxpbmVcbiAgICAgICAgaWYgKGNvbHVtbiA+PSBsaW5lLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBsaW5lLmxlbmd0aCk7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JSaWdodCgpO1xuICAgICAgICAgICAgaWYgKHJvdyA8IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSlcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JXb3JkUmlnaHQoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGFkdmFuY2UgdG8gdGhlIGVuZCBvZiB0aGUgbmV4dCB0b2tlblxuICAgICAgICBpZiAobWF0Y2ggPSB0aGlzLnNlc3Npb24udG9rZW5SZS5leGVjKHJpZ2h0T2ZDdXJzb3IpKSB7XG4gICAgICAgICAgICBjb2x1bW4gKz0gdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4O1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSB3b3JkIG9uIHRoZSBsZWZ0LlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JMb25nV29yZExlZnQoKSB7XG4gICAgICAgIHZhciByb3cgPSB0aGlzLmxlYWQucm93O1xuICAgICAgICB2YXIgY29sdW1uID0gdGhpcy5sZWFkLmNvbHVtbjtcblxuICAgICAgICAvLyBza2lwIGZvbGRzXG4gICAgICAgIHZhciBmb2xkO1xuICAgICAgICBpZiAoZm9sZCA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkQXQocm93LCBjb2x1bW4sIC0xKSkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8oZm9sZC5zdGFydC5yb3csIGZvbGQuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEhvdyBkb2VzIHRoaXMgZ2V0IGZyb20gdGhlIGZvbGRpbmcgYWRhcHRlciBvbnRvIHRoZSBzZXNzaW9uP1xuICAgICAgICB2YXIgc3RyID0gdGhpcy5zZXNzaW9uLmdldEZvbGRTdHJpbmdBdChyb3csIGNvbHVtbiwgLTEpO1xuICAgICAgICBpZiAoc3RyID09IG51bGwpIHtcbiAgICAgICAgICAgIHN0ciA9IHRoaXMuZG9jLmdldExpbmUocm93KS5zdWJzdHJpbmcoMCwgY29sdW1uKVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxlZnRPZkN1cnNvciA9IHN0cmluZ1JldmVyc2Uoc3RyKTtcbiAgICAgICAgdmFyIG1hdGNoO1xuICAgICAgICB0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuXG4gICAgICAgIC8vIHNraXAgd2hpdGVzcGFjZVxuICAgICAgICBpZiAobWF0Y2ggPSB0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5leGVjKGxlZnRPZkN1cnNvcikpIHtcbiAgICAgICAgICAgIGNvbHVtbiAtPSB0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5sYXN0SW5kZXg7XG4gICAgICAgICAgICBsZWZ0T2ZDdXJzb3IgPSBsZWZ0T2ZDdXJzb3Iuc2xpY2UodGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4KTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpZiBhdCBiZWdpbiBvZiB0aGUgbGluZSBwcm9jZWVkIGluIGxpbmUgYWJvdmVcbiAgICAgICAgaWYgKGNvbHVtbiA8PSAwKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIDApO1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yTGVmdCgpO1xuICAgICAgICAgICAgaWYgKHJvdyA+IDApXG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yV29yZExlZnQoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIG1vdmUgdG8gdGhlIGJlZ2luIG9mIHRoZSB3b3JkXG4gICAgICAgIGlmIChtYXRjaCA9IHRoaXMuc2Vzc2lvbi50b2tlblJlLmV4ZWMobGVmdE9mQ3Vyc29yKSkge1xuICAgICAgICAgICAgY29sdW1uIC09IHRoaXMuc2Vzc2lvbi50b2tlblJlLmxhc3RJbmRleDtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi50b2tlblJlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbik7XG4gICAgfVxuXG4gICAgJHNob3J0V29yZEVuZEluZGV4KHJpZ2h0T2ZDdXJzb3IpIHtcbiAgICAgICAgdmFyIG1hdGNoLCBpbmRleCA9IDAsIGNoO1xuICAgICAgICB2YXIgd2hpdGVzcGFjZVJlID0gL1xccy87XG4gICAgICAgIHZhciB0b2tlblJlID0gdGhpcy5zZXNzaW9uLnRva2VuUmU7XG5cbiAgICAgICAgdG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICBpZiAobWF0Y2ggPSB0aGlzLnNlc3Npb24udG9rZW5SZS5leGVjKHJpZ2h0T2ZDdXJzb3IpKSB7XG4gICAgICAgICAgICBpbmRleCA9IHRoaXMuc2Vzc2lvbi50b2tlblJlLmxhc3RJbmRleDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHdoaWxlICgoY2ggPSByaWdodE9mQ3Vyc29yW2luZGV4XSkgJiYgd2hpdGVzcGFjZVJlLnRlc3QoY2gpKVxuICAgICAgICAgICAgICAgIGluZGV4Kys7XG5cbiAgICAgICAgICAgIGlmIChpbmRleCA8IDEpIHtcbiAgICAgICAgICAgICAgICB0b2tlblJlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgd2hpbGUgKChjaCA9IHJpZ2h0T2ZDdXJzb3JbaW5kZXhdKSAmJiAhdG9rZW5SZS50ZXN0KGNoKSkge1xuICAgICAgICAgICAgICAgICAgICB0b2tlblJlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgICAgIGluZGV4Kys7XG4gICAgICAgICAgICAgICAgICAgIGlmICh3aGl0ZXNwYWNlUmUudGVzdChjaCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCA+IDIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbmRleC0tXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdoaWxlICgoY2ggPSByaWdodE9mQ3Vyc29yW2luZGV4XSkgJiYgd2hpdGVzcGFjZVJlLnRlc3QoY2gpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbmRleCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCA+IDIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuXG4gICAgICAgIHJldHVybiBpbmRleDtcbiAgICB9XG5cbiAgICBtb3ZlQ3Vyc29yU2hvcnRXb3JkUmlnaHQoKSB7XG4gICAgICAgIHZhciByb3cgPSB0aGlzLmxlYWQucm93O1xuICAgICAgICB2YXIgY29sdW1uID0gdGhpcy5sZWFkLmNvbHVtbjtcbiAgICAgICAgdmFyIGxpbmUgPSB0aGlzLmRvYy5nZXRMaW5lKHJvdyk7XG4gICAgICAgIHZhciByaWdodE9mQ3Vyc29yID0gbGluZS5zdWJzdHJpbmcoY29sdW1uKTtcblxuICAgICAgICB2YXIgZm9sZCA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkQXQocm93LCBjb2x1bW4sIDEpO1xuICAgICAgICBpZiAoZm9sZClcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm1vdmVDdXJzb3JUbyhmb2xkLmVuZC5yb3csIGZvbGQuZW5kLmNvbHVtbik7XG5cbiAgICAgICAgaWYgKGNvbHVtbiA9PSBsaW5lLmxlbmd0aCkge1xuICAgICAgICAgICAgdmFyIGwgPSB0aGlzLmRvYy5nZXRMZW5ndGgoKTtcbiAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICByb3crKztcbiAgICAgICAgICAgICAgICByaWdodE9mQ3Vyc29yID0gdGhpcy5kb2MuZ2V0TGluZShyb3cpXG4gICAgICAgICAgICB9IHdoaWxlIChyb3cgPCBsICYmIC9eXFxzKiQvLnRlc3QocmlnaHRPZkN1cnNvcikpXG5cbiAgICAgICAgICAgIGlmICghL15cXHMrLy50ZXN0KHJpZ2h0T2ZDdXJzb3IpKVxuICAgICAgICAgICAgICAgIHJpZ2h0T2ZDdXJzb3IgPSBcIlwiXG4gICAgICAgICAgICBjb2x1bW4gPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGluZGV4ID0gdGhpcy4kc2hvcnRXb3JkRW5kSW5kZXgocmlnaHRPZkN1cnNvcik7XG5cbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4gKyBpbmRleCk7XG4gICAgfVxuXG4gICAgbW92ZUN1cnNvclNob3J0V29yZExlZnQoKSB7XG4gICAgICAgIHZhciByb3cgPSB0aGlzLmxlYWQucm93O1xuICAgICAgICB2YXIgY29sdW1uID0gdGhpcy5sZWFkLmNvbHVtbjtcblxuICAgICAgICB2YXIgZm9sZDtcbiAgICAgICAgaWYgKGZvbGQgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZEF0KHJvdywgY29sdW1uLCAtMSkpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5tb3ZlQ3Vyc29yVG8oZm9sZC5zdGFydC5yb3csIGZvbGQuc3RhcnQuY29sdW1uKTtcblxuICAgICAgICB2YXIgbGluZSA9IHRoaXMuc2Vzc2lvbi5nZXRMaW5lKHJvdykuc3Vic3RyaW5nKDAsIGNvbHVtbik7XG4gICAgICAgIGlmIChjb2x1bW4gPT0gMCkge1xuICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgIHJvdy0tO1xuICAgICAgICAgICAgICAgIGxpbmUgPSB0aGlzLmRvYy5nZXRMaW5lKHJvdyk7XG4gICAgICAgICAgICB9IHdoaWxlIChyb3cgPiAwICYmIC9eXFxzKiQvLnRlc3QobGluZSkpXG5cbiAgICAgICAgICAgIGNvbHVtbiA9IGxpbmUubGVuZ3RoO1xuICAgICAgICAgICAgaWYgKCEvXFxzKyQvLnRlc3QobGluZSkpXG4gICAgICAgICAgICAgICAgbGluZSA9IFwiXCJcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBsZWZ0T2ZDdXJzb3IgPSBzdHJpbmdSZXZlcnNlKGxpbmUpO1xuICAgICAgICB2YXIgaW5kZXggPSB0aGlzLiRzaG9ydFdvcmRFbmRJbmRleChsZWZ0T2ZDdXJzb3IpO1xuXG4gICAgICAgIHJldHVybiB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbiAtIGluZGV4KTtcbiAgICB9XG5cbiAgICBtb3ZlQ3Vyc29yV29yZFJpZ2h0KCkge1xuICAgICAgICAvLyBTZWUga2V5Ym9hcmQvZW1hY3MuanNcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvblsnJHNlbGVjdExvbmdXb3JkcyddKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JMb25nV29yZFJpZ2h0KCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JTaG9ydFdvcmRSaWdodCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbW92ZUN1cnNvcldvcmRMZWZ0KCkge1xuICAgICAgICAvLyBTZWUga2V5Ym9hcmQvZW1hY3MuanNcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvblsnJHNlbGVjdExvbmdXb3JkcyddKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JMb25nV29yZExlZnQoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclNob3J0V29yZExlZnQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byBwb3NpdGlvbiBpbmRpY2F0ZWQgYnkgdGhlIHBhcmFtZXRlcnMuIE5lZ2F0aXZlIG51bWJlcnMgbW92ZSB0aGUgY3Vyc29yIGJhY2t3YXJkcyBpbiB0aGUgZG9jdW1lbnQuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93cyBUaGUgbnVtYmVyIG9mIHJvd3MgdG8gbW92ZSBieVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNoYXJzIFRoZSBudW1iZXIgb2YgY2hhcmFjdGVycyB0byBtb3ZlIGJ5XG4gICAgKlxuICAgICpcbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvblxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JCeShyb3dzLCBjaGFycykge1xuICAgICAgICB2YXIgc2NyZWVuUG9zID0gdGhpcy5zZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihcbiAgICAgICAgICAgIHRoaXMubGVhZC5yb3csXG4gICAgICAgICAgICB0aGlzLmxlYWQuY29sdW1uXG4gICAgICAgICk7XG5cbiAgICAgICAgaWYgKGNoYXJzID09PSAwKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kZGVzaXJlZENvbHVtbilcbiAgICAgICAgICAgICAgICBzY3JlZW5Qb3MuY29sdW1uID0gdGhpcy4kZGVzaXJlZENvbHVtbjtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLiRkZXNpcmVkQ29sdW1uID0gc2NyZWVuUG9zLmNvbHVtbjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBkb2NQb3MgPSB0aGlzLnNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblBvcy5yb3cgKyByb3dzLCBzY3JlZW5Qb3MuY29sdW1uKTtcblxuICAgICAgICBpZiAocm93cyAhPT0gMCAmJiBjaGFycyA9PT0gMCAmJiBkb2NQb3Mucm93ID09PSB0aGlzLmxlYWQucm93ICYmIGRvY1Bvcy5jb2x1bW4gPT09IHRoaXMubGVhZC5jb2x1bW4pIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnNlc3Npb24ubGluZVdpZGdldHMgJiYgdGhpcy5zZXNzaW9uLmxpbmVXaWRnZXRzW2RvY1Bvcy5yb3ddKVxuICAgICAgICAgICAgICAgIGRvY1Bvcy5yb3crKztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIG1vdmUgdGhlIGN1cnNvciBhbmQgdXBkYXRlIHRoZSBkZXNpcmVkIGNvbHVtblxuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhkb2NQb3Mucm93LCBkb2NQb3MuY29sdW1uICsgY2hhcnMsIGNoYXJzID09PSAwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIHBvc2l0aW9uIGluZGljYXRlZCBieSBpdHMgYHJvd2AgYW5kIGBjb2x1bW5gLlxuICAgICogQHBhcmFtIHtPYmplY3R9IHBvc2l0aW9uIFRoZSBwb3NpdGlvbiB0byBtb3ZlIHRvXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yVG9Qb3NpdGlvbihwb3NpdGlvbikge1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhwb3NpdGlvbi5yb3csIHBvc2l0aW9uLmNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSByb3cgYW5kIGNvbHVtbiBwcm92aWRlZC4gW0lmIGBwcmV2ZW50VXBkYXRlRGVzaXJlZENvbHVtbmAgaXMgYHRydWVgLCB0aGVuIHRoZSBjdXJzb3Igc3RheXMgaW4gdGhlIHNhbWUgY29sdW1uIHBvc2l0aW9uIGFzIGl0cyBvcmlnaW5hbCBwb2ludC5dezogI3ByZXZlbnRVcGRhdGVCb29sRGVzY31cbiAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3cgVGhlIHJvdyB0byBtb3ZlIHRvXG4gICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gdG8gbW92ZSB0b1xuICAgICogQHBhcmFtIHtib29sZWFufSBrZWVwRGVzaXJlZENvbHVtbiBbSWYgYHRydWVgLCB0aGUgY3Vyc29yIG1vdmUgZG9lcyBub3QgcmVzcGVjdCB0aGUgcHJldmlvdXMgY29sdW1uXXs6ICNwcmV2ZW50VXBkYXRlQm9vbH1cbiAgICAqL1xuICAgIG1vdmVDdXJzb3JUbyhyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGtlZXBEZXNpcmVkQ29sdW1uPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICAvLyBFbnN1cmUgdGhlIHJvdy9jb2x1bW4gaXMgbm90IGluc2lkZSBvZiBhIGZvbGQuXG4gICAgICAgIHZhciBmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChyb3csIGNvbHVtbiwgMSk7XG4gICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICByb3cgPSBmb2xkLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIGNvbHVtbiA9IGZvbGQuc3RhcnQuY29sdW1uO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4ka2VlcERlc2lyZWRDb2x1bW5PbkNoYW5nZSA9IHRydWU7XG4gICAgICAgIHRoaXMubGVhZC5zZXRQb3NpdGlvbihyb3csIGNvbHVtbik7XG4gICAgICAgIHRoaXMuJGtlZXBEZXNpcmVkQ29sdW1uT25DaGFuZ2UgPSBmYWxzZTtcblxuICAgICAgICBpZiAoIWtlZXBEZXNpcmVkQ29sdW1uKVxuICAgICAgICAgICAgdGhpcy4kZGVzaXJlZENvbHVtbiA9IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzY3JlZW4gcG9zaXRpb24gaW5kaWNhdGVkIGJ5IHJvdyBhbmQgY29sdW1uLiB7OnByZXZlbnRVcGRhdGVCb29sRGVzY31cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBtb3ZlIHRvXG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gdG8gbW92ZSB0b1xuICAgICogQHBhcmFtIHtCb29sZWFufSBrZWVwRGVzaXJlZENvbHVtbiB7OnByZXZlbnRVcGRhdGVCb29sfVxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgbW92ZUN1cnNvclRvU2NyZWVuKHJvdywgY29sdW1uLCBrZWVwRGVzaXJlZENvbHVtbikge1xuICAgICAgICB2YXIgcG9zID0gdGhpcy5zZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihyb3csIGNvbHVtbik7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHBvcy5yb3csIHBvcy5jb2x1bW4sIGtlZXBEZXNpcmVkQ29sdW1uKTtcbiAgICB9XG5cbiAgICAvLyByZW1vdmUgbGlzdGVuZXJzIGZyb20gZG9jdW1lbnRcbiAgICBkZXRhY2goKSB7XG4gICAgICAgIHRoaXMubGVhZC5kZXRhY2goKTtcbiAgICAgICAgdGhpcy5hbmNob3IuZGV0YWNoKCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbiA9IHRoaXMuZG9jID0gbnVsbDtcbiAgICB9XG5cbiAgICBmcm9tT3JpZW50ZWRSYW5nZShyYW5nZTogT3JpZW50ZWRSYW5nZSkge1xuICAgICAgICB0aGlzLnNldFNlbGVjdGlvblJhbmdlKHJhbmdlLCByYW5nZS5jdXJzb3IgPT0gcmFuZ2Uuc3RhcnQpO1xuICAgICAgICB0aGlzLiRkZXNpcmVkQ29sdW1uID0gcmFuZ2UuZGVzaXJlZENvbHVtbiB8fCB0aGlzLiRkZXNpcmVkQ29sdW1uO1xuICAgIH1cblxuICAgIHRvT3JpZW50ZWRSYW5nZShyYW5nZT8pIHtcbiAgICAgICAgdmFyIHIgPSB0aGlzLmdldFJhbmdlKCk7XG4gICAgICAgIGlmIChyYW5nZSkge1xuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uID0gci5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICByYW5nZS5zdGFydC5yb3cgPSByLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSByLmVuZC5jb2x1bW47XG4gICAgICAgICAgICByYW5nZS5lbmQucm93ID0gci5lbmQucm93O1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmFuZ2UgPSByO1xuICAgICAgICB9XG5cbiAgICAgICAgcmFuZ2UuY3Vyc29yID0gdGhpcy5pc0JhY2t3YXJkcygpID8gcmFuZ2Uuc3RhcnQgOiByYW5nZS5lbmQ7XG4gICAgICAgIHJhbmdlLmRlc2lyZWRDb2x1bW4gPSB0aGlzLiRkZXNpcmVkQ29sdW1uO1xuICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTYXZlcyB0aGUgY3VycmVudCBjdXJzb3IgcG9zaXRpb24gYW5kIGNhbGxzIGBmdW5jYCB0aGF0IGNhbiBjaGFuZ2UgdGhlIGN1cnNvclxuICAgICogcG9zdGlvbi4gVGhlIHJlc3VsdCBpcyB0aGUgcmFuZ2Ugb2YgdGhlIHN0YXJ0aW5nIGFuZCBldmVudHVhbCBjdXJzb3IgcG9zaXRpb24uXG4gICAgKiBXaWxsIHJlc2V0IHRoZSBjdXJzb3IgcG9zaXRpb24uXG4gICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBUaGUgY2FsbGJhY2sgdGhhdCBzaG91bGQgY2hhbmdlIHRoZSBjdXJzb3IgcG9zaXRpb25cbiAgICAqIEByZXR1cm5zIHtSYW5nZX1cbiAgICAqXG4gICAgKiovXG4gICAgZ2V0UmFuZ2VPZk1vdmVtZW50cyhmdW5jKSB7XG4gICAgICAgIHZhciBzdGFydCA9IHRoaXMuZ2V0Q3Vyc29yKCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmdW5jLmNhbGwobnVsbCwgdGhpcyk7XG4gICAgICAgICAgICB2YXIgZW5kID0gdGhpcy5nZXRDdXJzb3IoKTtcbiAgICAgICAgICAgIHJldHVybiBSYW5nZS5mcm9tUG9pbnRzKHN0YXJ0LCBlbmQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICByZXR1cm4gUmFuZ2UuZnJvbVBvaW50cyhzdGFydCwgc3RhcnQpO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihzdGFydCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB0b0pTT04oKSB7XG4gICAgICAgIGlmICh0aGlzLnJhbmdlQ291bnQpIHtcbiAgICAgICAgICAgIHZhciBkYXRhOiBhbnkgPSB0aGlzLnJhbmdlcy5tYXAoZnVuY3Rpb24ocikge1xuICAgICAgICAgICAgICAgIHZhciByMSA9IHIuY2xvbmUoKTtcbiAgICAgICAgICAgICAgICByMS5pc0JhY2t3YXJkcyA9IHIuY3Vyc29yID09IHIuc3RhcnQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHIxO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZGF0YTogYW55ID0gdGhpcy5nZXRSYW5nZSgpO1xuICAgICAgICAgICAgZGF0YS5pc0JhY2t3YXJkcyA9IHRoaXMuaXNCYWNrd2FyZHMoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGF0YTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHRvU2luZ2xlUmFuZ2UoZGF0YSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJTZWxlY3Rpb24udG9TaW5nbGVSYW5nZSBpcyB1bnN1cHBvcnRlZFwiKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYWRkUmFuZ2UoZGF0YSwgc29tZXRoaW5nOiBib29sZWFuKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlNlbGVjdGlvbi5hZGRSYW5nZSBpcyB1bnN1cHBvcnRlZFwiKTtcbiAgICB9XG5cbiAgICBmcm9tSlNPTihkYXRhKSB7XG4gICAgICAgIGlmIChkYXRhLnN0YXJ0ID09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgaWYgKHRoaXMucmFuZ2VMaXN0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b1NpbmdsZVJhbmdlKGRhdGFbMF0pO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSBkYXRhLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcjogYW55ID0gUmFuZ2UuZnJvbVBvaW50cyhkYXRhW2ldLnN0YXJ0LCBkYXRhW2ldLmVuZCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkYXRhLmlzQmFja3dhcmRzKVxuICAgICAgICAgICAgICAgICAgICAgICAgci5jdXJzb3IgPSByLnN0YXJ0O1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZFJhbmdlKHIsIHRydWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICBkYXRhID0gZGF0YVswXTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5yYW5nZUxpc3QpXG4gICAgICAgICAgICB0aGlzLnRvU2luZ2xlUmFuZ2UoZGF0YSk7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uUmFuZ2UoZGF0YSwgZGF0YS5pc0JhY2t3YXJkcyk7XG4gICAgfVxuXG4gICAgaXNFcXVhbChkYXRhKSB7XG4gICAgICAgIGlmICgoZGF0YS5sZW5ndGggfHwgdGhpcy5yYW5nZUNvdW50KSAmJiBkYXRhLmxlbmd0aCAhPSB0aGlzLnJhbmdlQ291bnQpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmICghZGF0YS5sZW5ndGggfHwgIXRoaXMucmFuZ2VzKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0UmFuZ2UoKS5pc0VxdWFsKGRhdGEpO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSB0aGlzLnJhbmdlcy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5yYW5nZXNbaV0uaXNFcXVhbChkYXRhW2ldKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG59XG4iXX0=