/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", "./lib/dom", "./config", "./lib/useragent", "./layer/Gutter", "./layer/Marker", "./layer/Text", "./layer/Cursor", "./VScrollBar", "./HScrollBar", "./RenderLoop", "./layer/FontMetrics", "./lib/event_emitter"], function (require, exports, dom_1, config_1, useragent_1, Gutter_1, Marker_1, Text_1, Cursor_1, VScrollBar_1, HScrollBar_1, RenderLoop_1, FontMetrics_1, event_emitter_1) {
    // FIXME
    // import editorCss = require("./requirejs/text!./css/editor.css");
    // importCssString(editorCss, "ace_editor");
    var CHANGE_CURSOR = 1;
    var CHANGE_MARKER = 2;
    var CHANGE_GUTTER = 4;
    var CHANGE_SCROLL = 8;
    var CHANGE_LINES = 16;
    var CHANGE_TEXT = 32;
    var CHANGE_SIZE = 64;
    var CHANGE_MARKER_BACK = 128;
    var CHANGE_MARKER_FRONT = 256;
    var CHANGE_FULL = 512;
    var CHANGE_H_SCROLL = 1024;
    /**
     * The class that is responsible for drawing everything you see on the screen!
     * @related editor.renderer
     * @class VirtualRenderer
     **/
    var VirtualRenderer = (function (_super) {
        __extends(VirtualRenderer, _super);
        /**
         * Constructs a new `VirtualRenderer` within the `container` specified.
         * @class VirtualRenderer
         * @constructor
         * @param container {HTMLElement} The root element of the editor.
         */
        function VirtualRenderer(container) {
            _super.call(this);
            this.scrollLeft = 0;
            this.scrollTop = 0;
            this.layerConfig = {
                width: 1,
                padding: 0,
                firstRow: 0,
                firstRowScreen: 0,
                lastRow: 0,
                lineHeight: 0,
                characterWidth: 0,
                minHeight: 1,
                maxHeight: 1,
                offset: 0,
                height: 1,
                gutterOffset: 1
            };
            this.$padding = 0;
            this.$frozen = false;
            this.STEPS = 8;
            this.scrollMargin = {
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                v: 0,
                h: 0
            };
            this.$changes = 0;
            var _self = this;
            this.container = container || dom_1.createElement("div");
            // TODO: this breaks rendering in Cloud9 with multiple ace instances
            // // Imports CSS once per DOM document ('ace_editor' serves as an identifier).
            // importCssString(editorCss, "ace_editor", container.ownerDocument);
            // in IE <= 9 the native cursor always shines through
            this.$keepTextAreaAtCursor = !useragent_1.isOldIE;
            dom_1.addCssClass(this.container, "ace_editor");
            this.$gutter = dom_1.createElement("div");
            this.$gutter.className = "ace_gutter";
            this.container.appendChild(this.$gutter);
            this.scroller = dom_1.createElement("div");
            this.scroller.className = "ace_scroller";
            this.container.appendChild(this.scroller);
            this.content = dom_1.createElement("div");
            this.content.className = "ace_content";
            this.scroller.appendChild(this.content);
            this.$gutterLayer = new Gutter_1.default(this.$gutter);
            this.$gutterLayer.on("changeGutterWidth", this.onGutterResize.bind(this));
            this.$markerBack = new Marker_1.default(this.content);
            var textLayer = this.$textLayer = new Text_1.default(this.content);
            this.canvas = textLayer.element;
            this.$markerFront = new Marker_1.default(this.content);
            this.$cursorLayer = new Cursor_1.default(this.content);
            // Indicates whether the horizontal scrollbar is visible
            this.$horizScroll = false;
            this.$vScroll = false;
            this.scrollBarV = new VScrollBar_1.default(this.container, this);
            this.scrollBarH = new HScrollBar_1.default(this.container, this);
            this.scrollBarV.on("scroll", function (event, scrollBar) {
                if (!_self.$scrollAnimation) {
                    _self.session.setScrollTop(event.data - _self.scrollMargin.top);
                }
            });
            this.scrollBarH.on("scroll", function (event, scrollBar) {
                if (!_self.$scrollAnimation) {
                    _self.session.setScrollLeft(event.data - _self.scrollMargin.left);
                }
            });
            this.cursorPos = {
                row: 0,
                column: 0
            };
            this.$fontMetrics = new FontMetrics_1.default(this.container, 500);
            this.$textLayer.$setFontMetrics(this.$fontMetrics);
            this.$textLayer.on("changeCharacterSize", function (event, text) {
                _self.updateCharacterSize();
                _self.onResize(true, _self.gutterWidth, _self.$size.width, _self.$size.height);
                _self._signal("changeCharacterSize", event);
            });
            this.$size = {
                width: 0,
                height: 0,
                scrollerHeight: 0,
                scrollerWidth: 0,
                $dirty: true
            };
            this.$loop = new RenderLoop_1.default(this.$renderChanges.bind(this), this.container.ownerDocument.defaultView);
            this.$loop.schedule(CHANGE_FULL);
            this.updateCharacterSize();
            this.setPadding(4);
            config_1.resetOptions(this);
            config_1._emit("renderer", this);
        }
        Object.defineProperty(VirtualRenderer.prototype, "maxLines", {
            /**
             * @property maxLines
             * @type number
             */
            set: function (maxLines) {
                this.$maxLines = maxLines;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(VirtualRenderer.prototype, "keepTextAreaAtCursor", {
            /**
             * @property keepTextAreaAtCursor
             * @type boolean
             */
            set: function (keepTextAreaAtCursor) {
                this.$keepTextAreaAtCursor = keepTextAreaAtCursor;
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Sets the <code>style</code> property of the content to "default".
         *
         * @method setDefaultCursorStyle
         * @return {void}
         */
        VirtualRenderer.prototype.setDefaultCursorStyle = function () {
            this.content.style.cursor = "default";
        };
        /**
         * Sets the <code>opacity</code> of the cursor layer to "0".
         *
         * @method setCursorLayerOff
         * @return {VirtualRenderer}
         * @chainable
         */
        VirtualRenderer.prototype.setCursorLayerOff = function () {
            var noop = function () { };
            this.$cursorLayer.restartTimer = noop;
            this.$cursorLayer.element.style.opacity = "0";
            return this;
        };
        /**
         * @method updateCharacterSize
         * @return {void}
         */
        VirtualRenderer.prototype.updateCharacterSize = function () {
            // FIXME: DGH allowBoldFonts does not exist on Text
            if (this.$textLayer['allowBoldFonts'] != this.$allowBoldFonts) {
                this.$allowBoldFonts = this.$textLayer['allowBoldFonts'];
                this.setStyle("ace_nobold", !this.$allowBoldFonts);
            }
            this.layerConfig.characterWidth = this.characterWidth = this.$textLayer.getCharacterWidth();
            this.layerConfig.lineHeight = this.lineHeight = this.$textLayer.getLineHeight();
            this.$updatePrintMargin();
        };
        /**
         * Associates the renderer with a different EditSession.
         *
         * @method setSession
         * @param session {EditSession}
         * @return {void}
         */
        VirtualRenderer.prototype.setSession = function (session) {
            if (this.session) {
                this.session.doc.off("changeNewLineMode", this.onChangeNewLineMode);
            }
            this.session = session;
            if (!session) {
                return;
            }
            if (this.scrollMargin.top && session.getScrollTop() <= 0) {
                session.setScrollTop(-this.scrollMargin.top);
            }
            this.$cursorLayer.setSession(session);
            this.$markerBack.setSession(session);
            this.$markerFront.setSession(session);
            this.$gutterLayer.setSession(session);
            this.$textLayer.setSession(session);
            this.$loop.schedule(CHANGE_FULL);
            this.session.$setFontMetrics(this.$fontMetrics);
            this.onChangeNewLineMode = this.onChangeNewLineMode.bind(this);
            this.onChangeNewLineMode();
            this.session.doc.on("changeNewLineMode", this.onChangeNewLineMode);
        };
        /**
         * Triggers a partial update of the text, from the range given by the two parameters.
         *
         * @param {Number} firstRow The first row to update.
         * @param {Number} lastRow The last row to update.
         * @param [force] {boolean}
         * @return {void}
         */
        VirtualRenderer.prototype.updateLines = function (firstRow, lastRow, force) {
            if (lastRow === undefined) {
                lastRow = Infinity;
            }
            if (!this.$changedLines) {
                this.$changedLines = { firstRow: firstRow, lastRow: lastRow };
            }
            else {
                if (this.$changedLines.firstRow > firstRow) {
                    this.$changedLines.firstRow = firstRow;
                }
                if (this.$changedLines.lastRow < lastRow) {
                    this.$changedLines.lastRow = lastRow;
                }
            }
            // If the change happened offscreen above us then it's possible
            // that a new line wrap will affect the position of the lines on our
            // screen so they need redrawn.
            // TODO: better solution is to not change scroll position when text is changed outside of visible area
            if (this.$changedLines.lastRow < this.layerConfig.firstRow) {
                if (force) {
                    this.$changedLines.lastRow = this.layerConfig.lastRow;
                }
                else {
                    return;
                }
            }
            if (this.$changedLines.firstRow > this.layerConfig.lastRow) {
                return;
            }
            this.$loop.schedule(CHANGE_LINES);
        };
        VirtualRenderer.prototype.onChangeNewLineMode = function () {
            this.$loop.schedule(CHANGE_TEXT);
            this.$textLayer.$updateEolChar();
        };
        VirtualRenderer.prototype.onChangeTabSize = function () {
            if (this.$loop) {
                if (this.$loop.schedule) {
                    this.$loop.schedule(CHANGE_TEXT | CHANGE_MARKER);
                }
                else {
                }
            }
            else {
            }
            if (this.$textLayer) {
                if (this.$textLayer.onChangeTabSize) {
                    this.$textLayer.onChangeTabSize();
                }
                else {
                }
            }
            else {
            }
        };
        /**
         * Triggers a full update of the text, for all the rows.
         */
        VirtualRenderer.prototype.updateText = function () {
            this.$loop.schedule(CHANGE_TEXT);
        };
        /**
         * Triggers a full update of all the layers, for all the rows.
         * @param {Boolean} force If `true`, forces the changes through
         */
        VirtualRenderer.prototype.updateFull = function (force) {
            if (force)
                this.$renderChanges(CHANGE_FULL, true);
            else
                this.$loop.schedule(CHANGE_FULL);
        };
        /**
         * Updates the font size.
         */
        VirtualRenderer.prototype.updateFontSize = function () {
            this.$textLayer.checkForSizeChanges();
        };
        VirtualRenderer.prototype.$updateSizeAsync = function () {
            if (this.$loop.pending) {
                this.$size.$dirty = true;
            }
            else {
                this.onResize();
            }
        };
        /**
         * [Triggers a resize of the editor.]{: #VirtualRenderer.onResize}
         * @param {Boolean} force If `true`, recomputes the size, even if the height and width haven't changed
         * @param {Number} gutterWidth The width of the gutter in pixels
         * @param {Number} width The width of the editor in pixels
         * @param {Number} height The hiehgt of the editor, in pixels
         */
        VirtualRenderer.prototype.onResize = function (force, gutterWidth, width, height) {
            if (this.resizing > 2)
                return;
            else if (this.resizing > 0)
                this.resizing++;
            else
                this.resizing = force ? 1 : 0;
            // `|| el.scrollHeight` is required for outosizing editors on ie
            // where elements with clientHeight = 0 alsoe have clientWidth = 0
            var el = this.container;
            if (!height)
                height = el.clientHeight || el.scrollHeight;
            if (!width)
                width = el.clientWidth || el.scrollWidth;
            var changes = this.$updateCachedSize(force, gutterWidth, width, height);
            if (!this.$size.scrollerHeight || (!width && !height))
                return this.resizing = 0;
            if (force)
                this.$gutterLayer.$padding = null;
            if (force)
                this.$renderChanges(changes | this.$changes, true);
            else
                this.$loop.schedule(changes | this.$changes);
            if (this.resizing)
                this.resizing = 0;
        };
        VirtualRenderer.prototype.$updateCachedSize = function (force, gutterWidth, width, height) {
            height -= (this.$extraHeight || 0);
            var changes = 0;
            var size = this.$size;
            var oldSize = {
                width: size.width,
                height: size.height,
                scrollerHeight: size.scrollerHeight,
                scrollerWidth: size.scrollerWidth
            };
            if (height && (force || size.height != height)) {
                size.height = height;
                changes |= CHANGE_SIZE;
                size.scrollerHeight = size.height;
                if (this.$horizScroll)
                    size.scrollerHeight -= this.scrollBarH.height;
                this.scrollBarV.element.style.bottom = this.scrollBarH.height + "px";
                changes = changes | CHANGE_SCROLL;
            }
            if (width && (force || size.width != width)) {
                changes |= CHANGE_SIZE;
                size.width = width;
                if (gutterWidth == null)
                    gutterWidth = this.$showGutter ? this.$gutter.offsetWidth : 0;
                this.gutterWidth = gutterWidth;
                this.scrollBarH.element.style.left =
                    this.scroller.style.left = gutterWidth + "px";
                size.scrollerWidth = Math.max(0, width - gutterWidth - this.scrollBarV.width);
                this.scrollBarH.element.style.right =
                    this.scroller.style.right = this.scrollBarV.width + "px";
                this.scroller.style.bottom = this.scrollBarH.height + "px";
                if (this.session && this.session.getUseWrapMode() && this.adjustWrapLimit() || force)
                    changes |= CHANGE_FULL;
            }
            size.$dirty = !width || !height;
            if (changes)
                this._signal("resize", oldSize);
            return changes;
        };
        VirtualRenderer.prototype.onGutterResize = function () {
            var gutterWidth = this.$showGutter ? this.$gutter.offsetWidth : 0;
            if (gutterWidth != this.gutterWidth)
                this.$changes |= this.$updateCachedSize(true, gutterWidth, this.$size.width, this.$size.height);
            if (this.session.getUseWrapMode() && this.adjustWrapLimit()) {
                this.$loop.schedule(CHANGE_FULL);
            }
            else if (this.$size.$dirty) {
                this.$loop.schedule(CHANGE_FULL);
            }
            else {
                this.$computeLayerConfig();
                this.$loop.schedule(CHANGE_MARKER);
            }
        };
        /**
        * Adjusts the wrap limit, which is the number of characters that can fit within the width of the edit area on screen.
        **/
        VirtualRenderer.prototype.adjustWrapLimit = function () {
            var availableWidth = this.$size.scrollerWidth - this.$padding * 2;
            var limit = Math.floor(availableWidth / this.characterWidth);
            return this.session.adjustWrapLimit(limit, this.$showPrintMargin && this.$printMarginColumn);
        };
        /**
         * Identifies whether you want to have an animated scroll or not.
         *
         * @method setAnimatedScroll
         * @param shouldAnimate {boolean} Set to `true` to show animated scrolls.
         * @return {void}
         */
        VirtualRenderer.prototype.setAnimatedScroll = function (shouldAnimate) {
            this.setOption("animatedScroll", shouldAnimate);
        };
        /**
         * Returns whether an animated scroll happens or not.
         *
         * @method getAnimatedScroll
         * @return {Boolean}
         */
        VirtualRenderer.prototype.getAnimatedScroll = function () {
            return this.$animatedScroll;
        };
        /**
         * Identifies whether you want to show invisible characters or not.
         * @param {Boolean} showInvisibles Set to `true` to show invisibles
         */
        VirtualRenderer.prototype.setShowInvisibles = function (showInvisibles) {
            this.setOption("showInvisibles", showInvisibles);
        };
        /**
         * Returns whether invisible characters are being shown or not.
         * @return {Boolean}
         */
        VirtualRenderer.prototype.getShowInvisibles = function () {
            return this.getOption("showInvisibles");
        };
        VirtualRenderer.prototype.getDisplayIndentGuides = function () {
            return this.getOption("displayIndentGuides");
        };
        VirtualRenderer.prototype.setDisplayIndentGuides = function (displayIndentGuides) {
            this.setOption("displayIndentGuides", displayIndentGuides);
        };
        /**
         * Identifies whether you want to show the print margin or not.
         * @param {Boolean} showPrintMargin Set to `true` to show the print margin
         *
         */
        VirtualRenderer.prototype.setShowPrintMargin = function (showPrintMargin) {
            this.setOption("showPrintMargin", showPrintMargin);
        };
        /**
         * Returns whether the print margin is being shown or not.
         * @return {Boolean}
         */
        VirtualRenderer.prototype.getShowPrintMargin = function () {
            return this.getOption("showPrintMargin");
        };
        /**
         * Sets the column defining where the print margin should be.
         * @param {Number} printMarginColumn Specifies the new print margin
         */
        VirtualRenderer.prototype.setPrintMarginColumn = function (printMarginColumn) {
            this.setOption("printMarginColumn", printMarginColumn);
        };
        /**
         * Returns the column number of where the print margin is.
         * @return {Number}
         */
        VirtualRenderer.prototype.getPrintMarginColumn = function () {
            return this.getOption("printMarginColumn");
        };
        /**
         * Returns `true` if the gutter is being shown.
         * @return {Boolean}
         */
        VirtualRenderer.prototype.getShowGutter = function () {
            return this.getOption("showGutter");
        };
        /**
        * Identifies whether you want to show the gutter or not.
        * @param {Boolean} show Set to `true` to show the gutter
        *
        **/
        VirtualRenderer.prototype.setShowGutter = function (show) {
            return this.setOption("showGutter", show);
        };
        VirtualRenderer.prototype.getFadeFoldWidgets = function () {
            return this.getOption("fadeFoldWidgets");
        };
        VirtualRenderer.prototype.setFadeFoldWidgets = function (show) {
            this.setOption("fadeFoldWidgets", show);
        };
        VirtualRenderer.prototype.setHighlightGutterLine = function (shouldHighlight) {
            this.setOption("highlightGutterLine", shouldHighlight);
        };
        VirtualRenderer.prototype.getHighlightGutterLine = function () {
            return this.getOption("highlightGutterLine");
        };
        VirtualRenderer.prototype.$updateGutterLineHighlight = function () {
            var pos = this.$cursorLayer.$pixelPos;
            var height = this.layerConfig.lineHeight;
            if (this.session.getUseWrapMode()) {
                var cursor = this.session.getSelection().getCursor();
                cursor.column = 0;
                pos = this.$cursorLayer.getPixelPosition(cursor, true);
                height *= this.session.getRowLength(cursor.row);
            }
            this.$gutterLineHighlight.style.top = pos.top - this.layerConfig.offset + "px";
            this.$gutterLineHighlight.style.height = height + "px";
        };
        VirtualRenderer.prototype.$updatePrintMargin = function () {
            if (!this.$showPrintMargin && !this.$printMarginEl)
                return;
            if (!this.$printMarginEl) {
                var containerEl = dom_1.createElement("div");
                containerEl.className = "ace_layer ace_print-margin-layer";
                this.$printMarginEl = dom_1.createElement("div");
                this.$printMarginEl.className = "ace_print-margin";
                containerEl.appendChild(this.$printMarginEl);
                this.content.insertBefore(containerEl, this.content.firstChild);
            }
            var style = this.$printMarginEl.style;
            style.left = ((this.characterWidth * this.$printMarginColumn) + this.$padding) + "px";
            style.visibility = this.$showPrintMargin ? "visible" : "hidden";
            if (this.session && this.session['$wrap'] == -1)
                this.adjustWrapLimit();
        };
        /**
        *
        * Returns the root element containing this renderer.
        * @return {DOMElement}
        **/
        VirtualRenderer.prototype.getContainerElement = function () {
            return this.container;
        };
        /**
        *
        * Returns the element that the mouse events are attached to
        * @return {DOMElement}
        **/
        VirtualRenderer.prototype.getMouseEventTarget = function () {
            return this.content;
        };
        /**
        *
        * Returns the element to which the hidden text area is added.
        * @return {DOMElement}
        **/
        VirtualRenderer.prototype.getTextAreaContainer = function () {
            return this.container;
        };
        // move text input over the cursor
        // this is required for iOS and IME
        VirtualRenderer.prototype.$moveTextAreaToCursor = function () {
            if (!this.$keepTextAreaAtCursor)
                return;
            var config = this.layerConfig;
            var posTop = this.$cursorLayer.$pixelPos.top;
            var posLeft = this.$cursorLayer.$pixelPos.left;
            posTop -= config.offset;
            var h = this.lineHeight;
            if (posTop < 0 || posTop > config.height - h)
                return;
            var w = this.characterWidth;
            if (this.$composition) {
                var val = this.textarea.value.replace(/^\x01+/, "");
                w *= (this.session.$getStringScreenWidth(val)[0] + 2);
                h += 2;
                posTop -= 1;
            }
            posLeft -= this.scrollLeft;
            if (posLeft > this.$size.scrollerWidth - w)
                posLeft = this.$size.scrollerWidth - w;
            posLeft -= this.scrollBarV.width;
            this.textarea.style.height = h + "px";
            this.textarea.style.width = w + "px";
            this.textarea.style.right = Math.max(0, this.$size.scrollerWidth - posLeft - w) + "px";
            this.textarea.style.bottom = Math.max(0, this.$size.height - posTop - h) + "px";
        };
        /**
        *
        * [Returns the index of the first visible row.]{: #VirtualRenderer.getFirstVisibleRow}
        * @return {Number}
        **/
        VirtualRenderer.prototype.getFirstVisibleRow = function () {
            return this.layerConfig.firstRow;
        };
        /**
        *
        * Returns the index of the first fully visible row. "Fully" here means that the characters in the row are not truncated; that the top and the bottom of the row are on the screen.
        * @return {Number}
        **/
        VirtualRenderer.prototype.getFirstFullyVisibleRow = function () {
            return this.layerConfig.firstRow + (this.layerConfig.offset === 0 ? 0 : 1);
        };
        /**
        *
        * Returns the index of the last fully visible row. "Fully" here means that the characters in the row are not truncated; that the top and the bottom of the row are on the screen.
        * @return {Number}
        **/
        VirtualRenderer.prototype.getLastFullyVisibleRow = function () {
            var flint = Math.floor((this.layerConfig.height + this.layerConfig.offset) / this.layerConfig.lineHeight);
            return this.layerConfig.firstRow - 1 + flint;
        };
        /**
        *
        * [Returns the index of the last visible row.]{: #VirtualRenderer.getLastVisibleRow}
        * @return {Number}
        **/
        VirtualRenderer.prototype.getLastVisibleRow = function () {
            return this.layerConfig.lastRow;
        };
        /**
        * Sets the padding for all the layers.
        * @param {number} padding A new padding value (in pixels)
        **/
        VirtualRenderer.prototype.setPadding = function (padding) {
            this.$padding = padding;
            this.$textLayer.setPadding(padding);
            this.$cursorLayer.setPadding(padding);
            this.$markerFront.setPadding(padding);
            this.$markerBack.setPadding(padding);
            this.$loop.schedule(CHANGE_FULL);
            this.$updatePrintMargin();
        };
        VirtualRenderer.prototype.setScrollMargin = function (top, bottom, left, right) {
            var sm = this.scrollMargin;
            sm.top = top | 0;
            sm.bottom = bottom | 0;
            sm.right = right | 0;
            sm.left = left | 0;
            sm.v = sm.top + sm.bottom;
            sm.h = sm.left + sm.right;
            if (sm.top && this.scrollTop <= 0 && this.session)
                this.session.setScrollTop(-sm.top);
            this.updateFull();
        };
        /**
         * Returns whether the horizontal scrollbar is set to be always visible.
         * @return {Boolean}
         **/
        VirtualRenderer.prototype.getHScrollBarAlwaysVisible = function () {
            // FIXME
            return this.$hScrollBarAlwaysVisible;
        };
        /**
         * Identifies whether you want to show the horizontal scrollbar or not.
         * @param {Boolean} alwaysVisible Set to `true` to make the horizontal scroll bar visible
         **/
        VirtualRenderer.prototype.setHScrollBarAlwaysVisible = function (alwaysVisible) {
            this.setOption("hScrollBarAlwaysVisible", alwaysVisible);
        };
        /**
         * Returns whether the vertical scrollbar is set to be always visible.
         * @return {Boolean}
         **/
        VirtualRenderer.prototype.getVScrollBarAlwaysVisible = function () {
            return this.$vScrollBarAlwaysVisible;
        };
        /**
         * Identifies whether you want to show the vertical scrollbar or not.
         * @param {Boolean} alwaysVisible Set to `true` to make the vertical scroll bar visible
         */
        VirtualRenderer.prototype.setVScrollBarAlwaysVisible = function (alwaysVisible) {
            this.setOption("vScrollBarAlwaysVisible", alwaysVisible);
        };
        VirtualRenderer.prototype.$updateScrollBarV = function () {
            var scrollHeight = this.layerConfig.maxHeight;
            var scrollerHeight = this.$size.scrollerHeight;
            if (!this.$maxLines && this.$scrollPastEnd) {
                scrollHeight -= (scrollerHeight - this.lineHeight) * this.$scrollPastEnd;
                if (this.scrollTop > scrollHeight - scrollerHeight) {
                    scrollHeight = this.scrollTop + scrollerHeight;
                    this.scrollBarV.scrollTop = null;
                }
            }
            this.scrollBarV.setScrollHeight(scrollHeight + this.scrollMargin.v);
            this.scrollBarV.setScrollTop(this.scrollTop + this.scrollMargin.top);
        };
        VirtualRenderer.prototype.$updateScrollBarH = function () {
            this.scrollBarH.setScrollWidth(this.layerConfig.width + 2 * this.$padding + this.scrollMargin.h);
            this.scrollBarH.setScrollLeft(this.scrollLeft + this.scrollMargin.left);
        };
        VirtualRenderer.prototype.freeze = function () {
            this.$frozen = true;
        };
        VirtualRenderer.prototype.unfreeze = function () {
            this.$frozen = false;
        };
        VirtualRenderer.prototype.$renderChanges = function (changes, force) {
            if (this.$changes) {
                changes |= this.$changes;
                this.$changes = 0;
            }
            if ((!this.session || !this.container.offsetWidth || this.$frozen) || (!changes && !force)) {
                this.$changes |= changes;
                return;
            }
            if (this.$size.$dirty) {
                this.$changes |= changes;
                return this.onResize(true);
            }
            if (!this.lineHeight) {
                this.$textLayer.checkForSizeChanges();
            }
            // this.$logChanges(changes);
            this._signal("beforeRender");
            var config = this.layerConfig;
            // text, scrolling and resize changes can cause the view port size to change
            if (changes & CHANGE_FULL ||
                changes & CHANGE_SIZE ||
                changes & CHANGE_TEXT ||
                changes & CHANGE_LINES ||
                changes & CHANGE_SCROLL ||
                changes & CHANGE_H_SCROLL) {
                changes |= this.$computeLayerConfig();
                // If a change is made offscreen and wrapMode is on, then the onscreen
                // lines may have been pushed down. If so, the first screen row will not
                // have changed, but the first actual row will. In that case, adjust 
                // scrollTop so that the cursor and onscreen content stays in the same place.
                if (config.firstRow != this.layerConfig.firstRow && config.firstRowScreen == this.layerConfig.firstRowScreen) {
                    this.scrollTop = this.scrollTop + (config.firstRow - this.layerConfig.firstRow) * this.lineHeight;
                    changes = changes | CHANGE_SCROLL;
                    changes |= this.$computeLayerConfig();
                }
                config = this.layerConfig;
                // update scrollbar first to not lose scroll position when gutter calls resize
                this.$updateScrollBarV();
                if (changes & CHANGE_H_SCROLL)
                    this.$updateScrollBarH();
                this.$gutterLayer.element.style.marginTop = (-config.offset) + "px";
                this.content.style.marginTop = (-config.offset) + "px";
                this.content.style.width = config.width + 2 * this.$padding + "px";
                this.content.style.height = config.minHeight + "px";
            }
            // horizontal scrolling
            if (changes & CHANGE_H_SCROLL) {
                this.content.style.marginLeft = -this.scrollLeft + "px";
                this.scroller.className = this.scrollLeft <= 0 ? "ace_scroller" : "ace_scroller ace_scroll-left";
            }
            // full
            if (changes & CHANGE_FULL) {
                this.$textLayer.update(config);
                if (this.$showGutter)
                    this.$gutterLayer.update(config);
                this.$markerBack.update(config);
                this.$markerFront.update(config);
                this.$cursorLayer.update(config);
                this.$moveTextAreaToCursor();
                this.$highlightGutterLine && this.$updateGutterLineHighlight();
                this._signal("afterRender");
                return;
            }
            // scrolling
            if (changes & CHANGE_SCROLL) {
                if (changes & CHANGE_TEXT || changes & CHANGE_LINES)
                    this.$textLayer.update(config);
                else
                    this.$textLayer.scrollLines(config);
                if (this.$showGutter)
                    this.$gutterLayer.update(config);
                this.$markerBack.update(config);
                this.$markerFront.update(config);
                this.$cursorLayer.update(config);
                this.$highlightGutterLine && this.$updateGutterLineHighlight();
                this.$moveTextAreaToCursor();
                this._signal("afterRender");
                return;
            }
            if (changes & CHANGE_TEXT) {
                this.$textLayer.update(config);
                if (this.$showGutter)
                    this.$gutterLayer.update(config);
            }
            else if (changes & CHANGE_LINES) {
                if (this.$updateLines() || (changes & CHANGE_GUTTER) && this.$showGutter)
                    this.$gutterLayer.update(config);
            }
            else if (changes & CHANGE_TEXT || changes & CHANGE_GUTTER) {
                if (this.$showGutter)
                    this.$gutterLayer.update(config);
            }
            if (changes & CHANGE_CURSOR) {
                this.$cursorLayer.update(config);
                this.$moveTextAreaToCursor();
                this.$highlightGutterLine && this.$updateGutterLineHighlight();
            }
            if (changes & (CHANGE_MARKER | CHANGE_MARKER_FRONT)) {
                this.$markerFront.update(config);
            }
            if (changes & (CHANGE_MARKER | CHANGE_MARKER_BACK)) {
                this.$markerBack.update(config);
            }
            this._signal("afterRender");
        };
        VirtualRenderer.prototype.$autosize = function () {
            var height = this.session.getScreenLength() * this.lineHeight;
            var maxHeight = this.$maxLines * this.lineHeight;
            var desiredHeight = Math.max((this.$minLines || 1) * this.lineHeight, Math.min(maxHeight, height)) + this.scrollMargin.v + (this.$extraHeight || 0);
            var vScroll = height > maxHeight;
            if (desiredHeight != this.desiredHeight ||
                this.$size.height != this.desiredHeight || vScroll != this.$vScroll) {
                if (vScroll != this.$vScroll) {
                    this.$vScroll = vScroll;
                    this.scrollBarV.setVisible(vScroll);
                }
                var w = this.container.clientWidth;
                this.container.style.height = desiredHeight + "px";
                this.$updateCachedSize(true, this.$gutterWidth, w, desiredHeight);
                // this.$loop.changes = 0;
                this.desiredHeight = desiredHeight;
            }
        };
        VirtualRenderer.prototype.$computeLayerConfig = function () {
            if (this.$maxLines && this.lineHeight > 1) {
                this.$autosize();
            }
            var session = this.session;
            var size = this.$size;
            var hideScrollbars = size.height <= 2 * this.lineHeight;
            var screenLines = this.session.getScreenLength();
            var maxHeight = screenLines * this.lineHeight;
            var offset = this.scrollTop % this.lineHeight;
            var minHeight = size.scrollerHeight + this.lineHeight;
            var longestLine = this.$getLongestLine();
            var horizScroll = !hideScrollbars && (this.$hScrollBarAlwaysVisible ||
                size.scrollerWidth - longestLine - 2 * this.$padding < 0);
            var hScrollChanged = this.$horizScroll !== horizScroll;
            if (hScrollChanged) {
                this.$horizScroll = horizScroll;
                this.scrollBarH.setVisible(horizScroll);
            }
            if (!this.$maxLines && this.$scrollPastEnd) {
                maxHeight += (size.scrollerHeight - this.lineHeight) * this.$scrollPastEnd;
            }
            var vScroll = !hideScrollbars && (this.$vScrollBarAlwaysVisible ||
                size.scrollerHeight - maxHeight < 0);
            var vScrollChanged = this.$vScroll !== vScroll;
            if (vScrollChanged) {
                this.$vScroll = vScroll;
                this.scrollBarV.setVisible(vScroll);
            }
            this.session.setScrollTop(Math.max(-this.scrollMargin.top, Math.min(this.scrollTop, maxHeight - size.scrollerHeight + this.scrollMargin.bottom)));
            this.session.setScrollLeft(Math.max(-this.scrollMargin.left, Math.min(this.scrollLeft, longestLine + 2 * this.$padding - size.scrollerWidth + this.scrollMargin.right)));
            var lineCount = Math.ceil(minHeight / this.lineHeight) - 1;
            var firstRow = Math.max(0, Math.round((this.scrollTop - offset) / this.lineHeight));
            var lastRow = firstRow + lineCount;
            // Map lines on the screen to lines in the document.
            var firstRowScreen, firstRowHeight;
            var lineHeight = this.lineHeight;
            firstRow = session.screenToDocumentRow(firstRow, 0);
            // Check if firstRow is inside of a foldLine. If true, then use the first
            // row of the foldLine.
            var foldLine = session.getFoldLine(firstRow);
            if (foldLine) {
                firstRow = foldLine.start.row;
            }
            firstRowScreen = session.documentToScreenRow(firstRow, 0);
            firstRowHeight = session.getRowLength(firstRow) * lineHeight;
            lastRow = Math.min(session.screenToDocumentRow(lastRow, 0), session.getLength() - 1);
            minHeight = size.scrollerHeight + session.getRowLength(lastRow) * lineHeight +
                firstRowHeight;
            offset = this.scrollTop - firstRowScreen * lineHeight;
            var changes = 0;
            if (this.layerConfig.width != longestLine)
                changes = CHANGE_H_SCROLL;
            // Horizontal scrollbar visibility may have changed, which changes
            // the client height of the scroller
            if (hScrollChanged || vScrollChanged) {
                changes = this.$updateCachedSize(true, this.gutterWidth, size.width, size.height);
                this._signal("scrollbarVisibilityChanged");
                if (vScrollChanged)
                    longestLine = this.$getLongestLine();
            }
            this.layerConfig = {
                width: longestLine,
                padding: this.$padding,
                firstRow: firstRow,
                firstRowScreen: firstRowScreen,
                lastRow: lastRow,
                lineHeight: lineHeight,
                characterWidth: this.characterWidth,
                minHeight: minHeight,
                maxHeight: maxHeight,
                offset: offset,
                gutterOffset: Math.max(0, Math.ceil((offset + size.height - size.scrollerHeight) / lineHeight)),
                height: this.$size.scrollerHeight
            };
            return changes;
        };
        VirtualRenderer.prototype.$updateLines = function () {
            var firstRow = this.$changedLines.firstRow;
            var lastRow = this.$changedLines.lastRow;
            this.$changedLines = null;
            var layerConfig = this.layerConfig;
            if (firstRow > layerConfig.lastRow + 1) {
                return;
            }
            if (lastRow < layerConfig.firstRow) {
                return;
            }
            // if the last row is unknown -> redraw everything
            if (lastRow === Infinity) {
                if (this.$showGutter)
                    this.$gutterLayer.update(layerConfig);
                this.$textLayer.update(layerConfig);
                return;
            }
            // else update only the changed rows
            this.$textLayer.updateLines(layerConfig, firstRow, lastRow);
            return true;
        };
        VirtualRenderer.prototype.$getLongestLine = function () {
            var charCount = this.session.getScreenWidth();
            if (this.showInvisibles && !this.session.$useWrapMode)
                charCount += 1;
            return Math.max(this.$size.scrollerWidth - 2 * this.$padding, Math.round(charCount * this.characterWidth));
        };
        /**
        *
        * Schedules an update to all the front markers in the document.
        **/
        VirtualRenderer.prototype.updateFrontMarkers = function () {
            this.$markerFront.setMarkers(this.session.getMarkers(true));
            this.$loop.schedule(CHANGE_MARKER_FRONT);
        };
        /**
        *
        * Schedules an update to all the back markers in the document.
        **/
        VirtualRenderer.prototype.updateBackMarkers = function () {
            this.$markerBack.setMarkers(this.session.getMarkers(false));
            this.$loop.schedule(CHANGE_MARKER_BACK);
        };
        /**
        *
        * Redraw breakpoints.
        **/
        VirtualRenderer.prototype.updateBreakpoints = function () {
            this.$loop.schedule(CHANGE_GUTTER);
        };
        /**
         * Sets annotations for the gutter.
         *
         * @method setAnnotations
         * @param {Annotation[]} annotations An array containing annotations.
         * @return {void}
         */
        VirtualRenderer.prototype.setAnnotations = function (annotations) {
            this.$gutterLayer.setAnnotations(annotations);
            this.$loop.schedule(CHANGE_GUTTER);
        };
        /**
        *
        * Updates the cursor icon.
        **/
        VirtualRenderer.prototype.updateCursor = function () {
            this.$loop.schedule(CHANGE_CURSOR);
        };
        /**
        *
        * Hides the cursor icon.
        **/
        VirtualRenderer.prototype.hideCursor = function () {
            this.$cursorLayer.hideCursor();
        };
        /**
        *
        * Shows the cursor icon.
        **/
        VirtualRenderer.prototype.showCursor = function () {
            this.$cursorLayer.showCursor();
        };
        VirtualRenderer.prototype.scrollSelectionIntoView = function (anchor, lead, offset) {
            // first scroll anchor into view then scroll lead into view
            this.scrollCursorIntoView(anchor, offset);
            this.scrollCursorIntoView(lead, offset);
        };
        /**
        *
        * Scrolls the cursor into the first visibile area of the editor
        **/
        VirtualRenderer.prototype.scrollCursorIntoView = function (cursor, offset, $viewMargin) {
            // the editor is not visible
            if (this.$size.scrollerHeight === 0)
                return;
            var pos = this.$cursorLayer.getPixelPosition(cursor);
            var left = pos.left;
            var top = pos.top;
            var topMargin = $viewMargin && $viewMargin.top || 0;
            var bottomMargin = $viewMargin && $viewMargin.bottom || 0;
            var scrollTop = this.$scrollAnimation ? this.session.getScrollTop() : this.scrollTop;
            if (scrollTop + topMargin > top) {
                if (offset)
                    top -= offset * this.$size.scrollerHeight;
                if (top === 0)
                    top = -this.scrollMargin.top;
                this.session.setScrollTop(top);
            }
            else if (scrollTop + this.$size.scrollerHeight - bottomMargin < top + this.lineHeight) {
                if (offset)
                    top += offset * this.$size.scrollerHeight;
                this.session.setScrollTop(top + this.lineHeight - this.$size.scrollerHeight);
            }
            var scrollLeft = this.scrollLeft;
            if (scrollLeft > left) {
                if (left < this.$padding + 2 * this.layerConfig.characterWidth)
                    left = -this.scrollMargin.left;
                this.session.setScrollLeft(left);
            }
            else if (scrollLeft + this.$size.scrollerWidth < left + this.characterWidth) {
                this.session.setScrollLeft(Math.round(left + this.characterWidth - this.$size.scrollerWidth));
            }
            else if (scrollLeft <= this.$padding && left - scrollLeft < this.characterWidth) {
                this.session.setScrollLeft(0);
            }
        };
        /**
        * {:EditSession.getScrollTop}
        * @related EditSession.getScrollTop
        * @return {Number}
        **/
        VirtualRenderer.prototype.getScrollTop = function () {
            return this.session.getScrollTop();
        };
        /**
        * {:EditSession.getScrollLeft}
        * @related EditSession.getScrollLeft
        * @return {Number}
        **/
        VirtualRenderer.prototype.getScrollLeft = function () {
            return this.session.getScrollLeft();
        };
        /**
        *
        * Returns the first visible row, regardless of whether it's fully visible or not.
        * @return {Number}
        **/
        VirtualRenderer.prototype.getScrollTopRow = function () {
            return this.scrollTop / this.lineHeight;
        };
        /**
        *
        * Returns the last visible row, regardless of whether it's fully visible or not.
        * @return {Number}
        **/
        VirtualRenderer.prototype.getScrollBottomRow = function () {
            return Math.max(0, Math.floor((this.scrollTop + this.$size.scrollerHeight) / this.lineHeight) - 1);
        };
        /**
        * Gracefully scrolls from the top of the editor to the row indicated.
        * @param {Number} row A row id
        *
        *
        * @related EditSession.setScrollTop
        **/
        VirtualRenderer.prototype.scrollToRow = function (row) {
            this.session.setScrollTop(row * this.lineHeight);
        };
        VirtualRenderer.prototype.alignCursor = function (cursor, alignment) {
            if (typeof cursor == "number")
                cursor = { row: cursor, column: 0 };
            var pos = this.$cursorLayer.getPixelPosition(cursor);
            var h = this.$size.scrollerHeight - this.lineHeight;
            var offset = pos.top - h * (alignment || 0);
            this.session.setScrollTop(offset);
            return offset;
        };
        VirtualRenderer.prototype.$calcSteps = function (fromValue, toValue) {
            var i = 0;
            var l = this.STEPS;
            var steps = [];
            var func = function (t, x_min, dx) {
                return dx * (Math.pow(t - 1, 3) + 1) + x_min;
            };
            for (i = 0; i < l; ++i) {
                steps.push(func(i / this.STEPS, fromValue, toValue - fromValue));
            }
            return steps;
        };
        /**
         * Gracefully scrolls the editor to the row indicated.
         * @param {Number} line A line number
         * @param {Boolean} center If `true`, centers the editor the to indicated line
         * @param {Boolean} animate If `true` animates scrolling
         * @param {Function} callback Function to be called after the animation has finished
         */
        VirtualRenderer.prototype.scrollToLine = function (line, center, animate, callback) {
            var pos = this.$cursorLayer.getPixelPosition({ row: line, column: 0 });
            var offset = pos.top;
            if (center) {
                offset -= this.$size.scrollerHeight / 2;
            }
            var initialScroll = this.scrollTop;
            this.session.setScrollTop(offset);
            if (animate !== false) {
                this.animateScrolling(initialScroll, callback);
            }
        };
        VirtualRenderer.prototype.animateScrolling = function (fromValue, callback) {
            var toValue = this.scrollTop;
            if (!this.$animatedScroll) {
                return;
            }
            var _self = this;
            if (fromValue == toValue)
                return;
            if (this.$scrollAnimation) {
                var oldSteps = this.$scrollAnimation.steps;
                if (oldSteps.length) {
                    fromValue = oldSteps[0];
                    if (fromValue == toValue)
                        return;
                }
            }
            var steps = _self.$calcSteps(fromValue, toValue);
            this.$scrollAnimation = { from: fromValue, to: toValue, steps: steps };
            clearInterval(this.$timer);
            _self.session.setScrollTop(steps.shift());
            // trick session to think it's already scrolled to not loose toValue
            _self.session.$scrollTop = toValue;
            this.$timer = setInterval(function () {
                if (steps.length) {
                    _self.session.setScrollTop(steps.shift());
                    _self.session.$scrollTop = toValue;
                }
                else if (toValue != null) {
                    _self.session.$scrollTop = -1;
                    _self.session.setScrollTop(toValue);
                    toValue = null;
                }
                else {
                    // do this on separate step to not get spurious scroll event from scrollbar
                    _self.$timer = clearInterval(_self.$timer);
                    _self.$scrollAnimation = null;
                    callback && callback();
                }
            }, 10);
        };
        /**
         * Scrolls the editor to the y pixel indicated.
         * @param {Number} scrollTop The position to scroll to
         */
        VirtualRenderer.prototype.scrollToY = function (scrollTop) {
            // after calling scrollBar.setScrollTop
            // scrollbar sends us event with same scrollTop. ignore it
            if (this.scrollTop !== scrollTop) {
                this.scrollTop = scrollTop;
                this.$loop.schedule(CHANGE_SCROLL);
            }
        };
        /**
         * Scrolls the editor across the x-axis to the pixel indicated.
         * @param {Number} scrollLeft The position to scroll to
         **/
        VirtualRenderer.prototype.scrollToX = function (scrollLeft) {
            if (this.scrollLeft !== scrollLeft) {
                this.scrollLeft = scrollLeft;
                this.$loop.schedule(CHANGE_H_SCROLL);
            }
        };
        /**
        * Scrolls the editor across both x- and y-axes.
        * @param {Number} x The x value to scroll to
        * @param {Number} y The y value to scroll to
        **/
        VirtualRenderer.prototype.scrollTo = function (x, y) {
            this.session.setScrollTop(y);
            this.session.setScrollLeft(y);
        };
        /**
        * Scrolls the editor across both x- and y-axes.
        * @param {Number} deltaX The x value to scroll by
        * @param {Number} deltaY The y value to scroll by
        **/
        VirtualRenderer.prototype.scrollBy = function (deltaX, deltaY) {
            deltaY && this.session.setScrollTop(this.session.getScrollTop() + deltaY);
            deltaX && this.session.setScrollLeft(this.session.getScrollLeft() + deltaX);
        };
        /**
        * Returns `true` if you can still scroll by either parameter; in other words, you haven't reached the end of the file or line.
        * @param {Number} deltaX The x value to scroll by
        * @param {Number} deltaY The y value to scroll by
        *
        *
        * @return {Boolean}
        **/
        VirtualRenderer.prototype.isScrollableBy = function (deltaX, deltaY) {
            if (deltaY < 0 && this.session.getScrollTop() >= 1 - this.scrollMargin.top)
                return true;
            if (deltaY > 0 && this.session.getScrollTop() + this.$size.scrollerHeight
                - this.layerConfig.maxHeight < -1 + this.scrollMargin.bottom)
                return true;
            if (deltaX < 0 && this.session.getScrollLeft() >= 1 - this.scrollMargin.left)
                return true;
            if (deltaX > 0 && this.session.getScrollLeft() + this.$size.scrollerWidth
                - this.layerConfig.width < -1 + this.scrollMargin.right)
                return true;
        };
        VirtualRenderer.prototype.pixelToScreenCoordinates = function (x, y) {
            var canvasPos = this.scroller.getBoundingClientRect();
            var offset = (x + this.scrollLeft - canvasPos.left - this.$padding) / this.characterWidth;
            var row = Math.floor((y + this.scrollTop - canvasPos.top) / this.lineHeight);
            var col = Math.round(offset);
            return { row: row, column: col, side: offset - col > 0 ? 1 : -1 };
        };
        VirtualRenderer.prototype.screenToTextCoordinates = function (clientX, clientY) {
            var canvasPos = this.scroller.getBoundingClientRect();
            var column = Math.round((clientX + this.scrollLeft - canvasPos.left - this.$padding) / this.characterWidth);
            var row = (clientY + this.scrollTop - canvasPos.top) / this.lineHeight;
            return this.session.screenToDocumentPosition(row, Math.max(column, 0));
        };
        /**
        * Returns an object containing the `pageX` and `pageY` coordinates of the document position.
        * @param {Number} row The document row position
        * @param {Number} column The document column position
        * @return {Object}
        **/
        VirtualRenderer.prototype.textToScreenCoordinates = function (row, column) {
            var canvasPos = this.scroller.getBoundingClientRect();
            var pos = this.session.documentToScreenPosition(row, column);
            var x = this.$padding + Math.round(pos.column * this.characterWidth);
            var y = pos.row * this.lineHeight;
            return {
                pageX: canvasPos.left + x - this.scrollLeft,
                pageY: canvasPos.top + y - this.scrollTop
            };
        };
        /**
        *
        * Focuses the current container.
        **/
        VirtualRenderer.prototype.visualizeFocus = function () {
            dom_1.addCssClass(this.container, "ace_focus");
        };
        /**
        *
        * Blurs the current container.
        **/
        VirtualRenderer.prototype.visualizeBlur = function () {
            dom_1.removeCssClass(this.container, "ace_focus");
        };
        /**
         * @method showComposition
         * @param position
         * @private
         */
        VirtualRenderer.prototype.showComposition = function (position) {
            if (!this.$composition)
                this.$composition = {
                    keepTextAreaAtCursor: this.$keepTextAreaAtCursor,
                    cssText: this.textarea.style.cssText
                };
            this.$keepTextAreaAtCursor = true;
            dom_1.addCssClass(this.textarea, "ace_composition");
            this.textarea.style.cssText = "";
            this.$moveTextAreaToCursor();
        };
        /**
         * @param {String} text A string of text to use
         *
         * Sets the inner text of the current composition to `text`.
         */
        VirtualRenderer.prototype.setCompositionText = function (text) {
            // TODO: Why is the parameter not used?
            this.$moveTextAreaToCursor();
        };
        /**
         * Hides the current composition.
         */
        VirtualRenderer.prototype.hideComposition = function () {
            if (!this.$composition) {
                return;
            }
            dom_1.removeCssClass(this.textarea, "ace_composition");
            this.$keepTextAreaAtCursor = this.$composition.keepTextAreaAtCursor;
            this.textarea.style.cssText = this.$composition.cssText;
            this.$composition = null;
        };
        /**
         * Sets a new theme for the editor.
         * `theme` should exist, and be a directory path, like `ace/theme/textmate`.
         *
         * @method setTheme
         * @param theme {String} theme The path to a theme
         * @param theme {Function} cb optional callback
         * @return {void}
         */
        VirtualRenderer.prototype.setTheme = function (theme, cb) {
            console.log("VirtualRenderer setTheme, theme = " + theme);
            var _self = this;
            this.$themeId = theme;
            _self._dispatchEvent('themeChange', { theme: theme });
            if (!theme || typeof theme === "string") {
                var moduleName = theme || this.getOption("theme").initialValue;
                console.log("moduleName => " + moduleName);
                // Loading a theme will insert a script that, upon execution, will
                // insert a style tag.
                config_1.loadModule(["theme", moduleName], afterLoad, this.container.ownerDocument);
            }
            else {
                afterLoad(theme);
            }
            function afterLoad(modJs) {
                if (_self.$themeId !== theme) {
                    return cb && cb();
                }
                if (!modJs.cssClass) {
                    return;
                }
                dom_1.importCssString(modJs.cssText, modJs.cssClass, _self.container.ownerDocument);
                if (_self.theme) {
                    dom_1.removeCssClass(_self.container, _self.theme.cssClass);
                }
                var padding = "padding" in modJs ? modJs.padding : "padding" in (_self.theme || {}) ? 4 : _self.$padding;
                if (_self.$padding && padding != _self.$padding) {
                    _self.setPadding(padding);
                }
                _self.theme = modJs;
                dom_1.addCssClass(_self.container, modJs.cssClass);
                dom_1.setCssClass(_self.container, "ace_dark", modJs.isDark);
                // force re-measure of the gutter width
                if (_self.$size) {
                    _self.$size.width = 0;
                    _self.$updateSizeAsync();
                }
                _self._dispatchEvent('themeLoaded', { theme: modJs });
                cb && cb();
            }
        };
        /**
         * Returns the path of the current theme.
         *
         * @method getTheme
         * @return {string}
         */
        VirtualRenderer.prototype.getTheme = function () {
            return this.$themeId;
        };
        // Methods allows to add / remove CSS classnames to the editor element.
        // This feature can be used by plug-ins to provide a visual indication of
        // a certain mode that editor is in.
        /**
         * [Adds a new class, `style`, to the editor.]{: #VirtualRenderer.setStyle}
         * @param {String} style A class name
         *
         */
        VirtualRenderer.prototype.setStyle = function (style, include) {
            dom_1.setCssClass(this.container, style, include !== false);
        };
        /**
         * [Removes the class `style` from the editor.]{: #VirtualRenderer.unsetStyle}
         * @param {String} style A class name
         */
        VirtualRenderer.prototype.unsetStyle = function (style) {
            dom_1.removeCssClass(this.container, style);
        };
        VirtualRenderer.prototype.setCursorStyle = function (style) {
            if (this.content.style.cursor != style) {
                this.content.style.cursor = style;
            }
        };
        /**
         * @param {String} cursorStyle A css cursor style
         */
        VirtualRenderer.prototype.setMouseCursor = function (cursorStyle) {
            this.content.style.cursor = cursorStyle;
        };
        /**
         * Destroys the text and cursor layers for this renderer.
         */
        VirtualRenderer.prototype.destroy = function () {
            this.$textLayer.destroy();
            this.$cursorLayer.destroy();
        };
        return VirtualRenderer;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = VirtualRenderer;
    config_1.defineOptions(VirtualRenderer.prototype, "renderer", {
        animatedScroll: { initialValue: false },
        showInvisibles: {
            set: function (value) {
                if (this.$textLayer.setShowInvisibles(value))
                    this.$loop.schedule(this.CHANGE_TEXT);
            },
            initialValue: false
        },
        showPrintMargin: {
            set: function () { this.$updatePrintMargin(); },
            initialValue: true
        },
        printMarginColumn: {
            set: function () { this.$updatePrintMargin(); },
            initialValue: 80
        },
        printMargin: {
            set: function (val) {
                if (typeof val == "number")
                    this.$printMarginColumn = val;
                this.$showPrintMargin = !!val;
                this.$updatePrintMargin();
            },
            get: function () {
                return this.$showPrintMargin && this.$printMarginColumn;
            }
        },
        showGutter: {
            set: function (show) {
                this.$gutter.style.display = show ? "block" : "none";
                this.$loop.schedule(this.CHANGE_FULL);
                this.onGutterResize();
            },
            initialValue: true
        },
        fadeFoldWidgets: {
            set: function (show) {
                dom_1.setCssClass(this.$gutter, "ace_fade-fold-widgets", show);
            },
            initialValue: false
        },
        showFoldWidgets: {
            set: function (show) { this.$gutterLayer.setShowFoldWidgets(show); },
            initialValue: true
        },
        showLineNumbers: {
            set: function (show) {
                this.$gutterLayer.setShowLineNumbers(show);
                this.$loop.schedule(this.CHANGE_GUTTER);
            },
            initialValue: true
        },
        displayIndentGuides: {
            set: function (show) {
                if (this.$textLayer.setDisplayIndentGuides(show))
                    this.$loop.schedule(this.CHANGE_TEXT);
            },
            initialValue: true
        },
        highlightGutterLine: {
            set: function (shouldHighlight) {
                if (!this.$gutterLineHighlight) {
                    this.$gutterLineHighlight = dom_1.createElement("div");
                    this.$gutterLineHighlight.className = "ace_gutter-active-line";
                    this.$gutter.appendChild(this.$gutterLineHighlight);
                    return;
                }
                this.$gutterLineHighlight.style.display = shouldHighlight ? "" : "none";
                // if cursorlayer have never been updated there's nothing on screen to update
                if (this.$cursorLayer.$pixelPos)
                    this.$updateGutterLineHighlight();
            },
            initialValue: false,
            value: true
        },
        hScrollBarAlwaysVisible: {
            set: function (val) {
                if (!this.$hScrollBarAlwaysVisible || !this.$horizScroll)
                    this.$loop.schedule(this.CHANGE_SCROLL);
            },
            initialValue: false
        },
        vScrollBarAlwaysVisible: {
            set: function (val) {
                if (!this.$vScrollBarAlwaysVisible || !this.$vScroll)
                    this.$loop.schedule(this.CHANGE_SCROLL);
            },
            initialValue: false
        },
        fontSize: {
            set: function (fontSize) {
                var that = this;
                that.container.style.fontSize = fontSize;
                that.updateFontSize();
            },
            initialValue: "12px"
        },
        fontFamily: {
            set: function (fontFamily) {
                var that = this;
                that.container.style.fontFamily = fontFamily;
                that.updateFontSize();
            }
        },
        maxLines: {
            set: function (val) {
                this.updateFull();
            }
        },
        minLines: {
            set: function (val) {
                this.updateFull();
            }
        },
        scrollPastEnd: {
            set: function (val) {
                val = +val || 0;
                if (this.$scrollPastEnd == val)
                    return;
                this.$scrollPastEnd = val;
                this.$loop.schedule(this.CHANGE_SCROLL);
            },
            initialValue: 0,
            handlesSet: true
        },
        fixedWidthGutter: {
            set: function (val) {
                this.$gutterLayer.$fixedWidth = !!val;
                this.$loop.schedule(this.CHANGE_GUTTER);
            }
        },
        theme: {
            set: function (val) { this.setTheme(val); },
            get: function () { return this.$themeId || this.theme; },
            initialValue: "./theme/textmate",
            handlesSet: true
        }
    });
});