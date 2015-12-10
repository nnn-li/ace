import FoldLine from "./FoldLine";
import Range from "./Range";
import { RangeList } from "./range_list";
/**
 * Simple fold-data struct.
 * @class Fold
 * @extends RangeList
 */
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
    /**
     * @class Fold
     * @constructor
     * @param range {Range}
     * @param placeholder {string}
     */
    constructor(range: Range, placeholder: string);
    /**
     * @method toString
     * @return {string}
     */
    toString(): string;
    /**
     * @method setFoldLine
     * @param foldLine {FoldLine}
     * @return {void}
     */
    setFoldLine(foldLine: FoldLine): void;
    /**
     * @method clone
     * @return {Fold}
     */
    clone(): Fold;
    /**
     * @method addSubFold
     * @param fold {Fold}
     * @return {Fold}
     */
    addSubFold(fold: Fold): Fold;
    /**
     * @method restoreRange
     * @param range {Fold}
     * @return {void}
     */
    restoreRange(range: Fold): void;
}
