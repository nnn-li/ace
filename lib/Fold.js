"use strict";
import { RangeList } from "./range_list";
export default class Fold extends RangeList {
    constructor(range, placeholder) {
        super();
        this.foldLine = null;
        this.placeholder = placeholder;
        this.range = range;
        this.start = range.start;
        this.end = range.end;
        this.sameRow = range.start.row === range.end.row;
        this.subFolds = this.ranges = [];
    }
    toString() {
        return '"' + this.placeholder + '" ' + this.range.toString();
    }
    setFoldLine(foldLine) {
        this.foldLine = foldLine;
        this.subFolds.forEach(function (fold) {
            fold.setFoldLine(foldLine);
        });
    }
    clone() {
        var range = this.range.clone();
        var fold = new Fold(range, this.placeholder);
        this.subFolds.forEach(function (subFold) {
            fold.subFolds.push(subFold.clone());
        });
        fold.collapseChildren = this.collapseChildren;
        return fold;
    }
    addSubFold(fold) {
        if (this.range.isEqual(fold))
            return;
        if (!this.range.containsRange(fold))
            throw new Error("A fold can't intersect already existing fold" + fold.range + this.range);
        consumeRange(fold, this.start);
        var row = fold.start.row, column = fold.start.column;
        for (var i = 0, cmp = -1; i < this.subFolds.length; i++) {
            cmp = this.subFolds[i].range.compare(row, column);
            if (cmp != 1)
                break;
        }
        var afterStart = this.subFolds[i];
        if (cmp == 0)
            return afterStart.addSubFold(fold);
        var row = fold.range.end.row, column = fold.range.end.column;
        for (var j = i, cmp = -1; j < this.subFolds.length; j++) {
            cmp = this.subFolds[j].range.compare(row, column);
            if (cmp != 1)
                break;
        }
        var afterEnd = this.subFolds[j];
        if (cmp == 0)
            throw new Error("A fold can't intersect already existing fold" + fold.range + this.range);
        var consumedFolds = this.subFolds.splice(i, j - i, fold);
        fold.setFoldLine(this.foldLine);
        return fold;
    }
    restoreRange(range) {
        return restoreRange(range, this.start);
    }
}
function consumePoint(point, anchor) {
    point.row -= anchor.row;
    if (point.row == 0)
        point.column -= anchor.column;
}
function consumeRange(range, anchor) {
    consumePoint(range.start, anchor);
    consumePoint(range.end, anchor);
}
function restorePoint(point, anchor) {
    if (point.row == 0)
        point.column += anchor.column;
    point.row += anchor.row;
}
function restoreRange(range, anchor) {
    restorePoint(range.start, anchor);
    restorePoint(range.end, anchor);
}
