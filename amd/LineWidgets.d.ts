import Editor from "./Editor";
import EditSession from "./EditSession";
import VirtualRenderer from "./VirtualRenderer";
import LineWidget from "./LineWidget";
import Change from './Change';
export default class LineWidgets {
    session: EditSession;
    editor: Editor;
    firstRow: number;
    lastRow: number;
    lineWidgets: LineWidget[];
    $wrapData: number[][];
    $useWrapMode: boolean;
    constructor(session: EditSession);
    getRowLength(row: number): number;
    private $getWidgetScreenLength();
    private $onChangeEditor(e, session);
    attach(editor: Editor): void;
    detach(e?: any): void;
    updateOnFold(e: Change, session: EditSession): void;
    updateOnChange(delta: {
        action: string;
        start: {
            row: number;
            column: number;
        };
        end: {
            row: number;
            column: number;
        };
    }, session: EditSession): void;
    private $updateRows();
    addLineWidget(w: LineWidget): LineWidget;
    removeLineWidget(w: LineWidget): void;
    getWidgetsAtRow(row: number): LineWidget[];
    onWidgetChanged(w: LineWidget): void;
    measureWidgets(unused: any, renderer: VirtualRenderer): void;
    renderWidgets(e: any, renderer: VirtualRenderer): void;
}
