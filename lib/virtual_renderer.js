import { addCssClass, createElement, importCssString, removeCssClass, setCssClass } from "./lib/dom";
import { _emit, defineOptions, loadModule, resetOptions } from "./config";
import { isOldIE } from "./lib/useragent";
import { Gutter } from "./layer/gutter";
import { Marker } from "./layer/marker";
import { Text } from "./layer/text";
import { Cursor } from "./layer/cursor";
import { HScrollBar, VScrollBar } from "./scrollbar";
import { RenderLoop } from "./renderloop";
import { FontMetrics } from "./layer/font_metrics";
import { EventEmitterClass } from "./lib/event_emitter";
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
export class VirtualRenderer extends EventEmitterClass {
    constructor(container, theme) {
        super();
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
        this.container = container || createElement("div");
        this.$keepTextAreaAtCursor = !isOldIE;
        addCssClass(this.container, "ace_editor");
        this.setTheme(theme);
        this.$gutter = createElement("div");
        this.$gutter.className = "ace_gutter";
        this.container.appendChild(this.$gutter);
        this.scroller = createElement("div");
        this.scroller.className = "ace_scroller";
        this.container.appendChild(this.scroller);
        this.content = createElement("div");
        this.content.className = "ace_content";
        this.scroller.appendChild(this.content);
        this.$gutterLayer = new Gutter(this.$gutter);
        this.$gutterLayer.on("changeGutterWidth", this.onGutterResize.bind(this));
        this.$markerBack = new Marker(this.content);
        var textLayer = this.$textLayer = new Text(this.content);
        this.canvas = textLayer.element;
        this.$markerFront = new Marker(this.content);
        this.$cursorLayer = new Cursor(this.content);
        this.$horizScroll = false;
        this.$vScroll = false;
        this.scrollBarV = new VScrollBar(this.container, this);
        this.scrollBarH = new HScrollBar(this.container, this);
        this.scrollBarV.addEventListener("scroll", function (e) {
            if (!_self.$scrollAnimation) {
                _self.session.setScrollTop(e.data - _self.scrollMargin.top);
            }
        });
        this.scrollBarH.addEventListener("scroll", function (e) {
            if (!_self.$scrollAnimation) {
                _self.session.setScrollLeft(e.data - _self.scrollMargin.left);
            }
        });
        this.cursorPos = {
            row: 0,
            column: 0
        };
        this.$fontMetrics = new FontMetrics(this.container, 500);
        this.$textLayer.$setFontMetrics(this.$fontMetrics);
        this.$textLayer.addEventListener("changeCharacterSize", function (e) {
            _self.updateCharacterSize();
            _self.onResize(true, _self.gutterWidth, _self.$size.width, _self.$size.height);
            _self._signal("changeCharacterSize", e);
        });
        this.$size = {
            width: 0,
            height: 0,
            scrollerHeight: 0,
            scrollerWidth: 0,
            $dirty: true
        };
        this.$loop = new RenderLoop(this.$renderChanges.bind(this), this.container.ownerDocument.defaultView);
        this.$loop.schedule(CHANGE_FULL);
        this.updateCharacterSize();
        this.setPadding(4);
        resetOptions(this);
        _emit("renderer", this);
    }
    set maxLines(maxLines) {
        this.$maxLines = maxLines;
    }
    set keepTextAreaAtCursor(keepTextAreaAtCursor) {
        this.$keepTextAreaAtCursor = keepTextAreaAtCursor;
    }
    setDefaultCursorStyle() {
        this.content.style.cursor = "default";
    }
    setCursorLayerOff() {
        var noop = function () { };
        this.$cursorLayer.restartTimer = noop;
        this.$cursorLayer.element.style.opacity = "0";
    }
    updateCharacterSize() {
        if (this.$textLayer['allowBoldFonts'] != this.$allowBoldFonts) {
            this.$allowBoldFonts = this.$textLayer['allowBoldFonts'];
            this.setStyle("ace_nobold", !this.$allowBoldFonts);
        }
        this.layerConfig.characterWidth = this.characterWidth = this.$textLayer.getCharacterWidth();
        this.layerConfig.lineHeight = this.lineHeight = this.$textLayer.getLineHeight();
        this.$updatePrintMargin();
    }
    setSession(session) {
        if (this.session)
            this.session.doc.off("changeNewLineMode", this.onChangeNewLineMode);
        this.session = session;
        if (!session)
            return;
        if (this.scrollMargin.top && session.getScrollTop() <= 0)
            session.setScrollTop(-this.scrollMargin.top);
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
    }
    updateLines(firstRow, lastRow, force) {
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
    }
    onChangeNewLineMode() {
        this.$loop.schedule(CHANGE_TEXT);
        this.$textLayer.$updateEolChar();
    }
    onChangeTabSize() {
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
    }
    updateText() {
        this.$loop.schedule(CHANGE_TEXT);
    }
    updateFull(force) {
        if (force)
            this.$renderChanges(CHANGE_FULL, true);
        else
            this.$loop.schedule(CHANGE_FULL);
    }
    updateFontSize() {
        this.$textLayer.checkForSizeChanges();
    }
    $updateSizeAsync() {
        if (this.$loop.pending)
            this.$size.$dirty = true;
        else
            this.onResize();
    }
    onResize(force, gutterWidth, width, height) {
        if (this.resizing > 2)
            return;
        else if (this.resizing > 0)
            this.resizing++;
        else
            this.resizing = force ? 1 : 0;
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
    }
    $updateCachedSize(force, gutterWidth, width, height) {
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
    }
    onGutterResize() {
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
    }
    adjustWrapLimit() {
        var availableWidth = this.$size.scrollerWidth - this.$padding * 2;
        var limit = Math.floor(availableWidth / this.characterWidth);
        return this.session.adjustWrapLimit(limit, this.$showPrintMargin && this.$printMarginColumn);
    }
    setAnimatedScroll(shouldAnimate) {
        this.setOption("animatedScroll", shouldAnimate);
    }
    getAnimatedScroll() {
        return this.$animatedScroll;
    }
    setShowInvisibles(showInvisibles) {
        this.setOption("showInvisibles", showInvisibles);
    }
    getShowInvisibles() {
        return this.getOption("showInvisibles");
    }
    getDisplayIndentGuides() {
        return this.getOption("displayIndentGuides");
    }
    setDisplayIndentGuides(displayIndentGuides) {
        this.setOption("displayIndentGuides", displayIndentGuides);
    }
    setShowPrintMargin(showPrintMargin) {
        this.setOption("showPrintMargin", showPrintMargin);
    }
    getShowPrintMargin() {
        return this.getOption("showPrintMargin");
    }
    setPrintMarginColumn(printMarginColumn) {
        this.setOption("printMarginColumn", printMarginColumn);
    }
    getPrintMarginColumn() {
        return this.getOption("printMarginColumn");
    }
    getShowGutter() {
        return this.getOption("showGutter");
    }
    setShowGutter(show) {
        return this.setOption("showGutter", show);
    }
    getFadeFoldWidgets() {
        return this.getOption("fadeFoldWidgets");
    }
    setFadeFoldWidgets(show) {
        this.setOption("fadeFoldWidgets", show);
    }
    setHighlightGutterLine(shouldHighlight) {
        this.setOption("highlightGutterLine", shouldHighlight);
    }
    getHighlightGutterLine() {
        return this.getOption("highlightGutterLine");
    }
    $updateGutterLineHighlight() {
        var pos = this.$cursorLayer.$pixelPos;
        var height = this.layerConfig.lineHeight;
        if (this.session.getUseWrapMode()) {
            var cursor = this.session.selection.getCursor();
            cursor.column = 0;
            pos = this.$cursorLayer.getPixelPosition(cursor, true);
            height *= this.session.getRowLength(cursor.row);
        }
        this.$gutterLineHighlight.style.top = pos.top - this.layerConfig.offset + "px";
        this.$gutterLineHighlight.style.height = height + "px";
    }
    $updatePrintMargin() {
        if (!this.$showPrintMargin && !this.$printMarginEl)
            return;
        if (!this.$printMarginEl) {
            var containerEl = createElement("div");
            containerEl.className = "ace_layer ace_print-margin-layer";
            this.$printMarginEl = createElement("div");
            this.$printMarginEl.className = "ace_print-margin";
            containerEl.appendChild(this.$printMarginEl);
            this.content.insertBefore(containerEl, this.content.firstChild);
        }
        var style = this.$printMarginEl.style;
        style.left = ((this.characterWidth * this.$printMarginColumn) + this.$padding) + "px";
        style.visibility = this.$showPrintMargin ? "visible" : "hidden";
        if (this.session && this.session['$wrap'] == -1)
            this.adjustWrapLimit();
    }
    getContainerElement() {
        return this.container;
    }
    getMouseEventTarget() {
        return this.content;
    }
    getTextAreaContainer() {
        return this.container;
    }
    $moveTextAreaToCursor() {
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
    }
    getFirstVisibleRow() {
        return this.layerConfig.firstRow;
    }
    getFirstFullyVisibleRow() {
        return this.layerConfig.firstRow + (this.layerConfig.offset === 0 ? 0 : 1);
    }
    getLastFullyVisibleRow() {
        var flint = Math.floor((this.layerConfig.height + this.layerConfig.offset) / this.layerConfig.lineHeight);
        return this.layerConfig.firstRow - 1 + flint;
    }
    getLastVisibleRow() {
        return this.layerConfig.lastRow;
    }
    setPadding(padding) {
        this.$padding = padding;
        this.$textLayer.setPadding(padding);
        this.$cursorLayer.setPadding(padding);
        this.$markerFront.setPadding(padding);
        this.$markerBack.setPadding(padding);
        this.$loop.schedule(CHANGE_FULL);
        this.$updatePrintMargin();
    }
    setScrollMargin(top, bottom, left, right) {
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
    }
    getHScrollBarAlwaysVisible() {
        return this.$hScrollBarAlwaysVisible;
    }
    setHScrollBarAlwaysVisible(alwaysVisible) {
        this.setOption("hScrollBarAlwaysVisible", alwaysVisible);
    }
    getVScrollBarAlwaysVisible() {
        return this.$vScrollBarAlwaysVisible;
    }
    setVScrollBarAlwaysVisible(alwaysVisible) {
        this.setOption("vScrollBarAlwaysVisible", alwaysVisible);
    }
    $updateScrollBarV() {
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
    }
    $updateScrollBarH() {
        this.scrollBarH.setScrollWidth(this.layerConfig.width + 2 * this.$padding + this.scrollMargin.h);
        this.scrollBarH.setScrollLeft(this.scrollLeft + this.scrollMargin.left);
    }
    freeze() {
        this.$frozen = true;
    }
    unfreeze() {
        this.$frozen = false;
    }
    $renderChanges(changes, force) {
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
        this._signal("beforeRender");
        var config = this.layerConfig;
        if (changes & CHANGE_FULL ||
            changes & CHANGE_SIZE ||
            changes & CHANGE_TEXT ||
            changes & CHANGE_LINES ||
            changes & CHANGE_SCROLL ||
            changes & CHANGE_H_SCROLL) {
            changes |= this.$computeLayerConfig();
            if (config.firstRow != this.layerConfig.firstRow && config.firstRowScreen == this.layerConfig.firstRowScreen) {
                this.scrollTop = this.scrollTop + (config.firstRow - this.layerConfig.firstRow) * this.lineHeight;
                changes = changes | CHANGE_SCROLL;
                changes |= this.$computeLayerConfig();
            }
            config = this.layerConfig;
            this.$updateScrollBarV();
            if (changes & CHANGE_H_SCROLL)
                this.$updateScrollBarH();
            this.$gutterLayer.element.style.marginTop = (-config.offset) + "px";
            this.content.style.marginTop = (-config.offset) + "px";
            this.content.style.width = config.width + 2 * this.$padding + "px";
            this.content.style.height = config.minHeight + "px";
        }
        if (changes & CHANGE_H_SCROLL) {
            this.content.style.marginLeft = -this.scrollLeft + "px";
            this.scroller.className = this.scrollLeft <= 0 ? "ace_scroller" : "ace_scroller ace_scroll-left";
        }
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
    }
    $autosize() {
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
            this.desiredHeight = desiredHeight;
        }
    }
    $computeLayerConfig() {
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
        var firstRowScreen, firstRowHeight;
        var lineHeight = this.lineHeight;
        firstRow = session.screenToDocumentRow(firstRow, 0);
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
    }
    $updateLines() {
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
        if (lastRow === Infinity) {
            if (this.$showGutter)
                this.$gutterLayer.update(layerConfig);
            this.$textLayer.update(layerConfig);
            return;
        }
        this.$textLayer.updateLines(layerConfig, firstRow, lastRow);
        return true;
    }
    $getLongestLine() {
        var charCount = this.session.getScreenWidth();
        if (this.showInvisibles && !this.session.$useWrapMode)
            charCount += 1;
        return Math.max(this.$size.scrollerWidth - 2 * this.$padding, Math.round(charCount * this.characterWidth));
    }
    updateFrontMarkers() {
        this.$markerFront.setMarkers(this.session.getMarkers(true));
        this.$loop.schedule(CHANGE_MARKER_FRONT);
    }
    updateBackMarkers() {
        this.$markerBack.setMarkers(this.session.getMarkers(false));
        this.$loop.schedule(CHANGE_MARKER_BACK);
    }
    addGutterDecoration(row, className) {
        this.$gutterLayer.addGutterDecoration(row, className);
    }
    removeGutterDecoration(row, className) {
        this.$gutterLayer.removeGutterDecoration(row, className);
    }
    updateBreakpoints() {
        this.$loop.schedule(CHANGE_GUTTER);
    }
    setAnnotations(annotations) {
        this.$gutterLayer.setAnnotations(annotations);
        this.$loop.schedule(CHANGE_GUTTER);
    }
    updateCursor() {
        this.$loop.schedule(CHANGE_CURSOR);
    }
    hideCursor() {
        this.$cursorLayer.hideCursor();
    }
    showCursor() {
        this.$cursorLayer.showCursor();
    }
    scrollSelectionIntoView(anchor, lead, offset) {
        this.scrollCursorIntoView(anchor, offset);
        this.scrollCursorIntoView(lead, offset);
    }
    scrollCursorIntoView(cursor, offset, $viewMargin) {
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
    }
    getScrollTop() {
        return this.session.getScrollTop();
    }
    getScrollLeft() {
        return this.session.getScrollLeft();
    }
    getScrollTopRow() {
        return this.scrollTop / this.lineHeight;
    }
    getScrollBottomRow() {
        return Math.max(0, Math.floor((this.scrollTop + this.$size.scrollerHeight) / this.lineHeight) - 1);
    }
    scrollToRow(row) {
        this.session.setScrollTop(row * this.lineHeight);
    }
    alignCursor(cursor, alignment) {
        if (typeof cursor == "number")
            cursor = { row: cursor, column: 0 };
        var pos = this.$cursorLayer.getPixelPosition(cursor);
        var h = this.$size.scrollerHeight - this.lineHeight;
        var offset = pos.top - h * (alignment || 0);
        this.session.setScrollTop(offset);
        return offset;
    }
    $calcSteps(fromValue, toValue) {
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
    }
    scrollToLine(line, center, animate, callback) {
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
    }
    animateScrolling(fromValue, callback) {
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
                _self.$timer = clearInterval(_self.$timer);
                _self.$scrollAnimation = null;
                callback && callback();
            }
        }, 10);
    }
    scrollToY(scrollTop) {
        if (this.scrollTop !== scrollTop) {
            this.scrollTop = scrollTop;
            this.$loop.schedule(CHANGE_SCROLL);
        }
    }
    scrollToX(scrollLeft) {
        if (this.scrollLeft !== scrollLeft) {
            this.scrollLeft = scrollLeft;
            this.$loop.schedule(CHANGE_H_SCROLL);
        }
    }
    scrollTo(x, y) {
        this.session.setScrollTop(y);
        this.session.setScrollLeft(y);
    }
    scrollBy(deltaX, deltaY) {
        deltaY && this.session.setScrollTop(this.session.getScrollTop() + deltaY);
        deltaX && this.session.setScrollLeft(this.session.getScrollLeft() + deltaX);
    }
    isScrollableBy(deltaX, deltaY) {
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
    }
    pixelToScreenCoordinates(x, y) {
        var canvasPos = this.scroller.getBoundingClientRect();
        var offset = (x + this.scrollLeft - canvasPos.left - this.$padding) / this.characterWidth;
        var row = Math.floor((y + this.scrollTop - canvasPos.top) / this.lineHeight);
        var col = Math.round(offset);
        return { row: row, column: col, side: offset - col > 0 ? 1 : -1 };
    }
    screenToTextCoordinates(clientX, clientY) {
        var canvasPos = this.scroller.getBoundingClientRect();
        var column = Math.round((clientX + this.scrollLeft - canvasPos.left - this.$padding) / this.characterWidth);
        var row = (clientY + this.scrollTop - canvasPos.top) / this.lineHeight;
        return this.session.screenToDocumentPosition(row, Math.max(column, 0));
    }
    textToScreenCoordinates(row, column) {
        var canvasPos = this.scroller.getBoundingClientRect();
        var pos = this.session.documentToScreenPosition(row, column);
        var x = this.$padding + Math.round(pos.column * this.characterWidth);
        var y = pos.row * this.lineHeight;
        return {
            pageX: canvasPos.left + x - this.scrollLeft,
            pageY: canvasPos.top + y - this.scrollTop
        };
    }
    visualizeFocus() {
        addCssClass(this.container, "ace_focus");
    }
    visualizeBlur() {
        removeCssClass(this.container, "ace_focus");
    }
    showComposition(position) {
        if (!this.$composition)
            this.$composition = {
                keepTextAreaAtCursor: this.$keepTextAreaAtCursor,
                cssText: this.textarea.style.cssText
            };
        this.$keepTextAreaAtCursor = true;
        addCssClass(this.textarea, "ace_composition");
        this.textarea.style.cssText = "";
        this.$moveTextAreaToCursor();
    }
    setCompositionText(text) {
        this.$moveTextAreaToCursor();
    }
    hideComposition() {
        if (!this.$composition) {
            return;
        }
        removeCssClass(this.textarea, "ace_composition");
        this.$keepTextAreaAtCursor = this.$composition.keepTextAreaAtCursor;
        this.textarea.style.cssText = this.$composition.cssText;
        this.$composition = null;
    }
    setTheme(theme, cb) {
        var _self = this;
        this.$themeId = theme;
        _self._dispatchEvent('themeChange', { theme: theme });
        if (!theme || typeof theme == "string") {
            var moduleName = theme || this.$options.theme.initialValue;
            loadModule(["theme", moduleName], afterLoad);
        }
        else {
            afterLoad(theme);
        }
        function afterLoad(module) {
            if (_self.$themeId != theme)
                return cb && cb();
            if (!module.cssClass)
                return;
            importCssString(module.cssText, module.cssClass, _self.container.ownerDocument);
            if (_self.theme)
                removeCssClass(_self.container, _self.theme.cssClass);
            var padding = "padding" in module ? module.padding : "padding" in (_self.theme || {}) ? 4 : _self.$padding;
            if (_self.$padding && padding != _self.$padding) {
                _self.setPadding(padding);
            }
            _self.$theme = module.cssClass;
            _self.theme = module;
            addCssClass(_self.container, module.cssClass);
            setCssClass(_self.container, "ace_dark", module.isDark);
            if (_self.$size) {
                _self.$size.width = 0;
                _self.$updateSizeAsync();
            }
            _self._dispatchEvent('themeLoaded', { theme: module });
            cb && cb();
        }
    }
    getTheme() {
        return this.$themeId;
    }
    setStyle(style, include) {
        setCssClass(this.container, style, include !== false);
    }
    unsetStyle(style) {
        removeCssClass(this.container, style);
    }
    setCursorStyle(style) {
        if (this.content.style.cursor != style) {
            this.content.style.cursor = style;
        }
    }
    setMouseCursor(cursorStyle) {
        this.content.style.cursor = cursorStyle;
    }
    destroy() {
        this.$textLayer.destroy();
        this.$cursorLayer.destroy();
    }
}
defineOptions(VirtualRenderer.prototype, "renderer", {
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
            setCssClass(this.$gutter, "ace_fade-fold-widgets", show);
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
                this.$gutterLineHighlight = createElement("div");
                this.$gutterLineHighlight.className = "ace_gutter-active-line";
                this.$gutter.appendChild(this.$gutterLineHighlight);
                return;
            }
            this.$gutterLineHighlight.style.display = shouldHighlight ? "" : "none";
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
        set: function (size) {
            if (typeof size == "number")
                size = size + "px";
            this.container.style.fontSize = size;
            this.updateFontSize();
        },
        initialValue: 12
    },
    fontFamily: {
        set: function (name) {
            this.container.style.fontFamily = name;
            this.updateFontSize();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlydHVhbF9yZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy92aXJ0dWFsX3JlbmRlcmVyLnRzIl0sIm5hbWVzIjpbIlZpcnR1YWxSZW5kZXJlciIsIlZpcnR1YWxSZW5kZXJlci5jb25zdHJ1Y3RvciIsIlZpcnR1YWxSZW5kZXJlci5tYXhMaW5lcyIsIlZpcnR1YWxSZW5kZXJlci5rZWVwVGV4dEFyZWFBdEN1cnNvciIsIlZpcnR1YWxSZW5kZXJlci5zZXREZWZhdWx0Q3Vyc29yU3R5bGUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0Q3Vyc29yTGF5ZXJPZmYiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlQ2hhcmFjdGVyU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5zZXRTZXNzaW9uIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUxpbmVzIiwiVmlydHVhbFJlbmRlcmVyLm9uQ2hhbmdlTmV3TGluZU1vZGUiLCJWaXJ0dWFsUmVuZGVyZXIub25DaGFuZ2VUYWJTaXplIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZVRleHQiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlRnVsbCIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVGb250U2l6ZSIsIlZpcnR1YWxSZW5kZXJlci4kdXBkYXRlU2l6ZUFzeW5jIiwiVmlydHVhbFJlbmRlcmVyLm9uUmVzaXplIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVDYWNoZWRTaXplIiwiVmlydHVhbFJlbmRlcmVyLm9uR3V0dGVyUmVzaXplIiwiVmlydHVhbFJlbmRlcmVyLmFkanVzdFdyYXBMaW1pdCIsIlZpcnR1YWxSZW5kZXJlci5zZXRBbmltYXRlZFNjcm9sbCIsIlZpcnR1YWxSZW5kZXJlci5nZXRBbmltYXRlZFNjcm9sbCIsIlZpcnR1YWxSZW5kZXJlci5zZXRTaG93SW52aXNpYmxlcyIsIlZpcnR1YWxSZW5kZXJlci5nZXRTaG93SW52aXNpYmxlcyIsIlZpcnR1YWxSZW5kZXJlci5nZXREaXNwbGF5SW5kZW50R3VpZGVzIiwiVmlydHVhbFJlbmRlcmVyLnNldERpc3BsYXlJbmRlbnRHdWlkZXMiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2hvd1ByaW50TWFyZ2luIiwiVmlydHVhbFJlbmRlcmVyLmdldFNob3dQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5zZXRQcmludE1hcmdpbkNvbHVtbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRQcmludE1hcmdpbkNvbHVtbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRTaG93R3V0dGVyIiwiVmlydHVhbFJlbmRlcmVyLnNldFNob3dHdXR0ZXIiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0RmFkZUZvbGRXaWRnZXRzIiwiVmlydHVhbFJlbmRlcmVyLnNldEZhZGVGb2xkV2lkZ2V0cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRIaWdobGlnaHRHdXR0ZXJMaW5lIiwiVmlydHVhbFJlbmRlcmVyLmdldEhpZ2hsaWdodEd1dHRlckxpbmUiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVByaW50TWFyZ2luIiwiVmlydHVhbFJlbmRlcmVyLmdldENvbnRhaW5lckVsZW1lbnQiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0TW91c2VFdmVudFRhcmdldCIsIlZpcnR1YWxSZW5kZXJlci5nZXRUZXh0QXJlYUNvbnRhaW5lciIsIlZpcnR1YWxSZW5kZXJlci4kbW92ZVRleHRBcmVhVG9DdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0Rmlyc3RWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldEZpcnN0RnVsbHlWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldExhc3RGdWxseVZpc2libGVSb3ciLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0TGFzdFZpc2libGVSb3ciLCJWaXJ0dWFsUmVuZGVyZXIuc2V0UGFkZGluZyIsIlZpcnR1YWxSZW5kZXJlci5zZXRTY3JvbGxNYXJnaW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNjcm9sbEJhclYiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNjcm9sbEJhckgiLCJWaXJ0dWFsUmVuZGVyZXIuZnJlZXplIiwiVmlydHVhbFJlbmRlcmVyLnVuZnJlZXplIiwiVmlydHVhbFJlbmRlcmVyLiRyZW5kZXJDaGFuZ2VzIiwiVmlydHVhbFJlbmRlcmVyLiRhdXRvc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci4kY29tcHV0ZUxheWVyQ29uZmlnIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVMaW5lcyIsIlZpcnR1YWxSZW5kZXJlci4kZ2V0TG9uZ2VzdExpbmUiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlRnJvbnRNYXJrZXJzIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUJhY2tNYXJrZXJzIiwiVmlydHVhbFJlbmRlcmVyLmFkZEd1dHRlckRlY29yYXRpb24iLCJWaXJ0dWFsUmVuZGVyZXIucmVtb3ZlR3V0dGVyRGVjb3JhdGlvbiIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVCcmVha3BvaW50cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRBbm5vdGF0aW9ucyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuaGlkZUN1cnNvciIsIlZpcnR1YWxSZW5kZXJlci5zaG93Q3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFNlbGVjdGlvbkludG9WaWV3IiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbFRvcCIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxMZWZ0IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbFRvcFJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxCb3R0b21Sb3ciLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9Sb3ciLCJWaXJ0dWFsUmVuZGVyZXIuYWxpZ25DdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuJGNhbGNTdGVwcyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb0xpbmUiLCJWaXJ0dWFsUmVuZGVyZXIuYW5pbWF0ZVNjcm9sbGluZyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb1kiLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9YIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbEJ5IiwiVmlydHVhbFJlbmRlcmVyLmlzU2Nyb2xsYWJsZUJ5IiwiVmlydHVhbFJlbmRlcmVyLnBpeGVsVG9TY3JlZW5Db29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci50ZXh0VG9TY3JlZW5Db29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci52aXN1YWxpemVGb2N1cyIsIlZpcnR1YWxSZW5kZXJlci52aXN1YWxpemVCbHVyIiwiVmlydHVhbFJlbmRlcmVyLnNob3dDb21wb3NpdGlvbiIsIlZpcnR1YWxSZW5kZXJlci5zZXRDb21wb3NpdGlvblRleHQiLCJWaXJ0dWFsUmVuZGVyZXIuaGlkZUNvbXBvc2l0aW9uIiwiVmlydHVhbFJlbmRlcmVyLnNldFRoZW1lIiwiVmlydHVhbFJlbmRlcmVyLnNldFRoZW1lLmFmdGVyTG9hZCIsIlZpcnR1YWxSZW5kZXJlci5nZXRUaGVtZSIsIlZpcnR1YWxSZW5kZXJlci5zZXRTdHlsZSIsIlZpcnR1YWxSZW5kZXJlci51bnNldFN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEN1cnNvclN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldE1vdXNlQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLmRlc3Ry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QSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN6REEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7SUFDdENBLENBQUNBO0lBRURSLG1CQUFtQkE7UUFDZlMsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDakNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO0lBQ3JDQSxDQUFDQTtJQUVEVCxlQUFlQTtRQUNYVSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNiQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdEJBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLFdBQVdBLEdBQUdBLGFBQWFBLENBQUNBLENBQUNBO1lBQ3JEQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNOQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNOQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxlQUFlQSxFQUFFQSxDQUFDQTtZQUN0Q0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFFTkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDTkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFLRFYsVUFBVUE7UUFDTlcsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7SUFDckNBLENBQUNBO0lBUURYLFVBQVVBLENBQUNBLEtBQU1BO1FBQ2JZLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO1lBQ05BLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLFdBQVdBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQzNDQSxJQUFJQTtZQUNBQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtJQUN6Q0EsQ0FBQ0E7SUFNRFosY0FBY0E7UUFDVmEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsbUJBQW1CQSxFQUFFQSxDQUFDQTtJQUMxQ0EsQ0FBQ0E7SUFFRGIsZ0JBQWdCQTtRQUNaYyxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQTtZQUNuQkEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDN0JBLElBQUlBO1lBQ0FBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO0lBQ3hCQSxDQUFDQTtJQVdEZCxRQUFRQSxDQUFDQSxLQUFlQSxFQUFFQSxXQUFvQkEsRUFBRUEsS0FBY0EsRUFBRUEsTUFBZUE7UUFDM0VlLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2xCQSxNQUFNQSxDQUFDQTtRQUNYQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN2QkEsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0E7UUFDcEJBLElBQUlBO1lBQ0FBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLEtBQUtBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBR2xDQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUN4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDUkEsTUFBTUEsR0FBR0EsRUFBRUEsQ0FBQ0EsWUFBWUEsSUFBSUEsRUFBRUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7UUFDaERBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO1lBQ1BBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBLFdBQVdBLElBQUlBLEVBQUVBLENBQUNBLFdBQVdBLENBQUNBO1FBQzdDQSxJQUFJQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLEtBQUtBLEVBQUVBLFdBQVdBLEVBQUVBLEtBQUtBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBR3hFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxJQUFJQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNsREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFFN0JBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO1lBQ05BLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBO1FBRXRDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNOQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN2REEsSUFBSUE7WUFDQUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFFakRBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBO1lBQ2RBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLENBQUNB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QVVBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO0lBQzVFQSxDQUFDQTtJQUVEcEQsTUFBTUE7UUFDRnFELElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBO0lBQ3hCQSxDQUFDQTtJQUVEckQsUUFBUUE7UUFDSnNELElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLEtBQUtBLENBQUNBO0lBQ3pCQSxDQUFDQTtJQUVEdEQsY0FBY0EsQ0FBQ0EsT0FBT0EsRUFBRUEsS0FBS0E7UUFDekJ1RCxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQkEsT0FBT0EsSUFBSUEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDekJBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3RCQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxXQUFXQSxJQUFJQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxPQUFPQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN6RkEsSUFBSUEsQ0FBQ0EsUUFBUUEsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDekJBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxJQUFJQSxDQUFDQSxRQUFRQSxJQUFJQSxPQUFPQSxDQUFDQTtZQUN6QkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDL0JBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVB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Q0FBQ0EsQ0FBQ0E7UUFDeENBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEVBQ3JEQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUUzRkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsRUFDakZBLFdBQVdBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBRXRGQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUMzREEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsTUFBTUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDcEZBLElBQUlBLE9BQU9BLEdBQUdBLFFBQVFBLEdBQUdBLFNBQVNBLENBQUNBO1FBR25DQSxJQUFJQSxjQUFjQSxFQUFF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QUNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLFNBQVNBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBO1FBQzFGQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtRQUM3RUEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFN0JBLE1BQU1BLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLEdBQUdBLEVBQUVBLElBQUlBLEVBQUVBLE1BQU1BLEdBQUdBLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBO0lBQ3RFQSxDQUFDQTtJQUVEckYsdUJBQXVCQSxDQUFDQSxPQUFlQSxFQUFFQSxPQUFlQTtRQUNwRHNGLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLHFCQUFxQkEsRUFBRUEsQ0FBQ0E7UUFFdERBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLFNBQVNBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBO1FBRTVHQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtRQUV2RUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUMzRUEsQ0FBQ0E7SUFRRHRGLHVCQUF1QkEsQ0FBQ0EsR0FBV0EsRUFBRUEsTUFBY0E7UUFDL0N1RixJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxxQkFBcUJBLEVBQUVBLENBQUNBO1FBQ3REQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSx3QkFBd0JBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBRTdEQSxJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQTtRQUNyRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFFbENBLE1BQU1BLENBQUNBO1lBQ0hBLEtBQUtBLEVBQUVBLFNBQVNBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBO1lBQzNDQSxLQUFLQSxFQUFFQSxTQUFTQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQTtTQUM1Q0EsQ0FBQ0E7SUFDTkEsQ0FBQ0E7SUFNRHZGLGNBQWNBO1FBQ1Z3RixXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQTtJQUM3Q0EsQ0FBQ0E7SUFNRHhGLGFBQWFBO1FBQ1R5RixjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQTtJQUNoREEsQ0FBQ0E7SUFPRHpGLGVBQWVBLENBQUNBLFFBQXlDQTtRQUNyRDBGLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBO1lBQ25CQSxJQUFJQSxDQUFDQSxZQUFZQSxHQUFHQTtnQkFDaEJBLG9CQUFvQkEsRUFBRUEsSUFBSUEsQ0FBQ0EscUJBQXFCQTtnQkFDaERBLE9BQU9BLEVBQUVBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BO2FBQ3ZDQSxDQUFDQTtRQUVOQSxJQUFJQSxDQUFDQSxxQkFBcUJBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2xDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxpQkFBaUJBLENBQUNBLENBQUNBO1FBQzlDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNqQ0EsSUFBSUEsQ0FBQ0EscUJBQXFCQSxFQUFFQSxDQUFDQTtJQUNqQ0EsQ0FBQ0E7SUFPRDFGLGtCQUFrQkEsQ0FBQ0EsSUFBYUE7UUFFNUIyRixJQUFJQSxDQUFDQSxxQkFBcUJBLEVBQUVBLENBQUNBO0lBQ2pDQSxDQUFDQTtJQUtEM0YsZUFBZUE7UUFDWDRGLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JCQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUVEQSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxpQkFBaUJBLENBQUNBLENBQUNBO1FBQ2pEQSxJQUFJQSxDQUFDQSxxQkFBcUJBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLG9CQUFvQkEsQ0FBQ0E7UUFDcEVBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLE9BQU9BLENBQUNBO1FBQ3hEQSxJQUFJQSxDQUFDQSxZQUFZQSxHQUFHQSxJQUFJQSxDQUFDQTtJQUM3QkEsQ0FBQ0E7SUFPRDVGLFFBQVFBLENBQUNBLEtBQWFBLEVBQUVBLEVBQWVBO1FBQ25DNkYsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDakJBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLEtBQUtBLENBQUNBO1FBQ3RCQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQSxhQUFhQSxFQUFFQSxFQUFFQSxLQUFLQSxFQUFFQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUV0REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsT0FBT0EsS0FBS0EsSUFBSUEsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckNBLElBQUlBLFVBQVVBLEdBQUdBLEtBQUtBLElBQUlBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLFlBQVlBLENBQUNBO1lBQzNEQSxVQUFVQSxDQUFDQSxDQUFDQSxPQUFPQSxFQUFFQSxVQUFVQSxDQUFDQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUNqREEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDckJBLENBQUNBO1FBRURBLG1CQUFtQkEsTUFBTUE7WUFDckJDLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLElBQUlBLEtBQUtBLENBQUNBO2dCQUN4QkEsTUFBTUEsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDdEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBO2dCQUNqQkEsTUFBTUEsQ0FBQ0E7WUFDWEEsZUFBZUEsQ0FDWEEsTUFBTUEsQ0FBQ0EsT0FBT0EsRUFDZEEsTUFBTUEsQ0FBQ0EsUUFBUUEsRUFDZkEsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsYUFBYUEsQ0FDaENBLENBQUNBO1lBRUZBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO2dCQUNaQSxjQUFjQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUUxREEsSUFBSUEsT0FBT0EsR0FBR0EsU0FBU0EsSUFBSUEsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsR0FBR0EsU0FBU0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsSUFBSUEsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFFM0dBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLElBQUlBLE9BQU9BLElBQUlBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO2dCQUM5Q0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDOUJBLENBQUNBO1lBR0RBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBO1lBRS9CQSxLQUFLQSxDQUFDQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQTtZQUNyQkEsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsRUFBRUEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7WUFDOUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLEVBQUVBLFVBQVVBLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBR3hEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDZEEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RCQSxLQUFLQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLENBQUNBO1lBQzdCQSxDQUFDQTtZQUVEQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFD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SUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzVDLENBQUM7S0FDSjtJQUNELEtBQUssRUFBRTtRQUNILEdBQUcsRUFBRSxVQUFTLEdBQUcsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUMsQ0FBQztRQUN6QyxHQUFHLEVBQUUsY0FBYSxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUN2RCxZQUFZLEVBQUUsa0JBQWtCO1FBQ2hDLFVBQVUsRUFBRSxJQUFJO0tBQ25CO0NBQ0osQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbmltcG9ydCB7YWRkQ3NzQ2xhc3MsIGNyZWF0ZUVsZW1lbnQsIGltcG9ydENzc1N0cmluZywgcmVtb3ZlQ3NzQ2xhc3MsIHNldENzc0NsYXNzfSBmcm9tIFwiLi9saWIvZG9tXCI7XG5pbXBvcnQge19lbWl0LCBkZWZpbmVPcHRpb25zLCBsb2FkTW9kdWxlLCByZXNldE9wdGlvbnN9IGZyb20gXCIuL2NvbmZpZ1wiO1xuaW1wb3J0IHtpc09sZElFfSBmcm9tIFwiLi9saWIvdXNlcmFnZW50XCI7XG5pbXBvcnQge0d1dHRlcn0gZnJvbSBcIi4vbGF5ZXIvZ3V0dGVyXCI7XG5pbXBvcnQge01hcmtlcn0gZnJvbSBcIi4vbGF5ZXIvbWFya2VyXCI7XG5pbXBvcnQge1RleHR9IGZyb20gXCIuL2xheWVyL3RleHRcIjtcbmltcG9ydCB7Q3Vyc29yfSBmcm9tIFwiLi9sYXllci9jdXJzb3JcIjtcbmltcG9ydCB7SFNjcm9sbEJhciwgVlNjcm9sbEJhcn0gZnJvbSBcIi4vc2Nyb2xsYmFyXCI7XG5pbXBvcnQge1JlbmRlckxvb3B9IGZyb20gXCIuL3JlbmRlcmxvb3BcIjtcbmltcG9ydCB7Rm9udE1ldHJpY3N9IGZyb20gXCIuL2xheWVyL2ZvbnRfbWV0cmljc1wiO1xuaW1wb3J0IHtFdmVudEVtaXR0ZXJDbGFzc30gZnJvbSBcIi4vbGliL2V2ZW50X2VtaXR0ZXJcIjtcbmltcG9ydCB7RWRpdFNlc3Npb259IGZyb20gJy4vZWRpdF9zZXNzaW9uJztcblxuLy8gRklYTUVcbi8vIGltcG9ydCBlZGl0b3JDc3MgPSByZXF1aXJlKFwiLi9yZXF1aXJlanMvdGV4dCEuL2Nzcy9lZGl0b3IuY3NzXCIpO1xuLy8gaW1wb3J0Q3NzU3RyaW5nKGVkaXRvckNzcywgXCJhY2VfZWRpdG9yXCIpO1xuXG52YXIgQ0hBTkdFX0NVUlNPUiA9IDE7XG52YXIgQ0hBTkdFX01BUktFUiA9IDI7XG52YXIgQ0hBTkdFX0dVVFRFUiA9IDQ7XG52YXIgQ0hBTkdFX1NDUk9MTCA9IDg7XG52YXIgQ0hBTkdFX0xJTkVTID0gMTY7XG52YXIgQ0hBTkdFX1RFWFQgPSAzMjtcbnZhciBDSEFOR0VfU0laRSA9IDY0O1xudmFyIENIQU5HRV9NQVJLRVJfQkFDSyA9IDEyODtcbnZhciBDSEFOR0VfTUFSS0VSX0ZST05UID0gMjU2O1xudmFyIENIQU5HRV9GVUxMID0gNTEyO1xudmFyIENIQU5HRV9IX1NDUk9MTCA9IDEwMjQ7XG5cbi8qKlxuICogVGhlIGNsYXNzIHRoYXQgaXMgcmVzcG9uc2libGUgZm9yIGRyYXdpbmcgZXZlcnl0aGluZyB5b3Ugc2VlIG9uIHRoZSBzY3JlZW4hXG4gKiBAcmVsYXRlZCBlZGl0b3IucmVuZGVyZXIgXG4gKiBAY2xhc3MgVmlydHVhbFJlbmRlcmVyXG4gKiovXG5leHBvcnQgY2xhc3MgVmlydHVhbFJlbmRlcmVyIGV4dGVuZHMgRXZlbnRFbWl0dGVyQ2xhc3Mge1xuICAgIHB1YmxpYyB0ZXh0YXJlYTogSFRNTFRleHRBcmVhRWxlbWVudDtcbiAgICBwdWJsaWMgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcbiAgICBwdWJsaWMgc2Nyb2xsTGVmdCA9IDA7XG4gICAgcHVibGljIHNjcm9sbFRvcCA9IDA7XG4gICAgcHVibGljIGxheWVyQ29uZmlnID0ge1xuICAgICAgICB3aWR0aDogMSxcbiAgICAgICAgcGFkZGluZzogMCxcbiAgICAgICAgZmlyc3RSb3c6IDAsXG4gICAgICAgIGZpcnN0Um93U2NyZWVuOiAwLFxuICAgICAgICBsYXN0Um93OiAwLFxuICAgICAgICBsaW5lSGVpZ2h0OiAwLFxuICAgICAgICBjaGFyYWN0ZXJXaWR0aDogMCxcbiAgICAgICAgbWluSGVpZ2h0OiAxLFxuICAgICAgICBtYXhIZWlnaHQ6IDEsXG4gICAgICAgIG9mZnNldDogMCxcbiAgICAgICAgaGVpZ2h0OiAxLFxuICAgICAgICBndXR0ZXJPZmZzZXQ6IDFcbiAgICB9O1xuICAgIHB1YmxpYyAkbWF4TGluZXM6IG51bWJlcjtcbiAgICBwdWJsaWMgJG1pbkxpbmVzOiBudW1iZXI7XG4gICAgcHVibGljICRjdXJzb3JMYXllcjogQ3Vyc29yO1xuICAgIHB1YmxpYyAkZ3V0dGVyTGF5ZXI6IEd1dHRlcjtcblxuICAgIHB1YmxpYyAkcGFkZGluZzogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlICRmcm96ZW4gPSBmYWxzZTtcblxuICAgIC8vIFRoZSB0aGVtZUlkIGlzIHdoYXQgaXMgY29tbXVuaWNhdGVkIGluIHRoZSBBUEkuXG4gICAgcHJpdmF0ZSAkdGhlbWVJZDogc3RyaW5nO1xuICAgIC8vIFdoYXQgYXJlIHRoZXNlP1xuICAgIHByaXZhdGUgdGhlbWU7XG4gICAgcHJpdmF0ZSAkdGhlbWU7XG5cbiAgICBwcml2YXRlICRvcHRpb25zO1xuICAgIHByaXZhdGUgJHRpbWVyO1xuICAgIHByaXZhdGUgU1RFUFMgPSA4O1xuICAgIHB1YmxpYyAka2VlcFRleHRBcmVhQXRDdXJzb3I6IGJvb2xlYW47XG4gICAgcHVibGljICRndXR0ZXI7XG4gICAgcHVibGljIHNjcm9sbGVyO1xuICAgIHB1YmxpYyBjb250ZW50OiBIVE1MRGl2RWxlbWVudDtcbiAgICBwdWJsaWMgJHRleHRMYXllcjogVGV4dDtcbiAgICBwcml2YXRlICRtYXJrZXJGcm9udDogTWFya2VyO1xuICAgIHByaXZhdGUgJG1hcmtlckJhY2s6IE1hcmtlcjtcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTERpdkVsZW1lbnQ7XG4gICAgcHJpdmF0ZSAkaG9yaXpTY3JvbGw6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkdlNjcm9sbDtcbiAgICBwdWJsaWMgc2Nyb2xsQmFySDogSFNjcm9sbEJhcjtcbiAgICBwdWJsaWMgc2Nyb2xsQmFyVjogVlNjcm9sbEJhcjtcbiAgICBwcml2YXRlICRzY3JvbGxBbmltYXRpb246IHsgZnJvbTogbnVtYmVyOyB0bzogbnVtYmVyOyBzdGVwczogbnVtYmVyW10gfTtcbiAgICBwcml2YXRlIHNlc3Npb246IEVkaXRTZXNzaW9uO1xuICAgIHByaXZhdGUgc2Nyb2xsTWFyZ2luID0ge1xuICAgICAgICBsZWZ0OiAwLFxuICAgICAgICByaWdodDogMCxcbiAgICAgICAgdG9wOiAwLFxuICAgICAgICBib3R0b206IDAsXG4gICAgICAgIHY6IDAsXG4gICAgICAgIGg6IDBcbiAgICB9O1xuXG4gICAgcHJpdmF0ZSAkZm9udE1ldHJpY3M7XG4gICAgcHJpdmF0ZSAkYWxsb3dCb2xkRm9udHM7XG4gICAgcHJpdmF0ZSBjdXJzb3JQb3M7XG4gICAgcHVibGljICRzaXplO1xuICAgIHByaXZhdGUgJGxvb3A7XG4gICAgcHJpdmF0ZSAkY2hhbmdlZExpbmVzO1xuICAgIHByaXZhdGUgJGNoYW5nZXMgPSAwO1xuICAgIHByaXZhdGUgcmVzaXppbmc7XG4gICAgcHJpdmF0ZSAkZ3V0dGVyTGluZUhpZ2hsaWdodDtcbiAgICBwcml2YXRlIGd1dHRlcldpZHRoO1xuICAgIHByaXZhdGUgJGd1dHRlcldpZHRoO1xuICAgIHByaXZhdGUgJHNob3dQcmludE1hcmdpbjtcbiAgICBwcml2YXRlICRwcmludE1hcmdpbkVsO1xuICAgIHByaXZhdGUgZ2V0T3B0aW9uO1xuICAgIHByaXZhdGUgc2V0T3B0aW9uO1xuICAgIHByaXZhdGUgY2hhcmFjdGVyV2lkdGg7XG4gICAgcHJpdmF0ZSAkcHJpbnRNYXJnaW5Db2x1bW47XG4gICAgcHJpdmF0ZSBsaW5lSGVpZ2h0O1xuICAgIHByaXZhdGUgJGV4dHJhSGVpZ2h0O1xuICAgIHByaXZhdGUgJGNvbXBvc2l0aW9uOiB7IGtlZXBUZXh0QXJlYUF0Q3Vyc29yOiBib29sZWFuOyBjc3NUZXh0OiBzdHJpbmcgfTtcbiAgICBwcml2YXRlICRoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTtcbiAgICBwcml2YXRlICR2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTtcbiAgICBwcml2YXRlICRzaG93R3V0dGVyO1xuICAgIHByaXZhdGUgc2hvd0ludmlzaWJsZXM7XG4gICAgcHJpdmF0ZSAkYW5pbWF0ZWRTY3JvbGw7XG4gICAgcHJpdmF0ZSAkc2Nyb2xsUGFzdEVuZDtcbiAgICBwcml2YXRlICRoaWdobGlnaHRHdXR0ZXJMaW5lO1xuICAgIHByaXZhdGUgZGVzaXJlZEhlaWdodDtcbiAgICAvKipcbiAgICAgKiBDb25zdHJ1Y3RzIGEgbmV3IGBWaXJ0dWFsUmVuZGVyZXJgIHdpdGhpbiB0aGUgYGNvbnRhaW5lcmAgc3BlY2lmaWVkLCBhcHBseWluZyB0aGUgZ2l2ZW4gYHRoZW1lYC5cbiAgICAgKiBAY2xhc3MgVmlydHVhbFJlbmRlcmVyXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQHBhcmFtIGNvbnRhaW5lciB7RE9NRWxlbWVudH0gVGhlIHJvb3QgZWxlbWVudCBvZiB0aGUgZWRpdG9yXG4gICAgICogQHBhcmFtIFt0aGVtZV0ge3N0cmluZ30gVGhlIHN0YXJ0aW5nIHRoZW1lXG4gICAgICovXG4gICAgY29uc3RydWN0b3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGhlbWU/OiBzdHJpbmcpIHtcbiAgICAgICAgc3VwZXIoKTtcblxuICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuXG4gICAgICAgIHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyIHx8IDxIVE1MRGl2RWxlbWVudD5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXG4gICAgICAgIC8vIFRPRE86IHRoaXMgYnJlYWtzIHJlbmRlcmluZyBpbiBDbG91ZDkgd2l0aCBtdWx0aXBsZSBhY2UgaW5zdGFuY2VzXG4gICAgICAgIC8vIC8vIEltcG9ydHMgQ1NTIG9uY2UgcGVyIERPTSBkb2N1bWVudCAoJ2FjZV9lZGl0b3InIHNlcnZlcyBhcyBhbiBpZGVudGlmaWVyKS5cbiAgICAgICAgLy8gaW1wb3J0Q3NzU3RyaW5nKGVkaXRvckNzcywgXCJhY2VfZWRpdG9yXCIsIGNvbnRhaW5lci5vd25lckRvY3VtZW50KTtcblxuICAgICAgICAvLyBpbiBJRSA8PSA5IHRoZSBuYXRpdmUgY3Vyc29yIGFsd2F5cyBzaGluZXMgdGhyb3VnaFxuICAgICAgICB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9ICFpc09sZElFO1xuXG4gICAgICAgIGFkZENzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBcImFjZV9lZGl0b3JcIik7XG5cbiAgICAgICAgdGhpcy5zZXRUaGVtZSh0aGVtZSk7XG5cbiAgICAgICAgdGhpcy4kZ3V0dGVyID0gY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGhpcy4kZ3V0dGVyLmNsYXNzTmFtZSA9IFwiYWNlX2d1dHRlclwiO1xuICAgICAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLiRndXR0ZXIpO1xuXG4gICAgICAgIHRoaXMuc2Nyb2xsZXIgPSBjcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB0aGlzLnNjcm9sbGVyLmNsYXNzTmFtZSA9IFwiYWNlX3Njcm9sbGVyXCI7XG4gICAgICAgIHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuc2Nyb2xsZXIpO1xuXG4gICAgICAgIHRoaXMuY29udGVudCA9IDxIVE1MRGl2RWxlbWVudD5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB0aGlzLmNvbnRlbnQuY2xhc3NOYW1lID0gXCJhY2VfY29udGVudFwiO1xuICAgICAgICB0aGlzLnNjcm9sbGVyLmFwcGVuZENoaWxkKHRoaXMuY29udGVudCk7XG5cbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIgPSBuZXcgR3V0dGVyKHRoaXMuJGd1dHRlcik7XG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyLm9uKFwiY2hhbmdlR3V0dGVyV2lkdGhcIiwgdGhpcy5vbkd1dHRlclJlc2l6ZS5iaW5kKHRoaXMpKTtcblxuICAgICAgICB0aGlzLiRtYXJrZXJCYWNrID0gbmV3IE1hcmtlcih0aGlzLmNvbnRlbnQpO1xuXG4gICAgICAgIHZhciB0ZXh0TGF5ZXIgPSB0aGlzLiR0ZXh0TGF5ZXIgPSBuZXcgVGV4dCh0aGlzLmNvbnRlbnQpO1xuICAgICAgICB0aGlzLmNhbnZhcyA9IHRleHRMYXllci5lbGVtZW50O1xuXG4gICAgICAgIHRoaXMuJG1hcmtlckZyb250ID0gbmV3IE1hcmtlcih0aGlzLmNvbnRlbnQpO1xuXG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyID0gbmV3IEN1cnNvcih0aGlzLmNvbnRlbnQpO1xuXG4gICAgICAgIC8vIEluZGljYXRlcyB3aGV0aGVyIHRoZSBob3Jpem9udGFsIHNjcm9sbGJhciBpcyB2aXNpYmxlXG4gICAgICAgIHRoaXMuJGhvcml6U2Nyb2xsID0gZmFsc2U7XG4gICAgICAgIHRoaXMuJHZTY3JvbGwgPSBmYWxzZTtcblxuICAgICAgICB0aGlzLnNjcm9sbEJhclYgPSBuZXcgVlNjcm9sbEJhcih0aGlzLmNvbnRhaW5lciwgdGhpcyk7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFySCA9IG5ldyBIU2Nyb2xsQmFyKHRoaXMuY29udGFpbmVyLCB0aGlzKTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJWLmFkZEV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgaWYgKCFfc2VsZi4kc2Nyb2xsQW5pbWF0aW9uKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxUb3AoZS5kYXRhIC0gX3NlbGYuc2Nyb2xsTWFyZ2luLnRvcCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnNjcm9sbEJhckguYWRkRXZlbnRMaXN0ZW5lcihcInNjcm9sbFwiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBpZiAoIV9zZWxmLiRzY3JvbGxBbmltYXRpb24pIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXNzaW9uLnNldFNjcm9sbExlZnQoZS5kYXRhIC0gX3NlbGYuc2Nyb2xsTWFyZ2luLmxlZnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmN1cnNvclBvcyA9IHtcbiAgICAgICAgICAgIHJvdzogMCxcbiAgICAgICAgICAgIGNvbHVtbjogMFxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuJGZvbnRNZXRyaWNzID0gbmV3IEZvbnRNZXRyaWNzKHRoaXMuY29udGFpbmVyLCA1MDApO1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuJHNldEZvbnRNZXRyaWNzKHRoaXMuJGZvbnRNZXRyaWNzKTtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VDaGFyYWN0ZXJTaXplXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIF9zZWxmLnVwZGF0ZUNoYXJhY3RlclNpemUoKTtcbiAgICAgICAgICAgIF9zZWxmLm9uUmVzaXplKHRydWUsIF9zZWxmLmd1dHRlcldpZHRoLCBfc2VsZi4kc2l6ZS53aWR0aCwgX3NlbGYuJHNpemUuaGVpZ2h0KTtcbiAgICAgICAgICAgIF9zZWxmLl9zaWduYWwoXCJjaGFuZ2VDaGFyYWN0ZXJTaXplXCIsIGUpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLiRzaXplID0ge1xuICAgICAgICAgICAgd2lkdGg6IDAsXG4gICAgICAgICAgICBoZWlnaHQ6IDAsXG4gICAgICAgICAgICBzY3JvbGxlckhlaWdodDogMCxcbiAgICAgICAgICAgIHNjcm9sbGVyV2lkdGg6IDAsXG4gICAgICAgICAgICAkZGlydHk6IHRydWVcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLiRsb29wID0gbmV3IFJlbmRlckxvb3AoXG4gICAgICAgICAgICB0aGlzLiRyZW5kZXJDaGFuZ2VzLmJpbmQodGhpcyksXG4gICAgICAgICAgICB0aGlzLmNvbnRhaW5lci5vd25lckRvY3VtZW50LmRlZmF1bHRWaWV3XG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuXG4gICAgICAgIHRoaXMudXBkYXRlQ2hhcmFjdGVyU2l6ZSgpO1xuICAgICAgICB0aGlzLnNldFBhZGRpbmcoNCk7XG4gICAgICAgIHJlc2V0T3B0aW9ucyh0aGlzKTtcbiAgICAgICAgX2VtaXQoXCJyZW5kZXJlclwiLCB0aGlzKTtcbiAgICB9XG5cbiAgICBzZXQgbWF4TGluZXMobWF4TGluZXM6IG51bWJlcikge1xuICAgICAgICB0aGlzLiRtYXhMaW5lcyA9IG1heExpbmVzO1xuICAgIH1cblxuICAgIHNldCBrZWVwVGV4dEFyZWFBdEN1cnNvcihrZWVwVGV4dEFyZWFBdEN1cnNvcjogYm9vbGVhbikge1xuICAgICAgICB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IGtlZXBUZXh0QXJlYUF0Q3Vyc29yO1xuICAgIH1cblxuICAgIHNldERlZmF1bHRDdXJzb3JTdHlsZSgpIHtcbiAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLmN1cnNvciA9IFwiZGVmYXVsdFwiO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE5vdCBzdXJlIHdoYXQgdGhlIGNvcnJlY3Qgc2VtYW50aWNzIHNob3VsZCBiZSBmb3IgdGhpcy5cbiAgICAgKi9cbiAgICBzZXRDdXJzb3JMYXllck9mZigpIHtcbiAgICAgICAgdmFyIG5vb3AgPSBmdW5jdGlvbigpIHsgfTtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIucmVzdGFydFRpbWVyID0gbm9vcDtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuZWxlbWVudC5zdHlsZS5vcGFjaXR5ID0gXCIwXCI7XG4gICAgfVxuXG4gICAgdXBkYXRlQ2hhcmFjdGVyU2l6ZSgpIHtcbiAgICAgICAgLy8gRklYTUU6IERHSCBhbGxvd0JvbEZvbnRzIGRvZXMgbm90IGV4aXN0IG9uIFRleHRcbiAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllclsnYWxsb3dCb2xkRm9udHMnXSAhPSB0aGlzLiRhbGxvd0JvbGRGb250cykge1xuICAgICAgICAgICAgdGhpcy4kYWxsb3dCb2xkRm9udHMgPSB0aGlzLiR0ZXh0TGF5ZXJbJ2FsbG93Qm9sZEZvbnRzJ107XG4gICAgICAgICAgICB0aGlzLnNldFN0eWxlKFwiYWNlX25vYm9sZFwiLCAhdGhpcy4kYWxsb3dCb2xkRm9udHMpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5sYXllckNvbmZpZy5jaGFyYWN0ZXJXaWR0aCA9IHRoaXMuY2hhcmFjdGVyV2lkdGggPSB0aGlzLiR0ZXh0TGF5ZXIuZ2V0Q2hhcmFjdGVyV2lkdGgoKTtcbiAgICAgICAgdGhpcy5sYXllckNvbmZpZy5saW5lSGVpZ2h0ID0gdGhpcy5saW5lSGVpZ2h0ID0gdGhpcy4kdGV4dExheWVyLmdldExpbmVIZWlnaHQoKTtcbiAgICAgICAgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBBc3NvY2lhdGVzIHRoZSByZW5kZXJlciB3aXRoIGFuIFtbRWRpdFNlc3Npb24gYEVkaXRTZXNzaW9uYF1dLlxuICAgICoqL1xuICAgIHNldFNlc3Npb24oc2Vzc2lvbikge1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uKVxuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmRvYy5vZmYoXCJjaGFuZ2VOZXdMaW5lTW9kZVwiLCB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUpO1xuXG4gICAgICAgIHRoaXMuc2Vzc2lvbiA9IHNlc3Npb247XG4gICAgICAgIGlmICghc2Vzc2lvbilcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBpZiAodGhpcy5zY3JvbGxNYXJnaW4udG9wICYmIHNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgPD0gMClcbiAgICAgICAgICAgIHNlc3Npb24uc2V0U2Nyb2xsVG9wKC10aGlzLnNjcm9sbE1hcmdpbi50b3ApO1xuXG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJG1hcmtlckJhY2suc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQuc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgICAgICB0aGlzLnNlc3Npb24uJHNldEZvbnRNZXRyaWNzKHRoaXMuJGZvbnRNZXRyaWNzKTtcblxuICAgICAgICB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUgPSB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlKClcbiAgICAgICAgdGhpcy5zZXNzaW9uLmRvYy5vbihcImNoYW5nZU5ld0xpbmVNb2RlXCIsIHRoaXMub25DaGFuZ2VOZXdMaW5lTW9kZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBUcmlnZ2VycyBhIHBhcnRpYWwgdXBkYXRlIG9mIHRoZSB0ZXh0LCBmcm9tIHRoZSByYW5nZSBnaXZlbiBieSB0aGUgdHdvIHBhcmFtZXRlcnMuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZmlyc3RSb3cgVGhlIGZpcnN0IHJvdyB0byB1cGRhdGVcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBsYXN0IHJvdyB0byB1cGRhdGVcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHVwZGF0ZUxpbmVzKGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlciwgZm9yY2U/OiBib29sZWFuKSB7XG4gICAgICAgIGlmIChsYXN0Um93ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGxhc3RSb3cgPSBJbmZpbml0eTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy4kY2hhbmdlZExpbmVzKSB7XG4gICAgICAgICAgICB0aGlzLiRjaGFuZ2VkTGluZXMgPSB7IGZpcnN0Um93OiBmaXJzdFJvdywgbGFzdFJvdzogbGFzdFJvdyB9O1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKHRoaXMuJGNoYW5nZWRMaW5lcy5maXJzdFJvdyA+IGZpcnN0Um93KSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzLmZpcnN0Um93ID0gZmlyc3RSb3c7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdyA8IGxhc3RSb3cpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdyA9IGxhc3RSb3c7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB0aGUgY2hhbmdlIGhhcHBlbmVkIG9mZnNjcmVlbiBhYm92ZSB1cyB0aGVuIGl0J3MgcG9zc2libGVcbiAgICAgICAgLy8gdGhhdCBhIG5ldyBsaW5lIHdyYXAgd2lsbCBhZmZlY3QgdGhlIHBvc2l0aW9uIG9mIHRoZSBsaW5lcyBvbiBvdXJcbiAgICAgICAgLy8gc2NyZWVuIHNvIHRoZXkgbmVlZCByZWRyYXduLlxuICAgICAgICAvLyBUT0RPOiBiZXR0ZXIgc29sdXRpb24gaXMgdG8gbm90IGNoYW5nZSBzY3JvbGwgcG9zaXRpb24gd2hlbiB0ZXh0IGlzIGNoYW5nZWQgb3V0c2lkZSBvZiB2aXNpYmxlIGFyZWFcbiAgICAgICAgaWYgKHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93IDwgdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdykge1xuICAgICAgICAgICAgaWYgKGZvcmNlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3cgPSB0aGlzLmxheWVyQ29uZmlnLmxhc3RSb3c7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy4kY2hhbmdlZExpbmVzLmZpcnN0Um93ID4gdGhpcy5sYXllckNvbmZpZy5sYXN0Um93KSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfTElORVMpO1xuICAgIH1cblxuICAgIG9uQ2hhbmdlTmV3TGluZU1vZGUoKSB7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX1RFWFQpO1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuJHVwZGF0ZUVvbENoYXIoKTtcbiAgICB9XG5cbiAgICBvbkNoYW5nZVRhYlNpemUoKSB7XG4gICAgICAgIGlmICh0aGlzLiRsb29wKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kbG9vcC5zY2hlZHVsZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX1RFWFQgfCBDSEFOR0VfTUFSS0VSKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLiR0ZXh0TGF5ZXIpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiR0ZXh0TGF5ZXIub25DaGFuZ2VUYWJTaXplKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLm9uQ2hhbmdlVGFiU2l6ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gSSdtIG5vdCBzdXJlIHdoeSB3ZSBjYW4gbm93IGVuZCB1cCBoZXJlLlxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBUcmlnZ2VycyBhIGZ1bGwgdXBkYXRlIG9mIHRoZSB0ZXh0LCBmb3IgYWxsIHRoZSByb3dzLlxuICAgICoqL1xuICAgIHVwZGF0ZVRleHQoKSB7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX1RFWFQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogVHJpZ2dlcnMgYSBmdWxsIHVwZGF0ZSBvZiBhbGwgdGhlIGxheWVycywgZm9yIGFsbCB0aGUgcm93cy5cbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZm9yY2UgSWYgYHRydWVgLCBmb3JjZXMgdGhlIGNoYW5nZXMgdGhyb3VnaFxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgdXBkYXRlRnVsbChmb3JjZT8pIHtcbiAgICAgICAgaWYgKGZvcmNlKVxuICAgICAgICAgICAgdGhpcy4kcmVuZGVyQ2hhbmdlcyhDSEFOR0VfRlVMTCwgdHJ1ZSk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFVwZGF0ZXMgdGhlIGZvbnQgc2l6ZS5cbiAgICAqKi9cbiAgICB1cGRhdGVGb250U2l6ZSgpIHtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLmNoZWNrRm9yU2l6ZUNoYW5nZXMoKTtcbiAgICB9XG5cbiAgICAkdXBkYXRlU2l6ZUFzeW5jKCkge1xuICAgICAgICBpZiAodGhpcy4kbG9vcC5wZW5kaW5nKVxuICAgICAgICAgICAgdGhpcy4kc2l6ZS4kZGlydHkgPSB0cnVlO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLm9uUmVzaXplKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBbVHJpZ2dlcnMgYSByZXNpemUgb2YgdGhlIGVkaXRvci5dezogI1ZpcnR1YWxSZW5kZXJlci5vblJlc2l6ZX1cbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZm9yY2UgSWYgYHRydWVgLCByZWNvbXB1dGVzIHRoZSBzaXplLCBldmVuIGlmIHRoZSBoZWlnaHQgYW5kIHdpZHRoIGhhdmVuJ3QgY2hhbmdlZFxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGd1dHRlcldpZHRoIFRoZSB3aWR0aCBvZiB0aGUgZ3V0dGVyIGluIHBpeGVsc1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IHdpZHRoIFRoZSB3aWR0aCBvZiB0aGUgZWRpdG9yIGluIHBpeGVsc1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGhlaWdodCBUaGUgaGllaGd0IG9mIHRoZSBlZGl0b3IsIGluIHBpeGVsc1xuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgb25SZXNpemUoZm9yY2U/OiBib29sZWFuLCBndXR0ZXJXaWR0aD86IG51bWJlciwgd2lkdGg/OiBudW1iZXIsIGhlaWdodD86IG51bWJlcikge1xuICAgICAgICBpZiAodGhpcy5yZXNpemluZyA+IDIpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGVsc2UgaWYgKHRoaXMucmVzaXppbmcgPiAwKVxuICAgICAgICAgICAgdGhpcy5yZXNpemluZysrO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLnJlc2l6aW5nID0gZm9yY2UgPyAxIDogMDtcbiAgICAgICAgLy8gYHx8IGVsLnNjcm9sbEhlaWdodGAgaXMgcmVxdWlyZWQgZm9yIG91dG9zaXppbmcgZWRpdG9ycyBvbiBpZVxuICAgICAgICAvLyB3aGVyZSBlbGVtZW50cyB3aXRoIGNsaWVudEhlaWdodCA9IDAgYWxzb2UgaGF2ZSBjbGllbnRXaWR0aCA9IDBcbiAgICAgICAgdmFyIGVsID0gdGhpcy5jb250YWluZXI7XG4gICAgICAgIGlmICghaGVpZ2h0KVxuICAgICAgICAgICAgaGVpZ2h0ID0gZWwuY2xpZW50SGVpZ2h0IHx8IGVsLnNjcm9sbEhlaWdodDtcbiAgICAgICAgaWYgKCF3aWR0aClcbiAgICAgICAgICAgIHdpZHRoID0gZWwuY2xpZW50V2lkdGggfHwgZWwuc2Nyb2xsV2lkdGg7XG4gICAgICAgIHZhciBjaGFuZ2VzID0gdGhpcy4kdXBkYXRlQ2FjaGVkU2l6ZShmb3JjZSwgZ3V0dGVyV2lkdGgsIHdpZHRoLCBoZWlnaHQpO1xuXG5cbiAgICAgICAgaWYgKCF0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0IHx8ICghd2lkdGggJiYgIWhlaWdodCkpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5yZXNpemluZyA9IDA7XG5cbiAgICAgICAgaWYgKGZvcmNlKVxuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuJHBhZGRpbmcgPSBudWxsO1xuXG4gICAgICAgIGlmIChmb3JjZSlcbiAgICAgICAgICAgIHRoaXMuJHJlbmRlckNoYW5nZXMoY2hhbmdlcyB8IHRoaXMuJGNoYW5nZXMsIHRydWUpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKGNoYW5nZXMgfCB0aGlzLiRjaGFuZ2VzKTtcblxuICAgICAgICBpZiAodGhpcy5yZXNpemluZylcbiAgICAgICAgICAgIHRoaXMucmVzaXppbmcgPSAwO1xuICAgIH1cblxuICAgICR1cGRhdGVDYWNoZWRTaXplKGZvcmNlLCBndXR0ZXJXaWR0aCwgd2lkdGgsIGhlaWdodCkge1xuICAgICAgICBoZWlnaHQgLT0gKHRoaXMuJGV4dHJhSGVpZ2h0IHx8IDApO1xuICAgICAgICB2YXIgY2hhbmdlcyA9IDA7XG4gICAgICAgIHZhciBzaXplID0gdGhpcy4kc2l6ZTtcbiAgICAgICAgdmFyIG9sZFNpemUgPSB7XG4gICAgICAgICAgICB3aWR0aDogc2l6ZS53aWR0aCxcbiAgICAgICAgICAgIGhlaWdodDogc2l6ZS5oZWlnaHQsXG4gICAgICAgICAgICBzY3JvbGxlckhlaWdodDogc2l6ZS5zY3JvbGxlckhlaWdodCxcbiAgICAgICAgICAgIHNjcm9sbGVyV2lkdGg6IHNpemUuc2Nyb2xsZXJXaWR0aFxuICAgICAgICB9O1xuICAgICAgICBpZiAoaGVpZ2h0ICYmIChmb3JjZSB8fCBzaXplLmhlaWdodCAhPSBoZWlnaHQpKSB7XG4gICAgICAgICAgICBzaXplLmhlaWdodCA9IGhlaWdodDtcbiAgICAgICAgICAgIGNoYW5nZXMgfD0gQ0hBTkdFX1NJWkU7XG5cbiAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJIZWlnaHQgPSBzaXplLmhlaWdodDtcbiAgICAgICAgICAgIGlmICh0aGlzLiRob3JpelNjcm9sbClcbiAgICAgICAgICAgICAgICBzaXplLnNjcm9sbGVySGVpZ2h0IC09IHRoaXMuc2Nyb2xsQmFySC5oZWlnaHQ7XG5cbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5lbGVtZW50LnN0eWxlLmJvdHRvbSA9IHRoaXMuc2Nyb2xsQmFySC5oZWlnaHQgKyBcInB4XCI7XG5cbiAgICAgICAgICAgIGNoYW5nZXMgPSBjaGFuZ2VzIHwgQ0hBTkdFX1NDUk9MTDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh3aWR0aCAmJiAoZm9yY2UgfHwgc2l6ZS53aWR0aCAhPSB3aWR0aCkpIHtcbiAgICAgICAgICAgIGNoYW5nZXMgfD0gQ0hBTkdFX1NJWkU7XG4gICAgICAgICAgICBzaXplLndpZHRoID0gd2lkdGg7XG5cbiAgICAgICAgICAgIGlmIChndXR0ZXJXaWR0aCA9PSBudWxsKVxuICAgICAgICAgICAgICAgIGd1dHRlcldpZHRoID0gdGhpcy4kc2hvd0d1dHRlciA/IHRoaXMuJGd1dHRlci5vZmZzZXRXaWR0aCA6IDA7XG5cbiAgICAgICAgICAgIHRoaXMuZ3V0dGVyV2lkdGggPSBndXR0ZXJXaWR0aDtcblxuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJILmVsZW1lbnQuc3R5bGUubGVmdCA9XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxlci5zdHlsZS5sZWZ0ID0gZ3V0dGVyV2lkdGggKyBcInB4XCI7XG4gICAgICAgICAgICBzaXplLnNjcm9sbGVyV2lkdGggPSBNYXRoLm1heCgwLCB3aWR0aCAtIGd1dHRlcldpZHRoIC0gdGhpcy5zY3JvbGxCYXJWLndpZHRoKTtcblxuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJILmVsZW1lbnQuc3R5bGUucmlnaHQgPVxuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsZXIuc3R5bGUucmlnaHQgPSB0aGlzLnNjcm9sbEJhclYud2lkdGggKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbGVyLnN0eWxlLmJvdHRvbSA9IHRoaXMuc2Nyb2xsQmFySC5oZWlnaHQgKyBcInB4XCI7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLnNlc3Npb24gJiYgdGhpcy5zZXNzaW9uLmdldFVzZVdyYXBNb2RlKCkgJiYgdGhpcy5hZGp1c3RXcmFwTGltaXQoKSB8fCBmb3JjZSlcbiAgICAgICAgICAgICAgICBjaGFuZ2VzIHw9IENIQU5HRV9GVUxMO1xuICAgICAgICB9XG5cbiAgICAgICAgc2l6ZS4kZGlydHkgPSAhd2lkdGggfHwgIWhlaWdodDtcblxuICAgICAgICBpZiAoY2hhbmdlcylcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcInJlc2l6ZVwiLCBvbGRTaXplKTtcblxuICAgICAgICByZXR1cm4gY2hhbmdlcztcbiAgICB9XG5cbiAgICBvbkd1dHRlclJlc2l6ZSgpIHtcbiAgICAgICAgdmFyIGd1dHRlcldpZHRoID0gdGhpcy4kc2hvd0d1dHRlciA/IHRoaXMuJGd1dHRlci5vZmZzZXRXaWR0aCA6IDA7XG4gICAgICAgIGlmIChndXR0ZXJXaWR0aCAhPSB0aGlzLmd1dHRlcldpZHRoKVxuICAgICAgICAgICAgdGhpcy4kY2hhbmdlcyB8PSB0aGlzLiR1cGRhdGVDYWNoZWRTaXplKHRydWUsIGd1dHRlcldpZHRoLCB0aGlzLiRzaXplLndpZHRoLCB0aGlzLiRzaXplLmhlaWdodCk7XG5cbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi5nZXRVc2VXcmFwTW9kZSgpICYmIHRoaXMuYWRqdXN0V3JhcExpbWl0KCkpIHtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuJHNpemUuJGRpcnR5KSB7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJGNvbXB1dGVMYXllckNvbmZpZygpO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfTUFSS0VSKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogQWRqdXN0cyB0aGUgd3JhcCBsaW1pdCwgd2hpY2ggaXMgdGhlIG51bWJlciBvZiBjaGFyYWN0ZXJzIHRoYXQgY2FuIGZpdCB3aXRoaW4gdGhlIHdpZHRoIG9mIHRoZSBlZGl0IGFyZWEgb24gc2NyZWVuLlxuICAgICoqL1xuICAgIGFkanVzdFdyYXBMaW1pdCgpIHtcbiAgICAgICAgdmFyIGF2YWlsYWJsZVdpZHRoID0gdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gdGhpcy4kcGFkZGluZyAqIDI7XG4gICAgICAgIHZhciBsaW1pdCA9IE1hdGguZmxvb3IoYXZhaWxhYmxlV2lkdGggLyB0aGlzLmNoYXJhY3RlcldpZHRoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5hZGp1c3RXcmFwTGltaXQobGltaXQsIHRoaXMuJHNob3dQcmludE1hcmdpbiAmJiB0aGlzLiRwcmludE1hcmdpbkNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gaGF2ZSBhbiBhbmltYXRlZCBzY3JvbGwgb3Igbm90LlxuICAgICogQHBhcmFtIHtCb29sZWFufSBzaG91bGRBbmltYXRlIFNldCB0byBgdHJ1ZWAgdG8gc2hvdyBhbmltYXRlZCBzY3JvbGxzXG4gICAgKlxuICAgICoqL1xuICAgIHNldEFuaW1hdGVkU2Nyb2xsKHNob3VsZEFuaW1hdGUpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJhbmltYXRlZFNjcm9sbFwiLCBzaG91bGRBbmltYXRlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgd2hldGhlciBhbiBhbmltYXRlZCBzY3JvbGwgaGFwcGVucyBvciBub3QuXG4gICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAqKi9cbiAgICBnZXRBbmltYXRlZFNjcm9sbCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGFuaW1hdGVkU2Nyb2xsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IGludmlzaWJsZSBjaGFyYWN0ZXJzIG9yIG5vdC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3dJbnZpc2libGVzIFNldCB0byBgdHJ1ZWAgdG8gc2hvdyBpbnZpc2libGVzXG4gICAgICovXG4gICAgc2V0U2hvd0ludmlzaWJsZXMoc2hvd0ludmlzaWJsZXM6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJzaG93SW52aXNpYmxlc1wiLCBzaG93SW52aXNpYmxlcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB3aGV0aGVyIGludmlzaWJsZSBjaGFyYWN0ZXJzIGFyZSBiZWluZyBzaG93biBvciBub3QuXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd0ludmlzaWJsZXMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInNob3dJbnZpc2libGVzXCIpO1xuICAgIH1cblxuICAgIGdldERpc3BsYXlJbmRlbnRHdWlkZXMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImRpc3BsYXlJbmRlbnRHdWlkZXNcIik7XG4gICAgfVxuXG4gICAgc2V0RGlzcGxheUluZGVudEd1aWRlcyhkaXNwbGF5SW5kZW50R3VpZGVzOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiZGlzcGxheUluZGVudEd1aWRlc1wiLCBkaXNwbGF5SW5kZW50R3VpZGVzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyB0aGUgcHJpbnQgbWFyZ2luIG9yIG5vdC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3dQcmludE1hcmdpbiBTZXQgdG8gYHRydWVgIHRvIHNob3cgdGhlIHByaW50IG1hcmdpblxuICAgICAqXG4gICAgICovXG4gICAgc2V0U2hvd1ByaW50TWFyZ2luKHNob3dQcmludE1hcmdpbjogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInNob3dQcmludE1hcmdpblwiLCBzaG93UHJpbnRNYXJnaW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciB0aGUgcHJpbnQgbWFyZ2luIGlzIGJlaW5nIHNob3duIG9yIG5vdC5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93UHJpbnRNYXJnaW4oKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInNob3dQcmludE1hcmdpblwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBjb2x1bW4gZGVmaW5pbmcgd2hlcmUgdGhlIHByaW50IG1hcmdpbiBzaG91bGQgYmUuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHByaW50TWFyZ2luQ29sdW1uIFNwZWNpZmllcyB0aGUgbmV3IHByaW50IG1hcmdpblxuICAgICAqL1xuICAgIHNldFByaW50TWFyZ2luQ29sdW1uKHByaW50TWFyZ2luQ29sdW1uOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJwcmludE1hcmdpbkNvbHVtblwiLCBwcmludE1hcmdpbkNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY29sdW1uIG51bWJlciBvZiB3aGVyZSB0aGUgcHJpbnQgbWFyZ2luIGlzLlxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgICovXG4gICAgZ2V0UHJpbnRNYXJnaW5Db2x1bW4oKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwicHJpbnRNYXJnaW5Db2x1bW5cIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGd1dHRlciBpcyBiZWluZyBzaG93bi5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93R3V0dGVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzaG93R3V0dGVyXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgdGhlIGd1dHRlciBvciBub3QuXG4gICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3cgU2V0IHRvIGB0cnVlYCB0byBzaG93IHRoZSBndXR0ZXJcbiAgICAqXG4gICAgKiovXG4gICAgc2V0U2hvd0d1dHRlcihzaG93KSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNldE9wdGlvbihcInNob3dHdXR0ZXJcIiwgc2hvdyk7XG4gICAgfVxuXG4gICAgZ2V0RmFkZUZvbGRXaWRnZXRzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJmYWRlRm9sZFdpZGdldHNcIilcbiAgICB9XG5cbiAgICBzZXRGYWRlRm9sZFdpZGdldHMoc2hvdykge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImZhZGVGb2xkV2lkZ2V0c1wiLCBzaG93KTtcbiAgICB9XG5cbiAgICBzZXRIaWdobGlnaHRHdXR0ZXJMaW5lKHNob3VsZEhpZ2hsaWdodCkge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImhpZ2hsaWdodEd1dHRlckxpbmVcIiwgc2hvdWxkSGlnaGxpZ2h0KTtcbiAgICB9XG5cbiAgICBnZXRIaWdobGlnaHRHdXR0ZXJMaW5lKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJoaWdobGlnaHRHdXR0ZXJMaW5lXCIpO1xuICAgIH1cblxuICAgICR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0KCkge1xuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zO1xuICAgICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5sYXllckNvbmZpZy5saW5lSGVpZ2h0O1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmdldFVzZVdyYXBNb2RlKCkpIHtcbiAgICAgICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLnNlc3Npb24uc2VsZWN0aW9uLmdldEN1cnNvcigpO1xuICAgICAgICAgICAgY3Vyc29yLmNvbHVtbiA9IDA7XG4gICAgICAgICAgICBwb3MgPSB0aGlzLiRjdXJzb3JMYXllci5nZXRQaXhlbFBvc2l0aW9uKGN1cnNvciwgdHJ1ZSk7XG4gICAgICAgICAgICBoZWlnaHQgKj0gdGhpcy5zZXNzaW9uLmdldFJvd0xlbmd0aChjdXJzb3Iucm93KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0LnN0eWxlLnRvcCA9IHBvcy50b3AgLSB0aGlzLmxheWVyQ29uZmlnLm9mZnNldCArIFwicHhcIjtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodC5zdHlsZS5oZWlnaHQgPSBoZWlnaHQgKyBcInB4XCI7XG4gICAgfVxuXG4gICAgJHVwZGF0ZVByaW50TWFyZ2luKCkge1xuICAgICAgICBpZiAoIXRoaXMuJHNob3dQcmludE1hcmdpbiAmJiAhdGhpcy4kcHJpbnRNYXJnaW5FbClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBpZiAoIXRoaXMuJHByaW50TWFyZ2luRWwpIHtcbiAgICAgICAgICAgIHZhciBjb250YWluZXJFbDogSFRNTERpdkVsZW1lbnQgPSA8SFRNTERpdkVsZW1lbnQ+Y3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIGNvbnRhaW5lckVsLmNsYXNzTmFtZSA9IFwiYWNlX2xheWVyIGFjZV9wcmludC1tYXJnaW4tbGF5ZXJcIjtcbiAgICAgICAgICAgIHRoaXMuJHByaW50TWFyZ2luRWwgPSBjcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgdGhpcy4kcHJpbnRNYXJnaW5FbC5jbGFzc05hbWUgPSBcImFjZV9wcmludC1tYXJnaW5cIjtcbiAgICAgICAgICAgIGNvbnRhaW5lckVsLmFwcGVuZENoaWxkKHRoaXMuJHByaW50TWFyZ2luRWwpO1xuICAgICAgICAgICAgdGhpcy5jb250ZW50Lmluc2VydEJlZm9yZShjb250YWluZXJFbCwgdGhpcy5jb250ZW50LmZpcnN0Q2hpbGQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHN0eWxlID0gdGhpcy4kcHJpbnRNYXJnaW5FbC5zdHlsZTtcbiAgICAgICAgc3R5bGUubGVmdCA9ICgodGhpcy5jaGFyYWN0ZXJXaWR0aCAqIHRoaXMuJHByaW50TWFyZ2luQ29sdW1uKSArIHRoaXMuJHBhZGRpbmcpICsgXCJweFwiO1xuICAgICAgICBzdHlsZS52aXNpYmlsaXR5ID0gdGhpcy4kc2hvd1ByaW50TWFyZ2luID8gXCJ2aXNpYmxlXCIgOiBcImhpZGRlblwiO1xuXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24gJiYgdGhpcy5zZXNzaW9uWyckd3JhcCddID09IC0xKVxuICAgICAgICAgICAgdGhpcy5hZGp1c3RXcmFwTGltaXQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSByb290IGVsZW1lbnQgY29udGFpbmluZyB0aGlzIHJlbmRlcmVyLlxuICAgICogQHJldHVybnMge0RPTUVsZW1lbnR9XG4gICAgKiovXG4gICAgZ2V0Q29udGFpbmVyRWxlbWVudCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGFpbmVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGVsZW1lbnQgdGhhdCB0aGUgbW91c2UgZXZlbnRzIGFyZSBhdHRhY2hlZCB0b1xuICAgICogQHJldHVybnMge0RPTUVsZW1lbnR9XG4gICAgKiovXG4gICAgZ2V0TW91c2VFdmVudFRhcmdldCgpOiBIVE1MRGl2RWxlbWVudCB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRlbnQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgZWxlbWVudCB0byB3aGljaCB0aGUgaGlkZGVuIHRleHQgYXJlYSBpcyBhZGRlZC5cbiAgICAqIEByZXR1cm5zIHtET01FbGVtZW50fVxuICAgICoqL1xuICAgIGdldFRleHRBcmVhQ29udGFpbmVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jb250YWluZXI7XG4gICAgfVxuXG4gICAgLy8gbW92ZSB0ZXh0IGlucHV0IG92ZXIgdGhlIGN1cnNvclxuICAgIC8vIHRoaXMgaXMgcmVxdWlyZWQgZm9yIGlPUyBhbmQgSU1FXG4gICAgJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCkge1xuICAgICAgICBpZiAoIXRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgY29uZmlnID0gdGhpcy5sYXllckNvbmZpZztcbiAgICAgICAgdmFyIHBvc1RvcCA9IHRoaXMuJGN1cnNvckxheWVyLiRwaXhlbFBvcy50b3A7XG4gICAgICAgIHZhciBwb3NMZWZ0ID0gdGhpcy4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zLmxlZnQ7XG4gICAgICAgIHBvc1RvcCAtPSBjb25maWcub2Zmc2V0O1xuXG4gICAgICAgIHZhciBoID0gdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICBpZiAocG9zVG9wIDwgMCB8fCBwb3NUb3AgPiBjb25maWcuaGVpZ2h0IC0gaClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgdyA9IHRoaXMuY2hhcmFjdGVyV2lkdGg7XG4gICAgICAgIGlmICh0aGlzLiRjb21wb3NpdGlvbikge1xuICAgICAgICAgICAgdmFyIHZhbCA9IHRoaXMudGV4dGFyZWEudmFsdWUucmVwbGFjZSgvXlxceDAxKy8sIFwiXCIpO1xuICAgICAgICAgICAgdyAqPSAodGhpcy5zZXNzaW9uLiRnZXRTdHJpbmdTY3JlZW5XaWR0aCh2YWwpWzBdICsgMik7XG4gICAgICAgICAgICBoICs9IDI7XG4gICAgICAgICAgICBwb3NUb3AgLT0gMTtcbiAgICAgICAgfVxuICAgICAgICBwb3NMZWZ0IC09IHRoaXMuc2Nyb2xsTGVmdDtcbiAgICAgICAgaWYgKHBvc0xlZnQgPiB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSB3KVxuICAgICAgICAgICAgcG9zTGVmdCA9IHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCAtIHc7XG5cbiAgICAgICAgcG9zTGVmdCAtPSB0aGlzLnNjcm9sbEJhclYud2lkdGg7XG5cbiAgICAgICAgdGhpcy50ZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSBoICsgXCJweFwiO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLndpZHRoID0gdyArIFwicHhcIjtcbiAgICAgICAgdGhpcy50ZXh0YXJlYS5zdHlsZS5yaWdodCA9IE1hdGgubWF4KDAsIHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCAtIHBvc0xlZnQgLSB3KSArIFwicHhcIjtcbiAgICAgICAgdGhpcy50ZXh0YXJlYS5zdHlsZS5ib3R0b20gPSBNYXRoLm1heCgwLCB0aGlzLiRzaXplLmhlaWdodCAtIHBvc1RvcCAtIGgpICsgXCJweFwiO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFtSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgZmlyc3QgdmlzaWJsZSByb3cuXXs6ICNWaXJ0dWFsUmVuZGVyZXIuZ2V0Rmlyc3RWaXNpYmxlUm93fVxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRGaXJzdFZpc2libGVSb3coKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBmaXJzdCBmdWxseSB2aXNpYmxlIHJvdy4gXCJGdWxseVwiIGhlcmUgbWVhbnMgdGhhdCB0aGUgY2hhcmFjdGVycyBpbiB0aGUgcm93IGFyZSBub3QgdHJ1bmNhdGVkOyB0aGF0IHRoZSB0b3AgYW5kIHRoZSBib3R0b20gb2YgdGhlIHJvdyBhcmUgb24gdGhlIHNjcmVlbi5cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0Rmlyc3RGdWxseVZpc2libGVSb3coKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93ICsgKHRoaXMubGF5ZXJDb25maWcub2Zmc2V0ID09PSAwID8gMCA6IDEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBsYXN0IGZ1bGx5IHZpc2libGUgcm93LiBcIkZ1bGx5XCIgaGVyZSBtZWFucyB0aGF0IHRoZSBjaGFyYWN0ZXJzIGluIHRoZSByb3cgYXJlIG5vdCB0cnVuY2F0ZWQ7IHRoYXQgdGhlIHRvcCBhbmQgdGhlIGJvdHRvbSBvZiB0aGUgcm93IGFyZSBvbiB0aGUgc2NyZWVuLlxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRMYXN0RnVsbHlWaXNpYmxlUm93KCkge1xuICAgICAgICB2YXIgZmxpbnQgPSBNYXRoLmZsb29yKCh0aGlzLmxheWVyQ29uZmlnLmhlaWdodCArIHRoaXMubGF5ZXJDb25maWcub2Zmc2V0KSAvIHRoaXMubGF5ZXJDb25maWcubGluZUhlaWdodCk7XG4gICAgICAgIHJldHVybiB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93IC0gMSArIGZsaW50O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFtSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbGFzdCB2aXNpYmxlIHJvdy5dezogI1ZpcnR1YWxSZW5kZXJlci5nZXRMYXN0VmlzaWJsZVJvd31cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0TGFzdFZpc2libGVSb3coKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxheWVyQ29uZmlnLmxhc3RSb3c7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZXRzIHRoZSBwYWRkaW5nIGZvciBhbGwgdGhlIGxheWVycy5cbiAgICAqIEBwYXJhbSB7bnVtYmVyfSBwYWRkaW5nIEEgbmV3IHBhZGRpbmcgdmFsdWUgKGluIHBpeGVscylcbiAgICAqKi9cbiAgICBzZXRQYWRkaW5nKHBhZGRpbmc6IG51bWJlcikge1xuICAgICAgICB0aGlzLiRwYWRkaW5nID0gcGFkZGluZztcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJG1hcmtlckZyb250LnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJG1hcmtlckJhY2suc2V0UGFkZGluZyhwYWRkaW5nKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG4gICAgICAgIHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7XG4gICAgfVxuXG4gICAgc2V0U2Nyb2xsTWFyZ2luKHRvcCwgYm90dG9tLCBsZWZ0LCByaWdodCkge1xuICAgICAgICB2YXIgc20gPSB0aGlzLnNjcm9sbE1hcmdpbjtcbiAgICAgICAgc20udG9wID0gdG9wIHwgMDtcbiAgICAgICAgc20uYm90dG9tID0gYm90dG9tIHwgMDtcbiAgICAgICAgc20ucmlnaHQgPSByaWdodCB8IDA7XG4gICAgICAgIHNtLmxlZnQgPSBsZWZ0IHwgMDtcbiAgICAgICAgc20udiA9IHNtLnRvcCArIHNtLmJvdHRvbTtcbiAgICAgICAgc20uaCA9IHNtLmxlZnQgKyBzbS5yaWdodDtcbiAgICAgICAgaWYgKHNtLnRvcCAmJiB0aGlzLnNjcm9sbFRvcCA8PSAwICYmIHRoaXMuc2Vzc2lvbilcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AoLXNtLnRvcCk7XG4gICAgICAgIHRoaXMudXBkYXRlRnVsbCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIgaXMgc2V0IHRvIGJlIGFsd2F5cyB2aXNpYmxlLlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRIU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSgpIHtcbiAgICAgICAgLy8gRklYTUVcbiAgICAgICAgcmV0dXJuIHRoaXMuJGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IHRoZSBob3Jpem9udGFsIHNjcm9sbGJhciBvciBub3QuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbHdheXNWaXNpYmxlIFNldCB0byBgdHJ1ZWAgdG8gbWFrZSB0aGUgaG9yaXpvbnRhbCBzY3JvbGwgYmFyIHZpc2libGVcbiAgICAgKiovXG4gICAgc2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUoYWx3YXlzVmlzaWJsZSkge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImhTY3JvbGxCYXJBbHdheXNWaXNpYmxlXCIsIGFsd2F5c1Zpc2libGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciB0aGUgdmVydGljYWwgc2Nyb2xsYmFyIGlzIHNldCB0byBiZSBhbHdheXMgdmlzaWJsZS5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgZ2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiR2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyB0aGUgdmVydGljYWwgc2Nyb2xsYmFyIG9yIG5vdC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFsd2F5c1Zpc2libGUgU2V0IHRvIGB0cnVlYCB0byBtYWtlIHRoZSB2ZXJ0aWNhbCBzY3JvbGwgYmFyIHZpc2libGVcbiAgICAgKi9cbiAgICBzZXRWU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZShhbHdheXNWaXNpYmxlKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwidlNjcm9sbEJhckFsd2F5c1Zpc2libGVcIiwgYWx3YXlzVmlzaWJsZSk7XG4gICAgfVxuXG4gICAgJHVwZGF0ZVNjcm9sbEJhclYoKSB7XG4gICAgICAgIHZhciBzY3JvbGxIZWlnaHQgPSB0aGlzLmxheWVyQ29uZmlnLm1heEhlaWdodDtcbiAgICAgICAgdmFyIHNjcm9sbGVySGVpZ2h0ID0gdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodDtcbiAgICAgICAgaWYgKCF0aGlzLiRtYXhMaW5lcyAmJiB0aGlzLiRzY3JvbGxQYXN0RW5kKSB7XG4gICAgICAgICAgICBzY3JvbGxIZWlnaHQgLT0gKHNjcm9sbGVySGVpZ2h0IC0gdGhpcy5saW5lSGVpZ2h0KSAqIHRoaXMuJHNjcm9sbFBhc3RFbmQ7XG4gICAgICAgICAgICBpZiAodGhpcy5zY3JvbGxUb3AgPiBzY3JvbGxIZWlnaHQgLSBzY3JvbGxlckhlaWdodCkge1xuICAgICAgICAgICAgICAgIHNjcm9sbEhlaWdodCA9IHRoaXMuc2Nyb2xsVG9wICsgc2Nyb2xsZXJIZWlnaHQ7XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJWLnNjcm9sbFRvcCA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zY3JvbGxCYXJWLnNldFNjcm9sbEhlaWdodChzY3JvbGxIZWlnaHQgKyB0aGlzLnNjcm9sbE1hcmdpbi52KTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJWLnNldFNjcm9sbFRvcCh0aGlzLnNjcm9sbFRvcCArIHRoaXMuc2Nyb2xsTWFyZ2luLnRvcCk7XG4gICAgfVxuXG4gICAgJHVwZGF0ZVNjcm9sbEJhckgoKSB7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFySC5zZXRTY3JvbGxXaWR0aCh0aGlzLmxheWVyQ29uZmlnLndpZHRoICsgMiAqIHRoaXMuJHBhZGRpbmcgKyB0aGlzLnNjcm9sbE1hcmdpbi5oKTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJILnNldFNjcm9sbExlZnQodGhpcy5zY3JvbGxMZWZ0ICsgdGhpcy5zY3JvbGxNYXJnaW4ubGVmdCk7XG4gICAgfVxuXG4gICAgZnJlZXplKCkge1xuICAgICAgICB0aGlzLiRmcm96ZW4gPSB0cnVlO1xuICAgIH1cblxuICAgIHVuZnJlZXplKCkge1xuICAgICAgICB0aGlzLiRmcm96ZW4gPSBmYWxzZTtcbiAgICB9XG5cbiAgICAkcmVuZGVyQ2hhbmdlcyhjaGFuZ2VzLCBmb3JjZSkge1xuICAgICAgICBpZiAodGhpcy4kY2hhbmdlcykge1xuICAgICAgICAgICAgY2hhbmdlcyB8PSB0aGlzLiRjaGFuZ2VzO1xuICAgICAgICAgICAgdGhpcy4kY2hhbmdlcyA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCghdGhpcy5zZXNzaW9uIHx8ICF0aGlzLmNvbnRhaW5lci5vZmZzZXRXaWR0aCB8fCB0aGlzLiRmcm96ZW4pIHx8ICghY2hhbmdlcyAmJiAhZm9yY2UpKSB7XG4gICAgICAgICAgICB0aGlzLiRjaGFuZ2VzIHw9IGNoYW5nZXM7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuJHNpemUuJGRpcnR5KSB7XG4gICAgICAgICAgICB0aGlzLiRjaGFuZ2VzIHw9IGNoYW5nZXM7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vblJlc2l6ZSh0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXRoaXMubGluZUhlaWdodCkge1xuICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLmNoZWNrRm9yU2l6ZUNoYW5nZXMoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyB0aGlzLiRsb2dDaGFuZ2VzKGNoYW5nZXMpO1xuXG4gICAgICAgIHRoaXMuX3NpZ25hbChcImJlZm9yZVJlbmRlclwiKTtcbiAgICAgICAgdmFyIGNvbmZpZyA9IHRoaXMubGF5ZXJDb25maWc7XG4gICAgICAgIC8vIHRleHQsIHNjcm9sbGluZyBhbmQgcmVzaXplIGNoYW5nZXMgY2FuIGNhdXNlIHRoZSB2aWV3IHBvcnQgc2l6ZSB0byBjaGFuZ2VcbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfRlVMTCB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9TSVpFIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX1RFWFQgfHxcbiAgICAgICAgICAgIGNoYW5nZXMgJiBDSEFOR0VfTElORVMgfHxcbiAgICAgICAgICAgIGNoYW5nZXMgJiBDSEFOR0VfU0NST0xMIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX0hfU0NST0xMXG4gICAgICAgICkge1xuICAgICAgICAgICAgY2hhbmdlcyB8PSB0aGlzLiRjb21wdXRlTGF5ZXJDb25maWcoKTtcbiAgICAgICAgICAgIC8vIElmIGEgY2hhbmdlIGlzIG1hZGUgb2Zmc2NyZWVuIGFuZCB3cmFwTW9kZSBpcyBvbiwgdGhlbiB0aGUgb25zY3JlZW5cbiAgICAgICAgICAgIC8vIGxpbmVzIG1heSBoYXZlIGJlZW4gcHVzaGVkIGRvd24uIElmIHNvLCB0aGUgZmlyc3Qgc2NyZWVuIHJvdyB3aWxsIG5vdFxuICAgICAgICAgICAgLy8gaGF2ZSBjaGFuZ2VkLCBidXQgdGhlIGZpcnN0IGFjdHVhbCByb3cgd2lsbC4gSW4gdGhhdCBjYXNlLCBhZGp1c3QgXG4gICAgICAgICAgICAvLyBzY3JvbGxUb3Agc28gdGhhdCB0aGUgY3Vyc29yIGFuZCBvbnNjcmVlbiBjb250ZW50IHN0YXlzIGluIHRoZSBzYW1lIHBsYWNlLlxuICAgICAgICAgICAgaWYgKGNvbmZpZy5maXJzdFJvdyAhPSB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93ICYmIGNvbmZpZy5maXJzdFJvd1NjcmVlbiA9PSB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93U2NyZWVuKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxUb3AgPSB0aGlzLnNjcm9sbFRvcCArIChjb25maWcuZmlyc3RSb3cgLSB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93KSAqIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgICAgICAgICBjaGFuZ2VzID0gY2hhbmdlcyB8IENIQU5HRV9TQ1JPTEw7XG4gICAgICAgICAgICAgICAgY2hhbmdlcyB8PSB0aGlzLiRjb21wdXRlTGF5ZXJDb25maWcoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbmZpZyA9IHRoaXMubGF5ZXJDb25maWc7XG4gICAgICAgICAgICAvLyB1cGRhdGUgc2Nyb2xsYmFyIGZpcnN0IHRvIG5vdCBsb3NlIHNjcm9sbCBwb3NpdGlvbiB3aGVuIGd1dHRlciBjYWxscyByZXNpemVcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVNjcm9sbEJhclYoKTtcbiAgICAgICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0hfU0NST0xMKVxuICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVNjcm9sbEJhckgoKTtcbiAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLmVsZW1lbnQuc3R5bGUubWFyZ2luVG9wID0gKC1jb25maWcub2Zmc2V0KSArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5tYXJnaW5Ub3AgPSAoLWNvbmZpZy5vZmZzZXQpICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLndpZHRoID0gY29uZmlnLndpZHRoICsgMiAqIHRoaXMuJHBhZGRpbmcgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUuaGVpZ2h0ID0gY29uZmlnLm1pbkhlaWdodCArIFwicHhcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGhvcml6b250YWwgc2Nyb2xsaW5nXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0hfU0NST0xMKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUubWFyZ2luTGVmdCA9IC10aGlzLnNjcm9sbExlZnQgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbGVyLmNsYXNzTmFtZSA9IHRoaXMuc2Nyb2xsTGVmdCA8PSAwID8gXCJhY2Vfc2Nyb2xsZXJcIiA6IFwiYWNlX3Njcm9sbGVyIGFjZV9zY3JvbGwtbGVmdFwiO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZnVsbFxuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9GVUxMKSB7XG4gICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2hvd0d1dHRlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckJhY2sudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICAgICAgICAgIHRoaXMuJGhpZ2hsaWdodEd1dHRlckxpbmUgJiYgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiYWZ0ZXJSZW5kZXJcIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBzY3JvbGxpbmdcbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfU0NST0xMKSB7XG4gICAgICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9URVhUIHx8IGNoYW5nZXMgJiBDSEFOR0VfTElORVMpXG4gICAgICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci5zY3JvbGxMaW5lcyhjb25maWcpO1xuXG4gICAgICAgICAgICBpZiAodGhpcy4kc2hvd0d1dHRlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckJhY2sudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kaGlnaGxpZ2h0R3V0dGVyTGluZSAmJiB0aGlzLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0KCk7XG4gICAgICAgICAgICB0aGlzLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiYWZ0ZXJSZW5kZXJcIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9URVhUKSB7XG4gICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2hvd0d1dHRlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0xJTkVTKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdXBkYXRlTGluZXMoKSB8fCAoY2hhbmdlcyAmIENIQU5HRV9HVVRURVIpICYmIHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2hhbmdlcyAmIENIQU5HRV9URVhUIHx8IGNoYW5nZXMgJiBDSEFOR0VfR1VUVEVSKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2hvd0d1dHRlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0NVUlNPUikge1xuICAgICAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgICAgICAgICAgdGhpcy4kaGlnaGxpZ2h0R3V0dGVyTGluZSAmJiB0aGlzLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0KCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2hhbmdlcyAmIChDSEFOR0VfTUFSS0VSIHwgQ0hBTkdFX01BUktFUl9GUk9OVCkpIHtcbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckZyb250LnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoYW5nZXMgJiAoQ0hBTkdFX01BUktFUiB8IENIQU5HRV9NQVJLRVJfQkFDSykpIHtcbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckJhY2sudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9zaWduYWwoXCJhZnRlclJlbmRlclwiKTtcbiAgICB9XG5cbiAgICAkYXV0b3NpemUoKSB7XG4gICAgICAgIHZhciBoZWlnaHQgPSB0aGlzLnNlc3Npb24uZ2V0U2NyZWVuTGVuZ3RoKCkgKiB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBtYXhIZWlnaHQgPSB0aGlzLiRtYXhMaW5lcyAqIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgdmFyIGRlc2lyZWRIZWlnaHQgPSBNYXRoLm1heChcbiAgICAgICAgICAgICh0aGlzLiRtaW5MaW5lcyB8fCAxKSAqIHRoaXMubGluZUhlaWdodCxcbiAgICAgICAgICAgIE1hdGgubWluKG1heEhlaWdodCwgaGVpZ2h0KVxuICAgICAgICApICsgdGhpcy5zY3JvbGxNYXJnaW4udiArICh0aGlzLiRleHRyYUhlaWdodCB8fCAwKTtcbiAgICAgICAgdmFyIHZTY3JvbGwgPSBoZWlnaHQgPiBtYXhIZWlnaHQ7XG5cbiAgICAgICAgaWYgKGRlc2lyZWRIZWlnaHQgIT0gdGhpcy5kZXNpcmVkSGVpZ2h0IHx8XG4gICAgICAgICAgICB0aGlzLiRzaXplLmhlaWdodCAhPSB0aGlzLmRlc2lyZWRIZWlnaHQgfHwgdlNjcm9sbCAhPSB0aGlzLiR2U2Nyb2xsKSB7XG4gICAgICAgICAgICBpZiAodlNjcm9sbCAhPSB0aGlzLiR2U2Nyb2xsKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kdlNjcm9sbCA9IHZTY3JvbGw7XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJWLnNldFZpc2libGUodlNjcm9sbCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB3ID0gdGhpcy5jb250YWluZXIuY2xpZW50V2lkdGg7XG4gICAgICAgICAgICB0aGlzLmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBkZXNpcmVkSGVpZ2h0ICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy4kdXBkYXRlQ2FjaGVkU2l6ZSh0cnVlLCB0aGlzLiRndXR0ZXJXaWR0aCwgdywgZGVzaXJlZEhlaWdodCk7XG4gICAgICAgICAgICAvLyB0aGlzLiRsb29wLmNoYW5nZXMgPSAwO1xuICAgICAgICAgICAgdGhpcy5kZXNpcmVkSGVpZ2h0ID0gZGVzaXJlZEhlaWdodDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgICRjb21wdXRlTGF5ZXJDb25maWcoKSB7XG5cbiAgICAgICAgaWYgKHRoaXMuJG1heExpbmVzICYmIHRoaXMubGluZUhlaWdodCA+IDEpIHtcbiAgICAgICAgICAgIHRoaXMuJGF1dG9zaXplKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgdmFyIHNpemUgPSB0aGlzLiRzaXplO1xuXG4gICAgICAgIHZhciBoaWRlU2Nyb2xsYmFycyA9IHNpemUuaGVpZ2h0IDw9IDIgKiB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBzY3JlZW5MaW5lcyA9IHRoaXMuc2Vzc2lvbi5nZXRTY3JlZW5MZW5ndGgoKTtcbiAgICAgICAgdmFyIG1heEhlaWdodCA9IHNjcmVlbkxpbmVzICogdGhpcy5saW5lSGVpZ2h0O1xuXG4gICAgICAgIHZhciBvZmZzZXQgPSB0aGlzLnNjcm9sbFRvcCAlIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgdmFyIG1pbkhlaWdodCA9IHNpemUuc2Nyb2xsZXJIZWlnaHQgKyB0aGlzLmxpbmVIZWlnaHQ7XG5cbiAgICAgICAgdmFyIGxvbmdlc3RMaW5lID0gdGhpcy4kZ2V0TG9uZ2VzdExpbmUoKTtcblxuICAgICAgICB2YXIgaG9yaXpTY3JvbGwgPSAhaGlkZVNjcm9sbGJhcnMgJiYgKHRoaXMuJGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIHx8XG4gICAgICAgICAgICBzaXplLnNjcm9sbGVyV2lkdGggLSBsb25nZXN0TGluZSAtIDIgKiB0aGlzLiRwYWRkaW5nIDwgMCk7XG5cbiAgICAgICAgdmFyIGhTY3JvbGxDaGFuZ2VkID0gdGhpcy4kaG9yaXpTY3JvbGwgIT09IGhvcml6U2Nyb2xsO1xuICAgICAgICBpZiAoaFNjcm9sbENoYW5nZWQpIHtcbiAgICAgICAgICAgIHRoaXMuJGhvcml6U2Nyb2xsID0gaG9yaXpTY3JvbGw7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhckguc2V0VmlzaWJsZShob3JpelNjcm9sbCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuJG1heExpbmVzICYmIHRoaXMuJHNjcm9sbFBhc3RFbmQpIHtcbiAgICAgICAgICAgIG1heEhlaWdodCArPSAoc2l6ZS5zY3JvbGxlckhlaWdodCAtIHRoaXMubGluZUhlaWdodCkgKiB0aGlzLiRzY3JvbGxQYXN0RW5kO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHZTY3JvbGwgPSAhaGlkZVNjcm9sbGJhcnMgJiYgKHRoaXMuJHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIHx8XG4gICAgICAgICAgICBzaXplLnNjcm9sbGVySGVpZ2h0IC0gbWF4SGVpZ2h0IDwgMCk7XG4gICAgICAgIHZhciB2U2Nyb2xsQ2hhbmdlZCA9IHRoaXMuJHZTY3JvbGwgIT09IHZTY3JvbGw7XG4gICAgICAgIGlmICh2U2Nyb2xsQ2hhbmdlZCkge1xuICAgICAgICAgICAgdGhpcy4kdlNjcm9sbCA9IHZTY3JvbGw7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2V0VmlzaWJsZSh2U2Nyb2xsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AoTWF0aC5tYXgoLXRoaXMuc2Nyb2xsTWFyZ2luLnRvcCxcbiAgICAgICAgICAgIE1hdGgubWluKHRoaXMuc2Nyb2xsVG9wLCBtYXhIZWlnaHQgLSBzaXplLnNjcm9sbGVySGVpZ2h0ICsgdGhpcy5zY3JvbGxNYXJnaW4uYm90dG9tKSkpO1xuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KE1hdGgubWF4KC10aGlzLnNjcm9sbE1hcmdpbi5sZWZ0LCBNYXRoLm1pbih0aGlzLnNjcm9sbExlZnQsXG4gICAgICAgICAgICBsb25nZXN0TGluZSArIDIgKiB0aGlzLiRwYWRkaW5nIC0gc2l6ZS5zY3JvbGxlcldpZHRoICsgdGhpcy5zY3JvbGxNYXJnaW4ucmlnaHQpKSk7XG5cbiAgICAgICAgdmFyIGxpbmVDb3VudCA9IE1hdGguY2VpbChtaW5IZWlnaHQgLyB0aGlzLmxpbmVIZWlnaHQpIC0gMTtcbiAgICAgICAgdmFyIGZpcnN0Um93ID0gTWF0aC5tYXgoMCwgTWF0aC5yb3VuZCgodGhpcy5zY3JvbGxUb3AgLSBvZmZzZXQpIC8gdGhpcy5saW5lSGVpZ2h0KSk7XG4gICAgICAgIHZhciBsYXN0Um93ID0gZmlyc3RSb3cgKyBsaW5lQ291bnQ7XG5cbiAgICAgICAgLy8gTWFwIGxpbmVzIG9uIHRoZSBzY3JlZW4gdG8gbGluZXMgaW4gdGhlIGRvY3VtZW50LlxuICAgICAgICB2YXIgZmlyc3RSb3dTY3JlZW4sIGZpcnN0Um93SGVpZ2h0O1xuICAgICAgICB2YXIgbGluZUhlaWdodCA9IHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgZmlyc3RSb3cgPSBzZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRSb3coZmlyc3RSb3csIDApO1xuXG4gICAgICAgIC8vIENoZWNrIGlmIGZpcnN0Um93IGlzIGluc2lkZSBvZiBhIGZvbGRMaW5lLiBJZiB0cnVlLCB0aGVuIHVzZSB0aGUgZmlyc3RcbiAgICAgICAgLy8gcm93IG9mIHRoZSBmb2xkTGluZS5cbiAgICAgICAgdmFyIGZvbGRMaW5lID0gc2Vzc2lvbi5nZXRGb2xkTGluZShmaXJzdFJvdyk7XG4gICAgICAgIGlmIChmb2xkTGluZSkge1xuICAgICAgICAgICAgZmlyc3RSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgIH1cblxuICAgICAgICBmaXJzdFJvd1NjcmVlbiA9IHNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblJvdyhmaXJzdFJvdywgMCk7XG4gICAgICAgIGZpcnN0Um93SGVpZ2h0ID0gc2Vzc2lvbi5nZXRSb3dMZW5ndGgoZmlyc3RSb3cpICogbGluZUhlaWdodDtcblxuICAgICAgICBsYXN0Um93ID0gTWF0aC5taW4oc2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50Um93KGxhc3RSb3csIDApLCBzZXNzaW9uLmdldExlbmd0aCgpIC0gMSk7XG4gICAgICAgIG1pbkhlaWdodCA9IHNpemUuc2Nyb2xsZXJIZWlnaHQgKyBzZXNzaW9uLmdldFJvd0xlbmd0aChsYXN0Um93KSAqIGxpbmVIZWlnaHQgK1xuICAgICAgICAgICAgZmlyc3RSb3dIZWlnaHQ7XG5cbiAgICAgICAgb2Zmc2V0ID0gdGhpcy5zY3JvbGxUb3AgLSBmaXJzdFJvd1NjcmVlbiAqIGxpbmVIZWlnaHQ7XG5cbiAgICAgICAgdmFyIGNoYW5nZXMgPSAwO1xuICAgICAgICBpZiAodGhpcy5sYXllckNvbmZpZy53aWR0aCAhPSBsb25nZXN0TGluZSlcbiAgICAgICAgICAgIGNoYW5nZXMgPSBDSEFOR0VfSF9TQ1JPTEw7XG4gICAgICAgIC8vIEhvcml6b250YWwgc2Nyb2xsYmFyIHZpc2liaWxpdHkgbWF5IGhhdmUgY2hhbmdlZCwgd2hpY2ggY2hhbmdlc1xuICAgICAgICAvLyB0aGUgY2xpZW50IGhlaWdodCBvZiB0aGUgc2Nyb2xsZXJcbiAgICAgICAgaWYgKGhTY3JvbGxDaGFuZ2VkIHx8IHZTY3JvbGxDaGFuZ2VkKSB7XG4gICAgICAgICAgICBjaGFuZ2VzID0gdGhpcy4kdXBkYXRlQ2FjaGVkU2l6ZSh0cnVlLCB0aGlzLmd1dHRlcldpZHRoLCBzaXplLndpZHRoLCBzaXplLmhlaWdodCk7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJzY3JvbGxiYXJWaXNpYmlsaXR5Q2hhbmdlZFwiKTtcbiAgICAgICAgICAgIGlmICh2U2Nyb2xsQ2hhbmdlZClcbiAgICAgICAgICAgICAgICBsb25nZXN0TGluZSA9IHRoaXMuJGdldExvbmdlc3RMaW5lKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmxheWVyQ29uZmlnID0ge1xuICAgICAgICAgICAgd2lkdGg6IGxvbmdlc3RMaW5lLFxuICAgICAgICAgICAgcGFkZGluZzogdGhpcy4kcGFkZGluZyxcbiAgICAgICAgICAgIGZpcnN0Um93OiBmaXJzdFJvdyxcbiAgICAgICAgICAgIGZpcnN0Um93U2NyZWVuOiBmaXJzdFJvd1NjcmVlbixcbiAgICAgICAgICAgIGxhc3RSb3c6IGxhc3RSb3csXG4gICAgICAgICAgICBsaW5lSGVpZ2h0OiBsaW5lSGVpZ2h0LFxuICAgICAgICAgICAgY2hhcmFjdGVyV2lkdGg6IHRoaXMuY2hhcmFjdGVyV2lkdGgsXG4gICAgICAgICAgICBtaW5IZWlnaHQ6IG1pbkhlaWdodCxcbiAgICAgICAgICAgIG1heEhlaWdodDogbWF4SGVpZ2h0LFxuICAgICAgICAgICAgb2Zmc2V0OiBvZmZzZXQsXG4gICAgICAgICAgICBndXR0ZXJPZmZzZXQ6IE1hdGgubWF4KDAsIE1hdGguY2VpbCgob2Zmc2V0ICsgc2l6ZS5oZWlnaHQgLSBzaXplLnNjcm9sbGVySGVpZ2h0KSAvIGxpbmVIZWlnaHQpKSxcbiAgICAgICAgICAgIGhlaWdodDogdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodFxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBjaGFuZ2VzO1xuICAgIH1cblxuICAgICR1cGRhdGVMaW5lcygpIHtcbiAgICAgICAgdmFyIGZpcnN0Um93ID0gdGhpcy4kY2hhbmdlZExpbmVzLmZpcnN0Um93O1xuICAgICAgICB2YXIgbGFzdFJvdyA9IHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93O1xuICAgICAgICB0aGlzLiRjaGFuZ2VkTGluZXMgPSBudWxsO1xuXG4gICAgICAgIHZhciBsYXllckNvbmZpZyA9IHRoaXMubGF5ZXJDb25maWc7XG5cbiAgICAgICAgaWYgKGZpcnN0Um93ID4gbGF5ZXJDb25maWcubGFzdFJvdyArIDEpIHsgcmV0dXJuOyB9XG4gICAgICAgIGlmIChsYXN0Um93IDwgbGF5ZXJDb25maWcuZmlyc3RSb3cpIHsgcmV0dXJuOyB9XG5cbiAgICAgICAgLy8gaWYgdGhlIGxhc3Qgcm93IGlzIHVua25vd24gLT4gcmVkcmF3IGV2ZXJ5dGhpbmdcbiAgICAgICAgaWYgKGxhc3RSb3cgPT09IEluZmluaXR5KSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2hvd0d1dHRlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUobGF5ZXJDb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZShsYXllckNvbmZpZyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBlbHNlIHVwZGF0ZSBvbmx5IHRoZSBjaGFuZ2VkIHJvd3NcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZUxpbmVzKGxheWVyQ29uZmlnLCBmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgICRnZXRMb25nZXN0TGluZSgpOiBudW1iZXIge1xuICAgICAgICB2YXIgY2hhckNvdW50ID0gdGhpcy5zZXNzaW9uLmdldFNjcmVlbldpZHRoKCk7XG4gICAgICAgIGlmICh0aGlzLnNob3dJbnZpc2libGVzICYmICF0aGlzLnNlc3Npb24uJHVzZVdyYXBNb2RlKVxuICAgICAgICAgICAgY2hhckNvdW50ICs9IDE7XG5cbiAgICAgICAgcmV0dXJuIE1hdGgubWF4KHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCAtIDIgKiB0aGlzLiRwYWRkaW5nLCBNYXRoLnJvdW5kKGNoYXJDb3VudCAqIHRoaXMuY2hhcmFjdGVyV2lkdGgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBTY2hlZHVsZXMgYW4gdXBkYXRlIHRvIGFsbCB0aGUgZnJvbnQgbWFya2VycyBpbiB0aGUgZG9jdW1lbnQuXG4gICAgKiovXG4gICAgdXBkYXRlRnJvbnRNYXJrZXJzKCkge1xuICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC5zZXRNYXJrZXJzKHRoaXMuc2Vzc2lvbi5nZXRNYXJrZXJzKHRydWUpKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfTUFSS0VSX0ZST05UKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBTY2hlZHVsZXMgYW4gdXBkYXRlIHRvIGFsbCB0aGUgYmFjayBtYXJrZXJzIGluIHRoZSBkb2N1bWVudC5cbiAgICAqKi9cbiAgICB1cGRhdGVCYWNrTWFya2VycygpIHtcbiAgICAgICAgdGhpcy4kbWFya2VyQmFjay5zZXRNYXJrZXJzKHRoaXMuc2Vzc2lvbi5nZXRNYXJrZXJzKGZhbHNlKSk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX01BUktFUl9CQUNLKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBEZXByZWNhdGVkOyAobW92ZWQgdG8gW1tFZGl0U2Vzc2lvbl1dKVxuICAgICogQGRlcHJlY2F0ZWRcbiAgICAqKi9cbiAgICBwcml2YXRlIGFkZEd1dHRlckRlY29yYXRpb24ocm93LCBjbGFzc05hbWUpIHtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuYWRkR3V0dGVyRGVjb3JhdGlvbihyb3csIGNsYXNzTmFtZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBEZXByZWNhdGVkOyAobW92ZWQgdG8gW1tFZGl0U2Vzc2lvbl1dKVxuICAgICogQGRlcHJlY2F0ZWRcbiAgICAqKi9cbiAgICBwcml2YXRlIHJlbW92ZUd1dHRlckRlY29yYXRpb24ocm93LCBjbGFzc05hbWUpIHtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIucmVtb3ZlR3V0dGVyRGVjb3JhdGlvbihyb3csIGNsYXNzTmFtZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmVkcmF3IGJyZWFrcG9pbnRzLlxuICAgICoqL1xuICAgIHVwZGF0ZUJyZWFrcG9pbnRzKCkge1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9HVVRURVIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFNldHMgYW5ub3RhdGlvbnMgZm9yIHRoZSBndXR0ZXIuXG4gICAgKiBAcGFyYW0ge0FycmF5fSBhbm5vdGF0aW9ucyBBbiBhcnJheSBjb250YWluaW5nIGFubm90YXRpb25zXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBzZXRBbm5vdGF0aW9ucyhhbm5vdGF0aW9ucykge1xuICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5zZXRBbm5vdGF0aW9ucyhhbm5vdGF0aW9ucyk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0dVVFRFUik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogVXBkYXRlcyB0aGUgY3Vyc29yIGljb24uXG4gICAgKiovXG4gICAgdXBkYXRlQ3Vyc29yKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9DVVJTT1IpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIEhpZGVzIHRoZSBjdXJzb3IgaWNvbi5cbiAgICAqKi9cbiAgICBoaWRlQ3Vyc29yKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5oaWRlQ3Vyc29yKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogU2hvd3MgdGhlIGN1cnNvciBpY29uLlxuICAgICoqL1xuICAgIHNob3dDdXJzb3IoKSB7XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnNob3dDdXJzb3IoKTtcbiAgICB9XG5cbiAgICBzY3JvbGxTZWxlY3Rpb25JbnRvVmlldyhhbmNob3IsIGxlYWQsIG9mZnNldD8pIHtcbiAgICAgICAgLy8gZmlyc3Qgc2Nyb2xsIGFuY2hvciBpbnRvIHZpZXcgdGhlbiBzY3JvbGwgbGVhZCBpbnRvIHZpZXdcbiAgICAgICAgdGhpcy5zY3JvbGxDdXJzb3JJbnRvVmlldyhhbmNob3IsIG9mZnNldCk7XG4gICAgICAgIHRoaXMuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcobGVhZCwgb2Zmc2V0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBTY3JvbGxzIHRoZSBjdXJzb3IgaW50byB0aGUgZmlyc3QgdmlzaWJpbGUgYXJlYSBvZiB0aGUgZWRpdG9yXG4gICAgKiovXG4gICAgc2Nyb2xsQ3Vyc29ySW50b1ZpZXcoY3Vyc29yPywgb2Zmc2V0PywgJHZpZXdNYXJnaW4/KSB7XG4gICAgICAgIC8vIHRoZSBlZGl0b3IgaXMgbm90IHZpc2libGVcbiAgICAgICAgaWYgKHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgPT09IDApXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuJGN1cnNvckxheWVyLmdldFBpeGVsUG9zaXRpb24oY3Vyc29yKTtcblxuICAgICAgICB2YXIgbGVmdCA9IHBvcy5sZWZ0O1xuICAgICAgICB2YXIgdG9wID0gcG9zLnRvcDtcblxuICAgICAgICB2YXIgdG9wTWFyZ2luID0gJHZpZXdNYXJnaW4gJiYgJHZpZXdNYXJnaW4udG9wIHx8IDA7XG4gICAgICAgIHZhciBib3R0b21NYXJnaW4gPSAkdmlld01hcmdpbiAmJiAkdmlld01hcmdpbi5ib3R0b20gfHwgMDtcblxuICAgICAgICB2YXIgc2Nyb2xsVG9wID0gdGhpcy4kc2Nyb2xsQW5pbWF0aW9uID8gdGhpcy5zZXNzaW9uLmdldFNjcm9sbFRvcCgpIDogdGhpcy5zY3JvbGxUb3A7XG5cbiAgICAgICAgaWYgKHNjcm9sbFRvcCArIHRvcE1hcmdpbiA+IHRvcCkge1xuICAgICAgICAgICAgaWYgKG9mZnNldClcbiAgICAgICAgICAgICAgICB0b3AgLT0gb2Zmc2V0ICogdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodDtcbiAgICAgICAgICAgIGlmICh0b3AgPT09IDApXG4gICAgICAgICAgICAgICAgdG9wID0gLXRoaXMuc2Nyb2xsTWFyZ2luLnRvcDtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AodG9wKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzY3JvbGxUb3AgKyB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0IC0gYm90dG9tTWFyZ2luIDwgdG9wICsgdGhpcy5saW5lSGVpZ2h0KSB7XG4gICAgICAgICAgICBpZiAob2Zmc2V0KVxuICAgICAgICAgICAgICAgIHRvcCArPSBvZmZzZXQgKiB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0O1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcCh0b3AgKyB0aGlzLmxpbmVIZWlnaHQgLSB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzY3JvbGxMZWZ0ID0gdGhpcy5zY3JvbGxMZWZ0O1xuXG4gICAgICAgIGlmIChzY3JvbGxMZWZ0ID4gbGVmdCkge1xuICAgICAgICAgICAgaWYgKGxlZnQgPCB0aGlzLiRwYWRkaW5nICsgMiAqIHRoaXMubGF5ZXJDb25maWcuY2hhcmFjdGVyV2lkdGgpXG4gICAgICAgICAgICAgICAgbGVmdCA9IC10aGlzLnNjcm9sbE1hcmdpbi5sZWZ0O1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQobGVmdCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoc2Nyb2xsTGVmdCArIHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCA8IGxlZnQgKyB0aGlzLmNoYXJhY3RlcldpZHRoKSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdChNYXRoLnJvdW5kKGxlZnQgKyB0aGlzLmNoYXJhY3RlcldpZHRoIC0gdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoKSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoc2Nyb2xsTGVmdCA8PSB0aGlzLiRwYWRkaW5nICYmIGxlZnQgLSBzY3JvbGxMZWZ0IDwgdGhpcy5jaGFyYWN0ZXJXaWR0aCkge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQoMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIHs6RWRpdFNlc3Npb24uZ2V0U2Nyb2xsVG9wfVxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZ2V0U2Nyb2xsVG9wXG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldFNjcm9sbFRvcCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFNjcm9sbFRvcCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogezpFZGl0U2Vzc2lvbi5nZXRTY3JvbGxMZWZ0fVxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZ2V0U2Nyb2xsTGVmdFxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxMZWZ0KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGZpcnN0IHZpc2libGUgcm93LCByZWdhcmRsZXNzIG9mIHdoZXRoZXIgaXQncyBmdWxseSB2aXNpYmxlIG9yIG5vdC5cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0U2Nyb2xsVG9wUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcm9sbFRvcCAvIHRoaXMubGluZUhlaWdodDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBsYXN0IHZpc2libGUgcm93LCByZWdhcmRsZXNzIG9mIHdoZXRoZXIgaXQncyBmdWxseSB2aXNpYmxlIG9yIG5vdC5cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0U2Nyb2xsQm90dG9tUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiBNYXRoLm1heCgwLCBNYXRoLmZsb29yKCh0aGlzLnNjcm9sbFRvcCArIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQpIC8gdGhpcy5saW5lSGVpZ2h0KSAtIDEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogR3JhY2VmdWxseSBzY3JvbGxzIGZyb20gdGhlIHRvcCBvZiB0aGUgZWRpdG9yIHRvIHRoZSByb3cgaW5kaWNhdGVkLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBBIHJvdyBpZFxuICAgICpcbiAgICAqXG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5zZXRTY3JvbGxUb3BcbiAgICAqKi9cbiAgICBzY3JvbGxUb1Jvdyhyb3c6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHJvdyAqIHRoaXMubGluZUhlaWdodCk7XG4gICAgfVxuXG4gICAgYWxpZ25DdXJzb3IoY3Vyc29yLCBhbGlnbm1lbnQpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBjdXJzb3IgPT0gXCJudW1iZXJcIilcbiAgICAgICAgICAgIGN1cnNvciA9IHsgcm93OiBjdXJzb3IsIGNvbHVtbjogMCB9O1xuXG4gICAgICAgIHZhciBwb3MgPSB0aGlzLiRjdXJzb3JMYXllci5nZXRQaXhlbFBvc2l0aW9uKGN1cnNvcik7XG4gICAgICAgIHZhciBoID0gdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCAtIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgdmFyIG9mZnNldCA9IHBvcy50b3AgLSBoICogKGFsaWdubWVudCB8fCAwKTtcblxuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKG9mZnNldCk7XG4gICAgICAgIHJldHVybiBvZmZzZXQ7XG4gICAgfVxuXG4gICAgJGNhbGNTdGVwcyhmcm9tVmFsdWU6IG51bWJlciwgdG9WYWx1ZTogbnVtYmVyKTogbnVtYmVyW10ge1xuICAgICAgICB2YXIgaTogbnVtYmVyID0gMDtcbiAgICAgICAgdmFyIGw6IG51bWJlciA9IHRoaXMuU1RFUFM7XG4gICAgICAgIHZhciBzdGVwczogbnVtYmVyW10gPSBbXTtcblxuICAgICAgICB2YXIgZnVuYyA9IGZ1bmN0aW9uKHQ6IG51bWJlciwgeF9taW46IG51bWJlciwgZHg6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgICAgICByZXR1cm4gZHggKiAoTWF0aC5wb3codCAtIDEsIDMpICsgMSkgKyB4X21pbjtcbiAgICAgICAgfTtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbDsgKytpKSB7XG4gICAgICAgICAgICBzdGVwcy5wdXNoKGZ1bmMoaSAvIHRoaXMuU1RFUFMsIGZyb21WYWx1ZSwgdG9WYWx1ZSAtIGZyb21WYWx1ZSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHN0ZXBzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdyYWNlZnVsbHkgc2Nyb2xscyB0aGUgZWRpdG9yIHRvIHRoZSByb3cgaW5kaWNhdGVkLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsaW5lIEEgbGluZSBudW1iZXJcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGNlbnRlciBJZiBgdHJ1ZWAsIGNlbnRlcnMgdGhlIGVkaXRvciB0aGUgdG8gaW5kaWNhdGVkIGxpbmVcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFuaW1hdGUgSWYgYHRydWVgIGFuaW1hdGVzIHNjcm9sbGluZ1xuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBhZnRlciB0aGUgYW5pbWF0aW9uIGhhcyBmaW5pc2hlZFxuICAgICAqL1xuICAgIHNjcm9sbFRvTGluZShsaW5lOiBudW1iZXIsIGNlbnRlcjogYm9vbGVhbiwgYW5pbWF0ZTogYm9vbGVhbiwgY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuJGN1cnNvckxheWVyLmdldFBpeGVsUG9zaXRpb24oeyByb3c6IGxpbmUsIGNvbHVtbjogMCB9KTtcbiAgICAgICAgdmFyIG9mZnNldCA9IHBvcy50b3A7XG4gICAgICAgIGlmIChjZW50ZXIpIHtcbiAgICAgICAgICAgIG9mZnNldCAtPSB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0IC8gMjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpbml0aWFsU2Nyb2xsID0gdGhpcy5zY3JvbGxUb3A7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3Aob2Zmc2V0KTtcbiAgICAgICAgaWYgKGFuaW1hdGUgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLmFuaW1hdGVTY3JvbGxpbmcoaW5pdGlhbFNjcm9sbCwgY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYW5pbWF0ZVNjcm9sbGluZyhmcm9tVmFsdWU6IG51bWJlciwgY2FsbGJhY2s/KSB7XG4gICAgICAgIHZhciB0b1ZhbHVlID0gdGhpcy5zY3JvbGxUb3A7XG4gICAgICAgIGlmICghdGhpcy4kYW5pbWF0ZWRTY3JvbGwpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuXG4gICAgICAgIGlmIChmcm9tVmFsdWUgPT0gdG9WYWx1ZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBpZiAodGhpcy4kc2Nyb2xsQW5pbWF0aW9uKSB7XG4gICAgICAgICAgICB2YXIgb2xkU3RlcHMgPSB0aGlzLiRzY3JvbGxBbmltYXRpb24uc3RlcHM7XG4gICAgICAgICAgICBpZiAob2xkU3RlcHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgZnJvbVZhbHVlID0gb2xkU3RlcHNbMF07XG4gICAgICAgICAgICAgICAgaWYgKGZyb21WYWx1ZSA9PSB0b1ZhbHVlKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc3RlcHMgPSBfc2VsZi4kY2FsY1N0ZXBzKGZyb21WYWx1ZSwgdG9WYWx1ZSk7XG4gICAgICAgIHRoaXMuJHNjcm9sbEFuaW1hdGlvbiA9IHsgZnJvbTogZnJvbVZhbHVlLCB0bzogdG9WYWx1ZSwgc3RlcHM6IHN0ZXBzIH07XG5cbiAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLiR0aW1lcik7XG5cbiAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxUb3Aoc3RlcHMuc2hpZnQoKSk7XG4gICAgICAgIC8vIHRyaWNrIHNlc3Npb24gdG8gdGhpbmsgaXQncyBhbHJlYWR5IHNjcm9sbGVkIHRvIG5vdCBsb29zZSB0b1ZhbHVlXG4gICAgICAgIF9zZWxmLnNlc3Npb24uJHNjcm9sbFRvcCA9IHRvVmFsdWU7XG4gICAgICAgIHRoaXMuJHRpbWVyID0gc2V0SW50ZXJ2YWwoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoc3RlcHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxUb3Aoc3RlcHMuc2hpZnQoKSk7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi4kc2Nyb2xsVG9wID0gdG9WYWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodG9WYWx1ZSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi4kc2Nyb2xsVG9wID0gLTE7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxUb3AodG9WYWx1ZSk7XG4gICAgICAgICAgICAgICAgdG9WYWx1ZSA9IG51bGw7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGRvIHRoaXMgb24gc2VwYXJhdGUgc3RlcCB0byBub3QgZ2V0IHNwdXJpb3VzIHNjcm9sbCBldmVudCBmcm9tIHNjcm9sbGJhclxuICAgICAgICAgICAgICAgIF9zZWxmLiR0aW1lciA9IGNsZWFySW50ZXJ2YWwoX3NlbGYuJHRpbWVyKTtcbiAgICAgICAgICAgICAgICBfc2VsZi4kc2Nyb2xsQW5pbWF0aW9uID0gbnVsbDtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayAmJiBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCAxMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xscyB0aGUgZWRpdG9yIHRvIHRoZSB5IHBpeGVsIGluZGljYXRlZC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc2Nyb2xsVG9wIFRoZSBwb3NpdGlvbiB0byBzY3JvbGwgdG9cbiAgICAgKi9cbiAgICBzY3JvbGxUb1koc2Nyb2xsVG9wOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgLy8gYWZ0ZXIgY2FsbGluZyBzY3JvbGxCYXIuc2V0U2Nyb2xsVG9wXG4gICAgICAgIC8vIHNjcm9sbGJhciBzZW5kcyB1cyBldmVudCB3aXRoIHNhbWUgc2Nyb2xsVG9wLiBpZ25vcmUgaXRcbiAgICAgICAgaWYgKHRoaXMuc2Nyb2xsVG9wICE9PSBzY3JvbGxUb3ApIHtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsVG9wID0gc2Nyb2xsVG9wO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdGhlIGVkaXRvciBhY3Jvc3MgdGhlIHgtYXhpcyB0byB0aGUgcGl4ZWwgaW5kaWNhdGVkLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JvbGxMZWZ0IFRoZSBwb3NpdGlvbiB0byBzY3JvbGwgdG9cbiAgICAgKiovXG4gICAgc2Nyb2xsVG9YKHNjcm9sbExlZnQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5zY3JvbGxMZWZ0ICE9PSBzY3JvbGxMZWZ0KSB7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbExlZnQgPSBzY3JvbGxMZWZ0O1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfSF9TQ1JPTEwpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTY3JvbGxzIHRoZSBlZGl0b3IgYWNyb3NzIGJvdGggeC0gYW5kIHktYXhlcy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSB4IFRoZSB4IHZhbHVlIHRvIHNjcm9sbCB0b1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IHkgVGhlIHkgdmFsdWUgdG8gc2Nyb2xsIHRvXG4gICAgKiovXG4gICAgc2Nyb2xsVG8oeDogbnVtYmVyLCB5OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcCh5KTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQoeSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTY3JvbGxzIHRoZSBlZGl0b3IgYWNyb3NzIGJvdGggeC0gYW5kIHktYXhlcy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkZWx0YVggVGhlIHggdmFsdWUgdG8gc2Nyb2xsIGJ5XG4gICAgKiBAcGFyYW0ge051bWJlcn0gZGVsdGFZIFRoZSB5IHZhbHVlIHRvIHNjcm9sbCBieVxuICAgICoqL1xuICAgIHNjcm9sbEJ5KGRlbHRhWDogbnVtYmVyLCBkZWx0YVk6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBkZWx0YVkgJiYgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcCh0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgKyBkZWx0YVkpO1xuICAgICAgICBkZWx0YVggJiYgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQodGhpcy5zZXNzaW9uLmdldFNjcm9sbExlZnQoKSArIGRlbHRhWCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB5b3UgY2FuIHN0aWxsIHNjcm9sbCBieSBlaXRoZXIgcGFyYW1ldGVyOyBpbiBvdGhlciB3b3JkcywgeW91IGhhdmVuJ3QgcmVhY2hlZCB0aGUgZW5kIG9mIHRoZSBmaWxlIG9yIGxpbmUuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZGVsdGFYIFRoZSB4IHZhbHVlIHRvIHNjcm9sbCBieVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlbHRhWSBUaGUgeSB2YWx1ZSB0byBzY3JvbGwgYnlcbiAgICAqXG4gICAgKlxuICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgKiovXG4gICAgaXNTY3JvbGxhYmxlQnkoZGVsdGFYOiBudW1iZXIsIGRlbHRhWTogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIGlmIChkZWx0YVkgPCAwICYmIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSA+PSAxIC0gdGhpcy5zY3JvbGxNYXJnaW4udG9wKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGlmIChkZWx0YVkgPiAwICYmIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSArIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHRcbiAgICAgICAgICAgIC0gdGhpcy5sYXllckNvbmZpZy5tYXhIZWlnaHQgPCAtMSArIHRoaXMuc2Nyb2xsTWFyZ2luLmJvdHRvbSlcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBpZiAoZGVsdGFYIDwgMCAmJiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpID49IDEgLSB0aGlzLnNjcm9sbE1hcmdpbi5sZWZ0KVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGlmIChkZWx0YVggPiAwICYmIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxMZWZ0KCkgKyB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGhcbiAgICAgICAgICAgIC0gdGhpcy5sYXllckNvbmZpZy53aWR0aCA8IC0xICsgdGhpcy5zY3JvbGxNYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBwaXhlbFRvU2NyZWVuQ29vcmRpbmF0ZXMoeDogbnVtYmVyLCB5OiBudW1iZXIpIHtcbiAgICAgICAgdmFyIGNhbnZhc1BvcyA9IHRoaXMuc2Nyb2xsZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICAgICAgdmFyIG9mZnNldCA9ICh4ICsgdGhpcy5zY3JvbGxMZWZ0IC0gY2FudmFzUG9zLmxlZnQgLSB0aGlzLiRwYWRkaW5nKSAvIHRoaXMuY2hhcmFjdGVyV2lkdGg7XG4gICAgICAgIHZhciByb3cgPSBNYXRoLmZsb29yKCh5ICsgdGhpcy5zY3JvbGxUb3AgLSBjYW52YXNQb3MudG9wKSAvIHRoaXMubGluZUhlaWdodCk7XG4gICAgICAgIHZhciBjb2wgPSBNYXRoLnJvdW5kKG9mZnNldCk7XG5cbiAgICAgICAgcmV0dXJuIHsgcm93OiByb3csIGNvbHVtbjogY29sLCBzaWRlOiBvZmZzZXQgLSBjb2wgPiAwID8gMSA6IC0xIH07XG4gICAgfVxuXG4gICAgc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXMoY2xpZW50WDogbnVtYmVyLCBjbGllbnRZOiBudW1iZXIpIHtcbiAgICAgICAgdmFyIGNhbnZhc1BvcyA9IHRoaXMuc2Nyb2xsZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICAgICAgdmFyIGNvbHVtbiA9IE1hdGgucm91bmQoKGNsaWVudFggKyB0aGlzLnNjcm9sbExlZnQgLSBjYW52YXNQb3MubGVmdCAtIHRoaXMuJHBhZGRpbmcpIC8gdGhpcy5jaGFyYWN0ZXJXaWR0aCk7XG5cbiAgICAgICAgdmFyIHJvdyA9IChjbGllbnRZICsgdGhpcy5zY3JvbGxUb3AgLSBjYW52YXNQb3MudG9wKSAvIHRoaXMubGluZUhlaWdodDtcblxuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihyb3csIE1hdGgubWF4KGNvbHVtbiwgMCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgYHBhZ2VYYCBhbmQgYHBhZ2VZYCBjb29yZGluYXRlcyBvZiB0aGUgZG9jdW1lbnQgcG9zaXRpb24uXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSBkb2N1bWVudCByb3cgcG9zaXRpb25cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGRvY3VtZW50IGNvbHVtbiBwb3NpdGlvblxuICAgICogQHJldHVybnMge09iamVjdH1cbiAgICAqKi9cbiAgICB0ZXh0VG9TY3JlZW5Db29yZGluYXRlcyhyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiB7IHBhZ2VYOiBudW1iZXI7IHBhZ2VZOiBudW1iZXIgfSB7XG4gICAgICAgIHZhciBjYW52YXNQb3MgPSB0aGlzLnNjcm9sbGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICB2YXIgcG9zID0gdGhpcy5zZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihyb3csIGNvbHVtbik7XG5cbiAgICAgICAgdmFyIHggPSB0aGlzLiRwYWRkaW5nICsgTWF0aC5yb3VuZChwb3MuY29sdW1uICogdGhpcy5jaGFyYWN0ZXJXaWR0aCk7XG4gICAgICAgIHZhciB5ID0gcG9zLnJvdyAqIHRoaXMubGluZUhlaWdodDtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcGFnZVg6IGNhbnZhc1Bvcy5sZWZ0ICsgeCAtIHRoaXMuc2Nyb2xsTGVmdCxcbiAgICAgICAgICAgIHBhZ2VZOiBjYW52YXNQb3MudG9wICsgeSAtIHRoaXMuc2Nyb2xsVG9wXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogRm9jdXNlcyB0aGUgY3VycmVudCBjb250YWluZXIuXG4gICAgKiovXG4gICAgdmlzdWFsaXplRm9jdXMoKSB7XG4gICAgICAgIGFkZENzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBcImFjZV9mb2N1c1wiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBCbHVycyB0aGUgY3VycmVudCBjb250YWluZXIuXG4gICAgKiovXG4gICAgdmlzdWFsaXplQmx1cigpIHtcbiAgICAgICAgcmVtb3ZlQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIFwiYWNlX2ZvY3VzXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgc2hvd0NvbXBvc2l0aW9uXG4gICAgICogQHBhcmFtIHBvc2l0aW9uXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBzaG93Q29tcG9zaXRpb24ocG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0pIHtcbiAgICAgICAgaWYgKCF0aGlzLiRjb21wb3NpdGlvbilcbiAgICAgICAgICAgIHRoaXMuJGNvbXBvc2l0aW9uID0ge1xuICAgICAgICAgICAgICAgIGtlZXBUZXh0QXJlYUF0Q3Vyc29yOiB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvcixcbiAgICAgICAgICAgICAgICBjc3NUZXh0OiB0aGlzLnRleHRhcmVhLnN0eWxlLmNzc1RleHRcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSB0cnVlO1xuICAgICAgICBhZGRDc3NDbGFzcyh0aGlzLnRleHRhcmVhLCBcImFjZV9jb21wb3NpdGlvblwiKTtcbiAgICAgICAgdGhpcy50ZXh0YXJlYS5zdHlsZS5jc3NUZXh0ID0gXCJcIjtcbiAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBBIHN0cmluZyBvZiB0ZXh0IHRvIHVzZVxuICAgICAqXG4gICAgICogU2V0cyB0aGUgaW5uZXIgdGV4dCBvZiB0aGUgY3VycmVudCBjb21wb3NpdGlvbiB0byBgdGV4dGAuXG4gICAgICovXG4gICAgc2V0Q29tcG9zaXRpb25UZXh0KHRleHQ/OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgLy8gVE9ETzogV2h5IGlzIHRoZSBwYXJhbWV0ZXIgbm90IHVzZWQ/XG4gICAgICAgIHRoaXMuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSGlkZXMgdGhlIGN1cnJlbnQgY29tcG9zaXRpb24uXG4gICAgICovXG4gICAgaGlkZUNvbXBvc2l0aW9uKCkge1xuICAgICAgICBpZiAoIXRoaXMuJGNvbXBvc2l0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICByZW1vdmVDc3NDbGFzcyh0aGlzLnRleHRhcmVhLCBcImFjZV9jb21wb3NpdGlvblwiKTtcbiAgICAgICAgdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSB0aGlzLiRjb21wb3NpdGlvbi5rZWVwVGV4dEFyZWFBdEN1cnNvcjtcbiAgICAgICAgdGhpcy50ZXh0YXJlYS5zdHlsZS5jc3NUZXh0ID0gdGhpcy4kY29tcG9zaXRpb24uY3NzVGV4dDtcbiAgICAgICAgdGhpcy4kY29tcG9zaXRpb24gPSBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFtTZXRzIGEgbmV3IHRoZW1lIGZvciB0aGUgZWRpdG9yLiBgdGhlbWVgIHNob3VsZCBleGlzdCwgYW5kIGJlIGEgZGlyZWN0b3J5IHBhdGgsIGxpa2UgYGFjZS90aGVtZS90ZXh0bWF0ZWAuXXs6ICNWaXJ0dWFsUmVuZGVyZXIuc2V0VGhlbWV9XG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHRoZW1lIFRoZSBwYXRoIHRvIGEgdGhlbWVcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYiBvcHRpb25hbCBjYWxsYmFja1xuICAgICAqL1xuICAgIHNldFRoZW1lKHRoZW1lOiBzdHJpbmcsIGNiPzogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLiR0aGVtZUlkID0gdGhlbWU7XG4gICAgICAgIF9zZWxmLl9kaXNwYXRjaEV2ZW50KCd0aGVtZUNoYW5nZScsIHsgdGhlbWU6IHRoZW1lIH0pO1xuXG4gICAgICAgIGlmICghdGhlbWUgfHwgdHlwZW9mIHRoZW1lID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHZhciBtb2R1bGVOYW1lID0gdGhlbWUgfHwgdGhpcy4kb3B0aW9ucy50aGVtZS5pbml0aWFsVmFsdWU7XG4gICAgICAgICAgICBsb2FkTW9kdWxlKFtcInRoZW1lXCIsIG1vZHVsZU5hbWVdLCBhZnRlckxvYWQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgYWZ0ZXJMb2FkKHRoZW1lKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGFmdGVyTG9hZChtb2R1bGUpIHtcbiAgICAgICAgICAgIGlmIChfc2VsZi4kdGhlbWVJZCAhPSB0aGVtZSlcbiAgICAgICAgICAgICAgICByZXR1cm4gY2IgJiYgY2IoKTtcbiAgICAgICAgICAgIGlmICghbW9kdWxlLmNzc0NsYXNzKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGltcG9ydENzc1N0cmluZyhcbiAgICAgICAgICAgICAgICBtb2R1bGUuY3NzVGV4dCxcbiAgICAgICAgICAgICAgICBtb2R1bGUuY3NzQ2xhc3MsXG4gICAgICAgICAgICAgICAgX3NlbGYuY29udGFpbmVyLm93bmVyRG9jdW1lbnRcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIGlmIChfc2VsZi50aGVtZSlcbiAgICAgICAgICAgICAgICByZW1vdmVDc3NDbGFzcyhfc2VsZi5jb250YWluZXIsIF9zZWxmLnRoZW1lLmNzc0NsYXNzKTtcblxuICAgICAgICAgICAgdmFyIHBhZGRpbmcgPSBcInBhZGRpbmdcIiBpbiBtb2R1bGUgPyBtb2R1bGUucGFkZGluZyA6IFwicGFkZGluZ1wiIGluIChfc2VsZi50aGVtZSB8fCB7fSkgPyA0IDogX3NlbGYuJHBhZGRpbmc7XG5cbiAgICAgICAgICAgIGlmIChfc2VsZi4kcGFkZGluZyAmJiBwYWRkaW5nICE9IF9zZWxmLiRwYWRkaW5nKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2V0UGFkZGluZyhwYWRkaW5nKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gdGhpcyBpcyBrZXB0IG9ubHkgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgICBfc2VsZi4kdGhlbWUgPSBtb2R1bGUuY3NzQ2xhc3M7XG5cbiAgICAgICAgICAgIF9zZWxmLnRoZW1lID0gbW9kdWxlO1xuICAgICAgICAgICAgYWRkQ3NzQ2xhc3MoX3NlbGYuY29udGFpbmVyLCBtb2R1bGUuY3NzQ2xhc3MpO1xuICAgICAgICAgICAgc2V0Q3NzQ2xhc3MoX3NlbGYuY29udGFpbmVyLCBcImFjZV9kYXJrXCIsIG1vZHVsZS5pc0RhcmspO1xuXG4gICAgICAgICAgICAvLyBmb3JjZSByZS1tZWFzdXJlIG9mIHRoZSBndXR0ZXIgd2lkdGhcbiAgICAgICAgICAgIGlmIChfc2VsZi4kc2l6ZSkge1xuICAgICAgICAgICAgICAgIF9zZWxmLiRzaXplLndpZHRoID0gMDtcbiAgICAgICAgICAgICAgICBfc2VsZi4kdXBkYXRlU2l6ZUFzeW5jKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIF9zZWxmLl9kaXNwYXRjaEV2ZW50KCd0aGVtZUxvYWRlZCcsIHsgdGhlbWU6IG1vZHVsZSB9KTtcbiAgICAgICAgICAgIGNiICYmIGNiKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBbUmV0dXJucyB0aGUgcGF0aCBvZiB0aGUgY3VycmVudCB0aGVtZS5dezogI1ZpcnR1YWxSZW5kZXJlci5nZXRUaGVtZX1cbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAqL1xuICAgIGdldFRoZW1lKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLiR0aGVtZUlkO1xuICAgIH1cblxuICAgIC8vIE1ldGhvZHMgYWxsb3dzIHRvIGFkZCAvIHJlbW92ZSBDU1MgY2xhc3NuYW1lcyB0byB0aGUgZWRpdG9yIGVsZW1lbnQuXG4gICAgLy8gVGhpcyBmZWF0dXJlIGNhbiBiZSB1c2VkIGJ5IHBsdWctaW5zIHRvIHByb3ZpZGUgYSB2aXN1YWwgaW5kaWNhdGlvbiBvZlxuICAgIC8vIGEgY2VydGFpbiBtb2RlIHRoYXQgZWRpdG9yIGlzIGluLlxuXG4gICAgLyoqXG4gICAgICogW0FkZHMgYSBuZXcgY2xhc3MsIGBzdHlsZWAsIHRvIHRoZSBlZGl0b3IuXXs6ICNWaXJ0dWFsUmVuZGVyZXIuc2V0U3R5bGV9XG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHN0eWxlIEEgY2xhc3MgbmFtZVxuICAgICAqXG4gICAgICovXG4gICAgc2V0U3R5bGUoc3R5bGU6IHN0cmluZywgaW5jbHVkZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgc2V0Q3NzQ2xhc3ModGhpcy5jb250YWluZXIsIHN0eWxlLCBpbmNsdWRlICE9PSBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogW1JlbW92ZXMgdGhlIGNsYXNzIGBzdHlsZWAgZnJvbSB0aGUgZWRpdG9yLl17OiAjVmlydHVhbFJlbmRlcmVyLnVuc2V0U3R5bGV9XG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHN0eWxlIEEgY2xhc3MgbmFtZVxuICAgICAqL1xuICAgIHVuc2V0U3R5bGUoc3R5bGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICByZW1vdmVDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgc3R5bGUpO1xuICAgIH1cblxuICAgIHNldEN1cnNvclN0eWxlKHN0eWxlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgIT0gc3R5bGUpIHtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgPSBzdHlsZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBjdXJzb3JTdHlsZSBBIGNzcyBjdXJzb3Igc3R5bGVcbiAgICAgKi9cbiAgICBzZXRNb3VzZUN1cnNvcihjdXJzb3JTdHlsZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgPSBjdXJzb3JTdHlsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXN0cm95cyB0aGUgdGV4dCBhbmQgY3Vyc29yIGxheWVycyBmb3IgdGhpcyByZW5kZXJlci5cbiAgICAgKi9cbiAgICBkZXN0cm95KCk6IHZvaWQge1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuZGVzdHJveSgpO1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5kZXN0cm95KCk7XG4gICAgfVxufVxuXG5kZWZpbmVPcHRpb25zKFZpcnR1YWxSZW5kZXJlci5wcm90b3R5cGUsIFwicmVuZGVyZXJcIiwge1xuICAgIGFuaW1hdGVkU2Nyb2xsOiB7IGluaXRpYWxWYWx1ZTogZmFsc2UgfSxcbiAgICBzaG93SW52aXNpYmxlczoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyLnNldFNob3dJbnZpc2libGVzKHZhbHVlKSlcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX1RFWFQpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBzaG93UHJpbnRNYXJnaW46IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbigpIHsgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBwcmludE1hcmdpbkNvbHVtbjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKCkgeyB0aGlzLiR1cGRhdGVQcmludE1hcmdpbigpOyB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IDgwXG4gICAgfSxcbiAgICBwcmludE1hcmdpbjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWwgPT0gXCJudW1iZXJcIilcbiAgICAgICAgICAgICAgICB0aGlzLiRwcmludE1hcmdpbkNvbHVtbiA9IHZhbDtcbiAgICAgICAgICAgIHRoaXMuJHNob3dQcmludE1hcmdpbiA9ICEhdmFsO1xuICAgICAgICAgICAgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiRzaG93UHJpbnRNYXJnaW4gJiYgdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW47XG4gICAgICAgIH1cbiAgICB9LFxuICAgIHNob3dHdXR0ZXI6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG93KSB7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXIuc3R5bGUuZGlzcGxheSA9IHNob3cgPyBcImJsb2NrXCIgOiBcIm5vbmVcIjtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfRlVMTCk7XG4gICAgICAgICAgICB0aGlzLm9uR3V0dGVyUmVzaXplKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgZmFkZUZvbGRXaWRnZXRzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykge1xuICAgICAgICAgICAgc2V0Q3NzQ2xhc3ModGhpcy4kZ3V0dGVyLCBcImFjZV9mYWRlLWZvbGQtd2lkZ2V0c1wiLCBzaG93KTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgc2hvd0ZvbGRXaWRnZXRzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykgeyB0aGlzLiRndXR0ZXJMYXllci5zZXRTaG93Rm9sZFdpZGdldHMoc2hvdykgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBzaG93TGluZU51bWJlcnM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG93KSB7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5zZXRTaG93TGluZU51bWJlcnMoc2hvdyk7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX0dVVFRFUik7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgZGlzcGxheUluZGVudEd1aWRlczoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3cpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiR0ZXh0TGF5ZXIuc2V0RGlzcGxheUluZGVudEd1aWRlcyhzaG93KSlcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX1RFWFQpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGhpZ2hsaWdodEd1dHRlckxpbmU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG91bGRIaWdobGlnaHQpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodCkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQgPSBjcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuY2xhc3NOYW1lID0gXCJhY2VfZ3V0dGVyLWFjdGl2ZS1saW5lXCI7XG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyLmFwcGVuZENoaWxkKHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodC5zdHlsZS5kaXNwbGF5ID0gc2hvdWxkSGlnaGxpZ2h0ID8gXCJcIiA6IFwibm9uZVwiO1xuICAgICAgICAgICAgLy8gaWYgY3Vyc29ybGF5ZXIgaGF2ZSBuZXZlciBiZWVuIHVwZGF0ZWQgdGhlcmUncyBub3RoaW5nIG9uIHNjcmVlbiB0byB1cGRhdGVcbiAgICAgICAgICAgIGlmICh0aGlzLiRjdXJzb3JMYXllci4kcGl4ZWxQb3MpXG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlLFxuICAgICAgICB2YWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgaFNjcm9sbEJhckFsd2F5c1Zpc2libGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kaFNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHwgIXRoaXMuJGhvcml6U2Nyb2xsKVxuICAgICAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgdlNjcm9sbEJhckFsd2F5c1Zpc2libGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kdlNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHwgIXRoaXMuJHZTY3JvbGwpXG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9TQ1JPTEwpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBmb250U2l6ZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNpemUpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygc2l6ZSA9PSBcIm51bWJlclwiKVxuICAgICAgICAgICAgICAgIHNpemUgPSBzaXplICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5jb250YWluZXIuc3R5bGUuZm9udFNpemUgPSBzaXplO1xuICAgICAgICAgICAgdGhpcy51cGRhdGVGb250U2l6ZSgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IDEyXG4gICAgfSxcbiAgICBmb250RmFtaWx5OiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdGhpcy5jb250YWluZXIuc3R5bGUuZm9udEZhbWlseSA9IG5hbWU7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUZvbnRTaXplKCk7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIG1heExpbmVzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUZ1bGwoKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgbWluTGluZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlRnVsbCgpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBzY3JvbGxQYXN0RW5kOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB2YWwgPSArdmFsIHx8IDA7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2Nyb2xsUGFzdEVuZCA9PSB2YWwpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdGhpcy4kc2Nyb2xsUGFzdEVuZCA9IHZhbDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiAwLFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICBmaXhlZFdpZHRoR3V0dGVyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci4kZml4ZWRXaWR0aCA9ICEhdmFsO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9HVVRURVIpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICB0aGVtZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLnNldFRoZW1lKHZhbCkgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuJHRoZW1lSWQgfHwgdGhpcy50aGVtZTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcIi4vdGhlbWUvdGV4dG1hdGVcIixcbiAgICAgICAgaGFuZGxlc1NldDogdHJ1ZVxuICAgIH1cbn0pO1xuIl19