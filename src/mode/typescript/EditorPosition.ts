import Position from '../../Position';
import EditorDocument from '../../EditorDocument';
import Editor from '../../Editor';
import Range from "../../Range";
/**
 * A wrapper around an Editor to perform conversions between linear character, {row;column} and TextRange representations.
 * 
 * The editor is integral to the conversion because it knows the lengths of each line.
 */
export default class EditorPosition {
    private editor: Editor;
    constructor(editor: Editor) {
        this.editor = editor;
    }
    getPositionChars(pos: { row: number; column: number }): number {
        var doc = this.editor.getSession().getDocument();
        return this.getChars(doc, pos);
    }
    getPositionFromChars(chars: number): { row: number; column: number } {
        var doc = this.editor.getSession().getDocument();
        return this.getPosition(doc, chars);
    }
    getCurrentPositionChars(): number {
        return this.getPositionChars(this.editor.getCursorPosition());
    }
    getCurrentLeftChar(): string {
        return this.getPositionLeftChar(this.editor.getCursorPosition());
    }
    getTextAtCursorPosition(cursor: Position): string {
        var range = new Range(cursor.row, cursor.column, cursor.row, cursor.column + 1);
        // The final function would probably have been better named 'getTextInRange'.
        return this.editor.getSession().getDocument().getTextRange(range);
    }
    getPositionLeftChar(cursor: Position): string {
        var range = new Range(cursor.row, cursor.column, cursor.row, cursor.column - 1);
        return this.editor.getSession().getDocument().getTextRange(range);
    }
    getLinesChars(lines: string[]): number {
        var count = 0;
        lines.forEach(function(line) {
            return count += line.length + 1;
        });
        return count;
    }

    getChars(doc: EditorDocument, pos: { row: number; column: number }): number {
        return this.getLinesChars(doc.getLines(0, pos.row - 1)) + pos.column;
    }

    getPosition(doc: EditorDocument, chars: number) {
        var i;
        var line: string;
        var lines = doc.getAllLines();
        var count = 0;
        var row = 0;
        // FIXME: Probably better to insist that 'i' is a number and use the lines.length
        for (i in lines) {
            line = lines[i];
            if (chars < (count + (line.length + 1))) {
                return {
                    row: row,
                    column: chars - count
                };
            }
            count += line.length + 1;
            row += 1;
        }
        return {
            row: row,
            column: chars - count
        };
    }
}
