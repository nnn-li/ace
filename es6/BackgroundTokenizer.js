"use strict";
import EventEmitterClass from "./lib/event_emitter";
export default class BackgroundTokenizer extends EventEmitterClass {
    constructor(tokenizer, session) {
        super();
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
                self.tokenizeRow(currentLine);
                endLine = currentLine;
                do {
                    currentLine++;
                } while (self.lines[currentLine]);
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
    fireUpdateEvent(firstRow, lastRow) {
        var data = { first: firstRow, last: lastRow };
        this._signal("update", { data: data });
    }
    getState(row) {
        if (this.currentLine == row) {
            this.tokenizeRow(row);
        }
        return this.states[row] || "start";
    }
    getTokens(row) {
        return this.lines[row] || this.tokenizeRow(row);
    }
    setDocument(doc) {
        this.doc = doc;
        this.lines = [];
        this.states = [];
        this.stop();
    }
    setTokenizer(tokenizer) {
        this.tokenizer = tokenizer;
        this.lines = [];
        this.states = [];
        this.start(0);
    }
    start(startRow) {
        this.currentLine = Math.min(startRow || 0, this.currentLine, this.doc.getLength());
        this.lines.splice(this.currentLine, this.lines.length);
        this.states.splice(this.currentLine, this.states.length);
        this.stop();
        this.running = setTimeout(this.$worker, 700);
    }
    stop() {
        if (this.running) {
            clearTimeout(this.running);
        }
        this.running = 0;
    }
    scheduleStart() {
        if (!this.running) {
            this.running = setTimeout(this.$worker, 700);
        }
    }
    updateOnChange(delta) {
        var range = delta.range;
        var startRow = range.start.row;
        var len = range.end.row - startRow;
        if (len === 0) {
            this.lines[startRow] = null;
        }
        else if (delta.action === "removeText" || delta.action === "removeLines") {
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
    }
    tokenizeRow(row) {
        var line = this.doc.getLine(row);
        var state = this.states[row - 1];
        var data = this.tokenizer.getLineTokens(line, state);
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
