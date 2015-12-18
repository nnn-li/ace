/* ***** BEGIN LICENSE BLOCK *****
 * The MIT License (MIT)
 *
 * Copyright (c) 2014-2016 David Geo Holmes <david.geo.holmes@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * ***** END LICENSE BLOCK ***** */
/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */
"use strict";

import Anchor from './Anchor';
import Delta from './Delta';
import EventEmitterClass from './lib/event_emitter';
import Position from './Position';
import Range from './Range';

var $split: (text: string) => string[] = (function() {
    function foo(text: string): string[] {
        return text.replace(/\r\n|\r/g, "\n").split("\n");
    }
    function bar(text: string): string[] {
        return text.split(/\r\n|\r|\n/);
    }
    // Determine whether the split function performs as we expect.
    // Here we attempt to separate a string of three separators.
    // If all works out, we should get back an array of four (4) empty strings.
    if ("aaa".split(/a/).length === 0) {
        return foo;
    }
    else {
        // In Chrome, this is the mainline because the result
        // of the test condition length is 4.
        return bar;
    }
})();

function $clipPosition(doc: Document, position: Position): Position {
    var length = doc.getLength();
    if (position.row >= length) {
        position.row = Math.max(0, length - 1);
        position.column = doc.getLine(length - 1).length;
    }
    else if (position.row < 0) {
        position.row = 0;
    }
    return position;
}

/**
 * @class Document
 */
export default class Document extends EventEmitterClass {
    private $lines: string[] = [];
    private $autoNewLine: string = "";
    private $newLineMode: string = "auto";

    /**
     * Creates a new Document.
     * If text is included, the Document contains those strings; otherwise, it's empty.
     *
     * @class Document
     * @constructor
     * @param text {string | Array<string>}
     */
    constructor(text: string | Array<string>) {
        super();

        // There has to be one line at least in the document. If you pass an empty
        // string to the insert function, nothing will happen. Workaround.
        if (text.length === 0) {
            this.$lines = [""];
        }
        else if (Array.isArray(text)) {
            this._insertLines(0, text);
        }
        else {
            this.insert({ row: 0, column: 0 }, text);
        }
    }

    /**
     * Replaces all the lines in the current `Document` with the value of `text`.
     *
     * @method setValue
     * @param text {string} The text to use
     * @return {void}
     */
    setValue(text: string): void {
        var len = this.getLength();
        this.remove(new Range(0, 0, len, this.getLine(len - 1).length));
        this.insert({ row: 0, column: 0 }, text);
    }

    /**
     * Returns all the lines in the document as a single string, joined by the new line character.
     *
     * @method getValue
     * @return {string}
     */
    getValue(): string {
        return this.getAllLines().join(this.getNewLineCharacter());
    }

    /** 
     * Creates a new `Anchor` to define a floating point in the document.
     *
     * @method createAnchor
     * @param {number} row The row number to use
     * @param {number} column The column number to use
     * @return {Anchor}
     */
    createAnchor(row: number, column: number): Anchor {
        return new Anchor(this, row, column);
    }

    /** 
     * Determines the newline character that is present in the presented text
     * and caches the result in $autoNewLine.
     *
     * @method $detectNewLine
     * @param {string} text The text to work with.
     * @return {void}
     * @private
     */
    private $detectNewLine(text: string): void {
        var match = text.match(/^.*?(\r\n|\r|\n)/m);
        this.$autoNewLine = match ? match[1] : "\n";
        this._signal("changeNewLineMode");
    }

    /**
    * Returns the newline character that's being used, depending on the value of `newLineMode`.
    *  If `newLineMode == windows`, `\r\n` is returned.  
    *  If `newLineMode == unix`, `\n` is returned.  
    *  If `newLineMode == auto`, the value of `autoNewLine` is returned.
    *
    * @method getNewLineCharacter
    * @return {string}
    *
    **/
    getNewLineCharacter(): string {
        switch (this.$newLineMode) {
            case "windows":
                return "\r\n";
            case "unix":
                return "\n";
            default:
                return this.$autoNewLine || "\n";
        }
    }

