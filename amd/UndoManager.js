define(["require", "exports"], function (require, exports) {
    /**
     * This object maintains the undo stack for an [[EditSession `EditSession`]].
     * @class UndoManager
     */
    var UndoManager = (function () {
        /**
         * Resets the current undo state.
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
            this.$editSession = options.args[1];
            if (options.merge && this.hasUndo()) {
                this.dirtyCounter--;
                deltas = this.$undoStack.pop().concat(deltas);
            }
            this.$undoStack.push(deltas);
            this.$redoStack = [];
            if (this.dirtyCounter < 0) {
                // The user has made a change after undoing past the last clean state.
                // We can never get back to a clean state now until markClean() is called.
                this.dirtyCounter = NaN;
            }
            this.dirtyCounter++;
        };
        /**
         * [Perform an undo operation on the document, reverting the last change.]{: #UndoManager.undo}
         * @param {Boolean} dontSelect {:dontSelect}
         *
         * @returns {Range} The range of the undo.
         **/
        UndoManager.prototype.undo = function (dontSelect) {
            var deltas = this.$undoStack.pop();
            var undoSelectionRange = null;
            if (deltas) {
                undoSelectionRange = this.$editSession.undoChanges(deltas, dontSelect);
                this.$redoStack.push(deltas);
                this.dirtyCounter--;
            }
            return undoSelectionRange;
        };
        /**
         * [Perform a redo operation on the document, reimplementing the last change.]{: #UndoManager.redo}
         * @param {Boolean} dontSelect {:dontSelect}
         **/
        UndoManager.prototype.redo = function (dontSelect) {
            var deltas = this.$redoStack.pop();
            var redoSelectionRange = null;
            if (deltas) {
                redoSelectionRange = this.$editSession.redoChanges(deltas, dontSelect);
                this.$undoStack.push(deltas);
                this.dirtyCounter++;
            }
            return redoSelectionRange;
        };
        /**
         * Destroys the stack of undo and redo redo operations.
         **/
        UndoManager.prototype.reset = function () {
            this.$undoStack = [];
            this.$redoStack = [];
            this.dirtyCounter = 0;
        };
        /**
         *
         * Returns `true` if there are undo operations left to perform.
         */
        UndoManager.prototype.hasUndo = function () {
            return this.$undoStack.length > 0;
        };
        /**
         * Returns `true` if there are redo operations left to perform.
         */
        UndoManager.prototype.hasRedo = function () {
            return this.$redoStack.length > 0;
        };
        /**
         * Marks the current status clean
         */
        UndoManager.prototype.markClean = function () {
            this.dirtyCounter = 0;
        };
        /**
         * Determines whether the current status is clean.
         */
        UndoManager.prototype.isClean = function () {
            return this.dirtyCounter === 0;
        };
        return UndoManager;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = UndoManager;
});
