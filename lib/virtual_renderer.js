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
export class VirtualRenderer extends eve.EventEmitterClass {
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
        this.container = container || dom.createElement("div");
        this.$keepTextAreaAtCursor = !useragent.isOldIE;
        dom.addCssClass(this.container, "ace_editor");
        this.setTheme(theme);
        this.$gutter = dom.createElement("div");
        this.$gutter.className = "ace_gutter";
        this.container.appendChild(this.$gutter);
        this.scroller = dom.createElement("div");
        this.scroller.className = "ace_scroller";
        this.container.appendChild(this.scroller);
        this.content = dom.createElement("div");
        this.content.className = "ace_content";
        this.scroller.appendChild(this.content);
        this.$gutterLayer = new gum.Gutter(this.$gutter);
        this.$gutterLayer.on("changeGutterWidth", this.onGutterResize.bind(this));
        this.$markerBack = new mam.Marker(this.content);
        var textLayer = this.$textLayer = new txm.Text(this.content);
        this.canvas = textLayer.element;
        this.$markerFront = new mam.Marker(this.content);
        this.$cursorLayer = new csm.Cursor(this.content);
        this.$horizScroll = false;
        this.$vScroll = false;
        this.scrollBarV = new scrollbar.VScrollBar(this.container, this);
        this.scrollBarH = new scrollbar.HScrollBar(this.container, this);
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
        this.$fontMetrics = new fmm.FontMetrics(this.container, 500);
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
        this.$loop = new rlm.RenderLoop(this.$renderChanges.bind(this), this.container.ownerDocument.defaultView);
        this.$loop.schedule(CHANGE_FULL);
        this.updateCharacterSize();
        this.setPadding(4);
        config.resetOptions(this);
        config._emit("renderer", this);
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
            var containerEl = dom.createElement("div");
            containerEl.className = "ace_layer ace_print-margin-layer";
            this.$printMarginEl = dom.createElement("div");
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
        dom.addCssClass(this.container, "ace_focus");
    }
    visualizeBlur() {
        dom.removeCssClass(this.container, "ace_focus");
    }
    showComposition(position) {
        if (!this.$composition)
            this.$composition = {
                keepTextAreaAtCursor: this.$keepTextAreaAtCursor,
                cssText: this.textarea.style.cssText
            };
        this.$keepTextAreaAtCursor = true;
        dom.addCssClass(this.textarea, "ace_composition");
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
        dom.removeCssClass(this.textarea, "ace_composition");
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
            config.loadModule(["theme", moduleName], afterLoad);
        }
        else {
            afterLoad(theme);
        }
        function afterLoad(module) {
            if (_self.$themeId != theme)
                return cb && cb();
            if (!module.cssClass)
                return;
            dom.importCssString(module.cssText, module.cssClass, _self.container.ownerDocument);
            if (_self.theme)
                dom.removeCssClass(_self.container, _self.theme.cssClass);
            var padding = "padding" in module ? module.padding : "padding" in (_self.theme || {}) ? 4 : _self.$padding;
            if (_self.$padding && padding != _self.$padding) {
                _self.setPadding(padding);
            }
            _self.$theme = module.cssClass;
            _self.theme = module;
            dom.addCssClass(_self.container, module.cssClass);
            dom.setCssClass(_self.container, "ace_dark", module.isDark);
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
        dom.setCssClass(this.container, style, include !== false);
    }
    unsetStyle(style) {
        dom.removeCssClass(this.container, style);
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
config.defineOptions(VirtualRenderer.prototype, "renderer", {
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
            dom.setCssClass(this.$gutter, "ace_fade-fold-widgets", show);
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
                this.$gutterLineHighlight = dom.createElement("div");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlydHVhbF9yZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy92aXJ0dWFsX3JlbmRlcmVyLnRzIl0sIm5hbWVzIjpbIlZpcnR1YWxSZW5kZXJlciIsIlZpcnR1YWxSZW5kZXJlci5jb25zdHJ1Y3RvciIsIlZpcnR1YWxSZW5kZXJlci5tYXhMaW5lcyIsIlZpcnR1YWxSZW5kZXJlci5rZWVwVGV4dEFyZWFBdEN1cnNvciIsIlZpcnR1YWxSZW5kZXJlci5zZXREZWZhdWx0Q3Vyc29yU3R5bGUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0Q3Vyc29yTGF5ZXJPZmYiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlQ2hhcmFjdGVyU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5zZXRTZXNzaW9uIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUxpbmVzIiwiVmlydHVhbFJlbmRlcmVyLm9uQ2hhbmdlTmV3TGluZU1vZGUiLCJWaXJ0dWFsUmVuZGVyZXIub25DaGFuZ2VUYWJTaXplIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZVRleHQiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlRnVsbCIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVGb250U2l6ZSIsIlZpcnR1YWxSZW5kZXJlci4kdXBkYXRlU2l6ZUFzeW5jIiwiVmlydHVhbFJlbmRlcmVyLm9uUmVzaXplIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVDYWNoZWRTaXplIiwiVmlydHVhbFJlbmRlcmVyLm9uR3V0dGVyUmVzaXplIiwiVmlydHVhbFJlbmRlcmVyLmFkanVzdFdyYXBMaW1pdCIsIlZpcnR1YWxSZW5kZXJlci5zZXRBbmltYXRlZFNjcm9sbCIsIlZpcnR1YWxSZW5kZXJlci5nZXRBbmltYXRlZFNjcm9sbCIsIlZpcnR1YWxSZW5kZXJlci5zZXRTaG93SW52aXNpYmxlcyIsIlZpcnR1YWxSZW5kZXJlci5nZXRTaG93SW52aXNpYmxlcyIsIlZpcnR1YWxSZW5kZXJlci5nZXREaXNwbGF5SW5kZW50R3VpZGVzIiwiVmlydHVhbFJlbmRlcmVyLnNldERpc3BsYXlJbmRlbnRHdWlkZXMiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2hvd1ByaW50TWFyZ2luIiwiVmlydHVhbFJlbmRlcmVyLmdldFNob3dQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5zZXRQcmludE1hcmdpbkNvbHVtbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRQcmludE1hcmdpbkNvbHVtbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRTaG93R3V0dGVyIiwiVmlydHVhbFJlbmRlcmVyLnNldFNob3dHdXR0ZXIiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0RmFkZUZvbGRXaWRnZXRzIiwiVmlydHVhbFJlbmRlcmVyLnNldEZhZGVGb2xkV2lkZ2V0cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRIaWdobGlnaHRHdXR0ZXJMaW5lIiwiVmlydHVhbFJlbmRlcmVyLmdldEhpZ2hsaWdodEd1dHRlckxpbmUiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVByaW50TWFyZ2luIiwiVmlydHVhbFJlbmRlcmVyLmdldENvbnRhaW5lckVsZW1lbnQiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0TW91c2VFdmVudFRhcmdldCIsIlZpcnR1YWxSZW5kZXJlci5nZXRUZXh0QXJlYUNvbnRhaW5lciIsIlZpcnR1YWxSZW5kZXJlci4kbW92ZVRleHRBcmVhVG9DdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0Rmlyc3RWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldEZpcnN0RnVsbHlWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldExhc3RGdWxseVZpc2libGVSb3ciLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0TGFzdFZpc2libGVSb3ciLCJWaXJ0dWFsUmVuZGVyZXIuc2V0UGFkZGluZyIsIlZpcnR1YWxSZW5kZXJlci5zZXRTY3JvbGxNYXJnaW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNjcm9sbEJhclYiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNjcm9sbEJhckgiLCJWaXJ0dWFsUmVuZGVyZXIuZnJlZXplIiwiVmlydHVhbFJlbmRlcmVyLnVuZnJlZXplIiwiVmlydHVhbFJlbmRlcmVyLiRyZW5kZXJDaGFuZ2VzIiwiVmlydHVhbFJlbmRlcmVyLiRhdXRvc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci4kY29tcHV0ZUxheWVyQ29uZmlnIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVMaW5lcyIsIlZpcnR1YWxSZW5kZXJlci4kZ2V0TG9uZ2VzdExpbmUiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlRnJvbnRNYXJrZXJzIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUJhY2tNYXJrZXJzIiwiVmlydHVhbFJlbmRlcmVyLmFkZEd1dHRlckRlY29yYXRpb24iLCJWaXJ0dWFsUmVuZGVyZXIucmVtb3ZlR3V0dGVyRGVjb3JhdGlvbiIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVCcmVha3BvaW50cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRBbm5vdGF0aW9ucyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuaGlkZUN1cnNvciIsIlZpcnR1YWxSZW5kZXJlci5zaG93Q3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFNlbGVjdGlvbkludG9WaWV3IiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbFRvcCIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxMZWZ0IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbFRvcFJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxCb3R0b21Sb3ciLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9Sb3ciLCJWaXJ0dWFsUmVuZGVyZXIuYWxpZ25DdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuJGNhbGNTdGVwcyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb0xpbmUiLCJWaXJ0dWFsUmVuZGVyZXIuYW5pbWF0ZVNjcm9sbGluZyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb1kiLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9YIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbEJ5IiwiVmlydHVhbFJlbmRlcmVyLmlzU2Nyb2xsYWJsZUJ5IiwiVmlydHVhbFJlbmRlcmVyLnBpeGVsVG9TY3JlZW5Db29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci50ZXh0VG9TY3JlZW5Db29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci52aXN1YWxpemVGb2N1cyIsIlZpcnR1YWxSZW5kZXJlci52aXN1YWxpemVCbHVyIiwiVmlydHVhbFJlbmRlcmVyLnNob3dDb21wb3NpdGlvbiIsIlZpcnR1YWxSZW5kZXJlci5zZXRDb21wb3NpdGlvblRleHQiLCJWaXJ0dWFsUmVuZGVyZXIuaGlkZUNvbXBvc2l0aW9uIiwiVmlydHVhbFJlbmRlcmVyLnNldFRoZW1lIiwiVmlydHVhbFJlbmRlcmVyLnNldFRoZW1lLmFmdGVyTG9hZCIsIlZpcnR1YWxSZW5kZXJlci5nZXRUaGVtZSIsIlZpcnR1YWxSZW5kZXJlci5zZXRTdHlsZSIsIlZpcnR1YWxSZW5kZXJlci51bnNldFN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEN1cnNvclN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldE1vdXNlQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLmRlc3Ry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Q0EsS0FBS0EsQ0FBQ0E7UUFDdEJBLElBQUlBLE9BQU9BLEdBQUdBO1lBQ1ZBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBO1lBQ2pCQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxNQUFNQTtZQUNuQkEsY0FBY0EsRUFBRUEsSUFBSUEsQ0FBQ0EsY0FBY0E7WUFDbkNBLGFBQWFBLEVBQUVBLElBQUlBLENBQUNBLGFBQWFBO1NBQ3BDQSxDQUFDQTtRQUNGQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3Q0EsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7WUFDckJBLE9BQU9BLElBQUlBLFdBQVdBLENBQUNBO1lBRXZCQSxJQUFJQSxDQUFDQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7Z0JBQ2xCQSxJQUFJQSxDQUFDQSxjQUFjQSxJQUFJQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUVsREEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFFckVBLE9BQU9BLEdBQUdBLE9BQU9BLEdBQUdBLGFBQWFBLENBQUNBO1FBQ3RDQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQ0EsT0FBT0EsSUFBSUEsV0FBV0EsQ0FBQ0E7WUFDdkJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLEtBQUtB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Q0FBQ0E7SUFFRHRELGNBQWNBLENBQUNBLE9BQU9BLEVBQUVBLEtBQUtBO1FBQ3pCdUQsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaEJBLE9BQU9BLElBQUlBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBO1lBQ3pCQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN0QkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsV0FBV0EsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekZBLElBQUlBLENBQUNBLFFBQVFBLElBQUlBLE9BQU9BLENBQUNBO1lBQ3pCQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsSUFBSUEsQ0FBQ0EsUUFBUUEsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDekJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQy9CQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQkEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsbUJBQW1CQSxFQUFFQSxDQUFDQTtRQUMxQ0EsQ0FBQ0E7UUFHREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0E7UUFDN0JBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBO1FBRTlCQSxFQUFFQSxD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SUEsQ0FBQ0EsY0FBY0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFM0ZBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLEVBQ2pGQSxXQUFXQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUV0RkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDM0RBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLE1BQU1BLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3BGQSxJQUFJQSxPQUFPQSxHQUFHQSxRQUFRQSxHQUFHQSxTQUFTQSxDQUFDQTtRQUduQ0EsSUFBSUEsY0FBY0EsRUFBRUEsY0FBY0EsQ0FBQ0E7UUFDbkNBLElBQUlBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBQ2pDQSxRQUFRQSxHQUFHQSxPQUFPQSxDQUFDQSxtQkFBbUJBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBSXBEQSxJQUFJQSxRQUFRQSxHQUFHQSxPQUFPQSxDQUFDQSxXQUFXQSxDQUFDQSxRQUFRQSxDQUFD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QUFJQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUVsQkEsSUFBSUEsU0FBU0EsR0FBR0EsV0FBV0EsSUFBSUEsV0FBV0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDcERBLElBQUlBLFlBQVlBLEdBQUdBLFdBQVdBLElBQUlBLFdBQVdBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBO1FBRTFEQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBRXJGQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxHQUFHQSxTQUFTQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ1BBLEdBQUdBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBLENBQUNBO1lBQzlDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDVkEsR0FBR0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDakNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ25DQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxHQUFHQSxZQUFZQSxHQUFHQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ1BBLEdBQUdBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNB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R0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDN0VBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRTdCQSxNQUFNQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxHQUFHQSxFQUFFQSxJQUFJQSxFQUFFQSxNQUFNQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQTtJQUN0RUEsQ0FBQ0E7SUFFRHJGLHVCQUF1QkEsQ0FBQ0EsT0FBZUEsRUFBRUEsT0FBZUE7UUFDcERzRixJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxxQkFBcUJBLEVBQUVBLENBQUNBO1FBRXREQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxTQUFTQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQTtRQUU1R0EsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFFdkVBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLHdCQUF3QkEsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDM0VBLENBQUNBO0lBUUR0Rix1QkFBdUJBLENBQUNBLEdBQVdBLEVBQUVBLE1BQWNBO1FBQy9DdUYsSUFB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Q0FBQ0E7WUFFOURBLElBQUlBLE9BQU9BLEdBQUdBLFNBQVNBLElBQUlBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBLE9BQU9BLEdBQUdBLFNBQVNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLElBQUlBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBO1lBRTNHQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxJQUFJQSxPQUFPQSxJQUFJQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDOUNBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBQzlCQSxDQUFDQTtZQUdEQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQTtZQUUvQkEsS0FBS0EsQ0FBQ0EsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0E7WUFDckJBLEdBQUdBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLEVBQUVBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1lBQ2xEQSxHQUFHQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxFQUFFQSxVQUFVQSxFQUFFQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUc1REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2RBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBO2dCQUN0QkEsS0FBS0EsQ0FBQ0EsZ0JBQWdCQSxFQUFFQSxDQUFDQTtZQUM3QkEsQ0FBQ0E7WUFFREEsS0FBS0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsYUFBYUEsRUFBRUEsRUFBRUEsS0FBS0EsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDdkRBLEVBQUVBLElBQUlBLEVBQUVBLEVBQUVBLENBQUNBO1FBQ2ZBLENBQUNBO0lBQ0xELENBQUNBO0lBTUQ3RixRQUFRQTtRQUNKK0YsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7SUFDekJBLENBQUNBO0lBV0QvRixRQUFRQSxDQUFDQSxLQUFhQSxFQUFFQSxPQUFpQkE7UUFDckNnRyxHQUFHQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxLQUFLQSxFQUFFQSxPQUFPQSxLQUFLQSxLQUFLQSxDQUFDQSxDQUFDQTtJQUM5REEsQ0FBQ0E7SUFNRGhHLFVBQVVBLENBQUNBLEtBQWFBO1FBQ3BCaUcsR0FBR0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7SUFDOUNBLENBQUNBO0lBRURqRyxjQUFjQSxDQUFDQSxLQUFhQTtRQUN4QmtHLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUN0Q0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFLRGxHLGNBQWNBLENBQUNBLFdBQW1CQTtRQUM5Qm1HLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLFdBQVdBLENBQUNBO0lBQzVDQSxDQUFDQTtJQUtEbkcsT0FBT0E7UUFDSG9HLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBO1FBQzFCQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxPQUFPQSxFQUFFQSxDQUFDQTtJQUNoQ0EsQ0FBQ0E7QUFDTHBHLENBQUNBO0FBRUQsTUFBTSxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUMsU0FBUyxFQUFFLFVBQVUsRUFBRTtJQUN4RCxjQUFjLEVBQUUsRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFO0lBQ3ZDLGNBQWMsRUFBRTtRQUNaLEdBQUcsRUFBRSxVQUFTLEtBQUs7WUFDZixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUN6QyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDOUMsQ0FBQztRQUNELFlBQVksRUFBRSxLQUFLO0tBQ3RCO0lBQ0QsZUFBZSxFQUFFO1FBQ2IsR0FBRyxFQUFFLGNBQWEsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlDLFlBQVksRUFBRSxJQUFJO0tBQ3JCO0lBQ0QsaUJBQWlCLEVBQUU7UUFDZixHQUFHLEVBQUUsY0FBYSxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUMsWUFBWSxFQUFFLEVBQUU7S0FDbkI7SUFDRCxXQUFXLEVBQUU7UUFDVCxHQUFHLEVBQUUsVUFBUyxHQUFHO1lBQ2IsRUFBRSxDQUFDLENBQUMsT0FBTyxHQUFHLElBQUksUUFBUSxDQUFDO2dCQUN2QixJQUFJLENBQUMsa0JBQWtCLEdBQUcsR0FBRyxDQUFDO1lBQ2xDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDO1lBQzlCLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQzlCLENBQUM7UUFDRCxHQUFHLEVBQUU7WUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixJQUFJLElBQUksQ0FBQyxrQkFBa0IsQ0FBQztRQUM1RCxDQUFDO0tBQ0o7SUFDRCxVQUFVLEVBQUU7UUFDUixHQUFHLEVBQUUsVUFBUyxJQUFJO1lBQ2QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLElBQUksR0FBRyxPQUFPLEdBQUcsTUFBTSxDQUFDO1lBQ3JELElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUN0QyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDMUIsQ0FBQztRQUNELFlBQVksRUFBRSxJQUFJO0tBQ3JCO0lBQ0QsZUFBZSxFQUFFO1FBQ2IsR0FBRyxFQUFFLFVBQVMsSUFBSTtZQUNkLEdBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNqRSxDQUFDO1FBQ0QsWUFBWSxFQUFFLEtBQUs7S0FDdEI7SUFDRCxlQUFlLEVBQUU7UUFDYixHQUFHLEVBQUUsVUFBUyxJQUFJLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQSxDQUFDLENBQUM7UUFDbEUsWUFBWSxFQUFFLElBQUk7S0FDckI7SUFDRCxlQUFlLEVBQUU7UUFDYixHQUFHLEVBQUUsVUFBUyxJQUFJO1lBQ2QsSUFBSSxDQUFDLFlBQVksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMzQyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDNUMsQ0FBQztRQUNELFlBQVksRUFBRSxJQUFJO0tBQ3JCO0lBQ0QsbUJBQW1CLEVBQUU7UUFDakIsR0FBRyxFQUFFLFVBQVMsSUFBSTtZQUNkLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzdDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM5QyxDQUFDO1FBQ0QsWUFBWSxFQUFFLElBQUk7S0FDckI7SUFDRCxtQkFBbUIsRUFBRTtRQUNqQixHQUFHLEVBQUUsVUFBUyxlQUFlO1lBQ3pCLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztnQkFDN0IsSUFBSSxDQUFDLG9CQUFvQixHQUFHLEdBQUcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3JELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLEdBQUcsd0JBQXdCLENBQUM7Z0JBQy9ELElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO2dCQUNwRCxNQUFNLENBQUM7WUFDWCxDQUFDO1lBRUQsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsZUFBZSxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUM7WUFFeEUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUM7Z0JBQzVCLElBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDO1FBQzFDLENBQUM7UUFDRCxZQUFZLEVBQUUsS0FBSztRQUNuQixLQUFLLEVBQUUsSUFBSTtLQUNkO0lBQ0QsdUJBQXVCLEVBQUU7UUFDckIsR0FBRyxFQUFFLFVBQVMsR0FBRztZQUNiLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLHdCQUF3QixJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQztnQkFDckQsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ2hELENBQUM7UUFDRCxZQUFZLEVBQUUsS0FBSztLQUN0QjtJQUNELHVCQUF1QixFQUFFO1FBQ3JCLEdBQUcsRUFBRSxVQUFTLEdBQUc7WUFDYixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyx3QkFBd0IsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUM7Z0JBQ2pELElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNoRCxDQUFDO1FBQ0QsWUFBWSxFQUFFLEtBQUs7S0FDdEI7SUFDRCxRQUFRLEVBQUU7UUFDTixHQUFHLEVBQUUsVUFBUyxJQUFJO1lBQ2QsRUFBRSxDQUFDLENBQUMsT0FBTyxJQUFJLElBQUksUUFBUSxDQUFDO2dCQUN4QixJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztZQUN2QixJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO1lBQ3JDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUMxQixDQUFDO1FBQ0QsWUFBWSxFQUFFLEVBQUU7S0FDbkI7SUFDRCxVQUFVLEVBQUU7UUFDUixHQUFHLEVBQUUsVUFBUyxJQUFJO1lBQ2QsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztZQUN2QyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDMUIsQ0FBQztLQUNKO0lBQ0QsUUFBUSxFQUFFO1FBQ04sR0FBRyxFQUFFLFVBQVMsR0FBRztZQUNiLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUN0QixDQUFDO0tBQ0o7SUFDRCxRQUFRLEVBQUU7UUFDTixHQUFHLEVBQUUsVUFBUyxHQUFHO1lBQ2IsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ3RCLENBQUM7S0FDSjtJQUNELGFBQWEsRUFBRTtRQUNYLEdBQUcsRUFBRSxVQUFTLEdBQUc7WUFDYixHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO1lBQ2hCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLElBQUksR0FBRyxDQUFDO2dCQUMzQixNQUFNLENBQUM7WUFDWCxJQUFJLENBQUMsY0FBYyxHQUFHLEdBQUcsQ0FBQztZQUMxQixJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDNUMsQ0FBQztRQUNELFlBQVksRUFBRSxDQUFDO1FBQ2YsVUFBVSxFQUFFLElBQUk7S0FDbkI7SUFDRCxnQkFBZ0IsRUFBRTtRQUNkLEdBQUcsRUFBRSxVQUFTLEdBQUc7WUFDYixJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDO1lBQ3RDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUM1QyxDQUFDO0tBQ0o7SUFDRCxLQUFLLEVBQUU7UUFDSCxHQUFHLEVBQUUsVUFBUyxHQUFHLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQSxDQUFDLENBQUM7UUFDekMsR0FBRyxFQUFFLGNBQWEsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDdkQsWUFBWSxFQUFFLGtCQUFrQjtRQUNoQyxVQUFVLEVBQUUsSUFBSTtLQUNuQjtDQUNKLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXG5pbXBvcnQgb29wID0gcmVxdWlyZShcIi4vbGliL29vcFwiKTtcbmltcG9ydCBkb20gPSByZXF1aXJlKFwiLi9saWIvZG9tXCIpO1xuaW1wb3J0IGNvbmZpZyA9IHJlcXVpcmUoXCIuL2NvbmZpZ1wiKTtcbmltcG9ydCB1c2VyYWdlbnQgPSByZXF1aXJlKFwiLi9saWIvdXNlcmFnZW50XCIpO1xuaW1wb3J0IGd1bSA9IHJlcXVpcmUoXCIuL2xheWVyL2d1dHRlclwiKTtcbmltcG9ydCBtYW0gPSByZXF1aXJlKFwiLi9sYXllci9tYXJrZXJcIik7XG5pbXBvcnQgdHhtID0gcmVxdWlyZShcIi4vbGF5ZXIvdGV4dFwiKTtcbmltcG9ydCBjc20gPSByZXF1aXJlKFwiLi9sYXllci9jdXJzb3JcIik7XG5pbXBvcnQgc2Nyb2xsYmFyID0gcmVxdWlyZShcIi4vc2Nyb2xsYmFyXCIpO1xuaW1wb3J0IHJsbSA9IHJlcXVpcmUoXCIuL3JlbmRlcmxvb3BcIik7XG5pbXBvcnQgZm1tID0gcmVxdWlyZShcIi4vbGF5ZXIvZm9udF9tZXRyaWNzXCIpO1xuaW1wb3J0IGV2ZSA9IHJlcXVpcmUoXCIuL2xpYi9ldmVudF9lbWl0dGVyXCIpO1xuaW1wb3J0IGVzbSA9IHJlcXVpcmUoJy4vZWRpdF9zZXNzaW9uJyk7XG5cbi8vIEZJWE1FXG4vLyBpbXBvcnQgZWRpdG9yQ3NzID0gcmVxdWlyZShcIi4vcmVxdWlyZWpzL3RleHQhLi9jc3MvZWRpdG9yLmNzc1wiKTtcbi8vIGRvbS5pbXBvcnRDc3NTdHJpbmcoZWRpdG9yQ3NzLCBcImFjZV9lZGl0b3JcIik7XG5cbnZhciBDSEFOR0VfQ1VSU09SID0gMTtcbnZhciBDSEFOR0VfTUFSS0VSID0gMjtcbnZhciBDSEFOR0VfR1VUVEVSID0gNDtcbnZhciBDSEFOR0VfU0NST0xMID0gODtcbnZhciBDSEFOR0VfTElORVMgPSAxNjtcbnZhciBDSEFOR0VfVEVYVCA9IDMyO1xudmFyIENIQU5HRV9TSVpFID0gNjQ7XG52YXIgQ0hBTkdFX01BUktFUl9CQUNLID0gMTI4O1xudmFyIENIQU5HRV9NQVJLRVJfRlJPTlQgPSAyNTY7XG52YXIgQ0hBTkdFX0ZVTEwgPSA1MTI7XG52YXIgQ0hBTkdFX0hfU0NST0xMID0gMTAyNDtcblxuLyoqXG4gKiBUaGUgY2xhc3MgdGhhdCBpcyByZXNwb25zaWJsZSBmb3IgZHJhd2luZyBldmVyeXRoaW5nIHlvdSBzZWUgb24gdGhlIHNjcmVlbiFcbiAqIEByZWxhdGVkIGVkaXRvci5yZW5kZXJlciBcbiAqIEBjbGFzcyBWaXJ0dWFsUmVuZGVyZXJcbiAqKi9cbmV4cG9ydCBjbGFzcyBWaXJ0dWFsUmVuZGVyZXIgZXh0ZW5kcyBldmUuRXZlbnRFbWl0dGVyQ2xhc3Mge1xuICAgIHB1YmxpYyB0ZXh0YXJlYTogSFRNTFRleHRBcmVhRWxlbWVudDtcbiAgICBwdWJsaWMgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcbiAgICBwdWJsaWMgc2Nyb2xsTGVmdCA9IDA7XG4gICAgcHVibGljIHNjcm9sbFRvcCA9IDA7XG4gICAgcHVibGljIGxheWVyQ29uZmlnID0ge1xuICAgICAgICB3aWR0aDogMSxcbiAgICAgICAgcGFkZGluZzogMCxcbiAgICAgICAgZmlyc3RSb3c6IDAsXG4gICAgICAgIGZpcnN0Um93U2NyZWVuOiAwLFxuICAgICAgICBsYXN0Um93OiAwLFxuICAgICAgICBsaW5lSGVpZ2h0OiAwLFxuICAgICAgICBjaGFyYWN0ZXJXaWR0aDogMCxcbiAgICAgICAgbWluSGVpZ2h0OiAxLFxuICAgICAgICBtYXhIZWlnaHQ6IDEsXG4gICAgICAgIG9mZnNldDogMCxcbiAgICAgICAgaGVpZ2h0OiAxLFxuICAgICAgICBndXR0ZXJPZmZzZXQ6IDFcbiAgICB9O1xuICAgIHB1YmxpYyAkbWF4TGluZXM6IG51bWJlcjtcbiAgICBwdWJsaWMgJG1pbkxpbmVzOiBudW1iZXI7XG4gICAgcHVibGljICRjdXJzb3JMYXllcjogY3NtLkN1cnNvcjtcbiAgICBwdWJsaWMgJGd1dHRlckxheWVyOiBndW0uR3V0dGVyO1xuXG4gICAgcHVibGljICRwYWRkaW5nOiBudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgJGZyb3plbiA9IGZhbHNlO1xuXG4gICAgLy8gVGhlIHRoZW1lSWQgaXMgd2hhdCBpcyBjb21tdW5pY2F0ZWQgaW4gdGhlIEFQSS5cbiAgICBwcml2YXRlICR0aGVtZUlkOiBzdHJpbmc7XG4gICAgLy8gV2hhdCBhcmUgdGhlc2U/XG4gICAgcHJpdmF0ZSB0aGVtZTtcbiAgICBwcml2YXRlICR0aGVtZTtcblxuICAgIHByaXZhdGUgJG9wdGlvbnM7XG4gICAgcHJpdmF0ZSAkdGltZXI7XG4gICAgcHJpdmF0ZSBTVEVQUyA9IDg7XG4gICAgcHVibGljICRrZWVwVGV4dEFyZWFBdEN1cnNvcjogYm9vbGVhbjtcbiAgICBwdWJsaWMgJGd1dHRlcjtcbiAgICBwdWJsaWMgc2Nyb2xsZXI7XG4gICAgcHVibGljIGNvbnRlbnQ6IEhUTUxEaXZFbGVtZW50O1xuICAgIHB1YmxpYyAkdGV4dExheWVyOiB0eG0uVGV4dDtcbiAgICBwcml2YXRlICRtYXJrZXJGcm9udDogbWFtLk1hcmtlcjtcbiAgICBwcml2YXRlICRtYXJrZXJCYWNrOiBtYW0uTWFya2VyO1xuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MRGl2RWxlbWVudDtcbiAgICBwcml2YXRlICRob3JpelNjcm9sbDogYm9vbGVhbjtcbiAgICBwcml2YXRlICR2U2Nyb2xsO1xuICAgIHB1YmxpYyBzY3JvbGxCYXJIOiBzY3JvbGxiYXIuSFNjcm9sbEJhcjtcbiAgICBwdWJsaWMgc2Nyb2xsQmFyVjogc2Nyb2xsYmFyLlZTY3JvbGxCYXI7XG4gICAgcHJpdmF0ZSAkc2Nyb2xsQW5pbWF0aW9uOiB7IGZyb206IG51bWJlcjsgdG86IG51bWJlcjsgc3RlcHM6IG51bWJlcltdIH07XG4gICAgcHJpdmF0ZSBzZXNzaW9uOiBlc20uRWRpdFNlc3Npb247XG4gICAgcHJpdmF0ZSBzY3JvbGxNYXJnaW4gPSB7XG4gICAgICAgIGxlZnQ6IDAsXG4gICAgICAgIHJpZ2h0OiAwLFxuICAgICAgICB0b3A6IDAsXG4gICAgICAgIGJvdHRvbTogMCxcbiAgICAgICAgdjogMCxcbiAgICAgICAgaDogMFxuICAgIH07XG5cbiAgICBwcml2YXRlICRmb250TWV0cmljcztcbiAgICBwcml2YXRlICRhbGxvd0JvbGRGb250cztcbiAgICBwcml2YXRlIGN1cnNvclBvcztcbiAgICBwdWJsaWMgJHNpemU7XG4gICAgcHJpdmF0ZSAkbG9vcDtcbiAgICBwcml2YXRlICRjaGFuZ2VkTGluZXM7XG4gICAgcHJpdmF0ZSAkY2hhbmdlcyA9IDA7XG4gICAgcHJpdmF0ZSByZXNpemluZztcbiAgICBwcml2YXRlICRndXR0ZXJMaW5lSGlnaGxpZ2h0O1xuICAgIHByaXZhdGUgZ3V0dGVyV2lkdGg7XG4gICAgcHJpdmF0ZSAkZ3V0dGVyV2lkdGg7XG4gICAgcHJpdmF0ZSAkc2hvd1ByaW50TWFyZ2luO1xuICAgIHByaXZhdGUgJHByaW50TWFyZ2luRWw7XG4gICAgcHJpdmF0ZSBnZXRPcHRpb247XG4gICAgcHJpdmF0ZSBzZXRPcHRpb247XG4gICAgcHJpdmF0ZSBjaGFyYWN0ZXJXaWR0aDtcbiAgICBwcml2YXRlICRwcmludE1hcmdpbkNvbHVtbjtcbiAgICBwcml2YXRlIGxpbmVIZWlnaHQ7XG4gICAgcHJpdmF0ZSAkZXh0cmFIZWlnaHQ7XG4gICAgcHJpdmF0ZSAkY29tcG9zaXRpb246IHsga2VlcFRleHRBcmVhQXRDdXJzb3I6IGJvb2xlYW47IGNzc1RleHQ6IHN0cmluZyB9O1xuICAgIHByaXZhdGUgJGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIHByaXZhdGUgJHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIHByaXZhdGUgJHNob3dHdXR0ZXI7XG4gICAgcHJpdmF0ZSBzaG93SW52aXNpYmxlcztcbiAgICBwcml2YXRlICRhbmltYXRlZFNjcm9sbDtcbiAgICBwcml2YXRlICRzY3JvbGxQYXN0RW5kO1xuICAgIHByaXZhdGUgJGhpZ2hsaWdodEd1dHRlckxpbmU7XG4gICAgcHJpdmF0ZSBkZXNpcmVkSGVpZ2h0O1xuICAgIC8qKlxuICAgICAqIENvbnN0cnVjdHMgYSBuZXcgYFZpcnR1YWxSZW5kZXJlcmAgd2l0aGluIHRoZSBgY29udGFpbmVyYCBzcGVjaWZpZWQsIGFwcGx5aW5nIHRoZSBnaXZlbiBgdGhlbWVgLlxuICAgICAqIEBjbGFzcyBWaXJ0dWFsUmVuZGVyZXJcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKiBAcGFyYW0gY29udGFpbmVyIHtET01FbGVtZW50fSBUaGUgcm9vdCBlbGVtZW50IG9mIHRoZSBlZGl0b3JcbiAgICAgKiBAcGFyYW0gW3RoZW1lXSB7c3RyaW5nfSBUaGUgc3RhcnRpbmcgdGhlbWVcbiAgICAgKi9cbiAgICBjb25zdHJ1Y3Rvcihjb250YWluZXI6IEhUTUxFbGVtZW50LCB0aGVtZT86IHN0cmluZykge1xuICAgICAgICBzdXBlcigpO1xuXG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgdGhpcy5jb250YWluZXIgPSBjb250YWluZXIgfHwgPEhUTUxEaXZFbGVtZW50PmRvbS5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXG4gICAgICAgIC8vIFRPRE86IHRoaXMgYnJlYWtzIHJlbmRlcmluZyBpbiBDbG91ZDkgd2l0aCBtdWx0aXBsZSBhY2UgaW5zdGFuY2VzXG4gICAgICAgIC8vIC8vIEltcG9ydHMgQ1NTIG9uY2UgcGVyIERPTSBkb2N1bWVudCAoJ2FjZV9lZGl0b3InIHNlcnZlcyBhcyBhbiBpZGVudGlmaWVyKS5cbiAgICAgICAgLy8gZG9tLmltcG9ydENzc1N0cmluZyhlZGl0b3JDc3MsIFwiYWNlX2VkaXRvclwiLCBjb250YWluZXIub3duZXJEb2N1bWVudCk7XG5cbiAgICAgICAgLy8gaW4gSUUgPD0gOSB0aGUgbmF0aXZlIGN1cnNvciBhbHdheXMgc2hpbmVzIHRocm91Z2hcbiAgICAgICAgdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSAhdXNlcmFnZW50LmlzT2xkSUU7XG5cbiAgICAgICAgZG9tLmFkZENzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBcImFjZV9lZGl0b3JcIik7XG5cbiAgICAgICAgdGhpcy5zZXRUaGVtZSh0aGVtZSk7XG5cbiAgICAgICAgdGhpcy4kZ3V0dGVyID0gZG9tLmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRoaXMuJGd1dHRlci5jbGFzc05hbWUgPSBcImFjZV9ndXR0ZXJcIjtcbiAgICAgICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy4kZ3V0dGVyKTtcblxuICAgICAgICB0aGlzLnNjcm9sbGVyID0gZG9tLmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRoaXMuc2Nyb2xsZXIuY2xhc3NOYW1lID0gXCJhY2Vfc2Nyb2xsZXJcIjtcbiAgICAgICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5zY3JvbGxlcik7XG5cbiAgICAgICAgdGhpcy5jb250ZW50ID0gPEhUTUxEaXZFbGVtZW50PmRvbS5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB0aGlzLmNvbnRlbnQuY2xhc3NOYW1lID0gXCJhY2VfY29udGVudFwiO1xuICAgICAgICB0aGlzLnNjcm9sbGVyLmFwcGVuZENoaWxkKHRoaXMuY29udGVudCk7XG5cbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIgPSBuZXcgZ3VtLkd1dHRlcih0aGlzLiRndXR0ZXIpO1xuICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5vbihcImNoYW5nZUd1dHRlcldpZHRoXCIsIHRoaXMub25HdXR0ZXJSZXNpemUuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy4kbWFya2VyQmFjayA9IG5ldyBtYW0uTWFya2VyKHRoaXMuY29udGVudCk7XG5cbiAgICAgICAgdmFyIHRleHRMYXllciA9IHRoaXMuJHRleHRMYXllciA9IG5ldyB0eG0uVGV4dCh0aGlzLmNvbnRlbnQpO1xuICAgICAgICB0aGlzLmNhbnZhcyA9IHRleHRMYXllci5lbGVtZW50O1xuXG4gICAgICAgIHRoaXMuJG1hcmtlckZyb250ID0gbmV3IG1hbS5NYXJrZXIodGhpcy5jb250ZW50KTtcblxuICAgICAgICB0aGlzLiRjdXJzb3JMYXllciA9IG5ldyBjc20uQ3Vyc29yKHRoaXMuY29udGVudCk7XG5cbiAgICAgICAgLy8gSW5kaWNhdGVzIHdoZXRoZXIgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyIGlzIHZpc2libGVcbiAgICAgICAgdGhpcy4kaG9yaXpTY3JvbGwgPSBmYWxzZTtcbiAgICAgICAgdGhpcy4kdlNjcm9sbCA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMuc2Nyb2xsQmFyViA9IG5ldyBzY3JvbGxiYXIuVlNjcm9sbEJhcih0aGlzLmNvbnRhaW5lciwgdGhpcyk7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFySCA9IG5ldyBzY3JvbGxiYXIuSFNjcm9sbEJhcih0aGlzLmNvbnRhaW5lciwgdGhpcyk7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5hZGRFdmVudExpc3RlbmVyKFwic2Nyb2xsXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIGlmICghX3NlbGYuJHNjcm9sbEFuaW1hdGlvbikge1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsVG9wKGUuZGF0YSAtIF9zZWxmLnNjcm9sbE1hcmdpbi50b3ApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJILmFkZEV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgaWYgKCFfc2VsZi4kc2Nyb2xsQW5pbWF0aW9uKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KGUuZGF0YSAtIF9zZWxmLnNjcm9sbE1hcmdpbi5sZWZ0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5jdXJzb3JQb3MgPSB7XG4gICAgICAgICAgICByb3c6IDAsXG4gICAgICAgICAgICBjb2x1bW46IDBcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLiRmb250TWV0cmljcyA9IG5ldyBmbW0uRm9udE1ldHJpY3ModGhpcy5jb250YWluZXIsIDUwMCk7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci4kc2V0Rm9udE1ldHJpY3ModGhpcy4kZm9udE1ldHJpY3MpO1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZUNoYXJhY3RlclNpemVcIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgX3NlbGYudXBkYXRlQ2hhcmFjdGVyU2l6ZSgpO1xuICAgICAgICAgICAgX3NlbGYub25SZXNpemUodHJ1ZSwgX3NlbGYuZ3V0dGVyV2lkdGgsIF9zZWxmLiRzaXplLndpZHRoLCBfc2VsZi4kc2l6ZS5oZWlnaHQpO1xuICAgICAgICAgICAgX3NlbGYuX3NpZ25hbChcImNoYW5nZUNoYXJhY3RlclNpemVcIiwgZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuJHNpemUgPSB7XG4gICAgICAgICAgICB3aWR0aDogMCxcbiAgICAgICAgICAgIGhlaWdodDogMCxcbiAgICAgICAgICAgIHNjcm9sbGVySGVpZ2h0OiAwLFxuICAgICAgICAgICAgc2Nyb2xsZXJXaWR0aDogMCxcbiAgICAgICAgICAgICRkaXJ0eTogdHJ1ZVxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuJGxvb3AgPSBuZXcgcmxtLlJlbmRlckxvb3AoXG4gICAgICAgICAgICB0aGlzLiRyZW5kZXJDaGFuZ2VzLmJpbmQodGhpcyksXG4gICAgICAgICAgICB0aGlzLmNvbnRhaW5lci5vd25lckRvY3VtZW50LmRlZmF1bHRWaWV3XG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuXG4gICAgICAgIHRoaXMudXBkYXRlQ2hhcmFjdGVyU2l6ZSgpO1xuICAgICAgICB0aGlzLnNldFBhZGRpbmcoNCk7XG4gICAgICAgIGNvbmZpZy5yZXNldE9wdGlvbnModGhpcyk7XG4gICAgICAgIGNvbmZpZy5fZW1pdChcInJlbmRlcmVyXCIsIHRoaXMpO1xuICAgIH1cblxuICAgIHNldCBtYXhMaW5lcyhtYXhMaW5lczogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuJG1heExpbmVzID0gbWF4TGluZXM7XG4gICAgfVxuXG4gICAgc2V0IGtlZXBUZXh0QXJlYUF0Q3Vyc29yKGtlZXBUZXh0QXJlYUF0Q3Vyc29yOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0ga2VlcFRleHRBcmVhQXRDdXJzb3I7XG4gICAgfVxuXG4gICAgc2V0RGVmYXVsdEN1cnNvclN0eWxlKCkge1xuICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUuY3Vyc29yID0gXCJkZWZhdWx0XCI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTm90IHN1cmUgd2hhdCB0aGUgY29ycmVjdCBzZW1hbnRpY3Mgc2hvdWxkIGJlIGZvciB0aGlzLlxuICAgICAqL1xuICAgIHNldEN1cnNvckxheWVyT2ZmKCkge1xuICAgICAgICB2YXIgbm9vcCA9IGZ1bmN0aW9uKCkgeyB9O1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5yZXN0YXJ0VGltZXIgPSBub29wO1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5lbGVtZW50LnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICB9XG5cbiAgICB1cGRhdGVDaGFyYWN0ZXJTaXplKCkge1xuICAgICAgICAvLyBGSVhNRTogREdIIGFsbG93Qm9sRm9udHMgZG9lcyBub3QgZXhpc3Qgb24gVGV4dFxuICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyWydhbGxvd0JvbGRGb250cyddICE9IHRoaXMuJGFsbG93Qm9sZEZvbnRzKSB7XG4gICAgICAgICAgICB0aGlzLiRhbGxvd0JvbGRGb250cyA9IHRoaXMuJHRleHRMYXllclsnYWxsb3dCb2xkRm9udHMnXTtcbiAgICAgICAgICAgIHRoaXMuc2V0U3R5bGUoXCJhY2Vfbm9ib2xkXCIsICF0aGlzLiRhbGxvd0JvbGRGb250cyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmxheWVyQ29uZmlnLmNoYXJhY3RlcldpZHRoID0gdGhpcy5jaGFyYWN0ZXJXaWR0aCA9IHRoaXMuJHRleHRMYXllci5nZXRDaGFyYWN0ZXJXaWR0aCgpO1xuICAgICAgICB0aGlzLmxheWVyQ29uZmlnLmxpbmVIZWlnaHQgPSB0aGlzLmxpbmVIZWlnaHQgPSB0aGlzLiR0ZXh0TGF5ZXIuZ2V0TGluZUhlaWdodCgpO1xuICAgICAgICB0aGlzLiR1cGRhdGVQcmludE1hcmdpbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIEFzc29jaWF0ZXMgdGhlIHJlbmRlcmVyIHdpdGggYW4gW1tFZGl0U2Vzc2lvbiBgRWRpdFNlc3Npb25gXV0uXG4gICAgKiovXG4gICAgc2V0U2Vzc2lvbihzZXNzaW9uKSB7XG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24pXG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uZG9jLm9mZihcImNoYW5nZU5ld0xpbmVNb2RlXCIsIHRoaXMub25DaGFuZ2VOZXdMaW5lTW9kZSk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uID0gc2Vzc2lvbjtcbiAgICAgICAgaWYgKCFzZXNzaW9uKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmICh0aGlzLnNjcm9sbE1hcmdpbi50b3AgJiYgc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSA8PSAwKVxuICAgICAgICAgICAgc2Vzc2lvbi5zZXRTY3JvbGxUb3AoLXRoaXMuc2Nyb2xsTWFyZ2luLnRvcCk7XG5cbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kbWFya2VyQmFjay5zZXRTZXNzaW9uKHNlc3Npb24pO1xuICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC5zZXRTZXNzaW9uKHNlc3Npb24pO1xuICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5zZXRTZXNzaW9uKHNlc3Npb24pO1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi4kc2V0Rm9udE1ldHJpY3ModGhpcy4kZm9udE1ldHJpY3MpO1xuXG4gICAgICAgIHRoaXMub25DaGFuZ2VOZXdMaW5lTW9kZSA9IHRoaXMub25DaGFuZ2VOZXdMaW5lTW9kZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUoKVxuICAgICAgICB0aGlzLnNlc3Npb24uZG9jLm9uKFwiY2hhbmdlTmV3TGluZU1vZGVcIiwgdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFRyaWdnZXJzIGEgcGFydGlhbCB1cGRhdGUgb2YgdGhlIHRleHQsIGZyb20gdGhlIHJhbmdlIGdpdmVuIGJ5IHRoZSB0d28gcGFyYW1ldGVycy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgZmlyc3Qgcm93IHRvIHVwZGF0ZVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGxhc3Qgcm93IHRvIHVwZGF0ZVxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgdXBkYXRlTGluZXMoZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyLCBmb3JjZT86IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKGxhc3RSb3cgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgbGFzdFJvdyA9IEluZmluaXR5O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLiRjaGFuZ2VkTGluZXMpIHtcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcyA9IHsgZmlyc3RSb3c6IGZpcnN0Um93LCBsYXN0Um93OiBsYXN0Um93IH07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kY2hhbmdlZExpbmVzLmZpcnN0Um93ID4gZmlyc3RSb3cpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRjaGFuZ2VkTGluZXMuZmlyc3RSb3cgPSBmaXJzdFJvdztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93IDwgbGFzdFJvdykge1xuICAgICAgICAgICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93ID0gbGFzdFJvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoZSBjaGFuZ2UgaGFwcGVuZWQgb2Zmc2NyZWVuIGFib3ZlIHVzIHRoZW4gaXQncyBwb3NzaWJsZVxuICAgICAgICAvLyB0aGF0IGEgbmV3IGxpbmUgd3JhcCB3aWxsIGFmZmVjdCB0aGUgcG9zaXRpb24gb2YgdGhlIGxpbmVzIG9uIG91clxuICAgICAgICAvLyBzY3JlZW4gc28gdGhleSBuZWVkIHJlZHJhd24uXG4gICAgICAgIC8vIFRPRE86IGJldHRlciBzb2x1dGlvbiBpcyB0byBub3QgY2hhbmdlIHNjcm9sbCBwb3NpdGlvbiB3aGVuIHRleHQgaXMgY2hhbmdlZCBvdXRzaWRlIG9mIHZpc2libGUgYXJlYVxuICAgICAgICBpZiAodGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3cgPCB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93KSB7XG4gICAgICAgICAgICBpZiAoZm9yY2UpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdyA9IHRoaXMubGF5ZXJDb25maWcubGFzdFJvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLiRjaGFuZ2VkTGluZXMuZmlyc3RSb3cgPiB0aGlzLmxheWVyQ29uZmlnLmxhc3RSb3cpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9MSU5FUyk7XG4gICAgfVxuXG4gICAgb25DaGFuZ2VOZXdMaW5lTW9kZSgpIHtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfVEVYVCk7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci4kdXBkYXRlRW9sQ2hhcigpO1xuICAgIH1cblxuICAgIG9uQ2hhbmdlVGFiU2l6ZSgpIHtcbiAgICAgICAgaWYgKHRoaXMuJGxvb3ApIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiRsb29wLnNjaGVkdWxlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfVEVYVCB8IENIQU5HRV9NQVJLRVIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllcikge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllci5vbkNoYW5nZVRhYlNpemUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIub25DaGFuZ2VUYWJTaXplKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBJJ20gbm90IHN1cmUgd2h5IHdlIGNhbiBub3cgZW5kIHVwIGhlcmUuXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFRyaWdnZXJzIGEgZnVsbCB1cGRhdGUgb2YgdGhlIHRleHQsIGZvciBhbGwgdGhlIHJvd3MuXG4gICAgKiovXG4gICAgdXBkYXRlVGV4dCgpIHtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfVEVYVCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBUcmlnZ2VycyBhIGZ1bGwgdXBkYXRlIG9mIGFsbCB0aGUgbGF5ZXJzLCBmb3IgYWxsIHRoZSByb3dzLlxuICAgICogQHBhcmFtIHtCb29sZWFufSBmb3JjZSBJZiBgdHJ1ZWAsIGZvcmNlcyB0aGUgY2hhbmdlcyB0aHJvdWdoXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICB1cGRhdGVGdWxsKGZvcmNlPykge1xuICAgICAgICBpZiAoZm9yY2UpXG4gICAgICAgICAgICB0aGlzLiRyZW5kZXJDaGFuZ2VzKENIQU5HRV9GVUxMLCB0cnVlKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogVXBkYXRlcyB0aGUgZm9udCBzaXplLlxuICAgICoqL1xuICAgIHVwZGF0ZUZvbnRTaXplKCkge1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuY2hlY2tGb3JTaXplQ2hhbmdlcygpO1xuICAgIH1cblxuICAgICR1cGRhdGVTaXplQXN5bmMoKSB7XG4gICAgICAgIGlmICh0aGlzLiRsb29wLnBlbmRpbmcpXG4gICAgICAgICAgICB0aGlzLiRzaXplLiRkaXJ0eSA9IHRydWU7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMub25SZXNpemUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFtUcmlnZ2VycyBhIHJlc2l6ZSBvZiB0aGUgZWRpdG9yLl17OiAjVmlydHVhbFJlbmRlcmVyLm9uUmVzaXplfVxuICAgICogQHBhcmFtIHtCb29sZWFufSBmb3JjZSBJZiBgdHJ1ZWAsIHJlY29tcHV0ZXMgdGhlIHNpemUsIGV2ZW4gaWYgdGhlIGhlaWdodCBhbmQgd2lkdGggaGF2ZW4ndCBjaGFuZ2VkXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZ3V0dGVyV2lkdGggVGhlIHdpZHRoIG9mIHRoZSBndXR0ZXIgaW4gcGl4ZWxzXG4gICAgKiBAcGFyYW0ge051bWJlcn0gd2lkdGggVGhlIHdpZHRoIG9mIHRoZSBlZGl0b3IgaW4gcGl4ZWxzXG4gICAgKiBAcGFyYW0ge051bWJlcn0gaGVpZ2h0IFRoZSBoaWVoZ3Qgb2YgdGhlIGVkaXRvciwgaW4gcGl4ZWxzXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBvblJlc2l6ZShmb3JjZT86IGJvb2xlYW4sIGd1dHRlcldpZHRoPzogbnVtYmVyLCB3aWR0aD86IG51bWJlciwgaGVpZ2h0PzogbnVtYmVyKSB7XG4gICAgICAgIGlmICh0aGlzLnJlc2l6aW5nID4gMilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgZWxzZSBpZiAodGhpcy5yZXNpemluZyA+IDApXG4gICAgICAgICAgICB0aGlzLnJlc2l6aW5nKys7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMucmVzaXppbmcgPSBmb3JjZSA/IDEgOiAwO1xuICAgICAgICAvLyBgfHwgZWwuc2Nyb2xsSGVpZ2h0YCBpcyByZXF1aXJlZCBmb3Igb3V0b3NpemluZyBlZGl0b3JzIG9uIGllXG4gICAgICAgIC8vIHdoZXJlIGVsZW1lbnRzIHdpdGggY2xpZW50SGVpZ2h0ID0gMCBhbHNvZSBoYXZlIGNsaWVudFdpZHRoID0gMFxuICAgICAgICB2YXIgZWwgPSB0aGlzLmNvbnRhaW5lcjtcbiAgICAgICAgaWYgKCFoZWlnaHQpXG4gICAgICAgICAgICBoZWlnaHQgPSBlbC5jbGllbnRIZWlnaHQgfHwgZWwuc2Nyb2xsSGVpZ2h0O1xuICAgICAgICBpZiAoIXdpZHRoKVxuICAgICAgICAgICAgd2lkdGggPSBlbC5jbGllbnRXaWR0aCB8fCBlbC5zY3JvbGxXaWR0aDtcbiAgICAgICAgdmFyIGNoYW5nZXMgPSB0aGlzLiR1cGRhdGVDYWNoZWRTaXplKGZvcmNlLCBndXR0ZXJXaWR0aCwgd2lkdGgsIGhlaWdodCk7XG5cblxuICAgICAgICBpZiAoIXRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgfHwgKCF3aWR0aCAmJiAhaGVpZ2h0KSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnJlc2l6aW5nID0gMDtcblxuICAgICAgICBpZiAoZm9yY2UpXG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci4kcGFkZGluZyA9IG51bGw7XG5cbiAgICAgICAgaWYgKGZvcmNlKVxuICAgICAgICAgICAgdGhpcy4kcmVuZGVyQ2hhbmdlcyhjaGFuZ2VzIHwgdGhpcy4kY2hhbmdlcywgdHJ1ZSk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoY2hhbmdlcyB8IHRoaXMuJGNoYW5nZXMpO1xuXG4gICAgICAgIGlmICh0aGlzLnJlc2l6aW5nKVxuICAgICAgICAgICAgdGhpcy5yZXNpemluZyA9IDA7XG4gICAgfVxuXG4gICAgJHVwZGF0ZUNhY2hlZFNpemUoZm9yY2UsIGd1dHRlcldpZHRoLCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgICAgIGhlaWdodCAtPSAodGhpcy4kZXh0cmFIZWlnaHQgfHwgMCk7XG4gICAgICAgIHZhciBjaGFuZ2VzID0gMDtcbiAgICAgICAgdmFyIHNpemUgPSB0aGlzLiRzaXplO1xuICAgICAgICB2YXIgb2xkU2l6ZSA9IHtcbiAgICAgICAgICAgIHdpZHRoOiBzaXplLndpZHRoLFxuICAgICAgICAgICAgaGVpZ2h0OiBzaXplLmhlaWdodCxcbiAgICAgICAgICAgIHNjcm9sbGVySGVpZ2h0OiBzaXplLnNjcm9sbGVySGVpZ2h0LFxuICAgICAgICAgICAgc2Nyb2xsZXJXaWR0aDogc2l6ZS5zY3JvbGxlcldpZHRoXG4gICAgICAgIH07XG4gICAgICAgIGlmIChoZWlnaHQgJiYgKGZvcmNlIHx8IHNpemUuaGVpZ2h0ICE9IGhlaWdodCkpIHtcbiAgICAgICAgICAgIHNpemUuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgICAgICAgICAgY2hhbmdlcyB8PSBDSEFOR0VfU0laRTtcblxuICAgICAgICAgICAgc2l6ZS5zY3JvbGxlckhlaWdodCA9IHNpemUuaGVpZ2h0O1xuICAgICAgICAgICAgaWYgKHRoaXMuJGhvcml6U2Nyb2xsKVxuICAgICAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJIZWlnaHQgLT0gdGhpcy5zY3JvbGxCYXJILmhlaWdodDtcblxuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJWLmVsZW1lbnQuc3R5bGUuYm90dG9tID0gdGhpcy5zY3JvbGxCYXJILmhlaWdodCArIFwicHhcIjtcblxuICAgICAgICAgICAgY2hhbmdlcyA9IGNoYW5nZXMgfCBDSEFOR0VfU0NST0xMO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHdpZHRoICYmIChmb3JjZSB8fCBzaXplLndpZHRoICE9IHdpZHRoKSkge1xuICAgICAgICAgICAgY2hhbmdlcyB8PSBDSEFOR0VfU0laRTtcbiAgICAgICAgICAgIHNpemUud2lkdGggPSB3aWR0aDtcblxuICAgICAgICAgICAgaWYgKGd1dHRlcldpZHRoID09IG51bGwpXG4gICAgICAgICAgICAgICAgZ3V0dGVyV2lkdGggPSB0aGlzLiRzaG93R3V0dGVyID8gdGhpcy4kZ3V0dGVyLm9mZnNldFdpZHRoIDogMDtcblxuICAgICAgICAgICAgdGhpcy5ndXR0ZXJXaWR0aCA9IGd1dHRlcldpZHRoO1xuXG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhckguZWxlbWVudC5zdHlsZS5sZWZ0ID1cbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbGVyLnN0eWxlLmxlZnQgPSBndXR0ZXJXaWR0aCArIFwicHhcIjtcbiAgICAgICAgICAgIHNpemUuc2Nyb2xsZXJXaWR0aCA9IE1hdGgubWF4KDAsIHdpZHRoIC0gZ3V0dGVyV2lkdGggLSB0aGlzLnNjcm9sbEJhclYud2lkdGgpO1xuXG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhckguZWxlbWVudC5zdHlsZS5yaWdodCA9XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxlci5zdHlsZS5yaWdodCA9IHRoaXMuc2Nyb2xsQmFyVi53aWR0aCArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsZXIuc3R5bGUuYm90dG9tID0gdGhpcy5zY3JvbGxCYXJILmhlaWdodCArIFwicHhcIjtcblxuICAgICAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbiAmJiB0aGlzLnNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKSAmJiB0aGlzLmFkanVzdFdyYXBMaW1pdCgpIHx8IGZvcmNlKVxuICAgICAgICAgICAgICAgIGNoYW5nZXMgfD0gQ0hBTkdFX0ZVTEw7XG4gICAgICAgIH1cblxuICAgICAgICBzaXplLiRkaXJ0eSA9ICF3aWR0aCB8fCAhaGVpZ2h0O1xuXG4gICAgICAgIGlmIChjaGFuZ2VzKVxuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwicmVzaXplXCIsIG9sZFNpemUpO1xuXG4gICAgICAgIHJldHVybiBjaGFuZ2VzO1xuICAgIH1cblxuICAgIG9uR3V0dGVyUmVzaXplKCkge1xuICAgICAgICB2YXIgZ3V0dGVyV2lkdGggPSB0aGlzLiRzaG93R3V0dGVyID8gdGhpcy4kZ3V0dGVyLm9mZnNldFdpZHRoIDogMDtcbiAgICAgICAgaWYgKGd1dHRlcldpZHRoICE9IHRoaXMuZ3V0dGVyV2lkdGgpXG4gICAgICAgICAgICB0aGlzLiRjaGFuZ2VzIHw9IHRoaXMuJHVwZGF0ZUNhY2hlZFNpemUodHJ1ZSwgZ3V0dGVyV2lkdGgsIHRoaXMuJHNpemUud2lkdGgsIHRoaXMuJHNpemUuaGVpZ2h0KTtcblxuICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmdldFVzZVdyYXBNb2RlKCkgJiYgdGhpcy5hZGp1c3RXcmFwTGltaXQoKSkge1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy4kc2l6ZS4kZGlydHkpIHtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kY29tcHV0ZUxheWVyQ29uZmlnKCk7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9NQVJLRVIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBBZGp1c3RzIHRoZSB3cmFwIGxpbWl0LCB3aGljaCBpcyB0aGUgbnVtYmVyIG9mIGNoYXJhY3RlcnMgdGhhdCBjYW4gZml0IHdpdGhpbiB0aGUgd2lkdGggb2YgdGhlIGVkaXQgYXJlYSBvbiBzY3JlZW4uXG4gICAgKiovXG4gICAgYWRqdXN0V3JhcExpbWl0KCkge1xuICAgICAgICB2YXIgYXZhaWxhYmxlV2lkdGggPSB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSB0aGlzLiRwYWRkaW5nICogMjtcbiAgICAgICAgdmFyIGxpbWl0ID0gTWF0aC5mbG9vcihhdmFpbGFibGVXaWR0aCAvIHRoaXMuY2hhcmFjdGVyV2lkdGgpO1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmFkanVzdFdyYXBMaW1pdChsaW1pdCwgdGhpcy4kc2hvd1ByaW50TWFyZ2luICYmIHRoaXMuJHByaW50TWFyZ2luQ29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBoYXZlIGFuIGFuaW1hdGVkIHNjcm9sbCBvciBub3QuXG4gICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3VsZEFuaW1hdGUgU2V0IHRvIGB0cnVlYCB0byBzaG93IGFuaW1hdGVkIHNjcm9sbHNcbiAgICAqXG4gICAgKiovXG4gICAgc2V0QW5pbWF0ZWRTY3JvbGwoc2hvdWxkQW5pbWF0ZSkge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImFuaW1hdGVkU2Nyb2xsXCIsIHNob3VsZEFuaW1hdGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB3aGV0aGVyIGFuIGFuaW1hdGVkIHNjcm9sbCBoYXBwZW5zIG9yIG5vdC5cbiAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICoqL1xuICAgIGdldEFuaW1hdGVkU2Nyb2xsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kYW5pbWF0ZWRTY3JvbGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgaW52aXNpYmxlIGNoYXJhY3RlcnMgb3Igbm90LlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvd0ludmlzaWJsZXMgU2V0IHRvIGB0cnVlYCB0byBzaG93IGludmlzaWJsZXNcbiAgICAgKi9cbiAgICBzZXRTaG93SW52aXNpYmxlcyhzaG93SW52aXNpYmxlczogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInNob3dJbnZpc2libGVzXCIsIHNob3dJbnZpc2libGVzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHdoZXRoZXIgaW52aXNpYmxlIGNoYXJhY3RlcnMgYXJlIGJlaW5nIHNob3duIG9yIG5vdC5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93SW52aXNpYmxlcygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwic2hvd0ludmlzaWJsZXNcIik7XG4gICAgfVxuXG4gICAgZ2V0RGlzcGxheUluZGVudEd1aWRlcygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiZGlzcGxheUluZGVudEd1aWRlc1wiKTtcbiAgICB9XG5cbiAgICBzZXREaXNwbGF5SW5kZW50R3VpZGVzKGRpc3BsYXlJbmRlbnRHdWlkZXM6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJkaXNwbGF5SW5kZW50R3VpZGVzXCIsIGRpc3BsYXlJbmRlbnRHdWlkZXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IHRoZSBwcmludCBtYXJnaW4gb3Igbm90LlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvd1ByaW50TWFyZ2luIFNldCB0byBgdHJ1ZWAgdG8gc2hvdyB0aGUgcHJpbnQgbWFyZ2luXG4gICAgICpcbiAgICAgKi9cbiAgICBzZXRTaG93UHJpbnRNYXJnaW4oc2hvd1ByaW50TWFyZ2luOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwic2hvd1ByaW50TWFyZ2luXCIsIHNob3dQcmludE1hcmdpbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB3aGV0aGVyIHRoZSBwcmludCBtYXJnaW4gaXMgYmVpbmcgc2hvd24gb3Igbm90LlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqL1xuICAgIGdldFNob3dQcmludE1hcmdpbigpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwic2hvd1ByaW50TWFyZ2luXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGNvbHVtbiBkZWZpbmluZyB3aGVyZSB0aGUgcHJpbnQgbWFyZ2luIHNob3VsZCBiZS5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcHJpbnRNYXJnaW5Db2x1bW4gU3BlY2lmaWVzIHRoZSBuZXcgcHJpbnQgbWFyZ2luXG4gICAgICovXG4gICAgc2V0UHJpbnRNYXJnaW5Db2x1bW4ocHJpbnRNYXJnaW5Db2x1bW46IG51bWJlcikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInByaW50TWFyZ2luQ29sdW1uXCIsIHByaW50TWFyZ2luQ29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjb2x1bW4gbnVtYmVyIG9mIHdoZXJlIHRoZSBwcmludCBtYXJnaW4gaXMuXG4gICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAgKi9cbiAgICBnZXRQcmludE1hcmdpbkNvbHVtbigpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJwcmludE1hcmdpbkNvbHVtblwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgZ3V0dGVyIGlzIGJlaW5nIHNob3duLlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqL1xuICAgIGdldFNob3dHdXR0ZXIoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInNob3dHdXR0ZXJcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyB0aGUgZ3V0dGVyIG9yIG5vdC5cbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvdyBTZXQgdG8gYHRydWVgIHRvIHNob3cgdGhlIGd1dHRlclxuICAgICpcbiAgICAqKi9cbiAgICBzZXRTaG93R3V0dGVyKHNob3cpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0T3B0aW9uKFwic2hvd0d1dHRlclwiLCBzaG93KTtcbiAgICB9XG5cbiAgICBnZXRGYWRlRm9sZFdpZGdldHMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImZhZGVGb2xkV2lkZ2V0c1wiKVxuICAgIH1cblxuICAgIHNldEZhZGVGb2xkV2lkZ2V0cyhzaG93KSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiZmFkZUZvbGRXaWRnZXRzXCIsIHNob3cpO1xuICAgIH1cblxuICAgIHNldEhpZ2hsaWdodEd1dHRlckxpbmUoc2hvdWxkSGlnaGxpZ2h0KSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiaGlnaGxpZ2h0R3V0dGVyTGluZVwiLCBzaG91bGRIaWdobGlnaHQpO1xuICAgIH1cblxuICAgIGdldEhpZ2hsaWdodEd1dHRlckxpbmUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImhpZ2hsaWdodEd1dHRlckxpbmVcIik7XG4gICAgfVxuXG4gICAgJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQoKSB7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLiRjdXJzb3JMYXllci4kcGl4ZWxQb3M7XG4gICAgICAgIHZhciBoZWlnaHQgPSB0aGlzLmxheWVyQ29uZmlnLmxpbmVIZWlnaHQ7XG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKSkge1xuICAgICAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuc2Vzc2lvbi5zZWxlY3Rpb24uZ2V0Q3Vyc29yKCk7XG4gICAgICAgICAgICBjdXJzb3IuY29sdW1uID0gMDtcbiAgICAgICAgICAgIHBvcyA9IHRoaXMuJGN1cnNvckxheWVyLmdldFBpeGVsUG9zaXRpb24oY3Vyc29yLCB0cnVlKTtcbiAgICAgICAgICAgIGhlaWdodCAqPSB0aGlzLnNlc3Npb24uZ2V0Um93TGVuZ3RoKGN1cnNvci5yb3cpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuc3R5bGUudG9wID0gcG9zLnRvcCAtIHRoaXMubGF5ZXJDb25maWcub2Zmc2V0ICsgXCJweFwiO1xuICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0LnN0eWxlLmhlaWdodCA9IGhlaWdodCArIFwicHhcIjtcbiAgICB9XG5cbiAgICAkdXBkYXRlUHJpbnRNYXJnaW4oKSB7XG4gICAgICAgIGlmICghdGhpcy4kc2hvd1ByaW50TWFyZ2luICYmICF0aGlzLiRwcmludE1hcmdpbkVsKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmICghdGhpcy4kcHJpbnRNYXJnaW5FbCkge1xuICAgICAgICAgICAgdmFyIGNvbnRhaW5lckVsOiBIVE1MRGl2RWxlbWVudCA9IDxIVE1MRGl2RWxlbWVudD5kb20uY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIGNvbnRhaW5lckVsLmNsYXNzTmFtZSA9IFwiYWNlX2xheWVyIGFjZV9wcmludC1tYXJnaW4tbGF5ZXJcIjtcbiAgICAgICAgICAgIHRoaXMuJHByaW50TWFyZ2luRWwgPSBkb20uY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIHRoaXMuJHByaW50TWFyZ2luRWwuY2xhc3NOYW1lID0gXCJhY2VfcHJpbnQtbWFyZ2luXCI7XG4gICAgICAgICAgICBjb250YWluZXJFbC5hcHBlbmRDaGlsZCh0aGlzLiRwcmludE1hcmdpbkVsKTtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5pbnNlcnRCZWZvcmUoY29udGFpbmVyRWwsIHRoaXMuY29udGVudC5maXJzdENoaWxkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzdHlsZSA9IHRoaXMuJHByaW50TWFyZ2luRWwuc3R5bGU7XG4gICAgICAgIHN0eWxlLmxlZnQgPSAoKHRoaXMuY2hhcmFjdGVyV2lkdGggKiB0aGlzLiRwcmludE1hcmdpbkNvbHVtbikgKyB0aGlzLiRwYWRkaW5nKSArIFwicHhcIjtcbiAgICAgICAgc3R5bGUudmlzaWJpbGl0eSA9IHRoaXMuJHNob3dQcmludE1hcmdpbiA/IFwidmlzaWJsZVwiIDogXCJoaWRkZW5cIjtcblxuICAgICAgICBpZiAodGhpcy5zZXNzaW9uICYmIHRoaXMuc2Vzc2lvblsnJHdyYXAnXSA9PSAtMSlcbiAgICAgICAgICAgIHRoaXMuYWRqdXN0V3JhcExpbWl0KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgcm9vdCBlbGVtZW50IGNvbnRhaW5pbmcgdGhpcyByZW5kZXJlci5cbiAgICAqIEByZXR1cm5zIHtET01FbGVtZW50fVxuICAgICoqL1xuICAgIGdldENvbnRhaW5lckVsZW1lbnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRhaW5lcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBlbGVtZW50IHRoYXQgdGhlIG1vdXNlIGV2ZW50cyBhcmUgYXR0YWNoZWQgdG9cbiAgICAqIEByZXR1cm5zIHtET01FbGVtZW50fVxuICAgICoqL1xuICAgIGdldE1vdXNlRXZlbnRUYXJnZXQoKTogSFRNTERpdkVsZW1lbnQge1xuICAgICAgICByZXR1cm4gdGhpcy5jb250ZW50O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGVsZW1lbnQgdG8gd2hpY2ggdGhlIGhpZGRlbiB0ZXh0IGFyZWEgaXMgYWRkZWQuXG4gICAgKiBAcmV0dXJucyB7RE9NRWxlbWVudH1cbiAgICAqKi9cbiAgICBnZXRUZXh0QXJlYUNvbnRhaW5lcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGFpbmVyO1xuICAgIH1cblxuICAgIC8vIG1vdmUgdGV4dCBpbnB1dCBvdmVyIHRoZSBjdXJzb3JcbiAgICAvLyB0aGlzIGlzIHJlcXVpcmVkIGZvciBpT1MgYW5kIElNRVxuICAgICRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvcilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIGNvbmZpZyA9IHRoaXMubGF5ZXJDb25maWc7XG4gICAgICAgIHZhciBwb3NUb3AgPSB0aGlzLiRjdXJzb3JMYXllci4kcGl4ZWxQb3MudG9wO1xuICAgICAgICB2YXIgcG9zTGVmdCA9IHRoaXMuJGN1cnNvckxheWVyLiRwaXhlbFBvcy5sZWZ0O1xuICAgICAgICBwb3NUb3AgLT0gY29uZmlnLm9mZnNldDtcblxuICAgICAgICB2YXIgaCA9IHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgaWYgKHBvc1RvcCA8IDAgfHwgcG9zVG9wID4gY29uZmlnLmhlaWdodCAtIGgpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHcgPSB0aGlzLmNoYXJhY3RlcldpZHRoO1xuICAgICAgICBpZiAodGhpcy4kY29tcG9zaXRpb24pIHtcbiAgICAgICAgICAgIHZhciB2YWwgPSB0aGlzLnRleHRhcmVhLnZhbHVlLnJlcGxhY2UoL15cXHgwMSsvLCBcIlwiKTtcbiAgICAgICAgICAgIHcgKj0gKHRoaXMuc2Vzc2lvbi4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgodmFsKVswXSArIDIpO1xuICAgICAgICAgICAgaCArPSAyO1xuICAgICAgICAgICAgcG9zVG9wIC09IDE7XG4gICAgICAgIH1cbiAgICAgICAgcG9zTGVmdCAtPSB0aGlzLnNjcm9sbExlZnQ7XG4gICAgICAgIGlmIChwb3NMZWZ0ID4gdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoIC0gdylcbiAgICAgICAgICAgIHBvc0xlZnQgPSB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSB3O1xuXG4gICAgICAgIHBvc0xlZnQgLT0gdGhpcy5zY3JvbGxCYXJWLndpZHRoO1xuXG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuaGVpZ2h0ID0gaCArIFwicHhcIjtcbiAgICAgICAgdGhpcy50ZXh0YXJlYS5zdHlsZS53aWR0aCA9IHcgKyBcInB4XCI7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUucmlnaHQgPSBNYXRoLm1heCgwLCB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSBwb3NMZWZ0IC0gdykgKyBcInB4XCI7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuYm90dG9tID0gTWF0aC5tYXgoMCwgdGhpcy4kc2l6ZS5oZWlnaHQgLSBwb3NUb3AgLSBoKSArIFwicHhcIjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBbUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGZpcnN0IHZpc2libGUgcm93Ll17OiAjVmlydHVhbFJlbmRlcmVyLmdldEZpcnN0VmlzaWJsZVJvd31cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0Rmlyc3RWaXNpYmxlUm93KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdztcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgZmlyc3QgZnVsbHkgdmlzaWJsZSByb3cuIFwiRnVsbHlcIiBoZXJlIG1lYW5zIHRoYXQgdGhlIGNoYXJhY3RlcnMgaW4gdGhlIHJvdyBhcmUgbm90IHRydW5jYXRlZDsgdGhhdCB0aGUgdG9wIGFuZCB0aGUgYm90dG9tIG9mIHRoZSByb3cgYXJlIG9uIHRoZSBzY3JlZW4uXG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldEZpcnN0RnVsbHlWaXNpYmxlUm93KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdyArICh0aGlzLmxheWVyQ29uZmlnLm9mZnNldCA9PT0gMCA/IDAgOiAxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbGFzdCBmdWxseSB2aXNpYmxlIHJvdy4gXCJGdWxseVwiIGhlcmUgbWVhbnMgdGhhdCB0aGUgY2hhcmFjdGVycyBpbiB0aGUgcm93IGFyZSBub3QgdHJ1bmNhdGVkOyB0aGF0IHRoZSB0b3AgYW5kIHRoZSBib3R0b20gb2YgdGhlIHJvdyBhcmUgb24gdGhlIHNjcmVlbi5cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0TGFzdEZ1bGx5VmlzaWJsZVJvdygpIHtcbiAgICAgICAgdmFyIGZsaW50ID0gTWF0aC5mbG9vcigodGhpcy5sYXllckNvbmZpZy5oZWlnaHQgKyB0aGlzLmxheWVyQ29uZmlnLm9mZnNldCkgLyB0aGlzLmxheWVyQ29uZmlnLmxpbmVIZWlnaHQpO1xuICAgICAgICByZXR1cm4gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdyAtIDEgKyBmbGludDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBbUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGxhc3QgdmlzaWJsZSByb3cuXXs6ICNWaXJ0dWFsUmVuZGVyZXIuZ2V0TGFzdFZpc2libGVSb3d9XG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldExhc3RWaXNpYmxlUm93KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sYXllckNvbmZpZy5sYXN0Um93O1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyB0aGUgcGFkZGluZyBmb3IgYWxsIHRoZSBsYXllcnMuXG4gICAgKiBAcGFyYW0ge251bWJlcn0gcGFkZGluZyBBIG5ldyBwYWRkaW5nIHZhbHVlIChpbiBwaXhlbHMpXG4gICAgKiovXG4gICAgc2V0UGFkZGluZyhwYWRkaW5nOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy4kcGFkZGluZyA9IHBhZGRpbmc7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0ZVTEwpO1xuICAgICAgICB0aGlzLiR1cGRhdGVQcmludE1hcmdpbigpO1xuICAgIH1cblxuICAgIHNldFNjcm9sbE1hcmdpbih0b3AsIGJvdHRvbSwgbGVmdCwgcmlnaHQpIHtcbiAgICAgICAgdmFyIHNtID0gdGhpcy5zY3JvbGxNYXJnaW47XG4gICAgICAgIHNtLnRvcCA9IHRvcCB8IDA7XG4gICAgICAgIHNtLmJvdHRvbSA9IGJvdHRvbSB8IDA7XG4gICAgICAgIHNtLnJpZ2h0ID0gcmlnaHQgfCAwO1xuICAgICAgICBzbS5sZWZ0ID0gbGVmdCB8IDA7XG4gICAgICAgIHNtLnYgPSBzbS50b3AgKyBzbS5ib3R0b207XG4gICAgICAgIHNtLmggPSBzbS5sZWZ0ICsgc20ucmlnaHQ7XG4gICAgICAgIGlmIChzbS50b3AgJiYgdGhpcy5zY3JvbGxUb3AgPD0gMCAmJiB0aGlzLnNlc3Npb24pXG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKC1zbS50b3ApO1xuICAgICAgICB0aGlzLnVwZGF0ZUZ1bGwoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyIGlzIHNldCB0byBiZSBhbHdheXMgdmlzaWJsZS5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgZ2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUoKSB7XG4gICAgICAgIC8vIEZJWE1FXG4gICAgICAgIHJldHVybiB0aGlzLiRoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIgb3Igbm90LlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYWx3YXlzVmlzaWJsZSBTZXQgdG8gYHRydWVgIHRvIG1ha2UgdGhlIGhvcml6b250YWwgc2Nyb2xsIGJhciB2aXNpYmxlXG4gICAgICoqL1xuICAgIHNldEhTY3JvbGxCYXJBbHdheXNWaXNpYmxlKGFsd2F5c1Zpc2libGUpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZVwiLCBhbHdheXNWaXNpYmxlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHZlcnRpY2FsIHNjcm9sbGJhciBpcyBzZXQgdG8gYmUgYWx3YXlzIHZpc2libGUuXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldFZTY3JvbGxCYXJBbHdheXNWaXNpYmxlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kdlNjcm9sbEJhckFsd2F5c1Zpc2libGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgdGhlIHZlcnRpY2FsIHNjcm9sbGJhciBvciBub3QuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbHdheXNWaXNpYmxlIFNldCB0byBgdHJ1ZWAgdG8gbWFrZSB0aGUgdmVydGljYWwgc2Nyb2xsIGJhciB2aXNpYmxlXG4gICAgICovXG4gICAgc2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUoYWx3YXlzVmlzaWJsZSkge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInZTY3JvbGxCYXJBbHdheXNWaXNpYmxlXCIsIGFsd2F5c1Zpc2libGUpO1xuICAgIH1cblxuICAgICR1cGRhdGVTY3JvbGxCYXJWKCkge1xuICAgICAgICB2YXIgc2Nyb2xsSGVpZ2h0ID0gdGhpcy5sYXllckNvbmZpZy5tYXhIZWlnaHQ7XG4gICAgICAgIHZhciBzY3JvbGxlckhlaWdodCA9IHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQ7XG4gICAgICAgIGlmICghdGhpcy4kbWF4TGluZXMgJiYgdGhpcy4kc2Nyb2xsUGFzdEVuZCkge1xuICAgICAgICAgICAgc2Nyb2xsSGVpZ2h0IC09IChzY3JvbGxlckhlaWdodCAtIHRoaXMubGluZUhlaWdodCkgKiB0aGlzLiRzY3JvbGxQYXN0RW5kO1xuICAgICAgICAgICAgaWYgKHRoaXMuc2Nyb2xsVG9wID4gc2Nyb2xsSGVpZ2h0IC0gc2Nyb2xsZXJIZWlnaHQpIHtcbiAgICAgICAgICAgICAgICBzY3JvbGxIZWlnaHQgPSB0aGlzLnNjcm9sbFRvcCArIHNjcm9sbGVySGVpZ2h0O1xuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zY3JvbGxUb3AgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zZXRTY3JvbGxIZWlnaHQoc2Nyb2xsSGVpZ2h0ICsgdGhpcy5zY3JvbGxNYXJnaW4udik7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zZXRTY3JvbGxUb3AodGhpcy5zY3JvbGxUb3AgKyB0aGlzLnNjcm9sbE1hcmdpbi50b3ApO1xuICAgIH1cblxuICAgICR1cGRhdGVTY3JvbGxCYXJIKCkge1xuICAgICAgICB0aGlzLnNjcm9sbEJhckguc2V0U2Nyb2xsV2lkdGgodGhpcy5sYXllckNvbmZpZy53aWR0aCArIDIgKiB0aGlzLiRwYWRkaW5nICsgdGhpcy5zY3JvbGxNYXJnaW4uaCk7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFySC5zZXRTY3JvbGxMZWZ0KHRoaXMuc2Nyb2xsTGVmdCArIHRoaXMuc2Nyb2xsTWFyZ2luLmxlZnQpO1xuICAgIH1cblxuICAgIGZyZWV6ZSgpIHtcbiAgICAgICAgdGhpcy4kZnJvemVuID0gdHJ1ZTtcbiAgICB9XG5cbiAgICB1bmZyZWV6ZSgpIHtcbiAgICAgICAgdGhpcy4kZnJvemVuID0gZmFsc2U7XG4gICAgfVxuXG4gICAgJHJlbmRlckNoYW5nZXMoY2hhbmdlcywgZm9yY2UpIHtcbiAgICAgICAgaWYgKHRoaXMuJGNoYW5nZXMpIHtcbiAgICAgICAgICAgIGNoYW5nZXMgfD0gdGhpcy4kY2hhbmdlcztcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZXMgPSAwO1xuICAgICAgICB9XG4gICAgICAgIGlmICgoIXRoaXMuc2Vzc2lvbiB8fCAhdGhpcy5jb250YWluZXIub2Zmc2V0V2lkdGggfHwgdGhpcy4kZnJvemVuKSB8fCAoIWNoYW5nZXMgJiYgIWZvcmNlKSkge1xuICAgICAgICAgICAgdGhpcy4kY2hhbmdlcyB8PSBjaGFuZ2VzO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLiRzaXplLiRkaXJ0eSkge1xuICAgICAgICAgICAgdGhpcy4kY2hhbmdlcyB8PSBjaGFuZ2VzO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMub25SZXNpemUodHJ1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLmxpbmVIZWlnaHQpIHtcbiAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci5jaGVja0ZvclNpemVDaGFuZ2VzKCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gdGhpcy4kbG9nQ2hhbmdlcyhjaGFuZ2VzKTtcblxuICAgICAgICB0aGlzLl9zaWduYWwoXCJiZWZvcmVSZW5kZXJcIik7XG4gICAgICAgIHZhciBjb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuICAgICAgICAvLyB0ZXh0LCBzY3JvbGxpbmcgYW5kIHJlc2l6ZSBjaGFuZ2VzIGNhbiBjYXVzZSB0aGUgdmlldyBwb3J0IHNpemUgdG8gY2hhbmdlXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0ZVTEwgfHxcbiAgICAgICAgICAgIGNoYW5nZXMgJiBDSEFOR0VfU0laRSB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9URVhUIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX0xJTkVTIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX1NDUk9MTCB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9IX1NDUk9MTFxuICAgICAgICApIHtcbiAgICAgICAgICAgIGNoYW5nZXMgfD0gdGhpcy4kY29tcHV0ZUxheWVyQ29uZmlnKCk7XG4gICAgICAgICAgICAvLyBJZiBhIGNoYW5nZSBpcyBtYWRlIG9mZnNjcmVlbiBhbmQgd3JhcE1vZGUgaXMgb24sIHRoZW4gdGhlIG9uc2NyZWVuXG4gICAgICAgICAgICAvLyBsaW5lcyBtYXkgaGF2ZSBiZWVuIHB1c2hlZCBkb3duLiBJZiBzbywgdGhlIGZpcnN0IHNjcmVlbiByb3cgd2lsbCBub3RcbiAgICAgICAgICAgIC8vIGhhdmUgY2hhbmdlZCwgYnV0IHRoZSBmaXJzdCBhY3R1YWwgcm93IHdpbGwuIEluIHRoYXQgY2FzZSwgYWRqdXN0IFxuICAgICAgICAgICAgLy8gc2Nyb2xsVG9wIHNvIHRoYXQgdGhlIGN1cnNvciBhbmQgb25zY3JlZW4gY29udGVudCBzdGF5cyBpbiB0aGUgc2FtZSBwbGFjZS5cbiAgICAgICAgICAgIGlmIChjb25maWcuZmlyc3RSb3cgIT0gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdyAmJiBjb25maWcuZmlyc3RSb3dTY3JlZW4gPT0gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvd1NjcmVlbikge1xuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsVG9wID0gdGhpcy5zY3JvbGxUb3AgKyAoY29uZmlnLmZpcnN0Um93IC0gdGhpcy5sYXllckNvbmZpZy5maXJzdFJvdykgKiB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgICAgICAgICAgY2hhbmdlcyA9IGNoYW5nZXMgfCBDSEFOR0VfU0NST0xMO1xuICAgICAgICAgICAgICAgIGNoYW5nZXMgfD0gdGhpcy4kY29tcHV0ZUxheWVyQ29uZmlnKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuICAgICAgICAgICAgLy8gdXBkYXRlIHNjcm9sbGJhciBmaXJzdCB0byBub3QgbG9zZSBzY3JvbGwgcG9zaXRpb24gd2hlbiBndXR0ZXIgY2FsbHMgcmVzaXplXG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVTY3JvbGxCYXJWKCk7XG4gICAgICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9IX1NDUk9MTClcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVTY3JvbGxCYXJIKCk7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5lbGVtZW50LnN0eWxlLm1hcmdpblRvcCA9ICgtY29uZmlnLm9mZnNldCkgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUubWFyZ2luVG9wID0gKC1jb25maWcub2Zmc2V0KSArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS53aWR0aCA9IGNvbmZpZy53aWR0aCArIDIgKiB0aGlzLiRwYWRkaW5nICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLmhlaWdodCA9IGNvbmZpZy5taW5IZWlnaHQgKyBcInB4XCI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBob3Jpem9udGFsIHNjcm9sbGluZ1xuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9IX1NDUk9MTCkge1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLm1hcmdpbkxlZnQgPSAtdGhpcy5zY3JvbGxMZWZ0ICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxlci5jbGFzc05hbWUgPSB0aGlzLnNjcm9sbExlZnQgPD0gMCA/IFwiYWNlX3Njcm9sbGVyXCIgOiBcImFjZV9zY3JvbGxlciBhY2Vfc2Nyb2xsLWxlZnRcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGZ1bGxcbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfRlVMTCkge1xuICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRjdXJzb3JMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgICAgICAgICB0aGlzLiRoaWdobGlnaHRHdXR0ZXJMaW5lICYmIHRoaXMuJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQoKTtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImFmdGVyUmVuZGVyXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gc2Nyb2xsaW5nXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX1NDUk9MTCkge1xuICAgICAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfVEVYVCB8fCBjaGFuZ2VzICYgQ0hBTkdFX0xJTkVTKVxuICAgICAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuc2Nyb2xsTGluZXMoY29uZmlnKTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRjdXJzb3JMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJGhpZ2hsaWdodEd1dHRlckxpbmUgJiYgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuICAgICAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImFmdGVyUmVuZGVyXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfVEVYVCkge1xuICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2hhbmdlcyAmIENIQU5HRV9MSU5FUykge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHVwZGF0ZUxpbmVzKCkgfHwgKGNoYW5nZXMgJiBDSEFOR0VfR1VUVEVSKSAmJiB0aGlzLiRzaG93R3V0dGVyKVxuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoYW5nZXMgJiBDSEFOR0VfVEVYVCB8fCBjaGFuZ2VzICYgQ0hBTkdFX0dVVFRFUikge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9DVVJTT1IpIHtcbiAgICAgICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICAgICAgICAgIHRoaXMuJGhpZ2hsaWdodEd1dHRlckxpbmUgJiYgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoYW5nZXMgJiAoQ0hBTkdFX01BUktFUiB8IENIQU5HRV9NQVJLRVJfRlJPTlQpKSB7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjaGFuZ2VzICYgKENIQU5HRV9NQVJLRVIgfCBDSEFOR0VfTUFSS0VSX0JBQ0spKSB7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiYWZ0ZXJSZW5kZXJcIik7XG4gICAgfVxuXG4gICAgJGF1dG9zaXplKCkge1xuICAgICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5zZXNzaW9uLmdldFNjcmVlbkxlbmd0aCgpICogdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgbWF4SGVpZ2h0ID0gdGhpcy4kbWF4TGluZXMgKiB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBkZXNpcmVkSGVpZ2h0ID0gTWF0aC5tYXgoXG4gICAgICAgICAgICAodGhpcy4kbWluTGluZXMgfHwgMSkgKiB0aGlzLmxpbmVIZWlnaHQsXG4gICAgICAgICAgICBNYXRoLm1pbihtYXhIZWlnaHQsIGhlaWdodClcbiAgICAgICAgKSArIHRoaXMuc2Nyb2xsTWFyZ2luLnYgKyAodGhpcy4kZXh0cmFIZWlnaHQgfHwgMCk7XG4gICAgICAgIHZhciB2U2Nyb2xsID0gaGVpZ2h0ID4gbWF4SGVpZ2h0O1xuXG4gICAgICAgIGlmIChkZXNpcmVkSGVpZ2h0ICE9IHRoaXMuZGVzaXJlZEhlaWdodCB8fFxuICAgICAgICAgICAgdGhpcy4kc2l6ZS5oZWlnaHQgIT0gdGhpcy5kZXNpcmVkSGVpZ2h0IHx8IHZTY3JvbGwgIT0gdGhpcy4kdlNjcm9sbCkge1xuICAgICAgICAgICAgaWYgKHZTY3JvbGwgIT0gdGhpcy4kdlNjcm9sbCkge1xuICAgICAgICAgICAgICAgIHRoaXMuJHZTY3JvbGwgPSB2U2Nyb2xsO1xuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFyVi5zZXRWaXNpYmxlKHZTY3JvbGwpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdyA9IHRoaXMuY29udGFpbmVyLmNsaWVudFdpZHRoO1xuICAgICAgICAgICAgdGhpcy5jb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gZGVzaXJlZEhlaWdodCArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZUNhY2hlZFNpemUodHJ1ZSwgdGhpcy4kZ3V0dGVyV2lkdGgsIHcsIGRlc2lyZWRIZWlnaHQpO1xuICAgICAgICAgICAgLy8gdGhpcy4kbG9vcC5jaGFuZ2VzID0gMDtcbiAgICAgICAgICAgIHRoaXMuZGVzaXJlZEhlaWdodCA9IGRlc2lyZWRIZWlnaHQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAkY29tcHV0ZUxheWVyQ29uZmlnKCkge1xuXG4gICAgICAgIGlmICh0aGlzLiRtYXhMaW5lcyAmJiB0aGlzLmxpbmVIZWlnaHQgPiAxKSB7XG4gICAgICAgICAgICB0aGlzLiRhdXRvc2l6ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciBzaXplID0gdGhpcy4kc2l6ZTtcblxuICAgICAgICB2YXIgaGlkZVNjcm9sbGJhcnMgPSBzaXplLmhlaWdodCA8PSAyICogdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICB2YXIgc2NyZWVuTGluZXMgPSB0aGlzLnNlc3Npb24uZ2V0U2NyZWVuTGVuZ3RoKCk7XG4gICAgICAgIHZhciBtYXhIZWlnaHQgPSBzY3JlZW5MaW5lcyAqIHRoaXMubGluZUhlaWdodDtcblxuICAgICAgICB2YXIgb2Zmc2V0ID0gdGhpcy5zY3JvbGxUb3AgJSB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBtaW5IZWlnaHQgPSBzaXplLnNjcm9sbGVySGVpZ2h0ICsgdGhpcy5saW5lSGVpZ2h0O1xuXG4gICAgICAgIHZhciBsb25nZXN0TGluZSA9IHRoaXMuJGdldExvbmdlc3RMaW5lKCk7XG5cbiAgICAgICAgdmFyIGhvcml6U2Nyb2xsID0gIWhpZGVTY3JvbGxiYXJzICYmICh0aGlzLiRoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSB8fFxuICAgICAgICAgICAgc2l6ZS5zY3JvbGxlcldpZHRoIC0gbG9uZ2VzdExpbmUgLSAyICogdGhpcy4kcGFkZGluZyA8IDApO1xuXG4gICAgICAgIHZhciBoU2Nyb2xsQ2hhbmdlZCA9IHRoaXMuJGhvcml6U2Nyb2xsICE9PSBob3JpelNjcm9sbDtcbiAgICAgICAgaWYgKGhTY3JvbGxDaGFuZ2VkKSB7XG4gICAgICAgICAgICB0aGlzLiRob3JpelNjcm9sbCA9IGhvcml6U2Nyb2xsO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJILnNldFZpc2libGUoaG9yaXpTY3JvbGwpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLiRtYXhMaW5lcyAmJiB0aGlzLiRzY3JvbGxQYXN0RW5kKSB7XG4gICAgICAgICAgICBtYXhIZWlnaHQgKz0gKHNpemUuc2Nyb2xsZXJIZWlnaHQgLSB0aGlzLmxpbmVIZWlnaHQpICogdGhpcy4kc2Nyb2xsUGFzdEVuZDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB2U2Nyb2xsID0gIWhpZGVTY3JvbGxiYXJzICYmICh0aGlzLiR2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSB8fFxuICAgICAgICAgICAgc2l6ZS5zY3JvbGxlckhlaWdodCAtIG1heEhlaWdodCA8IDApO1xuICAgICAgICB2YXIgdlNjcm9sbENoYW5nZWQgPSB0aGlzLiR2U2Nyb2xsICE9PSB2U2Nyb2xsO1xuICAgICAgICBpZiAodlNjcm9sbENoYW5nZWQpIHtcbiAgICAgICAgICAgIHRoaXMuJHZTY3JvbGwgPSB2U2Nyb2xsO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJWLnNldFZpc2libGUodlNjcm9sbCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKE1hdGgubWF4KC10aGlzLnNjcm9sbE1hcmdpbi50b3AsXG4gICAgICAgICAgICBNYXRoLm1pbih0aGlzLnNjcm9sbFRvcCwgbWF4SGVpZ2h0IC0gc2l6ZS5zY3JvbGxlckhlaWdodCArIHRoaXMuc2Nyb2xsTWFyZ2luLmJvdHRvbSkpKTtcblxuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdChNYXRoLm1heCgtdGhpcy5zY3JvbGxNYXJnaW4ubGVmdCwgTWF0aC5taW4odGhpcy5zY3JvbGxMZWZ0LFxuICAgICAgICAgICAgbG9uZ2VzdExpbmUgKyAyICogdGhpcy4kcGFkZGluZyAtIHNpemUuc2Nyb2xsZXJXaWR0aCArIHRoaXMuc2Nyb2xsTWFyZ2luLnJpZ2h0KSkpO1xuXG4gICAgICAgIHZhciBsaW5lQ291bnQgPSBNYXRoLmNlaWwobWluSGVpZ2h0IC8gdGhpcy5saW5lSGVpZ2h0KSAtIDE7XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IE1hdGgubWF4KDAsIE1hdGgucm91bmQoKHRoaXMuc2Nyb2xsVG9wIC0gb2Zmc2V0KSAvIHRoaXMubGluZUhlaWdodCkpO1xuICAgICAgICB2YXIgbGFzdFJvdyA9IGZpcnN0Um93ICsgbGluZUNvdW50O1xuXG4gICAgICAgIC8vIE1hcCBsaW5lcyBvbiB0aGUgc2NyZWVuIHRvIGxpbmVzIGluIHRoZSBkb2N1bWVudC5cbiAgICAgICAgdmFyIGZpcnN0Um93U2NyZWVuLCBmaXJzdFJvd0hlaWdodDtcbiAgICAgICAgdmFyIGxpbmVIZWlnaHQgPSB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIGZpcnN0Um93ID0gc2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50Um93KGZpcnN0Um93LCAwKTtcblxuICAgICAgICAvLyBDaGVjayBpZiBmaXJzdFJvdyBpcyBpbnNpZGUgb2YgYSBmb2xkTGluZS4gSWYgdHJ1ZSwgdGhlbiB1c2UgdGhlIGZpcnN0XG4gICAgICAgIC8vIHJvdyBvZiB0aGUgZm9sZExpbmUuXG4gICAgICAgIHZhciBmb2xkTGluZSA9IHNlc3Npb24uZ2V0Rm9sZExpbmUoZmlyc3RSb3cpO1xuICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgIGZpcnN0Um93ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICB9XG5cbiAgICAgICAgZmlyc3RSb3dTY3JlZW4gPSBzZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Sb3coZmlyc3RSb3csIDApO1xuICAgICAgICBmaXJzdFJvd0hlaWdodCA9IHNlc3Npb24uZ2V0Um93TGVuZ3RoKGZpcnN0Um93KSAqIGxpbmVIZWlnaHQ7XG5cbiAgICAgICAgbGFzdFJvdyA9IE1hdGgubWluKHNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFJvdyhsYXN0Um93LCAwKSwgc2Vzc2lvbi5nZXRMZW5ndGgoKSAtIDEpO1xuICAgICAgICBtaW5IZWlnaHQgPSBzaXplLnNjcm9sbGVySGVpZ2h0ICsgc2Vzc2lvbi5nZXRSb3dMZW5ndGgobGFzdFJvdykgKiBsaW5lSGVpZ2h0ICtcbiAgICAgICAgICAgIGZpcnN0Um93SGVpZ2h0O1xuXG4gICAgICAgIG9mZnNldCA9IHRoaXMuc2Nyb2xsVG9wIC0gZmlyc3RSb3dTY3JlZW4gKiBsaW5lSGVpZ2h0O1xuXG4gICAgICAgIHZhciBjaGFuZ2VzID0gMDtcbiAgICAgICAgaWYgKHRoaXMubGF5ZXJDb25maWcud2lkdGggIT0gbG9uZ2VzdExpbmUpXG4gICAgICAgICAgICBjaGFuZ2VzID0gQ0hBTkdFX0hfU0NST0xMO1xuICAgICAgICAvLyBIb3Jpem9udGFsIHNjcm9sbGJhciB2aXNpYmlsaXR5IG1heSBoYXZlIGNoYW5nZWQsIHdoaWNoIGNoYW5nZXNcbiAgICAgICAgLy8gdGhlIGNsaWVudCBoZWlnaHQgb2YgdGhlIHNjcm9sbGVyXG4gICAgICAgIGlmIChoU2Nyb2xsQ2hhbmdlZCB8fCB2U2Nyb2xsQ2hhbmdlZCkge1xuICAgICAgICAgICAgY2hhbmdlcyA9IHRoaXMuJHVwZGF0ZUNhY2hlZFNpemUodHJ1ZSwgdGhpcy5ndXR0ZXJXaWR0aCwgc2l6ZS53aWR0aCwgc2l6ZS5oZWlnaHQpO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwic2Nyb2xsYmFyVmlzaWJpbGl0eUNoYW5nZWRcIik7XG4gICAgICAgICAgICBpZiAodlNjcm9sbENoYW5nZWQpXG4gICAgICAgICAgICAgICAgbG9uZ2VzdExpbmUgPSB0aGlzLiRnZXRMb25nZXN0TGluZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5sYXllckNvbmZpZyA9IHtcbiAgICAgICAgICAgIHdpZHRoOiBsb25nZXN0TGluZSxcbiAgICAgICAgICAgIHBhZGRpbmc6IHRoaXMuJHBhZGRpbmcsXG4gICAgICAgICAgICBmaXJzdFJvdzogZmlyc3RSb3csXG4gICAgICAgICAgICBmaXJzdFJvd1NjcmVlbjogZmlyc3RSb3dTY3JlZW4sXG4gICAgICAgICAgICBsYXN0Um93OiBsYXN0Um93LFxuICAgICAgICAgICAgbGluZUhlaWdodDogbGluZUhlaWdodCxcbiAgICAgICAgICAgIGNoYXJhY3RlcldpZHRoOiB0aGlzLmNoYXJhY3RlcldpZHRoLFxuICAgICAgICAgICAgbWluSGVpZ2h0OiBtaW5IZWlnaHQsXG4gICAgICAgICAgICBtYXhIZWlnaHQ6IG1heEhlaWdodCxcbiAgICAgICAgICAgIG9mZnNldDogb2Zmc2V0LFxuICAgICAgICAgICAgZ3V0dGVyT2Zmc2V0OiBNYXRoLm1heCgwLCBNYXRoLmNlaWwoKG9mZnNldCArIHNpemUuaGVpZ2h0IC0gc2l6ZS5zY3JvbGxlckhlaWdodCkgLyBsaW5lSGVpZ2h0KSksXG4gICAgICAgICAgICBoZWlnaHQ6IHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHRcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gY2hhbmdlcztcbiAgICB9XG5cbiAgICAkdXBkYXRlTGluZXMoKSB7XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IHRoaXMuJGNoYW5nZWRMaW5lcy5maXJzdFJvdztcbiAgICAgICAgdmFyIGxhc3RSb3cgPSB0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdztcbiAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzID0gbnVsbDtcblxuICAgICAgICB2YXIgbGF5ZXJDb25maWcgPSB0aGlzLmxheWVyQ29uZmlnO1xuXG4gICAgICAgIGlmIChmaXJzdFJvdyA+IGxheWVyQ29uZmlnLmxhc3RSb3cgKyAxKSB7IHJldHVybjsgfVxuICAgICAgICBpZiAobGFzdFJvdyA8IGxheWVyQ29uZmlnLmZpcnN0Um93KSB7IHJldHVybjsgfVxuXG4gICAgICAgIC8vIGlmIHRoZSBsYXN0IHJvdyBpcyB1bmtub3duIC0+IHJlZHJhdyBldmVyeXRoaW5nXG4gICAgICAgIGlmIChsYXN0Um93ID09PSBJbmZpbml0eSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGxheWVyQ29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGUobGF5ZXJDb25maWcpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZWxzZSB1cGRhdGUgb25seSB0aGUgY2hhbmdlZCByb3dzXG4gICAgICAgIHRoaXMuJHRleHRMYXllci51cGRhdGVMaW5lcyhsYXllckNvbmZpZywgZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAkZ2V0TG9uZ2VzdExpbmUoKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGNoYXJDb3VudCA9IHRoaXMuc2Vzc2lvbi5nZXRTY3JlZW5XaWR0aCgpO1xuICAgICAgICBpZiAodGhpcy5zaG93SW52aXNpYmxlcyAmJiAhdGhpcy5zZXNzaW9uLiR1c2VXcmFwTW9kZSlcbiAgICAgICAgICAgIGNoYXJDb3VudCArPSAxO1xuXG4gICAgICAgIHJldHVybiBNYXRoLm1heCh0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSAyICogdGhpcy4kcGFkZGluZywgTWF0aC5yb3VuZChjaGFyQ291bnQgKiB0aGlzLmNoYXJhY3RlcldpZHRoKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogU2NoZWR1bGVzIGFuIHVwZGF0ZSB0byBhbGwgdGhlIGZyb250IG1hcmtlcnMgaW4gdGhlIGRvY3VtZW50LlxuICAgICoqL1xuICAgIHVwZGF0ZUZyb250TWFya2VycygpIHtcbiAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQuc2V0TWFya2Vycyh0aGlzLnNlc3Npb24uZ2V0TWFya2Vycyh0cnVlKSk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX01BUktFUl9GUk9OVCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogU2NoZWR1bGVzIGFuIHVwZGF0ZSB0byBhbGwgdGhlIGJhY2sgbWFya2VycyBpbiB0aGUgZG9jdW1lbnQuXG4gICAgKiovXG4gICAgdXBkYXRlQmFja01hcmtlcnMoKSB7XG4gICAgICAgIHRoaXMuJG1hcmtlckJhY2suc2V0TWFya2Vycyh0aGlzLnNlc3Npb24uZ2V0TWFya2VycyhmYWxzZSkpO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9NQVJLRVJfQkFDSyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogRGVwcmVjYXRlZDsgKG1vdmVkIHRvIFtbRWRpdFNlc3Npb25dXSlcbiAgICAqIEBkZXByZWNhdGVkXG4gICAgKiovXG4gICAgcHJpdmF0ZSBhZGRHdXR0ZXJEZWNvcmF0aW9uKHJvdywgY2xhc3NOYW1lKSB7XG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyLmFkZEd1dHRlckRlY29yYXRpb24ocm93LCBjbGFzc05hbWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogRGVwcmVjYXRlZDsgKG1vdmVkIHRvIFtbRWRpdFNlc3Npb25dXSlcbiAgICAqIEBkZXByZWNhdGVkXG4gICAgKiovXG4gICAgcHJpdmF0ZSByZW1vdmVHdXR0ZXJEZWNvcmF0aW9uKHJvdywgY2xhc3NOYW1lKSB7XG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnJlbW92ZUd1dHRlckRlY29yYXRpb24ocm93LCBjbGFzc05hbWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJlZHJhdyBicmVha3BvaW50cy5cbiAgICAqKi9cbiAgICB1cGRhdGVCcmVha3BvaW50cygpIHtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfR1VUVEVSKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBTZXRzIGFubm90YXRpb25zIGZvciB0aGUgZ3V0dGVyLlxuICAgICogQHBhcmFtIHtBcnJheX0gYW5ub3RhdGlvbnMgQW4gYXJyYXkgY29udGFpbmluZyBhbm5vdGF0aW9uc1xuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgc2V0QW5ub3RhdGlvbnMoYW5ub3RhdGlvbnMpIHtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0QW5ub3RhdGlvbnMoYW5ub3RhdGlvbnMpO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9HVVRURVIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFVwZGF0ZXMgdGhlIGN1cnNvciBpY29uLlxuICAgICoqL1xuICAgIHVwZGF0ZUN1cnNvcigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfQ1VSU09SKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBIaWRlcyB0aGUgY3Vyc29yIGljb24uXG4gICAgKiovXG4gICAgaGlkZUN1cnNvcigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIuaGlkZUN1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFNob3dzIHRoZSBjdXJzb3IgaWNvbi5cbiAgICAqKi9cbiAgICBzaG93Q3Vyc29yKCkge1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5zaG93Q3Vyc29yKCk7XG4gICAgfVxuXG4gICAgc2Nyb2xsU2VsZWN0aW9uSW50b1ZpZXcoYW5jaG9yLCBsZWFkLCBvZmZzZXQ/KSB7XG4gICAgICAgIC8vIGZpcnN0IHNjcm9sbCBhbmNob3IgaW50byB2aWV3IHRoZW4gc2Nyb2xsIGxlYWQgaW50byB2aWV3XG4gICAgICAgIHRoaXMuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcoYW5jaG9yLCBvZmZzZXQpO1xuICAgICAgICB0aGlzLnNjcm9sbEN1cnNvckludG9WaWV3KGxlYWQsIG9mZnNldCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogU2Nyb2xscyB0aGUgY3Vyc29yIGludG8gdGhlIGZpcnN0IHZpc2liaWxlIGFyZWEgb2YgdGhlIGVkaXRvclxuICAgICoqL1xuICAgIHNjcm9sbEN1cnNvckludG9WaWV3KGN1cnNvcj8sIG9mZnNldD8sICR2aWV3TWFyZ2luPykge1xuICAgICAgICAvLyB0aGUgZWRpdG9yIGlzIG5vdCB2aXNpYmxlXG4gICAgICAgIGlmICh0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0ID09PSAwKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBwb3MgPSB0aGlzLiRjdXJzb3JMYXllci5nZXRQaXhlbFBvc2l0aW9uKGN1cnNvcik7XG5cbiAgICAgICAgdmFyIGxlZnQgPSBwb3MubGVmdDtcbiAgICAgICAgdmFyIHRvcCA9IHBvcy50b3A7XG5cbiAgICAgICAgdmFyIHRvcE1hcmdpbiA9ICR2aWV3TWFyZ2luICYmICR2aWV3TWFyZ2luLnRvcCB8fCAwO1xuICAgICAgICB2YXIgYm90dG9tTWFyZ2luID0gJHZpZXdNYXJnaW4gJiYgJHZpZXdNYXJnaW4uYm90dG9tIHx8IDA7XG5cbiAgICAgICAgdmFyIHNjcm9sbFRvcCA9IHRoaXMuJHNjcm9sbEFuaW1hdGlvbiA/IHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSA6IHRoaXMuc2Nyb2xsVG9wO1xuXG4gICAgICAgIGlmIChzY3JvbGxUb3AgKyB0b3BNYXJnaW4gPiB0b3ApIHtcbiAgICAgICAgICAgIGlmIChvZmZzZXQpXG4gICAgICAgICAgICAgICAgdG9wIC09IG9mZnNldCAqIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQ7XG4gICAgICAgICAgICBpZiAodG9wID09PSAwKVxuICAgICAgICAgICAgICAgIHRvcCA9IC10aGlzLnNjcm9sbE1hcmdpbi50b3A7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHRvcCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoc2Nyb2xsVG9wICsgdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCAtIGJvdHRvbU1hcmdpbiA8IHRvcCArIHRoaXMubGluZUhlaWdodCkge1xuICAgICAgICAgICAgaWYgKG9mZnNldClcbiAgICAgICAgICAgICAgICB0b3AgKz0gb2Zmc2V0ICogdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodDtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AodG9wICsgdGhpcy5saW5lSGVpZ2h0IC0gdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc2Nyb2xsTGVmdCA9IHRoaXMuc2Nyb2xsTGVmdDtcblxuICAgICAgICBpZiAoc2Nyb2xsTGVmdCA+IGxlZnQpIHtcbiAgICAgICAgICAgIGlmIChsZWZ0IDwgdGhpcy4kcGFkZGluZyArIDIgKiB0aGlzLmxheWVyQ29uZmlnLmNoYXJhY3RlcldpZHRoKVxuICAgICAgICAgICAgICAgIGxlZnQgPSAtdGhpcy5zY3JvbGxNYXJnaW4ubGVmdDtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KGxlZnQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNjcm9sbExlZnQgKyB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggPCBsZWZ0ICsgdGhpcy5jaGFyYWN0ZXJXaWR0aCkge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQoTWF0aC5yb3VuZChsZWZ0ICsgdGhpcy5jaGFyYWN0ZXJXaWR0aCAtIHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCkpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNjcm9sbExlZnQgPD0gdGhpcy4kcGFkZGluZyAmJiBsZWZ0IC0gc2Nyb2xsTGVmdCA8IHRoaXMuY2hhcmFjdGVyV2lkdGgpIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KDApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiB7OkVkaXRTZXNzaW9uLmdldFNjcm9sbFRvcH1cbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmdldFNjcm9sbFRvcFxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxUb3AoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIHs6RWRpdFNlc3Npb24uZ2V0U2Nyb2xsTGVmdH1cbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmdldFNjcm9sbExlZnRcbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0U2Nyb2xsTGVmdCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFNjcm9sbExlZnQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBmaXJzdCB2aXNpYmxlIHJvdywgcmVnYXJkbGVzcyBvZiB3aGV0aGVyIGl0J3MgZnVsbHkgdmlzaWJsZSBvciBub3QuXG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldFNjcm9sbFRvcFJvdygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zY3JvbGxUb3AgLyB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgbGFzdCB2aXNpYmxlIHJvdywgcmVnYXJkbGVzcyBvZiB3aGV0aGVyIGl0J3MgZnVsbHkgdmlzaWJsZSBvciBub3QuXG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldFNjcm9sbEJvdHRvbVJvdygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gTWF0aC5tYXgoMCwgTWF0aC5mbG9vcigodGhpcy5zY3JvbGxUb3AgKyB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0KSAvIHRoaXMubGluZUhlaWdodCkgLSAxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEdyYWNlZnVsbHkgc2Nyb2xscyBmcm9tIHRoZSB0b3Agb2YgdGhlIGVkaXRvciB0byB0aGUgcm93IGluZGljYXRlZC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgQSByb3cgaWRcbiAgICAqXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uc2V0U2Nyb2xsVG9wXG4gICAgKiovXG4gICAgc2Nyb2xsVG9Sb3cocm93OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChyb3cgKiB0aGlzLmxpbmVIZWlnaHQpO1xuICAgIH1cblxuICAgIGFsaWduQ3Vyc29yKGN1cnNvciwgYWxpZ25tZW50KSB7XG4gICAgICAgIGlmICh0eXBlb2YgY3Vyc29yID09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICBjdXJzb3IgPSB7IHJvdzogY3Vyc29yLCBjb2x1bW46IDAgfTtcblxuICAgICAgICB2YXIgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuZ2V0UGl4ZWxQb3NpdGlvbihjdXJzb3IpO1xuICAgICAgICB2YXIgaCA9IHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgLSB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBvZmZzZXQgPSBwb3MudG9wIC0gaCAqIChhbGlnbm1lbnQgfHwgMCk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcChvZmZzZXQpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0O1xuICAgIH1cblxuICAgICRjYWxjU3RlcHMoZnJvbVZhbHVlOiBudW1iZXIsIHRvVmFsdWU6IG51bWJlcik6IG51bWJlcltdIHtcbiAgICAgICAgdmFyIGk6IG51bWJlciA9IDA7XG4gICAgICAgIHZhciBsOiBudW1iZXIgPSB0aGlzLlNURVBTO1xuICAgICAgICB2YXIgc3RlcHM6IG51bWJlcltdID0gW107XG5cbiAgICAgICAgdmFyIGZ1bmMgPSBmdW5jdGlvbih0OiBudW1iZXIsIHhfbWluOiBudW1iZXIsIGR4OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICAgICAgcmV0dXJuIGR4ICogKE1hdGgucG93KHQgLSAxLCAzKSArIDEpICsgeF9taW47XG4gICAgICAgIH07XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGw7ICsraSkge1xuICAgICAgICAgICAgc3RlcHMucHVzaChmdW5jKGkgLyB0aGlzLlNURVBTLCBmcm9tVmFsdWUsIHRvVmFsdWUgLSBmcm9tVmFsdWUpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzdGVwcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHcmFjZWZ1bGx5IHNjcm9sbHMgdGhlIGVkaXRvciB0byB0aGUgcm93IGluZGljYXRlZC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbGluZSBBIGxpbmUgbnVtYmVyXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBjZW50ZXIgSWYgYHRydWVgLCBjZW50ZXJzIHRoZSBlZGl0b3IgdGhlIHRvIGluZGljYXRlZCBsaW5lXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbmltYXRlIElmIGB0cnVlYCBhbmltYXRlcyBzY3JvbGxpbmdcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgYWZ0ZXIgdGhlIGFuaW1hdGlvbiBoYXMgZmluaXNoZWRcbiAgICAgKi9cbiAgICBzY3JvbGxUb0xpbmUobGluZTogbnVtYmVyLCBjZW50ZXI6IGJvb2xlYW4sIGFuaW1hdGU6IGJvb2xlYW4sIGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLiRjdXJzb3JMYXllci5nZXRQaXhlbFBvc2l0aW9uKHsgcm93OiBsaW5lLCBjb2x1bW46IDAgfSk7XG4gICAgICAgIHZhciBvZmZzZXQgPSBwb3MudG9wO1xuICAgICAgICBpZiAoY2VudGVyKSB7XG4gICAgICAgICAgICBvZmZzZXQgLT0gdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCAvIDI7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaW5pdGlhbFNjcm9sbCA9IHRoaXMuc2Nyb2xsVG9wO1xuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKG9mZnNldCk7XG4gICAgICAgIGlmIChhbmltYXRlICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5hbmltYXRlU2Nyb2xsaW5nKGluaXRpYWxTY3JvbGwsIGNhbGxiYWNrKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFuaW1hdGVTY3JvbGxpbmcoZnJvbVZhbHVlOiBudW1iZXIsIGNhbGxiYWNrPykge1xuICAgICAgICB2YXIgdG9WYWx1ZSA9IHRoaXMuc2Nyb2xsVG9wO1xuICAgICAgICBpZiAoIXRoaXMuJGFuaW1hdGVkU2Nyb2xsKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcblxuICAgICAgICBpZiAoZnJvbVZhbHVlID09IHRvVmFsdWUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKHRoaXMuJHNjcm9sbEFuaW1hdGlvbikge1xuICAgICAgICAgICAgdmFyIG9sZFN0ZXBzID0gdGhpcy4kc2Nyb2xsQW5pbWF0aW9uLnN0ZXBzO1xuICAgICAgICAgICAgaWYgKG9sZFN0ZXBzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGZyb21WYWx1ZSA9IG9sZFN0ZXBzWzBdO1xuICAgICAgICAgICAgICAgIGlmIChmcm9tVmFsdWUgPT0gdG9WYWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHN0ZXBzID0gX3NlbGYuJGNhbGNTdGVwcyhmcm9tVmFsdWUsIHRvVmFsdWUpO1xuICAgICAgICB0aGlzLiRzY3JvbGxBbmltYXRpb24gPSB7IGZyb206IGZyb21WYWx1ZSwgdG86IHRvVmFsdWUsIHN0ZXBzOiBzdGVwcyB9O1xuXG4gICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy4kdGltZXIpO1xuXG4gICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHN0ZXBzLnNoaWZ0KCkpO1xuICAgICAgICAvLyB0cmljayBzZXNzaW9uIHRvIHRoaW5rIGl0J3MgYWxyZWFkeSBzY3JvbGxlZCB0byBub3QgbG9vc2UgdG9WYWx1ZVxuICAgICAgICBfc2VsZi5zZXNzaW9uLiRzY3JvbGxUb3AgPSB0b1ZhbHVlO1xuICAgICAgICB0aGlzLiR0aW1lciA9IHNldEludGVydmFsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHN0ZXBzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHN0ZXBzLnNoaWZ0KCkpO1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uJHNjcm9sbFRvcCA9IHRvVmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRvVmFsdWUgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uJHNjcm9sbFRvcCA9IC0xO1xuICAgICAgICAgICAgICAgIF9zZWxmLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHRvVmFsdWUpO1xuICAgICAgICAgICAgICAgIHRvVmFsdWUgPSBudWxsO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBkbyB0aGlzIG9uIHNlcGFyYXRlIHN0ZXAgdG8gbm90IGdldCBzcHVyaW91cyBzY3JvbGwgZXZlbnQgZnJvbSBzY3JvbGxiYXJcbiAgICAgICAgICAgICAgICBfc2VsZi4kdGltZXIgPSBjbGVhckludGVydmFsKF9zZWxmLiR0aW1lcik7XG4gICAgICAgICAgICAgICAgX3NlbGYuJHNjcm9sbEFuaW1hdGlvbiA9IG51bGw7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sgJiYgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgMTApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdGhlIGVkaXRvciB0byB0aGUgeSBwaXhlbCBpbmRpY2F0ZWQuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHNjcm9sbFRvcCBUaGUgcG9zaXRpb24gdG8gc2Nyb2xsIHRvXG4gICAgICovXG4gICAgc2Nyb2xsVG9ZKHNjcm9sbFRvcDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIC8vIGFmdGVyIGNhbGxpbmcgc2Nyb2xsQmFyLnNldFNjcm9sbFRvcFxuICAgICAgICAvLyBzY3JvbGxiYXIgc2VuZHMgdXMgZXZlbnQgd2l0aCBzYW1lIHNjcm9sbFRvcC4gaWdub3JlIGl0XG4gICAgICAgIGlmICh0aGlzLnNjcm9sbFRvcCAhPT0gc2Nyb2xsVG9wKSB7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX1NDUk9MTCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRoZSBlZGl0b3IgYWNyb3NzIHRoZSB4LWF4aXMgdG8gdGhlIHBpeGVsIGluZGljYXRlZC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc2Nyb2xsTGVmdCBUaGUgcG9zaXRpb24gdG8gc2Nyb2xsIHRvXG4gICAgICoqL1xuICAgIHNjcm9sbFRvWChzY3JvbGxMZWZ0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuc2Nyb2xsTGVmdCAhPT0gc2Nyb2xsTGVmdCkge1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxMZWZ0ID0gc2Nyb2xsTGVmdDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0hfU0NST0xMKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogU2Nyb2xscyB0aGUgZWRpdG9yIGFjcm9zcyBib3RoIHgtIGFuZCB5LWF4ZXMuXG4gICAgKiBAcGFyYW0ge051bWJlcn0geCBUaGUgeCB2YWx1ZSB0byBzY3JvbGwgdG9cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSB5IFRoZSB5IHZhbHVlIHRvIHNjcm9sbCB0b1xuICAgICoqL1xuICAgIHNjcm9sbFRvKHg6IG51bWJlciwgeTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AoeSk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KHkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2Nyb2xscyB0aGUgZWRpdG9yIGFjcm9zcyBib3RoIHgtIGFuZCB5LWF4ZXMuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZGVsdGFYIFRoZSB4IHZhbHVlIHRvIHNjcm9sbCBieVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlbHRhWSBUaGUgeSB2YWx1ZSB0byBzY3JvbGwgYnlcbiAgICAqKi9cbiAgICBzY3JvbGxCeShkZWx0YVg6IG51bWJlciwgZGVsdGFZOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgZGVsdGFZICYmIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AodGhpcy5zZXNzaW9uLmdldFNjcm9sbFRvcCgpICsgZGVsdGFZKTtcbiAgICAgICAgZGVsdGFYICYmIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxMZWZ0KCkgKyBkZWx0YVgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgeW91IGNhbiBzdGlsbCBzY3JvbGwgYnkgZWl0aGVyIHBhcmFtZXRlcjsgaW4gb3RoZXIgd29yZHMsIHlvdSBoYXZlbid0IHJlYWNoZWQgdGhlIGVuZCBvZiB0aGUgZmlsZSBvciBsaW5lLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlbHRhWCBUaGUgeCB2YWx1ZSB0byBzY3JvbGwgYnlcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkZWx0YVkgVGhlIHkgdmFsdWUgdG8gc2Nyb2xsIGJ5XG4gICAgKlxuICAgICpcbiAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICoqL1xuICAgIGlzU2Nyb2xsYWJsZUJ5KGRlbHRhWDogbnVtYmVyLCBkZWx0YVk6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgICAgICBpZiAoZGVsdGFZIDwgMCAmJiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgPj0gMSAtIHRoaXMuc2Nyb2xsTWFyZ2luLnRvcClcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBpZiAoZGVsdGFZID4gMCAmJiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgKyB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0XG4gICAgICAgICAgICAtIHRoaXMubGF5ZXJDb25maWcubWF4SGVpZ2h0IDwgLTEgKyB0aGlzLnNjcm9sbE1hcmdpbi5ib3R0b20pXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgaWYgKGRlbHRhWCA8IDAgJiYgdGhpcy5zZXNzaW9uLmdldFNjcm9sbExlZnQoKSA+PSAxIC0gdGhpcy5zY3JvbGxNYXJnaW4ubGVmdClcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBpZiAoZGVsdGFYID4gMCAmJiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpICsgdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoXG4gICAgICAgICAgICAtIHRoaXMubGF5ZXJDb25maWcud2lkdGggPCAtMSArIHRoaXMuc2Nyb2xsTWFyZ2luLnJpZ2h0KVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcGl4ZWxUb1NjcmVlbkNvb3JkaW5hdGVzKHg6IG51bWJlciwgeTogbnVtYmVyKSB7XG4gICAgICAgIHZhciBjYW52YXNQb3MgPSB0aGlzLnNjcm9sbGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG4gICAgICAgIHZhciBvZmZzZXQgPSAoeCArIHRoaXMuc2Nyb2xsTGVmdCAtIGNhbnZhc1Bvcy5sZWZ0IC0gdGhpcy4kcGFkZGluZykgLyB0aGlzLmNoYXJhY3RlcldpZHRoO1xuICAgICAgICB2YXIgcm93ID0gTWF0aC5mbG9vcigoeSArIHRoaXMuc2Nyb2xsVG9wIC0gY2FudmFzUG9zLnRvcCkgLyB0aGlzLmxpbmVIZWlnaHQpO1xuICAgICAgICB2YXIgY29sID0gTWF0aC5yb3VuZChvZmZzZXQpO1xuXG4gICAgICAgIHJldHVybiB7IHJvdzogcm93LCBjb2x1bW46IGNvbCwgc2lkZTogb2Zmc2V0IC0gY29sID4gMCA/IDEgOiAtMSB9O1xuICAgIH1cblxuICAgIHNjcmVlblRvVGV4dENvb3JkaW5hdGVzKGNsaWVudFg6IG51bWJlciwgY2xpZW50WTogbnVtYmVyKSB7XG4gICAgICAgIHZhciBjYW52YXNQb3MgPSB0aGlzLnNjcm9sbGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG4gICAgICAgIHZhciBjb2x1bW4gPSBNYXRoLnJvdW5kKChjbGllbnRYICsgdGhpcy5zY3JvbGxMZWZ0IC0gY2FudmFzUG9zLmxlZnQgLSB0aGlzLiRwYWRkaW5nKSAvIHRoaXMuY2hhcmFjdGVyV2lkdGgpO1xuXG4gICAgICAgIHZhciByb3cgPSAoY2xpZW50WSArIHRoaXMuc2Nyb2xsVG9wIC0gY2FudmFzUG9zLnRvcCkgLyB0aGlzLmxpbmVIZWlnaHQ7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24ocm93LCBNYXRoLm1heChjb2x1bW4sIDApKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGBwYWdlWGAgYW5kIGBwYWdlWWAgY29vcmRpbmF0ZXMgb2YgdGhlIGRvY3VtZW50IHBvc2l0aW9uLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgZG9jdW1lbnQgcm93IHBvc2l0aW9uXG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBkb2N1bWVudCBjb2x1bW4gcG9zaXRpb25cbiAgICAqIEByZXR1cm5zIHtPYmplY3R9XG4gICAgKiovXG4gICAgdGV4dFRvU2NyZWVuQ29vcmRpbmF0ZXMocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogeyBwYWdlWDogbnVtYmVyOyBwYWdlWTogbnVtYmVyIH0ge1xuICAgICAgICB2YXIgY2FudmFzUG9zID0gdGhpcy5zY3JvbGxlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24ocm93LCBjb2x1bW4pO1xuXG4gICAgICAgIHZhciB4ID0gdGhpcy4kcGFkZGluZyArIE1hdGgucm91bmQocG9zLmNvbHVtbiAqIHRoaXMuY2hhcmFjdGVyV2lkdGgpO1xuICAgICAgICB2YXIgeSA9IHBvcy5yb3cgKiB0aGlzLmxpbmVIZWlnaHQ7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHBhZ2VYOiBjYW52YXNQb3MubGVmdCArIHggLSB0aGlzLnNjcm9sbExlZnQsXG4gICAgICAgICAgICBwYWdlWTogY2FudmFzUG9zLnRvcCArIHkgLSB0aGlzLnNjcm9sbFRvcFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIEZvY3VzZXMgdGhlIGN1cnJlbnQgY29udGFpbmVyLlxuICAgICoqL1xuICAgIHZpc3VhbGl6ZUZvY3VzKCkge1xuICAgICAgICBkb20uYWRkQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIFwiYWNlX2ZvY3VzXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIEJsdXJzIHRoZSBjdXJyZW50IGNvbnRhaW5lci5cbiAgICAqKi9cbiAgICB2aXN1YWxpemVCbHVyKCkge1xuICAgICAgICBkb20ucmVtb3ZlQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIFwiYWNlX2ZvY3VzXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgc2hvd0NvbXBvc2l0aW9uXG4gICAgICogQHBhcmFtIHBvc2l0aW9uXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBzaG93Q29tcG9zaXRpb24ocG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0pIHtcbiAgICAgICAgaWYgKCF0aGlzLiRjb21wb3NpdGlvbilcbiAgICAgICAgICAgIHRoaXMuJGNvbXBvc2l0aW9uID0ge1xuICAgICAgICAgICAgICAgIGtlZXBUZXh0QXJlYUF0Q3Vyc29yOiB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvcixcbiAgICAgICAgICAgICAgICBjc3NUZXh0OiB0aGlzLnRleHRhcmVhLnN0eWxlLmNzc1RleHRcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSB0cnVlO1xuICAgICAgICBkb20uYWRkQ3NzQ2xhc3ModGhpcy50ZXh0YXJlYSwgXCJhY2VfY29tcG9zaXRpb25cIik7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuY3NzVGV4dCA9IFwiXCI7XG4gICAgICAgIHRoaXMuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgQSBzdHJpbmcgb2YgdGV4dCB0byB1c2VcbiAgICAgKlxuICAgICAqIFNldHMgdGhlIGlubmVyIHRleHQgb2YgdGhlIGN1cnJlbnQgY29tcG9zaXRpb24gdG8gYHRleHRgLlxuICAgICAqL1xuICAgIHNldENvbXBvc2l0aW9uVGV4dCh0ZXh0Pzogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIC8vIFRPRE86IFdoeSBpcyB0aGUgcGFyYW1ldGVyIG5vdCB1c2VkP1xuICAgICAgICB0aGlzLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEhpZGVzIHRoZSBjdXJyZW50IGNvbXBvc2l0aW9uLlxuICAgICAqL1xuICAgIGhpZGVDb21wb3NpdGlvbigpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRjb21wb3NpdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgZG9tLnJlbW92ZUNzc0NsYXNzKHRoaXMudGV4dGFyZWEsIFwiYWNlX2NvbXBvc2l0aW9uXCIpO1xuICAgICAgICB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IHRoaXMuJGNvbXBvc2l0aW9uLmtlZXBUZXh0QXJlYUF0Q3Vyc29yO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLmNzc1RleHQgPSB0aGlzLiRjb21wb3NpdGlvbi5jc3NUZXh0O1xuICAgICAgICB0aGlzLiRjb21wb3NpdGlvbiA9IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogW1NldHMgYSBuZXcgdGhlbWUgZm9yIHRoZSBlZGl0b3IuIGB0aGVtZWAgc2hvdWxkIGV4aXN0LCBhbmQgYmUgYSBkaXJlY3RvcnkgcGF0aCwgbGlrZSBgYWNlL3RoZW1lL3RleHRtYXRlYC5dezogI1ZpcnR1YWxSZW5kZXJlci5zZXRUaGVtZX1cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGhlbWUgVGhlIHBhdGggdG8gYSB0aGVtZVxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNiIG9wdGlvbmFsIGNhbGxiYWNrXG4gICAgICovXG4gICAgc2V0VGhlbWUodGhlbWU6IHN0cmluZywgY2I/OiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuJHRoZW1lSWQgPSB0aGVtZTtcbiAgICAgICAgX3NlbGYuX2Rpc3BhdGNoRXZlbnQoJ3RoZW1lQ2hhbmdlJywgeyB0aGVtZTogdGhlbWUgfSk7XG5cbiAgICAgICAgaWYgKCF0aGVtZSB8fCB0eXBlb2YgdGhlbWUgPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgdmFyIG1vZHVsZU5hbWUgPSB0aGVtZSB8fCB0aGlzLiRvcHRpb25zLnRoZW1lLmluaXRpYWxWYWx1ZTtcbiAgICAgICAgICAgIGNvbmZpZy5sb2FkTW9kdWxlKFtcInRoZW1lXCIsIG1vZHVsZU5hbWVdLCBhZnRlckxvYWQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgYWZ0ZXJMb2FkKHRoZW1lKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGFmdGVyTG9hZChtb2R1bGUpIHtcbiAgICAgICAgICAgIGlmIChfc2VsZi4kdGhlbWVJZCAhPSB0aGVtZSlcbiAgICAgICAgICAgICAgICByZXR1cm4gY2IgJiYgY2IoKTtcbiAgICAgICAgICAgIGlmICghbW9kdWxlLmNzc0NsYXNzKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGRvbS5pbXBvcnRDc3NTdHJpbmcoXG4gICAgICAgICAgICAgICAgbW9kdWxlLmNzc1RleHQsXG4gICAgICAgICAgICAgICAgbW9kdWxlLmNzc0NsYXNzLFxuICAgICAgICAgICAgICAgIF9zZWxmLmNvbnRhaW5lci5vd25lckRvY3VtZW50XG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBpZiAoX3NlbGYudGhlbWUpXG4gICAgICAgICAgICAgICAgZG9tLnJlbW92ZUNzc0NsYXNzKF9zZWxmLmNvbnRhaW5lciwgX3NlbGYudGhlbWUuY3NzQ2xhc3MpO1xuXG4gICAgICAgICAgICB2YXIgcGFkZGluZyA9IFwicGFkZGluZ1wiIGluIG1vZHVsZSA/IG1vZHVsZS5wYWRkaW5nIDogXCJwYWRkaW5nXCIgaW4gKF9zZWxmLnRoZW1lIHx8IHt9KSA/IDQgOiBfc2VsZi4kcGFkZGluZztcblxuICAgICAgICAgICAgaWYgKF9zZWxmLiRwYWRkaW5nICYmIHBhZGRpbmcgIT0gX3NlbGYuJHBhZGRpbmcpIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXRQYWRkaW5nKHBhZGRpbmcpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB0aGlzIGlzIGtlcHQgb25seSBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcbiAgICAgICAgICAgIF9zZWxmLiR0aGVtZSA9IG1vZHVsZS5jc3NDbGFzcztcblxuICAgICAgICAgICAgX3NlbGYudGhlbWUgPSBtb2R1bGU7XG4gICAgICAgICAgICBkb20uYWRkQ3NzQ2xhc3MoX3NlbGYuY29udGFpbmVyLCBtb2R1bGUuY3NzQ2xhc3MpO1xuICAgICAgICAgICAgZG9tLnNldENzc0NsYXNzKF9zZWxmLmNvbnRhaW5lciwgXCJhY2VfZGFya1wiLCBtb2R1bGUuaXNEYXJrKTtcblxuICAgICAgICAgICAgLy8gZm9yY2UgcmUtbWVhc3VyZSBvZiB0aGUgZ3V0dGVyIHdpZHRoXG4gICAgICAgICAgICBpZiAoX3NlbGYuJHNpemUpIHtcbiAgICAgICAgICAgICAgICBfc2VsZi4kc2l6ZS53aWR0aCA9IDA7XG4gICAgICAgICAgICAgICAgX3NlbGYuJHVwZGF0ZVNpemVBc3luYygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBfc2VsZi5fZGlzcGF0Y2hFdmVudCgndGhlbWVMb2FkZWQnLCB7IHRoZW1lOiBtb2R1bGUgfSk7XG4gICAgICAgICAgICBjYiAmJiBjYigpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogW1JldHVybnMgdGhlIHBhdGggb2YgdGhlIGN1cnJlbnQgdGhlbWUuXXs6ICNWaXJ0dWFsUmVuZGVyZXIuZ2V0VGhlbWV9XG4gICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAgKi9cbiAgICBnZXRUaGVtZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy4kdGhlbWVJZDtcbiAgICB9XG5cbiAgICAvLyBNZXRob2RzIGFsbG93cyB0byBhZGQgLyByZW1vdmUgQ1NTIGNsYXNzbmFtZXMgdG8gdGhlIGVkaXRvciBlbGVtZW50LlxuICAgIC8vIFRoaXMgZmVhdHVyZSBjYW4gYmUgdXNlZCBieSBwbHVnLWlucyB0byBwcm92aWRlIGEgdmlzdWFsIGluZGljYXRpb24gb2ZcbiAgICAvLyBhIGNlcnRhaW4gbW9kZSB0aGF0IGVkaXRvciBpcyBpbi5cblxuICAgIC8qKlxuICAgICAqIFtBZGRzIGEgbmV3IGNsYXNzLCBgc3R5bGVgLCB0byB0aGUgZWRpdG9yLl17OiAjVmlydHVhbFJlbmRlcmVyLnNldFN0eWxlfVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHlsZSBBIGNsYXNzIG5hbWVcbiAgICAgKlxuICAgICAqL1xuICAgIHNldFN0eWxlKHN0eWxlOiBzdHJpbmcsIGluY2x1ZGU/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIGRvbS5zZXRDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgc3R5bGUsIGluY2x1ZGUgIT09IGZhbHNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBbUmVtb3ZlcyB0aGUgY2xhc3MgYHN0eWxlYCBmcm9tIHRoZSBlZGl0b3IuXXs6ICNWaXJ0dWFsUmVuZGVyZXIudW5zZXRTdHlsZX1cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gc3R5bGUgQSBjbGFzcyBuYW1lXG4gICAgICovXG4gICAgdW5zZXRTdHlsZShzdHlsZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGRvbS5yZW1vdmVDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgc3R5bGUpO1xuICAgIH1cblxuICAgIHNldEN1cnNvclN0eWxlKHN0eWxlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgIT0gc3R5bGUpIHtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgPSBzdHlsZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBjdXJzb3JTdHlsZSBBIGNzcyBjdXJzb3Igc3R5bGVcbiAgICAgKi9cbiAgICBzZXRNb3VzZUN1cnNvcihjdXJzb3JTdHlsZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgPSBjdXJzb3JTdHlsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXN0cm95cyB0aGUgdGV4dCBhbmQgY3Vyc29yIGxheWVycyBmb3IgdGhpcyByZW5kZXJlci5cbiAgICAgKi9cbiAgICBkZXN0cm95KCk6IHZvaWQge1xuICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIuZGVzdHJveSgpO1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5kZXN0cm95KCk7XG4gICAgfVxufVxuXG5jb25maWcuZGVmaW5lT3B0aW9ucyhWaXJ0dWFsUmVuZGVyZXIucHJvdG90eXBlLCBcInJlbmRlcmVyXCIsIHtcbiAgICBhbmltYXRlZFNjcm9sbDogeyBpbml0aWFsVmFsdWU6IGZhbHNlIH0sXG4gICAgc2hvd0ludmlzaWJsZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllci5zZXRTaG93SW52aXNpYmxlcyh2YWx1ZSkpXG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9URVhUKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgc2hvd1ByaW50TWFyZ2luOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oKSB7IHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7IH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgcHJpbnRNYXJnaW5Db2x1bW46IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbigpIHsgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiA4MFxuICAgIH0sXG4gICAgcHJpbnRNYXJnaW46IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsID09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICAgICAgdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW4gPSB2YWw7XG4gICAgICAgICAgICB0aGlzLiRzaG93UHJpbnRNYXJnaW4gPSAhIXZhbDtcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kc2hvd1ByaW50TWFyZ2luICYmIHRoaXMuJHByaW50TWFyZ2luQ29sdW1uO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBzaG93R3V0dGVyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykge1xuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyLnN0eWxlLmRpc3BsYXkgPSBzaG93ID8gXCJibG9ja1wiIDogXCJub25lXCI7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX0ZVTEwpO1xuICAgICAgICAgICAgdGhpcy5vbkd1dHRlclJlc2l6ZSgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGZhZGVGb2xkV2lkZ2V0czoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3cpIHtcbiAgICAgICAgICAgIGRvbS5zZXRDc3NDbGFzcyh0aGlzLiRndXR0ZXIsIFwiYWNlX2ZhZGUtZm9sZC13aWRnZXRzXCIsIHNob3cpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBzaG93Rm9sZFdpZGdldHM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG93KSB7IHRoaXMuJGd1dHRlckxheWVyLnNldFNob3dGb2xkV2lkZ2V0cyhzaG93KSB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIHNob3dMaW5lTnVtYmVyczoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3cpIHtcbiAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnNldFNob3dMaW5lTnVtYmVycyhzaG93KTtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfR1VUVEVSKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBkaXNwbGF5SW5kZW50R3VpZGVzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHRleHRMYXllci5zZXREaXNwbGF5SW5kZW50R3VpZGVzKHNob3cpKVxuICAgICAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfVEVYVCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgaGlnaGxpZ2h0R3V0dGVyTGluZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3VsZEhpZ2hsaWdodCkge1xuICAgICAgICAgICAgaWYgKCF0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodCA9IGRvbS5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuY2xhc3NOYW1lID0gXCJhY2VfZ3V0dGVyLWFjdGl2ZS1saW5lXCI7XG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyLmFwcGVuZENoaWxkKHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodC5zdHlsZS5kaXNwbGF5ID0gc2hvdWxkSGlnaGxpZ2h0ID8gXCJcIiA6IFwibm9uZVwiO1xuICAgICAgICAgICAgLy8gaWYgY3Vyc29ybGF5ZXIgaGF2ZSBuZXZlciBiZWVuIHVwZGF0ZWQgdGhlcmUncyBub3RoaW5nIG9uIHNjcmVlbiB0byB1cGRhdGVcbiAgICAgICAgICAgIGlmICh0aGlzLiRjdXJzb3JMYXllci4kcGl4ZWxQb3MpXG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlLFxuICAgICAgICB2YWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgaFNjcm9sbEJhckFsd2F5c1Zpc2libGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kaFNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHwgIXRoaXMuJGhvcml6U2Nyb2xsKVxuICAgICAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgdlNjcm9sbEJhckFsd2F5c1Zpc2libGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kdlNjcm9sbEJhckFsd2F5c1Zpc2libGUgfHwgIXRoaXMuJHZTY3JvbGwpXG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9TQ1JPTEwpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBmb250U2l6ZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNpemUpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygc2l6ZSA9PSBcIm51bWJlclwiKVxuICAgICAgICAgICAgICAgIHNpemUgPSBzaXplICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5jb250YWluZXIuc3R5bGUuZm9udFNpemUgPSBzaXplO1xuICAgICAgICAgICAgdGhpcy51cGRhdGVGb250U2l6ZSgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IDEyXG4gICAgfSxcbiAgICBmb250RmFtaWx5OiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdGhpcy5jb250YWluZXIuc3R5bGUuZm9udEZhbWlseSA9IG5hbWU7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUZvbnRTaXplKCk7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIG1heExpbmVzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUZ1bGwoKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgbWluTGluZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlRnVsbCgpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBzY3JvbGxQYXN0RW5kOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB2YWwgPSArdmFsIHx8IDA7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2Nyb2xsUGFzdEVuZCA9PSB2YWwpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdGhpcy4kc2Nyb2xsUGFzdEVuZCA9IHZhbDtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiAwLFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICBmaXhlZFdpZHRoR3V0dGVyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci4kZml4ZWRXaWR0aCA9ICEhdmFsO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9HVVRURVIpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICB0aGVtZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLnNldFRoZW1lKHZhbCkgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuJHRoZW1lSWQgfHwgdGhpcy50aGVtZTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcIi4vdGhlbWUvdGV4dG1hdGVcIixcbiAgICAgICAgaGFuZGxlc1NldDogdHJ1ZVxuICAgIH1cbn0pO1xuIl19