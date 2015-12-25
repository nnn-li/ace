"use strict";
import { addCssClass, appendHTMLLinkElement, createElement, ensureHTMLStyleElement, removeCssClass, setCssClass } from "./lib/dom";
import { defineOptions, resetOptions } from "./config";
import { isOldIE } from "./lib/useragent";
import Cursor from "./layer/Cursor";
import FontMetrics from "./layer/FontMetrics";
import Gutter from "./layer/Gutter";
import Marker from "./layer/Marker";
import Text from "./layer/Text";
import VScrollBar from "./VScrollBar";
import HScrollBar from "./HScrollBar";
import RenderLoop from "./RenderLoop";
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
        this.scrollBarV.on("scroll", (event, scrollBar) => {
            if (!this.$scrollAnimation) {
                this.session.setScrollTop(event.data - this.scrollMargin.top);
            }
        });
        this.scrollBarH.on("scroll", function (event, scrollBar) {
            if (!this.$scrollAnimation) {
                this.session.setScrollLeft(event.data - this.scrollMargin.left);
            }
        });
        this.cursorPos = {
            row: 0,
            column: 0
        };
        this.$fontMetrics = new FontMetrics(this.container, 500);
        this.$textLayer.$setFontMetrics(this.$fontMetrics);
        this.$textLayer.on("changeCharacterSize", (event, text) => {
            this.updateCharacterSize();
            this.onResize(true, this.gutterWidth, this.$size.width, this.$size.height);
            this.eventBus._signal("changeCharacterSize", event);
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
    getPadding() {
        return this.$padding;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlydHVhbFJlbmRlcmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiVmlydHVhbFJlbmRlcmVyLnRzIl0sIm5hbWVzIjpbImNoYW5nZXNUb1N0cmluZyIsIlZpcnR1YWxSZW5kZXJlciIsIlZpcnR1YWxSZW5kZXJlci5jb25zdHJ1Y3RvciIsIlZpcnR1YWxSZW5kZXJlci5vbiIsIlZpcnR1YWxSZW5kZXJlci5vZmYiLCJWaXJ0dWFsUmVuZGVyZXIubWF4TGluZXMiLCJWaXJ0dWFsUmVuZGVyZXIua2VlcFRleHRBcmVhQXRDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0RGVmYXVsdEN1cnNvclN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEN1cnNvckxheWVyT2ZmIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUNoYXJhY3RlclNpemUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2Vzc2lvbiIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVMaW5lcyIsIlZpcnR1YWxSZW5kZXJlci5vbkNoYW5nZU5ld0xpbmVNb2RlIiwiVmlydHVhbFJlbmRlcmVyLm9uQ2hhbmdlVGFiU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVUZXh0IiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUZ1bGwiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlRm9udFNpemUiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNpemVBc3luYyIsIlZpcnR1YWxSZW5kZXJlci5vblJlc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci4kdXBkYXRlQ2FjaGVkU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5vbkd1dHRlclJlc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5hZGp1c3RXcmFwTGltaXQiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0QW5pbWF0ZWRTY3JvbGwiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0QW5pbWF0ZWRTY3JvbGwiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2hvd0ludmlzaWJsZXMiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2hvd0ludmlzaWJsZXMiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0RGlzcGxheUluZGVudEd1aWRlcyIsIlZpcnR1YWxSZW5kZXJlci5zZXREaXNwbGF5SW5kZW50R3VpZGVzIiwiVmlydHVhbFJlbmRlcmVyLnNldFNob3dQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRTaG93UHJpbnRNYXJnaW4iLCJWaXJ0dWFsUmVuZGVyZXIuc2V0UHJpbnRNYXJnaW5Db2x1bW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0UHJpbnRNYXJnaW5Db2x1bW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2hvd0d1dHRlciIsIlZpcnR1YWxSZW5kZXJlci5zZXRTaG93R3V0dGVyIiwiVmlydHVhbFJlbmRlcmVyLmdldEZhZGVGb2xkV2lkZ2V0cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRGYWRlRm9sZFdpZGdldHMiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0SGlnaGxpZ2h0R3V0dGVyTGluZSIsIlZpcnR1YWxSZW5kZXJlci5nZXRIaWdobGlnaHRHdXR0ZXJMaW5lIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0IiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRDb250YWluZXJFbGVtZW50IiwiVmlydHVhbFJlbmRlcmVyLmdldE1vdXNlRXZlbnRUYXJnZXQiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0VGV4dEFyZWFDb250YWluZXIiLCJWaXJ0dWFsUmVuZGVyZXIuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLmdldEZpcnN0VmlzaWJsZVJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRGaXJzdEZ1bGx5VmlzaWJsZVJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRMYXN0RnVsbHlWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldFBhZGRpbmciLCJWaXJ0dWFsUmVuZGVyZXIuc2V0UGFkZGluZyIsIlZpcnR1YWxSZW5kZXJlci5zZXRTY3JvbGxNYXJnaW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNjcm9sbEJhclYiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNjcm9sbEJhckgiLCJWaXJ0dWFsUmVuZGVyZXIuZnJlZXplIiwiVmlydHVhbFJlbmRlcmVyLnVuZnJlZXplIiwiVmlydHVhbFJlbmRlcmVyLiRyZW5kZXJDaGFuZ2VzIiwiVmlydHVhbFJlbmRlcmVyLiRhdXRvc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci4kY29tcHV0ZUxheWVyQ29uZmlnIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVMaW5lcyIsIlZpcnR1YWxSZW5kZXJlci4kZ2V0TG9uZ2VzdExpbmUiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlRnJvbnRNYXJrZXJzIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUJhY2tNYXJrZXJzIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUJyZWFrcG9pbnRzIiwiVmlydHVhbFJlbmRlcmVyLnNldEFubm90YXRpb25zIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUN1cnNvciIsIlZpcnR1YWxSZW5kZXJlci5oaWRlQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLnNob3dDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsU2VsZWN0aW9uSW50b1ZpZXciLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXciLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2Nyb2xsVG9wIiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbExlZnQiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2Nyb2xsVG9wUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbEJvdHRvbVJvdyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb1JvdyIsIlZpcnR1YWxSZW5kZXJlci5hbGlnbkN1cnNvciIsIlZpcnR1YWxSZW5kZXJlci4kY2FsY1N0ZXBzIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvTGluZSIsIlZpcnR1YWxSZW5kZXJlci5hbmltYXRlU2Nyb2xsaW5nIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvWSIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb1giLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG8iLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsQnkiLCJWaXJ0dWFsUmVuZGVyZXIuaXNTY3JvbGxhYmxlQnkiLCJWaXJ0dWFsUmVuZGVyZXIucGl4ZWxUb1NjcmVlbkNvb3JkaW5hdGVzIiwiVmlydHVhbFJlbmRlcmVyLnNjcmVlblRvVGV4dENvb3JkaW5hdGVzIiwiVmlydHVhbFJlbmRlcmVyLnRleHRUb1NjcmVlbkNvb3JkaW5hdGVzIiwiVmlydHVhbFJlbmRlcmVyLnZpc3VhbGl6ZUZvY3VzIiwiVmlydHVhbFJlbmRlcmVyLnZpc3VhbGl6ZUJsdXIiLCJWaXJ0dWFsUmVuZGVyZXIuc2hvd0NvbXBvc2l0aW9uIiwiVmlydHVhbFJlbmRlcmVyLnNldENvbXBvc2l0aW9uVGV4dCIsIlZpcnR1YWxSZW5kZXJlci5oaWRlQ29tcG9zaXRpb24iLCJWaXJ0dWFsUmVuZGVyZXIuc2V0VGhlbWUiLCJWaXJ0dWFsUmVuZGVyZXIuYWRkQ3NzQ2xhc3MiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0Q3NzQ2xhc3MiLCJWaXJ0dWFsUmVuZGVyZXIuaW1wb3J0VGhlbWVMaW5rIiwiVmlydHVhbFJlbmRlcmVyLnNldFRoZW1lQ3NzIiwiVmlydHVhbFJlbmRlcmVyLmdldFRoZW1lIiwiVmlydHVhbFJlbmRlcmVyLnNldFN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnVuc2V0U3R5bGUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0Q3Vyc29yU3R5bGUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0TW91c2VDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuZGVzdHJveSJdLCJtYXBwaW5ncyI6IkFBb0RBLFlBQVksQ0FBQztPQUVOLEVBQUMsV0FBVyxFQUFFLHFCQUFxQixFQUFFLGFBQWEsRUFBRSxzQkFBc0IsRUFBRSxjQUFjLEVBQUUsV0FBVyxFQUFDLE1BQU0sV0FBVztPQUN6SCxFQUFDLGFBQWEsRUFBYyxZQUFZLEVBQUMsTUFBTSxVQUFVO09BQ3pELEVBQUMsT0FBTyxFQUFDLE1BQU0saUJBQWlCO09BR2hDLE1BQU0sTUFBTSxnQkFBZ0I7T0FDNUIsV0FBVyxNQUFNLHFCQUFxQjtPQUN0QyxNQUFNLE1BQU0sZ0JBQWdCO09BQzVCLE1BQU0sTUFBTSxnQkFBZ0I7T0FFNUIsSUFBSSxNQUFNLGNBQWM7T0FHeEIsVUFBVSxNQUFNLGNBQWM7T0FDOUIsVUFBVSxNQUFNLGNBQWM7T0FFOUIsVUFBVSxNQUFNLGNBQWM7T0FDOUIsaUJBQWlCLE1BQU0seUJBQXlCO09BS2hELFNBQVMsTUFBTSxhQUFhO0FBT25DLElBQUksYUFBYSxHQUFHLENBQUMsQ0FBQztBQUN0QixJQUFJLGFBQWEsR0FBRyxDQUFDLENBQUM7QUFDdEIsSUFBSSxhQUFhLEdBQUcsQ0FBQyxDQUFDO0FBQ3RCLElBQUksYUFBYSxHQUFHLENBQUMsQ0FBQztBQUN0QixJQUFJLFlBQVksR0FBRyxFQUFFLENBQUM7QUFDdEIsSUFBSSxXQUFXLEdBQUcsRUFBRSxDQUFDO0FBQ3JCLElBQUksV0FBVyxHQUFHLEVBQUUsQ0FBQztBQUNyQixJQUFJLGtCQUFrQixHQUFHLEdBQUcsQ0FBQztBQUM3QixJQUFJLG1CQUFtQixHQUFHLEdBQUcsQ0FBQztBQUM5QixJQUFJLFdBQVcsR0FBRyxHQUFHLENBQUM7QUFDdEIsSUFBSSxlQUFlLEdBQUcsSUFBSSxDQUFDO0FBRzNCLHlCQUF5QixPQUFlO0lBQ3BDQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFB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SUEsQ0FBQ0EscUJBQXFCQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUV0Q0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFFMUNBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ3BDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxHQUFHQSxZQUFZQSxDQUFDQTtRQUN0Q0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFFekNBLElBQUlBLENBQUNBLFFBQVFBLEdBQW1CQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNyREEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsU0FBU0EsR0FBR0EsY0FBY0EsQ0FBQ0E7UUFDekNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBRTFDQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFtQkEsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDcERBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLEdBQUdBLGFBQWFBLENBQUNBO1FBQ3ZDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUV4Q0EsSUFBSUEsQ0FBQ0EsWUFBWUEsR0FBR0EsSUFBSUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEVBQUVBLENBQUNBLG1CQUFtQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFMUVBLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBRTVDQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUN6REEsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFFaENBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBRTdDQSxJQUFJQSxDQUFDQSxZQUFZQSxHQUFHQSxJQUFJQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUc3Q0EsSUFBSUEsQ0FBQ0EsWUFBWUEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDMUJBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLEtBQUtBLENBQUNBO1FBRXRCQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN2REEsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsSUFBSUEsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLEVBQUVBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLEtBQUtBLEVBQUVBLFNBQXFCQTtZQUN0REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDekJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2xFQSxDQUFDQTtRQUNM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Q0EsY0FBY0E7WUFDbkNBLGFBQWFBLEVBQUVBLElBQUlBLENBQUNBLGFBQWFBO1NBQ3BDQSxDQUFDQTtRQUNGQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3Q0EsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7WUFDckJBLE9BQU9BLElBQUlBLFdBQVdBLENBQUNBO1lBRXZCQSxJQUFJQSxDQUFDQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7Z0JBQ2xCQSxJQUFJQSxDQUFDQSxjQUFjQSxJQUFJQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUVsREEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFFckVBLE9BQU9BLEdBQUdBLE9BQU9BLEdBQUdBLGFBQWFBLENBQUNBO1FBQ3RDQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQ0EsT0FBT0EsSUFBSUEsV0FBV0EsQ0FBQ0E7WUFDdkJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBO1lBRW5CQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxJQUFJQSxJQUFJQSxDQUFDQTtnQkFDcEJBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFdBQVdBLEdBQUdBLENBQUNB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Q0FBQ0E7UUFDeENBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEVBQ3JEQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUUzRkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsRUFDakZBLFdBQVdBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBRXRGQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUMzREEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsTUFBTUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDcEZBLElBQUlBLE9BQU9BLEdBQUdBLFFBQVFBLEdBQUdBLFNBQVNBLENBQUNBO1FBR25DQSxJQUFJQSxjQUFjQSxFQUFFQSxjQUFj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LElBQUlBLFNBQVNBLEdBQUdBLFdBQVdBLElBQUlBLFdBQVdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBO1FBQ3BEQSxJQUFJQSxZQUFZQSxHQUFHQSxXQUFXQSxJQUFJQSxXQUFXQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUUxREEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUVyRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDOUJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO2dCQUNQQSxHQUFHQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQTtZQUM5Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1ZBLEdBQUdBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLENBQUNBO1lBQ2pDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNuQ0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsR0FBR0EsWUFBWUEsR0FBR0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEZBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO2dCQUNQQSxHQUFHQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQTtZQUM5Q0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0E7UUFDakZBLENBQUNBO1FBRURBLElBQUlBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBRWpDQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsY0FBY0EsQ0FBQ0E7Z0JBQzNEQSxJQUFJQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUNuQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDckNBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLEdBQUdBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO1lBQzFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNsR0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsSUFBSUEsSUFBSUEsQ0FBQ0EsUUFBUUEsSUFBSUEsSUFBSUEsR0FBR0EsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDOUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ2xDQSxDQUFDQTtJQUNMQSxDQUFDQTtJQU9EdkUsWUFBWUE7UUFDUndFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO0lBQ3ZDQSxDQUFDQTtJQU9EeEUsYUFBYUE7UUFDVHlFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLEVBQUVBLENBQUNBO0lBQ3hDQSxDQUFDQTtJQU9EekUsZUFBZUE7UUFDWDBFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO0lBQzVDQSxDQUFDQTtJQU9EMUUsa0JBQWtCQTtRQUNkMkUsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDdkdBLENBQUNBO0lBU0QzRSxXQUFXQSxDQUFDQSxHQUFXQTtRQUNuQjRFLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0lBQ3JEQSxDQUFDQTtJQUVENUUsV0FBV0EsQ0FBQ0EsTUFBTUEsRUFBZ0JBLFNBQWlCQTtRQUUvQzZFLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLE1BQU1BLElBQUlBLFFBQVFBLENBQUNBO1lBQzFCQSxNQUFNQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUV4Q0EsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNyREEsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFDcERBLElBQUlBLE1BQU1BLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBRTVDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNsQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7SUFDbEJBLENBQUNBO0lBRUQ3RSxVQUFVQSxDQUFDQSxTQUFpQkEsRUFBRUEsT0FBZUE7UUFDekM4RSxJQUFJQSxDQUFDQSxHQUFXQSxDQUFDQSxDQUFDQTtRQUNsQkEsSUFBSUEsQ0FBQ0EsR0FBV0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDM0JBLElBQUlBLEtBQUtBLEdBQWFBLEVBQUVBLENBQUNBO1FBRXpCQSxJQUFJQSxJQUFJQSxHQUFHQSxVQUFTQSxDQUFTQSxFQUFFQSxLQUFhQSxFQUFFQSxFQUFVQTtZQUNwRCxNQUFNLENBQUMsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQztRQUNqRCxDQUFDLENBQUNBO1FBRUZBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQ3JCQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxTQUFTQSxFQUFFQSxPQUFPQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNyRUEsQ0FBQ0E7UUFFREEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDakJBLENBQUNBO0lBU0Q5RSxZQUFZQSxDQUFDQSxJQUFZQSxFQUFFQSxNQUFlQSxFQUFFQSxPQUFnQkEsRUFBRUEsUUFBb0JBO1FBQzlFK0UsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxJQUFJQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUN2RUEsSUFBSUEsTUFBTUEsR0FBR0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDckJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ1RBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzVDQSxDQUFDQTtRQUVEQSxJQUFJQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUNuQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDbENBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEtBQUtBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBLGFBQWFBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO1FBQ25EQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVEL0UsZ0JBQWdCQSxDQUFDQSxTQUFpQkEsRUFBRUEsUUFBU0E7UUFDekNnRixJQUFJQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUM3QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBQ0RBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO1FBRWpCQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxJQUFJQSxPQUFPQSxDQUFDQTtZQUNyQkEsTUFBTUEsQ0FBQ0E7UUFFWEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4QkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUMzQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xCQSxTQUFTQSxHQUFHQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDeEJBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLElBQUlBLE9BQU9BLENBQUNBO29CQUNyQkEsTUFBTUEsQ0FBQ0E7WUFDZkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsSUFBSUEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsU0FBU0EsRUFBRUEsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDakRBLElBQUlBLENBQUNBLGdCQUFnQkEsR0FBR0EsRUFBRUEsSUFBSUEsRUFBRUEsU0FBU0EsRUFBRUEsRUFBRUEsRUFBRUEsT0FBT0EsRUFBRUEsS0FBS0EsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0E7UUFFdkVBLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRTNCQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUUxQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsR0FBR0EsT0FBT0EsQ0FBQ0E7UUFDbkNBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLFdBQVdBLENBQUNBO1lBQ3RCLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNmLEtBQUssQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO2dCQUMxQyxLQUFLLENBQUMsT0FBTyxDQUFDLFVBQVUsR0FBRyxPQUFPLENBQUM7WUFDdkMsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDekIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQzlCLEtBQUssQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUNwQyxPQUFPLEdBQUcsSUFBSSxDQUFDO1lBQ25CLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFFSixLQUFLLENBQUMsTUFBTSxHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzNDLEtBQUssQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7Z0JBQzlCLFFBQVEsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUMzQixDQUFDO1FBQ0wsQ0FBQyxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUNYQSxDQUFDQTtJQU1EaEYsU0FBU0EsQ0FBQ0EsU0FBaUJBO1FBR3ZCaUYsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsS0FBS0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDL0JBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLFNBQVNBLENBQUNBO1lBQzNCQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtRQUN2Q0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFNRGpGLFNBQVNBLENBQUNBLFVBQWtCQTtRQUN4QmtGLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLEtBQUtBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pDQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxVQUFVQSxDQUFDQTtZQUM3QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7UUFDekNBLENBQUNBO0lBQ0xBLENBQUNBO0lBT0RsRixRQUFRQSxDQUFDQSxDQUFTQSxFQUFFQSxDQUFTQTtRQUN6Qm1GLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzdCQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNsQ0EsQ0FBQ0E7SUFTRG5GLFFBQVFBLENBQUNBLE1BQWNBLEVBQUVBLE1BQWNBO1FBQ25Db0YsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsRUFBRUEsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDMUVBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLEVBQUVBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBO0lBQ2hGQSxDQUFDQTtJQVVEcEYsY0FBY0EsQ0FBQ0EsTUFBY0EsRUFBRUEsTUFBY0E7UUFDekNxRixFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUN2RUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBO2NBQ25FQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUM3REEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBO1lBQ3pFQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNoQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsYUFBYUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsYUFBYUE7Y0FDbkVBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBO1lBQ3hEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFFRHJGLHdCQUF3QkEsQ0FBQ0EsQ0FBU0EsRUFBRUEsQ0FBU0E7UUFDekNzRixJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxxQkFBcUJBLEVBQUVBLENBQUNBO1FBRXREQSxJQUFJQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxTQUFTQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQTtRQUMxRkEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDN0VBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRTdCQSxNQUFNQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxHQUFHQSxFQUFFQSxJQUFJQSxFQUFFQSxNQUFNQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQTtJQUN0RUEsQ0FBQ0E7SUFFRHRGLHVCQUF1QkEsQ0FBQ0EsT0FBZUEsRUFBRUEsT0FBZUE7UUFDcER1RixJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxxQkFBcUJBLEVBQUVBLENBQUNBO1FBRXREQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxTQUFTQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQTtRQUU1R0EsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFFdkVBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLHdCQUF3QkEsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDM0VBLENBQUNBO0lBUUR2Rix1QkFBdUJBLENBQUNBLEdBQVdBLEVBQUVBLE1BQWNBO1FBQy9Dd0YsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EscUJBQXFC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Q0FBQztLQUNKO0lBQ0QsUUFBUSxFQUFFO1FBQ04sR0FBRyxFQUFFLFVBQVMsR0FBRztZQUNiLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUN0QixDQUFDO0tBQ0o7SUFDRCxhQUFhLEVBQUU7UUFDWCxHQUFHLEVBQUUsVUFBUyxHQUFHO1lBQ2IsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztZQUNoQixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxJQUFJLEdBQUcsQ0FBQztnQkFDM0IsTUFBTSxDQUFDO1lBQ1gsSUFBSSxDQUFDLGNBQWMsR0FBRyxHQUFHLENBQUM7WUFDMUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzVDLENBQUM7UUFDRCxZQUFZLEVBQUUsQ0FBQztRQUNmLFVBQVUsRUFBRSxJQUFJO0tBQ25CO0lBQ0QsZ0JBQWdCLEVBQUU7UUFDZCxHQUFHLEVBQUUsVUFBUyxHQUFHO1lBQ2IsSUFBSSxDQUFDLFlBQVksQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQztZQUN0QyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDNUMsQ0FBQztLQUNKO0lBQ0QsS0FBSyxFQUFFO1FBQ0gsR0FBRyxFQUFFLFVBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQyxDQUFDO1FBQ3pDLEdBQUcsRUFBRSxjQUFhLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELFlBQVksRUFBRSxrQkFBa0I7UUFDaEMsVUFBVSxFQUFFLElBQUk7S0FDbkI7Q0FDSixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQtMjAxNiBEYXZpZCBHZW8gSG9sbWVzIDxkYXZpZC5nZW8uaG9sbWVzQGdtYWlsLmNvbT5cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW4gYWxsXG4gKiBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEVcbiAqIFNPRlRXQVJFLlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cbi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbmltcG9ydCB7YWRkQ3NzQ2xhc3MsIGFwcGVuZEhUTUxMaW5rRWxlbWVudCwgY3JlYXRlRWxlbWVudCwgZW5zdXJlSFRNTFN0eWxlRWxlbWVudCwgcmVtb3ZlQ3NzQ2xhc3MsIHNldENzc0NsYXNzfSBmcm9tIFwiLi9saWIvZG9tXCI7XG5pbXBvcnQge2RlZmluZU9wdGlvbnMsIGxvYWRNb2R1bGUsIHJlc2V0T3B0aW9uc30gZnJvbSBcIi4vY29uZmlnXCI7XG5pbXBvcnQge2lzT2xkSUV9IGZyb20gXCIuL2xpYi91c2VyYWdlbnRcIjtcbmltcG9ydCBBbm5vdGF0aW9uIGZyb20gJy4vQW5ub3RhdGlvbic7XG5cbmltcG9ydCBDdXJzb3IgZnJvbSBcIi4vbGF5ZXIvQ3Vyc29yXCI7XG5pbXBvcnQgRm9udE1ldHJpY3MgZnJvbSBcIi4vbGF5ZXIvRm9udE1ldHJpY3NcIjtcbmltcG9ydCBHdXR0ZXIgZnJvbSBcIi4vbGF5ZXIvR3V0dGVyXCI7XG5pbXBvcnQgTWFya2VyIGZyb20gXCIuL2xheWVyL01hcmtlclwiO1xuaW1wb3J0IFByaW50TWFyZ2luIGZyb20gXCIuL2xheWVyL1ByaW50TWFyZ2luXCI7XG5pbXBvcnQgVGV4dCBmcm9tIFwiLi9sYXllci9UZXh0XCI7XG5cbi8vIFRPRE86IFxuaW1wb3J0IFZTY3JvbGxCYXIgZnJvbSBcIi4vVlNjcm9sbEJhclwiO1xuaW1wb3J0IEhTY3JvbGxCYXIgZnJvbSBcIi4vSFNjcm9sbEJhclwiO1xuXG5pbXBvcnQgUmVuZGVyTG9vcCBmcm9tIFwiLi9SZW5kZXJMb29wXCI7XG5pbXBvcnQgRXZlbnRFbWl0dGVyQ2xhc3MgZnJvbSBcIi4vbGliL0V2ZW50RW1pdHRlckNsYXNzXCI7XG5pbXBvcnQgRWRpdFNlc3Npb24gZnJvbSAnLi9FZGl0U2Vzc2lvbic7XG5pbXBvcnQgRXZlbnRCdXMgZnJvbSAnLi9FdmVudEJ1cyc7XG5pbXBvcnQgT3B0aW9uc1Byb3ZpZGVyIGZyb20gXCIuL09wdGlvbnNQcm92aWRlclwiO1xuaW1wb3J0IFBvc2l0aW9uIGZyb20gJy4vUG9zaXRpb24nO1xuaW1wb3J0IFRoZW1lTGluayBmcm9tICcuL1RoZW1lTGluayc7XG5pbXBvcnQgRWRpdG9yUmVuZGVyZXIgZnJvbSAnLi9FZGl0b3JSZW5kZXJlcic7XG5cbi8vIEZJWE1FXG4vLyBpbXBvcnQgZWRpdG9yQ3NzID0gcmVxdWlyZShcIi4vcmVxdWlyZWpzL3RleHQhLi9jc3MvZWRpdG9yLmNzc1wiKTtcbi8vIGVuc3VyZUhUTUxTdHlsZUVsZW1lbnQoZWRpdG9yQ3NzLCBcImFjZV9lZGl0b3JcIik7XG5cbnZhciBDSEFOR0VfQ1VSU09SID0gMTtcbnZhciBDSEFOR0VfTUFSS0VSID0gMjtcbnZhciBDSEFOR0VfR1VUVEVSID0gNDtcbnZhciBDSEFOR0VfU0NST0xMID0gODtcbnZhciBDSEFOR0VfTElORVMgPSAxNjtcbnZhciBDSEFOR0VfVEVYVCA9IDMyO1xudmFyIENIQU5HRV9TSVpFID0gNjQ7XG52YXIgQ0hBTkdFX01BUktFUl9CQUNLID0gMTI4O1xudmFyIENIQU5HRV9NQVJLRVJfRlJPTlQgPSAyNTY7XG52YXIgQ0hBTkdFX0ZVTEwgPSA1MTI7XG52YXIgQ0hBTkdFX0hfU0NST0xMID0gMTAyNDtcblxuLy8gVXNlZnVsIGZvciBkZWJ1Z2dpbmcuLi5cbmZ1bmN0aW9uIGNoYW5nZXNUb1N0cmluZyhjaGFuZ2VzOiBudW1iZXIpOiBzdHJpbmcge1xuICAgIHZhciBhID0gXCJcIlxuICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0NVUlNPUikgYSArPSBcIiBjdXJzb3JcIjtcbiAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9NQVJLRVIpIGEgKz0gXCIgbWFya2VyXCI7XG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfR1VUVEVSKSBhICs9IFwiIGd1dHRlclwiO1xuICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX1NDUk9MTCkgYSArPSBcIiBzY3JvbGxcIjtcbiAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9MSU5FUykgYSArPSBcIiBsaW5lc1wiO1xuICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX1RFWFQpIGEgKz0gXCIgdGV4dFwiO1xuICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX1NJWkUpIGEgKz0gXCIgc2l6ZVwiO1xuICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX01BUktFUl9CQUNLKSBhICs9IFwiIG1hcmtlcl9iYWNrXCI7XG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfTUFSS0VSX0ZST05UKSBhICs9IFwiIG1hcmtlcl9mcm9udFwiO1xuICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0ZVTEwpIGEgKz0gXCIgZnVsbFwiO1xuICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0hfU0NST0xMKSBhICs9IFwiIGhfc2Nyb2xsXCI7XG4gICAgcmV0dXJuIGEudHJpbSgpO1xufVxuXG4vKipcbiAqIFRoZSBjbGFzcyB0aGF0IGlzIHJlc3BvbnNpYmxlIGZvciBkcmF3aW5nIGV2ZXJ5dGhpbmcgeW91IHNlZSBvbiB0aGUgc2NyZWVuIVxuICpcbiAqIEBjbGFzcyBWaXJ0dWFsUmVuZGVyZXJcbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgVmlydHVhbFJlbmRlcmVyIGltcGxlbWVudHMgRXZlbnRCdXM8VmlydHVhbFJlbmRlcmVyPiwgRWRpdG9yUmVuZGVyZXIsIE9wdGlvbnNQcm92aWRlciB7XG4gICAgcHVibGljIHRleHRhcmVhOiBIVE1MVGV4dEFyZWFFbGVtZW50O1xuICAgIHB1YmxpYyBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuICAgIHB1YmxpYyBzY3JvbGxMZWZ0ID0gMDtcbiAgICBwdWJsaWMgc2Nyb2xsVG9wID0gMDtcbiAgICBwdWJsaWMgbGF5ZXJDb25maWcgPSB7XG4gICAgICAgIHdpZHRoOiAxLFxuICAgICAgICBwYWRkaW5nOiAwLFxuICAgICAgICBmaXJzdFJvdzogMCxcbiAgICAgICAgZmlyc3RSb3dTY3JlZW46IDAsXG4gICAgICAgIGxhc3RSb3c6IDAsXG4gICAgICAgIGxpbmVIZWlnaHQ6IDAsXG4gICAgICAgIGNoYXJhY3RlcldpZHRoOiAwLFxuICAgICAgICBtaW5IZWlnaHQ6IDEsXG4gICAgICAgIG1heEhlaWdodDogMSxcbiAgICAgICAgb2Zmc2V0OiAwLFxuICAgICAgICBoZWlnaHQ6IDEsXG4gICAgICAgIGd1dHRlck9mZnNldDogMVxuICAgIH07XG4gICAgcHVibGljICRtYXhMaW5lczogbnVtYmVyO1xuICAgIHB1YmxpYyAkbWluTGluZXM6IG51bWJlcjtcblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSAkY3Vyc29yTGF5ZXJcbiAgICAgKiBAdHlwZSBDdXJzb3JcbiAgICAgKi9cbiAgICBwdWJsaWMgJGN1cnNvckxheWVyOiBDdXJzb3I7XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkgJGd1dHRlckxheWVyXG4gICAgICogQHR5cGUgR3V0dGVyXG4gICAgICovXG4gICAgcHVibGljICRndXR0ZXJMYXllcjogR3V0dGVyO1xuXG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5ICRtYXJrZXJGcm9udFxuICAgICAqIEB0eXBlIE1hcmtlclxuICAgICAqL1xuICAgIHByaXZhdGUgJG1hcmtlckZyb250OiBNYXJrZXI7XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkgJG1hcmtlckJhY2tcbiAgICAgKiBAdHlwZSBNYXJrZXJcbiAgICAgKi9cbiAgICBwcml2YXRlICRtYXJrZXJCYWNrOiBNYXJrZXI7XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkgJHRleHRMYXllclxuICAgICAqIEB0eXBlIFRleHRcbiAgICAgKi9cbiAgICBwdWJsaWMgJHRleHRMYXllcjogVGV4dDtcblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSAkcGFkZGluZ1xuICAgICAqIEB0eXBlIG51bWJlclxuICAgICAqIEBwcml2YXRlXG4gICAgICogQGRlZmF1bHQgMFxuICAgICAqL1xuICAgIHByaXZhdGUgJHBhZGRpbmc6IG51bWJlciA9IDA7XG5cbiAgICBwcml2YXRlICRmcm96ZW4gPSBmYWxzZTtcblxuICAgIC8vIFRoZSB0aGVtZUlkIGlzIHdoYXQgaXMgY29tbXVuaWNhdGVkIGluIHRoZSBBUEkuXG4gICAgcHJpdmF0ZSAkdGhlbWVJZDogc3RyaW5nO1xuICAgIC8qKlxuICAgICAqIFRoZSBsb2FkZWQgdGhlbWUgb2JqZWN0LiBUaGlzIGFsbG93cyB1cyB0byByZW1vdmUgYSB0aGVtZS5cbiAgICAgKi9cbiAgICBwcml2YXRlIHRoZW1lOiB7IGNzc0NsYXNzOiBzdHJpbmcgfTtcblxuICAgIHByaXZhdGUgJHRpbWVyO1xuICAgIHByaXZhdGUgU1RFUFMgPSA4O1xuICAgIHB1YmxpYyAka2VlcFRleHRBcmVhQXRDdXJzb3I6IGJvb2xlYW47XG4gICAgcHVibGljICRndXR0ZXI7XG4gICAgcHVibGljIHNjcm9sbGVyOiBIVE1MRGl2RWxlbWVudDtcbiAgICBwdWJsaWMgY29udGVudDogSFRNTERpdkVsZW1lbnQ7XG4gICAgcHJpdmF0ZSBjYW52YXM6IEhUTUxEaXZFbGVtZW50O1xuICAgIHByaXZhdGUgJGhvcml6U2Nyb2xsOiBib29sZWFuO1xuICAgIHByaXZhdGUgJHZTY3JvbGw7XG4gICAgcHVibGljIHNjcm9sbEJhckg6IEhTY3JvbGxCYXI7XG4gICAgcHVibGljIHNjcm9sbEJhclY6IFZTY3JvbGxCYXI7XG4gICAgcHJpdmF0ZSAkc2Nyb2xsQW5pbWF0aW9uOiB7IGZyb206IG51bWJlcjsgdG86IG51bWJlcjsgc3RlcHM6IG51bWJlcltdIH07XG4gICAgcHVibGljICRzY3JvbGxiYXJXaWR0aDogbnVtYmVyO1xuICAgIHByaXZhdGUgc2Vzc2lvbjogRWRpdFNlc3Npb247XG4gICAgcHJpdmF0ZSBldmVudEJ1czogRXZlbnRFbWl0dGVyQ2xhc3M8VmlydHVhbFJlbmRlcmVyPjtcblxuICAgIHByaXZhdGUgc2Nyb2xsTWFyZ2luID0ge1xuICAgICAgICBsZWZ0OiAwLFxuICAgICAgICByaWdodDogMCxcbiAgICAgICAgdG9wOiAwLFxuICAgICAgICBib3R0b206IDAsXG4gICAgICAgIHY6IDAsXG4gICAgICAgIGg6IDBcbiAgICB9O1xuXG4gICAgcHJpdmF0ZSAkZm9udE1ldHJpY3M6IEZvbnRNZXRyaWNzO1xuICAgIHByaXZhdGUgJGFsbG93Qm9sZEZvbnRzO1xuICAgIHByaXZhdGUgY3Vyc29yUG9zO1xuXG4gICAgLyoqXG4gICAgICogQSBjYWNoZSBvZiB2YXJpb3VzIHNpemVzIFRCQS5cbiAgICAgKi9cbiAgICBwdWJsaWMgJHNpemU6IHsgaGVpZ2h0OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IHNjcm9sbGVySGVpZ2h0OiBudW1iZXI7IHNjcm9sbGVyV2lkdGg7ICRkaXJ0eTogYm9vbGVhbiB9O1xuXG4gICAgcHJpdmF0ZSAkbG9vcDogUmVuZGVyTG9vcDtcbiAgICBwcml2YXRlICRjaGFuZ2VkTGluZXM7XG4gICAgcHJpdmF0ZSAkY2hhbmdlcyA9IDA7XG4gICAgcHJpdmF0ZSByZXNpemluZztcbiAgICBwcml2YXRlICRndXR0ZXJMaW5lSGlnaGxpZ2h0O1xuICAgIC8vIEZJWE1FOiBXaHkgZG8gd2UgaGF2ZSB0d28/XG4gICAgcHVibGljIGd1dHRlcldpZHRoOiBudW1iZXI7XG4gICAgcHJpdmF0ZSAkZ3V0dGVyV2lkdGg6IG51bWJlcjtcblxuICAgIC8qKlxuICAgICAqIFRPRE86IENyZWF0ZSBhIFByaW50TWFyZ2luTGF5ZXIgY2xhc3MgaW4gdGhlIGxheWVyIGZvbGRlci5cbiAgICAgKi9cbiAgICBwcml2YXRlICRwcmludE1hcmdpbkVsOiBIVE1MRGl2RWxlbWVudDtcbiAgICBwcml2YXRlICRwcmludE1hcmdpbkNvbHVtbjtcbiAgICBwcml2YXRlICRzaG93UHJpbnRNYXJnaW47XG5cbiAgICBwcml2YXRlIGdldE9wdGlvbjtcbiAgICBwcml2YXRlIHNldE9wdGlvbjtcblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSBjaGFyYWN0ZXJXaWR0aFxuICAgICAqIEB0eXBlIG51bWJlclxuICAgICAqL1xuICAgIHB1YmxpYyBjaGFyYWN0ZXJXaWR0aDogbnVtYmVyO1xuXG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5IGxpbmVIZWlnaHRcbiAgICAgKiBAdHlwZSBudW1iZXJcbiAgICAgKi9cbiAgICBwdWJsaWMgbGluZUhlaWdodDogbnVtYmVyO1xuXG4gICAgcHJpdmF0ZSAkZXh0cmFIZWlnaHQ7XG4gICAgcHJpdmF0ZSAkY29tcG9zaXRpb246IHsga2VlcFRleHRBcmVhQXRDdXJzb3I6IGJvb2xlYW47IGNzc1RleHQ6IHN0cmluZyB9O1xuICAgIHByaXZhdGUgJGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIHByaXZhdGUgJHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIHByaXZhdGUgJHNob3dHdXR0ZXI7XG4gICAgcHJpdmF0ZSBzaG93SW52aXNpYmxlcztcbiAgICBwcml2YXRlICRhbmltYXRlZFNjcm9sbDogYm9vbGVhbjtcbiAgICBwcml2YXRlICRzY3JvbGxQYXN0RW5kO1xuICAgIHByaXZhdGUgJGhpZ2hsaWdodEd1dHRlckxpbmU7XG4gICAgcHJpdmF0ZSBkZXNpcmVkSGVpZ2h0O1xuXG4gICAgLyoqXG4gICAgICogQ29uc3RydWN0cyBhIG5ldyBgVmlydHVhbFJlbmRlcmVyYCB3aXRoaW4gdGhlIGBjb250YWluZXJgIHNwZWNpZmllZC5cbiAgICAgKlxuICAgICAqIEBjbGFzcyBWaXJ0dWFsUmVuZGVyZXJcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKiBAcGFyYW0gY29udGFpbmVyIHtIVE1MRWxlbWVudH0gVGhlIHJvb3QgZWxlbWVudCBvZiB0aGUgZWRpdG9yLlxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICAgICAgdGhpcy5ldmVudEJ1cyA9IG5ldyBFdmVudEVtaXR0ZXJDbGFzczxWaXJ0dWFsUmVuZGVyZXI+KHRoaXMpO1xuXG4gICAgICAgIHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyIHx8IDxIVE1MRGl2RWxlbWVudD5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXG4gICAgICAgIC8vIFRPRE86IHRoaXMgYnJlYWtzIHJlbmRlcmluZyBpbiBDbG91ZDkgd2l0aCBtdWx0aXBsZSBhY2UgaW5zdGFuY2VzXG4gICAgICAgIC8vIC8vIEltcG9ydHMgQ1NTIG9uY2UgcGVyIERPTSBkb2N1bWVudCAoJ2FjZV9lZGl0b3InIHNlcnZlcyBhcyBhbiBpZGVudGlmaWVyKS5cbiAgICAgICAgLy8gZW5zdXJlSFRNTFN0eWxlRWxlbWVudChlZGl0b3JDc3MsIFwiYWNlX2VkaXRvclwiLCBjb250YWluZXIub3duZXJEb2N1bWVudCk7XG5cbiAgICAgICAgLy8gaW4gSUUgPD0gOSB0aGUgbmF0aXZlIGN1cnNvciBhbHdheXMgc2hpbmVzIHRocm91Z2hcbiAgICAgICAgdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSAhaXNPbGRJRTtcblxuICAgICAgICBhZGRDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgXCJhY2VfZWRpdG9yXCIpO1xuXG4gICAgICAgIHRoaXMuJGd1dHRlciA9IGNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRoaXMuJGd1dHRlci5jbGFzc05hbWUgPSBcImFjZV9ndXR0ZXJcIjtcbiAgICAgICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy4kZ3V0dGVyKTtcblxuICAgICAgICB0aGlzLnNjcm9sbGVyID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRoaXMuc2Nyb2xsZXIuY2xhc3NOYW1lID0gXCJhY2Vfc2Nyb2xsZXJcIjtcbiAgICAgICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5zY3JvbGxlcik7XG5cbiAgICAgICAgdGhpcy5jb250ZW50ID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRoaXMuY29udGVudC5jbGFzc05hbWUgPSBcImFjZV9jb250ZW50XCI7XG4gICAgICAgIHRoaXMuc2Nyb2xsZXIuYXBwZW5kQ2hpbGQodGhpcy5jb250ZW50KTtcblxuICAgICAgICB0aGlzLiRndXR0ZXJMYXllciA9IG5ldyBHdXR0ZXIodGhpcy4kZ3V0dGVyKTtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIub24oXCJjaGFuZ2VHdXR0ZXJXaWR0aFwiLCB0aGlzLm9uR3V0dGVyUmVzaXplLmJpbmQodGhpcykpO1xuXG4gICAgICAgIHRoaXMuJG1hcmtlckJhY2sgPSBuZXcgTWFya2VyKHRoaXMuY29udGVudCk7XG5cbiAgICAgICAgdmFyIHRleHRMYXllciA9IHRoaXMuJHRleHRMYXllciA9IG5ldyBUZXh0KHRoaXMuY29udGVudCk7XG4gICAgICAgIHRoaXMuY2FudmFzID0gdGV4dExheWVyLmVsZW1lbnQ7XG5cbiAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQgPSBuZXcgTWFya2VyKHRoaXMuY29udGVudCk7XG5cbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIgPSBuZXcgQ3Vyc29yKHRoaXMuY29udGVudCk7XG5cbiAgICAgICAgLy8gSW5kaWNhdGVzIHdoZXRoZXIgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyIGlzIHZpc2libGVcbiAgICAgICAgdGhpcy4kaG9yaXpTY3JvbGwgPSBmYWxzZTtcbiAgICAgICAgdGhpcy4kdlNjcm9sbCA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMuc2Nyb2xsQmFyViA9IG5ldyBWU2Nyb2xsQmFyKHRoaXMuY29udGFpbmVyLCB0aGlzKTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJIID0gbmV3IEhTY3JvbGxCYXIodGhpcy5jb250YWluZXIsIHRoaXMpO1xuICAgICAgICB0aGlzLnNjcm9sbEJhclYub24oXCJzY3JvbGxcIiwgKGV2ZW50LCBzY3JvbGxCYXI6IFZTY3JvbGxCYXIpID0+IHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kc2Nyb2xsQW5pbWF0aW9uKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChldmVudC5kYXRhIC0gdGhpcy5zY3JvbGxNYXJnaW4udG9wKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFySC5vbihcInNjcm9sbFwiLCBmdW5jdGlvbihldmVudCwgc2Nyb2xsQmFyOiBIU2Nyb2xsQmFyKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuJHNjcm9sbEFuaW1hdGlvbikge1xuICAgICAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KGV2ZW50LmRhdGEgLSB0aGlzLnNjcm9sbE1hcmdpbi5sZWZ0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5jdXJzb3JQb3MgPSB7XG4gICAgICAgICAgICByb3c6IDAsXG4gICAgICAgICAgICBjb2x1bW46IDBcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLiRmb250TWV0cmljcyA9IG5ldyBGb250TWV0cmljcyh0aGlzLmNvbnRhaW5lciwgNTAwKTtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLiRzZXRGb250TWV0cmljcyh0aGlzLiRmb250TWV0cmljcyk7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci5vbihcImNoYW5nZUNoYXJhY3RlclNpemVcIiwgKGV2ZW50LCB0ZXh0OiBUZXh0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUNoYXJhY3RlclNpemUoKTtcbiAgICAgICAgICAgIHRoaXMub25SZXNpemUodHJ1ZSwgdGhpcy5ndXR0ZXJXaWR0aCwgdGhpcy4kc2l6ZS53aWR0aCwgdGhpcy4kc2l6ZS5oZWlnaHQpO1xuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBAZXZlbnQgY2hhbmdlQ2hhcmFjdGVyU2l6ZVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VDaGFyYWN0ZXJTaXplXCIsIGV2ZW50KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy4kc2l6ZSA9IHtcbiAgICAgICAgICAgIHdpZHRoOiAwLFxuICAgICAgICAgICAgaGVpZ2h0OiAwLFxuICAgICAgICAgICAgc2Nyb2xsZXJIZWlnaHQ6IDAsXG4gICAgICAgICAgICBzY3JvbGxlcldpZHRoOiAwLFxuICAgICAgICAgICAgJGRpcnR5OiB0cnVlXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy4kbG9vcCA9IG5ldyBSZW5kZXJMb29wKHRoaXMuJHJlbmRlckNoYW5nZXMuYmluZCh0aGlzKSwgdGhpcy5jb250YWluZXIub3duZXJEb2N1bWVudC5kZWZhdWx0Vmlldyk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuXG4gICAgICAgIHRoaXMudXBkYXRlQ2hhcmFjdGVyU2l6ZSgpO1xuICAgICAgICB0aGlzLnNldFBhZGRpbmcoNCk7XG4gICAgICAgIHJlc2V0T3B0aW9ucyh0aGlzKTtcbiAgICAgICAgLy8gRklYTUU6IFRoaXMgd2FzIGEgc2lnbmFsIHRvIGEgZ2xvYmFsIGNvbmZpZyBvYmplY3QuXG4gICAgICAgIC8vIFdoeSBkbyBFZGl0b3IgYW5kIEVkaXRTZXNzaW9uIHNpZ25hbCB3aGlsZSB0aGlzIGVtaXRzP1xuICAgICAgICAvL19lbWl0KFwicmVuZGVyZXJcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBvblxuICAgICAqIEBwYXJhbSBldmVudE5hbWUge3N0cmluZ31cbiAgICAgKiBAcGFyYW0gY2FsbGJhY2sgeyhldmVudCwgc291cmNlOiBWaXJ0dWFsUmVuZGVyZXIpID0+IGFueX1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIG9uKGV2ZW50TmFtZTogc3RyaW5nLCBjYWxsYmFjazogKGV2ZW50OiBhbnksIHNvdXJjZTogVmlydHVhbFJlbmRlcmVyKSA9PiBhbnkpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5vbihldmVudE5hbWUsIGNhbGxiYWNrLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBvZmZcbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIHtzdHJpbmd9XG4gICAgICogQHBhcmFtIGNhbGxiYWNrIHsoZXZlbnQsIHNvdXJjZTogVmlydHVhbFJlbmRlcmVyKSA9PiBhbnl9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBvZmYoZXZlbnROYW1lOiBzdHJpbmcsIGNhbGxiYWNrOiAoZXZlbnQ6IGFueSwgc291cmNlOiBWaXJ0dWFsUmVuZGVyZXIpID0+IGFueSk6IHZvaWQge1xuICAgICAgICB0aGlzLmV2ZW50QnVzLm9mZihldmVudE5hbWUsIGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkgbWF4TGluZXNcbiAgICAgKiBAdHlwZSBudW1iZXJcbiAgICAgKi9cbiAgICBzZXQgbWF4TGluZXMobWF4TGluZXM6IG51bWJlcikge1xuICAgICAgICB0aGlzLiRtYXhMaW5lcyA9IG1heExpbmVzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSBrZWVwVGV4dEFyZWFBdEN1cnNvclxuICAgICAqIEB0eXBlIGJvb2xlYW5cbiAgICAgKi9cbiAgICBzZXQga2VlcFRleHRBcmVhQXRDdXJzb3Ioa2VlcFRleHRBcmVhQXRDdXJzb3I6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSBrZWVwVGV4dEFyZWFBdEN1cnNvcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSA8Y29kZT5zdHlsZTwvY29kZT4gcHJvcGVydHkgb2YgdGhlIGNvbnRlbnQgdG8gXCJkZWZhdWx0XCIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldERlZmF1bHRDdXJzb3JTdHlsZVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0RGVmYXVsdEN1cnNvclN0eWxlKCk6IHZvaWQge1xuICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUuY3Vyc29yID0gXCJkZWZhdWx0XCI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgPGNvZGU+b3BhY2l0eTwvY29kZT4gb2YgdGhlIGN1cnNvciBsYXllciB0byBcIjBcIi5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0Q3Vyc29yTGF5ZXJPZmZcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBjaGFpbmFibGVcbiAgICAgKi9cbiAgICBzZXRDdXJzb3JMYXllck9mZigpOiB2b2lkIHtcbiAgICAgICAgdmFyIG5vb3AgPSBmdW5jdGlvbigpIHsgfTtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIucmVzdGFydFRpbWVyID0gbm9vcDtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuZWxlbWVudC5zdHlsZS5vcGFjaXR5ID0gXCIwXCI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCB1cGRhdGVDaGFyYWN0ZXJTaXplXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICB1cGRhdGVDaGFyYWN0ZXJTaXplKCk6IHZvaWQge1xuICAgICAgICAvLyBGSVhNRTogREdIIGFsbG93Qm9sZEZvbnRzIGRvZXMgbm90IGV4aXN0IG9uIFRleHRcbiAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllclsnYWxsb3dCb2xkRm9udHMnXSAhPSB0aGlzLiRhbGxvd0JvbGRGb250cykge1xuICAgICAgICAgICAgdGhpcy4kYWxsb3dCb2xkRm9udHMgPSB0aGlzLiR0ZXh0TGF5ZXJbJ2FsbG93Qm9sZEZvbnRzJ107XG4gICAgICAgICAgICB0aGlzLnNldFN0eWxlKFwiYWNlX25vYm9sZFwiLCAhdGhpcy4kYWxsb3dCb2xkRm9udHMpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5sYXllckNvbmZpZy5jaGFyYWN0ZXJXaWR0aCA9IHRoaXMuY2hhcmFjdGVyV2lkdGggPSB0aGlzLiR0ZXh0TGF5ZXIuZ2V0Q2hhcmFjdGVyV2lkdGgoKTtcbiAgICAgICAgdGhpcy5sYXllckNvbmZpZy5saW5lSGVpZ2h0ID0gdGhpcy5saW5lSGVpZ2h0ID0gdGhpcy4kdGV4dExheWVyLmdldExpbmVIZWlnaHQoKTtcbiAgICAgICAgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBc3NvY2lhdGVzIHRoZSByZW5kZXJlciB3aXRoIGEgZGlmZmVyZW50IEVkaXRTZXNzaW9uLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRTZXNzaW9uXG4gICAgICogQHBhcmFtIHNlc3Npb24ge0VkaXRTZXNzaW9ufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0U2Vzc2lvbihzZXNzaW9uOiBFZGl0U2Vzc2lvbik6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uKSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uZG9jLm9mZihcImNoYW5nZU5ld0xpbmVNb2RlXCIsIHRoaXMub25DaGFuZ2VOZXdMaW5lTW9kZSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24gPSBzZXNzaW9uO1xuICAgICAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLnNjcm9sbE1hcmdpbi50b3AgJiYgc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSA8PSAwKSB7XG4gICAgICAgICAgICBzZXNzaW9uLnNldFNjcm9sbFRvcCgtdGhpcy5zY3JvbGxNYXJnaW4udG9wKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJG1hcmtlckJhY2suc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQuc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgICAgICB0aGlzLnNlc3Npb24uJHNldEZvbnRNZXRyaWNzKHRoaXMuJGZvbnRNZXRyaWNzKTtcblxuICAgICAgICB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUgPSB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlKClcbiAgICAgICAgdGhpcy5zZXNzaW9uLmRvYy5vbihcImNoYW5nZU5ld0xpbmVNb2RlXCIsIHRoaXMub25DaGFuZ2VOZXdMaW5lTW9kZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJpZ2dlcnMgYSBwYXJ0aWFsIHVwZGF0ZSBvZiB0aGUgdGV4dCwgZnJvbSB0aGUgcmFuZ2UgZ2l2ZW4gYnkgdGhlIHR3byBwYXJhbWV0ZXJzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCB1cGRhdGVMaW5lc1xuICAgICAqIEBwYXJhbSBmaXJzdFJvdyB7bnVtYmVyfSBUaGUgZmlyc3Qgcm93IHRvIHVwZGF0ZS5cbiAgICAgKiBAcGFyYW0gbGFzdFJvdyB7bnVtYmVyfSBUaGUgbGFzdCByb3cgdG8gdXBkYXRlLlxuICAgICAqIEBwYXJhbSBbZm9yY2VdIHtib29sZWFufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgdXBkYXRlTGluZXMoZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyLCBmb3JjZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgaWYgKGxhc3RSb3cgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgbGFzdFJvdyA9IEluZmluaXR5O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLiRjaGFuZ2VkTGluZXMpIHtcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcyA9IHsgZmlyc3RSb3c6IGZpcnN0Um93LCBsYXN0Um93OiBsYXN0Um93IH07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kY2hhbmdlZExpbmVzLmZpcnN0Um93ID4gZmlyc3RSb3cpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRjaGFuZ2VkTGluZXMuZmlyc3RSb3cgPSBmaXJzdFJvdztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93IDwgbGFzdFJvdykge1xuICAgICAgICAgICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93ID0gbGFzdFJvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoZSBjaGFuZ2UgaGFwcGVuZWQgb2Zmc2NyZWVuIGFib3ZlIHVzIHRoZW4gaXQncyBwb3NzaWJsZVxuICAgICAgICAvLyB0aGF0IGEgbmV3IGxpbmUgd3JhcCB3aWxsIGFmZmVjdCB0aGUgcG9zaXRpb24gb2YgdGhlIGxpbmVzIG9uIG91clxuICAgICAgICAvLyBzY3JlZW4gc28gdGhleSBuZWVkIHJlZHJhd24uXG4gICAgICAgIC8vIFRPRE86IGJldHRlciBzb2x1dGlvbiBpcyB0byBub3QgY2hhbmdlIHNjcm9sbCBwb3NpdGlvbiB3aGVuIHRleHQgaXMgY2hhbmdlZCBvdXRzaWRlIG9mIHZpc2libGUgYXJlYVxuICAgICAgICBpZiAodGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3cgPCB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93KSB7XG4gICAgICAgICAgICBpZiAoZm9yY2UpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdyA9IHRoaXMubGF5ZXJDb25maWcubGFzdFJvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLiRjaGFuZ2VkTGluZXMuZmlyc3RSb3cgPiB0aGlzLmxheWVyQ29uZmlnLmxhc3RSb3cpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9MSU5FUyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBvbkNoYW5nZU5ld0xpbmVNb2RlXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgb25DaGFuZ2VOZXdMaW5lTW9kZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfVEVYVCk7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGVFb2xDaGFyKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBvbkNoYW5nZVRhYlNpemVcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyBvbkNoYW5nZVRhYlNpemUoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLiRsb29wKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kbG9vcC5zY2hlZHVsZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX1RFWFQgfCBDSEFOR0VfTUFSS0VSKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLiR0ZXh0TGF5ZXIpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiR0ZXh0TGF5ZXIub25DaGFuZ2VUYWJTaXplKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLm9uQ2hhbmdlVGFiU2l6ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gSSdtIG5vdCBzdXJlIHdoeSB3ZSBjYW4gbm93IGVuZCB1cCBoZXJlLlxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJpZ2dlcnMgYSBmdWxsIHVwZGF0ZSBvZiB0aGUgdGV4dCwgZm9yIGFsbCB0aGUgcm93cy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgdXBkYXRlVGV4dFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgdXBkYXRlVGV4dCgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfVEVYVCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJpZ2dlcnMgYSBmdWxsIHVwZGF0ZSBvZiBhbGwgdGhlIGxheWVycywgZm9yIGFsbCB0aGUgcm93cy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgdXBkYXRlRnVsbFxuICAgICAqIEBwYXJhbSBbZm9yY2VdIHtib29sZWFufSBJZiBgdHJ1ZWAsIGZvcmNlcyB0aGUgY2hhbmdlcyB0aHJvdWdoLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgdXBkYXRlRnVsbChmb3JjZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgaWYgKGZvcmNlKVxuICAgICAgICAgICAgdGhpcy4kcmVuZGVyQ2hhbmdlcyhDSEFOR0VfRlVMTCwgdHJ1ZSk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFVwZGF0ZXMgdGhlIGZvbnQgc2l6ZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgdXBkYXRlRm9udFNpemVcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHVwZGF0ZUZvbnRTaXplKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuY2hlY2tGb3JTaXplQ2hhbmdlcygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgJHVwZGF0ZVNpemVBc3luY1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHJpdmF0ZSAkdXBkYXRlU2l6ZUFzeW5jKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy4kbG9vcC5wZW5kaW5nKSB7XG4gICAgICAgICAgICB0aGlzLiRzaXplLiRkaXJ0eSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm9uUmVzaXplKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcmlnZ2VycyBhIHJlc2l6ZSBvZiB0aGUgcmVuZGVyZXIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBmb3JjZSBJZiBgdHJ1ZWAsIHJlY29tcHV0ZXMgdGhlIHNpemUsIGV2ZW4gaWYgdGhlIGhlaWdodCBhbmQgd2lkdGggaGF2ZW4ndCBjaGFuZ2VkXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGd1dHRlcldpZHRoIFRoZSB3aWR0aCBvZiB0aGUgZ3V0dGVyIGluIHBpeGVsc1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB3aWR0aCBUaGUgd2lkdGggb2YgdGhlIGVkaXRvciBpbiBwaXhlbHNcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gaGVpZ2h0IFRoZSBoaWVoZ3Qgb2YgdGhlIGVkaXRvciwgaW4gcGl4ZWxzXG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqL1xuICAgIHB1YmxpYyBvblJlc2l6ZShmb3JjZT86IGJvb2xlYW4sIGd1dHRlcldpZHRoPzogbnVtYmVyLCB3aWR0aD86IG51bWJlciwgaGVpZ2h0PzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHRoaXMucmVzaXppbmcgPiAyKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBlbHNlIGlmICh0aGlzLnJlc2l6aW5nID4gMClcbiAgICAgICAgICAgIHRoaXMucmVzaXppbmcrKztcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy5yZXNpemluZyA9IGZvcmNlID8gMSA6IDA7XG4gICAgICAgIC8vIGB8fCBlbC5zY3JvbGxIZWlnaHRgIGlzIHJlcXVpcmVkIGZvciBvdXRvc2l6aW5nIGVkaXRvcnMgb24gaWVcbiAgICAgICAgLy8gd2hlcmUgZWxlbWVudHMgd2l0aCBjbGllbnRIZWlnaHQgPSAwIGFsc29lIGhhdmUgY2xpZW50V2lkdGggPSAwXG4gICAgICAgIHZhciBlbCA9IHRoaXMuY29udGFpbmVyO1xuICAgICAgICBpZiAoIWhlaWdodClcbiAgICAgICAgICAgIGhlaWdodCA9IGVsLmNsaWVudEhlaWdodCB8fCBlbC5zY3JvbGxIZWlnaHQ7XG4gICAgICAgIGlmICghd2lkdGgpXG4gICAgICAgICAgICB3aWR0aCA9IGVsLmNsaWVudFdpZHRoIHx8IGVsLnNjcm9sbFdpZHRoO1xuICAgICAgICB2YXIgY2hhbmdlcyA9IHRoaXMuJHVwZGF0ZUNhY2hlZFNpemUoZm9yY2UsIGd1dHRlcldpZHRoLCB3aWR0aCwgaGVpZ2h0KTtcblxuXG4gICAgICAgIGlmICghdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCB8fCAoIXdpZHRoICYmICFoZWlnaHQpKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucmVzaXppbmcgPSAwO1xuXG4gICAgICAgIGlmIChmb3JjZSlcbiAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLiRwYWRkaW5nID0gbnVsbDtcblxuICAgICAgICBpZiAoZm9yY2UpXG4gICAgICAgICAgICB0aGlzLiRyZW5kZXJDaGFuZ2VzKGNoYW5nZXMgfCB0aGlzLiRjaGFuZ2VzLCB0cnVlKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShjaGFuZ2VzIHwgdGhpcy4kY2hhbmdlcyk7XG5cbiAgICAgICAgaWYgKHRoaXMucmVzaXppbmcpXG4gICAgICAgICAgICB0aGlzLnJlc2l6aW5nID0gMDtcbiAgICB9XG5cbiAgICBwcml2YXRlICR1cGRhdGVDYWNoZWRTaXplKGZvcmNlOiBib29sZWFuLCBndXR0ZXJXaWR0aDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGhlaWdodCAtPSAodGhpcy4kZXh0cmFIZWlnaHQgfHwgMCk7XG4gICAgICAgIHZhciBjaGFuZ2VzID0gMDtcbiAgICAgICAgdmFyIHNpemUgPSB0aGlzLiRzaXplO1xuICAgICAgICB2YXIgb2xkU2l6ZSA9IHtcbiAgICAgICAgICAgIHdpZHRoOiBzaXplLndpZHRoLFxuICAgICAgICAgICAgaGVpZ2h0OiBzaXplLmhlaWdodCxcbiAgICAgICAgICAgIHNjcm9sbGVySGVpZ2h0OiBzaXplLnNjcm9sbGVySGVpZ2h0LFxuICAgICAgICAgICAgc2Nyb2xsZXJXaWR0aDogc2l6ZS5zY3JvbGxlcldpZHRoXG4gICAgICAgIH07XG4gICAgICAgIGlmIChoZWlnaHQgJiYgKGZvcmNlIHx8IHNpemUuaGVpZ2h0ICE9IGhlaWdodCkpIHtcbiAgICAgICAgICAgIHNpemUuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgICAgICAgICAgY2hhbmdlcyB8PSBDSEFOR0VfU0laRTtcblxuICAgICAgICAgICAgc2l6ZS5zY3JvbGxlckhlaWdodCA9IHNpemUuaGVpZ2h0O1xuICAgICAgICAgICAgaWYgKHRoaXMuJGhvcml6U2Nyb2xsKVxuICAgICAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJIZWlnaHQgLT0gdGhpcy5zY3JvbGxCYXJILmhlaWdodDtcblxuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJWLmVsZW1lbnQuc3R5bGUuYm90dG9tID0gdGhpcy5zY3JvbGxCYXJILmhlaWdodCArIFwicHhcIjtcblxuICAgICAgICAgICAgY2hhbmdlcyA9IGNoYW5nZXMgfCBDSEFOR0VfU0NST0xMO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHdpZHRoICYmIChmb3JjZSB8fCBzaXplLndpZHRoICE9IHdpZHRoKSkge1xuICAgICAgICAgICAgY2hhbmdlcyB8PSBDSEFOR0VfU0laRTtcbiAgICAgICAgICAgIHNpemUud2lkdGggPSB3aWR0aDtcblxuICAgICAgICAgICAgaWYgKGd1dHRlcldpZHRoID09IG51bGwpXG4gICAgICAgICAgICAgICAgZ3V0dGVyV2lkdGggPSB0aGlzLiRzaG93R3V0dGVyID8gdGhpcy4kZ3V0dGVyLm9mZnNldFdpZHRoIDogMDtcblxuICAgICAgICAgICAgdGhpcy5ndXR0ZXJXaWR0aCA9IGd1dHRlcldpZHRoO1xuXG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhckguZWxlbWVudC5zdHlsZS5sZWZ0ID1cbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbGVyLnN0eWxlLmxlZnQgPSBndXR0ZXJXaWR0aCArIFwicHhcIjtcbiAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJXaWR0aCA9IE1hdGgubWF4KDAsIHdpZHRoIC0gZ3V0dGVyV2lkdGggLSB0aGlzLnNjcm9sbEJhclYud2lkdGgpO1xuXG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhckguZWxlbWVudC5zdHlsZS5yaWdodCA9XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxlci5zdHlsZS5yaWdodCA9IHRoaXMuc2Nyb2xsQmFyVi53aWR0aCArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsZXIuc3R5bGUuYm90dG9tID0gdGhpcy5zY3JvbGxCYXJILmhlaWdodCArIFwicHhcIjtcblxuICAgICAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbiAmJiB0aGlzLnNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKSAmJiB0aGlzLmFkanVzdFdyYXBMaW1pdCgpIHx8IGZvcmNlKVxuICAgICAgICAgICAgICAgIGNoYW5nZXMgfD0gQ0hBTkdFX0ZVTEw7XG4gICAgICAgIH1cblxuICAgICAgICBzaXplLiRkaXJ0eSA9ICF3aWR0aCB8fCAhaGVpZ2h0O1xuXG4gICAgICAgIGlmIChjaGFuZ2VzKSB7XG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIEBldmVudCByZXNpemVcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwicmVzaXplXCIsIG9sZFNpemUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNoYW5nZXM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkd1dHRlclJlc2l6ZSgpIHtcbiAgICAgICAgdmFyIGd1dHRlcldpZHRoID0gdGhpcy4kc2hvd0d1dHRlciA/IHRoaXMuJGd1dHRlci5vZmZzZXRXaWR0aCA6IDA7XG4gICAgICAgIGlmIChndXR0ZXJXaWR0aCAhPSB0aGlzLmd1dHRlcldpZHRoKVxuICAgICAgICAgICAgdGhpcy4kY2hhbmdlcyB8PSB0aGlzLiR1cGRhdGVDYWNoZWRTaXplKHRydWUsIGd1dHRlcldpZHRoLCB0aGlzLiRzaXplLndpZHRoLCB0aGlzLiRzaXplLmhlaWdodCk7XG5cbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi5nZXRVc2VXcmFwTW9kZSgpICYmIHRoaXMuYWRqdXN0V3JhcExpbWl0KCkpIHtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHRoaXMuJHNpemUuJGRpcnR5KSB7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJGNvbXB1dGVMYXllckNvbmZpZygpO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfTUFSS0VSKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkanVzdHMgdGhlIHdyYXAgbGltaXQsIHdoaWNoIGlzIHRoZSBudW1iZXIgb2YgY2hhcmFjdGVycyB0aGF0IGNhbiBmaXQgd2l0aGluIHRoZSB3aWR0aCBvZiB0aGUgZWRpdCBhcmVhIG9uIHNjcmVlbi5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgYWRqdXN0V3JhcExpbWl0XG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBwdWJsaWMgYWRqdXN0V3JhcExpbWl0KCk6IGJvb2xlYW4ge1xuICAgICAgICB2YXIgYXZhaWxhYmxlV2lkdGggPSB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSB0aGlzLiRwYWRkaW5nICogMjtcbiAgICAgICAgdmFyIGxpbWl0ID0gTWF0aC5mbG9vcihhdmFpbGFibGVXaWR0aCAvIHRoaXMuY2hhcmFjdGVyV2lkdGgpO1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmFkanVzdFdyYXBMaW1pdChsaW1pdCwgdGhpcy4kc2hvd1ByaW50TWFyZ2luICYmIHRoaXMuJHByaW50TWFyZ2luQ29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gaGF2ZSBhbiBhbmltYXRlZCBzY3JvbGwgb3Igbm90LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRBbmltYXRlZFNjcm9sbFxuICAgICAqIEBwYXJhbSBzaG91bGRBbmltYXRlIHtib29sZWFufSBTZXQgdG8gYHRydWVgIHRvIHNob3cgYW5pbWF0ZWQgc2Nyb2xscy5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldEFuaW1hdGVkU2Nyb2xsKHNob3VsZEFuaW1hdGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJhbmltYXRlZFNjcm9sbFwiLCBzaG91bGRBbmltYXRlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHdoZXRoZXIgYW4gYW5pbWF0ZWQgc2Nyb2xsIGhhcHBlbnMgb3Igbm90LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRBbmltYXRlZFNjcm9sbFxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0QW5pbWF0ZWRTY3JvbGwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRhbmltYXRlZFNjcm9sbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyBpbnZpc2libGUgY2hhcmFjdGVycyBvciBub3QuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFNob3dJbnZpc2libGVzXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93SW52aXNpYmxlcyBTZXQgdG8gYHRydWVgIHRvIHNob3cgaW52aXNpYmxlc1xuICAgICAqL1xuICAgIHNldFNob3dJbnZpc2libGVzKHNob3dJbnZpc2libGVzOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwic2hvd0ludmlzaWJsZXNcIiwgc2hvd0ludmlzaWJsZXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciBpbnZpc2libGUgY2hhcmFjdGVycyBhcmUgYmVpbmcgc2hvd24gb3Igbm90LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRTaG93SW52aXNpYmxlc1xuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd0ludmlzaWJsZXMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInNob3dJbnZpc2libGVzXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgZ2V0RGlzcGxheUluZGVudEd1aWRlc1xuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0RGlzcGxheUluZGVudEd1aWRlcygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiZGlzcGxheUluZGVudEd1aWRlc1wiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHNldERpc3BsYXlJbmRlbnRHdWlkZXNcbiAgICAgKiBAcGFyYW0gZGlzcGxheUluZGVudEd1aWRlcyB7Ym9vbGVhbn1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldERpc3BsYXlJbmRlbnRHdWlkZXMoZGlzcGxheUluZGVudEd1aWRlczogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImRpc3BsYXlJbmRlbnRHdWlkZXNcIiwgZGlzcGxheUluZGVudEd1aWRlcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgdGhlIHByaW50IG1hcmdpbiBvciBub3QuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFNob3dQcmludE1hcmdpblxuICAgICAqIEBwYXJhbSBzaG93UHJpbnRNYXJnaW4ge2Jvb2xlYW59IFNldCB0byBgdHJ1ZWAgdG8gc2hvdyB0aGUgcHJpbnQgbWFyZ2luLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0U2hvd1ByaW50TWFyZ2luKHNob3dQcmludE1hcmdpbjogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInNob3dQcmludE1hcmdpblwiLCBzaG93UHJpbnRNYXJnaW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciB0aGUgcHJpbnQgbWFyZ2luIGlzIGJlaW5nIHNob3duIG9yIG5vdC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0U2hvd1ByaW50TWFyZ2luXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93UHJpbnRNYXJnaW4oKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInNob3dQcmludE1hcmdpblwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBjb2x1bW4gZGVmaW5pbmcgd2hlcmUgdGhlIHByaW50IG1hcmdpbiBzaG91bGQgYmUuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFByaW50TWFyZ2luQ29sdW1uXG4gICAgICogQHBhcmFtIHByaW50TWFyZ2luQ29sdW1uIHtudW1iZXJ9IFNwZWNpZmllcyB0aGUgbmV3IHByaW50IG1hcmdpbi5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldFByaW50TWFyZ2luQ29sdW1uKHByaW50TWFyZ2luQ29sdW1uOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJwcmludE1hcmdpbkNvbHVtblwiLCBwcmludE1hcmdpbkNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY29sdW1uIG51bWJlciBvZiB3aGVyZSB0aGUgcHJpbnQgbWFyZ2luIGlzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRQcmludE1hcmdpbkNvbHVtblxuICAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAgKi9cbiAgICBnZXRQcmludE1hcmdpbkNvbHVtbigpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJwcmludE1hcmdpbkNvbHVtblwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgZ3V0dGVyIGlzIGJlaW5nIHNob3duLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRTaG93R3V0dGVyXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93R3V0dGVyKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzaG93R3V0dGVyXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IHRoZSBndXR0ZXIgb3Igbm90LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRTaG93R3V0dGVyXG4gICAgICogQHBhcmFtIHNob3dHdXR0ZXIge2Jvb2xlYW59IFNldCB0byBgdHJ1ZWAgdG8gc2hvdyB0aGUgZ3V0dGVyXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRTaG93R3V0dGVyKHNob3dHdXR0ZXI6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0T3B0aW9uKFwic2hvd0d1dHRlclwiLCBzaG93R3V0dGVyKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIGdldEZhZGVGb2xkV2lkZ2V0c1xuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0RmFkZUZvbGRXaWRnZXRzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJmYWRlRm9sZFdpZGdldHNcIilcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHNldEZhZGVGb2xkV2lkZ2V0c1xuICAgICAqIEBwYXJhbSBmYWRlRm9sZFdpZGdldHMge2Jvb2xlYW59XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRGYWRlRm9sZFdpZGdldHMoZmFkZUZvbGRXaWRnZXRzOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiZmFkZUZvbGRXaWRnZXRzXCIsIGZhZGVGb2xkV2lkZ2V0cyk7XG4gICAgfVxuXG4gICAgc2V0SGlnaGxpZ2h0R3V0dGVyTGluZShoaWdobGlnaHRHdXR0ZXJMaW5lOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiaGlnaGxpZ2h0R3V0dGVyTGluZVwiLCBoaWdobGlnaHRHdXR0ZXJMaW5lKTtcbiAgICB9XG5cbiAgICBnZXRIaWdobGlnaHRHdXR0ZXJMaW5lKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJoaWdobGlnaHRHdXR0ZXJMaW5lXCIpO1xuICAgIH1cblxuICAgICR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0KCkge1xuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zO1xuICAgICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5sYXllckNvbmZpZy5saW5lSGVpZ2h0O1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmdldFVzZVdyYXBNb2RlKCkpIHtcbiAgICAgICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLnNlc3Npb24uZ2V0U2VsZWN0aW9uKCkuZ2V0Q3Vyc29yKCk7XG4gICAgICAgICAgICBjdXJzb3IuY29sdW1uID0gMDtcbiAgICAgICAgICAgIHBvcyA9IHRoaXMuJGN1cnNvckxheWVyLmdldFBpeGVsUG9zaXRpb24oY3Vyc29yLCB0cnVlKTtcbiAgICAgICAgICAgIGhlaWdodCAqPSB0aGlzLnNlc3Npb24uZ2V0Um93TGVuZ3RoKGN1cnNvci5yb3cpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuc3R5bGUudG9wID0gcG9zLnRvcCAtIHRoaXMubGF5ZXJDb25maWcub2Zmc2V0ICsgXCJweFwiO1xuICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0LnN0eWxlLmhlaWdodCA9IGhlaWdodCArIFwicHhcIjtcbiAgICB9XG5cbiAgICAkdXBkYXRlUHJpbnRNYXJnaW4oKSB7XG4gICAgICAgIGlmICghdGhpcy4kc2hvd1ByaW50TWFyZ2luICYmICF0aGlzLiRwcmludE1hcmdpbkVsKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmICghdGhpcy4kcHJpbnRNYXJnaW5FbCkge1xuICAgICAgICAgICAgdmFyIGNvbnRhaW5lckVsOiBIVE1MRGl2RWxlbWVudCA9IDxIVE1MRGl2RWxlbWVudD5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgY29udGFpbmVyRWwuY2xhc3NOYW1lID0gXCJhY2VfbGF5ZXIgYWNlX3ByaW50LW1hcmdpbi1sYXllclwiO1xuICAgICAgICAgICAgdGhpcy4kcHJpbnRNYXJnaW5FbCA9IDxIVE1MRGl2RWxlbWVudD5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgdGhpcy4kcHJpbnRNYXJnaW5FbC5jbGFzc05hbWUgPSBcImFjZV9wcmludC1tYXJnaW5cIjtcbiAgICAgICAgICAgIGNvbnRhaW5lckVsLmFwcGVuZENoaWxkKHRoaXMuJHByaW50TWFyZ2luRWwpO1xuICAgICAgICAgICAgdGhpcy5jb250ZW50Lmluc2VydEJlZm9yZShjb250YWluZXJFbCwgdGhpcy5jb250ZW50LmZpcnN0Q2hpbGQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHN0eWxlID0gdGhpcy4kcHJpbnRNYXJnaW5FbC5zdHlsZTtcbiAgICAgICAgc3R5bGUubGVmdCA9ICgodGhpcy5jaGFyYWN0ZXJXaWR0aCAqIHRoaXMuJHByaW50TWFyZ2luQ29sdW1uKSArIHRoaXMuJHBhZGRpbmcpICsgXCJweFwiO1xuICAgICAgICBzdHlsZS52aXNpYmlsaXR5ID0gdGhpcy4kc2hvd1ByaW50TWFyZ2luID8gXCJ2aXNpYmxlXCIgOiBcImhpZGRlblwiO1xuXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24gJiYgdGhpcy5zZXNzaW9uWyckd3JhcCddID09IC0xKVxuICAgICAgICAgICAgdGhpcy5hZGp1c3RXcmFwTGltaXQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSByb290IGVsZW1lbnQgY29udGFpbmluZyB0aGlzIHJlbmRlcmVyLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRDb250YWluZXJFbGVtZW50XG4gICAgICogQHJldHVybiB7SFRNTEVsZW1lbnR9XG4gICAgICovXG4gICAgZ2V0Q29udGFpbmVyRWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRhaW5lcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBlbGVtZW50IHRoYXQgdGhlIG1vdXNlIGV2ZW50cyBhcmUgYXR0YWNoZWQgdG9cbiAgICAqIEByZXR1cm4ge0RPTUVsZW1lbnR9XG4gICAgKiovXG4gICAgZ2V0TW91c2VFdmVudFRhcmdldCgpOiBIVE1MRGl2RWxlbWVudCB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRlbnQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgZWxlbWVudCB0byB3aGljaCB0aGUgaGlkZGVuIHRleHQgYXJlYSBpcyBhZGRlZC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0VGV4dEFyZWFDb250YWluZXJcbiAgICAgKiBAcmV0dXJuIHtIVE1MRWxlbWVudH1cbiAgICAgKi9cbiAgICBnZXRUZXh0QXJlYUNvbnRhaW5lcigpOiBIVE1MRWxlbWVudCB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRhaW5lcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlIHRleHQgaW5wdXQgb3ZlciB0aGUgY3Vyc29yLlxuICAgICAqIFJlcXVpcmVkIGZvciBpT1MgYW5kIElNRS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgJG1vdmVUZXh0QXJlYVRvQ3Vyc29yXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHB1YmxpYyAkbW92ZVRleHRBcmVhVG9DdXJzb3IoKTogdm9pZCB7XG5cbiAgICAgICAgaWYgKCF0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvcikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBjb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuICAgICAgICB2YXIgcG9zVG9wID0gdGhpcy4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zLnRvcDtcbiAgICAgICAgdmFyIHBvc0xlZnQgPSB0aGlzLiRjdXJzb3JMYXllci4kcGl4ZWxQb3MubGVmdDtcbiAgICAgICAgcG9zVG9wIC09IGNvbmZpZy5vZmZzZXQ7XG5cbiAgICAgICAgdmFyIGggPSB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIGlmIChwb3NUb3AgPCAwIHx8IHBvc1RvcCA+IGNvbmZpZy5oZWlnaHQgLSBoKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciB3ID0gdGhpcy5jaGFyYWN0ZXJXaWR0aDtcbiAgICAgICAgaWYgKHRoaXMuJGNvbXBvc2l0aW9uKSB7XG4gICAgICAgICAgICB2YXIgdmFsID0gdGhpcy50ZXh0YXJlYS52YWx1ZS5yZXBsYWNlKC9eXFx4MDErLywgXCJcIik7XG4gICAgICAgICAgICB3ICo9ICh0aGlzLnNlc3Npb24uJGdldFN0cmluZ1NjcmVlbldpZHRoKHZhbClbMF0gKyAyKTtcbiAgICAgICAgICAgIGggKz0gMjtcbiAgICAgICAgICAgIHBvc1RvcCAtPSAxO1xuICAgICAgICB9XG4gICAgICAgIHBvc0xlZnQgLT0gdGhpcy5zY3JvbGxMZWZ0O1xuICAgICAgICBpZiAocG9zTGVmdCA+IHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCAtIHcpXG4gICAgICAgICAgICBwb3NMZWZ0ID0gdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gdztcblxuICAgICAgICBwb3NMZWZ0IC09IHRoaXMuc2Nyb2xsQmFyVi53aWR0aDtcblxuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLmhlaWdodCA9IGggKyBcInB4XCI7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUud2lkdGggPSB3ICsgXCJweFwiO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLnJpZ2h0ID0gTWF0aC5tYXgoMCwgdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gcG9zTGVmdCAtIHcpICsgXCJweFwiO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLmJvdHRvbSA9IE1hdGgubWF4KDAsIHRoaXMuJHNpemUuaGVpZ2h0IC0gcG9zVG9wIC0gaCkgKyBcInB4XCI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGZpcnN0IHZpc2libGUgcm93LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRGaXJzdFZpc2libGVSb3dcbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgICovXG4gICAgZ2V0Rmlyc3RWaXNpYmxlUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBmaXJzdCBmdWxseSB2aXNpYmxlIHJvdy4gXCJGdWxseVwiIGhlcmUgbWVhbnMgdGhhdCB0aGUgY2hhcmFjdGVycyBpbiB0aGUgcm93IGFyZSBub3QgdHJ1bmNhdGVkOyB0aGF0IHRoZSB0b3AgYW5kIHRoZSBib3R0b20gb2YgdGhlIHJvdyBhcmUgb24gdGhlIHNjcmVlbi5cbiAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAqKi9cbiAgICBnZXRGaXJzdEZ1bGx5VmlzaWJsZVJvdygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdyArICh0aGlzLmxheWVyQ29uZmlnLm9mZnNldCA9PT0gMCA/IDAgOiAxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbGFzdCBmdWxseSB2aXNpYmxlIHJvdy4gXCJGdWxseVwiIGhlcmUgbWVhbnMgdGhhdCB0aGUgY2hhcmFjdGVycyBpbiB0aGUgcm93IGFyZSBub3QgdHJ1bmNhdGVkOyB0aGF0IHRoZSB0b3AgYW5kIHRoZSBib3R0b20gb2YgdGhlIHJvdyBhcmUgb24gdGhlIHNjcmVlbi5cbiAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAqKi9cbiAgICBnZXRMYXN0RnVsbHlWaXNpYmxlUm93KCk6IG51bWJlciB7XG4gICAgICAgIHZhciBmbGludCA9IE1hdGguZmxvb3IoKHRoaXMubGF5ZXJDb25maWcuaGVpZ2h0ICsgdGhpcy5sYXllckNvbmZpZy5vZmZzZXQpIC8gdGhpcy5sYXllckNvbmZpZy5saW5lSGVpZ2h0KTtcbiAgICAgICAgcmV0dXJuIHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3cgLSAxICsgZmxpbnQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGxhc3QgdmlzaWJsZSByb3cuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldExhc3RWaXNpYmxlUm93XG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqL1xuICAgIGdldExhc3RWaXNpYmxlUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmxheWVyQ29uZmlnLmxhc3RSb3c7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0cyB0aGUgcGFkZGluZy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0UGFkZGluZ1xuICAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAgKi9cbiAgICBnZXRQYWRkaW5nKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLiRwYWRkaW5nO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHBhZGRpbmcgZm9yIGFsbCB0aGUgbGF5ZXJzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRQYWRkaW5nXG4gICAgICogQHBhcmFtIHBhZGRpbmcge251bWJlcn0gQSBuZXcgcGFkZGluZyB2YWx1ZSAoaW4gcGl4ZWxzKS5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldFBhZGRpbmcocGFkZGluZzogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmICh0eXBlb2YgcGFkZGluZyAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJwYWRkaW5nIG11c3QgYmUgYSBudW1iZXJcIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kcGFkZGluZyA9IHBhZGRpbmc7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgICAgICB0aGlzLiR1cGRhdGVQcmludE1hcmdpbigpO1xuICAgIH1cblxuICAgIHNldFNjcm9sbE1hcmdpbih0b3A6IG51bWJlciwgYm90dG9tOiBudW1iZXIsIGxlZnQ6IG51bWJlciwgcmlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB2YXIgc20gPSB0aGlzLnNjcm9sbE1hcmdpbjtcbiAgICAgICAgc20udG9wID0gdG9wIHwgMDtcbiAgICAgICAgc20uYm90dG9tID0gYm90dG9tIHwgMDtcbiAgICAgICAgc20ucmlnaHQgPSByaWdodCB8IDA7XG4gICAgICAgIHNtLmxlZnQgPSBsZWZ0IHwgMDtcbiAgICAgICAgc20udiA9IHNtLnRvcCArIHNtLmJvdHRvbTtcbiAgICAgICAgc20uaCA9IHNtLmxlZnQgKyBzbS5yaWdodDtcbiAgICAgICAgaWYgKHNtLnRvcCAmJiB0aGlzLnNjcm9sbFRvcCA8PSAwICYmIHRoaXMuc2Vzc2lvbilcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AoLXNtLnRvcCk7XG4gICAgICAgIHRoaXMudXBkYXRlRnVsbCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIgaXMgc2V0IHRvIGJlIGFsd2F5cyB2aXNpYmxlLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlKCk6IGJvb2xlYW4ge1xuICAgICAgICAvLyBGSVhNRT9cbiAgICAgICAgcmV0dXJuIHRoaXMuJGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IHRoZSBob3Jpem9udGFsIHNjcm9sbGJhciBvciBub3QuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlXG4gICAgICogQHBhcmFtIGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIHtib29sZWFufSBTZXQgdG8gYHRydWVgIHRvIG1ha2UgdGhlIGhvcml6b250YWwgc2Nyb2xsIGJhciB2aXNpYmxlLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUoaFNjcm9sbEJhckFsd2F5c1Zpc2libGU6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZVwiLCBoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB3aGV0aGVyIHRoZSB2ZXJ0aWNhbCBzY3JvbGxiYXIgaXMgc2V0IHRvIGJlIGFsd2F5cyB2aXNpYmxlLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy4kdlNjcm9sbEJhckFsd2F5c1Zpc2libGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgdGhlIHZlcnRpY2FsIHNjcm9sbGJhciBvciBub3QuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbHdheXNWaXNpYmxlIFNldCB0byBgdHJ1ZWAgdG8gbWFrZSB0aGUgdmVydGljYWwgc2Nyb2xsIGJhciB2aXNpYmxlXG4gICAgICovXG4gICAgc2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUoYWx3YXlzVmlzaWJsZTogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInZTY3JvbGxCYXJBbHdheXNWaXNpYmxlXCIsIGFsd2F5c1Zpc2libGUpO1xuICAgIH1cblxuICAgIHByaXZhdGUgJHVwZGF0ZVNjcm9sbEJhclYoKTogdm9pZCB7XG4gICAgICAgIHZhciBzY3JvbGxIZWlnaHQgPSB0aGlzLmxheWVyQ29uZmlnLm1heEhlaWdodDtcbiAgICAgICAgdmFyIHNjcm9sbGVySGVpZ2h0ID0gdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodDtcbiAgICAgICAgaWYgKCF0aGlzLiRtYXhMaW5lcyAmJiB0aGlzLiRzY3JvbGxQYXN0RW5kKSB7XG4gICAgICAgICAgICBzY3JvbGxIZWlnaHQgLT0gKHNjcm9sbGVySGVpZ2h0IC0gdGhpcy5saW5lSGVpZ2h0KSAqIHRoaXMuJHNjcm9sbFBhc3RFbmQ7XG4gICAgICAgICAgICBpZiAodGhpcy5zY3JvbGxUb3AgPiBzY3JvbGxIZWlnaHQgLSBzY3JvbGxlckhlaWdodCkge1xuICAgICAgICAgICAgICAgIHNjcm9sbEhlaWdodCA9IHRoaXMuc2Nyb2xsVG9wICsgc2Nyb2xsZXJIZWlnaHQ7XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJWLnNjcm9sbFRvcCA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zY3JvbGxCYXJWLnNldFNjcm9sbEhlaWdodChzY3JvbGxIZWlnaHQgKyB0aGlzLnNjcm9sbE1hcmdpbi52KTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJWLnNldFNjcm9sbFRvcCh0aGlzLnNjcm9sbFRvcCArIHRoaXMuc2Nyb2xsTWFyZ2luLnRvcCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdXBkYXRlU2Nyb2xsQmFySCgpIHtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJILnNldFNjcm9sbFdpZHRoKHRoaXMubGF5ZXJDb25maWcud2lkdGggKyAyICogdGhpcy4kcGFkZGluZyArIHRoaXMuc2Nyb2xsTWFyZ2luLmgpO1xuICAgICAgICB0aGlzLnNjcm9sbEJhckguc2V0U2Nyb2xsTGVmdCh0aGlzLnNjcm9sbExlZnQgKyB0aGlzLnNjcm9sbE1hcmdpbi5sZWZ0KTtcbiAgICB9XG5cbiAgICBmcmVlemUoKSB7XG4gICAgICAgIHRoaXMuJGZyb3plbiA9IHRydWU7XG4gICAgfVxuXG4gICAgdW5mcmVlemUoKSB7XG4gICAgICAgIHRoaXMuJGZyb3plbiA9IGZhbHNlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgJHJlbmRlckNoYW5nZXNcbiAgICAgKiBAcGFyYW0gY2hhbmdlcyB7bnVtYmVyfVxuICAgICAqIEBwYXJhbSBmb3JjZSB7Ym9vbGVhbn1cbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlICRyZW5kZXJDaGFuZ2VzKGNoYW5nZXM6IG51bWJlciwgZm9yY2U6IGJvb2xlYW4pOiBudW1iZXIge1xuXG4gICAgICAgIGlmICh0aGlzLiRjaGFuZ2VzKSB7XG4gICAgICAgICAgICBjaGFuZ2VzIHw9IHRoaXMuJGNoYW5nZXM7XG4gICAgICAgICAgICB0aGlzLiRjaGFuZ2VzID0gMDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoKCF0aGlzLnNlc3Npb24gfHwgIXRoaXMuY29udGFpbmVyLm9mZnNldFdpZHRoIHx8IHRoaXMuJGZyb3plbikgfHwgKCFjaGFuZ2VzICYmICFmb3JjZSkpIHtcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZXMgfD0gY2hhbmdlcztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy4kc2l6ZS4kZGlydHkpIHtcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZXMgfD0gY2hhbmdlcztcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm9uUmVzaXplKHRydWUpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghdGhpcy5saW5lSGVpZ2h0KSB7XG4gICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuY2hlY2tGb3JTaXplQ2hhbmdlcygpO1xuICAgICAgICB9XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBiZWZvcmVSZW5kZXJcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImJlZm9yZVJlbmRlclwiKTtcblxuICAgICAgICB2YXIgY29uZmlnID0gdGhpcy5sYXllckNvbmZpZztcbiAgICAgICAgLy8gdGV4dCwgc2Nyb2xsaW5nIGFuZCByZXNpemUgY2hhbmdlcyBjYW4gY2F1c2UgdGhlIHZpZXcgcG9ydCBzaXplIHRvIGNoYW5nZVxuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9GVUxMIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX1NJWkUgfHxcbiAgICAgICAgICAgIGNoYW5nZXMgJiBDSEFOR0VfVEVYVCB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9MSU5FUyB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9TQ1JPTEwgfHxcbiAgICAgICAgICAgIGNoYW5nZXMgJiBDSEFOR0VfSF9TQ1JPTExcbiAgICAgICAgKSB7XG4gICAgICAgICAgICBjaGFuZ2VzIHw9IHRoaXMuJGNvbXB1dGVMYXllckNvbmZpZygpO1xuICAgICAgICAgICAgLy8gSWYgYSBjaGFuZ2UgaXMgbWFkZSBvZmZzY3JlZW4gYW5kIHdyYXBNb2RlIGlzIG9uLCB0aGVuIHRoZSBvbnNjcmVlblxuICAgICAgICAgICAgLy8gbGluZXMgbWF5IGhhdmUgYmVlbiBwdXNoZWQgZG93bi4gSWYgc28sIHRoZSBmaXJzdCBzY3JlZW4gcm93IHdpbGwgbm90XG4gICAgICAgICAgICAvLyBoYXZlIGNoYW5nZWQsIGJ1dCB0aGUgZmlyc3QgYWN0dWFsIHJvdyB3aWxsLiBJbiB0aGF0IGNhc2UsIGFkanVzdCBcbiAgICAgICAgICAgIC8vIHNjcm9sbFRvcCBzbyB0aGF0IHRoZSBjdXJzb3IgYW5kIG9uc2NyZWVuIGNvbnRlbnQgc3RheXMgaW4gdGhlIHNhbWUgcGxhY2UuXG4gICAgICAgICAgICBpZiAoY29uZmlnLmZpcnN0Um93ICE9IHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3cgJiYgY29uZmlnLmZpcnN0Um93U2NyZWVuID09IHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3dTY3JlZW4pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbFRvcCA9IHRoaXMuc2Nyb2xsVG9wICsgKGNvbmZpZy5maXJzdFJvdyAtIHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3cpICogdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICAgICAgICAgIGNoYW5nZXMgPSBjaGFuZ2VzIHwgQ0hBTkdFX1NDUk9MTDtcbiAgICAgICAgICAgICAgICBjaGFuZ2VzIHw9IHRoaXMuJGNvbXB1dGVMYXllckNvbmZpZygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uZmlnID0gdGhpcy5sYXllckNvbmZpZztcbiAgICAgICAgICAgIC8vIHVwZGF0ZSBzY3JvbGxiYXIgZmlyc3QgdG8gbm90IGxvc2Ugc2Nyb2xsIHBvc2l0aW9uIHdoZW4gZ3V0dGVyIGNhbGxzIHJlc2l6ZVxuICAgICAgICAgICAgdGhpcy4kdXBkYXRlU2Nyb2xsQmFyVigpO1xuICAgICAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfSF9TQ1JPTEwpXG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlU2Nyb2xsQmFySCgpO1xuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuZWxlbWVudC5zdHlsZS5tYXJnaW5Ub3AgPSAoLWNvbmZpZy5vZmZzZXQpICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLm1hcmdpblRvcCA9ICgtY29uZmlnLm9mZnNldCkgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUud2lkdGggPSBjb25maWcud2lkdGggKyAyICogdGhpcy4kcGFkZGluZyArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5oZWlnaHQgPSBjb25maWcubWluSGVpZ2h0ICsgXCJweFwiO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaG9yaXpvbnRhbCBzY3JvbGxpbmdcbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfSF9TQ1JPTEwpIHtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5tYXJnaW5MZWZ0ID0gLXRoaXMuc2Nyb2xsTGVmdCArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsZXIuY2xhc3NOYW1lID0gdGhpcy5zY3JvbGxMZWZ0IDw9IDAgPyBcImFjZV9zY3JvbGxlclwiIDogXCJhY2Vfc2Nyb2xsZXIgYWNlX3Njcm9sbC1sZWZ0XCI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBmdWxsXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0ZVTEwpIHtcbiAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIGlmICh0aGlzLiRzaG93R3V0dGVyKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRjdXJzb3JMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgICAgICAgICB0aGlzLiRoaWdobGlnaHRHdXR0ZXJMaW5lICYmIHRoaXMuJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQoKTtcblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBAZXZlbnQgYWZ0ZXJSZW5kZXJcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiYWZ0ZXJSZW5kZXJcIik7XG5cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHNjcm9sbGluZ1xuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9TQ1JPTEwpIHtcbiAgICAgICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX1RFWFQgfHwgY2hhbmdlcyAmIENIQU5HRV9MSU5FUylcbiAgICAgICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnNjcm9sbExpbmVzKGNvbmZpZyk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyQmFjay51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckZyb250LnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRoaWdobGlnaHRHdXR0ZXJMaW5lICYmIHRoaXMuJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQoKTtcbiAgICAgICAgICAgIHRoaXMuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIEBldmVudCBhZnRlclJlbmRlclxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJhZnRlclJlbmRlclwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX1RFWFQpIHtcbiAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIGlmICh0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoYW5nZXMgJiBDSEFOR0VfTElORVMpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiR1cGRhdGVMaW5lcygpIHx8IChjaGFuZ2VzICYgQ0hBTkdFX0dVVFRFUikgJiYgdGhpcy4kc2hvd0d1dHRlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaGFuZ2VzICYgQ0hBTkdFX1RFWFQgfHwgY2hhbmdlcyAmIENIQU5HRV9HVVRURVIpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfQ1VSU09SKSB7XG4gICAgICAgICAgICB0aGlzLiRjdXJzb3JMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgICAgICAgICB0aGlzLiRoaWdobGlnaHRHdXR0ZXJMaW5lICYmIHRoaXMuJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjaGFuZ2VzICYgKENIQU5HRV9NQVJLRVIgfCBDSEFOR0VfTUFSS0VSX0ZST05UKSkge1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2hhbmdlcyAmIChDSEFOR0VfTUFSS0VSIHwgQ0hBTkdFX01BUktFUl9CQUNLKSkge1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyQmFjay51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgYWZ0ZXJSZW5kZXJcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImFmdGVyUmVuZGVyXCIpO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGF1dG9zaXplKCkge1xuICAgICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5zZXNzaW9uLmdldFNjcmVlbkxlbmd0aCgpICogdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgbWF4SGVpZ2h0ID0gdGhpcy4kbWF4TGluZXMgKiB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBkZXNpcmVkSGVpZ2h0ID0gTWF0aC5tYXgoXG4gICAgICAgICAgICAodGhpcy4kbWluTGluZXMgfHwgMSkgKiB0aGlzLmxpbmVIZWlnaHQsXG4gICAgICAgICAgICBNYXRoLm1pbihtYXhIZWlnaHQsIGhlaWdodClcbiAgICAgICAgKSArIHRoaXMuc2Nyb2xsTWFyZ2luLnYgKyAodGhpcy4kZXh0cmFIZWlnaHQgfHwgMCk7XG4gICAgICAgIHZhciB2U2Nyb2xsID0gaGVpZ2h0ID4gbWF4SGVpZ2h0O1xuXG4gICAgICAgIGlmIChkZXNpcmVkSGVpZ2h0ICE9IHRoaXMuZGVzaXJlZEhlaWdodCB8fFxuICAgICAgICAgICAgdGhpcy4kc2l6ZS5oZWlnaHQgIT0gdGhpcy5kZXNpcmVkSGVpZ2h0IHx8IHZTY3JvbGwgIT0gdGhpcy4kdlNjcm9sbCkge1xuICAgICAgICAgICAgaWYgKHZTY3JvbGwgIT0gdGhpcy4kdlNjcm9sbCkge1xuICAgICAgICAgICAgICAgIHRoaXMuJHZTY3JvbGwgPSB2U2Nyb2xsO1xuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zZXRWaXNpYmxlKHZTY3JvbGwpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdyA9IHRoaXMuY29udGFpbmVyLmNsaWVudFdpZHRoO1xuICAgICAgICAgICAgdGhpcy5jb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gZGVzaXJlZEhlaWdodCArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZUNhY2hlZFNpemUodHJ1ZSwgdGhpcy4kZ3V0dGVyV2lkdGgsIHcsIGRlc2lyZWRIZWlnaHQpO1xuICAgICAgICAgICAgLy8gdGhpcy4kbG9vcC5jaGFuZ2VzID0gMDtcbiAgICAgICAgICAgIHRoaXMuZGVzaXJlZEhlaWdodCA9IGRlc2lyZWRIZWlnaHQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRjb21wdXRlTGF5ZXJDb25maWcoKSB7XG5cbiAgICAgICAgaWYgKHRoaXMuJG1heExpbmVzICYmIHRoaXMubGluZUhlaWdodCA+IDEpIHtcbiAgICAgICAgICAgIHRoaXMuJGF1dG9zaXplKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgdmFyIHNpemUgPSB0aGlzLiRzaXplO1xuXG4gICAgICAgIHZhciBoaWRlU2Nyb2xsYmFycyA9IHNpemUuaGVpZ2h0IDw9IDIgKiB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBzY3JlZW5MaW5lcyA9IHRoaXMuc2Vzc2lvbi5nZXRTY3JlZW5MZW5ndGgoKTtcbiAgICAgICAgdmFyIG1heEhlaWdodCA9IHNjcmVlbkxpbmVzICogdGhpcy5saW5lSGVpZ2h0O1xuXG4gICAgICAgIHZhciBvZmZzZXQgPSB0aGlzLnNjcm9sbFRvcCAlIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgdmFyIG1pbkhlaWdodCA9IHNpemUuc2Nyb2xsZXJIZWlnaHQgKyB0aGlzLmxpbmVIZWlnaHQ7XG5cbiAgICAgICAgdmFyIGxvbmdlc3RMaW5lID0gdGhpcy4kZ2V0TG9uZ2VzdExpbmUoKTtcblxuICAgICAgICB2YXIgaG9yaXpTY3JvbGwgPSAhaGlkZVNjcm9sbGJhcnMgJiYgKHRoaXMuJGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIHx8XG4gICAgICAgICAgICBzaXplLnNjcm9sbGVyV2lkdGggLSBsb25nZXN0TGluZSAtIDIgKiB0aGlzLiRwYWRkaW5nIDwgMCk7XG5cbiAgICAgICAgdmFyIGhTY3JvbGxDaGFuZ2VkID0gdGhpcy4kaG9yaXpTY3JvbGwgIT09IGhvcml6U2Nyb2xsO1xuICAgICAgICBpZiAoaFNjcm9sbENoYW5nZWQpIHtcbiAgICAgICAgICAgIHRoaXMuJGhvcml6U2Nyb2xsID0gaG9yaXpTY3JvbGw7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhckguc2V0VmlzaWJsZShob3JpelNjcm9sbCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuJG1heExpbmVzICYmIHRoaXMuJHNjcm9sbFBhc3RFbmQpIHtcbiAgICAgICAgICAgIG1heEhlaWdodCArPSAoc2l6ZS5zY3JvbGxlckhlaWdodCAtIHRoaXMubGluZUhlaWdodCkgKiB0aGlzLiRzY3JvbGxQYXN0RW5kO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHZTY3JvbGwgPSAhaGlkZVNjcm9sbGJhcnMgJiYgKHRoaXMuJHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIHx8XG4gICAgICAgICAgICBzaXplLnNjcm9sbGVySGVpZ2h0IC0gbWF4SGVpZ2h0IDwgMCk7XG4gICAgICAgIHZhciB2U2Nyb2xsQ2hhbmdlZCA9IHRoaXMuJHZTY3JvbGwgIT09IHZTY3JvbGw7XG4gICAgICAgIGlmICh2U2Nyb2xsQ2hhbmdlZCkge1xuICAgICAgICAgICAgdGhpcy4kdlNjcm9sbCA9IHZTY3JvbGw7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2V0VmlzaWJsZSh2U2Nyb2xsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AoTWF0aC5tYXgoLXRoaXMuc2Nyb2xsTWFyZ2luLnRvcCxcbiAgICAgICAgICAgIE1hdGgubWluKHRoaXMuc2Nyb2xsVG9wLCBtYXhIZWlnaHQgLSBzaXplLnNjcm9sbGVySGVpZ2h0ICsgdGhpcy5zY3JvbGxNYXJnaW4uYm90dG9tKSkpO1xuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KE1hdGgubWF4KC10aGlzLnNjcm9sbE1hcmdpbi5sZWZ0LCBNYXRoLm1pbih0aGlzLnNjcm9sbExlZnQsXG4gICAgICAgICAgICBsb25nZXN0TGluZSArIDIgKiB0aGlzLiRwYWRkaW5nIC0gc2l6ZS5zY3JvbGxlcldpZHRoICsgdGhpcy5zY3JvbGxNYXJnaW4ucmlnaHQpKSk7XG5cbiAgICAgICAgdmFyIGxpbmVDb3VudCA9IE1hdGguY2VpbChtaW5IZWlnaHQgLyB0aGlzLmxpbmVIZWlnaHQpIC0gMTtcbiAgICAgICAgdmFyIGZpcnN0Um93ID0gTWF0aC5tYXgoMCwgTWF0aC5yb3VuZCgodGhpcy5zY3JvbGxUb3AgLSBvZmZzZXQpIC8gdGhpcy5saW5lSGVpZ2h0KSk7XG4gICAgICAgIHZhciBsYXN0Um93ID0gZmlyc3RSb3cgKyBsaW5lQ291bnQ7XG5cbiAgICAgICAgLy8gTWFwIGxpbmVzIG9uIHRoZSBzY3JlZW4gdG8gbGluZXMgaW4gdGhlIGRvY3VtZW50LlxuICAgICAgICB2YXIgZmlyc3RSb3dTY3JlZW4sIGZpcnN0Um93SGVpZ2h0O1xuICAgICAgICB2YXIgbGluZUhlaWdodCA9IHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgZmlyc3RSb3cgPSBzZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRSb3coZmlyc3RSb3csIDApO1xuXG4gICAgICAgIC8vIENoZWNrIGlmIGZpcnN0Um93IGlzIGluc2lkZSBvZiBhIGZvbGRMaW5lLiBJZiB0cnVlLCB0aGVuIHVzZSB0aGUgZmlyc3RcbiAgICAgICAgLy8gcm93IG9mIHRoZSBmb2xkTGluZS5cbiAgICAgICAgdmFyIGZvbGRMaW5lID0gc2Vzc2lvbi5nZXRGb2xkTGluZShmaXJzdFJvdyk7XG4gICAgICAgIGlmIChmb2xkTGluZSkge1xuICAgICAgICAgICAgZmlyc3RSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgIH1cblxuICAgICAgICBmaXJzdFJvd1NjcmVlbiA9IHNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblJvdyhmaXJzdFJvdywgMCk7XG4gICAgICAgIGZpcnN0Um93SGVpZ2h0ID0gc2Vzc2lvbi5nZXRSb3dMZW5ndGgoZmlyc3RSb3cpICogbGluZUhlaWdodDtcblxuICAgICAgICBsYXN0Um93ID0gTWF0aC5taW4oc2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50Um93KGxhc3RSb3csIDApLCBzZXNzaW9uLmdldExlbmd0aCgpIC0gMSk7XG4gICAgICAgIG1pbkhlaWdodCA9IHNpemUuc2Nyb2xsZXJIZWlnaHQgKyBzZXNzaW9uLmdldFJvd0xlbmd0aChsYXN0Um93KSAqIGxpbmVIZWlnaHQgK1xuICAgICAgICAgICAgZmlyc3RSb3dIZWlnaHQ7XG5cbiAgICAgICAgb2Zmc2V0ID0gdGhpcy5zY3JvbGxUb3AgLSBmaXJzdFJvd1NjcmVlbiAqIGxpbmVIZWlnaHQ7XG5cbiAgICAgICAgdmFyIGNoYW5nZXMgPSAwO1xuICAgICAgICBpZiAodGhpcy5sYXllckNvbmZpZy53aWR0aCAhPSBsb25nZXN0TGluZSlcbiAgICAgICAgICAgIGNoYW5nZXMgPSBDSEFOR0VfSF9TQ1JPTEw7XG4gICAgICAgIC8vIEhvcml6b250YWwgc2Nyb2xsYmFyIHZpc2liaWxpdHkgbWF5IGhhdmUgY2hhbmdlZCwgd2hpY2ggY2hhbmdlc1xuICAgICAgICAvLyB0aGUgY2xpZW50IGhlaWdodCBvZiB0aGUgc2Nyb2xsZXJcbiAgICAgICAgaWYgKGhTY3JvbGxDaGFuZ2VkIHx8IHZTY3JvbGxDaGFuZ2VkKSB7XG4gICAgICAgICAgICBjaGFuZ2VzID0gdGhpcy4kdXBkYXRlQ2FjaGVkU2l6ZSh0cnVlLCB0aGlzLmd1dHRlcldpZHRoLCBzaXplLndpZHRoLCBzaXplLmhlaWdodCk7XG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIEBldmVudCBzY3JvbGxiYXJWaXNpYmlsaXR5Q2hhbmdlZFxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJzY3JvbGxiYXJWaXNpYmlsaXR5Q2hhbmdlZFwiKTtcbiAgICAgICAgICAgIGlmICh2U2Nyb2xsQ2hhbmdlZClcbiAgICAgICAgICAgICAgICBsb25nZXN0TGluZSA9IHRoaXMuJGdldExvbmdlc3RMaW5lKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmxheWVyQ29uZmlnID0ge1xuICAgICAgICAgICAgd2lkdGg6IGxvbmdlc3RMaW5lLFxuICAgICAgICAgICAgcGFkZGluZzogdGhpcy4kcGFkZGluZyxcbiAgICAgICAgICAgIGZpcnN0Um93OiBmaXJzdFJvdyxcbiAgICAgICAgICAgIGZpcnN0Um93U2NyZWVuOiBmaXJzdFJvd1NjcmVlbixcbiAgICAgICAgICAgIGxhc3RSb3c6IGxhc3RSb3csXG4gICAgICAgICAgICBsaW5lSGVpZ2h0OiBsaW5lSGVpZ2h0LFxuICAgICAgICAgICAgY2hhcmFjdGVyV2lkdGg6IHRoaXMuY2hhcmFjdGVyV2lkdGgsXG4gICAgICAgICAgICBtaW5IZWlnaHQ6IG1pbkhlaWdodCxcbiAgICAgICAgICAgIG1heEhlaWdodDogbWF4SGVpZ2h0LFxuICAgICAgICAgICAgb2Zmc2V0OiBvZmZzZXQsXG4gICAgICAgICAgICBndXR0ZXJPZmZzZXQ6IE1hdGgubWF4KDAsIE1hdGguY2VpbCgob2Zmc2V0ICsgc2l6ZS5oZWlnaHQgLSBzaXplLnNjcm9sbGVySGVpZ2h0KSAvIGxpbmVIZWlnaHQpKSxcbiAgICAgICAgICAgIGhlaWdodDogdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodFxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBjaGFuZ2VzO1xuICAgIH1cblxuICAgIHByaXZhdGUgJHVwZGF0ZUxpbmVzKCkge1xuICAgICAgICB2YXIgZmlyc3RSb3cgPSB0aGlzLiRjaGFuZ2VkTGluZXMuZmlyc3RSb3c7XG4gICAgICAgIHZhciBsYXN0Um93ID0gdGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3c7XG4gICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcyA9IG51bGw7XG5cbiAgICAgICAgdmFyIGxheWVyQ29uZmlnID0gdGhpcy5sYXllckNvbmZpZztcblxuICAgICAgICBpZiAoZmlyc3RSb3cgPiBsYXllckNvbmZpZy5sYXN0Um93ICsgMSkgeyByZXR1cm47IH1cbiAgICAgICAgaWYgKGxhc3RSb3cgPCBsYXllckNvbmZpZy5maXJzdFJvdykgeyByZXR1cm47IH1cblxuICAgICAgICAvLyBpZiB0aGUgbGFzdCByb3cgaXMgdW5rbm93biAtPiByZWRyYXcgZXZlcnl0aGluZ1xuICAgICAgICBpZiAobGFzdFJvdyA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShsYXllckNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIudXBkYXRlKGxheWVyQ29uZmlnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGVsc2UgdXBkYXRlIG9ubHkgdGhlIGNoYW5nZWQgcm93c1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIudXBkYXRlTGluZXMobGF5ZXJDb25maWcsIGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkZ2V0TG9uZ2VzdExpbmUoKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGNoYXJDb3VudCA9IHRoaXMuc2Vzc2lvbi5nZXRTY3JlZW5XaWR0aCgpO1xuICAgICAgICBpZiAodGhpcy5zaG93SW52aXNpYmxlcyAmJiAhdGhpcy5zZXNzaW9uLiR1c2VXcmFwTW9kZSlcbiAgICAgICAgICAgIGNoYXJDb3VudCArPSAxO1xuXG4gICAgICAgIHJldHVybiBNYXRoLm1heCh0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSAyICogdGhpcy4kcGFkZGluZywgTWF0aC5yb3VuZChjaGFyQ291bnQgKiB0aGlzLmNoYXJhY3RlcldpZHRoKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2NoZWR1bGVzIGFuIHVwZGF0ZSB0byBhbGwgdGhlIGZyb250IG1hcmtlcnMgaW4gdGhlIGRvY3VtZW50LlxuICAgICAqL1xuICAgIHVwZGF0ZUZyb250TWFya2VycygpIHtcbiAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQuc2V0TWFya2Vycyh0aGlzLnNlc3Npb24uZ2V0TWFya2VycygvKmluRnJvbnQ9Ki90cnVlKSk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX01BUktFUl9GUk9OVCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2NoZWR1bGVzIGFuIHVwZGF0ZSB0byBhbGwgdGhlIGJhY2sgbWFya2VycyBpbiB0aGUgZG9jdW1lbnQuXG4gICAgICovXG4gICAgdXBkYXRlQmFja01hcmtlcnMoKSB7XG4gICAgICAgIHRoaXMuJG1hcmtlckJhY2suc2V0TWFya2Vycyh0aGlzLnNlc3Npb24uZ2V0TWFya2VycyhmYWxzZSkpO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9NQVJLRVJfQkFDSyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVkcmF3IGJyZWFrcG9pbnRzLlxuICAgICAqL1xuICAgIHVwZGF0ZUJyZWFrcG9pbnRzKCkge1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9HVVRURVIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYW5ub3RhdGlvbnMgZm9yIHRoZSBndXR0ZXIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldEFubm90YXRpb25zXG4gICAgICogQHBhcmFtIHtBbm5vdGF0aW9uW119IGFubm90YXRpb25zIEFuIGFycmF5IGNvbnRhaW5pbmcgYW5ub3RhdGlvbnMuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRBbm5vdGF0aW9ucyhhbm5vdGF0aW9uczogQW5ub3RhdGlvbltdKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnNldEFubm90YXRpb25zKGFubm90YXRpb25zKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfR1VUVEVSKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGVzIHRoZSBjdXJzb3IgaWNvbi5cbiAgICAgKi9cbiAgICB1cGRhdGVDdXJzb3IoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0NVUlNPUik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSGlkZXMgdGhlIGN1cnNvciBpY29uLlxuICAgICAqL1xuICAgIGhpZGVDdXJzb3IoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLmhpZGVDdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaG93cyB0aGUgY3Vyc29yIGljb24uXG4gICAgICovXG4gICAgc2hvd0N1cnNvcigpIHtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuc2hvd0N1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgc2Nyb2xsU2VsZWN0aW9uSW50b1ZpZXdcbiAgICAgKiBAcGFyYW0gYW5jaG9yIHtQb3NpdGlvbn1cbiAgICAgKiBAcGFyYW0gbGVhZCB7UG9zaXRpb259XG4gICAgICogQHBhcmFtIFtvZmZzZXRdIHtudW1iZXJ9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzY3JvbGxTZWxlY3Rpb25JbnRvVmlldyhhbmNob3I6IFBvc2l0aW9uLCBsZWFkOiBQb3NpdGlvbiwgb2Zmc2V0PzogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIC8vIGZpcnN0IHNjcm9sbCBhbmNob3IgaW50byB2aWV3IHRoZW4gc2Nyb2xsIGxlYWQgaW50byB2aWV3XG4gICAgICAgIHRoaXMuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcoYW5jaG9yLCBvZmZzZXQpO1xuICAgICAgICB0aGlzLnNjcm9sbEN1cnNvckludG9WaWV3KGxlYWQsIG9mZnNldCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xscyB0aGUgY3Vyc29yIGludG8gdGhlIGZpcnN0IHZpc2liaWxlIGFyZWEgb2YgdGhlIGVkaXRvci5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2Nyb2xsQ3Vyc29ySW50b1ZpZXdcbiAgICAgKiBAcGFyYW0gY3Vyc29yIHtQb3NpdGlvbn1cbiAgICAgKiBAcGFyYW0gW29mZnNldF0ge251bWJlcn1cbiAgICAgKiBAcGFyYW0gWyR2aWV3TWFyZ2luXSB7e3RvcDogbnVtYmVyOyBib3R0b206IG51bWJlcn19XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzY3JvbGxDdXJzb3JJbnRvVmlldyhjdXJzb3I/OiBQb3NpdGlvbiwgb2Zmc2V0PzogbnVtYmVyLCAkdmlld01hcmdpbj86IHsgdG9wOiBudW1iZXI7IGJvdHRvbTogbnVtYmVyIH0pOiB2b2lkIHtcbiAgICAgICAgLy8gdGhlIGVkaXRvciBpcyBub3QgdmlzaWJsZVxuICAgICAgICBpZiAodGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCA9PT0gMClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuZ2V0UGl4ZWxQb3NpdGlvbihjdXJzb3IpO1xuXG4gICAgICAgIHZhciBsZWZ0ID0gcG9zLmxlZnQ7XG4gICAgICAgIHZhciB0b3AgPSBwb3MudG9wO1xuXG4gICAgICAgIHZhciB0b3BNYXJnaW4gPSAkdmlld01hcmdpbiAmJiAkdmlld01hcmdpbi50b3AgfHwgMDtcbiAgICAgICAgdmFyIGJvdHRvbU1hcmdpbiA9ICR2aWV3TWFyZ2luICYmICR2aWV3TWFyZ2luLmJvdHRvbSB8fCAwO1xuXG4gICAgICAgIHZhciBzY3JvbGxUb3AgPSB0aGlzLiRzY3JvbGxBbmltYXRpb24gPyB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgOiB0aGlzLnNjcm9sbFRvcDtcblxuICAgICAgICBpZiAoc2Nyb2xsVG9wICsgdG9wTWFyZ2luID4gdG9wKSB7XG4gICAgICAgICAgICBpZiAob2Zmc2V0KVxuICAgICAgICAgICAgICAgIHRvcCAtPSBvZmZzZXQgKiB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0O1xuICAgICAgICAgICAgaWYgKHRvcCA9PT0gMClcbiAgICAgICAgICAgICAgICB0b3AgPSAtdGhpcy5zY3JvbGxNYXJnaW4udG9wO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcCh0b3ApO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNjcm9sbFRvcCArIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgLSBib3R0b21NYXJnaW4gPCB0b3AgKyB0aGlzLmxpbmVIZWlnaHQpIHtcbiAgICAgICAgICAgIGlmIChvZmZzZXQpXG4gICAgICAgICAgICAgICAgdG9wICs9IG9mZnNldCAqIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHRvcCArIHRoaXMubGluZUhlaWdodCAtIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHNjcm9sbExlZnQgPSB0aGlzLnNjcm9sbExlZnQ7XG5cbiAgICAgICAgaWYgKHNjcm9sbExlZnQgPiBsZWZ0KSB7XG4gICAgICAgICAgICBpZiAobGVmdCA8IHRoaXMuJHBhZGRpbmcgKyAyICogdGhpcy5sYXllckNvbmZpZy5jaGFyYWN0ZXJXaWR0aClcbiAgICAgICAgICAgICAgICBsZWZ0ID0gLXRoaXMuc2Nyb2xsTWFyZ2luLmxlZnQ7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdChsZWZ0KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzY3JvbGxMZWZ0ICsgdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIDwgbGVmdCArIHRoaXMuY2hhcmFjdGVyV2lkdGgpIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KE1hdGgucm91bmQobGVmdCArIHRoaXMuY2hhcmFjdGVyV2lkdGggLSB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGgpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzY3JvbGxMZWZ0IDw9IHRoaXMuJHBhZGRpbmcgJiYgbGVmdCAtIHNjcm9sbExlZnQgPCB0aGlzLmNoYXJhY3RlcldpZHRoKSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdCgwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogezpFZGl0U2Vzc2lvbi5nZXRTY3JvbGxUb3B9XG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRTY3JvbGxUb3BcbiAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxUb3AoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIHs6RWRpdFNlc3Npb24uZ2V0U2Nyb2xsTGVmdH1cbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmdldFNjcm9sbExlZnRcbiAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxMZWZ0KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGZpcnN0IHZpc2libGUgcm93LCByZWdhcmRsZXNzIG9mIHdoZXRoZXIgaXQncyBmdWxseSB2aXNpYmxlIG9yIG5vdC5cbiAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxUb3BSb3coKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Nyb2xsVG9wIC8gdGhpcy5saW5lSGVpZ2h0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGxhc3QgdmlzaWJsZSByb3csIHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciBpdCdzIGZ1bGx5IHZpc2libGUgb3Igbm90LlxuICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldFNjcm9sbEJvdHRvbVJvdygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gTWF0aC5tYXgoMCwgTWF0aC5mbG9vcigodGhpcy5zY3JvbGxUb3AgKyB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0KSAvIHRoaXMubGluZUhlaWdodCkgLSAxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEdyYWNlZnVsbHkgc2Nyb2xscyBmcm9tIHRoZSB0b3Agb2YgdGhlIGVkaXRvciB0byB0aGUgcm93IGluZGljYXRlZC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgQSByb3cgaWRcbiAgICAqXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uc2V0U2Nyb2xsVG9wXG4gICAgKiovXG4gICAgc2Nyb2xsVG9Sb3cocm93OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChyb3cgKiB0aGlzLmxpbmVIZWlnaHQpO1xuICAgIH1cblxuICAgIGFsaWduQ3Vyc29yKGN1cnNvci8qOiBQb3NpdGlvbiovLCBhbGlnbm1lbnQ6IG51bWJlcikge1xuICAgICAgICAvLyBGSVhNRTogRG9uJ3QgaGF2ZSBwb2x5bW9ycGhpYyBjdXJzb3IgcGFyYW1ldGVyLlxuICAgICAgICBpZiAodHlwZW9mIGN1cnNvciA9PSBcIm51bWJlclwiKVxuICAgICAgICAgICAgY3Vyc29yID0geyByb3c6IGN1cnNvciwgY29sdW1uOiAwIH07XG5cbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuJGN1cnNvckxheWVyLmdldFBpeGVsUG9zaXRpb24oY3Vyc29yKTtcbiAgICAgICAgdmFyIGggPSB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0IC0gdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgb2Zmc2V0ID0gcG9zLnRvcCAtIGggKiAoYWxpZ25tZW50IHx8IDApO1xuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3Aob2Zmc2V0KTtcbiAgICAgICAgcmV0dXJuIG9mZnNldDtcbiAgICB9XG5cbiAgICAkY2FsY1N0ZXBzKGZyb21WYWx1ZTogbnVtYmVyLCB0b1ZhbHVlOiBudW1iZXIpOiBudW1iZXJbXSB7XG4gICAgICAgIHZhciBpOiBudW1iZXIgPSAwO1xuICAgICAgICB2YXIgbDogbnVtYmVyID0gdGhpcy5TVEVQUztcbiAgICAgICAgdmFyIHN0ZXBzOiBudW1iZXJbXSA9IFtdO1xuXG4gICAgICAgIHZhciBmdW5jID0gZnVuY3Rpb24odDogbnVtYmVyLCB4X21pbjogbnVtYmVyLCBkeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgICAgIHJldHVybiBkeCAqIChNYXRoLnBvdyh0IC0gMSwgMykgKyAxKSArIHhfbWluO1xuICAgICAgICB9O1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBsOyArK2kpIHtcbiAgICAgICAgICAgIHN0ZXBzLnB1c2goZnVuYyhpIC8gdGhpcy5TVEVQUywgZnJvbVZhbHVlLCB0b1ZhbHVlIC0gZnJvbVZhbHVlKSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc3RlcHM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR3JhY2VmdWxseSBzY3JvbGxzIHRoZSBlZGl0b3IgdG8gdGhlIHJvdyBpbmRpY2F0ZWQuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGxpbmUgQSBsaW5lIG51bWJlclxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gY2VudGVyIElmIGB0cnVlYCwgY2VudGVycyB0aGUgZWRpdG9yIHRoZSB0byBpbmRpY2F0ZWQgbGluZVxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYW5pbWF0ZSBJZiBgdHJ1ZWAgYW5pbWF0ZXMgc2Nyb2xsaW5nXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgRnVuY3Rpb24gdG8gYmUgY2FsbGVkIGFmdGVyIHRoZSBhbmltYXRpb24gaGFzIGZpbmlzaGVkXG4gICAgICovXG4gICAgc2Nyb2xsVG9MaW5lKGxpbmU6IG51bWJlciwgY2VudGVyOiBib29sZWFuLCBhbmltYXRlOiBib29sZWFuLCBjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuZ2V0UGl4ZWxQb3NpdGlvbih7IHJvdzogbGluZSwgY29sdW1uOiAwIH0pO1xuICAgICAgICB2YXIgb2Zmc2V0ID0gcG9zLnRvcDtcbiAgICAgICAgaWYgKGNlbnRlcikge1xuICAgICAgICAgICAgb2Zmc2V0IC09IHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgLyAyO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGluaXRpYWxTY3JvbGwgPSB0aGlzLnNjcm9sbFRvcDtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChvZmZzZXQpO1xuICAgICAgICBpZiAoYW5pbWF0ZSAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHRoaXMuYW5pbWF0ZVNjcm9sbGluZyhpbml0aWFsU2Nyb2xsLCBjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhbmltYXRlU2Nyb2xsaW5nKGZyb21WYWx1ZTogbnVtYmVyLCBjYWxsYmFjaz8pIHtcbiAgICAgICAgdmFyIHRvVmFsdWUgPSB0aGlzLnNjcm9sbFRvcDtcbiAgICAgICAgaWYgKCF0aGlzLiRhbmltYXRlZFNjcm9sbCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgaWYgKGZyb21WYWx1ZSA9PSB0b1ZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmICh0aGlzLiRzY3JvbGxBbmltYXRpb24pIHtcbiAgICAgICAgICAgIHZhciBvbGRTdGVwcyA9IHRoaXMuJHNjcm9sbEFuaW1hdGlvbi5zdGVwcztcbiAgICAgICAgICAgIGlmIChvbGRTdGVwcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBmcm9tVmFsdWUgPSBvbGRTdGVwc1swXTtcbiAgICAgICAgICAgICAgICBpZiAoZnJvbVZhbHVlID09IHRvVmFsdWUpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzdGVwcyA9IF9zZWxmLiRjYWxjU3RlcHMoZnJvbVZhbHVlLCB0b1ZhbHVlKTtcbiAgICAgICAgdGhpcy4kc2Nyb2xsQW5pbWF0aW9uID0geyBmcm9tOiBmcm9tVmFsdWUsIHRvOiB0b1ZhbHVlLCBzdGVwczogc3RlcHMgfTtcblxuICAgICAgICBjbGVhckludGVydmFsKHRoaXMuJHRpbWVyKTtcblxuICAgICAgICBfc2VsZi5zZXNzaW9uLnNldFNjcm9sbFRvcChzdGVwcy5zaGlmdCgpKTtcbiAgICAgICAgLy8gdHJpY2sgc2Vzc2lvbiB0byB0aGluayBpdCdzIGFscmVhZHkgc2Nyb2xsZWQgdG8gbm90IGxvb3NlIHRvVmFsdWVcbiAgICAgICAgX3NlbGYuc2Vzc2lvbi4kc2Nyb2xsVG9wID0gdG9WYWx1ZTtcbiAgICAgICAgdGhpcy4kdGltZXIgPSBzZXRJbnRlcnZhbChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmIChzdGVwcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXNzaW9uLnNldFNjcm9sbFRvcChzdGVwcy5zaGlmdCgpKTtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXNzaW9uLiRzY3JvbGxUb3AgPSB0b1ZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0b1ZhbHVlICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXNzaW9uLiRzY3JvbGxUb3AgPSAtMTtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXNzaW9uLnNldFNjcm9sbFRvcCh0b1ZhbHVlKTtcbiAgICAgICAgICAgICAgICB0b1ZhbHVlID0gbnVsbDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gZG8gdGhpcyBvbiBzZXBhcmF0ZSBzdGVwIHRvIG5vdCBnZXQgc3B1cmlvdXMgc2Nyb2xsIGV2ZW50IGZyb20gc2Nyb2xsYmFyXG4gICAgICAgICAgICAgICAgX3NlbGYuJHRpbWVyID0gY2xlYXJJbnRlcnZhbChfc2VsZi4kdGltZXIpO1xuICAgICAgICAgICAgICAgIF9zZWxmLiRzY3JvbGxBbmltYXRpb24gPSBudWxsO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIDEwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRoZSBlZGl0b3IgdG8gdGhlIHkgcGl4ZWwgaW5kaWNhdGVkLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JvbGxUb3AgVGhlIHBvc2l0aW9uIHRvIHNjcm9sbCB0b1xuICAgICAqL1xuICAgIHNjcm9sbFRvWShzY3JvbGxUb3A6IG51bWJlcik6IHZvaWQge1xuICAgICAgICAvLyBhZnRlciBjYWxsaW5nIHNjcm9sbEJhci5zZXRTY3JvbGxUb3BcbiAgICAgICAgLy8gc2Nyb2xsYmFyIHNlbmRzIHVzIGV2ZW50IHdpdGggc2FtZSBzY3JvbGxUb3AuIGlnbm9yZSBpdFxuICAgICAgICBpZiAodGhpcy5zY3JvbGxUb3AgIT09IHNjcm9sbFRvcCkge1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxUb3AgPSBzY3JvbGxUb3A7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9TQ1JPTEwpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xscyB0aGUgZWRpdG9yIGFjcm9zcyB0aGUgeC1heGlzIHRvIHRoZSBwaXhlbCBpbmRpY2F0ZWQuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHNjcm9sbExlZnQgVGhlIHBvc2l0aW9uIHRvIHNjcm9sbCB0b1xuICAgICAqKi9cbiAgICBzY3JvbGxUb1goc2Nyb2xsTGVmdDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLnNjcm9sbExlZnQgIT09IHNjcm9sbExlZnQpIHtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsTGVmdCA9IHNjcm9sbExlZnQ7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9IX1NDUk9MTCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNjcm9sbHMgdGhlIGVkaXRvciBhY3Jvc3MgYm90aCB4LSBhbmQgeS1heGVzLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHggVGhlIHggdmFsdWUgdG8gc2Nyb2xsIHRvXG4gICAgKiBAcGFyYW0ge051bWJlcn0geSBUaGUgeSB2YWx1ZSB0byBzY3JvbGwgdG9cbiAgICAqKi9cbiAgICBzY3JvbGxUbyh4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHkpO1xuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdCh5KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRoZSBlZGl0b3IgYWNyb3NzIGJvdGggeC0gYW5kIHktYXhlcy5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2Nyb2xsQnlcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZGVsdGFYIFRoZSB4IHZhbHVlIHRvIHNjcm9sbCBieVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBkZWx0YVkgVGhlIHkgdmFsdWUgdG8gc2Nyb2xsIGJ5XG4gICAgICovXG4gICAgc2Nyb2xsQnkoZGVsdGFYOiBudW1iZXIsIGRlbHRhWTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGRlbHRhWSAmJiB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSArIGRlbHRhWSk7XG4gICAgICAgIGRlbHRhWCAmJiB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdCh0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpICsgZGVsdGFYKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYHRydWVgIGlmIHlvdSBjYW4gc3RpbGwgc2Nyb2xsIGJ5IGVpdGhlciBwYXJhbWV0ZXI7IGluIG90aGVyIHdvcmRzLCB5b3UgaGF2ZW4ndCByZWFjaGVkIHRoZSBlbmQgb2YgdGhlIGZpbGUgb3IgbGluZS5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkZWx0YVggVGhlIHggdmFsdWUgdG8gc2Nyb2xsIGJ5XG4gICAgKiBAcGFyYW0ge051bWJlcn0gZGVsdGFZIFRoZSB5IHZhbHVlIHRvIHNjcm9sbCBieVxuICAgICpcbiAgICAqXG4gICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICoqL1xuICAgIGlzU2Nyb2xsYWJsZUJ5KGRlbHRhWDogbnVtYmVyLCBkZWx0YVk6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgICAgICBpZiAoZGVsdGFZIDwgMCAmJiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgPj0gMSAtIHRoaXMuc2Nyb2xsTWFyZ2luLnRvcClcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBpZiAoZGVsdGFZID4gMCAmJiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgKyB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0XG4gICAgICAgICAgICAtIHRoaXMubGF5ZXJDb25maWcubWF4SGVpZ2h0IDwgLTEgKyB0aGlzLnNjcm9sbE1hcmdpbi5ib3R0b20pXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgaWYgKGRlbHRhWCA8IDAgJiYgdGhpcy5zZXNzaW9uLmdldFNjcm9sbExlZnQoKSA+PSAxIC0gdGhpcy5zY3JvbGxNYXJnaW4ubGVmdClcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBpZiAoZGVsdGFYID4gMCAmJiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpICsgdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoXG4gICAgICAgICAgICAtIHRoaXMubGF5ZXJDb25maWcud2lkdGggPCAtMSArIHRoaXMuc2Nyb2xsTWFyZ2luLnJpZ2h0KVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcGl4ZWxUb1NjcmVlbkNvb3JkaW5hdGVzKHg6IG51bWJlciwgeTogbnVtYmVyKSB7XG4gICAgICAgIHZhciBjYW52YXNQb3MgPSB0aGlzLnNjcm9sbGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG4gICAgICAgIHZhciBvZmZzZXQgPSAoeCArIHRoaXMuc2Nyb2xsTGVmdCAtIGNhbnZhc1Bvcy5sZWZ0IC0gdGhpcy4kcGFkZGluZykgLyB0aGlzLmNoYXJhY3RlcldpZHRoO1xuICAgICAgICB2YXIgcm93ID0gTWF0aC5mbG9vcigoeSArIHRoaXMuc2Nyb2xsVG9wIC0gY2FudmFzUG9zLnRvcCkgLyB0aGlzLmxpbmVIZWlnaHQpO1xuICAgICAgICB2YXIgY29sID0gTWF0aC5yb3VuZChvZmZzZXQpO1xuXG4gICAgICAgIHJldHVybiB7IHJvdzogcm93LCBjb2x1bW46IGNvbCwgc2lkZTogb2Zmc2V0IC0gY29sID4gMCA/IDEgOiAtMSB9O1xuICAgIH1cblxuICAgIHNjcmVlblRvVGV4dENvb3JkaW5hdGVzKGNsaWVudFg6IG51bWJlciwgY2xpZW50WTogbnVtYmVyKTogUG9zaXRpb24ge1xuICAgICAgICB2YXIgY2FudmFzUG9zID0gdGhpcy5zY3JvbGxlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblxuICAgICAgICB2YXIgY29sdW1uID0gTWF0aC5yb3VuZCgoY2xpZW50WCArIHRoaXMuc2Nyb2xsTGVmdCAtIGNhbnZhc1Bvcy5sZWZ0IC0gdGhpcy4kcGFkZGluZykgLyB0aGlzLmNoYXJhY3RlcldpZHRoKTtcblxuICAgICAgICB2YXIgcm93ID0gKGNsaWVudFkgKyB0aGlzLnNjcm9sbFRvcCAtIGNhbnZhc1Bvcy50b3ApIC8gdGhpcy5saW5lSGVpZ2h0O1xuXG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHJvdywgTWF0aC5tYXgoY29sdW1uLCAwKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBgcGFnZVhgIGFuZCBgcGFnZVlgIGNvb3JkaW5hdGVzIG9mIHRoZSBkb2N1bWVudCBwb3NpdGlvbi5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIGRvY3VtZW50IHJvdyBwb3NpdGlvblxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgZG9jdW1lbnQgY29sdW1uIHBvc2l0aW9uXG4gICAgKiBAcmV0dXJuIHtPYmplY3R9XG4gICAgKiovXG4gICAgdGV4dFRvU2NyZWVuQ29vcmRpbmF0ZXMocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogeyBwYWdlWDogbnVtYmVyOyBwYWdlWTogbnVtYmVyIH0ge1xuICAgICAgICB2YXIgY2FudmFzUG9zID0gdGhpcy5zY3JvbGxlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24ocm93LCBjb2x1bW4pO1xuXG4gICAgICAgIHZhciB4ID0gdGhpcy4kcGFkZGluZyArIE1hdGgucm91bmQocG9zLmNvbHVtbiAqIHRoaXMuY2hhcmFjdGVyV2lkdGgpO1xuICAgICAgICB2YXIgeSA9IHBvcy5yb3cgKiB0aGlzLmxpbmVIZWlnaHQ7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHBhZ2VYOiBjYW52YXNQb3MubGVmdCArIHggLSB0aGlzLnNjcm9sbExlZnQsXG4gICAgICAgICAgICBwYWdlWTogY2FudmFzUG9zLnRvcCArIHkgLSB0aGlzLnNjcm9sbFRvcFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIEZvY3VzZXMgdGhlIGN1cnJlbnQgY29udGFpbmVyLlxuICAgICoqL1xuICAgIHZpc3VhbGl6ZUZvY3VzKCkge1xuICAgICAgICBhZGRDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgXCJhY2VfZm9jdXNcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogQmx1cnMgdGhlIGN1cnJlbnQgY29udGFpbmVyLlxuICAgICoqL1xuICAgIHZpc3VhbGl6ZUJsdXIoKSB7XG4gICAgICAgIHJlbW92ZUNzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBcImFjZV9mb2N1c1wiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHNob3dDb21wb3NpdGlvblxuICAgICAqIEBwYXJhbSBwb3NpdGlvblxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgc2hvd0NvbXBvc2l0aW9uKHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9KSB7XG4gICAgICAgIGlmICghdGhpcy4kY29tcG9zaXRpb24pXG4gICAgICAgICAgICB0aGlzLiRjb21wb3NpdGlvbiA9IHtcbiAgICAgICAgICAgICAgICBrZWVwVGV4dEFyZWFBdEN1cnNvcjogdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IsXG4gICAgICAgICAgICAgICAgY3NzVGV4dDogdGhpcy50ZXh0YXJlYS5zdHlsZS5jc3NUZXh0XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0gdHJ1ZTtcbiAgICAgICAgYWRkQ3NzQ2xhc3ModGhpcy50ZXh0YXJlYSwgXCJhY2VfY29tcG9zaXRpb25cIik7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuY3NzVGV4dCA9IFwiXCI7XG4gICAgICAgIHRoaXMuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgQSBzdHJpbmcgb2YgdGV4dCB0byB1c2VcbiAgICAgKlxuICAgICAqIFNldHMgdGhlIGlubmVyIHRleHQgb2YgdGhlIGN1cnJlbnQgY29tcG9zaXRpb24gdG8gYHRleHRgLlxuICAgICAqL1xuICAgIHNldENvbXBvc2l0aW9uVGV4dCh0ZXh0Pzogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIC8vIFRPRE86IFdoeSBpcyB0aGUgcGFyYW1ldGVyIG5vdCB1c2VkP1xuICAgICAgICB0aGlzLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEhpZGVzIHRoZSBjdXJyZW50IGNvbXBvc2l0aW9uLlxuICAgICAqL1xuICAgIGhpZGVDb21wb3NpdGlvbigpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRjb21wb3NpdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVtb3ZlQ3NzQ2xhc3ModGhpcy50ZXh0YXJlYSwgXCJhY2VfY29tcG9zaXRpb25cIik7XG4gICAgICAgIHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0gdGhpcy4kY29tcG9zaXRpb24ua2VlcFRleHRBcmVhQXRDdXJzb3I7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuY3NzVGV4dCA9IHRoaXMuJGNvbXBvc2l0aW9uLmNzc1RleHQ7XG4gICAgICAgIHRoaXMuJGNvbXBvc2l0aW9uID0gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGEgbmV3IHRoZW1lIGZvciB0aGUgZWRpdG9yLlxuICAgICAqIFRoaXMgaXMgYSBzeW5jaHJvbm91cyBtZXRob2QuXG4gICAgICovXG4gICAgc2V0VGhlbWUobW9kSnM6IHsgY3NzVGV4dDogc3RyaW5nOyBjc3NDbGFzczogc3RyaW5nOyBpc0Rhcms6IGJvb2xlYW47IHBhZGRpbmc6IG51bWJlciB9KTogdm9pZCB7XG5cbiAgICAgICAgaWYgKCFtb2RKcy5jc3NDbGFzcykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgZW5zdXJlSFRNTFN0eWxlRWxlbWVudChtb2RKcy5jc3NUZXh0LCBtb2RKcy5jc3NDbGFzcywgdGhpcy5jb250YWluZXIub3duZXJEb2N1bWVudCk7XG5cbiAgICAgICAgaWYgKHRoaXMudGhlbWUpIHtcbiAgICAgICAgICAgIHJlbW92ZUNzc0NsYXNzKHRoaXMuY29udGFpbmVyLCB0aGlzLnRoZW1lLmNzc0NsYXNzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBwYWRkaW5nID0gXCJwYWRkaW5nXCIgaW4gbW9kSnMgPyBtb2RKcy5wYWRkaW5nIDogXCJwYWRkaW5nXCIgaW4gKHRoaXMudGhlbWUgfHwge30pID8gNCA6IHRoaXMuJHBhZGRpbmc7XG5cbiAgICAgICAgaWYgKHRoaXMuJHBhZGRpbmcgJiYgcGFkZGluZyAhPSB0aGlzLiRwYWRkaW5nKSB7XG4gICAgICAgICAgICB0aGlzLnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnRoZW1lID0gbW9kSnM7XG4gICAgICAgIHRoaXMuYWRkQ3NzQ2xhc3MobW9kSnMuY3NzQ2xhc3MpO1xuICAgICAgICB0aGlzLnNldENzc0NsYXNzKFwiYWNlX2RhcmtcIiwgbW9kSnMuaXNEYXJrKTtcblxuICAgICAgICAvLyBmb3JjZSByZS1tZWFzdXJlIG9mIHRoZSBndXR0ZXIgd2lkdGhcbiAgICAgICAgaWYgKHRoaXMuJHNpemUpIHtcbiAgICAgICAgICAgIHRoaXMuJHNpemUud2lkdGggPSAwO1xuICAgICAgICAgICAgdGhpcy4kdXBkYXRlU2l6ZUFzeW5jKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IHRoZW1lTG9hZGVkXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9lbWl0KCd0aGVtZUxvYWRlZCcsIHsgdGhlbWU6IG1vZEpzIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgYWRkQ3NzQ2xhc3NcbiAgICAgKiBAcGFyYW0gY3NzQ2xhc3Mge3N0cmluZ31cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGFkZENzc0NsYXNzKGNzc0NsYXNzOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgYWRkQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIGNzc0NsYXNzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHNldENzc0NsYXNzXG4gICAgICogQHBhcmFtIGNsYXNzTmFtZToge3N0cmluZ31cbiAgICAgKiBAcGFyYW0gaW5jbHVkZSB7Ym9vbGVhbn1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldENzc0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmNsdWRlOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHNldENzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBjbGFzc05hbWUsIGluY2x1ZGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEltcG9ydHMgYSBuZXcgdGhlbWUgZm9yIHRoZSBlZGl0b3IgdXNpbmcgdGhlIFN5c3RlbSBMb2FkZXIuXG4gICAgICogYHRoZW1lYCBzaG91bGQgZXhpc3QsIGFuZCBiZSBhIGRpcmVjdG9yeSBwYXRoLCBsaWtlIGBhY2UvdGhlbWUvdGV4dG1hdGVgLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBpbXBvcnRUaGVtZUxpbmtcbiAgICAgKiBAcGFyYW0gdGhlbWVOYW1lIHtzdHJpbmd9IFRoZSBuYW1lIG9mIGEgdGhlbWUgbW9kdWxlLlxuICAgICAqIEByZXR1cm4ge1Byb21pc2U8VGhlbWU+fVxuICAgICAqL1xuICAgIGltcG9ydFRoZW1lTGluayh0aGVtZU5hbWU6IHN0cmluZyk6IFByb21pc2U8VGhlbWVMaW5rPiB7XG5cbiAgICAgICAgaWYgKCF0aGVtZU5hbWUgfHwgdHlwZW9mIHRoZW1lTmFtZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgdGhlbWVOYW1lID0gdGhlbWVOYW1lIHx8IHRoaXMuZ2V0T3B0aW9uKFwidGhlbWVcIikuaW5pdGlhbFZhbHVlO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcblxuICAgICAgICB0aGlzLiR0aGVtZUlkID0gdGhlbWVOYW1lO1xuXG4gICAgICAgIC8vIFRPRE86IElzIHRoaXMgdGhlIHJpZ2h0IHBsYWNlIHRvIGVtaXQgdGhlIGV2ZW50P1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IHRoZW1lQ2hhbmdlXG4gICAgICAgICAqL1xuICAgICAgICBfc2VsZi5ldmVudEJ1cy5fZW1pdCgndGhlbWVDaGFuZ2UnLCB7IHRoZW1lOiB0aGVtZU5hbWUgfSk7XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPFRoZW1lTGluaz4oZnVuY3Rpb24oc3VjY2VzcywgZmFpbCkge1xuICAgICAgICAgICAgLy8gV2UgdGFrZSBhZHZhbnRhZ2Ugb2YgdGhlIGNvbmZpZ3VyYWJpbGl0eSBvZiB0aGUgU3lzdGVtIExvYWRlci5cbiAgICAgICAgICAgIC8vIEJlY2F1c2Ugd2UgYXJlIGxvYWRpbmcgQ1NTLCB3ZSByZXBsYWNlIHRoZSBpbnN0YW50aWF0aW9uLlxuICAgICAgICAgICAgU3lzdGVtLmltcG9ydCh0aGVtZU5hbWUpXG4gICAgICAgICAgICAgICAgLnRoZW4oZnVuY3Rpb24obTogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBpc0Rhcms6IGJvb2xlYW4gPSBtLmlzRGFyaztcbiAgICAgICAgICAgICAgICAgICAgdmFyIGlkOiBzdHJpbmcgPSBtLmNzc0NsYXNzO1xuICAgICAgICAgICAgICAgICAgICB2YXIgaHJlZjogc3RyaW5nID0gbS5jc3NOYW1lO1xuICAgICAgICAgICAgICAgICAgICB2YXIgcGFkZGluZzogbnVtYmVyID0gKHR5cGVvZiBtLnBhZGRpbmcgPT09ICdudW1iZXInKSA/IG0ucGFkZGluZyA6IDA7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0aGVtZSA9IG5ldyBUaGVtZUxpbmsoaXNEYXJrLCBpZCwgJ3N0eWxlc2hlZXQnLCAndGV4dC9jc3MnLCBocmVmLCBwYWRkaW5nKTtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2Vzcyh0aGVtZSk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuY2F0Y2goZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgJHtyZWFzb259YCk7XG4gICAgICAgICAgICAgICAgICAgIGZhaWwocmVhc29uKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBzZXRUaGVtZUNzc1xuICAgICAqIEBwYXJhbSBjc3NDbGFzcyB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSBocmVmIHtzdHJpbmd9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRUaGVtZUNzcyhjc3NDbGFzczogc3RyaW5nLCBocmVmOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgYXBwZW5kSFRNTExpbmtFbGVtZW50KGNzc0NsYXNzLCAnc3R5bGVzaGVldCcsICd0ZXh0L2NzcycsIGhyZWYsIGRvY3VtZW50KTtcbiAgICAgICAgdGhpcy5hZGRDc3NDbGFzcyhjc3NDbGFzcyk7XG4gICAgICAgIC8vICAgICAgdGhpcy5zZXRDc3NDbGFzcyhcImFjZV9kYXJrXCIsIHRoZW1lTGluay5pc0RhcmspO1xuICAgICAgICAvLyAgICAgIHRoaXMuc2V0UGFkZGluZyh0aGVtZUxpbmsucGFkZGluZyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgcGF0aCBvZiB0aGUgY3VycmVudCB0aGVtZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0VGhlbWVcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgZ2V0VGhlbWUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHRoZW1lSWQ7XG4gICAgfVxuXG4gICAgLy8gTWV0aG9kcyBhbGxvd3MgdG8gYWRkIC8gcmVtb3ZlIENTUyBjbGFzc25hbWVzIHRvIHRoZSBlZGl0b3IgZWxlbWVudC5cbiAgICAvLyBUaGlzIGZlYXR1cmUgY2FuIGJlIHVzZWQgYnkgcGx1Zy1pbnMgdG8gcHJvdmlkZSBhIHZpc3VhbCBpbmRpY2F0aW9uIG9mXG4gICAgLy8gYSBjZXJ0YWluIG1vZGUgdGhhdCBlZGl0b3IgaXMgaW4uXG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgbmV3IGNsYXNzLCBgc3R5bGVgLCB0byB0aGUgZWRpdG9yLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHlsZSBBIGNsYXNzIG5hbWVcbiAgICAgKlxuICAgICAqL1xuICAgIHNldFN0eWxlKHN0eWxlOiBzdHJpbmcsIGluY2x1ZGU/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHNldENzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBzdHlsZSwgaW5jbHVkZSAhPT0gZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgdGhlIGNsYXNzIGBzdHlsZWAgZnJvbSB0aGUgZWRpdG9yLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHlsZSBBIGNsYXNzIG5hbWVcbiAgICAgKi9cbiAgICB1bnNldFN0eWxlKHN0eWxlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgcmVtb3ZlQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIHN0eWxlKTtcbiAgICB9XG5cbiAgICBzZXRDdXJzb3JTdHlsZShzdHlsZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLmNvbnRlbnQuc3R5bGUuY3Vyc29yICE9IHN0eWxlKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUuY3Vyc29yID0gc3R5bGU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gY3Vyc29yU3R5bGUgQSBjc3MgY3Vyc29yIHN0eWxlXG4gICAgICovXG4gICAgc2V0TW91c2VDdXJzb3IoY3Vyc29yU3R5bGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUuY3Vyc29yID0gY3Vyc29yU3R5bGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGVzdHJveXMgdGhlIHRleHQgYW5kIGN1cnNvciBsYXllcnMgZm9yIHRoaXMgcmVuZGVyZXIuXG4gICAgICovXG4gICAgZGVzdHJveSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuZGVzdHJveSgpO1xuICAgIH1cbn1cblxuZGVmaW5lT3B0aW9ucyhWaXJ0dWFsUmVuZGVyZXIucHJvdG90eXBlLCBcInJlbmRlcmVyXCIsIHtcbiAgICBhbmltYXRlZFNjcm9sbDogeyBpbml0aWFsVmFsdWU6IGZhbHNlIH0sXG4gICAgc2hvd0ludmlzaWJsZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllci5zZXRTaG93SW52aXNpYmxlcyh2YWx1ZSkpXG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9URVhUKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgc2hvd1ByaW50TWFyZ2luOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oKSB7IHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7IH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgcHJpbnRNYXJnaW5Db2x1bW46IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbigpIHsgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiA4MFxuICAgIH0sXG4gICAgcHJpbnRNYXJnaW46IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsID09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICAgICAgdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW4gPSB2YWw7XG4gICAgICAgICAgICB0aGlzLiRzaG93UHJpbnRNYXJnaW4gPSAhIXZhbDtcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kc2hvd1ByaW50TWFyZ2luICYmIHRoaXMuJHByaW50TWFyZ2luQ29sdW1uO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBzaG93R3V0dGVyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykge1xuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyLnN0eWxlLmRpc3BsYXkgPSBzaG93ID8gXCJibG9ja1wiIDogXCJub25lXCI7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX0ZVTEwpO1xuICAgICAgICAgICAgdGhpcy5vbkd1dHRlclJlc2l6ZSgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGZhZGVGb2xkV2lkZ2V0czoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3cpIHtcbiAgICAgICAgICAgIHNldENzc0NsYXNzKHRoaXMuJGd1dHRlciwgXCJhY2VfZmFkZS1mb2xkLXdpZGdldHNcIiwgc2hvdyk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIHNob3dGb2xkV2lkZ2V0czoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3cpIHsgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0U2hvd0ZvbGRXaWRnZXRzKHNob3cpIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgc2hvd0xpbmVOdW1iZXJzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykge1xuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0U2hvd0xpbmVOdW1iZXJzKHNob3cpO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9HVVRURVIpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGRpc3BsYXlJbmRlbnRHdWlkZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG93KSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyLnNldERpc3BsYXlJbmRlbnRHdWlkZXMoc2hvdykpXG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9URVhUKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBoaWdobGlnaHRHdXR0ZXJMaW5lOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdWxkSGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0ID0gY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0LmNsYXNzTmFtZSA9IFwiYWNlX2d1dHRlci1hY3RpdmUtbGluZVwiO1xuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlci5hcHBlbmRDaGlsZCh0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0KTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuc3R5bGUuZGlzcGxheSA9IHNob3VsZEhpZ2hsaWdodCA/IFwiXCIgOiBcIm5vbmVcIjtcbiAgICAgICAgICAgIC8vIGlmIGN1cnNvcmxheWVyIGhhdmUgbmV2ZXIgYmVlbiB1cGRhdGVkIHRoZXJlJ3Mgbm90aGluZyBvbiBzY3JlZW4gdG8gdXBkYXRlXG4gICAgICAgICAgICBpZiAodGhpcy4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zKVxuICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQoKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZSxcbiAgICAgICAgdmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuJGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIHx8ICF0aGlzLiRob3JpelNjcm9sbClcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX1NDUk9MTCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuJHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIHx8ICF0aGlzLiR2U2Nyb2xsKVxuICAgICAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgZm9udFNpemU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihmb250U2l6ZTogc3RyaW5nKSB7XG4gICAgICAgICAgICB2YXIgdGhhdDogVmlydHVhbFJlbmRlcmVyID0gdGhpcztcbiAgICAgICAgICAgIHRoYXQuY29udGFpbmVyLnN0eWxlLmZvbnRTaXplID0gZm9udFNpemU7XG4gICAgICAgICAgICB0aGF0LnVwZGF0ZUZvbnRTaXplKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogXCIxMnB4XCJcbiAgICB9LFxuICAgIGZvbnRGYW1pbHk6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihmb250RmFtaWx5OiBzdHJpbmcpIHtcbiAgICAgICAgICAgIHZhciB0aGF0OiBWaXJ0dWFsUmVuZGVyZXIgPSB0aGlzO1xuICAgICAgICAgICAgdGhhdC5jb250YWluZXIuc3R5bGUuZm9udEZhbWlseSA9IGZvbnRGYW1pbHk7XG4gICAgICAgICAgICB0aGF0LnVwZGF0ZUZvbnRTaXplKCk7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIG1heExpbmVzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUZ1bGwoKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgbWluTGluZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlRnVsbCgpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBzY3JvbGxQYXN0RW5kOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB2YWwgPSArdmFsIHx8IDA7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2Nyb2xsUGFzdEVuZCA9PSB2YWwpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdGhpcy4kc2Nyb2xsUGFzdEVuZCA9IHZhbDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiAwLFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICBmaXhlZFdpZHRoR3V0dGVyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci4kZml4ZWRXaWR0aCA9ICEhdmFsO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9HVVRURVIpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICB0aGVtZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLnNldFRoZW1lKHZhbCkgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuJHRoZW1lSWQgfHwgdGhpcy50aGVtZTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcIi4vdGhlbWUvdGV4dG1hdGVcIixcbiAgICAgICAgaGFuZGxlc1NldDogdHJ1ZVxuICAgIH1cbn0pO1xuIl19