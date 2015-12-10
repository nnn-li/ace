import { ListViewPopup } from "./autocomplete/popup";
import Editor from './Editor';
import EditSession from './EditSession';
export interface Completer {
    getCompletions(editor: Editor, session: EditSession, pos: {
        row: number;
        column: number;
    }, prefix: string, callback: any): any;
}
export declare function getCompleter(editor: Editor): CompleterAggregate;
export declare function setCompleter(editor: Editor, completer: CompleterAggregate): void;
export declare class CompleterAggregate implements Completer {
    private editor;
    private keyboardHandler;
    activated: boolean;
    private changeTimer;
    private gatherCompletionsId;
    private base;
    private completions;
    private commands;
    autoSelect: boolean;
    autoInsert: boolean;
    constructor(editor: Editor);
    popup: ListViewPopup;
    /**
     * Implementation of the Completer interface.
     */
    insertMatch(data?: any): void;
    /**
     * Implementation of the Completer interface.
     */
    detach(): void;
    /**
     * Implementation of the Completer interface.
     */
    goTo(where: string): void;
    /**
     * Implementation of the Completer interface.
     */
    getCompletions(editor: Editor, session: EditSession, pos: {
        row: number;
        column: number;
    }, prefix: string, callback: any): boolean;
    private updateCompletions(keepPopupPosition);
    private openPopup(editor, prefix, keepPopupPosition);
    private changeListener(e);
    private blurListener();
    private mousedownListener(e);
    private mousewheelListener(e);
    showPopup: (editor: Editor) => void;
    cancelContextMenu(): void;
}
export declare class Autocomplete {
    static startCommand: {
        name: string;
        exec: (editor: Editor) => void;
        bindKey: string;
    };
}
export declare class FilteredList {
    private all;
    private filtered;
    private filterText;
    constructor(all: any, filterText?: string, mutateData?: any);
    private setFilter(str);
    private filterCompletions(items, needle);
}
