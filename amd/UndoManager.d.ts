import Range from './Range';
/**
 * This object maintains the undo stack for an [[EditSession `EditSession`]].
 * @class UndoManager
 */
export default class UndoManager {
    private $editSession;
    private dirtyCounter;
    private $undoStack;
    private $redoStack;
    /**
     * Resets the current undo state.
     * @class UndoManager
     * @constructor
     */
    constructor();
    /**
     * Provides a means for implementing your own undo manager. `options` has one property, `args`, an [[Array `Array`]], with two elements:
     *
     * - `args[0]` is an array of deltas
     * - `args[1]` is the document to associate with
     *
     * @param {Object} options Contains additional properties
     *
     **/
    execute(options: {
        action?: string;
        args: any[];
        merge: boolean;
    }): void;
    /**
     * [Perform an undo operation on the document, reverting the last change.]{: #UndoManager.undo}
     * @param {Boolean} dontSelect {:dontSelect}
     *
     * @returns {Range} The range of the undo.
     **/
    undo(dontSelect?: boolean): Range;
    /**
     * [Perform a redo operation on the document, reimplementing the last change.]{: #UndoManager.redo}
     * @param {Boolean} dontSelect {:dontSelect}
     **/
    redo(dontSelect?: boolean): Range;
    /**
     * Destroys the stack of undo and redo redo operations.
     **/
    reset(): void;
    /**
     *
     * Returns `true` if there are undo operations left to perform.
     */
    hasUndo(): boolean;
    /**
     * Returns `true` if there are redo operations left to perform.
     */
    hasRedo(): boolean;
    /**
     * Marks the current status clean
     */
    markClean(): void;
    /**
     * Determines whether the current status is clean.
     */
    isClean(): boolean;
}