    /**
     * Sets the new line mode.
     *
     * @method setNewLineMode
     * @param {string} newLineMode [The newline mode to use; can be either `windows`, `unix`, or `auto`]{: #Document.setNewLineMode.param}
     * @return {void}
     */
    setNewLineMode(newLineMode: string): void {
        if (this.$newLineMode === newLineMode) {
            return;
        }
        this.$newLineMode = newLineMode;
        this._signal("changeNewLineMode");
    }

    /**
     * Returns the type of newlines being used; either `windows`, `unix`, or `auto`.
     *
     * @method getNewLineMode
     * @return {string}
     */
    getNewLineMode(): string {
        return this.$newLineMode;
    }

    /**
     * Returns `true` if `text` is a newline character (either `\r\n`, `\r`, or `\n`).
     *
     * @method isNewLine
     * @param text {string} The text to check
     * @return {boolean}
     */
    isNewLine(text: string): boolean {
        return (text == "\r\n" || text == "\r" || text == "\n");
    }

    /**
     * Returns a verbatim copy of the given line as it is in the document.
     *
     * @method getLine
     * @param row {Number} The row index to retrieve.
     * @return {string}
     */
    getLine(row: number): string {
        return this.$lines[row] || "";
    }

    /**
     * Returns an array of strings of the rows between `firstRow` and `lastRow`.
     * This function is inclusive of `lastRow`.
     *
     * @method getLines
     * @param [firstRow] {number} The first row index to retrieve
     * @param [lastRow] {number} The final row index to retrieve
     * @return {string[]}
     */
    getLines(firstRow?: number, lastRow?: number): string[] {
        return this.$lines.slice(firstRow, lastRow + 1);
    }

    /**
     * Returns all lines in the document as string array.
     *
     * @method getAllLines()
     * @return {string[]}
     */
    getAllLines(): string[] {
        return this.getLines(0, this.getLength());
    }

    /**
     * Returns the number of rows in the document.
     *
     * @method getLength
     * @return {number}
     */
    getLength(): number {
        return this.$lines.length;
    }

    /**
     * Given a range within the document, returns all the text within that range as a single string.
     *
     * @method getTextRange
     * @param range {Range} The range to work with.
     * @return {string}
     */
    getTextRange(range: Range): string {
        if (range.start.row === range.end.row) {
            return this.getLine(range.start.row).substring(range.start.column, range.end.column);
        }
        var lines = this.getLines(range.start.row, range.end.row);
        lines[0] = (lines[0] || "").substring(range.start.column);
        var l = lines.length - 1;
        if (range.end.row - range.start.row == l) {
            lines[l] = lines[l].substring(0, range.end.column);
        }
        return lines.join(this.getNewLineCharacter());
    }

    /**
     * Inserts a block of `text` at the indicated `position`.
     *
     * @method insert
     * @param position {Position} The position to start inserting at.
     * @param text {string} A chunk of text to insert.
     * @return {Position} The position ({row, column}) of the last line of `text`. If the length of `text` is 0, this function simply returns `position`. 
     */
    insert(position: Position, text: string): Position {
        if (!text || text.length === 0) {
            return position;
        }

        position = $clipPosition(this, position);

        // Only detect new lines if the document has no line break yet
        if (this.getLength() <= 1) {
            this.$detectNewLine(text);
        }

        var lines = $split(text);
        var firstLine = lines.splice(0, 1)[0];
        var lastLine = lines.length == 0 ? null : lines.splice(lines.length - 1, 1)[0];

        position = this.insertInLine(position, firstLine);
        if (lastLine !== null) {
            position = this.insertNewLine(position); // terminate first line
            position = this._insertLines(position.row, lines);
            position = this.insertInLine(position, lastLine || "");
        }
        return position;
    }

