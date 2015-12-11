import Annotation from './Annotation';
import Gutter from "./layer/Gutter";
import Text from "./layer/Text";
import Cursor from "./layer/Cursor";
import VScrollBar from "./VScrollBar";
import HScrollBar from "./HScrollBar";
import EventEmitterClass from "./lib/event_emitter";
import EditSession from './EditSession';
import OptionsProvider from "./OptionsProvider";
/**
 * The class that is responsible for drawing everything you see on the screen!
 * @related editor.renderer
 * @class VirtualRenderer
 **/
export default class VirtualRenderer extends EventEmitterClass implements OptionsProvider {
    textarea: HTMLTextAreaElement;
    container: HTMLElement;
    scrollLeft: number;
    scrollTop: number;
    layerConfig: {
        width: number;
        padding: number;
        firstRow: number;
        firstRowScreen: number;
        lastRow: number;
        lineHeight: number;
        characterWidth: number;
        minHeight: number;
        maxHeight: number;
        offset: number;
        height: number;
        gutterOffset: number;
    };
    $maxLines: number;
    $minLines: number;
    $cursorLayer: Cursor;
    $gutterLayer: Gutter;
    $padding: number;
    private $frozen;
    private $themeId;
    /**
     * The loaded theme object. This allows us to remove a theme.
     */
    private theme;
    private $timer;
    private STEPS;
    $keepTextAreaAtCursor: boolean;
    $gutter: any;
    scroller: any;
    content: HTMLDivElement;
    $textLayer: Text;
    private $markerFront;
    private $markerBack;
    private canvas;
    private $horizScroll;
    private $vScroll;
    scrollBarH: HScrollBar;
    scrollBarV: VScrollBar;
    private $scrollAnimation;
    $scrollbarWidth: number;
    private session;
    private scrollMargin;
    private $fontMetrics;
    private $allowBoldFonts;
    private cursorPos;
    $size: any;
    private $loop;
    private $changedLines;
    private $changes;
    private resizing;
    private $gutterLineHighlight;
    gutterWidth: number;
    private $gutterWidth;
    private $showPrintMargin;
    private $printMarginEl;
    private getOption;
    private setOption;
    private characterWidth;
    private $printMarginColumn;
    private lineHeight;
    private $extraHeight;
    private $composition;
    private $hScrollBarAlwaysVisible;
    private $vScrollBarAlwaysVisible;
    private $showGutter;
    private showInvisibles;
    private $animatedScroll;
    private $scrollPastEnd;
    private $highlightGutterLine;
    private desiredHeight;
    /**
     * Constructs a new `VirtualRenderer` within the `container` specified.
     * @class VirtualRenderer
     * @constructor
     * @param container {HTMLElement} The root element of the editor.
     */
    constructor(container: HTMLElement);
    /**
     * @property maxLines
     * @type number
     */
    maxLines: number;
    /**
     * @property keepTextAreaAtCursor
     * @type boolean
     */
    keepTextAreaAtCursor: boolean;
    /**
     * Sets the <code>style</code> property of the content to "default".
     *
     * @method setDefaultCursorStyle
     * @return {void}
     */
    setDefaultCursorStyle(): void;
    /**
     * Sets the <code>opacity</code> of the cursor layer to "0".
     *
     * @method setCursorLayerOff
     * @return {VirtualRenderer}
     * @chainable
     */
    setCursorLayerOff(): VirtualRenderer;
    /**
     * @method updateCharacterSize
     * @return {void}
     */
    updateCharacterSize(): void;
    /**
     * Associates the renderer with a different EditSession.
     *
     * @method setSession
     * @param session {EditSession}
     * @return {void}
     */
    setSession(session: EditSession): void;
    /**
     * Triggers a partial update of the text, from the range given by the two parameters.
     *
     * @param {Number} firstRow The first row to update.
     * @param {Number} lastRow The last row to update.
     * @param [force] {boolean}
     * @return {void}
     */
    updateLines(firstRow: number, lastRow: number, force?: boolean): void;
    onChangeNewLineMode(): void;
    onChangeTabSize(): void;
    /**
     * Triggers a full update of the text, for all the rows.
     */
    updateText(): void;
    /**
     * Triggers a full update of all the layers, for all the rows.
     * @param {Boolean} force If `true`, forces the changes through
     */
    updateFull(force?: boolean): void;
    /**
     * Updates the font size.
     */
    updateFontSize(): void;
    $updateSizeAsync(): void;
    /**
     * [Triggers a resize of the editor.]{: #VirtualRenderer.onResize}
     * @param {Boolean} force If `true`, recomputes the size, even if the height and width haven't changed
     * @param {Number} gutterWidth The width of the gutter in pixels
     * @param {Number} width The width of the editor in pixels
     * @param {Number} height The hiehgt of the editor, in pixels
     */
    onResize(force?: boolean, gutterWidth?: number, width?: number, height?: number): number;
    $updateCachedSize(force: any, gutterWidth: any, width: any, height: any): number;
    onGutterResize(): void;
    /**
    * Adjusts the wrap limit, which is the number of characters that can fit within the width of the edit area on screen.
    **/
    adjustWrapLimit(): boolean;
    /**
     * Identifies whether you want to have an animated scroll or not.
     *
     * @method setAnimatedScroll
     * @param shouldAnimate {boolean} Set to `true` to show animated scrolls.
     * @return {void}
     */
    setAnimatedScroll(shouldAnimate: boolean): void;
    /**
     * Returns whether an animated scroll happens or not.
     *
     * @method getAnimatedScroll
     * @return {Boolean}
     */
    getAnimatedScroll(): boolean;
    /**
     * Identifies whether you want to show invisible characters or not.
     * @param {Boolean} showInvisibles Set to `true` to show invisibles
     */
    setShowInvisibles(showInvisibles: boolean): void;
    /**
     * Returns whether invisible characters are being shown or not.
     * @return {Boolean}
     */
    getShowInvisibles(): boolean;
    getDisplayIndentGuides(): boolean;
    setDisplayIndentGuides(displayIndentGuides: boolean): void;
    /**
     * Identifies whether you want to show the print margin or not.
     * @param {Boolean} showPrintMargin Set to `true` to show the print margin
     *
     */
    setShowPrintMargin(showPrintMargin: boolean): void;
    /**
     * Returns whether the print margin is being shown or not.
     * @return {Boolean}
     */
    getShowPrintMargin(): boolean;
    /**
     * Sets the column defining where the print margin should be.
     * @param {Number} printMarginColumn Specifies the new print margin
     */
    setPrintMarginColumn(printMarginColumn: number): void;
    /**
     * Returns the column number of where the print margin is.
     * @return {Number}
     */
    getPrintMarginColumn(): number;
    /**
     * Returns `true` if the gutter is being shown.
     * @return {Boolean}
     */
    getShowGutter(): any;
    /**
    * Identifies whether you want to show the gutter or not.
    * @param {Boolean} show Set to `true` to show the gutter
    *
    **/
    setShowGutter(show: any): any;
    getFadeFoldWidgets(): any;
    setFadeFoldWidgets(show: any): void;
    setHighlightGutterLine(shouldHighlight: any): void;
    getHighlightGutterLine(): any;
    $updateGutterLineHighlight(): void;
    $updatePrintMargin(): void;
    /**
    *
    * Returns the root element containing this renderer.
    * @return {DOMElement}
    **/
    getContainerElement(): HTMLElement;
    /**
    *
    * Returns the element that the mouse events are attached to
    * @return {DOMElement}
    **/
    getMouseEventTarget(): HTMLDivElement;
    /**
    *
    * Returns the element to which the hidden text area is added.
    * @return {DOMElement}
    **/
    getTextAreaContainer(): HTMLElement;
    $moveTextAreaToCursor(): void;
    /**
    *
    * [Returns the index of the first visible row.]{: #VirtualRenderer.getFirstVisibleRow}
    * @return {Number}
    **/
    getFirstVisibleRow(): number;
    /**
    *
    * Returns the index of the first fully visible row. "Fully" here means that the characters in the row are not truncated; that the top and the bottom of the row are on the screen.
    * @return {Number}
    **/
    getFirstFullyVisibleRow(): number;
    /**
    *
    * Returns the index of the last fully visible row. "Fully" here means that the characters in the row are not truncated; that the top and the bottom of the row are on the screen.
    * @return {Number}
    **/
    getLastFullyVisibleRow(): number;
    /**
    *
    * [Returns the index of the last visible row.]{: #VirtualRenderer.getLastVisibleRow}
    * @return {Number}
    **/
    getLastVisibleRow(): number;
    /**
    * Sets the padding for all the layers.
    * @param {number} padding A new padding value (in pixels)
    **/
    setPadding(padding: number): void;
    setScrollMargin(top: any, bottom: any, left: any, right: any): void;
    /**
     * Returns whether the horizontal scrollbar is set to be always visible.
     * @return {Boolean}
     **/
    getHScrollBarAlwaysVisible(): any;
    /**
     * Identifies whether you want to show the horizontal scrollbar or not.
     * @param {Boolean} alwaysVisible Set to `true` to make the horizontal scroll bar visible
     **/
    setHScrollBarAlwaysVisible(alwaysVisible: any): void;
    /**
     * Returns whether the vertical scrollbar is set to be always visible.
     * @return {Boolean}
     **/
    getVScrollBarAlwaysVisible(): any;
    /**
     * Identifies whether you want to show the vertical scrollbar or not.
     * @param {Boolean} alwaysVisible Set to `true` to make the vertical scroll bar visible
     */
    setVScrollBarAlwaysVisible(alwaysVisible: any): void;
    $updateScrollBarV(): void;
    $updateScrollBarH(): void;
    freeze(): void;
    unfreeze(): void;
    $renderChanges(changes: any, force: any): number;
    $autosize(): void;
    $computeLayerConfig(): number;
    $updateLines(): boolean;
    $getLongestLine(): number;
    /**
    *
    * Schedules an update to all the front markers in the document.
    **/
    updateFrontMarkers(): void;
    /**
    *
    * Schedules an update to all the back markers in the document.
    **/
    updateBackMarkers(): void;
    /**
    *
    * Redraw breakpoints.
    **/
    updateBreakpoints(): void;
    /**
     * Sets annotations for the gutter.
     *
     * @method setAnnotations
     * @param {Annotation[]} annotations An array containing annotations.
     * @return {void}
     */
    setAnnotations(annotations: Annotation[]): void;
    /**
    *
    * Updates the cursor icon.
    **/
    updateCursor(): void;
    /**
    *
    * Hides the cursor icon.
    **/
    hideCursor(): void;
    /**
    *
    * Shows the cursor icon.
    **/
    showCursor(): void;
    scrollSelectionIntoView(anchor: any, lead: any, offset?: any): void;
    /**
    *
    * Scrolls the cursor into the first visibile area of the editor
    **/
    scrollCursorIntoView(cursor?: any, offset?: any, $viewMargin?: any): void;
    /**
    * {:EditSession.getScrollTop}
    * @related EditSession.getScrollTop
    * @return {Number}
    **/
    getScrollTop(): number;
    /**
    * {:EditSession.getScrollLeft}
    * @related EditSession.getScrollLeft
    * @return {Number}
    **/
    getScrollLeft(): number;
    /**
    *
    * Returns the first visible row, regardless of whether it's fully visible or not.
    * @return {Number}
    **/
    getScrollTopRow(): number;
    /**
    *
    * Returns the last visible row, regardless of whether it's fully visible or not.
    * @return {Number}
    **/
    getScrollBottomRow(): number;
    /**
    * Gracefully scrolls from the top of the editor to the row indicated.
    * @param {Number} row A row id
    *
    *
    * @related EditSession.setScrollTop
    **/
    scrollToRow(row: number): void;
    alignCursor(cursor: any, alignment: any): number;
    $calcSteps(fromValue: number, toValue: number): number[];
    /**
     * Gracefully scrolls the editor to the row indicated.
     * @param {Number} line A line number
     * @param {Boolean} center If `true`, centers the editor the to indicated line
     * @param {Boolean} animate If `true` animates scrolling
     * @param {Function} callback Function to be called after the animation has finished
     */
    scrollToLine(line: number, center: boolean, animate: boolean, callback: () => void): void;
    animateScrolling(fromValue: number, callback?: any): void;
    /**
     * Scrolls the editor to the y pixel indicated.
     * @param {Number} scrollTop The position to scroll to
     */
    scrollToY(scrollTop: number): void;
    /**
     * Scrolls the editor across the x-axis to the pixel indicated.
     * @param {Number} scrollLeft The position to scroll to
     **/
    scrollToX(scrollLeft: number): void;
    /**
    * Scrolls the editor across both x- and y-axes.
    * @param {Number} x The x value to scroll to
    * @param {Number} y The y value to scroll to
    **/
    scrollTo(x: number, y: number): void;
    /**
    * Scrolls the editor across both x- and y-axes.
    * @param {Number} deltaX The x value to scroll by
    * @param {Number} deltaY The y value to scroll by
    **/
    scrollBy(deltaX: number, deltaY: number): void;
    /**
    * Returns `true` if you can still scroll by either parameter; in other words, you haven't reached the end of the file or line.
    * @param {Number} deltaX The x value to scroll by
    * @param {Number} deltaY The y value to scroll by
    *
    *
    * @return {Boolean}
    **/
    isScrollableBy(deltaX: number, deltaY: number): boolean;
    pixelToScreenCoordinates(x: number, y: number): {
        row: number;
        column: number;
        side: number;
    };
    screenToTextCoordinates(clientX: number, clientY: number): {
        row: number;
        column: number;
    };
    /**
    * Returns an object containing the `pageX` and `pageY` coordinates of the document position.
    * @param {Number} row The document row position
    * @param {Number} column The document column position
    * @return {Object}
    **/
    textToScreenCoordinates(row: number, column: number): {
        pageX: number;
        pageY: number;
    };
    /**
    *
    * Focuses the current container.
    **/
    visualizeFocus(): void;
    /**
    *
    * Blurs the current container.
    **/
    visualizeBlur(): void;
    /**
     * @method showComposition
     * @param position
     * @private
     */
    showComposition(position: {
        row: number;
        column: number;
    }): void;
    /**
     * @param {String} text A string of text to use
     *
     * Sets the inner text of the current composition to `text`.
     */
    setCompositionText(text?: string): void;
    /**
     * Hides the current composition.
     */
    hideComposition(): void;
    /**
     * Sets a new theme for the editor.
     * `theme` should exist, and be a directory path, like `ace/theme/textmate`.
     *
     * @method setTheme
     * @param theme {String} theme The path to a theme
     * @param theme {Function} cb optional callback
     * @return {void}
     */
    setTheme(theme: any, cb?: () => any): void;
    /**
     * Returns the path of the current theme.
     *
     * @method getTheme
     * @return {string}
     */
    getTheme(): string;
    /**
     * [Adds a new class, `style`, to the editor.]{: #VirtualRenderer.setStyle}
     * @param {String} style A class name
     *
     */
    setStyle(style: string, include?: boolean): void;
    /**
     * [Removes the class `style` from the editor.]{: #VirtualRenderer.unsetStyle}
     * @param {String} style A class name
     */
    unsetStyle(style: string): void;
    setCursorStyle(style: string): void;
    /**
     * @param {String} cursorStyle A css cursor style
     */
    setMouseCursor(cursorStyle: string): void;
    /**
     * Destroys the text and cursor layers for this renderer.
     */
    destroy(): void;
}
