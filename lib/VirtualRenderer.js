import { addCssClass, createElement, importCssString, removeCssClass, setCssClass } from "./lib/dom";
import { _emit, defineOptions, loadModule, resetOptions } from "./config";
import { isOldIE } from "./lib/useragent";
import Gutter from "./layer/Gutter";
import Marker from "./layer/Marker";
import Text from "./layer/Text";
import Cursor from "./layer/Cursor";
import VScrollBar from "./VScrollBar";
import HScrollBar from "./HScrollBar";
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
        this.$fontMetrics = new FontMetrics(this.container, 500);
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
        return this;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlydHVhbFJlbmRlcmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1ZpcnR1YWxSZW5kZXJlci50cyJdLCJuYW1lcyI6WyJWaXJ0dWFsUmVuZGVyZXIiLCJWaXJ0dWFsUmVuZGVyZXIuY29uc3RydWN0b3IiLCJWaXJ0dWFsUmVuZGVyZXIubWF4TGluZXMiLCJWaXJ0dWFsUmVuZGVyZXIua2VlcFRleHRBcmVhQXRDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0RGVmYXVsdEN1cnNvclN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEN1cnNvckxheWVyT2ZmIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUNoYXJhY3RlclNpemUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2Vzc2lvbiIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVMaW5lcyIsIlZpcnR1YWxSZW5kZXJlci5vbkNoYW5nZU5ld0xpbmVNb2RlIiwiVmlydHVhbFJlbmRlcmVyLm9uQ2hhbmdlVGFiU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVUZXh0IiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUZ1bGwiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlRm9udFNpemUiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNpemVBc3luYyIsIlZpcnR1YWxSZW5kZXJlci5vblJlc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci4kdXBkYXRlQ2FjaGVkU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5vbkd1dHRlclJlc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5hZGp1c3RXcmFwTGltaXQiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0QW5pbWF0ZWRTY3JvbGwiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0QW5pbWF0ZWRTY3JvbGwiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2hvd0ludmlzaWJsZXMiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2hvd0ludmlzaWJsZXMiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0RGlzcGxheUluZGVudEd1aWRlcyIsIlZpcnR1YWxSZW5kZXJlci5zZXREaXNwbGF5SW5kZW50R3VpZGVzIiwiVmlydHVhbFJlbmRlcmVyLnNldFNob3dQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRTaG93UHJpbnRNYXJnaW4iLCJWaXJ0dWFsUmVuZGVyZXIuc2V0UHJpbnRNYXJnaW5Db2x1bW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0UHJpbnRNYXJnaW5Db2x1bW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2hvd0d1dHRlciIsIlZpcnR1YWxSZW5kZXJlci5zZXRTaG93R3V0dGVyIiwiVmlydHVhbFJlbmRlcmVyLmdldEZhZGVGb2xkV2lkZ2V0cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRGYWRlRm9sZFdpZGdldHMiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0SGlnaGxpZ2h0R3V0dGVyTGluZSIsIlZpcnR1YWxSZW5kZXJlci5nZXRIaWdobGlnaHRHdXR0ZXJMaW5lIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0IiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRDb250YWluZXJFbGVtZW50IiwiVmlydHVhbFJlbmRlcmVyLmdldE1vdXNlRXZlbnRUYXJnZXQiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0VGV4dEFyZWFDb250YWluZXIiLCJWaXJ0dWFsUmVuZGVyZXIuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLmdldEZpcnN0VmlzaWJsZVJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRGaXJzdEZ1bGx5VmlzaWJsZVJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRMYXN0RnVsbHlWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLnNldFBhZGRpbmciLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2Nyb2xsTWFyZ2luIiwiVmlydHVhbFJlbmRlcmVyLmdldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLmdldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLnNldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVTY3JvbGxCYXJWIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVTY3JvbGxCYXJIIiwiVmlydHVhbFJlbmRlcmVyLmZyZWV6ZSIsIlZpcnR1YWxSZW5kZXJlci51bmZyZWV6ZSIsIlZpcnR1YWxSZW5kZXJlci4kcmVuZGVyQ2hhbmdlcyIsIlZpcnR1YWxSZW5kZXJlci4kYXV0b3NpemUiLCJWaXJ0dWFsUmVuZGVyZXIuJGNvbXB1dGVMYXllckNvbmZpZyIsIlZpcnR1YWxSZW5kZXJlci4kdXBkYXRlTGluZXMiLCJWaXJ0dWFsUmVuZGVyZXIuJGdldExvbmdlc3RMaW5lIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUZyb250TWFya2VycyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVCYWNrTWFya2VycyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVCcmVha3BvaW50cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRBbm5vdGF0aW9ucyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuaGlkZUN1cnNvciIsIlZpcnR1YWxSZW5kZXJlci5zaG93Q3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFNlbGVjdGlvbkludG9WaWV3IiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbFRvcCIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxMZWZ0IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbFRvcFJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxCb3R0b21Sb3ciLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9Sb3ciLCJWaXJ0dWFsUmVuZGVyZXIuYWxpZ25DdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuJGNhbGNTdGVwcyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb0xpbmUiLCJWaXJ0dWFsUmVuZGVyZXIuYW5pbWF0ZVNjcm9sbGluZyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb1kiLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9YIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbEJ5IiwiVmlydHVhbFJlbmRlcmVyLmlzU2Nyb2xsYWJsZUJ5IiwiVmlydHVhbFJlbmRlcmVyLnBpeGVsVG9TY3JlZW5Db29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci50ZXh0VG9TY3JlZW5Db29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci52aXN1YWxpemVGb2N1cyIsIlZpcnR1YWxSZW5kZXJlci52aXN1YWxpemVCbHVyIiwiVmlydHVhbFJlbmRlcmVyLnNob3dDb21wb3NpdGlvbiIsIlZpcnR1YWxSZW5kZXJlci5zZXRDb21wb3NpdGlvblRleHQiLCJWaXJ0dWFsUmVuZGVyZXIuaGlkZUNvbXBvc2l0aW9uIiwiVmlydHVhbFJlbmRlcmVyLnNldFRoZW1lIiwiVmlydHVhbFJlbmRlcmVyLnNldFRoZW1lLmFmdGVyTG9hZCIsIlZpcnR1YWxSZW5kZXJlci5nZXRUaGVtZSIsIlZpcnR1YWxSZW5kZXJlci5zZXRTdHlsZSIsIlZpcnR1YWxSZW5kZXJlci51bnNldFN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEN1cnNvclN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldE1vdXNlQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLmRlc3Ryb3kiXSwibWFwcGluZ3MiOiJPQThCTyxFQUFDLFdBQVcsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFFLGNBQWMsRUFBRSxXQUFXLEVBQUMsTUFB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Q0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7SUFDdENBLENBQUNBO0lBRURSLG1CQUFtQkE7UUFDZlMsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDakNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO0lBQ3JDQSxDQUFDQTtJQUVEVCxlQUFlQTtRQUNYVSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNiQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdEJBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLFdBQVdBLEdBQUdBLGFBQWFBLENBQUNBLENBQUNBO1lBQ3JEQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNOQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNOQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxlQUFlQSxFQUFFQSxDQUFDQTtZQUN0Q0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFFTkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDTkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFLRFYsVUFBVUE7UUFDTlcsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7SUFDckNBLENBQUNBO0lBTURYLFVBQVVBLENBQUNBLEtBQWVBO1FBQ3RCWSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNOQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxXQUFXQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUMzQ0EsSUFBSUE7WUFDQUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7SUFDekNBLENBQUNBO0lBS0RaLGNBQWNBO1FBQ1ZhLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLG1CQUFtQkEsRUFBRUEsQ0FBQ0E7SUFDMUNBLENBQUNBO0lBRURiLGdCQUFnQkE7UUFDWmMsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckJBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBO1FBQzdCQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtRQUNwQkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFTRGQsUUFBUUEsQ0FBQ0EsS0FBZUEsRUFBRUEsV0FBb0JBLEVBQUVBLEtBQWNBLEVBQUVBLE1BQWVBO1FBQzNFZSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNsQkEsTUFBTUEsQ0FBQ0E7UUFDWEEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO1FBQ3BCQSxJQUFJQTtZQUNBQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxLQUFLQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUdsQ0EsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO1lBQ1JBLE1BQU1BLEdBQUdBLEVBQUVBLENBQUNBLFlBQVlBLElBQUlBLEVBQUVBLENBQUNBLFlBQVlBLENBQUNBO1FBQ2hEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNQQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxXQUFXQSxJQUFJQSxFQUFFQSxDQUFDQSxXQUFXQSxDQUFDQTtRQUM3Q0EsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxLQUFLQSxFQUFFQSxXQUFXQSxFQUFFQSxLQUFLQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUd4RUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDbERBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBO1FBRTdCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNOQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUV0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDTkEsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLElBQUlBO1lBQ0FBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBRWpEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQTtZQUNkQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUMxQkEsQ0FBQ0E7SUFFRGYsaUJBQWlCQSxDQUFDQSxLQUFLQSxFQUFFQSxXQUFXQSxFQUFFQSxLQUFLQSxFQUFFQSxNQUFNQTtRQUMvQ2dCLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBQ25DQSxJQUFJQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNoQkEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDdEJBLElBQUlBLE9BQU9BLEdBQUdBO1lBQ1ZBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBO1lBQ2pCQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxNQUFNQTtZQUNuQkEsY0FBY0EsRUFBRUEsSUFBSUEsQ0FBQ0EsY0FBY0E7WUFDbkNBLGFBQWFBLEVBQUVBLElBQUlBLENBQUNBLGFBQWFBO1NBQ3BDQSxDQUFDQTtRQUNGQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3Q0EsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7WUFDckJBLE9BQU9BLElBQUlBLFdBQVdBLENBQUNBO1lBRXZCQSxJQUFJQSxDQUFDQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7Z0JBQ2xCQSxJQUFJQSxDQUFDQSxjQUFjQSxJQUFJQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUVsREEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFFckVBLE9BQU9BLEdBQUdBLE9BQU9BLEdBQUdBLGFBQWFBLENBQUNBO1FBQ3RDQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQ0EsT0FBT0EsSUFBSUEsV0FBV0EsQ0FBQ0E7WUFDdkJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBO1lBRW5CQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxJQUFJQSxJQUFJQSxDQUFDQTtnQkFDcEJBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFdBQVdBLEdBQUdBLENBQUNBLENBQUNBO1lBRWxFQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxXQUFXQSxDQUFDQTtZQUUvQkEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUE7Z0JBQzlCQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxHQUFHQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUNsREEsSUFBSUEsQ0FBQ0EsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsV0FBV0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFFOUVBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBO2dCQUMvQkEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDN0RBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENB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Q0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsRUFDckRBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBRTNGQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxFQUNqRkEsV0FBV0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFdEZBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzNEQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNwRkEsSUFBSUEsT0FBT0EsR0FBR0EsUUFBUUEsR0FBR0EsU0FBU0EsQ0FBQ0E7UUFHbkNBLElBQUlBLGNBQWNBLEVBQUVBLGNBQWNBLENBQUNBO1FBQ25D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LFdBQVdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBO1FBQ3BEQSxJQUFJQSxZQUFZQSxHQUFHQSxXQUFXQSxJQUFJQSxXQUFXQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUUxREEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUVyRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDOUJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO2dCQUNQQSxHQUFHQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQTtZQUM5Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1ZBLEdBQUdBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLENBQUNBO1lBQ2pDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNuQ0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsR0FBR0EsWUFBWUEsR0FBR0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEZBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO2dCQUNQQSxHQUFHQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQTtZQUM5Q0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0E7UUFDakZBLENBQUNBO1FBRURBLElBQUlBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBRWpDQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsY0FBY0EsQ0FBQ0E7Z0JBQzNEQSxJQUFJQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUNuQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDckNBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLEdBQUdBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO1lBQzFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNsR0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsSUFBSUEsSUFBSUEsQ0FBQ0EsUUFBUUEsSUFBSUEsSUFBSUEsR0FBR0EsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDOUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ2xDQSxDQUFDQTtJQUNMQSxDQUFDQTtJQU9EcEUsWUFBWUE7UUFDUnFFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO0lBQ3ZDQSxDQUFDQTtJQU9EckUsYUFBYUE7UUFDVHNFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLEVBQUVBLENBQUNBO0lBQ3hDQSxDQUFDQTtJQU9EdEUsZUFBZUE7UUFDWHVFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO0lBQzVDQSxDQUFDQTtJQU9EdkUsa0JBQWtCQTtRQUNkd0UsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDdkdBLENBQUNBO0lBU0R4RSxXQUFXQSxDQUFDQSxHQUFXQTtRQUNuQnlFLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0lBQ3JEQSxDQUFDQTtJQUVEekUsV0FBV0EsQ0FBQ0EsTUFBTUEsRUFBRUEsU0FBU0E7UUFDekIwRSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxNQUFNQSxJQUFJQSxRQUFRQSxDQUFDQTtZQUMxQkEsTUFBTUEsR0FBR0EsRUFBRUEsR0FBR0EsRUFBRUEsTUFBTUEsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFFeENBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDckRBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBQ3BEQSxJQUFJQSxNQUFNQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxTQUFTQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUU1Q0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDbENBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO0lBQ2xCQSxDQUFDQTtJQUVEMUUsVUFBVUEsQ0FBQ0EsU0FBaUJBLEVBQUVBLE9BQWVBO1FBQ3pDMkUsSUFBSUEsQ0FBQ0EsR0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDbEJBLElBQUlBLENBQUNBLEdBQVdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBO1FBQzNCQSxJQUFJQSxLQUFLQSxHQUFhQSxFQUFFQSxDQUFDQTtRQUV6QkEsSUFBSUEsSUFBSUEsR0FBR0EsVUFBU0EsQ0FBU0EsRUFBRUEsS0FBYUEsRUFBRUEsRUFBVUE7WUFDcEQsTUFBTSxDQUFDLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUM7UUFDakQsQ0FBQyxDQUFDQTtRQUVGQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUNyQkEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsRUFBRUEsU0FBU0EsRUFBRUEsT0FBT0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDckVBLENBQUNBO1FBRURBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2pCQSxDQUFDQTtJQVNEM0UsWUFBWUEsQ0FBQ0EsSUFBWUEsRUFBRUEsTUFBZUEsRUFBRUEsT0FBZ0JBLEVBQUVBLFFBQW9CQTtRQUM5RTRFLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsRUFBRUEsR0FBR0EsRUFBRUEsSUFBSUEsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDdkVBLElBQUlBLE1BQU1BLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBO1FBQ3JCQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNUQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUM1Q0EsQ0FBQ0E7UUFFREEsSUFBSUEsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDbkNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ2xDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxLQUFLQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxhQUFhQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUNuREEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFFRDVFLGdCQUFnQkEsQ0FBQ0EsU0FBaUJBLEVBQUVBLFFBQVNBO1FBQ3pDNkUsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDN0JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3hCQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUNEQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUVqQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDckJBLE1BQU1BLENBQUNBO1FBRVhBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDM0NBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsU0FBU0EsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hCQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxJQUFJQSxPQUFPQSxDQUFDQTtvQkFDckJBLE1BQU1BLENBQUNBO1lBQ2ZBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLElBQUlBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLFNBQVNBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO1FBQ2pEQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLEVBQUVBLElBQUlBLEVBQUVBLFNBQVNBLEVBQUVBLEVBQUVBLEVBQUVBLE9BQU9BLEVBQUVBLEtBQUtBLEVBQUVBLEtBQUtBLEVBQUVBLENBQUNBO1FBRXZFQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUUzQkEsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFFMUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLEdBQUdBLE9BQU9BLENBQUNBO1FBQ25DQSxJQUFJQSxDQUFDQSxNQUFNQSxHQUFHQSxXQUFXQSxDQUFDQTtZQUN0QixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDZixLQUFLLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztnQkFDMUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEdBQUcsT0FBTyxDQUFDO1lBQ3ZDLENBQUM7WUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ3pCLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUM5QixLQUFLLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDcEMsT0FBTyxHQUFHLElBQUksQ0FBQztZQUNuQixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBRUosS0FBSyxDQUFDLE1BQU0sR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUMzQyxLQUFLLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO2dCQUM5QixRQUFRLElBQUksUUFBUSxFQUFFLENBQUM7WUFDM0IsQ0FBQztRQUNMLENBQUMsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDWEEsQ0FBQ0E7SUFNRDdFLFNBQVNBLENBQUNBLFNBQWlCQTtRQUd2QjhFLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQy9CQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQTtZQUMzQkEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0E7UUFDdkNBLENBQUNBO0lBQ0xBLENBQUNBO0lBTUQ5RSxTQUFTQSxDQUFDQSxVQUFrQkE7UUFDeEIrRSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxLQUFLQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsVUFBVUEsQ0FBQ0E7WUFDN0JBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBO1FBQ3pDQSxDQUFDQTtJQUNMQSxDQUFDQTtJQU9EL0UsUUFBUUEsQ0FBQ0EsQ0FBU0EsRUFBRUEsQ0FBU0E7UUFDekJnRixJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM3QkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDbENBLENBQUNBO0lBT0RoRixRQUFRQSxDQUFDQSxNQUFjQSxFQUFFQSxNQUFjQTtRQUNuQ2lGLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBO1FBQzFFQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxFQUFFQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQTtJQUNoRkEsQ0FBQ0E7SUFVRGpGLGNBQWNBLENBQUNBLE1BQWNBLEVBQUVBLE1BQWNBO1FBQ3pDa0YsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDdkVBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO1FBQ2hCQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQTtjQUNuRUEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDN0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO1FBQ2hCQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUN6RUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBO2NBQ25FQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUN4REEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDcEJBLENBQUNBO0lBRURsRix3QkFBd0JBLENBQUNBLENBQVNBLEVBQUVBLENBQVNBO1FBQ3pDbUYsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EscUJBQXFCQSxFQUFFQSxDQUFDQTtRQUV0REEsSUFBSUEsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsU0FBU0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0E7UUFDMUZBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1FBQzdFQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUU3QkEsTUFBTUEsQ0FBQ0EsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsRUFBRUEsTUFBTUEsRUFBRUEsR0FBR0EsRUFBRUEsSUFBSUEsRUFBRUEsTUFBTUEsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7SUFDdEVBLENBQUNBO0lBRURuRix1QkFBdUJBLENBQUNBLE9BQWVBLEVBQUVBLE9BQWVBO1FBQ3BEb0YsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EscUJBQXFCQSxFQUFFQSxDQUFDQTtRQUV0REEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsU0FBU0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0E7UUFFNUdBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBRXZFQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSx3QkFBd0JBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBQzNFQSxDQUFDQTtJQVFEcEYsdUJBQXVCQSxDQUFDQSxHQUFXQSxFQUFFQSxNQUFjQTtRQUMvQ3FGLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLHFCQUFxQkEsRUFBRUEsQ0FBQ0E7UUFDdERBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLHdCQUF3QkEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFN0RBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBO1FBQ3JFQSxJQUFJQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtRQUVsQ0EsTUFBTUEsQ0FBQ0E7WUFDSEEsS0FBS0EsRUFBRUEsU0FBU0EsQ0FBQ0EsSUFBSUEsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUE7WUFDM0NBLEtBQUtBLEVBQUVBLFNBQVNBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBO1NBQzVDQSxDQUFDQTtJQUNOQSxDQUFDQTtJQU1EckYsY0FBY0E7UUFDVnNGLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBO0lBQzdDQSxDQUFDQTtJQU1EdEYsYUFBYUE7UUFDVHVGLGNBQWNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBO0lBQ2hEQSxDQUFDQTtJQU9EdkYsZUFBZUEsQ0FBQ0EsUUFBeUNBO1FBQ3JEd0YsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7WUFDbkJBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBO2dCQUNoQkEsb0JBQW9CQSxFQUFFQSxJQUFJQSxDQUFDQSxxQkFBcUJBO2dCQUNoREEsT0FBT0EsRUFBRUEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0E7YUFDdkNBLENBQUNBO1FBRU5BLElBQUlBLENBQUNBLHFCQUFxQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDbENBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7UUFDOUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2pDQSxJQUFJQSxDQUFDQSxxQkFBcUJBLEVBQUVBLENBQUNBO0lBQ2pDQSxDQUFDQTtJQU9EeEYsa0JBQWtCQSxDQUFDQSxJQUFhQTtRQUU1QnlGLElBQUlBLENBQUNBLHFCQUFxQkEsRUFBRUEsQ0FBQ0E7SUFDakNBLENBQUNBO0lBS0R6RixlQUFlQTtRQUNYMEYsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckJBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBRURBLGNBQWNBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7UUFDakRBLElBQUlBLENBQUNBLHFCQUFxQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0Esb0JBQW9CQSxDQUFDQTtRQUNwRUEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDeERBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLElBQUlBLENBQUNBO0lBQzdCQSxDQUFDQTtJQVdEMUYsUUFBUUEsQ0FBQ0EsS0FBVUEsRUFBRUEsRUFBY0E7UUFDL0IyRixPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxvQ0FBb0NBLEdBQUdBLEtBQUtBLENBQUNBLENBQUFBO1FBQ3pEQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNqQkEsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDdEJBLEtBQUtBLENBQUNBLGNBQWNBLENBQUNBLGFBQWFBLEVBQUVBLEVBQUVBLEtBQUtBLEVBQUVBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBO1FBRXREQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxPQUFPQSxLQUFLQSxLQUFLQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0Q0EsSUFBSUEsVUFBVUEsR0FBR0EsS0FBS0EsSUFBSUEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsWUFBWUEsQ0FBQ0E7WUFDL0RBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLGdCQUFnQkEsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7WUFHM0NBLFVBQVVBLENBQUNBLENBQUNBLE9BQU9BLEVBQUVBLFVBQVVBLENBQUNBLEVBQUVBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1FBQy9FQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNyQkEsQ0FBQ0E7UUFFREEsbUJBQW1CQSxLQUE4RUE7WUFFN0ZDLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLEtBQUtBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUMzQkEsTUFBTUEsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDdEJBLENBQUNBO1lBRURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsTUFBTUEsQ0FBQ0E7WUFDWEEsQ0FBQ0E7WUFFREEsZUFBZUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsRUFBRUEsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0E7WUFFOUVBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUNkQSxjQUFjQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUMxREEsQ0FBQ0E7WUFFREEsSUFBSUEsT0FBT0EsR0FBR0EsU0FBU0EsSUFBSUEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsT0FBT0EsR0FBR0EsU0FBU0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsSUFBSUEsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFFekdBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLElBQUlBLE9BQU9BLElBQUlBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO2dCQUM5Q0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDOUJBLENBQUNBO1lBRURBLEtBQUtBLENBQUNBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBO1lBQ3BCQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxFQUFFQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUM3Q0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsRUFBRUEsVUFBVUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFHdkRBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUNkQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDdEJBLEtBQUtBLENBQUNBLGdCQUFnQkEsRUFBRUEsQ0FBQ0E7WUFDN0JBLENBQUNBO1lBRURBLEtBQUtBLENBQUNBLGNBQWNBLENBQUNBLGFBQWFBLEVBQUVBLEVBQUVBLEtBQUtBLEVBQUVBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3REQSxFQUFFQSxJQUFJQSxFQUFFQSxFQUFFQSxD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QVMsR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQyxDQUFDO1FBQ3pDLEdBQUcsRUFBRSxjQUFhLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELFlBQVksRUFBRSxrQkFBa0I7UUFDaEMsVUFBVSxFQUFFLElBQUk7S0FDbkI7Q0FDSixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICpcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblxuaW1wb3J0IHthZGRDc3NDbGFzcywgY3JlYXRlRWxlbWVudCwgaW1wb3J0Q3NzU3RyaW5nLCByZW1vdmVDc3NDbGFzcywgc2V0Q3NzQ2xhc3N9IGZyb20gXCIuL2xpYi9kb21cIjtcbmltcG9ydCB7X2VtaXQsIGRlZmluZU9wdGlvbnMsIGxvYWRNb2R1bGUsIHJlc2V0T3B0aW9uc30gZnJvbSBcIi4vY29uZmlnXCI7XG5pbXBvcnQge2lzT2xkSUV9IGZyb20gXCIuL2xpYi91c2VyYWdlbnRcIjtcbmltcG9ydCBBbm5vdGF0aW9uIGZyb20gJy4vQW5ub3RhdGlvbic7XG5pbXBvcnQgR3V0dGVyIGZyb20gXCIuL2xheWVyL0d1dHRlclwiO1xuaW1wb3J0IE1hcmtlciBmcm9tIFwiLi9sYXllci9NYXJrZXJcIjtcbmltcG9ydCBUZXh0IGZyb20gXCIuL2xheWVyL1RleHRcIjtcbmltcG9ydCBDdXJzb3IgZnJvbSBcIi4vbGF5ZXIvQ3Vyc29yXCI7XG5pbXBvcnQgVlNjcm9sbEJhciBmcm9tIFwiLi9WU2Nyb2xsQmFyXCI7XG5pbXBvcnQgSFNjcm9sbEJhciBmcm9tIFwiLi9IU2Nyb2xsQmFyXCI7XG5pbXBvcnQgUmVuZGVyTG9vcCBmcm9tIFwiLi9SZW5kZXJMb29wXCI7XG5pbXBvcnQgRm9udE1ldHJpY3MgZnJvbSBcIi4vbGF5ZXIvRm9udE1ldHJpY3NcIjtcbmltcG9ydCBFdmVudEVtaXR0ZXJDbGFzcyBmcm9tIFwiLi9saWIvZXZlbnRfZW1pdHRlclwiO1xuaW1wb3J0IEVkaXRTZXNzaW9uIGZyb20gJy4vRWRpdFNlc3Npb24nO1xuaW1wb3J0IE9wdGlvbnNQcm92aWRlciBmcm9tIFwiLi9PcHRpb25zUHJvdmlkZXJcIjtcblxuLy8gRklYTUVcbi8vIGltcG9ydCBlZGl0b3JDc3MgPSByZXF1aXJlKFwiLi9yZXF1aXJlanMvdGV4dCEuL2Nzcy9lZGl0b3IuY3NzXCIpO1xuLy8gaW1wb3J0Q3NzU3RyaW5nKGVkaXRvckNzcywgXCJhY2VfZWRpdG9yXCIpO1xuXG52YXIgQ0hBTkdFX0NVUlNPUiA9IDE7XG52YXIgQ0hBTkdFX01BUktFUiA9IDI7XG52YXIgQ0hBTkdFX0dVVFRFUiA9IDQ7XG52YXIgQ0hBTkdFX1NDUk9MTCA9IDg7XG52YXIgQ0hBTkdFX0xJTkVTID0gMTY7XG52YXIgQ0hBTkdFX1RFWFQgPSAzMjtcbnZhciBDSEFOR0VfU0laRSA9IDY0O1xudmFyIENIQU5HRV9NQVJLRVJfQkFDSyA9IDEyODtcbnZhciBDSEFOR0VfTUFSS0VSX0ZST05UID0gMjU2O1xudmFyIENIQU5HRV9GVUxMID0gNTEyO1xudmFyIENIQU5HRV9IX1NDUk9MTCA9IDEwMjQ7XG5cbi8qKlxuICogVGhlIGNsYXNzIHRoYXQgaXMgcmVzcG9uc2libGUgZm9yIGRyYXdpbmcgZXZlcnl0aGluZyB5b3Ugc2VlIG9uIHRoZSBzY3JlZW4hXG4gKiBAcmVsYXRlZCBlZGl0b3IucmVuZGVyZXIgXG4gKiBAY2xhc3MgVmlydHVhbFJlbmRlcmVyXG4gKiovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBWaXJ0dWFsUmVuZGVyZXIgZXh0ZW5kcyBFdmVudEVtaXR0ZXJDbGFzcyBpbXBsZW1lbnRzIE9wdGlvbnNQcm92aWRlciB7XG4gICAgcHVibGljIHRleHRhcmVhOiBIVE1MVGV4dEFyZWFFbGVtZW50O1xuICAgIHB1YmxpYyBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuICAgIHB1YmxpYyBzY3JvbGxMZWZ0ID0gMDtcbiAgICBwdWJsaWMgc2Nyb2xsVG9wID0gMDtcbiAgICBwdWJsaWMgbGF5ZXJDb25maWcgPSB7XG4gICAgICAgIHdpZHRoOiAxLFxuICAgICAgICBwYWRkaW5nOiAwLFxuICAgICAgICBmaXJzdFJvdzogMCxcbiAgICAgICAgZmlyc3RSb3dTY3JlZW46IDAsXG4gICAgICAgIGxhc3RSb3c6IDAsXG4gICAgICAgIGxpbmVIZWlnaHQ6IDAsXG4gICAgICAgIGNoYXJhY3RlcldpZHRoOiAwLFxuICAgICAgICBtaW5IZWlnaHQ6IDEsXG4gICAgICAgIG1heEhlaWdodDogMSxcbiAgICAgICAgb2Zmc2V0OiAwLFxuICAgICAgICBoZWlnaHQ6IDEsXG4gICAgICAgIGd1dHRlck9mZnNldDogMVxuICAgIH07XG4gICAgcHVibGljICRtYXhMaW5lczogbnVtYmVyO1xuICAgIHB1YmxpYyAkbWluTGluZXM6IG51bWJlcjtcbiAgICBwdWJsaWMgJGN1cnNvckxheWVyOiBDdXJzb3I7XG4gICAgcHVibGljICRndXR0ZXJMYXllcjogR3V0dGVyO1xuXG4gICAgcHVibGljICRwYWRkaW5nOiBudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgJGZyb3plbiA9IGZhbHNlO1xuXG4gICAgLy8gVGhlIHRoZW1lSWQgaXMgd2hhdCBpcyBjb21tdW5pY2F0ZWQgaW4gdGhlIEFQSS5cbiAgICBwcml2YXRlICR0aGVtZUlkOiBzdHJpbmc7XG4gICAgLyoqXG4gICAgICogVGhlIGxvYWRlZCB0aGVtZSBvYmplY3QuIFRoaXMgYWxsb3dzIHVzIHRvIHJlbW92ZSBhIHRoZW1lLlxuICAgICAqL1xuICAgIHByaXZhdGUgdGhlbWU6IHsgY3NzQ2xhc3M6IHN0cmluZyB9O1xuXG4gICAgcHJpdmF0ZSAkdGltZXI7XG4gICAgcHJpdmF0ZSBTVEVQUyA9IDg7XG4gICAgcHVibGljICRrZWVwVGV4dEFyZWFBdEN1cnNvcjogYm9vbGVhbjtcbiAgICBwdWJsaWMgJGd1dHRlcjtcbiAgICBwdWJsaWMgc2Nyb2xsZXI7XG4gICAgcHVibGljIGNvbnRlbnQ6IEhUTUxEaXZFbGVtZW50O1xuICAgIHB1YmxpYyAkdGV4dExheWVyOiBUZXh0O1xuICAgIHByaXZhdGUgJG1hcmtlckZyb250OiBNYXJrZXI7XG4gICAgcHJpdmF0ZSAkbWFya2VyQmFjazogTWFya2VyO1xuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MRGl2RWxlbWVudDtcbiAgICBwcml2YXRlICRob3JpelNjcm9sbDogYm9vbGVhbjtcbiAgICBwcml2YXRlICR2U2Nyb2xsO1xuICAgIHB1YmxpYyBzY3JvbGxCYXJIOiBIU2Nyb2xsQmFyO1xuICAgIHB1YmxpYyBzY3JvbGxCYXJWOiBWU2Nyb2xsQmFyO1xuICAgIHByaXZhdGUgJHNjcm9sbEFuaW1hdGlvbjogeyBmcm9tOiBudW1iZXI7IHRvOiBudW1iZXI7IHN0ZXBzOiBudW1iZXJbXSB9O1xuICAgIHB1YmxpYyAkc2Nyb2xsYmFyV2lkdGg6IG51bWJlcjtcbiAgICBwcml2YXRlIHNlc3Npb246IEVkaXRTZXNzaW9uO1xuXG4gICAgcHJpdmF0ZSBzY3JvbGxNYXJnaW4gPSB7XG4gICAgICAgIGxlZnQ6IDAsXG4gICAgICAgIHJpZ2h0OiAwLFxuICAgICAgICB0b3A6IDAsXG4gICAgICAgIGJvdHRvbTogMCxcbiAgICAgICAgdjogMCxcbiAgICAgICAgaDogMFxuICAgIH07XG5cbiAgICBwcml2YXRlICRmb250TWV0cmljczogRm9udE1ldHJpY3M7XG4gICAgcHJpdmF0ZSAkYWxsb3dCb2xkRm9udHM7XG4gICAgcHJpdmF0ZSBjdXJzb3JQb3M7XG4gICAgcHVibGljICRzaXplO1xuICAgIHByaXZhdGUgJGxvb3A6IFJlbmRlckxvb3A7XG4gICAgcHJpdmF0ZSAkY2hhbmdlZExpbmVzO1xuICAgIHByaXZhdGUgJGNoYW5nZXMgPSAwO1xuICAgIHByaXZhdGUgcmVzaXppbmc7XG4gICAgcHJpdmF0ZSAkZ3V0dGVyTGluZUhpZ2hsaWdodDtcbiAgICAvLyBGSVhNRTogV2h5IGRvIHdlIGhhdmUgdHdvP1xuICAgIHB1YmxpYyBndXR0ZXJXaWR0aDogbnVtYmVyO1xuICAgIHByaXZhdGUgJGd1dHRlcldpZHRoOiBudW1iZXI7XG4gICAgcHJpdmF0ZSAkc2hvd1ByaW50TWFyZ2luO1xuICAgIHByaXZhdGUgJHByaW50TWFyZ2luRWw7XG4gICAgcHJpdmF0ZSBnZXRPcHRpb247XG4gICAgcHJpdmF0ZSBzZXRPcHRpb247XG4gICAgcHJpdmF0ZSBjaGFyYWN0ZXJXaWR0aDtcbiAgICBwcml2YXRlICRwcmludE1hcmdpbkNvbHVtbjtcbiAgICBwcml2YXRlIGxpbmVIZWlnaHQ7XG4gICAgcHJpdmF0ZSAkZXh0cmFIZWlnaHQ7XG4gICAgcHJpdmF0ZSAkY29tcG9zaXRpb246IHsga2VlcFRleHRBcmVhQXRDdXJzb3I6IGJvb2xlYW47IGNzc1RleHQ6IHN0cmluZyB9O1xuICAgIHByaXZhdGUgJGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIHByaXZhdGUgJHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIHByaXZhdGUgJHNob3dHdXR0ZXI7XG4gICAgcHJpdmF0ZSBzaG93SW52aXNpYmxlcztcbiAgICBwcml2YXRlICRhbmltYXRlZFNjcm9sbDogYm9vbGVhbjtcbiAgICBwcml2YXRlICRzY3JvbGxQYXN0RW5kO1xuICAgIHByaXZhdGUgJGhpZ2hsaWdodEd1dHRlckxpbmU7XG4gICAgcHJpdmF0ZSBkZXNpcmVkSGVpZ2h0O1xuXG4gICAgLyoqXG4gICAgICogQ29uc3RydWN0cyBhIG5ldyBgVmlydHVhbFJlbmRlcmVyYCB3aXRoaW4gdGhlIGBjb250YWluZXJgIHNwZWNpZmllZC5cbiAgICAgKiBAY2xhc3MgVmlydHVhbFJlbmRlcmVyXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQHBhcmFtIGNvbnRhaW5lciB7SFRNTEVsZW1lbnR9IFRoZSByb290IGVsZW1lbnQgb2YgdGhlIGVkaXRvci5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3Rvcihjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgICAgIHN1cGVyKCk7XG5cbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcblxuICAgICAgICB0aGlzLmNvbnRhaW5lciA9IGNvbnRhaW5lciB8fCA8SFRNTERpdkVsZW1lbnQ+Y3JlYXRlRWxlbWVudChcImRpdlwiKTtcblxuICAgICAgICAvLyBUT0RPOiB0aGlzIGJyZWFrcyByZW5kZXJpbmcgaW4gQ2xvdWQ5IHdpdGggbXVsdGlwbGUgYWNlIGluc3RhbmNlc1xuICAgICAgICAvLyAvLyBJbXBvcnRzIENTUyBvbmNlIHBlciBET00gZG9jdW1lbnQgKCdhY2VfZWRpdG9yJyBzZXJ2ZXMgYXMgYW4gaWRlbnRpZmllcikuXG4gICAgICAgIC8vIGltcG9ydENzc1N0cmluZyhlZGl0b3JDc3MsIFwiYWNlX2VkaXRvclwiLCBjb250YWluZXIub3duZXJEb2N1bWVudCk7XG5cbiAgICAgICAgLy8gaW4gSUUgPD0gOSB0aGUgbmF0aXZlIGN1cnNvciBhbHdheXMgc2hpbmVzIHRocm91Z2hcbiAgICAgICAgdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSAhaXNPbGRJRTtcblxuICAgICAgICBhZGRDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgXCJhY2VfZWRpdG9yXCIpO1xuXG4gICAgICAgIHRoaXMuJGd1dHRlciA9IGNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRoaXMuJGd1dHRlci5jbGFzc05hbWUgPSBcImFjZV9ndXR0ZXJcIjtcbiAgICAgICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy4kZ3V0dGVyKTtcblxuICAgICAgICB0aGlzLnNjcm9sbGVyID0gY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGhpcy5zY3JvbGxlci5jbGFzc05hbWUgPSBcImFjZV9zY3JvbGxlclwiO1xuICAgICAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLnNjcm9sbGVyKTtcblxuICAgICAgICB0aGlzLmNvbnRlbnQgPSA8SFRNTERpdkVsZW1lbnQ+Y3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGhpcy5jb250ZW50LmNsYXNzTmFtZSA9IFwiYWNlX2NvbnRlbnRcIjtcbiAgICAgICAgdGhpcy5zY3JvbGxlci5hcHBlbmRDaGlsZCh0aGlzLmNvbnRlbnQpO1xuXG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyID0gbmV3IEd1dHRlcih0aGlzLiRndXR0ZXIpO1xuICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5vbihcImNoYW5nZUd1dHRlcldpZHRoXCIsIHRoaXMub25HdXR0ZXJSZXNpemUuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy4kbWFya2VyQmFjayA9IG5ldyBNYXJrZXIodGhpcy5jb250ZW50KTtcblxuICAgICAgICB2YXIgdGV4dExheWVyID0gdGhpcy4kdGV4dExheWVyID0gbmV3IFRleHQodGhpcy5jb250ZW50KTtcbiAgICAgICAgdGhpcy5jYW52YXMgPSB0ZXh0TGF5ZXIuZWxlbWVudDtcblxuICAgICAgICB0aGlzLiRtYXJrZXJGcm9udCA9IG5ldyBNYXJrZXIodGhpcy5jb250ZW50KTtcblxuICAgICAgICB0aGlzLiRjdXJzb3JMYXllciA9IG5ldyBDdXJzb3IodGhpcy5jb250ZW50KTtcblxuICAgICAgICAvLyBJbmRpY2F0ZXMgd2hldGhlciB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIgaXMgdmlzaWJsZVxuICAgICAgICB0aGlzLiRob3JpelNjcm9sbCA9IGZhbHNlO1xuICAgICAgICB0aGlzLiR2U2Nyb2xsID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5zY3JvbGxCYXJWID0gbmV3IFZTY3JvbGxCYXIodGhpcy5jb250YWluZXIsIHRoaXMpO1xuICAgICAgICB0aGlzLnNjcm9sbEJhckggPSBuZXcgSFNjcm9sbEJhcih0aGlzLmNvbnRhaW5lciwgdGhpcyk7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5vbihcInNjcm9sbFwiLCBmdW5jdGlvbihldmVudCwgc2Nyb2xsQmFyOiBWU2Nyb2xsQmFyKSB7XG4gICAgICAgICAgICBpZiAoIV9zZWxmLiRzY3JvbGxBbmltYXRpb24pIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXNzaW9uLnNldFNjcm9sbFRvcChldmVudC5kYXRhIC0gX3NlbGYuc2Nyb2xsTWFyZ2luLnRvcCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnNjcm9sbEJhckgub24oXCJzY3JvbGxcIiwgZnVuY3Rpb24oZXZlbnQsIHNjcm9sbEJhcjogSFNjcm9sbEJhcikge1xuICAgICAgICAgICAgaWYgKCFfc2VsZi4kc2Nyb2xsQW5pbWF0aW9uKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KGV2ZW50LmRhdGEgLSBfc2VsZi5zY3JvbGxNYXJnaW4ubGVmdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuY3Vyc29yUG9zID0ge1xuICAgICAgICAgICAgcm93OiAwLFxuICAgICAgICAgICAgY29sdW1uOiAwXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy4kZm9udE1ldHJpY3MgPSBuZXcgRm9udE1ldHJpY3ModGhpcy5jb250YWluZXIsIDUwMCk7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci4kc2V0Rm9udE1ldHJpY3ModGhpcy4kZm9udE1ldHJpY3MpO1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIub24oXCJjaGFuZ2VDaGFyYWN0ZXJTaXplXCIsIGZ1bmN0aW9uKGV2ZW50LCB0ZXh0OiBUZXh0KSB7XG4gICAgICAgICAgICBfc2VsZi51cGRhdGVDaGFyYWN0ZXJTaXplKCk7XG4gICAgICAgICAgICBfc2VsZi5vblJlc2l6ZSh0cnVlLCBfc2VsZi5ndXR0ZXJXaWR0aCwgX3NlbGYuJHNpemUud2lkdGgsIF9zZWxmLiRzaXplLmhlaWdodCk7XG4gICAgICAgICAgICBfc2VsZi5fc2lnbmFsKFwiY2hhbmdlQ2hhcmFjdGVyU2l6ZVwiLCBldmVudCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuJHNpemUgPSB7XG4gICAgICAgICAgICB3aWR0aDogMCxcbiAgICAgICAgICAgIGhlaWdodDogMCxcbiAgICAgICAgICAgIHNjcm9sbGVySGVpZ2h0OiAwLFxuICAgICAgICAgICAgc2Nyb2xsZXJXaWR0aDogMCxcbiAgICAgICAgICAgICRkaXJ0eTogdHJ1ZVxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuJGxvb3AgPSBuZXcgUmVuZGVyTG9vcCh0aGlzLiRyZW5kZXJDaGFuZ2VzLmJpbmQodGhpcyksIHRoaXMuY29udGFpbmVyLm93bmVyRG9jdW1lbnQuZGVmYXVsdFZpZXcpO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcblxuICAgICAgICB0aGlzLnVwZGF0ZUNoYXJhY3RlclNpemUoKTtcbiAgICAgICAgdGhpcy5zZXRQYWRkaW5nKDQpO1xuICAgICAgICByZXNldE9wdGlvbnModGhpcyk7XG4gICAgICAgIF9lbWl0KFwicmVuZGVyZXJcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5IG1heExpbmVzXG4gICAgICogQHR5cGUgbnVtYmVyXG4gICAgICovXG4gICAgc2V0IG1heExpbmVzKG1heExpbmVzOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy4kbWF4TGluZXMgPSBtYXhMaW5lcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkga2VlcFRleHRBcmVhQXRDdXJzb3JcbiAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICovXG4gICAgc2V0IGtlZXBUZXh0QXJlYUF0Q3Vyc29yKGtlZXBUZXh0QXJlYUF0Q3Vyc29yOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0ga2VlcFRleHRBcmVhQXRDdXJzb3I7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgPGNvZGU+c3R5bGU8L2NvZGU+IHByb3BlcnR5IG9mIHRoZSBjb250ZW50IHRvIFwiZGVmYXVsdFwiLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXREZWZhdWx0Q3Vyc29yU3R5bGVcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldERlZmF1bHRDdXJzb3JTdHlsZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLmN1cnNvciA9IFwiZGVmYXVsdFwiO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIDxjb2RlPm9wYWNpdHk8L2NvZGU+IG9mIHRoZSBjdXJzb3IgbGF5ZXIgdG8gXCIwXCIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldEN1cnNvckxheWVyT2ZmXG4gICAgICogQHJldHVybiB7VmlydHVhbFJlbmRlcmVyfVxuICAgICAqIEBjaGFpbmFibGVcbiAgICAgKi9cbiAgICBzZXRDdXJzb3JMYXllck9mZigpOiBWaXJ0dWFsUmVuZGVyZXIge1xuICAgICAgICB2YXIgbm9vcCA9IGZ1bmN0aW9uKCkgeyB9O1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5yZXN0YXJ0VGltZXIgPSBub29wO1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5lbGVtZW50LnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCB1cGRhdGVDaGFyYWN0ZXJTaXplXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICB1cGRhdGVDaGFyYWN0ZXJTaXplKCk6IHZvaWQge1xuICAgICAgICAvLyBGSVhNRTogREdIIGFsbG93Qm9sZEZvbnRzIGRvZXMgbm90IGV4aXN0IG9uIFRleHRcbiAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllclsnYWxsb3dCb2xkRm9udHMnXSAhPSB0aGlzLiRhbGxvd0JvbGRGb250cykge1xuICAgICAgICAgICAgdGhpcy4kYWxsb3dCb2xkRm9udHMgPSB0aGlzLiR0ZXh0TGF5ZXJbJ2FsbG93Qm9sZEZvbnRzJ107XG4gICAgICAgICAgICB0aGlzLnNldFN0eWxlKFwiYWNlX25vYm9sZFwiLCAhdGhpcy4kYWxsb3dCb2xkRm9udHMpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5sYXllckNvbmZpZy5jaGFyYWN0ZXJXaWR0aCA9IHRoaXMuY2hhcmFjdGVyV2lkdGggPSB0aGlzLiR0ZXh0TGF5ZXIuZ2V0Q2hhcmFjdGVyV2lkdGgoKTtcbiAgICAgICAgdGhpcy5sYXllckNvbmZpZy5saW5lSGVpZ2h0ID0gdGhpcy5saW5lSGVpZ2h0ID0gdGhpcy4kdGV4dExheWVyLmdldExpbmVIZWlnaHQoKTtcbiAgICAgICAgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBc3NvY2lhdGVzIHRoZSByZW5kZXJlciB3aXRoIGEgZGlmZmVyZW50IEVkaXRTZXNzaW9uLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRTZXNzaW9uXG4gICAgICogQHBhcmFtIHNlc3Npb24ge0VkaXRTZXNzaW9ufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0U2Vzc2lvbihzZXNzaW9uOiBFZGl0U2Vzc2lvbik6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uKSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uZG9jLm9mZihcImNoYW5nZU5ld0xpbmVNb2RlXCIsIHRoaXMub25DaGFuZ2VOZXdMaW5lTW9kZSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24gPSBzZXNzaW9uO1xuICAgICAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLnNjcm9sbE1hcmdpbi50b3AgJiYgc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSA8PSAwKSB7XG4gICAgICAgICAgICBzZXNzaW9uLnNldFNjcm9sbFRvcCgtdGhpcy5zY3JvbGxNYXJnaW4udG9wKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJG1hcmtlckJhY2suc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQuc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgICAgICB0aGlzLnNlc3Npb24uJHNldEZvbnRNZXRyaWNzKHRoaXMuJGZvbnRNZXRyaWNzKTtcblxuICAgICAgICB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUgPSB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlKClcbiAgICAgICAgdGhpcy5zZXNzaW9uLmRvYy5vbihcImNoYW5nZU5ld0xpbmVNb2RlXCIsIHRoaXMub25DaGFuZ2VOZXdMaW5lTW9kZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJpZ2dlcnMgYSBwYXJ0aWFsIHVwZGF0ZSBvZiB0aGUgdGV4dCwgZnJvbSB0aGUgcmFuZ2UgZ2l2ZW4gYnkgdGhlIHR3byBwYXJhbWV0ZXJzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBmaXJzdCByb3cgdG8gdXBkYXRlLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBsYXN0IHJvdyB0byB1cGRhdGUuXG4gICAgICogQHBhcmFtIFtmb3JjZV0ge2Jvb2xlYW59XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICB1cGRhdGVMaW5lcyhmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIsIGZvcmNlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICBpZiAobGFzdFJvdyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBsYXN0Um93ID0gSW5maW5pdHk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuJGNoYW5nZWRMaW5lcykge1xuICAgICAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzID0geyBmaXJzdFJvdzogZmlyc3RSb3csIGxhc3RSb3c6IGxhc3RSb3cgfTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiRjaGFuZ2VkTGluZXMuZmlyc3RSb3cgPiBmaXJzdFJvdykge1xuICAgICAgICAgICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcy5maXJzdFJvdyA9IGZpcnN0Um93O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3cgPCBsYXN0Um93KSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3cgPSBsYXN0Um93O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgdGhlIGNoYW5nZSBoYXBwZW5lZCBvZmZzY3JlZW4gYWJvdmUgdXMgdGhlbiBpdCdzIHBvc3NpYmxlXG4gICAgICAgIC8vIHRoYXQgYSBuZXcgbGluZSB3cmFwIHdpbGwgYWZmZWN0IHRoZSBwb3NpdGlvbiBvZiB0aGUgbGluZXMgb24gb3VyXG4gICAgICAgIC8vIHNjcmVlbiBzbyB0aGV5IG5lZWQgcmVkcmF3bi5cbiAgICAgICAgLy8gVE9ETzogYmV0dGVyIHNvbHV0aW9uIGlzIHRvIG5vdCBjaGFuZ2Ugc2Nyb2xsIHBvc2l0aW9uIHdoZW4gdGV4dCBpcyBjaGFuZ2VkIG91dHNpZGUgb2YgdmlzaWJsZSBhcmVhXG4gICAgICAgIGlmICh0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdyA8IHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3cpIHtcbiAgICAgICAgICAgIGlmIChmb3JjZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93ID0gdGhpcy5sYXllckNvbmZpZy5sYXN0Um93O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuJGNoYW5nZWRMaW5lcy5maXJzdFJvdyA+IHRoaXMubGF5ZXJDb25maWcubGFzdFJvdykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0xJTkVTKTtcbiAgICB9XG5cbiAgICBvbkNoYW5nZU5ld0xpbmVNb2RlKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9URVhUKTtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLiR1cGRhdGVFb2xDaGFyKCk7XG4gICAgfVxuXG4gICAgb25DaGFuZ2VUYWJTaXplKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy4kbG9vcCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJGxvb3Auc2NoZWR1bGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9URVhUIHwgQ0hBTkdFX01BUktFUik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyLm9uQ2hhbmdlVGFiU2l6ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci5vbkNoYW5nZVRhYlNpemUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEknbSBub3Qgc3VyZSB3aHkgd2UgY2FuIG5vdyBlbmQgdXAgaGVyZS5cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyaWdnZXJzIGEgZnVsbCB1cGRhdGUgb2YgdGhlIHRleHQsIGZvciBhbGwgdGhlIHJvd3MuXG4gICAgICovXG4gICAgdXBkYXRlVGV4dCgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfVEVYVCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJpZ2dlcnMgYSBmdWxsIHVwZGF0ZSBvZiBhbGwgdGhlIGxheWVycywgZm9yIGFsbCB0aGUgcm93cy5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGZvcmNlIElmIGB0cnVlYCwgZm9yY2VzIHRoZSBjaGFuZ2VzIHRocm91Z2hcbiAgICAgKi9cbiAgICB1cGRhdGVGdWxsKGZvcmNlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICBpZiAoZm9yY2UpXG4gICAgICAgICAgICB0aGlzLiRyZW5kZXJDaGFuZ2VzKENIQU5HRV9GVUxMLCB0cnVlKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVXBkYXRlcyB0aGUgZm9udCBzaXplLlxuICAgICAqL1xuICAgIHVwZGF0ZUZvbnRTaXplKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuY2hlY2tGb3JTaXplQ2hhbmdlcygpO1xuICAgIH1cblxuICAgICR1cGRhdGVTaXplQXN5bmMoKSB7XG4gICAgICAgIGlmICh0aGlzLiRsb29wLnBlbmRpbmcpIHtcbiAgICAgICAgICAgIHRoaXMuJHNpemUuJGRpcnR5ID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMub25SZXNpemUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFtUcmlnZ2VycyBhIHJlc2l6ZSBvZiB0aGUgZWRpdG9yLl17OiAjVmlydHVhbFJlbmRlcmVyLm9uUmVzaXplfVxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZm9yY2UgSWYgYHRydWVgLCByZWNvbXB1dGVzIHRoZSBzaXplLCBldmVuIGlmIHRoZSBoZWlnaHQgYW5kIHdpZHRoIGhhdmVuJ3QgY2hhbmdlZFxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBndXR0ZXJXaWR0aCBUaGUgd2lkdGggb2YgdGhlIGd1dHRlciBpbiBwaXhlbHNcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gd2lkdGggVGhlIHdpZHRoIG9mIHRoZSBlZGl0b3IgaW4gcGl4ZWxzXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGhlaWdodCBUaGUgaGllaGd0IG9mIHRoZSBlZGl0b3IsIGluIHBpeGVsc1xuICAgICAqL1xuICAgIG9uUmVzaXplKGZvcmNlPzogYm9vbGVhbiwgZ3V0dGVyV2lkdGg/OiBudW1iZXIsIHdpZHRoPzogbnVtYmVyLCBoZWlnaHQ/OiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHRoaXMucmVzaXppbmcgPiAyKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBlbHNlIGlmICh0aGlzLnJlc2l6aW5nID4gMClcbiAgICAgICAgICAgIHRoaXMucmVzaXppbmcrKztcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy5yZXNpemluZyA9IGZvcmNlID8gMSA6IDA7XG4gICAgICAgIC8vIGB8fCBlbC5zY3JvbGxIZWlnaHRgIGlzIHJlcXVpcmVkIGZvciBvdXRvc2l6aW5nIGVkaXRvcnMgb24gaWVcbiAgICAgICAgLy8gd2hlcmUgZWxlbWVudHMgd2l0aCBjbGllbnRIZWlnaHQgPSAwIGFsc29lIGhhdmUgY2xpZW50V2lkdGggPSAwXG4gICAgICAgIHZhciBlbCA9IHRoaXMuY29udGFpbmVyO1xuICAgICAgICBpZiAoIWhlaWdodClcbiAgICAgICAgICAgIGhlaWdodCA9IGVsLmNsaWVudEhlaWdodCB8fCBlbC5zY3JvbGxIZWlnaHQ7XG4gICAgICAgIGlmICghd2lkdGgpXG4gICAgICAgICAgICB3aWR0aCA9IGVsLmNsaWVudFdpZHRoIHx8IGVsLnNjcm9sbFdpZHRoO1xuICAgICAgICB2YXIgY2hhbmdlcyA9IHRoaXMuJHVwZGF0ZUNhY2hlZFNpemUoZm9yY2UsIGd1dHRlcldpZHRoLCB3aWR0aCwgaGVpZ2h0KTtcblxuXG4gICAgICAgIGlmICghdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCB8fCAoIXdpZHRoICYmICFoZWlnaHQpKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucmVzaXppbmcgPSAwO1xuXG4gICAgICAgIGlmIChmb3JjZSlcbiAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLiRwYWRkaW5nID0gbnVsbDtcblxuICAgICAgICBpZiAoZm9yY2UpXG4gICAgICAgICAgICB0aGlzLiRyZW5kZXJDaGFuZ2VzKGNoYW5nZXMgfCB0aGlzLiRjaGFuZ2VzLCB0cnVlKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShjaGFuZ2VzIHwgdGhpcy4kY2hhbmdlcyk7XG5cbiAgICAgICAgaWYgKHRoaXMucmVzaXppbmcpXG4gICAgICAgICAgICB0aGlzLnJlc2l6aW5nID0gMDtcbiAgICB9XG5cbiAgICAkdXBkYXRlQ2FjaGVkU2l6ZShmb3JjZSwgZ3V0dGVyV2lkdGgsIHdpZHRoLCBoZWlnaHQpIHtcbiAgICAgICAgaGVpZ2h0IC09ICh0aGlzLiRleHRyYUhlaWdodCB8fCAwKTtcbiAgICAgICAgdmFyIGNoYW5nZXMgPSAwO1xuICAgICAgICB2YXIgc2l6ZSA9IHRoaXMuJHNpemU7XG4gICAgICAgIHZhciBvbGRTaXplID0ge1xuICAgICAgICAgICAgd2lkdGg6IHNpemUud2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQ6IHNpemUuaGVpZ2h0LFxuICAgICAgICAgICAgc2Nyb2xsZXJIZWlnaHQ6IHNpemUuc2Nyb2xsZXJIZWlnaHQsXG4gICAgICAgICAgICBzY3JvbGxlcldpZHRoOiBzaXplLnNjcm9sbGVyV2lkdGhcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKGhlaWdodCAmJiAoZm9yY2UgfHwgc2l6ZS5oZWlnaHQgIT0gaGVpZ2h0KSkge1xuICAgICAgICAgICAgc2l6ZS5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgICAgICBjaGFuZ2VzIHw9IENIQU5HRV9TSVpFO1xuXG4gICAgICAgICAgICBzaXplLnNjcm9sbGVySGVpZ2h0ID0gc2l6ZS5oZWlnaHQ7XG4gICAgICAgICAgICBpZiAodGhpcy4kaG9yaXpTY3JvbGwpXG4gICAgICAgICAgICAgICAgc2l6ZS5zY3JvbGxlckhlaWdodCAtPSB0aGlzLnNjcm9sbEJhckguaGVpZ2h0O1xuXG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhclYuZWxlbWVudC5zdHlsZS5ib3R0b20gPSB0aGlzLnNjcm9sbEJhckguaGVpZ2h0ICsgXCJweFwiO1xuXG4gICAgICAgICAgICBjaGFuZ2VzID0gY2hhbmdlcyB8IENIQU5HRV9TQ1JPTEw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAod2lkdGggJiYgKGZvcmNlIHx8IHNpemUud2lkdGggIT0gd2lkdGgpKSB7XG4gICAgICAgICAgICBjaGFuZ2VzIHw9IENIQU5HRV9TSVpFO1xuICAgICAgICAgICAgc2l6ZS53aWR0aCA9IHdpZHRoO1xuXG4gICAgICAgICAgICBpZiAoZ3V0dGVyV2lkdGggPT0gbnVsbClcbiAgICAgICAgICAgICAgICBndXR0ZXJXaWR0aCA9IHRoaXMuJHNob3dHdXR0ZXIgPyB0aGlzLiRndXR0ZXIub2Zmc2V0V2lkdGggOiAwO1xuXG4gICAgICAgICAgICB0aGlzLmd1dHRlcldpZHRoID0gZ3V0dGVyV2lkdGg7XG5cbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFySC5lbGVtZW50LnN0eWxlLmxlZnQgPVxuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsZXIuc3R5bGUubGVmdCA9IGd1dHRlcldpZHRoICsgXCJweFwiO1xuICAgICAgICAgICAgc2l6ZS5zY3JvbGxlcldpZHRoID0gTWF0aC5tYXgoMCwgd2lkdGggLSBndXR0ZXJXaWR0aCAtIHRoaXMuc2Nyb2xsQmFyVi53aWR0aCk7XG5cbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFySC5lbGVtZW50LnN0eWxlLnJpZ2h0ID1cbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbGVyLnN0eWxlLnJpZ2h0ID0gdGhpcy5zY3JvbGxCYXJWLndpZHRoICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxlci5zdHlsZS5ib3R0b20gPSB0aGlzLnNjcm9sbEJhckguaGVpZ2h0ICsgXCJweFwiO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5zZXNzaW9uICYmIHRoaXMuc2Vzc2lvbi5nZXRVc2VXcmFwTW9kZSgpICYmIHRoaXMuYWRqdXN0V3JhcExpbWl0KCkgfHwgZm9yY2UpXG4gICAgICAgICAgICAgICAgY2hhbmdlcyB8PSBDSEFOR0VfRlVMTDtcbiAgICAgICAgfVxuXG4gICAgICAgIHNpemUuJGRpcnR5ID0gIXdpZHRoIHx8ICFoZWlnaHQ7XG5cbiAgICAgICAgaWYgKGNoYW5nZXMpXG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJyZXNpemVcIiwgb2xkU2l6ZSk7XG5cbiAgICAgICAgcmV0dXJuIGNoYW5nZXM7XG4gICAgfVxuXG4gICAgb25HdXR0ZXJSZXNpemUoKSB7XG4gICAgICAgIHZhciBndXR0ZXJXaWR0aCA9IHRoaXMuJHNob3dHdXR0ZXIgPyB0aGlzLiRndXR0ZXIub2Zmc2V0V2lkdGggOiAwO1xuICAgICAgICBpZiAoZ3V0dGVyV2lkdGggIT0gdGhpcy5ndXR0ZXJXaWR0aClcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZXMgfD0gdGhpcy4kdXBkYXRlQ2FjaGVkU2l6ZSh0cnVlLCBndXR0ZXJXaWR0aCwgdGhpcy4kc2l6ZS53aWR0aCwgdGhpcy4kc2l6ZS5oZWlnaHQpO1xuXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKSAmJiB0aGlzLmFkanVzdFdyYXBMaW1pdCgpKSB7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLiRzaXplLiRkaXJ0eSkge1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiRjb21wdXRlTGF5ZXJDb25maWcoKTtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX01BUktFUik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEFkanVzdHMgdGhlIHdyYXAgbGltaXQsIHdoaWNoIGlzIHRoZSBudW1iZXIgb2YgY2hhcmFjdGVycyB0aGF0IGNhbiBmaXQgd2l0aGluIHRoZSB3aWR0aCBvZiB0aGUgZWRpdCBhcmVhIG9uIHNjcmVlbi5cbiAgICAqKi9cbiAgICBhZGp1c3RXcmFwTGltaXQoKSB7XG4gICAgICAgIHZhciBhdmFpbGFibGVXaWR0aCA9IHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCAtIHRoaXMuJHBhZGRpbmcgKiAyO1xuICAgICAgICB2YXIgbGltaXQgPSBNYXRoLmZsb29yKGF2YWlsYWJsZVdpZHRoIC8gdGhpcy5jaGFyYWN0ZXJXaWR0aCk7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uYWRqdXN0V3JhcExpbWl0KGxpbWl0LCB0aGlzLiRzaG93UHJpbnRNYXJnaW4gJiYgdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBoYXZlIGFuIGFuaW1hdGVkIHNjcm9sbCBvciBub3QuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldEFuaW1hdGVkU2Nyb2xsXG4gICAgICogQHBhcmFtIHNob3VsZEFuaW1hdGUge2Jvb2xlYW59IFNldCB0byBgdHJ1ZWAgdG8gc2hvdyBhbmltYXRlZCBzY3JvbGxzLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0QW5pbWF0ZWRTY3JvbGwoc2hvdWxkQW5pbWF0ZTogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImFuaW1hdGVkU2Nyb2xsXCIsIHNob3VsZEFuaW1hdGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciBhbiBhbmltYXRlZCBzY3JvbGwgaGFwcGVucyBvciBub3QuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldEFuaW1hdGVkU2Nyb2xsXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRBbmltYXRlZFNjcm9sbCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGFuaW1hdGVkU2Nyb2xsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IGludmlzaWJsZSBjaGFyYWN0ZXJzIG9yIG5vdC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3dJbnZpc2libGVzIFNldCB0byBgdHJ1ZWAgdG8gc2hvdyBpbnZpc2libGVzXG4gICAgICovXG4gICAgc2V0U2hvd0ludmlzaWJsZXMoc2hvd0ludmlzaWJsZXM6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJzaG93SW52aXNpYmxlc1wiLCBzaG93SW52aXNpYmxlcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB3aGV0aGVyIGludmlzaWJsZSBjaGFyYWN0ZXJzIGFyZSBiZWluZyBzaG93biBvciBub3QuXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93SW52aXNpYmxlcygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwic2hvd0ludmlzaWJsZXNcIik7XG4gICAgfVxuXG4gICAgZ2V0RGlzcGxheUluZGVudEd1aWRlcygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiZGlzcGxheUluZGVudEd1aWRlc1wiKTtcbiAgICB9XG5cbiAgICBzZXREaXNwbGF5SW5kZW50R3VpZGVzKGRpc3BsYXlJbmRlbnRHdWlkZXM6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJkaXNwbGF5SW5kZW50R3VpZGVzXCIsIGRpc3BsYXlJbmRlbnRHdWlkZXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IHRoZSBwcmludCBtYXJnaW4gb3Igbm90LlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvd1ByaW50TWFyZ2luIFNldCB0byBgdHJ1ZWAgdG8gc2hvdyB0aGUgcHJpbnQgbWFyZ2luXG4gICAgICpcbiAgICAgKi9cbiAgICBzZXRTaG93UHJpbnRNYXJnaW4oc2hvd1ByaW50TWFyZ2luOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwic2hvd1ByaW50TWFyZ2luXCIsIHNob3dQcmludE1hcmdpbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB3aGV0aGVyIHRoZSBwcmludCBtYXJnaW4gaXMgYmVpbmcgc2hvd24gb3Igbm90LlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd1ByaW50TWFyZ2luKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzaG93UHJpbnRNYXJnaW5cIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgY29sdW1uIGRlZmluaW5nIHdoZXJlIHRoZSBwcmludCBtYXJnaW4gc2hvdWxkIGJlLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBwcmludE1hcmdpbkNvbHVtbiBTcGVjaWZpZXMgdGhlIG5ldyBwcmludCBtYXJnaW5cbiAgICAgKi9cbiAgICBzZXRQcmludE1hcmdpbkNvbHVtbihwcmludE1hcmdpbkNvbHVtbjogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwicHJpbnRNYXJnaW5Db2x1bW5cIiwgcHJpbnRNYXJnaW5Db2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGNvbHVtbiBudW1iZXIgb2Ygd2hlcmUgdGhlIHByaW50IG1hcmdpbiBpcy5cbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgICovXG4gICAgZ2V0UHJpbnRNYXJnaW5Db2x1bW4oKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwicHJpbnRNYXJnaW5Db2x1bW5cIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGd1dHRlciBpcyBiZWluZyBzaG93bi5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqL1xuICAgIGdldFNob3dHdXR0ZXIoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInNob3dHdXR0ZXJcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyB0aGUgZ3V0dGVyIG9yIG5vdC5cbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvdyBTZXQgdG8gYHRydWVgIHRvIHNob3cgdGhlIGd1dHRlclxuICAgICpcbiAgICAqKi9cbiAgICBzZXRTaG93R3V0dGVyKHNob3cpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0T3B0aW9uKFwic2hvd0d1dHRlclwiLCBzaG93KTtcbiAgICB9XG5cbiAgICBnZXRGYWRlRm9sZFdpZGdldHMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImZhZGVGb2xkV2lkZ2V0c1wiKVxuICAgIH1cblxuICAgIHNldEZhZGVGb2xkV2lkZ2V0cyhzaG93KSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiZmFkZUZvbGRXaWRnZXRzXCIsIHNob3cpO1xuICAgIH1cblxuICAgIHNldEhpZ2hsaWdodEd1dHRlckxpbmUoc2hvdWxkSGlnaGxpZ2h0KSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiaGlnaGxpZ2h0R3V0dGVyTGluZVwiLCBzaG91bGRIaWdobGlnaHQpO1xuICAgIH1cblxuICAgIGdldEhpZ2hsaWdodEd1dHRlckxpbmUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImhpZ2hsaWdodEd1dHRlckxpbmVcIik7XG4gICAgfVxuXG4gICAgJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQoKSB7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLiRjdXJzb3JMYXllci4kcGl4ZWxQb3M7XG4gICAgICAgIHZhciBoZWlnaHQgPSB0aGlzLmxheWVyQ29uZmlnLmxpbmVIZWlnaHQ7XG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKSkge1xuICAgICAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuc2Vzc2lvbi5nZXRTZWxlY3Rpb24oKS5nZXRDdXJzb3IoKTtcbiAgICAgICAgICAgIGN1cnNvci5jb2x1bW4gPSAwO1xuICAgICAgICAgICAgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuZ2V0UGl4ZWxQb3NpdGlvbihjdXJzb3IsIHRydWUpO1xuICAgICAgICAgICAgaGVpZ2h0ICo9IHRoaXMuc2Vzc2lvbi5nZXRSb3dMZW5ndGgoY3Vyc29yLnJvdyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodC5zdHlsZS50b3AgPSBwb3MudG9wIC0gdGhpcy5sYXllckNvbmZpZy5vZmZzZXQgKyBcInB4XCI7XG4gICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuc3R5bGUuaGVpZ2h0ID0gaGVpZ2h0ICsgXCJweFwiO1xuICAgIH1cblxuICAgICR1cGRhdGVQcmludE1hcmdpbigpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRzaG93UHJpbnRNYXJnaW4gJiYgIXRoaXMuJHByaW50TWFyZ2luRWwpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKCF0aGlzLiRwcmludE1hcmdpbkVsKSB7XG4gICAgICAgICAgICB2YXIgY29udGFpbmVyRWw6IEhUTUxEaXZFbGVtZW50ID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICBjb250YWluZXJFbC5jbGFzc05hbWUgPSBcImFjZV9sYXllciBhY2VfcHJpbnQtbWFyZ2luLWxheWVyXCI7XG4gICAgICAgICAgICB0aGlzLiRwcmludE1hcmdpbkVsID0gY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIHRoaXMuJHByaW50TWFyZ2luRWwuY2xhc3NOYW1lID0gXCJhY2VfcHJpbnQtbWFyZ2luXCI7XG4gICAgICAgICAgICBjb250YWluZXJFbC5hcHBlbmRDaGlsZCh0aGlzLiRwcmludE1hcmdpbkVsKTtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5pbnNlcnRCZWZvcmUoY29udGFpbmVyRWwsIHRoaXMuY29udGVudC5maXJzdENoaWxkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzdHlsZSA9IHRoaXMuJHByaW50TWFyZ2luRWwuc3R5bGU7XG4gICAgICAgIHN0eWxlLmxlZnQgPSAoKHRoaXMuY2hhcmFjdGVyV2lkdGggKiB0aGlzLiRwcmludE1hcmdpbkNvbHVtbikgKyB0aGlzLiRwYWRkaW5nKSArIFwicHhcIjtcbiAgICAgICAgc3R5bGUudmlzaWJpbGl0eSA9IHRoaXMuJHNob3dQcmludE1hcmdpbiA/IFwidmlzaWJsZVwiIDogXCJoaWRkZW5cIjtcblxuICAgICAgICBpZiAodGhpcy5zZXNzaW9uICYmIHRoaXMuc2Vzc2lvblsnJHdyYXAnXSA9PSAtMSlcbiAgICAgICAgICAgIHRoaXMuYWRqdXN0V3JhcExpbWl0KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgcm9vdCBlbGVtZW50IGNvbnRhaW5pbmcgdGhpcyByZW5kZXJlci5cbiAgICAqIEByZXR1cm4ge0RPTUVsZW1lbnR9XG4gICAgKiovXG4gICAgZ2V0Q29udGFpbmVyRWxlbWVudCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGFpbmVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGVsZW1lbnQgdGhhdCB0aGUgbW91c2UgZXZlbnRzIGFyZSBhdHRhY2hlZCB0b1xuICAgICogQHJldHVybiB7RE9NRWxlbWVudH1cbiAgICAqKi9cbiAgICBnZXRNb3VzZUV2ZW50VGFyZ2V0KCk6IEhUTUxEaXZFbGVtZW50IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGVudDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBlbGVtZW50IHRvIHdoaWNoIHRoZSBoaWRkZW4gdGV4dCBhcmVhIGlzIGFkZGVkLlxuICAgICogQHJldHVybiB7RE9NRWxlbWVudH1cbiAgICAqKi9cbiAgICBnZXRUZXh0QXJlYUNvbnRhaW5lcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGFpbmVyO1xuICAgIH1cblxuICAgIC8vIG1vdmUgdGV4dCBpbnB1dCBvdmVyIHRoZSBjdXJzb3JcbiAgICAvLyB0aGlzIGlzIHJlcXVpcmVkIGZvciBpT1MgYW5kIElNRVxuICAgICRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvcilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIGNvbmZpZyA9IHRoaXMubGF5ZXJDb25maWc7XG4gICAgICAgIHZhciBwb3NUb3AgPSB0aGlzLiRjdXJzb3JMYXllci4kcGl4ZWxQb3MudG9wO1xuICAgICAgICB2YXIgcG9zTGVmdCA9IHRoaXMuJGN1cnNvckxheWVyLiRwaXhlbFBvcy5sZWZ0O1xuICAgICAgICBwb3NUb3AgLT0gY29uZmlnLm9mZnNldDtcblxuICAgICAgICB2YXIgaCA9IHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgaWYgKHBvc1RvcCA8IDAgfHwgcG9zVG9wID4gY29uZmlnLmhlaWdodCAtIGgpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHcgPSB0aGlzLmNoYXJhY3RlcldpZHRoO1xuICAgICAgICBpZiAodGhpcy4kY29tcG9zaXRpb24pIHtcbiAgICAgICAgICAgIHZhciB2YWwgPSB0aGlzLnRleHRhcmVhLnZhbHVlLnJlcGxhY2UoL15cXHgwMSsvLCBcIlwiKTtcbiAgICAgICAgICAgIHcgKj0gKHRoaXMuc2Vzc2lvbi4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgodmFsKVswXSArIDIpO1xuICAgICAgICAgICAgaCArPSAyO1xuICAgICAgICAgICAgcG9zVG9wIC09IDE7XG4gICAgICAgIH1cbiAgICAgICAgcG9zTGVmdCAtPSB0aGlzLnNjcm9sbExlZnQ7XG4gICAgICAgIGlmIChwb3NMZWZ0ID4gdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gdylcbiAgICAgICAgICAgIHBvc0xlZnQgPSB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSB3O1xuXG4gICAgICAgIHBvc0xlZnQgLT0gdGhpcy5zY3JvbGxCYXJWLndpZHRoO1xuXG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuaGVpZ2h0ID0gaCArIFwicHhcIjtcbiAgICAgICAgdGhpcy50ZXh0YXJlYS5zdHlsZS53aWR0aCA9IHcgKyBcInB4XCI7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUucmlnaHQgPSBNYXRoLm1heCgwLCB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSBwb3NMZWZ0IC0gdykgKyBcInB4XCI7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuYm90dG9tID0gTWF0aC5tYXgoMCwgdGhpcy4kc2l6ZS5oZWlnaHQgLSBwb3NUb3AgLSBoKSArIFwicHhcIjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBbUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGZpcnN0IHZpc2libGUgcm93Ll17OiAjVmlydHVhbFJlbmRlcmVyLmdldEZpcnN0VmlzaWJsZVJvd31cbiAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRGaXJzdFZpc2libGVSb3coKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBmaXJzdCBmdWxseSB2aXNpYmxlIHJvdy4gXCJGdWxseVwiIGhlcmUgbWVhbnMgdGhhdCB0aGUgY2hhcmFjdGVycyBpbiB0aGUgcm93IGFyZSBub3QgdHJ1bmNhdGVkOyB0aGF0IHRoZSB0b3AgYW5kIHRoZSBib3R0b20gb2YgdGhlIHJvdyBhcmUgb24gdGhlIHNjcmVlbi5cbiAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRGaXJzdEZ1bGx5VmlzaWJsZVJvdygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3cgKyAodGhpcy5sYXllckNvbmZpZy5vZmZzZXQgPT09IDAgPyAwIDogMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGxhc3QgZnVsbHkgdmlzaWJsZSByb3cuIFwiRnVsbHlcIiBoZXJlIG1lYW5zIHRoYXQgdGhlIGNoYXJhY3RlcnMgaW4gdGhlIHJvdyBhcmUgbm90IHRydW5jYXRlZDsgdGhhdCB0aGUgdG9wIGFuZCB0aGUgYm90dG9tIG9mIHRoZSByb3cgYXJlIG9uIHRoZSBzY3JlZW4uXG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0TGFzdEZ1bGx5VmlzaWJsZVJvdygpIHtcbiAgICAgICAgdmFyIGZsaW50ID0gTWF0aC5mbG9vcigodGhpcy5sYXllckNvbmZpZy5oZWlnaHQgKyB0aGlzLmxheWVyQ29uZmlnLm9mZnNldCkgLyB0aGlzLmxheWVyQ29uZmlnLmxpbmVIZWlnaHQpO1xuICAgICAgICByZXR1cm4gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdyAtIDEgKyBmbGludDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBbUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGxhc3QgdmlzaWJsZSByb3cuXXs6ICNWaXJ0dWFsUmVuZGVyZXIuZ2V0TGFzdFZpc2libGVSb3d9XG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0TGFzdFZpc2libGVSb3coKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxheWVyQ29uZmlnLmxhc3RSb3c7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZXRzIHRoZSBwYWRkaW5nIGZvciBhbGwgdGhlIGxheWVycy5cbiAgICAqIEBwYXJhbSB7bnVtYmVyfSBwYWRkaW5nIEEgbmV3IHBhZGRpbmcgdmFsdWUgKGluIHBpeGVscylcbiAgICAqKi9cbiAgICBzZXRQYWRkaW5nKHBhZGRpbmc6IG51bWJlcikge1xuICAgICAgICB0aGlzLiRwYWRkaW5nID0gcGFkZGluZztcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJG1hcmtlckZyb250LnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJG1hcmtlckJhY2suc2V0UGFkZGluZyhwYWRkaW5nKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG4gICAgICAgIHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7XG4gICAgfVxuXG4gICAgc2V0U2Nyb2xsTWFyZ2luKHRvcCwgYm90dG9tLCBsZWZ0LCByaWdodCkge1xuICAgICAgICB2YXIgc20gPSB0aGlzLnNjcm9sbE1hcmdpbjtcbiAgICAgICAgc20udG9wID0gdG9wIHwgMDtcbiAgICAgICAgc20uYm90dG9tID0gYm90dG9tIHwgMDtcbiAgICAgICAgc20ucmlnaHQgPSByaWdodCB8IDA7XG4gICAgICAgIHNtLmxlZnQgPSBsZWZ0IHwgMDtcbiAgICAgICAgc20udiA9IHNtLnRvcCArIHNtLmJvdHRvbTtcbiAgICAgICAgc20uaCA9IHNtLmxlZnQgKyBzbS5yaWdodDtcbiAgICAgICAgaWYgKHNtLnRvcCAmJiB0aGlzLnNjcm9sbFRvcCA8PSAwICYmIHRoaXMuc2Vzc2lvbilcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AoLXNtLnRvcCk7XG4gICAgICAgIHRoaXMudXBkYXRlRnVsbCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIgaXMgc2V0IHRvIGJlIGFsd2F5cyB2aXNpYmxlLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlKCkge1xuICAgICAgICAvLyBGSVhNRVxuICAgICAgICByZXR1cm4gdGhpcy4kaFNjcm9sbEJhckFsd2F5c1Zpc2libGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyIG9yIG5vdC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFsd2F5c1Zpc2libGUgU2V0IHRvIGB0cnVlYCB0byBtYWtlIHRoZSBob3Jpem9udGFsIHNjcm9sbCBiYXIgdmlzaWJsZVxuICAgICAqKi9cbiAgICBzZXRIU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZShhbHdheXNWaXNpYmxlKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiaFNjcm9sbEJhckFsd2F5c1Zpc2libGVcIiwgYWx3YXlzVmlzaWJsZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB3aGV0aGVyIHRoZSB2ZXJ0aWNhbCBzY3JvbGxiYXIgaXMgc2V0IHRvIGJlIGFsd2F5cyB2aXNpYmxlLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kdlNjcm9sbEJhckFsd2F5c1Zpc2libGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgdGhlIHZlcnRpY2FsIHNjcm9sbGJhciBvciBub3QuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbHdheXNWaXNpYmxlIFNldCB0byBgdHJ1ZWAgdG8gbWFrZSB0aGUgdmVydGljYWwgc2Nyb2xsIGJhciB2aXNpYmxlXG4gICAgICovXG4gICAgc2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUoYWx3YXlzVmlzaWJsZSkge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInZTY3JvbGxCYXJBbHdheXNWaXNpYmxlXCIsIGFsd2F5c1Zpc2libGUpO1xuICAgIH1cblxuICAgICR1cGRhdGVTY3JvbGxCYXJWKCkge1xuICAgICAgICB2YXIgc2Nyb2xsSGVpZ2h0ID0gdGhpcy5sYXllckNvbmZpZy5tYXhIZWlnaHQ7XG4gICAgICAgIHZhciBzY3JvbGxlckhlaWdodCA9IHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQ7XG4gICAgICAgIGlmICghdGhpcy4kbWF4TGluZXMgJiYgdGhpcy4kc2Nyb2xsUGFzdEVuZCkge1xuICAgICAgICAgICAgc2Nyb2xsSGVpZ2h0IC09IChzY3JvbGxlckhlaWdodCAtIHRoaXMubGluZUhlaWdodCkgKiB0aGlzLiRzY3JvbGxQYXN0RW5kO1xuICAgICAgICAgICAgaWYgKHRoaXMuc2Nyb2xsVG9wID4gc2Nyb2xsSGVpZ2h0IC0gc2Nyb2xsZXJIZWlnaHQpIHtcbiAgICAgICAgICAgICAgICBzY3JvbGxIZWlnaHQgPSB0aGlzLnNjcm9sbFRvcCArIHNjcm9sbGVySGVpZ2h0O1xuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zY3JvbGxUb3AgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zZXRTY3JvbGxIZWlnaHQoc2Nyb2xsSGVpZ2h0ICsgdGhpcy5zY3JvbGxNYXJnaW4udik7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zZXRTY3JvbGxUb3AodGhpcy5zY3JvbGxUb3AgKyB0aGlzLnNjcm9sbE1hcmdpbi50b3ApO1xuICAgIH1cblxuICAgICR1cGRhdGVTY3JvbGxCYXJIKCkge1xuICAgICAgICB0aGlzLnNjcm9sbEJhckguc2V0U2Nyb2xsV2lkdGgodGhpcy5sYXllckNvbmZpZy53aWR0aCArIDIgKiB0aGlzLiRwYWRkaW5nICsgdGhpcy5zY3JvbGxNYXJnaW4uaCk7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFySC5zZXRTY3JvbGxMZWZ0KHRoaXMuc2Nyb2xsTGVmdCArIHRoaXMuc2Nyb2xsTWFyZ2luLmxlZnQpO1xuICAgIH1cblxuICAgIGZyZWV6ZSgpIHtcbiAgICAgICAgdGhpcy4kZnJvemVuID0gdHJ1ZTtcbiAgICB9XG5cbiAgICB1bmZyZWV6ZSgpIHtcbiAgICAgICAgdGhpcy4kZnJvemVuID0gZmFsc2U7XG4gICAgfVxuXG4gICAgJHJlbmRlckNoYW5nZXMoY2hhbmdlcywgZm9yY2UpIHtcbiAgICAgICAgaWYgKHRoaXMuJGNoYW5nZXMpIHtcbiAgICAgICAgICAgIGNoYW5nZXMgfD0gdGhpcy4kY2hhbmdlcztcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZXMgPSAwO1xuICAgICAgICB9XG4gICAgICAgIGlmICgoIXRoaXMuc2Vzc2lvbiB8fCAhdGhpcy5jb250YWluZXIub2Zmc2V0V2lkdGggfHwgdGhpcy4kZnJvemVuKSB8fCAoIWNoYW5nZXMgJiYgIWZvcmNlKSkge1xuICAgICAgICAgICAgdGhpcy4kY2hhbmdlcyB8PSBjaGFuZ2VzO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLiRzaXplLiRkaXJ0eSkge1xuICAgICAgICAgICAgdGhpcy4kY2hhbmdlcyB8PSBjaGFuZ2VzO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMub25SZXNpemUodHJ1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLmxpbmVIZWlnaHQpIHtcbiAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci5jaGVja0ZvclNpemVDaGFuZ2VzKCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gdGhpcy4kbG9nQ2hhbmdlcyhjaGFuZ2VzKTtcblxuICAgICAgICB0aGlzLl9zaWduYWwoXCJiZWZvcmVSZW5kZXJcIik7XG4gICAgICAgIHZhciBjb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuICAgICAgICAvLyB0ZXh0LCBzY3JvbGxpbmcgYW5kIHJlc2l6ZSBjaGFuZ2VzIGNhbiBjYXVzZSB0aGUgdmlldyBwb3J0IHNpemUgdG8gY2hhbmdlXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0ZVTEwgfHxcbiAgICAgICAgICAgIGNoYW5nZXMgJiBDSEFOR0VfU0laRSB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9URVhUIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX0xJTkVTIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX1NDUk9MTCB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9IX1NDUk9MTFxuICAgICAgICApIHtcbiAgICAgICAgICAgIGNoYW5nZXMgfD0gdGhpcy4kY29tcHV0ZUxheWVyQ29uZmlnKCk7XG4gICAgICAgICAgICAvLyBJZiBhIGNoYW5nZSBpcyBtYWRlIG9mZnNjcmVlbiBhbmQgd3JhcE1vZGUgaXMgb24sIHRoZW4gdGhlIG9uc2NyZWVuXG4gICAgICAgICAgICAvLyBsaW5lcyBtYXkgaGF2ZSBiZWVuIHB1c2hlZCBkb3duLiBJZiBzbywgdGhlIGZpcnN0IHNjcmVlbiByb3cgd2lsbCBub3RcbiAgICAgICAgICAgIC8vIGhhdmUgY2hhbmdlZCwgYnV0IHRoZSBmaXJzdCBhY3R1YWwgcm93IHdpbGwuIEluIHRoYXQgY2FzZSwgYWRqdXN0IFxuICAgICAgICAgICAgLy8gc2Nyb2xsVG9wIHNvIHRoYXQgdGhlIGN1cnNvciBhbmQgb25zY3JlZW4gY29udGVudCBzdGF5cyBpbiB0aGUgc2FtZSBwbGFjZS5cbiAgICAgICAgICAgIGlmIChjb25maWcuZmlyc3RSb3cgIT0gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdyAmJiBjb25maWcuZmlyc3RSb3dTY3JlZW4gPT0gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvd1NjcmVlbikge1xuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsVG9wID0gdGhpcy5zY3JvbGxUb3AgKyAoY29uZmlnLmZpcnN0Um93IC0gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdykgKiB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgICAgICAgICAgY2hhbmdlcyA9IGNoYW5nZXMgfCBDSEFOR0VfU0NST0xMO1xuICAgICAgICAgICAgICAgIGNoYW5nZXMgfD0gdGhpcy4kY29tcHV0ZUxheWVyQ29uZmlnKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuICAgICAgICAgICAgLy8gdXBkYXRlIHNjcm9sbGJhciBmaXJzdCB0byBub3QgbG9zZSBzY3JvbGwgcG9zaXRpb24gd2hlbiBndXR0ZXIgY2FsbHMgcmVzaXplXG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVTY3JvbGxCYXJWKCk7XG4gICAgICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9IX1NDUk9MTClcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVTY3JvbGxCYXJIKCk7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5lbGVtZW50LnN0eWxlLm1hcmdpblRvcCA9ICgtY29uZmlnLm9mZnNldCkgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUubWFyZ2luVG9wID0gKC1jb25maWcub2Zmc2V0KSArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS53aWR0aCA9IGNvbmZpZy53aWR0aCArIDIgKiB0aGlzLiRwYWRkaW5nICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLmhlaWdodCA9IGNvbmZpZy5taW5IZWlnaHQgKyBcInB4XCI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBob3Jpem9udGFsIHNjcm9sbGluZ1xuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9IX1NDUk9MTCkge1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLm1hcmdpbkxlZnQgPSAtdGhpcy5zY3JvbGxMZWZ0ICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxlci5jbGFzc05hbWUgPSB0aGlzLnNjcm9sbExlZnQgPD0gMCA/IFwiYWNlX3Njcm9sbGVyXCIgOiBcImFjZV9zY3JvbGxlciBhY2Vfc2Nyb2xsLWxlZnRcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGZ1bGxcbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfRlVMTCkge1xuICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRjdXJzb3JMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgICAgICAgICB0aGlzLiRoaWdobGlnaHRHdXR0ZXJMaW5lICYmIHRoaXMuJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQoKTtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImFmdGVyUmVuZGVyXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gc2Nyb2xsaW5nXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX1NDUk9MTCkge1xuICAgICAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfVEVYVCB8fCBjaGFuZ2VzICYgQ0hBTkdFX0xJTkVTKVxuICAgICAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuc2Nyb2xsTGluZXMoY29uZmlnKTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRjdXJzb3JMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJGhpZ2hsaWdodEd1dHRlckxpbmUgJiYgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuICAgICAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImFmdGVyUmVuZGVyXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfVEVYVCkge1xuICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2hhbmdlcyAmIENIQU5HRV9MSU5FUykge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHVwZGF0ZUxpbmVzKCkgfHwgKGNoYW5nZXMgJiBDSEFOR0VfR1VUVEVSKSAmJiB0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoYW5nZXMgJiBDSEFOR0VfVEVYVCB8fCBjaGFuZ2VzICYgQ0hBTkdFX0dVVFRFUikge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9DVVJTT1IpIHtcbiAgICAgICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICAgICAgICAgIHRoaXMuJGhpZ2hsaWdodEd1dHRlckxpbmUgJiYgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoYW5nZXMgJiAoQ0hBTkdFX01BUktFUiB8IENIQU5HRV9NQVJLRVJfRlJPTlQpKSB7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjaGFuZ2VzICYgKENIQU5HRV9NQVJLRVIgfCBDSEFOR0VfTUFSS0VSX0JBQ0spKSB7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiYWZ0ZXJSZW5kZXJcIik7XG4gICAgfVxuXG4gICAgJGF1dG9zaXplKCkge1xuICAgICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5zZXNzaW9uLmdldFNjcmVlbkxlbmd0aCgpICogdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgbWF4SGVpZ2h0ID0gdGhpcy4kbWF4TGluZXMgKiB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBkZXNpcmVkSGVpZ2h0ID0gTWF0aC5tYXgoXG4gICAgICAgICAgICAodGhpcy4kbWluTGluZXMgfHwgMSkgKiB0aGlzLmxpbmVIZWlnaHQsXG4gICAgICAgICAgICBNYXRoLm1pbihtYXhIZWlnaHQsIGhlaWdodClcbiAgICAgICAgKSArIHRoaXMuc2Nyb2xsTWFyZ2luLnYgKyAodGhpcy4kZXh0cmFIZWlnaHQgfHwgMCk7XG4gICAgICAgIHZhciB2U2Nyb2xsID0gaGVpZ2h0ID4gbWF4SGVpZ2h0O1xuXG4gICAgICAgIGlmIChkZXNpcmVkSGVpZ2h0ICE9IHRoaXMuZGVzaXJlZEhlaWdodCB8fFxuICAgICAgICAgICAgdGhpcy4kc2l6ZS5oZWlnaHQgIT0gdGhpcy5kZXNpcmVkSGVpZ2h0IHx8IHZTY3JvbGwgIT0gdGhpcy4kdlNjcm9sbCkge1xuICAgICAgICAgICAgaWYgKHZTY3JvbGwgIT0gdGhpcy4kdlNjcm9sbCkge1xuICAgICAgICAgICAgICAgIHRoaXMuJHZTY3JvbGwgPSB2U2Nyb2xsO1xuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zZXRWaXNpYmxlKHZTY3JvbGwpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdyA9IHRoaXMuY29udGFpbmVyLmNsaWVudFdpZHRoO1xuICAgICAgICAgICAgdGhpcy5jb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gZGVzaXJlZEhlaWdodCArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZUNhY2hlZFNpemUodHJ1ZSwgdGhpcy4kZ3V0dGVyV2lkdGgsIHcsIGRlc2lyZWRIZWlnaHQpO1xuICAgICAgICAgICAgLy8gdGhpcy4kbG9vcC5jaGFuZ2VzID0gMDtcbiAgICAgICAgICAgIHRoaXMuZGVzaXJlZEhlaWdodCA9IGRlc2lyZWRIZWlnaHQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAkY29tcHV0ZUxheWVyQ29uZmlnKCkge1xuXG4gICAgICAgIGlmICh0aGlzLiRtYXhMaW5lcyAmJiB0aGlzLmxpbmVIZWlnaHQgPiAxKSB7XG4gICAgICAgICAgICB0aGlzLiRhdXRvc2l6ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciBzaXplID0gdGhpcy4kc2l6ZTtcblxuICAgICAgICB2YXIgaGlkZVNjcm9sbGJhcnMgPSBzaXplLmhlaWdodCA8PSAyICogdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgc2NyZWVuTGluZXMgPSB0aGlzLnNlc3Npb24uZ2V0U2NyZWVuTGVuZ3RoKCk7XG4gICAgICAgIHZhciBtYXhIZWlnaHQgPSBzY3JlZW5MaW5lcyAqIHRoaXMubGluZUhlaWdodDtcblxuICAgICAgICB2YXIgb2Zmc2V0ID0gdGhpcy5zY3JvbGxUb3AgJSB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBtaW5IZWlnaHQgPSBzaXplLnNjcm9sbGVySGVpZ2h0ICsgdGhpcy5saW5lSGVpZ2h0O1xuXG4gICAgICAgIHZhciBsb25nZXN0TGluZSA9IHRoaXMuJGdldExvbmdlc3RMaW5lKCk7XG5cbiAgICAgICAgdmFyIGhvcml6U2Nyb2xsID0gIWhpZGVTY3JvbGxiYXJzICYmICh0aGlzLiRoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSB8fFxuICAgICAgICAgICAgc2l6ZS5zY3JvbGxlcldpZHRoIC0gbG9uZ2VzdExpbmUgLSAyICogdGhpcy4kcGFkZGluZyA8IDApO1xuXG4gICAgICAgIHZhciBoU2Nyb2xsQ2hhbmdlZCA9IHRoaXMuJGhvcml6U2Nyb2xsICE9PSBob3JpelNjcm9sbDtcbiAgICAgICAgaWYgKGhTY3JvbGxDaGFuZ2VkKSB7XG4gICAgICAgICAgICB0aGlzLiRob3JpelNjcm9sbCA9IGhvcml6U2Nyb2xsO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJILnNldFZpc2libGUoaG9yaXpTY3JvbGwpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLiRtYXhMaW5lcyAmJiB0aGlzLiRzY3JvbGxQYXN0RW5kKSB7XG4gICAgICAgICAgICBtYXhIZWlnaHQgKz0gKHNpemUuc2Nyb2xsZXJIZWlnaHQgLSB0aGlzLmxpbmVIZWlnaHQpICogdGhpcy4kc2Nyb2xsUGFzdEVuZDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB2U2Nyb2xsID0gIWhpZGVTY3JvbGxiYXJzICYmICh0aGlzLiR2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSB8fFxuICAgICAgICAgICAgc2l6ZS5zY3JvbGxlckhlaWdodCAtIG1heEhlaWdodCA8IDApO1xuICAgICAgICB2YXIgdlNjcm9sbENoYW5nZWQgPSB0aGlzLiR2U2Nyb2xsICE9PSB2U2Nyb2xsO1xuICAgICAgICBpZiAodlNjcm9sbENoYW5nZWQpIHtcbiAgICAgICAgICAgIHRoaXMuJHZTY3JvbGwgPSB2U2Nyb2xsO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJWLnNldFZpc2libGUodlNjcm9sbCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKE1hdGgubWF4KC10aGlzLnNjcm9sbE1hcmdpbi50b3AsXG4gICAgICAgICAgICBNYXRoLm1pbih0aGlzLnNjcm9sbFRvcCwgbWF4SGVpZ2h0IC0gc2l6ZS5zY3JvbGxlckhlaWdodCArIHRoaXMuc2Nyb2xsTWFyZ2luLmJvdHRvbSkpKTtcblxuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdChNYXRoLm1heCgtdGhpcy5zY3JvbGxNYXJnaW4ubGVmdCwgTWF0aC5taW4odGhpcy5zY3JvbGxMZWZ0LFxuICAgICAgICAgICAgbG9uZ2VzdExpbmUgKyAyICogdGhpcy4kcGFkZGluZyAtIHNpemUuc2Nyb2xsZXJXaWR0aCArIHRoaXMuc2Nyb2xsTWFyZ2luLnJpZ2h0KSkpO1xuXG4gICAgICAgIHZhciBsaW5lQ291bnQgPSBNYXRoLmNlaWwobWluSGVpZ2h0IC8gdGhpcy5saW5lSGVpZ2h0KSAtIDE7XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IE1hdGgubWF4KDAsIE1hdGgucm91bmQoKHRoaXMuc2Nyb2xsVG9wIC0gb2Zmc2V0KSAvIHRoaXMubGluZUhlaWdodCkpO1xuICAgICAgICB2YXIgbGFzdFJvdyA9IGZpcnN0Um93ICsgbGluZUNvdW50O1xuXG4gICAgICAgIC8vIE1hcCBsaW5lcyBvbiB0aGUgc2NyZWVuIHRvIGxpbmVzIGluIHRoZSBkb2N1bWVudC5cbiAgICAgICAgdmFyIGZpcnN0Um93U2NyZWVuLCBmaXJzdFJvd0hlaWdodDtcbiAgICAgICAgdmFyIGxpbmVIZWlnaHQgPSB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIGZpcnN0Um93ID0gc2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50Um93KGZpcnN0Um93LCAwKTtcblxuICAgICAgICAvLyBDaGVjayBpZiBmaXJzdFJvdyBpcyBpbnNpZGUgb2YgYSBmb2xkTGluZS4gSWYgdHJ1ZSwgdGhlbiB1c2UgdGhlIGZpcnN0XG4gICAgICAgIC8vIHJvdyBvZiB0aGUgZm9sZExpbmUuXG4gICAgICAgIHZhciBmb2xkTGluZSA9IHNlc3Npb24uZ2V0Rm9sZExpbmUoZmlyc3RSb3cpO1xuICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgIGZpcnN0Um93ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICB9XG5cbiAgICAgICAgZmlyc3RSb3dTY3JlZW4gPSBzZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Sb3coZmlyc3RSb3csIDApO1xuICAgICAgICBmaXJzdFJvd0hlaWdodCA9IHNlc3Npb24uZ2V0Um93TGVuZ3RoKGZpcnN0Um93KSAqIGxpbmVIZWlnaHQ7XG5cbiAgICAgICAgbGFzdFJvdyA9IE1hdGgubWluKHNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFJvdyhsYXN0Um93LCAwKSwgc2Vzc2lvbi5nZXRMZW5ndGgoKSAtIDEpO1xuICAgICAgICBtaW5IZWlnaHQgPSBzaXplLnNjcm9sbGVySGVpZ2h0ICsgc2Vzc2lvbi5nZXRSb3dMZW5ndGgobGFzdFJvdykgKiBsaW5lSGVpZ2h0ICtcbiAgICAgICAgICAgIGZpcnN0Um93SGVpZ2h0O1xuXG4gICAgICAgIG9mZnNldCA9IHRoaXMuc2Nyb2xsVG9wIC0gZmlyc3RSb3dTY3JlZW4gKiBsaW5lSGVpZ2h0O1xuXG4gICAgICAgIHZhciBjaGFuZ2VzID0gMDtcbiAgICAgICAgaWYgKHRoaXMubGF5ZXJDb25maWcud2lkdGggIT0gbG9uZ2VzdExpbmUpXG4gICAgICAgICAgICBjaGFuZ2VzID0gQ0hBTkdFX0hfU0NST0xMO1xuICAgICAgICAvLyBIb3Jpem9udGFsIHNjcm9sbGJhciB2aXNpYmlsaXR5IG1heSBoYXZlIGNoYW5nZWQsIHdoaWNoIGNoYW5nZXNcbiAgICAgICAgLy8gdGhlIGNsaWVudCBoZWlnaHQgb2YgdGhlIHNjcm9sbGVyXG4gICAgICAgIGlmIChoU2Nyb2xsQ2hhbmdlZCB8fCB2U2Nyb2xsQ2hhbmdlZCkge1xuICAgICAgICAgICAgY2hhbmdlcyA9IHRoaXMuJHVwZGF0ZUNhY2hlZFNpemUodHJ1ZSwgdGhpcy5ndXR0ZXJXaWR0aCwgc2l6ZS53aWR0aCwgc2l6ZS5oZWlnaHQpO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwic2Nyb2xsYmFyVmlzaWJpbGl0eUNoYW5nZWRcIik7XG4gICAgICAgICAgICBpZiAodlNjcm9sbENoYW5nZWQpXG4gICAgICAgICAgICAgICAgbG9uZ2VzdExpbmUgPSB0aGlzLiRnZXRMb25nZXN0TGluZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5sYXllckNvbmZpZyA9IHtcbiAgICAgICAgICAgIHdpZHRoOiBsb25nZXN0TGluZSxcbiAgICAgICAgICAgIHBhZGRpbmc6IHRoaXMuJHBhZGRpbmcsXG4gICAgICAgICAgICBmaXJzdFJvdzogZmlyc3RSb3csXG4gICAgICAgICAgICBmaXJzdFJvd1NjcmVlbjogZmlyc3RSb3dTY3JlZW4sXG4gICAgICAgICAgICBsYXN0Um93OiBsYXN0Um93LFxuICAgICAgICAgICAgbGluZUhlaWdodDogbGluZUhlaWdodCxcbiAgICAgICAgICAgIGNoYXJhY3RlcldpZHRoOiB0aGlzLmNoYXJhY3RlcldpZHRoLFxuICAgICAgICAgICAgbWluSGVpZ2h0OiBtaW5IZWlnaHQsXG4gICAgICAgICAgICBtYXhIZWlnaHQ6IG1heEhlaWdodCxcbiAgICAgICAgICAgIG9mZnNldDogb2Zmc2V0LFxuICAgICAgICAgICAgZ3V0dGVyT2Zmc2V0OiBNYXRoLm1heCgwLCBNYXRoLmNlaWwoKG9mZnNldCArIHNpemUuaGVpZ2h0IC0gc2l6ZS5zY3JvbGxlckhlaWdodCkgLyBsaW5lSGVpZ2h0KSksXG4gICAgICAgICAgICBoZWlnaHQ6IHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHRcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gY2hhbmdlcztcbiAgICB9XG5cbiAgICAkdXBkYXRlTGluZXMoKSB7XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IHRoaXMuJGNoYW5nZWRMaW5lcy5maXJzdFJvdztcbiAgICAgICAgdmFyIGxhc3RSb3cgPSB0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdztcbiAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzID0gbnVsbDtcblxuICAgICAgICB2YXIgbGF5ZXJDb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuXG4gICAgICAgIGlmIChmaXJzdFJvdyA+IGxheWVyQ29uZmlnLmxhc3RSb3cgKyAxKSB7IHJldHVybjsgfVxuICAgICAgICBpZiAobGFzdFJvdyA8IGxheWVyQ29uZmlnLmZpcnN0Um93KSB7IHJldHVybjsgfVxuXG4gICAgICAgIC8vIGlmIHRoZSBsYXN0IHJvdyBpcyB1bmtub3duIC0+IHJlZHJhdyBldmVyeXRoaW5nXG4gICAgICAgIGlmIChsYXN0Um93ID09PSBJbmZpbml0eSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGxheWVyQ29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGUobGF5ZXJDb25maWcpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZWxzZSB1cGRhdGUgb25seSB0aGUgY2hhbmdlZCByb3dzXG4gICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGVMaW5lcyhsYXllckNvbmZpZywgZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAkZ2V0TG9uZ2VzdExpbmUoKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGNoYXJDb3VudCA9IHRoaXMuc2Vzc2lvbi5nZXRTY3JlZW5XaWR0aCgpO1xuICAgICAgICBpZiAodGhpcy5zaG93SW52aXNpYmxlcyAmJiAhdGhpcy5zZXNzaW9uLiR1c2VXcmFwTW9kZSlcbiAgICAgICAgICAgIGNoYXJDb3VudCArPSAxO1xuXG4gICAgICAgIHJldHVybiBNYXRoLm1heCh0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSAyICogdGhpcy4kcGFkZGluZywgTWF0aC5yb3VuZChjaGFyQ291bnQgKiB0aGlzLmNoYXJhY3RlcldpZHRoKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogU2NoZWR1bGVzIGFuIHVwZGF0ZSB0byBhbGwgdGhlIGZyb250IG1hcmtlcnMgaW4gdGhlIGRvY3VtZW50LlxuICAgICoqL1xuICAgIHVwZGF0ZUZyb250TWFya2VycygpIHtcbiAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQuc2V0TWFya2Vycyh0aGlzLnNlc3Npb24uZ2V0TWFya2Vycyh0cnVlKSk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX01BUktFUl9GUk9OVCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogU2NoZWR1bGVzIGFuIHVwZGF0ZSB0byBhbGwgdGhlIGJhY2sgbWFya2VycyBpbiB0aGUgZG9jdW1lbnQuXG4gICAgKiovXG4gICAgdXBkYXRlQmFja01hcmtlcnMoKSB7XG4gICAgICAgIHRoaXMuJG1hcmtlckJhY2suc2V0TWFya2Vycyh0aGlzLnNlc3Npb24uZ2V0TWFya2VycyhmYWxzZSkpO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9NQVJLRVJfQkFDSyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmVkcmF3IGJyZWFrcG9pbnRzLlxuICAgICoqL1xuICAgIHVwZGF0ZUJyZWFrcG9pbnRzKCkge1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9HVVRURVIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYW5ub3RhdGlvbnMgZm9yIHRoZSBndXR0ZXIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldEFubm90YXRpb25zXG4gICAgICogQHBhcmFtIHtBbm5vdGF0aW9uW119IGFubm90YXRpb25zIEFuIGFycmF5IGNvbnRhaW5pbmcgYW5ub3RhdGlvbnMuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRBbm5vdGF0aW9ucyhhbm5vdGF0aW9uczogQW5ub3RhdGlvbltdKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnNldEFubm90YXRpb25zKGFubm90YXRpb25zKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfR1VUVEVSKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBVcGRhdGVzIHRoZSBjdXJzb3IgaWNvbi5cbiAgICAqKi9cbiAgICB1cGRhdGVDdXJzb3IoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0NVUlNPUik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogSGlkZXMgdGhlIGN1cnNvciBpY29uLlxuICAgICoqL1xuICAgIGhpZGVDdXJzb3IoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLmhpZGVDdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBTaG93cyB0aGUgY3Vyc29yIGljb24uXG4gICAgKiovXG4gICAgc2hvd0N1cnNvcigpIHtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuc2hvd0N1cnNvcigpO1xuICAgIH1cblxuICAgIHNjcm9sbFNlbGVjdGlvbkludG9WaWV3KGFuY2hvciwgbGVhZCwgb2Zmc2V0Pykge1xuICAgICAgICAvLyBmaXJzdCBzY3JvbGwgYW5jaG9yIGludG8gdmlldyB0aGVuIHNjcm9sbCBsZWFkIGludG8gdmlld1xuICAgICAgICB0aGlzLnNjcm9sbEN1cnNvckludG9WaWV3KGFuY2hvciwgb2Zmc2V0KTtcbiAgICAgICAgdGhpcy5zY3JvbGxDdXJzb3JJbnRvVmlldyhsZWFkLCBvZmZzZXQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFNjcm9sbHMgdGhlIGN1cnNvciBpbnRvIHRoZSBmaXJzdCB2aXNpYmlsZSBhcmVhIG9mIHRoZSBlZGl0b3JcbiAgICAqKi9cbiAgICBzY3JvbGxDdXJzb3JJbnRvVmlldyhjdXJzb3I/LCBvZmZzZXQ/LCAkdmlld01hcmdpbj8pIHtcbiAgICAgICAgLy8gdGhlIGVkaXRvciBpcyBub3QgdmlzaWJsZVxuICAgICAgICBpZiAodGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCA9PT0gMClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuZ2V0UGl4ZWxQb3NpdGlvbihjdXJzb3IpO1xuXG4gICAgICAgIHZhciBsZWZ0ID0gcG9zLmxlZnQ7XG4gICAgICAgIHZhciB0b3AgPSBwb3MudG9wO1xuXG4gICAgICAgIHZhciB0b3BNYXJnaW4gPSAkdmlld01hcmdpbiAmJiAkdmlld01hcmdpbi50b3AgfHwgMDtcbiAgICAgICAgdmFyIGJvdHRvbU1hcmdpbiA9ICR2aWV3TWFyZ2luICYmICR2aWV3TWFyZ2luLmJvdHRvbSB8fCAwO1xuXG4gICAgICAgIHZhciBzY3JvbGxUb3AgPSB0aGlzLiRzY3JvbGxBbmltYXRpb24gPyB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgOiB0aGlzLnNjcm9sbFRvcDtcblxuICAgICAgICBpZiAoc2Nyb2xsVG9wICsgdG9wTWFyZ2luID4gdG9wKSB7XG4gICAgICAgICAgICBpZiAob2Zmc2V0KVxuICAgICAgICAgICAgICAgIHRvcCAtPSBvZmZzZXQgKiB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0O1xuICAgICAgICAgICAgaWYgKHRvcCA9PT0gMClcbiAgICAgICAgICAgICAgICB0b3AgPSAtdGhpcy5zY3JvbGxNYXJnaW4udG9wO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcCh0b3ApO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNjcm9sbFRvcCArIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgLSBib3R0b21NYXJnaW4gPCB0b3AgKyB0aGlzLmxpbmVIZWlnaHQpIHtcbiAgICAgICAgICAgIGlmIChvZmZzZXQpXG4gICAgICAgICAgICAgICAgdG9wICs9IG9mZnNldCAqIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHRvcCArIHRoaXMubGluZUhlaWdodCAtIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHNjcm9sbExlZnQgPSB0aGlzLnNjcm9sbExlZnQ7XG5cbiAgICAgICAgaWYgKHNjcm9sbExlZnQgPiBsZWZ0KSB7XG4gICAgICAgICAgICBpZiAobGVmdCA8IHRoaXMuJHBhZGRpbmcgKyAyICogdGhpcy5sYXllckNvbmZpZy5jaGFyYWN0ZXJXaWR0aClcbiAgICAgICAgICAgICAgICBsZWZ0ID0gLXRoaXMuc2Nyb2xsTWFyZ2luLmxlZnQ7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdChsZWZ0KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzY3JvbGxMZWZ0ICsgdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIDwgbGVmdCArIHRoaXMuY2hhcmFjdGVyV2lkdGgpIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KE1hdGgucm91bmQobGVmdCArIHRoaXMuY2hhcmFjdGVyV2lkdGggLSB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGgpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzY3JvbGxMZWZ0IDw9IHRoaXMuJHBhZGRpbmcgJiYgbGVmdCAtIHNjcm9sbExlZnQgPCB0aGlzLmNoYXJhY3RlcldpZHRoKSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdCgwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogezpFZGl0U2Vzc2lvbi5nZXRTY3JvbGxUb3B9XG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRTY3JvbGxUb3BcbiAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxUb3AoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIHs6RWRpdFNlc3Npb24uZ2V0U2Nyb2xsTGVmdH1cbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmdldFNjcm9sbExlZnRcbiAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxMZWZ0KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGZpcnN0IHZpc2libGUgcm93LCByZWdhcmRsZXNzIG9mIHdoZXRoZXIgaXQncyBmdWxseSB2aXNpYmxlIG9yIG5vdC5cbiAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxUb3BSb3coKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Nyb2xsVG9wIC8gdGhpcy5saW5lSGVpZ2h0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGxhc3QgdmlzaWJsZSByb3csIHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciBpdCdzIGZ1bGx5IHZpc2libGUgb3Igbm90LlxuICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldFNjcm9sbEJvdHRvbVJvdygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gTWF0aC5tYXgoMCwgTWF0aC5mbG9vcigodGhpcy5zY3JvbGxUb3AgKyB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0KSAvIHRoaXMubGluZUhlaWdodCkgLSAxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEdyYWNlZnVsbHkgc2Nyb2xscyBmcm9tIHRoZSB0b3Agb2YgdGhlIGVkaXRvciB0byB0aGUgcm93IGluZGljYXRlZC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgQSByb3cgaWRcbiAgICAqXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uc2V0U2Nyb2xsVG9wXG4gICAgKiovXG4gICAgc2Nyb2xsVG9Sb3cocm93OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChyb3cgKiB0aGlzLmxpbmVIZWlnaHQpO1xuICAgIH1cblxuICAgIGFsaWduQ3Vyc29yKGN1cnNvciwgYWxpZ25tZW50KSB7XG4gICAgICAgIGlmICh0eXBlb2YgY3Vyc29yID09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICBjdXJzb3IgPSB7IHJvdzogY3Vyc29yLCBjb2x1bW46IDAgfTtcblxuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuZ2V0UGl4ZWxQb3NpdGlvbihjdXJzb3IpO1xuICAgICAgICB2YXIgaCA9IHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgLSB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBvZmZzZXQgPSBwb3MudG9wIC0gaCAqIChhbGlnbm1lbnQgfHwgMCk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChvZmZzZXQpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0O1xuICAgIH1cblxuICAgICRjYWxjU3RlcHMoZnJvbVZhbHVlOiBudW1iZXIsIHRvVmFsdWU6IG51bWJlcik6IG51bWJlcltdIHtcbiAgICAgICAgdmFyIGk6IG51bWJlciA9IDA7XG4gICAgICAgIHZhciBsOiBudW1iZXIgPSB0aGlzLlNURVBTO1xuICAgICAgICB2YXIgc3RlcHM6IG51bWJlcltdID0gW107XG5cbiAgICAgICAgdmFyIGZ1bmMgPSBmdW5jdGlvbih0OiBudW1iZXIsIHhfbWluOiBudW1iZXIsIGR4OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICAgICAgcmV0dXJuIGR4ICogKE1hdGgucG93KHQgLSAxLCAzKSArIDEpICsgeF9taW47XG4gICAgICAgIH07XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGw7ICsraSkge1xuICAgICAgICAgICAgc3RlcHMucHVzaChmdW5jKGkgLyB0aGlzLlNURVBTLCBmcm9tVmFsdWUsIHRvVmFsdWUgLSBmcm9tVmFsdWUpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzdGVwcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHcmFjZWZ1bGx5IHNjcm9sbHMgdGhlIGVkaXRvciB0byB0aGUgcm93IGluZGljYXRlZC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbGluZSBBIGxpbmUgbnVtYmVyXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBjZW50ZXIgSWYgYHRydWVgLCBjZW50ZXJzIHRoZSBlZGl0b3IgdGhlIHRvIGluZGljYXRlZCBsaW5lXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbmltYXRlIElmIGB0cnVlYCBhbmltYXRlcyBzY3JvbGxpbmdcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgYWZ0ZXIgdGhlIGFuaW1hdGlvbiBoYXMgZmluaXNoZWRcbiAgICAgKi9cbiAgICBzY3JvbGxUb0xpbmUobGluZTogbnVtYmVyLCBjZW50ZXI6IGJvb2xlYW4sIGFuaW1hdGU6IGJvb2xlYW4sIGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLiRjdXJzb3JMYXllci5nZXRQaXhlbFBvc2l0aW9uKHsgcm93OiBsaW5lLCBjb2x1bW46IDAgfSk7XG4gICAgICAgIHZhciBvZmZzZXQgPSBwb3MudG9wO1xuICAgICAgICBpZiAoY2VudGVyKSB7XG4gICAgICAgICAgICBvZmZzZXQgLT0gdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCAvIDI7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaW5pdGlhbFNjcm9sbCA9IHRoaXMuc2Nyb2xsVG9wO1xuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKG9mZnNldCk7XG4gICAgICAgIGlmIChhbmltYXRlICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5hbmltYXRlU2Nyb2xsaW5nKGluaXRpYWxTY3JvbGwsIGNhbGxiYWNrKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFuaW1hdGVTY3JvbGxpbmcoZnJvbVZhbHVlOiBudW1iZXIsIGNhbGxiYWNrPykge1xuICAgICAgICB2YXIgdG9WYWx1ZSA9IHRoaXMuc2Nyb2xsVG9wO1xuICAgICAgICBpZiAoIXRoaXMuJGFuaW1hdGVkU2Nyb2xsKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcblxuICAgICAgICBpZiAoZnJvbVZhbHVlID09IHRvVmFsdWUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKHRoaXMuJHNjcm9sbEFuaW1hdGlvbikge1xuICAgICAgICAgICAgdmFyIG9sZFN0ZXBzID0gdGhpcy4kc2Nyb2xsQW5pbWF0aW9uLnN0ZXBzO1xuICAgICAgICAgICAgaWYgKG9sZFN0ZXBzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGZyb21WYWx1ZSA9IG9sZFN0ZXBzWzBdO1xuICAgICAgICAgICAgICAgIGlmIChmcm9tVmFsdWUgPT0gdG9WYWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHN0ZXBzID0gX3NlbGYuJGNhbGNTdGVwcyhmcm9tVmFsdWUsIHRvVmFsdWUpO1xuICAgICAgICB0aGlzLiRzY3JvbGxBbmltYXRpb24gPSB7IGZyb206IGZyb21WYWx1ZSwgdG86IHRvVmFsdWUsIHN0ZXBzOiBzdGVwcyB9O1xuXG4gICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy4kdGltZXIpO1xuXG4gICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHN0ZXBzLnNoaWZ0KCkpO1xuICAgICAgICAvLyB0cmljayBzZXNzaW9uIHRvIHRoaW5rIGl0J3MgYWxyZWFkeSBzY3JvbGxlZCB0byBub3QgbG9vc2UgdG9WYWx1ZVxuICAgICAgICBfc2VsZi5zZXNzaW9uLiRzY3JvbGxUb3AgPSB0b1ZhbHVlO1xuICAgICAgICB0aGlzLiR0aW1lciA9IHNldEludGVydmFsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHN0ZXBzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHN0ZXBzLnNoaWZ0KCkpO1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uJHNjcm9sbFRvcCA9IHRvVmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRvVmFsdWUgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uJHNjcm9sbFRvcCA9IC0xO1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHRvVmFsdWUpO1xuICAgICAgICAgICAgICAgIHRvVmFsdWUgPSBudWxsO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBkbyB0aGlzIG9uIHNlcGFyYXRlIHN0ZXAgdG8gbm90IGdldCBzcHVyaW91cyBzY3JvbGwgZXZlbnQgZnJvbSBzY3JvbGxiYXJcbiAgICAgICAgICAgICAgICBfc2VsZi4kdGltZXIgPSBjbGVhckludGVydmFsKF9zZWxmLiR0aW1lcik7XG4gICAgICAgICAgICAgICAgX3NlbGYuJHNjcm9sbEFuaW1hdGlvbiA9IG51bGw7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sgJiYgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgMTApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdGhlIGVkaXRvciB0byB0aGUgeSBwaXhlbCBpbmRpY2F0ZWQuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHNjcm9sbFRvcCBUaGUgcG9zaXRpb24gdG8gc2Nyb2xsIHRvXG4gICAgICovXG4gICAgc2Nyb2xsVG9ZKHNjcm9sbFRvcDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIC8vIGFmdGVyIGNhbGxpbmcgc2Nyb2xsQmFyLnNldFNjcm9sbFRvcFxuICAgICAgICAvLyBzY3JvbGxiYXIgc2VuZHMgdXMgZXZlbnQgd2l0aCBzYW1lIHNjcm9sbFRvcC4gaWdub3JlIGl0XG4gICAgICAgIGlmICh0aGlzLnNjcm9sbFRvcCAhPT0gc2Nyb2xsVG9wKSB7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX1NDUk9MTCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRoZSBlZGl0b3IgYWNyb3NzIHRoZSB4LWF4aXMgdG8gdGhlIHBpeGVsIGluZGljYXRlZC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc2Nyb2xsTGVmdCBUaGUgcG9zaXRpb24gdG8gc2Nyb2xsIHRvXG4gICAgICoqL1xuICAgIHNjcm9sbFRvWChzY3JvbGxMZWZ0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuc2Nyb2xsTGVmdCAhPT0gc2Nyb2xsTGVmdCkge1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxMZWZ0ID0gc2Nyb2xsTGVmdDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0hfU0NST0xMKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogU2Nyb2xscyB0aGUgZWRpdG9yIGFjcm9zcyBib3RoIHgtIGFuZCB5LWF4ZXMuXG4gICAgKiBAcGFyYW0ge051bWJlcn0geCBUaGUgeCB2YWx1ZSB0byBzY3JvbGwgdG9cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSB5IFRoZSB5IHZhbHVlIHRvIHNjcm9sbCB0b1xuICAgICoqL1xuICAgIHNjcm9sbFRvKHg6IG51bWJlciwgeTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AoeSk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KHkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2Nyb2xscyB0aGUgZWRpdG9yIGFjcm9zcyBib3RoIHgtIGFuZCB5LWF4ZXMuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZGVsdGFYIFRoZSB4IHZhbHVlIHRvIHNjcm9sbCBieVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlbHRhWSBUaGUgeSB2YWx1ZSB0byBzY3JvbGwgYnlcbiAgICAqKi9cbiAgICBzY3JvbGxCeShkZWx0YVg6IG51bWJlciwgZGVsdGFZOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgZGVsdGFZICYmIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AodGhpcy5zZXNzaW9uLmdldFNjcm9sbFRvcCgpICsgZGVsdGFZKTtcbiAgICAgICAgZGVsdGFYICYmIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxMZWZ0KCkgKyBkZWx0YVgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgeW91IGNhbiBzdGlsbCBzY3JvbGwgYnkgZWl0aGVyIHBhcmFtZXRlcjsgaW4gb3RoZXIgd29yZHMsIHlvdSBoYXZlbid0IHJlYWNoZWQgdGhlIGVuZCBvZiB0aGUgZmlsZSBvciBsaW5lLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlbHRhWCBUaGUgeCB2YWx1ZSB0byBzY3JvbGwgYnlcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkZWx0YVkgVGhlIHkgdmFsdWUgdG8gc2Nyb2xsIGJ5XG4gICAgKlxuICAgICpcbiAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgKiovXG4gICAgaXNTY3JvbGxhYmxlQnkoZGVsdGFYOiBudW1iZXIsIGRlbHRhWTogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIGlmIChkZWx0YVkgPCAwICYmIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSA+PSAxIC0gdGhpcy5zY3JvbGxNYXJnaW4udG9wKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGlmIChkZWx0YVkgPiAwICYmIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSArIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHRcbiAgICAgICAgICAgIC0gdGhpcy5sYXllckNvbmZpZy5tYXhIZWlnaHQgPCAtMSArIHRoaXMuc2Nyb2xsTWFyZ2luLmJvdHRvbSlcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBpZiAoZGVsdGFYIDwgMCAmJiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpID49IDEgLSB0aGlzLnNjcm9sbE1hcmdpbi5sZWZ0KVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGlmIChkZWx0YVggPiAwICYmIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxMZWZ0KCkgKyB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGhcbiAgICAgICAgICAgIC0gdGhpcy5sYXllckNvbmZpZy53aWR0aCA8IC0xICsgdGhpcy5zY3JvbGxNYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBwaXhlbFRvU2NyZWVuQ29vcmRpbmF0ZXMoeDogbnVtYmVyLCB5OiBudW1iZXIpIHtcbiAgICAgICAgdmFyIGNhbnZhc1BvcyA9IHRoaXMuc2Nyb2xsZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICAgICAgdmFyIG9mZnNldCA9ICh4ICsgdGhpcy5zY3JvbGxMZWZ0IC0gY2FudmFzUG9zLmxlZnQgLSB0aGlzLiRwYWRkaW5nKSAvIHRoaXMuY2hhcmFjdGVyV2lkdGg7XG4gICAgICAgIHZhciByb3cgPSBNYXRoLmZsb29yKCh5ICsgdGhpcy5zY3JvbGxUb3AgLSBjYW52YXNQb3MudG9wKSAvIHRoaXMubGluZUhlaWdodCk7XG4gICAgICAgIHZhciBjb2wgPSBNYXRoLnJvdW5kKG9mZnNldCk7XG5cbiAgICAgICAgcmV0dXJuIHsgcm93OiByb3csIGNvbHVtbjogY29sLCBzaWRlOiBvZmZzZXQgLSBjb2wgPiAwID8gMSA6IC0xIH07XG4gICAgfVxuXG4gICAgc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXMoY2xpZW50WDogbnVtYmVyLCBjbGllbnRZOiBudW1iZXIpIHtcbiAgICAgICAgdmFyIGNhbnZhc1BvcyA9IHRoaXMuc2Nyb2xsZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICAgICAgdmFyIGNvbHVtbiA9IE1hdGgucm91bmQoKGNsaWVudFggKyB0aGlzLnNjcm9sbExlZnQgLSBjYW52YXNQb3MubGVmdCAtIHRoaXMuJHBhZGRpbmcpIC8gdGhpcy5jaGFyYWN0ZXJXaWR0aCk7XG5cbiAgICAgICAgdmFyIHJvdyA9IChjbGllbnRZICsgdGhpcy5zY3JvbGxUb3AgLSBjYW52YXNQb3MudG9wKSAvIHRoaXMubGluZUhlaWdodDtcblxuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihyb3csIE1hdGgubWF4KGNvbHVtbiwgMCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgYHBhZ2VYYCBhbmQgYHBhZ2VZYCBjb29yZGluYXRlcyBvZiB0aGUgZG9jdW1lbnQgcG9zaXRpb24uXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSBkb2N1bWVudCByb3cgcG9zaXRpb25cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGRvY3VtZW50IGNvbHVtbiBwb3NpdGlvblxuICAgICogQHJldHVybiB7T2JqZWN0fVxuICAgICoqL1xuICAgIHRleHRUb1NjcmVlbkNvb3JkaW5hdGVzKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHsgcGFnZVg6IG51bWJlcjsgcGFnZVk6IG51bWJlciB9IHtcbiAgICAgICAgdmFyIGNhbnZhc1BvcyA9IHRoaXMuc2Nyb2xsZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLnNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKHJvdywgY29sdW1uKTtcblxuICAgICAgICB2YXIgeCA9IHRoaXMuJHBhZGRpbmcgKyBNYXRoLnJvdW5kKHBvcy5jb2x1bW4gKiB0aGlzLmNoYXJhY3RlcldpZHRoKTtcbiAgICAgICAgdmFyIHkgPSBwb3Mucm93ICogdGhpcy5saW5lSGVpZ2h0O1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBwYWdlWDogY2FudmFzUG9zLmxlZnQgKyB4IC0gdGhpcy5zY3JvbGxMZWZ0LFxuICAgICAgICAgICAgcGFnZVk6IGNhbnZhc1Bvcy50b3AgKyB5IC0gdGhpcy5zY3JvbGxUb3BcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBGb2N1c2VzIHRoZSBjdXJyZW50IGNvbnRhaW5lci5cbiAgICAqKi9cbiAgICB2aXN1YWxpemVGb2N1cygpIHtcbiAgICAgICAgYWRkQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIFwiYWNlX2ZvY3VzXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIEJsdXJzIHRoZSBjdXJyZW50IGNvbnRhaW5lci5cbiAgICAqKi9cbiAgICB2aXN1YWxpemVCbHVyKCkge1xuICAgICAgICByZW1vdmVDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgXCJhY2VfZm9jdXNcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBzaG93Q29tcG9zaXRpb25cbiAgICAgKiBAcGFyYW0gcG9zaXRpb25cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHNob3dDb21wb3NpdGlvbihwb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSkge1xuICAgICAgICBpZiAoIXRoaXMuJGNvbXBvc2l0aW9uKVxuICAgICAgICAgICAgdGhpcy4kY29tcG9zaXRpb24gPSB7XG4gICAgICAgICAgICAgICAga2VlcFRleHRBcmVhQXRDdXJzb3I6IHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yLFxuICAgICAgICAgICAgICAgIGNzc1RleHQ6IHRoaXMudGV4dGFyZWEuc3R5bGUuY3NzVGV4dFxuICAgICAgICAgICAgfTtcblxuICAgICAgICB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IHRydWU7XG4gICAgICAgIGFkZENzc0NsYXNzKHRoaXMudGV4dGFyZWEsIFwiYWNlX2NvbXBvc2l0aW9uXCIpO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLmNzc1RleHQgPSBcIlwiO1xuICAgICAgICB0aGlzLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IEEgc3RyaW5nIG9mIHRleHQgdG8gdXNlXG4gICAgICpcbiAgICAgKiBTZXRzIHRoZSBpbm5lciB0ZXh0IG9mIHRoZSBjdXJyZW50IGNvbXBvc2l0aW9uIHRvIGB0ZXh0YC5cbiAgICAgKi9cbiAgICBzZXRDb21wb3NpdGlvblRleHQodGV4dD86IHN0cmluZyk6IHZvaWQge1xuICAgICAgICAvLyBUT0RPOiBXaHkgaXMgdGhlIHBhcmFtZXRlciBub3QgdXNlZD9cbiAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBIaWRlcyB0aGUgY3VycmVudCBjb21wb3NpdGlvbi5cbiAgICAgKi9cbiAgICBoaWRlQ29tcG9zaXRpb24oKSB7XG4gICAgICAgIGlmICghdGhpcy4kY29tcG9zaXRpb24pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlbW92ZUNzc0NsYXNzKHRoaXMudGV4dGFyZWEsIFwiYWNlX2NvbXBvc2l0aW9uXCIpO1xuICAgICAgICB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IHRoaXMuJGNvbXBvc2l0aW9uLmtlZXBUZXh0QXJlYUF0Q3Vyc29yO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLmNzc1RleHQgPSB0aGlzLiRjb21wb3NpdGlvbi5jc3NUZXh0O1xuICAgICAgICB0aGlzLiRjb21wb3NpdGlvbiA9IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBhIG5ldyB0aGVtZSBmb3IgdGhlIGVkaXRvci5cbiAgICAgKiBgdGhlbWVgIHNob3VsZCBleGlzdCwgYW5kIGJlIGEgZGlyZWN0b3J5IHBhdGgsIGxpa2UgYGFjZS90aGVtZS90ZXh0bWF0ZWAuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFRoZW1lXG4gICAgICogQHBhcmFtIHRoZW1lIHtTdHJpbmd9IHRoZW1lIFRoZSBwYXRoIHRvIGEgdGhlbWVcbiAgICAgKiBAcGFyYW0gdGhlbWUge0Z1bmN0aW9ufSBjYiBvcHRpb25hbCBjYWxsYmFja1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0VGhlbWUodGhlbWU6IGFueSwgY2I/OiAoKSA9PiBhbnkpOiB2b2lkIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJWaXJ0dWFsUmVuZGVyZXIgc2V0VGhlbWUsIHRoZW1lID0gXCIgKyB0aGVtZSlcbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy4kdGhlbWVJZCA9IHRoZW1lO1xuICAgICAgICBfc2VsZi5fZGlzcGF0Y2hFdmVudCgndGhlbWVDaGFuZ2UnLCB7IHRoZW1lOiB0aGVtZSB9KTtcblxuICAgICAgICBpZiAoIXRoZW1lIHx8IHR5cGVvZiB0aGVtZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgdmFyIG1vZHVsZU5hbWUgPSB0aGVtZSB8fCB0aGlzLmdldE9wdGlvbihcInRoZW1lXCIpLmluaXRpYWxWYWx1ZTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwibW9kdWxlTmFtZSA9PiBcIiArIG1vZHVsZU5hbWUpO1xuICAgICAgICAgICAgLy8gTG9hZGluZyBhIHRoZW1lIHdpbGwgaW5zZXJ0IGEgc2NyaXB0IHRoYXQsIHVwb24gZXhlY3V0aW9uLCB3aWxsXG4gICAgICAgICAgICAvLyBpbnNlcnQgYSBzdHlsZSB0YWcuXG4gICAgICAgICAgICBsb2FkTW9kdWxlKFtcInRoZW1lXCIsIG1vZHVsZU5hbWVdLCBhZnRlckxvYWQsIHRoaXMuY29udGFpbmVyLm93bmVyRG9jdW1lbnQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgYWZ0ZXJMb2FkKHRoZW1lKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGFmdGVyTG9hZChtb2RKczogeyBjc3NUZXh0OiBzdHJpbmc7IGNzc0NsYXNzOiBzdHJpbmc7IGlzRGFyazogYm9vbGVhbjsgcGFkZGluZzogbnVtYmVyIH0pIHtcblxuICAgICAgICAgICAgaWYgKF9zZWxmLiR0aGVtZUlkICE9PSB0aGVtZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYiAmJiBjYigpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIW1vZEpzLmNzc0NsYXNzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpbXBvcnRDc3NTdHJpbmcobW9kSnMuY3NzVGV4dCwgbW9kSnMuY3NzQ2xhc3MsIF9zZWxmLmNvbnRhaW5lci5vd25lckRvY3VtZW50KTtcblxuICAgICAgICAgICAgaWYgKF9zZWxmLnRoZW1lKSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlQ3NzQ2xhc3MoX3NlbGYuY29udGFpbmVyLCBfc2VsZi50aGVtZS5jc3NDbGFzcyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBwYWRkaW5nID0gXCJwYWRkaW5nXCIgaW4gbW9kSnMgPyBtb2RKcy5wYWRkaW5nIDogXCJwYWRkaW5nXCIgaW4gKF9zZWxmLnRoZW1lIHx8IHt9KSA/IDQgOiBfc2VsZi4kcGFkZGluZztcblxuICAgICAgICAgICAgaWYgKF9zZWxmLiRwYWRkaW5nICYmIHBhZGRpbmcgIT0gX3NlbGYuJHBhZGRpbmcpIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBfc2VsZi50aGVtZSA9IG1vZEpzO1xuICAgICAgICAgICAgYWRkQ3NzQ2xhc3MoX3NlbGYuY29udGFpbmVyLCBtb2RKcy5jc3NDbGFzcyk7XG4gICAgICAgICAgICBzZXRDc3NDbGFzcyhfc2VsZi5jb250YWluZXIsIFwiYWNlX2RhcmtcIiwgbW9kSnMuaXNEYXJrKTtcblxuICAgICAgICAgICAgLy8gZm9yY2UgcmUtbWVhc3VyZSBvZiB0aGUgZ3V0dGVyIHdpZHRoXG4gICAgICAgICAgICBpZiAoX3NlbGYuJHNpemUpIHtcbiAgICAgICAgICAgICAgICBfc2VsZi4kc2l6ZS53aWR0aCA9IDA7XG4gICAgICAgICAgICAgICAgX3NlbGYuJHVwZGF0ZVNpemVBc3luYygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBfc2VsZi5fZGlzcGF0Y2hFdmVudCgndGhlbWVMb2FkZWQnLCB7IHRoZW1lOiBtb2RKcyB9KTtcbiAgICAgICAgICAgIGNiICYmIGNiKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBwYXRoIG9mIHRoZSBjdXJyZW50IHRoZW1lLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRUaGVtZVxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICBnZXRUaGVtZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy4kdGhlbWVJZDtcbiAgICB9XG5cbiAgICAvLyBNZXRob2RzIGFsbG93cyB0byBhZGQgLyByZW1vdmUgQ1NTIGNsYXNzbmFtZXMgdG8gdGhlIGVkaXRvciBlbGVtZW50LlxuICAgIC8vIFRoaXMgZmVhdHVyZSBjYW4gYmUgdXNlZCBieSBwbHVnLWlucyB0byBwcm92aWRlIGEgdmlzdWFsIGluZGljYXRpb24gb2ZcbiAgICAvLyBhIGNlcnRhaW4gbW9kZSB0aGF0IGVkaXRvciBpcyBpbi5cblxuICAgIC8qKlxuICAgICAqIFtBZGRzIGEgbmV3IGNsYXNzLCBgc3R5bGVgLCB0byB0aGUgZWRpdG9yLl17OiAjVmlydHVhbFJlbmRlcmVyLnNldFN0eWxlfVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHlsZSBBIGNsYXNzIG5hbWVcbiAgICAgKlxuICAgICAqL1xuICAgIHNldFN0eWxlKHN0eWxlOiBzdHJpbmcsIGluY2x1ZGU/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHNldENzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBzdHlsZSwgaW5jbHVkZSAhPT0gZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFtSZW1vdmVzIHRoZSBjbGFzcyBgc3R5bGVgIGZyb20gdGhlIGVkaXRvci5dezogI1ZpcnR1YWxSZW5kZXJlci51bnNldFN0eWxlfVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHlsZSBBIGNsYXNzIG5hbWVcbiAgICAgKi9cbiAgICB1bnNldFN0eWxlKHN0eWxlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgcmVtb3ZlQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIHN0eWxlKTtcbiAgICB9XG5cbiAgICBzZXRDdXJzb3JTdHlsZShzdHlsZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLmNvbnRlbnQuc3R5bGUuY3Vyc29yICE9IHN0eWxlKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUuY3Vyc29yID0gc3R5bGU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gY3Vyc29yU3R5bGUgQSBjc3MgY3Vyc29yIHN0eWxlXG4gICAgICovXG4gICAgc2V0TW91c2VDdXJzb3IoY3Vyc29yU3R5bGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUuY3Vyc29yID0gY3Vyc29yU3R5bGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGVzdHJveXMgdGhlIHRleHQgYW5kIGN1cnNvciBsYXllcnMgZm9yIHRoaXMgcmVuZGVyZXIuXG4gICAgICovXG4gICAgZGVzdHJveSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuZGVzdHJveSgpO1xuICAgIH1cbn1cblxuZGVmaW5lT3B0aW9ucyhWaXJ0dWFsUmVuZGVyZXIucHJvdG90eXBlLCBcInJlbmRlcmVyXCIsIHtcbiAgICBhbmltYXRlZFNjcm9sbDogeyBpbml0aWFsVmFsdWU6IGZhbHNlIH0sXG4gICAgc2hvd0ludmlzaWJsZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllci5zZXRTaG93SW52aXNpYmxlcyh2YWx1ZSkpXG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9URVhUKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgc2hvd1ByaW50TWFyZ2luOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oKSB7IHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7IH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgcHJpbnRNYXJnaW5Db2x1bW46IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbigpIHsgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiA4MFxuICAgIH0sXG4gICAgcHJpbnRNYXJnaW46IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsID09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICAgICAgdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW4gPSB2YWw7XG4gICAgICAgICAgICB0aGlzLiRzaG93UHJpbnRNYXJnaW4gPSAhIXZhbDtcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kc2hvd1ByaW50TWFyZ2luICYmIHRoaXMuJHByaW50TWFyZ2luQ29sdW1uO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBzaG93R3V0dGVyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykge1xuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyLnN0eWxlLmRpc3BsYXkgPSBzaG93ID8gXCJibG9ja1wiIDogXCJub25lXCI7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX0ZVTEwpO1xuICAgICAgICAgICAgdGhpcy5vbkd1dHRlclJlc2l6ZSgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGZhZGVGb2xkV2lkZ2V0czoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3cpIHtcbiAgICAgICAgICAgIHNldENzc0NsYXNzKHRoaXMuJGd1dHRlciwgXCJhY2VfZmFkZS1mb2xkLXdpZGdldHNcIiwgc2hvdyk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIHNob3dGb2xkV2lkZ2V0czoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3cpIHsgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0U2hvd0ZvbGRXaWRnZXRzKHNob3cpIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgc2hvd0xpbmVOdW1iZXJzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykge1xuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0U2hvd0xpbmVOdW1iZXJzKHNob3cpO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9HVVRURVIpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGRpc3BsYXlJbmRlbnRHdWlkZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG93KSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyLnNldERpc3BsYXlJbmRlbnRHdWlkZXMoc2hvdykpXG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9URVhUKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBoaWdobGlnaHRHdXR0ZXJMaW5lOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdWxkSGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0ID0gY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0LmNsYXNzTmFtZSA9IFwiYWNlX2d1dHRlci1hY3RpdmUtbGluZVwiO1xuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlci5hcHBlbmRDaGlsZCh0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0KTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuc3R5bGUuZGlzcGxheSA9IHNob3VsZEhpZ2hsaWdodCA/IFwiXCIgOiBcIm5vbmVcIjtcbiAgICAgICAgICAgIC8vIGlmIGN1cnNvcmxheWVyIGhhdmUgbmV2ZXIgYmVlbiB1cGRhdGVkIHRoZXJlJ3Mgbm90aGluZyBvbiBzY3JlZW4gdG8gdXBkYXRlXG4gICAgICAgICAgICBpZiAodGhpcy4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zKVxuICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQoKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZSxcbiAgICAgICAgdmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuJGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIHx8ICF0aGlzLiRob3JpelNjcm9sbClcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX1NDUk9MTCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuJHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIHx8ICF0aGlzLiR2U2Nyb2xsKVxuICAgICAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgZm9udFNpemU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihmb250U2l6ZTogc3RyaW5nKSB7XG4gICAgICAgICAgICB2YXIgdGhhdDogVmlydHVhbFJlbmRlcmVyID0gdGhpcztcbiAgICAgICAgICAgIHRoYXQuY29udGFpbmVyLnN0eWxlLmZvbnRTaXplID0gZm9udFNpemU7XG4gICAgICAgICAgICB0aGF0LnVwZGF0ZUZvbnRTaXplKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogXCIxMnB4XCJcbiAgICB9LFxuICAgIGZvbnRGYW1pbHk6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihmb250RmFtaWx5OiBzdHJpbmcpIHtcbiAgICAgICAgICAgIHZhciB0aGF0OiBWaXJ0dWFsUmVuZGVyZXIgPSB0aGlzO1xuICAgICAgICAgICAgdGhhdC5jb250YWluZXIuc3R5bGUuZm9udEZhbWlseSA9IGZvbnRGYW1pbHk7XG4gICAgICAgICAgICB0aGF0LnVwZGF0ZUZvbnRTaXplKCk7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIG1heExpbmVzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUZ1bGwoKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgbWluTGluZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlRnVsbCgpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBzY3JvbGxQYXN0RW5kOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB2YWwgPSArdmFsIHx8IDA7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2Nyb2xsUGFzdEVuZCA9PSB2YWwpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdGhpcy4kc2Nyb2xsUGFzdEVuZCA9IHZhbDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiAwLFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICBmaXhlZFdpZHRoR3V0dGVyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci4kZml4ZWRXaWR0aCA9ICEhdmFsO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9HVVRURVIpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICB0aGVtZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLnNldFRoZW1lKHZhbCkgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuJHRoZW1lSWQgfHwgdGhpcy50aGVtZTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcIi4vdGhlbWUvdGV4dG1hdGVcIixcbiAgICAgICAgaGFuZGxlc1NldDogdHJ1ZVxuICAgIH1cbn0pO1xuIl19