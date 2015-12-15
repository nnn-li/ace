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

import Editor from './Editor';
import EditorDocument from './EditorDocument';
import EventEmitterClass from "./lib/event_emitter";
import Tokenizer from './Tokenizer';
import Token from './Token';

/**
 * Tokenizes an EditorDocument in the background, and caches the tokenized rows for future use. 
 * 
 * If a certain row is changed, everything below that row is re-tokenized.
 *
 * @class BackgroundTokenizer
 * @extends EventEmitterClass
 */
export default class BackgroundTokenizer extends EventEmitterClass {
    /**
     * This is the value returned by setTimeout, so it's really a timer handle.
     * There are some conditionals looking for a falsey value, so we use zero where needed.
     */
    private running: number = 0;
    private lines: { start: number; type: string; value: string }[][] = [];
    private states: string[] = [];
    private currentLine: number = 0;
    private tokenizer: Tokenizer;
    private doc: EditorDocument;
    private $worker: () => void;

    /**
     * Creates a new `BackgroundTokenizer` object.
     *
     * @constructor
     * @param tokenizer {Tokenizer} The tokenizer to use.
     */
    constructor(tokenizer: Tokenizer) {
        super();
        this.tokenizer = tokenizer;

        var self = this;

        this.$worker = function() {
            if (!self.running) { return; }

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
                self.tokenizeRow(currentLine);
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
     * @method setTokenizer
     * @param tokenizer {Tokenizer} The new tokenizer to use.
     * @return {void}
     */
    setTokenizer(tokenizer: Tokenizer): void {
        // TODO: Why don't we stop first?
        this.tokenizer = tokenizer;
        this.lines = [];
        this.states = [];

        // Start at row zero.
        this.start(0);
    }

    /**
     * Sets a new document to associate with this object.
     *
     * @method setDocument
     * @param doc {EditorDocument} The new document to associate with.
     * @return {void}
     */
    setDocument(doc: EditorDocument): void {
        this.doc = doc;
        this.lines = [];
        this.states = [];

        // TODO: Why do we stop? What is the lifecycle? Documentation!
        this.stop();
    }

    /**
     * Fires whenever the background tokeniziers between a range of rows are going to be updated.
     * 
     * @event update
     * @param {Object} e An object containing two properties, `first` and `last`, which indicate the rows of the region being updated.
     */
    /**
     * Emits the `'update'` event.
     * `firstRow` and `lastRow` are used to define the boundaries of the region to be updated.
     *
     * @method fireUpdateEvent
     * @param firstRow {number} The starting row region.
     * @param lastRow {number} The final row region.
     * @return {void}
     */
    fireUpdateEvent(firstRow: number, lastRow: number): void {
        var data = { first: firstRow, last: lastRow };
        this._signal("update", { data: data });
    }

    /**
     * Starts tokenizing at the row indicated.
     *
     * @method start
     * @param startRow {number} The row to start at.
     * @return {void}
     */
    start(startRow: number): void {
        this.currentLine = Math.min(startRow || 0, this.currentLine, this.doc.getLength());

        // remove all cached items below this line
        this.lines.splice(this.currentLine, this.lines.length);
        this.states.splice(this.currentLine, this.states.length);

        this.stop();
        // pretty long delay to prevent the tokenizer from interfering with the user
        this.running = setTimeout(this.$worker, 700);
    }

    scheduleStart() {
        if (!this.running)
            this.running = setTimeout(this.$worker, 700);
    }

    $updateOnChange(delta: { range: { start: { row }; end: { row } }; action: string }) {
        var range = delta.range;
        var startRow = range.start.row;
        var len = range.end.row - startRow;

        if (len === 0) {
            this.lines[startRow] = null;
        } else if (delta.action == "removeText" || delta.action == "removeLines") {
            this.lines.splice(startRow, len + 1, null);
            this.states.splice(startRow, len + 1, null);
        } else {
            var args = Array(len + 1);
            args.unshift(startRow, 1);
            this.lines.splice.apply(this.lines, args);
            this.states.splice.apply(this.states, args);
        }

        this.currentLine = Math.min(startRow, this.currentLine, this.doc.getLength());

        this.stop();
    }

    /**
     * Stops tokenizing.
     *
     * @method stop
     * @return {void}
     */
    stop(): void {
        if (this.running) {
            clearTimeout(this.running);
        }
        this.running = 0;
    }

    /**
     * Gives list of tokens of the row. (tokens are cached)
     * 
     * @param {number} row The row to get tokens at
     *
     * 
     *
     **/
    getTokens(row: number): { start: number; type: string; value: string }[] {
        return this.lines[row] || this.tokenizeRow(row);
    }

    /**
     * [Returns the state of tokenization at the end of a row.]{: #BackgroundTokenizer.getState}
     *
     * @param {number} row The row to get state at
     **/
    getState(row: number): string {
        if (this.currentLine == row) {
            this.tokenizeRow(row);
        }
        return this.states[row] || "start";
    }

    /**
     * @method tokenizeRow
     * @param row {number}
     * @return {Token[]}
     */
    tokenizeRow(row: number): Token[] {
        var line: string = this.doc.getLine(row);
        var state = this.states[row - 1];

        var data: { state: any; tokens: Token[] } = this.tokenizer.getLineTokens(line, state);

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
    }
}