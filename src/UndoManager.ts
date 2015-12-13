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

import EditSession from './EditSession';
import Range from './Range';

/**
 * This object maintains the undo stack for an <code>EditSession</code>.
 *
 * @class UndoManager
 */
export default class UndoManager {

    /**
     * @property _editSession
     * @type EditSession
     * @private
     */
    private _editSession: EditSession;

    /**
     * @property _dirtyCounter
     * @type number
     * @private
     */
    private _dirtyCounter: number;

    // FIXME: type and documentation.
    private $undoStack: any[];
    private $redoStack: any[];

    /**
     * Resets the current undo state.
     *
     * @class UndoManager
     * @constructor
     */
    constructor() {
        this.reset();
    }

    /**
     * Provides a means for implementing your own undo manager. `options` has one property, `args`, an [[Array `Array`]], with two elements:
     *
     * - `args[0]` is an array of deltas
     * - `args[1]` is the document to associate with
     *
     * @param {Object} options Contains additional properties
     *
     **/
    execute(options: { action?: string; args: any[]; merge: boolean }): void {
        var deltas = options.args[0];
        this._editSession = options.args[1];
        if (options.merge && this.hasUndo()) {
            this._dirtyCounter--;
            deltas = this.$undoStack.pop().concat(deltas);
        }
        this.$undoStack.push(deltas);
        this.$redoStack = [];

        if (this._dirtyCounter < 0) {
            // The user has made a change after undoing past the last clean state.
            // We can never get back to a clean state now until markClean() is called.
            this._dirtyCounter = NaN;
        }
        this._dirtyCounter++;
    }

    /**
     * Perform an undo operation on the document, reverting the last change.
     *
     * @method undo
     * @param [dontSelect] {boolean}
     * @return {Range} The range of the undo.
     */
    undo(dontSelect?: boolean): Range {
        var deltas = this.$undoStack.pop();
        var undoSelectionRange: Range = null;
        if (deltas) {
            undoSelectionRange = this._editSession.undoChanges(deltas, dontSelect);
            this.$redoStack.push(deltas);
            this._dirtyCounter--;
        }
        return undoSelectionRange;
    }

    /**
     * Perform a redo operation on the document, reimplementing the last change.
     * @method redo
     * @param [dontSelect] {boolean}
     * @return {Range} The range of the redo.
     */
    redo(dontSelect?: boolean): Range {
        var deltas = this.$redoStack.pop();
        var redoSelectionRange: Range = null;
        if (deltas) {
            redoSelectionRange = this._editSession.redoChanges(deltas, dontSelect);
            this.$undoStack.push(deltas);
            this._dirtyCounter++;
        }
        return redoSelectionRange;
    }

    /**
     * Destroys the stack of undo and redo redo operations and marks the manager as clean.
     *
     * @method reset
     * @return {void}
     */
    reset(): void {
        this.$undoStack = [];
        this.$redoStack = [];
        this.markClean();
    }

    /**
     * Returns `true` if there are undo operations left to perform.
     *
     * @method hasUndo
     * @return {boolean}
     */
    hasUndo(): boolean {
        return this.$undoStack.length > 0;
    }

    /**
     * Returns `true` if there are redo operations left to perform.
     *
     * @method hasRedo
     * @return {boolean}
     */
    hasRedo(): boolean {
        return this.$redoStack.length > 0;
    }

    /**
     * Marks the current status clean.
     *
     * @method markClean
     * @return {void}
     */
    markClean(): void {
        this._dirtyCounter = 0;
    }

    /**
     * Determines whether the current status is clean.
     *
     * @method isClean
     * @return {boolean}
     */
    isClean(): boolean {
        return this._dirtyCounter === 0;
    }
}