    /**
     * Fires whenever the document changes.
     *
     * Several methods trigger different `"change"` events. Below is a list of each action type, followed by each property that's also available:
     *
     *  * `"insertLines"` (emitted by [[Document.insertLines]])
     *    * `range`: the [[Range]] of the change within the document
     *    * `lines`: the lines in the document that are changing
     *  * `"insertText"` (emitted by [[Document.insertNewLine]])
     *    * `range`: the [[Range]] of the change within the document
     *    * `text`: the text that's being added
     *  * `"removeLines"` (emitted by [[Document.insertLines]])
     *    * `range`: the [[Range]] of the change within the document
     *    * `lines`: the lines in the document that were removed
     *    * `nl`: the new line character (as defined by [[Document.getNewLineCharacter]])
     *  * `"removeText"` (emitted by [[Document.removeInLine]] and [[Document.removeNewLine]])
     *    * `range`: the [[Range]] of the change within the document
     *    * `text`: the text that's being removed
     *
     * @event change
     * @param {Object} e Contains at least one property called `"action"`. `"action"` indicates the action that triggered the change. Each action also has a set of additional properties.
     *
     **/
    /**
     * Inserts the elements in `lines` into the document, starting at the row index given by `row`.
     * This method also triggers the `'change'` event.
     *
     * @method insertLines
     * @param row {number} The index of the row to insert at
     * @param lines {Array<string>} An array of strings
     * @return {Position} Contains the final row and column, like this:  
     *   ```
     *   {row: endRow, column: 0}
     *   ```  
     *   If `lines` is empty, this function returns an object containing the current row, and column, like this:  
     *   ``` 
     *   {row: row, column: 0}
     *   ```
     */
    insertLines(row: number, lines: string[]): Position {
        if (row >= this.getLength())
            return this.insert({ row: row, column: 0 }, "\n" + lines.join("\n"));
        return this._insertLines(Math.max(row, 0), lines);
    }

    private _insertLines(row: number, lines: string[]) {
        if (lines.length == 0)
            return { row: row, column: 0 };

        // apply doesn't work for big arrays (smallest threshold is on safari 0xFFFF)
        // to circumvent that we have to break huge inserts into smaller chunks here
        while (lines.length > 0xF000) {
            var end = this._insertLines(row, lines.slice(0, 0xF000));
            lines = lines.slice(0xF000);
            row = end.row;
        }

        var args = [row, 0];
        args.push.apply(args, lines);
        this.$lines.splice.apply(this.$lines, args);

        var range = new Range(row, 0, row + lines.length, 0);
        var delta = {
            action: "insertLines",
            range: range,
            lines: lines
        };
        this._signal("change", { data: delta });
        return range.end;
    }

    /**
     * Inserts a new line into the document at the current row's `position`.
     * This method also triggers the `'change'` event.
     *
     * @method insertNewLine
     * @param position {Position} The position to insert at.
     * @return {Position} Returns an object containing the final row and column, like this:<br/>
     *    ```
     *    {row: endRow, column: 0}
     *    ```
     */
    insertNewLine(position: Position): Position {
        position = $clipPosition(this, position);
        var line = this.$lines[position.row] || "";

        this.$lines[position.row] = line.substring(0, position.column);
        this.$lines.splice(position.row + 1, 0, line.substring(position.column, line.length));

        var end = {
            row: position.row + 1,
            column: 0
        };

        var delta = {
            action: "insertText",
            range: Range.fromPoints(position, end),
            text: this.getNewLineCharacter()
        };
        this._signal("change", { data: delta });

        return end;
    }

    /**
     * Inserts `text` into the `position` at the current row.
     *
     * @method insertInLine
     * This method also triggers the `'change'` event.
     * @param position {Position} The position to insert at.
     * @param {String} text A chunk of text
     * @return {Position} Returns an object containing the final row and column.
     */
    insertInLine(position: Position, text: string): Position {
        if (text.length == 0)
            return position;

        var line = this.$lines[position.row] || "";

        this.$lines[position.row] = line.substring(0, position.column) + text + line.substring(position.column);

        var end = {
            row: position.row,
            column: position.column + text.length
        };

        var delta: Delta = { action: "insertText", range: Range.fromPoints(position, end), text: text };

        /**
         * @event change
         * @param delta {Delta}
         */
        this._signal("change", { data: delta });

        return end;
    }

