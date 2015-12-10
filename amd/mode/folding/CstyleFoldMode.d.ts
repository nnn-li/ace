import Range from "../../Range";
import FoldMode from "./FoldMode";
import EditSession from "../../EditSession";
export default class CstyleFoldMode extends FoldMode {
    foldingStartMarker: RegExp;
    foldingStopMarker: RegExp;
    constructor(commentRegex?: {
        start;
        end;
    });
    getFoldWidgetRange(session: EditSession, foldStyle: string, row: number, forceMultiline?: boolean): Range;
    getSectionRange(session: EditSession, row: number): Range;
}
