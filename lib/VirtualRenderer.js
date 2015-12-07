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
export default class VirtualRenderer extends EventEmitterClass {
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
        console.log("VirtualRenderer constructor()");
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
        console.log("VirtualRenderer setTheme, theme = " + theme);
        var _self = this;
        this.$themeId = theme;
        _self._dispatchEvent('themeChange', { theme: theme });
        if (!theme || typeof theme === "string") {
            var moduleName = theme || this.$options.theme.initialValue;
            console.log("moduleName => " + moduleName);
            loadModule(["theme", moduleName], afterLoad, this.container.ownerDocument);
        }
        else {
            afterLoad(theme);
        }
        function afterLoad(module) {
            if (_self.$themeId !== theme) {
                return cb && cb();
            }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlydHVhbFJlbmRlcmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1ZpcnR1YWxSZW5kZXJlci50cyJdLCJuYW1lcyI6WyJWaXJ0dWFsUmVuZGVyZXIiLCJWaXJ0dWFsUmVuZGVyZXIuY29uc3RydWN0b3IiLCJWaXJ0dWFsUmVuZGVyZXIubWF4TGluZXMiLCJWaXJ0dWFsUmVuZGVyZXIua2VlcFRleHRBcmVhQXRDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0RGVmYXVsdEN1cnNvclN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEN1cnNvckxheWVyT2ZmIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUNoYXJhY3RlclNpemUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2Vzc2lvbiIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVMaW5lcyIsIlZpcnR1YWxSZW5kZXJlci5vbkNoYW5nZU5ld0xpbmVNb2RlIiwiVmlydHVhbFJlbmRlcmVyLm9uQ2hhbmdlVGFiU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVUZXh0IiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUZ1bGwiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlRm9udFNpemUiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNpemVBc3luYyIsIlZpcnR1YWxSZW5kZXJlci5vblJlc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci4kdXBkYXRlQ2FjaGVkU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5vbkd1dHRlclJlc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5hZGp1c3RXcmFwTGltaXQiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0QW5pbWF0ZWRTY3JvbGwiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0QW5pbWF0ZWRTY3JvbGwiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2hvd0ludmlzaWJsZXMiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2hvd0ludmlzaWJsZXMiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0RGlzcGxheUluZGVudEd1aWRlcyIsIlZpcnR1YWxSZW5kZXJlci5zZXREaXNwbGF5SW5kZW50R3VpZGVzIiwiVmlydHVhbFJlbmRlcmVyLnNldFNob3dQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRTaG93UHJpbnRNYXJnaW4iLCJWaXJ0dWFsUmVuZGVyZXIuc2V0UHJpbnRNYXJnaW5Db2x1bW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0UHJpbnRNYXJnaW5Db2x1bW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2hvd0d1dHRlciIsIlZpcnR1YWxSZW5kZXJlci5zZXRTaG93R3V0dGVyIiwiVmlydHVhbFJlbmRlcmVyLmdldEZhZGVGb2xkV2lkZ2V0cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRGYWRlRm9sZFdpZGdldHMiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0SGlnaGxpZ2h0R3V0dGVyTGluZSIsIlZpcnR1YWxSZW5kZXJlci5nZXRIaWdobGlnaHRHdXR0ZXJMaW5lIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0IiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRDb250YWluZXJFbGVtZW50IiwiVmlydHVhbFJlbmRlcmVyLmdldE1vdXNlRXZlbnRUYXJnZXQiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0VGV4dEFyZWFDb250YWluZXIiLCJWaXJ0dWFsUmVuZGVyZXIuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLmdldEZpcnN0VmlzaWJsZVJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRGaXJzdEZ1bGx5VmlzaWJsZVJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRMYXN0RnVsbHlWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLnNldFBhZGRpbmciLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2Nyb2xsTWFyZ2luIiwiVmlydHVhbFJlbmRlcmVyLmdldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLmdldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLnNldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVTY3JvbGxCYXJWIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVTY3JvbGxCYXJIIiwiVmlydHVhbFJlbmRlcmVyLmZyZWV6ZSIsIlZpcnR1YWxSZW5kZXJlci51bmZyZWV6ZSIsIlZpcnR1YWxSZW5kZXJlci4kcmVuZGVyQ2hhbmdlcyIsIlZpcnR1YWxSZW5kZXJlci4kYXV0b3NpemUiLCJWaXJ0dWFsUmVuZGVyZXIuJGNvbXB1dGVMYXllckNvbmZpZyIsIlZpcnR1YWxSZW5kZXJlci4kdXBkYXRlTGluZXMiLCJWaXJ0dWFsUmVuZGVyZXIuJGdldExvbmdlc3RMaW5lIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUZyb250TWFya2VycyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVCYWNrTWFya2VycyIsIlZpcnR1YWxSZW5kZXJlci5hZGRHdXR0ZXJEZWNvcmF0aW9uIiwiVmlydHVhbFJlbmRlcmVyLnJlbW92ZUd1dHRlckRlY29yYXRpb24iLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlQnJlYWtwb2ludHMiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0QW5ub3RhdGlvbnMiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLmhpZGVDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuc2hvd0N1cnNvciIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxTZWxlY3Rpb25JbnRvVmlldyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldyIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxUb3AiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2Nyb2xsTGVmdCIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxUb3BSb3ciLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2Nyb2xsQm90dG9tUm93IiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvUm93IiwiVmlydHVhbFJlbmRlcmVyLmFsaWduQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLiRjYWxjU3RlcHMiLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9MaW5lIiwiVmlydHVhbFJlbmRlcmVyLmFuaW1hdGVTY3JvbGxpbmciLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9ZIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvWCIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUbyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxCeSIsIlZpcnR1YWxSZW5kZXJlci5pc1Njcm9sbGFibGVCeSIsIlZpcnR1YWxSZW5kZXJlci5waXhlbFRvU2NyZWVuQ29vcmRpbmF0ZXMiLCJWaXJ0dWFsUmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXMiLCJWaXJ0dWFsUmVuZGVyZXIudGV4dFRvU2NyZWVuQ29vcmRpbmF0ZXMiLCJWaXJ0dWFsUmVuZGVyZXIudmlzdWFsaXplRm9jdXMiLCJWaXJ0dWFsUmVuZGVyZXIudmlzdWFsaXplQmx1ciIsIlZpcnR1YWxSZW5kZXJlci5zaG93Q29tcG9zaXRpb24iLCJWaXJ0dWFsUmVuZGVyZXIuc2V0Q29tcG9zaXRpb25UZXh0IiwiVmlydHVhbFJlbmRlcmVyLmhpZGVDb21wb3NpdGlvbiIsIlZpcnR1YWxSZW5kZXJlci5zZXRUaGVtZSIsIlZpcnR1YWxSZW5kZXJlci5zZXRUaGVtZS5hZnRlckxvYWQiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0VGhlbWUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U3R5bGUiLCJWaXJ0dWFsUmVuZGVyZXIudW5zZXRTdHlsZSIsIlZpcnR1YWxSZW5kZXJlci5zZXRDdXJzb3JTdHlsZSIsIlZpcnR1YWxSZW5kZXJlci5zZXRNb3VzZUN1cnNvciIsIlZpcnR1YWxSZW5kZXJlci5kZXN0cm95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Q0E7UUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO1lBQ1JBLE1BQU1BLEdBQUdBLEVBQUVBLENBQUNBLFlBQVlBLElBQUlBLEVBQUVBLENBQUNBLFlBQVlBLENBQUNBO1FBQ2hEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNQQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxXQUFXQSxJQUFJQSxFQUFFQSxDQUFDQSxXQUFXQSxDQUFDQTtRQUM3Q0EsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxLQUFLQSxFQUFFQSxXQUFXQSxFQUFFQSxLQUFLQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUd4RUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDbERBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBO1FBRTdCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNOQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUV0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDTkEsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLElBQUlBO1lBQ0FBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBRWpEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQTtZQUNkQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUMxQkEsQ0FBQ0E7SUFFRGYsaUJBQWlCQSxDQUFDQSxLQUFLQSxFQUFFQSxXQUFXQSxFQUFFQSxLQUFLQSxFQUFFQSxNQUFNQTtRQUMvQ2dCLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBQ25DQSxJQUFJQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNoQkEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDdEJBLElBQUlBLE9BQU9BLEdBQUdBO1lBQ1ZBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBO1lBQ2pCQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxNQUFNQTtZQUNuQkEsY0FBY0EsRUFBRUEsSUFBSUEsQ0FBQ0EsY0FBY0E7WUFDbkNBLGFBQWFBLEVBQUVBLElBQUlBLENBQUNBLGFBQWFBO1NBQ3BDQSxDQUFDQTtRQUNGQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3Q0EsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7WUFDckJBLE9BQU9BLElBQUlBLFdBQVdBLENBQUNBO1lBRXZCQSxJQUFJQSxDQUFDQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7Z0JBQ2xCQSxJQUFJQSxDQUFDQSxjQUFjQSxJQUFJQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUVsREEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFFckVBLE9BQU9BLEdBQUdBLE9BQU9BLEdBQUdBLGFBQWFBLENBQUNBO1FBQ3RDQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQ0EsT0FBT0EsSUFBSUEsV0FBV0EsQ0FBQ0E7WUFDdkJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBO1lBRW5CQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxJQUFJQSxJQUFJQSxDQUFDQTtnQkFDcEJBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFdBQVdBLEdBQUdBLENBQUNBLENBQUNBO1lBRWxFQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxXQUFXQSxDQUFDQTtZQUUvQkEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUE7Z0JBQzlCQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxHQUFHQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUNsREEsSUFBSUEsQ0FBQ0EsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsV0FBV0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFFOUVBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBO2dCQUMvQkEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDN0RBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLElBQUlB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O1FBQ3hDQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxFQUNyREEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsY0FBY0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFM0ZBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLEVBQ2pGQSxXQUFXQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUV0RkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDM0RBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLE1BQU1BLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3BGQSxJQUFJQSxPQUFPQSxHQUFHQSxRQUFRQSxHQUFHQSxTQUFTQSxDQUFDQTtRQUduQ0EsSUFBSUEsY0FBY0EsRUFBRUEsY0FBY0EsQ0FBQ0E7UUFDbkNBLElBQUlBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBQ2pDQSxRQUFRQSxHQUFHQSxPQUFPQSxDQUFDQSxtQkFBbUJBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBSXBEQSxJQUFJQSxRQUFRQSxHQUFHQSxPQUFPQSxDQUFDQSxXQUFXQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUM3Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDbENBLENBQUNBO1FBRURBLGNBQWNBLEdBQUdBLE9BQU9BLENBQUNBLG1CQUFtQkEsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDMURBLGNBQWNBLEdBQUdBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLFVBQVVBLENBQUNBO1FBRTdEQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxtQkFBbUJBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLE9BQU9BLENBQUNBLFNBQVNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQ3JGQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxHQUFHQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxVQUFVQTtZQUN4RUEsY0FBY0EsQ0FBQ0E7UUFFbkJBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLGNBQWNBLEdBQUdBLFVBQVVBLENBQUNBO1FBRXREQSxJQUFJQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNoQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsSUFBSUEsV0FBV0EsQ0FBQ0E7WUFDdENBLE9BQU9BLEdBQUdBLGVBQWVBLENBQUNBO1FBRzlCQSxFQUFFQSxDQUFDQSxDQUFDQSxjQUFjQSxJQUFJQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxXQUFXQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNsRkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsNEJBQTRCQSxDQUFDQSxDQUFDQTtZQUMzQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsY0FBY0EsQ0FBQ0E7Z0JBQ2ZBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLEVBQUVBLENBQUNBO1FBQzdDQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQTtZQUNmQSxLQUFLQSxFQUFFQSxXQUFXQTtZQUNsQkEsT0FBT0EsRUFBRUEsSUFBSUEsQ0FBQ0EsUUFBUUE7WUFDdEJBLFFBQVFBLEVBQUVBLFFBQVFBO1lBQ2xCQSxjQUFjQSxFQUFFQSxjQUFjQTtZQUM5QkEsT0FBT0EsRUFBRUEsT0FBT0E7WUFDaEJBLFVBQVVBLEVBQUVBLFVBQVVBO1lBQ3RCQSxjQUFjQSxFQUFFQSxJQUFJQSxDQUFDQSxjQUFjQTtZQUNuQ0EsU0FBU0EsRUFBRUEsU0FBU0E7WUFDcEJBLFNBQVNBLEVBQUVBLFNBQVNBO1lBQ3BCQSxNQUFNQSxFQUFFQSxNQUFNQTtZQUNkQSxZQUFZQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQTtZQUMvRkEsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0E7U0FDcENBLENBQUNBO1FBRUZBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBO0lBQ25CQSxDQUFDQTtJQUVEekQsWUFBWUE7UUFDUjBELElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLFFBQVFBLENBQUNBO1FBQzNDQSxJQUFJQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUN6Q0EsSUFBSUEsQ0FBQ0EsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFFMUJBLElBQUlBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBO1FBRW5DQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxHQUFHQSxXQUFXQSxDQUFDQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUFDQSxNQUFNQSxDQUFDQTtRQUFDQSxDQUFDQTtRQUNuREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsR0FBR0EsV0FBV0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFBQ0EsTUFBTUEsQ0FBQ0E7UUFBQ0EsQ0FBQ0E7UUFHL0NBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQTtnQkFDakJBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLE1BQU1BLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1lBQzFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtZQUNwQ0EsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFHREEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsV0FBV0EsRUFBRUEsUUFBUUEsRUFBRUEsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDNURBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUVEMUQsZUFBZUE7UUFDWDJELElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO1FBQzlDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxjQUFjQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQTtZQUNsREEsU0FBU0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFbkJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO0lBQy9HQSxDQUFDQTtJQU1EM0Qsa0JBQWtCQTtRQUNkNEQsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNURBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0E7SUFDN0NBLENBQUNBO0lBTUQ1RCxpQkFBaUJBO1FBQ2I2RCxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM1REEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtJQUM1Q0EsQ0FBQ0E7SUFPTzdELG1CQUFtQkEsQ0FBQ0EsR0FBR0EsRUFBRUEsU0FBU0E7UUFDdEM4RCxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxtQkFBbUJBLENBQUNBLEdBQUdBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO0lBQzFEQSxDQUFDQTtJQU1POUQsc0JBQXNCQSxDQUFDQSxHQUFHQSxFQUFFQSxTQUFTQTtRQUN6QytELElBQUlBLENBQUNBLFlBQVlBLENBQUNBLHNCQUFzQkEsQ0FBQ0EsR0FBR0EsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7SUFDN0RBLENBQUNBO0lBTUQvRCxpQkFBaUJBO1FBQ2JnRSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtJQUN2Q0EsQ0FBQ0E7SUFTRGhFLGNBQWNBLENBQUNBLFdBQVdBO1FBQ3RCaUUsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDOUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO0lBQ3ZDQSxDQUFDQTtJQU1EakUsWUFBWUE7UUFDUmtFLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO0lBQ3ZDQSxDQUFDQTtJQU1EbEUsVUFBVUE7UUFDTm1FLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO0lBQ25DQSxDQUFDQTtJQU1EbkUsVUFBVUE7UUFDTm9FLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO0lBQ25DQSxDQUFDQTtJQUVEcEUsdUJBQXVCQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQSxFQUFFQSxNQUFPQTtRQUV6Q3FFLElBQUlBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDMUNBLElBQUlBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsSUFBSUEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7SUFDNUNBLENBQUNBO0lBTURyRSxvQkFBb0JBLENBQUNBLE1BQU9BLEVBQUVBLE1BQU9BLEVBQUVBLFdBQVlBO1FBRS9Dc0UsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDaENBLE1BQU1BLENBQUNBO1FBRVhBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFckRBLElBQUlBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBO1FBQ3BCQSxJQUFJQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUVsQkEsSUFBSUEsU0FBU0EsR0FBR0EsV0FBV0EsSUFBSUEsV0FBV0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDcERBLElBQUlBLFlBQVlBLEdBQUdBLFdBQVdBLElBQUlBLFdBQVdBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBO1FBRTFEQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBRXJGQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxHQUFHQSxTQUFTQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ1BBLEdBQUdBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBLENBQUNBO1lBQzlDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDVkEsR0FBR0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDakNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ25DQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxHQUFHQSxZQUFZQSxHQUFHQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ1BBLEdBQUdBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBLENBQUNBO1lBQzlDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQTtRQUNqRkEsQ0FBQ0E7UUFFREEsSUFBSUEsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFFakNBLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxjQUFjQSxDQUFDQTtnQkFDM0RBLElBQUlBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBO1lBQ25DQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNyQ0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsYUFBYUEsR0FBR0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDMUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLENBQUNBO1FBQ2xHQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxJQUFJQSxJQUFJQSxDQUFDQSxRQUFRQSxJQUFJQSxJQUFJQSxHQUFHQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM5RUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDbENBLENBQUNBO0lBQ0xBLENBQUNBO0lBT0R0RSxZQUFZQTtRQUNSdUUsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7SUFDdkNBLENBQUNBO0lBT0R2RSxhQUFhQTtRQUNUd0UsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsYUFBYUEsRUFBRUEsQ0FBQ0E7SUFDeENBLENBQUNBO0lBT0R4RSxlQUFlQTtRQUNYeUUsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7SUFDNUNBLENBQUNBO0lBT0R6RSxrQkFBa0JBO1FBQ2QwRSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUN2R0EsQ0FBQ0E7SUFTRDFFLFdBQVdBLENBQUNBLEdBQVdBO1FBQ25CMkUsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7SUFDckRBLENBQUNBO0lBRUQzRSxXQUFXQSxDQUFDQSxNQUFNQSxFQUFFQSxTQUFTQTtRQUN6QjRFLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLE1BQU1BLElBQUlBLFFBQVFBLENBQUNBO1lBQzFCQSxNQUFNQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUV4Q0EsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNyREEsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFDcERBLElBQUlBLE1BQU1BLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBRTVDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNsQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7SUFDbEJBLENBQUNBO0lBRUQ1RSxVQUFVQSxDQUFDQSxTQUFpQkEsRUFBRUEsT0FBZUE7UUFDekM2RSxJQUFJQSxDQUFDQSxHQUFXQSxDQUFDQSxDQUFDQTtRQUNsQkEsSUFBSUEsQ0FBQ0EsR0FBV0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDM0JBLElBQUlBLEtBQUtBLEdBQWFBLEVBQUVBLENBQUNBO1FBRXpCQSxJQUFJQSxJQUFJQSxHQUFHQSxVQUFTQSxDQUFTQSxFQUFFQSxLQUFhQSxFQUFFQSxFQUFVQTtZQUNwRCxNQUFNLENBQUMsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQztRQUNqRCxDQUFDLENBQUNBO1FBRUZBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQ3JCQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxTQUFTQSxFQUFFQSxPQUFPQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNyRUEsQ0FBQ0E7UUFFREEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDakJBLENBQUNBO0lBU0Q3RSxZQUFZQSxDQUFDQSxJQUFZQSxFQUFFQSxNQUFlQSxFQUFFQSxPQUFnQkEsRUFBRUEsUUFBb0JBO1FBQzlFOEUsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxJQUFJQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUN2RUEsSUFBSUEsTUFBTUEsR0FBR0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDckJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ1RBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzVDQSxDQUFDQTtRQUVEQSxJQUFJQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUNuQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDbENBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEtBQUtBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBLGFBQWFBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO1FBQ25EQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVEOUUsZ0JBQWdCQSxDQUFDQSxTQUFpQkEsRUFBRUEsUUFBU0E7UUFDekMrRSxJQUFJQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUM3QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBQ0RBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO1FBRWpCQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxJQUFJQSxPQUFPQSxDQUFDQTtZQUNyQkEsTUFBTUEsQ0FBQ0E7UUFFWEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4QkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUMzQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xCQSxTQUFTQSxHQUFHQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDeEJBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLElBQUlBLE9BQU9BLENBQUNBO29CQUNyQkEsTUFBTUEsQ0FBQ0E7WUFDZkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsSUFBSUEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsU0FBU0EsRUFBRUEsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDakRBLElBQUlBLENBQUNBLGdCQUFnQkEsR0FBR0EsRUFBRUEsSUFBSUEsRUFBRUEsU0FBU0EsRUFBRUEsRUFBRUEsRUFBRUEsT0FBT0EsRUFBRUEsS0FBS0EsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0E7UUFFdkVBLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRTNCQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUUxQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsR0FBR0EsT0FBT0EsQ0FBQ0E7UUFDbkNBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLFdBQVdBLENBQUNBO1lBQ3RCLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNmLEtBQUssQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO2dCQUMxQyxLQUFLLENBQUMsT0FBTyxDQUFDLFVBQVUsR0FBRyxPQUFPLENBQUM7WUFDdkMsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDekIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQzlCLEtBQUssQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUNwQyxPQUFPLEdBQUcsSUFBSSxDQUFDO1lBQ25CLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFFSixLQUFLLENBQUMsTUFBTSxHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzNDLEtBQUssQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7Z0JBQzlCLFFBQVEsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUMzQixDQUFDO1FBQ0wsQ0FBQyxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUNYQSxDQUFDQTtJQU1EL0UsU0FBU0EsQ0FBQ0EsU0FBaUJBO1FBR3ZCZ0YsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsS0FBS0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDL0JBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLFNBQVNBLENBQUNBO1lBQzNCQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtRQUN2Q0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFNRGhGLFNBQVNBLENBQUNBLFVBQWtCQTtRQUN4QmlGLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLEtBQUtBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pDQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxVQUFVQSxDQUFDQTtZQUM3QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7UUFDekNBLENBQUNBO0lBQ0xBLENBQUNBO0lBT0RqRixRQUFRQSxDQUFDQSxDQUFTQSxFQUFFQSxDQUFTQTtRQUN6QmtGLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzdCQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNsQ0EsQ0FBQ0E7SUFPRGxGLFFBQVFBLENBQUNBLE1BQWNBLEVBQUVBLE1BQWNBO1FBQ25DbUYsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsRUFBRUEsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDMUVBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLEVBQUVBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBO0lBQ2hGQSxDQUFDQTtJQVVEbkYsY0FBY0EsQ0FBQ0EsTUFBY0EsRUFBRUEsTUFBY0E7UUFDekNvRixFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUN2RUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBO2NBQ25FQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUM3REEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBO1lBQ3pFQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNoQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsYUFBYUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsYUFBYUE7Y0FDbkVBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBO1lBQ3hEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFFRHBGLHdCQUF3QkEsQ0FBQ0EsQ0FBU0EsRUFBRUEsQ0FBU0E7UUFDekNxRixJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxxQkFBcUJBLEVBQUVBLENBQUNBO1FBRXREQSxJQUFJQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxTQUFTQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQTtRQUMxRkEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDN0VBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRTdCQSxNQUFNQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxHQUFHQSxFQUFFQSxJQUFJQSxFQUFFQSxNQUFNQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQTtJQUN0RUEsQ0FBQ0E7SUFFRHJGLHVCQUF1QkEsQ0FBQ0EsT0FBZUEsRUFBRUEsT0FBZUE7UUFDcERzRixJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxxQkFBcUJBLEVBQUVBLENBQUNBO1FBRXREQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxTQUFTQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQTtRQUU1R0EsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFFdkVB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YUFBYSxDQUFDLENBQUM7UUFDNUMsQ0FBQztRQUNELFlBQVksRUFBRSxDQUFDO1FBQ2YsVUFBVSxFQUFFLElBQUk7S0FDbkI7SUFDRCxnQkFBZ0IsRUFBRTtRQUNkLEdBQUcsRUFBRSxVQUFTLEdBQUc7WUFDYixJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDO1lBQ3RDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUM1QyxDQUFDO0tBQ0o7SUFDRCxLQUFLLEVBQUU7UUFDSCxHQUFHLEVBQUUsVUFBUyxHQUFHLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQSxDQUFDLENBQUM7UUFDekMsR0FBRyxFQUFFLGNBQWEsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDdkQsWUFBWSxFQUFFLGtCQUFrQjtRQUNoQyxVQUFVLEVBQUUsSUFBSTtLQUNuQjtDQUNKLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXG5pbXBvcnQge2FkZENzc0NsYXNzLCBjcmVhdGVFbGVtZW50LCBpbXBvcnRDc3NTdHJpbmcsIHJlbW92ZUNzc0NsYXNzLCBzZXRDc3NDbGFzc30gZnJvbSBcIi4vbGliL2RvbVwiO1xuaW1wb3J0IHtfZW1pdCwgZGVmaW5lT3B0aW9ucywgbG9hZE1vZHVsZSwgcmVzZXRPcHRpb25zfSBmcm9tIFwiLi9jb25maWdcIjtcbmltcG9ydCB7aXNPbGRJRX0gZnJvbSBcIi4vbGliL3VzZXJhZ2VudFwiO1xuaW1wb3J0IEd1dHRlciBmcm9tIFwiLi9sYXllci9HdXR0ZXJcIjtcbmltcG9ydCBNYXJrZXIgZnJvbSBcIi4vbGF5ZXIvTWFya2VyXCI7XG5pbXBvcnQgVGV4dCBmcm9tIFwiLi9sYXllci9UZXh0XCI7XG5pbXBvcnQgQ3Vyc29yIGZyb20gXCIuL2xheWVyL0N1cnNvclwiO1xuaW1wb3J0IHtIU2Nyb2xsQmFyLCBWU2Nyb2xsQmFyfSBmcm9tIFwiLi9zY3JvbGxiYXJcIjtcbmltcG9ydCBSZW5kZXJMb29wIGZyb20gXCIuL1JlbmRlckxvb3BcIjtcbmltcG9ydCBGb250TWV0cmljcyBmcm9tIFwiLi9sYXllci9Gb250TWV0cmljc1wiO1xuaW1wb3J0IHtFdmVudEVtaXR0ZXJDbGFzc30gZnJvbSBcIi4vbGliL2V2ZW50X2VtaXR0ZXJcIjtcbmltcG9ydCBFZGl0U2Vzc2lvbiBmcm9tICcuL0VkaXRTZXNzaW9uJztcblxuLy8gRklYTUVcbi8vIGltcG9ydCBlZGl0b3JDc3MgPSByZXF1aXJlKFwiLi9yZXF1aXJlanMvdGV4dCEuL2Nzcy9lZGl0b3IuY3NzXCIpO1xuLy8gaW1wb3J0Q3NzU3RyaW5nKGVkaXRvckNzcywgXCJhY2VfZWRpdG9yXCIpO1xuXG52YXIgQ0hBTkdFX0NVUlNPUiA9IDE7XG52YXIgQ0hBTkdFX01BUktFUiA9IDI7XG52YXIgQ0hBTkdFX0dVVFRFUiA9IDQ7XG52YXIgQ0hBTkdFX1NDUk9MTCA9IDg7XG52YXIgQ0hBTkdFX0xJTkVTID0gMTY7XG52YXIgQ0hBTkdFX1RFWFQgPSAzMjtcbnZhciBDSEFOR0VfU0laRSA9IDY0O1xudmFyIENIQU5HRV9NQVJLRVJfQkFDSyA9IDEyODtcbnZhciBDSEFOR0VfTUFSS0VSX0ZST05UID0gMjU2O1xudmFyIENIQU5HRV9GVUxMID0gNTEyO1xudmFyIENIQU5HRV9IX1NDUk9MTCA9IDEwMjQ7XG5cbi8qKlxuICogVGhlIGNsYXNzIHRoYXQgaXMgcmVzcG9uc2libGUgZm9yIGRyYXdpbmcgZXZlcnl0aGluZyB5b3Ugc2VlIG9uIHRoZSBzY3JlZW4hXG4gKiBAcmVsYXRlZCBlZGl0b3IucmVuZGVyZXIgXG4gKiBAY2xhc3MgVmlydHVhbFJlbmRlcmVyXG4gKiovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBWaXJ0dWFsUmVuZGVyZXIgZXh0ZW5kcyBFdmVudEVtaXR0ZXJDbGFzcyB7XG4gICAgcHVibGljIHRleHRhcmVhOiBIVE1MVGV4dEFyZWFFbGVtZW50O1xuICAgIHB1YmxpYyBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuICAgIHB1YmxpYyBzY3JvbGxMZWZ0ID0gMDtcbiAgICBwdWJsaWMgc2Nyb2xsVG9wID0gMDtcbiAgICBwdWJsaWMgbGF5ZXJDb25maWcgPSB7XG4gICAgICAgIHdpZHRoOiAxLFxuICAgICAgICBwYWRkaW5nOiAwLFxuICAgICAgICBmaXJzdFJvdzogMCxcbiAgICAgICAgZmlyc3RSb3dTY3JlZW46IDAsXG4gICAgICAgIGxhc3RSb3c6IDAsXG4gICAgICAgIGxpbmVIZWlnaHQ6IDAsXG4gICAgICAgIGNoYXJhY3RlcldpZHRoOiAwLFxuICAgICAgICBtaW5IZWlnaHQ6IDEsXG4gICAgICAgIG1heEhlaWdodDogMSxcbiAgICAgICAgb2Zmc2V0OiAwLFxuICAgICAgICBoZWlnaHQ6IDEsXG4gICAgICAgIGd1dHRlck9mZnNldDogMVxuICAgIH07XG4gICAgcHVibGljICRtYXhMaW5lczogbnVtYmVyO1xuICAgIHB1YmxpYyAkbWluTGluZXM6IG51bWJlcjtcbiAgICBwdWJsaWMgJGN1cnNvckxheWVyOiBDdXJzb3I7XG4gICAgcHVibGljICRndXR0ZXJMYXllcjogR3V0dGVyO1xuXG4gICAgcHVibGljICRwYWRkaW5nOiBudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgJGZyb3plbiA9IGZhbHNlO1xuXG4gICAgLy8gVGhlIHRoZW1lSWQgaXMgd2hhdCBpcyBjb21tdW5pY2F0ZWQgaW4gdGhlIEFQSS5cbiAgICBwcml2YXRlICR0aGVtZUlkOiBzdHJpbmc7XG4gICAgLy8gV2hhdCBhcmUgdGhlc2U/XG4gICAgcHJpdmF0ZSB0aGVtZTtcbiAgICBwcml2YXRlICR0aGVtZTtcblxuICAgIHByaXZhdGUgJG9wdGlvbnM7XG4gICAgcHJpdmF0ZSAkdGltZXI7XG4gICAgcHJpdmF0ZSBTVEVQUyA9IDg7XG4gICAgcHVibGljICRrZWVwVGV4dEFyZWFBdEN1cnNvcjogYm9vbGVhbjtcbiAgICBwdWJsaWMgJGd1dHRlcjtcbiAgICBwdWJsaWMgc2Nyb2xsZXI7XG4gICAgcHVibGljIGNvbnRlbnQ6IEhUTUxEaXZFbGVtZW50O1xuICAgIHB1YmxpYyAkdGV4dExheWVyOiBUZXh0O1xuICAgIHByaXZhdGUgJG1hcmtlckZyb250OiBNYXJrZXI7XG4gICAgcHJpdmF0ZSAkbWFya2VyQmFjazogTWFya2VyO1xuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MRGl2RWxlbWVudDtcbiAgICBwcml2YXRlICRob3JpelNjcm9sbDogYm9vbGVhbjtcbiAgICBwcml2YXRlICR2U2Nyb2xsO1xuICAgIHB1YmxpYyBzY3JvbGxCYXJIOiBIU2Nyb2xsQmFyO1xuICAgIHB1YmxpYyBzY3JvbGxCYXJWOiBWU2Nyb2xsQmFyO1xuICAgIHByaXZhdGUgJHNjcm9sbEFuaW1hdGlvbjogeyBmcm9tOiBudW1iZXI7IHRvOiBudW1iZXI7IHN0ZXBzOiBudW1iZXJbXSB9O1xuICAgIHByaXZhdGUgc2Vzc2lvbjogRWRpdFNlc3Npb247XG4gICAgcHJpdmF0ZSBzY3JvbGxNYXJnaW4gPSB7XG4gICAgICAgIGxlZnQ6IDAsXG4gICAgICAgIHJpZ2h0OiAwLFxuICAgICAgICB0b3A6IDAsXG4gICAgICAgIGJvdHRvbTogMCxcbiAgICAgICAgdjogMCxcbiAgICAgICAgaDogMFxuICAgIH07XG5cbiAgICBwcml2YXRlICRmb250TWV0cmljcztcbiAgICBwcml2YXRlICRhbGxvd0JvbGRGb250cztcbiAgICBwcml2YXRlIGN1cnNvclBvcztcbiAgICBwdWJsaWMgJHNpemU7XG4gICAgcHJpdmF0ZSAkbG9vcDtcbiAgICBwcml2YXRlICRjaGFuZ2VkTGluZXM7XG4gICAgcHJpdmF0ZSAkY2hhbmdlcyA9IDA7XG4gICAgcHJpdmF0ZSByZXNpemluZztcbiAgICBwcml2YXRlICRndXR0ZXJMaW5lSGlnaGxpZ2h0O1xuICAgIHByaXZhdGUgZ3V0dGVyV2lkdGg7XG4gICAgcHJpdmF0ZSAkZ3V0dGVyV2lkdGg7XG4gICAgcHJpdmF0ZSAkc2hvd1ByaW50TWFyZ2luO1xuICAgIHByaXZhdGUgJHByaW50TWFyZ2luRWw7XG4gICAgcHJpdmF0ZSBnZXRPcHRpb247XG4gICAgcHJpdmF0ZSBzZXRPcHRpb247XG4gICAgcHJpdmF0ZSBjaGFyYWN0ZXJXaWR0aDtcbiAgICBwcml2YXRlICRwcmludE1hcmdpbkNvbHVtbjtcbiAgICBwcml2YXRlIGxpbmVIZWlnaHQ7XG4gICAgcHJpdmF0ZSAkZXh0cmFIZWlnaHQ7XG4gICAgcHJpdmF0ZSAkY29tcG9zaXRpb246IHsga2VlcFRleHRBcmVhQXRDdXJzb3I6IGJvb2xlYW47IGNzc1RleHQ6IHN0cmluZyB9O1xuICAgIHByaXZhdGUgJGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIHByaXZhdGUgJHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIHByaXZhdGUgJHNob3dHdXR0ZXI7XG4gICAgcHJpdmF0ZSBzaG93SW52aXNpYmxlcztcbiAgICBwcml2YXRlICRhbmltYXRlZFNjcm9sbDtcbiAgICBwcml2YXRlICRzY3JvbGxQYXN0RW5kO1xuICAgIHByaXZhdGUgJGhpZ2hsaWdodEd1dHRlckxpbmU7XG4gICAgcHJpdmF0ZSBkZXNpcmVkSGVpZ2h0O1xuICAgIC8qKlxuICAgICAqIENvbnN0cnVjdHMgYSBuZXcgYFZpcnR1YWxSZW5kZXJlcmAgd2l0aGluIHRoZSBgY29udGFpbmVyYCBzcGVjaWZpZWQsIGFwcGx5aW5nIHRoZSBnaXZlbiBgdGhlbWVgLlxuICAgICAqIEBjbGFzcyBWaXJ0dWFsUmVuZGVyZXJcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKiBAcGFyYW0gY29udGFpbmVyIHtET01FbGVtZW50fSBUaGUgcm9vdCBlbGVtZW50IG9mIHRoZSBlZGl0b3JcbiAgICAgKiBAcGFyYW0gW3RoZW1lXSB7c3RyaW5nfSBUaGUgc3RhcnRpbmcgdGhlbWVcbiAgICAgKi9cbiAgICBjb25zdHJ1Y3Rvcihjb250YWluZXI6IEhUTUxFbGVtZW50LCB0aGVtZT86IHN0cmluZykge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICBjb25zb2xlLmxvZyhcIlZpcnR1YWxSZW5kZXJlciBjb25zdHJ1Y3RvcigpXCIpXG5cbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcblxuICAgICAgICB0aGlzLmNvbnRhaW5lciA9IGNvbnRhaW5lciB8fCA8SFRNTERpdkVsZW1lbnQ+Y3JlYXRlRWxlbWVudChcImRpdlwiKTtcblxuICAgICAgICAvLyBUT0RPOiB0aGlzIGJyZWFrcyByZW5kZXJpbmcgaW4gQ2xvdWQ5IHdpdGggbXVsdGlwbGUgYWNlIGluc3RhbmNlc1xuICAgICAgICAvLyAvLyBJbXBvcnRzIENTUyBvbmNlIHBlciBET00gZG9jdW1lbnQgKCdhY2VfZWRpdG9yJyBzZXJ2ZXMgYXMgYW4gaWRlbnRpZmllcikuXG4gICAgICAgIC8vIGltcG9ydENzc1N0cmluZyhlZGl0b3JDc3MsIFwiYWNlX2VkaXRvclwiLCBjb250YWluZXIub3duZXJEb2N1bWVudCk7XG5cbiAgICAgICAgLy8gaW4gSUUgPD0gOSB0aGUgbmF0aXZlIGN1cnNvciBhbHdheXMgc2hpbmVzIHRocm91Z2hcbiAgICAgICAgdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSAhaXNPbGRJRTtcblxuICAgICAgICBhZGRDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgXCJhY2VfZWRpdG9yXCIpO1xuXG4gICAgICAgIHRoaXMuc2V0VGhlbWUodGhlbWUpO1xuXG4gICAgICAgIHRoaXMuJGd1dHRlciA9IGNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRoaXMuJGd1dHRlci5jbGFzc05hbWUgPSBcImFjZV9ndXR0ZXJcIjtcbiAgICAgICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy4kZ3V0dGVyKTtcblxuICAgICAgICB0aGlzLnNjcm9sbGVyID0gY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGhpcy5zY3JvbGxlci5jbGFzc05hbWUgPSBcImFjZV9zY3JvbGxlclwiO1xuICAgICAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLnNjcm9sbGVyKTtcblxuICAgICAgICB0aGlzLmNvbnRlbnQgPSA8SFRNTERpdkVsZW1lbnQ+Y3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGhpcy5jb250ZW50LmNsYXNzTmFtZSA9IFwiYWNlX2NvbnRlbnRcIjtcbiAgICAgICAgdGhpcy5zY3JvbGxlci5hcHBlbmRDaGlsZCh0aGlzLmNvbnRlbnQpO1xuXG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyID0gbmV3IEd1dHRlcih0aGlzLiRndXR0ZXIpO1xuICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5vbihcImNoYW5nZUd1dHRlcldpZHRoXCIsIHRoaXMub25HdXR0ZXJSZXNpemUuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy4kbWFya2VyQmFjayA9IG5ldyBNYXJrZXIodGhpcy5jb250ZW50KTtcblxuICAgICAgICB2YXIgdGV4dExheWVyID0gdGhpcy4kdGV4dExheWVyID0gbmV3IFRleHQodGhpcy5jb250ZW50KTtcbiAgICAgICAgdGhpcy5jYW52YXMgPSB0ZXh0TGF5ZXIuZWxlbWVudDtcblxuICAgICAgICB0aGlzLiRtYXJrZXJGcm9udCA9IG5ldyBNYXJrZXIodGhpcy5jb250ZW50KTtcblxuICAgICAgICB0aGlzLiRjdXJzb3JMYXllciA9IG5ldyBDdXJzb3IodGhpcy5jb250ZW50KTtcblxuICAgICAgICAvLyBJbmRpY2F0ZXMgd2hldGhlciB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIgaXMgdmlzaWJsZVxuICAgICAgICB0aGlzLiRob3JpelNjcm9sbCA9IGZhbHNlO1xuICAgICAgICB0aGlzLiR2U2Nyb2xsID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5zY3JvbGxCYXJWID0gbmV3IFZTY3JvbGxCYXIodGhpcy5jb250YWluZXIsIHRoaXMpO1xuICAgICAgICB0aGlzLnNjcm9sbEJhckggPSBuZXcgSFNjcm9sbEJhcih0aGlzLmNvbnRhaW5lciwgdGhpcyk7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5hZGRFdmVudExpc3RlbmVyKFwic2Nyb2xsXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIGlmICghX3NlbGYuJHNjcm9sbEFuaW1hdGlvbikge1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsVG9wKGUuZGF0YSAtIF9zZWxmLnNjcm9sbE1hcmdpbi50b3ApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJILmFkZEV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgaWYgKCFfc2VsZi4kc2Nyb2xsQW5pbWF0aW9uKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KGUuZGF0YSAtIF9zZWxmLnNjcm9sbE1hcmdpbi5sZWZ0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5jdXJzb3JQb3MgPSB7XG4gICAgICAgICAgICByb3c6IDAsXG4gICAgICAgICAgICBjb2x1bW46IDBcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLiRmb250TWV0cmljcyA9IG5ldyBGb250TWV0cmljcyh0aGlzLmNvbnRhaW5lciwgNTAwKTtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLiRzZXRGb250TWV0cmljcyh0aGlzLiRmb250TWV0cmljcyk7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlQ2hhcmFjdGVyU2l6ZVwiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBfc2VsZi51cGRhdGVDaGFyYWN0ZXJTaXplKCk7XG4gICAgICAgICAgICBfc2VsZi5vblJlc2l6ZSh0cnVlLCBfc2VsZi5ndXR0ZXJXaWR0aCwgX3NlbGYuJHNpemUud2lkdGgsIF9zZWxmLiRzaXplLmhlaWdodCk7XG4gICAgICAgICAgICBfc2VsZi5fc2lnbmFsKFwiY2hhbmdlQ2hhcmFjdGVyU2l6ZVwiLCBlKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy4kc2l6ZSA9IHtcbiAgICAgICAgICAgIHdpZHRoOiAwLFxuICAgICAgICAgICAgaGVpZ2h0OiAwLFxuICAgICAgICAgICAgc2Nyb2xsZXJIZWlnaHQ6IDAsXG4gICAgICAgICAgICBzY3JvbGxlcldpZHRoOiAwLFxuICAgICAgICAgICAgJGRpcnR5OiB0cnVlXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy4kbG9vcCA9IG5ldyBSZW5kZXJMb29wKFxuICAgICAgICAgICAgdGhpcy4kcmVuZGVyQ2hhbmdlcy5iaW5kKHRoaXMpLFxuICAgICAgICAgICAgdGhpcy5jb250YWluZXIub3duZXJEb2N1bWVudC5kZWZhdWx0Vmlld1xuICAgICAgICApO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcblxuICAgICAgICB0aGlzLnVwZGF0ZUNoYXJhY3RlclNpemUoKTtcbiAgICAgICAgdGhpcy5zZXRQYWRkaW5nKDQpO1xuICAgICAgICByZXNldE9wdGlvbnModGhpcyk7XG4gICAgICAgIF9lbWl0KFwicmVuZGVyZXJcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgc2V0IG1heExpbmVzKG1heExpbmVzOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy4kbWF4TGluZXMgPSBtYXhMaW5lcztcbiAgICB9XG5cbiAgICBzZXQga2VlcFRleHRBcmVhQXRDdXJzb3Ioa2VlcFRleHRBcmVhQXRDdXJzb3I6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSBrZWVwVGV4dEFyZWFBdEN1cnNvcjtcbiAgICB9XG5cbiAgICBzZXREZWZhdWx0Q3Vyc29yU3R5bGUoKSB7XG4gICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgPSBcImRlZmF1bHRcIjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBOb3Qgc3VyZSB3aGF0IHRoZSBjb3JyZWN0IHNlbWFudGljcyBzaG91bGQgYmUgZm9yIHRoaXMuXG4gICAgICovXG4gICAgc2V0Q3Vyc29yTGF5ZXJPZmYoKSB7XG4gICAgICAgIHZhciBub29wID0gZnVuY3Rpb24oKSB7IH07XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnJlc3RhcnRUaW1lciA9IG5vb3A7XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLmVsZW1lbnQuc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xuICAgIH1cblxuICAgIHVwZGF0ZUNoYXJhY3RlclNpemUoKSB7XG4gICAgICAgIC8vIEZJWE1FOiBER0ggYWxsb3dCb2xGb250cyBkb2VzIG5vdCBleGlzdCBvbiBUZXh0XG4gICAgICAgIGlmICh0aGlzLiR0ZXh0TGF5ZXJbJ2FsbG93Qm9sZEZvbnRzJ10gIT0gdGhpcy4kYWxsb3dCb2xkRm9udHMpIHtcbiAgICAgICAgICAgIHRoaXMuJGFsbG93Qm9sZEZvbnRzID0gdGhpcy4kdGV4dExheWVyWydhbGxvd0JvbGRGb250cyddO1xuICAgICAgICAgICAgdGhpcy5zZXRTdHlsZShcImFjZV9ub2JvbGRcIiwgIXRoaXMuJGFsbG93Qm9sZEZvbnRzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubGF5ZXJDb25maWcuY2hhcmFjdGVyV2lkdGggPSB0aGlzLmNoYXJhY3RlcldpZHRoID0gdGhpcy4kdGV4dExheWVyLmdldENoYXJhY3RlcldpZHRoKCk7XG4gICAgICAgIHRoaXMubGF5ZXJDb25maWcubGluZUhlaWdodCA9IHRoaXMubGluZUhlaWdodCA9IHRoaXMuJHRleHRMYXllci5nZXRMaW5lSGVpZ2h0KCk7XG4gICAgICAgIHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogQXNzb2NpYXRlcyB0aGUgcmVuZGVyZXIgd2l0aCBhbiBbW0VkaXRTZXNzaW9uIGBFZGl0U2Vzc2lvbmBdXS5cbiAgICAqKi9cbiAgICBzZXRTZXNzaW9uKHNlc3Npb24pIHtcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbilcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5kb2Mub2ZmKFwiY2hhbmdlTmV3TGluZU1vZGVcIiwgdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlKTtcblxuICAgICAgICB0aGlzLnNlc3Npb24gPSBzZXNzaW9uO1xuICAgICAgICBpZiAoIXNlc3Npb24pXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKHRoaXMuc2Nyb2xsTWFyZ2luLnRvcCAmJiBzZXNzaW9uLmdldFNjcm9sbFRvcCgpIDw9IDApXG4gICAgICAgICAgICBzZXNzaW9uLnNldFNjcm9sbFRvcCgtdGhpcy5zY3JvbGxNYXJnaW4udG9wKTtcblxuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5zZXRTZXNzaW9uKHNlc3Npb24pO1xuICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJG1hcmtlckZyb250LnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci5zZXRTZXNzaW9uKHNlc3Npb24pO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLiRzZXRGb250TWV0cmljcyh0aGlzLiRmb250TWV0cmljcyk7XG5cbiAgICAgICAgdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlID0gdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMub25DaGFuZ2VOZXdMaW5lTW9kZSgpXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5kb2Mub24oXCJjaGFuZ2VOZXdMaW5lTW9kZVwiLCB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogVHJpZ2dlcnMgYSBwYXJ0aWFsIHVwZGF0ZSBvZiB0aGUgdGV4dCwgZnJvbSB0aGUgcmFuZ2UgZ2l2ZW4gYnkgdGhlIHR3byBwYXJhbWV0ZXJzLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBmaXJzdCByb3cgdG8gdXBkYXRlXG4gICAgKiBAcGFyYW0ge051bWJlcn0gbGFzdFJvdyBUaGUgbGFzdCByb3cgdG8gdXBkYXRlXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICB1cGRhdGVMaW5lcyhmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIsIGZvcmNlPzogYm9vbGVhbikge1xuICAgICAgICBpZiAobGFzdFJvdyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBsYXN0Um93ID0gSW5maW5pdHk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuJGNoYW5nZWRMaW5lcykge1xuICAgICAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzID0geyBmaXJzdFJvdzogZmlyc3RSb3csIGxhc3RSb3c6IGxhc3RSb3cgfTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiRjaGFuZ2VkTGluZXMuZmlyc3RSb3cgPiBmaXJzdFJvdykge1xuICAgICAgICAgICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcy5maXJzdFJvdyA9IGZpcnN0Um93O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3cgPCBsYXN0Um93KSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3cgPSBsYXN0Um93O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgdGhlIGNoYW5nZSBoYXBwZW5lZCBvZmZzY3JlZW4gYWJvdmUgdXMgdGhlbiBpdCdzIHBvc3NpYmxlXG4gICAgICAgIC8vIHRoYXQgYSBuZXcgbGluZSB3cmFwIHdpbGwgYWZmZWN0IHRoZSBwb3NpdGlvbiBvZiB0aGUgbGluZXMgb24gb3VyXG4gICAgICAgIC8vIHNjcmVlbiBzbyB0aGV5IG5lZWQgcmVkcmF3bi5cbiAgICAgICAgLy8gVE9ETzogYmV0dGVyIHNvbHV0aW9uIGlzIHRvIG5vdCBjaGFuZ2Ugc2Nyb2xsIHBvc2l0aW9uIHdoZW4gdGV4dCBpcyBjaGFuZ2VkIG91dHNpZGUgb2YgdmlzaWJsZSBhcmVhXG4gICAgICAgIGlmICh0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdyA8IHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3cpIHtcbiAgICAgICAgICAgIGlmIChmb3JjZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93ID0gdGhpcy5sYXllckNvbmZpZy5sYXN0Um93O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuJGNoYW5nZWRMaW5lcy5maXJzdFJvdyA+IHRoaXMubGF5ZXJDb25maWcubGFzdFJvdykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0xJTkVTKTtcbiAgICB9XG5cbiAgICBvbkNoYW5nZU5ld0xpbmVNb2RlKCkge1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9URVhUKTtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLiR1cGRhdGVFb2xDaGFyKCk7XG4gICAgfVxuXG4gICAgb25DaGFuZ2VUYWJTaXplKCkge1xuICAgICAgICBpZiAodGhpcy4kbG9vcCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJGxvb3Auc2NoZWR1bGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9URVhUIHwgQ0hBTkdFX01BUktFUik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyLm9uQ2hhbmdlVGFiU2l6ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci5vbkNoYW5nZVRhYlNpemUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEknbSBub3Qgc3VyZSB3aHkgd2UgY2FuIG5vdyBlbmQgdXAgaGVyZS5cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogVHJpZ2dlcnMgYSBmdWxsIHVwZGF0ZSBvZiB0aGUgdGV4dCwgZm9yIGFsbCB0aGUgcm93cy5cbiAgICAqKi9cbiAgICB1cGRhdGVUZXh0KCkge1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9URVhUKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFRyaWdnZXJzIGEgZnVsbCB1cGRhdGUgb2YgYWxsIHRoZSBsYXllcnMsIGZvciBhbGwgdGhlIHJvd3MuXG4gICAgKiBAcGFyYW0ge0Jvb2xlYW59IGZvcmNlIElmIGB0cnVlYCwgZm9yY2VzIHRoZSBjaGFuZ2VzIHRocm91Z2hcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHVwZGF0ZUZ1bGwoZm9yY2U/KSB7XG4gICAgICAgIGlmIChmb3JjZSlcbiAgICAgICAgICAgIHRoaXMuJHJlbmRlckNoYW5nZXMoQ0hBTkdFX0ZVTEwsIHRydWUpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBVcGRhdGVzIHRoZSBmb250IHNpemUuXG4gICAgKiovXG4gICAgdXBkYXRlRm9udFNpemUoKSB7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci5jaGVja0ZvclNpemVDaGFuZ2VzKCk7XG4gICAgfVxuXG4gICAgJHVwZGF0ZVNpemVBc3luYygpIHtcbiAgICAgICAgaWYgKHRoaXMuJGxvb3AucGVuZGluZylcbiAgICAgICAgICAgIHRoaXMuJHNpemUuJGRpcnR5ID0gdHJ1ZTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy5vblJlc2l6ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogW1RyaWdnZXJzIGEgcmVzaXplIG9mIHRoZSBlZGl0b3IuXXs6ICNWaXJ0dWFsUmVuZGVyZXIub25SZXNpemV9XG4gICAgKiBAcGFyYW0ge0Jvb2xlYW59IGZvcmNlIElmIGB0cnVlYCwgcmVjb21wdXRlcyB0aGUgc2l6ZSwgZXZlbiBpZiB0aGUgaGVpZ2h0IGFuZCB3aWR0aCBoYXZlbid0IGNoYW5nZWRcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBndXR0ZXJXaWR0aCBUaGUgd2lkdGggb2YgdGhlIGd1dHRlciBpbiBwaXhlbHNcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSB3aWR0aCBUaGUgd2lkdGggb2YgdGhlIGVkaXRvciBpbiBwaXhlbHNcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBoZWlnaHQgVGhlIGhpZWhndCBvZiB0aGUgZWRpdG9yLCBpbiBwaXhlbHNcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIG9uUmVzaXplKGZvcmNlPzogYm9vbGVhbiwgZ3V0dGVyV2lkdGg/OiBudW1iZXIsIHdpZHRoPzogbnVtYmVyLCBoZWlnaHQ/OiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHRoaXMucmVzaXppbmcgPiAyKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBlbHNlIGlmICh0aGlzLnJlc2l6aW5nID4gMClcbiAgICAgICAgICAgIHRoaXMucmVzaXppbmcrKztcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy5yZXNpemluZyA9IGZvcmNlID8gMSA6IDA7XG4gICAgICAgIC8vIGB8fCBlbC5zY3JvbGxIZWlnaHRgIGlzIHJlcXVpcmVkIGZvciBvdXRvc2l6aW5nIGVkaXRvcnMgb24gaWVcbiAgICAgICAgLy8gd2hlcmUgZWxlbWVudHMgd2l0aCBjbGllbnRIZWlnaHQgPSAwIGFsc29lIGhhdmUgY2xpZW50V2lkdGggPSAwXG4gICAgICAgIHZhciBlbCA9IHRoaXMuY29udGFpbmVyO1xuICAgICAgICBpZiAoIWhlaWdodClcbiAgICAgICAgICAgIGhlaWdodCA9IGVsLmNsaWVudEhlaWdodCB8fCBlbC5zY3JvbGxIZWlnaHQ7XG4gICAgICAgIGlmICghd2lkdGgpXG4gICAgICAgICAgICB3aWR0aCA9IGVsLmNsaWVudFdpZHRoIHx8IGVsLnNjcm9sbFdpZHRoO1xuICAgICAgICB2YXIgY2hhbmdlcyA9IHRoaXMuJHVwZGF0ZUNhY2hlZFNpemUoZm9yY2UsIGd1dHRlcldpZHRoLCB3aWR0aCwgaGVpZ2h0KTtcblxuXG4gICAgICAgIGlmICghdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCB8fCAoIXdpZHRoICYmICFoZWlnaHQpKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucmVzaXppbmcgPSAwO1xuXG4gICAgICAgIGlmIChmb3JjZSlcbiAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLiRwYWRkaW5nID0gbnVsbDtcblxuICAgICAgICBpZiAoZm9yY2UpXG4gICAgICAgICAgICB0aGlzLiRyZW5kZXJDaGFuZ2VzKGNoYW5nZXMgfCB0aGlzLiRjaGFuZ2VzLCB0cnVlKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShjaGFuZ2VzIHwgdGhpcy4kY2hhbmdlcyk7XG5cbiAgICAgICAgaWYgKHRoaXMucmVzaXppbmcpXG4gICAgICAgICAgICB0aGlzLnJlc2l6aW5nID0gMDtcbiAgICB9XG5cbiAgICAkdXBkYXRlQ2FjaGVkU2l6ZShmb3JjZSwgZ3V0dGVyV2lkdGgsIHdpZHRoLCBoZWlnaHQpIHtcbiAgICAgICAgaGVpZ2h0IC09ICh0aGlzLiRleHRyYUhlaWdodCB8fCAwKTtcbiAgICAgICAgdmFyIGNoYW5nZXMgPSAwO1xuICAgICAgICB2YXIgc2l6ZSA9IHRoaXMuJHNpemU7XG4gICAgICAgIHZhciBvbGRTaXplID0ge1xuICAgICAgICAgICAgd2lkdGg6IHNpemUud2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQ6IHNpemUuaGVpZ2h0LFxuICAgICAgICAgICAgc2Nyb2xsZXJIZWlnaHQ6IHNpemUuc2Nyb2xsZXJIZWlnaHQsXG4gICAgICAgICAgICBzY3JvbGxlcldpZHRoOiBzaXplLnNjcm9sbGVyV2lkdGhcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKGhlaWdodCAmJiAoZm9yY2UgfHwgc2l6ZS5oZWlnaHQgIT0gaGVpZ2h0KSkge1xuICAgICAgICAgICAgc2l6ZS5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgICAgICBjaGFuZ2VzIHw9IENIQU5HRV9TSVpFO1xuXG4gICAgICAgICAgICBzaXplLnNjcm9sbGVySGVpZ2h0ID0gc2l6ZS5oZWlnaHQ7XG4gICAgICAgICAgICBpZiAodGhpcy4kaG9yaXpTY3JvbGwpXG4gICAgICAgICAgICAgICAgc2l6ZS5zY3JvbGxlckhlaWdodCAtPSB0aGlzLnNjcm9sbEJhckguaGVpZ2h0O1xuXG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhclYuZWxlbWVudC5zdHlsZS5ib3R0b20gPSB0aGlzLnNjcm9sbEJhckguaGVpZ2h0ICsgXCJweFwiO1xuXG4gICAgICAgICAgICBjaGFuZ2VzID0gY2hhbmdlcyB8IENIQU5HRV9TQ1JPTEw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAod2lkdGggJiYgKGZvcmNlIHx8IHNpemUud2lkdGggIT0gd2lkdGgpKSB7XG4gICAgICAgICAgICBjaGFuZ2VzIHw9IENIQU5HRV9TSVpFO1xuICAgICAgICAgICAgc2l6ZS53aWR0aCA9IHdpZHRoO1xuXG4gICAgICAgICAgICBpZiAoZ3V0dGVyV2lkdGggPT0gbnVsbClcbiAgICAgICAgICAgICAgICBndXR0ZXJXaWR0aCA9IHRoaXMuJHNob3dHdXR0ZXIgPyB0aGlzLiRndXR0ZXIub2Zmc2V0V2lkdGggOiAwO1xuXG4gICAgICAgICAgICB0aGlzLmd1dHRlcldpZHRoID0gZ3V0dGVyV2lkdGg7XG5cbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFySC5lbGVtZW50LnN0eWxlLmxlZnQgPVxuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsZXIuc3R5bGUubGVmdCA9IGd1dHRlcldpZHRoICsgXCJweFwiO1xuICAgICAgICAgICAgc2l6ZS5zY3JvbGxlcldpZHRoID0gTWF0aC5tYXgoMCwgd2lkdGggLSBndXR0ZXJXaWR0aCAtIHRoaXMuc2Nyb2xsQmFyVi53aWR0aCk7XG5cbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFySC5lbGVtZW50LnN0eWxlLnJpZ2h0ID1cbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbGVyLnN0eWxlLnJpZ2h0ID0gdGhpcy5zY3JvbGxCYXJWLndpZHRoICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxlci5zdHlsZS5ib3R0b20gPSB0aGlzLnNjcm9sbEJhckguaGVpZ2h0ICsgXCJweFwiO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5zZXNzaW9uICYmIHRoaXMuc2Vzc2lvbi5nZXRVc2VXcmFwTW9kZSgpICYmIHRoaXMuYWRqdXN0V3JhcExpbWl0KCkgfHwgZm9yY2UpXG4gICAgICAgICAgICAgICAgY2hhbmdlcyB8PSBDSEFOR0VfRlVMTDtcbiAgICAgICAgfVxuXG4gICAgICAgIHNpemUuJGRpcnR5ID0gIXdpZHRoIHx8ICFoZWlnaHQ7XG5cbiAgICAgICAgaWYgKGNoYW5nZXMpXG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJyZXNpemVcIiwgb2xkU2l6ZSk7XG5cbiAgICAgICAgcmV0dXJuIGNoYW5nZXM7XG4gICAgfVxuXG4gICAgb25HdXR0ZXJSZXNpemUoKSB7XG4gICAgICAgIHZhciBndXR0ZXJXaWR0aCA9IHRoaXMuJHNob3dHdXR0ZXIgPyB0aGlzLiRndXR0ZXIub2Zmc2V0V2lkdGggOiAwO1xuICAgICAgICBpZiAoZ3V0dGVyV2lkdGggIT0gdGhpcy5ndXR0ZXJXaWR0aClcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZXMgfD0gdGhpcy4kdXBkYXRlQ2FjaGVkU2l6ZSh0cnVlLCBndXR0ZXJXaWR0aCwgdGhpcy4kc2l6ZS53aWR0aCwgdGhpcy4kc2l6ZS5oZWlnaHQpO1xuXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKSAmJiB0aGlzLmFkanVzdFdyYXBMaW1pdCgpKSB7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLiRzaXplLiRkaXJ0eSkge1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiRjb21wdXRlTGF5ZXJDb25maWcoKTtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX01BUktFUik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEFkanVzdHMgdGhlIHdyYXAgbGltaXQsIHdoaWNoIGlzIHRoZSBudW1iZXIgb2YgY2hhcmFjdGVycyB0aGF0IGNhbiBmaXQgd2l0aGluIHRoZSB3aWR0aCBvZiB0aGUgZWRpdCBhcmVhIG9uIHNjcmVlbi5cbiAgICAqKi9cbiAgICBhZGp1c3RXcmFwTGltaXQoKSB7XG4gICAgICAgIHZhciBhdmFpbGFibGVXaWR0aCA9IHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCAtIHRoaXMuJHBhZGRpbmcgKiAyO1xuICAgICAgICB2YXIgbGltaXQgPSBNYXRoLmZsb29yKGF2YWlsYWJsZVdpZHRoIC8gdGhpcy5jaGFyYWN0ZXJXaWR0aCk7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uYWRqdXN0V3JhcExpbWl0KGxpbWl0LCB0aGlzLiRzaG93UHJpbnRNYXJnaW4gJiYgdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIGhhdmUgYW4gYW5pbWF0ZWQgc2Nyb2xsIG9yIG5vdC5cbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvdWxkQW5pbWF0ZSBTZXQgdG8gYHRydWVgIHRvIHNob3cgYW5pbWF0ZWQgc2Nyb2xsc1xuICAgICpcbiAgICAqKi9cbiAgICBzZXRBbmltYXRlZFNjcm9sbChzaG91bGRBbmltYXRlKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiYW5pbWF0ZWRTY3JvbGxcIiwgc2hvdWxkQW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHdoZXRoZXIgYW4gYW5pbWF0ZWQgc2Nyb2xsIGhhcHBlbnMgb3Igbm90LlxuICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgKiovXG4gICAgZ2V0QW5pbWF0ZWRTY3JvbGwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRhbmltYXRlZFNjcm9sbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyBpbnZpc2libGUgY2hhcmFjdGVycyBvciBub3QuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93SW52aXNpYmxlcyBTZXQgdG8gYHRydWVgIHRvIHNob3cgaW52aXNpYmxlc1xuICAgICAqL1xuICAgIHNldFNob3dJbnZpc2libGVzKHNob3dJbnZpc2libGVzOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwic2hvd0ludmlzaWJsZXNcIiwgc2hvd0ludmlzaWJsZXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciBpbnZpc2libGUgY2hhcmFjdGVycyBhcmUgYmVpbmcgc2hvd24gb3Igbm90LlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqL1xuICAgIGdldFNob3dJbnZpc2libGVzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzaG93SW52aXNpYmxlc1wiKTtcbiAgICB9XG5cbiAgICBnZXREaXNwbGF5SW5kZW50R3VpZGVzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJkaXNwbGF5SW5kZW50R3VpZGVzXCIpO1xuICAgIH1cblxuICAgIHNldERpc3BsYXlJbmRlbnRHdWlkZXMoZGlzcGxheUluZGVudEd1aWRlczogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImRpc3BsYXlJbmRlbnRHdWlkZXNcIiwgZGlzcGxheUluZGVudEd1aWRlcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgdGhlIHByaW50IG1hcmdpbiBvciBub3QuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93UHJpbnRNYXJnaW4gU2V0IHRvIGB0cnVlYCB0byBzaG93IHRoZSBwcmludCBtYXJnaW5cbiAgICAgKlxuICAgICAqL1xuICAgIHNldFNob3dQcmludE1hcmdpbihzaG93UHJpbnRNYXJnaW46IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJzaG93UHJpbnRNYXJnaW5cIiwgc2hvd1ByaW50TWFyZ2luKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHByaW50IG1hcmdpbiBpcyBiZWluZyBzaG93biBvciBub3QuXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd1ByaW50TWFyZ2luKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzaG93UHJpbnRNYXJnaW5cIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgY29sdW1uIGRlZmluaW5nIHdoZXJlIHRoZSBwcmludCBtYXJnaW4gc2hvdWxkIGJlLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBwcmludE1hcmdpbkNvbHVtbiBTcGVjaWZpZXMgdGhlIG5ldyBwcmludCBtYXJnaW5cbiAgICAgKi9cbiAgICBzZXRQcmludE1hcmdpbkNvbHVtbihwcmludE1hcmdpbkNvbHVtbjogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwicHJpbnRNYXJnaW5Db2x1bW5cIiwgcHJpbnRNYXJnaW5Db2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGNvbHVtbiBudW1iZXIgb2Ygd2hlcmUgdGhlIHByaW50IG1hcmdpbiBpcy5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqL1xuICAgIGdldFByaW50TWFyZ2luQ29sdW1uKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInByaW50TWFyZ2luQ29sdW1uXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBndXR0ZXIgaXMgYmVpbmcgc2hvd24uXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd0d1dHRlcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwic2hvd0d1dHRlclwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IHRoZSBndXR0ZXIgb3Igbm90LlxuICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93IFNldCB0byBgdHJ1ZWAgdG8gc2hvdyB0aGUgZ3V0dGVyXG4gICAgKlxuICAgICoqL1xuICAgIHNldFNob3dHdXR0ZXIoc2hvdykge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXRPcHRpb24oXCJzaG93R3V0dGVyXCIsIHNob3cpO1xuICAgIH1cblxuICAgIGdldEZhZGVGb2xkV2lkZ2V0cygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiZmFkZUZvbGRXaWRnZXRzXCIpXG4gICAgfVxuXG4gICAgc2V0RmFkZUZvbGRXaWRnZXRzKHNob3cpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJmYWRlRm9sZFdpZGdldHNcIiwgc2hvdyk7XG4gICAgfVxuXG4gICAgc2V0SGlnaGxpZ2h0R3V0dGVyTGluZShzaG91bGRIaWdobGlnaHQpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJoaWdobGlnaHRHdXR0ZXJMaW5lXCIsIHNob3VsZEhpZ2hsaWdodCk7XG4gICAgfVxuXG4gICAgZ2V0SGlnaGxpZ2h0R3V0dGVyTGluZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiaGlnaGxpZ2h0R3V0dGVyTGluZVwiKTtcbiAgICB9XG5cbiAgICAkdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpIHtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuJGN1cnNvckxheWVyLiRwaXhlbFBvcztcbiAgICAgICAgdmFyIGhlaWdodCA9IHRoaXMubGF5ZXJDb25maWcubGluZUhlaWdodDtcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi5nZXRVc2VXcmFwTW9kZSgpKSB7XG4gICAgICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5zZXNzaW9uLnNlbGVjdGlvbi5nZXRDdXJzb3IoKTtcbiAgICAgICAgICAgIGN1cnNvci5jb2x1bW4gPSAwO1xuICAgICAgICAgICAgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuZ2V0UGl4ZWxQb3NpdGlvbihjdXJzb3IsIHRydWUpO1xuICAgICAgICAgICAgaGVpZ2h0ICo9IHRoaXMuc2Vzc2lvbi5nZXRSb3dMZW5ndGgoY3Vyc29yLnJvdyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodC5zdHlsZS50b3AgPSBwb3MudG9wIC0gdGhpcy5sYXllckNvbmZpZy5vZmZzZXQgKyBcInB4XCI7XG4gICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuc3R5bGUuaGVpZ2h0ID0gaGVpZ2h0ICsgXCJweFwiO1xuICAgIH1cblxuICAgICR1cGRhdGVQcmludE1hcmdpbigpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRzaG93UHJpbnRNYXJnaW4gJiYgIXRoaXMuJHByaW50TWFyZ2luRWwpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKCF0aGlzLiRwcmludE1hcmdpbkVsKSB7XG4gICAgICAgICAgICB2YXIgY29udGFpbmVyRWw6IEhUTUxEaXZFbGVtZW50ID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICBjb250YWluZXJFbC5jbGFzc05hbWUgPSBcImFjZV9sYXllciBhY2VfcHJpbnQtbWFyZ2luLWxheWVyXCI7XG4gICAgICAgICAgICB0aGlzLiRwcmludE1hcmdpbkVsID0gY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIHRoaXMuJHByaW50TWFyZ2luRWwuY2xhc3NOYW1lID0gXCJhY2VfcHJpbnQtbWFyZ2luXCI7XG4gICAgICAgICAgICBjb250YWluZXJFbC5hcHBlbmRDaGlsZCh0aGlzLiRwcmludE1hcmdpbkVsKTtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5pbnNlcnRCZWZvcmUoY29udGFpbmVyRWwsIHRoaXMuY29udGVudC5maXJzdENoaWxkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzdHlsZSA9IHRoaXMuJHByaW50TWFyZ2luRWwuc3R5bGU7XG4gICAgICAgIHN0eWxlLmxlZnQgPSAoKHRoaXMuY2hhcmFjdGVyV2lkdGggKiB0aGlzLiRwcmludE1hcmdpbkNvbHVtbikgKyB0aGlzLiRwYWRkaW5nKSArIFwicHhcIjtcbiAgICAgICAgc3R5bGUudmlzaWJpbGl0eSA9IHRoaXMuJHNob3dQcmludE1hcmdpbiA/IFwidmlzaWJsZVwiIDogXCJoaWRkZW5cIjtcblxuICAgICAgICBpZiAodGhpcy5zZXNzaW9uICYmIHRoaXMuc2Vzc2lvblsnJHdyYXAnXSA9PSAtMSlcbiAgICAgICAgICAgIHRoaXMuYWRqdXN0V3JhcExpbWl0KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgcm9vdCBlbGVtZW50IGNvbnRhaW5pbmcgdGhpcyByZW5kZXJlci5cbiAgICAqIEByZXR1cm5zIHtET01FbGVtZW50fVxuICAgICoqL1xuICAgIGdldENvbnRhaW5lckVsZW1lbnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRhaW5lcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBlbGVtZW50IHRoYXQgdGhlIG1vdXNlIGV2ZW50cyBhcmUgYXR0YWNoZWQgdG9cbiAgICAqIEByZXR1cm5zIHtET01FbGVtZW50fVxuICAgICoqL1xuICAgIGdldE1vdXNlRXZlbnRUYXJnZXQoKTogSFRNTERpdkVsZW1lbnQge1xuICAgICAgICByZXR1cm4gdGhpcy5jb250ZW50O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGVsZW1lbnQgdG8gd2hpY2ggdGhlIGhpZGRlbiB0ZXh0IGFyZWEgaXMgYWRkZWQuXG4gICAgKiBAcmV0dXJucyB7RE9NRWxlbWVudH1cbiAgICAqKi9cbiAgICBnZXRUZXh0QXJlYUNvbnRhaW5lcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGFpbmVyO1xuICAgIH1cblxuICAgIC8vIG1vdmUgdGV4dCBpbnB1dCBvdmVyIHRoZSBjdXJzb3JcbiAgICAvLyB0aGlzIGlzIHJlcXVpcmVkIGZvciBpT1MgYW5kIElNRVxuICAgICRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvcilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIGNvbmZpZyA9IHRoaXMubGF5ZXJDb25maWc7XG4gICAgICAgIHZhciBwb3NUb3AgPSB0aGlzLiRjdXJzb3JMYXllci4kcGl4ZWxQb3MudG9wO1xuICAgICAgICB2YXIgcG9zTGVmdCA9IHRoaXMuJGN1cnNvckxheWVyLiRwaXhlbFBvcy5sZWZ0O1xuICAgICAgICBwb3NUb3AgLT0gY29uZmlnLm9mZnNldDtcblxuICAgICAgICB2YXIgaCA9IHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgaWYgKHBvc1RvcCA8IDAgfHwgcG9zVG9wID4gY29uZmlnLmhlaWdodCAtIGgpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHcgPSB0aGlzLmNoYXJhY3RlcldpZHRoO1xuICAgICAgICBpZiAodGhpcy4kY29tcG9zaXRpb24pIHtcbiAgICAgICAgICAgIHZhciB2YWwgPSB0aGlzLnRleHRhcmVhLnZhbHVlLnJlcGxhY2UoL15cXHgwMSsvLCBcIlwiKTtcbiAgICAgICAgICAgIHcgKj0gKHRoaXMuc2Vzc2lvbi4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgodmFsKVswXSArIDIpO1xuICAgICAgICAgICAgaCArPSAyO1xuICAgICAgICAgICAgcG9zVG9wIC09IDE7XG4gICAgICAgIH1cbiAgICAgICAgcG9zTGVmdCAtPSB0aGlzLnNjcm9sbExlZnQ7XG4gICAgICAgIGlmIChwb3NMZWZ0ID4gdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gdylcbiAgICAgICAgICAgIHBvc0xlZnQgPSB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSB3O1xuXG4gICAgICAgIHBvc0xlZnQgLT0gdGhpcy5zY3JvbGxCYXJWLndpZHRoO1xuXG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuaGVpZ2h0ID0gaCArIFwicHhcIjtcbiAgICAgICAgdGhpcy50ZXh0YXJlYS5zdHlsZS53aWR0aCA9IHcgKyBcInB4XCI7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUucmlnaHQgPSBNYXRoLm1heCgwLCB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSBwb3NMZWZ0IC0gdykgKyBcInB4XCI7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuYm90dG9tID0gTWF0aC5tYXgoMCwgdGhpcy4kc2l6ZS5oZWlnaHQgLSBwb3NUb3AgLSBoKSArIFwicHhcIjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBbUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGZpcnN0IHZpc2libGUgcm93Ll17OiAjVmlydHVhbFJlbmRlcmVyLmdldEZpcnN0VmlzaWJsZVJvd31cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0Rmlyc3RWaXNpYmxlUm93KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdztcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgZmlyc3QgZnVsbHkgdmlzaWJsZSByb3cuIFwiRnVsbHlcIiBoZXJlIG1lYW5zIHRoYXQgdGhlIGNoYXJhY3RlcnMgaW4gdGhlIHJvdyBhcmUgbm90IHRydW5jYXRlZDsgdGhhdCB0aGUgdG9wIGFuZCB0aGUgYm90dG9tIG9mIHRoZSByb3cgYXJlIG9uIHRoZSBzY3JlZW4uXG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldEZpcnN0RnVsbHlWaXNpYmxlUm93KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdyArICh0aGlzLmxheWVyQ29uZmlnLm9mZnNldCA9PT0gMCA/IDAgOiAxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbGFzdCBmdWxseSB2aXNpYmxlIHJvdy4gXCJGdWxseVwiIGhlcmUgbWVhbnMgdGhhdCB0aGUgY2hhcmFjdGVycyBpbiB0aGUgcm93IGFyZSBub3QgdHJ1bmNhdGVkOyB0aGF0IHRoZSB0b3AgYW5kIHRoZSBib3R0b20gb2YgdGhlIHJvdyBhcmUgb24gdGhlIHNjcmVlbi5cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0TGFzdEZ1bGx5VmlzaWJsZVJvdygpIHtcbiAgICAgICAgdmFyIGZsaW50ID0gTWF0aC5mbG9vcigodGhpcy5sYXllckNvbmZpZy5oZWlnaHQgKyB0aGlzLmxheWVyQ29uZmlnLm9mZnNldCkgLyB0aGlzLmxheWVyQ29uZmlnLmxpbmVIZWlnaHQpO1xuICAgICAgICByZXR1cm4gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdyAtIDEgKyBmbGludDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBbUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGxhc3QgdmlzaWJsZSByb3cuXXs6ICNWaXJ0dWFsUmVuZGVyZXIuZ2V0TGFzdFZpc2libGVSb3d9XG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldExhc3RWaXNpYmxlUm93KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sYXllckNvbmZpZy5sYXN0Um93O1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyB0aGUgcGFkZGluZyBmb3IgYWxsIHRoZSBsYXllcnMuXG4gICAgKiBAcGFyYW0ge251bWJlcn0gcGFkZGluZyBBIG5ldyBwYWRkaW5nIHZhbHVlIChpbiBwaXhlbHMpXG4gICAgKiovXG4gICAgc2V0UGFkZGluZyhwYWRkaW5nOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy4kcGFkZGluZyA9IHBhZGRpbmc7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgICAgICB0aGlzLiR1cGRhdGVQcmludE1hcmdpbigpO1xuICAgIH1cblxuICAgIHNldFNjcm9sbE1hcmdpbih0b3AsIGJvdHRvbSwgbGVmdCwgcmlnaHQpIHtcbiAgICAgICAgdmFyIHNtID0gdGhpcy5zY3JvbGxNYXJnaW47XG4gICAgICAgIHNtLnRvcCA9IHRvcCB8IDA7XG4gICAgICAgIHNtLmJvdHRvbSA9IGJvdHRvbSB8IDA7XG4gICAgICAgIHNtLnJpZ2h0ID0gcmlnaHQgfCAwO1xuICAgICAgICBzbS5sZWZ0ID0gbGVmdCB8IDA7XG4gICAgICAgIHNtLnYgPSBzbS50b3AgKyBzbS5ib3R0b207XG4gICAgICAgIHNtLmggPSBzbS5sZWZ0ICsgc20ucmlnaHQ7XG4gICAgICAgIGlmIChzbS50b3AgJiYgdGhpcy5zY3JvbGxUb3AgPD0gMCAmJiB0aGlzLnNlc3Npb24pXG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKC1zbS50b3ApO1xuICAgICAgICB0aGlzLnVwZGF0ZUZ1bGwoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyIGlzIHNldCB0byBiZSBhbHdheXMgdmlzaWJsZS5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgZ2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUoKSB7XG4gICAgICAgIC8vIEZJWE1FXG4gICAgICAgIHJldHVybiB0aGlzLiRoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIgb3Igbm90LlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYWx3YXlzVmlzaWJsZSBTZXQgdG8gYHRydWVgIHRvIG1ha2UgdGhlIGhvcml6b250YWwgc2Nyb2xsIGJhciB2aXNpYmxlXG4gICAgICoqL1xuICAgIHNldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlKGFsd2F5c1Zpc2libGUpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZVwiLCBhbHdheXNWaXNpYmxlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHZlcnRpY2FsIHNjcm9sbGJhciBpcyBzZXQgdG8gYmUgYWx3YXlzIHZpc2libGUuXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kdlNjcm9sbEJhckFsd2F5c1Zpc2libGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgdGhlIHZlcnRpY2FsIHNjcm9sbGJhciBvciBub3QuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbHdheXNWaXNpYmxlIFNldCB0byBgdHJ1ZWAgdG8gbWFrZSB0aGUgdmVydGljYWwgc2Nyb2xsIGJhciB2aXNpYmxlXG4gICAgICovXG4gICAgc2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUoYWx3YXlzVmlzaWJsZSkge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInZTY3JvbGxCYXJBbHdheXNWaXNpYmxlXCIsIGFsd2F5c1Zpc2libGUpO1xuICAgIH1cblxuICAgICR1cGRhdGVTY3JvbGxCYXJWKCkge1xuICAgICAgICB2YXIgc2Nyb2xsSGVpZ2h0ID0gdGhpcy5sYXllckNvbmZpZy5tYXhIZWlnaHQ7XG4gICAgICAgIHZhciBzY3JvbGxlckhlaWdodCA9IHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQ7XG4gICAgICAgIGlmICghdGhpcy4kbWF4TGluZXMgJiYgdGhpcy4kc2Nyb2xsUGFzdEVuZCkge1xuICAgICAgICAgICAgc2Nyb2xsSGVpZ2h0IC09IChzY3JvbGxlckhlaWdodCAtIHRoaXMubGluZUhlaWdodCkgKiB0aGlzLiRzY3JvbGxQYXN0RW5kO1xuICAgICAgICAgICAgaWYgKHRoaXMuc2Nyb2xsVG9wID4gc2Nyb2xsSGVpZ2h0IC0gc2Nyb2xsZXJIZWlnaHQpIHtcbiAgICAgICAgICAgICAgICBzY3JvbGxIZWlnaHQgPSB0aGlzLnNjcm9sbFRvcCArIHNjcm9sbGVySGVpZ2h0O1xuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zY3JvbGxUb3AgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zZXRTY3JvbGxIZWlnaHQoc2Nyb2xsSGVpZ2h0ICsgdGhpcy5zY3JvbGxNYXJnaW4udik7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zZXRTY3JvbGxUb3AodGhpcy5zY3JvbGxUb3AgKyB0aGlzLnNjcm9sbE1hcmdpbi50b3ApO1xuICAgIH1cblxuICAgICR1cGRhdGVTY3JvbGxCYXJIKCkge1xuICAgICAgICB0aGlzLnNjcm9sbEJhckguc2V0U2Nyb2xsV2lkdGgodGhpcy5sYXllckNvbmZpZy53aWR0aCArIDIgKiB0aGlzLiRwYWRkaW5nICsgdGhpcy5zY3JvbGxNYXJnaW4uaCk7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFySC5zZXRTY3JvbGxMZWZ0KHRoaXMuc2Nyb2xsTGVmdCArIHRoaXMuc2Nyb2xsTWFyZ2luLmxlZnQpO1xuICAgIH1cblxuICAgIGZyZWV6ZSgpIHtcbiAgICAgICAgdGhpcy4kZnJvemVuID0gdHJ1ZTtcbiAgICB9XG5cbiAgICB1bmZyZWV6ZSgpIHtcbiAgICAgICAgdGhpcy4kZnJvemVuID0gZmFsc2U7XG4gICAgfVxuXG4gICAgJHJlbmRlckNoYW5nZXMoY2hhbmdlcywgZm9yY2UpIHtcbiAgICAgICAgaWYgKHRoaXMuJGNoYW5nZXMpIHtcbiAgICAgICAgICAgIGNoYW5nZXMgfD0gdGhpcy4kY2hhbmdlcztcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZXMgPSAwO1xuICAgICAgICB9XG4gICAgICAgIGlmICgoIXRoaXMuc2Vzc2lvbiB8fCAhdGhpcy5jb250YWluZXIub2Zmc2V0V2lkdGggfHwgdGhpcy4kZnJvemVuKSB8fCAoIWNoYW5nZXMgJiYgIWZvcmNlKSkge1xuICAgICAgICAgICAgdGhpcy4kY2hhbmdlcyB8PSBjaGFuZ2VzO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLiRzaXplLiRkaXJ0eSkge1xuICAgICAgICAgICAgdGhpcy4kY2hhbmdlcyB8PSBjaGFuZ2VzO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMub25SZXNpemUodHJ1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLmxpbmVIZWlnaHQpIHtcbiAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci5jaGVja0ZvclNpemVDaGFuZ2VzKCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gdGhpcy4kbG9nQ2hhbmdlcyhjaGFuZ2VzKTtcblxuICAgICAgICB0aGlzLl9zaWduYWwoXCJiZWZvcmVSZW5kZXJcIik7XG4gICAgICAgIHZhciBjb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuICAgICAgICAvLyB0ZXh0LCBzY3JvbGxpbmcgYW5kIHJlc2l6ZSBjaGFuZ2VzIGNhbiBjYXVzZSB0aGUgdmlldyBwb3J0IHNpemUgdG8gY2hhbmdlXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0ZVTEwgfHxcbiAgICAgICAgICAgIGNoYW5nZXMgJiBDSEFOR0VfU0laRSB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9URVhUIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX0xJTkVTIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX1NDUk9MTCB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9IX1NDUk9MTFxuICAgICAgICApIHtcbiAgICAgICAgICAgIGNoYW5nZXMgfD0gdGhpcy4kY29tcHV0ZUxheWVyQ29uZmlnKCk7XG4gICAgICAgICAgICAvLyBJZiBhIGNoYW5nZSBpcyBtYWRlIG9mZnNjcmVlbiBhbmQgd3JhcE1vZGUgaXMgb24sIHRoZW4gdGhlIG9uc2NyZWVuXG4gICAgICAgICAgICAvLyBsaW5lcyBtYXkgaGF2ZSBiZWVuIHB1c2hlZCBkb3duLiBJZiBzbywgdGhlIGZpcnN0IHNjcmVlbiByb3cgd2lsbCBub3RcbiAgICAgICAgICAgIC8vIGhhdmUgY2hhbmdlZCwgYnV0IHRoZSBmaXJzdCBhY3R1YWwgcm93IHdpbGwuIEluIHRoYXQgY2FzZSwgYWRqdXN0IFxuICAgICAgICAgICAgLy8gc2Nyb2xsVG9wIHNvIHRoYXQgdGhlIGN1cnNvciBhbmQgb25zY3JlZW4gY29udGVudCBzdGF5cyBpbiB0aGUgc2FtZSBwbGFjZS5cbiAgICAgICAgICAgIGlmIChjb25maWcuZmlyc3RSb3cgIT0gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdyAmJiBjb25maWcuZmlyc3RSb3dTY3JlZW4gPT0gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvd1NjcmVlbikge1xuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsVG9wID0gdGhpcy5zY3JvbGxUb3AgKyAoY29uZmlnLmZpcnN0Um93IC0gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdykgKiB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgICAgICAgICAgY2hhbmdlcyA9IGNoYW5nZXMgfCBDSEFOR0VfU0NST0xMO1xuICAgICAgICAgICAgICAgIGNoYW5nZXMgfD0gdGhpcy4kY29tcHV0ZUxheWVyQ29uZmlnKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuICAgICAgICAgICAgLy8gdXBkYXRlIHNjcm9sbGJhciBmaXJzdCB0byBub3QgbG9zZSBzY3JvbGwgcG9zaXRpb24gd2hlbiBndXR0ZXIgY2FsbHMgcmVzaXplXG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVTY3JvbGxCYXJWKCk7XG4gICAgICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9IX1NDUk9MTClcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVTY3JvbGxCYXJIKCk7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5lbGVtZW50LnN0eWxlLm1hcmdpblRvcCA9ICgtY29uZmlnLm9mZnNldCkgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUubWFyZ2luVG9wID0gKC1jb25maWcub2Zmc2V0KSArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS53aWR0aCA9IGNvbmZpZy53aWR0aCArIDIgKiB0aGlzLiRwYWRkaW5nICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLmhlaWdodCA9IGNvbmZpZy5taW5IZWlnaHQgKyBcInB4XCI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBob3Jpem9udGFsIHNjcm9sbGluZ1xuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9IX1NDUk9MTCkge1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLm1hcmdpbkxlZnQgPSAtdGhpcy5zY3JvbGxMZWZ0ICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxlci5jbGFzc05hbWUgPSB0aGlzLnNjcm9sbExlZnQgPD0gMCA/IFwiYWNlX3Njcm9sbGVyXCIgOiBcImFjZV9zY3JvbGxlciBhY2Vfc2Nyb2xsLWxlZnRcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGZ1bGxcbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfRlVMTCkge1xuICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRjdXJzb3JMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgICAgICAgICB0aGlzLiRoaWdobGlnaHRHdXR0ZXJMaW5lICYmIHRoaXMuJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQoKTtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImFmdGVyUmVuZGVyXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gc2Nyb2xsaW5nXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX1NDUk9MTCkge1xuICAgICAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfVEVYVCB8fCBjaGFuZ2VzICYgQ0hBTkdFX0xJTkVTKVxuICAgICAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuc2Nyb2xsTGluZXMoY29uZmlnKTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRjdXJzb3JMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJGhpZ2hsaWdodEd1dHRlckxpbmUgJiYgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuICAgICAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImFmdGVyUmVuZGVyXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfVEVYVCkge1xuICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2hhbmdlcyAmIENIQU5HRV9MSU5FUykge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHVwZGF0ZUxpbmVzKCkgfHwgKGNoYW5nZXMgJiBDSEFOR0VfR1VUVEVSKSAmJiB0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoYW5nZXMgJiBDSEFOR0VfVEVYVCB8fCBjaGFuZ2VzICYgQ0hBTkdFX0dVVFRFUikge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9DVVJTT1IpIHtcbiAgICAgICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICAgICAgICAgIHRoaXMuJGhpZ2hsaWdodEd1dHRlckxpbmUgJiYgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoYW5nZXMgJiAoQ0hBTkdFX01BUktFUiB8IENIQU5HRV9NQVJLRVJfRlJPTlQpKSB7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjaGFuZ2VzICYgKENIQU5HRV9NQVJLRVIgfCBDSEFOR0VfTUFSS0VSX0JBQ0spKSB7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiYWZ0ZXJSZW5kZXJcIik7XG4gICAgfVxuXG4gICAgJGF1dG9zaXplKCkge1xuICAgICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5zZXNzaW9uLmdldFNjcmVlbkxlbmd0aCgpICogdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgbWF4SGVpZ2h0ID0gdGhpcy4kbWF4TGluZXMgKiB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBkZXNpcmVkSGVpZ2h0ID0gTWF0aC5tYXgoXG4gICAgICAgICAgICAodGhpcy4kbWluTGluZXMgfHwgMSkgKiB0aGlzLmxpbmVIZWlnaHQsXG4gICAgICAgICAgICBNYXRoLm1pbihtYXhIZWlnaHQsIGhlaWdodClcbiAgICAgICAgKSArIHRoaXMuc2Nyb2xsTWFyZ2luLnYgKyAodGhpcy4kZXh0cmFIZWlnaHQgfHwgMCk7XG4gICAgICAgIHZhciB2U2Nyb2xsID0gaGVpZ2h0ID4gbWF4SGVpZ2h0O1xuXG4gICAgICAgIGlmIChkZXNpcmVkSGVpZ2h0ICE9IHRoaXMuZGVzaXJlZEhlaWdodCB8fFxuICAgICAgICAgICAgdGhpcy4kc2l6ZS5oZWlnaHQgIT0gdGhpcy5kZXNpcmVkSGVpZ2h0IHx8IHZTY3JvbGwgIT0gdGhpcy4kdlNjcm9sbCkge1xuICAgICAgICAgICAgaWYgKHZTY3JvbGwgIT0gdGhpcy4kdlNjcm9sbCkge1xuICAgICAgICAgICAgICAgIHRoaXMuJHZTY3JvbGwgPSB2U2Nyb2xsO1xuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zZXRWaXNpYmxlKHZTY3JvbGwpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdyA9IHRoaXMuY29udGFpbmVyLmNsaWVudFdpZHRoO1xuICAgICAgICAgICAgdGhpcy5jb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gZGVzaXJlZEhlaWdodCArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZUNhY2hlZFNpemUodHJ1ZSwgdGhpcy4kZ3V0dGVyV2lkdGgsIHcsIGRlc2lyZWRIZWlnaHQpO1xuICAgICAgICAgICAgLy8gdGhpcy4kbG9vcC5jaGFuZ2VzID0gMDtcbiAgICAgICAgICAgIHRoaXMuZGVzaXJlZEhlaWdodCA9IGRlc2lyZWRIZWlnaHQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAkY29tcHV0ZUxheWVyQ29uZmlnKCkge1xuXG4gICAgICAgIGlmICh0aGlzLiRtYXhMaW5lcyAmJiB0aGlzLmxpbmVIZWlnaHQgPiAxKSB7XG4gICAgICAgICAgICB0aGlzLiRhdXRvc2l6ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciBzaXplID0gdGhpcy4kc2l6ZTtcblxuICAgICAgICB2YXIgaGlkZVNjcm9sbGJhcnMgPSBzaXplLmhlaWdodCA8PSAyICogdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgc2NyZWVuTGluZXMgPSB0aGlzLnNlc3Npb24uZ2V0U2NyZWVuTGVuZ3RoKCk7XG4gICAgICAgIHZhciBtYXhIZWlnaHQgPSBzY3JlZW5MaW5lcyAqIHRoaXMubGluZUhlaWdodDtcblxuICAgICAgICB2YXIgb2Zmc2V0ID0gdGhpcy5zY3JvbGxUb3AgJSB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBtaW5IZWlnaHQgPSBzaXplLnNjcm9sbGVySGVpZ2h0ICsgdGhpcy5saW5lSGVpZ2h0O1xuXG4gICAgICAgIHZhciBsb25nZXN0TGluZSA9IHRoaXMuJGdldExvbmdlc3RMaW5lKCk7XG5cbiAgICAgICAgdmFyIGhvcml6U2Nyb2xsID0gIWhpZGVTY3JvbGxiYXJzICYmICh0aGlzLiRoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSB8fFxuICAgICAgICAgICAgc2l6ZS5zY3JvbGxlcldpZHRoIC0gbG9uZ2VzdExpbmUgLSAyICogdGhpcy4kcGFkZGluZyA8IDApO1xuXG4gICAgICAgIHZhciBoU2Nyb2xsQ2hhbmdlZCA9IHRoaXMuJGhvcml6U2Nyb2xsICE9PSBob3JpelNjcm9sbDtcbiAgICAgICAgaWYgKGhTY3JvbGxDaGFuZ2VkKSB7XG4gICAgICAgICAgICB0aGlzLiRob3JpelNjcm9sbCA9IGhvcml6U2Nyb2xsO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJILnNldFZpc2libGUoaG9yaXpTY3JvbGwpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLiRtYXhMaW5lcyAmJiB0aGlzLiRzY3JvbGxQYXN0RW5kKSB7XG4gICAgICAgICAgICBtYXhIZWlnaHQgKz0gKHNpemUuc2Nyb2xsZXJIZWlnaHQgLSB0aGlzLmxpbmVIZWlnaHQpICogdGhpcy4kc2Nyb2xsUGFzdEVuZDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB2U2Nyb2xsID0gIWhpZGVTY3JvbGxiYXJzICYmICh0aGlzLiR2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSB8fFxuICAgICAgICAgICAgc2l6ZS5zY3JvbGxlckhlaWdodCAtIG1heEhlaWdodCA8IDApO1xuICAgICAgICB2YXIgdlNjcm9sbENoYW5nZWQgPSB0aGlzLiR2U2Nyb2xsICE9PSB2U2Nyb2xsO1xuICAgICAgICBpZiAodlNjcm9sbENoYW5nZWQpIHtcbiAgICAgICAgICAgIHRoaXMuJHZTY3JvbGwgPSB2U2Nyb2xsO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJWLnNldFZpc2libGUodlNjcm9sbCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKE1hdGgubWF4KC10aGlzLnNjcm9sbE1hcmdpbi50b3AsXG4gICAgICAgICAgICBNYXRoLm1pbih0aGlzLnNjcm9sbFRvcCwgbWF4SGVpZ2h0IC0gc2l6ZS5zY3JvbGxlckhlaWdodCArIHRoaXMuc2Nyb2xsTWFyZ2luLmJvdHRvbSkpKTtcblxuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdChNYXRoLm1heCgtdGhpcy5zY3JvbGxNYXJnaW4ubGVmdCwgTWF0aC5taW4odGhpcy5zY3JvbGxMZWZ0LFxuICAgICAgICAgICAgbG9uZ2VzdExpbmUgKyAyICogdGhpcy4kcGFkZGluZyAtIHNpemUuc2Nyb2xsZXJXaWR0aCArIHRoaXMuc2Nyb2xsTWFyZ2luLnJpZ2h0KSkpO1xuXG4gICAgICAgIHZhciBsaW5lQ291bnQgPSBNYXRoLmNlaWwobWluSGVpZ2h0IC8gdGhpcy5saW5lSGVpZ2h0KSAtIDE7XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IE1hdGgubWF4KDAsIE1hdGgucm91bmQoKHRoaXMuc2Nyb2xsVG9wIC0gb2Zmc2V0KSAvIHRoaXMubGluZUhlaWdodCkpO1xuICAgICAgICB2YXIgbGFzdFJvdyA9IGZpcnN0Um93ICsgbGluZUNvdW50O1xuXG4gICAgICAgIC8vIE1hcCBsaW5lcyBvbiB0aGUgc2NyZWVuIHRvIGxpbmVzIGluIHRoZSBkb2N1bWVudC5cbiAgICAgICAgdmFyIGZpcnN0Um93U2NyZWVuLCBmaXJzdFJvd0hlaWdodDtcbiAgICAgICAgdmFyIGxpbmVIZWlnaHQgPSB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIGZpcnN0Um93ID0gc2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50Um93KGZpcnN0Um93LCAwKTtcblxuICAgICAgICAvLyBDaGVjayBpZiBmaXJzdFJvdyBpcyBpbnNpZGUgb2YgYSBmb2xkTGluZS4gSWYgdHJ1ZSwgdGhlbiB1c2UgdGhlIGZpcnN0XG4gICAgICAgIC8vIHJvdyBvZiB0aGUgZm9sZExpbmUuXG4gICAgICAgIHZhciBmb2xkTGluZSA9IHNlc3Npb24uZ2V0Rm9sZExpbmUoZmlyc3RSb3cpO1xuICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgIGZpcnN0Um93ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICB9XG5cbiAgICAgICAgZmlyc3RSb3dTY3JlZW4gPSBzZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Sb3coZmlyc3RSb3csIDApO1xuICAgICAgICBmaXJzdFJvd0hlaWdodCA9IHNlc3Npb24uZ2V0Um93TGVuZ3RoKGZpcnN0Um93KSAqIGxpbmVIZWlnaHQ7XG5cbiAgICAgICAgbGFzdFJvdyA9IE1hdGgubWluKHNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFJvdyhsYXN0Um93LCAwKSwgc2Vzc2lvbi5nZXRMZW5ndGgoKSAtIDEpO1xuICAgICAgICBtaW5IZWlnaHQgPSBzaXplLnNjcm9sbGVySGVpZ2h0ICsgc2Vzc2lvbi5nZXRSb3dMZW5ndGgobGFzdFJvdykgKiBsaW5lSGVpZ2h0ICtcbiAgICAgICAgICAgIGZpcnN0Um93SGVpZ2h0O1xuXG4gICAgICAgIG9mZnNldCA9IHRoaXMuc2Nyb2xsVG9wIC0gZmlyc3RSb3dTY3JlZW4gKiBsaW5lSGVpZ2h0O1xuXG4gICAgICAgIHZhciBjaGFuZ2VzID0gMDtcbiAgICAgICAgaWYgKHRoaXMubGF5ZXJDb25maWcud2lkdGggIT0gbG9uZ2VzdExpbmUpXG4gICAgICAgICAgICBjaGFuZ2VzID0gQ0hBTkdFX0hfU0NST0xMO1xuICAgICAgICAvLyBIb3Jpem9udGFsIHNjcm9sbGJhciB2aXNpYmlsaXR5IG1heSBoYXZlIGNoYW5nZWQsIHdoaWNoIGNoYW5nZXNcbiAgICAgICAgLy8gdGhlIGNsaWVudCBoZWlnaHQgb2YgdGhlIHNjcm9sbGVyXG4gICAgICAgIGlmIChoU2Nyb2xsQ2hhbmdlZCB8fCB2U2Nyb2xsQ2hhbmdlZCkge1xuICAgICAgICAgICAgY2hhbmdlcyA9IHRoaXMuJHVwZGF0ZUNhY2hlZFNpemUodHJ1ZSwgdGhpcy5ndXR0ZXJXaWR0aCwgc2l6ZS53aWR0aCwgc2l6ZS5oZWlnaHQpO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwic2Nyb2xsYmFyVmlzaWJpbGl0eUNoYW5nZWRcIik7XG4gICAgICAgICAgICBpZiAodlNjcm9sbENoYW5nZWQpXG4gICAgICAgICAgICAgICAgbG9uZ2VzdExpbmUgPSB0aGlzLiRnZXRMb25nZXN0TGluZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5sYXllckNvbmZpZyA9IHtcbiAgICAgICAgICAgIHdpZHRoOiBsb25nZXN0TGluZSxcbiAgICAgICAgICAgIHBhZGRpbmc6IHRoaXMuJHBhZGRpbmcsXG4gICAgICAgICAgICBmaXJzdFJvdzogZmlyc3RSb3csXG4gICAgICAgICAgICBmaXJzdFJvd1NjcmVlbjogZmlyc3RSb3dTY3JlZW4sXG4gICAgICAgICAgICBsYXN0Um93OiBsYXN0Um93LFxuICAgICAgICAgICAgbGluZUhlaWdodDogbGluZUhlaWdodCxcbiAgICAgICAgICAgIGNoYXJhY3RlcldpZHRoOiB0aGlzLmNoYXJhY3RlcldpZHRoLFxuICAgICAgICAgICAgbWluSGVpZ2h0OiBtaW5IZWlnaHQsXG4gICAgICAgICAgICBtYXhIZWlnaHQ6IG1heEhlaWdodCxcbiAgICAgICAgICAgIG9mZnNldDogb2Zmc2V0LFxuICAgICAgICAgICAgZ3V0dGVyT2Zmc2V0OiBNYXRoLm1heCgwLCBNYXRoLmNlaWwoKG9mZnNldCArIHNpemUuaGVpZ2h0IC0gc2l6ZS5zY3JvbGxlckhlaWdodCkgLyBsaW5lSGVpZ2h0KSksXG4gICAgICAgICAgICBoZWlnaHQ6IHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHRcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gY2hhbmdlcztcbiAgICB9XG5cbiAgICAkdXBkYXRlTGluZXMoKSB7XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IHRoaXMuJGNoYW5nZWRMaW5lcy5maXJzdFJvdztcbiAgICAgICAgdmFyIGxhc3RSb3cgPSB0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdztcbiAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzID0gbnVsbDtcblxuICAgICAgICB2YXIgbGF5ZXJDb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuXG4gICAgICAgIGlmIChmaXJzdFJvdyA+IGxheWVyQ29uZmlnLmxhc3RSb3cgKyAxKSB7IHJldHVybjsgfVxuICAgICAgICBpZiAobGFzdFJvdyA8IGxheWVyQ29uZmlnLmZpcnN0Um93KSB7IHJldHVybjsgfVxuXG4gICAgICAgIC8vIGlmIHRoZSBsYXN0IHJvdyBpcyB1bmtub3duIC0+IHJlZHJhdyBldmVyeXRoaW5nXG4gICAgICAgIGlmIChsYXN0Um93ID09PSBJbmZpbml0eSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGxheWVyQ29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGUobGF5ZXJDb25maWcpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZWxzZSB1cGRhdGUgb25seSB0aGUgY2hhbmdlZCByb3dzXG4gICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGVMaW5lcyhsYXllckNvbmZpZywgZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAkZ2V0TG9uZ2VzdExpbmUoKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGNoYXJDb3VudCA9IHRoaXMuc2Vzc2lvbi5nZXRTY3JlZW5XaWR0aCgpO1xuICAgICAgICBpZiAodGhpcy5zaG93SW52aXNpYmxlcyAmJiAhdGhpcy5zZXNzaW9uLiR1c2VXcmFwTW9kZSlcbiAgICAgICAgICAgIGNoYXJDb3VudCArPSAxO1xuXG4gICAgICAgIHJldHVybiBNYXRoLm1heCh0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSAyICogdGhpcy4kcGFkZGluZywgTWF0aC5yb3VuZChjaGFyQ291bnQgKiB0aGlzLmNoYXJhY3RlcldpZHRoKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogU2NoZWR1bGVzIGFuIHVwZGF0ZSB0byBhbGwgdGhlIGZyb250IG1hcmtlcnMgaW4gdGhlIGRvY3VtZW50LlxuICAgICoqL1xuICAgIHVwZGF0ZUZyb250TWFya2VycygpIHtcbiAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQuc2V0TWFya2Vycyh0aGlzLnNlc3Npb24uZ2V0TWFya2Vycyh0cnVlKSk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX01BUktFUl9GUk9OVCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogU2NoZWR1bGVzIGFuIHVwZGF0ZSB0byBhbGwgdGhlIGJhY2sgbWFya2VycyBpbiB0aGUgZG9jdW1lbnQuXG4gICAgKiovXG4gICAgdXBkYXRlQmFja01hcmtlcnMoKSB7XG4gICAgICAgIHRoaXMuJG1hcmtlckJhY2suc2V0TWFya2Vycyh0aGlzLnNlc3Npb24uZ2V0TWFya2VycyhmYWxzZSkpO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9NQVJLRVJfQkFDSyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogRGVwcmVjYXRlZDsgKG1vdmVkIHRvIFtbRWRpdFNlc3Npb25dXSlcbiAgICAqIEBkZXByZWNhdGVkXG4gICAgKiovXG4gICAgcHJpdmF0ZSBhZGRHdXR0ZXJEZWNvcmF0aW9uKHJvdywgY2xhc3NOYW1lKSB7XG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyLmFkZEd1dHRlckRlY29yYXRpb24ocm93LCBjbGFzc05hbWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogRGVwcmVjYXRlZDsgKG1vdmVkIHRvIFtbRWRpdFNlc3Npb25dXSlcbiAgICAqIEBkZXByZWNhdGVkXG4gICAgKiovXG4gICAgcHJpdmF0ZSByZW1vdmVHdXR0ZXJEZWNvcmF0aW9uKHJvdywgY2xhc3NOYW1lKSB7XG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnJlbW92ZUd1dHRlckRlY29yYXRpb24ocm93LCBjbGFzc05hbWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJlZHJhdyBicmVha3BvaW50cy5cbiAgICAqKi9cbiAgICB1cGRhdGVCcmVha3BvaW50cygpIHtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfR1VUVEVSKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBTZXRzIGFubm90YXRpb25zIGZvciB0aGUgZ3V0dGVyLlxuICAgICogQHBhcmFtIHtBcnJheX0gYW5ub3RhdGlvbnMgQW4gYXJyYXkgY29udGFpbmluZyBhbm5vdGF0aW9uc1xuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgc2V0QW5ub3RhdGlvbnMoYW5ub3RhdGlvbnMpIHtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0QW5ub3RhdGlvbnMoYW5ub3RhdGlvbnMpO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9HVVRURVIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFVwZGF0ZXMgdGhlIGN1cnNvciBpY29uLlxuICAgICoqL1xuICAgIHVwZGF0ZUN1cnNvcigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfQ1VSU09SKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBIaWRlcyB0aGUgY3Vyc29yIGljb24uXG4gICAgKiovXG4gICAgaGlkZUN1cnNvcigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuaGlkZUN1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFNob3dzIHRoZSBjdXJzb3IgaWNvbi5cbiAgICAqKi9cbiAgICBzaG93Q3Vyc29yKCkge1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5zaG93Q3Vyc29yKCk7XG4gICAgfVxuXG4gICAgc2Nyb2xsU2VsZWN0aW9uSW50b1ZpZXcoYW5jaG9yLCBsZWFkLCBvZmZzZXQ/KSB7XG4gICAgICAgIC8vIGZpcnN0IHNjcm9sbCBhbmNob3IgaW50byB2aWV3IHRoZW4gc2Nyb2xsIGxlYWQgaW50byB2aWV3XG4gICAgICAgIHRoaXMuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcoYW5jaG9yLCBvZmZzZXQpO1xuICAgICAgICB0aGlzLnNjcm9sbEN1cnNvckludG9WaWV3KGxlYWQsIG9mZnNldCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogU2Nyb2xscyB0aGUgY3Vyc29yIGludG8gdGhlIGZpcnN0IHZpc2liaWxlIGFyZWEgb2YgdGhlIGVkaXRvclxuICAgICoqL1xuICAgIHNjcm9sbEN1cnNvckludG9WaWV3KGN1cnNvcj8sIG9mZnNldD8sICR2aWV3TWFyZ2luPykge1xuICAgICAgICAvLyB0aGUgZWRpdG9yIGlzIG5vdCB2aXNpYmxlXG4gICAgICAgIGlmICh0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0ID09PSAwKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBwb3MgPSB0aGlzLiRjdXJzb3JMYXllci5nZXRQaXhlbFBvc2l0aW9uKGN1cnNvcik7XG5cbiAgICAgICAgdmFyIGxlZnQgPSBwb3MubGVmdDtcbiAgICAgICAgdmFyIHRvcCA9IHBvcy50b3A7XG5cbiAgICAgICAgdmFyIHRvcE1hcmdpbiA9ICR2aWV3TWFyZ2luICYmICR2aWV3TWFyZ2luLnRvcCB8fCAwO1xuICAgICAgICB2YXIgYm90dG9tTWFyZ2luID0gJHZpZXdNYXJnaW4gJiYgJHZpZXdNYXJnaW4uYm90dG9tIHx8IDA7XG5cbiAgICAgICAgdmFyIHNjcm9sbFRvcCA9IHRoaXMuJHNjcm9sbEFuaW1hdGlvbiA/IHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSA6IHRoaXMuc2Nyb2xsVG9wO1xuXG4gICAgICAgIGlmIChzY3JvbGxUb3AgKyB0b3BNYXJnaW4gPiB0b3ApIHtcbiAgICAgICAgICAgIGlmIChvZmZzZXQpXG4gICAgICAgICAgICAgICAgdG9wIC09IG9mZnNldCAqIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQ7XG4gICAgICAgICAgICBpZiAodG9wID09PSAwKVxuICAgICAgICAgICAgICAgIHRvcCA9IC10aGlzLnNjcm9sbE1hcmdpbi50b3A7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHRvcCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoc2Nyb2xsVG9wICsgdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCAtIGJvdHRvbU1hcmdpbiA8IHRvcCArIHRoaXMubGluZUhlaWdodCkge1xuICAgICAgICAgICAgaWYgKG9mZnNldClcbiAgICAgICAgICAgICAgICB0b3AgKz0gb2Zmc2V0ICogdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodDtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AodG9wICsgdGhpcy5saW5lSGVpZ2h0IC0gdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc2Nyb2xsTGVmdCA9IHRoaXMuc2Nyb2xsTGVmdDtcblxuICAgICAgICBpZiAoc2Nyb2xsTGVmdCA+IGxlZnQpIHtcbiAgICAgICAgICAgIGlmIChsZWZ0IDwgdGhpcy4kcGFkZGluZyArIDIgKiB0aGlzLmxheWVyQ29uZmlnLmNoYXJhY3RlcldpZHRoKVxuICAgICAgICAgICAgICAgIGxlZnQgPSAtdGhpcy5zY3JvbGxNYXJnaW4ubGVmdDtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KGxlZnQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNjcm9sbExlZnQgKyB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggPCBsZWZ0ICsgdGhpcy5jaGFyYWN0ZXJXaWR0aCkge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQoTWF0aC5yb3VuZChsZWZ0ICsgdGhpcy5jaGFyYWN0ZXJXaWR0aCAtIHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCkpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNjcm9sbExlZnQgPD0gdGhpcy4kcGFkZGluZyAmJiBsZWZ0IC0gc2Nyb2xsTGVmdCA8IHRoaXMuY2hhcmFjdGVyV2lkdGgpIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KDApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiB7OkVkaXRTZXNzaW9uLmdldFNjcm9sbFRvcH1cbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmdldFNjcm9sbFRvcFxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxUb3AoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIHs6RWRpdFNlc3Npb24uZ2V0U2Nyb2xsTGVmdH1cbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmdldFNjcm9sbExlZnRcbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0U2Nyb2xsTGVmdCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFNjcm9sbExlZnQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBmaXJzdCB2aXNpYmxlIHJvdywgcmVnYXJkbGVzcyBvZiB3aGV0aGVyIGl0J3MgZnVsbHkgdmlzaWJsZSBvciBub3QuXG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldFNjcm9sbFRvcFJvdygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zY3JvbGxUb3AgLyB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgbGFzdCB2aXNpYmxlIHJvdywgcmVnYXJkbGVzcyBvZiB3aGV0aGVyIGl0J3MgZnVsbHkgdmlzaWJsZSBvciBub3QuXG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldFNjcm9sbEJvdHRvbVJvdygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gTWF0aC5tYXgoMCwgTWF0aC5mbG9vcigodGhpcy5zY3JvbGxUb3AgKyB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0KSAvIHRoaXMubGluZUhlaWdodCkgLSAxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEdyYWNlZnVsbHkgc2Nyb2xscyBmcm9tIHRoZSB0b3Agb2YgdGhlIGVkaXRvciB0byB0aGUgcm93IGluZGljYXRlZC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgQSByb3cgaWRcbiAgICAqXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uc2V0U2Nyb2xsVG9wXG4gICAgKiovXG4gICAgc2Nyb2xsVG9Sb3cocm93OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChyb3cgKiB0aGlzLmxpbmVIZWlnaHQpO1xuICAgIH1cblxuICAgIGFsaWduQ3Vyc29yKGN1cnNvciwgYWxpZ25tZW50KSB7XG4gICAgICAgIGlmICh0eXBlb2YgY3Vyc29yID09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICBjdXJzb3IgPSB7IHJvdzogY3Vyc29yLCBjb2x1bW46IDAgfTtcblxuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuZ2V0UGl4ZWxQb3NpdGlvbihjdXJzb3IpO1xuICAgICAgICB2YXIgaCA9IHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgLSB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBvZmZzZXQgPSBwb3MudG9wIC0gaCAqIChhbGlnbm1lbnQgfHwgMCk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChvZmZzZXQpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0O1xuICAgIH1cblxuICAgICRjYWxjU3RlcHMoZnJvbVZhbHVlOiBudW1iZXIsIHRvVmFsdWU6IG51bWJlcik6IG51bWJlcltdIHtcbiAgICAgICAgdmFyIGk6IG51bWJlciA9IDA7XG4gICAgICAgIHZhciBsOiBudW1iZXIgPSB0aGlzLlNURVBTO1xuICAgICAgICB2YXIgc3RlcHM6IG51bWJlcltdID0gW107XG5cbiAgICAgICAgdmFyIGZ1bmMgPSBmdW5jdGlvbih0OiBudW1iZXIsIHhfbWluOiBudW1iZXIsIGR4OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICAgICAgcmV0dXJuIGR4ICogKE1hdGgucG93KHQgLSAxLCAzKSArIDEpICsgeF9taW47XG4gICAgICAgIH07XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGw7ICsraSkge1xuICAgICAgICAgICAgc3RlcHMucHVzaChmdW5jKGkgLyB0aGlzLlNURVBTLCBmcm9tVmFsdWUsIHRvVmFsdWUgLSBmcm9tVmFsdWUpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzdGVwcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHcmFjZWZ1bGx5IHNjcm9sbHMgdGhlIGVkaXRvciB0byB0aGUgcm93IGluZGljYXRlZC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbGluZSBBIGxpbmUgbnVtYmVyXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBjZW50ZXIgSWYgYHRydWVgLCBjZW50ZXJzIHRoZSBlZGl0b3IgdGhlIHRvIGluZGljYXRlZCBsaW5lXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbmltYXRlIElmIGB0cnVlYCBhbmltYXRlcyBzY3JvbGxpbmdcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgYWZ0ZXIgdGhlIGFuaW1hdGlvbiBoYXMgZmluaXNoZWRcbiAgICAgKi9cbiAgICBzY3JvbGxUb0xpbmUobGluZTogbnVtYmVyLCBjZW50ZXI6IGJvb2xlYW4sIGFuaW1hdGU6IGJvb2xlYW4sIGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLiRjdXJzb3JMYXllci5nZXRQaXhlbFBvc2l0aW9uKHsgcm93OiBsaW5lLCBjb2x1bW46IDAgfSk7XG4gICAgICAgIHZhciBvZmZzZXQgPSBwb3MudG9wO1xuICAgICAgICBpZiAoY2VudGVyKSB7XG4gICAgICAgICAgICBvZmZzZXQgLT0gdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCAvIDI7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaW5pdGlhbFNjcm9sbCA9IHRoaXMuc2Nyb2xsVG9wO1xuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKG9mZnNldCk7XG4gICAgICAgIGlmIChhbmltYXRlICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5hbmltYXRlU2Nyb2xsaW5nKGluaXRpYWxTY3JvbGwsIGNhbGxiYWNrKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFuaW1hdGVTY3JvbGxpbmcoZnJvbVZhbHVlOiBudW1iZXIsIGNhbGxiYWNrPykge1xuICAgICAgICB2YXIgdG9WYWx1ZSA9IHRoaXMuc2Nyb2xsVG9wO1xuICAgICAgICBpZiAoIXRoaXMuJGFuaW1hdGVkU2Nyb2xsKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcblxuICAgICAgICBpZiAoZnJvbVZhbHVlID09IHRvVmFsdWUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKHRoaXMuJHNjcm9sbEFuaW1hdGlvbikge1xuICAgICAgICAgICAgdmFyIG9sZFN0ZXBzID0gdGhpcy4kc2Nyb2xsQW5pbWF0aW9uLnN0ZXBzO1xuICAgICAgICAgICAgaWYgKG9sZFN0ZXBzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGZyb21WYWx1ZSA9IG9sZFN0ZXBzWzBdO1xuICAgICAgICAgICAgICAgIGlmIChmcm9tVmFsdWUgPT0gdG9WYWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHN0ZXBzID0gX3NlbGYuJGNhbGNTdGVwcyhmcm9tVmFsdWUsIHRvVmFsdWUpO1xuICAgICAgICB0aGlzLiRzY3JvbGxBbmltYXRpb24gPSB7IGZyb206IGZyb21WYWx1ZSwgdG86IHRvVmFsdWUsIHN0ZXBzOiBzdGVwcyB9O1xuXG4gICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy4kdGltZXIpO1xuXG4gICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHN0ZXBzLnNoaWZ0KCkpO1xuICAgICAgICAvLyB0cmljayBzZXNzaW9uIHRvIHRoaW5rIGl0J3MgYWxyZWFkeSBzY3JvbGxlZCB0byBub3QgbG9vc2UgdG9WYWx1ZVxuICAgICAgICBfc2VsZi5zZXNzaW9uLiRzY3JvbGxUb3AgPSB0b1ZhbHVlO1xuICAgICAgICB0aGlzLiR0aW1lciA9IHNldEludGVydmFsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHN0ZXBzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHN0ZXBzLnNoaWZ0KCkpO1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uJHNjcm9sbFRvcCA9IHRvVmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRvVmFsdWUgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uJHNjcm9sbFRvcCA9IC0xO1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHRvVmFsdWUpO1xuICAgICAgICAgICAgICAgIHRvVmFsdWUgPSBudWxsO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBkbyB0aGlzIG9uIHNlcGFyYXRlIHN0ZXAgdG8gbm90IGdldCBzcHVyaW91cyBzY3JvbGwgZXZlbnQgZnJvbSBzY3JvbGxiYXJcbiAgICAgICAgICAgICAgICBfc2VsZi4kdGltZXIgPSBjbGVhckludGVydmFsKF9zZWxmLiR0aW1lcik7XG4gICAgICAgICAgICAgICAgX3NlbGYuJHNjcm9sbEFuaW1hdGlvbiA9IG51bGw7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sgJiYgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgMTApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdGhlIGVkaXRvciB0byB0aGUgeSBwaXhlbCBpbmRpY2F0ZWQuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHNjcm9sbFRvcCBUaGUgcG9zaXRpb24gdG8gc2Nyb2xsIHRvXG4gICAgICovXG4gICAgc2Nyb2xsVG9ZKHNjcm9sbFRvcDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIC8vIGFmdGVyIGNhbGxpbmcgc2Nyb2xsQmFyLnNldFNjcm9sbFRvcFxuICAgICAgICAvLyBzY3JvbGxiYXIgc2VuZHMgdXMgZXZlbnQgd2l0aCBzYW1lIHNjcm9sbFRvcC4gaWdub3JlIGl0XG4gICAgICAgIGlmICh0aGlzLnNjcm9sbFRvcCAhPT0gc2Nyb2xsVG9wKSB7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX1NDUk9MTCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRoZSBlZGl0b3IgYWNyb3NzIHRoZSB4LWF4aXMgdG8gdGhlIHBpeGVsIGluZGljYXRlZC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc2Nyb2xsTGVmdCBUaGUgcG9zaXRpb24gdG8gc2Nyb2xsIHRvXG4gICAgICoqL1xuICAgIHNjcm9sbFRvWChzY3JvbGxMZWZ0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuc2Nyb2xsTGVmdCAhPT0gc2Nyb2xsTGVmdCkge1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxMZWZ0ID0gc2Nyb2xsTGVmdDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0hfU0NST0xMKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogU2Nyb2xscyB0aGUgZWRpdG9yIGFjcm9zcyBib3RoIHgtIGFuZCB5LWF4ZXMuXG4gICAgKiBAcGFyYW0ge051bWJlcn0geCBUaGUgeCB2YWx1ZSB0byBzY3JvbGwgdG9cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSB5IFRoZSB5IHZhbHVlIHRvIHNjcm9sbCB0b1xuICAgICoqL1xuICAgIHNjcm9sbFRvKHg6IG51bWJlciwgeTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AoeSk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KHkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2Nyb2xscyB0aGUgZWRpdG9yIGFjcm9zcyBib3RoIHgtIGFuZCB5LWF4ZXMuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZGVsdGFYIFRoZSB4IHZhbHVlIHRvIHNjcm9sbCBieVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlbHRhWSBUaGUgeSB2YWx1ZSB0byBzY3JvbGwgYnlcbiAgICAqKi9cbiAgICBzY3JvbGxCeShkZWx0YVg6IG51bWJlciwgZGVsdGFZOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgZGVsdGFZICYmIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AodGhpcy5zZXNzaW9uLmdldFNjcm9sbFRvcCgpICsgZGVsdGFZKTtcbiAgICAgICAgZGVsdGFYICYmIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxMZWZ0KCkgKyBkZWx0YVgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgeW91IGNhbiBzdGlsbCBzY3JvbGwgYnkgZWl0aGVyIHBhcmFtZXRlcjsgaW4gb3RoZXIgd29yZHMsIHlvdSBoYXZlbid0IHJlYWNoZWQgdGhlIGVuZCBvZiB0aGUgZmlsZSBvciBsaW5lLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlbHRhWCBUaGUgeCB2YWx1ZSB0byBzY3JvbGwgYnlcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkZWx0YVkgVGhlIHkgdmFsdWUgdG8gc2Nyb2xsIGJ5XG4gICAgKlxuICAgICpcbiAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICoqL1xuICAgIGlzU2Nyb2xsYWJsZUJ5KGRlbHRhWDogbnVtYmVyLCBkZWx0YVk6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgICAgICBpZiAoZGVsdGFZIDwgMCAmJiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgPj0gMSAtIHRoaXMuc2Nyb2xsTWFyZ2luLnRvcClcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBpZiAoZGVsdGFZID4gMCAmJiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgKyB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0XG4gICAgICAgICAgICAtIHRoaXMubGF5ZXJDb25maWcubWF4SGVpZ2h0IDwgLTEgKyB0aGlzLnNjcm9sbE1hcmdpbi5ib3R0b20pXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgaWYgKGRlbHRhWCA8IDAgJiYgdGhpcy5zZXNzaW9uLmdldFNjcm9sbExlZnQoKSA+PSAxIC0gdGhpcy5zY3JvbGxNYXJnaW4ubGVmdClcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBpZiAoZGVsdGFYID4gMCAmJiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpICsgdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoXG4gICAgICAgICAgICAtIHRoaXMubGF5ZXJDb25maWcud2lkdGggPCAtMSArIHRoaXMuc2Nyb2xsTWFyZ2luLnJpZ2h0KVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcGl4ZWxUb1NjcmVlbkNvb3JkaW5hdGVzKHg6IG51bWJlciwgeTogbnVtYmVyKSB7XG4gICAgICAgIHZhciBjYW52YXNQb3MgPSB0aGlzLnNjcm9sbGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG4gICAgICAgIHZhciBvZmZzZXQgPSAoeCArIHRoaXMuc2Nyb2xsTGVmdCAtIGNhbnZhc1Bvcy5sZWZ0IC0gdGhpcy4kcGFkZGluZykgLyB0aGlzLmNoYXJhY3RlcldpZHRoO1xuICAgICAgICB2YXIgcm93ID0gTWF0aC5mbG9vcigoeSArIHRoaXMuc2Nyb2xsVG9wIC0gY2FudmFzUG9zLnRvcCkgLyB0aGlzLmxpbmVIZWlnaHQpO1xuICAgICAgICB2YXIgY29sID0gTWF0aC5yb3VuZChvZmZzZXQpO1xuXG4gICAgICAgIHJldHVybiB7IHJvdzogcm93LCBjb2x1bW46IGNvbCwgc2lkZTogb2Zmc2V0IC0gY29sID4gMCA/IDEgOiAtMSB9O1xuICAgIH1cblxuICAgIHNjcmVlblRvVGV4dENvb3JkaW5hdGVzKGNsaWVudFg6IG51bWJlciwgY2xpZW50WTogbnVtYmVyKSB7XG4gICAgICAgIHZhciBjYW52YXNQb3MgPSB0aGlzLnNjcm9sbGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG4gICAgICAgIHZhciBjb2x1bW4gPSBNYXRoLnJvdW5kKChjbGllbnRYICsgdGhpcy5zY3JvbGxMZWZ0IC0gY2FudmFzUG9zLmxlZnQgLSB0aGlzLiRwYWRkaW5nKSAvIHRoaXMuY2hhcmFjdGVyV2lkdGgpO1xuXG4gICAgICAgIHZhciByb3cgPSAoY2xpZW50WSArIHRoaXMuc2Nyb2xsVG9wIC0gY2FudmFzUG9zLnRvcCkgLyB0aGlzLmxpbmVIZWlnaHQ7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24ocm93LCBNYXRoLm1heChjb2x1bW4sIDApKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGBwYWdlWGAgYW5kIGBwYWdlWWAgY29vcmRpbmF0ZXMgb2YgdGhlIGRvY3VtZW50IHBvc2l0aW9uLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgZG9jdW1lbnQgcm93IHBvc2l0aW9uXG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBkb2N1bWVudCBjb2x1bW4gcG9zaXRpb25cbiAgICAqIEByZXR1cm5zIHtPYmplY3R9XG4gICAgKiovXG4gICAgdGV4dFRvU2NyZWVuQ29vcmRpbmF0ZXMocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogeyBwYWdlWDogbnVtYmVyOyBwYWdlWTogbnVtYmVyIH0ge1xuICAgICAgICB2YXIgY2FudmFzUG9zID0gdGhpcy5zY3JvbGxlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24ocm93LCBjb2x1bW4pO1xuXG4gICAgICAgIHZhciB4ID0gdGhpcy4kcGFkZGluZyArIE1hdGgucm91bmQocG9zLmNvbHVtbiAqIHRoaXMuY2hhcmFjdGVyV2lkdGgpO1xuICAgICAgICB2YXIgeSA9IHBvcy5yb3cgKiB0aGlzLmxpbmVIZWlnaHQ7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHBhZ2VYOiBjYW52YXNQb3MubGVmdCArIHggLSB0aGlzLnNjcm9sbExlZnQsXG4gICAgICAgICAgICBwYWdlWTogY2FudmFzUG9zLnRvcCArIHkgLSB0aGlzLnNjcm9sbFRvcFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIEZvY3VzZXMgdGhlIGN1cnJlbnQgY29udGFpbmVyLlxuICAgICoqL1xuICAgIHZpc3VhbGl6ZUZvY3VzKCkge1xuICAgICAgICBhZGRDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgXCJhY2VfZm9jdXNcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogQmx1cnMgdGhlIGN1cnJlbnQgY29udGFpbmVyLlxuICAgICoqL1xuICAgIHZpc3VhbGl6ZUJsdXIoKSB7XG4gICAgICAgIHJlbW92ZUNzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBcImFjZV9mb2N1c1wiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHNob3dDb21wb3NpdGlvblxuICAgICAqIEBwYXJhbSBwb3NpdGlvblxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgc2hvd0NvbXBvc2l0aW9uKHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9KSB7XG4gICAgICAgIGlmICghdGhpcy4kY29tcG9zaXRpb24pXG4gICAgICAgICAgICB0aGlzLiRjb21wb3NpdGlvbiA9IHtcbiAgICAgICAgICAgICAgICBrZWVwVGV4dEFyZWFBdEN1cnNvcjogdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IsXG4gICAgICAgICAgICAgICAgY3NzVGV4dDogdGhpcy50ZXh0YXJlYS5zdHlsZS5jc3NUZXh0XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0gdHJ1ZTtcbiAgICAgICAgYWRkQ3NzQ2xhc3ModGhpcy50ZXh0YXJlYSwgXCJhY2VfY29tcG9zaXRpb25cIik7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuY3NzVGV4dCA9IFwiXCI7XG4gICAgICAgIHRoaXMuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgQSBzdHJpbmcgb2YgdGV4dCB0byB1c2VcbiAgICAgKlxuICAgICAqIFNldHMgdGhlIGlubmVyIHRleHQgb2YgdGhlIGN1cnJlbnQgY29tcG9zaXRpb24gdG8gYHRleHRgLlxuICAgICAqL1xuICAgIHNldENvbXBvc2l0aW9uVGV4dCh0ZXh0Pzogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIC8vIFRPRE86IFdoeSBpcyB0aGUgcGFyYW1ldGVyIG5vdCB1c2VkP1xuICAgICAgICB0aGlzLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEhpZGVzIHRoZSBjdXJyZW50IGNvbXBvc2l0aW9uLlxuICAgICAqL1xuICAgIGhpZGVDb21wb3NpdGlvbigpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRjb21wb3NpdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVtb3ZlQ3NzQ2xhc3ModGhpcy50ZXh0YXJlYSwgXCJhY2VfY29tcG9zaXRpb25cIik7XG4gICAgICAgIHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0gdGhpcy4kY29tcG9zaXRpb24ua2VlcFRleHRBcmVhQXRDdXJzb3I7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuY3NzVGV4dCA9IHRoaXMuJGNvbXBvc2l0aW9uLmNzc1RleHQ7XG4gICAgICAgIHRoaXMuJGNvbXBvc2l0aW9uID0gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGEgbmV3IHRoZW1lIGZvciB0aGUgZWRpdG9yLlxuICAgICAqIGB0aGVtZWAgc2hvdWxkIGV4aXN0LCBhbmQgYmUgYSBkaXJlY3RvcnkgcGF0aCwgbGlrZSBgYWNlL3RoZW1lL3RleHRtYXRlYC5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGhlbWUgVGhlIHBhdGggdG8gYSB0aGVtZVxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNiIG9wdGlvbmFsIGNhbGxiYWNrXG4gICAgICovXG4gICAgc2V0VGhlbWUodGhlbWU6IHN0cmluZywgY2I/OiAoKSA9PiBhbnkpOiB2b2lkIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJWaXJ0dWFsUmVuZGVyZXIgc2V0VGhlbWUsIHRoZW1lID0gXCIgKyB0aGVtZSlcbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy4kdGhlbWVJZCA9IHRoZW1lO1xuICAgICAgICBfc2VsZi5fZGlzcGF0Y2hFdmVudCgndGhlbWVDaGFuZ2UnLCB7IHRoZW1lOiB0aGVtZSB9KTtcblxuICAgICAgICBpZiAoIXRoZW1lIHx8IHR5cGVvZiB0aGVtZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgdmFyIG1vZHVsZU5hbWUgPSB0aGVtZSB8fCB0aGlzLiRvcHRpb25zLnRoZW1lLmluaXRpYWxWYWx1ZTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwibW9kdWxlTmFtZSA9PiBcIiArIG1vZHVsZU5hbWUpO1xuICAgICAgICAgICAgLy8gTG9hZGluZyBhIHRoZW1lIHdpbGwgaW5zZXJ0IGEgc2NyaXB0IHRoYXQsIHVwb24gZXhlY3V0aW9uLCB3aWxsXG4gICAgICAgICAgICAvLyBpbnNlcnQgYSBzdHlsZSB0YWcuXG4gICAgICAgICAgICBsb2FkTW9kdWxlKFtcInRoZW1lXCIsIG1vZHVsZU5hbWVdLCBhZnRlckxvYWQsIHRoaXMuY29udGFpbmVyLm93bmVyRG9jdW1lbnQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgYWZ0ZXJMb2FkKHRoZW1lKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGFmdGVyTG9hZChtb2R1bGUpIHtcbiAgICAgICAgICAgIGlmIChfc2VsZi4kdGhlbWVJZCAhPT0gdGhlbWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2IgJiYgY2IoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghbW9kdWxlLmNzc0NsYXNzKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGltcG9ydENzc1N0cmluZyhcbiAgICAgICAgICAgICAgICBtb2R1bGUuY3NzVGV4dCxcbiAgICAgICAgICAgICAgICBtb2R1bGUuY3NzQ2xhc3MsXG4gICAgICAgICAgICAgICAgX3NlbGYuY29udGFpbmVyLm93bmVyRG9jdW1lbnRcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIGlmIChfc2VsZi50aGVtZSlcbiAgICAgICAgICAgICAgICByZW1vdmVDc3NDbGFzcyhfc2VsZi5jb250YWluZXIsIF9zZWxmLnRoZW1lLmNzc0NsYXNzKTtcblxuICAgICAgICAgICAgdmFyIHBhZGRpbmcgPSBcInBhZGRpbmdcIiBpbiBtb2R1bGUgPyBtb2R1bGUucGFkZGluZyA6IFwicGFkZGluZ1wiIGluIChfc2VsZi50aGVtZSB8fCB7fSkgPyA0IDogX3NlbGYuJHBhZGRpbmc7XG5cbiAgICAgICAgICAgIGlmIChfc2VsZi4kcGFkZGluZyAmJiBwYWRkaW5nICE9IF9zZWxmLiRwYWRkaW5nKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2V0UGFkZGluZyhwYWRkaW5nKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gdGhpcyBpcyBrZXB0IG9ubHkgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgICBfc2VsZi4kdGhlbWUgPSBtb2R1bGUuY3NzQ2xhc3M7XG5cbiAgICAgICAgICAgIF9zZWxmLnRoZW1lID0gbW9kdWxlO1xuICAgICAgICAgICAgYWRkQ3NzQ2xhc3MoX3NlbGYuY29udGFpbmVyLCBtb2R1bGUuY3NzQ2xhc3MpO1xuICAgICAgICAgICAgc2V0Q3NzQ2xhc3MoX3NlbGYuY29udGFpbmVyLCBcImFjZV9kYXJrXCIsIG1vZHVsZS5pc0RhcmspO1xuXG4gICAgICAgICAgICAvLyBmb3JjZSByZS1tZWFzdXJlIG9mIHRoZSBndXR0ZXIgd2lkdGhcbiAgICAgICAgICAgIGlmIChfc2VsZi4kc2l6ZSkge1xuICAgICAgICAgICAgICAgIF9zZWxmLiRzaXplLndpZHRoID0gMDtcbiAgICAgICAgICAgICAgICBfc2VsZi4kdXBkYXRlU2l6ZUFzeW5jKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIF9zZWxmLl9kaXNwYXRjaEV2ZW50KCd0aGVtZUxvYWRlZCcsIHsgdGhlbWU6IG1vZHVsZSB9KTtcbiAgICAgICAgICAgIGNiICYmIGNiKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBbUmV0dXJucyB0aGUgcGF0aCBvZiB0aGUgY3VycmVudCB0aGVtZS5dezogI1ZpcnR1YWxSZW5kZXJlci5nZXRUaGVtZX1cbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAqL1xuICAgIGdldFRoZW1lKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLiR0aGVtZUlkO1xuICAgIH1cblxuICAgIC8vIE1ldGhvZHMgYWxsb3dzIHRvIGFkZCAvIHJlbW92ZSBDU1MgY2xhc3NuYW1lcyB0byB0aGUgZWRpdG9yIGVsZW1lbnQuXG4gICAgLy8gVGhpcyBmZWF0dXJlIGNhbiBiZSB1c2VkIGJ5IHBsdWctaW5zIHRvIHByb3ZpZGUgYSB2aXN1YWwgaW5kaWNhdGlvbiBvZlxuICAgIC8vIGEgY2VydGFpbiBtb2RlIHRoYXQgZWRpdG9yIGlzIGluLlxuXG4gICAgLyoqXG4gICAgICogW0FkZHMgYSBuZXcgY2xhc3MsIGBzdHlsZWAsIHRvIHRoZSBlZGl0b3IuXXs6ICNWaXJ0dWFsUmVuZGVyZXIuc2V0U3R5bGV9XG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHN0eWxlIEEgY2xhc3MgbmFtZVxuICAgICAqXG4gICAgICovXG4gICAgc2V0U3R5bGUoc3R5bGU6IHN0cmluZywgaW5jbHVkZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgc2V0Q3NzQ2xhc3ModGhpcy5jb250YWluZXIsIHN0eWxlLCBpbmNsdWRlICE9PSBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogW1JlbW92ZXMgdGhlIGNsYXNzIGBzdHlsZWAgZnJvbSB0aGUgZWRpdG9yLl17OiAjVmlydHVhbFJlbmRlcmVyLnVuc2V0U3R5bGV9XG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHN0eWxlIEEgY2xhc3MgbmFtZVxuICAgICAqL1xuICAgIHVuc2V0U3R5bGUoc3R5bGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICByZW1vdmVDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgc3R5bGUpO1xuICAgIH1cblxuICAgIHNldEN1cnNvclN0eWxlKHN0eWxlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgIT0gc3R5bGUpIHtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgPSBzdHlsZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBjdXJzb3JTdHlsZSBBIGNzcyBjdXJzb3Igc3R5bGVcbiAgICAgKi9cbiAgICBzZXRNb3VzZUN1cnNvcihjdXJzb3JTdHlsZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgPSBjdXJzb3JTdHlsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXN0cm95cyB0aGUgdGV4dCBhbmQgY3Vyc29yIGxheWVycyBmb3IgdGhpcyByZW5kZXJlci5cbiAgICAgKi9cbiAgICBkZXN0cm95KCk6IHZvaWQge1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuZGVzdHJveSgpO1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5kZXN0cm95KCk7XG4gICAgfVxufVxuXG5kZWZpbmVPcHRpb25zKFZpcnR1YWxSZW5kZXJlci5wcm90b3R5cGUsIFwicmVuZGVyZXJcIiwge1xuICAgIGFuaW1hdGVkU2Nyb2xsOiB7IGluaXRpYWxWYWx1ZTogZmFsc2UgfSxcbiAgICBzaG93SW52aXNpYmxlczoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyLnNldFNob3dJbnZpc2libGVzKHZhbHVlKSlcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX1RFWFQpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBzaG93UHJpbnRNYXJnaW46IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbigpIHsgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBwcmludE1hcmdpbkNvbHVtbjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKCkgeyB0aGlzLiR1cGRhdGVQcmludE1hcmdpbigpOyB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IDgwXG4gICAgfSxcbiAgICBwcmludE1hcmdpbjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWwgPT0gXCJudW1iZXJcIilcbiAgICAgICAgICAgICAgICB0aGlzLiRwcmludE1hcmdpbkNvbHVtbiA9IHZhbDtcbiAgICAgICAgICAgIHRoaXMuJHNob3dQcmludE1hcmdpbiA9ICEhdmFsO1xuICAgICAgICAgICAgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiRzaG93UHJpbnRNYXJnaW4gJiYgdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW47XG4gICAgICAgIH1cbiAgICB9LFxuICAgIHNob3dHdXR0ZXI6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG93KSB7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXIuc3R5bGUuZGlzcGxheSA9IHNob3cgPyBcImJsb2NrXCIgOiBcIm5vbmVcIjtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfRlVMTCk7XG4gICAgICAgICAgICB0aGlzLm9uR3V0dGVyUmVzaXplKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgZmFkZUZvbGRXaWRnZXRzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykge1xuICAgICAgICAgICAgc2V0Q3NzQ2xhc3ModGhpcy4kZ3V0dGVyLCBcImFjZV9mYWRlLWZvbGQtd2lkZ2V0c1wiLCBzaG93KTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgc2hvd0ZvbGRXaWRnZXRzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykgeyB0aGlzLiRndXR0ZXJMYXllci5zZXRTaG93Rm9sZFdpZGdldHMoc2hvdykgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBzaG93TGluZU51bWJlcnM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG93KSB7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5zZXRTaG93TGluZU51bWJlcnMoc2hvdyk7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX0dVVFRFUik7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgZGlzcGxheUluZGVudEd1aWRlczoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3cpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiR0ZXh0TGF5ZXIuc2V0RGlzcGxheUluZGVudEd1aWRlcyhzaG93KSlcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX1RFWFQpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGhpZ2hsaWdodEd1dHRlckxpbmU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG91bGRIaWdobGlnaHQpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodCkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQgPSBjcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuY2xhc3NOYW1lID0gXCJhY2VfZ3V0dGVyLWFjdGl2ZS1saW5lXCI7XG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyLmFwcGVuZENoaWxkKHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodC5zdHlsZS5kaXNwbGF5ID0gc2hvdWxkSGlnaGxpZ2h0ID8gXCJcIiA6IFwibm9uZVwiO1xuICAgICAgICAgICAgLy8gaWYgY3Vyc29ybGF5ZXIgaGF2ZSBuZXZlciBiZWVuIHVwZGF0ZWQgdGhlcmUncyBub3RoaW5nIG9uIHNjcmVlbiB0byB1cGRhdGVcbiAgICAgICAgICAgIGlmICh0aGlzLiRjdXJzb3JMYXllci4kcGl4ZWxQb3MpXG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlLFxuICAgICAgICB2YWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgaFNjcm9sbEJhckFsd2F5c1Zpc2libGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kaFNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHwgIXRoaXMuJGhvcml6U2Nyb2xsKVxuICAgICAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgdlNjcm9sbEJhckFsd2F5c1Zpc2libGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kdlNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHwgIXRoaXMuJHZTY3JvbGwpXG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9TQ1JPTEwpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBmb250U2l6ZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNpemUpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygc2l6ZSA9PSBcIm51bWJlclwiKVxuICAgICAgICAgICAgICAgIHNpemUgPSBzaXplICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5jb250YWluZXIuc3R5bGUuZm9udFNpemUgPSBzaXplO1xuICAgICAgICAgICAgdGhpcy51cGRhdGVGb250U2l6ZSgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IDEyXG4gICAgfSxcbiAgICBmb250RmFtaWx5OiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdGhpcy5jb250YWluZXIuc3R5bGUuZm9udEZhbWlseSA9IG5hbWU7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUZvbnRTaXplKCk7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIG1heExpbmVzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUZ1bGwoKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgbWluTGluZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlRnVsbCgpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBzY3JvbGxQYXN0RW5kOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB2YWwgPSArdmFsIHx8IDA7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2Nyb2xsUGFzdEVuZCA9PSB2YWwpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdGhpcy4kc2Nyb2xsUGFzdEVuZCA9IHZhbDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiAwLFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICBmaXhlZFdpZHRoR3V0dGVyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci4kZml4ZWRXaWR0aCA9ICEhdmFsO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9HVVRURVIpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICB0aGVtZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLnNldFRoZW1lKHZhbCkgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuJHRoZW1lSWQgfHwgdGhpcy50aGVtZTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcIi4vdGhlbWUvdGV4dG1hdGVcIixcbiAgICAgICAgaGFuZGxlc1NldDogdHJ1ZVxuICAgIH1cbn0pO1xuIl19