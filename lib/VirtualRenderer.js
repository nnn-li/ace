import { addCssClass, createElement, importCssString, removeCssClass, setCssClass } from "./lib/dom";
import { _emit, defineOptions, loadModule, resetOptions } from "./config";
import { isOldIE } from "./lib/useragent";
import Gutter from "./layer/Gutter";
import Marker from "./layer/Marker";
import Text from "./layer/Text";
import Cursor from "./layer/Cursor";
import { HScrollBar, VScrollBar } from "./scrollbar";
import RenderLoop from "./RenderLoop";
import FontMetrics from "./layer/FontMetrics";
import EventEmitterClass from "./lib/event_emitter";
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
export default class VirtualRenderer extends EventEmitterClass {
    constructor(container) {
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
        if (this.session) {
            this.session.doc.off("changeNewLineMode", this.onChangeNewLineMode);
        }
        this.session = session;
        if (!session) {
            return;
        }
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
        if (this.$loop.pending) {
            this.$size.$dirty = true;
        }
        else {
            this.onResize();
        }
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
            var cursor = this.session.getSelection().getCursor();
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
        console.log("VirtualRenderer setTheme, theme = " + theme);
        var _self = this;
        this.$themeId = theme;
        _self._dispatchEvent('themeChange', { theme: theme });
        if (!theme || typeof theme === "string") {
            var moduleName = theme || this.getOption("theme").initialValue;
            console.log("moduleName => " + moduleName);
            loadModule(["theme", moduleName], afterLoad, this.container.ownerDocument);
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
            importCssString(modJs.cssText, modJs.cssClass, _self.container.ownerDocument);
            if (_self.theme) {
                removeCssClass(_self.container, _self.theme.cssClass);
            }
            var padding = "padding" in modJs ? modJs.padding : "padding" in (_self.theme || {}) ? 4 : _self.$padding;
            if (_self.$padding && padding != _self.$padding) {
                _self.setPadding(padding);
            }
            _self.theme = modJs;
            addCssClass(_self.container, modJs.cssClass);
            setCssClass(_self.container, "ace_dark", modJs.isDark);
            if (_self.$size) {
                _self.$size.width = 0;
                _self.$updateSizeAsync();
            }
            _self._dispatchEvent('themeLoaded', { theme: modJs });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlydHVhbFJlbmRlcmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1ZpcnR1YWxSZW5kZXJlci50cyJdLCJuYW1lcyI6WyJWaXJ0dWFsUmVuZGVyZXIiLCJWaXJ0dWFsUmVuZGVyZXIuY29uc3RydWN0b3IiLCJWaXJ0dWFsUmVuZGVyZXIubWF4TGluZXMiLCJWaXJ0dWFsUmVuZGVyZXIua2VlcFRleHRBcmVhQXRDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0RGVmYXVsdEN1cnNvclN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEN1cnNvckxheWVyT2ZmIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUNoYXJhY3RlclNpemUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2Vzc2lvbiIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVMaW5lcyIsIlZpcnR1YWxSZW5kZXJlci5vbkNoYW5nZU5ld0xpbmVNb2RlIiwiVmlydHVhbFJlbmRlcmVyLm9uQ2hhbmdlVGFiU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVUZXh0IiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUZ1bGwiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlRm9udFNpemUiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNpemVBc3luYyIsIlZpcnR1YWxSZW5kZXJlci5vblJlc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci4kdXBkYXRlQ2FjaGVkU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5vbkd1dHRlclJlc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5hZGp1c3RXcmFwTGltaXQiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0QW5pbWF0ZWRTY3JvbGwiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0QW5pbWF0ZWRTY3JvbGwiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2hvd0ludmlzaWJsZXMiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2hvd0ludmlzaWJsZXMiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0RGlzcGxheUluZGVudEd1aWRlcyIsIlZpcnR1YWxSZW5kZXJlci5zZXREaXNwbGF5SW5kZW50R3VpZGVzIiwiVmlydHVhbFJlbmRlcmVyLnNldFNob3dQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRTaG93UHJpbnRNYXJnaW4iLCJWaXJ0dWFsUmVuZGVyZXIuc2V0UHJpbnRNYXJnaW5Db2x1bW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0UHJpbnRNYXJnaW5Db2x1bW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2hvd0d1dHRlciIsIlZpcnR1YWxSZW5kZXJlci5zZXRTaG93R3V0dGVyIiwiVmlydHVhbFJlbmRlcmVyLmdldEZhZGVGb2xkV2lkZ2V0cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRGYWRlRm9sZFdpZGdldHMiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0SGlnaGxpZ2h0R3V0dGVyTGluZSIsIlZpcnR1YWxSZW5kZXJlci5nZXRIaWdobGlnaHRHdXR0ZXJMaW5lIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0IiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRDb250YWluZXJFbGVtZW50IiwiVmlydHVhbFJlbmRlcmVyLmdldE1vdXNlRXZlbnRUYXJnZXQiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0VGV4dEFyZWFDb250YWluZXIiLCJWaXJ0dWFsUmVuZGVyZXIuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLmdldEZpcnN0VmlzaWJsZVJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRGaXJzdEZ1bGx5VmlzaWJsZVJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRMYXN0RnVsbHlWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLnNldFBhZGRpbmciLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2Nyb2xsTWFyZ2luIiwiVmlydHVhbFJlbmRlcmVyLmdldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLmdldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLnNldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVTY3JvbGxCYXJWIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVTY3JvbGxCYXJIIiwiVmlydHVhbFJlbmRlcmVyLmZyZWV6ZSIsIlZpcnR1YWxSZW5kZXJlci51bmZyZWV6ZSIsIlZpcnR1YWxSZW5kZXJlci4kcmVuZGVyQ2hhbmdlcyIsIlZpcnR1YWxSZW5kZXJlci4kYXV0b3NpemUiLCJWaXJ0dWFsUmVuZGVyZXIuJGNvbXB1dGVMYXllckNvbmZpZyIsIlZpcnR1YWxSZW5kZXJlci4kdXBkYXRlTGluZXMiLCJWaXJ0dWFsUmVuZGVyZXIuJGdldExvbmdlc3RMaW5lIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUZyb250TWFya2VycyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVCYWNrTWFya2VycyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVCcmVha3BvaW50cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRBbm5vdGF0aW9ucyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuaGlkZUN1cnNvciIsIlZpcnR1YWxSZW5kZXJlci5zaG93Q3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFNlbGVjdGlvbkludG9WaWV3IiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbFRvcCIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxMZWZ0IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbFRvcFJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxCb3R0b21Sb3ciLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9Sb3ciLCJWaXJ0dWFsUmVuZGVyZXIuYWxpZ25DdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuJGNhbGNTdGVwcyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb0xpbmUiLCJWaXJ0dWFsUmVuZGVyZXIuYW5pbWF0ZVNjcm9sbGluZyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb1kiLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9YIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbEJ5IiwiVmlydHVhbFJlbmRlcmVyLmlzU2Nyb2xsYWJsZUJ5IiwiVmlydHVhbFJlbmRlcmVyLnBpeGVsVG9TY3JlZW5Db29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci50ZXh0VG9TY3JlZW5Db29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci52aXN1YWxpemVGb2N1cyIsIlZpcnR1YWxSZW5kZXJlci52aXN1YWxpemVCbHVyIiwiVmlydHVhbFJlbmRlcmVyLnNob3dDb21wb3NpdGlvbiIsIlZpcnR1YWxSZW5kZXJlci5zZXRDb21wb3NpdGlvblRleHQiLCJWaXJ0dWFsUmVuZGVyZXIuaGlkZUNvbXBvc2l0aW9uIiwiVmlydHVhbFJlbmRlcmVyLnNldFRoZW1lIiwiVmlydHVhbFJlbmRlcmVyLnNldFRoZW1lLmFmdGVyTG9hZCIsIlZpcnR1YWxSZW5kZXJlci5nZXRUaGVtZSIsIlZpcnR1YWxSZW5kZXJlci5zZXRTdHlsZSIsIlZpcnR1YWxSZW5kZXJlci51bnNldFN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEN1cnNvclN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldE1vdXNlQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLmRlc3Ryb3kiXSwibWFwcGluZ3MiOiJPQThCTyxFQUFDLFdBQVcsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFFLGNBQWMsRUFBRSxXQUFXLEVBQUMsTUFB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O1FBQ3hCQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxJQUFJQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN6Q0EsTUFBTUEsQ0FBQ0E7UUFFWEEsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0E7UUFDNUJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUNwREEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EscUJBQXFCQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0REEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDUEEsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDaEJBLENBQUNBO1FBQ0RBLE9BQU9BLElBQUlBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBQzNCQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN2Q0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsYUFBYUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFFM0NBLE9BQU9BLElBQUlBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBO1FBRWpDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN0Q0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsR0FB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QSxJQUFJQSxDQUFDQSxDQUFDQTtRQUUxREEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUVyRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDOUJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO2dCQUNQQSxHQUFHQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQTtZQUM5Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1ZBLEdBQUdBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLENBQUNBO1lBQ2pDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNuQ0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsR0FBR0EsWUFBWUEsR0FBR0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEZBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO2dCQUNQQSxHQUFHQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQTtZQUM5Q0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0E7UUFDakZBLENBQUNBO1FBRURBLElBQUlBLFVBQVVBLEdB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QSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0Q0EsSUFBSUEsVUFBVUEsR0FBR0EsS0FBS0EsSUFBSUEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsWUFBWUEsQ0FBQ0E7WUFDL0RBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLGdCQUFnQkEsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7WUFHM0NBLFVBQVVBLENBQUNBLENBQUNBLE9BQU9BLEVBQUVBLFVBQVVBLENBQUNBLEVBQUVBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1FBQy9FQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNyQkEsQ0FBQ0E7UUFFREEsbUJBQW1CQSxLQUE4RUE7WUFFN0ZDLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLEtBQUtBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUMzQkEsTUFBTUEsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDdEJBLENBQUNBO1lBRURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsTUFBTUEsQ0FBQ0E7WUFDWEEsQ0FBQ0E7WUFFREEsZUFBZUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsRUFBRUEsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0E7WUFFOUVBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUNkQSxjQUFjQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUMxREEsQ0FBQ0E7WUFF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QUFhLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELFlBQVksRUFBRSxrQkFBa0I7UUFDaEMsVUFBVSxFQUFFLElBQUk7S0FDbkI7Q0FDSixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICpcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblxuaW1wb3J0IHthZGRDc3NDbGFzcywgY3JlYXRlRWxlbWVudCwgaW1wb3J0Q3NzU3RyaW5nLCByZW1vdmVDc3NDbGFzcywgc2V0Q3NzQ2xhc3N9IGZyb20gXCIuL2xpYi9kb21cIjtcbmltcG9ydCB7X2VtaXQsIGRlZmluZU9wdGlvbnMsIGxvYWRNb2R1bGUsIHJlc2V0T3B0aW9uc30gZnJvbSBcIi4vY29uZmlnXCI7XG5pbXBvcnQge2lzT2xkSUV9IGZyb20gXCIuL2xpYi91c2VyYWdlbnRcIjtcbmltcG9ydCBHdXR0ZXIgZnJvbSBcIi4vbGF5ZXIvR3V0dGVyXCI7XG5pbXBvcnQgTWFya2VyIGZyb20gXCIuL2xheWVyL01hcmtlclwiO1xuaW1wb3J0IFRleHQgZnJvbSBcIi4vbGF5ZXIvVGV4dFwiO1xuaW1wb3J0IEN1cnNvciBmcm9tIFwiLi9sYXllci9DdXJzb3JcIjtcbmltcG9ydCB7SFNjcm9sbEJhciwgVlNjcm9sbEJhcn0gZnJvbSBcIi4vc2Nyb2xsYmFyXCI7XG5pbXBvcnQgUmVuZGVyTG9vcCBmcm9tIFwiLi9SZW5kZXJMb29wXCI7XG5pbXBvcnQgRm9udE1ldHJpY3MgZnJvbSBcIi4vbGF5ZXIvRm9udE1ldHJpY3NcIjtcbmltcG9ydCBFdmVudEVtaXR0ZXJDbGFzcyBmcm9tIFwiLi9saWIvZXZlbnRfZW1pdHRlclwiO1xuaW1wb3J0IEVkaXRTZXNzaW9uIGZyb20gJy4vRWRpdFNlc3Npb24nO1xuaW1wb3J0IE9wdGlvbnNQcm92aWRlciBmcm9tIFwiLi9PcHRpb25zUHJvdmlkZXJcIjtcblxuLy8gRklYTUVcbi8vIGltcG9ydCBlZGl0b3JDc3MgPSByZXF1aXJlKFwiLi9yZXF1aXJlanMvdGV4dCEuL2Nzcy9lZGl0b3IuY3NzXCIpO1xuLy8gaW1wb3J0Q3NzU3RyaW5nKGVkaXRvckNzcywgXCJhY2VfZWRpdG9yXCIpO1xuXG52YXIgQ0hBTkdFX0NVUlNPUiA9IDE7XG52YXIgQ0hBTkdFX01BUktFUiA9IDI7XG52YXIgQ0hBTkdFX0dVVFRFUiA9IDQ7XG52YXIgQ0hBTkdFX1NDUk9MTCA9IDg7XG52YXIgQ0hBTkdFX0xJTkVTID0gMTY7XG52YXIgQ0hBTkdFX1RFWFQgPSAzMjtcbnZhciBDSEFOR0VfU0laRSA9IDY0O1xudmFyIENIQU5HRV9NQVJLRVJfQkFDSyA9IDEyODtcbnZhciBDSEFOR0VfTUFSS0VSX0ZST05UID0gMjU2O1xudmFyIENIQU5HRV9GVUxMID0gNTEyO1xudmFyIENIQU5HRV9IX1NDUk9MTCA9IDEwMjQ7XG5cbi8qKlxuICogVGhlIGNsYXNzIHRoYXQgaXMgcmVzcG9uc2libGUgZm9yIGRyYXdpbmcgZXZlcnl0aGluZyB5b3Ugc2VlIG9uIHRoZSBzY3JlZW4hXG4gKiBAcmVsYXRlZCBlZGl0b3IucmVuZGVyZXIgXG4gKiBAY2xhc3MgVmlydHVhbFJlbmRlcmVyXG4gKiovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBWaXJ0dWFsUmVuZGVyZXIgZXh0ZW5kcyBFdmVudEVtaXR0ZXJDbGFzcyBpbXBsZW1lbnRzIE9wdGlvbnNQcm92aWRlciB7XG4gICAgcHVibGljIHRleHRhcmVhOiBIVE1MVGV4dEFyZWFFbGVtZW50O1xuICAgIHB1YmxpYyBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuICAgIHB1YmxpYyBzY3JvbGxMZWZ0ID0gMDtcbiAgICBwdWJsaWMgc2Nyb2xsVG9wID0gMDtcbiAgICBwdWJsaWMgbGF5ZXJDb25maWcgPSB7XG4gICAgICAgIHdpZHRoOiAxLFxuICAgICAgICBwYWRkaW5nOiAwLFxuICAgICAgICBmaXJzdFJvdzogMCxcbiAgICAgICAgZmlyc3RSb3dTY3JlZW46IDAsXG4gICAgICAgIGxhc3RSb3c6IDAsXG4gICAgICAgIGxpbmVIZWlnaHQ6IDAsXG4gICAgICAgIGNoYXJhY3RlcldpZHRoOiAwLFxuICAgICAgICBtaW5IZWlnaHQ6IDEsXG4gICAgICAgIG1heEhlaWdodDogMSxcbiAgICAgICAgb2Zmc2V0OiAwLFxuICAgICAgICBoZWlnaHQ6IDEsXG4gICAgICAgIGd1dHRlck9mZnNldDogMVxuICAgIH07XG4gICAgcHVibGljICRtYXhMaW5lczogbnVtYmVyO1xuICAgIHB1YmxpYyAkbWluTGluZXM6IG51bWJlcjtcbiAgICBwdWJsaWMgJGN1cnNvckxheWVyOiBDdXJzb3I7XG4gICAgcHVibGljICRndXR0ZXJMYXllcjogR3V0dGVyO1xuXG4gICAgcHVibGljICRwYWRkaW5nOiBudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgJGZyb3plbiA9IGZhbHNlO1xuXG4gICAgLy8gVGhlIHRoZW1lSWQgaXMgd2hhdCBpcyBjb21tdW5pY2F0ZWQgaW4gdGhlIEFQSS5cbiAgICBwcml2YXRlICR0aGVtZUlkOiBzdHJpbmc7XG4gICAgLyoqXG4gICAgICogVGhlIGxvYWRlZCB0aGVtZSBvYmplY3QuIFRoaXMgYWxsb3dzIHVzIHRvIHJlbW92ZSBhIHRoZW1lLlxuICAgICAqL1xuICAgIHByaXZhdGUgdGhlbWU6IHsgY3NzQ2xhc3M6IHN0cmluZyB9O1xuXG4gICAgcHJpdmF0ZSAkdGltZXI7XG4gICAgcHJpdmF0ZSBTVEVQUyA9IDg7XG4gICAgcHVibGljICRrZWVwVGV4dEFyZWFBdEN1cnNvcjogYm9vbGVhbjtcbiAgICBwdWJsaWMgJGd1dHRlcjtcbiAgICBwdWJsaWMgc2Nyb2xsZXI7XG4gICAgcHVibGljIGNvbnRlbnQ6IEhUTUxEaXZFbGVtZW50O1xuICAgIHB1YmxpYyAkdGV4dExheWVyOiBUZXh0O1xuICAgIHByaXZhdGUgJG1hcmtlckZyb250OiBNYXJrZXI7XG4gICAgcHJpdmF0ZSAkbWFya2VyQmFjazogTWFya2VyO1xuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MRGl2RWxlbWVudDtcbiAgICBwcml2YXRlICRob3JpelNjcm9sbDogYm9vbGVhbjtcbiAgICBwcml2YXRlICR2U2Nyb2xsO1xuICAgIHB1YmxpYyBzY3JvbGxCYXJIOiBIU2Nyb2xsQmFyO1xuICAgIHB1YmxpYyBzY3JvbGxCYXJWOiBWU2Nyb2xsQmFyO1xuICAgIHByaXZhdGUgJHNjcm9sbEFuaW1hdGlvbjogeyBmcm9tOiBudW1iZXI7IHRvOiBudW1iZXI7IHN0ZXBzOiBudW1iZXJbXSB9O1xuICAgIHByaXZhdGUgc2Vzc2lvbjogRWRpdFNlc3Npb247XG5cbiAgICBwcml2YXRlIHNjcm9sbE1hcmdpbiA9IHtcbiAgICAgICAgbGVmdDogMCxcbiAgICAgICAgcmlnaHQ6IDAsXG4gICAgICAgIHRvcDogMCxcbiAgICAgICAgYm90dG9tOiAwLFxuICAgICAgICB2OiAwLFxuICAgICAgICBoOiAwXG4gICAgfTtcblxuICAgIHByaXZhdGUgJGZvbnRNZXRyaWNzOiBGb250TWV0cmljcztcbiAgICBwcml2YXRlICRhbGxvd0JvbGRGb250cztcbiAgICBwcml2YXRlIGN1cnNvclBvcztcbiAgICBwdWJsaWMgJHNpemU7XG4gICAgcHJpdmF0ZSAkbG9vcDogUmVuZGVyTG9vcDtcbiAgICBwcml2YXRlICRjaGFuZ2VkTGluZXM7XG4gICAgcHJpdmF0ZSAkY2hhbmdlcyA9IDA7XG4gICAgcHJpdmF0ZSByZXNpemluZztcbiAgICBwcml2YXRlICRndXR0ZXJMaW5lSGlnaGxpZ2h0O1xuICAgIHByaXZhdGUgZ3V0dGVyV2lkdGg7XG4gICAgcHJpdmF0ZSAkZ3V0dGVyV2lkdGg7XG4gICAgcHJpdmF0ZSAkc2hvd1ByaW50TWFyZ2luO1xuICAgIHByaXZhdGUgJHByaW50TWFyZ2luRWw7XG4gICAgcHJpdmF0ZSBnZXRPcHRpb247XG4gICAgcHJpdmF0ZSBzZXRPcHRpb247XG4gICAgcHJpdmF0ZSBjaGFyYWN0ZXJXaWR0aDtcbiAgICBwcml2YXRlICRwcmludE1hcmdpbkNvbHVtbjtcbiAgICBwcml2YXRlIGxpbmVIZWlnaHQ7XG4gICAgcHJpdmF0ZSAkZXh0cmFIZWlnaHQ7XG4gICAgcHJpdmF0ZSAkY29tcG9zaXRpb246IHsga2VlcFRleHRBcmVhQXRDdXJzb3I6IGJvb2xlYW47IGNzc1RleHQ6IHN0cmluZyB9O1xuICAgIHByaXZhdGUgJGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIHByaXZhdGUgJHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIHByaXZhdGUgJHNob3dHdXR0ZXI7XG4gICAgcHJpdmF0ZSBzaG93SW52aXNpYmxlcztcbiAgICBwcml2YXRlICRhbmltYXRlZFNjcm9sbDtcbiAgICBwcml2YXRlICRzY3JvbGxQYXN0RW5kO1xuICAgIHByaXZhdGUgJGhpZ2hsaWdodEd1dHRlckxpbmU7XG4gICAgcHJpdmF0ZSBkZXNpcmVkSGVpZ2h0O1xuXG4gICAgLyoqXG4gICAgICogQ29uc3RydWN0cyBhIG5ldyBgVmlydHVhbFJlbmRlcmVyYCB3aXRoaW4gdGhlIGBjb250YWluZXJgIHNwZWNpZmllZC5cbiAgICAgKiBAY2xhc3MgVmlydHVhbFJlbmRlcmVyXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQHBhcmFtIGNvbnRhaW5lciB7SFRNTEVsZW1lbnR9IFRoZSByb290IGVsZW1lbnQgb2YgdGhlIGVkaXRvclxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICAgICAgc3VwZXIoKTtcblxuICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuXG4gICAgICAgIHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyIHx8IDxIVE1MRGl2RWxlbWVudD5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXG4gICAgICAgIC8vIFRPRE86IHRoaXMgYnJlYWtzIHJlbmRlcmluZyBpbiBDbG91ZDkgd2l0aCBtdWx0aXBsZSBhY2UgaW5zdGFuY2VzXG4gICAgICAgIC8vIC8vIEltcG9ydHMgQ1NTIG9uY2UgcGVyIERPTSBkb2N1bWVudCAoJ2FjZV9lZGl0b3InIHNlcnZlcyBhcyBhbiBpZGVudGlmaWVyKS5cbiAgICAgICAgLy8gaW1wb3J0Q3NzU3RyaW5nKGVkaXRvckNzcywgXCJhY2VfZWRpdG9yXCIsIGNvbnRhaW5lci5vd25lckRvY3VtZW50KTtcblxuICAgICAgICAvLyBpbiBJRSA8PSA5IHRoZSBuYXRpdmUgY3Vyc29yIGFsd2F5cyBzaGluZXMgdGhyb3VnaFxuICAgICAgICB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9ICFpc09sZElFO1xuXG4gICAgICAgIGFkZENzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBcImFjZV9lZGl0b3JcIik7XG5cbiAgICAgICAgdGhpcy4kZ3V0dGVyID0gY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGhpcy4kZ3V0dGVyLmNsYXNzTmFtZSA9IFwiYWNlX2d1dHRlclwiO1xuICAgICAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLiRndXR0ZXIpO1xuXG4gICAgICAgIHRoaXMuc2Nyb2xsZXIgPSBjcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB0aGlzLnNjcm9sbGVyLmNsYXNzTmFtZSA9IFwiYWNlX3Njcm9sbGVyXCI7XG4gICAgICAgIHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuc2Nyb2xsZXIpO1xuXG4gICAgICAgIHRoaXMuY29udGVudCA9IDxIVE1MRGl2RWxlbWVudD5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB0aGlzLmNvbnRlbnQuY2xhc3NOYW1lID0gXCJhY2VfY29udGVudFwiO1xuICAgICAgICB0aGlzLnNjcm9sbGVyLmFwcGVuZENoaWxkKHRoaXMuY29udGVudCk7XG5cbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIgPSBuZXcgR3V0dGVyKHRoaXMuJGd1dHRlcik7XG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyLm9uKFwiY2hhbmdlR3V0dGVyV2lkdGhcIiwgdGhpcy5vbkd1dHRlclJlc2l6ZS5iaW5kKHRoaXMpKTtcblxuICAgICAgICB0aGlzLiRtYXJrZXJCYWNrID0gbmV3IE1hcmtlcih0aGlzLmNvbnRlbnQpO1xuXG4gICAgICAgIHZhciB0ZXh0TGF5ZXIgPSB0aGlzLiR0ZXh0TGF5ZXIgPSBuZXcgVGV4dCh0aGlzLmNvbnRlbnQpO1xuICAgICAgICB0aGlzLmNhbnZhcyA9IHRleHRMYXllci5lbGVtZW50O1xuXG4gICAgICAgIHRoaXMuJG1hcmtlckZyb250ID0gbmV3IE1hcmtlcih0aGlzLmNvbnRlbnQpO1xuXG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyID0gbmV3IEN1cnNvcih0aGlzLmNvbnRlbnQpO1xuXG4gICAgICAgIC8vIEluZGljYXRlcyB3aGV0aGVyIHRoZSBob3Jpem9udGFsIHNjcm9sbGJhciBpcyB2aXNpYmxlXG4gICAgICAgIHRoaXMuJGhvcml6U2Nyb2xsID0gZmFsc2U7XG4gICAgICAgIHRoaXMuJHZTY3JvbGwgPSBmYWxzZTtcblxuICAgICAgICB0aGlzLnNjcm9sbEJhclYgPSBuZXcgVlNjcm9sbEJhcih0aGlzLmNvbnRhaW5lciwgdGhpcyk7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFySCA9IG5ldyBIU2Nyb2xsQmFyKHRoaXMuY29udGFpbmVyLCB0aGlzKTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJWLmFkZEV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgaWYgKCFfc2VsZi4kc2Nyb2xsQW5pbWF0aW9uKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxUb3AoZS5kYXRhIC0gX3NlbGYuc2Nyb2xsTWFyZ2luLnRvcCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnNjcm9sbEJhckguYWRkRXZlbnRMaXN0ZW5lcihcInNjcm9sbFwiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBpZiAoIV9zZWxmLiRzY3JvbGxBbmltYXRpb24pIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXNzaW9uLnNldFNjcm9sbExlZnQoZS5kYXRhIC0gX3NlbGYuc2Nyb2xsTWFyZ2luLmxlZnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmN1cnNvclBvcyA9IHtcbiAgICAgICAgICAgIHJvdzogMCxcbiAgICAgICAgICAgIGNvbHVtbjogMFxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuJGZvbnRNZXRyaWNzID0gbmV3IEZvbnRNZXRyaWNzKHRoaXMuY29udGFpbmVyLCA1MDApO1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuJHNldEZvbnRNZXRyaWNzKHRoaXMuJGZvbnRNZXRyaWNzKTtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VDaGFyYWN0ZXJTaXplXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIF9zZWxmLnVwZGF0ZUNoYXJhY3RlclNpemUoKTtcbiAgICAgICAgICAgIF9zZWxmLm9uUmVzaXplKHRydWUsIF9zZWxmLmd1dHRlcldpZHRoLCBfc2VsZi4kc2l6ZS53aWR0aCwgX3NlbGYuJHNpemUuaGVpZ2h0KTtcbiAgICAgICAgICAgIF9zZWxmLl9zaWduYWwoXCJjaGFuZ2VDaGFyYWN0ZXJTaXplXCIsIGUpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLiRzaXplID0ge1xuICAgICAgICAgICAgd2lkdGg6IDAsXG4gICAgICAgICAgICBoZWlnaHQ6IDAsXG4gICAgICAgICAgICBzY3JvbGxlckhlaWdodDogMCxcbiAgICAgICAgICAgIHNjcm9sbGVyV2lkdGg6IDAsXG4gICAgICAgICAgICAkZGlydHk6IHRydWVcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLiRsb29wID0gbmV3IFJlbmRlckxvb3AodGhpcy4kcmVuZGVyQ2hhbmdlcy5iaW5kKHRoaXMpLCB0aGlzLmNvbnRhaW5lci5vd25lckRvY3VtZW50LmRlZmF1bHRWaWV3KTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG5cbiAgICAgICAgdGhpcy51cGRhdGVDaGFyYWN0ZXJTaXplKCk7XG4gICAgICAgIHRoaXMuc2V0UGFkZGluZyg0KTtcbiAgICAgICAgcmVzZXRPcHRpb25zKHRoaXMpO1xuICAgICAgICBfZW1pdChcInJlbmRlcmVyXCIsIHRoaXMpO1xuICAgIH1cblxuICAgIHNldCBtYXhMaW5lcyhtYXhMaW5lczogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuJG1heExpbmVzID0gbWF4TGluZXM7XG4gICAgfVxuXG4gICAgc2V0IGtlZXBUZXh0QXJlYUF0Q3Vyc29yKGtlZXBUZXh0QXJlYUF0Q3Vyc29yOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0ga2VlcFRleHRBcmVhQXRDdXJzb3I7XG4gICAgfVxuXG4gICAgc2V0RGVmYXVsdEN1cnNvclN0eWxlKCk6IHZvaWQge1xuICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUuY3Vyc29yID0gXCJkZWZhdWx0XCI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTm90IHN1cmUgd2hhdCB0aGUgY29ycmVjdCBzZW1hbnRpY3Mgc2hvdWxkIGJlIGZvciB0aGlzLlxuICAgICAqL1xuICAgIHNldEN1cnNvckxheWVyT2ZmKCk6IHZvaWQge1xuICAgICAgICB2YXIgbm9vcCA9IGZ1bmN0aW9uKCkgeyB9O1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5yZXN0YXJ0VGltZXIgPSBub29wO1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5lbGVtZW50LnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICB9XG5cbiAgICB1cGRhdGVDaGFyYWN0ZXJTaXplKCk6IHZvaWQge1xuICAgICAgICAvLyBGSVhNRTogREdIIGFsbG93Qm9sZEZvbnRzIGRvZXMgbm90IGV4aXN0IG9uIFRleHRcbiAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllclsnYWxsb3dCb2xkRm9udHMnXSAhPSB0aGlzLiRhbGxvd0JvbGRGb250cykge1xuICAgICAgICAgICAgdGhpcy4kYWxsb3dCb2xkRm9udHMgPSB0aGlzLiR0ZXh0TGF5ZXJbJ2FsbG93Qm9sZEZvbnRzJ107XG4gICAgICAgICAgICB0aGlzLnNldFN0eWxlKFwiYWNlX25vYm9sZFwiLCAhdGhpcy4kYWxsb3dCb2xkRm9udHMpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5sYXllckNvbmZpZy5jaGFyYWN0ZXJXaWR0aCA9IHRoaXMuY2hhcmFjdGVyV2lkdGggPSB0aGlzLiR0ZXh0TGF5ZXIuZ2V0Q2hhcmFjdGVyV2lkdGgoKTtcbiAgICAgICAgdGhpcy5sYXllckNvbmZpZy5saW5lSGVpZ2h0ID0gdGhpcy5saW5lSGVpZ2h0ID0gdGhpcy4kdGV4dExheWVyLmdldExpbmVIZWlnaHQoKTtcbiAgICAgICAgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBc3NvY2lhdGVzIHRoZSByZW5kZXJlciB3aXRoIGFuIEVkaXRTZXNzaW9uLlxuICAgICAqL1xuICAgIHNldFNlc3Npb24oc2Vzc2lvbjogRWRpdFNlc3Npb24pOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbikge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmRvYy5vZmYoXCJjaGFuZ2VOZXdMaW5lTW9kZVwiLCB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uID0gc2Vzc2lvbjtcbiAgICAgICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5zY3JvbGxNYXJnaW4udG9wICYmIHNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgPD0gMClcbiAgICAgICAgICAgIHNlc3Npb24uc2V0U2Nyb2xsVG9wKC10aGlzLnNjcm9sbE1hcmdpbi50b3ApO1xuXG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJG1hcmtlckJhY2suc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQuc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgICAgICB0aGlzLnNlc3Npb24uJHNldEZvbnRNZXRyaWNzKHRoaXMuJGZvbnRNZXRyaWNzKTtcblxuICAgICAgICB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUgPSB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlKClcbiAgICAgICAgdGhpcy5zZXNzaW9uLmRvYy5vbihcImNoYW5nZU5ld0xpbmVNb2RlXCIsIHRoaXMub25DaGFuZ2VOZXdMaW5lTW9kZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBUcmlnZ2VycyBhIHBhcnRpYWwgdXBkYXRlIG9mIHRoZSB0ZXh0LCBmcm9tIHRoZSByYW5nZSBnaXZlbiBieSB0aGUgdHdvIHBhcmFtZXRlcnMuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZmlyc3RSb3cgVGhlIGZpcnN0IHJvdyB0byB1cGRhdGVcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBsYXN0IHJvdyB0byB1cGRhdGVcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHVwZGF0ZUxpbmVzKGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlciwgZm9yY2U/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIGlmIChsYXN0Um93ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGxhc3RSb3cgPSBJbmZpbml0eTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy4kY2hhbmdlZExpbmVzKSB7XG4gICAgICAgICAgICB0aGlzLiRjaGFuZ2VkTGluZXMgPSB7IGZpcnN0Um93OiBmaXJzdFJvdywgbGFzdFJvdzogbGFzdFJvdyB9O1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKHRoaXMuJGNoYW5nZWRMaW5lcy5maXJzdFJvdyA+IGZpcnN0Um93KSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzLmZpcnN0Um93ID0gZmlyc3RSb3c7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdyA8IGxhc3RSb3cpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdyA9IGxhc3RSb3c7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB0aGUgY2hhbmdlIGhhcHBlbmVkIG9mZnNjcmVlbiBhYm92ZSB1cyB0aGVuIGl0J3MgcG9zc2libGVcbiAgICAgICAgLy8gdGhhdCBhIG5ldyBsaW5lIHdyYXAgd2lsbCBhZmZlY3QgdGhlIHBvc2l0aW9uIG9mIHRoZSBsaW5lcyBvbiBvdXJcbiAgICAgICAgLy8gc2NyZWVuIHNvIHRoZXkgbmVlZCByZWRyYXduLlxuICAgICAgICAvLyBUT0RPOiBiZXR0ZXIgc29sdXRpb24gaXMgdG8gbm90IGNoYW5nZSBzY3JvbGwgcG9zaXRpb24gd2hlbiB0ZXh0IGlzIGNoYW5nZWQgb3V0c2lkZSBvZiB2aXNpYmxlIGFyZWFcbiAgICAgICAgaWYgKHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93IDwgdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdykge1xuICAgICAgICAgICAgaWYgKGZvcmNlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3cgPSB0aGlzLmxheWVyQ29uZmlnLmxhc3RSb3c7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy4kY2hhbmdlZExpbmVzLmZpcnN0Um93ID4gdGhpcy5sYXllckNvbmZpZy5sYXN0Um93KSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfTElORVMpO1xuICAgIH1cblxuICAgIG9uQ2hhbmdlTmV3TGluZU1vZGUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX1RFWFQpO1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuJHVwZGF0ZUVvbENoYXIoKTtcbiAgICB9XG5cbiAgICBvbkNoYW5nZVRhYlNpemUoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLiRsb29wKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kbG9vcC5zY2hlZHVsZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX1RFWFQgfCBDSEFOR0VfTUFSS0VSKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLiR0ZXh0TGF5ZXIpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiR0ZXh0TGF5ZXIub25DaGFuZ2VUYWJTaXplKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLm9uQ2hhbmdlVGFiU2l6ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gSSdtIG5vdCBzdXJlIHdoeSB3ZSBjYW4gbm93IGVuZCB1cCBoZXJlLlxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJpZ2dlcnMgYSBmdWxsIHVwZGF0ZSBvZiB0aGUgdGV4dCwgZm9yIGFsbCB0aGUgcm93cy5cbiAgICAgKi9cbiAgICB1cGRhdGVUZXh0KCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9URVhUKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcmlnZ2VycyBhIGZ1bGwgdXBkYXRlIG9mIGFsbCB0aGUgbGF5ZXJzLCBmb3IgYWxsIHRoZSByb3dzLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZm9yY2UgSWYgYHRydWVgLCBmb3JjZXMgdGhlIGNoYW5nZXMgdGhyb3VnaFxuICAgICAqL1xuICAgIHVwZGF0ZUZ1bGwoZm9yY2U/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIGlmIChmb3JjZSlcbiAgICAgICAgICAgIHRoaXMuJHJlbmRlckNoYW5nZXMoQ0hBTkdFX0ZVTEwsIHRydWUpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGVzIHRoZSBmb250IHNpemUuXG4gICAgICovXG4gICAgdXBkYXRlRm9udFNpemUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci5jaGVja0ZvclNpemVDaGFuZ2VzKCk7XG4gICAgfVxuXG4gICAgJHVwZGF0ZVNpemVBc3luYygpIHtcbiAgICAgICAgaWYgKHRoaXMuJGxvb3AucGVuZGluZykge1xuICAgICAgICAgICAgdGhpcy4kc2l6ZS4kZGlydHkgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5vblJlc2l6ZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBbVHJpZ2dlcnMgYSByZXNpemUgb2YgdGhlIGVkaXRvci5dezogI1ZpcnR1YWxSZW5kZXJlci5vblJlc2l6ZX1cbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZm9yY2UgSWYgYHRydWVgLCByZWNvbXB1dGVzIHRoZSBzaXplLCBldmVuIGlmIHRoZSBoZWlnaHQgYW5kIHdpZHRoIGhhdmVuJ3QgY2hhbmdlZFxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGd1dHRlcldpZHRoIFRoZSB3aWR0aCBvZiB0aGUgZ3V0dGVyIGluIHBpeGVsc1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IHdpZHRoIFRoZSB3aWR0aCBvZiB0aGUgZWRpdG9yIGluIHBpeGVsc1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGhlaWdodCBUaGUgaGllaGd0IG9mIHRoZSBlZGl0b3IsIGluIHBpeGVsc1xuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgb25SZXNpemUoZm9yY2U/OiBib29sZWFuLCBndXR0ZXJXaWR0aD86IG51bWJlciwgd2lkdGg/OiBudW1iZXIsIGhlaWdodD86IG51bWJlcikge1xuICAgICAgICBpZiAodGhpcy5yZXNpemluZyA+IDIpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGVsc2UgaWYgKHRoaXMucmVzaXppbmcgPiAwKVxuICAgICAgICAgICAgdGhpcy5yZXNpemluZysrO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLnJlc2l6aW5nID0gZm9yY2UgPyAxIDogMDtcbiAgICAgICAgLy8gYHx8IGVsLnNjcm9sbEhlaWdodGAgaXMgcmVxdWlyZWQgZm9yIG91dG9zaXppbmcgZWRpdG9ycyBvbiBpZVxuICAgICAgICAvLyB3aGVyZSBlbGVtZW50cyB3aXRoIGNsaWVudEhlaWdodCA9IDAgYWxzb2UgaGF2ZSBjbGllbnRXaWR0aCA9IDBcbiAgICAgICAgdmFyIGVsID0gdGhpcy5jb250YWluZXI7XG4gICAgICAgIGlmICghaGVpZ2h0KVxuICAgICAgICAgICAgaGVpZ2h0ID0gZWwuY2xpZW50SGVpZ2h0IHx8IGVsLnNjcm9sbEhlaWdodDtcbiAgICAgICAgaWYgKCF3aWR0aClcbiAgICAgICAgICAgIHdpZHRoID0gZWwuY2xpZW50V2lkdGggfHwgZWwuc2Nyb2xsV2lkdGg7XG4gICAgICAgIHZhciBjaGFuZ2VzID0gdGhpcy4kdXBkYXRlQ2FjaGVkU2l6ZShmb3JjZSwgZ3V0dGVyV2lkdGgsIHdpZHRoLCBoZWlnaHQpO1xuXG5cbiAgICAgICAgaWYgKCF0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0IHx8ICghd2lkdGggJiYgIWhlaWdodCkpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5yZXNpemluZyA9IDA7XG5cbiAgICAgICAgaWYgKGZvcmNlKVxuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuJHBhZGRpbmcgPSBudWxsO1xuXG4gICAgICAgIGlmIChmb3JjZSlcbiAgICAgICAgICAgIHRoaXMuJHJlbmRlckNoYW5nZXMoY2hhbmdlcyB8IHRoaXMuJGNoYW5nZXMsIHRydWUpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKGNoYW5nZXMgfCB0aGlzLiRjaGFuZ2VzKTtcblxuICAgICAgICBpZiAodGhpcy5yZXNpemluZylcbiAgICAgICAgICAgIHRoaXMucmVzaXppbmcgPSAwO1xuICAgIH1cblxuICAgICR1cGRhdGVDYWNoZWRTaXplKGZvcmNlLCBndXR0ZXJXaWR0aCwgd2lkdGgsIGhlaWdodCkge1xuICAgICAgICBoZWlnaHQgLT0gKHRoaXMuJGV4dHJhSGVpZ2h0IHx8IDApO1xuICAgICAgICB2YXIgY2hhbmdlcyA9IDA7XG4gICAgICAgIHZhciBzaXplID0gdGhpcy4kc2l6ZTtcbiAgICAgICAgdmFyIG9sZFNpemUgPSB7XG4gICAgICAgICAgICB3aWR0aDogc2l6ZS53aWR0aCxcbiAgICAgICAgICAgIGhlaWdodDogc2l6ZS5oZWlnaHQsXG4gICAgICAgICAgICBzY3JvbGxlckhlaWdodDogc2l6ZS5zY3JvbGxlckhlaWdodCxcbiAgICAgICAgICAgIHNjcm9sbGVyV2lkdGg6IHNpemUuc2Nyb2xsZXJXaWR0aFxuICAgICAgICB9O1xuICAgICAgICBpZiAoaGVpZ2h0ICYmIChmb3JjZSB8fCBzaXplLmhlaWdodCAhPSBoZWlnaHQpKSB7XG4gICAgICAgICAgICBzaXplLmhlaWdodCA9IGhlaWdodDtcbiAgICAgICAgICAgIGNoYW5nZXMgfD0gQ0hBTkdFX1NJWkU7XG5cbiAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJIZWlnaHQgPSBzaXplLmhlaWdodDtcbiAgICAgICAgICAgIGlmICh0aGlzLiRob3JpelNjcm9sbClcbiAgICAgICAgICAgICAgICBzaXplLnNjcm9sbGVySGVpZ2h0IC09IHRoaXMuc2Nyb2xsQmFySC5oZWlnaHQ7XG5cbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5lbGVtZW50LnN0eWxlLmJvdHRvbSA9IHRoaXMuc2Nyb2xsQmFySC5oZWlnaHQgKyBcInB4XCI7XG5cbiAgICAgICAgICAgIGNoYW5nZXMgPSBjaGFuZ2VzIHwgQ0hBTkdFX1NDUk9MTDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh3aWR0aCAmJiAoZm9yY2UgfHwgc2l6ZS53aWR0aCAhPSB3aWR0aCkpIHtcbiAgICAgICAgICAgIGNoYW5nZXMgfD0gQ0hBTkdFX1NJWkU7XG4gICAgICAgICAgICBzaXplLndpZHRoID0gd2lkdGg7XG5cbiAgICAgICAgICAgIGlmIChndXR0ZXJXaWR0aCA9PSBudWxsKVxuICAgICAgICAgICAgICAgIGd1dHRlcldpZHRoID0gdGhpcy4kc2hvd0d1dHRlciA/IHRoaXMuJGd1dHRlci5vZmZzZXRXaWR0aCA6IDA7XG5cbiAgICAgICAgICAgIHRoaXMuZ3V0dGVyV2lkdGggPSBndXR0ZXJXaWR0aDtcblxuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJILmVsZW1lbnQuc3R5bGUubGVmdCA9XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxlci5zdHlsZS5sZWZ0ID0gZ3V0dGVyV2lkdGggKyBcInB4XCI7XG4gICAgICAgICAgICBzaXplLnNjcm9sbGVyV2lkdGggPSBNYXRoLm1heCgwLCB3aWR0aCAtIGd1dHRlcldpZHRoIC0gdGhpcy5zY3JvbGxCYXJWLndpZHRoKTtcblxuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJILmVsZW1lbnQuc3R5bGUucmlnaHQgPVxuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsZXIuc3R5bGUucmlnaHQgPSB0aGlzLnNjcm9sbEJhclYud2lkdGggKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbGVyLnN0eWxlLmJvdHRvbSA9IHRoaXMuc2Nyb2xsQmFySC5oZWlnaHQgKyBcInB4XCI7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLnNlc3Npb24gJiYgdGhpcy5zZXNzaW9uLmdldFVzZVdyYXBNb2RlKCkgJiYgdGhpcy5hZGp1c3RXcmFwTGltaXQoKSB8fCBmb3JjZSlcbiAgICAgICAgICAgICAgICBjaGFuZ2VzIHw9IENIQU5HRV9GVUxMO1xuICAgICAgICB9XG5cbiAgICAgICAgc2l6ZS4kZGlydHkgPSAhd2lkdGggfHwgIWhlaWdodDtcblxuICAgICAgICBpZiAoY2hhbmdlcylcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcInJlc2l6ZVwiLCBvbGRTaXplKTtcblxuICAgICAgICByZXR1cm4gY2hhbmdlcztcbiAgICB9XG5cbiAgICBvbkd1dHRlclJlc2l6ZSgpIHtcbiAgICAgICAgdmFyIGd1dHRlcldpZHRoID0gdGhpcy4kc2hvd0d1dHRlciA/IHRoaXMuJGd1dHRlci5vZmZzZXRXaWR0aCA6IDA7XG4gICAgICAgIGlmIChndXR0ZXJXaWR0aCAhPSB0aGlzLmd1dHRlcldpZHRoKVxuICAgICAgICAgICAgdGhpcy4kY2hhbmdlcyB8PSB0aGlzLiR1cGRhdGVDYWNoZWRTaXplKHRydWUsIGd1dHRlcldpZHRoLCB0aGlzLiRzaXplLndpZHRoLCB0aGlzLiRzaXplLmhlaWdodCk7XG5cbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi5nZXRVc2VXcmFwTW9kZSgpICYmIHRoaXMuYWRqdXN0V3JhcExpbWl0KCkpIHtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuJHNpemUuJGRpcnR5KSB7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJGNvbXB1dGVMYXllckNvbmZpZygpO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfTUFSS0VSKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogQWRqdXN0cyB0aGUgd3JhcCBsaW1pdCwgd2hpY2ggaXMgdGhlIG51bWJlciBvZiBjaGFyYWN0ZXJzIHRoYXQgY2FuIGZpdCB3aXRoaW4gdGhlIHdpZHRoIG9mIHRoZSBlZGl0IGFyZWEgb24gc2NyZWVuLlxuICAgICoqL1xuICAgIGFkanVzdFdyYXBMaW1pdCgpIHtcbiAgICAgICAgdmFyIGF2YWlsYWJsZVdpZHRoID0gdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gdGhpcy4kcGFkZGluZyAqIDI7XG4gICAgICAgIHZhciBsaW1pdCA9IE1hdGguZmxvb3IoYXZhaWxhYmxlV2lkdGggLyB0aGlzLmNoYXJhY3RlcldpZHRoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5hZGp1c3RXcmFwTGltaXQobGltaXQsIHRoaXMuJHNob3dQcmludE1hcmdpbiAmJiB0aGlzLiRwcmludE1hcmdpbkNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gaGF2ZSBhbiBhbmltYXRlZCBzY3JvbGwgb3Igbm90LlxuICAgICogQHBhcmFtIHtCb29sZWFufSBzaG91bGRBbmltYXRlIFNldCB0byBgdHJ1ZWAgdG8gc2hvdyBhbmltYXRlZCBzY3JvbGxzXG4gICAgKlxuICAgICoqL1xuICAgIHNldEFuaW1hdGVkU2Nyb2xsKHNob3VsZEFuaW1hdGUpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJhbmltYXRlZFNjcm9sbFwiLCBzaG91bGRBbmltYXRlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgd2hldGhlciBhbiBhbmltYXRlZCBzY3JvbGwgaGFwcGVucyBvciBub3QuXG4gICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAqKi9cbiAgICBnZXRBbmltYXRlZFNjcm9sbCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGFuaW1hdGVkU2Nyb2xsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IGludmlzaWJsZSBjaGFyYWN0ZXJzIG9yIG5vdC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3dJbnZpc2libGVzIFNldCB0byBgdHJ1ZWAgdG8gc2hvdyBpbnZpc2libGVzXG4gICAgICovXG4gICAgc2V0U2hvd0ludmlzaWJsZXMoc2hvd0ludmlzaWJsZXM6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJzaG93SW52aXNpYmxlc1wiLCBzaG93SW52aXNpYmxlcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB3aGV0aGVyIGludmlzaWJsZSBjaGFyYWN0ZXJzIGFyZSBiZWluZyBzaG93biBvciBub3QuXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd0ludmlzaWJsZXMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInNob3dJbnZpc2libGVzXCIpO1xuICAgIH1cblxuICAgIGdldERpc3BsYXlJbmRlbnRHdWlkZXMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImRpc3BsYXlJbmRlbnRHdWlkZXNcIik7XG4gICAgfVxuXG4gICAgc2V0RGlzcGxheUluZGVudEd1aWRlcyhkaXNwbGF5SW5kZW50R3VpZGVzOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiZGlzcGxheUluZGVudEd1aWRlc1wiLCBkaXNwbGF5SW5kZW50R3VpZGVzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyB0aGUgcHJpbnQgbWFyZ2luIG9yIG5vdC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3dQcmludE1hcmdpbiBTZXQgdG8gYHRydWVgIHRvIHNob3cgdGhlIHByaW50IG1hcmdpblxuICAgICAqXG4gICAgICovXG4gICAgc2V0U2hvd1ByaW50TWFyZ2luKHNob3dQcmludE1hcmdpbjogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInNob3dQcmludE1hcmdpblwiLCBzaG93UHJpbnRNYXJnaW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciB0aGUgcHJpbnQgbWFyZ2luIGlzIGJlaW5nIHNob3duIG9yIG5vdC5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93UHJpbnRNYXJnaW4oKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInNob3dQcmludE1hcmdpblwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBjb2x1bW4gZGVmaW5pbmcgd2hlcmUgdGhlIHByaW50IG1hcmdpbiBzaG91bGQgYmUuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHByaW50TWFyZ2luQ29sdW1uIFNwZWNpZmllcyB0aGUgbmV3IHByaW50IG1hcmdpblxuICAgICAqL1xuICAgIHNldFByaW50TWFyZ2luQ29sdW1uKHByaW50TWFyZ2luQ29sdW1uOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJwcmludE1hcmdpbkNvbHVtblwiLCBwcmludE1hcmdpbkNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY29sdW1uIG51bWJlciBvZiB3aGVyZSB0aGUgcHJpbnQgbWFyZ2luIGlzLlxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgICovXG4gICAgZ2V0UHJpbnRNYXJnaW5Db2x1bW4oKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwicHJpbnRNYXJnaW5Db2x1bW5cIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGd1dHRlciBpcyBiZWluZyBzaG93bi5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93R3V0dGVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzaG93R3V0dGVyXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgdGhlIGd1dHRlciBvciBub3QuXG4gICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3cgU2V0IHRvIGB0cnVlYCB0byBzaG93IHRoZSBndXR0ZXJcbiAgICAqXG4gICAgKiovXG4gICAgc2V0U2hvd0d1dHRlcihzaG93KSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNldE9wdGlvbihcInNob3dHdXR0ZXJcIiwgc2hvdyk7XG4gICAgfVxuXG4gICAgZ2V0RmFkZUZvbGRXaWRnZXRzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJmYWRlRm9sZFdpZGdldHNcIilcbiAgICB9XG5cbiAgICBzZXRGYWRlRm9sZFdpZGdldHMoc2hvdykge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImZhZGVGb2xkV2lkZ2V0c1wiLCBzaG93KTtcbiAgICB9XG5cbiAgICBzZXRIaWdobGlnaHRHdXR0ZXJMaW5lKHNob3VsZEhpZ2hsaWdodCkge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImhpZ2hsaWdodEd1dHRlckxpbmVcIiwgc2hvdWxkSGlnaGxpZ2h0KTtcbiAgICB9XG5cbiAgICBnZXRIaWdobGlnaHRHdXR0ZXJMaW5lKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJoaWdobGlnaHRHdXR0ZXJMaW5lXCIpO1xuICAgIH1cblxuICAgICR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0KCkge1xuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zO1xuICAgICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5sYXllckNvbmZpZy5saW5lSGVpZ2h0O1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmdldFVzZVdyYXBNb2RlKCkpIHtcbiAgICAgICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLnNlc3Npb24uZ2V0U2VsZWN0aW9uKCkuZ2V0Q3Vyc29yKCk7XG4gICAgICAgICAgICBjdXJzb3IuY29sdW1uID0gMDtcbiAgICAgICAgICAgIHBvcyA9IHRoaXMuJGN1cnNvckxheWVyLmdldFBpeGVsUG9zaXRpb24oY3Vyc29yLCB0cnVlKTtcbiAgICAgICAgICAgIGhlaWdodCAqPSB0aGlzLnNlc3Npb24uZ2V0Um93TGVuZ3RoKGN1cnNvci5yb3cpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuc3R5bGUudG9wID0gcG9zLnRvcCAtIHRoaXMubGF5ZXJDb25maWcub2Zmc2V0ICsgXCJweFwiO1xuICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0LnN0eWxlLmhlaWdodCA9IGhlaWdodCArIFwicHhcIjtcbiAgICB9XG5cbiAgICAkdXBkYXRlUHJpbnRNYXJnaW4oKSB7XG4gICAgICAgIGlmICghdGhpcy4kc2hvd1ByaW50TWFyZ2luICYmICF0aGlzLiRwcmludE1hcmdpbkVsKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmICghdGhpcy4kcHJpbnRNYXJnaW5FbCkge1xuICAgICAgICAgICAgdmFyIGNvbnRhaW5lckVsOiBIVE1MRGl2RWxlbWVudCA9IDxIVE1MRGl2RWxlbWVudD5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgY29udGFpbmVyRWwuY2xhc3NOYW1lID0gXCJhY2VfbGF5ZXIgYWNlX3ByaW50LW1hcmdpbi1sYXllclwiO1xuICAgICAgICAgICAgdGhpcy4kcHJpbnRNYXJnaW5FbCA9IGNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICB0aGlzLiRwcmludE1hcmdpbkVsLmNsYXNzTmFtZSA9IFwiYWNlX3ByaW50LW1hcmdpblwiO1xuICAgICAgICAgICAgY29udGFpbmVyRWwuYXBwZW5kQ2hpbGQodGhpcy4kcHJpbnRNYXJnaW5FbCk7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuaW5zZXJ0QmVmb3JlKGNvbnRhaW5lckVsLCB0aGlzLmNvbnRlbnQuZmlyc3RDaGlsZCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc3R5bGUgPSB0aGlzLiRwcmludE1hcmdpbkVsLnN0eWxlO1xuICAgICAgICBzdHlsZS5sZWZ0ID0gKCh0aGlzLmNoYXJhY3RlcldpZHRoICogdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW4pICsgdGhpcy4kcGFkZGluZykgKyBcInB4XCI7XG4gICAgICAgIHN0eWxlLnZpc2liaWxpdHkgPSB0aGlzLiRzaG93UHJpbnRNYXJnaW4gPyBcInZpc2libGVcIiA6IFwiaGlkZGVuXCI7XG5cbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbiAmJiB0aGlzLnNlc3Npb25bJyR3cmFwJ10gPT0gLTEpXG4gICAgICAgICAgICB0aGlzLmFkanVzdFdyYXBMaW1pdCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIHJvb3QgZWxlbWVudCBjb250YWluaW5nIHRoaXMgcmVuZGVyZXIuXG4gICAgKiBAcmV0dXJucyB7RE9NRWxlbWVudH1cbiAgICAqKi9cbiAgICBnZXRDb250YWluZXJFbGVtZW50KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jb250YWluZXI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgZWxlbWVudCB0aGF0IHRoZSBtb3VzZSBldmVudHMgYXJlIGF0dGFjaGVkIHRvXG4gICAgKiBAcmV0dXJucyB7RE9NRWxlbWVudH1cbiAgICAqKi9cbiAgICBnZXRNb3VzZUV2ZW50VGFyZ2V0KCk6IEhUTUxEaXZFbGVtZW50IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGVudDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBlbGVtZW50IHRvIHdoaWNoIHRoZSBoaWRkZW4gdGV4dCBhcmVhIGlzIGFkZGVkLlxuICAgICogQHJldHVybnMge0RPTUVsZW1lbnR9XG4gICAgKiovXG4gICAgZ2V0VGV4dEFyZWFDb250YWluZXIoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRhaW5lcjtcbiAgICB9XG5cbiAgICAvLyBtb3ZlIHRleHQgaW5wdXQgb3ZlciB0aGUgY3Vyc29yXG4gICAgLy8gdGhpcyBpcyByZXF1aXJlZCBmb3IgaU9TIGFuZCBJTUVcbiAgICAkbW92ZVRleHRBcmVhVG9DdXJzb3IoKSB7XG4gICAgICAgIGlmICghdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciBjb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuICAgICAgICB2YXIgcG9zVG9wID0gdGhpcy4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zLnRvcDtcbiAgICAgICAgdmFyIHBvc0xlZnQgPSB0aGlzLiRjdXJzb3JMYXllci4kcGl4ZWxQb3MubGVmdDtcbiAgICAgICAgcG9zVG9wIC09IGNvbmZpZy5vZmZzZXQ7XG5cbiAgICAgICAgdmFyIGggPSB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIGlmIChwb3NUb3AgPCAwIHx8IHBvc1RvcCA+IGNvbmZpZy5oZWlnaHQgLSBoKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciB3ID0gdGhpcy5jaGFyYWN0ZXJXaWR0aDtcbiAgICAgICAgaWYgKHRoaXMuJGNvbXBvc2l0aW9uKSB7XG4gICAgICAgICAgICB2YXIgdmFsID0gdGhpcy50ZXh0YXJlYS52YWx1ZS5yZXBsYWNlKC9eXFx4MDErLywgXCJcIik7XG4gICAgICAgICAgICB3ICo9ICh0aGlzLnNlc3Npb24uJGdldFN0cmluZ1NjcmVlbldpZHRoKHZhbClbMF0gKyAyKTtcbiAgICAgICAgICAgIGggKz0gMjtcbiAgICAgICAgICAgIHBvc1RvcCAtPSAxO1xuICAgICAgICB9XG4gICAgICAgIHBvc0xlZnQgLT0gdGhpcy5zY3JvbGxMZWZ0O1xuICAgICAgICBpZiAocG9zTGVmdCA+IHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCAtIHcpXG4gICAgICAgICAgICBwb3NMZWZ0ID0gdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gdztcblxuICAgICAgICBwb3NMZWZ0IC09IHRoaXMuc2Nyb2xsQmFyVi53aWR0aDtcblxuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLmhlaWdodCA9IGggKyBcInB4XCI7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUud2lkdGggPSB3ICsgXCJweFwiO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLnJpZ2h0ID0gTWF0aC5tYXgoMCwgdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gcG9zTGVmdCAtIHcpICsgXCJweFwiO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLmJvdHRvbSA9IE1hdGgubWF4KDAsIHRoaXMuJHNpemUuaGVpZ2h0IC0gcG9zVG9wIC0gaCkgKyBcInB4XCI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogW1JldHVybnMgdGhlIGluZGV4IG9mIHRoZSBmaXJzdCB2aXNpYmxlIHJvdy5dezogI1ZpcnR1YWxSZW5kZXJlci5nZXRGaXJzdFZpc2libGVSb3d9XG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldEZpcnN0VmlzaWJsZVJvdygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3c7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGZpcnN0IGZ1bGx5IHZpc2libGUgcm93LiBcIkZ1bGx5XCIgaGVyZSBtZWFucyB0aGF0IHRoZSBjaGFyYWN0ZXJzIGluIHRoZSByb3cgYXJlIG5vdCB0cnVuY2F0ZWQ7IHRoYXQgdGhlIHRvcCBhbmQgdGhlIGJvdHRvbSBvZiB0aGUgcm93IGFyZSBvbiB0aGUgc2NyZWVuLlxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRGaXJzdEZ1bGx5VmlzaWJsZVJvdygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3cgKyAodGhpcy5sYXllckNvbmZpZy5vZmZzZXQgPT09IDAgPyAwIDogMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGxhc3QgZnVsbHkgdmlzaWJsZSByb3cuIFwiRnVsbHlcIiBoZXJlIG1lYW5zIHRoYXQgdGhlIGNoYXJhY3RlcnMgaW4gdGhlIHJvdyBhcmUgbm90IHRydW5jYXRlZDsgdGhhdCB0aGUgdG9wIGFuZCB0aGUgYm90dG9tIG9mIHRoZSByb3cgYXJlIG9uIHRoZSBzY3JlZW4uXG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldExhc3RGdWxseVZpc2libGVSb3coKSB7XG4gICAgICAgIHZhciBmbGludCA9IE1hdGguZmxvb3IoKHRoaXMubGF5ZXJDb25maWcuaGVpZ2h0ICsgdGhpcy5sYXllckNvbmZpZy5vZmZzZXQpIC8gdGhpcy5sYXllckNvbmZpZy5saW5lSGVpZ2h0KTtcbiAgICAgICAgcmV0dXJuIHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3cgLSAxICsgZmxpbnQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogW1JldHVybnMgdGhlIGluZGV4IG9mIHRoZSBsYXN0IHZpc2libGUgcm93Ll17OiAjVmlydHVhbFJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93fVxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRMYXN0VmlzaWJsZVJvdygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubGF5ZXJDb25maWcubGFzdFJvdztcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNldHMgdGhlIHBhZGRpbmcgZm9yIGFsbCB0aGUgbGF5ZXJzLlxuICAgICogQHBhcmFtIHtudW1iZXJ9IHBhZGRpbmcgQSBuZXcgcGFkZGluZyB2YWx1ZSAoaW4gcGl4ZWxzKVxuICAgICoqL1xuICAgIHNldFBhZGRpbmcocGFkZGluZzogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuJHBhZGRpbmcgPSBwYWRkaW5nO1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuc2V0UGFkZGluZyhwYWRkaW5nKTtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuc2V0UGFkZGluZyhwYWRkaW5nKTtcbiAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQuc2V0UGFkZGluZyhwYWRkaW5nKTtcbiAgICAgICAgdGhpcy4kbWFya2VyQmFjay5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICAgICAgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTtcbiAgICB9XG5cbiAgICBzZXRTY3JvbGxNYXJnaW4odG9wLCBib3R0b20sIGxlZnQsIHJpZ2h0KSB7XG4gICAgICAgIHZhciBzbSA9IHRoaXMuc2Nyb2xsTWFyZ2luO1xuICAgICAgICBzbS50b3AgPSB0b3AgfCAwO1xuICAgICAgICBzbS5ib3R0b20gPSBib3R0b20gfCAwO1xuICAgICAgICBzbS5yaWdodCA9IHJpZ2h0IHwgMDtcbiAgICAgICAgc20ubGVmdCA9IGxlZnQgfCAwO1xuICAgICAgICBzbS52ID0gc20udG9wICsgc20uYm90dG9tO1xuICAgICAgICBzbS5oID0gc20ubGVmdCArIHNtLnJpZ2h0O1xuICAgICAgICBpZiAoc20udG9wICYmIHRoaXMuc2Nyb2xsVG9wIDw9IDAgJiYgdGhpcy5zZXNzaW9uKVxuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcCgtc20udG9wKTtcbiAgICAgICAgdGhpcy51cGRhdGVGdWxsKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB3aGV0aGVyIHRoZSBob3Jpem9udGFsIHNjcm9sbGJhciBpcyBzZXQgdG8gYmUgYWx3YXlzIHZpc2libGUuXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlKCkge1xuICAgICAgICAvLyBGSVhNRVxuICAgICAgICByZXR1cm4gdGhpcy4kaFNjcm9sbEJhckFsd2F5c1Zpc2libGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyIG9yIG5vdC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFsd2F5c1Zpc2libGUgU2V0IHRvIGB0cnVlYCB0byBtYWtlIHRoZSBob3Jpem9udGFsIHNjcm9sbCBiYXIgdmlzaWJsZVxuICAgICAqKi9cbiAgICBzZXRIU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZShhbHdheXNWaXNpYmxlKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiaFNjcm9sbEJhckFsd2F5c1Zpc2libGVcIiwgYWx3YXlzVmlzaWJsZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB3aGV0aGVyIHRoZSB2ZXJ0aWNhbCBzY3JvbGxiYXIgaXMgc2V0IHRvIGJlIGFsd2F5cyB2aXNpYmxlLlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRWU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IHRoZSB2ZXJ0aWNhbCBzY3JvbGxiYXIgb3Igbm90LlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYWx3YXlzVmlzaWJsZSBTZXQgdG8gYHRydWVgIHRvIG1ha2UgdGhlIHZlcnRpY2FsIHNjcm9sbCBiYXIgdmlzaWJsZVxuICAgICAqL1xuICAgIHNldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlKGFsd2F5c1Zpc2libGUpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJ2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZVwiLCBhbHdheXNWaXNpYmxlKTtcbiAgICB9XG5cbiAgICAkdXBkYXRlU2Nyb2xsQmFyVigpIHtcbiAgICAgICAgdmFyIHNjcm9sbEhlaWdodCA9IHRoaXMubGF5ZXJDb25maWcubWF4SGVpZ2h0O1xuICAgICAgICB2YXIgc2Nyb2xsZXJIZWlnaHQgPSB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0O1xuICAgICAgICBpZiAoIXRoaXMuJG1heExpbmVzICYmIHRoaXMuJHNjcm9sbFBhc3RFbmQpIHtcbiAgICAgICAgICAgIHNjcm9sbEhlaWdodCAtPSAoc2Nyb2xsZXJIZWlnaHQgLSB0aGlzLmxpbmVIZWlnaHQpICogdGhpcy4kc2Nyb2xsUGFzdEVuZDtcbiAgICAgICAgICAgIGlmICh0aGlzLnNjcm9sbFRvcCA+IHNjcm9sbEhlaWdodCAtIHNjcm9sbGVySGVpZ2h0KSB7XG4gICAgICAgICAgICAgICAgc2Nyb2xsSGVpZ2h0ID0gdGhpcy5zY3JvbGxUb3AgKyBzY3JvbGxlckhlaWdodDtcbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2Nyb2xsVG9wID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2V0U2Nyb2xsSGVpZ2h0KHNjcm9sbEhlaWdodCArIHRoaXMuc2Nyb2xsTWFyZ2luLnYpO1xuICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2V0U2Nyb2xsVG9wKHRoaXMuc2Nyb2xsVG9wICsgdGhpcy5zY3JvbGxNYXJnaW4udG9wKTtcbiAgICB9XG5cbiAgICAkdXBkYXRlU2Nyb2xsQmFySCgpIHtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJILnNldFNjcm9sbFdpZHRoKHRoaXMubGF5ZXJDb25maWcud2lkdGggKyAyICogdGhpcy4kcGFkZGluZyArIHRoaXMuc2Nyb2xsTWFyZ2luLmgpO1xuICAgICAgICB0aGlzLnNjcm9sbEJhckguc2V0U2Nyb2xsTGVmdCh0aGlzLnNjcm9sbExlZnQgKyB0aGlzLnNjcm9sbE1hcmdpbi5sZWZ0KTtcbiAgICB9XG5cbiAgICBmcmVlemUoKSB7XG4gICAgICAgIHRoaXMuJGZyb3plbiA9IHRydWU7XG4gICAgfVxuXG4gICAgdW5mcmVlemUoKSB7XG4gICAgICAgIHRoaXMuJGZyb3plbiA9IGZhbHNlO1xuICAgIH1cblxuICAgICRyZW5kZXJDaGFuZ2VzKGNoYW5nZXMsIGZvcmNlKSB7XG4gICAgICAgIGlmICh0aGlzLiRjaGFuZ2VzKSB7XG4gICAgICAgICAgICBjaGFuZ2VzIHw9IHRoaXMuJGNoYW5nZXM7XG4gICAgICAgICAgICB0aGlzLiRjaGFuZ2VzID0gMDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoKCF0aGlzLnNlc3Npb24gfHwgIXRoaXMuY29udGFpbmVyLm9mZnNldFdpZHRoIHx8IHRoaXMuJGZyb3plbikgfHwgKCFjaGFuZ2VzICYmICFmb3JjZSkpIHtcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZXMgfD0gY2hhbmdlcztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy4kc2l6ZS4kZGlydHkpIHtcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZXMgfD0gY2hhbmdlcztcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm9uUmVzaXplKHRydWUpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghdGhpcy5saW5lSGVpZ2h0KSB7XG4gICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuY2hlY2tGb3JTaXplQ2hhbmdlcygpO1xuICAgICAgICB9XG4gICAgICAgIC8vIHRoaXMuJGxvZ0NoYW5nZXMoY2hhbmdlcyk7XG5cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiYmVmb3JlUmVuZGVyXCIpO1xuICAgICAgICB2YXIgY29uZmlnID0gdGhpcy5sYXllckNvbmZpZztcbiAgICAgICAgLy8gdGV4dCwgc2Nyb2xsaW5nIGFuZCByZXNpemUgY2hhbmdlcyBjYW4gY2F1c2UgdGhlIHZpZXcgcG9ydCBzaXplIHRvIGNoYW5nZVxuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9GVUxMIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX1NJWkUgfHxcbiAgICAgICAgICAgIGNoYW5nZXMgJiBDSEFOR0VfVEVYVCB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9MSU5FUyB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9TQ1JPTEwgfHxcbiAgICAgICAgICAgIGNoYW5nZXMgJiBDSEFOR0VfSF9TQ1JPTExcbiAgICAgICAgKSB7XG4gICAgICAgICAgICBjaGFuZ2VzIHw9IHRoaXMuJGNvbXB1dGVMYXllckNvbmZpZygpO1xuICAgICAgICAgICAgLy8gSWYgYSBjaGFuZ2UgaXMgbWFkZSBvZmZzY3JlZW4gYW5kIHdyYXBNb2RlIGlzIG9uLCB0aGVuIHRoZSBvbnNjcmVlblxuICAgICAgICAgICAgLy8gbGluZXMgbWF5IGhhdmUgYmVlbiBwdXNoZWQgZG93bi4gSWYgc28sIHRoZSBmaXJzdCBzY3JlZW4gcm93IHdpbGwgbm90XG4gICAgICAgICAgICAvLyBoYXZlIGNoYW5nZWQsIGJ1dCB0aGUgZmlyc3QgYWN0dWFsIHJvdyB3aWxsLiBJbiB0aGF0IGNhc2UsIGFkanVzdCBcbiAgICAgICAgICAgIC8vIHNjcm9sbFRvcCBzbyB0aGF0IHRoZSBjdXJzb3IgYW5kIG9uc2NyZWVuIGNvbnRlbnQgc3RheXMgaW4gdGhlIHNhbWUgcGxhY2UuXG4gICAgICAgICAgICBpZiAoY29uZmlnLmZpcnN0Um93ICE9IHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3cgJiYgY29uZmlnLmZpcnN0Um93U2NyZWVuID09IHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3dTY3JlZW4pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbFRvcCA9IHRoaXMuc2Nyb2xsVG9wICsgKGNvbmZpZy5maXJzdFJvdyAtIHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3cpICogdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICAgICAgICAgIGNoYW5nZXMgPSBjaGFuZ2VzIHwgQ0hBTkdFX1NDUk9MTDtcbiAgICAgICAgICAgICAgICBjaGFuZ2VzIHw9IHRoaXMuJGNvbXB1dGVMYXllckNvbmZpZygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uZmlnID0gdGhpcy5sYXllckNvbmZpZztcbiAgICAgICAgICAgIC8vIHVwZGF0ZSBzY3JvbGxiYXIgZmlyc3QgdG8gbm90IGxvc2Ugc2Nyb2xsIHBvc2l0aW9uIHdoZW4gZ3V0dGVyIGNhbGxzIHJlc2l6ZVxuICAgICAgICAgICAgdGhpcy4kdXBkYXRlU2Nyb2xsQmFyVigpO1xuICAgICAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfSF9TQ1JPTEwpXG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlU2Nyb2xsQmFySCgpO1xuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuZWxlbWVudC5zdHlsZS5tYXJnaW5Ub3AgPSAoLWNvbmZpZy5vZmZzZXQpICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLm1hcmdpblRvcCA9ICgtY29uZmlnLm9mZnNldCkgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUud2lkdGggPSBjb25maWcud2lkdGggKyAyICogdGhpcy4kcGFkZGluZyArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5oZWlnaHQgPSBjb25maWcubWluSGVpZ2h0ICsgXCJweFwiO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaG9yaXpvbnRhbCBzY3JvbGxpbmdcbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfSF9TQ1JPTEwpIHtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5tYXJnaW5MZWZ0ID0gLXRoaXMuc2Nyb2xsTGVmdCArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsZXIuY2xhc3NOYW1lID0gdGhpcy5zY3JvbGxMZWZ0IDw9IDAgPyBcImFjZV9zY3JvbGxlclwiIDogXCJhY2Vfc2Nyb2xsZXIgYWNlX3Njcm9sbC1sZWZ0XCI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBmdWxsXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0ZVTEwpIHtcbiAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIGlmICh0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyQmFjay51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckZyb250LnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgICAgICAgICAgdGhpcy4kaGlnaGxpZ2h0R3V0dGVyTGluZSAmJiB0aGlzLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0KCk7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJhZnRlclJlbmRlclwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHNjcm9sbGluZ1xuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9TQ1JPTEwpIHtcbiAgICAgICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX1RFWFQgfHwgY2hhbmdlcyAmIENIQU5HRV9MSU5FUylcbiAgICAgICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnNjcm9sbExpbmVzKGNvbmZpZyk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyQmFjay51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckZyb250LnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRoaWdobGlnaHRHdXR0ZXJMaW5lICYmIHRoaXMuJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQoKTtcbiAgICAgICAgICAgIHRoaXMuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJhZnRlclJlbmRlclwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX1RFWFQpIHtcbiAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIGlmICh0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoYW5nZXMgJiBDSEFOR0VfTElORVMpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiR1cGRhdGVMaW5lcygpIHx8IChjaGFuZ2VzICYgQ0hBTkdFX0dVVFRFUikgJiYgdGhpcy4kc2hvd0d1dHRlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaGFuZ2VzICYgQ0hBTkdFX1RFWFQgfHwgY2hhbmdlcyAmIENIQU5HRV9HVVRURVIpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfQ1VSU09SKSB7XG4gICAgICAgICAgICB0aGlzLiRjdXJzb3JMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgICAgICAgICB0aGlzLiRoaWdobGlnaHRHdXR0ZXJMaW5lICYmIHRoaXMuJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjaGFuZ2VzICYgKENIQU5HRV9NQVJLRVIgfCBDSEFOR0VfTUFSS0VSX0ZST05UKSkge1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2hhbmdlcyAmIChDSEFOR0VfTUFSS0VSIHwgQ0hBTkdFX01BUktFUl9CQUNLKSkge1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyQmFjay51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3NpZ25hbChcImFmdGVyUmVuZGVyXCIpO1xuICAgIH1cblxuICAgICRhdXRvc2l6ZSgpIHtcbiAgICAgICAgdmFyIGhlaWdodCA9IHRoaXMuc2Vzc2lvbi5nZXRTY3JlZW5MZW5ndGgoKSAqIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgdmFyIG1heEhlaWdodCA9IHRoaXMuJG1heExpbmVzICogdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgZGVzaXJlZEhlaWdodCA9IE1hdGgubWF4KFxuICAgICAgICAgICAgKHRoaXMuJG1pbkxpbmVzIHx8IDEpICogdGhpcy5saW5lSGVpZ2h0LFxuICAgICAgICAgICAgTWF0aC5taW4obWF4SGVpZ2h0LCBoZWlnaHQpXG4gICAgICAgICkgKyB0aGlzLnNjcm9sbE1hcmdpbi52ICsgKHRoaXMuJGV4dHJhSGVpZ2h0IHx8IDApO1xuICAgICAgICB2YXIgdlNjcm9sbCA9IGhlaWdodCA+IG1heEhlaWdodDtcblxuICAgICAgICBpZiAoZGVzaXJlZEhlaWdodCAhPSB0aGlzLmRlc2lyZWRIZWlnaHQgfHxcbiAgICAgICAgICAgIHRoaXMuJHNpemUuaGVpZ2h0ICE9IHRoaXMuZGVzaXJlZEhlaWdodCB8fCB2U2Nyb2xsICE9IHRoaXMuJHZTY3JvbGwpIHtcbiAgICAgICAgICAgIGlmICh2U2Nyb2xsICE9IHRoaXMuJHZTY3JvbGwpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiR2U2Nyb2xsID0gdlNjcm9sbDtcbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2V0VmlzaWJsZSh2U2Nyb2xsKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHcgPSB0aGlzLmNvbnRhaW5lci5jbGllbnRXaWR0aDtcbiAgICAgICAgICAgIHRoaXMuY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGRlc2lyZWRIZWlnaHQgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVDYWNoZWRTaXplKHRydWUsIHRoaXMuJGd1dHRlcldpZHRoLCB3LCBkZXNpcmVkSGVpZ2h0KTtcbiAgICAgICAgICAgIC8vIHRoaXMuJGxvb3AuY2hhbmdlcyA9IDA7XG4gICAgICAgICAgICB0aGlzLmRlc2lyZWRIZWlnaHQgPSBkZXNpcmVkSGVpZ2h0O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgJGNvbXB1dGVMYXllckNvbmZpZygpIHtcblxuICAgICAgICBpZiAodGhpcy4kbWF4TGluZXMgJiYgdGhpcy5saW5lSGVpZ2h0ID4gMSkge1xuICAgICAgICAgICAgdGhpcy4kYXV0b3NpemUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICB2YXIgc2l6ZSA9IHRoaXMuJHNpemU7XG5cbiAgICAgICAgdmFyIGhpZGVTY3JvbGxiYXJzID0gc2l6ZS5oZWlnaHQgPD0gMiAqIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgdmFyIHNjcmVlbkxpbmVzID0gdGhpcy5zZXNzaW9uLmdldFNjcmVlbkxlbmd0aCgpO1xuICAgICAgICB2YXIgbWF4SGVpZ2h0ID0gc2NyZWVuTGluZXMgKiB0aGlzLmxpbmVIZWlnaHQ7XG5cbiAgICAgICAgdmFyIG9mZnNldCA9IHRoaXMuc2Nyb2xsVG9wICUgdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgbWluSGVpZ2h0ID0gc2l6ZS5zY3JvbGxlckhlaWdodCArIHRoaXMubGluZUhlaWdodDtcblxuICAgICAgICB2YXIgbG9uZ2VzdExpbmUgPSB0aGlzLiRnZXRMb25nZXN0TGluZSgpO1xuXG4gICAgICAgIHZhciBob3JpelNjcm9sbCA9ICFoaWRlU2Nyb2xsYmFycyAmJiAodGhpcy4kaFNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHxcbiAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJXaWR0aCAtIGxvbmdlc3RMaW5lIC0gMiAqIHRoaXMuJHBhZGRpbmcgPCAwKTtcblxuICAgICAgICB2YXIgaFNjcm9sbENoYW5nZWQgPSB0aGlzLiRob3JpelNjcm9sbCAhPT0gaG9yaXpTY3JvbGw7XG4gICAgICAgIGlmIChoU2Nyb2xsQ2hhbmdlZCkge1xuICAgICAgICAgICAgdGhpcy4kaG9yaXpTY3JvbGwgPSBob3JpelNjcm9sbDtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFySC5zZXRWaXNpYmxlKGhvcml6U2Nyb2xsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy4kbWF4TGluZXMgJiYgdGhpcy4kc2Nyb2xsUGFzdEVuZCkge1xuICAgICAgICAgICAgbWF4SGVpZ2h0ICs9IChzaXplLnNjcm9sbGVySGVpZ2h0IC0gdGhpcy5saW5lSGVpZ2h0KSAqIHRoaXMuJHNjcm9sbFBhc3RFbmQ7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdlNjcm9sbCA9ICFoaWRlU2Nyb2xsYmFycyAmJiAodGhpcy4kdlNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHxcbiAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJIZWlnaHQgLSBtYXhIZWlnaHQgPCAwKTtcbiAgICAgICAgdmFyIHZTY3JvbGxDaGFuZ2VkID0gdGhpcy4kdlNjcm9sbCAhPT0gdlNjcm9sbDtcbiAgICAgICAgaWYgKHZTY3JvbGxDaGFuZ2VkKSB7XG4gICAgICAgICAgICB0aGlzLiR2U2Nyb2xsID0gdlNjcm9sbDtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zZXRWaXNpYmxlKHZTY3JvbGwpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChNYXRoLm1heCgtdGhpcy5zY3JvbGxNYXJnaW4udG9wLFxuICAgICAgICAgICAgTWF0aC5taW4odGhpcy5zY3JvbGxUb3AsIG1heEhlaWdodCAtIHNpemUuc2Nyb2xsZXJIZWlnaHQgKyB0aGlzLnNjcm9sbE1hcmdpbi5ib3R0b20pKSk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQoTWF0aC5tYXgoLXRoaXMuc2Nyb2xsTWFyZ2luLmxlZnQsIE1hdGgubWluKHRoaXMuc2Nyb2xsTGVmdCxcbiAgICAgICAgICAgIGxvbmdlc3RMaW5lICsgMiAqIHRoaXMuJHBhZGRpbmcgLSBzaXplLnNjcm9sbGVyV2lkdGggKyB0aGlzLnNjcm9sbE1hcmdpbi5yaWdodCkpKTtcblxuICAgICAgICB2YXIgbGluZUNvdW50ID0gTWF0aC5jZWlsKG1pbkhlaWdodCAvIHRoaXMubGluZUhlaWdodCkgLSAxO1xuICAgICAgICB2YXIgZmlyc3RSb3cgPSBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKCh0aGlzLnNjcm9sbFRvcCAtIG9mZnNldCkgLyB0aGlzLmxpbmVIZWlnaHQpKTtcbiAgICAgICAgdmFyIGxhc3RSb3cgPSBmaXJzdFJvdyArIGxpbmVDb3VudDtcblxuICAgICAgICAvLyBNYXAgbGluZXMgb24gdGhlIHNjcmVlbiB0byBsaW5lcyBpbiB0aGUgZG9jdW1lbnQuXG4gICAgICAgIHZhciBmaXJzdFJvd1NjcmVlbiwgZmlyc3RSb3dIZWlnaHQ7XG4gICAgICAgIHZhciBsaW5lSGVpZ2h0ID0gdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICBmaXJzdFJvdyA9IHNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFJvdyhmaXJzdFJvdywgMCk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgZmlyc3RSb3cgaXMgaW5zaWRlIG9mIGEgZm9sZExpbmUuIElmIHRydWUsIHRoZW4gdXNlIHRoZSBmaXJzdFxuICAgICAgICAvLyByb3cgb2YgdGhlIGZvbGRMaW5lLlxuICAgICAgICB2YXIgZm9sZExpbmUgPSBzZXNzaW9uLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICBmaXJzdFJvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgfVxuXG4gICAgICAgIGZpcnN0Um93U2NyZWVuID0gc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUm93KGZpcnN0Um93LCAwKTtcbiAgICAgICAgZmlyc3RSb3dIZWlnaHQgPSBzZXNzaW9uLmdldFJvd0xlbmd0aChmaXJzdFJvdykgKiBsaW5lSGVpZ2h0O1xuXG4gICAgICAgIGxhc3RSb3cgPSBNYXRoLm1pbihzZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRSb3cobGFzdFJvdywgMCksIHNlc3Npb24uZ2V0TGVuZ3RoKCkgLSAxKTtcbiAgICAgICAgbWluSGVpZ2h0ID0gc2l6ZS5zY3JvbGxlckhlaWdodCArIHNlc3Npb24uZ2V0Um93TGVuZ3RoKGxhc3RSb3cpICogbGluZUhlaWdodCArXG4gICAgICAgICAgICBmaXJzdFJvd0hlaWdodDtcblxuICAgICAgICBvZmZzZXQgPSB0aGlzLnNjcm9sbFRvcCAtIGZpcnN0Um93U2NyZWVuICogbGluZUhlaWdodDtcblxuICAgICAgICB2YXIgY2hhbmdlcyA9IDA7XG4gICAgICAgIGlmICh0aGlzLmxheWVyQ29uZmlnLndpZHRoICE9IGxvbmdlc3RMaW5lKVxuICAgICAgICAgICAgY2hhbmdlcyA9IENIQU5HRV9IX1NDUk9MTDtcbiAgICAgICAgLy8gSG9yaXpvbnRhbCBzY3JvbGxiYXIgdmlzaWJpbGl0eSBtYXkgaGF2ZSBjaGFuZ2VkLCB3aGljaCBjaGFuZ2VzXG4gICAgICAgIC8vIHRoZSBjbGllbnQgaGVpZ2h0IG9mIHRoZSBzY3JvbGxlclxuICAgICAgICBpZiAoaFNjcm9sbENoYW5nZWQgfHwgdlNjcm9sbENoYW5nZWQpIHtcbiAgICAgICAgICAgIGNoYW5nZXMgPSB0aGlzLiR1cGRhdGVDYWNoZWRTaXplKHRydWUsIHRoaXMuZ3V0dGVyV2lkdGgsIHNpemUud2lkdGgsIHNpemUuaGVpZ2h0KTtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcInNjcm9sbGJhclZpc2liaWxpdHlDaGFuZ2VkXCIpO1xuICAgICAgICAgICAgaWYgKHZTY3JvbGxDaGFuZ2VkKVxuICAgICAgICAgICAgICAgIGxvbmdlc3RMaW5lID0gdGhpcy4kZ2V0TG9uZ2VzdExpbmUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubGF5ZXJDb25maWcgPSB7XG4gICAgICAgICAgICB3aWR0aDogbG9uZ2VzdExpbmUsXG4gICAgICAgICAgICBwYWRkaW5nOiB0aGlzLiRwYWRkaW5nLFxuICAgICAgICAgICAgZmlyc3RSb3c6IGZpcnN0Um93LFxuICAgICAgICAgICAgZmlyc3RSb3dTY3JlZW46IGZpcnN0Um93U2NyZWVuLFxuICAgICAgICAgICAgbGFzdFJvdzogbGFzdFJvdyxcbiAgICAgICAgICAgIGxpbmVIZWlnaHQ6IGxpbmVIZWlnaHQsXG4gICAgICAgICAgICBjaGFyYWN0ZXJXaWR0aDogdGhpcy5jaGFyYWN0ZXJXaWR0aCxcbiAgICAgICAgICAgIG1pbkhlaWdodDogbWluSGVpZ2h0LFxuICAgICAgICAgICAgbWF4SGVpZ2h0OiBtYXhIZWlnaHQsXG4gICAgICAgICAgICBvZmZzZXQ6IG9mZnNldCxcbiAgICAgICAgICAgIGd1dHRlck9mZnNldDogTWF0aC5tYXgoMCwgTWF0aC5jZWlsKChvZmZzZXQgKyBzaXplLmhlaWdodCAtIHNpemUuc2Nyb2xsZXJIZWlnaHQpIC8gbGluZUhlaWdodCkpLFxuICAgICAgICAgICAgaGVpZ2h0OiB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0XG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIGNoYW5nZXM7XG4gICAgfVxuXG4gICAgJHVwZGF0ZUxpbmVzKCkge1xuICAgICAgICB2YXIgZmlyc3RSb3cgPSB0aGlzLiRjaGFuZ2VkTGluZXMuZmlyc3RSb3c7XG4gICAgICAgIHZhciBsYXN0Um93ID0gdGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3c7XG4gICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcyA9IG51bGw7XG5cbiAgICAgICAgdmFyIGxheWVyQ29uZmlnID0gdGhpcy5sYXllckNvbmZpZztcblxuICAgICAgICBpZiAoZmlyc3RSb3cgPiBsYXllckNvbmZpZy5sYXN0Um93ICsgMSkgeyByZXR1cm47IH1cbiAgICAgICAgaWYgKGxhc3RSb3cgPCBsYXllckNvbmZpZy5maXJzdFJvdykgeyByZXR1cm47IH1cblxuICAgICAgICAvLyBpZiB0aGUgbGFzdCByb3cgaXMgdW5rbm93biAtPiByZWRyYXcgZXZlcnl0aGluZ1xuICAgICAgICBpZiAobGFzdFJvdyA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShsYXllckNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIudXBkYXRlKGxheWVyQ29uZmlnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGVsc2UgdXBkYXRlIG9ubHkgdGhlIGNoYW5nZWQgcm93c1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIudXBkYXRlTGluZXMobGF5ZXJDb25maWcsIGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgJGdldExvbmdlc3RMaW5lKCk6IG51bWJlciB7XG4gICAgICAgIHZhciBjaGFyQ291bnQgPSB0aGlzLnNlc3Npb24uZ2V0U2NyZWVuV2lkdGgoKTtcbiAgICAgICAgaWYgKHRoaXMuc2hvd0ludmlzaWJsZXMgJiYgIXRoaXMuc2Vzc2lvbi4kdXNlV3JhcE1vZGUpXG4gICAgICAgICAgICBjaGFyQ291bnQgKz0gMTtcblxuICAgICAgICByZXR1cm4gTWF0aC5tYXgodGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gMiAqIHRoaXMuJHBhZGRpbmcsIE1hdGgucm91bmQoY2hhckNvdW50ICogdGhpcy5jaGFyYWN0ZXJXaWR0aCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFNjaGVkdWxlcyBhbiB1cGRhdGUgdG8gYWxsIHRoZSBmcm9udCBtYXJrZXJzIGluIHRoZSBkb2N1bWVudC5cbiAgICAqKi9cbiAgICB1cGRhdGVGcm9udE1hcmtlcnMoKSB7XG4gICAgICAgIHRoaXMuJG1hcmtlckZyb250LnNldE1hcmtlcnModGhpcy5zZXNzaW9uLmdldE1hcmtlcnModHJ1ZSkpO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9NQVJLRVJfRlJPTlQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFNjaGVkdWxlcyBhbiB1cGRhdGUgdG8gYWxsIHRoZSBiYWNrIG1hcmtlcnMgaW4gdGhlIGRvY3VtZW50LlxuICAgICoqL1xuICAgIHVwZGF0ZUJhY2tNYXJrZXJzKCkge1xuICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnNldE1hcmtlcnModGhpcy5zZXNzaW9uLmdldE1hcmtlcnMoZmFsc2UpKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfTUFSS0VSX0JBQ0spO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJlZHJhdyBicmVha3BvaW50cy5cbiAgICAqKi9cbiAgICB1cGRhdGVCcmVha3BvaW50cygpIHtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfR1VUVEVSKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBTZXRzIGFubm90YXRpb25zIGZvciB0aGUgZ3V0dGVyLlxuICAgICogQHBhcmFtIHtBcnJheX0gYW5ub3RhdGlvbnMgQW4gYXJyYXkgY29udGFpbmluZyBhbm5vdGF0aW9uc1xuICAgICoqL1xuICAgIHNldEFubm90YXRpb25zKGFubm90YXRpb25zKSB7XG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnNldEFubm90YXRpb25zKGFubm90YXRpb25zKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfR1VUVEVSKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBVcGRhdGVzIHRoZSBjdXJzb3IgaWNvbi5cbiAgICAqKi9cbiAgICB1cGRhdGVDdXJzb3IoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0NVUlNPUik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogSGlkZXMgdGhlIGN1cnNvciBpY29uLlxuICAgICoqL1xuICAgIGhpZGVDdXJzb3IoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLmhpZGVDdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBTaG93cyB0aGUgY3Vyc29yIGljb24uXG4gICAgKiovXG4gICAgc2hvd0N1cnNvcigpIHtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuc2hvd0N1cnNvcigpO1xuICAgIH1cblxuICAgIHNjcm9sbFNlbGVjdGlvbkludG9WaWV3KGFuY2hvciwgbGVhZCwgb2Zmc2V0Pykge1xuICAgICAgICAvLyBmaXJzdCBzY3JvbGwgYW5jaG9yIGludG8gdmlldyB0aGVuIHNjcm9sbCBsZWFkIGludG8gdmlld1xuICAgICAgICB0aGlzLnNjcm9sbEN1cnNvckludG9WaWV3KGFuY2hvciwgb2Zmc2V0KTtcbiAgICAgICAgdGhpcy5zY3JvbGxDdXJzb3JJbnRvVmlldyhsZWFkLCBvZmZzZXQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFNjcm9sbHMgdGhlIGN1cnNvciBpbnRvIHRoZSBmaXJzdCB2aXNpYmlsZSBhcmVhIG9mIHRoZSBlZGl0b3JcbiAgICAqKi9cbiAgICBzY3JvbGxDdXJzb3JJbnRvVmlldyhjdXJzb3I/LCBvZmZzZXQ/LCAkdmlld01hcmdpbj8pIHtcbiAgICAgICAgLy8gdGhlIGVkaXRvciBpcyBub3QgdmlzaWJsZVxuICAgICAgICBpZiAodGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCA9PT0gMClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuZ2V0UGl4ZWxQb3NpdGlvbihjdXJzb3IpO1xuXG4gICAgICAgIHZhciBsZWZ0ID0gcG9zLmxlZnQ7XG4gICAgICAgIHZhciB0b3AgPSBwb3MudG9wO1xuXG4gICAgICAgIHZhciB0b3BNYXJnaW4gPSAkdmlld01hcmdpbiAmJiAkdmlld01hcmdpbi50b3AgfHwgMDtcbiAgICAgICAgdmFyIGJvdHRvbU1hcmdpbiA9ICR2aWV3TWFyZ2luICYmICR2aWV3TWFyZ2luLmJvdHRvbSB8fCAwO1xuXG4gICAgICAgIHZhciBzY3JvbGxUb3AgPSB0aGlzLiRzY3JvbGxBbmltYXRpb24gPyB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgOiB0aGlzLnNjcm9sbFRvcDtcblxuICAgICAgICBpZiAoc2Nyb2xsVG9wICsgdG9wTWFyZ2luID4gdG9wKSB7XG4gICAgICAgICAgICBpZiAob2Zmc2V0KVxuICAgICAgICAgICAgICAgIHRvcCAtPSBvZmZzZXQgKiB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0O1xuICAgICAgICAgICAgaWYgKHRvcCA9PT0gMClcbiAgICAgICAgICAgICAgICB0b3AgPSAtdGhpcy5zY3JvbGxNYXJnaW4udG9wO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcCh0b3ApO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNjcm9sbFRvcCArIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgLSBib3R0b21NYXJnaW4gPCB0b3AgKyB0aGlzLmxpbmVIZWlnaHQpIHtcbiAgICAgICAgICAgIGlmIChvZmZzZXQpXG4gICAgICAgICAgICAgICAgdG9wICs9IG9mZnNldCAqIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHRvcCArIHRoaXMubGluZUhlaWdodCAtIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHNjcm9sbExlZnQgPSB0aGlzLnNjcm9sbExlZnQ7XG5cbiAgICAgICAgaWYgKHNjcm9sbExlZnQgPiBsZWZ0KSB7XG4gICAgICAgICAgICBpZiAobGVmdCA8IHRoaXMuJHBhZGRpbmcgKyAyICogdGhpcy5sYXllckNvbmZpZy5jaGFyYWN0ZXJXaWR0aClcbiAgICAgICAgICAgICAgICBsZWZ0ID0gLXRoaXMuc2Nyb2xsTWFyZ2luLmxlZnQ7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdChsZWZ0KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzY3JvbGxMZWZ0ICsgdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIDwgbGVmdCArIHRoaXMuY2hhcmFjdGVyV2lkdGgpIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KE1hdGgucm91bmQobGVmdCArIHRoaXMuY2hhcmFjdGVyV2lkdGggLSB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGgpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzY3JvbGxMZWZ0IDw9IHRoaXMuJHBhZGRpbmcgJiYgbGVmdCAtIHNjcm9sbExlZnQgPCB0aGlzLmNoYXJhY3RlcldpZHRoKSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdCgwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogezpFZGl0U2Vzc2lvbi5nZXRTY3JvbGxUb3B9XG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRTY3JvbGxUb3BcbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0U2Nyb2xsVG9wKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiB7OkVkaXRTZXNzaW9uLmdldFNjcm9sbExlZnR9XG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRTY3JvbGxMZWZ0XG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldFNjcm9sbExlZnQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxMZWZ0KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgZmlyc3QgdmlzaWJsZSByb3csIHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciBpdCdzIGZ1bGx5IHZpc2libGUgb3Igbm90LlxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxUb3BSb3coKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Nyb2xsVG9wIC8gdGhpcy5saW5lSGVpZ2h0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGxhc3QgdmlzaWJsZSByb3csIHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciBpdCdzIGZ1bGx5IHZpc2libGUgb3Igbm90LlxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxCb3R0b21Sb3coKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIE1hdGgubWF4KDAsIE1hdGguZmxvb3IoKHRoaXMuc2Nyb2xsVG9wICsgdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCkgLyB0aGlzLmxpbmVIZWlnaHQpIC0gMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBHcmFjZWZ1bGx5IHNjcm9sbHMgZnJvbSB0aGUgdG9wIG9mIHRoZSBlZGl0b3IgdG8gdGhlIHJvdyBpbmRpY2F0ZWQuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IEEgcm93IGlkXG4gICAgKlxuICAgICpcbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLnNldFNjcm9sbFRvcFxuICAgICoqL1xuICAgIHNjcm9sbFRvUm93KHJvdzogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3Aocm93ICogdGhpcy5saW5lSGVpZ2h0KTtcbiAgICB9XG5cbiAgICBhbGlnbkN1cnNvcihjdXJzb3IsIGFsaWdubWVudCkge1xuICAgICAgICBpZiAodHlwZW9mIGN1cnNvciA9PSBcIm51bWJlclwiKVxuICAgICAgICAgICAgY3Vyc29yID0geyByb3c6IGN1cnNvciwgY29sdW1uOiAwIH07XG5cbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuJGN1cnNvckxheWVyLmdldFBpeGVsUG9zaXRpb24oY3Vyc29yKTtcbiAgICAgICAgdmFyIGggPSB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0IC0gdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgb2Zmc2V0ID0gcG9zLnRvcCAtIGggKiAoYWxpZ25tZW50IHx8IDApO1xuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3Aob2Zmc2V0KTtcbiAgICAgICAgcmV0dXJuIG9mZnNldDtcbiAgICB9XG5cbiAgICAkY2FsY1N0ZXBzKGZyb21WYWx1ZTogbnVtYmVyLCB0b1ZhbHVlOiBudW1iZXIpOiBudW1iZXJbXSB7XG4gICAgICAgIHZhciBpOiBudW1iZXIgPSAwO1xuICAgICAgICB2YXIgbDogbnVtYmVyID0gdGhpcy5TVEVQUztcbiAgICAgICAgdmFyIHN0ZXBzOiBudW1iZXJbXSA9IFtdO1xuXG4gICAgICAgIHZhciBmdW5jID0gZnVuY3Rpb24odDogbnVtYmVyLCB4X21pbjogbnVtYmVyLCBkeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgICAgIHJldHVybiBkeCAqIChNYXRoLnBvdyh0IC0gMSwgMykgKyAxKSArIHhfbWluO1xuICAgICAgICB9O1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBsOyArK2kpIHtcbiAgICAgICAgICAgIHN0ZXBzLnB1c2goZnVuYyhpIC8gdGhpcy5TVEVQUywgZnJvbVZhbHVlLCB0b1ZhbHVlIC0gZnJvbVZhbHVlKSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc3RlcHM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR3JhY2VmdWxseSBzY3JvbGxzIHRoZSBlZGl0b3IgdG8gdGhlIHJvdyBpbmRpY2F0ZWQuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGxpbmUgQSBsaW5lIG51bWJlclxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gY2VudGVyIElmIGB0cnVlYCwgY2VudGVycyB0aGUgZWRpdG9yIHRoZSB0byBpbmRpY2F0ZWQgbGluZVxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYW5pbWF0ZSBJZiBgdHJ1ZWAgYW5pbWF0ZXMgc2Nyb2xsaW5nXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgRnVuY3Rpb24gdG8gYmUgY2FsbGVkIGFmdGVyIHRoZSBhbmltYXRpb24gaGFzIGZpbmlzaGVkXG4gICAgICovXG4gICAgc2Nyb2xsVG9MaW5lKGxpbmU6IG51bWJlciwgY2VudGVyOiBib29sZWFuLCBhbmltYXRlOiBib29sZWFuLCBjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuZ2V0UGl4ZWxQb3NpdGlvbih7IHJvdzogbGluZSwgY29sdW1uOiAwIH0pO1xuICAgICAgICB2YXIgb2Zmc2V0ID0gcG9zLnRvcDtcbiAgICAgICAgaWYgKGNlbnRlcikge1xuICAgICAgICAgICAgb2Zmc2V0IC09IHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgLyAyO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGluaXRpYWxTY3JvbGwgPSB0aGlzLnNjcm9sbFRvcDtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChvZmZzZXQpO1xuICAgICAgICBpZiAoYW5pbWF0ZSAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHRoaXMuYW5pbWF0ZVNjcm9sbGluZyhpbml0aWFsU2Nyb2xsLCBjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhbmltYXRlU2Nyb2xsaW5nKGZyb21WYWx1ZTogbnVtYmVyLCBjYWxsYmFjaz8pIHtcbiAgICAgICAgdmFyIHRvVmFsdWUgPSB0aGlzLnNjcm9sbFRvcDtcbiAgICAgICAgaWYgKCF0aGlzLiRhbmltYXRlZFNjcm9sbCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgaWYgKGZyb21WYWx1ZSA9PSB0b1ZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmICh0aGlzLiRzY3JvbGxBbmltYXRpb24pIHtcbiAgICAgICAgICAgIHZhciBvbGRTdGVwcyA9IHRoaXMuJHNjcm9sbEFuaW1hdGlvbi5zdGVwcztcbiAgICAgICAgICAgIGlmIChvbGRTdGVwcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBmcm9tVmFsdWUgPSBvbGRTdGVwc1swXTtcbiAgICAgICAgICAgICAgICBpZiAoZnJvbVZhbHVlID09IHRvVmFsdWUpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzdGVwcyA9IF9zZWxmLiRjYWxjU3RlcHMoZnJvbVZhbHVlLCB0b1ZhbHVlKTtcbiAgICAgICAgdGhpcy4kc2Nyb2xsQW5pbWF0aW9uID0geyBmcm9tOiBmcm9tVmFsdWUsIHRvOiB0b1ZhbHVlLCBzdGVwczogc3RlcHMgfTtcblxuICAgICAgICBjbGVhckludGVydmFsKHRoaXMuJHRpbWVyKTtcblxuICAgICAgICBfc2VsZi5zZXNzaW9uLnNldFNjcm9sbFRvcChzdGVwcy5zaGlmdCgpKTtcbiAgICAgICAgLy8gdHJpY2sgc2Vzc2lvbiB0byB0aGluayBpdCdzIGFscmVhZHkgc2Nyb2xsZWQgdG8gbm90IGxvb3NlIHRvVmFsdWVcbiAgICAgICAgX3NlbGYuc2Vzc2lvbi4kc2Nyb2xsVG9wID0gdG9WYWx1ZTtcbiAgICAgICAgdGhpcy4kdGltZXIgPSBzZXRJbnRlcnZhbChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmIChzdGVwcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXNzaW9uLnNldFNjcm9sbFRvcChzdGVwcy5zaGlmdCgpKTtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXNzaW9uLiRzY3JvbGxUb3AgPSB0b1ZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0b1ZhbHVlICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXNzaW9uLiRzY3JvbGxUb3AgPSAtMTtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXNzaW9uLnNldFNjcm9sbFRvcCh0b1ZhbHVlKTtcbiAgICAgICAgICAgICAgICB0b1ZhbHVlID0gbnVsbDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gZG8gdGhpcyBvbiBzZXBhcmF0ZSBzdGVwIHRvIG5vdCBnZXQgc3B1cmlvdXMgc2Nyb2xsIGV2ZW50IGZyb20gc2Nyb2xsYmFyXG4gICAgICAgICAgICAgICAgX3NlbGYuJHRpbWVyID0gY2xlYXJJbnRlcnZhbChfc2VsZi4kdGltZXIpO1xuICAgICAgICAgICAgICAgIF9zZWxmLiRzY3JvbGxBbmltYXRpb24gPSBudWxsO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIDEwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRoZSBlZGl0b3IgdG8gdGhlIHkgcGl4ZWwgaW5kaWNhdGVkLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JvbGxUb3AgVGhlIHBvc2l0aW9uIHRvIHNjcm9sbCB0b1xuICAgICAqL1xuICAgIHNjcm9sbFRvWShzY3JvbGxUb3A6IG51bWJlcik6IHZvaWQge1xuICAgICAgICAvLyBhZnRlciBjYWxsaW5nIHNjcm9sbEJhci5zZXRTY3JvbGxUb3BcbiAgICAgICAgLy8gc2Nyb2xsYmFyIHNlbmRzIHVzIGV2ZW50IHdpdGggc2FtZSBzY3JvbGxUb3AuIGlnbm9yZSBpdFxuICAgICAgICBpZiAodGhpcy5zY3JvbGxUb3AgIT09IHNjcm9sbFRvcCkge1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxUb3AgPSBzY3JvbGxUb3A7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9TQ1JPTEwpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xscyB0aGUgZWRpdG9yIGFjcm9zcyB0aGUgeC1heGlzIHRvIHRoZSBwaXhlbCBpbmRpY2F0ZWQuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHNjcm9sbExlZnQgVGhlIHBvc2l0aW9uIHRvIHNjcm9sbCB0b1xuICAgICAqKi9cbiAgICBzY3JvbGxUb1goc2Nyb2xsTGVmdDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLnNjcm9sbExlZnQgIT09IHNjcm9sbExlZnQpIHtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsTGVmdCA9IHNjcm9sbExlZnQ7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9IX1NDUk9MTCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNjcm9sbHMgdGhlIGVkaXRvciBhY3Jvc3MgYm90aCB4LSBhbmQgeS1heGVzLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHggVGhlIHggdmFsdWUgdG8gc2Nyb2xsIHRvXG4gICAgKiBAcGFyYW0ge051bWJlcn0geSBUaGUgeSB2YWx1ZSB0byBzY3JvbGwgdG9cbiAgICAqKi9cbiAgICBzY3JvbGxUbyh4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHkpO1xuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdCh5KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNjcm9sbHMgdGhlIGVkaXRvciBhY3Jvc3MgYm90aCB4LSBhbmQgeS1heGVzLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlbHRhWCBUaGUgeCB2YWx1ZSB0byBzY3JvbGwgYnlcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkZWx0YVkgVGhlIHkgdmFsdWUgdG8gc2Nyb2xsIGJ5XG4gICAgKiovXG4gICAgc2Nyb2xsQnkoZGVsdGFYOiBudW1iZXIsIGRlbHRhWTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGRlbHRhWSAmJiB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSArIGRlbHRhWSk7XG4gICAgICAgIGRlbHRhWCAmJiB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdCh0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpICsgZGVsdGFYKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYHRydWVgIGlmIHlvdSBjYW4gc3RpbGwgc2Nyb2xsIGJ5IGVpdGhlciBwYXJhbWV0ZXI7IGluIG90aGVyIHdvcmRzLCB5b3UgaGF2ZW4ndCByZWFjaGVkIHRoZSBlbmQgb2YgdGhlIGZpbGUgb3IgbGluZS5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkZWx0YVggVGhlIHggdmFsdWUgdG8gc2Nyb2xsIGJ5XG4gICAgKiBAcGFyYW0ge051bWJlcn0gZGVsdGFZIFRoZSB5IHZhbHVlIHRvIHNjcm9sbCBieVxuICAgICpcbiAgICAqXG4gICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAqKi9cbiAgICBpc1Njcm9sbGFibGVCeShkZWx0YVg6IG51bWJlciwgZGVsdGFZOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgaWYgKGRlbHRhWSA8IDAgJiYgdGhpcy5zZXNzaW9uLmdldFNjcm9sbFRvcCgpID49IDEgLSB0aGlzLnNjcm9sbE1hcmdpbi50b3ApXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgaWYgKGRlbHRhWSA+IDAgJiYgdGhpcy5zZXNzaW9uLmdldFNjcm9sbFRvcCgpICsgdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodFxuICAgICAgICAgICAgLSB0aGlzLmxheWVyQ29uZmlnLm1heEhlaWdodCA8IC0xICsgdGhpcy5zY3JvbGxNYXJnaW4uYm90dG9tKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGlmIChkZWx0YVggPCAwICYmIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxMZWZ0KCkgPj0gMSAtIHRoaXMuc2Nyb2xsTWFyZ2luLmxlZnQpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgaWYgKGRlbHRhWCA+IDAgJiYgdGhpcy5zZXNzaW9uLmdldFNjcm9sbExlZnQoKSArIHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aFxuICAgICAgICAgICAgLSB0aGlzLmxheWVyQ29uZmlnLndpZHRoIDwgLTEgKyB0aGlzLnNjcm9sbE1hcmdpbi5yaWdodClcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHBpeGVsVG9TY3JlZW5Db29yZGluYXRlcyh4OiBudW1iZXIsIHk6IG51bWJlcikge1xuICAgICAgICB2YXIgY2FudmFzUG9zID0gdGhpcy5zY3JvbGxlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblxuICAgICAgICB2YXIgb2Zmc2V0ID0gKHggKyB0aGlzLnNjcm9sbExlZnQgLSBjYW52YXNQb3MubGVmdCAtIHRoaXMuJHBhZGRpbmcpIC8gdGhpcy5jaGFyYWN0ZXJXaWR0aDtcbiAgICAgICAgdmFyIHJvdyA9IE1hdGguZmxvb3IoKHkgKyB0aGlzLnNjcm9sbFRvcCAtIGNhbnZhc1Bvcy50b3ApIC8gdGhpcy5saW5lSGVpZ2h0KTtcbiAgICAgICAgdmFyIGNvbCA9IE1hdGgucm91bmQob2Zmc2V0KTtcblxuICAgICAgICByZXR1cm4geyByb3c6IHJvdywgY29sdW1uOiBjb2wsIHNpZGU6IG9mZnNldCAtIGNvbCA+IDAgPyAxIDogLTEgfTtcbiAgICB9XG5cbiAgICBzY3JlZW5Ub1RleHRDb29yZGluYXRlcyhjbGllbnRYOiBudW1iZXIsIGNsaWVudFk6IG51bWJlcikge1xuICAgICAgICB2YXIgY2FudmFzUG9zID0gdGhpcy5zY3JvbGxlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblxuICAgICAgICB2YXIgY29sdW1uID0gTWF0aC5yb3VuZCgoY2xpZW50WCArIHRoaXMuc2Nyb2xsTGVmdCAtIGNhbnZhc1Bvcy5sZWZ0IC0gdGhpcy4kcGFkZGluZykgLyB0aGlzLmNoYXJhY3RlcldpZHRoKTtcblxuICAgICAgICB2YXIgcm93ID0gKGNsaWVudFkgKyB0aGlzLnNjcm9sbFRvcCAtIGNhbnZhc1Bvcy50b3ApIC8gdGhpcy5saW5lSGVpZ2h0O1xuXG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHJvdywgTWF0aC5tYXgoY29sdW1uLCAwKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBgcGFnZVhgIGFuZCBgcGFnZVlgIGNvb3JkaW5hdGVzIG9mIHRoZSBkb2N1bWVudCBwb3NpdGlvbi5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIGRvY3VtZW50IHJvdyBwb3NpdGlvblxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgZG9jdW1lbnQgY29sdW1uIHBvc2l0aW9uXG4gICAgKiBAcmV0dXJucyB7T2JqZWN0fVxuICAgICoqL1xuICAgIHRleHRUb1NjcmVlbkNvb3JkaW5hdGVzKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHsgcGFnZVg6IG51bWJlcjsgcGFnZVk6IG51bWJlciB9IHtcbiAgICAgICAgdmFyIGNhbnZhc1BvcyA9IHRoaXMuc2Nyb2xsZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLnNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKHJvdywgY29sdW1uKTtcblxuICAgICAgICB2YXIgeCA9IHRoaXMuJHBhZGRpbmcgKyBNYXRoLnJvdW5kKHBvcy5jb2x1bW4gKiB0aGlzLmNoYXJhY3RlcldpZHRoKTtcbiAgICAgICAgdmFyIHkgPSBwb3Mucm93ICogdGhpcy5saW5lSGVpZ2h0O1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBwYWdlWDogY2FudmFzUG9zLmxlZnQgKyB4IC0gdGhpcy5zY3JvbGxMZWZ0LFxuICAgICAgICAgICAgcGFnZVk6IGNhbnZhc1Bvcy50b3AgKyB5IC0gdGhpcy5zY3JvbGxUb3BcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBGb2N1c2VzIHRoZSBjdXJyZW50IGNvbnRhaW5lci5cbiAgICAqKi9cbiAgICB2aXN1YWxpemVGb2N1cygpIHtcbiAgICAgICAgYWRkQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIFwiYWNlX2ZvY3VzXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIEJsdXJzIHRoZSBjdXJyZW50IGNvbnRhaW5lci5cbiAgICAqKi9cbiAgICB2aXN1YWxpemVCbHVyKCkge1xuICAgICAgICByZW1vdmVDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgXCJhY2VfZm9jdXNcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBzaG93Q29tcG9zaXRpb25cbiAgICAgKiBAcGFyYW0gcG9zaXRpb25cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHNob3dDb21wb3NpdGlvbihwb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSkge1xuICAgICAgICBpZiAoIXRoaXMuJGNvbXBvc2l0aW9uKVxuICAgICAgICAgICAgdGhpcy4kY29tcG9zaXRpb24gPSB7XG4gICAgICAgICAgICAgICAga2VlcFRleHRBcmVhQXRDdXJzb3I6IHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yLFxuICAgICAgICAgICAgICAgIGNzc1RleHQ6IHRoaXMudGV4dGFyZWEuc3R5bGUuY3NzVGV4dFxuICAgICAgICAgICAgfTtcblxuICAgICAgICB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IHRydWU7XG4gICAgICAgIGFkZENzc0NsYXNzKHRoaXMudGV4dGFyZWEsIFwiYWNlX2NvbXBvc2l0aW9uXCIpO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLmNzc1RleHQgPSBcIlwiO1xuICAgICAgICB0aGlzLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IEEgc3RyaW5nIG9mIHRleHQgdG8gdXNlXG4gICAgICpcbiAgICAgKiBTZXRzIHRoZSBpbm5lciB0ZXh0IG9mIHRoZSBjdXJyZW50IGNvbXBvc2l0aW9uIHRvIGB0ZXh0YC5cbiAgICAgKi9cbiAgICBzZXRDb21wb3NpdGlvblRleHQodGV4dD86IHN0cmluZyk6IHZvaWQge1xuICAgICAgICAvLyBUT0RPOiBXaHkgaXMgdGhlIHBhcmFtZXRlciBub3QgdXNlZD9cbiAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBIaWRlcyB0aGUgY3VycmVudCBjb21wb3NpdGlvbi5cbiAgICAgKi9cbiAgICBoaWRlQ29tcG9zaXRpb24oKSB7XG4gICAgICAgIGlmICghdGhpcy4kY29tcG9zaXRpb24pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlbW92ZUNzc0NsYXNzKHRoaXMudGV4dGFyZWEsIFwiYWNlX2NvbXBvc2l0aW9uXCIpO1xuICAgICAgICB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IHRoaXMuJGNvbXBvc2l0aW9uLmtlZXBUZXh0QXJlYUF0Q3Vyc29yO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLmNzc1RleHQgPSB0aGlzLiRjb21wb3NpdGlvbi5jc3NUZXh0O1xuICAgICAgICB0aGlzLiRjb21wb3NpdGlvbiA9IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBhIG5ldyB0aGVtZSBmb3IgdGhlIGVkaXRvci5cbiAgICAgKiBgdGhlbWVgIHNob3VsZCBleGlzdCwgYW5kIGJlIGEgZGlyZWN0b3J5IHBhdGgsIGxpa2UgYGFjZS90aGVtZS90ZXh0bWF0ZWAuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHRoZW1lIFRoZSBwYXRoIHRvIGEgdGhlbWVcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYiBvcHRpb25hbCBjYWxsYmFja1xuICAgICAqL1xuICAgIHNldFRoZW1lKHRoZW1lOiBhbnksIGNiPzogKCkgPT4gYW55KTogdm9pZCB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiVmlydHVhbFJlbmRlcmVyIHNldFRoZW1lLCB0aGVtZSA9IFwiICsgdGhlbWUpXG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuJHRoZW1lSWQgPSB0aGVtZTtcbiAgICAgICAgX3NlbGYuX2Rpc3BhdGNoRXZlbnQoJ3RoZW1lQ2hhbmdlJywgeyB0aGVtZTogdGhlbWUgfSk7XG5cbiAgICAgICAgaWYgKCF0aGVtZSB8fCB0eXBlb2YgdGhlbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHZhciBtb2R1bGVOYW1lID0gdGhlbWUgfHwgdGhpcy5nZXRPcHRpb24oXCJ0aGVtZVwiKS5pbml0aWFsVmFsdWU7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIm1vZHVsZU5hbWUgPT4gXCIgKyBtb2R1bGVOYW1lKTtcbiAgICAgICAgICAgIC8vIExvYWRpbmcgYSB0aGVtZSB3aWxsIGluc2VydCBhIHNjcmlwdCB0aGF0LCB1cG9uIGV4ZWN1dGlvbiwgd2lsbFxuICAgICAgICAgICAgLy8gaW5zZXJ0IGEgc3R5bGUgdGFnLlxuICAgICAgICAgICAgbG9hZE1vZHVsZShbXCJ0aGVtZVwiLCBtb2R1bGVOYW1lXSwgYWZ0ZXJMb2FkLCB0aGlzLmNvbnRhaW5lci5vd25lckRvY3VtZW50KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGFmdGVyTG9hZCh0aGVtZSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBhZnRlckxvYWQobW9kSnM6IHsgY3NzVGV4dDogc3RyaW5nOyBjc3NDbGFzczogc3RyaW5nOyBpc0Rhcms6IGJvb2xlYW47IHBhZGRpbmc6IG51bWJlciB9KSB7XG5cbiAgICAgICAgICAgIGlmIChfc2VsZi4kdGhlbWVJZCAhPT0gdGhlbWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2IgJiYgY2IoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFtb2RKcy5jc3NDbGFzcykge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaW1wb3J0Q3NzU3RyaW5nKG1vZEpzLmNzc1RleHQsIG1vZEpzLmNzc0NsYXNzLCBfc2VsZi5jb250YWluZXIub3duZXJEb2N1bWVudCk7XG5cbiAgICAgICAgICAgIGlmIChfc2VsZi50aGVtZSkge1xuICAgICAgICAgICAgICAgIHJlbW92ZUNzc0NsYXNzKF9zZWxmLmNvbnRhaW5lciwgX3NlbGYudGhlbWUuY3NzQ2xhc3MpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgcGFkZGluZyA9IFwicGFkZGluZ1wiIGluIG1vZEpzID8gbW9kSnMucGFkZGluZyA6IFwicGFkZGluZ1wiIGluIChfc2VsZi50aGVtZSB8fCB7fSkgPyA0IDogX3NlbGYuJHBhZGRpbmc7XG5cbiAgICAgICAgICAgIGlmIChfc2VsZi4kcGFkZGluZyAmJiBwYWRkaW5nICE9IF9zZWxmLiRwYWRkaW5nKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2V0UGFkZGluZyhwYWRkaW5nKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgX3NlbGYudGhlbWUgPSBtb2RKcztcbiAgICAgICAgICAgIGFkZENzc0NsYXNzKF9zZWxmLmNvbnRhaW5lciwgbW9kSnMuY3NzQ2xhc3MpO1xuICAgICAgICAgICAgc2V0Q3NzQ2xhc3MoX3NlbGYuY29udGFpbmVyLCBcImFjZV9kYXJrXCIsIG1vZEpzLmlzRGFyayk7XG5cbiAgICAgICAgICAgIC8vIGZvcmNlIHJlLW1lYXN1cmUgb2YgdGhlIGd1dHRlciB3aWR0aFxuICAgICAgICAgICAgaWYgKF9zZWxmLiRzaXplKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuJHNpemUud2lkdGggPSAwO1xuICAgICAgICAgICAgICAgIF9zZWxmLiR1cGRhdGVTaXplQXN5bmMoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgX3NlbGYuX2Rpc3BhdGNoRXZlbnQoJ3RoZW1lTG9hZGVkJywgeyB0aGVtZTogbW9kSnMgfSk7XG4gICAgICAgICAgICBjYiAmJiBjYigpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgcGF0aCBvZiB0aGUgY3VycmVudCB0aGVtZS5cbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAqL1xuICAgIGdldFRoZW1lKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLiR0aGVtZUlkO1xuICAgIH1cblxuICAgIC8vIE1ldGhvZHMgYWxsb3dzIHRvIGFkZCAvIHJlbW92ZSBDU1MgY2xhc3NuYW1lcyB0byB0aGUgZWRpdG9yIGVsZW1lbnQuXG4gICAgLy8gVGhpcyBmZWF0dXJlIGNhbiBiZSB1c2VkIGJ5IHBsdWctaW5zIHRvIHByb3ZpZGUgYSB2aXN1YWwgaW5kaWNhdGlvbiBvZlxuICAgIC8vIGEgY2VydGFpbiBtb2RlIHRoYXQgZWRpdG9yIGlzIGluLlxuXG4gICAgLyoqXG4gICAgICogW0FkZHMgYSBuZXcgY2xhc3MsIGBzdHlsZWAsIHRvIHRoZSBlZGl0b3IuXXs6ICNWaXJ0dWFsUmVuZGVyZXIuc2V0U3R5bGV9XG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHN0eWxlIEEgY2xhc3MgbmFtZVxuICAgICAqXG4gICAgICovXG4gICAgc2V0U3R5bGUoc3R5bGU6IHN0cmluZywgaW5jbHVkZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgc2V0Q3NzQ2xhc3ModGhpcy5jb250YWluZXIsIHN0eWxlLCBpbmNsdWRlICE9PSBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogW1JlbW92ZXMgdGhlIGNsYXNzIGBzdHlsZWAgZnJvbSB0aGUgZWRpdG9yLl17OiAjVmlydHVhbFJlbmRlcmVyLnVuc2V0U3R5bGV9XG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHN0eWxlIEEgY2xhc3MgbmFtZVxuICAgICAqL1xuICAgIHVuc2V0U3R5bGUoc3R5bGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICByZW1vdmVDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgc3R5bGUpO1xuICAgIH1cblxuICAgIHNldEN1cnNvclN0eWxlKHN0eWxlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgIT0gc3R5bGUpIHtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgPSBzdHlsZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBjdXJzb3JTdHlsZSBBIGNzcyBjdXJzb3Igc3R5bGVcbiAgICAgKi9cbiAgICBzZXRNb3VzZUN1cnNvcihjdXJzb3JTdHlsZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgPSBjdXJzb3JTdHlsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXN0cm95cyB0aGUgdGV4dCBhbmQgY3Vyc29yIGxheWVycyBmb3IgdGhpcyByZW5kZXJlci5cbiAgICAgKi9cbiAgICBkZXN0cm95KCk6IHZvaWQge1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuZGVzdHJveSgpO1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5kZXN0cm95KCk7XG4gICAgfVxufVxuXG5kZWZpbmVPcHRpb25zKFZpcnR1YWxSZW5kZXJlci5wcm90b3R5cGUsIFwicmVuZGVyZXJcIiwge1xuICAgIGFuaW1hdGVkU2Nyb2xsOiB7IGluaXRpYWxWYWx1ZTogZmFsc2UgfSxcbiAgICBzaG93SW52aXNpYmxlczoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyLnNldFNob3dJbnZpc2libGVzKHZhbHVlKSlcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX1RFWFQpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBzaG93UHJpbnRNYXJnaW46IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbigpIHsgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBwcmludE1hcmdpbkNvbHVtbjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKCkgeyB0aGlzLiR1cGRhdGVQcmludE1hcmdpbigpOyB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IDgwXG4gICAgfSxcbiAgICBwcmludE1hcmdpbjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWwgPT0gXCJudW1iZXJcIilcbiAgICAgICAgICAgICAgICB0aGlzLiRwcmludE1hcmdpbkNvbHVtbiA9IHZhbDtcbiAgICAgICAgICAgIHRoaXMuJHNob3dQcmludE1hcmdpbiA9ICEhdmFsO1xuICAgICAgICAgICAgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiRzaG93UHJpbnRNYXJnaW4gJiYgdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW47XG4gICAgICAgIH1cbiAgICB9LFxuICAgIHNob3dHdXR0ZXI6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG93KSB7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXIuc3R5bGUuZGlzcGxheSA9IHNob3cgPyBcImJsb2NrXCIgOiBcIm5vbmVcIjtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfRlVMTCk7XG4gICAgICAgICAgICB0aGlzLm9uR3V0dGVyUmVzaXplKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgZmFkZUZvbGRXaWRnZXRzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykge1xuICAgICAgICAgICAgc2V0Q3NzQ2xhc3ModGhpcy4kZ3V0dGVyLCBcImFjZV9mYWRlLWZvbGQtd2lkZ2V0c1wiLCBzaG93KTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgc2hvd0ZvbGRXaWRnZXRzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykgeyB0aGlzLiRndXR0ZXJMYXllci5zZXRTaG93Rm9sZFdpZGdldHMoc2hvdykgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBzaG93TGluZU51bWJlcnM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG93KSB7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5zZXRTaG93TGluZU51bWJlcnMoc2hvdyk7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX0dVVFRFUik7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgZGlzcGxheUluZGVudEd1aWRlczoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3cpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiR0ZXh0TGF5ZXIuc2V0RGlzcGxheUluZGVudEd1aWRlcyhzaG93KSlcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX1RFWFQpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGhpZ2hsaWdodEd1dHRlckxpbmU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG91bGRIaWdobGlnaHQpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodCkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQgPSBjcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuY2xhc3NOYW1lID0gXCJhY2VfZ3V0dGVyLWFjdGl2ZS1saW5lXCI7XG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyLmFwcGVuZENoaWxkKHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodC5zdHlsZS5kaXNwbGF5ID0gc2hvdWxkSGlnaGxpZ2h0ID8gXCJcIiA6IFwibm9uZVwiO1xuICAgICAgICAgICAgLy8gaWYgY3Vyc29ybGF5ZXIgaGF2ZSBuZXZlciBiZWVuIHVwZGF0ZWQgdGhlcmUncyBub3RoaW5nIG9uIHNjcmVlbiB0byB1cGRhdGVcbiAgICAgICAgICAgIGlmICh0aGlzLiRjdXJzb3JMYXllci4kcGl4ZWxQb3MpXG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlLFxuICAgICAgICB2YWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgaFNjcm9sbEJhckFsd2F5c1Zpc2libGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kaFNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHwgIXRoaXMuJGhvcml6U2Nyb2xsKVxuICAgICAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgdlNjcm9sbEJhckFsd2F5c1Zpc2libGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kdlNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHwgIXRoaXMuJHZTY3JvbGwpXG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9TQ1JPTEwpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBmb250U2l6ZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNpemUpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygc2l6ZSA9PSBcIm51bWJlclwiKVxuICAgICAgICAgICAgICAgIHNpemUgPSBzaXplICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5jb250YWluZXIuc3R5bGUuZm9udFNpemUgPSBzaXplO1xuICAgICAgICAgICAgdGhpcy51cGRhdGVGb250U2l6ZSgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IDEyXG4gICAgfSxcbiAgICBmb250RmFtaWx5OiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdGhpcy5jb250YWluZXIuc3R5bGUuZm9udEZhbWlseSA9IG5hbWU7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUZvbnRTaXplKCk7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIG1heExpbmVzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUZ1bGwoKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgbWluTGluZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlRnVsbCgpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBzY3JvbGxQYXN0RW5kOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB2YWwgPSArdmFsIHx8IDA7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2Nyb2xsUGFzdEVuZCA9PSB2YWwpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdGhpcy4kc2Nyb2xsUGFzdEVuZCA9IHZhbDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiAwLFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICBmaXhlZFdpZHRoR3V0dGVyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci4kZml4ZWRXaWR0aCA9ICEhdmFsO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9HVVRURVIpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICB0aGVtZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLnNldFRoZW1lKHZhbCkgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuJHRoZW1lSWQgfHwgdGhpcy50aGVtZTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcIi4vdGhlbWUvdGV4dG1hdGVcIixcbiAgICAgICAgaGFuZGxlc1NldDogdHJ1ZVxuICAgIH1cbn0pO1xuIl19