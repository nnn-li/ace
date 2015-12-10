define(["require", "exports"], function (require, exports) {
    /**
     * This object maintains the undo stack for an <code>EditSession</code>.
     *
     * @class UndoManager
     */
    var UndoManager = (function () {
        /**
         * Resets the current undo state.
         *
         * @class UndoManager
         * @constructor
         */
        function UndoManager() {
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
        UndoManager.prototype.execute = function (options) {
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
        };
        /**
         * Perform an undo operation on the document, reverting the last change.
         *
         * @method undo
         * @param [dontSelect] {boolean}
         * @return {Range} The range of the undo.
         */
        UndoManager.prototype.undo = function (dontSelect) {
            var deltas = this.$undoStack.pop();
            var undoSelectionRange = null;
            if (deltas) {
                undoSelectionRange = this._editSession.undoChanges(deltas, dontSelect);
                this.$redoStack.push(deltas);
                this._dirtyCounter--;
            }
            return undoSelectionRange;
        };
        /**
         * Perform a redo operation on the document, reimplementing the last change.
         * @method redo
         * @param [dontSelect] {boolean}
         * @return {Range} The range of the redo.
         */
        UndoManager.prototype.redo = function (dontSelect) {
            var deltas = this.$redoStack.pop();
            var redoSelectionRange = null;
            if (deltas) {
                redoSelectionRange = this._editSession.redoChanges(deltas, dontSelect);
                this.$undoStack.push(deltas);
                this._dirtyCounter++;
            }
            return redoSelectionRange;
        };
        /**
         * Destroys the stack of undo and redo redo operations and marks the manager as clean.
         *
         * @method reset
         * @return {void}
         */
        UndoManager.prototype.reset = function () {
            this.$undoStack = [];
            this.$redoStack = [];
            this.markClean();
        };
        /**
         * Returns `true` if there are undo operations left to perform.
         *
         * @method hasUndo
         * @return {boolean}
         */
        UndoManager.prototype.hasUndo = function () {
            return this.$undoStack.length > 0;
        };
        /**
         * Returns `true` if there are redo operations left to perform.
         *
         * @method hasRedo
         * @return {boolean}
         */
        UndoManager.prototype.hasRedo = function () {
            return this.$redoStack.length > 0;
        };
        /**
         * Marks the current status clean.
         *
         * @method markClean
         * @return {void}
         */
        UndoManager.prototype.markClean = function () {
            this._dirtyCounter = 0;
        };
        /**
         * Determines whether the current status is clean.
         *
         * @method isClean
         * @return {boolean}
         */
        UndoManager.prototype.isClean = function () {
            return this._dirtyCounter === 0;
        };
        return UndoManager;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = UndoManager;
});
