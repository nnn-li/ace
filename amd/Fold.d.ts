import FoldLine from "./FoldLine";
import Range from "./Range";
import { RangeList } from "./range_list";
export default class Fold extends RangeList {
    foldLine: FoldLine;
    placeholder: string;
    range: Range;
    start: {
        row: number;
        column: number;
    };
    end: {
        row: number;
        column: number;
    };
    endRow: number;
    sameRow: boolean;
    subFolds: Fold[];
    collapseChildren: number;
    constructor(range: Range, placeholder: string);
    toString(): string;
    setFoldLine(foldLine: FoldLine): void;
    clone(): Fold;
    addSubFold(fold: Fold): any;
    restoreRange(range: Fold): void;
}
