import Range from "./Range";
import Fold from "./Fold";
/**
 * If an array is passed in, the folds are expected to be sorted already.
 * @class FoldLine
 */
export default class FoldLine {
    foldData: any;
    folds: Fold[];
    range: Range;
    start: {
        row: number;
        column: number;
    };
    startRow: number;
    end: {
        row: number;
        column: number;
    };
    endRow: number;
    /**
     * @class FoldLine
     * @constructor
     * @param foldData
     * @param folds {Fold[]}
     */
    constructor(foldData: any, folds: Fold[]);
    /**
     * Note: This doesn't update wrapData!
     * @method shiftRow
     * @param shift {number}
     * @return {void}
     */
    shiftRow(shift: number): void;
    /**
     * @method addFold
     * @param fold {Fold}
     * @return {void}
     */
    addFold(fold: Fold): void;
    /**
     * @method containsRow
     * @param row {number}
     * @return {boolean}
     */
    containsRow(row: number): boolean;
    /**
     * @method walk
     * @param callback
     * @param endRow {number}
     * @param endColumn {number}
     * @return {void}
     */
    walk(callback: (placeholder, row, column, end, isNewRow?) => any, endRow: number, endColumn: number): void;
    getNextFoldTo(row: number, column: number): {
        fold: Fold;
        kind: string;
    };
    addRemoveChars(row: number, column: number, len: number): void;
    split(row: any, column: any): FoldLine;
    merge(foldLineNext: any): void;
    toString(): string;
    idxToPosition(idx: any): {
        row: number;
        column: any;
    };
}
