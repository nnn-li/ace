define(["require", "exports"], function (require, exports) {
    /**
     * This object is used in various places to indicate a region within the editor.
     * To better visualize how this works, imagine a rectangle.
     * Each quadrant of the rectangle is analogus to a range, as ranges contain a starting row and starting column, and an ending row, and ending column.
     *
     * @class Range
     */
    var Range = (function () {
        //  public cursor: Range;
        //  public isBackwards: boolean;
        /**
         * Creates a new `EditorRange` object with the given starting and ending row and column points.
         *
         * @class
         * @constructor
         * @param {Number} startRow The starting row
         * @param {Number} startColumn The starting column
         * @param {Number} endRow The ending row
         * @param {Number} endColumn The ending column
         */
        function Range(startRow, startColumn, endRow, endColumn) {
            this.start = {
                row: startRow,
                column: startColumn
            };
            this.end = {
                row: endRow,
                column: endColumn
            };
        }
        /**
         * Returns `true` if and only if the starting row and column, and ending row and column, are equivalent to those given by `range`.
         *
         * @method isEqual
         * @param range {Range} A range to check against.
         * @return {boolean}
         */
        Range.prototype.isEqual = function (range) {
            return this.start.row === range.start.row &&
                this.end.row === range.end.row &&
                this.start.column === range.start.column &&
                this.end.column === range.end.column;
        };
        /**
         *
         * Returns a string containing the range's row and column information.
         * @return {string}
         */
        Range.prototype.toString = function () {
            return ("Range: [" + this.start.row + "/" + this.start.column +
                "] -> [" + this.end.row + "/" + this.end.column + "]");
        };
        /**
         * Returns `true` if the `row` and `column` provided are within the given range.
         *
         * @method contains
         * @param row {number} A row to check for
         * @param column {number} A column to check for
         * @return {boolean}
         */
        Range.prototype.contains = function (row, column) {
            return this.compare(row, column) === 0;
        };
        /**
         * Compares `this` range (A) with another range (B).
         *
         * @method compareRange
         * @param {Range} range A range to compare with
         * @return {number} This method returns one of the following numbers:<br/>
         * <br/>
         * * `-2`: (B) is in front of (A), and doesn't intersect with (A)<br/>
         * * `-1`: (B) begins before (A) but ends inside of (A)<br/>
         * * `0`: (B) is completely inside of (A) OR (A) is completely inside of (B)<br/>
         * * `+1`: (B) begins inside of (A) but ends outside of (A)<br/>
         * * `+2`: (B) is after (A) and doesn't intersect with (A)<br/>
         * * `42`: FTW state: (B) ends in (A) but starts outside of (A)
         **/
        Range.prototype.compareRange = function (range) {
            var cmp;
            var end = range.end;
            var start = range.start;
            cmp = this.compare(end.row, end.column);
            if (cmp === 1) {
                cmp = this.compare(start.row, start.column);
                if (cmp === 1) {
                    return 2;
                }
                else if (cmp === 0) {
                    return 1;
                }
                else {
                    return 0;
                }
            }
            else if (cmp === -1) {
                return -2;
            }
            else {
                cmp = this.compare(start.row, start.column);
                if (cmp === -1) {
                    return -1;
                }
                else if (cmp === 1) {
                    return 42;
                }
                else {
                    return 0;
                }
            }
        };
        /**
         * Checks the row and column points of `p` with the row and column points of the calling range.
         *
         * @method comparePoint
         * @param p {Position} A point to compare with
         * @return {number} This method returns one of the following numbers:<br/>
         * * `0` if the two points are exactly equal<br/>
         * * `-1` if `p.row` is less then the calling range<br/>
         * * `1` if `p.row` is greater than the calling range<br/>
         * <br/>
         * If the starting row of the calling range is equal to `p.row`, and:<br/>
         * * `p.column` is greater than or equal to the calling range's starting column, this returns `0`<br/>
         * * Otherwise, it returns -1<br/>
         *<br/>
         * If the ending row of the calling range is equal to `p.row`, and:<br/>
         * * `p.column` is less than or equal to the calling range's ending column, this returns `0`<br/>
         * * Otherwise, it returns 1<br/>
         **/
        Range.prototype.comparePoint = function (p) {
            return this.compare(p.row, p.column);
        };
        /**
         * Checks the start and end points of `range` and compares them to the calling range.
         *
         * @method containsRange
         * @param range {Range} A range to compare with
         * @return {boolean} Returns `true` if the `range` is contained within the caller's range.
         */
        Range.prototype.containsRange = function (range) {
            return this.comparePoint(range.start) === 0 && this.comparePoint(range.end) === 0;
        };
        /**
         * Returns `true` if passed in `range` intersects with the one calling this method.
         * @param {EditorRange} range A range to compare with
         *
         * @return {Boolean}
         **/
        Range.prototype.intersects = function (range) {
            var cmp = this.compareRange(range);
            return (cmp === -1 || cmp === 0 || cmp === 1);
        };
        /**
         * Returns `true` if the caller's ending row point is the same as `row`, and if the caller's ending column is the same as `column`.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         * @return {Boolean}
         **/
        Range.prototype.isEnd = function (row, column) {
            return this.end.row === row && this.end.column === column;
        };
        /**
         * Returns `true` if the caller's starting row point is the same as `row`, and if the caller's starting column is the same as `column`.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         * @return {Boolean}
         **/
        Range.prototype.isStart = function (row, column) {
            return this.start.row === row && this.start.column === column;
        };
        /**
         * Sets the starting row and column for the range.
         * @param row {number} A row point to set
         * @param column {number} A column point to set
         *
         **/
        Range.prototype.setStart = function (row, column) {
            if (typeof row === "object") {
                // Fallback until code is completely typed.
                this.start.column = row['column'];
                this.start.row = row['row'];
            }
            else {
                this.start.row = row;
                this.start.column = column;
            }
        };
        /**
         * Sets the starting row and column for the range.
         * @param row {number} A row point to set
         * @param column {number} A column point to set
         *
         **/
        Range.prototype.setEnd = function (row, column) {
            if (typeof row === "object") {
                // Fallback until code is completely typed.
                this.end.column = row['column'];
                this.end.row = row['row'];
            }
            else {
                this.end.row = row;
                this.end.column = column;
            }
        };
        /**
         * Returns `true` if the `row` and `column` are within the given range.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         *
         * @return {Boolean}
         * @related EditorRange.compare
         **/
        Range.prototype.inside = function (row, column) {
            if (this.compare(row, column) === 0) {
                if (this.isEnd(row, column) || this.isStart(row, column)) {
                    return false;
                }
                else {
                    return true;
                }
            }
            return false;
        };
        /**
         * Returns `true` if the `row` and `column` are within the given range's starting points.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         * @return {Boolean}
         * @related EditorRange.compare
         **/
        Range.prototype.insideStart = function (row, column) {
            if (this.compare(row, column) === 0) {
                if (this.isEnd(row, column)) {
                    return false;
                }
                else {
                    return true;
                }
            }
            return false;
        };
        /**
         * Returns `true` if the `row` and `column` are within the given range's ending points.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         * @return {Boolean}
         * @related EditorRange.compare
         *
         **/
        Range.prototype.insideEnd = function (row, column) {
            if (this.compare(row, column) === 0) {
                if (this.isStart(row, column)) {
                    return false;
                }
                else {
                    return true;
                }
            }
            return false;
        };
        /**
         * Checks the row and column points with the row and column points of the calling range.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         *
         * @return {Number} This method returns one of the following numbers:<br/>
         * `0` if the two points are exactly equal <br/>
         * `-1` if `p.row` is less then the calling range <br/>
         * `1` if `p.row` is greater than the calling range <br/>
         *  <br/>
         * If the starting row of the calling range is equal to `p.row`, and: <br/>
         * `p.column` is greater than or equal to the calling range's starting column, this returns `0`<br/>
         * Otherwise, it returns -1<br/>
         * <br/>
         * If the ending row of the calling range is equal to `p.row`, and: <br/>
         * `p.column` is less than or equal to the calling range's ending column, this returns `0` <br/>
         * Otherwise, it returns 1
         **/
        Range.prototype.compare = function (row, column) {
            if (!this.isMultiLine()) {
                if (row === this.start.row) {
                    return column < this.start.column ? -1 : (column > this.end.column ? 1 : 0);
                }
            }
            if (row < this.start.row)
                return -1;
            if (row > this.end.row)
                return 1;
            if (this.start.row === row)
                return column >= this.start.column ? 0 : -1;
            if (this.end.row === row)
                return column <= this.end.column ? 0 : 1;
            return 0;
        };
        /**
         * Checks the row and column points with the row and column points of the calling range.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         * @return {Number} This method returns one of the following numbers:<br/>
         * <br/>
         * `0` if the two points are exactly equal<br/>
         * `-1` if `p.row` is less then the calling range<br/>
         * `1` if `p.row` is greater than the calling range, or if `isStart` is `true`.<br/>
         * <br/>
         * If the starting row of the calling range is equal to `p.row`, and:<br/>
         * `p.column` is greater than or equal to the calling range's starting column, this returns `0`<br/>
         * Otherwise, it returns -1<br/>
         * <br/>
         * If the ending row of the calling range is equal to `p.row`, and:<br/>
         * `p.column` is less than or equal to the calling range's ending column, this returns `0`<br/>
         * Otherwise, it returns 1
         *
         **/
        Range.prototype.compareStart = function (row, column) {
            if (this.start.row === row && this.start.column === column) {
                return -1;
            }
            else {
                return this.compare(row, column);
            }
        };
        /**
         * Checks the row and column points with the row and column points of the calling range.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         *
         * @return {Number} This method returns one of the following numbers:<br/>
         * `0` if the two points are exactly equal<br/>
         * `-1` if `p.row` is less then the calling range<br/>
         * `1` if `p.row` is greater than the calling range, or if `isEnd` is `true.<br/>
         * <br/>
         * If the starting row of the calling range is equal to `p.row`, and:<br/>
         * `p.column` is greater than or equal to the calling range's starting column, this returns `0`<br/>
         * Otherwise, it returns -1<br/>
         *<br/>
         * If the ending row of the calling range is equal to `p.row`, and:<br/>
         * `p.column` is less than or equal to the calling range's ending column, this returns `0`<br/>
         * Otherwise, it returns 1
         */
        Range.prototype.compareEnd = function (row, column) {
            if (this.end.row === row && this.end.column === column) {
                return 1;
            }
            else {
                return this.compare(row, column);
            }
        };
        /**
         * Checks the row and column points with the row and column points of the calling range.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         *
         * @return {Number} This method returns one of the following numbers:<br/>
         * * `1` if the ending row of the calling range is equal to `row`, and the ending column of the calling range is equal to `column`<br/>
         * * `-1` if the starting row of the calling range is equal to `row`, and the starting column of the calling range is equal to `column`<br/>
         * <br/>
         * Otherwise, it returns the value after calling [[EditorRange.compare `compare()`]].
         *
         **/
        Range.prototype.compareInside = function (row, column) {
            if (this.end.row === row && this.end.column === column) {
                return 1;
            }
            else if (this.start.row === row && this.start.column === column) {
                return -1;
            }
            else {
                return this.compare(row, column);
            }
        };
        /**
         * Returns the part of the current `EditorRange` that occurs within the boundaries of `firstRow` and `lastRow` as a new `EditorRange` object.
         * @param {Number} firstRow The starting row
         * @param {Number} lastRow The ending row
         * @return {EditorRange}
        **/
        Range.prototype.clipRows = function (firstRow, lastRow) {
            var start;
            var end;
            if (this.end.row > lastRow)
                end = { row: lastRow + 1, column: 0 };
            else if (this.end.row < firstRow)
                end = { row: firstRow, column: 0 };
            if (this.start.row > lastRow)
                start = { row: lastRow + 1, column: 0 };
            else if (this.start.row < firstRow)
                start = { row: firstRow, column: 0 };
            return Range.fromPoints(start || this.start, end || this.end);
        };
        /**
         * Changes the row and column points for the calling range for both the starting and ending points.
         * @param {Number} row A new row to extend to
         * @param {Number} column A new column to extend to
         * @return {EditorRange} The original range with the new row
        **/
        Range.prototype.extend = function (row, column) {
            var cmp = this.compare(row, column);
            if (cmp === 0) {
                return this;
            }
            else if (cmp === -1) {
                var start = { row: row, column: column };
            }
            else {
                var end = { row: row, column: column };
            }
            return Range.fromPoints(start || this.start, end || this.end);
        };
        Range.prototype.isEmpty = function () {
            return (this.start.row === this.end.row && this.start.column === this.end.column);
        };
        /**
         * Returns `true` if the range spans across multiple lines.
         * @return {Boolean}
         */
        Range.prototype.isMultiLine = function () {
            return (this.start.row !== this.end.row);
        };
        /**
         *
         * Returns a duplicate of the calling range.
         * @return {EditorRange}
        **/
        Range.prototype.clone = function () {
            return Range.fromPoints(this.start, this.end);
        };
        /**
         * Returns a range containing the starting and ending rows of the original range, but with a column value of `0`.
         * @return {EditorRange}
         */
        Range.prototype.collapseRows = function () {
            if (this.end.column === 0)
                return new Range(this.start.row, 0, Math.max(this.start.row, this.end.row - 1), 0);
            else
                return new Range(this.start.row, 0, this.end.row, 0);
        };
        /* experimental */
        Range.prototype.moveBy = function (row, column) {
            this.start.row += row;
            this.start.column += column;
            this.end.row += row;
            this.end.column += column;
        };
        /**
         * Creates and returns a new `EditorRange` based on the row and column of the given parameters.
         * @param start {Position} A starting point to use
         * @param end {Position} An ending point to use
         * @return {Range}
         */
        Range.fromPoints = function (start, end) {
            return new Range(start.row, start.column, end.row, end.column);
        };
        Range.comparePoints = function (p1, p2) {
            return p1.row - p2.row || p1.column - p2.column;
        };
        return Range;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Range;
});