    /**
     * Removes the `range` from the document.
     *
     * @method remove
     * @param {Range} range A specified Range to remove
     * @return {Position} Returns the new `start` property of the range.
     * If `range` is empty, this function returns the unmodified value of `range.start`.
     */
    remove(range: Range): Position {
        if (!(range instanceof Range)) {
            range = Range.fromPoints(range.start, range.end);
        }
        // clip to document
        range.start = $clipPosition(this, range.start);
        range.end = $clipPosition(this, range.end);

        if (range.isEmpty())
            return range.start;

        var firstRow = range.start.row;
        var lastRow = range.end.row;

        if (range.isMultiLine()) {
            var firstFullRow = range.start.column == 0 ? firstRow : firstRow + 1;
            var lastFullRow = lastRow - 1;

            if (range.end.column > 0)
                this.removeInLine(lastRow, 0, range.end.column);

            if (lastFullRow >= firstFullRow)
                this._removeLines(firstFullRow, lastFullRow);

            if (firstFullRow != firstRow) {
                this.removeInLine(firstRow, range.start.column, this.getLine(firstRow).length);
                this.removeNewLine(range.start.row);
            }
        }
        else {
            this.removeInLine(firstRow, range.start.column, range.end.column);
        }
        return range.start;
    }

    /**
     * Removes the specified columns from the `row`.
     * This method also triggers the `'change'` event.
     *
     * @method removeInLine
     * @param {Number} row The row to remove from
     * @param {Number} startColumn The column to start removing at 
     * @param {Number} endColumn The column to stop removing at
     * @return {Object} Returns an object containing `startRow` and `startColumn`, indicating the new row and column values.<br/>If `startColumn` is equal to `endColumn`, this function returns nothing.
     *
     */
    removeInLine(row: number, startColumn: number, endColumn: number) {
        if (startColumn === endColumn)
            return;

        var range = new Range(row, startColumn, row, endColumn);
        var line = this.getLine(row);
        var removed = line.substring(startColumn, endColumn);
        var newLine = line.substring(0, startColumn) + line.substring(endColumn, line.length);
        this.$lines.splice(row, 1, newLine);

        var delta = {
            action: "removeText",
            range: range,
            text: removed
        };
        this._signal("change", { data: delta });
        return range.start;
    }

    /**
     * Removes a range of full lines.
     * This method also triggers the `'change'` event.
     *
     * @method removeLines
     * @param firstRow {number} The first row to be removed.
     * @param lastRow {number} The last row to be removed.
     * @return {string[]} Returns all the removed lines.
     */
    removeLines(firstRow: number, lastRow: number): string[] {
        if (firstRow < 0 || lastRow >= this.getLength()) {
            throw new Error("Document.removeLines")
            // This returns a Position, so it is incompatible.
            // return this.remove(new Range(firstRow, 0, lastRow + 1, 0));
        }
        // This returns a string[].
        return this._removeLines(firstRow, lastRow);
    }

    private _removeLines(firstRow: number, lastRow: number): string[] {
        var range = new Range(firstRow, 0, lastRow + 1, 0);
        var removed = this.$lines.splice(firstRow, lastRow - firstRow + 1);

        var delta = {
            action: "removeLines",
            range: range,
            nl: this.getNewLineCharacter(),
            lines: removed
        };
        this._signal("change", { data: delta });
        return removed;
    }

