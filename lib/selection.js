var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var lang = require("./lib/lang");
var evem = require("./lib/event_emitter");
var rng = require("./range");
var Selection = (function (_super) {
    __extends(Selection, _super);
    function Selection(session) {
        _super.call(this);
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
    Selection.prototype.isEmpty = function () {
        return (this.$isEmpty || (this.anchor.row == this.lead.row &&
            this.anchor.column == this.lead.column));
    };
    Selection.prototype.isMultiLine = function () {
        if (this.isEmpty()) {
            return false;
        }
        return this.getRange().isMultiLine();
    };
    Selection.prototype.getCursor = function () {
        return this.lead.getPosition();
    };
    Selection.prototype.setSelectionAnchor = function (row, column) {
        this.anchor.setPosition(row, column);
        if (this.$isEmpty) {
            this.$isEmpty = false;
            this._emit("changeSelection");
        }
    };
    Selection.prototype.getSelectionAnchor = function () {
        if (this.$isEmpty)
            return this.getSelectionLead();
        else
            return this.anchor.getPosition();
    };
    Selection.prototype.getSelectionLead = function () {
        return this.lead.getPosition();
    };
    Selection.prototype.shiftSelection = function (columns) {
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
    };
    Selection.prototype.isBackwards = function () {
        var anchor = this.anchor;
        var lead = this.lead;
        return (anchor.row > lead.row || (anchor.row == lead.row && anchor.column > lead.column));
    };
    Selection.prototype.getRange = function () {
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
    };
    Selection.prototype.clearSelection = function () {
        if (!this.$isEmpty) {
            this.$isEmpty = true;
            this._emit("changeSelection");
        }
    };
    Selection.prototype.selectAll = function () {
        var lastRow = this.doc.getLength() - 1;
        this.setSelectionAnchor(0, 0);
        this.moveCursorTo(lastRow, this.doc.getLine(lastRow).length);
    };
    Selection.prototype.setRange = function (range, reverse) {
        this.setSelectionRange(range, reverse);
    };
    Selection.prototype.setSelectionRange = function (range, reverse) {
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
    };
    Selection.prototype.$moveSelection = function (mover) {
        var lead = this.lead;
        if (this.$isEmpty)
            this.setSelectionAnchor(lead.row, lead.column);
        mover.call(this);
    };
    Selection.prototype.selectTo = function (row, column) {
        this.$moveSelection(function () {
            this.moveCursorTo(row, column);
        });
    };
    Selection.prototype.selectToPosition = function (pos) {
        this.$moveSelection(function () {
            this.moveCursorToPosition(pos);
        });
    };
    Selection.prototype.moveTo = function (row, column) {
        this.clearSelection();
        this.moveCursorTo(row, column);
    };
    Selection.prototype.moveToPosition = function (pos) {
        this.clearSelection();
        this.moveCursorToPosition(pos);
    };
    Selection.prototype.selectUp = function () {
        this.$moveSelection(this.moveCursorUp);
    };
    Selection.prototype.selectDown = function () {
        this.$moveSelection(this.moveCursorDown);
    };
    Selection.prototype.selectRight = function () {
        this.$moveSelection(this.moveCursorRight);
    };
    Selection.prototype.selectLeft = function () {
        this.$moveSelection(this.moveCursorLeft);
    };
    Selection.prototype.selectLineStart = function () {
        this.$moveSelection(this.moveCursorLineStart);
    };
    Selection.prototype.selectLineEnd = function () {
        this.$moveSelection(this.moveCursorLineEnd);
    };
    Selection.prototype.selectFileEnd = function () {
        this.$moveSelection(this.moveCursorFileEnd);
    };
    Selection.prototype.selectFileStart = function () {
        this.$moveSelection(this.moveCursorFileStart);
    };
    Selection.prototype.selectWordRight = function () {
        this.$moveSelection(this.moveCursorWordRight);
    };
    Selection.prototype.selectWordLeft = function () {
        this.$moveSelection(this.moveCursorWordLeft);
    };
    Selection.prototype.getWordRange = function (row, column) {
        if (typeof column == "undefined") {
            var cursor = row || this.lead;
            row = cursor.row;
            column = cursor.column;
        }
        return this.session.getWordRange(row, column);
    };
    Selection.prototype.selectWord = function () {
        this.setSelectionRange(this.getWordRange());
    };
    Selection.prototype.selectAWord = function () {
        var cursor = this.getCursor();
        var range = this.session.getAWordRange(cursor.row, cursor.column);
        this.setSelectionRange(range);
    };
    Selection.prototype.getLineRange = function (row, excludeLastChar) {
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
    };
    Selection.prototype.selectLine = function () {
        this.setSelectionRange(this.getLineRange());
    };
    Selection.prototype.moveCursorUp = function () {
        this.moveCursorBy(-1, 0);
    };
    Selection.prototype.moveCursorDown = function () {
        this.moveCursorBy(1, 0);
    };
    Selection.prototype.moveCursorLeft = function () {
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
    };
    Selection.prototype.moveCursorRight = function () {
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
    };
    Selection.prototype.moveCursorLineStart = function () {
        var row = this.lead.row;
        var column = this.lead.column;
        var screenRow = this.session.documentToScreenRow(row, column);
        var firstColumnPosition = this.session.screenToDocumentPosition(screenRow, 0);
        var beforeCursor = this.session['getDisplayLine'](row, null, firstColumnPosition.row, firstColumnPosition.column);
        var leadingSpace = beforeCursor.match(/^\s*/);
        if (leadingSpace[0].length != column && !this.session['$useEmacsStyleLineStart'])
            firstColumnPosition.column += leadingSpace[0].length;
        this.moveCursorToPosition(firstColumnPosition);
    };
    Selection.prototype.moveCursorLineEnd = function () {
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
    };
    Selection.prototype.moveCursorFileEnd = function () {
        var row = this.doc.getLength() - 1;
        var column = this.doc.getLine(row).length;
        this.moveCursorTo(row, column);
    };
    Selection.prototype.moveCursorFileStart = function () {
        this.moveCursorTo(0, 0);
    };
    Selection.prototype.moveCursorLongWordRight = function () {
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
    };
    Selection.prototype.moveCursorLongWordLeft = function () {
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
    };
    Selection.prototype.$shortWordEndIndex = function (rightOfCursor) {
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
    };
    Selection.prototype.moveCursorShortWordRight = function () {
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
    };
    Selection.prototype.moveCursorShortWordLeft = function () {
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
    };
    Selection.prototype.moveCursorWordRight = function () {
        if (this.session['$selectLongWords']) {
            this.moveCursorLongWordRight();
        }
        else {
            this.moveCursorShortWordRight();
        }
    };
    Selection.prototype.moveCursorWordLeft = function () {
        if (this.session['$selectLongWords']) {
            this.moveCursorLongWordLeft();
        }
        else {
            this.moveCursorShortWordLeft();
        }
    };
    Selection.prototype.moveCursorBy = function (rows, chars) {
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
    };
    Selection.prototype.moveCursorToPosition = function (position) {
        this.moveCursorTo(position.row, position.column);
    };
    Selection.prototype.moveCursorTo = function (row, column, keepDesiredColumn) {
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
    };
    Selection.prototype.moveCursorToScreen = function (row, column, keepDesiredColumn) {
        var pos = this.session.screenToDocumentPosition(row, column);
        this.moveCursorTo(pos.row, pos.column, keepDesiredColumn);
    };
    Selection.prototype.detach = function () {
        this.lead.detach();
        this.anchor.detach();
        this.session = this.doc = null;
    };
    Selection.prototype.fromOrientedRange = function (range) {
        this.setSelectionRange(range, range.cursor == range.start);
        this.$desiredColumn = range.desiredColumn || this.$desiredColumn;
    };
    Selection.prototype.toOrientedRange = function (range) {
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
    };
    Selection.prototype.getRangeOfMovements = function (func) {
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
    };
    Selection.prototype.toJSON = function () {
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
    };
    Selection.prototype.toSingleRange = function (data) {
        throw new Error("Selection.toSingleRange is unsupported");
    };
    Selection.prototype.addRange = function (data, something) {
        throw new Error("Selection.addRange is unsupported");
    };
    Selection.prototype.fromJSON = function (data) {
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
    };
    Selection.prototype.isEqual = function (data) {
        if ((data.length || this.rangeCount) && data.length != this.rangeCount)
            return false;
        if (!data.length || !this.ranges)
            return this.getRange().isEqual(data);
        for (var i = this.ranges.length; i--;) {
            if (!this.ranges[i].isEqual(data[i]))
                return false;
        }
        return true;
    };
    return Selection;
})(evem.EventEmitterClass);
exports.Selection = Selection;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VsZWN0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3NlbGVjdGlvbi50cyJdLCJuYW1lcyI6WyJTZWxlY3Rpb24iLCJTZWxlY3Rpb24uY29uc3RydWN0b3IiLCJTZWxlY3Rpb24uaXNFbXB0eSIsIlNlbGVjdGlvbi5pc011bHRpTGluZSIsIlNlbGVjdGlvbi5nZXRDdXJzb3IiLCJTZWxlY3Rpb24uc2V0U2VsZWN0aW9uQW5jaG9yIiwiU2VsZWN0aW9uLmdldFNlbGVjdGlvbkFuY2hvciIsIlNlbGVjdGlvbi5nZXRTZWxlY3Rpb25MZWFkIiwiU2VsZWN0aW9uLnNoaWZ0U2VsZWN0aW9uIiwiU2VsZWN0aW9uLmlzQmFja3dhcmRzIiwiU2VsZWN0aW9uLmdldFJhbmdlIiwiU2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uIiwiU2VsZWN0aW9uLnNlbGVjdEFsbCIsIlNlbGVjdGlvbi5zZXRSYW5nZSIsIlNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZSIsIlNlbGVjdGlvbi4kbW92ZVNlbGVjdGlvbiIsIlNlbGVjdGlvbi5zZWxlY3RUbyIsIlNlbGVjdGlvbi5zZWxlY3RUb1Bvc2l0aW9uIiwiU2VsZWN0aW9uLm1vdmVUbyIsIlNlbGVjdGlvbi5tb3ZlVG9Qb3NpdGlvbiIsIlNlbGVjdGlvbi5zZWxlY3RVcCIsIlNlbGVjdGlvbi5zZWxlY3REb3duIiwiU2VsZWN0aW9uLnNlbGVjdFJpZ2h0IiwiU2VsZWN0aW9uLnNlbGVjdExlZnQiLCJTZWxlY3Rpb24uc2VsZWN0TGluZVN0YXJ0IiwiU2VsZWN0aW9uLnNlbGVjdExpbmVFbmQiLCJTZWxlY3Rpb24uc2VsZWN0RmlsZUVuZCIsIlNlbGVjdGlvbi5zZWxlY3RGaWxlU3RhcnQiLCJTZWxlY3Rpb24uc2VsZWN0V29yZFJpZ2h0IiwiU2VsZWN0aW9uLnNlbGVjdFdvcmRMZWZ0IiwiU2VsZWN0aW9uLmdldFdvcmRSYW5nZSIsIlNlbGVjdGlvbi5zZWxlY3RXb3JkIiwiU2VsZWN0aW9uLnNlbGVjdEFXb3JkIiwiU2VsZWN0aW9uLmdldExpbmVSYW5nZSIsIlNlbGVjdGlvbi5zZWxlY3RMaW5lIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JVcCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yRG93biIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGVmdCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yUmlnaHQiLCJTZWxlY3Rpb24ubW92ZUN1cnNvckxpbmVTdGFydCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGluZUVuZCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yRmlsZUVuZCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yRmlsZVN0YXJ0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JMb25nV29yZFJpZ2h0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JMb25nV29yZExlZnQiLCJTZWxlY3Rpb24uJHNob3J0V29yZEVuZEluZGV4IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JTaG9ydFdvcmRSaWdodCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yU2hvcnRXb3JkTGVmdCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yV29yZFJpZ2h0IiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JXb3JkTGVmdCIsIlNlbGVjdGlvbi5tb3ZlQ3Vyc29yQnkiLCJTZWxlY3Rpb24ubW92ZUN1cnNvclRvUG9zaXRpb24iLCJTZWxlY3Rpb24ubW92ZUN1cnNvclRvIiwiU2VsZWN0aW9uLm1vdmVDdXJzb3JUb1NjcmVlbiIsIlNlbGVjdGlvbi5kZXRhY2giLCJTZWxlY3Rpb24uZnJvbU9yaWVudGVkUmFuZ2UiLCJTZWxlY3Rpb24udG9PcmllbnRlZFJhbmdlIiwiU2VsZWN0aW9uLmdldFJhbmdlT2ZNb3ZlbWVudHMiLCJTZWxlY3Rpb24udG9KU09OIiwiU2VsZWN0aW9uLnRvU2luZ2xlUmFuZ2UiLCJTZWxlY3Rpb24uYWRkUmFuZ2UiLCJTZWxlY3Rpb24uZnJvbUpTT04iLCJTZWxlY3Rpb24uaXNFcXVhbCJdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFnQ0EsSUFBTyxJQUFJLFdBQVcsWUFBWSxD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QUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLE9BQU9BLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLElBQUlBLE9BQU9BLENBQUNBO2dCQUM5SUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLElBQUlBO2dCQUNBQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNqQ0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFNRHJDLG1DQUFlQSxHQUFmQTtRQUNJc0MsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0E7UUFDbENBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQzFEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNQQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNyREEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEVBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUMzQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUNBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO1lBQ3hDQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUN2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsSUFBSUEsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2hKQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUNsQ0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0ZBLElBQUlBLENBQUNB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LElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3ZDQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtJQUNuQ0EsQ0FBQ0E7SUFNRDNDLDBDQUFzQkEsR0FBdEJBO1FBQ0k0QyxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUN4QkEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFHOUJBLElBQUlBLElBQUlBLENBQUNBO1FBQ1RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pEQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNyREEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFHREEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUMzREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZEEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQUE7UUFDcERBLENBQUNBO1FBRURBLElBQUlBLFlBQVlBLEdBQUdBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzNDQSxJQUFJQSxLQUFLQSxDQUFDQTtRQUNWQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN0Q0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFHbkNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JEQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUM1Q0EsWUFBWUEsR0FBR0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDckVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzFDQSxDQUFDQTtRQUdEQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNkQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsSUFBSUEsQ0FBQ0EsY0FBY0EsRUFBRUEsQ0FBQ0E7WUFDdEJBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNSQSxJQUFJQSxDQUFDQSxrQkFBa0JBLEVBQUVBLENBQUNBO1lBQzlCQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUdEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxP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QUFDQSxHQUFHQSxDQUFDQTtRQUN4QkEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDOUJBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2pDQSxJQUFJQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUUzQ0EsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDbERBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBO1lBQ0xBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRTVEQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4QkEsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0E7WUFDN0JBLEdBQUdBLENBQUNBO2dCQUNBQSxHQUFHQSxFQUFFQSxDQUFDQTtnQkFDTkEsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQUE7WUFDekNBLENBQUNBLFFBQVFBLEdBQUdBLEdBQUdBLENBQUNBLElBQUlBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLEVBQUNBO1lBRWhEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtn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QUFJLENBQUMsaUJBQWlCLEVBeTVCcEQ7QUF6NUJZLGlCQUFTLFlBeTVCckIsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXG5pbXBvcnQgZG9jbSA9IHJlcXVpcmUoXCIuL2RvY3VtZW50XCIpO1xuaW1wb3J0IG9vcCA9IHJlcXVpcmUoXCIuL2xpYi9vb3BcIik7XG5pbXBvcnQgbGFuZyA9IHJlcXVpcmUoXCIuL2xpYi9sYW5nXCIpO1xuaW1wb3J0IGV2ZW0gPSByZXF1aXJlKFwiLi9saWIvZXZlbnRfZW1pdHRlclwiKTtcbmltcG9ydCBybmcgPSByZXF1aXJlKFwiLi9yYW5nZVwiKTtcbmltcG9ydCBybG0gPSByZXF1aXJlKFwiLi9yYW5nZV9saXN0XCIpO1xuaW1wb3J0IGVzbSA9IHJlcXVpcmUoXCIuL2VkaXRfc2Vzc2lvblwiKTtcbmltcG9ydCBhbm0gPSByZXF1aXJlKFwiLi9hbmNob3JcIik7XG5cbi8qKlxuICogQ29udGFpbnMgdGhlIGN1cnNvciBwb3NpdGlvbiBhbmQgdGhlIHRleHQgc2VsZWN0aW9uIG9mIGFuIGVkaXQgc2Vzc2lvbi5cbiAqXG4gKiBUaGUgcm93L2NvbHVtbnMgdXNlZCBpbiB0aGUgc2VsZWN0aW9uIGFyZSBpbiBkb2N1bWVudCBjb29yZGluYXRlcyByZXByZXNlbnRpbmcgdGhzIGNvb3JkaW5hdGVzIGFzIHRoZXogYXBwZWFyIGluIHRoZSBkb2N1bWVudCBiZWZvcmUgYXBwbHlpbmcgc29mdCB3cmFwIGFuZCBmb2xkaW5nLlxuICogQGNsYXNzIFNlbGVjdGlvblxuICoqL1xuXG5cbi8qKlxuICogRW1pdHRlZCB3aGVuIHRoZSBjdXJzb3IgcG9zaXRpb24gY2hhbmdlcy5cbiAqIEBldmVudCBjaGFuZ2VDdXJzb3JcbiAqXG4qKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIHRoZSBjdXJzb3Igc2VsZWN0aW9uIGNoYW5nZXMuXG4gKiBcbiAqICBAZXZlbnQgY2hhbmdlU2VsZWN0aW9uXG4qKi9cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBgU2VsZWN0aW9uYCBvYmplY3QuXG4gKiBAcGFyYW0ge0VkaXRTZXNzaW9ufSBzZXNzaW9uIFRoZSBzZXNzaW9uIHRvIHVzZVxuICogXG4gKiBAY29uc3RydWN0b3JcbiAqKi9cbmV4cG9ydCBjbGFzcyBTZWxlY3Rpb24gZXh0ZW5kcyBldmVtLkV2ZW50RW1pdHRlckNsYXNzIHtcbiAgICBwcml2YXRlIHNlc3Npb246IGVzbS5FZGl0U2Vzc2lvbjtcbiAgICBwcml2YXRlIGRvYzogZG9jbS5Eb2N1bWVudDtcbiAgICAvLyBXaHkgZG8gd2Ugc2VlbSB0byBoYXZlIGNvcGllcz9cbiAgICBwdWJsaWMgbGVhZDogYW5tLkFuY2hvcjtcbiAgICBwdWJsaWMgYW5jaG9yOiBhbm0uQW5jaG9yO1xuICAgIHByaXZhdGUgc2VsZWN0aW9uTGVhZDogYW5tLkFuY2hvcjtcbiAgICBwcml2YXRlIHNlbGVjdGlvbkFuY2hvcjogYW5tLkFuY2hvcjtcbiAgICBwcml2YXRlICRpc0VtcHR5OiBib29sZWFuO1xuICAgIHByaXZhdGUgJGtlZXBEZXNpcmVkQ29sdW1uT25DaGFuZ2U6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkZGVzaXJlZENvbHVtbjsgIC8vIElzIHRoaXMgdXNlZCBhbnl3aGVyZT9cbiAgICBwcml2YXRlIHJhbmdlQ291bnQ7XG4gICAgcHVibGljIHJhbmdlcztcbiAgICBwdWJsaWMgcmFuZ2VMaXN0OiBybG0uUmFuZ2VMaXN0O1xuICAgIGNvbnN0cnVjdG9yKHNlc3Npb246IGVzbS5FZGl0U2Vzc2lvbikge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICB0aGlzLnNlc3Npb24gPSBzZXNzaW9uO1xuICAgICAgICB0aGlzLmRvYyA9IHNlc3Npb24uZ2V0RG9jdW1lbnQoKTtcblxuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIHRoaXMubGVhZCA9IHRoaXMuc2VsZWN0aW9uTGVhZCA9IHRoaXMuZG9jLmNyZWF0ZUFuY2hvcigwLCAwKTtcbiAgICAgICAgdGhpcy5hbmNob3IgPSB0aGlzLnNlbGVjdGlvbkFuY2hvciA9IHRoaXMuZG9jLmNyZWF0ZUFuY2hvcigwLCAwKTtcblxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMubGVhZC5vbihcImNoYW5nZVwiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBzZWxmLl9lbWl0KFwiY2hhbmdlQ3Vyc29yXCIpO1xuICAgICAgICAgICAgaWYgKCFzZWxmLiRpc0VtcHR5KVxuICAgICAgICAgICAgICAgIHNlbGYuX2VtaXQoXCJjaGFuZ2VTZWxlY3Rpb25cIik7XG4gICAgICAgICAgICBpZiAoIXNlbGYuJGtlZXBEZXNpcmVkQ29sdW1uT25DaGFuZ2UgJiYgZS5vbGQuY29sdW1uICE9IGUudmFsdWUuY29sdW1uKVxuICAgICAgICAgICAgICAgIHNlbGYuJGRlc2lyZWRDb2x1bW4gPSBudWxsO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnNlbGVjdGlvbkFuY2hvci5vbihcImNoYW5nZVwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmICghc2VsZi4kaXNFbXB0eSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX2VtaXQoXCJjaGFuZ2VTZWxlY3Rpb25cIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHNlbGVjdGlvbiBpcyBlbXB0eS5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBpc0VtcHR5KCkge1xuICAgICAgICAvLyBXaGF0IGlzIHRoZSBkaWZmZXJlbmNlIGJldHdlZW4gJGlzRW1wdHkgYW5kIHdoYXQgdGhpcyBmdW5jdGlvbiByZXR1cm5zP1xuICAgICAgICByZXR1cm4gKHRoaXMuJGlzRW1wdHkgfHwgKFxuICAgICAgICAgICAgdGhpcy5hbmNob3Iucm93ID09IHRoaXMubGVhZC5yb3cgJiZcbiAgICAgICAgICAgIHRoaXMuYW5jaG9yLmNvbHVtbiA9PSB0aGlzLmxlYWQuY29sdW1uXG4gICAgICAgICkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHNlbGVjdGlvbiBpcyBhIG11bHRpLWxpbmUuXG4gICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAqKi9cbiAgICBpc011bHRpTGluZSgpIHtcbiAgICAgICAgaWYgKHRoaXMuaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy5nZXRSYW5nZSgpLmlzTXVsdGlMaW5lKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBgcm93YCBhbmQgYGNvbHVtbmAgY3VycmVudCBwb3NpdGlvbiBvZiB0aGUgY3Vyc29yLlxuICAgICogQHJldHVybnMge09iamVjdH1cbiAgICAqKi9cbiAgICBnZXRDdXJzb3IoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxlYWQuZ2V0UG9zaXRpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNldHMgdGhlIHJvdyBhbmQgY29sdW1uIHBvc2l0aW9uIG9mIHRoZSBhbmNob3IuIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VTZWxlY3Rpb24nYCBldmVudC5cbiAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3cgVGhlIG5ldyByb3dcbiAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW4gVGhlIG5ldyBjb2x1bW5cbiAgICAqKi9cbiAgICBzZXRTZWxlY3Rpb25BbmNob3Iocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuYW5jaG9yLnNldFBvc2l0aW9uKHJvdywgY29sdW1uKTtcblxuICAgICAgICBpZiAodGhpcy4kaXNFbXB0eSkge1xuICAgICAgICAgICAgdGhpcy4kaXNFbXB0eSA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5fZW1pdChcImNoYW5nZVNlbGVjdGlvblwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgYHJvd2AgYW5kIGBjb2x1bW5gIG9mIHRoZSBjYWxsaW5nIHNlbGVjdGlvbiBhbmNob3IuXG4gICAgKlxuICAgICogQHJldHVybnMge09iamVjdH1cbiAgICAqIEByZWxhdGVkIEFuY2hvci5nZXRQb3NpdGlvblxuICAgICoqL1xuICAgIGdldFNlbGVjdGlvbkFuY2hvcigpIHtcbiAgICAgICAgaWYgKHRoaXMuJGlzRW1wdHkpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRTZWxlY3Rpb25MZWFkKClcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYW5jaG9yLmdldFBvc2l0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgYHJvd2AgYW5kIGBjb2x1bW5gIG9mIHRoZSBjYWxsaW5nIHNlbGVjdGlvbiBsZWFkLlxuICAgICogQHJldHVybnMge09iamVjdH1cbiAgICAqKi9cbiAgICBnZXRTZWxlY3Rpb25MZWFkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sZWFkLmdldFBvc2l0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTaGlmdHMgdGhlIHNlbGVjdGlvbiB1cCAob3IgZG93biwgaWYgW1tTZWxlY3Rpb24uaXNCYWNrd2FyZHMgYGlzQmFja3dhcmRzKClgXV0gaXMgdHJ1ZSkgdGhlIGdpdmVuIG51bWJlciBvZiBjb2x1bW5zLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbnMgVGhlIG51bWJlciBvZiBjb2x1bW5zIHRvIHNoaWZ0IGJ5XG4gICAgKlxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgc2hpZnRTZWxlY3Rpb24oY29sdW1ucykge1xuICAgICAgICBpZiAodGhpcy4kaXNFbXB0eSkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8odGhpcy5sZWFkLnJvdywgdGhpcy5sZWFkLmNvbHVtbiArIGNvbHVtbnMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGFuY2hvciA9IHRoaXMuZ2V0U2VsZWN0aW9uQW5jaG9yKCk7XG4gICAgICAgIHZhciBsZWFkID0gdGhpcy5nZXRTZWxlY3Rpb25MZWFkKCk7XG5cbiAgICAgICAgdmFyIGlzQmFja3dhcmRzID0gdGhpcy5pc0JhY2t3YXJkcygpO1xuXG4gICAgICAgIGlmICghaXNCYWNrd2FyZHMgfHwgYW5jaG9yLmNvbHVtbiAhPT0gMClcbiAgICAgICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uQW5jaG9yKGFuY2hvci5yb3csIGFuY2hvci5jb2x1bW4gKyBjb2x1bW5zKTtcblxuICAgICAgICBpZiAoaXNCYWNrd2FyZHMgfHwgbGVhZC5jb2x1bW4gIT09IDApIHtcbiAgICAgICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8obGVhZC5yb3csIGxlYWQuY29sdW1uICsgY29sdW1ucyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHNlbGVjdGlvbiBpcyBnb2luZyBiYWNrd2FyZHMgaW4gdGhlIGRvY3VtZW50LlxuICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgKiovXG4gICAgaXNCYWNrd2FyZHMoKSB7XG4gICAgICAgIHZhciBhbmNob3IgPSB0aGlzLmFuY2hvcjtcbiAgICAgICAgdmFyIGxlYWQgPSB0aGlzLmxlYWQ7XG4gICAgICAgIHJldHVybiAoYW5jaG9yLnJvdyA+IGxlYWQucm93IHx8IChhbmNob3Iucm93ID09IGxlYWQucm93ICYmIGFuY2hvci5jb2x1bW4gPiBsZWFkLmNvbHVtbikpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogW1JldHVybnMgdGhlIFtbUmFuZ2VdXSBmb3IgdGhlIHNlbGVjdGVkIHRleHQuXXs6ICNTZWxlY3Rpb24uZ2V0UmFuZ2V9XG4gICAgKiBAcmV0dXJucyB7UmFuZ2V9XG4gICAgKiovXG4gICAgZ2V0UmFuZ2UoKSB7XG4gICAgICAgIHZhciBhbmNob3IgPSB0aGlzLmFuY2hvcjtcbiAgICAgICAgdmFyIGxlYWQgPSB0aGlzLmxlYWQ7XG5cbiAgICAgICAgaWYgKHRoaXMuaXNFbXB0eSgpKVxuICAgICAgICAgICAgcmV0dXJuIHJuZy5SYW5nZS5mcm9tUG9pbnRzKGxlYWQsIGxlYWQpO1xuXG4gICAgICAgIGlmICh0aGlzLmlzQmFja3dhcmRzKCkpIHtcbiAgICAgICAgICAgIHJldHVybiBybmcuUmFuZ2UuZnJvbVBvaW50cyhsZWFkLCBhbmNob3IpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHJuZy5SYW5nZS5mcm9tUG9pbnRzKGFuY2hvciwgbGVhZCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFtFbXB0aWVzIHRoZSBzZWxlY3Rpb24gKGJ5IGRlLXNlbGVjdGluZyBpdCkuIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VTZWxlY3Rpb24nYCBldmVudC5dezogI1NlbGVjdGlvbi5jbGVhclNlbGVjdGlvbn1cbiAgICAqKi9cbiAgICBjbGVhclNlbGVjdGlvbigpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRpc0VtcHR5KSB7XG4gICAgICAgICAgICB0aGlzLiRpc0VtcHR5ID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VTZWxlY3Rpb25cIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNlbGVjdHMgYWxsIHRoZSB0ZXh0IGluIHRoZSBkb2N1bWVudC5cbiAgICAqKi9cbiAgICBzZWxlY3RBbGwoKSB7XG4gICAgICAgIHZhciBsYXN0Um93ID0gdGhpcy5kb2MuZ2V0TGVuZ3RoKCkgLSAxO1xuICAgICAgICB0aGlzLnNldFNlbGVjdGlvbkFuY2hvcigwLCAwKTtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8obGFzdFJvdywgdGhpcy5kb2MuZ2V0TGluZShsYXN0Um93KS5sZW5ndGgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBwcm92aWRlZCByYW5nZS5cbiAgICAqIEBwYXJhbSB7UmFuZ2V9IHJhbmdlIFRoZSByYW5nZSBvZiB0ZXh0IHRvIHNlbGVjdFxuICAgICogQHBhcmFtIHtCb29sZWFufSByZXZlcnNlIEluZGljYXRlcyBpZiB0aGUgcmFuZ2Ugc2hvdWxkIGdvIGJhY2t3YXJkcyAoYHRydWVgKSBvciBub3RcbiAgICAqXG4gICAgKlxuICAgICogQG1ldGhvZCBzZXRTZWxlY3Rpb25SYW5nZVxuICAgICogQGFsaWFzIHNldFJhbmdlXG4gICAgKiovXG4gICAgc2V0UmFuZ2UocmFuZ2UsIHJldmVyc2U/OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2UsIHJldmVyc2UpO1xuICAgIH1cbiAgICBzZXRTZWxlY3Rpb25SYW5nZShyYW5nZTogeyBzdGFydDogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTsgZW5kOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IH0sIHJldmVyc2U/OiBib29sZWFuKSB7XG4gICAgICAgIGlmIChyZXZlcnNlKSB7XG4gICAgICAgICAgICB0aGlzLnNldFNlbGVjdGlvbkFuY2hvcihyYW5nZS5lbmQucm93LCByYW5nZS5lbmQuY29sdW1uKTtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0VG8ocmFuZ2Uuc3RhcnQucm93LCByYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25BbmNob3IocmFuZ2Uuc3RhcnQucm93LCByYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RUbyhyYW5nZS5lbmQucm93LCByYW5nZS5lbmQuY29sdW1uKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5nZXRSYW5nZSgpLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuJGlzRW1wdHkgPSB0cnVlO1xuICAgICAgICB0aGlzLiRkZXNpcmVkQ29sdW1uID0gbnVsbDtcbiAgICB9XG5cbiAgICAkbW92ZVNlbGVjdGlvbihtb3Zlcikge1xuICAgICAgICB2YXIgbGVhZCA9IHRoaXMubGVhZDtcbiAgICAgICAgaWYgKHRoaXMuJGlzRW1wdHkpXG4gICAgICAgICAgICB0aGlzLnNldFNlbGVjdGlvbkFuY2hvcihsZWFkLnJvdywgbGVhZC5jb2x1bW4pO1xuXG4gICAgICAgIG1vdmVyLmNhbGwodGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIGN1cnNvciB0byB0aGUgaW5kaWNhdGVkIHJvdyBhbmQgY29sdW1uLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIHNlbGVjdCB0b1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIHRvIHNlbGVjdCB0b1xuICAgICpcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHNlbGVjdFRvKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gY3Vyc29yIHRvIHRoZSByb3cgYW5kIGNvbHVtbiBpbmRpY2F0ZWQgYnkgYHBvc2AuXG4gICAgKiBAcGFyYW0ge09iamVjdH0gcG9zIEFuIG9iamVjdCBjb250YWluaW5nIHRoZSByb3cgYW5kIGNvbHVtblxuICAgICpcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHNlbGVjdFRvUG9zaXRpb24ocG9zKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKHBvcyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiBjdXJzb3IgdG8gdGhlIGluZGljYXRlZCByb3cgYW5kIGNvbHVtbi5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBzZWxlY3QgdG9cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGNvbHVtbiB0byBzZWxlY3QgdG9cbiAgICAqXG4gICAgKiovXG4gICAgbW92ZVRvKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gY3Vyc29yIHRvIHRoZSByb3cgYW5kIGNvbHVtbiBpbmRpY2F0ZWQgYnkgYHBvc2AuXG4gICAgKiBAcGFyYW0ge09iamVjdH0gcG9zIEFuIG9iamVjdCBjb250YWluaW5nIHRoZSByb3cgYW5kIGNvbHVtblxuICAgICoqL1xuICAgIG1vdmVUb1Bvc2l0aW9uKHBvcykge1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24ocG9zKTtcbiAgICB9XG5cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdXAgb25lIHJvdy5cbiAgICAqKi9cbiAgICBzZWxlY3RVcCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JVcCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiBkb3duIG9uZSByb3cuXG4gICAgKiovXG4gICAgc2VsZWN0RG93bigpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JEb3duKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiByaWdodCBvbmUgY29sdW1uLlxuICAgICoqL1xuICAgIHNlbGVjdFJpZ2h0KCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvclJpZ2h0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIGxlZnQgb25lIGNvbHVtbi5cbiAgICAqKi9cbiAgICBzZWxlY3RMZWZ0KCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvckxlZnQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIGJlZ2lubmluZyBvZiB0aGUgY3VycmVudCBsaW5lLlxuICAgICoqL1xuICAgIHNlbGVjdExpbmVTdGFydCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JMaW5lU3RhcnQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBzZWxlY3Rpb24gdG8gdGhlIGVuZCBvZiB0aGUgY3VycmVudCBsaW5lLlxuICAgICoqL1xuICAgIHNlbGVjdExpbmVFbmQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yTGluZUVuZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB0byB0aGUgZW5kIG9mIHRoZSBmaWxlLlxuICAgICoqL1xuICAgIHNlbGVjdEZpbGVFbmQoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVTZWxlY3Rpb24odGhpcy5tb3ZlQ3Vyc29yRmlsZUVuZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB0byB0aGUgc3RhcnQgb2YgdGhlIGZpbGUuXG4gICAgKiovXG4gICAgc2VsZWN0RmlsZVN0YXJ0KCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvckZpbGVTdGFydCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB0byB0aGUgZmlyc3Qgd29yZCBvbiB0aGUgcmlnaHQuXG4gICAgKiovXG4gICAgc2VsZWN0V29yZFJpZ2h0KCkge1xuICAgICAgICB0aGlzLiRtb3ZlU2VsZWN0aW9uKHRoaXMubW92ZUN1cnNvcldvcmRSaWdodCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIHNlbGVjdGlvbiB0byB0aGUgZmlyc3Qgd29yZCBvbiB0aGUgbGVmdC5cbiAgICAqKi9cbiAgICBzZWxlY3RXb3JkTGVmdCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZVNlbGVjdGlvbih0aGlzLm1vdmVDdXJzb3JXb3JkTGVmdCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIGhpZ2hsaWdodCB0aGUgZW50aXJlIHdvcmQuXG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRXb3JkUmFuZ2VcbiAgICAqKi9cbiAgICBnZXRXb3JkUmFuZ2Uocm93PywgY29sdW1uPykge1xuICAgICAgICBpZiAodHlwZW9mIGNvbHVtbiA9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICB2YXIgY3Vyc29yID0gcm93IHx8IHRoaXMubGVhZDtcbiAgICAgICAgICAgIHJvdyA9IGN1cnNvci5yb3c7XG4gICAgICAgICAgICBjb2x1bW4gPSBjdXJzb3IuY29sdW1uO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0V29yZFJhbmdlKHJvdywgY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBTZWxlY3RzIGFuIGVudGlyZSB3b3JkIGJvdW5kYXJ5LlxuICAgICoqL1xuICAgIHNlbGVjdFdvcmQoKSB7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uUmFuZ2UodGhpcy5nZXRXb3JkUmFuZ2UoKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZWxlY3RzIGEgd29yZCwgaW5jbHVkaW5nIGl0cyByaWdodCB3aGl0ZXNwYWNlLlxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZ2V0QVdvcmRSYW5nZVxuICAgICoqL1xuICAgIHNlbGVjdEFXb3JkKCkge1xuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5nZXRDdXJzb3IoKTtcbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5zZXNzaW9uLmdldEFXb3JkUmFuZ2UoY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbik7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2UpO1xuICAgIH1cblxuICAgIGdldExpbmVSYW5nZShyb3c/OiBudW1iZXIsIGV4Y2x1ZGVMYXN0Q2hhcj86IGJvb2xlYW4pOiBybmcuUmFuZ2Uge1xuICAgICAgICB2YXIgcm93U3RhcnQgPSB0eXBlb2Ygcm93ID09IFwibnVtYmVyXCIgPyByb3cgOiB0aGlzLmxlYWQucm93O1xuICAgICAgICB2YXIgcm93RW5kO1xuXG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkTGluZShyb3dTdGFydCk7XG4gICAgICAgIGlmIChmb2xkTGluZSkge1xuICAgICAgICAgICAgcm93U3RhcnQgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgICAgICByb3dFbmQgPSBmb2xkTGluZS5lbmQucm93O1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcm93RW5kID0gcm93U3RhcnQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZXhjbHVkZUxhc3RDaGFyKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IHJuZy5SYW5nZShyb3dTdGFydCwgMCwgcm93RW5kLCB0aGlzLnNlc3Npb24uZ2V0TGluZShyb3dFbmQpLmxlbmd0aCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IHJuZy5SYW5nZShyb3dTdGFydCwgMCwgcm93RW5kICsgMSwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNlbGVjdHMgdGhlIGVudGlyZSBsaW5lLlxuICAgICoqL1xuICAgIHNlbGVjdExpbmUoKSB7XG4gICAgICAgIHRoaXMuc2V0U2VsZWN0aW9uUmFuZ2UodGhpcy5nZXRMaW5lUmFuZ2UoKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB1cCBvbmUgcm93LlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JVcCgpIHtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yQnkoLTEsIDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgZG93biBvbmUgcm93LlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JEb3duKCkge1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeSgxLCAwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIGxlZnQgb25lIGNvbHVtbi5cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yTGVmdCgpIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMubGVhZC5nZXRQb3NpdGlvbigpLFxuICAgICAgICAgICAgZm9sZDtcblxuICAgICAgICBpZiAoZm9sZCA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkQXQoY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbiwgLTEpKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhmb2xkLnN0YXJ0LnJvdywgZm9sZC5zdGFydC5jb2x1bW4pO1xuICAgICAgICB9IGVsc2UgaWYgKGN1cnNvci5jb2x1bW4gPT09IDApIHtcbiAgICAgICAgICAgIC8vIGN1cnNvciBpcyBhIGxpbmUgKHN0YXJ0XG4gICAgICAgICAgICBpZiAoY3Vyc29yLnJvdyA+IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhjdXJzb3Iucm93IC0gMSwgdGhpcy5kb2MuZ2V0TGluZShjdXJzb3Iucm93IC0gMSkubGVuZ3RoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciB0YWJTaXplID0gdGhpcy5zZXNzaW9uLmdldFRhYlNpemUoKTtcbiAgICAgICAgICAgIGlmICh0aGlzLnNlc3Npb24uaXNUYWJTdG9wKGN1cnNvcikgJiYgdGhpcy5kb2MuZ2V0TGluZShjdXJzb3Iucm93KS5zbGljZShjdXJzb3IuY29sdW1uIC0gdGFiU2l6ZSwgY3Vyc29yLmNvbHVtbikuc3BsaXQoXCIgXCIpLmxlbmd0aCAtIDEgPT0gdGFiU2l6ZSlcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeSgwLCAtdGFiU2l6ZSk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yQnkoMCwgLTEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciByaWdodCBvbmUgY29sdW1uLlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JSaWdodCgpIHtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMubGVhZC5nZXRQb3NpdGlvbigpO1xuICAgICAgICB2YXIgZm9sZCA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkQXQocG9zLnJvdywgcG9zLmNvbHVtbiwgMSk7XG4gICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhmb2xkLmVuZC5yb3csIGZvbGQuZW5kLmNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5sZWFkLmNvbHVtbiA9PSB0aGlzLmRvYy5nZXRMaW5lKHRoaXMubGVhZC5yb3cpLmxlbmd0aCkge1xuICAgICAgICAgICAgaWYgKHRoaXMubGVhZC5yb3cgPCB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDEpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyh0aGlzLmxlYWQucm93ICsgMSwgMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgdGFiU2l6ZSA9IHRoaXMuc2Vzc2lvbi5nZXRUYWJTaXplKCk7XG4gICAgICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5sZWFkO1xuICAgICAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi5pc1RhYlN0b3AoY3Vyc29yKSAmJiB0aGlzLmRvYy5nZXRMaW5lKGN1cnNvci5yb3cpLnNsaWNlKGN1cnNvci5jb2x1bW4sIGN1cnNvci5jb2x1bW4gKyB0YWJTaXplKS5zcGxpdChcIiBcIikubGVuZ3RoIC0gMSA9PSB0YWJTaXplKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yQnkoMCwgdGFiU2l6ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeSgwLCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHN0YXJ0IG9mIHRoZSBsaW5lLlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JMaW5lU3RhcnQoKSB7XG4gICAgICAgIHZhciByb3cgPSB0aGlzLmxlYWQucm93O1xuICAgICAgICB2YXIgY29sdW1uID0gdGhpcy5sZWFkLmNvbHVtbjtcbiAgICAgICAgdmFyIHNjcmVlblJvdyA9IHRoaXMuc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUm93KHJvdywgY29sdW1uKTtcblxuICAgICAgICAvLyBEZXRlcm0gdGhlIGRvYy1wb3NpdGlvbiBvZiB0aGUgZmlyc3QgY2hhcmFjdGVyIGF0IHRoZSBzY3JlZW4gbGluZS5cbiAgICAgICAgdmFyIGZpcnN0Q29sdW1uUG9zaXRpb24gPSB0aGlzLnNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgMCk7XG5cbiAgICAgICAgLy8gRGV0ZXJtIHRoZSBsaW5lXG4gICAgICAgIC8vIEhvdyBkb2VzIGdldERpc3BsYXlMaW5lIGdldCBmcm9tIGZvbGRpbmcgb250byBzZXNzaW9uP1xuICAgICAgICB2YXIgYmVmb3JlQ3Vyc29yID0gdGhpcy5zZXNzaW9uWydnZXREaXNwbGF5TGluZSddKFxuICAgICAgICAgICAgcm93LCBudWxsLCBmaXJzdENvbHVtblBvc2l0aW9uLnJvdyxcbiAgICAgICAgICAgIGZpcnN0Q29sdW1uUG9zaXRpb24uY29sdW1uXG4gICAgICAgICk7XG5cbiAgICAgICAgdmFyIGxlYWRpbmdTcGFjZSA9IGJlZm9yZUN1cnNvci5tYXRjaCgvXlxccyovKTtcbiAgICAgICAgLy8gVE9ETyBmaW5kIGJldHRlciB3YXkgZm9yIGVtYWNzIG1vZGUgdG8gb3ZlcnJpZGUgc2VsZWN0aW9uIGJlaGF2aW9yc1xuICAgICAgICBpZiAobGVhZGluZ1NwYWNlWzBdLmxlbmd0aCAhPSBjb2x1bW4gJiYgIXRoaXMuc2Vzc2lvblsnJHVzZUVtYWNzU3R5bGVMaW5lU3RhcnQnXSlcbiAgICAgICAgICAgIGZpcnN0Q29sdW1uUG9zaXRpb24uY29sdW1uICs9IGxlYWRpbmdTcGFjZVswXS5sZW5ndGg7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oZmlyc3RDb2x1bW5Qb3NpdGlvbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgZW5kIG9mIHRoZSBsaW5lLlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JMaW5lRW5kKCkge1xuICAgICAgICB2YXIgbGVhZCA9IHRoaXMubGVhZDtcbiAgICAgICAgdmFyIGxpbmVFbmQgPSB0aGlzLnNlc3Npb24uZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uUG9zaXRpb24obGVhZC5yb3csIGxlYWQuY29sdW1uKTtcbiAgICAgICAgaWYgKHRoaXMubGVhZC5jb2x1bW4gPT0gbGluZUVuZC5jb2x1bW4pIHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gdGhpcy5zZXNzaW9uLmdldExpbmUobGluZUVuZC5yb3cpO1xuICAgICAgICAgICAgaWYgKGxpbmVFbmQuY29sdW1uID09IGxpbmUubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdmFyIHRleHRFbmQgPSBsaW5lLnNlYXJjaCgvXFxzKyQvKTtcbiAgICAgICAgICAgICAgICBpZiAodGV4dEVuZCA+IDApXG4gICAgICAgICAgICAgICAgICAgIGxpbmVFbmQuY29sdW1uID0gdGV4dEVuZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGxpbmVFbmQucm93LCBsaW5lRW5kLmNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgZW5kIG9mIHRoZSBmaWxlLlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JGaWxlRW5kKCkge1xuICAgICAgICB2YXIgcm93ID0gdGhpcy5kb2MuZ2V0TGVuZ3RoKCkgLSAxO1xuICAgICAgICB2YXIgY29sdW1uID0gdGhpcy5kb2MuZ2V0TGluZShyb3cpLmxlbmd0aDtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHN0YXJ0IG9mIHRoZSBmaWxlLlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JGaWxlU3RhcnQoKSB7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKDAsIDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHdvcmQgb24gdGhlIHJpZ2h0LlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JMb25nV29yZFJpZ2h0KCkge1xuICAgICAgICB2YXIgcm93ID0gdGhpcy5sZWFkLnJvdztcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMubGVhZC5jb2x1bW47XG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5kb2MuZ2V0TGluZShyb3cpO1xuICAgICAgICB2YXIgcmlnaHRPZkN1cnNvciA9IGxpbmUuc3Vic3RyaW5nKGNvbHVtbik7XG5cbiAgICAgICAgdmFyIG1hdGNoO1xuICAgICAgICB0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICB0aGlzLnNlc3Npb24udG9rZW5SZS5sYXN0SW5kZXggPSAwO1xuXG4gICAgICAgIC8vIHNraXAgZm9sZHNcbiAgICAgICAgdmFyIGZvbGQgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZEF0KHJvdywgY29sdW1uLCAxKTtcbiAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGZvbGQuZW5kLnJvdywgZm9sZC5lbmQuY29sdW1uKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGZpcnN0IHNraXAgc3BhY2VcbiAgICAgICAgaWYgKG1hdGNoID0gdGhpcy5zZXNzaW9uLm5vblRva2VuUmUuZXhlYyhyaWdodE9mQ3Vyc29yKSkge1xuICAgICAgICAgICAgY29sdW1uICs9IHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmxhc3RJbmRleDtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgICAgICByaWdodE9mQ3Vyc29yID0gbGluZS5zdWJzdHJpbmcoY29sdW1uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGlmIGF0IGxpbmUgZW5kIHByb2NlZWQgd2l0aCBuZXh0IGxpbmVcbiAgICAgICAgaWYgKGNvbHVtbiA+PSBsaW5lLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBsaW5lLmxlbmd0aCk7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JSaWdodCgpO1xuICAgICAgICAgICAgaWYgKHJvdyA8IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSlcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JXb3JkUmlnaHQoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGFkdmFuY2UgdG8gdGhlIGVuZCBvZiB0aGUgbmV4dCB0b2tlblxuICAgICAgICBpZiAobWF0Y2ggPSB0aGlzLnNlc3Npb24udG9rZW5SZS5leGVjKHJpZ2h0T2ZDdXJzb3IpKSB7XG4gICAgICAgICAgICBjb2x1bW4gKz0gdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4O1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSB3b3JkIG9uIHRoZSBsZWZ0LlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JMb25nV29yZExlZnQoKSB7XG4gICAgICAgIHZhciByb3cgPSB0aGlzLmxlYWQucm93O1xuICAgICAgICB2YXIgY29sdW1uID0gdGhpcy5sZWFkLmNvbHVtbjtcblxuICAgICAgICAvLyBza2lwIGZvbGRzXG4gICAgICAgIHZhciBmb2xkO1xuICAgICAgICBpZiAoZm9sZCA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkQXQocm93LCBjb2x1bW4sIC0xKSkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8oZm9sZC5zdGFydC5yb3csIGZvbGQuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEhvdyBkb2VzIHRoaXMgZ2V0IGZyb20gdGhlIGZvbGRpbmcgYWRhcHRlciBvbnRvIHRoZSBzZXNzaW9uP1xuICAgICAgICB2YXIgc3RyID0gdGhpcy5zZXNzaW9uWydnZXRGb2xkU3RyaW5nQXQnXShyb3csIGNvbHVtbiwgLTEpO1xuICAgICAgICBpZiAoc3RyID09IG51bGwpIHtcbiAgICAgICAgICAgIHN0ciA9IHRoaXMuZG9jLmdldExpbmUocm93KS5zdWJzdHJpbmcoMCwgY29sdW1uKVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxlZnRPZkN1cnNvciA9IGxhbmcuc3RyaW5nUmV2ZXJzZShzdHIpO1xuICAgICAgICB2YXIgbWF0Y2g7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi50b2tlblJlLmxhc3RJbmRleCA9IDA7XG5cbiAgICAgICAgLy8gc2tpcCB3aGl0ZXNwYWNlXG4gICAgICAgIGlmIChtYXRjaCA9IHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmV4ZWMobGVmdE9mQ3Vyc29yKSkge1xuICAgICAgICAgICAgY29sdW1uIC09IHRoaXMuc2Vzc2lvbi5ub25Ub2tlblJlLmxhc3RJbmRleDtcbiAgICAgICAgICAgIGxlZnRPZkN1cnNvciA9IGxlZnRPZkN1cnNvci5zbGljZSh0aGlzLnNlc3Npb24ubm9uVG9rZW5SZS5sYXN0SW5kZXgpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm5vblRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGlmIGF0IGJlZ2luIG9mIHRoZSBsaW5lIHByb2NlZWQgaW4gbGluZSBhYm92ZVxuICAgICAgICBpZiAoY29sdW1uIDw9IDApIHtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgMCk7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JMZWZ0KCk7XG4gICAgICAgICAgICBpZiAocm93ID4gMClcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JXb3JkTGVmdCgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gbW92ZSB0byB0aGUgYmVnaW4gb2YgdGhlIHdvcmRcbiAgICAgICAgaWYgKG1hdGNoID0gdGhpcy5zZXNzaW9uLnRva2VuUmUuZXhlYyhsZWZ0T2ZDdXJzb3IpKSB7XG4gICAgICAgICAgICBjb2x1bW4gLT0gdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4O1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgY29sdW1uKTtcbiAgICB9XG5cbiAgICAkc2hvcnRXb3JkRW5kSW5kZXgocmlnaHRPZkN1cnNvcikge1xuICAgICAgICB2YXIgbWF0Y2gsIGluZGV4ID0gMCwgY2g7XG4gICAgICAgIHZhciB3aGl0ZXNwYWNlUmUgPSAvXFxzLztcbiAgICAgICAgdmFyIHRva2VuUmUgPSB0aGlzLnNlc3Npb24udG9rZW5SZTtcblxuICAgICAgICB0b2tlblJlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgIGlmIChtYXRjaCA9IHRoaXMuc2Vzc2lvbi50b2tlblJlLmV4ZWMocmlnaHRPZkN1cnNvcikpIHtcbiAgICAgICAgICAgIGluZGV4ID0gdGhpcy5zZXNzaW9uLnRva2VuUmUubGFzdEluZGV4O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgd2hpbGUgKChjaCA9IHJpZ2h0T2ZDdXJzb3JbaW5kZXhdKSAmJiB3aGl0ZXNwYWNlUmUudGVzdChjaCkpXG4gICAgICAgICAgICAgICAgaW5kZXgrKztcblxuICAgICAgICAgICAgaWYgKGluZGV4IDwgMSkge1xuICAgICAgICAgICAgICAgIHRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICB3aGlsZSAoKGNoID0gcmlnaHRPZkN1cnNvcltpbmRleF0pICYmICF0b2tlblJlLnRlc3QoY2gpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuUmUubGFzdEluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXgrKztcbiAgICAgICAgICAgICAgICAgICAgaWYgKHdoaXRlc3BhY2VSZS50ZXN0KGNoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4ID4gMikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluZGV4LS1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2hpbGUgKChjaCA9IHJpZ2h0T2ZDdXJzb3JbaW5kZXhdKSAmJiB3aGl0ZXNwYWNlUmUudGVzdChjaCkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluZGV4Kys7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4ID4gMilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0b2tlblJlLmxhc3RJbmRleCA9IDA7XG5cbiAgICAgICAgcmV0dXJuIGluZGV4O1xuICAgIH1cblxuICAgIG1vdmVDdXJzb3JTaG9ydFdvcmRSaWdodCgpIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMubGVhZC5yb3c7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLmxlYWQuY29sdW1uO1xuICAgICAgICB2YXIgbGluZSA9IHRoaXMuZG9jLmdldExpbmUocm93KTtcbiAgICAgICAgdmFyIHJpZ2h0T2ZDdXJzb3IgPSBsaW5lLnN1YnN0cmluZyhjb2x1bW4pO1xuXG4gICAgICAgIHZhciBmb2xkID0gdGhpcy5zZXNzaW9uLmdldEZvbGRBdChyb3csIGNvbHVtbiwgMSk7XG4gICAgICAgIGlmIChmb2xkKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMubW92ZUN1cnNvclRvKGZvbGQuZW5kLnJvdywgZm9sZC5lbmQuY29sdW1uKTtcblxuICAgICAgICBpZiAoY29sdW1uID09IGxpbmUubGVuZ3RoKSB7XG4gICAgICAgICAgICB2YXIgbCA9IHRoaXMuZG9jLmdldExlbmd0aCgpO1xuICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgIHJvdysrO1xuICAgICAgICAgICAgICAgIHJpZ2h0T2ZDdXJzb3IgPSB0aGlzLmRvYy5nZXRMaW5lKHJvdylcbiAgICAgICAgICAgIH0gd2hpbGUgKHJvdyA8IGwgJiYgL15cXHMqJC8udGVzdChyaWdodE9mQ3Vyc29yKSlcblxuICAgICAgICAgICAgaWYgKCEvXlxccysvLnRlc3QocmlnaHRPZkN1cnNvcikpXG4gICAgICAgICAgICAgICAgcmlnaHRPZkN1cnNvciA9IFwiXCJcbiAgICAgICAgICAgIGNvbHVtbiA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaW5kZXggPSB0aGlzLiRzaG9ydFdvcmRFbmRJbmRleChyaWdodE9mQ3Vyc29yKTtcblxuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbiArIGluZGV4KTtcbiAgICB9XG5cbiAgICBtb3ZlQ3Vyc29yU2hvcnRXb3JkTGVmdCgpIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMubGVhZC5yb3c7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLmxlYWQuY29sdW1uO1xuXG4gICAgICAgIHZhciBmb2xkO1xuICAgICAgICBpZiAoZm9sZCA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkQXQocm93LCBjb2x1bW4sIC0xKSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm1vdmVDdXJzb3JUbyhmb2xkLnN0YXJ0LnJvdywgZm9sZC5zdGFydC5jb2x1bW4pO1xuXG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5zZXNzaW9uLmdldExpbmUocm93KS5zdWJzdHJpbmcoMCwgY29sdW1uKTtcbiAgICAgICAgaWYgKGNvbHVtbiA9PSAwKSB7XG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgcm93LS07XG4gICAgICAgICAgICAgICAgbGluZSA9IHRoaXMuZG9jLmdldExpbmUocm93KTtcbiAgICAgICAgICAgIH0gd2hpbGUgKHJvdyA+IDAgJiYgL15cXHMqJC8udGVzdChsaW5lKSlcblxuICAgICAgICAgICAgY29sdW1uID0gbGluZS5sZW5ndGg7XG4gICAgICAgICAgICBpZiAoIS9cXHMrJC8udGVzdChsaW5lKSlcbiAgICAgICAgICAgICAgICBsaW5lID0gXCJcIlxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxlZnRPZkN1cnNvciA9IGxhbmcuc3RyaW5nUmV2ZXJzZShsaW5lKTtcbiAgICAgICAgdmFyIGluZGV4ID0gdGhpcy4kc2hvcnRXb3JkRW5kSW5kZXgobGVmdE9mQ3Vyc29yKTtcblxuICAgICAgICByZXR1cm4gdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4gLSBpbmRleCk7XG4gICAgfVxuXG4gICAgbW92ZUN1cnNvcldvcmRSaWdodCgpIHtcbiAgICAgICAgLy8gU2VlIGtleWJvYXJkL2VtYWNzLmpzXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb25bJyRzZWxlY3RMb25nV29yZHMnXSkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yTG9uZ1dvcmRSaWdodCgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yU2hvcnRXb3JkUmlnaHQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIG1vdmVDdXJzb3JXb3JkTGVmdCgpIHtcbiAgICAgICAgLy8gU2VlIGtleWJvYXJkL2VtYWNzLmpzXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb25bJyRzZWxlY3RMb25nV29yZHMnXSkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yTG9uZ1dvcmRMZWZ0KCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JTaG9ydFdvcmRMZWZ0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gcG9zaXRpb24gaW5kaWNhdGVkIGJ5IHRoZSBwYXJhbWV0ZXJzLiBOZWdhdGl2ZSBudW1iZXJzIG1vdmUgdGhlIGN1cnNvciBiYWNrd2FyZHMgaW4gdGhlIGRvY3VtZW50LlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvd3MgVGhlIG51bWJlciBvZiByb3dzIHRvIG1vdmUgYnlcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjaGFycyBUaGUgbnVtYmVyIG9mIGNoYXJhY3RlcnMgdG8gbW92ZSBieVxuICAgICpcbiAgICAqXG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb25cbiAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yQnkocm93cywgY2hhcnMpIHtcbiAgICAgICAgdmFyIHNjcmVlblBvcyA9IHRoaXMuc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oXG4gICAgICAgICAgICB0aGlzLmxlYWQucm93LFxuICAgICAgICAgICAgdGhpcy5sZWFkLmNvbHVtblxuICAgICAgICApO1xuXG4gICAgICAgIGlmIChjaGFycyA9PT0gMCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJGRlc2lyZWRDb2x1bW4pXG4gICAgICAgICAgICAgICAgc2NyZWVuUG9zLmNvbHVtbiA9IHRoaXMuJGRlc2lyZWRDb2x1bW47XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy4kZGVzaXJlZENvbHVtbiA9IHNjcmVlblBvcy5jb2x1bW47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZG9jUG9zID0gdGhpcy5zZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Qb3Mucm93ICsgcm93cywgc2NyZWVuUG9zLmNvbHVtbik7XG5cbiAgICAgICAgaWYgKHJvd3MgIT09IDAgJiYgY2hhcnMgPT09IDAgJiYgZG9jUG9zLnJvdyA9PT0gdGhpcy5sZWFkLnJvdyAmJiBkb2NQb3MuY29sdW1uID09PSB0aGlzLmxlYWQuY29sdW1uKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmxpbmVXaWRnZXRzICYmIHRoaXMuc2Vzc2lvbi5saW5lV2lkZ2V0c1tkb2NQb3Mucm93XSlcbiAgICAgICAgICAgICAgICBkb2NQb3Mucm93Kys7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBtb3ZlIHRoZSBjdXJzb3IgYW5kIHVwZGF0ZSB0aGUgZGVzaXJlZCBjb2x1bW5cbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8oZG9jUG9zLnJvdywgZG9jUG9zLmNvbHVtbiArIGNoYXJzLCBjaGFycyA9PT0gMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyB0aGUgc2VsZWN0aW9uIHRvIHRoZSBwb3NpdGlvbiBpbmRpY2F0ZWQgYnkgaXRzIGByb3dgIGFuZCBgY29sdW1uYC5cbiAgICAqIEBwYXJhbSB7T2JqZWN0fSBwb3NpdGlvbiBUaGUgcG9zaXRpb24gdG8gbW92ZSB0b1xuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgbW92ZUN1cnNvclRvUG9zaXRpb24ocG9zaXRpb24pIHtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocG9zaXRpb24ucm93LCBwb3NpdGlvbi5jb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgcm93IGFuZCBjb2x1bW4gcHJvdmlkZWQuIFtJZiBgcHJldmVudFVwZGF0ZURlc2lyZWRDb2x1bW5gIGlzIGB0cnVlYCwgdGhlbiB0aGUgY3Vyc29yIHN0YXlzIGluIHRoZSBzYW1lIGNvbHVtbiBwb3NpdGlvbiBhcyBpdHMgb3JpZ2luYWwgcG9pbnQuXXs6ICNwcmV2ZW50VXBkYXRlQm9vbERlc2N9XG4gICAgKiBAcGFyYW0ge251bWJlcn0gcm93IFRoZSByb3cgdG8gbW92ZSB0b1xuICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIHRvIG1vdmUgdG9cbiAgICAqIEBwYXJhbSB7Ym9vbGVhbn0ga2VlcERlc2lyZWRDb2x1bW4gW0lmIGB0cnVlYCwgdGhlIGN1cnNvciBtb3ZlIGRvZXMgbm90IHJlc3BlY3QgdGhlIHByZXZpb3VzIGNvbHVtbl17OiAjcHJldmVudFVwZGF0ZUJvb2x9XG4gICAgKi9cbiAgICBtb3ZlQ3Vyc29yVG8ocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBrZWVwRGVzaXJlZENvbHVtbj86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgLy8gRW5zdXJlIHRoZSByb3cvY29sdW1uIGlzIG5vdCBpbnNpZGUgb2YgYSBmb2xkLlxuICAgICAgICB2YXIgZm9sZCA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkQXQocm93LCBjb2x1bW4sIDEpO1xuICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgcm93ID0gZm9sZC5zdGFydC5yb3c7XG4gICAgICAgICAgICBjb2x1bW4gPSBmb2xkLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJGtlZXBEZXNpcmVkQ29sdW1uT25DaGFuZ2UgPSB0cnVlO1xuICAgICAgICB0aGlzLmxlYWQuc2V0UG9zaXRpb24ocm93LCBjb2x1bW4pO1xuICAgICAgICB0aGlzLiRrZWVwRGVzaXJlZENvbHVtbk9uQ2hhbmdlID0gZmFsc2U7XG5cbiAgICAgICAgaWYgKCFrZWVwRGVzaXJlZENvbHVtbilcbiAgICAgICAgICAgIHRoaXMuJGRlc2lyZWRDb2x1bW4gPSBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc2NyZWVuIHBvc2l0aW9uIGluZGljYXRlZCBieSByb3cgYW5kIGNvbHVtbi4gezpwcmV2ZW50VXBkYXRlQm9vbERlc2N9XG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gbW92ZSB0b1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIHRvIG1vdmUgdG9cbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0ga2VlcERlc2lyZWRDb2x1bW4gezpwcmV2ZW50VXBkYXRlQm9vbH1cbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIG1vdmVDdXJzb3JUb1NjcmVlbihyb3csIGNvbHVtbiwga2VlcERlc2lyZWRDb2x1bW4pIHtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuc2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24ocm93LCBjb2x1bW4pO1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhwb3Mucm93LCBwb3MuY29sdW1uLCBrZWVwRGVzaXJlZENvbHVtbik7XG4gICAgfVxuXG4gICAgLy8gcmVtb3ZlIGxpc3RlbmVycyBmcm9tIGRvY3VtZW50XG4gICAgZGV0YWNoKCkge1xuICAgICAgICB0aGlzLmxlYWQuZGV0YWNoKCk7XG4gICAgICAgIHRoaXMuYW5jaG9yLmRldGFjaCgpO1xuICAgICAgICB0aGlzLnNlc3Npb24gPSB0aGlzLmRvYyA9IG51bGw7XG4gICAgfVxuXG4gICAgZnJvbU9yaWVudGVkUmFuZ2UocmFuZ2UpIHtcbiAgICAgICAgdGhpcy5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSwgcmFuZ2UuY3Vyc29yID09IHJhbmdlLnN0YXJ0KTtcbiAgICAgICAgdGhpcy4kZGVzaXJlZENvbHVtbiA9IHJhbmdlLmRlc2lyZWRDb2x1bW4gfHwgdGhpcy4kZGVzaXJlZENvbHVtbjtcbiAgICB9XG5cbiAgICB0b09yaWVudGVkUmFuZ2UocmFuZ2U/KSB7XG4gICAgICAgIHZhciByID0gdGhpcy5nZXRSYW5nZSgpO1xuICAgICAgICBpZiAocmFuZ2UpIHtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbiA9IHIuc3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQucm93ID0gci5zdGFydC5yb3c7XG4gICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uID0gci5lbmQuY29sdW1uO1xuICAgICAgICAgICAgcmFuZ2UuZW5kLnJvdyA9IHIuZW5kLnJvdztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJhbmdlID0gcjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJhbmdlLmN1cnNvciA9IHRoaXMuaXNCYWNrd2FyZHMoKSA/IHJhbmdlLnN0YXJ0IDogcmFuZ2UuZW5kO1xuICAgICAgICByYW5nZS5kZXNpcmVkQ29sdW1uID0gdGhpcy4kZGVzaXJlZENvbHVtbjtcbiAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2F2ZXMgdGhlIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uIGFuZCBjYWxscyBgZnVuY2AgdGhhdCBjYW4gY2hhbmdlIHRoZSBjdXJzb3JcbiAgICAqIHBvc3Rpb24uIFRoZSByZXN1bHQgaXMgdGhlIHJhbmdlIG9mIHRoZSBzdGFydGluZyBhbmQgZXZlbnR1YWwgY3Vyc29yIHBvc2l0aW9uLlxuICAgICogV2lsbCByZXNldCB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuICAgICogQHBhcmFtIHtGdW5jdGlvbn0gVGhlIGNhbGxiYWNrIHRoYXQgc2hvdWxkIGNoYW5nZSB0aGUgY3Vyc29yIHBvc2l0aW9uXG4gICAgKiBAcmV0dXJucyB7UmFuZ2V9XG4gICAgKlxuICAgICoqL1xuICAgIGdldFJhbmdlT2ZNb3ZlbWVudHMoZnVuYykge1xuICAgICAgICB2YXIgc3RhcnQgPSB0aGlzLmdldEN1cnNvcigpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZnVuYy5jYWxsKG51bGwsIHRoaXMpO1xuICAgICAgICAgICAgdmFyIGVuZCA9IHRoaXMuZ2V0Q3Vyc29yKCk7XG4gICAgICAgICAgICByZXR1cm4gcm5nLlJhbmdlLmZyb21Qb2ludHMoc3RhcnQsIGVuZCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHJldHVybiBybmcuUmFuZ2UuZnJvbVBvaW50cyhzdGFydCwgc3RhcnQpO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihzdGFydCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB0b0pTT04oKSB7XG4gICAgICAgIGlmICh0aGlzLnJhbmdlQ291bnQpIHtcbiAgICAgICAgICAgIHZhciBkYXRhOiBhbnkgPSB0aGlzLnJhbmdlcy5tYXAoZnVuY3Rpb24ocikge1xuICAgICAgICAgICAgICAgIHZhciByMSA9IHIuY2xvbmUoKTtcbiAgICAgICAgICAgICAgICByMS5pc0JhY2t3YXJkcyA9IHIuY3Vyc29yID09IHIuc3RhcnQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHIxO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZGF0YTogYW55ID0gdGhpcy5nZXRSYW5nZSgpO1xuICAgICAgICAgICAgZGF0YS5pc0JhY2t3YXJkcyA9IHRoaXMuaXNCYWNrd2FyZHMoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGF0YTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHRvU2luZ2xlUmFuZ2UoZGF0YSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJTZWxlY3Rpb24udG9TaW5nbGVSYW5nZSBpcyB1bnN1cHBvcnRlZFwiKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYWRkUmFuZ2UoZGF0YSwgc29tZXRoaW5nOiBib29sZWFuKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlNlbGVjdGlvbi5hZGRSYW5nZSBpcyB1bnN1cHBvcnRlZFwiKTtcbiAgICB9XG5cbiAgICBmcm9tSlNPTihkYXRhKSB7XG4gICAgICAgIGlmIChkYXRhLnN0YXJ0ID09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgaWYgKHRoaXMucmFuZ2VMaXN0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b1NpbmdsZVJhbmdlKGRhdGFbMF0pO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSBkYXRhLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcjogYW55ID0gcm5nLlJhbmdlLmZyb21Qb2ludHMoZGF0YVtpXS5zdGFydCwgZGF0YVtpXS5lbmQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZGF0YS5pc0JhY2t3YXJkcylcbiAgICAgICAgICAgICAgICAgICAgICAgIHIuY3Vyc29yID0gci5zdGFydDtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hZGRSYW5nZShyLCB0cnVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgZGF0YSA9IGRhdGFbMF07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMucmFuZ2VMaXN0KVxuICAgICAgICAgICAgdGhpcy50b1NpbmdsZVJhbmdlKGRhdGEpO1xuICAgICAgICB0aGlzLnNldFNlbGVjdGlvblJhbmdlKGRhdGEsIGRhdGEuaXNCYWNrd2FyZHMpO1xuICAgIH1cblxuICAgIGlzRXF1YWwoZGF0YSkge1xuICAgICAgICBpZiAoKGRhdGEubGVuZ3RoIHx8IHRoaXMucmFuZ2VDb3VudCkgJiYgZGF0YS5sZW5ndGggIT0gdGhpcy5yYW5nZUNvdW50KVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAoIWRhdGEubGVuZ3RoIHx8ICF0aGlzLnJhbmdlcylcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldFJhbmdlKCkuaXNFcXVhbChkYXRhKTtcblxuICAgICAgICBmb3IgKHZhciBpID0gdGhpcy5yYW5nZXMubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMucmFuZ2VzW2ldLmlzRXF1YWwoZGF0YVtpXSkpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxufVxuIl19