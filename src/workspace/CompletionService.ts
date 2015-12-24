"use strict";

import Completion from '../Completion';
import Editor from '../Editor';
import EditorPosition from './EditorPosition';
import Position from '../Position';
import Workspace from './Workspace';

export default class CompletionService {
    private _editor: Editor;
    private _workspace: Workspace;
    private _editorPos: EditorPosition;
    public matchText: string;
    constructor(editor: Editor, workspace: Workspace) {
        this._editor = editor;
        this._workspace = workspace;
        this._editorPos = new EditorPosition(editor);
    }

    private _getCompletionsAtPosition(fileName: string, position: number, memberMode: boolean): Promise<Completion[]> {
        if (typeof this._workspace !== 'undefined') {
            var args = { 'fileName': fileName, 'position': position, 'memberMode': memberMode };
            this._workspace.getCompletionsAtPosition(fileName, position, memberMode);
        }
        else {
            return new Promise<Completion[]>(function(resolve, reject) {
                reject(new Error("Completions are not available at this time."));
            });
        }
    }

    /**
     * Returns the completions at the cursor position asynchronously in a callabck.
     * 
     * FIXME: There is a side-effect of setting the matchText property which should be part of the callback result.
     */
    getCompletionsAtCursor(fileName: string, cursor: Position): Promise<Completion[]> {

        var position: number = this._editorPos.getPositionChars(cursor);
        var memberMode = false;

        var text: string = this._editor.getSession().getLine(cursor.row).slice(0, cursor.column);
        var matches: string[] = text.match(/\.([a-zA-Z_0-9\$]*$)/);
        if (matches && matches.length > 0) {
            this.matchText = matches[1];
            memberMode = true;
            // Adjust the position.
            position -= this.matchText.length;
        }
        else {
            matches = text.match(/[a-zA-Z_0-9\$]*$/);
            this.matchText = matches[0];
            memberMode = false;
            // Leave the position as-is.
        }
        return this._getCompletionsAtPosition(fileName, position, memberMode);
    }
}
