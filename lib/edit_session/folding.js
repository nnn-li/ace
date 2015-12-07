import { Range } from "../range";
import FoldLine from "./fold_line";
import Fold from "./fold";
import TokenIterator from "../TokenIterator";
export default class Folding {
    constructor() {
        this.$foldStyles = {
            "manual": 1,
            "markbegin": 1,
            "markbeginend": 1
        };
        this.$foldStyle = "markbegin";
    }
    getFoldAt(row, column, side) {
        var foldLine = this.getFoldLine(row);
        if (!foldLine)
            return null;
        var folds = foldLine.folds;
        for (var i = 0; i < folds.length; i++) {
            var fold = folds[i];
            if (fold.range.contains(row, column)) {
                if (side == 1 && fold.range.isEnd(row, column)) {
                    continue;
                }
                else if (side == -1 && fold.range.isStart(row, column)) {
                    continue;
                }
                return fold;
            }
        }
    }
    getFoldsInRange(range) {
        var start = range.start;
        var end = range.end;
        var foldLines = this.$foldData;
        var foundFolds = [];
        start.column += 1;
        end.column -= 1;
        for (var i = 0; i < foldLines.length; i++) {
            var cmp = foldLines[i].range.compareRange(range);
            if (cmp == 2) {
                continue;
            }
            else if (cmp == -2) {
                break;
            }
            var folds = foldLines[i].folds;
            for (var j = 0; j < folds.length; j++) {
                var fold = folds[j];
                cmp = fold.range.compareRange(range);
                if (cmp == -2) {
                    break;
                }
                else if (cmp == 2) {
                    continue;
                }
                else if (cmp == 42) {
                    break;
                }
                foundFolds.push(fold);
            }
        }
        start.column -= 1;
        end.column += 1;
        return foundFolds;
    }
    getFoldsInRangeList(ranges) {
        if (Array.isArray(ranges)) {
            var folds = [];
            ranges.forEach(function (range) {
                folds = folds.concat(this.getFoldsInRange(range));
            }, this);
        }
        else {
            var folds = this.getFoldsInRange(ranges);
        }
        return folds;
    }
    getAllFolds() {
        var folds = [];
        var foldLines = this.$foldData;
        for (var i = 0; i < foldLines.length; i++)
            for (var j = 0; j < foldLines[i].folds.length; j++)
                folds.push(foldLines[i].folds[j]);
        return folds;
    }
    getFoldStringAt(row, column, trim, foldLine) {
        foldLine = foldLine || this.getFoldLine(row);
        if (!foldLine)
            return null;
        var lastFold = {
            end: { column: 0 }
        };
        var str;
        var fold;
        for (var i = 0; i < foldLine.folds.length; i++) {
            fold = foldLine.folds[i];
            var cmp = fold.range.compareEnd(row, column);
            if (cmp == -1) {
                str = this.getLine(fold.start.row).substring(lastFold.end.column, fold.start.column);
                break;
            }
            else if (cmp === 0) {
                return null;
            }
            lastFold = fold;
        }
        if (!str)
            str = this.getLine(fold.start.row).substring(lastFold.end.column);
        if (trim == -1)
            return str.substring(0, column - lastFold.end.column);
        else if (trim == 1)
            return str.substring(column - lastFold.end.column);
        else
            return str;
    }
    getFoldLine(docRow, startFoldLine) {
        var foldData = this.$foldData;
        var i = 0;
        if (startFoldLine)
            i = foldData.indexOf(startFoldLine);
        if (i == -1)
            i = 0;
        for (i; i < foldData.length; i++) {
            var foldLine = foldData[i];
            if (foldLine.start.row <= docRow && foldLine.end.row >= docRow) {
                return foldLine;
            }
            else if (foldLine.end.row > docRow) {
                return null;
            }
        }
        return null;
    }
    getNextFoldLine(docRow, startFoldLine) {
        var foldData = this.$foldData;
        var i = 0;
        if (startFoldLine)
            i = foldData.indexOf(startFoldLine);
        if (i == -1)
            i = 0;
        for (i; i < foldData.length; i++) {
            var foldLine = foldData[i];
            if (foldLine.end.row >= docRow) {
                return foldLine;
            }
        }
        return null;
    }
    getFoldedRowCount(first, last) {
        var foldData = this.$foldData;
        var rowCount = last - first + 1;
        for (var i = 0; i < foldData.length; i++) {
            var foldLine = foldData[i], end = foldLine.end.row, start = foldLine.start.row;
            if (end >= last) {
                if (start < last) {
                    if (start >= first)
                        rowCount -= last - start;
                    else
                        rowCount = 0;
                }
                break;
            }
            else if (end >= first) {
                if (start >= first)
                    rowCount -= end - start;
                else
                    rowCount -= end - first + 1;
            }
        }
        return rowCount;
    }
    $addFoldLine(foldLine) {
        this.$foldData.push(foldLine);
        this.$foldData.sort(function (a, b) {
            return a.start.row - b.start.row;
        });
        return foldLine;
    }
    addFold(placeholder, range) {
        var foldData = this.$foldData;
        var added = false;
        var fold;
        if (placeholder instanceof Fold)
            fold = placeholder;
        else {
            fold = new Fold(range, placeholder);
            fold.collapseChildren = range.collapseChildren;
        }
        fold.range = this.clipRange(fold.range);
        var startRow = fold.start.row;
        var startColumn = fold.start.column;
        var endRow = fold.end.row;
        var endColumn = fold.end.column;
        if (!(startRow < endRow ||
            startRow == endRow && startColumn <= endColumn - 2))
            throw new Error("The range has to be at least 2 characters width");
        var startFold = this.getFoldAt(startRow, startColumn, 1);
        var endFold = this.getFoldAt(endRow, endColumn, -1);
        if (startFold && endFold == startFold)
            return startFold.addSubFold(fold);
        if ((startFold && !startFold.range.isStart(startRow, startColumn))
            || (endFold && !endFold.range.isEnd(endRow, endColumn))) {
            throw new Error("A fold can't intersect already existing fold" + fold.range + startFold.range);
        }
        var folds = this.getFoldsInRange(fold.range);
        if (folds.length > 0) {
            this.removeFolds(folds);
            folds.forEach(function (subFold) {
                fold.addSubFold(subFold);
            });
        }
        for (var i = 0; i < foldData.length; i++) {
            var foldLine = foldData[i];
            if (endRow == foldLine.start.row) {
                foldLine.addFold(fold);
                added = true;
                break;
            }
            else if (startRow == foldLine.end.row) {
                foldLine.addFold(fold);
                added = true;
                if (!fold.sameRow) {
                    var foldLineNext = foldData[i + 1];
                    if (foldLineNext && foldLineNext.start.row == endRow) {
                        foldLine.merge(foldLineNext);
                        break;
                    }
                }
                break;
            }
            else if (endRow <= foldLine.start.row) {
                break;
            }
        }
        if (!added)
            foldLine = this.$addFoldLine(new FoldLine(this.$foldData, fold));
        if (this.useWrapMode)
            this.updateWrapData(foldLine.start.row, foldLine.start.row);
        else
            this.updateRowLengthCache(foldLine.start.row, foldLine.start.row);
        this.setModified(true);
        this._emit("changeFold", { data: fold, action: "add" });
        return fold;
    }
    addFolds(folds) {
        folds.forEach(function (fold) {
            this.addFold(fold);
        }, this);
    }
    removeFold(fold) {
        var foldLine = fold.foldLine;
        var startRow = foldLine.start.row;
        var endRow = foldLine.end.row;
        var foldLines = this.$foldData;
        var folds = foldLine.folds;
        if (folds.length == 1) {
            foldLines.splice(foldLines.indexOf(foldLine), 1);
        }
        else if (foldLine.range.isEnd(fold.end.row, fold.end.column)) {
            folds.pop();
            foldLine.end.row = folds[folds.length - 1].end.row;
            foldLine.end.column = folds[folds.length - 1].end.column;
        }
        else if (foldLine.range.isStart(fold.start.row, fold.start.column)) {
            folds.shift();
            foldLine.start.row = folds[0].start.row;
            foldLine.start.column = folds[0].start.column;
        }
        else if (fold.sameRow) {
            folds.splice(folds.indexOf(fold), 1);
        }
        else {
            var newFoldLine = foldLine.split(fold.start.row, fold.start.column);
            folds = newFoldLine.folds;
            folds.shift();
            newFoldLine.start.row = folds[0].start.row;
            newFoldLine.start.column = folds[0].start.column;
        }
        if (!this.updating) {
            if (this.useWrapMode)
                this.updateWrapData(startRow, endRow);
            else
                this.updateRowLengthCache(startRow, endRow);
        }
        this.setModified(true);
        this._emit("changeFold", { data: fold, action: "remove" });
    }
    removeFolds(folds) {
        var cloneFolds = [];
        for (var i = 0; i < folds.length; i++) {
            cloneFolds.push(folds[i]);
        }
        cloneFolds.forEach(function (fold) {
            this.removeFold(fold);
        }, this);
        this.setModified(true);
    }
    expandFold(fold) {
        this.removeFold(fold);
        fold.subFolds.forEach(function (subFold) {
            fold.restoreRange(subFold);
            this.addFold(subFold);
        }, this);
        if (fold.collapseChildren > 0) {
            this.foldAll(fold.start.row + 1, fold.end.row, fold.collapseChildren - 1);
        }
        fold.subFolds = [];
    }
    expandFolds(folds) {
        folds.forEach(function (fold) {
            this.expandFold(fold);
        }, this);
    }
    unfold(location, expandInner) {
        var range, folds;
        if (location == null) {
            range = new Range(0, 0, this.getLength(), 0);
            expandInner = true;
        }
        else if (typeof location == "number")
            range = new Range(location, 0, location, this.getLine(location).length);
        else if ("row" in location)
            range = Range.fromPoints(location, location);
        else
            range = location;
        folds = this.getFoldsInRangeList(range);
        if (expandInner) {
            this.removeFolds(folds);
        }
        else {
            var subFolds = folds;
            while (subFolds.length) {
                this.expandFolds(subFolds);
                subFolds = this.getFoldsInRangeList(range);
            }
        }
        if (folds.length)
            return folds;
    }
    isRowFolded(docRow, startFoldRow) {
        return !!this.getFoldLine(docRow, startFoldRow);
    }
    getRowFoldEnd(docRow, startFoldRow) {
        var foldLine = this.getFoldLine(docRow, startFoldRow);
        return foldLine ? foldLine.end.row : docRow;
    }
    getRowFoldStart(docRow, startFoldRow) {
        var foldLine = this.getFoldLine(docRow, startFoldRow);
        return foldLine ? foldLine.start.row : docRow;
    }
    getFoldDisplayLine(foldLine, endRow, endColumn, startRow, startColumn) {
        if (startRow == null)
            startRow = foldLine.start.row;
        if (startColumn == null)
            startColumn = 0;
        if (endRow == null)
            endRow = foldLine.end.row;
        if (endColumn == null)
            endColumn = this.getLine(endRow).length;
        var self = this;
        var textLine = "";
        foldLine.walk(function (placeholder, row, column, lastColumn) {
            if (row < startRow)
                return;
            if (row == startRow) {
                if (column < startColumn)
                    return;
                lastColumn = Math.max(startColumn, lastColumn);
            }
            if (placeholder != null) {
                textLine += placeholder;
            }
            else {
                textLine += self.getLine(row).substring(lastColumn, column);
            }
        }, endRow, endColumn);
        return textLine;
    }
    getDisplayLine(row, endColumn, startRow, startColumn) {
        var foldLine = this.getFoldLine(row);
        if (!foldLine) {
            var line;
            line = this.getLine(row);
            return line.substring(startColumn || 0, endColumn || line.length);
        }
        else {
            return this.getFoldDisplayLine(foldLine, row, endColumn, startRow, startColumn);
        }
    }
    $cloneFoldData() {
        var fd = [];
        fd = this.$foldData.map(function (foldLine) {
            var folds = foldLine.folds.map(function (fold) {
                return fold.clone();
            });
            return new FoldLine(fd, folds);
        });
        return fd;
    }
    toggleFold(tryToUnfold) {
        var selection = this.selection;
        var range = selection.getRange();
        var fold;
        var bracketPos;
        if (range.isEmpty()) {
            var cursor = range.start;
            fold = this.getFoldAt(cursor.row, cursor.column);
            if (fold) {
                this.expandFold(fold);
                return;
            }
            else if (bracketPos = this.findMatchingBracket(cursor)) {
                if (range.comparePoint(bracketPos) == 1) {
                    range.end = bracketPos;
                }
                else {
                    range.start = bracketPos;
                    range.start.column++;
                    range.end.column--;
                }
            }
            else if (bracketPos = this.findMatchingBracket({ row: cursor.row, column: cursor.column + 1 })) {
                if (range.comparePoint(bracketPos) === 1)
                    range.end = bracketPos;
                else
                    range.start = bracketPos;
                range.start.column++;
            }
            else {
                range = this.getCommentFoldRange(cursor.row, cursor.column) || range;
            }
        }
        else {
            var folds = this.getFoldsInRange(range);
            if (tryToUnfold && folds.length) {
                this.expandFolds(folds);
                return;
            }
            else if (folds.length == 1) {
                fold = folds[0];
            }
        }
        if (!fold)
            fold = this.getFoldAt(range.start.row, range.start.column);
        if (fold && fold.range.toString() == range.toString()) {
            this.expandFold(fold);
            return;
        }
        var placeholder = "...";
        if (!range.isMultiLine()) {
            placeholder = this.getTextRange(range);
            if (placeholder.length < 4)
                return;
            placeholder = placeholder.trim().substring(0, 2) + "..";
        }
        this.addFold(placeholder, range);
    }
    getCommentFoldRange(row, column, dir) {
        var iterator = new TokenIterator(this, row, column);
        var token = iterator.getCurrentToken();
        if (token && /^comment|string/.test(token.type)) {
            var range = new Range(0, 0, 0, 0);
            var re = new RegExp(token.type.replace(/\..*/, "\\."));
            if (dir != 1) {
                do {
                    token = iterator.stepBackward();
                } while (token && re.test(token.type));
                iterator.stepForward();
            }
            range.start.row = iterator.getCurrentTokenRow();
            range.start.column = iterator.getCurrentTokenColumn() + 2;
            iterator = new TokenIterator(this, row, column);
            if (dir != -1) {
                do {
                    token = iterator.stepForward();
                } while (token && re.test(token.type));
                token = iterator.stepBackward();
            }
            else
                token = iterator.getCurrentToken();
            range.end.row = iterator.getCurrentTokenRow();
            range.end.column = iterator.getCurrentTokenColumn() + token.value.length - 2;
            return range;
        }
    }
    foldAll(startRow, endRow, depth) {
        if (depth == undefined)
            depth = 100000;
        var foldWidgets = this.foldWidgets;
        if (!foldWidgets)
            return;
        endRow = endRow || this.getLength();
        startRow = startRow || 0;
        for (var row = startRow; row < endRow; row++) {
            if (foldWidgets[row] == null)
                foldWidgets[row] = this.getFoldWidget(row);
            if (foldWidgets[row] != "start")
                continue;
            var range = this.getFoldWidgetRange(row);
            if (range && range.isMultiLine()
                && range.end.row <= endRow
                && range.start.row >= startRow) {
                row = range.end.row;
                try {
                    var fold = this.addFold("...", range);
                    if (fold)
                        fold.collapseChildren = depth;
                }
                catch (e) { }
            }
        }
    }
    setFoldStyle(style) {
        if (!this.$foldStyles[style])
            throw new Error("invalid fold style: " + style + "[" + Object.keys(this.$foldStyles).join(", ") + "]");
        if (this.$foldStyle == style)
            return;
        this.$foldStyle = style;
        if (style == "manual")
            this.unfold();
        var mode = this.$foldMode;
        this.$setFolding(null);
        this.$setFolding(mode);
    }
    $setFolding(foldMode) {
        if (this.$foldMode == foldMode)
            return;
        this.$foldMode = foldMode;
        this.removeListener('change', this.$updateFoldWidgets);
        this._emit("changeAnnotation");
        if (!foldMode || this.$foldStyle == "manual") {
            this.foldWidgets = null;
            return;
        }
        this.foldWidgets = [];
        this.getFoldWidget = foldMode.getFoldWidget.bind(foldMode, this, this.$foldStyle);
        this.getFoldWidgetRange = foldMode.getFoldWidgetRange.bind(foldMode, this, this.$foldStyle);
        this.$updateFoldWidgets = this.updateFoldWidgets.bind(this);
        this.on('change', this.$updateFoldWidgets);
    }
    getParentFoldRangeData(row, ignoreCurrent) {
        var fw = this.foldWidgets;
        if (!fw || (ignoreCurrent && fw[row])) {
            return {};
        }
        var i = row - 1, firstRange;
        while (i >= 0) {
            var c = fw[i];
            if (c == null)
                c = fw[i] = this.getFoldWidget(i);
            if (c == "start") {
                var range = this.getFoldWidgetRange(i);
                if (!firstRange)
                    firstRange = range;
                if (range && range.end.row >= row)
                    break;
            }
            i--;
        }
        return {
            range: i !== -1 && range,
            firstRange: firstRange
        };
    }
    onFoldWidgetClick(row, e) {
        e = e.domEvent;
        var options = {
            children: e.shiftKey,
            all: e.ctrlKey || e.metaKey,
            siblings: e.altKey
        };
        var range = this.$toggleFoldWidget(row, options);
        if (!range) {
            var el = (e.target || e.srcElement);
            if (el && /ace_fold-widget/.test(el.className))
                el.className += " ace_invalid";
        }
    }
    $toggleFoldWidget(row, options) {
        if (!this.getFoldWidget)
            return;
        var type = this.getFoldWidget(row);
        var line = this.getLine(row);
        var dir = type === "end" ? -1 : 1;
        var fold = this.getFoldAt(row, dir === -1 ? 0 : line.length, dir);
        if (fold) {
            if (options.children || options.all)
                this.removeFold(fold);
            else
                this.expandFold(fold);
            return;
        }
        var range = this.getFoldWidgetRange(row, true);
        if (range && !range.isMultiLine()) {
            fold = this.getFoldAt(range.start.row, range.start.column, 1);
            if (fold && range.isEqual(fold.range)) {
                this.removeFold(fold);
                return;
            }
        }
        if (options.siblings) {
            var data = this.getParentFoldRangeData(row);
            if (data.range) {
                var startRow = data.range.start.row + 1;
                var endRow = data.range.end.row;
            }
            this.foldAll(startRow, endRow, options.all ? 10000 : 0);
        }
        else if (options.children) {
            endRow = range ? range.end.row : this.getLength();
            this.foldAll(row + 1, range.end.row, options.all ? 10000 : 0);
        }
        else if (range) {
            if (options.all)
                range.collapseChildren = 10000;
            this.addFold("...", range);
        }
        return range;
    }
    toggleFoldWidget(toggleParent) {
        var row = this.selection.getCursor().row;
        row = this.getRowFoldStart(row);
        var range = this.$toggleFoldWidget(row, {});
        if (range)
            return;
        var data = this.getParentFoldRangeData(row, true);
        range = data.range || data.firstRange;
        if (range) {
            row = range.start.row;
            var fold = this.getFoldAt(row, this.getLine(row).length, 1);
            if (fold) {
                this.removeFold(fold);
            }
            else {
                this.addFold("...", range);
            }
        }
    }
    updateFoldWidgets(e) {
        var delta = e.data;
        var range = delta.range;
        var firstRow = range.start.row;
        var len = range.end.row - firstRow;
        if (len === 0) {
            this.foldWidgets[firstRow] = null;
        }
        else if (delta.action == "removeText" || delta.action == "removeLines") {
            this.foldWidgets.splice(firstRow, len + 1, null);
        }
        else {
            var args = Array(len + 1);
            args.unshift(firstRow, 1);
            this.foldWidgets.splice.apply(this.foldWidgets, args);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9sZGluZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9lZGl0X3Nlc3Npb24vZm9sZGluZy50cyJdLCJuYW1lcyI6WyJGb2xkaW5nIiwiRm9sZGluZy5jb25zdHJ1Y3RvciIsIkZvbGRpbmcuZ2V0Rm9sZEF0IiwiRm9sZGluZy5nZXRGb2xkc0luUmFuZ2UiLCJGb2xkaW5nLmdldEZvbGRzSW5SYW5nZUxpc3QiLCJGb2xkaW5nLmdldEFsbEZvbGRzIiwiRm9sZGluZy5nZXRGb2xkU3RyaW5nQXQiLCJGb2xkaW5nLmdldEZvbGRMaW5lIiwiRm9sZGluZy5nZXROZXh0Rm9sZExpbmUiLCJGb2xkaW5nLmdldEZvbGRlZFJvd0NvdW50IiwiRm9sZGluZy4kYWRkRm9sZExpbmUiLCJGb2xkaW5nLmFkZEZvbGQiLCJGb2xkaW5nLmFkZEZvbGRzIiwiRm9sZGluZy5yZW1vdmVGb2xkIiwiRm9sZGluZy5yZW1vdmVGb2xkcyIsIkZvbGRpbmcuZXhwYW5kRm9sZCIsIkZvbGRpbmcuZXhwYW5kRm9sZHMiLCJGb2xkaW5nLnVuZm9sZCIsIkZvbGRpbmcuaXNSb3dGb2xkZWQiLCJGb2xkaW5nLmdldFJvd0ZvbGRFbmQiLCJGb2xkaW5nLmdldFJvd0ZvbGRTdGFydCIsIkZvbGRpbmcuZ2V0Rm9sZERpc3BsYXlMaW5lIiwiRm9sZGluZy5nZXREaXNwbGF5TGluZSIsIkZvbGRpbmcuJGNsb25lRm9sZERhdGEiLCJGb2xkaW5nLnRvZ2dsZUZvbGQiLCJGb2xkaW5nLmdldENvbW1lbnRGb2xkUmFuZ2UiLCJGb2xkaW5nLmZvbGRBbGwiLCJGb2xkaW5nLnNldEZvbGRTdHlsZSIsIkZvbGRpbmcuJHNldEZvbGRpbmciLCJGb2xkaW5nLmdldFBhcmVudEZvbGRSYW5nZURhdGEiLCJGb2xkaW5nLm9uRm9sZFdpZGdldENsaWNrIiwiRm9sZGluZy4kdG9nZ2xlRm9sZFdpZGdldCIsIkZvbGRpbmcudG9nZ2xlRm9sZFdpZGdldCIsIkZvbGRpbmcudXBkYXRlRm9s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QSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtRQUN4Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDUkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDVkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDL0JBLElBQUlBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzNCQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDN0JBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBO1lBQ3BCQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNoQkEsQ0FBQ0E7SUFFRFIsaUJBQWlCQSxDQUFDQSxLQUFhQSxFQUFFQSxJQUFZQTtRQUN6Q1MsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDOUJBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLEdBQUdBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2hDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUN2Q0EsSUFBSUEsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFDdEJBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQ3RCQSxLQUFLQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZ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bkRBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBO1FBQzdEQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUVGQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1REEsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDZEEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDeENBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO1FBQ2xEQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUtGQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNmQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN6Q0EsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FHTkEsQ0FBQ0E7WUFDR0EsSUFBSUEsV0FBV0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDcEVBLEtBQUtBLEdBQUdBLFdBQVdBLENBQUNBLEtBQUtBLENB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Q0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDeENBLEVBQUVBLENBQUNBLENBQUNBLFdBQVdBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUM5QkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hCQSxNQUFNQSxDQUFDQTtZQUNYQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDM0JBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUNOQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUUvREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsSUFBSUEsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcERBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ3RCQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUVEQSxJQUFJQSxXQUFXQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUN4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLFdBQVdBLEdBQUdB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LElBQUlBLENBQUNBLENBQUNBO1FBRS9DQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDOURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNwQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RCQSxNQUFNQSxDQUFDQTtZQUNYQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQkEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0Esc0JBQXNCQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUM1Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2JBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO2dCQUN4Q0EsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDcENBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLEVBQUVBLE1BQU1BLEVBQUVBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENB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QSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNaQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN0Q0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsWUFBWUEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckVBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLEVBQUVBLEdBQUdBLEdBQUdBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQ3JEQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxJQUFJQSxJQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQzFEQSxDQUFDQTtJQUNMQSxDQUFDQTtBQUNMakMsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICogXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbmltcG9ydCB7UmFuZ2V9IGZyb20gXCIuLi9yYW5nZVwiO1xuaW1wb3J0IEZvbGRMaW5lIGZyb20gXCIuL2ZvbGRfbGluZVwiO1xuaW1wb3J0IEZvbGQgZnJvbSBcIi4vZm9sZFwiO1xuaW1wb3J0IFRva2VuSXRlcmF0b3IgZnJvbSBcIi4uL1Rva2VuSXRlcmF0b3JcIjtcbmltcG9ydCB7RWRpdFNlc3Npb259IGZyb20gJy4uL2VkaXRfc2Vzc2lvbic7XG5pbXBvcnQge1NlbGVjdGlvbn0gZnJvbSBcIi4uL3NlbGVjdGlvblwiO1xuXG4vKipcbiAqIEEgbWl4aW4gY2xhc3NcbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRm9sZGluZyB7XG4gICAgcHJpdmF0ZSBmb2xkV2lkZ2V0cztcbiAgICBwcml2YXRlICRmb2xkTW9kZTtcbiAgICAvKipcbiAgICAgKiBQcm92aWRlZCBieSB0aGUgRWRpdFNlc3Npb24uXG4gICAgICovXG4gICAgc2VsZWN0aW9uOiBTZWxlY3Rpb247XG4gICAgZ2V0TGVuZ3RoOiAoKSA9PiBudW1iZXI7XG4gICAgZ2V0TGluZTogKHJvdzogbnVtYmVyKSA9PiBzdHJpbmc7XG5cbiAgICAvLyBzdHJ1Y3R1cmVkIGZvbGRpbmdcbiAgICAkZm9sZFN0eWxlcyA9IHtcbiAgICAgICAgXCJtYW51YWxcIjogMSxcbiAgICAgICAgXCJtYXJrYmVnaW5cIjogMSxcbiAgICAgICAgXCJtYXJrYmVnaW5lbmRcIjogMVxuICAgIH1cbiAgICAkZm9sZFN0eWxlID0gXCJtYXJrYmVnaW5cIjtcbiAgICBwcml2YXRlICRmb2xkRGF0YTogRm9sZExpbmVbXTtcbiAgICAvKlxuICAgICAqIExvb2tzIHVwIGEgZm9sZCBhdCBhIGdpdmVuIHJvdy9jb2x1bW4uIFBvc3NpYmxlIHZhbHVlcyBmb3Igc2lkZTpcbiAgICAgKiAgIC0xOiBpZ25vcmUgYSBmb2xkIGlmIGZvbGQuc3RhcnQgPSByb3cvY29sdW1uXG4gICAgICogICArMTogaWdub3JlIGEgZm9sZCBpZiBmb2xkLmVuZCA9IHJvdy9jb2x1bW5cbiAgICAgKi9cbiAgICBnZXRGb2xkQXQocm93OiBudW1iZXIsIGNvbHVtbiwgc2lkZT8pIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShyb3cpO1xuICAgICAgICBpZiAoIWZvbGRMaW5lKVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgdmFyIGZvbGRzID0gZm9sZExpbmUuZm9sZHM7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkID0gZm9sZHNbaV07XG4gICAgICAgICAgICBpZiAoZm9sZC5yYW5nZS5jb250YWlucyhyb3csIGNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICBpZiAoc2lkZSA9PSAxICYmIGZvbGQucmFuZ2UuaXNFbmQocm93LCBjb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc2lkZSA9PSAtMSAmJiBmb2xkLnJhbmdlLmlzU3RhcnQocm93LCBjb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZm9sZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qXG4gICAgICogUmV0dXJucyBhbGwgZm9sZHMgaW4gdGhlIGdpdmVuIHJhbmdlLiBOb3RlLCB0aGF0IHRoaXMgd2lsbCByZXR1cm4gZm9sZHNcbiAgICAgKlxuICAgICAqL1xuICAgIGdldEZvbGRzSW5SYW5nZShyYW5nZTogUmFuZ2UpIHtcbiAgICAgICAgdmFyIHN0YXJ0ID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgIHZhciBlbmQgPSByYW5nZS5lbmQ7XG4gICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIGZvdW5kRm9sZHM6IEZvbGRbXSA9IFtdO1xuXG4gICAgICAgIHN0YXJ0LmNvbHVtbiArPSAxO1xuICAgICAgICBlbmQuY29sdW1uIC09IDE7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkTGluZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBjbXAgPSBmb2xkTGluZXNbaV0ucmFuZ2UuY29tcGFyZVJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmIChjbXAgPT0gMikge1xuICAgICAgICAgICAgICAgIC8vIFJhbmdlIGlzIGJlZm9yZSBmb2xkTGluZS4gTm8gaW50ZXJzZWN0aW9uLiBUaGlzIG1lYW5zLFxuICAgICAgICAgICAgICAgIC8vIHRoZXJlIG1pZ2h0IGJlIG90aGVyIGZvbGRMaW5lcyB0aGF0IGludGVyc2VjdC5cbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNtcCA9PSAtMikge1xuICAgICAgICAgICAgICAgIC8vIFJhbmdlIGlzIGFmdGVyIGZvbGRMaW5lLiBUaGVyZSBjYW4ndCBiZSBhbnkgb3RoZXIgZm9sZExpbmVzIHRoZW4sXG4gICAgICAgICAgICAgICAgLy8gc28gbGV0J3MgZ2l2ZSB1cC5cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGZvbGRzID0gZm9sZExpbmVzW2ldLmZvbGRzO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBmb2xkcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIHZhciBmb2xkID0gZm9sZHNbal07XG4gICAgICAgICAgICAgICAgY21wID0gZm9sZC5yYW5nZS5jb21wYXJlUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgICAgIGlmIChjbXAgPT0gLTIpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjbXAgPT0gMikge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgLy8gV1RGLXN0YXRlOiBDYW4gaGFwcGVuIGR1ZSB0byAtMS8rMSB0byBzdGFydC9lbmQgY29sdW1uLlxuICAgICAgICAgICAgICAgICAgICBpZiAoY21wID09IDQyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZvdW5kRm9sZHMucHVzaChmb2xkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBzdGFydC5jb2x1bW4gLT0gMTtcbiAgICAgICAgZW5kLmNvbHVtbiArPSAxO1xuXG4gICAgICAgIHJldHVybiBmb3VuZEZvbGRzO1xuICAgIH1cblxuICAgIGdldEZvbGRzSW5SYW5nZUxpc3QocmFuZ2VzKSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHJhbmdlcykpIHtcbiAgICAgICAgICAgIHZhciBmb2xkczogRm9sZFtdID0gW107XG4gICAgICAgICAgICByYW5nZXMuZm9yRWFjaChmdW5jdGlvbihyYW5nZSkge1xuICAgICAgICAgICAgICAgIGZvbGRzID0gZm9sZHMuY29uY2F0KHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlKSk7XG4gICAgICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlcyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZvbGRzO1xuICAgIH1cbiAgICBcbiAgICAvKlxuICAgICAqIFJldHVybnMgYWxsIGZvbGRzIGluIHRoZSBkb2N1bWVudFxuICAgICAqL1xuICAgIGdldEFsbEZvbGRzKCkge1xuICAgICAgICB2YXIgZm9sZHMgPSBbXTtcbiAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZExpbmVzLmxlbmd0aDsgaSsrKVxuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBmb2xkTGluZXNbaV0uZm9sZHMubGVuZ3RoOyBqKyspXG4gICAgICAgICAgICAgICAgZm9sZHMucHVzaChmb2xkTGluZXNbaV0uZm9sZHNbal0pO1xuXG4gICAgICAgIHJldHVybiBmb2xkcztcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIFJldHVybnMgdGhlIHN0cmluZyBiZXR3ZWVuIGZvbGRzIGF0IHRoZSBnaXZlbiBwb3NpdGlvbi5cbiAgICAgKiBFLmcuXG4gICAgICogIGZvbzxmb2xkPmJ8YXI8Zm9sZD53b2xyZCAtPiBcImJhclwiXG4gICAgICogIGZvbzxmb2xkPmJhcjxmb2xkPndvbHxyZCAtPiBcIndvcmxkXCJcbiAgICAgKiAgZm9vPGZvbGQ+YmFyPGZvfGxkPndvbHJkIC0+IDxudWxsPlxuICAgICAqXG4gICAgICogd2hlcmUgfCBtZWFucyB0aGUgcG9zaXRpb24gb2Ygcm93L2NvbHVtblxuICAgICAqXG4gICAgICogVGhlIHRyaW0gb3B0aW9uIGRldGVybXMgaWYgdGhlIHJldHVybiBzdHJpbmcgc2hvdWxkIGJlIHRyaW1lZCBhY2NvcmRpbmdcbiAgICAgKiB0byB0aGUgXCJzaWRlXCIgcGFzc2VkIHdpdGggdGhlIHRyaW0gdmFsdWU6XG4gICAgICpcbiAgICAgKiBFLmcuXG4gICAgICogIGZvbzxmb2xkPmJ8YXI8Zm9sZD53b2xyZCAtdHJpbT0tMT4gXCJiXCJcbiAgICAgKiAgZm9vPGZvbGQ+YmFyPGZvbGQ+d29sfHJkIC10cmltPSsxPiBcInJsZFwiXG4gICAgICogIGZvfG88Zm9sZD5iYXI8Zm9sZD53b2xyZCAtdHJpbT0wMD4gXCJmb29cIlxuICAgICAqL1xuICAgIGdldEZvbGRTdHJpbmdBdChyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIHRyaW06IG51bWJlciwgZm9sZExpbmU6IEZvbGRMaW5lKSB7XG4gICAgICAgIGZvbGRMaW5lID0gZm9sZExpbmUgfHwgdGhpcy5nZXRGb2xkTGluZShyb3cpO1xuICAgICAgICBpZiAoIWZvbGRMaW5lKVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgdmFyIGxhc3RGb2xkID0ge1xuICAgICAgICAgICAgZW5kOiB7IGNvbHVtbjogMCB9XG4gICAgICAgIH07XG4gICAgICAgIC8vIFRPRE86IFJlZmFjdG9yIHRvIHVzZSBnZXROZXh0Rm9sZFRvIGZ1bmN0aW9uLlxuICAgICAgICB2YXIgc3RyOiBzdHJpbmc7XG4gICAgICAgIHZhciBmb2xkOiBGb2xkO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRMaW5lLmZvbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBmb2xkID0gZm9sZExpbmUuZm9sZHNbaV07XG4gICAgICAgICAgICB2YXIgY21wID0gZm9sZC5yYW5nZS5jb21wYXJlRW5kKHJvdywgY29sdW1uKTtcbiAgICAgICAgICAgIGlmIChjbXAgPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBzdHIgPSB0aGlzLmdldExpbmUoZm9sZC5zdGFydC5yb3cpLnN1YnN0cmluZyhsYXN0Rm9sZC5lbmQuY29sdW1uLCBmb2xkLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjbXAgPT09IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxhc3RGb2xkID0gZm9sZDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXN0cilcbiAgICAgICAgICAgIHN0ciA9IHRoaXMuZ2V0TGluZShmb2xkLnN0YXJ0LnJvdykuc3Vic3RyaW5nKGxhc3RGb2xkLmVuZC5jb2x1bW4pO1xuXG4gICAgICAgIGlmICh0cmltID09IC0xKVxuICAgICAgICAgICAgcmV0dXJuIHN0ci5zdWJzdHJpbmcoMCwgY29sdW1uIC0gbGFzdEZvbGQuZW5kLmNvbHVtbik7XG4gICAgICAgIGVsc2UgaWYgKHRyaW0gPT0gMSlcbiAgICAgICAgICAgIHJldHVybiBzdHIuc3Vic3RyaW5nKGNvbHVtbiAtIGxhc3RGb2xkLmVuZC5jb2x1bW4pO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gc3RyO1xuICAgIH1cblxuICAgIGdldEZvbGRMaW5lKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRMaW5lPzogRm9sZExpbmUpOiBGb2xkTGluZSB7XG4gICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgaSA9IDA7XG4gICAgICAgIGlmIChzdGFydEZvbGRMaW5lKVxuICAgICAgICAgICAgaSA9IGZvbGREYXRhLmluZGV4T2Yoc3RhcnRGb2xkTGluZSk7XG4gICAgICAgIGlmIChpID09IC0xKVxuICAgICAgICAgICAgaSA9IDA7XG4gICAgICAgIGZvciAoaTsgaSA8IGZvbGREYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkRGF0YVtpXTtcbiAgICAgICAgICAgIGlmIChmb2xkTGluZS5zdGFydC5yb3cgPD0gZG9jUm93ICYmIGZvbGRMaW5lLmVuZC5yb3cgPj0gZG9jUm93KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvbGRMaW5lO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChmb2xkTGluZS5lbmQucm93ID4gZG9jUm93KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gcmV0dXJucyB0aGUgZm9sZCB3aGljaCBzdGFydHMgYWZ0ZXIgb3IgY29udGFpbnMgZG9jUm93XG4gICAgZ2V0TmV4dEZvbGRMaW5lKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRMaW5lOiBGb2xkTGluZSk6IEZvbGRMaW5lIHtcbiAgICAgICAgdmFyIGZvbGREYXRhID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgIHZhciBpID0gMDtcbiAgICAgICAgaWYgKHN0YXJ0Rm9sZExpbmUpXG4gICAgICAgICAgICBpID0gZm9sZERhdGEuaW5kZXhPZihzdGFydEZvbGRMaW5lKTtcbiAgICAgICAgaWYgKGkgPT0gLTEpXG4gICAgICAgICAgICBpID0gMDtcbiAgICAgICAgZm9yIChpOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldO1xuICAgICAgICAgICAgaWYgKGZvbGRMaW5lLmVuZC5yb3cgPj0gZG9jUm93KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvbGRMaW5lO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGdldEZvbGRlZFJvd0NvdW50KGZpcnN0OiBudW1iZXIsIGxhc3Q6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgcm93Q291bnQgPSBsYXN0IC0gZmlyc3QgKyAxO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGREYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkRGF0YVtpXSxcbiAgICAgICAgICAgICAgICBlbmQgPSBmb2xkTGluZS5lbmQucm93LFxuICAgICAgICAgICAgICAgIHN0YXJ0ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICAgICAgaWYgKGVuZCA+PSBsYXN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXJ0IDwgbGFzdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhcnQgPj0gZmlyc3QpXG4gICAgICAgICAgICAgICAgICAgICAgICByb3dDb3VudCAtPSBsYXN0IC0gc3RhcnQ7XG4gICAgICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvd0NvdW50ID0gMDsvL2luIG9uZSBmb2xkXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChlbmQgPj0gZmlyc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhcnQgPj0gZmlyc3QpIC8vZm9sZCBpbnNpZGUgcmFuZ2VcbiAgICAgICAgICAgICAgICAgICAgcm93Q291bnQgLT0gZW5kIC0gc3RhcnQ7XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICByb3dDb3VudCAtPSBlbmQgLSBmaXJzdCArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJvd0NvdW50O1xuICAgIH1cblxuICAgICRhZGRGb2xkTGluZShmb2xkTGluZTogRm9sZExpbmUpIHtcbiAgICAgICAgdGhpcy4kZm9sZERhdGEucHVzaChmb2xkTGluZSk7XG4gICAgICAgIHRoaXMuJGZvbGREYXRhLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIGEuc3RhcnQucm93IC0gYi5zdGFydC5yb3c7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZm9sZExpbmU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIG5ldyBmb2xkLlxuICAgICAqXG4gICAgICogQHJldHVybnNcbiAgICAgKiAgICAgIFRoZSBuZXcgY3JlYXRlZCBGb2xkIG9iamVjdCBvciBhbiBleGlzdGluZyBmb2xkIG9iamVjdCBpbiBjYXNlIHRoZVxuICAgICAqICAgICAgcGFzc2VkIGluIHJhbmdlIGZpdHMgYW4gZXhpc3RpbmcgZm9sZCBleGFjdGx5LlxuICAgICAqL1xuICAgIGFkZEZvbGQocGxhY2Vob2xkZXI6IHN0cmluZyB8IEZvbGQsIHJhbmdlOiBSYW5nZSkge1xuICAgICAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIGFkZGVkID0gZmFsc2U7XG4gICAgICAgIHZhciBmb2xkOiBGb2xkO1xuXG4gICAgICAgIGlmIChwbGFjZWhvbGRlciBpbnN0YW5jZW9mIEZvbGQpXG4gICAgICAgICAgICBmb2xkID0gcGxhY2Vob2xkZXI7XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZm9sZCA9IG5ldyBGb2xkKHJhbmdlLCBwbGFjZWhvbGRlcik7XG4gICAgICAgICAgICBmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gPSByYW5nZS5jb2xsYXBzZUNoaWxkcmVuO1xuICAgICAgICB9XG4gICAgICAgIC8vIEZJWE1FOiAkY2xpcFJhbmdlVG9Eb2N1bWVudD9cbiAgICAgICAgZm9sZC5yYW5nZSA9IHRoaXMuY2xpcFJhbmdlKGZvbGQucmFuZ2UpO1xuXG4gICAgICAgIHZhciBzdGFydFJvdyA9IGZvbGQuc3RhcnQucm93O1xuICAgICAgICB2YXIgc3RhcnRDb2x1bW4gPSBmb2xkLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgdmFyIGVuZFJvdyA9IGZvbGQuZW5kLnJvdztcbiAgICAgICAgdmFyIGVuZENvbHVtbiA9IGZvbGQuZW5kLmNvbHVtbjtcblxuICAgICAgICAvLyAtLS0gU29tZSBjaGVja2luZyAtLS1cbiAgICAgICAgaWYgKCEoc3RhcnRSb3cgPCBlbmRSb3cgfHxcbiAgICAgICAgICAgIHN0YXJ0Um93ID09IGVuZFJvdyAmJiBzdGFydENvbHVtbiA8PSBlbmRDb2x1bW4gLSAyKSlcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoZSByYW5nZSBoYXMgdG8gYmUgYXQgbGVhc3QgMiBjaGFyYWN0ZXJzIHdpZHRoXCIpO1xuXG4gICAgICAgIHZhciBzdGFydEZvbGQgPSB0aGlzLmdldEZvbGRBdChzdGFydFJvdywgc3RhcnRDb2x1bW4sIDEpO1xuICAgICAgICB2YXIgZW5kRm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KGVuZFJvdywgZW5kQ29sdW1uLCAtMSk7XG4gICAgICAgIGlmIChzdGFydEZvbGQgJiYgZW5kRm9sZCA9PSBzdGFydEZvbGQpXG4gICAgICAgICAgICByZXR1cm4gc3RhcnRGb2xkLmFkZFN1YkZvbGQoZm9sZCk7XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgKHN0YXJ0Rm9sZCAmJiAhc3RhcnRGb2xkLnJhbmdlLmlzU3RhcnQoc3RhcnRSb3csIHN0YXJ0Q29sdW1uKSlcbiAgICAgICAgICAgIHx8IChlbmRGb2xkICYmICFlbmRGb2xkLnJhbmdlLmlzRW5kKGVuZFJvdywgZW5kQ29sdW1uKSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBIGZvbGQgY2FuJ3QgaW50ZXJzZWN0IGFscmVhZHkgZXhpc3RpbmcgZm9sZFwiICsgZm9sZC5yYW5nZSArIHN0YXJ0Rm9sZC5yYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayBpZiB0aGVyZSBhcmUgZm9sZHMgaW4gdGhlIHJhbmdlIHdlIGNyZWF0ZSB0aGUgbmV3IGZvbGQgZm9yLlxuICAgICAgICB2YXIgZm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShmb2xkLnJhbmdlKTtcbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vIFJlbW92ZSB0aGUgZm9sZHMgZnJvbSBmb2xkIGRhdGEuXG4gICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGRzKGZvbGRzKTtcbiAgICAgICAgICAgIC8vIEFkZCB0aGUgcmVtb3ZlZCBmb2xkcyBhcyBzdWJmb2xkcyBvbiB0aGUgbmV3IGZvbGQuXG4gICAgICAgICAgICBmb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKHN1YkZvbGQpIHtcbiAgICAgICAgICAgICAgICBmb2xkLmFkZFN1YkZvbGQoc3ViRm9sZCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldO1xuICAgICAgICAgICAgaWYgKGVuZFJvdyA9PSBmb2xkTGluZS5zdGFydC5yb3cpIHtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIGFkZGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhcnRSb3cgPT0gZm9sZExpbmUuZW5kLnJvdykge1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgYWRkZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGlmICghZm9sZC5zYW1lUm93KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHdlIG1pZ2h0IGhhdmUgdG8gbWVyZ2UgdHdvIEZvbGRMaW5lcy5cbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lTmV4dCA9IGZvbGREYXRhW2kgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lTmV4dCAmJiBmb2xkTGluZU5leHQuc3RhcnQucm93ID09IGVuZFJvdykge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBtZXJnZSFcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLm1lcmdlKGZvbGRMaW5lTmV4dCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZW5kUm93IDw9IGZvbGRMaW5lLnN0YXJ0LnJvdykge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFhZGRlZClcbiAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy4kYWRkRm9sZExpbmUobmV3IEZvbGRMaW5lKHRoaXMuJGZvbGREYXRhLCBmb2xkKSk7XG5cbiAgICAgICAgaWYgKHRoaXMudXNlV3JhcE1vZGUpXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVdyYXBEYXRhKGZvbGRMaW5lLnN0YXJ0LnJvdywgZm9sZExpbmUuc3RhcnQucm93KTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy51cGRhdGVSb3dMZW5ndGhDYWNoZShmb2xkTGluZS5zdGFydC5yb3csIGZvbGRMaW5lLnN0YXJ0LnJvdyk7XG5cbiAgICAgICAgLy8gTm90aWZ5IHRoYXQgZm9sZCBkYXRhIGhhcyBjaGFuZ2VkLlxuICAgICAgICB0aGlzLnNldE1vZGlmaWVkKHRydWUpO1xuICAgICAgICB0aGlzLl9lbWl0KFwiY2hhbmdlRm9sZFwiLCB7IGRhdGE6IGZvbGQsIGFjdGlvbjogXCJhZGRcIiB9KTtcblxuICAgICAgICByZXR1cm4gZm9sZDtcbiAgICB9XG5cbiAgICBhZGRGb2xkcyhmb2xkczogRm9sZFtdKSB7XG4gICAgICAgIGZvbGRzLmZvckVhY2goZnVuY3Rpb24oZm9sZCkge1xuICAgICAgICAgICAgdGhpcy5hZGRGb2xkKGZvbGQpO1xuICAgICAgICB9LCB0aGlzKTtcbiAgICB9XG5cbiAgICByZW1vdmVGb2xkKGZvbGQ6IEZvbGQpIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZC5mb2xkTGluZTtcbiAgICAgICAgdmFyIHN0YXJ0Um93ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICB2YXIgZW5kUm93ID0gZm9sZExpbmUuZW5kLnJvdztcblxuICAgICAgICB2YXIgZm9sZExpbmVzID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lLmZvbGRzO1xuICAgICAgICAvLyBTaW1wbGUgY2FzZSB3aGVyZSB0aGVyZSBpcyBvbmx5IG9uZSBmb2xkIGluIHRoZSBGb2xkTGluZSBzdWNoIHRoYXRcbiAgICAgICAgLy8gdGhlIGVudGlyZSBmb2xkIGxpbmUgY2FuIGdldCByZW1vdmVkIGRpcmVjdGx5LlxuICAgICAgICBpZiAoZm9sZHMubGVuZ3RoID09IDEpIHtcbiAgICAgICAgICAgIGZvbGRMaW5lcy5zcGxpY2UoZm9sZExpbmVzLmluZGV4T2YoZm9sZExpbmUpLCAxKTtcbiAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAvLyBJZiB0aGUgZm9sZCBpcyB0aGUgbGFzdCBmb2xkIG9mIHRoZSBmb2xkTGluZSwganVzdCByZW1vdmUgaXQuXG4gICAgICAgICAgICBpZiAoZm9sZExpbmUucmFuZ2UuaXNFbmQoZm9sZC5lbmQucm93LCBmb2xkLmVuZC5jb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgZm9sZHMucG9wKCk7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUuZW5kLnJvdyA9IGZvbGRzW2ZvbGRzLmxlbmd0aCAtIDFdLmVuZC5yb3c7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUuZW5kLmNvbHVtbiA9IGZvbGRzW2ZvbGRzLmxlbmd0aCAtIDFdLmVuZC5jb2x1bW47XG4gICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgZm9sZCBpcyB0aGUgZmlyc3QgZm9sZCBvZiB0aGUgZm9sZExpbmUsIGp1c3QgcmVtb3ZlIGl0LlxuICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZS5yYW5nZS5pc1N0YXJ0KGZvbGQuc3RhcnQucm93LCBmb2xkLnN0YXJ0LmNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9sZHMuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc3RhcnQucm93ID0gZm9sZHNbMF0uc3RhcnQucm93O1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zdGFydC5jb2x1bW4gPSBmb2xkc1swXS5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgIC8vIFdlIGtub3cgdGhlcmUgYXJlIG1vcmUgdGhlbiAyIGZvbGRzIGFuZCB0aGUgZm9sZCBpcyBub3QgYXQgdGhlIGVkZ2UuXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgbWVhbnMsIHRoZSBmb2xkIGlzIHNvbWV3aGVyZSBpbiBiZXR3ZWVuLlxuICAgICAgICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGUgZm9sZCBpcyBpbiBvbmUgcm93LCB3ZSBqdXN0IGNhbiByZW1vdmUgaXQuXG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkLnNhbWVSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRzLnNwbGljZShmb2xkcy5pbmRleE9mKGZvbGQpLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoZSBmb2xkIGdvZXMgb3ZlciBtb3JlIHRoZW4gb25lIHJvdy4gVGhpcyBtZWFucyByZW12b2luZyB0aGlzIGZvbGRcbiAgICAgICAgICAgICAgICAgICAgLy8gd2lsbCBjYXVzZSB0aGUgZm9sZCBsaW5lIHRvIGdldCBzcGxpdHRlZCB1cC4gbmV3Rm9sZExpbmUgaXMgdGhlIHNlY29uZCBwYXJ0XG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBuZXdGb2xkTGluZSA9IGZvbGRMaW5lLnNwbGl0KGZvbGQuc3RhcnQucm93LCBmb2xkLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkcyA9IG5ld0ZvbGRMaW5lLmZvbGRzO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZHMuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld0ZvbGRMaW5lLnN0YXJ0LnJvdyA9IGZvbGRzWzBdLnN0YXJ0LnJvdztcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld0ZvbGRMaW5lLnN0YXJ0LmNvbHVtbiA9IGZvbGRzWzBdLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy51cGRhdGluZykge1xuICAgICAgICAgICAgaWYgKHRoaXMudXNlV3JhcE1vZGUpXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVXcmFwRGF0YShzdGFydFJvdywgZW5kUm93KTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVJvd0xlbmd0aENhY2hlKHN0YXJ0Um93LCBlbmRSb3cpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBOb3RpZnkgdGhhdCBmb2xkIGRhdGEgaGFzIGNoYW5nZWQuXG4gICAgICAgIHRoaXMuc2V0TW9kaWZpZWQodHJ1ZSk7XG4gICAgICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VGb2xkXCIsIHsgZGF0YTogZm9sZCwgYWN0aW9uOiBcInJlbW92ZVwiIH0pO1xuICAgIH1cblxuICAgIHJlbW92ZUZvbGRzKGZvbGRzOiBGb2xkW10pIHtcbiAgICAgICAgLy8gV2UgbmVlZCB0byBjbG9uZSB0aGUgZm9sZHMgYXJyYXkgcGFzc2VkIGluIGFzIGl0IG1pZ2h0IGJlIHRoZSBmb2xkc1xuICAgICAgICAvLyBhcnJheSBvZiBhIGZvbGQgbGluZSBhbmQgYXMgd2UgY2FsbCB0aGlzLnJlbW92ZUZvbGQoZm9sZCksIGZvbGRzXG4gICAgICAgIC8vIGFyZSByZW1vdmVkIGZyb20gZm9sZHMgYW5kIGNoYW5nZXMgdGhlIGN1cnJlbnQgaW5kZXguXG4gICAgICAgIHZhciBjbG9uZUZvbGRzID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNsb25lRm9sZHMucHVzaChmb2xkc1tpXSk7XG4gICAgICAgIH1cblxuICAgICAgICBjbG9uZUZvbGRzLmZvckVhY2goZnVuY3Rpb24oZm9sZCkge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgdGhpcy5zZXRNb2RpZmllZCh0cnVlKTtcbiAgICB9XG5cbiAgICBleHBhbmRGb2xkKGZvbGQ6IEZvbGQpIHtcbiAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICBmb2xkLnN1YkZvbGRzLmZvckVhY2goZnVuY3Rpb24oc3ViRm9sZCkge1xuICAgICAgICAgICAgZm9sZC5yZXN0b3JlUmFuZ2Uoc3ViRm9sZCk7XG4gICAgICAgICAgICB0aGlzLmFkZEZvbGQoc3ViRm9sZCk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgICAgICBpZiAoZm9sZC5jb2xsYXBzZUNoaWxkcmVuID4gMCkge1xuICAgICAgICAgICAgdGhpcy5mb2xkQWxsKGZvbGQuc3RhcnQucm93ICsgMSwgZm9sZC5lbmQucm93LCBmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gLSAxKTtcbiAgICAgICAgfVxuICAgICAgICBmb2xkLnN1YkZvbGRzID0gW107XG4gICAgfVxuXG4gICAgZXhwYW5kRm9sZHMoZm9sZHM6IEZvbGRbXSkge1xuICAgICAgICBmb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKGZvbGQpIHtcbiAgICAgICAgICAgIHRoaXMuZXhwYW5kRm9sZChmb2xkKTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgfVxuXG4gICAgdW5mb2xkKGxvY2F0aW9uPywgZXhwYW5kSW5uZXI/KSB7XG4gICAgICAgIHZhciByYW5nZSwgZm9sZHM7XG4gICAgICAgIGlmIChsb2NhdGlvbiA9PSBudWxsKSB7XG4gICAgICAgICAgICByYW5nZSA9IG5ldyBSYW5nZSgwLCAwLCB0aGlzLmdldExlbmd0aCgpLCAwKTtcbiAgICAgICAgICAgIGV4cGFuZElubmVyID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgbG9jYXRpb24gPT0gXCJudW1iZXJcIilcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKGxvY2F0aW9uLCAwLCBsb2NhdGlvbiwgdGhpcy5nZXRMaW5lKGxvY2F0aW9uKS5sZW5ndGgpO1xuICAgICAgICBlbHNlIGlmIChcInJvd1wiIGluIGxvY2F0aW9uKVxuICAgICAgICAgICAgcmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKGxvY2F0aW9uLCBsb2NhdGlvbik7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJhbmdlID0gbG9jYXRpb247XG5cbiAgICAgICAgZm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZUxpc3QocmFuZ2UpO1xuICAgICAgICBpZiAoZXhwYW5kSW5uZXIpIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZHMoZm9sZHMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIHN1YkZvbGRzID0gZm9sZHM7XG4gICAgICAgICAgICAvLyBUT0RPOiBtaWdodCBiZSBiZXR0ZXIgdG8gcmVtb3ZlIGFuZCBhZGQgZm9sZHMgaW4gb25lIGdvIGluc3RlYWQgb2YgdXNpbmdcbiAgICAgICAgICAgIC8vIGV4cGFuZEZvbGRzIHNldmVyYWwgdGltZXMuXG4gICAgICAgICAgICB3aGlsZSAoc3ViRm9sZHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5leHBhbmRGb2xkcyhzdWJGb2xkcyk7XG4gICAgICAgICAgICAgICAgc3ViRm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZUxpc3QocmFuZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChmb2xkcy5sZW5ndGgpXG4gICAgICAgICAgICByZXR1cm4gZm9sZHM7XG4gICAgfVxuXG4gICAgLypcbiAgICAgKiBDaGVja3MgaWYgYSBnaXZlbiBkb2N1bWVudFJvdyBpcyBmb2xkZWQuIFRoaXMgaXMgdHJ1ZSBpZiB0aGVyZSBhcmUgc29tZVxuICAgICAqIGZvbGRlZCBwYXJ0cyBzdWNoIHRoYXQgc29tZSBwYXJ0cyBvZiB0aGUgbGluZSBpcyBzdGlsbCB2aXNpYmxlLlxuICAgICAqKi9cbiAgICBpc1Jvd0ZvbGRlZChkb2NSb3c6IG51bWJlciwgc3RhcnRGb2xkUm93OiBGb2xkTGluZSk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gISF0aGlzLmdldEZvbGRMaW5lKGRvY1Jvdywgc3RhcnRGb2xkUm93KTtcbiAgICB9XG5cbiAgICBnZXRSb3dGb2xkRW5kKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRSb3c6IEZvbGRMaW5lKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShkb2NSb3csIHN0YXJ0Rm9sZFJvdyk7XG4gICAgICAgIHJldHVybiBmb2xkTGluZSA/IGZvbGRMaW5lLmVuZC5yb3cgOiBkb2NSb3c7XG4gICAgfVxuXG4gICAgZ2V0Um93Rm9sZFN0YXJ0KGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRSb3c/OiBGb2xkTGluZSk6IG51bWJlciB7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZG9jUm93LCBzdGFydEZvbGRSb3cpO1xuICAgICAgICByZXR1cm4gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBkb2NSb3c7XG4gICAgfVxuXG4gICAgZ2V0Rm9sZERpc3BsYXlMaW5lKGZvbGRMaW5lOiBGb2xkTGluZSwgZW5kUm93OiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyLCBzdGFydFJvdzogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgaWYgKHN0YXJ0Um93ID09IG51bGwpXG4gICAgICAgICAgICBzdGFydFJvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgaWYgKHN0YXJ0Q29sdW1uID09IG51bGwpXG4gICAgICAgICAgICBzdGFydENvbHVtbiA9IDA7XG4gICAgICAgIGlmIChlbmRSb3cgPT0gbnVsbClcbiAgICAgICAgICAgIGVuZFJvdyA9IGZvbGRMaW5lLmVuZC5yb3c7XG4gICAgICAgIGlmIChlbmRDb2x1bW4gPT0gbnVsbClcbiAgICAgICAgICAgIGVuZENvbHVtbiA9IHRoaXMuZ2V0TGluZShlbmRSb3cpLmxlbmd0aDtcbiAgICAgICAgXG5cbiAgICAgICAgLy8gQnVpbGQgdGhlIHRleHRsaW5lIHVzaW5nIHRoZSBGb2xkTGluZSB3YWxrZXIuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHRleHRMaW5lID0gXCJcIjtcblxuICAgICAgICBmb2xkTGluZS53YWxrKGZ1bmN0aW9uKHBsYWNlaG9sZGVyOiBzdHJpbmcsIHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgbGFzdENvbHVtbjogbnVtYmVyKSB7XG4gICAgICAgICAgICBpZiAocm93IDwgc3RhcnRSb3cpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKHJvdyA9PSBzdGFydFJvdykge1xuICAgICAgICAgICAgICAgIGlmIChjb2x1bW4gPCBzdGFydENvbHVtbilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGxhc3RDb2x1bW4gPSBNYXRoLm1heChzdGFydENvbHVtbiwgbGFzdENvbHVtbik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChwbGFjZWhvbGRlciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdGV4dExpbmUgKz0gcGxhY2Vob2xkZXI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRleHRMaW5lICs9IHNlbGYuZ2V0TGluZShyb3cpLnN1YnN0cmluZyhsYXN0Q29sdW1uLCBjb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCBlbmRSb3csIGVuZENvbHVtbik7XG4gICAgICAgIHJldHVybiB0ZXh0TGluZTtcbiAgICB9XG5cbiAgICBnZXREaXNwbGF5TGluZShyb3c6IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIsIHN0YXJ0Um93OiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIpOiBzdHJpbmcge1xuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKHJvdyk7XG5cbiAgICAgICAgaWYgKCFmb2xkTGluZSkge1xuICAgICAgICAgICAgdmFyIGxpbmU6IHN0cmluZztcbiAgICAgICAgICAgIGxpbmUgPSB0aGlzLmdldExpbmUocm93KTtcbiAgICAgICAgICAgIHJldHVybiBsaW5lLnN1YnN0cmluZyhzdGFydENvbHVtbiB8fCAwLCBlbmRDb2x1bW4gfHwgbGluZS5sZW5ndGgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0Rm9sZERpc3BsYXlMaW5lKFxuICAgICAgICAgICAgICAgIGZvbGRMaW5lLCByb3csIGVuZENvbHVtbiwgc3RhcnRSb3csIHN0YXJ0Q29sdW1uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgICRjbG9uZUZvbGREYXRhKCkge1xuICAgICAgICB2YXIgZmQgPSBbXTtcbiAgICAgICAgZmQgPSB0aGlzLiRmb2xkRGF0YS5tYXAoZnVuY3Rpb24oZm9sZExpbmUpIHtcbiAgICAgICAgICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lLmZvbGRzLm1hcChmdW5jdGlvbihmb2xkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvbGQuY2xvbmUoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBGb2xkTGluZShmZCwgZm9sZHMpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZmQ7XG4gICAgfVxuXG4gICAgdG9nZ2xlRm9sZCh0cnlUb1VuZm9sZCkge1xuICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5zZWxlY3Rpb247XG4gICAgICAgIHZhciByYW5nZTogUmFuZ2UgPSBzZWxlY3Rpb24uZ2V0UmFuZ2UoKTtcbiAgICAgICAgdmFyIGZvbGQ7XG4gICAgICAgIHZhciBicmFja2V0UG9zO1xuXG4gICAgICAgIGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciBjdXJzb3IgPSByYW5nZS5zdGFydDtcbiAgICAgICAgICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcblxuICAgICAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChicmFja2V0UG9zID0gdGhpcy5maW5kTWF0Y2hpbmdCcmFja2V0KGN1cnNvcikpIHtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuY29tcGFyZVBvaW50KGJyYWNrZXRQb3MpID09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UuZW5kID0gYnJhY2tldFBvcztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5zdGFydCA9IGJyYWNrZXRQb3M7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbisrO1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uLS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChicmFja2V0UG9zID0gdGhpcy5maW5kTWF0Y2hpbmdCcmFja2V0KHsgcm93OiBjdXJzb3Iucm93LCBjb2x1bW46IGN1cnNvci5jb2x1bW4gKyAxIH0pKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmVQb2ludChicmFja2V0UG9zKSA9PT0gMSlcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UuZW5kID0gYnJhY2tldFBvcztcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0ID0gYnJhY2tldFBvcztcblxuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbisrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByYW5nZSA9IHRoaXMuZ2V0Q29tbWVudEZvbGRSYW5nZShjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKSB8fCByYW5nZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmICh0cnlUb1VuZm9sZCAmJiBmb2xkcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGRzKGZvbGRzKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGZvbGRzLmxlbmd0aCA9PSAxKSB7XG4gICAgICAgICAgICAgICAgZm9sZCA9IGZvbGRzWzBdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFmb2xkKVxuICAgICAgICAgICAgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHJhbmdlLnN0YXJ0LnJvdywgcmFuZ2Uuc3RhcnQuY29sdW1uKTtcblxuICAgICAgICBpZiAoZm9sZCAmJiBmb2xkLnJhbmdlLnRvU3RyaW5nKCkgPT0gcmFuZ2UudG9TdHJpbmcoKSkge1xuICAgICAgICAgICAgdGhpcy5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHBsYWNlaG9sZGVyID0gXCIuLi5cIjtcbiAgICAgICAgaWYgKCFyYW5nZS5pc011bHRpTGluZSgpKSB7XG4gICAgICAgICAgICBwbGFjZWhvbGRlciA9IHRoaXMuZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmIChwbGFjZWhvbGRlci5sZW5ndGggPCA0KVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXIudHJpbSgpLnN1YnN0cmluZygwLCAyKSArIFwiLi5cIjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYWRkRm9sZChwbGFjZWhvbGRlciwgcmFuZ2UpO1xuICAgIH1cblxuICAgIGdldENvbW1lbnRGb2xkUmFuZ2Uocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBkaXI/OiBudW1iZXIpOiBSYW5nZSB7XG4gICAgICAgIHZhciBpdGVyYXRvciA9IG5ldyBUb2tlbkl0ZXJhdG9yKHRoaXMsIHJvdywgY29sdW1uKTtcbiAgICAgICAgdmFyIHRva2VuID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuKCk7XG4gICAgICAgIGlmICh0b2tlbiAmJiAvXmNvbW1lbnR8c3RyaW5nLy50ZXN0KHRva2VuLnR5cGUpKSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSBuZXcgUmFuZ2UoMCwgMCwgMCwgMCk7XG4gICAgICAgICAgICB2YXIgcmUgPSBuZXcgUmVnRXhwKHRva2VuLnR5cGUucmVwbGFjZSgvXFwuLiovLCBcIlxcXFwuXCIpKTtcbiAgICAgICAgICAgIGlmIChkaXIgIT0gMSkge1xuICAgICAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcbiAgICAgICAgICAgICAgICB9IHdoaWxlICh0b2tlbiAmJiByZS50ZXN0KHRva2VuLnR5cGUpKTtcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByYW5nZS5zdGFydC5yb3cgPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKTtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgMjtcblxuICAgICAgICAgICAgaXRlcmF0b3IgPSBuZXcgVG9rZW5JdGVyYXRvcih0aGlzLCByb3csIGNvbHVtbik7XG5cbiAgICAgICAgICAgIGlmIChkaXIgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgICAgICAgICB9IHdoaWxlICh0b2tlbiAmJiByZS50ZXN0KHRva2VuLnR5cGUpKTtcbiAgICAgICAgICAgICAgICB0b2tlbiA9IGl0ZXJhdG9yLnN0ZXBCYWNrd2FyZCgpO1xuICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW4oKTtcblxuICAgICAgICAgICAgcmFuZ2UuZW5kLnJvdyA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpO1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgdG9rZW4udmFsdWUubGVuZ3RoIC0gMjtcbiAgICAgICAgICAgIHJldHVybiByYW5nZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZvbGRBbGwoc3RhcnRSb3c6IG51bWJlciwgZW5kUm93OiBudW1iZXIsIGRlcHRoOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKGRlcHRoID09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIGRlcHRoID0gMTAwMDAwOyAvLyBKU09OLnN0cmluZ2lmeSBkb2Vzbid0IGhhbmxlIEluZmluaXR5XG4gICAgICAgIHZhciBmb2xkV2lkZ2V0cyA9IHRoaXMuZm9sZFdpZGdldHM7XG4gICAgICAgIGlmICghZm9sZFdpZGdldHMpXG4gICAgICAgICAgICByZXR1cm47IC8vIG1vZGUgZG9lc24ndCBzdXBwb3J0IGZvbGRpbmdcbiAgICAgICAgZW5kUm93ID0gZW5kUm93IHx8IHRoaXMuZ2V0TGVuZ3RoKCk7XG4gICAgICAgIHN0YXJ0Um93ID0gc3RhcnRSb3cgfHwgMDtcbiAgICAgICAgZm9yICh2YXIgcm93ID0gc3RhcnRSb3c7IHJvdyA8IGVuZFJvdzsgcm93KyspIHtcbiAgICAgICAgICAgIGlmIChmb2xkV2lkZ2V0c1tyb3ddID09IG51bGwpXG4gICAgICAgICAgICAgICAgZm9sZFdpZGdldHNbcm93XSA9IHRoaXMuZ2V0Rm9sZFdpZGdldChyb3cpO1xuICAgICAgICAgICAgaWYgKGZvbGRXaWRnZXRzW3Jvd10gIT0gXCJzdGFydFwiKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldEZvbGRXaWRnZXRSYW5nZShyb3cpO1xuICAgICAgICAgICAgLy8gc29tZXRpbWVzIHJhbmdlIGNhbiBiZSBpbmNvbXBhdGlibGUgd2l0aCBleGlzdGluZyBmb2xkXG4gICAgICAgICAgICAvLyBUT0RPIGNoYW5nZSBhZGRGb2xkIHRvIHJldHVybiBudWxsIGlzdGVhZCBvZiB0aHJvd2luZ1xuICAgICAgICAgICAgaWYgKHJhbmdlICYmIHJhbmdlLmlzTXVsdGlMaW5lKClcbiAgICAgICAgICAgICAgICAmJiByYW5nZS5lbmQucm93IDw9IGVuZFJvd1xuICAgICAgICAgICAgICAgICYmIHJhbmdlLnN0YXJ0LnJvdyA+PSBzdGFydFJvd1xuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcm93ID0gcmFuZ2UuZW5kLnJvdztcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAvLyBhZGRGb2xkIGNhbiBjaGFuZ2UgdGhlIHJhbmdlXG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkID0gdGhpcy5hZGRGb2xkKFwiLi4uXCIsIHJhbmdlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGQpXG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gPSBkZXB0aDtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHNldEZvbGRTdHlsZShzdHlsZSkge1xuICAgICAgICBpZiAoIXRoaXMuJGZvbGRTdHlsZXNbc3R5bGVdKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaW52YWxpZCBmb2xkIHN0eWxlOiBcIiArIHN0eWxlICsgXCJbXCIgKyBPYmplY3Qua2V5cyh0aGlzLiRmb2xkU3R5bGVzKS5qb2luKFwiLCBcIikgKyBcIl1cIik7XG5cbiAgICAgICAgaWYgKHRoaXMuJGZvbGRTdHlsZSA9PSBzdHlsZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLiRmb2xkU3R5bGUgPSBzdHlsZTtcblxuICAgICAgICBpZiAoc3R5bGUgPT0gXCJtYW51YWxcIilcbiAgICAgICAgICAgIHRoaXMudW5mb2xkKCk7XG4gICAgICAgIFxuICAgICAgICAvLyByZXNldCBmb2xkaW5nXG4gICAgICAgIHZhciBtb2RlID0gdGhpcy4kZm9sZE1vZGU7XG4gICAgICAgIHRoaXMuJHNldEZvbGRpbmcobnVsbCk7XG4gICAgICAgIHRoaXMuJHNldEZvbGRpbmcobW9kZSk7XG4gICAgfVxuXG4gICAgJHNldEZvbGRpbmcoZm9sZE1vZGUpIHtcbiAgICAgICAgaWYgKHRoaXMuJGZvbGRNb2RlID09IGZvbGRNb2RlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJGZvbGRNb2RlID0gZm9sZE1vZGU7XG5cbiAgICAgICAgdGhpcy5yZW1vdmVMaXN0ZW5lcignY2hhbmdlJywgdGhpcy4kdXBkYXRlRm9sZFdpZGdldHMpO1xuICAgICAgICB0aGlzLl9lbWl0KFwiY2hhbmdlQW5ub3RhdGlvblwiKTtcblxuICAgICAgICBpZiAoIWZvbGRNb2RlIHx8IHRoaXMuJGZvbGRTdHlsZSA9PSBcIm1hbnVhbFwiKSB7XG4gICAgICAgICAgICB0aGlzLmZvbGRXaWRnZXRzID0gbnVsbDtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZm9sZFdpZGdldHMgPSBbXTtcbiAgICAgICAgdGhpcy5nZXRGb2xkV2lkZ2V0ID0gZm9sZE1vZGUuZ2V0Rm9sZFdpZGdldC5iaW5kKGZvbGRNb2RlLCB0aGlzLCB0aGlzLiRmb2xkU3R5bGUpO1xuICAgICAgICB0aGlzLmdldEZvbGRXaWRnZXRSYW5nZSA9IGZvbGRNb2RlLmdldEZvbGRXaWRnZXRSYW5nZS5iaW5kKGZvbGRNb2RlLCB0aGlzLCB0aGlzLiRmb2xkU3R5bGUpO1xuXG4gICAgICAgIHRoaXMuJHVwZGF0ZUZvbGRXaWRnZXRzID0gdGhpcy51cGRhdGVGb2xkV2lkZ2V0cy5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLm9uKCdjaGFuZ2UnLCB0aGlzLiR1cGRhdGVGb2xkV2lkZ2V0cyk7XG5cbiAgICB9XG5cbiAgICBnZXRQYXJlbnRGb2xkUmFuZ2VEYXRhKHJvdywgaWdub3JlQ3VycmVudD8pOiB7IHJhbmdlOyBmaXJzdFJhbmdlIH0ge1xuICAgICAgICB2YXIgZncgPSB0aGlzLmZvbGRXaWRnZXRzO1xuICAgICAgICBpZiAoIWZ3IHx8IChpZ25vcmVDdXJyZW50ICYmIGZ3W3Jvd10pKSB7XG4gICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaSA9IHJvdyAtIDEsIGZpcnN0UmFuZ2U7XG4gICAgICAgIHdoaWxlIChpID49IDApIHtcbiAgICAgICAgICAgIHZhciBjID0gZndbaV07XG4gICAgICAgICAgICBpZiAoYyA9PSBudWxsKVxuICAgICAgICAgICAgICAgIGMgPSBmd1tpXSA9IHRoaXMuZ2V0Rm9sZFdpZGdldChpKTtcblxuICAgICAgICAgICAgaWYgKGMgPT0gXCJzdGFydFwiKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRGb2xkV2lkZ2V0UmFuZ2UoaSk7XG4gICAgICAgICAgICAgICAgaWYgKCFmaXJzdFJhbmdlKVxuICAgICAgICAgICAgICAgICAgICBmaXJzdFJhbmdlID0gcmFuZ2U7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlICYmIHJhbmdlLmVuZC5yb3cgPj0gcm93KVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGktLTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByYW5nZTogaSAhPT0gLTEgJiYgcmFuZ2UsXG4gICAgICAgICAgICBmaXJzdFJhbmdlOiBmaXJzdFJhbmdlXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgb25Gb2xkV2lkZ2V0Q2xpY2socm93LCBlKSB7XG4gICAgICAgIGUgPSBlLmRvbUV2ZW50O1xuICAgICAgICB2YXIgb3B0aW9ucyA9IHtcbiAgICAgICAgICAgIGNoaWxkcmVuOiBlLnNoaWZ0S2V5LFxuICAgICAgICAgICAgYWxsOiBlLmN0cmxLZXkgfHwgZS5tZXRhS2V5LFxuICAgICAgICAgICAgc2libGluZ3M6IGUuYWx0S2V5XG4gICAgICAgIH07XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy4kdG9nZ2xlRm9sZFdpZGdldChyb3csIG9wdGlvbnMpO1xuICAgICAgICBpZiAoIXJhbmdlKSB7XG4gICAgICAgICAgICB2YXIgZWwgPSAoZS50YXJnZXQgfHwgZS5zcmNFbGVtZW50KVxuICAgICAgICAgICAgaWYgKGVsICYmIC9hY2VfZm9sZC13aWRnZXQvLnRlc3QoZWwuY2xhc3NOYW1lKSlcbiAgICAgICAgICAgICAgICBlbC5jbGFzc05hbWUgKz0gXCIgYWNlX2ludmFsaWRcIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgICR0b2dnbGVGb2xkV2lkZ2V0KHJvdywgb3B0aW9ucyk6IFJhbmdlIHtcbiAgICAgICAgaWYgKCF0aGlzLmdldEZvbGRXaWRnZXQpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciB0eXBlID0gdGhpcy5nZXRGb2xkV2lkZ2V0KHJvdyk7XG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5nZXRMaW5lKHJvdyk7XG5cbiAgICAgICAgdmFyIGRpciA9IHR5cGUgPT09IFwiZW5kXCIgPyAtMSA6IDE7XG4gICAgICAgIHZhciBmb2xkID0gdGhpcy5nZXRGb2xkQXQocm93LCBkaXIgPT09IC0xID8gMCA6IGxpbmUubGVuZ3RoLCBkaXIpO1xuXG4gICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5jaGlsZHJlbiB8fCBvcHRpb25zLmFsbClcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRGb2xkV2lkZ2V0UmFuZ2Uocm93LCB0cnVlKTtcbiAgICAgICAgLy8gc29tZXRpbWVzIHNpbmdsZWxpbmUgZm9sZHMgY2FuIGJlIG1pc3NlZCBieSB0aGUgY29kZSBhYm92ZVxuICAgICAgICBpZiAocmFuZ2UgJiYgIXJhbmdlLmlzTXVsdGlMaW5lKCkpIHtcbiAgICAgICAgICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbiwgMSk7XG4gICAgICAgICAgICBpZiAoZm9sZCAmJiByYW5nZS5pc0VxdWFsKGZvbGQucmFuZ2UpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChvcHRpb25zLnNpYmxpbmdzKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IHRoaXMuZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YShyb3cpO1xuICAgICAgICAgICAgaWYgKGRhdGEucmFuZ2UpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3RhcnRSb3cgPSBkYXRhLnJhbmdlLnN0YXJ0LnJvdyArIDE7XG4gICAgICAgICAgICAgICAgdmFyIGVuZFJvdyA9IGRhdGEucmFuZ2UuZW5kLnJvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZm9sZEFsbChzdGFydFJvdywgZW5kUm93LCBvcHRpb25zLmFsbCA/IDEwMDAwIDogMCk7XG4gICAgICAgIH0gZWxzZSBpZiAob3B0aW9ucy5jaGlsZHJlbikge1xuICAgICAgICAgICAgZW5kUm93ID0gcmFuZ2UgPyByYW5nZS5lbmQucm93IDogdGhpcy5nZXRMZW5ndGgoKTtcbiAgICAgICAgICAgIHRoaXMuZm9sZEFsbChyb3cgKyAxLCByYW5nZS5lbmQucm93LCBvcHRpb25zLmFsbCA/IDEwMDAwIDogMCk7XG4gICAgICAgIH0gZWxzZSBpZiAocmFuZ2UpIHtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmFsbClcbiAgICAgICAgICAgICAgICByYW5nZS5jb2xsYXBzZUNoaWxkcmVuID0gMTAwMDA7XG4gICAgICAgICAgICB0aGlzLmFkZEZvbGQoXCIuLi5cIiwgcmFuZ2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cblxuXG5cbiAgICB0b2dnbGVGb2xkV2lkZ2V0KHRvZ2dsZVBhcmVudCkge1xuICAgICAgICB2YXIgcm93OiBudW1iZXIgPSB0aGlzLnNlbGVjdGlvbi5nZXRDdXJzb3IoKS5yb3c7XG4gICAgICAgIHJvdyA9IHRoaXMuZ2V0Um93Rm9sZFN0YXJ0KHJvdyk7XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuJHRvZ2dsZUZvbGRXaWRnZXQocm93LCB7fSk7XG5cbiAgICAgICAgaWYgKHJhbmdlKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAvLyBoYW5kbGUgdG9nZ2xlUGFyZW50XG4gICAgICAgIHZhciBkYXRhID0gdGhpcy5nZXRQYXJlbnRGb2xkUmFuZ2VEYXRhKHJvdywgdHJ1ZSk7XG4gICAgICAgIHJhbmdlID0gZGF0YS5yYW5nZSB8fCBkYXRhLmZpcnN0UmFuZ2U7XG5cbiAgICAgICAgaWYgKHJhbmdlKSB7XG4gICAgICAgICAgICByb3cgPSByYW5nZS5zdGFydC5yb3c7XG4gICAgICAgICAgICB2YXIgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHJvdywgdGhpcy5nZXRMaW5lKHJvdykubGVuZ3RoLCAxKTtcblxuICAgICAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkRm9sZChcIi4uLlwiLCByYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB1cGRhdGVGb2xkV2lkZ2V0cyhlOiB7IGRhdGE6IHsgYWN0aW9uOiBzdHJpbmc7IHJhbmdlOiBSYW5nZSB9IH0pOiB2b2lkIHtcbiAgICAgICAgdmFyIGRlbHRhID0gZS5kYXRhO1xuICAgICAgICB2YXIgcmFuZ2UgPSBkZWx0YS5yYW5nZTtcbiAgICAgICAgdmFyIGZpcnN0Um93ID0gcmFuZ2Uuc3RhcnQucm93O1xuICAgICAgICB2YXIgbGVuID0gcmFuZ2UuZW5kLnJvdyAtIGZpcnN0Um93O1xuXG4gICAgICAgIGlmIChsZW4gPT09IDApIHtcbiAgICAgICAgICAgIHRoaXMuZm9sZFdpZGdldHNbZmlyc3RSb3ddID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChkZWx0YS5hY3Rpb24gPT0gXCJyZW1vdmVUZXh0XCIgfHwgZGVsdGEuYWN0aW9uID09IFwicmVtb3ZlTGluZXNcIikge1xuICAgICAgICAgICAgdGhpcy5mb2xkV2lkZ2V0cy5zcGxpY2UoZmlyc3RSb3csIGxlbiArIDEsIG51bGwpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheShsZW4gKyAxKTtcbiAgICAgICAgICAgIGFyZ3MudW5zaGlmdChmaXJzdFJvdywgMSk7XG4gICAgICAgICAgICB0aGlzLmZvbGRXaWRnZXRzLnNwbGljZS5hcHBseSh0aGlzLmZvbGRXaWRnZXRzLCBhcmdzKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiJdfQ==