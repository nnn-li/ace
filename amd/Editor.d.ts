import HashHandler from "./keyboard/HashHandler";
import KeyBinding from "./keyboard/KeyBinding";
import EditSession from "./EditSession";
import Range from "./Range";
import EventEmitterClass from "./lib/event_emitter";
import CommandManager from "./commands/CommandManager";
import VirtualRenderer from './VirtualRenderer';
import { Completer } from "./autocomplete";
import Selection from './Selection';
/**
 * The `Editor` acts as a controller, mediating between the editSession and renderer.
 *
 * @class Editor
 * @extends EventEmitterClass
 */
export default class Editor extends EventEmitterClass {
    /**
     * @property renderer
     * @type VirtualRenderer
     */
    renderer: VirtualRenderer;
    /**
     * @property session
     * @type EditSession
     * @private
     */
    private session;
    private $touchHandler;
    private $mouseHandler;
    getOption: any;
    setOption: any;
    setOptions: any;
    $isFocused: any;
    commands: CommandManager;
    keyBinding: KeyBinding;
    completers: Completer[];
    widgetManager: any;
    /**
     * The renderer container element.
     */
    container: HTMLElement;
    textInput: any;
    inMultiSelectMode: boolean;
    inVirtualSelectionMode: any;
    private $cursorStyle;
    private $keybindingId;
    private $blockScrolling;
    private $highlightActiveLine;
    private $highlightPending;
    private $highlightSelectedWord;
    private $highlightTagPending;
    private $mergeUndoDeltas;
    $readOnly: any;
    private $scrollAnchor;
    private $search;
    private _$emitInputEvent;
    private selections;
    private $selectionStyle;
    private $opResetTimer;
    private curOp;
    private prevOp;
    private previousCommand;
    private $mergeableCommands;
    private mergeNextCommand;
    private $mergeNextCommand;
    private sequenceStartTime;
    private $onDocumentChange;
    private $onChangeMode;
    private $onTokenizerUpdate;
    private $onChangeTabSize;
    private $onChangeWrapLimit;
    private $onChangeWrapMode;
    private $onChangeFold;
    private $onChangeFrontMarker;
    private $onChangeBackMarker;
    private $onChangeBreakpoint;
    private $onChangeAnnotation;
    private $onCursorChange;
    private $onScrollTopChange;
    private $onScrollLeftChange;
    $onSelectionChange: (event, selection: Selection) => void;
    exitMultiSelectMode: any;
    forEachSelection: any;
    /**
     * Creates a new `Editor` object.
     *
     * @class
     * @constructor
     * @param renderer {VirtualRenderer} The view.
     * @param session {EditSession} The model.
     */
    constructor(renderer: VirtualRenderer, session: EditSession);
    cancelMouseContextMenu(): void;
    /**
     * @property selection
     * @type Selection
     */
    selection: Selection;
    $initOperationListeners(): void;
    startOperation(commadEvent: any): void;
    endOperation(): void;
    $historyTracker(e: {
        command;
        args;
    }): void;
    /**
     * Sets a new key handler, such as "vim" or "windows".
     *
     * @method setKeyboardHandler
     * @param keyboardHandler {string | HashHandler} The new key handler.
     * @return {void}
     */
    setKeyboardHandler(keyboardHandler: string | HashHandler): void;
    /**
     * Returns the keyboard handler, such as "vim" or "windows".
     *
     * @method getKeyboardHandler
     * @return {HashHandler}
     */
    getKeyboardHandler(): HashHandler;
    /**
     * Sets a new EditSession to use.
     * This method also emits the `'changeSession'` event.
     *
     * @method setSession
     * @param session {EditSession} The new session to use.
     * @return {void}
     */
    setSession(session: EditSession): void;
    /**
     * Returns the current session being used.
     *
     * @method getSession
     * @return {EditSession}
     */
    getSession(): EditSession;
    /**
     * Sets the current document to `val`.
     * @param {String} val The new value to set for the document
     * @param {Number} cursorPos Where to set the new value. `undefined` or 0 is selectAll, -1 is at the document start, and +1 is at the end
     *
     * @return {String} The current document value
     * @related Document.setValue
     **/
    setValue(val: string, cursorPos?: number): string;
    /**
     * Returns the current session's content.
     *
     * @return {String}
     * @related EditSession.getValue
     **/
    getValue(): string;
    /**
     *
     * Returns the currently highlighted selection.
     * @return {String} The highlighted selection
     **/
    getSelection(): Selection;
    /**
     * @method resize
     * @param [force] {boolean} force If `true`, recomputes the size, even if the height and width haven't changed.
     * @return {void}
     */
    resize(force?: boolean): void;
    /**
     * {:VirtualRenderer.setTheme}
     * @param {String} theme The path to a theme
     * @param {Function} cb optional callback called when theme is loaded
     **/
    setTheme(theme: string, cb?: () => void): void;
    /**
     * {:VirtualRenderer.getTheme}
     *
     * @return {String} The set theme
     * @related VirtualRenderer.getTheme
     **/
    getTheme(): string;
    /**
     * {:VirtualRenderer.setStyle}
     * @param {String} style A class name
     *
     * @related VirtualRenderer.setStyle
     **/
    setStyle(style: string): void;
    /**
     * {:VirtualRenderer.unsetStyle}
     * @related VirtualRenderer.unsetStyle
     **/
    unsetStyle(style: string): void;
    /**
     * Gets the current font size of the editor text.
     */
    getFontSize(): string;
    /**
     * Set a new font size (in pixels) for the editor text.
     * @param {string} fontSize A font size ( _e.g._ "12px")
     *
     *
     **/
    setFontSize(fontSize: string): void;
    private $highlightBrackets();
    private $highlightTags();
    /**
     *
     * Brings the current `textInput` into focus.
     **/
    focus(): void;
    /**
     * Returns `true` if the current `textInput` is in focus.
     * @return {Boolean}
     **/
    isFocused(): boolean;
    /**
     *
     * Blurs the current `textInput`.
     **/
    blur(): void;
    /**
     * Emitted once the editor comes into focus.
     * @event focus
     *
     **/
    onFocus(): void;
    /**
     * Emitted once the editor has been blurred.
     * @event blur
     *
     *
     **/
    onBlur(): void;
    $cursorChange(): void;
    /**
     * Emitted whenever the document is changed.
     * @event change
     * @param {Object} e Contains a single property, `data`, which has the delta of changes
     *
     **/
    onDocumentChange(e: any, editSession: EditSession): void;
    onTokenizerUpdate(event: any, editSession: EditSession): void;
    onScrollTopChange(event: any, editSession: EditSession): void;
    onScrollLeftChange(event: any, editSession: EditSession): void;
    /**
     * Handler for cursor or selection changes.
     */
    onCursorChange(event: any, editSession: EditSession): void;
    $updateHighlightActiveLine(): void;
    private onSelectionChange(event, selection);
    $getSelectionHighLightRegexp(): any;
    onChangeFrontMarker(event: any, editSession: EditSession): void;
    onChangeBackMarker(event: any, editSession: EditSession): void;
    onChangeBreakpoint(event: any, editSession: EditSession): void;
    onChangeAnnotation(event: any, editSession: EditSession): void;
    onChangeMode(event: any, editSession: EditSession): void;
    onChangeWrapLimit(event: any, editSession: EditSession): void;
    onChangeWrapMode(event: any, editSession: EditSession): void;
    onChangeFold(event: any, editSession: EditSession): void;
    /**
     * Returns the string of text currently highlighted.
     * @return {String}
     **/
    getSelectedText(): string;
    /**
     * Emitted when text is copied.
     * @event copy
     * @param {String} text The copied text
     *
     **/
    /**
     * Returns the string of text currently highlighted.
     * @return {String}
     * @deprecated Use getSelectedText instead.
     **/
    getCopyText(): string;
    /**
     * Called whenever a text "copy" happens.
     **/
    onCopy(): void;
    /**
     * Called whenever a text "cut" happens.
     **/
    onCut(): void;
    /**
     * Emitted when text is pasted.
     * @event paste
     * @param {String} text The pasted text
     *
     *
     **/
    /**
     * Called whenever a text "paste" happens.
     * @param {String} text The pasted text
     *
     *
     **/
    onPaste(text: string): void;
    execCommand(command: any, args?: any): void;
    /**
     * Inserts `text` into wherever the cursor is pointing.
     * @param {String} text The new text to add
     *
     **/
    insert(text: string, pasted?: boolean): void;
    onTextInput(text: string): void;
    onCommandKey(e: any, hashId: number, keyCode: number): void;
    /**
     * Pass in `true` to enable overwrites in your session, or `false` to disable. If overwrites is enabled, any text you enter will type over any text after it. If the value of `overwrite` changes, this function also emites the `changeOverwrite` event.
     * @param {Boolean} overwrite Defines wheter or not to set overwrites
     *
     *
     * @related EditSession.setOverwrite
     **/
    setOverwrite(overwrite: boolean): void;
    /**
     * Returns `true` if overwrites are enabled; `false` otherwise.
     * @return {Boolean}
     * @related EditSession.getOverwrite
     **/
    getOverwrite(): boolean;
    /**
     * Sets the value of overwrite to the opposite of whatever it currently is.
     * @related EditSession.toggleOverwrite
     **/
    toggleOverwrite(): void;
    /**
     * Sets how fast the mouse scrolling should do.
     * @param {Number} speed A value indicating the new speed (in milliseconds)
     **/
    setScrollSpeed(speed: number): void;
    /**
     * Returns the value indicating how fast the mouse scroll speed is (in milliseconds).
     * @return {Number}
     **/
    getScrollSpeed(): number;
    /**
     * Sets the delay (in milliseconds) of the mouse drag.
     * @param {Number} dragDelay A value indicating the new delay
     **/
    setDragDelay(dragDelay: number): void;
    /**
     * Returns the current mouse drag delay.
     * @return {Number}
     **/
    getDragDelay(): number;
    /**
     * Emitted when the selection style changes, via [[Editor.setSelectionStyle]].
     * @event changeSelectionStyle
     * @param {Object} data Contains one property, `data`, which indicates the new selection style
     **/
    /**
     * Draw selection markers spanning whole line, or only over selected text. Default value is "line"
     * @param {String} style The new selection style "line"|"text"
     *
     **/
    setSelectionStyle(val: string): void;
    /**
     * Returns the current selection style.
     * @return {String}
     **/
    getSelectionStyle(): string;
    /**
     * Determines whether or not the current line should be highlighted.
     * @param {Boolean} shouldHighlight Set to `true` to highlight the current line
     **/
    setHighlightActiveLine(shouldHighlight: boolean): void;
    /**
     * Returns `true` if current lines are always highlighted.
     * @return {Boolean}
     **/
    getHighlightActiveLine(): boolean;
    setHighlightGutterLine(shouldHighlight: boolean): void;
    getHighlightGutterLine(): boolean;
    /**
     * Determines if the currently selected word should be highlighted.
     * @param {Boolean} shouldHighlight Set to `true` to highlight the currently selected word
     *
     **/
    setHighlightSelectedWord(shouldHighlight: boolean): void;
    /**
     * Returns `true` if currently highlighted words are to be highlighted.
     * @return {Boolean}
     **/
    getHighlightSelectedWord(): boolean;
    setAnimatedScroll(shouldAnimate: boolean): void;
    getAnimatedScroll(): boolean;
    /**
     * If `showInvisibles` is set to `true`, invisible characters&mdash;like spaces or new lines&mdash;are show in the editor.
     * @param {Boolean} showInvisibles Specifies whether or not to show invisible characters
     *
     **/
    setShowInvisibles(showInvisibles: boolean): void;
    /**
     * Returns `true` if invisible characters are being shown.
     * @return {Boolean}
     **/
    getShowInvisibles(): boolean;
    setDisplayIndentGuides(displayIndentGuides: boolean): void;
    getDisplayIndentGuides(): boolean;
    /**
     * If `showPrintMargin` is set to `true`, the print margin is shown in the editor.
     * @param {Boolean} showPrintMargin Specifies whether or not to show the print margin
     **/
    setShowPrintMargin(showPrintMargin: boolean): void;
    /**
     * Returns `true` if the print margin is being shown.
     * @return {Boolean}
     */
    getShowPrintMargin(): boolean;
    /**
     * Sets the column defining where the print margin should be.
     * @param {Number} showPrintMargin Specifies the new print margin
     */
    setPrintMarginColumn(showPrintMargin: number): void;
    /**
     * Returns the column number of where the print margin is.
     * @return {Number}
     */
    getPrintMarginColumn(): number;
    /**
     * If `readOnly` is true, then the editor is set to read-only mode, and none of the content can change.
     * @param {Boolean} readOnly Specifies whether the editor can be modified or not
     *
     **/
    setReadOnly(readOnly: boolean): void;
    /**
     * Returns `true` if the editor is set to read-only mode.
     * @return {Boolean}
     **/
    getReadOnly(): boolean;
    /**
     * Specifies whether to use behaviors or not. ["Behaviors" in this case is the auto-pairing of special characters, like quotation marks, parenthesis, or brackets.]{: #BehaviorsDef}
     * @param {Boolean} enabled Enables or disables behaviors
     *
     **/
    setBehavioursEnabled(enabled: boolean): void;
    /**
     * Returns `true` if the behaviors are currently enabled. {:BehaviorsDef}
     *
     * @return {Boolean}
     **/
    getBehavioursEnabled(): boolean;
    /**
     * Specifies whether to use wrapping behaviors or not, i.e. automatically wrapping the selection with characters such as brackets
     * when such a character is typed in.
     * @param {Boolean} enabled Enables or disables wrapping behaviors
     *
     **/
    setWrapBehavioursEnabled(enabled: boolean): void;
    /**
     * Returns `true` if the wrapping behaviors are currently enabled.
     **/
    getWrapBehavioursEnabled(): boolean;
    /**
     * Indicates whether the fold widgets should be shown or not.
     * @param {Boolean} show Specifies whether the fold widgets are shown
     **/
    setShowFoldWidgets(show: boolean): void;
    /**
     * Returns `true` if the fold widgets are shown.
     * @return {Boolean}
     */
    getShowFoldWidgets(): any;
    setFadeFoldWidgets(fade: boolean): void;
    getFadeFoldWidgets(): boolean;
    /**
     * Removes words of text from the editor. A "word" is defined as a string of characters bookended by whitespace.
     * @param {String} direction The direction of the deletion to occur, either "left" or "right"
     *
     **/
    remove(direction: string): void;
    /**
     * Removes the word directly to the right of the current selection.
     **/
    removeWordRight(): void;
    /**
     * Removes the word directly to the left of the current selection.
     **/
    removeWordLeft(): void;
    /**
     * Removes all the words to the left of the current selection, until the start of the line.
     **/
    removeToLineStart(): void;
    /**
     * Removes all the words to the right of the current selection, until the end of the line.
     **/
    removeToLineEnd(): void;
    /**
     * Splits the line at the current selection (by inserting an `'\n'`).
     **/
    splitLine(): void;
    /**
     * Transposes current line.
     **/
    transposeLetters(): void;
    /**
     * Converts the current selection entirely into lowercase.
     **/
    toLowerCase(): void;
    /**
     * Converts the current selection entirely into uppercase.
     **/
    toUpperCase(): void;
    /**
     * Inserts an indentation into the current cursor position or indents the selected lines.
     *
     * @related EditSession.indentRows
     **/
    indent(): void;
    /**
     * Indents the current line.
     * @related EditSession.indentRows
     **/
    blockIndent(): void;
    /**
     * Outdents the current line.
     * @related EditSession.outdentRows
     **/
    blockOutdent(): void;
    sortLines(): void;
    /**
     * Given the currently selected range, this function either comments all the lines, or uncomments all of them.
     **/
    toggleCommentLines(): void;
    toggleBlockComment(): void;
    /**
     * Works like [[EditSession.getTokenAt]], except it returns a number.
     * @return {Number}
     **/
    getNumberAt(row: number, column: number): {
        value: string;
        start: number;
        end: number;
    };
    /**
     * If the character before the cursor is a number, this functions changes its value by `amount`.
     * @param {Number} amount The value to change the numeral by (can be negative to decrease value)
     */
    modifyNumber(amount: number): void;
    /**
     * Removes all the lines in the current selection
     * @related EditSession.remove
     **/
    removeLines(): void;
    duplicateSelection(): void;
    /**
     * Shifts all the selected lines down one row.
     *
     * @return {Number} On success, it returns -1.
     * @related EditSession.moveLinesUp
     **/
    moveLinesDown(): void;
    /**
     * Shifts all the selected lines up one row.
     * @return {Number} On success, it returns -1.
     * @related EditSession.moveLinesDown
     **/
    moveLinesUp(): void;
    /**
     * Moves a range of text from the given range to the given position. `toPosition` is an object that looks like this:
     * ```json
     *    { row: newRowLocation, column: newColumnLocation }
     * ```
     * @param {Range} fromRange The range of text you want moved within the document
     * @param {Object} toPosition The location (row and column) where you want to move the text to
     *
     * @return {Range} The new range where the text was moved to.
     * @related EditSession.moveText
     **/
    moveText(range: any, toPosition: any, copy: any): Range;
    /**
     * Copies all the selected lines up one row.
     * @return {Number} On success, returns 0.
     *
     **/
    copyLinesUp(): void;
    /**
     * Copies all the selected lines down one row.
     * @return {Number} On success, returns the number of new rows added; in other words, `lastRow - firstRow + 1`.
     * @related EditSession.duplicateLines
     *
     **/
    copyLinesDown(): void;
    /**
     * Executes a specific function, which can be anything that manipulates selected lines, such as copying them, duplicating them, or shifting them.
     * @param {Function} mover A method to call on each selected row
     *
     *
     **/
    private $moveLines(mover);
    /**
     * Returns an object indicating the currently selected rows.
     *
     * @return {Object}
     **/
    private $getSelectedRows();
    onCompositionStart(text?: string): void;
    onCompositionUpdate(text?: string): void;
    onCompositionEnd(): void;
    /**
     * {:VirtualRenderer.getFirstVisibleRow}
     *
     * @return {Number}
     * @related VirtualRenderer.getFirstVisibleRow
     **/
    getFirstVisibleRow(): number;
    /**
     * {:VirtualRenderer.getLastVisibleRow}
     *
     * @return {Number}
     * @related VirtualRenderer.getLastVisibleRow
     **/
    getLastVisibleRow(): number;
    /**
     * Indicates if the row is currently visible on the screen.
     * @param {Number} row The row to check
     *
     * @return {Boolean}
     **/
    isRowVisible(row: number): boolean;
    /**
     * Indicates if the entire row is currently visible on the screen.
     * @param {Number} row The row to check
     *
     *
     * @return {Boolean}
     **/
    isRowFullyVisible(row: number): boolean;
    /**
     * Returns the number of currently visibile rows.
     * @return {Number}
     **/
    private $getVisibleRowCount();
    /**
     * FIXME: The semantics of select are not easily understood.
     * @param direction +1 for page down, -1 for page up. Maybe N for N pages?
     * @param select true | false | undefined
     */
    private $moveByPage(direction, select?);
    /**
     * Selects the text from the current position of the document until where a "page down" finishes.
     **/
    selectPageDown(): void;
    /**
     * Selects the text from the current position of the document until where a "page up" finishes.
     **/
    selectPageUp(): void;
    /**
     * Shifts the document to wherever "page down" is, as well as moving the cursor position.
     **/
    gotoPageDown(): void;
    /**
     * Shifts the document to wherever "page up" is, as well as moving the cursor position.
     **/
    gotoPageUp(): void;
    /**
     * Scrolls the document to wherever "page down" is, without changing the cursor position.
     **/
    scrollPageDown(): void;
    /**
     * Scrolls the document to wherever "page up" is, without changing the cursor position.
     **/
    scrollPageUp(): void;
    /**
     * Moves the editor to the specified row.
     * @related VirtualRenderer.scrollToRow
     */
    scrollToRow(row: number): void;
    /**
     * Scrolls to a line. If `center` is `true`, it puts the line in middle of screen (or attempts to).
     * @param {Number} line The line to scroll to
     * @param {Boolean} center If `true`
     * @param {Boolean} animate If `true` animates scrolling
     * @param {Function} callback Function to be called when the animation has finished
     *
     *
     * @related VirtualRenderer.scrollToLine
     **/
    scrollToLine(line: number, center: boolean, animate: boolean, callback?: () => any): void;
    /**
     * Attempts to center the current selection on the screen.
     **/
    centerSelection(): void;
    /**
     * Gets the current position of the cursor.
     * @return {Object} An object that looks something like this:
     *
     * ```json
     * { row: currRow, column: currCol }
     * ```
     *
     * @related Selection.getCursor
     **/
    getCursorPosition(): {
        row: number;
        column: number;
    };
    /**
     * Returns the screen position of the cursor.
     **/
    getCursorPositionScreen(): {
        row: number;
        column: number;
    };
    /**
     * {:Selection.getRange}
     * @return {Range}
     * @related Selection.getRange
     **/
    getSelectionRange(): Range;
    /**
     * Selects all the text in editor.
     * @related Selection.selectAll
     **/
    selectAll(): void;
    /**
     * {:Selection.clearSelection}
     * @related Selection.clearSelection
     **/
    clearSelection(): void;
    /**
     * Moves the cursor to the specified row and column. Note that this does not de-select the current selection.
     * @param {Number} row The new row number
     * @param {Number} column The new column number
     * @param {boolean} animate
     *
     * @related Selection.moveCursorTo
     **/
    moveCursorTo(row: number, column: number, animate?: boolean): void;
    /**
     * Moves the cursor to the position indicated by `pos.row` and `pos.column`.
     * @param {Object} pos An object with two properties, row and column
     *
     *
     * @related Selection.moveCursorToPosition
     **/
    moveCursorToPosition(pos: any): void;
    /**
     * Moves the cursor's row and column to the next matching bracket or HTML tag.
     *
     **/
    jumpToMatching(select: boolean): void;
    /**
     * Moves the cursor to the specified line number, and also into the indiciated column.
     * @param {Number} lineNumber The line number to go to
     * @param {Number} column A column number to go to
     * @param {Boolean} animate If `true` animates scolling
     **/
    gotoLine(lineNumber: number, column?: number, animate?: boolean): void;
    /**
     * Moves the cursor to the specified row and column. Note that this does de-select the current selection.
     * @param {Number} row The new row number
     * @param {Number} column The new column number
     *
     *
     * @related Editor.moveCursorTo
     **/
    navigateTo(row: number, column: number): void;
    /**
     * Moves the cursor up in the document the specified number of times. Note that this does de-select the current selection.
     * @param {Number} times The number of times to change navigation
     *
     *
     **/
    navigateUp(times: number): void;
    /**
     * Moves the cursor down in the document the specified number of times. Note that this does de-select the current selection.
     * @param {Number} times The number of times to change navigation
     *
     *
     **/
    navigateDown(times: number): void;
    /**
     * Moves the cursor left in the document the specified number of times. Note that this does de-select the current selection.
     * @param {Number} times The number of times to change navigation
     *
     *
     **/
    navigateLeft(times: number): void;
    /**
     * Moves the cursor right in the document the specified number of times. Note that this does de-select the current selection.
     * @param {Number} times The number of times to change navigation
     *
     *
     **/
    navigateRight(times: number): void;
    /**
     *
     * Moves the cursor to the start of the current line. Note that this does de-select the current selection.
     **/
    navigateLineStart(): void;
    /**
     *
     * Moves the cursor to the end of the current line. Note that this does de-select the current selection.
     **/
    navigateLineEnd(): void;
    /**
     *
     * Moves the cursor to the end of the current file. Note that this does de-select the current selection.
     **/
    navigateFileEnd(): void;
    /**
     *
     * Moves the cursor to the start of the current file. Note that this does de-select the current selection.
     **/
    navigateFileStart(): void;
    /**
     *
     * Moves the cursor to the word immediately to the right of the current position. Note that this does de-select the current selection.
     **/
    navigateWordRight(): void;
    /**
     *
     * Moves the cursor to the word immediately to the left of the current position. Note that this does de-select the current selection.
     **/
    navigateWordLeft(): void;
    /**
     * Replaces the first occurance of `options.needle` with the value in `replacement`.
     * @param {String} replacement The text to replace with
     * @param {Object} options The [[Search `Search`]] options to use
     *
     *
     **/
    replace(replacement: string, options: any): number;
    /**
     * Replaces all occurances of `options.needle` with the value in `replacement`.
     * @param {String} replacement The text to replace with
     * @param {Object} options The [[Search `Search`]] options to use
     *
     *
     **/
    replaceAll(replacement: string, options: any): number;
    private $tryReplace(range, replacement);
    /**
     * {:Search.getOptions} For more information on `options`, see [[Search `Search`]].
     * @related Search.getOptions
     * @return {Object}
     **/
    getLastSearchOptions(): {};
    /**
     * Attempts to find `needle` within the document. For more information on `options`, see [[Search `Search`]].
     * @param {String} needle The text to search for (optional)
     * @param {Object} options An object defining various search properties
     * @param {Boolean} animate If `true` animate scrolling
     *
     *
     * @related Search.find
     **/
    find(needle: (string | RegExp), options: any, animate?: boolean): Range;
    /**
     * Performs another search for `needle` in the document. For more information on `options`, see [[Search `Search`]].
     * @param {Object} options search options
     * @param {Boolean} animate If `true` animate scrolling
     *
     *
     * @related Editor.find
     **/
    findNext(needle?: (string | RegExp), animate?: boolean): void;
    /**
     * Performs a search for `needle` backwards. For more information on `options`, see [[Search `Search`]].
     * @param {Object} options search options
     * @param {Boolean} animate If `true` animate scrolling
     *
     *
     * @related Editor.find
     **/
    findPrevious(needle?: (string | RegExp), animate?: boolean): void;
    revealRange(range: Range, animate: boolean): void;
    /**
     * {:UndoManager.undo}
     * @related UndoManager.undo
     **/
    undo(): void;
    /**
     * {:UndoManager.redo}
     * @related UndoManager.redo
     **/
    redo(): void;
    /**
     *
     * Cleans up the entire editor.
     **/
    destroy(): void;
    /**
     * Enables automatic scrolling of the cursor into view when editor itself is inside scrollable element
     * @param {Boolean} enable default true
     **/
    setAutoScrollEditorIntoView(enable: boolean): void;
    $resetCursorStyle(): void;
}
