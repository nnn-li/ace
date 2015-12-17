"use strict";
import Range from "../../Range";
export default class FoldMode {
    constructor() {
        this.foldingStartMarker = null;
        this.foldingStopMarker = null;
    }
    getFoldWidget(session, foldStyle, row) {
        var line = session.getLine(row);
        if (this.foldingStartMarker.test(line)) {
            return "start";
        }
        if (foldStyle === "markbeginend" && this.foldingStopMarker && this.foldingStopMarker.test(line)) {
            return "end";
        }
        return "";
    }
    getFoldWidgetRange(session, foldStyle, row) {
        return null;
    }
    indentationBlock(session, row, column) {
        var re = /\S/;
        var line = session.getLine(row);
        var startLevel = line.search(re);
        if (startLevel === -1) {
            return;
        }
        var startColumn = column || line.length;
        var maxRow = session.getLength();
        var startRow = row;
        var endRow = row;
        while (++row < maxRow) {
            var level = session.getLine(row).search(re);
            if (level === -1) {
                continue;
            }
            if (level <= startLevel) {
                break;
            }
            endRow = row;
        }
        if (endRow > startRow) {
            var endColumn = session.getLine(endRow).length;
            return new Range(startRow, startColumn, endRow, endColumn);
        }
    }
    openingBracketBlock(session, bracket, row, column, typeRe) {
        var start = { row: row, column: column + 1 };
        var end = session.findClosingBracket(bracket, start, typeRe);
        if (!end)
            return;
        var fw = session.foldWidgets[end.row];
        if (fw == null)
            fw = session.getFoldWidget(end.row);
        if (fw == "start" && end.row > start.row) {
            end.row--;
            end.column = session.getLine(end.row).length;
        }
        return Range.fromPoints(start, end);
    }
    closingBracketBlock(session, bracket, row, column, typeRe) {
        var end = { row: row, column: column };
        var start = session.findOpeningBracket(bracket, end);
        if (!start) {
            return;
        }
        start.column++;
        end.column--;
        return Range.fromPoints(start, end);
    }
}
