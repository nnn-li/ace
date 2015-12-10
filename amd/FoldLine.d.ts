import Range from "./Range";
import Fold from "./Fold";
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
    constructor(foldData: any, folds: any);
    shiftRow(shift: any): void;
    addFold(fold: Fold): void;
    containsRow(row: number): boolean;
    walk(callback: (placeholder, row, column, end, isNewRow?) => any, endRow: any, endColumn: any): void;
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
