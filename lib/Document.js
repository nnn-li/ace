"use strict";
import Anchor from './Anchor';
import EventEmitterClass from './lib/event_emitter';
import Range from './Range';
var $split = (function () {
    function foo(text) {
        return text.replace(/\r\n|\r/g, "\n").split("\n");
    }
    function bar(text) {
        return text.split(/\r\n|\r|\n/);
    }
    if ("aaa".split(/a/).length === 0) {
        return foo;
    }
    else {
        return bar;
    }
})();
function $clipPosition(doc, position) {
    var length = doc.getLength();
    if (position.row >= length) {
        position.row = Math.max(0, length - 1);
        position.column = doc.getLine(length - 1).length;
    }
    else if (position.row < 0) {
        position.row = 0;
    }
    return position;
}
export default class Document extends EventEmitterClass {
    constructor(text) {
        super();
        this.$lines = [];
        this.$autoNewLine = "";
        this.$newLineMode = "auto";
        if (text.length === 0) {
            this.$lines = [""];
        }
        else if (Array.isArray(text)) {
            this._insertLines(0, text);
        }
        else {
            this.insert({ row: 0, column: 0 }, text);
        }
    }
    setValue(text) {
        var len = this.getLength();
        this.remove(new Range(0, 0, len, this.getLine(len - 1).length));
        this.insert({ row: 0, column: 0 }, text);
    }
    getValue() {
        return this.getAllLines().join(this.getNewLineCharacter());
    }
    createAnchor(row, column) {
        return new Anchor(this, row, column);
    }
    $detectNewLine(text) {
        var match = text.match(/^.*?(\r\n|\r|\n)/m);
        this.$autoNewLine = match ? match[1] : "\n";
        this._signal("changeNewLineMode");
    }
    getNewLineCharacter() {
        switch (this.$newLineMode) {
            case "windows":
                return "\r\n";
            case "unix":
                return "\n";
            default:
                return this.$autoNewLine || "\n";
        }
    }
    setNewLineMode(newLineMode) {
        if (this.$newLineMode === newLineMode) {
            return;
        }
        this.$newLineMode = newLineMode;
        this._signal("changeNewLineMode");
    }
    getNewLineMode() {
        return this.$newLineMode;
    }
    isNewLine(text) {
        return (text == "\r\n" || text == "\r" || text == "\n");
    }
    getLine(row) {
        return this.$lines[row] || "";
    }
    getLines(firstRow, lastRow) {
        return this.$lines.slice(firstRow, lastRow + 1);
    }
    getAllLines() {
        return this.getLines(0, this.getLength());
    }
    getLength() {
        return this.$lines.length;
    }
    getTextRange(range) {
        if (range.start.row === range.end.row) {
            return this.getLine(range.start.row).substring(range.start.column, range.end.column);
        }
        var lines = this.getLines(range.start.row, range.end.row);
        lines[0] = (lines[0] || "").substring(range.start.column);
        var l = lines.length - 1;
        if (range.end.row - range.start.row == l) {
            lines[l] = lines[l].substring(0, range.end.column);
        }
        return lines.join(this.getNewLineCharacter());
    }
    insert(position, text) {
        if (!text || text.length === 0) {
            return position;
        }
        position = $clipPosition(this, position);
        if (this.getLength() <= 1) {
            this.$detectNewLine(text);
        }
        var lines = $split(text);
        var firstLine = lines.splice(0, 1)[0];
        var lastLine = lines.length == 0 ? null : lines.splice(lines.length - 1, 1)[0];
        position = this.insertInLine(position, firstLine);
        if (lastLine !== null) {
            position = this.insertNewLine(position);
            position = this._insertLines(position.row, lines);
            position = this.insertInLine(position, lastLine || "");
        }
        return position;
    }
    insertLines(row, lines) {
        if (row >= this.getLength())
            return this.insert({ row: row, column: 0 }, "\n" + lines.join("\n"));
        return this._insertLines(Math.max(row, 0), lines);
    }
    _insertLines(row, lines) {
        if (lines.length == 0)
            return { row: row, column: 0 };
        while (lines.length > 0xF000) {
            var end = this._insertLines(row, lines.slice(0, 0xF000));
            lines = lines.slice(0xF000);
            row = end.row;
        }
        var args = [row, 0];
        args.push.apply(args, lines);
        this.$lines.splice.apply(this.$lines, args);
        var range = new Range(row, 0, row + lines.length, 0);
        var delta = {
            action: "insertLines",
            range: range,
            lines: lines
        };
        this._signal("change", { data: delta });
        return range.end;
    }
    insertNewLine(position) {
        position = $clipPosition(this, position);
        var line = this.$lines[position.row] || "";
        this.$lines[position.row] = line.substring(0, position.column);
        this.$lines.splice(position.row + 1, 0, line.substring(position.column, line.length));
        var end = {
            row: position.row + 1,
            column: 0
        };
        var delta = {
            action: "insertText",
            range: Range.fromPoints(position, end),
            text: this.getNewLineCharacter()
        };
        this._signal("change", { data: delta });
        return end;
    }
    insertInLine(position, text) {
        if (text.length == 0)
            return position;
        var line = this.$lines[position.row] || "";
        this.$lines[position.row] = line.substring(0, position.column) + text + line.substring(position.column);
        var end = {
            row: position.row,
            column: position.column + text.length
        };
        var delta = { action: "insertText", range: Range.fromPoints(position, end), text: text };
        this._signal("change", { data: delta });
        return end;
    }
    remove(range) {
        if (!(range instanceof Range)) {
            range = Range.fromPoints(range.start, range.end);
        }
        range.start = $clipPosition(this, range.start);
        range.end = $clipPosition(this, range.end);
        if (range.isEmpty())
            return range.start;
        var firstRow = range.start.row;
        var lastRow = range.end.row;
        if (range.isMultiLine()) {
            var firstFullRow = range.start.column == 0 ? firstRow : firstRow + 1;
            var lastFullRow = lastRow - 1;
            if (range.end.column > 0)
                this.removeInLine(lastRow, 0, range.end.column);
            if (lastFullRow >= firstFullRow)
                this._removeLines(firstFullRow, lastFullRow);
            if (firstFullRow != firstRow) {
                this.removeInLine(firstRow, range.start.column, this.getLine(firstRow).length);
                this.removeNewLine(range.start.row);
            }
        }
        else {
            this.removeInLine(firstRow, range.start.column, range.end.column);
        }
        return range.start;
    }
    removeInLine(row, startColumn, endColumn) {
        if (startColumn === endColumn)
            return;
        var range = new Range(row, startColumn, row, endColumn);
        var line = this.getLine(row);
        var removed = line.substring(startColumn, endColumn);
        var newLine = line.substring(0, startColumn) + line.substring(endColumn, line.length);
        this.$lines.splice(row, 1, newLine);
        var delta = {
            action: "removeText",
            range: range,
            text: removed
        };
        this._signal("change", { data: delta });
        return range.start;
    }
    removeLines(firstRow, lastRow) {
        if (firstRow < 0 || lastRow >= this.getLength()) {
            throw new Error("Document.removeLines");
        }
        return this._removeLines(firstRow, lastRow);
    }
    _removeLines(firstRow, lastRow) {
        var range = new Range(firstRow, 0, lastRow + 1, 0);
        var removed = this.$lines.splice(firstRow, lastRow - firstRow + 1);
        var delta = {
            action: "removeLines",
            range: range,
            nl: this.getNewLineCharacter(),
            lines: removed
        };
        this._signal("change", { data: delta });
        return removed;
    }
    removeNewLine(row) {
        var firstLine = this.getLine(row);
        var secondLine = this.getLine(row + 1);
        var range = new Range(row, firstLine.length, row + 1, 0);
        var line = firstLine + secondLine;
        this.$lines.splice(row, 2, line);
        var delta = {
            action: "removeText",
            range: range,
            text: this.getNewLineCharacter()
        };
        this._signal("change", { data: delta });
    }
    replace(range, text) {
        if (text.length == 0 && range.isEmpty())
            return range.start;
        if (text == this.getTextRange(range))
            return range.end;
        this.remove(range);
        if (text) {
            var end = this.insert(range.start, text);
        }
        else {
            end = range.start;
        }
        return end;
    }
    applyDeltas(deltas) {
        for (var i = 0; i < deltas.length; i++) {
            var delta = deltas[i];
            var range = Range.fromPoints(delta.range.start, delta.range.end);
            if (delta.action == "insertLines")
                this.insertLines(range.start.row, delta.lines);
            else if (delta.action == "insertText")
                this.insert(range.start, delta.text);
            else if (delta.action == "removeLines")
                this._removeLines(range.start.row, range.end.row - 1);
            else if (delta.action == "removeText")
                this.remove(range);
        }
    }
    revertDeltas(deltas) {
        for (var i = deltas.length - 1; i >= 0; i--) {
            var delta = deltas[i];
            var range = Range.fromPoints(delta.range.start, delta.range.end);
            if (delta.action == "insertLines")
                this._removeLines(range.start.row, range.end.row - 1);
            else if (delta.action == "insertText")
                this.remove(range);
            else if (delta.action == "removeLines")
                this._insertLines(range.start.row, delta.lines);
            else if (delta.action == "removeText")
                this.insert(range.start, delta.text);
        }
    }
    indexToPosition(index, startRow) {
        var lines = this.$lines || this.getAllLines();
        var newlineLength = this.getNewLineCharacter().length;
        for (var i = startRow || 0, l = lines.length; i < l; i++) {
            index -= lines[i].length + newlineLength;
            if (index < 0)
                return { row: i, column: index + lines[i].length + newlineLength };
        }
        return { row: l - 1, column: lines[l - 1].length };
    }
    positionToIndex(pos, startRow) {
        var lines = this.$lines || this.getAllLines();
        var newlineLength = this.getNewLineCharacter().length;
        var index = 0;
        var row = Math.min(pos.row, lines.length);
        for (var i = startRow || 0; i < row; ++i)
            index += lines[i].length + newlineLength;
        return index + pos.column;
    }
}
