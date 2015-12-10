import EventEmitterClass from "./lib/event_emitter";
import FoldLine from "./FoldLine";
import Fold from "./Fold";
import Selection from "./Selection";
import Mode from "./mode/Mode";
import Range from "./Range";
import EditorDocument from "./EditorDocument";
import BackgroundTokenizer from "./BackgroundTokenizer";
import SearchHighlight from "./SearchHighlight";
import UndoManager from './UndoManager';
import FontMetrics from "./layer/FontMetrics";
import LineWidget from './LineWidget';
import LineWidgets from './LineWidgets';
import Position from './Position';
/**
 * @class EditSession
 * @extends EventEmitterClass
 */
export default class EditSession extends EventEmitterClass {
    $breakpoints: string[];
    $decorations: string[];
    private $frontMarkers;
    $backMarkers: {};
    private $markerId;
    private $undoSelect;
    private $deltas;
    private $deltasDoc;
    private $deltasFold;
    private $fromUndo;
    widgetManager: LineWidgets;
    private $updateFoldWidgets;
    private $foldData;
    foldWidgets: any[];
    getFoldWidget: (row: number) => any;
    getFoldWidgetRange: (row: number, forceMultiline?: boolean) => Range;
    _changedWidgets: LineWidget[];
    doc: EditorDocument;
    private $defaultUndoManager;
    private $undoManager;
    private $informUndoManager;
    bgTokenizer: BackgroundTokenizer;
    $modified: any;
    private selection;
    private $docRowCache;
    private $wrapData;
    private $screenRowCache;
    private $rowLengthCache;
    private $overwrite;
    $searchHighlight: SearchHighlight;
    private $annotations;
    private $autoNewLine;
    private getOption;
    private setOption;
    private $useWorker;
    /**
     *
     */
    private $modes;
    /**
     *
     */
    $mode: Mode;
    private $modeId;
    /**
     * The worker corresponding to the mode (i.e. Language).
     */
    private $worker;
    private $options;
    tokenRe: RegExp;
    nonTokenRe: RegExp;
    $scrollTop: number;
    private $scrollLeft;
    private $wrapAsCode;
    private $wrapLimit;
    $useWrapMode: boolean;
    private $wrapLimitRange;
    $updating: any;
    private $onChange;
    private $syncInformUndoManager;
    mergeUndoDeltas: boolean;
    private $useSoftTabs;
    private $tabSize;
    private $wrapMethod;
    private screenWidth;
    lineWidgets: LineWidget[];
    private lineWidgetsWidth;
    lineWidgetWidth: number;
    $getWidgetScreenLength: any;
    $tagHighlight: any;
    /**
     * This is a marker identifier.
     */
    $bracketHighlight: number;
    /**
     * This is really a Range with an added marker id.
     */
    $highlightLineMarker: Range;
    /**
     * A number is a marker identifier, null indicates that no such marker exists.
     */
    $selectionMarker: number;
    private $bracketMatcher;
    /**
     * @class EditSession
     * @constructor
     * @param doc {EditorDocument}
     * @param [mode]
     * @param [cb]
     */
    constructor(doc: EditorDocument, mode?: any, cb?: () => any);
    /**
     * Sets the `EditSession` to point to a new `EditorDocument`.
     * If a `BackgroundTokenizer` exists, it also points to `doc`.
     *
     * @method setDocument
     * @param doc {EditorDocument} The new `EditorDocument` to use.
     * @return {void}
     */
    private setDocument(doc);
    /**
     * Returns the `EditorDocument` associated with this session.
     *
     * @method getDocument
     * @return {EditorDocument}
     */
    getDocument(): EditorDocument;
    /**
     * @method $resetRowCache
     * @param docRow {number} The row to work with.
     * @return {void}
     * @private
     */
    private $resetRowCache(docRow);
    private $getRowCacheIndex(cacheArray, val);
    private resetCaches();
    private onChangeFold(e);
    private onChange(e, doc);
    /**
     * Sets the session text.
     * @method setValue
     * @param text {string} The new text to place.
     * @return {void}
     * @private
     */
    private setValue(text);
    /**
     * Returns the current EditorDocument as a string.
     *
     * @method toString
     * @return {string}
     * @alias EditSession.getValue
     */
    toString(): string;
    /**
     * Returns the current EditorDocument as a string.
     *
     * @method getValue
     * @return {string}
     * @alias EditSession.toString
     */
    getValue(): string;
    /**
     * Returns the current selection.
     *
     * @method getSelection
     * @return {Selection}
     */
    getSelection(): Selection;
    /**
     * Sets the current selection.
     *
     * @method setSelection
     * @param selection {Selection}
     * @return {void}
     */
    setSelection(selection: Selection): void;
    /**
     * @method getState
     * @param row {number} The row to start at.
     * @return {string}
     */
    getState(row: number): string;
    /**
     * Starts tokenizing at the row indicated. Returns a list of objects of the tokenized rows.
     * @method getTokens
     * @param row {number} The row to start at.
     */
    getTokens(row: number): {
        start: number;
        type: string;
        value: string;
    }[];
    /**
     * Returns an object indicating the token at the current row.
     * The object has two properties: `index` and `start`.
     *
     * @method getTokenAt
     * @param {Number} row The row number to retrieve from
     * @param {Number} column The column number to retrieve from.
     */
    getTokenAt(row: number, column?: number): {
        index?: number;
        start?: number;
        value: string;
    };
    /**
     * Sets the undo manager.
     *
     * @method setUndoManager
     * @param undoManager {UndoManager} The new undo manager.
     * @return {void}
     */
    setUndoManager(undoManager: UndoManager): void;
    /**
     * Starts a new group in undo history.
     *
     * @method markUndoGroup
     * @return {void}
     */
    markUndoGroup(): void;
    /**
     * Returns the current undo manager.
     *
     * @method getUndoManager
     * @return {UndoManager}
     */
    getUndoManager(): UndoManager;
    /**
     * Returns the current value for tabs.
     * If the user is using soft tabs, this will be a series of spaces (defined by [[EditSession.getTabSize `getTabSize()`]]); otherwise it's simply `'\t'`.
     *
     * @method getTabString
     * @return {string}
     */
    getTabString(): string;
    /**
     * Pass `true` to enable the use of soft tabs.
     * Soft tabs means you're using spaces instead of the tab character (`'\t'`).
     *
     * @method setUseSoftTabs
     * @param useSoftTabs {boolean} Value indicating whether or not to use soft tabs.
     * @return {EditSession}
     * @chainable
     */
    private setUseSoftTabs(useSoftTabs);
    /**
     * Returns `true` if soft tabs are being used, `false` otherwise.
     *
     * @method getUseSoftTabs
     * @return {boolean}
     */
    getUseSoftTabs(): boolean;
    /**
    * Set the number of spaces that define a soft tab.
    * For example, passing in `4` transforms the soft tabs to be equivalent to four spaces.
    * This function also emits the `changeTabSize` event.
    * @param {Number} tabSize The new tab size
    **/
    private setTabSize(tabSize);
    /**
    * Returns the current tab size.
    **/
    getTabSize(): number;
    /**
    * Returns `true` if the character at the position is a soft tab.
    * @param {Object} position The position to check
    *
    *
    **/
    isTabStop(position: {
        column: number;
    }): boolean;
    /**
    * Pass in `true` to enable overwrites in your session, or `false` to disable.
    *
    * If overwrites is enabled, any text you enter will type over any text after it. If the value of `overwrite` changes, this function also emites the `changeOverwrite` event.
    *
    * @param {Boolean} overwrite Defines whether or not to set overwrites
    *
    *
    **/
    setOverwrite(overwrite: boolean): void;
    /**
    * Returns `true` if overwrites are enabled; `false` otherwise.
    **/
    getOverwrite(): boolean;
    /**
    * Sets the value of overwrite to the opposite of whatever it currently is.
    **/
    toggleOverwrite(): void;
    /**
     * Adds `className` to the `row`, to be used for CSS stylings and whatnot.
     * @param {Number} row The row number
     * @param {String} className The class to add
     */
    addGutterDecoration(row: number, className: string): void;
    /**
     * Removes `className` from the `row`.
     * @param {Number} row The row number
     * @param {String} className The class to add
     */
    removeGutterDecoration(row: number, className: string): void;
    /**
    * Returns an array of numbers, indicating which rows have breakpoints.
    * @return {[Number]}
    **/
    private getBreakpoints();
    /**
    * Sets a breakpoint on every row number given by `rows`. This function also emites the `'changeBreakpoint'` event.
    * @param {Array} rows An array of row indices
    *
    *
    *
    **/
    private setBreakpoints(rows);
    /**
    * Removes all breakpoints on the rows. This function also emites the `'changeBreakpoint'` event.
    **/
    private clearBreakpoints();
    /**
    * Sets a breakpoint on the row number given by `rows`. This function also emites the `'changeBreakpoint'` event.
    * @param {Number} row A row index
    * @param {String} className Class of the breakpoint
    *
    *
    **/
    private setBreakpoint(row, className);
    /**
    * Removes a breakpoint on the row number given by `rows`. This function also emites the `'changeBreakpoint'` event.
    * @param {Number} row A row index
    *
    *
    **/
    private clearBreakpoint(row);
    /**
    * Adds a new marker to the given `Range`. If `inFront` is `true`, a front marker is defined, and the `'changeFrontMarker'` event fires; otherwise, the `'changeBackMarker'` event fires.
    * @param {Range} range Define the range of the marker
    * @param {String} clazz Set the CSS class for the marker
    * @param {Function | String} type Identify the type of the marker.
    * @param {Boolean} inFront Set to `true` to establish a front marker
    *
    *
    * @return {Number} The new marker id
    **/
    addMarker(range: Range, clazz: string, type: string, inFront?: boolean): number;
    /**
     * Adds a dynamic marker to the session.
     * @param {Object} marker object with update method
     * @param {Boolean} inFront Set to `true` to establish a front marker
     *
     *
     * @return {Object} The added marker
     **/
    private addDynamicMarker(marker, inFront?);
    /**
    * Removes the marker with the specified ID. If this marker was in front, the `'changeFrontMarker'` event is emitted. If the marker was in the back, the `'changeBackMarker'` event is emitted.
    * @param {Number} markerId A number representing a marker
    *
    *
    *
    **/
    removeMarker(markerId: number): void;
    /**
    * Returns an array containing the IDs of all the markers, either front or back.
    * @param {boolean} inFront If `true`, indicates you only want front markers; `false` indicates only back markers
    *
    * @return {Array}
    **/
    getMarkers(inFront: boolean): {};
    highlight(re: RegExp): void;
    private highlightLines(startRow, endRow, clazz?, inFront?);
    /**
    * Sets annotations for the `EditSession`. This functions emits the `'changeAnnotation'` event.
    * @param {Array} annotations A list of annotations
    *
    **/
    setAnnotations(annotations: any): void;
    /**
    * Returns the annotations for the `EditSession`.
    * @return {Array}
    **/
    getAnnotations: () => any;
    /**
     * Clears all the annotations for this session.
     * This function also triggers the `'changeAnnotation'` event.
     * This is called by the language modes when the worker terminates.
     */
    clearAnnotations(): void;
    /**
    * If `text` contains either the newline (`\n`) or carriage-return ('\r') characters, `$autoNewLine` stores that value.
    * @param {String} text A block of text
    *
    **/
    private $detectNewLine(text);
    /**
    * Given a starting row and column, this method returns the `Range` of the first word boundary it finds.
    * @param {Number} row The row to start at
    * @param {Number} column The column to start at
    *
    * @return {Range}
    **/
    getWordRange(row: number, column: number): Range;
    /**
    * Gets the range of a word, including its right whitespace.
    * @param {Number} row The row number to start from
    * @param {Number} column The column number to start from
    *
    * @return {Range}
    **/
    getAWordRange(row: number, column: number): Range;
    /**
    * {:EditorDocument.setNewLineMode.desc}
    * @param {String} newLineMode {:EditorDocument.setNewLineMode.param}
    *
    *
    * @related EditorDocument.setNewLineMode
    **/
    private setNewLineMode(newLineMode);
    /**
    *
    * Returns the current new line mode.
    * @return {String}
    * @related EditorDocument.getNewLineMode
    **/
    private getNewLineMode();
    /**
    * Identifies if you want to use a worker for the `EditSession`.
    * @param {Boolean} useWorker Set to `true` to use a worker
    *
    **/
    private setUseWorker(useWorker);
    /**
    * Returns `true` if workers are being used.
    **/
    private getUseWorker();
    /**
    * Reloads all the tokens on the current session. This function calls [[BackgroundTokenizer.start `BackgroundTokenizer.start ()`]] to all the rows; it also emits the `'tokenizerUpdate'` event.
    **/
    private onReloadTokenizer(e);
    /**
    * Sets a new text mode for the `EditSession`. This method also emits the `'changeMode'` event. If a [[BackgroundTokenizer `BackgroundTokenizer`]] is set, the `'tokenizerUpdate'` event is also emitted.
    * @param {TextMode} mode Set a new text mode
    * @param {cb} optional callback
    *
    **/
    private setMode(mode, cb?);
    private $onChangeMode(mode, $isPlaceholder?);
    private $stopWorker();
    private $startWorker();
    /**
    * Returns the current text mode.
    * @return {TextMode} The current text mode
    **/
    getMode(): Mode;
    /**
    * This function sets the scroll top value. It also emits the `'changeScrollTop'` event.
    * @param {Number} scrollTop The new scroll top value
    *
    **/
    setScrollTop(scrollTop: number): void;
    /**
    * [Returns the value of the distance between the top of the editor and the topmost part of the visible content.]{: #EditSession.getScrollTop}
    * @return {Number}
    **/
    getScrollTop(): number;
    /**
    * [Sets the value of the distance between the left of the editor and the leftmost part of the visible content.]{: #EditSession.setScrollLeft}
    **/
    setScrollLeft(scrollLeft: number): void;
    /**
    * [Returns the value of the distance between the left of the editor and the leftmost part of the visible content.]{: #EditSession.getScrollLeft}
    * @return {Number}
    **/
    getScrollLeft(): number;
    /**
    * Returns the width of the screen.
    * @return {Number}
    **/
    getScreenWidth(): number;
    private getLineWidgetMaxWidth();
    $computeWidth(force?: boolean): number;
    /**
     * Returns a verbatim copy of the given line as it is in the document
     * @param {Number} row The row to retrieve from
     *
    *
     * @return {String}
    *
    **/
    getLine(row: number): string;
    /**
     * Returns an array of strings of the rows between `firstRow` and `lastRow`. This function is inclusive of `lastRow`.
     * @param {Number} firstRow The first row index to retrieve
     * @param {Number} lastRow The final row index to retrieve
     *
     * @return {[String]}
     *
     **/
    getLines(firstRow: number, lastRow: number): string[];
    /**
     * Returns the number of rows in the document.
     * @return {Number}
     **/
    getLength(): number;
    /**
     * {:EditorDocument.getTextRange.desc}
     * @param {Range} range The range to work with
     *
     * @return {string}
     **/
    getTextRange(range: Range): string;
    /**
     * Inserts a block of `text` and the indicated `position`.
     * @param {Object} position The position {row, column} to start inserting at
     * @param {String} text A chunk of text to insert
     * @return {Object} The position of the last line of `text`. If the length of `text` is 0, this function simply returns `position`.
     *
     *
     **/
    insert(position: {
        row: number;
        column: number;
    }, text: string): {
        row: number;
        column: number;
    };
    /**
     * Removes the `range` from the document.
     * @param {Range} range A specified Range to remove
     * @return {Object} The new `start` property of the range, which contains `startRow` and `startColumn`. If `range` is empty, this function returns the unmodified value of `range.start`.
     *
     * @related EditorDocument.remove
     *
     **/
    remove(range: Range): Position;
    /**
     * Reverts previous changes to your document.
     * @param {Array} deltas An array of previous changes
     * @param {Boolean} dontSelect [If `true`, doesn't select the range of where the change occured]{: #dontSelect}
     *
     *
     * @return {Range}
    **/
    undoChanges(deltas: any, dontSelect?: boolean): Range;
    /**
     * Re-implements a previously undone change to your document.
     * @param {Array} deltas An array of previous changes
     * @param {Boolean} dontSelect {:dontSelect}
     *
    *
     * @return {Range}
    **/
    redoChanges(deltas: any, dontSelect?: boolean): Range;
    /**
     * Enables or disables highlighting of the range where an undo occurred.
     * @param {Boolean} enable If `true`, selects the range of the reinserted change
    *
    **/
    private setUndoSelect(enable);
    private $getUndoSelection(deltas, isUndo, lastUndoRange);
    /**
     * Replaces a range in the document with the new `text`.
     *
     * @method replace
     * @param range {Range} A specified Range to replace.
     * @param text {string} The new text to use as a replacement.
     * @return {Position}
     * If the text and range are empty, this function returns an object containing the current `range.start` value.
     * If the text is the exact same as what currently exists, this function returns an object containing the current `range.end` value.
     */
    replace(range: Range, text: string): Position;
    /**
    * Moves a range of text from the given range to the given position. `toPosition` is an object that looks like this:
     *  ```json
    *    { row: newRowLocation, column: newColumnLocation }
     *  ```
     * @param {Range} fromRange The range of text you want moved within the document
     * @param {Object} toPosition The location (row and column) where you want to move the text to
     * @return {Range} The new range where the text was moved to.
    *
    *
    *
    **/
    moveText(fromRange: Range, toPosition: {
        row: number;
        column: number;
    }, copy: any): Range;
    /**
    * Indents all the rows, from `startRow` to `endRow` (inclusive), by prefixing each row with the token in `indentString`.
    *
    * If `indentString` contains the `'\t'` character, it's replaced by whatever is defined by [[EditSession.getTabString `getTabString()`]].
    * @param {Number} startRow Starting row
    * @param {Number} endRow Ending row
    * @param {String} indentString The indent token
    *
    *
    **/
    indentRows(startRow: number, endRow: number, indentString: string): void;
    /**
    * Outdents all the rows defined by the `start` and `end` properties of `range`.
    * @param {Range} range A range of rows
    *
    *
    **/
    outdentRows(range: Range): void;
    private $moveLines(firstRow, lastRow, dir);
    /**
    * Shifts all the lines in the document up one, starting from `firstRow` and ending at `lastRow`.
    * @param {Number} firstRow The starting row to move up
    * @param {Number} lastRow The final row to move up
    * @return {Number} If `firstRow` is less-than or equal to 0, this function returns 0. Otherwise, on success, it returns -1.
    *
    * @related EditorDocument.insertLines
    *
    **/
    private moveLinesUp(firstRow, lastRow);
    /**
    * Shifts all the lines in the document down one, starting from `firstRow` and ending at `lastRow`.
    * @param {Number} firstRow The starting row to move down
    * @param {Number} lastRow The final row to move down
    * @return {Number} If `firstRow` is less-than or equal to 0, this function returns 0. Otherwise, on success, it returns -1.
    *
    * @related EditorDocument.insertLines
    **/
    private moveLinesDown(firstRow, lastRow);
    /**
    * Duplicates all the text between `firstRow` and `lastRow`.
    * @param {Number} firstRow The starting row to duplicate
    * @param {Number} lastRow The final row to duplicate
    * @return {Number} Returns the number of new rows added; in other words, `lastRow - firstRow + 1`.
    *
    *
    **/
    duplicateLines(firstRow: any, lastRow: any): number;
    private $clipRowToDocument(row);
    private $clipColumnToRow(row, column);
    private $clipPositionToDocument(row, column);
    $clipRangeToDocument(range: Range): Range;
    /**
     * Sets whether or not line wrapping is enabled. If `useWrapMode` is different than the current value, the `'changeWrapMode'` event is emitted.
     * @param {Boolean} useWrapMode Enable (or disable) wrap mode
     *
    *
    **/
    private setUseWrapMode(useWrapMode);
    /**
    * Returns `true` if wrap mode is being used; `false` otherwise.
    * @return {Boolean}
    **/
    getUseWrapMode(): boolean;
    /**
     * Sets the boundaries of wrap. Either value can be `null` to have an unconstrained wrap, or, they can be the same number to pin the limit. If the wrap limits for `min` or `max` are different, this method also emits the `'changeWrapMode'` event.
     * @param {Number} min The minimum wrap value (the left side wrap)
     * @param {Number} max The maximum wrap value (the right side wrap)
     *
    *
    **/
    setWrapLimitRange(min: number, max: number): void;
    /**
    * This should generally only be called by the renderer when a resize is detected.
    * @param {Number} desiredLimit The new wrap limit
    * @return {Boolean}
    *
    * @private
    **/
    adjustWrapLimit(desiredLimit: number, $printMargin: number): boolean;
    private $constrainWrapLimit(wrapLimit, min, max);
    /**
    * Returns the value of wrap limit.
    * @return {Number} The wrap limit.
    **/
    private getWrapLimit();
    /**
     * Sets the line length for soft wrap in the editor. Lines will break
     *  at a minimum of the given length minus 20 chars and at a maximum
     *  of the given number of chars.
     * @param {number} limit The maximum line length in chars, for soft wrapping lines.
     */
    private setWrapLimit(limit);
    /**
    * Returns an object that defines the minimum and maximum of the wrap limit; it looks something like this:
    *
    *     { min: wrapLimitRange_min, max: wrapLimitRange_max }
    *
    * @return {Object}
    **/
    private getWrapLimitRange();
    private $updateInternalDataOnChange(e);
    $updateRowLengthCache(firstRow: any, lastRow: any, b?: any): void;
    $updateWrapData(firstRow: any, lastRow: any): void;
    private $computeWrapSplits(tokens, wrapLimit, tabSize?);
    /**
    * Given a string, returns an array of the display characters, including tabs and spaces.
    * @param {String} str The string to check
    * @param {Number} offset The value to start at
    *
    *
    **/
    private $getDisplayTokens(str, offset?);
    /**
     * Calculates the width of the string `str` on the screen while assuming that the string starts at the first column on the screen.
    * @param {String} str The string to calculate the screen width of
    * @param {Number} maxScreenColumn
    * @param {Number} screenColumn
    * @return {[Number]} Returns an `int[]` array with two elements:<br/>
    * The first position indicates the number of columns for `str` on screen.<br/>
    * The second value contains the position of the document column that this function read until.
    *
    **/
    $getStringScreenWidth(str: string, maxScreenColumn?: number, screenColumn?: number): number[];
    /**
    * Returns number of screenrows in a wrapped line.
    * @param {Number} row The row number to check
    *
    * @return {Number}
    **/
    getRowLength(row: number): number;
    getRowLineCount(row: number): number;
    getRowWrapIndent(screenRow: number): any;
    /**
     * Returns the position (on screen) for the last character in the provided screen row.
     * @param {Number} screenRow The screen row to check
     * @return {Number}
     *
     * @related EditSession.documentToScreenColumn
    **/
    getScreenLastRowColumn(screenRow: number): number;
    /**
    * For the given document row and column, this returns the column position of the last screen row.
    * @param {Number} docRow
    *
    * @param {Number} docColumn
    **/
    getDocumentLastRowColumn(docRow: any, docColumn: any): number;
    /**
    * For the given document row and column, this returns the document position of the last row.
    * @param {Number} docRow
    * @param {Number} docColumn
    *
    *
    **/
    getDocumentLastRowColumnPosition(docRow: any, docColumn: any): {
        row: number;
        column: number;
    };
    /**
    * For the given row, this returns the split data.
    * @return {String}
    **/
    getRowSplitData(row: number): number[];
    /**
     * The distance to the next tab stop at the specified screen column.
     * @methos getScreenTabSize
     * @param screenColumn {number} The screen column to check
     * @return {number}
     */
    getScreenTabSize(screenColumn: number): number;
    screenToDocumentRow(screenRow: number, screenColumn: number): number;
    private screenToDocumentColumn(screenRow, screenColumn);
    /**
    * Converts characters coordinates on the screen to characters coordinates within the document. [This takes into account code folding, word wrap, tab size, and any other visual modifications.]{: #conversionConsiderations}
    * @param {number} screenRow The screen row to check
    * @param {number} screenColumn The screen column to check
    * @return {Object} The object returned has two properties: `row` and `column`.
    **/
    screenToDocumentPosition(screenRow: number, screenColumn: number): {
        row: number;
        column: number;
    };
    /**
    * Converts document coordinates to screen coordinates. {:conversionConsiderations}
    * @param {Number} docRow The document row to check
    * @param {Number} docColumn The document column to check
    * @return {Object} The object returned by this method has two properties: `row` and `column`.
    *
    * @related EditSession.screenToDocumentPosition
    **/
    documentToScreenPosition(docRow: number, docColumn: number): {
        row: number;
        column: number;
    };
    /**
    * For the given document row and column, returns the screen column.
    * @param {Number} docRow
    * @param {Number} docColumn
    * @return {Number}
    *
    **/
    documentToScreenColumn(docRow: number, docColumn: number): number;
    /**
    * For the given document row and column, returns the screen row.
    * @param {Number} docRow
    * @param {Number} docColumn
    **/
    documentToScreenRow(docRow: number, docColumn: number): number;
    documentToScreenRange(range: Range): Range;
    /**
    * Returns the length of the screen.
    * @return {Number}
    **/
    getScreenLength(): number;
    /**
     * @private
     */
    $setFontMetrics(fm: FontMetrics): void;
    findMatchingBracket(position: {
        row: number;
        column: number;
    }, chr?: string): {
        row: number;
        column: number;
    };
    getBracketRange(position: {
        row: number;
        column: number;
    }): Range;
    $findOpeningBracket(bracket: string, position: {
        row: number;
        column: number;
    }, typeRe?: RegExp): {
        row: number;
        column: number;
    };
    $findClosingBracket(bracket: string, position: {
        row: number;
        column: number;
    }, typeRe?: RegExp): {
        row: number;
        column: number;
    };
    private $foldMode;
    $foldStyles: {
        "manual": number;
        "markbegin": number;
        "markbeginend": number;
    };
    $foldStyle: string;
    getFoldAt(row: number, column: number, side?: number): Fold;
    getFoldsInRange(range: Range): Fold[];
    getFoldsInRangeList(ranges: any): Fold[];
    getAllFolds(): Fold[];
    getFoldStringAt(row: number, column: number, trim: number, foldLine?: FoldLine): string;
    getFoldLine(docRow: number, startFoldLine?: FoldLine): FoldLine;
    getNextFoldLine(docRow: number, startFoldLine?: FoldLine): FoldLine;
    getFoldedRowCount(first: number, last: number): number;
    private $addFoldLine(foldLine);
    /**
     * Adds a new fold.
     *
     * @return
     *      The new created Fold object or an existing fold object in case the
     *      passed in range fits an existing fold exactly.
     */
    addFold(placeholder: string | Fold, range: Range): Fold;
    setModified(modified: boolean): void;
    addFolds(folds: Fold[]): void;
    removeFold(fold: Fold): void;
    removeFolds(folds: Fold[]): void;
    expandFold(fold: Fold): void;
    expandFolds(folds: Fold[]): void;
    unfold(location?: any, expandInner?: boolean): Fold[];
    isRowFolded(docRow: number, startFoldRow: FoldLine): boolean;
    getRowFoldEnd(docRow: number, startFoldRow?: FoldLine): number;
    getRowFoldStart(docRow: number, startFoldRow?: FoldLine): number;
    getFoldDisplayLine(foldLine: FoldLine, endRow?: number, endColumn?: number, startRow?: number, startColumn?: number): string;
    getDisplayLine(row: number, endColumn: number, startRow: number, startColumn: number): string;
    private $cloneFoldData();
    toggleFold(tryToUnfold: boolean): void;
    getCommentFoldRange(row: number, column: number, dir?: number): Range;
    foldAll(startRow: number, endRow: number, depth: number): void;
    setFoldStyle(style: string): void;
    private $setFolding(foldMode);
    getParentFoldRangeData(row: number, ignoreCurrent?: boolean): {
        range?: Range;
        firstRange?: Range;
    };
    onFoldWidgetClick(row: number, e: any): void;
    private $toggleFoldWidget(row, options);
    toggleFoldWidget(toggleParent: any): void;
    updateFoldWidgets(e: {
        data: {
            action: string;
            range: Range;
        };
    }, editSession: EditSession): void;
}
