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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlydHVhbFJlbmRlcmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiVmlydHVhbFJlbmRlcmVyLnRzIl0sIm5hbWVzIjpbImNoYW5nZXNUb1N0cmluZyIsIlZpcnR1YWxSZW5kZXJlciIsIlZpcnR1YWxSZW5kZXJlci5jb25zdHJ1Y3RvciIsIlZpcnR1YWxSZW5kZXJlci5vbiIsIlZpcnR1YWxSZW5kZXJlci5vZmYiLCJWaXJ0dWFsUmVuZGVyZXIubWF4TGluZXMiLCJWaXJ0dWFsUmVuZGVyZXIua2VlcFRleHRBcmVhQXRDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0RGVmYXVsdEN1cnNvclN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEN1cnNvckxheWVyT2ZmIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUNoYXJhY3RlclNpemUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2Vzc2lvbiIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVMaW5lcyIsIlZpcnR1YWxSZW5kZXJlci5vbkNoYW5nZU5ld0xpbmVNb2RlIiwiVmlydHVhbFJlbmRlcmVyLm9uQ2hhbmdlVGFiU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVUZXh0IiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUZ1bGwiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlRm9udFNpemUiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNpemVBc3luYyIsIlZpcnR1YWxSZW5kZXJlci5vblJlc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci4kdXBkYXRlQ2FjaGVkU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5vbkd1dHRlclJlc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5hZGp1c3RXcmFwTGltaXQiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0QW5pbWF0ZWRTY3JvbGwiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0QW5pbWF0ZWRTY3JvbGwiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2hvd0ludmlzaWJsZXMiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2hvd0ludmlzaWJsZXMiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0RGlzcGxheUluZGVudEd1aWRlcyIsIlZpcnR1YWxSZW5kZXJlci5zZXREaXNwbGF5SW5kZW50R3VpZGVzIiwiVmlydHVhbFJlbmRlcmVyLnNldFNob3dQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRTaG93UHJpbnRNYXJnaW4iLCJWaXJ0dWFsUmVuZGVyZXIuc2V0UHJpbnRNYXJnaW5Db2x1bW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0UHJpbnRNYXJnaW5Db2x1bW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2hvd0d1dHRlciIsIlZpcnR1YWxSZW5kZXJlci5zZXRTaG93R3V0dGVyIiwiVmlydHVhbFJlbmRlcmVyLmdldEZhZGVGb2xkV2lkZ2V0cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRGYWRlRm9sZFdpZGdldHMiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0SGlnaGxpZ2h0R3V0dGVyTGluZSIsIlZpcnR1YWxSZW5kZXJlci5nZXRIaWdobGlnaHRHdXR0ZXJMaW5lIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0IiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRDb250YWluZXJFbGVtZW50IiwiVmlydHVhbFJlbmRlcmVyLmdldE1vdXNlRXZlbnRUYXJnZXQiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0VGV4dEFyZWFDb250YWluZXIiLCJWaXJ0dWFsUmVuZGVyZXIuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLmdldEZpcnN0VmlzaWJsZVJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRGaXJzdEZ1bGx5VmlzaWJsZVJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRMYXN0RnVsbHlWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLnNldFBhZGRpbmciLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2Nyb2xsTWFyZ2luIiwiVmlydHVhbFJlbmRlcmVyLmdldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLmdldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLnNldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVTY3JvbGxCYXJWIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVTY3JvbGxCYXJIIiwiVmlydHVhbFJlbmRlcmVyLmZyZWV6ZSIsIlZpcnR1YWxSZW5kZXJlci51bmZyZWV6ZSIsIlZpcnR1YWxSZW5kZXJlci4kcmVuZGVyQ2hhbmdlcyIsIlZpcnR1YWxSZW5kZXJlci4kYXV0b3NpemUiLCJWaXJ0dWFsUmVuZGVyZXIuJGNvbXB1dGVMYXllckNvbmZpZyIsIlZpcnR1YWxSZW5kZXJlci4kdXBkYXRlTGluZXMiLCJWaXJ0dWFsUmVuZGVyZXIuJGdldExvbmdlc3RMaW5lIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUZyb250TWFya2VycyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVCYWNrTWFya2VycyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVCcmVha3BvaW50cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRBbm5vdGF0aW9ucyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuaGlkZUN1cnNvciIsIlZpcnR1YWxSZW5kZXJlci5zaG93Q3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFNlbGVjdGlvbkludG9WaWV3IiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbFRvcCIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxMZWZ0IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbFRvcFJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxCb3R0b21Sb3ciLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9Sb3ciLCJWaXJ0dWFsUmVuZGVyZXIuYWxpZ25DdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuJGNhbGNTdGVwcyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb0xpbmUiLCJWaXJ0dWFsUmVuZGVyZXIuYW5pbWF0ZVNjcm9sbGluZyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb1kiLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9YIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbEJ5IiwiVmlydHVhbFJlbmRlcmVyLmlzU2Nyb2xsYWJsZUJ5IiwiVmlydHVhbFJlbmRlcmVyLnBpeGVsVG9TY3JlZW5Db29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci50ZXh0VG9TY3JlZW5Db29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci52aXN1YWxpemVGb2N1cyIsIlZpcnR1YWxSZW5kZXJlci52aXN1YWxpemVCbHVyIiwiVmlydHVhbFJlbmRlcmVyLnNob3dDb21wb3NpdGlvbiIsIlZpcnR1YWxSZW5kZXJlci5zZXRDb21wb3NpdGlvblRleHQiLCJWaXJ0dWFsUmVuZGVyZXIuaGlkZUNvbXBvc2l0aW9uIiwiVmlydHVhbFJlbmRlcmVyLnNldFRoZW1lIiwiVmlydHVhbFJlbmRlcmVyLmFkZENzc0NsYXNzIiwiVmlydHVhbFJlbmRlcmVyLnNldENzc0NsYXNzIiwiVmlydHVhbFJlbmRlcmVyLmltcG9ydFRoZW1lTGluayIsIlZpcnR1YWxSZW5kZXJlci5zZXRUaGVtZUNzcyIsIlZpcnR1YWxSZW5kZXJlci5nZXRUaGVtZSIsIlZpcnR1YWxSZW5kZXJlci5zZXRTdHlsZSIsIlZpcnR1YWxSZW5kZXJlci51bnNldFN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEN1cnNvclN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldE1vdXNlQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLmRlc3Ryb3kiXSwibWFwcGluZ3MiOiJBQW9EQSxZQUFZLENBQUM7T0FFTixFQUFDLFdBQVcsRUFBRSxxQkFBcUIsRUFBRSxhQUFhLEVBQUUsc0JBQXNCLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBQyxNQUFNLFdBQVc7T0FDekgsRUFBQyxhQUFhLEVBQWMsWUFBWSxFQUFDLE1BQU0sVUFBVTtPQUN6RCxFQUFDLE9BQU8sRUFBQyxNQUFNLGlCQUFpQjtPQUVoQyxNQUFNLE1BQU0sZ0JBQWdCO09BQzVCLE1BQU0sTUFBTSxnQkFBZ0I7T0FDNUIsSUFBSSxNQUFNLGNBQWM7T0FDeEIsTUFBTSxNQUFNLGdCQUFnQjtPQUM1QixVQUFVLE1BQU0sY0FBYztPQUM5QixVQUFVLE1BQU0sY0FBYztPQUM5QixVQUFVLE1BQU0sY0FBYztPQUM5QixXQUFXLE1BQU0scUJBQXFCO09BQ3RDLGlCQUFpQixNQUFNLHlCQUF5QjtPQUtoRCxTQUFTLE1BQU0sYUFBYTtBQU9uQyxJQUFJLGFBQWEsR0FBRyxDQUFDLENBQUM7QUFDdEIsSUFBSSxhQUFhLEdBQUcsQ0FBQyxDQUFDO0FBQ3RCLElBQUksYUFBYSxHQUFHLENBQUMsQ0FBQztBQUN0QixJQUFJLGFBQWEsR0FBRyxDQUFDLENBQUM7QUFDdEIsSUFBSSxZQUFZLEdBQUcsRUFBRSxDQUFDO0FBQ3RCLElBQUksV0FBVyxHQUFHLEVBQUUsQ0FBQztBQUNyQixJQUFJLFdBQVcsR0FBRyxFQUFFLENBQUM7QUFDckIsSUFBSSxrQkFBa0IsR0FBRyxHQUFHLENBQUM7QUFDN0IsSUFBSSxtQkFBbUIsR0FBRyxHQUFHLENBQUM7QUFDOUIsSUFBSSxXQUFXLEdBQUcsR0FBRyxDQUFDO0FBQ3RCLElBQUksZUFBZSxHQUFHLElBQUksQ0FBQztBQUczQix5QkFBeUIsT0FBZTtJQUNwQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQUE7SUFDVkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsR0FBR0EsYUFBYUEsQ0FBQ0E7UUFBQ0EsQ0FBQ0EsSUFBSUEsU0FBU0EsQ0FBQ0E7SUFDNUNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEdBQUdBLGFBQWFBLENBQUNBO1FBQUNBLENBQUNBLElBQUlBLFNBQVNBLENBQUNBO0lBQzVDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxHQUFHQSxhQUFhQSxDQUFDQTtRQUFDQSxDQUFDQSxJQUFJQSxTQUFTQSxDQUFDQTtJQUM1Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsR0FBR0EsYUFBYUEsQ0FBQ0E7UUFBQ0EsQ0FBQ0EsSUFBSUEsU0FBU0EsQ0FBQ0E7SUFDNUNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEdBQUdBLFlBQVlBLENBQUNBO1FBQUNBLENBQUNBLElBQUlBLFFBQVFBLENBQUNBO0lBQzFDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxHQUFHQSxXQUFXQSxDQUFDQTtRQUFDQSxDQUFDQSxJQUFJQSxPQUFPQSxDQUFDQTtJQUN4Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsR0FBR0EsV0FBV0EsQ0FBQ0E7UUFBQ0EsQ0FBQ0EsSUFBSUEsT0FBT0EsQ0FBQ0E7SUFDeENBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEdBQUdBLGtCQUFrQkEsQ0FBQ0E7UUFBQ0EsQ0FBQ0EsSUFBSUEsY0FBY0EsQ0FBQ0E7SUFDdERBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEdBQUdBLG1CQUFtQkEsQ0FBQ0E7UUFBQ0EsQ0FBQ0EsSUFBSUEsZUFBZUEsQ0FBQ0E7SUFDeERBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEdBQUdBLFdBQVdBLENBQUNBO1FBQUNBLENBQUNBLElBQUlBLE9BQU9BLENBQUNBO0lBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxHQUFHQSxlQUFlQSxDQUFDQTtRQUFDQSxDQUFDQSxJQUFJQSxXQUFXQSxDQUFDQTtJQUNoREEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7QUFDcEJBLENBQUNBO0FBT0Q7SUFtSElDLFlBQVlBLFNBQXNCQTtRQWhIM0JDLGVBQVVBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2ZBLGNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2RBLGdCQUFXQSxHQUFHQTtZQUNqQkEsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDUkEsT0FBT0EsRUFBRUEsQ0FBQ0E7WUFDVkEsUUFBUUEsRUFBRUEsQ0FBQ0E7WUFDWEEsY0FBY0EsRUFBRUEsQ0FBQ0E7WUFDakJBLE9BQU9BLEVBQUVBLENBQUNBO1lBQ1ZBLFVBQVVBLEVBQUVBLENBQUNBO1lBQ2JBLGNBQWNBLEVBQUVBLENBQUNBO1lBQ2pCQSxTQUFTQSxFQUFFQSxDQUFDQTtZQUNaQSxTQUFTQSxFQUFFQSxDQUFDQTtZQUNaQSxNQUFNQSxFQUFFQSxDQUFDQTtZQUNUQSxNQUFNQSxFQUFFQSxDQUFDQTtZQUNUQSxZQUFZQSxFQUFFQSxDQUFDQTtTQUNsQkEsQ0FBQ0E7UUFNS0EsYUFBUUEsR0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDcEJBLFlBQU9BLEdBQUdBLEtBQUtBLENBQUNBO1FBVWhCQSxVQUFLQSxHQUFHQSxDQUFDQSxDQUFDQTtRQWtCVkEsaUJBQVlBLEdBQUdBO1lBQ25CQSxJQUFJQSxFQUFFQSxDQUFDQTtZQUNQQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUNSQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNOQSxNQUFNQSxFQUFFQSxDQUFDQTtZQUNUQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUNKQSxDQUFDQSxFQUFFQSxDQUFDQTtTQUNQQSxDQUFDQTtRQWFNQSxhQUFRQSxHQUFHQSxDQUFDQSxDQUFDQTtRQTJDakJBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLElBQUlBLGlCQUFpQkEsQ0FBa0JBLElBQUlBLENBQUNBLENBQUNBO1FBRTdEQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUVqQkEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsSUFBb0JBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBT25FQSxJQUFJQSxDQUFDQSxxQkFBcUJBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBO1FBRXRDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxZQUFZQSxDQUFDQSxDQUFDQTtRQUUxQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDcENBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLEdBQUdBLFlBQVlBLENBQUNBO1FBQ3RDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUV6Q0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBbUJBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ3JEQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxTQUFTQSxHQUFHQSxjQUFjQSxDQUFDQTtRQUN6Q0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFFMUNBLElBQUlBLENBQUNBLE9BQU9BLEdBQW1CQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNwREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsR0FBR0EsYUFBYUEsQ0FBQ0E7UUFDdkNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBRXhDQSxJQUFJQSxDQUFDQSxZQUFZQSxHQUFHQSxJQUFJQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUM3Q0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsbUJBQW1CQSxFQUFFQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUUxRUEsSUFBSUEsQ0FBQ0EsV0FBV0EsR0FBR0EsSUFBSUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFFNUNBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQ3pEQSxJQUFJQSxDQUFDQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUVoQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsR0FBR0EsSUFBSUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFFN0NBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBRzdDQSxJQUFJQSxDQUFDQSxZQUFZQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUMxQkEsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFFdEJBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQ3ZEQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN2REEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsUUFBUUEsRUFBRUEsVUFBU0EsS0FBS0EsRUFBRUEsU0FBcUJBO1lBQzlELEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztnQkFDMUIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLElBQUksR0FBRyxLQUFLLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BFLENBQUM7UUFDTCxDQUFDLENBQUNBLENBQUNBO1FBQ0hBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLEVBQUVBLENBQUNBLFFBQVFBLEVBQUVBLFVBQVNBLEtBQUtBLEVBQUVBLFNBQXFCQTtZQUM5RCxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7Z0JBQzFCLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN0RSxDQUFDO1FBQ0wsQ0FBQyxDQUFDQSxDQUFDQTtRQUVIQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQTtZQUNiQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNOQSxNQUFNQSxFQUFFQSxDQUFDQTtTQUNaQSxDQUFDQTtRQUVGQSxJQUFJQSxDQUFDQSxZQUFZQSxHQUFHQSxJQUFJQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN6REEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFDbkRBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLEVBQUVBLENBQUNBLHFCQUFxQkEsRUFBRUEsVUFBU0EsS0FBS0EsRUFBRUEsSUFBVUE7WUFDaEUsS0FBSyxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDNUIsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBSS9FLEtBQUssQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLHFCQUFxQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3pELENBQUMsQ0FBQ0EsQ0FBQ0E7UUFFSEEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0E7WUFDVEEsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDUkEsTUFBTUEsRUFBRUEsQ0FBQ0E7WUFDVEEsY0FBY0EsRUFBRUEsQ0FBQ0E7WUFDakJBLGFBQWFBLEVBQUVBLENBQUNBO1lBQ2hCQSxNQUFNQSxFQUFFQSxJQUFJQTtTQUNmQSxDQUFDQTtRQUVGQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxhQUFhQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtRQUN0R0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFFakNBLElBQUlBLENBQUNBLG1CQUFtQkEsRUFBRUEsQ0FBQ0E7UUFDM0JBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ25CQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUl2QkEsQ0FBQ0E7SUFRREQsRUFBRUEsQ0FBQ0EsU0FBaUJBLEVBQUVBLFFBQXNEQTtRQUN4RUUsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsU0FBU0EsRUFBRUEsUUFBUUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7SUFDakRBLENBQUNBO0lBUURGLEdBQUdBLENBQUNBLFNBQWlCQSxFQUFFQSxRQUFzREE7UUFDekVHLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO0lBQzNDQSxDQUFDQTtJQU1ESCxJQUFJQSxRQUFRQSxDQUFDQSxRQUFnQkE7UUFDekJJLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLFFBQVFBLENBQUNBO0lBQzlCQSxDQUFDQTtJQU1ESixJQUFJQSxvQkFBb0JBLENBQUNBLG9CQUE2QkE7UUFDbERLLElBQUlBLENBQUNBLHFCQUFxQkEsR0FBR0Esb0JBQW9CQSxDQUFDQTtJQUN0REEsQ0FBQ0E7SUFRREwscUJBQXFCQTtRQUNqQk0sSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0E7SUFDMUNBLENBQUNBO0lBU0ROLGlCQUFpQkE7UUFDYk8sSUFBSUEsSUFBSUEsR0FBR0EsY0FBYSxDQUFDLENBQUNBO1FBQzFCQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxZQUFZQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN0Q0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsR0FBR0EsR0FBR0EsQ0FBQ0E7SUFDbERBLENBQUNBO0lBTURQLG1CQUFtQkE7UUFFZlEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1REEsSUFBSUEsQ0FBQ0EsZUFBZUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQTtZQUN6REEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLGNBQWNBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0E7UUFDNUZBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLGFBQWFBLEVBQUVBLENBQUNBO1FBQ2hGQSxJQUFJQSxDQUFDQSxrQkFBa0JBLEVBQUVBLENBQUNBO0lBQzlCQSxDQUFDQTtJQVNEUixVQUFVQSxDQUFDQSxPQUFvQkE7UUFDM0JTLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ2ZBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLG1CQUFtQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQTtRQUN4RUEsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsT0FBT0EsQ0FBQ0E7UUFDdkJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ1hBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZEQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNqREEsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDdENBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFVBQVVBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQ3JDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxVQUFVQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUN0Q0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDdENBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLFVBQVVBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQ3BDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtRQUNqQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsZUFBZUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEs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QSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3Q0EsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7WUFDckJBLE9BQU9BLElBQUlBLFdBQVdBLENBQUNBO1lBRXZCQSxJQUFJQSxDQUFDQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7Z0JBQ2xCQSxJQUFJQSxDQUFDQSxjQUFjQSxJQUFJQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUVsREEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFFckVBLE9BQU9BLEdBQUdBLE9BQU9BLEdBQUdBLGFBQWFBLENBQUNBO1FBQ3RDQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQ0EsT0FBT0EsSUFBSUEsV0FBV0EsQ0FBQ0E7WUFDdkJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBO1lBRW5CQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxJQUFJQSxJQUFJQSxDQUFDQTtnQkFDcEJBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFdBQVdBLEdBQUdBLENBQUNBLENBQUNBO1lBRWxFQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxXQUFXQSxDQUFDQTtZQUUvQkEsSUFBSUEsQ0FBQ0Es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QUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3BEQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxxQkFBcUJBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3REQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNQQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNoQkEsQ0FBQ0E7UUFDREEsT0FBT0EsSUFBSUEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLEdBQUdBLENBQUNBLENBQUNBO1lBQ3ZDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUUzQ0EsT0FBT0EsSUFBSUEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFFakNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3RDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNyQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsYUFBYUEsR0FBR0EsT0FBT0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDdkZBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO0lBQ3BGQSxDQUFDQTtJQVFEMUMsa0JBQWtCQTtRQUNkMkMsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7SUFDckNBLENBQUNBO0lBT0QzQyx1QkFBdUJBO1FBQ25CNEMsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDL0VBLENBQUNBO0lBT0Q1QyxzQkFBc0JBO1FBQ2xCNkMsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDMUdBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFFBQVFBLEdBQUdBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBO0lBQ2pEQSxDQUFDQTtJQVFEN0MsaUJBQWlCQTtRQUNiOEMsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7SUFDcENBLENBQUNBO0lBU0Q5QyxVQUFVQSxDQUFDQSxPQUFlQTtRQUN0QitDLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLE9BQU9BLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQzlCQSxNQUFNQSxJQUFJQSxTQUFTQSxDQUFDQSwwQkFBMEJBLENBQUNBLENBQUNBO1FBQ3BEQSxD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QUNBLE9BQWVBLEVBQUVBLEtBQWNBO1FBRWxEeUQsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaEJBLE9BQU9BLElBQUlBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBO1lBQ3pCQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN0QkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsV0FBV0EsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekZBLElBQUlBLENBQUNBLFFBQVFBLElBQUlBLE9BQU9BLENBQUNBO1lBQ3pCQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsSUFBSUEsQ0FBQ0EsUUFBUUEsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDekJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQy9CQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQkEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsbUJBQW1CQSxFQUFFQSxDQUFDQTtRQUMxQ0EsQ0FBQ0E7UUFLREEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0E7UUFFdENBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBO1FBRTlCQSxFQUFFQSxDQUFDQSxDQUFD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LEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBRTNGQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxFQUNqRkEsV0FBV0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFdEZBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzNEQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNwRkEsSUFBSUEsT0FBT0EsR0FBR0EsUUFBUUEsR0FBR0EsU0FBU0EsQ0FBQ0E7UUFHbkNBLElBQUlBLGNBQWNBLEVBQUVBLGNBQWNBLENBQUNBO1FBQ25DQSxJQUFJQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtRQUNqQ0EsUUFBUUEsR0FBR0EsT0FBT0EsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUlwREEs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QUUxREEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUVyRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDOUJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO2dCQUNQQSxHQUFHQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQTtZQUM5Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1ZBLEdBQUdBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLENBQUNBO1lBQ2pDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNuQ0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsR0FBR0EsWUFBWUEsR0FBR0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEZBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO2dCQUNQQSxHQUFHQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQTtZQUM5Q0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0E7UUFDakZBLENBQUNBO1FBRURBLElBQUlBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVB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QSxFQUFFQSxHQUFHQSxFQUFFQSxJQUFJQSxFQUFFQSxNQUFNQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQTtJQUN0RUEsQ0FBQ0E7SUFFRHJGLHVCQUF1QkEsQ0FBQ0EsT0FBZUEsRUFBRUEsT0FBZUE7UUFDcERzRixJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxxQkFBcUJBLEVBQUVBLENBQUNBO1FBRXREQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxTQUFTQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQTtRQUU1R0EsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFFdkVBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLHdCQUF3QkEsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDM0VBLENBQUNBO0lBUUR0Rix1QkFBdUJBLENBQUNBLEdBQVdBLEVBQUVBLE1BQWNBO1FBQy9DdUYsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EscUJBQXFCQSxFQUFFQSxDQUFDQTtRQUN0REEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUU3REEsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FB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R0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztZQUNoQixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxJQUFJLEdBQUcsQ0FBQztnQkFDM0IsTUFBTSxDQUFDO1lBQ1gsSUFBSSxDQUFDLGNBQWMsR0FBRyxHQUFHLENBQUM7WUFDMUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzVDLENBQUM7UUFDRCxZQUFZLEVBQUUsQ0FBQztRQUNmLFVBQVUsRUFBRSxJQUFJO0tBQ25CO0lBQ0QsZ0JBQWdCLEVBQUU7UUFDZCxHQUFHLEVBQUUsVUFBUyxHQUFHO1lBQ2IsSUFBSSxDQUFDLFlBQVksQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQztZQUN0QyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDNUMsQ0FBQztLQUNKO0lBQ0QsS0FBSyxFQUFFO1FBQ0gsR0FBRyxFQUFFLFVBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQyxDQUFDO1FBQ3pDLEdBQUcsRUFBRSxjQUFhLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELFlBQVksRUFBRSxrQkFBa0I7UUFDaEMsVUFBVSxFQUFFLElBQUk7S0FDbkI7Q0FDSixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQtMjAxNiBEYXZpZCBHZW8gSG9sbWVzIDxkYXZpZC5nZW8uaG9sbWVzQGdtYWlsLmNvbT5cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW4gYWxsXG4gKiBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEVcbiAqIFNPRlRXQVJFLlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cbi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbmltcG9ydCB7YWRkQ3NzQ2xhc3MsIGFwcGVuZEhUTUxMaW5rRWxlbWVudCwgY3JlYXRlRWxlbWVudCwgZW5zdXJlSFRNTFN0eWxlRWxlbWVudCwgcmVtb3ZlQ3NzQ2xhc3MsIHNldENzc0NsYXNzfSBmcm9tIFwiLi9saWIvZG9tXCI7XG5pbXBvcnQge2RlZmluZU9wdGlvbnMsIGxvYWRNb2R1bGUsIHJlc2V0T3B0aW9uc30gZnJvbSBcIi4vY29uZmlnXCI7XG5pbXBvcnQge2lzT2xkSUV9IGZyb20gXCIuL2xpYi91c2VyYWdlbnRcIjtcbmltcG9ydCBBbm5vdGF0aW9uIGZyb20gJy4vQW5ub3RhdGlvbic7XG5pbXBvcnQgR3V0dGVyIGZyb20gXCIuL2xheWVyL0d1dHRlclwiO1xuaW1wb3J0IE1hcmtlciBmcm9tIFwiLi9sYXllci9NYXJrZXJcIjtcbmltcG9ydCBUZXh0IGZyb20gXCIuL2xheWVyL1RleHRcIjtcbmltcG9ydCBDdXJzb3IgZnJvbSBcIi4vbGF5ZXIvQ3Vyc29yXCI7XG5pbXBvcnQgVlNjcm9sbEJhciBmcm9tIFwiLi9WU2Nyb2xsQmFyXCI7XG5pbXBvcnQgSFNjcm9sbEJhciBmcm9tIFwiLi9IU2Nyb2xsQmFyXCI7XG5pbXBvcnQgUmVuZGVyTG9vcCBmcm9tIFwiLi9SZW5kZXJMb29wXCI7XG5pbXBvcnQgRm9udE1ldHJpY3MgZnJvbSBcIi4vbGF5ZXIvRm9udE1ldHJpY3NcIjtcbmltcG9ydCBFdmVudEVtaXR0ZXJDbGFzcyBmcm9tIFwiLi9saWIvRXZlbnRFbWl0dGVyQ2xhc3NcIjtcbmltcG9ydCBFZGl0U2Vzc2lvbiBmcm9tICcuL0VkaXRTZXNzaW9uJztcbmltcG9ydCBFdmVudEJ1cyBmcm9tICcuL0V2ZW50QnVzJztcbmltcG9ydCBPcHRpb25zUHJvdmlkZXIgZnJvbSBcIi4vT3B0aW9uc1Byb3ZpZGVyXCI7XG5pbXBvcnQgUG9zaXRpb24gZnJvbSAnLi9Qb3NpdGlvbic7XG5pbXBvcnQgVGhlbWVMaW5rIGZyb20gJy4vVGhlbWVMaW5rJztcbmltcG9ydCBFZGl0b3JSZW5kZXJlciBmcm9tICcuL0VkaXRvclJlbmRlcmVyJztcblxuLy8gRklYTUVcbi8vIGltcG9ydCBlZGl0b3JDc3MgPSByZXF1aXJlKFwiLi9yZXF1aXJlanMvdGV4dCEuL2Nzcy9lZGl0b3IuY3NzXCIpO1xuLy8gZW5zdXJlSFRNTFN0eWxlRWxlbWVudChlZGl0b3JDc3MsIFwiYWNlX2VkaXRvclwiKTtcblxudmFyIENIQU5HRV9DVVJTT1IgPSAxO1xudmFyIENIQU5HRV9NQVJLRVIgPSAyO1xudmFyIENIQU5HRV9HVVRURVIgPSA0O1xudmFyIENIQU5HRV9TQ1JPTEwgPSA4O1xudmFyIENIQU5HRV9MSU5FUyA9IDE2O1xudmFyIENIQU5HRV9URVhUID0gMzI7XG52YXIgQ0hBTkdFX1NJWkUgPSA2NDtcbnZhciBDSEFOR0VfTUFSS0VSX0JBQ0sgPSAxMjg7XG52YXIgQ0hBTkdFX01BUktFUl9GUk9OVCA9IDI1NjtcbnZhciBDSEFOR0VfRlVMTCA9IDUxMjtcbnZhciBDSEFOR0VfSF9TQ1JPTEwgPSAxMDI0O1xuXG4vLyBVc2VmdWwgZm9yIGRlYnVnZ2luZy4uLlxuZnVuY3Rpb24gY2hhbmdlc1RvU3RyaW5nKGNoYW5nZXM6IG51bWJlcik6IHN0cmluZyB7XG4gICAgdmFyIGEgPSBcIlwiXG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfQ1VSU09SKSBhICs9IFwiIGN1cnNvclwiO1xuICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX01BUktFUikgYSArPSBcIiBtYXJrZXJcIjtcbiAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9HVVRURVIpIGEgKz0gXCIgZ3V0dGVyXCI7XG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfU0NST0xMKSBhICs9IFwiIHNjcm9sbFwiO1xuICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0xJTkVTKSBhICs9IFwiIGxpbmVzXCI7XG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfVEVYVCkgYSArPSBcIiB0ZXh0XCI7XG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfU0laRSkgYSArPSBcIiBzaXplXCI7XG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfTUFSS0VSX0JBQ0spIGEgKz0gXCIgbWFya2VyX2JhY2tcIjtcbiAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9NQVJLRVJfRlJPTlQpIGEgKz0gXCIgbWFya2VyX2Zyb250XCI7XG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfRlVMTCkgYSArPSBcIiBmdWxsXCI7XG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfSF9TQ1JPTEwpIGEgKz0gXCIgaF9zY3JvbGxcIjtcbiAgICByZXR1cm4gYS50cmltKCk7XG59XG5cbi8qKlxuICogVGhlIGNsYXNzIHRoYXQgaXMgcmVzcG9uc2libGUgZm9yIGRyYXdpbmcgZXZlcnl0aGluZyB5b3Ugc2VlIG9uIHRoZSBzY3JlZW4hXG4gKlxuICogQGNsYXNzIFZpcnR1YWxSZW5kZXJlclxuICovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBWaXJ0dWFsUmVuZGVyZXIgaW1wbGVtZW50cyBFdmVudEJ1czxWaXJ0dWFsUmVuZGVyZXI+LCBFZGl0b3JSZW5kZXJlciwgT3B0aW9uc1Byb3ZpZGVyIHtcbiAgICBwdWJsaWMgdGV4dGFyZWE6IEhUTUxUZXh0QXJlYUVsZW1lbnQ7XG4gICAgcHVibGljIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG4gICAgcHVibGljIHNjcm9sbExlZnQgPSAwO1xuICAgIHB1YmxpYyBzY3JvbGxUb3AgPSAwO1xuICAgIHB1YmxpYyBsYXllckNvbmZpZyA9IHtcbiAgICAgICAgd2lkdGg6IDEsXG4gICAgICAgIHBhZGRpbmc6IDAsXG4gICAgICAgIGZpcnN0Um93OiAwLFxuICAgICAgICBmaXJzdFJvd1NjcmVlbjogMCxcbiAgICAgICAgbGFzdFJvdzogMCxcbiAgICAgICAgbGluZUhlaWdodDogMCxcbiAgICAgICAgY2hhcmFjdGVyV2lkdGg6IDAsXG4gICAgICAgIG1pbkhlaWdodDogMSxcbiAgICAgICAgbWF4SGVpZ2h0OiAxLFxuICAgICAgICBvZmZzZXQ6IDAsXG4gICAgICAgIGhlaWdodDogMSxcbiAgICAgICAgZ3V0dGVyT2Zmc2V0OiAxXG4gICAgfTtcbiAgICBwdWJsaWMgJG1heExpbmVzOiBudW1iZXI7XG4gICAgcHVibGljICRtaW5MaW5lczogbnVtYmVyO1xuICAgIHB1YmxpYyAkY3Vyc29yTGF5ZXI6IEN1cnNvcjtcbiAgICBwdWJsaWMgJGd1dHRlckxheWVyOiBHdXR0ZXI7XG5cbiAgICBwdWJsaWMgJHBhZGRpbmc6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSAkZnJvemVuID0gZmFsc2U7XG5cbiAgICAvLyBUaGUgdGhlbWVJZCBpcyB3aGF0IGlzIGNvbW11bmljYXRlZCBpbiB0aGUgQVBJLlxuICAgIHByaXZhdGUgJHRoZW1lSWQ6IHN0cmluZztcbiAgICAvKipcbiAgICAgKiBUaGUgbG9hZGVkIHRoZW1lIG9iamVjdC4gVGhpcyBhbGxvd3MgdXMgdG8gcmVtb3ZlIGEgdGhlbWUuXG4gICAgICovXG4gICAgcHJpdmF0ZSB0aGVtZTogeyBjc3NDbGFzczogc3RyaW5nIH07XG5cbiAgICBwcml2YXRlICR0aW1lcjtcbiAgICBwcml2YXRlIFNURVBTID0gODtcbiAgICBwdWJsaWMgJGtlZXBUZXh0QXJlYUF0Q3Vyc29yOiBib29sZWFuO1xuICAgIHB1YmxpYyAkZ3V0dGVyO1xuICAgIHB1YmxpYyBzY3JvbGxlcjogSFRNTERpdkVsZW1lbnQ7XG4gICAgcHVibGljIGNvbnRlbnQ6IEhUTUxEaXZFbGVtZW50O1xuICAgIHB1YmxpYyAkdGV4dExheWVyOiBUZXh0O1xuICAgIHByaXZhdGUgJG1hcmtlckZyb250OiBNYXJrZXI7XG4gICAgcHJpdmF0ZSAkbWFya2VyQmFjazogTWFya2VyO1xuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MRGl2RWxlbWVudDtcbiAgICBwcml2YXRlICRob3JpelNjcm9sbDogYm9vbGVhbjtcbiAgICBwcml2YXRlICR2U2Nyb2xsO1xuICAgIHB1YmxpYyBzY3JvbGxCYXJIOiBIU2Nyb2xsQmFyO1xuICAgIHB1YmxpYyBzY3JvbGxCYXJWOiBWU2Nyb2xsQmFyO1xuICAgIHByaXZhdGUgJHNjcm9sbEFuaW1hdGlvbjogeyBmcm9tOiBudW1iZXI7IHRvOiBudW1iZXI7IHN0ZXBzOiBudW1iZXJbXSB9O1xuICAgIHB1YmxpYyAkc2Nyb2xsYmFyV2lkdGg6IG51bWJlcjtcbiAgICBwcml2YXRlIHNlc3Npb246IEVkaXRTZXNzaW9uO1xuICAgIHByaXZhdGUgZXZlbnRCdXM6IEV2ZW50RW1pdHRlckNsYXNzPFZpcnR1YWxSZW5kZXJlcj47XG5cbiAgICBwcml2YXRlIHNjcm9sbE1hcmdpbiA9IHtcbiAgICAgICAgbGVmdDogMCxcbiAgICAgICAgcmlnaHQ6IDAsXG4gICAgICAgIHRvcDogMCxcbiAgICAgICAgYm90dG9tOiAwLFxuICAgICAgICB2OiAwLFxuICAgICAgICBoOiAwXG4gICAgfTtcblxuICAgIHByaXZhdGUgJGZvbnRNZXRyaWNzOiBGb250TWV0cmljcztcbiAgICBwcml2YXRlICRhbGxvd0JvbGRGb250cztcbiAgICBwcml2YXRlIGN1cnNvclBvcztcblxuICAgIC8qKlxuICAgICAqIEEgY2FjaGUgb2YgdmFyaW91cyBzaXplcyBUQkEuXG4gICAgICovXG4gICAgcHVibGljICRzaXplOiB7IGhlaWdodDogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBzY3JvbGxlckhlaWdodDogbnVtYmVyOyBzY3JvbGxlcldpZHRoOyAkZGlydHk6IGJvb2xlYW4gfTtcblxuICAgIHByaXZhdGUgJGxvb3A6IFJlbmRlckxvb3A7XG4gICAgcHJpdmF0ZSAkY2hhbmdlZExpbmVzO1xuICAgIHByaXZhdGUgJGNoYW5nZXMgPSAwO1xuICAgIHByaXZhdGUgcmVzaXppbmc7XG4gICAgcHJpdmF0ZSAkZ3V0dGVyTGluZUhpZ2hsaWdodDtcbiAgICAvLyBGSVhNRTogV2h5IGRvIHdlIGhhdmUgdHdvP1xuICAgIHB1YmxpYyBndXR0ZXJXaWR0aDogbnVtYmVyO1xuICAgIHByaXZhdGUgJGd1dHRlcldpZHRoOiBudW1iZXI7XG4gICAgcHJpdmF0ZSAkc2hvd1ByaW50TWFyZ2luO1xuICAgIHByaXZhdGUgJHByaW50TWFyZ2luRWw7XG4gICAgcHJpdmF0ZSBnZXRPcHRpb247XG4gICAgcHJpdmF0ZSBzZXRPcHRpb247XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkgY2hhcmFjdGVyV2lkdGhcbiAgICAgKiBAdHlwZSBudW1iZXJcbiAgICAgKi9cbiAgICBwdWJsaWMgY2hhcmFjdGVyV2lkdGg6IG51bWJlcjtcblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSBsaW5lSGVpZ2h0XG4gICAgICogQHR5cGUgbnVtYmVyXG4gICAgICovXG4gICAgcHVibGljIGxpbmVIZWlnaHQ6IG51bWJlcjtcblxuICAgIHByaXZhdGUgJHByaW50TWFyZ2luQ29sdW1uO1xuICAgIHByaXZhdGUgJGV4dHJhSGVpZ2h0O1xuICAgIHByaXZhdGUgJGNvbXBvc2l0aW9uOiB7IGtlZXBUZXh0QXJlYUF0Q3Vyc29yOiBib29sZWFuOyBjc3NUZXh0OiBzdHJpbmcgfTtcbiAgICBwcml2YXRlICRoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTtcbiAgICBwcml2YXRlICR2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTtcbiAgICBwcml2YXRlICRzaG93R3V0dGVyO1xuICAgIHByaXZhdGUgc2hvd0ludmlzaWJsZXM7XG4gICAgcHJpdmF0ZSAkYW5pbWF0ZWRTY3JvbGw6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkc2Nyb2xsUGFzdEVuZDtcbiAgICBwcml2YXRlICRoaWdobGlnaHRHdXR0ZXJMaW5lO1xuICAgIHByaXZhdGUgZGVzaXJlZEhlaWdodDtcblxuICAgIC8qKlxuICAgICAqIENvbnN0cnVjdHMgYSBuZXcgYFZpcnR1YWxSZW5kZXJlcmAgd2l0aGluIHRoZSBgY29udGFpbmVyYCBzcGVjaWZpZWQuXG4gICAgICpcbiAgICAgKiBAY2xhc3MgVmlydHVhbFJlbmRlcmVyXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQHBhcmFtIGNvbnRhaW5lciB7SFRNTEVsZW1lbnR9IFRoZSByb290IGVsZW1lbnQgb2YgdGhlIGVkaXRvci5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3Rvcihjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMgPSBuZXcgRXZlbnRFbWl0dGVyQ2xhc3M8VmlydHVhbFJlbmRlcmVyPih0aGlzKTtcblxuICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuXG4gICAgICAgIHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyIHx8IDxIVE1MRGl2RWxlbWVudD5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXG4gICAgICAgIC8vIFRPRE86IHRoaXMgYnJlYWtzIHJlbmRlcmluZyBpbiBDbG91ZDkgd2l0aCBtdWx0aXBsZSBhY2UgaW5zdGFuY2VzXG4gICAgICAgIC8vIC8vIEltcG9ydHMgQ1NTIG9uY2UgcGVyIERPTSBkb2N1bWVudCAoJ2FjZV9lZGl0b3InIHNlcnZlcyBhcyBhbiBpZGVudGlmaWVyKS5cbiAgICAgICAgLy8gZW5zdXJlSFRNTFN0eWxlRWxlbWVudChlZGl0b3JDc3MsIFwiYWNlX2VkaXRvclwiLCBjb250YWluZXIub3duZXJEb2N1bWVudCk7XG5cbiAgICAgICAgLy8gaW4gSUUgPD0gOSB0aGUgbmF0aXZlIGN1cnNvciBhbHdheXMgc2hpbmVzIHRocm91Z2hcbiAgICAgICAgdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSAhaXNPbGRJRTtcblxuICAgICAgICBhZGRDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgXCJhY2VfZWRpdG9yXCIpO1xuXG4gICAgICAgIHRoaXMuJGd1dHRlciA9IGNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRoaXMuJGd1dHRlci5jbGFzc05hbWUgPSBcImFjZV9ndXR0ZXJcIjtcbiAgICAgICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy4kZ3V0dGVyKTtcblxuICAgICAgICB0aGlzLnNjcm9sbGVyID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRoaXMuc2Nyb2xsZXIuY2xhc3NOYW1lID0gXCJhY2Vfc2Nyb2xsZXJcIjtcbiAgICAgICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5zY3JvbGxlcik7XG5cbiAgICAgICAgdGhpcy5jb250ZW50ID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRoaXMuY29udGVudC5jbGFzc05hbWUgPSBcImFjZV9jb250ZW50XCI7XG4gICAgICAgIHRoaXMuc2Nyb2xsZXIuYXBwZW5kQ2hpbGQodGhpcy5jb250ZW50KTtcblxuICAgICAgICB0aGlzLiRndXR0ZXJMYXllciA9IG5ldyBHdXR0ZXIodGhpcy4kZ3V0dGVyKTtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIub24oXCJjaGFuZ2VHdXR0ZXJXaWR0aFwiLCB0aGlzLm9uR3V0dGVyUmVzaXplLmJpbmQodGhpcykpO1xuXG4gICAgICAgIHRoaXMuJG1hcmtlckJhY2sgPSBuZXcgTWFya2VyKHRoaXMuY29udGVudCk7XG5cbiAgICAgICAgdmFyIHRleHRMYXllciA9IHRoaXMuJHRleHRMYXllciA9IG5ldyBUZXh0KHRoaXMuY29udGVudCk7XG4gICAgICAgIHRoaXMuY2FudmFzID0gdGV4dExheWVyLmVsZW1lbnQ7XG5cbiAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQgPSBuZXcgTWFya2VyKHRoaXMuY29udGVudCk7XG5cbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIgPSBuZXcgQ3Vyc29yKHRoaXMuY29udGVudCk7XG5cbiAgICAgICAgLy8gSW5kaWNhdGVzIHdoZXRoZXIgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyIGlzIHZpc2libGVcbiAgICAgICAgdGhpcy4kaG9yaXpTY3JvbGwgPSBmYWxzZTtcbiAgICAgICAgdGhpcy4kdlNjcm9sbCA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMuc2Nyb2xsQmFyViA9IG5ldyBWU2Nyb2xsQmFyKHRoaXMuY29udGFpbmVyLCB0aGlzKTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJIID0gbmV3IEhTY3JvbGxCYXIodGhpcy5jb250YWluZXIsIHRoaXMpO1xuICAgICAgICB0aGlzLnNjcm9sbEJhclYub24oXCJzY3JvbGxcIiwgZnVuY3Rpb24oZXZlbnQsIHNjcm9sbEJhcjogVlNjcm9sbEJhcikge1xuICAgICAgICAgICAgaWYgKCFfc2VsZi4kc2Nyb2xsQW5pbWF0aW9uKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxUb3AoZXZlbnQuZGF0YSAtIF9zZWxmLnNjcm9sbE1hcmdpbi50b3ApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJILm9uKFwic2Nyb2xsXCIsIGZ1bmN0aW9uKGV2ZW50LCBzY3JvbGxCYXI6IEhTY3JvbGxCYXIpIHtcbiAgICAgICAgICAgIGlmICghX3NlbGYuJHNjcm9sbEFuaW1hdGlvbikge1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsTGVmdChldmVudC5kYXRhIC0gX3NlbGYuc2Nyb2xsTWFyZ2luLmxlZnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmN1cnNvclBvcyA9IHtcbiAgICAgICAgICAgIHJvdzogMCxcbiAgICAgICAgICAgIGNvbHVtbjogMFxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuJGZvbnRNZXRyaWNzID0gbmV3IEZvbnRNZXRyaWNzKHRoaXMuY29udGFpbmVyLCA1MDApO1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuJHNldEZvbnRNZXRyaWNzKHRoaXMuJGZvbnRNZXRyaWNzKTtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLm9uKFwiY2hhbmdlQ2hhcmFjdGVyU2l6ZVwiLCBmdW5jdGlvbihldmVudCwgdGV4dDogVGV4dCkge1xuICAgICAgICAgICAgX3NlbGYudXBkYXRlQ2hhcmFjdGVyU2l6ZSgpO1xuICAgICAgICAgICAgX3NlbGYub25SZXNpemUodHJ1ZSwgX3NlbGYuZ3V0dGVyV2lkdGgsIF9zZWxmLiRzaXplLndpZHRoLCBfc2VsZi4kc2l6ZS5oZWlnaHQpO1xuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBAZXZlbnQgY2hhbmdlQ2hhcmFjdGVyU2l6ZVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBfc2VsZi5ldmVudEJ1cy5fc2lnbmFsKFwiY2hhbmdlQ2hhcmFjdGVyU2l6ZVwiLCBldmVudCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuJHNpemUgPSB7XG4gICAgICAgICAgICB3aWR0aDogMCxcbiAgICAgICAgICAgIGhlaWdodDogMCxcbiAgICAgICAgICAgIHNjcm9sbGVySGVpZ2h0OiAwLFxuICAgICAgICAgICAgc2Nyb2xsZXJXaWR0aDogMCxcbiAgICAgICAgICAgICRkaXJ0eTogdHJ1ZVxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuJGxvb3AgPSBuZXcgUmVuZGVyTG9vcCh0aGlzLiRyZW5kZXJDaGFuZ2VzLmJpbmQodGhpcyksIHRoaXMuY29udGFpbmVyLm93bmVyRG9jdW1lbnQuZGVmYXVsdFZpZXcpO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcblxuICAgICAgICB0aGlzLnVwZGF0ZUNoYXJhY3RlclNpemUoKTtcbiAgICAgICAgdGhpcy5zZXRQYWRkaW5nKDQpO1xuICAgICAgICByZXNldE9wdGlvbnModGhpcyk7XG4gICAgICAgIC8vIEZJWE1FOiBUaGlzIHdhcyBhIHNpZ25hbCB0byBhIGdsb2JhbCBjb25maWcgb2JqZWN0LlxuICAgICAgICAvLyBXaHkgZG8gRWRpdG9yIGFuZCBFZGl0U2Vzc2lvbiBzaWduYWwgd2hpbGUgdGhpcyBlbWl0cz9cbiAgICAgICAgLy9fZW1pdChcInJlbmRlcmVyXCIsIHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb25cbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIHtzdHJpbmd9XG4gICAgICogQHBhcmFtIGNhbGxiYWNrIHsoZXZlbnQsIHNvdXJjZTogVmlydHVhbFJlbmRlcmVyKSA9PiBhbnl9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBvbihldmVudE5hbWU6IHN0cmluZywgY2FsbGJhY2s6IChldmVudDogYW55LCBzb3VyY2U6IFZpcnR1YWxSZW5kZXJlcikgPT4gYW55KTogdm9pZCB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMub24oZXZlbnROYW1lLCBjYWxsYmFjaywgZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb2ZmXG4gICAgICogQHBhcmFtIGV2ZW50TmFtZSB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSBjYWxsYmFjayB7KGV2ZW50LCBzb3VyY2U6IFZpcnR1YWxSZW5kZXJlcikgPT4gYW55fVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb2ZmKGV2ZW50TmFtZTogc3RyaW5nLCBjYWxsYmFjazogKGV2ZW50OiBhbnksIHNvdXJjZTogVmlydHVhbFJlbmRlcmVyKSA9PiBhbnkpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5vZmYoZXZlbnROYW1lLCBjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5IG1heExpbmVzXG4gICAgICogQHR5cGUgbnVtYmVyXG4gICAgICovXG4gICAgc2V0IG1heExpbmVzKG1heExpbmVzOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy4kbWF4TGluZXMgPSBtYXhMaW5lcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkga2VlcFRleHRBcmVhQXRDdXJzb3JcbiAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICovXG4gICAgc2V0IGtlZXBUZXh0QXJlYUF0Q3Vyc29yKGtlZXBUZXh0QXJlYUF0Q3Vyc29yOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0ga2VlcFRleHRBcmVhQXRDdXJzb3I7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgPGNvZGU+c3R5bGU8L2NvZGU+IHByb3BlcnR5IG9mIHRoZSBjb250ZW50IHRvIFwiZGVmYXVsdFwiLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXREZWZhdWx0Q3Vyc29yU3R5bGVcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldERlZmF1bHRDdXJzb3JTdHlsZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLmN1cnNvciA9IFwiZGVmYXVsdFwiO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIDxjb2RlPm9wYWNpdHk8L2NvZGU+IG9mIHRoZSBjdXJzb3IgbGF5ZXIgdG8gXCIwXCIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldEN1cnNvckxheWVyT2ZmXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKiBAY2hhaW5hYmxlXG4gICAgICovXG4gICAgc2V0Q3Vyc29yTGF5ZXJPZmYoKTogdm9pZCB7XG4gICAgICAgIHZhciBub29wID0gZnVuY3Rpb24oKSB7IH07XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnJlc3RhcnRUaW1lciA9IG5vb3A7XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLmVsZW1lbnQuc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgdXBkYXRlQ2hhcmFjdGVyU2l6ZVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgdXBkYXRlQ2hhcmFjdGVyU2l6ZSgpOiB2b2lkIHtcbiAgICAgICAgLy8gRklYTUU6IERHSCBhbGxvd0JvbGRGb250cyBkb2VzIG5vdCBleGlzdCBvbiBUZXh0XG4gICAgICAgIGlmICh0aGlzLiR0ZXh0TGF5ZXJbJ2FsbG93Qm9sZEZvbnRzJ10gIT0gdGhpcy4kYWxsb3dCb2xkRm9udHMpIHtcbiAgICAgICAgICAgIHRoaXMuJGFsbG93Qm9sZEZvbnRzID0gdGhpcy4kdGV4dExheWVyWydhbGxvd0JvbGRGb250cyddO1xuICAgICAgICAgICAgdGhpcy5zZXRTdHlsZShcImFjZV9ub2JvbGRcIiwgIXRoaXMuJGFsbG93Qm9sZEZvbnRzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubGF5ZXJDb25maWcuY2hhcmFjdGVyV2lkdGggPSB0aGlzLmNoYXJhY3RlcldpZHRoID0gdGhpcy4kdGV4dExheWVyLmdldENoYXJhY3RlcldpZHRoKCk7XG4gICAgICAgIHRoaXMubGF5ZXJDb25maWcubGluZUhlaWdodCA9IHRoaXMubGluZUhlaWdodCA9IHRoaXMuJHRleHRMYXllci5nZXRMaW5lSGVpZ2h0KCk7XG4gICAgICAgIHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXNzb2NpYXRlcyB0aGUgcmVuZGVyZXIgd2l0aCBhIGRpZmZlcmVudCBFZGl0U2Vzc2lvbi5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0U2Vzc2lvblxuICAgICAqIEBwYXJhbSBzZXNzaW9uIHtFZGl0U2Vzc2lvbn1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldFNlc3Npb24oc2Vzc2lvbjogRWRpdFNlc3Npb24pOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbikge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmRvYy5vZmYoXCJjaGFuZ2VOZXdMaW5lTW9kZVwiLCB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uID0gc2Vzc2lvbjtcbiAgICAgICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5zY3JvbGxNYXJnaW4udG9wICYmIHNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgPD0gMCkge1xuICAgICAgICAgICAgc2Vzc2lvbi5zZXRTY3JvbGxUb3AoLXRoaXMuc2Nyb2xsTWFyZ2luLnRvcCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5zZXRTZXNzaW9uKHNlc3Npb24pO1xuICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJG1hcmtlckZyb250LnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci5zZXRTZXNzaW9uKHNlc3Npb24pO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLiRzZXRGb250TWV0cmljcyh0aGlzLiRmb250TWV0cmljcyk7XG5cbiAgICAgICAgdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlID0gdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMub25DaGFuZ2VOZXdMaW5lTW9kZSgpXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5kb2Mub24oXCJjaGFuZ2VOZXdMaW5lTW9kZVwiLCB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyaWdnZXJzIGEgcGFydGlhbCB1cGRhdGUgb2YgdGhlIHRleHQsIGZyb20gdGhlIHJhbmdlIGdpdmVuIGJ5IHRoZSB0d28gcGFyYW1ldGVycy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgdXBkYXRlTGluZXNcbiAgICAgKiBAcGFyYW0gZmlyc3RSb3cge251bWJlcn0gVGhlIGZpcnN0IHJvdyB0byB1cGRhdGUuXG4gICAgICogQHBhcmFtIGxhc3RSb3cge251bWJlcn0gVGhlIGxhc3Qgcm93IHRvIHVwZGF0ZS5cbiAgICAgKiBAcGFyYW0gW2ZvcmNlXSB7Ym9vbGVhbn1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHVwZGF0ZUxpbmVzKGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlciwgZm9yY2U/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIGlmIChsYXN0Um93ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGxhc3RSb3cgPSBJbmZpbml0eTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy4kY2hhbmdlZExpbmVzKSB7XG4gICAgICAgICAgICB0aGlzLiRjaGFuZ2VkTGluZXMgPSB7IGZpcnN0Um93OiBmaXJzdFJvdywgbGFzdFJvdzogbGFzdFJvdyB9O1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKHRoaXMuJGNoYW5nZWRMaW5lcy5maXJzdFJvdyA+IGZpcnN0Um93KSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzLmZpcnN0Um93ID0gZmlyc3RSb3c7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdyA8IGxhc3RSb3cpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdyA9IGxhc3RSb3c7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB0aGUgY2hhbmdlIGhhcHBlbmVkIG9mZnNjcmVlbiBhYm92ZSB1cyB0aGVuIGl0J3MgcG9zc2libGVcbiAgICAgICAgLy8gdGhhdCBhIG5ldyBsaW5lIHdyYXAgd2lsbCBhZmZlY3QgdGhlIHBvc2l0aW9uIG9mIHRoZSBsaW5lcyBvbiBvdXJcbiAgICAgICAgLy8gc2NyZWVuIHNvIHRoZXkgbmVlZCByZWRyYXduLlxuICAgICAgICAvLyBUT0RPOiBiZXR0ZXIgc29sdXRpb24gaXMgdG8gbm90IGNoYW5nZSBzY3JvbGwgcG9zaXRpb24gd2hlbiB0ZXh0IGlzIGNoYW5nZWQgb3V0c2lkZSBvZiB2aXNpYmxlIGFyZWFcbiAgICAgICAgaWYgKHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93IDwgdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdykge1xuICAgICAgICAgICAgaWYgKGZvcmNlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3cgPSB0aGlzLmxheWVyQ29uZmlnLmxhc3RSb3c7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy4kY2hhbmdlZExpbmVzLmZpcnN0Um93ID4gdGhpcy5sYXllckNvbmZpZy5sYXN0Um93KSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfTElORVMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb25DaGFuZ2VOZXdMaW5lTW9kZVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlIG9uQ2hhbmdlTmV3TGluZU1vZGUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX1RFWFQpO1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIudXBkYXRlRW9sQ2hhcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb25DaGFuZ2VUYWJTaXplXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgb25DaGFuZ2VUYWJTaXplKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy4kbG9vcCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJGxvb3Auc2NoZWR1bGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9URVhUIHwgQ0hBTkdFX01BUktFUik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyLm9uQ2hhbmdlVGFiU2l6ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci5vbkNoYW5nZVRhYlNpemUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEknbSBub3Qgc3VyZSB3aHkgd2UgY2FuIG5vdyBlbmQgdXAgaGVyZS5cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyaWdnZXJzIGEgZnVsbCB1cGRhdGUgb2YgdGhlIHRleHQsIGZvciBhbGwgdGhlIHJvd3MuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHVwZGF0ZVRleHRcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHVwZGF0ZVRleHQoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX1RFWFQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyaWdnZXJzIGEgZnVsbCB1cGRhdGUgb2YgYWxsIHRoZSBsYXllcnMsIGZvciBhbGwgdGhlIHJvd3MuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHVwZGF0ZUZ1bGxcbiAgICAgKiBAcGFyYW0gW2ZvcmNlXSB7Ym9vbGVhbn0gSWYgYHRydWVgLCBmb3JjZXMgdGhlIGNoYW5nZXMgdGhyb3VnaC5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHVwZGF0ZUZ1bGwoZm9yY2U/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIGlmIChmb3JjZSlcbiAgICAgICAgICAgIHRoaXMuJHJlbmRlckNoYW5nZXMoQ0hBTkdFX0ZVTEwsIHRydWUpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGVzIHRoZSBmb250IHNpemUuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHVwZGF0ZUZvbnRTaXplXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICB1cGRhdGVGb250U2l6ZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLmNoZWNrRm9yU2l6ZUNoYW5nZXMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kICR1cGRhdGVTaXplQXN5bmNcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHByaXZhdGUgJHVwZGF0ZVNpemVBc3luYygpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuJGxvb3AucGVuZGluZykge1xuICAgICAgICAgICAgdGhpcy4kc2l6ZS4kZGlydHkgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5vblJlc2l6ZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJpZ2dlcnMgYSByZXNpemUgb2YgdGhlIHJlbmRlcmVyLlxuICAgICAqXG4gICAgICogQG1ldGhvZFxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZm9yY2UgSWYgYHRydWVgLCByZWNvbXB1dGVzIHRoZSBzaXplLCBldmVuIGlmIHRoZSBoZWlnaHQgYW5kIHdpZHRoIGhhdmVuJ3QgY2hhbmdlZFxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBndXR0ZXJXaWR0aCBUaGUgd2lkdGggb2YgdGhlIGd1dHRlciBpbiBwaXhlbHNcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gd2lkdGggVGhlIHdpZHRoIG9mIHRoZSBlZGl0b3IgaW4gcGl4ZWxzXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGhlaWdodCBUaGUgaGllaGd0IG9mIHRoZSBlZGl0b3IsIGluIHBpeGVsc1xuICAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAgKi9cbiAgICBwdWJsaWMgb25SZXNpemUoZm9yY2U/OiBib29sZWFuLCBndXR0ZXJXaWR0aD86IG51bWJlciwgd2lkdGg/OiBudW1iZXIsIGhlaWdodD86IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmICh0aGlzLnJlc2l6aW5nID4gMilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgZWxzZSBpZiAodGhpcy5yZXNpemluZyA+IDApXG4gICAgICAgICAgICB0aGlzLnJlc2l6aW5nKys7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMucmVzaXppbmcgPSBmb3JjZSA/IDEgOiAwO1xuICAgICAgICAvLyBgfHwgZWwuc2Nyb2xsSGVpZ2h0YCBpcyByZXF1aXJlZCBmb3Igb3V0b3NpemluZyBlZGl0b3JzIG9uIGllXG4gICAgICAgIC8vIHdoZXJlIGVsZW1lbnRzIHdpdGggY2xpZW50SGVpZ2h0ID0gMCBhbHNvZSBoYXZlIGNsaWVudFdpZHRoID0gMFxuICAgICAgICB2YXIgZWwgPSB0aGlzLmNvbnRhaW5lcjtcbiAgICAgICAgaWYgKCFoZWlnaHQpXG4gICAgICAgICAgICBoZWlnaHQgPSBlbC5jbGllbnRIZWlnaHQgfHwgZWwuc2Nyb2xsSGVpZ2h0O1xuICAgICAgICBpZiAoIXdpZHRoKVxuICAgICAgICAgICAgd2lkdGggPSBlbC5jbGllbnRXaWR0aCB8fCBlbC5zY3JvbGxXaWR0aDtcbiAgICAgICAgdmFyIGNoYW5nZXMgPSB0aGlzLiR1cGRhdGVDYWNoZWRTaXplKGZvcmNlLCBndXR0ZXJXaWR0aCwgd2lkdGgsIGhlaWdodCk7XG5cblxuICAgICAgICBpZiAoIXRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgfHwgKCF3aWR0aCAmJiAhaGVpZ2h0KSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnJlc2l6aW5nID0gMDtcblxuICAgICAgICBpZiAoZm9yY2UpXG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci4kcGFkZGluZyA9IG51bGw7XG5cbiAgICAgICAgaWYgKGZvcmNlKVxuICAgICAgICAgICAgdGhpcy4kcmVuZGVyQ2hhbmdlcyhjaGFuZ2VzIHwgdGhpcy4kY2hhbmdlcywgdHJ1ZSk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoY2hhbmdlcyB8IHRoaXMuJGNoYW5nZXMpO1xuXG4gICAgICAgIGlmICh0aGlzLnJlc2l6aW5nKVxuICAgICAgICAgICAgdGhpcy5yZXNpemluZyA9IDA7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdXBkYXRlQ2FjaGVkU2l6ZShmb3JjZTogYm9vbGVhbiwgZ3V0dGVyV2lkdGg6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBoZWlnaHQgLT0gKHRoaXMuJGV4dHJhSGVpZ2h0IHx8IDApO1xuICAgICAgICB2YXIgY2hhbmdlcyA9IDA7XG4gICAgICAgIHZhciBzaXplID0gdGhpcy4kc2l6ZTtcbiAgICAgICAgdmFyIG9sZFNpemUgPSB7XG4gICAgICAgICAgICB3aWR0aDogc2l6ZS53aWR0aCxcbiAgICAgICAgICAgIGhlaWdodDogc2l6ZS5oZWlnaHQsXG4gICAgICAgICAgICBzY3JvbGxlckhlaWdodDogc2l6ZS5zY3JvbGxlckhlaWdodCxcbiAgICAgICAgICAgIHNjcm9sbGVyV2lkdGg6IHNpemUuc2Nyb2xsZXJXaWR0aFxuICAgICAgICB9O1xuICAgICAgICBpZiAoaGVpZ2h0ICYmIChmb3JjZSB8fCBzaXplLmhlaWdodCAhPSBoZWlnaHQpKSB7XG4gICAgICAgICAgICBzaXplLmhlaWdodCA9IGhlaWdodDtcbiAgICAgICAgICAgIGNoYW5nZXMgfD0gQ0hBTkdFX1NJWkU7XG5cbiAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJIZWlnaHQgPSBzaXplLmhlaWdodDtcbiAgICAgICAgICAgIGlmICh0aGlzLiRob3JpelNjcm9sbClcbiAgICAgICAgICAgICAgICBzaXplLnNjcm9sbGVySGVpZ2h0IC09IHRoaXMuc2Nyb2xsQmFySC5oZWlnaHQ7XG5cbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5lbGVtZW50LnN0eWxlLmJvdHRvbSA9IHRoaXMuc2Nyb2xsQmFySC5oZWlnaHQgKyBcInB4XCI7XG5cbiAgICAgICAgICAgIGNoYW5nZXMgPSBjaGFuZ2VzIHwgQ0hBTkdFX1NDUk9MTDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh3aWR0aCAmJiAoZm9yY2UgfHwgc2l6ZS53aWR0aCAhPSB3aWR0aCkpIHtcbiAgICAgICAgICAgIGNoYW5nZXMgfD0gQ0hBTkdFX1NJWkU7XG4gICAgICAgICAgICBzaXplLndpZHRoID0gd2lkdGg7XG5cbiAgICAgICAgICAgIGlmIChndXR0ZXJXaWR0aCA9PSBudWxsKVxuICAgICAgICAgICAgICAgIGd1dHRlcldpZHRoID0gdGhpcy4kc2hvd0d1dHRlciA/IHRoaXMuJGd1dHRlci5vZmZzZXRXaWR0aCA6IDA7XG5cbiAgICAgICAgICAgIHRoaXMuZ3V0dGVyV2lkdGggPSBndXR0ZXJXaWR0aDtcblxuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJILmVsZW1lbnQuc3R5bGUubGVmdCA9XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxlci5zdHlsZS5sZWZ0ID0gZ3V0dGVyV2lkdGggKyBcInB4XCI7XG4gICAgICAgICAgICBzaXplLnNjcm9sbGVyV2lkdGggPSBNYXRoLm1heCgwLCB3aWR0aCAtIGd1dHRlcldpZHRoIC0gdGhpcy5zY3JvbGxCYXJWLndpZHRoKTtcblxuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJILmVsZW1lbnQuc3R5bGUucmlnaHQgPVxuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsZXIuc3R5bGUucmlnaHQgPSB0aGlzLnNjcm9sbEJhclYud2lkdGggKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbGVyLnN0eWxlLmJvdHRvbSA9IHRoaXMuc2Nyb2xsQmFySC5oZWlnaHQgKyBcInB4XCI7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLnNlc3Npb24gJiYgdGhpcy5zZXNzaW9uLmdldFVzZVdyYXBNb2RlKCkgJiYgdGhpcy5hZGp1c3RXcmFwTGltaXQoKSB8fCBmb3JjZSlcbiAgICAgICAgICAgICAgICBjaGFuZ2VzIHw9IENIQU5HRV9GVUxMO1xuICAgICAgICB9XG5cbiAgICAgICAgc2l6ZS4kZGlydHkgPSAhd2lkdGggfHwgIWhlaWdodDtcblxuICAgICAgICBpZiAoY2hhbmdlcykge1xuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBAZXZlbnQgcmVzaXplXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcInJlc2l6ZVwiLCBvbGRTaXplKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBjaGFuZ2VzO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25HdXR0ZXJSZXNpemUoKSB7XG4gICAgICAgIHZhciBndXR0ZXJXaWR0aCA9IHRoaXMuJHNob3dHdXR0ZXIgPyB0aGlzLiRndXR0ZXIub2Zmc2V0V2lkdGggOiAwO1xuICAgICAgICBpZiAoZ3V0dGVyV2lkdGggIT0gdGhpcy5ndXR0ZXJXaWR0aClcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZXMgfD0gdGhpcy4kdXBkYXRlQ2FjaGVkU2l6ZSh0cnVlLCBndXR0ZXJXaWR0aCwgdGhpcy4kc2l6ZS53aWR0aCwgdGhpcy4kc2l6ZS5oZWlnaHQpO1xuXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKSAmJiB0aGlzLmFkanVzdFdyYXBMaW1pdCgpKSB7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLiRzaXplLiRkaXJ0eSkge1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiRjb21wdXRlTGF5ZXJDb25maWcoKTtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX01BUktFUik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGp1c3RzIHRoZSB3cmFwIGxpbWl0LCB3aGljaCBpcyB0aGUgbnVtYmVyIG9mIGNoYXJhY3RlcnMgdGhhdCBjYW4gZml0IHdpdGhpbiB0aGUgd2lkdGggb2YgdGhlIGVkaXQgYXJlYSBvbiBzY3JlZW4uXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGFkanVzdFdyYXBMaW1pdFxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgcHVibGljIGFkanVzdFdyYXBMaW1pdCgpOiBib29sZWFuIHtcbiAgICAgICAgdmFyIGF2YWlsYWJsZVdpZHRoID0gdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gdGhpcy4kcGFkZGluZyAqIDI7XG4gICAgICAgIHZhciBsaW1pdCA9IE1hdGguZmxvb3IoYXZhaWxhYmxlV2lkdGggLyB0aGlzLmNoYXJhY3RlcldpZHRoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5hZGp1c3RXcmFwTGltaXQobGltaXQsIHRoaXMuJHNob3dQcmludE1hcmdpbiAmJiB0aGlzLiRwcmludE1hcmdpbkNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIGhhdmUgYW4gYW5pbWF0ZWQgc2Nyb2xsIG9yIG5vdC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0QW5pbWF0ZWRTY3JvbGxcbiAgICAgKiBAcGFyYW0gc2hvdWxkQW5pbWF0ZSB7Ym9vbGVhbn0gU2V0IHRvIGB0cnVlYCB0byBzaG93IGFuaW1hdGVkIHNjcm9sbHMuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRBbmltYXRlZFNjcm9sbChzaG91bGRBbmltYXRlOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiYW5pbWF0ZWRTY3JvbGxcIiwgc2hvdWxkQW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB3aGV0aGVyIGFuIGFuaW1hdGVkIHNjcm9sbCBoYXBwZW5zIG9yIG5vdC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0QW5pbWF0ZWRTY3JvbGxcbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqL1xuICAgIGdldEFuaW1hdGVkU2Nyb2xsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kYW5pbWF0ZWRTY3JvbGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgaW52aXNpYmxlIGNoYXJhY3RlcnMgb3Igbm90LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRTaG93SW52aXNpYmxlc1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvd0ludmlzaWJsZXMgU2V0IHRvIGB0cnVlYCB0byBzaG93IGludmlzaWJsZXNcbiAgICAgKi9cbiAgICBzZXRTaG93SW52aXNpYmxlcyhzaG93SW52aXNpYmxlczogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInNob3dJbnZpc2libGVzXCIsIHNob3dJbnZpc2libGVzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHdoZXRoZXIgaW52aXNpYmxlIGNoYXJhY3RlcnMgYXJlIGJlaW5nIHNob3duIG9yIG5vdC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0U2hvd0ludmlzaWJsZXNcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIGdldFNob3dJbnZpc2libGVzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzaG93SW52aXNpYmxlc1wiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIGdldERpc3BsYXlJbmRlbnRHdWlkZXNcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIGdldERpc3BsYXlJbmRlbnRHdWlkZXMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImRpc3BsYXlJbmRlbnRHdWlkZXNcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBzZXREaXNwbGF5SW5kZW50R3VpZGVzXG4gICAgICogQHBhcmFtIGRpc3BsYXlJbmRlbnRHdWlkZXMge2Jvb2xlYW59XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXREaXNwbGF5SW5kZW50R3VpZGVzKGRpc3BsYXlJbmRlbnRHdWlkZXM6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJkaXNwbGF5SW5kZW50R3VpZGVzXCIsIGRpc3BsYXlJbmRlbnRHdWlkZXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IHRoZSBwcmludCBtYXJnaW4gb3Igbm90LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRTaG93UHJpbnRNYXJnaW5cbiAgICAgKiBAcGFyYW0gc2hvd1ByaW50TWFyZ2luIHtib29sZWFufSBTZXQgdG8gYHRydWVgIHRvIHNob3cgdGhlIHByaW50IG1hcmdpbi5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldFNob3dQcmludE1hcmdpbihzaG93UHJpbnRNYXJnaW46IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJzaG93UHJpbnRNYXJnaW5cIiwgc2hvd1ByaW50TWFyZ2luKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHByaW50IG1hcmdpbiBpcyBiZWluZyBzaG93biBvciBub3QuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFNob3dQcmludE1hcmdpblxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd1ByaW50TWFyZ2luKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzaG93UHJpbnRNYXJnaW5cIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgY29sdW1uIGRlZmluaW5nIHdoZXJlIHRoZSBwcmludCBtYXJnaW4gc2hvdWxkIGJlLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRQcmludE1hcmdpbkNvbHVtblxuICAgICAqIEBwYXJhbSBwcmludE1hcmdpbkNvbHVtbiB7bnVtYmVyfSBTcGVjaWZpZXMgdGhlIG5ldyBwcmludCBtYXJnaW4uXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRQcmludE1hcmdpbkNvbHVtbihwcmludE1hcmdpbkNvbHVtbjogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwicHJpbnRNYXJnaW5Db2x1bW5cIiwgcHJpbnRNYXJnaW5Db2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGNvbHVtbiBudW1iZXIgb2Ygd2hlcmUgdGhlIHByaW50IG1hcmdpbiBpcy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0UHJpbnRNYXJnaW5Db2x1bW5cbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICovXG4gICAgZ2V0UHJpbnRNYXJnaW5Db2x1bW4oKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwicHJpbnRNYXJnaW5Db2x1bW5cIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGd1dHRlciBpcyBiZWluZyBzaG93bi5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0U2hvd0d1dHRlclxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd0d1dHRlcigpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwic2hvd0d1dHRlclwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyB0aGUgZ3V0dGVyIG9yIG5vdC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0U2hvd0d1dHRlclxuICAgICAqIEBwYXJhbSBzaG93R3V0dGVyIHtib29sZWFufSBTZXQgdG8gYHRydWVgIHRvIHNob3cgdGhlIGd1dHRlclxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0U2hvd0d1dHRlcihzaG93R3V0dGVyOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHJldHVybiB0aGlzLnNldE9wdGlvbihcInNob3dHdXR0ZXJcIiwgc2hvd0d1dHRlcik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBnZXRGYWRlRm9sZFdpZGdldHNcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIGdldEZhZGVGb2xkV2lkZ2V0cygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiZmFkZUZvbGRXaWRnZXRzXCIpXG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBzZXRGYWRlRm9sZFdpZGdldHNcbiAgICAgKiBAcGFyYW0gZmFkZUZvbGRXaWRnZXRzIHtib29sZWFufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0RmFkZUZvbGRXaWRnZXRzKGZhZGVGb2xkV2lkZ2V0czogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImZhZGVGb2xkV2lkZ2V0c1wiLCBmYWRlRm9sZFdpZGdldHMpO1xuICAgIH1cblxuICAgIHNldEhpZ2hsaWdodEd1dHRlckxpbmUoaGlnaGxpZ2h0R3V0dGVyTGluZTogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImhpZ2hsaWdodEd1dHRlckxpbmVcIiwgaGlnaGxpZ2h0R3V0dGVyTGluZSk7XG4gICAgfVxuXG4gICAgZ2V0SGlnaGxpZ2h0R3V0dGVyTGluZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiaGlnaGxpZ2h0R3V0dGVyTGluZVwiKTtcbiAgICB9XG5cbiAgICAkdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpIHtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuJGN1cnNvckxheWVyLiRwaXhlbFBvcztcbiAgICAgICAgdmFyIGhlaWdodCA9IHRoaXMubGF5ZXJDb25maWcubGluZUhlaWdodDtcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi5nZXRVc2VXcmFwTW9kZSgpKSB7XG4gICAgICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5zZXNzaW9uLmdldFNlbGVjdGlvbigpLmdldEN1cnNvcigpO1xuICAgICAgICAgICAgY3Vyc29yLmNvbHVtbiA9IDA7XG4gICAgICAgICAgICBwb3MgPSB0aGlzLiRjdXJzb3JMYXllci5nZXRQaXhlbFBvc2l0aW9uKGN1cnNvciwgdHJ1ZSk7XG4gICAgICAgICAgICBoZWlnaHQgKj0gdGhpcy5zZXNzaW9uLmdldFJvd0xlbmd0aChjdXJzb3Iucm93KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0LnN0eWxlLnRvcCA9IHBvcy50b3AgLSB0aGlzLmxheWVyQ29uZmlnLm9mZnNldCArIFwicHhcIjtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodC5zdHlsZS5oZWlnaHQgPSBoZWlnaHQgKyBcInB4XCI7XG4gICAgfVxuXG4gICAgJHVwZGF0ZVByaW50TWFyZ2luKCkge1xuICAgICAgICBpZiAoIXRoaXMuJHNob3dQcmludE1hcmdpbiAmJiAhdGhpcy4kcHJpbnRNYXJnaW5FbClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBpZiAoIXRoaXMuJHByaW50TWFyZ2luRWwpIHtcbiAgICAgICAgICAgIHZhciBjb250YWluZXJFbDogSFRNTERpdkVsZW1lbnQgPSA8SFRNTERpdkVsZW1lbnQ+Y3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIGNvbnRhaW5lckVsLmNsYXNzTmFtZSA9IFwiYWNlX2xheWVyIGFjZV9wcmludC1tYXJnaW4tbGF5ZXJcIjtcbiAgICAgICAgICAgIHRoaXMuJHByaW50TWFyZ2luRWwgPSBjcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgdGhpcy4kcHJpbnRNYXJnaW5FbC5jbGFzc05hbWUgPSBcImFjZV9wcmludC1tYXJnaW5cIjtcbiAgICAgICAgICAgIGNvbnRhaW5lckVsLmFwcGVuZENoaWxkKHRoaXMuJHByaW50TWFyZ2luRWwpO1xuICAgICAgICAgICAgdGhpcy5jb250ZW50Lmluc2VydEJlZm9yZShjb250YWluZXJFbCwgdGhpcy5jb250ZW50LmZpcnN0Q2hpbGQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHN0eWxlID0gdGhpcy4kcHJpbnRNYXJnaW5FbC5zdHlsZTtcbiAgICAgICAgc3R5bGUubGVmdCA9ICgodGhpcy5jaGFyYWN0ZXJXaWR0aCAqIHRoaXMuJHByaW50TWFyZ2luQ29sdW1uKSArIHRoaXMuJHBhZGRpbmcpICsgXCJweFwiO1xuICAgICAgICBzdHlsZS52aXNpYmlsaXR5ID0gdGhpcy4kc2hvd1ByaW50TWFyZ2luID8gXCJ2aXNpYmxlXCIgOiBcImhpZGRlblwiO1xuXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24gJiYgdGhpcy5zZXNzaW9uWyckd3JhcCddID09IC0xKVxuICAgICAgICAgICAgdGhpcy5hZGp1c3RXcmFwTGltaXQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSByb290IGVsZW1lbnQgY29udGFpbmluZyB0aGlzIHJlbmRlcmVyLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRDb250YWluZXJFbGVtZW50XG4gICAgICogQHJldHVybiB7SFRNTEVsZW1lbnR9XG4gICAgICovXG4gICAgZ2V0Q29udGFpbmVyRWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRhaW5lcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBlbGVtZW50IHRoYXQgdGhlIG1vdXNlIGV2ZW50cyBhcmUgYXR0YWNoZWQgdG9cbiAgICAqIEByZXR1cm4ge0RPTUVsZW1lbnR9XG4gICAgKiovXG4gICAgZ2V0TW91c2VFdmVudFRhcmdldCgpOiBIVE1MRGl2RWxlbWVudCB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRlbnQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgZWxlbWVudCB0byB3aGljaCB0aGUgaGlkZGVuIHRleHQgYXJlYSBpcyBhZGRlZC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0VGV4dEFyZWFDb250YWluZXJcbiAgICAgKiBAcmV0dXJuIHtIVE1MRWxlbWVudH1cbiAgICAgKi9cbiAgICBnZXRUZXh0QXJlYUNvbnRhaW5lcigpOiBIVE1MRWxlbWVudCB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRhaW5lcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlIHRleHQgaW5wdXQgb3ZlciB0aGUgY3Vyc29yLlxuICAgICAqIFJlcXVpcmVkIGZvciBpT1MgYW5kIElNRS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgJG1vdmVUZXh0QXJlYVRvQ3Vyc29yXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHB1YmxpYyAkbW92ZVRleHRBcmVhVG9DdXJzb3IoKTogdm9pZCB7XG5cbiAgICAgICAgaWYgKCF0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvcikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBjb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuICAgICAgICB2YXIgcG9zVG9wID0gdGhpcy4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zLnRvcDtcbiAgICAgICAgdmFyIHBvc0xlZnQgPSB0aGlzLiRjdXJzb3JMYXllci4kcGl4ZWxQb3MubGVmdDtcbiAgICAgICAgcG9zVG9wIC09IGNvbmZpZy5vZmZzZXQ7XG5cbiAgICAgICAgdmFyIGggPSB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIGlmIChwb3NUb3AgPCAwIHx8IHBvc1RvcCA+IGNvbmZpZy5oZWlnaHQgLSBoKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciB3ID0gdGhpcy5jaGFyYWN0ZXJXaWR0aDtcbiAgICAgICAgaWYgKHRoaXMuJGNvbXBvc2l0aW9uKSB7XG4gICAgICAgICAgICB2YXIgdmFsID0gdGhpcy50ZXh0YXJlYS52YWx1ZS5yZXBsYWNlKC9eXFx4MDErLywgXCJcIik7XG4gICAgICAgICAgICB3ICo9ICh0aGlzLnNlc3Npb24uJGdldFN0cmluZ1NjcmVlbldpZHRoKHZhbClbMF0gKyAyKTtcbiAgICAgICAgICAgIGggKz0gMjtcbiAgICAgICAgICAgIHBvc1RvcCAtPSAxO1xuICAgICAgICB9XG4gICAgICAgIHBvc0xlZnQgLT0gdGhpcy5zY3JvbGxMZWZ0O1xuICAgICAgICBpZiAocG9zTGVmdCA+IHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCAtIHcpXG4gICAgICAgICAgICBwb3NMZWZ0ID0gdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gdztcblxuICAgICAgICBwb3NMZWZ0IC09IHRoaXMuc2Nyb2xsQmFyVi53aWR0aDtcblxuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLmhlaWdodCA9IGggKyBcInB4XCI7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUud2lkdGggPSB3ICsgXCJweFwiO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLnJpZ2h0ID0gTWF0aC5tYXgoMCwgdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gcG9zTGVmdCAtIHcpICsgXCJweFwiO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLmJvdHRvbSA9IE1hdGgubWF4KDAsIHRoaXMuJHNpemUuaGVpZ2h0IC0gcG9zVG9wIC0gaCkgKyBcInB4XCI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGZpcnN0IHZpc2libGUgcm93LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRGaXJzdFZpc2libGVSb3dcbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgICovXG4gICAgZ2V0Rmlyc3RWaXNpYmxlUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBmaXJzdCBmdWxseSB2aXNpYmxlIHJvdy4gXCJGdWxseVwiIGhlcmUgbWVhbnMgdGhhdCB0aGUgY2hhcmFjdGVycyBpbiB0aGUgcm93IGFyZSBub3QgdHJ1bmNhdGVkOyB0aGF0IHRoZSB0b3AgYW5kIHRoZSBib3R0b20gb2YgdGhlIHJvdyBhcmUgb24gdGhlIHNjcmVlbi5cbiAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAqKi9cbiAgICBnZXRGaXJzdEZ1bGx5VmlzaWJsZVJvdygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdyArICh0aGlzLmxheWVyQ29uZmlnLm9mZnNldCA9PT0gMCA/IDAgOiAxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbGFzdCBmdWxseSB2aXNpYmxlIHJvdy4gXCJGdWxseVwiIGhlcmUgbWVhbnMgdGhhdCB0aGUgY2hhcmFjdGVycyBpbiB0aGUgcm93IGFyZSBub3QgdHJ1bmNhdGVkOyB0aGF0IHRoZSB0b3AgYW5kIHRoZSBib3R0b20gb2YgdGhlIHJvdyBhcmUgb24gdGhlIHNjcmVlbi5cbiAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAqKi9cbiAgICBnZXRMYXN0RnVsbHlWaXNpYmxlUm93KCk6IG51bWJlciB7XG4gICAgICAgIHZhciBmbGludCA9IE1hdGguZmxvb3IoKHRoaXMubGF5ZXJDb25maWcuaGVpZ2h0ICsgdGhpcy5sYXllckNvbmZpZy5vZmZzZXQpIC8gdGhpcy5sYXllckNvbmZpZy5saW5lSGVpZ2h0KTtcbiAgICAgICAgcmV0dXJuIHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3cgLSAxICsgZmxpbnQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGxhc3QgdmlzaWJsZSByb3cuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldExhc3RWaXNpYmxlUm93XG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqL1xuICAgIGdldExhc3RWaXNpYmxlUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmxheWVyQ29uZmlnLmxhc3RSb3c7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgcGFkZGluZyBmb3IgYWxsIHRoZSBsYXllcnMuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFBhZGRpbmdcbiAgICAgKiBAcGFyYW0gcGFkZGluZyB7bnVtYmVyfSBBIG5ldyBwYWRkaW5nIHZhbHVlIChpbiBwaXhlbHMpLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0UGFkZGluZyhwYWRkaW5nOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKHR5cGVvZiBwYWRkaW5nICE9PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcInBhZGRpbmcgbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRwYWRkaW5nID0gcGFkZGluZztcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJG1hcmtlckZyb250LnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJG1hcmtlckJhY2suc2V0UGFkZGluZyhwYWRkaW5nKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG4gICAgICAgIHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7XG4gICAgfVxuXG4gICAgc2V0U2Nyb2xsTWFyZ2luKHRvcDogbnVtYmVyLCBib3R0b206IG51bWJlciwgbGVmdDogbnVtYmVyLCByaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHZhciBzbSA9IHRoaXMuc2Nyb2xsTWFyZ2luO1xuICAgICAgICBzbS50b3AgPSB0b3AgfCAwO1xuICAgICAgICBzbS5ib3R0b20gPSBib3R0b20gfCAwO1xuICAgICAgICBzbS5yaWdodCA9IHJpZ2h0IHwgMDtcbiAgICAgICAgc20ubGVmdCA9IGxlZnQgfCAwO1xuICAgICAgICBzbS52ID0gc20udG9wICsgc20uYm90dG9tO1xuICAgICAgICBzbS5oID0gc20ubGVmdCArIHNtLnJpZ2h0O1xuICAgICAgICBpZiAoc20udG9wICYmIHRoaXMuc2Nyb2xsVG9wIDw9IDAgJiYgdGhpcy5zZXNzaW9uKVxuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcCgtc20udG9wKTtcbiAgICAgICAgdGhpcy51cGRhdGVGdWxsKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB3aGV0aGVyIHRoZSBob3Jpem9udGFsIHNjcm9sbGJhciBpcyBzZXQgdG8gYmUgYWx3YXlzIHZpc2libGUuXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgZ2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUoKTogYm9vbGVhbiB7XG4gICAgICAgIC8vIEZJWE1FP1xuICAgICAgICByZXR1cm4gdGhpcy4kaFNjcm9sbEJhckFsd2F5c1Zpc2libGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyIG9yIG5vdC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGVcbiAgICAgKiBAcGFyYW0gaFNjcm9sbEJhckFsd2F5c1Zpc2libGUge2Jvb2xlYW59IFNldCB0byBgdHJ1ZWAgdG8gbWFrZSB0aGUgaG9yaXpvbnRhbCBzY3JvbGwgYmFyIHZpc2libGUuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRIU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZShoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImhTY3JvbGxCYXJBbHdheXNWaXNpYmxlXCIsIGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHZlcnRpY2FsIHNjcm9sbGJhciBpcyBzZXQgdG8gYmUgYWx3YXlzIHZpc2libGUuXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgZ2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLiR2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyB0aGUgdmVydGljYWwgc2Nyb2xsYmFyIG9yIG5vdC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFsd2F5c1Zpc2libGUgU2V0IHRvIGB0cnVlYCB0byBtYWtlIHRoZSB2ZXJ0aWNhbCBzY3JvbGwgYmFyIHZpc2libGVcbiAgICAgKi9cbiAgICBzZXRWU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZShhbHdheXNWaXNpYmxlOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwidlNjcm9sbEJhckFsd2F5c1Zpc2libGVcIiwgYWx3YXlzVmlzaWJsZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdXBkYXRlU2Nyb2xsQmFyVigpOiB2b2lkIHtcbiAgICAgICAgdmFyIHNjcm9sbEhlaWdodCA9IHRoaXMubGF5ZXJDb25maWcubWF4SGVpZ2h0O1xuICAgICAgICB2YXIgc2Nyb2xsZXJIZWlnaHQgPSB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0O1xuICAgICAgICBpZiAoIXRoaXMuJG1heExpbmVzICYmIHRoaXMuJHNjcm9sbFBhc3RFbmQpIHtcbiAgICAgICAgICAgIHNjcm9sbEhlaWdodCAtPSAoc2Nyb2xsZXJIZWlnaHQgLSB0aGlzLmxpbmVIZWlnaHQpICogdGhpcy4kc2Nyb2xsUGFzdEVuZDtcbiAgICAgICAgICAgIGlmICh0aGlzLnNjcm9sbFRvcCA+IHNjcm9sbEhlaWdodCAtIHNjcm9sbGVySGVpZ2h0KSB7XG4gICAgICAgICAgICAgICAgc2Nyb2xsSGVpZ2h0ID0gdGhpcy5zY3JvbGxUb3AgKyBzY3JvbGxlckhlaWdodDtcbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2Nyb2xsVG9wID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2V0U2Nyb2xsSGVpZ2h0KHNjcm9sbEhlaWdodCArIHRoaXMuc2Nyb2xsTWFyZ2luLnYpO1xuICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2V0U2Nyb2xsVG9wKHRoaXMuc2Nyb2xsVG9wICsgdGhpcy5zY3JvbGxNYXJnaW4udG9wKTtcbiAgICB9XG5cbiAgICBwcml2YXRlICR1cGRhdGVTY3JvbGxCYXJIKCkge1xuICAgICAgICB0aGlzLnNjcm9sbEJhckguc2V0U2Nyb2xsV2lkdGgodGhpcy5sYXllckNvbmZpZy53aWR0aCArIDIgKiB0aGlzLiRwYWRkaW5nICsgdGhpcy5zY3JvbGxNYXJnaW4uaCk7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFySC5zZXRTY3JvbGxMZWZ0KHRoaXMuc2Nyb2xsTGVmdCArIHRoaXMuc2Nyb2xsTWFyZ2luLmxlZnQpO1xuICAgIH1cblxuICAgIGZyZWV6ZSgpIHtcbiAgICAgICAgdGhpcy4kZnJvemVuID0gdHJ1ZTtcbiAgICB9XG5cbiAgICB1bmZyZWV6ZSgpIHtcbiAgICAgICAgdGhpcy4kZnJvemVuID0gZmFsc2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCAkcmVuZGVyQ2hhbmdlc1xuICAgICAqIEBwYXJhbSBjaGFuZ2VzIHtudW1iZXJ9XG4gICAgICogQHBhcmFtIGZvcmNlIHtib29sZWFufVxuICAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgJHJlbmRlckNoYW5nZXMoY2hhbmdlczogbnVtYmVyLCBmb3JjZTogYm9vbGVhbik6IG51bWJlciB7XG5cbiAgICAgICAgaWYgKHRoaXMuJGNoYW5nZXMpIHtcbiAgICAgICAgICAgIGNoYW5nZXMgfD0gdGhpcy4kY2hhbmdlcztcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZXMgPSAwO1xuICAgICAgICB9XG4gICAgICAgIGlmICgoIXRoaXMuc2Vzc2lvbiB8fCAhdGhpcy5jb250YWluZXIub2Zmc2V0V2lkdGggfHwgdGhpcy4kZnJvemVuKSB8fCAoIWNoYW5nZXMgJiYgIWZvcmNlKSkge1xuICAgICAgICAgICAgdGhpcy4kY2hhbmdlcyB8PSBjaGFuZ2VzO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLiRzaXplLiRkaXJ0eSkge1xuICAgICAgICAgICAgdGhpcy4kY2hhbmdlcyB8PSBjaGFuZ2VzO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMub25SZXNpemUodHJ1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLmxpbmVIZWlnaHQpIHtcbiAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci5jaGVja0ZvclNpemVDaGFuZ2VzKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGJlZm9yZVJlbmRlclxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiYmVmb3JlUmVuZGVyXCIpO1xuXG4gICAgICAgIHZhciBjb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuICAgICAgICAvLyB0ZXh0LCBzY3JvbGxpbmcgYW5kIHJlc2l6ZSBjaGFuZ2VzIGNhbiBjYXVzZSB0aGUgdmlldyBwb3J0IHNpemUgdG8gY2hhbmdlXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0ZVTEwgfHxcbiAgICAgICAgICAgIGNoYW5nZXMgJiBDSEFOR0VfU0laRSB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9URVhUIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX0xJTkVTIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX1NDUk9MTCB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9IX1NDUk9MTFxuICAgICAgICApIHtcbiAgICAgICAgICAgIGNoYW5nZXMgfD0gdGhpcy4kY29tcHV0ZUxheWVyQ29uZmlnKCk7XG4gICAgICAgICAgICAvLyBJZiBhIGNoYW5nZSBpcyBtYWRlIG9mZnNjcmVlbiBhbmQgd3JhcE1vZGUgaXMgb24sIHRoZW4gdGhlIG9uc2NyZWVuXG4gICAgICAgICAgICAvLyBsaW5lcyBtYXkgaGF2ZSBiZWVuIHB1c2hlZCBkb3duLiBJZiBzbywgdGhlIGZpcnN0IHNjcmVlbiByb3cgd2lsbCBub3RcbiAgICAgICAgICAgIC8vIGhhdmUgY2hhbmdlZCwgYnV0IHRoZSBmaXJzdCBhY3R1YWwgcm93IHdpbGwuIEluIHRoYXQgY2FzZSwgYWRqdXN0IFxuICAgICAgICAgICAgLy8gc2Nyb2xsVG9wIHNvIHRoYXQgdGhlIGN1cnNvciBhbmQgb25zY3JlZW4gY29udGVudCBzdGF5cyBpbiB0aGUgc2FtZSBwbGFjZS5cbiAgICAgICAgICAgIGlmIChjb25maWcuZmlyc3RSb3cgIT0gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdyAmJiBjb25maWcuZmlyc3RSb3dTY3JlZW4gPT0gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvd1NjcmVlbikge1xuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsVG9wID0gdGhpcy5zY3JvbGxUb3AgKyAoY29uZmlnLmZpcnN0Um93IC0gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdykgKiB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgICAgICAgICAgY2hhbmdlcyA9IGNoYW5nZXMgfCBDSEFOR0VfU0NST0xMO1xuICAgICAgICAgICAgICAgIGNoYW5nZXMgfD0gdGhpcy4kY29tcHV0ZUxheWVyQ29uZmlnKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuICAgICAgICAgICAgLy8gdXBkYXRlIHNjcm9sbGJhciBmaXJzdCB0byBub3QgbG9zZSBzY3JvbGwgcG9zaXRpb24gd2hlbiBndXR0ZXIgY2FsbHMgcmVzaXplXG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVTY3JvbGxCYXJWKCk7XG4gICAgICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9IX1NDUk9MTClcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVTY3JvbGxCYXJIKCk7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5lbGVtZW50LnN0eWxlLm1hcmdpblRvcCA9ICgtY29uZmlnLm9mZnNldCkgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUubWFyZ2luVG9wID0gKC1jb25maWcub2Zmc2V0KSArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS53aWR0aCA9IGNvbmZpZy53aWR0aCArIDIgKiB0aGlzLiRwYWRkaW5nICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLmhlaWdodCA9IGNvbmZpZy5taW5IZWlnaHQgKyBcInB4XCI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBob3Jpem9udGFsIHNjcm9sbGluZ1xuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9IX1NDUk9MTCkge1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLm1hcmdpbkxlZnQgPSAtdGhpcy5zY3JvbGxMZWZ0ICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxlci5jbGFzc05hbWUgPSB0aGlzLnNjcm9sbExlZnQgPD0gMCA/IFwiYWNlX3Njcm9sbGVyXCIgOiBcImFjZV9zY3JvbGxlciBhY2Vfc2Nyb2xsLWxlZnRcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGZ1bGxcbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfRlVMTCkge1xuICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckJhY2sudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICAgICAgICAgIHRoaXMuJGhpZ2hsaWdodEd1dHRlckxpbmUgJiYgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIEBldmVudCBhZnRlclJlbmRlclxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJhZnRlclJlbmRlclwiKTtcblxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gc2Nyb2xsaW5nXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX1NDUk9MTCkge1xuICAgICAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfVEVYVCB8fCBjaGFuZ2VzICYgQ0hBTkdFX0xJTkVTKVxuICAgICAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuc2Nyb2xsTGluZXMoY29uZmlnKTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRjdXJzb3JMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJGhpZ2hsaWdodEd1dHRlckxpbmUgJiYgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuICAgICAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IGFmdGVyUmVuZGVyXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImFmdGVyUmVuZGVyXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfVEVYVCkge1xuICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2hhbmdlcyAmIENIQU5HRV9MSU5FUykge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHVwZGF0ZUxpbmVzKCkgfHwgKGNoYW5nZXMgJiBDSEFOR0VfR1VUVEVSKSAmJiB0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoYW5nZXMgJiBDSEFOR0VfVEVYVCB8fCBjaGFuZ2VzICYgQ0hBTkdFX0dVVFRFUikge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9DVVJTT1IpIHtcbiAgICAgICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICAgICAgICAgIHRoaXMuJGhpZ2hsaWdodEd1dHRlckxpbmUgJiYgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoYW5nZXMgJiAoQ0hBTkdFX01BUktFUiB8IENIQU5HRV9NQVJLRVJfRlJPTlQpKSB7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjaGFuZ2VzICYgKENIQU5HRV9NQVJLRVIgfCBDSEFOR0VfTUFSS0VSX0JBQ0spKSB7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBhZnRlclJlbmRlclxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiYWZ0ZXJSZW5kZXJcIik7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkYXV0b3NpemUoKSB7XG4gICAgICAgIHZhciBoZWlnaHQgPSB0aGlzLnNlc3Npb24uZ2V0U2NyZWVuTGVuZ3RoKCkgKiB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBtYXhIZWlnaHQgPSB0aGlzLiRtYXhMaW5lcyAqIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgdmFyIGRlc2lyZWRIZWlnaHQgPSBNYXRoLm1heChcbiAgICAgICAgICAgICh0aGlzLiRtaW5MaW5lcyB8fCAxKSAqIHRoaXMubGluZUhlaWdodCxcbiAgICAgICAgICAgIE1hdGgubWluKG1heEhlaWdodCwgaGVpZ2h0KVxuICAgICAgICApICsgdGhpcy5zY3JvbGxNYXJnaW4udiArICh0aGlzLiRleHRyYUhlaWdodCB8fCAwKTtcbiAgICAgICAgdmFyIHZTY3JvbGwgPSBoZWlnaHQgPiBtYXhIZWlnaHQ7XG5cbiAgICAgICAgaWYgKGRlc2lyZWRIZWlnaHQgIT0gdGhpcy5kZXNpcmVkSGVpZ2h0IHx8XG4gICAgICAgICAgICB0aGlzLiRzaXplLmhlaWdodCAhPSB0aGlzLmRlc2lyZWRIZWlnaHQgfHwgdlNjcm9sbCAhPSB0aGlzLiR2U2Nyb2xsKSB7XG4gICAgICAgICAgICBpZiAodlNjcm9sbCAhPSB0aGlzLiR2U2Nyb2xsKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kdlNjcm9sbCA9IHZTY3JvbGw7XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJWLnNldFZpc2libGUodlNjcm9sbCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB3ID0gdGhpcy5jb250YWluZXIuY2xpZW50V2lkdGg7XG4gICAgICAgICAgICB0aGlzLmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBkZXNpcmVkSGVpZ2h0ICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy4kdXBkYXRlQ2FjaGVkU2l6ZSh0cnVlLCB0aGlzLiRndXR0ZXJXaWR0aCwgdywgZGVzaXJlZEhlaWdodCk7XG4gICAgICAgICAgICAvLyB0aGlzLiRsb29wLmNoYW5nZXMgPSAwO1xuICAgICAgICAgICAgdGhpcy5kZXNpcmVkSGVpZ2h0ID0gZGVzaXJlZEhlaWdodDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJGNvbXB1dGVMYXllckNvbmZpZygpIHtcblxuICAgICAgICBpZiAodGhpcy4kbWF4TGluZXMgJiYgdGhpcy5saW5lSGVpZ2h0ID4gMSkge1xuICAgICAgICAgICAgdGhpcy4kYXV0b3NpemUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICB2YXIgc2l6ZSA9IHRoaXMuJHNpemU7XG5cbiAgICAgICAgdmFyIGhpZGVTY3JvbGxiYXJzID0gc2l6ZS5oZWlnaHQgPD0gMiAqIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgdmFyIHNjcmVlbkxpbmVzID0gdGhpcy5zZXNzaW9uLmdldFNjcmVlbkxlbmd0aCgpO1xuICAgICAgICB2YXIgbWF4SGVpZ2h0ID0gc2NyZWVuTGluZXMgKiB0aGlzLmxpbmVIZWlnaHQ7XG5cbiAgICAgICAgdmFyIG9mZnNldCA9IHRoaXMuc2Nyb2xsVG9wICUgdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgbWluSGVpZ2h0ID0gc2l6ZS5zY3JvbGxlckhlaWdodCArIHRoaXMubGluZUhlaWdodDtcblxuICAgICAgICB2YXIgbG9uZ2VzdExpbmUgPSB0aGlzLiRnZXRMb25nZXN0TGluZSgpO1xuXG4gICAgICAgIHZhciBob3JpelNjcm9sbCA9ICFoaWRlU2Nyb2xsYmFycyAmJiAodGhpcy4kaFNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHxcbiAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJXaWR0aCAtIGxvbmdlc3RMaW5lIC0gMiAqIHRoaXMuJHBhZGRpbmcgPCAwKTtcblxuICAgICAgICB2YXIgaFNjcm9sbENoYW5nZWQgPSB0aGlzLiRob3JpelNjcm9sbCAhPT0gaG9yaXpTY3JvbGw7XG4gICAgICAgIGlmIChoU2Nyb2xsQ2hhbmdlZCkge1xuICAgICAgICAgICAgdGhpcy4kaG9yaXpTY3JvbGwgPSBob3JpelNjcm9sbDtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFySC5zZXRWaXNpYmxlKGhvcml6U2Nyb2xsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy4kbWF4TGluZXMgJiYgdGhpcy4kc2Nyb2xsUGFzdEVuZCkge1xuICAgICAgICAgICAgbWF4SGVpZ2h0ICs9IChzaXplLnNjcm9sbGVySGVpZ2h0IC0gdGhpcy5saW5lSGVpZ2h0KSAqIHRoaXMuJHNjcm9sbFBhc3RFbmQ7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdlNjcm9sbCA9ICFoaWRlU2Nyb2xsYmFycyAmJiAodGhpcy4kdlNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHxcbiAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJIZWlnaHQgLSBtYXhIZWlnaHQgPCAwKTtcbiAgICAgICAgdmFyIHZTY3JvbGxDaGFuZ2VkID0gdGhpcy4kdlNjcm9sbCAhPT0gdlNjcm9sbDtcbiAgICAgICAgaWYgKHZTY3JvbGxDaGFuZ2VkKSB7XG4gICAgICAgICAgICB0aGlzLiR2U2Nyb2xsID0gdlNjcm9sbDtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zZXRWaXNpYmxlKHZTY3JvbGwpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChNYXRoLm1heCgtdGhpcy5zY3JvbGxNYXJnaW4udG9wLFxuICAgICAgICAgICAgTWF0aC5taW4odGhpcy5zY3JvbGxUb3AsIG1heEhlaWdodCAtIHNpemUuc2Nyb2xsZXJIZWlnaHQgKyB0aGlzLnNjcm9sbE1hcmdpbi5ib3R0b20pKSk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQoTWF0aC5tYXgoLXRoaXMuc2Nyb2xsTWFyZ2luLmxlZnQsIE1hdGgubWluKHRoaXMuc2Nyb2xsTGVmdCxcbiAgICAgICAgICAgIGxvbmdlc3RMaW5lICsgMiAqIHRoaXMuJHBhZGRpbmcgLSBzaXplLnNjcm9sbGVyV2lkdGggKyB0aGlzLnNjcm9sbE1hcmdpbi5yaWdodCkpKTtcblxuICAgICAgICB2YXIgbGluZUNvdW50ID0gTWF0aC5jZWlsKG1pbkhlaWdodCAvIHRoaXMubGluZUhlaWdodCkgLSAxO1xuICAgICAgICB2YXIgZmlyc3RSb3cgPSBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKCh0aGlzLnNjcm9sbFRvcCAtIG9mZnNldCkgLyB0aGlzLmxpbmVIZWlnaHQpKTtcbiAgICAgICAgdmFyIGxhc3RSb3cgPSBmaXJzdFJvdyArIGxpbmVDb3VudDtcblxuICAgICAgICAvLyBNYXAgbGluZXMgb24gdGhlIHNjcmVlbiB0byBsaW5lcyBpbiB0aGUgZG9jdW1lbnQuXG4gICAgICAgIHZhciBmaXJzdFJvd1NjcmVlbiwgZmlyc3RSb3dIZWlnaHQ7XG4gICAgICAgIHZhciBsaW5lSGVpZ2h0ID0gdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICBmaXJzdFJvdyA9IHNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFJvdyhmaXJzdFJvdywgMCk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgZmlyc3RSb3cgaXMgaW5zaWRlIG9mIGEgZm9sZExpbmUuIElmIHRydWUsIHRoZW4gdXNlIHRoZSBmaXJzdFxuICAgICAgICAvLyByb3cgb2YgdGhlIGZvbGRMaW5lLlxuICAgICAgICB2YXIgZm9sZExpbmUgPSBzZXNzaW9uLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICBmaXJzdFJvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgfVxuXG4gICAgICAgIGZpcnN0Um93U2NyZWVuID0gc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUm93KGZpcnN0Um93LCAwKTtcbiAgICAgICAgZmlyc3RSb3dIZWlnaHQgPSBzZXNzaW9uLmdldFJvd0xlbmd0aChmaXJzdFJvdykgKiBsaW5lSGVpZ2h0O1xuXG4gICAgICAgIGxhc3RSb3cgPSBNYXRoLm1pbihzZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRSb3cobGFzdFJvdywgMCksIHNlc3Npb24uZ2V0TGVuZ3RoKCkgLSAxKTtcbiAgICAgICAgbWluSGVpZ2h0ID0gc2l6ZS5zY3JvbGxlckhlaWdodCArIHNlc3Npb24uZ2V0Um93TGVuZ3RoKGxhc3RSb3cpICogbGluZUhlaWdodCArXG4gICAgICAgICAgICBmaXJzdFJvd0hlaWdodDtcblxuICAgICAgICBvZmZzZXQgPSB0aGlzLnNjcm9sbFRvcCAtIGZpcnN0Um93U2NyZWVuICogbGluZUhlaWdodDtcblxuICAgICAgICB2YXIgY2hhbmdlcyA9IDA7XG4gICAgICAgIGlmICh0aGlzLmxheWVyQ29uZmlnLndpZHRoICE9IGxvbmdlc3RMaW5lKVxuICAgICAgICAgICAgY2hhbmdlcyA9IENIQU5HRV9IX1NDUk9MTDtcbiAgICAgICAgLy8gSG9yaXpvbnRhbCBzY3JvbGxiYXIgdmlzaWJpbGl0eSBtYXkgaGF2ZSBjaGFuZ2VkLCB3aGljaCBjaGFuZ2VzXG4gICAgICAgIC8vIHRoZSBjbGllbnQgaGVpZ2h0IG9mIHRoZSBzY3JvbGxlclxuICAgICAgICBpZiAoaFNjcm9sbENoYW5nZWQgfHwgdlNjcm9sbENoYW5nZWQpIHtcbiAgICAgICAgICAgIGNoYW5nZXMgPSB0aGlzLiR1cGRhdGVDYWNoZWRTaXplKHRydWUsIHRoaXMuZ3V0dGVyV2lkdGgsIHNpemUud2lkdGgsIHNpemUuaGVpZ2h0KTtcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IHNjcm9sbGJhclZpc2liaWxpdHlDaGFuZ2VkXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcInNjcm9sbGJhclZpc2liaWxpdHlDaGFuZ2VkXCIpO1xuICAgICAgICAgICAgaWYgKHZTY3JvbGxDaGFuZ2VkKVxuICAgICAgICAgICAgICAgIGxvbmdlc3RMaW5lID0gdGhpcy4kZ2V0TG9uZ2VzdExpbmUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubGF5ZXJDb25maWcgPSB7XG4gICAgICAgICAgICB3aWR0aDogbG9uZ2VzdExpbmUsXG4gICAgICAgICAgICBwYWRkaW5nOiB0aGlzLiRwYWRkaW5nLFxuICAgICAgICAgICAgZmlyc3RSb3c6IGZpcnN0Um93LFxuICAgICAgICAgICAgZmlyc3RSb3dTY3JlZW46IGZpcnN0Um93U2NyZWVuLFxuICAgICAgICAgICAgbGFzdFJvdzogbGFzdFJvdyxcbiAgICAgICAgICAgIGxpbmVIZWlnaHQ6IGxpbmVIZWlnaHQsXG4gICAgICAgICAgICBjaGFyYWN0ZXJXaWR0aDogdGhpcy5jaGFyYWN0ZXJXaWR0aCxcbiAgICAgICAgICAgIG1pbkhlaWdodDogbWluSGVpZ2h0LFxuICAgICAgICAgICAgbWF4SGVpZ2h0OiBtYXhIZWlnaHQsXG4gICAgICAgICAgICBvZmZzZXQ6IG9mZnNldCxcbiAgICAgICAgICAgIGd1dHRlck9mZnNldDogTWF0aC5tYXgoMCwgTWF0aC5jZWlsKChvZmZzZXQgKyBzaXplLmhlaWdodCAtIHNpemUuc2Nyb2xsZXJIZWlnaHQpIC8gbGluZUhlaWdodCkpLFxuICAgICAgICAgICAgaGVpZ2h0OiB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0XG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIGNoYW5nZXM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdXBkYXRlTGluZXMoKSB7XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IHRoaXMuJGNoYW5nZWRMaW5lcy5maXJzdFJvdztcbiAgICAgICAgdmFyIGxhc3RSb3cgPSB0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdztcbiAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzID0gbnVsbDtcblxuICAgICAgICB2YXIgbGF5ZXJDb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuXG4gICAgICAgIGlmIChmaXJzdFJvdyA+IGxheWVyQ29uZmlnLmxhc3RSb3cgKyAxKSB7IHJldHVybjsgfVxuICAgICAgICBpZiAobGFzdFJvdyA8IGxheWVyQ29uZmlnLmZpcnN0Um93KSB7IHJldHVybjsgfVxuXG4gICAgICAgIC8vIGlmIHRoZSBsYXN0IHJvdyBpcyB1bmtub3duIC0+IHJlZHJhdyBldmVyeXRoaW5nXG4gICAgICAgIGlmIChsYXN0Um93ID09PSBJbmZpbml0eSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGxheWVyQ29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGUobGF5ZXJDb25maWcpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZWxzZSB1cGRhdGUgb25seSB0aGUgY2hhbmdlZCByb3dzXG4gICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGVMaW5lcyhsYXllckNvbmZpZywgZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRnZXRMb25nZXN0TGluZSgpOiBudW1iZXIge1xuICAgICAgICB2YXIgY2hhckNvdW50ID0gdGhpcy5zZXNzaW9uLmdldFNjcmVlbldpZHRoKCk7XG4gICAgICAgIGlmICh0aGlzLnNob3dJbnZpc2libGVzICYmICF0aGlzLnNlc3Npb24uJHVzZVdyYXBNb2RlKVxuICAgICAgICAgICAgY2hhckNvdW50ICs9IDE7XG5cbiAgICAgICAgcmV0dXJuIE1hdGgubWF4KHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCAtIDIgKiB0aGlzLiRwYWRkaW5nLCBNYXRoLnJvdW5kKGNoYXJDb3VudCAqIHRoaXMuY2hhcmFjdGVyV2lkdGgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY2hlZHVsZXMgYW4gdXBkYXRlIHRvIGFsbCB0aGUgZnJvbnQgbWFya2VycyBpbiB0aGUgZG9jdW1lbnQuXG4gICAgICovXG4gICAgdXBkYXRlRnJvbnRNYXJrZXJzKCkge1xuICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC5zZXRNYXJrZXJzKHRoaXMuc2Vzc2lvbi5nZXRNYXJrZXJzKHRydWUpKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfTUFSS0VSX0ZST05UKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY2hlZHVsZXMgYW4gdXBkYXRlIHRvIGFsbCB0aGUgYmFjayBtYXJrZXJzIGluIHRoZSBkb2N1bWVudC5cbiAgICAgKi9cbiAgICB1cGRhdGVCYWNrTWFya2VycygpIHtcbiAgICAgICAgdGhpcy4kbWFya2VyQmFjay5zZXRNYXJrZXJzKHRoaXMuc2Vzc2lvbi5nZXRNYXJrZXJzKGZhbHNlKSk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX01BUktFUl9CQUNLKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZWRyYXcgYnJlYWtwb2ludHMuXG4gICAgICovXG4gICAgdXBkYXRlQnJlYWtwb2ludHMoKSB7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0dVVFRFUik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBhbm5vdGF0aW9ucyBmb3IgdGhlIGd1dHRlci5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0QW5ub3RhdGlvbnNcbiAgICAgKiBAcGFyYW0ge0Fubm90YXRpb25bXX0gYW5ub3RhdGlvbnMgQW4gYXJyYXkgY29udGFpbmluZyBhbm5vdGF0aW9ucy5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldEFubm90YXRpb25zKGFubm90YXRpb25zOiBBbm5vdGF0aW9uW10pOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0QW5ub3RhdGlvbnMoYW5ub3RhdGlvbnMpO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9HVVRURVIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFVwZGF0ZXMgdGhlIGN1cnNvciBpY29uLlxuICAgICAqL1xuICAgIHVwZGF0ZUN1cnNvcigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfQ1VSU09SKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBIaWRlcyB0aGUgY3Vyc29yIGljb24uXG4gICAgICovXG4gICAgaGlkZUN1cnNvcigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuaGlkZUN1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNob3dzIHRoZSBjdXJzb3IgaWNvbi5cbiAgICAgKi9cbiAgICBzaG93Q3Vyc29yKCkge1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5zaG93Q3Vyc29yKCk7XG4gICAgfVxuXG4gICAgc2Nyb2xsU2VsZWN0aW9uSW50b1ZpZXcoYW5jaG9yLCBsZWFkLCBvZmZzZXQ/KSB7XG4gICAgICAgIC8vIGZpcnN0IHNjcm9sbCBhbmNob3IgaW50byB2aWV3IHRoZW4gc2Nyb2xsIGxlYWQgaW50byB2aWV3XG4gICAgICAgIHRoaXMuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcoYW5jaG9yLCBvZmZzZXQpO1xuICAgICAgICB0aGlzLnNjcm9sbEN1cnNvckludG9WaWV3KGxlYWQsIG9mZnNldCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xscyB0aGUgY3Vyc29yIGludG8gdGhlIGZpcnN0IHZpc2liaWxlIGFyZWEgb2YgdGhlIGVkaXRvclxuICAgICAqL1xuICAgIHNjcm9sbEN1cnNvckludG9WaWV3KGN1cnNvcj86IFBvc2l0aW9uLCBvZmZzZXQ/LCAkdmlld01hcmdpbj8pOiB2b2lkIHtcbiAgICAgICAgLy8gdGhlIGVkaXRvciBpcyBub3QgdmlzaWJsZVxuICAgICAgICBpZiAodGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCA9PT0gMClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuZ2V0UGl4ZWxQb3NpdGlvbihjdXJzb3IpO1xuXG4gICAgICAgIHZhciBsZWZ0ID0gcG9zLmxlZnQ7XG4gICAgICAgIHZhciB0b3AgPSBwb3MudG9wO1xuXG4gICAgICAgIHZhciB0b3BNYXJnaW4gPSAkdmlld01hcmdpbiAmJiAkdmlld01hcmdpbi50b3AgfHwgMDtcbiAgICAgICAgdmFyIGJvdHRvbU1hcmdpbiA9ICR2aWV3TWFyZ2luICYmICR2aWV3TWFyZ2luLmJvdHRvbSB8fCAwO1xuXG4gICAgICAgIHZhciBzY3JvbGxUb3AgPSB0aGlzLiRzY3JvbGxBbmltYXRpb24gPyB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgOiB0aGlzLnNjcm9sbFRvcDtcblxuICAgICAgICBpZiAoc2Nyb2xsVG9wICsgdG9wTWFyZ2luID4gdG9wKSB7XG4gICAgICAgICAgICBpZiAob2Zmc2V0KVxuICAgICAgICAgICAgICAgIHRvcCAtPSBvZmZzZXQgKiB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0O1xuICAgICAgICAgICAgaWYgKHRvcCA9PT0gMClcbiAgICAgICAgICAgICAgICB0b3AgPSAtdGhpcy5zY3JvbGxNYXJnaW4udG9wO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcCh0b3ApO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNjcm9sbFRvcCArIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgLSBib3R0b21NYXJnaW4gPCB0b3AgKyB0aGlzLmxpbmVIZWlnaHQpIHtcbiAgICAgICAgICAgIGlmIChvZmZzZXQpXG4gICAgICAgICAgICAgICAgdG9wICs9IG9mZnNldCAqIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHRvcCArIHRoaXMubGluZUhlaWdodCAtIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHNjcm9sbExlZnQgPSB0aGlzLnNjcm9sbExlZnQ7XG5cbiAgICAgICAgaWYgKHNjcm9sbExlZnQgPiBsZWZ0KSB7XG4gICAgICAgICAgICBpZiAobGVmdCA8IHRoaXMuJHBhZGRpbmcgKyAyICogdGhpcy5sYXllckNvbmZpZy5jaGFyYWN0ZXJXaWR0aClcbiAgICAgICAgICAgICAgICBsZWZ0ID0gLXRoaXMuc2Nyb2xsTWFyZ2luLmxlZnQ7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdChsZWZ0KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzY3JvbGxMZWZ0ICsgdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIDwgbGVmdCArIHRoaXMuY2hhcmFjdGVyV2lkdGgpIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KE1hdGgucm91bmQobGVmdCArIHRoaXMuY2hhcmFjdGVyV2lkdGggLSB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGgpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzY3JvbGxMZWZ0IDw9IHRoaXMuJHBhZGRpbmcgJiYgbGVmdCAtIHNjcm9sbExlZnQgPCB0aGlzLmNoYXJhY3RlcldpZHRoKSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdCgwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogezpFZGl0U2Vzc2lvbi5nZXRTY3JvbGxUb3B9XG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRTY3JvbGxUb3BcbiAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxUb3AoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIHs6RWRpdFNlc3Npb24uZ2V0U2Nyb2xsTGVmdH1cbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmdldFNjcm9sbExlZnRcbiAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxMZWZ0KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGZpcnN0IHZpc2libGUgcm93LCByZWdhcmRsZXNzIG9mIHdoZXRoZXIgaXQncyBmdWxseSB2aXNpYmxlIG9yIG5vdC5cbiAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxUb3BSb3coKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Nyb2xsVG9wIC8gdGhpcy5saW5lSGVpZ2h0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGxhc3QgdmlzaWJsZSByb3csIHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciBpdCdzIGZ1bGx5IHZpc2libGUgb3Igbm90LlxuICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldFNjcm9sbEJvdHRvbVJvdygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gTWF0aC5tYXgoMCwgTWF0aC5mbG9vcigodGhpcy5zY3JvbGxUb3AgKyB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0KSAvIHRoaXMubGluZUhlaWdodCkgLSAxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEdyYWNlZnVsbHkgc2Nyb2xscyBmcm9tIHRoZSB0b3Agb2YgdGhlIGVkaXRvciB0byB0aGUgcm93IGluZGljYXRlZC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgQSByb3cgaWRcbiAgICAqXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uc2V0U2Nyb2xsVG9wXG4gICAgKiovXG4gICAgc2Nyb2xsVG9Sb3cocm93OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChyb3cgKiB0aGlzLmxpbmVIZWlnaHQpO1xuICAgIH1cblxuICAgIGFsaWduQ3Vyc29yKGN1cnNvci8qOiBQb3NpdGlvbiovLCBhbGlnbm1lbnQ6IG51bWJlcikge1xuICAgICAgICAvLyBGSVhNRTogRG9uJ3QgaGF2ZSBwb2x5bW9ycGhpYyBjdXJzb3IgcGFyYW1ldGVyLlxuICAgICAgICBpZiAodHlwZW9mIGN1cnNvciA9PSBcIm51bWJlclwiKVxuICAgICAgICAgICAgY3Vyc29yID0geyByb3c6IGN1cnNvciwgY29sdW1uOiAwIH07XG5cbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuJGN1cnNvckxheWVyLmdldFBpeGVsUG9zaXRpb24oY3Vyc29yKTtcbiAgICAgICAgdmFyIGggPSB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0IC0gdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgb2Zmc2V0ID0gcG9zLnRvcCAtIGggKiAoYWxpZ25tZW50IHx8IDApO1xuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3Aob2Zmc2V0KTtcbiAgICAgICAgcmV0dXJuIG9mZnNldDtcbiAgICB9XG5cbiAgICAkY2FsY1N0ZXBzKGZyb21WYWx1ZTogbnVtYmVyLCB0b1ZhbHVlOiBudW1iZXIpOiBudW1iZXJbXSB7XG4gICAgICAgIHZhciBpOiBudW1iZXIgPSAwO1xuICAgICAgICB2YXIgbDogbnVtYmVyID0gdGhpcy5TVEVQUztcbiAgICAgICAgdmFyIHN0ZXBzOiBudW1iZXJbXSA9IFtdO1xuXG4gICAgICAgIHZhciBmdW5jID0gZnVuY3Rpb24odDogbnVtYmVyLCB4X21pbjogbnVtYmVyLCBkeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgICAgIHJldHVybiBkeCAqIChNYXRoLnBvdyh0IC0gMSwgMykgKyAxKSArIHhfbWluO1xuICAgICAgICB9O1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBsOyArK2kpIHtcbiAgICAgICAgICAgIHN0ZXBzLnB1c2goZnVuYyhpIC8gdGhpcy5TVEVQUywgZnJvbVZhbHVlLCB0b1ZhbHVlIC0gZnJvbVZhbHVlKSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc3RlcHM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR3JhY2VmdWxseSBzY3JvbGxzIHRoZSBlZGl0b3IgdG8gdGhlIHJvdyBpbmRpY2F0ZWQuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGxpbmUgQSBsaW5lIG51bWJlclxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gY2VudGVyIElmIGB0cnVlYCwgY2VudGVycyB0aGUgZWRpdG9yIHRoZSB0byBpbmRpY2F0ZWQgbGluZVxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYW5pbWF0ZSBJZiBgdHJ1ZWAgYW5pbWF0ZXMgc2Nyb2xsaW5nXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgRnVuY3Rpb24gdG8gYmUgY2FsbGVkIGFmdGVyIHRoZSBhbmltYXRpb24gaGFzIGZpbmlzaGVkXG4gICAgICovXG4gICAgc2Nyb2xsVG9MaW5lKGxpbmU6IG51bWJlciwgY2VudGVyOiBib29sZWFuLCBhbmltYXRlOiBib29sZWFuLCBjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuZ2V0UGl4ZWxQb3NpdGlvbih7IHJvdzogbGluZSwgY29sdW1uOiAwIH0pO1xuICAgICAgICB2YXIgb2Zmc2V0ID0gcG9zLnRvcDtcbiAgICAgICAgaWYgKGNlbnRlcikge1xuICAgICAgICAgICAgb2Zmc2V0IC09IHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgLyAyO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGluaXRpYWxTY3JvbGwgPSB0aGlzLnNjcm9sbFRvcDtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChvZmZzZXQpO1xuICAgICAgICBpZiAoYW5pbWF0ZSAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHRoaXMuYW5pbWF0ZVNjcm9sbGluZyhpbml0aWFsU2Nyb2xsLCBjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhbmltYXRlU2Nyb2xsaW5nKGZyb21WYWx1ZTogbnVtYmVyLCBjYWxsYmFjaz8pIHtcbiAgICAgICAgdmFyIHRvVmFsdWUgPSB0aGlzLnNjcm9sbFRvcDtcbiAgICAgICAgaWYgKCF0aGlzLiRhbmltYXRlZFNjcm9sbCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgaWYgKGZyb21WYWx1ZSA9PSB0b1ZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmICh0aGlzLiRzY3JvbGxBbmltYXRpb24pIHtcbiAgICAgICAgICAgIHZhciBvbGRTdGVwcyA9IHRoaXMuJHNjcm9sbEFuaW1hdGlvbi5zdGVwcztcbiAgICAgICAgICAgIGlmIChvbGRTdGVwcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBmcm9tVmFsdWUgPSBvbGRTdGVwc1swXTtcbiAgICAgICAgICAgICAgICBpZiAoZnJvbVZhbHVlID09IHRvVmFsdWUpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzdGVwcyA9IF9zZWxmLiRjYWxjU3RlcHMoZnJvbVZhbHVlLCB0b1ZhbHVlKTtcbiAgICAgICAgdGhpcy4kc2Nyb2xsQW5pbWF0aW9uID0geyBmcm9tOiBmcm9tVmFsdWUsIHRvOiB0b1ZhbHVlLCBzdGVwczogc3RlcHMgfTtcblxuICAgICAgICBjbGVhckludGVydmFsKHRoaXMuJHRpbWVyKTtcblxuICAgICAgICBfc2VsZi5zZXNzaW9uLnNldFNjcm9sbFRvcChzdGVwcy5zaGlmdCgpKTtcbiAgICAgICAgLy8gdHJpY2sgc2Vzc2lvbiB0byB0aGluayBpdCdzIGFscmVhZHkgc2Nyb2xsZWQgdG8gbm90IGxvb3NlIHRvVmFsdWVcbiAgICAgICAgX3NlbGYuc2Vzc2lvbi4kc2Nyb2xsVG9wID0gdG9WYWx1ZTtcbiAgICAgICAgdGhpcy4kdGltZXIgPSBzZXRJbnRlcnZhbChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmIChzdGVwcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXNzaW9uLnNldFNjcm9sbFRvcChzdGVwcy5zaGlmdCgpKTtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXNzaW9uLiRzY3JvbGxUb3AgPSB0b1ZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0b1ZhbHVlICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXNzaW9uLiRzY3JvbGxUb3AgPSAtMTtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXNzaW9uLnNldFNjcm9sbFRvcCh0b1ZhbHVlKTtcbiAgICAgICAgICAgICAgICB0b1ZhbHVlID0gbnVsbDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gZG8gdGhpcyBvbiBzZXBhcmF0ZSBzdGVwIHRvIG5vdCBnZXQgc3B1cmlvdXMgc2Nyb2xsIGV2ZW50IGZyb20gc2Nyb2xsYmFyXG4gICAgICAgICAgICAgICAgX3NlbGYuJHRpbWVyID0gY2xlYXJJbnRlcnZhbChfc2VsZi4kdGltZXIpO1xuICAgICAgICAgICAgICAgIF9zZWxmLiRzY3JvbGxBbmltYXRpb24gPSBudWxsO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIDEwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRoZSBlZGl0b3IgdG8gdGhlIHkgcGl4ZWwgaW5kaWNhdGVkLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JvbGxUb3AgVGhlIHBvc2l0aW9uIHRvIHNjcm9sbCB0b1xuICAgICAqL1xuICAgIHNjcm9sbFRvWShzY3JvbGxUb3A6IG51bWJlcik6IHZvaWQge1xuICAgICAgICAvLyBhZnRlciBjYWxsaW5nIHNjcm9sbEJhci5zZXRTY3JvbGxUb3BcbiAgICAgICAgLy8gc2Nyb2xsYmFyIHNlbmRzIHVzIGV2ZW50IHdpdGggc2FtZSBzY3JvbGxUb3AuIGlnbm9yZSBpdFxuICAgICAgICBpZiAodGhpcy5zY3JvbGxUb3AgIT09IHNjcm9sbFRvcCkge1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxUb3AgPSBzY3JvbGxUb3A7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9TQ1JPTEwpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xscyB0aGUgZWRpdG9yIGFjcm9zcyB0aGUgeC1heGlzIHRvIHRoZSBwaXhlbCBpbmRpY2F0ZWQuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHNjcm9sbExlZnQgVGhlIHBvc2l0aW9uIHRvIHNjcm9sbCB0b1xuICAgICAqKi9cbiAgICBzY3JvbGxUb1goc2Nyb2xsTGVmdDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLnNjcm9sbExlZnQgIT09IHNjcm9sbExlZnQpIHtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsTGVmdCA9IHNjcm9sbExlZnQ7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9IX1NDUk9MTCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNjcm9sbHMgdGhlIGVkaXRvciBhY3Jvc3MgYm90aCB4LSBhbmQgeS1heGVzLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHggVGhlIHggdmFsdWUgdG8gc2Nyb2xsIHRvXG4gICAgKiBAcGFyYW0ge051bWJlcn0geSBUaGUgeSB2YWx1ZSB0byBzY3JvbGwgdG9cbiAgICAqKi9cbiAgICBzY3JvbGxUbyh4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHkpO1xuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdCh5KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRoZSBlZGl0b3IgYWNyb3NzIGJvdGggeC0gYW5kIHktYXhlcy5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2Nyb2xsQnlcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZGVsdGFYIFRoZSB4IHZhbHVlIHRvIHNjcm9sbCBieVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBkZWx0YVkgVGhlIHkgdmFsdWUgdG8gc2Nyb2xsIGJ5XG4gICAgICovXG4gICAgc2Nyb2xsQnkoZGVsdGFYOiBudW1iZXIsIGRlbHRhWTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGRlbHRhWSAmJiB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSArIGRlbHRhWSk7XG4gICAgICAgIGRlbHRhWCAmJiB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdCh0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpICsgZGVsdGFYKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYHRydWVgIGlmIHlvdSBjYW4gc3RpbGwgc2Nyb2xsIGJ5IGVpdGhlciBwYXJhbWV0ZXI7IGluIG90aGVyIHdvcmRzLCB5b3UgaGF2ZW4ndCByZWFjaGVkIHRoZSBlbmQgb2YgdGhlIGZpbGUgb3IgbGluZS5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkZWx0YVggVGhlIHggdmFsdWUgdG8gc2Nyb2xsIGJ5XG4gICAgKiBAcGFyYW0ge051bWJlcn0gZGVsdGFZIFRoZSB5IHZhbHVlIHRvIHNjcm9sbCBieVxuICAgICpcbiAgICAqXG4gICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICoqL1xuICAgIGlzU2Nyb2xsYWJsZUJ5KGRlbHRhWDogbnVtYmVyLCBkZWx0YVk6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgICAgICBpZiAoZGVsdGFZIDwgMCAmJiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgPj0gMSAtIHRoaXMuc2Nyb2xsTWFyZ2luLnRvcClcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBpZiAoZGVsdGFZID4gMCAmJiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgKyB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0XG4gICAgICAgICAgICAtIHRoaXMubGF5ZXJDb25maWcubWF4SGVpZ2h0IDwgLTEgKyB0aGlzLnNjcm9sbE1hcmdpbi5ib3R0b20pXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgaWYgKGRlbHRhWCA8IDAgJiYgdGhpcy5zZXNzaW9uLmdldFNjcm9sbExlZnQoKSA+PSAxIC0gdGhpcy5zY3JvbGxNYXJnaW4ubGVmdClcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBpZiAoZGVsdGFYID4gMCAmJiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpICsgdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoXG4gICAgICAgICAgICAtIHRoaXMubGF5ZXJDb25maWcud2lkdGggPCAtMSArIHRoaXMuc2Nyb2xsTWFyZ2luLnJpZ2h0KVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcGl4ZWxUb1NjcmVlbkNvb3JkaW5hdGVzKHg6IG51bWJlciwgeTogbnVtYmVyKSB7XG4gICAgICAgIHZhciBjYW52YXNQb3MgPSB0aGlzLnNjcm9sbGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG4gICAgICAgIHZhciBvZmZzZXQgPSAoeCArIHRoaXMuc2Nyb2xsTGVmdCAtIGNhbnZhc1Bvcy5sZWZ0IC0gdGhpcy4kcGFkZGluZykgLyB0aGlzLmNoYXJhY3RlcldpZHRoO1xuICAgICAgICB2YXIgcm93ID0gTWF0aC5mbG9vcigoeSArIHRoaXMuc2Nyb2xsVG9wIC0gY2FudmFzUG9zLnRvcCkgLyB0aGlzLmxpbmVIZWlnaHQpO1xuICAgICAgICB2YXIgY29sID0gTWF0aC5yb3VuZChvZmZzZXQpO1xuXG4gICAgICAgIHJldHVybiB7IHJvdzogcm93LCBjb2x1bW46IGNvbCwgc2lkZTogb2Zmc2V0IC0gY29sID4gMCA/IDEgOiAtMSB9O1xuICAgIH1cblxuICAgIHNjcmVlblRvVGV4dENvb3JkaW5hdGVzKGNsaWVudFg6IG51bWJlciwgY2xpZW50WTogbnVtYmVyKTogUG9zaXRpb24ge1xuICAgICAgICB2YXIgY2FudmFzUG9zID0gdGhpcy5zY3JvbGxlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblxuICAgICAgICB2YXIgY29sdW1uID0gTWF0aC5yb3VuZCgoY2xpZW50WCArIHRoaXMuc2Nyb2xsTGVmdCAtIGNhbnZhc1Bvcy5sZWZ0IC0gdGhpcy4kcGFkZGluZykgLyB0aGlzLmNoYXJhY3RlcldpZHRoKTtcblxuICAgICAgICB2YXIgcm93ID0gKGNsaWVudFkgKyB0aGlzLnNjcm9sbFRvcCAtIGNhbnZhc1Bvcy50b3ApIC8gdGhpcy5saW5lSGVpZ2h0O1xuXG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHJvdywgTWF0aC5tYXgoY29sdW1uLCAwKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBgcGFnZVhgIGFuZCBgcGFnZVlgIGNvb3JkaW5hdGVzIG9mIHRoZSBkb2N1bWVudCBwb3NpdGlvbi5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIGRvY3VtZW50IHJvdyBwb3NpdGlvblxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgZG9jdW1lbnQgY29sdW1uIHBvc2l0aW9uXG4gICAgKiBAcmV0dXJuIHtPYmplY3R9XG4gICAgKiovXG4gICAgdGV4dFRvU2NyZWVuQ29vcmRpbmF0ZXMocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogeyBwYWdlWDogbnVtYmVyOyBwYWdlWTogbnVtYmVyIH0ge1xuICAgICAgICB2YXIgY2FudmFzUG9zID0gdGhpcy5zY3JvbGxlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24ocm93LCBjb2x1bW4pO1xuXG4gICAgICAgIHZhciB4ID0gdGhpcy4kcGFkZGluZyArIE1hdGgucm91bmQocG9zLmNvbHVtbiAqIHRoaXMuY2hhcmFjdGVyV2lkdGgpO1xuICAgICAgICB2YXIgeSA9IHBvcy5yb3cgKiB0aGlzLmxpbmVIZWlnaHQ7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHBhZ2VYOiBjYW52YXNQb3MubGVmdCArIHggLSB0aGlzLnNjcm9sbExlZnQsXG4gICAgICAgICAgICBwYWdlWTogY2FudmFzUG9zLnRvcCArIHkgLSB0aGlzLnNjcm9sbFRvcFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIEZvY3VzZXMgdGhlIGN1cnJlbnQgY29udGFpbmVyLlxuICAgICoqL1xuICAgIHZpc3VhbGl6ZUZvY3VzKCkge1xuICAgICAgICBhZGRDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgXCJhY2VfZm9jdXNcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogQmx1cnMgdGhlIGN1cnJlbnQgY29udGFpbmVyLlxuICAgICoqL1xuICAgIHZpc3VhbGl6ZUJsdXIoKSB7XG4gICAgICAgIHJlbW92ZUNzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBcImFjZV9mb2N1c1wiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHNob3dDb21wb3NpdGlvblxuICAgICAqIEBwYXJhbSBwb3NpdGlvblxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgc2hvd0NvbXBvc2l0aW9uKHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9KSB7XG4gICAgICAgIGlmICghdGhpcy4kY29tcG9zaXRpb24pXG4gICAgICAgICAgICB0aGlzLiRjb21wb3NpdGlvbiA9IHtcbiAgICAgICAgICAgICAgICBrZWVwVGV4dEFyZWFBdEN1cnNvcjogdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IsXG4gICAgICAgICAgICAgICAgY3NzVGV4dDogdGhpcy50ZXh0YXJlYS5zdHlsZS5jc3NUZXh0XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0gdHJ1ZTtcbiAgICAgICAgYWRkQ3NzQ2xhc3ModGhpcy50ZXh0YXJlYSwgXCJhY2VfY29tcG9zaXRpb25cIik7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuY3NzVGV4dCA9IFwiXCI7XG4gICAgICAgIHRoaXMuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgQSBzdHJpbmcgb2YgdGV4dCB0byB1c2VcbiAgICAgKlxuICAgICAqIFNldHMgdGhlIGlubmVyIHRleHQgb2YgdGhlIGN1cnJlbnQgY29tcG9zaXRpb24gdG8gYHRleHRgLlxuICAgICAqL1xuICAgIHNldENvbXBvc2l0aW9uVGV4dCh0ZXh0Pzogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIC8vIFRPRE86IFdoeSBpcyB0aGUgcGFyYW1ldGVyIG5vdCB1c2VkP1xuICAgICAgICB0aGlzLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEhpZGVzIHRoZSBjdXJyZW50IGNvbXBvc2l0aW9uLlxuICAgICAqL1xuICAgIGhpZGVDb21wb3NpdGlvbigpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRjb21wb3NpdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVtb3ZlQ3NzQ2xhc3ModGhpcy50ZXh0YXJlYSwgXCJhY2VfY29tcG9zaXRpb25cIik7XG4gICAgICAgIHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0gdGhpcy4kY29tcG9zaXRpb24ua2VlcFRleHRBcmVhQXRDdXJzb3I7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuY3NzVGV4dCA9IHRoaXMuJGNvbXBvc2l0aW9uLmNzc1RleHQ7XG4gICAgICAgIHRoaXMuJGNvbXBvc2l0aW9uID0gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGEgbmV3IHRoZW1lIGZvciB0aGUgZWRpdG9yLlxuICAgICAqIFRoaXMgaXMgYSBzeW5jaHJvbm91cyBtZXRob2QuXG4gICAgICovXG4gICAgc2V0VGhlbWUobW9kSnM6IHsgY3NzVGV4dDogc3RyaW5nOyBjc3NDbGFzczogc3RyaW5nOyBpc0Rhcms6IGJvb2xlYW47IHBhZGRpbmc6IG51bWJlciB9KTogdm9pZCB7XG5cbiAgICAgICAgaWYgKCFtb2RKcy5jc3NDbGFzcykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgZW5zdXJlSFRNTFN0eWxlRWxlbWVudChtb2RKcy5jc3NUZXh0LCBtb2RKcy5jc3NDbGFzcywgdGhpcy5jb250YWluZXIub3duZXJEb2N1bWVudCk7XG5cbiAgICAgICAgaWYgKHRoaXMudGhlbWUpIHtcbiAgICAgICAgICAgIHJlbW92ZUNzc0NsYXNzKHRoaXMuY29udGFpbmVyLCB0aGlzLnRoZW1lLmNzc0NsYXNzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBwYWRkaW5nID0gXCJwYWRkaW5nXCIgaW4gbW9kSnMgPyBtb2RKcy5wYWRkaW5nIDogXCJwYWRkaW5nXCIgaW4gKHRoaXMudGhlbWUgfHwge30pID8gNCA6IHRoaXMuJHBhZGRpbmc7XG5cbiAgICAgICAgaWYgKHRoaXMuJHBhZGRpbmcgJiYgcGFkZGluZyAhPSB0aGlzLiRwYWRkaW5nKSB7XG4gICAgICAgICAgICB0aGlzLnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnRoZW1lID0gbW9kSnM7XG4gICAgICAgIHRoaXMuYWRkQ3NzQ2xhc3MobW9kSnMuY3NzQ2xhc3MpO1xuICAgICAgICB0aGlzLnNldENzc0NsYXNzKFwiYWNlX2RhcmtcIiwgbW9kSnMuaXNEYXJrKTtcblxuICAgICAgICAvLyBmb3JjZSByZS1tZWFzdXJlIG9mIHRoZSBndXR0ZXIgd2lkdGhcbiAgICAgICAgaWYgKHRoaXMuJHNpemUpIHtcbiAgICAgICAgICAgIHRoaXMuJHNpemUud2lkdGggPSAwO1xuICAgICAgICAgICAgdGhpcy4kdXBkYXRlU2l6ZUFzeW5jKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IHRoZW1lTG9hZGVkXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9lbWl0KCd0aGVtZUxvYWRlZCcsIHsgdGhlbWU6IG1vZEpzIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgYWRkQ3NzQ2xhc3NcbiAgICAgKiBAcGFyYW0gY3NzQ2xhc3Mge3N0cmluZ31cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGFkZENzc0NsYXNzKGNzc0NsYXNzOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgYWRkQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIGNzc0NsYXNzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHNldENzc0NsYXNzXG4gICAgICogQHBhcmFtIGNsYXNzTmFtZToge3N0cmluZ31cbiAgICAgKiBAcGFyYW0gaW5jbHVkZSB7Ym9vbGVhbn1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldENzc0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmNsdWRlOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHNldENzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBjbGFzc05hbWUsIGluY2x1ZGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEltcG9ydHMgYSBuZXcgdGhlbWUgZm9yIHRoZSBlZGl0b3IgdXNpbmcgdGhlIFN5c3RlbSBMb2FkZXIuXG4gICAgICogYHRoZW1lYCBzaG91bGQgZXhpc3QsIGFuZCBiZSBhIGRpcmVjdG9yeSBwYXRoLCBsaWtlIGBhY2UvdGhlbWUvdGV4dG1hdGVgLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBpbXBvcnRUaGVtZUxpbmtcbiAgICAgKiBAcGFyYW0gdGhlbWVOYW1lIHtzdHJpbmd9IFRoZSBuYW1lIG9mIGEgdGhlbWUgbW9kdWxlLlxuICAgICAqIEByZXR1cm4ge1Byb21pc2U8VGhlbWU+fVxuICAgICAqL1xuICAgIGltcG9ydFRoZW1lTGluayh0aGVtZU5hbWU6IHN0cmluZyk6IFByb21pc2U8VGhlbWVMaW5rPiB7XG5cbiAgICAgICAgaWYgKCF0aGVtZU5hbWUgfHwgdHlwZW9mIHRoZW1lTmFtZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgdGhlbWVOYW1lID0gdGhlbWVOYW1lIHx8IHRoaXMuZ2V0T3B0aW9uKFwidGhlbWVcIikuaW5pdGlhbFZhbHVlO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcblxuICAgICAgICB0aGlzLiR0aGVtZUlkID0gdGhlbWVOYW1lO1xuXG4gICAgICAgIC8vIFRPRE86IElzIHRoaXMgdGhlIHJpZ2h0IHBsYWNlIHRvIGVtaXQgdGhlIGV2ZW50P1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IHRoZW1lQ2hhbmdlXG4gICAgICAgICAqL1xuICAgICAgICBfc2VsZi5ldmVudEJ1cy5fZW1pdCgndGhlbWVDaGFuZ2UnLCB7IHRoZW1lOiB0aGVtZU5hbWUgfSk7XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPFRoZW1lTGluaz4oZnVuY3Rpb24oc3VjY2VzcywgZmFpbCkge1xuICAgICAgICAgICAgLy8gV2UgdGFrZSBhZHZhbnRhZ2Ugb2YgdGhlIGNvbmZpZ3VyYWJpbGl0eSBvZiB0aGUgU3lzdGVtIExvYWRlci5cbiAgICAgICAgICAgIC8vIEJlY2F1c2Ugd2UgYXJlIGxvYWRpbmcgQ1NTLCB3ZSByZXBsYWNlIHRoZSBpbnN0YW50aWF0aW9uLlxuICAgICAgICAgICAgU3lzdGVtLmltcG9ydCh0aGVtZU5hbWUpXG4gICAgICAgICAgICAgICAgLnRoZW4oZnVuY3Rpb24obTogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBpc0Rhcms6IGJvb2xlYW4gPSBtLmlzRGFyaztcbiAgICAgICAgICAgICAgICAgICAgdmFyIGlkOiBzdHJpbmcgPSBtLmNzc0NsYXNzO1xuICAgICAgICAgICAgICAgICAgICB2YXIgaHJlZjogc3RyaW5nID0gbS5jc3NOYW1lO1xuICAgICAgICAgICAgICAgICAgICB2YXIgcGFkZGluZzogbnVtYmVyID0gKHR5cGVvZiBtLnBhZGRpbmcgPT09ICdudW1iZXInKSA/IG0ucGFkZGluZyA6IDA7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0aGVtZSA9IG5ldyBUaGVtZUxpbmsoaXNEYXJrLCBpZCwgJ3N0eWxlc2hlZXQnLCAndGV4dC9jc3MnLCBocmVmLCBwYWRkaW5nKTtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2Vzcyh0aGVtZSk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuY2F0Y2goZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgJHtyZWFzb259YCk7XG4gICAgICAgICAgICAgICAgICAgIGZhaWwocmVhc29uKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBzZXRUaGVtZUNzc1xuICAgICAqIEBwYXJhbSBjc3NDbGFzcyB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSBocmVmIHtzdHJpbmd9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRUaGVtZUNzcyhjc3NDbGFzczogc3RyaW5nLCBocmVmOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgYXBwZW5kSFRNTExpbmtFbGVtZW50KGNzc0NsYXNzLCAnc3R5bGVzaGVldCcsICd0ZXh0L2NzcycsIGhyZWYsIGRvY3VtZW50KTtcbiAgICAgICAgdGhpcy5hZGRDc3NDbGFzcyhjc3NDbGFzcyk7XG4gICAgICAgIC8vICAgICAgdGhpcy5zZXRDc3NDbGFzcyhcImFjZV9kYXJrXCIsIHRoZW1lTGluay5pc0RhcmspO1xuICAgICAgICAvLyAgICAgIHRoaXMuc2V0UGFkZGluZyh0aGVtZUxpbmsucGFkZGluZyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgcGF0aCBvZiB0aGUgY3VycmVudCB0aGVtZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0VGhlbWVcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgZ2V0VGhlbWUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHRoZW1lSWQ7XG4gICAgfVxuXG4gICAgLy8gTWV0aG9kcyBhbGxvd3MgdG8gYWRkIC8gcmVtb3ZlIENTUyBjbGFzc25hbWVzIHRvIHRoZSBlZGl0b3IgZWxlbWVudC5cbiAgICAvLyBUaGlzIGZlYXR1cmUgY2FuIGJlIHVzZWQgYnkgcGx1Zy1pbnMgdG8gcHJvdmlkZSBhIHZpc3VhbCBpbmRpY2F0aW9uIG9mXG4gICAgLy8gYSBjZXJ0YWluIG1vZGUgdGhhdCBlZGl0b3IgaXMgaW4uXG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgbmV3IGNsYXNzLCBgc3R5bGVgLCB0byB0aGUgZWRpdG9yLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHlsZSBBIGNsYXNzIG5hbWVcbiAgICAgKlxuICAgICAqL1xuICAgIHNldFN0eWxlKHN0eWxlOiBzdHJpbmcsIGluY2x1ZGU/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHNldENzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBzdHlsZSwgaW5jbHVkZSAhPT0gZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgdGhlIGNsYXNzIGBzdHlsZWAgZnJvbSB0aGUgZWRpdG9yLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHlsZSBBIGNsYXNzIG5hbWVcbiAgICAgKi9cbiAgICB1bnNldFN0eWxlKHN0eWxlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgcmVtb3ZlQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIHN0eWxlKTtcbiAgICB9XG5cbiAgICBzZXRDdXJzb3JTdHlsZShzdHlsZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLmNvbnRlbnQuc3R5bGUuY3Vyc29yICE9IHN0eWxlKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUuY3Vyc29yID0gc3R5bGU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gY3Vyc29yU3R5bGUgQSBjc3MgY3Vyc29yIHN0eWxlXG4gICAgICovXG4gICAgc2V0TW91c2VDdXJzb3IoY3Vyc29yU3R5bGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUuY3Vyc29yID0gY3Vyc29yU3R5bGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGVzdHJveXMgdGhlIHRleHQgYW5kIGN1cnNvciBsYXllcnMgZm9yIHRoaXMgcmVuZGVyZXIuXG4gICAgICovXG4gICAgZGVzdHJveSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuZGVzdHJveSgpO1xuICAgIH1cbn1cblxuZGVmaW5lT3B0aW9ucyhWaXJ0dWFsUmVuZGVyZXIucHJvdG90eXBlLCBcInJlbmRlcmVyXCIsIHtcbiAgICBhbmltYXRlZFNjcm9sbDogeyBpbml0aWFsVmFsdWU6IGZhbHNlIH0sXG4gICAgc2hvd0ludmlzaWJsZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllci5zZXRTaG93SW52aXNpYmxlcyh2YWx1ZSkpXG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9URVhUKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgc2hvd1ByaW50TWFyZ2luOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oKSB7IHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7IH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgcHJpbnRNYXJnaW5Db2x1bW46IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbigpIHsgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiA4MFxuICAgIH0sXG4gICAgcHJpbnRNYXJnaW46IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsID09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICAgICAgdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW4gPSB2YWw7XG4gICAgICAgICAgICB0aGlzLiRzaG93UHJpbnRNYXJnaW4gPSAhIXZhbDtcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kc2hvd1ByaW50TWFyZ2luICYmIHRoaXMuJHByaW50TWFyZ2luQ29sdW1uO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBzaG93R3V0dGVyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykge1xuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyLnN0eWxlLmRpc3BsYXkgPSBzaG93ID8gXCJibG9ja1wiIDogXCJub25lXCI7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX0ZVTEwpO1xuICAgICAgICAgICAgdGhpcy5vbkd1dHRlclJlc2l6ZSgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGZhZGVGb2xkV2lkZ2V0czoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3cpIHtcbiAgICAgICAgICAgIHNldENzc0NsYXNzKHRoaXMuJGd1dHRlciwgXCJhY2VfZmFkZS1mb2xkLXdpZGdldHNcIiwgc2hvdyk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIHNob3dGb2xkV2lkZ2V0czoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3cpIHsgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0U2hvd0ZvbGRXaWRnZXRzKHNob3cpIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgc2hvd0xpbmVOdW1iZXJzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykge1xuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0U2hvd0xpbmVOdW1iZXJzKHNob3cpO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9HVVRURVIpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGRpc3BsYXlJbmRlbnRHdWlkZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG93KSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyLnNldERpc3BsYXlJbmRlbnRHdWlkZXMoc2hvdykpXG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9URVhUKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBoaWdobGlnaHRHdXR0ZXJMaW5lOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdWxkSGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0ID0gY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0LmNsYXNzTmFtZSA9IFwiYWNlX2d1dHRlci1hY3RpdmUtbGluZVwiO1xuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlci5hcHBlbmRDaGlsZCh0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0KTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuc3R5bGUuZGlzcGxheSA9IHNob3VsZEhpZ2hsaWdodCA/IFwiXCIgOiBcIm5vbmVcIjtcbiAgICAgICAgICAgIC8vIGlmIGN1cnNvcmxheWVyIGhhdmUgbmV2ZXIgYmVlbiB1cGRhdGVkIHRoZXJlJ3Mgbm90aGluZyBvbiBzY3JlZW4gdG8gdXBkYXRlXG4gICAgICAgICAgICBpZiAodGhpcy4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zKVxuICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQoKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZSxcbiAgICAgICAgdmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuJGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIHx8ICF0aGlzLiRob3JpelNjcm9sbClcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX1NDUk9MTCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuJHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIHx8ICF0aGlzLiR2U2Nyb2xsKVxuICAgICAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgZm9udFNpemU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihmb250U2l6ZTogc3RyaW5nKSB7XG4gICAgICAgICAgICB2YXIgdGhhdDogVmlydHVhbFJlbmRlcmVyID0gdGhpcztcbiAgICAgICAgICAgIHRoYXQuY29udGFpbmVyLnN0eWxlLmZvbnRTaXplID0gZm9udFNpemU7XG4gICAgICAgICAgICB0aGF0LnVwZGF0ZUZvbnRTaXplKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogXCIxMnB4XCJcbiAgICB9LFxuICAgIGZvbnRGYW1pbHk6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihmb250RmFtaWx5OiBzdHJpbmcpIHtcbiAgICAgICAgICAgIHZhciB0aGF0OiBWaXJ0dWFsUmVuZGVyZXIgPSB0aGlzO1xuICAgICAgICAgICAgdGhhdC5jb250YWluZXIuc3R5bGUuZm9udEZhbWlseSA9IGZvbnRGYW1pbHk7XG4gICAgICAgICAgICB0aGF0LnVwZGF0ZUZvbnRTaXplKCk7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIG1heExpbmVzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUZ1bGwoKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgbWluTGluZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlRnVsbCgpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBzY3JvbGxQYXN0RW5kOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB2YWwgPSArdmFsIHx8IDA7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2Nyb2xsUGFzdEVuZCA9PSB2YWwpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdGhpcy4kc2Nyb2xsUGFzdEVuZCA9IHZhbDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiAwLFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICBmaXhlZFdpZHRoR3V0dGVyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci4kZml4ZWRXaWR0aCA9ICEhdmFsO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9HVVRURVIpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICB0aGVtZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLnNldFRoZW1lKHZhbCkgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuJHRoZW1lSWQgfHwgdGhpcy50aGVtZTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcIi4vdGhlbWUvdGV4dG1hdGVcIixcbiAgICAgICAgaGFuZGxlc1NldDogdHJ1ZVxuICAgIH1cbn0pO1xuIl19