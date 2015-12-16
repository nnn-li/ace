"use strict";
import EventEmitterClass from './lib/event_emitter';
import { assert } from './lib/asserts';
export default class Anchor extends EventEmitterClass {
    constructor(doc, row, column) {
        super();
        assert(typeof row === 'number', "row must be a number");
        assert(typeof column === 'number', "column must be a number");
        this.$onChange = this.onChange.bind(this);
        this.attach(doc);
        this.setPosition(row, column);
        this.$insertRight = false;
    }
    getPosition() {
        return this.$clipPositionToDocument(this.row, this.column);
    }
    getDocument() {
        return this.document;
    }
    onChange(e, doc) {
        var delta = e.data;
        var range = delta.range;
        if (range.start.row == range.end.row && range.start.row != this.row)
            return;
        if (range.start.row > this.row)
            return;
        if (range.start.row == this.row && range.start.column > this.column)
            return;
        var row = this.row;
        var column = this.column;
        var start = range.start;
        var end = range.end;
        if (delta.action === "insertText") {
            if (start.row === row && start.column <= column) {
                if (start.column === column && this.$insertRight) {
                }
                else if (start.row === end.row) {
                    column += end.column - start.column;
                }
                else {
                    column -= start.column;
                    row += end.row - start.row;
                }
            }
            else if (start.row !== end.row && start.row < row) {
                row += end.row - start.row;
            }
        }
        else if (delta.action === "insertLines") {
            if (start.row === row && column === 0 && this.$insertRight) {
            }
            else if (start.row <= row) {
                row += end.row - start.row;
            }
        }
        else if (delta.action === "removeText") {
            if (start.row === row && start.column < column) {
                if (end.column >= column)
                    column = start.column;
                else
                    column = Math.max(0, column - (end.column - start.column));
            }
            else if (start.row !== end.row && start.row < row) {
                if (end.row === row)
                    column = Math.max(0, column - end.column) + start.column;
                row -= (end.row - start.row);
            }
            else if (end.row === row) {
                row -= end.row - start.row;
                column = Math.max(0, column - end.column) + start.column;
            }
        }
        else if (delta.action == "removeLines") {
            if (start.row <= row) {
                if (end.row <= row)
                    row -= end.row - start.row;
                else {
                    row = start.row;
                    column = 0;
                }
            }
        }
        this.setPosition(row, column, true);
    }
    setPosition(row, column, noClip) {
        var pos;
        if (noClip) {
            pos = { row: row, column: column };
        }
        else {
            pos = this.$clipPositionToDocument(row, column);
        }
        if (this.row === pos.row && this.column === pos.column) {
            return;
        }
        var old = { row: this.row, column: this.column };
        this.row = pos.row;
        this.column = pos.column;
        this._signal("change", { old: old, value: pos });
    }
    detach() {
        this.document.off("change", this.$onChange);
    }
    attach(doc) {
        this.document = doc || this.document;
        this.document.on("change", this.$onChange);
    }
    $clipPositionToDocument(row, column) {
        var pos = { row: 0, column: 0 };
        if (row >= this.document.getLength()) {
            pos.row = Math.max(0, this.document.getLength() - 1);
            pos.column = this.document.getLine(pos.row).length;
        }
        else if (row < 0) {
            pos.row = 0;
            pos.column = 0;
        }
        else {
            pos.row = row;
            pos.column = Math.min(this.document.getLine(pos.row).length, Math.max(0, column));
        }
        if (column < 0) {
            pos.column = 0;
        }
        return pos;
    }
}
