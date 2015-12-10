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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlydHVhbFJlbmRlcmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1ZpcnR1YWxSZW5kZXJlci50cyJdLCJuYW1lcyI6WyJWaXJ0dWFsUmVuZGVyZXIiLCJWaXJ0dWFsUmVuZGVyZXIuY29uc3RydWN0b3IiLCJWaXJ0dWFsUmVuZGVyZXIubWF4TGluZXMiLCJWaXJ0dWFsUmVuZGVyZXIua2VlcFRleHRBcmVhQXRDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0RGVmYXVsdEN1cnNvclN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEN1cnNvckxheWVyT2ZmIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUNoYXJhY3RlclNpemUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2Vzc2lvbiIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVMaW5lcyIsIlZpcnR1YWxSZW5kZXJlci5vbkNoYW5nZU5ld0xpbmVNb2RlIiwiVmlydHVhbFJlbmRlcmVyLm9uQ2hhbmdlVGFiU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVUZXh0IiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUZ1bGwiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlRm9udFNpemUiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNpemVBc3luYyIsIlZpcnR1YWxSZW5kZXJlci5vblJlc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci4kdXBkYXRlQ2FjaGVkU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5vbkd1dHRlclJlc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5hZGp1c3RXcmFwTGltaXQiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0QW5pbWF0ZWRTY3JvbGwiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0QW5pbWF0ZWRTY3JvbGwiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2hvd0ludmlzaWJsZXMiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2hvd0ludmlzaWJsZXMiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0RGlzcGxheUluZGVudEd1aWRlcyIsIlZpcnR1YWxSZW5kZXJlci5zZXREaXNwbGF5SW5kZW50R3VpZGVzIiwiVmlydHVhbFJlbmRlcmVyLnNldFNob3dQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRTaG93UHJpbnRNYXJnaW4iLCJWaXJ0dWFsUmVuZGVyZXIuc2V0UHJpbnRNYXJnaW5Db2x1bW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0UHJpbnRNYXJnaW5Db2x1bW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2hvd0d1dHRlciIsIlZpcnR1YWxSZW5kZXJlci5zZXRTaG93R3V0dGVyIiwiVmlydHVhbFJlbmRlcmVyLmdldEZhZGVGb2xkV2lkZ2V0cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRGYWRlRm9sZFdpZGdldHMiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0SGlnaGxpZ2h0R3V0dGVyTGluZSIsIlZpcnR1YWxSZW5kZXJlci5nZXRIaWdobGlnaHRHdXR0ZXJMaW5lIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0IiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRDb250YWluZXJFbGVtZW50IiwiVmlydHVhbFJlbmRlcmVyLmdldE1vdXNlRXZlbnRUYXJnZXQiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0VGV4dEFyZWFDb250YWluZXIiLCJWaXJ0dWFsUmVuZGVyZXIuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLmdldEZpcnN0VmlzaWJsZVJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRGaXJzdEZ1bGx5VmlzaWJsZVJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRMYXN0RnVsbHlWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLnNldFBhZGRpbmciLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2Nyb2xsTWFyZ2luIiwiVmlydHVhbFJlbmRlcmVyLmdldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLmdldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLnNldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVTY3JvbGxCYXJWIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVTY3JvbGxCYXJIIiwiVmlydHVhbFJlbmRlcmVyLmZyZWV6ZSIsIlZpcnR1YWxSZW5kZXJlci51bmZyZWV6ZSIsIlZpcnR1YWxSZW5kZXJlci4kcmVuZGVyQ2hhbmdlcyIsIlZpcnR1YWxSZW5kZXJlci4kYXV0b3NpemUiLCJWaXJ0dWFsUmVuZGVyZXIuJGNvbXB1dGVMYXllckNvbmZpZyIsIlZpcnR1YWxSZW5kZXJlci4kdXBkYXRlTGluZXMiLCJWaXJ0dWFsUmVuZGVyZXIuJGdldExvbmdlc3RMaW5lIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUZyb250TWFya2VycyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVCYWNrTWFya2VycyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVCcmVha3BvaW50cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRBbm5vdGF0aW9ucyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuaGlkZUN1cnNvciIsIlZpcnR1YWxSZW5kZXJlci5zaG93Q3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFNlbGVjdGlvbkludG9WaWV3IiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbFRvcCIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxMZWZ0IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbFRvcFJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxCb3R0b21Sb3ciLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9Sb3ciLCJWaXJ0dWFsUmVuZGVyZXIuYWxpZ25DdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuJGNhbGNTdGVwcyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb0xpbmUiLCJWaXJ0dWFsUmVuZGVyZXIuYW5pbWF0ZVNjcm9sbGluZyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb1kiLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9YIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbEJ5IiwiVmlydHVhbFJlbmRlcmVyLmlzU2Nyb2xsYWJsZUJ5IiwiVmlydHVhbFJlbmRlcmVyLnBpeGVsVG9TY3JlZW5Db29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci50ZXh0VG9TY3JlZW5Db29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci52aXN1YWxpemVGb2N1cyIsIlZpcnR1YWxSZW5kZXJlci52aXN1YWxpemVCbHVyIiwiVmlydHVhbFJlbmRlcmVyLnNob3dDb21wb3NpdGlvbiIsIlZpcnR1YWxSZW5kZXJlci5zZXRDb21wb3NpdGlvblRleHQiLCJWaXJ0dWFsUmVuZGVyZXIuaGlkZUNvbXBvc2l0aW9uIiwiVmlydHVhbFJlbmRlcmVyLnNldFRoZW1lIiwiVmlydHVhbFJlbmRlcmVyLnNldFRoZW1lLmFmdGVyTG9hZCIsIlZpcnR1YWxSZW5kZXJlci5nZXRUaGVtZSIsIlZpcnR1YWxSZW5kZXJlci5zZXRTdHlsZSIsIlZpcnR1YWxSZW5kZXJlci51bnNldFN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEN1cnNvclN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldE1vdXNlQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLmRlc3Ryb3kiXSwibWFwcGluZ3MiOiJPQThCTyxFQUFDLFdBQVcsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFFLGNBQWMsRUFBRSxXQUFXLEVBQUMsTUFB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Q0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7SUFDdENBLENBQUNBO0lBRURSLG1CQUFtQkE7UUFDZlMsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDakNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO0lBQ3JDQSxDQUFDQTtJQUVEVCxlQUFlQTtRQUNYVSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNiQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdEJBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLFdBQVdBLEdBQUdBLGFBQWFBLENBQUNBLENBQUNBO1lBQ3JEQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNOQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNOQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxlQUFlQSxFQUFFQSxDQUFDQTtZQUN0Q0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFFTkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDTkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFLRFYsVUFBVUE7UUFDTlcsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7SUFDckNBLENBQUNBO0lBTURYLFVBQVVBLENBQUNBLEtBQWVBO1FBQ3RCWSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNOQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxXQUFXQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUMzQ0EsSUFBSUE7WUFDQUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7SUFDekNBLENBQUNBO0lBS0RaLGNBQWNBO1FBQ1ZhLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLG1CQUFtQkEsRUFBRUEsQ0FBQ0E7SUFDMUNBLENBQUNBO0lBRURiLGdCQUFnQkE7UUFDWmMsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckJBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBO1FBQzdCQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtRQUNwQkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFTRGQsUUFBUUEsQ0FBQ0EsS0FBZUEsRUFBRUEsV0FBb0JBLEVBQUVBLEtBQWNBLEVBQUVBLE1BQWVBO1FBQzNFZSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNsQkEsTUFBTUEsQ0FBQ0E7UUFDWEEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO1FBQ3BCQSxJQUFJQTtZQUNBQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxLQUFLQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUdsQ0EsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO1lBQ1JBLE1BQU1BLEdBQUdBLEVBQUVBLENBQUNBLFlBQVlBLElBQUlBLEVBQUVBLENBQUNBLFlBQVlBLENBQUNBO1FBQ2hEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNQQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxXQUFXQSxJQUFJQSxFQUFFQSxDQUFDQSxXQUFXQSxDQUFDQTtRQUM3Q0EsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxLQUFLQSxFQUFFQSxXQUFXQSxFQUFFQSxLQUFLQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUd4RUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDbERBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBO1FBRTdCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNOQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUV0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDTkEsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLElBQUlBO1lBQ0FBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBRWpEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQTtZQUNkQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUMxQkEsQ0FBQ0E7SUFFRGYsaUJBQWlCQSxDQUFDQSxLQUFLQSxFQUFFQSxXQUFXQSxFQUFFQSxLQUFLQSxFQUFFQSxNQUFNQTtRQUMvQ2dCLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBQ25DQSxJQUFJQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNoQkEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDdEJBLElBQUlBLE9BQU9BLEdBQUdBO1lBQ1ZBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBO1lBQ2pCQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxNQUFNQTtZQUNuQkEsY0FBY0EsRUFBRUEsSUFBSUEsQ0FBQ0EsY0FBY0E7WUFDbkNBLGFBQWFBLEVBQUVBLElBQUlBLENBQUNBLGFBQWFBO1NBQ3BDQSxDQUFDQTtRQUNGQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3Q0EsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7WUFDckJBLE9BQU9BLElBQUlBLFdBQVdBLENBQUNBO1lBRXZCQSxJQUFJQSxDQUFDQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7Z0JBQ2xCQSxJQUFJQSxDQUFDQSxjQUFjQSxJQUFJQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUVsREEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFFckVBLE9BQU9BLEdBQUdBLE9BQU9BLEdBQUdBLGFBQWFBLENBQUNBO1FBQ3RDQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQ0EsT0FBT0EsSUFBSUEsV0FBV0EsQ0FBQ0E7WUFDdkJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBO1lBRW5CQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxJQUFJQSxJQUFJQSxDQUFDQTtnQkFDcEJBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFdBQVdBLEdBQUdBLENBQUNBLENBQUNBO1lBRWxFQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxXQUFXQSxDQUFDQTtZQUUvQkEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUE7Z0JBQzlCQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxHQUFHQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUNsREEsSUFBSUEsQ0FBQ0EsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsV0FBV0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFFOUVBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBO2dCQUMvQkEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDN0RBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENB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Q0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsRUFDckRBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBRTNGQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxFQUNqRkEsV0FBV0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFdEZBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzNEQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNwRkEsSUFBSUEsT0FBT0EsR0FBR0EsUUFBUUEsR0FBR0EsU0FBU0EsQ0FBQ0E7UUFHbkNBLElBQUlBLGNBQWNBLEVBQUVBLGNBQWNBLENBQUNBO1FBQ25D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V0FBV0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDcERBLElBQUlBLFlBQVlBLEdBQUdBLFdBQVdBLElBQUlBLFdBQVdBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBO1FBRTFEQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBRXJGQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxHQUFHQSxTQUFTQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ1BBLEdBQUdBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBLENBQUNBO1lBQzlDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDVkEsR0FBR0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDakNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ25DQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxHQUFHQSxZQUFZQSxHQUFHQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ1BBLEdBQUdBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBLENBQUNBO1lBQzlDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFD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LENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1lBQzFEQSxDQUFDQTtZQUVEQSxJQUFJQSxPQUFPQSxHQUFHQSxTQUFTQSxJQUFJQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxPQUFPQSxHQUFHQSxTQUFTQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxJQUFJQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQTtZQUV6R0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsSUFBSUEsT0FBT0EsSUFBSUEsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzlDQSxLQUFLQSxDQUFDQSxVQUFVQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUM5QkEsQ0FBQ0E7WUFFREEsS0FBS0EsQ0FBQ0EsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0E7WUFDcEJBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLEVBQUVBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1lBQzdDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxFQUFFQSxVQUFVQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUd2REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2RBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBO2dCQUN0QkEsS0FBS0EsQ0FBQ0EsZ0JBQWdCQSxFQUFFQSxDQUFDQTtZQUM3QkEsQ0FBQ0E7WUFFREEsS0FBS0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsYUFBYUEsRUFBRUEsRUFBRUEsS0FBS0EsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDdERBLEVBQUVBLElBQUlBLEVBQUVBLEVBQUVBLENBQUNBO1FBQ2ZBLENBQUNBO0lBQ0xELENBQUNBO0lBUUQzRixRQUFRQTtRQUNKNkYsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7SUFDekJBLENBQUNBO0lBV0Q3RixRQUFRQSxDQUFDQSxLQUFhQSxFQUFFQSxPQUFpQkE7UUFDckM4RixXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxLQUFLQSxFQUFFQSxPQUFPQSxLQUFLQSxLQUFLQSxDQUFDQSxDQUFDQTtJQUMxREEsQ0FBQ0E7SUFNRDlGLFVBQVVBLENBQUNBLEtBQWFBO1FBQ3BCK0YsY0FBY0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7SUFDMUNBLENBQUNBO0lBRUQvRixjQUFjQSxDQUFDQSxLQUFhQTtRQUN4QmdHLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUN0Q0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFLRGhHLGNBQWNBLENBQUNBLFdBQW1CQTtRQUM5QmlHLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLFdBQVdBLENBQUNBO0lBQzVDQSxDQUFDQTtJQUtEakcsT0FBT0E7UUFDSGtHLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBO1FBQzFCQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxPQUFPQSxFQUFFQSxDQUFDQTtJQUNoQ0EsQ0FBQ0E7QUFDTGxHLENBQUNBO0FBRUQsYUFBYSxDQUFDLGVBQWUsQ0FBQyxTQUFTLEVBQUUsVUFBVSxFQUFFO0lBQ2pELGNBQWMsRUFBRSxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUU7SUFDdkMsY0FBYyxFQUFFO1FBQ1osR0FBRyxFQUFFLFVBQVMsS0FBSztZQUNmLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3pDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM5QyxDQUFDO1FBQ0QsWUFBWSxFQUFFLEtBQUs7S0FDdEI7SUFDRCxlQUFlLEVBQUU7UUFDYixHQUFHLEVBQUUsY0FBYSxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUMsWUFBWSxFQUFFLElBQUk7S0FDckI7SUFDRCxpQkFBaUIsRUFBRTtRQUNmLEdBQUcsRUFBRSxjQUFhLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5QyxZQUFZLEVBQUUsRUFBRTtLQUNuQjtJQUNELFdBQVcsRUFBRTtRQUNULEdBQUcsRUFBRSxVQUFTLEdBQUc7WUFDYixFQUFFLENBQUMsQ0FBQyxPQUFPLEdBQUcsSUFBSSxRQUFRLENBQUM7Z0JBQ3ZCLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxHQUFHLENBQUM7WUFDbEMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUM7WUFDOUIsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFDOUIsQ0FBQztRQUNELEdBQUcsRUFBRTtZQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLElBQUksSUFBSSxDQUFDLGtCQUFrQixDQUFDO1FBQzVELENBQUM7S0FDSjtJQUNELFVBQVUsRUFBRTtRQUNSLEdBQUcsRUFBRSxVQUFTLElBQUk7WUFDZCxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxNQUFNLENBQUM7WUFDckQsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ3RDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUMxQixDQUFDO1FBQ0QsWUFBWSxFQUFFLElBQUk7S0FDckI7SUFDRCxlQUFlLEVBQUU7UUFDYixHQUFHLEVBQUUsVUFBUyxJQUFJO1lBQ2QsV0FBVyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDN0QsQ0FBQztRQUNELFlBQVksRUFBRSxLQUFLO0tBQ3RCO0lBQ0QsZUFBZSxFQUFFO1FBQ2IsR0FBRyxFQUFFLFVBQVMsSUFBSSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLENBQUEsQ0FBQyxDQUFDO1FBQ2xFLFlBQVksRUFBRSxJQUFJO0tBQ3JCO0lBQ0QsZUFBZSxFQUFFO1FBQ2IsR0FBRyxFQUFFLFVBQVMsSUFBSTtZQUNkLElBQUksQ0FBQyxZQUFZLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDM0MsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzVDLENBQUM7UUFDRCxZQUFZLEVBQUUsSUFBSTtLQUNyQjtJQUNELG1CQUFtQixFQUFFO1FBQ2pCLEdBQUcsRUFBRSxVQUFTLElBQUk7WUFDZCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUM3QyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDOUMsQ0FBQztRQUNELFlBQVksRUFBRSxJQUFJO0tBQ3JCO0lBQ0QsbUJBQW1CLEVBQUU7UUFDakIsR0FBRyxFQUFFLFVBQVMsZUFBZTtZQUN6QixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7Z0JBQzdCLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ2pELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLEdBQUcsd0JBQXdCLENBQUM7Z0JBQy9ELElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO2dCQUNwRCxNQUFNLENBQUM7WUFDWCxDQUFDO1lBRUQsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsZUFBZSxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUM7WUFFeEUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUM7Z0JBQzVCLElBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDO1FBQzFDLENBQUM7UUFDRCxZQUFZLEVBQUUsS0FBSztRQUNuQixLQUFLLEVBQUUsSUFBSTtLQUNkO0lBQ0QsdUJBQXVCLEVBQUU7UUFDckIsR0FBRyxFQUFFLFVBQVMsR0FBRztZQUNiLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLHdCQUF3QixJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQztnQkFDckQsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ2hELENBQUM7UUFDRCxZQUFZLEVBQUUsS0FBSztLQUN0QjtJQUNELHVCQUF1QixFQUFFO1FBQ3JCLEdBQUcsRUFBRSxVQUFTLEdBQUc7WUFDYixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyx3QkFBd0IsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUM7Z0JBQ2pELElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNoRCxDQUFDO1FBQ0QsWUFBWSxFQUFFLEtBQUs7S0FDdEI7SUFDRCxRQUFRLEVBQUU7UUFDTixHQUFHLEVBQUUsVUFBUyxRQUFnQjtZQUMxQixJQUFJLElBQUksR0FBb0IsSUFBSSxDQUFDO1lBQ2pDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7WUFDekMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQzFCLENBQUM7UUFDRCxZQUFZLEVBQUUsTUFBTTtLQUN2QjtJQUNELFVBQVUsRUFBRTtRQUNSLEdBQUcsRUFBRSxVQUFTLFVBQWtCO1lBQzVCLElBQUksSUFBSSxHQUFvQixJQUFJLENBQUM7WUFDakMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztZQUM3QyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDMUIsQ0FBQztLQUNKO0lBQ0QsUUFBUSxFQUFFO1FBQ04sR0FBRyxFQUFFLFVBQVMsR0FBRztZQUNiLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUN0QixDQUFDO0tBQ0o7SUFDRCxRQUFRLEVBQUU7UUFDTixHQUFHLEVBQUUsVUFBUyxHQUFHO1lBQ2IsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ3RCLENBQUM7S0FDSjtJQUNELGFBQWEsRUFBRTtRQUNYLEdBQUcsRUFBRSxVQUFTLEdBQUc7WUFDYixHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO1lBQ2hCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLElBQUksR0FBRyxDQUFDO2dCQUMzQixNQUFNLENBQUM7WUFDWCxJQUFJLENBQUMsY0FBYyxHQUFHLEdBQUcsQ0FBQztZQUMxQixJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDNUMsQ0FBQztRQUNELFlBQVksRUFBRSxDQUFDO1FBQ2YsVUFBVSxFQUFFLElBQUk7S0FDbkI7SUFDRCxnQkFBZ0IsRUFBRTtRQUNkLEdBQUcsRUFBRSxVQUFTLEdBQUc7WUFDYixJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDO1lBQ3RDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUM1QyxDQUFDO0tBQ0o7SUFDRCxLQUFLLEVBQUU7UUFDSCxHQUFHLEVBQUUsVUFBUyxHQUFHLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQSxDQUFDLENBQUM7UUFDekMsR0FBRyxFQUFFLGNBQWEsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDdkQsWUFBWSxFQUFFLGtCQUFrQjtRQUNoQyxVQUFVLEVBQUUsSUFBSTtLQUNuQjtDQUNKLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXG5pbXBvcnQge2FkZENzc0NsYXNzLCBjcmVhdGVFbGVtZW50LCBpbXBvcnRDc3NTdHJpbmcsIHJlbW92ZUNzc0NsYXNzLCBzZXRDc3NDbGFzc30gZnJvbSBcIi4vbGliL2RvbVwiO1xuaW1wb3J0IHtfZW1pdCwgZGVmaW5lT3B0aW9ucywgbG9hZE1vZHVsZSwgcmVzZXRPcHRpb25zfSBmcm9tIFwiLi9jb25maWdcIjtcbmltcG9ydCB7aXNPbGRJRX0gZnJvbSBcIi4vbGliL3VzZXJhZ2VudFwiO1xuaW1wb3J0IEd1dHRlciBmcm9tIFwiLi9sYXllci9HdXR0ZXJcIjtcbmltcG9ydCBNYXJrZXIgZnJvbSBcIi4vbGF5ZXIvTWFya2VyXCI7XG5pbXBvcnQgVGV4dCBmcm9tIFwiLi9sYXllci9UZXh0XCI7XG5pbXBvcnQgQ3Vyc29yIGZyb20gXCIuL2xheWVyL0N1cnNvclwiO1xuaW1wb3J0IFZTY3JvbGxCYXIgZnJvbSBcIi4vVlNjcm9sbEJhclwiO1xuaW1wb3J0IEhTY3JvbGxCYXIgZnJvbSBcIi4vSFNjcm9sbEJhclwiO1xuaW1wb3J0IFJlbmRlckxvb3AgZnJvbSBcIi4vUmVuZGVyTG9vcFwiO1xuaW1wb3J0IEZvbnRNZXRyaWNzIGZyb20gXCIuL2xheWVyL0ZvbnRNZXRyaWNzXCI7XG5pbXBvcnQgRXZlbnRFbWl0dGVyQ2xhc3MgZnJvbSBcIi4vbGliL2V2ZW50X2VtaXR0ZXJcIjtcbmltcG9ydCBFZGl0U2Vzc2lvbiBmcm9tICcuL0VkaXRTZXNzaW9uJztcbmltcG9ydCBPcHRpb25zUHJvdmlkZXIgZnJvbSBcIi4vT3B0aW9uc1Byb3ZpZGVyXCI7XG5cbi8vIEZJWE1FXG4vLyBpbXBvcnQgZWRpdG9yQ3NzID0gcmVxdWlyZShcIi4vcmVxdWlyZWpzL3RleHQhLi9jc3MvZWRpdG9yLmNzc1wiKTtcbi8vIGltcG9ydENzc1N0cmluZyhlZGl0b3JDc3MsIFwiYWNlX2VkaXRvclwiKTtcblxudmFyIENIQU5HRV9DVVJTT1IgPSAxO1xudmFyIENIQU5HRV9NQVJLRVIgPSAyO1xudmFyIENIQU5HRV9HVVRURVIgPSA0O1xudmFyIENIQU5HRV9TQ1JPTEwgPSA4O1xudmFyIENIQU5HRV9MSU5FUyA9IDE2O1xudmFyIENIQU5HRV9URVhUID0gMzI7XG52YXIgQ0hBTkdFX1NJWkUgPSA2NDtcbnZhciBDSEFOR0VfTUFSS0VSX0JBQ0sgPSAxMjg7XG52YXIgQ0hBTkdFX01BUktFUl9GUk9OVCA9IDI1NjtcbnZhciBDSEFOR0VfRlVMTCA9IDUxMjtcbnZhciBDSEFOR0VfSF9TQ1JPTEwgPSAxMDI0O1xuXG4vKipcbiAqIFRoZSBjbGFzcyB0aGF0IGlzIHJlc3BvbnNpYmxlIGZvciBkcmF3aW5nIGV2ZXJ5dGhpbmcgeW91IHNlZSBvbiB0aGUgc2NyZWVuIVxuICogQHJlbGF0ZWQgZWRpdG9yLnJlbmRlcmVyIFxuICogQGNsYXNzIFZpcnR1YWxSZW5kZXJlclxuICoqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgVmlydHVhbFJlbmRlcmVyIGV4dGVuZHMgRXZlbnRFbWl0dGVyQ2xhc3MgaW1wbGVtZW50cyBPcHRpb25zUHJvdmlkZXIge1xuICAgIHB1YmxpYyB0ZXh0YXJlYTogSFRNTFRleHRBcmVhRWxlbWVudDtcbiAgICBwdWJsaWMgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcbiAgICBwdWJsaWMgc2Nyb2xsTGVmdCA9IDA7XG4gICAgcHVibGljIHNjcm9sbFRvcCA9IDA7XG4gICAgcHVibGljIGxheWVyQ29uZmlnID0ge1xuICAgICAgICB3aWR0aDogMSxcbiAgICAgICAgcGFkZGluZzogMCxcbiAgICAgICAgZmlyc3RSb3c6IDAsXG4gICAgICAgIGZpcnN0Um93U2NyZWVuOiAwLFxuICAgICAgICBsYXN0Um93OiAwLFxuICAgICAgICBsaW5lSGVpZ2h0OiAwLFxuICAgICAgICBjaGFyYWN0ZXJXaWR0aDogMCxcbiAgICAgICAgbWluSGVpZ2h0OiAxLFxuICAgICAgICBtYXhIZWlnaHQ6IDEsXG4gICAgICAgIG9mZnNldDogMCxcbiAgICAgICAgaGVpZ2h0OiAxLFxuICAgICAgICBndXR0ZXJPZmZzZXQ6IDFcbiAgICB9O1xuICAgIHB1YmxpYyAkbWF4TGluZXM6IG51bWJlcjtcbiAgICBwdWJsaWMgJG1pbkxpbmVzOiBudW1iZXI7XG4gICAgcHVibGljICRjdXJzb3JMYXllcjogQ3Vyc29yO1xuICAgIHB1YmxpYyAkZ3V0dGVyTGF5ZXI6IEd1dHRlcjtcblxuICAgIHB1YmxpYyAkcGFkZGluZzogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlICRmcm96ZW4gPSBmYWxzZTtcblxuICAgIC8vIFRoZSB0aGVtZUlkIGlzIHdoYXQgaXMgY29tbXVuaWNhdGVkIGluIHRoZSBBUEkuXG4gICAgcHJpdmF0ZSAkdGhlbWVJZDogc3RyaW5nO1xuICAgIC8qKlxuICAgICAqIFRoZSBsb2FkZWQgdGhlbWUgb2JqZWN0LiBUaGlzIGFsbG93cyB1cyB0byByZW1vdmUgYSB0aGVtZS5cbiAgICAgKi9cbiAgICBwcml2YXRlIHRoZW1lOiB7IGNzc0NsYXNzOiBzdHJpbmcgfTtcblxuICAgIHByaXZhdGUgJHRpbWVyO1xuICAgIHByaXZhdGUgU1RFUFMgPSA4O1xuICAgIHB1YmxpYyAka2VlcFRleHRBcmVhQXRDdXJzb3I6IGJvb2xlYW47XG4gICAgcHVibGljICRndXR0ZXI7XG4gICAgcHVibGljIHNjcm9sbGVyO1xuICAgIHB1YmxpYyBjb250ZW50OiBIVE1MRGl2RWxlbWVudDtcbiAgICBwdWJsaWMgJHRleHRMYXllcjogVGV4dDtcbiAgICBwcml2YXRlICRtYXJrZXJGcm9udDogTWFya2VyO1xuICAgIHByaXZhdGUgJG1hcmtlckJhY2s6IE1hcmtlcjtcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTERpdkVsZW1lbnQ7XG4gICAgcHJpdmF0ZSAkaG9yaXpTY3JvbGw6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkdlNjcm9sbDtcbiAgICBwdWJsaWMgc2Nyb2xsQmFySDogSFNjcm9sbEJhcjtcbiAgICBwdWJsaWMgc2Nyb2xsQmFyVjogVlNjcm9sbEJhcjtcbiAgICBwcml2YXRlICRzY3JvbGxBbmltYXRpb246IHsgZnJvbTogbnVtYmVyOyB0bzogbnVtYmVyOyBzdGVwczogbnVtYmVyW10gfTtcbiAgICBwdWJsaWMgJHNjcm9sbGJhcldpZHRoOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBzZXNzaW9uOiBFZGl0U2Vzc2lvbjtcblxuICAgIHByaXZhdGUgc2Nyb2xsTWFyZ2luID0ge1xuICAgICAgICBsZWZ0OiAwLFxuICAgICAgICByaWdodDogMCxcbiAgICAgICAgdG9wOiAwLFxuICAgICAgICBib3R0b206IDAsXG4gICAgICAgIHY6IDAsXG4gICAgICAgIGg6IDBcbiAgICB9O1xuXG4gICAgcHJpdmF0ZSAkZm9udE1ldHJpY3M6IEZvbnRNZXRyaWNzO1xuICAgIHByaXZhdGUgJGFsbG93Qm9sZEZvbnRzO1xuICAgIHByaXZhdGUgY3Vyc29yUG9zO1xuICAgIHB1YmxpYyAkc2l6ZTtcbiAgICBwcml2YXRlICRsb29wOiBSZW5kZXJMb29wO1xuICAgIHByaXZhdGUgJGNoYW5nZWRMaW5lcztcbiAgICBwcml2YXRlICRjaGFuZ2VzID0gMDtcbiAgICBwcml2YXRlIHJlc2l6aW5nO1xuICAgIHByaXZhdGUgJGd1dHRlckxpbmVIaWdobGlnaHQ7XG4gICAgLy8gRklYTUU6IFdoeSBkbyB3ZSBoYXZlIHR3bz9cbiAgICBwdWJsaWMgZ3V0dGVyV2lkdGg6IG51bWJlcjtcbiAgICBwcml2YXRlICRndXR0ZXJXaWR0aDogbnVtYmVyO1xuICAgIHByaXZhdGUgJHNob3dQcmludE1hcmdpbjtcbiAgICBwcml2YXRlICRwcmludE1hcmdpbkVsO1xuICAgIHByaXZhdGUgZ2V0T3B0aW9uO1xuICAgIHByaXZhdGUgc2V0T3B0aW9uO1xuICAgIHByaXZhdGUgY2hhcmFjdGVyV2lkdGg7XG4gICAgcHJpdmF0ZSAkcHJpbnRNYXJnaW5Db2x1bW47XG4gICAgcHJpdmF0ZSBsaW5lSGVpZ2h0O1xuICAgIHByaXZhdGUgJGV4dHJhSGVpZ2h0O1xuICAgIHByaXZhdGUgJGNvbXBvc2l0aW9uOiB7IGtlZXBUZXh0QXJlYUF0Q3Vyc29yOiBib29sZWFuOyBjc3NUZXh0OiBzdHJpbmcgfTtcbiAgICBwcml2YXRlICRoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTtcbiAgICBwcml2YXRlICR2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTtcbiAgICBwcml2YXRlICRzaG93R3V0dGVyO1xuICAgIHByaXZhdGUgc2hvd0ludmlzaWJsZXM7XG4gICAgcHJpdmF0ZSAkYW5pbWF0ZWRTY3JvbGw6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkc2Nyb2xsUGFzdEVuZDtcbiAgICBwcml2YXRlICRoaWdobGlnaHRHdXR0ZXJMaW5lO1xuICAgIHByaXZhdGUgZGVzaXJlZEhlaWdodDtcblxuICAgIC8qKlxuICAgICAqIENvbnN0cnVjdHMgYSBuZXcgYFZpcnR1YWxSZW5kZXJlcmAgd2l0aGluIHRoZSBgY29udGFpbmVyYCBzcGVjaWZpZWQuXG4gICAgICogQGNsYXNzIFZpcnR1YWxSZW5kZXJlclxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqIEBwYXJhbSBjb250YWluZXIge0hUTUxFbGVtZW50fSBUaGUgcm9vdCBlbGVtZW50IG9mIHRoZSBlZGl0b3IuXG4gICAgICovXG4gICAgY29uc3RydWN0b3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgICAgICBzdXBlcigpO1xuXG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgdGhpcy5jb250YWluZXIgPSBjb250YWluZXIgfHwgPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cbiAgICAgICAgLy8gVE9ETzogdGhpcyBicmVha3MgcmVuZGVyaW5nIGluIENsb3VkOSB3aXRoIG11bHRpcGxlIGFjZSBpbnN0YW5jZXNcbiAgICAgICAgLy8gLy8gSW1wb3J0cyBDU1Mgb25jZSBwZXIgRE9NIGRvY3VtZW50ICgnYWNlX2VkaXRvcicgc2VydmVzIGFzIGFuIGlkZW50aWZpZXIpLlxuICAgICAgICAvLyBpbXBvcnRDc3NTdHJpbmcoZWRpdG9yQ3NzLCBcImFjZV9lZGl0b3JcIiwgY29udGFpbmVyLm93bmVyRG9jdW1lbnQpO1xuXG4gICAgICAgIC8vIGluIElFIDw9IDkgdGhlIG5hdGl2ZSBjdXJzb3IgYWx3YXlzIHNoaW5lcyB0aHJvdWdoXG4gICAgICAgIHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0gIWlzT2xkSUU7XG5cbiAgICAgICAgYWRkQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIFwiYWNlX2VkaXRvclwiKTtcblxuICAgICAgICB0aGlzLiRndXR0ZXIgPSBjcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB0aGlzLiRndXR0ZXIuY2xhc3NOYW1lID0gXCJhY2VfZ3V0dGVyXCI7XG4gICAgICAgIHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuJGd1dHRlcik7XG5cbiAgICAgICAgdGhpcy5zY3JvbGxlciA9IGNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRoaXMuc2Nyb2xsZXIuY2xhc3NOYW1lID0gXCJhY2Vfc2Nyb2xsZXJcIjtcbiAgICAgICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5zY3JvbGxlcik7XG5cbiAgICAgICAgdGhpcy5jb250ZW50ID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRoaXMuY29udGVudC5jbGFzc05hbWUgPSBcImFjZV9jb250ZW50XCI7XG4gICAgICAgIHRoaXMuc2Nyb2xsZXIuYXBwZW5kQ2hpbGQodGhpcy5jb250ZW50KTtcblxuICAgICAgICB0aGlzLiRndXR0ZXJMYXllciA9IG5ldyBHdXR0ZXIodGhpcy4kZ3V0dGVyKTtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIub24oXCJjaGFuZ2VHdXR0ZXJXaWR0aFwiLCB0aGlzLm9uR3V0dGVyUmVzaXplLmJpbmQodGhpcykpO1xuXG4gICAgICAgIHRoaXMuJG1hcmtlckJhY2sgPSBuZXcgTWFya2VyKHRoaXMuY29udGVudCk7XG5cbiAgICAgICAgdmFyIHRleHRMYXllciA9IHRoaXMuJHRleHRMYXllciA9IG5ldyBUZXh0KHRoaXMuY29udGVudCk7XG4gICAgICAgIHRoaXMuY2FudmFzID0gdGV4dExheWVyLmVsZW1lbnQ7XG5cbiAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQgPSBuZXcgTWFya2VyKHRoaXMuY29udGVudCk7XG5cbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIgPSBuZXcgQ3Vyc29yKHRoaXMuY29udGVudCk7XG5cbiAgICAgICAgLy8gSW5kaWNhdGVzIHdoZXRoZXIgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyIGlzIHZpc2libGVcbiAgICAgICAgdGhpcy4kaG9yaXpTY3JvbGwgPSBmYWxzZTtcbiAgICAgICAgdGhpcy4kdlNjcm9sbCA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMuc2Nyb2xsQmFyViA9IG5ldyBWU2Nyb2xsQmFyKHRoaXMuY29udGFpbmVyLCB0aGlzKTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJIID0gbmV3IEhTY3JvbGxCYXIodGhpcy5jb250YWluZXIsIHRoaXMpO1xuICAgICAgICB0aGlzLnNjcm9sbEJhclYub24oXCJzY3JvbGxcIiwgZnVuY3Rpb24oZXZlbnQsIHNjcm9sbEJhcjogVlNjcm9sbEJhcikge1xuICAgICAgICAgICAgaWYgKCFfc2VsZi4kc2Nyb2xsQW5pbWF0aW9uKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxUb3AoZXZlbnQuZGF0YSAtIF9zZWxmLnNjcm9sbE1hcmdpbi50b3ApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJILm9uKFwic2Nyb2xsXCIsIGZ1bmN0aW9uKGV2ZW50LCBzY3JvbGxCYXI6IEhTY3JvbGxCYXIpIHtcbiAgICAgICAgICAgIGlmICghX3NlbGYuJHNjcm9sbEFuaW1hdGlvbikge1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsTGVmdChldmVudC5kYXRhIC0gX3NlbGYuc2Nyb2xsTWFyZ2luLmxlZnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmN1cnNvclBvcyA9IHtcbiAgICAgICAgICAgIHJvdzogMCxcbiAgICAgICAgICAgIGNvbHVtbjogMFxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuJGZvbnRNZXRyaWNzID0gbmV3IEZvbnRNZXRyaWNzKHRoaXMuY29udGFpbmVyLCA1MDApO1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuJHNldEZvbnRNZXRyaWNzKHRoaXMuJGZvbnRNZXRyaWNzKTtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLm9uKFwiY2hhbmdlQ2hhcmFjdGVyU2l6ZVwiLCBmdW5jdGlvbihldmVudCwgdGV4dDogVGV4dCkge1xuICAgICAgICAgICAgX3NlbGYudXBkYXRlQ2hhcmFjdGVyU2l6ZSgpO1xuICAgICAgICAgICAgX3NlbGYub25SZXNpemUodHJ1ZSwgX3NlbGYuZ3V0dGVyV2lkdGgsIF9zZWxmLiRzaXplLndpZHRoLCBfc2VsZi4kc2l6ZS5oZWlnaHQpO1xuICAgICAgICAgICAgX3NlbGYuX3NpZ25hbChcImNoYW5nZUNoYXJhY3RlclNpemVcIiwgZXZlbnQpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLiRzaXplID0ge1xuICAgICAgICAgICAgd2lkdGg6IDAsXG4gICAgICAgICAgICBoZWlnaHQ6IDAsXG4gICAgICAgICAgICBzY3JvbGxlckhlaWdodDogMCxcbiAgICAgICAgICAgIHNjcm9sbGVyV2lkdGg6IDAsXG4gICAgICAgICAgICAkZGlydHk6IHRydWVcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLiRsb29wID0gbmV3IFJlbmRlckxvb3AodGhpcy4kcmVuZGVyQ2hhbmdlcy5iaW5kKHRoaXMpLCB0aGlzLmNvbnRhaW5lci5vd25lckRvY3VtZW50LmRlZmF1bHRWaWV3KTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG5cbiAgICAgICAgdGhpcy51cGRhdGVDaGFyYWN0ZXJTaXplKCk7XG4gICAgICAgIHRoaXMuc2V0UGFkZGluZyg0KTtcbiAgICAgICAgcmVzZXRPcHRpb25zKHRoaXMpO1xuICAgICAgICBfZW1pdChcInJlbmRlcmVyXCIsIHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSBtYXhMaW5lc1xuICAgICAqIEB0eXBlIG51bWJlclxuICAgICAqL1xuICAgIHNldCBtYXhMaW5lcyhtYXhMaW5lczogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuJG1heExpbmVzID0gbWF4TGluZXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5IGtlZXBUZXh0QXJlYUF0Q3Vyc29yXG4gICAgICogQHR5cGUgYm9vbGVhblxuICAgICAqL1xuICAgIHNldCBrZWVwVGV4dEFyZWFBdEN1cnNvcihrZWVwVGV4dEFyZWFBdEN1cnNvcjogYm9vbGVhbikge1xuICAgICAgICB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IGtlZXBUZXh0QXJlYUF0Q3Vyc29yO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIDxjb2RlPnN0eWxlPC9jb2RlPiBwcm9wZXJ0eSBvZiB0aGUgY29udGVudCB0byBcImRlZmF1bHRcIi5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0RGVmYXVsdEN1cnNvclN0eWxlXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXREZWZhdWx0Q3Vyc29yU3R5bGUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgPSBcImRlZmF1bHRcIjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSA8Y29kZT5vcGFjaXR5PC9jb2RlPiBvZiB0aGUgY3Vyc29yIGxheWVyIHRvIFwiMFwiLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRDdXJzb3JMYXllck9mZlxuICAgICAqIEByZXR1cm4ge1ZpcnR1YWxSZW5kZXJlcn1cbiAgICAgKiBAY2hhaW5hYmxlXG4gICAgICovXG4gICAgc2V0Q3Vyc29yTGF5ZXJPZmYoKTogVmlydHVhbFJlbmRlcmVyIHtcbiAgICAgICAgdmFyIG5vb3AgPSBmdW5jdGlvbigpIHsgfTtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIucmVzdGFydFRpbWVyID0gbm9vcDtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuZWxlbWVudC5zdHlsZS5vcGFjaXR5ID0gXCIwXCI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgdXBkYXRlQ2hhcmFjdGVyU2l6ZVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgdXBkYXRlQ2hhcmFjdGVyU2l6ZSgpOiB2b2lkIHtcbiAgICAgICAgLy8gRklYTUU6IERHSCBhbGxvd0JvbGRGb250cyBkb2VzIG5vdCBleGlzdCBvbiBUZXh0XG4gICAgICAgIGlmICh0aGlzLiR0ZXh0TGF5ZXJbJ2FsbG93Qm9sZEZvbnRzJ10gIT0gdGhpcy4kYWxsb3dCb2xkRm9udHMpIHtcbiAgICAgICAgICAgIHRoaXMuJGFsbG93Qm9sZEZvbnRzID0gdGhpcy4kdGV4dExheWVyWydhbGxvd0JvbGRGb250cyddO1xuICAgICAgICAgICAgdGhpcy5zZXRTdHlsZShcImFjZV9ub2JvbGRcIiwgIXRoaXMuJGFsbG93Qm9sZEZvbnRzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubGF5ZXJDb25maWcuY2hhcmFjdGVyV2lkdGggPSB0aGlzLmNoYXJhY3RlcldpZHRoID0gdGhpcy4kdGV4dExheWVyLmdldENoYXJhY3RlcldpZHRoKCk7XG4gICAgICAgIHRoaXMubGF5ZXJDb25maWcubGluZUhlaWdodCA9IHRoaXMubGluZUhlaWdodCA9IHRoaXMuJHRleHRMYXllci5nZXRMaW5lSGVpZ2h0KCk7XG4gICAgICAgIHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXNzb2NpYXRlcyB0aGUgcmVuZGVyZXIgd2l0aCBhIGRpZmZlcmVudCBFZGl0U2Vzc2lvbi5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0U2Vzc2lvblxuICAgICAqIEBwYXJhbSBzZXNzaW9uIHtFZGl0U2Vzc2lvbn1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldFNlc3Npb24oc2Vzc2lvbjogRWRpdFNlc3Npb24pOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbikge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmRvYy5vZmYoXCJjaGFuZ2VOZXdMaW5lTW9kZVwiLCB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uID0gc2Vzc2lvbjtcbiAgICAgICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5zY3JvbGxNYXJnaW4udG9wICYmIHNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgPD0gMCkge1xuICAgICAgICAgICAgc2Vzc2lvbi5zZXRTY3JvbGxUb3AoLXRoaXMuc2Nyb2xsTWFyZ2luLnRvcCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5zZXRTZXNzaW9uKHNlc3Npb24pO1xuICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJG1hcmtlckZyb250LnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci5zZXRTZXNzaW9uKHNlc3Npb24pO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLiRzZXRGb250TWV0cmljcyh0aGlzLiRmb250TWV0cmljcyk7XG5cbiAgICAgICAgdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlID0gdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMub25DaGFuZ2VOZXdMaW5lTW9kZSgpXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5kb2Mub24oXCJjaGFuZ2VOZXdMaW5lTW9kZVwiLCB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyaWdnZXJzIGEgcGFydGlhbCB1cGRhdGUgb2YgdGhlIHRleHQsIGZyb20gdGhlIHJhbmdlIGdpdmVuIGJ5IHRoZSB0d28gcGFyYW1ldGVycy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgZmlyc3Qgcm93IHRvIHVwZGF0ZS5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbGFzdFJvdyBUaGUgbGFzdCByb3cgdG8gdXBkYXRlLlxuICAgICAqIEBwYXJhbSBbZm9yY2VdIHtib29sZWFufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgdXBkYXRlTGluZXMoZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyLCBmb3JjZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgaWYgKGxhc3RSb3cgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgbGFzdFJvdyA9IEluZmluaXR5O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLiRjaGFuZ2VkTGluZXMpIHtcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcyA9IHsgZmlyc3RSb3c6IGZpcnN0Um93LCBsYXN0Um93OiBsYXN0Um93IH07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kY2hhbmdlZExpbmVzLmZpcnN0Um93ID4gZmlyc3RSb3cpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRjaGFuZ2VkTGluZXMuZmlyc3RSb3cgPSBmaXJzdFJvdztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93IDwgbGFzdFJvdykge1xuICAgICAgICAgICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93ID0gbGFzdFJvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoZSBjaGFuZ2UgaGFwcGVuZWQgb2Zmc2NyZWVuIGFib3ZlIHVzIHRoZW4gaXQncyBwb3NzaWJsZVxuICAgICAgICAvLyB0aGF0IGEgbmV3IGxpbmUgd3JhcCB3aWxsIGFmZmVjdCB0aGUgcG9zaXRpb24gb2YgdGhlIGxpbmVzIG9uIG91clxuICAgICAgICAvLyBzY3JlZW4gc28gdGhleSBuZWVkIHJlZHJhd24uXG4gICAgICAgIC8vIFRPRE86IGJldHRlciBzb2x1dGlvbiBpcyB0byBub3QgY2hhbmdlIHNjcm9sbCBwb3NpdGlvbiB3aGVuIHRleHQgaXMgY2hhbmdlZCBvdXRzaWRlIG9mIHZpc2libGUgYXJlYVxuICAgICAgICBpZiAodGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3cgPCB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93KSB7XG4gICAgICAgICAgICBpZiAoZm9yY2UpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdyA9IHRoaXMubGF5ZXJDb25maWcubGFzdFJvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLiRjaGFuZ2VkTGluZXMuZmlyc3RSb3cgPiB0aGlzLmxheWVyQ29uZmlnLmxhc3RSb3cpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9MSU5FUyk7XG4gICAgfVxuXG4gICAgb25DaGFuZ2VOZXdMaW5lTW9kZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfVEVYVCk7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci4kdXBkYXRlRW9sQ2hhcigpO1xuICAgIH1cblxuICAgIG9uQ2hhbmdlVGFiU2l6ZSgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuJGxvb3ApIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiRsb29wLnNjaGVkdWxlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfVEVYVCB8IENIQU5HRV9NQVJLRVIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllcikge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllci5vbkNoYW5nZVRhYlNpemUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIub25DaGFuZ2VUYWJTaXplKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBJJ20gbm90IHN1cmUgd2h5IHdlIGNhbiBub3cgZW5kIHVwIGhlcmUuXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcmlnZ2VycyBhIGZ1bGwgdXBkYXRlIG9mIHRoZSB0ZXh0LCBmb3IgYWxsIHRoZSByb3dzLlxuICAgICAqL1xuICAgIHVwZGF0ZVRleHQoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX1RFWFQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyaWdnZXJzIGEgZnVsbCB1cGRhdGUgb2YgYWxsIHRoZSBsYXllcnMsIGZvciBhbGwgdGhlIHJvd3MuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBmb3JjZSBJZiBgdHJ1ZWAsIGZvcmNlcyB0aGUgY2hhbmdlcyB0aHJvdWdoXG4gICAgICovXG4gICAgdXBkYXRlRnVsbChmb3JjZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgaWYgKGZvcmNlKVxuICAgICAgICAgICAgdGhpcy4kcmVuZGVyQ2hhbmdlcyhDSEFOR0VfRlVMTCwgdHJ1ZSk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFVwZGF0ZXMgdGhlIGZvbnQgc2l6ZS5cbiAgICAgKi9cbiAgICB1cGRhdGVGb250U2l6ZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLmNoZWNrRm9yU2l6ZUNoYW5nZXMoKTtcbiAgICB9XG5cbiAgICAkdXBkYXRlU2l6ZUFzeW5jKCkge1xuICAgICAgICBpZiAodGhpcy4kbG9vcC5wZW5kaW5nKSB7XG4gICAgICAgICAgICB0aGlzLiRzaXplLiRkaXJ0eSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm9uUmVzaXplKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBbVHJpZ2dlcnMgYSByZXNpemUgb2YgdGhlIGVkaXRvci5dezogI1ZpcnR1YWxSZW5kZXJlci5vblJlc2l6ZX1cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGZvcmNlIElmIGB0cnVlYCwgcmVjb21wdXRlcyB0aGUgc2l6ZSwgZXZlbiBpZiB0aGUgaGVpZ2h0IGFuZCB3aWR0aCBoYXZlbid0IGNoYW5nZWRcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZ3V0dGVyV2lkdGggVGhlIHdpZHRoIG9mIHRoZSBndXR0ZXIgaW4gcGl4ZWxzXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHdpZHRoIFRoZSB3aWR0aCBvZiB0aGUgZWRpdG9yIGluIHBpeGVsc1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBoZWlnaHQgVGhlIGhpZWhndCBvZiB0aGUgZWRpdG9yLCBpbiBwaXhlbHNcbiAgICAgKi9cbiAgICBvblJlc2l6ZShmb3JjZT86IGJvb2xlYW4sIGd1dHRlcldpZHRoPzogbnVtYmVyLCB3aWR0aD86IG51bWJlciwgaGVpZ2h0PzogbnVtYmVyKSB7XG4gICAgICAgIGlmICh0aGlzLnJlc2l6aW5nID4gMilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgZWxzZSBpZiAodGhpcy5yZXNpemluZyA+IDApXG4gICAgICAgICAgICB0aGlzLnJlc2l6aW5nKys7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMucmVzaXppbmcgPSBmb3JjZSA/IDEgOiAwO1xuICAgICAgICAvLyBgfHwgZWwuc2Nyb2xsSGVpZ2h0YCBpcyByZXF1aXJlZCBmb3Igb3V0b3NpemluZyBlZGl0b3JzIG9uIGllXG4gICAgICAgIC8vIHdoZXJlIGVsZW1lbnRzIHdpdGggY2xpZW50SGVpZ2h0ID0gMCBhbHNvZSBoYXZlIGNsaWVudFdpZHRoID0gMFxuICAgICAgICB2YXIgZWwgPSB0aGlzLmNvbnRhaW5lcjtcbiAgICAgICAgaWYgKCFoZWlnaHQpXG4gICAgICAgICAgICBoZWlnaHQgPSBlbC5jbGllbnRIZWlnaHQgfHwgZWwuc2Nyb2xsSGVpZ2h0O1xuICAgICAgICBpZiAoIXdpZHRoKVxuICAgICAgICAgICAgd2lkdGggPSBlbC5jbGllbnRXaWR0aCB8fCBlbC5zY3JvbGxXaWR0aDtcbiAgICAgICAgdmFyIGNoYW5nZXMgPSB0aGlzLiR1cGRhdGVDYWNoZWRTaXplKGZvcmNlLCBndXR0ZXJXaWR0aCwgd2lkdGgsIGhlaWdodCk7XG5cblxuICAgICAgICBpZiAoIXRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgfHwgKCF3aWR0aCAmJiAhaGVpZ2h0KSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnJlc2l6aW5nID0gMDtcblxuICAgICAgICBpZiAoZm9yY2UpXG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci4kcGFkZGluZyA9IG51bGw7XG5cbiAgICAgICAgaWYgKGZvcmNlKVxuICAgICAgICAgICAgdGhpcy4kcmVuZGVyQ2hhbmdlcyhjaGFuZ2VzIHwgdGhpcy4kY2hhbmdlcywgdHJ1ZSk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoY2hhbmdlcyB8IHRoaXMuJGNoYW5nZXMpO1xuXG4gICAgICAgIGlmICh0aGlzLnJlc2l6aW5nKVxuICAgICAgICAgICAgdGhpcy5yZXNpemluZyA9IDA7XG4gICAgfVxuXG4gICAgJHVwZGF0ZUNhY2hlZFNpemUoZm9yY2UsIGd1dHRlcldpZHRoLCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgICAgIGhlaWdodCAtPSAodGhpcy4kZXh0cmFIZWlnaHQgfHwgMCk7XG4gICAgICAgIHZhciBjaGFuZ2VzID0gMDtcbiAgICAgICAgdmFyIHNpemUgPSB0aGlzLiRzaXplO1xuICAgICAgICB2YXIgb2xkU2l6ZSA9IHtcbiAgICAgICAgICAgIHdpZHRoOiBzaXplLndpZHRoLFxuICAgICAgICAgICAgaGVpZ2h0OiBzaXplLmhlaWdodCxcbiAgICAgICAgICAgIHNjcm9sbGVySGVpZ2h0OiBzaXplLnNjcm9sbGVySGVpZ2h0LFxuICAgICAgICAgICAgc2Nyb2xsZXJXaWR0aDogc2l6ZS5zY3JvbGxlcldpZHRoXG4gICAgICAgIH07XG4gICAgICAgIGlmIChoZWlnaHQgJiYgKGZvcmNlIHx8IHNpemUuaGVpZ2h0ICE9IGhlaWdodCkpIHtcbiAgICAgICAgICAgIHNpemUuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgICAgICAgICAgY2hhbmdlcyB8PSBDSEFOR0VfU0laRTtcblxuICAgICAgICAgICAgc2l6ZS5zY3JvbGxlckhlaWdodCA9IHNpemUuaGVpZ2h0O1xuICAgICAgICAgICAgaWYgKHRoaXMuJGhvcml6U2Nyb2xsKVxuICAgICAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJIZWlnaHQgLT0gdGhpcy5zY3JvbGxCYXJILmhlaWdodDtcblxuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJWLmVsZW1lbnQuc3R5bGUuYm90dG9tID0gdGhpcy5zY3JvbGxCYXJILmhlaWdodCArIFwicHhcIjtcblxuICAgICAgICAgICAgY2hhbmdlcyA9IGNoYW5nZXMgfCBDSEFOR0VfU0NST0xMO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHdpZHRoICYmIChmb3JjZSB8fCBzaXplLndpZHRoICE9IHdpZHRoKSkge1xuICAgICAgICAgICAgY2hhbmdlcyB8PSBDSEFOR0VfU0laRTtcbiAgICAgICAgICAgIHNpemUud2lkdGggPSB3aWR0aDtcblxuICAgICAgICAgICAgaWYgKGd1dHRlcldpZHRoID09IG51bGwpXG4gICAgICAgICAgICAgICAgZ3V0dGVyV2lkdGggPSB0aGlzLiRzaG93R3V0dGVyID8gdGhpcy4kZ3V0dGVyLm9mZnNldFdpZHRoIDogMDtcblxuICAgICAgICAgICAgdGhpcy5ndXR0ZXJXaWR0aCA9IGd1dHRlcldpZHRoO1xuXG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhckguZWxlbWVudC5zdHlsZS5sZWZ0ID1cbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbGVyLnN0eWxlLmxlZnQgPSBndXR0ZXJXaWR0aCArIFwicHhcIjtcbiAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJXaWR0aCA9IE1hdGgubWF4KDAsIHdpZHRoIC0gZ3V0dGVyV2lkdGggLSB0aGlzLnNjcm9sbEJhclYud2lkdGgpO1xuXG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhckguZWxlbWVudC5zdHlsZS5yaWdodCA9XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxlci5zdHlsZS5yaWdodCA9IHRoaXMuc2Nyb2xsQmFyVi53aWR0aCArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsZXIuc3R5bGUuYm90dG9tID0gdGhpcy5zY3JvbGxCYXJILmhlaWdodCArIFwicHhcIjtcblxuICAgICAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbiAmJiB0aGlzLnNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKSAmJiB0aGlzLmFkanVzdFdyYXBMaW1pdCgpIHx8IGZvcmNlKVxuICAgICAgICAgICAgICAgIGNoYW5nZXMgfD0gQ0hBTkdFX0ZVTEw7XG4gICAgICAgIH1cblxuICAgICAgICBzaXplLiRkaXJ0eSA9ICF3aWR0aCB8fCAhaGVpZ2h0O1xuXG4gICAgICAgIGlmIChjaGFuZ2VzKVxuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwicmVzaXplXCIsIG9sZFNpemUpO1xuXG4gICAgICAgIHJldHVybiBjaGFuZ2VzO1xuICAgIH1cblxuICAgIG9uR3V0dGVyUmVzaXplKCkge1xuICAgICAgICB2YXIgZ3V0dGVyV2lkdGggPSB0aGlzLiRzaG93R3V0dGVyID8gdGhpcy4kZ3V0dGVyLm9mZnNldFdpZHRoIDogMDtcbiAgICAgICAgaWYgKGd1dHRlcldpZHRoICE9IHRoaXMuZ3V0dGVyV2lkdGgpXG4gICAgICAgICAgICB0aGlzLiRjaGFuZ2VzIHw9IHRoaXMuJHVwZGF0ZUNhY2hlZFNpemUodHJ1ZSwgZ3V0dGVyV2lkdGgsIHRoaXMuJHNpemUud2lkdGgsIHRoaXMuJHNpemUuaGVpZ2h0KTtcblxuICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmdldFVzZVdyYXBNb2RlKCkgJiYgdGhpcy5hZGp1c3RXcmFwTGltaXQoKSkge1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy4kc2l6ZS4kZGlydHkpIHtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kY29tcHV0ZUxheWVyQ29uZmlnKCk7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9NQVJLRVIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBBZGp1c3RzIHRoZSB3cmFwIGxpbWl0LCB3aGljaCBpcyB0aGUgbnVtYmVyIG9mIGNoYXJhY3RlcnMgdGhhdCBjYW4gZml0IHdpdGhpbiB0aGUgd2lkdGggb2YgdGhlIGVkaXQgYXJlYSBvbiBzY3JlZW4uXG4gICAgKiovXG4gICAgYWRqdXN0V3JhcExpbWl0KCkge1xuICAgICAgICB2YXIgYXZhaWxhYmxlV2lkdGggPSB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSB0aGlzLiRwYWRkaW5nICogMjtcbiAgICAgICAgdmFyIGxpbWl0ID0gTWF0aC5mbG9vcihhdmFpbGFibGVXaWR0aCAvIHRoaXMuY2hhcmFjdGVyV2lkdGgpO1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmFkanVzdFdyYXBMaW1pdChsaW1pdCwgdGhpcy4kc2hvd1ByaW50TWFyZ2luICYmIHRoaXMuJHByaW50TWFyZ2luQ29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gaGF2ZSBhbiBhbmltYXRlZCBzY3JvbGwgb3Igbm90LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRBbmltYXRlZFNjcm9sbFxuICAgICAqIEBwYXJhbSBzaG91bGRBbmltYXRlIHtib29sZWFufSBTZXQgdG8gYHRydWVgIHRvIHNob3cgYW5pbWF0ZWQgc2Nyb2xscy5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldEFuaW1hdGVkU2Nyb2xsKHNob3VsZEFuaW1hdGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJhbmltYXRlZFNjcm9sbFwiLCBzaG91bGRBbmltYXRlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHdoZXRoZXIgYW4gYW5pbWF0ZWQgc2Nyb2xsIGhhcHBlbnMgb3Igbm90LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRBbmltYXRlZFNjcm9sbFxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0QW5pbWF0ZWRTY3JvbGwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRhbmltYXRlZFNjcm9sbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyBpbnZpc2libGUgY2hhcmFjdGVycyBvciBub3QuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93SW52aXNpYmxlcyBTZXQgdG8gYHRydWVgIHRvIHNob3cgaW52aXNpYmxlc1xuICAgICAqL1xuICAgIHNldFNob3dJbnZpc2libGVzKHNob3dJbnZpc2libGVzOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwic2hvd0ludmlzaWJsZXNcIiwgc2hvd0ludmlzaWJsZXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciBpbnZpc2libGUgY2hhcmFjdGVycyBhcmUgYmVpbmcgc2hvd24gb3Igbm90LlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd0ludmlzaWJsZXMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInNob3dJbnZpc2libGVzXCIpO1xuICAgIH1cblxuICAgIGdldERpc3BsYXlJbmRlbnRHdWlkZXMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImRpc3BsYXlJbmRlbnRHdWlkZXNcIik7XG4gICAgfVxuXG4gICAgc2V0RGlzcGxheUluZGVudEd1aWRlcyhkaXNwbGF5SW5kZW50R3VpZGVzOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiZGlzcGxheUluZGVudEd1aWRlc1wiLCBkaXNwbGF5SW5kZW50R3VpZGVzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyB0aGUgcHJpbnQgbWFyZ2luIG9yIG5vdC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3dQcmludE1hcmdpbiBTZXQgdG8gYHRydWVgIHRvIHNob3cgdGhlIHByaW50IG1hcmdpblxuICAgICAqXG4gICAgICovXG4gICAgc2V0U2hvd1ByaW50TWFyZ2luKHNob3dQcmludE1hcmdpbjogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInNob3dQcmludE1hcmdpblwiLCBzaG93UHJpbnRNYXJnaW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciB0aGUgcHJpbnQgbWFyZ2luIGlzIGJlaW5nIHNob3duIG9yIG5vdC5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqL1xuICAgIGdldFNob3dQcmludE1hcmdpbigpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwic2hvd1ByaW50TWFyZ2luXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGNvbHVtbiBkZWZpbmluZyB3aGVyZSB0aGUgcHJpbnQgbWFyZ2luIHNob3VsZCBiZS5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcHJpbnRNYXJnaW5Db2x1bW4gU3BlY2lmaWVzIHRoZSBuZXcgcHJpbnQgbWFyZ2luXG4gICAgICovXG4gICAgc2V0UHJpbnRNYXJnaW5Db2x1bW4ocHJpbnRNYXJnaW5Db2x1bW46IG51bWJlcikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInByaW50TWFyZ2luQ29sdW1uXCIsIHByaW50TWFyZ2luQ29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjb2x1bW4gbnVtYmVyIG9mIHdoZXJlIHRoZSBwcmludCBtYXJnaW4gaXMuXG4gICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICAqL1xuICAgIGdldFByaW50TWFyZ2luQ29sdW1uKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInByaW50TWFyZ2luQ29sdW1uXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBndXR0ZXIgaXMgYmVpbmcgc2hvd24uXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93R3V0dGVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzaG93R3V0dGVyXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgdGhlIGd1dHRlciBvciBub3QuXG4gICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3cgU2V0IHRvIGB0cnVlYCB0byBzaG93IHRoZSBndXR0ZXJcbiAgICAqXG4gICAgKiovXG4gICAgc2V0U2hvd0d1dHRlcihzaG93KSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNldE9wdGlvbihcInNob3dHdXR0ZXJcIiwgc2hvdyk7XG4gICAgfVxuXG4gICAgZ2V0RmFkZUZvbGRXaWRnZXRzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJmYWRlRm9sZFdpZGdldHNcIilcbiAgICB9XG5cbiAgICBzZXRGYWRlRm9sZFdpZGdldHMoc2hvdykge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImZhZGVGb2xkV2lkZ2V0c1wiLCBzaG93KTtcbiAgICB9XG5cbiAgICBzZXRIaWdobGlnaHRHdXR0ZXJMaW5lKHNob3VsZEhpZ2hsaWdodCkge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImhpZ2hsaWdodEd1dHRlckxpbmVcIiwgc2hvdWxkSGlnaGxpZ2h0KTtcbiAgICB9XG5cbiAgICBnZXRIaWdobGlnaHRHdXR0ZXJMaW5lKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJoaWdobGlnaHRHdXR0ZXJMaW5lXCIpO1xuICAgIH1cblxuICAgICR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0KCkge1xuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zO1xuICAgICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5sYXllckNvbmZpZy5saW5lSGVpZ2h0O1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmdldFVzZVdyYXBNb2RlKCkpIHtcbiAgICAgICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLnNlc3Npb24uZ2V0U2VsZWN0aW9uKCkuZ2V0Q3Vyc29yKCk7XG4gICAgICAgICAgICBjdXJzb3IuY29sdW1uID0gMDtcbiAgICAgICAgICAgIHBvcyA9IHRoaXMuJGN1cnNvckxheWVyLmdldFBpeGVsUG9zaXRpb24oY3Vyc29yLCB0cnVlKTtcbiAgICAgICAgICAgIGhlaWdodCAqPSB0aGlzLnNlc3Npb24uZ2V0Um93TGVuZ3RoKGN1cnNvci5yb3cpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuc3R5bGUudG9wID0gcG9zLnRvcCAtIHRoaXMubGF5ZXJDb25maWcub2Zmc2V0ICsgXCJweFwiO1xuICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0LnN0eWxlLmhlaWdodCA9IGhlaWdodCArIFwicHhcIjtcbiAgICB9XG5cbiAgICAkdXBkYXRlUHJpbnRNYXJnaW4oKSB7XG4gICAgICAgIGlmICghdGhpcy4kc2hvd1ByaW50TWFyZ2luICYmICF0aGlzLiRwcmludE1hcmdpbkVsKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmICghdGhpcy4kcHJpbnRNYXJnaW5FbCkge1xuICAgICAgICAgICAgdmFyIGNvbnRhaW5lckVsOiBIVE1MRGl2RWxlbWVudCA9IDxIVE1MRGl2RWxlbWVudD5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgY29udGFpbmVyRWwuY2xhc3NOYW1lID0gXCJhY2VfbGF5ZXIgYWNlX3ByaW50LW1hcmdpbi1sYXllclwiO1xuICAgICAgICAgICAgdGhpcy4kcHJpbnRNYXJnaW5FbCA9IGNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICB0aGlzLiRwcmludE1hcmdpbkVsLmNsYXNzTmFtZSA9IFwiYWNlX3ByaW50LW1hcmdpblwiO1xuICAgICAgICAgICAgY29udGFpbmVyRWwuYXBwZW5kQ2hpbGQodGhpcy4kcHJpbnRNYXJnaW5FbCk7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuaW5zZXJ0QmVmb3JlKGNvbnRhaW5lckVsLCB0aGlzLmNvbnRlbnQuZmlyc3RDaGlsZCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc3R5bGUgPSB0aGlzLiRwcmludE1hcmdpbkVsLnN0eWxlO1xuICAgICAgICBzdHlsZS5sZWZ0ID0gKCh0aGlzLmNoYXJhY3RlcldpZHRoICogdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW4pICsgdGhpcy4kcGFkZGluZykgKyBcInB4XCI7XG4gICAgICAgIHN0eWxlLnZpc2liaWxpdHkgPSB0aGlzLiRzaG93UHJpbnRNYXJnaW4gPyBcInZpc2libGVcIiA6IFwiaGlkZGVuXCI7XG5cbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbiAmJiB0aGlzLnNlc3Npb25bJyR3cmFwJ10gPT0gLTEpXG4gICAgICAgICAgICB0aGlzLmFkanVzdFdyYXBMaW1pdCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIHJvb3QgZWxlbWVudCBjb250YWluaW5nIHRoaXMgcmVuZGVyZXIuXG4gICAgKiBAcmV0dXJuIHtET01FbGVtZW50fVxuICAgICoqL1xuICAgIGdldENvbnRhaW5lckVsZW1lbnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRhaW5lcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBlbGVtZW50IHRoYXQgdGhlIG1vdXNlIGV2ZW50cyBhcmUgYXR0YWNoZWQgdG9cbiAgICAqIEByZXR1cm4ge0RPTUVsZW1lbnR9XG4gICAgKiovXG4gICAgZ2V0TW91c2VFdmVudFRhcmdldCgpOiBIVE1MRGl2RWxlbWVudCB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRlbnQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgZWxlbWVudCB0byB3aGljaCB0aGUgaGlkZGVuIHRleHQgYXJlYSBpcyBhZGRlZC5cbiAgICAqIEByZXR1cm4ge0RPTUVsZW1lbnR9XG4gICAgKiovXG4gICAgZ2V0VGV4dEFyZWFDb250YWluZXIoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRhaW5lcjtcbiAgICB9XG5cbiAgICAvLyBtb3ZlIHRleHQgaW5wdXQgb3ZlciB0aGUgY3Vyc29yXG4gICAgLy8gdGhpcyBpcyByZXF1aXJlZCBmb3IgaU9TIGFuZCBJTUVcbiAgICAkbW92ZVRleHRBcmVhVG9DdXJzb3IoKSB7XG4gICAgICAgIGlmICghdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciBjb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuICAgICAgICB2YXIgcG9zVG9wID0gdGhpcy4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zLnRvcDtcbiAgICAgICAgdmFyIHBvc0xlZnQgPSB0aGlzLiRjdXJzb3JMYXllci4kcGl4ZWxQb3MubGVmdDtcbiAgICAgICAgcG9zVG9wIC09IGNvbmZpZy5vZmZzZXQ7XG5cbiAgICAgICAgdmFyIGggPSB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIGlmIChwb3NUb3AgPCAwIHx8IHBvc1RvcCA+IGNvbmZpZy5oZWlnaHQgLSBoKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciB3ID0gdGhpcy5jaGFyYWN0ZXJXaWR0aDtcbiAgICAgICAgaWYgKHRoaXMuJGNvbXBvc2l0aW9uKSB7XG4gICAgICAgICAgICB2YXIgdmFsID0gdGhpcy50ZXh0YXJlYS52YWx1ZS5yZXBsYWNlKC9eXFx4MDErLywgXCJcIik7XG4gICAgICAgICAgICB3ICo9ICh0aGlzLnNlc3Npb24uJGdldFN0cmluZ1NjcmVlbldpZHRoKHZhbClbMF0gKyAyKTtcbiAgICAgICAgICAgIGggKz0gMjtcbiAgICAgICAgICAgIHBvc1RvcCAtPSAxO1xuICAgICAgICB9XG4gICAgICAgIHBvc0xlZnQgLT0gdGhpcy5zY3JvbGxMZWZ0O1xuICAgICAgICBpZiAocG9zTGVmdCA+IHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCAtIHcpXG4gICAgICAgICAgICBwb3NMZWZ0ID0gdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gdztcblxuICAgICAgICBwb3NMZWZ0IC09IHRoaXMuc2Nyb2xsQmFyVi53aWR0aDtcblxuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLmhlaWdodCA9IGggKyBcInB4XCI7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUud2lkdGggPSB3ICsgXCJweFwiO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLnJpZ2h0ID0gTWF0aC5tYXgoMCwgdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gcG9zTGVmdCAtIHcpICsgXCJweFwiO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLmJvdHRvbSA9IE1hdGgubWF4KDAsIHRoaXMuJHNpemUuaGVpZ2h0IC0gcG9zVG9wIC0gaCkgKyBcInB4XCI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogW1JldHVybnMgdGhlIGluZGV4IG9mIHRoZSBmaXJzdCB2aXNpYmxlIHJvdy5dezogI1ZpcnR1YWxSZW5kZXJlci5nZXRGaXJzdFZpc2libGVSb3d9XG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0Rmlyc3RWaXNpYmxlUm93KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdztcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgZmlyc3QgZnVsbHkgdmlzaWJsZSByb3cuIFwiRnVsbHlcIiBoZXJlIG1lYW5zIHRoYXQgdGhlIGNoYXJhY3RlcnMgaW4gdGhlIHJvdyBhcmUgbm90IHRydW5jYXRlZDsgdGhhdCB0aGUgdG9wIGFuZCB0aGUgYm90dG9tIG9mIHRoZSByb3cgYXJlIG9uIHRoZSBzY3JlZW4uXG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0Rmlyc3RGdWxseVZpc2libGVSb3coKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93ICsgKHRoaXMubGF5ZXJDb25maWcub2Zmc2V0ID09PSAwID8gMCA6IDEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBsYXN0IGZ1bGx5IHZpc2libGUgcm93LiBcIkZ1bGx5XCIgaGVyZSBtZWFucyB0aGF0IHRoZSBjaGFyYWN0ZXJzIGluIHRoZSByb3cgYXJlIG5vdCB0cnVuY2F0ZWQ7IHRoYXQgdGhlIHRvcCBhbmQgdGhlIGJvdHRvbSBvZiB0aGUgcm93IGFyZSBvbiB0aGUgc2NyZWVuLlxuICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldExhc3RGdWxseVZpc2libGVSb3coKSB7XG4gICAgICAgIHZhciBmbGludCA9IE1hdGguZmxvb3IoKHRoaXMubGF5ZXJDb25maWcuaGVpZ2h0ICsgdGhpcy5sYXllckNvbmZpZy5vZmZzZXQpIC8gdGhpcy5sYXllckNvbmZpZy5saW5lSGVpZ2h0KTtcbiAgICAgICAgcmV0dXJuIHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3cgLSAxICsgZmxpbnQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogW1JldHVybnMgdGhlIGluZGV4IG9mIHRoZSBsYXN0IHZpc2libGUgcm93Ll17OiAjVmlydHVhbFJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93fVxuICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldExhc3RWaXNpYmxlUm93KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sYXllckNvbmZpZy5sYXN0Um93O1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyB0aGUgcGFkZGluZyBmb3IgYWxsIHRoZSBsYXllcnMuXG4gICAgKiBAcGFyYW0ge251bWJlcn0gcGFkZGluZyBBIG5ldyBwYWRkaW5nIHZhbHVlIChpbiBwaXhlbHMpXG4gICAgKiovXG4gICAgc2V0UGFkZGluZyhwYWRkaW5nOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy4kcGFkZGluZyA9IHBhZGRpbmc7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgICAgICB0aGlzLiR1cGRhdGVQcmludE1hcmdpbigpO1xuICAgIH1cblxuICAgIHNldFNjcm9sbE1hcmdpbih0b3AsIGJvdHRvbSwgbGVmdCwgcmlnaHQpIHtcbiAgICAgICAgdmFyIHNtID0gdGhpcy5zY3JvbGxNYXJnaW47XG4gICAgICAgIHNtLnRvcCA9IHRvcCB8IDA7XG4gICAgICAgIHNtLmJvdHRvbSA9IGJvdHRvbSB8IDA7XG4gICAgICAgIHNtLnJpZ2h0ID0gcmlnaHQgfCAwO1xuICAgICAgICBzbS5sZWZ0ID0gbGVmdCB8IDA7XG4gICAgICAgIHNtLnYgPSBzbS50b3AgKyBzbS5ib3R0b207XG4gICAgICAgIHNtLmggPSBzbS5sZWZ0ICsgc20ucmlnaHQ7XG4gICAgICAgIGlmIChzbS50b3AgJiYgdGhpcy5zY3JvbGxUb3AgPD0gMCAmJiB0aGlzLnNlc3Npb24pXG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKC1zbS50b3ApO1xuICAgICAgICB0aGlzLnVwZGF0ZUZ1bGwoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyIGlzIHNldCB0byBiZSBhbHdheXMgdmlzaWJsZS5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRIU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSgpIHtcbiAgICAgICAgLy8gRklYTUVcbiAgICAgICAgcmV0dXJuIHRoaXMuJGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IHRoZSBob3Jpem9udGFsIHNjcm9sbGJhciBvciBub3QuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbHdheXNWaXNpYmxlIFNldCB0byBgdHJ1ZWAgdG8gbWFrZSB0aGUgaG9yaXpvbnRhbCBzY3JvbGwgYmFyIHZpc2libGVcbiAgICAgKiovXG4gICAgc2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUoYWx3YXlzVmlzaWJsZSkge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImhTY3JvbGxCYXJBbHdheXNWaXNpYmxlXCIsIGFsd2F5c1Zpc2libGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciB0aGUgdmVydGljYWwgc2Nyb2xsYmFyIGlzIHNldCB0byBiZSBhbHdheXMgdmlzaWJsZS5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRWU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IHRoZSB2ZXJ0aWNhbCBzY3JvbGxiYXIgb3Igbm90LlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYWx3YXlzVmlzaWJsZSBTZXQgdG8gYHRydWVgIHRvIG1ha2UgdGhlIHZlcnRpY2FsIHNjcm9sbCBiYXIgdmlzaWJsZVxuICAgICAqL1xuICAgIHNldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlKGFsd2F5c1Zpc2libGUpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJ2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZVwiLCBhbHdheXNWaXNpYmxlKTtcbiAgICB9XG5cbiAgICAkdXBkYXRlU2Nyb2xsQmFyVigpIHtcbiAgICAgICAgdmFyIHNjcm9sbEhlaWdodCA9IHRoaXMubGF5ZXJDb25maWcubWF4SGVpZ2h0O1xuICAgICAgICB2YXIgc2Nyb2xsZXJIZWlnaHQgPSB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0O1xuICAgICAgICBpZiAoIXRoaXMuJG1heExpbmVzICYmIHRoaXMuJHNjcm9sbFBhc3RFbmQpIHtcbiAgICAgICAgICAgIHNjcm9sbEhlaWdodCAtPSAoc2Nyb2xsZXJIZWlnaHQgLSB0aGlzLmxpbmVIZWlnaHQpICogdGhpcy4kc2Nyb2xsUGFzdEVuZDtcbiAgICAgICAgICAgIGlmICh0aGlzLnNjcm9sbFRvcCA+IHNjcm9sbEhlaWdodCAtIHNjcm9sbGVySGVpZ2h0KSB7XG4gICAgICAgICAgICAgICAgc2Nyb2xsSGVpZ2h0ID0gdGhpcy5zY3JvbGxUb3AgKyBzY3JvbGxlckhlaWdodDtcbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2Nyb2xsVG9wID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2V0U2Nyb2xsSGVpZ2h0KHNjcm9sbEhlaWdodCArIHRoaXMuc2Nyb2xsTWFyZ2luLnYpO1xuICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2V0U2Nyb2xsVG9wKHRoaXMuc2Nyb2xsVG9wICsgdGhpcy5zY3JvbGxNYXJnaW4udG9wKTtcbiAgICB9XG5cbiAgICAkdXBkYXRlU2Nyb2xsQmFySCgpIHtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJILnNldFNjcm9sbFdpZHRoKHRoaXMubGF5ZXJDb25maWcud2lkdGggKyAyICogdGhpcy4kcGFkZGluZyArIHRoaXMuc2Nyb2xsTWFyZ2luLmgpO1xuICAgICAgICB0aGlzLnNjcm9sbEJhckguc2V0U2Nyb2xsTGVmdCh0aGlzLnNjcm9sbExlZnQgKyB0aGlzLnNjcm9sbE1hcmdpbi5sZWZ0KTtcbiAgICB9XG5cbiAgICBmcmVlemUoKSB7XG4gICAgICAgIHRoaXMuJGZyb3plbiA9IHRydWU7XG4gICAgfVxuXG4gICAgdW5mcmVlemUoKSB7XG4gICAgICAgIHRoaXMuJGZyb3plbiA9IGZhbHNlO1xuICAgIH1cblxuICAgICRyZW5kZXJDaGFuZ2VzKGNoYW5nZXMsIGZvcmNlKSB7XG4gICAgICAgIGlmICh0aGlzLiRjaGFuZ2VzKSB7XG4gICAgICAgICAgICBjaGFuZ2VzIHw9IHRoaXMuJGNoYW5nZXM7XG4gICAgICAgICAgICB0aGlzLiRjaGFuZ2VzID0gMDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoKCF0aGlzLnNlc3Npb24gfHwgIXRoaXMuY29udGFpbmVyLm9mZnNldFdpZHRoIHx8IHRoaXMuJGZyb3plbikgfHwgKCFjaGFuZ2VzICYmICFmb3JjZSkpIHtcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZXMgfD0gY2hhbmdlcztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy4kc2l6ZS4kZGlydHkpIHtcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZXMgfD0gY2hhbmdlcztcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm9uUmVzaXplKHRydWUpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghdGhpcy5saW5lSGVpZ2h0KSB7XG4gICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuY2hlY2tGb3JTaXplQ2hhbmdlcygpO1xuICAgICAgICB9XG4gICAgICAgIC8vIHRoaXMuJGxvZ0NoYW5nZXMoY2hhbmdlcyk7XG5cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiYmVmb3JlUmVuZGVyXCIpO1xuICAgICAgICB2YXIgY29uZmlnID0gdGhpcy5sYXllckNvbmZpZztcbiAgICAgICAgLy8gdGV4dCwgc2Nyb2xsaW5nIGFuZCByZXNpemUgY2hhbmdlcyBjYW4gY2F1c2UgdGhlIHZpZXcgcG9ydCBzaXplIHRvIGNoYW5nZVxuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9GVUxMIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX1NJWkUgfHxcbiAgICAgICAgICAgIGNoYW5nZXMgJiBDSEFOR0VfVEVYVCB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9MSU5FUyB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9TQ1JPTEwgfHxcbiAgICAgICAgICAgIGNoYW5nZXMgJiBDSEFOR0VfSF9TQ1JPTExcbiAgICAgICAgKSB7XG4gICAgICAgICAgICBjaGFuZ2VzIHw9IHRoaXMuJGNvbXB1dGVMYXllckNvbmZpZygpO1xuICAgICAgICAgICAgLy8gSWYgYSBjaGFuZ2UgaXMgbWFkZSBvZmZzY3JlZW4gYW5kIHdyYXBNb2RlIGlzIG9uLCB0aGVuIHRoZSBvbnNjcmVlblxuICAgICAgICAgICAgLy8gbGluZXMgbWF5IGhhdmUgYmVlbiBwdXNoZWQgZG93bi4gSWYgc28sIHRoZSBmaXJzdCBzY3JlZW4gcm93IHdpbGwgbm90XG4gICAgICAgICAgICAvLyBoYXZlIGNoYW5nZWQsIGJ1dCB0aGUgZmlyc3QgYWN0dWFsIHJvdyB3aWxsLiBJbiB0aGF0IGNhc2UsIGFkanVzdCBcbiAgICAgICAgICAgIC8vIHNjcm9sbFRvcCBzbyB0aGF0IHRoZSBjdXJzb3IgYW5kIG9uc2NyZWVuIGNvbnRlbnQgc3RheXMgaW4gdGhlIHNhbWUgcGxhY2UuXG4gICAgICAgICAgICBpZiAoY29uZmlnLmZpcnN0Um93ICE9IHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3cgJiYgY29uZmlnLmZpcnN0Um93U2NyZWVuID09IHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3dTY3JlZW4pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbFRvcCA9IHRoaXMuc2Nyb2xsVG9wICsgKGNvbmZpZy5maXJzdFJvdyAtIHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3cpICogdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICAgICAgICAgIGNoYW5nZXMgPSBjaGFuZ2VzIHwgQ0hBTkdFX1NDUk9MTDtcbiAgICAgICAgICAgICAgICBjaGFuZ2VzIHw9IHRoaXMuJGNvbXB1dGVMYXllckNvbmZpZygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uZmlnID0gdGhpcy5sYXllckNvbmZpZztcbiAgICAgICAgICAgIC8vIHVwZGF0ZSBzY3JvbGxiYXIgZmlyc3QgdG8gbm90IGxvc2Ugc2Nyb2xsIHBvc2l0aW9uIHdoZW4gZ3V0dGVyIGNhbGxzIHJlc2l6ZVxuICAgICAgICAgICAgdGhpcy4kdXBkYXRlU2Nyb2xsQmFyVigpO1xuICAgICAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfSF9TQ1JPTEwpXG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlU2Nyb2xsQmFySCgpO1xuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuZWxlbWVudC5zdHlsZS5tYXJnaW5Ub3AgPSAoLWNvbmZpZy5vZmZzZXQpICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLm1hcmdpblRvcCA9ICgtY29uZmlnLm9mZnNldCkgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUud2lkdGggPSBjb25maWcud2lkdGggKyAyICogdGhpcy4kcGFkZGluZyArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5oZWlnaHQgPSBjb25maWcubWluSGVpZ2h0ICsgXCJweFwiO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaG9yaXpvbnRhbCBzY3JvbGxpbmdcbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfSF9TQ1JPTEwpIHtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5tYXJnaW5MZWZ0ID0gLXRoaXMuc2Nyb2xsTGVmdCArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsZXIuY2xhc3NOYW1lID0gdGhpcy5zY3JvbGxMZWZ0IDw9IDAgPyBcImFjZV9zY3JvbGxlclwiIDogXCJhY2Vfc2Nyb2xsZXIgYWNlX3Njcm9sbC1sZWZ0XCI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBmdWxsXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0ZVTEwpIHtcbiAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIGlmICh0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyQmFjay51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckZyb250LnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgICAgICAgICAgdGhpcy4kaGlnaGxpZ2h0R3V0dGVyTGluZSAmJiB0aGlzLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0KCk7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJhZnRlclJlbmRlclwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHNjcm9sbGluZ1xuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9TQ1JPTEwpIHtcbiAgICAgICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX1RFWFQgfHwgY2hhbmdlcyAmIENIQU5HRV9MSU5FUylcbiAgICAgICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnNjcm9sbExpbmVzKGNvbmZpZyk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyQmFjay51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckZyb250LnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRoaWdobGlnaHRHdXR0ZXJMaW5lICYmIHRoaXMuJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQoKTtcbiAgICAgICAgICAgIHRoaXMuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJhZnRlclJlbmRlclwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX1RFWFQpIHtcbiAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIGlmICh0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoYW5nZXMgJiBDSEFOR0VfTElORVMpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiR1cGRhdGVMaW5lcygpIHx8IChjaGFuZ2VzICYgQ0hBTkdFX0dVVFRFUikgJiYgdGhpcy4kc2hvd0d1dHRlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaGFuZ2VzICYgQ0hBTkdFX1RFWFQgfHwgY2hhbmdlcyAmIENIQU5HRV9HVVRURVIpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfQ1VSU09SKSB7XG4gICAgICAgICAgICB0aGlzLiRjdXJzb3JMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgICAgICAgICB0aGlzLiRoaWdobGlnaHRHdXR0ZXJMaW5lICYmIHRoaXMuJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjaGFuZ2VzICYgKENIQU5HRV9NQVJLRVIgfCBDSEFOR0VfTUFSS0VSX0ZST05UKSkge1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2hhbmdlcyAmIChDSEFOR0VfTUFSS0VSIHwgQ0hBTkdFX01BUktFUl9CQUNLKSkge1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyQmFjay51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3NpZ25hbChcImFmdGVyUmVuZGVyXCIpO1xuICAgIH1cblxuICAgICRhdXRvc2l6ZSgpIHtcbiAgICAgICAgdmFyIGhlaWdodCA9IHRoaXMuc2Vzc2lvbi5nZXRTY3JlZW5MZW5ndGgoKSAqIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgdmFyIG1heEhlaWdodCA9IHRoaXMuJG1heExpbmVzICogdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgZGVzaXJlZEhlaWdodCA9IE1hdGgubWF4KFxuICAgICAgICAgICAgKHRoaXMuJG1pbkxpbmVzIHx8IDEpICogdGhpcy5saW5lSGVpZ2h0LFxuICAgICAgICAgICAgTWF0aC5taW4obWF4SGVpZ2h0LCBoZWlnaHQpXG4gICAgICAgICkgKyB0aGlzLnNjcm9sbE1hcmdpbi52ICsgKHRoaXMuJGV4dHJhSGVpZ2h0IHx8IDApO1xuICAgICAgICB2YXIgdlNjcm9sbCA9IGhlaWdodCA+IG1heEhlaWdodDtcblxuICAgICAgICBpZiAoZGVzaXJlZEhlaWdodCAhPSB0aGlzLmRlc2lyZWRIZWlnaHQgfHxcbiAgICAgICAgICAgIHRoaXMuJHNpemUuaGVpZ2h0ICE9IHRoaXMuZGVzaXJlZEhlaWdodCB8fCB2U2Nyb2xsICE9IHRoaXMuJHZTY3JvbGwpIHtcbiAgICAgICAgICAgIGlmICh2U2Nyb2xsICE9IHRoaXMuJHZTY3JvbGwpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiR2U2Nyb2xsID0gdlNjcm9sbDtcbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2V0VmlzaWJsZSh2U2Nyb2xsKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHcgPSB0aGlzLmNvbnRhaW5lci5jbGllbnRXaWR0aDtcbiAgICAgICAgICAgIHRoaXMuY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGRlc2lyZWRIZWlnaHQgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVDYWNoZWRTaXplKHRydWUsIHRoaXMuJGd1dHRlcldpZHRoLCB3LCBkZXNpcmVkSGVpZ2h0KTtcbiAgICAgICAgICAgIC8vIHRoaXMuJGxvb3AuY2hhbmdlcyA9IDA7XG4gICAgICAgICAgICB0aGlzLmRlc2lyZWRIZWlnaHQgPSBkZXNpcmVkSGVpZ2h0O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgJGNvbXB1dGVMYXllckNvbmZpZygpIHtcblxuICAgICAgICBpZiAodGhpcy4kbWF4TGluZXMgJiYgdGhpcy5saW5lSGVpZ2h0ID4gMSkge1xuICAgICAgICAgICAgdGhpcy4kYXV0b3NpemUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICB2YXIgc2l6ZSA9IHRoaXMuJHNpemU7XG5cbiAgICAgICAgdmFyIGhpZGVTY3JvbGxiYXJzID0gc2l6ZS5oZWlnaHQgPD0gMiAqIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgdmFyIHNjcmVlbkxpbmVzID0gdGhpcy5zZXNzaW9uLmdldFNjcmVlbkxlbmd0aCgpO1xuICAgICAgICB2YXIgbWF4SGVpZ2h0ID0gc2NyZWVuTGluZXMgKiB0aGlzLmxpbmVIZWlnaHQ7XG5cbiAgICAgICAgdmFyIG9mZnNldCA9IHRoaXMuc2Nyb2xsVG9wICUgdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgbWluSGVpZ2h0ID0gc2l6ZS5zY3JvbGxlckhlaWdodCArIHRoaXMubGluZUhlaWdodDtcblxuICAgICAgICB2YXIgbG9uZ2VzdExpbmUgPSB0aGlzLiRnZXRMb25nZXN0TGluZSgpO1xuXG4gICAgICAgIHZhciBob3JpelNjcm9sbCA9ICFoaWRlU2Nyb2xsYmFycyAmJiAodGhpcy4kaFNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHxcbiAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJXaWR0aCAtIGxvbmdlc3RMaW5lIC0gMiAqIHRoaXMuJHBhZGRpbmcgPCAwKTtcblxuICAgICAgICB2YXIgaFNjcm9sbENoYW5nZWQgPSB0aGlzLiRob3JpelNjcm9sbCAhPT0gaG9yaXpTY3JvbGw7XG4gICAgICAgIGlmIChoU2Nyb2xsQ2hhbmdlZCkge1xuICAgICAgICAgICAgdGhpcy4kaG9yaXpTY3JvbGwgPSBob3JpelNjcm9sbDtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFySC5zZXRWaXNpYmxlKGhvcml6U2Nyb2xsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy4kbWF4TGluZXMgJiYgdGhpcy4kc2Nyb2xsUGFzdEVuZCkge1xuICAgICAgICAgICAgbWF4SGVpZ2h0ICs9IChzaXplLnNjcm9sbGVySGVpZ2h0IC0gdGhpcy5saW5lSGVpZ2h0KSAqIHRoaXMuJHNjcm9sbFBhc3RFbmQ7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdlNjcm9sbCA9ICFoaWRlU2Nyb2xsYmFycyAmJiAodGhpcy4kdlNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHxcbiAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJIZWlnaHQgLSBtYXhIZWlnaHQgPCAwKTtcbiAgICAgICAgdmFyIHZTY3JvbGxDaGFuZ2VkID0gdGhpcy4kdlNjcm9sbCAhPT0gdlNjcm9sbDtcbiAgICAgICAgaWYgKHZTY3JvbGxDaGFuZ2VkKSB7XG4gICAgICAgICAgICB0aGlzLiR2U2Nyb2xsID0gdlNjcm9sbDtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zZXRWaXNpYmxlKHZTY3JvbGwpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChNYXRoLm1heCgtdGhpcy5zY3JvbGxNYXJnaW4udG9wLFxuICAgICAgICAgICAgTWF0aC5taW4odGhpcy5zY3JvbGxUb3AsIG1heEhlaWdodCAtIHNpemUuc2Nyb2xsZXJIZWlnaHQgKyB0aGlzLnNjcm9sbE1hcmdpbi5ib3R0b20pKSk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQoTWF0aC5tYXgoLXRoaXMuc2Nyb2xsTWFyZ2luLmxlZnQsIE1hdGgubWluKHRoaXMuc2Nyb2xsTGVmdCxcbiAgICAgICAgICAgIGxvbmdlc3RMaW5lICsgMiAqIHRoaXMuJHBhZGRpbmcgLSBzaXplLnNjcm9sbGVyV2lkdGggKyB0aGlzLnNjcm9sbE1hcmdpbi5yaWdodCkpKTtcblxuICAgICAgICB2YXIgbGluZUNvdW50ID0gTWF0aC5jZWlsKG1pbkhlaWdodCAvIHRoaXMubGluZUhlaWdodCkgLSAxO1xuICAgICAgICB2YXIgZmlyc3RSb3cgPSBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKCh0aGlzLnNjcm9sbFRvcCAtIG9mZnNldCkgLyB0aGlzLmxpbmVIZWlnaHQpKTtcbiAgICAgICAgdmFyIGxhc3RSb3cgPSBmaXJzdFJvdyArIGxpbmVDb3VudDtcblxuICAgICAgICAvLyBNYXAgbGluZXMgb24gdGhlIHNjcmVlbiB0byBsaW5lcyBpbiB0aGUgZG9jdW1lbnQuXG4gICAgICAgIHZhciBmaXJzdFJvd1NjcmVlbiwgZmlyc3RSb3dIZWlnaHQ7XG4gICAgICAgIHZhciBsaW5lSGVpZ2h0ID0gdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICBmaXJzdFJvdyA9IHNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFJvdyhmaXJzdFJvdywgMCk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgZmlyc3RSb3cgaXMgaW5zaWRlIG9mIGEgZm9sZExpbmUuIElmIHRydWUsIHRoZW4gdXNlIHRoZSBmaXJzdFxuICAgICAgICAvLyByb3cgb2YgdGhlIGZvbGRMaW5lLlxuICAgICAgICB2YXIgZm9sZExpbmUgPSBzZXNzaW9uLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICBmaXJzdFJvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgfVxuXG4gICAgICAgIGZpcnN0Um93U2NyZWVuID0gc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUm93KGZpcnN0Um93LCAwKTtcbiAgICAgICAgZmlyc3RSb3dIZWlnaHQgPSBzZXNzaW9uLmdldFJvd0xlbmd0aChmaXJzdFJvdykgKiBsaW5lSGVpZ2h0O1xuXG4gICAgICAgIGxhc3RSb3cgPSBNYXRoLm1pbihzZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRSb3cobGFzdFJvdywgMCksIHNlc3Npb24uZ2V0TGVuZ3RoKCkgLSAxKTtcbiAgICAgICAgbWluSGVpZ2h0ID0gc2l6ZS5zY3JvbGxlckhlaWdodCArIHNlc3Npb24uZ2V0Um93TGVuZ3RoKGxhc3RSb3cpICogbGluZUhlaWdodCArXG4gICAgICAgICAgICBmaXJzdFJvd0hlaWdodDtcblxuICAgICAgICBvZmZzZXQgPSB0aGlzLnNjcm9sbFRvcCAtIGZpcnN0Um93U2NyZWVuICogbGluZUhlaWdodDtcblxuICAgICAgICB2YXIgY2hhbmdlcyA9IDA7XG4gICAgICAgIGlmICh0aGlzLmxheWVyQ29uZmlnLndpZHRoICE9IGxvbmdlc3RMaW5lKVxuICAgICAgICAgICAgY2hhbmdlcyA9IENIQU5HRV9IX1NDUk9MTDtcbiAgICAgICAgLy8gSG9yaXpvbnRhbCBzY3JvbGxiYXIgdmlzaWJpbGl0eSBtYXkgaGF2ZSBjaGFuZ2VkLCB3aGljaCBjaGFuZ2VzXG4gICAgICAgIC8vIHRoZSBjbGllbnQgaGVpZ2h0IG9mIHRoZSBzY3JvbGxlclxuICAgICAgICBpZiAoaFNjcm9sbENoYW5nZWQgfHwgdlNjcm9sbENoYW5nZWQpIHtcbiAgICAgICAgICAgIGNoYW5nZXMgPSB0aGlzLiR1cGRhdGVDYWNoZWRTaXplKHRydWUsIHRoaXMuZ3V0dGVyV2lkdGgsIHNpemUud2lkdGgsIHNpemUuaGVpZ2h0KTtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcInNjcm9sbGJhclZpc2liaWxpdHlDaGFuZ2VkXCIpO1xuICAgICAgICAgICAgaWYgKHZTY3JvbGxDaGFuZ2VkKVxuICAgICAgICAgICAgICAgIGxvbmdlc3RMaW5lID0gdGhpcy4kZ2V0TG9uZ2VzdExpbmUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubGF5ZXJDb25maWcgPSB7XG4gICAgICAgICAgICB3aWR0aDogbG9uZ2VzdExpbmUsXG4gICAgICAgICAgICBwYWRkaW5nOiB0aGlzLiRwYWRkaW5nLFxuICAgICAgICAgICAgZmlyc3RSb3c6IGZpcnN0Um93LFxuICAgICAgICAgICAgZmlyc3RSb3dTY3JlZW46IGZpcnN0Um93U2NyZWVuLFxuICAgICAgICAgICAgbGFzdFJvdzogbGFzdFJvdyxcbiAgICAgICAgICAgIGxpbmVIZWlnaHQ6IGxpbmVIZWlnaHQsXG4gICAgICAgICAgICBjaGFyYWN0ZXJXaWR0aDogdGhpcy5jaGFyYWN0ZXJXaWR0aCxcbiAgICAgICAgICAgIG1pbkhlaWdodDogbWluSGVpZ2h0LFxuICAgICAgICAgICAgbWF4SGVpZ2h0OiBtYXhIZWlnaHQsXG4gICAgICAgICAgICBvZmZzZXQ6IG9mZnNldCxcbiAgICAgICAgICAgIGd1dHRlck9mZnNldDogTWF0aC5tYXgoMCwgTWF0aC5jZWlsKChvZmZzZXQgKyBzaXplLmhlaWdodCAtIHNpemUuc2Nyb2xsZXJIZWlnaHQpIC8gbGluZUhlaWdodCkpLFxuICAgICAgICAgICAgaGVpZ2h0OiB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0XG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIGNoYW5nZXM7XG4gICAgfVxuXG4gICAgJHVwZGF0ZUxpbmVzKCkge1xuICAgICAgICB2YXIgZmlyc3RSb3cgPSB0aGlzLiRjaGFuZ2VkTGluZXMuZmlyc3RSb3c7XG4gICAgICAgIHZhciBsYXN0Um93ID0gdGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3c7XG4gICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcyA9IG51bGw7XG5cbiAgICAgICAgdmFyIGxheWVyQ29uZmlnID0gdGhpcy5sYXllckNvbmZpZztcblxuICAgICAgICBpZiAoZmlyc3RSb3cgPiBsYXllckNvbmZpZy5sYXN0Um93ICsgMSkgeyByZXR1cm47IH1cbiAgICAgICAgaWYgKGxhc3RSb3cgPCBsYXllckNvbmZpZy5maXJzdFJvdykgeyByZXR1cm47IH1cblxuICAgICAgICAvLyBpZiB0aGUgbGFzdCByb3cgaXMgdW5rbm93biAtPiByZWRyYXcgZXZlcnl0aGluZ1xuICAgICAgICBpZiAobGFzdFJvdyA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShsYXllckNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIudXBkYXRlKGxheWVyQ29uZmlnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGVsc2UgdXBkYXRlIG9ubHkgdGhlIGNoYW5nZWQgcm93c1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIudXBkYXRlTGluZXMobGF5ZXJDb25maWcsIGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgJGdldExvbmdlc3RMaW5lKCk6IG51bWJlciB7XG4gICAgICAgIHZhciBjaGFyQ291bnQgPSB0aGlzLnNlc3Npb24uZ2V0U2NyZWVuV2lkdGgoKTtcbiAgICAgICAgaWYgKHRoaXMuc2hvd0ludmlzaWJsZXMgJiYgIXRoaXMuc2Vzc2lvbi4kdXNlV3JhcE1vZGUpXG4gICAgICAgICAgICBjaGFyQ291bnQgKz0gMTtcblxuICAgICAgICByZXR1cm4gTWF0aC5tYXgodGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gMiAqIHRoaXMuJHBhZGRpbmcsIE1hdGgucm91bmQoY2hhckNvdW50ICogdGhpcy5jaGFyYWN0ZXJXaWR0aCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFNjaGVkdWxlcyBhbiB1cGRhdGUgdG8gYWxsIHRoZSBmcm9udCBtYXJrZXJzIGluIHRoZSBkb2N1bWVudC5cbiAgICAqKi9cbiAgICB1cGRhdGVGcm9udE1hcmtlcnMoKSB7XG4gICAgICAgIHRoaXMuJG1hcmtlckZyb250LnNldE1hcmtlcnModGhpcy5zZXNzaW9uLmdldE1hcmtlcnModHJ1ZSkpO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9NQVJLRVJfRlJPTlQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFNjaGVkdWxlcyBhbiB1cGRhdGUgdG8gYWxsIHRoZSBiYWNrIG1hcmtlcnMgaW4gdGhlIGRvY3VtZW50LlxuICAgICoqL1xuICAgIHVwZGF0ZUJhY2tNYXJrZXJzKCkge1xuICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnNldE1hcmtlcnModGhpcy5zZXNzaW9uLmdldE1hcmtlcnMoZmFsc2UpKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfTUFSS0VSX0JBQ0spO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJlZHJhdyBicmVha3BvaW50cy5cbiAgICAqKi9cbiAgICB1cGRhdGVCcmVha3BvaW50cygpIHtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfR1VUVEVSKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBTZXRzIGFubm90YXRpb25zIGZvciB0aGUgZ3V0dGVyLlxuICAgICogQHBhcmFtIHtBcnJheX0gYW5ub3RhdGlvbnMgQW4gYXJyYXkgY29udGFpbmluZyBhbm5vdGF0aW9uc1xuICAgICoqL1xuICAgIHNldEFubm90YXRpb25zKGFubm90YXRpb25zKSB7XG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnNldEFubm90YXRpb25zKGFubm90YXRpb25zKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfR1VUVEVSKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBVcGRhdGVzIHRoZSBjdXJzb3IgaWNvbi5cbiAgICAqKi9cbiAgICB1cGRhdGVDdXJzb3IoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0NVUlNPUik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogSGlkZXMgdGhlIGN1cnNvciBpY29uLlxuICAgICoqL1xuICAgIGhpZGVDdXJzb3IoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLmhpZGVDdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBTaG93cyB0aGUgY3Vyc29yIGljb24uXG4gICAgKiovXG4gICAgc2hvd0N1cnNvcigpIHtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuc2hvd0N1cnNvcigpO1xuICAgIH1cblxuICAgIHNjcm9sbFNlbGVjdGlvbkludG9WaWV3KGFuY2hvciwgbGVhZCwgb2Zmc2V0Pykge1xuICAgICAgICAvLyBmaXJzdCBzY3JvbGwgYW5jaG9yIGludG8gdmlldyB0aGVuIHNjcm9sbCBsZWFkIGludG8gdmlld1xuICAgICAgICB0aGlzLnNjcm9sbEN1cnNvckludG9WaWV3KGFuY2hvciwgb2Zmc2V0KTtcbiAgICAgICAgdGhpcy5zY3JvbGxDdXJzb3JJbnRvVmlldyhsZWFkLCBvZmZzZXQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFNjcm9sbHMgdGhlIGN1cnNvciBpbnRvIHRoZSBmaXJzdCB2aXNpYmlsZSBhcmVhIG9mIHRoZSBlZGl0b3JcbiAgICAqKi9cbiAgICBzY3JvbGxDdXJzb3JJbnRvVmlldyhjdXJzb3I/LCBvZmZzZXQ/LCAkdmlld01hcmdpbj8pIHtcbiAgICAgICAgLy8gdGhlIGVkaXRvciBpcyBub3QgdmlzaWJsZVxuICAgICAgICBpZiAodGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCA9PT0gMClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuZ2V0UGl4ZWxQb3NpdGlvbihjdXJzb3IpO1xuXG4gICAgICAgIHZhciBsZWZ0ID0gcG9zLmxlZnQ7XG4gICAgICAgIHZhciB0b3AgPSBwb3MudG9wO1xuXG4gICAgICAgIHZhciB0b3BNYXJnaW4gPSAkdmlld01hcmdpbiAmJiAkdmlld01hcmdpbi50b3AgfHwgMDtcbiAgICAgICAgdmFyIGJvdHRvbU1hcmdpbiA9ICR2aWV3TWFyZ2luICYmICR2aWV3TWFyZ2luLmJvdHRvbSB8fCAwO1xuXG4gICAgICAgIHZhciBzY3JvbGxUb3AgPSB0aGlzLiRzY3JvbGxBbmltYXRpb24gPyB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgOiB0aGlzLnNjcm9sbFRvcDtcblxuICAgICAgICBpZiAoc2Nyb2xsVG9wICsgdG9wTWFyZ2luID4gdG9wKSB7XG4gICAgICAgICAgICBpZiAob2Zmc2V0KVxuICAgICAgICAgICAgICAgIHRvcCAtPSBvZmZzZXQgKiB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0O1xuICAgICAgICAgICAgaWYgKHRvcCA9PT0gMClcbiAgICAgICAgICAgICAgICB0b3AgPSAtdGhpcy5zY3JvbGxNYXJnaW4udG9wO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcCh0b3ApO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNjcm9sbFRvcCArIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgLSBib3R0b21NYXJnaW4gPCB0b3AgKyB0aGlzLmxpbmVIZWlnaHQpIHtcbiAgICAgICAgICAgIGlmIChvZmZzZXQpXG4gICAgICAgICAgICAgICAgdG9wICs9IG9mZnNldCAqIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHRvcCArIHRoaXMubGluZUhlaWdodCAtIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHNjcm9sbExlZnQgPSB0aGlzLnNjcm9sbExlZnQ7XG5cbiAgICAgICAgaWYgKHNjcm9sbExlZnQgPiBsZWZ0KSB7XG4gICAgICAgICAgICBpZiAobGVmdCA8IHRoaXMuJHBhZGRpbmcgKyAyICogdGhpcy5sYXllckNvbmZpZy5jaGFyYWN0ZXJXaWR0aClcbiAgICAgICAgICAgICAgICBsZWZ0ID0gLXRoaXMuc2Nyb2xsTWFyZ2luLmxlZnQ7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdChsZWZ0KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzY3JvbGxMZWZ0ICsgdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIDwgbGVmdCArIHRoaXMuY2hhcmFjdGVyV2lkdGgpIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KE1hdGgucm91bmQobGVmdCArIHRoaXMuY2hhcmFjdGVyV2lkdGggLSB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGgpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzY3JvbGxMZWZ0IDw9IHRoaXMuJHBhZGRpbmcgJiYgbGVmdCAtIHNjcm9sbExlZnQgPCB0aGlzLmNoYXJhY3RlcldpZHRoKSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdCgwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogezpFZGl0U2Vzc2lvbi5nZXRTY3JvbGxUb3B9XG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRTY3JvbGxUb3BcbiAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxUb3AoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIHs6RWRpdFNlc3Npb24uZ2V0U2Nyb2xsTGVmdH1cbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmdldFNjcm9sbExlZnRcbiAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxMZWZ0KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGZpcnN0IHZpc2libGUgcm93LCByZWdhcmRsZXNzIG9mIHdoZXRoZXIgaXQncyBmdWxseSB2aXNpYmxlIG9yIG5vdC5cbiAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxUb3BSb3coKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Nyb2xsVG9wIC8gdGhpcy5saW5lSGVpZ2h0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGxhc3QgdmlzaWJsZSByb3csIHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciBpdCdzIGZ1bGx5IHZpc2libGUgb3Igbm90LlxuICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldFNjcm9sbEJvdHRvbVJvdygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gTWF0aC5tYXgoMCwgTWF0aC5mbG9vcigodGhpcy5zY3JvbGxUb3AgKyB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0KSAvIHRoaXMubGluZUhlaWdodCkgLSAxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEdyYWNlZnVsbHkgc2Nyb2xscyBmcm9tIHRoZSB0b3Agb2YgdGhlIGVkaXRvciB0byB0aGUgcm93IGluZGljYXRlZC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgQSByb3cgaWRcbiAgICAqXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uc2V0U2Nyb2xsVG9wXG4gICAgKiovXG4gICAgc2Nyb2xsVG9Sb3cocm93OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChyb3cgKiB0aGlzLmxpbmVIZWlnaHQpO1xuICAgIH1cblxuICAgIGFsaWduQ3Vyc29yKGN1cnNvciwgYWxpZ25tZW50KSB7XG4gICAgICAgIGlmICh0eXBlb2YgY3Vyc29yID09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICBjdXJzb3IgPSB7IHJvdzogY3Vyc29yLCBjb2x1bW46IDAgfTtcblxuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuZ2V0UGl4ZWxQb3NpdGlvbihjdXJzb3IpO1xuICAgICAgICB2YXIgaCA9IHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgLSB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBvZmZzZXQgPSBwb3MudG9wIC0gaCAqIChhbGlnbm1lbnQgfHwgMCk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChvZmZzZXQpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0O1xuICAgIH1cblxuICAgICRjYWxjU3RlcHMoZnJvbVZhbHVlOiBudW1iZXIsIHRvVmFsdWU6IG51bWJlcik6IG51bWJlcltdIHtcbiAgICAgICAgdmFyIGk6IG51bWJlciA9IDA7XG4gICAgICAgIHZhciBsOiBudW1iZXIgPSB0aGlzLlNURVBTO1xuICAgICAgICB2YXIgc3RlcHM6IG51bWJlcltdID0gW107XG5cbiAgICAgICAgdmFyIGZ1bmMgPSBmdW5jdGlvbih0OiBudW1iZXIsIHhfbWluOiBudW1iZXIsIGR4OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICAgICAgcmV0dXJuIGR4ICogKE1hdGgucG93KHQgLSAxLCAzKSArIDEpICsgeF9taW47XG4gICAgICAgIH07XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGw7ICsraSkge1xuICAgICAgICAgICAgc3RlcHMucHVzaChmdW5jKGkgLyB0aGlzLlNURVBTLCBmcm9tVmFsdWUsIHRvVmFsdWUgLSBmcm9tVmFsdWUpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzdGVwcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHcmFjZWZ1bGx5IHNjcm9sbHMgdGhlIGVkaXRvciB0byB0aGUgcm93IGluZGljYXRlZC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbGluZSBBIGxpbmUgbnVtYmVyXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBjZW50ZXIgSWYgYHRydWVgLCBjZW50ZXJzIHRoZSBlZGl0b3IgdGhlIHRvIGluZGljYXRlZCBsaW5lXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbmltYXRlIElmIGB0cnVlYCBhbmltYXRlcyBzY3JvbGxpbmdcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgYWZ0ZXIgdGhlIGFuaW1hdGlvbiBoYXMgZmluaXNoZWRcbiAgICAgKi9cbiAgICBzY3JvbGxUb0xpbmUobGluZTogbnVtYmVyLCBjZW50ZXI6IGJvb2xlYW4sIGFuaW1hdGU6IGJvb2xlYW4sIGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLiRjdXJzb3JMYXllci5nZXRQaXhlbFBvc2l0aW9uKHsgcm93OiBsaW5lLCBjb2x1bW46IDAgfSk7XG4gICAgICAgIHZhciBvZmZzZXQgPSBwb3MudG9wO1xuICAgICAgICBpZiAoY2VudGVyKSB7XG4gICAgICAgICAgICBvZmZzZXQgLT0gdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCAvIDI7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaW5pdGlhbFNjcm9sbCA9IHRoaXMuc2Nyb2xsVG9wO1xuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKG9mZnNldCk7XG4gICAgICAgIGlmIChhbmltYXRlICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5hbmltYXRlU2Nyb2xsaW5nKGluaXRpYWxTY3JvbGwsIGNhbGxiYWNrKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFuaW1hdGVTY3JvbGxpbmcoZnJvbVZhbHVlOiBudW1iZXIsIGNhbGxiYWNrPykge1xuICAgICAgICB2YXIgdG9WYWx1ZSA9IHRoaXMuc2Nyb2xsVG9wO1xuICAgICAgICBpZiAoIXRoaXMuJGFuaW1hdGVkU2Nyb2xsKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcblxuICAgICAgICBpZiAoZnJvbVZhbHVlID09IHRvVmFsdWUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKHRoaXMuJHNjcm9sbEFuaW1hdGlvbikge1xuICAgICAgICAgICAgdmFyIG9sZFN0ZXBzID0gdGhpcy4kc2Nyb2xsQW5pbWF0aW9uLnN0ZXBzO1xuICAgICAgICAgICAgaWYgKG9sZFN0ZXBzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGZyb21WYWx1ZSA9IG9sZFN0ZXBzWzBdO1xuICAgICAgICAgICAgICAgIGlmIChmcm9tVmFsdWUgPT0gdG9WYWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHN0ZXBzID0gX3NlbGYuJGNhbGNTdGVwcyhmcm9tVmFsdWUsIHRvVmFsdWUpO1xuICAgICAgICB0aGlzLiRzY3JvbGxBbmltYXRpb24gPSB7IGZyb206IGZyb21WYWx1ZSwgdG86IHRvVmFsdWUsIHN0ZXBzOiBzdGVwcyB9O1xuXG4gICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy4kdGltZXIpO1xuXG4gICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHN0ZXBzLnNoaWZ0KCkpO1xuICAgICAgICAvLyB0cmljayBzZXNzaW9uIHRvIHRoaW5rIGl0J3MgYWxyZWFkeSBzY3JvbGxlZCB0byBub3QgbG9vc2UgdG9WYWx1ZVxuICAgICAgICBfc2VsZi5zZXNzaW9uLiRzY3JvbGxUb3AgPSB0b1ZhbHVlO1xuICAgICAgICB0aGlzLiR0aW1lciA9IHNldEludGVydmFsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHN0ZXBzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHN0ZXBzLnNoaWZ0KCkpO1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uJHNjcm9sbFRvcCA9IHRvVmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRvVmFsdWUgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uJHNjcm9sbFRvcCA9IC0xO1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHRvVmFsdWUpO1xuICAgICAgICAgICAgICAgIHRvVmFsdWUgPSBudWxsO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBkbyB0aGlzIG9uIHNlcGFyYXRlIHN0ZXAgdG8gbm90IGdldCBzcHVyaW91cyBzY3JvbGwgZXZlbnQgZnJvbSBzY3JvbGxiYXJcbiAgICAgICAgICAgICAgICBfc2VsZi4kdGltZXIgPSBjbGVhckludGVydmFsKF9zZWxmLiR0aW1lcik7XG4gICAgICAgICAgICAgICAgX3NlbGYuJHNjcm9sbEFuaW1hdGlvbiA9IG51bGw7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sgJiYgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgMTApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdGhlIGVkaXRvciB0byB0aGUgeSBwaXhlbCBpbmRpY2F0ZWQuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHNjcm9sbFRvcCBUaGUgcG9zaXRpb24gdG8gc2Nyb2xsIHRvXG4gICAgICovXG4gICAgc2Nyb2xsVG9ZKHNjcm9sbFRvcDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIC8vIGFmdGVyIGNhbGxpbmcgc2Nyb2xsQmFyLnNldFNjcm9sbFRvcFxuICAgICAgICAvLyBzY3JvbGxiYXIgc2VuZHMgdXMgZXZlbnQgd2l0aCBzYW1lIHNjcm9sbFRvcC4gaWdub3JlIGl0XG4gICAgICAgIGlmICh0aGlzLnNjcm9sbFRvcCAhPT0gc2Nyb2xsVG9wKSB7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX1NDUk9MTCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRoZSBlZGl0b3IgYWNyb3NzIHRoZSB4LWF4aXMgdG8gdGhlIHBpeGVsIGluZGljYXRlZC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc2Nyb2xsTGVmdCBUaGUgcG9zaXRpb24gdG8gc2Nyb2xsIHRvXG4gICAgICoqL1xuICAgIHNjcm9sbFRvWChzY3JvbGxMZWZ0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuc2Nyb2xsTGVmdCAhPT0gc2Nyb2xsTGVmdCkge1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxMZWZ0ID0gc2Nyb2xsTGVmdDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0hfU0NST0xMKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogU2Nyb2xscyB0aGUgZWRpdG9yIGFjcm9zcyBib3RoIHgtIGFuZCB5LWF4ZXMuXG4gICAgKiBAcGFyYW0ge051bWJlcn0geCBUaGUgeCB2YWx1ZSB0byBzY3JvbGwgdG9cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSB5IFRoZSB5IHZhbHVlIHRvIHNjcm9sbCB0b1xuICAgICoqL1xuICAgIHNjcm9sbFRvKHg6IG51bWJlciwgeTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AoeSk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KHkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2Nyb2xscyB0aGUgZWRpdG9yIGFjcm9zcyBib3RoIHgtIGFuZCB5LWF4ZXMuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZGVsdGFYIFRoZSB4IHZhbHVlIHRvIHNjcm9sbCBieVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlbHRhWSBUaGUgeSB2YWx1ZSB0byBzY3JvbGwgYnlcbiAgICAqKi9cbiAgICBzY3JvbGxCeShkZWx0YVg6IG51bWJlciwgZGVsdGFZOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgZGVsdGFZICYmIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AodGhpcy5zZXNzaW9uLmdldFNjcm9sbFRvcCgpICsgZGVsdGFZKTtcbiAgICAgICAgZGVsdGFYICYmIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxMZWZ0KCkgKyBkZWx0YVgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgeW91IGNhbiBzdGlsbCBzY3JvbGwgYnkgZWl0aGVyIHBhcmFtZXRlcjsgaW4gb3RoZXIgd29yZHMsIHlvdSBoYXZlbid0IHJlYWNoZWQgdGhlIGVuZCBvZiB0aGUgZmlsZSBvciBsaW5lLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlbHRhWCBUaGUgeCB2YWx1ZSB0byBzY3JvbGwgYnlcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkZWx0YVkgVGhlIHkgdmFsdWUgdG8gc2Nyb2xsIGJ5XG4gICAgKlxuICAgICpcbiAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgKiovXG4gICAgaXNTY3JvbGxhYmxlQnkoZGVsdGFYOiBudW1iZXIsIGRlbHRhWTogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIGlmIChkZWx0YVkgPCAwICYmIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSA+PSAxIC0gdGhpcy5zY3JvbGxNYXJnaW4udG9wKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGlmIChkZWx0YVkgPiAwICYmIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSArIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHRcbiAgICAgICAgICAgIC0gdGhpcy5sYXllckNvbmZpZy5tYXhIZWlnaHQgPCAtMSArIHRoaXMuc2Nyb2xsTWFyZ2luLmJvdHRvbSlcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBpZiAoZGVsdGFYIDwgMCAmJiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpID49IDEgLSB0aGlzLnNjcm9sbE1hcmdpbi5sZWZ0KVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGlmIChkZWx0YVggPiAwICYmIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxMZWZ0KCkgKyB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGhcbiAgICAgICAgICAgIC0gdGhpcy5sYXllckNvbmZpZy53aWR0aCA8IC0xICsgdGhpcy5zY3JvbGxNYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBwaXhlbFRvU2NyZWVuQ29vcmRpbmF0ZXMoeDogbnVtYmVyLCB5OiBudW1iZXIpIHtcbiAgICAgICAgdmFyIGNhbnZhc1BvcyA9IHRoaXMuc2Nyb2xsZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICAgICAgdmFyIG9mZnNldCA9ICh4ICsgdGhpcy5zY3JvbGxMZWZ0IC0gY2FudmFzUG9zLmxlZnQgLSB0aGlzLiRwYWRkaW5nKSAvIHRoaXMuY2hhcmFjdGVyV2lkdGg7XG4gICAgICAgIHZhciByb3cgPSBNYXRoLmZsb29yKCh5ICsgdGhpcy5zY3JvbGxUb3AgLSBjYW52YXNQb3MudG9wKSAvIHRoaXMubGluZUhlaWdodCk7XG4gICAgICAgIHZhciBjb2wgPSBNYXRoLnJvdW5kKG9mZnNldCk7XG5cbiAgICAgICAgcmV0dXJuIHsgcm93OiByb3csIGNvbHVtbjogY29sLCBzaWRlOiBvZmZzZXQgLSBjb2wgPiAwID8gMSA6IC0xIH07XG4gICAgfVxuXG4gICAgc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXMoY2xpZW50WDogbnVtYmVyLCBjbGllbnRZOiBudW1iZXIpIHtcbiAgICAgICAgdmFyIGNhbnZhc1BvcyA9IHRoaXMuc2Nyb2xsZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICAgICAgdmFyIGNvbHVtbiA9IE1hdGgucm91bmQoKGNsaWVudFggKyB0aGlzLnNjcm9sbExlZnQgLSBjYW52YXNQb3MubGVmdCAtIHRoaXMuJHBhZGRpbmcpIC8gdGhpcy5jaGFyYWN0ZXJXaWR0aCk7XG5cbiAgICAgICAgdmFyIHJvdyA9IChjbGllbnRZICsgdGhpcy5zY3JvbGxUb3AgLSBjYW52YXNQb3MudG9wKSAvIHRoaXMubGluZUhlaWdodDtcblxuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihyb3csIE1hdGgubWF4KGNvbHVtbiwgMCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgYHBhZ2VYYCBhbmQgYHBhZ2VZYCBjb29yZGluYXRlcyBvZiB0aGUgZG9jdW1lbnQgcG9zaXRpb24uXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSBkb2N1bWVudCByb3cgcG9zaXRpb25cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGRvY3VtZW50IGNvbHVtbiBwb3NpdGlvblxuICAgICogQHJldHVybiB7T2JqZWN0fVxuICAgICoqL1xuICAgIHRleHRUb1NjcmVlbkNvb3JkaW5hdGVzKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHsgcGFnZVg6IG51bWJlcjsgcGFnZVk6IG51bWJlciB9IHtcbiAgICAgICAgdmFyIGNhbnZhc1BvcyA9IHRoaXMuc2Nyb2xsZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLnNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKHJvdywgY29sdW1uKTtcblxuICAgICAgICB2YXIgeCA9IHRoaXMuJHBhZGRpbmcgKyBNYXRoLnJvdW5kKHBvcy5jb2x1bW4gKiB0aGlzLmNoYXJhY3RlcldpZHRoKTtcbiAgICAgICAgdmFyIHkgPSBwb3Mucm93ICogdGhpcy5saW5lSGVpZ2h0O1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBwYWdlWDogY2FudmFzUG9zLmxlZnQgKyB4IC0gdGhpcy5zY3JvbGxMZWZ0LFxuICAgICAgICAgICAgcGFnZVk6IGNhbnZhc1Bvcy50b3AgKyB5IC0gdGhpcy5zY3JvbGxUb3BcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBGb2N1c2VzIHRoZSBjdXJyZW50IGNvbnRhaW5lci5cbiAgICAqKi9cbiAgICB2aXN1YWxpemVGb2N1cygpIHtcbiAgICAgICAgYWRkQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIFwiYWNlX2ZvY3VzXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIEJsdXJzIHRoZSBjdXJyZW50IGNvbnRhaW5lci5cbiAgICAqKi9cbiAgICB2aXN1YWxpemVCbHVyKCkge1xuICAgICAgICByZW1vdmVDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgXCJhY2VfZm9jdXNcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBzaG93Q29tcG9zaXRpb25cbiAgICAgKiBAcGFyYW0gcG9zaXRpb25cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHNob3dDb21wb3NpdGlvbihwb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSkge1xuICAgICAgICBpZiAoIXRoaXMuJGNvbXBvc2l0aW9uKVxuICAgICAgICAgICAgdGhpcy4kY29tcG9zaXRpb24gPSB7XG4gICAgICAgICAgICAgICAga2VlcFRleHRBcmVhQXRDdXJzb3I6IHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yLFxuICAgICAgICAgICAgICAgIGNzc1RleHQ6IHRoaXMudGV4dGFyZWEuc3R5bGUuY3NzVGV4dFxuICAgICAgICAgICAgfTtcblxuICAgICAgICB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IHRydWU7XG4gICAgICAgIGFkZENzc0NsYXNzKHRoaXMudGV4dGFyZWEsIFwiYWNlX2NvbXBvc2l0aW9uXCIpO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLmNzc1RleHQgPSBcIlwiO1xuICAgICAgICB0aGlzLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IEEgc3RyaW5nIG9mIHRleHQgdG8gdXNlXG4gICAgICpcbiAgICAgKiBTZXRzIHRoZSBpbm5lciB0ZXh0IG9mIHRoZSBjdXJyZW50IGNvbXBvc2l0aW9uIHRvIGB0ZXh0YC5cbiAgICAgKi9cbiAgICBzZXRDb21wb3NpdGlvblRleHQodGV4dD86IHN0cmluZyk6IHZvaWQge1xuICAgICAgICAvLyBUT0RPOiBXaHkgaXMgdGhlIHBhcmFtZXRlciBub3QgdXNlZD9cbiAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBIaWRlcyB0aGUgY3VycmVudCBjb21wb3NpdGlvbi5cbiAgICAgKi9cbiAgICBoaWRlQ29tcG9zaXRpb24oKSB7XG4gICAgICAgIGlmICghdGhpcy4kY29tcG9zaXRpb24pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlbW92ZUNzc0NsYXNzKHRoaXMudGV4dGFyZWEsIFwiYWNlX2NvbXBvc2l0aW9uXCIpO1xuICAgICAgICB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IHRoaXMuJGNvbXBvc2l0aW9uLmtlZXBUZXh0QXJlYUF0Q3Vyc29yO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLmNzc1RleHQgPSB0aGlzLiRjb21wb3NpdGlvbi5jc3NUZXh0O1xuICAgICAgICB0aGlzLiRjb21wb3NpdGlvbiA9IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBhIG5ldyB0aGVtZSBmb3IgdGhlIGVkaXRvci5cbiAgICAgKiBgdGhlbWVgIHNob3VsZCBleGlzdCwgYW5kIGJlIGEgZGlyZWN0b3J5IHBhdGgsIGxpa2UgYGFjZS90aGVtZS90ZXh0bWF0ZWAuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFRoZW1lXG4gICAgICogQHBhcmFtIHRoZW1lIHtTdHJpbmd9IHRoZW1lIFRoZSBwYXRoIHRvIGEgdGhlbWVcbiAgICAgKiBAcGFyYW0gdGhlbWUge0Z1bmN0aW9ufSBjYiBvcHRpb25hbCBjYWxsYmFja1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0VGhlbWUodGhlbWU6IGFueSwgY2I/OiAoKSA9PiBhbnkpOiB2b2lkIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJWaXJ0dWFsUmVuZGVyZXIgc2V0VGhlbWUsIHRoZW1lID0gXCIgKyB0aGVtZSlcbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy4kdGhlbWVJZCA9IHRoZW1lO1xuICAgICAgICBfc2VsZi5fZGlzcGF0Y2hFdmVudCgndGhlbWVDaGFuZ2UnLCB7IHRoZW1lOiB0aGVtZSB9KTtcblxuICAgICAgICBpZiAoIXRoZW1lIHx8IHR5cGVvZiB0aGVtZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgdmFyIG1vZHVsZU5hbWUgPSB0aGVtZSB8fCB0aGlzLmdldE9wdGlvbihcInRoZW1lXCIpLmluaXRpYWxWYWx1ZTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwibW9kdWxlTmFtZSA9PiBcIiArIG1vZHVsZU5hbWUpO1xuICAgICAgICAgICAgLy8gTG9hZGluZyBhIHRoZW1lIHdpbGwgaW5zZXJ0IGEgc2NyaXB0IHRoYXQsIHVwb24gZXhlY3V0aW9uLCB3aWxsXG4gICAgICAgICAgICAvLyBpbnNlcnQgYSBzdHlsZSB0YWcuXG4gICAgICAgICAgICBsb2FkTW9kdWxlKFtcInRoZW1lXCIsIG1vZHVsZU5hbWVdLCBhZnRlckxvYWQsIHRoaXMuY29udGFpbmVyLm93bmVyRG9jdW1lbnQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgYWZ0ZXJMb2FkKHRoZW1lKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGFmdGVyTG9hZChtb2RKczogeyBjc3NUZXh0OiBzdHJpbmc7IGNzc0NsYXNzOiBzdHJpbmc7IGlzRGFyazogYm9vbGVhbjsgcGFkZGluZzogbnVtYmVyIH0pIHtcblxuICAgICAgICAgICAgaWYgKF9zZWxmLiR0aGVtZUlkICE9PSB0aGVtZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYiAmJiBjYigpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIW1vZEpzLmNzc0NsYXNzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpbXBvcnRDc3NTdHJpbmcobW9kSnMuY3NzVGV4dCwgbW9kSnMuY3NzQ2xhc3MsIF9zZWxmLmNvbnRhaW5lci5vd25lckRvY3VtZW50KTtcblxuICAgICAgICAgICAgaWYgKF9zZWxmLnRoZW1lKSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlQ3NzQ2xhc3MoX3NlbGYuY29udGFpbmVyLCBfc2VsZi50aGVtZS5jc3NDbGFzcyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBwYWRkaW5nID0gXCJwYWRkaW5nXCIgaW4gbW9kSnMgPyBtb2RKcy5wYWRkaW5nIDogXCJwYWRkaW5nXCIgaW4gKF9zZWxmLnRoZW1lIHx8IHt9KSA/IDQgOiBfc2VsZi4kcGFkZGluZztcblxuICAgICAgICAgICAgaWYgKF9zZWxmLiRwYWRkaW5nICYmIHBhZGRpbmcgIT0gX3NlbGYuJHBhZGRpbmcpIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBfc2VsZi50aGVtZSA9IG1vZEpzO1xuICAgICAgICAgICAgYWRkQ3NzQ2xhc3MoX3NlbGYuY29udGFpbmVyLCBtb2RKcy5jc3NDbGFzcyk7XG4gICAgICAgICAgICBzZXRDc3NDbGFzcyhfc2VsZi5jb250YWluZXIsIFwiYWNlX2RhcmtcIiwgbW9kSnMuaXNEYXJrKTtcblxuICAgICAgICAgICAgLy8gZm9yY2UgcmUtbWVhc3VyZSBvZiB0aGUgZ3V0dGVyIHdpZHRoXG4gICAgICAgICAgICBpZiAoX3NlbGYuJHNpemUpIHtcbiAgICAgICAgICAgICAgICBfc2VsZi4kc2l6ZS53aWR0aCA9IDA7XG4gICAgICAgICAgICAgICAgX3NlbGYuJHVwZGF0ZVNpemVBc3luYygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBfc2VsZi5fZGlzcGF0Y2hFdmVudCgndGhlbWVMb2FkZWQnLCB7IHRoZW1lOiBtb2RKcyB9KTtcbiAgICAgICAgICAgIGNiICYmIGNiKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBwYXRoIG9mIHRoZSBjdXJyZW50IHRoZW1lLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRUaGVtZVxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICBnZXRUaGVtZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy4kdGhlbWVJZDtcbiAgICB9XG5cbiAgICAvLyBNZXRob2RzIGFsbG93cyB0byBhZGQgLyByZW1vdmUgQ1NTIGNsYXNzbmFtZXMgdG8gdGhlIGVkaXRvciBlbGVtZW50LlxuICAgIC8vIFRoaXMgZmVhdHVyZSBjYW4gYmUgdXNlZCBieSBwbHVnLWlucyB0byBwcm92aWRlIGEgdmlzdWFsIGluZGljYXRpb24gb2ZcbiAgICAvLyBhIGNlcnRhaW4gbW9kZSB0aGF0IGVkaXRvciBpcyBpbi5cblxuICAgIC8qKlxuICAgICAqIFtBZGRzIGEgbmV3IGNsYXNzLCBgc3R5bGVgLCB0byB0aGUgZWRpdG9yLl17OiAjVmlydHVhbFJlbmRlcmVyLnNldFN0eWxlfVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHlsZSBBIGNsYXNzIG5hbWVcbiAgICAgKlxuICAgICAqL1xuICAgIHNldFN0eWxlKHN0eWxlOiBzdHJpbmcsIGluY2x1ZGU/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHNldENzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBzdHlsZSwgaW5jbHVkZSAhPT0gZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFtSZW1vdmVzIHRoZSBjbGFzcyBgc3R5bGVgIGZyb20gdGhlIGVkaXRvci5dezogI1ZpcnR1YWxSZW5kZXJlci51bnNldFN0eWxlfVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHlsZSBBIGNsYXNzIG5hbWVcbiAgICAgKi9cbiAgICB1bnNldFN0eWxlKHN0eWxlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgcmVtb3ZlQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIHN0eWxlKTtcbiAgICB9XG5cbiAgICBzZXRDdXJzb3JTdHlsZShzdHlsZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLmNvbnRlbnQuc3R5bGUuY3Vyc29yICE9IHN0eWxlKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUuY3Vyc29yID0gc3R5bGU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gY3Vyc29yU3R5bGUgQSBjc3MgY3Vyc29yIHN0eWxlXG4gICAgICovXG4gICAgc2V0TW91c2VDdXJzb3IoY3Vyc29yU3R5bGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUuY3Vyc29yID0gY3Vyc29yU3R5bGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGVzdHJveXMgdGhlIHRleHQgYW5kIGN1cnNvciBsYXllcnMgZm9yIHRoaXMgcmVuZGVyZXIuXG4gICAgICovXG4gICAgZGVzdHJveSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuZGVzdHJveSgpO1xuICAgIH1cbn1cblxuZGVmaW5lT3B0aW9ucyhWaXJ0dWFsUmVuZGVyZXIucHJvdG90eXBlLCBcInJlbmRlcmVyXCIsIHtcbiAgICBhbmltYXRlZFNjcm9sbDogeyBpbml0aWFsVmFsdWU6IGZhbHNlIH0sXG4gICAgc2hvd0ludmlzaWJsZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllci5zZXRTaG93SW52aXNpYmxlcyh2YWx1ZSkpXG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9URVhUKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgc2hvd1ByaW50TWFyZ2luOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oKSB7IHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7IH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgcHJpbnRNYXJnaW5Db2x1bW46IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbigpIHsgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiA4MFxuICAgIH0sXG4gICAgcHJpbnRNYXJnaW46IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsID09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICAgICAgdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW4gPSB2YWw7XG4gICAgICAgICAgICB0aGlzLiRzaG93UHJpbnRNYXJnaW4gPSAhIXZhbDtcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kc2hvd1ByaW50TWFyZ2luICYmIHRoaXMuJHByaW50TWFyZ2luQ29sdW1uO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBzaG93R3V0dGVyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykge1xuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyLnN0eWxlLmRpc3BsYXkgPSBzaG93ID8gXCJibG9ja1wiIDogXCJub25lXCI7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX0ZVTEwpO1xuICAgICAgICAgICAgdGhpcy5vbkd1dHRlclJlc2l6ZSgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGZhZGVGb2xkV2lkZ2V0czoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3cpIHtcbiAgICAgICAgICAgIHNldENzc0NsYXNzKHRoaXMuJGd1dHRlciwgXCJhY2VfZmFkZS1mb2xkLXdpZGdldHNcIiwgc2hvdyk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIHNob3dGb2xkV2lkZ2V0czoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3cpIHsgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0U2hvd0ZvbGRXaWRnZXRzKHNob3cpIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgc2hvd0xpbmVOdW1iZXJzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykge1xuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0U2hvd0xpbmVOdW1iZXJzKHNob3cpO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9HVVRURVIpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGRpc3BsYXlJbmRlbnRHdWlkZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG93KSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyLnNldERpc3BsYXlJbmRlbnRHdWlkZXMoc2hvdykpXG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9URVhUKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBoaWdobGlnaHRHdXR0ZXJMaW5lOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdWxkSGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0ID0gY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0LmNsYXNzTmFtZSA9IFwiYWNlX2d1dHRlci1hY3RpdmUtbGluZVwiO1xuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlci5hcHBlbmRDaGlsZCh0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0KTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuc3R5bGUuZGlzcGxheSA9IHNob3VsZEhpZ2hsaWdodCA/IFwiXCIgOiBcIm5vbmVcIjtcbiAgICAgICAgICAgIC8vIGlmIGN1cnNvcmxheWVyIGhhdmUgbmV2ZXIgYmVlbiB1cGRhdGVkIHRoZXJlJ3Mgbm90aGluZyBvbiBzY3JlZW4gdG8gdXBkYXRlXG4gICAgICAgICAgICBpZiAodGhpcy4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zKVxuICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQoKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZSxcbiAgICAgICAgdmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuJGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIHx8ICF0aGlzLiRob3JpelNjcm9sbClcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX1NDUk9MTCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuJHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIHx8ICF0aGlzLiR2U2Nyb2xsKVxuICAgICAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgZm9udFNpemU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihmb250U2l6ZTogc3RyaW5nKSB7XG4gICAgICAgICAgICB2YXIgdGhhdDogVmlydHVhbFJlbmRlcmVyID0gdGhpcztcbiAgICAgICAgICAgIHRoYXQuY29udGFpbmVyLnN0eWxlLmZvbnRTaXplID0gZm9udFNpemU7XG4gICAgICAgICAgICB0aGF0LnVwZGF0ZUZvbnRTaXplKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogXCIxMnB4XCJcbiAgICB9LFxuICAgIGZvbnRGYW1pbHk6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihmb250RmFtaWx5OiBzdHJpbmcpIHtcbiAgICAgICAgICAgIHZhciB0aGF0OiBWaXJ0dWFsUmVuZGVyZXIgPSB0aGlzO1xuICAgICAgICAgICAgdGhhdC5jb250YWluZXIuc3R5bGUuZm9udEZhbWlseSA9IGZvbnRGYW1pbHk7XG4gICAgICAgICAgICB0aGF0LnVwZGF0ZUZvbnRTaXplKCk7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIG1heExpbmVzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUZ1bGwoKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgbWluTGluZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlRnVsbCgpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBzY3JvbGxQYXN0RW5kOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB2YWwgPSArdmFsIHx8IDA7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2Nyb2xsUGFzdEVuZCA9PSB2YWwpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdGhpcy4kc2Nyb2xsUGFzdEVuZCA9IHZhbDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiAwLFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICBmaXhlZFdpZHRoR3V0dGVyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci4kZml4ZWRXaWR0aCA9ICEhdmFsO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9HVVRURVIpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICB0aGVtZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLnNldFRoZW1lKHZhbCkgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuJHRoZW1lSWQgfHwgdGhpcy50aGVtZTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcIi4vdGhlbWUvdGV4dG1hdGVcIixcbiAgICAgICAgaGFuZGxlc1NldDogdHJ1ZVxuICAgIH1cbn0pO1xuIl19