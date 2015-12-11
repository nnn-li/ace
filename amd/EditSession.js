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
define(["require", "exports", "./lib/lang", "./config", "./lib/event_emitter", "./FoldLine", "./Fold", "./Selection", "./mode/Mode", "./Range", "./EditorDocument", "./BackgroundTokenizer", "./SearchHighlight", './lib/asserts', "./edit_session/BracketMatch", './TokenIterator'], function (require, exports, lang_1, config_1, event_emitter_1, FoldLine_1, Fold_1, Selection_1, Mode_1, Range_1, EditorDocument_1, BackgroundTokenizer_1, SearchHighlight_1, asserts_1, BracketMatch_1, TokenIterator_1) {
    // "Tokens"
    var CHAR = 1, CHAR_EXT = 2, PLACEHOLDER_START = 3, PLACEHOLDER_BODY = 4, PUNCTUATION = 9, SPACE = 10, TAB = 11, TAB_SPACE = 12;
    // For every keystroke this gets called once per char in the whole doc!!
    // Wouldn't hurt to make it a bit faster for c >= 0x1100
    function isFullWidth(c) {
        if (c < 0x1100)
            return false;
        return c >= 0x1100 && c <= 0x115F ||
            c >= 0x11A3 && c <= 0x11A7 ||
            c >= 0x11FA && c <= 0x11FF ||
            c >= 0x2329 && c <= 0x232A ||
            c >= 0x2E80 && c <= 0x2E99 ||
            c >= 0x2E9B && c <= 0x2EF3 ||
            c >= 0x2F00 && c <= 0x2FD5 ||
            c >= 0x2FF0 && c <= 0x2FFB ||
            c >= 0x3000 && c <= 0x303E ||
            c >= 0x3041 && c <= 0x3096 ||
            c >= 0x3099 && c <= 0x30FF ||
            c >= 0x3105 && c <= 0x312D ||
            c >= 0x3131 && c <= 0x318E ||
            c >= 0x3190 && c <= 0x31BA ||
            c >= 0x31C0 && c <= 0x31E3 ||
            c >= 0x31F0 && c <= 0x321E ||
            c >= 0x3220 && c <= 0x3247 ||
            c >= 0x3250 && c <= 0x32FE ||
            c >= 0x3300 && c <= 0x4DBF ||
            c >= 0x4E00 && c <= 0xA48C ||
            c >= 0xA490 && c <= 0xA4C6 ||
            c >= 0xA960 && c <= 0xA97C ||
            c >= 0xAC00 && c <= 0xD7A3 ||
            c >= 0xD7B0 && c <= 0xD7C6 ||
            c >= 0xD7CB && c <= 0xD7FB ||
            c >= 0xF900 && c <= 0xFAFF ||
            c >= 0xFE10 && c <= 0xFE19 ||
            c >= 0xFE30 && c <= 0xFE52 ||
            c >= 0xFE54 && c <= 0xFE66 ||
            c >= 0xFE68 && c <= 0xFE6B ||
            c >= 0xFF01 && c <= 0xFF60 ||
            c >= 0xFFE0 && c <= 0xFFE6;
    }
    /**
     * @class EditSession
     * @extends EventEmitterClass
     */
    var EditSession = (function (_super) {
        __extends(EditSession, _super);
        /**
         * @class EditSession
         * @constructor
         * @param doc {EditorDocument}
         * @param [mode]
         * @param [cb]
         */
        function EditSession(doc, mode, cb) {
            _super.call(this);
            this.$breakpoints = [];
            this.$decorations = [];
            this.$frontMarkers = {};
            this.$backMarkers = {};
            this.$markerId = 1;
            this.$undoSelect = true;
            this.$defaultUndoManager = { undo: function () { }, redo: function () { }, reset: function () { } };
            this.$overwrite = false;
            /**
             *
             */
            this.$modes = {};
            /**
             *
             */
            this.$mode = null;
            this.$modeId = null;
            this.$scrollTop = 0;
            this.$scrollLeft = 0;
            this.$wrapLimit = 80;
            this.$useWrapMode = false;
            this.$wrapLimitRange = {
                min: null,
                max: null
            };
            this.$onChange = this.onChange.bind(this);
            this.lineWidgets = null;
            /**
             * A number is a marker identifier, null indicates that no such marker exists.
             */
            this.$selectionMarker = null;
            this.$bracketMatcher = new BracketMatch_1.default(this);
            // structured folding
            this.$foldStyles = {
                "manual": 1,
                "markbegin": 1,
                "markbeginend": 1
            };
            this.$foldStyle = "markbegin";
            this.$foldData = [];
            this.$foldData.toString = function () {
                return this.join("\n");
            };
            this.on("changeFold", this.onChangeFold.bind(this));
            this.setDocument(doc);
            this.selection = new Selection_1.default(this);
            config_1.resetOptions(this);
            this.setMode(mode, cb);
            config_1._signal("session", this);
        }
        /**
         * Sets the `EditSession` to point to a new `EditorDocument`.
         * If a `BackgroundTokenizer` exists, it also points to `doc`.
         *
         * @method setDocument
         * @param doc {EditorDocument} The new `EditorDocument` to use.
         * @return {void}
         */
        EditSession.prototype.setDocument = function (doc) {
            if (!(doc instanceof EditorDocument_1.default)) {
                throw new Error("doc must be a EditorDocument");
            }
            if (this.doc) {
                this.doc.off("change", this.$onChange);
            }
            this.doc = doc;
            doc.on("change", this.$onChange);
            if (this.bgTokenizer) {
                this.bgTokenizer.setDocument(this.getDocument());
            }
            this.resetCaches();
        };
        /**
         * Returns the `EditorDocument` associated with this session.
         *
         * @method getDocument
         * @return {EditorDocument}
         */
        EditSession.prototype.getDocument = function () {
            return this.doc;
        };
        /**
         * @method $resetRowCache
         * @param docRow {number} The row to work with.
         * @return {void}
         * @private
         */
        EditSession.prototype.$resetRowCache = function (docRow) {
            if (!docRow) {
                this.$docRowCache = [];
                this.$screenRowCache = [];
                return;
            }
            var l = this.$docRowCache.length;
            var i = this.$getRowCacheIndex(this.$docRowCache, docRow) + 1;
            if (l > i) {
                this.$docRowCache.splice(i, l);
                this.$screenRowCache.splice(i, l);
            }
        };
        EditSession.prototype.$getRowCacheIndex = function (cacheArray, val) {
            var low = 0;
            var hi = cacheArray.length - 1;
            while (low <= hi) {
                var mid = (low + hi) >> 1;
                var c = cacheArray[mid];
                if (val > c) {
                    low = mid + 1;
                }
                else if (val < c) {
                    hi = mid - 1;
                }
                else {
                    return mid;
                }
            }
            return low - 1;
        };
        EditSession.prototype.resetCaches = function () {
            this.$modified = true;
            this.$wrapData = [];
            this.$rowLengthCache = [];
            this.$resetRowCache(0);
            if (this.bgTokenizer) {
                this.bgTokenizer.start(0);
            }
        };
        EditSession.prototype.onChangeFold = function (e) {
            var fold = e.data;
            this.$resetRowCache(fold.start.row);
        };
        EditSession.prototype.onChange = function (e, doc) {
            var delta = e.data;
            this.$modified = true;
            this.$resetRowCache(delta.range.start.row);
            var removedFolds = this.$updateInternalDataOnChange(e);
            if (!this.$fromUndo && this.$undoManager && !delta.ignore) {
                this.$deltasDoc.push(delta);
                if (removedFolds && removedFolds.length != 0) {
                    this.$deltasFold.push({
                        action: "removeFolds",
                        folds: removedFolds
                    });
                }
                this.$informUndoManager.schedule();
            }
            this.bgTokenizer.$updateOnChange(delta);
            this._signal("change", e);
        };
        /**
         * Sets the session text.
         * @method setValue
         * @param text {string} The new text to place.
         * @return {void}
         * @private
         */
        EditSession.prototype.setValue = function (text) {
            this.doc.setValue(text);
            this.selection.moveTo(0, 0);
            this.$resetRowCache(0);
            this.$deltas = [];
            this.$deltasDoc = [];
            this.$deltasFold = [];
            this.setUndoManager(this.$undoManager);
            this.getUndoManager().reset();
        };
        /**
         * Returns the current EditorDocument as a string.
         *
         * @method toString
         * @return {string}
         * @alias EditSession.getValue
         */
        EditSession.prototype.toString = function () {
            return this.getValue();
        };
        /**
         * Returns the current EditorDocument as a string.
         *
         * @method getValue
         * @return {string}
         * @alias EditSession.toString
         */
        EditSession.prototype.getValue = function () {
            return this.doc.getValue();
        };
        /**
         * Returns the current selection.
         *
         * @method getSelection
         * @return {Selection}
         */
        EditSession.prototype.getSelection = function () {
            return this.selection;
        };
        /**
         * Sets the current selection.
         *
         * @method setSelection
         * @param selection {Selection}
         * @return {void}
         */
        EditSession.prototype.setSelection = function (selection) {
            this.selection = selection;
        };
        /**
         * @method getState
         * @param row {number} The row to start at.
         * @return {string}
         */
        EditSession.prototype.getState = function (row) {
            return this.bgTokenizer.getState(row);
        };
        /**
         * Starts tokenizing at the row indicated. Returns a list of objects of the tokenized rows.
         * @method getTokens
         * @param row {number} The row to start at.
         */
        EditSession.prototype.getTokens = function (row) {
            return this.bgTokenizer.getTokens(row);
        };
        /**
         * Returns an object indicating the token at the current row.
         * The object has two properties: `index` and `start`.
         *
         * @method getTokenAt
         * @param {Number} row The row number to retrieve from
         * @param {Number} column The column number to retrieve from.
         */
        EditSession.prototype.getTokenAt = function (row, column) {
            var tokens = this.bgTokenizer.getTokens(row);
            var token;
            var c = 0;
            if (column == null) {
                i = tokens.length - 1;
                c = this.getLine(row).length;
            }
            else {
                for (var i = 0; i < tokens.length; i++) {
                    c += tokens[i].value.length;
                    if (c >= column)
                        break;
                }
            }
            token = tokens[i];
            if (!token)
                return null;
            token.index = i;
            token.start = c - token.value.length;
            return token;
        };
        /**
         * Sets the undo manager.
         *
         * @method setUndoManager
         * @param undoManager {UndoManager} The new undo manager.
         * @return {void}
         */
        EditSession.prototype.setUndoManager = function (undoManager) {
            this.$undoManager = undoManager;
            this.$deltas = [];
            this.$deltasDoc = [];
            this.$deltasFold = [];
            if (this.$informUndoManager)
                this.$informUndoManager.cancel();
            if (undoManager) {
                var self = this;
                this.$syncInformUndoManager = function () {
                    self.$informUndoManager.cancel();
                    if (self.$deltasFold.length) {
                        self.$deltas.push({
                            group: "fold",
                            deltas: self.$deltasFold
                        });
                        self.$deltasFold = [];
                    }
                    if (self.$deltasDoc.length) {
                        self.$deltas.push({
                            group: "doc",
                            deltas: self.$deltasDoc
                        });
                        self.$deltasDoc = [];
                    }
                    if (self.$deltas.length > 0) {
                        undoManager.execute({
                            action: "aceupdate",
                            args: [self.$deltas, self],
                            merge: self.mergeUndoDeltas
                        });
                    }
                    self.mergeUndoDeltas = false;
                    self.$deltas = [];
                };
                this.$informUndoManager = lang_1.delayedCall(this.$syncInformUndoManager);
            }
        };
        /**
         * Starts a new group in undo history.
         *
         * @method markUndoGroup
         * @return {void}
         */
        EditSession.prototype.markUndoGroup = function () {
            if (this.$syncInformUndoManager) {
                this.$syncInformUndoManager();
            }
        };
        /**
         * Returns the current undo manager.
         *
         * @method getUndoManager
         * @return {UndoManager}
         */
        EditSession.prototype.getUndoManager = function () {
            // FIXME: Want simple API, don't want to cast.
            return this.$undoManager || this.$defaultUndoManager;
        };
        /**
         * Returns the current value for tabs.
         * If the user is using soft tabs, this will be a series of spaces (defined by [[EditSession.getTabSize `getTabSize()`]]); otherwise it's simply `'\t'`.
         *
         * @method getTabString
         * @return {string}
         */
        EditSession.prototype.getTabString = function () {
            if (this.getUseSoftTabs()) {
                return lang_1.stringRepeat(" ", this.getTabSize());
            }
            else {
                return "\t";
            }
        };
        /**
         * Pass `true` to enable the use of soft tabs.
         * Soft tabs means you're using spaces instead of the tab character (`'\t'`).
         *
         * @method setUseSoftTabs
         * @param useSoftTabs {boolean} Value indicating whether or not to use soft tabs.
         * @return {EditSession}
         * @chainable
         */
        EditSession.prototype.setUseSoftTabs = function (useSoftTabs) {
            this.setOption("useSoftTabs", useSoftTabs);
            return this;
        };
        /**
         * Returns `true` if soft tabs are being used, `false` otherwise.
         *
         * @method getUseSoftTabs
         * @return {boolean}
         */
        EditSession.prototype.getUseSoftTabs = function () {
            // todo might need more general way for changing settings from mode, but this is ok for now
            return this.$useSoftTabs && !this.$mode.$indentWithTabs;
        };
        /**
        * Set the number of spaces that define a soft tab.
        * For example, passing in `4` transforms the soft tabs to be equivalent to four spaces.
        * This function also emits the `changeTabSize` event.
        * @param {Number} tabSize The new tab size
        **/
        EditSession.prototype.setTabSize = function (tabSize) {
            this.setOption("tabSize", tabSize);
        };
        /**
        * Returns the current tab size.
        **/
        EditSession.prototype.getTabSize = function () {
            return this.$tabSize;
        };
        /**
        * Returns `true` if the character at the position is a soft tab.
        * @param {Object} position The position to check
        *
        *
        **/
        EditSession.prototype.isTabStop = function (position) {
            return this.$useSoftTabs && (position.column % this.$tabSize === 0);
        };
        /**
        * Pass in `true` to enable overwrites in your session, or `false` to disable.
        *
        * If overwrites is enabled, any text you enter will type over any text after it. If the value of `overwrite` changes, this function also emites the `changeOverwrite` event.
        *
        * @param {Boolean} overwrite Defines whether or not to set overwrites
        *
        *
        **/
        EditSession.prototype.setOverwrite = function (overwrite) {
            this.setOption("overwrite", overwrite);
        };
        /**
        * Returns `true` if overwrites are enabled; `false` otherwise.
        **/
        EditSession.prototype.getOverwrite = function () {
            return this.$overwrite;
        };
        /**
        * Sets the value of overwrite to the opposite of whatever it currently is.
        **/
        EditSession.prototype.toggleOverwrite = function () {
            this.setOverwrite(!this.$overwrite);
        };
        /**
         * Adds `className` to the `row`, to be used for CSS stylings and whatnot.
         * @param {Number} row The row number
         * @param {String} className The class to add
         */
        EditSession.prototype.addGutterDecoration = function (row, className) {
            if (!this.$decorations[row]) {
                this.$decorations[row] = "";
            }
            this.$decorations[row] += " " + className;
            this._signal("changeBreakpoint", {});
        };
        /**
         * Removes `className` from the `row`.
         * @param {Number} row The row number
         * @param {String} className The class to add
         */
        EditSession.prototype.removeGutterDecoration = function (row, className) {
            this.$decorations[row] = (this.$decorations[row] || "").replace(" " + className, "");
            this._signal("changeBreakpoint", {});
        };
        /**
        * Returns an array of numbers, indicating which rows have breakpoints.
        * @return {[Number]}
        **/
        EditSession.prototype.getBreakpoints = function () {
            return this.$breakpoints;
        };
        /**
        * Sets a breakpoint on every row number given by `rows`. This function also emites the `'changeBreakpoint'` event.
        * @param {Array} rows An array of row indices
        *
        *
        *
        **/
        EditSession.prototype.setBreakpoints = function (rows) {
            this.$breakpoints = [];
            for (var i = 0; i < rows.length; i++) {
                this.$breakpoints[rows[i]] = "ace_breakpoint";
            }
            this._signal("changeBreakpoint", {});
        };
        /**
        * Removes all breakpoints on the rows. This function also emites the `'changeBreakpoint'` event.
        **/
        EditSession.prototype.clearBreakpoints = function () {
            this.$breakpoints = [];
            this._signal("changeBreakpoint", {});
        };
        /**
        * Sets a breakpoint on the row number given by `rows`. This function also emites the `'changeBreakpoint'` event.
        * @param {Number} row A row index
        * @param {String} className Class of the breakpoint
        *
        *
        **/
        EditSession.prototype.setBreakpoint = function (row, className) {
            if (className === undefined)
                className = "ace_breakpoint";
            if (className)
                this.$breakpoints[row] = className;
            else
                delete this.$breakpoints[row];
            this._signal("changeBreakpoint", {});
        };
        /**
        * Removes a breakpoint on the row number given by `rows`. This function also emites the `'changeBreakpoint'` event.
        * @param {Number} row A row index
        *
        *
        **/
        EditSession.prototype.clearBreakpoint = function (row) {
            delete this.$breakpoints[row];
            this._signal("changeBreakpoint", {});
        };
        /**
        * Adds a new marker to the given `Range`. If `inFront` is `true`, a front marker is defined, and the `'changeFrontMarker'` event fires; otherwise, the `'changeBackMarker'` event fires.
        * @param {Range} range Define the range of the marker
        * @param {String} clazz Set the CSS class for the marker
        * @param {Function | String} type Identify the type of the marker.
        * @param {Boolean} inFront Set to `true` to establish a front marker
        *
        *
        * @return {Number} The new marker id
        **/
        EditSession.prototype.addMarker = function (range, clazz, type, inFront) {
            var id = this.$markerId++;
            // FIXME: Need more type safety here.
            var marker = {
                range: range,
                type: type || "line",
                renderer: typeof type === "function" ? type : null,
                clazz: clazz,
                inFront: !!inFront,
                id: id
            };
            if (inFront) {
                this.$frontMarkers[id] = marker;
                this._signal("changeFrontMarker");
            }
            else {
                this.$backMarkers[id] = marker;
                this._signal("changeBackMarker");
            }
            return id;
        };
        /**
         * Adds a dynamic marker to the session.
         * @param {Object} marker object with update method
         * @param {Boolean} inFront Set to `true` to establish a front marker
         *
         *
         * @return {Object} The added marker
         **/
        EditSession.prototype.addDynamicMarker = function (marker, inFront) {
            if (!marker.update)
                return;
            var id = this.$markerId++;
            marker.id = id;
            marker.inFront = !!inFront;
            if (inFront) {
                this.$frontMarkers[id] = marker;
                this._signal("changeFrontMarker");
            }
            else {
                this.$backMarkers[id] = marker;
                this._signal("changeBackMarker");
            }
            return marker;
        };
        /**
        * Removes the marker with the specified ID. If this marker was in front, the `'changeFrontMarker'` event is emitted. If the marker was in the back, the `'changeBackMarker'` event is emitted.
        * @param {Number} markerId A number representing a marker
        *
        *
        *
        **/
        EditSession.prototype.removeMarker = function (markerId) {
            var marker = this.$frontMarkers[markerId] || this.$backMarkers[markerId];
            if (!marker)
                return;
            var markers = marker.inFront ? this.$frontMarkers : this.$backMarkers;
            if (marker) {
                delete (markers[markerId]);
                this._signal(marker.inFront ? "changeFrontMarker" : "changeBackMarker");
            }
        };
        /**
        * Returns an array containing the IDs of all the markers, either front or back.
        * @param {boolean} inFront If `true`, indicates you only want front markers; `false` indicates only back markers
        *
        * @return {Array}
        **/
        EditSession.prototype.getMarkers = function (inFront) {
            return inFront ? this.$frontMarkers : this.$backMarkers;
        };
        EditSession.prototype.highlight = function (re) {
            if (!this.$searchHighlight) {
                var highlight = new SearchHighlight_1.default(null, "ace_selected-word", "text");
                this.$searchHighlight = this.addDynamicMarker(highlight);
            }
            this.$searchHighlight.setRegexp(re);
        };
        EditSession.prototype.highlightLines = function (startRow, endRow, clazz, inFront) {
            if (clazz === void 0) { clazz = "ace_step"; }
            var range = new Range_1.default(startRow, 0, endRow, Infinity);
            range.markerId = this.addMarker(range, clazz, "fullLine", inFront);
            return range;
        };
        /**
         * Sets annotations for the `EditSession`.
         * This functions emits the `'changeAnnotation'` event.
         *
         * @method setAnnotations
         * @param {Annotation[]} annotations A list of annotations.
         * @return {void}
         */
        EditSession.prototype.setAnnotations = function (annotations) {
            this.$annotations = annotations;
            this._signal("changeAnnotation", {});
        };
        /**
         * Returns the annotations for the `EditSession`.
         *
         * @method getAnnotations
         * @return {Annotation[]}
         */
        EditSession.prototype.getAnnotations = function () {
            return this.$annotations || [];
        };
        /**
         * Clears all the annotations for this session.
         * This function also triggers the `'changeAnnotation'` event.
         * This is called by the language modes when the worker terminates.
         */
        EditSession.prototype.clearAnnotations = function () {
            this.setAnnotations([]);
        };
        /**
        * If `text` contains either the newline (`\n`) or carriage-return ('\r') characters, `$autoNewLine` stores that value.
        * @param {String} text A block of text
        *
        **/
        EditSession.prototype.$detectNewLine = function (text) {
            var match = text.match(/^.*?(\r?\n)/m);
            if (match) {
                this.$autoNewLine = match[1];
            }
            else {
                this.$autoNewLine = "\n";
            }
        };
        /**
        * Given a starting row and column, this method returns the `Range` of the first word boundary it finds.
        * @param {Number} row The row to start at
        * @param {Number} column The column to start at
        *
        * @return {Range}
        **/
        EditSession.prototype.getWordRange = function (row, column) {
            var line = this.getLine(row);
            var inToken = false;
            if (column > 0)
                inToken = !!line.charAt(column - 1).match(this.tokenRe);
            if (!inToken)
                inToken = !!line.charAt(column).match(this.tokenRe);
            if (inToken)
                var re = this.tokenRe;
            else if (/^\s+$/.test(line.slice(column - 1, column + 1)))
                var re = /\s/;
            else
                var re = this.nonTokenRe;
            var start = column;
            if (start > 0) {
                do {
                    start--;
                } while (start >= 0 && line.charAt(start).match(re));
                start++;
            }
            var end = column;
            while (end < line.length && line.charAt(end).match(re)) {
                end++;
            }
            return new Range_1.default(row, start, row, end);
        };
        /**
        * Gets the range of a word, including its right whitespace.
        * @param {Number} row The row number to start from
        * @param {Number} column The column number to start from
        *
        * @return {Range}
        **/
        EditSession.prototype.getAWordRange = function (row, column) {
            var wordRange = this.getWordRange(row, column);
            var line = this.getLine(wordRange.end.row);
            while (line.charAt(wordRange.end.column).match(/[ \t]/)) {
                wordRange.end.column += 1;
            }
            return wordRange;
        };
        /**
        * {:EditorDocument.setNewLineMode.desc}
        * @param {String} newLineMode {:EditorDocument.setNewLineMode.param}
        *
        *
        * @related EditorDocument.setNewLineMode
        **/
        EditSession.prototype.setNewLineMode = function (newLineMode) {
            this.doc.setNewLineMode(newLineMode);
        };
        /**
        *
        * Returns the current new line mode.
        * @return {String}
        * @related EditorDocument.getNewLineMode
        **/
        EditSession.prototype.getNewLineMode = function () {
            return this.doc.getNewLineMode();
        };
        /**
        * Identifies if you want to use a worker for the `EditSession`.
        * @param {Boolean} useWorker Set to `true` to use a worker
        *
        **/
        EditSession.prototype.setUseWorker = function (useWorker) { this.setOption("useWorker", useWorker); };
        /**
        * Returns `true` if workers are being used.
        **/
        EditSession.prototype.getUseWorker = function () { return this.$useWorker; };
        /**
        * Reloads all the tokens on the current session. This function calls [[BackgroundTokenizer.start `BackgroundTokenizer.start ()`]] to all the rows; it also emits the `'tokenizerUpdate'` event.
        **/
        EditSession.prototype.onReloadTokenizer = function (e) {
            var rows = e.data;
            this.bgTokenizer.start(rows.first);
            this._signal("tokenizerUpdate", e);
        };
        /**
        * Sets a new text mode for the `EditSession`. This method also emits the `'changeMode'` event. If a [[BackgroundTokenizer `BackgroundTokenizer`]] is set, the `'tokenizerUpdate'` event is also emitted.
        * @param {TextMode} mode Set a new text mode
        * @param {cb} optional callback
        *
        **/
        EditSession.prototype.setMode = function (mode, cb) {
            if (mode && typeof mode === "object") {
                if (mode.getTokenizer) {
                    return this.$onChangeMode(mode);
                }
                var options = mode;
                var path = options.path;
            }
            else {
                path = mode || "ace/mode/text";
            }
            // this is needed if ace isn't on require path (e.g tests in node)
            if (!this.$modes["ace/mode/text"]) {
                this.$modes["ace/mode/text"] = new Mode_1.default();
            }
            if (this.$modes[path] && !options) {
                this.$onChangeMode(this.$modes[path]);
                cb && cb();
                return;
            }
            // load on demand
            this.$modeId = path;
            config_1.loadModule(["mode", path], function (m) {
                if (this.$modeId !== path)
                    return cb && cb();
                if (this.$modes[path] && !options)
                    return this.$onChangeMode(this.$modes[path]);
                if (m && m.Mode) {
                    m = new m.Mode(options);
                    if (!options) {
                        this.$modes[path] = m;
                        m.$id = path;
                    }
                    this.$onChangeMode(m);
                    cb && cb();
                }
            }.bind(this));
            // set mode to text until loading is finished
            if (!this.$mode) {
                this.$onChangeMode(this.$modes["ace/mode/text"], true);
            }
        };
        EditSession.prototype.$onChangeMode = function (mode, $isPlaceholder) {
            if (!$isPlaceholder) {
                this.$modeId = mode.$id;
            }
            if (this.$mode === mode) {
                // Nothing to do. Be idempotent.
                return;
            }
            this.$mode = mode;
            // TODO: Wouldn't it make more sense to stop the worker, then change the mode?
            this.$stopWorker();
            if (this.$useWorker) {
                this.$startWorker();
            }
            var tokenizer = mode.getTokenizer();
            if (tokenizer['addEventListener'] !== undefined) {
                var onReloadTokenizer = this.onReloadTokenizer.bind(this);
                tokenizer['addEventListener']("update", onReloadTokenizer);
            }
            if (!this.bgTokenizer) {
                this.bgTokenizer = new BackgroundTokenizer_1.default(tokenizer);
                var _self = this;
                this.bgTokenizer.on("update", function (event, bg) {
                    _self._signal("tokenizerUpdate", event);
                });
            }
            else {
                this.bgTokenizer.setTokenizer(tokenizer);
            }
            this.bgTokenizer.setDocument(this.getDocument());
            this.tokenRe = mode.tokenRe;
            this.nonTokenRe = mode.nonTokenRe;
            if (!$isPlaceholder) {
                this.$options.wrapMethod.set.call(this, this.$wrapMethod);
                this.$setFolding(mode.foldingRules);
                this.bgTokenizer.start(0);
                this._emit("changeMode");
            }
        };
        EditSession.prototype.$stopWorker = function () {
            if (this.$worker) {
                this.$worker.terminate();
            }
            this.$worker = null;
        };
        EditSession.prototype.$startWorker = function () {
            try {
                this.$worker = this.$mode.createWorker(this);
            }
            catch (e) {
                this.$worker = null;
            }
        };
        /**
        * Returns the current text mode.
        * @return {TextMode} The current text mode
        **/
        EditSession.prototype.getMode = function () {
            return this.$mode;
        };
        /**
        * This function sets the scroll top value. It also emits the `'changeScrollTop'` event.
        * @param {Number} scrollTop The new scroll top value
        *
        **/
        EditSession.prototype.setScrollTop = function (scrollTop) {
            // TODO: should we force integer lineheight instead? scrollTop = Math.round(scrollTop); 
            if (this.$scrollTop === scrollTop || isNaN(scrollTop)) {
                return;
            }
            this.$scrollTop = scrollTop;
            this._signal("changeScrollTop", scrollTop);
        };
        /**
        * [Returns the value of the distance between the top of the editor and the topmost part of the visible content.]{: #EditSession.getScrollTop}
        * @return {Number}
        **/
        EditSession.prototype.getScrollTop = function () {
            return this.$scrollTop;
        };
        /**
        * [Sets the value of the distance between the left of the editor and the leftmost part of the visible content.]{: #EditSession.setScrollLeft}
        **/
        EditSession.prototype.setScrollLeft = function (scrollLeft) {
            // scrollLeft = Math.round(scrollLeft);
            if (this.$scrollLeft === scrollLeft || isNaN(scrollLeft))
                return;
            this.$scrollLeft = scrollLeft;
            this._signal("changeScrollLeft", scrollLeft);
        };
        /**
        * [Returns the value of the distance between the left of the editor and the leftmost part of the visible content.]{: #EditSession.getScrollLeft}
        * @return {Number}
        **/
        EditSession.prototype.getScrollLeft = function () {
            return this.$scrollLeft;
        };
        /**
        * Returns the width of the screen.
        * @return {Number}
        **/
        EditSession.prototype.getScreenWidth = function () {
            this.$computeWidth();
            if (this.lineWidgets)
                return Math.max(this.getLineWidgetMaxWidth(), this.screenWidth);
            return this.screenWidth;
        };
        EditSession.prototype.getLineWidgetMaxWidth = function () {
            if (this.lineWidgetsWidth != null)
                return this.lineWidgetsWidth;
            var width = 0;
            this.lineWidgets.forEach(function (w) {
                if (w && w.screenWidth > width)
                    width = w.screenWidth;
            });
            return this.lineWidgetWidth = width;
        };
        EditSession.prototype.$computeWidth = function (force) {
            if (this.$modified || force) {
                this.$modified = false;
                if (this.$useWrapMode) {
                    return this.screenWidth = this.$wrapLimit;
                }
                var lines = this.doc.getAllLines();
                var cache = this.$rowLengthCache;
                var longestScreenLine = 0;
                var foldIndex = 0;
                var foldLine = this.$foldData[foldIndex];
                var foldStart = foldLine ? foldLine.start.row : Infinity;
                var len = lines.length;
                for (var i = 0; i < len; i++) {
                    if (i > foldStart) {
                        i = foldLine.end.row + 1;
                        if (i >= len)
                            break;
                        foldLine = this.$foldData[foldIndex++];
                        foldStart = foldLine ? foldLine.start.row : Infinity;
                    }
                    if (cache[i] == null)
                        cache[i] = this.$getStringScreenWidth(lines[i])[0];
                    if (cache[i] > longestScreenLine)
                        longestScreenLine = cache[i];
                }
                this.screenWidth = longestScreenLine;
            }
        };
        /**
         * Returns a verbatim copy of the given line as it is in the document
         * @param {Number} row The row to retrieve from
         *
        *
         * @return {String}
        *
        **/
        EditSession.prototype.getLine = function (row) {
            return this.doc.getLine(row);
        };
        /**
         * Returns an array of strings of the rows between `firstRow` and `lastRow`. This function is inclusive of `lastRow`.
         * @param {Number} firstRow The first row index to retrieve
         * @param {Number} lastRow The final row index to retrieve
         *
         * @return {[String]}
         *
         **/
        EditSession.prototype.getLines = function (firstRow, lastRow) {
            return this.doc.getLines(firstRow, lastRow);
        };
        /**
         * Returns the number of rows in the document.
         * @return {Number}
         **/
        EditSession.prototype.getLength = function () {
            return this.doc.getLength();
        };
        /**
         * {:EditorDocument.getTextRange.desc}
         * @param {Range} range The range to work with
         *
         * @return {string}
         **/
        EditSession.prototype.getTextRange = function (range) {
            return this.doc.getTextRange(range || this.selection.getRange());
        };
        /**
         * Inserts a block of `text` and the indicated `position`.
         * @param {Object} position The position {row, column} to start inserting at
         * @param {String} text A chunk of text to insert
         * @return {Object} The position of the last line of `text`. If the length of `text` is 0, this function simply returns `position`.
         *
         *
         **/
        EditSession.prototype.insert = function (position, text) {
            return this.doc.insert(position, text);
        };
        /**
         * Removes the `range` from the document.
         * @param {Range} range A specified Range to remove
         * @return {Object} The new `start` property of the range, which contains `startRow` and `startColumn`. If `range` is empty, this function returns the unmodified value of `range.start`.
         *
         * @related EditorDocument.remove
         *
         **/
        EditSession.prototype.remove = function (range) {
            return this.doc.remove(range);
        };
        /**
         * Reverts previous changes to your document.
         * @param {Array} deltas An array of previous changes
         * @param {Boolean} dontSelect [If `true`, doesn't select the range of where the change occured]{: #dontSelect}
         *
         *
         * @return {Range}
        **/
        EditSession.prototype.undoChanges = function (deltas, dontSelect) {
            if (!deltas.length)
                return;
            this.$fromUndo = true;
            var lastUndoRange = null;
            for (var i = deltas.length - 1; i != -1; i--) {
                var delta = deltas[i];
                if (delta.group == "doc") {
                    this.doc.revertDeltas(delta.deltas);
                    lastUndoRange =
                        this.$getUndoSelection(delta.deltas, true, lastUndoRange);
                }
                else {
                    delta.deltas.forEach(function (foldDelta) {
                        this.addFolds(foldDelta.folds);
                    }, this);
                }
            }
            this.$fromUndo = false;
            lastUndoRange &&
                this.$undoSelect &&
                !dontSelect &&
                this.selection.setSelectionRange(lastUndoRange);
            return lastUndoRange;
        };
        /**
         * Re-implements a previously undone change to your document.
         * @param {Array} deltas An array of previous changes
         * @param {Boolean} dontSelect {:dontSelect}
         *
        *
         * @return {Range}
        **/
        EditSession.prototype.redoChanges = function (deltas, dontSelect) {
            if (!deltas.length)
                return;
            this.$fromUndo = true;
            var lastUndoRange = null;
            for (var i = 0; i < deltas.length; i++) {
                var delta = deltas[i];
                if (delta.group == "doc") {
                    this.doc.applyDeltas(delta.deltas);
                    lastUndoRange =
                        this.$getUndoSelection(delta.deltas, false, lastUndoRange);
                }
            }
            this.$fromUndo = false;
            lastUndoRange &&
                this.$undoSelect &&
                !dontSelect &&
                this.selection.setSelectionRange(lastUndoRange);
            return lastUndoRange;
        };
        /**
         * Enables or disables highlighting of the range where an undo occurred.
         * @param {Boolean} enable If `true`, selects the range of the reinserted change
        *
        **/
        EditSession.prototype.setUndoSelect = function (enable) {
            this.$undoSelect = enable;
        };
        EditSession.prototype.$getUndoSelection = function (deltas, isUndo, lastUndoRange) {
            function isInsert(delta) {
                var insert = delta.action === "insertText" || delta.action === "insertLines";
                return isUndo ? !insert : insert;
            }
            var delta = deltas[0];
            var range;
            var point;
            var lastDeltaIsInsert = false;
            if (isInsert(delta)) {
                range = Range_1.default.fromPoints(delta.range.start, delta.range.end);
                lastDeltaIsInsert = true;
            }
            else {
                range = Range_1.default.fromPoints(delta.range.start, delta.range.start);
                lastDeltaIsInsert = false;
            }
            for (var i = 1; i < deltas.length; i++) {
                delta = deltas[i];
                if (isInsert(delta)) {
                    point = delta.range.start;
                    if (range.compare(point.row, point.column) === -1) {
                        range.setStart(delta.range.start.row, delta.range.start.column);
                    }
                    point = delta.range.end;
                    if (range.compare(point.row, point.column) === 1) {
                        range.setEnd(delta.range.end.row, delta.range.end.column);
                    }
                    lastDeltaIsInsert = true;
                }
                else {
                    point = delta.range.start;
                    if (range.compare(point.row, point.column) === -1) {
                        range = Range_1.default.fromPoints(delta.range.start, delta.range.start);
                    }
                    lastDeltaIsInsert = false;
                }
            }
            // Check if this range and the last undo range has something in common.
            // If true, merge the ranges.
            if (lastUndoRange != null) {
                if (Range_1.default.comparePoints(lastUndoRange.start, range.start) === 0) {
                    lastUndoRange.start.column += range.end.column - range.start.column;
                    lastUndoRange.end.column += range.end.column - range.start.column;
                }
                var cmp = lastUndoRange.compareRange(range);
                if (cmp === 1) {
                    range.setStart(lastUndoRange.start.row, lastUndoRange.start.column);
                }
                else if (cmp === -1) {
                    range.setEnd(lastUndoRange.end.row, lastUndoRange.start.column);
                }
            }
            return range;
        };
        /**
         * Replaces a range in the document with the new `text`.
         *
         * @method replace
         * @param range {Range} A specified Range to replace.
         * @param text {string} The new text to use as a replacement.
         * @return {Position}
         * If the text and range are empty, this function returns an object containing the current `range.start` value.
         * If the text is the exact same as what currently exists, this function returns an object containing the current `range.end` value.
         */
        EditSession.prototype.replace = function (range, text) {
            return this.doc.replace(range, text);
        };
        /**
        * Moves a range of text from the given range to the given position. `toPosition` is an object that looks like this:
         *  ```json
        *    { row: newRowLocation, column: newColumnLocation }
         *  ```
         * @param {Range} fromRange The range of text you want moved within the document
         * @param {Object} toPosition The location (row and column) where you want to move the text to
         * @return {Range} The new range where the text was moved to.
        *
        *
        *
        **/
        EditSession.prototype.moveText = function (fromRange, toPosition, copy) {
            var text = this.getTextRange(fromRange);
            var folds = this.getFoldsInRange(fromRange);
            var rowDiff;
            var colDiff;
            var toRange = Range_1.default.fromPoints(toPosition, toPosition);
            if (!copy) {
                this.remove(fromRange);
                rowDiff = fromRange.start.row - fromRange.end.row;
                colDiff = rowDiff ? -fromRange.end.column : fromRange.start.column - fromRange.end.column;
                if (colDiff) {
                    if (toRange.start.row == fromRange.end.row && toRange.start.column > fromRange.end.column) {
                        toRange.start.column += colDiff;
                    }
                    if (toRange.end.row == fromRange.end.row && toRange.end.column > fromRange.end.column) {
                        toRange.end.column += colDiff;
                    }
                }
                if (rowDiff && toRange.start.row >= fromRange.end.row) {
                    toRange.start.row += rowDiff;
                    toRange.end.row += rowDiff;
                }
            }
            toRange.end = this.insert(toRange.start, text);
            if (folds.length) {
                var oldStart = fromRange.start;
                var newStart = toRange.start;
                rowDiff = newStart.row - oldStart.row;
                colDiff = newStart.column - oldStart.column;
                this.addFolds(folds.map(function (x) {
                    x = x.clone();
                    if (x.start.row == oldStart.row) {
                        x.start.column += colDiff;
                    }
                    if (x.end.row == oldStart.row) {
                        x.end.column += colDiff;
                    }
                    x.start.row += rowDiff;
                    x.end.row += rowDiff;
                    return x;
                }));
            }
            return toRange;
        };
        /**
        * Indents all the rows, from `startRow` to `endRow` (inclusive), by prefixing each row with the token in `indentString`.
        *
        * If `indentString` contains the `'\t'` character, it's replaced by whatever is defined by [[EditSession.getTabString `getTabString()`]].
        * @param {Number} startRow Starting row
        * @param {Number} endRow Ending row
        * @param {String} indentString The indent token
        *
        *
        **/
        EditSession.prototype.indentRows = function (startRow, endRow, indentString) {
            indentString = indentString.replace(/\t/g, this.getTabString());
            for (var row = startRow; row <= endRow; row++)
                this.insert({ row: row, column: 0 }, indentString);
        };
        /**
        * Outdents all the rows defined by the `start` and `end` properties of `range`.
        * @param {Range} range A range of rows
        *
        *
        **/
        EditSession.prototype.outdentRows = function (range) {
            var rowRange = range.collapseRows();
            var deleteRange = new Range_1.default(0, 0, 0, 0);
            var size = this.getTabSize();
            for (var i = rowRange.start.row; i <= rowRange.end.row; ++i) {
                var line = this.getLine(i);
                deleteRange.start.row = i;
                deleteRange.end.row = i;
                for (var j = 0; j < size; ++j)
                    if (line.charAt(j) != ' ')
                        break;
                if (j < size && line.charAt(j) == '\t') {
                    deleteRange.start.column = j;
                    deleteRange.end.column = j + 1;
                }
                else {
                    deleteRange.start.column = 0;
                    deleteRange.end.column = j;
                }
                this.remove(deleteRange);
            }
        };
        EditSession.prototype.$moveLines = function (firstRow, lastRow, dir) {
            firstRow = this.getRowFoldStart(firstRow);
            lastRow = this.getRowFoldEnd(lastRow);
            if (dir < 0) {
                var row = this.getRowFoldStart(firstRow + dir);
                if (row < 0)
                    return 0;
                var diff = row - firstRow;
            }
            else if (dir > 0) {
                var row = this.getRowFoldEnd(lastRow + dir);
                if (row > this.doc.getLength() - 1)
                    return 0;
                var diff = row - lastRow;
            }
            else {
                firstRow = this.$clipRowToDocument(firstRow);
                lastRow = this.$clipRowToDocument(lastRow);
                var diff = lastRow - firstRow + 1;
            }
            var range = new Range_1.default(firstRow, 0, lastRow, Number.MAX_VALUE);
            var folds = this.getFoldsInRange(range).map(function (x) {
                x = x.clone();
                x.start.row += diff;
                x.end.row += diff;
                return x;
            });
            var lines = (dir === 0) ? this.doc.getLines(firstRow, lastRow) : this.doc.removeLines(firstRow, lastRow);
            this.doc.insertLines(firstRow + diff, lines);
            folds.length && this.addFolds(folds);
            return diff;
        };
        /**
        * Shifts all the lines in the document up one, starting from `firstRow` and ending at `lastRow`.
        * @param {Number} firstRow The starting row to move up
        * @param {Number} lastRow The final row to move up
        * @return {Number} If `firstRow` is less-than or equal to 0, this function returns 0. Otherwise, on success, it returns -1.
        *
        * @related EditorDocument.insertLines
        *
        **/
        EditSession.prototype.moveLinesUp = function (firstRow, lastRow) {
            return this.$moveLines(firstRow, lastRow, -1);
        };
        /**
        * Shifts all the lines in the document down one, starting from `firstRow` and ending at `lastRow`.
        * @param {Number} firstRow The starting row to move down
        * @param {Number} lastRow The final row to move down
        * @return {Number} If `firstRow` is less-than or equal to 0, this function returns 0. Otherwise, on success, it returns -1.
        *
        * @related EditorDocument.insertLines
        **/
        EditSession.prototype.moveLinesDown = function (firstRow, lastRow) {
            return this.$moveLines(firstRow, lastRow, 1);
        };
        /**
        * Duplicates all the text between `firstRow` and `lastRow`.
        * @param {Number} firstRow The starting row to duplicate
        * @param {Number} lastRow The final row to duplicate
        * @return {Number} Returns the number of new rows added; in other words, `lastRow - firstRow + 1`.
        *
        *
        **/
        EditSession.prototype.duplicateLines = function (firstRow, lastRow) {
            return this.$moveLines(firstRow, lastRow, 0);
        };
        EditSession.prototype.$clipRowToDocument = function (row) {
            return Math.max(0, Math.min(row, this.doc.getLength() - 1));
        };
        EditSession.prototype.$clipColumnToRow = function (row, column) {
            if (column < 0)
                return 0;
            return Math.min(this.doc.getLine(row).length, column);
        };
        EditSession.prototype.$clipPositionToDocument = function (row, column) {
            column = Math.max(0, column);
            if (row < 0) {
                row = 0;
                column = 0;
            }
            else {
                var len = this.doc.getLength();
                if (row >= len) {
                    row = len - 1;
                    column = this.doc.getLine(len - 1).length;
                }
                else {
                    column = Math.min(this.doc.getLine(row).length, column);
                }
            }
            return {
                row: row,
                column: column
            };
        };
        EditSession.prototype.$clipRangeToDocument = function (range) {
            if (range.start.row < 0) {
                range.start.row = 0;
                range.start.column = 0;
            }
            else {
                range.start.column = this.$clipColumnToRow(range.start.row, range.start.column);
            }
            var len = this.doc.getLength() - 1;
            if (range.end.row > len) {
                range.end.row = len;
                range.end.column = this.doc.getLine(len).length;
            }
            else {
                range.end.column = this.$clipColumnToRow(range.end.row, range.end.column);
            }
            return range;
        };
        /**
         * Sets whether or not line wrapping is enabled. If `useWrapMode` is different than the current value, the `'changeWrapMode'` event is emitted.
         * @param {Boolean} useWrapMode Enable (or disable) wrap mode
         *
        *
        **/
        EditSession.prototype.setUseWrapMode = function (useWrapMode) {
            if (useWrapMode != this.$useWrapMode) {
                this.$useWrapMode = useWrapMode;
                this.$modified = true;
                this.$resetRowCache(0);
                // If wrapMode is activaed, the wrapData array has to be initialized.
                if (useWrapMode) {
                    var len = this.getLength();
                    this.$wrapData = Array(len);
                    this.$updateWrapData(0, len - 1);
                }
                this._signal("changeWrapMode");
            }
        };
        /**
        * Returns `true` if wrap mode is being used; `false` otherwise.
        * @return {Boolean}
        **/
        EditSession.prototype.getUseWrapMode = function () {
            return this.$useWrapMode;
        };
        // Allow the wrap limit to move freely between min and max. Either
        // parameter can be null to allow the wrap limit to be unconstrained
        // in that direction. Or set both parameters to the same number to pin
        // the limit to that value.
        /**
         * Sets the boundaries of wrap. Either value can be `null` to have an unconstrained wrap, or, they can be the same number to pin the limit. If the wrap limits for `min` or `max` are different, this method also emits the `'changeWrapMode'` event.
         * @param {Number} min The minimum wrap value (the left side wrap)
         * @param {Number} max The maximum wrap value (the right side wrap)
         *
        *
        **/
        EditSession.prototype.setWrapLimitRange = function (min, max) {
            if (this.$wrapLimitRange.min !== min || this.$wrapLimitRange.max !== max) {
                this.$wrapLimitRange = {
                    min: min,
                    max: max
                };
                this.$modified = true;
                // This will force a recalculation of the wrap limit
                this._signal("changeWrapMode");
            }
        };
        /**
        * This should generally only be called by the renderer when a resize is detected.
        * @param {Number} desiredLimit The new wrap limit
        * @return {Boolean}
        *
        * @private
        **/
        EditSession.prototype.adjustWrapLimit = function (desiredLimit, $printMargin) {
            var limits = this.$wrapLimitRange;
            if (limits.max < 0)
                limits = { min: $printMargin, max: $printMargin };
            var wrapLimit = this.$constrainWrapLimit(desiredLimit, limits.min, limits.max);
            if (wrapLimit != this.$wrapLimit && wrapLimit > 1) {
                this.$wrapLimit = wrapLimit;
                this.$modified = true;
                if (this.$useWrapMode) {
                    this.$updateWrapData(0, this.getLength() - 1);
                    this.$resetRowCache(0);
                    this._signal("changeWrapLimit");
                }
                return true;
            }
            return false;
        };
        EditSession.prototype.$constrainWrapLimit = function (wrapLimit, min, max) {
            if (min)
                wrapLimit = Math.max(min, wrapLimit);
            if (max)
                wrapLimit = Math.min(max, wrapLimit);
            return wrapLimit;
        };
        /**
        * Returns the value of wrap limit.
        * @return {Number} The wrap limit.
        **/
        EditSession.prototype.getWrapLimit = function () {
            return this.$wrapLimit;
        };
        /**
         * Sets the line length for soft wrap in the editor. Lines will break
         *  at a minimum of the given length minus 20 chars and at a maximum
         *  of the given number of chars.
         * @param {number} limit The maximum line length in chars, for soft wrapping lines.
         */
        EditSession.prototype.setWrapLimit = function (limit) {
            this.setWrapLimitRange(limit, limit);
        };
        /**
        * Returns an object that defines the minimum and maximum of the wrap limit; it looks something like this:
        *
        *     { min: wrapLimitRange_min, max: wrapLimitRange_max }
        *
        * @return {Object}
        **/
        EditSession.prototype.getWrapLimitRange = function () {
            // Avoid unexpected mutation by returning a copy
            return {
                min: this.$wrapLimitRange.min,
                max: this.$wrapLimitRange.max
            };
        };
        EditSession.prototype.$updateInternalDataOnChange = function (e) {
            var useWrapMode = this.$useWrapMode;
            var len;
            var action = e.data.action;
            var firstRow = e.data.range.start.row;
            var lastRow = e.data.range.end.row;
            var start = e.data.range.start;
            var end = e.data.range.end;
            var removedFolds = null;
            if (action.indexOf("Lines") != -1) {
                if (action == "insertLines") {
                    lastRow = firstRow + (e.data.lines.length);
                }
                else {
                    lastRow = firstRow;
                }
                len = e.data.lines ? e.data.lines.length : lastRow - firstRow;
            }
            else {
                len = lastRow - firstRow;
            }
            this.$updating = true;
            if (len != 0) {
                if (action.indexOf("remove") != -1) {
                    this[useWrapMode ? "$wrapData" : "$rowLengthCache"].splice(firstRow, len);
                    var foldLines = this.$foldData;
                    removedFolds = this.getFoldsInRange(e.data.range);
                    this.removeFolds(removedFolds);
                    var foldLine = this.getFoldLine(end.row);
                    var idx = 0;
                    if (foldLine) {
                        foldLine.addRemoveChars(end.row, end.column, start.column - end.column);
                        foldLine.shiftRow(-len);
                        var foldLineBefore = this.getFoldLine(firstRow);
                        if (foldLineBefore && foldLineBefore !== foldLine) {
                            foldLineBefore.merge(foldLine);
                            foldLine = foldLineBefore;
                        }
                        idx = foldLines.indexOf(foldLine) + 1;
                    }
                    for (idx; idx < foldLines.length; idx++) {
                        var foldLine = foldLines[idx];
                        if (foldLine.start.row >= end.row) {
                            foldLine.shiftRow(-len);
                        }
                    }
                    lastRow = firstRow;
                }
                else {
                    var args = Array(len);
                    args.unshift(firstRow, 0);
                    var arr = useWrapMode ? this.$wrapData : this.$rowLengthCache;
                    arr.splice.apply(arr, args);
                    // If some new line is added inside of a foldLine, then split
                    // the fold line up.
                    var foldLines = this.$foldData;
                    var foldLine = this.getFoldLine(firstRow);
                    var idx = 0;
                    if (foldLine) {
                        var cmp = foldLine.range.compareInside(start.row, start.column);
                        // Inside of the foldLine range. Need to split stuff up.
                        if (cmp == 0) {
                            foldLine = foldLine.split(start.row, start.column);
                            foldLine.shiftRow(len);
                            foldLine.addRemoveChars(lastRow, 0, end.column - start.column);
                        }
                        else 
                        // Infront of the foldLine but same row. Need to shift column.
                        if (cmp == -1) {
                            foldLine.addRemoveChars(firstRow, 0, end.column - start.column);
                            foldLine.shiftRow(len);
                        }
                        // Nothing to do if the insert is after the foldLine.
                        idx = foldLines.indexOf(foldLine) + 1;
                    }
                    for (idx; idx < foldLines.length; idx++) {
                        var foldLine = foldLines[idx];
                        if (foldLine.start.row >= firstRow) {
                            foldLine.shiftRow(len);
                        }
                    }
                }
            }
            else {
                // Realign folds. E.g. if you add some new chars before a fold, the
                // fold should "move" to the right.
                len = Math.abs(e.data.range.start.column - e.data.range.end.column);
                if (action.indexOf("remove") != -1) {
                    // Get all the folds in the change range and remove them.
                    removedFolds = this.getFoldsInRange(e.data.range);
                    this.removeFolds(removedFolds);
                    len = -len;
                }
                var foldLine = this.getFoldLine(firstRow);
                if (foldLine) {
                    foldLine.addRemoveChars(firstRow, start.column, len);
                }
            }
            if (useWrapMode && this.$wrapData.length != this.doc.getLength()) {
                console.error("doc.getLength() and $wrapData.length have to be the same!");
            }
            this.$updating = false;
            if (useWrapMode)
                this.$updateWrapData(firstRow, lastRow);
            else
                this.$updateRowLengthCache(firstRow, lastRow);
            return removedFolds;
        };
        EditSession.prototype.$updateRowLengthCache = function (firstRow, lastRow, b) {
            this.$rowLengthCache[firstRow] = null;
            this.$rowLengthCache[lastRow] = null;
        };
        EditSession.prototype.$updateWrapData = function (firstRow, lastRow) {
            var lines = this.doc.getAllLines();
            var tabSize = this.getTabSize();
            var wrapData = this.$wrapData;
            var wrapLimit = this.$wrapLimit;
            var tokens;
            var foldLine;
            var row = firstRow;
            lastRow = Math.min(lastRow, lines.length - 1);
            while (row <= lastRow) {
                foldLine = this.getFoldLine(row, foldLine);
                if (!foldLine) {
                    tokens = this.$getDisplayTokens(lines[row]);
                    wrapData[row] = this.$computeWrapSplits(tokens, wrapLimit, tabSize);
                    row++;
                }
                else {
                    tokens = [];
                    foldLine.walk(function (placeholder, row, column, lastColumn) {
                        var walkTokens;
                        if (placeholder != null) {
                            walkTokens = this.$getDisplayTokens(placeholder, tokens.length);
                            walkTokens[0] = PLACEHOLDER_START;
                            for (var i = 1; i < walkTokens.length; i++) {
                                walkTokens[i] = PLACEHOLDER_BODY;
                            }
                        }
                        else {
                            walkTokens = this.$getDisplayTokens(lines[row].substring(lastColumn, column), tokens.length);
                        }
                        tokens = tokens.concat(walkTokens);
                    }.bind(this), foldLine.end.row, lines[foldLine.end.row].length + 1);
                    wrapData[foldLine.start.row] = this.$computeWrapSplits(tokens, wrapLimit, tabSize);
                    row = foldLine.end.row + 1;
                }
            }
        };
        EditSession.prototype.$computeWrapSplits = function (tokens, wrapLimit, tabSize) {
            if (tokens.length == 0) {
                return [];
            }
            var splits = [];
            var displayLength = tokens.length;
            var lastSplit = 0, lastDocSplit = 0;
            var isCode = this.$wrapAsCode;
            function addSplit(screenPos) {
                var displayed = tokens.slice(lastSplit, screenPos);
                // The document size is the current size - the extra width for tabs
                // and multipleWidth characters.
                var len = displayed.length;
                displayed.join("").
                    // Get all the TAB_SPACEs.
                    replace(/12/g, function () {
                    len -= 1;
                    return void 0;
                }).
                    // Get all the CHAR_EXT/multipleWidth characters.
                    replace(/2/g, function () {
                    len -= 1;
                    return void 0;
                });
                lastDocSplit += len;
                splits.push(lastDocSplit);
                lastSplit = screenPos;
            }
            while (displayLength - lastSplit > wrapLimit) {
                // This is, where the split should be.
                var split = lastSplit + wrapLimit;
                // If there is a space or tab at this split position, then making
                // a split is simple.
                if (tokens[split - 1] >= SPACE && tokens[split] >= SPACE) {
                    /* disabled see https://github.com/ajaxorg/ace/issues/1186
                    // Include all following spaces + tabs in this split as well.
                    while (tokens[split] >= SPACE) {
                        split ++;
                    } */
                    addSplit(split);
                    continue;
                }
                // === ELSE ===
                // Check if split is inside of a placeholder. Placeholder are
                // not splitable. Therefore, seek the beginning of the placeholder
                // and try to place the split beofre the placeholder's start.
                if (tokens[split] == PLACEHOLDER_START || tokens[split] == PLACEHOLDER_BODY) {
                    // Seek the start of the placeholder and do the split
                    // before the placeholder. By definition there always
                    // a PLACEHOLDER_START between split and lastSplit.
                    for (split; split != lastSplit - 1; split--) {
                        if (tokens[split] == PLACEHOLDER_START) {
                            // split++; << No incremental here as we want to
                            //  have the position before the Placeholder.
                            break;
                        }
                    }
                    // If the PLACEHOLDER_START is not the index of the
                    // last split, then we can do the split
                    if (split > lastSplit) {
                        addSplit(split);
                        continue;
                    }
                    // If the PLACEHOLDER_START IS the index of the last
                    // split, then we have to place the split after the
                    // placeholder. So, let's seek for the end of the placeholder.
                    split = lastSplit + wrapLimit;
                    for (split; split < tokens.length; split++) {
                        if (tokens[split] != PLACEHOLDER_BODY) {
                            break;
                        }
                    }
                    // If spilt == tokens.length, then the placeholder is the last
                    // thing in the line and adding a new split doesn't make sense.
                    if (split == tokens.length) {
                        break; // Breaks the while-loop.
                    }
                    // Finally, add the split...
                    addSplit(split);
                    continue;
                }
                // === ELSE ===
                // Search for the first non space/tab/placeholder/punctuation token backwards.
                var minSplit = Math.max(split - (isCode ? 10 : wrapLimit - (wrapLimit >> 2)), lastSplit - 1);
                while (split > minSplit && tokens[split] < PLACEHOLDER_START) {
                    split--;
                }
                if (isCode) {
                    while (split > minSplit && tokens[split] < PLACEHOLDER_START) {
                        split--;
                    }
                    while (split > minSplit && tokens[split] == PUNCTUATION) {
                        split--;
                    }
                }
                else {
                    while (split > minSplit && tokens[split] < SPACE) {
                        split--;
                    }
                }
                // If we found one, then add the split.
                if (split > minSplit) {
                    addSplit(++split);
                    continue;
                }
                // === ELSE ===
                split = lastSplit + wrapLimit;
                // The split is inside of a CHAR or CHAR_EXT token and no space
                // around -> force a split.
                addSplit(split);
            }
            return splits;
        };
        /**
        * Given a string, returns an array of the display characters, including tabs and spaces.
        * @param {String} str The string to check
        * @param {Number} offset The value to start at
        *
        *
        **/
        EditSession.prototype.$getDisplayTokens = function (str, offset) {
            var arr = [];
            var tabSize;
            offset = offset || 0;
            for (var i = 0; i < str.length; i++) {
                var c = str.charCodeAt(i);
                // Tab
                if (c == 9) {
                    tabSize = this.getScreenTabSize(arr.length + offset);
                    arr.push(TAB);
                    for (var n = 1; n < tabSize; n++) {
                        arr.push(TAB_SPACE);
                    }
                }
                else if (c == 32) {
                    arr.push(SPACE);
                }
                else if ((c > 39 && c < 48) || (c > 57 && c < 64)) {
                    arr.push(PUNCTUATION);
                }
                else if (c >= 0x1100 && isFullWidth(c)) {
                    arr.push(CHAR, CHAR_EXT);
                }
                else {
                    arr.push(CHAR);
                }
            }
            return arr;
        };
        /**
         * Calculates the width of the string `str` on the screen while assuming that the string starts at the first column on the screen.
        * @param {String} str The string to calculate the screen width of
        * @param {Number} maxScreenColumn
        * @param {Number} screenColumn
        * @return {[Number]} Returns an `int[]` array with two elements:<br/>
        * The first position indicates the number of columns for `str` on screen.<br/>
        * The second value contains the position of the document column that this function read until.
        *
        **/
        EditSession.prototype.$getStringScreenWidth = function (str, maxScreenColumn, screenColumn) {
            if (maxScreenColumn == 0)
                return [0, 0];
            if (maxScreenColumn == null)
                maxScreenColumn = Infinity;
            screenColumn = screenColumn || 0;
            var c;
            var column;
            for (column = 0; column < str.length; column++) {
                c = str.charCodeAt(column);
                // tab
                if (c == 9) {
                    screenColumn += this.getScreenTabSize(screenColumn);
                }
                else if (c >= 0x1100 && isFullWidth(c)) {
                    screenColumn += 2;
                }
                else {
                    screenColumn += 1;
                }
                if (screenColumn > maxScreenColumn) {
                    break;
                }
            }
            return [screenColumn, column];
        };
        /**
        * Returns number of screenrows in a wrapped line.
        * @param {Number} row The row number to check
        *
        * @return {Number}
        **/
        EditSession.prototype.getRowLength = function (row) {
            if (this.lineWidgets)
                var h = this.lineWidgets[row] && this.lineWidgets[row].rowCount || 0;
            else
                h = 0;
            if (!this.$useWrapMode || !this.$wrapData[row]) {
                return 1 + h;
            }
            else {
                return this.$wrapData[row].length + 1 + h;
            }
        };
        EditSession.prototype.getRowLineCount = function (row) {
            if (!this.$useWrapMode || !this.$wrapData[row]) {
                return 1;
            }
            else {
                return this.$wrapData[row].length + 1;
            }
        };
        EditSession.prototype.getRowWrapIndent = function (screenRow) {
            if (this.$useWrapMode) {
                var pos = this.screenToDocumentPosition(screenRow, Number.MAX_VALUE);
                var splits = this.$wrapData[pos.row];
                // FIXME: indent does not exists on number[]
                return splits.length && splits[0] < pos.column ? splits['indent'] : 0;
            }
            else {
                return 0;
            }
        };
        /**
         * Returns the position (on screen) for the last character in the provided screen row.
         * @param {Number} screenRow The screen row to check
         * @return {Number}
         *
         * @related EditSession.documentToScreenColumn
        **/
        EditSession.prototype.getScreenLastRowColumn = function (screenRow) {
            var pos = this.screenToDocumentPosition(screenRow, Number.MAX_VALUE);
            return this.documentToScreenColumn(pos.row, pos.column);
        };
        /**
        * For the given document row and column, this returns the column position of the last screen row.
        * @param {Number} docRow
        *
        * @param {Number} docColumn
        **/
        EditSession.prototype.getDocumentLastRowColumn = function (docRow, docColumn) {
            var screenRow = this.documentToScreenRow(docRow, docColumn);
            return this.getScreenLastRowColumn(screenRow);
        };
        /**
        * For the given document row and column, this returns the document position of the last row.
        * @param {Number} docRow
        * @param {Number} docColumn
        *
        *
        **/
        EditSession.prototype.getDocumentLastRowColumnPosition = function (docRow, docColumn) {
            var screenRow = this.documentToScreenRow(docRow, docColumn);
            return this.screenToDocumentPosition(screenRow, Number.MAX_VALUE / 10);
        };
        /**
        * For the given row, this returns the split data.
        * @return {String}
        **/
        EditSession.prototype.getRowSplitData = function (row) {
            if (!this.$useWrapMode) {
                return undefined;
            }
            else {
                return this.$wrapData[row];
            }
        };
        /**
         * The distance to the next tab stop at the specified screen column.
         * @methos getScreenTabSize
         * @param screenColumn {number} The screen column to check
         * @return {number}
         */
        EditSession.prototype.getScreenTabSize = function (screenColumn) {
            return this.$tabSize - screenColumn % this.$tabSize;
        };
        EditSession.prototype.screenToDocumentRow = function (screenRow, screenColumn) {
            return this.screenToDocumentPosition(screenRow, screenColumn).row;
        };
        EditSession.prototype.screenToDocumentColumn = function (screenRow, screenColumn) {
            return this.screenToDocumentPosition(screenRow, screenColumn).column;
        };
        /**
        * Converts characters coordinates on the screen to characters coordinates within the document. [This takes into account code folding, word wrap, tab size, and any other visual modifications.]{: #conversionConsiderations}
        * @param {number} screenRow The screen row to check
        * @param {number} screenColumn The screen column to check
        * @return {Object} The object returned has two properties: `row` and `column`.
        **/
        EditSession.prototype.screenToDocumentPosition = function (screenRow, screenColumn) {
            if (screenRow < 0) {
                return { row: 0, column: 0 };
            }
            var line;
            var docRow = 0;
            var docColumn = 0;
            var column;
            var row = 0;
            var rowLength = 0;
            var rowCache = this.$screenRowCache;
            var i = this.$getRowCacheIndex(rowCache, screenRow);
            var l = rowCache.length;
            if (l && i >= 0) {
                var row = rowCache[i];
                var docRow = this.$docRowCache[i];
                var doCache = screenRow > rowCache[l - 1];
            }
            else {
                var doCache = !l;
            }
            var maxRow = this.getLength() - 1;
            var foldLine = this.getNextFoldLine(docRow);
            var foldStart = foldLine ? foldLine.start.row : Infinity;
            while (row <= screenRow) {
                rowLength = this.getRowLength(docRow);
                if (row + rowLength > screenRow || docRow >= maxRow) {
                    break;
                }
                else {
                    row += rowLength;
                    docRow++;
                    if (docRow > foldStart) {
                        docRow = foldLine.end.row + 1;
                        foldLine = this.getNextFoldLine(docRow, foldLine);
                        foldStart = foldLine ? foldLine.start.row : Infinity;
                    }
                }
                if (doCache) {
                    this.$docRowCache.push(docRow);
                    this.$screenRowCache.push(row);
                }
            }
            if (foldLine && foldLine.start.row <= docRow) {
                line = this.getFoldDisplayLine(foldLine);
                docRow = foldLine.start.row;
            }
            else if (row + rowLength <= screenRow || docRow > maxRow) {
                // clip at the end of the document
                return {
                    row: maxRow,
                    column: this.getLine(maxRow).length
                };
            }
            else {
                line = this.getLine(docRow);
                foldLine = null;
            }
            if (this.$useWrapMode) {
                var splits = this.$wrapData[docRow];
                if (splits) {
                    var splitIndex = Math.floor(screenRow - row);
                    column = splits[splitIndex];
                    if (splitIndex > 0 && splits.length) {
                        docColumn = splits[splitIndex - 1] || splits[splits.length - 1];
                        line = line.substring(docColumn);
                    }
                }
            }
            docColumn += this.$getStringScreenWidth(line, screenColumn)[1];
            // We remove one character at the end so that the docColumn
            // position returned is not associated to the next row on the screen.
            if (this.$useWrapMode && docColumn >= column)
                docColumn = column - 1;
            if (foldLine)
                return foldLine.idxToPosition(docColumn);
            return { row: docRow, column: docColumn };
        };
        /**
        * Converts document coordinates to screen coordinates. {:conversionConsiderations}
        * @param {Number} docRow The document row to check
        * @param {Number} docColumn The document column to check
        * @return {Object} The object returned by this method has two properties: `row` and `column`.
        *
        * @related EditSession.screenToDocumentPosition
        **/
        EditSession.prototype.documentToScreenPosition = function (docRow, docColumn) {
            var pos;
            // Normalize the passed in arguments.
            if (typeof docColumn === "undefined") {
                pos = this.$clipPositionToDocument(docRow['row'], docRow['column']);
            }
            else {
                asserts_1.assert(typeof docRow === 'number', "docRow must be a number");
                asserts_1.assert(typeof docColumn === 'number', "docColumn must be a number");
                pos = this.$clipPositionToDocument(docRow, docColumn);
            }
            docRow = pos.row;
            docColumn = pos.column;
            asserts_1.assert(typeof docRow === 'number', "docRow must be a number");
            asserts_1.assert(typeof docColumn === 'number', "docColumn must be a number");
            var screenRow = 0;
            var foldStartRow = null;
            var fold = null;
            // Clamp the docRow position in case it's inside of a folded block.
            fold = this.getFoldAt(docRow, docColumn, 1);
            if (fold) {
                docRow = fold.start.row;
                docColumn = fold.start.column;
            }
            var rowEnd, row = 0;
            var rowCache = this.$docRowCache;
            var i = this.$getRowCacheIndex(rowCache, docRow);
            var l = rowCache.length;
            if (l && i >= 0) {
                var row = rowCache[i];
                var screenRow = this.$screenRowCache[i];
                var doCache = docRow > rowCache[l - 1];
            }
            else {
                var doCache = !l;
            }
            var foldLine = this.getNextFoldLine(row);
            var foldStart = foldLine ? foldLine.start.row : Infinity;
            while (row < docRow) {
                if (row >= foldStart) {
                    rowEnd = foldLine.end.row + 1;
                    if (rowEnd > docRow)
                        break;
                    foldLine = this.getNextFoldLine(rowEnd, foldLine);
                    foldStart = foldLine ? foldLine.start.row : Infinity;
                }
                else {
                    rowEnd = row + 1;
                }
                screenRow += this.getRowLength(row);
                row = rowEnd;
                if (doCache) {
                    this.$docRowCache.push(row);
                    this.$screenRowCache.push(screenRow);
                }
            }
            // Calculate the text line that is displayed in docRow on the screen.
            var textLine = "";
            // Check if the final row we want to reach is inside of a fold.
            if (foldLine && row >= foldStart) {
                textLine = this.getFoldDisplayLine(foldLine, docRow, docColumn);
                foldStartRow = foldLine.start.row;
            }
            else {
                textLine = this.getLine(docRow).substring(0, docColumn);
                foldStartRow = docRow;
            }
            // Clamp textLine if in wrapMode.
            if (this.$useWrapMode) {
                var wrapRow = this.$wrapData[foldStartRow];
                if (wrapRow) {
                    var screenRowOffset = 0;
                    while (textLine.length >= wrapRow[screenRowOffset]) {
                        screenRow++;
                        screenRowOffset++;
                    }
                    textLine = textLine.substring(wrapRow[screenRowOffset - 1] || 0, textLine.length);
                }
            }
            return {
                row: screenRow,
                column: this.$getStringScreenWidth(textLine)[0]
            };
        };
        /**
        * For the given document row and column, returns the screen column.
        * @param {Number} docRow
        * @param {Number} docColumn
        * @return {Number}
        *
        **/
        EditSession.prototype.documentToScreenColumn = function (docRow, docColumn) {
            return this.documentToScreenPosition(docRow, docColumn).column;
        };
        /**
        * For the given document row and column, returns the screen row.
        * @param {Number} docRow
        * @param {Number} docColumn
        **/
        EditSession.prototype.documentToScreenRow = function (docRow, docColumn) {
            return this.documentToScreenPosition(docRow, docColumn).row;
        };
        EditSession.prototype.documentToScreenRange = function (range) {
            var screenPosStart = this.documentToScreenPosition(range.start.row, range.start.column);
            var screenPosEnd = this.documentToScreenPosition(range.end.row, range.end.column);
            return new Range_1.default(screenPosStart.row, screenPosStart.column, screenPosEnd.row, screenPosEnd.column);
        };
        /**
        * Returns the length of the screen.
        * @return {Number}
        **/
        EditSession.prototype.getScreenLength = function () {
            var screenRows = 0;
            var fold = null;
            if (!this.$useWrapMode) {
                screenRows = this.getLength();
                // Remove the folded lines again.
                var foldData = this.$foldData;
                for (var i = 0; i < foldData.length; i++) {
                    fold = foldData[i];
                    screenRows -= fold.end.row - fold.start.row;
                }
            }
            else {
                var lastRow = this.$wrapData.length;
                var row = 0, i = 0;
                var fold = this.$foldData[i++];
                var foldStart = fold ? fold.start.row : Infinity;
                while (row < lastRow) {
                    var splits = this.$wrapData[row];
                    screenRows += splits ? splits.length + 1 : 1;
                    row++;
                    if (row > foldStart) {
                        row = fold.end.row + 1;
                        fold = this.$foldData[i++];
                        foldStart = fold ? fold.start.row : Infinity;
                    }
                }
            }
            // todo
            if (this.lineWidgets) {
                screenRows += this.$getWidgetScreenLength();
            }
            return screenRows;
        };
        /**
         * @private
         */
        EditSession.prototype.$setFontMetrics = function (fm) {
            // TODO?
        };
        EditSession.prototype.findMatchingBracket = function (position, chr) {
            return this.$bracketMatcher.findMatchingBracket(position, chr);
        };
        EditSession.prototype.getBracketRange = function (position) {
            return this.$bracketMatcher.getBracketRange(position);
        };
        EditSession.prototype.$findOpeningBracket = function (bracket, position, typeRe) {
            return this.$bracketMatcher.$findOpeningBracket(bracket, position, typeRe);
        };
        EditSession.prototype.$findClosingBracket = function (bracket, position, typeRe) {
            return this.$bracketMatcher.$findClosingBracket(bracket, position, typeRe);
        };
        /*
         * Looks up a fold at a given row/column. Possible values for side:
         *   -1: ignore a fold if fold.start = row/column
         *   +1: ignore a fold if fold.end = row/column
         */
        EditSession.prototype.getFoldAt = function (row, column, side) {
            var foldLine = this.getFoldLine(row);
            if (!foldLine)
                return null;
            var folds = foldLine.folds;
            for (var i = 0; i < folds.length; i++) {
                var fold = folds[i];
                if (fold.range.contains(row, column)) {
                    if (side === 1 && fold.range.isEnd(row, column)) {
                        continue;
                    }
                    else if (side === -1 && fold.range.isStart(row, column)) {
                        continue;
                    }
                    return fold;
                }
            }
        };
        /*
         * Returns all folds in the given range. Note, that this will return folds
         *
         */
        EditSession.prototype.getFoldsInRange = function (range) {
            var start = range.start;
            var end = range.end;
            var foldLines = this.$foldData;
            var foundFolds = [];
            start.column += 1;
            end.column -= 1;
            for (var i = 0; i < foldLines.length; i++) {
                var cmp = foldLines[i].range.compareRange(range);
                if (cmp == 2) {
                    // Range is before foldLine. No intersection. This means,
                    // there might be other foldLines that intersect.
                    continue;
                }
                else if (cmp == -2) {
                    // Range is after foldLine. There can't be any other foldLines then,
                    // so let's give up.
                    break;
                }
                var folds = foldLines[i].folds;
                for (var j = 0; j < folds.length; j++) {
                    var fold = folds[j];
                    cmp = fold.range.compareRange(range);
                    if (cmp == -2) {
                        break;
                    }
                    else if (cmp == 2) {
                        continue;
                    }
                    else 
                    // WTF-state: Can happen due to -1/+1 to start/end column.
                    if (cmp == 42) {
                        break;
                    }
                    foundFolds.push(fold);
                }
            }
            start.column -= 1;
            end.column += 1;
            return foundFolds;
        };
        EditSession.prototype.getFoldsInRangeList = function (ranges) {
            if (Array.isArray(ranges)) {
                var folds = [];
                ranges.forEach(function (range) {
                    folds = folds.concat(this.getFoldsInRange(range));
                }, this);
            }
            else {
                var folds = this.getFoldsInRange(ranges);
            }
            return folds;
        };
        /*
         * Returns all folds in the document
         */
        EditSession.prototype.getAllFolds = function () {
            var folds = [];
            var foldLines = this.$foldData;
            for (var i = 0; i < foldLines.length; i++)
                for (var j = 0; j < foldLines[i].folds.length; j++)
                    folds.push(foldLines[i].folds[j]);
            return folds;
        };
        /*
         * Returns the string between folds at the given position.
         * E.g.
         *  foo<fold>b|ar<fold>wolrd -> "bar"
         *  foo<fold>bar<fold>wol|rd -> "world"
         *  foo<fold>bar<fo|ld>wolrd -> <null>
         *
         * where | means the position of row/column
         *
         * The trim option determs if the return string should be trimed according
         * to the "side" passed with the trim value:
         *
         * E.g.
         *  foo<fold>b|ar<fold>wolrd -trim=-1> "b"
         *  foo<fold>bar<fold>wol|rd -trim=+1> "rld"
         *  fo|o<fold>bar<fold>wolrd -trim=00> "foo"
         */
        EditSession.prototype.getFoldStringAt = function (row, column, trim, foldLine) {
            foldLine = foldLine || this.getFoldLine(row);
            if (!foldLine)
                return null;
            var lastFold = {
                end: { column: 0 }
            };
            // TODO: Refactor to use getNextFoldTo function.
            var str;
            var fold;
            for (var i = 0; i < foldLine.folds.length; i++) {
                fold = foldLine.folds[i];
                var cmp = fold.range.compareEnd(row, column);
                if (cmp == -1) {
                    str = this.getLine(fold.start.row).substring(lastFold.end.column, fold.start.column);
                    break;
                }
                else if (cmp === 0) {
                    return null;
                }
                lastFold = fold;
            }
            if (!str)
                str = this.getLine(fold.start.row).substring(lastFold.end.column);
            if (trim == -1)
                return str.substring(0, column - lastFold.end.column);
            else if (trim == 1)
                return str.substring(column - lastFold.end.column);
            else
                return str;
        };
        EditSession.prototype.getFoldLine = function (docRow, startFoldLine) {
            var foldData = this.$foldData;
            var i = 0;
            if (startFoldLine)
                i = foldData.indexOf(startFoldLine);
            if (i == -1)
                i = 0;
            for (i; i < foldData.length; i++) {
                var foldLine = foldData[i];
                if (foldLine.start.row <= docRow && foldLine.end.row >= docRow) {
                    return foldLine;
                }
                else if (foldLine.end.row > docRow) {
                    return null;
                }
            }
            return null;
        };
        // returns the fold which starts after or contains docRow
        EditSession.prototype.getNextFoldLine = function (docRow, startFoldLine) {
            var foldData = this.$foldData;
            var i = 0;
            if (startFoldLine)
                i = foldData.indexOf(startFoldLine);
            if (i == -1)
                i = 0;
            for (i; i < foldData.length; i++) {
                var foldLine = foldData[i];
                if (foldLine.end.row >= docRow) {
                    return foldLine;
                }
            }
            return null;
        };
        EditSession.prototype.getFoldedRowCount = function (first, last) {
            var foldData = this.$foldData;
            var rowCount = last - first + 1;
            for (var i = 0; i < foldData.length; i++) {
                var foldLine = foldData[i], end = foldLine.end.row, start = foldLine.start.row;
                if (end >= last) {
                    if (start < last) {
                        if (start >= first)
                            rowCount -= last - start;
                        else
                            rowCount = 0; //in one fold
                    }
                    break;
                }
                else if (end >= first) {
                    if (start >= first)
                        rowCount -= end - start;
                    else
                        rowCount -= end - first + 1;
                }
            }
            return rowCount;
        };
        EditSession.prototype.$addFoldLine = function (foldLine) {
            this.$foldData.push(foldLine);
            this.$foldData.sort(function (a, b) {
                return a.start.row - b.start.row;
            });
            return foldLine;
        };
        /**
         * Adds a new fold.
         *
         * @return
         *      The new created Fold object or an existing fold object in case the
         *      passed in range fits an existing fold exactly.
         */
        EditSession.prototype.addFold = function (placeholder, range) {
            var foldData = this.$foldData;
            var added = false;
            var fold;
            if (placeholder instanceof Fold_1.default)
                fold = placeholder;
            else if (typeof placeholder === 'string') {
                fold = new Fold_1.default(range, placeholder);
                fold.collapseChildren = range.collapseChildren;
            }
            else {
                throw new Error("placeholder must be a string or a Fold.");
            }
            // FIXME: $clipRangeToDocument?
            // fold.range = this.clipRange(fold.range);
            fold.range = this.$clipRangeToDocument(fold.range);
            var startRow = fold.start.row;
            var startColumn = fold.start.column;
            var endRow = fold.end.row;
            var endColumn = fold.end.column;
            // --- Some checking ---
            if (!(startRow < endRow ||
                startRow == endRow && startColumn <= endColumn - 2))
                throw new Error("The range has to be at least 2 characters width");
            var startFold = this.getFoldAt(startRow, startColumn, 1);
            var endFold = this.getFoldAt(endRow, endColumn, -1);
            if (startFold && endFold == startFold)
                return startFold.addSubFold(fold);
            if ((startFold && !startFold.range.isStart(startRow, startColumn))
                || (endFold && !endFold.range.isEnd(endRow, endColumn))) {
                throw new Error("A fold can't intersect already existing fold" + fold.range + startFold.range);
            }
            // Check if there are folds in the range we create the new fold for.
            var folds = this.getFoldsInRange(fold.range);
            if (folds.length > 0) {
                // Remove the folds from fold data.
                this.removeFolds(folds);
                // Add the removed folds as subfolds on the new fold.
                folds.forEach(function (subFold) {
                    fold.addSubFold(subFold);
                });
            }
            for (var i = 0; i < foldData.length; i++) {
                var foldLine = foldData[i];
                if (endRow == foldLine.start.row) {
                    foldLine.addFold(fold);
                    added = true;
                    break;
                }
                else if (startRow == foldLine.end.row) {
                    foldLine.addFold(fold);
                    added = true;
                    if (!fold.sameRow) {
                        // Check if we might have to merge two FoldLines.
                        var foldLineNext = foldData[i + 1];
                        if (foldLineNext && foldLineNext.start.row == endRow) {
                            // We need to merge!
                            foldLine.merge(foldLineNext);
                            break;
                        }
                    }
                    break;
                }
                else if (endRow <= foldLine.start.row) {
                    break;
                }
            }
            if (!added)
                foldLine = this.$addFoldLine(new FoldLine_1.default(this.$foldData, [fold]));
            if (this.$useWrapMode)
                this.$updateWrapData(foldLine.start.row, foldLine.start.row);
            else
                this.$updateRowLengthCache(foldLine.start.row, foldLine.start.row);
            // Notify that fold data has changed.
            this.setModified(true);
            this._emit("changeFold", { data: fold, action: "add" });
            return fold;
        };
        EditSession.prototype.setModified = function (modified) {
        };
        EditSession.prototype.addFolds = function (folds) {
            folds.forEach(function (fold) {
                this.addFold(fold);
            }, this);
        };
        EditSession.prototype.removeFold = function (fold) {
            var foldLine = fold.foldLine;
            var startRow = foldLine.start.row;
            var endRow = foldLine.end.row;
            var foldLines = this.$foldData;
            var folds = foldLine.folds;
            // Simple case where there is only one fold in the FoldLine such that
            // the entire fold line can get removed directly.
            if (folds.length == 1) {
                foldLines.splice(foldLines.indexOf(foldLine), 1);
            }
            else 
            // If the fold is the last fold of the foldLine, just remove it.
            if (foldLine.range.isEnd(fold.end.row, fold.end.column)) {
                folds.pop();
                foldLine.end.row = folds[folds.length - 1].end.row;
                foldLine.end.column = folds[folds.length - 1].end.column;
            }
            else 
            // If the fold is the first fold of the foldLine, just remove it.
            if (foldLine.range.isStart(fold.start.row, fold.start.column)) {
                folds.shift();
                foldLine.start.row = folds[0].start.row;
                foldLine.start.column = folds[0].start.column;
            }
            else 
            // We know there are more then 2 folds and the fold is not at the edge.
            // This means, the fold is somewhere in between.
            //
            // If the fold is in one row, we just can remove it.
            if (fold.sameRow) {
                folds.splice(folds.indexOf(fold), 1);
            }
            else 
            // The fold goes over more then one row. This means remvoing this fold
            // will cause the fold line to get splitted up. newFoldLine is the second part
            {
                var newFoldLine = foldLine.split(fold.start.row, fold.start.column);
                folds = newFoldLine.folds;
                folds.shift();
                newFoldLine.start.row = folds[0].start.row;
                newFoldLine.start.column = folds[0].start.column;
            }
            if (!this.$updating) {
                if (this.$useWrapMode)
                    this.$updateWrapData(startRow, endRow);
                else
                    this.$updateRowLengthCache(startRow, endRow);
            }
            // Notify that fold data has changed.
            this.setModified(true);
            this._emit("changeFold", { data: fold, action: "remove" });
        };
        EditSession.prototype.removeFolds = function (folds) {
            // We need to clone the folds array passed in as it might be the folds
            // array of a fold line and as we call this.removeFold(fold), folds
            // are removed from folds and changes the current index.
            var cloneFolds = [];
            for (var i = 0; i < folds.length; i++) {
                cloneFolds.push(folds[i]);
            }
            cloneFolds.forEach(function (fold) {
                this.removeFold(fold);
            }, this);
            this.setModified(true);
        };
        EditSession.prototype.expandFold = function (fold) {
            this.removeFold(fold);
            fold.subFolds.forEach(function (subFold) {
                fold.restoreRange(subFold);
                this.addFold(subFold);
            }, this);
            if (fold.collapseChildren > 0) {
                this.foldAll(fold.start.row + 1, fold.end.row, fold.collapseChildren - 1);
            }
            fold.subFolds = [];
        };
        EditSession.prototype.expandFolds = function (folds) {
            folds.forEach(function (fold) {
                this.expandFold(fold);
            }, this);
        };
        EditSession.prototype.unfold = function (location, expandInner) {
            var range;
            var folds;
            if (location == null) {
                range = new Range_1.default(0, 0, this.getLength(), 0);
                expandInner = true;
            }
            else if (typeof location == "number")
                range = new Range_1.default(location, 0, location, this.getLine(location).length);
            else if ("row" in location)
                range = Range_1.default.fromPoints(location, location);
            else
                range = location;
            folds = this.getFoldsInRangeList(range);
            if (expandInner) {
                this.removeFolds(folds);
            }
            else {
                var subFolds = folds;
                // TODO: might be better to remove and add folds in one go instead of using
                // expandFolds several times.
                while (subFolds.length) {
                    this.expandFolds(subFolds);
                    subFolds = this.getFoldsInRangeList(range);
                }
            }
            if (folds.length)
                return folds;
        };
        /*
         * Checks if a given documentRow is folded. This is true if there are some
         * folded parts such that some parts of the line is still visible.
         **/
        EditSession.prototype.isRowFolded = function (docRow, startFoldRow) {
            return !!this.getFoldLine(docRow, startFoldRow);
        };
        EditSession.prototype.getRowFoldEnd = function (docRow, startFoldRow) {
            var foldLine = this.getFoldLine(docRow, startFoldRow);
            return foldLine ? foldLine.end.row : docRow;
        };
        EditSession.prototype.getRowFoldStart = function (docRow, startFoldRow) {
            var foldLine = this.getFoldLine(docRow, startFoldRow);
            return foldLine ? foldLine.start.row : docRow;
        };
        EditSession.prototype.getFoldDisplayLine = function (foldLine, endRow, endColumn, startRow, startColumn) {
            if (startRow == null)
                startRow = foldLine.start.row;
            if (startColumn == null)
                startColumn = 0;
            if (endRow == null)
                endRow = foldLine.end.row;
            if (endColumn == null)
                endColumn = this.getLine(endRow).length;
            // Build the textline using the FoldLine walker.
            var self = this;
            var textLine = "";
            foldLine.walk(function (placeholder, row, column, lastColumn) {
                if (row < startRow)
                    return;
                if (row == startRow) {
                    if (column < startColumn)
                        return;
                    lastColumn = Math.max(startColumn, lastColumn);
                }
                if (placeholder != null) {
                    textLine += placeholder;
                }
                else {
                    textLine += self.getLine(row).substring(lastColumn, column);
                }
            }, endRow, endColumn);
            return textLine;
        };
        EditSession.prototype.getDisplayLine = function (row, endColumn, startRow, startColumn) {
            var foldLine = this.getFoldLine(row);
            if (!foldLine) {
                var line;
                line = this.getLine(row);
                return line.substring(startColumn || 0, endColumn || line.length);
            }
            else {
                return this.getFoldDisplayLine(foldLine, row, endColumn, startRow, startColumn);
            }
        };
        EditSession.prototype.$cloneFoldData = function () {
            var fd = [];
            fd = this.$foldData.map(function (foldLine) {
                var folds = foldLine.folds.map(function (fold) {
                    return fold.clone();
                });
                return new FoldLine_1.default(fd, folds);
            });
            return fd;
        };
        EditSession.prototype.toggleFold = function (tryToUnfold) {
            var selection = this.selection;
            var range = selection.getRange();
            var fold;
            var bracketPos;
            if (range.isEmpty()) {
                var cursor = range.start;
                fold = this.getFoldAt(cursor.row, cursor.column);
                if (fold) {
                    this.expandFold(fold);
                    return;
                }
                else if (bracketPos = this.findMatchingBracket(cursor)) {
                    if (range.comparePoint(bracketPos) == 1) {
                        range.end = bracketPos;
                    }
                    else {
                        range.start = bracketPos;
                        range.start.column++;
                        range.end.column--;
                    }
                }
                else if (bracketPos = this.findMatchingBracket({ row: cursor.row, column: cursor.column + 1 })) {
                    if (range.comparePoint(bracketPos) === 1)
                        range.end = bracketPos;
                    else
                        range.start = bracketPos;
                    range.start.column++;
                }
                else {
                    range = this.getCommentFoldRange(cursor.row, cursor.column) || range;
                }
            }
            else {
                var folds = this.getFoldsInRange(range);
                if (tryToUnfold && folds.length) {
                    this.expandFolds(folds);
                    return;
                }
                else if (folds.length == 1) {
                    fold = folds[0];
                }
            }
            if (!fold)
                fold = this.getFoldAt(range.start.row, range.start.column);
            if (fold && fold.range.toString() == range.toString()) {
                this.expandFold(fold);
                return;
            }
            var placeholder = "...";
            if (!range.isMultiLine()) {
                placeholder = this.getTextRange(range);
                if (placeholder.length < 4)
                    return;
                placeholder = placeholder.trim().substring(0, 2) + "..";
            }
            this.addFold(placeholder, range);
        };
        EditSession.prototype.getCommentFoldRange = function (row, column, dir) {
            var iterator = new TokenIterator_1.default(this, row, column);
            var token = iterator.getCurrentToken();
            if (token && /^comment|string/.test(token.type)) {
                var range = new Range_1.default(0, 0, 0, 0);
                var re = new RegExp(token.type.replace(/\..*/, "\\."));
                if (dir != 1) {
                    do {
                        token = iterator.stepBackward();
                    } while (token && re.test(token.type));
                    iterator.stepForward();
                }
                range.start.row = iterator.getCurrentTokenRow();
                range.start.column = iterator.getCurrentTokenColumn() + 2;
                iterator = new TokenIterator_1.default(this, row, column);
                if (dir != -1) {
                    do {
                        token = iterator.stepForward();
                    } while (token && re.test(token.type));
                    token = iterator.stepBackward();
                }
                else
                    token = iterator.getCurrentToken();
                range.end.row = iterator.getCurrentTokenRow();
                range.end.column = iterator.getCurrentTokenColumn() + token.value.length - 2;
                return range;
            }
        };
        EditSession.prototype.foldAll = function (startRow, endRow, depth) {
            if (depth == undefined)
                depth = 100000; // JSON.stringify doesn't hanle Infinity
            var foldWidgets = this.foldWidgets;
            if (!foldWidgets)
                return; // mode doesn't support folding
            endRow = endRow || this.getLength();
            startRow = startRow || 0;
            for (var row = startRow; row < endRow; row++) {
                if (foldWidgets[row] == null)
                    foldWidgets[row] = this.getFoldWidget(row);
                if (foldWidgets[row] != "start")
                    continue;
                var range = this.getFoldWidgetRange(row);
                // sometimes range can be incompatible with existing fold
                // TODO change addFold to return null istead of throwing
                if (range && range.isMultiLine()
                    && range.end.row <= endRow
                    && range.start.row >= startRow) {
                    row = range.end.row;
                    try {
                        // addFold can change the range
                        var fold = this.addFold("...", range);
                        if (fold)
                            fold.collapseChildren = depth;
                    }
                    catch (e) { }
                }
            }
        };
        EditSession.prototype.setFoldStyle = function (style) {
            if (!this.$foldStyles[style])
                throw new Error("invalid fold style: " + style + "[" + Object.keys(this.$foldStyles).join(", ") + "]");
            if (this.$foldStyle === style)
                return;
            this.$foldStyle = style;
            if (style === "manual")
                this.unfold();
            // reset folding
            var mode = this.$foldMode;
            this.$setFolding(null);
            this.$setFolding(mode);
        };
        EditSession.prototype.$setFolding = function (foldMode) {
            if (this.$foldMode == foldMode)
                return;
            this.$foldMode = foldMode;
            this.off('change', this.$updateFoldWidgets);
            this._emit("changeAnnotation");
            if (!foldMode || this.$foldStyle == "manual") {
                this.foldWidgets = null;
                return;
            }
            this.foldWidgets = [];
            this.getFoldWidget = foldMode.getFoldWidget.bind(foldMode, this, this.$foldStyle);
            this.getFoldWidgetRange = foldMode.getFoldWidgetRange.bind(foldMode, this, this.$foldStyle);
            this.$updateFoldWidgets = this.updateFoldWidgets.bind(this);
            this.on('change', this.$updateFoldWidgets);
        };
        EditSession.prototype.getParentFoldRangeData = function (row, ignoreCurrent) {
            var fw = this.foldWidgets;
            if (!fw || (ignoreCurrent && fw[row])) {
                return {};
            }
            var i = row - 1;
            var firstRange;
            while (i >= 0) {
                var c = fw[i];
                if (c == null)
                    c = fw[i] = this.getFoldWidget(i);
                if (c == "start") {
                    var range = this.getFoldWidgetRange(i);
                    if (!firstRange)
                        firstRange = range;
                    if (range && range.end.row >= row)
                        break;
                }
                i--;
            }
            return {
                range: i !== -1 && range,
                firstRange: firstRange
            };
        };
        EditSession.prototype.onFoldWidgetClick = function (row, e) {
            e = e.domEvent;
            var options = {
                children: e.shiftKey,
                all: e.ctrlKey || e.metaKey,
                siblings: e.altKey
            };
            var range = this.$toggleFoldWidget(row, options);
            if (!range) {
                var el = (e.target || e.srcElement);
                if (el && /ace_fold-widget/.test(el.className))
                    el.className += " ace_invalid";
            }
        };
        EditSession.prototype.$toggleFoldWidget = function (row, options) {
            if (!this.getFoldWidget)
                return;
            var type = this.getFoldWidget(row);
            var line = this.getLine(row);
            var dir = type === "end" ? -1 : 1;
            var fold = this.getFoldAt(row, dir === -1 ? 0 : line.length, dir);
            if (fold) {
                if (options.children || options.all)
                    this.removeFold(fold);
                else
                    this.expandFold(fold);
                return;
            }
            var range = this.getFoldWidgetRange(row, true);
            // sometimes singleline folds can be missed by the code above
            if (range && !range.isMultiLine()) {
                fold = this.getFoldAt(range.start.row, range.start.column, 1);
                if (fold && range.isEqual(fold.range)) {
                    this.removeFold(fold);
                    return;
                }
            }
            if (options.siblings) {
                var data = this.getParentFoldRangeData(row);
                if (data.range) {
                    var startRow = data.range.start.row + 1;
                    var endRow = data.range.end.row;
                }
                this.foldAll(startRow, endRow, options.all ? 10000 : 0);
            }
            else if (options.children) {
                endRow = range ? range.end.row : this.getLength();
                this.foldAll(row + 1, range.end.row, options.all ? 10000 : 0);
            }
            else if (range) {
                if (options.all) {
                    // This is a bit ugly, but it corresponds to some code elsewhere.
                    range.collapseChildren = 10000;
                }
                this.addFold("...", range);
            }
            return range;
        };
        EditSession.prototype.toggleFoldWidget = function (toggleParent) {
            var row = this.selection.getCursor().row;
            row = this.getRowFoldStart(row);
            var range = this.$toggleFoldWidget(row, {});
            if (range)
                return;
            // handle toggleParent
            var data = this.getParentFoldRangeData(row, true);
            range = data.range || data.firstRange;
            if (range) {
                row = range.start.row;
                var fold = this.getFoldAt(row, this.getLine(row).length, 1);
                if (fold) {
                    this.removeFold(fold);
                }
                else {
                    this.addFold("...", range);
                }
            }
        };
        EditSession.prototype.updateFoldWidgets = function (e, editSession) {
            var delta = e.data;
            var range = delta.range;
            var firstRow = range.start.row;
            var len = range.end.row - firstRow;
            if (len === 0) {
                this.foldWidgets[firstRow] = null;
            }
            else if (delta.action == "removeText" || delta.action == "removeLines") {
                this.foldWidgets.splice(firstRow, len + 1, null);
            }
            else {
                var args = Array(len + 1);
                args.unshift(firstRow, 1);
                this.foldWidgets.splice.apply(this.foldWidgets, args);
            }
        };
        return EditSession;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = EditSession;
    // FIXME: Restore
    // Folding.call(EditSession.prototype);
    config_1.defineOptions(EditSession.prototype, "session", {
        wrap: {
            set: function (value) {
                if (!value || value == "off")
                    value = false;
                else if (value == "free")
                    value = true;
                else if (value == "printMargin")
                    value = -1;
                else if (typeof value == "string")
                    value = parseInt(value, 10) || false;
                if (this.$wrap == value)
                    return;
                if (!value) {
                    this.setUseWrapMode(false);
                }
                else {
                    var col = typeof value == "number" ? value : null;
                    this.setWrapLimitRange(col, col);
                    this.setUseWrapMode(true);
                }
                this.$wrap = value;
            },
            get: function () {
                if (this.getUseWrapMode()) {
                    if (this.$wrap == -1)
                        return "printMargin";
                    if (!this.getWrapLimitRange().min)
                        return "free";
                    return this.$wrap;
                }
                return "off";
            },
            handlesSet: true
        },
        wrapMethod: {
            // code|text|auto
            set: function (val) {
                val = val == "auto"
                    ? this.$mode.type != "text"
                    : val != "text";
                if (val != this.$wrapAsCode) {
                    this.$wrapAsCode = val;
                    if (this.$useWrapMode) {
                        this.$modified = true;
                        this.$resetRowCache(0);
                        this.$updateWrapData(0, this.getLength() - 1);
                    }
                }
            },
            initialValue: "auto"
        },
        firstLineNumber: {
            set: function () { this._signal("changeBreakpoint"); },
            initialValue: 1
        },
        useWorker: {
            set: function (useWorker) {
                this.$useWorker = useWorker;
                this.$stopWorker();
                if (useWorker)
                    this.$startWorker();
            },
            initialValue: true
        },
        useSoftTabs: { initialValue: true },
        tabSize: {
            set: function (tabSize) {
                if (isNaN(tabSize) || this.$tabSize === tabSize)
                    return;
                this.$modified = true;
                this.$rowLengthCache = [];
                this.$tabSize = tabSize;
                this._signal("changeTabSize");
            },
            initialValue: 4,
            handlesSet: true
        },
        overwrite: {
            set: function (val) { this._signal("changeOverwrite"); },
            initialValue: false
        },
        newLineMode: {
            set: function (val) { this.doc.setNewLineMode(val); },
            get: function () { return this.doc.getNewLineMode(); },
            handlesSet: true
        },
        mode: {
            set: function (val) { this.setMode(val); },
            get: function () { return this.$modeId; }
        }
    });
});