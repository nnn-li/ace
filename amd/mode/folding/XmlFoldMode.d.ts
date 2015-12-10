import Range from "../../Range";
import FoldMode from "./FoldMode";
export default class XmlFoldMode extends FoldMode {
    voidElements: any;
    optionalEndTags: any;
    constructor(voidElements: any, optionalEndTags: any);
    getFoldWidget(session: any, foldStyle: any, row: any): string;
    _getFirstTagInLine(session: any, row: any): any;
    _findEndTagInLine(session: any, row: any, tagName: any, startColumn: any): boolean;
    _readTagForward(iterator: any): any;
    _readTagBackward(iterator: any): any;
    _pop(stack: any, tag: any): any;
    getFoldWidgetRange(session: any, foldStyle: any, row: any): Range;
}
