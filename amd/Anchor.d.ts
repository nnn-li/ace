import EditorDocument from "./EditorDocument";
import Range from "./Range";
import EventEmitterClass from './lib/event_emitter';
/**
 * Defines the floating pointer in the document. Whenever text is inserted or deleted before the cursor, the position of the cursor is updated.
 * @class Anchor
 * @extends EventEmitterClass
 */
export default class Anchor extends EventEmitterClass {
    /**
     * @property row
     * @type number
     */
    row: number;
    /**
     * @property column
     * @type number
     */
    column: number;
    /**
     * @property document
     * @type {EditorDocument}
     * @private
     */
    private document;
    private $onChange;
    /**
     * @property $insertRight
     * @type boolean
     * @default false
     * @private
     */
    private $insertRight;
    /**
     * Creates a new <code>Anchor</code> and associates it with a document.
     *
     * @param doc {EditorDocument} The document to associate with the anchor.
     * @param row {number} The starting row position.
     * @param column {number} The starting column position.
     *
     * @constructor
     */
    constructor(doc: EditorDocument, row: number, column: number);
    /**
     * Returns an object identifying the `row` and `column` position of the current anchor.
     * @return {Object}
     **/
    getPosition(): {
        row: number;
        column: number;
    };
    /**
     * Returns the current document.
     * @method getDocument
     * @return {EditorDocument}
     */
    getDocument(): EditorDocument;
    /**
     * Fires whenever the anchor position changes.
     *
     * Both of these objects have a `row` and `column` property corresponding to the position.
     *
     * Events that can trigger this function include [[Anchor.setPosition `setPosition()`]].
     *
     * @event change
     * @param {Object} e  An object containing information about the anchor position. It has two properties:
     *  - `old`: An object describing the old Anchor position
     *  - `value`: An object describing the new Anchor position
     *
     **/
    onChange(e: {
        data: {
            range: Range;
            action: string;
        };
    }, doc: EditorDocument): void;
    /**
     * Sets the anchor position to the specified row and column. If `noClip` is `true`, the position is not clipped.
     * @param {Number} row The row index to move the anchor to
     * @param {Number} column The column index to move the anchor to
     * @param {Boolean} noClip Identifies if you want the position to be clipped
     **/
    setPosition(row: number, column: number, noClip?: boolean): void;
    /**
     * When called, the `'change'` event listener is removed.
     *
     **/
    detach(): void;
    attach(doc: EditorDocument): void;
    /**
     * Clips the anchor position to the specified row and column.
     * @param {Number} row The row index to clip the anchor to
     * @param {Number} column The column index to clip the anchor to
     *
     **/
    $clipPositionToDocument(row: number, column: number): {
        row: number;
        column: number;
    };
}
