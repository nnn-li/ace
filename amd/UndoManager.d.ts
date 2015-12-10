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
    private _editSession;
    /**
     * @property _dirtyCounter
     * @type number
     * @private
     */
    private _dirtyCounter;
    private $undoStack;
    private $redoStack;
    /**
     * Resets the current undo state.
     *
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
     * Perform an undo operation on the document, reverting the last change.
     *
     * @method undo
     * @param [dontSelect] {boolean}
     * @return {Range} The range of the undo.
     */
    undo(dontSelect?: boolean): Range;
    /**
     * Perform a redo operation on the document, reimplementing the last change.
     * @method redo
     * @param [dontSelect] {boolean}
     * @return {Range} The range of the redo.
     */
    redo(dontSelect?: boolean): Range;
    /**
     * Destroys the stack of undo and redo redo operations and marks the manager as clean.
     *
     * @method reset
     * @return {void}
     */
    reset(): void;
    /**
     * Returns `true` if there are undo operations left to perform.
     *
     * @method hasUndo
     * @return {boolean}
     */
    hasUndo(): boolean;
    /**
     * Returns `true` if there are redo operations left to perform.
     *
     * @method hasRedo
     * @return {boolean}
     */
    hasRedo(): boolean;
    /**
     * Marks the current status clean.
     *
     * @method markClean
     * @return {void}
     */
    markClean(): void;
    /**
     * Determines whether the current status is clean.
     *
     * @method isClean
     * @return {boolean}
     */
    isClean(): boolean;
}