    /**
     * Removes the new line between `row` and the row immediately following it.
     *This method also triggers the `'change'` event.
     * @method removeNewLine
     * @param row {number} The row to check.
     * @return {void}
     */
    removeNewLine(row: number): void {
        var firstLine = this.getLine(row);
        var secondLine = this.getLine(row + 1);

        var range = new Range(row, firstLine.length, row + 1, 0);
        var line = firstLine + secondLine;

        this.$lines.splice(row, 2, line);

        var delta = {
            action: "removeText",
            range: range,
            text: this.getNewLineCharacter()
        };
        this._signal("change", { data: delta });
    }

    /**
     * Replaces a range in the document with the new `text`.
     *
     * @method replace
     * @param range {Range} A specified Range to replace.
     * @param text {string} The new text to use as a replacement.
     * @return {Object} Returns an object containing the final row and column, like this:
     *     {row: endRow, column: 0}
     * If the text and range are empty, this function returns an object containing the current `range.start` value.
     * If the text is the exact same as what currently exists, this function returns an object containing the current `range.end` value.
     */
    replace(range: Range, text: string): Position {
        if (text.length == 0 && range.isEmpty())
            return range.start;

        // Shortcut: If the text we want to insert is the same as it is already
        // in the document, we don't have to replace anything.
        if (text == this.getTextRange(range))
            return range.end;

        this.remove(range);
        if (text) {
            var end = this.insert(range.start, text);
        }
        else {
            end = range.start;
        }

        return end;
    }

    /**
     * Applies all the changes previously accumulated.
     * These can be either `'includeText'`, `'insertLines'`, `'removeText'`, and `'removeLines'`.
     *
     * @method applyDeltas
     * @param deltas {Delta[]}
     * @return {void}
     */
    applyDeltas(deltas: Delta[]): void {
        for (var i = 0; i < deltas.length; i++) {
            var delta = deltas[i];
            var range = Range.fromPoints(delta.range.start, delta.range.end);

            if (delta.action == "insertLines")
                this.insertLines(range.start.row, delta.lines);
            else if (delta.action == "insertText")
                this.insert(range.start, delta.text);
            else if (delta.action == "removeLines")
                this._removeLines(range.start.row, range.end.row - 1);
            else if (delta.action == "removeText")
                this.remove(range);
        }
    }

    /**
    * Reverts any changes previously applied. These can be either `'includeText'`, `'insertLines'`, `'removeText'`, and `'removeLines'`.
    **/
    revertDeltas(deltas: { action: string; range: Range; lines: string[]; text: string }[]) {
        for (var i = deltas.length - 1; i >= 0; i--) {
            var delta = deltas[i];

            var range = Range.fromPoints(delta.range.start, delta.range.end);

            if (delta.action == "insertLines")
                this._removeLines(range.start.row, range.end.row - 1);
            else if (delta.action == "insertText")
                this.remove(range);
            else if (delta.action == "removeLines")
                this._insertLines(range.start.row, delta.lines);
            else if (delta.action == "removeText")
                this.insert(range.start, delta.text);
        }
    }

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
     * @method indexToPosition
     * @param index {number} An index to convert
     * @param startRow {number} The row from which to start the conversion
     * @return {Position} A `{row, column}` object of the `index` position.
     */
    indexToPosition(index: number, startRow: number): Position {
        var lines = this.$lines || this.getAllLines();
        var newlineLength = this.getNewLineCharacter().length;
        for (var i = startRow || 0, l = lines.length; i < l; i++) {
            index -= lines[i].length + newlineLength;
            if (index < 0)
                return { row: i, column: index + lines[i].length + newlineLength };
        }
        return { row: l - 1, column: lines[l - 1].length };
    }

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
     * @method positionToIndex
     * @param {Position} pos The `{row, column}` to convert.
     * @param startRow {number} The row from which to start the conversion
     * @return {number} The index position in the document.
     */
    positionToIndex(pos: Position, startRow: number): number {
        var lines = this.$lines || this.getAllLines();
        var newlineLength = this.getNewLineCharacter().length;
        var index = 0;
        var row = Math.min(pos.row, lines.length);
        for (var i = startRow || 0; i < row; ++i)
            index += lines[i].length + newlineLength;

        return index + pos.column;
    }
}
