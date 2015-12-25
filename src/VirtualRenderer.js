"use strict";
import { addCssClass, appendHTMLLinkElement, createElement, ensureHTMLStyleElement, removeCssClass, setCssClass } from "./lib/dom";
import { defineOptions, resetOptions } from "./config";
import { isOldIE } from "./lib/useragent";
import Gutter from "./layer/Gutter";
import Marker from "./layer/Marker";
import Text from "./layer/Text";
import Cursor from "./layer/Cursor";
import VScrollBar from "./VScrollBar";
import HScrollBar from "./HScrollBar";
import RenderLoop from "./RenderLoop";
import FontMetrics from "./layer/FontMetrics";
import EventEmitterClass from "./lib/EventEmitterClass";
import ThemeLink from './ThemeLink';
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
function changesToString(changes) {
    var a = "";
    if (changes & CHANGE_CURSOR)
        a += " cursor";
    if (changes & CHANGE_MARKER)
        a += " marker";
    if (changes & CHANGE_GUTTER)
        a += " gutter";
    if (changes & CHANGE_SCROLL)
        a += " scroll";
    if (changes & CHANGE_LINES)
        a += " lines";
    if (changes & CHANGE_TEXT)
        a += " text";
    if (changes & CHANGE_SIZE)
        a += " size";
    if (changes & CHANGE_MARKER_BACK)
        a += " marker_back";
    if (changes & CHANGE_MARKER_FRONT)
        a += " marker_front";
    if (changes & CHANGE_FULL)
        a += " full";
    if (changes & CHANGE_H_SCROLL)
        a += " h_scroll";
    return a.trim();
}
export default class VirtualRenderer {
    constructor(container) {
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
        this.eventBus = new EventEmitterClass(this);
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
            _self.eventBus._signal("changeCharacterSize", event);
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
    }
    on(eventName, callback) {
        this.eventBus.on(eventName, callback, false);
    }
    off(eventName, callback) {
        this.eventBus.off(eventName, callback);
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
        this.$textLayer.updateEolChar();
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
        if (changes) {
            this.eventBus._signal("resize", oldSize);
        }
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
    setShowGutter(showGutter) {
        return this.setOption("showGutter", showGutter);
    }
    getFadeFoldWidgets() {
        return this.getOption("fadeFoldWidgets");
    }
    setFadeFoldWidgets(fadeFoldWidgets) {
        this.setOption("fadeFoldWidgets", fadeFoldWidgets);
    }
    setHighlightGutterLine(highlightGutterLine) {
        this.setOption("highlightGutterLine", highlightGutterLine);
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
        if (!this.$keepTextAreaAtCursor) {
            return;
        }
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
        if (typeof padding !== 'number') {
            throw new TypeError("padding must be a number");
        }
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
    setHScrollBarAlwaysVisible(hScrollBarAlwaysVisible) {
        this.setOption("hScrollBarAlwaysVisible", hScrollBarAlwaysVisible);
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
        this.eventBus._signal("beforeRender");
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
            if (this.$showGutter) {
                this.$gutterLayer.update(config);
            }
            this.$markerBack.update(config);
            this.$markerFront.update(config);
            this.$cursorLayer.update(config);
            this.$moveTextAreaToCursor();
            this.$highlightGutterLine && this.$updateGutterLineHighlight();
            this.eventBus._signal("afterRender");
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
            this.eventBus._signal("afterRender");
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
        this.eventBus._signal("afterRender");
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
            this.eventBus._signal("scrollbarVisibilityChanged");
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
    setTheme(modJs) {
        if (!modJs.cssClass) {
            return;
        }
        ensureHTMLStyleElement(modJs.cssText, modJs.cssClass, this.container.ownerDocument);
        if (this.theme) {
            removeCssClass(this.container, this.theme.cssClass);
        }
        var padding = "padding" in modJs ? modJs.padding : "padding" in (this.theme || {}) ? 4 : this.$padding;
        if (this.$padding && padding != this.$padding) {
            this.setPadding(padding);
        }
        this.theme = modJs;
        this.addCssClass(modJs.cssClass);
        this.setCssClass("ace_dark", modJs.isDark);
        if (this.$size) {
            this.$size.width = 0;
            this.$updateSizeAsync();
        }
        this.eventBus._emit('themeLoaded', { theme: modJs });
    }
    addCssClass(cssClass) {
        addCssClass(this.container, cssClass);
    }
    setCssClass(className, include) {
        setCssClass(this.container, className, include);
    }
    importThemeLink(themeName) {
        if (!themeName || typeof themeName === "string") {
            themeName = themeName || this.getOption("theme").initialValue;
        }
        var _self = this;
        this.$themeId = themeName;
        _self.eventBus._emit('themeChange', { theme: themeName });
        return new Promise(function (success, fail) {
            System.import(themeName)
                .then(function (m) {
                var isDark = m.isDark;
                var id = m.cssClass;
                var href = m.cssName;
                var padding = (typeof m.padding === 'number') ? m.padding : 0;
                var theme = new ThemeLink(isDark, id, 'stylesheet', 'text/css', href, padding);
                success(theme);
            })
                .catch(function (reason) {
                console.warn(`${reason}`);
                fail(reason);
            });
        });
    }
    setThemeCss(cssClass, href) {
        appendHTMLLinkElement(cssClass, 'stylesheet', 'text/css', href, document);
        this.addCssClass(cssClass);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlydHVhbFJlbmRlcmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiVmlydHVhbFJlbmRlcmVyLnRzIl0sIm5hbWVzIjpbImNoYW5nZXNUb1N0cmluZyIsIlZpcnR1YWxSZW5kZXJlciIsIlZpcnR1YWxSZW5kZXJlci5jb25zdHJ1Y3RvciIsIlZpcnR1YWxSZW5kZXJlci5vbiIsIlZpcnR1YWxSZW5kZXJlci5vZmYiLCJWaXJ0dWFsUmVuZGVyZXIubWF4TGluZXMiLCJWaXJ0dWFsUmVuZGVyZXIua2VlcFRleHRBcmVhQXRDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0RGVmYXVsdEN1cnNvclN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEN1cnNvckxheWVyT2ZmIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUNoYXJhY3RlclNpemUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2Vzc2lvbiIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVMaW5lcyIsIlZpcnR1YWxSZW5kZXJlci5vbkNoYW5nZU5ld0xpbmVNb2RlIiwiVmlydHVhbFJlbmRlcmVyLm9uQ2hhbmdlVGFiU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVUZXh0IiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUZ1bGwiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlRm9udFNpemUiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNpemVBc3luYyIsIlZpcnR1YWxSZW5kZXJlci5vblJlc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci4kdXBkYXRlQ2FjaGVkU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5vbkd1dHRlclJlc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5hZGp1c3RXcmFwTGltaXQiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0QW5pbWF0ZWRTY3JvbGwiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0QW5pbWF0ZWRTY3JvbGwiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2hvd0ludmlzaWJsZXMiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2hvd0ludmlzaWJsZXMiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0RGlzcGxheUluZGVudEd1aWRlcyIsIlZpcnR1YWxSZW5kZXJlci5zZXREaXNwbGF5SW5kZW50R3VpZGVzIiwiVmlydHVhbFJlbmRlcmVyLnNldFNob3dQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRTaG93UHJpbnRNYXJnaW4iLCJWaXJ0dWFsUmVuZGVyZXIuc2V0UHJpbnRNYXJnaW5Db2x1bW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0UHJpbnRNYXJnaW5Db2x1bW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2hvd0d1dHRlciIsIlZpcnR1YWxSZW5kZXJlci5zZXRTaG93R3V0dGVyIiwiVmlydHVhbFJlbmRlcmVyLmdldEZhZGVGb2xkV2lkZ2V0cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRGYWRlRm9sZFdpZGdldHMiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0SGlnaGxpZ2h0R3V0dGVyTGluZSIsIlZpcnR1YWxSZW5kZXJlci5nZXRIaWdobGlnaHRHdXR0ZXJMaW5lIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0IiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRDb250YWluZXJFbGVtZW50IiwiVmlydHVhbFJlbmRlcmVyLmdldE1vdXNlRXZlbnRUYXJnZXQiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0VGV4dEFyZWFDb250YWluZXIiLCJWaXJ0dWFsUmVuZGVyZXIuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLmdldEZpcnN0VmlzaWJsZVJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRGaXJzdEZ1bGx5VmlzaWJsZVJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRMYXN0RnVsbHlWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLnNldFBhZGRpbmciLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2Nyb2xsTWFyZ2luIiwiVmlydHVhbFJlbmRlcmVyLmdldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLmdldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLnNldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVTY3JvbGxCYXJWIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVTY3JvbGxCYXJIIiwiVmlydHVhbFJlbmRlcmVyLmZyZWV6ZSIsIlZpcnR1YWxSZW5kZXJlci51bmZyZWV6ZSIsIlZpcnR1YWxSZW5kZXJlci4kcmVuZGVyQ2hhbmdlcyIsIlZpcnR1YWxSZW5kZXJlci4kYXV0b3NpemUiLCJWaXJ0dWFsUmVuZGVyZXIuJGNvbXB1dGVMYXllckNvbmZpZyIsIlZpcnR1YWxSZW5kZXJlci4kdXBkYXRlTGluZXMiLCJWaXJ0dWFsUmVuZGVyZXIuJGdldExvbmdlc3RMaW5lIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUZyb250TWFya2VycyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVCYWNrTWFya2VycyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVCcmVha3BvaW50cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRBbm5vdGF0aW9ucyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuaGlkZUN1cnNvciIsIlZpcnR1YWxSZW5kZXJlci5zaG93Q3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFNlbGVjdGlvbkludG9WaWV3IiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbFRvcCIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxMZWZ0IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbFRvcFJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxCb3R0b21Sb3ciLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9Sb3ciLCJWaXJ0dWFsUmVuZGVyZXIuYWxpZ25DdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuJGNhbGNTdGVwcyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb0xpbmUiLCJWaXJ0dWFsUmVuZGVyZXIuYW5pbWF0ZVNjcm9sbGluZyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb1kiLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9YIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbEJ5IiwiVmlydHVhbFJlbmRlcmVyLmlzU2Nyb2xsYWJsZUJ5IiwiVmlydHVhbFJlbmRlcmVyLnBpeGVsVG9TY3JlZW5Db29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci50ZXh0VG9TY3JlZW5Db29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci52aXN1YWxpemVGb2N1cyIsIlZpcnR1YWxSZW5kZXJlci52aXN1YWxpemVCbHVyIiwiVmlydHVhbFJlbmRlcmVyLnNob3dDb21wb3NpdGlvbiIsIlZpcnR1YWxSZW5kZXJlci5zZXRDb21wb3NpdGlvblRleHQiLCJWaXJ0dWFsUmVuZGVyZXIuaGlkZUNvbXBvc2l0aW9uIiwiVmlydHVhbFJlbmRlcmVyLnNldFRoZW1lIiwiVmlydHVhbFJlbmRlcmVyLmFkZENzc0NsYXNzIiwiVmlydHVhbFJlbmRlcmVyLnNldENzc0NsYXNzIiwiVmlydHVhbFJlbmRlcmVyLmltcG9ydFRoZW1lTGluayIsIlZpcnR1YWxSZW5kZXJlci5zZXRUaGVtZUNzcyIsIlZpcnR1YWxSZW5kZXJlci5nZXRUaGVtZSIsIlZpcnR1YWxSZW5kZXJlci5zZXRTdHlsZSIsIlZpcnR1YWxSZW5kZXJlci51bnNldFN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEN1cnNvclN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldE1vdXNlQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLmRlc3Ryb3kiXSwibWFwcGluZ3MiOiJBQW9EQSxZQUFZLENBQUM7T0FFTixFQUFDLFdBQVcsRUFBRSxxQkFBcUIsRUFBRSxhQUFhLEVBQUUsc0JBQXNCLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBQyxNQUFNLFdBQVc7T0FDekgsRUFBQyxhQUFhLEVBQWMsWUFBWSxFQUFDLE1BQU0sVUFBVTtPQUN6RCxFQUFDLE9BQU8sRUFBQyxNQUFNLGlCQUFpQjtPQUVoQyxNQUFNLE1BQU0sZ0JBQWdCO09BQzVCLE1BQU0sTUFBTSxnQkFBZ0I7T0FDNUIsSUFBSSxNQUFNLGNBQWM7T0FDeEIsTUFBTSxNQUFNLGdCQUFnQjtPQUM1QixVQUFVLE1BQU0sY0FBYztPQUM5QixVQUFVLE1BQU0sY0FBYztPQUM5QixVQUFVLE1BQU0sY0FBYztPQUM5QixXQUFXLE1BQU0scUJBQXFCO09BQ3RDLGlCQUFpQixNQUFNLHlCQUF5QjtPQUtoRCxTQUFTLE1BQU0sYUFBYTtBQU9uQyxJQUFJLGFBQWEsR0FBRyxDQUFDLENBQUM7QUFDdEIsSUFBSSxhQUFhLEdBQUcsQ0FBQyxDQUFDO0FBQ3RCLElBQUksYUFBYSxHQUFHLENBQUMsQ0FBQztBQUN0QixJQUFJLGFBQWEsR0FBRyxDQUFDLENBQUM7QUFDdEIsSUFBSSxZQUFZLEdBQUcsRUFBRSxDQUFDO0FBQ3RCLElBQUksV0FBVyxHQUFHLEVBQUUsQ0FBQztBQUNyQixJQUFJLFdBQVcsR0FBRyxFQUFFLENBQUM7QUFDckIsSUFBSSxrQkFBa0IsR0FBRyxHQUFHLENBQUM7QUFDN0IsSUFBSSxtQkFBbUIsR0FBRyxHQUFHLENBQUM7QUFDOUIsSUFBSSxXQUFXLEdBQUcsR0FBRyxDQUFDO0FBQ3RCLElBQUksZUFBZSxHQUFHLElBQUksQ0FBQztBQUczQix5QkFBeUIsT0FBZTtJQUNwQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQUE7SUFDVkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsR0FBR0EsYUFBYUEsQ0FBQ0E7UUFBQ0EsQ0FBQ0EsSUFBSUEsU0FBU0EsQ0FBQ0E7SUFDNUNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEdBQUdBLGFBQWFBLENBQUNBO1FBQUNBLENBQUNBLElBQUlBLFNBQVNBLENBQUNBO0lBQzVDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxHQUFHQSxhQUFhQSxDQUFDQTtRQUFDQSxDQUFDQSxJQUFJQSxTQUFTQSxDQUFDQTtJQUM1Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsR0FBR0EsYUFBYUEsQ0FBQ0E7UUFBQ0EsQ0FBQ0EsSUFBSUEsU0FBU0EsQ0FBQ0E7SUFDNUNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEdBQUdBLFlBQVlBLENBQUNBO1FBQUNBLENBQUNBLElBQUlBLFFBQVFBLENBQUNBO0lBQzFDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxHQUFHQSxXQUFXQSxDQUFDQTtRQUFDQSxDQUFDQSxJQUFJQSxPQUFPQSxDQUFDQTtJQUN4Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsR0FBR0EsV0FBV0EsQ0FBQ0E7UUFBQ0EsQ0FBQ0EsSUFBSUEsT0FBT0EsQ0FBQ0E7SUFDeENBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEdBQUdBLGtCQUFrQkEsQ0FBQ0E7UUFBQ0EsQ0FBQ0EsSUFBSUEsY0FBY0EsQ0FBQ0E7SUFDdERBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEdBQUdBLG1CQUFtQkEsQ0FBQ0E7UUFBQ0EsQ0FBQ0EsSUFBSUEsZUFBZUEsQ0FBQ0E7SUFDeERBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEdBQUdBLFdBQVdBLENBQUNBO1FBQUNBLENBQUNBLElBQUlBLE9BQU9BLENBQUNBO0lBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxHQUFHQSxlQUFlQSxDQUFDQTtRQUFDQSxDQUFDQSxJQUFJQSxXQUFXQSxDQUFDQTtJQUNoREEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7QUFDcEJBLENBQUNBO0FBT0Q7SUFtSElDLFlBQVlBLFNBQXNCQTtRQWhIM0JDLGVBQVVBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2ZBLGNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2RBLGdCQUFXQSxHQUFHQTtZQUNqQkEsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDUkEsT0FBT0EsRUFBRUEsQ0FBQ0E7WUFDVkEsUUFBUUEsRUFBRUEsQ0FBQ0E7WUFDWEEsY0FBY0EsRUFBRUEsQ0FBQ0E7WUFDakJBLE9BQU9BLEVBQUVBLENBQUNBO1lBQ1ZBLFVBQVVBLEVBQUVBLENBQUNBO1lBQ2JBLGNBQWNBLEVBQUVBLENBQUNBO1lBQ2pCQSxTQUFTQSxFQUFFQSxDQUFDQTtZQUNaQSxTQUFTQSxFQUFFQSxDQUFDQTtZQUNaQSxNQUFNQSxFQUFFQSxDQUFDQTtZQUNUQSxNQUFNQSxFQUFFQSxDQUFDQTtZQUNUQSxZQUFZQSxFQUFFQSxDQUFDQTtTQUNsQkEsQ0FBQ0E7UUFNS0EsYUFBUUEsR0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDcEJBLFlBQU9BLEdBQUdBLEtBQUtBLENBQUNBO1FBVWhCQSxVQUFLQSxHQUFHQSxDQUFDQSxDQUFDQTtRQWtCVkEsaUJBQVlBLEdBQUdBO1lBQ25CQSxJQUFJQSxFQUFFQSxDQUFDQTtZQUNQQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUNSQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNOQSxNQUFNQSxFQUFFQSxDQUFDQTtZQUNUQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUNKQSxDQUFDQSxFQUFFQSxDQUFDQTtTQUNQQSxDQUFDQTtRQWFNQSxhQUFRQSxHQUFHQSxDQUFDQSxDQUFDQTtRQTJDakJBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLElBQUlBLGlCQUFpQkEsQ0FBa0JBLElBQUlBLENBQUNBLENBQUNBO1FBRTdEQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUVqQkEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsSUFBb0JBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBT25FQSxJQUFJQSxDQUFDQSxxQkFBcUJBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBO1FBRXRDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxZQUFZQSxDQUFDQSxDQUFDQTtRQUUxQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDcENBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLEdBQUdBLFlBQVlBLENBQUNBO1FBQ3RDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUV6Q0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBbUJBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ3JEQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxTQUFTQSxHQUFHQSxjQUFjQSxDQUFDQTtRQUN6Q0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFFMUNBLElBQUlBLENBQUNBLE9BQU9BLEdBQW1CQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNwREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsR0FBR0EsYUFBYUEsQ0FBQ0E7UUFDdkNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBRXhDQSxJQUFJQSxDQUFDQSxZQUFZQSxHQUFHQSxJQUFJQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUM3Q0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsbUJBQW1CQSxFQUFFQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUUxRUEsSUFBSUEsQ0FBQ0EsV0FBV0EsR0FBR0EsSUFBSUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFFNUNBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQ3pEQSxJQUFJQSxDQUFDQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUVoQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsR0FBR0EsSUFBSUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFFN0NBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBRzdDQSxJQUFJQSxDQUFDQSxZQUFZQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUMxQkEsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFFdEJBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQ3ZEQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN2REEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsUUFBUUEsRUFBRUEsVUFBU0EsS0FBS0EsRUFBRUEsU0FBcUJBO1lBQzlELEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztnQkFDMUIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLElBQUksR0FBRyxLQUFLLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BFLENBQUM7UUFDTCxDQUFDLENBQUNBLENBQUNBO1FBQ0hBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLEVBQUVBLENBQUNBLFFBQVFBLEVBQUVBLFVBQVNBLEtBQUtBLEVBQUVBLFNBQXFCQTtZQUM5RCxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7Z0JBQzFCLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN0RSxDQUFDO1FBQ0wsQ0FBQyxDQUFDQSxDQUFDQTtRQUVIQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQTtZQUNiQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNOQSxNQUFNQSxFQUFFQSxDQUFDQTtTQUNaQSxDQUFDQTtRQUVGQSxJQUFJQSxDQUFDQSxZQUFZQSxHQUFHQSxJQUFJQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN6REEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFDbkRBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLEVBQUVBLENBQUNBLHFCQUFxQkEsRUFBRUEsVUFBU0EsS0FBS0EsRUFBRUEsSUFBVUE7WUFDaEUsS0FBSyxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDNUIsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBSS9FLEtBQUssQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLHFCQUFxQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3pELENBQUMsQ0FBQ0EsQ0FBQ0E7UUFFSEEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0E7WUFDVEEsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDUkEsTUFBTUEsRUFBRUEsQ0FBQ0E7WUFDVEEsY0FBY0EsRUFBRUEsQ0FBQ0E7WUFDakJBLGFBQWFBLEVBQUVBLENBQUNBO1lBQ2hCQSxNQUFNQSxFQUFFQSxJQUFJQTtTQUNmQSxDQUFDQTtRQUVGQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxhQUFhQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtRQUN0R0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFFakNBLElBQUlBLENBQUNBLG1CQUFtQkEsRUFBRUEsQ0FBQ0E7UUFDM0JBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ25CQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUl2QkEsQ0FBQ0E7SUFRREQsRUFBRUEsQ0FBQ0EsU0FBaUJBLEVBQUVBLFFBQXNEQTtRQUN4RUUsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsU0FBU0EsRUFBRUEsUUFBUUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7SUFDakRBLENBQUNBO0lBUURGLEdBQUdBLENBQUNBLFNBQWlCQSxFQUFFQSxRQUFzREE7UUFDekVHLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO0lBQzNDQSxDQUFDQTtJQU1ESCxJQUFJQSxRQUFRQSxDQUFDQSxRQUFnQkE7UUFDekJJLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLFFBQVFBLENBQUNBO0lBQzlCQSxDQUFDQTtJQU1ESixJQUFJQSxvQkFBb0JBLENBQUNBLG9CQUE2QkE7UUFDbERLLElBQUlBLENBQUNBLHFCQUFxQkEsR0FBR0Esb0JBQW9CQSxDQUFDQTtJQUN0REEsQ0FBQ0E7SUFRREwscUJBQXFCQTtRQUNqQk0sSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0E7SUFDMUNBLENBQUNBO0lBU0ROLGlCQUFpQkE7UUFDYk8sSUFBSUEsSUFBSUEsR0FBR0EsY0FBYSxDQUFDLENBQUNBO1FBQzFCQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxZQUFZQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN0Q0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsR0FBR0EsR0FBR0EsQ0FBQ0E7SUFDbERBLENBQUNBO0lBTURQLG1CQUFtQkE7UUFFZlEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1REEsSUFBSUEsQ0FBQ0EsZUFBZUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQTtZQUN6REEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLGNBQWNBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0E7UUFDNUZBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLGFBQWFBLEVBQUVBLENBQUNBO1FBQ2hGQSxJQUFJQSxDQUFDQSxrQkFBa0JBLEVBQUVBLENBQUNBO0lBQzlCQSxDQUFDQTtJQVNEUixVQUFVQSxDQUFDQSxPQUFvQkE7UUFDM0JTLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ2ZBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLG1CQUFtQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQTtRQUN4RUEsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsT0FBT0EsQ0FBQ0E7UUFDdkJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ1hBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZEQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNqREEsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDdENBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFVBQVVBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQ3JDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxVQUFVQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUN0Q0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDdENBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLFVBQVVBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQ3BDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtRQUNqQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsZUFBZUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEs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QSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3Q0EsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7WUFDckJBLE9BQU9BLElBQUlBLFdBQVdBLENBQUNBO1lBRXZCQSxJQUFJQSxDQUFDQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7Z0JBQ2xCQSxJQUFJQSxDQUFDQSxjQUFjQSxJQUFJQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUVsREEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFFckVBLE9BQU9BLEdBQUdBLE9BQU9BLEdBQUdBLGFBQWFBLENBQUNBO1FBQ3RDQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQ0EsT0FBT0EsSUFBSUEsV0FBV0EsQ0FBQ0E7WUFDdkJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBO1lBRW5CQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxJQUFJQSxJQUFJQSxDQUFDQTtnQkFDcEJBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFdBQVdBLEdBQUdBLENBQUNBLENBQUNBO1lBRWxFQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxXQUFXQSxDQUFDQTtZQUUvQkEsSUFBSUEsQ0FBQ0Es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QUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3BEQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxxQkFBcUJBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3REQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNQQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNoQkEsQ0FBQ0E7UUFDREEsT0FBT0EsSUFBSUEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLEdBQUdBLENBQUNBLENBQUNBO1lBQ3ZDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUUzQ0EsT0FBT0EsSUFBSUEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFFakNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3RDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNyQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsYUFBYUEsR0FBR0EsT0FBT0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDdkZBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO0lBQ3BGQSxDQUFDQTtJQVFEMUMsa0JBQWtCQTtRQUNkMkMsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7SUFDckNBLENBQUNBO0lBT0QzQyx1QkFBdUJBO1FBQ25CNEMsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDL0VBLENBQUNBO0lBT0Q1QyxzQkFBc0JBO1FBQ2xCNkMsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDMUdBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFFBQVFBLEdBQUdBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBO0lBQ2pEQSxDQUFDQTtJQVFEN0MsaUJBQWlCQTtRQUNiOEMsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7SUFDcENBLENBQUNBO0lBU0Q5QyxVQUFVQSxDQUFDQSxPQUFlQTtRQUN0QitDLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLE9BQU9BLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQzlCQSxNQUFNQSxJQUFJQSxTQUFTQSxDQUFDQSwwQkFBMEJBLENBQUNBLENBQUNBO1FBQ3BEQSxD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QUNBLE9BQWVBLEVBQUVBLEtBQWNBO1FBRWxEeUQsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaEJBLE9BQU9BLElBQUlBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBO1lBQ3pCQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN0QkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsV0FBV0EsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekZBLElBQUlBLENBQUNBLFFBQVFBLElBQUlBLE9BQU9BLENBQUNBO1lBQ3pCQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsSUFBSUEsQ0FBQ0EsUUFBUUEsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDekJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQy9CQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQkEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsbUJBQW1CQSxFQUFFQSxDQUFDQTtRQUMxQ0EsQ0FBQ0E7UUFLREEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0E7UUFFdENBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBO1FBRTlCQSxFQUFFQSxDQUFDQSxDQUFD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LEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBRTNGQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxFQUNqRkEsV0FBV0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFdEZBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzNEQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNwRkEsSUFBSUEsT0FBT0EsR0FBR0EsUUFBUUEsR0FBR0EsU0FBU0EsQ0FBQ0E7UUFHbkNBLElBQUlBLGNBQWNBLEVBQUVBLGNBQWNBLENBQUNBO1FBQ25DQSxJQUFJQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtRQUNqQ0EsUUFBUUEsR0FBR0EsT0FBT0EsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUlwREEs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O1FBRTFEQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBRXJGQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxHQUFHQSxTQUFTQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ1BBLEdBQUdBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBLENBQUNBO1lBQzlDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDVkEsR0FBR0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDakNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ25DQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxHQUFHQSxZQUFZQSxHQUFHQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ1BBLEdBQUdBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBLENBQUNBO1lBQzlDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQTtRQUNqRkEsQ0FBQ0E7UUFFREEsSUFBSUEsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFB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QU1BLEVBQUVBLEdBQUdBLEVBQUVBLElBQUlBLEVBQUVBLE1BQU1BLEdBQUdBLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBO0lBQ3RFQSxDQUFDQTtJQUVEckYsdUJBQXVCQSxDQUFDQSxPQUFlQSxFQUFFQSxPQUFlQTtRQUNwRHNGLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLHFCQUFxQkEsRUFBRUEsQ0FBQ0E7UUFFdERBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLFNBQVNBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBO1FBRTVHQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtRQUV2RUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUMzRUEsQ0FBQ0E7SUFRRHRGLHVCQUF1QkEsQ0FBQ0EsR0FBV0EsRUFBRUEsTUFBY0E7UUFDL0N1RixJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxxQkFBcUJBLEVBQUVBLENBQUNBO1FBQ3REQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSx3QkFBd0JBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBRTdEQSxJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxD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YixHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO1lBQ2hCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLElBQUksR0FBRyxDQUFDO2dCQUMzQixNQUFNLENBQUM7WUFDWCxJQUFJLENBQUMsY0FBYyxHQUFHLEdBQUcsQ0FBQztZQUMxQixJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDNUMsQ0FBQztRQUNELFlBQVksRUFBRSxDQUFDO1FBQ2YsVUFBVSxFQUFFLElBQUk7S0FDbkI7SUFDRCxnQkFBZ0IsRUFBRTtRQUNkLEdBQUcsRUFBRSxVQUFTLEdBQUc7WUFDYixJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDO1lBQ3RDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUM1QyxDQUFDO0tBQ0o7SUFDRCxLQUFLLEVBQUU7UUFDSCxHQUFHLEVBQUUsVUFBUyxHQUFHLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQSxDQUFDLENBQUM7UUFDekMsR0FBRyxFQUFFLGNBQWEsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDdkQsWUFBWSxFQUFFLGtCQUFrQjtRQUNoQyxVQUFVLEVBQUUsSUFBSTtLQUNuQjtDQUNKLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNC0yMDE2IERhdmlkIEdlbyBIb2xtZXMgPGRhdmlkLmdlby5ob2xtZXNAZ21haWwuY29tPlxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGxcbiAqIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuICogU09GVFdBUkUuXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cInVzZSBzdHJpY3RcIjtcblxuaW1wb3J0IHthZGRDc3NDbGFzcywgYXBwZW5kSFRNTExpbmtFbGVtZW50LCBjcmVhdGVFbGVtZW50LCBlbnN1cmVIVE1MU3R5bGVFbGVtZW50LCByZW1vdmVDc3NDbGFzcywgc2V0Q3NzQ2xhc3N9IGZyb20gXCIuL2xpYi9kb21cIjtcbmltcG9ydCB7ZGVmaW5lT3B0aW9ucywgbG9hZE1vZHVsZSwgcmVzZXRPcHRpb25zfSBmcm9tIFwiLi9jb25maWdcIjtcbmltcG9ydCB7aXNPbGRJRX0gZnJvbSBcIi4vbGliL3VzZXJhZ2VudFwiO1xuaW1wb3J0IEFubm90YXRpb24gZnJvbSAnLi9Bbm5vdGF0aW9uJztcbmltcG9ydCBHdXR0ZXIgZnJvbSBcIi4vbGF5ZXIvR3V0dGVyXCI7XG5pbXBvcnQgTWFya2VyIGZyb20gXCIuL2xheWVyL01hcmtlclwiO1xuaW1wb3J0IFRleHQgZnJvbSBcIi4vbGF5ZXIvVGV4dFwiO1xuaW1wb3J0IEN1cnNvciBmcm9tIFwiLi9sYXllci9DdXJzb3JcIjtcbmltcG9ydCBWU2Nyb2xsQmFyIGZyb20gXCIuL1ZTY3JvbGxCYXJcIjtcbmltcG9ydCBIU2Nyb2xsQmFyIGZyb20gXCIuL0hTY3JvbGxCYXJcIjtcbmltcG9ydCBSZW5kZXJMb29wIGZyb20gXCIuL1JlbmRlckxvb3BcIjtcbmltcG9ydCBGb250TWV0cmljcyBmcm9tIFwiLi9sYXllci9Gb250TWV0cmljc1wiO1xuaW1wb3J0IEV2ZW50RW1pdHRlckNsYXNzIGZyb20gXCIuL2xpYi9FdmVudEVtaXR0ZXJDbGFzc1wiO1xuaW1wb3J0IEVkaXRTZXNzaW9uIGZyb20gJy4vRWRpdFNlc3Npb24nO1xuaW1wb3J0IEV2ZW50QnVzIGZyb20gJy4vRXZlbnRCdXMnO1xuaW1wb3J0IE9wdGlvbnNQcm92aWRlciBmcm9tIFwiLi9PcHRpb25zUHJvdmlkZXJcIjtcbmltcG9ydCBQb3NpdGlvbiBmcm9tICcuL1Bvc2l0aW9uJztcbmltcG9ydCBUaGVtZUxpbmsgZnJvbSAnLi9UaGVtZUxpbmsnO1xuaW1wb3J0IEVkaXRvclJlbmRlcmVyIGZyb20gJy4vRWRpdG9yUmVuZGVyZXInO1xuXG4vLyBGSVhNRVxuLy8gaW1wb3J0IGVkaXRvckNzcyA9IHJlcXVpcmUoXCIuL3JlcXVpcmVqcy90ZXh0IS4vY3NzL2VkaXRvci5jc3NcIik7XG4vLyBlbnN1cmVIVE1MU3R5bGVFbGVtZW50KGVkaXRvckNzcywgXCJhY2VfZWRpdG9yXCIpO1xuXG52YXIgQ0hBTkdFX0NVUlNPUiA9IDE7XG52YXIgQ0hBTkdFX01BUktFUiA9IDI7XG52YXIgQ0hBTkdFX0dVVFRFUiA9IDQ7XG52YXIgQ0hBTkdFX1NDUk9MTCA9IDg7XG52YXIgQ0hBTkdFX0xJTkVTID0gMTY7XG52YXIgQ0hBTkdFX1RFWFQgPSAzMjtcbnZhciBDSEFOR0VfU0laRSA9IDY0O1xudmFyIENIQU5HRV9NQVJLRVJfQkFDSyA9IDEyODtcbnZhciBDSEFOR0VfTUFSS0VSX0ZST05UID0gMjU2O1xudmFyIENIQU5HRV9GVUxMID0gNTEyO1xudmFyIENIQU5HRV9IX1NDUk9MTCA9IDEwMjQ7XG5cbi8vIFVzZWZ1bCBmb3IgZGVidWdnaW5nLi4uXG5mdW5jdGlvbiBjaGFuZ2VzVG9TdHJpbmcoY2hhbmdlczogbnVtYmVyKTogc3RyaW5nIHtcbiAgICB2YXIgYSA9IFwiXCJcbiAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9DVVJTT1IpIGEgKz0gXCIgY3Vyc29yXCI7XG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfTUFSS0VSKSBhICs9IFwiIG1hcmtlclwiO1xuICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0dVVFRFUikgYSArPSBcIiBndXR0ZXJcIjtcbiAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9TQ1JPTEwpIGEgKz0gXCIgc2Nyb2xsXCI7XG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfTElORVMpIGEgKz0gXCIgbGluZXNcIjtcbiAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9URVhUKSBhICs9IFwiIHRleHRcIjtcbiAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9TSVpFKSBhICs9IFwiIHNpemVcIjtcbiAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9NQVJLRVJfQkFDSykgYSArPSBcIiBtYXJrZXJfYmFja1wiO1xuICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX01BUktFUl9GUk9OVCkgYSArPSBcIiBtYXJrZXJfZnJvbnRcIjtcbiAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9GVUxMKSBhICs9IFwiIGZ1bGxcIjtcbiAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9IX1NDUk9MTCkgYSArPSBcIiBoX3Njcm9sbFwiO1xuICAgIHJldHVybiBhLnRyaW0oKTtcbn1cblxuLyoqXG4gKiBUaGUgY2xhc3MgdGhhdCBpcyByZXNwb25zaWJsZSBmb3IgZHJhd2luZyBldmVyeXRoaW5nIHlvdSBzZWUgb24gdGhlIHNjcmVlbiFcbiAqXG4gKiBAY2xhc3MgVmlydHVhbFJlbmRlcmVyXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFZpcnR1YWxSZW5kZXJlciBpbXBsZW1lbnRzIEV2ZW50QnVzPFZpcnR1YWxSZW5kZXJlcj4sIEVkaXRvclJlbmRlcmVyLCBPcHRpb25zUHJvdmlkZXIge1xuICAgIHB1YmxpYyB0ZXh0YXJlYTogSFRNTFRleHRBcmVhRWxlbWVudDtcbiAgICBwdWJsaWMgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcbiAgICBwdWJsaWMgc2Nyb2xsTGVmdCA9IDA7XG4gICAgcHVibGljIHNjcm9sbFRvcCA9IDA7XG4gICAgcHVibGljIGxheWVyQ29uZmlnID0ge1xuICAgICAgICB3aWR0aDogMSxcbiAgICAgICAgcGFkZGluZzogMCxcbiAgICAgICAgZmlyc3RSb3c6IDAsXG4gICAgICAgIGZpcnN0Um93U2NyZWVuOiAwLFxuICAgICAgICBsYXN0Um93OiAwLFxuICAgICAgICBsaW5lSGVpZ2h0OiAwLFxuICAgICAgICBjaGFyYWN0ZXJXaWR0aDogMCxcbiAgICAgICAgbWluSGVpZ2h0OiAxLFxuICAgICAgICBtYXhIZWlnaHQ6IDEsXG4gICAgICAgIG9mZnNldDogMCxcbiAgICAgICAgaGVpZ2h0OiAxLFxuICAgICAgICBndXR0ZXJPZmZzZXQ6IDFcbiAgICB9O1xuICAgIHB1YmxpYyAkbWF4TGluZXM6IG51bWJlcjtcbiAgICBwdWJsaWMgJG1pbkxpbmVzOiBudW1iZXI7XG4gICAgcHVibGljICRjdXJzb3JMYXllcjogQ3Vyc29yO1xuICAgIHB1YmxpYyAkZ3V0dGVyTGF5ZXI6IEd1dHRlcjtcblxuICAgIHB1YmxpYyAkcGFkZGluZzogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlICRmcm96ZW4gPSBmYWxzZTtcblxuICAgIC8vIFRoZSB0aGVtZUlkIGlzIHdoYXQgaXMgY29tbXVuaWNhdGVkIGluIHRoZSBBUEkuXG4gICAgcHJpdmF0ZSAkdGhlbWVJZDogc3RyaW5nO1xuICAgIC8qKlxuICAgICAqIFRoZSBsb2FkZWQgdGhlbWUgb2JqZWN0LiBUaGlzIGFsbG93cyB1cyB0byByZW1vdmUgYSB0aGVtZS5cbiAgICAgKi9cbiAgICBwcml2YXRlIHRoZW1lOiB7IGNzc0NsYXNzOiBzdHJpbmcgfTtcblxuICAgIHByaXZhdGUgJHRpbWVyO1xuICAgIHByaXZhdGUgU1RFUFMgPSA4O1xuICAgIHB1YmxpYyAka2VlcFRleHRBcmVhQXRDdXJzb3I6IGJvb2xlYW47XG4gICAgcHVibGljICRndXR0ZXI7XG4gICAgcHVibGljIHNjcm9sbGVyOiBIVE1MRGl2RWxlbWVudDtcbiAgICBwdWJsaWMgY29udGVudDogSFRNTERpdkVsZW1lbnQ7XG4gICAgcHVibGljICR0ZXh0TGF5ZXI6IFRleHQ7XG4gICAgcHJpdmF0ZSAkbWFya2VyRnJvbnQ6IE1hcmtlcjtcbiAgICBwcml2YXRlICRtYXJrZXJCYWNrOiBNYXJrZXI7XG4gICAgcHJpdmF0ZSBjYW52YXM6IEhUTUxEaXZFbGVtZW50O1xuICAgIHByaXZhdGUgJGhvcml6U2Nyb2xsOiBib29sZWFuO1xuICAgIHByaXZhdGUgJHZTY3JvbGw7XG4gICAgcHVibGljIHNjcm9sbEJhckg6IEhTY3JvbGxCYXI7XG4gICAgcHVibGljIHNjcm9sbEJhclY6IFZTY3JvbGxCYXI7XG4gICAgcHJpdmF0ZSAkc2Nyb2xsQW5pbWF0aW9uOiB7IGZyb206IG51bWJlcjsgdG86IG51bWJlcjsgc3RlcHM6IG51bWJlcltdIH07XG4gICAgcHVibGljICRzY3JvbGxiYXJXaWR0aDogbnVtYmVyO1xuICAgIHByaXZhdGUgc2Vzc2lvbjogRWRpdFNlc3Npb247XG4gICAgcHJpdmF0ZSBldmVudEJ1czogRXZlbnRFbWl0dGVyQ2xhc3M8VmlydHVhbFJlbmRlcmVyPjtcblxuICAgIHByaXZhdGUgc2Nyb2xsTWFyZ2luID0ge1xuICAgICAgICBsZWZ0OiAwLFxuICAgICAgICByaWdodDogMCxcbiAgICAgICAgdG9wOiAwLFxuICAgICAgICBib3R0b206IDAsXG4gICAgICAgIHY6IDAsXG4gICAgICAgIGg6IDBcbiAgICB9O1xuXG4gICAgcHJpdmF0ZSAkZm9udE1ldHJpY3M6IEZvbnRNZXRyaWNzO1xuICAgIHByaXZhdGUgJGFsbG93Qm9sZEZvbnRzO1xuICAgIHByaXZhdGUgY3Vyc29yUG9zO1xuXG4gICAgLyoqXG4gICAgICogQSBjYWNoZSBvZiB2YXJpb3VzIHNpemVzIFRCQS5cbiAgICAgKi9cbiAgICBwdWJsaWMgJHNpemU6IHsgaGVpZ2h0OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IHNjcm9sbGVySGVpZ2h0OiBudW1iZXI7IHNjcm9sbGVyV2lkdGg7ICRkaXJ0eTogYm9vbGVhbiB9O1xuXG4gICAgcHJpdmF0ZSAkbG9vcDogUmVuZGVyTG9vcDtcbiAgICBwcml2YXRlICRjaGFuZ2VkTGluZXM7XG4gICAgcHJpdmF0ZSAkY2hhbmdlcyA9IDA7XG4gICAgcHJpdmF0ZSByZXNpemluZztcbiAgICBwcml2YXRlICRndXR0ZXJMaW5lSGlnaGxpZ2h0O1xuICAgIC8vIEZJWE1FOiBXaHkgZG8gd2UgaGF2ZSB0d28/XG4gICAgcHVibGljIGd1dHRlcldpZHRoOiBudW1iZXI7XG4gICAgcHJpdmF0ZSAkZ3V0dGVyV2lkdGg6IG51bWJlcjtcbiAgICBwcml2YXRlICRzaG93UHJpbnRNYXJnaW47XG4gICAgcHJpdmF0ZSAkcHJpbnRNYXJnaW5FbDtcbiAgICBwcml2YXRlIGdldE9wdGlvbjtcbiAgICBwcml2YXRlIHNldE9wdGlvbjtcblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSBjaGFyYWN0ZXJXaWR0aFxuICAgICAqIEB0eXBlIG51bWJlclxuICAgICAqL1xuICAgIHB1YmxpYyBjaGFyYWN0ZXJXaWR0aDogbnVtYmVyO1xuXG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5IGxpbmVIZWlnaHRcbiAgICAgKiBAdHlwZSBudW1iZXJcbiAgICAgKi9cbiAgICBwdWJsaWMgbGluZUhlaWdodDogbnVtYmVyO1xuXG4gICAgcHJpdmF0ZSAkcHJpbnRNYXJnaW5Db2x1bW47XG4gICAgcHJpdmF0ZSAkZXh0cmFIZWlnaHQ7XG4gICAgcHJpdmF0ZSAkY29tcG9zaXRpb246IHsga2VlcFRleHRBcmVhQXRDdXJzb3I6IGJvb2xlYW47IGNzc1RleHQ6IHN0cmluZyB9O1xuICAgIHByaXZhdGUgJGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIHByaXZhdGUgJHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIHByaXZhdGUgJHNob3dHdXR0ZXI7XG4gICAgcHJpdmF0ZSBzaG93SW52aXNpYmxlcztcbiAgICBwcml2YXRlICRhbmltYXRlZFNjcm9sbDogYm9vbGVhbjtcbiAgICBwcml2YXRlICRzY3JvbGxQYXN0RW5kO1xuICAgIHByaXZhdGUgJGhpZ2hsaWdodEd1dHRlckxpbmU7XG4gICAgcHJpdmF0ZSBkZXNpcmVkSGVpZ2h0O1xuXG4gICAgLyoqXG4gICAgICogQ29uc3RydWN0cyBhIG5ldyBgVmlydHVhbFJlbmRlcmVyYCB3aXRoaW4gdGhlIGBjb250YWluZXJgIHNwZWNpZmllZC5cbiAgICAgKlxuICAgICAqIEBjbGFzcyBWaXJ0dWFsUmVuZGVyZXJcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKiBAcGFyYW0gY29udGFpbmVyIHtIVE1MRWxlbWVudH0gVGhlIHJvb3QgZWxlbWVudCBvZiB0aGUgZWRpdG9yLlxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICAgICAgdGhpcy5ldmVudEJ1cyA9IG5ldyBFdmVudEVtaXR0ZXJDbGFzczxWaXJ0dWFsUmVuZGVyZXI+KHRoaXMpO1xuXG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgdGhpcy5jb250YWluZXIgPSBjb250YWluZXIgfHwgPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cbiAgICAgICAgLy8gVE9ETzogdGhpcyBicmVha3MgcmVuZGVyaW5nIGluIENsb3VkOSB3aXRoIG11bHRpcGxlIGFjZSBpbnN0YW5jZXNcbiAgICAgICAgLy8gLy8gSW1wb3J0cyBDU1Mgb25jZSBwZXIgRE9NIGRvY3VtZW50ICgnYWNlX2VkaXRvcicgc2VydmVzIGFzIGFuIGlkZW50aWZpZXIpLlxuICAgICAgICAvLyBlbnN1cmVIVE1MU3R5bGVFbGVtZW50KGVkaXRvckNzcywgXCJhY2VfZWRpdG9yXCIsIGNvbnRhaW5lci5vd25lckRvY3VtZW50KTtcblxuICAgICAgICAvLyBpbiBJRSA8PSA5IHRoZSBuYXRpdmUgY3Vyc29yIGFsd2F5cyBzaGluZXMgdGhyb3VnaFxuICAgICAgICB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9ICFpc09sZElFO1xuXG4gICAgICAgIGFkZENzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBcImFjZV9lZGl0b3JcIik7XG5cbiAgICAgICAgdGhpcy4kZ3V0dGVyID0gY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGhpcy4kZ3V0dGVyLmNsYXNzTmFtZSA9IFwiYWNlX2d1dHRlclwiO1xuICAgICAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLiRndXR0ZXIpO1xuXG4gICAgICAgIHRoaXMuc2Nyb2xsZXIgPSA8SFRNTERpdkVsZW1lbnQ+Y3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGhpcy5zY3JvbGxlci5jbGFzc05hbWUgPSBcImFjZV9zY3JvbGxlclwiO1xuICAgICAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLnNjcm9sbGVyKTtcblxuICAgICAgICB0aGlzLmNvbnRlbnQgPSA8SFRNTERpdkVsZW1lbnQ+Y3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGhpcy5jb250ZW50LmNsYXNzTmFtZSA9IFwiYWNlX2NvbnRlbnRcIjtcbiAgICAgICAgdGhpcy5zY3JvbGxlci5hcHBlbmRDaGlsZCh0aGlzLmNvbnRlbnQpO1xuXG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyID0gbmV3IEd1dHRlcih0aGlzLiRndXR0ZXIpO1xuICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5vbihcImNoYW5nZUd1dHRlcldpZHRoXCIsIHRoaXMub25HdXR0ZXJSZXNpemUuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy4kbWFya2VyQmFjayA9IG5ldyBNYXJrZXIodGhpcy5jb250ZW50KTtcblxuICAgICAgICB2YXIgdGV4dExheWVyID0gdGhpcy4kdGV4dExheWVyID0gbmV3IFRleHQodGhpcy5jb250ZW50KTtcbiAgICAgICAgdGhpcy5jYW52YXMgPSB0ZXh0TGF5ZXIuZWxlbWVudDtcblxuICAgICAgICB0aGlzLiRtYXJrZXJGcm9udCA9IG5ldyBNYXJrZXIodGhpcy5jb250ZW50KTtcblxuICAgICAgICB0aGlzLiRjdXJzb3JMYXllciA9IG5ldyBDdXJzb3IodGhpcy5jb250ZW50KTtcblxuICAgICAgICAvLyBJbmRpY2F0ZXMgd2hldGhlciB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIgaXMgdmlzaWJsZVxuICAgICAgICB0aGlzLiRob3JpelNjcm9sbCA9IGZhbHNlO1xuICAgICAgICB0aGlzLiR2U2Nyb2xsID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5zY3JvbGxCYXJWID0gbmV3IFZTY3JvbGxCYXIodGhpcy5jb250YWluZXIsIHRoaXMpO1xuICAgICAgICB0aGlzLnNjcm9sbEJhckggPSBuZXcgSFNjcm9sbEJhcih0aGlzLmNvbnRhaW5lciwgdGhpcyk7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5vbihcInNjcm9sbFwiLCBmdW5jdGlvbihldmVudCwgc2Nyb2xsQmFyOiBWU2Nyb2xsQmFyKSB7XG4gICAgICAgICAgICBpZiAoIV9zZWxmLiRzY3JvbGxBbmltYXRpb24pIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXNzaW9uLnNldFNjcm9sbFRvcChldmVudC5kYXRhIC0gX3NlbGYuc2Nyb2xsTWFyZ2luLnRvcCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnNjcm9sbEJhckgub24oXCJzY3JvbGxcIiwgZnVuY3Rpb24oZXZlbnQsIHNjcm9sbEJhcjogSFNjcm9sbEJhcikge1xuICAgICAgICAgICAgaWYgKCFfc2VsZi4kc2Nyb2xsQW5pbWF0aW9uKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KGV2ZW50LmRhdGEgLSBfc2VsZi5zY3JvbGxNYXJnaW4ubGVmdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuY3Vyc29yUG9zID0ge1xuICAgICAgICAgICAgcm93OiAwLFxuICAgICAgICAgICAgY29sdW1uOiAwXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy4kZm9udE1ldHJpY3MgPSBuZXcgRm9udE1ldHJpY3ModGhpcy5jb250YWluZXIsIDUwMCk7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci4kc2V0Rm9udE1ldHJpY3ModGhpcy4kZm9udE1ldHJpY3MpO1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIub24oXCJjaGFuZ2VDaGFyYWN0ZXJTaXplXCIsIGZ1bmN0aW9uKGV2ZW50LCB0ZXh0OiBUZXh0KSB7XG4gICAgICAgICAgICBfc2VsZi51cGRhdGVDaGFyYWN0ZXJTaXplKCk7XG4gICAgICAgICAgICBfc2VsZi5vblJlc2l6ZSh0cnVlLCBfc2VsZi5ndXR0ZXJXaWR0aCwgX3NlbGYuJHNpemUud2lkdGgsIF9zZWxmLiRzaXplLmhlaWdodCk7XG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIEBldmVudCBjaGFuZ2VDaGFyYWN0ZXJTaXplXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIF9zZWxmLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VDaGFyYWN0ZXJTaXplXCIsIGV2ZW50KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy4kc2l6ZSA9IHtcbiAgICAgICAgICAgIHdpZHRoOiAwLFxuICAgICAgICAgICAgaGVpZ2h0OiAwLFxuICAgICAgICAgICAgc2Nyb2xsZXJIZWlnaHQ6IDAsXG4gICAgICAgICAgICBzY3JvbGxlcldpZHRoOiAwLFxuICAgICAgICAgICAgJGRpcnR5OiB0cnVlXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy4kbG9vcCA9IG5ldyBSZW5kZXJMb29wKHRoaXMuJHJlbmRlckNoYW5nZXMuYmluZCh0aGlzKSwgdGhpcy5jb250YWluZXIub3duZXJEb2N1bWVudC5kZWZhdWx0Vmlldyk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuXG4gICAgICAgIHRoaXMudXBkYXRlQ2hhcmFjdGVyU2l6ZSgpO1xuICAgICAgICB0aGlzLnNldFBhZGRpbmcoNCk7XG4gICAgICAgIHJlc2V0T3B0aW9ucyh0aGlzKTtcbiAgICAgICAgLy8gRklYTUU6IFRoaXMgd2FzIGEgc2lnbmFsIHRvIGEgZ2xvYmFsIGNvbmZpZyBvYmplY3QuXG4gICAgICAgIC8vIFdoeSBkbyBFZGl0b3IgYW5kIEVkaXRTZXNzaW9uIHNpZ25hbCB3aGlsZSB0aGlzIGVtaXRzP1xuICAgICAgICAvL19lbWl0KFwicmVuZGVyZXJcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBvblxuICAgICAqIEBwYXJhbSBldmVudE5hbWUge3N0cmluZ31cbiAgICAgKiBAcGFyYW0gY2FsbGJhY2sgeyhldmVudCwgc291cmNlOiBWaXJ0dWFsUmVuZGVyZXIpID0+IGFueX1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIG9uKGV2ZW50TmFtZTogc3RyaW5nLCBjYWxsYmFjazogKGV2ZW50OiBhbnksIHNvdXJjZTogVmlydHVhbFJlbmRlcmVyKSA9PiBhbnkpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5vbihldmVudE5hbWUsIGNhbGxiYWNrLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBvZmZcbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIHtzdHJpbmd9XG4gICAgICogQHBhcmFtIGNhbGxiYWNrIHsoZXZlbnQsIHNvdXJjZTogVmlydHVhbFJlbmRlcmVyKSA9PiBhbnl9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBvZmYoZXZlbnROYW1lOiBzdHJpbmcsIGNhbGxiYWNrOiAoZXZlbnQ6IGFueSwgc291cmNlOiBWaXJ0dWFsUmVuZGVyZXIpID0+IGFueSk6IHZvaWQge1xuICAgICAgICB0aGlzLmV2ZW50QnVzLm9mZihldmVudE5hbWUsIGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkgbWF4TGluZXNcbiAgICAgKiBAdHlwZSBudW1iZXJcbiAgICAgKi9cbiAgICBzZXQgbWF4TGluZXMobWF4TGluZXM6IG51bWJlcikge1xuICAgICAgICB0aGlzLiRtYXhMaW5lcyA9IG1heExpbmVzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSBrZWVwVGV4dEFyZWFBdEN1cnNvclxuICAgICAqIEB0eXBlIGJvb2xlYW5cbiAgICAgKi9cbiAgICBzZXQga2VlcFRleHRBcmVhQXRDdXJzb3Ioa2VlcFRleHRBcmVhQXRDdXJzb3I6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSBrZWVwVGV4dEFyZWFBdEN1cnNvcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSA8Y29kZT5zdHlsZTwvY29kZT4gcHJvcGVydHkgb2YgdGhlIGNvbnRlbnQgdG8gXCJkZWZhdWx0XCIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldERlZmF1bHRDdXJzb3JTdHlsZVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0RGVmYXVsdEN1cnNvclN0eWxlKCk6IHZvaWQge1xuICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUuY3Vyc29yID0gXCJkZWZhdWx0XCI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgPGNvZGU+b3BhY2l0eTwvY29kZT4gb2YgdGhlIGN1cnNvciBsYXllciB0byBcIjBcIi5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0Q3Vyc29yTGF5ZXJPZmZcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBjaGFpbmFibGVcbiAgICAgKi9cbiAgICBzZXRDdXJzb3JMYXllck9mZigpOiB2b2lkIHtcbiAgICAgICAgdmFyIG5vb3AgPSBmdW5jdGlvbigpIHsgfTtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIucmVzdGFydFRpbWVyID0gbm9vcDtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuZWxlbWVudC5zdHlsZS5vcGFjaXR5ID0gXCIwXCI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCB1cGRhdGVDaGFyYWN0ZXJTaXplXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICB1cGRhdGVDaGFyYWN0ZXJTaXplKCk6IHZvaWQge1xuICAgICAgICAvLyBGSVhNRTogREdIIGFsbG93Qm9sZEZvbnRzIGRvZXMgbm90IGV4aXN0IG9uIFRleHRcbiAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllclsnYWxsb3dCb2xkRm9udHMnXSAhPSB0aGlzLiRhbGxvd0JvbGRGb250cykge1xuICAgICAgICAgICAgdGhpcy4kYWxsb3dCb2xkRm9udHMgPSB0aGlzLiR0ZXh0TGF5ZXJbJ2FsbG93Qm9sZEZvbnRzJ107XG4gICAgICAgICAgICB0aGlzLnNldFN0eWxlKFwiYWNlX25vYm9sZFwiLCAhdGhpcy4kYWxsb3dCb2xkRm9udHMpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5sYXllckNvbmZpZy5jaGFyYWN0ZXJXaWR0aCA9IHRoaXMuY2hhcmFjdGVyV2lkdGggPSB0aGlzLiR0ZXh0TGF5ZXIuZ2V0Q2hhcmFjdGVyV2lkdGgoKTtcbiAgICAgICAgdGhpcy5sYXllckNvbmZpZy5saW5lSGVpZ2h0ID0gdGhpcy5saW5lSGVpZ2h0ID0gdGhpcy4kdGV4dExheWVyLmdldExpbmVIZWlnaHQoKTtcbiAgICAgICAgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBc3NvY2lhdGVzIHRoZSByZW5kZXJlciB3aXRoIGEgZGlmZmVyZW50IEVkaXRTZXNzaW9uLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRTZXNzaW9uXG4gICAgICogQHBhcmFtIHNlc3Npb24ge0VkaXRTZXNzaW9ufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0U2Vzc2lvbihzZXNzaW9uOiBFZGl0U2Vzc2lvbik6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uKSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uZG9jLm9mZihcImNoYW5nZU5ld0xpbmVNb2RlXCIsIHRoaXMub25DaGFuZ2VOZXdMaW5lTW9kZSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24gPSBzZXNzaW9uO1xuICAgICAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLnNjcm9sbE1hcmdpbi50b3AgJiYgc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSA8PSAwKSB7XG4gICAgICAgICAgICBzZXNzaW9uLnNldFNjcm9sbFRvcCgtdGhpcy5zY3JvbGxNYXJnaW4udG9wKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJG1hcmtlckJhY2suc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQuc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgICAgICB0aGlzLnNlc3Npb24uJHNldEZvbnRNZXRyaWNzKHRoaXMuJGZvbnRNZXRyaWNzKTtcblxuICAgICAgICB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUgPSB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlKClcbiAgICAgICAgdGhpcy5zZXNzaW9uLmRvYy5vbihcImNoYW5nZU5ld0xpbmVNb2RlXCIsIHRoaXMub25DaGFuZ2VOZXdMaW5lTW9kZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJpZ2dlcnMgYSBwYXJ0aWFsIHVwZGF0ZSBvZiB0aGUgdGV4dCwgZnJvbSB0aGUgcmFuZ2UgZ2l2ZW4gYnkgdGhlIHR3byBwYXJhbWV0ZXJzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCB1cGRhdGVMaW5lc1xuICAgICAqIEBwYXJhbSBmaXJzdFJvdyB7bnVtYmVyfSBUaGUgZmlyc3Qgcm93IHRvIHVwZGF0ZS5cbiAgICAgKiBAcGFyYW0gbGFzdFJvdyB7bnVtYmVyfSBUaGUgbGFzdCByb3cgdG8gdXBkYXRlLlxuICAgICAqIEBwYXJhbSBbZm9yY2VdIHtib29sZWFufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgdXBkYXRlTGluZXMoZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyLCBmb3JjZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgaWYgKGxhc3RSb3cgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgbGFzdFJvdyA9IEluZmluaXR5O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLiRjaGFuZ2VkTGluZXMpIHtcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcyA9IHsgZmlyc3RSb3c6IGZpcnN0Um93LCBsYXN0Um93OiBsYXN0Um93IH07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kY2hhbmdlZExpbmVzLmZpcnN0Um93ID4gZmlyc3RSb3cpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRjaGFuZ2VkTGluZXMuZmlyc3RSb3cgPSBmaXJzdFJvdztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93IDwgbGFzdFJvdykge1xuICAgICAgICAgICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93ID0gbGFzdFJvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoZSBjaGFuZ2UgaGFwcGVuZWQgb2Zmc2NyZWVuIGFib3ZlIHVzIHRoZW4gaXQncyBwb3NzaWJsZVxuICAgICAgICAvLyB0aGF0IGEgbmV3IGxpbmUgd3JhcCB3aWxsIGFmZmVjdCB0aGUgcG9zaXRpb24gb2YgdGhlIGxpbmVzIG9uIG91clxuICAgICAgICAvLyBzY3JlZW4gc28gdGhleSBuZWVkIHJlZHJhd24uXG4gICAgICAgIC8vIFRPRE86IGJldHRlciBzb2x1dGlvbiBpcyB0byBub3QgY2hhbmdlIHNjcm9sbCBwb3NpdGlvbiB3aGVuIHRleHQgaXMgY2hhbmdlZCBvdXRzaWRlIG9mIHZpc2libGUgYXJlYVxuICAgICAgICBpZiAodGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3cgPCB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93KSB7XG4gICAgICAgICAgICBpZiAoZm9yY2UpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdyA9IHRoaXMubGF5ZXJDb25maWcubGFzdFJvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLiRjaGFuZ2VkTGluZXMuZmlyc3RSb3cgPiB0aGlzLmxheWVyQ29uZmlnLmxhc3RSb3cpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9MSU5FUyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBvbkNoYW5nZU5ld0xpbmVNb2RlXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgb25DaGFuZ2VOZXdMaW5lTW9kZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfVEVYVCk7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGVFb2xDaGFyKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBvbkNoYW5nZVRhYlNpemVcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyBvbkNoYW5nZVRhYlNpemUoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLiRsb29wKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kbG9vcC5zY2hlZHVsZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX1RFWFQgfCBDSEFOR0VfTUFSS0VSKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLiR0ZXh0TGF5ZXIpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiR0ZXh0TGF5ZXIub25DaGFuZ2VUYWJTaXplKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLm9uQ2hhbmdlVGFiU2l6ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gSSdtIG5vdCBzdXJlIHdoeSB3ZSBjYW4gbm93IGVuZCB1cCBoZXJlLlxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJpZ2dlcnMgYSBmdWxsIHVwZGF0ZSBvZiB0aGUgdGV4dCwgZm9yIGFsbCB0aGUgcm93cy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgdXBkYXRlVGV4dFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgdXBkYXRlVGV4dCgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfVEVYVCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJpZ2dlcnMgYSBmdWxsIHVwZGF0ZSBvZiBhbGwgdGhlIGxheWVycywgZm9yIGFsbCB0aGUgcm93cy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgdXBkYXRlRnVsbFxuICAgICAqIEBwYXJhbSBbZm9yY2VdIHtib29sZWFufSBJZiBgdHJ1ZWAsIGZvcmNlcyB0aGUgY2hhbmdlcyB0aHJvdWdoLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgdXBkYXRlRnVsbChmb3JjZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgaWYgKGZvcmNlKVxuICAgICAgICAgICAgdGhpcy4kcmVuZGVyQ2hhbmdlcyhDSEFOR0VfRlVMTCwgdHJ1ZSk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFVwZGF0ZXMgdGhlIGZvbnQgc2l6ZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgdXBkYXRlRm9udFNpemVcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHVwZGF0ZUZvbnRTaXplKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuY2hlY2tGb3JTaXplQ2hhbmdlcygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgJHVwZGF0ZVNpemVBc3luY1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHJpdmF0ZSAkdXBkYXRlU2l6ZUFzeW5jKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy4kbG9vcC5wZW5kaW5nKSB7XG4gICAgICAgICAgICB0aGlzLiRzaXplLiRkaXJ0eSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm9uUmVzaXplKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcmlnZ2VycyBhIHJlc2l6ZSBvZiB0aGUgcmVuZGVyZXIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBmb3JjZSBJZiBgdHJ1ZWAsIHJlY29tcHV0ZXMgdGhlIHNpemUsIGV2ZW4gaWYgdGhlIGhlaWdodCBhbmQgd2lkdGggaGF2ZW4ndCBjaGFuZ2VkXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGd1dHRlcldpZHRoIFRoZSB3aWR0aCBvZiB0aGUgZ3V0dGVyIGluIHBpeGVsc1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB3aWR0aCBUaGUgd2lkdGggb2YgdGhlIGVkaXRvciBpbiBwaXhlbHNcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gaGVpZ2h0IFRoZSBoaWVoZ3Qgb2YgdGhlIGVkaXRvciwgaW4gcGl4ZWxzXG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqL1xuICAgIHB1YmxpYyBvblJlc2l6ZShmb3JjZT86IGJvb2xlYW4sIGd1dHRlcldpZHRoPzogbnVtYmVyLCB3aWR0aD86IG51bWJlciwgaGVpZ2h0PzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHRoaXMucmVzaXppbmcgPiAyKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBlbHNlIGlmICh0aGlzLnJlc2l6aW5nID4gMClcbiAgICAgICAgICAgIHRoaXMucmVzaXppbmcrKztcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy5yZXNpemluZyA9IGZvcmNlID8gMSA6IDA7XG4gICAgICAgIC8vIGB8fCBlbC5zY3JvbGxIZWlnaHRgIGlzIHJlcXVpcmVkIGZvciBvdXRvc2l6aW5nIGVkaXRvcnMgb24gaWVcbiAgICAgICAgLy8gd2hlcmUgZWxlbWVudHMgd2l0aCBjbGllbnRIZWlnaHQgPSAwIGFsc29lIGhhdmUgY2xpZW50V2lkdGggPSAwXG4gICAgICAgIHZhciBlbCA9IHRoaXMuY29udGFpbmVyO1xuICAgICAgICBpZiAoIWhlaWdodClcbiAgICAgICAgICAgIGhlaWdodCA9IGVsLmNsaWVudEhlaWdodCB8fCBlbC5zY3JvbGxIZWlnaHQ7XG4gICAgICAgIGlmICghd2lkdGgpXG4gICAgICAgICAgICB3aWR0aCA9IGVsLmNsaWVudFdpZHRoIHx8IGVsLnNjcm9sbFdpZHRoO1xuICAgICAgICB2YXIgY2hhbmdlcyA9IHRoaXMuJHVwZGF0ZUNhY2hlZFNpemUoZm9yY2UsIGd1dHRlcldpZHRoLCB3aWR0aCwgaGVpZ2h0KTtcblxuXG4gICAgICAgIGlmICghdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCB8fCAoIXdpZHRoICYmICFoZWlnaHQpKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucmVzaXppbmcgPSAwO1xuXG4gICAgICAgIGlmIChmb3JjZSlcbiAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLiRwYWRkaW5nID0gbnVsbDtcblxuICAgICAgICBpZiAoZm9yY2UpXG4gICAgICAgICAgICB0aGlzLiRyZW5kZXJDaGFuZ2VzKGNoYW5nZXMgfCB0aGlzLiRjaGFuZ2VzLCB0cnVlKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShjaGFuZ2VzIHwgdGhpcy4kY2hhbmdlcyk7XG5cbiAgICAgICAgaWYgKHRoaXMucmVzaXppbmcpXG4gICAgICAgICAgICB0aGlzLnJlc2l6aW5nID0gMDtcbiAgICB9XG5cbiAgICBwcml2YXRlICR1cGRhdGVDYWNoZWRTaXplKGZvcmNlOiBib29sZWFuLCBndXR0ZXJXaWR0aDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGhlaWdodCAtPSAodGhpcy4kZXh0cmFIZWlnaHQgfHwgMCk7XG4gICAgICAgIHZhciBjaGFuZ2VzID0gMDtcbiAgICAgICAgdmFyIHNpemUgPSB0aGlzLiRzaXplO1xuICAgICAgICB2YXIgb2xkU2l6ZSA9IHtcbiAgICAgICAgICAgIHdpZHRoOiBzaXplLndpZHRoLFxuICAgICAgICAgICAgaGVpZ2h0OiBzaXplLmhlaWdodCxcbiAgICAgICAgICAgIHNjcm9sbGVySGVpZ2h0OiBzaXplLnNjcm9sbGVySGVpZ2h0LFxuICAgICAgICAgICAgc2Nyb2xsZXJXaWR0aDogc2l6ZS5zY3JvbGxlcldpZHRoXG4gICAgICAgIH07XG4gICAgICAgIGlmIChoZWlnaHQgJiYgKGZvcmNlIHx8IHNpemUuaGVpZ2h0ICE9IGhlaWdodCkpIHtcbiAgICAgICAgICAgIHNpemUuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgICAgICAgICAgY2hhbmdlcyB8PSBDSEFOR0VfU0laRTtcblxuICAgICAgICAgICAgc2l6ZS5zY3JvbGxlckhlaWdodCA9IHNpemUuaGVpZ2h0O1xuICAgICAgICAgICAgaWYgKHRoaXMuJGhvcml6U2Nyb2xsKVxuICAgICAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJIZWlnaHQgLT0gdGhpcy5zY3JvbGxCYXJILmhlaWdodDtcblxuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJWLmVsZW1lbnQuc3R5bGUuYm90dG9tID0gdGhpcy5zY3JvbGxCYXJILmhlaWdodCArIFwicHhcIjtcblxuICAgICAgICAgICAgY2hhbmdlcyA9IGNoYW5nZXMgfCBDSEFOR0VfU0NST0xMO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHdpZHRoICYmIChmb3JjZSB8fCBzaXplLndpZHRoICE9IHdpZHRoKSkge1xuICAgICAgICAgICAgY2hhbmdlcyB8PSBDSEFOR0VfU0laRTtcbiAgICAgICAgICAgIHNpemUud2lkdGggPSB3aWR0aDtcblxuICAgICAgICAgICAgaWYgKGd1dHRlcldpZHRoID09IG51bGwpXG4gICAgICAgICAgICAgICAgZ3V0dGVyV2lkdGggPSB0aGlzLiRzaG93R3V0dGVyID8gdGhpcy4kZ3V0dGVyLm9mZnNldFdpZHRoIDogMDtcblxuICAgICAgICAgICAgdGhpcy5ndXR0ZXJXaWR0aCA9IGd1dHRlcldpZHRoO1xuXG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhckguZWxlbWVudC5zdHlsZS5sZWZ0ID1cbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbGVyLnN0eWxlLmxlZnQgPSBndXR0ZXJXaWR0aCArIFwicHhcIjtcbiAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJXaWR0aCA9IE1hdGgubWF4KDAsIHdpZHRoIC0gZ3V0dGVyV2lkdGggLSB0aGlzLnNjcm9sbEJhclYud2lkdGgpO1xuXG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhckguZWxlbWVudC5zdHlsZS5yaWdodCA9XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxlci5zdHlsZS5yaWdodCA9IHRoaXMuc2Nyb2xsQmFyVi53aWR0aCArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsZXIuc3R5bGUuYm90dG9tID0gdGhpcy5zY3JvbGxCYXJILmhlaWdodCArIFwicHhcIjtcblxuICAgICAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbiAmJiB0aGlzLnNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKSAmJiB0aGlzLmFkanVzdFdyYXBMaW1pdCgpIHx8IGZvcmNlKVxuICAgICAgICAgICAgICAgIGNoYW5nZXMgfD0gQ0hBTkdFX0ZVTEw7XG4gICAgICAgIH1cblxuICAgICAgICBzaXplLiRkaXJ0eSA9ICF3aWR0aCB8fCAhaGVpZ2h0O1xuXG4gICAgICAgIGlmIChjaGFuZ2VzKSB7XG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIEBldmVudCByZXNpemVcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwicmVzaXplXCIsIG9sZFNpemUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNoYW5nZXM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkd1dHRlclJlc2l6ZSgpIHtcbiAgICAgICAgdmFyIGd1dHRlcldpZHRoID0gdGhpcy4kc2hvd0d1dHRlciA/IHRoaXMuJGd1dHRlci5vZmZzZXRXaWR0aCA6IDA7XG4gICAgICAgIGlmIChndXR0ZXJXaWR0aCAhPSB0aGlzLmd1dHRlcldpZHRoKVxuICAgICAgICAgICAgdGhpcy4kY2hhbmdlcyB8PSB0aGlzLiR1cGRhdGVDYWNoZWRTaXplKHRydWUsIGd1dHRlcldpZHRoLCB0aGlzLiRzaXplLndpZHRoLCB0aGlzLiRzaXplLmhlaWdodCk7XG5cbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi5nZXRVc2VXcmFwTW9kZSgpICYmIHRoaXMuYWRqdXN0V3JhcExpbWl0KCkpIHtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHRoaXMuJHNpemUuJGRpcnR5KSB7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJGNvbXB1dGVMYXllckNvbmZpZygpO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfTUFSS0VSKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkanVzdHMgdGhlIHdyYXAgbGltaXQsIHdoaWNoIGlzIHRoZSBudW1iZXIgb2YgY2hhcmFjdGVycyB0aGF0IGNhbiBmaXQgd2l0aGluIHRoZSB3aWR0aCBvZiB0aGUgZWRpdCBhcmVhIG9uIHNjcmVlbi5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgYWRqdXN0V3JhcExpbWl0XG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBwdWJsaWMgYWRqdXN0V3JhcExpbWl0KCk6IGJvb2xlYW4ge1xuICAgICAgICB2YXIgYXZhaWxhYmxlV2lkdGggPSB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSB0aGlzLiRwYWRkaW5nICogMjtcbiAgICAgICAgdmFyIGxpbWl0ID0gTWF0aC5mbG9vcihhdmFpbGFibGVXaWR0aCAvIHRoaXMuY2hhcmFjdGVyV2lkdGgpO1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmFkanVzdFdyYXBMaW1pdChsaW1pdCwgdGhpcy4kc2hvd1ByaW50TWFyZ2luICYmIHRoaXMuJHByaW50TWFyZ2luQ29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gaGF2ZSBhbiBhbmltYXRlZCBzY3JvbGwgb3Igbm90LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRBbmltYXRlZFNjcm9sbFxuICAgICAqIEBwYXJhbSBzaG91bGRBbmltYXRlIHtib29sZWFufSBTZXQgdG8gYHRydWVgIHRvIHNob3cgYW5pbWF0ZWQgc2Nyb2xscy5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldEFuaW1hdGVkU2Nyb2xsKHNob3VsZEFuaW1hdGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJhbmltYXRlZFNjcm9sbFwiLCBzaG91bGRBbmltYXRlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHdoZXRoZXIgYW4gYW5pbWF0ZWQgc2Nyb2xsIGhhcHBlbnMgb3Igbm90LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRBbmltYXRlZFNjcm9sbFxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0QW5pbWF0ZWRTY3JvbGwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRhbmltYXRlZFNjcm9sbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyBpbnZpc2libGUgY2hhcmFjdGVycyBvciBub3QuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFNob3dJbnZpc2libGVzXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93SW52aXNpYmxlcyBTZXQgdG8gYHRydWVgIHRvIHNob3cgaW52aXNpYmxlc1xuICAgICAqL1xuICAgIHNldFNob3dJbnZpc2libGVzKHNob3dJbnZpc2libGVzOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwic2hvd0ludmlzaWJsZXNcIiwgc2hvd0ludmlzaWJsZXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciBpbnZpc2libGUgY2hhcmFjdGVycyBhcmUgYmVpbmcgc2hvd24gb3Igbm90LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRTaG93SW52aXNpYmxlc1xuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd0ludmlzaWJsZXMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInNob3dJbnZpc2libGVzXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgZ2V0RGlzcGxheUluZGVudEd1aWRlc1xuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0RGlzcGxheUluZGVudEd1aWRlcygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiZGlzcGxheUluZGVudEd1aWRlc1wiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHNldERpc3BsYXlJbmRlbnRHdWlkZXNcbiAgICAgKiBAcGFyYW0gZGlzcGxheUluZGVudEd1aWRlcyB7Ym9vbGVhbn1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldERpc3BsYXlJbmRlbnRHdWlkZXMoZGlzcGxheUluZGVudEd1aWRlczogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImRpc3BsYXlJbmRlbnRHdWlkZXNcIiwgZGlzcGxheUluZGVudEd1aWRlcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgdGhlIHByaW50IG1hcmdpbiBvciBub3QuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFNob3dQcmludE1hcmdpblxuICAgICAqIEBwYXJhbSBzaG93UHJpbnRNYXJnaW4ge2Jvb2xlYW59IFNldCB0byBgdHJ1ZWAgdG8gc2hvdyB0aGUgcHJpbnQgbWFyZ2luLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0U2hvd1ByaW50TWFyZ2luKHNob3dQcmludE1hcmdpbjogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInNob3dQcmludE1hcmdpblwiLCBzaG93UHJpbnRNYXJnaW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciB0aGUgcHJpbnQgbWFyZ2luIGlzIGJlaW5nIHNob3duIG9yIG5vdC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0U2hvd1ByaW50TWFyZ2luXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93UHJpbnRNYXJnaW4oKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInNob3dQcmludE1hcmdpblwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBjb2x1bW4gZGVmaW5pbmcgd2hlcmUgdGhlIHByaW50IG1hcmdpbiBzaG91bGQgYmUuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFByaW50TWFyZ2luQ29sdW1uXG4gICAgICogQHBhcmFtIHByaW50TWFyZ2luQ29sdW1uIHtudW1iZXJ9IFNwZWNpZmllcyB0aGUgbmV3IHByaW50IG1hcmdpbi5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldFByaW50TWFyZ2luQ29sdW1uKHByaW50TWFyZ2luQ29sdW1uOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJwcmludE1hcmdpbkNvbHVtblwiLCBwcmludE1hcmdpbkNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY29sdW1uIG51bWJlciBvZiB3aGVyZSB0aGUgcHJpbnQgbWFyZ2luIGlzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRQcmludE1hcmdpbkNvbHVtblxuICAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAgKi9cbiAgICBnZXRQcmludE1hcmdpbkNvbHVtbigpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJwcmludE1hcmdpbkNvbHVtblwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgZ3V0dGVyIGlzIGJlaW5nIHNob3duLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRTaG93R3V0dGVyXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93R3V0dGVyKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzaG93R3V0dGVyXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IHRoZSBndXR0ZXIgb3Igbm90LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRTaG93R3V0dGVyXG4gICAgICogQHBhcmFtIHNob3dHdXR0ZXIge2Jvb2xlYW59IFNldCB0byBgdHJ1ZWAgdG8gc2hvdyB0aGUgZ3V0dGVyXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRTaG93R3V0dGVyKHNob3dHdXR0ZXI6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0T3B0aW9uKFwic2hvd0d1dHRlclwiLCBzaG93R3V0dGVyKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIGdldEZhZGVGb2xkV2lkZ2V0c1xuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0RmFkZUZvbGRXaWRnZXRzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJmYWRlRm9sZFdpZGdldHNcIilcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHNldEZhZGVGb2xkV2lkZ2V0c1xuICAgICAqIEBwYXJhbSBmYWRlRm9sZFdpZGdldHMge2Jvb2xlYW59XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRGYWRlRm9sZFdpZGdldHMoZmFkZUZvbGRXaWRnZXRzOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiZmFkZUZvbGRXaWRnZXRzXCIsIGZhZGVGb2xkV2lkZ2V0cyk7XG4gICAgfVxuXG4gICAgc2V0SGlnaGxpZ2h0R3V0dGVyTGluZShoaWdobGlnaHRHdXR0ZXJMaW5lOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiaGlnaGxpZ2h0R3V0dGVyTGluZVwiLCBoaWdobGlnaHRHdXR0ZXJMaW5lKTtcbiAgICB9XG5cbiAgICBnZXRIaWdobGlnaHRHdXR0ZXJMaW5lKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJoaWdobGlnaHRHdXR0ZXJMaW5lXCIpO1xuICAgIH1cblxuICAgICR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0KCkge1xuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zO1xuICAgICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5sYXllckNvbmZpZy5saW5lSGVpZ2h0O1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmdldFVzZVdyYXBNb2RlKCkpIHtcbiAgICAgICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLnNlc3Npb24uZ2V0U2VsZWN0aW9uKCkuZ2V0Q3Vyc29yKCk7XG4gICAgICAgICAgICBjdXJzb3IuY29sdW1uID0gMDtcbiAgICAgICAgICAgIHBvcyA9IHRoaXMuJGN1cnNvckxheWVyLmdldFBpeGVsUG9zaXRpb24oY3Vyc29yLCB0cnVlKTtcbiAgICAgICAgICAgIGhlaWdodCAqPSB0aGlzLnNlc3Npb24uZ2V0Um93TGVuZ3RoKGN1cnNvci5yb3cpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuc3R5bGUudG9wID0gcG9zLnRvcCAtIHRoaXMubGF5ZXJDb25maWcub2Zmc2V0ICsgXCJweFwiO1xuICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0LnN0eWxlLmhlaWdodCA9IGhlaWdodCArIFwicHhcIjtcbiAgICB9XG5cbiAgICAkdXBkYXRlUHJpbnRNYXJnaW4oKSB7XG4gICAgICAgIGlmICghdGhpcy4kc2hvd1ByaW50TWFyZ2luICYmICF0aGlzLiRwcmludE1hcmdpbkVsKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmICghdGhpcy4kcHJpbnRNYXJnaW5FbCkge1xuICAgICAgICAgICAgdmFyIGNvbnRhaW5lckVsOiBIVE1MRGl2RWxlbWVudCA9IDxIVE1MRGl2RWxlbWVudD5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgY29udGFpbmVyRWwuY2xhc3NOYW1lID0gXCJhY2VfbGF5ZXIgYWNlX3ByaW50LW1hcmdpbi1sYXllclwiO1xuICAgICAgICAgICAgdGhpcy4kcHJpbnRNYXJnaW5FbCA9IGNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICB0aGlzLiRwcmludE1hcmdpbkVsLmNsYXNzTmFtZSA9IFwiYWNlX3ByaW50LW1hcmdpblwiO1xuICAgICAgICAgICAgY29udGFpbmVyRWwuYXBwZW5kQ2hpbGQodGhpcy4kcHJpbnRNYXJnaW5FbCk7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuaW5zZXJ0QmVmb3JlKGNvbnRhaW5lckVsLCB0aGlzLmNvbnRlbnQuZmlyc3RDaGlsZCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc3R5bGUgPSB0aGlzLiRwcmludE1hcmdpbkVsLnN0eWxlO1xuICAgICAgICBzdHlsZS5sZWZ0ID0gKCh0aGlzLmNoYXJhY3RlcldpZHRoICogdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW4pICsgdGhpcy4kcGFkZGluZykgKyBcInB4XCI7XG4gICAgICAgIHN0eWxlLnZpc2liaWxpdHkgPSB0aGlzLiRzaG93UHJpbnRNYXJnaW4gPyBcInZpc2libGVcIiA6IFwiaGlkZGVuXCI7XG5cbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbiAmJiB0aGlzLnNlc3Npb25bJyR3cmFwJ10gPT0gLTEpXG4gICAgICAgICAgICB0aGlzLmFkanVzdFdyYXBMaW1pdCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHJvb3QgZWxlbWVudCBjb250YWluaW5nIHRoaXMgcmVuZGVyZXIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldENvbnRhaW5lckVsZW1lbnRcbiAgICAgKiBAcmV0dXJuIHtIVE1MRWxlbWVudH1cbiAgICAgKi9cbiAgICBnZXRDb250YWluZXJFbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGFpbmVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGVsZW1lbnQgdGhhdCB0aGUgbW91c2UgZXZlbnRzIGFyZSBhdHRhY2hlZCB0b1xuICAgICogQHJldHVybiB7RE9NRWxlbWVudH1cbiAgICAqKi9cbiAgICBnZXRNb3VzZUV2ZW50VGFyZ2V0KCk6IEhUTUxEaXZFbGVtZW50IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGVudDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBlbGVtZW50IHRvIHdoaWNoIHRoZSBoaWRkZW4gdGV4dCBhcmVhIGlzIGFkZGVkLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRUZXh0QXJlYUNvbnRhaW5lclxuICAgICAqIEByZXR1cm4ge0hUTUxFbGVtZW50fVxuICAgICAqL1xuICAgIGdldFRleHRBcmVhQ29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGFpbmVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmUgdGV4dCBpbnB1dCBvdmVyIHRoZSBjdXJzb3IuXG4gICAgICogUmVxdWlyZWQgZm9yIGlPUyBhbmQgSU1FLlxuICAgICAqXG4gICAgICogQG1ldGhvZCAkbW92ZVRleHRBcmVhVG9DdXJzb3JcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHVibGljICRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpOiB2b2lkIHtcblxuICAgICAgICBpZiAoIXRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGNvbmZpZyA9IHRoaXMubGF5ZXJDb25maWc7XG4gICAgICAgIHZhciBwb3NUb3AgPSB0aGlzLiRjdXJzb3JMYXllci4kcGl4ZWxQb3MudG9wO1xuICAgICAgICB2YXIgcG9zTGVmdCA9IHRoaXMuJGN1cnNvckxheWVyLiRwaXhlbFBvcy5sZWZ0O1xuICAgICAgICBwb3NUb3AgLT0gY29uZmlnLm9mZnNldDtcblxuICAgICAgICB2YXIgaCA9IHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgaWYgKHBvc1RvcCA8IDAgfHwgcG9zVG9wID4gY29uZmlnLmhlaWdodCAtIGgpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHcgPSB0aGlzLmNoYXJhY3RlcldpZHRoO1xuICAgICAgICBpZiAodGhpcy4kY29tcG9zaXRpb24pIHtcbiAgICAgICAgICAgIHZhciB2YWwgPSB0aGlzLnRleHRhcmVhLnZhbHVlLnJlcGxhY2UoL15cXHgwMSsvLCBcIlwiKTtcbiAgICAgICAgICAgIHcgKj0gKHRoaXMuc2Vzc2lvbi4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgodmFsKVswXSArIDIpO1xuICAgICAgICAgICAgaCArPSAyO1xuICAgICAgICAgICAgcG9zVG9wIC09IDE7XG4gICAgICAgIH1cbiAgICAgICAgcG9zTGVmdCAtPSB0aGlzLnNjcm9sbExlZnQ7XG4gICAgICAgIGlmIChwb3NMZWZ0ID4gdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gdylcbiAgICAgICAgICAgIHBvc0xlZnQgPSB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSB3O1xuXG4gICAgICAgIHBvc0xlZnQgLT0gdGhpcy5zY3JvbGxCYXJWLndpZHRoO1xuXG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuaGVpZ2h0ID0gaCArIFwicHhcIjtcbiAgICAgICAgdGhpcy50ZXh0YXJlYS5zdHlsZS53aWR0aCA9IHcgKyBcInB4XCI7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUucmlnaHQgPSBNYXRoLm1heCgwLCB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSBwb3NMZWZ0IC0gdykgKyBcInB4XCI7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuYm90dG9tID0gTWF0aC5tYXgoMCwgdGhpcy4kc2l6ZS5oZWlnaHQgLSBwb3NUb3AgLSBoKSArIFwicHhcIjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgZmlyc3QgdmlzaWJsZSByb3cuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldEZpcnN0VmlzaWJsZVJvd1xuICAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAgKi9cbiAgICBnZXRGaXJzdFZpc2libGVSb3coKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3c7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGZpcnN0IGZ1bGx5IHZpc2libGUgcm93LiBcIkZ1bGx5XCIgaGVyZSBtZWFucyB0aGF0IHRoZSBjaGFyYWN0ZXJzIGluIHRoZSByb3cgYXJlIG5vdCB0cnVuY2F0ZWQ7IHRoYXQgdGhlIHRvcCBhbmQgdGhlIGJvdHRvbSBvZiB0aGUgcm93IGFyZSBvbiB0aGUgc2NyZWVuLlxuICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICoqL1xuICAgIGdldEZpcnN0RnVsbHlWaXNpYmxlUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93ICsgKHRoaXMubGF5ZXJDb25maWcub2Zmc2V0ID09PSAwID8gMCA6IDEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBsYXN0IGZ1bGx5IHZpc2libGUgcm93LiBcIkZ1bGx5XCIgaGVyZSBtZWFucyB0aGF0IHRoZSBjaGFyYWN0ZXJzIGluIHRoZSByb3cgYXJlIG5vdCB0cnVuY2F0ZWQ7IHRoYXQgdGhlIHRvcCBhbmQgdGhlIGJvdHRvbSBvZiB0aGUgcm93IGFyZSBvbiB0aGUgc2NyZWVuLlxuICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICoqL1xuICAgIGdldExhc3RGdWxseVZpc2libGVSb3coKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGZsaW50ID0gTWF0aC5mbG9vcigodGhpcy5sYXllckNvbmZpZy5oZWlnaHQgKyB0aGlzLmxheWVyQ29uZmlnLm9mZnNldCkgLyB0aGlzLmxheWVyQ29uZmlnLmxpbmVIZWlnaHQpO1xuICAgICAgICByZXR1cm4gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdyAtIDEgKyBmbGludDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbGFzdCB2aXNpYmxlIHJvdy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0TGFzdFZpc2libGVSb3dcbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICovXG4gICAgZ2V0TGFzdFZpc2libGVSb3coKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubGF5ZXJDb25maWcubGFzdFJvdztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBwYWRkaW5nIGZvciBhbGwgdGhlIGxheWVycy5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0UGFkZGluZ1xuICAgICAqIEBwYXJhbSBwYWRkaW5nIHtudW1iZXJ9IEEgbmV3IHBhZGRpbmcgdmFsdWUgKGluIHBpeGVscykuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRQYWRkaW5nKHBhZGRpbmc6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAodHlwZW9mIHBhZGRpbmcgIT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwicGFkZGluZyBtdXN0IGJlIGEgbnVtYmVyXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJHBhZGRpbmcgPSBwYWRkaW5nO1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuc2V0UGFkZGluZyhwYWRkaW5nKTtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuc2V0UGFkZGluZyhwYWRkaW5nKTtcbiAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQuc2V0UGFkZGluZyhwYWRkaW5nKTtcbiAgICAgICAgdGhpcy4kbWFya2VyQmFjay5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICAgICAgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTtcbiAgICB9XG5cbiAgICBzZXRTY3JvbGxNYXJnaW4odG9wOiBudW1iZXIsIGJvdHRvbTogbnVtYmVyLCBsZWZ0OiBudW1iZXIsIHJpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdmFyIHNtID0gdGhpcy5zY3JvbGxNYXJnaW47XG4gICAgICAgIHNtLnRvcCA9IHRvcCB8IDA7XG4gICAgICAgIHNtLmJvdHRvbSA9IGJvdHRvbSB8IDA7XG4gICAgICAgIHNtLnJpZ2h0ID0gcmlnaHQgfCAwO1xuICAgICAgICBzbS5sZWZ0ID0gbGVmdCB8IDA7XG4gICAgICAgIHNtLnYgPSBzbS50b3AgKyBzbS5ib3R0b207XG4gICAgICAgIHNtLmggPSBzbS5sZWZ0ICsgc20ucmlnaHQ7XG4gICAgICAgIGlmIChzbS50b3AgJiYgdGhpcy5zY3JvbGxUb3AgPD0gMCAmJiB0aGlzLnNlc3Npb24pXG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKC1zbS50b3ApO1xuICAgICAgICB0aGlzLnVwZGF0ZUZ1bGwoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyIGlzIHNldCB0byBiZSBhbHdheXMgdmlzaWJsZS5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRIU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSgpOiBib29sZWFuIHtcbiAgICAgICAgLy8gRklYTUU/XG4gICAgICAgIHJldHVybiB0aGlzLiRoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIgb3Igbm90LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRIU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZVxuICAgICAqIEBwYXJhbSBoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSB7Ym9vbGVhbn0gU2V0IHRvIGB0cnVlYCB0byBtYWtlIHRoZSBob3Jpem9udGFsIHNjcm9sbCBiYXIgdmlzaWJsZS5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlKGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiaFNjcm9sbEJhckFsd2F5c1Zpc2libGVcIiwgaFNjcm9sbEJhckFsd2F5c1Zpc2libGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciB0aGUgdmVydGljYWwgc2Nyb2xsYmFyIGlzIHNldCB0byBiZSBhbHdheXMgdmlzaWJsZS5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRWU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IHRoZSB2ZXJ0aWNhbCBzY3JvbGxiYXIgb3Igbm90LlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYWx3YXlzVmlzaWJsZSBTZXQgdG8gYHRydWVgIHRvIG1ha2UgdGhlIHZlcnRpY2FsIHNjcm9sbCBiYXIgdmlzaWJsZVxuICAgICAqL1xuICAgIHNldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlKGFsd2F5c1Zpc2libGU6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJ2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZVwiLCBhbHdheXNWaXNpYmxlKTtcbiAgICB9XG5cbiAgICBwcml2YXRlICR1cGRhdGVTY3JvbGxCYXJWKCk6IHZvaWQge1xuICAgICAgICB2YXIgc2Nyb2xsSGVpZ2h0ID0gdGhpcy5sYXllckNvbmZpZy5tYXhIZWlnaHQ7XG4gICAgICAgIHZhciBzY3JvbGxlckhlaWdodCA9IHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQ7XG4gICAgICAgIGlmICghdGhpcy4kbWF4TGluZXMgJiYgdGhpcy4kc2Nyb2xsUGFzdEVuZCkge1xuICAgICAgICAgICAgc2Nyb2xsSGVpZ2h0IC09IChzY3JvbGxlckhlaWdodCAtIHRoaXMubGluZUhlaWdodCkgKiB0aGlzLiRzY3JvbGxQYXN0RW5kO1xuICAgICAgICAgICAgaWYgKHRoaXMuc2Nyb2xsVG9wID4gc2Nyb2xsSGVpZ2h0IC0gc2Nyb2xsZXJIZWlnaHQpIHtcbiAgICAgICAgICAgICAgICBzY3JvbGxIZWlnaHQgPSB0aGlzLnNjcm9sbFRvcCArIHNjcm9sbGVySGVpZ2h0O1xuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zY3JvbGxUb3AgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zZXRTY3JvbGxIZWlnaHQoc2Nyb2xsSGVpZ2h0ICsgdGhpcy5zY3JvbGxNYXJnaW4udik7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zZXRTY3JvbGxUb3AodGhpcy5zY3JvbGxUb3AgKyB0aGlzLnNjcm9sbE1hcmdpbi50b3ApO1xuICAgIH1cblxuICAgIHByaXZhdGUgJHVwZGF0ZVNjcm9sbEJhckgoKSB7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFySC5zZXRTY3JvbGxXaWR0aCh0aGlzLmxheWVyQ29uZmlnLndpZHRoICsgMiAqIHRoaXMuJHBhZGRpbmcgKyB0aGlzLnNjcm9sbE1hcmdpbi5oKTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJILnNldFNjcm9sbExlZnQodGhpcy5zY3JvbGxMZWZ0ICsgdGhpcy5zY3JvbGxNYXJnaW4ubGVmdCk7XG4gICAgfVxuXG4gICAgZnJlZXplKCkge1xuICAgICAgICB0aGlzLiRmcm96ZW4gPSB0cnVlO1xuICAgIH1cblxuICAgIHVuZnJlZXplKCkge1xuICAgICAgICB0aGlzLiRmcm96ZW4gPSBmYWxzZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kICRyZW5kZXJDaGFuZ2VzXG4gICAgICogQHBhcmFtIGNoYW5nZXMge251bWJlcn1cbiAgICAgKiBAcGFyYW0gZm9yY2Uge2Jvb2xlYW59XG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSAkcmVuZGVyQ2hhbmdlcyhjaGFuZ2VzOiBudW1iZXIsIGZvcmNlOiBib29sZWFuKTogbnVtYmVyIHtcblxuICAgICAgICBpZiAodGhpcy4kY2hhbmdlcykge1xuICAgICAgICAgICAgY2hhbmdlcyB8PSB0aGlzLiRjaGFuZ2VzO1xuICAgICAgICAgICAgdGhpcy4kY2hhbmdlcyA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCghdGhpcy5zZXNzaW9uIHx8ICF0aGlzLmNvbnRhaW5lci5vZmZzZXRXaWR0aCB8fCB0aGlzLiRmcm96ZW4pIHx8ICghY2hhbmdlcyAmJiAhZm9yY2UpKSB7XG4gICAgICAgICAgICB0aGlzLiRjaGFuZ2VzIHw9IGNoYW5nZXM7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuJHNpemUuJGRpcnR5KSB7XG4gICAgICAgICAgICB0aGlzLiRjaGFuZ2VzIHw9IGNoYW5nZXM7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vblJlc2l6ZSh0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXRoaXMubGluZUhlaWdodCkge1xuICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLmNoZWNrRm9yU2l6ZUNoYW5nZXMoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgYmVmb3JlUmVuZGVyXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJiZWZvcmVSZW5kZXJcIik7XG5cbiAgICAgICAgdmFyIGNvbmZpZyA9IHRoaXMubGF5ZXJDb25maWc7XG4gICAgICAgIC8vIHRleHQsIHNjcm9sbGluZyBhbmQgcmVzaXplIGNoYW5nZXMgY2FuIGNhdXNlIHRoZSB2aWV3IHBvcnQgc2l6ZSB0byBjaGFuZ2VcbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfRlVMTCB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9TSVpFIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX1RFWFQgfHxcbiAgICAgICAgICAgIGNoYW5nZXMgJiBDSEFOR0VfTElORVMgfHxcbiAgICAgICAgICAgIGNoYW5nZXMgJiBDSEFOR0VfU0NST0xMIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX0hfU0NST0xMXG4gICAgICAgICkge1xuICAgICAgICAgICAgY2hhbmdlcyB8PSB0aGlzLiRjb21wdXRlTGF5ZXJDb25maWcoKTtcbiAgICAgICAgICAgIC8vIElmIGEgY2hhbmdlIGlzIG1hZGUgb2Zmc2NyZWVuIGFuZCB3cmFwTW9kZSBpcyBvbiwgdGhlbiB0aGUgb25zY3JlZW5cbiAgICAgICAgICAgIC8vIGxpbmVzIG1heSBoYXZlIGJlZW4gcHVzaGVkIGRvd24uIElmIHNvLCB0aGUgZmlyc3Qgc2NyZWVuIHJvdyB3aWxsIG5vdFxuICAgICAgICAgICAgLy8gaGF2ZSBjaGFuZ2VkLCBidXQgdGhlIGZpcnN0IGFjdHVhbCByb3cgd2lsbC4gSW4gdGhhdCBjYXNlLCBhZGp1c3QgXG4gICAgICAgICAgICAvLyBzY3JvbGxUb3Agc28gdGhhdCB0aGUgY3Vyc29yIGFuZCBvbnNjcmVlbiBjb250ZW50IHN0YXlzIGluIHRoZSBzYW1lIHBsYWNlLlxuICAgICAgICAgICAgaWYgKGNvbmZpZy5maXJzdFJvdyAhPSB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93ICYmIGNvbmZpZy5maXJzdFJvd1NjcmVlbiA9PSB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93U2NyZWVuKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxUb3AgPSB0aGlzLnNjcm9sbFRvcCArIChjb25maWcuZmlyc3RSb3cgLSB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93KSAqIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgICAgICAgICBjaGFuZ2VzID0gY2hhbmdlcyB8IENIQU5HRV9TQ1JPTEw7XG4gICAgICAgICAgICAgICAgY2hhbmdlcyB8PSB0aGlzLiRjb21wdXRlTGF5ZXJDb25maWcoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbmZpZyA9IHRoaXMubGF5ZXJDb25maWc7XG4gICAgICAgICAgICAvLyB1cGRhdGUgc2Nyb2xsYmFyIGZpcnN0IHRvIG5vdCBsb3NlIHNjcm9sbCBwb3NpdGlvbiB3aGVuIGd1dHRlciBjYWxscyByZXNpemVcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVNjcm9sbEJhclYoKTtcbiAgICAgICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0hfU0NST0xMKVxuICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVNjcm9sbEJhckgoKTtcbiAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLmVsZW1lbnQuc3R5bGUubWFyZ2luVG9wID0gKC1jb25maWcub2Zmc2V0KSArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5tYXJnaW5Ub3AgPSAoLWNvbmZpZy5vZmZzZXQpICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLndpZHRoID0gY29uZmlnLndpZHRoICsgMiAqIHRoaXMuJHBhZGRpbmcgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUuaGVpZ2h0ID0gY29uZmlnLm1pbkhlaWdodCArIFwicHhcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGhvcml6b250YWwgc2Nyb2xsaW5nXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0hfU0NST0xMKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUubWFyZ2luTGVmdCA9IC10aGlzLnNjcm9sbExlZnQgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbGVyLmNsYXNzTmFtZSA9IHRoaXMuc2Nyb2xsTGVmdCA8PSAwID8gXCJhY2Vfc2Nyb2xsZXJcIiA6IFwiYWNlX3Njcm9sbGVyIGFjZV9zY3JvbGwtbGVmdFwiO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZnVsbFxuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9GVUxMKSB7XG4gICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2hvd0d1dHRlcikge1xuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy4kbWFya2VyQmFjay51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckZyb250LnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgICAgICAgICAgdGhpcy4kaGlnaGxpZ2h0R3V0dGVyTGluZSAmJiB0aGlzLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0KCk7XG5cbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IGFmdGVyUmVuZGVyXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImFmdGVyUmVuZGVyXCIpO1xuXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBzY3JvbGxpbmdcbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfU0NST0xMKSB7XG4gICAgICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9URVhUIHx8IGNoYW5nZXMgJiBDSEFOR0VfTElORVMpXG4gICAgICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci5zY3JvbGxMaW5lcyhjb25maWcpO1xuXG4gICAgICAgICAgICBpZiAodGhpcy4kc2hvd0d1dHRlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckJhY2sudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kaGlnaGxpZ2h0R3V0dGVyTGluZSAmJiB0aGlzLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0KCk7XG4gICAgICAgICAgICB0aGlzLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBAZXZlbnQgYWZ0ZXJSZW5kZXJcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiYWZ0ZXJSZW5kZXJcIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9URVhUKSB7XG4gICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2hvd0d1dHRlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0xJTkVTKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdXBkYXRlTGluZXMoKSB8fCAoY2hhbmdlcyAmIENIQU5HRV9HVVRURVIpICYmIHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2hhbmdlcyAmIENIQU5HRV9URVhUIHx8IGNoYW5nZXMgJiBDSEFOR0VfR1VUVEVSKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2hvd0d1dHRlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0NVUlNPUikge1xuICAgICAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgICAgICAgICAgdGhpcy4kaGlnaGxpZ2h0R3V0dGVyTGluZSAmJiB0aGlzLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0KCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2hhbmdlcyAmIChDSEFOR0VfTUFSS0VSIHwgQ0hBTkdFX01BUktFUl9GUk9OVCkpIHtcbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckZyb250LnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoYW5nZXMgJiAoQ0hBTkdFX01BUktFUiB8IENIQU5HRV9NQVJLRVJfQkFDSykpIHtcbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckJhY2sudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGFmdGVyUmVuZGVyXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJhZnRlclJlbmRlclwiKTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRhdXRvc2l6ZSgpIHtcbiAgICAgICAgdmFyIGhlaWdodCA9IHRoaXMuc2Vzc2lvbi5nZXRTY3JlZW5MZW5ndGgoKSAqIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgdmFyIG1heEhlaWdodCA9IHRoaXMuJG1heExpbmVzICogdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgZGVzaXJlZEhlaWdodCA9IE1hdGgubWF4KFxuICAgICAgICAgICAgKHRoaXMuJG1pbkxpbmVzIHx8IDEpICogdGhpcy5saW5lSGVpZ2h0LFxuICAgICAgICAgICAgTWF0aC5taW4obWF4SGVpZ2h0LCBoZWlnaHQpXG4gICAgICAgICkgKyB0aGlzLnNjcm9sbE1hcmdpbi52ICsgKHRoaXMuJGV4dHJhSGVpZ2h0IHx8IDApO1xuICAgICAgICB2YXIgdlNjcm9sbCA9IGhlaWdodCA+IG1heEhlaWdodDtcblxuICAgICAgICBpZiAoZGVzaXJlZEhlaWdodCAhPSB0aGlzLmRlc2lyZWRIZWlnaHQgfHxcbiAgICAgICAgICAgIHRoaXMuJHNpemUuaGVpZ2h0ICE9IHRoaXMuZGVzaXJlZEhlaWdodCB8fCB2U2Nyb2xsICE9IHRoaXMuJHZTY3JvbGwpIHtcbiAgICAgICAgICAgIGlmICh2U2Nyb2xsICE9IHRoaXMuJHZTY3JvbGwpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiR2U2Nyb2xsID0gdlNjcm9sbDtcbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2V0VmlzaWJsZSh2U2Nyb2xsKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHcgPSB0aGlzLmNvbnRhaW5lci5jbGllbnRXaWR0aDtcbiAgICAgICAgICAgIHRoaXMuY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGRlc2lyZWRIZWlnaHQgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVDYWNoZWRTaXplKHRydWUsIHRoaXMuJGd1dHRlcldpZHRoLCB3LCBkZXNpcmVkSGVpZ2h0KTtcbiAgICAgICAgICAgIC8vIHRoaXMuJGxvb3AuY2hhbmdlcyA9IDA7XG4gICAgICAgICAgICB0aGlzLmRlc2lyZWRIZWlnaHQgPSBkZXNpcmVkSGVpZ2h0O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkY29tcHV0ZUxheWVyQ29uZmlnKCkge1xuXG4gICAgICAgIGlmICh0aGlzLiRtYXhMaW5lcyAmJiB0aGlzLmxpbmVIZWlnaHQgPiAxKSB7XG4gICAgICAgICAgICB0aGlzLiRhdXRvc2l6ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciBzaXplID0gdGhpcy4kc2l6ZTtcblxuICAgICAgICB2YXIgaGlkZVNjcm9sbGJhcnMgPSBzaXplLmhlaWdodCA8PSAyICogdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgc2NyZWVuTGluZXMgPSB0aGlzLnNlc3Npb24uZ2V0U2NyZWVuTGVuZ3RoKCk7XG4gICAgICAgIHZhciBtYXhIZWlnaHQgPSBzY3JlZW5MaW5lcyAqIHRoaXMubGluZUhlaWdodDtcblxuICAgICAgICB2YXIgb2Zmc2V0ID0gdGhpcy5zY3JvbGxUb3AgJSB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBtaW5IZWlnaHQgPSBzaXplLnNjcm9sbGVySGVpZ2h0ICsgdGhpcy5saW5lSGVpZ2h0O1xuXG4gICAgICAgIHZhciBsb25nZXN0TGluZSA9IHRoaXMuJGdldExvbmdlc3RMaW5lKCk7XG5cbiAgICAgICAgdmFyIGhvcml6U2Nyb2xsID0gIWhpZGVTY3JvbGxiYXJzICYmICh0aGlzLiRoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSB8fFxuICAgICAgICAgICAgc2l6ZS5zY3JvbGxlcldpZHRoIC0gbG9uZ2VzdExpbmUgLSAyICogdGhpcy4kcGFkZGluZyA8IDApO1xuXG4gICAgICAgIHZhciBoU2Nyb2xsQ2hhbmdlZCA9IHRoaXMuJGhvcml6U2Nyb2xsICE9PSBob3JpelNjcm9sbDtcbiAgICAgICAgaWYgKGhTY3JvbGxDaGFuZ2VkKSB7XG4gICAgICAgICAgICB0aGlzLiRob3JpelNjcm9sbCA9IGhvcml6U2Nyb2xsO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJILnNldFZpc2libGUoaG9yaXpTY3JvbGwpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLiRtYXhMaW5lcyAmJiB0aGlzLiRzY3JvbGxQYXN0RW5kKSB7XG4gICAgICAgICAgICBtYXhIZWlnaHQgKz0gKHNpemUuc2Nyb2xsZXJIZWlnaHQgLSB0aGlzLmxpbmVIZWlnaHQpICogdGhpcy4kc2Nyb2xsUGFzdEVuZDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB2U2Nyb2xsID0gIWhpZGVTY3JvbGxiYXJzICYmICh0aGlzLiR2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSB8fFxuICAgICAgICAgICAgc2l6ZS5zY3JvbGxlckhlaWdodCAtIG1heEhlaWdodCA8IDApO1xuICAgICAgICB2YXIgdlNjcm9sbENoYW5nZWQgPSB0aGlzLiR2U2Nyb2xsICE9PSB2U2Nyb2xsO1xuICAgICAgICBpZiAodlNjcm9sbENoYW5nZWQpIHtcbiAgICAgICAgICAgIHRoaXMuJHZTY3JvbGwgPSB2U2Nyb2xsO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJWLnNldFZpc2libGUodlNjcm9sbCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKE1hdGgubWF4KC10aGlzLnNjcm9sbE1hcmdpbi50b3AsXG4gICAgICAgICAgICBNYXRoLm1pbih0aGlzLnNjcm9sbFRvcCwgbWF4SGVpZ2h0IC0gc2l6ZS5zY3JvbGxlckhlaWdodCArIHRoaXMuc2Nyb2xsTWFyZ2luLmJvdHRvbSkpKTtcblxuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdChNYXRoLm1heCgtdGhpcy5zY3JvbGxNYXJnaW4ubGVmdCwgTWF0aC5taW4odGhpcy5zY3JvbGxMZWZ0LFxuICAgICAgICAgICAgbG9uZ2VzdExpbmUgKyAyICogdGhpcy4kcGFkZGluZyAtIHNpemUuc2Nyb2xsZXJXaWR0aCArIHRoaXMuc2Nyb2xsTWFyZ2luLnJpZ2h0KSkpO1xuXG4gICAgICAgIHZhciBsaW5lQ291bnQgPSBNYXRoLmNlaWwobWluSGVpZ2h0IC8gdGhpcy5saW5lSGVpZ2h0KSAtIDE7XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IE1hdGgubWF4KDAsIE1hdGgucm91bmQoKHRoaXMuc2Nyb2xsVG9wIC0gb2Zmc2V0KSAvIHRoaXMubGluZUhlaWdodCkpO1xuICAgICAgICB2YXIgbGFzdFJvdyA9IGZpcnN0Um93ICsgbGluZUNvdW50O1xuXG4gICAgICAgIC8vIE1hcCBsaW5lcyBvbiB0aGUgc2NyZWVuIHRvIGxpbmVzIGluIHRoZSBkb2N1bWVudC5cbiAgICAgICAgdmFyIGZpcnN0Um93U2NyZWVuLCBmaXJzdFJvd0hlaWdodDtcbiAgICAgICAgdmFyIGxpbmVIZWlnaHQgPSB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIGZpcnN0Um93ID0gc2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50Um93KGZpcnN0Um93LCAwKTtcblxuICAgICAgICAvLyBDaGVjayBpZiBmaXJzdFJvdyBpcyBpbnNpZGUgb2YgYSBmb2xkTGluZS4gSWYgdHJ1ZSwgdGhlbiB1c2UgdGhlIGZpcnN0XG4gICAgICAgIC8vIHJvdyBvZiB0aGUgZm9sZExpbmUuXG4gICAgICAgIHZhciBmb2xkTGluZSA9IHNlc3Npb24uZ2V0Rm9sZExpbmUoZmlyc3RSb3cpO1xuICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgIGZpcnN0Um93ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICB9XG5cbiAgICAgICAgZmlyc3RSb3dTY3JlZW4gPSBzZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Sb3coZmlyc3RSb3csIDApO1xuICAgICAgICBmaXJzdFJvd0hlaWdodCA9IHNlc3Npb24uZ2V0Um93TGVuZ3RoKGZpcnN0Um93KSAqIGxpbmVIZWlnaHQ7XG5cbiAgICAgICAgbGFzdFJvdyA9IE1hdGgubWluKHNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFJvdyhsYXN0Um93LCAwKSwgc2Vzc2lvbi5nZXRMZW5ndGgoKSAtIDEpO1xuICAgICAgICBtaW5IZWlnaHQgPSBzaXplLnNjcm9sbGVySGVpZ2h0ICsgc2Vzc2lvbi5nZXRSb3dMZW5ndGgobGFzdFJvdykgKiBsaW5lSGVpZ2h0ICtcbiAgICAgICAgICAgIGZpcnN0Um93SGVpZ2h0O1xuXG4gICAgICAgIG9mZnNldCA9IHRoaXMuc2Nyb2xsVG9wIC0gZmlyc3RSb3dTY3JlZW4gKiBsaW5lSGVpZ2h0O1xuXG4gICAgICAgIHZhciBjaGFuZ2VzID0gMDtcbiAgICAgICAgaWYgKHRoaXMubGF5ZXJDb25maWcud2lkdGggIT0gbG9uZ2VzdExpbmUpXG4gICAgICAgICAgICBjaGFuZ2VzID0gQ0hBTkdFX0hfU0NST0xMO1xuICAgICAgICAvLyBIb3Jpem9udGFsIHNjcm9sbGJhciB2aXNpYmlsaXR5IG1heSBoYXZlIGNoYW5nZWQsIHdoaWNoIGNoYW5nZXNcbiAgICAgICAgLy8gdGhlIGNsaWVudCBoZWlnaHQgb2YgdGhlIHNjcm9sbGVyXG4gICAgICAgIGlmIChoU2Nyb2xsQ2hhbmdlZCB8fCB2U2Nyb2xsQ2hhbmdlZCkge1xuICAgICAgICAgICAgY2hhbmdlcyA9IHRoaXMuJHVwZGF0ZUNhY2hlZFNpemUodHJ1ZSwgdGhpcy5ndXR0ZXJXaWR0aCwgc2l6ZS53aWR0aCwgc2l6ZS5oZWlnaHQpO1xuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBAZXZlbnQgc2Nyb2xsYmFyVmlzaWJpbGl0eUNoYW5nZWRcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwic2Nyb2xsYmFyVmlzaWJpbGl0eUNoYW5nZWRcIik7XG4gICAgICAgICAgICBpZiAodlNjcm9sbENoYW5nZWQpXG4gICAgICAgICAgICAgICAgbG9uZ2VzdExpbmUgPSB0aGlzLiRnZXRMb25nZXN0TGluZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5sYXllckNvbmZpZyA9IHtcbiAgICAgICAgICAgIHdpZHRoOiBsb25nZXN0TGluZSxcbiAgICAgICAgICAgIHBhZGRpbmc6IHRoaXMuJHBhZGRpbmcsXG4gICAgICAgICAgICBmaXJzdFJvdzogZmlyc3RSb3csXG4gICAgICAgICAgICBmaXJzdFJvd1NjcmVlbjogZmlyc3RSb3dTY3JlZW4sXG4gICAgICAgICAgICBsYXN0Um93OiBsYXN0Um93LFxuICAgICAgICAgICAgbGluZUhlaWdodDogbGluZUhlaWdodCxcbiAgICAgICAgICAgIGNoYXJhY3RlcldpZHRoOiB0aGlzLmNoYXJhY3RlcldpZHRoLFxuICAgICAgICAgICAgbWluSGVpZ2h0OiBtaW5IZWlnaHQsXG4gICAgICAgICAgICBtYXhIZWlnaHQ6IG1heEhlaWdodCxcbiAgICAgICAgICAgIG9mZnNldDogb2Zmc2V0LFxuICAgICAgICAgICAgZ3V0dGVyT2Zmc2V0OiBNYXRoLm1heCgwLCBNYXRoLmNlaWwoKG9mZnNldCArIHNpemUuaGVpZ2h0IC0gc2l6ZS5zY3JvbGxlckhlaWdodCkgLyBsaW5lSGVpZ2h0KSksXG4gICAgICAgICAgICBoZWlnaHQ6IHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHRcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gY2hhbmdlcztcbiAgICB9XG5cbiAgICBwcml2YXRlICR1cGRhdGVMaW5lcygpIHtcbiAgICAgICAgdmFyIGZpcnN0Um93ID0gdGhpcy4kY2hhbmdlZExpbmVzLmZpcnN0Um93O1xuICAgICAgICB2YXIgbGFzdFJvdyA9IHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93O1xuICAgICAgICB0aGlzLiRjaGFuZ2VkTGluZXMgPSBudWxsO1xuXG4gICAgICAgIHZhciBsYXllckNvbmZpZyA9IHRoaXMubGF5ZXJDb25maWc7XG5cbiAgICAgICAgaWYgKGZpcnN0Um93ID4gbGF5ZXJDb25maWcubGFzdFJvdyArIDEpIHsgcmV0dXJuOyB9XG4gICAgICAgIGlmIChsYXN0Um93IDwgbGF5ZXJDb25maWcuZmlyc3RSb3cpIHsgcmV0dXJuOyB9XG5cbiAgICAgICAgLy8gaWYgdGhlIGxhc3Qgcm93IGlzIHVua25vd24gLT4gcmVkcmF3IGV2ZXJ5dGhpbmdcbiAgICAgICAgaWYgKGxhc3RSb3cgPT09IEluZmluaXR5KSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2hvd0d1dHRlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUobGF5ZXJDb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZShsYXllckNvbmZpZyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBlbHNlIHVwZGF0ZSBvbmx5IHRoZSBjaGFuZ2VkIHJvd3NcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZUxpbmVzKGxheWVyQ29uZmlnLCBmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGdldExvbmdlc3RMaW5lKCk6IG51bWJlciB7XG4gICAgICAgIHZhciBjaGFyQ291bnQgPSB0aGlzLnNlc3Npb24uZ2V0U2NyZWVuV2lkdGgoKTtcbiAgICAgICAgaWYgKHRoaXMuc2hvd0ludmlzaWJsZXMgJiYgIXRoaXMuc2Vzc2lvbi4kdXNlV3JhcE1vZGUpXG4gICAgICAgICAgICBjaGFyQ291bnQgKz0gMTtcblxuICAgICAgICByZXR1cm4gTWF0aC5tYXgodGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gMiAqIHRoaXMuJHBhZGRpbmcsIE1hdGgucm91bmQoY2hhckNvdW50ICogdGhpcy5jaGFyYWN0ZXJXaWR0aCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjaGVkdWxlcyBhbiB1cGRhdGUgdG8gYWxsIHRoZSBmcm9udCBtYXJrZXJzIGluIHRoZSBkb2N1bWVudC5cbiAgICAgKi9cbiAgICB1cGRhdGVGcm9udE1hcmtlcnMoKSB7XG4gICAgICAgIHRoaXMuJG1hcmtlckZyb250LnNldE1hcmtlcnModGhpcy5zZXNzaW9uLmdldE1hcmtlcnMoLyppbkZyb250PSovdHJ1ZSkpO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9NQVJLRVJfRlJPTlQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjaGVkdWxlcyBhbiB1cGRhdGUgdG8gYWxsIHRoZSBiYWNrIG1hcmtlcnMgaW4gdGhlIGRvY3VtZW50LlxuICAgICAqL1xuICAgIHVwZGF0ZUJhY2tNYXJrZXJzKCkge1xuICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnNldE1hcmtlcnModGhpcy5zZXNzaW9uLmdldE1hcmtlcnMoZmFsc2UpKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfTUFSS0VSX0JBQ0spO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlZHJhdyBicmVha3BvaW50cy5cbiAgICAgKi9cbiAgICB1cGRhdGVCcmVha3BvaW50cygpIHtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfR1VUVEVSKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGFubm90YXRpb25zIGZvciB0aGUgZ3V0dGVyLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRBbm5vdGF0aW9uc1xuICAgICAqIEBwYXJhbSB7QW5ub3RhdGlvbltdfSBhbm5vdGF0aW9ucyBBbiBhcnJheSBjb250YWluaW5nIGFubm90YXRpb25zLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0QW5ub3RhdGlvbnMoYW5ub3RhdGlvbnM6IEFubm90YXRpb25bXSk6IHZvaWQge1xuICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5zZXRBbm5vdGF0aW9ucyhhbm5vdGF0aW9ucyk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0dVVFRFUik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVXBkYXRlcyB0aGUgY3Vyc29yIGljb24uXG4gICAgICovXG4gICAgdXBkYXRlQ3Vyc29yKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9DVVJTT1IpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEhpZGVzIHRoZSBjdXJzb3IgaWNvbi5cbiAgICAgKi9cbiAgICBoaWRlQ3Vyc29yKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5oaWRlQ3Vyc29yKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2hvd3MgdGhlIGN1cnNvciBpY29uLlxuICAgICAqL1xuICAgIHNob3dDdXJzb3IoKSB7XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnNob3dDdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHNjcm9sbFNlbGVjdGlvbkludG9WaWV3XG4gICAgICogQHBhcmFtIGFuY2hvciB7UG9zaXRpb259XG4gICAgICogQHBhcmFtIGxlYWQge1Bvc2l0aW9ufVxuICAgICAqIEBwYXJhbSBbb2Zmc2V0XSB7bnVtYmVyfVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2Nyb2xsU2VsZWN0aW9uSW50b1ZpZXcoYW5jaG9yOiBQb3NpdGlvbiwgbGVhZDogUG9zaXRpb24sIG9mZnNldD86IG51bWJlcik6IHZvaWQge1xuICAgICAgICAvLyBmaXJzdCBzY3JvbGwgYW5jaG9yIGludG8gdmlldyB0aGVuIHNjcm9sbCBsZWFkIGludG8gdmlld1xuICAgICAgICB0aGlzLnNjcm9sbEN1cnNvckludG9WaWV3KGFuY2hvciwgb2Zmc2V0KTtcbiAgICAgICAgdGhpcy5zY3JvbGxDdXJzb3JJbnRvVmlldyhsZWFkLCBvZmZzZXQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdGhlIGN1cnNvciBpbnRvIHRoZSBmaXJzdCB2aXNpYmlsZSBhcmVhIG9mIHRoZSBlZGl0b3IuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNjcm9sbEN1cnNvckludG9WaWV3XG4gICAgICogQHBhcmFtIGN1cnNvciB7UG9zaXRpb259XG4gICAgICogQHBhcmFtIFtvZmZzZXRdIHtudW1iZXJ9XG4gICAgICogQHBhcmFtIFskdmlld01hcmdpbl0ge3t0b3A6IG51bWJlcjsgYm90dG9tOiBudW1iZXJ9fVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2Nyb2xsQ3Vyc29ySW50b1ZpZXcoY3Vyc29yPzogUG9zaXRpb24sIG9mZnNldD86IG51bWJlciwgJHZpZXdNYXJnaW4/OiB7IHRvcDogbnVtYmVyOyBib3R0b206IG51bWJlciB9KTogdm9pZCB7XG4gICAgICAgIC8vIHRoZSBlZGl0b3IgaXMgbm90IHZpc2libGVcbiAgICAgICAgaWYgKHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgPT09IDApXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuJGN1cnNvckxheWVyLmdldFBpeGVsUG9zaXRpb24oY3Vyc29yKTtcblxuICAgICAgICB2YXIgbGVmdCA9IHBvcy5sZWZ0O1xuICAgICAgICB2YXIgdG9wID0gcG9zLnRvcDtcblxuICAgICAgICB2YXIgdG9wTWFyZ2luID0gJHZpZXdNYXJnaW4gJiYgJHZpZXdNYXJnaW4udG9wIHx8IDA7XG4gICAgICAgIHZhciBib3R0b21NYXJnaW4gPSAkdmlld01hcmdpbiAmJiAkdmlld01hcmdpbi5ib3R0b20gfHwgMDtcblxuICAgICAgICB2YXIgc2Nyb2xsVG9wID0gdGhpcy4kc2Nyb2xsQW5pbWF0aW9uID8gdGhpcy5zZXNzaW9uLmdldFNjcm9sbFRvcCgpIDogdGhpcy5zY3JvbGxUb3A7XG5cbiAgICAgICAgaWYgKHNjcm9sbFRvcCArIHRvcE1hcmdpbiA+IHRvcCkge1xuICAgICAgICAgICAgaWYgKG9mZnNldClcbiAgICAgICAgICAgICAgICB0b3AgLT0gb2Zmc2V0ICogdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodDtcbiAgICAgICAgICAgIGlmICh0b3AgPT09IDApXG4gICAgICAgICAgICAgICAgdG9wID0gLXRoaXMuc2Nyb2xsTWFyZ2luLnRvcDtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AodG9wKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzY3JvbGxUb3AgKyB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0IC0gYm90dG9tTWFyZ2luIDwgdG9wICsgdGhpcy5saW5lSGVpZ2h0KSB7XG4gICAgICAgICAgICBpZiAob2Zmc2V0KVxuICAgICAgICAgICAgICAgIHRvcCArPSBvZmZzZXQgKiB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0O1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcCh0b3AgKyB0aGlzLmxpbmVIZWlnaHQgLSB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzY3JvbGxMZWZ0ID0gdGhpcy5zY3JvbGxMZWZ0O1xuXG4gICAgICAgIGlmIChzY3JvbGxMZWZ0ID4gbGVmdCkge1xuICAgICAgICAgICAgaWYgKGxlZnQgPCB0aGlzLiRwYWRkaW5nICsgMiAqIHRoaXMubGF5ZXJDb25maWcuY2hhcmFjdGVyV2lkdGgpXG4gICAgICAgICAgICAgICAgbGVmdCA9IC10aGlzLnNjcm9sbE1hcmdpbi5sZWZ0O1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQobGVmdCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoc2Nyb2xsTGVmdCArIHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCA8IGxlZnQgKyB0aGlzLmNoYXJhY3RlcldpZHRoKSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdChNYXRoLnJvdW5kKGxlZnQgKyB0aGlzLmNoYXJhY3RlcldpZHRoIC0gdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoKSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoc2Nyb2xsTGVmdCA8PSB0aGlzLiRwYWRkaW5nICYmIGxlZnQgLSBzY3JvbGxMZWZ0IDwgdGhpcy5jaGFyYWN0ZXJXaWR0aCkge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQoMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIHs6RWRpdFNlc3Npb24uZ2V0U2Nyb2xsVG9wfVxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZ2V0U2Nyb2xsVG9wXG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0U2Nyb2xsVG9wKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiB7OkVkaXRTZXNzaW9uLmdldFNjcm9sbExlZnR9XG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRTY3JvbGxMZWZ0XG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0U2Nyb2xsTGVmdCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFNjcm9sbExlZnQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBmaXJzdCB2aXNpYmxlIHJvdywgcmVnYXJkbGVzcyBvZiB3aGV0aGVyIGl0J3MgZnVsbHkgdmlzaWJsZSBvciBub3QuXG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0U2Nyb2xsVG9wUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcm9sbFRvcCAvIHRoaXMubGluZUhlaWdodDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBsYXN0IHZpc2libGUgcm93LCByZWdhcmRsZXNzIG9mIHdoZXRoZXIgaXQncyBmdWxseSB2aXNpYmxlIG9yIG5vdC5cbiAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxCb3R0b21Sb3coKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIE1hdGgubWF4KDAsIE1hdGguZmxvb3IoKHRoaXMuc2Nyb2xsVG9wICsgdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCkgLyB0aGlzLmxpbmVIZWlnaHQpIC0gMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBHcmFjZWZ1bGx5IHNjcm9sbHMgZnJvbSB0aGUgdG9wIG9mIHRoZSBlZGl0b3IgdG8gdGhlIHJvdyBpbmRpY2F0ZWQuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IEEgcm93IGlkXG4gICAgKlxuICAgICpcbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLnNldFNjcm9sbFRvcFxuICAgICoqL1xuICAgIHNjcm9sbFRvUm93KHJvdzogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3Aocm93ICogdGhpcy5saW5lSGVpZ2h0KTtcbiAgICB9XG5cbiAgICBhbGlnbkN1cnNvcihjdXJzb3IvKjogUG9zaXRpb24qLywgYWxpZ25tZW50OiBudW1iZXIpIHtcbiAgICAgICAgLy8gRklYTUU6IERvbid0IGhhdmUgcG9seW1vcnBoaWMgY3Vyc29yIHBhcmFtZXRlci5cbiAgICAgICAgaWYgKHR5cGVvZiBjdXJzb3IgPT0gXCJudW1iZXJcIilcbiAgICAgICAgICAgIGN1cnNvciA9IHsgcm93OiBjdXJzb3IsIGNvbHVtbjogMCB9O1xuXG4gICAgICAgIHZhciBwb3MgPSB0aGlzLiRjdXJzb3JMYXllci5nZXRQaXhlbFBvc2l0aW9uKGN1cnNvcik7XG4gICAgICAgIHZhciBoID0gdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCAtIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgdmFyIG9mZnNldCA9IHBvcy50b3AgLSBoICogKGFsaWdubWVudCB8fCAwKTtcblxuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKG9mZnNldCk7XG4gICAgICAgIHJldHVybiBvZmZzZXQ7XG4gICAgfVxuXG4gICAgJGNhbGNTdGVwcyhmcm9tVmFsdWU6IG51bWJlciwgdG9WYWx1ZTogbnVtYmVyKTogbnVtYmVyW10ge1xuICAgICAgICB2YXIgaTogbnVtYmVyID0gMDtcbiAgICAgICAgdmFyIGw6IG51bWJlciA9IHRoaXMuU1RFUFM7XG4gICAgICAgIHZhciBzdGVwczogbnVtYmVyW10gPSBbXTtcblxuICAgICAgICB2YXIgZnVuYyA9IGZ1bmN0aW9uKHQ6IG51bWJlciwgeF9taW46IG51bWJlciwgZHg6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgICAgICByZXR1cm4gZHggKiAoTWF0aC5wb3codCAtIDEsIDMpICsgMSkgKyB4X21pbjtcbiAgICAgICAgfTtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbDsgKytpKSB7XG4gICAgICAgICAgICBzdGVwcy5wdXNoKGZ1bmMoaSAvIHRoaXMuU1RFUFMsIGZyb21WYWx1ZSwgdG9WYWx1ZSAtIGZyb21WYWx1ZSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHN0ZXBzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdyYWNlZnVsbHkgc2Nyb2xscyB0aGUgZWRpdG9yIHRvIHRoZSByb3cgaW5kaWNhdGVkLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsaW5lIEEgbGluZSBudW1iZXJcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGNlbnRlciBJZiBgdHJ1ZWAsIGNlbnRlcnMgdGhlIGVkaXRvciB0aGUgdG8gaW5kaWNhdGVkIGxpbmVcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFuaW1hdGUgSWYgYHRydWVgIGFuaW1hdGVzIHNjcm9sbGluZ1xuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBhZnRlciB0aGUgYW5pbWF0aW9uIGhhcyBmaW5pc2hlZFxuICAgICAqL1xuICAgIHNjcm9sbFRvTGluZShsaW5lOiBudW1iZXIsIGNlbnRlcjogYm9vbGVhbiwgYW5pbWF0ZTogYm9vbGVhbiwgY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuJGN1cnNvckxheWVyLmdldFBpeGVsUG9zaXRpb24oeyByb3c6IGxpbmUsIGNvbHVtbjogMCB9KTtcbiAgICAgICAgdmFyIG9mZnNldCA9IHBvcy50b3A7XG4gICAgICAgIGlmIChjZW50ZXIpIHtcbiAgICAgICAgICAgIG9mZnNldCAtPSB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0IC8gMjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpbml0aWFsU2Nyb2xsID0gdGhpcy5zY3JvbGxUb3A7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3Aob2Zmc2V0KTtcbiAgICAgICAgaWYgKGFuaW1hdGUgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLmFuaW1hdGVTY3JvbGxpbmcoaW5pdGlhbFNjcm9sbCwgY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYW5pbWF0ZVNjcm9sbGluZyhmcm9tVmFsdWU6IG51bWJlciwgY2FsbGJhY2s/KSB7XG4gICAgICAgIHZhciB0b1ZhbHVlID0gdGhpcy5zY3JvbGxUb3A7XG4gICAgICAgIGlmICghdGhpcy4kYW5pbWF0ZWRTY3JvbGwpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuXG4gICAgICAgIGlmIChmcm9tVmFsdWUgPT0gdG9WYWx1ZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBpZiAodGhpcy4kc2Nyb2xsQW5pbWF0aW9uKSB7XG4gICAgICAgICAgICB2YXIgb2xkU3RlcHMgPSB0aGlzLiRzY3JvbGxBbmltYXRpb24uc3RlcHM7XG4gICAgICAgICAgICBpZiAob2xkU3RlcHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgZnJvbVZhbHVlID0gb2xkU3RlcHNbMF07XG4gICAgICAgICAgICAgICAgaWYgKGZyb21WYWx1ZSA9PSB0b1ZhbHVlKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc3RlcHMgPSBfc2VsZi4kY2FsY1N0ZXBzKGZyb21WYWx1ZSwgdG9WYWx1ZSk7XG4gICAgICAgIHRoaXMuJHNjcm9sbEFuaW1hdGlvbiA9IHsgZnJvbTogZnJvbVZhbHVlLCB0bzogdG9WYWx1ZSwgc3RlcHM6IHN0ZXBzIH07XG5cbiAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLiR0aW1lcik7XG5cbiAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxUb3Aoc3RlcHMuc2hpZnQoKSk7XG4gICAgICAgIC8vIHRyaWNrIHNlc3Npb24gdG8gdGhpbmsgaXQncyBhbHJlYWR5IHNjcm9sbGVkIHRvIG5vdCBsb29zZSB0b1ZhbHVlXG4gICAgICAgIF9zZWxmLnNlc3Npb24uJHNjcm9sbFRvcCA9IHRvVmFsdWU7XG4gICAgICAgIHRoaXMuJHRpbWVyID0gc2V0SW50ZXJ2YWwoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoc3RlcHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxUb3Aoc3RlcHMuc2hpZnQoKSk7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi4kc2Nyb2xsVG9wID0gdG9WYWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodG9WYWx1ZSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi4kc2Nyb2xsVG9wID0gLTE7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxUb3AodG9WYWx1ZSk7XG4gICAgICAgICAgICAgICAgdG9WYWx1ZSA9IG51bGw7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGRvIHRoaXMgb24gc2VwYXJhdGUgc3RlcCB0byBub3QgZ2V0IHNwdXJpb3VzIHNjcm9sbCBldmVudCBmcm9tIHNjcm9sbGJhclxuICAgICAgICAgICAgICAgIF9zZWxmLiR0aW1lciA9IGNsZWFySW50ZXJ2YWwoX3NlbGYuJHRpbWVyKTtcbiAgICAgICAgICAgICAgICBfc2VsZi4kc2Nyb2xsQW5pbWF0aW9uID0gbnVsbDtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayAmJiBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCAxMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xscyB0aGUgZWRpdG9yIHRvIHRoZSB5IHBpeGVsIGluZGljYXRlZC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc2Nyb2xsVG9wIFRoZSBwb3NpdGlvbiB0byBzY3JvbGwgdG9cbiAgICAgKi9cbiAgICBzY3JvbGxUb1koc2Nyb2xsVG9wOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgLy8gYWZ0ZXIgY2FsbGluZyBzY3JvbGxCYXIuc2V0U2Nyb2xsVG9wXG4gICAgICAgIC8vIHNjcm9sbGJhciBzZW5kcyB1cyBldmVudCB3aXRoIHNhbWUgc2Nyb2xsVG9wLiBpZ25vcmUgaXRcbiAgICAgICAgaWYgKHRoaXMuc2Nyb2xsVG9wICE9PSBzY3JvbGxUb3ApIHtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsVG9wID0gc2Nyb2xsVG9wO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdGhlIGVkaXRvciBhY3Jvc3MgdGhlIHgtYXhpcyB0byB0aGUgcGl4ZWwgaW5kaWNhdGVkLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JvbGxMZWZ0IFRoZSBwb3NpdGlvbiB0byBzY3JvbGwgdG9cbiAgICAgKiovXG4gICAgc2Nyb2xsVG9YKHNjcm9sbExlZnQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5zY3JvbGxMZWZ0ICE9PSBzY3JvbGxMZWZ0KSB7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbExlZnQgPSBzY3JvbGxMZWZ0O1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfSF9TQ1JPTEwpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTY3JvbGxzIHRoZSBlZGl0b3IgYWNyb3NzIGJvdGggeC0gYW5kIHktYXhlcy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSB4IFRoZSB4IHZhbHVlIHRvIHNjcm9sbCB0b1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IHkgVGhlIHkgdmFsdWUgdG8gc2Nyb2xsIHRvXG4gICAgKiovXG4gICAgc2Nyb2xsVG8oeDogbnVtYmVyLCB5OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcCh5KTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQoeSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xscyB0aGUgZWRpdG9yIGFjcm9zcyBib3RoIHgtIGFuZCB5LWF4ZXMuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNjcm9sbEJ5XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlbHRhWCBUaGUgeCB2YWx1ZSB0byBzY3JvbGwgYnlcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZGVsdGFZIFRoZSB5IHZhbHVlIHRvIHNjcm9sbCBieVxuICAgICAqL1xuICAgIHNjcm9sbEJ5KGRlbHRhWDogbnVtYmVyLCBkZWx0YVk6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBkZWx0YVkgJiYgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcCh0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgKyBkZWx0YVkpO1xuICAgICAgICBkZWx0YVggJiYgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQodGhpcy5zZXNzaW9uLmdldFNjcm9sbExlZnQoKSArIGRlbHRhWCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB5b3UgY2FuIHN0aWxsIHNjcm9sbCBieSBlaXRoZXIgcGFyYW1ldGVyOyBpbiBvdGhlciB3b3JkcywgeW91IGhhdmVuJ3QgcmVhY2hlZCB0aGUgZW5kIG9mIHRoZSBmaWxlIG9yIGxpbmUuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZGVsdGFYIFRoZSB4IHZhbHVlIHRvIHNjcm9sbCBieVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlbHRhWSBUaGUgeSB2YWx1ZSB0byBzY3JvbGwgYnlcbiAgICAqXG4gICAgKlxuICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAqKi9cbiAgICBpc1Njcm9sbGFibGVCeShkZWx0YVg6IG51bWJlciwgZGVsdGFZOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgaWYgKGRlbHRhWSA8IDAgJiYgdGhpcy5zZXNzaW9uLmdldFNjcm9sbFRvcCgpID49IDEgLSB0aGlzLnNjcm9sbE1hcmdpbi50b3ApXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgaWYgKGRlbHRhWSA+IDAgJiYgdGhpcy5zZXNzaW9uLmdldFNjcm9sbFRvcCgpICsgdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodFxuICAgICAgICAgICAgLSB0aGlzLmxheWVyQ29uZmlnLm1heEhlaWdodCA8IC0xICsgdGhpcy5zY3JvbGxNYXJnaW4uYm90dG9tKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGlmIChkZWx0YVggPCAwICYmIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxMZWZ0KCkgPj0gMSAtIHRoaXMuc2Nyb2xsTWFyZ2luLmxlZnQpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgaWYgKGRlbHRhWCA+IDAgJiYgdGhpcy5zZXNzaW9uLmdldFNjcm9sbExlZnQoKSArIHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aFxuICAgICAgICAgICAgLSB0aGlzLmxheWVyQ29uZmlnLndpZHRoIDwgLTEgKyB0aGlzLnNjcm9sbE1hcmdpbi5yaWdodClcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHBpeGVsVG9TY3JlZW5Db29yZGluYXRlcyh4OiBudW1iZXIsIHk6IG51bWJlcikge1xuICAgICAgICB2YXIgY2FudmFzUG9zID0gdGhpcy5zY3JvbGxlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblxuICAgICAgICB2YXIgb2Zmc2V0ID0gKHggKyB0aGlzLnNjcm9sbExlZnQgLSBjYW52YXNQb3MubGVmdCAtIHRoaXMuJHBhZGRpbmcpIC8gdGhpcy5jaGFyYWN0ZXJXaWR0aDtcbiAgICAgICAgdmFyIHJvdyA9IE1hdGguZmxvb3IoKHkgKyB0aGlzLnNjcm9sbFRvcCAtIGNhbnZhc1Bvcy50b3ApIC8gdGhpcy5saW5lSGVpZ2h0KTtcbiAgICAgICAgdmFyIGNvbCA9IE1hdGgucm91bmQob2Zmc2V0KTtcblxuICAgICAgICByZXR1cm4geyByb3c6IHJvdywgY29sdW1uOiBjb2wsIHNpZGU6IG9mZnNldCAtIGNvbCA+IDAgPyAxIDogLTEgfTtcbiAgICB9XG5cbiAgICBzY3JlZW5Ub1RleHRDb29yZGluYXRlcyhjbGllbnRYOiBudW1iZXIsIGNsaWVudFk6IG51bWJlcik6IFBvc2l0aW9uIHtcbiAgICAgICAgdmFyIGNhbnZhc1BvcyA9IHRoaXMuc2Nyb2xsZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICAgICAgdmFyIGNvbHVtbiA9IE1hdGgucm91bmQoKGNsaWVudFggKyB0aGlzLnNjcm9sbExlZnQgLSBjYW52YXNQb3MubGVmdCAtIHRoaXMuJHBhZGRpbmcpIC8gdGhpcy5jaGFyYWN0ZXJXaWR0aCk7XG5cbiAgICAgICAgdmFyIHJvdyA9IChjbGllbnRZICsgdGhpcy5zY3JvbGxUb3AgLSBjYW52YXNQb3MudG9wKSAvIHRoaXMubGluZUhlaWdodDtcblxuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihyb3csIE1hdGgubWF4KGNvbHVtbiwgMCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgYHBhZ2VYYCBhbmQgYHBhZ2VZYCBjb29yZGluYXRlcyBvZiB0aGUgZG9jdW1lbnQgcG9zaXRpb24uXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSBkb2N1bWVudCByb3cgcG9zaXRpb25cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGRvY3VtZW50IGNvbHVtbiBwb3NpdGlvblxuICAgICogQHJldHVybiB7T2JqZWN0fVxuICAgICoqL1xuICAgIHRleHRUb1NjcmVlbkNvb3JkaW5hdGVzKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHsgcGFnZVg6IG51bWJlcjsgcGFnZVk6IG51bWJlciB9IHtcbiAgICAgICAgdmFyIGNhbnZhc1BvcyA9IHRoaXMuc2Nyb2xsZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLnNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKHJvdywgY29sdW1uKTtcblxuICAgICAgICB2YXIgeCA9IHRoaXMuJHBhZGRpbmcgKyBNYXRoLnJvdW5kKHBvcy5jb2x1bW4gKiB0aGlzLmNoYXJhY3RlcldpZHRoKTtcbiAgICAgICAgdmFyIHkgPSBwb3Mucm93ICogdGhpcy5saW5lSGVpZ2h0O1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBwYWdlWDogY2FudmFzUG9zLmxlZnQgKyB4IC0gdGhpcy5zY3JvbGxMZWZ0LFxuICAgICAgICAgICAgcGFnZVk6IGNhbnZhc1Bvcy50b3AgKyB5IC0gdGhpcy5zY3JvbGxUb3BcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBGb2N1c2VzIHRoZSBjdXJyZW50IGNvbnRhaW5lci5cbiAgICAqKi9cbiAgICB2aXN1YWxpemVGb2N1cygpIHtcbiAgICAgICAgYWRkQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIFwiYWNlX2ZvY3VzXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIEJsdXJzIHRoZSBjdXJyZW50IGNvbnRhaW5lci5cbiAgICAqKi9cbiAgICB2aXN1YWxpemVCbHVyKCkge1xuICAgICAgICByZW1vdmVDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgXCJhY2VfZm9jdXNcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBzaG93Q29tcG9zaXRpb25cbiAgICAgKiBAcGFyYW0gcG9zaXRpb25cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHNob3dDb21wb3NpdGlvbihwb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSkge1xuICAgICAgICBpZiAoIXRoaXMuJGNvbXBvc2l0aW9uKVxuICAgICAgICAgICAgdGhpcy4kY29tcG9zaXRpb24gPSB7XG4gICAgICAgICAgICAgICAga2VlcFRleHRBcmVhQXRDdXJzb3I6IHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yLFxuICAgICAgICAgICAgICAgIGNzc1RleHQ6IHRoaXMudGV4dGFyZWEuc3R5bGUuY3NzVGV4dFxuICAgICAgICAgICAgfTtcblxuICAgICAgICB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IHRydWU7XG4gICAgICAgIGFkZENzc0NsYXNzKHRoaXMudGV4dGFyZWEsIFwiYWNlX2NvbXBvc2l0aW9uXCIpO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLmNzc1RleHQgPSBcIlwiO1xuICAgICAgICB0aGlzLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IEEgc3RyaW5nIG9mIHRleHQgdG8gdXNlXG4gICAgICpcbiAgICAgKiBTZXRzIHRoZSBpbm5lciB0ZXh0IG9mIHRoZSBjdXJyZW50IGNvbXBvc2l0aW9uIHRvIGB0ZXh0YC5cbiAgICAgKi9cbiAgICBzZXRDb21wb3NpdGlvblRleHQodGV4dD86IHN0cmluZyk6IHZvaWQge1xuICAgICAgICAvLyBUT0RPOiBXaHkgaXMgdGhlIHBhcmFtZXRlciBub3QgdXNlZD9cbiAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBIaWRlcyB0aGUgY3VycmVudCBjb21wb3NpdGlvbi5cbiAgICAgKi9cbiAgICBoaWRlQ29tcG9zaXRpb24oKSB7XG4gICAgICAgIGlmICghdGhpcy4kY29tcG9zaXRpb24pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlbW92ZUNzc0NsYXNzKHRoaXMudGV4dGFyZWEsIFwiYWNlX2NvbXBvc2l0aW9uXCIpO1xuICAgICAgICB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IHRoaXMuJGNvbXBvc2l0aW9uLmtlZXBUZXh0QXJlYUF0Q3Vyc29yO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLmNzc1RleHQgPSB0aGlzLiRjb21wb3NpdGlvbi5jc3NUZXh0O1xuICAgICAgICB0aGlzLiRjb21wb3NpdGlvbiA9IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBhIG5ldyB0aGVtZSBmb3IgdGhlIGVkaXRvci5cbiAgICAgKiBUaGlzIGlzIGEgc3luY2hyb25vdXMgbWV0aG9kLlxuICAgICAqL1xuICAgIHNldFRoZW1lKG1vZEpzOiB7IGNzc1RleHQ6IHN0cmluZzsgY3NzQ2xhc3M6IHN0cmluZzsgaXNEYXJrOiBib29sZWFuOyBwYWRkaW5nOiBudW1iZXIgfSk6IHZvaWQge1xuXG4gICAgICAgIGlmICghbW9kSnMuY3NzQ2xhc3MpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGVuc3VyZUhUTUxTdHlsZUVsZW1lbnQobW9kSnMuY3NzVGV4dCwgbW9kSnMuY3NzQ2xhc3MsIHRoaXMuY29udGFpbmVyLm93bmVyRG9jdW1lbnQpO1xuXG4gICAgICAgIGlmICh0aGlzLnRoZW1lKSB7XG4gICAgICAgICAgICByZW1vdmVDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgdGhpcy50aGVtZS5jc3NDbGFzcyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcGFkZGluZyA9IFwicGFkZGluZ1wiIGluIG1vZEpzID8gbW9kSnMucGFkZGluZyA6IFwicGFkZGluZ1wiIGluICh0aGlzLnRoZW1lIHx8IHt9KSA/IDQgOiB0aGlzLiRwYWRkaW5nO1xuXG4gICAgICAgIGlmICh0aGlzLiRwYWRkaW5nICYmIHBhZGRpbmcgIT0gdGhpcy4kcGFkZGluZykge1xuICAgICAgICAgICAgdGhpcy5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy50aGVtZSA9IG1vZEpzO1xuICAgICAgICB0aGlzLmFkZENzc0NsYXNzKG1vZEpzLmNzc0NsYXNzKTtcbiAgICAgICAgdGhpcy5zZXRDc3NDbGFzcyhcImFjZV9kYXJrXCIsIG1vZEpzLmlzRGFyayk7XG5cbiAgICAgICAgLy8gZm9yY2UgcmUtbWVhc3VyZSBvZiB0aGUgZ3V0dGVyIHdpZHRoXG4gICAgICAgIGlmICh0aGlzLiRzaXplKSB7XG4gICAgICAgICAgICB0aGlzLiRzaXplLndpZHRoID0gMDtcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVNpemVBc3luYygpO1xuICAgICAgICB9XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCB0aGVtZUxvYWRlZFxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fZW1pdCgndGhlbWVMb2FkZWQnLCB7IHRoZW1lOiBtb2RKcyB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIGFkZENzc0NsYXNzXG4gICAgICogQHBhcmFtIGNzc0NsYXNzIHtzdHJpbmd9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBhZGRDc3NDbGFzcyhjc3NDbGFzczogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGFkZENzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBjc3NDbGFzcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBzZXRDc3NDbGFzc1xuICAgICAqIEBwYXJhbSBjbGFzc05hbWU6IHtzdHJpbmd9XG4gICAgICogQHBhcmFtIGluY2x1ZGUge2Jvb2xlYW59XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRDc3NDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgaW5jbHVkZTogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICBzZXRDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgY2xhc3NOYW1lLCBpbmNsdWRlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbXBvcnRzIGEgbmV3IHRoZW1lIGZvciB0aGUgZWRpdG9yIHVzaW5nIHRoZSBTeXN0ZW0gTG9hZGVyLlxuICAgICAqIGB0aGVtZWAgc2hvdWxkIGV4aXN0LCBhbmQgYmUgYSBkaXJlY3RvcnkgcGF0aCwgbGlrZSBgYWNlL3RoZW1lL3RleHRtYXRlYC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgaW1wb3J0VGhlbWVMaW5rXG4gICAgICogQHBhcmFtIHRoZW1lTmFtZSB7c3RyaW5nfSBUaGUgbmFtZSBvZiBhIHRoZW1lIG1vZHVsZS5cbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlPFRoZW1lPn1cbiAgICAgKi9cbiAgICBpbXBvcnRUaGVtZUxpbmsodGhlbWVOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFRoZW1lTGluaz4ge1xuXG4gICAgICAgIGlmICghdGhlbWVOYW1lIHx8IHR5cGVvZiB0aGVtZU5hbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHRoZW1lTmFtZSA9IHRoZW1lTmFtZSB8fCB0aGlzLmdldE9wdGlvbihcInRoZW1lXCIpLmluaXRpYWxWYWx1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgdGhpcy4kdGhlbWVJZCA9IHRoZW1lTmFtZTtcblxuICAgICAgICAvLyBUT0RPOiBJcyB0aGlzIHRoZSByaWdodCBwbGFjZSB0byBlbWl0IHRoZSBldmVudD9cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCB0aGVtZUNoYW5nZVxuICAgICAgICAgKi9cbiAgICAgICAgX3NlbGYuZXZlbnRCdXMuX2VtaXQoJ3RoZW1lQ2hhbmdlJywgeyB0aGVtZTogdGhlbWVOYW1lIH0pO1xuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTxUaGVtZUxpbms+KGZ1bmN0aW9uKHN1Y2Nlc3MsIGZhaWwpIHtcbiAgICAgICAgICAgIC8vIFdlIHRha2UgYWR2YW50YWdlIG9mIHRoZSBjb25maWd1cmFiaWxpdHkgb2YgdGhlIFN5c3RlbSBMb2FkZXIuXG4gICAgICAgICAgICAvLyBCZWNhdXNlIHdlIGFyZSBsb2FkaW5nIENTUywgd2UgcmVwbGFjZSB0aGUgaW5zdGFudGlhdGlvbi5cbiAgICAgICAgICAgIFN5c3RlbS5pbXBvcnQodGhlbWVOYW1lKVxuICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uKG06IGFueSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgaXNEYXJrOiBib29sZWFuID0gbS5pc0Rhcms7XG4gICAgICAgICAgICAgICAgICAgIHZhciBpZDogc3RyaW5nID0gbS5jc3NDbGFzcztcbiAgICAgICAgICAgICAgICAgICAgdmFyIGhyZWY6IHN0cmluZyA9IG0uY3NzTmFtZTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHBhZGRpbmc6IG51bWJlciA9ICh0eXBlb2YgbS5wYWRkaW5nID09PSAnbnVtYmVyJykgPyBtLnBhZGRpbmcgOiAwO1xuICAgICAgICAgICAgICAgICAgICB2YXIgdGhlbWUgPSBuZXcgVGhlbWVMaW5rKGlzRGFyaywgaWQsICdzdHlsZXNoZWV0JywgJ3RleHQvY3NzJywgaHJlZiwgcGFkZGluZyk7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3ModGhlbWUpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYCR7cmVhc29ufWApO1xuICAgICAgICAgICAgICAgICAgICBmYWlsKHJlYXNvbik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgc2V0VGhlbWVDc3NcbiAgICAgKiBAcGFyYW0gY3NzQ2xhc3Mge3N0cmluZ31cbiAgICAgKiBAcGFyYW0gaHJlZiB7c3RyaW5nfVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0VGhlbWVDc3MoY3NzQ2xhc3M6IHN0cmluZywgaHJlZjogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGFwcGVuZEhUTUxMaW5rRWxlbWVudChjc3NDbGFzcywgJ3N0eWxlc2hlZXQnLCAndGV4dC9jc3MnLCBocmVmLCBkb2N1bWVudCk7XG4gICAgICAgIHRoaXMuYWRkQ3NzQ2xhc3MoY3NzQ2xhc3MpO1xuICAgICAgICAvLyAgICAgIHRoaXMuc2V0Q3NzQ2xhc3MoXCJhY2VfZGFya1wiLCB0aGVtZUxpbmsuaXNEYXJrKTtcbiAgICAgICAgLy8gICAgICB0aGlzLnNldFBhZGRpbmcodGhlbWVMaW5rLnBhZGRpbmcpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHBhdGggb2YgdGhlIGN1cnJlbnQgdGhlbWUuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFRoZW1lXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIGdldFRoZW1lKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLiR0aGVtZUlkO1xuICAgIH1cblxuICAgIC8vIE1ldGhvZHMgYWxsb3dzIHRvIGFkZCAvIHJlbW92ZSBDU1MgY2xhc3NuYW1lcyB0byB0aGUgZWRpdG9yIGVsZW1lbnQuXG4gICAgLy8gVGhpcyBmZWF0dXJlIGNhbiBiZSB1c2VkIGJ5IHBsdWctaW5zIHRvIHByb3ZpZGUgYSB2aXN1YWwgaW5kaWNhdGlvbiBvZlxuICAgIC8vIGEgY2VydGFpbiBtb2RlIHRoYXQgZWRpdG9yIGlzIGluLlxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIG5ldyBjbGFzcywgYHN0eWxlYCwgdG8gdGhlIGVkaXRvci5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gc3R5bGUgQSBjbGFzcyBuYW1lXG4gICAgICpcbiAgICAgKi9cbiAgICBzZXRTdHlsZShzdHlsZTogc3RyaW5nLCBpbmNsdWRlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICBzZXRDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgc3R5bGUsIGluY2x1ZGUgIT09IGZhbHNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIHRoZSBjbGFzcyBgc3R5bGVgIGZyb20gdGhlIGVkaXRvci5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gc3R5bGUgQSBjbGFzcyBuYW1lXG4gICAgICovXG4gICAgdW5zZXRTdHlsZShzdHlsZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHJlbW92ZUNzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBzdHlsZSk7XG4gICAgfVxuXG4gICAgc2V0Q3Vyc29yU3R5bGUoc3R5bGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5jb250ZW50LnN0eWxlLmN1cnNvciAhPSBzdHlsZSkge1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLmN1cnNvciA9IHN0eWxlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGN1cnNvclN0eWxlIEEgY3NzIGN1cnNvciBzdHlsZVxuICAgICAqL1xuICAgIHNldE1vdXNlQ3Vyc29yKGN1cnNvclN0eWxlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLmN1cnNvciA9IGN1cnNvclN0eWxlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERlc3Ryb3lzIHRoZSB0ZXh0IGFuZCBjdXJzb3IgbGF5ZXJzIGZvciB0aGlzIHJlbmRlcmVyLlxuICAgICAqL1xuICAgIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci5kZXN0cm95KCk7XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLmRlc3Ryb3koKTtcbiAgICB9XG59XG5cbmRlZmluZU9wdGlvbnMoVmlydHVhbFJlbmRlcmVyLnByb3RvdHlwZSwgXCJyZW5kZXJlclwiLCB7XG4gICAgYW5pbWF0ZWRTY3JvbGw6IHsgaW5pdGlhbFZhbHVlOiBmYWxzZSB9LFxuICAgIHNob3dJbnZpc2libGVzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiR0ZXh0TGF5ZXIuc2V0U2hvd0ludmlzaWJsZXModmFsdWUpKVxuICAgICAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfVEVYVCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIHNob3dQcmludE1hcmdpbjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKCkgeyB0aGlzLiR1cGRhdGVQcmludE1hcmdpbigpOyB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIHByaW50TWFyZ2luQ29sdW1uOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oKSB7IHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7IH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogODBcbiAgICB9LFxuICAgIHByaW50TWFyZ2luOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbCA9PSBcIm51bWJlclwiKVxuICAgICAgICAgICAgICAgIHRoaXMuJHByaW50TWFyZ2luQ29sdW1uID0gdmFsO1xuICAgICAgICAgICAgdGhpcy4kc2hvd1ByaW50TWFyZ2luID0gISF2YWw7XG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVQcmludE1hcmdpbigpO1xuICAgICAgICB9LFxuICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuJHNob3dQcmludE1hcmdpbiAmJiB0aGlzLiRwcmludE1hcmdpbkNvbHVtbjtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgc2hvd0d1dHRlcjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3cpIHtcbiAgICAgICAgICAgIHRoaXMuJGd1dHRlci5zdHlsZS5kaXNwbGF5ID0gc2hvdyA/IFwiYmxvY2tcIiA6IFwibm9uZVwiO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9GVUxMKTtcbiAgICAgICAgICAgIHRoaXMub25HdXR0ZXJSZXNpemUoKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBmYWRlRm9sZFdpZGdldHM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG93KSB7XG4gICAgICAgICAgICBzZXRDc3NDbGFzcyh0aGlzLiRndXR0ZXIsIFwiYWNlX2ZhZGUtZm9sZC13aWRnZXRzXCIsIHNob3cpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBzaG93Rm9sZFdpZGdldHM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG93KSB7IHRoaXMuJGd1dHRlckxheWVyLnNldFNob3dGb2xkV2lkZ2V0cyhzaG93KSB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIHNob3dMaW5lTnVtYmVyczoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3cpIHtcbiAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnNldFNob3dMaW5lTnVtYmVycyhzaG93KTtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfR1VUVEVSKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBkaXNwbGF5SW5kZW50R3VpZGVzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllci5zZXREaXNwbGF5SW5kZW50R3VpZGVzKHNob3cpKVxuICAgICAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfVEVYVCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgaGlnaGxpZ2h0R3V0dGVyTGluZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3VsZEhpZ2hsaWdodCkge1xuICAgICAgICAgICAgaWYgKCF0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodCA9IGNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodC5jbGFzc05hbWUgPSBcImFjZV9ndXR0ZXItYWN0aXZlLWxpbmVcIjtcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXIuYXBwZW5kQ2hpbGQodGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0LnN0eWxlLmRpc3BsYXkgPSBzaG91bGRIaWdobGlnaHQgPyBcIlwiIDogXCJub25lXCI7XG4gICAgICAgICAgICAvLyBpZiBjdXJzb3JsYXllciBoYXZlIG5ldmVyIGJlZW4gdXBkYXRlZCB0aGVyZSdzIG5vdGhpbmcgb24gc2NyZWVuIHRvIHVwZGF0ZVxuICAgICAgICAgICAgaWYgKHRoaXMuJGN1cnNvckxheWVyLiRwaXhlbFBvcylcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0KCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2UsXG4gICAgICAgIHZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgaWYgKCF0aGlzLiRoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSB8fCAhdGhpcy4kaG9yaXpTY3JvbGwpXG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9TQ1JPTEwpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICB2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgaWYgKCF0aGlzLiR2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSB8fCAhdGhpcy4kdlNjcm9sbClcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX1NDUk9MTCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIGZvbnRTaXplOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oZm9udFNpemU6IHN0cmluZykge1xuICAgICAgICAgICAgdmFyIHRoYXQ6IFZpcnR1YWxSZW5kZXJlciA9IHRoaXM7XG4gICAgICAgICAgICB0aGF0LmNvbnRhaW5lci5zdHlsZS5mb250U2l6ZSA9IGZvbnRTaXplO1xuICAgICAgICAgICAgdGhhdC51cGRhdGVGb250U2l6ZSgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IFwiMTJweFwiXG4gICAgfSxcbiAgICBmb250RmFtaWx5OiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oZm9udEZhbWlseTogc3RyaW5nKSB7XG4gICAgICAgICAgICB2YXIgdGhhdDogVmlydHVhbFJlbmRlcmVyID0gdGhpcztcbiAgICAgICAgICAgIHRoYXQuY29udGFpbmVyLnN0eWxlLmZvbnRGYW1pbHkgPSBmb250RmFtaWx5O1xuICAgICAgICAgICAgdGhhdC51cGRhdGVGb250U2l6ZSgpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBtYXhMaW5lczoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgdGhpcy51cGRhdGVGdWxsKCk7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIG1pbkxpbmVzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUZ1bGwoKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgc2Nyb2xsUGFzdEVuZDoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgdmFsID0gK3ZhbCB8fCAwO1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNjcm9sbFBhc3RFbmQgPT0gdmFsKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHRoaXMuJHNjcm9sbFBhc3RFbmQgPSB2YWw7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX1NDUk9MTCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogMCxcbiAgICAgICAgaGFuZGxlc1NldDogdHJ1ZVxuICAgIH0sXG4gICAgZml4ZWRXaWR0aEd1dHRlcjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuJGZpeGVkV2lkdGggPSAhIXZhbDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfR1VUVEVSKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgdGhlbWU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5zZXRUaGVtZSh2YWwpIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLiR0aGVtZUlkIHx8IHRoaXMudGhlbWU7IH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogXCIuL3RoZW1lL3RleHRtYXRlXCIsXG4gICAgICAgIGhhbmRsZXNTZXQ6IHRydWVcbiAgICB9XG59KTtcbiJdfQ==