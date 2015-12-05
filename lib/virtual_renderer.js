var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var dom = require("./lib/dom");
var config = require("./config");
var useragent = require("./lib/useragent");
var gum = require("./layer/gutter");
var mam = require("./layer/marker");
var txm = require("./layer/text");
var csm = require("./layer/cursor");
var scrollbar = require("./scrollbar");
var rlm = require("./renderloop");
var fmm = require("./layer/font_metrics");
var eve = require("./lib/event_emitter");
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
var VirtualRenderer = (function (_super) {
    __extends(VirtualRenderer, _super);
    function VirtualRenderer(container, theme) {
        _super.call(this);
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
    Object.defineProperty(VirtualRenderer.prototype, "maxLines", {
        set: function (maxLines) {
            this.$maxLines = maxLines;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(VirtualRenderer.prototype, "keepTextAreaAtCursor", {
        set: function (keepTextAreaAtCursor) {
            this.$keepTextAreaAtCursor = keepTextAreaAtCursor;
        },
        enumerable: true,
        configurable: true
    });
    VirtualRenderer.prototype.setDefaultCursorStyle = function () {
        this.content.style.cursor = "default";
    };
    VirtualRenderer.prototype.setCursorLayerOff = function () {
        var noop = function () { };
        this.$cursorLayer.restartTimer = noop;
        this.$cursorLayer.element.style.opacity = "0";
    };
    VirtualRenderer.prototype.updateCharacterSize = function () {
        if (this.$textLayer['allowBoldFonts'] != this.$allowBoldFonts) {
            this.$allowBoldFonts = this.$textLayer['allowBoldFonts'];
            this.setStyle("ace_nobold", !this.$allowBoldFonts);
        }
        this.layerConfig.characterWidth = this.characterWidth = this.$textLayer.getCharacterWidth();
        this.layerConfig.lineHeight = this.lineHeight = this.$textLayer.getLineHeight();
        this.$updatePrintMargin();
    };
    VirtualRenderer.prototype.setSession = function (session) {
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
    };
    VirtualRenderer.prototype.updateLines = function (firstRow, lastRow, force) {
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
    };
    VirtualRenderer.prototype.onChangeNewLineMode = function () {
        this.$loop.schedule(CHANGE_TEXT);
        this.$textLayer.$updateEolChar();
    };
    VirtualRenderer.prototype.onChangeTabSize = function () {
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
    };
    VirtualRenderer.prototype.updateText = function () {
        this.$loop.schedule(CHANGE_TEXT);
    };
    VirtualRenderer.prototype.updateFull = function (force) {
        if (force)
            this.$renderChanges(CHANGE_FULL, true);
        else
            this.$loop.schedule(CHANGE_FULL);
    };
    VirtualRenderer.prototype.updateFontSize = function () {
        this.$textLayer.checkForSizeChanges();
    };
    VirtualRenderer.prototype.$updateSizeAsync = function () {
        if (this.$loop.pending)
            this.$size.$dirty = true;
        else
            this.onResize();
    };
    VirtualRenderer.prototype.onResize = function (force, gutterWidth, width, height) {
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
    };
    VirtualRenderer.prototype.$updateCachedSize = function (force, gutterWidth, width, height) {
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
    };
    VirtualRenderer.prototype.onGutterResize = function () {
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
    };
    VirtualRenderer.prototype.adjustWrapLimit = function () {
        var availableWidth = this.$size.scrollerWidth - this.$padding * 2;
        var limit = Math.floor(availableWidth / this.characterWidth);
        return this.session.adjustWrapLimit(limit, this.$showPrintMargin && this.$printMarginColumn);
    };
    VirtualRenderer.prototype.setAnimatedScroll = function (shouldAnimate) {
        this.setOption("animatedScroll", shouldAnimate);
    };
    VirtualRenderer.prototype.getAnimatedScroll = function () {
        return this.$animatedScroll;
    };
    VirtualRenderer.prototype.setShowInvisibles = function (showInvisibles) {
        this.setOption("showInvisibles", showInvisibles);
    };
    VirtualRenderer.prototype.getShowInvisibles = function () {
        return this.getOption("showInvisibles");
    };
    VirtualRenderer.prototype.getDisplayIndentGuides = function () {
        return this.getOption("displayIndentGuides");
    };
    VirtualRenderer.prototype.setDisplayIndentGuides = function (displayIndentGuides) {
        this.setOption("displayIndentGuides", displayIndentGuides);
    };
    VirtualRenderer.prototype.setShowPrintMargin = function (showPrintMargin) {
        this.setOption("showPrintMargin", showPrintMargin);
    };
    VirtualRenderer.prototype.getShowPrintMargin = function () {
        return this.getOption("showPrintMargin");
    };
    VirtualRenderer.prototype.setPrintMarginColumn = function (printMarginColumn) {
        this.setOption("printMarginColumn", printMarginColumn);
    };
    VirtualRenderer.prototype.getPrintMarginColumn = function () {
        return this.getOption("printMarginColumn");
    };
    VirtualRenderer.prototype.getShowGutter = function () {
        return this.getOption("showGutter");
    };
    VirtualRenderer.prototype.setShowGutter = function (show) {
        return this.setOption("showGutter", show);
    };
    VirtualRenderer.prototype.getFadeFoldWidgets = function () {
        return this.getOption("fadeFoldWidgets");
    };
    VirtualRenderer.prototype.setFadeFoldWidgets = function (show) {
        this.setOption("fadeFoldWidgets", show);
    };
    VirtualRenderer.prototype.setHighlightGutterLine = function (shouldHighlight) {
        this.setOption("highlightGutterLine", shouldHighlight);
    };
    VirtualRenderer.prototype.getHighlightGutterLine = function () {
        return this.getOption("highlightGutterLine");
    };
    VirtualRenderer.prototype.$updateGutterLineHighlight = function () {
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
    };
    VirtualRenderer.prototype.$updatePrintMargin = function () {
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
    };
    VirtualRenderer.prototype.getContainerElement = function () {
        return this.container;
    };
    VirtualRenderer.prototype.getMouseEventTarget = function () {
        return this.content;
    };
    VirtualRenderer.prototype.getTextAreaContainer = function () {
        return this.container;
    };
    VirtualRenderer.prototype.$moveTextAreaToCursor = function () {
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
    };
    VirtualRenderer.prototype.getFirstVisibleRow = function () {
        return this.layerConfig.firstRow;
    };
    VirtualRenderer.prototype.getFirstFullyVisibleRow = function () {
        return this.layerConfig.firstRow + (this.layerConfig.offset === 0 ? 0 : 1);
    };
    VirtualRenderer.prototype.getLastFullyVisibleRow = function () {
        var flint = Math.floor((this.layerConfig.height + this.layerConfig.offset) / this.layerConfig.lineHeight);
        return this.layerConfig.firstRow - 1 + flint;
    };
    VirtualRenderer.prototype.getLastVisibleRow = function () {
        return this.layerConfig.lastRow;
    };
    VirtualRenderer.prototype.setPadding = function (padding) {
        this.$padding = padding;
        this.$textLayer.setPadding(padding);
        this.$cursorLayer.setPadding(padding);
        this.$markerFront.setPadding(padding);
        this.$markerBack.setPadding(padding);
        this.$loop.schedule(CHANGE_FULL);
        this.$updatePrintMargin();
    };
    VirtualRenderer.prototype.setScrollMargin = function (top, bottom, left, right) {
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
    };
    VirtualRenderer.prototype.getHScrollBarAlwaysVisible = function () {
        return this.$hScrollBarAlwaysVisible;
    };
    VirtualRenderer.prototype.setHScrollBarAlwaysVisible = function (alwaysVisible) {
        this.setOption("hScrollBarAlwaysVisible", alwaysVisible);
    };
    VirtualRenderer.prototype.getVScrollBarAlwaysVisible = function () {
        return this.$vScrollBarAlwaysVisible;
    };
    VirtualRenderer.prototype.setVScrollBarAlwaysVisible = function (alwaysVisible) {
        this.setOption("vScrollBarAlwaysVisible", alwaysVisible);
    };
    VirtualRenderer.prototype.$updateScrollBarV = function () {
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
    };
    VirtualRenderer.prototype.$updateScrollBarH = function () {
        this.scrollBarH.setScrollWidth(this.layerConfig.width + 2 * this.$padding + this.scrollMargin.h);
        this.scrollBarH.setScrollLeft(this.scrollLeft + this.scrollMargin.left);
    };
    VirtualRenderer.prototype.freeze = function () {
        this.$frozen = true;
    };
    VirtualRenderer.prototype.unfreeze = function () {
        this.$frozen = false;
    };
    VirtualRenderer.prototype.$renderChanges = function (changes, force) {
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
    };
    VirtualRenderer.prototype.$autosize = function () {
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
    };
    VirtualRenderer.prototype.$computeLayerConfig = function () {
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
    };
    VirtualRenderer.prototype.$updateLines = function () {
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
    };
    VirtualRenderer.prototype.$getLongestLine = function () {
        var charCount = this.session.getScreenWidth();
        if (this.showInvisibles && !this.session.$useWrapMode)
            charCount += 1;
        return Math.max(this.$size.scrollerWidth - 2 * this.$padding, Math.round(charCount * this.characterWidth));
    };
    VirtualRenderer.prototype.updateFrontMarkers = function () {
        this.$markerFront.setMarkers(this.session.getMarkers(true));
        this.$loop.schedule(CHANGE_MARKER_FRONT);
    };
    VirtualRenderer.prototype.updateBackMarkers = function () {
        this.$markerBack.setMarkers(this.session.getMarkers(false));
        this.$loop.schedule(CHANGE_MARKER_BACK);
    };
    VirtualRenderer.prototype.addGutterDecoration = function (row, className) {
        this.$gutterLayer.addGutterDecoration(row, className);
    };
    VirtualRenderer.prototype.removeGutterDecoration = function (row, className) {
        this.$gutterLayer.removeGutterDecoration(row, className);
    };
    VirtualRenderer.prototype.updateBreakpoints = function () {
        this.$loop.schedule(CHANGE_GUTTER);
    };
    VirtualRenderer.prototype.setAnnotations = function (annotations) {
        this.$gutterLayer.setAnnotations(annotations);
        this.$loop.schedule(CHANGE_GUTTER);
    };
    VirtualRenderer.prototype.updateCursor = function () {
        this.$loop.schedule(CHANGE_CURSOR);
    };
    VirtualRenderer.prototype.hideCursor = function () {
        this.$cursorLayer.hideCursor();
    };
    VirtualRenderer.prototype.showCursor = function () {
        this.$cursorLayer.showCursor();
    };
    VirtualRenderer.prototype.scrollSelectionIntoView = function (anchor, lead, offset) {
        this.scrollCursorIntoView(anchor, offset);
        this.scrollCursorIntoView(lead, offset);
    };
    VirtualRenderer.prototype.scrollCursorIntoView = function (cursor, offset, $viewMargin) {
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
    };
    VirtualRenderer.prototype.getScrollTop = function () {
        return this.session.getScrollTop();
    };
    VirtualRenderer.prototype.getScrollLeft = function () {
        return this.session.getScrollLeft();
    };
    VirtualRenderer.prototype.getScrollTopRow = function () {
        return this.scrollTop / this.lineHeight;
    };
    VirtualRenderer.prototype.getScrollBottomRow = function () {
        return Math.max(0, Math.floor((this.scrollTop + this.$size.scrollerHeight) / this.lineHeight) - 1);
    };
    VirtualRenderer.prototype.scrollToRow = function (row) {
        this.session.setScrollTop(row * this.lineHeight);
    };
    VirtualRenderer.prototype.alignCursor = function (cursor, alignment) {
        if (typeof cursor == "number")
            cursor = { row: cursor, column: 0 };
        var pos = this.$cursorLayer.getPixelPosition(cursor);
        var h = this.$size.scrollerHeight - this.lineHeight;
        var offset = pos.top - h * (alignment || 0);
        this.session.setScrollTop(offset);
        return offset;
    };
    VirtualRenderer.prototype.$calcSteps = function (fromValue, toValue) {
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
    };
    VirtualRenderer.prototype.scrollToLine = function (line, center, animate, callback) {
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
    };
    VirtualRenderer.prototype.animateScrolling = function (fromValue, callback) {
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
    };
    VirtualRenderer.prototype.scrollToY = function (scrollTop) {
        if (this.scrollTop !== scrollTop) {
            this.scrollTop = scrollTop;
            this.$loop.schedule(CHANGE_SCROLL);
        }
    };
    VirtualRenderer.prototype.scrollToX = function (scrollLeft) {
        if (this.scrollLeft !== scrollLeft) {
            this.scrollLeft = scrollLeft;
            this.$loop.schedule(CHANGE_H_SCROLL);
        }
    };
    VirtualRenderer.prototype.scrollTo = function (x, y) {
        this.session.setScrollTop(y);
        this.session.setScrollLeft(y);
    };
    VirtualRenderer.prototype.scrollBy = function (deltaX, deltaY) {
        deltaY && this.session.setScrollTop(this.session.getScrollTop() + deltaY);
        deltaX && this.session.setScrollLeft(this.session.getScrollLeft() + deltaX);
    };
    VirtualRenderer.prototype.isScrollableBy = function (deltaX, deltaY) {
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
    };
    VirtualRenderer.prototype.pixelToScreenCoordinates = function (x, y) {
        var canvasPos = this.scroller.getBoundingClientRect();
        var offset = (x + this.scrollLeft - canvasPos.left - this.$padding) / this.characterWidth;
        var row = Math.floor((y + this.scrollTop - canvasPos.top) / this.lineHeight);
        var col = Math.round(offset);
        return { row: row, column: col, side: offset - col > 0 ? 1 : -1 };
    };
    VirtualRenderer.prototype.screenToTextCoordinates = function (clientX, clientY) {
        var canvasPos = this.scroller.getBoundingClientRect();
        var column = Math.round((clientX + this.scrollLeft - canvasPos.left - this.$padding) / this.characterWidth);
        var row = (clientY + this.scrollTop - canvasPos.top) / this.lineHeight;
        return this.session.screenToDocumentPosition(row, Math.max(column, 0));
    };
    VirtualRenderer.prototype.textToScreenCoordinates = function (row, column) {
        var canvasPos = this.scroller.getBoundingClientRect();
        var pos = this.session.documentToScreenPosition(row, column);
        var x = this.$padding + Math.round(pos.column * this.characterWidth);
        var y = pos.row * this.lineHeight;
        return {
            pageX: canvasPos.left + x - this.scrollLeft,
            pageY: canvasPos.top + y - this.scrollTop
        };
    };
    VirtualRenderer.prototype.visualizeFocus = function () {
        dom.addCssClass(this.container, "ace_focus");
    };
    VirtualRenderer.prototype.visualizeBlur = function () {
        dom.removeCssClass(this.container, "ace_focus");
    };
    VirtualRenderer.prototype.showComposition = function (position) {
        if (!this.$composition)
            this.$composition = {
                keepTextAreaAtCursor: this.$keepTextAreaAtCursor,
                cssText: this.textarea.style.cssText
            };
        this.$keepTextAreaAtCursor = true;
        dom.addCssClass(this.textarea, "ace_composition");
        this.textarea.style.cssText = "";
        this.$moveTextAreaToCursor();
    };
    VirtualRenderer.prototype.setCompositionText = function (text) {
        this.$moveTextAreaToCursor();
    };
    VirtualRenderer.prototype.hideComposition = function () {
        if (!this.$composition) {
            return;
        }
        dom.removeCssClass(this.textarea, "ace_composition");
        this.$keepTextAreaAtCursor = this.$composition.keepTextAreaAtCursor;
        this.textarea.style.cssText = this.$composition.cssText;
        this.$composition = null;
    };
    VirtualRenderer.prototype.setTheme = function (theme, cb) {
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
    };
    VirtualRenderer.prototype.getTheme = function () {
        return this.$themeId;
    };
    VirtualRenderer.prototype.setStyle = function (style, include) {
        dom.setCssClass(this.container, style, include !== false);
    };
    VirtualRenderer.prototype.unsetStyle = function (style) {
        dom.removeCssClass(this.container, style);
    };
    VirtualRenderer.prototype.setCursorStyle = function (style) {
        if (this.content.style.cursor != style) {
            this.content.style.cursor = style;
        }
    };
    VirtualRenderer.prototype.setMouseCursor = function (cursorStyle) {
        this.content.style.cursor = cursorStyle;
    };
    VirtualRenderer.prototype.destroy = function () {
        this.$textLayer.destroy();
        this.$cursorLayer.destroy();
    };
    return VirtualRenderer;
})(eve.EventEmitterClass);
exports.VirtualRenderer = VirtualRenderer;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlydHVhbF9yZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy92aXJ0dWFsX3JlbmRlcmVyLnRzIl0sIm5hbWVzIjpbIlZpcnR1YWxSZW5kZXJlciIsIlZpcnR1YWxSZW5kZXJlci5jb25zdHJ1Y3RvciIsIlZpcnR1YWxSZW5kZXJlci5tYXhMaW5lcyIsIlZpcnR1YWxSZW5kZXJlci5rZWVwVGV4dEFyZWFBdEN1cnNvciIsIlZpcnR1YWxSZW5kZXJlci5zZXREZWZhdWx0Q3Vyc29yU3R5bGUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0Q3Vyc29yTGF5ZXJPZmYiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlQ2hhcmFjdGVyU2l6ZSIsIlZpcnR1YWxSZW5kZXJlci5zZXRTZXNzaW9uIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUxpbmVzIiwiVmlydHVhbFJlbmRlcmVyLm9uQ2hhbmdlTmV3TGluZU1vZGUiLCJWaXJ0dWFsUmVuZGVyZXIub25DaGFuZ2VUYWJTaXplIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZVRleHQiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlRnVsbCIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVGb250U2l6ZSIsIlZpcnR1YWxSZW5kZXJlci4kdXBkYXRlU2l6ZUFzeW5jIiwiVmlydHVhbFJlbmRlcmVyLm9uUmVzaXplIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVDYWNoZWRTaXplIiwiVmlydHVhbFJlbmRlcmVyLm9uR3V0dGVyUmVzaXplIiwiVmlydHVhbFJlbmRlcmVyLmFkanVzdFdyYXBMaW1pdCIsIlZpcnR1YWxSZW5kZXJlci5zZXRBbmltYXRlZFNjcm9sbCIsIlZpcnR1YWxSZW5kZXJlci5nZXRBbmltYXRlZFNjcm9sbCIsIlZpcnR1YWxSZW5kZXJlci5zZXRTaG93SW52aXNpYmxlcyIsIlZpcnR1YWxSZW5kZXJlci5nZXRTaG93SW52aXNpYmxlcyIsIlZpcnR1YWxSZW5kZXJlci5nZXREaXNwbGF5SW5kZW50R3VpZGVzIiwiVmlydHVhbFJlbmRlcmVyLnNldERpc3BsYXlJbmRlbnRHdWlkZXMiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0U2hvd1ByaW50TWFyZ2luIiwiVmlydHVhbFJlbmRlcmVyLmdldFNob3dQcmludE1hcmdpbiIsIlZpcnR1YWxSZW5kZXJlci5zZXRQcmludE1hcmdpbkNvbHVtbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRQcmludE1hcmdpbkNvbHVtbiIsIlZpcnR1YWxSZW5kZXJlci5nZXRTaG93R3V0dGVyIiwiVmlydHVhbFJlbmRlcmVyLnNldFNob3dHdXR0ZXIiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0RmFkZUZvbGRXaWRnZXRzIiwiVmlydHVhbFJlbmRlcmVyLnNldEZhZGVGb2xkV2lkZ2V0cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRIaWdobGlnaHRHdXR0ZXJMaW5lIiwiVmlydHVhbFJlbmRlcmVyLmdldEhpZ2hsaWdodEd1dHRlckxpbmUiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZUd1dHRlckxpbmVIaWdobGlnaHQiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVByaW50TWFyZ2luIiwiVmlydHVhbFJlbmRlcmVyLmdldENvbnRhaW5lckVsZW1lbnQiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0TW91c2VFdmVudFRhcmdldCIsIlZpcnR1YWxSZW5kZXJlci5nZXRUZXh0QXJlYUNvbnRhaW5lciIsIlZpcnR1YWxSZW5kZXJlci4kbW92ZVRleHRBcmVhVG9DdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0Rmlyc3RWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldEZpcnN0RnVsbHlWaXNpYmxlUm93IiwiVmlydHVhbFJlbmRlcmVyLmdldExhc3RGdWxseVZpc2libGVSb3ciLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0TGFzdFZpc2libGVSb3ciLCJWaXJ0dWFsUmVuZGVyZXIuc2V0UGFkZGluZyIsIlZpcnR1YWxSZW5kZXJlci5zZXRTY3JvbGxNYXJnaW4iLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuZ2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuc2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNjcm9sbEJhclYiLCJWaXJ0dWFsUmVuZGVyZXIuJHVwZGF0ZVNjcm9sbEJhckgiLCJWaXJ0dWFsUmVuZGVyZXIuZnJlZXplIiwiVmlydHVhbFJlbmRlcmVyLnVuZnJlZXplIiwiVmlydHVhbFJlbmRlcmVyLiRyZW5kZXJDaGFuZ2VzIiwiVmlydHVhbFJlbmRlcmVyLiRhdXRvc2l6ZSIsIlZpcnR1YWxSZW5kZXJlci4kY29tcHV0ZUxheWVyQ29uZmlnIiwiVmlydHVhbFJlbmRlcmVyLiR1cGRhdGVMaW5lcyIsIlZpcnR1YWxSZW5kZXJlci4kZ2V0TG9uZ2VzdExpbmUiLCJWaXJ0dWFsUmVuZGVyZXIudXBkYXRlRnJvbnRNYXJrZXJzIiwiVmlydHVhbFJlbmRlcmVyLnVwZGF0ZUJhY2tNYXJrZXJzIiwiVmlydHVhbFJlbmRlcmVyLmFkZEd1dHRlckRlY29yYXRpb24iLCJWaXJ0dWFsUmVuZGVyZXIucmVtb3ZlR3V0dGVyRGVjb3JhdGlvbiIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVCcmVha3BvaW50cyIsIlZpcnR1YWxSZW5kZXJlci5zZXRBbm5vdGF0aW9ucyIsIlZpcnR1YWxSZW5kZXJlci51cGRhdGVDdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuaGlkZUN1cnNvciIsIlZpcnR1YWxSZW5kZXJlci5zaG93Q3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFNlbGVjdGlvbkludG9WaWV3IiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbFRvcCIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxMZWZ0IiwiVmlydHVhbFJlbmRlcmVyLmdldFNjcm9sbFRvcFJvdyIsIlZpcnR1YWxSZW5kZXJlci5nZXRTY3JvbGxCb3R0b21Sb3ciLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9Sb3ciLCJWaXJ0dWFsUmVuZGVyZXIuYWxpZ25DdXJzb3IiLCJWaXJ0dWFsUmVuZGVyZXIuJGNhbGNTdGVwcyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb0xpbmUiLCJWaXJ0dWFsUmVuZGVyZXIuYW5pbWF0ZVNjcm9sbGluZyIsIlZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb1kiLCJWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9YIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvIiwiVmlydHVhbFJlbmRlcmVyLnNjcm9sbEJ5IiwiVmlydHVhbFJlbmRlcmVyLmlzU2Nyb2xsYWJsZUJ5IiwiVmlydHVhbFJlbmRlcmVyLnBpeGVsVG9TY3JlZW5Db29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci50ZXh0VG9TY3JlZW5Db29yZGluYXRlcyIsIlZpcnR1YWxSZW5kZXJlci52aXN1YWxpemVGb2N1cyIsIlZpcnR1YWxSZW5kZXJlci52aXN1YWxpemVCbHVyIiwiVmlydHVhbFJlbmRlcmVyLnNob3dDb21wb3NpdGlvbiIsIlZpcnR1YWxSZW5kZXJlci5zZXRDb21wb3NpdGlvblRleHQiLCJWaXJ0dWFsUmVuZGVyZXIuaGlkZUNvbXBvc2l0aW9uIiwiVmlydHVhbFJlbmRlcmVyLnNldFRoZW1lIiwiVmlydHVhbFJlbmRlcmVyLnNldFRoZW1lLmFmdGVyTG9hZCIsIlZpcnR1YWxSZW5kZXJlci5nZXRUaGVtZSIsIlZpcnR1YWxSZW5kZXJlci5zZXRTdHlsZSIsIlZpcnR1YWxSZW5kZXJlci51bnNldFN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldEN1cnNvclN0eWxlIiwiVmlydHVhbFJlbmRlcmVyLnNldE1vdXNlQ3Vyc29yIiwiVmlydHVhbFJlbmRlcmVyLmRlc3Ryb3kiXSwibWFwcGluZ3MiOiI7Ozs7O0FBK0JBLElBQU8sR0FBRyxXQUFXLFdBQVcsQ0FBQyxDQUFDO0FBQ2xDLElBQU8sTUFBTSxXQUFXLFVBQVUsQ0FBQyxDQUFDO0FBQ3BDLElBQU8sU0FBUyxXQUFXLGlCQUFpQixDQUFDLENBQUM7QUFDOUMsSUFBTyxHQUFHLFdBQVcsZ0JBQWdCLENBQUMsQ0FBQztBQUN2QyxJQUFPLEdBQUcsV0FBVyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQ3ZDLElBQU8sR0FBRyxXQUFXLGNBQWMsQ0FBQyxDQUFDO0FBQ3JDLElBQU8sR0FBRyxXQUFXLGdCQUFnQixDQUFDLENBQUM7QUFDdkMsSUFBTyxTQUFTLFdBQVcsYUFBYSxDQUFDLENBQUM7QUFDMUMsSUFBTyxHQUFHLFdBQVcsY0FBYyxDQUFDLENBQUM7QUFDckMsSUFBTyxHQUFHLFdBQVcsc0JBQXNCLENBQUMsQ0FBQztBQUM3QyxJQUFPLEdBQUcsV0FBVyxxQkFBcUIsQ0FBQyxDQUFDO0FBTzVDLElBQUksYUFBYSxHQUFHLENBQUMsQ0FBQztBQUN0QixJQUFJLGFBQWEsR0FBRyxDQUFDLENBQUM7QUFDdEIsSUFBSSxhQUFhLEdBQUcsQ0FBQyxDQUFDO0FBQ3RCLElBQUksYUFBYSxHQUFHLENBQUMsQ0FBQztBQUN0QixJQUFJLFlBQVksR0FBRyxFQUFFLENBQUM7QUFDdEIsSUFBSSxXQUFXLEdBQUcsRUFBRSxDQUFDO0FBQ3JCLElBQUksV0FBVyxHQUFHLEVBQUUsQ0FBQztBQUNyQixJQUFJLGtCQUFrQixHQUFHLEdBQUcsQ0FBQztBQUM3QixJQUFJLG1CQUFtQixHQUFHLEdBQUcsQ0FBQztBQUM5QixJQUFJLFdBQVcsR0FBRyxHQUFHLENBQUM7QUFDdEIsSUFBSSxlQUFlLEdBQUcsSUFBSSxDQUFDO0FBTzNCO0lBQXFDQSxtQ0FBcUJBO0lBOEZ0REEseUJBQVlBLFNBQXNCQSxFQUFFQSxLQUFjQTtRQUM5Q0MsaUJBQU9BLENBQUNBO1FBNUZMQSxlQUFVQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNmQSxjQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNkQSxnQkFBV0EsR0FBR0E7WUFDakJBLEtBQUtBLEVBQUVBLENBQUNBO1lBQ1JBLE9BQU9BLEVBQUVBLENBQUNBO1lBQ1ZBLFFBQVFBLEVBQUVBLENBQUNBO1lBQ1hBLGNBQWNBLEVBQUVBLENBQUNBO1lBQ2pCQSxPQUFPQSxFQUFFQSxDQUFDQTtZQUNWQSxVQUFVQSxFQUFFQSxDQUFDQTtZQUNiQSxjQUFjQSxFQUFFQSxDQUFDQTtZQUNqQkEsU0FBU0EsRUFBRUEsQ0FBQ0E7WUFDWkEsU0FBU0EsRUFBRUEsQ0FBQ0E7WUFDWkEsTUFBTUEsRUFBRUEsQ0FBQ0E7WUFDVEEsTUFBTUEsRUFBRUEsQ0FBQ0E7WUFDVEEsWUFBWUEsRUFBRUEsQ0FBQ0E7U0FDbEJBLENBQUNBO1FBTUtBLGFBQVFBLEdBQVdBLENBQUNBLENBQUNBO1FBQ3BCQSxZQUFPQSxHQUFHQSxLQUFLQSxDQUFDQTtRQVVoQkEsVUFBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFlVkEsaUJBQVlBLEdBQUdBO1lBQ25CQSxJQUFJQSxFQUFFQSxDQUFDQTtZQUNQQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUNSQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNOQSxNQUFNQSxFQUFFQSxDQUFDQTtZQUNUQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUNKQSxDQUFDQSxFQUFFQSxDQUFDQTtTQUNQQSxDQUFDQTtRQVFNQSxhQUFRQSxHQUFHQSxDQUFDQSxDQUFDQTtRQWdDakJBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO1FBRWpCQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxTQUFTQSxJQUFvQkEsR0FBR0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFPdkVBLElBQUlBLENBQUNBLHFCQUFxQkEsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFFaERBLEdBQUdBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLFlBQVlBLENBQUNBLENBQUNBO1FBRTlDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUVyQkEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsR0FBR0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDeENBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLEdBQUdBLFlBQVlBLENBQUNBO1FBQ3RDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUV6Q0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsR0FBR0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDekNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFNBQVNBLEdBQUdBLGNBQWNBLENBQUNBO1FBQ3pDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUUxQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBbUJBLEdBQUdBLENBQUNBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ3hEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxHQUFHQSxhQUFhQSxDQUFDQTtRQUN2Q0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFFeENBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLElBQUlBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQ2pEQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxFQUFFQSxDQUFDQSxtQkFBbUJBLEVBQUVBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBRTFFQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxJQUFJQSxHQUFHQSxDQUFD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QzNFZSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNsQkEsTUFBTUEsQ0FBQ0E7UUFDWEEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO1FBQ3BCQSxJQUFJQTtZQUNBQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxLQUFLQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUdsQ0EsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO1lBQ1JBLE1BQU1BLEdBQUdBLEVBQUVBLENBQUNBLFlBQVlBLElBQUlBLEVBQUVBLENBQUNBLFlBQVlBLENBQUNBO1FBQ2hEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNQQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxXQUFXQSxJQUFJQSxFQUFFQSxDQUFDQSxXQUFXQSxDQUFDQTtRQUM3Q0EsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxLQUFLQSxFQUFFQSxXQUFXQSxFQUFFQSxLQUFLQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUd4RUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDbERBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBO1FBRTdCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNOQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUV0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDTkEsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLElBQUlBO1lBQ0FBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBRWpEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQTtZQUNkQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUMxQkEsQ0FBQ0E7SUFFRGYsMkNBQWlCQSxHQUFqQkEsVUFBa0JBLEtBQUtBLEVBQUVBLFdBQVdBLEVBQUVBLEtBQUtBLEVBQUVBLE1BQU1BO1FBQy9DZ0IsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDbkNBLElBQUlBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBO1FBQ2hCQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUN0QkEsSUFBSUEsT0FBT0EsR0FBR0E7WUFDVkEsS0FBS0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0E7WUFDakJBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLE1BQU1BO1lBQ25CQSxjQUFjQSxFQUFFQSxJQUFJQSxDQUFDQSxjQUFjQTtZQUNuQ0EsYUFBYUEsRUFBRUEsSUFBSUEsQ0FBQ0EsYUFBYUE7U0FDcENBLENBQUNBO1FBQ0ZBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLEtBQUtBLElBQUlBLElBQUlBLENBQUNBLE1BQU1BLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzdDQSxJQUFJQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQTtZQUNyQkEsT0FBT0EsSUFBSUEsV0FBV0EsQ0FBQ0E7WUFFdkJBLElBQUlBLENBQUNBLGNBQWNBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBO1lBQ2xDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQTtnQkFDbEJBLElBQUlBLENBQUNBLGNBQWNBLElBQUlBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLE1BQU1BLENBQUNBO1lBRWxEQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUVyRUEsT0FBT0EsR0FBR0EsT0FBT0EsR0FBR0EsYUFBYUEsQ0FBQ0E7UUFDdENBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLENBQUNBLEtBQUtBLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzFDQSxPQUFPQSxJQUFJQSxXQUFXQSxDQUFDQTtZQUN2QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0E7WUFFbkJBLEVBQUVBLENBQUNBLENBQUNBLFdBQVdBLElBQUlBLElBQUlBLENBQUNBO2dCQUNwQkEsV0FBV0EsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsV0FBV0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFFbEVBLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLFdBQVdBLENBQUNBO1lBRS9CQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQTtnQkFDOUJBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLEdBQUdBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBO1lBQ2xEQSxJQUFJQSxDQUFDQSxhQUFhQSxHQUFHQSxJQUFJQSxD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T0EsQ0FBQ0EsUUFBUUEsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDcERBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLHFCQUFxQkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdERBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ1BBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBO1FBQ2hCQSxDQUFDQTtRQUNEQSxPQUFPQSxJQUFJQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtRQUMzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsYUFBYUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDdkNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLEdBQUdBLENBQUNBLENBQUNBO1FBRTNDQSxPQUFPQSxJQUFJQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUVqQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDdENBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3JDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxHQUFHQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN2RkEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFB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QUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxFQUNqRkEsV0FBV0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFdEZBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzNEQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNwRkEsSUFBSUEsT0FBT0EsR0FBR0EsUUFBUUEsR0FBR0EsU0FBU0EsQ0FBQ0E7UUFHbkNBLElBQUlBLGNBQWNBLEVBQUVBLGNBQWNBLENBQUNBO1FBQ25DQSxJQUFJQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtRQUNqQ0EsUUFBUUEsR0FBR0EsT0FBT0EsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUlwREEsSUFBSUEsUUFBUUEsR0FBR0EsT0FBT0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQ1hBLFFBQVFBLEdBQUdBLFFBQVFBLENB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QUNBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBO1FBQzFGQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtRQUM3RUEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFN0JBLE1BQU1BLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLEdBQUdBLEVBQUVBLElBQUlBLEVBQUVBLE1BQU1BLEdBQUdBLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBO0lBQ3RFQSxDQUFDQTtJQUVEckYsaURBQXVCQSxHQUF2QkEsVUFBd0JBLE9BQWVBLEVBQUVBLE9BQWVBO1FBQ3BEc0YsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EscUJBQXFCQSxFQUFFQSxDQUFDQTtRQUV0REEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsU0FBU0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0E7UUFFNUdBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBRXZFQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSx3QkFBd0JBLENBQUNBLEdBQUdBLEVB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S0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsYUFBYUEsQ0FDaENBLENBQUNBO1lBRUZBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO2dCQUNaQSxHQUFHQSxDQUFDQSxjQUFjQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUU5REEsSUFBSUEsT0FBT0EsR0FBR0EsU0FBU0EsSUFBSUEsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsR0FBR0EsU0FBU0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsSUFBSUEsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFFM0dBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLElBQUlBLE9BQU9BLElBQUlBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO2dCQUM5Q0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDOUJBLENBQUNBO1lBR0RBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBO1lBRS9CQSxLQUFLQSxDQUFDQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQTtZQUNyQkEsR0FBR0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsRUFBRUEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7WUFDbERBLEdBQUdBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLEVBQUVBLFVBQVVBLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBRzVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDZEEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FB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QU0sQ0FBQztZQUNYLElBQUksQ0FBQyxjQUFjLEdBQUcsR0FBRyxDQUFDO1lBQzFCLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUM1QyxDQUFDO1FBQ0QsWUFBWSxFQUFFLENBQUM7UUFDZixVQUFVLEVBQUUsSUFBSTtLQUNuQjtJQUNELGdCQUFnQixFQUFFO1FBQ2QsR0FBRyxFQUFFLFVBQVMsR0FBRztZQUNiLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUM7WUFDdEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzVDLENBQUM7S0FDSjtJQUNELEtBQUssRUFBRTtRQUNILEdBQUcsRUFBRSxVQUFTLEdBQUcsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUMsQ0FBQztRQUN6QyxHQUFHLEVBQUUsY0FBYSxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUN2RCxZQUFZLEVBQUUsa0JBQWtCO1FBQ2hDLFVBQVUsRUFBRSxJQUFJO0tBQ25CO0NBQ0osQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbmltcG9ydCBvb3AgPSByZXF1aXJlKFwiLi9saWIvb29wXCIpO1xuaW1wb3J0IGRvbSA9IHJlcXVpcmUoXCIuL2xpYi9kb21cIik7XG5pbXBvcnQgY29uZmlnID0gcmVxdWlyZShcIi4vY29uZmlnXCIpO1xuaW1wb3J0IHVzZXJhZ2VudCA9IHJlcXVpcmUoXCIuL2xpYi91c2VyYWdlbnRcIik7XG5pbXBvcnQgZ3VtID0gcmVxdWlyZShcIi4vbGF5ZXIvZ3V0dGVyXCIpO1xuaW1wb3J0IG1hbSA9IHJlcXVpcmUoXCIuL2xheWVyL21hcmtlclwiKTtcbmltcG9ydCB0eG0gPSByZXF1aXJlKFwiLi9sYXllci90ZXh0XCIpO1xuaW1wb3J0IGNzbSA9IHJlcXVpcmUoXCIuL2xheWVyL2N1cnNvclwiKTtcbmltcG9ydCBzY3JvbGxiYXIgPSByZXF1aXJlKFwiLi9zY3JvbGxiYXJcIik7XG5pbXBvcnQgcmxtID0gcmVxdWlyZShcIi4vcmVuZGVybG9vcFwiKTtcbmltcG9ydCBmbW0gPSByZXF1aXJlKFwiLi9sYXllci9mb250X21ldHJpY3NcIik7XG5pbXBvcnQgZXZlID0gcmVxdWlyZShcIi4vbGliL2V2ZW50X2VtaXR0ZXJcIik7XG5pbXBvcnQgZXNtID0gcmVxdWlyZSgnLi9lZGl0X3Nlc3Npb24nKTtcblxuLy8gRklYTUVcbi8vIGltcG9ydCBlZGl0b3JDc3MgPSByZXF1aXJlKFwiLi9yZXF1aXJlanMvdGV4dCEuL2Nzcy9lZGl0b3IuY3NzXCIpO1xuLy8gZG9tLmltcG9ydENzc1N0cmluZyhlZGl0b3JDc3MsIFwiYWNlX2VkaXRvclwiKTtcblxudmFyIENIQU5HRV9DVVJTT1IgPSAxO1xudmFyIENIQU5HRV9NQVJLRVIgPSAyO1xudmFyIENIQU5HRV9HVVRURVIgPSA0O1xudmFyIENIQU5HRV9TQ1JPTEwgPSA4O1xudmFyIENIQU5HRV9MSU5FUyA9IDE2O1xudmFyIENIQU5HRV9URVhUID0gMzI7XG52YXIgQ0hBTkdFX1NJWkUgPSA2NDtcbnZhciBDSEFOR0VfTUFSS0VSX0JBQ0sgPSAxMjg7XG52YXIgQ0hBTkdFX01BUktFUl9GUk9OVCA9IDI1NjtcbnZhciBDSEFOR0VfRlVMTCA9IDUxMjtcbnZhciBDSEFOR0VfSF9TQ1JPTEwgPSAxMDI0O1xuXG4vKipcbiAqIFRoZSBjbGFzcyB0aGF0IGlzIHJlc3BvbnNpYmxlIGZvciBkcmF3aW5nIGV2ZXJ5dGhpbmcgeW91IHNlZSBvbiB0aGUgc2NyZWVuIVxuICogQHJlbGF0ZWQgZWRpdG9yLnJlbmRlcmVyIFxuICogQGNsYXNzIFZpcnR1YWxSZW5kZXJlclxuICoqL1xuZXhwb3J0IGNsYXNzIFZpcnR1YWxSZW5kZXJlciBleHRlbmRzIGV2ZS5FdmVudEVtaXR0ZXJDbGFzcyB7XG4gICAgcHVibGljIHRleHRhcmVhOiBIVE1MVGV4dEFyZWFFbGVtZW50O1xuICAgIHB1YmxpYyBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuICAgIHB1YmxpYyBzY3JvbGxMZWZ0ID0gMDtcbiAgICBwdWJsaWMgc2Nyb2xsVG9wID0gMDtcbiAgICBwdWJsaWMgbGF5ZXJDb25maWcgPSB7XG4gICAgICAgIHdpZHRoOiAxLFxuICAgICAgICBwYWRkaW5nOiAwLFxuICAgICAgICBmaXJzdFJvdzogMCxcbiAgICAgICAgZmlyc3RSb3dTY3JlZW46IDAsXG4gICAgICAgIGxhc3RSb3c6IDAsXG4gICAgICAgIGxpbmVIZWlnaHQ6IDAsXG4gICAgICAgIGNoYXJhY3RlcldpZHRoOiAwLFxuICAgICAgICBtaW5IZWlnaHQ6IDEsXG4gICAgICAgIG1heEhlaWdodDogMSxcbiAgICAgICAgb2Zmc2V0OiAwLFxuICAgICAgICBoZWlnaHQ6IDEsXG4gICAgICAgIGd1dHRlck9mZnNldDogMVxuICAgIH07XG4gICAgcHVibGljICRtYXhMaW5lczogbnVtYmVyO1xuICAgIHB1YmxpYyAkbWluTGluZXM6IG51bWJlcjtcbiAgICBwdWJsaWMgJGN1cnNvckxheWVyOiBjc20uQ3Vyc29yO1xuICAgIHB1YmxpYyAkZ3V0dGVyTGF5ZXI6IGd1bS5HdXR0ZXI7XG5cbiAgICBwdWJsaWMgJHBhZGRpbmc6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSAkZnJvemVuID0gZmFsc2U7XG5cbiAgICAvLyBUaGUgdGhlbWVJZCBpcyB3aGF0IGlzIGNvbW11bmljYXRlZCBpbiB0aGUgQVBJLlxuICAgIHByaXZhdGUgJHRoZW1lSWQ6IHN0cmluZztcbiAgICAvLyBXaGF0IGFyZSB0aGVzZT9cbiAgICBwcml2YXRlIHRoZW1lO1xuICAgIHByaXZhdGUgJHRoZW1lO1xuXG4gICAgcHJpdmF0ZSAkb3B0aW9ucztcbiAgICBwcml2YXRlICR0aW1lcjtcbiAgICBwcml2YXRlIFNURVBTID0gODtcbiAgICBwdWJsaWMgJGtlZXBUZXh0QXJlYUF0Q3Vyc29yOiBib29sZWFuO1xuICAgIHB1YmxpYyAkZ3V0dGVyO1xuICAgIHB1YmxpYyBzY3JvbGxlcjtcbiAgICBwdWJsaWMgY29udGVudDogSFRNTERpdkVsZW1lbnQ7XG4gICAgcHVibGljICR0ZXh0TGF5ZXI6IHR4bS5UZXh0O1xuICAgIHByaXZhdGUgJG1hcmtlckZyb250OiBtYW0uTWFya2VyO1xuICAgIHByaXZhdGUgJG1hcmtlckJhY2s6IG1hbS5NYXJrZXI7XG4gICAgcHJpdmF0ZSBjYW52YXM6IEhUTUxEaXZFbGVtZW50O1xuICAgIHByaXZhdGUgJGhvcml6U2Nyb2xsOiBib29sZWFuO1xuICAgIHByaXZhdGUgJHZTY3JvbGw7XG4gICAgcHVibGljIHNjcm9sbEJhckg6IHNjcm9sbGJhci5IU2Nyb2xsQmFyO1xuICAgIHB1YmxpYyBzY3JvbGxCYXJWOiBzY3JvbGxiYXIuVlNjcm9sbEJhcjtcbiAgICBwcml2YXRlICRzY3JvbGxBbmltYXRpb246IHsgZnJvbTogbnVtYmVyOyB0bzogbnVtYmVyOyBzdGVwczogbnVtYmVyW10gfTtcbiAgICBwcml2YXRlIHNlc3Npb246IGVzbS5FZGl0U2Vzc2lvbjtcbiAgICBwcml2YXRlIHNjcm9sbE1hcmdpbiA9IHtcbiAgICAgICAgbGVmdDogMCxcbiAgICAgICAgcmlnaHQ6IDAsXG4gICAgICAgIHRvcDogMCxcbiAgICAgICAgYm90dG9tOiAwLFxuICAgICAgICB2OiAwLFxuICAgICAgICBoOiAwXG4gICAgfTtcblxuICAgIHByaXZhdGUgJGZvbnRNZXRyaWNzO1xuICAgIHByaXZhdGUgJGFsbG93Qm9sZEZvbnRzO1xuICAgIHByaXZhdGUgY3Vyc29yUG9zO1xuICAgIHB1YmxpYyAkc2l6ZTtcbiAgICBwcml2YXRlICRsb29wO1xuICAgIHByaXZhdGUgJGNoYW5nZWRMaW5lcztcbiAgICBwcml2YXRlICRjaGFuZ2VzID0gMDtcbiAgICBwcml2YXRlIHJlc2l6aW5nO1xuICAgIHByaXZhdGUgJGd1dHRlckxpbmVIaWdobGlnaHQ7XG4gICAgcHJpdmF0ZSBndXR0ZXJXaWR0aDtcbiAgICBwcml2YXRlICRndXR0ZXJXaWR0aDtcbiAgICBwcml2YXRlICRzaG93UHJpbnRNYXJnaW47XG4gICAgcHJpdmF0ZSAkcHJpbnRNYXJnaW5FbDtcbiAgICBwcml2YXRlIGdldE9wdGlvbjtcbiAgICBwcml2YXRlIHNldE9wdGlvbjtcbiAgICBwcml2YXRlIGNoYXJhY3RlcldpZHRoO1xuICAgIHByaXZhdGUgJHByaW50TWFyZ2luQ29sdW1uO1xuICAgIHByaXZhdGUgbGluZUhlaWdodDtcbiAgICBwcml2YXRlICRleHRyYUhlaWdodDtcbiAgICBwcml2YXRlICRjb21wb3NpdGlvbjogeyBrZWVwVGV4dEFyZWFBdEN1cnNvcjogYm9vbGVhbjsgY3NzVGV4dDogc3RyaW5nIH07XG4gICAgcHJpdmF0ZSAkaFNjcm9sbEJhckFsd2F5c1Zpc2libGU7XG4gICAgcHJpdmF0ZSAkdlNjcm9sbEJhckFsd2F5c1Zpc2libGU7XG4gICAgcHJpdmF0ZSAkc2hvd0d1dHRlcjtcbiAgICBwcml2YXRlIHNob3dJbnZpc2libGVzO1xuICAgIHByaXZhdGUgJGFuaW1hdGVkU2Nyb2xsO1xuICAgIHByaXZhdGUgJHNjcm9sbFBhc3RFbmQ7XG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0R3V0dGVyTGluZTtcbiAgICBwcml2YXRlIGRlc2lyZWRIZWlnaHQ7XG4gICAgLyoqXG4gICAgICogQ29uc3RydWN0cyBhIG5ldyBgVmlydHVhbFJlbmRlcmVyYCB3aXRoaW4gdGhlIGBjb250YWluZXJgIHNwZWNpZmllZCwgYXBwbHlpbmcgdGhlIGdpdmVuIGB0aGVtZWAuXG4gICAgICogQGNsYXNzIFZpcnR1YWxSZW5kZXJlclxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqIEBwYXJhbSBjb250YWluZXIge0RPTUVsZW1lbnR9IFRoZSByb290IGVsZW1lbnQgb2YgdGhlIGVkaXRvclxuICAgICAqIEBwYXJhbSBbdGhlbWVdIHtzdHJpbmd9IFRoZSBzdGFydGluZyB0aGVtZVxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRoZW1lPzogc3RyaW5nKSB7XG4gICAgICAgIHN1cGVyKCk7XG5cbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcblxuICAgICAgICB0aGlzLmNvbnRhaW5lciA9IGNvbnRhaW5lciB8fCA8SFRNTERpdkVsZW1lbnQ+ZG9tLmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cbiAgICAgICAgLy8gVE9ETzogdGhpcyBicmVha3MgcmVuZGVyaW5nIGluIENsb3VkOSB3aXRoIG11bHRpcGxlIGFjZSBpbnN0YW5jZXNcbiAgICAgICAgLy8gLy8gSW1wb3J0cyBDU1Mgb25jZSBwZXIgRE9NIGRvY3VtZW50ICgnYWNlX2VkaXRvcicgc2VydmVzIGFzIGFuIGlkZW50aWZpZXIpLlxuICAgICAgICAvLyBkb20uaW1wb3J0Q3NzU3RyaW5nKGVkaXRvckNzcywgXCJhY2VfZWRpdG9yXCIsIGNvbnRhaW5lci5vd25lckRvY3VtZW50KTtcblxuICAgICAgICAvLyBpbiBJRSA8PSA5IHRoZSBuYXRpdmUgY3Vyc29yIGFsd2F5cyBzaGluZXMgdGhyb3VnaFxuICAgICAgICB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9ICF1c2VyYWdlbnQuaXNPbGRJRTtcblxuICAgICAgICBkb20uYWRkQ3NzQ2xhc3ModGhpcy5jb250YWluZXIsIFwiYWNlX2VkaXRvclwiKTtcblxuICAgICAgICB0aGlzLnNldFRoZW1lKHRoZW1lKTtcblxuICAgICAgICB0aGlzLiRndXR0ZXIgPSBkb20uY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGhpcy4kZ3V0dGVyLmNsYXNzTmFtZSA9IFwiYWNlX2d1dHRlclwiO1xuICAgICAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLiRndXR0ZXIpO1xuXG4gICAgICAgIHRoaXMuc2Nyb2xsZXIgPSBkb20uY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGhpcy5zY3JvbGxlci5jbGFzc05hbWUgPSBcImFjZV9zY3JvbGxlclwiO1xuICAgICAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLnNjcm9sbGVyKTtcblxuICAgICAgICB0aGlzLmNvbnRlbnQgPSA8SFRNTERpdkVsZW1lbnQ+ZG9tLmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRoaXMuY29udGVudC5jbGFzc05hbWUgPSBcImFjZV9jb250ZW50XCI7XG4gICAgICAgIHRoaXMuc2Nyb2xsZXIuYXBwZW5kQ2hpbGQodGhpcy5jb250ZW50KTtcblxuICAgICAgICB0aGlzLiRndXR0ZXJMYXllciA9IG5ldyBndW0uR3V0dGVyKHRoaXMuJGd1dHRlcik7XG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyLm9uKFwiY2hhbmdlR3V0dGVyV2lkdGhcIiwgdGhpcy5vbkd1dHRlclJlc2l6ZS5iaW5kKHRoaXMpKTtcblxuICAgICAgICB0aGlzLiRtYXJrZXJCYWNrID0gbmV3IG1hbS5NYXJrZXIodGhpcy5jb250ZW50KTtcblxuICAgICAgICB2YXIgdGV4dExheWVyID0gdGhpcy4kdGV4dExheWVyID0gbmV3IHR4bS5UZXh0KHRoaXMuY29udGVudCk7XG4gICAgICAgIHRoaXMuY2FudmFzID0gdGV4dExheWVyLmVsZW1lbnQ7XG5cbiAgICAgICAgdGhpcy4kbWFya2VyRnJvbnQgPSBuZXcgbWFtLk1hcmtlcih0aGlzLmNvbnRlbnQpO1xuXG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyID0gbmV3IGNzbS5DdXJzb3IodGhpcy5jb250ZW50KTtcblxuICAgICAgICAvLyBJbmRpY2F0ZXMgd2hldGhlciB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIgaXMgdmlzaWJsZVxuICAgICAgICB0aGlzLiRob3JpelNjcm9sbCA9IGZhbHNlO1xuICAgICAgICB0aGlzLiR2U2Nyb2xsID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5zY3JvbGxCYXJWID0gbmV3IHNjcm9sbGJhci5WU2Nyb2xsQmFyKHRoaXMuY29udGFpbmVyLCB0aGlzKTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJIID0gbmV3IHNjcm9sbGJhci5IU2Nyb2xsQmFyKHRoaXMuY29udGFpbmVyLCB0aGlzKTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJWLmFkZEV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgaWYgKCFfc2VsZi4kc2Nyb2xsQW5pbWF0aW9uKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxUb3AoZS5kYXRhIC0gX3NlbGYuc2Nyb2xsTWFyZ2luLnRvcCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnNjcm9sbEJhckguYWRkRXZlbnRMaXN0ZW5lcihcInNjcm9sbFwiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBpZiAoIV9zZWxmLiRzY3JvbGxBbmltYXRpb24pIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5zZXNzaW9uLnNldFNjcm9sbExlZnQoZS5kYXRhIC0gX3NlbGYuc2Nyb2xsTWFyZ2luLmxlZnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmN1cnNvclBvcyA9IHtcbiAgICAgICAgICAgIHJvdzogMCxcbiAgICAgICAgICAgIGNvbHVtbjogMFxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuJGZvbnRNZXRyaWNzID0gbmV3IGZtbS5Gb250TWV0cmljcyh0aGlzLmNvbnRhaW5lciwgNTAwKTtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLiRzZXRGb250TWV0cmljcyh0aGlzLiRmb250TWV0cmljcyk7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlQ2hhcmFjdGVyU2l6ZVwiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBfc2VsZi51cGRhdGVDaGFyYWN0ZXJTaXplKCk7XG4gICAgICAgICAgICBfc2VsZi5vblJlc2l6ZSh0cnVlLCBfc2VsZi5ndXR0ZXJXaWR0aCwgX3NlbGYuJHNpemUud2lkdGgsIF9zZWxmLiRzaXplLmhlaWdodCk7XG4gICAgICAgICAgICBfc2VsZi5fc2lnbmFsKFwiY2hhbmdlQ2hhcmFjdGVyU2l6ZVwiLCBlKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy4kc2l6ZSA9IHtcbiAgICAgICAgICAgIHdpZHRoOiAwLFxuICAgICAgICAgICAgaGVpZ2h0OiAwLFxuICAgICAgICAgICAgc2Nyb2xsZXJIZWlnaHQ6IDAsXG4gICAgICAgICAgICBzY3JvbGxlcldpZHRoOiAwLFxuICAgICAgICAgICAgJGRpcnR5OiB0cnVlXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy4kbG9vcCA9IG5ldyBybG0uUmVuZGVyTG9vcChcbiAgICAgICAgICAgIHRoaXMuJHJlbmRlckNoYW5nZXMuYmluZCh0aGlzKSxcbiAgICAgICAgICAgIHRoaXMuY29udGFpbmVyLm93bmVyRG9jdW1lbnQuZGVmYXVsdFZpZXdcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG5cbiAgICAgICAgdGhpcy51cGRhdGVDaGFyYWN0ZXJTaXplKCk7XG4gICAgICAgIHRoaXMuc2V0UGFkZGluZyg0KTtcbiAgICAgICAgY29uZmlnLnJlc2V0T3B0aW9ucyh0aGlzKTtcbiAgICAgICAgY29uZmlnLl9lbWl0KFwicmVuZGVyZXJcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgc2V0IG1heExpbmVzKG1heExpbmVzOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy4kbWF4TGluZXMgPSBtYXhMaW5lcztcbiAgICB9XG5cbiAgICBzZXQga2VlcFRleHRBcmVhQXRDdXJzb3Ioa2VlcFRleHRBcmVhQXRDdXJzb3I6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSBrZWVwVGV4dEFyZWFBdEN1cnNvcjtcbiAgICB9XG5cbiAgICBzZXREZWZhdWx0Q3Vyc29yU3R5bGUoKSB7XG4gICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5jdXJzb3IgPSBcImRlZmF1bHRcIjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBOb3Qgc3VyZSB3aGF0IHRoZSBjb3JyZWN0IHNlbWFudGljcyBzaG91bGQgYmUgZm9yIHRoaXMuXG4gICAgICovXG4gICAgc2V0Q3Vyc29yTGF5ZXJPZmYoKSB7XG4gICAgICAgIHZhciBub29wID0gZnVuY3Rpb24oKSB7IH07XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnJlc3RhcnRUaW1lciA9IG5vb3A7XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLmVsZW1lbnQuc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xuICAgIH1cblxuICAgIHVwZGF0ZUNoYXJhY3RlclNpemUoKSB7XG4gICAgICAgIC8vIEZJWE1FOiBER0ggYWxsb3dCb2xGb250cyBkb2VzIG5vdCBleGlzdCBvbiBUZXh0XG4gICAgICAgIGlmICh0aGlzLiR0ZXh0TGF5ZXJbJ2FsbG93Qm9sZEZvbnRzJ10gIT0gdGhpcy4kYWxsb3dCb2xkRm9udHMpIHtcbiAgICAgICAgICAgIHRoaXMuJGFsbG93Qm9sZEZvbnRzID0gdGhpcy4kdGV4dExheWVyWydhbGxvd0JvbGRGb250cyddO1xuICAgICAgICAgICAgdGhpcy5zZXRTdHlsZShcImFjZV9ub2JvbGRcIiwgIXRoaXMuJGFsbG93Qm9sZEZvbnRzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubGF5ZXJDb25maWcuY2hhcmFjdGVyV2lkdGggPSB0aGlzLmNoYXJhY3RlcldpZHRoID0gdGhpcy4kdGV4dExheWVyLmdldENoYXJhY3RlcldpZHRoKCk7XG4gICAgICAgIHRoaXMubGF5ZXJDb25maWcubGluZUhlaWdodCA9IHRoaXMubGluZUhlaWdodCA9IHRoaXMuJHRleHRMYXllci5nZXRMaW5lSGVpZ2h0KCk7XG4gICAgICAgIHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogQXNzb2NpYXRlcyB0aGUgcmVuZGVyZXIgd2l0aCBhbiBbW0VkaXRTZXNzaW9uIGBFZGl0U2Vzc2lvbmBdXS5cbiAgICAqKi9cbiAgICBzZXRTZXNzaW9uKHNlc3Npb24pIHtcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbilcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5kb2Mub2ZmKFwiY2hhbmdlTmV3TGluZU1vZGVcIiwgdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlKTtcblxuICAgICAgICB0aGlzLnNlc3Npb24gPSBzZXNzaW9uO1xuICAgICAgICBpZiAoIXNlc3Npb24pXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKHRoaXMuc2Nyb2xsTWFyZ2luLnRvcCAmJiBzZXNzaW9uLmdldFNjcm9sbFRvcCgpIDw9IDApXG4gICAgICAgICAgICBzZXNzaW9uLnNldFNjcm9sbFRvcCgtdGhpcy5zY3JvbGxNYXJnaW4udG9wKTtcblxuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5zZXRTZXNzaW9uKHNlc3Npb24pO1xuICAgICAgICB0aGlzLiRtYXJrZXJCYWNrLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJG1hcmtlckZyb250LnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJGd1dHRlckxheWVyLnNldFNlc3Npb24oc2Vzc2lvbik7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci5zZXRTZXNzaW9uKHNlc3Npb24pO1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLiRzZXRGb250TWV0cmljcyh0aGlzLiRmb250TWV0cmljcyk7XG5cbiAgICAgICAgdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlID0gdGhpcy5vbkNoYW5nZU5ld0xpbmVNb2RlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMub25DaGFuZ2VOZXdMaW5lTW9kZSgpXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5kb2Mub24oXCJjaGFuZ2VOZXdMaW5lTW9kZVwiLCB0aGlzLm9uQ2hhbmdlTmV3TGluZU1vZGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogVHJpZ2dlcnMgYSBwYXJ0aWFsIHVwZGF0ZSBvZiB0aGUgdGV4dCwgZnJvbSB0aGUgcmFuZ2UgZ2l2ZW4gYnkgdGhlIHR3byBwYXJhbWV0ZXJzLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBmaXJzdCByb3cgdG8gdXBkYXRlXG4gICAgKiBAcGFyYW0ge051bWJlcn0gbGFzdFJvdyBUaGUgbGFzdCByb3cgdG8gdXBkYXRlXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICB1cGRhdGVMaW5lcyhmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIsIGZvcmNlPzogYm9vbGVhbikge1xuICAgICAgICBpZiAobGFzdFJvdyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBsYXN0Um93ID0gSW5maW5pdHk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuJGNoYW5nZWRMaW5lcykge1xuICAgICAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzID0geyBmaXJzdFJvdzogZmlyc3RSb3csIGxhc3RSb3c6IGxhc3RSb3cgfTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiRjaGFuZ2VkTGluZXMuZmlyc3RSb3cgPiBmaXJzdFJvdykge1xuICAgICAgICAgICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcy5maXJzdFJvdyA9IGZpcnN0Um93O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3cgPCBsYXN0Um93KSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kY2hhbmdlZExpbmVzLmxhc3RSb3cgPSBsYXN0Um93O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgdGhlIGNoYW5nZSBoYXBwZW5lZCBvZmZzY3JlZW4gYWJvdmUgdXMgdGhlbiBpdCdzIHBvc3NpYmxlXG4gICAgICAgIC8vIHRoYXQgYSBuZXcgbGluZSB3cmFwIHdpbGwgYWZmZWN0IHRoZSBwb3NpdGlvbiBvZiB0aGUgbGluZXMgb24gb3VyXG4gICAgICAgIC8vIHNjcmVlbiBzbyB0aGV5IG5lZWQgcmVkcmF3bi5cbiAgICAgICAgLy8gVE9ETzogYmV0dGVyIHNvbHV0aW9uIGlzIHRvIG5vdCBjaGFuZ2Ugc2Nyb2xsIHBvc2l0aW9uIHdoZW4gdGV4dCBpcyBjaGFuZ2VkIG91dHNpZGUgb2YgdmlzaWJsZSBhcmVhXG4gICAgICAgIGlmICh0aGlzLiRjaGFuZ2VkTGluZXMubGFzdFJvdyA8IHRoaXMubGF5ZXJDb25maWcuZmlyc3RSb3cpIHtcbiAgICAgICAgICAgIGlmIChmb3JjZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93ID0gdGhpcy5sYXllckNvbmZpZy5sYXN0Um93O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuJGNoYW5nZWRMaW5lcy5maXJzdFJvdyA+IHRoaXMubGF5ZXJDb25maWcubGFzdFJvdykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0xJTkVTKTtcbiAgICB9XG5cbiAgICBvbkNoYW5nZU5ld0xpbmVNb2RlKCkge1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9URVhUKTtcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLiR1cGRhdGVFb2xDaGFyKCk7XG4gICAgfVxuXG4gICAgb25DaGFuZ2VUYWJTaXplKCkge1xuICAgICAgICBpZiAodGhpcy4kbG9vcCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJGxvb3Auc2NoZWR1bGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9URVhUIHwgQ0hBTkdFX01BUktFUik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyLm9uQ2hhbmdlVGFiU2l6ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci5vbkNoYW5nZVRhYlNpemUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEknbSBub3Qgc3VyZSB3aHkgd2UgY2FuIG5vdyBlbmQgdXAgaGVyZS5cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogVHJpZ2dlcnMgYSBmdWxsIHVwZGF0ZSBvZiB0aGUgdGV4dCwgZm9yIGFsbCB0aGUgcm93cy5cbiAgICAqKi9cbiAgICB1cGRhdGVUZXh0KCkge1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9URVhUKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFRyaWdnZXJzIGEgZnVsbCB1cGRhdGUgb2YgYWxsIHRoZSBsYXllcnMsIGZvciBhbGwgdGhlIHJvd3MuXG4gICAgKiBAcGFyYW0ge0Jvb2xlYW59IGZvcmNlIElmIGB0cnVlYCwgZm9yY2VzIHRoZSBjaGFuZ2VzIHRocm91Z2hcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHVwZGF0ZUZ1bGwoZm9yY2U/KSB7XG4gICAgICAgIGlmIChmb3JjZSlcbiAgICAgICAgICAgIHRoaXMuJHJlbmRlckNoYW5nZXMoQ0hBTkdFX0ZVTEwsIHRydWUpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBVcGRhdGVzIHRoZSBmb250IHNpemUuXG4gICAgKiovXG4gICAgdXBkYXRlRm9udFNpemUoKSB7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci5jaGVja0ZvclNpemVDaGFuZ2VzKCk7XG4gICAgfVxuXG4gICAgJHVwZGF0ZVNpemVBc3luYygpIHtcbiAgICAgICAgaWYgKHRoaXMuJGxvb3AucGVuZGluZylcbiAgICAgICAgICAgIHRoaXMuJHNpemUuJGRpcnR5ID0gdHJ1ZTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy5vblJlc2l6ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogW1RyaWdnZXJzIGEgcmVzaXplIG9mIHRoZSBlZGl0b3IuXXs6ICNWaXJ0dWFsUmVuZGVyZXIub25SZXNpemV9XG4gICAgKiBAcGFyYW0ge0Jvb2xlYW59IGZvcmNlIElmIGB0cnVlYCwgcmVjb21wdXRlcyB0aGUgc2l6ZSwgZXZlbiBpZiB0aGUgaGVpZ2h0IGFuZCB3aWR0aCBoYXZlbid0IGNoYW5nZWRcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBndXR0ZXJXaWR0aCBUaGUgd2lkdGggb2YgdGhlIGd1dHRlciBpbiBwaXhlbHNcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSB3aWR0aCBUaGUgd2lkdGggb2YgdGhlIGVkaXRvciBpbiBwaXhlbHNcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBoZWlnaHQgVGhlIGhpZWhndCBvZiB0aGUgZWRpdG9yLCBpbiBwaXhlbHNcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIG9uUmVzaXplKGZvcmNlPzogYm9vbGVhbiwgZ3V0dGVyV2lkdGg/OiBudW1iZXIsIHdpZHRoPzogbnVtYmVyLCBoZWlnaHQ/OiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHRoaXMucmVzaXppbmcgPiAyKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBlbHNlIGlmICh0aGlzLnJlc2l6aW5nID4gMClcbiAgICAgICAgICAgIHRoaXMucmVzaXppbmcrKztcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy5yZXNpemluZyA9IGZvcmNlID8gMSA6IDA7XG4gICAgICAgIC8vIGB8fCBlbC5zY3JvbGxIZWlnaHRgIGlzIHJlcXVpcmVkIGZvciBvdXRvc2l6aW5nIGVkaXRvcnMgb24gaWVcbiAgICAgICAgLy8gd2hlcmUgZWxlbWVudHMgd2l0aCBjbGllbnRIZWlnaHQgPSAwIGFsc29lIGhhdmUgY2xpZW50V2lkdGggPSAwXG4gICAgICAgIHZhciBlbCA9IHRoaXMuY29udGFpbmVyO1xuICAgICAgICBpZiAoIWhlaWdodClcbiAgICAgICAgICAgIGhlaWdodCA9IGVsLmNsaWVudEhlaWdodCB8fCBlbC5zY3JvbGxIZWlnaHQ7XG4gICAgICAgIGlmICghd2lkdGgpXG4gICAgICAgICAgICB3aWR0aCA9IGVsLmNsaWVudFdpZHRoIHx8IGVsLnNjcm9sbFdpZHRoO1xuICAgICAgICB2YXIgY2hhbmdlcyA9IHRoaXMuJHVwZGF0ZUNhY2hlZFNpemUoZm9yY2UsIGd1dHRlcldpZHRoLCB3aWR0aCwgaGVpZ2h0KTtcblxuXG4gICAgICAgIGlmICghdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCB8fCAoIXdpZHRoICYmICFoZWlnaHQpKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucmVzaXppbmcgPSAwO1xuXG4gICAgICAgIGlmIChmb3JjZSlcbiAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLiRwYWRkaW5nID0gbnVsbDtcblxuICAgICAgICBpZiAoZm9yY2UpXG4gICAgICAgICAgICB0aGlzLiRyZW5kZXJDaGFuZ2VzKGNoYW5nZXMgfCB0aGlzLiRjaGFuZ2VzLCB0cnVlKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShjaGFuZ2VzIHwgdGhpcy4kY2hhbmdlcyk7XG5cbiAgICAgICAgaWYgKHRoaXMucmVzaXppbmcpXG4gICAgICAgICAgICB0aGlzLnJlc2l6aW5nID0gMDtcbiAgICB9XG5cbiAgICAkdXBkYXRlQ2FjaGVkU2l6ZShmb3JjZSwgZ3V0dGVyV2lkdGgsIHdpZHRoLCBoZWlnaHQpIHtcbiAgICAgICAgaGVpZ2h0IC09ICh0aGlzLiRleHRyYUhlaWdodCB8fCAwKTtcbiAgICAgICAgdmFyIGNoYW5nZXMgPSAwO1xuICAgICAgICB2YXIgc2l6ZSA9IHRoaXMuJHNpemU7XG4gICAgICAgIHZhciBvbGRTaXplID0ge1xuICAgICAgICAgICAgd2lkdGg6IHNpemUud2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQ6IHNpemUuaGVpZ2h0LFxuICAgICAgICAgICAgc2Nyb2xsZXJIZWlnaHQ6IHNpemUuc2Nyb2xsZXJIZWlnaHQsXG4gICAgICAgICAgICBzY3JvbGxlcldpZHRoOiBzaXplLnNjcm9sbGVyV2lkdGhcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKGhlaWdodCAmJiAoZm9yY2UgfHwgc2l6ZS5oZWlnaHQgIT0gaGVpZ2h0KSkge1xuICAgICAgICAgICAgc2l6ZS5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgICAgICBjaGFuZ2VzIHw9IENIQU5HRV9TSVpFO1xuXG4gICAgICAgICAgICBzaXplLnNjcm9sbGVySGVpZ2h0ID0gc2l6ZS5oZWlnaHQ7XG4gICAgICAgICAgICBpZiAodGhpcy4kaG9yaXpTY3JvbGwpXG4gICAgICAgICAgICAgICAgc2l6ZS5zY3JvbGxlckhlaWdodCAtPSB0aGlzLnNjcm9sbEJhckguaGVpZ2h0O1xuXG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhclYuZWxlbWVudC5zdHlsZS5ib3R0b20gPSB0aGlzLnNjcm9sbEJhckguaGVpZ2h0ICsgXCJweFwiO1xuXG4gICAgICAgICAgICBjaGFuZ2VzID0gY2hhbmdlcyB8IENIQU5HRV9TQ1JPTEw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAod2lkdGggJiYgKGZvcmNlIHx8IHNpemUud2lkdGggIT0gd2lkdGgpKSB7XG4gICAgICAgICAgICBjaGFuZ2VzIHw9IENIQU5HRV9TSVpFO1xuICAgICAgICAgICAgc2l6ZS53aWR0aCA9IHdpZHRoO1xuXG4gICAgICAgICAgICBpZiAoZ3V0dGVyV2lkdGggPT0gbnVsbClcbiAgICAgICAgICAgICAgICBndXR0ZXJXaWR0aCA9IHRoaXMuJHNob3dHdXR0ZXIgPyB0aGlzLiRndXR0ZXIub2Zmc2V0V2lkdGggOiAwO1xuXG4gICAgICAgICAgICB0aGlzLmd1dHRlcldpZHRoID0gZ3V0dGVyV2lkdGg7XG5cbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFySC5lbGVtZW50LnN0eWxlLmxlZnQgPVxuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsZXIuc3R5bGUubGVmdCA9IGd1dHRlcldpZHRoICsgXCJweFwiO1xuICAgICAgICAgICAgc2l6ZS5zY3JvbGxlcldpZHRoID0gTWF0aC5tYXgoMCwgd2lkdGggLSBndXR0ZXJXaWR0aCAtIHRoaXMuc2Nyb2xsQmFyVi53aWR0aCk7XG5cbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsQmFySC5lbGVtZW50LnN0eWxlLnJpZ2h0ID1cbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbGVyLnN0eWxlLnJpZ2h0ID0gdGhpcy5zY3JvbGxCYXJWLndpZHRoICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxlci5zdHlsZS5ib3R0b20gPSB0aGlzLnNjcm9sbEJhckguaGVpZ2h0ICsgXCJweFwiO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5zZXNzaW9uICYmIHRoaXMuc2Vzc2lvbi5nZXRVc2VXcmFwTW9kZSgpICYmIHRoaXMuYWRqdXN0V3JhcExpbWl0KCkgfHwgZm9yY2UpXG4gICAgICAgICAgICAgICAgY2hhbmdlcyB8PSBDSEFOR0VfRlVMTDtcbiAgICAgICAgfVxuXG4gICAgICAgIHNpemUuJGRpcnR5ID0gIXdpZHRoIHx8ICFoZWlnaHQ7XG5cbiAgICAgICAgaWYgKGNoYW5nZXMpXG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJyZXNpemVcIiwgb2xkU2l6ZSk7XG5cbiAgICAgICAgcmV0dXJuIGNoYW5nZXM7XG4gICAgfVxuXG4gICAgb25HdXR0ZXJSZXNpemUoKSB7XG4gICAgICAgIHZhciBndXR0ZXJXaWR0aCA9IHRoaXMuJHNob3dHdXR0ZXIgPyB0aGlzLiRndXR0ZXIub2Zmc2V0V2lkdGggOiAwO1xuICAgICAgICBpZiAoZ3V0dGVyV2lkdGggIT0gdGhpcy5ndXR0ZXJXaWR0aClcbiAgICAgICAgICAgIHRoaXMuJGNoYW5nZXMgfD0gdGhpcy4kdXBkYXRlQ2FjaGVkU2l6ZSh0cnVlLCBndXR0ZXJXaWR0aCwgdGhpcy4kc2l6ZS53aWR0aCwgdGhpcy4kc2l6ZS5oZWlnaHQpO1xuXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKSAmJiB0aGlzLmFkanVzdFdyYXBMaW1pdCgpKSB7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9GVUxMKTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLiRzaXplLiRkaXJ0eSkge1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiRjb21wdXRlTGF5ZXJDb25maWcoKTtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX01BUktFUik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEFkanVzdHMgdGhlIHdyYXAgbGltaXQsIHdoaWNoIGlzIHRoZSBudW1iZXIgb2YgY2hhcmFjdGVycyB0aGF0IGNhbiBmaXQgd2l0aGluIHRoZSB3aWR0aCBvZiB0aGUgZWRpdCBhcmVhIG9uIHNjcmVlbi5cbiAgICAqKi9cbiAgICBhZGp1c3RXcmFwTGltaXQoKSB7XG4gICAgICAgIHZhciBhdmFpbGFibGVXaWR0aCA9IHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCAtIHRoaXMuJHBhZGRpbmcgKiAyO1xuICAgICAgICB2YXIgbGltaXQgPSBNYXRoLmZsb29yKGF2YWlsYWJsZVdpZHRoIC8gdGhpcy5jaGFyYWN0ZXJXaWR0aCk7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uYWRqdXN0V3JhcExpbWl0KGxpbWl0LCB0aGlzLiRzaG93UHJpbnRNYXJnaW4gJiYgdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIGhhdmUgYW4gYW5pbWF0ZWQgc2Nyb2xsIG9yIG5vdC5cbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvdWxkQW5pbWF0ZSBTZXQgdG8gYHRydWVgIHRvIHNob3cgYW5pbWF0ZWQgc2Nyb2xsc1xuICAgICpcbiAgICAqKi9cbiAgICBzZXRBbmltYXRlZFNjcm9sbChzaG91bGRBbmltYXRlKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiYW5pbWF0ZWRTY3JvbGxcIiwgc2hvdWxkQW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHdoZXRoZXIgYW4gYW5pbWF0ZWQgc2Nyb2xsIGhhcHBlbnMgb3Igbm90LlxuICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgKiovXG4gICAgZ2V0QW5pbWF0ZWRTY3JvbGwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRhbmltYXRlZFNjcm9sbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyBpbnZpc2libGUgY2hhcmFjdGVycyBvciBub3QuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93SW52aXNpYmxlcyBTZXQgdG8gYHRydWVgIHRvIHNob3cgaW52aXNpYmxlc1xuICAgICAqL1xuICAgIHNldFNob3dJbnZpc2libGVzKHNob3dJbnZpc2libGVzOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwic2hvd0ludmlzaWJsZXNcIiwgc2hvd0ludmlzaWJsZXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciBpbnZpc2libGUgY2hhcmFjdGVycyBhcmUgYmVpbmcgc2hvd24gb3Igbm90LlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqL1xuICAgIGdldFNob3dJbnZpc2libGVzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzaG93SW52aXNpYmxlc1wiKTtcbiAgICB9XG5cbiAgICBnZXREaXNwbGF5SW5kZW50R3VpZGVzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJkaXNwbGF5SW5kZW50R3VpZGVzXCIpO1xuICAgIH1cblxuICAgIHNldERpc3BsYXlJbmRlbnRHdWlkZXMoZGlzcGxheUluZGVudEd1aWRlczogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImRpc3BsYXlJbmRlbnRHdWlkZXNcIiwgZGlzcGxheUluZGVudEd1aWRlcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWRlbnRpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvIHNob3cgdGhlIHByaW50IG1hcmdpbiBvciBub3QuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93UHJpbnRNYXJnaW4gU2V0IHRvIGB0cnVlYCB0byBzaG93IHRoZSBwcmludCBtYXJnaW5cbiAgICAgKlxuICAgICAqL1xuICAgIHNldFNob3dQcmludE1hcmdpbihzaG93UHJpbnRNYXJnaW46IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJzaG93UHJpbnRNYXJnaW5cIiwgc2hvd1ByaW50TWFyZ2luKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHByaW50IG1hcmdpbiBpcyBiZWluZyBzaG93biBvciBub3QuXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd1ByaW50TWFyZ2luKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzaG93UHJpbnRNYXJnaW5cIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgY29sdW1uIGRlZmluaW5nIHdoZXJlIHRoZSBwcmludCBtYXJnaW4gc2hvdWxkIGJlLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBwcmludE1hcmdpbkNvbHVtbiBTcGVjaWZpZXMgdGhlIG5ldyBwcmludCBtYXJnaW5cbiAgICAgKi9cbiAgICBzZXRQcmludE1hcmdpbkNvbHVtbihwcmludE1hcmdpbkNvbHVtbjogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwicHJpbnRNYXJnaW5Db2x1bW5cIiwgcHJpbnRNYXJnaW5Db2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGNvbHVtbiBudW1iZXIgb2Ygd2hlcmUgdGhlIHByaW50IG1hcmdpbiBpcy5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqL1xuICAgIGdldFByaW50TWFyZ2luQ29sdW1uKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInByaW50TWFyZ2luQ29sdW1uXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBndXR0ZXIgaXMgYmVpbmcgc2hvd24uXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd0d1dHRlcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwic2hvd0d1dHRlclwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IHRoZSBndXR0ZXIgb3Igbm90LlxuICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93IFNldCB0byBgdHJ1ZWAgdG8gc2hvdyB0aGUgZ3V0dGVyXG4gICAgKlxuICAgICoqL1xuICAgIHNldFNob3dHdXR0ZXIoc2hvdykge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXRPcHRpb24oXCJzaG93R3V0dGVyXCIsIHNob3cpO1xuICAgIH1cblxuICAgIGdldEZhZGVGb2xkV2lkZ2V0cygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiZmFkZUZvbGRXaWRnZXRzXCIpXG4gICAgfVxuXG4gICAgc2V0RmFkZUZvbGRXaWRnZXRzKHNob3cpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJmYWRlRm9sZFdpZGdldHNcIiwgc2hvdyk7XG4gICAgfVxuXG4gICAgc2V0SGlnaGxpZ2h0R3V0dGVyTGluZShzaG91bGRIaWdobGlnaHQpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJoaWdobGlnaHRHdXR0ZXJMaW5lXCIsIHNob3VsZEhpZ2hsaWdodCk7XG4gICAgfVxuXG4gICAgZ2V0SGlnaGxpZ2h0R3V0dGVyTGluZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiaGlnaGxpZ2h0R3V0dGVyTGluZVwiKTtcbiAgICB9XG5cbiAgICAkdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpIHtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuJGN1cnNvckxheWVyLiRwaXhlbFBvcztcbiAgICAgICAgdmFyIGhlaWdodCA9IHRoaXMubGF5ZXJDb25maWcubGluZUhlaWdodDtcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi5nZXRVc2VXcmFwTW9kZSgpKSB7XG4gICAgICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5zZXNzaW9uLnNlbGVjdGlvbi5nZXRDdXJzb3IoKTtcbiAgICAgICAgICAgIGN1cnNvci5jb2x1bW4gPSAwO1xuICAgICAgICAgICAgcG9zID0gdGhpcy4kY3Vyc29yTGF5ZXIuZ2V0UGl4ZWxQb3NpdGlvbihjdXJzb3IsIHRydWUpO1xuICAgICAgICAgICAgaGVpZ2h0ICo9IHRoaXMuc2Vzc2lvbi5nZXRSb3dMZW5ndGgoY3Vyc29yLnJvdyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodC5zdHlsZS50b3AgPSBwb3MudG9wIC0gdGhpcy5sYXllckNvbmZpZy5vZmZzZXQgKyBcInB4XCI7XG4gICAgICAgIHRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQuc3R5bGUuaGVpZ2h0ID0gaGVpZ2h0ICsgXCJweFwiO1xuICAgIH1cblxuICAgICR1cGRhdGVQcmludE1hcmdpbigpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRzaG93UHJpbnRNYXJnaW4gJiYgIXRoaXMuJHByaW50TWFyZ2luRWwpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKCF0aGlzLiRwcmludE1hcmdpbkVsKSB7XG4gICAgICAgICAgICB2YXIgY29udGFpbmVyRWw6IEhUTUxEaXZFbGVtZW50ID0gPEhUTUxEaXZFbGVtZW50PmRvbS5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgY29udGFpbmVyRWwuY2xhc3NOYW1lID0gXCJhY2VfbGF5ZXIgYWNlX3ByaW50LW1hcmdpbi1sYXllclwiO1xuICAgICAgICAgICAgdGhpcy4kcHJpbnRNYXJnaW5FbCA9IGRvbS5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgdGhpcy4kcHJpbnRNYXJnaW5FbC5jbGFzc05hbWUgPSBcImFjZV9wcmludC1tYXJnaW5cIjtcbiAgICAgICAgICAgIGNvbnRhaW5lckVsLmFwcGVuZENoaWxkKHRoaXMuJHByaW50TWFyZ2luRWwpO1xuICAgICAgICAgICAgdGhpcy5jb250ZW50Lmluc2VydEJlZm9yZShjb250YWluZXJFbCwgdGhpcy5jb250ZW50LmZpcnN0Q2hpbGQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHN0eWxlID0gdGhpcy4kcHJpbnRNYXJnaW5FbC5zdHlsZTtcbiAgICAgICAgc3R5bGUubGVmdCA9ICgodGhpcy5jaGFyYWN0ZXJXaWR0aCAqIHRoaXMuJHByaW50TWFyZ2luQ29sdW1uKSArIHRoaXMuJHBhZGRpbmcpICsgXCJweFwiO1xuICAgICAgICBzdHlsZS52aXNpYmlsaXR5ID0gdGhpcy4kc2hvd1ByaW50TWFyZ2luID8gXCJ2aXNpYmxlXCIgOiBcImhpZGRlblwiO1xuXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24gJiYgdGhpcy5zZXNzaW9uWyckd3JhcCddID09IC0xKVxuICAgICAgICAgICAgdGhpcy5hZGp1c3RXcmFwTGltaXQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSByb290IGVsZW1lbnQgY29udGFpbmluZyB0aGlzIHJlbmRlcmVyLlxuICAgICogQHJldHVybnMge0RPTUVsZW1lbnR9XG4gICAgKiovXG4gICAgZ2V0Q29udGFpbmVyRWxlbWVudCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGFpbmVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGVsZW1lbnQgdGhhdCB0aGUgbW91c2UgZXZlbnRzIGFyZSBhdHRhY2hlZCB0b1xuICAgICogQHJldHVybnMge0RPTUVsZW1lbnR9XG4gICAgKiovXG4gICAgZ2V0TW91c2VFdmVudFRhcmdldCgpOiBIVE1MRGl2RWxlbWVudCB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRlbnQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgZWxlbWVudCB0byB3aGljaCB0aGUgaGlkZGVuIHRleHQgYXJlYSBpcyBhZGRlZC5cbiAgICAqIEByZXR1cm5zIHtET01FbGVtZW50fVxuICAgICoqL1xuICAgIGdldFRleHRBcmVhQ29udGFpbmVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jb250YWluZXI7XG4gICAgfVxuXG4gICAgLy8gbW92ZSB0ZXh0IGlucHV0IG92ZXIgdGhlIGN1cnNvclxuICAgIC8vIHRoaXMgaXMgcmVxdWlyZWQgZm9yIGlPUyBhbmQgSU1FXG4gICAgJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCkge1xuICAgICAgICBpZiAoIXRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgY29uZmlnID0gdGhpcy5sYXllckNvbmZpZztcbiAgICAgICAgdmFyIHBvc1RvcCA9IHRoaXMuJGN1cnNvckxheWVyLiRwaXhlbFBvcy50b3A7XG4gICAgICAgIHZhciBwb3NMZWZ0ID0gdGhpcy4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zLmxlZnQ7XG4gICAgICAgIHBvc1RvcCAtPSBjb25maWcub2Zmc2V0O1xuXG4gICAgICAgIHZhciBoID0gdGhpcy5saW5lSGVpZ2h0O1xuICAgICAgICBpZiAocG9zVG9wIDwgMCB8fCBwb3NUb3AgPiBjb25maWcuaGVpZ2h0IC0gaClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgdyA9IHRoaXMuY2hhcmFjdGVyV2lkdGg7XG4gICAgICAgIGlmICh0aGlzLiRjb21wb3NpdGlvbikge1xuICAgICAgICAgICAgdmFyIHZhbCA9IHRoaXMudGV4dGFyZWEudmFsdWUucmVwbGFjZSgvXlxceDAxKy8sIFwiXCIpO1xuICAgICAgICAgICAgdyAqPSAodGhpcy5zZXNzaW9uLiRnZXRTdHJpbmdTY3JlZW5XaWR0aCh2YWwpWzBdICsgMik7XG4gICAgICAgICAgICBoICs9IDI7XG4gICAgICAgICAgICBwb3NUb3AgLT0gMTtcbiAgICAgICAgfVxuICAgICAgICBwb3NMZWZ0IC09IHRoaXMuc2Nyb2xsTGVmdDtcbiAgICAgICAgaWYgKHBvc0xlZnQgPiB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGggLSB3KVxuICAgICAgICAgICAgcG9zTGVmdCA9IHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCAtIHc7XG5cbiAgICAgICAgcG9zTGVmdCAtPSB0aGlzLnNjcm9sbEJhclYud2lkdGg7XG5cbiAgICAgICAgdGhpcy50ZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSBoICsgXCJweFwiO1xuICAgICAgICB0aGlzLnRleHRhcmVhLnN0eWxlLndpZHRoID0gdyArIFwicHhcIjtcbiAgICAgICAgdGhpcy50ZXh0YXJlYS5zdHlsZS5yaWdodCA9IE1hdGgubWF4KDAsIHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCAtIHBvc0xlZnQgLSB3KSArIFwicHhcIjtcbiAgICAgICAgdGhpcy50ZXh0YXJlYS5zdHlsZS5ib3R0b20gPSBNYXRoLm1heCgwLCB0aGlzLiRzaXplLmhlaWdodCAtIHBvc1RvcCAtIGgpICsgXCJweFwiO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFtSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgZmlyc3QgdmlzaWJsZSByb3cuXXs6ICNWaXJ0dWFsUmVuZGVyZXIuZ2V0Rmlyc3RWaXNpYmxlUm93fVxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRGaXJzdFZpc2libGVSb3coKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBmaXJzdCBmdWxseSB2aXNpYmxlIHJvdy4gXCJGdWxseVwiIGhlcmUgbWVhbnMgdGhhdCB0aGUgY2hhcmFjdGVycyBpbiB0aGUgcm93IGFyZSBub3QgdHJ1bmNhdGVkOyB0aGF0IHRoZSB0b3AgYW5kIHRoZSBib3R0b20gb2YgdGhlIHJvdyBhcmUgb24gdGhlIHNjcmVlbi5cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0Rmlyc3RGdWxseVZpc2libGVSb3coKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93ICsgKHRoaXMubGF5ZXJDb25maWcub2Zmc2V0ID09PSAwID8gMCA6IDEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBsYXN0IGZ1bGx5IHZpc2libGUgcm93LiBcIkZ1bGx5XCIgaGVyZSBtZWFucyB0aGF0IHRoZSBjaGFyYWN0ZXJzIGluIHRoZSByb3cgYXJlIG5vdCB0cnVuY2F0ZWQ7IHRoYXQgdGhlIHRvcCBhbmQgdGhlIGJvdHRvbSBvZiB0aGUgcm93IGFyZSBvbiB0aGUgc2NyZWVuLlxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRMYXN0RnVsbHlWaXNpYmxlUm93KCkge1xuICAgICAgICB2YXIgZmxpbnQgPSBNYXRoLmZsb29yKCh0aGlzLmxheWVyQ29uZmlnLmhlaWdodCArIHRoaXMubGF5ZXJDb25maWcub2Zmc2V0KSAvIHRoaXMubGF5ZXJDb25maWcubGluZUhlaWdodCk7XG4gICAgICAgIHJldHVybiB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93IC0gMSArIGZsaW50O1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFtSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbGFzdCB2aXNpYmxlIHJvdy5dezogI1ZpcnR1YWxSZW5kZXJlci5nZXRMYXN0VmlzaWJsZVJvd31cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0TGFzdFZpc2libGVSb3coKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxheWVyQ29uZmlnLmxhc3RSb3c7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZXRzIHRoZSBwYWRkaW5nIGZvciBhbGwgdGhlIGxheWVycy5cbiAgICAqIEBwYXJhbSB7bnVtYmVyfSBwYWRkaW5nIEEgbmV3IHBhZGRpbmcgdmFsdWUgKGluIHBpeGVscylcbiAgICAqKi9cbiAgICBzZXRQYWRkaW5nKHBhZGRpbmc6IG51bWJlcikge1xuICAgICAgICB0aGlzLiRwYWRkaW5nID0gcGFkZGluZztcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJG1hcmtlckZyb250LnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgIHRoaXMuJG1hcmtlckJhY2suc2V0UGFkZGluZyhwYWRkaW5nKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfRlVMTCk7XG4gICAgICAgIHRoaXMuJHVwZGF0ZVByaW50TWFyZ2luKCk7XG4gICAgfVxuXG4gICAgc2V0U2Nyb2xsTWFyZ2luKHRvcCwgYm90dG9tLCBsZWZ0LCByaWdodCkge1xuICAgICAgICB2YXIgc20gPSB0aGlzLnNjcm9sbE1hcmdpbjtcbiAgICAgICAgc20udG9wID0gdG9wIHwgMDtcbiAgICAgICAgc20uYm90dG9tID0gYm90dG9tIHwgMDtcbiAgICAgICAgc20ucmlnaHQgPSByaWdodCB8IDA7XG4gICAgICAgIHNtLmxlZnQgPSBsZWZ0IHwgMDtcbiAgICAgICAgc20udiA9IHNtLnRvcCArIHNtLmJvdHRvbTtcbiAgICAgICAgc20uaCA9IHNtLmxlZnQgKyBzbS5yaWdodDtcbiAgICAgICAgaWYgKHNtLnRvcCAmJiB0aGlzLnNjcm9sbFRvcCA8PSAwICYmIHRoaXMuc2Vzc2lvbilcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AoLXNtLnRvcCk7XG4gICAgICAgIHRoaXMudXBkYXRlRnVsbCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIgaXMgc2V0IHRvIGJlIGFsd2F5cyB2aXNpYmxlLlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRIU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSgpIHtcbiAgICAgICAgLy8gRklYTUVcbiAgICAgICAgcmV0dXJuIHRoaXMuJGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgd2hldGhlciB5b3Ugd2FudCB0byBzaG93IHRoZSBob3Jpem9udGFsIHNjcm9sbGJhciBvciBub3QuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbHdheXNWaXNpYmxlIFNldCB0byBgdHJ1ZWAgdG8gbWFrZSB0aGUgaG9yaXpvbnRhbCBzY3JvbGwgYmFyIHZpc2libGVcbiAgICAgKiovXG4gICAgc2V0SFNjcm9sbEJhckFsd2F5c1Zpc2libGUoYWx3YXlzVmlzaWJsZSkge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImhTY3JvbGxCYXJBbHdheXNWaXNpYmxlXCIsIGFsd2F5c1Zpc2libGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciB0aGUgdmVydGljYWwgc2Nyb2xsYmFyIGlzIHNldCB0byBiZSBhbHdheXMgdmlzaWJsZS5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgZ2V0VlNjcm9sbEJhckFsd2F5c1Zpc2libGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiR2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZGVudGlmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG8gc2hvdyB0aGUgdmVydGljYWwgc2Nyb2xsYmFyIG9yIG5vdC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFsd2F5c1Zpc2libGUgU2V0IHRvIGB0cnVlYCB0byBtYWtlIHRoZSB2ZXJ0aWNhbCBzY3JvbGwgYmFyIHZpc2libGVcbiAgICAgKi9cbiAgICBzZXRWU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZShhbHdheXNWaXNpYmxlKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwidlNjcm9sbEJhckFsd2F5c1Zpc2libGVcIiwgYWx3YXlzVmlzaWJsZSk7XG4gICAgfVxuXG4gICAgJHVwZGF0ZVNjcm9sbEJhclYoKSB7XG4gICAgICAgIHZhciBzY3JvbGxIZWlnaHQgPSB0aGlzLmxheWVyQ29uZmlnLm1heEhlaWdodDtcbiAgICAgICAgdmFyIHNjcm9sbGVySGVpZ2h0ID0gdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodDtcbiAgICAgICAgaWYgKCF0aGlzLiRtYXhMaW5lcyAmJiB0aGlzLiRzY3JvbGxQYXN0RW5kKSB7XG4gICAgICAgICAgICBzY3JvbGxIZWlnaHQgLT0gKHNjcm9sbGVySGVpZ2h0IC0gdGhpcy5saW5lSGVpZ2h0KSAqIHRoaXMuJHNjcm9sbFBhc3RFbmQ7XG4gICAgICAgICAgICBpZiAodGhpcy5zY3JvbGxUb3AgPiBzY3JvbGxIZWlnaHQgLSBzY3JvbGxlckhlaWdodCkge1xuICAgICAgICAgICAgICAgIHNjcm9sbEhlaWdodCA9IHRoaXMuc2Nyb2xsVG9wICsgc2Nyb2xsZXJIZWlnaHQ7XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJWLnNjcm9sbFRvcCA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zY3JvbGxCYXJWLnNldFNjcm9sbEhlaWdodChzY3JvbGxIZWlnaHQgKyB0aGlzLnNjcm9sbE1hcmdpbi52KTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJWLnNldFNjcm9sbFRvcCh0aGlzLnNjcm9sbFRvcCArIHRoaXMuc2Nyb2xsTWFyZ2luLnRvcCk7XG4gICAgfVxuXG4gICAgJHVwZGF0ZVNjcm9sbEJhckgoKSB7XG4gICAgICAgIHRoaXMuc2Nyb2xsQmFySC5zZXRTY3JvbGxXaWR0aCh0aGlzLmxheWVyQ29uZmlnLndpZHRoICsgMiAqIHRoaXMuJHBhZGRpbmcgKyB0aGlzLnNjcm9sbE1hcmdpbi5oKTtcbiAgICAgICAgdGhpcy5zY3JvbGxCYXJILnNldFNjcm9sbExlZnQodGhpcy5zY3JvbGxMZWZ0ICsgdGhpcy5zY3JvbGxNYXJnaW4ubGVmdCk7XG4gICAgfVxuXG4gICAgZnJlZXplKCkge1xuICAgICAgICB0aGlzLiRmcm96ZW4gPSB0cnVlO1xuICAgIH1cblxuICAgIHVuZnJlZXplKCkge1xuICAgICAgICB0aGlzLiRmcm96ZW4gPSBmYWxzZTtcbiAgICB9XG5cbiAgICAkcmVuZGVyQ2hhbmdlcyhjaGFuZ2VzLCBmb3JjZSkge1xuICAgICAgICBpZiAodGhpcy4kY2hhbmdlcykge1xuICAgICAgICAgICAgY2hhbmdlcyB8PSB0aGlzLiRjaGFuZ2VzO1xuICAgICAgICAgICAgdGhpcy4kY2hhbmdlcyA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCghdGhpcy5zZXNzaW9uIHx8ICF0aGlzLmNvbnRhaW5lci5vZmZzZXRXaWR0aCB8fCB0aGlzLiRmcm96ZW4pIHx8ICghY2hhbmdlcyAmJiAhZm9yY2UpKSB7XG4gICAgICAgICAgICB0aGlzLiRjaGFuZ2VzIHw9IGNoYW5nZXM7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuJHNpemUuJGRpcnR5KSB7XG4gICAgICAgICAgICB0aGlzLiRjaGFuZ2VzIHw9IGNoYW5nZXM7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vblJlc2l6ZSh0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXRoaXMubGluZUhlaWdodCkge1xuICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLmNoZWNrRm9yU2l6ZUNoYW5nZXMoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyB0aGlzLiRsb2dDaGFuZ2VzKGNoYW5nZXMpO1xuXG4gICAgICAgIHRoaXMuX3NpZ25hbChcImJlZm9yZVJlbmRlclwiKTtcbiAgICAgICAgdmFyIGNvbmZpZyA9IHRoaXMubGF5ZXJDb25maWc7XG4gICAgICAgIC8vIHRleHQsIHNjcm9sbGluZyBhbmQgcmVzaXplIGNoYW5nZXMgY2FuIGNhdXNlIHRoZSB2aWV3IHBvcnQgc2l6ZSB0byBjaGFuZ2VcbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfRlVMTCB8fFxuICAgICAgICAgICAgY2hhbmdlcyAmIENIQU5HRV9TSVpFIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX1RFWFQgfHxcbiAgICAgICAgICAgIGNoYW5nZXMgJiBDSEFOR0VfTElORVMgfHxcbiAgICAgICAgICAgIGNoYW5nZXMgJiBDSEFOR0VfU0NST0xMIHx8XG4gICAgICAgICAgICBjaGFuZ2VzICYgQ0hBTkdFX0hfU0NST0xMXG4gICAgICAgICkge1xuICAgICAgICAgICAgY2hhbmdlcyB8PSB0aGlzLiRjb21wdXRlTGF5ZXJDb25maWcoKTtcbiAgICAgICAgICAgIC8vIElmIGEgY2hhbmdlIGlzIG1hZGUgb2Zmc2NyZWVuIGFuZCB3cmFwTW9kZSBpcyBvbiwgdGhlbiB0aGUgb25zY3JlZW5cbiAgICAgICAgICAgIC8vIGxpbmVzIG1heSBoYXZlIGJlZW4gcHVzaGVkIGRvd24uIElmIHNvLCB0aGUgZmlyc3Qgc2NyZWVuIHJvdyB3aWxsIG5vdFxuICAgICAgICAgICAgLy8gaGF2ZSBjaGFuZ2VkLCBidXQgdGhlIGZpcnN0IGFjdHVhbCByb3cgd2lsbC4gSW4gdGhhdCBjYXNlLCBhZGp1c3QgXG4gICAgICAgICAgICAvLyBzY3JvbGxUb3Agc28gdGhhdCB0aGUgY3Vyc29yIGFuZCBvbnNjcmVlbiBjb250ZW50IHN0YXlzIGluIHRoZSBzYW1lIHBsYWNlLlxuICAgICAgICAgICAgaWYgKGNvbmZpZy5maXJzdFJvdyAhPSB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93ICYmIGNvbmZpZy5maXJzdFJvd1NjcmVlbiA9PSB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93U2NyZWVuKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxUb3AgPSB0aGlzLnNjcm9sbFRvcCArIChjb25maWcuZmlyc3RSb3cgLSB0aGlzLmxheWVyQ29uZmlnLmZpcnN0Um93KSAqIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgICAgICAgICBjaGFuZ2VzID0gY2hhbmdlcyB8IENIQU5HRV9TQ1JPTEw7XG4gICAgICAgICAgICAgICAgY2hhbmdlcyB8PSB0aGlzLiRjb21wdXRlTGF5ZXJDb25maWcoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbmZpZyA9IHRoaXMubGF5ZXJDb25maWc7XG4gICAgICAgICAgICAvLyB1cGRhdGUgc2Nyb2xsYmFyIGZpcnN0IHRvIG5vdCBsb3NlIHNjcm9sbCBwb3NpdGlvbiB3aGVuIGd1dHRlciBjYWxscyByZXNpemVcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVNjcm9sbEJhclYoKTtcbiAgICAgICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0hfU0NST0xMKVxuICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVNjcm9sbEJhckgoKTtcbiAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLmVsZW1lbnQuc3R5bGUubWFyZ2luVG9wID0gKC1jb25maWcub2Zmc2V0KSArIFwicHhcIjtcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zdHlsZS5tYXJnaW5Ub3AgPSAoLWNvbmZpZy5vZmZzZXQpICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLndpZHRoID0gY29uZmlnLndpZHRoICsgMiAqIHRoaXMuJHBhZGRpbmcgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUuaGVpZ2h0ID0gY29uZmlnLm1pbkhlaWdodCArIFwicHhcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGhvcml6b250YWwgc2Nyb2xsaW5nXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0hfU0NST0xMKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3R5bGUubWFyZ2luTGVmdCA9IC10aGlzLnNjcm9sbExlZnQgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbGVyLmNsYXNzTmFtZSA9IHRoaXMuc2Nyb2xsTGVmdCA8PSAwID8gXCJhY2Vfc2Nyb2xsZXJcIiA6IFwiYWNlX3Njcm9sbGVyIGFjZV9zY3JvbGwtbGVmdFwiO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZnVsbFxuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9GVUxMKSB7XG4gICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2hvd0d1dHRlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckJhY2sudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICAgICAgICAgIHRoaXMuJGhpZ2hsaWdodEd1dHRlckxpbmUgJiYgdGhpcy4kdXBkYXRlR3V0dGVyTGluZUhpZ2hsaWdodCgpO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiYWZ0ZXJSZW5kZXJcIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBzY3JvbGxpbmdcbiAgICAgICAgaWYgKGNoYW5nZXMgJiBDSEFOR0VfU0NST0xMKSB7XG4gICAgICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9URVhUIHx8IGNoYW5nZXMgJiBDSEFOR0VfTElORVMpXG4gICAgICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuJHRleHRMYXllci5zY3JvbGxMaW5lcyhjb25maWcpO1xuXG4gICAgICAgICAgICBpZiAodGhpcy4kc2hvd0d1dHRlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckJhY2sudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnVwZGF0ZShjb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kaGlnaGxpZ2h0R3V0dGVyTGluZSAmJiB0aGlzLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0KCk7XG4gICAgICAgICAgICB0aGlzLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiYWZ0ZXJSZW5kZXJcIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2hhbmdlcyAmIENIQU5HRV9URVhUKSB7XG4gICAgICAgICAgICB0aGlzLiR0ZXh0TGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2hvd0d1dHRlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0xJTkVTKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdXBkYXRlTGluZXMoKSB8fCAoY2hhbmdlcyAmIENIQU5HRV9HVVRURVIpICYmIHRoaXMuJHNob3dHdXR0ZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2hhbmdlcyAmIENIQU5HRV9URVhUIHx8IGNoYW5nZXMgJiBDSEFOR0VfR1VUVEVSKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2hvd0d1dHRlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUoY29uZmlnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjaGFuZ2VzICYgQ0hBTkdFX0NVUlNPUikge1xuICAgICAgICAgICAgdGhpcy4kY3Vyc29yTGF5ZXIudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgICAgICB0aGlzLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgICAgICAgICAgdGhpcy4kaGlnaGxpZ2h0R3V0dGVyTGluZSAmJiB0aGlzLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0KCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2hhbmdlcyAmIChDSEFOR0VfTUFSS0VSIHwgQ0hBTkdFX01BUktFUl9GUk9OVCkpIHtcbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckZyb250LnVwZGF0ZShjb25maWcpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoYW5nZXMgJiAoQ0hBTkdFX01BUktFUiB8IENIQU5HRV9NQVJLRVJfQkFDSykpIHtcbiAgICAgICAgICAgIHRoaXMuJG1hcmtlckJhY2sudXBkYXRlKGNvbmZpZyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9zaWduYWwoXCJhZnRlclJlbmRlclwiKTtcbiAgICB9XG5cbiAgICAkYXV0b3NpemUoKSB7XG4gICAgICAgIHZhciBoZWlnaHQgPSB0aGlzLnNlc3Npb24uZ2V0U2NyZWVuTGVuZ3RoKCkgKiB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBtYXhIZWlnaHQgPSB0aGlzLiRtYXhMaW5lcyAqIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgdmFyIGRlc2lyZWRIZWlnaHQgPSBNYXRoLm1heChcbiAgICAgICAgICAgICh0aGlzLiRtaW5MaW5lcyB8fCAxKSAqIHRoaXMubGluZUhlaWdodCxcbiAgICAgICAgICAgIE1hdGgubWluKG1heEhlaWdodCwgaGVpZ2h0KVxuICAgICAgICApICsgdGhpcy5zY3JvbGxNYXJnaW4udiArICh0aGlzLiRleHRyYUhlaWdodCB8fCAwKTtcbiAgICAgICAgdmFyIHZTY3JvbGwgPSBoZWlnaHQgPiBtYXhIZWlnaHQ7XG5cbiAgICAgICAgaWYgKGRlc2lyZWRIZWlnaHQgIT0gdGhpcy5kZXNpcmVkSGVpZ2h0IHx8XG4gICAgICAgICAgICB0aGlzLiRzaXplLmhlaWdodCAhPSB0aGlzLmRlc2lyZWRIZWlnaHQgfHwgdlNjcm9sbCAhPSB0aGlzLiR2U2Nyb2xsKSB7XG4gICAgICAgICAgICBpZiAodlNjcm9sbCAhPSB0aGlzLiR2U2Nyb2xsKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kdlNjcm9sbCA9IHZTY3JvbGw7XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxCYXJWLnNldFZpc2libGUodlNjcm9sbCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB3ID0gdGhpcy5jb250YWluZXIuY2xpZW50V2lkdGg7XG4gICAgICAgICAgICB0aGlzLmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBkZXNpcmVkSGVpZ2h0ICsgXCJweFwiO1xuICAgICAgICAgICAgdGhpcy4kdXBkYXRlQ2FjaGVkU2l6ZSh0cnVlLCB0aGlzLiRndXR0ZXJXaWR0aCwgdywgZGVzaXJlZEhlaWdodCk7XG4gICAgICAgICAgICAvLyB0aGlzLiRsb29wLmNoYW5nZXMgPSAwO1xuICAgICAgICAgICAgdGhpcy5kZXNpcmVkSGVpZ2h0ID0gZGVzaXJlZEhlaWdodDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgICRjb21wdXRlTGF5ZXJDb25maWcoKSB7XG5cbiAgICAgICAgaWYgKHRoaXMuJG1heExpbmVzICYmIHRoaXMubGluZUhlaWdodCA+IDEpIHtcbiAgICAgICAgICAgIHRoaXMuJGF1dG9zaXplKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgdmFyIHNpemUgPSB0aGlzLiRzaXplO1xuXG4gICAgICAgIHZhciBoaWRlU2Nyb2xsYmFycyA9IHNpemUuaGVpZ2h0IDw9IDIgKiB0aGlzLmxpbmVIZWlnaHQ7XG4gICAgICAgIHZhciBzY3JlZW5MaW5lcyA9IHRoaXMuc2Vzc2lvbi5nZXRTY3JlZW5MZW5ndGgoKTtcbiAgICAgICAgdmFyIG1heEhlaWdodCA9IHNjcmVlbkxpbmVzICogdGhpcy5saW5lSGVpZ2h0O1xuXG4gICAgICAgIHZhciBvZmZzZXQgPSB0aGlzLnNjcm9sbFRvcCAlIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgdmFyIG1pbkhlaWdodCA9IHNpemUuc2Nyb2xsZXJIZWlnaHQgKyB0aGlzLmxpbmVIZWlnaHQ7XG5cbiAgICAgICAgdmFyIGxvbmdlc3RMaW5lID0gdGhpcy4kZ2V0TG9uZ2VzdExpbmUoKTtcblxuICAgICAgICB2YXIgaG9yaXpTY3JvbGwgPSAhaGlkZVNjcm9sbGJhcnMgJiYgKHRoaXMuJGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlIHx8XG4gICAgICAgICAgICBzaXplLnNjcm9sbGVyV2lkdGggLSBsb25nZXN0TGluZSAtIDIgKiB0aGlzLiRwYWRkaW5nIDwgMCk7XG5cbiAgICAgICAgdmFyIGhTY3JvbGxDaGFuZ2VkID0gdGhpcy4kaG9yaXpTY3JvbGwgIT09IGhvcml6U2Nyb2xsO1xuICAgICAgICBpZiAoaFNjcm9sbENoYW5nZWQpIHtcbiAgICAgICAgICAgIHRoaXMuJGhvcml6U2Nyb2xsID0gaG9yaXpTY3JvbGw7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhckguc2V0VmlzaWJsZShob3JpelNjcm9sbCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuJG1heExpbmVzICYmIHRoaXMuJHNjcm9sbFBhc3RFbmQpIHtcbiAgICAgICAgICAgIG1heEhlaWdodCArPSAoc2l6ZS5zY3JvbGxlckhlaWdodCAtIHRoaXMubGluZUhlaWdodCkgKiB0aGlzLiRzY3JvbGxQYXN0RW5kO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHZTY3JvbGwgPSAhaGlkZVNjcm9sbGJhcnMgJiYgKHRoaXMuJHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlIHx8XG4gICAgICAgICAgICBzaXplLnNjcm9sbGVySGVpZ2h0IC0gbWF4SGVpZ2h0IDwgMCk7XG4gICAgICAgIHZhciB2U2Nyb2xsQ2hhbmdlZCA9IHRoaXMuJHZTY3JvbGwgIT09IHZTY3JvbGw7XG4gICAgICAgIGlmICh2U2Nyb2xsQ2hhbmdlZCkge1xuICAgICAgICAgICAgdGhpcy4kdlNjcm9sbCA9IHZTY3JvbGw7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbEJhclYuc2V0VmlzaWJsZSh2U2Nyb2xsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AoTWF0aC5tYXgoLXRoaXMuc2Nyb2xsTWFyZ2luLnRvcCxcbiAgICAgICAgICAgIE1hdGgubWluKHRoaXMuc2Nyb2xsVG9wLCBtYXhIZWlnaHQgLSBzaXplLnNjcm9sbGVySGVpZ2h0ICsgdGhpcy5zY3JvbGxNYXJnaW4uYm90dG9tKSkpO1xuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxMZWZ0KE1hdGgubWF4KC10aGlzLnNjcm9sbE1hcmdpbi5sZWZ0LCBNYXRoLm1pbih0aGlzLnNjcm9sbExlZnQsXG4gICAgICAgICAgICBsb25nZXN0TGluZSArIDIgKiB0aGlzLiRwYWRkaW5nIC0gc2l6ZS5zY3JvbGxlcldpZHRoICsgdGhpcy5zY3JvbGxNYXJnaW4ucmlnaHQpKSk7XG5cbiAgICAgICAgdmFyIGxpbmVDb3VudCA9IE1hdGguY2VpbChtaW5IZWlnaHQgLyB0aGlzLmxpbmVIZWlnaHQpIC0gMTtcbiAgICAgICAgdmFyIGZpcnN0Um93ID0gTWF0aC5tYXgoMCwgTWF0aC5yb3VuZCgodGhpcy5zY3JvbGxUb3AgLSBvZmZzZXQpIC8gdGhpcy5saW5lSGVpZ2h0KSk7XG4gICAgICAgIHZhciBsYXN0Um93ID0gZmlyc3RSb3cgKyBsaW5lQ291bnQ7XG5cbiAgICAgICAgLy8gTWFwIGxpbmVzIG9uIHRoZSBzY3JlZW4gdG8gbGluZXMgaW4gdGhlIGRvY3VtZW50LlxuICAgICAgICB2YXIgZmlyc3RSb3dTY3JlZW4sIGZpcnN0Um93SGVpZ2h0O1xuICAgICAgICB2YXIgbGluZUhlaWdodCA9IHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgZmlyc3RSb3cgPSBzZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRSb3coZmlyc3RSb3csIDApO1xuXG4gICAgICAgIC8vIENoZWNrIGlmIGZpcnN0Um93IGlzIGluc2lkZSBvZiBhIGZvbGRMaW5lLiBJZiB0cnVlLCB0aGVuIHVzZSB0aGUgZmlyc3RcbiAgICAgICAgLy8gcm93IG9mIHRoZSBmb2xkTGluZS5cbiAgICAgICAgdmFyIGZvbGRMaW5lID0gc2Vzc2lvbi5nZXRGb2xkTGluZShmaXJzdFJvdyk7XG4gICAgICAgIGlmIChmb2xkTGluZSkge1xuICAgICAgICAgICAgZmlyc3RSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgIH1cblxuICAgICAgICBmaXJzdFJvd1NjcmVlbiA9IHNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblJvdyhmaXJzdFJvdywgMCk7XG4gICAgICAgIGZpcnN0Um93SGVpZ2h0ID0gc2Vzc2lvbi5nZXRSb3dMZW5ndGgoZmlyc3RSb3cpICogbGluZUhlaWdodDtcblxuICAgICAgICBsYXN0Um93ID0gTWF0aC5taW4oc2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50Um93KGxhc3RSb3csIDApLCBzZXNzaW9uLmdldExlbmd0aCgpIC0gMSk7XG4gICAgICAgIG1pbkhlaWdodCA9IHNpemUuc2Nyb2xsZXJIZWlnaHQgKyBzZXNzaW9uLmdldFJvd0xlbmd0aChsYXN0Um93KSAqIGxpbmVIZWlnaHQgK1xuICAgICAgICAgICAgZmlyc3RSb3dIZWlnaHQ7XG5cbiAgICAgICAgb2Zmc2V0ID0gdGhpcy5zY3JvbGxUb3AgLSBmaXJzdFJvd1NjcmVlbiAqIGxpbmVIZWlnaHQ7XG5cbiAgICAgICAgdmFyIGNoYW5nZXMgPSAwO1xuICAgICAgICBpZiAodGhpcy5sYXllckNvbmZpZy53aWR0aCAhPSBsb25nZXN0TGluZSlcbiAgICAgICAgICAgIGNoYW5nZXMgPSBDSEFOR0VfSF9TQ1JPTEw7XG4gICAgICAgIC8vIEhvcml6b250YWwgc2Nyb2xsYmFyIHZpc2liaWxpdHkgbWF5IGhhdmUgY2hhbmdlZCwgd2hpY2ggY2hhbmdlc1xuICAgICAgICAvLyB0aGUgY2xpZW50IGhlaWdodCBvZiB0aGUgc2Nyb2xsZXJcbiAgICAgICAgaWYgKGhTY3JvbGxDaGFuZ2VkIHx8IHZTY3JvbGxDaGFuZ2VkKSB7XG4gICAgICAgICAgICBjaGFuZ2VzID0gdGhpcy4kdXBkYXRlQ2FjaGVkU2l6ZSh0cnVlLCB0aGlzLmd1dHRlcldpZHRoLCBzaXplLndpZHRoLCBzaXplLmhlaWdodCk7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJzY3JvbGxiYXJWaXNpYmlsaXR5Q2hhbmdlZFwiKTtcbiAgICAgICAgICAgIGlmICh2U2Nyb2xsQ2hhbmdlZClcbiAgICAgICAgICAgICAgICBsb25nZXN0TGluZSA9IHRoaXMuJGdldExvbmdlc3RMaW5lKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmxheWVyQ29uZmlnID0ge1xuICAgICAgICAgICAgd2lkdGg6IGxvbmdlc3RMaW5lLFxuICAgICAgICAgICAgcGFkZGluZzogdGhpcy4kcGFkZGluZyxcbiAgICAgICAgICAgIGZpcnN0Um93OiBmaXJzdFJvdyxcbiAgICAgICAgICAgIGZpcnN0Um93U2NyZWVuOiBmaXJzdFJvd1NjcmVlbixcbiAgICAgICAgICAgIGxhc3RSb3c6IGxhc3RSb3csXG4gICAgICAgICAgICBsaW5lSGVpZ2h0OiBsaW5lSGVpZ2h0LFxuICAgICAgICAgICAgY2hhcmFjdGVyV2lkdGg6IHRoaXMuY2hhcmFjdGVyV2lkdGgsXG4gICAgICAgICAgICBtaW5IZWlnaHQ6IG1pbkhlaWdodCxcbiAgICAgICAgICAgIG1heEhlaWdodDogbWF4SGVpZ2h0LFxuICAgICAgICAgICAgb2Zmc2V0OiBvZmZzZXQsXG4gICAgICAgICAgICBndXR0ZXJPZmZzZXQ6IE1hdGgubWF4KDAsIE1hdGguY2VpbCgob2Zmc2V0ICsgc2l6ZS5oZWlnaHQgLSBzaXplLnNjcm9sbGVySGVpZ2h0KSAvIGxpbmVIZWlnaHQpKSxcbiAgICAgICAgICAgIGhlaWdodDogdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodFxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBjaGFuZ2VzO1xuICAgIH1cblxuICAgICR1cGRhdGVMaW5lcygpIHtcbiAgICAgICAgdmFyIGZpcnN0Um93ID0gdGhpcy4kY2hhbmdlZExpbmVzLmZpcnN0Um93O1xuICAgICAgICB2YXIgbGFzdFJvdyA9IHRoaXMuJGNoYW5nZWRMaW5lcy5sYXN0Um93O1xuICAgICAgICB0aGlzLiRjaGFuZ2VkTGluZXMgPSBudWxsO1xuXG4gICAgICAgIHZhciBsYXllckNvbmZpZyA9IHRoaXMubGF5ZXJDb25maWc7XG5cbiAgICAgICAgaWYgKGZpcnN0Um93ID4gbGF5ZXJDb25maWcubGFzdFJvdyArIDEpIHsgcmV0dXJuOyB9XG4gICAgICAgIGlmIChsYXN0Um93IDwgbGF5ZXJDb25maWcuZmlyc3RSb3cpIHsgcmV0dXJuOyB9XG5cbiAgICAgICAgLy8gaWYgdGhlIGxhc3Qgcm93IGlzIHVua25vd24gLT4gcmVkcmF3IGV2ZXJ5dGhpbmdcbiAgICAgICAgaWYgKGxhc3RSb3cgPT09IEluZmluaXR5KSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kc2hvd0d1dHRlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMYXllci51cGRhdGUobGF5ZXJDb25maWcpO1xuICAgICAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZShsYXllckNvbmZpZyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBlbHNlIHVwZGF0ZSBvbmx5IHRoZSBjaGFuZ2VkIHJvd3NcbiAgICAgICAgdGhpcy4kdGV4dExheWVyLnVwZGF0ZUxpbmVzKGxheWVyQ29uZmlnLCBmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgICRnZXRMb25nZXN0TGluZSgpOiBudW1iZXIge1xuICAgICAgICB2YXIgY2hhckNvdW50ID0gdGhpcy5zZXNzaW9uLmdldFNjcmVlbldpZHRoKCk7XG4gICAgICAgIGlmICh0aGlzLnNob3dJbnZpc2libGVzICYmICF0aGlzLnNlc3Npb24uJHVzZVdyYXBNb2RlKVxuICAgICAgICAgICAgY2hhckNvdW50ICs9IDE7XG5cbiAgICAgICAgcmV0dXJuIE1hdGgubWF4KHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCAtIDIgKiB0aGlzLiRwYWRkaW5nLCBNYXRoLnJvdW5kKGNoYXJDb3VudCAqIHRoaXMuY2hhcmFjdGVyV2lkdGgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBTY2hlZHVsZXMgYW4gdXBkYXRlIHRvIGFsbCB0aGUgZnJvbnQgbWFya2VycyBpbiB0aGUgZG9jdW1lbnQuXG4gICAgKiovXG4gICAgdXBkYXRlRnJvbnRNYXJrZXJzKCkge1xuICAgICAgICB0aGlzLiRtYXJrZXJGcm9udC5zZXRNYXJrZXJzKHRoaXMuc2Vzc2lvbi5nZXRNYXJrZXJzKHRydWUpKTtcbiAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfTUFSS0VSX0ZST05UKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBTY2hlZHVsZXMgYW4gdXBkYXRlIHRvIGFsbCB0aGUgYmFjayBtYXJrZXJzIGluIHRoZSBkb2N1bWVudC5cbiAgICAqKi9cbiAgICB1cGRhdGVCYWNrTWFya2VycygpIHtcbiAgICAgICAgdGhpcy4kbWFya2VyQmFjay5zZXRNYXJrZXJzKHRoaXMuc2Vzc2lvbi5nZXRNYXJrZXJzKGZhbHNlKSk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX01BUktFUl9CQUNLKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBEZXByZWNhdGVkOyAobW92ZWQgdG8gW1tFZGl0U2Vzc2lvbl1dKVxuICAgICogQGRlcHJlY2F0ZWRcbiAgICAqKi9cbiAgICBwcml2YXRlIGFkZEd1dHRlckRlY29yYXRpb24ocm93LCBjbGFzc05hbWUpIHtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuYWRkR3V0dGVyRGVjb3JhdGlvbihyb3csIGNsYXNzTmFtZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBEZXByZWNhdGVkOyAobW92ZWQgdG8gW1tFZGl0U2Vzc2lvbl1dKVxuICAgICogQGRlcHJlY2F0ZWRcbiAgICAqKi9cbiAgICBwcml2YXRlIHJlbW92ZUd1dHRlckRlY29yYXRpb24ocm93LCBjbGFzc05hbWUpIHtcbiAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIucmVtb3ZlR3V0dGVyRGVjb3JhdGlvbihyb3csIGNsYXNzTmFtZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmVkcmF3IGJyZWFrcG9pbnRzLlxuICAgICoqL1xuICAgIHVwZGF0ZUJyZWFrcG9pbnRzKCkge1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9HVVRURVIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFNldHMgYW5ub3RhdGlvbnMgZm9yIHRoZSBndXR0ZXIuXG4gICAgKiBAcGFyYW0ge0FycmF5fSBhbm5vdGF0aW9ucyBBbiBhcnJheSBjb250YWluaW5nIGFubm90YXRpb25zXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBzZXRBbm5vdGF0aW9ucyhhbm5vdGF0aW9ucykge1xuICAgICAgICB0aGlzLiRndXR0ZXJMYXllci5zZXRBbm5vdGF0aW9ucyhhbm5vdGF0aW9ucyk7XG4gICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUoQ0hBTkdFX0dVVFRFUik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogVXBkYXRlcyB0aGUgY3Vyc29yIGljb24uXG4gICAgKiovXG4gICAgdXBkYXRlQ3Vyc29yKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKENIQU5HRV9DVVJTT1IpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIEhpZGVzIHRoZSBjdXJzb3IgaWNvbi5cbiAgICAqKi9cbiAgICBoaWRlQ3Vyc29yKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRjdXJzb3JMYXllci5oaWRlQ3Vyc29yKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogU2hvd3MgdGhlIGN1cnNvciBpY29uLlxuICAgICoqL1xuICAgIHNob3dDdXJzb3IoKSB7XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLnNob3dDdXJzb3IoKTtcbiAgICB9XG5cbiAgICBzY3JvbGxTZWxlY3Rpb25JbnRvVmlldyhhbmNob3IsIGxlYWQsIG9mZnNldD8pIHtcbiAgICAgICAgLy8gZmlyc3Qgc2Nyb2xsIGFuY2hvciBpbnRvIHZpZXcgdGhlbiBzY3JvbGwgbGVhZCBpbnRvIHZpZXdcbiAgICAgICAgdGhpcy5zY3JvbGxDdXJzb3JJbnRvVmlldyhhbmNob3IsIG9mZnNldCk7XG4gICAgICAgIHRoaXMuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcobGVhZCwgb2Zmc2V0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBTY3JvbGxzIHRoZSBjdXJzb3IgaW50byB0aGUgZmlyc3QgdmlzaWJpbGUgYXJlYSBvZiB0aGUgZWRpdG9yXG4gICAgKiovXG4gICAgc2Nyb2xsQ3Vyc29ySW50b1ZpZXcoY3Vyc29yPywgb2Zmc2V0PywgJHZpZXdNYXJnaW4/KSB7XG4gICAgICAgIC8vIHRoZSBlZGl0b3IgaXMgbm90IHZpc2libGVcbiAgICAgICAgaWYgKHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQgPT09IDApXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuJGN1cnNvckxheWVyLmdldFBpeGVsUG9zaXRpb24oY3Vyc29yKTtcblxuICAgICAgICB2YXIgbGVmdCA9IHBvcy5sZWZ0O1xuICAgICAgICB2YXIgdG9wID0gcG9zLnRvcDtcblxuICAgICAgICB2YXIgdG9wTWFyZ2luID0gJHZpZXdNYXJnaW4gJiYgJHZpZXdNYXJnaW4udG9wIHx8IDA7XG4gICAgICAgIHZhciBib3R0b21NYXJnaW4gPSAkdmlld01hcmdpbiAmJiAkdmlld01hcmdpbi5ib3R0b20gfHwgMDtcblxuICAgICAgICB2YXIgc2Nyb2xsVG9wID0gdGhpcy4kc2Nyb2xsQW5pbWF0aW9uID8gdGhpcy5zZXNzaW9uLmdldFNjcm9sbFRvcCgpIDogdGhpcy5zY3JvbGxUb3A7XG5cbiAgICAgICAgaWYgKHNjcm9sbFRvcCArIHRvcE1hcmdpbiA+IHRvcCkge1xuICAgICAgICAgICAgaWYgKG9mZnNldClcbiAgICAgICAgICAgICAgICB0b3AgLT0gb2Zmc2V0ICogdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodDtcbiAgICAgICAgICAgIGlmICh0b3AgPT09IDApXG4gICAgICAgICAgICAgICAgdG9wID0gLXRoaXMuc2Nyb2xsTWFyZ2luLnRvcDtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3AodG9wKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzY3JvbGxUb3AgKyB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0IC0gYm90dG9tTWFyZ2luIDwgdG9wICsgdGhpcy5saW5lSGVpZ2h0KSB7XG4gICAgICAgICAgICBpZiAob2Zmc2V0KVxuICAgICAgICAgICAgICAgIHRvcCArPSBvZmZzZXQgKiB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0O1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcCh0b3AgKyB0aGlzLmxpbmVIZWlnaHQgLSB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzY3JvbGxMZWZ0ID0gdGhpcy5zY3JvbGxMZWZ0O1xuXG4gICAgICAgIGlmIChzY3JvbGxMZWZ0ID4gbGVmdCkge1xuICAgICAgICAgICAgaWYgKGxlZnQgPCB0aGlzLiRwYWRkaW5nICsgMiAqIHRoaXMubGF5ZXJDb25maWcuY2hhcmFjdGVyV2lkdGgpXG4gICAgICAgICAgICAgICAgbGVmdCA9IC10aGlzLnNjcm9sbE1hcmdpbi5sZWZ0O1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQobGVmdCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoc2Nyb2xsTGVmdCArIHRoaXMuJHNpemUuc2Nyb2xsZXJXaWR0aCA8IGxlZnQgKyB0aGlzLmNoYXJhY3RlcldpZHRoKSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsTGVmdChNYXRoLnJvdW5kKGxlZnQgKyB0aGlzLmNoYXJhY3RlcldpZHRoIC0gdGhpcy4kc2l6ZS5zY3JvbGxlcldpZHRoKSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoc2Nyb2xsTGVmdCA8PSB0aGlzLiRwYWRkaW5nICYmIGxlZnQgLSBzY3JvbGxMZWZ0IDwgdGhpcy5jaGFyYWN0ZXJXaWR0aCkge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQoMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIHs6RWRpdFNlc3Npb24uZ2V0U2Nyb2xsVG9wfVxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZ2V0U2Nyb2xsVG9wXG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIGdldFNjcm9sbFRvcCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFNjcm9sbFRvcCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogezpFZGl0U2Vzc2lvbi5nZXRTY3JvbGxMZWZ0fVxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZ2V0U2Nyb2xsTGVmdFxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBnZXRTY3JvbGxMZWZ0KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGZpcnN0IHZpc2libGUgcm93LCByZWdhcmRsZXNzIG9mIHdoZXRoZXIgaXQncyBmdWxseSB2aXNpYmxlIG9yIG5vdC5cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0U2Nyb2xsVG9wUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcm9sbFRvcCAvIHRoaXMubGluZUhlaWdodDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBsYXN0IHZpc2libGUgcm93LCByZWdhcmRsZXNzIG9mIHdoZXRoZXIgaXQncyBmdWxseSB2aXNpYmxlIG9yIG5vdC5cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgZ2V0U2Nyb2xsQm90dG9tUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiBNYXRoLm1heCgwLCBNYXRoLmZsb29yKCh0aGlzLnNjcm9sbFRvcCArIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHQpIC8gdGhpcy5saW5lSGVpZ2h0KSAtIDEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogR3JhY2VmdWxseSBzY3JvbGxzIGZyb20gdGhlIHRvcCBvZiB0aGUgZWRpdG9yIHRvIHRoZSByb3cgaW5kaWNhdGVkLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBBIHJvdyBpZFxuICAgICpcbiAgICAqXG4gICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5zZXRTY3JvbGxUb3BcbiAgICAqKi9cbiAgICBzY3JvbGxUb1Jvdyhyb3c6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKHJvdyAqIHRoaXMubGluZUhlaWdodCk7XG4gICAgfVxuXG4gICAgYWxpZ25DdXJzb3IoY3Vyc29yLCBhbGlnbm1lbnQpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBjdXJzb3IgPT0gXCJudW1iZXJcIilcbiAgICAgICAgICAgIGN1cnNvciA9IHsgcm93OiBjdXJzb3IsIGNvbHVtbjogMCB9O1xuXG4gICAgICAgIHZhciBwb3MgPSB0aGlzLiRjdXJzb3JMYXllci5nZXRQaXhlbFBvc2l0aW9uKGN1cnNvcik7XG4gICAgICAgIHZhciBoID0gdGhpcy4kc2l6ZS5zY3JvbGxlckhlaWdodCAtIHRoaXMubGluZUhlaWdodDtcbiAgICAgICAgdmFyIG9mZnNldCA9IHBvcy50b3AgLSBoICogKGFsaWdubWVudCB8fCAwKTtcblxuICAgICAgICB0aGlzLnNlc3Npb24uc2V0U2Nyb2xsVG9wKG9mZnNldCk7XG4gICAgICAgIHJldHVybiBvZmZzZXQ7XG4gICAgfVxuXG4gICAgJGNhbGNTdGVwcyhmcm9tVmFsdWU6IG51bWJlciwgdG9WYWx1ZTogbnVtYmVyKTogbnVtYmVyW10ge1xuICAgICAgICB2YXIgaTogbnVtYmVyID0gMDtcbiAgICAgICAgdmFyIGw6IG51bWJlciA9IHRoaXMuU1RFUFM7XG4gICAgICAgIHZhciBzdGVwczogbnVtYmVyW10gPSBbXTtcblxuICAgICAgICB2YXIgZnVuYyA9IGZ1bmN0aW9uKHQ6IG51bWJlciwgeF9taW46IG51bWJlciwgZHg6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgICAgICByZXR1cm4gZHggKiAoTWF0aC5wb3codCAtIDEsIDMpICsgMSkgKyB4X21pbjtcbiAgICAgICAgfTtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbDsgKytpKSB7XG4gICAgICAgICAgICBzdGVwcy5wdXNoKGZ1bmMoaSAvIHRoaXMuU1RFUFMsIGZyb21WYWx1ZSwgdG9WYWx1ZSAtIGZyb21WYWx1ZSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHN0ZXBzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdyYWNlZnVsbHkgc2Nyb2xscyB0aGUgZWRpdG9yIHRvIHRoZSByb3cgaW5kaWNhdGVkLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsaW5lIEEgbGluZSBudW1iZXJcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGNlbnRlciBJZiBgdHJ1ZWAsIGNlbnRlcnMgdGhlIGVkaXRvciB0aGUgdG8gaW5kaWNhdGVkIGxpbmVcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFuaW1hdGUgSWYgYHRydWVgIGFuaW1hdGVzIHNjcm9sbGluZ1xuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBhZnRlciB0aGUgYW5pbWF0aW9uIGhhcyBmaW5pc2hlZFxuICAgICAqL1xuICAgIHNjcm9sbFRvTGluZShsaW5lOiBudW1iZXIsIGNlbnRlcjogYm9vbGVhbiwgYW5pbWF0ZTogYm9vbGVhbiwgY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuJGN1cnNvckxheWVyLmdldFBpeGVsUG9zaXRpb24oeyByb3c6IGxpbmUsIGNvbHVtbjogMCB9KTtcbiAgICAgICAgdmFyIG9mZnNldCA9IHBvcy50b3A7XG4gICAgICAgIGlmIChjZW50ZXIpIHtcbiAgICAgICAgICAgIG9mZnNldCAtPSB0aGlzLiRzaXplLnNjcm9sbGVySGVpZ2h0IC8gMjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpbml0aWFsU2Nyb2xsID0gdGhpcy5zY3JvbGxUb3A7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTY3JvbGxUb3Aob2Zmc2V0KTtcbiAgICAgICAgaWYgKGFuaW1hdGUgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLmFuaW1hdGVTY3JvbGxpbmcoaW5pdGlhbFNjcm9sbCwgY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYW5pbWF0ZVNjcm9sbGluZyhmcm9tVmFsdWU6IG51bWJlciwgY2FsbGJhY2s/KSB7XG4gICAgICAgIHZhciB0b1ZhbHVlID0gdGhpcy5zY3JvbGxUb3A7XG4gICAgICAgIGlmICghdGhpcy4kYW5pbWF0ZWRTY3JvbGwpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuXG4gICAgICAgIGlmIChmcm9tVmFsdWUgPT0gdG9WYWx1ZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBpZiAodGhpcy4kc2Nyb2xsQW5pbWF0aW9uKSB7XG4gICAgICAgICAgICB2YXIgb2xkU3RlcHMgPSB0aGlzLiRzY3JvbGxBbmltYXRpb24uc3RlcHM7XG4gICAgICAgICAgICBpZiAob2xkU3RlcHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgZnJvbVZhbHVlID0gb2xkU3RlcHNbMF07XG4gICAgICAgICAgICAgICAgaWYgKGZyb21WYWx1ZSA9PSB0b1ZhbHVlKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc3RlcHMgPSBfc2VsZi4kY2FsY1N0ZXBzKGZyb21WYWx1ZSwgdG9WYWx1ZSk7XG4gICAgICAgIHRoaXMuJHNjcm9sbEFuaW1hdGlvbiA9IHsgZnJvbTogZnJvbVZhbHVlLCB0bzogdG9WYWx1ZSwgc3RlcHM6IHN0ZXBzIH07XG5cbiAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLiR0aW1lcik7XG5cbiAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxUb3Aoc3RlcHMuc2hpZnQoKSk7XG4gICAgICAgIC8vIHRyaWNrIHNlc3Npb24gdG8gdGhpbmsgaXQncyBhbHJlYWR5IHNjcm9sbGVkIHRvIG5vdCBsb29zZSB0b1ZhbHVlXG4gICAgICAgIF9zZWxmLnNlc3Npb24uJHNjcm9sbFRvcCA9IHRvVmFsdWU7XG4gICAgICAgIHRoaXMuJHRpbWVyID0gc2V0SW50ZXJ2YWwoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoc3RlcHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxUb3Aoc3RlcHMuc2hpZnQoKSk7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi4kc2Nyb2xsVG9wID0gdG9WYWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodG9WYWx1ZSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi4kc2Nyb2xsVG9wID0gLTE7XG4gICAgICAgICAgICAgICAgX3NlbGYuc2Vzc2lvbi5zZXRTY3JvbGxUb3AodG9WYWx1ZSk7XG4gICAgICAgICAgICAgICAgdG9WYWx1ZSA9IG51bGw7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGRvIHRoaXMgb24gc2VwYXJhdGUgc3RlcCB0byBub3QgZ2V0IHNwdXJpb3VzIHNjcm9sbCBldmVudCBmcm9tIHNjcm9sbGJhclxuICAgICAgICAgICAgICAgIF9zZWxmLiR0aW1lciA9IGNsZWFySW50ZXJ2YWwoX3NlbGYuJHRpbWVyKTtcbiAgICAgICAgICAgICAgICBfc2VsZi4kc2Nyb2xsQW5pbWF0aW9uID0gbnVsbDtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayAmJiBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCAxMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xscyB0aGUgZWRpdG9yIHRvIHRoZSB5IHBpeGVsIGluZGljYXRlZC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc2Nyb2xsVG9wIFRoZSBwb3NpdGlvbiB0byBzY3JvbGwgdG9cbiAgICAgKi9cbiAgICBzY3JvbGxUb1koc2Nyb2xsVG9wOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgLy8gYWZ0ZXIgY2FsbGluZyBzY3JvbGxCYXIuc2V0U2Nyb2xsVG9wXG4gICAgICAgIC8vIHNjcm9sbGJhciBzZW5kcyB1cyBldmVudCB3aXRoIHNhbWUgc2Nyb2xsVG9wLiBpZ25vcmUgaXRcbiAgICAgICAgaWYgKHRoaXMuc2Nyb2xsVG9wICE9PSBzY3JvbGxUb3ApIHtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsVG9wID0gc2Nyb2xsVG9wO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfU0NST0xMKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdGhlIGVkaXRvciBhY3Jvc3MgdGhlIHgtYXhpcyB0byB0aGUgcGl4ZWwgaW5kaWNhdGVkLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JvbGxMZWZ0IFRoZSBwb3NpdGlvbiB0byBzY3JvbGwgdG9cbiAgICAgKiovXG4gICAgc2Nyb2xsVG9YKHNjcm9sbExlZnQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5zY3JvbGxMZWZ0ICE9PSBzY3JvbGxMZWZ0KSB7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbExlZnQgPSBzY3JvbGxMZWZ0O1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZShDSEFOR0VfSF9TQ1JPTEwpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTY3JvbGxzIHRoZSBlZGl0b3IgYWNyb3NzIGJvdGggeC0gYW5kIHktYXhlcy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSB4IFRoZSB4IHZhbHVlIHRvIHNjcm9sbCB0b1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IHkgVGhlIHkgdmFsdWUgdG8gc2Nyb2xsIHRvXG4gICAgKiovXG4gICAgc2Nyb2xsVG8oeDogbnVtYmVyLCB5OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcCh5KTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQoeSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTY3JvbGxzIHRoZSBlZGl0b3IgYWNyb3NzIGJvdGggeC0gYW5kIHktYXhlcy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkZWx0YVggVGhlIHggdmFsdWUgdG8gc2Nyb2xsIGJ5XG4gICAgKiBAcGFyYW0ge051bWJlcn0gZGVsdGFZIFRoZSB5IHZhbHVlIHRvIHNjcm9sbCBieVxuICAgICoqL1xuICAgIHNjcm9sbEJ5KGRlbHRhWDogbnVtYmVyLCBkZWx0YVk6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBkZWx0YVkgJiYgdGhpcy5zZXNzaW9uLnNldFNjcm9sbFRvcCh0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkgKyBkZWx0YVkpO1xuICAgICAgICBkZWx0YVggJiYgdGhpcy5zZXNzaW9uLnNldFNjcm9sbExlZnQodGhpcy5zZXNzaW9uLmdldFNjcm9sbExlZnQoKSArIGRlbHRhWCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB5b3UgY2FuIHN0aWxsIHNjcm9sbCBieSBlaXRoZXIgcGFyYW1ldGVyOyBpbiBvdGhlciB3b3JkcywgeW91IGhhdmVuJ3QgcmVhY2hlZCB0aGUgZW5kIG9mIHRoZSBmaWxlIG9yIGxpbmUuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZGVsdGFYIFRoZSB4IHZhbHVlIHRvIHNjcm9sbCBieVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlbHRhWSBUaGUgeSB2YWx1ZSB0byBzY3JvbGwgYnlcbiAgICAqXG4gICAgKlxuICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgKiovXG4gICAgaXNTY3JvbGxhYmxlQnkoZGVsdGFYOiBudW1iZXIsIGRlbHRhWTogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIGlmIChkZWx0YVkgPCAwICYmIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSA+PSAxIC0gdGhpcy5zY3JvbGxNYXJnaW4udG9wKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGlmIChkZWx0YVkgPiAwICYmIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSArIHRoaXMuJHNpemUuc2Nyb2xsZXJIZWlnaHRcbiAgICAgICAgICAgIC0gdGhpcy5sYXllckNvbmZpZy5tYXhIZWlnaHQgPCAtMSArIHRoaXMuc2Nyb2xsTWFyZ2luLmJvdHRvbSlcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBpZiAoZGVsdGFYIDwgMCAmJiB0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpID49IDEgLSB0aGlzLnNjcm9sbE1hcmdpbi5sZWZ0KVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGlmIChkZWx0YVggPiAwICYmIHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxMZWZ0KCkgKyB0aGlzLiRzaXplLnNjcm9sbGVyV2lkdGhcbiAgICAgICAgICAgIC0gdGhpcy5sYXllckNvbmZpZy53aWR0aCA8IC0xICsgdGhpcy5zY3JvbGxNYXJnaW4ucmlnaHQpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBwaXhlbFRvU2NyZWVuQ29vcmRpbmF0ZXMoeDogbnVtYmVyLCB5OiBudW1iZXIpIHtcbiAgICAgICAgdmFyIGNhbnZhc1BvcyA9IHRoaXMuc2Nyb2xsZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICAgICAgdmFyIG9mZnNldCA9ICh4ICsgdGhpcy5zY3JvbGxMZWZ0IC0gY2FudmFzUG9zLmxlZnQgLSB0aGlzLiRwYWRkaW5nKSAvIHRoaXMuY2hhcmFjdGVyV2lkdGg7XG4gICAgICAgIHZhciByb3cgPSBNYXRoLmZsb29yKCh5ICsgdGhpcy5zY3JvbGxUb3AgLSBjYW52YXNQb3MudG9wKSAvIHRoaXMubGluZUhlaWdodCk7XG4gICAgICAgIHZhciBjb2wgPSBNYXRoLnJvdW5kKG9mZnNldCk7XG5cbiAgICAgICAgcmV0dXJuIHsgcm93OiByb3csIGNvbHVtbjogY29sLCBzaWRlOiBvZmZzZXQgLSBjb2wgPiAwID8gMSA6IC0xIH07XG4gICAgfVxuXG4gICAgc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXMoY2xpZW50WDogbnVtYmVyLCBjbGllbnRZOiBudW1iZXIpIHtcbiAgICAgICAgdmFyIGNhbnZhc1BvcyA9IHRoaXMuc2Nyb2xsZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICAgICAgdmFyIGNvbHVtbiA9IE1hdGgucm91bmQoKGNsaWVudFggKyB0aGlzLnNjcm9sbExlZnQgLSBjYW52YXNQb3MubGVmdCAtIHRoaXMuJHBhZGRpbmcpIC8gdGhpcy5jaGFyYWN0ZXJXaWR0aCk7XG5cbiAgICAgICAgdmFyIHJvdyA9IChjbGllbnRZICsgdGhpcy5zY3JvbGxUb3AgLSBjYW52YXNQb3MudG9wKSAvIHRoaXMubGluZUhlaWdodDtcblxuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihyb3csIE1hdGgubWF4KGNvbHVtbiwgMCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgYHBhZ2VYYCBhbmQgYHBhZ2VZYCBjb29yZGluYXRlcyBvZiB0aGUgZG9jdW1lbnQgcG9zaXRpb24uXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSBkb2N1bWVudCByb3cgcG9zaXRpb25cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGRvY3VtZW50IGNvbHVtbiBwb3NpdGlvblxuICAgICogQHJldHVybnMge09iamVjdH1cbiAgICAqKi9cbiAgICB0ZXh0VG9TY3JlZW5Db29yZGluYXRlcyhyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiB7IHBhZ2VYOiBudW1iZXI7IHBhZ2VZOiBudW1iZXIgfSB7XG4gICAgICAgIHZhciBjYW52YXNQb3MgPSB0aGlzLnNjcm9sbGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICB2YXIgcG9zID0gdGhpcy5zZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihyb3csIGNvbHVtbik7XG5cbiAgICAgICAgdmFyIHggPSB0aGlzLiRwYWRkaW5nICsgTWF0aC5yb3VuZChwb3MuY29sdW1uICogdGhpcy5jaGFyYWN0ZXJXaWR0aCk7XG4gICAgICAgIHZhciB5ID0gcG9zLnJvdyAqIHRoaXMubGluZUhlaWdodDtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcGFnZVg6IGNhbnZhc1Bvcy5sZWZ0ICsgeCAtIHRoaXMuc2Nyb2xsTGVmdCxcbiAgICAgICAgICAgIHBhZ2VZOiBjYW52YXNQb3MudG9wICsgeSAtIHRoaXMuc2Nyb2xsVG9wXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogRm9jdXNlcyB0aGUgY3VycmVudCBjb250YWluZXIuXG4gICAgKiovXG4gICAgdmlzdWFsaXplRm9jdXMoKSB7XG4gICAgICAgIGRvbS5hZGRDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgXCJhY2VfZm9jdXNcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogQmx1cnMgdGhlIGN1cnJlbnQgY29udGFpbmVyLlxuICAgICoqL1xuICAgIHZpc3VhbGl6ZUJsdXIoKSB7XG4gICAgICAgIGRvbS5yZW1vdmVDc3NDbGFzcyh0aGlzLmNvbnRhaW5lciwgXCJhY2VfZm9jdXNcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBzaG93Q29tcG9zaXRpb25cbiAgICAgKiBAcGFyYW0gcG9zaXRpb25cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHNob3dDb21wb3NpdGlvbihwb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSkge1xuICAgICAgICBpZiAoIXRoaXMuJGNvbXBvc2l0aW9uKVxuICAgICAgICAgICAgdGhpcy4kY29tcG9zaXRpb24gPSB7XG4gICAgICAgICAgICAgICAga2VlcFRleHRBcmVhQXRDdXJzb3I6IHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yLFxuICAgICAgICAgICAgICAgIGNzc1RleHQ6IHRoaXMudGV4dGFyZWEuc3R5bGUuY3NzVGV4dFxuICAgICAgICAgICAgfTtcblxuICAgICAgICB0aGlzLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IHRydWU7XG4gICAgICAgIGRvbS5hZGRDc3NDbGFzcyh0aGlzLnRleHRhcmVhLCBcImFjZV9jb21wb3NpdGlvblwiKTtcbiAgICAgICAgdGhpcy50ZXh0YXJlYS5zdHlsZS5jc3NUZXh0ID0gXCJcIjtcbiAgICAgICAgdGhpcy4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBBIHN0cmluZyBvZiB0ZXh0IHRvIHVzZVxuICAgICAqXG4gICAgICogU2V0cyB0aGUgaW5uZXIgdGV4dCBvZiB0aGUgY3VycmVudCBjb21wb3NpdGlvbiB0byBgdGV4dGAuXG4gICAgICovXG4gICAgc2V0Q29tcG9zaXRpb25UZXh0KHRleHQ/OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgLy8gVE9ETzogV2h5IGlzIHRoZSBwYXJhbWV0ZXIgbm90IHVzZWQ/XG4gICAgICAgIHRoaXMuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSGlkZXMgdGhlIGN1cnJlbnQgY29tcG9zaXRpb24uXG4gICAgICovXG4gICAgaGlkZUNvbXBvc2l0aW9uKCkge1xuICAgICAgICBpZiAoIXRoaXMuJGNvbXBvc2l0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBkb20ucmVtb3ZlQ3NzQ2xhc3ModGhpcy50ZXh0YXJlYSwgXCJhY2VfY29tcG9zaXRpb25cIik7XG4gICAgICAgIHRoaXMuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0gdGhpcy4kY29tcG9zaXRpb24ua2VlcFRleHRBcmVhQXRDdXJzb3I7XG4gICAgICAgIHRoaXMudGV4dGFyZWEuc3R5bGUuY3NzVGV4dCA9IHRoaXMuJGNvbXBvc2l0aW9uLmNzc1RleHQ7XG4gICAgICAgIHRoaXMuJGNvbXBvc2l0aW9uID0gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBbU2V0cyBhIG5ldyB0aGVtZSBmb3IgdGhlIGVkaXRvci4gYHRoZW1lYCBzaG91bGQgZXhpc3QsIGFuZCBiZSBhIGRpcmVjdG9yeSBwYXRoLCBsaWtlIGBhY2UvdGhlbWUvdGV4dG1hdGVgLl17OiAjVmlydHVhbFJlbmRlcmVyLnNldFRoZW1lfVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0aGVtZSBUaGUgcGF0aCB0byBhIHRoZW1lXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2Igb3B0aW9uYWwgY2FsbGJhY2tcbiAgICAgKi9cbiAgICBzZXRUaGVtZSh0aGVtZTogc3RyaW5nLCBjYj86ICgpID0+IHZvaWQpOiB2b2lkIHtcbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy4kdGhlbWVJZCA9IHRoZW1lO1xuICAgICAgICBfc2VsZi5fZGlzcGF0Y2hFdmVudCgndGhlbWVDaGFuZ2UnLCB7IHRoZW1lOiB0aGVtZSB9KTtcblxuICAgICAgICBpZiAoIXRoZW1lIHx8IHR5cGVvZiB0aGVtZSA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICB2YXIgbW9kdWxlTmFtZSA9IHRoZW1lIHx8IHRoaXMuJG9wdGlvbnMudGhlbWUuaW5pdGlhbFZhbHVlO1xuICAgICAgICAgICAgY29uZmlnLmxvYWRNb2R1bGUoW1widGhlbWVcIiwgbW9kdWxlTmFtZV0sIGFmdGVyTG9hZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBhZnRlckxvYWQodGhlbWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gYWZ0ZXJMb2FkKG1vZHVsZSkge1xuICAgICAgICAgICAgaWYgKF9zZWxmLiR0aGVtZUlkICE9IHRoZW1lKVxuICAgICAgICAgICAgICAgIHJldHVybiBjYiAmJiBjYigpO1xuICAgICAgICAgICAgaWYgKCFtb2R1bGUuY3NzQ2xhc3MpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgZG9tLmltcG9ydENzc1N0cmluZyhcbiAgICAgICAgICAgICAgICBtb2R1bGUuY3NzVGV4dCxcbiAgICAgICAgICAgICAgICBtb2R1bGUuY3NzQ2xhc3MsXG4gICAgICAgICAgICAgICAgX3NlbGYuY29udGFpbmVyLm93bmVyRG9jdW1lbnRcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIGlmIChfc2VsZi50aGVtZSlcbiAgICAgICAgICAgICAgICBkb20ucmVtb3ZlQ3NzQ2xhc3MoX3NlbGYuY29udGFpbmVyLCBfc2VsZi50aGVtZS5jc3NDbGFzcyk7XG5cbiAgICAgICAgICAgIHZhciBwYWRkaW5nID0gXCJwYWRkaW5nXCIgaW4gbW9kdWxlID8gbW9kdWxlLnBhZGRpbmcgOiBcInBhZGRpbmdcIiBpbiAoX3NlbGYudGhlbWUgfHwge30pID8gNCA6IF9zZWxmLiRwYWRkaW5nO1xuXG4gICAgICAgICAgICBpZiAoX3NlbGYuJHBhZGRpbmcgJiYgcGFkZGluZyAhPSBfc2VsZi4kcGFkZGluZykge1xuICAgICAgICAgICAgICAgIF9zZWxmLnNldFBhZGRpbmcocGFkZGluZyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHRoaXMgaXMga2VwdCBvbmx5IGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuICAgICAgICAgICAgX3NlbGYuJHRoZW1lID0gbW9kdWxlLmNzc0NsYXNzO1xuXG4gICAgICAgICAgICBfc2VsZi50aGVtZSA9IG1vZHVsZTtcbiAgICAgICAgICAgIGRvbS5hZGRDc3NDbGFzcyhfc2VsZi5jb250YWluZXIsIG1vZHVsZS5jc3NDbGFzcyk7XG4gICAgICAgICAgICBkb20uc2V0Q3NzQ2xhc3MoX3NlbGYuY29udGFpbmVyLCBcImFjZV9kYXJrXCIsIG1vZHVsZS5pc0RhcmspO1xuXG4gICAgICAgICAgICAvLyBmb3JjZSByZS1tZWFzdXJlIG9mIHRoZSBndXR0ZXIgd2lkdGhcbiAgICAgICAgICAgIGlmIChfc2VsZi4kc2l6ZSkge1xuICAgICAgICAgICAgICAgIF9zZWxmLiRzaXplLndpZHRoID0gMDtcbiAgICAgICAgICAgICAgICBfc2VsZi4kdXBkYXRlU2l6ZUFzeW5jKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIF9zZWxmLl9kaXNwYXRjaEV2ZW50KCd0aGVtZUxvYWRlZCcsIHsgdGhlbWU6IG1vZHVsZSB9KTtcbiAgICAgICAgICAgIGNiICYmIGNiKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBbUmV0dXJucyB0aGUgcGF0aCBvZiB0aGUgY3VycmVudCB0aGVtZS5dezogI1ZpcnR1YWxSZW5kZXJlci5nZXRUaGVtZX1cbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAqL1xuICAgIGdldFRoZW1lKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLiR0aGVtZUlkO1xuICAgIH1cblxuICAgIC8vIE1ldGhvZHMgYWxsb3dzIHRvIGFkZCAvIHJlbW92ZSBDU1MgY2xhc3NuYW1lcyB0byB0aGUgZWRpdG9yIGVsZW1lbnQuXG4gICAgLy8gVGhpcyBmZWF0dXJlIGNhbiBiZSB1c2VkIGJ5IHBsdWctaW5zIHRvIHByb3ZpZGUgYSB2aXN1YWwgaW5kaWNhdGlvbiBvZlxuICAgIC8vIGEgY2VydGFpbiBtb2RlIHRoYXQgZWRpdG9yIGlzIGluLlxuXG4gICAgLyoqXG4gICAgICogW0FkZHMgYSBuZXcgY2xhc3MsIGBzdHlsZWAsIHRvIHRoZSBlZGl0b3IuXXs6ICNWaXJ0dWFsUmVuZGVyZXIuc2V0U3R5bGV9XG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHN0eWxlIEEgY2xhc3MgbmFtZVxuICAgICAqXG4gICAgICovXG4gICAgc2V0U3R5bGUoc3R5bGU6IHN0cmluZywgaW5jbHVkZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgZG9tLnNldENzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBzdHlsZSwgaW5jbHVkZSAhPT0gZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFtSZW1vdmVzIHRoZSBjbGFzcyBgc3R5bGVgIGZyb20gdGhlIGVkaXRvci5dezogI1ZpcnR1YWxSZW5kZXJlci51bnNldFN0eWxlfVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHlsZSBBIGNsYXNzIG5hbWVcbiAgICAgKi9cbiAgICB1bnNldFN0eWxlKHN0eWxlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgZG9tLnJlbW92ZUNzc0NsYXNzKHRoaXMuY29udGFpbmVyLCBzdHlsZSk7XG4gICAgfVxuXG4gICAgc2V0Q3Vyc29yU3R5bGUoc3R5bGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5jb250ZW50LnN0eWxlLmN1cnNvciAhPSBzdHlsZSkge1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLmN1cnNvciA9IHN0eWxlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGN1cnNvclN0eWxlIEEgY3NzIGN1cnNvciBzdHlsZVxuICAgICAqL1xuICAgIHNldE1vdXNlQ3Vyc29yKGN1cnNvclN0eWxlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5jb250ZW50LnN0eWxlLmN1cnNvciA9IGN1cnNvclN0eWxlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERlc3Ryb3lzIHRoZSB0ZXh0IGFuZCBjdXJzb3IgbGF5ZXJzIGZvciB0aGlzIHJlbmRlcmVyLlxuICAgICAqL1xuICAgIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJHRleHRMYXllci5kZXN0cm95KCk7XG4gICAgICAgIHRoaXMuJGN1cnNvckxheWVyLmRlc3Ryb3koKTtcbiAgICB9XG59XG5cbmNvbmZpZy5kZWZpbmVPcHRpb25zKFZpcnR1YWxSZW5kZXJlci5wcm90b3R5cGUsIFwicmVuZGVyZXJcIiwge1xuICAgIGFuaW1hdGVkU2Nyb2xsOiB7IGluaXRpYWxWYWx1ZTogZmFsc2UgfSxcbiAgICBzaG93SW52aXNpYmxlczoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyLnNldFNob3dJbnZpc2libGVzKHZhbHVlKSlcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX1RFWFQpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBzaG93UHJpbnRNYXJnaW46IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbigpIHsgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBwcmludE1hcmdpbkNvbHVtbjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKCkgeyB0aGlzLiR1cGRhdGVQcmludE1hcmdpbigpOyB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IDgwXG4gICAgfSxcbiAgICBwcmludE1hcmdpbjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWwgPT0gXCJudW1iZXJcIilcbiAgICAgICAgICAgICAgICB0aGlzLiRwcmludE1hcmdpbkNvbHVtbiA9IHZhbDtcbiAgICAgICAgICAgIHRoaXMuJHNob3dQcmludE1hcmdpbiA9ICEhdmFsO1xuICAgICAgICAgICAgdGhpcy4kdXBkYXRlUHJpbnRNYXJnaW4oKTtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiRzaG93UHJpbnRNYXJnaW4gJiYgdGhpcy4kcHJpbnRNYXJnaW5Db2x1bW47XG4gICAgICAgIH1cbiAgICB9LFxuICAgIHNob3dHdXR0ZXI6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG93KSB7XG4gICAgICAgICAgICB0aGlzLiRndXR0ZXIuc3R5bGUuZGlzcGxheSA9IHNob3cgPyBcImJsb2NrXCIgOiBcIm5vbmVcIjtcbiAgICAgICAgICAgIHRoaXMuJGxvb3Auc2NoZWR1bGUodGhpcy5DSEFOR0VfRlVMTCk7XG4gICAgICAgICAgICB0aGlzLm9uR3V0dGVyUmVzaXplKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgZmFkZUZvbGRXaWRnZXRzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykge1xuICAgICAgICAgICAgZG9tLnNldENzc0NsYXNzKHRoaXMuJGd1dHRlciwgXCJhY2VfZmFkZS1mb2xkLXdpZGdldHNcIiwgc2hvdyk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIHNob3dGb2xkV2lkZ2V0czoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3cpIHsgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0U2hvd0ZvbGRXaWRnZXRzKHNob3cpIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgc2hvd0xpbmVOdW1iZXJzOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdykge1xuICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGF5ZXIuc2V0U2hvd0xpbmVOdW1iZXJzKHNob3cpO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9HVVRURVIpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGRpc3BsYXlJbmRlbnRHdWlkZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG93KSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdGV4dExheWVyLnNldERpc3BsYXlJbmRlbnRHdWlkZXMoc2hvdykpXG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9URVhUKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBoaWdobGlnaHRHdXR0ZXJMaW5lOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdWxkSGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuJGd1dHRlckxpbmVIaWdobGlnaHQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0ID0gZG9tLmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICAgICAgdGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodC5jbGFzc05hbWUgPSBcImFjZV9ndXR0ZXItYWN0aXZlLWxpbmVcIjtcbiAgICAgICAgICAgICAgICB0aGlzLiRndXR0ZXIuYXBwZW5kQ2hpbGQodGhpcy4kZ3V0dGVyTGluZUhpZ2hsaWdodCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLiRndXR0ZXJMaW5lSGlnaGxpZ2h0LnN0eWxlLmRpc3BsYXkgPSBzaG91bGRIaWdobGlnaHQgPyBcIlwiIDogXCJub25lXCI7XG4gICAgICAgICAgICAvLyBpZiBjdXJzb3JsYXllciBoYXZlIG5ldmVyIGJlZW4gdXBkYXRlZCB0aGVyZSdzIG5vdGhpbmcgb24gc2NyZWVuIHRvIHVwZGF0ZVxuICAgICAgICAgICAgaWYgKHRoaXMuJGN1cnNvckxheWVyLiRwaXhlbFBvcylcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVHdXR0ZXJMaW5lSGlnaGxpZ2h0KCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2UsXG4gICAgICAgIHZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgaWYgKCF0aGlzLiRoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSB8fCAhdGhpcy4kaG9yaXpTY3JvbGwpXG4gICAgICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9TQ1JPTEwpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICB2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgaWYgKCF0aGlzLiR2U2Nyb2xsQmFyQWx3YXlzVmlzaWJsZSB8fCAhdGhpcy4kdlNjcm9sbClcbiAgICAgICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX1NDUk9MTCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIGZvbnRTaXplOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2l6ZSkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBzaXplID09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICAgICAgc2l6ZSA9IHNpemUgKyBcInB4XCI7XG4gICAgICAgICAgICB0aGlzLmNvbnRhaW5lci5zdHlsZS5mb250U2l6ZSA9IHNpemU7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUZvbnRTaXplKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogMTJcbiAgICB9LFxuICAgIGZvbnRGYW1pbHk6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnRhaW5lci5zdHlsZS5mb250RmFtaWx5ID0gbmFtZTtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlRm9udFNpemUoKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgbWF4TGluZXM6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlRnVsbCgpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBtaW5MaW5lczoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgdGhpcy51cGRhdGVGdWxsKCk7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIHNjcm9sbFBhc3RFbmQ6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHZhbCA9ICt2YWwgfHwgMDtcbiAgICAgICAgICAgIGlmICh0aGlzLiRzY3JvbGxQYXN0RW5kID09IHZhbClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB0aGlzLiRzY3JvbGxQYXN0RW5kID0gdmFsO1xuICAgICAgICAgICAgdGhpcy4kbG9vcC5zY2hlZHVsZSh0aGlzLkNIQU5HRV9TQ1JPTEwpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IDAsXG4gICAgICAgIGhhbmRsZXNTZXQ6IHRydWVcbiAgICB9LFxuICAgIGZpeGVkV2lkdGhHdXR0ZXI6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHRoaXMuJGd1dHRlckxheWVyLiRmaXhlZFdpZHRoID0gISF2YWw7XG4gICAgICAgICAgICB0aGlzLiRsb29wLnNjaGVkdWxlKHRoaXMuQ0hBTkdFX0dVVFRFUik7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIHRoZW1lOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7IHRoaXMuc2V0VGhlbWUodmFsKSB9LFxuICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy4kdGhlbWVJZCB8fCB0aGlzLnRoZW1lOyB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IFwiLi90aGVtZS90ZXh0bWF0ZVwiLFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfVxufSk7XG4iXX0=