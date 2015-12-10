import Range from "../../Range";
import EditSession from "../../EditSession";
export default class FoldMode {
    foldingStartMarker: any;
    foldingStopMarker: any;
    constructor();
    getFoldWidget(session: EditSession, foldStyle: string, row: number): string;
    getFoldWidgetRange(session: EditSession, foldStyle: string, row: number): any;
    indentationBlock(session: EditSession, row: number, column: number): Range;
    openingBracketBlock(session: EditSession, bracket: string, row: number, column: number, typeRe?: RegExp): Range;
    closingBracketBlock(session: EditSession, bracket: string, row: number, column: number, typeRe?: RegExp): Range;
}
