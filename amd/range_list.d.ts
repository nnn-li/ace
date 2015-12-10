import Range from "./Range";
import EditSession from "./EditSession";
export declare class RangeList {
    ranges: Range[];
    private session;
    private onChange;
    constructor();
    pointIndex(pos: {
        row: number;
        column: number;
    }, excludeEdges?: boolean, startIndex?: number): number;
    add(range: Range): Range[];
    addList(list: Range[]): Range[];
    substractPoint(pos: {
        row: number;
        column: number;
    }): Range[];
    /**
     * merge overlapping ranges
     */
    merge(): Range[];
    contains(row: number, column: number): boolean;
    containsPoint(pos: {
        row: number;
        column: number;
    }): boolean;
    rangeAtPoint(pos: {
        row: number;
        column: number;
    }): Range;
    clipRows(startRow: any, endRow: any): Range[];
    removeAll(): Range[];
    attach(session: EditSession): void;
    detach(): void;
    private $onChange(e, session);
}
