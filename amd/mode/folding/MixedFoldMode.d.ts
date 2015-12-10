import FoldMode from "./FoldMode";
export default class MixedFoldMode extends FoldMode {
    defaultMode: any;
    subModes: any;
    constructor(defaultMode: any, subModes: any);
    $getMode(state: any): any;
    $tryMode(state: any, session: any, foldStyle: any, row: any): any;
    getFoldWidget(session: any, foldStyle: any, row: any): any;
    getFoldWidgetRange(session: any, foldStyle: any, row: any): any;
}
