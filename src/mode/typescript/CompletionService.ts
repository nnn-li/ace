import Editor from '../../Editor';
import CursorPosition from '../../CursorPosition'
import EditorPosition from './EditorPosition';
import {Workspace} from '../../workspace/workspace'

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

    private _getCompletionsAtPosition(fileName: string, position: number, memberMode: boolean, callback: (err, results?) => void): void {
        if (typeof this._workspace !== 'undefined') {
            var args = { 'fileName': fileName, 'position': position, 'memberMode': memberMode };
            this._workspace.getCompletionsAtPosition(fileName, position, memberMode, callback);
        }
        else {
            callback(new Error("Completions are not available at this time."));
        }
    }

    /**
     * Returns the completions at the cursor position asynchronously in a callabck.
     * 
     * FIXME: There is a side-effect of setting the matchText property which should be part of the callback result.
     */
    getCompletionsAtCursor(fileName: string, cursor: CursorPosition, callback: (err, results?) => void): void {

        var position: number = this._editorPos.getPositionChars(cursor);
        var memberMode = false;

        var text: string = this._editor.session.getLine(cursor.row).slice(0, cursor.column);
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
        this._getCompletionsAtPosition(fileName, position, memberMode, callback);
    }
}
