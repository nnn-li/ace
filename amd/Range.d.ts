/**
 * This object is used in various places to indicate a region within the editor.
 * To better visualize how this works, imagine a rectangle.
 * Each quadrant of the rectangle is analogus to a range, as ranges contain a starting row and starting column, and an ending row, and ending column.
 * @class Range
 */
/**
 * Creates a new `EditorRange` object with the given starting and ending row and column points.
 * @param {Number} startRow The starting row
 * @param {Number} startColumn The starting column
 * @param {Number} endRow The ending row
 * @param {Number} endColumn The ending column
 *
 * @constructor
 **/
export default class Range {
    start: {
        row: number;
        column: number;
    };
    end: {
        row: number;
        column: number;
    };
    /**
     * A marker id that is being sneaked onto the Range.
     */
    markerId: number;
    collapseChildren: number;
    /**
     * @class Range
     * @constructor
     */
    constructor(startRow: number, startColumn: number, endRow: number, endColumn: number);
    /**
     * Returns `true` if and only if the starting row and column, and ending row and column, are equivalent to those given by `range`.
     * @param {EditorRange} range A range to check against
     *
     * @return {Boolean}
     **/
    isEqual(range: {
        start: {
            row: number;
            column: number;
        };
        end: {
            row: number;
            column: number;
        };
    }): boolean;
    /**
     *
     * Returns a string containing the range's row and column information, given like this:
     * ```
     *    [start.row/start.column] -> [end.row/end.column]
     * ```
     * @return {String}
     **/
    toString(): string;
    /**
     *
     * Returns `true` if the `row` and `column` provided are within the given range. This can better be expressed as returning `true` if:
     * ```javascript
     *    this.start.row <= row <= this.end.row &&
     *    this.start.column <= column <= this.end.column
     * ```
     * @param {Number} row A row to check for
     * @param {Number} column A column to check for
     * @returns {Boolean}
     * @related EditorRange.compare
     **/
    contains(row: number, column: number): boolean;
    /**
     * Compares `this` range (A) with another range (B).
     * @param {EditorRange} range A range to compare with
     *
     * @related EditorRange.compare
     * @returns {Number} This method returns one of the following numbers:<br/>
     * <br/>
     * * `-2`: (B) is in front of (A), and doesn't intersect with (A)<br/>
     * * `-1`: (B) begins before (A) but ends inside of (A)<br/>
     * * `0`: (B) is completely inside of (A) OR (A) is completely inside of (B)<br/>
     * * `+1`: (B) begins inside of (A) but ends outside of (A)<br/>
     * * `+2`: (B) is after (A) and doesn't intersect with (A)<br/>
     * * `42`: FTW state: (B) ends in (A) but starts outside of (A)
     **/
    compareRange(range: Range): number;
    /**
     * Checks the row and column points of `p` with the row and column points of the calling range.
     *
     * @param {EditorRange} p A point to compare with
     *
     * @related EditorRange.compare
     * @returns {Number} This method returns one of the following numbers:<br/>
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
    comparePoint(p: {
        row: number;
        column: number;
    }): number;
    /**
     * Checks the start and end points of `range` and compares them to the calling range. Returns `true` if the `range` is contained within the caller's range.
     * @param {EditorRange} range A range to compare with
     *
     * @returns {Boolean}
     * @related EditorRange.comparePoint
     **/
    containsRange(range: {
        start: {
            row: number;
            column: number;
        };
        end: {
            row: number;
            column: number;
        };
    }): boolean;
    /**
     * Returns `true` if passed in `range` intersects with the one calling this method.
     * @param {EditorRange} range A range to compare with
     *
     * @returns {Boolean}
     **/
    intersects(range: Range): boolean;
    /**
     * Returns `true` if the caller's ending row point is the same as `row`, and if the caller's ending column is the same as `column`.
     * @param {Number} row A row point to compare with
     * @param {Number} column A column point to compare with
     *
     * @returns {Boolean}
     **/
    isEnd(row: number, column: number): boolean;
    /**
     * Returns `true` if the caller's starting row point is the same as `row`, and if the caller's starting column is the same as `column`.
     * @param {Number} row A row point to compare with
     * @param {Number} column A column point to compare with
     *
     * @returns {Boolean}
     **/
    isStart(row: number, column: number): boolean;
    /**
     * Sets the starting row and column for the range.
     * @param row {number} A row point to set
     * @param column {number} A column point to set
     *
     **/
    setStart(row: number, column: number): void;
    /**
     * Sets the starting row and column for the range.
     * @param row {number} A row point to set
     * @param column {number} A column point to set
     *
     **/
    setEnd(row: number, column: number): void;
    /**
     * Returns `true` if the `row` and `column` are within the given range.
     * @param {Number} row A row point to compare with
     * @param {Number} column A column point to compare with
     *
     *
     * @returns {Boolean}
     * @related EditorRange.compare
     **/
    inside(row: number, column: number): boolean;
    /**
     * Returns `true` if the `row` and `column` are within the given range's starting points.
     * @param {Number} row A row point to compare with
     * @param {Number} column A column point to compare with
     *
     * @returns {Boolean}
     * @related EditorRange.compare
     **/
    insideStart(row: number, column: number): boolean;
    /**
     * Returns `true` if the `row` and `column` are within the given range's ending points.
     * @param {Number} row A row point to compare with
     * @param {Number} column A column point to compare with
     *
     * @returns {Boolean}
     * @related EditorRange.compare
     *
     **/
    insideEnd(row: number, column: number): boolean;
    /**
     * Checks the row and column points with the row and column points of the calling range.
     * @param {Number} row A row point to compare with
     * @param {Number} column A column point to compare with
     *
     *
     * @returns {Number} This method returns one of the following numbers:<br/>
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
    compare(row: number, column: number): number;
    /**
     * Checks the row and column points with the row and column points of the calling range.
     * @param {Number} row A row point to compare with
     * @param {Number} column A column point to compare with
     *
     * @returns {Number} This method returns one of the following numbers:<br/>
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
    compareStart(row: number, column: number): number;
    /**
     * Checks the row and column points with the row and column points of the calling range.
     * @param {Number} row A row point to compare with
     * @param {Number} column A column point to compare with
     *
     *
     * @returns {Number} This method returns one of the following numbers:<br/>
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
    compareEnd(row: number, column: number): number;
    /**
     * Checks the row and column points with the row and column points of the calling range.
     * @param {Number} row A row point to compare with
     * @param {Number} column A column point to compare with
     *
     *
     * @returns {Number} This method returns one of the following numbers:<br/>
     * * `1` if the ending row of the calling range is equal to `row`, and the ending column of the calling range is equal to `column`<br/>
     * * `-1` if the starting row of the calling range is equal to `row`, and the starting column of the calling range is equal to `column`<br/>
     * <br/>
     * Otherwise, it returns the value after calling [[EditorRange.compare `compare()`]].
     *
     **/
    compareInside(row: number, column: number): number;
    /**
     * Returns the part of the current `EditorRange` that occurs within the boundaries of `firstRow` and `lastRow` as a new `EditorRange` object.
     * @param {Number} firstRow The starting row
     * @param {Number} lastRow The ending row
     * @returns {EditorRange}
    **/
    clipRows(firstRow: number, lastRow: number): Range;
    /**
     * Changes the row and column points for the calling range for both the starting and ending points.
     * @param {Number} row A new row to extend to
     * @param {Number} column A new column to extend to
     * @returns {EditorRange} The original range with the new row
    **/
    extend(row: number, column: number): Range;
    isEmpty(): boolean;
    /**
     * Returns `true` if the range spans across multiple lines.
     * @returns {Boolean}
     */
    isMultiLine(): boolean;
    /**
     *
     * Returns a duplicate of the calling range.
     * @returns {EditorRange}
    **/
    clone(): Range;
    /**
     *
     * Returns a range containing the starting and ending rows of the original range, but with a column value of `0`.
     * @returns {EditorRange}
    **/
    collapseRows(): Range;
    moveBy(row: number, column: number): void;
    /**
     * Creates and returns a new `EditorRange` based on the row and column of the given parameters.
     * @param {EditorRange} start A starting point to use
     * @param {EditorRange} end An ending point to use
     *
     * @returns {EditorRange}
    **/
    static fromPoints(start: {
        row: number;
        column: number;
    }, end: {
        row: number;
        column: number;
    }): Range;
    static comparePoints(p1: {
        row: number;
        column: number;
    }, p2: {
        row: number;
        column: number;
    }): number;
}
