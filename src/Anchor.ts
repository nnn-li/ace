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

import Document from "./Document";
import Position from "./Position";
import Range from "./Range";
import EventEmitterClass from './lib/EventEmitterClass';
import { assert } from './lib/asserts';
import EventBus from "./EventBus";

/**
 * @class Anchor
 */
export default class Anchor implements EventBus<Anchor> {

    /**
     * @property row
     * @type number
     */
    public row: number;

    /**
     * @property column
     * @type number
     */
    public column: number;

    /**
     * @property document
     * @type {Document}
     * @private
     */
    private document: Document;
    private $onChange: (event, doc: Document) => void;

    /**
     * @property $insertRight
     * @type boolean
     * @default false
     * @private
     */
    private $insertRight: boolean;

    private eventBus: EventEmitterClass<Anchor>;

    /**
     * <p>
     * Defines the floating pointer in the document.
     * Whenever text is inserted or deleted before the cursor, the position of the cursor is updated.
     * </p>
     * <p>
     * Creates a new <code>Anchor</code> and associates it with a document.
     * </p>
     *
     * @class Anchor
     * @constructor
     * @param doc {Document} The document to associate with the anchor.
     * @param row {number} The starting row position.
     * @param column {number} The starting column position.
     */
    constructor(doc: Document, row: number, column: number) {
        assert(typeof row === 'number', "row must be a number");
        assert(typeof column === 'number', "column must be a number");
        this.eventBus = new EventEmitterClass<Anchor>(this);
        this.$onChange = this.onChange.bind(this);
        this.attach(doc);
        this.setPosition(row, column);
        this.$insertRight = false;
    }

    /**
     * Returns an object identifying the `row` and `column` position of the current anchor.
     *
     * @method getPosition
     * @return {Position}
     */
    getPosition(): Position {
        return this.$clipPositionToDocument(this.row, this.column);
    }

    /**
     * Returns the current document.
     *
     * @method getDocument
     * @return {Document}
     */
    getDocument(): Document {
        return this.document;
    }

    /**
     * Fires whenever the anchor position changes.
     *
     * Both of these objects have a `row` and `column` property corresponding to the position.
     *
     * Events that can trigger this function include [[Anchor.setPosition `setPosition()`]].
     *
     * @method onChange
     * @param {Object} e  An object containing information about the anchor position.
     *   It has two properties:
     *  - `old`: An object describing the old Anchor position
     *  - `value`: An object describing the new Anchor position
     * @param doc: {Document}
     * @return {void}
     */
    onChange(e: { data: { range: Range; action: string } }, doc: Document): void {
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
                    // do nothing
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
                // do nothing
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

    /**
     * Sets the anchor position to the specified row and column.
     * If `noClip` is `true`, the position is not clipped.
     *
     * @method setPostion
     * @param row {number} The row index to move the anchor to
     * @param column {number} The column index to move the anchor to
     * @param [noClip] {boolean} Identifies if you want the position to be clipped.
     * @return {void}
     **/
    setPosition(row: number, column: number, noClip?: boolean): void {
        var pos: Position;
        if (noClip) {
            pos = { row: row, column: column };
        }
        else {
            pos = this.$clipPositionToDocument(row, column);
        }

        if (this.row === pos.row && this.column === pos.column) {
            return;
        }

        var old: Position = { row: this.row, column: this.column };

        this.row = pos.row;
        this.column = pos.column;

        /**
         * Fires whenever the anchor posoition changes.
         *
         * @event change
         * @param msg {{old: Position; value: Position}}
         */
        this.eventBus._signal("change", { old: old, value: pos });
    }

    /**
     * When called, the `'change'` event listener is removed.
     *
     * @method detach
     * @return {void}
     */
    detach(): void {
        this.document.off("change", this.$onChange);
    }

    /**
     * @method attach
     * @param doc {Document}
     * @return {void}
     */
    attach(doc: Document): void {
        this.document = doc || this.document;
        this.document.on("change", this.$onChange);
    }

    /**
     * @method on
     * @param eventName {string}
     * @param callback {(event, source: Anchor) => any}
     * @return {void}
     */
    on(eventName: string, callback: (event: any, source: Anchor) => any): void {
        this.eventBus.on(eventName, callback, false);
    }

    /**
     * @method off
     * @param eventName {string}
     * @param callback {(event, source: Anchor) => any}
     * @return {void}
     */
    off(eventName: string, callback: (event: any, source: Anchor) => any): void {
        this.eventBus.off(eventName, callback);
    }

    /**
     * Clips the anchor position to the specified row and column.
     *
     * @method $clipPositionToDocument
     * @param {Number} row The row index to clip the anchor to
     * @param {Number} column The column index to clip the anchor to
     * @return {Position}
     * @private
     */
    private $clipPositionToDocument(row: number, column: number): Position {
        var pos: Position = { row: 0, column: 0 };

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
