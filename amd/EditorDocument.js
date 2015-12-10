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
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", './Anchor', './lib/event_emitter', './Range'], function (require, exports, Anchor_1, event_emitter_1, Range_1) {
    var $split = (function () {
        function foo(text) {
            return text.replace(/\r\n|\r/g, "\n").split("\n");
        }
        function bar(text) {
            return text.split(/\r\n|\r|\n/);
        }
        if ("aaa".split(/a/).length === 0) {
            return foo;
        }
        else {
            return bar;
        }
    })();
    function $clipPosition(doc, position) {
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
     * @class EditorDocument
     */
    var EditorDocument = (function (_super) {
        __extends(EditorDocument, _super);
        /**
         * @class EditorDocument
         * @constructor
         * @param text {string | Array<string>}
         */
        function EditorDocument(text) {
            _super.call(this);
            this.$lines = [];
            this.$autoNewLine = "";
            this.$newLineMode = "auto";
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
         * Replaces all the lines in the current `EditorDocument` with the value of `text`.
         *
         * @method setValue
         * @param text {string} The text to use
         * @return {void}
         */
        EditorDocument.prototype.setValue = function (text) {
            var len = this.getLength();
            this.remove(new Range_1.default(0, 0, len, this.getLine(len - 1).length));
            this.insert({ row: 0, column: 0 }, text);
        };
        /**
         * Returns all the lines in the document as a single string, joined by the new line character.
         *
         * @method getValue
         * @return {string}
         */
        EditorDocument.prototype.getValue = function () {
            return this.getAllLines().join(this.getNewLineCharacter());
        };
        /**
         * Creates a new `Anchor` to define a floating point in the document.
         * @method createAnchor
         * @param {number} row The row number to use
         * @param {number} column The column number to use
         * @return {Anchor}
         */
        EditorDocument.prototype.createAnchor = function (row, column) {
            return new Anchor_1.default(this, row, column);
        };
        /**
         * Splits a string of text on any newline (`\n`) or carriage-return ('\r') characters.
         *
         * @method $split
         * @param {string} text The text to work with
         * @return {void}
         * @private
         */
        EditorDocument.prototype.$detectNewLine = function (text) {
            var match = text.match(/^.*?(\r\n|\r|\n)/m);
            this.$autoNewLine = match ? match[1] : "\n";
            this._signal("changeNewLineMode");
        };
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
        EditorDocument.prototype.getNewLineCharacter = function () {
            switch (this.$newLineMode) {
                case "windows":
                    return "\r\n";
                case "unix":
                    return "\n";
                default:
                    return this.$autoNewLine || "\n";
            }
        };
        /**
         * Sets the new line mode.
         *
         * @method setNewLineMode
         * @param {string} newLineMode [The newline mode to use; can be either `windows`, `unix`, or `auto`]{: #EditorDocument.setNewLineMode.param}
         * @return {void}
         */
        EditorDocument.prototype.setNewLineMode = function (newLineMode) {
            if (this.$newLineMode === newLineMode) {
                return;
            }
            this.$newLineMode = newLineMode;
            this._signal("changeNewLineMode");
        };
        /**
         * Returns the type of newlines being used; either `windows`, `unix`, or `auto`.
         *
         * @method getNewLineMode
         * @return {string}
         */
        EditorDocument.prototype.getNewLineMode = function () {
            return this.$newLineMode;
        };
        /**
         * Returns `true` if `text` is a newline character (either `\r\n`, `\r`, or `\n`).
         *
         * @method isNewLine
         * @param text {string} The text to check
         * @return {boolean}
         */
        EditorDocument.prototype.isNewLine = function (text) {
            return (text == "\r\n" || text == "\r" || text == "\n");
        };
        /**
         * Returns a verbatim copy of the given line as it is in the document.
         *
         * @method getLine
         * @param row {Number} The row index to retrieve.
         * @return {string}
         */
        EditorDocument.prototype.getLine = function (row) {
            return this.$lines[row] || "";
        };
        /**
         * Returns an array of strings of the rows between `firstRow` and `lastRow`.
         * This function is inclusive of `lastRow`.
         *
         * @param {Number} firstRow The first row index to retrieve
         * @param {Number} lastRow The final row index to retrieve
         * @return {string[]}
         */
        EditorDocument.prototype.getLines = function (firstRow, lastRow) {
            return this.$lines.slice(firstRow, lastRow + 1);
        };
        /**
         * Returns all lines in the document as string array.
         *
         * @method getAllLines()
         * @return {string[]}
         */
        EditorDocument.prototype.getAllLines = function () {
            return this.getLines(0, this.getLength());
        };
        /**
         * Returns the number of rows in the document.
         *
         * @method getLength
         * @return {number}
         */
        EditorDocument.prototype.getLength = function () {
            return this.$lines.length;
        };
        /**
         * Given a range within the document, returns all the text within that range as a single string.
         *
         * @method getTextRange
         * @param range {Range} The range to work with.
         * @return {string}
         */
        EditorDocument.prototype.getTextRange = function (range) {
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
        };
        /**
         * Inserts a block of `text` at the indicated `position`.
         *
         * @method insert
         * @param {Object} position The position to start inserting at; it's an object that looks like `{ row: row, column: column}`
         * @param text {string} A chunk of text to insert.
         * @return {Object} The position ({row, column}) of the last line of `text`. If the length of `text` is 0, this function simply returns `position`.
         */
        EditorDocument.prototype.insert = function (position, text) {
            if (!text || text.length === 0)
                return position;
            position = $clipPosition(this, position);
            // only detect new lines if the document has no line break yet
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
        * @return {Object} Contains the final row and column, like this:
        *   ```
        *   {row: endRow, column: 0}
        *   ```
        *   If `lines` is empty, this function returns an object containing the current row, and column, like this:
        *   ```
        *   {row: row, column: 0}
        *   ```
        *
        **/
        EditorDocument.prototype.insertLines = function (row, lines) {
            if (row >= this.getLength())
                return this.insert({ row: row, column: 0 }, "\n" + lines.join("\n"));
            return this._insertLines(Math.max(row, 0), lines);
        };
        EditorDocument.prototype._insertLines = function (row, lines) {
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
            var range = new Range_1.default(row, 0, row + lines.length, 0);
            var delta = {
                action: "insertLines",
                range: range,
                lines: lines
            };
            this._signal("change", { data: delta });
            return range.end;
        };
        /**
         * Inserts a new line into the document at the current row's `position`. This method also triggers the `'change'` event.
         * @param {Object} position The position to insert at
         * @return {Object} Returns an object containing the final row and column, like this:<br/>
         *    ```
         *    {row: endRow, column: 0}
         *    ```
         */
        EditorDocument.prototype.insertNewLine = function (position) {
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
                range: Range_1.default.fromPoints(position, end),
                text: this.getNewLineCharacter()
            };
            this._signal("change", { data: delta });
            return end;
        };
        /**
         * Inserts `text` into the `position` at the current row.
         *
         * @method insertInLine
         * This method also triggers the `'change'` event.
         * @param {Object} position The position to insert at.
         * @param {String} text A chunk of text
         * @return {Object} Returns an object containing the final row and column.
         */
        EditorDocument.prototype.insertInLine = function (position, text) {
            if (text.length == 0)
                return position;
            var line = this.$lines[position.row] || "";
            this.$lines[position.row] = line.substring(0, position.column) + text + line.substring(position.column);
            var end = {
                row: position.row,
                column: position.column + text.length
            };
            var delta = { action: "insertText", range: Range_1.default.fromPoints(position, end), text: text };
            this._signal("change", { data: delta });
            return end;
        };
        /**
         * Removes the `range` from the document.
         *
         * @method remove
         * @param {Range} range A specified Range to remove
         * @return {Position} Returns the new `start` property of the range.
         * If `range` is empty, this function returns the unmodified value of `range.start`.
         */
        EditorDocument.prototype.remove = function (range) {
            if (!(range instanceof Range_1.default)) {
                range = Range_1.default.fromPoints(range.start, range.end);
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
        };
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
        EditorDocument.prototype.removeInLine = function (row, startColumn, endColumn) {
            if (startColumn === endColumn)
                return;
            var range = new Range_1.default(row, startColumn, row, endColumn);
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
        };
        /**
         * Removes a range of full lines.
         * This method also triggers the `'change'` event.
         *
         * @method removeLines
         * @param firstRow {number} The first row to be removed.
         * @param lastRow {number} The last row to be removed.
         * @return {string[]} Returns all the removed lines.
         */
        EditorDocument.prototype.removeLines = function (firstRow, lastRow) {
            if (firstRow < 0 || lastRow >= this.getLength()) {
                throw new Error("EditorDocument.removeLines");
            }
            // This returns a string[].
            return this._removeLines(firstRow, lastRow);
        };
        EditorDocument.prototype._removeLines = function (firstRow, lastRow) {
            var range = new Range_1.default(firstRow, 0, lastRow + 1, 0);
            var removed = this.$lines.splice(firstRow, lastRow - firstRow + 1);
            var delta = {
                action: "removeLines",
                range: range,
                nl: this.getNewLineCharacter(),
                lines: removed
            };
            this._signal("change", { data: delta });
            return removed;
        };
        /**
        * Removes the new line between `row` and the row immediately following it. This method also triggers the `'change'` event.
        * @param {Number} row The row to check
        *
        **/
        EditorDocument.prototype.removeNewLine = function (row) {
            var firstLine = this.getLine(row);
            var secondLine = this.getLine(row + 1);
            var range = new Range_1.default(row, firstLine.length, row + 1, 0);
            var line = firstLine + secondLine;
            this.$lines.splice(row, 2, line);
            var delta = {
                action: "removeText",
                range: range,
                text: this.getNewLineCharacter()
            };
            this._signal("change", { data: delta });
        };
        /**
        * Replaces a range in the document with the new `text`.
        * @param {Range} range A specified Range to replace
        * @param {String} text The new text to use as a replacement
        * @return {Object} Returns an object containing the final row and column, like this:
        *     {row: endRow, column: 0}
        * If the text and range are empty, this function returns an object containing the current `range.start` value.
        * If the text is the exact same as what currently exists, this function returns an object containing the current `range.end` value.
        *
        **/
        EditorDocument.prototype.replace = function (range, text) {
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
        };
        /**
        * Applies all the changes previously accumulated. These can be either `'includeText'`, `'insertLines'`, `'removeText'`, and `'removeLines'`.
        **/
        EditorDocument.prototype.applyDeltas = function (deltas) {
            for (var i = 0; i < deltas.length; i++) {
                var delta = deltas[i];
                var range = Range_1.default.fromPoints(delta.range.start, delta.range.end);
                if (delta.action == "insertLines")
                    this.insertLines(range.start.row, delta.lines);
                else if (delta.action == "insertText")
                    this.insert(range.start, delta.text);
                else if (delta.action == "removeLines")
                    this._removeLines(range.start.row, range.end.row - 1);
                else if (delta.action == "removeText")
                    this.remove(range);
            }
        };
        /**
        * Reverts any changes previously applied. These can be either `'includeText'`, `'insertLines'`, `'removeText'`, and `'removeLines'`.
        **/
        EditorDocument.prototype.revertDeltas = function (deltas) {
            for (var i = deltas.length - 1; i >= 0; i--) {
                var delta = deltas[i];
                var range = Range_1.default.fromPoints(delta.range.start, delta.range.end);
                if (delta.action == "insertLines")
                    this._removeLines(range.start.row, range.end.row - 1);
                else if (delta.action == "insertText")
                    this.remove(range);
                else if (delta.action == "removeLines")
                    this._insertLines(range.start.row, delta.lines);
                else if (delta.action == "removeText")
                    this.insert(range.start, delta.text);
            }
        };
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
         * @return {Object} A `{row, column}` object of the `index` position
         */
        EditorDocument.prototype.indexToPosition = function (index, startRow) {
            var lines = this.$lines || this.getAllLines();
            var newlineLength = this.getNewLineCharacter().length;
            for (var i = startRow || 0, l = lines.length; i < l; i++) {
                index -= lines[i].length + newlineLength;
                if (index < 0)
                    return { row: i, column: index + lines[i].length + newlineLength };
            }
            return { row: l - 1, column: lines[l - 1].length };
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
         * @return {Number} The index position in the document
         */
        EditorDocument.prototype.positionToIndex = function (pos, startRow) {
            var lines = this.$lines || this.getAllLines();
            var newlineLength = this.getNewLineCharacter().length;
            var index = 0;
            var row = Math.min(pos.row, lines.length);
            for (var i = startRow || 0; i < row; ++i)
                index += lines[i].length + newlineLength;
            return index + pos.column;
        };
        return EditorDocument;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = EditorDocument;
});
