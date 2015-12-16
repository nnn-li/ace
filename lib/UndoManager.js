"use strict";
export default class UndoManager {
    constructor() {
        this.reset();
    }
    execute(options) {
        var deltas = options.args[0];
        this._editSession = options.args[1];
        if (options.merge && this.hasUndo()) {
            this._dirtyCounter--;
            deltas = this.$undoStack.pop().concat(deltas);
        }
        this.$undoStack.push(deltas);
        this.$redoStack = [];
        if (this._dirtyCounter < 0) {
            this._dirtyCounter = NaN;
        }
        this._dirtyCounter++;
    }
    undo(dontSelect) {
        var deltas = this.$undoStack.pop();
        var undoSelectionRange = null;
        if (deltas) {
            undoSelectionRange = this._editSession.undoChanges(deltas, dontSelect);
            this.$redoStack.push(deltas);
            this._dirtyCounter--;
        }
        return undoSelectionRange;
    }
    redo(dontSelect) {
        var deltas = this.$redoStack.pop();
        var redoSelectionRange = null;
        if (deltas) {
            redoSelectionRange = this._editSession.redoChanges(deltas, dontSelect);
            this.$undoStack.push(deltas);
            this._dirtyCounter++;
        }
        return redoSelectionRange;
    }
    reset() {
        this.$undoStack = [];
        this.$redoStack = [];
        this.markClean();
    }
    hasUndo() {
        return this.$undoStack.length > 0;
    }
    hasRedo() {
        return this.$redoStack.length > 0;
    }
    markClean() {
        this._dirtyCounter = 0;
    }
    isClean() {
        return this._dirtyCounter === 0;
    }
}
