import EventEmitterClass from './lib/event_emitter';
import Range from './Range';
import Anchor from './Anchor';
export default class EditorDocument extends EventEmitterClass {
    private $lines;
    private $autoNewLine;
    private $newLineMode;
    constructor(text: string | Array<string>);
    /**
     * Replaces all the lines in the current `EditorDocument` with the value of `text`.
     * @method setValue
     * @param {string} text The text to use
     * @return {void}
     */
    setValue(text: string): void;
    /**
     * Returns all the lines in the document as a single string, joined by the new line character.
     * @method getValue
     * @return {string}
     */
    getValue(): string;
    /**
     * Creates a new `Anchor` to define a floating point in the document.
     * @method createAnchor
     * @param {number} row The row number to use
     * @param {number} column The column number to use
     * @return {Anchor}
     *
     */
    createAnchor(row: number, column: number): Anchor;
    /**
     * Splits a string of text on any newline (`\n`) or carriage-return ('\r') characters.
     *
     * @method $split
     * @param {string} text The text to work with
     */
    private $detectNewLine(text);
    /**
    * Returns the newline character that's being used, depending on the value of `newLineMode`.
    * @method getNewLineCharacter
    * @returns {String}
    *  If `newLineMode == windows`, `\r\n` is returned.
    *  If `newLineMode == unix`, `\n` is returned.
    *  If `newLineMode == auto`, the value of `autoNewLine` is returned.
    *
    **/
    getNewLineCharacter(): string;
    /**
     * Sets the new line mode.
     * @method setNewLineMode
     * @param {String} newLineMode [The newline mode to use; can be either `windows`, `unix`, or `auto`]{: #EditorDocument.setNewLineMode.param}
     * @return {void}
     */
    setNewLineMode(newLineMode: string): void;
    /**
     * Returns the type of newlines being used; either `windows`, `unix`, or `auto`
     * @method getNewLineMode
     * @return {string}
     */
    getNewLineMode(): string;
    /**
     * Returns `true` if `text` is a newline character (either `\r\n`, `\r`, or `\n`).
     * @method isNewLine
     * @param {string} text The text to check
     * @return {boolean}
     */
    isNewLine(text: string): boolean;
    /**
     * Returns a verbatim copy of the given line as it is in the document
     * @param {Number} row The row index to retrieve
     * @return {string}
     */
    getLine(row: number): string;
    /**
    * Returns an array of strings of the rows between `firstRow` and `lastRow`. This function is inclusive of `lastRow`.
    * @param {Number} firstRow The first row index to retrieve
    * @param {Number} lastRow The final row index to retrieve
    *
    **/
    getLines(firstRow?: number, lastRow?: number): string[];
    /**
    * Returns all lines in the document as string array.
    **/
    getAllLines(): string[];
    /**
    * Returns the number of rows in the document.
    **/
    getLength(): number;
    /**
     * Given a range within the document, returns all the text within that range as a single string.
     * @param {Range} range The range to work with
     *
     */
    getTextRange(range: Range): string;
    /**
    * Inserts a block of `text` at the indicated `position`.
    * @param {Object} position The position to start inserting at; it's an object that looks like `{ row: row, column: column}`
    * @param {string} text A chunk of text to insert
    * @returns {Object} The position ({row, column}) of the last line of `text`. If the length of `text` is 0, this function simply returns `position`.
    *
    **/
    insert(position: {
        row: number;
        column: number;
    }, text: string): {
        row: number;
        column: number;
    };
    /**
     * Fires whenever the document changes.
     *
     * Several methods trigger different `"change"` events. Below is a list of each action type, followed by each property that's also available:
     *
     *  * `"insertLines"` (emitted by [[EditorDocument.insertLines]])
     *    * `range`: the [[Range]] of the change within the document
     *    * `lines`: the lines in the document that are changing
     *  * `"insertText"` (emitted by [[EditorDocument.insertNewLine]])
     *    * `range`: the [[Range]] of the change within the document
     *    * `text`: the text that's being added
     *  * `"removeLines"` (emitted by [[EditorDocument.insertLines]])
     *    * `range`: the [[Range]] of the change within the document
     *    * `lines`: the lines in the document that were removed
     *    * `nl`: the new line character (as defined by [[EditorDocument.getNewLineCharacter]])
     *  * `"removeText"` (emitted by [[EditorDocument.removeInLine]] and [[EditorDocument.removeNewLine]])
     *    * `range`: the [[Range]] of the change within the document
     *    * `text`: the text that's being removed
     *
     * @event change
     * @param {Object} e Contains at least one property called `"action"`. `"action"` indicates the action that triggered the change. Each action also has a set of additional properties.
     *
     **/
    /**
    * Inserts the elements in `lines` into the document, starting at the row index given by `row`. This method also triggers the `'change'` event.
    * @param {Number} row The index of the row to insert at
    * @param {Array} lines An array of strings
    * @returns {Object} Contains the final row and column, like this:
    *   ```
    *   {row: endRow, column: 0}
    *   ```
    *   If `lines` is empty, this function returns an object containing the current row, and column, like this:
    *   ```
    *   {row: row, column: 0}
    *   ```
    *
    **/
    insertLines(row: number, lines: string[]): {
        row: number;
        column: number;
    };
    private _insertLines(row, lines);
    /**
    * Inserts a new line into the document at the current row's `position`. This method also triggers the `'change'` event.
    * @param {Object} position The position to insert at
    * @returns {Object} Returns an object containing the final row and column, like this:<br/>
    *    ```
    *    {row: endRow, column: 0}
    *    ```
    *
    **/
    insertNewLine(position: {
        row: number;
        column: number;
    }): {
        row: number;
        column: number;
    };
    /**
    * Inserts `text` into the `position` at the current row. This method also triggers the `'change'` event.
    * @param {Object} position The position to insert at.
    * @param {String} text A chunk of text
    * @returns {Object} Returns an object containing the final row and column.
    **/
    insertInLine(position: {
        row: number;
        column: number;
    }, text: string): {
        row: number;
        column: number;
    };
    /**
    * Removes the `range` from the document.
    * @param {Range} range A specified Range to remove
    * @returns {Object} Returns the new `start` property of the range, which contains `startRow` and `startColumn`. If `range` is empty, this function returns the unmodified value of `range.start`.
    *
    **/
    remove(range: {
        start;
        end;
        isEmpty;
        isMultiLine;
    }): any;
    /**
    * Removes the specified columns from the `row`. This method also triggers the `'change'` event.
    * @param {Number} row The row to remove from
    * @param {Number} startColumn The column to start removing at
    * @param {Number} endColumn The column to stop removing at
    * @returns {Object} Returns an object containing `startRow` and `startColumn`, indicating the new row and column values.<br/>If `startColumn` is equal to `endColumn`, this function returns nothing.
    *
    **/
    removeInLine(row: number, startColumn: number, endColumn: number): {
        row: number;
        column: number;
    };
    /**
    * Removes a range of full lines. This method also triggers the `'change'` event.
    * @param {Number} firstRow The first row to be removed
    * @param {Number} lastRow The last row to be removed
    * @returns {[String]} Returns all the removed lines.
    *
    **/
    removeLines(firstRow: number, lastRow: number): string[];
    private _removeLines(firstRow, lastRow);
    /**
    * Removes the new line between `row` and the row immediately following it. This method also triggers the `'change'` event.
    * @param {Number} row The row to check
    *
    **/
    removeNewLine(row: number): void;
    /**
    * Replaces a range in the document with the new `text`.
    * @param {Range} range A specified Range to replace
    * @param {String} text The new text to use as a replacement
    * @returns {Object} Returns an object containing the final row and column, like this:
    *     {row: endRow, column: 0}
    * If the text and range are empty, this function returns an object containing the current `range.start` value.
    * If the text is the exact same as what currently exists, this function returns an object containing the current `range.end` value.
    *
    **/
    replace(range: Range, text: string): {
        row: number;
        column: number;
    };
    /**
    * Applies all the changes previously accumulated. These can be either `'includeText'`, `'insertLines'`, `'removeText'`, and `'removeLines'`.
    **/
    applyDeltas(deltas: {
        action: string;
        lines: string[];
        range: {
            start: {
                row: number;
                column: number;
            };
            end: {
                row: number;
                column: number;
            };
        };
        text: string;
    }[]): void;
    /**
    * Reverts any changes previously applied. These can be either `'includeText'`, `'insertLines'`, `'removeText'`, and `'removeLines'`.
    **/
    revertDeltas(deltas: {
        action: string;
        range: Range;
        lines: string[];
        text: string;
    }[]): void;
    /**
     * Converts an index position in a document to a `{row, column}` object.
     *
     * Index refers to the "absolute position" of a character in the document. For example:
     *
     * ```javascript
     * var x = 0; // 10 characters, plus one for newline
     * var y = -1;
     * ```
     *
     * Here, `y` is an index 15: 11 characters for the first row, and 5 characters until `y` in the second.
     *
     * @param {Number} index An index to convert
     * @param {Number} startRow=0 The row from which to start the conversion
     * @returns {Object} A `{row, column}` object of the `index` position
     */
    indexToPosition(index: number, startRow: number): {
        row: number;
        column: number;
    };
    /**
     * Converts the `{row, column}` position in a document to the character's index.
     *
     * Index refers to the "absolute position" of a character in the document. For example:
     *
     * ```javascript
     * var x = 0; // 10 characters, plus one for newline
     * var y = -1;
     * ```
     *
     * Here, `y` is an index 15: 11 characters for the first row, and 5 characters until `y` in the second.
     *
     * @param {Object} pos The `{row, column}` to convert
     * @param {Number} startRow=0 The row from which to start the conversion
     * @returns {Number} The index position in the document
     */
    positionToIndex(pos: {
        row: number;
        column: number;
    }, startRow: number): number;
}
