var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", "./lib/event_emitter"], function (require, exports, event_emitter_1) {
    /**
     * Tokenizes the current [[EditorDocument `EditorDocument`]] in the background, and caches the tokenized rows for future use.
     *
     * If a certain row is changed, everything below that row is re-tokenized.
     *
     * @class BackgroundTokenizer
     **/
    /**
     * Creates a new `BackgroundTokenizer` object.
     * @param {Tokenizer} tokenizer The tokenizer to use
     * @param {Editor} editor The editor to associate with
     *
     * @constructor
     **/
    var BackgroundTokenizer = (function (_super) {
        __extends(BackgroundTokenizer, _super);
        function BackgroundTokenizer(tokenizer, editor) {
            _super.call(this);
            /**
             * This is the value returned by setTimeout, so it's really a timer handle.
             * There are some conditionals looking for a falsey value, so we use zero where needed.
             */
            this.running = 0;
            this.lines = [];
            this.states = [];
            this.currentLine = 0;
            this.tokenizer = tokenizer;
            var self = this;
            this.$worker = function () {
                if (!self.running) {
                    return;
                }
                var workerStart = new Date();
                var currentLine = self.currentLine;
                var endLine = -1;
                var doc = self.doc;
                while (self.lines[currentLine])
                    currentLine++;
                var startLine = currentLine;
                var len = doc.getLength();
                var processedLines = 0;
                self.running = 0;
                while (currentLine < len) {
                    self.$tokenizeRow(currentLine);
                    endLine = currentLine;
                    do {
                        currentLine++;
                    } while (self.lines[currentLine]);
                    // only check every 5 lines
                    processedLines++;
                    if ((processedLines % 5 === 0) && (new Date().getTime() - workerStart.getTime()) > 20) {
                        self.running = setTimeout(self.$worker, 20);
                        break;
                    }
                }
                self.currentLine = currentLine;
                if (startLine <= endLine)
                    self.fireUpdateEvent(startLine, endLine);
            };
        }
        /**
         * Sets a new tokenizer for this object.
         *
         * @param {Tokenizer} tokenizer The new tokenizer to use
         *
         **/
        BackgroundTokenizer.prototype.setTokenizer = function (tokenizer) {
            this.tokenizer = tokenizer;
            this.lines = [];
            this.states = [];
            this.start(0);
        };
        /**
         * Sets a new document to associate with this object.
         * @param {EditorDocument} doc The new document to associate with
         **/
        BackgroundTokenizer.prototype.setDocument = function (doc) {
            this.doc = doc;
            this.lines = [];
            this.states = [];
            this.stop();
        };
        /**
        * Fires whenever the background tokeniziers between a range of rows are going to be updated.
        *
        * @event update
        * @param {Object} e An object containing two properties, `first` and `last`, which indicate the rows of the region being updated.
        *
        **/
        /**
         * Emits the `'update'` event. `firstRow` and `lastRow` are used to define the boundaries of the region to be updated.
         * @param {number} firstRow The starting row region
         * @param {number} lastRow The final row region
         *
         **/
        BackgroundTokenizer.prototype.fireUpdateEvent = function (firstRow, lastRow) {
            var data = {
                first: firstRow,
                last: lastRow
            };
            this._signal("update", { data: data });
        };
        /**
         * Starts tokenizing at the row indicated.
         *
         * @param {number} startRow The row to start at
         *
         **/
        BackgroundTokenizer.prototype.start = function (startRow) {
            this.currentLine = Math.min(startRow || 0, this.currentLine, this.doc.getLength());
            // remove all cached items below this line
            this.lines.splice(this.currentLine, this.lines.length);
            this.states.splice(this.currentLine, this.states.length);
            this.stop();
            // pretty long delay to prevent the tokenizer from interfering with the user
            this.running = setTimeout(this.$worker, 700);
        };
        BackgroundTokenizer.prototype.scheduleStart = function () {
            if (!this.running)
                this.running = setTimeout(this.$worker, 700);
        };
        BackgroundTokenizer.prototype.$updateOnChange = function (delta) {
            var range = delta.range;
            var startRow = range.start.row;
            var len = range.end.row - startRow;
            if (len === 0) {
                this.lines[startRow] = null;
            }
            else if (delta.action == "removeText" || delta.action == "removeLines") {
                this.lines.splice(startRow, len + 1, null);
                this.states.splice(startRow, len + 1, null);
            }
            else {
                var args = Array(len + 1);
                args.unshift(startRow, 1);
                this.lines.splice.apply(this.lines, args);
                this.states.splice.apply(this.states, args);
            }
            this.currentLine = Math.min(startRow, this.currentLine, this.doc.getLength());
            this.stop();
        };
        /**
         * Stops tokenizing.
         *
         **/
        BackgroundTokenizer.prototype.stop = function () {
            if (this.running) {
                clearTimeout(this.running);
            }
            this.running = 0;
        };
        /**
         * Gives list of tokens of the row. (tokens are cached)
         *
         * @param {number} row The row to get tokens at
         *
         *
         *
         **/
        BackgroundTokenizer.prototype.getTokens = function (row) {
            return this.lines[row] || this.$tokenizeRow(row);
        };
        /**
         * [Returns the state of tokenization at the end of a row.]{: #BackgroundTokenizer.getState}
         *
         * @param {number} row The row to get state at
         **/
        BackgroundTokenizer.prototype.getState = function (row) {
            if (this.currentLine == row) {
                this.$tokenizeRow(row);
            }
            return this.states[row] || "start";
        };
        BackgroundTokenizer.prototype.$tokenizeRow = function (row) {
            var line = this.doc.getLine(row);
            var state = this.states[row - 1];
            // FIXME: There is no third argument in getLineTokens!
            var data = this.tokenizer.getLineTokens(line, state /*, row*/);
            if (this.states[row] + "" !== data.state + "") {
                this.states[row] = data.state;
                this.lines[row + 1] = null;
                if (this.currentLine > row + 1)
                    this.currentLine = row + 1;
            }
            else if (this.currentLine == row) {
                this.currentLine = row + 1;
            }
            return this.lines[row] = data.tokens;
        };
        return BackgroundTokenizer;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = BackgroundTokenizer;
});
