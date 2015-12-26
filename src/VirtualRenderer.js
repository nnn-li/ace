"use strict";
import { addCssClass, appendHTMLLinkElement, createElement, ensureHTMLStyleElement, removeCssClass, setCssClass } from "./lib/dom";
import { defineOptions, resetOptions } from "./config";
import { isOldIE } from "./lib/useragent";
import CursorLayer from "./layer/CursorLayer";
import FontMetrics from "./layer/FontMetrics";
import GutterLayer from "./layer/GutterLayer";
import MarkerLayer from "./layer/MarkerLayer";
import TextLayer from "./layer/TextLayer";
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
        this.$gutterLayer = new GutterLayer(this.$gutter);
        this.$gutterLayer.on("changeGutterWidth", this.onGutterResize.bind(this));
        this.$markerBack = new MarkerLayer(this.content);
        var textLayer = this.$textLayer = new TextLayer(this.content);
        this.canvas = textLayer.element;
        this.$markerFront = new MarkerLayer(this.content);
        this.$cursorLayer = new CursorLayer(this.content);
        this.$horizScroll = false;
        this.$vScroll = false;
        this.scrollBarV = new VScrollBar(this.container, this);
        this.scrollBarH = new HScrollBar(this.container, this);
        this.scrollBarV.on("scroll", (event, scrollBar) => {
            if (!this.$scrollAnimation) {
                this.session.setScrollTop(event.data - this.scrollMargin.top);
            }
        });
        this.scrollBarH.on("scroll", (event, scrollBar) => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlydHVhbFJlbmRlcmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiVmlydHVhbFJlbmRlcmVyLnRzIl0sIm5hbWVzIjpbImNoYW5nZXNUb1N0cmluZyIsIlZpcnR1YWxSZW5kZXJlciIsIlZpcnR1YWxSZW5kZXJlci5jb25zdHJ1Y3RvciIsIlZpcnR1YWxSZW5kZXJlci5vbiIsIlZpcnR1YWxSZW5kZXJlci5vZmYiLCJWaXJ0dWFsUmVuZGVyZXIubWF4TGluZXMiLCJWaXJ0dWFsUmVuZGVyZXIua2VlcFRleHRBcmVhQXRDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0RGVmYXVsdEN1cnNvclN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEN1cnNvckxheWVyT2ZmIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUNoYXJhY3RlclNpemUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2Vzc2lvbiIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVMaW5lcyIsIlZpcnR1YWxSZW5kZXJlci5vbkNoYW5nZU5ld0xpbmVNb2RlIiwiVmlydHVhbFJlbmRlcmVyLm9uQ2hhbmdlVGFiU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVUZXh0IiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUZ1bGwiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlRm9udFNpemUiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNpemVBc3luYyIsIlZpcnR1YWxSZW5kZXJlci5vblJlc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci4kdXBkYXRlQ2FjaGVkU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5vbkd1dHRlclJlc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5hZGp1c3RXcmFwTGltaXQiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0QW5pbWF0ZWRTY3JvbGwiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0QW5pbWF0ZWRTY3JvbGwiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2hvd0ludmlzaWJsZXMiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2hvd0ludmlzaWJsZXMiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0RGlzcGxheUluZGVudEd1aWRlcyIsIlZpcnR1YWxSZW5kZXJlci5zZXREaXNwbGF5SW5kZW50R3VpZGVzIiwiVmlydHVhbFJlbmRlcmVyLnNldFNob3dQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRTaG93UHJpbnRNYXJnaW4iLCJWaXJ0dWFsUmVuZGVyZXIuc2V0UHJpbnRNYXJnaW5Db2x1bW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0UHJpbnRNYXJnaW5Db2x1bW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2hvd0d1dHRlciIsIlZpcnR1YWxSZW5kZXJlci5zZXRTaG93R3V0dGVyIiwiVmlydHVhbFJlbmRlcmVyLmdldEZhZGVGb2xkV2lkZ2V0cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRGYWRlRm9sZFdpZGdldHMiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0SGlnaGxpZ2h0R3V0dGVyTGluZSIsIlZpcnR1YWxSZW5kZXJlci5nZXRIaWdobGlnaHRHdXR0ZXJMaW5lIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0IiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRDb250YWluZXJFbGVtZW50IiwiVmlydHVhbFJlbmRlcmVyLmdldE1vdXNlRXZlbnRUYXJnZXQiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0VGV4dEFyZWFDb250YWluZXIiLCJWaXJ0dWFsUmVuZGVyZXIuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLmdldEZpcnN0VmlzaWJsZVJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRGaXJzdEZ1bGx5VmlzaWJsZVJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRMYXN0RnVsbHlWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldFBhZGRpbmciLCJWaXJ0dWFsUmVuZGVyZXIuc2V0UGFkZGluZyIsIlZpcnR1YWxSZW5kZXJlci5zZXRTY3JvbGxNYXJnaW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNjcm9sbEJhclYiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNjcm9sbEJhckgiLCJWaXJ0dWFsUmVuZGVyZXIuZnJlZXplIiwiVmlydHVhbFJlbmRlcmVyLnVuZnJlZXplIiwiVmlydHVhbFJlbmRlcmVyLiRyZW5kZXJDaGFuZ2VzIiwiVmlydHVhbFJlbmRlcmVyLiRhdXRvc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci4kY29tcHV0ZUxheWVyQ29uZmlnIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVMaW5lcyIsIlZpcnR1YWxSZW5kZXJlci4kZ2V0TG9uZ2VzdExpbmUiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlRnJvbnRNYXJrZXJzIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUJhY2tNYXJrZXJzIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUJyZWFrcG9pbnRzIiwiVmlydHVhbFJlbmRlcmVyLnNldEFubm90YXRpb25zIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUN1cnNvciIsIlZpcnR1YWxSZW5kZXJlci5oaWRlQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLnNob3dDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsU2VsZWN0aW9uSW50b1ZpZXciLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXciLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2Nyb2xsVG9wIiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbExlZnQiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0U2Nyb2xsVG9wUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbEJvdHRvbVJvdyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb1JvdyIsIlZpcnR1YWxSZW5kZXJlci5hbGlnbkN1cnNvciIsIlZpcnR1YWxSZW5kZXJlci4kY2FsY1N0ZXBzIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvTGluZSIsIlZpcnR1YWxSZW5kZXJlci5hbmltYXRlU2Nyb2xsaW5nIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvWSIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb1giLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG8iLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsQnkiLCJWaXJ0dWFsUmVuZGVyZXIuaXNTY3JvbGxhYmxlQnkiLCJWaXJ0dWFsUmVuZGVyZXIucGl4ZWxUb1NjcmVlbkNvb3JkaW5hdGVzIiwiVmlydHVhbFJlbmRlcmVyLnNjcmVlblRvVGV4dENvb3JkaW5hdGVzIiwiVmlydHVhbFJlbmRlcmVyLnRleHRUb1NjcmVlbkNvb3JkaW5hdGVzIiwiVmlydHVhbFJlbmRlcmVyLnZpc3VhbGl6ZUZvY3VzIiwiVmlydHVhbFJlbmRlcmVyLnZpc3VhbGl6ZUJsdXIiLCJWaXJ0dWFsUmVuZGVyZXIuc2hvd0NvbXBvc2l0aW9uIiwiVmlydHVhbFJlbmRlcmVyLnNldENvbXBvc2l0aW9uVGV4dCIsIlZpcnR1YWxSZW5kZXJlci5oaWRlQ29tcG9zaXRpb24iLCJWaXJ0dWFsUmVuZGVyZXIuc2V0VGhlbWUiLCJWaXJ0dWFsUmVuZGVyZXIuYWRkQ3NzQ2xhc3MiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0Q3NzQ2xhc3MiLCJWaXJ0dWFsUmVuZGVyZXIuaW1wb3J0VGhlbWVMaW5rIiwiVmlydHVhbFJlbmRlcmVyLnNldFRoZW1lQ3NzIiwiVmlydHVhbFJlbmRlcmVyLmdldFRoZW1lIiwiVmlydHVhbFJlbmRlcmVyLnNldFN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnVuc2V0U3R5bGUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0Q3Vyc29yU3R5bGUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0TW91c2VDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuZGVzdHJveSJdLCJtYXBwaW5ncyI6IkFBb0RBLFlBQVksQ0FBQztPQUVOLEVBQUMsV0FBVyxFQUFFLHFCQUFxQixFQUFFLGFBQWEsRUFBRSxzQkFBc0IsRUFBRSxjQUFjLEVBQUUsV0FBVyxFQUFDLE1BQU0sV0FBVztPQUN6SCxFQUFDLGFBQWEsRUFBYyxZQUFZLEVBQUMsTUFBTSxVQUFVO09BQ3pELEVBQUMsT0FBTyxFQUFDLE1BQU0saUJBQWlCO09BR2hDLFdBQVcsTUFBTSxxQkFBcUI7T0FDdEMsV0FBVyxNQUFNLHFCQUFxQjtPQUN0QyxXQUFXLE1BQU0scUJBQXFCO09BQ3RDLFdBQVcsTUFBTSxxQkFBcUI7T0FFdEMsU0FBUyxNQUFNLG1CQUFtQjtPQUdsQyxVQUFVLE1BQU0sY0FBYztPQUM5QixVQUFVLE1BQU0sY0FBYztPQUU5QixVQUFVLE1BQU0sY0FBYztPQUM5QixpQkFBaUIsTUFBTSx5QkFBeUI7T0FLaEQsU0FBUyxNQUFNLGFBQWE7QUFPbkMsSUFBSSxhQUFhLEdBQUcsQ0FBQyxDQUFDO0FBQ3RCLElBQUksYUFBYSxHQUFHLENBQUMsQ0FBQztBQUN0QixJQUFJLGFBQWEsR0FBRyxDQUFDLENBQUM7QUFDdEIsSUFBSSxhQUFhLEdBQUcsQ0FBQyxDQUFDO0FBQ3RCLElBQUksWUFBWSxHQUFHLEVBQUUsQ0FBQztBQUN0QixJQUFJLFdBQVcsR0FBRyxFQUFFLENBQUM7QUFDckIsSUFBSSxXQUFXLEdBQUcsRUFBRSxDQUFDO0FBQ3JCLElBQUksa0JBQWtCLEdBQUcsR0FBRyxDQUFDO0FBQzdCLElBQUksbUJBQW1CLEdBQUcsR0FBRyxDQUFDO0FBQzlCLElBQUksV0FBVyxHQUFHLEdBQUcsQ0FBQztBQUN0QixJQUFJLGVBQWUsR0FBRyxJQUFJLENBQUM7QUFHM0IseUJBQXlCLE9BQWU7SUFDcENBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLENB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LElBQUlBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBRWpEQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUM5REEsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFFaENBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLElBQUlBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBRWxEQSxJQUFJQSxDQUFDQSxZQUFZQSxHQUFHQSxJQUFJQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUdsREEsSUFBSUEsQ0FBQ0EsWUFBWUEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDMUJBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLEtBQUtBLENBQUNBO1FBRXRCQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN2REEsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsSUFBSUEsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLEVBQUVBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLEtBQUtBLEVBQUVBLFNBQXFCQTtZQUN0REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDekJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2xFQSxDQUFDQTtR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VUFBVUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDeENBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEVBQ3JEQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUUzRkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsRUFDakZBLFdBQVdBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBRXRGQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUMzREEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsTUFBTUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDcEZBLElBQUlBLE9BQU9BLEdBQUdBLFFBQVFBLEdBQUdBLFNBQVNB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QTtZQUM5Q0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0E7UUFDakZBLENBQUNBO1FBRURBLElBQUlBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBRWpDQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsY0FBY0EsQ0FBQ0E7Z0JBQzNEQSxJQUFJQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUNuQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDckNBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLEdBQUdBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO1lBQzFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNsR0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsSUFBSUEsSUFBSUEsQ0FBQ0EsUUFBUUEsSUFBSUEsSUFBSUEsR0FBR0EsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDOUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ2xDQSxDQUFDQTtJQUNMQSxDQUFDQTtJQU9EdkUsWUFBWUE7UUFDUndFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO0lBQ3ZDQSxDQUFDQTtJQU9EeEUsYUFBYUE7UUFDVHlFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLEVBQUVBLENBQUNBO0lBQ3hDQSxDQUFDQTtJQU9EekUsZUFBZUE7UUFDWDBFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO0lBQzVDQSxDQUFDQTtJQU9EMUUsa0JBQWtCQTtRQUNkMkUsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDdkdBLENBQUNBO0lBU0QzRSxXQUFXQSxDQUFDQSxHQUFXQTtRQUNuQjRFLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0lBQ3JEQSxDQUFDQTtJQUVENUUsV0FBV0EsQ0FBQ0EsTUFBTUEsRUFBZ0JBLFNBQWlCQTtRQUUvQzZFLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLE1BQU1BLElBQUlBLFFBQVFBLENBQUNBO1lBQzFCQSxNQUFNQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUV4Q0EsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNyREEsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFDcERBLElBQUlBLE1BQU1BLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBRTVDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNsQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7SUFDbEJBLENBQUNBO0lBRUQ3RSxVQUFVQSxDQUFDQSxTQUFpQkEsRUFBRUEsT0FBZUE7UUFDekM4RSxJQUFJQSxDQUFDQSxHQUFXQSxDQUFDQSxDQUFDQTtRQUNsQkEsSUFBSUEsQ0FBQ0EsR0FBV0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDM0JBLElBQUlBLEtBQUtBLEdBQWFBLEVBQUVBLENBQUNBO1FBRXpCQSxJQUFJQSxJQUFJQSxHQUFHQSxVQUFTQSxDQUFTQSxFQUFFQSxLQUFhQSxFQUFFQSxFQUFVQTtZQUNwRCxNQUFNLENBQUMsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQztRQUNqRCxDQUFDLENBQUNBO1FBRUZBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQ3JCQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxTQUFTQSxFQUFFQSxPQUFPQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNyRUEsQ0FBQ0E7UUFFREEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDakJBLENBQUNBO0lBU0Q5RSxZQUFZQSxDQUFDQSxJQUFZQSxFQUFFQSxNQUFlQSxFQUFFQSxPQUFnQkEsRUFBRUEsUUFBb0JBO1FBQzlFK0UsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxJQUFJQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUN2RUEsSUFBSUEsTUFBTUEsR0FBR0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDckJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ1RBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzVDQSxDQUFDQTtRQUVEQSxJQUFJQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUNuQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDbENBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEtBQUtBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBLGFBQWFBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO1FBQ25EQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVEL0UsZ0JBQWdCQSxDQUFDQSxTQUFpQkEsRUFBRUEsUUFBU0E7UUFDekNnRixJQUFJQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUM3QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBQ0RBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO1FBRWpCQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxJQUFJQSxPQUFPQSxDQUFDQTtZQUNyQkEsTUFBTUEsQ0FBQ0E7UUFFWEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4QkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUMzQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xCQSxTQUFTQSxHQUFHQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDeEJBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLElBQUlBLE9BQU9BLENBQUNBO29CQUNyQkEsTUFBTUEsQ0FBQ0E7WUFDZkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsSUFBSUEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsU0FBU0EsRUFBRUEsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDakRBLElBQUlBLENBQUNBLGdCQUFnQkEsR0FBR0EsRUFBRUEsSUFBSUEsRUFBRUEsU0FBU0EsRUFBRUEsRUFBRUEsRUFBRUEsT0FBT0EsRUFBRUEsS0FBS0EsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0E7UUFFdkVBLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRTNCQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUUxQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsR0FBR0EsT0FBT0EsQ0FBQ0E7UUFDbkNBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLFdBQVdBLENBQUNBO1lBQ3RCLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNmLEtBQUssQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO2dCQUMxQyxLQUFLLENBQUMsT0FBTyxDQUFDLFVBQVUsR0FBRyxPQUFPLENBQUM7WUFDdkMsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDekIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQzlCLEtBQUssQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUNwQyxPQUFPLEdBQUcsSUFBSSxDQUFDO1lBQ25CLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFFSixLQUFLLENBQUMsTUFBTSxHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzNDLEtBQUssQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7Z0JBQzlCLFFBQVEsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUMzQixDQUFDO1FBQ0wsQ0FBQyxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUNYQSxDQUFDQTtJQU1EaEYsU0FBU0EsQ0FBQ0EsU0FBaUJBO1FBR3ZCaUYsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsS0FBS0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDL0JBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLFNBQVNBLENBQUNBO1lBQzNCQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtRQUN2Q0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFNRGpGLFNBQVNBLENBQUNBLFVBQWtCQTtRQUN4QmtGLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLEtBQUtBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pDQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxVQUFVQSxDQUFDQTtZQUM3QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7UUFDekNBLENBQUNBO0lBQ0xBLENBQUNBO0lBT0RsRixRQUFRQSxDQUFDQSxDQUFTQSxFQUFFQSxDQUFTQTtRQUN6Qm1GLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzdCQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNsQ0EsQ0FBQ0E7SUFTRG5GLFFBQVFBLENBQUNBLE1BQWNBLEVBQUVBLE1BQWNBO1FBQ25Db0YsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsRUFBRUEsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDMUVBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLEVBQUVBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBO0lBQ2hGQSxDQUFDQTtJQVVEcEYsY0FBY0EsQ0FBQ0EsTUFBY0EsRUFBRUEsTUFBY0E7UUFDekNxRixFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUN2RUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBO2NBQ25FQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUM3REEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBO1lBQ3pFQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNoQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsYUFBYUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsYUFBYUE7Y0FDbkVBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBO1lBQ3hEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFFRHJGLHdCQUF3QkEsQ0FBQ0EsQ0FBU0EsRUFBRUEsQ0FBU0E7UUFDekNzRixJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxxQkFBcUJBLEVBQUVBLENBQUNBO1FBRXREQSxJQUFJQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxTQUFTQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQTtRQUMxRkEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDN0VBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRTdCQSxNQUFNQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxHQUFHQSxFQUFFQSxJQUFJQSxFQUFFQSxNQUFNQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQTtJQUN0RUEsQ0FBQ0E7SUFFRHRGLHVCQUF1QkEsQ0FBQ0EsT0FBZUEsRUFBRUEsT0FBZUE7UUFDcER1RixJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxxQkFBcUJBLEVBQUVBLENBQUNBO1FBRXREQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxTQUFTQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQTtRQUU1R0EsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFFdkVBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLHdCQUF3QkEsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDM0VBLENBQUNBO0lBUUR2Rix1QkFBdUJBLENBQUNBLEdBQVdBLEVBQUVBLE1BQWNBO1FBQy9Dd0YsSUFBSUEsU0FBU0Es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KiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQtMjAxNiBEYXZpZCBHZW8gSG9sbWVzIDxkYXZpZC5nZW8uaG9sbWVzQGdtYWlsLmNvbT5cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW4gYWxsXG4gKiBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEVcbiAqIFNPRlRXQVJFLlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cbi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbmltcG9ydCB7YWRkQ3NzQ2xhc3MsIGFwcGVuZEhUTUxMaW5rRWxlbWVudCwgY3JlYXRlRWxlbWVudCwgZW5zdXJlSFRNTFN0eWxlRWxlbWVudCwgcmVtb3ZlQ3NzQ2xhc3MsIHNldENzc0NsYXNzfSBmcm9tIFwiLi9saWIvZG9tXCI7XG5pbXBvcnQge2RlZmluZU9wdGlvbnMsIGxvYWRNb2R1bGUsIHJlc2V0T3B0aW9uc30gZnJvbSBcIi4vY29uZmlnXCI7XG5pbXBvcnQge2lzT2xkSUV9IGZyb20gXCIuL2xpYi91c2VyYWdlbnRcIjtcbmltcG9ydCBBbm5vdGF0aW9uIGZyb20gJy4vQW5ub3RhdGlvbic7XG5cbmltcG9ydCBDdXJzb3JMYXllciBmcm9tIFwiLi9sYXllci9DdXJzb3JMYXllclwiO1xuaW1wb3J0IEZvbnRNZXRyaWNzIGZyb20gXCIuL2xheWVyL0ZvbnRNZXRyaWNzXCI7XG5pbXBvcnQgR3V0dGVyTGF5ZXIgZnJvbSBcIi4vbGF5ZXIvR3V0dGVyTGF5ZXJcIjtcbmltcG9ydCBNYXJrZXJMYXllciBmcm9tIFwiLi9sYXllci9NYXJrZXJMYXllclwiO1xuaW1wb3J0IFByaW50TWFyZ2luTGF5ZXIgZnJvbSBcIi4vbGF5ZXIvUHJpbnRNYXJnaW5MYXllclwiO1xuaW1wb3J0IFRleHRMYXllciBmcm9tIFwiLi9sYXllci9UZXh0TGF5ZXJcIjtcblxuLy8gVE9ETzogXG5pbXBvcnQgVlNjcm9sbEJhciBmcm9tIFwiLi9WU2Nyb2xsQmFyXCI7XG5pbXBvcnQgSFNjcm9sbEJhciBmcm9tIFwiLi9IU2Nyb2xsQmFyXCI7XG5cbmltcG9ydCBSZW5kZXJMb29wIGZyb20gXCIuL1JlbmRlckxvb3BcIjtcbmltcG9ydCBFdmVudEVtaXR0ZXJDbGFzcyBmcm9tIFwiLi9saWIvRXZlbnRFbWl0dGVyQ2xhc3NcIjtcbmltcG9ydCBFZGl0U2Vzc2lvbiBmcm9tICcuL0VkaXRTZXNzaW9uJztcbmltcG9ydCBFdmVudEJ1cyBmcm9tICcuL0V2ZW50QnVzJztcbmltcG9ydCBPcHRpb25zUHJvdmlkZXIgZnJvbSBcIi4vT3B0aW9uc1Byb3ZpZGVyXCI7XG5pbXBvcnQgUG9zaXRpb24gZnJvbSAnLi9Qb3NpdGlvbic7XG5pbXBvcnQgVGhlbWVMaW5rIGZyb20gJy4vVGhlbWVMaW5rJztcbmltcG9ydCBFZGl0b3JSZW5kZXJlciBmcm9tICcuL0VkaXRvclJlbmRlcmVyJztcblxuLy8gRklYTUVcbi8vIGltcG9ydCBlZGl0b3JDc3MgPSByZXF1aXJlKFwiLi9yZXF1aXJlanMvdGV4dCEuL2Nzcy9lZGl0b3IuY3NzXCIpO1xuLy8gZW5zdXJlSFRNTFN0eWxlRWxlbWVudChlZGl0b3JDc3MsIFwiYWNlX2VkaXRvclwiKTtcblxudmFyIENIQU5HRV9DVVJTT1IgPSAxO1xudmFyIENIQU5HRV9NQVJLRVIgPSAyO1xudmFyIENIQU5HRV9HVVRURVIgPSA0O1xudmFyIENIQU5HRV9TQ1JPTEwgPSA4O1xudmFyIENIQU5HRV9MSU5FUyA9IDE2O1xudmFyIENIQU5HRV9URVhUID0gMzI7XG52YXIgQ0hBTkdFX1NJWkUgPSA2NDtcbnZhciBDSEFOR0VfTUFSS0VSX0JBQ0sgPSAxMjg7XG52YXIgQ0hBTkdFX01BUktFUl9GUk9OVCA9IDI1NjtcbnZhciBDSEFOR0VfRlVMTCA9IDUxMjtcbnZhciBDSEFOR0VfSF9TQ1JPTEwgPSAxMDI0O1xuXG4vLyBVc2VmdWwgZm9yIGRlYnVnZ2luZy4uLlxuZnVuY3Rpb24gY2hhbmdlc1RvU3RyaW5nKGNoYW5nZXM6IG51bWJlcik6IHN0cmluZyB7XG4gICAgdmFyIGEgPSBcIlwiXG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfQ1VSU09SKSBhICs9IFwiIGN1cnNvclwiO1xuICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX01BUktFUikgYSArPSBcIiBtYXJrZXJcIjtcbiAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9HVVRURVIpIGEgKz0gXCIgZ3V0dGVyXCI7XG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfU0NST0xMKSBhICs9IFwiIHNjcm9sbFwiO1xuICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0xJTkVTKSBhICs9IFwiIGxpbmVzXCI7XG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfVEVYVCkgYSArPSBcIiB0ZXh0XCI7XG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfU0laRSkgYSArPSBcIiBzaXplXCI7XG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfTUFSS0VSX0JBQ0spIGEgKz0gXCIgbWFya2VyX2JhY2tcIjtcbiAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9NQVJLRVJfRlJPTlQpIGEgKz0gXCIgbWFya2VyX2Zyb250XCI7XG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfRlVMTCkgYSArPSBcIiBmdWxsXCI7XG4gICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfSF9TQ1JPTEwpIGEgKz0gXCIgaF9zY3JvbGxcIjtcbiAgICByZXR1cm4gYS50cmltKCk7XG59XG5cbi8qKlxuICogVGhlIGNsYXNzIHRoYXQgaXMgcmVzcG9uc2libGUgZm9yIGRyYXdpbmcgZXZlcnl0aGluZyB5b3Ugc2VlIG9uIHRoZSBzY3JlZW4hXG4gKlxuICogQGNsYXNzIFZpcnR1YWxSZW5kZXJlclxuICovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBWaXJ0dWFsUmVuZGVyZXIgaW1wbGVtZW50cyBFdmVudEJ1czxWaXJ0dWFsUmVuZGVyZXI+LCBFZGl0b3JSZW5kZXJlciwgT3B0aW9uc1Byb3ZpZGVyIHtcbiAgICBwdWJsaWMgdGV4dGFyZWE6IEhUTUxUZXh0QXJlYUVsZW1lbnQ7XG4gICAgcHVibGljIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG4gICAgcHVibGljIHNjcm9sbExlZnQgPSAwO1xuICAgIHB1YmxpYyBzY3JvbGxUb3AgPSAwO1xuICAgIHB1YmxpYyBsYXllckNvbmZpZyA9IHtcbiAgICAgICAgd2lkdGg6IDEsXG4gICAgICAgIHBhZGRpbmc6IDAsXG4gICAgICAgIGZpcnN0Um93OiAwLFxuICAgICAgICBmaXJzdFJvd1NjcmVlbjogMCxcbiAgICAgICAgbGFzdFJvdzogMCxcbiAgICAgICAgbGluZUhlaWdodDogMCxcbiAgICAgICAgY2hhcmFjdGVyV2lkdGg6IDAsXG4gICAgICAgIG1pbkhlaWdodDogMSxcbiAgICAgICAgbWF4SGVpZ2h0OiAxLFxuICAgICAgICBvZmZzZXQ6IDAsXG4gICAgICAgIGhlaWdodDogMSxcbiAgICAgICAgZ3V0dGVyT2Zmc2V0OiAxXG4gICAgfTtcbiAgICBwdWJsaWMgJG1heExpbmVzOiBudW1iZXI7XG4gICAgcHVibGljICRtaW5MaW5lczogbnVtYmVyO1xuXG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5ICRjdXJzb3JMYXllclxuICAgICAqIEB0eXBlIEN1cnNvckxheWVyXG4gICAgICovXG4gICAgcHVibGljICRjdXJzb3JMYXllcjogQ3Vyc29yTGF5ZXI7XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkgJGd1dHRlckxheWVyXG4gICAgICogQHR5cGUgR3V0dGVyTGF5ZXJcbiAgICAgKi9cbiAgICBwdWJsaWMgJGd1dHRlckxheWVyOiBHdXR0ZXJMYXllcjtcblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSAkbWFya2VyRnJvbnRcbiAgICAgKiBAdHlwZSBNYXJrZXJMYXllclxuICAgICAqL1xuICAgIHByaXZhdGUgJG1hcmtlckZyb250OiBNYXJrZXJMYXllcjtcblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSAkbWFya2VyQmFja1xuICAgICAqIEB0eXBlIE1hcmtlckxheWVyXG4gICAgICovXG4gICAgcHJpdmF0ZSAkbWFya2VyQmFjazogTWFya2VyTGF5ZXI7XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkgJHRleHRMYXllclxuICAgICAqIEB0eXBlIFRleHRMYXllclxuICAgICAqL1xuICAgIHB1YmxpYyAkdGV4dExheWVyOiBUZXh0TGF5ZXI7XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkgJHBhZGRpbmdcbiAgICAgKiBAdHlwZSBudW1iZXJcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEBkZWZhdWx0IDBcbiAgICAgKi9cbiAgICBwcml2YXRlICRwYWRkaW5nOiBudW1iZXIgPSAwO1xuXG4gICAgcHJpdmF0ZSAkZnJvemVuID0gZmFsc2U7XG5cbiAgICAvLyBUaGUgdGhlbWVJZCBpcyB3aGF0IGlzIGNvbW11bmljYXRlZCBpbiB0aGUgQVBJLlxuICAgIHByaXZhdGUgJHRoZW1lSWQ6IHN0cmluZztcbiAgICAvKipcbiAgICAgKiBUaGUgbG9hZGVkIHRoZW1lIG9iamVjdC4gVGhpcyBhbGxvd3MgdXMgdG8gcmVtb3ZlIGEgdGhlbWUuXG4gICAgICovXG4gICAgcHJpdmF0ZSB0aGVtZTogeyBjc3NDbGFzczogc3RyaW5nIH07XG5cbiAgICBwcml2YXRlICR0aW1lcjtcbiAgICBwcml2YXRlIFNURVBTID0gODtcbiAgICBwdWJsaWMgJGtlZXBUZXh0QXJlYUF0Q3Vyc29yOiBib29sZWFuO1xuICAgIHB1YmxpYyAkZ3V0dGVyOiBIVE1MRGl2RWxlbWVudDtcbiAgICBwdWJsaWMgc2Nyb2xsZXI6IEhUTUxEaXZFbGVtZW50O1xuICAgIHB1YmxpYyBjb250ZW50OiBIVE1MRGl2RWxlbWVudDtcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTERpdkVsZW1lbnQ7XG4gICAgcHJpdmF0ZSAkaG9yaXpTY3JvbGw6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkdlNjcm9sbDogYm9vbGVhbjtcbiAgICBwdWJsaWMgc2Nyb2xsQmFySDogSFNjcm9sbEJhcjtcbiAgICBwdWJsaWMgc2Nyb2xsQmFyVjogVlNjcm9sbEJhcjtcbiAgICBwcml2YXRlICRzY3JvbGxBbmltYXRpb246IHsgZnJvbTogbnVtYmVyOyB0bzogbnVtYmVyOyBzdGVwczogbnVtYmVyW10gfTtcbiAgICBwdWJsaWMgJHNjcm9sbGJhcldpZHRoOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBzZXNzaW9uOiBFZGl0U2Vzc2lvbjtcbiAgICBwcml2YXRlIGV2ZW50QnVzOiBFdmVudEVtaXR0ZXJDbGFzczxWaXJ0dWFsUmVuZGVyZXI+O1xuXG4gICAgcHJpdmF0ZSBzY3JvbGxNYXJnaW4gPSB7XG4gICAgICAgIGxlZnQ6IDAsXG4gICAgICAgIHJpZ2h0OiAwLFxuICAgICAgICB0b3A6IDAsXG4gICAgICAgIGJvdHRvbTogMCxcbiAgICAgICAgdjogMCxcbiAgICAgICAgaDogMFxuICAgIH07XG5cbiAgICBwcml2YXRlICRmb250TWV0cmljczogRm9udE1ldHJpY3M7XG4gICAgcHJpdmF0ZSAkYWxsb3dCb2xkRm9udHM7XG4gICAgcHJpdmF0ZSBjdXJzb3JQb3M7XG5cbiAgICAvKipcbiAgICAgKiBBIGNhY2hlIG9mIHZhcmlvdXMgc2l6ZXMgVEJBLlxuICAgICAqL1xuICAgIHB1YmxpYyAkc2l6ZTogeyBoZWlnaHQ6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgc2Nyb2xsZXJIZWlnaHQ6IG51bWJlcjsgc2Nyb2xsZXJXaWR0aDsgJGRpcnR5OiBib29sZWFuIH07XG5cbiAgICBwcml2YXRlICRsb29wOiBSZW5kZXJMb29wO1xuICAgIHByaXZhdGUgJGNoYW5nZWRMaW5lcztcbiAgICBwcml2YXRlICRjaGFuZ2VzID0gMDtcbiAgICBwcml2YXRlIHJlc2l6aW5nO1xuICAgIHByaXZhdGUgJGd1dHRlckxpbmVIaWdobGlnaHQ7XG4gICAgLy8gRklYTUU6IFdoeSBkbyB3ZSBoYXZlIHR3bz9cbiAgICBwdWJsaWMgZ3V0dGVyV2lkdGg6IG51bWJlcjtcbiAgICBwcml2YXRlICRndXR0ZXJXaWR0aDogbnVtYmVyO1xuXG4gICAgLyoqXG4gICAgICogVE9ETzogQ3JlYXRlIGEgUHJpbnRNYXJnaW5MYXllciBjbGFzcyBpbiB0aGUgbGF5ZXIgZm9sZGVyLlxuICAgICAqL1xuICAgIHByaXZhdGUgJHByaW50TWFyZ2luRWw6IEhUTUxEaXZFbGVtZW50O1xuICAgIHByaXZhdGUgJHByaW50TWFyZ2luQ29sdW1uO1xuICAgIHByaXZhdGUgJHNob3dQcmludE1hcmdpbjogYm9vbGVhbjtcblxuICAgIHByaXZhdGUgZ2V0T3B0aW9uO1xuICAgIHByaXZhdGUgc2V0T3B0aW9uO1xuXG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5IGNoYXJhY3RlcldpZHRoXG4gICAgICogQHR5cGUgbnVtYmVyXG4gICAgICovXG4gICAgcHVibGljIGNoYXJhY3RlcldpZHRoOiBudW1iZXI7XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkgbGluZUhlaWdodFxuICAgICAqIEB0eXBlIG51bWJlclxuICAgICAqL1xuICAgIHB1YmxpYyBsaW5lSGVpZ2h0OiBudW1iZXI7XG5cbiAgICBwcml2YXRlICRleHRyYUhlaWdodDtcbiAgICBwcml2YXRlICRjb21wb3NpdGlvbjogeyBrZWVwVGV4dEFyZWFBdEN1cnNvcjogYm9vbGVhbjsgY3NzVGV4dDogc3RyaW5nIH07XG4gICAgcHJpdmF0ZSAkaFNjcm9sbEJhckFsd2F5c1Zpc2libGU7XG4gICAgcHJpdmF0ZSAkdlNjcm9sbEJhckFsd2F5c1Zpc2libGU7XG4gICAgcHJpdmF0ZSAkc2hvd0d1dHRlcjtcbiAgICBwcml2YXRlIHNob3dJbnZpc2libGVzO1xuICAgIHByaXZhdGUgJGFuaW1hdGVkU2Nyb2xsOiBib29sZWFuO1xuICAgIHByaXZhdGUgJHNjcm9sbFBhc3RFbmQ7XG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0R3V0dGVyTGluZTtcbiAgICBwcml2YXRlIGRlc2lyZWRIZWlnaHQ6IG51bWJlcjtcblxuICAgIC8qKlxuICAgICAqIENvbnN0cnVjdHMgYSBuZXcgYFZpcnR1YWxSZW5kZXJlcmAgd2l0aGluIHRoZSBgY29udGFpbmVyYCBzcGVjaWZpZWQuXG4gICAgICpcbiAgICAgKiBAY2xhc3MgVmlydHVhbFJlbmRlcmVyXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQHBhcmFtIGNvbnRhaW5lciB7SFRNTEVsZW1lbnR9IFRoZSByb290IGVsZW1lbnQgb2YgdGhlIGVkaXRvci5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3Rvcihjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMgPSBuZXcgRXZlbnRFbWl0dGVyQ2xhc3M8VmlydHVhbFJlbmRlcmVyPih0aGlzKTtcblxuICAgICAgICB0aGlzLmNvbnRhaW5lciA9IGNvbnRhaW5lciB8fCA8SFRNTERpdkVsZW1lbnQ+Y3JlYXRlRWxlbWVudChcImRpdlwiKTtcblxuICAgICAgICAvLyBUT0RPOiB0aGlzIGJyZWFrcyByZW5kZXJpbmcgaW4gQ2xvdWQ5IHdpdGggbXVsdGlwbGUgYWNlIGluc3RhbmNlc1xuICAgICAgICAvLyAvLyBJbXBvcnRzIENTUyBvbmNlIHBlciBET00gZG9jdW1lbnQgKCdhY2VfZWRpdG9yJyBzZXJ2ZXMgYXMgYW4gaWRlbnRpZmllcikuXG4gICAgICAgIC8vIGVuc3VyZUhUTUxTdHlsZUVsZW1lbnQoZWRpdG9yQ3NzLCBcImFjZV9lZGl0b3JcIiwgY29udGFpbmVyLm93bmVyRG9jdW1lbnQpO1xuXG4gICAgICAgIC8vIGluIElFIDw9IDkgdGhlIG5hdGl2ZSBjdXJzb3IgYWx3YXlzIHNoaW5lcyB0aHJvdWdoXG4gICAgICAgIHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0gIWlzT2xkSUU7XG5cbiAgICAgICAgYWRkQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIFwiYWNlX2VkaXRvclwiKTtcblxuICAgICAgICB0aGlzLiRndXR0ZXIgPSA8SFRNTERpdkVsZW1lbnQ+Y3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGhpcy4kZ3V0dGVyLmNsYXNzTmFtZSA9IFwiYWNlX2d1dHRlclwiO1xuICAgICAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLiRndXR0ZXIpO1xuXG4gICAgICAgIHRoaXMuc2Nyb2xsZXIgPSA8SFRNTERpdkVsZW1lbnQ+Y3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGhpcy5zY3JvbGxlci5jbGFzc05hbWUgPSBcImFjZV9zY3JvbGxlclwiO1xuICAgICAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLnNjcm9sbGVyKTtcblxuICAgICAgICB0aGlzLmNvbnRlbnQgPSA8SFRNTERpdkVsZW1lbnQ+Y3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGhpcy5jb250ZW50LmNsYXNzTmFtZSA9IFwiYWNlX2NvbnRlbnRcIjtcbiAgICAgICAgdGhpcy5zY3JvbGxlci5hcHBlbmRDaGlsZCh0aGlzLmNvbnRlbnQpO1xuXG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyID0gbmV3IEd1dHRlckxheWVyKHRoaXMuJGd1dHRlcik7XG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyLm9uKFwiY2hhbmdlR3V0dGVyV2lkdGhcIiwgdGhpcy5vbkd1dHRlclJlc2l6ZS5iaW5kKHRoaXMpKTtcblxuICAgICAgICB0aGlzLiRtYXJrZXJCYWNrID0gbmV3IE1hcmtlckxheWVyKHRoaXMuY29udGVudCk7XG5cbiAgICAgICAgdmFyIHRleHRMYXllciA9IHRoaXMuJHRleHRMYXllciA9IG5ldyBUZXh0TGF5ZXIodGhpcy5jb250ZW50KTtcbiAgICAgICAgdGhpcy5jYW52YXMgPSB0ZXh0TGF5ZXIuZWxlbWVudDtcblxuICAgICAgICB0aGlzLiRtYXJrZXJGcm9udCA9IG5ldyBNYXJrZXJMYXllcih0aGlzLmNvbnRlbnQpO1xuXG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyID0gbmV3IEN1cnNvckxheWVyKHRoaXMuY29udGVudCk7XG5cbiAgICAgICAgLy8gSW5kaWNhdGVzIHdoZXRoZXIgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyIGlzIHZpc2libGVcbiAgICAgICAgdGhpcy4kaG9yaXpTY3JvbGwgPSBmYWxzZTtcbiAgICAgICAgdGhpcy4kdlNjcm9sbCA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMuc2Nyb2xsQmFyViA9IG5ldyBWU2Nyb2xsQmFyKHRoaXMuY29udGFpbmVyLCB0aGlzKTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJIID0gbmV3IEhTY3JvbGxCYXIodGhpcy5jb250YWluZXIsIHRoaXMpO1xuICAgICAgICB0aGlzLnNjcm9sbEJhclYub24oXCJzY3JvbGxcIiwgKGV2ZW50LCBzY3JvbGxCYXI6IFZTY3JvbGxCYXIpID0+IHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kc2Nyb2xsQW5pbWF0aW9uKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChldmVudC5kYXRhIC0gdGhpcy5zY3JvbGxNYXJnaW4udG9wKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFySC5vbihcInNjcm9sbFwiLCAoZXZlbnQsIHNjcm9sbEJhcjogSFNjcm9sbEJhcikgPT4ge1xuICAgICAgICAgICAgaWYgKCF0aGlzLiRzY3JvbGxBbmltYXRpb24pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdChldmVudC5kYXRhIC0gdGhpcy5zY3JvbGxNYXJnaW4ubGVmdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuY3Vyc29yUG9zID0ge1xuICAgICAgICAgICAgcm93OiAwLFxuICAgICAgICAgICAgY29sdW1uOiAwXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy4kZm9udE1ldHJpY3MgPSBuZXcgRm9udE1ldHJpY3ModGhpcy5jb250YWluZXIsIDUwMCk7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci4kc2V0Rm9udE1ldHJpY3ModGhpcy4kZm9udE1ldHJpY3MpO1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIub24oXCJjaGFuZ2VDaGFyYWN0ZXJTaXplXCIsIChldmVudCwgdGV4dDogVGV4dExheWVyKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUNoYXJhY3RlclNpemUoKTtcbiAgICAgICAgICAgIHRoaXMub25SZXNpemUodHJ1ZSwgdGhpcy5ndXR0ZXJXaWR0aCwgdGhpcy4kc2l6ZS53aWR0aCwgdGhpcy4kc2l6ZS5oZWlnaHQpO1xuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBAZXZlbnQgY2hhbmdlQ2hhcmFjdGVyU2l6ZVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VDaGFyYWN0ZXJTaXplXCIsIGV2ZW50KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy4kc2l6ZSA9IHtcbiAgICAgICAgICAgIHdpZHRoOiAwLFxuICAgICAgICAgICAgaGVpZ2h0OiAwLFxuICAgICAgICAgICAgc2Nyb2xsZXJIZWlnaHQ6IDAsXG4gICAgICAgICAgICBzY3JvbGxlcldpZHRoOiAwLFxuICAgICAgICAgICAgJGRpcnR5OiB0cnVlXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy4kbG9vcCA9IG5ldyBSZW5kZXJMb29wKHRoaXMuJHJlbmRlckNoYW5nZXMuYmluZCh0aGlzKSwgdGhpcy5jb250YWluZXIub3duZXJEb2N1bWVudC5kZWZhdWx0Vmlldyk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuXG4gICAgICAgIHRoaXMudXBkYXRlQ2hhcmFjdGVyU2l6ZSgpO1xuICAgICAgICB0aGlzLnNldFBhZGRpbmcoNCk7XG4gICAgICAgIHJlc2V0T3B0aW9ucyh0aGlzKTtcbiAgICAgICAgLy8gRklYTUU6IFRoaXMgd2FzIGEgc2lnbmFsIHRvIGEgZ2xvYmFsIGNvbmZpZyBvYmplY3QuXG4gICAgICAgIC8vIFdoeSBkbyBFZGl0b3IgYW5kIEVkaXRTZXNzaW9uIHNpZ25hbCB3aGlsZSB0aGlzIGVtaXRzP1xuICAgICAgICAvL19lbWl0KFwicmVuZGVyZXJcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBvblxuICAgICAqIEBwYXJhbSBldmVudE5hbWUge3N0cmluZ31cbiAgICAgKiBAcGFyYW0gY2FsbGJhY2sgeyhldmVudCwgc291cmNlOiBWaXJ0dWFsUmVuZGVyZXIpID0+IGFueX1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIG9uKGV2ZW50TmFtZTogc3RyaW5nLCBjYWxsYmFjazogKGV2ZW50OiBhbnksIHNvdXJjZTogVmlydHVhbFJlbmRlcmVyKSA9PiBhbnkpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5vbihldmVudE5hbWUsIGNhbGxiYWNrLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBvZmZcbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIHtzdHJpbmd9XG4gICAgICogQHBhcmFtIGNhbGxiYWNrIHsoZXZlbnQsIHNvdXJjZTogVmlydHVhbFJlbmRlcmVyKSA9PiBhbnl9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBvZmYoZXZlbnROYW1lOiBzdHJpbmcsIGNhbGxiYWNrOiAoZXZlbnQ6IGFueSwgc291cmNlOiBWaXJ0dWFsUmVuZGVyZXIpID0+IGFueSk6IHZvaWQge1xuICAgICAgICB0aGlzLmV2ZW50QnVzLm9mZihldmVudE5hbWUsIGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkgbWF4TGluZXNcbiAgICAgKiBAdHlwZSBudW1iZXJcbiAgICAgKi9cbiAgICBzZXQgbWF4TGluZXMobWF4TGluZXM6IG51bWJlcikge1xuICAgICAgICB0aGlzLiRtYXhMaW5lcyA9IG1heExpbmVzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSBrZWVwVGV4dEFyZWFBdEN1cnNvclxuICAgICAqIEB0eXBlIGJvb2xlYW5cbiAgICAgKi9cbiAgICBzZXQga2VlcFRleHRBcmVhQXRDdXJzb3Ioa2VlcFRleHRBcmVhQXRDdXJzb3I6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSBrZWVwVGV4dEFyZWFBdEN1cnNvcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSA8Y29kZT5zdHlsZTwvY29kZT4gcHJvcGVydHkgb2YgdGhlIGNvbnRlbnQgdG8gXCJkZWZhdWx0XCIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldERlZmF1bHRDdXJzb3JTdHlsZVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0RGVmYXVsdEN1cnNvclN0eWxlKCk6IHZvaWQge1xuICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUuY3Vyc29yID0gXCJkZWZhdWx0XCI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgPGNvZGU+b3BhY2l0eTwvY29kZT4gb2YgdGhlIGN1cnNvciBsYXllciB0byBcIjBcIi5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0Q3Vyc29yTGF5ZXJPZmZcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBjaGFpbmFibGVcbiAgICAgKi9cbiAgICBzZXRDdXJzb3JMYXllck9mZigpOiB2b2lkIHtcbiAgICAgICAgdmFyIG5vb3AgPSBmdW5jdGlvbigpIHsgfTtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIucmVzdGFydFRpbWVyID0gbm9vcDtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuZWxlbWVudC5zdHlsZS5vcGFjaXR5ID0gXCIwXCI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCB1cGRhdGVDaGFyYWN0ZXJTaXplXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICB1cGRhdGVDaGFyYWN0ZXJTaXplKCk6IHZvaWQge1xuICAgICAgICAvLyBGSVhNRTogREdIIGFsbG93Qm9sZEZvbnRzIGRvZXMgbm90IGV4aXN0IG9uIFRleHRMYXllclxuICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyWydhbGxvd0JvbGRGb250cyddICE9IHRoaXMuJGFsbG93Qm9sZEZvbnRzKSB7XG4gICAgICAgICAgICB0aGlzLiRhbGxvd0JvbGRGb250cyA9IHRoaXMuJHRleHRMYXllclsnYWxsb3dCb2xkRm9udHMnXTtcbiAgICAgICAgICAgIHRoaXMuc2V0U3R5bGUoXCJhY2Vfbm9ib2xkXCIsICF0aGlzLiRhbGxvd0JvbGRGb250cyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmxheWVyQ29uZmlnLmNoYXJhY3RlcldpZHRoID0gdGhpcy5jaGFyYWN0ZXJXaWR0aCA9IHRoaXMuJHRleHRMYXllci5nZXRDaGFyYWN0ZXJXaWR0aCgpO1xuICAgICAgICB0aGlzLmxheWVyQ29uZmlnLmxpbmVIZWlnaHQgPSB0aGlzLmxpbmVIZWlnaHQgPSB0aGlzLiR0ZXh0TGF5ZXIuZ2V0TGluZUhlaWdodCgpO1xuICAgICAgICB0aGlzLiR1cGRhdGVQcmludE1hcmdpbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFzc29jaWF0ZXMgdGhlIHJlbmRlcmVyIHdpdGggYSBkaWZmZXJlbnQgRWRpdFNlc3Npb24uXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFNlc3Npb25cbiAgICAgKiBAcGFyYW0gc2Vzc2lvbiB7RWRpdFNlc3Npb259XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRTZXNzaW9uKHNlc3Npb246IEVkaXRTZXNzaW9uKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24pIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5kb2Mub2ZmKFwiY2hhbmdlTmV3TGluZU1vZGVcIiwgdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2Vzc2lvbiA9IHNlc3Npb247XG4gICAgICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuc2Nyb2xsTWFyZ2luLnRvcCAmJiBzZXNzaW9uLmdldFNjcm9sbFRvcCgpIDw9IDApIHtcbiAgICAgICAgICAgIHNlc3Npb24uc2V0U2Nyb2xsVG9wKC10aGlzLnNjcm9sbE1hcmdpbi50b3ApO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kbWFya2VyQmFjay5zZXRTZXNzaW9uKHNlc3Npb24pO1xuICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC5zZXRTZXNzaW9uKHNlc3Npb24pO1xuICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5zZXRTZXNzaW9uKHNlc3Npb24pO1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi4kc2V0Rm9udE1ldHJpY3ModGhpcy4kZm9udE1ldHJpY3MpO1xuXG4gICAgICAgIHRoaXMub25DaGFuZ2VOZXdMaW5lTW9kZSA9IHRoaXMub25DaGFuZ2VOZXdMaW5lTW9kZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUoKVxuICAgICAgICB0aGlzLnNlc3Npb24uZG9jLm9uKFwiY2hhbmdlTmV3TGluZU1vZGVcIiwgdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcmlnZ2VycyBhIHBhcnRpYWwgdXBkYXRlIG9mIHRoZSB0ZXh0LCBmcm9tIHRoZSByYW5nZSBnaXZlbiBieSB0aGUgdHdvIHBhcmFtZXRlcnMuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHVwZGF0ZUxpbmVzXG4gICAgICogQHBhcmFtIGZpcnN0Um93IHtudW1iZXJ9IFRoZSBmaXJzdCByb3cgdG8gdXBkYXRlLlxuICAgICAqIEBwYXJhbSBsYXN0Um93IHtudW1iZXJ9IFRoZSBsYXN0IHJvdyB0byB1cGRhdGUuXG4gICAgICogQHBhcmFtIFtmb3JjZV0ge2Jvb2xlYW59XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICB1cGRhdGVMaW5lcyhmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIsIGZvcmNlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICBpZiAobGFzdFJvdyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBsYXN0Um93ID0gSW5maW5pdHk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuJGNoYW5nZWRMaW5lcykge1xuICAgICAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzID0geyBmaXJzdFJvdzogZmlyc3RSb3csIGxhc3RSb3c6IGxhc3RSb3cgfTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiRjaGFuZ2VkTGluZXMuZmlyc3RSb3cgPiBmaXJzdFJvdykge1xuICAgICAgICAgICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcy5maXJzdFJvdyA9IGZpcnN0Um93O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3cgPCBsYXN0Um93KSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3cgPSBsYXN0Um93O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgdGhlIGNoYW5nZSBoYXBwZW5lZCBvZmZzY3JlZW4gYWJvdmUgdXMgdGhlbiBpdCdzIHBvc3NpYmxlXG4gICAgICAgIC8vIHRoYXQgYSBuZXcgbGluZSB3cmFwIHdpbGwgYWZmZWN0IHRoZSBwb3NpdGlvbiBvZiB0aGUgbGluZXMgb24gb3VyXG4gICAgICAgIC8vIHNjcmVlbiBzbyB0aGV5IG5lZWQgcmVkcmF3bi5cbiAgICAgICAgLy8gVE9ETzogYmV0dGVyIHNvbHV0aW9uIGlzIHRvIG5vdCBjaGFuZ2Ugc2Nyb2xsIHBvc2l0aW9uIHdoZW4gdGV4dCBpcyBjaGFuZ2VkIG91dHNpZGUgb2YgdmlzaWJsZSBhcmVhXG4gICAgICAgIGlmICh0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdyA8IHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3cpIHtcbiAgICAgICAgICAgIGlmIChmb3JjZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93ID0gdGhpcy5sYXllckNvbmZpZy5sYXN0Um93O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuJGNoYW5nZWRMaW5lcy5maXJzdFJvdyA+IHRoaXMubGF5ZXJDb25maWcubGFzdFJvdykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0xJTkVTKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIG9uQ2hhbmdlTmV3TGluZU1vZGVcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSBvbkNoYW5nZU5ld0xpbmVNb2RlKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9URVhUKTtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZUVvbENoYXIoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIG9uQ2hhbmdlVGFiU2l6ZVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHVibGljIG9uQ2hhbmdlVGFiU2l6ZSgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuJGxvb3ApIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiRsb29wLnNjaGVkdWxlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfVEVYVCB8IENIQU5HRV9NQVJLRVIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllcikge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllci5vbkNoYW5nZVRhYlNpemUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIub25DaGFuZ2VUYWJTaXplKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBJJ20gbm90IHN1cmUgd2h5IHdlIGNhbiBub3cgZW5kIHVwIGhlcmUuXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcmlnZ2VycyBhIGZ1bGwgdXBkYXRlIG9mIHRoZSB0ZXh0LCBmb3IgYWxsIHRoZSByb3dzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCB1cGRhdGVUZXh0XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICB1cGRhdGVUZXh0KCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9URVhUKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcmlnZ2VycyBhIGZ1bGwgdXBkYXRlIG9mIGFsbCB0aGUgbGF5ZXJzLCBmb3IgYWxsIHRoZSByb3dzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCB1cGRhdGVGdWxsXG4gICAgICogQHBhcmFtIFtmb3JjZV0ge2Jvb2xlYW59IElmIGB0cnVlYCwgZm9yY2VzIHRoZSBjaGFuZ2VzIHRocm91Z2guXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICB1cGRhdGVGdWxsKGZvcmNlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICBpZiAoZm9yY2UpXG4gICAgICAgICAgICB0aGlzLiRyZW5kZXJDaGFuZ2VzKENIQU5HRV9GVUxMLCB0cnVlKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVXBkYXRlcyB0aGUgZm9udCBzaXplLlxuICAgICAqXG4gICAgICogQG1ldGhvZCB1cGRhdGVGb250U2l6ZVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgdXBkYXRlRm9udFNpemUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci5jaGVja0ZvclNpemVDaGFuZ2VzKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCAkdXBkYXRlU2l6ZUFzeW5jXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwcml2YXRlICR1cGRhdGVTaXplQXN5bmMoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLiRsb29wLnBlbmRpbmcpIHtcbiAgICAgICAgICAgIHRoaXMuJHNpemUuJGRpcnR5ID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMub25SZXNpemUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyaWdnZXJzIGEgcmVzaXplIG9mIHRoZSByZW5kZXJlci5cbiAgICAgKlxuICAgICAqIEBtZXRob2RcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGZvcmNlIElmIGB0cnVlYCwgcmVjb21wdXRlcyB0aGUgc2l6ZSwgZXZlbiBpZiB0aGUgaGVpZ2h0IGFuZCB3aWR0aCBoYXZlbid0IGNoYW5nZWRcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZ3V0dGVyV2lkdGggVGhlIHdpZHRoIG9mIHRoZSBndXR0ZXIgaW4gcGl4ZWxzXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHdpZHRoIFRoZSB3aWR0aCBvZiB0aGUgZWRpdG9yIGluIHBpeGVsc1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBoZWlnaHQgVGhlIGhpZWhndCBvZiB0aGUgZWRpdG9yLCBpbiBwaXhlbHNcbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICovXG4gICAgcHVibGljIG9uUmVzaXplKGZvcmNlPzogYm9vbGVhbiwgZ3V0dGVyV2lkdGg/OiBudW1iZXIsIHdpZHRoPzogbnVtYmVyLCBoZWlnaHQ/OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAodGhpcy5yZXNpemluZyA+IDIpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGVsc2UgaWYgKHRoaXMucmVzaXppbmcgPiAwKVxuICAgICAgICAgICAgdGhpcy5yZXNpemluZysrO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLnJlc2l6aW5nID0gZm9yY2UgPyAxIDogMDtcbiAgICAgICAgLy8gYHx8IGVsLnNjcm9sbEhlaWdodGAgaXMgcmVxdWlyZWQgZm9yIG91dG9zaXppbmcgZWRpdG9ycyBvbiBpZVxuICAgICAgICAvLyB3aGVyZSBlbGVtZW50cyB3aXRoIGNsaWVudEhlaWdodCA9IDAgYWxzb2UgaGF2ZSBjbGllbnRXaWR0aCA9IDBcbiAgICAgICAgdmFyIGVsID0gdGhpcy5jb250YWluZXI7XG4gICAgICAgIGlmICghaGVpZ2h0KVxuICAgICAgICAgICAgaGVpZ2h0ID0gZWwuY2xpZW50SGVpZ2h0IHx8IGVsLnNjcm9sbEhlaWdodDtcbiAgICAgICAgaWYgKCF3aWR0aClcbiAgICAgICAgICAgIHdpZHRoID0gZWwuY2xpZW50V2lkdGggfHwgZWwuc2Nyb2xsV2lkdGg7XG4gICAgICAgIHZhciBjaGFuZ2VzID0gdGhpcy4kdXBkYXRlQ2FjaGVkU2l6ZShmb3JjZSwgZ3V0dGVyV2lkdGgsIHdpZHRoLCBoZWlnaHQpO1xuXG5cbiAgICAgICAgaWYgKCF0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0IHx8ICghd2lkdGggJiYgIWhlaWdodCkpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5yZXNpemluZyA9IDA7XG5cbiAgICAgICAgaWYgKGZvcmNlKVxuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuJHBhZGRpbmcgPSBudWxsO1xuXG4gICAgICAgIGlmIChmb3JjZSlcbiAgICAgICAgICAgIHRoaXMuJHJlbmRlckNoYW5nZXMoY2hhbmdlcyB8IHRoaXMuJGNoYW5nZXMsIHRydWUpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKGNoYW5nZXMgfCB0aGlzLiRjaGFuZ2VzKTtcblxuICAgICAgICBpZiAodGhpcy5yZXNpemluZylcbiAgICAgICAgICAgIHRoaXMucmVzaXppbmcgPSAwO1xuICAgIH1cblxuICAgIHByaXZhdGUgJHVwZGF0ZUNhY2hlZFNpemUoZm9yY2U6IGJvb2xlYW4sIGd1dHRlcldpZHRoOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaGVpZ2h0IC09ICh0aGlzLiRleHRyYUhlaWdodCB8fCAwKTtcbiAgICAgICAgdmFyIGNoYW5nZXMgPSAwO1xuICAgICAgICB2YXIgc2l6ZSA9IHRoaXMuJHNpemU7XG4gICAgICAgIHZhciBvbGRTaXplID0ge1xuICAgICAgICAgICAgd2lkdGg6IHNpemUud2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQ6IHNpemUuaGVpZ2h0LFxuICAgICAgICAgICAgc2Nyb2xsZXJIZWlnaHQ6IHNpemUuc2Nyb2xsZXJIZWlnaHQsXG4gICAgICAgICAgICBzY3JvbGxlcldpZHRoOiBzaXplLnNjcm9sbGVyV2lkdGhcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKGhlaWdodCAmJiAoZm9yY2UgfHwgc2l6ZS5oZWlnaHQgIT0gaGVpZ2h0KSkge1xuICAgICAgICAgICAgc2l6ZS5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgICAgICBjaGFuZ2VzIHw9IENIQU5HRV9TSVpFO1xuXG4gICAgICAgICAgICBzaXplLnNjcm9sbGVySGVpZ2h0ID0gc2l6ZS5oZWlnaHQ7XG4gICAgICAgICAgICBpZiAodGhpcy4kaG9yaXpTY3JvbGwpXG4gICAgICAgICAgICAgICAgc2l6ZS5zY3JvbGxlckhlaWdodCAtPSB0aGlzLnNjcm9sbEJhckguaGVpZ2h0O1xuXG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhclYuZWxlbWVudC5zdHlsZS5ib3R0b20gPSB0aGlzLnNjcm9sbEJhckguaGVpZ2h0ICsgXCJweFwiO1xuXG4gICAgICAgICAgICBjaGFuZ2VzID0gY2hhbmdlcyB8IENIQU5HRV9TQ1JPTEw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAod2lkdGggJiYgKGZvcmNlIHx8IHNpemUud2lkdGggIT0gd2lkdGgpKSB7XG4gICAgICAgICAgICBjaGFuZ2VzIHw9IENIQU5HRV9TSVpFO1xuICAgICAgICAgICAgc2l6ZS53aWR0aCA9IHdpZHRoO1xuXG4gICAgICAgICAgICBpZiAoZ3V0dGVyV2lkdGggPT0gbnVsbClcbiAgICAgICAgICAgICAgICBndXR0ZXJXaWR0aCA9IHRoaXMuJHNob3dHdXR0ZXIgPyB0aGlzLiRndXR0ZXIub2Zmc2V0V2lkdGggOiAwO1xuXG4gICAgICAgICAgICB0aGlzLmd1dHRlcldpZHRoID0gZ3V0dGVyV2lkdGg7XG5cbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFySC5lbGVtZW50LnN0eWxlLmxlZnQgPVxuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsZXIuc3R5bGUubGVmdCA9IGd1dHRlcldpZHRoICsgXCJweFwiO1xuICAgICAgICAgICAgc2l6ZS5zY3JvbGxlcldpZHRoID0gTWF0aC5tYXgoMCwgd2lkdGggLSBndXR0ZXJXaWR0aCAtIHRoaXMuc2Nyb2xsQmFyVi53aWR0aCk7XG5cbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFySC5lbGVtZW50LnN0eWxlLnJpZ2h0ID1cbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbGVyLnN0eWxlLnJpZ2h0ID0gdGhpcy5zY3JvbGxCYXJWLndpZHRoICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxlci5zdHlsZS5ib3R0b20gPSB0aGlzLnNjcm9sbEJhckguaGVpZ2h0ICsgXCJweFwiO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5zZXNzaW9uICYmIHRoaXMuc2Vzc2lvbi5nZXRVc2VXcmFwTW9kZSgpICYmIHRoaXMuYWRqdXN0V3JhcExpbWl0KCkgfHwgZm9yY2UpXG4gICAgICAgICAgICAgICAgY2hhbmdlcyB8PSBDSEFOR0VfRlVMTDtcbiAgICAgICAgfVxuXG4gICAgICAgIHNpemUuJGRpcnR5ID0gIXdpZHRoIHx8ICFoZWlnaHQ7XG5cbiAgICAgICAgaWYgKGNoYW5nZXMpIHtcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IHJlc2l6ZVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJyZXNpemVcIiwgb2xkU2l6ZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY2hhbmdlcztcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uR3V0dGVyUmVzaXplKCkge1xuICAgICAgICB2YXIgZ3V0dGVyV2lkdGggPSB0aGlzLiRzaG93R3V0dGVyID8gdGhpcy4kZ3V0dGVyLm9mZnNldFdpZHRoIDogMDtcbiAgICAgICAgaWYgKGd1dHRlcldpZHRoICE9IHRoaXMuZ3V0dGVyV2lkdGgpXG4gICAgICAgICAgICB0aGlzLiRjaGFuZ2VzIHw9IHRoaXMuJHVwZGF0ZUNhY2hlZFNpemUodHJ1ZSwgZ3V0dGVyV2lkdGgsIHRoaXMuJHNpemUud2lkdGgsIHRoaXMuJHNpemUuaGVpZ2h0KTtcblxuICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmdldFVzZVdyYXBNb2RlKCkgJiYgdGhpcy5hZGp1c3RXcmFwTGltaXQoKSkge1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy4kc2l6ZS4kZGlydHkpIHtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kY29tcHV0ZUxheWVyQ29uZmlnKCk7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9NQVJLRVIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRqdXN0cyB0aGUgd3JhcCBsaW1pdCwgd2hpY2ggaXMgdGhlIG51bWJlciBvZiBjaGFyYWN0ZXJzIHRoYXQgY2FuIGZpdCB3aXRoaW4gdGhlIHdpZHRoIG9mIHRoZSBlZGl0IGFyZWEgb24gc2NyZWVuLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBhZGp1c3RXcmFwTGltaXRcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIHB1YmxpYyBhZGp1c3RXcmFwTGltaXQoKTogYm9vbGVhbiB7XG4gICAgICAgIHZhciBhdmFpbGFibGVXaWR0aCA9IHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCAtIHRoaXMuJHBhZGRpbmcgKiAyO1xuICAgICAgICB2YXIgbGltaXQgPSBNYXRoLmZsb29yKGF2YWlsYWJsZVdpZHRoIC8gdGhpcy5jaGFyYWN0ZXJXaWR0aCk7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uYWRqdXN0V3JhcExpbWl0KGxpbWl0LCB0aGlzLiRzaG93UHJpbnRNYXJnaW4gJiYgdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBoYXZlIGFuIGFuaW1hdGVkIHNjcm9sbCBvciBub3QuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldEFuaW1hdGVkU2Nyb2xsXG4gICAgICogQHBhcmFtIHNob3VsZEFuaW1hdGUge2Jvb2xlYW59IFNldCB0byBgdHJ1ZWAgdG8gc2hvdyBhbmltYXRlZCBzY3JvbGxzLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0QW5pbWF0ZWRTY3JvbGwoc2hvdWxkQW5pbWF0ZTogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImFuaW1hdGVkU2Nyb2xsXCIsIHNob3VsZEFuaW1hdGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciBhbiBhbmltYXRlZCBzY3JvbGwgaGFwcGVucyBvciBub3QuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldEFuaW1hdGVkU2Nyb2xsXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRBbmltYXRlZFNjcm9sbCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGFuaW1hdGVkU2Nyb2xsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IGludmlzaWJsZSBjaGFyYWN0ZXJzIG9yIG5vdC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0U2hvd0ludmlzaWJsZXNcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3dJbnZpc2libGVzIFNldCB0byBgdHJ1ZWAgdG8gc2hvdyBpbnZpc2libGVzXG4gICAgICovXG4gICAgc2V0U2hvd0ludmlzaWJsZXMoc2hvd0ludmlzaWJsZXM6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJzaG93SW52aXNpYmxlc1wiLCBzaG93SW52aXNpYmxlcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB3aGV0aGVyIGludmlzaWJsZSBjaGFyYWN0ZXJzIGFyZSBiZWluZyBzaG93biBvciBub3QuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFNob3dJbnZpc2libGVzXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93SW52aXNpYmxlcygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwic2hvd0ludmlzaWJsZXNcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBnZXREaXNwbGF5SW5kZW50R3VpZGVzXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXREaXNwbGF5SW5kZW50R3VpZGVzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJkaXNwbGF5SW5kZW50R3VpZGVzXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgc2V0RGlzcGxheUluZGVudEd1aWRlc1xuICAgICAqIEBwYXJhbSBkaXNwbGF5SW5kZW50R3VpZGVzIHtib29sZWFufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0RGlzcGxheUluZGVudEd1aWRlcyhkaXNwbGF5SW5kZW50R3VpZGVzOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiZGlzcGxheUluZGVudEd1aWRlc1wiLCBkaXNwbGF5SW5kZW50R3VpZGVzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyB0aGUgcHJpbnQgbWFyZ2luIG9yIG5vdC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0U2hvd1ByaW50TWFyZ2luXG4gICAgICogQHBhcmFtIHNob3dQcmludE1hcmdpbiB7Ym9vbGVhbn0gU2V0IHRvIGB0cnVlYCB0byBzaG93IHRoZSBwcmludCBtYXJnaW4uXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRTaG93UHJpbnRNYXJnaW4oc2hvd1ByaW50TWFyZ2luOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwic2hvd1ByaW50TWFyZ2luXCIsIHNob3dQcmludE1hcmdpbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB3aGV0aGVyIHRoZSBwcmludCBtYXJnaW4gaXMgYmVpbmcgc2hvd24gb3Igbm90LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRTaG93UHJpbnRNYXJnaW5cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIGdldFNob3dQcmludE1hcmdpbigpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwic2hvd1ByaW50TWFyZ2luXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGNvbHVtbiBkZWZpbmluZyB3aGVyZSB0aGUgcHJpbnQgbWFyZ2luIHNob3VsZCBiZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0UHJpbnRNYXJnaW5Db2x1bW5cbiAgICAgKiBAcGFyYW0gcHJpbnRNYXJnaW5Db2x1bW4ge251bWJlcn0gU3BlY2lmaWVzIHRoZSBuZXcgcHJpbnQgbWFyZ2luLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0UHJpbnRNYXJnaW5Db2x1bW4ocHJpbnRNYXJnaW5Db2x1bW46IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInByaW50TWFyZ2luQ29sdW1uXCIsIHByaW50TWFyZ2luQ29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjb2x1bW4gbnVtYmVyIG9mIHdoZXJlIHRoZSBwcmludCBtYXJnaW4gaXMuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFByaW50TWFyZ2luQ29sdW1uXG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqL1xuICAgIGdldFByaW50TWFyZ2luQ29sdW1uKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInByaW50TWFyZ2luQ29sdW1uXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBndXR0ZXIgaXMgYmVpbmcgc2hvd24uXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFNob3dHdXR0ZXJcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIGdldFNob3dHdXR0ZXIoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInNob3dHdXR0ZXJcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgdGhlIGd1dHRlciBvciBub3QuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFNob3dHdXR0ZXJcbiAgICAgKiBAcGFyYW0gc2hvd0d1dHRlciB7Ym9vbGVhbn0gU2V0IHRvIGB0cnVlYCB0byBzaG93IHRoZSBndXR0ZXJcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldFNob3dHdXR0ZXIoc2hvd0d1dHRlcjogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXRPcHRpb24oXCJzaG93R3V0dGVyXCIsIHNob3dHdXR0ZXIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgZ2V0RmFkZUZvbGRXaWRnZXRzXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRGYWRlRm9sZFdpZGdldHMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImZhZGVGb2xkV2lkZ2V0c1wiKVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgc2V0RmFkZUZvbGRXaWRnZXRzXG4gICAgICogQHBhcmFtIGZhZGVGb2xkV2lkZ2V0cyB7Ym9vbGVhbn1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldEZhZGVGb2xkV2lkZ2V0cyhmYWRlRm9sZFdpZGdldHM6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJmYWRlRm9sZFdpZGdldHNcIiwgZmFkZUZvbGRXaWRnZXRzKTtcbiAgICB9XG5cbiAgICBzZXRIaWdobGlnaHRHdXR0ZXJMaW5lKGhpZ2hsaWdodEd1dHRlckxpbmU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJoaWdobGlnaHRHdXR0ZXJMaW5lXCIsIGhpZ2hsaWdodEd1dHRlckxpbmUpO1xuICAgIH1cblxuICAgIGdldEhpZ2hsaWdodEd1dHRlckxpbmUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImhpZ2hsaWdodEd1dHRlckxpbmVcIik7XG4gICAgfVxuXG4gICAgJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQoKSB7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLiRjdXJzb3JMYXllci4kcGl4ZWxQb3M7XG4gICAgICAgIHZhciBoZWlnaHQgPSB0aGlzLmxheWVyQ29uZmlnLmxpbmVIZWlnaHQ7XG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKSkge1xuICAgICAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuc2Vzc2lvbi5nZXRTZWxlY3Rpb24oKS5nZXRDdXJzb3IoKTtcbiAgICAgICAgICAgIGN1cnNvci5jb2x1bW4gPSAwO1xuICAgICAgICAgICAgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuZ2V0UGl4ZWxQb3NpdGlvbihjdXJzb3IsIHRydWUpO1xuICAgICAgICAgICAgaGVpZ2h0ICo9IHRoaXMuc2Vzc2lvbi5nZXRSb3dMZW5ndGgoY3Vyc29yLnJvdyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodC5zdHlsZS50b3AgPSBwb3MudG9wIC0gdGhpcy5sYXllckNvbmZpZy5vZmZzZXQgKyBcInB4XCI7XG4gICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuc3R5bGUuaGVpZ2h0ID0gaGVpZ2h0ICsgXCJweFwiO1xuICAgIH1cblxuICAgICR1cGRhdGVQcmludE1hcmdpbigpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRzaG93UHJpbnRNYXJnaW4gJiYgIXRoaXMuJHByaW50TWFyZ2luRWwpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKCF0aGlzLiRwcmludE1hcmdpbkVsKSB7XG4gICAgICAgICAgICB2YXIgY29udGFpbmVyRWw6IEhUTUxEaXZFbGVtZW50ID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICBjb250YWluZXJFbC5jbGFzc05hbWUgPSBcImFjZV9sYXllciBhY2VfcHJpbnQtbWFyZ2luLWxheWVyXCI7XG4gICAgICAgICAgICB0aGlzLiRwcmludE1hcmdpbkVsID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICB0aGlzLiRwcmludE1hcmdpbkVsLmNsYXNzTmFtZSA9IFwiYWNlX3ByaW50LW1hcmdpblwiO1xuICAgICAgICAgICAgY29udGFpbmVyRWwuYXBwZW5kQ2hpbGQodGhpcy4kcHJpbnRNYXJnaW5FbCk7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuaW5zZXJ0QmVmb3JlKGNvbnRhaW5lckVsLCB0aGlzLmNvbnRlbnQuZmlyc3RDaGlsZCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc3R5bGUgPSB0aGlzLiRwcmludE1hcmdpbkVsLnN0eWxlO1xuICAgICAgICBzdHlsZS5sZWZ0ID0gKCh0aGlzLmNoYXJhY3RlcldpZHRoICogdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW4pICsgdGhpcy4kcGFkZGluZykgKyBcInB4XCI7XG4gICAgICAgIHN0eWxlLnZpc2liaWxpdHkgPSB0aGlzLiRzaG93UHJpbnRNYXJnaW4gPyBcInZpc2libGVcIiA6IFwiaGlkZGVuXCI7XG5cbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbiAmJiB0aGlzLnNlc3Npb25bJyR3cmFwJ10gPT0gLTEpXG4gICAgICAgICAgICB0aGlzLmFkanVzdFdyYXBMaW1pdCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHJvb3QgZWxlbWVudCBjb250YWluaW5nIHRoaXMgcmVuZGVyZXIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldENvbnRhaW5lckVsZW1lbnRcbiAgICAgKiBAcmV0dXJuIHtIVE1MRWxlbWVudH1cbiAgICAgKi9cbiAgICBnZXRDb250YWluZXJFbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGFpbmVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGVsZW1lbnQgdGhhdCB0aGUgbW91c2UgZXZlbnRzIGFyZSBhdHRhY2hlZCB0b1xuICAgICogQHJldHVybiB7RE9NRWxlbWVudH1cbiAgICAqKi9cbiAgICBnZXRNb3VzZUV2ZW50VGFyZ2V0KCk6IEhUTUxEaXZFbGVtZW50IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGVudDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBlbGVtZW50IHRvIHdoaWNoIHRoZSBoaWRkZW4gdGV4dCBhcmVhIGlzIGFkZGVkLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRUZXh0QXJlYUNvbnRhaW5lclxuICAgICAqIEByZXR1cm4ge0hUTUxFbGVtZW50fVxuICAgICAqL1xuICAgIGdldFRleHRBcmVhQ29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGFpbmVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmUgdGV4dCBpbnB1dCBvdmVyIHRoZSBjdXJzb3IuXG4gICAgICogUmVxdWlyZWQgZm9yIGlPUyBhbmQgSU1FLlxuICAgICAqXG4gICAgICogQG1ldGhvZCAkbW92ZVRleHRBcmVhVG9DdXJzb3JcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHVibGljICRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpOiB2b2lkIHtcblxuICAgICAgICBpZiAoIXRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGNvbmZpZyA9IHRoaXMubGF5ZXJDb25maWc7XG4gICAgICAgIHZhciBwb3NUb3AgPSB0aGlzLiRjdXJzb3JMYXllci4kcGl4ZWxQb3MudG9wO1xuICAgICAgICB2YXIgcG9zTGVmdCA9IHRoaXMuJGN1cnNvckxheWVyLiRwaXhlbFBvcy5sZWZ0O1xuICAgICAgICBwb3NUb3AgLT0gY29uZmlnLm9mZnNldDtcblxuICAgICAgICB2YXIgaCA9IHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgaWYgKHBvc1RvcCA8IDAgfHwgcG9zVG9wID4gY29uZmlnLmhlaWdodCAtIGgpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHcgPSB0aGlzLmNoYXJhY3RlcldpZHRoO1xuICAgICAgICBpZiAodGhpcy4kY29tcG9zaXRpb24pIHtcbiAgICAgICAgICAgIHZhciB2YWwgPSB0aGlzLnRleHRhcmVhLnZhbHVlLnJlcGxhY2UoL15cXHgwMSsvLCBcIlwiKTtcbiAgICAgICAgICAgIHcgKj0gKHRoaXMuc2Vzc2lvbi4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgodmFsKVswXSArIDIpO1xuICAgICAgICAgICAgaCArPSAyO1xuICAgICAgICAgICAgcG9zVG9wIC09IDE7XG4gICAgICAgIH1cbiAgICAgICAgcG9zTGVmdCAtPSB0aGlzLnNjcm9sbExlZnQ7XG4gICAgICAgIGlmIChwb3NMZWZ0ID4gdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gdylcbiAgICAgICAgICAgIHBvc0xlZnQgPSB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSB3O1xuXG4gICAgICAgIHBvc0xlZnQgLT0gdGhpcy5zY3JvbGxCYXJWLndpZHRoO1xuXG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuaGVpZ2h0ID0gaCArIFwicHhcIjtcbiAgICAgICAgdGhpcy50ZXh0YXJlYS5zdHlsZS53aWR0aCA9IHcgKyBcInB4XCI7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUucmlnaHQgPSBNYXRoLm1heCgwLCB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSBwb3NMZWZ0IC0gdykgKyBcInB4XCI7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuYm90dG9tID0gTWF0aC5tYXgoMCwgdGhpcy4kc2l6ZS5oZWlnaHQgLSBwb3NUb3AgLSBoKSArIFwicHhcIjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgZmlyc3QgdmlzaWJsZSByb3cuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldEZpcnN0VmlzaWJsZVJvd1xuICAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAgKi9cbiAgICBnZXRGaXJzdFZpc2libGVSb3coKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3c7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGZpcnN0IGZ1bGx5IHZpc2libGUgcm93LiBcIkZ1bGx5XCIgaGVyZSBtZWFucyB0aGF0IHRoZSBjaGFyYWN0ZXJzIGluIHRoZSByb3cgYXJlIG5vdCB0cnVuY2F0ZWQ7IHRoYXQgdGhlIHRvcCBhbmQgdGhlIGJvdHRvbSBvZiB0aGUgcm93IGFyZSBvbiB0aGUgc2NyZWVuLlxuICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICoqL1xuICAgIGdldEZpcnN0RnVsbHlWaXNpYmxlUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93ICsgKHRoaXMubGF5ZXJDb25maWcub2Zmc2V0ID09PSAwID8gMCA6IDEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBsYXN0IGZ1bGx5IHZpc2libGUgcm93LiBcIkZ1bGx5XCIgaGVyZSBtZWFucyB0aGF0IHRoZSBjaGFyYWN0ZXJzIGluIHRoZSByb3cgYXJlIG5vdCB0cnVuY2F0ZWQ7IHRoYXQgdGhlIHRvcCBhbmQgdGhlIGJvdHRvbSBvZiB0aGUgcm93IGFyZSBvbiB0aGUgc2NyZWVuLlxuICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICoqL1xuICAgIGdldExhc3RGdWxseVZpc2libGVSb3coKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGZsaW50ID0gTWF0aC5mbG9vcigodGhpcy5sYXllckNvbmZpZy5oZWlnaHQgKyB0aGlzLmxheWVyQ29uZmlnLm9mZnNldCkgLyB0aGlzLmxheWVyQ29uZmlnLmxpbmVIZWlnaHQpO1xuICAgICAgICByZXR1cm4gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdyAtIDEgKyBmbGludDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbGFzdCB2aXNpYmxlIHJvdy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0TGFzdFZpc2libGVSb3dcbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICovXG4gICAgZ2V0TGFzdFZpc2libGVSb3coKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubGF5ZXJDb25maWcubGFzdFJvdztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSBwYWRkaW5nLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRQYWRkaW5nXG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqL1xuICAgIGdldFBhZGRpbmcoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHBhZGRpbmc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgcGFkZGluZyBmb3IgYWxsIHRoZSBsYXllcnMuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFBhZGRpbmdcbiAgICAgKiBAcGFyYW0gcGFkZGluZyB7bnVtYmVyfSBBIG5ldyBwYWRkaW5nIHZhbHVlIChpbiBwaXhlbHMpLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0UGFkZGluZyhwYWRkaW5nOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKHR5cGVvZiBwYWRkaW5nICE9PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcInBhZGRpbmcgbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRwYWRkaW5nID0gcGFkZGluZztcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJG1hcmtlckZyb250LnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJG1hcmtlckJhY2suc2V0UGFkZGluZyhwYWRkaW5nKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG4gICAgICAgIHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7XG4gICAgfVxuXG4gICAgc2V0U2Nyb2xsTWFyZ2luKHRvcDogbnVtYmVyLCBib3R0b206IG51bWJlciwgbGVmdDogbnVtYmVyLCByaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHZhciBzbSA9IHRoaXMuc2Nyb2xsTWFyZ2luO1xuICAgICAgICBzbS50b3AgPSB0b3AgfCAwO1xuICAgICAgICBzbS5ib3R0b20gPSBib3R0b20gfCAwO1xuICAgICAgICBzbS5yaWdodCA9IHJpZ2h0IHwgMDtcbiAgICAgICAgc20ubGVmdCA9IGxlZnQgfCAwO1xuICAgICAgICBzbS52ID0gc20udG9wICsgc20uYm90dG9tO1xuICAgICAgICBzbS5oID0gc20ubGVmdCArIHNtLnJpZ2h0O1xuICAgICAgICBpZiAoc20udG9wICYmIHRoaXMuc2Nyb2xsVG9wIDw9IDAgJiYgdGhpcy5zZXNzaW9uKVxuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcCgtc20udG9wKTtcbiAgICAgICAgdGhpcy51cGRhdGVGdWxsKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB3aGV0aGVyIHRoZSBob3Jpem9udGFsIHNjcm9sbGJhciBpcyBzZXQgdG8gYmUgYWx3YXlzIHZpc2libGUuXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgZ2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUoKTogYm9vbGVhbiB7XG4gICAgICAgIC8vIEZJWE1FP1xuICAgICAgICByZXR1cm4gdGhpcy4kaFNjcm9sbEJhckFsd2F5c1Zpc2libGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyIG9yIG5vdC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGVcbiAgICAgKiBAcGFyYW0gaFNjcm9sbEJhckFsd2F5c1Zpc2libGUge2Jvb2xlYW59IFNldCB0byBgdHJ1ZWAgdG8gbWFrZSB0aGUgaG9yaXpvbnRhbCBzY3JvbGwgYmFyIHZpc2libGUuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRIU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZShoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImhTY3JvbGxCYXJBbHdheXNWaXNpYmxlXCIsIGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHZlcnRpY2FsIHNjcm9sbGJhciBpcyBzZXQgdG8gYmUgYWx3YXlzIHZpc2libGUuXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgZ2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLiR2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyB0aGUgdmVydGljYWwgc2Nyb2xsYmFyIG9yIG5vdC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFsd2F5c1Zpc2libGUgU2V0IHRvIGB0cnVlYCB0byBtYWtlIHRoZSB2ZXJ0aWNhbCBzY3JvbGwgYmFyIHZpc2libGVcbiAgICAgKi9cbiAgICBzZXRWU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZShhbHdheXNWaXNpYmxlOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwidlNjcm9sbEJhckFsd2F5c1Zpc2libGVcIiwgYWx3YXlzVmlzaWJsZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdXBkYXRlU2Nyb2xsQmFyVigpOiB2b2lkIHtcbiAgICAgICAgdmFyIHNjcm9sbEhlaWdodCA9IHRoaXMubGF5ZXJDb25maWcubWF4SGVpZ2h0O1xuICAgICAgICB2YXIgc2Nyb2xsZXJIZWlnaHQgPSB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0O1xuICAgICAgICBpZiAoIXRoaXMuJG1heExpbmVzICYmIHRoaXMuJHNjcm9sbFBhc3RFbmQpIHtcbiAgICAgICAgICAgIHNjcm9sbEhlaWdodCAtPSAoc2Nyb2xsZXJIZWlnaHQgLSB0aGlzLmxpbmVIZWlnaHQpICogdGhpcy4kc2Nyb2xsUGFzdEVuZDtcbiAgICAgICAgICAgIGlmICh0aGlzLnNjcm9sbFRvcCA+IHNjcm9sbEhlaWdodCAtIHNjcm9sbGVySGVpZ2h0KSB7XG4gICAgICAgICAgICAgICAgc2Nyb2xsSGVpZ2h0ID0gdGhpcy5zY3JvbGxUb3AgKyBzY3JvbGxlckhlaWdodDtcbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2Nyb2xsVG9wID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2V0U2Nyb2xsSGVpZ2h0KHNjcm9sbEhlaWdodCArIHRoaXMuc2Nyb2xsTWFyZ2luLnYpO1xuICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2V0U2Nyb2xsVG9wKHRoaXMuc2Nyb2xsVG9wICsgdGhpcy5zY3JvbGxNYXJnaW4udG9wKTtcbiAgICB9XG5cbiAgICBwcml2YXRlICR1cGRhdGVTY3JvbGxCYXJIKCkge1xuICAgICAgICB0aGlzLnNjcm9sbEJhckguc2V0U2Nyb2xsV2lkdGgodGhpcy5sYXllckNvbmZpZy53aWR0aCArIDIgKiB0aGlzLiRwYWRkaW5nICsgdGhpcy5zY3JvbGxNYXJnaW4uaCk7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFySC5zZXRTY3JvbGxMZWZ0KHRoaXMuc2Nyb2xsTGVmdCArIHRoaXMuc2Nyb2xsTWFyZ2luLmxlZnQpO1xuICAgIH1cblxuICAgIGZyZWV6ZSgpIHtcbiAgICAgICAgdGhpcy4kZnJvemVuID0gdHJ1ZTtcbiAgICB9XG5cbiAgICB1bmZyZWV6ZSgpIHtcbiAgICAgICAgdGhpcy4kZnJvemVuID0gZmFsc2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCAkcmVuZGVyQ2hhbmdlc1xuICAgICAqIEBwYXJhbSBjaGFuZ2VzIHtudW1iZXJ9XG4gICAgICogQHBhcmFtIGZvcmNlIHtib29sZWFufVxuICAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgJHJlbmRlckNoYW5nZXMoY2hhbmdlczogbnVtYmVyLCBmb3JjZTogYm9vbGVhbik6IG51bWJlciB7XG5cbiAgICAgICAgaWYgKHRoaXMuJGNoYW5nZXMpIHtcbiAgICAgICAgICAgIGNoYW5nZXMgfD0gdGhpcy4kY2hhbmdlcztcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZXMgPSAwO1xuICAgICAgICB9XG4gICAgICAgIGlmICgoIXRoaXMuc2Vzc2lvbiB8fCAhdGhpcy5jb250YWluZXIub2Zmc2V0V2lkdGggfHwgdGhpcy4kZnJvemVuKSB8fCAoIWNoYW5nZXMgJiYgIWZvcmNlKSkge1xuICAgICAgICAgICAgdGhpcy4kY2hhbmdlcyB8PSBjaGFuZ2VzO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLiRzaXplLiRkaXJ0eSkge1xuICAgICAgICAgICAgdGhpcy4kY2hhbmdlcyB8PSBjaGFuZ2VzO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMub25SZXNpemUodHJ1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLmxpbmVIZWlnaHQpIHtcbiAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci5jaGVja0ZvclNpemVDaGFuZ2VzKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGJlZm9yZVJlbmRlclxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiYmVmb3JlUmVuZGVyXCIpO1xuXG4gICAgICAgIHZhciBjb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuICAgICAgICAvLyB0ZXh0LCBzY3JvbGxpbmcgYW5kIHJlc2l6ZSBjaGFuZ2VzIGNhbiBjYXVzZSB0aGUgdmlldyBwb3J0IHNpemUgdG8gY2hhbmdlXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0ZVTEwgfHxcbiAgICAgICAgICAgIGNoYW5nZXMgJiBDSEFOR0VfU0laRSB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9URVhUIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX0xJTkVTIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX1NDUk9MTCB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9IX1NDUk9MTFxuICAgICAgICApIHtcbiAgICAgICAgICAgIGNoYW5nZXMgfD0gdGhpcy4kY29tcHV0ZUxheWVyQ29uZmlnKCk7XG4gICAgICAgICAgICAvLyBJZiBhIGNoYW5nZSBpcyBtYWRlIG9mZnNjcmVlbiBhbmQgd3JhcE1vZGUgaXMgb24sIHRoZW4gdGhlIG9uc2NyZWVuXG4gICAgICAgICAgICAvLyBsaW5lcyBtYXkgaGF2ZSBiZWVuIHB1c2hlZCBkb3duLiBJZiBzbywgdGhlIGZpcnN0IHNjcmVlbiByb3cgd2lsbCBub3RcbiAgICAgICAgICAgIC8vIGhhdmUgY2hhbmdlZCwgYnV0IHRoZSBmaXJzdCBhY3R1YWwgcm93IHdpbGwuIEluIHRoYXQgY2FzZSwgYWRqdXN0IFxuICAgICAgICAgICAgLy8gc2Nyb2xsVG9wIHNvIHRoYXQgdGhlIGN1cnNvciBhbmQgb25zY3JlZW4gY29udGVudCBzdGF5cyBpbiB0aGUgc2FtZSBwbGFjZS5cbiAgICAgICAgICAgIGlmIChjb25maWcuZmlyc3RSb3cgIT0gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdyAmJiBjb25maWcuZmlyc3RSb3dTY3JlZW4gPT0gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvd1NjcmVlbikge1xuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsVG9wID0gdGhpcy5zY3JvbGxUb3AgKyAoY29uZmlnLmZpcnN0Um93IC0gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdykgKiB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgICAgICAgICAgY2hhbmdlcyA9IGNoYW5nZXMgfCBDSEFOR0VfU0NST0xMO1xuICAgICAgICAgICAgICAgIGNoYW5nZXMgfD0gdGhpcy4kY29tcHV0ZUxheWVyQ29uZmlnKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuICAgICAgICAgICAgLy8gdXBkYXRlIHNjcm9sbGJhciBmaXJzdCB0byBub3QgbG9zZSBzY3JvbGwgcG9zaXRpb24gd2hlbiBndXR0ZXIgY2FsbHMgcmVzaXplXG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVTY3JvbGxCYXJWKCk7XG4gICAgICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9IX1NDUk9MTClcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVTY3JvbGxCYXJIKCk7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5lbGVtZW50LnN0eWxlLm1hcmdpblRvcCA9ICgtY29uZmlnLm9mZnNldCkgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUubWFyZ2luVG9wID0gKC1jb25maWcub2Zmc2V0KSArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS53aWR0aCA9IGNvbmZpZy53aWR0aCArIDIgKiB0aGlzLiRwYWRkaW5nICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLmhlaWdodCA9IGNvbmZpZy5taW5IZWlnaHQgKyBcInB4XCI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBob3Jpem9udGFsIHNjcm9sbGluZ1xuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9IX1NDUk9MTCkge1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLm1hcmdpbkxlZnQgPSAtdGhpcy5zY3JvbGxMZWZ0ICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxlci5jbGFzc05hbWUgPSB0aGlzLnNjcm9sbExlZnQgPD0gMCA/IFwiYWNlX3Njcm9sbGVyXCIgOiBcImFjZV9zY3JvbGxlciBhY2Vfc2Nyb2xsLWxlZnRcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGZ1bGxcbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfRlVMTCkge1xuICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckJhY2sudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICAgICAgICAgIHRoaXMuJGhpZ2hsaWdodEd1dHRlckxpbmUgJiYgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIEBldmVudCBhZnRlclJlbmRlclxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJhZnRlclJlbmRlclwiKTtcblxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gc2Nyb2xsaW5nXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX1NDUk9MTCkge1xuICAgICAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfVEVYVCB8fCBjaGFuZ2VzICYgQ0hBTkdFX0xJTkVTKVxuICAgICAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuc2Nyb2xsTGluZXMoY29uZmlnKTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRjdXJzb3JMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJGhpZ2hsaWdodEd1dHRlckxpbmUgJiYgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuICAgICAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IGFmdGVyUmVuZGVyXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImFmdGVyUmVuZGVyXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfVEVYVCkge1xuICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2hhbmdlcyAmIENIQU5HRV9MSU5FUykge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHVwZGF0ZUxpbmVzKCkgfHwgKGNoYW5nZXMgJiBDSEFOR0VfR1VUVEVSKSAmJiB0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoYW5nZXMgJiBDSEFOR0VfVEVYVCB8fCBjaGFuZ2VzICYgQ0hBTkdFX0dVVFRFUikge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9DVVJTT1IpIHtcbiAgICAgICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICAgICAgICAgIHRoaXMuJGhpZ2hsaWdodEd1dHRlckxpbmUgJiYgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoYW5nZXMgJiAoQ0hBTkdFX01BUktFUiB8IENIQU5HRV9NQVJLRVJfRlJPTlQpKSB7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjaGFuZ2VzICYgKENIQU5HRV9NQVJLRVIgfCBDSEFOR0VfTUFSS0VSX0JBQ0spKSB7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBhZnRlclJlbmRlclxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiYWZ0ZXJSZW5kZXJcIik7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkYXV0b3NpemUoKSB7XG4gICAgICAgIHZhciBoZWlnaHQgPSB0aGlzLnNlc3Npb24uZ2V0U2NyZWVuTGVuZ3RoKCkgKiB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBtYXhIZWlnaHQgPSB0aGlzLiRtYXhMaW5lcyAqIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgdmFyIGRlc2lyZWRIZWlnaHQgPSBNYXRoLm1heChcbiAgICAgICAgICAgICh0aGlzLiRtaW5MaW5lcyB8fCAxKSAqIHRoaXMubGluZUhlaWdodCxcbiAgICAgICAgICAgIE1hdGgubWluKG1heEhlaWdodCwgaGVpZ2h0KVxuICAgICAgICApICsgdGhpcy5zY3JvbGxNYXJnaW4udiArICh0aGlzLiRleHRyYUhlaWdodCB8fCAwKTtcbiAgICAgICAgdmFyIHZTY3JvbGwgPSBoZWlnaHQgPiBtYXhIZWlnaHQ7XG5cbiAgICAgICAgaWYgKGRlc2lyZWRIZWlnaHQgIT0gdGhpcy5kZXNpcmVkSGVpZ2h0IHx8XG4gICAgICAgICAgICB0aGlzLiRzaXplLmhlaWdodCAhPSB0aGlzLmRlc2lyZWRIZWlnaHQgfHwgdlNjcm9sbCAhPSB0aGlzLiR2U2Nyb2xsKSB7XG4gICAgICAgICAgICBpZiAodlNjcm9sbCAhPSB0aGlzLiR2U2Nyb2xsKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kdlNjcm9sbCA9IHZTY3JvbGw7XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJWLnNldFZpc2libGUodlNjcm9sbCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB3ID0gdGhpcy5jb250YWluZXIuY2xpZW50V2lkdGg7XG4gICAgICAgICAgICB0aGlzLmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBkZXNpcmVkSGVpZ2h0ICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy4kdXBkYXRlQ2FjaGVkU2l6ZSh0cnVlLCB0aGlzLiRndXR0ZXJXaWR0aCwgdywgZGVzaXJlZEhlaWdodCk7XG4gICAgICAgICAgICAvLyB0aGlzLiRsb29wLmNoYW5nZXMgPSAwO1xuICAgICAgICAgICAgdGhpcy5kZXNpcmVkSGVpZ2h0ID0gZGVzaXJlZEhlaWdodDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJGNvbXB1dGVMYXllckNvbmZpZygpIHtcblxuICAgICAgICBpZiAodGhpcy4kbWF4TGluZXMgJiYgdGhpcy5saW5lSGVpZ2h0ID4gMSkge1xuICAgICAgICAgICAgdGhpcy4kYXV0b3NpemUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICB2YXIgc2l6ZSA9IHRoaXMuJHNpemU7XG5cbiAgICAgICAgdmFyIGhpZGVTY3JvbGxiYXJzID0gc2l6ZS5oZWlnaHQgPD0gMiAqIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgdmFyIHNjcmVlbkxpbmVzID0gdGhpcy5zZXNzaW9uLmdldFNjcmVlbkxlbmd0aCgpO1xuICAgICAgICB2YXIgbWF4SGVpZ2h0ID0gc2NyZWVuTGluZXMgKiB0aGlzLmxpbmVIZWlnaHQ7XG5cbiAgICAgICAgdmFyIG9mZnNldCA9IHRoaXMuc2Nyb2xsVG9wICUgdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgbWluSGVpZ2h0ID0gc2l6ZS5zY3JvbGxlckhlaWdodCArIHRoaXMubGluZUhlaWdodDtcblxuICAgICAgICB2YXIgbG9uZ2VzdExpbmUgPSB0aGlzLiRnZXRMb25nZXN0TGluZSgpO1xuXG4gICAgICAgIHZhciBob3JpelNjcm9sbCA9ICFoaWRlU2Nyb2xsYmFycyAmJiAodGhpcy4kaFNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHxcbiAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJXaWR0aCAtIGxvbmdlc3RMaW5lIC0gMiAqIHRoaXMuJHBhZGRpbmcgPCAwKTtcblxuICAgICAgICB2YXIgaFNjcm9sbENoYW5nZWQgPSB0aGlzLiRob3JpelNjcm9sbCAhPT0gaG9yaXpTY3JvbGw7XG4gICAgICAgIGlmIChoU2Nyb2xsQ2hhbmdlZCkge1xuICAgICAgICAgICAgdGhpcy4kaG9yaXpTY3JvbGwgPSBob3JpelNjcm9sbDtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFySC5zZXRWaXNpYmxlKGhvcml6U2Nyb2xsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy4kbWF4TGluZXMgJiYgdGhpcy4kc2Nyb2xsUGFzdEVuZCkge1xuICAgICAgICAgICAgbWF4SGVpZ2h0ICs9IChzaXplLnNjcm9sbGVySGVpZ2h0IC0gdGhpcy5saW5lSGVpZ2h0KSAqIHRoaXMuJHNjcm9sbFBhc3RFbmQ7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdlNjcm9sbCA9ICFoaWRlU2Nyb2xsYmFycyAmJiAodGhpcy4kdlNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHxcbiAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJIZWlnaHQgLSBtYXhIZWlnaHQgPCAwKTtcbiAgICAgICAgdmFyIHZTY3JvbGxDaGFuZ2VkID0gdGhpcy4kdlNjcm9sbCAhPT0gdlNjcm9sbDtcbiAgICAgICAgaWYgKHZTY3JvbGxDaGFuZ2VkKSB7XG4gICAgICAgICAgICB0aGlzLiR2U2Nyb2xsID0gdlNjcm9sbDtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zZXRWaXNpYmxlKHZTY3JvbGwpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChNYXRoLm1heCgtdGhpcy5zY3JvbGxNYXJnaW4udG9wLFxuICAgICAgICAgICAgTWF0aC5taW4odGhpcy5zY3JvbGxUb3AsIG1heEhlaWdodCAtIHNpemUuc2Nyb2xsZXJIZWlnaHQgKyB0aGlzLnNjcm9sbE1hcmdpbi5ib3R0b20pKSk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQoTWF0aC5tYXgoLXRoaXMuc2Nyb2xsTWFyZ2luLmxlZnQsIE1hdGgubWluKHRoaXMuc2Nyb2xsTGVmdCxcbiAgICAgICAgICAgIGxvbmdlc3RMaW5lICsgMiAqIHRoaXMuJHBhZGRpbmcgLSBzaXplLnNjcm9sbGVyV2lkdGggKyB0aGlzLnNjcm9sbE1hcmdpbi5yaWdodCkpKTtcblxuICAgICAgICB2YXIgbGluZUNvdW50ID0gTWF0aC5jZWlsKG1pbkhlaWdodCAvIHRoaXMubGluZUhlaWdodCkgLSAxO1xuICAgICAgICB2YXIgZmlyc3RSb3cgPSBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKCh0aGlzLnNjcm9sbFRvcCAtIG9mZnNldCkgLyB0aGlzLmxpbmVIZWlnaHQpKTtcbiAgICAgICAgdmFyIGxhc3RSb3cgPSBmaXJzdFJvdyArIGxpbmVDb3VudDtcblxuICAgICAgICAvLyBNYXAgbGluZXMgb24gdGhlIHNjcmVlbiB0byBsaW5lcyBpbiB0aGUgZG9jdW1lbnQuXG4gICAgICAgIHZhciBmaXJzdFJvd1NjcmVlbiwgZmlyc3RSb3dIZWlnaHQ7XG4gICAgICAgIHZhciBsaW5lSGVpZ2h0ID0gdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICBmaXJzdFJvdyA9IHNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFJvdyhmaXJzdFJvdywgMCk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgZmlyc3RSb3cgaXMgaW5zaWRlIG9mIGEgZm9sZExpbmUuIElmIHRydWUsIHRoZW4gdXNlIHRoZSBmaXJzdFxuICAgICAgICAvLyByb3cgb2YgdGhlIGZvbGRMaW5lLlxuICAgICAgICB2YXIgZm9sZExpbmUgPSBzZXNzaW9uLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICBmaXJzdFJvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgfVxuXG4gICAgICAgIGZpcnN0Um93U2NyZWVuID0gc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUm93KGZpcnN0Um93LCAwKTtcbiAgICAgICAgZmlyc3RSb3dIZWlnaHQgPSBzZXNzaW9uLmdldFJvd0xlbmd0aChmaXJzdFJvdykgKiBsaW5lSGVpZ2h0O1xuXG4gICAgICAgIGxhc3RSb3cgPSBNYXRoLm1pbihzZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRSb3cobGFzdFJvdywgMCksIHNlc3Npb24uZ2V0TGVuZ3RoKCkgLSAxKTtcbiAgICAgICAgbWluSGVpZ2h0ID0gc2l6ZS5zY3JvbGxlckhlaWdodCArIHNlc3Npb24uZ2V0Um93TGVuZ3RoKGxhc3RSb3cpICogbGluZUhlaWdodCArXG4gICAgICAgICAgICBmaXJzdFJvd0hlaWdodDtcblxuICAgICAgICBvZmZzZXQgPSB0aGlzLnNjcm9sbFRvcCAtIGZpcnN0Um93U2NyZWVuICogbGluZUhlaWdodDtcblxuICAgICAgICB2YXIgY2hhbmdlcyA9IDA7XG4gICAgICAgIGlmICh0aGlzLmxheWVyQ29uZmlnLndpZHRoICE9IGxvbmdlc3RMaW5lKVxuICAgICAgICAgICAgY2hhbmdlcyA9IENIQU5HRV9IX1NDUk9MTDtcbiAgICAgICAgLy8gSG9yaXpvbnRhbCBzY3JvbGxiYXIgdmlzaWJpbGl0eSBtYXkgaGF2ZSBjaGFuZ2VkLCB3aGljaCBjaGFuZ2VzXG4gICAgICAgIC8vIHRoZSBjbGllbnQgaGVpZ2h0IG9mIHRoZSBzY3JvbGxlclxuICAgICAgICBpZiAoaFNjcm9sbENoYW5nZWQgfHwgdlNjcm9sbENoYW5nZWQpIHtcbiAgICAgICAgICAgIGNoYW5nZXMgPSB0aGlzLiR1cGRhdGVDYWNoZWRTaXplKHRydWUsIHRoaXMuZ3V0dGVyV2lkdGgsIHNpemUud2lkdGgsIHNpemUuaGVpZ2h0KTtcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IHNjcm9sbGJhclZpc2liaWxpdHlDaGFuZ2VkXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcInNjcm9sbGJhclZpc2liaWxpdHlDaGFuZ2VkXCIpO1xuICAgICAgICAgICAgaWYgKHZTY3JvbGxDaGFuZ2VkKVxuICAgICAgICAgICAgICAgIGxvbmdlc3RMaW5lID0gdGhpcy4kZ2V0TG9uZ2VzdExpbmUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubGF5ZXJDb25maWcgPSB7XG4gICAgICAgICAgICB3aWR0aDogbG9uZ2VzdExpbmUsXG4gICAgICAgICAgICBwYWRkaW5nOiB0aGlzLiRwYWRkaW5nLFxuICAgICAgICAgICAgZmlyc3RSb3c6IGZpcnN0Um93LFxuICAgICAgICAgICAgZmlyc3RSb3dTY3JlZW46IGZpcnN0Um93U2NyZWVuLFxuICAgICAgICAgICAgbGFzdFJvdzogbGFzdFJvdyxcbiAgICAgICAgICAgIGxpbmVIZWlnaHQ6IGxpbmVIZWlnaHQsXG4gICAgICAgICAgICBjaGFyYWN0ZXJXaWR0aDogdGhpcy5jaGFyYWN0ZXJXaWR0aCxcbiAgICAgICAgICAgIG1pbkhlaWdodDogbWluSGVpZ2h0LFxuICAgICAgICAgICAgbWF4SGVpZ2h0OiBtYXhIZWlnaHQsXG4gICAgICAgICAgICBvZmZzZXQ6IG9mZnNldCxcbiAgICAgICAgICAgIGd1dHRlck9mZnNldDogTWF0aC5tYXgoMCwgTWF0aC5jZWlsKChvZmZzZXQgKyBzaXplLmhlaWdodCAtIHNpemUuc2Nyb2xsZXJIZWlnaHQpIC8gbGluZUhlaWdodCkpLFxuICAgICAgICAgICAgaGVpZ2h0OiB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0XG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIGNoYW5nZXM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdXBkYXRlTGluZXMoKSB7XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IHRoaXMuJGNoYW5nZWRMaW5lcy5maXJzdFJvdztcbiAgICAgICAgdmFyIGxhc3RSb3cgPSB0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdztcbiAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzID0gbnVsbDtcblxuICAgICAgICB2YXIgbGF5ZXJDb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuXG4gICAgICAgIGlmIChmaXJzdFJvdyA+IGxheWVyQ29uZmlnLmxhc3RSb3cgKyAxKSB7IHJldHVybjsgfVxuICAgICAgICBpZiAobGFzdFJvdyA8IGxheWVyQ29uZmlnLmZpcnN0Um93KSB7IHJldHVybjsgfVxuXG4gICAgICAgIC8vIGlmIHRoZSBsYXN0IHJvdyBpcyB1bmtub3duIC0+IHJlZHJhdyBldmVyeXRoaW5nXG4gICAgICAgIGlmIChsYXN0Um93ID09PSBJbmZpbml0eSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGxheWVyQ29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGUobGF5ZXJDb25maWcpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZWxzZSB1cGRhdGUgb25seSB0aGUgY2hhbmdlZCByb3dzXG4gICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGVMaW5lcyhsYXllckNvbmZpZywgZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRnZXRMb25nZXN0TGluZSgpOiBudW1iZXIge1xuICAgICAgICB2YXIgY2hhckNvdW50ID0gdGhpcy5zZXNzaW9uLmdldFNjcmVlbldpZHRoKCk7XG4gICAgICAgIGlmICh0aGlzLnNob3dJbnZpc2libGVzICYmICF0aGlzLnNlc3Npb24uJHVzZVdyYXBNb2RlKVxuICAgICAgICAgICAgY2hhckNvdW50ICs9IDE7XG5cbiAgICAgICAgcmV0dXJuIE1hdGgubWF4KHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCAtIDIgKiB0aGlzLiRwYWRkaW5nLCBNYXRoLnJvdW5kKGNoYXJDb3VudCAqIHRoaXMuY2hhcmFjdGVyV2lkdGgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY2hlZHVsZXMgYW4gdXBkYXRlIHRvIGFsbCB0aGUgZnJvbnQgbWFya2VycyBpbiB0aGUgZG9jdW1lbnQuXG4gICAgICovXG4gICAgdXBkYXRlRnJvbnRNYXJrZXJzKCkge1xuICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC5zZXRNYXJrZXJzKHRoaXMuc2Vzc2lvbi5nZXRNYXJrZXJzKC8qaW5Gcm9udD0qL3RydWUpKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfTUFSS0VSX0ZST05UKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY2hlZHVsZXMgYW4gdXBkYXRlIHRvIGFsbCB0aGUgYmFjayBtYXJrZXJzIGluIHRoZSBkb2N1bWVudC5cbiAgICAgKi9cbiAgICB1cGRhdGVCYWNrTWFya2VycygpIHtcbiAgICAgICAgdGhpcy4kbWFya2VyQmFjay5zZXRNYXJrZXJzKHRoaXMuc2Vzc2lvbi5nZXRNYXJrZXJzKGZhbHNlKSk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX01BUktFUl9CQUNLKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZWRyYXcgYnJlYWtwb2ludHMuXG4gICAgICovXG4gICAgdXBkYXRlQnJlYWtwb2ludHMoKSB7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0dVVFRFUik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBhbm5vdGF0aW9ucyBmb3IgdGhlIGd1dHRlci5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0QW5ub3RhdGlvbnNcbiAgICAgKiBAcGFyYW0ge0Fubm90YXRpb25bXX0gYW5ub3RhdGlvbnMgQW4gYXJyYXkgY29udGFpbmluZyBhbm5vdGF0aW9ucy5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldEFubm90YXRpb25zKGFubm90YXRpb25zOiBBbm5vdGF0aW9uW10pOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0QW5ub3RhdGlvbnMoYW5ub3RhdGlvbnMpO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9HVVRURVIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFVwZGF0ZXMgdGhlIGN1cnNvciBpY29uLlxuICAgICAqL1xuICAgIHVwZGF0ZUN1cnNvcigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfQ1VSU09SKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBIaWRlcyB0aGUgY3Vyc29yIGljb24uXG4gICAgICovXG4gICAgaGlkZUN1cnNvcigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuaGlkZUN1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNob3dzIHRoZSBjdXJzb3IgaWNvbi5cbiAgICAgKi9cbiAgICBzaG93Q3Vyc29yKCkge1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5zaG93Q3Vyc29yKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBzY3JvbGxTZWxlY3Rpb25JbnRvVmlld1xuICAgICAqIEBwYXJhbSBhbmNob3Ige1Bvc2l0aW9ufVxuICAgICAqIEBwYXJhbSBsZWFkIHtQb3NpdGlvbn1cbiAgICAgKiBAcGFyYW0gW29mZnNldF0ge251bWJlcn1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNjcm9sbFNlbGVjdGlvbkludG9WaWV3KGFuY2hvcjogUG9zaXRpb24sIGxlYWQ6IFBvc2l0aW9uLCBvZmZzZXQ/OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgLy8gZmlyc3Qgc2Nyb2xsIGFuY2hvciBpbnRvIHZpZXcgdGhlbiBzY3JvbGwgbGVhZCBpbnRvIHZpZXdcbiAgICAgICAgdGhpcy5zY3JvbGxDdXJzb3JJbnRvVmlldyhhbmNob3IsIG9mZnNldCk7XG4gICAgICAgIHRoaXMuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcobGVhZCwgb2Zmc2V0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRoZSBjdXJzb3IgaW50byB0aGUgZmlyc3QgdmlzaWJpbGUgYXJlYSBvZiB0aGUgZWRpdG9yLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzY3JvbGxDdXJzb3JJbnRvVmlld1xuICAgICAqIEBwYXJhbSBjdXJzb3Ige1Bvc2l0aW9ufVxuICAgICAqIEBwYXJhbSBbb2Zmc2V0XSB7bnVtYmVyfVxuICAgICAqIEBwYXJhbSBbJHZpZXdNYXJnaW5dIHt7dG9wOiBudW1iZXI7IGJvdHRvbTogbnVtYmVyfX1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNjcm9sbEN1cnNvckludG9WaWV3KGN1cnNvcj86IFBvc2l0aW9uLCBvZmZzZXQ/OiBudW1iZXIsICR2aWV3TWFyZ2luPzogeyB0b3A6IG51bWJlcjsgYm90dG9tOiBudW1iZXIgfSk6IHZvaWQge1xuICAgICAgICAvLyB0aGUgZWRpdG9yIGlzIG5vdCB2aXNpYmxlXG4gICAgICAgIGlmICh0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0ID09PSAwKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBwb3MgPSB0aGlzLiRjdXJzb3JMYXllci5nZXRQaXhlbFBvc2l0aW9uKGN1cnNvcik7XG5cbiAgICAgICAgdmFyIGxlZnQgPSBwb3MubGVmdDtcbiAgICAgICAgdmFyIHRvcCA9IHBvcy50b3A7XG5cbiAgICAgICAgdmFyIHRvcE1hcmdpbiA9ICR2aWV3TWFyZ2luICYmICR2aWV3TWFyZ2luLnRvcCB8fCAwO1xuICAgICAgICB2YXIgYm90dG9tTWFyZ2luID0gJHZpZXdNYXJnaW4gJiYgJHZpZXdNYXJnaW4uYm90dG9tIHx8IDA7XG5cbiAgICAgICAgdmFyIHNjcm9sbFRvcCA9IHRoaXMuJHNjcm9sbEFuaW1hdGlvbiA/IHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSA6IHRoaXMuc2Nyb2xsVG9wO1xuXG4gICAgICAgIGlmIChzY3JvbGxUb3AgKyB0b3BNYXJnaW4gPiB0b3ApIHtcbiAgICAgICAgICAgIGlmIChvZmZzZXQpXG4gICAgICAgICAgICAgICAgdG9wIC09IG9mZnNldCAqIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQ7XG4gICAgICAgICAgICBpZiAodG9wID09PSAwKVxuICAgICAgICAgICAgICAgIHRvcCA9IC10aGlzLnNjcm9sbE1hcmdpbi50b3A7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHRvcCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoc2Nyb2xsVG9wICsgdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCAtIGJvdHRvbU1hcmdpbiA8IHRvcCArIHRoaXMubGluZUhlaWdodCkge1xuICAgICAgICAgICAgaWYgKG9mZnNldClcbiAgICAgICAgICAgICAgICB0b3AgKz0gb2Zmc2V0ICogdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodDtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AodG9wICsgdGhpcy5saW5lSGVpZ2h0IC0gdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc2Nyb2xsTGVmdCA9IHRoaXMuc2Nyb2xsTGVmdDtcblxuICAgICAgICBpZiAoc2Nyb2xsTGVmdCA+IGxlZnQpIHtcbiAgICAgICAgICAgIGlmIChsZWZ0IDwgdGhpcy4kcGFkZGluZyArIDIgKiB0aGlzLmxheWVyQ29uZmlnLmNoYXJhY3RlcldpZHRoKVxuICAgICAgICAgICAgICAgIGxlZnQgPSAtdGhpcy5zY3JvbGxNYXJnaW4ubGVmdDtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KGxlZnQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNjcm9sbExlZnQgKyB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggPCBsZWZ0ICsgdGhpcy5jaGFyYWN0ZXJXaWR0aCkge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQoTWF0aC5yb3VuZChsZWZ0ICsgdGhpcy5jaGFyYWN0ZXJXaWR0aCAtIHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCkpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNjcm9sbExlZnQgPD0gdGhpcy4kcGFkZGluZyAmJiBsZWZ0IC0gc2Nyb2xsTGVmdCA8IHRoaXMuY2hhcmFjdGVyV2lkdGgpIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KDApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiB7OkVkaXRTZXNzaW9uLmdldFNjcm9sbFRvcH1cbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmdldFNjcm9sbFRvcFxuICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldFNjcm9sbFRvcCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFNjcm9sbFRvcCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogezpFZGl0U2Vzc2lvbi5nZXRTY3JvbGxMZWZ0fVxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZ2V0U2Nyb2xsTGVmdFxuICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldFNjcm9sbExlZnQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxMZWZ0KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgZmlyc3QgdmlzaWJsZSByb3csIHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciBpdCdzIGZ1bGx5IHZpc2libGUgb3Igbm90LlxuICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldFNjcm9sbFRvcFJvdygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zY3JvbGxUb3AgLyB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgbGFzdCB2aXNpYmxlIHJvdywgcmVnYXJkbGVzcyBvZiB3aGV0aGVyIGl0J3MgZnVsbHkgdmlzaWJsZSBvciBub3QuXG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0U2Nyb2xsQm90dG9tUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiBNYXRoLm1heCgwLCBNYXRoLmZsb29yKCh0aGlzLnNjcm9sbFRvcCArIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQpIC8gdGhpcy5saW5lSGVpZ2h0KSAtIDEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogR3JhY2VmdWxseSBzY3JvbGxzIGZyb20gdGhlIHRvcCBvZiB0aGUgZWRpdG9yIHRvIHRoZSByb3cgaW5kaWNhdGVkLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBBIHJvdyBpZFxuICAgICpcbiAgICAqXG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5zZXRTY3JvbGxUb3BcbiAgICAqKi9cbiAgICBzY3JvbGxUb1Jvdyhyb3c6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHJvdyAqIHRoaXMubGluZUhlaWdodCk7XG4gICAgfVxuXG4gICAgYWxpZ25DdXJzb3IoY3Vyc29yLyo6IFBvc2l0aW9uKi8sIGFsaWdubWVudDogbnVtYmVyKSB7XG4gICAgICAgIC8vIEZJWE1FOiBEb24ndCBoYXZlIHBvbHltb3JwaGljIGN1cnNvciBwYXJhbWV0ZXIuXG4gICAgICAgIGlmICh0eXBlb2YgY3Vyc29yID09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICBjdXJzb3IgPSB7IHJvdzogY3Vyc29yLCBjb2x1bW46IDAgfTtcblxuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuZ2V0UGl4ZWxQb3NpdGlvbihjdXJzb3IpO1xuICAgICAgICB2YXIgaCA9IHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgLSB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBvZmZzZXQgPSBwb3MudG9wIC0gaCAqIChhbGlnbm1lbnQgfHwgMCk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChvZmZzZXQpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0O1xuICAgIH1cblxuICAgICRjYWxjU3RlcHMoZnJvbVZhbHVlOiBudW1iZXIsIHRvVmFsdWU6IG51bWJlcik6IG51bWJlcltdIHtcbiAgICAgICAgdmFyIGk6IG51bWJlciA9IDA7XG4gICAgICAgIHZhciBsOiBudW1iZXIgPSB0aGlzLlNURVBTO1xuICAgICAgICB2YXIgc3RlcHM6IG51bWJlcltdID0gW107XG5cbiAgICAgICAgdmFyIGZ1bmMgPSBmdW5jdGlvbih0OiBudW1iZXIsIHhfbWluOiBudW1iZXIsIGR4OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICAgICAgcmV0dXJuIGR4ICogKE1hdGgucG93KHQgLSAxLCAzKSArIDEpICsgeF9taW47XG4gICAgICAgIH07XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGw7ICsraSkge1xuICAgICAgICAgICAgc3RlcHMucHVzaChmdW5jKGkgLyB0aGlzLlNURVBTLCBmcm9tVmFsdWUsIHRvVmFsdWUgLSBmcm9tVmFsdWUpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzdGVwcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHcmFjZWZ1bGx5IHNjcm9sbHMgdGhlIGVkaXRvciB0byB0aGUgcm93IGluZGljYXRlZC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbGluZSBBIGxpbmUgbnVtYmVyXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBjZW50ZXIgSWYgYHRydWVgLCBjZW50ZXJzIHRoZSBlZGl0b3IgdGhlIHRvIGluZGljYXRlZCBsaW5lXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbmltYXRlIElmIGB0cnVlYCBhbmltYXRlcyBzY3JvbGxpbmdcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgYWZ0ZXIgdGhlIGFuaW1hdGlvbiBoYXMgZmluaXNoZWRcbiAgICAgKi9cbiAgICBzY3JvbGxUb0xpbmUobGluZTogbnVtYmVyLCBjZW50ZXI6IGJvb2xlYW4sIGFuaW1hdGU6IGJvb2xlYW4sIGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLiRjdXJzb3JMYXllci5nZXRQaXhlbFBvc2l0aW9uKHsgcm93OiBsaW5lLCBjb2x1bW46IDAgfSk7XG4gICAgICAgIHZhciBvZmZzZXQgPSBwb3MudG9wO1xuICAgICAgICBpZiAoY2VudGVyKSB7XG4gICAgICAgICAgICBvZmZzZXQgLT0gdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCAvIDI7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaW5pdGlhbFNjcm9sbCA9IHRoaXMuc2Nyb2xsVG9wO1xuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKG9mZnNldCk7XG4gICAgICAgIGlmIChhbmltYXRlICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5hbmltYXRlU2Nyb2xsaW5nKGluaXRpYWxTY3JvbGwsIGNhbGxiYWNrKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFuaW1hdGVTY3JvbGxpbmcoZnJvbVZhbHVlOiBudW1iZXIsIGNhbGxiYWNrPykge1xuICAgICAgICB2YXIgdG9WYWx1ZSA9IHRoaXMuc2Nyb2xsVG9wO1xuICAgICAgICBpZiAoIXRoaXMuJGFuaW1hdGVkU2Nyb2xsKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcblxuICAgICAgICBpZiAoZnJvbVZhbHVlID09IHRvVmFsdWUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKHRoaXMuJHNjcm9sbEFuaW1hdGlvbikge1xuICAgICAgICAgICAgdmFyIG9sZFN0ZXBzID0gdGhpcy4kc2Nyb2xsQW5pbWF0aW9uLnN0ZXBzO1xuICAgICAgICAgICAgaWYgKG9sZFN0ZXBzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGZyb21WYWx1ZSA9IG9sZFN0ZXBzWzBdO1xuICAgICAgICAgICAgICAgIGlmIChmcm9tVmFsdWUgPT0gdG9WYWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHN0ZXBzID0gX3NlbGYuJGNhbGNTdGVwcyhmcm9tVmFsdWUsIHRvVmFsdWUpO1xuICAgICAgICB0aGlzLiRzY3JvbGxBbmltYXRpb24gPSB7IGZyb206IGZyb21WYWx1ZSwgdG86IHRvVmFsdWUsIHN0ZXBzOiBzdGVwcyB9O1xuXG4gICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy4kdGltZXIpO1xuXG4gICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHN0ZXBzLnNoaWZ0KCkpO1xuICAgICAgICAvLyB0cmljayBzZXNzaW9uIHRvIHRoaW5rIGl0J3MgYWxyZWFkeSBzY3JvbGxlZCB0byBub3QgbG9vc2UgdG9WYWx1ZVxuICAgICAgICBfc2VsZi5zZXNzaW9uLiRzY3JvbGxUb3AgPSB0b1ZhbHVlO1xuICAgICAgICB0aGlzLiR0aW1lciA9IHNldEludGVydmFsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHN0ZXBzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHN0ZXBzLnNoaWZ0KCkpO1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uJHNjcm9sbFRvcCA9IHRvVmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRvVmFsdWUgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uJHNjcm9sbFRvcCA9IC0xO1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHRvVmFsdWUpO1xuICAgICAgICAgICAgICAgIHRvVmFsdWUgPSBudWxsO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBkbyB0aGlzIG9uIHNlcGFyYXRlIHN0ZXAgdG8gbm90IGdldCBzcHVyaW91cyBzY3JvbGwgZXZlbnQgZnJvbSBzY3JvbGxiYXJcbiAgICAgICAgICAgICAgICBfc2VsZi4kdGltZXIgPSBjbGVhckludGVydmFsKF9zZWxmLiR0aW1lcik7XG4gICAgICAgICAgICAgICAgX3NlbGYuJHNjcm9sbEFuaW1hdGlvbiA9IG51bGw7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sgJiYgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgMTApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdGhlIGVkaXRvciB0byB0aGUgeSBwaXhlbCBpbmRpY2F0ZWQuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHNjcm9sbFRvcCBUaGUgcG9zaXRpb24gdG8gc2Nyb2xsIHRvXG4gICAgICovXG4gICAgc2Nyb2xsVG9ZKHNjcm9sbFRvcDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIC8vIGFmdGVyIGNhbGxpbmcgc2Nyb2xsQmFyLnNldFNjcm9sbFRvcFxuICAgICAgICAvLyBzY3JvbGxiYXIgc2VuZHMgdXMgZXZlbnQgd2l0aCBzYW1lIHNjcm9sbFRvcC4gaWdub3JlIGl0XG4gICAgICAgIGlmICh0aGlzLnNjcm9sbFRvcCAhPT0gc2Nyb2xsVG9wKSB7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX1NDUk9MTCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRoZSBlZGl0b3IgYWNyb3NzIHRoZSB4LWF4aXMgdG8gdGhlIHBpeGVsIGluZGljYXRlZC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc2Nyb2xsTGVmdCBUaGUgcG9zaXRpb24gdG8gc2Nyb2xsIHRvXG4gICAgICoqL1xuICAgIHNjcm9sbFRvWChzY3JvbGxMZWZ0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuc2Nyb2xsTGVmdCAhPT0gc2Nyb2xsTGVmdCkge1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxMZWZ0ID0gc2Nyb2xsTGVmdDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0hfU0NST0xMKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogU2Nyb2xscyB0aGUgZWRpdG9yIGFjcm9zcyBib3RoIHgtIGFuZCB5LWF4ZXMuXG4gICAgKiBAcGFyYW0ge051bWJlcn0geCBUaGUgeCB2YWx1ZSB0byBzY3JvbGwgdG9cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSB5IFRoZSB5IHZhbHVlIHRvIHNjcm9sbCB0b1xuICAgICoqL1xuICAgIHNjcm9sbFRvKHg6IG51bWJlciwgeTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AoeSk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KHkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdGhlIGVkaXRvciBhY3Jvc3MgYm90aCB4LSBhbmQgeS1heGVzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzY3JvbGxCeVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBkZWx0YVggVGhlIHggdmFsdWUgdG8gc2Nyb2xsIGJ5XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlbHRhWSBUaGUgeSB2YWx1ZSB0byBzY3JvbGwgYnlcbiAgICAgKi9cbiAgICBzY3JvbGxCeShkZWx0YVg6IG51bWJlciwgZGVsdGFZOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgZGVsdGFZICYmIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AodGhpcy5zZXNzaW9uLmdldFNjcm9sbFRvcCgpICsgZGVsdGFZKTtcbiAgICAgICAgZGVsdGFYICYmIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxMZWZ0KCkgKyBkZWx0YVgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgeW91IGNhbiBzdGlsbCBzY3JvbGwgYnkgZWl0aGVyIHBhcmFtZXRlcjsgaW4gb3RoZXIgd29yZHMsIHlvdSBoYXZlbid0IHJlYWNoZWQgdGhlIGVuZCBvZiB0aGUgZmlsZSBvciBsaW5lLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlbHRhWCBUaGUgeCB2YWx1ZSB0byBzY3JvbGwgYnlcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkZWx0YVkgVGhlIHkgdmFsdWUgdG8gc2Nyb2xsIGJ5XG4gICAgKlxuICAgICpcbiAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgKiovXG4gICAgaXNTY3JvbGxhYmxlQnkoZGVsdGFYOiBudW1iZXIsIGRlbHRhWTogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIGlmIChkZWx0YVkgPCAwICYmIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSA+PSAxIC0gdGhpcy5zY3JvbGxNYXJnaW4udG9wKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGlmIChkZWx0YVkgPiAwICYmIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSArIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHRcbiAgICAgICAgICAgIC0gdGhpcy5sYXllckNvbmZpZy5tYXhIZWlnaHQgPCAtMSArIHRoaXMuc2Nyb2xsTWFyZ2luLmJvdHRvbSlcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBpZiAoZGVsdGFYIDwgMCAmJiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpID49IDEgLSB0aGlzLnNjcm9sbE1hcmdpbi5sZWZ0KVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGlmIChkZWx0YVggPiAwICYmIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxMZWZ0KCkgKyB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGhcbiAgICAgICAgICAgIC0gdGhpcy5sYXllckNvbmZpZy53aWR0aCA8IC0xICsgdGhpcy5zY3JvbGxNYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBwaXhlbFRvU2NyZWVuQ29vcmRpbmF0ZXMoeDogbnVtYmVyLCB5OiBudW1iZXIpIHtcbiAgICAgICAgdmFyIGNhbnZhc1BvcyA9IHRoaXMuc2Nyb2xsZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICAgICAgdmFyIG9mZnNldCA9ICh4ICsgdGhpcy5zY3JvbGxMZWZ0IC0gY2FudmFzUG9zLmxlZnQgLSB0aGlzLiRwYWRkaW5nKSAvIHRoaXMuY2hhcmFjdGVyV2lkdGg7XG4gICAgICAgIHZhciByb3cgPSBNYXRoLmZsb29yKCh5ICsgdGhpcy5zY3JvbGxUb3AgLSBjYW52YXNQb3MudG9wKSAvIHRoaXMubGluZUhlaWdodCk7XG4gICAgICAgIHZhciBjb2wgPSBNYXRoLnJvdW5kKG9mZnNldCk7XG5cbiAgICAgICAgcmV0dXJuIHsgcm93OiByb3csIGNvbHVtbjogY29sLCBzaWRlOiBvZmZzZXQgLSBjb2wgPiAwID8gMSA6IC0xIH07XG4gICAgfVxuXG4gICAgc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXMoY2xpZW50WDogbnVtYmVyLCBjbGllbnRZOiBudW1iZXIpOiBQb3NpdGlvbiB7XG4gICAgICAgIHZhciBjYW52YXNQb3MgPSB0aGlzLnNjcm9sbGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG4gICAgICAgIHZhciBjb2x1bW4gPSBNYXRoLnJvdW5kKChjbGllbnRYICsgdGhpcy5zY3JvbGxMZWZ0IC0gY2FudmFzUG9zLmxlZnQgLSB0aGlzLiRwYWRkaW5nKSAvIHRoaXMuY2hhcmFjdGVyV2lkdGgpO1xuXG4gICAgICAgIHZhciByb3cgPSAoY2xpZW50WSArIHRoaXMuc2Nyb2xsVG9wIC0gY2FudmFzUG9zLnRvcCkgLyB0aGlzLmxpbmVIZWlnaHQ7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24ocm93LCBNYXRoLm1heChjb2x1bW4sIDApKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGBwYWdlWGAgYW5kIGBwYWdlWWAgY29vcmRpbmF0ZXMgb2YgdGhlIGRvY3VtZW50IHBvc2l0aW9uLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgZG9jdW1lbnQgcm93IHBvc2l0aW9uXG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBkb2N1bWVudCBjb2x1bW4gcG9zaXRpb25cbiAgICAqIEByZXR1cm4ge09iamVjdH1cbiAgICAqKi9cbiAgICB0ZXh0VG9TY3JlZW5Db29yZGluYXRlcyhyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiB7IHBhZ2VYOiBudW1iZXI7IHBhZ2VZOiBudW1iZXIgfSB7XG4gICAgICAgIHZhciBjYW52YXNQb3MgPSB0aGlzLnNjcm9sbGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICB2YXIgcG9zID0gdGhpcy5zZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihyb3csIGNvbHVtbik7XG5cbiAgICAgICAgdmFyIHggPSB0aGlzLiRwYWRkaW5nICsgTWF0aC5yb3VuZChwb3MuY29sdW1uICogdGhpcy5jaGFyYWN0ZXJXaWR0aCk7XG4gICAgICAgIHZhciB5ID0gcG9zLnJvdyAqIHRoaXMubGluZUhlaWdodDtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcGFnZVg6IGNhbnZhc1Bvcy5sZWZ0ICsgeCAtIHRoaXMuc2Nyb2xsTGVmdCxcbiAgICAgICAgICAgIHBhZ2VZOiBjYW52YXNQb3MudG9wICsgeSAtIHRoaXMuc2Nyb2xsVG9wXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogRm9jdXNlcyB0aGUgY3VycmVudCBjb250YWluZXIuXG4gICAgKiovXG4gICAgdmlzdWFsaXplRm9jdXMoKSB7XG4gICAgICAgIGFkZENzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBcImFjZV9mb2N1c1wiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBCbHVycyB0aGUgY3VycmVudCBjb250YWluZXIuXG4gICAgKiovXG4gICAgdmlzdWFsaXplQmx1cigpIHtcbiAgICAgICAgcmVtb3ZlQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIFwiYWNlX2ZvY3VzXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgc2hvd0NvbXBvc2l0aW9uXG4gICAgICogQHBhcmFtIHBvc2l0aW9uXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBzaG93Q29tcG9zaXRpb24ocG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0pIHtcbiAgICAgICAgaWYgKCF0aGlzLiRjb21wb3NpdGlvbilcbiAgICAgICAgICAgIHRoaXMuJGNvbXBvc2l0aW9uID0ge1xuICAgICAgICAgICAgICAgIGtlZXBUZXh0QXJlYUF0Q3Vyc29yOiB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvcixcbiAgICAgICAgICAgICAgICBjc3NUZXh0OiB0aGlzLnRleHRhcmVhLnN0eWxlLmNzc1RleHRcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSB0cnVlO1xuICAgICAgICBhZGRDc3NDbGFzcyh0aGlzLnRleHRhcmVhLCBcImFjZV9jb21wb3NpdGlvblwiKTtcbiAgICAgICAgdGhpcy50ZXh0YXJlYS5zdHlsZS5jc3NUZXh0ID0gXCJcIjtcbiAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBBIHN0cmluZyBvZiB0ZXh0IHRvIHVzZVxuICAgICAqXG4gICAgICogU2V0cyB0aGUgaW5uZXIgdGV4dCBvZiB0aGUgY3VycmVudCBjb21wb3NpdGlvbiB0byBgdGV4dGAuXG4gICAgICovXG4gICAgc2V0Q29tcG9zaXRpb25UZXh0KHRleHQ/OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgLy8gVE9ETzogV2h5IGlzIHRoZSBwYXJhbWV0ZXIgbm90IHVzZWQ/XG4gICAgICAgIHRoaXMuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSGlkZXMgdGhlIGN1cnJlbnQgY29tcG9zaXRpb24uXG4gICAgICovXG4gICAgaGlkZUNvbXBvc2l0aW9uKCkge1xuICAgICAgICBpZiAoIXRoaXMuJGNvbXBvc2l0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICByZW1vdmVDc3NDbGFzcyh0aGlzLnRleHRhcmVhLCBcImFjZV9jb21wb3NpdGlvblwiKTtcbiAgICAgICAgdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSB0aGlzLiRjb21wb3NpdGlvbi5rZWVwVGV4dEFyZWFBdEN1cnNvcjtcbiAgICAgICAgdGhpcy50ZXh0YXJlYS5zdHlsZS5jc3NUZXh0ID0gdGhpcy4kY29tcG9zaXRpb24uY3NzVGV4dDtcbiAgICAgICAgdGhpcy4kY29tcG9zaXRpb24gPSBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYSBuZXcgdGhlbWUgZm9yIHRoZSBlZGl0b3IuXG4gICAgICogVGhpcyBpcyBhIHN5bmNocm9ub3VzIG1ldGhvZC5cbiAgICAgKi9cbiAgICBzZXRUaGVtZShtb2RKczogeyBjc3NUZXh0OiBzdHJpbmc7IGNzc0NsYXNzOiBzdHJpbmc7IGlzRGFyazogYm9vbGVhbjsgcGFkZGluZzogbnVtYmVyIH0pOiB2b2lkIHtcblxuICAgICAgICBpZiAoIW1vZEpzLmNzc0NsYXNzKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBlbnN1cmVIVE1MU3R5bGVFbGVtZW50KG1vZEpzLmNzc1RleHQsIG1vZEpzLmNzc0NsYXNzLCB0aGlzLmNvbnRhaW5lci5vd25lckRvY3VtZW50KTtcblxuICAgICAgICBpZiAodGhpcy50aGVtZSkge1xuICAgICAgICAgICAgcmVtb3ZlQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIHRoaXMudGhlbWUuY3NzQ2xhc3MpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHBhZGRpbmcgPSBcInBhZGRpbmdcIiBpbiBtb2RKcyA/IG1vZEpzLnBhZGRpbmcgOiBcInBhZGRpbmdcIiBpbiAodGhpcy50aGVtZSB8fCB7fSkgPyA0IDogdGhpcy4kcGFkZGluZztcblxuICAgICAgICBpZiAodGhpcy4kcGFkZGluZyAmJiBwYWRkaW5nICE9IHRoaXMuJHBhZGRpbmcpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0UGFkZGluZyhwYWRkaW5nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMudGhlbWUgPSBtb2RKcztcbiAgICAgICAgdGhpcy5hZGRDc3NDbGFzcyhtb2RKcy5jc3NDbGFzcyk7XG4gICAgICAgIHRoaXMuc2V0Q3NzQ2xhc3MoXCJhY2VfZGFya1wiLCBtb2RKcy5pc0RhcmspO1xuXG4gICAgICAgIC8vIGZvcmNlIHJlLW1lYXN1cmUgb2YgdGhlIGd1dHRlciB3aWR0aFxuICAgICAgICBpZiAodGhpcy4kc2l6ZSkge1xuICAgICAgICAgICAgdGhpcy4kc2l6ZS53aWR0aCA9IDA7XG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVTaXplQXN5bmMoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgdGhlbWVMb2FkZWRcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX2VtaXQoJ3RoZW1lTG9hZGVkJywgeyB0aGVtZTogbW9kSnMgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBhZGRDc3NDbGFzc1xuICAgICAqIEBwYXJhbSBjc3NDbGFzcyB7c3RyaW5nfVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgYWRkQ3NzQ2xhc3MoY3NzQ2xhc3M6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBhZGRDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgY3NzQ2xhc3MpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgc2V0Q3NzQ2xhc3NcbiAgICAgKiBAcGFyYW0gY2xhc3NOYW1lOiB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSBpbmNsdWRlIHtib29sZWFufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0Q3NzQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIGluY2x1ZGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgc2V0Q3NzQ2xhc3ModGhpcy5jb250YWluZXIsIGNsYXNzTmFtZSwgaW5jbHVkZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW1wb3J0cyBhIG5ldyB0aGVtZSBmb3IgdGhlIGVkaXRvciB1c2luZyB0aGUgU3lzdGVtIExvYWRlci5cbiAgICAgKiBgdGhlbWVgIHNob3VsZCBleGlzdCwgYW5kIGJlIGEgZGlyZWN0b3J5IHBhdGgsIGxpa2UgYGFjZS90aGVtZS90ZXh0bWF0ZWAuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGltcG9ydFRoZW1lTGlua1xuICAgICAqIEBwYXJhbSB0aGVtZU5hbWUge3N0cmluZ30gVGhlIG5hbWUgb2YgYSB0aGVtZSBtb2R1bGUuXG4gICAgICogQHJldHVybiB7UHJvbWlzZTxUaGVtZT59XG4gICAgICovXG4gICAgaW1wb3J0VGhlbWVMaW5rKHRoZW1lTmFtZTogc3RyaW5nKTogUHJvbWlzZTxUaGVtZUxpbms+IHtcblxuICAgICAgICBpZiAoIXRoZW1lTmFtZSB8fCB0eXBlb2YgdGhlbWVOYW1lID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICB0aGVtZU5hbWUgPSB0aGVtZU5hbWUgfHwgdGhpcy5nZXRPcHRpb24oXCJ0aGVtZVwiKS5pbml0aWFsVmFsdWU7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuXG4gICAgICAgIHRoaXMuJHRoZW1lSWQgPSB0aGVtZU5hbWU7XG5cbiAgICAgICAgLy8gVE9ETzogSXMgdGhpcyB0aGUgcmlnaHQgcGxhY2UgdG8gZW1pdCB0aGUgZXZlbnQ/XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgdGhlbWVDaGFuZ2VcbiAgICAgICAgICovXG4gICAgICAgIF9zZWxmLmV2ZW50QnVzLl9lbWl0KCd0aGVtZUNoYW5nZScsIHsgdGhlbWU6IHRoZW1lTmFtZSB9KTtcblxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8VGhlbWVMaW5rPihmdW5jdGlvbihzdWNjZXNzLCBmYWlsKSB7XG4gICAgICAgICAgICAvLyBXZSB0YWtlIGFkdmFudGFnZSBvZiB0aGUgY29uZmlndXJhYmlsaXR5IG9mIHRoZSBTeXN0ZW0gTG9hZGVyLlxuICAgICAgICAgICAgLy8gQmVjYXVzZSB3ZSBhcmUgbG9hZGluZyBDU1MsIHdlIHJlcGxhY2UgdGhlIGluc3RhbnRpYXRpb24uXG4gICAgICAgICAgICBTeXN0ZW0uaW1wb3J0KHRoZW1lTmFtZSlcbiAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbihtOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGlzRGFyazogYm9vbGVhbiA9IG0uaXNEYXJrO1xuICAgICAgICAgICAgICAgICAgICB2YXIgaWQ6IHN0cmluZyA9IG0uY3NzQ2xhc3M7XG4gICAgICAgICAgICAgICAgICAgIHZhciBocmVmOiBzdHJpbmcgPSBtLmNzc05hbWU7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwYWRkaW5nOiBudW1iZXIgPSAodHlwZW9mIG0ucGFkZGluZyA9PT0gJ251bWJlcicpID8gbS5wYWRkaW5nIDogMDtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRoZW1lID0gbmV3IFRoZW1lTGluayhpc0RhcmssIGlkLCAnc3R5bGVzaGVldCcsICd0ZXh0L2NzcycsIGhyZWYsIHBhZGRpbmcpO1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzKHRoZW1lKTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5jYXRjaChmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGAke3JlYXNvbn1gKTtcbiAgICAgICAgICAgICAgICAgICAgZmFpbChyZWFzb24pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHNldFRoZW1lQ3NzXG4gICAgICogQHBhcmFtIGNzc0NsYXNzIHtzdHJpbmd9XG4gICAgICogQHBhcmFtIGhyZWYge3N0cmluZ31cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldFRoZW1lQ3NzKGNzc0NsYXNzOiBzdHJpbmcsIGhyZWY6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBhcHBlbmRIVE1MTGlua0VsZW1lbnQoY3NzQ2xhc3MsICdzdHlsZXNoZWV0JywgJ3RleHQvY3NzJywgaHJlZiwgZG9jdW1lbnQpO1xuICAgICAgICB0aGlzLmFkZENzc0NsYXNzKGNzc0NsYXNzKTtcbiAgICAgICAgLy8gICAgICB0aGlzLnNldENzc0NsYXNzKFwiYWNlX2RhcmtcIiwgdGhlbWVMaW5rLmlzRGFyayk7XG4gICAgICAgIC8vICAgICAgdGhpcy5zZXRQYWRkaW5nKHRoZW1lTGluay5wYWRkaW5nKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBwYXRoIG9mIHRoZSBjdXJyZW50IHRoZW1lLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRUaGVtZVxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICBnZXRUaGVtZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy4kdGhlbWVJZDtcbiAgICB9XG5cbiAgICAvLyBNZXRob2RzIGFsbG93cyB0byBhZGQgLyByZW1vdmUgQ1NTIGNsYXNzbmFtZXMgdG8gdGhlIGVkaXRvciBlbGVtZW50LlxuICAgIC8vIFRoaXMgZmVhdHVyZSBjYW4gYmUgdXNlZCBieSBwbHVnLWlucyB0byBwcm92aWRlIGEgdmlzdWFsIGluZGljYXRpb24gb2ZcbiAgICAvLyBhIGNlcnRhaW4gbW9kZSB0aGF0IGVkaXRvciBpcyBpbi5cblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSBuZXcgY2xhc3MsIGBzdHlsZWAsIHRvIHRoZSBlZGl0b3IuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHN0eWxlIEEgY2xhc3MgbmFtZVxuICAgICAqXG4gICAgICovXG4gICAgc2V0U3R5bGUoc3R5bGU6IHN0cmluZywgaW5jbHVkZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgc2V0Q3NzQ2xhc3ModGhpcy5jb250YWluZXIsIHN0eWxlLCBpbmNsdWRlICE9PSBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyB0aGUgY2xhc3MgYHN0eWxlYCBmcm9tIHRoZSBlZGl0b3IuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHN0eWxlIEEgY2xhc3MgbmFtZVxuICAgICAqL1xuICAgIHVuc2V0U3R5bGUoc3R5bGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICByZW1vdmVDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgc3R5bGUpO1xuICAgIH1cblxuICAgIHNldEN1cnNvclN0eWxlKHN0eWxlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgIT0gc3R5bGUpIHtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgPSBzdHlsZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBjdXJzb3JTdHlsZSBBIGNzcyBjdXJzb3Igc3R5bGVcbiAgICAgKi9cbiAgICBzZXRNb3VzZUN1cnNvcihjdXJzb3JTdHlsZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgPSBjdXJzb3JTdHlsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXN0cm95cyB0aGUgdGV4dCBhbmQgY3Vyc29yIGxheWVycyBmb3IgdGhpcyByZW5kZXJlci5cbiAgICAgKi9cbiAgICBkZXN0cm95KCk6IHZvaWQge1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuZGVzdHJveSgpO1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5kZXN0cm95KCk7XG4gICAgfVxufVxuXG5kZWZpbmVPcHRpb25zKFZpcnR1YWxSZW5kZXJlci5wcm90b3R5cGUsIFwicmVuZGVyZXJcIiwge1xuICAgIGFuaW1hdGVkU2Nyb2xsOiB7IGluaXRpYWxWYWx1ZTogZmFsc2UgfSxcbiAgICBzaG93SW52aXNpYmxlczoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyLnNldFNob3dJbnZpc2libGVzKHZhbHVlKSlcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX1RFWFQpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBzaG93UHJpbnRNYXJnaW46IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbigpIHsgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBwcmludE1hcmdpbkNvbHVtbjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKCkgeyB0aGlzLiR1cGRhdGVQcmludE1hcmdpbigpOyB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IDgwXG4gICAgfSxcbiAgICBwcmludE1hcmdpbjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWwgPT0gXCJudW1iZXJcIilcbiAgICAgICAgICAgICAgICB0aGlzLiRwcmludE1hcmdpbkNvbHVtbiA9IHZhbDtcbiAgICAgICAgICAgIHRoaXMuJHNob3dQcmludE1hcmdpbiA9ICEhdmFsO1xuICAgICAgICAgICAgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiRzaG93UHJpbnRNYXJnaW4gJiYgdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW47XG4gICAgICAgIH1cbiAgICB9LFxuICAgIHNob3dHdXR0ZXI6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG93KSB7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXIuc3R5bGUuZGlzcGxheSA9IHNob3cgPyBcImJsb2NrXCIgOiBcIm5vbmVcIjtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfRlVMTCk7XG4gICAgICAgICAgICB0aGlzLm9uR3V0dGVyUmVzaXplKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgZmFkZUZvbGRXaWRnZXRzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykge1xuICAgICAgICAgICAgc2V0Q3NzQ2xhc3ModGhpcy4kZ3V0dGVyLCBcImFjZV9mYWRlLWZvbGQtd2lkZ2V0c1wiLCBzaG93KTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgc2hvd0ZvbGRXaWRnZXRzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykgeyB0aGlzLiRndXR0ZXJMYXllci5zZXRTaG93Rm9sZFdpZGdldHMoc2hvdykgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBzaG93TGluZU51bWJlcnM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG93KSB7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5zZXRTaG93TGluZU51bWJlcnMoc2hvdyk7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX0dVVFRFUik7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgZGlzcGxheUluZGVudEd1aWRlczoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3cpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiR0ZXh0TGF5ZXIuc2V0RGlzcGxheUluZGVudEd1aWRlcyhzaG93KSlcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX1RFWFQpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGhpZ2hsaWdodEd1dHRlckxpbmU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG91bGRIaWdobGlnaHQpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodCkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQgPSBjcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuY2xhc3NOYW1lID0gXCJhY2VfZ3V0dGVyLWFjdGl2ZS1saW5lXCI7XG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyLmFwcGVuZENoaWxkKHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodC5zdHlsZS5kaXNwbGF5ID0gc2hvdWxkSGlnaGxpZ2h0ID8gXCJcIiA6IFwibm9uZVwiO1xuICAgICAgICAgICAgLy8gaWYgY3Vyc29ybGF5ZXIgaGF2ZSBuZXZlciBiZWVuIHVwZGF0ZWQgdGhlcmUncyBub3RoaW5nIG9uIHNjcmVlbiB0byB1cGRhdGVcbiAgICAgICAgICAgIGlmICh0aGlzLiRjdXJzb3JMYXllci4kcGl4ZWxQb3MpXG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlLFxuICAgICAgICB2YWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgaFNjcm9sbEJhckFsd2F5c1Zpc2libGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kaFNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHwgIXRoaXMuJGhvcml6U2Nyb2xsKVxuICAgICAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgdlNjcm9sbEJhckFsd2F5c1Zpc2libGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kdlNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHwgIXRoaXMuJHZTY3JvbGwpXG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9TQ1JPTEwpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBmb250U2l6ZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKGZvbnRTaXplOiBzdHJpbmcpIHtcbiAgICAgICAgICAgIHZhciB0aGF0OiBWaXJ0dWFsUmVuZGVyZXIgPSB0aGlzO1xuICAgICAgICAgICAgdGhhdC5jb250YWluZXIuc3R5bGUuZm9udFNpemUgPSBmb250U2l6ZTtcbiAgICAgICAgICAgIHRoYXQudXBkYXRlRm9udFNpemUoKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcIjEycHhcIlxuICAgIH0sXG4gICAgZm9udEZhbWlseToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKGZvbnRGYW1pbHk6IHN0cmluZykge1xuICAgICAgICAgICAgdmFyIHRoYXQ6IFZpcnR1YWxSZW5kZXJlciA9IHRoaXM7XG4gICAgICAgICAgICB0aGF0LmNvbnRhaW5lci5zdHlsZS5mb250RmFtaWx5ID0gZm9udEZhbWlseTtcbiAgICAgICAgICAgIHRoYXQudXBkYXRlRm9udFNpemUoKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgbWF4TGluZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlRnVsbCgpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBtaW5MaW5lczoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgdGhpcy51cGRhdGVGdWxsKCk7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIHNjcm9sbFBhc3RFbmQ6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHZhbCA9ICt2YWwgfHwgMDtcbiAgICAgICAgICAgIGlmICh0aGlzLiRzY3JvbGxQYXN0RW5kID09IHZhbClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB0aGlzLiRzY3JvbGxQYXN0RW5kID0gdmFsO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9TQ1JPTEwpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IDAsXG4gICAgICAgIGhhbmRsZXNTZXQ6IHRydWVcbiAgICB9LFxuICAgIGZpeGVkV2lkdGhHdXR0ZXI6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLiRmaXhlZFdpZHRoID0gISF2YWw7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX0dVVFRFUik7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIHRoZW1lOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7IHRoaXMuc2V0VGhlbWUodmFsKSB9LFxuICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy4kdGhlbWVJZCB8fCB0aGlzLnRoZW1lOyB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IFwiLi90aGVtZS90ZXh0bWF0ZVwiLFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfVxufSk7XG4iXX0=