import EventEmitterClass from "./lib/event_emitter";
import OrientedRange from "./OrientedRange";
import Range from "./Range";
import { RangeList } from "./range_list";
import EditSession from "./EditSession";
import Anchor from "./Anchor";
/**
 * Contains the cursor position and the text selection of an edit session.
 *
 * The row/columns used in the selection are in document coordinates representing ths coordinates as thez appear in the document before applying soft wrap and folding.
 * @class Selection
 **/
/**
 * Emitted when the cursor position changes.
 * @event changeCursor
 *
**/
/**
 * Emitted when the cursor selection changes.
 *
 *  @event changeSelection
**/
/**
 * Creates a new `Selection` object.
 * @param {EditSession} session The session to use
 *
 * @constructor
 **/
export default class Selection extends EventEmitterClass {
    private session;
    private doc;
    lead: Anchor;
    anchor: Anchor;
    private selectionLead;
    private selectionAnchor;
    private $isEmpty;
    private $keepDesiredColumnOnChange;
    private $desiredColumn;
    private rangeCount;
    ranges: any;
    rangeList: RangeList;
    constructor(session: EditSession);
    /**
     *
     * Returns `true` if the selection is empty.
     * @returns {Boolean}
     */
    isEmpty(): boolean;
    /**
    * Returns `true` if the selection is a multi-line.
    * @returns {Boolean}
    **/
    isMultiLine(): boolean;
    /**
    * Returns an object containing the `row` and `column` current position of the cursor.
    * @returns {Object}
    **/
    getCursor(): {
        row: number;
        column: number;
    };
    /**
    * Sets the row and column position of the anchor. This function also emits the `'changeSelection'` event.
    * @param {number} row The new row
    * @param {number} column The new column
    **/
    setSelectionAnchor(row: number, column: number): void;
    /**
    * Returns an object containing the `row` and `column` of the calling selection anchor.
    *
    * @returns {Object}
    * @related Anchor.getPosition
    **/
    getSelectionAnchor(): {
        row: number;
        column: number;
    };
    /**
    *
    * Returns an object containing the `row` and `column` of the calling selection lead.
    * @returns {Object}
    **/
    getSelectionLead(): {
        row: number;
        column: number;
    };
    /**
    * Shifts the selection up (or down, if [[Selection.isBackwards `isBackwards()`]] is true) the given number of columns.
    * @param {Number} columns The number of columns to shift by
    *
    *
    *
    **/
    shiftSelection(columns: any): void;
    /**
    * Returns `true` if the selection is going backwards in the document.
    * @returns {Boolean}
    **/
    isBackwards(): boolean;
    /**
    * [Returns the [[Range]] for the selected text.]{: #Selection.getRange}
    * @returns {Range}
    **/
    getRange(): Range;
    /**
    * [Empties the selection (by de-selecting it). This function also emits the `'changeSelection'` event.]{: #Selection.clearSelection}
    **/
    clearSelection(): void;
    /**
    * Selects all the text in the document.
    **/
    selectAll(): void;
    /**
    * Sets the selection to the provided range.
    * @param {Range} range The range of text to select
    * @param {Boolean} reverse Indicates if the range should go backwards (`true`) or not
    *
    *
    * @method setSelectionRange
    * @alias setRange
    **/
    setRange(range: any, reverse?: boolean): void;
    setSelectionRange(range: {
        start: {
            row: number;
            column: number;
        };
        end: {
            row: number;
            column: number;
        };
    }, reverse?: boolean): void;
    $moveSelection(mover: any): void;
    /**
    * Moves the selection cursor to the indicated row and column.
    * @param {Number} row The row to select to
    * @param {Number} column The column to select to
    *
    *
    *
    **/
    selectTo(row: number, column: number): void;
    /**
    * Moves the selection cursor to the row and column indicated by `pos`.
    * @param {Object} pos An object containing the row and column
    *
    *
    *
    **/
    selectToPosition(pos: any): void;
    /**
    * Moves the selection cursor to the indicated row and column.
    * @param {Number} row The row to select to
    * @param {Number} column The column to select to
    *
    **/
    moveTo(row: number, column: number): void;
    /**
    * Moves the selection cursor to the row and column indicated by `pos`.
    * @param {Object} pos An object containing the row and column
    **/
    moveToPosition(pos: any): void;
    /**
    *
    * Moves the selection up one row.
    **/
    selectUp(): void;
    /**
    *
    * Moves the selection down one row.
    **/
    selectDown(): void;
    /**
    *
    *
    * Moves the selection right one column.
    **/
    selectRight(): void;
    /**
    *
    * Moves the selection left one column.
    **/
    selectLeft(): void;
    /**
    *
    * Moves the selection to the beginning of the current line.
    **/
    selectLineStart(): void;
    /**
    *
    * Moves the selection to the end of the current line.
    **/
    selectLineEnd(): void;
    /**
    *
    * Moves the selection to the end of the file.
    **/
    selectFileEnd(): void;
    /**
    *
    * Moves the selection to the start of the file.
    **/
    selectFileStart(): void;
    /**
    *
    * Moves the selection to the first word on the right.
    **/
    selectWordRight(): void;
    /**
    *
    * Moves the selection to the first word on the left.
    **/
    selectWordLeft(): void;
    /**
    * Moves the selection to highlight the entire word.
    * @related EditSession.getWordRange
    **/
    getWordRange(row?: any, column?: any): Range;
    /**
    *
    * Selects an entire word boundary.
    **/
    selectWord(): void;
    /**
    * Selects a word, including its right whitespace.
    * @related EditSession.getAWordRange
    **/
    selectAWord(): void;
    getLineRange(row?: number, excludeLastChar?: boolean): Range;
    /**
    * Selects the entire line.
    **/
    selectLine(): void;
    /**
    *
    * Moves the cursor up one row.
    **/
    moveCursorUp(): void;
    /**
    *
    * Moves the cursor down one row.
    **/
    moveCursorDown(): void;
    /**
    *
    * Moves the cursor left one column.
    **/
    moveCursorLeft(): void;
    /**
    *
    * Moves the cursor right one column.
    **/
    moveCursorRight(): void;
    /**
    *
    * Moves the cursor to the start of the line.
    **/
    moveCursorLineStart(): void;
    /**
    *
    * Moves the cursor to the end of the line.
    **/
    moveCursorLineEnd(): void;
    /**
    *
    * Moves the cursor to the end of the file.
    **/
    moveCursorFileEnd(): void;
    /**
    *
    * Moves the cursor to the start of the file.
    **/
    moveCursorFileStart(): void;
    /**
    *
    * Moves the cursor to the word on the right.
    **/
    moveCursorLongWordRight(): void;
    /**
    *
    * Moves the cursor to the word on the left.
    **/
    moveCursorLongWordLeft(): void;
    $shortWordEndIndex(rightOfCursor: any): number;
    moveCursorShortWordRight(): void;
    moveCursorShortWordLeft(): void;
    moveCursorWordRight(): void;
    moveCursorWordLeft(): void;
    /**
    * Moves the cursor to position indicated by the parameters. Negative numbers move the cursor backwards in the document.
    * @param {Number} rows The number of rows to move by
    * @param {Number} chars The number of characters to move by
    *
    *
    * @related EditSession.documentToScreenPosition
    **/
    moveCursorBy(rows: any, chars: any): void;
    /**
    * Moves the selection to the position indicated by its `row` and `column`.
    * @param {Object} position The position to move to
    *
    *
    **/
    moveCursorToPosition(position: any): void;
    /**
    * Moves the cursor to the row and column provided. [If `preventUpdateDesiredColumn` is `true`, then the cursor stays in the same column position as its original point.]{: #preventUpdateBoolDesc}
    * @param {number} row The row to move to
    * @param {number} column The column to move to
    * @param {boolean} keepDesiredColumn [If `true`, the cursor move does not respect the previous column]{: #preventUpdateBool}
    */
    moveCursorTo(row: number, column: number, keepDesiredColumn?: boolean): void;
    /**
    * Moves the cursor to the screen position indicated by row and column. {:preventUpdateBoolDesc}
    * @param {Number} row The row to move to
    * @param {Number} column The column to move to
    * @param {Boolean} keepDesiredColumn {:preventUpdateBool}
    *
    *
    **/
    moveCursorToScreen(row: any, column: any, keepDesiredColumn: any): void;
    detach(): void;
    fromOrientedRange(range: OrientedRange): void;
    toOrientedRange(range?: any): any;
    /**
    * Saves the current cursor position and calls `func` that can change the cursor
    * postion. The result is the range of the starting and eventual cursor position.
    * Will reset the cursor position.
    * @param {Function} The callback that should change the cursor position
    * @returns {Range}
    *
    **/
    getRangeOfMovements(func: any): Range;
    toJSON(): any;
    private toSingleRange(data);
    addRange(data: any, something: boolean): void;
    fromJSON(data: any): void;
    isEqual(data: any): boolean;
}
