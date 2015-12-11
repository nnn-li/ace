/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", "./range_list"], function (require, exports, range_list_1) {
    //import {inherits} from "./lib/oop";
    /**
     * Simple fold-data struct.
     * @class Fold
     * @extends RangeList
     */
    var Fold = (function (_super) {
        __extends(Fold, _super);
        /**
         * @class Fold
         * @constructor
         * @param range {Range}
         * @param placeholder {string}
         */
        function Fold(range, placeholder) {
            _super.call(this);
            this.foldLine = null;
            this.placeholder = placeholder;
            this.range = range;
            this.start = range.start;
            this.end = range.end;
            this.sameRow = range.start.row === range.end.row;
            this.subFolds = this.ranges = [];
        }
        /**
         * @method toString
         * @return {string}
         */
        Fold.prototype.toString = function () {
            return '"' + this.placeholder + '" ' + this.range.toString();
        };
        /**
         * @method setFoldLine
         * @param foldLine {FoldLine}
         * @return {void}
         */
        Fold.prototype.setFoldLine = function (foldLine) {
            this.foldLine = foldLine;
            this.subFolds.forEach(function (fold) {
                fold.setFoldLine(foldLine);
            });
        };
        /**
         * @method clone
         * @return {Fold}
         */
        Fold.prototype.clone = function () {
            var range = this.range.clone();
            var fold = new Fold(range, this.placeholder);
            this.subFolds.forEach(function (subFold) {
                fold.subFolds.push(subFold.clone());
            });
            fold.collapseChildren = this.collapseChildren;
            return fold;
        };
        /**
         * @method addSubFold
         * @param fold {Fold}
         * @return {Fold}
         */
        Fold.prototype.addSubFold = function (fold) {
            if (this.range.isEqual(fold))
                return;
            if (!this.range.containsRange(fold))
                throw new Error("A fold can't intersect already existing fold" + fold.range + this.range);
            // transform fold to local coordinates
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
            // cmp == -1
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
        };
        /**
         * @method restoreRange
         * @param range {Fold}
         * @return {void}
         */
        Fold.prototype.restoreRange = function (range) {
            return restoreRange(range, this.start);
        };
        return Fold;
    })(range_list_1.RangeList);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Fold;
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
});