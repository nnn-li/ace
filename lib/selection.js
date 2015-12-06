export class Selection extends evem.EventEmitterClass {
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
            return rng.Range.fromPoints(lead, lead);
        if (this.isBackwards()) {
            return rng.Range.fromPoints(lead, anchor);
        }
        else {
            return rng.Range.fromPoints(anchor, lead);
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
            return new rng.Range(rowStart, 0, rowEnd, this.session.getLine(rowEnd).length);
        }
        else {
            return new rng.Range(rowStart, 0, rowEnd + 1, 0);
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
        var leftOfCursor = lang.stringReverse(str);
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
        var leftOfCursor = lang.stringReverse(line);
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
            return rng.Range.fromPoints(start, end);
        }
        catch (e) {
            return rng.Range.fromPoints(start, start);
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
                    var r = rng.Range.fromPoints(data[i].start, data[i].end);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VsZWN0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3NlbGVjdGlvbi50cyJdLCJuYW1lcyI6WyJTZWxlY3Rpb24iLCJTZWxlY3Rpb24uY29uc3RydWN0b3IiLCJTZWxlY3Rpb24uaXNFbXB0eSIsIlNlbGVjdGlvbi5pc011bHRpTGluZSIsIlNlbGVjdGlvbi5nZXRDdXJzb3IiLCJTZWxlY3Rpb24uc2V0U2VsZWN0aW9uQW5jaG9yIiwiU2VsZWN0aW9uLmdldFNlbGVjdGlvbkFuY2hvciIsIlNlbGVjdGlvbi5nZXRTZWxlY3Rpb25MZWFkIiwiU2VsZWN0aW9uLnNoaWZ0U2VsZWN0aW9uIiwiU2VsZWN0aW9uLmlzQmFja3dhcmRzIiwiU2VsZWN0aW9uLmdldFJhbmdlIiwiU2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uIiwiU2VsZWN0aW9uLnNlbGVjdEFsbCIsIlNlbGVjdGlvbi5zZXRSYW5nZSIsIlNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZSIsIlNlbGVjdGlvbi4kbW92ZVNlbGVjdGlvbiIsIlNlbGVjdGlvbi5zZWxlY3RUbyIsIlNlbGVjdGlvbi5zZWxlY3RUb1Bvc2l0aW9uIiwiU2VsZWN0aW9uLm1vdmVUbyIsIlNlbGVjdGlvbi5tb3ZlVG9Qb3NpdGlvbiIsIlNlbGVjdGlvbi5zZWxlY3RVcCIsIlNlbGVjdGlvbi5zZWxlY3REb3duIiwiU2VsZWN0aW9uLnNlbGVjdFJpZ2h0IiwiU2VsZWN0aW9uLnNlbGVjdExlZnQiLCJTZWxlY3Rpb24uc2VsZWN0TGluZVN0YXJ0IiwiU2VsZWN0aW9uLnNlbGVjdExpbmVFbmQiLCJTZWxlY3Rpb24uc2VsZWN0RmlsZUVuZCIsIlNlbGVjdGlvbi5zZWxlY3RGaWxlU3RhcnQiLCJTZWxlY3Rpb24uc2VsZWN0V29yZFJpZ2h0IiwiU2VsZWN0aW9uLnNlbGVjdFdvcmRMZWZ0IiwiU2VsZWN0aW9uLmdldFdvcmRSYW5nZSIsIlNlbGVjdGlvbi5zZWxlY3RXb3JkIiwiU2VsZWN0aW9uLnNlbGVjdEFXb3JkIiwiU2VsZWN0aW9uLmdldExpbmVSYW5nZSIsIlNlbGVjdGlvbi5zZWxlY3RMaW5lIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JVcCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yRG93biIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGVmdCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yUmlnaHQiLCJTZWxlY3Rpb24ubW92ZUN1cnNvckxpbmVTdGFydCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGluZUVuZCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yRmlsZUVuZCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yRmlsZVN0YXJ0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JMb25nV29yZFJpZ2h0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JMb25nV29yZExlZnQiLCJTZWxlY3Rpb24uJHNob3J0V29yZEVuZEluZGV4IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JTaG9ydFdvcmRSaWdodCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yU2hvcnRXb3JkTGVmdCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yV29yZFJpZ2h0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JXb3JkTGVmdCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yQnkiLCJTZWxlY3Rpb24ubW92ZUN1cnNvclRvUG9zaXRpb24iLCJTZWxlY3Rpb24ubW92ZUN1cnNvclRvIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JUb1NjcmVlbiIsIlNlbGVjdGlvbi5kZXRhY2giLCJTZWxlY3Rpb24uZnJvbU9yaWVudGVkUmFuZ2UiLCJTZWxlY3Rpb24udG9PcmllbnRlZFJhbmdlIiwiU2VsZWN0aW9uLmdldFJhbmdlT2ZNb3ZlbWVudHMiLCJTZWxlY3Rpb24udG9KU09OIiwiU2VsZWN0aW9uLnRvU2luZ2xlUmFuZ2UiLCJTZWxlY3Rpb24uYWRkUmFuZ2UiLCJTZWxlY3Rpb24uZnJvbUpTT04iLCJTZWxlY3Rpb24uaXNFcXVhbCJdLCJtYXBwaW5ncyI6IkFBK0RBLCtCQUErQixJQUFJLENBQUMsaUJBQWlCO0lB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QTtRQUVqRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsSUFBSUEsSUFBSUEsQ0FBQ0EsTUFBTUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBO2dCQUNoQixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUMsQ0FBQztZQUN2RCxDQUFDLENBQUNBLENBQUNBO1FBQ1BBLENBQUNBO0lBQ0xBLENBQUNBO0lBTURSLFdBQVdBO1FBQ1BTLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBO1FBQ3pCQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNyQkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDOUZBLENBQUNBO0lBTURULFFBQVFBO1FBQ0pVLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBO1FBQ3pCQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUVyQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7WUFDZkEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFNUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JCQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFD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Q0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDekRBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBRTdCQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDakJBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQy9FQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxJQUFJQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQTtZQUN4Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsT0FBT0EsRUFBRUEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsSUFBSUEsT0FBT0EsQ0FBQ0E7Z0JBQzlJQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUNuQ0EsSUFBSUE7Z0JBQ0FBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ2pDQSxDQUFDQTtJQUNMQSxDQUFDQTtJQU1EckMsZUFBZUE7UUFDWHNDLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO1FBQ2xDQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUMxREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDUEEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDckRBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ2xFQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxTQUFTQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDM0NBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQzVDQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNG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QSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNqQ0EsSUFBSUEsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFM0NBLElBQUlBLEtBQUtBLENBQUNBO1FBQ1ZBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3RDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUduQ0EsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDbERBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ1BBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQ2pEQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUdEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0REEsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7WUFDNUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ3RDQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUMzQ0EsQ0FBQ0E7UUFHREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQ3BDQSxJQUFJQSxDQUFDQSxlQUFlQSxFQUFFQSxDQUFDQTtZQUN2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQy9CQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEVBQUVBLENBQUNBO1lBQy9CQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUdEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuREEsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0E7WUFDekNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3ZDQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtJQUNuQ0EsQ0FBQ0E7SUFNRDNDLHNCQUFzQkE7UUFDbEI0QyxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUN4QkEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFHOUJBLElBQUlBLElBQUlBLENBQUNBO1FBQ1RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pEQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNyREEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFHREEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUMzREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZEEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQUE7UUFDcERBLENBQUNBO1FBRURBLElBQUlBLFlBQVlBLEdBQUdBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzNDQSxJQUFJQSxLQUFLQSxDQUFDQTtRQUNWQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN0Q0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFHbkNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JEQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUM1Q0EsWUFBWUEs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RXpDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQTtZQUNwQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFBQTtRQUNwQkEsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0FBQ0w5RCxDQUFDQTtBQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbmltcG9ydCBkb2NtID0gcmVxdWlyZShcIi4vZG9jdW1lbnRcIik7XG5pbXBvcnQgb29wID0gcmVxdWlyZShcIi4vbGliL29vcFwiKTtcbmltcG9ydCBsYW5nID0gcmVxdWlyZShcIi4vbGliL2xhbmdcIik7XG5pbXBvcnQgZXZlbSA9IHJlcXVpcmUoXCIuL2xpYi9ldmVudF9lbWl0dGVyXCIpO1xuaW1wb3J0IHJuZyA9IHJlcXVpcmUoXCIuL3JhbmdlXCIpO1xuaW1wb3J0IHJsbSA9IHJlcXVpcmUoXCIuL3JhbmdlX2xpc3RcIik7XG5pbXBvcnQgZXNtID0gcmVxdWlyZShcIi4vZWRpdF9zZXNzaW9uXCIpO1xuaW1wb3J0IGFubSA9IHJlcXVpcmUoXCIuL2FuY2hvclwiKTtcblxuLyoqXG4gKiBDb250YWlucyB0aGUgY3Vyc29yIHBvc2l0aW9uIGFuZCB0aGUgdGV4dCBzZWxlY3Rpb24gb2YgYW4gZWRpdCBzZXNzaW9uLlxuICpcbiAqIFRoZSByb3cvY29sdW1ucyB1c2VkIGluIHRoZSBzZWxlY3Rpb24gYXJlIGluIGRvY3VtZW50IGNvb3JkaW5hdGVzIHJlcHJlc2VudGluZyB0aHMgY29vcmRpbmF0ZXMgYXMgdGhleiBhcHBlYXIgaW4gdGhlIGRvY3VtZW50IGJlZm9yZSBhcHBseWluZyBzb2Z0IHdyYXAgYW5kIGZvbGRpbmcuXG4gKiBAY2xhc3MgU2VsZWN0aW9uXG4gKiovXG5cblxuLyoqXG4gKiBFbWl0dGVkIHdoZW4gdGhlIGN1cnNvciBwb3NpdGlvbiBjaGFuZ2VzLlxuICogQGV2ZW50IGNoYW5nZUN1cnNvclxuICpcbioqL1xuLyoqXG4gKiBFbWl0dGVkIHdoZW4gdGhlIGN1cnNvciBzZWxlY3Rpb24gY2hhbmdlcy5cbiAqIFxuICogIEBldmVudCBjaGFuZ2VTZWxlY3Rpb25cbioqL1xuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGBTZWxlY3Rpb25gIG9iamVjdC5cbiAqIEBwYXJhbSB7RWRpdFNlc3Npb259IHNlc3Npb24gVGhlIHNlc3Npb24gdG8gdXNlXG4gKiBcbiAqIEBjb25zdHJ1Y3RvclxuICoqL1xuZXhwb3J0IGNsYXNzIFNlbGVjdGlvbiBleHRlbmRzIGV2ZW0uRXZlbnRFbWl0dGVyQ2xhc3Mge1xuICAgIHByaXZhdGUgc2Vzc2lvbjogZXNtLkVkaXRTZXNzaW9uO1xuICAgIHByaXZhdGUgZG9jOiBkb2NtLkRvY3VtZW50O1xuICAgIC8vIFdoeSBkbyB3ZSBzZWVtIHRvIGhhdmUgY29waWVzP1xuICAgIHB1YmxpYyBsZWFkOiBhbm0uQW5jaG9yO1xuICAgIHB1YmxpYyBhbmNob3I6IGFubS5BbmNob3I7XG4gICAgcHJpdmF0ZSBzZWxlY3Rpb25MZWFkOiBhbm0uQW5jaG9yO1xuICAgIHByaXZhdGUgc2VsZWN0aW9uQW5jaG9yOiBhbm0uQW5jaG9yO1xuICAgIHByaXZhdGUgJGlzRW1wdHk6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAka2VlcERlc2lyZWRDb2x1bW5PbkNoYW5nZTogYm9vbGVhbjtcbiAgICBwcml2YXRlICRkZXNpcmVkQ29sdW1uOyAgLy8gSXMgdGhpcyB1c2VkIGFueXdoZXJlP1xuICAgIHByaXZhdGUgcmFuZ2VDb3VudDtcbiAgICBwdWJsaWMgcmFuZ2VzO1xuICAgIHB1YmxpYyByYW5nZUxpc3Q6IHJsbS5SYW5nZUxpc3Q7XG4gICAgY29uc3RydWN0b3Ioc2Vzc2lvbjogZXNtLkVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbiA9IHNlc3Npb247XG4gICAgICAgIHRoaXMuZG9jID0gc2Vzc2lvbi5nZXREb2N1bWVudCgpO1xuXG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5sZWFkID0gdGhpcy5zZWxlY3Rpb25MZWFkID0gdGhpcy5kb2MuY3JlYXRlQW5jaG9yKDAsIDApO1xuICAgICAgICB0aGlzLmFuY2hvciA9IHRoaXMuc2VsZWN0aW9uQW5jaG9yID0gdGhpcy5kb2MuY3JlYXRlQW5jaG9yKDAsIDApO1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5sZWFkLm9uKFwiY2hhbmdlXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHNlbGYuX2VtaXQoXCJjaGFuZ2VDdXJzb3JcIik7XG4gICAgICAgICAgICBpZiAoIXNlbGYuJGlzRW1wdHkpXG4gICAgICAgICAgICAgICAgc2VsZi5fZW1pdChcImNoYW5nZVNlbGVjdGlvblwiKTtcbiAgICAgICAgICAgIGlmICghc2VsZi4ka2VlcERlc2lyZWRDb2x1bW5PbkNoYW5nZSAmJiBlLm9sZC5jb2x1bW4gIT0gZS52YWx1ZS5jb2x1bW4pXG4gICAgICAgICAgICAgICAgc2VsZi4kZGVzaXJlZENvbHVtbiA9IG51bGw7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuc2VsZWN0aW9uQW5jaG9yLm9uKFwiY2hhbmdlXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKCFzZWxmLiRpc0VtcHR5KSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fZW1pdChcImNoYW5nZVNlbGVjdGlvblwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgc2VsZWN0aW9uIGlzIGVtcHR5LlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqL1xuICAgIGlzRW1wdHkoKSB7XG4gICAgICAgIC8vIFdoYXQgaXMgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiAkaXNFbXB0eSBhbmQgd2hhdCB0aGlzIGZ1bmN0aW9uIHJldHVybnM/XG4gICAgICAgIHJldHVybiAodGhpcy4kaXNFbXB0eSB8fCAoXG4gICAgICAgICAgICB0aGlzLmFuY2hvci5yb3cgPT0gdGhpcy5sZWFkLnJvdyAmJlxuICAgICAgICAgICAgdGhpcy5hbmNob3IuY29sdW1uID09IHRoaXMubGVhZC5jb2x1bW5cbiAgICAgICAgKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgc2VsZWN0aW9uIGlzIGEgbXVsdGktbGluZS5cbiAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICoqL1xuICAgIGlzTXVsdGlMaW5lKCkge1xuICAgICAgICBpZiAodGhpcy5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLmdldFJhbmdlKCkuaXNNdWx0aUxpbmUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGByb3dgIGFuZCBgY29sdW1uYCBjdXJyZW50IHBvc2l0aW9uIG9mIHRoZSBjdXJzb3IuXG4gICAgKiBAcmV0dXJucyB7T2JqZWN0fVxuICAgICoqL1xuICAgIGdldEN1cnNvcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubGVhZC5nZXRQb3NpdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyB0aGUgcm93IGFuZCBjb2x1bW4gcG9zaXRpb24gb2YgdGhlIGFuY2hvci4gVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRzIHRoZSBgJ2NoYW5nZVNlbGVjdGlvbidgIGV2ZW50LlxuICAgICogQHBhcmFtIHtudW1iZXJ9IHJvdyBUaGUgbmV3IHJvd1xuICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbiBUaGUgbmV3IGNvbHVtblxuICAgICoqL1xuICAgIHNldFNlbGVjdGlvbkFuY2hvcihyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5hbmNob3Iuc2V0UG9zaXRpb24ocm93LCBjb2x1bW4pO1xuXG4gICAgICAgIGlmICh0aGlzLiRpc0VtcHR5KSB7XG4gICAgICAgICAgICB0aGlzLiRpc0VtcHR5ID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLl9lbWl0KFwiY2hhbmdlU2VsZWN0aW9uXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBgcm93YCBhbmQgYGNvbHVtbmAgb2YgdGhlIGNhbGxpbmcgc2VsZWN0aW9uIGFuY2hvci5cbiAgICAqXG4gICAgKiBAcmV0dXJucyB7T2JqZWN0fVxuICAgICogQHJlbGF0ZWQgQW5jaG9yLmdldFBvc2l0aW9uXG4gICAgKiovXG4gICAgZ2V0U2VsZWN0aW9uQW5jaG9yKCkge1xuICAgICAgICBpZiAodGhpcy4kaXNFbXB0eSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldFNlbGVjdGlvbkxlYWQoKVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hbmNob3IuZ2V0UG9zaXRpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBgcm93YCBhbmQgYGNvbHVtbmAgb2YgdGhlIGNhbGxpbmcgc2VsZWN0aW9uIGxlYWQuXG4gICAgKiBAcmV0dXJucyB7T2JqZWN0fVxuICAgICoqL1xuICAgIGdldFNlbGVjdGlvbkxlYWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxlYWQuZ2V0UG9zaXRpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNoaWZ0cyB0aGUgc2VsZWN0aW9uIHVwIChvciBkb3duLCBpZiBbW1NlbGVjdGlvbi5pc0JhY2t3YXJkcyBgaXNCYWNrd2FyZHMoKWBdXSBpcyB0cnVlKSB0aGUgZ2l2ZW4gbnVtYmVyIG9mIGNvbHVtbnMuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1ucyBUaGUgbnVtYmVyIG9mIGNvbHVtbnMgdG8gc2hpZnQgYnlcbiAgICAqXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBzaGlmdFNlbGVjdGlvbihjb2x1bW5zKSB7XG4gICAgICAgIGlmICh0aGlzLiRpc0VtcHR5KSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyh0aGlzLmxlYWQucm93LCB0aGlzLmxlYWQuY29sdW1uICsgY29sdW1ucyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgYW5jaG9yID0gdGhpcy5nZXRTZWxlY3Rpb25BbmNob3IoKTtcbiAgICAgICAgdmFyIGxlYWQgPSB0aGlzLmdldFNlbGVjdGlvbkxlYWQoKTtcblxuICAgICAgICB2YXIgaXNCYWNrd2FyZHMgPSB0aGlzLmlzQmFja3dhcmRzKCk7XG5cbiAgICAgICAgaWYgKCFpc0JhY2t3YXJkcyB8fCBhbmNob3IuY29sdW1uICE9PSAwKVxuICAgICAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25BbmNob3IoYW5jaG9yLnJvdywgYW5jaG9yLmNvbHVtbiArIGNvbHVtbnMpO1xuXG4gICAgICAgIGlmIChpc0JhY2t3YXJkcyB8fCBsZWFkLmNvbHVtbiAhPT0gMCkge1xuICAgICAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhsZWFkLnJvdywgbGVhZC5jb2x1bW4gKyBjb2x1bW5zKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgc2VsZWN0aW9uIGlzIGdvaW5nIGJhY2t3YXJkcyBpbiB0aGUgZG9jdW1lbnQuXG4gICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAqKi9cbiAgICBpc0JhY2t3YXJkcygpIHtcbiAgICAgICAgdmFyIGFuY2hvciA9IHRoaXMuYW5jaG9yO1xuICAgICAgICB2YXIgbGVhZCA9IHRoaXMubGVhZDtcbiAgICAgICAgcmV0dXJuIChhbmNob3Iucm93ID4gbGVhZC5yb3cgfHwgKGFuY2hvci5yb3cgPT0gbGVhZC5yb3cgJiYgYW5jaG9yLmNvbHVtbiA+IGxlYWQuY29sdW1uKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBbUmV0dXJucyB0aGUgW1tSYW5nZV1dIGZvciB0aGUgc2VsZWN0ZWQgdGV4dC5dezogI1NlbGVjdGlvbi5nZXRSYW5nZX1cbiAgICAqIEByZXR1cm5zIHtSYW5nZX1cbiAgICAqKi9cbiAgICBnZXRSYW5nZSgpIHtcbiAgICAgICAgdmFyIGFuY2hvciA9IHRoaXMuYW5jaG9yO1xuICAgICAgICB2YXIgbGVhZCA9IHRoaXMubGVhZDtcblxuICAgICAgICBpZiAodGhpcy5pc0VtcHR5KCkpXG4gICAgICAgICAgICByZXR1cm4gcm5nLlJhbmdlLmZyb21Qb2ludHMobGVhZCwgbGVhZCk7XG5cbiAgICAgICAgaWYgKHRoaXMuaXNCYWNrd2FyZHMoKSkge1xuICAgICAgICAgICAgcmV0dXJuIHJuZy5SYW5nZS5mcm9tUG9pbnRzKGxlYWQsIGFuY2hvcik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gcm5nLlJhbmdlLmZyb21Qb2ludHMoYW5jaG9yLCBsZWFkKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogW0VtcHRpZXMgdGhlIHNlbGVjdGlvbiAoYnkgZGUtc2VsZWN0aW5nIGl0KS4gVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRzIHRoZSBgJ2NoYW5nZVNlbGVjdGlvbidgIGV2ZW50Ll17OiAjU2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9ufVxuICAgICoqL1xuICAgIGNsZWFyU2VsZWN0aW9uKCkge1xuICAgICAgICBpZiAoIXRoaXMuJGlzRW1wdHkpIHtcbiAgICAgICAgICAgIHRoaXMuJGlzRW1wdHkgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5fZW1pdChcImNoYW5nZVNlbGVjdGlvblwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogU2VsZWN0cyBhbGwgdGhlIHRleHQgaW4gdGhlIGRvY3VtZW50LlxuICAgICoqL1xuICAgIHNlbGVjdEFsbCgpIHtcbiAgICAgICAgdmFyIGxhc3RSb3cgPSB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDE7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uQW5jaG9yKDAsIDApO1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhsYXN0Um93LCB0aGlzLmRvYy5nZXRMaW5lKGxhc3RSb3cpLmxlbmd0aCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZXRzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIHByb3ZpZGVkIHJhbmdlLlxuICAgICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgVGhlIHJhbmdlIG9mIHRleHQgdG8gc2VsZWN0XG4gICAgKiBAcGFyYW0ge0Jvb2xlYW59IHJldmVyc2UgSW5kaWNhdGVzIGlmIHRoZSByYW5nZSBzaG91bGQgZ28gYmFja3dhcmRzIChgdHJ1ZWApIG9yIG5vdFxuICAgICpcbiAgICAqXG4gICAgKiBAbWV0aG9kIHNldFNlbGVjdGlvblJhbmdlXG4gICAgKiBAYWxpYXMgc2V0UmFuZ2VcbiAgICAqKi9cbiAgICBzZXRSYW5nZShyYW5nZSwgcmV2ZXJzZT86IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSwgcmV2ZXJzZSk7XG4gICAgfVxuICAgIHNldFNlbGVjdGlvblJhbmdlKHJhbmdlOiB7IHN0YXJ0OiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9OyBlbmQ6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0gfSwgcmV2ZXJzZT86IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKHJldmVyc2UpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uQW5jaG9yKHJhbmdlLmVuZC5yb3csIHJhbmdlLmVuZC5jb2x1bW4pO1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RUbyhyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnNldFNlbGVjdGlvbkFuY2hvcihyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdFRvKHJhbmdlLmVuZC5yb3csIHJhbmdlLmVuZC5jb2x1bW4pO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmdldFJhbmdlKCkuaXNFbXB0eSgpKVxuICAgICAgICAgICAgdGhpcy4kaXNFbXB0eSA9IHRydWU7XG4gICAgICAgIHRoaXMuJGRlc2lyZWRDb2x1bW4gPSBudWxsO1xuICAgIH1cblxuICAgICRtb3ZlU2VsZWN0aW9uKG1vdmVyKSB7XG4gICAgICAgIHZhciBsZWFkID0gdGhpcy5sZWFkO1xuICAgICAgICBpZiAodGhpcy4kaXNFbXB0eSlcbiAgICAgICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uQW5jaG9yKGxlYWQucm93LCBsZWFkLmNvbHVtbik7XG5cbiAgICAgICAgbW92ZXIuY2FsbCh0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gY3Vyc29yIHRvIHRoZSBpbmRpY2F0ZWQgcm93IGFuZCBjb2x1bW4uXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gc2VsZWN0IHRvXG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gdG8gc2VsZWN0IHRvXG4gICAgKlxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgc2VsZWN0VG8ocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbik7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiBjdXJzb3IgdG8gdGhlIHJvdyBhbmQgY29sdW1uIGluZGljYXRlZCBieSBgcG9zYC5cbiAgICAqIEBwYXJhbSB7T2JqZWN0fSBwb3MgQW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIHJvdyBhbmQgY29sdW1uXG4gICAgKlxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgc2VsZWN0VG9Qb3NpdGlvbihwb3MpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24ocG9zKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIGN1cnNvciB0byB0aGUgaW5kaWNhdGVkIHJvdyBhbmQgY29sdW1uLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIHNlbGVjdCB0b1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIHRvIHNlbGVjdCB0b1xuICAgICpcbiAgICAqKi9cbiAgICBtb3ZlVG8ocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiBjdXJzb3IgdG8gdGhlIHJvdyBhbmQgY29sdW1uIGluZGljYXRlZCBieSBgcG9zYC5cbiAgICAqIEBwYXJhbSB7T2JqZWN0fSBwb3MgQW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIHJvdyBhbmQgY29sdW1uXG4gICAgKiovXG4gICAgbW92ZVRvUG9zaXRpb24ocG9zKSB7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihwb3MpO1xuICAgIH1cblxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB1cCBvbmUgcm93LlxuICAgICoqL1xuICAgIHNlbGVjdFVwKCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvclVwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIGRvd24gb25lIHJvdy5cbiAgICAqKi9cbiAgICBzZWxlY3REb3duKCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvckRvd24pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHJpZ2h0IG9uZSBjb2x1bW4uXG4gICAgKiovXG4gICAgc2VsZWN0UmlnaHQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yUmlnaHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gbGVmdCBvbmUgY29sdW1uLlxuICAgICoqL1xuICAgIHNlbGVjdExlZnQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yTGVmdCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB0byB0aGUgYmVnaW5uaW5nIG9mIHRoZSBjdXJyZW50IGxpbmUuXG4gICAgKiovXG4gICAgc2VsZWN0TGluZVN0YXJ0KCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvckxpbmVTdGFydCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB0byB0aGUgZW5kIG9mIHRoZSBjdXJyZW50IGxpbmUuXG4gICAgKiovXG4gICAgc2VsZWN0TGluZUVuZCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JMaW5lRW5kKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBlbmQgb2YgdGhlIGZpbGUuXG4gICAgKiovXG4gICAgc2VsZWN0RmlsZUVuZCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JGaWxlRW5kKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBzdGFydCBvZiB0aGUgZmlsZS5cbiAgICAqKi9cbiAgICBzZWxlY3RGaWxlU3RhcnQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yRmlsZVN0YXJ0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBmaXJzdCB3b3JkIG9uIHRoZSByaWdodC5cbiAgICAqKi9cbiAgICBzZWxlY3RXb3JkUmlnaHQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yV29yZFJpZ2h0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBmaXJzdCB3b3JkIG9uIHRoZSBsZWZ0LlxuICAgICoqL1xuICAgIHNlbGVjdFdvcmRMZWZ0KCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvcldvcmRMZWZ0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gaGlnaGxpZ2h0IHRoZSBlbnRpcmUgd29yZC5cbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmdldFdvcmRSYW5nZVxuICAgICoqL1xuICAgIGdldFdvcmRSYW5nZShyb3c/LCBjb2x1bW4/KSB7XG4gICAgICAgIGlmICh0eXBlb2YgY29sdW1uID09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgIHZhciBjdXJzb3IgPSByb3cgfHwgdGhpcy5sZWFkO1xuICAgICAgICAgICAgcm93ID0gY3Vyc29yLnJvdztcbiAgICAgICAgICAgIGNvbHVtbiA9IGN1cnNvci5jb2x1bW47XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRXb3JkUmFuZ2Uocm93LCBjb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFNlbGVjdHMgYW4gZW50aXJlIHdvcmQgYm91bmRhcnkuXG4gICAgKiovXG4gICAgc2VsZWN0V29yZCgpIHtcbiAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25SYW5nZSh0aGlzLmdldFdvcmRSYW5nZSgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNlbGVjdHMgYSB3b3JkLCBpbmNsdWRpbmcgaXRzIHJpZ2h0IHdoaXRlc3BhY2UuXG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRBV29yZFJhbmdlXG4gICAgKiovXG4gICAgc2VsZWN0QVdvcmQoKSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvcigpO1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLnNlc3Npb24uZ2V0QVdvcmRSYW5nZShjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcbiAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSk7XG4gICAgfVxuXG4gICAgZ2V0TGluZVJhbmdlKHJvdz86IG51bWJlciwgZXhjbHVkZUxhc3RDaGFyPzogYm9vbGVhbik6IHJuZy5SYW5nZSB7XG4gICAgICAgIHZhciByb3dTdGFydCA9IHR5cGVvZiByb3cgPT0gXCJudW1iZXJcIiA/IHJvdyA6IHRoaXMubGVhZC5yb3c7XG4gICAgICAgIHZhciByb3dFbmQ7XG5cbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldEZvbGRMaW5lKHJvd1N0YXJ0KTtcbiAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICByb3dTdGFydCA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIHJvd0VuZCA9IGZvbGRMaW5lLmVuZC5yb3c7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByb3dFbmQgPSByb3dTdGFydDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChleGNsdWRlTGFzdENoYXIpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgcm5nLlJhbmdlKHJvd1N0YXJ0LCAwLCByb3dFbmQsIHRoaXMuc2Vzc2lvbi5nZXRMaW5lKHJvd0VuZCkubGVuZ3RoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgcm5nLlJhbmdlKHJvd1N0YXJ0LCAwLCByb3dFbmQgKyAxLCAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogU2VsZWN0cyB0aGUgZW50aXJlIGxpbmUuXG4gICAgKiovXG4gICAgc2VsZWN0TGluZSgpIHtcbiAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25SYW5nZSh0aGlzLmdldExpbmVSYW5nZSgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHVwIG9uZSByb3cuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvclVwKCkge1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeSgtMSwgMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciBkb3duIG9uZSByb3cuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckRvd24oKSB7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvckJ5KDEsIDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgbGVmdCBvbmUgY29sdW1uLlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JMZWZ0KCkge1xuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5sZWFkLmdldFBvc2l0aW9uKCksXG4gICAgICAgICAgICBmb2xkO1xuXG4gICAgICAgIGlmIChmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uLCAtMSkpIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGZvbGQuc3RhcnQucm93LCBmb2xkLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgIH0gZWxzZSBpZiAoY3Vyc29yLmNvbHVtbiA9PT0gMCkge1xuICAgICAgICAgICAgLy8gY3Vyc29yIGlzIGEgbGluZSAoc3RhcnRcbiAgICAgICAgICAgIGlmIChjdXJzb3Iucm93ID4gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGN1cnNvci5yb3cgLSAxLCB0aGlzLmRvYy5nZXRMaW5lKGN1cnNvci5yb3cgLSAxKS5sZW5ndGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHRhYlNpemUgPSB0aGlzLnNlc3Npb24uZ2V0VGFiU2l6ZSgpO1xuICAgICAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi5pc1RhYlN0b3AoY3Vyc29yKSAmJiB0aGlzLmRvYy5nZXRMaW5lKGN1cnNvci5yb3cpLnNsaWNlKGN1cnNvci5jb2x1bW4gLSB0YWJTaXplLCBjdXJzb3IuY29sdW1uKS5zcGxpdChcIiBcIikubGVuZ3RoIC0gMSA9PSB0YWJTaXplKVxuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckJ5KDAsIC10YWJTaXplKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeSgwLCAtMSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHJpZ2h0IG9uZSBjb2x1bW4uXG4gICAgKiovXG4gICAgbW92ZUN1cnNvclJpZ2h0KCkge1xuICAgICAgICB2YXIgcG9zID0gdGhpcy5sZWFkLmdldFBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChwb3Mucm93LCBwb3MuY29sdW1uLCAxKTtcbiAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGZvbGQuZW5kLnJvdywgZm9sZC5lbmQuY29sdW1uKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLmxlYWQuY29sdW1uID09IHRoaXMuZG9jLmdldExpbmUodGhpcy5sZWFkLnJvdykubGVuZ3RoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5sZWFkLnJvdyA8IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSkge1xuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHRoaXMubGVhZC5yb3cgKyAxLCAwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciB0YWJTaXplID0gdGhpcy5zZXNzaW9uLmdldFRhYlNpemUoKTtcbiAgICAgICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmxlYWQ7XG4gICAgICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmlzVGFiU3RvcChjdXJzb3IpICYmIHRoaXMuZG9jLmdldExpbmUoY3Vyc29yLnJvdykuc2xpY2UoY3Vyc29yLmNvbHVtbiwgY3Vyc29yLmNvbHVtbiArIHRhYlNpemUpLnNwbGl0KFwiIFwiKS5sZW5ndGggLSAxID09IHRhYlNpemUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeSgwLCB0YWJTaXplKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckJ5KDAsIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3RhcnQgb2YgdGhlIGxpbmUuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckxpbmVTdGFydCgpIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMubGVhZC5yb3c7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLmxlYWQuY29sdW1uO1xuICAgICAgICB2YXIgc2NyZWVuUm93ID0gdGhpcy5zZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Sb3cocm93LCBjb2x1bW4pO1xuXG4gICAgICAgIC8vIERldGVybSB0aGUgZG9jLXBvc2l0aW9uIG9mIHRoZSBmaXJzdCBjaGFyYWN0ZXIgYXQgdGhlIHNjcmVlbiBsaW5lLlxuICAgICAgICB2YXIgZmlyc3RDb2x1bW5Qb3NpdGlvbiA9IHRoaXMuc2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93LCAwKTtcblxuICAgICAgICAvLyBEZXRlcm0gdGhlIGxpbmVcbiAgICAgICAgLy8gSG93IGRvZXMgZ2V0RGlzcGxheUxpbmUgZ2V0IGZyb20gZm9sZGluZyBvbnRvIHNlc3Npb24/XG4gICAgICAgIHZhciBiZWZvcmVDdXJzb3IgPSB0aGlzLnNlc3Npb25bJ2dldERpc3BsYXlMaW5lJ10oXG4gICAgICAgICAgICByb3csIG51bGwsIGZpcnN0Q29sdW1uUG9zaXRpb24ucm93LFxuICAgICAgICAgICAgZmlyc3RDb2x1bW5Qb3NpdGlvbi5jb2x1bW5cbiAgICAgICAgKTtcblxuICAgICAgICB2YXIgbGVhZGluZ1NwYWNlID0gYmVmb3JlQ3Vyc29yLm1hdGNoKC9eXFxzKi8pO1xuICAgICAgICAvLyBUT0RPIGZpbmQgYmV0dGVyIHdheSBmb3IgZW1hY3MgbW9kZSB0byBvdmVycmlkZSBzZWxlY3Rpb24gYmVoYXZpb3JzXG4gICAgICAgIGlmIChsZWFkaW5nU3BhY2VbMF0ubGVuZ3RoICE9IGNvbHVtbiAmJiAhdGhpcy5zZXNzaW9uWyckdXNlRW1hY3NTdHlsZUxpbmVTdGFydCddKVxuICAgICAgICAgICAgZmlyc3RDb2x1bW5Qb3NpdGlvbi5jb2x1bW4gKz0gbGVhZGluZ1NwYWNlWzBdLmxlbmd0aDtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihmaXJzdENvbHVtblBvc2l0aW9uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBlbmQgb2YgdGhlIGxpbmUuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckxpbmVFbmQoKSB7XG4gICAgICAgIHZhciBsZWFkID0gdGhpcy5sZWFkO1xuICAgICAgICB2YXIgbGluZUVuZCA9IHRoaXMuc2Vzc2lvbi5nZXREb2N1bWVudExhc3RSb3dDb2x1bW5Qb3NpdGlvbihsZWFkLnJvdywgbGVhZC5jb2x1bW4pO1xuICAgICAgICBpZiAodGhpcy5sZWFkLmNvbHVtbiA9PSBsaW5lRW5kLmNvbHVtbikge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSB0aGlzLnNlc3Npb24uZ2V0TGluZShsaW5lRW5kLnJvdyk7XG4gICAgICAgICAgICBpZiAobGluZUVuZC5jb2x1bW4gPT0gbGluZS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB2YXIgdGV4dEVuZCA9IGxpbmUuc2VhcmNoKC9cXHMrJC8pO1xuICAgICAgICAgICAgICAgIGlmICh0ZXh0RW5kID4gMClcbiAgICAgICAgICAgICAgICAgICAgbGluZUVuZC5jb2x1bW4gPSB0ZXh0RW5kO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8obGluZUVuZC5yb3csIGxpbmVFbmQuY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBlbmQgb2YgdGhlIGZpbGUuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckZpbGVFbmQoKSB7XG4gICAgICAgIHZhciByb3cgPSB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDE7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLmRvYy5nZXRMaW5lKHJvdykubGVuZ3RoO1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3RhcnQgb2YgdGhlIGZpbGUuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckZpbGVTdGFydCgpIHtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8oMCwgMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgd29yZCBvbiB0aGUgcmlnaHQuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckxvbmdXb3JkUmlnaHQoKSB7XG4gICAgICAgIHZhciByb3cgPSB0aGlzLmxlYWQucm93O1xuICAgICAgICB2YXIgY29sdW1uID0gdGhpcy5sZWFkLmNvbHVtbjtcbiAgICAgICAgdmFyIGxpbmUgPSB0aGlzLmRvYy5nZXRMaW5lKHJvdyk7XG4gICAgICAgIHZhciByaWdodE9mQ3Vyc29yID0gbGluZS5zdWJzdHJpbmcoY29sdW1uKTtcblxuICAgICAgICB2YXIgbWF0Y2g7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi50b2tlblJlLmxhc3RJbmRleCA9IDA7XG5cbiAgICAgICAgLy8gc2tpcCBmb2xkc1xuICAgICAgICB2YXIgZm9sZCA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkQXQocm93LCBjb2x1bW4sIDEpO1xuICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8oZm9sZC5lbmQucm93LCBmb2xkLmVuZC5jb2x1bW4pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZmlyc3Qgc2tpcCBzcGFjZVxuICAgICAgICBpZiAobWF0Y2ggPSB0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5leGVjKHJpZ2h0T2ZDdXJzb3IpKSB7XG4gICAgICAgICAgICBjb2x1bW4gKz0gdGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4O1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgICAgIHJpZ2h0T2ZDdXJzb3IgPSBsaW5lLnN1YnN0cmluZyhjb2x1bW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgYXQgbGluZSBlbmQgcHJvY2VlZCB3aXRoIG5leHQgbGluZVxuICAgICAgICBpZiAoY29sdW1uID49IGxpbmUubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGxpbmUubGVuZ3RoKTtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclJpZ2h0KCk7XG4gICAgICAgICAgICBpZiAocm93IDwgdGhpcy5kb2MuZ2V0TGVuZ3RoKCkgLSAxKVxuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvcldvcmRSaWdodCgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gYWR2YW5jZSB0byB0aGUgZW5kIG9mIHRoZSBuZXh0IHRva2VuXG4gICAgICAgIGlmIChtYXRjaCA9IHRoaXMuc2Vzc2lvbi50b2tlblJlLmV4ZWMocmlnaHRPZkN1cnNvcikpIHtcbiAgICAgICAgICAgIGNvbHVtbiArPSB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXg7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHdvcmQgb24gdGhlIGxlZnQuXG4gICAgKiovXG4gICAgbW92ZUN1cnNvckxvbmdXb3JkTGVmdCgpIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMubGVhZC5yb3c7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLmxlYWQuY29sdW1uO1xuXG4gICAgICAgIC8vIHNraXAgZm9sZHNcbiAgICAgICAgdmFyIGZvbGQ7XG4gICAgICAgIGlmIChmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChyb3csIGNvbHVtbiwgLTEpKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhmb2xkLnN0YXJ0LnJvdywgZm9sZC5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSG93IGRvZXMgdGhpcyBnZXQgZnJvbSB0aGUgZm9sZGluZyBhZGFwdGVyIG9udG8gdGhlIHNlc3Npb24/XG4gICAgICAgIHZhciBzdHIgPSB0aGlzLnNlc3Npb25bJ2dldEZvbGRTdHJpbmdBdCddKHJvdywgY29sdW1uLCAtMSk7XG4gICAgICAgIGlmIChzdHIgPT0gbnVsbCkge1xuICAgICAgICAgICAgc3RyID0gdGhpcy5kb2MuZ2V0TGluZShyb3cpLnN1YnN0cmluZygwLCBjb2x1bW4pXG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGVmdE9mQ3Vyc29yID0gbGFuZy5zdHJpbmdSZXZlcnNlKHN0cik7XG4gICAgICAgIHZhciBtYXRjaDtcbiAgICAgICAgdGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4ID0gMDtcblxuICAgICAgICAvLyBza2lwIHdoaXRlc3BhY2VcbiAgICAgICAgaWYgKG1hdGNoID0gdGhpcy5zZXNzaW9uLm5vblRva2VuUmUuZXhlYyhsZWZ0T2ZDdXJzb3IpKSB7XG4gICAgICAgICAgICBjb2x1bW4gLT0gdGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4O1xuICAgICAgICAgICAgbGVmdE9mQ3Vyc29yID0gbGVmdE9mQ3Vyc29yLnNsaWNlKHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmxhc3RJbmRleCk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgYXQgYmVnaW4gb2YgdGhlIGxpbmUgcHJvY2VlZCBpbiBsaW5lIGFib3ZlXG4gICAgICAgIGlmIChjb2x1bW4gPD0gMCkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCAwKTtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckxlZnQoKTtcbiAgICAgICAgICAgIGlmIChyb3cgPiAwKVxuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvcldvcmRMZWZ0KCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBtb3ZlIHRvIHRoZSBiZWdpbiBvZiB0aGUgd29yZFxuICAgICAgICBpZiAobWF0Y2ggPSB0aGlzLnNlc3Npb24udG9rZW5SZS5leGVjKGxlZnRPZkN1cnNvcikpIHtcbiAgICAgICAgICAgIGNvbHVtbiAtPSB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXg7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4pO1xuICAgIH1cblxuICAgICRzaG9ydFdvcmRFbmRJbmRleChyaWdodE9mQ3Vyc29yKSB7XG4gICAgICAgIHZhciBtYXRjaCwgaW5kZXggPSAwLCBjaDtcbiAgICAgICAgdmFyIHdoaXRlc3BhY2VSZSA9IC9cXHMvO1xuICAgICAgICB2YXIgdG9rZW5SZSA9IHRoaXMuc2Vzc2lvbi50b2tlblJlO1xuXG4gICAgICAgIHRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgaWYgKG1hdGNoID0gdGhpcy5zZXNzaW9uLnRva2VuUmUuZXhlYyhyaWdodE9mQ3Vyc29yKSkge1xuICAgICAgICAgICAgaW5kZXggPSB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXg7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB3aGlsZSAoKGNoID0gcmlnaHRPZkN1cnNvcltpbmRleF0pICYmIHdoaXRlc3BhY2VSZS50ZXN0KGNoKSlcbiAgICAgICAgICAgICAgICBpbmRleCsrO1xuXG4gICAgICAgICAgICBpZiAoaW5kZXggPCAxKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICAgICAgICAgIHdoaWxlICgoY2ggPSByaWdodE9mQ3Vyc29yW2luZGV4XSkgJiYgIXRva2VuUmUudGVzdChjaCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICAgICAgICAgICAgICBpbmRleCsrO1xuICAgICAgICAgICAgICAgICAgICBpZiAod2hpdGVzcGFjZVJlLnRlc3QoY2gpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPiAyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5kZXgtLVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aGlsZSAoKGNoID0gcmlnaHRPZkN1cnNvcltpbmRleF0pICYmIHdoaXRlc3BhY2VSZS50ZXN0KGNoKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5kZXgrKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPiAyKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRva2VuUmUubGFzdEluZGV4ID0gMDtcblxuICAgICAgICByZXR1cm4gaW5kZXg7XG4gICAgfVxuXG4gICAgbW92ZUN1cnNvclNob3J0V29yZFJpZ2h0KCkge1xuICAgICAgICB2YXIgcm93ID0gdGhpcy5sZWFkLnJvdztcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMubGVhZC5jb2x1bW47XG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5kb2MuZ2V0TGluZShyb3cpO1xuICAgICAgICB2YXIgcmlnaHRPZkN1cnNvciA9IGxpbmUuc3Vic3RyaW5nKGNvbHVtbik7XG5cbiAgICAgICAgdmFyIGZvbGQgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZEF0KHJvdywgY29sdW1uLCAxKTtcbiAgICAgICAgaWYgKGZvbGQpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5tb3ZlQ3Vyc29yVG8oZm9sZC5lbmQucm93LCBmb2xkLmVuZC5jb2x1bW4pO1xuXG4gICAgICAgIGlmIChjb2x1bW4gPT0gbGluZS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHZhciBsID0gdGhpcy5kb2MuZ2V0TGVuZ3RoKCk7XG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgcm93Kys7XG4gICAgICAgICAgICAgICAgcmlnaHRPZkN1cnNvciA9IHRoaXMuZG9jLmdldExpbmUocm93KVxuICAgICAgICAgICAgfSB3aGlsZSAocm93IDwgbCAmJiAvXlxccyokLy50ZXN0KHJpZ2h0T2ZDdXJzb3IpKVxuXG4gICAgICAgICAgICBpZiAoIS9eXFxzKy8udGVzdChyaWdodE9mQ3Vyc29yKSlcbiAgICAgICAgICAgICAgICByaWdodE9mQ3Vyc29yID0gXCJcIlxuICAgICAgICAgICAgY29sdW1uID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpbmRleCA9IHRoaXMuJHNob3J0V29yZEVuZEluZGV4KHJpZ2h0T2ZDdXJzb3IpO1xuXG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgY29sdW1uICsgaW5kZXgpO1xuICAgIH1cblxuICAgIG1vdmVDdXJzb3JTaG9ydFdvcmRMZWZ0KCkge1xuICAgICAgICB2YXIgcm93ID0gdGhpcy5sZWFkLnJvdztcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMubGVhZC5jb2x1bW47XG5cbiAgICAgICAgdmFyIGZvbGQ7XG4gICAgICAgIGlmIChmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChyb3csIGNvbHVtbiwgLTEpKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMubW92ZUN1cnNvclRvKGZvbGQuc3RhcnQucm93LCBmb2xkLnN0YXJ0LmNvbHVtbik7XG5cbiAgICAgICAgdmFyIGxpbmUgPSB0aGlzLnNlc3Npb24uZ2V0TGluZShyb3cpLnN1YnN0cmluZygwLCBjb2x1bW4pO1xuICAgICAgICBpZiAoY29sdW1uID09IDApIHtcbiAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICByb3ctLTtcbiAgICAgICAgICAgICAgICBsaW5lID0gdGhpcy5kb2MuZ2V0TGluZShyb3cpO1xuICAgICAgICAgICAgfSB3aGlsZSAocm93ID4gMCAmJiAvXlxccyokLy50ZXN0KGxpbmUpKVxuXG4gICAgICAgICAgICBjb2x1bW4gPSBsaW5lLmxlbmd0aDtcbiAgICAgICAgICAgIGlmICghL1xccyskLy50ZXN0KGxpbmUpKVxuICAgICAgICAgICAgICAgIGxpbmUgPSBcIlwiXG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGVmdE9mQ3Vyc29yID0gbGFuZy5zdHJpbmdSZXZlcnNlKGxpbmUpO1xuICAgICAgICB2YXIgaW5kZXggPSB0aGlzLiRzaG9ydFdvcmRFbmRJbmRleChsZWZ0T2ZDdXJzb3IpO1xuXG4gICAgICAgIHJldHVybiB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbiAtIGluZGV4KTtcbiAgICB9XG5cbiAgICBtb3ZlQ3Vyc29yV29yZFJpZ2h0KCkge1xuICAgICAgICAvLyBTZWUga2V5Ym9hcmQvZW1hY3MuanNcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvblsnJHNlbGVjdExvbmdXb3JkcyddKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JMb25nV29yZFJpZ2h0KCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JTaG9ydFdvcmRSaWdodCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbW92ZUN1cnNvcldvcmRMZWZ0KCkge1xuICAgICAgICAvLyBTZWUga2V5Ym9hcmQvZW1hY3MuanNcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvblsnJHNlbGVjdExvbmdXb3JkcyddKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JMb25nV29yZExlZnQoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclNob3J0V29yZExlZnQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byBwb3NpdGlvbiBpbmRpY2F0ZWQgYnkgdGhlIHBhcmFtZXRlcnMuIE5lZ2F0aXZlIG51bWJlcnMgbW92ZSB0aGUgY3Vyc29yIGJhY2t3YXJkcyBpbiB0aGUgZG9jdW1lbnQuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93cyBUaGUgbnVtYmVyIG9mIHJvd3MgdG8gbW92ZSBieVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNoYXJzIFRoZSBudW1iZXIgb2YgY2hhcmFjdGVycyB0byBtb3ZlIGJ5XG4gICAgKlxuICAgICpcbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvblxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JCeShyb3dzLCBjaGFycykge1xuICAgICAgICB2YXIgc2NyZWVuUG9zID0gdGhpcy5zZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihcbiAgICAgICAgICAgIHRoaXMubGVhZC5yb3csXG4gICAgICAgICAgICB0aGlzLmxlYWQuY29sdW1uXG4gICAgICAgICk7XG5cbiAgICAgICAgaWYgKGNoYXJzID09PSAwKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kZGVzaXJlZENvbHVtbilcbiAgICAgICAgICAgICAgICBzY3JlZW5Qb3MuY29sdW1uID0gdGhpcy4kZGVzaXJlZENvbHVtbjtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLiRkZXNpcmVkQ29sdW1uID0gc2NyZWVuUG9zLmNvbHVtbjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBkb2NQb3MgPSB0aGlzLnNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblBvcy5yb3cgKyByb3dzLCBzY3JlZW5Qb3MuY29sdW1uKTtcblxuICAgICAgICBpZiAocm93cyAhPT0gMCAmJiBjaGFycyA9PT0gMCAmJiBkb2NQb3Mucm93ID09PSB0aGlzLmxlYWQucm93ICYmIGRvY1Bvcy5jb2x1bW4gPT09IHRoaXMubGVhZC5jb2x1bW4pIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnNlc3Npb24ubGluZVdpZGdldHMgJiYgdGhpcy5zZXNzaW9uLmxpbmVXaWRnZXRzW2RvY1Bvcy5yb3ddKVxuICAgICAgICAgICAgICAgIGRvY1Bvcy5yb3crKztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIG1vdmUgdGhlIGN1cnNvciBhbmQgdXBkYXRlIHRoZSBkZXNpcmVkIGNvbHVtblxuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhkb2NQb3Mucm93LCBkb2NQb3MuY29sdW1uICsgY2hhcnMsIGNoYXJzID09PSAwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIHBvc2l0aW9uIGluZGljYXRlZCBieSBpdHMgYHJvd2AgYW5kIGBjb2x1bW5gLlxuICAgICogQHBhcmFtIHtPYmplY3R9IHBvc2l0aW9uIFRoZSBwb3NpdGlvbiB0byBtb3ZlIHRvXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yVG9Qb3NpdGlvbihwb3NpdGlvbikge1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhwb3NpdGlvbi5yb3csIHBvc2l0aW9uLmNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSByb3cgYW5kIGNvbHVtbiBwcm92aWRlZC4gW0lmIGBwcmV2ZW50VXBkYXRlRGVzaXJlZENvbHVtbmAgaXMgYHRydWVgLCB0aGVuIHRoZSBjdXJzb3Igc3RheXMgaW4gdGhlIHNhbWUgY29sdW1uIHBvc2l0aW9uIGFzIGl0cyBvcmlnaW5hbCBwb2ludC5dezogI3ByZXZlbnRVcGRhdGVCb29sRGVzY31cbiAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3cgVGhlIHJvdyB0byBtb3ZlIHRvXG4gICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gdG8gbW92ZSB0b1xuICAgICogQHBhcmFtIHtib29sZWFufSBrZWVwRGVzaXJlZENvbHVtbiBbSWYgYHRydWVgLCB0aGUgY3Vyc29yIG1vdmUgZG9lcyBub3QgcmVzcGVjdCB0aGUgcHJldmlvdXMgY29sdW1uXXs6ICNwcmV2ZW50VXBkYXRlQm9vbH1cbiAgICAqL1xuICAgIG1vdmVDdXJzb3JUbyhyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGtlZXBEZXNpcmVkQ29sdW1uPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICAvLyBFbnN1cmUgdGhlIHJvdy9jb2x1bW4gaXMgbm90IGluc2lkZSBvZiBhIGZvbGQuXG4gICAgICAgIHZhciBmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChyb3csIGNvbHVtbiwgMSk7XG4gICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICByb3cgPSBmb2xkLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIGNvbHVtbiA9IGZvbGQuc3RhcnQuY29sdW1uO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4ka2VlcERlc2lyZWRDb2x1bW5PbkNoYW5nZSA9IHRydWU7XG4gICAgICAgIHRoaXMubGVhZC5zZXRQb3NpdGlvbihyb3csIGNvbHVtbik7XG4gICAgICAgIHRoaXMuJGtlZXBEZXNpcmVkQ29sdW1uT25DaGFuZ2UgPSBmYWxzZTtcblxuICAgICAgICBpZiAoIWtlZXBEZXNpcmVkQ29sdW1uKVxuICAgICAgICAgICAgdGhpcy4kZGVzaXJlZENvbHVtbiA9IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzY3JlZW4gcG9zaXRpb24gaW5kaWNhdGVkIGJ5IHJvdyBhbmQgY29sdW1uLiB7OnByZXZlbnRVcGRhdGVCb29sRGVzY31cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBtb3ZlIHRvXG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gdG8gbW92ZSB0b1xuICAgICogQHBhcmFtIHtCb29sZWFufSBrZWVwRGVzaXJlZENvbHVtbiB7OnByZXZlbnRVcGRhdGVCb29sfVxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgbW92ZUN1cnNvclRvU2NyZWVuKHJvdywgY29sdW1uLCBrZWVwRGVzaXJlZENvbHVtbikge1xuICAgICAgICB2YXIgcG9zID0gdGhpcy5zZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihyb3csIGNvbHVtbik7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHBvcy5yb3csIHBvcy5jb2x1bW4sIGtlZXBEZXNpcmVkQ29sdW1uKTtcbiAgICB9XG5cbiAgICAvLyByZW1vdmUgbGlzdGVuZXJzIGZyb20gZG9jdW1lbnRcbiAgICBkZXRhY2goKSB7XG4gICAgICAgIHRoaXMubGVhZC5kZXRhY2goKTtcbiAgICAgICAgdGhpcy5hbmNob3IuZGV0YWNoKCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbiA9IHRoaXMuZG9jID0gbnVsbDtcbiAgICB9XG5cbiAgICBmcm9tT3JpZW50ZWRSYW5nZShyYW5nZSkge1xuICAgICAgICB0aGlzLnNldFNlbGVjdGlvblJhbmdlKHJhbmdlLCByYW5nZS5jdXJzb3IgPT0gcmFuZ2Uuc3RhcnQpO1xuICAgICAgICB0aGlzLiRkZXNpcmVkQ29sdW1uID0gcmFuZ2UuZGVzaXJlZENvbHVtbiB8fCB0aGlzLiRkZXNpcmVkQ29sdW1uO1xuICAgIH1cblxuICAgIHRvT3JpZW50ZWRSYW5nZShyYW5nZT8pIHtcbiAgICAgICAgdmFyIHIgPSB0aGlzLmdldFJhbmdlKCk7XG4gICAgICAgIGlmIChyYW5nZSkge1xuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uID0gci5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICByYW5nZS5zdGFydC5yb3cgPSByLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSByLmVuZC5jb2x1bW47XG4gICAgICAgICAgICByYW5nZS5lbmQucm93ID0gci5lbmQucm93O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmFuZ2UgPSByO1xuICAgICAgICB9XG5cbiAgICAgICAgcmFuZ2UuY3Vyc29yID0gdGhpcy5pc0JhY2t3YXJkcygpID8gcmFuZ2Uuc3RhcnQgOiByYW5nZS5lbmQ7XG4gICAgICAgIHJhbmdlLmRlc2lyZWRDb2x1bW4gPSB0aGlzLiRkZXNpcmVkQ29sdW1uO1xuICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTYXZlcyB0aGUgY3VycmVudCBjdXJzb3IgcG9zaXRpb24gYW5kIGNhbGxzIGBmdW5jYCB0aGF0IGNhbiBjaGFuZ2UgdGhlIGN1cnNvclxuICAgICogcG9zdGlvbi4gVGhlIHJlc3VsdCBpcyB0aGUgcmFuZ2Ugb2YgdGhlIHN0YXJ0aW5nIGFuZCBldmVudHVhbCBjdXJzb3IgcG9zaXRpb24uXG4gICAgKiBXaWxsIHJlc2V0IHRoZSBjdXJzb3IgcG9zaXRpb24uXG4gICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBUaGUgY2FsbGJhY2sgdGhhdCBzaG91bGQgY2hhbmdlIHRoZSBjdXJzb3IgcG9zaXRpb25cbiAgICAqIEByZXR1cm5zIHtSYW5nZX1cbiAgICAqXG4gICAgKiovXG4gICAgZ2V0UmFuZ2VPZk1vdmVtZW50cyhmdW5jKSB7XG4gICAgICAgIHZhciBzdGFydCA9IHRoaXMuZ2V0Q3Vyc29yKCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmdW5jLmNhbGwobnVsbCwgdGhpcyk7XG4gICAgICAgICAgICB2YXIgZW5kID0gdGhpcy5nZXRDdXJzb3IoKTtcbiAgICAgICAgICAgIHJldHVybiBybmcuUmFuZ2UuZnJvbVBvaW50cyhzdGFydCwgZW5kKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmV0dXJuIHJuZy5SYW5nZS5mcm9tUG9pbnRzKHN0YXJ0LCBzdGFydCk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKHN0YXJ0KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRvSlNPTigpIHtcbiAgICAgICAgaWYgKHRoaXMucmFuZ2VDb3VudCkge1xuICAgICAgICAgICAgdmFyIGRhdGE6IGFueSA9IHRoaXMucmFuZ2VzLm1hcChmdW5jdGlvbihyKSB7XG4gICAgICAgICAgICAgICAgdmFyIHIxID0gci5jbG9uZSgpO1xuICAgICAgICAgICAgICAgIHIxLmlzQmFja3dhcmRzID0gci5jdXJzb3IgPT0gci5zdGFydDtcbiAgICAgICAgICAgICAgICByZXR1cm4gcjE7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBkYXRhOiBhbnkgPSB0aGlzLmdldFJhbmdlKCk7XG4gICAgICAgICAgICBkYXRhLmlzQmFja3dhcmRzID0gdGhpcy5pc0JhY2t3YXJkcygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkYXRhO1xuICAgIH1cblxuICAgIHByaXZhdGUgdG9TaW5nbGVSYW5nZShkYXRhKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlNlbGVjdGlvbi50b1NpbmdsZVJhbmdlIGlzIHVuc3VwcG9ydGVkXCIpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhZGRSYW5nZShkYXRhLCBzb21ldGhpbmc6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiU2VsZWN0aW9uLmFkZFJhbmdlIGlzIHVuc3VwcG9ydGVkXCIpO1xuICAgIH1cblxuICAgIGZyb21KU09OKGRhdGEpIHtcbiAgICAgICAgaWYgKGRhdGEuc3RhcnQgPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5yYW5nZUxpc3QpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRvU2luZ2xlUmFuZ2UoZGF0YVswXSk7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IGRhdGEubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciByOiBhbnkgPSBybmcuUmFuZ2UuZnJvbVBvaW50cyhkYXRhW2ldLnN0YXJ0LCBkYXRhW2ldLmVuZCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkYXRhLmlzQmFja3dhcmRzKVxuICAgICAgICAgICAgICAgICAgICAgICAgci5jdXJzb3IgPSByLnN0YXJ0O1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZFJhbmdlKHIsIHRydWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICBkYXRhID0gZGF0YVswXTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5yYW5nZUxpc3QpXG4gICAgICAgICAgICB0aGlzLnRvU2luZ2xlUmFuZ2UoZGF0YSk7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uUmFuZ2UoZGF0YSwgZGF0YS5pc0JhY2t3YXJkcyk7XG4gICAgfVxuXG4gICAgaXNFcXVhbChkYXRhKSB7XG4gICAgICAgIGlmICgoZGF0YS5sZW5ndGggfHwgdGhpcy5yYW5nZUNvdW50KSAmJiBkYXRhLmxlbmd0aCAhPSB0aGlzLnJhbmdlQ291bnQpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmICghZGF0YS5sZW5ndGggfHwgIXRoaXMucmFuZ2VzKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0UmFuZ2UoKS5pc0VxdWFsKGRhdGEpO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSB0aGlzLnJhbmdlcy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5yYW5nZXNbaV0uaXNFcXVhbChkYXRhW2ldKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG59XG4iXX0=